/**
 * The skinning-envelope residual — `MQ_SKINNING_RESIDUAL` of
 * `mesh-quality-report/1` (issue #1294, mechanism 1 of #1266):
 * docs/MESH_REDUCTION.md §7 derives it and *Mechanism 1 — implemented* says
 * what it is and what it is not. This module computes it for
 * `measureMeshQuality` (`src/meshquality.ts`), which turns it into a row, and
 * holds the helper that turns declared rotation and scale ranges into an
 * envelope entry (`skinningEnvelopeBone`).
 *
 * ## The quantity
 *
 * A UV sample of the attachment (§3: every art pixel centre, every source hull
 * vertex's UV) is carried by one triangle of each mesh — the original source
 * and the candidate — at barycentric β (`uvCarriers`). In each mesh, per bone
 * k, the carried point has the interpolated share w̄ₖ = Σᵢ βᵢ wᵢₖ, the setup
 * position p = Σᵢ βᵢ xᵢ and the weighted position moment
 * sₖ = Σᵢ βᵢ wᵢₖ (xᵢ − p). For any motion under which bone k's deformation
 * Dₖ (posed ∘ setup⁻¹, in the drawing frame) differs from the reference bone's
 * D₀ by a linear part of spectral norm at most εₖ and a lever
 * |(Dₖ − D₀) q| ≤ εₖ |q − cₖ| + τₖ, the candidate draws the sample within
 *
 *   Σₖ εₖ |sₖ(candidate) − sₖ(source)| + Σₖ |w̄ₖ(candidate) − w̄ₖ(source)| (εₖ |p − cₖ| + τₖ)
 *
 * of where the source draws it, p the source's setup position — provided each
 * vertex's shares sum to 1 and both meshes place the sample at the same setup
 * position. Those two are this measurement's contract, checked rather than
 * assumed: a vertex whose shares miss 1 by more than half a weight-grid step,
 * or whose point is off its UV carried through the frame by more than two
 * `r6` half-steps, refuses the row by name. What the contract still lets
 * through — the setup positions of one UV in the two meshes differing by
 * rounding — is reported beside the value (`setup.sampleGap`), never folded
 * into it: its term is ‖A₀ + Σₖ w̄ₖ (Aₖ − A₀)‖ |Δp|, and ‖A₀‖, the reference
 * bone's own motion, is not something the envelope declares.
 *
 * ## What it never does
 *
 * - Pose, link the runtime, or read a frame: the envelope is declared, so the
 *   value is pose-free and frame-free. It bounds positions under the declared
 *   motion only — no orientation, stretch or squash, nothing outside the
 *   envelope — and never replaces `compareMeshesInMotion`.
 * - Fill a gap. A bone a vertex binds that the envelope does not declare, an
 *   envelope bone the source does not bind, a deform key that moves vertices
 *   outside skinning, an unweighted mesh beside a weighted one: each refuses
 *   the row by name. No sample carried by both meshes, or fewer art samples
 *   than the floor, is `not-measurable` — never a value of 0.
 * - Compare against anything but the source it is handed. The reference is
 *   the original supplied mesh, never a previous candidate.
 *
 * Pure: no clock, no randomness, no runtime. Every loop runs in index order,
 * so one input reads one answer (A18's standard).
 *
 * ⚠️ This module imports types only from `src/meshquality.ts`, which imports
 * it; `src/mesh.ts` re-exports both. As with the other mesh modules, nothing
 * at the top level reads another module's bindings.
 */
import { createHash } from 'node:crypto';
import { MeshReductionError, r6 } from './mesh.ts';
import { uvCarriers, type Carrier } from './meshcarriers.ts';
import type { AttachmentRef, DeformTimelineInput, SourceFrame, SourceMesh, WorstSample } from './meshquality.ts';

type Pt = readonly [number, number];

// ---------------------------------------------------------------------------
// the input
// ---------------------------------------------------------------------------

/**
 * The motion a candidate must stay correct under — declared, never posed. Part-local drawing px, y down (§7, Q3–Q5,
 * rig-parts#126). Nothing in it has a default.
 */
export interface SkinningEnvelope {
  /** D₀: the bone every other bone's deformation is measured against — the slot's bone (Q4). Its own terms are 0. */
  reference: string;
  /** Every bone either mesh binds, other than `reference`, once each. */
  bones: SkinningEnvelopeBone[];
}

/** One bone of a `SkinningEnvelope`: the bound on how its deformation differs from the reference's. */
export interface SkinningEnvelopeBone {
  bone: string;
  /**
   * εₖ ≥ ‖Aₖ − A₀‖₂ over the motion, Aₖ and A₀ the linear parts of the two bones' deformations — dimensionless,
   * finite, 0 or more. A rotation by up to θ relative to the reference is 2 sin(θ / 2); `skinningEnvelopeBone` derives
   * it from declared rotation and scale ranges.
   */
  linear: number;
  /** cₖ, drawing px: the pivot of the lever bound |(Dₖ − D₀) q| ≤ εₖ |q − cₖ| + τₖ — usually the bone's setup joint. */
  pivot: [number, number];
  /** τₖ, drawing px, 0 or more: the lever bound's constant — how far Dₖ and D₀ carry the pivot apart. */
  translation: number;
}

/**
 * `MeshMeasureInput.skinning` (issue #1294): the source the measured mesh is a candidate of, the envelope, and the
 * bound. The measured mesh (`MeshMeasureInput.source`) is the candidate; this `source` is the comparison reference.
 */
export interface SkinningResidualInput {
  /**
   * The original supplied mesh — never a previous candidate — and the caller's id for it. Its sha-256 over the mesh's
   * own fields is reported beside the id (`SkinningEcho.source.digest`), so a report names the bytes it was measured
   * against.
   */
  source: { id: string; mesh: SourceMesh };
  envelope: SkinningEnvelope;
  /** Drawing px: the row's bound, inclusive. `null` declares it absent — the row is measured and `undeclared`. */
  maxResidual: number | null;
  /**
   * Every deform timeline keyed on the attachment or one of its linked meshes, as `MeshReductionInput.deform`; empty
   * when none. A `vertices` or `transform` key moves vertices outside skinning, so any key but `setup` refuses the row
   * (`SKINNING_DEFORM_UNSUPPORTED`, Q10).
   */
  deform: DeformTimelineInput[];
}

// ---------------------------------------------------------------------------
// the report's fields
// ---------------------------------------------------------------------------

/** What `effective.skinning` echoes: the source by id and digest rather than in full, the envelope, the bound and the deform list. */
export interface SkinningEcho {
  source: { id: string; digest: string };
  envelope: SkinningEnvelope;
  maxResidual: number | null;
  deform: DeformTimelineInput[];
}

/** `MeasureRow.skinning`: written on `MQ_SKINNING_RESIDUAL` when it was measured, and on no other row. */
export interface SkinningDetail {
  /** One fixed sentence: what the value is a reading of, and what it is not. */
  reading: string;
  /** The comparison reference: the caller's id and the sha-256 of its mesh. */
  source: { id: string; digest: string };
  /** The envelope's reference bone. */
  reference: string;
  /** Samples carried by both meshes — the ones the value is the largest over — and every sample one mesh does not carry, by UV. */
  samples: { measured: number; uncarried: { source: Array<[number, number]>; candidate: Array<[number, number]> } };
  /**
   * At the worst sample: the value's two sums — `covariance`, Σₖ εₖ |Δsₖ|, and `lever`, Σₖ |Δw̄ₖ| (εₖ |p − cₖ| + τₖ) —
   * and each envelope bone's share of each, in envelope order. Null when the value is 0 (nothing worse than ideal).
   */
  worst: { covariance: number; lever: number; bones: Array<{ bone: string; covariance: number; lever: number }> } | null;
  /**
   * The weight-field difference alone, over every bone the envelope names and its reference — the largest over
   * samples of Σ |Δw̄| (`l1`) and of max |Δw̄| (`lInf`). A diagnostic: it reads 0 wherever the two fields agree, as
   * on a linear ramp, however far the meshes draw apart, so it is never a guard (§7, M2).
   */
  weightField: { l1: number; lInf: number };
  /**
   * The contract's own figures: `vertexGap`, the largest distance of any vertex of either mesh from its UV carried
   * through the frame, against `vertexSlack` per axis; `sampleGap`, the largest |p(candidate) − p(source)| over the
   * measured samples — the term outside the value; `weightSumGap`, the largest |Σ shares − 1| of any vertex.
   */
  setup: { vertexGap: number; vertexSlack: [number, number]; sampleGap: number; weightSumGap: number };
}

/** The fixed sentence of `SkinningDetail.reading`. */
export const SKINNING_READING =
  'the largest over the samples carried by both meshes of Σk εk·|Δsk| + Σk |Δw̄k|·(εk·|p − ck| + τk): a bound, under the declared envelope only, on how far the candidate draws a UV from where the source draws it — positions only; it certifies no orientation, stretch or squash, no motion outside the envelope, and replaces no motion comparison (docs/MESH_REDUCTION.md §7)';

// ---------------------------------------------------------------------------
// plants
// ---------------------------------------------------------------------------

/**
 * A fault planted on purpose, for the `mesh-compare` suite's negative controls (MQ116 onward). `measureMeshQuality`
 * plants none.
 *
 * - `drop-covariance`: the first sum left out — the weight-field bound the card proposed first.
 * - `drop-lever`: the second sum left out.
 * - `uncarried-read-as-zero`: no sample carried by both meshes read as a value of 0 rather than not measurable.
 * - `undeclared-bone-ignored`: a bound bone the envelope does not declare read as contributing nothing.
 * - `unknown-bone-accepted`: an envelope bone the source does not bind accepted.
 * - `setup-unchecked`: a vertex off its UV accepted.
 * - `deform-unchecked`: a `vertices` or `transform` deform key accepted.
 * - `echo-when-unset`, `row-when-unset`: the report writes the echo, or the row, for a call that did not set the field.
 */
export type SkinningPlant =
  | 'drop-covariance'
  | 'drop-lever'
  | 'uncarried-read-as-zero'
  | 'undeclared-bone-ignored'
  | 'unknown-bone-accepted'
  | 'setup-unchecked'
  | 'deform-unchecked'
  | 'echo-when-unset'
  | 'row-when-unset';

// ---------------------------------------------------------------------------
// refusals of the declaration's shape — thrown before any work
// ---------------------------------------------------------------------------

function refuse(code: string, message: string): never {
  throw new MeshReductionError(code, message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** A value as a message names it: JSON, except a non-finite number, which JSON would print as null. */
function shown(value: unknown): string {
  return typeof value === 'number' ? String(value) : JSON.stringify(value);
}

function isPoint(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && isFiniteNumber(value[0]) && isFiniteNumber(value[1]);
}

/**
 * `MeshMeasureInput.skinning`: left out or `null` is accepted as it stands; anything else is a `SkinningResidualInput`
 * in full, else refused `REDUCE_INPUT_MISSING` naming the path. Internal: on `rig-c/mesh` only through `export *`.
 */
export function validateSkinning(who: string, skinning: unknown): void {
  if (skinning === undefined || skinning === null) return;
  const shape = '{ source: { id, mesh }, envelope: { reference, bones }, maxResidual, deform }';
  if (!isObject(skinning)) refuse('REDUCE_INPUT_MISSING', `${who}: skinning is ${shown(skinning)}; required ${shape}, null, or the field left out`);
  const source = skinning.source;
  if (!isObject(source)) refuse('REDUCE_INPUT_MISSING', `${who}: skinning.source is ${shown(source)}; required { id, mesh } — the original supplied mesh and the caller's id for it`);
  if (typeof source.id !== 'string' || source.id === '') refuse('REDUCE_INPUT_MISSING', `${who}: skinning.source.id is ${shown(source.id)}; required a non-empty string naming the source`);
  const mesh = source.mesh;
  if (!isObject(mesh) || !Array.isArray(mesh.points) || !Array.isArray(mesh.uvs) || !Array.isArray(mesh.triangles)) {
    refuse('REDUCE_INPUT_MISSING', `${who}: skinning.source.mesh is not { points, uvs, triangles, hull, weights } with three arrays; required a SourceMesh`);
  }
  mesh.points.forEach((p: unknown, i: number) => {
    if (!isPoint(p)) refuse('REDUCE_INPUT_MISSING', `${who}: skinning.source.mesh.points[${i}] is ${shown(p)}; required a pair of finite numbers`);
  });
  if (mesh.uvs.length !== 2 * mesh.points.length || mesh.uvs.some((u: unknown) => !isFiniteNumber(u))) {
    refuse('REDUCE_INPUT_MISSING', `${who}: skinning.source.mesh.uvs holds ${mesh.uvs.length} numbers for ${mesh.points.length} points; required one finite u, v pair per point (${2 * mesh.points.length})`);
  }
  const vertexCount = mesh.points.length;
  if (mesh.triangles.length % 3 !== 0 || mesh.triangles.some((t: unknown) => !Number.isInteger(t) || (t as number) < 0 || (t as number) >= vertexCount)) {
    refuse('REDUCE_INPUT_MISSING', `${who}: skinning.source.mesh.triangles is not a list of vertex index triples into ${mesh.points.length} points; required that`);
  }
  if (!Number.isInteger(mesh.hull) || (mesh.hull as number) < 3 || (mesh.hull as number) > mesh.points.length) {
    refuse('REDUCE_INPUT_MISSING', `${who}: skinning.source.mesh.hull is ${shown(mesh.hull)}; required the whole number of hull vertices, 3 to ${mesh.points.length}`);
  }
  if (mesh.weights !== null) {
    if (!Array.isArray(mesh.weights) || mesh.weights.length !== mesh.points.length) {
      refuse('REDUCE_INPUT_MISSING', `${who}: skinning.source.mesh.weights is not one binding list per point (${mesh.points.length}); required that, or null for an unweighted mesh`);
    }
    mesh.weights.forEach((vertex: unknown, i: number) => {
      if (!Array.isArray(vertex) || vertex.some((b) => !isObject(b) || typeof b.bone !== 'string' || !isFiniteNumber(b.weight) || b.weight < 0)) {
        refuse('REDUCE_INPUT_MISSING', `${who}: skinning.source.mesh.weights[${i}] is not a list of { bone, weight } with finite shares, 0 or more; required that`);
      }
    });
  }
  const envelope = skinning.envelope;
  if (!isObject(envelope) || !Array.isArray(envelope.bones)) refuse('REDUCE_INPUT_MISSING', `${who}: skinning.envelope is ${shown(envelope)}; required { reference, bones: [{ bone, linear, pivot, translation }] }`);
  if (typeof envelope.reference !== 'string' || envelope.reference === '') refuse('REDUCE_INPUT_MISSING', `${who}: skinning.envelope.reference is ${shown(envelope.reference)}; required a non-empty bone name — the slot's bone (Q4)`);
  const seen = new Set<string>();
  envelope.bones.forEach((entry: unknown, i: number) => {
    const at = `skinning.envelope.bones[${i}]`;
    if (!isObject(entry) || typeof entry.bone !== 'string' || entry.bone === '') refuse('REDUCE_INPUT_MISSING', `${who}: ${at} is ${shown(entry)}; required { bone: a non-empty name, linear, pivot, translation }`);
    if (entry.bone === envelope.reference) refuse('REDUCE_INPUT_MISSING', `${who}: ${at}.bone is "${entry.bone}", the envelope's reference; required every bone but the reference — the reference's own terms are 0 by definition`);
    if (seen.has(entry.bone)) refuse('REDUCE_INPUT_MISSING', `${who}: ${at}.bone "${entry.bone}" is declared twice; required one entry per bone`);
    seen.add(entry.bone);
    if (!isFiniteNumber(entry.linear) || entry.linear < 0) refuse('REDUCE_INPUT_MISSING', `${who}: ${at}.linear is ${shown(entry.linear)}; required a finite number, 0 or more (εk ≥ ‖Ak − A0‖, dimensionless)`);
    if (!isPoint(entry.pivot)) refuse('REDUCE_INPUT_MISSING', `${who}: ${at}.pivot is ${shown(entry.pivot)}; required a pair of finite drawing px`);
    if (!isFiniteNumber(entry.translation) || entry.translation < 0) refuse('REDUCE_INPUT_MISSING', `${who}: ${at}.translation is ${shown(entry.translation)}; required a finite number of drawing px, 0 or more`);
  });
  const bound = skinning.maxResidual;
  if (bound === undefined) refuse('REDUCE_INPUT_MISSING', `${who}: skinning.maxResidual is missing; required a finite number of drawing px, 0 or more, or null (declared absent: measured, reported undeclared) — no field has a default`);
  if (bound !== null && (!isFiniteNumber(bound) || bound < 0)) refuse('REDUCE_INPUT_MISSING', `${who}: skinning.maxResidual is ${shown(bound)}; required a finite number of drawing px, 0 or more, or null`);
  const deform = skinning.deform;
  if (!Array.isArray(deform)) refuse('REDUCE_INPUT_MISSING', `${who}: skinning.deform is ${shown(deform)}; required the deform timelines keyed on the attachment or its linked meshes (empty when none)`);
  deform.forEach((t: unknown, i: number) => {
    if (!isObject(t) || typeof t.animation !== 'string' || !isObject(t.attachment) || !Array.isArray(t.keys) || t.keys.some((k: unknown) => !isObject(k) || typeof k.kind !== 'string')) {
      refuse('REDUCE_INPUT_MISSING', `${who}: skinning.deform[${i}] is not { animation, attachment, keys: [{ time, kind }] }; required a DeformTimelineInput`);
    }
  });
}

// ---------------------------------------------------------------------------
// the source's identity
// ---------------------------------------------------------------------------

/** `sha256:<hex>` of the mesh's own fields, written in a fixed key order — the same bytes for the same mesh, whatever order its objects were built in. */
export function sourceMeshDigest(mesh: SourceMesh): string {
  const canonical = JSON.stringify({
    points: mesh.points.map((p) => [p[0], p[1]]),
    uvs: [...mesh.uvs],
    triangles: [...mesh.triangles],
    hull: mesh.hull,
    weights: mesh.weights === null ? null : mesh.weights.map((v) => v.map((b) => ({ bone: b.bone, weight: b.weight }))),
  });
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

/** The echo `effective.skinning` writes. */
export function skinningEchoOf(skinning: SkinningResidualInput | null): SkinningEcho | null {
  if (skinning === null) return null;
  return { source: { id: skinning.source.id, digest: sourceMeshDigest(skinning.source.mesh) }, envelope: skinning.envelope, maxResidual: skinning.maxResidual, deform: skinning.deform };
}

// ---------------------------------------------------------------------------
// the samples and their terms
// ---------------------------------------------------------------------------

/** One §3 sample: its UV, and the art pixel (mask grid) or source hull vertex it is. */
export interface SkinningSample {
  uv: [number, number];
  pixel: [number, number] | null;
  vertex: number | null;
}

/** One mesh's terms at one sample: p, and per bone (envelope order, then the reference last) w̄ and s. */
export interface SampleTerms {
  p: [number, number];
  wbar: number[];
  moment: Array<[number, number]>;
}

/** §3's sample set over art bits at the threshold: every art pixel centre in row order, then the source hull's UVs. */
export function skinningSamplesOf(artBits: Uint8Array, width: number, height: number, source: SourceMesh): { samples: SkinningSample[]; art: number } {
  const samples: SkinningSample[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (artBits[y * width + x]) samples.push({ uv: [(x + 0.5) / width, (y + 0.5) / height], pixel: [x, y], vertex: null });
    }
  }
  const art = samples.length;
  for (let v = 0; v < source.hull; v++) samples.push({ uv: [source.uvs[v * 2], source.uvs[v * 2 + 1]], pixel: null, vertex: v });
  return { samples, art };
}

/**
 * A mesh's terms at a carrier — p, and per bone w̄ and the moment s = Σᵢ βᵢ wᵢₖ (xᵢ − p) — over `bones` (index by name).
 * Shares of a bone `bones` does not name are not read: the coverage check refuses such a mesh before this runs.
 */
export function termsAt(mesh: SourceMesh, c: Carrier, bones: ReadonlyMap<string, number>): SampleTerms {
  const n = bones.size;
  const wbar = new Array<number>(n).fill(0);
  const moment: Array<[number, number]> = Array.from({ length: n }, () => [0, 0]);
  let px = 0;
  let py = 0;
  for (let k = 0; k < 3; k++) {
    const pt = mesh.points[c.corners[k]];
    px += c.bary[k] * pt[0];
    py += c.bary[k] * pt[1];
  }
  for (let k = 0; k < 3; k++) {
    const v = c.corners[k];
    const b = c.bary[k];
    const pt = mesh.points[v];
    const dx = pt[0] - px;
    const dy = pt[1] - py;
    for (const bind of mesh.weights![v]) {
      const j = bones.get(bind.bone);
      if (j === undefined) continue;
      wbar[j] += b * bind.weight;
      moment[j][0] += b * bind.weight * dx;
      moment[j][1] += b * bind.weight * dy;
    }
  }
  return { p: [px, py], wbar, moment };
}

// ---------------------------------------------------------------------------
// the measurement
// ---------------------------------------------------------------------------

/** What `measureMeshQuality` hands the residual: the candidate (the mesh measured), the field, and the art read at the measurement's threshold. */
export interface SkinningMeasureArgs {
  attachment: AttachmentRef;
  frame: SourceFrame;
  /** Art bits on the mask grid at the measurement's threshold, and the grid's size. */
  artBits: Uint8Array;
  maskWidth: number;
  maskHeight: number;
  minArtSamples: number;
  threshold: number;
  candidate: SourceMesh;
  skinning: SkinningResidualInput;
}

/** The residual's reading, which the row is built from. */
export type SkinningReading =
  | { state: 'measured'; value: number; worst: WorstSample; detail: SkinningDetail; samples: number; art: number }
  | { state: 'refused' | 'not-measurable'; reason: string; samples: number; art: number };

/** Half a step of the 6-decimal weight grid the bindings are written on (§6, P19): a vertex's shares further from 1 are not closed. */
const WEIGHT_SUM_SLACK = 5e-7;

/** One `r6` half-step, of a point or of a UV (its error carried through the frame is that times the frame's size). */
const R6_HALF_STEP = 5e-7;

function nameOf(ref: AttachmentRef): string {
  return `${ref.skin ?? '(no skin)'}/${ref.slot}/${ref.attachment}`;
}

/**
 * The residual over the §3 sample set, or the reason it is refused or not measurable — the order of the checks is
 * the order a fix has to happen in: what the motion is, which bones bind, the shares, the setup positions, the
 * samples. Internal: on `rig-c/mesh` only through `export *`.
 */
export function skinningResidual(args: SkinningMeasureArgs, plant: SkinningPlant | null = null): SkinningReading {
  const { attachment, frame, candidate, skinning } = args;
  const source = skinning.source.mesh;
  const envelope = skinning.envelope;
  const who = `attachment ${nameOf(attachment)}`;
  const { samples, art } = skinningSamplesOf(args.artBits, args.maskWidth, args.maskHeight, source);
  const out = (state: 'refused' | 'not-measurable', reason: string): SkinningReading => ({ state, reason, samples: samples.length, art });

  // What moves the vertices: skinning alone, or a deform key besides it.
  if (plant !== 'deform-unchecked') {
    for (const t of skinning.deform) {
      const k = t.keys.findIndex((key) => key.kind !== 'setup');
      if (k >= 0) {
        return out(
          'refused',
          `SKINNING_DEFORM_UNSUPPORTED: ${who}: skinning.deform names animation "${t.animation}" keyed on ${nameOf(t.attachment)}, whose key ${k} is a "${t.keys[k].kind}" key; required setup keys only — a vertices or transform deform moves vertices outside skinning, which the envelope does not bound (Q10)`,
        );
      }
    }
  }

  // Which bones bind, and that the envelope declares every one of them.
  if (source.weights === null || candidate.weights === null) {
    if (source.weights === null && candidate.weights === null) {
      return out('not-measurable', `${who}: neither the source "${skinning.source.id}" nor the candidate is weighted, so no vertex has a binding to compare — an unweighted mesh follows its slot's bone, which no envelope entry describes`);
    }
    return out('refused', `SKINNING_UNWEIGHTED: ${who}: the ${source.weights === null ? `source "${skinning.source.id}"` : 'candidate'} is unweighted and the ${source.weights === null ? 'candidate' : 'source'} is weighted; required both weighted — the residual compares two bindings of one attachment`);
  }
  const declared = new Set(envelope.bones.map((b) => b.bone));
  const bound = new Set<string>();
  for (const [label, mesh] of [[`source "${skinning.source.id}"`, source], ['candidate', candidate]] as const) {
    for (let v = 0; v < mesh.weights!.length; v++) {
      for (const b of mesh.weights![v]) {
        if (label !== 'candidate') bound.add(b.bone);
        if (b.bone === envelope.reference || declared.has(b.bone) || plant === 'undeclared-bone-ignored') continue;
        return out(
          'refused',
          `SKINNING_BONE_NOT_DECLARED: ${who}: ${label} vertex ${v} binds bone "${b.bone}", which skinning.envelope neither declares nor names as its reference "${envelope.reference}"; required an envelope entry for every bone either mesh binds — an undeclared bone's motion is unbounded`,
        );
      }
    }
  }
  if (plant !== 'unknown-bone-accepted') {
    const i = envelope.bones.findIndex((b) => !bound.has(b.bone));
    if (i >= 0) {
      return out(
        'refused',
        `SKINNING_BONE_UNKNOWN: ${who}: skinning.envelope.bones[${i}] declares bone "${envelope.bones[i].bone}", which no vertex of the source "${skinning.source.id}" binds; required envelope bones the source binds — the source binds ${[...bound].sort().map((b) => `"${b}"`).join(', ')}`,
      );
    }
  }

  // The shares: each vertex's sum is 1 on the weight grid, or the reference bone's motion would enter the difference.
  let weightSumGap = 0;
  for (const [label, mesh] of [[`source "${skinning.source.id}"`, source], ['candidate', candidate]] as const) {
    for (let v = 0; v < mesh.weights!.length; v++) {
      const sum = mesh.weights![v].reduce((s, b) => s + b.weight, 0);
      const gap = Math.abs(sum - 1);
      weightSumGap = Math.max(weightSumGap, gap);
      if (gap > WEIGHT_SUM_SLACK) {
        return out(
          'refused',
          `SKINNING_WEIGHT_SUM: ${who}: ${label} vertex ${v}'s shares sum to ${sum}; required 1 within ${WEIGHT_SUM_SLACK} (half a step of the 6-decimal weight grid) — a deficit moves the vertex with the reference bone's own motion, which the envelope does not bound`,
        );
      }
    }
  }

  // The setup positions: every vertex of either mesh at its UV carried through the frame, so one UV is one setup point.
  const slack: [number, number] = [2 * R6_HALF_STEP * (1 + frame.width), 2 * R6_HALF_STEP * (1 + frame.height)];
  let vertexGap = 0;
  for (const [label, mesh] of [[`source "${skinning.source.id}"`, source], ['candidate', candidate]] as const) {
    for (let v = 0; v < mesh.points.length; v++) {
      const dx = Math.abs(mesh.points[v][0] - mesh.uvs[v * 2] * frame.width);
      const dy = Math.abs(mesh.points[v][1] - mesh.uvs[v * 2 + 1] * frame.height);
      vertexGap = Math.max(vertexGap, Math.hypot(dx, dy));
      if ((dx > slack[0] || dy > slack[1]) && plant !== 'setup-unchecked') {
        return out(
          'refused',
          `SKINNING_SETUP_MISMATCH: ${who}: ${label} vertex ${v} is at (${mesh.points[v][0]}, ${mesh.points[v][1]}) and its UV (${mesh.uvs[v * 2]}, ${mesh.uvs[v * 2 + 1]}) carried through the ${frame.width}x${frame.height} px frame is at (${r6(mesh.uvs[v * 2] * frame.width)}, ${r6(mesh.uvs[v * 2 + 1] * frame.height)}); required within (${slack[0]}, ${slack[1]}) px per axis (two r6 half-steps, of the point and of the UV) — both meshes have to place one UV at one setup position`,
        );
      }
    }
  }

  // The samples: under the floor is not a measurement.
  if (art < args.minArtSamples) {
    return out('not-measurable', `${who} has ${art} art sample(s) at alpha >= ${args.threshold}; required at least ${args.minArtSamples} (minArtSamples, P9) — the source hull's UVs are samples and do not count towards it`);
  }
  let sourceCarriers: Array<Carrier | null>;
  let candidateCarriers: Array<Carrier | null>;
  try {
    sourceCarriers = uvCarriers(source.uvs, source.triangles, samples, `source "${skinning.source.id}", attachment ${nameOf(attachment)}`);
    candidateCarriers = uvCarriers(candidate.uvs, candidate.triangles, samples, `candidate, attachment ${nameOf(attachment)}`);
  } catch (err) {
    if (err instanceof MeshReductionError && err.code === 'COMPARE_UV_CARRIER_NOT_UNIQUE') return out('refused', `SKINNING_UV_CARRIER_NOT_UNIQUE: ${err.message}`);
    throw err;
  }

  // The bones in envelope order, the reference last (its εk and τk are 0, so it enters only the weight-field diagnostic).
  const index = new Map<string, number>();
  envelope.bones.forEach((b, i) => index.set(b.bone, i));
  index.set(envelope.reference, envelope.bones.length);
  const eps = [...envelope.bones.map((b) => b.linear), 0];
  const tau = [...envelope.bones.map((b) => b.translation), 0];
  const pivot: Pt[] = [...envelope.bones.map((b) => b.pivot), [0, 0]];
  const K = eps.length;

  const uncarried = {
    source: samples.filter((_s, j) => sourceCarriers[j] === null).map((s) => s.uv),
    candidate: samples.filter((_s, j) => candidateCarriers[j] === null).map((s) => s.uv),
  };
  let measured = 0;
  let worst = -1;
  let worstAt = -1;
  let worstCov: number[] = [];
  let worstLev: number[] = [];
  let l1Max = 0;
  let lInfMax = 0;
  let sampleGap = 0;
  for (let j = 0; j < samples.length; j++) {
    const cs = sourceCarriers[j];
    const cc = candidateCarriers[j];
    if (cs === null || cc === null) continue;
    measured++;
    const r = termsAt(source, cs, index);
    const c = termsAt(candidate, cc, index);
    sampleGap = Math.max(sampleGap, Math.hypot(c.p[0] - r.p[0], c.p[1] - r.p[1]));
    let total = 0;
    let l1 = 0;
    let lInf = 0;
    const cov = new Array<number>(K).fill(0);
    const lev = new Array<number>(K).fill(0);
    for (let k = 0; k < K; k++) {
      const dw = Math.abs(c.wbar[k] - r.wbar[k]);
      l1 += dw;
      lInf = Math.max(lInf, dw);
      if (plant !== 'drop-covariance') cov[k] = eps[k] * Math.hypot(c.moment[k][0] - r.moment[k][0], c.moment[k][1] - r.moment[k][1]);
      if (plant !== 'drop-lever') lev[k] = dw * (eps[k] * Math.hypot(r.p[0] - pivot[k][0], r.p[1] - pivot[k][1]) + tau[k]);
      total += cov[k] + lev[k];
    }
    l1Max = Math.max(l1Max, l1);
    lInfMax = Math.max(lInfMax, lInf);
    if (total > worst) {
      worst = total;
      worstAt = j;
      worstCov = cov;
      worstLev = lev;
    }
  }
  if (measured === 0 && plant !== 'uncarried-read-as-zero') {
    return out('not-measurable', `${who}: no sample is carried by both the source "${skinning.source.id}"'s and the candidate's UV triangles, so there is nothing to bound — ${uncarried.source.length} uncarried by the source, ${uncarried.candidate.length} by the candidate`);
  }
  const value = measured === 0 ? 0 : r6(worst);
  const s = worstAt >= 0 ? samples[worstAt] : null;
  const at: WorstSample['at'] = s === null ? {} : s.pixel !== null ? { pixel: s.pixel, uv: s.uv } : { vertex: s.vertex ?? undefined, uv: s.uv };
  const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
  const detail: SkinningDetail = {
    reading: SKINNING_READING,
    source: { id: skinning.source.id, digest: sourceMeshDigest(source) },
    reference: envelope.reference,
    samples: { measured, uncarried },
    worst:
      value === 0
        ? null
        : {
            covariance: r6(sum(worstCov)),
            lever: r6(sum(worstLev)),
            bones: envelope.bones.map((b, k) => ({ bone: b.bone, covariance: r6(worstCov[k]), lever: r6(worstLev[k]) })),
          },
    weightField: { l1: r6(l1Max), lInf: r6(lInfMax) },
    setup: { vertexGap: r6(vertexGap), vertexSlack: slack, sampleGap: r6(sampleGap), weightSumGap },
  };
  return { state: 'measured', value, worst: value === 0 ? { at: {} } : { at }, detail, samples: samples.length, art };
}

// ---------------------------------------------------------------------------
// the helper: declared ranges → one envelope entry
// ---------------------------------------------------------------------------

/**
 * One bone's declared motion, relative to its setup pose, as `skinningEnvelopeBone` reads it. Every field is required.
 *
 * Coordinates: `pivot` is the bone's setup joint (world origin) in the attachment's drawing frame, px, y down.
 * Rotations and scales are the bone's LOCAL values over the motion relative to its setup values — the keys of its
 * rotate and scale timelines — so a bone that does not move declares `[0, 0]` and `[1, 1]`.
 */
export interface BoneMotionRange {
  bone: string;
  /** Where the range comes from. Only `'keys'` is certified; any other value — `'physics'` — is refused by name. */
  source: 'keys';
  /** The setup joint in drawing px, y down. */
  pivot: [number, number];
  /** Local rotation minus setup rotation over the motion, degrees, [min, max]. */
  rotate: [number, number];
  /** Local scale over setup scale, per axis, [min, max]. */
  scaleX: [number, number];
  scaleY: [number, number];
  /** The most the bone's local translation moves its joint from setup, drawing px, 0 or more. */
  translate: number;
  /** The bone's setup as the rig declares it — checked against the helper's assumptions, never corrected. */
  setup: { scaleX: number; scaleY: number; shearX: number; shearY: number; inherit: 'normal' };
}

/**
 * What `skinningEnvelopeBone` composes: the chain from the skeleton's root to the envelope's reference, and from below
 * the reference down to the bone the entry is for.
 */
export interface EnvelopeBoneRanges {
  /** Root first, ending at the reference bone: every bone the reference's world transform is composed of. */
  referenceChain: BoneMotionRange[];
  /** Parent first, from the reference's child down to the bone the entry is for (its last element). At least one. */
  chain: BoneMotionRange[];
}

/** `skinningEnvelopeBone`'s planted faults, for the helper's negative controls (MQ133): scale ranges ignored, the joints' motion ignored. */
export type EnvelopePlant = 'scale-ignored' | 'translation-ignored';

function rangeOf(who: string, at: string, value: unknown, positive: boolean): [number, number] {
  if (!Array.isArray(value) || value.length !== 2 || !isFiniteNumber(value[0]) || !isFiniteNumber(value[1]) || value[0] > value[1] || (positive && value[0] <= 0)) {
    refuse('REDUCE_INPUT_MISSING', `${who}: ${at} is ${shown(value)}; required [min, max], finite, min <= max${positive ? ', min above 0' : ''}`);
  }
  return [value[0], value[1]];
}

/** e = ‖R(θ) diag(σx, σy) − I‖₂ bounded by 2 sin(θ / 2) + max |σ − 1|, and the scale's norm max |σ|, over a declared range. */
function stepOf(who: string, at: string, r: unknown): { e: number; norm: number; translate: number; pivot: Pt; rotation: number; scale: number } {
  if (!isObject(r) || typeof r.bone !== 'string' || r.bone === '') refuse('REDUCE_INPUT_MISSING', `${who}: ${at} is ${shown(r)}; required a BoneMotionRange`);
  const name = `${at} (bone "${r.bone}")`;
  if (r.source !== 'keys') {
    refuse(
      'SKINNING_RANGE_UNSUPPORTED',
      `${who}: ${name}.source is ${shown(r.source)}; required "keys" — a range not declared by the bone's own keys (a physics swing, a range read off a posed schedule) is not certified by this helper, so it is refused rather than turned into a bound`,
    );
  }
  if (!isPoint(r.pivot)) refuse('REDUCE_INPUT_MISSING', `${who}: ${name}.pivot is ${shown(r.pivot)}; required the setup joint as a pair of finite drawing px`);
  const rotate = rangeOf(who, `${name}.rotate`, r.rotate, false);
  const sx = rangeOf(who, `${name}.scaleX`, r.scaleX, true);
  const sy = rangeOf(who, `${name}.scaleY`, r.scaleY, true);
  if (!isFiniteNumber(r.translate) || r.translate < 0) refuse('REDUCE_INPUT_MISSING', `${who}: ${name}.translate is ${shown(r.translate)}; required a finite number of drawing px, 0 or more`);
  const setup = r.setup;
  if (!isObject(setup) || !isFiniteNumber(setup.scaleX) || !isFiniteNumber(setup.scaleY) || !isFiniteNumber(setup.shearX) || !isFiniteNumber(setup.shearY) || typeof setup.inherit !== 'string') {
    refuse('REDUCE_INPUT_MISSING', `${who}: ${name}.setup is ${shown(setup)}; required { scaleX, scaleY, shearX, shearY, inherit } as the rig declares them`);
  }
  if (Math.abs(setup.scaleX) !== Math.abs(setup.scaleY) || setup.scaleX === 0) {
    refuse('SKINNING_RANGE_UNSUPPORTED', `${who}: ${name}.setup scale is (${setup.scaleX}, ${setup.scaleY}); required a uniform setup scale — under a nonuniform one the bone's deformation is not a rotation and scale of the drawing, and the bound is not proven`);
  }
  if (setup.shearX !== 0 || setup.shearY !== 0) refuse('SKINNING_RANGE_UNSUPPORTED', `${who}: ${name}.setup shear is (${setup.shearX}, ${setup.shearY}); required (0, 0) — a sheared setup is outside the helper's assumptions`);
  if (setup.inherit !== 'normal') refuse('SKINNING_RANGE_UNSUPPORTED', `${who}: ${name}.setup.inherit is ${shown(setup.inherit)}; required "normal" — another inherit mode composes the chain otherwise than the helper does`);
  const theta = Math.min(Math.max(Math.abs(rotate[0]), Math.abs(rotate[1])), 180);
  const rotation = 2 * Math.sin((theta * Math.PI) / 360);
  const scale = Math.max(Math.abs(sx[0] - 1), Math.abs(sx[1] - 1), Math.abs(sy[0] - 1), Math.abs(sy[1] - 1));
  const norm = Math.max(sx[1], sy[1]);
  return { e: rotation + scale, norm, translate: r.translate, pivot: r.pivot, rotation, scale };
}

/**
 * One `SkinningEnvelopeBone` from declared ranges (issue #1294; rig-parts#126 Q3: one definition of `linear`, rig-c's).
 *
 * The definition. Under the assumptions below, each bone j's local change is, in the drawing frame, an affine map
 * Fⱼ(q) = cⱼ + Mⱼ (q − cⱼ) + tⱼ with ‖Mⱼ − I‖ ≤ eⱼ = 2 sin(θⱼ / 2) + max |σⱼ − 1| (θⱼ the largest |rotation|, capped
 * at 180°, σⱼ every scale ratio's endpoint), ‖Mⱼ‖ ≤ max σⱼ, and |tⱼ| ≤ the declared `translate`. The bone's deformation
 * relative to the reference is G = F₁ ∘ … ∘ Fₘ over `chain`, and the reference's own deformation scales by at most
 * S = Π max σ over `referenceChain`. Then
 *
 * - `linear` ε = S · (Πⱼ (1 + eⱼ) − 1) ≥ ‖Aₖ − A₀‖ — the composition is a product, because a chain's changes multiply;
 * - `pivot` c = the last bone's setup joint;
 * - `translation` τ = S · δ₁, where δₘ = translate of the last bone and δⱼ = eⱼ |c − cⱼ| + (1 + eⱼ) δⱼ₊₁ + translateⱼ,
 *   so that |(Dₖ − D₀) q| ≤ ε |q − c| + τ for every q.
 *
 * Every step is a triangle inequality, so the entry is conservative for any motion inside the declared ranges, and
 * claims nothing outside them. The reference chain's rotations and translations cancel in Dₖ − D₀ and are not read.
 *
 * The assumptions, checked where the input can show them and refused by name (`SKINNING_RANGE_UNSUPPORTED`): each
 * bone's range is declared by its keys (`source: 'keys'`; a physics swing is not certified); every bone of both
 * chains has a uniform setup scale, no setup shear and inherit `normal`, so every setup world map is a similarity and
 * conjugating by it keeps each norm. Not checkable here, and assumed: the attachment's drawing frame maps to world by a
 * similarity (the slot's bone at its setup, as the compile places a part), and the chain listed is the bone's real
 * ancestry. Malformed input is `REDUCE_INPUT_MISSING` naming the path.
 */
export function skinningEnvelopeBone(ranges: EnvelopeBoneRanges): SkinningEnvelopeBone {
  return envelopeBoneWith(ranges, null);
}

/** `skinningEnvelopeBone` with a fault planted (`EnvelopePlant`) — the helper's negative controls. Internal: merely exported. */
export function skinningEnvelopeBonePlanted(ranges: EnvelopeBoneRanges, plant: EnvelopePlant): SkinningEnvelopeBone {
  return envelopeBoneWith(ranges, plant);
}

function envelopeBoneWith(ranges: EnvelopeBoneRanges, plant: EnvelopePlant | null): SkinningEnvelopeBone {
  const who = 'skinningEnvelopeBone';
  if (!isObject(ranges) || !Array.isArray(ranges.referenceChain) || !Array.isArray(ranges.chain)) refuse('REDUCE_INPUT_MISSING', `${who}: the input is ${shown(ranges)}; required { referenceChain: BoneMotionRange[], chain: BoneMotionRange[] }`);
  if (ranges.referenceChain.length === 0) refuse('REDUCE_INPUT_MISSING', `${who}: referenceChain is empty; required the bones from the skeleton's root to the reference, at least the reference`);
  if (ranges.chain.length === 0) refuse('REDUCE_INPUT_MISSING', `${who}: chain is empty; required the bones below the reference down to the bone the entry is for, at least that bone`);
  const above = ranges.referenceChain.map((r, i) => stepOf(who, `referenceChain[${i}]`, r));
  const below = ranges.chain.map((r, i) => stepOf(who, `chain[${i}]`, r));
  const S = above.reduce((s, x) => s * (plant === 'scale-ignored' ? 1 : x.norm), 1);
  const eOf = (x: { e: number; rotation: number }): number => (plant === 'scale-ignored' ? x.rotation : x.e);
  const composed = below.reduce((s, x) => s * (1 + eOf(x)), 1) - 1;
  const last = below[below.length - 1];
  const c = last.pivot;
  let delta = plant === 'translation-ignored' ? 0 : last.translate;
  for (let j = below.length - 2; j >= 0; j--) {
    if (plant === 'translation-ignored') break;
    const x = below[j];
    delta = eOf(x) * Math.hypot(c[0] - x.pivot[0], c[1] - x.pivot[1]) + (1 + eOf(x)) * delta + x.translate;
  }
  return { bone: (ranges.chain[ranges.chain.length - 1] as BoneMotionRange).bone, linear: S * composed, pivot: [c[0], c[1]], translation: S * delta };
}
