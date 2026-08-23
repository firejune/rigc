/**
 * Render this candidate into the reference frames' own viewport and score it
 * against a frame. §8's "second way to get the number", applied to a whole
 * pose: any bias in the rasteriser cancels because both sides go through it.
 *
 * 🚨 A bone's local transform lives on `bone.pose` (§9.1). Writing
 * `bone.rotation` adds a property nothing reads.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Physics, Skeleton } from '@esotericsoftware/spine-core';
import { Plate, readPlate } from '../../../../tools/plate.ts';
import { BACKGROUND, blitPiece, pageFor, piecesOf, posableFromText, projector, viewportOfSize, type Posable } from '../../../../src/render.ts';
import { PIXEL_H, PIXEL_W, SCALE, VIEW_H, VIEW_W, VIEW_X, VIEW_Y } from './geom.ts';

export const VIEWPORT = viewportOfSize(VIEW_X, VIEW_Y, VIEW_W, VIEW_H, SCALE, PIXEL_W, PIXEL_H);

export interface Pose {
  /** bone name → local transform overrides, relative to the setup pose */
  bones: Record<string, { rotation?: number; x?: number; y?: number; scaleX?: number; scaleY?: number }>;
  /** slot name → attachment name, or null to hide */
  slots?: Record<string, string | null>;
}

export function loadCandidate(dir: string): Posable {
  return posableFromText(
    readFileSync(join(dir, 'skeleton.json'), 'utf8'),
    readFileSync(join(dir, 'skeleton.atlas'), 'utf8'),
    dir,
  );
}

const BLANK = (() => {
  const b = new Uint8Array(VIEWPORT.width * VIEWPORT.height * 4);
  for (let i = 0; i < b.length; i += 4) {
    b[i] = BACKGROUND[0];
    b[i + 1] = BACKGROUND[1];
    b[i + 2] = BACKGROUND[2];
    b[i + 3] = BACKGROUND[3];
  }
  return b;
})();

export class Rigged {
  readonly posable: Posable;
  readonly skeleton: Skeleton;
  private readonly plate = new Plate(VIEWPORT.width, VIEWPORT.height);
  private readonly project = projector(VIEWPORT);
  constructor(posable: Posable) {
    this.posable = posable;
    this.skeleton = new Skeleton(posable.data);
  }

  /** Optional slot names in draw order — §8's like-for-like test needs to
   *  re-stack the same rig without rebuilding it. */
  order: string[] | null = null;

  render(pose: Pose): Plate {
    const sk = this.skeleton;
    sk.setupPose();
    for (const [name, t] of Object.entries(pose.bones)) {
      const bone = sk.findBone(name);
      if (!bone) throw new Error(`no bone "${name}"`);
      const p = bone.pose;
      if (t.rotation !== undefined) p.rotation = bone.data.setupPose.rotation + t.rotation;
      if (t.x !== undefined) p.x = bone.data.setupPose.x + t.x;
      if (t.y !== undefined) p.y = bone.data.setupPose.y + t.y;
      if (t.scaleX !== undefined) p.scaleX = t.scaleX;
      if (t.scaleY !== undefined) p.scaleY = t.scaleY;
    }
    for (const [slotName, attachment] of Object.entries(pose.slots ?? {})) {
      const slot = sk.findSlot(slotName);
      if (!slot) throw new Error(`no slot "${slotName}"`);
      slot.pose.setAttachment(attachment === null ? null : sk.getAttachment(slot.data.index, attachment));
    }
    sk.update(0);
    sk.updateWorldTransform(Physics.update);
    if (this.order) {
      const by = new Map(sk.slots.map((s) => [s.data.name, s]));
      const list = sk.drawOrder.appliedPose;
      list.length = 0;
      for (const name of this.order) {
        const slot = by.get(name);
        if (slot) list.push(slot);
      }
    }
    this.plate.data.set(BLANK);
    for (const piece of piecesOf(sk)) blitPiece(this.plate, pageFor(this.posable.pages, piece), piece, this.project);
    return this.plate;
  }
}

const BG_TOL = 8;

/** Mean absolute RGB difference over the pixels either side drew (check's own union alpha). */
export function mae(candidate: Plate, reference: Plate): number {
  let sum = 0;
  let n = 0;
  const a = candidate.data;
  const b = reference.data;
  for (let i = 0; i < a.length; i += 4) {
    const dr = a[i] - b[i];
    const dg = a[i + 1] - b[i + 1];
    const db = a[i + 2] - b[i + 2];
    if (dr === 0 && dg === 0 && db === 0) {
      const r = b[i];
      if (r > 224 && r < 240 && b[i + 1] > 224 && b[i + 1] < 240 && b[i + 2] > 224 && b[i + 2] < 240) continue;
      n += 3;
      continue;
    }
    const da = a[i] - 232;
    const db2 = b[i] - 232;
    const drawnA = (da > BG_TOL || da < -BG_TOL) || Math.abs(a[i + 1] - 232) > BG_TOL || Math.abs(a[i + 2] - 232) > BG_TOL;
    const drawnB = (db2 > BG_TOL || db2 < -BG_TOL) || Math.abs(b[i + 1] - 232) > BG_TOL || Math.abs(b[i + 2] - 232) > BG_TOL;
    if (!drawnA && !drawnB) continue;
    sum += (dr < 0 ? -dr : dr) + (dg < 0 ? -dg : dg) + (db < 0 ? -db : db);
    n += 3;
  }
  return n === 0 ? 0 : sum / n;
}

export function loadFrame(path: string): Plate {
  return readPlate(path);
}

// ---------------------------------------------------------------------------
// a pyramid, because a full-resolution difference is not an objective a search
// can walk
// ---------------------------------------------------------------------------
//
// Measured on `jump/f0001`: over a +-60 x 200 unit sweep of the hip alone the
// full-resolution figure never leaves 80..117, so every gradient a coordinate
// search can see there is noise and the fit stalls at a pose with almost no
// overlap. Box-averaging both sides first widens the basin the way image
// registration has always done it: coarse levels place the body, level 0 places
// the pixels. Only one level is ever built per evaluation.

export interface Level {
  a: Float32Array;
  w: number;
  h: number;
  block: number;
}

export function reduceTo(plate: Plate, block: number): Level {
  const w = plate.width;
  const h = plate.height;
  const bw = Math.ceil(w / block);
  const bh = Math.ceil(h / block);
  const a = new Float32Array(bw * bh * 3);
  fillLevel(plate, block, bw, bh, a);
  return { a, w: bw, h: bh, block };
}

function fillLevel(plate: Plate, block: number, bw: number, bh: number, out: Float32Array): void {
  out.fill(0);
  const w = plate.width;
  const h = plate.height;
  const d = plate.data;
  if (block === 1) {
    for (let i = 0, o = 0; i < d.length; i += 4, o += 3) {
      out[o] = d[i];
      out[o + 1] = d[i + 1];
      out[o + 2] = d[i + 2];
    }
    return;
  }
  for (let y = 0; y < h; y++) {
    const by = (y / block) | 0;
    let i = y * w * 4;
    for (let x = 0; x < w; x++, i += 4) {
      const o = (by * bw + ((x / block) | 0)) * 3;
      out[o] += d[i];
      out[o + 1] += d[i + 1];
      out[o + 2] += d[i + 2];
    }
  }
  const inv = 1 / (block * block);
  for (let k = 0; k < out.length; k++) out[k] *= inv;
  // edge blocks are short; rescale them by their true count
  const lastW = w - ((bw - 1) * block);
  const lastH = h - ((bh - 1) * block);
  if (lastW !== block) for (let by = 0; by < bh; by++) { const o = (by * bw + bw - 1) * 3; const f = block / lastW; out[o] *= f; out[o + 1] *= f; out[o + 2] *= f; }
  if (lastH !== block) for (let bx = 0; bx < bw; bx++) { const o = ((bh - 1) * bw + bx) * 3; const f = block / lastH; out[o] *= f; out[o + 1] *= f; out[o + 2] *= f; }
}

/** A scratch buffer per block size, so an evaluation allocates nothing. */
const scratch = new Map<number, Float32Array>();

/** Mean absolute difference against a prepared reference level. */
export function maeLevel(plate: Plate, ref: Level): number {
  let cur = scratch.get(ref.block);
  if (!cur || cur.length !== ref.a.length) {
    cur = new Float32Array(ref.a.length);
    scratch.set(ref.block, cur);
  }
  fillLevel(plate, ref.block, ref.w, ref.h, cur);
  const tol = ref.block === 1 ? BG_TOL : 2;
  const y = ref.a;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < cur.length; i += 3) {
    const dr = cur[i] - y[i];
    const dg = cur[i + 1] - y[i + 1];
    const db = cur[i + 2] - y[i + 2];
    const drawnA = Math.abs(cur[i] - 232) > tol || Math.abs(cur[i + 1] - 232) > tol || Math.abs(cur[i + 2] - 232) > tol;
    const drawnB = Math.abs(y[i] - 232) > tol || Math.abs(y[i + 1] - 232) > tol || Math.abs(y[i + 2] - 232) > tol;
    if (!drawnA && !drawnB) continue;
    sum += Math.abs(dr) + Math.abs(dg) + Math.abs(db);
    n += 3;
  }
  return n === 0 ? 0 : sum / n;
}

/** Centroid of everything drawn, in frame pixels — the cheap global register. */
export function centroid(plate: Plate): [number, number, number] {
  const d = plate.data;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < plate.height; y++) {
    let i = y * plate.width * 4;
    for (let x = 0; x < plate.width; x++, i += 4) {
      if (Math.abs(d[i] - 232) > BG_TOL || Math.abs(d[i + 1] - 232) > BG_TOL || Math.abs(d[i + 2] - 232) > BG_TOL) {
        sx += x;
        sy += y;
        n++;
      }
    }
  }
  return n === 0 ? [0, 0, 0] : [sx / n, sy / n, n];
}

/**
 * Total difference over a FIXED pixel set, divided by the reference's own drawn
 * count.
 *
 * `mae` divides by the union of what either side drew, and that denominator is
 * something a candidate can move: a large, mostly transparent sprite adds many
 * pixels whose error is small and the *mean* falls. The muzzle flare found that
 * hole and walked its scale to 13x, which then pushed this candidate's union
 * 32 px wider than the reference's and cost every set in `check` its framing.
 * A fixed denominator cannot be gamed.
 */
export function maeFixed(candidate: Plate, reference: Plate, refDrawn: number): number {
  const a = candidate.data;
  const b = reference.data;
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) {
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  }
  return sum / (3 * Math.max(1, refDrawn));
}

/** The drawn bounding box, in frame pixels. */
export function bbox(plate: Plate): { x0: number; y0: number; x1: number; y1: number } {
  const d = plate.data;
  let x0 = plate.width;
  let y0 = plate.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < plate.height; y++) {
    let i = y * plate.width * 4;
    for (let x = 0; x < plate.width; x++, i += 4) {
      if (Math.abs(d[i] - 232) > BG_TOL || Math.abs(d[i + 1] - 232) > BG_TOL || Math.abs(d[i + 2] - 232) > BG_TOL) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { x0, y0, x1, y1 };
}
