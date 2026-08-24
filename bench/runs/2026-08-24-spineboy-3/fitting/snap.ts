/** Build the current rig+motion into work/snap/<name>, so two iterations can be
 *  compared like-for-like by work/refmae.ts (an atlas page path is relative to
 *  its own directory, so a snapshot has to be BUILT at a fixed depth, not copied). */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const RUN = 'bench/runs/2026-08-24-spineboy-3/ess';
const name = process.argv[2];
const rig = JSON.parse(readFileSync(`${RUN}/spineboy-ess.rig.json`, 'utf8')) as { images: string };
rig.images = '../../examples/spineboy/images';
mkdirSync(`work/snap/${name}`, { recursive: true });
writeFileSync(`work/snap/${name}.rig.json`, JSON.stringify(rig, null, 2));
const out = execFileSync('bun', ['cli.ts', 'build', '--rig', `work/snap/${name}.rig.json`, '--motion',
  `${RUN}/spineboy-ess.motion.json`, '--images', 'examples/spineboy/images', '--out', `work/snap/${name}`,
  '--profile', 'spine'], { encoding: 'utf8' });
console.log(name, out.split('\n').filter((l) => l.includes('FAIL')).join(' | ') || 'built, no FAIL');
