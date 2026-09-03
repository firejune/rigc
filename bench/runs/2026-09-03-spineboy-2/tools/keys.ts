/**
 * Turn the per-frame pose series into a motion spec.
 *
 * "What comes out is a pose per frame, and a pose per frame is not a key"
 * (AUTHORING §8.1). Everything §10.3 and §10.4 ask of a reducer is implemented
 * here rather than argued for, and each rule is named where it is applied:
 *
 *  - ONE declared tolerance, **in pixels at the end of what each bone swings**,
 *    converted per bone by that bone's own measured lever arm (§10.3).
 *  - floored per channel at that channel's own **basin**, capped (§10.3's ⚖️),
 *    with all three numbers recorded.
 *  - three kinds of FORCED index: the series ends, every turning point, and
 *    **both ends of every run of exactly equal values** (§10.3's ⚠️ — "a
 *    tolerance is not a hold").
 *  - each span's deviation capped at **the smallest single-frame move inside
 *    it** as well as at the tolerance (§10.3's relative floor).
 *  - **two easing passes**: pass A fits free handles only to discover the
 *    shapes, they are clustered into the `easings` table, and pass B re-plans
 *    every span under the table it will actually write (§10.4's 🚨).
 *  - a span with no interior sample takes the editor's **automatic handles**,
 *    never linear (§10.4's 🧩).
 *  - the closing loop: sample the planned curves at each committed rate, find
 *    the adjacent pairs whose change disagrees with the reference's, force
 *    those frames as keys and re-plan (§10.3's ⭐ and 🚨 — the contraction is
 *    applied to the CURVES, which is where the measurement is taken).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { piecesOf } from '../../../../src/render';
import { changedPixels, declaredViewport, framePath, loadFrame, sidecarOf } from './geom';
import { applyPose, levelsFor, loadCandidate, objectiveFor, renderPose, targetFor, type Pose } from './fitlib';
import { KNOBS, LEVEL_PLAN } from './plan';
import { automaticHandles, clusterHandles, evalHandles, fitHandles, LINEAR, spanDeviation, type Handles } from './curve';

const REF = process.env.REF ?? 'bench/reference/spineboy/ess';
const CAND = process.env.CAND ?? '/tmp/sb2/probe';
const POSES = process.env.POSES ?? 'bench/runs/2026-09-03-spineboy-2/fit/poses.json';
const SKINS = process.env.SKINS ?? '';
const EASINGS = Number(process.env.EASINGS ?? 8);
/** The declared tolerance, in FRAME PIXELS at the end of what the bone swings. */
export const TOLERANCE_PX = Number(process.env.TOLERANCE_PX ?? 0.25);
/** The cap on the per-channel basin floor, in frame pixels (§10.3's ⚖️). */
/**
 * The cap on the per-channel basin floor, in frame pixels (§10.3's ⚖️).
 *
 * 0.4 rather than a pixel or two, chosen by measurement over three values with
 * everything else held — the whole point of §10.3's "record all three numbers".
 * `check` over all 16 sets, same poses, same skins:
 *
 *   cap 1.2 / tol 0.35  1564 keys  drift > 6 px on 16 of 500 slot-frames  MAE(ref) 55.99
 *   cap 0.7 / tol 0.25  1590 keys                        14 of 494        MAE(ref) 56.04
 *   cap 0.4 / tol 0.25  1633 keys                        13 of 499        MAE(ref) 55.62
 *
 * The worst attributable drift is 18.98 px in all three, which is the reading
 * that says it is a POSE error and not a reduction one.
 */
export const BASIN_CAP_PX = Number(process.env.BASIN_CAP_PX ?? 0.4);
const ROUNDS = Number(process.env.CLOSE_ROUNDS ?? 6);
/** How far each round draws an offending pair's two samples together. */
const LAMBDA = [0.4, 0.65, 0.8, 0.9, 0.95, 0.98];
const out = process.argv[2] ?? 'bench/runs/2026-09-03-spineboy-2/spineboy-ess.motion.json';
const report = process.argv[3] ?? 'bench/runs/2026-09-03-spineboy-2/evidence/key-plan.txt';

const sidecar = sidecarOf(REF);
const view = declaredViewport(sidecar);
const c = loadCandidate(CAND);
const levels = levelsFor(view, LEVEL_PLAN);
const stored: Record<string, Record<string, { pose: Pose; score: number }>> = JSON.parse(readFileSync(POSES, 'utf8'));
const skinStore: {
  perFrame?: Record<string, Record<string, Record<string, string | null>>>;
  timeline?: Record<string, Record<string, { t: number; attachment: string | null }[]>>;
} = SKINS ? JSON.parse(readFileSync(SKINS, 'utf8')) : {};
const skins = skinStore.perFrame ?? {};
const attachmentTimeline = skinStore.timeline ?? {};

// ---------------------------------------------------------------------------
// lever arms — one tolerance in pixels becomes one tolerance per channel
// ---------------------------------------------------------------------------

/**
 * How far, in FRAME PIXELS, one degree on this bone moves the furthest thing
 * that hangs off it. Measured, not derived: pose the skeleton at setup, note
 * every drawn quad's centre, turn the bone by 1 degree and take the largest
 * displacement.
 *
 * §10.3: "a quarter of a degree on the last link moves the chain's end 0.15 px,
 * and the same quarter degree on the plate the chain hangs from moves it
 * 0.69 px. One figure in degrees applied per property therefore keys the far
 * end of the chain roughly four times too loosely while over-keying the near
 * end — it is not one tolerance at all."
 */
function leverArms(): Record<string, number> {
  /**
   * ⚠️ The DRAWN QUAD's centre, not the bone's origin. A leaf bone's own origin
   * does not move when the leaf rotates, so a bone-origin reading gives every
   * leaf — both feet, both fists, the muzzle — a zero lever arm and therefore
   * an unbounded tolerance. The art is what the frames see.
   */
  /**
   * ⚠️ Every slot is SHOWN for this measurement, including the three whose setup
   * attachment is `null`. With the flare hidden, `muzzle` moves no drawn quad
   * and its arm reads 0.0000 px/deg — which made its effective tolerance
   * 350,000 degrees and took the channel out of the plan entirely. A lever arm
   * is a property of the rig, not of the setup skin.
   */
  const showEverything = (): void => {
    for (const slot of c.skeleton.slots) {
      if (slot.pose.attachment) continue;
      const names = Object.keys((c.data.defaultSkin as unknown as { attachments?: Record<string, unknown> })?.attachments ?? {});
      void names;
      for (const candidate of ['muzzle01', 'muzzle-glow', 'muzzle-ring']) {
        const found = c.skeleton.getAttachment(slot.data.name, candidate);
        if (found) {
          slot.pose.setAttachment(found);
          break;
        }
      }
    }
  };
  const centres = (pose: Pose): Map<string, [number, number]> => {
    applyPose(c.skeleton, pose);
    showEverything();
    const out = new Map<string, [number, number]>();
    for (const piece of piecesOf(c.skeleton)) {
      const world = piece.kind === 'region' ? piece.world : piece.world;
      let sx = 0;
      let sy = 0;
      for (let i = 0; i < world.length; i += 2) {
        sx += world[i];
        sy += world[i + 1];
      }
      const n = world.length / 2;
      out.set(piece.slot, [sx / n, sy / n]);
    }
    return out;
  };
  const base = centres({});
  const arms: Record<string, number> = {};
  for (const knob of KNOBS) {
    if (knob.kind !== 'rotate') {
      arms[`${knob.bone}.${knob.kind}`] = view.scale; // one unit is one unit
      continue;
    }
    const moved = centres({ [`${knob.bone}.rotate`]: 1 });
    let worst = 0;
    for (const [name, at] of moved) {
      const was = base.get(name);
      if (!was) continue;
      worst = Math.max(worst, Math.hypot(at[0] - was[0], at[1] - was[1]));
    }
    arms[`${knob.bone}.rotate`] = Math.max(1e-6, worst * view.scale);
  }
  return arms;
}

const ARMS = leverArms();

/**
 * The basin of each channel, measured at the setup pose against one frame of
 * each shot: how far the value moves before the rendered picture does.
 *
 * §10.3: "Measure the basin before you declare the tolerance, which costs
 * nothing and needs no reference." Read as a per-channel FLOOR on the
 * tolerance, capped — the ⚖️ resolution of *declare one tolerance* against
 * *declare at or above the widest basin*.
 */
const BASIN_FRAMES = (process.env.BASIN_FRAMES ?? 'idle/f0000,walk/f0006,death/f0020,run/f0003').split(',');

function measureBasins(): Record<string, number> {
  const stores: Record<string, number[]> = {};
  for (const name of BASIN_FRAMES) {
    const [set, file] = name.split('/');
    const index = Number(file.slice(1));
    const at = stored[set]?.[String(index)];
    if (!at) continue;
    const plate = loadFrame(`${REF}/${set}/${file}.png`);
    const target = targetFor(plate, levels, null);
    const obj = objectiveFor(c, target);
    const settled = obj(at.pose, levels[levels.length - 1]);
    for (const knob of KNOBS) {
      const key = `${knob.bone}.${knob.kind}`;
      const base = at.pose[key] ?? 0;
      const step = (knob.max - knob.min) / 400;
      let reach = 0;
      for (const dir of [-1, 1]) {
        for (let n = 1; n <= 40; n++) {
          if (obj({ ...at.pose, [key]: base + dir * n * step }, levels[levels.length - 1]) > settled * 1.01) break;
          reach = Math.max(reach, n * step);
        }
      }
      (stores[key] ??= []).push(reach);
    }
  }
  const out: Record<string, number> = {};
  for (const [key, list] of Object.entries(stores)) {
    const sorted = [...list].sort((a, b) => a - b);
    out[key] = sorted[Math.floor(sorted.length / 2)];
  }
  return out;
}

const BASINS = measureBasins();

/**
 * §10.3's ⚖️ resolution, verbatim: "Declare one tolerance, in pixels at the end
 * of what each bone swings. Then floor it per channel at that channel's own
 * basin, capped." Effective tolerance = max(declared, min(basin, cap)), with
 * all three numbers recorded in the key-plan report.
 */
const channelTolerance = (key: string): number => {
  const arm = ARMS[key] ?? view.scale;
  const declared = TOLERANCE_PX / arm;
  const basin = BASINS[key];
  if (basin === undefined) return declared;
  return Math.max(declared, Math.min(basin, BASIN_CAP_PX / arm));
};

// ---------------------------------------------------------------------------
// the series, per set and channel
// ---------------------------------------------------------------------------

interface Series {
  set: string;
  animation: string;
  fps: number;
  /** Sample index -> value, dense over the frames the fit produced. */
  index: number[];
  values: Record<string, number[]>;
}

const CHANNELS = KNOBS.map((k) => `${k.bone}.${k.kind}`);

/**
 * 🚨 Where the REFERENCE holds a run of frames pixel-identical, the pose series
 * has to hold too — and a per-frame fit will not do that on its own.
 *
 * On `death` f18–f26 the reference is identical across eight consecutive pairs
 * at 8/255 (`tools/frames.ts`'s census, and the brief's own reading). The figure
 * is lying down there with most of it invisible, so this run's objective has a
 * wide flat basin and the fit wandered inside it: nine different poses for one
 * picture, which the per-frame column then read as 300 to 2,617 px of motion
 * against the reference's 0.
 *
 * ⚠️ Forcing keys does not fix this and the closing loop proved it — round 0 to
 * round 2 moved the count from 16 to 15 and stopped. §10.3 says why: "a
 * tolerance is not a hold", and forcing both ends of a pair whose two POSES
 * disagree pins the disagreement instead of removing it.
 *
 * ⇒ Collapse each run to the best-scoring pose in it, BEFORE the planner runs.
 * This is not a contraction and not a trade: two identical pictures have one
 * answer, and any two different poses for them cannot both be it. The cost is
 * recorded — the mean score rise over the collapsed frames — because the frames
 * that were not the best one do get slightly worse.
 */
const HOLD_TOLERANCE = 8;
/** Indices inside a reference-held run — see the 🚨 by `overrides`. */
const heldIndices = new Map<string, Set<number>>();
const collapses: { set: string; from: number; to: number; frames: number; kept: number; cost: number }[] = [];
for (const s of sidecar.sets) {
  const got = stored[s.dir];
  if (!got || s.fps !== 12) continue;
  const indices = Object.keys(got)
    .map(Number)
    .sort((a, b) => a - b);
  let runStart = 0;
  const flush = (endExclusive: number): void => {
    const run = indices.slice(runStart, endExclusive);
    if (run.length < 2) return;
    const best = run.reduce((a, b) => (got[String(b)].score < got[String(a)].score ? b : a));
    const before = run.reduce((acc, i) => acc + got[String(i)].score, 0) / run.length;
    for (const i of run) got[String(i)] = { ...got[String(best)] };
    const held = heldIndices.get(s.dir) ?? new Set<number>();
    for (const i of run) held.add(i);
    heldIndices.set(s.dir, held);
    collapses.push({
      set: s.dir,
      from: run[0],
      to: run[run.length - 1],
      frames: run.length,
      kept: best,
      cost: got[String(best)].score - before,
    });
  };
  for (let k = 1; k <= indices.length; k++) {
    const same =
      k < indices.length &&
      indices[k] === indices[k - 1] + 1 &&
      changedPixels(
        loadFrame(framePath(REF, s.dir, indices[k - 1])),
        loadFrame(framePath(REF, s.dir, indices[k])),
        HOLD_TOLERANCE,
      ) === 0;
    if (same) continue;
    flush(k);
    runStart = k;
  }
}

const series: Series[] = [];
for (const s of sidecar.sets) {
  const got = stored[s.dir];
  if (!got) continue;
  const index = Object.keys(got)
    .map(Number)
    .sort((a, b) => a - b);
  const values: Record<string, number[]> = {};
  for (const ch of CHANNELS) values[ch] = index.map((i) => got[String(i)].pose[ch] ?? 0);
  series.push({ set: s.dir, animation: s.animation, fps: s.fps, index, values });
}

/** The 12 fps series is the spine of an animation; a 30 fps set adds stills. */
const byAnimation = new Map<string, Series[]>();
for (const s of series) {
  const list = byAnimation.get(s.animation) ?? [];
  list.push(s);
  byAnimation.set(s.animation, list);
}

const durations: Record<string, number> = {};
for (const [animation, list] of byAnimation) {
  // The intersection of the two rates' windows, taken at the 30 fps grid value
  // — the brief's own arithmetic, recomputed here from the sidecar.
  const fine = list.find((s) => s.fps === 30) ?? list[0];
  const count = sidecar.sets.find((x) => x.dir === fine.set)?.sampled ?? 1;
  durations[animation] = (count - 1) / fine.fps;
}


// ---------------------------------------------------------------------------
// the reducer
// ---------------------------------------------------------------------------

interface PlannedKey {
  t: number;
  v: number;
  handles: Handles | null;
}

function forcedIndices(values: number[], times: number[], extra: Set<number>): Set<number> {
  const forced = new Set<number>([0, values.length - 1]);
  for (const i of extra) if (i >= 0 && i < values.length) forced.add(i);
  // turning points
  for (let i = 1; i < values.length - 1; i++) {
    const a = values[i] - values[i - 1];
    const b = values[i + 1] - values[i];
    if (a === 0 && b === 0) continue;
    if (a * b < 0) forced.add(i);
  }
  // both ends of every run of EXACTLY equal values — tested on exact equality
  // so a merely near-still span is deliberately not swept up with it (§10.3).
  let start = 0;
  for (let i = 1; i <= values.length; i++) {
    if (i < values.length && values[i] === values[i - 1]) continue;
    if (i - start >= 2) {
      forced.add(start);
      forced.add(i - 1);
    }
    start = i;
  }
  void times;
  return forced;
}

/** The smallest single-frame move inside [from, to] — §10.3's relative floor. */
function smallestMove(values: number[], from: number, to: number): number {
  let smallest = Infinity;
  for (let i = from + 1; i <= to; i++) smallest = Math.min(smallest, Math.abs(values[i] - values[i - 1]));
  return smallest === Infinity ? 0 : smallest;
}

function planChannel(
  values: number[],
  times: number[],
  tolerance: number,
  table: Handles[] | null,
  extraForced: Set<number>,
): { keys: PlannedKey[]; discovered: Handles[] } {
  const forced = forcedIndices(values, times, extraForced);
  const keys: PlannedKey[] = [];
  const discovered: Handles[] = [];
  let at = 0;
  while (at < values.length - 1) {
    let best = at + 1;
    let bestHandles: Handles = LINEAR;
    for (let to = at + 1; to < values.length; to++) {
      // A forced index inside the span closes it at that index.
      let blocked = false;
      for (let i = at + 1; i < to; i++) if (forced.has(i)) blocked = true;
      if (blocked) break;
      const cap = Math.min(tolerance, Math.max(smallestMove(values, at, to), tolerance / 8));
      let handles: Handles;
      let deviation: number;
      if (to - at === 1) {
        handles = automaticHandles(
          at > 0 ? values[at - 1] : null,
          values[at],
          values[to],
          to < values.length - 1 ? values[to + 1] : null,
        );
        deviation = 0;
      } else if (table) {
        // Pass B: only a shape the table actually holds may carry a span.
        let pick: Handles | null = null;
        let pickDeviation = Infinity;
        for (const entry of table) {
          const d = spanDeviation(values, at, to, entry);
          if (d < pickDeviation) {
            pickDeviation = d;
            pick = entry;
          }
        }
        handles = pick ?? LINEAR;
        deviation = pickDeviation;
      } else {
        const fit = fitHandles(values, at, to);
        handles = fit.handles;
        deviation = fit.deviation;
      }
      if (deviation > cap) break;
      best = to;
      bestHandles = handles;
    }
    if (!table && best - at >= 2) discovered.push(bestHandles);
    keys.push({ t: times[at], v: values[at], handles: bestHandles });
    at = best;
  }
  keys.push({ t: times[values.length - 1], v: values[values.length - 1], handles: null });
  return { keys, discovered };
}

// ---------------------------------------------------------------------------
// pass A: discover the shapes; then the table; then pass B
// ---------------------------------------------------------------------------

const extraForced = new Map<string, Set<number>>();
const forcedKey = (set: string, channel: string): string => `${set}|${channel}`;

/**
 * §10.3's CONTRACTION, and it is recorded as a trade rather than as a fit.
 *
 * "Where the reference barely moves, contract your neighbouring poses toward
 * each other until your own frame-to-frame change is inside the band —
 * accepting a small, *bounded* loss of fidelity on those frames in exchange for
 * the one measure that can see a hold. ⚠️ That is a trade and it is recorded as
 * a trade: name the frames, name the cost per frame, and say in the log that you
 * took it."
 *
 * 🚨 And it is applied WHERE THE MEASUREMENT IS TAKEN, which §10.3 says in the
 * sentence it calls worth two builds: the override is on the SAMPLED PLANNED
 * CURVE at that index, and the index is then forced as a key carrying the
 * contracted value — not on the pose series, which nothing downstream reads.
 */
const overrides = new Map<string, Map<number, number>>();
const contractions: { set: string; frames: [number, number]; lambda: number; costPx: number }[] = [];
const refusedContractions: { set: string; frames: [number, number]; why: string }[] = [];

/**
 * 🚨 A contraction may NOT touch an index inside a reference-held run, and this
 * guard is worth its own paragraph because the first version did and it cost a
 * round.
 *
 * The hold survives the reduction because the collapsed poses are EXACTLY equal
 * and `forcedIndices` keys both ends of every run of exact equality. An override
 * at one index inside such a run breaks that equality, the run detection stops
 * firing, and the planner ramps a curve straight through the hold. Measured
 * here: the closing loop went 9 -> 12 -> 13 pairs out of band, and five pairs
 * that the collapse had already read at 0 came back at 1,510-1,876 px. That is
 * §10.3's own warning arriving from an unexpected side — "if you reach for the
 * same fix you will pin the excess in place instead of removing it" — with a
 * contraction undoing a collapse rather than a forcing undoing a contraction.
 */

/**
 * Fold the 30 fps set's own terminal still into the plan, and drop any key past
 * the declared duration.
 *
 * AUTHORING §9's ⭐: "the last still is the animation's own last sample at that
 * rate, and a finer rate lands on a different instant ... that pose exists in
 * exactly one file, at full resolution, and it is worth fitting like any other
 * frame". On this corpus it bites on exactly the two shots the arithmetic
 * predicts: `death`'s 12 fps series ends at 4.9167 s and its duration is
 * 4.9333 s, so the 30 fps still is 0.0167 s of motion no 12 fps frame carries;
 * and `shoot`'s 12 fps series has a sample at 0.4167 s PAST its 0.4 s duration,
 * which R7 refuses as a key and which the runtime reaches by holding.
 */
function foldTerminal(animation: string, channel: string, keys: PlannedKey[], duration: number): PlannedKey[] {
  const fine = series.find((s) => s.animation === animation && s.fps === 30);
  const out = keys.filter((k) => k.t <= duration + 1e-9);
  // A one-frame set's only still is the same instant as the 12 fps f0, so there
  // is nothing terminal to fold; taking it would overwrite f0's own fit with a
  // second fit of the same picture.
  if (fine && fine.index.length > 0 && fine.index[fine.index.length - 1] > 0) {
    const lastIndex = fine.index[fine.index.length - 1];
    const t = lastIndex / fine.fps;
    const v = fine.values[channel][fine.index.length - 1] ?? 0;
    if (Math.abs(t - duration) < 1e-6) {
      const existing = out.find((k) => Math.abs(k.t - t) < 1e-9);
      if (existing) existing.v = v;
      else out.push({ t, v, handles: null });
    }
  }
  if (out.length === 0) out.push({ t: 0, v: keys[0]?.v ?? 0, handles: null });
  out.sort((a, b) => a.t - b.t);
  out[out.length - 1].handles = null;
  return out;
}

function planAll(table: Handles[] | null): { plans: Map<string, PlannedKey[]>; discovered: Handles[] } {
  const plans = new Map<string, PlannedKey[]>();
  const discovered: Handles[] = [];
  for (const s of series) {
    if (s.fps !== 12) continue; // the 12 fps set is the spine; the 30 fps still joins in foldTerminal
    const times = s.index.map((i) => i / s.fps);
    for (const ch of CHANNELS) {
      const extra = extraForced.get(forcedKey(s.set, ch)) ?? new Set<number>();
      const override = overrides.get(forcedKey(s.set, ch));
      const values = override ? s.values[ch].map((v, at) => override.get(s.index[at]) ?? v) : s.values[ch];
      const planned = planChannel(values, times, channelTolerance(ch), table, extra);
      plans.set(`${s.animation}|${ch}`, foldTerminal(s.animation, ch, planned.keys, durations[s.animation] ?? 0));
      discovered.push(...planned.discovered);
    }
  }
  return { plans, discovered };
}

const passA = planAll(null);
const table = clusterHandles(passA.discovered, EASINGS);
process.stderr.write(`pass A: ${passA.discovered.length} fitted span(s) -> ${table.length} easing(s)\n`);

// ---------------------------------------------------------------------------
// the closing loop
// ---------------------------------------------------------------------------

/** Sample a planned channel at an arbitrary time. */
function sampleChannel(keys: PlannedKey[], t: number): number {
  if (t <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t < a.t || t > b.t) continue;
    const u = (t - a.t) / (b.t - a.t);
    const f = a.handles ? evalHandles(a.handles, u) : u;
    return a.v + (b.v - a.v) * f;
  }
  return last.v;
}

interface Disagreement {
  set: string;
  pair: [number, number];
  mine: number;
  theirs: number;
  kind: 'held' | 'under' | 'over';
}

function changeCheck(plans: Map<string, PlannedKey[]>): Disagreement[] {
  const bad: Disagreement[] = [];
  for (const s of series) {
    if (s.index.length < 2) continue;
    const contiguous = s.index.every((v, i) => i === 0 || v === s.index[i - 1] + 1);
    if (!contiguous) continue;
    const plates: Map<number, ReturnType<typeof renderPose>> = new Map();
    for (const i of s.index) {
      const pose: Pose = {};
      for (const ch of CHANNELS) {
        const keys = plans.get(`${s.animation}|${ch}`);
        if (keys) pose[ch] = sampleChannel(keys, i / s.fps);
      }
      applyPose(c.skeleton, pose);
      const skin = skins[s.set]?.[String(i)];
      if (skin) {
        for (const [slotName, attachment] of Object.entries(skin)) {
          const slot = c.skeleton.findSlot(slotName);
          if (slot) slot.pose.setAttachment(attachment === null ? null : c.skeleton.getAttachment(slotName, attachment));
        }
      }
      plates.set(i, renderPose(c, view));
    }
    for (let k = 1; k < s.index.length; k++) {
      const i = s.index[k];
      const j = s.index[k - 1];
      const a = plates.get(j);
      const b = plates.get(i);
      if (!a || !b) continue;
      const mine = changedPixels(a, b, 8);
      const theirs = changedPixels(loadFrame(framePath(REF, s.set, j)), loadFrame(framePath(REF, s.set, i)), 8);
      // src/check.ts: exact stillness on one side, or one side moving CHANGE_RATIO
      // times the other AND at least CHANGE_EXCESS pixels more.
      if (theirs === 0 && mine !== 0) bad.push({ set: s.set, pair: [j, i], mine, theirs, kind: 'held' });
      else if (mine === 0 && theirs !== 0) bad.push({ set: s.set, pair: [j, i], mine, theirs, kind: 'under' });
      else if (theirs > 4 * mine && theirs - mine >= 24) bad.push({ set: s.set, pair: [j, i], mine, theirs, kind: 'under' });
      else if (mine > 4 * theirs && mine - theirs >= 24) bad.push({ set: s.set, pair: [j, i], mine, theirs, kind: 'over' });
    }
  }
  return bad;
}

let plans = planAll(table).plans;
const log: string[] = [];
for (let round = 0; round < ROUNDS; round++) {
  const bad = changeCheck(plans);
  log.push(`close round ${round}: ${bad.length} pair(s) out of band`);
  for (const d of bad.slice(0, 12)) {
    log.push(`  ${d.set} f${d.pair[0]}->f${d.pair[1]}  mine ${d.mine} vs ref ${d.theirs}  (${d.kind})`);
  }
  process.stderr.write(`${log[log.length - Math.min(log.length, bad.slice(0, 12).length + 1)]}\n`);
  if (bad.length === 0) break;
  const lambda = LAMBDA[Math.min(LAMBDA.length - 1, round)];
  for (const d of bad) {
    const s = series.find((x) => x.set === d.set);
    if (!s) continue;
    const [i, j] = d.pair;
    const held = heldIndices.get(d.set);
    if (held && (held.has(i) || held.has(j))) {
      refusedContractions.push({
        set: d.set,
        frames: [i, j],
        why: 'one end is inside a reference-held run; contracting it would break the exact equality the hold rests on',
      });
      continue;
    }
    let costPx = 0;
    for (const ch of CHANNELS) {
      const key = forcedKey(d.set, ch);
      const at = extraForced.get(key) ?? new Set<number>();
      at.add(s.index.indexOf(i));
      at.add(s.index.indexOf(j));
      extraForced.set(key, at);
      const keys = plans.get(`${s.animation}|${ch}`);
      if (!keys) continue;
      const vi = sampleChannel(keys, i / s.fps);
      const vj = sampleChannel(keys, j / s.fps);
      // 'held' and 'over' both want the pair drawn together; 'under' wants the
      // opposite and is NOT contracted — §10.3's third direction says under-change
      // "is not fixed by keys" and a contraction there would pin the deficit.
      if (d.kind === 'under') continue;
      const mean = (vi + vj) / 2;
      const store = overrides.get(key) ?? new Map<number, number>();
      const ni = d.kind === 'held' ? mean : mean + (vi - mean) * (1 - lambda);
      const nj = d.kind === 'held' ? mean : mean + (vj - mean) * (1 - lambda);
      store.set(i, ni);
      store.set(j, nj);
      overrides.set(key, store);
      const arm = ARMS[ch] ?? view.scale;
      costPx = Math.max(costPx, Math.abs(ni - vi) * arm, Math.abs(nj - vj) * arm);
    }
    if (d.kind !== 'under') contractions.push({ set: d.set, frames: [i, j], lambda, costPx });
  }
  plans = planAll(table).plans;
}

// ---------------------------------------------------------------------------
// emit
// ---------------------------------------------------------------------------

const easingNames = table.map((_, i) => `e${i}`);
const nameOf = (h: Handles): string => {
  let bestAt = 0;
  let bestD = Infinity;
  for (let i = 0; i < table.length; i++) {
    const d = table[i].reduce((acc, v, j) => acc + (v - h[j]) ** 2, 0);
    if (d < bestD) {
      bestD = d;
      bestAt = i;
    }
  }
  return easingNames[bestAt];
};

interface Track {
  bone?: string;
  slot?: string;
  property: string;
  keys: ({ t: number; v: number[]; ease?: string } | { t: number; v: string | null })[];
}

/**
 * `loop` is a PLAYER HINT ONLY — §4.3: "skeleton JSON has no loop field, so this
 * is not emitted and no assertion or diff measure reads it". It is written
 * because it is true of the shot, from the brief's own returns column: the four
 * `ess` shots whose first and last 12 fps frames differ by 0 to 104 px at 2/255
 * against 2,595 and up for everything else, a factor of 8.6 across the break.
 */
const LOOPS = new Set(['idle', 'walk', 'run', 'shoot']);

const animations: Record<string, { duration: number; loop: boolean; tracks: Track[]; note?: string }> = {};
let keyCount = 0;
for (const [animation] of byAnimation) {
  const tracks: Track[] = [];
  const paired = new Map<string, { tx?: PlannedKey[]; ty?: PlannedKey[] }>();
  for (const knob of KNOBS) {
    const ch = `${knob.bone}.${knob.kind}`;
    const keys = plans.get(`${animation}|${ch}`);
    if (!keys) continue;
    if (knob.kind === 'tx' || knob.kind === 'ty') {
      const at = paired.get(knob.bone) ?? {};
      at[knob.kind] = keys;
      paired.set(knob.bone, at);
      continue;
    }
    // A channel that never leaves its setup value gets no timeline at all —
    // §10.3's Clean Up: "keying the same values as the setup pose".
    if (keys.every((k) => Math.abs(k.v) < 1e-9)) continue;
    tracks.push({
      bone: knob.bone,
      property: 'rotate',
      keys: keys.map((k, i) => ({
        t: Number(k.t.toFixed(6)),
        v: [Number(k.v.toFixed(3))],
        ...(i === keys.length - 1 || !k.handles ? {} : { ease: nameOf(k.handles) }),
      })),
    });
    keyCount += keys.length;
  }
  // §10.3, 📗: "By default, each translate, scale, and shear key for a bone
  // sets both X and Y" — so the trunk's translation is one paired timeline, on
  // the union of the two channels' key times.
  for (const [bone, pair] of paired) {
    if (!pair.tx || !pair.ty) continue;
    const flat = pair.tx.every((k) => Math.abs(k.v) < 1e-9) && pair.ty.every((k) => Math.abs(k.v) < 1e-9);
    if (flat) continue;
    const times = [...new Set([...pair.tx.map((k) => k.t), ...pair.ty.map((k) => k.t)])].sort((a, b) => a - b);
    tracks.push({
      bone,
      property: 'translate',
      keys: times.map((t, i) => {
        const kx = pair.tx?.find((k) => k.t === t);
        const handles = kx?.handles ?? pair.ty?.find((k) => k.t === t)?.handles ?? null;
        return {
          t: Number(t.toFixed(6)),
          v: [
            Number(sampleChannel(pair.tx as PlannedKey[], t).toFixed(3)),
            Number(sampleChannel(pair.ty as PlannedKey[], t).toFixed(3)),
          ],
          ...(i === times.length - 1 || !handles ? {} : { ease: nameOf(handles) }),
        };
      }),
    });
    keyCount += times.length;
  }
  /**
   * The stepped attachment timelines, from `tools/skins.ts`.
   *
   * §4.5's 🚨, applied: "For a stepped timeline, write T − 1e-6 rather than T.
   * One grid step early cannot reach the previous sample — 83,333 µs away at
   * 12 fps — and is always seen by the sample it was written for; one ULP late
   * loses the frame." A key at t = 0 stays at 0: there is no earlier sample for
   * it to fall into.
   *
   * §4.4: "An `attachment` key carries no easing — attachment timelines are
   * inherently stepped", which is why no `ease` is written here.
   */
  const STEP_EARLY = 1e-6;
  for (const [slot, keys] of Object.entries(attachmentTimeline[animation] ?? {})) {
    const emitted = keys
      .map((k) => ({ t: k.t <= 0 ? 0 : Math.max(0, k.t - STEP_EARLY), attachment: k.attachment }))
      .filter((k) => k.t <= durations[animation] + 1e-9);
    if (emitted.length === 0) continue;
    tracks.push({
      slot,
      property: 'attachment',
      // The key value for a `slot`/`attachment` track is `v`, a STRING or null
      // — §4.4's table — not an array and not a field of its own.
      keys: emitted.map((k) => ({ t: Number(k.t.toFixed(6)), v: k.attachment })),
    } as unknown as Track);
    keyCount += emitted.length;
  }
  animations[animation] = { duration: Number(durations[animation].toFixed(6)), loop: LOOPS.has(animation), tracks };
}

const motion = {
  spec: 'rigc-motion/1',
  archetype: 'spineboy-ess',
  cut: 'spineboy-ess',
  easings: Object.fromEntries(table.map((h, i) => [easingNames[i], h])),
  animations,
};

writeFileSync(out, `${JSON.stringify(motion, null, 2)}\n`);
const lines = [
  `declared tolerance      ${TOLERANCE_PX} frame px at the end of what each bone swings`,
  `basin cap               ${BASIN_CAP_PX} frame px`,
  `easings                 ${table.length} (clustered from ${passA.discovered.length} fitted span(s))`,
  `keys                    ${keyCount}`,
  '',
  'lever arms (frame px per degree, measured at the setup pose):',
  ...KNOBS.map((k) => {
    const key = `${k.bone}.${k.kind}`;
    const arm = ARMS[key];
    const declared = TOLERANCE_PX / arm;
    const basin = BASINS[key];
    return (
      `  ${key.padEnd(24)} arm ${arm.toFixed(4)} px/unit  declared ${declared.toFixed(3)}  ` +
      `basin ${basin === undefined ? 'n/a' : basin.toFixed(3)}  cap ${(BASIN_CAP_PX / arm).toFixed(3)}  ` +
      `-> effective ${channelTolerance(key).toFixed(3)}`
    );
  }),
  '',
  'contractions REFUSED (the guard above):',
  ...(refusedContractions.length === 0
    ? ['  none']
    : [...new Map(refusedContractions.map((x) => [`${x.set}|${x.frames[0]}`, x])).values()].map(
        (x) => `  ${x.set} f${x.frames[0]}->f${x.frames[1]}  ${x.why}`,
      )),
  '',
  'contractions taken (§10.3\'s trade, applied to the planned curves):',
  ...(contractions.length === 0
    ? ['  none']
    : contractions.map(
        (x) =>
          `  ${x.set} f${x.frames[0]}->f${x.frames[1]}  lambda ${x.lambda}  ` +
          `worst channel moved ${x.costPx.toFixed(3)} frame px at the end of what its bone swings`,
      )),
  '',
  'reference-identical runs collapsed to one pose (see the 🚨 in tools/keys.ts):',
  ...(collapses.length === 0
    ? ['  none']
    : collapses.map(
        (x) =>
          `  ${x.set}/f${x.from}..f${x.to}  ${x.frames} frame(s) -> the pose of f${x.kept}  ` +
          `cost ${x.cost >= 0 ? '+' : ''}${x.cost.toFixed(4)} mean on this run's own objective`,
      )),
  '',
  ...log,
];
writeFileSync(report, `${lines.join('\n')}\n`);
process.stderr.write(`wrote ${out} (${keyCount} keys, ${table.length} easings)\nwrote ${report}\n`);
