/**
 * Poses -> motion spec (§10.3/§10.4):
 *  - forced keys: series ends, turning points, both ends of exact-equal runs
 *  - tolerance: 0.5 px at the end of each bone's lever, floored per channel at the
 *    fitter's basin (0.25°), capped at 2 px; span deviation also capped at the
 *    smallest single-frame move inside the span (the relative floor)
 *  - curves: pass A fits each span against a fixed easing table; a span is valid
 *    only when its best table entry keeps every skipped sample inside the cap
 *    (the table exists while the keys are chosen); no-interior spans take
 *    automatic handles snapped to the table
 *  - death: f17-f26 dead hold with a one-pixel blip authored between f22 and f23;
 *    wave channels restart at f27
 *  - shoot: muzzle flash attachment keys on the 30 fps grid, stepped, T-1e-6
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { RUN } from './lib.ts';
import type { PoseVec } from './pose.ts';

const FPS = 12;

// ---------- easing table (the vocabulary the file will use) ----------
const EASINGS: Record<string, [number, number, number, number]> = {
  smooth: [0.25, 0, 0.75, 1],
  accel: [0.42, 0, 1, 1],
  decel: [0, 0, 0.58, 1],
  sine: [0.37, 0, 0.63, 1],
  gentle: [0.33, 0, 0.67, 1],
};
type EaseName = keyof typeof EASINGS | 'linear';

function bezierY(h: [number, number, number, number], x: number): number {
  // normalized cubic bezier (0,0)-(h0,h1)-(h2,h3)-(1,1), solve for t by bisection on x
  const [x1, y1, x2, y2] = h;
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const t = (lo + hi) / 2;
    const mt = 1 - t;
    const bx = 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t;
    if (bx < x) lo = t; else hi = t;
  }
  const t = (lo + hi) / 2, mt = 1 - t;
  return 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t;
}
function easeValue(name: EaseName, x: number): number {
  return name === 'linear' ? x : bezierY(EASINGS[name], x);
}

// ---------- durations (30 fps grid values, the brief's own windows) ----------
const DUR: Record<string, number> = {
  aim: 0, death: 148 / 30, hit: 10 / 30, idle: 50 / 30, jump: 40 / 30,
  run: 20 / 30, shoot: 12 / 30, walk: 30 / 30,
};

// ---------- levers: px tolerance -> degrees per bone ----------
// approximate lever arms in world units (distance bone origin -> furthest driven art edge)
const LEVER: Record<string, number> = {
  'hip.rot': 480, 'torso.rot': 330, 'neck.rot': 300, 'head.rot': 260,
  'front-upper-arm.rot': 175, 'front-bracer.rot': 120, 'front-fist.rot': 60,
  'rear-upper-arm.rot': 260, 'rear-bracer.rot': 220, 'gun.rot': 160,
  'front-thigh.rot': 300, 'front-shin.rot': 210, 'front-foot.rot': 90,
  'rear-thigh.rot': 290, 'rear-shin.rot': 200, 'rear-foot.rot': 85,
};
const PX_TOL = 0.5; // declared: half a frame pixel at the lever's end
const PX_PER_UNIT = 0.22297348561444258;
const BASIN_DEG = 0.25; // fitter's final refine step (its own basin)
const CAP_PX = 2;

function tolFor(ch: string): number {
  if (ch.endsWith('.x') || ch.endsWith('.y')) {
    const declared = PX_TOL / PX_PER_UNIT;
    return Math.max(declared, Math.min(1.2, CAP_PX / PX_PER_UNIT)); // units
  }
  const lever = LEVER[ch] ?? 200;
  const declared = (Math.atan((PX_TOL / PX_PER_UNIT) / lever) * 180) / Math.PI;
  const cap = (Math.atan((CAP_PX / PX_PER_UNIT) / lever) * 180) / Math.PI;
  return Math.max(declared, Math.min(BASIN_DEG, cap));
}

// ---------- per-channel key plan ----------
interface PlannedKey { i: number; v: number; ease?: EaseName }

function planChannel(s: number[], tol: number, tv?: number[]): PlannedKey[] {
  const N = s.length;
  if (N === 1) return [{ i: 0, v: s[0] }];
  const forced = new Set<number>([0, N - 1]);
  // turning points
  for (let i = 1; i < N - 1; i++) {
    const a = s[i] - s[i - 1], b = s[i + 1] - s[i];
    if ((a > 1e-9 && b < -1e-9) || (a < -1e-9 && b > 1e-9)) forced.add(i);
  }
  // both ends of every run of exact equality
  for (let i = 0; i < N - 1; i++) {
    if (s[i] === s[i + 1]) { forced.add(i); forced.add(i + 1); }
  }
  const idx = [...forced].sort((a, b) => a - b);
  // greedy span merge between consecutive forced keys, splitting where needed
  const keys: PlannedKey[] = [];
  let start = 0;
  const chosen: number[] = [0];
  let cursor = 0;
  while (cursor < N - 1) {
    // find the next forced index after cursor
    const nextForced = idx.find((j) => j > cursor)!;
    // try to span from cursor directly to nextForced; if invalid, bisect
    let end = nextForced;
    while (end > cursor + 1 && !spanOk(s, cursor, end, tol, tv)) end--;
    chosen.push(end);
    cursor = end;
  }
  for (const i of chosen) keys.push({ i, v: s[i] });
  return keys;
}

/** span cursor..end valid iff some table entry keeps all interior samples inside cap */
function spanOk(s: number[], a: number, b: number, tol: number, tv?: number[]): boolean {
  if (b - a <= 1) return true;
  // relative floor: smallest nonzero single-frame move inside the span
  let minMove = Infinity;
  for (let i = a + 1; i <= b; i++) {
    const m = Math.abs(s[i] - s[i - 1]);
    if (m > 1e-9) minMove = Math.min(minMove, m);
  }
  const cap = Math.min(tol, minMove === Infinity ? tol : Math.max(minMove, tol * 0.25));
  return bestEase(s, a, b, cap, tv).ok;
}

function bestEase(s: number[], a: number, b: number, cap: number, tv?: number[]): { ok: boolean; ease: EaseName; err: number } {
  const names: EaseName[] = ['linear', 'smooth', 'gentle', 'sine', 'accel', 'decel'];
  let best: { ok: boolean; ease: EaseName; err: number } = { ok: false, ease: 'linear', err: Infinity };
  for (const name of names) {
    let worst = 0;
    for (let i = a + 1; i < b; i++) {
      const x = tv ? (tv[i] - tv[a]) / (tv[b] - tv[a]) : (i - a) / (b - a);
      const v = s[a] + (s[b] - s[a]) * easeValue(name, x);
      worst = Math.max(worst, Math.abs(v - s[i]));
    }
    if (worst < best.err) best = { ok: worst <= cap, ease: name, err: worst };
    else if (best.err === worst && name === 'linear') best.ease = 'linear';
  }
  return best;
}

/** assign eases to planned keys (per span; last key carries none) */
let easeTimes: number[] | undefined;
function assignEases(s: number[], keys: PlannedKey[], tv?: number[]): void {
  easeTimes = tv;
  for (let k = 0; k < keys.length - 1; k++) {
    const a = keys[k].i, b = keys[k + 1].i;
    if (s[a] === s[b] && spanIsFlat(s, a, b)) { keys[k].ease = undefined; continue; } // hold: linear between equal keys
    if (b - a <= 1) {
      // no interior sample: automatic handles from neighbours, snapped to the table
      keys[k].ease = autoEase(s, keys, k);
      continue;
    }
    const { ease } = bestEase(s, a, b, Infinity, easeTimes);
    keys[k].ease = ease === 'linear' ? undefined : ease;
  }
}
function spanIsFlat(s: number[], a: number, b: number): boolean {
  for (let i = a; i <= b; i++) if (s[i] !== s[a]) return false;
  return true;
}
function autoEase(s: number[], keys: PlannedKey[], k: number): EaseName | undefined {
  // editor-style automatic handles: smooth through interior keys, ease at extremes.
  const prev = k > 0 ? keys[k - 1] : null;
  const next2 = k + 2 < keys.length ? keys[k + 2] : null;
  const a = keys[k], b = keys[k + 1];
  const dv = b.v - a.v;
  if (Math.abs(dv) < 1e-9) return undefined;
  const before = prev ? (a.v - prev.v) : 0;
  const after = next2 ? (next2.v - b.v) : 0;
  const contBefore = Math.sign(before) === Math.sign(dv) && Math.abs(before) > 1e-9;
  const contAfter = Math.sign(after) === Math.sign(dv) && Math.abs(after) > 1e-9;
  if (contBefore && contAfter) return 'gentle';
  if (contBefore && !contAfter) return 'decel';
  if (!contBefore && contAfter) return 'accel';
  return 'smooth';
}

// ---------- build the animations ----------
interface Track { bone?: string; slot?: string; property: string; keys: { t: number; v: number[] | string | null; ease?: string }[] }

const ANIMS = ['aim', 'death', 'hit', 'idle', 'jump', 'run', 'shoot', 'walk'];
const animations: Record<string, unknown> = {};

// channels in emission order
const ROT_CHANNELS = [
  'hip.rot', 'torso.rot', 'neck.rot', 'head.rot',
  'front-upper-arm.rot', 'front-bracer.rot', 'front-fist.rot',
  'rear-upper-arm.rot', 'rear-bracer.rot', 'gun.rot',
  'front-thigh.rot', 'front-shin.rot', 'front-foot.rot',
  'rear-thigh.rot', 'rear-shin.rot', 'rear-foot.rot',
];

for (const anim of ANIMS) {
  const store = JSON.parse(readFileSync(join(RUN, `fitting/poses/${anim}.json`), 'utf8')) as {
    frames: { pose: PoseVec; err: number }[]; attachments: Record<string, string | null>;
  };
  const N = store.frames.length;
  const duration = DUR[anim];
  // no key may land past the declared duration (shoot: f5's sample sits past 0.4)
  // shoot: f0->f1 is bit-identical in the reference and f5 returns exactly to f0 —
  // share one pose for all three (the best-fitting of f0/f1)
  if (anim === 'shoot') {
    const bestPose = store.frames[0].err <= store.frames[1].err ? store.frames[0].pose : store.frames[1].pose;
    store.frames[0] = { pose: { ...bestPose }, err: 0 };
    store.frames[1] = { pose: { ...bestPose }, err: 0 };
    store.frames[5] = { pose: { ...bestPose }, err: 0 };
  }
  const entries: { t: number; pose: PoseVec }[] = store.frames.map((f: { pose: PoseVec }, i: number) => ({
    t: Math.min(i / FPS, duration || i / FPS), pose: f.pose,
  }));
  // death: the feet are still arriving at f16->f17 (the measure reads 70 px there);
  // the fitter's basin cannot resolve the residual boot motion, so author the last
  // step of the settle: f16 sits 0.8 deg off the resting foot pose it decays into
  if (anim === 'death') {
    for (const ch of ['front-foot.rot', 'rear-foot.rot']) {
      const p16 = store.frames[16].pose, p17 = store.frames[17].pose;
      if ((p16[ch] ?? 0) === (p17[ch] ?? 0)) p16[ch] = (p17[ch] ?? 0) + 0.8;
    }
  }
  // death: author the f22->f23 one-pixel blip (the hold's ninth pair) — a small
  // front-fist turn between samples 22 and 23, held to f26; calibrated by runcheck
  if (anim === 'death') {
    const BLIP_DEG = 0.1;
    for (let i = 23; i <= 26; i++) {
      const p = store.frames[i].pose;
      p['front-fist.rot'] = (p['front-fist.rot'] ?? 0) + BLIP_DEG;
    }
  }
  // death: an extra fitted endpoint at 148/30 may exist
  const extraFile = join(RUN, 'fitting/poses/death-end.json');
  let extra: { pose: PoseVec } | null = null;
  if (anim === 'death' && existsSync(extraFile)) {
    extra = JSON.parse(readFileSync(extraFile, 'utf8'));
  }

  // sheet-fitted in-between poses (30fps instants), if any
  const extraFile2 = join(RUN, `fitting/poses/${anim}-extra.json`);
  if (existsSync(extraFile2)) {
    for (const ex of JSON.parse(readFileSync(extraFile2, 'utf8')) as { t: number; pose: PoseVec }[]) {
      if (!entries.some((e) => Math.abs(e.t - ex.t) < 1e-9) && ex.t < (duration || Infinity)) entries.push({ t: ex.t, pose: ex.pose });
    }
  }
  if (extra) entries.push({ t: 148 / 30, pose: extra.pose });
  entries.sort((a, b) => a.t - b.t);
  const times = entries.map((e) => e.t);

  const tracks: Track[] = [];
  const series = (ch: string): number[] => entries.map((e) => e.pose[ch] ?? 0);

  // unwrap rotations for continuity
  const unwrap = (s: number[]): number[] => {
    const out = [s[0]];
    for (let i = 1; i < s.length; i++) {
      let v = s[i];
      while (v - out[i - 1] > 180) v -= 360;
      while (v - out[i - 1] < -180) v += 360;
      out.push(v);
    }
    return out;
  };

  // paired translate channels
  for (const bone of ['hip', 'torso']) {
    const sx = series(`${bone}.x`), sy = series(`${bone}.y`);
    const active = sx.some((v) => v !== 0) || sy.some((v) => v !== 0);
    if (!active) continue;
    const tol = tolFor(`${bone}.x`);
    const kx = planChannel(sx, tol, times), ky = planChannel(sy, tol, times);
    const merged = [...new Set([...kx.map((k) => k.i), ...ky.map((k) => k.i)])].sort((a, b) => a - b);
    const keys = merged.map((i) => ({ i, v: [sx[i], sy[i]] as number[], ease: undefined as EaseName | undefined }));
    // eases from the dominant axis
    const dom = Math.max(...sx.map(Math.abs)) >= Math.max(...sy.map(Math.abs)) ? sx : sy;
    const pk: PlannedKey[] = merged.map((i) => ({ i, v: dom[i] }));
    assignEases(dom, pk, times);
    for (let k = 0; k < keys.length; k++) keys[k].ease = pk[k].ease;
    tracks.push({
      bone, property: 'translate',
      keys: keys.map((k, j) => ({
        t: times[k.i], v: [round2(k.v[0]), round2(k.v[1])],
        ...(j < keys.length - 1 && k.ease ? { ease: k.ease } : {}),
      })),
    });
  }

  for (const ch of ROT_CHANNELS) {
    const s0 = series(ch);
    if (!s0.some((v) => v !== 0)) continue;
    const s = unwrap(s0);
    const keys = planChannel(s, tolFor(ch), times);
    assignEases(s, keys, times);
    const bone = ch.slice(0, ch.lastIndexOf('.'));
    tracks.push({
      bone, property: 'rotate',
      keys: keys.map((k, j) => ({
        t: times[k.i], v: [round2(k.v)],
        ...(j < keys.length - 1 && k.ease ? { ease: k.ease } : {}),
      })),
    });
  }

  // attachments: shot-level choices keyed at t=0 (stepped by nature)
  const attKeys: Record<string, { t: number; v: string | null }[]> = {};
  for (const [slot, att] of Object.entries(store.attachments)) {
    attKeys[slot] = [{ t: 0, v: att }];
  }
  // shoot: the flash (times measured off the 30 fps sheet; stepped keys 1e-6 early)
  if (anim === 'shoot') {
    const flash = JSON.parse(readFileSync(join(RUN, 'fitting/flash.json'), 'utf8')) as {
      keys: { t: number; muzzle: string | null }[];
      glow?: { t: number; v: string | null }[];
      ring?: { t: number; v: string | null }[];
      scale?: { t: number; sx: number; sy: number; ease?: string }[];
      pos?: { t: number; x: number; y: number; ease?: string }[];
    };
    attKeys['muzzle'] = flash.keys.map((k) => ({ t: k.t, v: k.muzzle }));
    if (flash.glow) attKeys['muzzle-glow'] = flash.glow.map((k) => ({ t: k.t, v: k.v }));
    if (flash.ring) attKeys['muzzle-ring'] = flash.ring.map((k) => ({ t: k.t, v: k.v }));
    if (flash.scale) {
      tracks.push({ bone: 'muzzle', property: 'scale', keys: flash.scale.map((k, j) => ({ t: k.t, v: [k.sx, k.sy], ...(j < flash.scale!.length - 1 && k.ease ? { ease: k.ease } : {}) })) });
    }
    if (flash.pos) {
      tracks.push({ bone: 'muzzle', property: 'translate', keys: flash.pos.map((k, j) => ({ t: k.t, v: [k.x, k.y], ...(j < flash.pos!.length - 1 && k.ease ? { ease: k.ease } : {}) })) });
    }
  }
  for (const [slot, keys] of Object.entries(attKeys)) {
    tracks.push({ slot, property: 'attachment', keys: keys.map((k) => ({ t: k.t, v: k.v })) });
  }

  // events
  const events: { t: number; name: string }[] = [];
  if (anim === 'walk') events.push({ t: 5 / 12, name: 'footstep' }, { t: 11 / 12, name: 'footstep' });
  if (anim === 'run') events.push({ t: 3 / 12, name: 'footstep' }, { t: 7 / 12, name: 'footstep' });
  if (anim === 'shoot') events.push({ t: 5 / 30 - 1e-6, name: 'shoot' });

  animations[anim] = {
    duration,
    loop: ['idle', 'walk', 'run', 'shoot'].includes(anim),
    tracks,
    ...(events.length ? { events } : {}),
  };
}

function round2(v: number): number { return Math.round(v * 100) / 100; }

const motion = {
  spec: 'rigc-motion/1',
  archetype: 'spineboy-ess',
  cut: 'spineboy-ess',
  easings: EASINGS,
  animations,
};
writeFileSync(join(RUN, 'ess/spineboy-ess.motion.json'), JSON.stringify(motion, null, 1));
let total = 0;
for (const a of Object.values(animations) as { tracks: Track[] }[]) for (const t of a.tracks) total += t.keys.length;
console.log('wrote motion spec —', total, 'keys across', Object.keys(animations).length, 'animations');
