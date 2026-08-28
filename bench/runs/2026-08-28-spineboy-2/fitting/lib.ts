/**
 * Shared measurement library for the 2026-08-28 spineboy run.
 * Reads ONLY: reference frames/sheets/frames.json, examples/spineboy/images/,
 * and the candidate's own artifacts. Never the reference export.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Plate, readPlate } from '../../../../tools/plate.ts';

export const ROOT = join(import.meta.dir, '../../../..');
export const REF = join(ROOT, 'bench/reference/spineboy/ess');
export const IMAGES = join(ROOT, 'examples/spineboy/images');
export const RUN = join(import.meta.dir, '..');

export const BG = [232, 232, 232] as const;
export const TOL = 8; // CHANGE_TOLERANCE / BACKGROUND_TOLERANCE (src/check.ts, src/framing.ts)

export interface Sidecar {
  background: number[];
  viewport: { x: number; y: number; width: number; height: number; scale: number; pixelWidth: number; pixelHeight: number };
  sets: { dir: string; animation: string | null; fps: number; sampled: number; written: number; stride: number; duration: number }[];
}
export function sidecar(): Sidecar {
  return JSON.parse(readFileSync(join(REF, 'frames.json'), 'utf8'));
}

/** frames of one 12fps set, in index order */
export function refFrames(set: string): Plate[] {
  const dir = join(REF, set);
  const files = readdirSync(dir).filter((f) => /^f\d+\.png$/.test(f)).sort();
  return files.map((f) => readPlate(join(dir, f)));
}
export function refFramePaths(set: string): string[] {
  const dir = join(REF, set);
  return readdirSync(dir).filter((f) => /^f\d+\.png$/.test(f)).sort().map((f) => join(dir, f));
}

/** is pixel drawn (differs from background by > TOL on some channel)? */
export function isInk(p: Plate, x: number, y: number, tol = TOL): boolean {
  const i = (y * p.width + x) * 4;
  const d = p.data;
  return Math.abs(d[i] - BG[0]) > tol || Math.abs(d[i + 1] - BG[1]) > tol || Math.abs(d[i + 2] - BG[2]) > tol;
}

/** changed pixels between two plates at a channel tolerance (whole frame) */
export function changedPixels(a: Plate, b: Plate, tol = TOL): number {
  const n = a.width * a.height * 4;
  let c = 0;
  for (let i = 0; i < n; i += 4) {
    if (
      Math.abs(a.data[i] - b.data[i]) > tol ||
      Math.abs(a.data[i + 1] - b.data[i + 1]) > tol ||
      Math.abs(a.data[i + 2] - b.data[i + 2]) > tol
    )
      c++;
  }
  return c;
}

export interface Box { minX: number; minY: number; maxX: number; maxY: number }
export function inkBox(p: Plate, tol = TOL): Box | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < p.width; x++)
      if (isInk(p, x, y, tol)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

/** load art PNG */
export function art(name: string): Plate {
  return readPlate(join(IMAGES, name.endsWith('.png') ? name : name + '.png'));
}

/** downsample a plate by box-averaging factor k (RGB against background fill for empty) */
export function pyramid(p: Plate, k: number): Float32Array {
  const w = Math.ceil(p.width / k), h = Math.ceil(p.height / k);
  const out = new Float32Array(w * h * 3);
  const cnt = new Float32Array(w * h);
  for (let y = 0; y < p.height; y++) {
    const by = Math.floor(y / k);
    for (let x = 0; x < p.width; x++) {
      const bx = Math.floor(x / k);
      const i = (y * p.width + x) * 4;
      const o = (by * w + bx) * 3;
      out[o] += p.data[i];
      out[o + 1] += p.data[i + 1];
      out[o + 2] += p.data[i + 2];
      cnt[by * w + bx]++;
    }
  }
  for (let j = 0; j < w * h; j++) {
    out[j * 3] /= cnt[j];
    out[j * 3 + 1] /= cnt[j];
    out[j * 3 + 2] /= cnt[j];
  }
  return out;
}

export function pyrSize(p: { width: number; height: number }, k: number) {
  return { w: Math.ceil(p.width / k), h: Math.ceil(p.height / k) };
}
