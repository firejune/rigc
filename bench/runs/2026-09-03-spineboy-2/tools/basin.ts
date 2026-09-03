/**
 * Sweep ONE knob across its whole window with everything else held, and print
 * the objective — AUTHORING §8.1's "Sweep one bone alone across the width of
 * the figure against a single frame and watch the number".
 *
 * It answers the one question a failed fit cannot: is the SEARCH at fault, or
 * is the OBJECTIVE flat over the range this joint has to travel?
 *
 * usage: basin.ts <set/frame> <pose.json> <bone.kind> [level-factor]
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

const [name, posePath, key, levelArg] = process.argv.slice(2);
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
const factor = Number(levelArg ?? 1);
const level = levels.find((l) => l.factor === factor && l.knobs === null) ?? levels[levels.length - 1];
const knob = KNOBS.find((k) => `${k.bone}.${k.kind}` === key);
if (!knob) throw new Error(`no knob ${key}`);

const at = base[key] ?? 0;
process.stdout.write(`${name}  ${key}  level ${level.factor} (${level.metric})  incumbent ${at.toFixed(2)} -> ${obj(base, level).toFixed(4)}\n`);
const rows: { v: number; s: number }[] = [];
for (let i = 0; i <= 72; i++) {
  const v = knob.min + ((knob.max - knob.min) * i) / 72;
  rows.push({ v, s: obj({ ...base, [key]: v }, level) });
}
const lo = Math.min(...rows.map((r) => r.s));
const hi = Math.max(...rows.map((r) => r.s));
for (const r of rows) {
  const bar = '#'.repeat(Math.round((60 * (r.s - lo)) / (hi - lo || 1)));
  process.stdout.write(`  ${r.v.toFixed(1).padStart(8)}  ${r.s.toFixed(4)}  ${bar}\n`);
}
const best = rows.reduce((a, b) => (b.s < a.s ? b : a));
process.stdout.write(`  best ${best.v.toFixed(1)} -> ${best.s.toFixed(4)}   range ${lo.toFixed(4)}..${hi.toFixed(4)} (spread ${(hi - lo).toFixed(4)})\n`);
