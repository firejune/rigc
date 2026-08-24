/**
 * Renderer-in-the-loop harness: pose the compiled candidate through
 * `bone.pose` (§9.1), render into a sub-window of frames.json's own box at the
 * frames' own scale, and score against the reference frame there.
 */
import { Physics, Skeleton, type Bone } from '@esotericsoftware/spine-core';
import { loadPosable, piecesOf, projector, blitPiece, pageFor, type Posable, type Viewport } from '../../../../src/render.ts';
import { Plate, readPlate, encodePng, type RGBA } from '../../../../tools/plate.ts';
import { readFileSync, writeFileSync } from 'node:fs';

export const BG: RGBA = [232, 232, 232, 255];

export interface Sidecar { viewport: { x: number; y: number; width: number; height: number; scale: number; pixelWidth: number; pixelHeight: number } }

export function fullViewport(sidecarPath: string): Viewport {
  const s = JSON.parse(readFileSync(sidecarPath, 'utf8')) as Sidecar;
  const v = s.viewport;
  return { minX: v.x, minY: v.y, maxX: v.x + v.width, maxY: v.y + v.height, scale: v.scale, width: v.pixelWidth, height: v.pixelHeight };
}

/** A pixel-aligned sub-window of the full viewport. */
export function windowViewport(full: Viewport, px: number, py: number, w: number, h: number): Viewport {
  const minX = full.minX + px / full.scale;
  const maxY = full.maxY - py / full.scale;
  return { minX, minY: maxY - h / full.scale, maxX: minX + w / full.scale, maxY, scale: full.scale, width: w, height: h };
}

export interface PoseKnob { bone: string; prop: 'rotation' | 'x' | 'y' | 'scaleX' | 'scaleY' }

export class Rigger {
  readonly posable: Posable;
  readonly skeleton: Skeleton;
  readonly bones = new Map<string, Bone>();
  constructor(dir: string) {
    this.posable = loadPosable(`${dir}/skeleton.json`, `${dir}/skeleton.atlas`, dir);
    this.skeleton = new Skeleton(this.posable.data);
    this.skeleton.setupPose();
    for (const b of this.skeleton.bones) this.bones.set(b.data.name, b);
  }
  reset(): void { this.skeleton.setupPose(); }
  /**
   * pose: bone -> local transform RELATIVE TO SETUP, which is what a Spine
   * timeline holds: rotate/translate add to the setup value, scale multiplies
   * it. So a fitted number is a key value, not a coordinate to convert later.
   */
  apply(pose: Record<string, Partial<Record<'rotation' | 'x' | 'y' | 'scaleX' | 'scaleY', number>>>): void {
    this.skeleton.setupPoseBones();
    for (const [name, t] of Object.entries(pose)) {
      const b = this.bones.get(name);
      if (!b) throw new Error(`no bone "${name}"`);
      const P = b.pose as unknown as Record<string, number>;
      for (const [k, v] of Object.entries(t)) {
        if (k === 'scaleX' || k === 'scaleY') P[k] *= v as number;
        else P[k] += v as number;
      }
    }
    this.skeleton.update(0);
    this.skeleton.updateWorldTransform(Physics.update);
  }
  setAttachment(slot: string, attachment: string | null): void {
    const s = this.skeleton.slots.find((x) => x.data.name === slot);
    if (!s) throw new Error(`no slot "${slot}"`);
    s.pose.attachment = attachment === null ? null : this.skeleton.getAttachment(slot, attachment);
    s.data.setupPose.attachment = s.pose.attachment;
  }
  private blank: Uint8Array | null = null;
  private blankKey = '';
  /** §9.1: a region's offsets are cached, so every write needs updateSequence(). */
  setAttachmentTransform(slot: string, name: string, t: Partial<Record<'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY', number>>): void {
    const a = this.skeleton.getAttachment(slot, name) as unknown as Record<string, number> & { updateSequence(): void };
    if (!a) throw new Error(`no attachment "${name}" on slot "${slot}"`);
    for (const [k, v] of Object.entries(t)) a[k] = v as number;
    a.updateSequence();
  }
  render(view: Viewport): Plate {
    const plate = new Plate(view.width, view.height);
    const key = `${view.width}x${view.height}`;
    if (this.blankKey !== key) {
      const b = new Uint8Array(plate.data.length);
      for (let i = 0; i < b.length; i += 4) { b[i] = BG[0]; b[i+1] = BG[1]; b[i+2] = BG[2]; b[i+3] = 255; }
      this.blank = b; this.blankKey = key;
    }
    plate.data.set(this.blank!);
    const project = projector(view);
    for (const piece of piecesOf(this.skeleton)) blitPiece(plate, pageFor(this.posable.pages, piece), piece, project);
    return plate;
  }
}

/** Box-averaged mean |dRGB| between two equally sized plates. block=1 is exact. */
export function cost(a: Plate, b: Plate, block = 1): number {
  const W = a.width, H = a.height;
  if (block <= 1) {
    let acc = 0;
    for (let i = 0; i < a.data.length; i += 4) acc += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i+1] - b.data[i+1]) + Math.abs(a.data[i+2] - b.data[i+2]);
    return acc / (W * H * 3);
  }
  const bw = Math.ceil(W / block), bh = Math.ceil(H / block);
  const A = new Float64Array(bw * bh * 3), B = new Float64Array(bw * bh * 3), N = new Float64Array(bw * bh);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const bi = (Math.floor(y / block) * bw + Math.floor(x / block));
    const i = (y * W + x) * 4;
    for (let c = 0; c < 3; c++) { A[bi * 3 + c] += a.data[i + c]; B[bi * 3 + c] += b.data[i + c]; }
    N[bi]++;
  }
  let acc = 0;
  for (let bi = 0; bi < bw * bh; bi++) for (let c = 0; c < 3; c++) acc += Math.abs(A[bi * 3 + c] - B[bi * 3 + c]) / N[bi];
  return acc / (bw * bh * 3);
}

/** how many pixels a plate draws (differ from the backdrop by >8 on a channel). */
export function ink(p: Plate): number {
  let n = 0;
  for (let i = 0; i < p.data.length; i += 4)
    if (Math.abs(p.data[i] - BG[0]) > 8 || Math.abs(p.data[i+1] - BG[1]) > 8 || Math.abs(p.data[i+2] - BG[2]) > 8) n++;
  return n;
}
/** drawn box centre, in the plate's own pixels; null when nothing is drawn. */
export function inkCentre(p: Plate): [number, number] | null {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
    const i = (y * p.width + x) * 4;
    if (Math.abs(p.data[i] - BG[0]) > 8 || Math.abs(p.data[i+1] - BG[1]) > 8 || Math.abs(p.data[i+2] - BG[2]) > 8) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : [(x0 + x1) / 2, (y0 + y1) / 2];
}
export function cropPlate(src: Plate, px: number, py: number, w: number, h: number): Plate {
  const out = new Plate(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = px + x, sy = py + y;
    const di = (y * w + x) * 4;
    if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) { out.data[di] = BG[0]; out.data[di+1] = BG[1]; out.data[di+2] = BG[2]; out.data[di+3] = 255; continue; }
    const si = (sy * src.width + sx) * 4;
    out.data[di] = src.data[si]; out.data[di+1] = src.data[si+1]; out.data[di+2] = src.data[si+2]; out.data[di+3] = 255;
  }
  return out;
}

export function savePlate(p: Plate, path: string): void { writeFileSync(path, encodePng(p.width, p.height, p.data)); }
export { readPlate };
