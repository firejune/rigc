/** Build the motion spec from the fitted placements. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { ATTACHMENTS, fistTracks } from './attachments.ts';
import { Rigger } from './harness.ts';
import { piecesOf } from '../src/render.ts';
import { planTimeline, planPaired, discoverTable, type Series } from './plan.ts';
import type { Handles } from './curves.ts';

export const DUR: Record<string, number> = {
  aim: 0, death: 148 / 30, hit: 10 / 30, idle: 50 / 30, jump: 40 / 30, run: 20 / 30, shoot: 12 / 30, walk: 30 / 30,
};
export const LOOPS: Record<string, boolean> = { aim: false, death: false, hit: false, idle: true, jump: false, run: true, shoot: true, walk: true };
const SCALE = 0.22297348561444258;
const CAND = 'bench/runs/2026-08-24-spineboy-3/ess/spine';

/** lever arm per bone: how far the farthest pixel it swings sits from its origin. */
export function leverArms(): Record<string, number> {
  const r = new Rigger(CAND);
  r.apply({});
  const slotBone = new Map<string, string>();
  for (const s of r.skeleton.slots) slotBone.set(s.data.name, s.bone.data.name);
  const parent = new Map<string, string | null>();
  for (const b of r.skeleton.bones) parent.set(b.data.name, b.parent?.data.name ?? null);
  const isUnder = (bone: string, anc: string): boolean => {
    for (let at: string | null = bone; at; at = parent.get(at) ?? null) if (at === anc) return true;
    return false;
  };
  const origin = new Map<string, [number, number]>();
  for (const b of r.skeleton.bones) origin.set(b.data.name, [b.pose.worldX, b.pose.worldY]);
  const out: Record<string, number> = {};
  const pieces = piecesOf(r.skeleton);
  for (const b of r.skeleton.bones) {
    const o = origin.get(b.data.name)!;
    let far = 1;
    for (const p of pieces) {
      const sb = slotBone.get(p.slot);
      if (!sb || !isUnder(sb, b.data.name)) continue;
      for (let i = 0; i < p.world.length; i += 2) far = Math.max(far, Math.hypot(p.world[i] - o[0], p.world[i + 1] - o[1]));
    }
    out[b.data.name] = far;
  }
  return out;
}

export interface Placements { [anim: string]: Record<string, Record<string, Record<string, number>>> }

export function loadPlacements(): Placements {
  const out: Placements = {};
  for (const a of Object.keys(DUR)) {
    const f = `work/placements-${a}.json`;
    if (existsSync(f)) Object.assign(out, JSON.parse(readFileSync(f, 'utf8')));
  }
  return out;
}

export function seriesFor(pl: Placements, anim: string): { key: string; bone: string; prop: string; s: Series }[] {
  const dur = DUR[anim];
  // 12 fps samples strictly inside the animation, then the ONE frame the 30 fps
  // set ships at the duration itself. A 12 fps sample at or past the end is the
  // clamped final pose and would key past `duration` (§4.5).
  const all = Object.keys(pl[anim]).map(Number).sort((a, b) => a - b);
  const frames = all.filter((i) => i / 12 < dur - 1e-9 || dur === 0);
  const times = frames.map((i) => i / 12);
  const ends: Record<string, Record<string, number>> = existsSync('work/placements-end.json')
    ? JSON.parse(readFileSync('work/placements-end.json', 'utf8'))
    : {};
  const endPose = ends[anim];
  if (endPose && dur > 0) { frames.push(-1); times.push(dur); }
  const poseAt = (i: number) => (i === -1 ? endPose : pl[anim][i]);
  const bones = new Set<string>();
  for (const i of frames) for (const b of Object.keys(poseAt(i) ?? {})) bones.add(b);
  const out: { key: string; bone: string; prop: string; s: Series }[] = [];
  for (const bone of bones) {
    for (const prop of ['rotation', 'x', 'y']) {
      const values = frames.map((i) => poseAt(i)?.[bone]?.[prop] ?? 0);
      if (values.every((v) => Math.abs(v) < 1e-9)) continue;
      out.push({ key: `${bone}.${prop}`, bone, prop, s: { times, values } });
    }
  }
  return out;
}

export function build(tolPx: number, tableSize: number): { motion: unknown; stats: Record<string, number> } {
  const pl = loadPlacements();
  const lever = leverArms();
  const all: { s: Series; tol: number }[] = [];
  const per: Record<string, { key: string; bone: string; prop: string; s: Series; tol: number }[]> = {};
  for (const anim of Object.keys(pl)) {
    per[anim] = seriesFor(pl, anim).map((t) => {
      const arm = lever[t.bone] ?? 100;
      const tol = t.prop === 'rotation' ? (tolPx / SCALE / arm) * (180 / Math.PI) : tolPx / SCALE;
      all.push({ s: t.s, tol });
      return { ...t, tol };
    });
  }
  const table = discoverTable(all, tableSize);
  const animations: Record<string, unknown> = {};
  let keyCount = 0, trackCount = 0;
  for (const anim of Object.keys(DUR)) {
    const tracks: unknown[] = [];
    // §10.3: a bone that moves on BOTH axes gets one paired translate timeline,
    // which is what the editor writes unless Separate is checked. Only a bone
    // that moves on one axis alone is emitted single-axis.
    const paired = new Set<string>();
    for (const t of per[anim] ?? []) {
      if (t.prop !== 'x') continue;
      const y = (per[anim] ?? []).find((o) => o.bone === t.bone && o.prop === 'y');
      if (!y) continue;
      paired.add(`${t.bone}.x`); paired.add(`${t.bone}.y`);
      const keys = planPaired(t.s, y.s, t.tol, y.tol, table);
      keyCount += keys.length; trackCount++;
      tracks.push({
        bone: t.bone,
        property: 'translate',
        keys: keys.map((k, i) => ({ t: r6(k.t), v: [r4(k.v[0]), r4(k.v[1])], ...(i < keys.length - 1 && k.ease ? { ease: k.ease } : {}) })),
      });
    }
    for (const t of per[anim] ?? []) {
      if (paired.has(t.key)) continue;
      const keys = planTimeline(t.s, t.tol, table);
      if (keys.length <= 1 && Math.abs(keys[0]?.v ?? 0) < 1e-9) continue;
      keyCount += keys.length; trackCount++;
      tracks.push({
        bone: t.bone,
        property: t.prop === 'rotation' ? 'rotate' : t.prop === 'x' ? 'translatex' : 'translatey',
        keys: keys.map((k, i) => ({ t: r6(k.t), v: [r4(k.v)], ...(i < keys.length - 1 && k.ease ? { ease: k.ease } : {}) })),
      });
    }
    for (const t of [...fistTracks(anim), ...(ATTACH_TRACKS[anim] ?? [])]) { tracks.push(t); trackCount++; keyCount += (t as { keys: unknown[] }).keys.length; }
    const ev = EVENTS[anim];
    animations[anim] = { duration: DUR[anim], loop: LOOPS[anim], tracks, ...(ev ? { events: ev } : {}) };
  }
  return {
    motion: { spec: 'rigc-motion/1', archetype: 'spineboy-ess', cut: 'spineboy-ess', easings: table, animations },
    stats: { keys: keyCount, tracks: trackCount, easings: Object.keys(table).length },
  };
}
function r6(v: number): number { return Math.round(v * 1e6) / 1e6; }
function r4(v: number): number { return Math.round(v * 1e4) / 1e4; }

/**
 * Attachment swaps and event cues, per shot.
 *
 * The cues are the ones the brief measures to the frame: `walk`'s two footfalls
 * (0.400-0.417 s and 0.900-0.917 s), `run`'s two (0.167-0.200 s and
 * 0.533-0.567 s) and `shoot`'s discharge (0.133-0.167 s). The NAMES are an
 * animator's, not the reference's - the brief says outright it will not tell
 * you how a moment is spelled.
 */
export const EVENTS: Record<string, { t: number; name: string }[]> = {
  walk: [{ t: 5 / 12, name: 'footstep' }, { t: 11 / 12, name: 'footstep' }],
  run: [{ t: 6 / 30, name: 'footstep' }, { t: 17 / 30, name: 'footstep' }],
  shoot: [{ t: 5 / 30, name: 'shoot' }],
  // `jump` lands too, and the brief measures it to the frame in the same terms
  // as the gaits' footfalls - "back on the floor at f15 (lowest row 336)". A
  // game holding a jump wants that instant for the same reason it wants a
  // walk's; there is one of them, and it is the shot's only ground contact.
  jump: [{ t: 15 / 12, name: 'footstep' }],
};
export const ATTACH_TRACKS: Record<string, unknown[]> = {};
export function setAttachTracks(t: Record<string, unknown[]>): void {
  for (const k of Object.keys(ATTACH_TRACKS)) delete ATTACH_TRACKS[k];
  Object.assign(ATTACH_TRACKS, t);
}

if (import.meta.main) {
  setAttachTracks(ATTACHMENTS);
  const tol = Number(process.argv[2] ?? 0.5);
  const size = Number(process.argv[3] ?? 8);
  const { motion, stats } = build(tol, size);
  writeFileSync('bench/runs/2026-08-24-spineboy-3/ess/spineboy-ess.motion.json', JSON.stringify(motion, null, 2) + '\n');
  console.log('tol', tol, 'px ->', JSON.stringify(stats));
  void (null as unknown as Handles);
}
