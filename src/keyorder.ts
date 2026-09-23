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
