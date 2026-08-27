/**
 * Rung 7 — fit a pose per frame, against the pixels.
 *
 * This is AUTHORING.md §8.1's search, with each of its rules taken literally:
 *   - fit the rendered composite, never a part on its own (three parts overlap here
 *     on every frame, so there are no pixels that can only be one of them);
 *   - box-average and go coarse to fine, because at full resolution the objective is
 *     flat over the range a joint has to travel;
 *   - scan each knob's whole plausible range rather than line-searching out from
 *     where it sits;
 *   - more than one start, screened coarsely, with the incumbent always among them;
 *   - fit outward from a frame you trust in both directions.
 *
 * One rule is answered by construction rather than by machinery: there is no gauge
 * to fold, because every bone in this rig carries art. §10.3's +181-against-184
 * failure needs an artless bone and this rig has none.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { Plate, readPlate } from '../../../../tools/plate.ts';
import {
  applyPose,
  classify,
  downsample,
  drawnCount,
  framesBox,
  makeRig,
  objective,
  partError,
  renderInto,
  windowViewport,
  type Knob,
} from './pose.ts';
import { masksOf, frameFiles, ANIMS } from './frames.ts';

const ROOT = 'bench/reference-local/7-anticipation';
const RUN = 'bench/runs/2026-08-28-rung7-1';
const PAD = 130;

const args = process.argv.slice(2);
const only = args.includes('--set') ? args[args.indexOf('--set') + 1] : null;
const passes = Number(args.includes('--passes') ? args[args.indexOf('--passes') + 1] : 2);
const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : `${RUN}/placements.json`;
/**
 * Which half of the rig is free, and which half of the error it is scored on.
 *
 * The colour split is what makes this legitimate rather than §8.1's "fitting one part
 * at a time is the same mistake wearing a schedule": the beige channel is the sack's
 * own pixels and the crimson is the cape's, both calibrated on the art, so a stage is
 * not being scored on a picture the other part is spoiling. What DOES couple them is
 * occlusion — the collar covers the sack, so the beige mask moves when the collar
 * does — and that is why every stage renders the whole composite and the last stage
 * frees everything.
 */
const WIDE = args.includes('--wide');
const part = (args.includes('--part') ? args[args.indexOf('--part') + 1] : 'all') as 'sack' | 'cape' | 'all';

const rig = makeRig(`${RUN}/spine`);
const ref = framesBox(ROOT);

// ---------------------------------------------------------------------------
// the knobs
// ---------------------------------------------------------------------------

/**
 * Ranges are declared as offsets from the SETUP value and resolved against it.
 *
 * §9.1's second trap in operational form: the setup transform lives on
 * `bone.data.setupPose`, and `bone.pose.x` is the bone's whole local translation
 * rather than an offset from setup — so a knob "base" of 0 would put every bone at
 * its parent's origin. The sack's own setup x is -16.5, so that error moves the
 * figure by 16.5 units before the search starts.
 */
function knobSet(): Knob[] {
  const k: Knob[] = [];
  const add = (bone: string, prop: Knob['prop'], lo: number, hi: number) => {
    const b = rig.bone.get(bone);
    if (!b) throw new Error(`no bone "${bone}"`);
    const base = (b.data.setupPose as unknown as Record<string, number>)[prop];
    if (!Number.isFinite(base)) throw new Error(`setup ${bone}.${prop} is ${base} — read bone.data.setupPose, not bone.data`);
    k.push({ bone, prop, lo: base + lo, hi: base + hi, base });
  };
  add('sack', 'x', -500, 500);
  add('sack', 'y', -500, 500);
  add('sack', 'rotation', -42, 42);
  add('sack', 'scaleX', -0.5, 1.1);
  add('sack', 'scaleY', -0.5, 0.9);
  if (WIDE) add('sack', 'shearX', -30, 30);
  for (const b of ['sack-b', 'sack-c', 'sack-d']) {
    if (WIDE) {
      add(b, 'x', -150, 150);
      add(b, 'y', -150, 150);
    }
    add(b, 'rotation', -36, 36);
    add(b, 'scaleX', -0.45, 0.9);
    add(b, 'scaleY', -0.45, 0.9);
    if (WIDE) add(b, 'shearX', -30, 30);
  }
  add('cape-back', 'x', -560, 560);
  add('cape-back', 'y', -560, 560);
  add('cape-back', 'rotation', -150, 150);
  add('cape-back', 'scaleX', -0.7, 1.4);
  add('cape-back', 'scaleY', -0.7, 1.4);
  add('cape-front', 'x', -260, 260);
  add('cape-front', 'y', -260, 260);
  add('cape-front', 'rotation', -70, 70);
  add('cape-front', 'scaleX', -0.5, 0.7);
  add('cape-front', 'scaleY', -0.5, 0.7);
  return k;
}
const KNOBS = knobSet();
/** sack.x and sack.y are seeded analytically, so their scan is a local one. */
const TRANSLATE = [0, 1];
/** which knob indices this stage may move */
const FREE = KNOBS.map((k, i) =>
  part === 'all' ? true : part === 'cape' ? k.bone.startsWith('cape') : !k.bone.startsWith('cape'),
).map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
const W_SACK = part === 'cape' ? 0 : part === 'sack' ? 1 : 0.5;
const W_CAPE = part === 'sack' ? 0 : part === 'cape' ? 1 : 0.5;
console.log(`stage "${part}": ${FREE.length} of ${KNOBS.length} knobs free, weights sack ${W_SACK} cape ${W_CAPE}`);

// ---------------------------------------------------------------------------
// where the sack's own centroid sits at setup, for the analytic translate seed
// ---------------------------------------------------------------------------

const full = windowViewport(ref, 0, 0, ref.width, ref.height, 1);
const fullPlate = new Plate(ref.width, ref.height);
applyPose(rig, KNOBS, KNOBS.map((x) => x.base));
renderInto(rig, fullPlate, full);
const setupMasks = masksOf(fullPlate);
const SETUP_CX = setupMasks.sackP.cx;
const SETUP_CY = setupMasks.sackP.cy;
console.log(`setup pose: my own sack centroid lands at (${SETUP_CX.toFixed(1)}, ${SETUP_CY.toFixed(1)}) px`);

interface Target {
  set: string;
  index: number;
  px0: number;
  py0: number;
  w: number;
  h: number;
  /** analytic seed for sack.x / sack.y, in world units */
  seedX: number;
  seedY: number;
  /** downsampled references and their drawn counts, by step */
  levels: Map<number, { plate: Plate; drawn: number }>;
  /** the reference's own part masks over the window, at full resolution */
  refSack: Uint8Array;
  refCape: Uint8Array;
  refSackN: number;
  refCapeN: number;
}

function loadTarget(set: string, index: number, file: string): Target {
  const plate = readPlate(`${ROOT}/${set}/${file}`);
  const m = masksOf(plate);
  const px0 = Math.max(0, m.all.left - PAD);
  const py0 = Math.max(0, m.all.top - PAD);
  const px1 = Math.min(ref.width, m.all.right + 1 + PAD);
  const py1 = Math.min(ref.height, m.all.bottom + 1 + PAD);
  const levels = new Map<number, { plate: Plate; drawn: number }>();
  for (const step of [4, 2]) {
    const w = Math.ceil((px1 - px0) / step);
    const h = Math.ceil((py1 - py0) / step);
    const d = downsample(plate, px0, py0, w, h, step);
    levels.set(step, { plate: d, drawn: Math.max(1, drawnCount(d)) });
  }
  // level 1 keeps the reference at full resolution AND its two part masks, cropped
  const w = px1 - px0;
  const h = py1 - py0;
  const crop = downsample(plate, px0, py0, w, h, 1);
  levels.set(1, { plate: crop, drawn: Math.max(1, drawnCount(crop)) });
  const refSack = new Uint8Array(w * h);
  const refCape = new Uint8Array(w * h);
  const counts = classify(crop, refSack, refCape);
  return {
    set,
    index,
    px0,
    py0,
    w,
    h,
    seedX: (m.sackP.cx - SETUP_CX) / ref.scale,
    seedY: -(m.sackP.cy - SETUP_CY) / ref.scale,
    levels,
    refSack,
    refCape,
    refSackN: counts.sackN,
    refCapeN: counts.capeN,
  };
}

/** scratch part masks, sized to the largest window seen */
let mySack = new Uint8Array(0);
let myCape = new Uint8Array(0);
function partScratch(n: number): void {
  if (mySack.length < n) {
    mySack = new Uint8Array(n);
    myCape = new Uint8Array(n);
  }
}

// scratch plates per level, reused
const scratch = new Map<string, Plate>();
function plateFor(t: Target, step: number): { plate: Plate; view: ReturnType<typeof windowViewport> } {
  const w = Math.ceil(t.w / step);
  const h = Math.ceil(t.h / step);
  const key = `${w}x${h}`;
  let p = scratch.get(key);
  if (!p) {
    p = new Plate(w, h);
    scratch.set(key, p);
  }
  return { plate: p, view: windowViewport(ref, t.px0, t.py0, w, h, step) };
}

/**
 * Levels 4 and 2 use the RGB objective on a coarse render — cheap, and enough to
 * place the body and the limbs (§8.1: the coarsest level is for the body and nothing
 * else). Level 1 switches to the part-normalised silhouette error, which is what the
 * two halves of this shot need to be weighed against each other honestly.
 */
function evalAt(t: Target, step: number, values: number[]): number {
  const { plate, view } = plateFor(t, step);
  applyPose(rig, KNOBS, values);
  renderInto(rig, plate, view);
  const lv = t.levels.get(step)!;
  if (step > 1) return objective(plate, lv.plate, lv.drawn);
  partScratch(t.w * t.h);
  const parts = partError(plate, mySack, myCape, t.refSack, t.refCape, t.refSackN, t.refCapeN, W_SACK, W_CAPE);
  // a light RGB term keeps interior shading and orientation in the objective: a
  // silhouette-only fit is free to draw the sack upside down inside its own outline.
  return parts + 0.004 * objective(plate, lv.plate, lv.drawn);
}

// ---------------------------------------------------------------------------
// the search
// ---------------------------------------------------------------------------

function fullScan(t: Target, step: number, v0: number[], rounds: number, samples: number): { v: number[]; e: number } {
  let v = v0.slice();
  let e = evalAt(t, step, v);
  for (let round = 0; round < rounds; round++) {
    let moved = false;
    for (const i of FREE) {
      const k = KNOBS[i];
      const lo = TRANSLATE.includes(i) ? v[i] - 260 : k.lo;
      const hi = TRANSLATE.includes(i) ? v[i] + 260 : k.hi;
      let bestV = v[i];
      let bestE = e;
      for (let s = 0; s <= samples; s++) {
        const val = lo + ((hi - lo) * s) / samples;
        const trial = v.slice();
        trial[i] = val;
        const q = evalAt(t, step, trial);
        if (q < bestE - 1e-9) {
          bestE = q;
          bestV = val;
        }
      }
      if (bestV !== v[i]) {
        v[i] = bestV;
        e = bestE;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { v, e };
}

function descend(t: Target, step: number, v0: number[], scale: number): { v: number[]; e: number } {
  let v = v0.slice();
  let e = evalAt(t, step, v);
  let mult = scale;
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (const i of FREE) {
      const k = KNOBS[i];
      const span = k.prop === 'rotation' || k.prop.startsWith('shear') ? 40 : k.prop.startsWith('scale') ? 1 : 400;
      const d = span * mult;
      for (const s of [d, -d]) {
        const trial = v.slice();
        trial[i] = v[i] + s;
        if (!TRANSLATE.includes(i)) trial[i] = Math.min(k.hi, Math.max(k.lo, trial[i]));
        const q = evalAt(t, step, trial);
        if (q < e - 1e-9) {
          e = q;
          v = trial;
          moved = true;
        }
      }
    }
    if (!moved) {
      mult /= 1.8;
      if (mult < 4e-4) break;
    }
  }
  return { v, e };
}

/** The full schedule for one frame, from a set of starts. */
function fitFrame(t: Target, starts: number[][]): { v: number[]; e: number } {
  // screen coarsely, keep the best two (§8.1)
  const screened = starts
    .map((s) => fullScan(t, 4, s, 1, 10))
    .sort((a, b) => a.e - b.e)
    .slice(0, 2);
  let best: { v: number[]; e: number } = { v: screened[0].v, e: Infinity };
  for (const s of screened) {
    let r = fullScan(t, 4, s.v, 3, 14);
    r = descend(t, 2, r.v, 0.12);
    // one full-range scan at level 1 as well: the coarse levels are scored by an RGB
    // objective that is nearly blind to the cape, so a knob can be at the wrong end
    // of its range when the part-normalised objective first sees it.
    r = fullScan(t, 1, r.v, 2, 12);
    r = descend(t, 1, r.v, 0.05);
    if (r.e < best.e) best = r;
  }
  return best;
}

// ---------------------------------------------------------------------------
// run it
// ---------------------------------------------------------------------------

const store: Record<string, number[][]> = existsSync(outFile)
  ? (JSON.parse(readFileSync(outFile, 'utf8')) as { values: Record<string, number[][]> }).values
  : {};

const sets = only ? [only] : [...ANIMS];
const neutral = KNOBS.map((k) => k.base);

for (const set of sets) {
  const files = frameFiles(set);
  const targets = files.map((f, i) => loadTarget(set, i, f));
  let series: number[][] = store[set] ?? [];
  for (let pass = 0; pass < passes; pass++) {
    const t0 = Date.now();
    const next: number[][] = [];
    let worst = 0;
    let total = 0;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const seeded = neutral.slice();
      seeded[0] = t.seedX;
      seeded[1] = t.seedY;
      const starts: number[][] = [seeded];
      if (series[i]) starts.push(series[i]);
      if (next[i - 1]) starts.push(next[i - 1]);
      if (series[i - 1]) starts.push(series[i - 1]);
      if (series[i + 1]) starts.push(series[i + 1]);
      // a couple of poses from elsewhere in the shot, for the two-chain minimum
      if (series.length) {
        starts.push(series[0]);
        starts.push(series[series.length - 1]);
      }
      const seen = new Set<string>();
      const uniq = starts.filter((s) => {
        const key = s.map((x) => x.toFixed(2)).join(',');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const r = fitFrame(t, uniq);
      next.push(r.v);
      total += r.e;
      if (r.e > worst) worst = r.e;
      process.stdout.write(`\r  ${set} pass${pass} f${String(i).padStart(4, '0')}  ${r.e.toFixed(2)}      `);
    }
    series = next;
    store[set] = series;
    writeFileSync(outFile, JSON.stringify({ knobs: KNOBS, values: store }, null, 1) + '\n');
    console.log(
      `\r  ${set} pass${pass}: mean ${(total / targets.length).toFixed(3)}  worst ${worst.toFixed(3)}  (${((Date.now() - t0) / 1000).toFixed(0)}s)          `,
    );
  }
}
console.log(`wrote ${outFile}`);
