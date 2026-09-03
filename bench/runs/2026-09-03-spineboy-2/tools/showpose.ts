/** Print one part's placement across the whole pose battery, best first. */
import { readFileSync } from 'node:fs';

const store = JSON.parse(readFileSync(process.argv[2] ?? '/tmp/sb2/pose/battery.json', 'utf8'));
const want = process.argv.slice(3);
const rows: { part: string; set: string; res: number; unex: number; amb: boolean; ref: string; x: number; y: number; rot: number }[] = [];
for (const [set, report] of Object.entries<any>(store)) {
  for (const part of report.parts) {
    const name = part.part.replace(/\.png$/, '');
    if (want.length && !want.includes(name)) continue;
    const p = part.placement;
    if (!p) continue;
    rows.push({
      part: name,
      set,
      res: p.residual,
      unex: p.unexplained,
      amb: !!part.ambiguous,
      ref: part.refusal ? part.refusal.reason : '',
      x: p.x,
      y: p.y,
      rot: p.rotationDeg,
    });
  }
}
rows.sort((a, b) => (a.part === b.part ? a.res - b.res : a.part < b.part ? -1 : 1));
let last = '';
for (const r of rows) {
  if (r.part !== last) {
    process.stdout.write(`\n${r.part}\n`);
    last = r.part;
  }
  process.stdout.write(
    `  ${r.set.padEnd(12)} res ${r.res.toFixed(4)}  unex ${(r.unex * 100).toFixed(0).padStart(3)}%  ` +
      `x ${r.x.toFixed(1).padStart(6)} y ${r.y.toFixed(1).padStart(6)} rot ${r.rot.toFixed(1).padStart(7)}` +
      `${r.amb ? '  AMBIG' : ''}${r.ref ? `  ${r.ref}` : ''}\n`,
  );
}
