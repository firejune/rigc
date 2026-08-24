/**
 * §8's like-for-like draw-order test on my own build: emit one rig per
 * hypothesis, differing ONLY in the slots array (R4: that array IS the setup
 * draw order), build each against the SAME motion spec, and let refmae.ts
 * compare them over every committed frame.
 *
 * Two of the five are controls, not hypotheses: the brief's frames decide that
 * the near leg is drawn in front of the gun and in front of the far leg, so a
 * build that reverses either must come out WORSE. A test that cannot reproduce
 * a known answer cannot carry an unknown one.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const RUN = 'bench/runs/2026-08-24-spineboy-3/ess';
const rig = JSON.parse(readFileSync(`${RUN}/spineboy-ess.rig.json`, 'utf8')) as { images: string; slots: { name: string }[] };
const base = rig.slots.map((s) => s.name);

/** move `what` to sit immediately after `after` (or before it when `pre`). */
function reorder(order: string[], moves: [string, string][]): string[] {
  const out = [...order];
  for (const [what, after] of moves) {
    const i = out.indexOf(what);
    out.splice(i, 1);
    out.splice(out.indexOf(after) + 1, 0, what);
  }
  return out;
}

const HYP: Record<string, string[]> = {
  base,
  // the open edge: is a foot drawn over its own shin, or under it?
  'foot-under-shin': reorder(base, [['rear-foot', 'rear-thigh'], ['front-foot', 'front-thigh']]),
  'front-foot-under': reorder(base, [['front-foot', 'front-thigh']]),
  'rear-foot-under': reorder(base, [['rear-foot', 'rear-thigh']]),
  // CONTROLS — each reverses an edge the brief settled by measurement
  'ctl-gun-over-leg': reorder(base, [['gun', 'front-foot']]),
  'ctl-rear-leg-over-front': reorder(base, [['rear-thigh', 'front-foot'], ['rear-shin', 'rear-thigh'], ['rear-foot', 'rear-shin']]),
};

for (const [name, slots] of Object.entries(HYP)) {
  const v = JSON.parse(JSON.stringify(rig)) as typeof rig;
  v.images = '../../examples/spineboy/images';
  v.slots = slots.map((n) => rig.slots.find((s) => s.name === n)!);
  mkdirSync(`work/order2/${name}`, { recursive: true });
  writeFileSync(`work/order2/${name}.rig.json`, JSON.stringify(v, null, 2));
  const out = execFileSync('bun', ['cli.ts', 'build', '--rig', `work/order2/${name}.rig.json`,
    '--motion', `${RUN}/spineboy-ess.motion.json`, '--images', 'examples/spineboy/images',
    '--out', `work/order2/${name}`, '--profile', 'spine'], { encoding: 'utf8' });
  const fails = out.split('\n').filter((l) => l.includes('FAIL'));
  console.log(`${name.padEnd(26)} ${fails.length ? fails.join(' | ') : 'built, no FAIL'}`);
}
