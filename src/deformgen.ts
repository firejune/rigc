/**
 * A `deform` key's offsets, evaluated from a transform the spec states.
 *
 * ## Why this module exists
 *
 * A `deform` timeline was the one place in a rig spec where an author was still
 * transcribing arithmetic. `gallery/portrait`'s held 12° head yaw is **160
 * vertex offsets across 8 keys**, and not one of them is a judgement: every one
 * is `x·(cos t − 1) − z·sin t` evaluated at a different column
 * (docs/FACE.md §1). A second angle is a second full table, which is why that
 * example's own angle sweep needed a throwaway script that was never in the
 * repository — *the measurement existed and the reproduction did not*
 * (issue #294).
 *
 * rigc already had this shape of answer for **geometry**:
 * `generator: { kind: "contour" | "ring" | "ribbon" }` exists because "a table
 * of numbers is the wrong way to say a deformation model" (AUTHORING §3.4).
 * This is the same move on the animation half. **The spec states the model and
 * the compiler states the numbers**, so `explain` can print what a key does, an
 * author can sweep a parameter, and a reviewer can check a claim instead of a
 * transcription.
 *
 * ## What this is NOT, and the three rules that keep it that way
 *
 * 1. **It never authors.** Every parameter arrives from the spec — the angle,
 *    the radius, the amplitude, the point a scale is about. Nothing here has a
 *    default measured off the art, and a missing number is a `CompileError`
 *    naming the field, exactly as everywhere else in the compiler.
 * 2. **It generates no in-betweens.** MOTION §7 refuses a `rigc tween`, and
 *    this is not one: a transform is evaluated **at one key**, from parameters
 *    that key states, and the blend between two keys is still the deform
 *    timeline's own single 0..1 channel. Sweeping an angle is editing one number
 *    per key, never asking the compiler to interpolate a model.
 * 3. **A parameter that cannot mean what it says is refused by name**, on the
 *    principle that a parameter changing nothing is a reader's false lead about
 *    which model produced the numbers: `wavelength: 0`, a determinant at or
 *    below 0, a radius that falls inside the part. Since issue #350 that extends
 *    one step later, to a model whose parameters are each legal and whose
 *    *evaluation* is an all-zero run — the refusal at the bottom of
 *    `evaluateDeformTransform`, whose whole difficulty is telling that apart
 *    from a key that means the identity and says so.
 *
 * ## Determinism
 *
 * Every closed form below is a fixed sequence of float64 operations over
 * numbers read from the spec, in vertex order, with no iteration over an
 * unordered set. The caller quantises with the compiler's own `r6`, so the same
 * spec emits the same bytes — which `A18_DETERMINISTIC_EMIT` proves on a second
 * independent compile. The runtime then loads those decimals into a
 * `Float32Array`, so what a player sees is the float32 nearest the emitted
 * value; that is equally true of a hand-written table and is the reason the
 * offsets are reported in the units they are emitted in rather than at full
 * float64 width.
 */

import { CompileError } from './errors.ts';

/** Which coordinate a bend or a wave reads, and which one it displaces. */
export type DeformAxis = 'x' | 'y';

/**
 * A **2.5D turn**: the part is treated as painted on a cylinder standing on
 * `about`, and the key is that rotation projected back onto the screen.
 *
 * `yaw` stands the cylinder vertically and moves vertices horizontally; `pitch`
 * is the same expression with the axes swapped. docs/FACE.md §1 is the whole
 * derivation, and §4.2 is the angle past which any given column pair folds —
 * this evaluates the projection and says nothing about whether the angle is
 * sane. `A39_DEFORM_KEEPS_TRIANGLE_WINDING` is what catches a fold.
 */
export interface DeformTurn {
  kind: 'yaw' | 'pitch';
  /**
   * The cylinder's radius, in the attachment's own units.
   *
   * ⚠️ **Not the plate's half-width.** For `gallery/portrait`'s head plate the
   * two coincide (340/2 = 170); for its fringe they do not — 372 wide and
   * `radius` 196, because 196 is where the fringe *sits*, 26 in front of the
   * skull. Read it off the depth table, never off the PNG (FACE §4).
   */
  radius?: number;
  /**
   * Read `z` per vertex from the attachment's depth map instead of deriving it
   * from a cylinder — the same closed form with a measured surface under it.
   *
   * ⭐ It replaces `radius`, and stating both is refused: they are two answers
   * to "how far forward is this vertex", and a spec that carries both leaves a
   * reader unable to tell which one the output came from. The map itself is
   * named on the attachment's `generator` ([`src/rig.ts`](rig.ts)), because it
   * is a property of the art rather than of this key — every key that turns
   * this part reads the same surface.
   */
  depth?: boolean;
  /** The turn, in degrees. Positive yaws toward −x, which is FACE §1's sign. */
  degrees: number;
  /** Where the axis crosses the driving coordinate. Default 0. */
  about?: number;
}

/**
 * A **parallax slide**: every vertex moves by its own depth times a stated
 * offset. The small-angle limit of `yaw`/`pitch`, and the form a per-pixel
 * depth shader actually evaluates.
 *
 * `d = z · offset`, per axis, with `z` read off the attachment's depth map. It
 * is `yaw` with the in-plane term dropped: a turn is
 * `dx = u·(cos t − 1) − z·sin t`, and for small `t` the first term is `O(t²)`
 * while the second is `O(t)`. `DP05` measures that difference and finds it to
 * be exactly `u·(cos t − 1)` — independent of the depth, which is why the two
 * forms converge on each other and not merely near each other.
 *
 * ⭐ Two parameters and no angle, which is the point of having it: a pointer or
 * a camera drives `offset` directly, and there is no radius, no `about` and no
 * trigonometry between the input and the geometry.
 *
 * 🚨 It REQUIRES a depth map, and that is a rule rather than a limitation.
 * Without per-vertex `z` every vertex moves by the same amount, which is a
 * translation of the whole attachment — a bone move, keyed on the bone, at no
 * cost in deform data. A deform run that says what a translate says is a
 * hundred numbers standing in for two.
 */
export interface DeformParallax {
  kind: 'parallax';
  /**
   * Screen displacement per unit of depth, `[x, y]`.
   *
   * Depth carries the units (`zScale`), so this is a pure direction-and-scale:
   * a vertex 40 units forward under `offset: [0.25, 0]` moves 10 to the right.
   */
  offset: [number, number];
}

/**
 * A **scale about a point** — `gallery/squash`'s two shapes, which its README
 * already writes out as `sx`/`sy` about a point.
 *
 * The point is fixed by construction, which is the property that makes the
 * example's claim checkable: the ball's contact vertex sits at the contact
 * point, so its offset is `(0, 0)` and the ball flattens against the ground
 * rather than sinking through it — with no key anywhere that has to be tuned to
 * make that true.
 *
 * ⭐ `det = sx · sy` is refused at or below 0, and above 0 it is a **proof**
 * rather than a report: an affine map with a positive determinant preserves
 * every triangle's winding, so a key of this kind cannot be the fold A39 hunts.
 * A shear belongs to `bend` with `power: 1`.
 */
export interface DeformAffine {
  kind: 'affine';
  /** `[sx, sy]`. 1 is unchanged; both are required, because a guessed one is a value the spec did not state. */
  scale: [number, number];
  /** The fixed point, in the attachment's own units. Default `[0, 0]`. */
  about?: [number, number];
}

/**
 * A sinusoid of one coordinate, displacing along another.
 *
 * ⚠️ **A wavelength is only as real as the geometry that samples it.** The mesh
 * carries the wave at the coordinates it happens to have, so a period short
 * against the spacing of those coordinates does not make a smaller ripple — it
 * makes a different model. Against a spacing of `s`: `wavelength ≥ 4s` to read
 * as a wave at all and `≥ 8s` to read as a curve; at `2s` every sample lands on
 * the same pair of phases, which is a zigzag, and at that pair's zero crossings
 * it is nothing at all. The last of those is refused (issue #350) because it
 * emits an all-zero run while claiming an amplitude; the zigzag is not, because
 * it is a bad wave rather than an absent one and that is authoring judgement.
 */
export interface DeformWave {
  kind: 'wave';
  /** Peak displacement, in the attachment's own units. */
  amplitude: number;
  /** One period, in the same units as the coordinate `along` reads. Sampled by the geometry — see the note above. */
  wavelength: number;
  /** Phase at `along = 0`, in degrees. Default 0. */
  phase?: number;
  /** The coordinate the sinusoid reads. */
  along: DeformAxis;
  /** The coordinate it displaces. */
  axis: DeformAxis;
}

/**
 * A **polynomial bend**: displacement rising as a power of how far along the
 * part a vertex is.
 *
 * `power: 1` is an affine shear, and every higher power is a curve no bone
 * transform can produce — which is the whole reason a `deform` timeline is
 * worth its numbers on a mesh whose vertices are pinned to one bone.
 * `power: 2` is a cantilever: zero displacement **and zero slope** at `from`,
 * so a part held at one end bends rather than tilting.
 */
export interface DeformBend {
  kind: 'bend';
  /** Displacement at `to`, in the attachment's own units. */
  amount: number;
  /** Where the bend is anchored — displacement is 0 here. */
  from: number;
  /** Where it reaches `amount`. */
  to: number;
  /** The exponent. A whole number ≥ 1; default 2. */
  power?: number;
  /** The coordinate that measures how far along a vertex is. */
  along: DeformAxis;
  /** The coordinate it displaces. */
  axis: DeformAxis;
}

export type DeformTransform = DeformTurn | DeformParallax | DeformAffine | DeformWave | DeformBend;

/** The kinds this module evaluates, in the order the docs list them. */
export const DEFORM_TRANSFORM_KINDS = ['yaw', 'pitch', 'parallax', 'affine', 'wave', 'bend'] as const;

/**
 * What one evaluation did, for `explain` to print and a reviewer to check.
 *
 * `stated` is the spec's own parameters and `derived` the scalars the closed
 * form got out of them — the two lines that let somebody re-derive a column by
 * hand. `offsets` is the emitted run, so the report and the artifact cannot
 * disagree (`explain`'s `DEFORM` block, issue #316, quotes this rather than
 * re-evaluating it — see `src/deformmeasure.ts`).
 */
export interface DeformTransformReport {
  kind: DeformTransform['kind'];
  /** The transform as the spec states it. */
  stated: string;
  /** The scalars the closed form derived, e.g. `cos t − 1 = −0.021852`. */
  derived: string[];
  /** The closed form, written out. */
  formula: string;
  vertexCount: number;
  /** Largest offset magnitude in the run, and the vertex carrying it. */
  maxOffset: number;
  maxOffsetVertex: number;
  /** The emitted run: `x, y` per vertex, already quantised by the caller's rounder. */
  offsets: number[];
}

/** `Math.round(n * 1e6) / 1e6`, passed in so the compiler's quantiser stays in one place. */
export type Rounder = (n: number) => number;

/**
 * Evaluate one transform over an attachment's setup geometry.
 *
 * `setup` is `x, y` per vertex **in the space a deform offset lives in** — the
 * slot bone's space on an unweighted attachment, and the single influencing
 * bone's bind space on a weighted one where every vertex has exactly one. The
 * caller owns that distinction and refuses the cases where there is no one such
 * space; by the time execution reaches here the array means one thing.
 *
 * Returns a run as long as `setup`, so it always starts at deform index 0 and
 * covers the whole attachment. That is deliberate and it is not a convenience:
 * a transform is a model of the geometry rather than an edit of part of it, and
 * a partially applied model leaves a **step discontinuity at the end of the
 * run** — which is exactly one half of the defect issue #313 records, where a
 * 20-vertex run of a hand-authored ripple began 6.3px away from the unkeyed
 * vertex before it.
 */
export function evaluateDeformTransform(
  transform: DeformTransform,
  setup: readonly number[],
  round: Rounder,
  where: string,
  /**
   * Per-vertex `z` for this attachment, when its generator named a depth map.
   * Null when it named none — which is what makes `"depth": true` refusable by
   * name rather than silently falling back to a cylinder.
   */
  depth: readonly number[] | null = null,
): DeformTransformReport {
  if (transform === null || typeof transform !== 'object' || Array.isArray(transform)) {
    throw new CompileError(`${where}: "transform" is ${JSON.stringify(transform)}; it is an object with a "kind"`);
  }
  const kind = (transform as { kind?: unknown }).kind;
  if (typeof kind !== 'string' || !(DEFORM_TRANSFORM_KINDS as readonly string[]).includes(kind)) {
    throw new CompileError(
      `${where}: "transform" has kind ${JSON.stringify(kind)}; this spec evaluates ${DEFORM_TRANSFORM_KINDS.join(', ')}. ` +
        'A model that is none of those is still authorable as a "vertices" run.',
    );
  }
  const count = setup.length / 2;
  const offsets = new Array<number>(setup.length);
  let derived: string[];
  let stated: string;
  let formula: string;
  // -- the three values the all-zero refusal at the bottom reads (issue #350) -
  //
  // `identity` is whether the transform's own scalars state the identity, and it
  // is judged on the ROUNDED scalars rather than in float64 — a `degrees: 360`
  // turn leaves `sin t` at −2.4e−16, which is 0 in every number this compiler
  // writes, so a spec that states a whole revolution states the identity as
  // surely as `degrees: 0` does. `band` is the largest magnitude the closed form
  // reached *before* quantising, which is what separates a model that is
  // arithmetically zero (a band of float noise, ~1e−15) from one that is real
  // and smaller than six decimals. `sampledTo` is the per-kind diagnosis.
  let identity: boolean;
  let identitySpelling: string;
  let band = 0;
  let sampledTo = '';
  const widen = (d: number): number => {
    const m = Math.abs(d);
    if (m > band) band = m;
    return d;
  };

  switch (kind) {
    case 'yaw':
    case 'pitch': {
      const t = transform as DeformTurn;
      const degrees = num(t.degrees, 'degrees', where);
      const about = t.about === undefined ? 0 : num(t.about, 'about', where);
      // -- which surface the turn is projected off (issue #382) --------------
      //
      // Two models, one closed form. A cylinder derives `z` from how far off
      // the axis a vertex sits; a depth map states it per vertex. Everything
      // below is shared, and the only difference is where `z` comes from — the
      // reason this is a branch on the input and not a second transform kind.
      const fromDepth = t.depth === true;
      if (fromDepth && t.radius !== undefined) {
        throw new CompileError(
          `${where}: transform ${kind} states both "depth": true and a radius ${JSON.stringify(t.radius)}. They are ` +
            'two answers to how far forward each vertex sits — a cylinder derives it, a map states it — and a key ' +
            'carrying both leaves a reader unable to say which one the output came from. Drop one.',
        );
      }
      if (fromDepth && depth === null) {
        throw new CompileError(
          `${where}: transform ${kind} says "depth": true and this attachment has no depth map. The map is named on ` +
            'the attachment\'s generator, as `"depth": { "image": …, "near": …, "zScale": … }`, because it describes ' +
            'the art rather than this key. Name it there, or give this key a radius.',
        );
      }
      if (fromDepth && depth !== null && depth.length !== count) {
        // Unreachable while the sampler walks the same vertex list the mesh
        // emitted; stated because a silent mismatch here would turn into a turn
        // evaluated against another vertex's depth.
        throw new CompileError(
          `${where}: transform ${kind} has ${depth.length} sampled depths for ${count} vertices`,
        );
      }
      const radius = fromDepth ? 0 : num(t.radius, 'radius', where);
      if (!fromDepth && radius <= 0) {
        throw new CompileError(`${where}: transform ${kind} has radius ${radius}; it is the radius of the cylinder the part is painted on, so a positive number`);
      }
      const rad = (degrees * Math.PI) / 180;
      const cosMinus1 = Math.cos(rad) - 1;
      const sin = Math.sin(rad);
      // The driving coordinate is the one the axis is perpendicular to: x for a
      // yaw (a vertical axis), y for a pitch (a horizontal one). The other
      // component of every pair is 0, because a turn about an axis moves
      // nothing along it.
      const along = kind === 'yaw' ? 0 : 1;
      for (let v = 0; v < count; v++) {
        const u = setup[2 * v + along] - about;
        // A vertex outside the cylinder has no surface to be painted on, and
        // clamping its depth to 0 would silently evaluate a DIFFERENT model
        // there — a flat edge on a curved part. Refused by name instead: this is
        // FACE §4's "read R off the depth table, never off the PNG" as a check.
        if (!fromDepth && Math.abs(u) > radius) {
          throw new CompileError(
            `${where}: transform ${kind} has radius ${radius}, and vertex ${v} sits at ${kind === 'yaw' ? 'x' : 'y'}=` +
              `${setup[2 * v + along]}, which is ${round(Math.abs(u) - radius)} past it (about=${about}). The cylinder has no ` +
              'surface there, so its depth would be 0 and the projection would be a different model at that vertex. ' +
              'Raise the radius to where the part actually sits, or move the vertex.',
          );
        }
        // A depth map needs no such check: it states a surface everywhere it
        // covers, and a vertex it does NOT cover was already refused when the
        // mesh was built (`sampleContourDepth`) rather than here, where the
        // sheet is long out of reach.
        const z = fromDepth ? (depth as readonly number[])[v] : Math.sqrt(radius * radius - u * u);
        const d = u * cosMinus1 - z * sin;
        offsets[2 * v + along] = round(widen(d));
        offsets[2 * v + (1 - along)] = 0;
      }
      identity = round(cosMinus1) === 0 && round(sin) === 0;
      identitySpelling = 'degrees 0';
      sampledTo = fromDepth
        ? `The turn is ${degrees}°, and a projection of it can only vanish where every vertex shares one ` +
          `${kind === 'yaw' ? 'x' : 'y'} AND one depth — check the depth map's sampled range in the mesh report, ` +
          'which is 0 wide when the sheet is flat where this part sits'
        : `The turn is ${degrees}°, and a projection of it can only vanish where every vertex shares one ` +
          `${kind === 'yaw' ? 'x' : 'y'} — check that this attachment's setup geometry is the shape the radius says it is`;
      const c = kind === 'yaw' ? 'x' : 'y';
      stated = fromDepth
        ? `depth=true degrees=${degrees}${t.about === undefined ? '' : ` about=${about}`}`
        : `radius=${radius} degrees=${degrees}${t.about === undefined ? '' : ` about=${about}`}`;
      formula = fromDepth
        ? `d${c} = (${c}−about)·(cos t − 1) − z·sin t,   z = the vertex's sampled depth`
        : `d${c} = (${c}−about)·(cos t − 1) − z·sin t,   z = √(radius² − (${c}−about)²)`;
      derived = [
        `t = ${round(rad)} rad`,
        `cos t − 1 = ${round(cosMinus1)}`,
        `sin t = ${round(sin)}`,
      ];
      if (fromDepth) {
        const zs = depth as readonly number[];
        let zlo = Infinity;
        let zhi = -Infinity;
        for (const z of zs) {
          if (z < zlo) zlo = z;
          if (z > zhi) zhi = z;
        }
        // The depth range is what a reader checks the amplitude against: the
        // deepest vertex moves `−zhi·sin t`, and that number is the one that
        // either matches the art or does not.
        derived.push(`z ∈ [${round(zlo)}, ${round(zhi)}] over ${zs.length} vertices`);
        derived.push(`deepest shift = −z_max·sin t = ${round(-zhi * sin)}`);
      } else {
        derived.push(`centre shift = −radius·sin t = ${round(-radius * sin)}`);
      }
      break;
    }
    case 'parallax': {
      const t = transform as DeformParallax;
      const offset = pair(t.offset, 'offset', where);
      if (depth === null) {
        throw new CompileError(
          `${where}: transform parallax moves each vertex by its own depth, and this attachment has no depth map. ` +
            'Name one on its generator as `"depth": { "image": …, "near": …, "zScale": … }`. Without per-vertex z ' +
            'every vertex would move by the same amount, which is a translation of the whole attachment — key the ' +
            'slot bone instead, at two numbers rather than one per vertex.',
        );
      }
      if (depth.length !== count) {
        throw new CompileError(`${where}: transform parallax has ${depth.length} sampled depths for ${count} vertices`);
      }
      let zlo = Infinity;
      let zhi = -Infinity;
      for (let v = 0; v < count; v++) {
        const z = depth[v];
        if (z < zlo) zlo = z;
        if (z > zhi) zhi = z;
        offsets[2 * v] = round(widen(z * offset[0]));
        offsets[2 * v + 1] = round(widen(z * offset[1]));
      }
      identity = round(offset[0]) === 0 && round(offset[1]) === 0;
      identitySpelling = 'offset [0, 0]';
      sampledTo =
        'The offset is not zero, so the depths are: a run of zeros here means every vertex sampled the same depth ' +
        `and that depth is 0 — check the map's range in the mesh report (this one sampled [${round(zlo)}, ${round(zhi)}])`;
      stated = `offset=[${offset[0]}, ${offset[1]}]`;
      formula = 'dx = z·offset.x,   dy = z·offset.y,   z = the vertex\'s sampled depth';
      derived = [
        `z ∈ [${round(zlo)}, ${round(zhi)}] over ${count} vertices`,
        `deepest slide = z_max·offset = (${round(zhi * offset[0])}, ${round(zhi * offset[1])})`,
      ];
      break;
    }
    case 'affine': {
      const a = transform as DeformAffine;
      const scale = pair(a.scale, 'scale', where);
      const about = a.about === undefined ? ([0, 0] as [number, number]) : pair(a.about, 'about', where);
      const det = scale[0] * scale[1];
      if (det <= 0) {
        throw new CompileError(
          `${where}: transform affine has scale [${scale[0]}, ${scale[1]}], whose determinant is ${round(det)}. ` +
            'At or below zero the map mirrors or collapses the geometry and EVERY triangle reverses its winding, ' +
            'which is the fold A39_DEFORM_KEEPS_TRIANGLE_WINDING refuses. A positive determinant is what makes this ' +
            'kind incapable of folding a mesh.',
        );
      }
      for (let v = 0; v < count; v++) {
        offsets[2 * v] = round(widen((scale[0] - 1) * (setup[2 * v] - about[0])));
        offsets[2 * v + 1] = round(widen((scale[1] - 1) * (setup[2 * v + 1] - about[1])));
      }
      identity = round(scale[0] - 1) === 0 && round(scale[1] - 1) === 0;
      identitySpelling = 'scale [1, 1]';
      sampledTo =
        `A scale about a fixed point moves nothing that SITS on it, so every vertex this attachment has lies at ` +
        `about=[${about[0]}, ${about[1]}] on the axis the scale changes — the geometry has collapsed onto the point ` +
        'the key holds still';
      stated = `scale=[${scale[0]}, ${scale[1]}]${a.about === undefined ? '' : ` about=[${about[0]}, ${about[1]}]`}`;
      formula = 'dx = (sx − 1)·(x − ax),   dy = (sy − 1)·(y − ay)';
      derived = [`sx − 1 = ${round(scale[0] - 1)}`, `sy − 1 = ${round(scale[1] - 1)}`, `det = sx·sy = ${round(det)} > 0, so no triangle can reverse`];
      break;
    }
    case 'wave': {
      const w = transform as DeformWave;
      const amplitude = num(w.amplitude, 'amplitude', where);
      const wavelength = num(w.wavelength, 'wavelength', where);
      const phase = w.phase === undefined ? 0 : num(w.phase, 'phase', where);
      if (wavelength === 0) {
        throw new CompileError(`${where}: transform wave has wavelength 0; one period cannot be zero long`);
      }
      const [along, axis] = axes(w.along, w.axis, 'wave', where);
      const phaseRad = (phase * Math.PI) / 180;
      const k = (2 * Math.PI) / wavelength;
      for (let v = 0; v < count; v++) {
        const d = amplitude * Math.sin(k * setup[2 * v + along] + phaseRad);
        offsets[2 * v + axis] = round(widen(d));
        offsets[2 * v + (1 - axis)] = 0;
      }
      const an = along === 0 ? 'x' : 'y';
      identity = round(amplitude) === 0;
      identitySpelling = 'amplitude 0';
      // The sampling fact, measured off the array this call was handed rather
      // than inferred from a topology the compiler does not have: it knows which
      // coordinates it read, not where anybody's rows are. The smallest gap
      // between two distinct ones is the finest detail the geometry can carry,
      // and the ratio to it is the rule `gallery/nod`'s README states.
      const distinct = [...new Set(Array.from({ length: count }, (_, v) => setup[2 * v + along]))].sort((p, q) => p - q);
      let gap = Infinity;
      for (let i = 1; i < distinct.length; i++) gap = Math.min(gap, distinct[i] - distinct[i - 1]);
      sampledTo =
        distinct.length < 2
          ? `Every vertex sits at ${an}=${distinct[0]}, so one value of the sinusoid covers the whole attachment and ` +
            'this phase is where that one value crosses zero. A wave needs the coordinate it reads to VARY across the ' +
            'geometry; a part that displaces as a whole is a bone, not a deform'
          : `The closest two distinct ${an} coordinates in this attachment are ${round(gap)} apart, and a sinusoid has ` +
            `to be sampled to exist: a wavelength of at least 4x that (${round(4 * gap)}) to read as a wave at all and ` +
            `8x (${round(8 * gap)}) to read as a curve, where this key states ${round(wavelength / gap)}x. At 2x every ` +
            'sample lands on the same pair of phases, and at the zero crossings that pair is (0, 0). `gallery/nod`\'s ' +
            'README carries that rule and the measured table behind it';
      stated = `amplitude=${amplitude} wavelength=${wavelength} phase=${phase} along=${an} axis=${axis === 0 ? 'x' : 'y'}`;
      formula = `d${axis === 0 ? 'x' : 'y'} = amplitude · sin(2π·${an}/wavelength + phase)`;
      derived = [`2π/wavelength = ${round(k)} rad per unit`, `phase = ${round(phaseRad)} rad`];
      break;
    }
    default: {
      const b = transform as DeformBend;
      const amount = num(b.amount, 'amount', where);
      const from = num(b.from, 'from', where);
      const to = num(b.to, 'to', where);
      const power = b.power === undefined ? 2 : num(b.power, 'power', where);
      if (!Number.isInteger(power) || power < 1) {
        throw new CompileError(
          `${where}: transform bend has power ${power}; it is a whole number ≥ 1 (1 is an affine shear, 2 a cantilever ` +
            'that is flat at "from"). A fractional power is not evaluated because it has no value on the side of "from" ' +
            'the part does not reach.',
        );
      }
      if (to === from) {
        throw new CompileError(`${where}: transform bend has from ${from} and to ${to}; they are the two ends of the bend, so they differ`);
      }
      const [along, axis] = axes(b.along, b.axis, 'bend', where);
      const span = to - from;
      let reach = 0;
      for (let v = 0; v < count; v++) {
        const u = (setup[2 * v + along] - from) / span;
        if (Math.abs(u) > reach) reach = Math.abs(u);
        offsets[2 * v + axis] = round(widen(amount * u ** power));
        offsets[2 * v + (1 - axis)] = 0;
      }
      const an = along === 0 ? 'x' : 'y';
      identity = round(amount) === 0;
      identitySpelling = 'amount 0';
      // `u` is 0 at `from` and 1 at `to`, so the two ways a stated bend vanishes
      // are both statements about where the geometry sits in that span — and
      // both are measured here rather than guessed.
      sampledTo =
        reach === 0
          ? `Every vertex sits at ${an}=${from}, which is "from" — the end the bend is anchored at, where the ` +
            'displacement is 0 by construction. The span the key names does not cross the part it is keyed on'
          : `The furthest any vertex reaches into the span is u=${round(reach)} of 1, and u^${power} of that is ` +
            `${(reach ** power).toExponential(3)} — so the part occupies only the flat end of the curve. Move "to" to ` +
            'where the geometry actually ends, or lower the power';
      stated = `amount=${amount} from=${from} to=${to} power=${power} along=${an} axis=${axis === 0 ? 'x' : 'y'}`;
      formula = `d${axis === 0 ? 'x' : 'y'} = amount · u^${power},   u = (${an} − from) / (to − from)`;
      derived = [
        `span = to − from = ${round(span)}`,
        power === 1
          ? 'power 1 is an affine shear (det = 1), so no triangle can reverse'
          : `power ${power} is not affine — the gradient at u is ${power}·amount·u^${power - 1}/span, so it is 0 at "from"`,
      ];
      break;
    }
  }

  // -- a model the geometry sampled to nothing (issue #350) ------------------
  //
  // The three refusals above catch a parameter that cannot mean what it says —
  // `wavelength: 0`, a determinant at or below 0, a radius inside the part. This
  // is the same principle one step later: every parameter is individually legal,
  // and the model still evaluates to a run of zeros. The key then claims a
  // deformation, emits nothing, and *gates green* — `A35` is right that the run
  // fits and `A39` is right that no triangle moved, so neither can see it and
  // this is the only place it can be said.
  //
  // ⭐ **The distinguishing condition is where the identity is stated.** A key
  // that MEANS the setup pose says so in its own parameters — `degrees: 0` (or
  // any whole revolution), `amplitude: 0`, `amount: 0`, `scale: [1, 1]` — or
  // carries no run at all, which is the format's own `{ "t": … }`. Those pass.
  // What is refused is the pair that cannot both be true: parameters that state
  // a deformation, and an evaluation that is the identity. The two are not the
  // same event, and before this they printed the same line.
  //
  // `count > 0` is not defensive noise: `every` on an empty array is `true`, so
  // an attachment with no vertices would otherwise be refused with a message
  // about arithmetic that never ran.
  if (count > 0 && !identity && offsets.every((d) => d === 0)) {
    throw new CompileError(
      `${where}: transform ${kind} states ${stated}, and every one of this attachment's ${count} vertices evaluates ` +
        `to an offset of 0 — the largest value the closed form reached at any of them is ${band.toExponential(3)}, ` +
        'which quantises to 0 at the six decimals every emitted number carries. So the key states a deformation and ' +
        `emits the identity, and nothing downstream can tell it apart from a key that meant the setup pose. ` +
        `${sampledTo}. A key that MEANS the identity states it in its own parameters (${identitySpelling}) or carries ` +
        'no run at all.',
    );
  }

  let maxOffset = 0;
  let maxOffsetVertex = 0;
  for (let v = 0; v < count; v++) {
    const m = Math.hypot(offsets[2 * v], offsets[2 * v + 1]);
    if (m > maxOffset) {
      maxOffset = m;
      maxOffsetVertex = v;
    }
  }
  return {
    kind: kind as DeformTransform['kind'],
    stated,
    derived,
    formula,
    vertexCount: count,
    maxOffset: round(maxOffset),
    maxOffsetVertex,
    offsets,
  };
}

/** One required finite number, refused by field name rather than compiled as a NaN. */
function num(value: unknown, field: string, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CompileError(`${where}: transform field "${field}" is ${JSON.stringify(value)}; it is a finite number the spec has to state`);
  }
  return value;
}

/** One required `[a, b]`. */
function pair(value: unknown, field: string, where: string): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new CompileError(`${where}: transform field "${field}" is ${JSON.stringify(value)}; it is a pair, [x, y]`);
  }
  return [num(value[0], `${field}[0]`, where), num(value[1], `${field}[1]`, where)];
}

/**
 * The two axis fields, as indices into an `x, y` pair.
 *
 * `along === axis` is refused: a displacement of x driven by x is a stretch
 * along one axis, which `affine` states as a scale — and states with a
 * determinant, so it carries the proof that this kind cannot.
 */
function axes(along: unknown, axis: unknown, kind: string, where: string): [0 | 1, 0 | 1] {
  for (const [name, value] of [
    ['along', along],
    ['axis', axis],
  ] as const) {
    if (value !== 'x' && value !== 'y') {
      throw new CompileError(`${where}: transform ${kind} has ${name}=${JSON.stringify(value)}; it is "x" or "y"`);
    }
  }
  if (along === axis) {
    throw new CompileError(
      `${where}: transform ${kind} reads ${String(along)} and displaces ${String(axis)} — the same coordinate, which is a ` +
        'stretch rather than a bend or a wave. An affine scale states that, and states the determinant that proves it ' +
        'keeps every triangle\'s winding.',
    );
  }
  return [along === 'x' ? 0 : 1, axis === 'x' ? 0 : 1];
}
