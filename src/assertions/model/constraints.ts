/**
 * The model side's supply of `ConstraintFacts` (issue #1025, step 4c of
 * #380): the document's constraints in update order, the constraint
 * timelines of its animations in the order the runtime builds them, and the
 * slots its skins give a path.
 *
 * Every value is the one the runtime holds after its parse, through a
 * function rigc already runs:
 *
 * - **A constraint's fields** are the core's records (`readModel` →
 *   `readConstraintRecord`, `readPathRecord`, `readPhysicsRecord`,
 *   `readSliderRecord`), which read a field the record leaves out at the
 *   parser's value; a physics record's `massInverse` and `step` are the
 *   reader's `1 / mass` and `1 / fps`. A transform constraint reads a mix
 *   exactly where one of its `to` entries names that property — the core's
 *   `properties`, by `TRANSFORM_MIXES`.
 * - **A slider's animation** is the core's reading of it: its duration is
 *   `CoreAnimationTimelines.duration` (the last key time, float32 — the
 *   runtime's), and the timelines it carries are the bone and slot timelines
 *   plus the count of every later group the reader counts.
 * - **The timelines**: the animations in the file's order
 *   (`fileAnimationOrder`, issue #1034: a `rigc-compiled/3` document's
 *   `editorOrder`, else the emitter's own rule over its names); in each the
 *   groups in the runtime's order (`../facts/constraints.ts`' ⭐), each
 *   group's entries in the order the file keys them — the document's, an
 *   integer-like constraint name first (`keyedOrder`) — and each entry's
 *   timelines in the document's order, which the emitter writes unchanged. A key's time and value are the core's (float32), and a
 *   Bézier segment's samples `bezierPolyline` over the numbers the document
 *   states — the runtime's curve, as the core reproduces it.
 * - **The reach of a physics timeline naming none** is asked of the core's
 *   own `posedPhysics` rather than restated: the timeline is posed once with
 *   a key the setup cannot hold (NaN), and the constraints it reached are the
 *   ones whose pose field took it; a `reset` timeline's reach is the set
 *   `posedPhysics` returns.
 *
 * ⚠️ One value is not the document's: `runtimeClass`, the runtime's class
 * name for a kind, which A42's sentence names `update` on. The document has no
 * field for it and rigc has no function returning it, so it is the table
 * below; the selftest compares it with the class spine-core loaded on every
 * call that reaches a constraint (`VF10`).
 *
 * Links nothing from the runtime.
 */
import { fileAnimationOrder, keyedOrder, type OrderedDocument } from '../../compile.ts';
import { bezierPolyline, type CoreAnimationTimelines, type CoreKey } from '../../core/animation.ts';
import { TRANSFORM_MIXES, TRANSFORM_PROPERTIES, type CoreConstraintRecord } from '../../core/constraints.ts';
import { EVERY_GLOBAL_PHYSICS, posedPhysics, type CorePhysicsRecord, type PhysicsTimelineKind } from '../../core/constraints_physics.ts';
import type { CompiledDocument } from '../../core/index.ts';
import { physicsRuleFor } from '../../timelines.ts';
import type { ConstraintEntry, ConstraintFacts, ConstraintKind, ConstraintTimeline } from '../facts/constraints.ts';
import { isObj, type Json } from '../values.ts';
import { fileOrderedEntries } from './skin_entries.ts';
import type { ReadDocument } from './parse.ts';

/** The runtime's class for each kind — the one value here that is not the document's (the header's ⚠️). */
export const RUNTIME_CONSTRAINT_CLASS: Readonly<Record<ConstraintKind, string>> = {
  ik: 'IkConstraint',
  transform: 'TransformConstraint',
  path: 'PathConstraint',
  physics: 'PhysicsConstraint',
  slider: 'Slider',
};

/** How many timelines the runtime builds for an animation the core read: every bone and slot timeline, and every later group's count. */
export function timelineCount(timelines: CoreAnimationTimelines): number {
  let n = 0;
  for (const target of [...timelines.bones, ...timelines.slots]) n += target.timelines.length;
  for (const [, count] of timelines.later) n += count;
  return n;
}

/** Every value one channel of `keys` poses: each key's own, then the samples of the Bézier segment it opens. */
export function channelValuesOf(keys: readonly CoreKey[], channel: number): number[] {
  const out: number[] = [];
  keys.forEach((a, i) => {
    out.push(a.values[channel]);
    const b = keys[i + 1];
    if (b === undefined || !Array.isArray(a.curve)) return;
    const c = a.curve.slice(channel * 4, channel * 4 + 4);
    const inner = bezierPolyline(a.stated.time, a.stated.values[channel], c[0], c[1], c[2], c[3], b.stated.time, b.stated.values[channel]);
    for (let p = 1; p < inner.length; p += 2) out.push(inner[p]);
  });
  return out;
}

/** The physics constraints a timeline naming none reaches, asked of `posedPhysics` (the header). */
export function unnamedReach(records: readonly CorePhysicsRecord[], kind: PhysicsTimelineKind): Set<string> {
  if (kind === 'reset') {
    const keys: CoreKey[] = [{ time: 0, values: [], stated: { time: 0, values: [] }, curve: 'stepped' }];
    return posedPhysics(records, [{ name: EVERY_GLOBAL_PHYSICS, kind, keys }], 0, -1, () => true).reset;
  }
  const keys: CoreKey[] = [{ time: 0, values: [Number.NaN], stated: { time: 0, values: [Number.NaN] }, curve: 'linear' }];
  const posed = posedPhysics(records, [{ name: EVERY_GLOBAL_PHYSICS, kind, keys }], 0, -1, () => true).records;
  const field = kind === 'mass' ? 'massInverse' : kind;
  return new Set([...posed.values()].filter((r) => Number.isNaN(r[field])).map((r) => r.name));
}

function entryOf(doc: CompiledDocument, kind: ConstraintKind, name: string, record: CoreConstraintRecord): ConstraintEntry {
  const base = { kind, name, runtimeClass: RUNTIME_CONSTRAINT_CLASS[kind] };
  switch (record.kind) {
    case 'physics':
      return {
        ...base,
        physics: {
          bone: record.bone,
          components: { x: record.x, y: record.y, rotate: record.rotate, scaleX: record.scaleX, shearX: record.shearX },
          setup: { mix: record.mix, massInverse: record.massInverse, strength: record.strength, damping: record.damping },
          step: record.step,
        },
      };
    case 'path':
      return { ...base, path: { bones: record.bones, slot: record.slot, setup: { mixRotate: record.mixRotate, mixX: record.mixX, mixY: record.mixY } } };
    case 'slider': {
      const anim = doc.animations.find((a) => a.name === record.animation);
      return {
        ...base,
        slider: {
          animation: anim === undefined ? null : { name: anim.name, timelines: timelineCount(anim.timelines), duration: anim.timelines.duration },
          bone: record.bone,
          loop: record.loop,
          scale: record.scale,
          mix: record.mix,
        },
      };
    }
    case 'ik':
      return { ...base, ik: { bones: record.bones, target: record.target, mix: record.mix } };
    case 'transform':
      return {
        ...base,
        transform: {
          bones: record.bones,
          mixes: TRANSFORM_PROPERTIES.map((p) => (record.properties.some((from) => from.to.some((to) => to.property === p)) ? { field: TRANSFORM_MIXES[p], setup: record.mixes[p] } : null)),
        },
      };
  }
}

/** One constraint timeline as the model side walks it: where it is, what it keys, and the core's keys for it. */
export interface ModelConstraintTimelineSource {
  animation: string;
  kind: ConstraintKind;
  word: string;
  /** The constraint it names, or `EVERY_GLOBAL_PHYSICS`. */
  name: string;
  keys: readonly CoreKey[];
}

/** How the animations are put in the file's order: `fileAnimationOrder`. A parameter only so the selftest can show what another order would print (`VF11`). */
export type AnimationFileOrder = (doc: OrderedDocument) => readonly string[];

/**
 * `entries` in the order the Spine file keys them by name (issue #1034): each
 * constraint group of an animation is an object the emitter fills in the
 * model's order, so the names are grouped as they first appear and put
 * through `keyedOrder` — an integer-like name first — and every entry of one
 * name keeps its place among them.
 */
function inKeyedOrder<T extends { name: string }>(entries: readonly T[]): T[] {
  const names = entries.map((e) => e.name);
  return keyedOrder(names.filter((n, i) => names.indexOf(n) === i)).flatMap((name) => entries.filter((e) => e.name === name));
}

/** Every constraint timeline of the document, in the order the runtime builds them (the header) — the walk `modelConstraintFacts` reads, and the selftest's measurement of each derivation. */
export function modelConstraintTimelineSources(read: ReadDocument, animations: AnimationFileOrder = fileAnimationOrder): ModelConstraintTimelineSource[] {
  const { doc } = read;
  const jsonAnimations = Array.isArray(read.json.animations) ? read.json.animations.filter(isObj) : [];
  const out: ModelConstraintTimelineSource[] = [];
  for (const name of animations(doc)) {
    const anim = doc.animations.find((a) => a.name === name);
    if (anim === undefined) continue;
    const c = anim.constraints;
    for (const tl of inKeyedOrder(c.ik)) out.push({ animation: name, kind: 'ik', word: 'ik', name: tl.name, keys: tl.keys });
    for (const tl of inKeyedOrder(c.transform)) out.push({ animation: name, kind: 'transform', word: 'transform', name: tl.name, keys: tl.keys });
    for (const entry of inKeyedOrder(c.path)) {
      for (const word of Object.keys(entry)) {
        if (word === 'position' || word === 'spacing' || word === 'mix') out.push({ animation: name, kind: 'path', word, name: entry.name, keys: entry[word] ?? [] });
      }
    }
    for (const tl of inKeyedOrder(c.physicsKeyed ?? [])) out.push({ animation: name, kind: 'physics', word: tl.kind, name: tl.name, keys: tl.keys });
    // A slider entry's timelines in the order the document lists them, which `readSliderTimelines` keeps by name only.
    const jsonSliders = ((): Json[] => {
      const json = jsonAnimations.find((a) => a.name === name)?.constraints;
      return isObj(json) && Array.isArray(json.slider) ? json.slider.filter(isObj) : [];
    })();
    // Paired with the document's own entry by index before the walk is put in the file's order.
    const sliders = c.slider.map((entry, i) => ({ name: entry.name, entry, listed: Array.isArray(jsonSliders[i]?.timelines) ? (jsonSliders[i].timelines as unknown[]).filter(isObj).map((t) => t.name) : [] }));
    for (const { entry, listed } of inKeyedOrder(sliders)) {
      for (const word of listed) {
        if (word === 'time' || word === 'mix') out.push({ animation: name, kind: 'slider', word, name: entry.name, keys: entry[word] ?? [] });
      }
    }
  }
  return out;
}

export function modelConstraintFacts(read: ReadDocument, animations: AnimationFileOrder = fileAnimationOrder): ConstraintFacts {
  const { doc } = read;
  const constraints: ConstraintEntry[] = doc.constraints.map((c) => {
    if (c.record === undefined) throw new Error(`internal: ${c.kind} constraint "${c.name}" is one the reader returned without its record`);
    return entryOf(doc, c.kind, c.name, c.record);
  });
  const indexOf = (kind: ConstraintKind, name: string): number => doc.constraints.findIndex((c) => c.kind === kind && c.name === name);
  const physicsRecords = doc.constraints.flatMap((c) => (c.record?.kind === 'physics' ? [c.record] : []));
  const timelines: ConstraintTimeline[] = modelConstraintTimelineSources(read, animations).map(({ animation, kind, word, name, keys }) => {
    const constraint = name === EVERY_GLOBAL_PHYSICS && kind === 'physics' ? -1 : indexOf(kind, name);
    const reach = constraint >= 0 ? [constraint] : [...unnamedReach(physicsRecords, word as PhysicsTimelineKind)].map((n) => indexOf('physics', n)).sort((a, b) => a - b);
    const rule = kind === 'physics' ? physicsRuleFor(word) : undefined;
    return {
      animation,
      kind,
      word,
      constraint,
      reach,
      frames: word === 'reset' ? [] : keys.map((k) => ({ time: k.time, value: k.values[0] })),
      channelValues: (channel: number) => (word === 'reset' ? [] : channelValuesOf(keys, channel)),
      ...(rule === undefined ? {} : { posed: (value: number) => rule.toPose(value) }),
    };
  });
  const pathSlots: string[] = [];
  for (const entry of fileOrderedEntries(read)) {
    if (entry.record.kind === 'path' && !pathSlots.includes(entry.slot)) pathSlots.push(entry.slot);
  }
  return { animations: doc.animations.length, constraints, timelines, pathSlots };
}
