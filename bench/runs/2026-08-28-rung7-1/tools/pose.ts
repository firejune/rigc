/**
 * Rung 7 — driving the runtime directly, and rendering into the frames' own grid.
 *
 * AUTHORING.md §9.1's three traps are all live here:
 *   - a bone's local transform is on bone.pose, not on the bone;
 *   - the setup transform is on bone.data.setupPose, not on bone.data;
 *   - a region attachment's offsets are cached, so this module never writes them.
 * The selftest at the foot proves the first is being honoured: a knob that is not
 * read cannot move the number, so every knob is swept once and any that reports a
 * flat objective is an inert write and a bug.
 */
import { readFileSync } from 'node:fs';
import { AnimationState, AnimationStateData, Physics, Skeleton } from '@esotericsoftware/spine-core';
import { Plate, readPlate, type RGBA } from '../../../../tools/plate.ts';
import { blitPiece, pageFor, piecesOf, posableFromText, type Posable, type Viewport } from '../../../../src/render.ts';

export const BG: RGBA = [232, 232, 232, 255];

export interface RefBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  scale: number;
  width: number;
  height: number;
}

export function framesBox(root: string): RefBox {
  const j = JSON.parse(readFileSync(`${root}/frames.json`, 'utf8')) as {
    viewport: { x: number; y: number; width: number; height: number; scale: number; pixelWidth: number; pixelHeight: number };
  };
  const v = j.viewport;
  return {
    minX: v.x,
    minY: v.y,
    maxX: v.x + v.width,
    maxY: v.y + v.height,
    scale: v.scale,
    width: v.pixelWidth,
    height: v.pixelHeight,
  };
}

/**
 * A viewport over a sub-rectangle of the reference grid, at 1/`step` of its scale.
 *
 * The pixel grid stays aligned with the reference's: pixel (px0 + i*step .. ) of the
 * frame is cell i here, so a box-average of the reference over step x step blocks is
 * the thing this renders against. That is §8.1's coarse-to-fine, done by rendering
 * less rather than by blurring more.
 */
export function windowViewport(ref: RefBox, px0: number, py0: number, w: number, h: number, step: number): Viewport {
  const scale = ref.scale / step;
  const maxY = ref.maxY - py0 / ref.scale;
  const minX = ref.minX + px0 / ref.scale;
  return {
    minX,
    minY: maxY - (h * step) / ref.scale,
    maxX: minX + (w * step) / ref.scale,
    maxY,
    scale,
    width: w,
    height: h,
  };
}

export function loadCandidate(dir: string): Posable {
  return posableFromText(readFileSync(`${dir}/skeleton.json`, 'utf8'), readFileSync(`${dir}/skeleton.atlas`, 'utf8'), dir);
}

export interface Rig {
  posable: Posable;
  skeleton: Skeleton;
  /** every bone by name */
  bone: Map<string, ReturnType<Skeleton['findBone']>>;
}

export function makeRig(dir: string): Rig {
  const posable = loadCandidate(dir);
  const skeleton = new Skeleton(posable.data);
  const bone = new Map<string, ReturnType<Skeleton['findBone']>>();
  for (const b of posable.data.bones) bone.set(b.name, skeleton.findBone(b.name));
  return { posable, skeleton, bone };
}

/** One knob: which bone, which channel, and the plausible range a scan covers. */
export interface Knob {
  bone: string;
  prop: 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY' | 'shearX' | 'shearY';
  lo: number;
  hi: number;
  /** the setup value, which is also the neutral one */
  base: number;
}

export function applyPose(rig: Rig, knobs: Knob[], values: number[]): void {
  rig.skeleton.setupPose();
  for (let i = 0; i < knobs.length; i++) {
    const k = knobs[i];
    const b = rig.bone.get(k.bone);
    if (!b) throw new Error(`no bone "${k.bone}"`);
    // §9.1: the local transform lives on bone.pose. Writing b.rotation is inert.
    (b.pose as unknown as Record<string, number>)[k.prop] = values[i];
  }
  rig.skeleton.update(0);
  rig.skeleton.updateWorldTransform(Physics.reset);
}

/** Render the current pose into a reused plate. */
export function renderInto(rig: Rig, plate: Plate, v: Viewport): void {
  const px = plate.data;
  for (let i = 0; i < px.length; i += 4) {
    px[i] = BG[0];
    px[i + 1] = BG[1];
    px[i + 2] = BG[2];
    px[i + 3] = 255;
  }
  const project = (wx: number, wy: number): [number, number] => [(wx - v.minX) * v.scale, (v.maxY - wy) * v.scale];
  for (const piece of piecesOf(rig.skeleton)) blitPiece(plate, pageFor(rig.posable.pages, piece), piece, project);
}

/** The pose an animation puts the skeleton in at one sample — for verifying keys. */
export function sampleInto(rig: Rig, name: string, fps: number, index: number): void {
  const state = new AnimationState(new AnimationStateData(rig.posable.data));
  state.setAnimation(0, name, false);
  rig.skeleton.setupPose();
  const step = 1 / fps;
  for (let i = 0; i <= index; i++) {
    if (i > 0) {
      state.update(step);
      state.apply(rig.skeleton);
      rig.skeleton.update(step);
      rig.skeleton.updateWorldTransform(Physics.update);
    } else {
      state.apply(rig.skeleton);
      rig.skeleton.update(0);
      rig.skeleton.updateWorldTransform(Physics.reset);
    }
  }
}

// ---------------------------------------------------------------------------
// the objective
// ---------------------------------------------------------------------------

/** A box-averaged copy of a reference frame over the window, at 1/step scale. */
export function downsample(src: Plate, px0: number, py0: number, w: number, h: number, step: number): Plate {
  const out = new Plate(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let dy = 0; dy < step; dy++)
        for (let dx = 0; dx < step; dx++) {
          const sx = px0 + x * step + dx;
          const sy = py0 + y * step + dy;
          if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) {
            r += BG[0];
            g += BG[1];
            b += BG[2];
          } else {
            const [pr, pg, pb] = src.get(sx, sy);
            r += pr;
            g += pg;
            b += pb;
          }
          n++;
        }
      out.set(x, y, [r / n, g / n, b / n, 255]);
    }
  return out;
}

/**
 * Mean absolute RGB difference, divided by the number of pixels the REFERENCE drew.
 *
 * §9.2: the union denominator is half yours, and a candidate that grows its ink can
 * lower a union mean while getting worse — spineboy-2 walked a flare to 13x doing
 * exactly that. This denominator is the reference's own, so nothing the fit does can
 * grow it, and overdraw is charged rather than rewarded.
 */
export function objective(cand: Plate, ref: Plate, refDrawn: number): number {
  const a = cand.data;
  const b = ref.data;
  let sum = 0;
  for (let i = 0; i < a.length; i += 4)
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  return sum / 3 / Math.max(1, refDrawn);
}

/**
 * Split a plate into beige and crimson, fast, on the raw bytes.
 *
 * The same two conventions the brief states and frames.ts uses: drawn means more
 * than 8/255 from the backdrop on some channel, and cape means g - b <= 8. Both were
 * calibrated on the art in art.ts — 40 of sack.png's 250,792 opaque pixels read as
 * cape and 100.0 % of both cape images do — so this classifier is the one the brief's
 * own figures were measured with, pointed at my render instead of the reference's.
 */
export function classify(p: Plate, sack: Uint8Array, cape: Uint8Array): { sackN: number; capeN: number } {
  const d = p.data;
  let sackN = 0;
  let capeN = 0;
  for (let i = 0, k = 0; i < d.length; i += 4, k++) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const drawn = (r > 240 || r < 224 || g > 240 || g < 224 || b > 240 || b < 224) as boolean;
    if (!drawn) {
      sack[k] = 0;
      cape[k] = 0;
      continue;
    }
    if (g - b <= 8) {
      cape[k] = 1;
      sack[k] = 0;
      capeN++;
    } else {
      sack[k] = 1;
      cape[k] = 0;
      sackN++;
    }
  }
  return { sackN, capeN };
}

/**
 * Error per part, each normalised by that part's OWN reference area.
 *
 * §8.1 sends the next iteration to the worst chain by error per pixel rather than by
 * share, "because the share confounds wrong with big". An RGB objective over the
 * whole composite has the opposite property twice over: the crimson is four times
 * further from the backdrop than the beige is, so a wrong crimson pixel costs about
 * 3.5x a wrong beige one, while the sack covers four times as many pixels as the
 * cape. Measured on a first walk fit, that traded the sack down to 0.86 silhouette
 * IoU to buy cape pixels it could not reach anyway. Normalising per part removes
 * both distortions and makes the two halves comparable.
 */
export function partError(
  cand: Plate,
  candSack: Uint8Array,
  candCape: Uint8Array,
  refSack: Uint8Array,
  refCape: Uint8Array,
  refSackN: number,
  refCapeN: number,
  wSack = 0.5,
  wCape = 0.5,
): number {
  classify(cand, candSack, candCape);
  let ds = 0;
  let dc = 0;
  // Bound by the REFERENCE mask's length, not the scratch buffer's. The scratch is
  // sized to the largest window any frame has needed, so a shorter window would
  // otherwise compare live bytes against `undefined` past the end and count every one
  // of them as a mismatch — which read as a shot that was fitting badly rather than as
  // a loop bug (fall-in's settled tail reported 5.45 where the setup pose reads 0.014).
  const n = refSack.length;
  for (let k = 0; k < n; k++) {
    if (candSack[k] !== refSack[k]) ds++;
    if (candCape[k] !== refCape[k]) dc++;
  }
  return wSack * (ds / Math.max(1, refSackN)) + wCape * (dc / Math.max(1, refCapeN));
}

export function drawnCount(p: Plate, tol = 8): number {
  let n = 0;
  for (let i = 0; i < p.data.length; i += 4)
    if (
      Math.abs(p.data[i] - BG[0]) > tol ||
      Math.abs(p.data[i + 1] - BG[1]) > tol ||
      Math.abs(p.data[i + 2] - BG[2]) > tol
    )
      n++;
  return n;
}

if (import.meta.main) {
  // selftest: every knob must move the number. A flat one is an inert write (§9.1).
  const dir = process.argv[2] ?? 'bench/runs/2026-08-28-rung7-1/spine';
  const root = 'bench/reference-local/7-anticipation';
  const ref = framesBox(root);
  const rig = makeRig(dir);
  const knobs: Knob[] = [];
  for (const b of rig.posable.data.bones) {
    if (b.name === 'root') continue;
    for (const p of ['x', 'y', 'rotation', 'scaleX', 'scaleY'] as const)
      knobs.push({ bone: b.name, prop: p, lo: 0, hi: 0, base: 0 });
  }
  const v = windowViewport(ref, 0, 0, ref.width, ref.height, 1);
  const plate = new Plate(v.width, v.height);
  const refPlate = readPlate(`${root}/hello/f0000.png`);
  const rd = drawnCount(refPlate);
  const setup = knobs.map((k) => {
    const b = rig.bone.get(k.bone)!;
    return (b.data.setupPose as unknown as Record<string, number>)[k.prop];
  });
  applyPose(rig, knobs, setup);
  renderInto(rig, plate, v);
  const base = objective(plate, refPlate, rd);
  console.log(`setup pose vs hello/f0000 in frames.json's own box: MAE/ref-px ${base.toFixed(3)}   ref drew ${rd} px`);
  console.log('knob sweep — a knob that cannot move the number is an inert write:');
  let inert = 0;
  for (let i = 0; i < knobs.length; i++) {
    const k = knobs[i];
    const nudge = k.prop === 'rotation' ? 6 : k.prop.startsWith('scale') ? 0.15 : 40;
    const vals = setup.slice();
    vals[i] += nudge;
    applyPose(rig, knobs, vals);
    renderInto(rig, plate, v);
    const e = objective(plate, refPlate, rd);
    const moved = Math.abs(e - base) > 1e-9;
    if (!moved) inert++;
    console.log(`  ${`${k.bone}.${k.prop}`.padEnd(22)} ${moved ? '' : 'INERT  '}${e.toFixed(3)}  (Δ ${(e - base).toFixed(3)})`);
  }
  console.log(inert ? `\n⚠️ ${inert} inert knob(s)` : '\nno inert knobs');
}
