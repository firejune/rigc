/**
 * Pose fitting against the reference FRAMES (AUTHORING.md §8.1).
 *
 * Nothing here opens a reference export. It renders the candidate
 * skeleton this run authored, through `src/render.ts` — the same rasteriser that
 * drew the frames — into `frames.json`'s own declared box, and minimises the
 * pixel difference over each frame's own drawn pixels.
 *
 * The objective is a SUM of absolute RGB differences over the union of the two
 * sides' drawn pixels, not a mean: the union's denominator is half the
 * candidate's, so a mean falls for a candidate that grew its ink (§9.2's
 * warning). A sum cannot be bought that way.
 */
import { readFileSync } from 'node:fs';
import { Skeleton, Physics } from '@esotericsoftware/spine-core';
import { posableFromText, piecesOf, projector, rasterisePiece, pageFor, viewportOfSize, type Viewport, type Posable, type Piece } from '../../../../src/render.ts';
import { readPlate, type Plate } from '../../../../tools/plate.ts';

export const BG: [number, number, number, number] = [232, 232, 232, 255];
export const REF_ROOT = 'bench/reference/4-wave-principle';

export interface Sidecar {
  viewport: { x: number; y: number; width: number; height: number; scale: number; pixelWidth: number; pixelHeight: number };
  sets: { dir: string; animation: string; fps: number; sampled: number; written: number; duration: number }[];
}

export function sidecar(): Sidecar {
  return JSON.parse(readFileSync(`${REF_ROOT}/frames.json`, 'utf8')) as Sidecar;
}

/** The declared box, optionally at 1/k of its pixel scale (box-averaged compare). */
export function declaredViewport(s: Sidecar, k = 1): Viewport {
  const v = s.viewport;
  const w = Math.round(v.pixelWidth / k);
  const h = Math.round(v.pixelHeight / k);
  return viewportOfSize(v.x, v.y, v.width, v.height, v.scale / k, w, h);
}

// ---------------------------------------------------------------------------
// the reference side, precomputed
// ---------------------------------------------------------------------------

export interface RefFrame {
  /** RGB, row major, width*height*3. */
  rgb: Uint8Array;
  width: number;
  height: number;
  /** 1 where the pixel differs from the background. */
  ink: Uint8Array;
  /** sum over ink pixels of |ref - bg| (RGB, L1). */
  inkCost: number;
  inkCount: number;
}

const INK_TOL = 8 * 3; // matches src/framing.ts BACKGROUND_TOLERANCE, summed over RGB

function boxDown(p: Plate, k: number): { rgb: Uint8Array; width: number; height: number } {
  const w = Math.round(p.width / k);
  const h = Math.round(p.height / k);
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let j = y * k; j < Math.min((y + 1) * k, p.height); j++) {
        for (let i = x * k; i < Math.min((x + 1) * k, p.width); i++) {
          const s = (j * p.width + i) * 4;
          r += p.data[s]; g += p.data[s + 1]; b += p.data[s + 2]; n++;
        }
      }
      const d = (y * w + x) * 3;
      rgb[d] = Math.round(r / n); rgb[d + 1] = Math.round(g / n); rgb[d + 2] = Math.round(b / n);
    }
  }
  return { rgb, width: w, height: h };
}

export function refFrame(path: string, k = 1): RefFrame {
  const plate = readPlate(path);
  const { rgb, width, height } = k === 1
    ? (() => {
        const out = new Uint8Array(plate.width * plate.height * 3);
        for (let i = 0, s = 0; s < plate.data.length; s += 4, i += 3) {
          out[i] = plate.data[s]; out[i + 1] = plate.data[s + 1]; out[i + 2] = plate.data[s + 2];
        }
        return { rgb: out, width: plate.width, height: plate.height };
      })()
    : boxDown(plate, k);
  const ink = new Uint8Array(width * height);
  let inkCost = 0, inkCount = 0;
  for (let p = 0; p < width * height; p++) {
    const d = Math.abs(rgb[p * 3] - BG[0]) + Math.abs(rgb[p * 3 + 1] - BG[1]) + Math.abs(rgb[p * 3 + 2] - BG[2]);
    if (d > INK_TOL) { ink[p] = 1; inkCost += d; inkCount++; }
  }
  return { rgb, width, height, ink, inkCost, inkCount };
}

/** A tile cut out of a contact sheet, as a comparable frame. */
export function sheetTiles(path: string, tiles: number, columns: number, pw: number, ph: number): RefFrame[] {
  const plate = readPlate(path);
  const across = plate.width - 1;
  const rows = Math.ceil(tiles / columns);
  const down = plate.height - 1;
  const tw = across / columns - 1;
  const th = down / rows - 1;
  if (!Number.isInteger(tw) || !Number.isInteger(th)) throw new Error(`sheet ${path} is not a ${columns}-column grid`);
  const out: RefFrame[] = [];
  for (let index = 0; index < tiles; index++) {
    const ox = 1 + (index % columns) * (tw + 1);
    const oy = 1 + Math.floor(index / columns) * (th + 1);
    const rgb = new Uint8Array(tw * th * 3);
    const ink = new Uint8Array(tw * th);
    let inkCost = 0, inkCount = 0;
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const s = ((oy + y) * plate.width + ox + x) * 4;
        const p = y * tw + x;
        rgb[p * 3] = plate.data[s]; rgb[p * 3 + 1] = plate.data[s + 1]; rgb[p * 3 + 2] = plate.data[s + 2];
        // the label the sheet burns into the tile corner is not the shot: make it
        // read as background on both sides so it cannot enter the difference
        if (y < 2 + 7 + 1 && x < 2 + 24 + 1) {
          rgb[p * 3] = BG[0]; rgb[p * 3 + 1] = BG[1]; rgb[p * 3 + 2] = BG[2];
          continue;
        }
        const d = Math.abs(rgb[p * 3] - BG[0]) + Math.abs(rgb[p * 3 + 1] - BG[1]) + Math.abs(rgb[p * 3 + 2] - BG[2]);
        if (d > INK_TOL) { ink[p] = 1; inkCost += d; inkCount++; }
      }
    }
    out.push({ rgb, width: tw, height: th, ink, inkCost, inkCount });
  }
  void pw; void ph;
  return out;
}

// ---------------------------------------------------------------------------
// the candidate side: pose, render into a scratch buffer, score
// ---------------------------------------------------------------------------

export interface Knobs {
  px: number; py: number; prot: number;
  c1: number; c2: number; c3: number; c4: number; ce: number;
  bx: number; by: number; brot: number; bsx: number; bsy: number; srot: number;
  /** basket-ball slot alpha: the ball loses its colour once it is thrown. */
  balpha: number;
  /** basket-lambertian slot alpha — a setup value, fitted then pinned. */
  lalpha: number;
  ball: boolean;
}

export const CHAIN_SLOTS = ['chain-1', 'chain-2', 'chain-3', 'chain-4', 'chain-end'];
export const BALL_SLOTS = ['basket-ball', 'basket-lambertian'];

export class Scratch {
  readonly width: number;
  readonly height: number;
  private rgba: Float64Array;
  private stamp: Int32Array;
  private gen = 0;
  private touched: number[] = [];
  constructor(width: number, height: number) {
    this.width = width; this.height = height;
    this.rgba = new Float64Array(width * height * 4);
    this.stamp = new Int32Array(width * height);
  }
  begin(): void { this.gen++; this.touched.length = 0; }
  blend(px: number, py: number, r: number, g: number, b: number, a: number): void {
    const p = py * this.width + px;
    if (this.stamp[p] !== this.gen) {
      this.stamp[p] = this.gen; this.touched.push(p);
      const i = p * 4;
      this.rgba[i] = BG[0]; this.rgba[i + 1] = BG[1]; this.rgba[i + 2] = BG[2]; this.rgba[i + 3] = 255;
    }
    const i = p * 4;
    const sa = a / 255;
    this.rgba[i] = this.rgba[i] * (1 - sa) + r * sa;
    this.rgba[i + 1] = this.rgba[i + 1] * (1 - sa) + g * sa;
    this.rgba[i + 2] = this.rgba[i + 2] * (1 - sa) + b * sa;
  }
  /** Sum |candidate - reference| over the union of both sides' drawn pixels. */
  score(ref: RefFrame): number {
    let sum = 0, reclaimed = 0;
    for (const p of this.touched) {
      const i = p * 4, r = p * 3;
      sum += Math.abs(this.rgba[i] - ref.rgb[r]) + Math.abs(this.rgba[i + 1] - ref.rgb[r + 1]) + Math.abs(this.rgba[i + 2] - ref.rgb[r + 2]);
      if (ref.ink[p]) {
        reclaimed += Math.abs(ref.rgb[r] - BG[0]) + Math.abs(ref.rgb[r + 1] - BG[1]) + Math.abs(ref.rgb[r + 2] - BG[2]);
      }
    }
    return sum + (ref.inkCost - reclaimed);
  }
  /** MAE over the union, on check's own scale (0..255, mean per channel). */
  mae(ref: RefFrame): number {
    let sum = 0, reclaimed = 0, union = 0;
    for (const p of this.touched) {
      const i = p * 4, r = p * 3;
      const d = Math.abs(this.rgba[i] - ref.rgb[r]) + Math.abs(this.rgba[i + 1] - ref.rgb[r + 1]) + Math.abs(this.rgba[i + 2] - ref.rgb[r + 2]);
      // "drawn" on the candidate side means it differs from the background
      const own = Math.abs(this.rgba[i] - BG[0]) + Math.abs(this.rgba[i + 1] - BG[1]) + Math.abs(this.rgba[i + 2] - BG[2]);
      if (own > INK_TOL || ref.ink[p]) { sum += d; union++; }
      if (ref.ink[p]) reclaimed += Math.abs(ref.rgb[r] - BG[0]) + Math.abs(ref.rgb[r + 1] - BG[1]) + Math.abs(ref.rgb[r + 2] - BG[2]);
    }
    const rest = ref.inkCount - this.touched.filter((p) => ref.ink[p]).length;
    void reclaimed;
    let restCost = 0;
    if (rest > 0) {
      // reference ink the candidate did not touch: full cost against the background
      let seen = 0;
      const touchedSet = new Set(this.touched);
      for (let p = 0; p < ref.width * ref.height; p++) {
        if (!ref.ink[p] || touchedSet.has(p)) continue;
        const r = p * 3;
        restCost += Math.abs(ref.rgb[r] - BG[0]) + Math.abs(ref.rgb[r + 1] - BG[1]) + Math.abs(ref.rgb[r + 2] - BG[2]);
        seen++;
      }
      void seen;
    }
    return (sum + restCost) / Math.max(1, union + rest) / 3;
  }
}

export interface Rig {
  posable: Posable;
  skeleton: Skeleton;
}

export function rigFrom(skeletonText: string, atlasText: string, atlasDir: string): Rig {
  const posable = posableFromText(skeletonText, atlasText, atlasDir);
  return { posable, skeleton: new Skeleton(posable.data) };
}

export function pose(rig: Rig, k: Knobs): Piece[] {
  const s = rig.skeleton;
  s.setupPose();
  const set = (name: string, f: (b: { x: number; y: number; rotation: number; scaleX: number; scaleY: number }) => void) => {
    const b = s.findBone(name);
    if (!b) throw new Error(`no bone "${name}"`);
    f(b.pose);
  };
  set('platform', (p) => { p.x = k.px; p.y = k.py; p.rotation = k.prot; });
  set('chain-1', (p) => { p.rotation = k.c1; });
  set('chain-2', (p) => { p.rotation = k.c2; });
  set('chain-3', (p) => { p.rotation = k.c3; });
  set('chain-4', (p) => { p.rotation = k.c4; });
  set('chain-end', (p) => { p.rotation = k.ce; });
  set('basket-lambertian', (p) => { p.x = k.bx; p.y = k.by; p.rotation = k.brot; p.scaleX = k.bsx; p.scaleY = k.bsy; });
  set('basket-ball', (p) => { p.rotation = k.srot; });
  const bs = s.findSlot('basket-ball');
  if (bs) { bs.pose.color.a = k.balpha; bs.appliedPose.color.a = k.balpha; }
  const ls = s.findSlot('basket-lambertian');
  if (ls) { ls.pose.color.a = k.lalpha; ls.appliedPose.color.a = k.lalpha; }
  s.update(0);
  s.updateWorldTransform(Physics.reset);
  const pieces = piecesOf(s);
  return k.ball ? pieces : pieces.filter((p) => !BALL_SLOTS.includes(p.slot));
}

export function renderInto(scratch: Scratch, rig: Rig, pieces: Piece[], v: Viewport): void {
  scratch.begin();
  const project = projector(v);
  const clip = { width: v.width, height: v.height };
  for (const piece of pieces) {
    rasterisePiece(pageFor(rig.posable.pages, piece), piece, project, clip, (px, py, r, g, b, a) => scratch.blend(px, py, r, g, b, a));
  }
}

export function scoreKnobs(scratch: Scratch, rig: Rig, v: Viewport, ref: RefFrame, k: Knobs): number {
  renderInto(scratch, rig, pose(rig, k), v);
  return scratch.score(ref);
}
