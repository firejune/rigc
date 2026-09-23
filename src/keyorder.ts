/**
 * The order the Spine editor writes an object's keys in, per kind of object —
 * and the one pass that puts every emitted object into it (issue #716).
 *
 * ## Why the emitter has an opinion about something JSON does not mean
 *
 * spine-core reads every object below by name (`SkeletonJson` asks a bone map
 * for `"rotation"`, never for its third key), so a key's position reaches no
 * parsed value and no gate can see it. What it reaches is the text: a rebuild of
 * an editor export that writes `length, x, y, rotation` where the export wrote
 * `length, rotation, x, y` is not the export, and #716's pass line — the rebuild
 * and the export identical in canonical form, `JSON.stringify(JSON.parse(text),
 * null, 2)` — is decided on text. Measured at `af8b082` over the twelve editor
 * exports under `examples/`: **280** objects of the rebuilds carried their shared
 * keys in another order — 269 in seven kinds of field order (region attachments
 * 125, bones 87, the three constraint types 46, slots 7, the top level 4) and 11
 * skins whose `attachments` map is keyed by slot NAME, which is not a field
 * order and is `compile.ts`'s `editorSlotKeyOrder`, not a row here.
 *
 * ## Where the rows come from
 *
 * Every row is **read off the twelve exports**, never off memory of the editor's
 * source: for each kind, every export object's key sequence is a constraint
 * (*these keys, in this order*), and the row is the one order that satisfies all
 * of them at once. A writer with a fixed field order produces sequences that are
 * all subsequences of one total order, and the twelve are exactly that — **no
 * two exports contradict each other on any kind**, which is a measurement and
 * not an assumption: an export that did would leave that kind with no row to
 * derive. `IG77` in `selftest.ts` re-takes it from the files every run and prints
 * the counts: every object of every row's kind is in its row's order, and every
 * key an export writes for that kind is in the row.
 *
 * ⚠️ **Where the exports order a pair, the row is theirs; where they do not, it
 * is rigc's, and that is a choice rather than a measurement.** Two keys no
 * export object carries together have no measured order — a transform
 * constraint's `rotation` and `x`, an ik key's `time` and `mix` — and the row
 * places them the way `compile.ts` already emitted them at `af8b082`. So such a
 * pair does not move, and nothing here claims the editor agrees. The pairs that
 * are rigc's are: `animation` ik/transform/physics/attachments before
 * `drawOrder`; `ik constraint` `mix` before `bendPositive`; `ik key` `time`
 * before `mix`, `mix` before `softness`; `physics constraint` `x`, `y` before
 * `rotate`; `transform constraint` `rotation` before `x`, `localSource` and
 * `localTarget` before `mixRotate`, `mixRotate`, `mixX` before `mixY` before
 * `mixScaleX`; `transform key` `time` before `mixRotate` before `mixX`.
 *
 * ## What a row does not list
 *
 * - **A kind with no row keeps rigc's order whole.** Those are the kinds no
 *   export writes with two keys or more: a linked mesh, a path or point
 *   attachment, a sequence, the path and slider constraints, an event
 *   definition, and the keys of the `scalex`/`scaley`/`shearx`/`sheary`/
 *   `inherit`, `rgb`/`alpha`/`rgba2`/`rgb2`, `sequence`, path, slider and
 *   physics `reset`/`gravity`/`strength` timelines. Unmeasured is not
 *   certified, so they are left exactly as the constructors build them.
 * - **A key a row does not list keeps its own position.** A bone's `shearX`, a
 *   region's `name` and `path`, a header's `fps`: the row's keys are permuted
 *   among the places they occupy and every other key stays at the index the
 *   constructor gave it. ⚠️ The obvious alternative — unlisted keys after the
 *   listed ones — was rejected on a measured case: the editor wrote the 14
 *   physics `strength` keys of the corpus with `value` alone (every one at
 *   t=0), so that row would be `[value]` and `time`, which the editor writes
 *   first in every key kind the twelve carry it in, would be moved to the end.
 *   Rows of one key order nothing and are not rows.
 *
 * ## What is not a row, and why
 *
 * An object keyed by NAMES rather than fields — a bone's timelines, a slot's
 * timelines, a transform constraint's `properties` and each `to` — is not
 * reordered here, and for a reason the text cannot see: `SkeletonJson` builds an
 * animation's timelines in the order it iterates those maps, and two timelines
 * that write one property (`translate` and `translatex` on one bone) apply in
 * that order. Their order is the runtime's, so it is not a key's position, and
 * rigc already emits the export's own on all twelve (0 of 514 bone-timeline
 * maps differ). `animations`, `skins` and a skin's slot keys are the three
 * name-keyed collections the emitter sorts, and `compile.ts` owns all three.
 *
 * 🔒 Pure: no clock, no randomness, and the result depends only on each
 * object's own key set and the order the constructor built it in — which is
 * what `A18_DETERMINISTIC_EMIT` needs, and a second compile reproduces.
 */

/** One order per kind of object: the keys the editor writes, in the order it writes them. */
export type KeyOrderTable = Readonly<Record<string, readonly string[]>>;

/**
 * The editor's key order per kind, derived from the twelve exports (see the
 * header). A kind is named by where the object sits: `bone`, `region
 * attachment`, `ik constraint`, `bone rotate key` — `forEachKindedObject` is the
 * one place that names them.
 */
export const EDITOR_KEY_ORDER: KeyOrderTable = {
  'top level': ['skeleton', 'bones', 'slots', 'constraints', 'skins', 'events', 'animations'],
  header: ['hash', 'spine', 'x', 'y', 'width', 'height', 'images', 'audio'],
  bone: ['name', 'parent', 'length', 'rotation', 'x', 'y', 'scaleX', 'scaleY', 'inherit', 'color', 'icon'],
  slot: ['name', 'bone', 'color', 'attachment', 'blend'],
  'ik constraint': ['type', 'name', 'target', 'bones', 'mix', 'bendPositive'],
  'transform constraint': [
    'type',
    'name',
    'source',
    'bones',
    'rotation',
    'x',
    'y',
    'properties',
    'localSource',
    'localTarget',
    'mixRotate',
    'mixX',
    'mixY',
    'mixScaleX',
    'mixShearY',
  ],
  'physics constraint': ['type', 'name', 'bone', 'x', 'y', 'rotate', 'damping'],
  skin: ['name', 'attachments'],
  'region attachment': ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'width', 'height'],
  'mesh attachment': ['type', 'uvs', 'triangles', 'vertices', 'hull', 'edges', 'width', 'height'],
  'boundingbox attachment': ['type', 'vertexCount', 'vertices'],
  'clipping attachment': ['type', 'end', 'vertexCount', 'vertices', 'color'],
  animation: ['slots', 'bones', 'ik', 'transform', 'physics', 'attachments', 'drawOrder', 'events'],
  'bone rotate key': ['time', 'value', 'curve'],
  'bone translate key': ['time', 'x', 'y', 'curve'],
  'bone translatex key': ['time', 'value', 'curve'],
  'bone translatey key': ['time', 'value', 'curve'],
  'bone scale key': ['time', 'x', 'y', 'curve'],
  'bone shear key': ['time', 'x', 'y', 'curve'],
  'slot attachment key': ['time', 'name'],
  'slot rgba key': ['time', 'color', 'curve'],
  'ik key': ['time', 'mix', 'softness', 'bendPositive', 'curve'],
  'transform key': ['time', 'mixRotate', 'mixX', 'mixY', 'curve'],
  'physics damping key': ['time', 'value'],
  'physics inertia key': ['time', 'value'],
  'physics mass key': ['time', 'value'],
  'physics mix key': ['time', 'value', 'curve'],
  'physics wind key': ['time', 'value'],
  'attachment deform key': ['time', 'offset', 'vertices', 'curve'],
  'drawOrder key': ['time', 'offsets'],
  'drawOrder offset': ['slot', 'offset'],
  'event key': ['time', 'name'],
};

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function records(value: unknown): Rec[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

/** The animation groups that hold `<target>.<timeline> = keys[]`, and the word a key's kind is named by. */
const TIMELINE_FAMILIES: ReadonlyArray<readonly [group: string, family: string]> = [
  ['bones', 'bone'],
  ['slots', 'slot'],
  ['path', 'path'],
  ['physics', 'physics'],
  ['slider', 'slider'],
];

/** The groups where the constraint IS the timeline: `<group>.<constraint> = keys[]`. */
const CONSTRAINT_KEY_GROUPS: readonly string[] = ['ik', 'transform'];

/**
 * Visit every object of a Spine 4.3 skeleton file whose keys are FIELDS, with
 * the kind it is and where it sits — parents before their children.
 *
 * The kind is read off the object's position in the format, plus `type` where
 * the format branches on it (a constraint, an attachment). Name-keyed maps are
 * walked through and not visited: they are not a field order (see the header).
 */
export function forEachKindedObject(skeleton: unknown, visit: (kind: string, object: Rec, path: string) => void): void {
  if (!isRecord(skeleton)) return;
  visit('top level', skeleton, '');
  if (isRecord(skeleton.skeleton)) visit('header', skeleton.skeleton, '.skeleton');
  records(skeleton.bones).forEach((bone, i) => visit('bone', bone, `.bones[${i}]`));
  records(skeleton.slots).forEach((slot, i) => visit('slot', slot, `.slots[${i}]`));
  records(skeleton.constraints).forEach((constraint, i) =>
    visit(`${String(constraint.type)} constraint`, constraint, `.constraints[${i}]`),
  );
  records(skeleton.skins).forEach((skin, i) => {
    const at = `.skins[${i}]`;
    visit('skin', skin, at);
    if (!isRecord(skin.attachments)) return;
    for (const [slot, placeholders] of Object.entries(skin.attachments)) {
      if (!isRecord(placeholders)) continue;
      for (const [placeholder, attachment] of Object.entries(placeholders)) {
        if (!isRecord(attachment)) continue;
        const where = `${at}.attachments.${slot}.${placeholder}`;
        visit(`${typeof attachment.type === 'string' ? attachment.type : 'region'} attachment`, attachment, where);
        if (isRecord(attachment.sequence)) visit('sequence', attachment.sequence, `${where}.sequence`);
      }
    }
  });
  if (isRecord(skeleton.events)) {
    for (const [name, event] of Object.entries(skeleton.events)) if (isRecord(event)) visit('event', event, `.events.${name}`);
  }
  if (!isRecord(skeleton.animations)) return;
  for (const [name, animation] of Object.entries(skeleton.animations)) {
    if (!isRecord(animation)) continue;
    const at = `.animations.${name}`;
    visit('animation', animation, at);
    const timelines = (family: string, byTimeline: unknown, where: string): void => {
      if (!isRecord(byTimeline)) return;
      for (const [timeline, keys] of Object.entries(byTimeline)) {
        records(keys).forEach((key, i) => visit(`${family} ${timeline} key`, key, `${where}.${timeline}[${i}]`));
      }
    };
    for (const [group, family] of TIMELINE_FAMILIES) {
      const byTarget = animation[group];
      if (!isRecord(byTarget)) continue;
      for (const [target, byTimeline] of Object.entries(byTarget)) timelines(family, byTimeline, `${at}.${group}.${target}`);
    }
    for (const group of CONSTRAINT_KEY_GROUPS) {
      const byConstraint = animation[group];
      if (!isRecord(byConstraint)) continue;
      for (const [constraint, keys] of Object.entries(byConstraint)) {
        records(keys).forEach((key, i) => visit(`${group} key`, key, `${at}.${group}.${constraint}[${i}]`));
      }
    }
    if (isRecord(animation.attachments)) {
      for (const [skin, bySlot] of Object.entries(animation.attachments)) {
        if (!isRecord(bySlot)) continue;
        for (const [slot, byAttachment] of Object.entries(bySlot)) {
          if (!isRecord(byAttachment)) continue;
          for (const [attachment, byTimeline] of Object.entries(byAttachment)) {
            timelines('attachment', byTimeline, `${at}.attachments.${skin}.${slot}.${attachment}`);
          }
        }
      }
    }
    records(animation.drawOrder).forEach((key, i) => {
      visit('drawOrder key', key, `${at}.drawOrder[${i}]`);
      records(key.offsets).forEach((offset, j) => visit('drawOrder offset', offset, `${at}.drawOrder[${i}].offsets[${j}]`));
    });
    records(animation.events).forEach((key, i) => visit('event key', key, `${at}.events[${i}]`));
  }
}

/**
 * Put one object's keys in its row's order, in place: the keys the row lists are
 * permuted among the positions they hold, and every other key stays where it is.
 */
function arrange(object: Rec, rank: ReadonlyMap<string, number>): void {
  const keys = Object.keys(object);
  const listed = keys.filter((key) => rank.has(key)).sort((a, b) => rank.get(a)! - rank.get(b)!);
  let next = 0;
  const order = keys.map((key) => (rank.has(key) ? listed[next++] : key));
  if (order.every((key, i) => key === keys[i])) return;
  const entries = order.map((key) => [key, object[key]] as const);
  for (const key of keys) delete object[key];
  for (const [key, value] of entries) object[key] = value;
}

/**
 * Every object of `skeleton` whose kind has a row, put into that row's order —
 * in place, and returned. `table` is a parameter so the selftest can hand it a
 * row reversed and watch its own check go red; the emitter passes nothing.
 */
export function inEditorKeyOrder<T extends object>(skeleton: T, table: KeyOrderTable = EDITOR_KEY_ORDER): T {
  const ranks = new Map<string, ReadonlyMap<string, number>>();
  forEachKindedObject(skeleton, (kind, object) => {
    const row = table[kind];
    if (row === undefined) return;
    let rank = ranks.get(kind);
    if (rank === undefined) {
      rank = new Map(row.map((key, i) => [key, i]));
      ranks.set(kind, rank);
    }
    arrange(object, rank);
  });
  return skeleton;
}

// ---------------------------------------------------------------------------
// the keys the 4.3 parser reads back the same way without them (#716 tranche 3)
// ---------------------------------------------------------------------------
//
// The editor writes a key only when its value is not the one `SkeletonJson`
// reads in its absence, and rigc wrote every key it was given. Measured at
// `d48c505` over the twelve editor exports under `examples/`: **2,338** keys of
// the rebuilds stated a value the export leaves to the parser — `time: 0` on a
// first key, a rotate key's `value: 0`, a scale key's `x: 1`, an ik key's
// `mix: 1` — and **87** attachment keys wrote `"name": null`. Each one loads
// the same `SkeletonData` with the key and without it, which is why no parse
// and no gate could see any of them.
//
// ## Why this is a table and not a parse
//
// The parser is the only authority on what a default is, and this table is
// not a second one: it is a transcription the selftest holds to the parser row
// by row (`S103` on the in-tree builds, `IG82` on the corpus) by loading an
// object of each kind with the key at the row's value and without it, and
// comparing everything `SkeletonData` holds — and then one float32 step off,
// which must differ. It cannot BE a parse: `compile.ts` must not link the
// runtime (`CLAUDE.md` *Conventions*, held by `CUR07`), and an emitter that
// asked the parser what to write would be the gate answering its own question.
//
// ## What a row holds
//
// - a **constant**: the value `getValue(map, key, default)` falls back to. A
//   colour row is `ffffffff` because the parser leaves the colour white when
//   the key is absent; a mode is spelled the way rigc spells it (`normal`,
//   `percent`), which `Utils.enumValue` reads alike with either first letter.
// - `{ field, only }`: another field of the same object, as the parser reads it
//   — a transform key's `mixY` falls back to its own `mixX`, which falls back to
//   1 — and, with `only`, the one value at which the key is left out. `only` is
//   the editor's, measured: `sack-pro` writes `mixX: 0, mixY: 0` on six
//   transform keys where the parser would read an absent `mixY` as that same
//   `0`, and omits both where both are `1`. So `mixY` is left out only where it
//   is `1` AND `mixX` reads `1` — the two rules' intersection, which is always
//   a key the parser reads back the same and never one the editor writes.
// - `{ previous, first }`: the same field of the timeline's previous key, and
//   `first` on key 0 — a sequence key's `delay` is the parser's `lastDelay`.
//
// ⚠️ **A kind with no row keeps every key, and so does a key its row does not
// list.** A row is here only when an object of its kind is in a build the
// selftest loads, because a row nothing loads is a claim about the parser
// nobody has checked, and a wrong one changes a loaded value in silence — where
// a missing one costs a key the parser reads the same either way. `S101` is what
// finds a missing one: it deletes every key of every in-tree build in turn and
// names each the parser reads back unchanged.
//
// ⚠️ **Not rows, on purpose:** a transform CONSTRAINT's `mixY` and
// `mixScaleY`. Their fallback is `setup.mixX` / `setup.mixScaleX`, and the
// parser reads those only for a property the constraint drives — so on a
// constraint that drives `y` and not `x` the fallback is the pose's own initial
// `0` (`TransformConstraintPose.js:34`), not `mixX`'s `1`. A `{ field }` row
// there was measured wrong on the corpus: it dropped `8-follow-through-pro-
// ball`'s `mixY: 1` on two constraints that drive `y` alone, they loaded at
// `mixY: 0`, and `A48` refused the build. A transform KEY reads every mix
// unconditionally, so its `mixY` row stands. Also not rows: the header's `x`, `y` and `fps`
// (`SkeletonJson.js:70` assigns them raw, so an absent origin loads as
// `undefined` rather than `0` — there is no parser default for it to equal);
// a region's `path` and an attachment's `name` (their fallbacks are the
// attachment's own name and placeholder, which rigc writes only where they
// differ); an event key's payload (its fallback is its event definition's, a
// value held in another object). And two fallbacks the parser does have but
// nothing here can load: a slider's `time`, read only on a slider with no
// `bone` (no build or export carries one), and a sequence's `digits: 0`, which
// no atlas a build resolves against can be read with — the frame names change
// with it and the parse throws either way. Both are written as stated.
//
// 🔒 Pure, and a function of each object's keys and values alone, so
// `A18_DETERMINISTIC_EMIT` still compares two identical texts.

/** A field's value where it is absent, as the 4.3 parser reads it. */
export type ParserDefault =
  | number
  | boolean
  | string
  | null
  | { readonly field: string; readonly only?: number }
  | { readonly previous: string; readonly first: number };

/** One row per kind of object: each field whose absence the parser reads as a value, and that value. */
export type ParserDefaultTable = Readonly<Record<string, Readonly<Record<string, ParserDefault>>>>;

const TIME_ONLY: Readonly<Record<string, ParserDefault>> = { time: 0 };
const VALUE_AT_ZERO: Readonly<Record<string, ParserDefault>> = { time: 0, value: 0 };
const VALUE_AT_ONE: Readonly<Record<string, ParserDefault>> = { time: 0, value: 1 };

/**
 * The 4.3 parser's defaults, per kind of object — see the header above. Each
 * is a `getValue` fallback of `SkeletonJson.js` in the linked `spine-core`, and
 * the selftest loads every one of them rather than believing this list.
 */
export const PARSER_DEFAULTS: ParserDefaultTable = {
  header: { referenceScale: 100 },
  bone: {
    length: 0,
    rotation: 0,
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    shearX: 0,
    shearY: 0,
    inherit: 'normal',
    skin: false,
    iconSize: 1,
    iconRotation: 0,
  },
  slot: { color: 'ffffffff', attachment: null, blend: 'normal', visible: true },
  'ik constraint': { skin: false, mix: 1, softness: 0, bendPositive: true, compress: false, stretch: false },
  'transform constraint': {
    skin: false,
    localSource: false,
    localTarget: false,
    additive: false,
    clamp: false,
    rotation: 0,
    x: 0,
    y: 0,
    scaleX: 0,
    scaleY: 0,
    shearY: 0,
    mixRotate: 1,
    mixX: 1,
    mixScaleX: 1,
    mixShearY: 1,
  },
  'path constraint': {
    skin: false,
    positionMode: 'percent',
    spacingMode: 'length',
    rotateMode: 'tangent',
    rotation: 0,
    position: 0,
    spacing: 0,
    mixRotate: 1,
    mixX: 1,
    mixY: { field: 'mixX', only: 1 },
  },
  'physics constraint': {
    skin: false,
    x: 0,
    y: 0,
    rotate: 0,
    scaleX: 0,
    shearX: 0,
    limit: 5000,
    fps: 60,
    inertia: 0.5,
    strength: 100,
    damping: 0.85,
    mass: 1,
    wind: 0,
    gravity: 0,
    mix: 1,
    inertiaGlobal: false,
    strengthGlobal: false,
    dampingGlobal: false,
    massGlobal: false,
    windGlobal: false,
    gravityGlobal: false,
    mixGlobal: false,
  },
  'slider constraint': { skin: false, additive: false, loop: false, mix: 1, from: 0, to: 0, scale: 1, max: 0, local: false },
  'region attachment': { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, color: 'ffffffff' },
  'mesh attachment': { color: 'ffffffff', hull: 0, width: 0, height: 0 },
  'path attachment': { closed: false, constantSpeed: true },
  'clipping attachment': { convex: false, inverse: false },
  sequence: { start: 1, setup: 0 },
  event: { int: 0, float: 0, string: '', audio: null },
  'bone rotate key': VALUE_AT_ZERO,
  'bone translate key': { time: 0, x: 0, y: 0 },
  'bone translatex key': VALUE_AT_ZERO,
  'bone translatey key': VALUE_AT_ZERO,
  'bone scale key': { time: 0, x: 1, y: 1 },
  'bone scalex key': VALUE_AT_ONE,
  'bone scaley key': VALUE_AT_ONE,
  'bone shear key': { time: 0, x: 0, y: 0 },
  'slot attachment key': { time: 0, name: null },
  'slot rgba key': TIME_ONLY,
  'ik key': { time: 0, mix: 1, softness: 0, bendPositive: true, compress: false, stretch: false },
  'transform key': { time: 0, mixRotate: 1, mixX: 1, mixY: { field: 'mixX', only: 1 }, mixScaleX: 1, mixScaleY: 1, mixShearY: 1 },
  'path position key': VALUE_AT_ZERO,
  'physics damping key': VALUE_AT_ZERO,
  'physics inertia key': VALUE_AT_ZERO,
  'physics mass key': VALUE_AT_ZERO,
  'physics strength key': VALUE_AT_ZERO,
  'physics wind key': VALUE_AT_ZERO,
  'physics mix key': VALUE_AT_ONE,
  'attachment deform key': { time: 0, offset: 0 },
  'attachment sequence key': { time: 0, index: 0, mode: 'hold', delay: { previous: 'delay', first: 0 } },
  'drawOrder key': TIME_ONLY,
  'event key': TIME_ONLY,
};

/** `….rotate[3]` → its stem and 3; anything that does not end in an index → null. */
function trailingIndex(path: string): { stem: string; index: number } | null {
  const m = /^(.*)\[(\d+)\]$/.exec(path);
  return m === null ? null : { stem: m[1], index: Number(m[2]) };
}

/** An object a row is read on, and — for a timeline key — the key before it. */
export interface ParserReadingSite {
  readonly object: Readonly<Record<string, unknown>>;
  /** The timeline's previous key; null on key 0 and on anything that is not a timeline key. */
  readonly previous: () => ParserReadingSite | null;
}

/**
 * What the parser reads for `field` at `site`: the value written, or the row's
 * where it is absent — `undefined` when the row does not list the field and it
 * is absent.
 */
export function parserReading(row: Readonly<Record<string, ParserDefault>>, site: ParserReadingSite, field: string): unknown {
  if (field in site.object) return site.object[field];
  const rule = row[field];
  if (rule === undefined || rule === null || typeof rule !== 'object') return rule;
  if ('field' in rule) return parserReading(row, site, rule.field);
  const previous = site.previous();
  return previous === null ? rule.first : parserReading(row, previous, rule.previous);
}

/**
 * Whether the emitter leaves `field` out of the object at `site`: it is
 * written, its row lists it, and the parser reads the same value without it —
 * at the row's `only` value, where the row has one. The one decision, shared by
 * the pass below and by `ingest`, which says a restated default out loud only
 * where this would still write it.
 */
export function parserOmits(row: Readonly<Record<string, ParserDefault>>, site: ParserReadingSite, field: string): boolean {
  if (!(field in site.object)) return false;
  const rule = row[field];
  if (rule === undefined) return false;
  const value = site.object[field];
  if (rule !== null && typeof rule === 'object' && 'field' in rule && rule.only !== undefined && !Object.is(value, rule.only)) {
    return false;
  }
  const without: Rec = { ...site.object };
  delete without[field];
  return Object.is(parserReading(row, { object: without, previous: site.previous }, field), value);
}

/**
 * Every key of `skeleton` whose value is the one the 4.3 parser reads in its
 * absence, removed — in place, and returned. Each is decided against the object
 * as its constructor built it, before anything is removed, so a `{ field }` or
 * `{ previous }` row reads exactly what the parser will. `table` is a parameter
 * so the selftest can plant a wrong row; the emitter passes nothing.
 */
export function withoutParserDefaults<T extends object>(skeleton: T, table: ParserDefaultTable = PARSER_DEFAULTS): T {
  const byPath = new Map<string, Rec>();
  const siteAt = (path: string, object: Rec): ParserReadingSite => ({
    object,
    previous: () => {
      const at = trailingIndex(path);
      if (at === null || at.index === 0) return null;
      const stem = `${at.stem}[${at.index - 1}]`;
      const before = byPath.get(stem);
      return before === undefined ? null : siteAt(stem, before);
    },
  });
  const removed: Array<{ object: Rec; field: string }> = [];
  forEachKindedObject(skeleton, (kind, object, path) => {
    byPath.set(path, object);
    const row = table[kind];
    if (row === undefined) return;
    const site = siteAt(path, object);
    for (const field of Object.keys(row)) if (parserOmits(row, site, field)) removed.push({ object, field });
  });
  for (const { object, field } of removed) delete object[field];
  return skeleton;
}
