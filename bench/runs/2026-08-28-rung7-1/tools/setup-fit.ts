/**
 * Rung 7 — re-fit the setup pose against frames drawn from every shot.
 *
 * AUTHORING.md §8.1: "Every animation is measured from the setup pose, so an error in
 * it is an error in all of them — and it is exactly the error one frame cannot show
 * you. Fit an attachment's offset against a single frame and that frame's own
 * rotations absorb whatever you got wrong."
 *
 * Here the spread is handed to us: the brief identifies three frames from three
 * different animations as the same standing pose to within 9, 22 and 31 silhouette
 * pixels. One pose is fitted against all three at once, so nothing per-frame can
 * absorb a wrong offset, and the result is baked into the rig's own setup values.
 *
 * cape-test.ts already showed what this is worth: the collar's bootstrap placement
 * was 45 units low on one axis, which alone held the crimson IoU at 0.45 against the
 * 0.93 a correct placement reaches.
 */
import { writeFileSync } from 'node:fs';
import { Plate, readPlate } from '../../../../tools/plate.ts';
import { applyPose, classify, framesBox, makeRig, renderInto, windowViewport, type Knob } from './pose.ts';

const ROOT = 'bench/reference-local/7-anticipation';
const RUN = 'bench/runs/2026-08-28-rung7-1';
const REST = ['fall-in/f0020', 'hello/f0000', 'cape-follow-example/f0000'];

const rig = makeRig(`${RUN}/spine`);
const ref = framesBox(ROOT);
const view = windowViewport(ref, 0, 0, ref.width, ref.height, 1);
const plate = new Plate(ref.width, ref.height);
const N = ref.width * ref.height;
const ms = new Uint8Array(N);
const mc = new Uint8Array(N);

const targets = REST.map((f) => {
  const p = readPlate(`${ROOT}/${f}.png`);
  const s = new Uint8Array(N);
  const c = new Uint8Array(N);
  const counts = classify(p, s, c);
  return { name: f, sack: s, cape: c, sackN: counts.sackN, capeN: counts.capeN };
});

const knobs: Knob[] = [];
const add = (bone: string, prop: Knob['prop'], lo: number, hi: number) => {
  const b = rig.bone.get(bone)!;
  const base = (b.data.setupPose as unknown as Record<string, number>)[prop];
  knobs.push({ bone, prop, lo: base + lo, hi: base + hi, base });
};
/**
 * The sack's setup pose is NOT fitted, and that is the point.
 *
 * §8's rule for a sweep that lands inside its own scatter is to "find a second,
 * independent way to get the number — often by measuring the ART instead of the
 * render". Here the art settles it outright: sack.png's opaque box at the frames'
 * scale is 87.3 x 153.6 px, the brief measures the standing sack at 87-88 x 153-154,
 * and mesh-control.ts confirms my setup render puts its box on the reference's to the
 * pixel — [102..188] x [596..749] either way. So the sack is at scale 1, rotation 0,
 * and where it already is.
 *
 * Leaving it free measurably makes things worse rather than better: a joint descent
 * over all 15 knobs walked sack.y down 42.9 units, traded the sack's IoU from 0.870
 * to 0.822 to buy cape pixels, and still finished with a worse cape than a
 * cape-only search reaches (0.850 against 0.930). That is §8.1's "two whole chains
 * can share a minimum" arriving through the setup pose.
 */
for (const bone of ['cape-back', 'cape-front']) {
  add(bone, 'x', -220, 220);
  add(bone, 'y', -220, 220);
  add(bone, 'rotation', -60, 60);
  add(bone, 'scaleX', -0.4, 0.6);
  add(bone, 'scaleY', -0.4, 0.6);
}

/** mean over the three rest frames of the part-normalised silhouette error */
function err(v: number[]): number {
  applyPose(rig, knobs, v);
  renderInto(rig, plate, view);
  classify(plate, ms, mc);
  let total = 0;
  for (const t of targets) {
    let ds = 0;
    let dc = 0;
    for (let k = 0; k < N; k++) {
      if (ms[k] !== t.sack[k]) ds++;
      if (mc[k] !== t.cape[k]) dc++;
    }
    // CRIMSON ONLY. The cape's own pixels are the crimson ones, and the sack is
    // frozen at a placement the art settles — so a beige term here cannot inform the
    // cape, it can only bribe it. Measured: with the beige term in, an 11-start
    // search shrank the collar to 0.62 scale and turned it -26 degrees to uncover
    // sack pixels, reaching crimson IoU 0.617 where crimson alone reaches 0.930.
    total += dc / t.capeN;
  }
  return total / targets.length;
}

function report(v: number[]): void {
  applyPose(rig, knobs, v);
  renderInto(rig, plate, view);
  classify(plate, ms, mc);
  for (const t of targets) {
    let si = 0;
    let su = 0;
    let ci = 0;
    let cu = 0;
    for (let k = 0; k < N; k++) {
      if (ms[k] && t.sack[k]) si++;
      if (ms[k] || t.sack[k]) su++;
      if (mc[k] && t.cape[k]) ci++;
      if (mc[k] || t.cape[k]) cu++;
    }
    console.log(`    ${t.name.padEnd(28)} sack IoU ${(si / su).toFixed(4)}   cape IoU ${(ci / cu).toFixed(4)}`);
  }
}

let v = knobs.map((k) => k.base);
let e = err(v);
console.log(`setup as authored: err ${e.toFixed(4)}`);
report(v);

// §8.1: more than one start, screened coarsely, with the incumbent among them.
const rand = (() => {
  let s = 20260828;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
})();
const starts: number[][] = [v.slice()];
for (let n = 0; n < 14; n++) starts.push(knobs.map((k) => k.lo + rand() * (k.hi - k.lo)));
// and the incumbent with the collar dropped, which a one-frame crimson-only search
// already found: it is the start the beige-contaminated objective could not reach.
{
  const v2 = v.slice();
  for (let i = 0; i < knobs.length; i++) if (knobs[i].bone === 'cape-front' && knobs[i].prop === 'y') v2[i] -= 45;
  starts.push(v2);
}
let bestStart = v.slice();
let bestStartE = e;
for (const s of starts) {
  const q = err(s);
  if (q < bestStartE) {
    bestStartE = q;
    bestStart = s.slice();
  }
}
const allStarts = starts
  .map((s) => ({ s, e: err(s) }))
  .sort((a, b) => a.e - b.e)
  .slice(0, 5)
  .map((x) => x.s);

let bestV = v.slice();
let bestE = e;
for (const start of allStarts) {
v = start.slice();
e = err(v);
for (let round = 0; round < 8; round++) {
  let moved = false;
  for (let i = 0; i < knobs.length; i++) {
    const k = knobs[i];
    let bv = v[i];
    let be = e;
    for (let t = 0; t <= 20; t++) {
      const val = k.lo + ((k.hi - k.lo) * t) / 20;
      const trial = v.slice();
      trial[i] = val;
      const q = err(trial);
      if (q < be - 1e-9) {
        be = q;
        bv = val;
      }
    }
    if (bv !== v[i]) {
      v[i] = bv;
      e = be;
      moved = true;
    }
  }
  if (!moved) break;
}
let mult = 0.08;
for (let pass = 0; pass < 300; pass++) {
  let moved = false;
  for (let i = 0; i < knobs.length; i++) {
    const k = knobs[i];
    const span = (k.hi - k.lo) * mult;
    for (const d of [span, -span]) {
      const trial = v.slice();
      trial[i] = Math.min(k.hi, Math.max(k.lo, v[i] + d));
      const q = err(trial);
      if (q < e - 1e-10) {
        e = q;
        v = trial;
        moved = true;
      }
    }
  }
  if (!moved) {
    mult /= 1.7;
    if (mult < 2e-5) break;
  }
}
if (e < bestE) {
  bestE = e;
  bestV = v.slice();
}
}
v = bestV;
e = bestE;
console.log(`\nsetup re-fitted:   err ${e.toFixed(4)}   (from ${allStarts.length} starts)`);
report(v);
console.log('\n  knob                    setup      fitted     delta');
const out: Record<string, number> = {};
for (let i = 0; i < knobs.length; i++) {
  const k = knobs[i];
  out[`${k.bone}.${k.prop}`] = v[i];
  console.log(`  ${`${k.bone}.${k.prop}`.padEnd(22)} ${k.base.toFixed(2).padStart(9)} ${v[i].toFixed(2).padStart(10)} ${(v[i] - k.base).toFixed(2).padStart(9)}`);
}
writeFileSync(`${RUN}/setup.json`, JSON.stringify(out, null, 2) + '\n');
console.log(`\nwrote ${RUN}/setup.json`);
