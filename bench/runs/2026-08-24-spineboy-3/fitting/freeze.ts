/**
 * A hold that is not held is invisible in every per-frame figure and loud in
 * the relation between two (§9.2). The reference goes dead still in `death`
 * f18-f26 — consecutive pairs differ by 24-45 px against thousands elsewhere —
 * so wherever the reference holds, the fitted series is made to hold too:
 * the pose is copied forward rather than re-fitted, which is what §10.3's
 * "key the start of a hold and key its end, at the same value" needs upstream.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { refFrame } from './fit.ts';
import { SETS } from './fitrun.ts';

const THRESHOLD = Number(process.env.HOLD ?? 120);
for (const anim of Object.keys(SETS)) {
  const file = `work/placements-${anim}.json`;
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  const pl = doc[anim];
  let held = 0;
  for (let i = 1; i < SETS[anim]; i++) {
    const a = refFrame(anim, i - 1), b = refFrame(anim, i);
    let d = 0;
    for (let k = 0; k < a.data.length; k += 4)
      if (Math.abs(a.data[k] - b.data[k]) > 2 || Math.abs(a.data[k+1] - b.data[k+1]) > 2 || Math.abs(a.data[k+2] - b.data[k+2]) > 2) d++;
    if (d < THRESHOLD) { pl[i] = JSON.parse(JSON.stringify(pl[i - 1])); held++; }
  }
  if (held) console.log(anim.padEnd(7), `${held} frame(s) held to their predecessor`);
  writeFileSync(file, JSON.stringify(doc, null, 1));
}
