/**
 * Per-part placement, with the occlusion this figure is made of taken out.
 *
 * ⭐ Why this exists beside `rigc pose`. `pose` is the right instrument and it
 * answered the parts that are big, distinctive and unoccluded — it reproduced the
 * brief's own third-party estimator to the pixel on `torso`, `head` and `gun`, and
 * it split the two shins. On a dense biped it cannot answer the rest, and §11.4
 * says exactly why: *"a part drawn behind another has the occluder's pixels where
 * its own should be, so its residual rises AT THE CORRECT PLACEMENT"*. In a
 * stance the far arm is behind the torso and the thighs are behind both, so the
 * objective is measuring the occluder.
 *
 * The repair is the one thing `pose` structurally cannot do: it reads one frame
 * and knows nothing about what else is drawn. This does — it is given the
 * candidate's own draw order, so for each part it can score **only the pixels
 * that part would be the front-most thing in**, and ignore the ones something
 * else covers. That is not a better estimator than `pose`'s; it is the same
 * estimator with the occluders removed from the denominator, which is only
 * possible for a caller that already holds a whole figure.
 *
 * AUTHORING §9.1's *sacrificial cover*: this is also the per-part residual to
 * read beside the composite — a part whose own residual worsens while the
 * composite improves is being dragged off its place to cover something else.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Plate, readPlate } from '../../../../tools/plate.ts';
import { piecesOf, projector, rasterisePiece, viewportOfSize } from '../../../../src/render.ts';
import { readViewport, DEG } from './geom.ts';
import { SLOTS } from './rig.ts';
import { applyPose, loadPosable, type PoseVec, type Posed } from './fitlib.ts';
import { applySetup } from './refine.ts';
import { setsOf } from './fit.ts';
import type { Setup } from './rig.ts';

const ROOT = 'bench/runs/2026-09-03-spineboy-1';
const REF = 'bench/reference/spineboy/ess';
const IMAGES = 'examples/spineboy/images';

/** The parts whose placement carries a bone. */
export const PLACED: [string, string][] = [
  ['torso', 'torso'],
  ['neck', 'neck'],
  ['head', 'head'],
  ['rear-upper-arm', 'rear-upper-arm'],
  ['rear-bracer', 'rear-bracer'],
  ['gun', 'gun'],
  ['front-upper-arm', 'front-upper-arm'],
  ['front-bracer', 'front-bracer'],
  ['front-fist-closed', 'front-fist'],
  ['front-fist-open', 'front-fist'],
  ['rear-thigh', 'rear-thigh'],
  ['rear-shin', 'rear-shin'],
  ['rear-foot', 'rear-foot'],
  ['front-thigh', 'front-thigh'],
  ['front-shin', 'front-shin'],
  ['front-foot', 'front-foot'],
];

const SLOT_ORDER = SLOTS.map((s) => s.slot);
const SLOT_OF: Record<string, string> = {};
for (const s of SLOTS) for (const a of s.attachments) SLOT_OF[a] = s.slot;

export interface Sample {
  u: Float64Array;
  v: Float64Array;
  r: Float64Array;
  g: Float64Array;
  b: Float64Array;
  w: Float64Array;
  weight: number;
  count: number;
}

/**
 * Box-halve a part, averaging RGB **weighted by alpha**.
 *
 * ⚠️ Not decoration. The frames are drawn at 0.223 px/unit, so a part pixel is a
 * fifth of a frame pixel and comparing full-resolution art against the frame
 * charges the reference's own downsampling on every edge — measured, it put a
 * correct placement's residual at ~50/255 where `pose`, which reduces the part to
 * a matching mip, reads 0.10. Averaging colour straight would drag each edge
 * toward whatever the transparent neighbour stores, which for cut-out art is
 * black; this is `pose`'s own `halve`, for the same reason.
 */
function halveAlphaWeighted(src: Plate): Plate {
  const w = Math.max(1, src.width >> 1);
  const h = Math.max(1, src.height >> 1);
  const out = new Plate(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sa = 0;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let n = 0;
      for (let dy = 0; dy < 2; dy++) {
        const sy = Math.min(src.height - 1, y * 2 + dy);
        for (let dx = 0; dx < 2; dx++) {
          const sx = Math.min(src.width - 1, x * 2 + dx);
          const i = (sy * src.width + sx) * 4;
          const a = src.data[i + 3];
          sa += a;
          sr += src.data[i] * a;
          sg += src.data[i + 1] * a;
          sb += src.data[i + 2] * a;
          n++;
        }
      }
      const o = (y * w + x) * 4;
      out.data[o + 3] = Math.round(sa / n);
      if (sa > 0) {
        out.data[o] = Math.round(sr / sa);
        out.data[o + 1] = Math.round(sg / sa);
        out.data[o + 2] = Math.round(sb / sa);
      }
    }
  }
  return out;
}

/** The part reduced to about the frame's own resolution, then sampled. */
export function samplePart(plate: Plate, reduction: number): Sample {
  let mip = plate;
  let k = 1;
  while (k < reduction) {
    mip = halveAlphaWeighted(mip);
    k *= 2;
  }
  const s = sampleArt(mip);
  for (let i = 0; i < s.count; i++) {
    s.u[i] *= k;
    s.v[i] *= k;
  }
  return s;
}

/** One part's opaque pixels as offsets from its own image centre. */
export function sampleArt(plate: Plate): Sample {
  const u: number[] = [];
  const v: number[] = [];
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  const w: number[] = [];
  const cx = plate.width / 2;
  const cy = plate.height / 2;
  for (let y = 0; y < plate.height; y++) {
    for (let x = 0; x < plate.width; x++) {
      const i = (y * plate.width + x) * 4;
      const a = plate.data[i + 3];
      if (a < 24) continue;
      u.push(x + 0.5 - cx);
      v.push(y + 0.5 - cy);
      r.push(plate.data[i]);
      g.push(plate.data[i + 1]);
      b.push(plate.data[i + 2]);
      w.push(a / 255);
    }
  }
  const weight = w.reduce((s, k) => s + k, 0);
  return {
    u: Float64Array.from(u),
    v: Float64Array.from(v),
    r: Float64Array.from(r),
    g: Float64Array.from(g),
    b: Float64Array.from(b),
    w: Float64Array.from(w),
    weight,
    count: u.length,
  };
}

export interface PlaceResult {
  x: number;
  y: number;
  rot: number;
  res: number;
  /** Share of the part's own material that was scoreable — 1 minus what covers it. */
  vis: number;
}

/**
 * Which of the part's own pixels are scoreable — decided ONCE, at the seed.
 *
 * 🚨 The version that recomputed this per candidate placement was a cliff of
 * §9.1's own family, and it walked straight off it: with the denominator free to
 * shrink, the cheapest move is to slide the part until the occluder covers nearly
 * all of it and only a handful of pixels are scored. Measured on `idle/f0000` —
 * every part reporting `vis` 0.08–0.20 with a residual of 11–20 at rotations of
 * 100–140° on an upright stance, a confident number for a placement that is not
 * even the right way up. Freezing the visible SET in the part's own space at the
 * seed makes the denominator a constant, so a move can only be paid for by
 * agreeing with the frame.
 */
function visibleSet(
  s: Sample,
  cover: Uint8Array,
  width: number,
  height: number,
  seed: { x: number; y: number; rot: number },
  scale: number,
): { keep: Uint8Array; weight: number } {
  const c = Math.cos(seed.rot * DEG) * scale;
  const sn = Math.sin(seed.rot * DEG) * scale;
  const keep = new Uint8Array(s.count);
  let weight = 0;
  for (let i = 0; i < s.count; i++) {
    const ix = Math.round(seed.x + s.u[i] * c - s.v[i] * sn - 0.5);
    const iy = Math.round(seed.y + s.u[i] * sn + s.v[i] * c - 0.5);
    if (ix < 0 || iy < 0 || ix >= width || iy >= height) continue;
    if (cover[iy * width + ix]) continue;
    keep[i] = 1;
    weight += s.w[i];
  }
  return { keep, weight };
}

/**
 * Score a placement over a FIXED subset of the part's own material, charging
 * anything that leaves the canvas.
 */
function residual(
  s: Sample,
  ref: Plate,
  keep: Uint8Array,
  denom: number,
  cx: number,
  cy: number,
  rotDeg: number,
  scale: number,
): number {
  const c = Math.cos(rotDeg * DEG) * scale;
  const sn = Math.sin(rotDeg * DEG) * scale;
  let acc = 0;
  const w = ref.width;
  const h = ref.height;
  for (let i = 0; i < s.count; i++) {
    if (!keep[i]) continue;
    const fx = cx + s.u[i] * c - s.v[i] * sn;
    const fy = cy + s.u[i] * sn + s.v[i] * c;
    const ix = Math.round(fx - 0.5);
    const iy = Math.round(fy - 0.5);
    if (ix < 0 || iy < 0 || ix >= w || iy >= h) {
      acc += s.w[i] * 255 * 3;
      continue;
    }
    const j = (iy * w + ix) * 4;
    acc +=
      s.w[i] *
      (Math.abs(s.r[i] - ref.data[j]) + Math.abs(s.g[i] - ref.data[j + 1]) + Math.abs(s.b[i] - ref.data[j + 2]));
  }
  return acc / (3 * denom);
}

export interface FitPlaceOpts {
  window: number;
  rotWindow: number;
  scale: number;
}

export function fitPlacement(
  s: Sample,
  ref: Plate,
  cover: Uint8Array,
  seed: { x: number; y: number; rot: number },
  opts: FitPlaceOpts,
): PlaceResult {
  const { keep, weight } = visibleSet(s, cover, ref.width, ref.height, seed, opts.scale);
  const vis = weight / s.weight;
  // Under a third of the part scoreable is not a measurement of that part.
  if (weight < 0.3 * s.weight) {
    return { x: seed.x, y: seed.y, rot: seed.rot, res: Infinity, vis };
  }
  let best = { x: seed.x, y: seed.y, rot: seed.rot, res: Infinity, vis };
  const passes: [number, number, number, number][] = [
    [opts.window, 3, opts.rotWindow, 6],
    [4, 1, 8, 2],
    [1.5, 0.5, 2.5, 0.5],
  ];
  for (const [win, step, rwin, rstep] of passes) {
    const c0 = { ...best };
    for (let dy = -win; dy <= win; dy += step) {
      for (let dx = -win; dx <= win; dx += step) {
        for (let dr = -rwin; dr <= rwin; dr += rstep) {
          const x = c0.x + dx;
          const y = c0.y + dy;
          const rot = c0.rot + dr;
          const res = residual(s, ref, keep, weight, x, y, rot, opts.scale);
          if (res < best.res) best = { x, y, rot, res, vis };
        }
      }
    }
  }
  return best;
}

/** For every part, the pixels the candidate draws IN FRONT of it. */
export function coverMasks(p: Posed, vp: ReturnType<typeof readViewport>): Map<string, Uint8Array> {
  const pieces = piecesOf(p.skeleton);
  const viewport = viewportOfSize(vp.minX, vp.minY, vp.maxX - vp.minX, vp.maxY - vp.minY, vp.scale, vp.width, vp.height);
  const project = projector(viewport);
  const n = vp.width * vp.height;
  const ownMask = new Map<string, Uint8Array>();
  const target = new Plate(vp.width, vp.height);
  for (const piece of pieces) {
    const page = p.pages.get(piece.page);
    if (!page) continue;
    const mask = new Uint8Array(n);
    rasterisePiece(page, piece, project, target, (px, py, _r, _g, _b, a) => {
      if (a < 96) return;
      const ix = Math.round(px);
      const iy = Math.round(py);
      if (ix < 0 || iy < 0 || ix >= vp.width || iy >= vp.height) return;
      mask[iy * vp.width + ix] = 1;
    });
    ownMask.set(piece.slot, mask);
  }
  const out = new Map<string, Uint8Array>();
  for (let i = 0; i < SLOT_ORDER.length; i++) {
    const cover = new Uint8Array(n);
    for (let j = i + 1; j < SLOT_ORDER.length; j++) {
      const m = ownMask.get(SLOT_ORDER[j]);
      if (!m) continue;
      for (let k = 0; k < n; k++) if (m[k]) cover[k] = 1;
    }
    out.set(SLOT_ORDER[i], cover);
  }
  return out;
}

if (import.meta.main) {
  const only = process.argv[2];
  const window = Number(process.argv[3] ?? 18);
  const vp = readViewport(join(REF, 'frames.json'));
  const p = loadPosable(join(ROOT, 'spine'));
  const setup: Setup = JSON.parse(readFileSync(join(ROOT, 'fit/setup.json'), 'utf8'));
  applySetup(p, setup);
  const samples = new Map<string, Sample>();
  for (const [part] of PLACED) samples.set(part, samplePart(readPlate(join(IMAGES, `${part}.png`)), 4));

  const outDir = join(ROOT, 'fit/place');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  for (const set of setsOf()) {
    if (only && !new RegExp(only).test(set.dir)) continue;
    const file = join(ROOT, `fit/poses/${set.dir.replace('@', '_at_')}.json`);
    const poses: Record<string, PoseVec> = JSON.parse(readFileSync(file, 'utf8'));
    const out: Record<string, Record<string, PlaceResult>> = {};
    for (const f of set.frames) {
      const frame = f.replace('.png', '');
      const ref = readPlate(join(REF, set.dir, f));
      applyPose(p, poses[frame]);
      const covers = coverMasks(p, vp);
      // where the candidate currently puts each part's centre, as the seed
      const pieces = piecesOf(p.skeleton);
      const viewport = viewportOfSize(
        vp.minX,
        vp.minY,
        vp.maxX - vp.minX,
        vp.maxY - vp.minY,
        vp.scale,
        vp.width,
        vp.height,
      );
      const project = projector(viewport);
      const seeds = new Map<string, { x: number; y: number; rot: number }>();
      for (const piece of pieces) {
        const w = piece.world;
        // region order: br, bl, ul, ur — the centre is the mean, the rotation the
        // direction of the bottom edge, read in frame pixels (y down).
        let sx = 0;
        let sy = 0;
        for (let i = 0; i < 4; i++) {
          const [px, py] = project(w[i * 2], w[i * 2 + 1]);
          sx += px / 4;
          sy += py / 4;
        }
        // 🚨 The quad's corner order is bl, ul, ur, br — verified by reconstructing a
        // known pose from the emitted vertices, NOT by reading a comment. The screen
        // angle is the bl->br edge, which is the region's own +u axis; taking bl->ul
        // instead reads it about 90 degrees out, and a rotation window around a seed
        // that far off can never find the truth (this cost this run a whole pass:
        // LOOP section 4.8).
        const [blx, bly] = project(w[0], w[1]);
        const [brx, bry] = project(w[6], w[7]);
        const rot = (Math.atan2(bry - bly, brx - blx) * 180) / Math.PI;
        seeds.set(piece.slot, { x: sx, y: sy, rot });
      }
      const row: Record<string, PlaceResult> = {};
      for (const [part] of PLACED) {
        const slot = SLOT_OF[part];
        const seed = seeds.get(slot);
        if (!seed) continue;
        const cover = covers.get(slot);
        if (!cover) continue;
        const s = samples.get(part)!;
        row[part] = fitPlacement(s, ref, cover, seed, { window, rotWindow: 24, scale: vp.scale });
      }
      out[frame] = row;
    }
    writeFileSync(join(outDir, `${set.dir.replace('@', '_at_')}.json`), JSON.stringify(out));
    const worst = Object.entries(out).map(([k, row]) => {
      const vals = Object.values(row).filter((r) => Number.isFinite(r.res));
      return `${k}:${(vals.reduce((a, b) => a + b.res, 0) / Math.max(1, vals.length)).toFixed(1)}`;
    });
    console.log(`${set.dir.padEnd(16)} mean per-part residual  ${worst.slice(0, 6).join(' ')}`);
  }
}
