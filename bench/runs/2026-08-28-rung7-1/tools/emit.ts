/**
 * Rung 7 — write the rig spec, and a motion spec from whatever keys exist.
 *
 *   bun tools/emit.ts --mode mesh --motion hold      structure only: every animation
 *                                                    holds the setup pose
 *   bun tools/emit.ts --mode mesh --motion keys      from keys.json
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { buildRig, DURATIONS } from './spec.ts';

const args = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const mode = arg('mode', 'mesh') as 'mesh' | 'region';
const kind = arg('motion', 'hold');
const out = arg('out', 'bench/runs/2026-08-28-rung7-1');

mkdirSync(out, { recursive: true });
writeFileSync(`${out}/sack.rig.json`, JSON.stringify(buildRig(mode), null, 2) + '\n');

interface Key {
  t: number;
  v: number[];
  ease?: string;
}
interface Track {
  bone: string;
  property: string;
  keys: Key[];
}

let animations: Record<string, unknown>;
let easings: Record<string, number[]> = {};

if (kind === 'keys' && existsSync(`${out}/keys.json`)) {
  const planned = JSON.parse(readFileSync(`${out}/keys.json`, 'utf8')) as {
    easings: Record<string, number[]>;
    animations: Record<string, Track[]>;
  };
  easings = planned.easings;
  animations = {};
  for (const [name, tracks] of Object.entries(planned.animations))
    animations[name] = { duration: DURATIONS[name], loop: name === 'walk', tracks };
} else {
  // "hold": one two-key translate per animation at the setup value. Enough to make
  // check compare all four sets, so the framing can be verified before any pose is
  // fitted — and a deliberate zero, not a guess.
  animations = {};
  for (const [name, duration] of Object.entries(DURATIONS))
    animations[name] = {
      duration,
      loop: name === 'walk',
      tracks: [
        {
          bone: 'sack',
          property: 'translate',
          keys: [
            { t: 0, v: [0, 0] },
            { t: duration, v: [0, 0] },
          ],
        },
      ],
    };
}

writeFileSync(
  `${out}/sack.motion.json`,
  JSON.stringify({ spec: 'rigc-motion/1', archetype: 'sack', cut: '7-anticipation', easings, animations }, null, 2) + '\n',
);
console.log(`wrote ${out}/sack.rig.json and ${out}/sack.motion.json  (mode=${mode}, motion=${kind})`);
