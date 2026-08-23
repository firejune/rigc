/** Re-settle every fitted pose after the setup placements moved under them. */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { polish, setExtraSlots, target, type FramePose } from './fit-poses.ts';

const here = import.meta.dir;
const refRoot = join(here, '..', '../../reference/spineboy/ess');
for (const anim of process.argv.slice(2)) {
  const path = join(here, `poses-${anim}.json`);
  const poses: FramePose[] = JSON.parse(readFileSync(path, 'utf8'));
  const dir = join(refRoot, anim);
  const files = readdirSync(dir)
    .filter((f) => /^f\d+\.png$/.test(f))
    .sort();
  let before = 0;
  poses.forEach((p, i) => {
    const t = target(join(dir, files[i]));
    setExtraSlots(p.slots);
    before += p.mae;
    polish(p, t, 2, [3, 1.5], 3);
    polish(p, t, 3, [1.5, 0.8, 0.4, 0.2], 4);
  });
  writeFileSync(path, JSON.stringify(poses, null, 1) + '\n');
  const after = poses.reduce((s, p) => s + p.mae, 0) / poses.length;
  setExtraSlots(undefined);
  console.log(`${anim}: ${(before / poses.length).toFixed(2)} → ${after.toFixed(2)}`);
}
