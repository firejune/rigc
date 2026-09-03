/**
 * What the adoptions actually bought, measured by `check`'s own per-slot matcher
 * — the instrument the disagreement was adjudicated against.
 *
 * Both columns are read at the SAME reduction cap, so the only difference
 * between them is which value the six slot-frames carry.
 *
 * usage: adopted.ts <before.check.json> <after.check.json>
 */
import { readFileSync } from 'node:fs';

const read = (p: string): Map<string, number> => {
  const r = JSON.parse(readFileSync(p, 'utf8')) as {
    animations: { dir: string; frames?: { index: number; slots?: { slot: string; drift: number | null }[] }[] }[];
  };
  const m = new Map<string, number>();
  for (const a of r.animations) for (const f of a.frames ?? []) for (const s of f.slots ?? []) {
    if (s.drift !== null) m.set(`${a.dir}|${f.index}|${s.slot}`, s.drift);
  }
  return m;
};

const before = read(process.argv[2]);
const after = read(process.argv[3]);
const adopted: [string, number, string][] = [
  ['death', 0, 'front-shin'],
  ['death', 0, 'rear-shin'],
  ['death', 7, 'front-shin'],
  ['death@30fps', 0, 'front-shin'],
  ['death@30fps', 0, 'rear-shin'],
  ['idle', 19, 'rear-thigh'],
];
process.stdout.write("the slot-frames where chainfit's hinge was adopted, before -> after:\n");
for (const [set, i, slot] of adopted) {
  const k = `${set}|${i}|${slot}`;
  const b = before.get(k);
  const a = after.get(k);
  const verdict = b === undefined || a === undefined ? 'no reading on one side' : a < b ? 'IMPROVED' : 'worse';
  process.stdout.write(
    `  ${set.padEnd(12)} f${String(i).padEnd(3)} ${slot.padEnd(12)} ` +
      `${(b ?? Number.NaN).toFixed(2).padStart(7)} -> ${(a ?? Number.NaN).toFixed(2).padStart(7)}   ${verdict}\n`,
  );
}
const stat = (m: Map<string, number>): [number, number, number] => {
  const v = [...m.values()];
  return [Math.max(...v), v.filter((x) => x > 6).length, v.length];
};
const [bw, bn, bt] = stat(before);
const [aw, an, at] = stat(after);
process.stdout.write(
  `\n  whole corpus: worst ${bw.toFixed(2)} -> ${aw.toFixed(2)};  readings over 6 px ${bn}/${bt} -> ${an}/${at}\n`,
);
