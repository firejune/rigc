/**
 * Run `rigc pose` over a battery of frames chosen for ANGULAR DIVERSITY across
 * the joints, and collect every placement into one store.
 *
 * Why a battery rather than one frame: AUTHORING §8.1 says an attachment offset
 * is identified by a spread of rotations and a PIVOT only by frames whose
 * relative rotation across that joint actually differs — "a figure lying down,
 * or inverted, or reaching across itself, is what makes that joint observable".
 * So the list below deliberately mixes the stance, both arm extremes of `run`,
 * the crouch and the apex of `jump`, the horizontal `hit` and three passages of
 * `death`.
 *
 * The scale window is PINNED. `pose`'s default 0.5..2 does not contain the
 * truth here at all: the sidecar's own scale is 0.222973 px/unit and the art is
 * one unit per art pixel, which this run measured rather than assumed — with the
 * window opened to 0.10..0.40 the four biggest, most distinctive, unoccluded
 * parts (`gun`, `head`, `front-fist-closed`, `front-bracer`) came back at
 * 0.221/0.221/0.220/0.216 while every small or occluded part wandered, which is
 * §11.4's "a part shrunk inside the region it came from still explains those
 * pixels". Pinning removes that degree of freedom.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const SCALE_WINDOW = '0.2215,0.2245';

export const BATTERY = [
  'idle/f0000',
  'idle/f0010',
  'aim/f0000',
  'shoot/f0000',
  'shoot/f0003',
  'walk/f0000',
  'walk/f0003',
  'walk/f0006',
  'walk/f0009',
  'run/f0002',
  'run/f0003',
  'run/f0006',
  'jump/f0000',
  'jump/f0009',
  'jump/f0014',
  'hit/f0000',
  'hit/f0002',
  'hit/f0004',
  'death/f0004',
  'death/f0007',
  'death/f0020',
  'death/f0048',
  'death/f0055',
];

const root = process.argv[2] ?? 'bench/reference/spineboy/ess';
const parts = process.argv[3] ?? '/tmp/sb2/ess-parts';
const outDir = process.argv[4] ?? '/tmp/sb2/pose';

mkdirSync(outDir, { recursive: true });
const store: Record<string, unknown> = {};
for (const set of BATTERY) {
  const out = join(outDir, `${set.replace('/', '-')}.json`);
  if (!existsSync(out)) {
    const frame = join(root, `${set}.png`);
    mkdirSync(dirname(out), { recursive: true });
    const r = spawnSync(
      'bun',
      ['cli.ts', 'pose', '--images', parts, '--frame', frame, '--scale', SCALE_WINDOW, '--out', out],
      { encoding: 'utf8' },
    );
    if (r.status !== 0) throw new Error(`pose failed on ${set}: ${r.stderr}`);
    process.stderr.write(`.. pose ${set}\n`);
  }
  store[set] = JSON.parse(readFileSync(out, 'utf8'));
}
writeFileSync(join(outDir, 'battery.json'), `${JSON.stringify(store, null, 1)}\n`);
process.stderr.write(`wrote ${join(outDir, 'battery.json')} — ${BATTERY.length} frame(s)\n`);
