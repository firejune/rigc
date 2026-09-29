/**
 * Construct 5 of the core, third cut (issue #938, step 2e-iii of issue
 * #380): the slider constraint at the setup pose and at a sample time, with
 * its timelines. A slider applies an animation — the one constraint kind
 * that writes bones' LOCAL values and slots rather than a world transform.
 *
 * Every rule below was measured by posing hand-written skeletons through
 * `tools/pose_oracle.ts dump` (spine-core 4.3.13, `--skin all`,
 * `--physics none`) and reading the rows back — a bone's local values through
 * `localSource` transform constraints written onto spare bones, a slot's row
 * as the dump prints it — then held at tolerance 0 by the core suite's `CQ`
 * controls. Nothing here was written from the runtime's source.
 *
 * ## Where it stands: the update order
 *
 * A slider is one more constraint in the document's order (`./constraints.ts`,
 * *The update order*): it reads its dial bone as the constraints before it
 * left it, writes the local values of the bones its animation keys, and those
 * bones and everything below them are posed again before the next
 * constraint. The runtime's setup pose and every sample apply it: at setup
 * the sliders compose on the setup pose; at a sample on the pose the sample's
 * own animation left (applied at alpha 1 from the setup pose, construct 4),
 * so **the sample's animation first, then each slider in constraint order**.
 *
 * ## The time it applies its animation at
 *
 * - **Bone-less**: the slider's `time` (a `slider` timeline's `time` key at a
 *   sample), as it is: a negative time is a time before the animation's keys.
 * - **With a `bone`**: `to + (value − from) · scale`, `value` the dial's
 *   `property` read exactly as a transform constraint reads its source with
 *   no offset (`sourceValue` in `./constraints.ts`): `local` the local field
 *   as earlier constraints left it, unwrapped; world `rotate` the x column's
 *   angle brought into [0, 360); world `x`, `y` the origin; world `scaleX`,
 *   `scaleY` the column lengths; world `shearY` the angle between the columns
 *   less 90. Measured on a dial under a parent turned 30° and scaled 2 in x:
 *   a local 10° at `scale` 0.01 read time 0.1, a world 10° read 0.350384 (the
 *   x column at 35.0384°), a world −50° read 359.21° (0.35921 at 0.001).
 *   Then `max(0, time)` — a dial at −50° applied the first frame — or, with
 *   `loop`, `duration + (time mod duration)`: 3 over a 2 s animation read 1,
 *   −0.5 read 1.5. A stated `time` beside a `bone` is not read (the bone won).
 * - The animation is then applied at that time, wrapped `time mod duration`
 *   when `loop` (a bone-less 3.25 over 1 s read 0.25, which is before the
 *   first key at 0.5 and so applied nothing), `duration` being the runtime's
 *   (`./animation.ts`, the last key time as float32). ⚠️ A dial looping over
 *   an animation of duration 0 computes `0 + (time mod 0)`, NaN — and the
 *   runtime still applied the animation's one key (a rotate keyed 45 on a
 *   bone at 20 read 65, as the same slider without `loop` and the bone-less
 *   form looping at 0 and at 0.5 did): every key of such an animation sits
 *   at 0, so the core applies it at 0. The compiler refuses the shape (A37);
 *   a foreign file can still carry it.
 *
 * ## How it composes: the current pose, the mix, `additive`
 *
 * Each timeline of the slider's animation, in the animation's order, blends
 * from the CURRENT pose — whatever the setup, the sample's animation and the
 * constraints before it left — with `alpha` the slider's `mix`:
 *
 * - **Before the timeline's first key it writes nothing** (the current pose
 *   stands: a slider at 0.2 over a rotate keyed from 0.5 left 20° at setup
 *   and the sample's 50° alike). Not the setup value, as a sample's own
 *   animation writes (construct 4).
 * - **`mix` 0 applies nothing at all** — not even an attachment key.
 * - `rotate`, `translate`/`x`/`y`, `shear`/`x`/`y`: `current + (setup + v −
 *   current) · mix`; **`additive`**: `current + v · mix`. Measured on setup
 *   rotation 20 and a sample at 50, the slider's value 150: 170 at mix 1,
 *   110 at 0.5, −10 at −0.5 (no clamp); additive 200 and 125. No wrap to the
 *   short way round: 50 toward 290 at 0.3 read 122.
 * - `scale`/`x`/`y`: the target is `setup · v`; `current + (target −
 *   current') · mix` where `current'` is |current| with the TARGET's sign — a
 *   setup `scaleY` 0.5 toward −0.5 at mix 0.5 read −0.5, not 0; **additive**:
 *   `current + (v − 1) · setup · mix` (a current 6 on setup 2, v 3 read 10).
 * - `inherit`: the key's mode, from its first key on (`CQ06` holds it).
 * - Slot colours (`rgba`, `rgb`, `alpha`, `rgba2`, `rgb2`): each channel the
 *   timeline names moves from the current value toward the key's by the mix
 *   and is then clamped to [0, 1] (a mix of −1 read alpha 0, of 2 read
 *   0.87451 from 0.12549 toward 0.5); `additive` changes nothing for them.
 * - `attachment`: the key's placeholder from its first key on, whatever the
 *   mix above 0 (0.01 switched it); `null` shows nothing.
 *
 * ## Its timelines
 *
 * A sample's animation may key a slider's `time` and `mix` (one channel
 * each, construct 4's key search and curves, float32 key values). Before the
 * first key the slider's own value; a key omitting `value` reads 1 (the
 * compiler's note on the parser, measured again by `CQ07`). A bone-driven
 * slider ignores a `time` key: its time is its dial's.
 *
 * ## What is left out, by name
 *
 * A slider whose animation keys a constraint timeline (ik, transform, path,
 * slider — writing a later constraint's pose, issue #665's case) is not
 * posed: the document's bones are absent, naming it. One whose animation
 * keys a deform or sequence timeline changes what a mesh draws at setup, so
 * `setup.attachments` is absent, naming it. Physics timelines under
 * `Physics.none` pose nothing (`./constraints_physics.ts`) and events a
 * slider does not fire, so neither leaves anything out.
 *
 * ## Purity
 *
 * As the rest of the core: nothing from the Spine runtime package, nothing
 * from `src/transform.ts`, no clock, no randomness, no I/O.
 */
import type { ModelBone } from '../model.ts';
import { channelAt, keyIndexAt, type CoreAnimationTimelines, type CoreCurve, type CoreKey } from './animation.ts';
import { sourceValue, TRANSFORM_PROPERTIES, type SolverState, type TransformProperty } from './constraints.ts';
import type { CompiledDocument, CoreAnimation } from './index.ts';

/** The fields a slider's record may carry after `kind`, `name`, `declaredIn` (`buildRigConstraint` in `src/compile.ts`). */
export const SLIDER_FIELDS = ['animation', 'additive', 'loop', 'mix', 'bone', 'property', 'from', 'to', 'scale', 'max', 'local', 'time', 'skin'] as const;

/** A slider, read: its animation's timelines and every setup value of the bones they key, so it can be applied with no other part of the document. */
export interface CoreSliderRecord {
  kind: 'slider';
  name: string;
  animation: string;
  timelines: CoreAnimationTimelines;
  /** The setup bones its animation keys, by name — what a non-additive key's value is added to. */
  setup: ReadonlyMap<string, ModelBone>;
  additive: boolean;
  loop: boolean;
  mix: number;
  time: number;
  /** The dial, or `null` for the bone-less form. */
  bone: string | null;
  property: TransformProperty;
  from: number;
  to: number;
  scale: number;
  local: boolean;
  skin: boolean;
}

/** One slider's timelines in one animation: the `time` and `mix` keys, `null` where not keyed. */
export interface CoreSliderTimeline {
  name: string;
  time: CoreKey[] | null;
  mix: CoreKey[] | null;
}

/** A slider as it was applied: its animation, at which time, with which alpha — what the slots are posed from after the bones. */
export interface SliderApplication {
  name: string;
  timelines: CoreAnimationTimelines;
  at: number;
  alpha: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * A slider's record, read field by field — every field the writer can write
 * for the kind and no other, each of its type, the animation one of the
 * document's, the dial a bone of it — or `undefined` with the problems named.
 * An absent field reads the parser's value (the header): `mix` 1, `time`,
 * `from`, `to` 0, `scale` 1, the flags false.
 */
export function readSliderRecord(raw: Record<string, unknown>, name: string, where: string, bones: readonly ModelBone[], animations: readonly CoreAnimation[], problems: string[]): CoreSliderRecord | undefined {
  const before = problems.length;
  for (const key of Object.keys(raw)) {
    if (key === 'kind' || key === 'name' || key === 'declaredIn') continue;
    if (!(SLIDER_FIELDS as readonly string[]).includes(key)) problems.push(`${where}: field "${key}" is not one this reader knows; it reads [${SLIDER_FIELDS.join(', ')}]`);
  }
  const num = (key: string, dflt: number): number => {
    const v = raw[key];
    if (v === undefined) return dflt;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      problems.push(`${where}: ${key} is ${JSON.stringify(v)}, not a finite number`);
      return dflt;
    }
    return v;
  };
  const flag = (key: string): boolean => {
    const v = raw[key];
    if (v === undefined) return false;
    if (typeof v !== 'boolean') {
      problems.push(`${where}: ${key} is ${JSON.stringify(v)}, not a boolean`);
      return false;
    }
    return v;
  };
  const anim = animations.find((a) => a.name === raw.animation);
  if (anim === undefined) problems.push(`${where}: a slider's animation is ${JSON.stringify(raw.animation)}, not an animation of this document`);
  const byName = new Map(bones.map((b) => [b.name, b]));
  let bone: string | null = null;
  if (raw.bone !== undefined) {
    if (typeof raw.bone !== 'string' || !byName.has(raw.bone)) problems.push(`${where}: bone is ${JSON.stringify(raw.bone)}, not a bone of this document`);
    else bone = raw.bone;
  }
  let property: TransformProperty = 'rotate';
  if (raw.property !== undefined) {
    const p = TRANSFORM_PROPERTIES.find((x) => x === raw.property);
    if (p === undefined) problems.push(`${where}: property is ${JSON.stringify(raw.property)}, none of ${TRANSFORM_PROPERTIES.join(', ')}`);
    else property = p;
  }
  num('max', 0);
  const loop = flag('loop');
  const setup = new Map<string, ModelBone>();
  for (const target of anim?.timelines.bones ?? []) {
    const b = byName.get(target.name);
    if (b !== undefined) setup.set(b.name, b);
  }
  const record: CoreSliderRecord = {
    kind: 'slider', name, animation: anim?.name ?? '', timelines: anim?.timelines ?? { declared: 0, duration: 0, bones: [], slots: [], later: [] }, setup,
    additive: flag('additive'), loop, mix: num('mix', 1), time: num('time', 0), bone, property,
    from: num('from', 0), to: num('to', 0), scale: num('scale', 1), local: flag('local'), skin: flag('skin'),
  };
  return problems.length === before ? record : undefined;
}

/**
 * The slider timelines of one animation record's `constraints.slider`, read:
 * each names a declared slider, each of its timelines is `time` or `mix` and
 * appears once, its keys strictly increase in time and carry `time`, `value`
 * and `curve` only.
 */
export function readSliderTimelines(value: unknown, label: string, declared: ReadonlyArray<{ kind: string; name: string }>, problems: string[]): CoreSliderTimeline[] {
  const out: CoreSliderTimeline[] = [];
  if (!Array.isArray(value)) return out;
  value.forEach((entry, i) => {
    const at = `${label}.constraints.slider[${i}]`;
    if (!isRecord(entry) || typeof entry.name !== 'string') {
      problems.push(`${at} names no slider`);
      return;
    }
    if (!declared.some((c) => c.kind === 'slider' && c.name === entry.name)) problems.push(`${at}: "${entry.name}" is not a slider of this document`);
    const tl: CoreSliderTimeline = { name: entry.name, time: null, mix: null };
    if (!Array.isArray(entry.timelines)) {
      problems.push(`${at}: timelines is not a list`);
      return;
    }
    entry.timelines.forEach((raw: unknown, j: number) => {
      const tat = `${at}.timelines[${j}]`;
      if (!isRecord(raw) || (raw.name !== 'time' && raw.name !== 'mix')) {
        problems.push(`${tat}: ${JSON.stringify(isRecord(raw) ? raw.name : raw)} is not a slider timeline; a slider keys time and mix`);
        return;
      }
      const which = raw.name;
      if (tl[which] !== null) problems.push(`${tat}: "${which}" is keyed twice on slider "${entry.name}"`);
      tl[which] = readKeys(raw.keys, `${tat} "${which}"`, problems);
    });
    out.push(tl);
  });
  return out;
}

function readKeys(value: unknown, at: string, problems: string[]): CoreKey[] {
  const keys: CoreKey[] = [];
  if (!Array.isArray(value) || value.length === 0) {
    problems.push(`${at}: keys is not a non-empty list`);
    return keys;
  }
  let last = -Infinity;
  value.forEach((k: unknown, j: number) => {
    const kat = `${at}.keys[${j}]`;
    if (!isRecord(k)) {
      problems.push(`${kat} is not an object`);
      return;
    }
    for (const key of Object.keys(k)) if (key !== 'time' && key !== 'value' && key !== 'curve') problems.push(`${kat}: field "${key}" is not one this reader knows; it reads [time, value, curve]`);
    const time = k.time;
    if (typeof time !== 'number' || !Number.isFinite(time) || time < 0) {
      problems.push(`${kat}: time is ${JSON.stringify(time)}, not a finite time at or after 0`);
      return;
    }
    if (time <= last) problems.push(`${kat}: time ${time} is not after the key before it — the writer refuses key times that do not strictly increase`);
    last = Math.max(last, time);
    let v = 1;
    if (k.value !== undefined) {
      if (typeof k.value !== 'number' || !Number.isFinite(k.value)) problems.push(`${kat}: value is ${JSON.stringify(k.value)}, not a finite number`);
      else v = k.value;
    }
    let curve: CoreCurve = 'linear';
    if (k.curve !== undefined) {
      if (j === value.length - 1) problems.push(`${kat}: the last key carries a curve, which eases to no key — the writer refuses it`);
      else if (k.curve === 'stepped') curve = 'stepped';
      else if (Array.isArray(k.curve) && k.curve.length === 4 && k.curve.every((n) => typeof n === 'number' && Number.isFinite(n))) curve = k.curve as number[];
      else problems.push(`${kat}: curve is ${JSON.stringify(k.curve)}, not "stepped" nor 4 finite numbers`);
    }
    keys.push({ time: Math.fround(time), values: [Math.fround(v)], stated: { time, values: [v] }, curve });
  });
  return keys;
}

/** What evaluates one channel of a key and finds the key — construct 4's unless a plant passes others. */
export interface SliderTimelinePlant {
  channel?: (keys: readonly CoreKey[], index: number, channel: number, t: number) => number;
  search?: (keys: readonly CoreKey[], t: number) => number;
}

/** A slider record with its timelines' `time` and `mix` at `t` in place of its own (the header's *Its timelines*). */
export function posedSlider(r: CoreSliderRecord, timelines: readonly CoreSliderTimeline[], t: number, plant: SliderTimelinePlant = {}): CoreSliderRecord {
  const tl = timelines.find((x) => x.name === r.name);
  if (tl === undefined) return r;
  const search = plant.search ?? keyIndexAt;
  const channel = plant.channel ?? channelAt;
  const at = (keys: CoreKey[] | null, own: number): number => {
    if (keys === null) return own;
    const i = search(keys, t);
    return i < 0 ? own : channel(keys, i, 0, t);
  };
  return { ...r, time: at(tl.time, r.time), mix: at(tl.mix, r.mix) };
}

/** The time a slider applies its animation at (the header's rule), before the animation's own loop wrap. */
export function sliderTime(state: SolverState, r: CoreSliderRecord): number {
  if (r.bone === null) return r.time;
  const value = sourceValue(state, { source: r.bone, localSource: r.local, offsets: ZERO_OFFSETS }, r.property);
  const time = r.to + (value - r.from) * r.scale;
  const d = r.timelines.duration;
  // Looping over a duration of 0 is NaN in the runtime, and it applied the keys: every key of such an animation sits at 0.
  if (r.loop && d === 0) return 0;
  return r.loop ? d + (time % d) : Math.max(0, time);
}

const ZERO_OFFSETS: Record<TransformProperty, number> = { rotate: 0, x: 0, y: 0, scaleX: 0, scaleY: 0, shearY: 0 };

/** The channels of a timeline at `t`, or `null` before its first key — when a slider writes nothing. */
function valuesAt(keys: readonly CoreKey[], t: number): number[] | null {
  const i = keyIndexAt(keys, t);
  if (i < 0) return null;
  return keys[i].values.map((_v, c) => channelAt(keys, i, c, t));
}

/**
 * Apply one slider to the solver's bones (the header's composition rules):
 * its local values move, and the bones written are returned for the update
 * loop to pose again with everything below them. The application is pushed
 * onto `applied` for the slots.
 */
export function applySlider(state: SolverState, r: CoreSliderRecord, applied?: SliderApplication[]): string[] {
  if (r.mix === 0) return [];
  const time = sliderTime(state, r);
  const d = r.timelines.duration;
  const at = r.loop && d !== 0 ? time % d : time;
  applied?.push({ name: r.name, timelines: r.timelines, at, alpha: r.mix });
  const alpha = r.mix;
  const changed: string[] = [];
  for (const target of r.timelines.bones) {
    const index = state.index.get(target.name);
    const setup = r.setup.get(target.name);
    if (index === undefined || setup === undefined) continue;
    const b = state.bones[index];
    let wrote = false;
    for (const tl of target.timelines) {
      if (tl.kind === 'inherit') {
        const i = keyIndexAt(tl.keys, at);
        if (i < 0) continue;
        b.inheritMode = tl.keys[i].mode;
        wrote = true;
        continue;
      }
      const v = valuesAt(tl.keys, at);
      if (v === null) continue;
      wrote = true;
      const add = (field: 'x' | 'y' | 'rotation' | 'shearX' | 'shearY', i: number): void => {
        const current = b[field] ?? 0;
        b[field] = r.additive ? current + v[i] * alpha : current + ((setup[field] ?? 0) + v[i] - current) * alpha;
      };
      const times = (field: 'scaleX' | 'scaleY', i: number): void => {
        const current = b[field] ?? 1;
        const s = setup[field] ?? 1;
        if (r.additive) {
          b[field] = current + (v[i] - 1) * s * alpha;
          return;
        }
        const target = s * v[i];
        const from = Math.abs(current) * Math.sign(target);
        b[field] = from + (target - from) * alpha;
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
    if (wrote) changed.push(target.name);
  }
  return changed;
}

/** A slot's pose as the sliders move it: what it shows, its light colour and its dark colour (`null` when it states none). */
export interface SlotPoseState {
  placeholder: string | null;
  light: number[];
  dark: number[] | null;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Each colour timeline's channels, as indices into `light` (0–3) and `dark` (4–6). */
const COLOUR_CHANNELS: Record<string, readonly number[]> = { rgba: [0, 1, 2, 3], rgb: [0, 1, 2], alpha: [3], rgba2: [0, 1, 2, 3, 4, 5, 6], rgb2: [0, 1, 2, 4, 5, 6] };

/** Every slider application's slot timelines on one slot, in order (the header's slot rules). */
export function applySliderSlots(slot: string, pose: SlotPoseState, applications: readonly SliderApplication[]): void {
  for (const app of applications) {
    for (const target of app.timelines.slots) {
      if (target.name !== slot) continue;
      for (const tl of target.timelines) {
        if (tl.kind === 'attachment') {
          const i = keyIndexAt(tl.keys, app.at);
          if (i >= 0) pose.placeholder = tl.keys[i].name ?? null;
          continue;
        }
        const v = valuesAt(tl.keys, app.at);
        if (v === null) continue;
        COLOUR_CHANNELS[tl.kind].forEach((at, i) => {
          if (at < 4) pose.light[at] = clamp01(pose.light[at] + (v[i] - pose.light[at]) * app.alpha);
          else if (pose.dark !== null) pose.dark[at - 4] = clamp01(pose.dark[at - 4] + (v[i] - pose.dark[at - 4]) * app.alpha);
        });
      }
    }
  }
}

/**
 * Why the document's bones cannot be posed because of a slider, or null: a
 * slider whose animation keys a constraint timeline other than physics (the
 * header's *What is left out*), named with the animation and the kinds.
 */
export function sliderBonesWhy(doc: CompiledDocument): string | null {
  const found: string[] = [];
  for (const c of doc.constraints) {
    if (c.kind !== 'slider') continue;
    const anim = doc.animations.find((a) => a.name === c.animation);
    if (anim === undefined) continue;
    const k = anim.constraints;
    const sliderTimelines = k.slider.reduce((n, s) => n + (s.time === null ? 0 : 1) + (s.mix === null ? 0 : 1), 0);
    const paths = k.path.reduce((n, p) => n + [p.position, p.spacing, p.mix].filter((x) => x !== undefined).length, 0);
    const kinds = [k.ik.length > 0 ? 'ik' : null, k.transform.length > 0 ? 'transform' : null, paths > 0 ? 'path' : null, sliderTimelines > 0 ? 'slider' : null].filter((x): x is string => x !== null);
    if (kinds.length > 0) found.push(`slider "${c.name}" applies animation "${c.animation}", which keys ${kinds.join(', ')} constraint timelines`);
  }
  return found.length === 0 ? null : `${found.join('; ')} — a slider writing a later constraint's pose is not posed by this cut`;
}

/** Why the setup attachments cannot be posed because a slider's animation keys a deform or sequence timeline, or null. */
export function sliderAttachmentsWhy(doc: CompiledDocument): string | null {
  const found: string[] = [];
  for (const c of doc.constraints) {
    if (c.kind !== 'slider') continue;
    const anim = doc.animations.find((a) => a.name === c.animation);
    if (anim?.timelines.later.some(([group]) => group === 'attachments')) found.push(`slider "${c.name}" applies animation "${c.animation}", which keys deform or sequence timelines`);
  }
  return found.length === 0 ? null : `${found.join('; ')} — what a mesh draws under a slider is not posed by this cut`;
}
