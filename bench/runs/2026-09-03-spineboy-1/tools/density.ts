/**
 * §10.3's own arithmetic: what a skipped sample costs, before a tolerance is declared.
 *
 * *"Skipping one sample means spanning it linearly, and the chord through its two
 * neighbours sits at their mean, so the deviation at the sample skipped is HALF the
 * series' second difference there"* — an identity, not an approximation. Read that
 * against the tolerance and it says which situation the run is in: picking a point
 * on the density/accuracy curve, or discovering the point the subject has already
 * put it on.
 *
 * Reported in FRAME PIXELS at each bone's own lever arm, which is the unit the
 * tolerance is declared in (§10.3's *one tolerance, in pixels at the end of what
 * each bone swings*).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readViewport } from './geom.ts';
import { type Setup } from './rig.ts';
import { KNOBS, setsOf } from './fit.ts';
import { levers, TOLERANCE_PX } from './plan.ts';
import type { PoseVec } from './fitlib.ts';

const ROOT = 'bench/runs/2026-09-03-spineboy-1';
const vp = readViewport(join('bench/reference/spineboy/ess', 'frames.json'));
const setup: Setup = JSON.parse(readFileSync(join(ROOT, 'fit/setup.json'), 'utf8'));
const lever = levers(setup);
const DEG = Math.PI / 180;

const per = new Map<string, number[]>();
for (const set of setsOf()) {
  if (set.dir.endsWith('@30fps') || set.frames.length < 3) continue;
  const file = join(ROOT, `fit/poses/${set.dir.replace('@', '_at_')}.json`);
  if (!existsSync(file)) continue;
  const poses: Record<string, PoseVec> = JSON.parse(readFileSync(file, 'utf8'));
  const names = set.frames.map((f) => f.replace('.png', ''));
  for (const k of KNOBS) {
    const bone = k.key.slice(0, k.key.lastIndexOf('.'));
    const arm = k.key.endsWith('.rotate') ? (lever.get(bone) ?? 100) * DEG : 1;
    const list = per.get(k.key) ?? [];
    for (let i = 1; i < names.length - 1; i++) {
      const a = poses[names[i - 1]]?.[k.key];
      const b = poses[names[i]]?.[k.key];
      const c = poses[names[i + 1]]?.[k.key];
      if (a === undefined || b === undefined || c === undefined) continue;
      list.push((Math.abs(a - 2 * b + c) / 2) * arm * vp.scale);
    }
    per.set(k.key, list);
  }
}

const medianOf = (xs: number[]): number => {
  const s = [...xs].sort((p, q) => p - q);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const all: number[] = [];
console.log(`declared tolerance ${TOLERANCE_PX} frame px at the lever`);
console.log(`${'channel'.padEnd(24)} ${'median cost'.padStart(12)} ${'p90'.padStart(8)}  of skipping one sample`);
for (const [key, list] of [...per].sort((a, b) => medianOf(b[1]) - medianOf(a[1]))) {
  all.push(...list);
  const s = [...list].sort((p, q) => p - q);
  console.log(
    `${key.padEnd(24)} ${medianOf(list).toFixed(3).padStart(12)} ${(s[Math.floor(s.length * 0.9)] ?? 0).toFixed(3).padStart(8)} px`,
  );
}
const med = medianOf(all);
console.log(
  `\nover every channel and every interior sample: median ${med.toFixed(3)} frame px, ` +
    `which is ${(med / TOLERANCE_PX).toFixed(1)}x the declared ${TOLERANCE_PX} px tolerance.\n` +
    (med > TOLERANCE_PX
      ? '=> the key density is a fact about the subject, not a choice: no tolerance under that\n' +
        '   figure lets a span skip anything, so the trade bought accuracy and never sparsity.'
      : '=> the tolerance is the binding constraint, so the density is a point this run picked.'),
);
