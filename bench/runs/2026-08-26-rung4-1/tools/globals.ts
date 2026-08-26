/**
 * Fit the SETUP geometry — the numbers that are the same in every frame — against
 * frames drawn from every shot at once (AUTHORING.md §8.1's last rule).
 *
 * A single frame cannot see an error here: that frame's own rotations absorb it.
 * A spread cannot absorb it, because no one value of a link length is absorbed
 * by a different rotation in each frame.
 *
 * The parameters are patched into the compiled skeleton JSON in memory. The
 * winner is written back into the rig spec by hand and rebuilt, so the candidate
 * on disk always comes out of `build`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { sidecar, declaredViewport, refFrame, rigFrom, Scratch, scoreKnobs, type Knobs, type RefFrame, type Rig } from './fitlib.ts';
import type { Viewport } from '../../../../src/render.ts';

const D = 'bench/runs/2026-08-26-rung4-1/spine';
const U = 11.507375;

export interface Globals {
  cy1: number;              // chain-1 bone y, in the platform bone's frame
  L1: number; L2: number; L3: number; L4: number; // child bone x down the chain
  a1: number; a2: number; a3: number; a4: number; // chain-N attachment x
  ace: number;              // chain-end attachment x
  pox: number; poy: number; // platform attachment x / y
  lalpha: number;           // basket-lambertian slot alpha (a setup value)
}

export const G0: Globals = {
  cy1: -71, L1: 248, L2: 237, L3: 211, L4: 209,
  a1: 98.5, a2: 89.5, a3: 75, a4: 61.5, ace: 0, pox: 0, poy: 0, lalpha: 0.73,
};

interface Json { [k: string]: unknown }

export function patched(base: Json, g: Globals): string {
  const doc = JSON.parse(JSON.stringify(base)) as Json;
  const bones = doc.bones as { name: string; x?: number; y?: number }[];
  const at = (n: string) => bones.find((b) => b.name === n)!;
  at('chain-1').y = g.cy1;
  at('chain-2').x = g.L1;
  at('chain-3').x = g.L2;
  at('chain-4').x = g.L3;
  at('chain-end').x = g.L4;
  const skin = (doc.skins as { name: string; attachments: Record<string, Record<string, { x?: number; y?: number }>> }[])[0];
  const a = (slot: string, name: string) => skin.attachments[slot][name];
  a('chain-1', 'chain-1').x = g.a1;
  a('chain-2', 'chain-2').x = g.a2;
  a('chain-3', 'chain-3').x = g.a3;
  a('chain-4', 'chain-4').x = g.a4;
  a('chain-end', 'chain-end').x = g.ace;
  a('platform', 'platform').x = g.pox;
  a('platform', 'platform').y = g.poy;
  const slots = doc.slots as { name: string; color?: string }[];
  const lam = slots.find((sl) => sl.name === 'basket-lambertian');
  if (lam) lam.color = `ffffff${Math.round(Math.max(0, Math.min(1, g.lalpha)) * 255).toString(16).padStart(2, '0')}`;
  return JSON.stringify(doc);
}

export interface Sample { ref: RefFrame; v: Viewport; scratch: Scratch; knobs: Knobs }

/** Polish the pose only — the globals are what is being swept. */
export function polish(rig: Rig, s: Sample): number {
  let best = { ...s.knobs };
  let bestScore = scoreKnobs(s.scratch, rig, s.v, s.ref, best);
  const ball = best.ball;
  const stages: [number, number, number, number][] = [[2, 0.25, 4, 0.4], [0.8, 0.1, 1.6, 0.16], [0.4, 0.05, 0.8, 0.08]];
  for (const [ps, pst, as, ast] of stages) {
    const steps: { name: keyof Knobs; span: number; step: number }[] = [
      { name: 'px', span: ps * U, step: pst * U },
      { name: 'py', span: ps * U, step: pst * U },
      { name: 'prot', span: as * 0.6, step: ast * 0.6 },
      { name: 'c1', span: as, step: ast }, { name: 'c2', span: as, step: ast },
      { name: 'c3', span: as, step: ast }, { name: 'c4', span: as, step: ast },
    ];
    if (ball) {
      steps.push({ name: 'bx', span: ps * U, step: pst * U }, { name: 'by', span: ps * U, step: pst * U });
      steps.push({ name: 'bsx', span: as * 0.02, step: ast * 0.02 }, { name: 'bsy', span: as * 0.02, step: ast * 0.02 });
      steps.push({ name: 'brot', span: as * 2.5, step: ast * 2.5 }, { name: 'srot', span: as * 3, step: ast * 3 });
      steps.push({ name: 'balpha', span: as * 0.05, step: ast * 0.05 });
    }
    for (const st of steps) {
      const centre = best[st.name] as number;
      const n = Math.round(st.span / st.step);
      for (let i = -n; i <= n; i++) {
        if (i === 0) continue;
        const trial = { ...best, [st.name]: centre + i * st.step } as Knobs;
        const score = scoreKnobs(s.scratch, rig, s.v, s.ref, trial);
        if (score < bestScore) { bestScore = score; best = trial; }
      }
    }
  }
  s.knobs = best;
  return bestScore;
}

if (import.meta.main) {
  const baseText = readFileSync(`${D}/skeleton.json`, 'utf8');
  const atlas = readFileSync(`${D}/skeleton.atlas`, 'utf8');
  const base = JSON.parse(baseText) as Json;
  const s = sidecar();
  const v = declaredViewport(s, 1);
  const picks: [string, number][] = [];
  for (const i of [0, 2, 4, 6, 8, 10, 12, 14]) picks.push(['wave-by-hand', i]);
  for (const i of [1, 5, 9, 13]) picks.push(['wave-offset', i]);
  for (const i of [0, 8, 16, 24, 36, 48, 60, 70, 78, 80, 82, 84, 90, 100]) picks.push(['ball-catch', i]);
  const poses = new Map<string, Knobs[]>();
  for (const set of ['wave-by-hand', 'wave-offset', 'ball-catch']) {
    try { poses.set(set, JSON.parse(readFileSync(`bench/runs/2026-08-26-rung4-1/fit/${set}.poses.json`, 'utf8')).poses); } catch { /* not fitted yet */ }
  }
  const samples: Sample[] = [];
  for (const [set, i] of picks) {
    const p = poses.get(set);
    if (!p || !p[i]) continue;
    samples.push({
      ref: refFrame(`bench/reference/4-wave-principle/${set}/f${String(i).padStart(4, '0')}.png`),
      v, scratch: new Scratch(v.width, v.height), knobs: { ...p[i], ball: set === 'ball-catch' },
    });
  }
  console.log(`${samples.length} sample frame(s)`);
  const evaluate = (g: Globals): number => {
    const rig = rigFrom(patched(base, g), atlas, D);
    let total = 0, ink = 0;
    for (const smp of samples) { total += polish(rig, { ...smp, knobs: { ...smp.knobs } }); ink += smp.ref.inkCost; }
    return total / ink;
  };
  let g: Globals = JSON.parse(readFileSync('bench/runs/2026-08-26-rung4-1/fit/globals.json', 'utf8').toString()) as Globals;
  let bestScore = evaluate(g);
  console.log(`start ${bestScore.toFixed(5)}  ${JSON.stringify(g)}`);
  // The saucer's own attachment offset is degenerate with its per-frame position
  // while the saucer is level, and it is only identified by frames where it is
  // turned — so it is not swept unless a shot that turns it is in the sample.
  const turned = samples.some((x) => x.knobs.ball);
  const knobs: [keyof Globals, number][] = [
    ['cy1', 10], ['L1', 10], ['L2', 10], ['L3', 10], ['L4', 10],
    ['a1', 8], ['a2', 8], ['a3', 8], ['a4', 8], ['ace', 8],
    ...(turned ? ([['pox', 8], ['poy', 8], ['lalpha', 0.09]] as [keyof Globals, number][]) : []),
  ];
  for (let round = 0; round < 3; round++) {
    const shrink = Math.pow(0.4, round);
    for (const [name, span0] of knobs) {
      const span = span0 * shrink;
      const step = span / 3;
      const centre = g[name];
      for (let i = -3; i <= 3; i++) {
        if (i === 0) continue;
        const trial = { ...g, [name]: centre + i * step };
        const sc = evaluate(trial);
        if (sc < bestScore) { bestScore = sc; g = trial; }
      }
      process.stdout.write(`  ${name}=${g[name].toFixed(2)} -> ${bestScore.toFixed(5)}\n`);
    }
    console.log(`round ${round}: ${bestScore.toFixed(5)} ${JSON.stringify(g)}`);
    writeFileSync('bench/runs/2026-08-26-rung4-1/fit/globals.json', JSON.stringify(g, null, 1));
  }
}
