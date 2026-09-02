/**
 * Fold 147 `rigc pose` reports into one table.
 *
 * One row per (set, frame, part): where the part's own centre landed, at what
 * screen angle, and the two trust signals AUTHORING §11.4 says to read together
 * — the residual and `unexplained`. Alternates are carried through, because a
 * near-identical pair's answer lives in them.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Placement {
  x: number;
  y: number;
  rot: number;
  res: number;
  unexp: number;
  amb: boolean;
  refused: string | null;
  alts: [number, number, number, number][];
}

export type FrameRow = Record<string, Placement>;
export type Table = Record<string, FrameRow>;

const dir = process.argv[2] ?? 'bench/runs/2026-09-03-spineboy-1/fit/pose';
const out = process.argv[3] ?? 'bench/runs/2026-09-03-spineboy-1/fit/placements.json';

const table: Table = {};
for (const file of readdirSync(dir).sort()) {
  if (!file.endsWith('.json')) continue;
  const [set, frame] = file.replace(/\.json$/, '').split('__');
  const report = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  const row: FrameRow = {};
  for (const part of report.parts) {
    const name = part.part.replace(/\.png$/, '');
    const p = part.placement;
    if (!p) continue;
    row[name] = {
      x: p.x,
      y: p.y,
      rot: p.rotationDeg,
      res: p.residual,
      unexp: p.unexplained,
      amb: part.ambiguous,
      refused: part.refusal ? part.refusal.reason : null,
      alts: (part.alternates ?? []).map(
        (a: { x: number; y: number; rotationDeg: number; residual: number }) =>
          [a.x, a.y, a.rotationDeg, a.residual] as [number, number, number, number],
      ),
    };
  }
  table[`${set}/${frame}`] = row;
}
writeFileSync(out, JSON.stringify(table));
console.log(`${Object.keys(table).length} frames -> ${out}`);
