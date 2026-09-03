/**
 * The same sweep over TWO knobs, on the grid — the control for §8.1's "some
 * knobs only decide together", and the way to tell a search that cannot reach a
 * basin from an objective that has no basin there.
 *
 * usage: basin2.ts <set/frame> <pose.json> <a.kind> <b.kind> [level-factor] [steps]
 */
import { readFileSync } from 'node:fs';
import type { Plate } from '../../../../tools/plate';
import { declaredViewport, loadFrame, sidecarOf } from './geom';
import { levelsFor, loadCandidate, objectiveFor, targetFor, weightFromChange, type Pose } from './fitlib';
import { KNOBS, LEVEL_PLAN } from './plan';

const REF = process.env.REF ?? 'bench/reference/spineboy/ess';
const CAND = process.env.CAND ?? '/tmp/sb2/probe';
const view = declaredViewport(sidecarOf(REF));
const levels = levelsFor(view, LEVEL_PLAN);
const c = loadCandidate(CAND);

const [name, posePath, keyA, keyB, levelArg, stepArg] = process.argv.slice(2);
const [set, file] = name.split('/');
const plate = loadFrame(`${REF}/${set}/${file}.png`);
const index = Number(file.slice(1));
const neighbours: Plate[] = [];
for (const j of [index - 1, index + 1]) {
  try {
    neighbours.push(loadFrame(`${REF}/${set}/f${String(j).padStart(4, '0')}.png`));
  } catch {
    /* set edge */
  }
}
const target = targetFor(plate, levels, neighbours.length ? weightFromChange(plate, neighbours, 4) : null);
const obj = objectiveFor(c, target);
const base: Pose = JSON.parse(readFileSync(posePath, 'utf8'));
const factor = Number(levelArg ?? 2);
const level = levels.find((l) => l.factor === factor && l.knobs === null) ?? levels[levels.length - 1];
const steps = Number(stepArg ?? 24);
const a = KNOBS.find((k) => `${k.bone}.${k.kind}` === keyA);
const b = KNOBS.find((k) => `${k.bone}.${k.kind}` === keyB);
if (!a || !b) throw new Error('unknown knob');

let best = { a: 0, b: 0, s: Infinity };
const grid: number[][] = [];
for (let i = 0; i <= steps; i++) {
  const va = a.min + ((a.max - a.min) * i) / steps;
  const row: number[] = [];
  for (let j = 0; j <= steps; j++) {
    const vb = b.min + ((b.max - b.min) * j) / steps;
    const s = obj({ ...base, [keyA]: va, [keyB]: vb }, level);
    row.push(s);
    if (s < best.s) best = { a: va, b: vb, s };
  }
  grid.push(row);
}
const flat = grid.flat();
const lo = Math.min(...flat);
const hi = Math.max(...flat);
const glyphs = ' .:-=+*#%@';
process.stdout.write(
  `${name}  ${keyA} (rows) x ${keyB} (cols)  level ${level.factor} (${level.metric})\n` +
    `  incumbent ${(base[keyA] ?? 0).toFixed(1)}, ${(base[keyB] ?? 0).toFixed(1)} -> ${obj(base, level).toFixed(4)}\n` +
    `  best ${best.a.toFixed(1)}, ${best.b.toFixed(1)} -> ${best.s.toFixed(4)}   range ${lo.toFixed(4)}..${hi.toFixed(4)}\n`,
);
for (let i = 0; i <= steps; i++) {
  const va = a.min + ((a.max - a.min) * i) / steps;
  let line = '';
  for (let j = 0; j <= steps; j++) {
    const t = (grid[i][j] - lo) / (hi - lo || 1);
    line += glyphs[Math.min(glyphs.length - 1, Math.floor(t * glyphs.length))];
  }
  process.stdout.write(`  ${va.toFixed(0).padStart(5)} |${line}|\n`);
}
