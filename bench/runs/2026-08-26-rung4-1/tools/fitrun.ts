/**
 * Fit a pose per reference frame, coarse to fine, seeded from the neighbour and
 * from a geometric estimate off the frame's own bead blobs (AUTHORING.md §8.1).
 *
 * Writes `fit/<set>.poses.json`.
 *
 * Usage: bun tools/fitrun.ts <set> [--from] [--passes n] [--only a,b]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { sidecar, declaredViewport, refFrame, rigFrom, Scratch, scoreKnobs, type Knobs, type RefFrame, type Rig } from './fitlib.ts';
import { observeSet, type Obs } from './seed.ts';
import type { Viewport } from '../../../../src/render.ts';

const D = 'bench/runs/2026-08-26-rung4-1/spine';
const OUT = 'bench/runs/2026-08-26-rung4-1/fit';

export const U = 11.507375; // world units per frame pixel (1 / frames.json scale)

export interface Level { k: number; v: Viewport; scratch: Scratch; refs: RefFrame[] }
export type KnobName = keyof Omit<Knobs, 'ball'>;
export interface Step { name: KnobName; span: number; step: number }

/**
 * Bounds, because the saucer is very nearly symmetric under a half turn.
 *
 * §8's *"a symmetric shape hides a sign error"* arrives here as a whole family of
 * false minima: the saucer's silhouette is an ellipse, so `prot` and `prot + 180`
 * differ only in which side a 3 px orange band sits on, and a chain free to bend
 * 180° at a joint can absorb the difference. Unbounded, the first `ball-catch`
 * fit answered frames 3–24 with rotations of −740°, −833° and +879° at ratios
 * around 1.0 — worse than drawing nothing, which is what said the search space and
 * not the search was wrong. A hanging chain does not fold back on itself; the
 * bounds say so, and they are read off the frames (the tightest bend measured
 * anywhere in the shot is 55°, in `ball-catch` frame 82).
 */
export const BOUNDS: Partial<Record<KnobName, [number, number]>> = {
  c1: [-170, 20], c2: [-85, 85], c3: [-85, 85], c4: [-85, 85],
  bsx: [0.5, 2], bsy: [0.5, 2], balpha: [0, 1], lalpha: [0.4, 1],
};

export function descend(rig: Rig, lv: Level, ref: RefFrame, k: Knobs, steps: Step[]): { k: Knobs; score: number } {
  let best = { ...k };
  let bestScore = scoreKnobs(lv.scratch, rig, lv.v, ref, best);
  for (const s of steps) {
    const centre = best[s.name] as number;
    const n = Math.round(s.span / s.step);
    for (let i = -n; i <= n; i++) {
      if (i === 0) continue;
      const value = centre + i * s.step;
      const b = BOUNDS[s.name];
      if (b && (value < b[0] || value > b[1])) continue;
      const trial = { ...best, [s.name]: value } as Knobs;
      const score = scoreKnobs(lv.scratch, rig, lv.v, ref, trial);
      if (score < bestScore) { bestScore = score; best = trial; }
    }
  }
  return { k: best, score: bestScore };
}

const CHAIN: KnobName[] = ['c1', 'c2', 'c3', 'c4'];
const pos = (span: number, step: number): Step[] => [
  { name: 'px', span: span * U, step: step * U },
  { name: 'py', span: span * U, step: step * U },
];
const ballPos = (span: number, step: number): Step[] => [
  { name: 'bx', span: span * U, step: step * U },
  { name: 'by', span: span * U, step: step * U },
];
const chain = (span: number, step: number): Step[] => CHAIN.map((name) => ({ name, span, step }));

export type Mode = 'polish' | 'track' | 'wide';

export function fitOne(levels: Level[], rig: Rig, index: number, seed: Knobs, mode: Mode): { k: Knobs; score: number } {
  let k = { ...seed };
  const ball = seed.ball;
  if (mode !== 'polish') {
    // Level 0 places the body and nothing else: at quarter scale the whole subject
    // is ~15x23 px and a chain bar is under a pixel wide, so nothing below the
    // saucer is decidable here (§8.1 — a block a shin is one cell of). The reach
    // is what matters, and it has to cover a saucer that moves 29 px between two
    // 12 fps frames on the way out.
    const l0 = levels[0];
    const reach = mode === 'wide' ? 240 : 50;
    k = descend(rig, l0, l0.refs[index], k, [...pos(reach, 3), ...(ball ? ballPos(mode === 'wide' ? 320 : 50, 3) : [])]).k;
  }
  if (mode !== 'polish') {
    const l1 = levels[1];
    for (let p = 0; p < 2; p++) {
      k = descend(rig, l1, l1.refs[index], k, [
        ...pos(mode === 'wide' ? 40 : 30, 2),
        { name: 'prot', span: p === 0 ? (mode === 'wide' ? 180 : 150) : 20, step: p === 0 ? 5 : 2 },
        ...chain(90, 3),
        ...(ball ? ballPos(mode === 'wide' ? 40 : 24, 2) : []),
        ...(ball ? [{ name: 'bsx' as KnobName, span: 0.5, step: 0.05 }, { name: 'bsy' as KnobName, span: 0.5, step: 0.05 }] : []),
        ...(ball ? [{ name: 'brot' as KnobName, span: 90, step: 10 }] : []),
        ...(ball ? [{ name: 'srot' as KnobName, span: 180, step: 10 }] : []),
        ...(ball ? [{ name: 'balpha' as KnobName, span: 0.5, step: 0.08 }] : []),
      ]).k;
    }
  }
  const l2 = levels[2];
  let r = { k, score: Infinity };
  const stages: [number, number, number, number][] = [
    // [pos span px, pos step px, angle span deg, angle step deg]
    [4, 0.5, 8, 0.7],
    [2, 0.25, 4, 0.35],
    [1, 0.12, 2, 0.18],
    [0.5, 0.06, 1, 0.09],
    [0.5, 0.06, 1, 0.09],
    [0.3, 0.04, 0.6, 0.06],
  ];
  for (const [ps, pst, as, ast] of stages) {
    r = descend(rig, l2, l2.refs[index], k, [
      ...pos(ps, pst),
      { name: 'prot', span: as * 0.6, step: ast * 0.6 },
      ...chain(as, ast),
      ...(ball ? ballPos(ps, pst) : []),
      ...(ball ? [{ name: 'bsx' as KnobName, span: as * 0.02, step: ast * 0.02 }, { name: 'bsy' as KnobName, span: as * 0.02, step: ast * 0.02 }] : []),
      ...(ball ? [{ name: 'brot' as KnobName, span: as * 2.5, step: ast * 2.5 }] : []),
      ...(ball ? [{ name: 'srot' as KnobName, span: as * 3, step: ast * 3 }] : []),
      ...(ball ? [{ name: 'balpha' as KnobName, span: as * 0.05, step: ast * 0.05 }] : []),
    ]);
    k = r.k;
  }
  return r;
}

export function buildLevels(setName: string, count: number): Level[] {
  const s = sidecar();
  return [4, 2, 1].map((k) => {
    const v = declaredViewport(s, k);
    const refs: RefFrame[] = [];
    for (let i = 0; i < count; i++) refs.push(refFrame(`bench/reference/4-wave-principle/${setName}/f${String(i).padStart(4, '0')}.png`, k));
    return { k, v, scratch: new Scratch(v.width, v.height), refs };
  });
}

export function loadRig(): Rig {
  return rigFrom(readFileSync(`${D}/skeleton.json`, 'utf8'), readFileSync(`${D}/skeleton.atlas`, 'utf8'), D);
}

if (import.meta.main) {
  const setName = process.argv[2];
  const passes = Number(process.argv.includes('--passes') ? process.argv[process.argv.indexOf('--passes') + 1] : 2);
  const s = sidecar();
  const set = s.sets.find((x) => x.dir === setName);
  if (!set) throw new Error(`no set "${setName}"`);
  const rig = loadRig();
  const count = set.written;
  const levels = buildLevels(setName, count);
  const ball = setName === 'ball-catch';
  const fallback: Knobs = { px: -518.2, py: 1052.8, prot: 0, c1: -90, c2: 0, c3: 0, c4: 0, ce: 0, bx: 0, by: 1206, brot: 0, bsx: 1, bsy: 1, srot: 0, balpha: 1, lalpha: 0.73, ball };
  const obs: Obs[] = observeSet(setName, count);
  const startsFrom = (base: Knobs, o: Obs): Knobs[] => {
    const withBall = (k: Knobs): Knobs => (ball && o.ball ? { ...k, bx: o.ball[0], by: o.ball[1] } : k);
    const out: Knobs[] = [withBall(base)];
    for (const pl of o.plats) {
      const k: Knobs = { ...base, px: pl.px, py: pl.py, prot: pl.prot };
      if (pl.chain) { k.c1 = pl.chain[0]; k.c2 = pl.chain[1]; k.c3 = pl.chain[2]; k.c4 = pl.chain[3]; }
      out.push(withBall(k));
    }
    // the band survives as one blob on only about half of ball-catch's frames;
    // this one always exists, and it is a start rather than a measurement
    if (o.rig) out.push(withBall({ ...base, px: o.rig[0], py: o.rig[1] + 25 * U }));
    // The saucer's half-turn is a basin of its own, and no scan that steps out of
    // one basin crosses into the other (§8.1's rule about scanning the range
    // rather than line-searching): put the mirrored reading in as a START.
    for (const k of [...out]) out.push({ ...k, prot: k.prot + 180 });
    return out;
  };
  const file = `${OUT}/${setName}.poses.json`;
  let out: Knobs[] = obs.map((o) => startsFrom(fallback, o)[0]);
  let scores = new Array<number>(count).fill(Infinity);
  if (existsSync(file) && process.argv.includes('--from')) {
    const prior = JSON.parse(readFileSync(file, 'utf8')) as { poses: Knobs[]; scores: number[] };
    out = prior.poses.map((p) => ({ ...p, ball }));
    scores = prior.scores;
  }
  for (let pass = 0; pass < passes; pass++) {
    const only = process.argv.includes('--only')
      ? new Set(process.argv[process.argv.indexOf('--only') + 1].split(',').map(Number))
      : null;
    const all = pass % 2 === 0 ? [...Array(count).keys()] : [...Array(count).keys()].reverse();
    const order = only ? all.filter((i) => only.has(i)) : all;
    for (const i of order) {
      const quick = process.argv.includes('--quick');
      const starts: Knobs[] = quick
        ? [{ ...out[i], ball }, ...(obs[i].ball ? [{ ...out[i], bx: obs[i].ball![0], by: obs[i].ball![1], ball }] : [])]
        : [...startsFrom({ ...out[i], ball }, obs[i]), ...startsFrom(fallback, obs[i])];
      const nb = pass % 2 === 0 ? i - 1 : i + 1;
      if (!quick && nb >= 0 && nb < count) {
        starts.push(...startsFrom({ ...out[nb], ball }, obs[i]));
        const nb2 = pass % 2 === 0 ? i - 2 : i + 2;
        if (nb2 >= 0 && nb2 < count) starts.push(...startsFrom({ ...out[nb], ...extrapolate(out[nb2], out[nb]), ball }, obs[i]));
      }
      // §8.1: assemble a handful of candidate poses and screen them coarsely —
      // a search that stopped improving is evidence about the start it was given
      // and about nothing else. These are poses from elsewhere in the shot, which
      // is the only way across a basin the frame's own neighbourhood cannot leave.
      if (!quick) {
        for (const d of [4, 8, 16, 32]) {
          for (const j of [i - d, i + d]) {
            if (j >= 0 && j < count && Number.isFinite(scores[j])) starts.push(...startsFrom({ ...out[j], ball }, obs[i]));
          }
        }
      }
      let best: { k: Knobs; score: number } | null = null;
      const fresh = pass === 0 && !existsSync(file);
      for (const st of starts) {
        const modes: Mode[] = fresh && i === 0 ? ['wide', 'track', 'polish'] : quick ? ['polish'] : ['track', 'polish'];
        for (const mode of modes) {
          const r = fitOne(levels, rig, i, st, mode);
          if (!best || r.score < best.score) best = r;
        }
      }
      if (best!.score < scores[i]) { out[i] = best!.k; scores[i] = best!.score; }
    }
    const ratios = scores.map((v, i) => v / levels[2].refs[i].inkCost);
    console.log(`pass ${pass}: mean ratio ${(ratios.reduce((a, b) => a + b, 0) / count).toFixed(4)}  worst ${Math.max(...ratios).toFixed(4)} at f${ratios.indexOf(Math.max(...ratios))}`);
    writeFileSync(file, JSON.stringify({ set: setName, poses: out, scores }, null, 1));
  }
  const ratios = scores.map((v, i) => v / levels[2].refs[i].inkCost);
  for (let i = 0; i < count; i++) process.stdout.write(`f${String(i).padStart(4, '0')} ${ratios[i].toFixed(4)}\n`);
}

export function extrapolate(a: Knobs, b: Knobs): Partial<Knobs> {
  const o: Partial<Knobs> = {};
  for (const key of ['px', 'py', 'prot', 'c1', 'c2', 'c3', 'c4', 'bx', 'by', 'brot', 'bsx', 'bsy', 'srot'] as KnobName[]) {
    o[key] = (b[key] as number) + ((b[key] as number) - (a[key] as number));
  }
  return o;
}
