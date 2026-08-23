/**
 * Write the motion spec from the per-frame fits.
 *
 *   bun … tools/emitmotion.ts <setup.json> <out.motion.json> <tolerancePx> <poses-dir>
 *
 * `poses-dir` holds `<set>.json` as written by `fitanim.ts`.
 */
import { writeFileSync } from 'node:fs';
import { build, joints as jointsOf, emptyPose } from './skel.ts';
import { TREE, DRAW_ORDER, ALTERNATIVES, loadSetup } from './model.ts';
import { EASINGS, reduce, reducePair, type Key } from './keys.ts';
import { art, quadOf, viewportOf, DEG } from './lib.ts';

const SCALE = viewportOf('ess').scale;

/** Duration and loop flag per shot — the brief's own table, on a 30 fps grid. */
export const SHOTS: Record<string, { duration: number; frames: number; loop: boolean }> = {
  aim: { duration: 0, frames: 1, loop: false },
  death: { duration: 4.933333, frames: 60, loop: false },
  hit: { duration: 0.333333, frames: 5, loop: false },
  idle: { duration: 1.666667, frames: 21, loop: true },
  jump: { duration: 1.333333, frames: 17, loop: false },
  run: { duration: 0.666667, frames: 9, loop: true },
  shoot: { duration: 0.4, frames: 6, loop: true },
  walk: { duration: 1, frames: 13, loop: true },
};

/**
 * Event firings, in the windows the brief measures to the frame. Each is the one
 * value inside the intersection of the shot's 12 fps and 30 fps windows that
 * sits on the editor's default 30 fps grid; where the intersection holds no grid
 * point, its closed end is used and the log says so.
 */
export const EVENTS: Record<string, { t: number; name: string }[]> = {
  walk: [
    { t: 0.416666, name: 'footstep' },
    { t: 0.916666, name: 'footstep' },
  ],
  run: [
    { t: 0.2, name: 'footstep' },
    { t: 0.566666, name: 'footstep' },
  ],
  jump: [{ t: 1.25, name: 'footstep' }],
  shoot: [{ t: 0.166666, name: 'gunshot' }],
};

/**
 * The near fist is clenched while the figure is moving and open while it is not.
 * Measured over each whole shot with the pose held and only the attachment
 * swapped (`tools/alts.ts`): `front-fist-closed` wins `walk` by 1.6 %, `aim` by
 * 1.3 % and `run` by 0.7 %, while `front-fist-open` wins `idle` by **8.4 %**,
 * which is what makes the setup pose's choice the open one. `hit` splits by
 * 0.04 % and is left alone as a tie.
 */
export const FIST_CLOSED = new Set(['walk', 'run', 'aim']);

/** The flare, read off `shoot` f2–f4 and the 30 fps sheet's tiles 5–11. */
/**
 * ⚠️ The times are written **down**, never rounded up. 5/30 s and 2/12 s are the
 * same instant — 0.16666666… — and `0.166667` is larger than it, so a key
 * written that way lands a ten-millionth of a second *after* the frame that is
 * supposed to show it. The self-check caught exactly that: the flare fired on
 * f3 and f4 where the reference has it on f2, f3 and f4. An attachment key is
 * stepped, so nothing smooths the miss over — it is the same class of defect as
 * rung 6's reveal landing 0.000034 s past its duration (§4.5).
 */
export const MUZZLE_KEYS = [
  { t: 0.166666, v: 'muzzle01' },
  { t: 0.233333, v: 'muzzle02' },
  { t: 0.3, v: 'muzzle03' },
  { t: 0.333333, v: 'muzzle04' },
  { t: 0.366666, v: 'muzzle05' },
  { t: 0.4, v: null },
];

/** Frame indices that must carry a key: the ends of a hold the brief measures. */
export const HOLDS: Record<string, number[]> = { shoot: [1], death: [17, 18, 26, 27] };

const [setupFile, out, tolArg, posesDir] = process.argv.slice(2);
const tolPx = Number(tolArg ?? 0.5);
const setup = await loadSetup(setupFile);
const drawn = DRAW_ORDER.filter((d) => setup.some((p) => p.part === d));
const s = build(TREE, setup, drawn);

// --- lever arms: how far the furthest thing a bone carries sits from its joint,
// --- so one tolerance in frame pixels becomes a per-bone tolerance in degrees.
const kids = new Map<string, string[]>();
for (const b of s.bones) if (b.parent) kids.set(b.parent, [...(kids.get(b.parent) ?? []), b.name]);
const subtree = (name: string): string[] => [name, ...(kids.get(name) ?? []).flatMap(subtree)];
const setupJoints = jointsOf(s, emptyPose(s));
const lever: Record<string, number> = {};
for (const b of s.bones) {
  const parts = subtree(b.name);
  let far = 0;
  for (const a of s.attachments) {
    if (!parts.includes(a.bone)) continue;
    const p = setup.find((q) => q.part === a.slot);
    if (!p) continue;
    const q = quadOf({ ...p, sx: 1, sy: 1 });
    for (let i = 0; i < q.world.length; i += 2) far = Math.max(far, Math.hypot(q.world[i] - b.joint[0], q.world[i + 1] - b.joint[1]));
  }
  lever[b.name] = Math.max(far, 20);
}
void setupJoints;
void art;

const animations: Record<string, unknown> = {};
const stats: string[] = [];
for (const [name, shot] of Object.entries(SHOTS)) {
  const file = Bun.file(`${posesDir}/${name}.json`);
  if (!(await file.exists())) {
    console.log(`${name.padEnd(6)} no poses on disk — skipped`);
    continue;
  }
  const doc = JSON.parse(await file.text()) as {
    frames: { index: number; pose: { rot: Record<string, number>; move: Record<string, [number, number]> } }[];
  };
  const ts = doc.frames.map((f) => Math.min(f.index / 12, shot.duration));
  ts[ts.length - 1] = shot.duration;
  // ⭐ `shoot` opens on a hold: the brief measures f0 and f1 as bit-identical,
  // the only motionless consecutive pair in the whole reference. A per-frame fit
  // has no way to know that and lands two slightly different poses, which
  // `check`'s per-frame column catches at once ("yours moved 862 px where the
  // reference moved 0"). The hold is a fact about the shot, so it is authored.
  if (name === 'shoot') doc.frames[1].pose = doc.frames[0].pose;
  // ⭐ `death` lies still from f18 to f26 — nine frames, 0.75 s, the passage that
  // makes the shot read as death. The brief measures it: consecutive differences
  // of 24–45 px against thousands either side, and a bounding box that moves by
  // at most one pixel. A per-frame fit cannot hear that and jitters; `check`'s
  // per-frame column called it out on twelve pairs, worst *"yours moved 1215 px
  // where the reference moved 0"*. Averaging the nine fitted poses authors the
  // stillness that is actually in the shot.
  if (name === 'death') {
    const hold = doc.frames.slice(18, 27);
    const keys = Object.keys(hold[0].pose.rot);
    const avg: (typeof hold)[0]['pose'] = { rot: {}, move: { hip: [0, 0] } };
    for (const k of keys) avg.rot[k] = hold.reduce((t, f) => t + (f.pose.rot[k] ?? 0), 0) / hold.length;
    avg.move.hip = [
      hold.reduce((t, f) => t + (f.pose.move.hip?.[0] ?? 0), 0) / hold.length,
      hold.reduce((t, f) => t + (f.pose.move.hip?.[1] ?? 0), 0) / hold.length,
    ];
    for (const f of hold) f.pose = avg;
  }
  const tracks: unknown[] = [];
  let keyCount = 0;

  const move = doc.frames.map((f) => f.pose.move.hip ?? [0, 0]);
  const tolUnits = tolPx / SCALE;
  const pair = reducePair(ts, move.map((m) => m[0]), move.map((m) => m[1]), tolUnits, HOLDS[name] ?? []);
  if (pair.some((k) => Math.abs(k.v[0]) > 1e-4 || Math.abs(k.v[1]) > 1e-4) || shot.duration === 0) {
    tracks.push({ bone: 'hip', property: 'translate', keys: pair.map((k, i) => ({ t: +k.t.toFixed(6), v: [+k.v[0].toFixed(3), +k.v[1].toFixed(3)], ...(i < pair.length - 1 && k.ease ? { ease: k.ease } : {}) })) });
    keyCount += pair.length;
  }

  for (const b of s.bones) {
    if (b.name === 'root' || b.name === 'muzzle') continue;
    const vs = doc.frames.map((f) => f.pose.rot[b.name] ?? 0);
    const tolDeg = (tolPx / SCALE / lever[b.name]) / DEG;
    const ks: Key[] = reduce(ts, vs, tolDeg, 96, HOLDS[name] ?? []);
    if (ks.length === 1 && Math.abs(ks[0].v) < 1e-4 && shot.duration > 0) continue;
    tracks.push({
      bone: b.name,
      property: 'rotate',
      keys: ks.map((k, i) => ({ t: +k.t.toFixed(6), v: [+k.v.toFixed(3)], ...(i < ks.length - 1 && k.ease ? { ease: k.ease } : {}) })),
    });
    keyCount += ks.length;
  }

  if (FIST_CLOSED.has(name)) {
    tracks.push({ slot: 'front-fist', property: 'attachment', keys: [{ t: 0, v: 'front-fist-closed' }] });
    keyCount += 1;
  }
  if (name === 'shoot') {
    tracks.push({ slot: 'muzzle', property: 'attachment', keys: MUZZLE_KEYS.map((k) => ({ t: k.t, v: k.v })) });
    keyCount += MUZZLE_KEYS.length;
  }

  animations[name] = {
    duration: shot.duration,
    loop: shot.loop,
    tracks,
    ...(EVENTS[name] ? { events: EVENTS[name] } : {}),
  };
  stats.push(`${name.padEnd(6)} ${String(tracks.length).padStart(2)} timelines  ${String(keyCount).padStart(4)} keys`);
}

const motion = {
  spec: 'rigc-motion/1',
  archetype: 'spineboy-ess',
  cut: 'spineboy',
  easings: EASINGS,
  animations,
};
writeFileSync(out, JSON.stringify(motion, null, 2));
for (const line of stats) console.log(line);
console.log(`wrote ${out}  tolerance ${tolPx} frame px`);
void ALTERNATIVES;
