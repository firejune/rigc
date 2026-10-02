/**
 * What one timeline does when it is applied additively — the question A40
 * asks of the timeline a later slider shares with an earlier one (issue
 * #1025, cut 4c-5 of step 4c of #380). The validator asks the runtime by
 * posing (`timelineAddBehaviour` in `src/validate.ts`): the timeline applied
 * with `add` set, at alpha 1, `MixFrom.current`, no events, TWICE, at every
 * time its own keys name, the midpoints between them and one past the last,
 * from two start states — the setup pose, and the setup pose with every number
 * a pose holds moved by `0.375`, every slot showing nothing and the draw order
 * turned by one — under no skin and under every skin. A second application
 * that moves the pose again is `accumulates`; one that moved it the first time
 * and not the second is `overwrites`; one that never moves it is `inert`; the
 * strongest any cell reads wins. This module answers the same question from
 * the model document, with the core's own readings.
 *
 * ## The class is not a function of the timeline's kind alone
 *
 * Measured first, by posing the runtime's probe over a seeded population that
 * reaches every timeline the catalogue lists (`src/timelines.ts`), each in
 * three value variants — keys away from the setup, keys stating the setup
 * values, keys stating the identity (0, scale 1, white, no draw-order move) —
 * under no skin, the default skin and a second one, with targets active under
 * one skin only (234 timelines, the core suite's `CO27`): of the 36
 * spellings, 18 read one class on every timeline and 18 did not — every
 * adding kind read `accumulates` on some timelines and `inert` on others, and
 * a deform read all three. The kind decides what an application CAN do; three
 * facts of the rig decide what it does:
 *
 * - **Whether its target is active under some skin.** A timeline whose bone,
 *   slot bone or constraint is inactive under every view writes nothing:
 *   `inert`, whatever its kind. The rules are the core's own — `activeBones`,
 *   `slotTimelinesApply`, `constraintInactiveWhy` (an ik is gated on its
 *   target, a transform on its source, a path on its slot's bone, a physics
 *   constraint on its bone, a slider on its dial) — measured equal here on an
 *   ik over a skin-required bone (applied) and onto one (not applied).
 * - **Whether a deform or sequence timeline's attachment is shown.** Both
 *   are gated on the slot showing the record they are keyed on, or a linked
 *   mesh that plays its timelines (`timelineIdentity`); from the displaced
 *   state the slot shows nothing, so only the setup state can be written. A
 *   deform keyed on a record no view shows at setup is `inert`; a deform
 *   whose every offset is 0 fills the empty deform array once and adds 0 the
 *   second time — `overwrites`, not `accumulates`.
 * - **Whether the value it adds is 0.** The ten bone value timelines, the
 *   transform mixes, a path's position and mix, physics wind and gravity and
 *   a slider's time and mix ADD: `current + v` (a scale `current + (v·setup −
 *   setup)`, the setup's and not the current's — a displaced `scaleX` 1.875
 *   over setup 1.5 keyed 3 read 4.875). Keyed to 0 (a scale to 1) they write
 *   nothing at all: `inert`.
 *
 * So the class is a computation over the document, and the table below
 * carries only what the kind contributes — what its application does when it
 * writes. The rest is computed per cell, as the probe reads it. (What the
 * runtime calls the timeline is the validator's table, `RUNTIME_TIMELINE`,
 * since issue #1054.)
 *
 * ## The cells, per kind
 *
 * - `adds`: each field `once = current + d`, `twice = once + d`, `d` the
 *   keyed value at the time (`channelAt`, the runtime's curve as the core
 *   reproduces it), a scale's `v·setup − setup`; `current` the setup value,
 *   or the setup value plus `0.375`. A deform: the setup state holds no
 *   deform, `once` is the keyed array (`deformAt`) and `twice` the core's
 *   additive blend of it over itself at alpha 1 (`blendDeform`).
 * - `writes`: the keyed value replaces the current one — a number through the
 *   setup blend at alpha 1, `current + (v − current)`, a mass as its inverse; a
 *   colour channel the keyed value clamped to [0, 1]; an ik's flags as keyed;
 *   an inherit mode, an attachment by the name it resolves to under the view
 *   (`shownAttachment`), a draw order (`drawOrderAt`) against the setup order
 *   or the order turned by one; a sequence writes its frame wherever its
 *   record is shown (the setup pose holds no frame index).
 * - `writes nothing`: an event timeline (a slider fires none) and a physics
 *   `reset` (no time passes between the two applications).
 *
 * A physics timeline naming no constraint (`*`) writes every active record
 * whose `…Global` flag for its value is on (`unnamedPhysicsTargets`).
 *
 * ## Held
 *
 * The core suite's `CO27` poses the runtime's probe over the seeded
 * population and holds every cell's letter, and every added field's three
 * values at tolerance 0, to this module's; one row of the table flipped per
 * class turns exactly the timelines using it red.
 *
 * ## Purity
 *
 * As the rest of the core: nothing from the Spine runtime package, nothing
 * from `src/transform.ts`, no clock, no randomness, no I/O.
 */
import type { ModelBone, ModelVertices } from '../model.ts';
import { channelAt, keyIndexAt, SLOT_COLOUR_TIMELINES, type BoneTimelineKind, type CoreKey, type SlotTimelineKind } from './animation.ts';
import { constraintInactiveWhy, TRANSFORM_MIXES, TRANSFORM_PROPERTIES, type CoreConstraintRecord, type CoreIkKey } from './constraints.ts';
import { EVERY_GLOBAL_PHYSICS, physicsActive, unnamedPhysicsTargets, type CorePhysicsRecord, type PhysicsTimelineKind } from './constraints_physics.ts';
import { blendDeform, deformAt, timelineIdentity, type CoreDeformKey, type CoreSequenceKey } from './deform.ts';
import { drawOrderAt, type CoreDrawOrderKey } from './draw_order.ts';
import { activeBones, foldInheritMode, readColour, shownAttachment, shownRow, type CompiledDocument, type CoreAttachment } from './index.ts';
import { slotTimelinesApply } from './skins.ts';

/** What a kind's application does when it writes (the header's *The cells, per kind*). */
export type AdditiveMode = 'adds' | 'writes' | 'writes nothing';

/**
 * What each timeline spelling's application does when it writes, keyed by the
 * document's own words (`additiveSpelling`) — measured off the probe's cells
 * over the seeded population (the header). What the runtime calls each
 * spelling — the class it loads as and the properties it registers, which A40's
 * sentence prints — is the validator's to know and stands beside it
 * (`RUNTIME_TIMELINE`, `src/assertions/model/runtime_timelines.ts`, issue
 * #1054): this module speaks the document's words only.
 */
export const ADDITIVE_MODE: Readonly<Record<string, AdditiveMode>> = {
  'bone rotate': 'adds',
  'bone translate': 'adds',
  'bone translatex': 'adds',
  'bone translatey': 'adds',
  'bone scale': 'adds',
  'bone scalex': 'adds',
  'bone scaley': 'adds',
  'bone shear': 'adds',
  'bone shearx': 'adds',
  'bone sheary': 'adds',
  'bone inherit': 'writes',
  'slot attachment': 'writes',
  'slot rgba': 'writes',
  'slot rgb': 'writes',
  'slot alpha': 'writes',
  'slot rgba2': 'writes',
  'slot rgb2': 'writes',
  'attachment deform': 'adds',
  'attachment sequence': 'writes',
  ik: 'writes',
  transform: 'adds',
  'path position': 'adds',
  'path spacing': 'writes',
  'path mix': 'adds',
  'physics inertia': 'writes',
  'physics strength': 'writes',
  'physics damping': 'writes',
  'physics mass': 'writes',
  'physics wind': 'adds',
  'physics gravity': 'adds',
  'physics mix': 'writes',
  'physics reset': 'writes nothing',
  'slider time': 'adds',
  'slider mix': 'adds',
  drawOrder: 'writes',
  events: 'writes nothing',
};

/** One timeline of a document's animation, as the core reads it — enough to pose the probe. */
export type AdditiveTimeline =
  | { group: 'bone'; word: BoneTimelineKind; bone: string; keys: readonly CoreKey[] }
  | { group: 'slot'; word: SlotTimelineKind; slot: string; keys: readonly CoreKey[] }
  | { group: 'ik'; word: 'ik'; constraint: string; keys: readonly CoreIkKey[] }
  | { group: 'transform'; word: 'transform'; constraint: string; keys: readonly CoreKey[] }
  | { group: 'path'; word: 'position' | 'spacing' | 'mix'; constraint: string; keys: readonly CoreKey[] }
  | { group: 'physics'; word: PhysicsTimelineKind; constraint: string; keys: readonly CoreKey[] }
  | { group: 'slider'; word: 'time' | 'mix'; constraint: string; keys: readonly CoreKey[] }
  | { group: 'attachment'; word: 'deform'; skin: string; slot: string; attachment: string; keys: readonly CoreDeformKey[] }
  | { group: 'attachment'; word: 'sequence'; skin: string; slot: string; attachment: string; keys: readonly CoreSequenceKey[] }
  | { group: 'drawOrder'; word: 'drawOrder'; keys: readonly CoreDrawOrderKey[] }
  | { group: 'events'; word: 'events'; times: readonly number[] };

/** The spelling a timeline is a row of. */
export function additiveSpelling(t: AdditiveTimeline): string {
  if (t.group === 'ik' || t.group === 'transform' || t.group === 'drawOrder' || t.group === 'events') return t.group;
  return `${t.group} ${t.word}`;
}

/** One view the probe poses under: the name the runtime's skin carries (`(none)` for no skin set) and the document under it. */
export interface AdditiveView {
  name: string;
  doc: CompiledDocument;
}

/** What the probe moved one field to: before either application, after one, after two — each as the pose prints it. */
export interface AdditiveValue {
  /** `bone:<name>.<field>`, `constraint:<name>.<field>` or `slot:<name>.deform`, the pose field's own name. */
  field: string;
  t: number;
  before: string;
  once: string;
  twice: string;
}

/** One view under one start state: the letter the probe reads (`A` a second application moved it, `W` only the first did, `-` nothing), and the values an adding kind moved. */
export interface AdditiveCell {
  view: string;
  state: 'setup' | 'displaced';
  letter: 'A' | 'W' | '-';
  values: AdditiveValue[];
}

/** The class the probe reads: the strongest any cell reads. */
export type AdditiveBehaviour = 'accumulates' | 'overwrites' | 'inert';

/** The probe's displacement of every number a pose holds — the validator's `PROBE_DISPLACEMENT`, exact in binary. */
export const ADDITIVE_DISPLACEMENT = 0.375;

/** A plant: rows of the table read otherwise (the core suite's `CO27`). */
export interface AdditivePlant {
  modes?: Readonly<Record<string, AdditiveMode>>;
}

/** Every time the probe applies a timeline at: its keys' own times, the midpoints between them, and one past the last. */
export function additiveTimes(times: readonly number[]): number[] {
  const between: number[] = [];
  for (let i = 1; i < times.length; i++) between.push((times[i - 1] + times[i]) / 2);
  return [...times, ...between, (times.length ? times[times.length - 1] : 0) + 1];
}

const spell = (v: number): string => String(v);
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** One field moved by an adding kind: its two sums from `current`. */
function added(values: AdditiveValue[], field: string, t: number, current: number, d: number): { wrote: boolean; again: boolean } {
  const once = current + d;
  const twice = once + d;
  values.push({ field, t, before: spell(current), once: spell(once), twice: spell(twice) });
  return { wrote: spell(once) !== spell(current), again: spell(twice) !== spell(once) };
}

/** The keyed channels at `t`, the probe's times all at or after the first key. */
function channelsAt(keys: readonly CoreKey[], t: number): number[] {
  const i = keyIndexAt(keys, t);
  if (i < 0) return [];
  return keys[i].values.map((_v, c) => channelAt(keys, i, c, t));
}

/** A number written through the setup blend at alpha 1: whether it moves `current`. */
const blendMoves = (current: number, v: number): boolean => spell(current + (v - current)) !== spell(current);

/** The setup value of a bone field. */
function boneSetup(b: ModelBone, field: 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY' | 'shearX' | 'shearY'): number {
  return b[field] ?? (field === 'scaleX' || field === 'scaleY' ? 1 : 0);
}

const BONE_FIELDS: Readonly<Record<Exclude<BoneTimelineKind, 'inherit'>, ReadonlyArray<'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY' | 'shearX' | 'shearY'>>> = {
  rotate: ['rotation'],
  translate: ['x', 'y'],
  translatex: ['x'],
  translatey: ['y'],
  scale: ['scaleX', 'scaleY'],
  scalex: ['scaleX'],
  scaley: ['scaleY'],
  shear: ['shearX', 'shearY'],
  shearx: ['shearX'],
  sheary: ['shearY'],
};

/** A constraint's record under a view, by kind and name. */
function recordOf(view: CompiledDocument, kind: CoreConstraintRecord['kind'], name: string): CoreConstraintRecord | undefined {
  return view.constraints.find((c) => c.kind === kind && c.name === name)?.record;
}

/**
 * Whether a constraint's timelines write into its pose under a view whose
 * active bones are `active` — the solver's rule (`constraintInactiveWhy`,
 * `physicsActive`) except for a slider, whose timelines write whatever its dial
 * bone is: measured, a slider dialled by a skin-required bone keyed `mix`
 * accumulated under no skin and the default skin, where the bone is inactive,
 * as under the skin that lists the bone. The solver leaves such a slider
 * unapplied; whether the runtime applies it was not measured here (the
 * header's ⚠️).
 */
function applies(r: CoreConstraintRecord, active: ReadonlySet<string>): boolean {
  if (r.kind === 'physics') return physicsActive(r, active);
  const why = constraintInactiveWhy(r, active);
  return why === null || (r.kind === 'slider' && why !== 'skin');
}

/** The fields an adding constraint timeline moves, with their setup values. */
function constraintFields(t: AdditiveTimeline, r: CoreConstraintRecord): Array<{ field: string; setup: number; channel: number }> {
  if (t.group === 'transform' && r.kind === 'transform') return TRANSFORM_PROPERTIES.map((p, channel) => ({ field: TRANSFORM_MIXES[p], setup: r.mixes[p], channel }));
  if (t.group === 'path' && r.kind === 'path') {
    if (t.word === 'position') return [{ field: 'position', setup: r.position, channel: 0 }];
    if (t.word === 'mix') return [{ field: 'mixRotate', setup: r.mixRotate, channel: 0 }, { field: 'mixX', setup: r.mixX, channel: 1 }, { field: 'mixY', setup: r.mixY, channel: 2 }];
    return [{ field: 'spacing', setup: r.spacing, channel: 0 }];
  }
  if (t.group === 'physics' && r.kind === 'physics' && t.word !== 'reset') {
    if (t.word === 'mass') return [{ field: 'massInverse', setup: r.massInverse, channel: 0 }];
    return [{ field: t.word, setup: r[t.word], channel: 0 }];
  }
  if (t.group === 'slider' && r.kind === 'slider') return [{ field: t.word, setup: r[t.word], channel: 0 }];
  if (t.group === 'ik' && r.kind === 'ik') return [{ field: 'mix', setup: r.mix, channel: 0 }, { field: 'softness', setup: r.softness, channel: 1 }];
  return [];
}

/** The vertices a shown record's deform array is computed on: its own, or a linked mesh's source's. */
function deformVertices(view: CompiledDocument, record: CoreAttachment): ModelVertices | null {
  const g = record.geometry;
  if (g === undefined) return null;
  const source = g.kind === 'linkedmesh' ? view.skins.find((k) => k.name === g.skin)?.attachments[g.slot]?.[g.source]?.geometry : g;
  return source !== undefined && source.kind !== 'region' && source.kind !== 'linkedmesh' ? source.vertices : null;
}

/** One view, one start state: the letter and the values (the header's cells). */
function cellOf(view: AdditiveView, state: 'setup' | 'displaced', t: AdditiveTimeline, mode: AdditiveMode): AdditiveCell {
  const doc = view.doc;
  const active = activeBones(doc);
  const shift = state === 'setup' ? 0 : ADDITIVE_DISPLACEMENT;
  const values: AdditiveValue[] = [];
  let wrote = false;
  let again = false;
  const note = (r: { wrote: boolean; again: boolean }): void => {
    wrote ||= r.wrote;
    again ||= r.again;
  };
  const times = additiveTimes(t.group === 'events' ? t.times : t.keys.map((k) => k.time));
  const done = (): AdditiveCell => ({ view: view.name, state, letter: again ? 'A' : wrote ? 'W' : '-', values });
  if (mode === 'writes nothing') return done();
  switch (t.group) {
    case 'bone': {
      const b = doc.bones.find((x) => x.name === t.bone);
      if (b === undefined || !active.has(b.name)) return done();
      if (t.word === 'inherit') {
        // The displaced pose holds the mode's number plus 0.375, which no mode is; the setup pose holds the setup mode.
        const setup = foldInheritMode(b.inheritMode ?? 'normal') ?? 'normal';
        for (const time of times) {
          const i = keyIndexAt(t.keys, time);
          if (i < 0) continue;
          if (state === 'displaced' || t.keys[i].mode !== setup) wrote = true;
        }
        return done();
      }
      const fields = BONE_FIELDS[t.word];
      for (const time of times) {
        const v = channelsAt(t.keys, time);
        fields.forEach((field, c) => {
          const setup = boneSetup(b, field);
          const d = mode === 'adds' ? (field === 'scaleX' || field === 'scaleY' ? v[c] * setup - setup : v[c]) : Number.NaN;
          if (mode === 'adds') note(added(values, `bone:${b.name}.${field}`, time, setup + shift, d));
          else note({ wrote: blendMoves(setup + shift, v[c]), again: false });
        });
      }
      return done();
    }
    case 'slot': {
      const slot = doc.slots.find((s) => s.name === t.slot);
      if (slot === undefined || !slotTimelinesApply(doc, slot, active)) return done();
      if (t.word === 'attachment') {
        const nameShown = (placeholder: string | null): string | null => {
          if (placeholder === null) return null;
          const s = shownAttachment(doc, { ...slot, setup: placeholder });
          return s === null || 'conflict' in s ? null : shownRow(s).name;
        };
        // The setup pose shows the setup attachment; the displaced pose shows nothing.
        const current = state === 'setup' ? nameShown(slot.setup) : null;
        for (const time of times) {
          const i = keyIndexAt(t.keys, time);
          if (i >= 0 && nameShown(t.keys[i].name ?? null) !== current) wrote = true;
        }
        return done();
      }
      const shape = SLOT_COLOUR_TIMELINES[t.word];
      const light = readColour(slot.color ?? 'ffffffff');
      const dark = slot.dark === undefined ? null : readColour(slot.dark);
      for (const time of times) {
        const v = channelsAt(t.keys, time);
        shape.channels.forEach((channel: string, c: number) => {
          const second = channel.endsWith('2');
          const at = ['r', 'g', 'b', 'a'].indexOf(second ? channel.slice(0, 1) : channel);
          const setup = second ? (dark === null ? Number.NaN : dark[at]) : light[at];
          if (spell(clamp01(v[c])) !== spell(setup + shift)) wrote = true;
        });
      }
      return done();
    }
    case 'attachment': {
      // The displaced pose shows nothing on any slot, and both timelines are gated on what a slot shows.
      if (state === 'displaced') return done();
      const identity = `${t.skin}/${t.slot}/${t.attachment}`;
      for (const slot of doc.slots) {
        if (!slotTimelinesApply(doc, slot, active)) continue;
        const shown = shownAttachment(doc, slot);
        if (shown === null || 'conflict' in shown || timelineIdentity(slot.name, shown) !== identity) continue;
        if (t.word === 'sequence') {
          if (shown.record.sequenceCount !== undefined && t.keys.length > 0) wrote = true;
          continue;
        }
        const vertices = deformVertices(doc, shown.record);
        if (vertices === null) continue;
        for (const time of times) {
          const target = deformAt(vertices, t.keys, time);
          if (target === null) continue;
          // From no deform, the additive blend at alpha 1 is the target (`blendDeform`); a second one adds `target − setup` to it.
          const once = blendDeform(vertices, null, target, 1, true);
          const twice = blendDeform(vertices, once, target, 1, true);
          values.push({ field: `slot:${slot.name}.deform`, t: time, before: '[]', once: `[${once.join(',')}]`, twice: `[${twice.join(',')}]` });
          wrote = true;
          if (once.join(',') !== twice.join(',')) again = true;
        }
      }
      return done();
    }
    case 'drawOrder': {
      const count = doc.slots.length;
      const setup = Array.from({ length: count }, (_v, i) => i);
      const current = state === 'setup' ? setup : [...setup.slice(1), ...setup.slice(0, 1)];
      for (const time of times) {
        const order = drawOrderAt(count, t.keys, time);
        if (order !== null && order.join(',') !== current.join(',')) wrote = true;
      }
      return done();
    }
    case 'events':
      // A kind that writes moves the pose; an event timeline under a slider fires nothing (the table's mode), so only a plant reaches this.
      if (mode === 'writes') wrote = true;
      return done();
    default: {
      const records: CoreConstraintRecord[] =
        t.group === 'physics' && t.constraint === EVERY_GLOBAL_PHYSICS
          ? unnamedPhysicsTargets(
              doc.constraints.flatMap((c): CorePhysicsRecord[] => (c.record?.kind === 'physics' ? [c.record] : [])),
              t.word,
              (r) => physicsActive(r, active),
            )
          : [recordOf(doc, t.group, t.constraint)].filter((r): r is CoreConstraintRecord => r !== undefined && applies(r, active));
      for (const r of records) {
        // A kind that writes with no field of its own to compare — only a plant makes a `reset` one — moves the pose wherever it applies.
        if (t.group === 'physics' && t.word === 'reset' && mode === 'writes') wrote = true;
        const fields = constraintFields(t, r);
        for (const time of times) {
          const v = channelsAt(t.keys, time);
          for (const { field, setup, channel } of fields) {
            const current = setup + shift;
            if (mode === 'adds') note(added(values, `constraint:${r.name}.${field}`, time, current, v[channel]));
            // A mass is keyed as a mass and posed as its inverse.
            else if (field === 'massInverse') note({ wrote: spell(1 / (1 / current + (v[channel] - 1 / current))) !== spell(current), again: false });
            else note({ wrote: blendMoves(current, v[channel]), again: false });
          }
          // An ik key's flags: the displaced pose moved the bend direction (a number); the setup pose holds the setup flags.
          if (t.group === 'ik' && r.kind === 'ik') {
            const i = keyIndexAt(t.keys, time);
            const flags = i < 0 ? undefined : t.keys[i].flags;
            if (flags !== undefined && (state === 'displaced' || flags.bendPositive !== r.bendPositive || flags.compress !== r.compress || flags.stretch !== r.stretch)) wrote = true;
          }
        }
      }
      return done();
    }
  }
}

/** Every cell of the probe over `views` — each view under the setup state, then the displaced one. */
export function additiveCells(views: readonly AdditiveView[], t: AdditiveTimeline, plant: AdditivePlant = {}): AdditiveCell[] {
  const modes = plant.modes ?? ADDITIVE_MODE;
  const spelled = additiveSpelling(t);
  const mode = modes[spelled];
  if (mode === undefined) throw new Error(`internal: "${spelled}" is no row of the additive table`);
  return views.flatMap((view) => [cellOf(view, 'setup', t, mode), cellOf(view, 'displaced', t, mode)]);
}

/** The class the probe reads over its cells: `accumulates` where any cell does, `overwrites` where any cell only wrote, `inert` otherwise. */
export function additiveBehaviour(cells: readonly AdditiveCell[]): AdditiveBehaviour {
  if (cells.some((c) => c.letter === 'A')) return 'accumulates';
  return cells.some((c) => c.letter === 'W') ? 'overwrites' : 'inert';
}

