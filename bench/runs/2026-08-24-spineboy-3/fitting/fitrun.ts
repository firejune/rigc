/** Fit every frame of one animation. Usage: bun work/fitrun.ts <anim> [passes] */
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { Fitter, refFrame, cropPlate, knobsFor, scanPass, refinePass, ORDER, PAIRS, SPAN, type Pose, type Knob } from './fit.ts';
import { ink, inkCentre } from './harness.ts';
import type { Plate } from '../tools/plate.ts';

export const SETS: Record<string, number> = { aim: 1, death: 60, hit: 5, idle: 21, jump: 17, run: 9, shoot: 6, walk: 13 };
/** which fist the near hand shows, per shot — measured in work/probe-fist.ts */
/** which flare `shoot` shows on each 12 fps sample — see work/attachments.ts */
export const MUZZLE: Record<number, string> = { 2: 'muzzle01', 3: 'muzzle03', 4: 'muzzle04' };
export const FIST: Record<string, string> = JSON.parse(
  existsSync('work/fist.json') ? readFileSync('work/fist.json', 'utf8') : '{}',
);
const BG = 232;

function subjectBox(p: Plate): [number, number, number, number] {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
    const i = (y * p.width + x) * 4;
    if (Math.abs(p.data[i] - BG) > 8 || Math.abs(p.data[i+1] - BG) > 8 || Math.abs(p.data[i+2] - BG) > 8) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return [x0, y0, x1, y1];
}

const HIP_PENALTY = 2e-5;
function penalty(pose: Pose): number {
  const r = pose['hip']?.rotation ?? 0;
  return HIP_PENALTY * r * r;
}

export function fitAnimation(anim: string, opts: { passes?: number; seedFile?: string } = {}): Record<number, Pose> {
  const n = SETS[anim];
  const f = new Fitter();
  const frames: Plate[] = [];
  let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
  for (let i = 0; i < n; i++) {
    const p = refFrame(anim, i);
    frames.push(p);
    const [a, b, c, d] = subjectBox(p);
    bx0 = Math.min(bx0, a); by0 = Math.min(by0, b); bx1 = Math.max(bx1, c); by1 = Math.max(by1, d);
  }
  const PAD = 26;
  const X = Math.max(0, bx0 - PAD), Y = Math.max(0, by0 - PAD);
  const W = Math.min(384, bx1 + PAD) - X, H = Math.min(367, by1 + PAD) - Y;
  const view = f.window(X, Y, W, H);
  const crops = frames.map((p) => cropPlate(p, X, Y, W, H));
  const fist = FIST[anim] ?? 'front-fist-open';
  f.rig.setAttachment('front-fist', fist);
  // the muzzle flare is on the reference for three of `shoot`'s frames; without
  // it the ink guard would charge the pose for the flare's missing pixels.
  const muzzleAt = (i: number): string | null => (anim === 'shoot' ? (MUZZLE[i] ?? null) : null);

  const seeded: Record<number, Pose> = opts.seedFile && existsSync(opts.seedFile)
    ? JSON.parse(readFileSync(opts.seedFile, 'utf8'))[anim] ?? {}
    : {};

  const out: Record<number, Pose> = {};
  const refInk = crops.map((c) => ink(c));
  const refCentre = crops.map((c) => inkCentre(c));
  let armed = -2;
  const costOf = (pose: Pose, i: number, block: number) => {
    if (armed !== i) { f.rig.setAttachment('muzzle', muzzleAt(i)); armed = i; }
    return f.costGuarded(pose, view, crops[i], block, refInk[i]) + penalty(pose);
  };

  // order: start at frame 0, walk forward; each frame seeded by its neighbour
  const order = [...Array(n).keys()];
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(',').map(Number)) : null;
  const HARD = !!process.env.HARD;
  if (only) for (const i of order) if (!only.has(i) && seeded[i]) out[i] = JSON.parse(JSON.stringify(seeded[i]));
  for (const i of order) {
    if (only && !only.has(i)) continue;
    let pose: Pose = JSON.parse(JSON.stringify(seeded[i] ?? out[i - 1] ?? {}));
    // place the body first, by matching drawn-box centres — then the scan only
    // has to search a plausible neighbourhood rather than the whole stage.
    const rc = refCentre[i];
    if (rc) {
      const hip = (pose['hip'] ??= {});
      for (let k = 0; k < 3; k++) {
        const mc = f.centreOf(pose, view);
        if (!mc) { hip.x = 0; hip.y = 0; continue; }
        hip.x = (hip.x ?? 0) + (rc[0] - mc[0]) / f.full.scale;
        hip.y = (hip.y ?? 0) - (rc[1] - mc[1]) / f.full.scale;
      }
    }
    const anchorX = pose['hip']?.x ?? 0, anchorY = pose['hip']?.y ?? 0;
    const bound = (kn: Knob[]): Knob[] => kn.map((k) => k.bone !== 'hip' || k.prop === 'rotation' ? k
      : { ...k, lo: (k.prop === 'x' ? anchorX : anchorY) - 90, hi: (k.prop === 'x' ? anchorX : anchorY) + 90, step: 6 });
    const wide = !out[i - 1] || anim === 'death' || anim === 'hit';
    // three levels, coarse to fine
    for (const [block, kn] of [[8, bound(knobsFor(pose, wide))], [4, bound(knobsFor(pose, false))], [2, bound(knobsFor(pose, false))]] as [number, Knob[]][]) {
      const seeds: number[][] = [];
      if (out[i - 1]) seeds.push(kn.map((k) => out[i - 1][k.bone]?.[k.prop] ?? 0));
      if (out[i - 2]) seeds.push(kn.map((k) => {
        const a = out[i - 1][k.bone]?.[k.prop] ?? 0, b = out[i - 2][k.bone]?.[k.prop] ?? 0;
        return 2 * a - b;
      }));
      const reps = HARD ? 3 : 1;
      for (let r = 0; r < reps; r++) {
        scanPassP(f, pose, kn.map((k) => (HARD && k.prop === 'rotation' ? { ...k, step: Math.max(2, k.step / 2) } : k)), view, crops[i], block, seeds, costOf, i);
        if (block >= 4) pairScan(pose, block, costOf, i, HARD ? 8 : 12);
      }
    }
    const fine = knobsFor(pose, false);
    refinePassP(f, pose, fine, view, crops[i], 1, [12, 6, 3, 1.5, 0.75, 0.35, 0.15], costOf, i);
    out[i] = pose;
    process.stderr.write(`${anim} f${i} ${costOf(pose, i, 1).toFixed(3)}\n`);
  }
  // refinement sweeps in both directions, seeded by both neighbours
  const passes = opts.passes ?? 1;
  for (let p = 0; p < passes; p++) {
    const dir = p % 2 === 0 ? [...order].reverse() : order;
    for (const i of dir) {
      if (only && !only.has(i)) continue;
      const pose = out[i];
      const kn = knobsFor(pose, false).map((k) => k.bone !== 'hip' || k.prop === 'rotation' ? k
        : { ...k, lo: (pose['hip']?.[k.prop] ?? 0) - 60, hi: (pose['hip']?.[k.prop] ?? 0) + 60, step: 5 });
      const seeds: number[][] = [];
      for (const j of [i - 1, i + 1]) if (out[j]) seeds.push(kn.map((k) => out[j][k.bone]?.[k.prop] ?? 0));
      scanPassP(f, pose, kn, view, crops[i], 2, seeds, costOf, i);
      refinePassP(f, pose, kn, view, crops[i], 1, [6, 3, 1.5, 0.75, 0.35, 0.15], costOf, i);
    }
    process.stderr.write(`${anim} pass ${p} mean ${(order.reduce((s, i) => s + costOf(out[i], i, 1), 0) / n).toFixed(3)}\n`);
  }
  return out;
}

type CostFn = (pose: Pose, i: number, block: number) => number;
/** §8.1: a hand's place is decided by the two links above it together. */
function pairScan(pose: Pose, block: number, costOf: CostFn, i: number, grid = 12): void {
  for (const [a, b] of PAIRS) {
    const sa = (pose[a] ??= {}), sb = (pose[b] ??= {});
    const ca = sa.rotation ?? 0, cb = sb.rotation ?? 0;
    let best = costOf(pose, i, block), ba = ca, bb = cb;
    const spanA = SPAN[a] ?? 70, spanB = SPAN[b] ?? 70;
    for (let x = -spanA; x <= spanA; x += grid) for (let y = -spanB; y <= spanB; y += grid) {
      sa.rotation = x; sb.rotation = y;
      const c = costOf(pose, i, block);
      if (c < best) { best = c; ba = x; bb = y; }
    }
    sa.rotation = ba; sb.rotation = bb;
  }
}
function scanPassP(f: Fitter, pose: Pose, knobs: Knob[], view: ReturnType<Fitter['window']>, crop: Plate, block: number, seeds: number[][], costOf: CostFn, i: number): void {
  void f; void view; void crop;
  let best = costOf(pose, i, block);
  for (let k = 0; k < knobs.length; k++) {
    const kn = knobs[k];
    const slot = (pose[kn.bone] ??= {});
    const cur = slot[kn.prop] ?? 0;
    let bestV = cur;
    const tries: number[] = [];
    for (let v = kn.lo; v <= kn.hi + 1e-9; v += kn.step) tries.push(v);
    for (const s of seeds) if (s[k] !== undefined) tries.push(s[k]);
    for (const v of tries) {
      slot[kn.prop] = v;
      const c = costOf(pose, i, block);
      if (c < best) { best = c; bestV = v; }
    }
    slot[kn.prop] = bestV;
  }
}
function refinePassP(f: Fitter, pose: Pose, knobs: Knob[], view: ReturnType<Fitter['window']>, crop: Plate, block: number, steps: number[], costOf: CostFn, i: number): void {
  void f; void view; void crop;
  let best = costOf(pose, i, block);
  for (const st of steps) for (const kn of knobs) {
    const slot = (pose[kn.bone] ??= {});
    const cur = slot[kn.prop] ?? 0;
    let bestV = cur;
    for (const v of [cur - st, cur + st]) {
      slot[kn.prop] = v;
      const c = costOf(pose, i, block);
      if (c < best - 1e-7) { best = c; bestV = v; }
    }
    slot[kn.prop] = bestV;
  }
}

void ORDER; void scanPass; void refinePass;

if (import.meta.main) {
  const anim = process.argv[2];
  const passes = Number(process.argv[3] ?? 1);
  const outFile = process.argv[4] ?? `work/placements-${anim}.json`;
  const t0 = Date.now();
  const res = fitAnimation(anim, { passes, seedFile: process.argv[5] });
  writeFileSync(outFile, JSON.stringify({ [anim]: res }, null, 1));
  console.error(`${anim} done in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${outFile}`);
}
