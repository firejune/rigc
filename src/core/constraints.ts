/**
 * Construct 5 of the core, first cut (issue #938, step 2e-i of issue #380):
 * the update order, and the two constraint kinds that move bones only by
 * what the bones and their target say — `ik` and `transform` — at the setup
 * pose and at a sample time, with their timelines. The second cut (issue
 * #938, step 2e-ii) adds `path`, whose record, walk and solver are
 * `./constraints_path.ts`'s; the third cut (2e-iii) adds `physics` under
 * `Physics.none` (`./constraints_physics.ts`: it applies nothing) and
 * `slider` (`./constraints_slider.ts`). Each is one more step of the update
 * loop below, so every constraint kind is posed; what the core still cannot
 * pose exactly leaves the bones out by name (`constraintsAbsentWhy`).
 *
 * Every rule below was measured by posing hand-written skeletons through
 * `tools/pose_oracle.ts dump` (spine-core 4.3.13, `--skin all`,
 * `--physics none`) and comparing the core's rows at tolerance 0, most of them
 * with "amplifier" bones — a child a million units out along each axis of the
 * bone under test — so that a difference of 1e-12 in a matrix reads as one
 * grid step (the `CC` controls hold the populations at ten thousand units:
 * at a million a skewed chain's amplifier reached 1.7e9, where a double no
 * longer resolves the grid). Nothing here was written from the runtime's
 * source. The public
 * documentation fixes the order the constraints run in (the editor's list,
 * top first) and the shape of each solver; every numeric choice beyond that —
 * which frame, which wrap, which constant — is the measurement stated next to
 * it. The core suite's `CC` controls hold the hand-written probes, and
 * `tools/core_gate.ts` holds the corpus.
 *
 * ## The update order
 *
 * **Constraints run in the document's order** — the model lists them as the
 * rig declares them and the Spine file carries that order, which is the
 * runtime's constraint list (the oracle's `constraints` roster). After each
 * one, every bone below a bone it changed is posed again from its local
 * values under its parent's new world transform, so a later constraint reads
 * the bones as the earlier ones left them. Measured: 500 random nine-bone
 * rigs, each with two to six ik and transform constraints in random order,
 * random targets and sources, reflecting, sheared, non-normal and softened —
 * every one IDENTICAL at tolerance 0 (`CC05`). Swapping two constraints that
 * touch one chain moves the pose (`CC10`).
 *
 * - A constraint whose mix for a property is 0 does not touch that property,
 *   and one that touches nothing leaves the bone and everything under it
 *   exactly as they were — not re-posed from its local values. A transform
 *   constraint driving `y` alone whose `mixY` is absent (the pose's initial
 *   0) re-posed its bone's children from lossy local values in the first
 *   reading and was 4e-6 off; skipping it made the probe exact.
 * - **A bone a transform constraint moved in world space keeps that world
 *   transform**, and its local values are re-derived from it at once
 *   (`localFromWorld`, below), so that when a later constraint moves one of
 *   its ancestors it follows from those. Measured: a transform setting a
 *   child's world rotation, then an ik turning its parent by 90°, turned the
 *   child with the parent (the child's world rotation 180°); in the other
 *   order, 90°.
 * - A constraint with `skin: true` is not applied under `--skin all`, whether
 *   a skin lists it or not; an ik or transform whose target, source or
 *   constrained bone is inactive is not applied (measured on an ik with its
 *   target skin-required and named by no skin: the bone did not turn); a
 *   path constraint is applied exactly when its slot's bone is active
 *   (`./constraints_path.ts`, *Which constraints run*).
 * - A path constraint moves its bones in world space, as a world-space
 *   transform does, and reads the bones as the earlier constraints left
 *   them — except its slot bone's world, which the offset's sign reads as
 *   the runtime last set it: its update order is built before it poses, and
 *   a weighted path does not ask for its slot bone (`slotBonePlan`,
 *   *Which slot bone* there). This is the one place the order the runtime
 *   builds is observable: ik and transform ask for every bone they read.
 *
 * ## Reading local values back from a world transform (`localFromWorld`)
 *
 * The runtime's re-derived values were read directly: a second transform
 * constraint with `localSource` reading the bone's `rotate`, `x`, `y`,
 * `scaleX`, `scaleY`, `shearY` onto an unrelated bone's `x` at scale 10000
 * gave each to 1e-10, and they agree with these rules on every probe:
 *
 * - `normal`: the local matrix is the parent's inverse (1 over its
 *   determinant, multiplied in) times the world matrix, and the local
 *   position the same inverse applied to the world origin's offset. Then
 *   `scaleX` is the x column's length and `shearX` is 0; ⚠️ **a local x
 *   column shorter than 0.0001 is read as `scaleX` 0**, `shearY` 0, `scaleY`
 *   the y column's length and `rotation` the y column's angle less 90 —
 *   measured on a column collapsed to 1.8e-6 by two `scaleX` properties, where
 *   the runtime read `rotation` −248.958 (the unwrapped y angle less 90) and
 *   `scaleX` 0. Otherwise `rotation` is the x column's angle, `scaleY` the y
 *   column's length — NEGATIVE when the determinant is — and `shearY` the y
 *   column's angle (turned 180° by adding 180 in degrees when the determinant
 *   is negative) less the rotation less 90, brought once into (−180, 180].
 *   The negative `scaleY` and the 180 added in degrees are what reproduce the
 *   runtime's ±2.66e-6° residual on a reflected bone: 138 of 400 reflected
 *   and sheared probes missed with a positive `scaleY`, 0 with this.
 * - `onlyTranslation`: the world matrix is the local matrix.
 * - `noRotationOrReflection`: the local matrix is taken against the parent's
 *   conformal matrix (the frame `./world.ts` builds for that mode), and the
 *   parent's x-axis angle is added to the rotation.
 * - `noScale`, `noScaleOrReflection`: `scaleX` is the world x column's length,
 *   `rotation` the angle of the parent's inverse applied to that column's
 *   direction, and the y column is read in the frame that direction spans
 *   (flipped when the parent reflects, for `noScale`).
 *
 * Each of the five held on 300 probes at the million-unit amplifier: a world
 * edit on the bone, then a translation-only edit on its parent that makes the
 * bone re-posed from its re-derived values (`CC06`).
 *
 * ## ik — one bone
 *
 * The bone turns so its x axis points at the target. With `v` the target in
 * the bone's parent frame:
 *
 * - `normal`, `noScale`, `noScaleOrReflection`: the parent's world matrix,
 *   inverted by dividing by its determinant, applied to the target's offset
 *   from the PARENT's world origin, less the bone's local `x`, `y`.
 *   `onlyTranslation`: the target's offset from the bone's own world origin,
 *   as it is. `noRotationOrReflection`: as `normal`, with the parent's
 *   conformal matrix (x axis kept, y axis at 90° with length |det| / |x|) for
 *   its matrix, and the parent's x-axis angle added to the angle. Each other
 *   reading of that mode missed 14 to 200 of 300 probes; the offset from the
 *   bone's own origin, for `normal`, is the same number up to rounding and
 *   was exact on every random probe — ⚠️ but a target AT the bone's origin
 *   has only rounding noise for a direction, and the runtime turned such a
 *   bone to 56.56° where that reading read 30° (0.3345 off in `b`); the
 *   parent-origin reading reproduces the noise exactly (`CC04`).
 * - The rotation it needs is `atan2(v)` less `shearX` less the current
 *   rotation, plus 180 when `scaleX` is negative, brought once into
 *   (−180, 180], times `mix`, added to the rotation.
 * - `compress` / `stretch`: with `len` the bone's `length` times `scaleX` and
 *   `d` the length of `v` — of the world offset for the two `noScale` modes —
 *   when `len` is above 0.0001 and the target is nearer (`compress`) or
 *   farther (`stretch`), `scaleX` is multiplied by `(d / len − 1) · mix + 1`.
 *   With `scaleY` `uniform` `scaleY` is multiplied by the same `s`; with
 *   `volume` it is divided by `s`, except below 0.7 where it is divided by
 *   `0.25 + s · 0.642857`. That constant is measured: a bone of `scaleY`
 *   100000 compressed to seven lengths read `(1/scaleY − 0.25) / s` =
 *   0.642857000 to nine places on every one, and the break is between 0.6999
 *   and 0.7001.
 * - `mix` 0 leaves the bone alone.
 *
 * Measured: 1,000 random probes each over rotated, scaled, reflecting and
 * sheared parents and bones, all five inherit modes, `compress`, `stretch`,
 * the three `scaleY` modes and random `mix`, all exact (`CC02`).
 *
 * ## ik — two bones
 *
 * The public documentation: the second bone must be a child of the first;
 * the child's tip reaches the target; `bendPositive` picks the side;
 * `softness` slows the chain as it straightens; `stretch` scales it to reach.
 * Measured, in the parent's parent frame (the "grandparent", its world
 * matrix inverted by multiplying by 1 over its determinant):
 *
 * - **Either bone not `normal`: the constraint does nothing** (all four
 *   other modes on each bone, 200 probes each).
 * - The parent keeps its shear. ⚠️ The public page says the parent's local
 *   shear is set to 0; spine-core 4.3.13 keeps it (100 sheared probes: 100
 *   off with the shear zeroed, 0 kept).
 * - **Uniform** when the parent's |scaleX| and |scaleY| differ by at most
 *   0.00001 — measured between 9.9e-6 (uniform) and 1.01e-5 (not), at scales
 *   0.5, 1 and 2. The public page's "nonuniform" was read as 0.0001 at first,
 *   and a world-edited parent at 1.00005 went 2,261,052 units off at the
 *   amplifier.
 * - The child's local `y` is set to 0 when the scale is not uniform or
 *   `stretch` is on; otherwise it is kept, and it offsets the angles by
 *   `atan2(y, x)` of the child's local position — unscaled.
 * - `l1` is the distance, in the grandparent frame, from the parent's local
 *   origin to the child's world origin (that is, the parent's world matrix
 *   applied to the child's local `x`, `y`); `l2` is the child's `length`
 *   times |its scaleX|; the target is read in the same frame.
 * - **softness**: `s` = `softness` · |parent scaleX| · (|child scaleX| + 1) ·
 *   0.5; with `d` the target's distance and `sd = d − l1 − l2·|scaleX| + s`,
 *   when `sd > 0` the target is drawn in toward the parent by
 *   `(sd − s·(1 − q²)) / d` of itself, `q = min(1, sd / 2s) − 1`: the chain
 *   reaches `d − sd²/4s` until `sd` is `2s`, and full length after. Measured
 *   on a straight chain at eleven distances and two softnesses, then at the
 *   amplifier: the fully softened chain is ill-conditioned (its bend is the
 *   arc-cosine of 1 − a few ulp), and only this arithmetic, with the
 *   subtraction in this order and the square root (not `hypot`) for `l1`,
 *   read it exactly — 132, 102, 59 and 10 of 1,000 missed on the way.
 * - **Uniform**: the law of cosines, `cos = (d² − l1² − l2²) / (2·l1·l2)`
 *   with `l2` scaled by |scaleX|; below −1 the bend is π·bend, above 1 it is
 *   0 and `stretch` multiplies the parent's `scaleX` (and `scaleY` for
 *   `uniform`, divides it for `volume`) by `(d/(l1+l2) − 1)·mix + 1`. The
 *   parent's angle is one `atan2` of the target turned back by the bend's
 *   offset — the difference of two `atan2`s is off by 2π about 1 time in 30,
 *   and 2π in the runtime's degrees is not 2π.
 * - **Not uniform**: the child's tip at `(X, Y)` in the parent's scaled frame
 *   solves `(b² − a²)X² − 2b²·l1·X + b²·l1² + a²·d² − a²b² = 0`
 *   (`a`, `b` = `l2` times |scaleX|, |scaleY|), solved the numerically stable
 *   way and taking the root of smaller magnitude; when it has none, the
 *   nearest reachable pose of the three candidates — folded, straight and the
 *   ellipse's vertex — on the side of the midpoint of their squared reaches
 *   the target is. The folded bend is π in the runtime's own π (3.1415927);
 *   the parent's angle is here the DIFFERENCE of two `atan2`s.
 * - The parent's rotation is the angle less the offset, plus 180 when its
 *   `scaleX` is negative, and the child's is `(bend + offset)·deg − shearX`,
 *   times the product of the parent's scale signs, plus 180 when the child's
 *   `scaleX` is negative. Each change is brought once into (−180, 180] —
 *   **−180 goes to 180**: a folded chain under a reflecting parent read the
 *   same child angle for both bends, measured at `mix` 0.5 — and multiplied
 *   by `mix`.
 *
 * Measured: 2,000 random probes per combination — grandparents rotated,
 * scaled, reflecting and sheared; parents uniform, reflecting and not
 * uniform; children offset in `y`, scaled, reflecting and sheared; `stretch`,
 * `softness`, the `scaleY` modes, both bends, random `mix` — exact at the
 * amplifier (`CC03`). Degenerate cases (`CC04`): the child at the parent's
 * origin, the target at the parent's origin, the chain exactly straight,
 * exactly folded, the softness onset and its end, a child of length 0 — all
 * exact. The runtime throws on an ik whose (first) bone is the root, so the
 * reader refuses it. A collapsed grandparent (determinant 0) is left to the
 * oracle's ill-conditioned rule, which excludes the bone and everything below
 * it — the one case where the core's value is not the runtime's.
 *
 * ## transform
 *
 * 4.3's form: `properties` maps each source property (`rotate`, `x`, `y`,
 * `scaleX`, `scaleY`, `shearY`) with its `offset` to one or more target
 * properties, each with `offset`, `scale` and `max`. For each constrained
 * bone, each source property in the document's order, each target property:
 *
 * - **The source's value.** World (`localSource` false): `rotate` is the x
 *   column's angle, plus the constraint's `rotation` — negated when the source
 *   reflects — and then brought into [0, 360) by adding 360 once when below 0
 *   (a scale of 0.5 read 95 for a source at −170); `x`, `y` are the source's
 *   world transform applied to the constraint's `x`, `y`; `scaleX`, `scaleY`
 *   the column lengths plus the constraint's offsets; `shearY` the angle
 *   between the columns less 90, plus `shearY`. Local: the source's local
 *   value (as constraints so far left it) plus the offset, unwrapped.
 * - Less the source property's `offset`, times the target property's `scale`
 *   (absent 1), plus its `offset` (absent 0); with `clamp`, held between its
 *   `offset` and its `max` whichever is larger — `max` absent reads 1 (a
 *   clamped 30 read 1).
 * - **The mix** of the target property: `mixRotate`, `mixX`, `mixScaleX`,
 *   `mixShearY` absent read 1 for a driven property; `mixY` absent reads the
 *   resolved `mixX` when `x` is driven and 0 when it is not, `mixScaleY` the
 *   same over `scaleX` (the parser's reading, `src/keyorder.ts`'s note on the
 *   transform constraint, measured again here). A mix of 0 applies nothing.
 * - **World** (`localTarget` false): `rotate` turns both columns by the
 *   change to the value (or by the value, `additive`) brought once into
 *   (−180, 180] and times the mix; `x`, `y` move the world origin; `scaleX`,
 *   `scaleY` scale a column to the value (or by it, additive: `1 + (v−1)·mix`);
 *   `shearY` turns the y column to `v + 90` degrees from the x column, the
 *   change brought once into (−π, π] with the RUNTIME's π (78 of 300 missed
 *   with Math.PI), keeping its length. **Local**: the local field moves
 *   toward the value by the mix (additive: adds `v·mix`, or scales by
 *   `1 + (v−1)·mix`).
 *
 * Measured: 800 probes per property in world mode over reflecting, sheared,
 * offset, scaled and clamped sources and targets; 300 per property and mode
 * pair for local, additive and both; 1,000 with random cross-mappings (a
 * property to several, several to one); the six identity mappings in both
 * key orders — all exact, amplified (`CC07`). Every one on bones of all five
 * inherit modes.
 *
 * ## The timelines
 *
 * An `ik` timeline keys `mix` and `softness` (two curve channels) and
 * `bendPositive`, `compress`, `stretch` (stepped: the flags of the last key
 * at or before `t`); a `transform` timeline keys the six mixes (six
 * channels). The key search and the curves are construct 4's
 * (`keyIndexAt`, `channelAt` in `./animation.ts`), key times and values
 * float32, a Bézier from the stated numbers. Before the first key the
 * constraint's own values; a key omitting a field reads the parser's value
 * for it — `mix` 1, `softness` 0, `bendPositive` true, `compress` and
 * `stretch` false; a transform key's mixes 1, `mixY` the key's `mixX`
 * (`src/keyorder.ts`, `PARSER_DEFAULTS`). `CC08` holds each.
 *
 * ## Purity
 *
 * As the rest of the core: nothing from the Spine runtime package, nothing
 * from `src/transform.ts`, no clock, no randomness, no I/O.
 */
import type { ModelBone } from '../model.ts';
import { modeMatrix, RUNTIME_PI, worldTransforms, type CoreInheritMode, type CoreWorld } from './world.ts';
import { channelAt, keyIndexAt, type CoreCurve, type CoreKey } from './animation.ts';
import type { CompiledDocument, CoreConstraintKind } from './index.ts';
import { readPathTimelines, slotBonePlan, solvePath, type CorePathRecord, type CorePathTimelines, type SlotBoneEvent } from './constraints_path.ts';
import { physicsTimelineCount, type CorePhysicsRecord } from './constraints_physics.ts';
import { applySlider, posedSlider, readSliderTimelines, sliderBonesWhy, type CoreSliderRecord, type CoreSliderTimeline, type SliderApplication } from './constraints_slider.ts';

const DEG = 180 / RUNTIME_PI;
const RAD = RUNTIME_PI / 180;

/** The kinds this cut poses. */
export const ADMITTED_CONSTRAINT_KINDS: readonly CoreConstraintKind[] = ['ik', 'transform', 'path', 'physics', 'slider'];

/** A transform constraint's six properties, in the order its timeline's channels run. */
export const TRANSFORM_PROPERTIES = ['rotate', 'x', 'y', 'scaleX', 'scaleY', 'shearY'] as const;
export type TransformProperty = (typeof TRANSFORM_PROPERTIES)[number];
/** The mix field of each property, in the same order. */
export const TRANSFORM_MIXES: Record<TransformProperty, string> = { rotate: 'mixRotate', x: 'mixX', y: 'mixY', scaleX: 'mixScaleX', scaleY: 'mixScaleY', shearY: 'mixShearY' };
/** The constraint's offset field of each property. */
const TRANSFORM_OFFSETS: Record<TransformProperty, string> = { rotate: 'rotation', x: 'x', y: 'y', scaleX: 'scaleX', scaleY: 'scaleY', shearY: 'shearY' };
/** The three `scaleY` modes an ik constraint names. */
export const IK_SCALE_Y_MODES = ['none', 'uniform', 'volume'] as const;
export type IkScaleYMode = (typeof IK_SCALE_Y_MODES)[number];

/** The fields each admitted kind's record may carry after `kind`, `name`, `declaredIn` (`buildRigConstraint` in `src/compile.ts`). */
export const CONSTRAINT_FIELDS: Record<'ik' | 'transform', readonly string[]> = {
  ik: ['bones', 'target', 'scaleY', 'mix', 'softness', 'bendPositive', 'compress', 'stretch', 'skin'],
  transform: ['bones', 'source', 'properties', 'localSource', 'localTarget', 'additive', 'clamp', 'rotation', 'x', 'y', 'scaleX', 'scaleY', 'shearY', 'mixRotate', 'mixX', 'mixY', 'mixScaleX', 'mixScaleY', 'mixShearY', 'skin'],
};

/** The values an ik constraint's timeline keys, and a pose of them. */
export interface IkPose {
  mix: number;
  softness: number;
  bendPositive: boolean;
  compress: boolean;
  stretch: boolean;
}

export interface CoreIkRecord extends IkPose {
  kind: 'ik';
  name: string;
  bones: string[];
  target: string;
  scaleY: IkScaleYMode;
  skin: boolean;
}

export interface CoreTransformTo {
  property: TransformProperty;
  offset: number;
  scale: number;
  max: number;
}

export interface CoreTransformFrom {
  property: TransformProperty;
  offset: number;
  to: CoreTransformTo[];
}

export interface CoreTransformRecord {
  kind: 'transform';
  name: string;
  bones: string[];
  source: string;
  properties: CoreTransformFrom[];
  localSource: boolean;
  localTarget: boolean;
  additive: boolean;
  clamp: boolean;
  /** The constraint's offsets: `rotation`, `x`, `y`, `scaleX`, `scaleY`, `shearY`, by the property they offset. */
  offsets: Record<TransformProperty, number>;
  /** The resolved mixes, by property — the header's reading of an absent one. */
  mixes: Record<TransformProperty, number>;
  skin: boolean;
}

export type CoreConstraintRecord = CoreIkRecord | CoreTransformRecord | CorePathRecord | CorePhysicsRecord | CoreSliderRecord;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function unknownFields(record: Record<string, unknown>, known: readonly string[], where: string, problems: string[]): void {
  for (const key of Object.keys(record)) if (!known.includes(key)) problems.push(`${where}: field "${key}" is not one this reader knows; it reads [${known.join(', ')}]`);
}

function num(raw: Record<string, unknown>, key: string, dflt: number, where: string, problems: string[]): number {
  const v = raw[key];
  if (v === undefined) return dflt;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    problems.push(`${where}: ${key} is ${JSON.stringify(v)}, not a finite number`);
    return dflt;
  }
  return v;
}

function flag(raw: Record<string, unknown>, key: string, dflt: boolean, where: string, problems: string[]): boolean {
  const v = raw[key];
  if (v === undefined) return dflt;
  if (typeof v !== 'boolean') {
    problems.push(`${where}: ${key} is ${JSON.stringify(v)}, not a boolean`);
    return dflt;
  }
  return v;
}

function boneList(raw: Record<string, unknown>, bones: ReadonlySet<string>, where: string, problems: string[]): string[] {
  if (!Array.isArray(raw.bones) || raw.bones.length === 0) {
    problems.push(`${where}: bones is ${JSON.stringify(raw.bones)}, not a non-empty list of bone names`);
    return [];
  }
  const out: string[] = [];
  raw.bones.forEach((b, i) => {
    if (typeof b !== 'string' || !bones.has(b)) problems.push(`${where}: bones[${i}] ${JSON.stringify(b)} is not a bone of this document`);
    else out.push(b);
  });
  return out;
}

function boneRef(raw: Record<string, unknown>, key: string, bones: ReadonlySet<string>, where: string, problems: string[]): string {
  const v = raw[key];
  if (typeof v !== 'string' || !bones.has(v)) {
    problems.push(`${where}: ${key} is ${JSON.stringify(v)}, not a bone of this document`);
    return '';
  }
  return v;
}

/** The mix of `property` as the header reads an absent one. */
function resolvedMix(raw: Record<string, unknown>, property: TransformProperty, driven: ReadonlySet<TransformProperty>, where: string, problems: string[]): number {
  const stated = raw[TRANSFORM_MIXES[property]];
  if (stated !== undefined) return num(raw, TRANSFORM_MIXES[property], 0, where, problems);
  if (property === 'y') return driven.has('x') ? resolvedMix(raw, 'x', driven, where, problems) : 0;
  if (property === 'scaleY') return driven.has('scaleX') ? resolvedMix(raw, 'scaleX', driven, where, problems) : 0;
  return driven.has(property) ? 1 : 0;
}

/**
 * An ik or transform constraint's record, read field by field — every field
 * the writer can write for its kind and no other, each of its type, every
 * bone named a bone of the document — or `undefined` with the problems named.
 * `bones` is the document's bone names; `parents` each bone's parent, for the
 * two refusals the runtime would otherwise throw on while posing.
 */
export function readConstraintRecord(raw: Record<string, unknown>, kind: 'ik' | 'transform', name: string, where: string, bones: ReadonlySet<string>, parents: ReadonlyMap<string, string | undefined>, problems: string[]): CoreConstraintRecord | undefined {
  const before = problems.length;
  const rest: Record<string, unknown> = { ...raw };
  delete rest.kind;
  delete rest.name;
  delete rest.declaredIn;
  unknownFields(rest, CONSTRAINT_FIELDS[kind], where, problems);
  const list = boneList(raw, bones, where, problems);
  const skin = flag(raw, 'skin', false, where, problems);
  if (kind === 'ik') {
    const target = boneRef(raw, 'target', bones, where, problems);
    if (list.length > 2) problems.push(`${where}: an ik constraint names ${list.length} bones; the format takes one or two`);
    if (list.length >= 1 && parents.get(list[0]) === undefined) problems.push(`${where}: its first bone "${list[0]}" is the root; spine-core throws posing an ik constraint on a bone with no parent`);
    if (list.length === 2 && parents.get(list[1]) !== list[0]) problems.push(`${where}: "${list[1]}" is not a child of "${list[0]}"; a two-bone ik needs the second bone directly under the first`);
    let scaleY: IkScaleYMode = 'none';
    if (raw.scaleY !== undefined) {
      const folded = typeof raw.scaleY === 'string' && raw.scaleY.length > 0 ? raw.scaleY[0].toLowerCase() + raw.scaleY.slice(1) : '';
      const mode = IK_SCALE_Y_MODES.find((m) => m === folded);
      if (mode === undefined) problems.push(`${where}: scaleY is ${JSON.stringify(raw.scaleY)}, none of ${IK_SCALE_Y_MODES.join(', ')}`);
      else scaleY = mode;
    }
    const record: CoreIkRecord = {
      kind, name, bones: list, target, scaleY, skin,
      mix: num(raw, 'mix', 1, where, problems),
      softness: num(raw, 'softness', 0, where, problems),
      bendPositive: flag(raw, 'bendPositive', true, where, problems),
      compress: flag(raw, 'compress', false, where, problems),
      stretch: flag(raw, 'stretch', false, where, problems),
    };
    return problems.length === before ? record : undefined;
  }
  const source = boneRef(raw, 'source', bones, where, problems);
  const properties: CoreTransformFrom[] = [];
  const driven = new Set<TransformProperty>();
  if (raw.properties !== undefined && !isRecord(raw.properties)) problems.push(`${where}: properties is not an object`);
  else if (isRecord(raw.properties)) {
    for (const [fromName, fromRaw] of Object.entries(raw.properties)) {
      const at = `${where}.properties.${fromName}`;
      const from = TRANSFORM_PROPERTIES.find((p) => p === fromName);
      if (from === undefined) {
        problems.push(`${at}: "${fromName}" is none of ${TRANSFORM_PROPERTIES.join(', ')}`);
        continue;
      }
      if (!isRecord(fromRaw)) {
        problems.push(`${at} is not an object`);
        continue;
      }
      unknownFields(fromRaw, ['offset', 'to'], at, problems);
      const to: CoreTransformTo[] = [];
      if (!isRecord(fromRaw.to)) problems.push(`${at}: to is not an object`);
      else {
        for (const [toName, toRaw] of Object.entries(fromRaw.to)) {
          const at2 = `${at}.to.${toName}`;
          const property = TRANSFORM_PROPERTIES.find((p) => p === toName);
          if (property === undefined) {
            problems.push(`${at2}: "${toName}" is none of ${TRANSFORM_PROPERTIES.join(', ')}`);
            continue;
          }
          if (!isRecord(toRaw)) {
            problems.push(`${at2} is not an object`);
            continue;
          }
          unknownFields(toRaw, ['offset', 'scale', 'max'], at2, problems);
          to.push({ property, offset: num(toRaw, 'offset', 0, at2, problems), scale: num(toRaw, 'scale', 1, at2, problems), max: num(toRaw, 'max', 1, at2, problems) });
          driven.add(property);
        }
      }
      properties.push({ property: from, offset: num(fromRaw, 'offset', 0, at, problems), to });
    }
  }
  const offsets = {} as Record<TransformProperty, number>;
  const mixes = {} as Record<TransformProperty, number>;
  for (const p of TRANSFORM_PROPERTIES) {
    offsets[p] = num(raw, TRANSFORM_OFFSETS[p], 0, where, problems);
    mixes[p] = resolvedMix(raw, p, driven, where, problems);
  }
  const record: CoreTransformRecord = {
    kind, name, bones: list, source, properties, skin, offsets, mixes,
    localSource: flag(raw, 'localSource', false, where, problems),
    localTarget: flag(raw, 'localTarget', false, where, problems),
    additive: flag(raw, 'additive', false, where, problems),
    clamp: flag(raw, 'clamp', false, where, problems),
  };
  return problems.length === before ? record : undefined;
}

// ---------------------------------------------------------------------------
// timelines
// ---------------------------------------------------------------------------

/** An ik key: `mix`, `softness` as channels, the three flags as the key states them or the parser reads them. */
export interface CoreIkKey extends CoreKey {
  flags: { bendPositive: boolean; compress: boolean; stretch: boolean };
}

/** One animation's ik, transform and path timelines, by constraint name, in the animation's order. */
export interface CoreConstraintTimelines {
  ik: Array<{ name: string; keys: CoreIkKey[] }>;
  transform: Array<{ name: string; keys: CoreKey[] }>;
  /** The path constraints' timelines (`./constraints_path.ts`). */
  path: CorePathTimelines[];
  /** How many physics timelines the animation holds — they pose nothing under `Physics.none` (`./constraints_physics.ts`). */
  physics: number;
  /** The slider timelines (`./constraints_slider.ts`). */
  slider: CoreSliderTimeline[];
}

/** The ik key's curve channels, and the transform key's, in the order a curve indexes them. */
export const IK_KEY_CHANNELS = ['mix', 'softness'] as const;
export const TRANSFORM_KEY_CHANNELS = ['mixRotate', 'mixX', 'mixY', 'mixScaleX', 'mixScaleY', 'mixShearY'] as const;

function keyCurve(raw: Record<string, unknown>, channels: number, last: boolean, at: string, problems: string[]): CoreCurve {
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

/**
 * The ik, transform and path timelines of one animation record's
 * `constraints`, read: each names a declared constraint of its kind, its
 * keys strictly increase in time, each key carries only the fields the
 * parser reads for its kind (the path's, `readPathTimelines` in
 * `./constraints_path.ts`); the physics timelines are counted (they pose
 * nothing under `Physics.none`) and the slider timelines read by
 * `./constraints_slider.ts`.
 */
export function readConstraintTimelines(value: unknown, label: string, declared: ReadonlyArray<{ kind: CoreConstraintKind; name: string }>, problems: string[]): CoreConstraintTimelines {
  const out: CoreConstraintTimelines = { ik: [], transform: [], path: [], physics: 0, slider: [] };
  if (!isRecord(value)) return out;
  out.path = readPathTimelines(value.path, label, new Set(declared.filter((c) => c.kind === 'path').map((c) => c.name)), problems);
  out.physics = physicsTimelineCount(value.physics);
  out.slider = readSliderTimelines(value.slider, label, declared, problems);
  for (const kind of ['ik', 'transform'] as const) {
    const list = value[kind];
    if (!Array.isArray(list)) continue;
    list.forEach((entry, i) => {
      const at = `${label}.constraints.${kind}[${i}]`;
      if (!isRecord(entry) || typeof entry.name !== 'string') {
        problems.push(`${at} names no constraint`);
        return;
      }
      if (!declared.some((c) => c.kind === kind && c.name === entry.name)) problems.push(`${at}: "${entry.name}" is not a ${kind} constraint of this document`);
      const rawKeys: unknown = entry.keys;
      if (!Array.isArray(rawKeys) || rawKeys.length === 0) {
        problems.push(`${at}: keys is not a non-empty list`);
        return;
      }
      const channels: readonly string[] = kind === 'ik' ? IK_KEY_CHANNELS : TRANSFORM_KEY_CHANNELS;
      const known = kind === 'ik' ? ['time', ...IK_KEY_CHANNELS, 'bendPositive', 'compress', 'stretch', 'curve'] : ['time', ...TRANSFORM_KEY_CHANNELS, 'curve'];
      let last = -Infinity;
      const keys: CoreIkKey[] = [];
      rawKeys.forEach((k: unknown, j: number) => {
        const kat = `${at}.keys[${j}]`;
        if (!isRecord(k)) {
          problems.push(`${kat} is not an object`);
          return;
        }
        unknownFields(k, known, kat, problems);
        const time = k.time;
        if (typeof time !== 'number' || !Number.isFinite(time) || time < 0) {
          problems.push(`${kat}: time is ${JSON.stringify(time)}, not a finite time at or after 0`);
          return;
        }
        if (time <= last) problems.push(`${kat}: time ${time} is not after the key before it — the writer refuses key times that do not strictly increase`);
        last = Math.max(last, time);
        // The parser's reading of an absent field (`PARSER_DEFAULTS` in src/keyorder.ts): an ik key's mix 1, softness 0; a transform key's mixes 1 and its mixY its own mixX.
        const stated = channels.map((c) => {
          if (kind === 'transform' && c === 'mixY' && k.mixY === undefined) return num(k, 'mixX', 1, kat, problems);
          return num(k, c, c === 'softness' ? 0 : 1, kat, problems);
        });
        keys.push({
          time: Math.fround(time),
          values: stated.map(Math.fround),
          stated: { time, values: stated },
          curve: keyCurve(k, channels.length, j === rawKeys.length - 1, kat, problems),
          flags: { bendPositive: flag(k, 'bendPositive', true, kat, problems), compress: flag(k, 'compress', false, kat, problems), stretch: flag(k, 'stretch', false, kat, problems) },
        });
      });
      if (kind === 'ik') out.ik.push({ name: entry.name, keys });
      else out.transform.push({ name: entry.name, keys });
    });
  }
  return out;
}

/** What evaluates one channel of a constraint key, and finds the key — construct 4's unless a plant passes others. */
export interface ConstraintTimelinePlant {
  channel?: (keys: readonly CoreKey[], index: number, channel: number, t: number) => number;
  search?: (keys: readonly CoreKey[], t: number) => number;
}

/** Every admitted constraint record with its timeline's values at `t` in place of its own (the header's *The timelines*). */
export function posedRecords(records: readonly CoreConstraintRecord[], timelines: CoreConstraintTimelines | null, t: number, plant: ConstraintTimelinePlant = {}): CoreConstraintRecord[] {
  const search = plant.search ?? keyIndexAt;
  const channel = plant.channel ?? channelAt;
  return records.map((r): CoreConstraintRecord => {
    if (timelines === null || r.kind === 'physics') return r;
    if (r.kind === 'slider') return posedSlider(r, timelines.slider, t, plant);
    if (r.kind === 'path') {
      const tl = timelines.path.find((x) => x.name === r.name);
      if (tl === undefined) return r;
      const out = { ...r };
      for (const [kind, fields] of [['position', ['position']], ['spacing', ['spacing']], ['mix', ['mixRotate', 'mixX', 'mixY']]] as const) {
        const keys = tl[kind];
        if (keys === undefined) continue;
        const i = search(keys, t);
        if (i < 0) continue;
        fields.forEach((f, c) => (out[f] = channel(keys, i, c, t)));
      }
      return out;
    }
    if (r.kind === 'ik') {
      const tl = timelines.ik.find((x) => x.name === r.name);
      if (tl === undefined) return r;
      const i = search(tl.keys, t);
      if (i < 0) return r;
      return { ...r, mix: channel(tl.keys, i, 0, t), softness: channel(tl.keys, i, 1, t), ...tl.keys[i].flags };
    }
    const tl = timelines.transform.find((x) => x.name === r.name);
    if (tl === undefined) return r;
    const i = search(tl.keys, t);
    if (i < 0) return r;
    const mixes = {} as Record<TransformProperty, number>;
    TRANSFORM_PROPERTIES.forEach((p, c) => (mixes[p] = channel(tl.keys, i, c, t)));
    return { ...r, mixes };
  });
}

// ---------------------------------------------------------------------------
// solving
// ---------------------------------------------------------------------------

/** A change brought once into (−180, 180] — the header's measured wrap (−180 goes to 180). */
function wrap180(r: number): number {
  return r > 180 ? r - 360 : r <= -180 ? r + 360 : r;
}

const IDENTITY: CoreWorld = { a: 1, b: 0, c: 0, d: 1, worldX: 0, worldY: 0 };

function modeOf(bone: ModelBone): CoreInheritMode {
  const m = bone.inheritMode;
  if (m === undefined || m.length === 0) return 'normal';
  const folded = m[0].toLowerCase() + m.slice(1);
  return folded === 'onlyTranslation' || folded === 'noRotationOrReflection' || folded === 'noScale' || folded === 'noScaleOrReflection' ? folded : 'normal';
}

/** The runtime's `scaleY` for a bone an ik scaled by `s` along its length (the header's `volume` measurement). */
function volumeScaleY(scaleY: number, s: number): number {
  return scaleY / (s < 0.7 ? 0.25 + s * 0.642857 : s);
}

/** The state the solvers work on: every bone's local values, its world transform, and which bones are active. */
export interface SolverState {
  bones: ModelBone[];
  index: Map<string, number>;
  world: Map<string, CoreWorld>;
  active: ReadonlySet<string>;
}

function bone(state: SolverState, name: string): ModelBone {
  return state.bones[state.index.get(name) as number];
}

function parentWorld(state: SolverState, b: ModelBone): CoreWorld {
  return b.parent === undefined ? IDENTITY : (state.world.get(b.parent) as CoreWorld);
}

/** One bone's world transform from its local values under its parent's current world transform — `./world.ts`'s arithmetic. */
function poseBone(state: SolverState, b: ModelBone): void {
  if (!state.active.has(b.name)) {
    state.world.set(b.name, { a: 0, b: 0, c: 0, d: 0, worldX: 0, worldY: 0 });
    return;
  }
  if (b.parent === undefined) {
    state.world.set(b.name, worldTransforms([b]).get(b.name) as CoreWorld);
    return;
  }
  const p = state.world.get(b.parent) as CoreWorld;
  const [a, bb, c, d] = modeMatrix(modeOf(b), p, b);
  const x = b.x ?? 0;
  const y = b.y ?? 0;
  state.world.set(b.name, { a, b: bb, c, d, worldX: p.a * x + p.b * y + p.worldX, worldY: p.c * x + p.d * y + p.worldY });
}

/** The bone's local values read back from its world transform — the header's `localFromWorld`. */
export function localFromWorld(b: ModelBone, p: CoreWorld, w: CoreWorld): void {
  const mode = b.parent === undefined ? 'normal' : modeOf(b);
  const pid = 1 / (p.a * p.d - p.b * p.c);
  const dx = w.worldX - p.worldX;
  const dy = w.worldY - p.worldY;
  b.x = dx * p.d * pid - dy * p.b * pid;
  b.y = dy * p.a * pid - dx * p.c * pid;
  b.shearX = 0;
  if (mode === 'noScale' || mode === 'noScaleOrReflection') {
    const length = Math.sqrt(w.a * w.a + w.c * w.c);
    const ux = w.a / length;
    const uy = w.c / length;
    const det = p.a * p.d - p.b * p.c;
    const flip = mode === 'noScale' && det < 0 ? -1 : 1;
    const lb = ux * w.b + uy * w.d;
    const ld = (ux * w.d - uy * w.b) * flip;
    decompose(b, length, 0, lb, ld);
    b.rotation = Math.atan2((uy * p.a - ux * p.c) / det, (ux * p.d - uy * p.b) / det) * DEG;
    return;
  }
  let la: number;
  let lb: number;
  let lc: number;
  let ld: number;
  if (mode === 'onlyTranslation') {
    [la, lb, lc, ld] = [w.a, w.b, w.c, w.d];
  } else if (mode === 'noRotationOrReflection') {
    const k = Math.abs(p.a * p.d - p.b * p.c) / (p.a * p.a + p.c * p.c);
    const [ca, cb, cc, cd] = [p.a, -p.c * k, p.c, p.a * k];
    const cdet = ca * cd - cb * cc;
    [la, lb, lc, ld] = [(cd * w.a - cb * w.c) / cdet, (cd * w.b - cb * w.d) / cdet, (ca * w.c - cc * w.a) / cdet, (ca * w.d - cc * w.b) / cdet];
    decompose(b, la, lc, lb, ld);
    b.rotation = (b.rotation ?? 0) + Math.atan2(p.c, p.a) * DEG;
    return;
  } else {
    const [ia, ib, ic, id] = [p.d * pid, p.b * pid, p.c * pid, p.a * pid];
    [la, lb, lc, ld] = [ia * w.a - ib * w.c, ia * w.b - ib * w.d, id * w.c - ic * w.a, id * w.d - ic * w.b];
  }
  decompose(b, la, lc, lb, ld);
}

/** A local matrix `[la lb; lc ld]` (columns `(la, lc)` and `(lb, ld)`) as rotation, scales and shear — the header's rule. */
function decompose(b: ModelBone, la: number, lc: number, lb: number, ld: number): void {
  const sx = Math.sqrt(la * la + lc * lc);
  const yLength = Math.sqrt(lb * lb + ld * ld);
  if (sx <= 0.0001) {
    b.scaleX = 0;
    b.scaleY = yLength;
    b.shearY = 0;
    b.rotation = Math.atan2(ld, lb) * DEG - 90;
    return;
  }
  const rotation = Math.atan2(lc, la) * DEG;
  const det = la * ld - lb * lc;
  let yAngle = Math.atan2(ld, lb) * DEG;
  if (det < 0) yAngle += 180;
  b.rotation = rotation;
  b.scaleX = sx;
  b.scaleY = det < 0 ? -yLength : yLength;
  let shear = yAngle - rotation - 90;
  shear = shear > 180 ? shear - 360 : shear < -180 ? shear + 360 : shear;
  b.shearY = shear;
}

/** A one-bone ik (the header's *ik — one bone*): returns the bone changed, or none. */
function solveOne(state: SolverState, c: CoreIkRecord): string[] {
  const b = bone(state, c.bones[0]);
  const p = parentWorld(state, b);
  const bw = state.world.get(b.name) as CoreWorld;
  const t = state.world.get(c.target) as CoreWorld;
  const mode = modeOf(b);
  let [pa, pb, pc, pd] = [p.a, p.b, p.c, p.d];
  let turn = 0;
  let lx: number;
  let ly: number;
  if (mode === 'noRotationOrReflection') {
    const k = Math.abs(pa * pd - pb * pc) / (pa * pa + pc * pc);
    pb = -pc * k;
    pd = pa * k;
    turn = Math.atan2(pc, pa) * DEG;
    const det = pa * pd - pb * pc;
    const x = t.worldX - p.worldX;
    const y = t.worldY - p.worldY;
    lx = (x * pd - y * pb) / det - (b.x ?? 0);
    ly = (y * pa - x * pc) / det - (b.y ?? 0);
  } else {
    if (mode === 'onlyTranslation') {
      lx = t.worldX - bw.worldX;
      ly = t.worldY - bw.worldY;
    } else {
      const det = pa * pd - pb * pc;
      const x = t.worldX - p.worldX;
      const y = t.worldY - p.worldY;
      lx = (x * pd - y * pb) / det - (b.x ?? 0);
      ly = (y * pa - x * pc) / det - (b.y ?? 0);
    }
  }
  const rotation = b.rotation ?? 0;
  const scaleX = b.scaleX ?? 1;
  let r = Math.atan2(ly, lx) * DEG - (b.shearX ?? 0) - rotation + turn;
  if (scaleX < 0) r += 180;
  b.rotation = rotation + wrap180(r) * c.mix;
  const len = (b.length ?? 0) * scaleX;
  if ((c.compress || c.stretch) && len > 0.0001) {
    const wx = t.worldX - bw.worldX;
    const wy = t.worldY - bw.worldY;
    const d = mode === 'noScale' || mode === 'noScaleOrReflection' ? Math.sqrt(wx * wx + wy * wy) : Math.sqrt(lx * lx + ly * ly);
    if ((c.compress && d < len) || (c.stretch && d > len)) {
      const s = (d / len - 1) * c.mix + 1;
      b.scaleX = scaleX * s;
      if (c.scaleY === 'uniform') b.scaleY = (b.scaleY ?? 1) * s;
      else if (c.scaleY === 'volume') b.scaleY = volumeScaleY(b.scaleY ?? 1, s);
    }
  }
  return [b.name];
}

/** A two-bone ik (the header's *ik — two bones*): returns the parent changed (the child is below it), or none. */
function solveTwo(state: SolverState, c: CoreIkRecord): string[] {
  const parent = bone(state, c.bones[0]);
  const child = bone(state, c.bones[1]);
  if (modeOf(parent) !== 'normal' || modeOf(child) !== 'normal') return [];
  const g = parentWorld(state, parent);
  const pw = state.world.get(parent.name) as CoreWorld;
  const t = state.world.get(c.target) as CoreWorld;
  const gid = 1 / (g.a * g.d - g.b * g.c);
  const inGrand = (wx: number, wy: number): [number, number] => {
    const x = wx - g.worldX;
    const y = wy - g.worldY;
    return [(x * g.d - y * g.b) * gid, (y * g.a - x * g.c) * gid];
  };
  const px = parent.x ?? 0;
  const py = parent.y ?? 0;
  const psx = parent.scaleX ?? 1;
  const psy = parent.scaleY ?? 1;
  const csx = child.scaleX ?? 1;
  let sx = psx;
  let sy = psy;
  const cx = child.x ?? 0;
  let cy = child.y ?? 0;
  const uniform = Math.abs(Math.abs(psx) - Math.abs(psy)) <= 0.00001;
  if (!uniform || c.stretch) cy = 0;
  const [ox, oy] = inGrand(pw.a * cx + pw.b * cy + pw.worldX, pw.c * cx + pw.d * cy + pw.worldY);
  const dx = ox - px;
  const dy = oy - py;
  const l1 = Math.sqrt(dx * dx + dy * dy);
  let l2 = (child.length ?? 0) * Math.abs(csx);
  let [tx, ty] = inGrand(t.worldX, t.worldY);
  tx -= px;
  ty -= py;
  let d2 = tx * tx + ty * ty;
  const bend = c.bendPositive ? 1 : -1;
  if (c.softness !== 0) {
    const soft = c.softness * (Math.abs(psx) * (Math.abs(csx) + 1) * 0.5);
    const d = Math.sqrt(d2);
    const sd = d - l1 - l2 * Math.abs(psx) + soft;
    if (sd > 0) {
      const q = Math.min(1, sd / (soft * 2)) - 1;
      const pull = (sd - soft * (1 - q * q)) / d;
      tx -= pull * tx;
      ty -= pull * ty;
      d2 = tx * tx + ty * ty;
    }
  }
  let a1: number;
  let a2: number;
  if (uniform) {
    l2 *= Math.abs(psx);
    let cos = (d2 - l1 * l1 - l2 * l2) / (2 * l1 * l2);
    if (cos < -1) {
      cos = -1;
      a2 = Math.PI * bend;
    } else if (cos > 1) {
      cos = 1;
      a2 = 0;
      if (c.stretch) {
        const f = (Math.sqrt(d2) / (l1 + l2) - 1) * c.mix + 1;
        sx *= f;
        if (c.scaleY === 'uniform') sy *= f;
        else if (c.scaleY === 'volume') sy = volumeScaleY(sy, f);
      }
    } else a2 = Math.acos(cos) * bend;
    const along = l1 + l2 * cos;
    const across = l2 * Math.sin(a2);
    a1 = Math.atan2(ty * along - tx * across, tx * along + ty * across);
  } else {
    const ea = Math.abs(psx) * l2;
    const eb = Math.abs(psy) * l2;
    const aa = ea * ea;
    const bb = eb * eb;
    const qa = bb - aa;
    const qb = -2 * bb * l1;
    const qc = bb * l1 * l1 + aa * d2 - aa * bb;
    const disc = qb * qb - 4 * qa * qc;
    let solved = false;
    a1 = 0;
    a2 = 0;
    if (disc >= 0) {
      let q = Math.sqrt(disc);
      if (qb < 0) q = -q;
      q = -(qb + q) * 0.5;
      const r0 = q / qa;
      const r1 = qc / q;
      const X = Math.abs(r0) < Math.abs(r1) ? r0 : r1;
      const y2 = d2 - X * X;
      if (y2 >= 0) {
        const Y = Math.sqrt(y2) * bend;
        a1 = Math.atan2(ty, tx) - Math.atan2(Y, X);
        a2 = Math.atan2(Y / Math.abs(psy), (X - l1) / Math.abs(psx));
        solved = true;
      }
    }
    if (!solved) {
      let near = { angle: RUNTIME_PI, x: l1 - ea, y: 0, dist: (l1 - ea) * (l1 - ea) };
      let far = { angle: 0, x: l1 + ea, y: 0, dist: (l1 + ea) * (l1 + ea) };
      const vertex = (-ea * l1) / (aa - bb);
      if (vertex >= -1 && vertex <= 1) {
        const angle = Math.acos(vertex);
        const x = ea * Math.cos(angle) + l1;
        const y = eb * Math.sin(angle);
        const dist = x * x + y * y;
        if (dist < near.dist) near = { angle, x, y, dist };
        if (dist > far.dist) far = { angle, x, y, dist };
      }
      const pick = d2 <= (near.dist + far.dist) * 0.5 ? near : far;
      a1 = Math.atan2(ty, tx) - Math.atan2(pick.y * bend, pick.x);
      a2 = pick.angle * bend;
    }
  }
  const signs = Math.sign(psx) * Math.sign(psy);
  const offset = Math.atan2(cy, cx);
  const parentTarget = a1 * DEG - signs * offset * DEG + (psx < 0 ? 180 : 0);
  const parentRotation = parent.rotation ?? 0;
  parent.rotation = parentRotation + wrap180(parentTarget - parentRotation) * c.mix;
  parent.scaleX = sx;
  parent.scaleY = sy;
  const childTarget = ((a2 + signs * offset) * DEG - (child.shearX ?? 0)) * signs + (csx < 0 ? 180 : 0);
  const childRotation = child.rotation ?? 0;
  child.y = cy;
  child.rotation = childRotation + wrap180(childTarget - childRotation) * c.mix;
  return [parent.name];
}

/** The source's value of `property` (the header's *transform*); a slider reads its dial through it with no offset. */
export function sourceValue(state: SolverState, c: Pick<CoreTransformRecord, 'source' | 'localSource' | 'offsets'>, property: TransformProperty): number {
  const s = bone(state, c.source);
  const o = c.offsets;
  if (c.localSource) {
    switch (property) {
      case 'rotate': return (s.rotation ?? 0) + o.rotate;
      case 'x': return (s.x ?? 0) + o.x;
      case 'y': return (s.y ?? 0) + o.y;
      case 'scaleX': return (s.scaleX ?? 1) + o.scaleX;
      case 'scaleY': return (s.scaleY ?? 1) + o.scaleY;
      case 'shearY': return (s.shearY ?? 0) + o.shearY;
    }
  }
  const w = state.world.get(c.source) as CoreWorld;
  switch (property) {
    case 'rotate': {
      let r = Math.atan2(w.c, w.a) * DEG + (w.a * w.d - w.b * w.c < 0 ? -o.rotate : o.rotate);
      if (r < 0) r += 360;
      return r;
    }
    case 'x': return w.a * o.x + w.b * o.y + w.worldX;
    case 'y': return w.c * o.x + w.d * o.y + w.worldY;
    case 'scaleX': return Math.sqrt(w.a * w.a + w.c * w.c) + o.scaleX;
    case 'scaleY': return Math.sqrt(w.b * w.b + w.d * w.d) + o.scaleY;
    case 'shearY': return (Math.atan2(w.d, w.b) - Math.atan2(w.c, w.a)) * DEG - 90 + o.shearY;
  }
}

function applyWorld(w: CoreWorld, property: TransformProperty, v: number, mix: number, additive: boolean): void {
  switch (property) {
    case 'rotate': {
      const r = wrap180(additive ? v : v - Math.atan2(w.c, w.a) * DEG) * mix * RAD;
      const cos = Math.cos(r);
      const sin = Math.sin(r);
      const [a, b] = [w.a, w.b];
      w.a = cos * a - sin * w.c;
      w.b = cos * b - sin * w.d;
      w.c = sin * a + cos * w.c;
      w.d = sin * b + cos * w.d;
      return;
    }
    case 'x':
      w.worldX = additive ? w.worldX + v * mix : w.worldX + (v - w.worldX) * mix;
      return;
    case 'y':
      w.worldY = additive ? w.worldY + v * mix : w.worldY + (v - w.worldY) * mix;
      return;
    case 'scaleX':
    case 'scaleY': {
      const [p, q] = property === 'scaleX' ? (['a', 'c'] as const) : (['b', 'd'] as const);
      const s = Math.sqrt(w[p] * w[p] + w[q] * w[q]);
      if (s === 0) return;
      const k = additive ? 1 + (v - 1) * mix : 1 + ((v - s) * mix) / s;
      w[p] *= k;
      w[q] *= k;
      return;
    }
    case 'shearY': {
      const yAngle = Math.atan2(w.d, w.b);
      const xAngle = Math.atan2(w.c, w.a);
      let r = additive ? v * RAD : (v + 90) * RAD - (yAngle - xAngle);
      if (!additive) r = r > RUNTIME_PI ? r - 2 * RUNTIME_PI : r < -RUNTIME_PI ? r + 2 * RUNTIME_PI : r;
      const angle = yAngle + r * mix;
      const s = Math.sqrt(w.b * w.b + w.d * w.d);
      w.b = Math.cos(angle) * s;
      w.d = Math.sin(angle) * s;
      return;
    }
  }
}

const LOCAL_FIELD: Record<TransformProperty, 'rotation' | 'x' | 'y' | 'scaleX' | 'scaleY' | 'shearY'> = { rotate: 'rotation', x: 'x', y: 'y', scaleX: 'scaleX', scaleY: 'scaleY', shearY: 'shearY' };

function applyLocal(b: ModelBone, property: TransformProperty, v: number, mix: number, additive: boolean): void {
  const field = LOCAL_FIELD[property];
  const scale = property === 'scaleX' || property === 'scaleY';
  const current = b[field] ?? (scale ? 1 : 0);
  if (!additive) b[field] = current + (v - current) * mix;
  else b[field] = scale ? current * (1 + (v - 1) * mix) : current + v * mix;
}

/** A transform constraint (the header's *transform*): returns the bones it changed, and those it changed in world space. */
function solveTransform(state: SolverState, c: CoreTransformRecord): { changed: string[]; inWorld: string[] } {
  const changed: string[] = [];
  const inWorld: string[] = [];
  for (const name of c.bones) {
    const b = bone(state, name);
    const w = { ...(state.world.get(name) as CoreWorld) };
    let applied = false;
    for (const from of c.properties) {
      const value = sourceValue(state, c, from.property) - from.offset;
      for (const to of from.to) {
        const mix = c.mixes[to.property];
        if (mix === 0) continue;
        let v = value * to.scale + to.offset;
        if (c.clamp) {
          const lo = Math.min(to.offset, to.max);
          const hi = Math.max(to.offset, to.max);
          v = v < lo ? lo : v > hi ? hi : v;
        }
        applied = true;
        if (c.localTarget) applyLocal(b, to.property, v, mix, c.additive);
        else applyWorld(w, to.property, v, mix, c.additive);
      }
    }
    if (!applied) continue;
    changed.push(name);
    if (!c.localTarget) {
      state.world.set(name, w);
      inWorld.push(name);
    }
  }
  return { changed, inWorld };
}

/** Why a constraint is not applied under `--skin all` (the header's measured rule), or null when it is. */
function inactiveWhy(state: SolverState, c: CoreConstraintRecord): string | null {
  if (c.skin) return 'skin';
  // A path constraint is active when its slot's bone is (`./constraints_path.ts`, *Which constraints run*); every other kind when every bone it names is.
  const named = c.kind === 'path' ? [c.slotBone] : c.kind === 'ik' ? [...c.bones, c.target] : c.kind === 'transform' ? [...c.bones, c.source] : c.kind === 'slider' ? (c.bone === null ? [] : [c.bone]) : [c.bone];
  return named.every((n) => state.active.has(n)) ? null : 'inactive bone';
}

/** A plant a control passes in place of the solving: the records as posed, rewritten (a mix scaled, a bend flipped, two swapped). */
export type ConstraintPlant = (records: CoreConstraintRecord[]) => CoreConstraintRecord[];

/**
 * Every admitted constraint applied, in the document's order, to the bones'
 * local values (copied, never the caller's) and their world transforms as
 * `worldTransforms` posed them — the header's update order — and the world
 * transforms returned.
 */
export function applyConstraints(bones: readonly ModelBone[], world: ReadonlyMap<string, CoreWorld>, active: ReadonlySet<string>, records: readonly CoreConstraintRecord[], previous: ReadonlyMap<string, CoreWorld> | null = null, applied?: SliderApplication[]): Map<string, CoreWorld> {
  const state: SolverState = { bones: bones.map((b) => ({ ...b })), index: new Map(bones.map((b, i) => [b.name, i])), world: new Map(world), active };
  const skipped = new Set<number>();
  records.forEach((c, i) => {
    if (inactiveWhy(state, c) !== null) skipped.add(i);
  });
  // A path constraint's offset reads its slot bone's world as the runtime last brought it up to date (`./constraints_path.ts`, *Which slot bone*).
  const plan = records.some((c) => c.kind === 'path') ? slotBonePlan(bones, active, records, skipped) : new Map<number, SlotBoneEvent | null>();
  const snapshots = new Map<number, CoreWorld>();
  const snap = (i: number, when: 'before' | 'after'): void => {
    for (const [k, e] of plan) if (e !== null && e.at === i && e.when === when && !(k === i && when === 'before')) snapshots.set(k, { ...(state.world.get((records[k] as CorePathRecord).slotBone) as CoreWorld) });
  };
  for (let i = 0; i < records.length; i++) {
    const c = records[i];
    snap(i, 'before');
    if (skipped.has(i)) continue;
    let changed: string[] = [];
    let inWorld: string[] = [];
    if (c.kind === 'physics') {
      // Under Physics.none a physics constraint applies nothing (`./constraints_physics.ts`).
    } else if (c.kind === 'slider') {
      changed = applySlider(state, c, applied);
    } else if (c.kind === 'ik') {
      if (c.mix !== 0) changed = c.bones.length === 1 ? solveOne(state, c) : solveTwo(state, c);
    } else if (c.kind === 'path') {
      const e = plan.get(i) ?? null;
      const stale = previous === null ? { a: 0, b: 0, c: 0, d: 0, worldX: 0, worldY: 0 } : (previous.get(c.slotBone) as CoreWorld);
      const slotWorld = (e !== null && e.at === i) ? (state.world.get(c.slotBone) as CoreWorld) : e !== null ? (snapshots.get(i) as CoreWorld) : stale;
      ({ changed, inWorld } = solvePath(state, c, slotWorld));
    } else {
      ({ changed, inWorld } = solveTransform(state, c));
    }
    if (changed.length > 0) repose(state, changed, inWorld);
    snap(i, 'after');
  }
  return state.world;
}

/** After a constraint: the bones it moved in world space read back into local values, and every bone below one it moved posed again (the header's update order). */
function repose(state: SolverState, changed: readonly string[], inWorld: readonly string[]): void {
  for (const name of inWorld) {
    const b = bone(state, name);
    localFromWorld(b, parentWorld(state, b), state.world.get(name) as CoreWorld);
  }
  const below = new Set(changed);
  const keep = new Set(inWorld);
  for (const b of state.bones) {
    if (b.parent !== undefined && below.has(b.parent)) below.add(b.name);
    if (below.has(b.name) && !keep.has(b.name)) poseBone(state, b);
  }
}

/**
 * The slot bones a path constraint's offset reads from the PREVIOUS pass —
 * those the runtime has not brought up to date in this one by the time the
 * constraint runs (`./constraints_path.ts`, *Which slot bone*) — named with
 * their constraint. Only a constraint with an offset reads its slot bone.
 */
export function previousPassSlotBones(doc: CompiledDocument, active: ReadonlySet<string>): Array<{ constraint: string; bone: string }> {
  const records = doc.constraints.flatMap((c) => (c.record === undefined ? [] : [c.record]));
  if (!records.some((r) => r.kind === 'path')) return [];
  const state: SolverState = { bones: [...doc.bones], index: new Map(doc.bones.map((b, i) => [b.name, i])), world: new Map(), active };
  const skipped = new Set<number>();
  records.forEach((c, i) => {
    if (inactiveWhy(state, c) !== null) skipped.add(i);
  });
  const out: Array<{ constraint: string; bone: string }> = [];
  for (const [k, e] of slotBonePlan(doc.bones, active, records, skipped)) {
    const r = records[k] as CorePathRecord;
    if (e === null && r.offsetRotation !== 0) out.push({ constraint: r.name, bone: r.slotBone });
  }
  return out;
}

/**
 * Why an animation's bones cannot be posed by this cut though the setup's
 * can, or null: a path constraint's slot whose attachment an animation keys,
 * or a path attachment an animation deforms — the curve would not be the one
 * the setup reads, and neither is admitted (the attachment and deform
 * timelines are item 4's later groups).
 */
export function pathAnimationsWhy(doc: CompiledDocument): string | null {
  const found: string[] = [];
  const paths = doc.constraints.flatMap((c) => (c.record?.kind === 'path' ? [c.record] : []));
  for (const a of doc.animations) {
    for (const r of paths) {
      if (a.timelines.slots.some((s) => s.name === r.slot && s.timelines.some((t) => t.kind === 'attachment'))) found.push(`animation "${a.name}" keys the attachment of slot "${r.slot}", which path constraint "${r.name}" walks`);
    }
    for (const d of a.deforms) {
      const [skin, slot, att] = d.split('/');
      const g = doc.skins.find((k) => k.name === skin)?.attachments[slot]?.[att]?.geometry;
      if (g?.kind === 'path') found.push(`animation "${a.name}" deforms path attachment "${att}" (skin "${skin}", slot "${slot}")`);
    }
  }
  return found.length === 0 ? null : `${found.join('; ')} — a path constraint then walks a curve other than the setup's, and attachment and deform timelines are not admitted (item 4)`;
}

/**
 * Why a document's bones cannot be posed by this cut, or null when they can:
 * a path constraint walks a slot whose setup placeholder skins fill with
 * different curves (`CorePathRecord.unresolved`), it declares a constraint
 * of a kind not admitted (`ADMITTED_CONSTRAINT_KINDS` — since the path cut,
 * none is left), named with the counts of every kind it declares, or a
 * slider whose animation keys a constraint timeline (`sliderBonesWhy`).
 */
export function constraintsAbsentWhy(doc: CompiledDocument): string | null {
  const unresolved = doc.constraints.flatMap((c) => (c.record?.kind === 'path' && c.record.unresolved !== null ? [c.record.unresolved] : []));
  if (unresolved.length > 0) return unresolved.join('; ');
  const later = doc.constraints.filter((c) => !ADMITTED_CONSTRAINT_KINDS.includes(c.kind));
  if (later.length === 0) return sliderBonesWhy(doc);
  const kinds = [...new Set(doc.constraints.map((c) => c.kind))];
  const laterKinds = [...new Set(later.map((c) => c.kind))];
  return `the document declares ${kinds.map((k) => `${k} ×${doc.constraints.filter((c) => c.kind === k).length}`).join(', ')}, and ${laterKinds.join(', ')} constraints are not admitted (item 5; ${ADMITTED_CONSTRAINT_KINDS.join(', ')} are): the oracle applies them`;
}
