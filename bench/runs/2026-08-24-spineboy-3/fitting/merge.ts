/** Merge frame ranges refitted in parallel back into one placements file. */
import { readFileSync, writeFileSync } from 'node:fs';
const [anim, ...parts] = process.argv.slice(2);
const file = `work/placements-${anim}.json`;
const store = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, unknown>>;
let n = 0;
for (const spec of parts) {
  const [path, range] = spec.split('@');
  const src = JSON.parse(readFileSync(path, 'utf8')) as Record<string, Record<string, unknown>>;
  const [a, b] = range.split('-').map(Number);
  for (let i = a; i <= b; i++) { store[anim][i] = src[anim][i]; n++; }
}
writeFileSync(file, JSON.stringify(store));
console.log(`${anim}: merged ${n} frame(s)`);
