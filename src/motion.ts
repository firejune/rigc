/**
 * Reading a motion spec — the parse the motion spec did not have.
 *
 * The rig spec has had `parseRigSpec` since it stopped being three hard-coded
 * tables; the motion spec reached `compile` as `readJson<MotionSpec>(path)`, a
 * CAST, so its declared type said what a correct file holds and not what the one
 * on disk does. Issue #307. The compiler's own comment named the consequence out
 * loud, at the one field that had since grown a guard of its own (#293/#303):
 * `setup: { "lid_l": "plate" }` — the attachment name written where its wrapper
 * belongs — compiled **green** and hid the slot, which is the opposite of what
 * was asked and is stated nowhere. That guard is now here, and it now covers
 * every key in the table rather than the ones the emit loop happened to reach.
 *
 * ## What lives here, and what stays in `compile`
 *
 * The split is **shape versus meaning**, and it is a split about what each layer
 * can see rather than a ranking of the checks:
 *
 *   - **here** — is this a number, a string, an array, an object; is a required
 *     field present; is a structure the structure the format describes. Answerable
 *     from the motion file ALONE, which is why it can run at load and why the
 *     rest of the compiler is allowed to assume its inputs from then on.
 *   - **in `compile`** — does this name resolve against the rig spec, is this bone
 *     in that group, does this key's value have the right number of channels for
 *     its property, does this `derive` have a projection onto this axis, is the
 *     last key allowed to carry an easing. Every one of those needs something the
 *     motion file does not contain: the rig, the property table, or the key's
 *     position in its own track.
 *
 * 🚨 **The failure this split is drawn to avoid is two layers refusing one thing
 * under two names**, which makes the error output contradict itself. So a guard
 * the parser makes unreachable was DELETED from `compile` rather than left as a
 * second opinion — the version tag, the `setup` entry shape, the three
 * `non-finite time` guards, the `ik`/`transform`/`deform` array-and-name guards.
 * Where a compile guard is still reachable it stays: `checkKeyTime` still catches
 * a key genuinely past its duration, `rgbaHex` still counts the channels of an
 * `rgba` track key, and the group `v`-map / `derive` refusals (#320,
 * `src/trackgen.ts`) are untouched — every one of them reads the group's member
 * list or the property's projection table, neither of which is in this file.
 *
 * ## Unknown keys are NOT refused, because `parseRigSpec` does not refuse them
 *
 * ⚠️ A misspelled optional field is therefore still silent — `"easing"` for
 * `"ease"` plays linear and says nothing. Refusing by name would be the better
 * behaviour in isolation and this repository usually prefers it; it is not done
 * because the rig parser sets the house rule for what a spec parser is, and one
 * of the two formats refusing a stray key while the other shrugs is a worse
 * surprise than the stray key. (The 37 motion specs in the repository carry no
 * undeclared key at any level, so the option stays open at no migration cost.)
 */
import { CompileError } from './errors.ts';
import type { MotionSpec } from './types.ts';

export const MOTION_SPEC_VERSION = 'rigc-motion/1';

/**
 * The six fields that pick a track's target family. Listed here as well as in
 * `compile`'s `resolveTargets` because the two ask different questions of it:
 * this one asks whether each is a string, that one asks whether exactly one is
 * present and what it resolves to.
 */
const TARGET_FIELDS = ['slot', 'group', 'bone', 'physics', 'path', 'slider'] as const;

/** Every numeric field of a `physics` table entry — `bone` and `note` are not numbers. */
const PHYSICS_NUMBERS = [
  'x',
  'y',
  'rotate',
  'scaleX',
  'shearX',
  'inertia',
  'strength',
  'damping',
  'mass',
  'wind',
  'gravity',
  'mix',
  'fps',
  'limit',
] as const;

/** The two animation-level constraint families, which share one entry shape. */
const CONSTRAINT_GROUPS = ['ik', 'transform'] as const;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * What a value actually IS, for a refusal to name.
 *
 * The generalisation of `describeSetupEntry`, whose wording it keeps verbatim for
 * the three shapes that one covered — those exact strings are what issue #293's
 * refusal reads like and what the selftest pins.
 */
function describe(v: unknown): string {
  if (v === undefined) return 'absent';
  if (v === null) return 'null';
  if (Array.isArray(v)) return `an array of ${v.length}`;
  if (typeof v === 'string') return `the string ${JSON.stringify(v)}`;
  if (typeof v === 'number' || typeof v === 'boolean') return `${String(v)}`;
  // "a object" is what `describeSetupEntry` printed; the article is worth a line
  // because these messages are read far more often than they are written.
  return `${typeof v === 'object' ? 'an' : 'a'} ${typeof v}`;
}

/**
 * The one refusal shape in this file: **file, key, what it actually is, and the
 * spelling that works.** Every message below is built from it, so a reader who
 * has seen one has seen the format.
 */
function refuse(where: string, key: string, is: unknown, hint: string): never {
  throw new CompileError(`${where}: \`${key}\` is ${describe(is)}; ${hint}`);
}

// --- the leaf checks, each returning the value it just proved ---------------

function needObj(v: unknown, where: string, key: string, hint: string): Record<string, unknown> {
  if (!isObj(v)) refuse(where, key, v, hint);
  return v;
}

function needArray(v: unknown, where: string, key: string, hint: string): unknown[] {
  if (!Array.isArray(v)) refuse(where, key, v, hint);
  return v;
}

function needString(v: unknown, where: string, key: string, hint: string): string {
  if (typeof v !== 'string' || v.length === 0) refuse(where, key, v, hint);
  return v;
}

function optString(v: unknown, where: string, key: string, hint: string): void {
  if (v !== undefined && typeof v !== 'string') refuse(where, key, v, hint);
}

function needFinite(v: unknown, where: string, key: string, hint: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) refuse(where, key, v, hint);
  return v;
}

function optFinite(v: unknown, where: string, key: string, hint: string): void {
  if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v))) refuse(where, key, v, hint);
}

/**
 * A named easing's handles: four finite numbers, and nothing else.
 *
 * ⭐ The most silent field in the format before this parse existed. `easings` is
 * read only through `bezierForChannel`, which destructures four values with no
 * guard at all — so `[0.42, 0, 0.58]` emitted `"curve": [0.42, 0, 0.58, null]`
 * into the artifact, and a `"x"` in one slot emitted a `NaN` the round trip
 * turns into `null` too. Neither is a curve, both loaded, and nothing said so.
 */
function parseEasings(raw: unknown, where: string): void {
  const easings = needObj(raw, where, 'easings', 'it is a table of named handles, `{ "<name>": [hx1, hy1, hx2, hy2] }` (write `{}` if this spec names none)');
  for (const [name, handles] of Object.entries(easings)) {
    const key = `easings."${name}"`;
    const hint =
      'a named easing is FOUR finite numbers — the graph-view handles [hx1, hy1, hx2, hy2]. ' +
      'Nothing downstream counts them, so a short or non-numeric array reaches the artifact as a curve with a `null` in it';
    const arr = needArray(handles, where, key, hint);
    if (arr.length !== 4) refuse(where, key, arr, hint);
    for (const [i, n] of arr.entries()) needFinite(n, where, `${key}[${i}]`, hint);
  }
}

/**
 * `setup` — the entry-shape guard of #293/#303, moved here and widened.
 *
 * 🚨 The guard used to live in the emit loop, which walks the RIG's slots and
 * `continue`s past a slot with no attachments before it ever reads `setup`. So
 * two corners of the very shape it was written for stayed green: a `setup` entry
 * for a slot the rig declares without attachments, and one for a slot the rig
 * does not declare at all. Both are the reader's most likely spelling of the
 * mistake — you write the entry, and the slot it names is exactly the one you
 * have not finished wiring up. Parsing the table on its own terms has no such
 * blind spot: every key is checked, and whether the rig knows the slot is a
 * separate question `compile` still asks.
 */
function parseSetup(raw: unknown, where: string): void {
  if (raw === undefined) return;
  const setup = needObj(raw, where, 'setup', 'it is a table keyed by slot name, `{ "<slot>": { "attachment": … } }`');
  for (const [slot, entry] of Object.entries(setup)) {
    const key = `setup."${slot}"`;
    if (!isObj(entry)) {
      refuse(
        where,
        key,
        entry,
        'a setup entry is an object of `{ attachment?: string | null, color?: [r, g, b, a] }` — to show nothing ' +
          `there write \`"${slot}": { "attachment": null }\`, and to show an attachment write ` +
          `\`"${slot}": { "attachment": "<name>" }\``,
      );
    }
    if (entry.attachment !== undefined && entry.attachment !== null && typeof entry.attachment !== 'string') {
      refuse(where, `${key}.attachment`, entry.attachment, 'it is an attachment name, or null for "show nothing"');
    }
    if (entry.color !== undefined) {
      const hint = 'a setup colour is [r, g, b, a], four finite numbers in 0..1 — a channel that is not one is clamped to `NaN` and written into the slot as the text "NaN"';
      const color = needArray(entry.color, where, `${key}.color`, hint);
      if (color.length !== 4) refuse(where, `${key}.color`, color, hint);
      for (const [i, n] of color.entries()) {
        const at = `${key}.color[${i}]`;
        needFinite(n, where, at, hint);
        if ((n as number) < 0 || (n as number) > 1) refuse(where, at, n, hint);
      }
    }
  }
}

/**
 * `physics` — the tuning table.
 *
 * Every field but `bone` and `note` goes straight into `r6`, which is NaN in and
 * NaN out, and the emitter writes that NaN as `null`: `"mass": "heavy"` shipped
 * `"mass": null` in the constraint, which the runtime reads as zero mass. A
 * constraint with zero mass is assertion A23's own example of one that never
 * settles, and it arrived without a word from either layer.
 */
function parsePhysics(raw: unknown, where: string): void {
  if (raw === undefined) return;
  const table = needObj(raw, where, 'physics', 'it is a table keyed by constraint name, `{ "<name>": { "bone": … } }`');
  for (const [name, entry] of Object.entries(table)) {
    const key = `physics."${name}"`;
    const spec = needObj(entry, where, key, 'a physics constraint is an object naming the bone it drives and the components it drives it in');
    needString(spec.bone, where, `${key}.bone`, 'a physics constraint drives one bone, named here');
    for (const field of PHYSICS_NUMBERS) {
      optFinite(spec[field], where, `${key}.${field}`, 'every tuning field of a physics constraint is a finite number — a non-number is rounded to `NaN` and emitted as `null`, which the runtime reads as zero');
    }
    optString(spec.note, where, `${key}.note`, 'it is prose for a reader');
  }
}

/**
 * `mix` — the player-side `AnimationStateData` config.
 *
 * Not emitted into skeleton JSON, which is why nothing had ever looked at it:
 * `{ "default": "fast" }` passed the compiler, the gate and the round trip, and
 * became a `NaN` mix duration in whatever player read the spec.
 */
function parseMix(raw: unknown, where: string): void {
  if (raw === undefined) return;
  const mix = needObj(raw, where, 'mix', 'it is `{ "default": <seconds>, "pairs"?: [["<from>", "<to>", <seconds>], …] }`');
  needFinite(mix.default, where, 'mix.default', 'the default mix duration is a finite number of seconds');
  if (mix.pairs === undefined) return;
  const pairs = needArray(mix.pairs, where, 'mix.pairs', 'it is an array of `["<from>", "<to>", <seconds>]` triples');
  for (const [i, pair] of pairs.entries()) {
    const key = `mix.pairs[${i}]`;
    const hint = 'a mix pair is `["<from animation>", "<to animation>", <seconds>]` — three entries, two names and a duration';
    const triple = needArray(pair, where, key, hint);
    if (triple.length !== 3) refuse(where, key, triple, hint);
    needString(triple[0], where, `${key}[0]`, hint);
    needString(triple[1], where, `${key}[1]`, hint);
    needFinite(triple[2], where, `${key}[2]`, hint);
  }
}

/**
 * A key's `t`, for every key family there is.
 *
 * ⭐ One owner for one question. `events`, `ik`/`transform` and `deform` each
 * grew their own `has a non-finite time` guard as they were added and the three
 * families that came first — value tracks, slot tracks, `drawOrder` — never got
 * one, so `{ "t": "0" }` on a `rotate` track reached the emitted JSON as a `NaN`
 * time. The three guards in `compile` are gone: they can no longer fire.
 */
function parseKeyTime(key: Record<string, unknown>, where: string, at: string): void {
  needFinite(key.t, where, `${at}.t`, 'a key states its time in seconds, as a finite number');
}

function parseKeyEasing(key: Record<string, unknown>, where: string, at: string): void {
  optString(key.ease, where, `${at}.ease`, 'it names an entry of this spec\'s `easings` table, or is "stepped"');
}

/** One `{ t, … }` key of any family: an object, with a finite time and a string `ease`. */
function parseKey(raw: unknown, where: string, at: string, hint: string): Record<string, unknown> {
  const key = needObj(raw, where, at, hint);
  parseKeyTime(key, where, at);
  parseKeyEasing(key, where, at);
  return key;
}

function parseTracks(raw: unknown, where: string, at: string): void {
  const tracks = needArray(raw, where, `${at}.tracks`, 'it is an array of `{ <target>, property, keys }` tracks (write `[]` for an animation whose timelines are all in the families beside it)');
  for (const [i, entry] of tracks.entries()) {
    const key = `${at}.tracks[${i}]`;
    const track = needObj(entry, where, key, 'a track is an object naming one target, one property and its keys');
    needString(track.property, where, `${key}.property`, 'a track states the property it keys — the table is AUTHORING §4.4');
    for (const field of TARGET_FIELDS) {
      optString(track[field], where, `${key}.${field}`, `a track's "${field}" is the name of the ${field === 'slot' || field === 'bone' ? field : `${field} it targets`}`);
    }
    optFinite(track.lag, where, `${key}.lag`, '"lag" is seconds added to every key time of this track, so a finite number — a string is CONCATENATED onto each time and a boolean adds 1');
    optFinite(track.stagger, where, `${key}.stagger`, '"stagger" is the extra per-member delay inside a group, in seconds, so a finite number');
    const keys = needArray(track.keys, where, `${key}.keys`, 'it is an array of `{ t, v }` keys');
    for (const [j, k] of keys.entries()) parseKey(k, where, `${key}.keys[${j}]`, 'a key is an object of `{ t, v, … }`');
  }
}

function parseConstraintTracks(raw: unknown, where: string, at: string, group: (typeof CONSTRAINT_GROUPS)[number]): void {
  if (raw === undefined) return;
  const entries = needArray(raw, where, `${at}.${group}`, `it is an array of \`{ "constraint": "<name>", "keys": [...] }\` entries — one per ${group} constraint`);
  for (const [i, entry] of entries.entries()) {
    const key = `${at}.${group}[${i}]`;
    const track = needObj(entry, where, key, `${group === 'ik' ? 'an ik' : 'a transform'} timeline is an object of \`{ constraint, keys }\``);
    needString(track.constraint, where, `${key}.constraint`, `4.3 writes this group as \`${group}.<constraint>\`, so the constraint name is the only target there is`);
    const keys = needArray(track.keys, where, `${key}.keys`, 'it is an array of keys, each naming the same set of mix fields');
    for (const [j, k] of keys.entries()) parseKey(k, where, `${key}.keys[${j}]`, `a ${group} key is an object of \`{ t, … }\``);
  }
}

function parseDeform(raw: unknown, where: string, at: string): void {
  if (raw === undefined) return;
  const entries = needArray(raw, where, `${at}.deform`, 'it is an array of `{ slot, attachment, keys }` entries — one per skin/slot/attachment triple');
  for (const [i, entry] of entries.entries()) {
    const key = `${at}.deform[${i}]`;
    const track = needObj(entry, where, key, 'a deform timeline is an object of `{ skin?, slot, attachment, keys }`');
    optString(track.skin, where, `${key}.skin`, 'it names the skin the attachment lives in; absent means "default"');
    needString(track.slot, where, `${key}.slot`, 'a deform timeline keys one attachment of one slot, named here');
    needString(track.attachment, where, `${key}.attachment`, "it is the attachment's placeholder name inside that skin and slot");
    const keys = needArray(track.keys, where, `${key}.keys`, 'it is an array of keys, each a sparse edit of the setup geometry');
    for (const [j, k] of keys.entries()) parseKey(k, where, `${key}.keys[${j}]`, 'a deform key is an object of `{ t, vertices? | transform? }`');
  }
}

function parseEvents(raw: unknown, where: string, at: string): void {
  if (raw === undefined) return;
  const keys = needArray(raw, where, `${at}.events`, 'it is an array of `{ t, name }` firings — one timeline per animation, naming no target');
  for (const [i, k] of keys.entries()) parseKey(k, where, `${at}.events[${i}]`, 'an event key is an object of `{ t, name, … }`');
}

/**
 * `drawOrder`.
 *
 * ⚠️ The quiet one is `offsets`: `readDrawOrder` treats a key with no offsets as
 * "restore the setup order", and `compile` tested that with `!key.offsets?.length`
 * — which is true for `{}` and for a string, so a malformed `offsets` silently
 * became a restore key. That is a complete statement of the draw order made by
 * accident.
 */
function parseDrawOrder(raw: unknown, where: string, at: string): void {
  if (raw === undefined) return;
  const keys = needArray(raw, where, `${at}.drawOrder`, 'it is an array of `{ t, offsets? }` keys — one timeline per animation, naming no target');
  for (const [i, entry] of keys.entries()) {
    const key = `${at}.drawOrder[${i}]`;
    const dk = parseKey(entry, where, key, 'a draw-order key is an object of `{ t, offsets? }`');
    if (dk.offsets === undefined) continue;
    const offsets = needArray(
      dk.offsets,
      where,
      `${key}.offsets`,
      'it is an array of `{ slot, offset }` moves. Omit the field entirely to restore the setup draw order — a malformed one used to BE that restore key, silently',
    );
    for (const [j, o] of offsets.entries()) {
      const oat = `${key}.offsets[${j}]`;
      const off = needObj(o, where, oat, 'one moved slot is `{ "slot": "<name>", "offset": <places later> }`');
      needString(off.slot, where, `${oat}.slot`, 'it names the slot this key moves');
      // The TYPE only. Whether it is a whole number, and whether it lands inside
      // the emitted slots array, are `compile`'s — both need the slot table.
      needFinite(off.offset, where, `${oat}.offset`, 'it is how many places later the slot is drawn, so a number (negative moves it earlier)');
    }
  }
}

function parseAnimation(raw: unknown, where: string, name: string): void {
  const at = `animations."${name}"`;
  const anim = needObj(raw, where, at, 'an animation is an object of `{ duration, tracks, … }`');
  const duration = needFinite(anim.duration, where, `${at}.duration`, 'an animation declares its duration in seconds, as a finite number — it is checked against the compiled last key (rule R7), and a comparison against a non-number is silently false');
  if (duration < 0) {
    refuse(where, `${at}.duration`, duration, 'a duration is a length of time, so it is not negative');
  }
  // ⚠️ Optional, and the type used to say otherwise: 20 of the 37 motion specs
  // in this repository declare no `loop` at all. It is a player hint that is not
  // expressible in skeleton JSON, so an absent one costs the artifact nothing —
  // requiring it here would have refused most of the benchmark corpus.
  if (anim.loop !== undefined && typeof anim.loop !== 'boolean') {
    refuse(where, `${at}.loop`, anim.loop, 'it is a player hint, so true or false (absent means the player decides)');
  }
  optString(anim.note, where, `${at}.note`, 'it is prose for a reader');
  parseTracks(anim.tracks, where, at);
  for (const group of CONSTRAINT_GROUPS) parseConstraintTracks(anim[group], where, at, group);
  parseDeform(anim.deform, where, at);
  parseDrawOrder(anim.drawOrder, where, at);
  parseEvents(anim.events, where, at);
}

/**
 * Parse and check a motion spec, then hand back a typed one.
 *
 * `where` is the file's own path and every message begins with it, for the reason
 * `parseRigSpec` does the same: a reader with two input files and one error has
 * otherwise no way to tell which of them is at fault (issue #227).
 */
export function parseMotionSpec(raw: unknown, where: string): MotionSpec {
  if (!isObj(raw)) {
    throw new CompileError(`${where}: a motion spec must be a JSON object, and this file holds ${describe(raw)}`);
  }
  if (raw.spec !== MOTION_SPEC_VERSION) {
    throw new CompileError(`${where}: unknown motion spec version: ${String(raw.spec)}, expected "${MOTION_SPEC_VERSION}"`);
  }
  needString(raw.archetype, where, 'archetype', "it names the rig this spec was authored against, and must equal that rig spec's own `name`");
  needString(raw.cut, where, 'cut', 'it names the cut these keys were authored for');
  optString(raw.note, where, 'note', 'it is prose for a reader');

  parseEasings(raw.easings, where);
  // `groups` — the parser proves the TABLE is a table; `checkMotionGroups` owns
  // each entry's member list, because what it refuses (an empty group, a repeated
  // member) is about what a track naming it would compile, not about JSON shape.
  if (raw.groups !== undefined) {
    needObj(raw.groups, where, 'groups', 'it is a table keyed by group name, `{ "<group>": ["<member>", …] }`');
  }
  parseSetup(raw.setup, where);
  parsePhysics(raw.physics, where);
  parseMix(raw.mix, where);

  const animations = needObj(raw.animations, where, 'animations', 'it is a table keyed by animation name, `{ "<name>": { "duration": …, "tracks": [...] } }` (write `{}` for a static rig)');
  for (const [name, anim] of Object.entries(animations)) {
    if (name.length === 0) throw new CompileError(`${where}: an animation has an empty name`);
    parseAnimation(anim, where, name);
  }

  return raw as unknown as MotionSpec;
}
