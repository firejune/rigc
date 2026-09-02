/**
 * bonedist — the ladder's **stage 3**: per-frame, per-bone world-transform
 * distance between two skeletons.
 *
 * ⭐ Why it exists, and what the two instruments beside it cannot see.
 * `docs/LADDER.md`'s *How a rung is scored* names three stages. Stage 2,
 * [`diff.ts`](diff.ts), compares what the two files *say* — and two structurally
 * identical rigs can pose completely differently, because a rotation of 30° and
 * a rotation of 300° are one key each. Stage 3 is the measure for that, and
 * until this file it did not exist: *"None of it exists. Do not report a
 * per-frame figure until it does"*
 * ([issue #8](https://github.com/firejune/rigc/issues/8)).
 *
 * `rigc check` is the other neighbour and it is **not** this. It measures a
 * candidate against **pictures** — the rendered reference frames — which is
 * what lets it run inside an authoring loop. Four things follow from that and
 * every one of them is a hole this file fills:
 *
 * 1. **Bones, not slots.** `check`'s unit is a drawn slot, so a bone that
 *    drives nothing visible — a control bone, a parent in a chain — has no
 *    footprint and is invisible to it.
 * 2. **A transform, not a footprint.** `check` reports a centroid and a bbox;
 *    rotation is only inferred through the bbox, and scale and shear are not
 *    separated from either.
 * 3. **A supplied correspondence.** `check`'s matcher pairs a slot to whatever
 *    reference blob is nearest and says so when that is a guess. Stage 3 wants
 *    the pairing given, because a candidate is free to use its own names and no
 *    derivation of the mapping could be anything but a guess.
 * 4. **Two skeletons, not a render.** Everything below the render scale is
 *    invisible to `check` (0.117 px per unit on rung 3), and the reference
 *    frames carry a resampling residual of their own.
 *
 * 🔒 **So this reads the reference skeleton, and is therefore a `bench`-side
 * instrument, subject to the honesty rule.** `check` deliberately is not. A run
 * that reaches for this file is at the finish line, not in the loop.
 *
 * ## Every convention, in one place
 *
 * A distance is meaningless without them, so `boneDistLines` prints this list
 * beside every figure and `BoneDistReport.conventions` carries it into the JSON.
 *
 * - **Position** — each bone's world origin taken **relative to its own
 *   skeleton's root** and divided by **its own skeleton's size**, then the
 *   Euclidean distance between the two. Unit: *skeleton sizes*. Size is the
 *   greatest root-to-bone distance in that skeleton's **setup pose**. Two-sided
 *   normalisation on purpose: a candidate is authored in its own coordinate
 *   system and under the honesty rule could not be authored in any other, so a
 *   different origin or a different unit is not an error and this absorbs both,
 *   exactly as `check`'s fitted similarity does for pixels. ⚠️ What it does
 *   **not** absorb is a globally *rotated* rig — that arrives as a constant
 *   rotation on every bone, which is the diagnosis rather than a defect of the
 *   measure.
 * - **Rotation** — the absolute difference of `getWorldRotationX()`, wrapped to
 *   ±180. Unit: degrees. Unaffected by either normalisation.
 * - **Scale** — `max(|ΔscaleX|, |ΔscaleY|)` over `getWorldScaleX/Y()`.
 *   Dimensionless, and already a ratio, so nothing is normalised.
 * - **Linear** — `max` of `|Δa|, |Δb|, |Δc|, |Δd|` over the world matrix's
 *   linear part. Dimensionless and **complete**: rotation, scale *and shear* all
 *   live in those four numbers, so nothing hides in it. It is reported *beside*
 *   rotation and scale rather than instead of them, because the pair a reader
 *   can act on is the decomposition and the number that cannot be gamed is the
 *   matrix.
 * - **Frames** — both sides sampled from t=0 at one rate over **their own**
 *   durations, compared index by index over the shorter of the two. Each
 *   animation states both frame counts and both durations, so a candidate that
 *   runs long is visible as that rather than as a pose error.
 * - **Aggregate** — per bone: the mean and the worst over the compared frames.
 *   Per animation: the mean of the bone means, and the single worst (bone,
 *   frame). 🚫 Nothing is combined **across** the four quantities and there is
 *   no score, for the reason [`diff.ts`](diff.ts) opens with: a rig with the
 *   right positions and the wrong rotations and a rig with the right rotations
 *   and the wrong positions call for opposite fixes.
 *
 * 🚫 **It gates nothing.** `docs/GATE.md` states the clauses and none of them
 * reads a figure from here. This is a reported instrument, and adding it changed
 * no threshold and no recorded figure.
 */
import { readFileSync } from 'node:fs';
import {
  loadPosable,
  PROTOCOL_FPS,
  sampleAnimation,
  sampleSetupPose,
  type BoneSnapshot,
  type Posable,
} from './render.ts';

export class BoneDistError extends Error {}

/** The sidecar spec a correspondence file declares, and the report's own. */
export const BONEDIST_SPEC = 'rigc-bonedist/1';

/** What `--bones identity` is spelled as, where a file path would go. */
export const IDENTITY_CORRESPONDENCE = 'identity';

/** How many bones the report's per-bone table shows before it says "and N more". */
export const BONE_TABLE_ROWS = 8;

// ---------------------------------------------------------------------------
// the correspondence — an input, never a derivation
// ---------------------------------------------------------------------------

/**
 * Which candidate bone is which reference bone, and which shot is which shot.
 *
 * ⭐ An **input**. A candidate is entitled to its own vocabulary
 * (`docs/LADDER.md`, the honesty rule), so any mapping this file worked out for
 * itself would be a guess dressed as a measurement — and a wrong guess reads as
 * a rig that poses wrongly, which is the one conclusion a stage-3 figure is for.
 */
export interface Correspondence {
  /** Where it came from: a path, or `identity`. Printed with every figure. */
  source: string;
  /** candidate bone name -> reference bone name. */
  bones: Map<string, string>;
  /** candidate animation name -> reference animation name, or null for by-name. */
  animations: Map<string, string> | null;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function stringMap(v: unknown, what: string, path: string): Map<string, string> {
  if (!isObj(v)) throw new BoneDistError(`${path}: \`${what}\` must be an object of "candidate": "reference" pairs`);
  const out = new Map<string, string>();
  for (const [from, to] of Object.entries(v)) {
    if (typeof to !== 'string') {
      throw new BoneDistError(`${path}: \`${what}.${from}\` must be a string naming a reference ${what.slice(0, -1)}`);
    }
    out.set(from, to);
  }
  return out;
}

/**
 * Read a correspondence file, or build the identity one.
 *
 * The identity correspondence is a **named** alternative and not a default,
 * because "the names happen to match" is a fact about a transcription and not
 * about a rig authored from a brief. The report says which it used, so a figure
 * can never be read as though a mapping had been supplied when none was.
 */
export function readCorrespondence(source: string, candidateBones: string[]): Correspondence {
  if (source === IDENTITY_CORRESPONDENCE) {
    return { source, bones: new Map(candidateBones.map((n) => [n, n])), animations: null };
  }
  const parsed: unknown = JSON.parse(readFileSync(source, 'utf8'));
  if (!isObj(parsed)) throw new BoneDistError(`${source}: expected a JSON object`);
  if (parsed.spec !== undefined && parsed.spec !== BONEDIST_SPEC) {
    throw new BoneDistError(`${source}: \`spec\` is ${JSON.stringify(parsed.spec)}, expected ${JSON.stringify(BONEDIST_SPEC)}`);
  }
  if (parsed.bones === undefined) {
    throw new BoneDistError(
      `${source}: no \`bones\` — a correspondence file states { "spec": "${BONEDIST_SPEC}", "bones": { "<candidate bone>": ` +
        '"<reference bone>" }, "animations"?: { "<candidate animation>": "<reference animation>" } }',
    );
  }
  return {
    source,
    bones: stringMap(parsed.bones, 'bones', source),
    animations: parsed.animations === undefined ? null : stringMap(parsed.animations, 'animations', source),
  };
}

// ---------------------------------------------------------------------------
// size — what a position is measured in
// ---------------------------------------------------------------------------

/** The scale one skeleton's positions are expressed in, and where it came from. */
export interface SkeletonSize {
  /** The root bone the positions are taken relative to. */
  root: string;
  /** Greatest root-to-bone distance in the setup pose, in the rig's own units. */
  size: number;
  /** The bone that set it — the report names it so the figure can be checked. */
  farthest: string | null;
  /**
   * Set when `size` came out 0 — every bone sits on the root, so there is no
   * length in the rig to divide by. Positions are then reported in **raw units**
   * and this says so, rather than a division by zero arriving as `Infinity`
   * three tables later.
   */
  degenerate: boolean;
}

function skeletonSize(posable: Posable): SkeletonSize {
  const setup = sampleSetupPose(posable.data, { bones: true }).at(0);
  const bones = setup?.bones ?? [];
  const rootData = posable.data.bones.find((b) => b.parent === null) ?? posable.data.bones.at(0);
  const rootName = rootData?.name ?? '(none)';
  const root = bones.find((b) => b.name === rootName);
  if (!root) return { root: rootName, size: 0, farthest: null, degenerate: true };
  let size = 0;
  let farthest: string | null = null;
  for (const bone of bones) {
    const distance = Math.hypot(bone.worldX - root.worldX, bone.worldY - root.worldY);
    if (distance > size) {
      size = distance;
      farthest = bone.name;
    }
  }
  return { root: rootName, size, farthest, degenerate: size === 0 };
}

// ---------------------------------------------------------------------------
// the four distances
// ---------------------------------------------------------------------------

/** To (-180, 180]. */
function wrapDegrees(degrees: number): number {
  let d = degrees % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** The four quantities, for one bone pair in one frame. See the conventions above. */
export interface BoneDelta {
  position: number;
  rotation: number;
  scale: number;
  linear: number;
}

/** Every field of `BoneDelta`, so a caller cannot iterate three of the four. */
export const BONE_QUANTITIES = ['position', 'rotation', 'scale', 'linear'] as const;

export type BoneQuantity = (typeof BONE_QUANTITIES)[number];

function deltaOf(
  candidate: BoneSnapshot,
  candidateRoot: BoneSnapshot,
  candidateSize: SkeletonSize,
  reference: BoneSnapshot,
  referenceRoot: BoneSnapshot,
  referenceSize: SkeletonSize,
): BoneDelta {
  // Raw units when either side has no length to divide by, which the report
  // says out loud rather than dividing and printing an Infinity.
  const cScale = candidateSize.degenerate || referenceSize.degenerate ? 1 : candidateSize.size;
  const rScale = candidateSize.degenerate || referenceSize.degenerate ? 1 : referenceSize.size;
  const cx = (candidate.worldX - candidateRoot.worldX) / cScale;
  const cy = (candidate.worldY - candidateRoot.worldY) / cScale;
  const rx = (reference.worldX - referenceRoot.worldX) / rScale;
  const ry = (reference.worldY - referenceRoot.worldY) / rScale;
  return {
    position: Math.hypot(cx - rx, cy - ry),
    rotation: Math.abs(wrapDegrees(candidate.rotationX - reference.rotationX)),
    scale: Math.max(Math.abs(candidate.scaleX - reference.scaleX), Math.abs(candidate.scaleY - reference.scaleY)),
    linear: Math.max(
      Math.abs(candidate.a - reference.a),
      Math.abs(candidate.b - reference.b),
      Math.abs(candidate.c - reference.c),
      Math.abs(candidate.d - reference.d),
    ),
  };
}

// ---------------------------------------------------------------------------
// the report
// ---------------------------------------------------------------------------

/** A mean and a worst over frames, with the frame the worst landed on. */
export interface Extremes {
  mean: number;
  worst: number;
  worstFrame: number;
}

export interface BoneDistBone {
  candidate: string;
  reference: string;
  /** Frames this pair was compared over. */
  frames: number;
  position: Extremes;
  rotation: Extremes;
  scale: Extremes;
  linear: Extremes;
}

/** The worst single reading of one quantity, and where it was. */
export interface WorstReading {
  value: number;
  bone: string;
  frame: number;
}

export interface BoneDistAnimation {
  candidate: string;
  reference: string;
  fps: number;
  /** Frames compared — the shorter of the two sampled counts. */
  compared: number;
  candidateFrames: number;
  referenceFrames: number;
  candidateDuration: number;
  referenceDuration: number;
  bones: BoneDistBone[];
  /** The mean of the per-bone means, per quantity. */
  means: Record<BoneQuantity, number>;
  /** The single worst (bone, frame) reading, per quantity. */
  worst: Record<BoneQuantity, WorstReading>;
}

export interface BoneDistSide {
  skeleton: string;
  atlas: string;
  size: SkeletonSize;
  bones: number;
  animations: string[];
}

export interface BoneDistReport {
  spec: string;
  fps: number;
  candidate: BoneDistSide;
  reference: BoneDistSide;
  correspondence: {
    source: string;
    /** Pairs that resolved to a bone on both sides — what the figures are over. */
    pairs: number;
    /** Named on one side and absent on the other. Reported, never guessed at. */
    candidateUnmatched: string[];
    referenceUnpaired: string[];
    /** How the shots were paired: by the file's `animations`, or by name. */
    animations: 'declared' | 'by-name';
    candidateAnimationsUnmatched: string[];
    referenceAnimationsUnpaired: string[];
  };
  animations: BoneDistAnimation[];
  /** The worst reading of each quantity over every animation. */
  worst: Record<BoneQuantity, WorstReading & { animation: string }>;
  /** The conventions every figure above was measured under, verbatim. */
  conventions: string[];
}

export interface BoneDistOptions {
  candidateSkeleton: string;
  candidateAtlas: string;
  candidateAtlasDir: string;
  referenceSkeleton: string;
  referenceAtlas: string;
  referenceAtlasDir: string;
  /** A correspondence file path, or `identity`. */
  bones: string;
  fps?: number;
}

/**
 * The conventions, as the report carries them. One list, quoted by the console
 * report and by the JSON, so the two can never state different ones.
 */
export function boneDistConventions(fps: number): string[] {
  return [
    'position — each bone\'s world origin RELATIVE TO ITS OWN SKELETON\'S ROOT, divided by that ' +
      "skeleton's OWN size (greatest root-to-bone distance in its setup pose), then the Euclidean " +
      'distance between the two. Unit: skeleton sizes. A different origin or a different unit is ' +
      'absorbed; a globally ROTATED rig is not, and arrives as a constant rotation on every bone.',
    'position, second clause — the size is a property of the WHOLE rig, so a candidate that moves the bone ' +
      'setting its size renormalises every position figure and the worst reading can land on a bone that did not ' +
      'move. That is why the header names the bone the size came from: read the two sizes first, and where they ' +
      'differ read the position column as a comparison of two rigs rather than as a per-bone error.',
    'rotation — |Δ getWorldRotationX()|, wrapped to ±180. Unit: degrees.',
    'scale — max(|Δ getWorldScaleX()|, |Δ getWorldScaleY()|). Dimensionless.',
    'linear — max(|Δa|, |Δb|, |Δc|, |Δd|) over the world matrix\'s linear part. Dimensionless and ' +
      'COMPLETE: rotation, scale and shear all live in those four numbers.',
    `frames — both sides sampled from t=0 at ${fps} fps over THEIR OWN durations, compared index by ` +
      'index over the shorter of the two. Every animation states both counts and both durations.',
    'frames, second clause — a STEPPED key sitting on a sampled time is a knife edge, and a difference in the last ' +
      'digit of that key time puts the two sides on opposite sides of the step. It reads as a whole step of ' +
      'difference on one bone at one frame while every other reading stays on the floor, and it VANISHES at a ' +
      'neighbouring rate. Before reading such a spike as a pose defect, re-run at another --fps: a real one is ' +
      'still there and a boundary one is not.',
    'aggregate — per bone: mean and worst over the compared frames. Per animation: the mean of the ' +
      'bone means, and the single worst (bone, frame). Nothing is combined across the four ' +
      'quantities, and there is no score.',
  ];
}

const NO_READING: WorstReading = { value: 0, bone: '(none)', frame: -1 };

function extremesOf(values: number[]): Extremes {
  if (values.length === 0) return { mean: 0, worst: 0, worstFrame: -1 };
  let worst = -1;
  let worstFrame = -1;
  let total = 0;
  for (let i = 0; i < values.length; i++) {
    total += values[i];
    if (values[i] > worst) {
      worst = values[i];
      worstFrame = i;
    }
  }
  return { mean: total / values.length, worst, worstFrame };
}

export function boneDistance(options: BoneDistOptions): BoneDistReport {
  const fps = options.fps ?? PROTOCOL_FPS;
  if (!Number.isFinite(fps) || fps <= 0) throw new BoneDistError('fps must be a positive number');
  const candidate = loadPosable(options.candidateSkeleton, options.candidateAtlas, options.candidateAtlasDir);
  const reference = loadPosable(options.referenceSkeleton, options.referenceAtlas, options.referenceAtlasDir);

  const candidateBoneNames = candidate.data.bones.map((b) => b.name);
  const referenceBoneNames = new Set(reference.data.bones.map((b) => b.name));
  const correspondence = readCorrespondence(options.bones, candidateBoneNames);

  // A pair only counts when both ends exist. The rest is reported by name: a
  // correspondence naming a bone neither rig declares is a defect in the input,
  // and silently dropping it would let a figure be read over half a rig.
  const candidateSet = new Set(candidateBoneNames);
  const pairs: Array<{ candidate: string; reference: string }> = [];
  const candidateUnmatched: string[] = [];
  for (const [from, to] of correspondence.bones) {
    if (!candidateSet.has(from) || !referenceBoneNames.has(to)) {
      candidateUnmatched.push(referenceBoneNames.has(to) ? `${from} (no such candidate bone)` : `${from} -> ${to} (no such reference bone)`);
      continue;
    }
    pairs.push({ candidate: from, reference: to });
  }
  const paired = new Set(pairs.map((p) => p.reference));
  const referenceUnpaired = [...referenceBoneNames].filter((n) => !paired.has(n));

  const candidateSize = skeletonSize(candidate);
  const referenceSize = skeletonSize(reference);

  const candidateAnimations = candidate.data.animations.map((a) => a.name);
  const referenceAnimations = new Set(reference.data.animations.map((a) => a.name));
  const shots: Array<{ candidate: string; reference: string }> = [];
  const candidateAnimationsUnmatched: string[] = [];
  for (const name of candidateAnimations) {
    const want = correspondence.animations?.get(name) ?? name;
    if (referenceAnimations.has(want)) shots.push({ candidate: name, reference: want });
    else candidateAnimationsUnmatched.push(correspondence.animations?.has(name) ? `${name} -> ${want}` : name);
  }
  const pairedShots = new Set(shots.map((s) => s.reference));
  const referenceAnimationsUnpaired = [...referenceAnimations].filter((n) => !pairedShots.has(n));

  const animations: BoneDistAnimation[] = [];
  const worst: Record<BoneQuantity, WorstReading & { animation: string }> = {
    position: { ...NO_READING, animation: '(none)' },
    rotation: { ...NO_READING, animation: '(none)' },
    scale: { ...NO_READING, animation: '(none)' },
    linear: { ...NO_READING, animation: '(none)' },
  };

  for (const shot of shots) {
    const candidateFrames = sampleAnimation(candidate.data, shot.candidate, fps, { bones: true });
    const referenceFrames = sampleAnimation(reference.data, shot.reference, fps, { bones: true });
    const compared = Math.min(candidateFrames.length, referenceFrames.length);
    const bones: BoneDistBone[] = [];
    for (const pair of pairs) {
      const series: Record<BoneQuantity, number[]> = { position: [], rotation: [], scale: [], linear: [] };
      for (let i = 0; i < compared; i++) {
        const cb = candidateFrames[i].bones ?? [];
        const rb = referenceFrames[i].bones ?? [];
        const cRoot = cb.find((b) => b.name === candidateSize.root);
        const rRoot = rb.find((b) => b.name === referenceSize.root);
        const c = cb.find((b) => b.name === pair.candidate);
        const r = rb.find((b) => b.name === pair.reference);
        if (!c || !r || !cRoot || !rRoot) continue;
        const delta = deltaOf(c, cRoot, candidateSize, r, rRoot, referenceSize);
        for (const q of BONE_QUANTITIES) series[q].push(delta[q]);
      }
      bones.push({
        candidate: pair.candidate,
        reference: pair.reference,
        frames: series.position.length,
        position: extremesOf(series.position),
        rotation: extremesOf(series.rotation),
        scale: extremesOf(series.scale),
        linear: extremesOf(series.linear),
      });
    }

    const means: Record<BoneQuantity, number> = { position: 0, rotation: 0, scale: 0, linear: 0 };
    const shotWorst: Record<BoneQuantity, WorstReading> = {
      position: { ...NO_READING },
      rotation: { ...NO_READING },
      scale: { ...NO_READING },
      linear: { ...NO_READING },
    };
    for (const q of BONE_QUANTITIES) {
      means[q] = bones.length === 0 ? 0 : bones.reduce((s, b) => s + b[q].mean, 0) / bones.length;
      for (const bone of bones) {
        if (bone.frames === 0 || bone[q].worst <= shotWorst[q].value) continue;
        shotWorst[q] = { value: bone[q].worst, bone: bone.candidate, frame: bone[q].worstFrame };
      }
      if (shotWorst[q].value > worst[q].value) worst[q] = { ...shotWorst[q], animation: shot.candidate };
    }

    animations.push({
      candidate: shot.candidate,
      reference: shot.reference,
      fps,
      compared,
      candidateFrames: candidateFrames.length,
      referenceFrames: referenceFrames.length,
      candidateDuration: candidateFrames.at(-1)?.time ?? 0,
      referenceDuration: referenceFrames.at(-1)?.time ?? 0,
      bones,
      means,
      worst: shotWorst,
    });
  }

  return {
    spec: BONEDIST_SPEC,
    fps,
    candidate: {
      skeleton: options.candidateSkeleton,
      atlas: options.candidateAtlas,
      size: candidateSize,
      bones: candidateBoneNames.length,
      animations: candidateAnimations,
    },
    reference: {
      skeleton: options.referenceSkeleton,
      atlas: options.referenceAtlas,
      size: referenceSize,
      bones: referenceBoneNames.size,
      animations: [...referenceAnimations],
    },
    correspondence: {
      source: correspondence.source,
      pairs: pairs.length,
      candidateUnmatched,
      referenceUnpaired,
      animations: correspondence.animations === null ? 'by-name' : 'declared',
      candidateAnimationsUnmatched,
      referenceAnimationsUnpaired,
    },
    animations,
    worst,
    conventions: boneDistConventions(fps),
  };
}

// ---------------------------------------------------------------------------
// the human report
// ---------------------------------------------------------------------------

/** Positions are in skeleton sizes and run small; the others are not. */
const PLACES: Record<BoneQuantity, number> = { position: 6, rotation: 4, scale: 6, linear: 6 };

function fmt(q: BoneQuantity, n: number): string {
  return n.toFixed(PLACES[q]);
}

function sizeLine(label: string, size: SkeletonSize): string {
  const how = size.degenerate
    ? 'every bone sits on the root, so there is no length to divide by — POSITIONS ARE IN RAW UNITS'
    : `root \`${size.root}\` -> \`${size.farthest}\` in the setup pose`;
  return `  ${label.padEnd(11)}size ${size.size.toFixed(3)}  (${how})`;
}

export function boneDistLines(report: BoneDistReport, opts?: { allBones?: boolean }): string[] {
  const lines: string[] = [];
  lines.push(`  candidate  ${report.candidate.skeleton}`);
  lines.push(`  ..         atlas ${report.candidate.atlas}`);
  lines.push(`  reference  ${report.reference.skeleton}`);
  lines.push(`  ..         atlas ${report.reference.atlas}`);
  const c = report.correspondence;
  lines.push(
    `  bones      ${c.source} — ${c.pairs} pair(s) over ${report.candidate.bones} candidate and ` +
      `${report.reference.bones} reference bone(s)`,
  );
  if (c.candidateUnmatched.length > 0) lines.push(`  ⚠️ unmatched  ${c.candidateUnmatched.join(', ')}`);
  if (c.referenceUnpaired.length > 0) {
    lines.push(`  ⚠️ unpaired   ${c.referenceUnpaired.length} reference bone(s) no pair names: ${c.referenceUnpaired.join(', ')}`);
  }
  lines.push(`  shots      paired ${c.animations}; ${report.animations.length} compared`);
  if (c.candidateAnimationsUnmatched.length > 0) {
    lines.push(`  ⚠️ no reference animation for: ${c.candidateAnimationsUnmatched.join(', ')}`);
  }
  if (c.referenceAnimationsUnpaired.length > 0) {
    lines.push(`  ⚠️ reference animation nothing is paired with: ${c.referenceAnimationsUnpaired.join(', ')}`);
  }
  lines.push(`  sampling   ${report.fps} fps`);
  lines.push(sizeLine('candidate', report.candidate.size));
  lines.push(sizeLine('reference', report.reference.size));
  lines.push('');
  lines.push('  conventions — every figure below was measured under these');
  for (const line of report.conventions) lines.push(`    · ${line}`);
  lines.push('');

  for (const anim of report.animations) {
    const lengths =
      anim.candidateFrames === anim.referenceFrames
        ? `${anim.compared} frame(s)`
        : `${anim.compared} frame(s) compared of ${anim.candidateFrames} candidate / ${anim.referenceFrames} reference ` +
          '⚠️ the two shots are not the same length';
    lines.push(
      `  ${anim.candidate}${anim.candidate === anim.reference ? '' : ` vs ${anim.reference}`}  ${lengths}, ` +
        `${anim.candidateDuration.toFixed(3)}s vs ${anim.referenceDuration.toFixed(3)}s`,
    );
    for (const q of BONE_QUANTITIES) {
      const w = anim.worst[q];
      const where = w.frame < 0 ? 'nothing compared' : `bone \`${w.bone}\`, frame ${w.frame}`;
      lines.push(`      ${q.padEnd(9)} mean ${fmt(q, anim.means[q]).padEnd(11)} worst ${fmt(q, w.value).padEnd(11)} (${where})`);
    }
    const rows = [...anim.bones].sort((x, y) => y.position.worst - x.position.worst);
    const shown = opts?.allBones ? rows : rows.slice(0, BONE_TABLE_ROWS);
    if (shown.length > 0) {
      lines.push(`      per bone, worst position first${opts?.allBones ? '' : ` (${shown.length} of ${rows.length}; --all-bones for every row)`}`);
      lines.push(`        ${'bone'.padEnd(24)} ${'position'.padEnd(21)} ${'rotation'.padEnd(19)} ${'scale'.padEnd(21)} linear`);
      for (const bone of shown) {
        const name = bone.candidate === bone.reference ? bone.candidate : `${bone.candidate}->${bone.reference}`;
        lines.push(
          `        ${name.slice(0, 24).padEnd(24)} ` +
            `${`${fmt('position', bone.position.mean)}/${fmt('position', bone.position.worst)}`.padEnd(21)} ` +
            `${`${fmt('rotation', bone.rotation.mean)}/${fmt('rotation', bone.rotation.worst)}`.padEnd(19)} ` +
            `${`${fmt('scale', bone.scale.mean)}/${fmt('scale', bone.scale.worst)}`.padEnd(21)} ` +
            `${fmt('linear', bone.linear.mean)}/${fmt('linear', bone.linear.worst)}`,
        );
      }
      lines.push('        (mean/worst per cell)');
    }
    lines.push('');
  }

  lines.push('  worst over every compared frame of every shot');
  for (const q of BONE_QUANTITIES) {
    const w = report.worst[q];
    const where = w.frame < 0 ? 'nothing compared' : `\`${w.animation}\` bone \`${w.bone}\` frame ${w.frame}`;
    lines.push(`      ${q.padEnd(9)} ${fmt(q, w.value).padEnd(11)} (${where})`);
  }
  lines.push('');
  lines.push('  There is no score and no threshold: the four quantities answer different questions and');
  lines.push('  a mean of them would answer none. `docs/GATE.md` reads nothing from this table.');
  return lines;
}
