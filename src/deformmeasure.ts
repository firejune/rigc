/**
 * What a `deform` key does to the geometry, measured once.
 *
 * ⭐ **One survey, two consumers.** `A39_DEFORM_KEEPS_TRIANGLE_WINDING` reads the
 * reversals out of it and refuses a build; `explain`'s `DEFORM` block prints the
 * whole of it and refuses nothing. That split is issue
 * [#296](https://github.com/firejune/rigc/issues/296)'s two halves —
 * [#314](https://github.com/firejune/rigc/pull/314) landed the assertion and
 * [#316](https://github.com/firejune/rigc/issues/316) the report — and the reason
 * they share this file rather than each posing the skeleton themselves is that
 * the report's `winding 32 of 32 kept` and A39's `8 of 32 reverse` are **the same
 * count**. Two derivations of one number drift, and the one that drifts silently
 * is the one nobody exits non-zero on.
 *
 * ## The frame, and why it is the posed one
 *
 * Both sides of every comparison here are taken at the key's OWN time with the
 * animation applied: the deformed mesh against **the same posed bones with the
 * deform cleared**. Holding the bones at setup instead was tried in #314 and is
 * wrong in principle — a weighted mesh's offsets are authored in bone space
 * against the pose they land in, so setup bones measure a pose that never occurs.
 * Sharing the bones between the two sides is also what makes a MIRRORED slot bone
 * a non-event: a negative determinant flips every triangle on both sides and
 * cancels.
 *
 * ⇒ So every ratio on a key is *the deform's own contribution*, and the
 * denominator is 1.000 by construction rather than by measurement. A block that
 * printed `(setup 1.000)` beside it would be printing the definition.
 *
 * ## What is deliberately NOT here
 *
 * **Deformed coverage.** #296 asked for it and it does not exist: `coverage` is
 * rasterised from the attachment's **uvs** against the part's alpha
 * (`measureAuthoredMeshFit`, called from `src/compile.ts`), and a deform moves
 * positions and never uvs. The figure is therefore identical at every key of
 * every timeline, so a `coverage 100.00% (setup 100.00%)` line would be a
 * tautology dressed as a measurement. What actually moves — how much art each
 * drawn pixel now carries — is the stretch below, and `DR04` in `selftest.ts` is
 * the control that says the coverage figure cannot move.
 *
 * ## What the geometry is not enough to say (issue #401)
 *
 * A winding is a claim about **drawn** pixels: A39's own message says the mesh
 * "draws its texture backwards there", and that sentence is false when the slot
 * draws nothing at that time. So each key also carries `draw` — the attachment
 * the slot actually shows and the alpha it shows it at, both read off the same
 * posed skeleton the geometry came from. A key whose `draw.blank` is set is
 * measured and then **passed over by name**: a triangle that draws no pixels
 * cannot draw them backwards. It is per key and per time, never per slot —
 * `invariants.deformMayFold` is the per-slot instrument and it is a declaration,
 * not a measurement.
 *
 * ## And what a key is not enough to say either (issue #403)
 *
 * The keys are where the data is; they are not where the runtime is. Between two
 * of them it interpolates, so a deform inside its fold angle at every key can be
 * past it in between and no key-time measurement looks there. `scanDeformSpan`
 * closes that, and the derivation is in its own comment: the reversal condition
 * over a span has a **closed form** — a quadratic in the interpolation fraction —
 * so the time is solved for rather than searched, and the measurement taken there
 * is this file's ordinary one, at a time no key lands on.
 *
 * ## And WHICH frame, when the animation is never on a track (issue #407)
 *
 * Everything above says *at the key's own time*, and until #407 that meant one
 * thing: the animation played on track 0. An animation a **slider** applies is
 * never played that way — spine-core says so itself, in
 * `SkeletonData.findSliderAnimations`: *"Slider animations are designed to be
 * applied by slider constraints rather than on their own."* The slider picks the
 * time out of a bone property, so **the key's time and the applied time are the
 * same number by construction**; posing the animation on a track while its own
 * slider applies it at the neutral is a frame no playthrough contains, and it
 * reported a fold on a rig that is correct.
 *
 * ⇒ So a deform key is posed at the **reach** its animation actually has
 * (`DeformReach`): on a track when nothing applies it, and otherwise once per
 * slider, with that slider's own mapping inverted and its driving bone moved
 * until the runtime selects this key's time. Inverting the constraint away
 * instead was considered and refused for A39's own reason — a slider's animation
 * may carry bone tracks that move the very bones the offsets are authored
 * against, so dropping it reintroduces "setup bones measure a pose that never
 * occurs" one level up.
 *
 * ⚠️ **What the artifact cannot say, and this therefore does not:** whether a
 * slider's animation is ALSO played on a track somewhere. Nothing in skeleton
 * data records that, so a slider-applied animation is measured in its slider
 * frames only. Two sliders on one animation are two frames and both are measured
 * — one frame's pass never hides another's fold — but a consumer that plays a
 * slider animation on a track as well is outside what this can see.
 */
import {
  AnimationState,
  AnimationStateData,
  type Attachment,
  AtlasAttachmentLoader,
  type Bone,
  DeformTimeline,
  MeshAttachment,
  Physics,
  Skeleton,
  type SkeletonData,
  SkeletonJson,
  Slider,
  SliderData,
  TextureAtlas,
  type Timeline,
} from '@esotericsoftware/spine-core';

/**
 * How near zero a triangle's area has to be, as a fraction of the largest
 * triangle in the same mesh at the same pose, before a sign is not read off it.
 *
 * A RELATIVE band, because an absolute one has no scale that means anything on
 * its own — these are pixel² figures on whatever plate the rig was drawn at, and
 * `gallery/flex`'s leaf tops out at 792.6 px² where `spineboy-pro`'s hoverboard
 * reaches 3338.4 px². On those two it comes to 7.9e-4 and 3.3e-3 px².
 *
 * ⚠️ It is **not** what holds the float32 noise off; `float32AreaNoise` is, and
 * the two are combined rather than ranked because on a big mesh the noise bound
 * is the larger of them. This one is the shape band: it keeps a setup triangle
 * that has no area from being read as a reversal of anything, and a triangle the
 * key collapses onto zero from being read as turned over.
 */
export const DEFORM_AREA_EPSILON = 1e-6;

/** Half an ulp of a float32 mantissa — the relative error of one stored coordinate. */
const FLOAT32_HALF_ULP = 2 ** -24;

/**
 * An upper bound on how much of a triangle's signed area is float32 noise.
 *
 * The world vertices arrive in a `Float32Array`, so each coordinate carries up
 * to `|c|·2⁻²⁴` of error. An area is `½·(Δx₁·Δy₂ − Δx₂·Δy₁)`, and propagating
 * that error through one product gives `Δ·|c|·2⁻²⁴` twice over; four such terms
 * across the two products, halved, bounds the area error by `2·C²·2⁻²⁴` with `C`
 * the largest coordinate magnitude in the mesh (which also bounds every `Δ`).
 * Doubled once more for the subtraction, so the constant is 4.
 *
 * On a mesh whose vertices reach 500 units that is 6e-2 px², i.e. **larger** than
 * the relative band above — which is the whole reason this exists. It is a bound
 * rather than a measurement, and deliberately loose: what has to stay clear of it
 * is a genuine reversal, and the smallest one anywhere in the corpus is
 * `spineboy-pro`'s hoverboard triangle at 8.478 px², more than two orders of
 * magnitude above. Nothing measured lands between the two, so nothing between
 * them is being tuned.
 */
export function float32AreaNoise(world: ArrayLike<number>): number {
  let coordinate = 0;
  for (let i = 0; i < world.length; i++) coordinate = Math.max(coordinate, Math.abs(world[i]));
  return 4 * coordinate * coordinate * FLOAT32_HALF_ULP;
}

/**
 * Twice-signed area, halved, of every triangle of `triangles` over the
 * interleaved `x, y` world vertices in `world`.
 *
 * The SIGN is the whole point and the magnitude is the tolerance's yardstick, so
 * this returns the signed figure rather than an absolute one. Positive and
 * negative are not "correct" and "wrong" — a mesh may be wound either way, and
 * what A39 reads is whether one triangle's sign CHANGED.
 */
export function triangleAreas(world: ArrayLike<number>, triangles: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    const i0 = triangles[t] * 2;
    const i1 = triangles[t + 1] * 2;
    const i2 = triangles[t + 2] * 2;
    const x0 = world[i0];
    const y0 = world[i0 + 1];
    out.push(0.5 * ((world[i1] - x0) * (world[i2 + 1] - y0) - (world[i2] - x0) * (world[i1 + 1] - y0)));
  }
  return out;
}

/**
 * The two singular values of the linear map that takes one triangle onto the
 * other — the largest and smallest factor by which it scales a direction.
 *
 * ## Why this is the texture's stretch
 *
 * A mesh's uvs are fixed to the attachment and a deform never touches them, so
 * the texture is mapped affinely onto the *plain* triangle and the same texels
 * end up on the *deformed* one. The change in that mapping is exactly `J = D·P⁻¹`
 * with `P` and `D` the two triangles' edge pairs, and its singular values are the
 * worst stretch and the worst squash the drawing takes there. A σ of 1.4 means
 * every texel in that direction is drawn 1.4 px wide; 0.6 means the art is
 * crushed to 60%.
 *
 * `σ₁·σ₂ = |det J|` is the signed-area ratio's magnitude, which is why the two
 * quantities in the report cannot disagree — and `DR01` is the control that says
 * so on a case whose ratio the closed form predicts.
 *
 * Returns `null` for a plain triangle with no area: `P` is singular, there is no
 * map, and inventing one would be the report's own version of the false green
 * this file exists to avoid. Those triangles are counted as `degenerate`.
 */
export function stretchSingularValues(
  plain: ArrayLike<number>,
  deformed: ArrayLike<number>,
  triangles: ArrayLike<number>,
  t: number,
): { max: number; min: number } | null {
  const i0 = triangles[t * 3] * 2;
  const i1 = triangles[t * 3 + 1] * 2;
  const i2 = triangles[t * 3 + 2] * 2;
  const ux = plain[i1] - plain[i0];
  const uy = plain[i1 + 1] - plain[i0 + 1];
  const vx = plain[i2] - plain[i0];
  const vy = plain[i2 + 1] - plain[i0 + 1];
  const det = ux * vy - vx * uy;
  if (det === 0) return null;
  const px = deformed[i1] - deformed[i0];
  const py = deformed[i1 + 1] - deformed[i0 + 1];
  const qx = deformed[i2] - deformed[i0];
  const qy = deformed[i2 + 1] - deformed[i0 + 1];
  // J = D·P⁻¹, written out — P⁻¹ = (1/det)·[[vy, −vx], [−uy, ux]].
  const a = (px * vy - qx * uy) / det;
  const b = (-px * vx + qx * ux) / det;
  const c = (py * vy - qy * uy) / det;
  const d = (-py * vx + qy * ux) / det;
  // σ₁² + σ₂² = ‖J‖²_F and σ₁·σ₂ = |det J|, which is two equations for the two
  // values and needs no eigen decomposition. The discriminant is non-negative in
  // exact arithmetic (it is `(σ₁² − σ₂²)²`); the clamp is for rounding on a map
  // that is very nearly a rotation.
  const frobenius = a * a + b * b + c * c + d * d;
  const determinant = a * d - b * c;
  const discriminant = Math.max(0, frobenius * frobenius - 4 * determinant * determinant);
  const root = Math.sqrt(discriminant);
  return {
    max: Math.sqrt(Math.max(0, (frobenius + root) / 2)),
    min: Math.sqrt(Math.max(0, (frobenius - root) / 2)),
  };
}

/** A quantity's worst triangle on one key, and which triangle it was. */
export interface DeformExtreme {
  triangle: number;
  value: number;
}

/** One reversed triangle, with everything A39's message names about it. */
export interface DeformReversal {
  triangle: number;
  ids: [number, number, number];
  before: number;
  after: number;
}

/**
 * What the slot is doing with this mesh at one key's own time (issue #401).
 *
 * ⭐ Read off the SAME posed skeleton the geometry came from, one key at a time,
 * so the two halves cannot disagree about which frame they describe.
 */
export interface DeformKeyDraw {
  /** The attachment the slot shows at that time, or `null` when it shows none. */
  shown: string | null;
  /**
   * Whether `shown` IS this timeline's mesh — compared the way spine-core
   * compares it (`Attachment.timelineAttachment`), so a linked mesh counts as
   * the mesh it links to. When this is false the runtime applies no deform to
   * this slot at all (`DeformTimeline.applyToSlot` returns early), which is why
   * the geometry below is the cleared pose and says nothing about the key.
   */
  showsThisMesh: boolean;
  /**
   * `slot.color.a × attachment.color.a` at that time — the product
   * [`src/render.ts`](src/render.ts) tints a piece with, which is what decides
   * whether a texel lands. 0 when the slot shows something else, because then
   * none of this mesh is drawn.
   */
  alpha: number;
  /**
   * Why this mesh puts no pixels on the screen at that time, in the words the
   * `DEFORM` block and A39's stats line both print — or `null` when it puts some
   * there and every figure below is gated normally.
   *
   * ⚠️ The bar is **exactly** 0 and nothing above it. At alpha 0.5 a reversed
   * triangle is plainly visible at half strength, and a floor above 0 would be
   * this repository picking a visibility policy, which is the thing an archetype
   * rule exists not to do.
   */
  blank: string | null;
}

/**
 * How an animation is reached, which is the frame its keys are posed in (#407).
 *
 * ⭐ One per way in. An animation nothing applies has exactly one — the track —
 * and an animation two sliders apply has two, both measured, because a fold only
 * one dial can reach is still a fold.
 */
export interface DeformReach {
  /** `track` — played on track 0; `slider` — applied by the named constraint. */
  kind: 'track' | 'slider';
  /** The slider that applies it, or `null` on the track. */
  slider: string | null;
  /** The slider's driving bone. `null` on the track, and on a bone-less slider. */
  bone: string | null;
  /**
   * The transform property the slider reads off that bone, as spine-core's own
   * reader class is named minus the `From` (`rotate`, `x`, `y`, `scaleX`, …), or
   * `null` when there is no bone. Derived from which local field moves the
   * slider's time rather than from a table, so it cannot drift from the runtime.
   */
  property: string | null;
  /** `SliderData.local` — whether the property is read local or world. */
  local: boolean;
  /** The clause the `DEFORM` block and A39's stats line print. */
  label: string;
}

/** The reach every animation has when no slider applies it. */
const TRACK_REACH: DeformReach = {
  kind: 'track',
  slider: null,
  bone: null,
  property: null,
  local: false,
  label: 'played on a track',
};

/**
 * What the slider's dial had to be set to for this key's time to be the one the
 * runtime applies — and whether it worked (issue #407).
 *
 * `null` on a track frame, where there is no dial and the time is the time.
 */
export interface DeformDial {
  /**
   * The property value the mapping inversion asks for.
   *
   * `Slider.update` computes `time = offset + (value − property.offset) · scale`
   * — `to`, `from` and `scale` in a rig spec — so this is that line solved for
   * `value`: `property.offset + (time − offset) / scale`. On a bone-less slider
   * the "value" IS the time and this is the time.
   */
  value: number;
  /**
   * What the driving bone's own LOCAL field was set to so that spine-core's
   * reader returns `value`. The same number under `local: true`, where the
   * reader is `source.rotation` and nothing intervenes; a different one under
   * `local: false`, where the reader goes through the world transform.
   */
  driven: number;
  /** `SliderPose.time` the runtime then computed, read off the posed skeleton. */
  applied: number;
  /** What `Slider.update` would have stored for this key's own time. */
  wanted: number;
  /**
   * `applied` is not `wanted`: **no dial value selects this key's time.**
   *
   * The reachable one, and it is not hypothetical: `FromRotate.value` ends
   * `if (value < 0) value += 360`, so a `rotate` slider reading a WORLD rotation
   * cannot be driven below 0° and everything the inversion asks for down there
   * arrives 360° away (issue #405). `Math.max(0, time)` is the other.
   *
   * ⚠️ A key like that is measured — at the frame the runtime does land on, which
   * the report names — and then left OUT of the gate's counts, because the
   * geometry there belongs to some other time. Never silent: A39 puts it on the
   * stats line and the `DEFORM` block gives it a line of its own.
   */
  unreachable: boolean;
}

/**
 * What one deform timeline is doing to one attachment's geometry at **one posed
 * time**, whatever that time is.
 *
 * ⭐ A key and a between-keys probe (issue #403) are the same measurement taken
 * at two kinds of time, so they are one interface and one function
 * (`measurePosed`). Giving the span scan its own arithmetic would be the second
 * derivation this file's opening paragraph exists to forbid — the count A39
 * refuses on between two keys has to be the count it refuses on at one.
 */
export interface DeformFrameMeasure {
  /** Vertices in the attachment. */
  vertices: number;
  /**
   * How many of them this key moves at all, and the largest world displacement.
   *
   * `moved` counts an exact difference rather than one past an epsilon, and can:
   * both sides come off the same `computeWorldVertices` call with the same bones,
   * so a vertex the key does not touch is bit-identical on the two.
   */
  moved: number;
  maxDisplacement: number;
  maxDisplacementVertex: number;
  /** Triangles compared. `reversed` and `collapsed` are A39's own two counts. */
  triangles: number;
  reversed: DeformReversal[];
  collapsed: number;
  /** Triangles with no area at the cleared pose: no winding, no ratio, no stretch. */
  degenerate: number;
  /**
   * `after / before`, signed. **A negative ratio IS a reversal** — the sign is
   * the same fact `reversed` counts, which is why the two can never disagree.
   */
  areaRatioMin: DeformExtreme | null;
  areaRatioMax: DeformExtreme | null;
  /** Worst stretch and worst squash, over the triangles that have a map. */
  stretchMax: DeformExtreme | null;
  stretchMin: DeformExtreme | null;
  /** The dead band every count above was taken against, in px². */
  band: number;
  /** What the slot draws of this mesh at this time (issue #401). */
  draw: DeformKeyDraw;
  /** How the animation was reached, which is the frame this was posed in (#407). */
  reach: DeformReach;
  /** The dial that selected this time, or `null` on a track frame (#407). */
  dial: DeformDial | null;
}

/** What one deform key does to one attachment's geometry. */
export interface DeformKeyMeasure extends DeformFrameMeasure {
  animation: string;
  skin: string;
  slot: string;
  /** The attachment the timeline resolved to — the name A39's message carries. */
  attachment: string;
  /** The placeholder it sits behind in `skin`, which is what the spec wrote. */
  placeholder: string;
  /** Index into the timeline's own frames, which is the index A39's message names. */
  key: number;
  time: number;
}

/**
 * How the runtime gets from one deform key's geometry to the next one's.
 *
 * The three the format has, and what each does to the span scan below:
 *
 * - `linear` — the interpolation fraction sweeps `[0, 1]` affinely in time, so a
 *   fraction the closed form names converts to a time exactly;
 * - `stepped` — the fraction is **0 for the whole span**: the runtime does not
 *   interpolate, it holds the earlier key's geometry. So the span introduces no
 *   geometry the key survey has not already measured — but it holds that
 *   geometry across times whose *alpha* differs from the key's, which is the
 *   same hole in another coat and is checked (`DW15`);
 * - `bezier` — the fraction is the stored curve, which spine-core evaluates as a
 *   **polyline** of ten points (`DeformTimeline.getCurvePercent`). The scan reads
 *   that polyline rather than the cubic, so it is exact about the thing the
 *   runtime actually does, overshoot past 0 or 1 included.
 */
export type DeformSpanCurve = 'linear' | 'stepped' | 'bezier';

/**
 * The interval between two consecutive deform keys, scanned (issue #403).
 *
 * ⚠️ A span is recorded whether or not anything was found, because "the scan ran
 * and said nothing" and "the scan did not run" are the two things a gate must
 * never print the same way.
 */
export interface DeformSpan {
  animation: string;
  skin: string;
  slot: string;
  attachment: string;
  placeholder: string;
  /** The frame its two keys were posed in, which is the frame it probes (#407). */
  reach: DeformReach;
  /** The two keys it lies between, by the index A39's own message uses. */
  fromKey: number;
  toKey: number;
  fromTime: number;
  toTime: number;
  curve: DeformSpanCurve;
  /** Triangles the closed form says reverse somewhere strictly inside the span. */
  predicted: number;
  /**
   * Times the closed form named and the scan then measured at, in probe order.
   * **Empty is the ordinary case** — a span nothing is predicted to fold in
   * costs no posed measurement at all.
   */
  probed: number[];
  /** The probe that found a reversal on a frame the mesh DRAWS, or `null`. */
  fold: { time: number; percent: number; measure: DeformFrameMeasure } | null;
  /**
   * Probes that found the predicted reversal at a time the mesh draws no pixels
   * — issue #401's exemption, applied at a time no key lands on, which is what
   * keeps this from refusing a rig that fades out *before* the fold.
   */
  notDrawn: number;
  /**
   * The closed form predicted a fold and no probe reproduced one.
   *
   * Not a failure — refusing on a prediction nothing measured would be the false
   * red this repository has paid for twice (issues #44, #262) — and not a
   * silence either: it is on A39's stats line, because the one case that reaches
   * it is a weighted mesh whose BONES move across the span, and that is a limit
   * a reader has to be able to see.
   */
  unconfirmed: boolean;
}

/** Every deform key in a skeleton, measured — and what was passed over. */
export interface DeformSurvey {
  keys: DeformKeyMeasure[];
  /** Deform timelines seen, whether or not any of them could be measured. */
  timelines: number;
  /** Slots the caller's `exempt` set held, quoted. */
  exempted: string[];
  /** Slots whose attachment has a vertex array and no triangles, quoted. */
  notAMesh: string[];
  /**
   * Triangle samples across every key that draws — one mesh's triangles counted
   * once per key. ⚠️ A key whose `draw.blank` is set is NOT in this figure: it
   * is the sample the gate ran, and the gate does not run on those.
   */
  trianglesMeasured: number;
  /** Triangles pinched onto zero, summed over the same keys. A real idiom, never a bar. */
  collapsed: number;
  /**
   * Keys in `keys` whose `draw.blank` is set — measured, then passed over
   * because the mesh draws no pixels at that time (issue #401).
   *
   * ⚠️ Carried rather than left implicit because an exemption nobody can see is
   * how a gate comes to look kept while checking nothing. Both consumers print
   * it: A39 on its stats line, the `DEFORM` block per key and in its rollup.
   */
  notDrawn: number;
  /** Reversed triangles found on those keys, which nothing gates. */
  notDrawnReversed: number;
  /**
   * Keys whose `dial.unreachable` is set — no value of the slider's driving bone
   * selects that key's time, so the frame posed is not the key's (issue #407).
   *
   * ⚠️ Out of `trianglesMeasured` for the same reason `notDrawn` is: those totals
   * are what the gate ran on, and the gate does not run on these.
   */
  notReachable: number;
  /** Reversed triangles found on those keys, which nothing gates. */
  notReachableReversed: number;
  /**
   * Spans not scanned because one of the two keys bounding them is unreachable.
   *
   * A scan that did not run and a scan that found nothing must never print the
   * same way, and the span list only holds the ones that ran.
   */
  spansNotScanned: number;
  /**
   * Every interval between two consecutive keys, scanned (issue #403).
   *
   * One entry per consecutive pair per timeline, including the pairs where
   * nothing was predicted — a scan that ran and found nothing has to be
   * distinguishable from a scan that never ran.
   */
  spans: DeformSpan[];
  /** Spans whose predicted fold was measured at a time the mesh draws. */
  spanFolds: number;
  /** Spans whose predicted fold landed only where the mesh draws nothing. */
  spansNotDrawn: number;
  /** Spans that predicted a fold no probe reproduced. See `DeformSpan.unconfirmed`. */
  spansUnconfirmed: number;
  /**
   * Extra posed measurements the span scan took — **the cost figure**, and 0 on
   * a rig the closed form flags nothing in, which is every green rig. `CUR`-style
   * accounting rather than a timing: a wall clock in a gate is not reproducible
   * and this is (`DW16`).
   */
  spanProbes: number;
}

/**
 * Why no dial value selects this key's time, in the one sentence A39's stats
 * line, its SKIP reason and the `DEFORM` block all print (issue #407).
 *
 * ⭐ One sentence, three readers, for the reason the whole of this file is one
 * survey: a report and a gate that describe the same key differently are two
 * derivations, and the one that drifts is the one nobody exits non-zero on.
 * Empty on a key that IS reachable, so a caller cannot print it by accident.
 */
export function unreachableWhy(key: DeformKeyMeasure): string {
  const dial = key.dial;
  if (dial === null || !dial.unreachable) return '';
  const driven =
    key.reach.bone === null
      ? `slider "${key.reach.slider}"'s own time`
      : `${key.reach.bone}.${key.reach.property} (${key.reach.local ? 'local' : 'world'})`;
  // The one reader that cannot produce a value it is asked for, named where an
  // author will meet it: a WORLD rotation is an `atan2` ending in
  // `if (value < 0) value += 360`, so **[0, 360) is the whole of its range** and
  // `"local": true` is the fix (issue #405).
  //
  // ⚠️ Both ends, not just the low one. The compiler refuses a range that dips
  // below 0° — the natural way to author a face yaw, and the case #405 was filed
  // on — and says nothing about one that runs past 360°, which dies in exactly
  // the same way. This is the surface that sees it.
  const wrap =
    key.reach.property === 'rotate' && !key.reach.local && (dial.value < 0 || dial.value >= 360)
      ? '. A world rotation is read through `FromRotate.value`, an `atan2` ending `if (value < 0) value += 360`, ' +
        'so its whole range is [0, 360) and a driving value outside that is one the runtime never produces — ' +
        '`"local": true` on the slider reads the bone\'s own rotation signed and unwrapped'
      : '';
  return (
    `no value of ${driven} selects t=${key.time}s: slider "${key.reach.slider}" maps that time back to ` +
    `${dial.value.toFixed(6)}, and driven there the runtime applies the animation at ${dial.applied.toFixed(6)}s ` +
    `rather than ${dial.wanted.toFixed(6)}s${wrap}`
  );
}

/**
 * Load an emitted pair through the real spine-core, without touching the pages.
 *
 * `TextureAtlas` needs only the atlas TEXT — the page sizes and region rectangles
 * are in it — so this runs on a build whose `--out` was never written, which is
 * what `explain` is. Reading the PNGs is `posableFromText`'s job and it needs
 * them because it rasterises.
 */
export function skeletonDataFromText(skeletonText: string, atlasText: string): SkeletonData {
  const atlas = new TextureAtlas(atlasText);
  return new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(JSON.parse(skeletonText));
}

/**
 * Measure every deform key of every animation.
 *
 * `exempt` holds slot names to pass over — A39 hands it `invariants.deformMayFold`
 * so a declared fold is not measured at all. ⚠️ The **report** hands it an empty
 * set on purpose: an exempted slot is the one an author most wants figures for,
 * and a report that went quiet where the gate does would leave the only surface
 * that can say anything about a declared fold saying nothing.
 *
 * ⭐ Not the same thing as `draw.blank` on a key, and the difference is the whole
 * of issue #401: `exempt` is a **declaration** about a slot for all time and is
 * not measured, `draw.blank` is a **measurement** of one key at one time and
 * cannot be declared. A key that draws nothing is still surveyed and still
 * printed; what it is not is gated.
 */
export function surveyDeformKeys(data: SkeletonData, exempt: ReadonlySet<string> = new Set()): DeformSurvey {
  const keys: DeformKeyMeasure[] = [];
  const spans: DeformSpan[] = [];
  const exempted = new Set<string>();
  const notAMesh = new Set<string>();
  let timelines = 0;
  let trianglesMeasured = 0;
  let collapsedTotal = 0;
  let notDrawn = 0;
  let notDrawnReversed = 0;
  let notReachable = 0;
  let notReachableReversed = 0;
  let spansNotScanned = 0;
  const reaches = reachesOf(data);
  for (const anim of data.animations) {
    // One pass per way in (issue #407). The animations nothing applies get the
    // single track pass this loop has always been.
    for (const dials of reaches.get(anim.name) ?? [null]) {
      const poseFrame = (time: number): PoseOfFrame =>
        dials === null ? { posed: poseAt(data, anim.name, time), dial: null } : poseDial(data, dials, time);
      const reach = dials === null ? TRACK_REACH : dials.reach;
      for (const timeline of anim.timelines) {
        if (!(timeline instanceof DeformTimeline)) continue;
        timelines++;
        const attachment = timeline.attachment;
        const slotName = data.slots[timeline.slotIndex]?.name ?? `#${timeline.slotIndex}`;
        // A bounding box, a clipping polygon and a path all have a vertex array
        // and NO triangles, so they have no winding to keep and no area to take a
        // ratio of. Saying nothing about them beats inventing a measurement.
        if (!(attachment instanceof MeshAttachment)) {
          notAMesh.add(`"${slotName}"`);
          continue;
        }
        if (exempt.has(slotName)) {
          exempted.add(`"${slotName}"`);
          continue;
        }
        const triangles = attachment.triangles;
        if (!triangles || triangles.length < 3) continue; // A04 owns a mesh with no triangles
        const placement = placementOf(data, timeline.slotIndex, attachment);
        const named = {
          animation: anim.name,
          skin: placement.skin,
          slot: slotName,
          attachment: attachment.name,
          placeholder: placement.placeholder,
        };
        /** The previous key's posed frame, kept so the span between them can be scanned. */
        let previous: PosedFrame | null = null;
        for (let frame = 0; frame < timeline.frames.length; frame++) {
          const time = timeline.frames[frame];
          const at = poseFrame(time);
          const frameMeasure = measurePosed(at.posed, time, timeline.slotIndex, attachment, triangles, reach, at.dial);
          // A key that draws no pixels — or one at a time no dial can select —
          // is measured and then left out of the totals, because those totals
          // are "what the gate ran on": A39 reads them onto its stats line and
          // the report's rollup has to match them.
          if (at.dial?.unreachable === true) {
            notReachable++;
            notReachableReversed += frameMeasure.measure.reversed.length;
          } else if (frameMeasure.measure.draw.blank === null) {
            trianglesMeasured += frameMeasure.measure.triangles;
            collapsedTotal += frameMeasure.measure.collapsed;
          } else {
            notDrawn++;
            notDrawnReversed += frameMeasure.measure.reversed.length;
          }
          keys.push({ ...named, key: frame, time, ...frameMeasure.measure });
          if (previous !== null) {
            // ⚠️ A span whose end is a frame the runtime cannot reach has no
            // interpolation to scan: the anchors it would solve the quadratic
            // over are two poses of some other time. Counted, never silent.
            if (at.dial?.unreachable === true || previous.measure.dial?.unreachable === true) {
              spansNotScanned++;
            } else {
              spans.push(
                scanDeformSpan(
                  anim,
                  timeline,
                  attachment,
                  triangles,
                  named,
                  frame - 1,
                  previous,
                  frameMeasure,
                  poseFrame,
                ),
              );
            }
          }
          previous = frameMeasure;
        }
      }
    }
  }
  let spanProbes = 0;
  let spanFolds = 0;
  let spansNotDrawn = 0;
  let spansUnconfirmed = 0;
  for (const span of spans) {
    spanProbes += span.probed.length;
    if (span.fold !== null) spanFolds++;
    if (span.notDrawn > 0) spansNotDrawn++;
    if (span.unconfirmed) spansUnconfirmed++;
  }
  return {
    keys,
    timelines,
    exempted: [...exempted],
    notAMesh: [...notAMesh],
    trianglesMeasured,
    collapsed: collapsedTotal,
    notDrawn,
    notDrawnReversed,
    notReachable,
    notReachableReversed,
    spans,
    spanFolds,
    spansNotDrawn,
    spansUnconfirmed,
    spansNotScanned,
    spanProbes,
  };
}

// ---------------------------------------------------------------------------
// Which frame a key is posed in — issue #407
// ---------------------------------------------------------------------------

/**
 * The six local fields of a `BonePose` a `FromProperty` can be made to read.
 *
 * In `SkeletonJson.fromProperty`'s own order, and the property name a reach
 * reports is this list's entry rather than a second table: `rotation` is spelled
 * `rotate` in a rig spec and the rest are spelled as they are here.
 */
const DIAL_FIELDS = ['rotation', 'x', 'y', 'scaleX', 'scaleY', 'shearY'] as const;
type DialField = (typeof DIAL_FIELDS)[number];

/** The rig-spec spelling of one of those, which is the name a report prints. */
const DIAL_PROPERTY: Record<DialField, string> = {
  rotation: 'rotate',
  x: 'x',
  y: 'y',
  scaleX: 'scaleX',
  scaleY: 'scaleY',
  shearY: 'shearY',
};

/**
 * How far a field is nudged to find out whether it moves the slider's time.
 *
 * A scale is a multiplier around 1 and the others are degrees or units around 0,
 * so one step of each is a different size. The number only has to be large enough
 * that the resulting change in the property is not float noise and small enough
 * not to wrap a rotation: any value in between gives the same answer, because
 * every one of these readers is affine in its own field at a fixed parent pose.
 */
function dialStep(field: DialField): number {
  return field === 'scaleX' || field === 'scaleY' ? 0.25 : 1;
}

/**
 * A slider whose animation is being posed, with everything the inversion needs
 * measured off the runtime rather than assumed.
 */
interface DialPlan {
  slider: SliderData;
  reach: DeformReach;
  /**
   * The bone field that drives it, or `null` on a bone-less slider — whose time
   * IS its pose value and is set directly.
   */
  field: DialField | null;
  /** Two points of the affine map `local field -> property value`, from probes. */
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/**
 * How near the wanted time the runtime has to land before the dial is called
 * good, in seconds.
 *
 * Nothing is being tuned here: on an affine reader the residual is float64 noise
 * — 1e-15 on `gallery/look` — and the two failures this separates it from are
 * both *gross*. `FromRotate`'s wrap moves the value by 360, so the time moves by
 * `360 · scale`; `Math.max(0, time)` moves it by the whole of whatever was
 * negative. There is nothing measured between the two.
 */
const DIAL_TIME_EPSILON = 1e-6;

/** How many secant steps the solve takes before it calls a time unreachable. */
const DIAL_SOLVE_STEPS = 4;

/**
 * Every way each animation is reached, keyed by animation name.
 *
 * A `null` entry in the returned list is the track — the frame every animation
 * had before #407 — and it is what an animation NO slider applies gets. An
 * animation a slider applies gets one plan per slider and no track entry, on
 * spine-core's own statement that *"slider animations are designed to be applied
 * by slider constraints rather than on their own"*
 * (`SkeletonData.findSliderAnimations`).
 *
 * ⚠️ A slider **muted at setup** applies nothing: `Slider.update` returns before
 * it reads the bone when `mix` is 0. So it is not a way in, and its animation
 * keeps the track frame — which is the older idiom of muting at setup and keying
 * `slider.<name>.mix` from a playing animation, where the frame the deform keys
 * actually occur in is that playing animation's, and rigc has no way to know
 * which one that is.
 */
function reachesOf(data: SkeletonData): Map<string, Array<DialPlan | null>> {
  const out = new Map<string, Array<DialPlan | null>>();
  for (const anim of data.animations) out.set(anim.name, []);
  for (const constraint of data.constraints) {
    if (!(constraint instanceof SliderData)) continue;
    if (constraint.setupPose.mix === 0) continue;
    const list = out.get(constraint.animation?.name ?? '');
    if (list === undefined) continue;
    const plan = planDial(data, constraint);
    if (plan !== null) list.push(plan);
  }
  for (const list of out.values()) if (list.length === 0) list.push(null);
  return out;
}

/** The `Slider` on `skeleton` that `data` describes, or `null`. */
function sliderOn(skeleton: Skeleton, data: SliderData): Slider | null {
  for (const constraint of skeleton.constraints) {
    if (constraint instanceof Slider && constraint.data === data) return constraint;
  }
  return null;
}

/**
 * Find which local field of the driving bone moves a slider's time, and read the
 * affine map from that field to the property value off two probes.
 *
 * ⭐ **Probed rather than tabulated.** Which `BonePose` field a `FromProperty`
 * reads is spine-core's business, and under `local: false` the reader goes
 * through the world transform — so a table here would be a second copy of the
 * runtime's dispatch AND a claim about parents this file has no business making.
 * Two calls to `data.property.value` — the same call `Slider.update` makes, with
 * the same all-zero offsets — say it instead, and every one of the six readers is
 * affine in its own field at a fixed parent pose, so two points are the whole map.
 */
function planDial(data: SkeletonData, slider: SliderData): DialPlan | null {
  const reach = (field: DialField | null): DeformReach => ({
    kind: 'slider',
    slider: slider.name,
    bone: slider.bone?.name ?? null,
    property: field === null ? null : DIAL_PROPERTY[field],
    local: slider.local,
    label:
      field === null
        ? `applied by slider "${slider.name}" at its own time`
        : `applied by slider "${slider.name}" off ${slider.bone?.name ?? '?'}.${DIAL_PROPERTY[field]}` +
          `${slider.local ? ' (local)' : ' (world)'}`,
  });
  // The bone-less form: `Slider.update` leaves `p.time` alone, so the dial IS the
  // pose value and the map is the identity.
  if (slider.bone === null) return { slider, reach: reach(null), field: null, u0: 0, v0: 0, u1: 1, v1: 1 };
  const skeleton = new Skeleton(data);
  const instance = sliderOn(skeleton, slider);
  const bone = instance?.bone ?? null;
  if (instance === null || bone === null) return null;
  for (const field of DIAL_FIELDS) {
    const step = dialStep(field);
    skeleton.setupPose();
    const base = bone.pose[field];
    const v0 = dialValue(skeleton, slider, bone, field, base);
    const v1 = dialValue(skeleton, slider, bone, field, base + step);
    if (v1 === v0) continue;
    return { slider, reach: reach(field), field, u0: base, v0, u1: base + step, v1 };
  }
  // Nothing moves it: a bone another constraint pins, or a reader that cannot see
  // this bone at all. A37 owns the `scale: 0` shape of the same silence.
  return null;
}

/**
 * The property value spine-core reads off the driving bone with its local field
 * set to `u` — `Slider.update`'s own call, at its own point in the update.
 */
function dialValue(skeleton: Skeleton, slider: SliderData, bone: Bone, field: DialField, u: number): number {
  skeleton.setupPose();
  skeleton.update(0);
  bone.pose[field] = u;
  skeleton.updateWorldTransform(Physics.reset);
  if (slider.local) bone.appliedPose.validateLocalTransform(skeleton);
  return slider.property.value(skeleton, bone.appliedPose, slider.local, DIAL_ZERO_OFFSETS);
}

/**
 * The `offsets` argument every `FromProperty.value` takes.
 *
 * `Slider.offsets` is a private all-zero array — a slider has no per-property
 * offset the way a transform constraint does — so this is that constant, spelled
 * out because it cannot be imported.
 */
const DIAL_ZERO_OFFSETS = [0, 0, 0, 0, 0, 0];

/** A posed frame and the dial that selected it, or `null` on a track frame. */
interface PoseOfFrame {
  posed: Skeleton;
  dial: DeformDial | null;
}

/**
 * What `Slider.update` stores in `SliderPose.time` for a wanted animation time.
 *
 * The two clamps at the end of its bone branch, transcribed, because the
 * verification below compares against what the runtime STORED and not against
 * what was asked for. ⚠️ `loop` on a zero-length animation gives NaN here exactly
 * as it does there, which is `A37_SLIDER_CONSTRAINT_EFFECTIVE`'s refusal.
 */
function sliderTimeFor(slider: SliderData, time: number): number {
  if (slider.bone === null) return time;
  if (slider.loop) return slider.animation.duration + (time % slider.animation.duration);
  return Math.max(0, time);
}

/**
 * The skeleton of `data` with `plan`'s slider applying its animation at `time`.
 *
 * Three steps, and each is answerable on its own:
 *
 *  1. **invert the mapping.** `Slider.update` computes
 *     `time = offset + (value − property.offset) · scale`, so the value that
 *     selects `time` is `property.offset + (time − offset) / scale`. This is the
 *     step the whole change is, and it is load-bearing rather than a hint —
 *     everything below aims at the `value` it names and nothing corrects it.
 *  2. **drive the bone until spine-core's own reader returns that value.**
 *     Through the affine map `planDial` measured; a secant closes any residual.
 *     ⚠️ It converges on the VALUE and never on the time, which is what keeps
 *     step 1 checkable: a solve aimed at the time would quietly absorb a wrong
 *     sign or a dropped offset in the inversion and pose the right frame off the
 *     wrong arithmetic — measured, it does exactly that — so the dial the report
 *     prints would be a number no author could use. Aimed at the value, a wrong
 *     inversion drives the bone somewhere else and step 3 says so.
 *  3. **check the runtime agrees.** `SliderPose.time` off the posed skeleton
 *     against `sliderTimeFor` — spine-core's answer, not this function's. A time
 *     no dial value selects is reported and never guessed at.
 */
function poseDial(data: SkeletonData, plan: DialPlan, time: number): PoseOfFrame {
  const slider = plan.slider;
  const wanted = sliderTimeFor(slider, time);
  const value = plan.field === null ? time : slider.property.offset + (time - slider.offset) / slider.scale;
  const posed = new Skeleton(data);
  const instance = sliderOn(posed, slider);
  const bone = instance?.bone ?? null;
  if (instance === null) return { posed: poseAt(data, slider.animation.name, time), dial: null };
  /** Pose with the driving field at `candidate`, and read both sides back. */
  const at = (candidate: number): { read: number; applied: number } => {
    posed.setupPose();
    posed.update(0);
    if (plan.field !== null && bone !== null) bone.pose[plan.field] = candidate;
    else instance.pose.time = candidate;
    posed.updateWorldTransform(Physics.reset);
    if (plan.field === null || bone === null) return { read: candidate, applied: instance.appliedPose.time };
    if (slider.local) bone.appliedPose.validateLocalTransform(posed);
    return {
      read: slider.property.value(posed, bone.appliedPose, slider.local, DIAL_ZERO_OFFSETS),
      applied: instance.appliedPose.time,
    };
  };
  /** The affine first guess, and what it is judged against. */
  const first = plan.u0 + ((value - plan.v0) * (plan.u1 - plan.u0)) / (plan.v1 - plan.v0);
  const near = 1e-9 * (1 + Math.abs(value));
  let u = first;
  let got = at(u);
  // Zero iterations on every affine reader, which is all six of them at a fixed
  // parent pose. The loop is here for the one that is not — `FromRotate` under
  // `local: false`, whose `[0, 360)` wrap is a step in the middle of the range —
  // and where it fails to close, the naive drive is what gets posed and reported,
  // because "the bone put where the mapping says" is the frame an author can act
  // on and a wandered secant point is not.
  let pu = first === plan.u0 ? plan.u1 : plan.u0;
  let pv = Number.NaN;
  for (let step = 0; step < DIAL_SOLVE_STEPS && Math.abs(got.read - value) > near; step++) {
    if (!Number.isFinite(pv)) pv = at(pu).read;
    if (pv === got.read || !Number.isFinite(pv) || !Number.isFinite(got.read)) break;
    const next = u + ((value - got.read) * (u - pu)) / (got.read - pv);
    if (!Number.isFinite(next)) break;
    pu = u;
    pv = got.read;
    u = next;
    got = at(u);
  }
  if (Math.abs(got.read - value) > near && u !== first) {
    u = first;
    got = at(u);
  }
  return {
    posed,
    dial: {
      value,
      driven: u,
      applied: got.applied,
      wanted,
      unreachable: !(Math.abs(got.applied - wanted) <= DIAL_TIME_EPSILON),
    },
  };
}

/**
 * The skeleton of `data`, posed by `animation` at `time`.
 *
 * By the same route A10 steps an animation, and with a fresh state every call:
 * that is what lands the sample exactly ON `time` rather than one update short of
 * it, and it is why a probe between two keys is as trustworthy as a key.
 */
function poseAt(data: SkeletonData, animation: string, time: number): Skeleton {
  const posed = new Skeleton(data);
  const state = new AnimationState(new AnimationStateData(data));
  state.setAnimation(0, animation, false);
  posed.setupPose();
  posed.update(0);
  posed.updateWorldTransform(Physics.reset);
  state.update(time);
  state.apply(posed);
  posed.update(time);
  posed.updateWorldTransform(Physics.update);
  return posed;
}

/** One posed time, measured — and the two world arrays it was measured from. */
interface PosedFrame {
  time: number;
  posed: Skeleton;
  /** The mesh as the runtime deformed it there. */
  deformed: Float32Array;
  /** The same bones with the deform cleared. The denominator, by construction 1.000. */
  plain: Float32Array;
  /** `triangleAreas(plain)`, kept so the span scan does not take it a second time. */
  plainAreas: number[];
  measure: DeformFrameMeasure;
}

/**
 * Everything this file says about one attachment at whatever time a skeleton is
 * already posed at.
 *
 * ⚠️ It **clears the slot's deform array** to take the plain side, so the
 * skeleton it is handed is spent for any purpose that wanted the runtime's own
 * deform back. The span scan below relies on that: it writes its own arrays into
 * the emptied slot to evaluate the two keys' geometry at one pose.
 */
function measurePosed(
  posed: Skeleton,
  time: number,
  slotIndex: number,
  attachment: MeshAttachment,
  triangles: ArrayLike<number>,
  reach: DeformReach,
  dial: DeformDial | null,
): PosedFrame {
  const count = attachment.worldVerticesLength;
  const slot = posed.slots[slotIndex];
  // Read BEFORE the deform is cleared below, and off the same posed skeleton:
  // what the slot shows here and at what alpha is the other half of what this
  // frame does (issue #401).
  const draw = drawOfKey(posed, slotIndex, attachment);
  const deformed = new Float32Array(count);
  attachment.computeWorldVertices(posed, slot, 0, count, deformed, 0, 2);
  // The same bones, with the deform taken away. `computeWorldVertices` reads the
  // array off the slot, so emptying it is the whole control.
  slot.appliedPose.deform.length = 0;
  const plain = new Float32Array(count);
  attachment.computeWorldVertices(posed, slot, 0, count, plain, 0, 2);

  const before = triangleAreas(plain, triangles);
  const after = triangleAreas(deformed, triangles);
  const band = areaBand(before, plain, deformed);

  let moved = 0;
  let maxDisplacement = 0;
  let maxDisplacementVertex = -1;
  for (let v = 0; v * 2 + 1 < count; v++) {
    const dx = deformed[v * 2] - plain[v * 2];
    const dy = deformed[v * 2 + 1] - plain[v * 2 + 1];
    if (dx === 0 && dy === 0) continue;
    moved++;
    const distance = Math.hypot(dx, dy);
    if (distance > maxDisplacement) {
      maxDisplacement = distance;
      maxDisplacementVertex = v;
    }
  }

  const reversed: DeformReversal[] = [];
  let collapsed = 0;
  let degenerate = 0;
  let areaRatioMin: DeformExtreme | null = null;
  let areaRatioMax: DeformExtreme | null = null;
  let stretchMax: DeformExtreme | null = null;
  let stretchMin: DeformExtreme | null = null;
  for (let t = 0; t < before.length; t++) {
    // A triangle with no area at the cleared pose has no winding to keep and no
    // map to take singular values of.
    if (Math.abs(before[t]) <= band) {
      degenerate++;
      continue;
    }
    const ratio = after[t] / before[t];
    if (areaRatioMin === null || ratio < areaRatioMin.value) areaRatioMin = { triangle: t, value: ratio };
    if (areaRatioMax === null || ratio > areaRatioMax.value) areaRatioMax = { triangle: t, value: ratio };
    const stretch = stretchSingularValues(plain, deformed, triangles, t);
    if (stretch !== null) {
      if (stretchMax === null || stretch.max > stretchMax.value) stretchMax = { triangle: t, value: stretch.max };
      if (stretchMin === null || stretch.min < stretchMin.value) stretchMin = { triangle: t, value: stretch.min };
    }
    // A triangle the key collapses ONTO zero has been pinched rather than turned
    // over — a real idiom, counted and never a bar. Its ratio and its stretch are
    // kept above, because a triangle crushed to nothing IS the worst compression
    // on that key and hiding it would flatter the report.
    if (Math.abs(after[t]) <= band) {
      collapsed++;
      continue;
    }
    if (Math.sign(before[t]) !== Math.sign(after[t])) {
      reversed.push({
        triangle: t,
        ids: [triangles[t * 3], triangles[t * 3 + 1], triangles[t * 3 + 2]],
        before: before[t],
        after: after[t],
      });
    }
  }
  return {
    time,
    posed,
    deformed,
    plain,
    plainAreas: before,
    measure: {
      vertices: count / 2,
      moved,
      maxDisplacement,
      maxDisplacementVertex,
      triangles: before.length,
      reversed,
      collapsed,
      degenerate,
      areaRatioMin,
      areaRatioMax,
      stretchMax,
      stretchMin,
      band,
      draw,
      reach,
      dial,
    },
  };
}

/**
 * The dead band a set of areas is read against.
 *
 * Both bands, and the wider one wins. The relative one is about the SHAPE (a
 * triangle with no area has no winding); the noise one is about the arithmetic (a
 * sign read off float32 rounding is not a measurement). Each is the larger on a
 * different mesh.
 */
function areaBand(plainAreas: readonly number[], ...worlds: ReadonlyArray<ArrayLike<number>>): number {
  const largest = plainAreas.reduce((m, a) => Math.max(m, Math.abs(a)), 0);
  let band = largest * DEFORM_AREA_EPSILON;
  for (const world of worlds) band = Math.max(band, float32AreaNoise(world));
  return band;
}

// ---------------------------------------------------------------------------
// Between two keys — issue #403
// ---------------------------------------------------------------------------

/**
 * A closed interval, in whatever the caller is measuring. Empty when `hi < lo`.
 */
interface Interval {
  lo: number;
  hi: number;
}

/** One straight piece of the curve the runtime reads a span's fraction off. */
interface CurveLeg {
  t0: number;
  p0: number;
  t1: number;
  p1: number;
}

/**
 * The runtime's own interpolation fraction over one span, as a polyline in
 * `(time, fraction)`.
 *
 * ⭐ **Read off `timeline.curves`, not re-derived from the cubic.**
 * `DeformTimeline.getCurvePercent` evaluates a bezier by walking the ten points
 * the parser sampled into that array and interpolating *linearly* between them —
 * so the polyline below is not an approximation of what the runtime does, it is
 * what the runtime does. A curve that overshoots (a fraction below 0 or above 1,
 * which the format allows and `back`-style easings produce) is therefore inside
 * this rather than assumed away.
 */
function curveLegs(timeline: DeformTimeline, frame: number): { kind: DeformSpanCurve; legs: CurveLeg[] } {
  const t0 = timeline.frames[frame];
  const t1 = timeline.frames[frame + 1];
  const curves = curveStorage(timeline);
  const code = curves[frame];
  // 1 is STEPPED: `getCurvePercent` returns a flat 0 across the whole span, so
  // the runtime holds the earlier key's geometry and interpolates nothing.
  if (code === 1) return { kind: 'stepped', legs: [{ t0, p0: 0, t1, p1: 0 }] };
  if (code === 0) return { kind: 'linear', legs: [{ t0, p0: 0, t1, p1: 1 }] };
  // 2 + i is BEZIER, with the sampled points starting at `i`. Nine of them are
  // stored; the runtime ramps into the first from (t0, 0) and out of the last to
  // (t1, 1), which is the two legs added either side.
  const legs: CurveLeg[] = [];
  let x = t0;
  let y = 0;
  for (let i = code - 2, n = code - 2 + BEZIER_POINTS * 2; i < n; i += 2) {
    legs.push({ t0: x, p0: y, t1: curves[i], p1: curves[i + 1] });
    x = curves[i];
    y = curves[i + 1];
  }
  legs.push({ t0: x, p0: y, t1, p1: 1 });
  return { kind: 'bezier', legs };
}

/** Points `CurveTimeline.setBezier` stores per curve — `BEZIER_SIZE / 2`. */
const BEZIER_POINTS = 9;

/**
 * `CurveTimeline.curves`, which is `protected` and is read anyway.
 *
 * ⚠️ A deliberate reach into the runtime's own storage, in the one file whose
 * whole job is reading what the runtime will do. The public surface is
 * `getCurvePercent(time, frame)` — a fraction at a time — and the scan needs the
 * inverse and the reachable range, which no sequence of forward evaluations
 * gives exactly: the breakpoints of the polyline it interpolates over are
 * precisely what this array holds, and any other route to them would be sampling
 * with a spacing to defend. The alternative considered and rejected was
 * re-deriving the sampling from the four bezier handles in the emitted JSON,
 * which would be a **second** derivation of the runtime's own arithmetic — the
 * thing this file's opening paragraph forbids — and would then be checking
 * rigc's copy of spine-core's maths rather than spine-core's.
 *
 * `A05` already gates the emitted curve arrays, and `DW18` is the control that
 * the reading here matches what the runtime does with them.
 */
function curveStorage(timeline: DeformTimeline): ArrayLike<number> {
  return (timeline as unknown as { curves: ArrayLike<number> }).curves;
}

/** The fractions this span's curve actually reaches, overshoot included. */
function reachedFractions(legs: readonly CurveLeg[]): Interval {
  let lo = Infinity;
  let hi = -Infinity;
  for (const leg of legs) {
    lo = Math.min(lo, leg.p0, leg.p1);
    hi = Math.max(hi, leg.p0, leg.p1);
  }
  return { lo, hi };
}

/**
 * The times at which the curve's fraction is inside `window`, as intervals.
 *
 * Every leg is straight, so each contributes one interval and the answer is
 * exact — a non-monotone curve simply contributes more than one.
 */
function timesAtFractions(legs: readonly CurveLeg[], window: Interval): Interval[] {
  const out: Interval[] = [];
  for (const leg of legs) {
    if (leg.p0 === leg.p1) {
      if (leg.p0 >= window.lo && leg.p0 <= window.hi) out.push({ lo: leg.t0, hi: leg.t1 });
      continue;
    }
    const at = (p: number): number => leg.t0 + ((leg.t1 - leg.t0) * (p - leg.p0)) / (leg.p1 - leg.p0);
    const a = at(window.lo);
    const b = at(window.hi);
    const lo = Math.max(Math.min(leg.t0, leg.t1), Math.min(a, b));
    const hi = Math.min(Math.max(leg.t0, leg.t1), Math.max(a, b));
    if (hi >= lo) out.push({ lo, hi });
  }
  return out;
}

/** The fraction the curve is at, at one time. */
function fractionAt(legs: readonly CurveLeg[], time: number): number {
  for (const leg of legs) {
    if (time < Math.min(leg.t0, leg.t1) || time > Math.max(leg.t0, leg.t1)) continue;
    if (leg.t1 === leg.t0) return leg.p0;
    return leg.p0 + ((leg.p1 - leg.p0) * (time - leg.t0)) / (leg.t1 - leg.t0);
  }
  return legs[legs.length - 1].p1;
}

/** Overlapping intervals folded into the maximal ones they cover. */
function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals].filter((i) => i.hi > i.lo).sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  const out: Interval[] = [];
  for (const interval of sorted) {
    const last = out[out.length - 1];
    if (last !== undefined && interval.lo <= last.hi) last.hi = Math.max(last.hi, interval.hi);
    else out.push({ ...interval });
  }
  return out;
}

/**
 * Where a triangle's area has the **wrong sign** over one span, in the
 * interpolation fraction — the closed form, and the whole reason this scan needs
 * no subdivision count.
 *
 * ## The arithmetic, in full, because it is four lines
 *
 * `DeformTimeline.applyToSlot` writes `v1 + (v2 − v1)·p` into the slot's deform
 * array, and a world vertex is an **affine** function of that array at a fixed
 * pose — unweighted, the array *is* the local positions; weighted, each pair is
 * added in a bone's bind space and summed with fixed weights. So over one span
 * every vertex travels a straight line, `W(p) = A + p·(B − A)`, and a triangle's
 * doubled signed area is a cross product of two such lines:
 *
 *     2A(p) = (e₁ + p·d₁) × (e₂ + p·d₂)
 *           = e₁×e₂  +  p·(e₁×d₂ + d₁×e₂)  +  p²·(d₁×d₂)
 *
 * — a **quadratic in p, exactly**, with `e` the edges at `p = 0` and `d` the
 * edges of the displacement to `p = 1`. The reversal condition is therefore two
 * roots of a quadratic, not a search, and there is no sample spacing to defend.
 *
 * ⭐ Compare `turnCeiling` in [`src/depth.ts`](src/depth.ts), which is the same
 * move on the other side of the wall: there a yaw makes the area linear in
 * `cos t` and `sin t` and the fold angle is `atan(A₀/A_axis)`; here the runtime's
 * own interpolation makes it quadratic in `p` and the fold fraction is a root.
 * Both replace "build, read the refusal, guess again" with arithmetic.
 *
 * 🚨 **What is NOT closed-form is the pose.** `A(p)` above holds the bones still.
 * The bones move across a span too, and on a WEIGHTED mesh their motion changes
 * the map from offsets to world — so this is evaluated at both of the span's own
 * key poses and the union taken, and whatever it names is then *measured* at the
 * real posed time before anything is refused. On an unweighted mesh the question
 * does not arise at all: one bone matrix multiplies every vertex, so its
 * determinant factors out of both sides of the comparison and the reversal is a
 * property of the offsets alone.
 */
function wrongSignFractions(
  c0: number,
  c1: number,
  c2: number,
  plainArea: number,
  band: number,
  reach: Interval,
): Interval[] {
  // g(p) < 0 is "reversed by more than the band", with the sign folded in so the
  // question is the same one whichever way the mesh is wound.
  const s = plainArea > 0 ? 1 : -1;
  const a = s * c2;
  const b = s * c1;
  const c = s * c0 + band;
  const clip = (lo: number, hi: number): Interval[] => {
    const out = { lo: Math.max(lo, reach.lo), hi: Math.min(hi, reach.hi) };
    return out.hi >= out.lo ? [out] : [];
  };
  if (a === 0) {
    // Degenerate to a straight line, which is what a deform that moves one axis
    // only comes to — a `yaw` leaves y alone, so its areas are affine in `p` and
    // two unfolded keys cannot fold between them at all (`DW14`).
    if (b === 0) return c < 0 ? [{ ...reach }] : [];
    const root = -c / b;
    return b > 0 ? clip(-Infinity, root) : clip(root, Infinity);
  }
  const discriminant = b * b - 4 * a * c;
  // No crossing: the sign of `a` is the sign of `g` everywhere.
  if (discriminant <= 0) return a < 0 ? [{ ...reach }] : [];
  const sq = Math.sqrt(discriminant);
  const left = Math.min((-b - sq) / (2 * a), (-b + sq) / (2 * a));
  const right = Math.max((-b - sq) / (2 * a), (-b + sq) / (2 * a));
  // ⚠️ An upward parabola is wrong-signed BETWEEN its roots; a downward one is
  // wrong-signed OUTSIDE them, and those are two disjoint windows with a
  // correctly-wound middle. Merging them into one — which this did until it was
  // read back — would put the probe's midpoint in that middle and report a fold
  // nothing reproduced.
  return a > 0 ? clip(left, right) : [...clip(-Infinity, left), ...clip(right, Infinity)];
}

/**
 * The times at which the slot's **visibility** can change across a span.
 *
 * ⚠️ This is the half of issue #403 that is about the fade rather than the fold,
 * and getting it wrong in either direction is a defect: read the alpha only at
 * the keys and a correct rig that fades out over the fold is refused (undoing
 * issue #401); probe one arbitrary time inside the fold window and a fold that is
 * drawn for only part of that window is missed.
 *
 * ⭐ The way out needs no threshold. A slot's alpha and its attachment are
 * piecewise functions of time whose pieces are **the slot timelines' own key
 * times**, so `alpha == 0` can start or stop only there. Splitting the fold
 * window at those times leaves pieces on which "does this draw?" has one answer,
 * and the probe inside a piece is representative of the whole piece.
 *
 * Every timeline carrying a `slotIndex` counts, for this slot and for any other
 * slot the deform reaches (`timelineSlots`) — duck-typed rather than matched
 * against a list of classes, because a list is a thing that goes stale when the
 * format grows a timeline and the failure would be silent.
 */
function visibilityKeyTimes(timelines: readonly Timeline[], slots: ReadonlySet<number>): number[] {
  const times: number[] = [];
  for (const timeline of timelines) {
    const carrier = timeline as unknown as { slotIndex?: unknown };
    if (typeof carrier.slotIndex !== 'number' || !slots.has(carrier.slotIndex)) continue;
    const entries = timeline.getFrameEntries();
    for (let i = 0; i < timeline.getFrameCount(); i++) times.push(timeline.frames[i * entries]);
  }
  return times;
}

/**
 * Scan the interval between two consecutive deform keys (issue #403).
 *
 * ## What it does, in order
 *
 * 1. **Solve.** At each of the span's two key poses, take every triangle's
 *    quadratic (`wrongSignFractions`) and collect the fractions at which it is
 *    reversed. Nothing is measured here and nothing is refused here.
 * 2. **Convert.** Map those fractions to times through the runtime's own curve
 *    polyline (`timesAtFractions`), keep only what is **strictly inside** the
 *    span — the two ends are the keys, and the key survey owns those — and merge
 *    the overlaps.
 * 3. **Split.** Cut each merged window at the slot's own visibility key times, so
 *    no piece straddles a change in what is drawn.
 * 4. **Measure.** Pose the skeleton at one time inside each piece and take this
 *    file's ordinary measurement there, alpha included, in time order. Stop at
 *    the first piece that comes back with a reversal on a frame that draws.
 *
 * ⇒ Nothing is refused on a prediction. What A39 reads is step 4's measurement,
 * at a real time, through the real runtime — the closed form only decides *where
 * to look*, which is exactly the part a subdivision count would have been
 * guessing at.
 *
 * ## Cost — measured, because the multiplier had to be chosen rather than assumed
 *
 * Step 1 is **one** extra `computeWorldVertices` per span per anchor (the other
 * end of the line is the anchor key's own `deformed` array) plus three cross
 * products per triangle; steps 2–3 are interval arithmetic, `O(triangles)`.
 * **Step 4 costs nothing at all on a span nothing is predicted in**, which is
 * every span of every green rig, and that is what keeps the whole figure a
 * fraction rather than a multiple. Against the same survey with this function
 * switched off, same process, alternated, on the `2026-09-05-density` study's
 * own grid ladder and on the four gallery rigs that carry a deform timeline:
 *
 * | fixture | keys | spans | triangle samples | keys only | + spans |
 * | --- | ---: | ---: | ---: | ---: | ---: |
 * | `grid-129`, weighted, 32,768 triangles | 4 | 3 | 131,072 | 5.5 ms | **8.1 ms (×1.47)** |
 * | `grid-97`, weighted, 18,432 triangles | 4 | 3 | 73,728 | 3.4 ms | 4.7 ms (×1.40) |
 * | `gallery/flex`, weighted, 75 triangles | 8 | 6 | 600 | 0.16 ms | 0.30 ms (×1.9) |
 * | `gallery/nod` | 36 | 30 | 624 | 0.34 ms | 0.46 ms (×1.37) |
 * | `gallery/portrait`, unweighted | 8 | 6 | 192 | 0.22 ms | 0.25 ms (×1.12) |
 *
 * ⇒ **The survey costs about half as much again**, and where in that range a rig
 * lands is set by two things and not by the triangle count: how many spans it
 * has per key (a timeline of two keys has one span; `nod`'s 36 keys have 30),
 * and whether the mesh is weighted — an unweighted one takes a single anchor for
 * the reason above and a much cheaper `computeWorldVertices` with it. ⚠️ Read
 * the ratio at `grid-129` and treat the sub-millisecond rows as noisy: they move
 * ±15% between runs, which is the caveat the density study's README already
 * carries about single readings. On a rig that DOES fold, add one posed
 * measurement — the cost of one key — per predicted window, and the build is
 * being refused anyway.
 */
function scanDeformSpan(
  anim: { name: string; timelines: Timeline[] },
  timeline: DeformTimeline,
  attachment: MeshAttachment,
  triangles: ArrayLike<number>,
  named: { animation: string; skin: string; slot: string; attachment: string; placeholder: string },
  /** The index of the key the span starts at — `frame + 1` is the one it ends at. */
  frame: number,
  from: PosedFrame,
  to: PosedFrame,
  /**
   * The same frame the two keys were posed in, at a time between them (#407).
   * A probe taken on a track while a slider applies the animation elsewhere is
   * the frame that never occurs, one interpolation step further in.
   */
  poseFrame: (time: number) => PoseOfFrame,
): DeformSpan {
  const { kind, legs } = curveLegs(timeline, frame);
  const span: DeformSpan = {
    ...named,
    reach: from.measure.reach,
    fromKey: frame,
    toKey: frame + 1,
    fromTime: from.time,
    toTime: to.time,
    curve: kind,
    predicted: 0,
    probed: [],
    fold: null,
    notDrawn: 0,
    unconfirmed: false,
  };
  const count = attachment.worldVerticesLength;
  const reach = reachedFractions(legs);
  const v1 = timeline.vertices[frame];
  const v2 = timeline.vertices[frame + 1];
  if (!v1 || !v2) return span;

  const windows: Interval[] = [];
  const flagged = new Set<number>();
  // ⭐ **One anchor on an unweighted attachment, and it costs nothing to be
  // sure of.** Every vertex of one is transformed by the SAME bone matrix `M`,
  // so a triangle's world area is `det M` times its local area on both sides of
  // the comparison and the factor cancels: whether the deform reverses a
  // winding is then a property of the offsets alone, identical at every pose,
  // and the second anchor would recompute the same answer. A WEIGHTED
  // attachment blends a different matrix per vertex, `det` does not factor out,
  // and the fixed-pose quadratic is only exact where the bones hold still — so
  // both of the span's own key poses are taken and the union used. `DW17` is
  // the control for the claim: a bone rotation across the span moves nothing
  // about where an unweighted mesh is found to fold.
  for (const anchor of attachment.bones === null ? [from] : [from, to]) {
    // The two ends of the straight line every vertex travels, evaluated at THIS
    // anchor's bones. `measurePosed` has already emptied the slot's deform array
    // to take its plain side, so writing into it is how the two are posed.
    //
    // ⭐ Half of these four are already in hand. At a key's own time the
    // runtime's interpolation fraction is 0, so `applyToSlot` copies that key's
    // array verbatim — which makes the anchor's own `deformed` exactly the end
    // of the line that belongs to it, provided the slot was showing the mesh
    // there for the runtime to have applied anything at all.
    const own = anchor.measure.draw.showsThisMesh;
    const a =
      own && anchor === from ? from.deformed : worldWithDeform(anchor.posed, timeline.slotIndex, attachment, v1, count);
    const b =
      own && anchor === to ? to.deformed : worldWithDeform(anchor.posed, timeline.slotIndex, attachment, v2, count);
    // The anchor's own plain areas, taken once when it was measured as a key —
    // the same numbers, so the span cannot disagree with the key about which
    // triangles have a winding to keep.
    const plainAreas = anchor.plainAreas;
    const band = areaBand(plainAreas, anchor.plain, a, b);
    for (let t = 0; t < plainAreas.length; t++) {
      if (Math.abs(plainAreas[t]) <= band) continue; // no winding to keep
      const i0 = triangles[t * 3] * 2;
      const i1 = triangles[t * 3 + 1] * 2;
      const i2 = triangles[t * 3 + 2] * 2;
      const e1x = a[i1] - a[i0];
      const e1y = a[i1 + 1] - a[i0 + 1];
      const e2x = a[i2] - a[i0];
      const e2y = a[i2 + 1] - a[i0 + 1];
      const d1x = b[i1] - b[i0] - e1x;
      const d1y = b[i1 + 1] - b[i0 + 1] - e1y;
      const d2x = b[i2] - b[i0] - e2x;
      const d2y = b[i2 + 1] - b[i0 + 1] - e2y;
      const c0 = 0.5 * (e1x * e2y - e2x * e1y);
      const c1 = 0.5 * (e1x * d2y - d2x * e1y + d1x * e2y - e2x * d1y);
      const c2 = 0.5 * (d1x * d2y - d2x * d1y);
      for (const wrong of wrongSignFractions(c0, c1, c2, plainAreas[t], band, reach)) {
        const inside = timesAtFractions(legs, wrong)
          .map((i) => ({ lo: Math.max(i.lo, from.time), hi: Math.min(i.hi, to.time) }))
          .filter((i) => i.hi > i.lo);
        if (inside.length === 0) continue;
        flagged.add(t);
        windows.push(...inside);
      }
    }
  }
  span.predicted = flagged.size;
  if (windows.length === 0) return span;

  // Split each merged window at the slot's own visibility keys, so no piece
  // straddles a change in what is drawn. Every point of a merged window is
  // inside at least one triangle's window, so its middle is a fold and not a gap.
  const slots = new Set<number>([timeline.slotIndex, ...attachment.timelineSlots]);
  const cuts = visibilityKeyTimes(anim.timelines, slots);
  const pieces: Interval[] = [];
  for (const window of mergeIntervals(windows)) {
    const inner = [...new Set(cuts.filter((t) => t > window.lo && t < window.hi))].sort((x, y) => x - y);
    let lo = window.lo;
    for (const cut of [...inner, window.hi]) {
      if (cut > lo) pieces.push({ lo, hi: cut });
      lo = cut;
    }
  }
  for (const piece of pieces) {
    const time = (piece.lo + piece.hi) / 2;
    const at = poseFrame(time);
    // A probe the dial cannot select is no probe: it would be measuring some
    // other time. Both keys bounding this span were reachable, and the map from
    // dial to time is affine, so this is a shape nothing in the corpus reaches —
    // which is exactly why it must not be recorded as a probe that ran.
    if (at.dial?.unreachable === true) continue;
    span.probed.push(time);
    const probe = measurePosed(
      at.posed,
      time,
      timeline.slotIndex,
      attachment,
      triangles,
      from.measure.reach,
      at.dial,
    );
    if (probe.measure.reversed.length === 0) continue;
    if (probe.measure.draw.blank !== null) {
      span.notDrawn++;
      continue;
    }
    span.fold = { time, percent: fractionAt(legs, time), measure: probe.measure };
    return span;
  }
  span.unconfirmed = span.fold === null && span.notDrawn === 0;
  return span;
}

/**
 * The mesh's world vertices with one deform array written into the slot.
 *
 * The array is copied rather than aliased: for an unweighted attachment with no
 * `vertices` on its key, `SkeletonJson` stores the ATTACHMENT'S OWN setup array
 * as that key's deform, and handing the runtime a live reference to it would let
 * a later write edit the mesh itself.
 */
function worldWithDeform(
  posed: Skeleton,
  slotIndex: number,
  attachment: MeshAttachment,
  deform: ArrayLike<number>,
  count: number,
): Float32Array {
  const slot = posed.slots[slotIndex];
  const array = slot.appliedPose.deform;
  array.length = deform.length;
  for (let i = 0; i < deform.length; i++) array[i] = deform[i];
  const world = new Float32Array(count);
  attachment.computeWorldVertices(posed, slot, 0, count, world, 0, 2);
  array.length = 0;
  return world;
}

/**
 * What one slot shows of one mesh at the pose it is currently in, and at what
 * alpha — with no opinion about whether that is a reason for anything.
 *
 * `alpha` is `slot.color.a × attachment.color.a`, which is the product
 * `src/render.ts` builds a piece's tint from; it is 0 when the slot shows some
 * other attachment, because then none of this mesh is on screen. The skeleton's
 * own colour is deliberately not a factor: it is runtime state a consumer sets,
 * not something the skeleton data can say, and `src/render.ts` does not read it
 * either.
 */
function shownAt(
  posed: Skeleton,
  slotIndex: number,
  attachment: MeshAttachment,
): { shown: Attachment | null; showsThisMesh: boolean; slotAlpha: number; attachmentAlpha: number; alpha: number } {
  const pose = posed.slots[slotIndex]?.appliedPose;
  const shown = pose?.attachment ?? null;
  // The same comparison `DeformTimeline.applyToSlot` makes before it writes
  // anything, so "shown" here means exactly "the runtime deforms it here".
  const showsThisMesh = shown !== null && shown.timelineAttachment === attachment;
  const slotAlpha = pose?.color.a ?? 0;
  const attachmentAlpha = shown instanceof MeshAttachment ? shown.color.a : 1;
  return {
    shown,
    showsThisMesh,
    slotAlpha,
    attachmentAlpha,
    alpha: showsThisMesh ? slotAlpha * attachmentAlpha : 0,
  };
}

/**
 * Whether this key's mesh draws any pixels at this key's own time, and if not,
 * the sentence that says why (issue #401).
 *
 * ## The two ways a key draws nothing, and the one bar
 *
 * - **The slot shows something else** — or nothing. The runtime then applies no
 *   deform to the slot at all, so the mesh is neither on screen nor deformed.
 * - **The slot's alpha is exactly 0.** Every blend mode the format has multiplies
 *   the source by that alpha, so no channel of the destination moves.
 *
 * 🚨 **Exactly 0.** Not "small", not "below a floor". At 0.5 a reversed triangle
 * is visible at half strength and A39 goes on refusing it, with the alpha in the
 * message.
 *
 * ⚠️ **A deform reaches more than its own slot.** `Attachment.timelineSlots` (4.3)
 * lists the other slots a deform timeline is applied to, and spine-core applies
 * it to every one of them. So a mesh the timeline's own slot has swapped away may
 * still be drawn — and folded — in another slot, and the exemption is refused
 * unless NONE of the slots the deform reaches draws it. rigc emits no
 * `timelineSlots` of its own, so on a rigc-compiled skeleton the list is empty
 * and this loop runs zero times; it is here because a foreign skeleton reaching
 * `explain` is exactly where a silent false green would be unnoticeable.
 */
function drawOfKey(posed: Skeleton, slotIndex: number, attachment: MeshAttachment): DeformKeyDraw {
  const own = shownAt(posed, slotIndex, attachment);
  const draw = { shown: own.shown?.name ?? null, showsThisMesh: own.showsThisMesh, alpha: own.alpha };
  for (const other of attachment.timelineSlots) {
    if (other === slotIndex) continue;
    const there = shownAt(posed, other, attachment);
    if (there.alpha > 0) {
      // Drawn somewhere the deform reaches, so there is nothing to exempt — and
      // the geometry above was measured on a slot that is not the one drawing
      // it, which the report says out loud rather than passing over.
      return { ...draw, blank: null };
    }
  }
  if (!own.showsThisMesh) {
    const instead = own.shown === null ? 'no attachment at all' : `attachment "${own.shown.name}"`;
    return {
      ...draw,
      blank:
        `the slot shows ${instead} at this time, not this mesh, so the runtime applies no deform to it here ` +
        'and draws none of it',
    };
  }
  if (own.alpha === 0) {
    return {
      ...draw,
      blank:
        `the slot's alpha is exactly 0 at this time (slot ${own.slotAlpha.toFixed(4)} x attachment ` +
        `${own.attachmentAlpha.toFixed(4)}), so this key draws no pixels`,
    };
  }
  return { ...draw, blank: null };
}

/**
 * Which skin holds this attachment, and under which placeholder — the other two
 * thirds of the `skin/slot/attachment` triple the format keys a deform timeline
 * on, and the triple `explain` already prints for the timeline itself.
 *
 * ⚠️ Recovered by identity rather than by name. A `DeformTimeline` carries the
 * attachment it RESOLVED to and neither the skin it came out of nor the
 * placeholder it was written as, and those two are not the same string in
 * general: a skin puts its own attachment behind a shared placeholder, which is
 * the whole point of skins. So the scan compares the attachment object, and the
 * placeholder printed is the one the spec wrote.
 */
function placementOf(
  data: SkeletonData,
  slotIndex: number,
  attachment: MeshAttachment,
): { skin: string; placeholder: string } {
  for (const skin of [data.defaultSkin, ...data.skins]) {
    if (!skin) continue;
    const entries: Array<{ placeholder: string; attachment: unknown }> = [];
    skin.getAttachmentsForSlot(slotIndex, entries as Parameters<typeof skin.getAttachmentsForSlot>[1]);
    for (const entry of entries) {
      if (entry.attachment === attachment) return { skin: skin.name, placeholder: entry.placeholder };
    }
  }
  return { skin: 'default', placeholder: attachment.name };
}
