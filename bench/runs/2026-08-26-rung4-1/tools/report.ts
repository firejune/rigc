/** Per-frame fit ratio for a set, from its stored poses. */
import { readFileSync } from 'node:fs';
import { refFrame } from './fitlib.ts';
const set = process.argv[2];
const d = JSON.parse(readFileSync(`bench/runs/2026-08-26-rung4-1/fit/${set}.poses.json`, 'utf8')) as { scores: number[] };
const rs: number[] = [];
for (let i = 0; i < d.scores.length; i++) {
  const ref = refFrame(`bench/reference/4-wave-principle/${set}/f${String(i).padStart(4, '0')}.png`);
  rs.push(d.scores[i] / ref.inkCost);
}
const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
const worst = Math.max(...rs);
console.log(`${set}: mean ${mean.toFixed(4)}  worst ${worst.toFixed(4)} at f${rs.indexOf(worst)}`);
console.log('over 0.25: ' + rs.map((r, i) => (r > 0.25 ? `f${i}:${r.toFixed(2)}` : '')).filter(Boolean).join(' '));
