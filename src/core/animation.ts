/**
 * Construct 4 of the core (issue #936, step 2d of issue #380): an animation's
 * bone and slot timelines at a sample time — the key search, the curve as the
 * runtime evaluates it, and every bone and slot timeline kind — posed on the
 * setup pose with the animation alone at full weight, the way the oracle
 * samples one (`tools/pose_oracle.ts`, *How a pose is posed*: the setup pose,
 * then the animation applied at `t` with alpha 1 from the setup pose, then the
 * world transforms).
 *
 * Every rule below was measured by posing a hand-written skeleton through
 * `tools/pose_oracle.ts dump` (spine-core 4.3.13) and reading the rows it
 * printed; nothing here was written from the runtime's source. The core
 * suite's `CA` controls hold the same skeletons against the core at tolerance
 * 0, and `tools/core_gate.ts` holds every recipe of the tree's corpus.
 *
 * ## The key search
 *
 * A timeline's value at `t` comes from the LAST key whose time is at or
 * before `t`. Measured on a `translatex` keyed at 0.5, 1 and 1.5 on a bone at
 * setup `x` 5, sampled on a grid of quarter seconds over 2 s:
 *
 * - **Before the first key the channel is at its setup value** — `x` read 5
 *   at 0 and 0.25. ⚠️ Not "untouched": the timeline POSES the setup value. A
 *   bone keyed by `translate` (0 → 10, 2 → 20) and by a `translatex` whose
 *   first key is at 1 read `x` = setup (1, not 11) before 1 when `translatex`
 *   is listed after `translate`, and 11 when it is listed before — each
 *   timeline, in the animation's order, writes its channels at every time.
 * - **On a key exactly, that key** — a stepped key at 0.5 (value 10) followed
 *   by a key at 1 (value 30) read 30 at t = 1, not 10.
 * - **At and after the last key, the last key's value** — 45 (setup 5 + 40)
 *   at 1.5, 1.75 and 2.
 * - Key times are compared as the runtime stores them, float32
 *   (`Math.fround`), against the sample time as a double; key values are read
 *   as float32 too. A linear segment from (0, 0) to (0.4666667, 100000)
 *   sampled at `off` read 12500, 37500, 62500, 87500 exactly — the key time
 *   and the duration both the float32 0.46666669845581055; the double
 *   0.4666667 would have read 4.1e-5 to 2.9e-4 higher.
 *
 * ## The three curves, per segment
 *
 * A key's `curve` shapes the segment from it to the next key.
 *
 * - **None — linear**: `v0 + (t − t0) / (t1 − t0) · (v1 − v0)`, per channel.
 * - **`stepped`**: the key's own value until the next key's time.
 * - **Bézier** — four absolute numbers per channel, `cx1, cy1, cx2, cy2`, the
 *   two handles of the cubic from `(t0, v0)` to `(t1, v1)` (the format's
 *   documentation: a curve's control points are in the timeline's own time and
 *   value). ⭐ **The runtime does not evaluate the cubic.** Posed on one bone,
 *   one `translatex` from (0, 0) to (1, 1000) with handles (0.1, 800) and
 *   (0.3, 1000), 2,000 `dense` samples read BELOW the exact cubic solved for
 *   `t` at every interior sample, by up to 10.34 — the residual of chords
 *   under a concave curve — and the slopes between consecutive samples fall
 *   into exactly ten runs whose nine intersections are the cubic's points at
 *   the parameter `u = 0.1, 0.2, …, 0.9` (to the fourth decimal of `t`). So
 *   the curve is the POLYLINE through the key, the cubic's nine points at
 *   tenths of its parameter, and the next key, and a sample is interpolated
 *   linearly on the piece whose end is the first point at or after `t`.
 *
 *   **The nine points, to the last float32 step.** They are stored float32,
 *   and which float32 each lands on was fixed by two measurements, both with
 *   the samples of spine-core's dump as the judge at the oracle's rounding:
 *
 *   1. *The recurrence.* Over 60 random segments whose every number was
 *      already a float32 (82,731 samples), the cubic's tenths evaluated
 *      directly missed 866 samples: each miss a point one float32 step off,
 *      where the exact double lay within a few hundredths of a step of a
 *      rounding midpoint — so the runtime's points carry a relative error
 *      near 1e-9 before the rounding. Forward differencing the cubic at the
 *      step h = 1/10 (the textbook recurrence: each point the previous plus a
 *      first difference, which grows by a second, which grows by a third)
 *      reproduces that error exactly when the third difference's one-sixth
 *      is the eight-digit decimal `0.16666667`: 0 misses. With 1/6 exact it
 *      missed 867, with 1/6 as a float32 1,694; a recurrence whose running
 *      sums are float32 missed more than any.
 *   2. *The numbers it runs on.* Over 300 of the 8,145 Bézier channel
 *      segments in the 19 recipes' bone timelines, each re-posed alone
 *      (18,430 samples), the recurrence above missed 4,145 samples when run
 *      on the key times, values and handles as float32 — and 0 when run on
 *      the numbers AS THE FILE STATES THEM (the doubles its text parses to),
 *      with only the polyline's two ends, the keys themselves, float32. The
 *      mixed readings missed 2,479 (handles stated, keys float32), 2,587
 *      (keys stated, handles float32) and 1,054 (the ends stated too). The
 *      first population could not tell these apart because its numbers were
 *      float32 to begin with; the model's numbers are float32 SHORTEST NAMES
 *      (`f32` in `src/compile.ts`), whose doubles are not the float32 itself.
 *
 *   So a key keeps both (`CoreKey.stated` and its float32 `time`/`values`),
 *   and `bezierPolyline` is the recurrence over the stated numbers. The core
 *   suite's `CA02` holds the measurement and every rejected reading missing.
 *
 * ## The bone timelines — alpha 1 from the setup pose
 *
 * Measured on bones with non-trivial setup values:
 *
 * - `rotate` ADDS to the setup rotation: setup 20, keys 350 → 10 read a world
 *   x axis at 10° at t = 0 and at 200° (−160°) half way — the value is
 *   interpolated as a number, 350 → 10 passing 180, and never wrapped to the
 *   short way round.
 * - `translate`, `translatex`, `translatey` ADD to the setup position.
 * - `scale`, `scalex`, `scaley` MULTIPLY the setup scale: setup (2, 0.5) and a
 *   key (3, 1) read (6, 0.5); a negative key or setup multiplies through
 *   (setup −2, keys −1 → 3 read 2 → −6 through 0).
 * - `shear`, `shearx`, `sheary` ADD to the setup shear.
 * - `inherit` sets the bone's inherit mode, stepped by the format: before its
 *   first key the setup mode, from each key that key's mode (measured
 *   `normal → onlyTranslation → normal` under a rotated, scaled parent).
 *
 * The posed values replace the setup values in a copy of the bone and the
 * core's own evaluator (`worldTransforms`, `./world.ts`) poses the copies.
 *
 * ## The slot timelines
 *
 * - `attachment`: stepped by nature; before its first key the setup
 *   attachment, from a key its placeholder, resolved exactly as the setup
 *   placeholder is (`shownAttachment`), a placeholder no skin fills and a
 *   `null` name both showing nothing.
 * - `rgba`, `rgb`, `alpha`, `rgba2`, `rgb2` SET the channels they name (they do
 *   not add to or scale the setup colour) and leave every other channel at
 *   setup: `rgb` keeps the setup alpha, `alpha` the setup rgb; `rgba2` and
 *   `rgb2` set the dark colour too. A key's hex pair reads as its byte over 255
 *   and is stored float32, as every key value is.
 * - **Every colour channel is clamped to [0, 1] after the curve**: an `rgba`
 *   whose green curve dips below 0 and whose red curve rises above 1 read 0
 *   and 1 there.
 * - 🚫 **`rgba2` or `rgb2` on a slot with no dark colour is refused.** Posed
 *   through the runtime, such a timeline throws while the animation is
 *   applied (`TypeError`), so no dump exists to hold a core to; the compiler
 *   refuses the same timeline before any file is written (`compileTrack`).
 *
 * ## The duration and the sample times
 *
 * The oracle's sample times are the tool's formula (`sampleTime`, which the
 * tool calls here, as it rounds with `gridRound`), over the runtime's
 * duration of the animation: the LAST key time of every timeline in it — the
 * later constructs' (constraints, deform, sequence, draw order, events)
 * included — as float32, not the model's declared `duration`. Measured: a
 * rotate ending at 1 beside an event at 2.5, the model stating 0, sampled over
 * 2.5 in spine-core's dump (`CA09`); over the 54 animations of the 19 recipes,
 * every duration agreed.
 *
 * ## What is left out, by name
 *
 * The oracle's sample carries `drawOrder`, `attachments`, `clips` and
 * `events` too: those are constructs not yet admitted, and the core leaves
 * each out naming it. A document that declares a constraint has no animation
 * bones from the core, for the reason its setup bones are absent; a slider
 * whose animation keys a slot, or a placeholder skins fill differently, leaves
 * the animation slots out as they leave the setup slots out. A deform,
 * sequence, draw-order or event timeline poses no bone and no slot row, so an
 * animation carrying one is still posed here.
 */
import type { ModelBone, ModelSlot } from '../model.ts';
import { worldTransforms } from './world.ts';
import {
  activeBones,
  CoreInputError,
  foldInheritMode,
  gridRound,
  readBlend,
  readColour,
  shownAttachment,
  shownRow,
  type CompiledDocument,
  type CoreAnimation,
  type CoreBoneRow,
  type CorePlant,
  type CoreSlotRow,
} from './index.ts';

/** The bone timelines that key numbers, and the channels each key carries, in the order a curve indexes them. */
export const BONE_TIMELINE_CHANNELS = {
  rotate: ['value'],
  translate: ['x', 'y'],
  translatex: ['value'],
  translatey: ['value'],
  scale: ['x', 'y'],
  scalex: ['value'],
  scaley: ['value'],
  shear: ['x', 'y'],
  shearx: ['value'],
  sheary: ['value'],
} as const satisfies Record<string, readonly string[]>;
export type BoneNumberKind = keyof typeof BONE_TIMELINE_CHANNELS;

/** Every bone timeline this construct poses: the ten that key numbers, and `inherit`. */
export const BONE_TIMELINE_KINDS = [...(Object.keys(BONE_TIMELINE_CHANNELS) as BoneNumberKind[]), 'inherit'] as const;
export type BoneTimelineKind = (typeof BONE_TIMELINE_KINDS)[number];

/**
 * The slot timelines that key a colour: the key fields the writer spells each
 * with (`COLOUR_KEYS` in `src/compile.ts`), each field's hex length, and the
 * channels they carry, in the order a curve indexes them.
 */
export const SLOT_COLOUR_TIMELINES = {
  rgba: { fields: [['color', 8]], channels: ['r', 'g', 'b', 'a'] },
  rgb: { fields: [['color', 6]], channels: ['r', 'g', 'b'] },
  alpha: { fields: [], channels: ['a'] },
  rgba2: { fields: [['light', 8], ['dark', 6]], channels: ['r', 'g', 'b', 'a', 'r2', 'g2', 'b2'] },
  rgb2: { fields: [['light', 6], ['dark', 6]], channels: ['r', 'g', 'b', 'r2', 'g2', 'b2'] },
} as const satisfies Record<string, { fields: ReadonlyArray<readonly [string, number]>; channels: readonly string[] }>;
export type SlotColourKind = keyof typeof SLOT_COLOUR_TIMELINES;

/** Every slot timeline this construct poses. */
export const SLOT_TIMELINE_KINDS = ['attachment', ...(Object.keys(SLOT_COLOUR_TIMELINES) as SlotColourKind[])] as const;
export type SlotTimelineKind = (typeof SLOT_TIMELINE_KINDS)[number];

/** The groups of an animation this construct does not pose, in the document's order. */
export const LATER_GROUPS = ['constraints', 'attachments', 'drawOrder', 'events'] as const;

/** A key's curve as read: linear, a hold, or four float32 numbers per channel. */
export type CoreCurve = 'linear' | 'stepped' | number[];

/**
 * One key, as read: its time and channels as the runtime stores them
 * (float32), the same two as the document states them (the doubles the file's
 * text parses to — what a Bézier's polyline is computed from, the header's
 * measurement), its curve, and a name or mode where the kind keys one.
 */
export interface CoreKey {
  time: number;
  values: number[];
  stated: { time: number; values: number[] };
  curve: CoreCurve;
  /** An attachment key's placeholder (`null` shows nothing). */
  name?: string | null;
  /** An inherit key's mode, folded. */
  mode?: string;
}

export interface CoreTimeline<K extends string> {
  kind: K;
  keys: CoreKey[];
}

export interface CoreTarget<K extends string> {
  name: string;
  timelines: Array<CoreTimeline<K>>;
}

/**
 * One animation's timelines, as far as this construct reads them: the bone
 * and slot timelines in full, and of every later group only how many
 * timelines it holds and its key times (which set the runtime's duration).
 */
export interface CoreAnimationTimelines {
  /** The model's declared duration. */
  declared: number;
  /** The runtime's duration: the last key time of every timeline, as float32 — the header's rule. */
  duration: number;
  bones: Array<CoreTarget<BoneTimelineKind>>;
  slots: Array<CoreTarget<SlotTimelineKind>>;
  /** Timelines per later group, in `LATER_GROUPS` order; a group holding none is not listed. */
  later: Array<[(typeof LATER_GROUPS)[number], number]>;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isHex = (v: unknown, digits: number): v is string => typeof v === 'string' && v.length === digits && /^[0-9a-fA-F]+$/.test(v);

/** A key's time: finite, not negative, float32 as the runtime stores it — or a problem. */
function keyTime(raw: Record<string, unknown>, where: string, problems: string[]): number | null {
  const time = raw.time;
  if (typeof time !== 'number' || !Number.isFinite(time) || time < 0) {
    problems.push(`${where}: time is ${JSON.stringify(time)}, not a finite time at or after 0`);
    return null;
  }
  return time;
}

/** A list of keys, each an object with a strictly later time than the one before — the writer's rule. */
function keyList(value: unknown, where: string, problems: string[]): Array<{ raw: Record<string, unknown>; at: string; time: number }> {
  if (!Array.isArray(value) || value.length === 0) {
    problems.push(`${where}: keys is not a non-empty list`);
    return [];
  }
  const out: Array<{ raw: Record<string, unknown>; at: string; time: number }> = [];
  let last = -Infinity;
  value.forEach((raw, i) => {
    const at = `${where}.keys[${i}]`;
    if (!isRecord(raw)) {
      problems.push(`${at} is not an object`);
      return;
    }
    const time = keyTime(raw, at, problems);
    if (time === null) return;
    if (time <= last) problems.push(`${at}: time ${raw.time} is not after the key before it — the writer refuses key times that do not strictly increase`);
    last = Math.max(last, time);
    out.push({ raw, at, time });
  });
  return out;
}

function unknownKeyFields(raw: Record<string, unknown>, known: readonly string[], at: string, problems: string[]): void {
  for (const key of Object.keys(raw)) if (!known.includes(key)) problems.push(`${at}: field "${key}" is not one this timeline's keys carry; they carry [${known.join(', ')}]`);
}

/** A key's curve: absent (linear), `stepped`, or 4 finite numbers per channel; never on the last key. */
function readCurve(raw: Record<string, unknown>, channels: number, last: boolean, at: string, problems: string[]): CoreCurve {
  const curve = raw.curve;
  if (curve === undefined) return 'linear';
  if (last) {
    problems.push(`${at}: the last key carries a curve, which eases to no key — the writer refuses it`);
    return 'linear';
  }
  if (curve === 'stepped') return 'stepped';
  if (!Array.isArray(curve) || curve.length !== channels * 4 || !curve.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    problems.push(`${at}: curve is ${JSON.stringify(curve)}, not "stepped" nor ${channels * 4} finite numbers (four per channel)`);
    return 'linear';
  }
  return curve as number[];
}

function readBoneTimeline(kind: BoneTimelineKind, keysValue: unknown, where: string, problems: string[]): CoreKey[] {
  const listed = keyList(keysValue, where, problems);
  return listed.map(({ raw, at, time }, i): CoreKey => {
    if (kind === 'inherit') {
      unknownKeyFields(raw, ['time', 'inherit'], at, problems);
      const mode = typeof raw.inherit === 'string' ? foldInheritMode(raw.inherit) : null;
      if (mode === null) problems.push(`${at}: inherit is ${JSON.stringify(raw.inherit)}, which folds to no inherit mode`);
      return { time: Math.fround(time), values: [], stated: { time, values: [] }, curve: 'stepped', mode: mode ?? 'normal' };
    }
    const channels: readonly string[] = BONE_TIMELINE_CHANNELS[kind];
    unknownKeyFields(raw, ['time', ...channels, 'curve'], at, problems);
    const values = channels.map((c) => {
      const v = raw[c];
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        problems.push(`${at}: ${c} is ${JSON.stringify(v)}, not a finite number — the writer states every channel on every key`);
        return 0;
      }
      return v;
    });
    return { time: Math.fround(time), values: values.map(Math.fround), stated: { time, values }, curve: readCurve(raw, channels.length, i === listed.length - 1, at, problems) };
  });
}

/** A hex spelling's channels, each byte over 255 (the stated values; the runtime stores each float32). */
function hexChannels(hex: string, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(Number.parseInt(hex.slice(2 * i, 2 * i + 2), 16) / 255);
  return out;
}

function readSlotTimeline(kind: SlotTimelineKind, keysValue: unknown, where: string, problems: string[]): CoreKey[] {
  const listed = keyList(keysValue, where, problems);
  return listed.map(({ raw, at, time }, i): CoreKey => {
    if (kind === 'attachment') {
      unknownKeyFields(raw, ['time', 'name'], at, problems);
      if (raw.name !== null && (typeof raw.name !== 'string' || raw.name === '')) problems.push(`${at}: name is ${JSON.stringify(raw.name)}, not a placeholder name or null`);
      return { time: Math.fround(time), values: [], stated: { time, values: [] }, curve: 'stepped', name: typeof raw.name === 'string' ? raw.name : null };
    }
    const shape: { fields: ReadonlyArray<readonly [string, number]>; channels: readonly string[] } = SLOT_COLOUR_TIMELINES[kind];
    let values: number[] = [];
    if (kind === 'alpha') {
      unknownKeyFields(raw, ['time', 'value', 'curve'], at, problems);
      const v = raw.value;
      if (typeof v !== 'number' || !Number.isFinite(v)) problems.push(`${at}: value is ${JSON.stringify(v)}, not a finite number`);
      else values = [v];
    } else {
      unknownKeyFields(raw, ['time', ...shape.fields.map(([f]) => f), 'curve'], at, problems);
      for (const [field, digits] of shape.fields) {
        const v = raw[field];
        if (!isHex(v, digits)) problems.push(`${at}: ${field} is ${JSON.stringify(v)}, not ${digits} hex digits — the one spelling the writer gives a ${kind} key's ${field}`);
        else values.push(...hexChannels(v, field === 'dark' || digits === 6 ? 3 : 4));
      }
    }
    if (values.length !== shape.channels.length) values = shape.channels.map(() => 0);
    return { time: Math.fround(time), values: values.map(Math.fround), stated: { time, values }, curve: readCurve(raw, shape.channels.length, i === listed.length - 1, at, problems) };
  });
}

/** Every key time under a later group's value, for the runtime's duration; a time that is not a finite number is a problem. */
function laterKeyTimes(group: (typeof LATER_GROUPS)[number], value: unknown, where: string, problems: string[]): { timelines: number; times: number[] } {
  const times: number[] = [];
  let timelines = 0;
  const keys = (list: unknown, at: string): void => {
    timelines++;
    if (!Array.isArray(list)) {
      problems.push(`${at} is not a list of keys`);
      return;
    }
    list.forEach((k, i) => {
      if (!isRecord(k)) problems.push(`${at}[${i}] is not an object`);
      else {
        const t = keyTime(k, `${at}[${i}]`, problems);
        if (t !== null) times.push(Math.fround(t));
      }
    });
  };
  const named = (list: unknown, at: string, each: (entry: Record<string, unknown>, at: string) => void): void => {
    if (!Array.isArray(list)) {
      problems.push(`${at} is not a list`);
      return;
    }
    list.forEach((entry, i) => (isRecord(entry) ? each(entry, `${at}[${i}]`) : problems.push(`${at}[${i}] is not an object`)));
  };
  if (group === 'drawOrder' || group === 'events') {
    if (!Array.isArray(value)) problems.push(`${where} is not a list`);
    else if (value.length > 0) keys(value, where);
  } else if (group === 'constraints') {
    if (!isRecord(value)) problems.push(`${where} is not an object`);
    else {
      for (const kind of ['ik', 'transform'] as const) named(value[kind], `${where}.${kind}`, (e, at) => keys(e.keys, `${at}.keys`));
      for (const kind of ['path', 'physics', 'slider'] as const) named(value[kind], `${where}.${kind}`, (e, at) => named(e.timelines, `${at}.timelines`, (tl, at2) => keys(tl.keys, `${at2}.keys`)));
    }
  } else {
    named(value, where, (skin, at) =>
      named(skin.slots, `${at}.slots`, (slot, at2) =>
        named(slot.attachments, `${at2}.attachments`, (att, at3) => {
          for (const k of ['deform', 'sequence'] as const) if (att[k] !== undefined) keys(att[k], `${at3}.${k}`);
        }),
      ),
    );
  }
  return { timelines, times };
}

/**
 * One animation record's timelines, read and checked: every bone and slot
 * timeline in full — a target that is not a bone or slot of the document, a
 * kind that is not one of this construct's, a kind keyed twice on one target,
 * a key missing a channel or spelling one otherwise than the writer does, a
 * curve of the wrong length or on the last key, times that do not increase,
 * and `rgba2`/`rgb2` on a slot with no dark colour are each a problem, named —
 * and of the later groups only their key times.
 */
export function readAnimationTimelines(raw: Record<string, unknown>, label: string, bones: ReadonlySet<string>, slots: readonly ModelSlot[], problems: string[]): CoreAnimationTimelines {
  const declared = typeof raw.duration === 'number' && Number.isFinite(raw.duration) ? raw.duration : 0;
  if (typeof raw.duration !== 'number' || !Number.isFinite(raw.duration)) problems.push(`${label}: duration is ${JSON.stringify(raw.duration)}, not a finite number`);
  const slotByName = new Map(slots.map((s) => [s.name, s]));
  const times: number[] = [];
  const targets = <K extends string>(group: 'bones' | 'slots', kinds: readonly K[], known: (name: string) => string | null, read: (kind: K, keys: unknown, at: string, target: string) => CoreKey[]): Array<CoreTarget<K>> => {
    const value = raw[group];
    const out: Array<CoreTarget<K>> = [];
    if (!Array.isArray(value)) {
      problems.push(`${label}: ${group} is not a list`);
      return out;
    }
    value.forEach((entry, i) => {
      const at = `${label}.${group}[${i}]`;
      if (!isRecord(entry) || typeof entry.name !== 'string') {
        problems.push(`${at} names no target`);
        return;
      }
      const where = `${at} "${entry.name}"`;
      const miss = known(entry.name);
      if (miss !== null) problems.push(`${where}: ${miss}`);
      if (!Array.isArray(entry.timelines)) {
        problems.push(`${where}: timelines is not a list`);
        return;
      }
      const name = entry.name;
      const target: CoreTarget<K> = { name, timelines: [] };
      entry.timelines.forEach((tl, j) => {
        const tat = `${where}.timelines[${j}]`;
        if (!isRecord(tl) || typeof tl.name !== 'string') {
          problems.push(`${tat} names no timeline`);
          return;
        }
        const kind = kinds.find((k) => k === tl.name);
        if (kind === undefined) {
          problems.push(`${tat}: "${tl.name}" is not a ${group === 'bones' ? 'bone' : 'slot'} timeline this core reads; it reads [${kinds.join(', ')}]`);
          return;
        }
        if (target.timelines.some((x) => x.kind === kind)) problems.push(`${tat}: "${kind}" is keyed twice on ${name} — the writer merges one property's tracks into one`);
        const keys = read(kind, tl.keys, `${tat} "${kind}"`, name);
        for (const k of keys) times.push(k.time);
        target.timelines.push({ kind, keys });
      });
      out.push(target);
    });
    return out;
  };
  const boneTargets = targets('bones', BONE_TIMELINE_KINDS, (n) => (bones.has(n) ? null : `"${n}" is not a bone of this document`), (kind, keys, at) => readBoneTimeline(kind, keys, at, problems));
  const slotTargets = targets('slots', SLOT_TIMELINE_KINDS, (n) => (slotByName.has(n) ? null : `"${n}" is not a slot of this document`), (kind, keys, at, slot) => {
    if ((kind === 'rgba2' || kind === 'rgb2') && slotByName.get(slot)?.dark === undefined) {
      problems.push(`${at}: slot "${slot}" states no dark colour, and a ${kind} timeline on such a slot makes the runtime throw while it is applied — the writer refuses it`);
    }
    return readSlotTimeline(kind, keys, at, problems);
  });
  const later: CoreAnimationTimelines['later'] = [];
  for (const group of LATER_GROUPS) {
    const found = laterKeyTimes(group, raw[group], `${label}.${group}`, problems);
    times.push(...found.times);
    if (found.timelines > 0) later.push([group, found.timelines]);
  }
  return { declared, duration: times.length === 0 ? 0 : Math.max(...times), bones: boneTargets, slots: slotTargets, later };
}

// ---------------------------------------------------------------------------
// evaluation
// ---------------------------------------------------------------------------

/**
 * The one-sixth of the third forward difference, as the header measured it:
 * the eight-digit decimal, which alone of the spellings tried reproduced
 * 82,731 samples of 60 random Bézier segments and 18,430 of 300 corpus
 * segments at the oracle's rounding.
 */
export const BEZIER_SIXTH = 0.16666667;
/** Pieces of the runtime's polyline per Bézier segment — the header's ten slope runs. */
export const BEZIER_PIECES = 10;

/**
 * The nine interior points of one channel's Bézier segment, `[t1, v1, …, t9,
 * v9]`, each float32: the cubic from `(t0, v0)` through the handles to `(t3,
 * v3)` — every one of the eight the number the document states, not its
 * float32 (the header's second measurement) — at its parameter `u = 0.1 …
 * 0.9`, by forward differences at the step
 * h = 1/10. With `p` the four control numbers of one coordinate, the second
 * difference is `3h²(p0 − 2p1 + p2)` and the third `6h³(3(p1 − p2) − p0 + p3)`;
 * the first starts at `3h(p1 − p0)` plus the second plus the third times
 * `BEZIER_SIXTH`; each step adds the first to the point, the second to the
 * first and the third to the second (the header's measurement fixes the
 * order of those additions and the constant).
 */
export function bezierPolyline(t0: number, v0: number, cx1: number, cy1: number, cx2: number, cy2: number, t3: number, v3: number): number[] {
  const walk = (p0: number, p1: number, p2: number, p3: number): number[] => {
    const second = (p0 - 2 * p1 + p2) * 0.03;
    const third = ((p1 - p2) * 3 - p0 + p3) * 0.006;
    let first = (p1 - p0) * 0.3 + second + third * BEZIER_SIXTH;
    let d2 = second * 2 + third;
    let at = p0;
    const out: number[] = [];
    for (let i = 1; i < BEZIER_PIECES; i++) {
      at += first;
      first += d2;
      d2 += third;
      out.push(Math.fround(at));
    }
    return out;
  };
  const ts = walk(t0, cx1, cx2, t3);
  const vs = walk(v0, cy1, cy2, v3);
  const out: number[] = [];
  for (let i = 0; i < ts.length; i++) out.push(ts[i], vs[i]);
  return out;
}

/** What evaluates one channel of a segment: `channelAt` unless a plant passes another. */
export type ChannelEvaluator = (keys: readonly CoreKey[], index: number, channel: number, t: number) => number;

/** What finds the key a time falls on: `keyIndexAt` unless a plant passes another. */
export type KeySearch = (keys: readonly CoreKey[], t: number) => number;

/** The last key at or before `t`, or −1 before the first — the header's key search. */
export function keyIndexAt(keys: readonly CoreKey[], t: number): number {
  let found = -1;
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].time <= t) found = i;
    else break;
  }
  return found;
}

/** Channel `channel` of the segment starting at key `index` (not the last), at `t` — the header's three curves. */
export function channelAt(keys: readonly CoreKey[], index: number, channel: number, t: number): number {
  const a = keys[index];
  const b = keys[index + 1];
  if (b === undefined || a.curve === 'stepped') return a.values[channel];
  if (a.curve === 'linear') return a.values[channel] + ((t - a.time) / (b.time - a.time)) * (b.values[channel] - a.values[channel]);
  const c = a.curve.slice(channel * 4, channel * 4 + 4);
  const inner = bezierPolyline(a.stated.time, a.stated.values[channel], c[0], c[1], c[2], c[3], b.stated.time, b.stated.values[channel]);
  const points = [a.time, a.values[channel], ...inner, b.time, b.values[channel]];
  let i = 2;
  while (i < points.length - 2 && points[i] < t) i += 2;
  const [x0, y0, x1, y1] = [points[i - 2], points[i - 1], points[i], points[i + 1]];
  return y0 + ((t - x0) / (x1 - x0)) * (y1 - y0);
}

/** Every plant this construct takes, beside the setup constructs' own (`CorePlant`). */
export interface TimelinePlant extends CorePlant {
  channel?: ChannelEvaluator;
  search?: KeySearch;
}

/** A timeline's channels at `t`, or `null` before its first key (the channels are then at setup). */
function valuesAt(keys: readonly CoreKey[], t: number, plant: TimelinePlant): number[] | null {
  const index = (plant.search ?? keyIndexAt)(keys, t);
  if (index < 0) return null;
  const channel = plant.channel ?? channelAt;
  return keys[index].values.map((_v, c) => channel(keys, index, c, t));
}

/** The key a stepped-by-nature timeline (attachment, inherit) shows at `t`, or `null` before its first key. */
function keyAt(keys: readonly CoreKey[], t: number, plant: TimelinePlant): CoreKey | null {
  const index = (plant.search ?? keyIndexAt)(keys, t);
  return index < 0 ? null : keys[index];
}

/** The bones posed by the animation's bone timelines at `t`: copies of the setup bones with the posed fields — the header's rules. */
export function posedBones(doc: CompiledDocument, timelines: CoreAnimationTimelines, t: number, plant: TimelinePlant = {}): ModelBone[] {
  const byName = new Map(timelines.bones.map((b) => [b.name, b]));
  return doc.bones.map((setup) => {
    const target = byName.get(setup.name);
    if (target === undefined) return setup;
    const bone: ModelBone = { ...setup };
    for (const tl of target.timelines) {
      if (tl.kind === 'inherit') {
        const key = keyAt(tl.keys, t, plant);
        if (key === null) {
          if (setup.inheritMode === undefined) delete bone.inheritMode;
          else bone.inheritMode = setup.inheritMode;
        } else bone.inheritMode = key.mode;
        continue;
      }
      const v = valuesAt(tl.keys, t, plant);
      const add = (field: 'x' | 'y' | 'rotation' | 'shearX' | 'shearY', i: number): void => {
        bone[field] = (setup[field] ?? 0) + (v === null ? 0 : v[i]);
      };
      const times = (field: 'scaleX' | 'scaleY', i: number): void => {
        bone[field] = (setup[field] ?? 1) * (v === null ? 1 : v[i]);
      };
      switch (tl.kind) {
        case 'rotate': add('rotation', 0); break;
        case 'translate': add('x', 0); add('y', 1); break;
        case 'translatex': add('x', 0); break;
        case 'translatey': add('y', 0); break;
        case 'shear': add('shearX', 0); add('shearY', 1); break;
        case 'shearx': add('shearX', 0); break;
        case 'sheary': add('shearY', 0); break;
        case 'scale': times('scaleX', 0); times('scaleY', 1); break;
        case 'scalex': times('scaleX', 0); break;
        case 'scaley': times('scaleY', 0); break;
      }
    }
    return bone;
  });
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * The slot rows at `t`, in the oracle's shape and rounding, or the conflicts
 * that leave them out: a slot showing a placeholder several skins fill
 * differently (the setup slots' ⚠️, `shownAttachment`).
 */
export function posedSlots(doc: CompiledDocument, timelines: CoreAnimationTimelines, t: number, plant: TimelinePlant = {}): { rows: CoreSlotRow[]; conflicts: string[] } {
  const resolve = plant.shown ?? shownAttachment;
  const colour = plant.colour ?? readColour;
  const blend = plant.blend ?? readBlend;
  const byName = new Map(timelines.slots.map((s) => [s.name, s]));
  const rows: CoreSlotRow[] = [];
  const conflicts: string[] = [];
  for (const slot of doc.slots) {
    let placeholder = slot.setup;
    const light = slot.color === undefined ? [1, 1, 1, 1] : colour(slot.color);
    const setupDark = slot.dark === undefined ? null : readColour(slot.dark);
    const dark = setupDark === null ? null : [setupDark[0], setupDark[1], setupDark[2]];
    for (const tl of byName.get(slot.name)?.timelines ?? []) {
      if (tl.kind === 'attachment') {
        const key = keyAt(tl.keys, t, plant);
        placeholder = key === null ? slot.setup : (key.name ?? null);
        continue;
      }
      const v = valuesAt(tl.keys, t, plant);
      const setupLight = slot.color === undefined ? [1, 1, 1, 1] : colour(slot.color);
      const channels = SLOT_COLOUR_TIMELINES[tl.kind].channels;
      channels.forEach((name, i) => {
        const at = { r: 0, g: 1, b: 2, a: 3, r2: 4, g2: 5, b2: 6 }[name];
        if (at < 4) light[at] = v === null ? setupLight[at] : clamp01(v[i]);
        else if (dark !== null && setupDark !== null) dark[at - 4] = v === null ? setupDark[at - 4] : clamp01(v[i]);
      });
    }
    const shown = placeholder === null ? null : resolve(doc, { ...slot, setup: placeholder });
    if (shown !== null && 'conflict' in shown) {
      conflicts.push(`slot "${slot.name}" shows placeholder "${placeholder}", filled by skins ${shown.conflict.map((c) => `"${c.skin}" (shows ${JSON.stringify(c.shown)})`).join(', ')}`);
      continue;
    }
    const row = shown === null ? null : shownRow(shown);
    rows.push([
      slot.name,
      row === null ? null : row.name,
      gridRound(light[0]), gridRound(light[1]), gridRound(light[2]), gridRound(light[3]),
      dark === null ? null : [gridRound(dark[0]), gridRound(dark[1]), gridRound(dark[2])],
      row === null ? null : row.path,
      // The slot's data, not its pose: no timeline moves it (the index header's blend rule).
      blend(slot),
    ]);
  }
  return { rows, conflicts };
}

/** The bone rows at `t`, in the oracle's shape and rounding. */
export function posedBoneRows(doc: CompiledDocument, timelines: CoreAnimationTimelines, t: number, plant: TimelinePlant = {}): CoreBoneRow[] {
  const active = activeBones(doc);
  const bones = posedBones(doc, timelines, t, plant);
  const world = (plant.evaluate ?? worldTransforms)(bones, active);
  return bones.map((b): CoreBoneRow => {
    const w = world.get(b.name);
    if (w === undefined) throw new CoreInputError(`the evaluator returned no transform for bone "${b.name}"`);
    return [b.name, gridRound(w.worldX), gridRound(w.worldY), gridRound(w.a), gridRound(w.b), gridRound(w.c), gridRound(w.d), active.has(b.name) ? 1 : 0, b.parent ?? null];
  });
}

// ---------------------------------------------------------------------------
// the samples
// ---------------------------------------------------------------------------

/** The oracle's phases, as `tools/pose_oracle.ts` names them. */
export type SamplePhase = 'grid' | 'off' | 'irr' | 'dense';

/** `1 − 1/φ`, the tool's irrational offset, to the nine places it writes. */
export const IRR_OFFSET = 0.381966011;

/**
 * Sample `i` of `n` over duration `d` under `phase` — the tool's formula
 * (`tools/pose_oracle.ts`, *Sample times*), held here so the two dumpers
 * sample at one set of times: `grid` `d·i/(n−1)` (`0` when `n` is 1), `off`
 * `d·(i+0.5)/n`, `irr` and `dense` `d·(i+IRR_OFFSET)/n`.
 */
export function sampleTime(phase: SamplePhase, d: number, i: number, n: number): number {
  if (phase === 'off') return (d * (i + 0.5)) / n;
  if (phase === 'irr' || phase === 'dense') return (d * (i + IRR_OFFSET)) / n;
  return n === 1 ? 0 : (d * i) / (n - 1);
}

/** One posed sample: the time and the two blocks this construct produces (`null` where it leaves one out). */
export interface CoreSample {
  t: number | null;
  bones: CoreBoneRow[] | null;
  slots: CoreSlotRow[] | null;
}

export interface CoreAnimationPose {
  name: string;
  duration: number | null;
  samples: CoreSample[];
}

/** Why the animation bones are left out — the setup bones' reason — or null. */
function bonesWhy(doc: CompiledDocument): string | null {
  if (doc.constraints.length === 0) return null;
  const kinds = [...new Set(doc.constraints.map((c) => c.kind))];
  return `the document declares ${kinds.map((k) => `${k} ×${doc.constraints.filter((c) => c.kind === k).length}`).join(', ')}, and constraints are not admitted (item 5): the oracle applies them after every animation`;
}

/** Why the animation slots are left out because a slider poses them, or null. */
function slidersWhy(doc: CompiledDocument): string | null {
  const keyed = doc.constraints.flatMap((c) => {
    if (c.kind !== 'slider') return [];
    const slots = doc.animations.find((a) => a.name === c.animation)?.slots ?? [];
    return slots.length === 0 ? [] : [`slider "${c.name}" applies animation "${c.animation}", which keys slot(s) ${slots.map((x) => `"${x}"`).join(', ')}`];
  });
  return keyed.length === 0 ? null : `${keyed.join('; ')} — the oracle applies sliders after every animation, and a slider poses the slots its animation keys; constraints are not admitted (item 5)`;
}

/**
 * Every animation of the document sampled as the oracle samples it: `n`
 * samples in `phase` over each animation's runtime duration, each the bone
 * rows and the slot rows at `t`, in the model's order of animations. Returns
 * the blocks left out with their reasons, `animations.bones` and
 * `animations.slots` in document order.
 */
export function poseAnimations(doc: CompiledDocument, phase: SamplePhase, n: number, plant: TimelinePlant = {}): { animations: CoreAnimationPose[]; absent: Array<[string, string]> } {
  const bonesReason = bonesWhy(doc);
  const slotConflicts: string[] = [];
  const animations = doc.animations.map((anim: CoreAnimation): CoreAnimationPose => {
    const d = anim.timelines.duration;
    const samples: CoreSample[] = [];
    for (let i = 0; i < n; i++) {
      const t = sampleTime(phase, d, i, n);
      const bones = bonesReason === null ? posedBoneRows(doc, anim.timelines, t, plant) : null;
      const slots = posedSlots(doc, anim.timelines, t, plant);
      for (const c of slots.conflicts) if (!slotConflicts.includes(`${c} at animation "${anim.name}"`)) slotConflicts.push(`${c} at animation "${anim.name}"`);
      samples.push({ t: gridRound(t), bones, slots: slots.rows });
    }
    return { name: anim.name, duration: gridRound(d), samples };
  });
  const slotsReason = slidersWhy(doc) ?? (slotConflicts.length === 0
    ? null
    : `${slotConflicts.slice(0, 5).join('; ')}${slotConflicts.length > 5 ? `; and ${slotConflicts.length - 5} more` : ''} — under --skin all the LAST of them in the Spine file's skin order wins, and that order is the emitter's, not the model's`);
  if (slotsReason !== null) for (const a of animations) for (const s of a.samples) s.slots = null;
  const absent: Array<[string, string]> = [];
  if (bonesReason !== null) absent.push(['animations.bones', bonesReason]);
  if (slotsReason !== null) absent.push(['animations.slots', slotsReason]);
  return { animations, absent };
}
