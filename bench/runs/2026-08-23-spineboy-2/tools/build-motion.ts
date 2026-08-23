/**
 * The motion spec: fitted pose series in, keys and a named easing table out.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCALE } from './geom.ts';
import { leverArms } from './lever.ts';
import { buildTable, plan, type Timeline } from './plan.ts';
import type { Handle } from './curves.ts';
import { KEYS, ROTATE_BONES, type FramePose } from './fit-poses.ts';

const here = import.meta.dir;
const run = join(here, '..');

/** The brief's duration table for `ess`, as exact thirtieths. */
export const DURATION: Record<string, number> = {
  aim: 0,
  death: 148 / 30,
  hit: 10 / 30,
  idle: 50 / 30,
  jump: 40 / 30,
  run: 20 / 30,
  shoot: 12 / 30,
  walk: 30 / 30,
};
const LOOPS = new Set(['idle', 'walk', 'run', 'shoot']);
const ALL = ['aim', 'death', 'hit', 'idle', 'jump', 'run', 'shoot', 'walk'];
const ANIMS = ALL.filter((a) => existsSync(join(here, `poses-${a}.json`)));
if (ANIMS.length !== ALL.length) console.log(`⚠ only ${ANIMS.join(', ')} have fitted poses`);

/** one tolerance, in frame pixels at the end of what the bone swings (§10.3) */
const TOL_PX = Number(process.env.TOL_PX ?? 0.8);
const arms = leverArms(join(run, 'ess', 'spine'));

function tolFor(knob: string): number {
  if (knob === 'hip.x' || knob === 'hip.y') return TOL_PX / SCALE;
  const bone = knob === 'hip.rot' ? 'hip' : knob;
  return TOL_PX / Math.max(0.05, arms[bone] ?? 1);
}

interface Track {
  bone?: string;
  slot?: string;
  property: string;
  keys: { t: number; v: number[] | string | null; ease?: string }[];
}

function series(anim: string): { ts: number[]; poses: FramePose[] } {
  const poses: FramePose[] = JSON.parse(readFileSync(join(here, `poses-${anim}.json`), 'utf8'));
  const d = DURATION[anim];
  const ts = poses.map((_, i) => Math.min(i / 12, d));
  if (poses.length > 1 && ts[ts.length - 1] < d - 1e-9) {
    // the shot runs a fraction past its last sampled frame; hold to the end so
    // the loaded duration is the declared one (R7)
    ts.push(d);
    poses.push(poses[poses.length - 1]);
  }
  return { ts, poses };
}

function timelines(anim: string): { knob: string; tl: Timeline }[] {
  const { ts, poses } = series(anim);
  const out: { knob: string; tl: Timeline }[] = [];
  const val = (p: FramePose, k: string) => p.v[k] ?? 0;
  const push = (knob: string, knobs: string[]) => {
    const ch = knobs.map((k) => poses.map((p) => val(p, k)));
    const tol = tolFor(knobs[0]);
    const moves = ch.some((c) => c.some((v) => Math.abs(v) > tol));
    if (!moves) return;
    out.push({ knob, tl: { ts, ch, tol } });
  };
  push('hip.translate', ['hip.x', 'hip.y']);
  push('hip.rot', ['hip.rot']);
  for (const b of ROTATE_BONES) push(b, [b]);
  return out;
}

// ---------------------------------------------------------------------------
// pass A — discover the shapes, then cluster them into the table pass B writes
// ---------------------------------------------------------------------------
const discovered: Handle[] = [];
for (const anim of ANIMS) for (const { tl } of timelines(anim)) discovered.push(...plan(tl, null).handles);
const TABLE_SIZE = Number(process.env.TABLE_SIZE ?? 10);
const table = buildTable(discovered, TABLE_SIZE);
console.log(`pass A: ${discovered.length} spans wanted a curve → ${table.length} named easings`);

// ---------------------------------------------------------------------------
// pass B — every timeline re-planned under that table
// ---------------------------------------------------------------------------
const MUZZLE_FLASH: [number, string | null][] = [
  [5 / 30, 'muzzle01'],
  [6 / 30, 'muzzle02'],
  [7 / 30, 'muzzle03'],
  [9 / 30, 'muzzle04'],
  [11 / 30, 'muzzle05'],
  [12 / 30, null],
];
const EVENTS: Record<string, { t: number; name: string }[]> = {
  walk: [
    { t: 13 / 30, name: 'footstep' },
    { t: 28 / 30, name: 'footstep' },
  ],
  run: [
    { t: 6 / 30, name: 'footstep' },
    { t: 17 / 30, name: 'footstep' },
  ],
  shoot: [{ t: 5 / 30, name: 'shoot' }],
};

const animations: Record<string, unknown> = {};
let totalKeys = 0;
const perAnim: string[] = [];
for (const anim of ANIMS) {
  const tracks: Track[] = [];
  let keys = 0;
  for (const { knob, tl } of timelines(anim)) {
    const r = plan(tl, table);
    keys += r.keys.length;
    const bone = knob === 'hip.translate' || knob === 'hip.rot' ? 'hip' : knob;
    const property = knob === 'hip.translate' ? 'translate' : 'rotate';
    tracks.push({
      bone,
      property,
      keys: r.keys.map((k, i) => ({
        t: round(k.t),
        v: k.v.map((x) => round6(x)),
        ...(i === r.keys.length - 1 ? {} : k.ease ? { ease: k.ease } : {}),
      })),
    });
  }
  // the fist is a visible choice and the fit made it per frame; the eye and the
  // mouth are not (the goggles cover the eyes on every frame and the mouth is
  // 6-8 px across), so neither is keyed — see the run's README
  const { ts, poses } = series(anim);
  const fistKeys: Track['keys'] = [];
  let last = 'front-fist-open';
  poses.forEach((p, i) => {
    if (i === 0 ? p.fist !== 'front-fist-open' : p.fist !== last) {
      fistKeys.push({ t: round(ts[i]), v: p.fist });
      last = p.fist;
    }
  });
  if (fistKeys.length) {
    tracks.push({ slot: 'front-fist', property: 'attachment', keys: fistKeys });
    keys += fistKeys.length;
  }
  if (anim === 'shoot') {
    // the flare is drawn far larger than its art and it blooms and disperses,
    // so the muzzle bone carries a scale key on each frame it is visible
    const flashIdx = poses.map((p, i) => (p.slots ? i : -1)).filter((i) => i >= 0);
    if (flashIdx.length) {
      tracks.push({
        bone: 'muzzle',
        property: 'scale',
        keys: flashIdx.map((i) => ({ t: round(ts[i]), v: [round6(poses[i].v['muzzle.sx'] ?? 1), round6(poses[i].v['muzzle.sy'] ?? 1)] })),
      });
      keys += flashIdx.length;
      if (flashIdx.some((i) => Math.abs(poses[i].v['muzzle.rot'] ?? 0) > 0.5)) {
        tracks.push({
          bone: 'muzzle',
          property: 'rotate',
          keys: flashIdx.map((i) => ({ t: round(ts[i]), v: [round6(poses[i].v['muzzle.rot'] ?? 0)] })),
        });
        keys += flashIdx.length;
      }
    }
    tracks.push({ slot: 'muzzle', property: 'attachment', keys: MUZZLE_FLASH.map(([t, v]) => ({ t: round(t), v })) });
    tracks.push({
      slot: 'muzzle-glow',
      property: 'attachment',
      keys: [
        { t: round(5 / 30), v: 'muzzle-glow' },
        { t: round(12 / 30), v: null },
      ],
    });
    tracks.push({
      slot: 'muzzle-ring',
      property: 'attachment',
      keys: [
        { t: round(5 / 30), v: 'muzzle-ring' },
        { t: round(12 / 30), v: null },
      ],
    });
    keys += MUZZLE_FLASH.length + 4;
  }
  const a: Record<string, unknown> = { duration: round(DURATION[anim]), loop: LOOPS.has(anim), tracks };
  if (EVENTS[anim]) {
    a.events = EVENTS[anim].map((e) => ({ t: round(e.t), name: e.name }));
    keys += EVENTS[anim].length;
  }
  animations[anim] = a;
  totalKeys += keys;
  perAnim.push(`${anim} ${tracks.length}tl/${keys}k`);
}

function round(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}
function round6(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}

const easings: Record<string, Handle> = {};
for (const t of table) easings[t.name] = t.h;

writeFileSync(
  join(run, 'ess', 'spineboy-ess.motion.json'),
  JSON.stringify({ spec: 'rigc-motion/1', archetype: 'spineboy-ess', cut: 'spineboy-ess', easings, animations }, null, 2) + '\n',
);
console.log(`pass B: ${totalKeys} keys — ${perAnim.join(', ')}`);
void KEYS;
