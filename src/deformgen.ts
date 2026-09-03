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
 * ## What this is NOT, and the two rules that keep it that way
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
  radius: number;
  /** The turn, in degrees. Positive yaws toward −x, which is FACE §1's sign. */
  degrees: number;
  /** Where the axis crosses the driving coordinate. Default 0. */
  about?: number;
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

/** A sinusoid of one coordinate, displacing along another. */
export interface DeformWave {
  kind: 'wave';
  /** Peak displacement, in the attachment's own units. */
  amplitude: number;
  /** One period, in the same units as the coordinate `along` reads. */
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

export type DeformTransform = DeformTurn | DeformAffine | DeformWave | DeformBend;

/** The kinds this module evaluates, in the order the docs list them. */
export const DEFORM_TRANSFORM_KINDS = ['yaw', 'pitch', 'affine', 'wave', 'bend'] as const;

/**
 * What one evaluation did, for `explain` to print and a reviewer to check.
 *
 * `stated` is the spec's own parameters and `derived` the scalars the closed
 * form got out of them — the two lines that let somebody re-derive a column by
 * hand. `offsets` is the emitted run, so the report and the artifact cannot
 * disagree (issue #316 is the per-key measurement block that will quote this
 * rather than recompute it).
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

  switch (kind) {
    case 'yaw':
    case 'pitch': {
      const t = transform as DeformTurn;
      const radius = num(t.radius, 'radius', where);
      const degrees = num(t.degrees, 'degrees', where);
      const about = t.about === undefined ? 0 : num(t.about, 'about', where);
      if (radius <= 0) {
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
        if (Math.abs(u) > radius) {
          throw new CompileError(
            `${where}: transform ${kind} has radius ${radius}, and vertex ${v} sits at ${kind === 'yaw' ? 'x' : 'y'}=` +
              `${setup[2 * v + along]}, which is ${round(Math.abs(u) - radius)} past it (about=${about}). The cylinder has no ` +
              'surface there, so its depth would be 0 and the projection would be a different model at that vertex. ' +
              'Raise the radius to where the part actually sits, or move the vertex.',
          );
        }
        const z = Math.sqrt(radius * radius - u * u);
        const d = u * cosMinus1 - z * sin;
        offsets[2 * v + along] = round(d);
        offsets[2 * v + (1 - along)] = 0;
      }
      const c = kind === 'yaw' ? 'x' : 'y';
      stated = `radius=${radius} degrees=${degrees}${t.about === undefined ? '' : ` about=${about}`}`;
      formula = `d${c} = (${c}−about)·(cos t − 1) − z·sin t,   z = √(radius² − (${c}−about)²)`;
      derived = [
        `t = ${round(rad)} rad`,
        `cos t − 1 = ${round(cosMinus1)}`,
        `sin t = ${round(sin)}`,
        `centre shift = −radius·sin t = ${round(-radius * sin)}`,
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
        offsets[2 * v] = round((scale[0] - 1) * (setup[2 * v] - about[0]));
        offsets[2 * v + 1] = round((scale[1] - 1) * (setup[2 * v + 1] - about[1]));
      }
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
        offsets[2 * v + axis] = round(d);
        offsets[2 * v + (1 - axis)] = 0;
      }
      const an = along === 0 ? 'x' : 'y';
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
      for (let v = 0; v < count; v++) {
        const u = (setup[2 * v + along] - from) / span;
        offsets[2 * v + axis] = round(amount * u ** power);
        offsets[2 * v + (1 - axis)] = 0;
      }
      const an = along === 0 ? 'x' : 'y';
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
