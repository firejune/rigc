/**
 * Fit a pose per committed frame — the driver over `tools/fitlib.ts`.
 *
 * Every committed still is fitted, at BOTH rates, which is AUTHORING §9's
 * "Fit every committed still ... a pose you never fitted is a pose you
 * guessed". The 30 fps sets ship two stills each and one of them is the
 * animation's own last sample at that rate: on this corpus `death`'s 30 fps
 * terminal still sits at 4.9333 s where the 12 fps set's last frame is at
 * 4.9167 s, so it is a pose no other file carries.
 *
 * Order: a forward pass seeded from the incumbent and the previous frame, then
 * a backward pass — §8.1's "Fit outward from a frame you trust in both
 * directions rather than only forward, so a bad frame seeds its neighbour and
 * not every frame behind it."
 *
 * usage: fit.ts <out.json> [set ...]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Plate } from '../../../../tools/plate';
import { declaredViewport, framePath, inkStats, loadFrame, sidecarOf } from './geom';
import {
  applyPose,
  fitFrame,
  levelsFor,
  loadCandidate,
  objectiveFor,
  renderPose,
  targetFor,
  weightFromChange,
  type Level,
  type Pose,
  type Skin,
} from './fitlib';
import { KNOBS, LEVEL_PLAN, PAIRS, PAIR_SAMPLES, SAMPLES } from './plan';

const REF = process.env.REF ?? 'bench/reference/spineboy/ess';
const CAND = process.env.CAND ?? '/tmp/sb2/probe';
const SKINS = process.env.SKINS ?? '';
const PASSES = Number(process.env.PASSES ?? 2);
const CHANGE_BOOST = Number(process.env.CHANGE_BOOST ?? 4);
const SEED = process.env.SEED ?? '';
const CHAINSEED = process.env.CHAINSEED ?? '';

const out = process.argv[2] ?? 'bench/runs/2026-09-03-spineboy-2/fit/poses.json';
const only = process.argv.slice(3);

const sidecar = sidecarOf(REF);
const view = declaredViewport(sidecar);
const levels: Level[] = levelsFor(view, LEVEL_PLAN);
const c = loadCandidate(CAND);
const skins: Record<string, Record<string, Skin>> =
  SKINS && existsSync(SKINS) ? (JSON.parse(readFileSync(SKINS, 'utf8')).perFrame ?? {}) : {};
const seed: Record<string, Record<string, Pose>> = SEED && existsSync(SEED) ? JSON.parse(readFileSync(SEED, 'utf8')) : {};

/**
 * `rigc chainfit`'s own reading of every frame, as a search START.
 *
 * §12.3: `hingeDeg` is "the searched degree of freedom, in Spine degrees
 * relative to the bone's setup rotation — the value a `rotate` key would
 * carry", which is exactly what `applyPose` takes. So the instrument's answer
 * enters the loop as a candidate pose rather than as advice, and
 * `startsFrom[...]` records whether it is the one the frame came out of. That
 * record is the run's per-part price tag.
 */
const chainSeeds = new Map<string, Pose>();
if (CHAINSEED && existsSync(CHAINSEED)) {
  const store = JSON.parse(readFileSync(CHAINSEED, 'utf8')) as { frames: { set: string; index: number; pose: Pose }[] };
  for (const f of store.frames) chainSeeds.set(`${f.set}|${f.index}`, f.pose);
}

/** Every committed still, per set: the file, its sample index and its rate. */
interface Shot {
  set: string;
  animation: string;
  fps: number;
  frames: { index: number; path: string }[];
}

const shots: Shot[] = [];
for (const s of sidecar.sets) {
  if (only.length && !only.includes(s.dir)) continue;
  const frames: { index: number; path: string }[] = [];
  if (s.written === s.sampled) {
    for (let i = 0; i < s.written; i++) frames.push({ index: i, path: framePath(REF, s.dir, i) });
  } else {
    // stills-plus-sheet: the first and the animation's own last sample.
    for (const i of [0, s.sampled - 1]) {
      const p = framePath(REF, s.dir, i);
      if (existsSync(p)) frames.push({ index: i, path: p });
    }
  }
  shots.push({ set: s.dir, animation: s.animation, fps: s.fps, frames });
}

const skinFor = (set: string, index: number): Skin => skins[set]?.[String(index)] ?? {};

/**
 * The same pose with the trunk translated so the candidate's own ink centroid
 * lands on the reference's. `torso`'s parent is `root`, which this rig never
 * rotates, so `tx`/`ty` are world axes and the correction is exact.
 */
function centroidAligned(base: Pose, refCentroid: [number, number]): Pose {
  applyPose(c.skeleton, base);
  const plate = renderPose(c, view);
  const s = inkStats(plate);
  if (s.pixels === 0) return { ...base };
  const knobTx = KNOBS.find((k) => k.bone === 'torso' && k.kind === 'tx');
  const knobTy = KNOBS.find((k) => k.bone === 'torso' && k.kind === 'ty');
  const dx = (refCentroid[0] - s.cx) / view.scale;
  const dy = -(refCentroid[1] - s.cy) / view.scale;
  const tx = (base['torso.tx'] ?? 0) + dx;
  const ty = (base['torso.ty'] ?? 0) + dy;
  return {
    ...base,
    'torso.tx': Math.max(knobTx?.min ?? tx, Math.min(knobTx?.max ?? tx, tx)),
    'torso.ty': Math.max(knobTy?.min ?? ty, Math.min(knobTy?.max ?? ty, ty)),
  };
}

const results: Record<string, Record<string, { pose: Pose; score: number; start: string }>> = {};

for (const shot of shots) {
  results[shot.set] = {};
  const plates = new Map<number, Plate>();
  for (const f of shot.frames) plates.set(f.index, loadFrame(f.path));

  const order = shot.frames.map((f) => f.index);
  let poses: Record<number, Pose> = {};
  for (const i of order) poses[i] = seed[shot.set]?.[String(i)] ?? {};

  const t0 = performance.now();
  for (let pass = 0; pass < PASSES; pass++) {
    const sweep = pass % 2 === 0 ? order : [...order].reverse();
    for (const i of sweep) {
      const plate = plates.get(i);
      if (!plate) continue;
      const neighbours: Plate[] = [];
      for (const j of [i - 1, i + 1]) {
        const n = plates.get(j);
        if (n) neighbours.push(n);
      }
      const weight = neighbours.length ? weightFromChange(plate, neighbours, CHANGE_BOOST) : null;
      const target = targetFor(plate, levels, weight);

      const obj = objectiveFor(c, target, skinFor(shot.set, i));

      // Starts: the incumbent, both neighbours' solutions, the setup pose, a
      // spread of poses from this shot, and a CENTROID-ALIGNED setup pose —
      // §8.1's "more than one start, screened coarsely", with the incumbent
      // always among them. The centroid start costs one render and puts the
      // body inside the basin on a shot that travels (`death` slides 426 units,
      // `jump` rises 749), which no grid over those windows can promise.
      const starts: Pose[] = [];
      const labels: string[] = [];
      const add = (p: Pose | undefined, label: string): void => {
        if (!p) return;
        starts.push(p);
        labels.push(label);
      };
      add(poses[i] ?? {}, 'incumbent');
      for (const j of [i - 1, i + 1, i - 2, i + 2]) add(poses[j], `neighbour${j - i > 0 ? '+' : ''}${j - i}`);
      add({}, 'setup');
      add(centroidAligned({}, target.centroid), 'centroid');
      if (poses[i - 1]) add(centroidAligned(poses[i - 1], target.centroid), 'centroid+prev');
      const chain = chainSeeds.get(`${shot.set}|${i}`);
      if (chain) {
        add({ ...(poses[i] ?? {}), ...chain }, 'chainfit-on-incumbent');
        add({ ...centroidAligned({}, target.centroid), ...chain }, 'chainfit-on-centroid');
      }
      for (const j of [order[0], order[Math.floor(order.length / 2)], order[order.length - 1]]) {
        if (j !== i) add(poses[j], `spread${j}`);
      }

      const fit = fitFrame(
        obj,
        { knobs: KNOBS, pairs: PAIRS, levels, samples: SAMPLES, pairSamples: PAIR_SAMPLES, sweeps: 2 },
        starts,
        2,
      );
      // Only accept an improvement: a frame can only get better across passes.
      const before = poses[i] ? obj(poses[i], levels[levels.length - 1]) : Infinity;
      const improved = fit.score < before;
      if (improved) poses[i] = fit.pose;
      const previous = results[shot.set][String(i)];
      results[shot.set][String(i)] = {
        pose: poses[i],
        score: Math.min(before, fit.score),
        start: improved ? labels[fit.startIndex] : (previous?.start ?? 'incumbent'),
      };
    }
    const scores = order.map((i) => results[shot.set][String(i)].score);
    const wins = new Map<string, number>();
    for (const i of order) {
      const label = results[shot.set][String(i)].start;
      wins.set(label, (wins.get(label) ?? 0) + 1);
    }
    process.stderr.write(
      `${shot.set.padEnd(14)} pass ${pass + 1}/${PASSES}  ${order.length} frame(s)  ` +
        `mean ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3)}  worst ${Math.max(...scores).toFixed(3)}  ` +
        `${((performance.now() - t0) / 1000).toFixed(0)}s  starts: ` +
        `${[...wins.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}=${n}`).join(' ')}\n`,
    );
  }
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(results)}\n`);
process.stderr.write(`wrote ${out}\n`);
