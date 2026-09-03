/**
 * Merge two pose stores by taking, per frame, the answer with the lower score.
 *
 * The run fitted the corpus twice — once in one process over every set, once in
 * a second process over the six shots the first had not reached yet — so the
 * overlapping sets have two independent answers per frame. Keeping the better
 * one is §8.1's multi-start rule arriving by another route: "repeat the
 * identical search on one frame from different starts and the numbers walk
 * down. That is not a tolerance being tightened, it is a different basin each
 * time."
 *
 * ⚠️ The scores are only comparable because both processes ran the IDENTICAL
 * objective on the identical frame with the identical weighting. A score from a
 * differently-weighted run is not comparable and must not be merged this way —
 * on this corpus `hit/f0000` and `hit@30fps/f0000` are the same picture and
 * score 8.7 against 2.4, because one has a neighbour to build a change weight
 * from and the other does not.
 *
 * usage: merge.ts <out.json> <a.json> <b.json> [more…]
 */
import { readFileSync, writeFileSync } from 'node:fs';

interface Entry {
  pose: Record<string, number>;
  score: number;
  start?: string;
}
type Store = Record<string, Record<string, Entry>>;

const out = process.argv[2];
const inputs = process.argv.slice(3);
if (!out || inputs.length < 1) throw new Error('usage: merge.ts <out.json> <a.json> [b.json …]');

const merged: Store = {};
const wins: Record<string, number> = {};
let compared = 0;
for (const path of inputs) {
  const store = JSON.parse(readFileSync(path, 'utf8')) as Store;
  for (const [set, frames] of Object.entries(store)) {
    merged[set] ??= {};
    for (const [index, entry] of Object.entries(frames)) {
      const at = merged[set][index];
      if (!at) {
        merged[set][index] = entry;
        wins[path] = (wins[path] ?? 0) + 1;
        continue;
      }
      compared++;
      if (entry.score < at.score) {
        merged[set][index] = entry;
        wins[path] = (wins[path] ?? 0) + 1;
      }
    }
  }
}

writeFileSync(out, `${JSON.stringify(merged)}\n`);
const total = Object.values(merged).reduce((n, s) => n + Object.keys(s).length, 0);
process.stderr.write(`wrote ${out} — ${total} frame(s), ${compared} of them fitted twice\n`);
for (const [path, n] of Object.entries(wins)) process.stderr.write(`  ${path}: ${n} frame(s) kept\n`);
const scores = Object.values(merged).flatMap((s) => Object.values(s).map((e) => e.score));
process.stderr.write(
  `  merged mean ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3)}  worst ${Math.max(...scores).toFixed(3)}\n`,
);
