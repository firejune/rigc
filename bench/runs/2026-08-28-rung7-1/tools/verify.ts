/**
 * Rung 7 — close the key-planning loop on the frames.
 *
 * §10.3's ⭐: "stop trusting the floor and close the loop on the frames, because a floor
 * is a heuristic and the column is a measurement — sample your own planned curves at the
 * frames' own rate, render them, compare every adjacent pair against the reference's own
 * change, force the offending frames as keys, and re-plan, repeating until no pair is out
 * of band."
 *
 * The band is `src/check.ts`'s own, read off it rather than guessed:
 *   - stillness is categorical: if one side moved 0 pixels and the other did not, that
 *     is a disagreement with no floor at all;
 *   - if both moved, it takes CHANGE_RATIO = 4 times as much AND CHANGE_EXCESS = 24
 *     pixels more;
 *   - a pixel counts as changed when a channel moves by more than CHANGE_TOLERANCE = 8;
 *   - and it is measured over the WHOLE frame, not over a content mask.
 *
 * Sampling is done here rather than through a build, exactly as §10.3 says it can be —
 * so an iteration of this loop costs no build at all.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Plate, readPlate } from '../../../../tools/plate.ts';
import { applyPose, framesBox, makeRig, renderInto, windowViewport, type Knob } from './pose.ts';
import { ANIMS, frameFiles } from './frames.ts';
import { evalHandles, type Handles } from './curve.ts';
import { DURATIONS } from './spec.ts';

const ROOT = 'bench/reference-local/7-anticipation';
const RUN = 'bench/runs/2026-08-28-rung7-1';
const FPS = 12;
const CHANGE_TOLERANCE = 8;
const CHANGE_RATIO = 4;
const CHANGE_EXCESS = 24;

const disagrees = (mine: number, theirs: number): boolean => {
  if (mine === 0) return false;
  if (theirs === 0) return true;
  return mine > theirs * CHANGE_RATIO && mine - theirs > CHANGE_EXCESS;
};

function plateDelta(a: Plate, b: Plate): number {
  const x = a.data;
  const y = b.data;
  let n = 0;
  for (let i = 0; i < x.length; i += 4)
    if (
      Math.abs(x[i] - y[i]) > CHANGE_TOLERANCE ||
      Math.abs(x[i + 1] - y[i + 1]) > CHANGE_TOLERANCE ||
      Math.abs(x[i + 2] - y[i + 2]) > CHANGE_TOLERANCE
    )
      n++;
  return n;
}

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

const planned = JSON.parse(readFileSync(`${RUN}/keys.json`, 'utf8')) as {
  easings: Record<string, Handles>;
  animations: Record<string, Track[]>;
};
const store = JSON.parse(readFileSync(`${RUN}/placements.json`, 'utf8')) as {
  knobs: Knob[];
  values: Record<string, number[][]>;
};
const KNOBS = store.knobs;
const rig = makeRig(`${RUN}/spine`);
const ref = framesBox(ROOT);
const view = windowViewport(ref, 0, 0, ref.width, ref.height, 1);

const PROPS: Record<string, Knob['prop'][]> = {
  translate: ['x', 'y'],
  rotate: ['rotation'],
  scale: ['scaleX', 'scaleY'],
};

/** the pose the planned curves put the skeleton in at sample `i` */
function sampleKeys(set: string, i: number): number[] {
  const t = i / FPS;
  const values = KNOBS.map((k) => k.base);
  for (const track of planned.animations[set]) {
    const props = PROPS[track.property];
    const keys = track.keys;
    let a = 0;
    while (a + 1 < keys.length && keys[a + 1].t <= t) a++;
    let out: number[];
    if (a + 1 >= keys.length || t <= keys[a].t) out = keys[Math.min(a, keys.length - 1)].v.slice();
    else {
      const b = a + 1;
      const u = (t - keys[a].t) / (keys[b].t - keys[a].t);
      const ease = keys[a].ease;
      const h = ease ? planned.easings[ease] : null;
      const f = h ? evalHandles(h, u) : u;
      out = keys[a].v.map((v0, j) => v0 + (keys[b].v[j] - v0) * f);
    }
    for (let j = 0; j < props.length; j++) {
      const idx = KNOBS.findIndex((k) => k.bone === track.bone && k.prop === props[j]);
      if (idx < 0) continue;
      // §4.4: translate keys are relative to setup; rotate and scale are absolute
      values[idx] = track.property === 'translate' ? KNOBS[idx].base + out[j] : out[j];
    }
  }
  return values;
}

const force: Record<string, number[]> = {};
let disagreements = 0;
let worst = { set: '', pair: -1, mine: 0, theirs: 0 };
const plate = new Plate(ref.width, ref.height);
const summary: string[] = [];

for (const set of ANIMS) {
  const files = frameFiles(set);
  const mineCopies: Plate[] = [];
  for (let i = 0; i < files.length; i++) {
    applyPose(rig, KNOBS, sampleKeys(set, i));
    renderInto(rig, plate, view);
    const copy = new Plate(ref.width, ref.height);
    copy.data.set(plate.data);
    mineCopies.push(copy);
  }
  const refs = files.map((f) => readPlate(`${ROOT}/${set}/${f}`));
  const bad: number[] = [];
  let agree = 0;
  for (let i = 1; i < files.length; i++) {
    const mine = plateDelta(mineCopies[i - 1], mineCopies[i]);
    const theirs = plateDelta(refs[i - 1], refs[i]);
    const d = disagrees(mine, theirs) || disagrees(theirs, mine);
    if (d) {
      bad.push(i - 1, i);
      disagreements++;
      if (Math.abs(mine - theirs) > Math.abs(worst.mine - worst.theirs))
        worst = { set, pair: i - 1, mine, theirs };
    } else agree++;
  }
  force[set] = [...new Set(bad)].sort((a, b) => a - b);
  summary.push(
    `  ${set.padEnd(22)} ${agree}/${files.length - 1} adjacent pair(s) agree; ` +
      `${force[set].length ? `force ${force[set].join(',')}` : 'nothing to force'}`,
  );
}

console.log('frame-change agreement, planned curves against the reference (check.ts\'s own band)');
console.log(summary.join('\n'));
console.log(
  `\n${disagreements} disagreement(s) in total` +
    (disagreements ? `; worst ${worst.set} pair f${worst.pair}->f${worst.pair + 1}: mine ${worst.mine}, reference ${worst.theirs}` : ''),
);
writeFileSync(`${RUN}/force.json`, JSON.stringify(force) + '\n');
console.log(`wrote ${RUN}/force.json`);

// also report where the planned curves sit against the fitted poses, in MAE terms
let sum = 0;
let n = 0;
for (const set of ANIMS) {
  const files = frameFiles(set);
  for (let i = 0; i < files.length; i++) {
    const a = sampleKeys(set, i);
    const b = store.values[set][i];
    let m = 0;
    for (let k = 0; k < KNOBS.length; k++) m = Math.max(m, Math.abs(a[k] - b[k]));
    sum += m;
    n++;
  }
}
console.log(`planned curves vs fitted poses: mean worst-knob deviation ${(sum / n).toFixed(3)} raw units`);
