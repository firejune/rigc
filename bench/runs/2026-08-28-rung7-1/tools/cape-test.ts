/**
 * Rung 7 — is the cape's deficit placement, or deformation?
 *
 * The sack's own answer came from affine-verdict.ts, which could isolate the sack's
 * pixels by colour. The cape cannot be isolated that way — both cape images are
 * crimson — so the question is asked through the rig instead: give the two cape bones
 * a very long search on ONE frame whose sack pose is already known to be right (the
 * rest pose, where the setup pose is the art at scale 1), and read how far the crimson
 * IoU gets.
 *
 * The floor is known from floor.ts: 0.870 for the sack at that same frame, which is
 * the texture floor an `scale: 0.5` atlas puts under everything (AUTHORING.md §9.2).
 * A cape that reaches it is placed wrong and a region is enough; one that caps well
 * below it deforms, and needs a mesh.
 */
import { Plate, readPlate } from '../../../../tools/plate.ts';
import { applyPose, classify, framesBox, makeRig, renderInto, windowViewport, type Knob } from './pose.ts';

const ROOT = 'bench/reference-local/7-anticipation';
const RUN = 'bench/runs/2026-08-28-rung7-1';
const frame = process.argv[2] ?? 'hello/f0000';

const rig = makeRig(`${RUN}/spine`);
const ref = framesBox(ROOT);
const view = windowViewport(ref, 0, 0, ref.width, ref.height, 1);
const plate = new Plate(ref.width, ref.height);

const rp = readPlate(`${ROOT}/${frame}.png`);
const rs = new Uint8Array(ref.width * ref.height);
const rc = new Uint8Array(ref.width * ref.height);
const rCounts = classify(rp, rs, rc);
const ms = new Uint8Array(ref.width * ref.height);
const mc = new Uint8Array(ref.width * ref.height);

const knobs: Knob[] = [];
const add = (bone: string, prop: Knob['prop'], lo: number, hi: number) => {
  const b = rig.bone.get(bone)!;
  const base = (b.data.setupPose as unknown as Record<string, number>)[prop];
  knobs.push({ bone, prop, lo: base + lo, hi: base + hi, base });
};
for (const bone of ['cape-back', 'cape-front']) {
  add(bone, 'x', -600, 600);
  add(bone, 'y', -600, 600);
  add(bone, 'rotation', -180, 180);
  add(bone, 'scaleX', -0.75, 2.0);
  add(bone, 'scaleY', -0.75, 2.0);
  if (process.argv.includes('--shear')) {
    add(bone, 'shearX', -45, 45);
    add(bone, 'shearY', -45, 45);
  }
}

/** crimson symmetric difference over the reference's own crimson count */
function err(v: number[]): number {
  applyPose(rig, knobs, v);
  renderInto(rig, plate, view);
  classify(plate, ms, mc);
  let d = 0;
  for (let k = 0; k < mc.length; k++) if (mc[k] !== rc[k]) d++;
  return d / rCounts.capeN;
}

function capeIoU(v: number[]): number {
  applyPose(rig, knobs, v);
  renderInto(rig, plate, view);
  classify(plate, ms, mc);
  let i = 0;
  let u = 0;
  for (let k = 0; k < mc.length; k++) {
    if (mc[k] && rc[k]) i++;
    if (mc[k] || rc[k]) u++;
  }
  return i / u;
}

let best = knobs.map((k) => k.base);
let bestE = err(best);
console.log(`${frame}: reference crimson ${rCounts.capeN} px   setup err ${bestE.toFixed(4)}  IoU ${capeIoU(best).toFixed(4)}`);

// full-range scans, then a long descent, from several starts
const starts: number[][] = [best.slice()];
for (let s = 0; s < 6; s++) {
  const v = best.slice();
  for (let i = 0; i < knobs.length; i++) v[i] = knobs[i].lo + Math.random() * (knobs[i].hi - knobs[i].lo);
  starts.push(v);
}
for (const s of starts) {
  let v = s.slice();
  let e = err(v);
  for (let round = 0; round < 6; round++) {
    for (let i = 0; i < knobs.length; i++) {
      const k = knobs[i];
      let bv = v[i];
      let be = e;
      for (let t = 0; t <= 24; t++) {
        const val = k.lo + ((k.hi - k.lo) * t) / 24;
        const trial = v.slice();
        trial[i] = val;
        const q = err(trial);
        if (q < be - 1e-9) {
          be = q;
          bv = val;
        }
      }
      v[i] = bv;
      e = be;
    }
  }
  let mult = 0.1;
  for (let pass = 0; pass < 200; pass++) {
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
      if (mult < 1e-4) break;
    }
  }
  if (e < bestE) {
    bestE = e;
    best = v;
  }
}
console.log(`  best crimson err ${bestE.toFixed(4)}   cape IoU ${capeIoU(best).toFixed(4)}   (sack's own floor at this frame: 0.870)`);
console.log('  pose:');
for (let i = 0; i < knobs.length; i++)
  console.log(`    ${`${knobs[i].bone}.${knobs[i].prop}`.padEnd(22)} ${best[i].toFixed(2)}   (setup ${knobs[i].base})`);
