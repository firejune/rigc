/**
 * The composite objective, and the renderer under it.
 *
 * AUTHORING §8.1: on a figure with limbs there are no pixels that can only be
 * one part, so the objective is the whole picture — rendered through the same
 * rasteriser that drew the reference frames, into the frames' own viewport,
 * minimised over the bones' local transforms. The pieces come from `spine-core`
 * itself (§9.1: a bone's local transform lives on `bone.pose`), so what this
 * scores is what `check` will render.
 *
 * Four defences from §9.1 are wired in rather than left to discipline:
 *   - the score's denominator is the REFERENCE's own ink, never the union, so a
 *     candidate cannot buy a better mean by drawing more;
 *   - candidate ink outside a margin of the reference's drawn box is CHARGED, so
 *     the "hang it below the frame" entrance to the cliff is closed;
 *   - `drawNothingFloor` is evaluated deliberately and kept, so any score at or
 *     below it is read as the cliff and not as progress;
 *   - the ink assertion is expressed as a fraction of the reference's ink AT THE
 *     LEVEL BEING EVALUATED, so it means the same thing on every rung of the
 *     pyramid.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Plate, readPlate, type RGBA } from '../../../../tools/plate.ts';
import {
  BACKGROUND,
  piecesOf,
  posableFromText,
  projector,
  rasterisePiece,
  viewportOfSize,
  type Piece,
  type Viewport as RVp,
} from '../../../../src/render.ts';
import { Physics, Skeleton } from '@esotericsoftware/spine-core';
import type { Viewport } from './geom.ts';

export const BG: RGBA = BACKGROUND;
/** `src/framing.ts`'s own BACKGROUND_TOLERANCE — what counts as ink. */
export const INK_TOLERANCE = 8;

function isInk(data: Uint8Array, i: number): boolean {
  return (
    Math.abs(data[i] - BG[0]) > INK_TOLERANCE ||
    Math.abs(data[i + 1] - BG[1]) > INK_TOLERANCE ||
    Math.abs(data[i + 2] - BG[2]) > INK_TOLERANCE
  );
}

/** Box-average a plate down by an integer factor, over the background. */
export function reduce(src: Plate, k: number): Plate {
  const w = Math.ceil(src.width / k);
  const h = Math.ceil(src.height / k);
  const out = new Plate(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let dy = 0; dy < k; dy++) {
        const sy = y * k + dy;
        if (sy >= src.height) continue;
        for (let dx = 0; dx < k; dx++) {
          const sx = x * k + dx;
          if (sx >= src.width) continue;
          const i = (sy * src.width + sx) * 4;
          r += src.data[i];
          g += src.data[i + 1];
          b += src.data[i + 2];
          n++;
        }
      }
      const o = (y * w + x) * 4;
      out.data[o] = Math.round(r / n);
      out.data[o + 1] = Math.round(g / n);
      out.data[o + 2] = Math.round(b / n);
      out.data[o + 3] = 255;
    }
  }
  return out;
}

export interface RefLevel {
  k: number;
  ref: Plate;
  viewport: RVp;
  /** Pixels of reference ink at this level. */
  ink: number;
  /** Scoring window: the reference's drawn box, grown by a margin. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Reused render target. */
  buf: Plate;
  /** Optional per-pixel weight (the change mask), same size as `ref`. */
  weight: Float32Array | null;
}

export const LEVELS = [8, 4, 2, 1];

export function refLevels(framePath: string, vp: Viewport, margin = 24): RefLevel[] {
  const full = readPlate(framePath);
  const out: RefLevel[] = [];
  for (const k of LEVELS) {
    const ref = k === 1 ? full : reduce(full, k);
    let ink = 0;
    let bx0 = ref.width;
    let by0 = ref.height;
    let bx1 = -1;
    let by1 = -1;
    for (let y = 0; y < ref.height; y++) {
      for (let x = 0; x < ref.width; x++) {
        if (!isInk(ref.data, (y * ref.width + x) * 4)) continue;
        ink++;
        if (x < bx0) bx0 = x;
        if (y < by0) by0 = y;
        if (x > bx1) bx1 = x;
        if (y > by1) by1 = y;
      }
    }
    const m = Math.max(2, Math.round(margin / k));
    out.push({
      k,
      ref,
      viewport: viewportOfSize(vp.minX, vp.minY, vp.maxX - vp.minX, vp.maxY - vp.minY, vp.scale / k, ref.width, ref.height),
      ink: Math.max(1, ink),
      x0: Math.max(0, bx0 - m),
      y0: Math.max(0, by0 - m),
      x1: Math.min(ref.width - 1, bx1 + m),
      y1: Math.min(ref.height - 1, by1 + m),
      buf: new Plate(ref.width, ref.height),
      weight: null,
    });
  }
  return out;
}

/** A change mask, per AUTHORING §8: weight the objective by the reference's own motion. */
export function changeWeights(levels: RefLevel[], neighbours: string[], base = 1, gain = 4): void {
  if (neighbours.length === 0) return;
  const plates = neighbours.map((p) => readPlate(p));
  for (const lv of levels) {
    const reduced = plates.map((p) => (lv.k === 1 ? p : reduce(p, lv.k)));
    const w = new Float32Array(lv.ref.width * lv.ref.height);
    for (let i = 0; i < w.length; i++) {
      let d = 0;
      for (const r of reduced) {
        const j = i * 4;
        d = Math.max(
          d,
          Math.abs(r.data[j] - lv.ref.data[j]) +
            Math.abs(r.data[j + 1] - lv.ref.data[j + 1]) +
            Math.abs(r.data[j + 2] - lv.ref.data[j + 2]),
        );
      }
      w[i] = base + gain * Math.min(1, d / 96);
    }
    lv.weight = w;
  }
}

export interface Posed {
  skeleton: Skeleton;
  pages: Map<string, Plate>;
  bones: Map<string, ReturnType<Skeleton['findBone']>>;
}

export function loadPosable(outDir: string): Posed {
  const skeletonText = readFileSync(join(outDir, 'skeleton.json'), 'utf8');
  const atlasText = readFileSync(join(outDir, 'skeleton.atlas'), 'utf8');
  const { data, pages } = posableFromText(skeletonText, atlasText, outDir);
  const skeleton = new Skeleton(data);
  skeleton.setupPose();
  const bones = new Map<string, ReturnType<Skeleton['findBone']>>();
  for (const b of skeleton.bones) bones.set(b.data.name, b);
  return { skeleton, pages, bones };
}

export interface Knob {
  bone: string;
  prop: 'rotate' | 'x' | 'y';
  min: number;
  max: number;
}

export type PoseVec = Record<string, number>;

export function keyOf(k: Knob): string {
  return `${k.bone}.${k.prop}`;
}

/** Write a pose vector onto the skeleton and compute its world transforms. */
export function applyPose(p: Posed, pose: PoseVec, attachments?: Record<string, string | null>): void {
  p.skeleton.setupPose();
  for (const [key, v] of Object.entries(pose)) {
    const dot = key.lastIndexOf('.');
    const bone = p.bones.get(key.slice(0, dot));
    if (!bone) continue;
    const prop = key.slice(dot + 1);
    if (prop === 'rotate') bone.pose.rotation = bone.data.setupPose.rotation + v;
    else if (prop === 'x') bone.pose.x = bone.data.setupPose.x + v;
    else if (prop === 'y') bone.pose.y = bone.data.setupPose.y + v;
  }
  if (attachments) {
    for (const [slotName, att] of Object.entries(attachments)) {
      const slot = p.skeleton.findSlot(slotName);
      if (!slot) continue;
      slot.pose.attachment = att === null ? null : p.skeleton.getAttachment(slot.data.index, att);
    }
  }
  p.skeleton.update(0);
  p.skeleton.updateWorldTransform(Physics.update);
}

export interface Score {
  /** Weighted mean absolute RGB difference per reference ink pixel. */
  value: number;
  /** Candidate ink pixels outside the scoring window. */
  strays: number;
  /** Candidate ink pixels inside the window. */
  ink: number;
}

const STRAY_CHARGE = 3;

/** Render the current pose into `lv.buf` and score it against the reference. */
export function score(p: Posed, lv: RefLevel, pieces?: Piece[]): Score {
  const list = pieces ?? piecesOf(p.skeleton);
  const buf = lv.buf;
  const w = buf.width;
  // Repaint only the scoring window plus a ring, then charge anything outside it.
  const bd = buf.data;
  for (let y = lv.y0; y <= lv.y1; y++) {
    let i = (y * w + lv.x0) * 4;
    for (let x = lv.x0; x <= lv.x1; x++, i += 4) {
      bd[i] = BG[0];
      bd[i + 1] = BG[1];
      bd[i + 2] = BG[2];
      bd[i + 3] = 255;
    }
  }
  const project = projector(lv.viewport);
  let strays = 0;
  for (const piece of list) {
    const page = p.pages.get(piece.page);
    if (!page) continue;
    rasterisePiece(page, piece, project, buf, (px, py, r, g, b, a) => {
      const ix = Math.round(px);
      const iy = Math.round(py);
      if (ix < lv.x0 || ix > lv.x1 || iy < lv.y0 || iy > lv.y1) {
        if (a > 32) strays++;
        return;
      }
      buf.blend(ix, iy, [r, g, b, a]);
    });
  }
  let acc = 0;
  let ink = 0;
  const rd = lv.ref.data;
  for (let y = lv.y0; y <= lv.y1; y++) {
    for (let x = lv.x0; x <= lv.x1; x++) {
      const idx = y * w + x;
      const i = idx * 4;
      const d = Math.abs(bd[i] - rd[i]) + Math.abs(bd[i + 1] - rd[i + 1]) + Math.abs(bd[i + 2] - rd[i + 2]);
      if (d > 0) acc += lv.weight ? d * lv.weight[idx] : d;
      if (isInk(bd, i)) ink++;
    }
  }
  return { value: (acc + strays * 255 * STRAY_CHARGE) / (3 * lv.ink), strays, ink };
}

/** §9.1's floor: what "draw nothing" scores. Any result at or under it is the cliff. */
export function drawNothingFloor(lv: RefLevel): number {
  const rd = lv.ref.data;
  let acc = 0;
  for (let y = lv.y0; y <= lv.y1; y++) {
    for (let x = lv.x0; x <= lv.x1; x++) {
      const idx = y * lv.ref.width + x;
      const i = idx * 4;
      const d = Math.abs(BG[0] - rd[i]) + Math.abs(BG[1] - rd[i + 1]) + Math.abs(BG[2] - rd[i + 2]);
      acc += lv.weight ? d * lv.weight[idx] : d;
    }
  }
  return acc / (3 * lv.ink);
}

/** The candidate's ink at this level, as a share of the reference's. */
export function inkShare(s: Score, lv: RefLevel): number {
  return s.ink / lv.ink;
}

export { piecesOf };
