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
import { areaBand, triangleAreas } from './areaband.ts';
import { carrierIn, resolveCarriers, uvCarriers, type Carrier } from './meshcarriers.ts';
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
  validateEnvelopeAndBound(who, 'skinning', skinning.envelope, skinning.maxResidual);
  const deform = skinning.deform;
  if (!Array.isArray(deform)) refuse('REDUCE_INPUT_MISSING', `${who}: skinning.deform is ${shown(deform)}; required the deform timelines keyed on the attachment or its linked meshes (empty when none)`);
  deform.forEach((t: unknown, i: number) => {
    if (!isObject(t) || typeof t.animation !== 'string' || !isObject(t.attachment) || !Array.isArray(t.keys) || t.keys.some((k: unknown) => !isObject(k) || typeof k.kind !== 'string')) {
      refuse('REDUCE_INPUT_MISSING', `${who}: skinning.deform[${i}] is not { animation, attachment, keys: [{ time, kind }] }; required a DeformTimelineInput`);
    }
  });
}

/**
 * The envelope and the bound of a residual declaration, refused `REDUCE_INPUT_MISSING` naming the path under `at` —
 * `skinning` on a measurement, `targets.skinning` on a reduction (issue #1295), so the two refuse one value in the
 * same words.
 */
function validateEnvelopeAndBound(who: string, at: string, envelope: unknown, bound: unknown): void {
  if (!isObject(envelope) || !Array.isArray(envelope.bones)) refuse('REDUCE_INPUT_MISSING', `${who}: ${at}.envelope is ${shown(envelope)}; required { reference, bones: [{ bone, linear, pivot, translation }] }`);
  if (typeof envelope.reference !== 'string' || envelope.reference === '') refuse('REDUCE_INPUT_MISSING', `${who}: ${at}.envelope.reference is ${shown(envelope.reference)}; required a non-empty bone name — the slot's bone (Q4)`);
  const seen = new Set<string>();
  envelope.bones.forEach((entry: unknown, i: number) => {
    const entryAt = `${at}.envelope.bones[${i}]`;
    if (!isObject(entry) || typeof entry.bone !== 'string' || entry.bone === '') refuse('REDUCE_INPUT_MISSING', `${who}: ${entryAt} is ${shown(entry)}; required { bone: a non-empty name, linear, pivot, translation }`);
    if (entry.bone === envelope.reference) refuse('REDUCE_INPUT_MISSING', `${who}: ${entryAt}.bone is "${entry.bone}", the envelope's reference; required every bone but the reference — the reference's own terms are 0 by definition`);
    if (seen.has(entry.bone)) refuse('REDUCE_INPUT_MISSING', `${who}: ${entryAt}.bone "${entry.bone}" is declared twice; required one entry per bone`);
    seen.add(entry.bone);
    if (!isFiniteNumber(entry.linear) || entry.linear < 0) refuse('REDUCE_INPUT_MISSING', `${who}: ${entryAt}.linear is ${shown(entry.linear)}; required a finite number, 0 or more (εk ≥ ‖Ak − A0‖, dimensionless)`);
    if (!isPoint(entry.pivot)) refuse('REDUCE_INPUT_MISSING', `${who}: ${entryAt}.pivot is ${shown(entry.pivot)}; required a pair of finite drawing px`);
    if (!isFiniteNumber(entry.translation) || entry.translation < 0) refuse('REDUCE_INPUT_MISSING', `${who}: ${entryAt}.translation is ${shown(entry.translation)}; required a finite number of drawing px, 0 or more`);
  });
  if (bound === undefined) refuse('REDUCE_INPUT_MISSING', `${who}: ${at}.maxResidual is missing; required a finite number of drawing px, 0 or more, or null (declared absent: measured, reported undeclared) — no field has a default`);
  if (bound !== null && (!isFiniteNumber(bound) || bound < 0)) refuse('REDUCE_INPUT_MISSING', `${who}: ${at}.maxResidual is ${shown(bound)}; required a finite number of drawing px, 0 or more, or null`);
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

/** What `termsAt` reads of a mesh: its setup points and its bindings — a `SourceMesh`, or a reduction's working mesh by id. */
export interface TermsMesh {
  points: ReadonlyArray<readonly [number, number]>;
  weights: ReadonlyArray<ReadonlyArray<{ bone: string; weight: number }>> | null;
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
export function termsAt(mesh: TermsMesh, c: Pick<Carrier, 'corners' | 'bary'>, bones: ReadonlyMap<string, number>): SampleTerms {
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

/** The envelope as the arithmetic reads it: bones in envelope order, the reference last with εk and τk 0 (it enters only the weight-field diagnostic). */
export function envelopeTerms(envelope: SkinningEnvelope): { index: Map<string, number>; eps: number[]; tau: number[]; pivot: Pt[] } {
  const index = new Map<string, number>();
  envelope.bones.forEach((b, i) => index.set(b.bone, i));
  index.set(envelope.reference, envelope.bones.length);
  const eps = [...envelope.bones.map((b) => b.linear), 0];
  const tau = [...envelope.bones.map((b) => b.translation), 0];
  const pivot: Pt[] = [...envelope.bones.map((b) => b.pivot), [0, 0]];
  return { index, eps, tau, pivot };
}

/**
 * One sample's value of the residual from the two meshes' terms there — Σₖ εₖ |Δsₖ| + Σₖ |Δw̄ₖ| (εₖ |pʳ − cₖ| + τₖ), each
 * bone's two shares, and the field-only differences. The one place the arithmetic is written: the measurement and the
 * reduction's carried form (`SkinningCarry`, issue #1295) both call it, so equal terms give the same bits.
 */
export function sampleResidual(
  r: SampleTerms,
  c: SampleTerms,
  eps: readonly number[],
  tau: readonly number[],
  pivot: readonly Pt[],
  plant: SkinningPlant | null = null,
): { total: number; cov: number[]; lev: number[]; l1: number; lInf: number } {
  const K = eps.length;
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
  return { total, cov, lev, l1, lInf };
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

/** What the measurement's contract checks leave the value to be read over: the samples, and the contract's own figures. */
export interface SkinningContract {
  samples: SkinningSample[];
  art: number;
  who: string;
  slack: [number, number];
  vertexGap: number;
  weightSumGap: number;
}

/**
 * The residual's contract checked, in the order a fix has to happen in — what the motion is, which bones bind, the
 * shares, the setup positions, the art floor — or the reading that refuses or cannot measure it. Every check
 * `skinningResidual` makes before it carries a sample; the reduction (issue #1295) reads it once at admission.
 * Internal: on `rig-c/mesh` only through `export *`.
 */
export function skinningContract(args: SkinningMeasureArgs, plant: SkinningPlant | null = null): SkinningReading | SkinningContract {
  const { frame, candidate, skinning } = args;
  const source = skinning.source.mesh;
  const envelope = skinning.envelope;
  const attachment = args.attachment;
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
  return { samples, art, who, slack, vertexGap, weightSumGap };
}

/**
 * The residual over the §3 sample set, or the reason it is refused or not measurable — the order of the checks is
 * the order a fix has to happen in: what the motion is, which bones bind, the shares, the setup positions, the
 * samples. Internal: on `rig-c/mesh` only through `export *`.
 */
export function skinningResidual(args: SkinningMeasureArgs, plant: SkinningPlant | null = null): SkinningReading {
  const contract = skinningContract(args, plant);
  if ('state' in contract) return contract;
  const { attachment, candidate, skinning } = args;
  const source = skinning.source.mesh;
  const envelope = skinning.envelope;
  const { samples, art, who, slack, vertexGap, weightSumGap } = contract;
  const out = (state: 'refused' | 'not-measurable', reason: string): SkinningReading => ({ state, reason, samples: samples.length, art });
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
  const { index, eps, tau, pivot } = envelopeTerms(envelope);

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
    const { total, cov, lev, l1, lInf } = sampleResidual(r, c, eps, tau, pivot, plant);
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

// ---------------------------------------------------------------------------
// the residual carried through a reduction (issue #1295)
// ---------------------------------------------------------------------------

/**
 * `ReductionTargets.skinning` (issue #1295, §7 mechanism 1, the reducer half): the envelope and the bound every step of
 * a reduction is held to, measured against the reduction's own `source` — the original, fixed for the call. A number
 * for `maxResidual` vetoes every removal, boundary run and post-pass whose residual is over it; `null` declares the
 * bound absent — no step reads it and the result's row is `undeclared`.
 */
export interface ReductionSkinning {
  envelope: SkinningEnvelope;
  maxResidual: number | null;
}

/**
 * `ReductionTargets.skinning` (issue #1295): left out or `null` is accepted as it stands; anything else is
 * `{ envelope, maxResidual }` in full — the measurement's own envelope and bound, refused in its words under
 * `targets.skinning` — else `REDUCE_INPUT_MISSING` naming the path, before any work. The source is the reduction's
 * own `source`, so it is not restated. Internal: on `rig-c/mesh` only through `export *`.
 */
export function validateReductionSkinning(who: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (!isObject(value)) {
    refuse('REDUCE_INPUT_MISSING', `${who}: targets.skinning is ${shown(value)}; required { envelope: { reference, bones }, maxResidual }, null, or the field left out — the source it is measured against is the reduction's own source`);
  }
  validateEnvelopeAndBound(who, 'targets.skinning', value.envelope, value.maxResidual);
}

/** A reduction's working mesh as the carried residual reads it: vertices by stable id, read live — the reduction appends to these arrays. */
export interface CarriedMesh {
  pos: ReadonlyArray<readonly [number, number]>;
  uv: ReadonlyArray<readonly [number, number]>;
  weights: ReadonlyArray<ReadonlyArray<{ bone: string; weight: number }>>;
}

/**
 * Faults planted in the carried residual, for the `mesh-compare` suite's controls (MQ134 onward); a reduction plants
 * none. `stale-carrier`: the samples of a removed triangle are not re-carried, so they keep its carrier and value.
 * `lost-maximum`: when the sample that held the largest value is recomputed, the largest is taken over the recomputed
 * samples alone. `no-rollback`: a refused trial leaves its values in place. `previous-candidate`: each accepted trial
 * becomes the baseline, so the next is measured against the previous accepted candidate rather than the source.
 */
export type CarryPlant = 'stale-carrier' | 'lost-maximum' | 'no-rollback' | 'previous-candidate';

/** What the carried residual computed — the work a control and §7 read; the report carries none of it. */
export interface CarryTally {
  /** Trials made: one per removal, run or post-pass the static rows let through, and one per refinement insertion. */
  trials: number;
  commits: number;
  rollbacks: number;
  /** Samples whose carrier was searched again and whose value was recomputed, over every trial. */
  samplesRecomputed: number;
  /** Sample × triangle containment tests made by those searches. */
  containmentTests: number;
  trianglesRemoved: number;
  trianglesAdded: number;
  /** Trials that re-carried every sample — the bounded fallback, taken only when the area band moved a triangle it did not change. */
  fullRecarries: number;
  /** The most samples one trial recomputed. */
  peakAffected: number;
}

/** The carried residual's reading of the working mesh: a value on the `r6` grid, or why there is none. */
export type CarryReading = { state: 'measured'; value: number } | { state: 'refused' | 'not-measurable'; reason: string };

/** What a control reads when it holds the carried state to the full recompute (`SkinningCarry.compareWithFull`). */
export interface CarryCheck {
  /** Every sample's value within `CARRY_TOLERANCE`, the same samples measured, and the same uncarried counts. */
  equal: boolean;
  /** The largest |carried − full| over samples both measure. */
  sampleDiff: number;
  /** Samples measured by one and not the other. */
  measuredMismatch: number;
  carried: { max: number; measured: number; uncarried: number; reading: CarryReading };
  full: { max: number; measured: number; uncarried: number };
}

/**
 * How far a carried sample value may sit from the full recompute's, px. The two read the same terms through
 * `sampleResidual`; they differ only in the order a triangle's corners are summed (the working mesh's order against
 * the canonical mesh's) and, for a sample on an edge two triangles share, in which of them carries it — float
 * rounding of terms of order 10² px. Measured on the controls (MQ135) and stated there.
 */
export const CARRY_TOLERANCE = 1e-9;

type Tri = readonly [number, number, number];

/** A triangle's identity across trials: its corners rotated to start at the smallest id, winding kept. */
function triKey(t: Tri): string {
  const k = t[0] < t[1] ? (t[0] < t[2] ? 0 : 2) : t[1] < t[2] ? 1 : 2;
  return `${t[k]},${t[(k + 1) % 3]},${t[(k + 2) % 3]}`;
}

interface CarryLogEntry {
  j: number;
  slot: number;
  b0: number;
  b1: number;
  b2: number;
  value: number;
}

interface Pending {
  removed: number[];
  firstAdded: number;
  log: CarryLogEntry[];
  appended: Array<[number, number]>;
  measured: number;
  uncarried: number;
  refused: string | null;
  broken: string | null;
  plantMax: { value: number; at: number };
  /** Under `previous-candidate`: the candidate terms of each sample the trial recomputed, made the baseline on commit. */
  rebase: Array<[number, SampleTerms | null]>;
  checked: number[];
  /** A fallback trial: every list is rebuilt from the carriers, and rebuilt again on rollback; with the live flags it moved. */
  fallback: boolean;
  liveWas: Array<[number, boolean]>;
}

/**
 * `MQ_SKINNING_RESIDUAL` carried through a reduction's steps (issue #1295) — the value `skinningResidual` reads of the
 * working mesh against the fixed original source, kept per sample so that a step recomputes only what it changed.
 *
 * - **Fixed for the call:** the §3 samples, each one's carrier in the source and the source's terms there (one
 *   `uvCarriers` over the source), and the envelope. The baseline is the source supplied, never a previous candidate.
 * - **Carried per sample:** the candidate's carrier (triangle, barycentric) and the sample's value; per triangle, the
 *   samples it carries; a max tree over the values, so the largest — the row's value — is re-derived in O(log n) when
 *   the sample that held it is recomputed, without a scan.
 * - **A trial** (`trial`) diffs the working triangles against the carried ones: the samples of every removed triangle,
 *   and the uncarried samples inside an added triangle's box, are searched again among the added triangles (and,
 *   for a sample a removal leaves outside them, among the unchanged triangles that share a vertex with a removed
 *   one); everything else is untouched. `commit` keeps it; `rollback` restores every carrier, value, list, count and
 *   the maximum. Work per trial: the triangles' keys (one pass over the triangles) and the affected samples times
 *   the triangles searched for them.
 * - **The bounded fallback:** the live set — triangles whose UV area clears `areaBand`, the band `uvCarriers` reads —
 *   depends on the largest triangle, so a trial that moves an unchanged triangle across the band re-carries every
 *   sample, counted in `fullRecarries`; it is the only full scan, and it is taken only then.
 *
 * Pure: no clock, no randomness, no runtime; every loop runs in a fixed order.
 */
export class SkinningCarry {
  readonly tally: CarryTally = { trials: 0, commits: 0, rollbacks: 0, samplesRecomputed: 0, containmentTests: 0, trianglesRemoved: 0, trianglesAdded: 0, fullRecarries: 0, peakAffected: 0 };
  private readonly n: number;
  private readonly K: number;
  private readonly index: Map<string, number>;
  private readonly eps: number[];
  private readonly tau: number[];
  private readonly pivot: Pt[];
  private readonly su: Float64Array;
  private readonly sv: Float64Array;
  private readonly art: number;
  private readonly pixelSample: Int32Array;
  private readonly maskWidth: number;
  private readonly maskHeight: number;
  /** The source's terms per sample, or null where the source does not carry the sample — fixed for the call. */
  private readonly sourceTerms: ReadonlyArray<SampleTerms | null>;
  /** What each sample is measured against: the source's terms (only the `previous-candidate` plant moves it). */
  private readonly base: Array<SampleTerms | null>;
  private readonly cSlot: Int32Array;
  private readonly cBary: Float64Array;
  private readonly value: Float64Array;
  private readonly size: number;
  private readonly tree: Int32Array;
  private slotCorners: Array<[number, number, number]> = [];
  private slotKey: string[] = [];
  private slotArea: number[] = [];
  private slotLive: boolean[] = [];
  private slotBox: number[] = [];
  private slotSamples: number[][] = [];
  private readonly keyToSlot = new Map<string, number>();
  private measured = 0;
  private uncarried = 0;
  private broken: string | null = null;
  private readonly checked = new Set<number>();
  private pending: Pending | null = null;
  private plantMax = { value: -1, at: -1 };
  private stamp: Int32Array;
  private stampAt = 0;

  constructor(
    private readonly who: string,
    private readonly mesh: CarriedMesh,
    private readonly nSource: number,
    triangles: ReadonlyArray<Tri>,
    source: SourceMesh,
    envelope: SkinningEnvelope,
    artBits: Uint8Array,
    maskWidth: number,
    maskHeight: number,
    private readonly frame: { width: number; height: number },
    private readonly plant: CarryPlant | null = null,
  ) {
    const { samples, art } = skinningSamplesOf(artBits, maskWidth, maskHeight, source);
    const terms = envelopeTerms(envelope);
    this.index = terms.index;
    this.eps = terms.eps;
    this.tau = terms.tau;
    this.pivot = terms.pivot;
    this.K = this.eps.length;
    this.n = samples.length;
    this.art = art;
    this.maskWidth = maskWidth;
    this.maskHeight = maskHeight;
    this.su = new Float64Array(this.n);
    this.sv = new Float64Array(this.n);
    this.pixelSample = new Int32Array(maskWidth * maskHeight).fill(-1);
    samples.forEach((s, j) => {
      this.su[j] = s.uv[0];
      this.sv[j] = s.uv[1];
      if (s.pixel !== null) this.pixelSample[s.pixel[1] * maskWidth + s.pixel[0]] = j;
    });
    // The source's carriers and terms, once: the measurement's own `uvCarriers` and `termsAt`.
    const sourceCarriers = uvCarriers(source.uvs, source.triangles, samples, `${who}: source`);
    this.sourceTerms = sourceCarriers.map((c) => (c === null ? null : termsAt(source, c, this.index)));
    this.base = [...this.sourceTerms];
    // The candidate starts as the working mesh handed in — the source, before any step.
    this.cSlot = new Int32Array(this.n).fill(-1);
    this.cBary = new Float64Array(this.n * 3);
    this.value = new Float64Array(this.n).fill(-1);
    let size = 1;
    while (size < Math.max(1, this.n)) size *= 2;
    this.size = size;
    this.tree = new Int32Array(2 * size).fill(-1);
    this.stamp = new Int32Array(this.n);
    const flatUv: number[] = [];
    for (let v = 0; v < mesh.uv.length; v++) flatUv.push(mesh.uv[v][0], mesh.uv[v][1]);
    const flatTri: number[] = [];
    for (const t of triangles) flatTri.push(t[0], t[1], t[2]);
    const areas = triangleAreas(flatUv, flatTri);
    const band = areaBand(areas, flatUv);
    triangles.forEach((t, i) => this.addSlot(t, areas[i], band));
    for (let s = 0; s < this.slotCorners.length; s++) this.keyToSlot.set(this.slotKey[s], s);
    // The working mesh handed in is the source itself (the reduction builds the carry before any step), so its carriers
    // are the source's — one search, not two; any other mesh is searched as it is.
    const same = flatTri.length === source.triangles.length && flatTri.every((v, i) => v === source.triangles[i]) && flatUv.length === source.uvs.length && flatUv.every((v, i) => v === source.uvs[i]);
    const candidateCarriers = same ? sourceCarriers : uvCarriers(flatUv, flatTri, samples, `${who}: candidate`);
    candidateCarriers.forEach((c, j) => {
      if (c === null) {
        this.uncarried++;
        return;
      }
      this.cSlot[j] = c.triangle;
      this.cBary[j * 3] = c.bary[0];
      this.cBary[j * 3 + 1] = c.bary[1];
      this.cBary[j * 3 + 2] = c.bary[2];
      this.slotSamples[c.triangle].push(j);
      // The candidate is the source and carries the sample in the same triangle: its terms are the source's, and
      // `sampleResidual` of equal terms is 0 exactly — so it is not recomputed.
      this.setValue(j, same ? (this.base[j] === null ? -1 : 0) : this.valueAt(j));
    });
    this.plantMax = this.treeMax();
  }

  // --- the max tree ---------------------------------------------------------

  private better(a: number, b: number): number {
    if (a < 0) return b;
    if (b < 0) return a;
    return this.value[b] > this.value[a] ? b : a;
  }

  /** Set a sample's value; the tree is updated unless the constructor is still filling it. */
  private setValue(j: number, v: number): void {
    const was = this.value[j];
    if (was >= 0) this.measured--;
    this.value[j] = v;
    if (v >= 0) this.measured++;
    let i = this.size + j;
    this.tree[i] = v >= 0 ? j : -1;
    for (i >>= 1; i >= 1; i >>= 1) this.tree[i] = this.better(this.tree[2 * i], this.tree[2 * i + 1]);
  }

  private treeMax(): { value: number; at: number } {
    const at = this.tree[1];
    return at < 0 ? { value: -1, at: -1 } : { value: this.value[at], at };
  }

  // --- slots ----------------------------------------------------------------

  private addSlot(t: Tri, area: number, band: number): number {
    const s = this.slotCorners.length;
    this.slotCorners.push([t[0], t[1], t[2]]);
    this.slotKey.push(triKey(t));
    this.slotArea.push(area);
    this.slotLive.push(Math.abs(area) > band);
    const xs = [this.mesh.uv[t[0]][0], this.mesh.uv[t[1]][0], this.mesh.uv[t[2]][0]];
    const ys = [this.mesh.uv[t[0]][1], this.mesh.uv[t[1]][1], this.mesh.uv[t[2]][1]];
    this.slotBox.push(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
    this.slotSamples.push([]);
    return s;
  }

  private uvArea(t: Tri): number {
    const uv = this.mesh.uv;
    const x0 = uv[t[0]][0];
    const y0 = uv[t[0]][1];
    return 0.5 * ((uv[t[1]][0] - x0) * (uv[t[2]][1] - y0) - (uv[t[2]][0] - x0) * (uv[t[1]][1] - y0));
  }

  private test(j: number, s: number): Carrier | null {
    this.tally.containmentTests++;
    const c = this.slotCorners[s];
    const uv = this.mesh.uv;
    return carrierIn(this.su[j], this.sv[j], this.slotBox[s * 4], this.slotBox[s * 4 + 1], this.slotBox[s * 4 + 2], this.slotBox[s * 4 + 3], c[0], c[1], c[2], (v) => uv[v][0], (v) => uv[v][1], s);
  }

  // --- values ---------------------------------------------------------------

  private candidateTerms(j: number): SampleTerms | null {
    const s = this.cSlot[j];
    if (s < 0) return null;
    return termsAt({ points: this.mesh.pos, weights: this.mesh.weights }, { corners: this.slotCorners[s], bary: [this.cBary[j * 3], this.cBary[j * 3 + 1], this.cBary[j * 3 + 2]] }, this.index);
  }

  private valueAt(j: number): number {
    const r = this.base[j];
    const c = this.candidateTerms(j);
    if (r === null || c === null) return -1;
    return sampleResidual(r, c, this.eps, this.tau, this.pivot).total;
  }

  // --- a trial --------------------------------------------------------------

  /**
   * The working triangles after a proposed operation, carried provisionally: the reading of the mesh they make. Ends
   * in exactly one `commit` or `rollback`.
   */
  trial(triangles: ReadonlyArray<Tri>): CarryReading {
    if (this.pending !== null) throw new Error('SkinningCarry: a trial was begun while another was pending');
    this.tally.trials++;
    const seen = new Uint8Array(this.slotCorners.length);
    const added: Tri[] = [];
    let largest = 0;
    let coordinate = 0;
    const uv = this.mesh.uv;
    for (const t of triangles) {
      const s = this.keyToSlot.get(triKey(t));
      if (s === undefined) added.push(t);
      else {
        seen[s] = 1;
        largest = Math.max(largest, Math.abs(this.slotArea[s]));
      }
      for (let k = 0; k < 3; k++) coordinate = Math.max(coordinate, Math.abs(uv[t[k]][0]), Math.abs(uv[t[k]][1]));
    }
    const addedAreas = added.map((t) => this.uvArea(t));
    for (const a of addedAreas) largest = Math.max(largest, Math.abs(a));
    // areaBand's two bands over the candidate: the relative one and the float32 noise of its UVs.
    const band = Math.max(largest * 1e-6, 4 * coordinate * coordinate * 2 ** -24);
    const removed: number[] = [];
    let moved = false;
    for (const s of this.keyToSlot.values()) {
      if (!seen[s]) removed.push(s);
      else if (Math.abs(this.slotArea[s]) > band !== this.slotLive[s]) moved = true;
    }
    removed.sort((a, b) => a - b);
    const pending: Pending = {
      removed,
      firstAdded: this.slotCorners.length,
      log: [],
      appended: [],
      measured: this.measured,
      uncarried: this.uncarried,
      refused: null,
      broken: this.broken,
      plantMax: { ...this.plantMax },
      rebase: [],
      checked: [],
      fallback: moved,
      liveWas: [],
    };
    this.pending = pending;
    this.tally.trianglesRemoved += removed.length;
    this.tally.trianglesAdded += added.length;
    const addedSlots = added.map((t, i) => this.addSlot(t, addedAreas[i], band));
    const isRemoved = new Uint8Array(this.slotCorners.length);
    for (const s of removed) isRemoved[s] = 1;

    // The contract an inserted vertex has to meet, as the measurement checks every vertex of the candidate.
    for (const s of addedSlots) for (const v of this.slotCorners[s]) if (v >= this.nSource && !this.checked.has(v)) this.checkInserted(v, pending);

    const oldMax = this.treeMax();
    const affected: number[] = [];
    this.stampAt++;
    const take = (j: number): void => {
      if (this.stamp[j] === this.stampAt) return;
      this.stamp[j] = this.stampAt;
      affected.push(j);
    };
    if (moved) {
      // The bounded fallback: an unchanged triangle crossed the band, so every carrier is searched again.
      this.tally.fullRecarries++;
      for (let s = 0; s < pending.firstAdded; s++) {
        if (!seen[s]) continue;
        pending.liveWas.push([s, this.slotLive[s]]);
        this.slotLive[s] = Math.abs(this.slotArea[s]) > band;
      }
      for (let j = 0; j < this.n; j++) take(j);
    } else {
      if (this.plant !== 'stale-carrier') for (const s of removed) for (const j of this.slotSamples[s]) take(j);
      for (const s of addedSlots) {
        if (!this.slotLive[s]) continue;
        const [x0, y0, x1, y1] = [this.slotBox[s * 4], this.slotBox[s * 4 + 1], this.slotBox[s * 4 + 2], this.slotBox[s * 4 + 3]];
        const W = this.maskWidth;
        const H = this.maskHeight;
        const xa = Math.max(0, Math.floor(x0 * W - 0.5) - 1);
        const xb = Math.min(W - 1, Math.ceil(x1 * W - 0.5) + 1);
        const ya = Math.max(0, Math.floor(y0 * H - 0.5) - 1);
        const yb = Math.min(H - 1, Math.ceil(y1 * H - 0.5) + 1);
        for (let y = ya; y <= yb; y++) {
          for (let x = xa; x <= xb; x++) {
            const j = this.pixelSample[y * W + x];
            if (j >= 0 && this.cSlot[j] === -1) take(j);
          }
        }
        for (let j = this.art; j < this.n; j++) {
          if (this.cSlot[j] !== -1) continue;
          if (this.su[j] < x0 - 1e-9 || this.su[j] > x1 + 1e-9 || this.sv[j] < y0 - 1e-9 || this.sv[j] > y1 + 1e-9) continue;
          take(j);
        }
      }
    }
    affected.sort((a, b) => a - b);
    this.tally.peakAffected = Math.max(this.tally.peakAffected, affected.length);
    this.tally.samplesRecomputed += affected.length;

    // Where a sample a removal leaves outside every added triangle may still lie: on an unchanged triangle that shares a
    // vertex with a removed one. Computed once, when first needed.
    let around: number[] | null = null;
    const neighbourhood = (): number[] => {
      if (around !== null) return around;
      const corners = new Set<number>();
      for (const s of removed) for (const v of this.slotCorners[s]) corners.add(v);
      around = [];
      for (const s of this.keyToSlot.values()) if (seen[s] && this.slotLive[s] && this.slotCorners[s].some((v) => corners.has(v))) around.push(s);
      around.sort((a, b) => a - b);
      return around;
    };
    const liveAdded = addedSlots.filter((s) => this.slotLive[s]);
    const allLive = moved ? [...this.keyToSlot.values()].filter((s) => seen[s] && this.slotLive[s]).concat(liveAdded).sort((a, b) => a - b) : null;
    for (const j of affected) {
      const old = this.cSlot[j];
      const hits: Carrier[] = [];
      if (allLive !== null) {
        for (const s of allLive) {
          const h = this.test(j, s);
          if (h !== null) hits.push(h);
        }
      } else {
        for (const s of liveAdded) {
          const h = this.test(j, s);
          if (h !== null) hits.push(h);
        }
        if (hits.length === 0 && old >= 0 && isRemoved[old]) {
          for (const s of neighbourhood()) {
            const h = this.test(j, s);
            if (h !== null) hits.push(h);
          }
        }
      }
      let carrier: Carrier | null;
      try {
        carrier = resolveCarriers(this.su[j], this.sv[j], hits, `${this.who}: candidate (working vertex ids)`, (v) => this.mesh.uv[v]);
      } catch (err) {
        if (!(err instanceof MeshReductionError)) throw err;
        if (pending.refused === null) pending.refused = `SKINNING_UV_CARRIER_NOT_UNIQUE: ${err.message}`;
        carrier = hits[0];
      }
      pending.log.push({ j, slot: old, b0: this.cBary[j * 3], b1: this.cBary[j * 3 + 1], b2: this.cBary[j * 3 + 2], value: this.value[j] });
      const now = carrier === null ? -1 : carrier.triangle;
      if (old === -1 && now !== -1) this.uncarried--;
      if (old !== -1 && now === -1) this.uncarried++;
      this.cSlot[j] = now;
      if (carrier !== null) {
        this.cBary[j * 3] = carrier.bary[0];
        this.cBary[j * 3 + 1] = carrier.bary[1];
        this.cBary[j * 3 + 2] = carrier.bary[2];
        if (!moved) {
          this.slotSamples[now].push(j);
          if (now < pending.firstAdded) pending.appended.push([now, j]);
        }
      }
      this.setValue(j, this.valueAt(j));
      if (this.plant === 'previous-candidate') pending.rebase.push([j, this.candidateTerms(j)]);
    }
    if (moved) this.rebuildLists();
    if (this.plant === 'lost-maximum') {
      let best = { value: -1, at: -1 };
      for (const j of affected) if (this.value[j] > best.value) best = { value: this.value[j], at: j };
      const recomputed = affected.includes(oldMax.at);
      this.plantMax = recomputed ? best : best.value > this.plantMax.value ? best : this.plantMax;
    } else this.plantMax = this.treeMax();
    return this.reading();
  }

  private checkInserted(v: number, pending: Pending): void {
    this.checked.add(v);
    pending.checked.push(v);
    const shares = this.mesh.weights[v];
    const sum = shares.reduce((s, b) => s + b.weight, 0);
    const p = this.mesh.pos[v];
    const u = this.mesh.uv[v];
    const slack: [number, number] = [2 * R6_HALF_STEP * (1 + this.frame.width), 2 * R6_HALF_STEP * (1 + this.frame.height)];
    if (Math.abs(sum - 1) > WEIGHT_SUM_SLACK) {
      this.broken ??= `SKINNING_WEIGHT_SUM: ${this.who}: the vertex the refinement inserted at (${p[0]}, ${p[1]}) has shares summing to ${sum}; required 1 within ${WEIGHT_SUM_SLACK} (half a step of the 6-decimal weight grid)`;
    } else if (Math.abs(p[0] - u[0] * this.frame.width) > slack[0] || Math.abs(p[1] - u[1] * this.frame.height) > slack[1]) {
      this.broken ??= `SKINNING_SETUP_MISMATCH: ${this.who}: the vertex the refinement inserted at (${p[0]}, ${p[1]}) has UV (${u[0]}, ${u[1]}), at (${r6(u[0] * this.frame.width)}, ${r6(u[1] * this.frame.height)}) through the ${this.frame.width}x${this.frame.height} px frame; required within (${slack[0]}, ${slack[1]}) px per axis`;
    }
  }

  /** The reading of the state as it stands — after a trial, its provisional state. */
  reading(): CarryReading {
    if (this.broken !== null) return { state: 'refused', reason: this.broken };
    if (this.pending !== null && this.pending.refused !== null) return { state: 'refused', reason: this.pending.refused };
    if (this.measured === 0) return { state: 'not-measurable', reason: `${this.who}: no sample is carried by both the source's and the candidate's UV triangles, so there is nothing to bound` };
    return { state: 'measured', value: r6(this.plantMax.value) };
  }

  /** Every triangle's sample list read again off the carriers — the fallback's, and its rollback's. */
  private rebuildLists(): void {
    for (let s = 0; s < this.slotSamples.length; s++) this.slotSamples[s] = [];
    for (let j = 0; j < this.n; j++) if (this.cSlot[j] >= 0) this.slotSamples[this.cSlot[j]].push(j);
  }

  /** Keep the pending trial. */
  commit(): void {
    const p = this.pending;
    if (p === null) throw new Error('SkinningCarry: commit with no trial pending');
    for (const s of p.removed) {
      this.keyToSlot.delete(this.slotKey[s]);
      this.slotSamples[s] = [];
    }
    for (let s = p.firstAdded; s < this.slotCorners.length; s++) this.keyToSlot.set(this.slotKey[s], s);
    for (const [j, terms] of p.rebase) {
      if (this.base[j] === null) continue;
      this.base[j] = terms;
      this.setValue(j, this.valueAt(j));
    }
    if (p.rebase.length > 0) this.plantMax = this.treeMax();
    this.pending = null;
    this.tally.commits++;
  }

  /** Undo the pending trial: every carrier, value, list, count and the maximum as they were before it. */
  rollback(): void {
    const p = this.pending;
    if (p === null) throw new Error('SkinningCarry: rollback with no trial pending');
    for (let i = p.appended.length - 1; i >= 0; i--) this.slotSamples[p.appended[i][0]].pop();
    for (let i = p.log.length - 1; i >= 0; i--) {
      const e = p.log[i];
      this.cSlot[e.j] = e.slot;
      this.cBary[e.j * 3] = e.b0;
      this.cBary[e.j * 3 + 1] = e.b1;
      this.cBary[e.j * 3 + 2] = e.b2;
      if (this.plant !== 'no-rollback') this.setValue(e.j, e.value);
    }
    if (this.plant !== 'no-rollback') this.measured = p.measured;
    this.uncarried = p.uncarried;
    const keep = p.firstAdded;
    this.slotCorners.length = keep;
    this.slotKey.length = keep;
    this.slotArea.length = keep;
    this.slotLive.length = keep;
    this.slotBox.length = keep * 4;
    this.slotSamples.length = keep;
    for (const [s, live] of p.liveWas) this.slotLive[s] = live;
    if (p.fallback) this.rebuildLists();
    for (const v of p.checked) this.checked.delete(v);
    this.broken = p.broken;
    if (this.plant !== 'no-rollback') this.plantMax = p.plantMax;
    this.pending = null;
    this.tally.rollbacks++;
  }

  /** Bytes the carried state holds: the typed arrays, the baseline terms, the triangles and their sample lists. */
  memoryBytes(): number {
    const typed = this.su.byteLength + this.sv.byteLength + this.pixelSample.byteLength + this.cSlot.byteLength + this.cBary.byteLength + this.value.byteLength + this.tree.byteLength + this.stamp.byteLength;
    let based = 0;
    for (const b of this.base) if (b !== null) based++;
    const terms = based * 8 * (2 + 3 * this.K);
    let listed = 0;
    for (const s of this.keyToSlot.values()) listed += this.slotSamples[s].length;
    const slots = this.keyToSlot.size * 8 * (3 + 1 + 4) + listed * 8;
    return typed + terms + slots;
  }

  /**
   * The carried state held to the full recompute over `candidate`, the canonical form of the working mesh as it now
   * stands: every sample carried in it by `uvCarriers`, its terms by `termsAt` and its value by `sampleResidual` — the
   * measurement's own path, sample for sample.
   */
  compareWithFull(candidate: SourceMesh): CarryCheck {
    const samples: Array<{ uv: [number, number] }> = [];
    for (let j = 0; j < this.n; j++) samples.push({ uv: [this.su[j], this.sv[j]] });
    const carriers = uvCarriers(candidate.uvs, candidate.triangles, samples, `${this.who}: candidate`);
    let sampleDiff = 0;
    let measuredMismatch = 0;
    let fullMax = -1;
    let fullMeasured = 0;
    let fullUncarried = 0;
    let carriedMax = -1;
    for (let j = 0; j < this.n; j++) {
      const c = carriers[j];
      if (c === null) fullUncarried++;
      const r = this.sourceTerms[j];
      const full = r === null || c === null ? -1 : sampleResidual(r, termsAt(candidate, c, this.index), this.eps, this.tau, this.pivot).total;
      if (full >= 0) fullMeasured++;
      fullMax = Math.max(fullMax, full);
      carriedMax = Math.max(carriedMax, this.value[j]);
      if ((full >= 0) !== (this.value[j] >= 0)) measuredMismatch++;
      else if (full >= 0) sampleDiff = Math.max(sampleDiff, Math.abs(full - this.value[j]));
    }
    const reading = this.reading();
    const readMax = reading.state === 'measured' ? this.plantMax.value : -1;
    const equal = measuredMismatch === 0 && sampleDiff <= CARRY_TOLERANCE && fullUncarried === this.uncarried && fullMeasured === this.measured && Math.abs(readMax - fullMax) <= CARRY_TOLERANCE;
    return {
      equal,
      sampleDiff,
      measuredMismatch,
      carried: { max: readMax, measured: this.measured, uncarried: this.uncarried, reading },
      full: { max: fullMax, measured: fullMeasured, uncarried: fullUncarried },
    };
  }
}
