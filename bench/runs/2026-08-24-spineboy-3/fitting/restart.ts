/**
 * Multi-start re-fit for the frames a coordinate scan cannot reach.
 *
 * §8.1 says to scan each knob's whole plausible range rather than line-search
 * out from where it sits, and the inherited fitter does — per knob. What that
 * still cannot escape is a minimum two CHAINS share: on `hit` f0 my near arm
 * and the gun are lying where the reference's legs are, so a scan that tries
 * moving a leg into that region finds it already inked and reports no
 * improvement, correctly, on the objective it was given. §8.1's paired scan
 * fixes the version of this inside one chain (a hand under three rotations);
 * this is the version across two, and the cheap answer to it is more than one
 * start.
 *
 * Starts, in order of how much they usually buy: where the frame already is,
 * its two neighbours, the setup pose, and the poses of a few frames spread
 * across the same shot. Every start runs the same coarse-to-fine schedule and
 * the best of them wins on the plain guarded objective, so this can only
 * improve a frame — the incumbent is one of the candidates.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { Fitter, refFrame, cropPlate, knobsFor, PAIRS, SPAN, type Pose, type Knob } from './fit.ts';
import { ink, inkCentre } from './harness.ts';
import { SETS, MUZZLE, FIST } from './fitrun.ts';
import type { Plate } from '../../../../tools/plate.ts';

const BG = 232;
function box(p: Plate): [number, number, number, number] {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
    const i = (y * p.width + x) * 4;
    if (Math.abs(p.data[i]-BG) > 8 || Math.abs(p.data[i+1]-BG) > 8 || Math.abs(p.data[i+2]-BG) > 8) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return [x0, y0, x1, y1];
}
const clone = (p: Pose): Pose => JSON.parse(JSON.stringify(p));

const anim = process.argv[2];
const pick = process.env.FRAMES ? new Set(process.env.FRAMES.split(',').flatMap((s) => {
  const [a, b] = s.split('-').map(Number); return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, k) => a + k);
})) : null;
const EDGEW = Number(process.env.EDGEW ?? 0.04);
const KEEP = Number(process.env.KEEP ?? 2);

const n = SETS[anim];
const file = `work/placements-${anim}.json`;
const store = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<number, Pose>>;
const poses = store[anim];
const f = new Fitter();
const frames: Plate[] = [];
let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
for (let i = 0; i < n; i++) {
  const p = refFrame(anim, i); frames.push(p);
  const b = box(p);
  bx0 = Math.min(bx0, b[0]); by0 = Math.min(by0, b[1]); bx1 = Math.max(bx1, b[2]); by1 = Math.max(by1, b[3]);
}
const PAD = 26;
const X = Math.max(0, bx0 - PAD), Y = Math.max(0, by0 - PAD);
const W = Math.min(384, bx1 + PAD) - X, H = Math.min(367, by1 + PAD) - Y;
const view = f.window(X, Y, W, H);
const crops = frames.map((p) => cropPlate(p, X, Y, W, H));
const refInk = crops.map((c) => ink(c));
const refBox = crops.map((c) => box(c));
const refCentre = crops.map((c) => inkCentre(c));
f.rig.setAttachment('front-fist', FIST[anim] ?? 'front-fist-open');
let armed = -2;
const arm = (i: number) => { const w = anim === 'shoot' ? (MUZZLE[i] ?? null) : null; if (armed !== i) { f.rig.setAttachment('muzzle', w); armed = i; } };
const HIP = 2e-5;
const plain = (pose: Pose, i: number, block = 1) => {
  arm(i);
  const r = pose['hip']?.rotation ?? 0;
  return f.costGuarded(pose, view, crops[i], block, refInk[i]) + HIP * r * r;
};
/** the objective the search minimises: the picture, plus the frame's own box. */
const obj = (pose: Pose, i: number, block = 1) => {
  const c = plain(pose, i, block);
  f.rig.apply(pose);
  const b = box(f.rig.render(view)), r = refBox[i];
  return c + EDGEW * (Math.abs(b[0]-r[0]) + Math.abs(b[1]-r[1]) + Math.abs(b[2]-r[2]) + Math.abs(b[3]-r[3]));
};

function place(pose: Pose, i: number): void {
  const rc = refCentre[i]; if (!rc) return;
  const hip = (pose['hip'] ??= {});
  for (let k = 0; k < 3; k++) {
    arm(i); f.rig.apply(pose);
    const mc = inkCentre(f.rig.render(view));
    if (!mc) { hip.x = 0; hip.y = 0; continue; }
    hip.x = (hip.x ?? 0) + (rc[0] - mc[0]) / f.full.scale;
    hip.y = (hip.y ?? 0) - (rc[1] - mc[1]) / f.full.scale;
  }
}
function scan(pose: Pose, kn: Knob[], i: number, block: number): void {
  let best = obj(pose, i, block);
  for (const k of kn) {
    const slot = (pose[k.bone] ??= {});
    const cur = slot[k.prop] ?? 0;
    let bv = cur;
    for (let v = k.lo; v <= k.hi + 1e-9; v += k.step) { slot[k.prop] = v; const c = obj(pose, i, block); if (c < best) { best = c; bv = v; } }
    slot[k.prop] = bv;
  }
}
function pairs(pose: Pose, i: number, block: number, grid: number): void {
  for (const [a, b] of PAIRS) {
    const sa = (pose[a] ??= {}), sb = (pose[b] ??= {});
    let best = obj(pose, i, block), ba = sa.rotation ?? 0, bb = sb.rotation ?? 0;
    const spanA = SPAN[a] ?? 70, spanB = SPAN[b] ?? 70;
    for (let x = -spanA; x <= spanA; x += grid) for (let y = -spanB; y <= spanB; y += grid) {
      sa.rotation = x; sb.rotation = y;
      const c = obj(pose, i, block);
      if (c < best) { best = c; ba = x; bb = y; }
    }
    sa.rotation = ba; sb.rotation = bb;
  }
}
function refine(pose: Pose, i: number, steps: number[]): void {
  let best = obj(pose, i, 1);
  for (const st of steps) for (const k of knobsFor(pose, false)) {
    const slot = (pose[k.bone] ??= {});
    const cur = slot[k.prop] ?? 0;
    let bv = cur;
    for (const v of [cur - st, cur + st]) { slot[k.prop] = v; const c = obj(pose, i, 1); if (c < best - 1e-7) { best = c; bv = v; } }
    slot[k.prop] = bv;
  }
}
/** the coarse half only — cheap enough to run on every start, and it is where
 *  a start either finds the right basin or does not. */
function screen(start: Pose, i: number): { pose: Pose; v: number } {
  const pose = clone(start);
  place(pose, i);
  const anchorX = pose['hip']?.x ?? 0, anchorY = pose['hip']?.y ?? 0;
  const bound = (kn: Knob[]) => kn.map((k) => k.bone !== 'hip' || k.prop === 'rotation' ? k
    : { ...k, lo: (k.prop === 'x' ? anchorX : anchorY) - 80, hi: (k.prop === 'x' ? anchorX : anchorY) + 80, step: 8 });
  scan(pose, bound(knobsFor(pose, true)), i, 8);
  pairs(pose, i, 8, 18);
  return { pose, v: obj(pose, i, 8) };
}
function run(start: Pose, i: number): Pose {
  const pose = clone(start);
  place(pose, i);
  const anchorX = pose['hip']?.x ?? 0, anchorY = pose['hip']?.y ?? 0;
  const bound = (kn: Knob[]) => kn.map((k) => k.bone !== 'hip' || k.prop === 'rotation' ? k
    : { ...k, lo: (k.prop === 'x' ? anchorX : anchorY) - 80, hi: (k.prop === 'x' ? anchorX : anchorY) + 80, step: 6 });
  scan(pose, bound(knobsFor(pose, true)), i, 8);
  pairs(pose, i, 8, 14);
  scan(pose, bound(knobsFor(pose, true)), i, 4);
  pairs(pose, i, 4, 12);
  scan(pose, bound(knobsFor(pose, false)), i, 2);
  refine(pose, i, [6, 3, 1.5, 0.75, 0.35, 0.15]);
  return pose;
}

const t0 = Date.now();
let improved = 0;
const spread = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1];
for (let i = 0; i < n; i++) {
  if (pick && !pick.has(i)) continue;
  const starts: Pose[] = [poses[i]];
  for (const j of [i - 1, i + 1, ...spread]) if (j >= 0 && j < n && j !== i && poses[j]) starts.push(poses[j]);
  starts.push({});
  // CROSS-SHOT starts. The shots are states of one character, so a configuration
  // one shot cannot reach from its own frames may be sitting in another: `run`
  // f6 holds the gun out level to the right and every start drawn from `run`
  // itself has it down at the hip, which is a minimum two chains share and no
  // amount of scanning inside the shot escapes. `aim` is that pose, standing
  // still, and `idle` is the other stance. Only the arm chains are borrowed —
  // taking a whole foreign pose would move the legs somewhere this shot never
  // goes and the placement step would then be fighting it.
  for (const donor of ['aim', 'idle']) {
    if (donor === anim) continue;
    try {
      const d = JSON.parse(readFileSync(`work/placements-${donor}.json`, 'utf8')) as Record<string, Record<number, Pose>>;
      const dp = d[donor]?.[0];
      if (!dp) continue;
      const mix = clone(poses[i]);
      for (const b of ['rear-upper-arm', 'rear-bracer', 'gun', 'front-upper-arm', 'front-bracer', 'front-fist'])
        if (dp[b]) mix[b] = JSON.parse(JSON.stringify(dp[b]));
      starts.push(mix);
    } catch { /* donor not fitted */ }
  }
  const screened = starts.map((s) => screen(s, i)).sort((a, b) => a.v - b.v).slice(0, KEEP);
  let best = poses[i], bv = plain(best, i);
  const was = bv;
  for (const s of [poses[i], ...screened.map((x) => x.pose)]) {
    const p = run(s, i);
    const v = plain(p, i);
    if (v < bv - 1e-6) { bv = v; best = p; }
  }
  if (bv < was - 1e-6) improved++;
  poses[i] = best;
  process.stderr.write(`${anim} f${i} ${was.toFixed(3)} -> ${bv.toFixed(3)}\n`);
}
store[anim] = poses;
writeFileSync(process.env.OUT ?? file, JSON.stringify(store));
console.log(`${anim}: ${improved} frame(s) improved, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
