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
 */
import {
  AnimationState,
  AnimationStateData,
  type Attachment,
  AtlasAttachmentLoader,
  DeformTimeline,
  MeshAttachment,
  Physics,
  Skeleton,
  type SkeletonData,
  SkeletonJson,
  TextureAtlas,
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

/** What one deform key does to one attachment's geometry. */
export interface DeformKeyMeasure {
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
  /** What the slot draws of this mesh at this key's own time (issue #401). */
  draw: DeformKeyDraw;
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
  const exempted = new Set<string>();
  const notAMesh = new Set<string>();
  let timelines = 0;
  let trianglesMeasured = 0;
  let collapsedTotal = 0;
  let notDrawn = 0;
  let notDrawnReversed = 0;
  for (const anim of data.animations) {
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
      const count = attachment.worldVerticesLength;
      const triangles = attachment.triangles;
      if (!triangles || triangles.length < 3) continue; // A04 owns a mesh with no triangles
      for (let frame = 0; frame < timeline.frames.length; frame++) {
        const time = timeline.frames[frame];
        // Posed per key, by the same route A10 steps an animation. A fresh state
        // per key is what lands the sample exactly ON the key rather than one
        // update short of it.
        const posed = new Skeleton(data);
        const state = new AnimationState(new AnimationStateData(data));
        state.setAnimation(0, anim.name, false);
        posed.setupPose();
        posed.update(0);
        posed.updateWorldTransform(Physics.reset);
        state.update(time);
        state.apply(posed);
        posed.update(time);
        posed.updateWorldTransform(Physics.update);
        const slot = posed.slots[timeline.slotIndex];
        // Read BEFORE the deform is cleared below, and off the same posed
        // skeleton: what the slot shows here and at what alpha is the other half
        // of what this key does (issue #401).
        const draw = drawOfKey(posed, timeline.slotIndex, attachment);
        const deformed = new Float32Array(count);
        attachment.computeWorldVertices(posed, slot, 0, count, deformed, 0, 2);
        // The same bones, with the deform taken away. `computeWorldVertices`
        // reads the array off the slot, so emptying it is the whole control.
        slot.appliedPose.deform.length = 0;
        const plain = new Float32Array(count);
        attachment.computeWorldVertices(posed, slot, 0, count, plain, 0, 2);

        const before = triangleAreas(plain, triangles);
        const after = triangleAreas(deformed, triangles);
        const largest = before.reduce((m, a) => Math.max(m, Math.abs(a)), 0);
        // Both bands, and the wider one wins. The relative one is about the
        // SHAPE (a triangle with no area has no winding); the noise one is about
        // the arithmetic (a sign read off float32 rounding is not a
        // measurement). Each is the larger on a different mesh.
        const band = Math.max(largest * DEFORM_AREA_EPSILON, float32AreaNoise(plain), float32AreaNoise(deformed));

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
          // A triangle with no area at the cleared pose has no winding to keep
          // and no map to take singular values of.
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
          // A triangle the key collapses ONTO zero has been pinched rather than
          // turned over — a real idiom, counted and never a bar. Its ratio and
          // its stretch are kept above, because a triangle crushed to nothing IS
          // the worst compression on that key and hiding it would flatter the
          // report.
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
        // A key that draws no pixels is measured and then left out of the
        // totals, because those totals are "what the gate ran on" — A39 reads
        // them onto its stats line and the report's rollup has to match them.
        if (draw.blank === null) {
          trianglesMeasured += before.length;
          collapsedTotal += collapsed;
        } else {
          notDrawn++;
          notDrawnReversed += reversed.length;
        }
        const placement = placementOf(data, timeline.slotIndex, attachment);
        keys.push({
          animation: anim.name,
          skin: placement.skin,
          slot: slotName,
          attachment: attachment.name,
          placeholder: placement.placeholder,
          key: frame,
          time,
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
        });
      }
    }
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
  };
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
