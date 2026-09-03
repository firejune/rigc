/**
 * Settle the rig's STRUCTURE against a spread of frames drawn from every shot,
 * then hold it fixed while the per-frame poses are fitted.
 *
 * AUTHORING §8.1: "Re-fit the setup pose against frames drawn from every shot,
 * not against one ... Fit an attachment's offset against a single frame and
 * that frame's own rotations absorb whatever you got wrong: the picture comes
 * out right, the offset is wrong, and every other shot pays for it. Across a
 * spread it cannot hide."
 *
 * ## Why the structural unknowns are bone TRANSLATIONS
 *
 * A bone's local `x`/`y` IS its joint, so "where is the hip on the chest plate"
 * and "how long is the thigh" are a translation on `front-thigh` and one on
 * `front-shin`. Expressing them that way means the sweep needs no rebuild: the
 * same `applyPose` that moves a rotation moves these, and the answer is baked
 * back into the rig's `bones` at the end.
 *
 * The joint table's own numbers were the art's cap centroids, and this pass is
 * what finds out how far off that reading is. Its own finding, before the
 * sweep: the leg chain assembled from caps reaches 252.8 units from hip to
 * ankle where the frames put the whole standing leg at about 202, because a
 * cap centroid sits at the plate's rounded TIP while the real joint is inside
 * the overlap the two plates share.
 *
 * ## The schedule
 *
 * Alternating, because the two halves are conditionally linear in each other:
 *  A. per-frame rotations, structure held;
 *  B. each structural knob scanned over its whole window against the SUM over
 *     every frame of the spread, rotations held.
 * Repeat. §8.1's ill-conditioning warning applies to B and is why it is scored
 * on a spread rather than on one frame.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Plate } from '../../../../tools/plate';
import { declaredViewport, loadFrame, sidecarOf } from './geom';
import {
  fitFrame,
  keyOf,
  levelsFor,
  loadCandidate,
  objectiveFor,
  targetFor,
  weightFromChange,
  type Knob,
  type Level,
  type Objective,
  type Pose,
} from './fitlib';
import { KNOBS, LEVEL_PLAN, PAIRS, PAIR_SAMPLES, SAMPLES } from './plan';

const REF = process.env.REF ?? 'bench/reference/spineboy/ess';
const CAND = process.env.CAND ?? '/tmp/sb2/probe';
const ROUNDS = Number(process.env.ROUNDS ?? 3);
const out = process.argv[2] ?? 'bench/runs/2026-09-03-spineboy-2/fit/setup.json';

/**
 * The spread: one or two frames from every one of the eight shots, chosen for
 * the limbs being as visible and as differently posed as the shot list allows.
 */
export const SPREAD = [
  'idle/f0000',
  'aim/f0000',
  'shoot/f0003',
  'walk/f0003',
  'walk/f0009',
  'run/f0003',
  'run/f0006',
  'jump/f0000',
  'jump/f0009',
  'hit/f0000',
  'hit/f0004',
  'death/f0007',
  'death/f0020',
  'death/f0048',
];

/**
 * The structural knobs. A window is in world units, and each is centred on the
 * joint table's own reading with room for the cap-versus-overlap error above.
 */
export const STRUCTURE: Knob[] = [
  // The hips and shoulders on the chest plate: where the art draws no cap.
  { bone: 'front-thigh', kind: 'tx', min: -40, max: 40, steps: 16, fine: 5 },
  { bone: 'front-thigh', kind: 'ty', min: -40, max: 40, steps: 16, fine: 5 },
  { bone: 'rear-thigh', kind: 'tx', min: -40, max: 40, steps: 16, fine: 5 },
  { bone: 'rear-thigh', kind: 'ty', min: -40, max: 40, steps: 16, fine: 5 },
  { bone: 'front-upper-arm', kind: 'tx', min: -45, max: 45, steps: 18, fine: 5 },
  { bone: 'front-upper-arm', kind: 'ty', min: -45, max: 45, steps: 18, fine: 5 },
  { bone: 'rear-upper-arm', kind: 'tx', min: -45, max: 45, steps: 18, fine: 5 },
  { bone: 'rear-upper-arm', kind: 'ty', min: -45, max: 45, steps: 18, fine: 5 },
  // The link lengths: a cap centroid overshoots the joint by the overlap.
  { bone: 'front-shin', kind: 'ty', min: -5, max: 45, steps: 20, fine: 4 },
  { bone: 'rear-shin', kind: 'ty', min: -5, max: 45, steps: 20, fine: 4 },
  { bone: 'front-foot', kind: 'ty', min: -10, max: 45, steps: 22, fine: 4 },
  { bone: 'rear-foot', kind: 'ty', min: -10, max: 45, steps: 22, fine: 4 },
  { bone: 'front-bracer', kind: 'ty', min: -10, max: 35, steps: 18, fine: 4 },
  { bone: 'front-fist', kind: 'ty', min: -10, max: 35, steps: 18, fine: 4 },
  { bone: 'rear-bracer', kind: 'ty', min: -10, max: 35, steps: 18, fine: 4 },
  // The gun's grip and its muzzle point, neither of which is a cap.
  { bone: 'gun', kind: 'tx', min: -35, max: 35, steps: 14, fine: 5 },
  { bone: 'gun', kind: 'ty', min: -35, max: 35, steps: 14, fine: 5 },
  { bone: 'muzzle', kind: 'tx', min: -40, max: 40, steps: 16, fine: 5 },
  { bone: 'muzzle', kind: 'ty', min: -40, max: 40, steps: 16, fine: 5 },
  // The neck joint came from a triangulation whose conditioning check moved it
  // 11.6 image px, so it is swept too — over a window that size.
  { bone: 'head', kind: 'tx', min: -20, max: 20, steps: 16, fine: 4 },
  { bone: 'head', kind: 'ty', min: -20, max: 20, steps: 16, fine: 4 },
];

const sidecar = sidecarOf(REF);
const view = declaredViewport(sidecar);
const levels: Level[] = levelsFor(view, LEVEL_PLAN);
const c = loadCandidate(CAND);

interface Item {
  name: string;
  objective: Objective;
  pose: Pose;
}

const items: Item[] = [];
for (const name of SPREAD) {
  const [set, file] = name.split('/');
  const plate = loadFrame(`${REF}/${set}/${file}.png`);
  const index = Number(file.slice(1));
  const neighbours: Plate[] = [];
  for (const j of [index - 1, index + 1]) {
    try {
      neighbours.push(loadFrame(`${REF}/${set}/f${String(j).padStart(4, '0')}.png`));
    } catch {
      /* the set's edge */
    }
  }
  const weight = neighbours.length ? weightFromChange(plate, neighbours, 4) : null;
  items.push({ name, objective: objectiveFor(c, targetFor(plate, levels, weight)), pose: {} });
}

/** The structural vector, shared by every frame of the spread. */
const structure: Pose = {};

const withStructure = (pose: Pose): Pose => ({ ...structure, ...pose });

const sumOver = (level: Level): number =>
  items.reduce((total, item) => total + item.objective(withStructure(item.pose), level), 0) / items.length;

const fine = levels[levels.length - 1];
const mid = levels[levels.length - 2];

process.stderr.write(`spread of ${items.length} frame(s), ${STRUCTURE.length} structural knob(s)\n`);
process.stderr.write(`round 0: mean ${sumOver(fine).toFixed(4)}\n`);

for (let round = 0; round < ROUNDS; round++) {
  const t0 = performance.now();
  // A — the per-frame rotations, structure held.
  for (const item of items) {
    const starts: Pose[] = [item.pose, {}];
    for (const other of items) if (other !== item) starts.push(other.pose);
    const shifted = starts.map((s) => ({ ...structure, ...s }));
    const fit = fitFrame(
      item.objective,
      {
        knobs: KNOBS,
        pairs: PAIRS,
        levels,
        samples: SAMPLES,
        pairSamples: PAIR_SAMPLES,
        sweeps: 2,
        frozen: new Set(STRUCTURE.map(keyOf)),
      },
      shifted,
      2,
    );
    // Keep only the rotation half; the structural half stays shared.
    const kept: Pose = {};
    for (const knob of KNOBS) kept[keyOf(knob)] = fit.pose[keyOf(knob)] ?? 0;
    const before = item.objective(withStructure(item.pose), fine);
    if (item.objective(withStructure(kept), fine) < before) item.pose = kept;
  }
  const afterA = sumOver(fine);

  // B — each structural knob over its whole window, against the whole spread.
  for (const knob of STRUCTURE) {
    const key = keyOf(knob);
    const at = structure[key] ?? 0;
    let best = at;
    let bestScore = sumOver(mid);
    for (let i = 0; i <= knob.steps; i++) {
      const v = knob.min + ((knob.max - knob.min) * i) / knob.steps;
      structure[key] = v;
      const s = sumOver(mid);
      if (s < bestScore) {
        bestScore = s;
        best = v;
      }
    }
    structure[key] = best;
  }
  const afterB = sumOver(fine);
  process.stderr.write(
    `round ${round + 1}: after rotations ${afterA.toFixed(4)}  after structure ${afterB.toFixed(4)}  ` +
      `${((performance.now() - t0) / 1000).toFixed(0)}s\n`,
  );
}

/**
 * The basin of each structural knob at its converged value — AUTHORING §10.3's
 * "Measure the basin before you declare the tolerance, which costs nothing and
 * needs no reference: scan each knob around its converged value and read how
 * far it moves before the objective does."
 */
const basins: Record<string, number> = {};
const settled = sumOver(fine);
for (const knob of STRUCTURE) {
  const key = keyOf(knob);
  const at = structure[key] ?? 0;
  let reach = 0;
  for (const dir of [-1, 1]) {
    for (let step = 1; step <= 20; step++) {
      structure[key] = at + dir * step * ((knob.max - knob.min) / 200);
      if (sumOver(fine) > settled * 1.01) break;
      reach = Math.max(reach, step * ((knob.max - knob.min) / 200));
    }
  }
  structure[key] = at;
  basins[key] = reach;
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  `${JSON.stringify(
    {
      spread: SPREAD,
      structure,
      basins,
      mean: settled,
      perFrame: Object.fromEntries(items.map((i) => [i.name, i.objective(withStructure(i.pose), fine)])),
      poses: Object.fromEntries(items.map((i) => [i.name, i.pose])),
    },
    null,
    1,
  )}\n`,
);
process.stderr.write(`\nwrote ${out}\n`);
for (const knob of STRUCTURE) {
  const key = keyOf(knob);
  process.stderr.write(`  ${key.padEnd(24)} ${(structure[key] ?? 0).toFixed(2).padStart(8)}  basin +-${basins[key].toFixed(2)}\n`);
}
