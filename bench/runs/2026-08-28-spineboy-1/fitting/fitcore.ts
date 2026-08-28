/**
 * Per-frame pose fitter (§8.1): coarse-to-fine, full-range scans, pair scans,
 * multi-start, neighbour seeding. Objective renders through the repo's own
 * rasteriser into a crop window aligned to the frames' pixel grid.
 */
import { Physics, Skeleton } from '@esotericsoftware/spine-core';
import { Plate } from '../../../../tools/plate.ts';
import { piecesOf, renderFrame, unionBounds, type Posable, type Viewport } from '../../../../src/render.ts';
import { BG, TOL, sidecar, type Box } from './lib.ts';
import { applyPose, setAttachment, type PoseVec } from './pose.ts';

const vw = sidecar().viewport;

export interface Window { px0: number; py0: number; px1: number; py1: number }

/** crop viewport whose pixels align exactly with frame pixels px0..px1 (at level 1) */
export function cropViewport(w: Window, k: number): Viewport {
  const scale = vw.scale / k;
  const minX = vw.x + w.px0 / vw.scale;
  const maxX = vw.x + (w.px1 + 1) / vw.scale;
  const maxY = vw.y + (vw.pixelHeight - w.py0) / vw.scale;
  const minY = vw.y + (vw.pixelHeight - (w.py1 + 1)) / vw.scale;
  return {
    minX, minY, maxX, maxY, scale,
    width: Math.max(1, Math.round(((w.px1 + 1 - w.px0) / k))),
    height: Math.max(1, Math.round(((w.py1 + 1 - w.py0) / k))),
  };
}

/** reference crop at level k: rgb triplets box-averaged + ink counts */
export interface RefCrop { w: number; h: number; rgb: Float32Array; ink: Uint8Array; inkCount: number }
export function refCrop(frame: Plate, win: Window, k: number): RefCrop {
  const w = Math.max(1, Math.round((win.px1 + 1 - win.px0) / k));
  const h = Math.max(1, Math.round((win.py1 + 1 - win.py0) / k));
  const rgb = new Float32Array(w * h * 3);
  const cnt = new Float32Array(w * h);
  for (let py = win.py0; py <= win.py1; py++) {
    if (py < 0 || py >= frame.height) continue;
    const by = Math.min(h - 1, Math.floor((py - win.py0) / k));
    for (let px = win.px0; px <= win.px1; px++) {
      if (px < 0 || px >= frame.width) continue;
      const bx = Math.min(w - 1, Math.floor((px - win.px0) / k));
      const i = (py * frame.width + px) * 4;
      const o = by * w + bx;
      rgb[o * 3] += frame.data[i];
      rgb[o * 3 + 1] += frame.data[i + 1];
      rgb[o * 3 + 2] += frame.data[i + 2];
      cnt[o]++;
    }
  }
  const ink = new Uint8Array(w * h);
  let inkCount = 0;
  for (let o = 0; o < w * h; o++) {
    const c = Math.max(1, cnt[o]);
    rgb[o * 3] /= c; rgb[o * 3 + 1] /= c; rgb[o * 3 + 2] /= c;
    if (
      Math.abs(rgb[o * 3] - BG[0]) > TOL || Math.abs(rgb[o * 3 + 1] - BG[1]) > TOL || Math.abs(rgb[o * 3 + 2] - BG[2]) > TOL
    ) { ink[o] = 1; inkCount++; }
  }
  return { w, h, rgb, ink, inkCount };
}

export interface EvalCtx {
  posable: Posable;
  skeleton: Skeleton;
  win: Window;
  crops: Map<number, RefCrop>; // by level
  /** optional per-pixel weights aligned with crops (by level); default 1 */
  weights?: Map<number, Float32Array>;
  attachments?: Record<string, string | null>;
  /** extra penalty terms, e.g. gauge priors: (pose) => number */
  prior?: (pose: PoseVec) => number;
  /** out-of-window world-extent charge weight (default 1e-5) */
  outPenalty?: number;
}

/** world box of the window, for out-of-window ink charge */
function winWorld(win: Window): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: vw.x + win.px0 / vw.scale,
    x1: vw.x + (win.px1 + 1) / vw.scale,
    y1: vw.y + (vw.pixelHeight - win.py0) / vw.scale,
    y0: vw.y + (vw.pixelHeight - (win.py1 + 1)) / vw.scale,
  };
}

export function evalPose(ctx: EvalCtx, pose: PoseVec, k: number): number {
  const { skeleton, posable } = ctx;
  applyPose(skeleton, pose);
  if (ctx.attachments) {
    for (const [slot, a] of Object.entries(ctx.attachments)) setAttachment(skeleton, slot, a);
  }
  const pieces = piecesOf(skeleton);
  // out-of-window charge on world extent (cliff's second entrance)
  const wb = winWorld(ctx.win);
  const b = unionBounds([[{ index: 0, time: 0, pieces }]]);
  let pen = 0;
  const margin = 60; // world units of grace (quad corners run past drawn art)
  pen += Math.max(0, wb.x0 - b.minX - margin) ** 2;
  pen += Math.max(0, b.maxX - wb.x1 - margin) ** 2;
  pen += Math.max(0, wb.y0 - b.minY - margin) ** 2;
  pen += Math.max(0, b.maxY - wb.y1 - margin) ** 2;
  pen *= ctx.outPenalty ?? 1e-5;

  const ref = ctx.crops.get(k)!;
  const cand = renderFrame({ index: 0, time: 0, pieces }, posable.pages, cropViewport(ctx.win, k), [BG[0], BG[1], BG[2], 255]);
  let sum = 0, candInk = 0;
  const wts = ctx.weights?.get(k);
  const n = Math.min(ref.w * ref.h, cand.width * cand.height);
  for (let o = 0; o < n; o++) {
    const ci = o * 4;
    const cInk =
      Math.abs(cand.data[ci] - BG[0]) > TOL || Math.abs(cand.data[ci + 1] - BG[1]) > TOL || Math.abs(cand.data[ci + 2] - BG[2]) > TOL;
    if (cInk) candInk++;
    if (cInk || ref.ink[o]) {
      const dr = cand.data[ci] - ref.rgb[o * 3], dg = cand.data[ci + 1] - ref.rgb[o * 3 + 1], db = cand.data[ci + 2] - ref.rgb[o * 3 + 2];
      sum += (wts ? wts[o] : 1) * (dr * dr + dg * dg + db * db);
    }
  }
  let err = sum / (255 * 255) / Math.max(ref.inkCount, 1);
  // part-absence guard, expressed at this level's own resolution
  if (candInk < 0.4 * ref.inkCount) err += (0.4 * ref.inkCount - candInk) / Math.max(ref.inkCount, 1);
  err += pen;
  if (ctx.prior) err += ctx.prior(pose);
  return err;
}

export interface KnobDef { key: string; lo: number; hi: number; coarse: number }

export function scan(ctx: EvalCtx, pose: PoseVec, knob: KnobDef, k: number, step?: number): number {
  const s = step ?? knob.coarse;
  let bv = pose[knob.key] ?? 0;
  let be = evalPose(ctx, pose, k);
  for (let v = knob.lo; v <= knob.hi + 1e-9; v += s) {
    if (Math.abs(v - bv) < 1e-9) continue;
    const p = { ...pose, [knob.key]: v };
    const e = evalPose(ctx, p, k);
    if (e < be) { be = e; bv = v; }
  }
  pose[knob.key] = bv;
  return be;
}

export function pairScan(
  ctx: EvalCtx, pose: PoseVec, a: KnobDef, b: KnobDef, k: number, stepA?: number, stepB?: number,
): number {
  const sa = stepA ?? a.coarse, sb = stepB ?? b.coarse;
  let bva = pose[a.key] ?? 0, bvb = pose[b.key] ?? 0;
  let be = evalPose(ctx, pose, k);
  for (let va = a.lo; va <= a.hi + 1e-9; va += sa) {
    for (let vb = b.lo; vb <= b.hi + 1e-9; vb += sb) {
      const p = { ...pose, [a.key]: va, [b.key]: vb };
      const e = evalPose(ctx, p, k);
      if (e < be) { be = e; bva = va; bvb = vb; }
    }
  }
  pose[a.key] = bva; pose[b.key] = bvb;
  return be;
}

/** local refine: for each knob, hill-descend with shrinking steps around current value */
export function refine(ctx: EvalCtx, pose: PoseVec, knobs: KnobDef[], k: number, steps: number[]): number {
  let be = evalPose(ctx, pose, k);
  for (const st of steps) {
    let improved = true;
    let guard = 0;
    while (improved && guard++ < 6) {
      improved = false;
      for (const knob of knobs) {
        const cur = pose[knob.key] ?? 0;
        for (const v of [cur - st, cur + st]) {
          if (v < knob.lo || v > knob.hi) continue;
          const p = { ...pose, [knob.key]: v };
          const e = evalPose(ctx, p, k);
          if (e < be - 1e-7) { be = e; pose[knob.key] = v; improved = true; }
        }
      }
    }
  }
  return be;
}

/** local pair refine around the current values */
export function localPair(
  ctx: EvalCtx, pose: PoseVec, a: KnobDef, b: KnobDef, k: number, span: number, step: number,
): number {
  const ca = pose[a.key] ?? 0, cb = pose[b.key] ?? 0;
  let bva = ca, bvb = cb;
  let be = evalPose(ctx, pose, k);
  for (let va = ca - span; va <= ca + span + 1e-9; va += step) {
    if (va < a.lo || va > a.hi) continue;
    for (let vb = cb - span; vb <= cb + span + 1e-9; vb += step) {
      if (vb < b.lo || vb > b.hi) continue;
      if (Math.abs(va - ca) < 1e-9 && Math.abs(vb - cb) < 1e-9) continue;
      const p = { ...pose, [a.key]: va, [b.key]: vb };
      const e = evalPose(ctx, p, k);
      if (e < be) { be = e; bva = va; bvb = vb; }
    }
  }
  pose[a.key] = bva; pose[b.key] = bvb;
  return be;
}

/** local triple refine around current values (chain incl. its end bone) */
export function localTriple(
  ctx: EvalCtx, pose: PoseVec, a: KnobDef, b: KnobDef, c: KnobDef, k: number, span: number, step: number,
): number {
  const ca = pose[a.key] ?? 0, cb = pose[b.key] ?? 0, cc = pose[c.key] ?? 0;
  let bva = ca, bvb = cb, bvc = cc;
  let be = evalPose(ctx, pose, k);
  for (let va = ca - span; va <= ca + span + 1e-9; va += step) {
    if (va < a.lo || va > a.hi) continue;
    for (let vb = cb - span; vb <= cb + span + 1e-9; vb += step) {
      if (vb < b.lo || vb > b.hi) continue;
      for (let vc = cc - span; vc <= cc + span + 1e-9; vc += step) {
        if (vc < c.lo || vc > c.hi) continue;
        const p = { ...pose, [a.key]: va, [b.key]: vb, [c.key]: vc };
        const e = evalPose(ctx, p, k);
        if (e < be) { be = e; bva = va; bvb = vb; bvc = vc; }
      }
    }
  }
  pose[a.key] = bva; pose[b.key] = bvb; pose[c.key] = bvc;
  return be;
}
