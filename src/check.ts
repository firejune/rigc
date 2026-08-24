/**
 * rigc check — measure a candidate against reference **frames**, never against
 * the reference file.
 *
 * ## The hole this closes
 *
 * The gate is a *validity* gate. It parses the skeleton, steps every animation,
 * and refuses anything degenerate — and it has no opinion whatever about whether
 * the animation is the one in the frames. Three honest ladder runs produced zero
 * validator FAILs between them, and one of those runs shipped a build in which
 * **every easing in the file was reversed** and came back green. Both authors
 * closed the loop the same way, with a script they wrote themselves: pose the
 * candidate with `spine-core`, and compare it against what they had measured off
 * the pictures. This is that script, promoted, so the loop is
 *
 *   build → validate → check against frames → fix
 *
 * and the last step is a command rather than something each author reinvents.
 *
 * ## 🔒 The invariant: this never reads the answer
 *
 * `check` opens exactly two things — **the candidate** (its skeleton, its atlas
 * and the atlas pages) and **PNG frames** under `--frames`, plus the
 * `frames.json` sidecar beside them. It has no code path that names
 * `examples/`, an `export/` directory, a rung or a reference skeleton, and every
 * read on the reference side goes through `readFrameFile`, which refuses a path
 * that escapes `--frames` or that is neither a `.png` nor the sidecar.
 *
 * That is not fastidiousness. `docs/LADDER.md`'s honesty rule is the only thing
 * that makes a rung's number mean anything, and a fidelity tool that quietly
 * loaded the reference JSON would convert every future run from authoring into
 * transcription without anybody noticing — the exact failure that is hardest to
 * detect after the fact.
 *
 * ## What it measures
 *
 * Per animation, per frame:
 *
 * - **The framing** — where the candidate's drawn pixels sit against the
 *   reference's drawn pixels, as a scale ratio and a residual. It is reported
 *   first because it is upstream of everything else: get it wrong and every
 *   number below carries the error, disguised as motion (issue #34).
 * - **MAE over the union alpha** — the mean absolute RGB difference between the
 *   candidate composited over the frames' background and the reference frame,
 *   averaged over the pixels either side covers. Over the union rather than the
 *   whole frame because most of a frame is background on both sides, and
 *   averaging that in makes every number small and every difference between
 *   numbers smaller.
 * - **Per-frame change** — how much each side moved since **its own** previous
 *   frame, and whether those two agree. The only measure here that looks at a
 *   relation between two frames rather than at one, and the only one that can see
 *   a held pose that is not held or a one-frame event that never fired — see
 *   `FrameChange`.
 * - **Per-slot tracking** — where each of the candidate's own slots landed
 *   against the reference frame. This is the part an author acts on: MAE says
 *   *how wrong*, a slot's drift says *which part, which way, how far*.
 *
 * ⚠️ Both of the last two are bounded by what a picture can attribute, and
 * `src/slots.ts` owns that judgement: a slot the reference merged into a
 * neighbour is template-matched against its own pixels rather than guessed at,
 * and a slot nothing in its search radius matches comes back as **no match**
 * rather than as a number. A drift printed beside the wrong part is worse than a
 * blank, because it is actionable and wrong.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import {
  BACKGROUND,
  frameGeometry,
  PROTOCOL_FPS,
  posableFromText,
  renderFrame,
  sampleAnimation,
  sampleSetupPose,
  trimmedUnionBounds,
  viewportOfSize,
  PAD,
  FRAMES_SIDECAR,
  FRAMES_SPEC,
  type Footprint,
  type Frame,
  type FramesSidecar,
  type FrameSet,
  type Viewport,
} from './render.ts';
import {
  applyFit,
  boxHeight,
  boxWidth,
  contentBoxOfPlate,
  ContrastHistogram,
  fitDistance,
  fitFraming,
  fitIsSettled,
  fitSeparation,
  frameContentBox,
  unionBoxes,
  isContent,
  BACKGROUND_TOLERANCE,
  CYCLE_PIXELS,
  type BoxPair,
  type ContentBox,
  type FramingFit,
} from './framing.ts';
import { componentsOf, isAttributable, matchSlots, searchRadius, type SlotTrack } from './slots.ts';
import { chainsOf, type BoneChain } from './chains.ts';
import { readPlate, type Plate, type RGBA } from '../tools/plate.ts';

export { componentsOf, matchSlots, searchRadius, type Component, type MatchMethod, type SlotTrack } from './slots.ts';
export { chainsOf, chainBySlot, type BoneChain } from './chains.ts';
export type { BoxPair, ContentBox, FramingFit } from './framing.ts';

// ---------------------------------------------------------------------------
// the reference side — frames only, and mechanically so
// ---------------------------------------------------------------------------

/**
 * The honesty invariant, as a function: this path is a frame under `--frames`.
 *
 * Every reference-side read in this module goes through it, which is what makes
 * "`check` reads only PNG frames" a property of the code rather than a claim in
 * a comment — a path that climbs out of the frames directory, or that is neither
 * a PNG nor the sidecar, throws with both paths named. It is exported so the
 * selftest can make it fire: an invariant nobody has seen refuse anything is not
 * an invariant.
 */
export function assertFrameReadable(framesRoot: string, path: string): void {
  const abs = resolve(path);
  const inside = relative(resolve(framesRoot), abs);
  if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) {
    throw new CheckError(`${abs} is outside --frames ${resolve(framesRoot)}; check reads frames and nothing else`);
  }
  const name = basename(abs);
  if (!name.endsWith('.png') && name !== FRAMES_SIDECAR) {
    throw new CheckError(
      `${abs} is neither a .png frame nor ${FRAMES_SIDECAR}; check never reads a reference skeleton — see src/check.ts`,
    );
  }
}

function readFrameFile(framesRoot: string, path: string): Buffer {
  assertFrameReadable(framesRoot, path);
  return readFileSync(resolve(path));
}

export class CheckError extends Error {}

/** Where a frames directory's sidecar is, and which of its sets `--frames` selected. */
interface Located {
  /** The skeleton root — where `frames.json` sits. */
  root: string;
  sidecar: FramesSidecar | null;
  /** Set directories to compare; empty means "every set in the sidecar". */
  only: string[];
}

/**
 * Resolve `--frames <dir>`: either a skeleton root holding the sidecar, or one
 * animation directory inside one.
 */
export function locateFrames(framesDir: string): Located {
  const dir = resolve(framesDir);
  if (!existsSync(dir)) throw new CheckError(`no frames directory at ${dir}`);
  if (existsSync(join(dir, FRAMES_SIDECAR))) {
    return { root: dir, sidecar: readSidecar(dir), only: [] };
  }
  const parent = dirname(dir);
  if (existsSync(join(parent, FRAMES_SIDECAR))) {
    const sidecar = readSidecar(parent);
    const name = basename(dir);
    if (sidecar && sidecar.sets.some((s) => s.dir === name)) {
      return { root: parent, sidecar, only: [name] };
    }
  }
  return { root: dir, sidecar: null, only: [] };
}

function readSidecar(root: string): FramesSidecar | null {
  const raw = readFrameFile(root, join(root, FRAMES_SIDECAR)).toString('utf8');
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) return null;
  const sidecar = parsed as FramesSidecar;
  if (sidecar.spec !== FRAMES_SPEC) {
    throw new CheckError(
      `${join(root, FRAMES_SIDECAR)} declares spec ${JSON.stringify(sidecar.spec)}; this build reads ${FRAMES_SPEC}`,
    );
  }
  return sidecar;
}

/** The `f0000.png` frames in a directory, by index, in index order. */
function framesOnDisk(root: string, dir: string): Array<{ index: number; file: string }> {
  const abs = join(root, dir);
  if (!existsSync(abs)) throw new CheckError(`no frame directory at ${abs}`);
  const out: Array<{ index: number; file: string }> = [];
  for (const name of readdirSync(abs)) {
    const m = /^f(\d+)\.png$/.exec(name);
    if (!m) continue;
    out.push({ index: Number(m[1]), file: join(abs, name) });
  }
  out.sort((a, b) => a.index - b.index);
  return out;
}

// ---------------------------------------------------------------------------
// the measures
// ---------------------------------------------------------------------------

/**
 * How much a frame moved since the frame before it — on **each side separately**.
 *
 * ## Why this is not the MAE again
 *
 * Every other measure here compares the candidate against the reference *at one
 * moment*. This one compares each side against **itself** a frame earlier, and
 * then compares those two numbers. What that catches is a class of defect the
 * aggregate MAE is structurally blind to, because it is small in every single
 * frame and wrong in the relationship between them:
 *
 * - **A held pose that is not held.** Rung 6's reference is pixel-identical across
 *   f64–f67. A greedy key reduction had sloped a line through that plateau —
 *   legal under its own per-key tolerance, invisible to `validate`, invisible to
 *   `diff`, and worth so little MAE per frame that nothing flagged it. Re-rendering
 *   the candidate and diffing **its own** f67 against **its own** f68 showed 91 px
 *   moving where the reference moves 3.
 * - **A one-frame event that never fires.** The same run's tracker reveal landed a
 *   fraction of a millisecond past the animation's last sample, so it never
 *   happened. `diff` read `animations.deform` and `draw_order` as matching, the
 *   gate was green, and only looking at the last two frames found it.
 *
 * Both were found by that run building its own render-diff outside the tool
 * (`bench/runs/2026-08-23-rung6-1/LOOP.md` §10, issue #53). `check` has both frame
 * sequences in hand already, so it is the tool's job and not the author's.
 *
 * ⚠️ Only between **adjacent** frames. A set that commits stills rather than every
 * frame — rung 2's contact sheets ship `f0000` and `f0310` — has no frame-to-frame
 * delta to report, and the difference between two frames 310 apart is not one. That
 * is `null` here rather than a number about the wrong thing.
 */
export interface FrameChange {
  /** The frame this one is measured against; always `index - 1`. */
  previous: number;
  /** Pixels the candidate moved since its own previous frame. */
  candidate: number;
  /** Pixels the reference moved since its own previous frame. */
  reference: number;
  /** The same two as a mean absolute RGB difference over the whole frame, 0..255. */
  candidateMae: number;
  referenceMae: number;
  /**
   * How the two compare — see `CHANGE_RATIO`.
   *
   * `moves` means the candidate changed materially more than the reference did
   * here, `holds` materially less. Both are diagnoses the per-frame MAE cannot
   * give: a frame that is merely off by a constant offset agrees on this measure.
   */
  verdict: 'agrees' | 'moves' | 'holds';
}

export interface FrameCheck {
  index: number;
  /** The reference PNG, so a worst-frame line is directly openable. */
  file: string;
  /** Mean absolute RGB difference over the union alpha, 0..255. */
  mae: number;
  /**
   * The same total difference over the REFERENCE's own drawn pixels alone.
   *
   * ⭐ The figure to optimise against, and the reason is the denominator. `mae`
   * divides by the pixels either side drew, and the candidate owns half of that:
   * drawing something large and mostly transparent adds many cheap pixels to the
   * union and the *mean falls*, so an optimiser can buy a better score by growing
   * (issue #119 — a muzzle flare walked its own scale to 13x doing exactly this).
   * This denominator is the reference's, which nothing the candidate does can
   * move, so the only way down is to draw the reference's picture.
   *
   * ⚠️ Not bounded by 255, and deliberately: a candidate that draws far more than
   * the reference has more absolute error than the reference has pixels to carry
   * it, and the figure says so instead of saturating.
   *
   * `mae` is still the right figure for comparing two builds of the same rig,
   * where the union is near enough the same on both sides.
   */
  maeReference: number;
  /**
   * The same difference averaged over the WHOLE frame, background included.
   *
   * Reported beside `mae` and never instead of it. Most of a frame is background
   * on both sides, so this number is small for every candidate and the gap
   * between a good one and a bad one is smaller still — but it is the number an
   * ad-hoc re-render check naturally computes, so a run comparing itself against
   * an older log needs it to be able to.
   */
  maeFrame: number;
  unionPixels: number;
  candidatePixels: number;
  referencePixels: number;
  components: number;
  /** Components no slot reached — something in the shot the candidate has not drawn. */
  unmatchedComponents: number;
  worstSlot: string | null;
  worstDrift: number | null;
  /** How many slots got an attributable drift, out of how many drew anything. */
  attributed: number;
  drawn: number;
  slots: SlotTrack[];
  /** This frame against the one before it, on each side — `null` unless adjacent. */
  change: FrameChange | null;
}

/**
 * One bone chain's slice of a set — the row an author reads before deciding what
 * to re-key.
 *
 * The chains come from the CANDIDATE's bone tree (`src/chains.ts` owns the rule
 * and the reasoning); the reference stays pixels, so this is a decomposition of
 * your own figure and never a reading of the answer.
 */
export interface ChainCheck {
  /** The chain, named as `src/chains.ts` names it. */
  chain: string;
  /** How many slots it owns. */
  slots: number;
  /** How many of those drew anything in at least one compared frame. */
  drewSlots: number;
  /** The worst attributable slot drift anywhere in it, in frame pixels. */
  worstDrift: number;
  /** Which slot that was, and in which frame — `null`/`-1` when none was attributable. */
  worstDriftSlot: string | null;
  worstDriftFrame: number;
  /** The mean of every attributable slot drift in it, over `driftSamples` of them. */
  meanDrift: number;
  driftSamples: number;
  /** How many frames contributed at least one of those samples. */
  driftFrames: number;
  /**
   * The absolute RGB difference attributed to this chain, summed over the
   * REFERENCE's own drawn pixels — never over the union.
   *
   * ⭐ The denominator lesson from issue #119, applied to a share. A reference
   * pixel goes to the chain whose ink is nearest to it, so the chains partition
   * the reference's drawn pixels and the shares add up to the whole. What the
   * candidate controls is only *which* chain a pixel lands in, and growing a
   * chain's ink pulls MORE of the reference's pixels — and their error — into it.
   * There is no move here that makes a chain look better by drawing more, which is
   * exactly what the union MAE could not say.
   */
  error: number;
  /** How many reference-drawn pixels it took, summed over frames. */
  referencePixels: number;
  /**
   * `error` per pixel it took — the MAE *inside* this chain, 0..255.
   *
   * Printed beside the share because the share alone confounds being wrong with
   * being big: spineboy's head, goggles, eye and mouth are one chain covering a
   * lot of the figure, so it can carry a third of the error at a per-pixel figure
   * below the run's own mean. The share says where the error IS; this says whether
   * the chain is actually worse than the rest of the figure.
   */
  mae: number;
  /** `error` over the set's own total, 0..1 — see `AnimationCheck.chainDenominator`. */
  maeShare: number;
}

export interface AnimationCheck {
  dir: string;
  /** The animation the frames show, per the sidecar. */
  animation: string | null;
  /** The candidate animation played against it. */
  candidateAnimation: string | null;
  fps: number;
  referenceFrames: number;
  candidateFrames: number;
  compared: number;
  meanMae: number;
  /** Mean of the per-frame reference-denominator MAE — see `FrameCheck.maeReference`. */
  meanMaeReference: number;
  /**
   * How much this set draws, against how much the reference draws: the mean over
   * its frames of `candidatePixels / referencePixels`.
   *
   * 1 means the two shots put ink on the same amount of the frame. Above 1 the
   * candidate is drawing more than the reference does, which is the move that
   * makes the union MAE cheaper — see `OVERDRAW_RATIO`, which is where the
   * threshold and the corpus it came from are written down.
   */
  drawnRatio: number;
  /** Mean of the per-frame whole-frame MAE — see `FrameCheck.maeFrame`. */
  meanMaeFrame: number;
  worstMae: number;
  worstMaeFrame: number;
  worstDrift: number;
  worstDriftFrame: number;
  worstDriftSlot: string | null;
  /** Frames in which no slot at all could be attributed — the drift's denominator. */
  framesWithoutDrift: number;
  /** Adjacent frame pairs a frame-to-frame change could be measured across. */
  changePairs: number;
  /** How many of those the candidate's own change disagrees with the reference's. */
  changeDisagreements: number;
  /** The widest of those disagreements, and `-1` when there is none. */
  worstChangeFrame: number;
  /**
   * This set, broken down by the candidate's own bone chains — see `ChainCheck`.
   *
   * Chains that own no slot at all are left out: they have nothing to attribute.
   * They are still in `CheckReport.chains`, so the roster stays a complete account
   * of where every bone went.
   */
  chains: ChainCheck[];
  /**
   * The set's whole difference over the reference's own drawn pixels — the
   * denominator every `ChainCheck.maeShare` divides by.
   *
   * The same numerator `meanMaeReference` averages, kept as a total because a
   * share needs the total and a mean has already divided it away.
   */
  chainDenominator: number;
  /** The part of it no chain could take, because the candidate drew nothing at all. */
  unattributedError: number;
  frames: FrameCheck[];
  /**
   * The box THIS set's candidate frames were rendered into.
   *
   * Under the default per-shot scope every set carries its own, and they are
   * different boxes; under `--framing shared` they are all the same one. Either
   * way it is here rather than only at the top of the report, because it is
   * upstream of every number in this row.
   */
  viewport: Framing;
  /** How this set's box was chosen — see `FramingSource`. */
  framing: FramingHow;
  /** Where this set's drawn pixels ended up against the reference's. */
  framingFit: FramingReport | null;
  notes: string[];
}

/** A world box and the pixel grid it was drawn into. */
export interface Framing {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Frame pixels per world unit. */
  scale: number;
  pixelWidth: number;
  pixelHeight: number;
}

/**
 * How the world box the candidate was rendered into was arrived at.
 *
 * - `derived` — fitted to the candidate's own drawn pixels, from a start taken
 *   from its posed geometry. The default, and the only option without a sidecar.
 * - `declared` — the box `frames.json` records, reached from that same box and
 *   kept because the candidate's own pixels land on the reference's in it. See
 *   `frameByDeclaredBox` for why a measured coincidence licenses it.
 * - `pinned` — `--viewport`, which is a claim by the author and is not checked.
 */
export type FramingSource = 'derived' | 'declared' | 'pinned';

/** The same three, named for the report line rather than for the code path. */
export type FramingHow = 'candidate-pixels' | 'frames-viewport' | 'viewport-flag';

/**
 * Whether the framing is decided per frame set, or once across every set.
 *
 * ## What `per-shot` actually scopes, and why only that
 *
 * A framing is decided over the frames it is measured on, so pointing `check` at a
 * skeleton root used to decide ONE for every set under it — and one badly-framed
 * shot was then paid for by all the others. Measured on the spineboy rung, 8 shots
 * and 147 frames: `idle` read **41.59** MAE at the root against the **18.77** it
 * reads on its own frames, with not one key different (issue #100).
 *
 * `per-shot` moves exactly one decision into the set: **whether the box
 * `frames.json` records is this set's box too.** That decision is a measurement
 * with no floor — either the set's own drawn pixels land in the declared box or
 * they do not — and over the union one shot that does not can put the pooled
 * correction over `COINCIDENT_PIXELS` and take every other shot down with it. Per
 * set, the ones that qualify read exactly what pinning by hand reads.
 *
 * ⚠️ It does NOT fit a separate chain per set, and that is a measured decision
 * rather than a simplification. Per-set FITTING is worse: `fitFraming` registers
 * extent, extent is not alignment, and one shot's frames do not constrain that
 * enough — spineboy's `hit` reads 92.36 fitted on its own against 60.59 in the
 * shared fit, and its two-frame `shoot@30fps` set reads 101.94 against 42.98. So a
 * set that cannot take the declared box is measured in the shared framing, where
 * every frame in the run constrains the answer.
 *
 * `shared` is the old behaviour, and it answers one question well: *does a single
 * box serve every set?* The report prints that fit either way — see
 * `CheckReport.sharedFraming`.
 *
 * ⚠️ The two are different measurements and their absolute numbers are not
 * comparable across builds. The report says which one it did.
 */
export type FramingScope = 'per-shot' | 'shared';

/** What the framing pass concluded, and how sure it is of it. */
export interface FramingReport {
  /** The residual fit measured at the viewport that was used. */
  fit: FramingFit;
  /** How many render/measure/correct passes ran. */
  passes: number;
  /** Did the correction converge to the identity, or was it still moving? */
  settled: boolean;
  /** How the box was chosen — see `FramingSource`. */
  source: FramingSource;
  /**
   * Did the correction fall into a repeating orbit instead of converging?
   *
   * When it did, `settled` is false and **more passes cannot help**: the loop is
   * re-measuring states it has already been in. That is a fact about the fit
   * having no fixed point on this shot, not about the pass budget, and the two
   * used to print the same warning.
   */
  cycled: boolean;
  /**
   * Do the two content boxes agree, at the viewport that was used?
   *
   * `fitDistance` under `COINCIDENT_PIXELS`. This is what separates "the loop
   * fell short of its own target and the two shots are nevertheless in the same
   * place" from "the loop fell short because these are different shapes" — the
   * first is the tool's floor and the second is a finding.
   */
  agrees: boolean;
  /**
   * Whether the fit was APPLIED or only measured.
   *
   * `--viewport` pins the box, so the fit is reported and not used — which is the
   * most useful thing about pinning it: it separates "my keys are wrong" from
   * "my framing is wrong", and those are two different repairs.
   */
  applied: boolean;
  /**
   * The same two content boxes in **world units**, when the sidecar records the
   * reference's scale.
   *
   * ⭐ This is the one place a difference of pure scale can show up at all. The
   * framing deliberately absorbs it — a candidate is authored in its own
   * coordinates, so "twice as big in world units" is a choice of units and not an
   * error, and a tool that reported it as one would be reporting the thing it was
   * built to be blind to. But an author who measured the shot off the frames IS
   * working in the frames' units, and for them these two numbers are directly
   * comparable and a 2 % disagreement is a real finding. So it is printed, with
   * what it does and does not mean attached.
   */
  units: { candidate: Extent; reference: Extent; ratio: number } | null;
}

/** A width and a height in world units. */
export interface Extent {
  width: number;
  height: number;
}

export interface CheckReport {
  candidate: { skeleton: string; atlas: string };
  framesDir: string;
  framesRoot: string;
  /** One framing per set, or one across every set — see `FramingScope`. */
  framingScope: FramingScope;
  /**
   * How the candidate's own world box was chosen, when ONE box covers the run.
   *
   * `null` under a per-shot scope with more than one set compared: there is no
   * single answer then, and each `AnimationCheck` carries its own. A run that
   * compared exactly one set fills these in whatever the scope, because for one
   * set the two scopes are the same measurement.
   */
  framing: FramingHow | null;
  /** The box the CANDIDATE was rendered into, at the reference's pixel size. */
  viewport: Framing | null;
  /** Where the candidate's drawn pixels ended up against the reference's. */
  framingFit: FramingReport | null;
  /**
   * The framing ONE shared box gives across every set compared.
   *
   * Under `per-shot` it is both reported and used: every set that cannot take the
   * frames' own declared box is measured in it. It is also the figure that says
   * *why* a whole-root run is a different measurement — a set that reads well in
   * the declared box and badly here is a set the old whole-root run was measuring
   * through somebody else's silhouette, which is what `idle` reading 41.59 against
   * 18.77 was (issue #100).
   *
   * `null` when the scope is already shared — `framingFit` is that number then —
   * and when only one set was compared, where the two scopes are the same thing.
   */
  sharedFraming: FramingReport | null;
  /**
   * The box the REFERENCE was rendered into, when the sidecar records one.
   *
   * Informational: the two skeletons do not share a coordinate system, so these
   * numbers are not comparable term by term. The pixel dimensions are — they are
   * the same grid — and a difference between them is the diagnostic.
   */
  referenceViewport: Framing | null;
  background: RGBA;
  /**
   * The candidate's bone tree, cut into chains — the roster the report prints.
   *
   * Printed rather than assumed, because a decomposition an author has to guess at
   * is one they will read wrong: the table says `front-thigh` and the roster says
   * which bones and which slots that name covers. `src/chains.ts` owns the rule.
   */
  chains: BoneChain[];
  animations: AnimationCheck[];
  notes: string[];
}

export interface CheckOptions {
  skeletonText: string;
  atlasText: string;
  /** Where the atlas's page paths resolve from. */
  atlasDir: string;
  framesDir: string;
  /** Labels for the report; the texts above are what is actually read. */
  labels?: { skeleton: string; atlas: string };
  /** Only used when there is no sidecar to take the rate from. */
  fps?: number;
  /**
   * Pin the candidate's world box `x,y,width,height` instead of deriving it.
   *
   * Two uses, and the second is the one an authoring loop wants. It is the escape
   * hatch when the derivation cannot work — a candidate deliberately missing a
   * part has a different content box by construction, and pinning lets the rest
   * of the shot still be measured. And it is the way to hold the framing FIXED
   * across builds: the framing line is still reported, so a pinned run separates
   * "my keys moved" from "my framing moved" without either hiding the other.
   */
  viewport?: { x: number; y: number; width: number; height: number };
  /** Play this candidate animation against the frames, when the names differ. */
  as?: string;
  /**
   * Fit one framing per frame set, or one across every set compared.
   *
   * Defaults to `per-shot`. See `FramingScope` for what the choice costs and why
   * this is the default; it has no effect when only one set is compared, and none
   * when `viewport` pins the box (a pin is a claim about the candidate's own
   * coordinates, and those do not change between shots).
   */
  framing?: FramingScope;
}

// ---------------------------------------------------------------------------

/**
 * Compare a candidate against a set of reference frames.
 *
 * ## 🧭 Why the candidate is framed by its own pixels
 *
 * The obvious move — render the candidate into the world box the sidecar
 * records — is wrong, and wrong in a way that reads as a catastrophic failure
 * rather than as a mistake: on rung 3's honest candidate it reports MAE 146/255,
 * because that candidate put its origin on the pendulum's pivot and the
 * reference put its own somewhere else entirely. **A candidate is authored in
 * its own coordinate system, and under the ladder's honesty rule it could not be
 * authored in any other** — the reference's origin is in the file the author is
 * not allowed to open.
 *
 * So the candidate is framed by its own content. What changed (issue #34) is what
 * "content" means. It used to be the union of the **posed quad corners**, and a
 * region attachment's quad extends past its own artwork wherever the art is
 * transparent, so an outermost corner routinely sat where no pixel was. Combined
 * with a mapping that read only `minX`, `maxY` and the long side, that let one
 * corner of one quad in one frame set the scale for a whole run: rung 5's first
 * correct build reported **MAE 39.00 instead of 4.35** on a box 0.93 % narrow, and
 * rung 4 watched a rotation the pixels cannot see move the reported MAE from 27.6
 * to 84.9 by swinging one corner in and out of the box.
 *
 * Now both sides are measured the same way, **on drawn pixels**:
 *
 * 1. render the candidate at the frames' own rate and grid, and take the content
 *    box of what it actually draws (`src/framing.ts`);
 * 2. take the reference's content box off the PNGs with the same predicate;
 * 3. fit the similarity transform — uniform scale plus translation, least squares
 *    over **both** width and height — that carries one onto the other, and render
 *    through it. No single corner can set the scale, and an invisible margin
 *    cannot move it at all.
 *
 * The pass repeats until the correction is the identity, because the correction
 * changes the pixels it was measured on.
 *
 * ⚠️ What this is still not blind to: a candidate that is missing a part, or has
 * an extra one, genuinely has a different content box, and one uniform scale
 * cannot make two different shapes agree. That is no longer silently spent on the
 * framing — it is reported as the fit's **residual** and its aspect error, which
 * is the number to read before reading a drift. `--viewport` pins the box outright
 * when even that is not enough.
 */
export function checkAgainstFrames(options: CheckOptions): CheckReport {
  const located = locateFrames(options.framesDir);
  const notes: string[] = [];

  const posable = posableFromText(options.skeletonText, options.atlasText, options.atlasDir);
  let background: RGBA;
  let sets: FrameSet[];
  let pixelWidth: number;
  let pixelHeight: number;
  let referenceViewport: Framing | null = null;

  if (located.sidecar) {
    const s = located.sidecar;
    background = s.background;
    pixelWidth = s.viewport.pixelWidth;
    pixelHeight = s.viewport.pixelHeight;
    referenceViewport = { ...s.viewport };
    sets = located.only.length > 0 ? s.sets.filter((set) => located.only.includes(set.dir)) : s.sets;
    if (options.fps !== undefined && sets.some((set) => set.fps !== options.fps)) {
      throw new CheckError(
        `--fps ${options.fps} disagrees with ${FRAMES_SIDECAR}, which records ` +
          `${[...new Set(sets.map((set) => set.fps))].join(', ')} fps. The frames' own rate is the one they were ` +
          'rendered at; drop --fps, or point --frames at the set you meant',
      );
    }
  } else {
    // No sidecar: the pixel grid comes from the frames themselves, the rate from
    // --fps, and the background from this build's default — and the report says
    // so rather than letting a default look like a measurement.
    const dir = basename(located.root);
    const parent = dirname(located.root);
    const disk = framesOnDisk(parent, dir);
    if (disk.length === 0) throw new CheckError(`no f####.png frames in ${located.root}`);
    const first = readPlateFrom(located.root, disk[0].file);
    pixelWidth = first.width;
    pixelHeight = first.height;
    background = BACKGROUND;
    const fps = options.fps ?? PROTOCOL_FPS;
    const animation = dir.replace(/@\d+(\.\d+)?fps$/, '');
    sets = [
      {
        dir,
        animation: posable.data.animations.length === 0 ? null : animation,
        fps,
        sampled: disk[disk.length - 1].index + 1,
        written: disk.length,
        stride: 1,
        duration: disk[disk.length - 1].index / fps,
      },
    ];
    notes.push(
      `no ${FRAMES_SIDECAR} at ${located.root} or beside it — this frame set predates the sidecar. The rate is ` +
        `--fps ${fps}${options.fps === undefined ? ' (the protocol default, not a measurement of these frames)' : ''} ` +
        `and the background is this build's default (${BACKGROUND.join(', ')}). Re-render the set with ` +
        'bench/render_reference.ts and both become facts about the frames.',
    );
    // The set root is the animation directory itself here, so reads resolve
    // against its parent the way a sidecar layout does.
    located.root = parent;
    located.only = [dir];
  }

  if (sets.length === 0) throw new CheckError(`no frame set to compare in ${options.framesDir}`);

  // Pose every set once. Its frames are wanted twice — to frame the candidate and
  // to compare it — and posing twice is both slower and a chance for the framing
  // and the comparison to disagree about what they measured.
  const prepared = sets.map((set) => prepareSet(located.root, set, posable, options.as));
  const pairs = prepared.flatMap((p) => p.pairs);
  if (pairs.length === 0) {
    notes.push('no reference frame has a candidate frame at the same index — nothing below was measured');
  }

  const maxSide = Math.max(pixelWidth, pixelHeight);
  // One edge level for both sides, read off the reference frames — see
  // `EDGE_FRACTION`. A handful of frames is enough: the level is a property of the
  // palette, not of a pose, and reading every frame twice to learn it is waste.
  const level = pairs.length === 0 ? BACKGROUND_TOLERANCE : edgeLevelOf(located.root, pairs, background);
  const referenceBoxes =
    pairs.length === 0 ? [] : referenceContentBoxes(located.root, pairs, background, level, pixelWidth, pixelHeight);

  const scope: FramingScope = options.framing ?? 'per-shot';
  const slices = sliceBySet(prepared, referenceBoxes);
  /** One per prepared set, in `prepared` order. */
  const framings: SetFraming[] = [];
  let topViewport: Viewport | null = null;
  let topHow: FramingHow | null = null;
  let topFit: FramingReport | null = null;
  let sharedFraming: FramingReport | null = null;

  const reportFor = (fit: FramingFit, at: Viewport, over: Omit<FramingReport, 'units' | 'fit'>): FramingReport => ({
    ...over,
    fit,
    units: extentsOf(fit, at.scale, referenceViewport),
  });

  if (options.viewport) {
    // A pin is a claim about the CANDIDATE's own coordinates, and those do not
    // change between shots — so one box covers the run whatever the scope. The
    // per-set fits below are free: every frame is measured in that one box once,
    // and splitting the result per set costs nothing.
    const v = options.viewport;
    const pinned = viewportOfSize(v.x, v.y, v.width, v.height, maxSide / Math.max(v.width, v.height), pixelWidth, pixelHeight);
    notes.push(
      `the candidate's world box was pinned by --viewport ${v.x},${v.y},${v.width},${v.height} rather than derived ` +
        "from its own pixels — that is a claim about the candidate's coordinates, and nothing here checks it. The " +
        'framing line below is still measured, so it says what the pin cost.',
    );
    const pinnedShape = { passes: 1, settled: false, source: 'pinned' as const, cycled: false, applied: false };
    const perSet = prepared.map((p, i) =>
      pairUpBoxes([p], posable.pages, pinned, background, level, slices[i]),
    );
    for (const boxes of perSet) {
      const fit = boxes.length === 0 ? null : fitFraming(boxes);
      framings.push({
        viewport: pinned,
        how: 'viewport-flag',
        fit: fit === null ? null : reportFor(fit, pinned, { ...pinnedShape, agrees: fitDistance(fit) <= COINCIDENT_PIXELS }),
        notes: [],
      });
    }
    const all = perSet.flat();
    topViewport = pinned;
    topHow = 'viewport-flag';
    if (all.length > 0) {
      const fit = fitFraming(all);
      topFit = reportFor(fit, pinned, { ...pinnedShape, agrees: fitDistance(fit) <= COINCIDENT_PIXELS });
    }
  } else if (referenceBoxes.every((b) => b === null)) {
    throw new CheckError('no reference frame could be compared, so there is nothing to frame against');
  } else if (scope === 'shared' || prepared.length === 1) {
    const framed = frameCandidate(
      prepared,
      posable.pages,
      referenceBoxes,
      background,
      level,
      pixelWidth,
      pixelHeight,
      referenceViewport,
    );
    const fit = { ...framed.report, units: extentsOf(framed.report.fit, framed.viewport.scale, referenceViewport) };
    const how = HOW_BY_SOURCE[framed.report.source];
    for (let i = 0; i < prepared.length; i++) framings.push({ viewport: framed.viewport, how, fit, notes: [] });
    topViewport = framed.viewport;
    topHow = how;
    topFit = fit;
    notes.push(...framingNotes(framed.report));
    if (prepared.length > 1) {
      notes.push(
        `one framing was fitted across all ${prepared.length} frame set(s) (--framing shared). Its absolute numbers ` +
          'are not comparable with a per-shot run, and one badly-fitted set moves every other set in it.',
      );
    }
  } else {
    // Per shot: the DECLARED BOX is decided per set, and every set that does not
    // qualify for it is measured in the one shared framing.
    //
    // ## Why the split falls exactly there, and not "fit each set on its own"
    //
    // The obvious reading of issue #100 is that each set should get its own fitted
    // framing. It was written that way and measured, and it is worse — on the
    // spineboy rung, per-set fitting reads `hit` **92.36** against the shared
    // fit's 60.59 and `shoot@30fps` **101.94** against 42.98 (a two-frame set,
    // framed 24 % off). The reason is `fitFraming`'s own: it registers **extent**,
    // and extent is not alignment, so on a shot whose silhouette genuinely differs
    // the chain has a local minimum of the correction that is not a minimum of the
    // difference. More frames constrain that; one shot's worth does not.
    //
    // What actually produced the good column in that run is the other half — the
    // box `frames.json` records, which is not an estimate of anything and has no
    // floor. Over the union it was refused, because ONE badly-fitted shot put the
    // pooled correction over `COINCIDENT_PIXELS` and the whole root fell back to a
    // fit. Per set, the four sets that ARE in the frames' coordinates take it and
    // read exactly what pinning by hand reads: `idle` **18.77** against 41.59,
    // `walk` 32.00 against 45.33.
    //
    // So a set is framed by the frames' own box when its OWN pixels land there,
    // and by the shared fit otherwise. Every set is then at least as well framed
    // as a whole-root run framed it, and four of spineboy's sixteen much better.
    const shared = frameCandidate(
      prepared,
      posable.pages,
      referenceBoxes,
      background,
      level,
      pixelWidth,
      pixelHeight,
      referenceViewport,
    );
    const sharedShape: SetFraming = {
      viewport: shared.viewport,
      how: HOW_BY_SOURCE[shared.report.source],
      fit: { ...shared.report, units: extentsOf(shared.report.fit, shared.viewport.scale, referenceViewport) },
      notes: [],
    };
    sharedFraming = sharedShape.fit;
    let own = 0;
    for (let i = 0; i < prepared.length; i++) {
      const p = prepared[i];
      const declared =
        p.pairs.length === 0
          ? null
          : frameByDeclaredBox(
              [p],
              posable.pages,
              slices[i],
              background,
              level,
              pixelWidth,
              pixelHeight,
              referenceViewport,
            );
      if (!declared) {
        framings.push({ ...sharedShape, notes: framingNotes(shared.report) });
        continue;
      }
      own++;
      framings.push({
        viewport: declared.viewport,
        how: HOW_BY_SOURCE[declared.report.source],
        fit: { ...declared.report, units: extentsOf(declared.report.fit, declared.viewport.scale, referenceViewport) },
        notes: framingNotes(declared.report),
      });
    }
    notes.push(
      `the framing was decided per frame set: ${own} of ${prepared.length} set(s) were measured in ` +
        `${FRAMES_SIDECAR}'s own box because their own pixels land there, and the rest in the one shared framing on ` +
        'the "shared box" line. A set framed by the frames\' own box cannot be moved by any other set. --framing ' +
        'shared measures every set in the shared framing instead, which is a different measurement and not ' +
        'comparable with this one.',
    );
  }

  // The candidate's own decomposition, derived once and used by every set — see
  // `src/chains.ts`. Reading the CANDIDATE's tree is what keeps this on the right
  // side of the honesty rule: the reference is still nothing but pixels.
  const chains = chainsOf(
    posable.data.bones.map((bone) => ({ name: bone.name, parent: bone.parent === null ? null : bone.parent.name })),
    posable.data.slots.map((slot) => ({ name: slot.name, bone: slot.boneData.name })),
  );
  const chainOfSlot = new Map<string, number>();
  chains.forEach((chain, index) => {
    for (const slot of chain.slots) chainOfSlot.set(slot, index);
  });

  const animations: AnimationCheck[] = [];
  for (let i = 0; i < prepared.length; i++) {
    const f = framings[i];
    animations.push(checkOneSet(located.root, prepared[i], posable, f, background, chains, chainOfSlot));
  }

  return {
    candidate: {
      skeleton: options.labels?.skeleton ?? '(in memory)',
      atlas: options.labels?.atlas ?? '(in memory)',
    },
    framesDir: resolve(options.framesDir),
    framesRoot: located.root,
    framingScope: scope,
    framing: topHow,
    viewport: topViewport === null ? null : framingOfViewport(topViewport),
    framingFit: topFit,
    sharedFraming,
    referenceViewport,
    background,
    chains,
    animations,
    notes,
  };
}

/** The framing one prepared set was measured in. */
interface SetFraming {
  viewport: Viewport;
  how: FramingHow;
  fit: FramingReport | null;
  notes: string[];
}

/** `FramingSource` said in the report's own words. */
const HOW_BY_SOURCE: Record<FramingSource, FramingHow> = {
  derived: 'candidate-pixels',
  declared: 'frames-viewport',
  pinned: 'viewport-flag',
};

/**
 * `referenceBoxes` cut into one array per prepared set, in `prepared` order.
 *
 * The array is built by `prepared.flatMap((p) => p.pairs)`, so this is the inverse
 * of that flatten and nothing else. It exists because a per-shot framing measures
 * one set at a time and `frameCandidate` indexes its boxes the flat way.
 */
function sliceBySet(prepared: PreparedSet[], referenceBoxes: Array<ContentBox | null>): Array<Array<ContentBox | null>> {
  const out: Array<Array<ContentBox | null>> = [];
  let at = 0;
  for (const p of prepared) {
    out.push(referenceBoxes.slice(at, at + p.pairs.length));
    at += p.pairs.length;
  }
  return out;
}

/** A rendering viewport as the report states it. */
function framingOfViewport(v: Viewport): Framing {
  return {
    x: v.minX,
    y: v.minY,
    width: v.maxX - v.minX,
    height: v.maxY - v.minY,
    scale: v.scale,
    pixelWidth: v.width,
    pixelHeight: v.height,
  };
}

function readPlateFrom(root: string, file: string): Plate {
  readFrameFile(root, file); // the guard; readPlate does the decoding
  return readPlate(file);
}

// ---------------------------------------------------------------------------
// framing
// ---------------------------------------------------------------------------

/**
 * How many render → measure → correct passes the framing is allowed.
 *
 * A faithful candidate settles on the first look. What the old ceiling of 4 read
 * as "a jitter floor by the third or fourth pass" is, measured properly, an
 * **orbit**: on rung 6 the correction repeats with period 4, so passes 4–7 come
 * back as 8–11 and again as 12–15, to within 0.02 px. Stopping at 4 stopped
 * mid-orbit, on whichever phase pass 4 happened to be — and that phase was the
 * worst of the four, framed 0.063 % off the scale the frames were rendered at and
 * worth **5 MAE points** on that shot (8.73 against a pinned 3.50, issue #52).
 *
 * One more pass reaches the orbit's closest phase and takes the same shot to 5.62;
 * 6, 8, 12, 16 and 24 passes all return that same viewport, because `chosen`
 * keeps the closest pass and the orbit has no better one. So the ceiling is raised
 * to two full periods — enough to see every phase of an orbit this size — and
 * `fitSeparation` stops the loop the moment it recognises one, which costs the
 * cycling case one pass rather than four. A shot that is genuinely still
 * converging is unaffected: it settles and breaks out first.
 *
 * ⚠️ This is not a way to reach the right framing. Nothing in an extent fit can
 * be: at the box `frames.json` records — the one the frames were actually drawn
 * at — rung 6's edge residual is 0.41 px rms, **worse** than the 0.23 px the orbit
 * reaches, because the candidate's silhouette genuinely differs and the best fit
 * of two extents is not the best alignment of two pictures (`fitFraming`, "the
 * floor, stated plainly"). That is what `frameByDeclaredBox` is for.
 */
const FRAMING_PASSES = 8;

/**
 * How far the candidate's drawn pixels may sit from the reference's and still be
 * called the same place, in pixels.
 *
 * One pixel, and the margin on either side of it is enormous rather than fine.
 * What this threshold has to separate is a candidate authored in the frames' own
 * world coordinates from one authored in its own, and those differ by an origin
 * or a unit — tens to hundreds of pixels — not by a fraction of one. Rung 6's
 * candidate reads 0.45 px in the declared box; rung 3's mechanical transcription
 * reads 0.07; a rig scaled by 2 % reads about 5 before the scale is taken out and
 * about 0.07 after. Nothing measured so far lands between 1 and 5.
 */
export const COINCIDENT_PIXELS = 1;

/**
 * The two content boxes in world units, each divided by its own render scale.
 *
 * `null` without a sidecar: the reference's scale is the only thing that makes
 * its pixels into units, and a frame set that predates `frames.json` does not
 * record one. Inventing a default there would print a number that looks measured.
 */
function extentsOf(
  fit: FramingFit,
  candidateScale: number,
  referenceViewport: Framing | null,
): { candidate: Extent; reference: Extent; ratio: number } | null {
  if (!referenceViewport || candidateScale <= 0 || referenceViewport.scale <= 0) return null;
  const candidate = {
    width: boxWidth(fit.candidate) / candidateScale,
    height: boxHeight(fit.candidate) / candidateScale,
  };
  const reference = {
    width: boxWidth(fit.reference) / referenceViewport.scale,
    height: boxHeight(fit.reference) / referenceViewport.scale,
  };
  const area = reference.width * reference.height;
  // Area rather than either side: one ratio for a shot whose two axes can differ.
  const ratio = area > 0 ? Math.sqrt((candidate.width * candidate.height) / area) : 1;
  return { candidate, reference, ratio };
}

/** How many reference frames the edge level is estimated from. */
const LEVEL_SAMPLES = 8;

/** The edge threshold both sides are measured with — see `EDGE_FRACTION`. */
function edgeLevelOf(root: string, pairs: FramePair[], background: RGBA): number {
  const histogram = new ContrastHistogram();
  const step = Math.max(1, Math.ceil(pairs.length / LEVEL_SAMPLES));
  for (let i = 0; i < pairs.length; i += step) histogram.add(readPlateFrom(root, pairs[i].file), background);
  return histogram.level();
}

/** Each reference frame's own content box, and a check that they are one grid. */
function referenceContentBoxes(
  root: string,
  pairs: FramePair[],
  background: RGBA,
  level: number,
  pixelWidth: number,
  pixelHeight: number,
): Array<ContentBox | null> {
  return pairs.map((pair) => {
    const plate = readPlateFrom(root, pair.file);
    if (plate.width !== pixelWidth || plate.height !== pixelHeight) {
      throw new CheckError(
        `${pair.file} is ${plate.width}x${plate.height} but the viewport says ${pixelWidth}x${pixelHeight}; ` +
          'the frames and the sidecar disagree about their own size',
      );
    }
    return contentBoxOfPlate(plate, background, level);
  });
}

/**
 * The two content boxes of every frame that has both, in one array.
 *
 * Per frame rather than unioned, because that is what the fit is made from — see
 * `fitFraming`. `referenceBoxes` is indexed the same way `prepared.flatMap(pairs)`
 * is, which is the order it was built in.
 */
function pairUpBoxes(
  prepared: PreparedSet[],
  pages: Map<string, Plate>,
  viewport: Viewport,
  background: RGBA,
  level: number,
  referenceBoxes: Array<ContentBox | null>,
): BoxPair[] {
  const out: BoxPair[] = [];
  let at = 0;
  for (const p of prepared) {
    for (const pair of p.pairs) {
      const reference = referenceBoxes[at++];
      const candidate = frameContentBox(pair.frame, pages, viewport, background, level);
      if (candidate && reference) out.push({ candidate, reference });
    }
  }
  return out;
}

/** One measured pass of the framing loop. */
interface FramingPass {
  viewport: Viewport;
  fit: FramingFit;
  distance: number;
}

/** A framing for one run of sets: the box, and what it still leaves over. */
interface FramedSets {
  viewport: Viewport;
  report: Omit<FramingReport, 'units'>;
}

/** A chain of passes and why it stopped. */
interface FramingChain {
  passes: FramingPass[];
  settled: boolean;
  cycled: boolean;
}

/**
 * Render → measure → correct, from one starting viewport, until it stops.
 *
 * ## Why it iterates
 *
 * The correction is measured on a render, and applying it changes the render it
 * was measured on. One pass leaves the candidate close; a second measures what is
 * left. It stops as soon as the correction is the identity to within
 * `SETTLED_PIXELS`, which for a faithful candidate is the first look.
 *
 * ## And why it also watches for an orbit
 *
 * When the fit has no fixed point on a shot — which happens whenever the
 * candidate's silhouette genuinely differs, because the fit registers extent and
 * extent is not alignment — the sequence does not wander and does not converge. It
 * **cycles**, and every further pass re-measures a state it has already been in at
 * the cost of a full re-render of every frame. `fitSeparation` recognises that in
 * one comparison per pass, so a cycling shot stops one pass after its orbit closes
 * instead of burning the whole budget, and the report can say which of the two
 * happened. Rung 6 cycles with period 4 (issue #52).
 */
function runFramingChain(
  seed: Viewport,
  prepared: PreparedSet[],
  pages: Map<string, Plate>,
  referenceBoxes: Array<ContentBox | null>,
  background: RGBA,
  level: number,
  pixelWidth: number,
  pixelHeight: number,
  cap: number,
): FramingChain {
  let viewport = seed;
  const passes: FramingPass[] = [];
  for (let pass = 1; pass <= cap; pass++) {
    const boxes = pairUpBoxes(prepared, pages, viewport, background, level, referenceBoxes);
    // A viewport the candidate draws nothing into ends the chain rather than
    // failing it, and both ways of reaching one are real. The declared box gets
    // there on its first pass whenever the candidate is authored somewhere else
    // entirely — rung 1's `drop` candidate is nowhere near the frames' own world
    // box — which is the declared path being refused, not an error. And a chain
    // that does not converge can walk its own box off its content later on, where
    // the answer is the closest pass already measured. The caller decides what an
    // empty chain means; only the fitted path treats it as a failure.
    if (boxes.length === 0) return { passes, settled: false, cycled: false };
    const fit = fitFraming(boxes);
    const cycled = passes.some((seen) => fitSeparation(fit, seen.fit) < CYCLE_PIXELS);
    passes.push({ viewport, fit, distance: fitDistance(fit) });
    if (fitIsSettled(fit)) return { passes, settled: true, cycled: false };
    if (cycled) return { passes, settled: false, cycled: true };
    viewport = applyFit(viewport, fit, pixelWidth, pixelHeight);
  }
  return { passes, settled: false, cycled: false };
}

/**
 * The pass whose correction is closest to the identity.
 *
 * ⚠️ The **closest** pass rather than the last, and the viewport handed back is
 * therefore one that was actually MEASURED, with the fit beside it being what it
 * still leaves over — never a correction applied on the way out and never looked
 * at. Near the answer the correction can jitter or orbit instead of converging, so
 * taking the last pass would hand back whichever phase the loop happened to stop
 * on, and applying one more unverified correction is a coin flip. A report that
 * describes a viewport nobody rendered is worse than a slightly worse viewport.
 */
function closestPass(chain: FramingChain): FramingPass {
  let best = chain.passes[0];
  for (const pass of chain.passes) if (pass.distance < best.distance) best = pass;
  return best;
}

/**
 * Put the candidate's drawn pixels on the reference's drawn pixels.
 *
 * Two ways in, and the second is tried first because when it applies it is exact
 * rather than estimated — see `frameByDeclaredBox`. The fitted path is the general
 * one and the only one available without a sidecar.
 *
 * ## Why the fitted start is trimmed
 *
 * The starting box is the union of the posed quads **trimmed to their opaque
 * texels**, not the quads themselves. It is only a starting point — the framing is
 * fitted on rendered pixels either way — but the fit's landing point depends on
 * where it starts, so a start that moved with an invisible margin would leave the
 * margin able to move the answer after all, by a fraction of a pixel instead of by
 * two. With the trim, art padded on both sides is byte-identical work: same start,
 * same passes, same numbers. `selftest` C03 asserts exactly that.
 */
function frameCandidate(
  prepared: PreparedSet[],
  pages: Map<string, Plate>,
  referenceBoxes: Array<ContentBox | null>,
  background: RGBA,
  level: number,
  pixelWidth: number,
  pixelHeight: number,
  referenceViewport: Framing | null,
): FramedSets {
  const declared = frameByDeclaredBox(
    prepared,
    pages,
    referenceBoxes,
    background,
    level,
    pixelWidth,
    pixelHeight,
    referenceViewport,
  );
  // The declared-box probe measures every frame in `frames.json`'s own box
  // whether or not it ends up being used, and that measurement is the only one
  // taken in a box every set shares. Handing it back is what lets a per-shot run
  // report `sharedFit` without a second render — see `CheckReport.sharedFit`.
  if (declared) return declared;

  const chain = runFramingChain(
    seedFromGeometry(prepared, pages, referenceBoxes, pixelWidth, pixelHeight),
    prepared,
    pages,
    referenceBoxes,
    background,
    level,
    pixelWidth,
    pixelHeight,
    FRAMING_PASSES,
  );
  if (chain.passes.length === 0) {
    throw new CheckError('the candidate drew no pixel in any frame that was compared');
  }
  const chosen = closestPass(chain);
  return {
    viewport: chosen.viewport,
    report: {
      fit: chosen.fit,
      passes: chain.passes.length,
      settled: chain.settled,
      source: 'derived',
      cycled: chain.cycled,
      agrees: chosen.distance <= COINCIDENT_PIXELS,
      applied: true,
    },
  };
}

/**
 * The starting viewport, from the candidate's own posed geometry laid onto the
 * reference's own drawn extent.
 *
 * ## Why the reference's extent and not the frame
 *
 * The seed used to scale the candidate's trimmed quads to **fill the frame**, and
 * that is an assumption about the reference: that the shot its frames show was
 * framed around itself. Over a whole skeleton root it holds well enough, because
 * the sidecar's one box was chosen to hold every set. Over one SHORT set it can be
 * badly wrong — rung 3's `light` covers about half of the box its frames were
 * rendered in, so filling the frame starts it near 2x too large, and the chain
 * walks that back by only a few per cent a pass: `--frames <root>/light` on a
 * candidate in its own coordinates read **MAE 141** with a framing 65 % off, after
 * spending its whole pass budget (issue #100).
 *
 * The reference's own content box is already measured, on the same frames, with
 * the same predicate — it is what the fit is trying to reach. Starting there costs
 * nothing and starts the chain where it used to end up: the same shot now settles
 * on the first or second pass.
 *
 * The scale matches the two boxes by **area** rather than by either side, because
 * a candidate whose silhouette differs has two different side ratios and picking
 * one of them would seed the chain with that difference as a scale error.
 *
 * ⚠️ Falls back to filling the frame when there is no reference box to aim at —
 * every frame unreadable, or a set with nothing on disk.
 */
function seedFromGeometry(
  prepared: PreparedSet[],
  pages: Map<string, Plate>,
  referenceBoxes: Array<ContentBox | null>,
  pixelWidth: number,
  pixelHeight: number,
): Viewport {
  const quads = trimmedUnionBounds(
    prepared.map((p) => p.pairs.map((pair) => pair.frame)),
    pages,
  );
  if (!Number.isFinite(quads.minX)) {
    throw new CheckError('the candidate posed no drawable attachment in any frame that was compared');
  }
  const pad = Math.max(quads.maxX - quads.minX, quads.maxY - quads.minY) * PAD;
  const world = {
    minX: quads.minX - pad,
    minY: quads.minY - pad,
    maxX: quads.maxX + pad,
    maxY: quads.maxY + pad,
  };
  const worldWidth = world.maxX - world.minX;
  const worldHeight = world.maxY - world.minY;

  let reference: ContentBox | null = null;
  for (const box of referenceBoxes) reference = unionBoxes(reference, box);
  if (reference !== null && boxWidth(reference) > 0 && boxHeight(reference) > 0) {
    // The reference's box is the trimmed content, so pad it the same way the
    // candidate's is before the two are matched — otherwise the pad is a scale
    // error the chain then has to undo.
    const refWidth = boxWidth(reference) * (1 + 2 * PAD);
    const refHeight = boxHeight(reference) * (1 + 2 * PAD);
    const scale = Math.sqrt((refWidth * refHeight) / (worldWidth * worldHeight));
    const left = reference.left - boxWidth(reference) * PAD;
    const top = reference.top - boxHeight(reference) * PAD;
    // `projector` is px = (wx - minX)·k and py = (maxY - wy)·k, so putting the
    // candidate's padded box on the reference's is one subtraction per axis.
    const minX = world.minX - left / scale;
    const maxY = world.maxY + top / scale;
    return viewportOfSize(minX, maxY - pixelHeight / scale, pixelWidth / scale, pixelHeight / scale, scale, pixelWidth, pixelHeight);
  }

  const maxSide = Math.max(pixelWidth, pixelHeight);
  return viewportOfSize(
    world.minX,
    world.minY,
    worldWidth,
    worldHeight,
    maxSide / Math.max(worldWidth, worldHeight),
    pixelWidth,
    pixelHeight,
  );
}

/**
 * The box `frames.json` records, used as the candidate's own — when, and only
 * when, the candidate's pixels are measured to land in it.
 *
 * ## 🔒 This is not reading the answer
 *
 * The thing the honesty rule protects is the reference **skeleton** — its bones,
 * its keys, its curves — and none of that is here. `frames.json` is a sidecar
 * `check` already reads, whose `viewport` it already prints, and which
 * [`docs/AUTHORING.md`](../docs/AUTHORING.md) §9 already tells an author to hand
 * back through `--viewport`. What changes is only that the tool now *checks* the
 * condition the guide asks the author to assert, instead of requiring them to
 * notice it and type it.
 *
 * ## Why a declared box beats a fitted one
 *
 * A fit is an estimate with a floor. `fitFraming` registers two shots by their
 * **extent**, so when the candidate's silhouette genuinely differs the best fit of
 * the extents is about a third of a pixel away from the best alignment of the
 * pictures — and on a small high-contrast shot a third of a pixel is several MAE.
 * Rung 6 measures that floor as a 5-point tax: 8.73 fitted against 3.50 in the box
 * the frames were actually drawn at, with every content box, residual and rms
 * under the method's own noise (issue #52).
 *
 * The declared box has no such floor. It is not an estimate of where the frames
 * were drawn; it is where they were drawn. So the only question is whether it
 * applies to *this* candidate, and that is one measurement: render the candidate
 * into the declared box, fit, and keep the box when the correction it asks for is
 * under `COINCIDENT_PIXELS`. Nothing is corrected and nothing is iterated —
 * either the candidate is in the frames' coordinates or it is not.
 *
 * ⚠️ **Correcting the declared box makes it worse, measured.** The obvious extra
 * step — accept it, then run the usual passes from there to polish — was written
 * and measured, and it walks off the answer: rung 5's candidate, whose author
 * matched the reference's world box by hand, reads **4.35** at the declared box and
 * **6.24** after three refining passes, and 4.35 is the figure `fitFraming` records
 * as this shot's correct framing. Rung 6 reads 3.50 at the box and drifts the same
 * way. The refinement is the extent fit, and the extent fit is exactly what the
 * declared box is here to avoid.
 *
 * A candidate authored in its own coordinates — the ordinary case, and the one the
 * ladder's honesty rule guarantees — misses by a wide margin and is framed by the
 * fitted path exactly as before. Rung 3's candidate put its origin on the pendulum's
 * pivot and the reference put its own elsewhere; in the declared box that candidate
 * reports MAE 146/255, and its fit says so long before the pixels are ever compared.
 * Rung 1's `drop` candidate draws nothing at all in the declared box.
 *
 * ⚠️ So does a rig in the frames' coordinates at **different units**, which is a
 * choice the framing must stay blind to (`selftest` C04). It is refused here and
 * framed by the fitted path, where the blindness lives — and it therefore pays the
 * fit's floor where a same-units candidate does not. Recovering the unit from the
 * fit and scaling the declared box by it was measured too: on a rig scaled by 2 %
 * it recovers 1.0196 against a true 1.02 and lands two thirds of the way back, which
 * is more machinery for a case no candidate in the corpus has and still not exact.
 */
function frameByDeclaredBox(
  prepared: PreparedSet[],
  pages: Map<string, Plate>,
  referenceBoxes: Array<ContentBox | null>,
  background: RGBA,
  level: number,
  pixelWidth: number,
  pixelHeight: number,
  referenceViewport: Framing | null,
): { viewport: Viewport; report: Omit<FramingReport, 'units'> } | null {
  if (!referenceViewport || referenceViewport.scale <= 0) return null;
  const viewport = viewportOfSize(
    referenceViewport.x,
    referenceViewport.y,
    referenceViewport.width,
    referenceViewport.height,
    referenceViewport.scale,
    pixelWidth,
    pixelHeight,
  );
  const boxes = pairUpBoxes(prepared, pages, viewport, background, level, referenceBoxes);
  // Nothing drawn in the declared box is the loudest possible "not these
  // coordinates", not a failure: rung 1's `drop` candidate is nowhere near it.
  if (boxes.length === 0) return null;
  const fit = fitFraming(boxes);
  const distance = fitDistance(fit);
  if (distance > COINCIDENT_PIXELS) return null;
  return {
    viewport,
    report: {
      fit,
      passes: 1,
      settled: fitIsSettled(fit),
      source: 'declared',
      cycled: false,
      agrees: true,
      applied: true,
    },
  };
}

/**
 * What the framing pass concluded, in the words that tell the three cases apart.
 *
 * The distinction the report used to be missing (issue #52): "did not settle, and
 * the two shots are nevertheless in the same place" is the tool reaching its own
 * floor, "did not settle, and they are not" is a finding about the candidate, and
 * "the correction is cycling" says more passes cannot change either answer.
 */
function framingNotes(report: Omit<FramingReport, 'units'>): string[] {
  if (report.source === 'declared') {
    return [
      `the candidate's world box was taken from ${FRAMES_SIDECAR} rather than fitted, because rendering it into ` +
        `that box put its own drawn pixels on the reference's to within ${report.fit.rms.toFixed(2)} px rms — so ` +
        "the candidate is authored in the frames' own coordinates, measured rather than assumed, and the box they " +
        'were rendered at is exact where a fit of it is an estimate. The framing line below is still measured; what ' +
        `it leaves over is the extent fit's own floor${report.settled ? '' : ', which is why it does not read as the identity'}. ` +
        'Pass --viewport to override.',
    ];
  }
  if (report.settled) return [];
  const how = report.cycled
    ? `the framing correction fell into a repeating orbit after ${report.passes} pass(es) rather than settling, so ` +
      'more passes cannot help: the fit has no fixed point on this shot'
    : `the framing did not settle in ${report.passes} pass(es)`;
  return [
    report.agrees
      ? `${how}. The two content boxes nevertheless agree to within ${report.fit.rms.toFixed(2)} px rms, so this is ` +
        "the fit's own floor and not a shape mismatch — the fit registers extent, and on a silhouette that differs " +
        'anywhere the best fit of the extents is not the best alignment of the pictures. Pass --viewport to pin the ' +
        'box when you know your own coordinates.'
      : `${how}, and the two content boxes do not agree either — the correction below is what is left over after ` +
        'the closest pass. A residual much larger than a pixel means the two shots are different shapes, which is ' +
        'a finding about the candidate rather than about the loop.',
  ];
}

// ---------------------------------------------------------------------------
// posing the candidate against one frame set
// ---------------------------------------------------------------------------

/** One reference frame and the candidate frame that shares its index. */
interface FramePair {
  index: number;
  file: string;
  frame: Frame;
}

/** One frame set, posed and paired up with the frames on disk. */
interface PreparedSet {
  set: FrameSet;
  candidateAnimation: string | null;
  candidateFrames: number;
  referenceFrames: number;
  pairs: FramePair[];
  notes: string[];
  /** Set when nothing could be compared at all, saying why. */
  missing: string | null;
}

function prepareSet(
  root: string,
  set: FrameSet,
  posable: ReturnType<typeof posableFromText>,
  as: string | undefined,
): PreparedSet {
  const notes: string[] = [];
  const wanted = as ?? set.animation;
  const have = posable.data.animations.map((a) => a.name);
  const disk = framesOnDisk(root, set.dir);

  if (wanted !== null && !have.includes(wanted)) {
    return {
      set,
      candidateAnimation: null,
      candidateFrames: 0,
      referenceFrames: disk.length,
      pairs: [],
      notes: [],
      missing:
        `the candidate has no animation called ${JSON.stringify(wanted)} — it has [${have.join(', ') || 'none'}]. ` +
        'Nothing was compared for this set; name the candidate animation with --as <name> if it is called ' +
        'something else.',
    };
  }

  let candidateFrames: Frame[];
  let candidateAnimation: string | null;
  if (wanted === null) {
    if (have.length > 0) {
      notes.push(
        `these frames are a setup pose (the skeleton that made them has no animation), but the candidate has ` +
          `[${have.join(', ')}] — the setup pose is what was compared`,
      );
    }
    candidateFrames = sampleSetupPose(posable.data);
    candidateAnimation = null;
  } else {
    candidateFrames = sampleAnimation(posable.data, wanted, set.fps);
    candidateAnimation = wanted;
  }

  if (candidateFrames.length !== set.sampled) {
    notes.push(
      `the candidate samples to ${candidateFrames.length} frame(s) at ${set.fps} fps where the reference sampled ` +
        `${set.sampled} — the two animations do not last the same time, and only the frames both have were compared`,
    );
  }

  const byIndex = new Map<number, Frame>();
  for (const frame of candidateFrames) byIndex.set(frame.index, frame);
  const pairs: FramePair[] = [];
  for (const { index, file } of disk) {
    const frame = byIndex.get(index);
    if (frame) pairs.push({ index, file, frame });
  }
  if (pairs.length === 0 && disk.length > 0) {
    notes.push(`none of the ${disk.length} reference frame(s) has a candidate frame at the same index`);
  }
  return {
    set,
    candidateAnimation,
    candidateFrames: candidateFrames.length,
    referenceFrames: disk.length,
    pairs,
    notes,
    missing: null,
  };
}

function checkOneSet(
  root: string,
  prepared: PreparedSet,
  posable: ReturnType<typeof posableFromText>,
  framing: SetFraming,
  background: RGBA,
  chains: BoneChain[],
  /** Slot name → its index in `chains`. */
  chainOfSlot: Map<string, number>,
): AnimationCheck {
  const { set } = prepared;
  const viewport = framing.viewport;
  const blank: AnimationCheck = {
    dir: set.dir,
    animation: set.animation,
    candidateAnimation: prepared.candidateAnimation,
    fps: set.fps,
    referenceFrames: prepared.referenceFrames,
    candidateFrames: prepared.candidateFrames,
    compared: 0,
    meanMae: 0,
    meanMaeReference: 0,
    drawnRatio: 1,
    meanMaeFrame: 0,
    worstMae: 0,
    worstMaeFrame: -1,
    worstDrift: 0,
    worstDriftFrame: -1,
    worstDriftSlot: null,
    framesWithoutDrift: 0,
    changePairs: 0,
    changeDisagreements: 0,
    worstChangeFrame: -1,
    chains: [],
    chainDenominator: 0,
    unattributedError: 0,
    frames: [],
    viewport: framingOfViewport(viewport),
    framing: framing.how,
    framingFit: framing.fit,
    notes: prepared.missing ? [prepared.missing] : [...framing.notes, ...prepared.notes],
  };
  if (prepared.missing !== null || prepared.pairs.length === 0) return blank;

  const frames: FrameCheck[] = [];
  let maeSum = 0;
  let maeReferenceSum = 0;
  let drawnRatioSum = 0;
  let maeFrameSum = 0;
  let worstMae = 0;
  let worstMaeFrame = -1;
  let worstDrift = 0;
  let worstDriftFrame = -1;
  let worstDriftSlot: string | null = null;
  let framesWithoutDrift = 0;
  let changePairs = 0;
  let changeDisagreements = 0;
  let worstChangeFrame = -1;
  let worstChangeGap = 0;
  // The previous frame's two plates, kept so each side can be compared against
  // ITSELF a frame earlier. Both are already rendered or read for this frame, so
  // holding one frame of each costs one extra plate and no extra work.
  let previous: { index: number; candidate: Plate; reference: Plate } | null = null;
  const tally: ChainTally = {
    error: new Array<number>(chains.length).fill(0),
    pixels: new Array<number>(chains.length).fill(0),
    unattributed: 0,
    total: 0,
  };

  for (const { index, file, frame } of prepared.pairs) {
    const reference = readPlateFrom(root, file);
    const rendered = renderFrame(frame, posable.pages, viewport, background);
    const check = checkOneFrame(
      index,
      file,
      frame,
      posable.pages,
      viewport,
      background,
      reference,
      rendered,
      chainOfSlot,
      tally,
    );
    check.change = previous && previous.index === index - 1 ? frameChange(previous, rendered, reference) : null;
    previous = { index, candidate: rendered, reference };
    frames.push(check);
    maeSum += check.mae;
    maeReferenceSum += check.maeReference;
    drawnRatioSum += check.referencePixels === 0 ? 1 : check.candidatePixels / check.referencePixels;
    maeFrameSum += check.maeFrame;
    if (check.attributed === 0) framesWithoutDrift++;
    if (check.change) {
      changePairs++;
      if (check.change.verdict !== 'agrees') {
        changeDisagreements++;
        const gap = Math.abs(check.change.candidate - check.change.reference);
        if (gap > worstChangeGap) {
          worstChangeGap = gap;
          worstChangeFrame = index;
        }
      }
    }
    if (check.mae > worstMae) {
      worstMae = check.mae;
      worstMaeFrame = index;
    }
    if (check.worstDrift !== null && check.worstDrift > worstDrift) {
      worstDrift = check.worstDrift;
      worstDriftFrame = index;
      worstDriftSlot = check.worstSlot;
    }
  }

  return {
    ...blank,
    compared: frames.length,
    chains: chainChecks(chains, frames, tally),
    chainDenominator: tally.total,
    unattributedError: tally.unattributed,
    meanMae: maeSum / frames.length,
    meanMaeReference: maeReferenceSum / frames.length,
    drawnRatio: drawnRatioSum / frames.length,
    meanMaeFrame: maeFrameSum / frames.length,
    worstMae,
    worstMaeFrame,
    worstDrift,
    worstDriftFrame,
    worstDriftSlot,
    framesWithoutDrift,
    changePairs,
    changeDisagreements,
    worstChangeFrame,
    frames,
    notes: [...framing.notes, ...prepared.notes],
  };
}

/**
 * How far a channel must move for a pixel to count as having **changed**.
 *
 * The same threshold `isContent` uses to decide there is anything there at all,
 * and for the same reason: below it the difference is the rasteriser's own last
 * bit, and a measure that counts those reports every frame as moving.
 */
export const CHANGE_TOLERANCE = BACKGROUND_TOLERANCE;

/**
 * How many times more one side has to move than the other to be a disagreement,
 * when **both** of them moved.
 *
 * Four, with `CHANGE_EXCESS` beside it, because a ratio alone means nothing on
 * small counts. Together the two read: *four times as much, and at least two dozen
 * pixels more.*
 */
export const CHANGE_RATIO = 4;

/**
 * ...and how many pixels more, when both sides moved.
 *
 * Measured rather than picked. Across the corpus's two mechanically faithful
 * transcriptions — the same skeleton on both sides, where the true answer is
 * "identical" — the largest excess between two adjacent frames that clears
 * `CHANGE_RATIO` at all is **12 px**, on one pair out of 152. Twenty-four is double
 * that, and the case it has to keep is rung 6's broken plateau at 91 against 3.
 */
export const CHANGE_EXCESS = 24;

/**
 * Did this side move materially more than that one?
 *
 * ⭐ **Stillness is categorical and gets no floor**, which is the reason this is a
 * predicate and not a threshold. A held pose is held *exactly* — rung 6's reference
 * is pixel-identical across f64-f67 — and a one-frame event is as small as the
 * thing it reveals, which on that same shot is **three pixels**. A floor big enough
 * to be safe about a moving frame would be big enough to hide both, so the two
 * regimes are separated instead: against a still side, moving at all is the
 * finding; against a moving side, `CHANGE_RATIO` and `CHANGE_EXCESS` apply.
 * Measured: neither faithful transcription has a single pair where one side is
 * still and the other is not.
 */
function disagrees(mine: number, theirs: number): boolean {
  if (mine === 0) return false;
  if (theirs === 0) return true;
  return mine > theirs * CHANGE_RATIO && mine - theirs > CHANGE_EXCESS;
}

/**
 * One frame against the frame before it, on each side, and what that says.
 *
 * ⚠️ Over the **whole frame**, and not over either side's content mask the way the
 * MAE is. The omission is deliberate: a change is a change wherever it happens, and
 * masking it would hide precisely the case where one side draws something the other
 * does not — which is half of what this measure exists for. A one-frame reveal
 * appears on background pixels by definition.
 */
function frameChange(
  previous: { index: number; candidate: Plate; reference: Plate },
  candidate: Plate,
  reference: Plate,
): FrameChange {
  const mine = plateDelta(previous.candidate, candidate);
  const theirs = plateDelta(previous.reference, reference);
  return {
    previous: previous.index,
    candidate: mine.pixels,
    reference: theirs.pixels,
    candidateMae: mine.mae,
    referenceMae: theirs.mae,
    verdict: disagrees(mine.pixels, theirs.pixels)
      ? 'moves'
      : disagrees(theirs.pixels, mine.pixels)
        ? 'holds'
        : 'agrees',
  };
}

/**
 * Changed pixels and mean absolute RGB difference between two plates of one size.
 *
 * Straight over `Plate.data` rather than through `Plate.get`, because this runs
 * twice per compared frame over the whole grid and `get` allocates a four-element
 * array per pixel. On the ladder's largest set that difference is most of what this
 * measure costs.
 */
function plateDelta(before: Plate, after: Plate): { pixels: number; mae: number } {
  const a = before.data;
  const b = after.data;
  const count = after.width * after.height;
  let pixels = 0;
  let sum = 0;
  for (let i = 0; i < count * 4; i += 4) {
    const dr = Math.abs(a[i] - b[i]);
    const dg = Math.abs(a[i + 1] - b[i + 1]);
    const db = Math.abs(a[i + 2] - b[i + 2]);
    sum += dr + dg + db;
    if (dr > CHANGE_TOLERANCE || dg > CHANGE_TOLERANCE || db > CHANGE_TOLERANCE) pixels++;
  }
  return { pixels, mae: sum / 3 / count };
}

/**
 * Roll a set's frames up into one row per chain — the dashboard's rows.
 *
 * A chain that owns no slot is left out: it has nothing to attribute, and a row of
 * dashes in every set is noise in a table read sixteen times. The roster at the
 * foot of the report still lists it, so the account of where every bone went stays
 * complete.
 */
function chainChecks(chains: BoneChain[], frames: FrameCheck[], tally: ChainTally): ChainCheck[] {
  const out: ChainCheck[] = [];
  chains.forEach((chain, index) => {
    if (chain.slots.length === 0) return;
    const own = new Set(chain.slots);
    const drew = new Set<string>();
    let worstDrift = 0;
    let worstDriftSlot: string | null = null;
    let worstDriftFrame = -1;
    let driftSum = 0;
    let driftSamples = 0;
    let driftFrames = 0;
    for (const frame of frames) {
      let sampled = false;
      for (const track of frame.slots) {
        if (!own.has(track.slot)) continue;
        if (track.candidate !== null) drew.add(track.slot);
        if (!isAttributable(track)) continue;
        const drift = track.drift as number;
        driftSum += drift;
        driftSamples++;
        sampled = true;
        if (drift > worstDrift) {
          worstDrift = drift;
          worstDriftSlot = track.slot;
          worstDriftFrame = frame.index;
        }
      }
      if (sampled) driftFrames++;
    }
    out.push({
      chain: chain.name,
      slots: chain.slots.length,
      drewSlots: drew.size,
      worstDrift,
      worstDriftSlot,
      worstDriftFrame,
      meanDrift: driftSamples === 0 ? 0 : driftSum / driftSamples,
      driftSamples,
      driftFrames,
      error: tally.error[index],
      referencePixels: tally.pixels[index],
      mae: tally.pixels[index] === 0 ? 0 : tally.error[index] / tally.pixels[index],
      maeShare: tally.total === 0 ? 0 : tally.error[index] / tally.total,
    });
  });
  return out;
}

/**
 * A set's error, being split between the candidate's chains as its frames are read.
 *
 * Carried across frames rather than parked on each `FrameCheck` because a share is
 * a fact about the SET — and because a per-frame array of it would land in every
 * `--json` report and every `bench.json` for a number nobody reads per frame.
 */
interface ChainTally {
  /** Absolute difference over reference-drawn pixels attributed to each chain. */
  error: number[];
  /** How many such pixels each chain took. */
  pixels: number[];
  /** The same, over reference pixels no chain could take — the candidate drew nothing. */
  unattributed: number;
  /** Every reference-drawn pixel's difference, chain or not: the share's denominator. */
  total: number;
}

/** How much a diagonal step costs the chamfer pass below. */
const DIAGONAL_STEP = Math.SQRT2;

/**
 * Give every pixel of the frame the chain whose ink is nearest to it.
 *
 * Two chamfer passes over the owner mask — forward then backward, propagating
 * (distance, label) together. It is an approximate Euclidean transform and that is
 * enough: what it decides is which of a handful of well-separated regions a pixel
 * belongs to, not a distance anybody reads.
 *
 * ⚠️ Nearest **ink the candidate drew**, so a chain that draws nothing seeds
 * nothing and is handed no pixels at all — its share reads 0 % while its slots are
 * missing entirely. That is why the table prints `drewSlots` beside the share: 0 %
 * on `0/3 slots` is the loudest row here, not the quietest one.
 *
 * The distance comes back with the label because the caller bounds it — see
 * `chainRadii`.
 */
function nearestOwner(owner: Int32Array, width: number, height: number): { label: Int32Array; dist: Float32Array } {
  const label = Int32Array.from(owner);
  const dist = new Float32Array(width * height);
  for (let i = 0; i < label.length; i++) dist[i] = label[i] >= 0 ? 0 : Infinity;
  const relax = (at: number, from: number, step: number): void => {
    const reach = dist[from] + step;
    if (reach >= dist[at]) return;
    dist[at] = reach;
    label[at] = label[from];
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * width + x;
      if (x > 0) relax(at, at - 1, 1);
      if (y > 0) {
        relax(at, at - width, 1);
        if (x > 0) relax(at, at - width - 1, DIAGONAL_STEP);
        if (x + 1 < width) relax(at, at - width + 1, DIAGONAL_STEP);
      }
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const at = y * width + x;
      if (x + 1 < width) relax(at, at + 1, 1);
      if (y + 1 < height) {
        relax(at, at + width, 1);
        if (x + 1 < width) relax(at, at + width + 1, DIAGONAL_STEP);
        if (x > 0) relax(at, at + width - 1, DIAGONAL_STEP);
      }
    }
  }
  return { label, dist };
}

/**
 * How far each chain's attribution may reach, in frame pixels.
 *
 * The same judgement `src/slots.ts` makes about a slot — *past about its own long
 * side a part no longer overlaps where it was, and something out there is another
 * object rather than this one moved* — applied to the chain's own drawn box. Past
 * it, reference ink is left **unattributed** instead of being handed to whichever
 * chain happens to be nearest.
 *
 * ⚠️ This is the bound that keeps the dashboard honest about its own limits, and
 * it is a bound rather than a fix. Nothing candidate-side can know which part of
 * the REFERENCE a pixel belonged to; nearest-ink is a good guess while the figure
 * is roughly in place and a bad one once a part has left. So a part displaced past
 * its own size stops being blamed on its neighbour and starts showing up in the
 * `(unattributed)` row, next to the `reference component(s) no slot reaches` count
 * that says the same thing a different way.
 */
function chainRadii(
  footprints: Map<string, Footprint>,
  chainOfSlot: Map<string, number>,
  chains: number,
): Float64Array {
  const minX = new Float64Array(chains).fill(Infinity);
  const minY = new Float64Array(chains).fill(Infinity);
  const maxX = new Float64Array(chains).fill(-Infinity);
  const maxY = new Float64Array(chains).fill(-Infinity);
  for (const [slot, foot] of footprints) {
    const chain = chainOfSlot.get(slot);
    if (chain === undefined || foot.pixels === 0) continue;
    if (foot.minX < minX[chain]) minX[chain] = foot.minX;
    if (foot.minY < minY[chain]) minY[chain] = foot.minY;
    if (foot.maxX > maxX[chain]) maxX[chain] = foot.maxX;
    if (foot.maxY > maxY[chain]) maxY[chain] = foot.maxY;
  }
  const out = new Float64Array(chains);
  for (let i = 0; i < chains; i++) {
    out[i] = maxX[i] < minX[i] ? -1 : searchRadius(maxX[i] - minX[i], maxY[i] - minY[i]);
  }
  return out;
}

function checkOneFrame(
  index: number,
  file: string,
  frame: Frame,
  pages: Map<string, Plate>,
  viewport: Viewport,
  background: RGBA,
  reference: Plate,
  /** The candidate's own frame, rendered by the caller — it needs it too. */
  rendered: Plate,
  /** Slot name → chain index, for the per-chain split. */
  chainOfSlot: Map<string, number>,
  /** Accumulated across the set by the caller — see `ChainTally`. */
  tally: ChainTally,
): FrameCheck {
  const { coverage, footprints, owner } = frameGeometry(frame, pages, viewport, chainOfSlot);
  // Only worth the transform when something was drawn to be nearest TO.
  const nearest =
    owner !== null && owner.some((at) => at >= 0) ? nearestOwner(owner, viewport.width, viewport.height) : null;
  const radii = chainRadii(footprints, chainOfSlot, tally.error.length);

  let union = 0;
  let candidatePixels = 0;
  let referencePixels = 0;
  let sum = 0;
  let sumAll = 0;
  for (let y = 0; y < viewport.height; y++) {
    for (let x = 0; x < viewport.width; x++) {
      const inCandidate = coverage[y * viewport.width + x] === 1;
      const inReference = isContent(reference, x, y, background);
      if (inCandidate) candidatePixels++;
      if (inReference) referencePixels++;
      const a = rendered.get(x, y);
      const b = reference.get(x, y);
      const delta = (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;
      sumAll += delta;
      if (inReference) {
        // The share's denominator is the reference's own drawn pixels, and the
        // split is over exactly those — issue #119's lesson, as a partition.
        tally.total += delta;
        const at = y * viewport.width + x;
        const found = nearest === null ? -1 : nearest.label[at];
        const chain = found >= 0 && nearest !== null && nearest.dist[at] <= radii[found] ? found : -1;
        if (chain >= 0) {
          tally.error[chain] += delta;
          tally.pixels[chain]++;
        } else {
          tally.unattributed += delta;
        }
      }
      if (!inCandidate && !inReference) continue;
      union++;
      sum += delta;
    }
  }

  const components = componentsOf(reference, background);
  const { tracks, matchedComponents } = matchSlots(footprints, components, {
    frame,
    pages,
    viewport,
    background,
    reference,
  });

  let worstDrift: number | null = null;
  let worstSlot: string | null = null;
  let attributed = 0;
  let drawn = 0;
  for (const track of tracks) {
    if (track.candidate !== null) drawn++;
    if (!isAttributable(track)) continue;
    attributed++;
    if (worstDrift === null || (track.drift as number) > worstDrift) {
      worstDrift = track.drift;
      worstSlot = track.slot;
    }
  }

  return {
    index,
    file,
    mae: union === 0 ? 0 : sum / union,
    // The same numerator over a denominator the candidate does not control — see
    // `FrameCheck.maeReference`. Both figures are already in hand here, which is
    // why the second one costs nothing to publish.
    maeReference: referencePixels === 0 ? 0 : sum / referencePixels,
    maeFrame: sumAll / (viewport.width * viewport.height),
    unionPixels: union,
    candidatePixels,
    referencePixels,
    components: components.length,
    unmatchedComponents: components.length - matchedComponents,
    worstSlot,
    worstDrift,
    attributed,
    drawn,
    slots: tracks,
    // Filled in by the caller, which is the only place that has the frame before
    // this one — see `frameChange`.
    change: null,
  };
}

// ---------------------------------------------------------------------------
// the report
// ---------------------------------------------------------------------------

/**
 * How much more than the reference a set may draw before `check` calls it
 * overdraw, as a ratio of drawn pixels.
 *
 * ## Why this direction needs its own warning
 *
 * `mae` divides by the pixels **either side drew** — the union — and the
 * candidate owns half of that denominator. A large, mostly transparent sprite
 * adds many cheap pixels to it and the *mean falls*, so anything optimising
 * against `mae` can buy a better score by drawing more, which is the opposite of
 * fidelity. Issue #119: spineboy-2's muzzle flare walked its own scale to 13x
 * doing exactly this, and cost every set in that run its framing. Reproduced
 * here, that candidate's `shoot` reads union MAE **39.65 against the honest
 * build's 47.20** — the metric calls the flare an improvement — while the same
 * difference over the reference's own pixels reads **73.06 against 52.54**.
 *
 * ⭐ Asymmetric on purpose. A candidate that draws LESS than the reference is
 * being punished by the MAE, not rewarded, and needs no warning to find out.
 *
 * ## Where 1.5 comes from
 *
 * Measured over the corpus rather than picked. Across the twelve committed
 * candidates in `bench/runs/` — 64 compared sets, 1 to 121 frames each — the
 * ratio spans **0.852 … 1.069** on 62 of them, and the two above that are both
 * the same shot on the same character: spineboy-1's `shoot@30fps` at 1.154 and
 * spineboy-2's at **1.274**, two-frame stills sets where the muzzle flare lands
 * a frame off. Rung 8's ball reads 1.041, rung 3's candidate 0.993.
 *
 * The 13x flare reads **1.850** on `shoot` and **3.199** on `shoot@30fps`, and
 * 0.94–1.01 on the fourteen sets that do not draw it — so the warning names the
 * shot the overdraw is in rather than colouring the whole run.
 *
 * 1.5 is the geometric middle of the gap between the widest honest reading and
 * the weakest defective one (1.274 · 1.850 ≈ 1.535²): half again as much ink as
 * the reference put down, which no honest candidate in the corpus approaches and
 * which the case this was built for clears on both its sets.
 *
 * ## What was measured and rejected: the content boxes
 *
 * Issue #119 suggests the two content boxes, and `check` has both. Measured, that
 * test is defeated by the framing it is measured through. `fitFraming` absorbs a
 * uniform scale on purpose, so a candidate that draws everything too big reads a
 * box growth of **−3.4 %** while its union MAE falls 137.6 → 36.0 — the fit
 * simply shrinks it back. It also fires where nothing is overdrawn: the
 * time-reversed fixture, whose ink is right and whose *timing* is wrong, reads
 * **+14.1 %** because sampling a reversed shot lands on different poses. Counting
 * ink is blind to both — that same reversed fixture draws **1.30–1.39x**, under
 * the bar, and a bloated one draws what it drew whatever the framing does with it
 * afterwards. C08 and C09 hold both ends of that.
 */
export const OVERDRAW_RATIO = 1.5;

/** How many worst frames a set prints when the whole set is too long to list. */
export const WORST_FRAMES = 8;
/** Sets no longer than this print every frame. */
const LIST_EVERY = 24;

const f2 = (n: number): string => n.toFixed(2);

export function checkLines(report: CheckReport, opts?: { allFrames?: boolean }): string[] {
  const lines: string[] = [];
  lines.push(`  candidate  ${report.candidate.skeleton}`);
  lines.push(`  atlas      ${report.candidate.atlas}`);
  lines.push(`  frames     ${report.framesDir}`);
  lines.push(
    `  scope      ${
      report.framingScope === 'per-shot'
        ? "the framing decided per frame set (--framing shared measures every set in one shared framing)"
        : "one framing across every frame set (--framing per-shot lets a set take frames.json's own box instead)"
    }`,
  );
  const v = report.viewport;
  if (v !== null) lines.push(...framedToLines(v, report.framing));
  const r = report.referenceViewport;
  if (r) {
    lines.push(
      `  reference  ${r.pixelWidth}x${r.pixelHeight}px  ${r.scale.toFixed(6)} px/unit  ` +
        `world x[${r.x.toFixed(1)} .. ${(r.x + r.width).toFixed(1)}] y[${r.y.toFixed(1)} .. ${(r.y + r.height).toFixed(1)}]  (${FRAMES_SIDECAR})`,
    );
    lines.push('             ⤷ the two world boxes are different coordinate systems and do not compare; the pixel grid does.');
  }
  for (const line of framingLines(report.framingFit)) lines.push(line);
  if (report.sharedFraming) {
    const shared = report.sharedFraming;
    const f = shared.fit;
    const signed = (n: number): string => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
    lines.push(
      `  shared box one box for all ${report.animations.length} set(s) leaves x${f.scale.toFixed(6)}  offset ` +
        `${signed(f.dx)}, ${signed(f.dy)} px   rms ${f.rms.toFixed(2)} px over ${f.frames * 4} edge(s)  ` +
        `(${shared.source}; used for every set that could not take the frames' own box)`,
    );
    lines.push(
      "             ⤷ how far one shared framing is from serving every set. A set below that took the frames' own " +
        'box instead is measured with no such correction at all; --framing shared measures every set here.',
    );
  }
  for (const note of report.notes) lines.push(`  ⚠️ ${note}`);
  lines.push('');

  for (const anim of report.animations) {
    const played =
      anim.candidateAnimation !== null
        ? `candidate animation ${JSON.stringify(anim.candidateAnimation)}`
        : anim.animation === null
          ? 'setup pose'
          : 'nothing in the candidate to play against it';
    lines.push(`  ── ${anim.dir} — ${played}, ${anim.fps} fps ──`);
    lines.push(
      `     frames     ${anim.referenceFrames} on disk, candidate samples ${anim.candidateFrames}, ${anim.compared} compared`,
    );
    // Only when this set has a framing of its own: under a shared scope, or a pin,
    // the header already printed the one box every set was measured in, and
    // repeating it per set would read as though they differed.
    if (report.framingScope === 'per-shot' && report.viewport === null) {
      for (const line of framedToLines(anim.viewport, anim.framing, '   ')) lines.push(line);
      for (const line of framingLines(anim.framingFit, '   ')) lines.push(line);
    }
    for (const note of anim.notes) lines.push(`     ⚠️ ${note}`);
    if (anim.compared === 0) {
      lines.push('');
      continue;
    }
    lines.push(
      `     MAE        mean ${f2(anim.meanMae)}  worst ${f2(anim.worstMae)} at f${String(anim.worstMaeFrame).padStart(4, '0')}` +
        `   (0..255 over the union alpha; over the whole frame, mean ${f2(anim.meanMaeFrame)})`,
    );
    lines.push(
      `                ⤷ over the REFERENCE's own drawn pixels, mean ${f2(anim.meanMaeReference)} — the union figure ` +
        'compares two builds of the same rig; this one is the one to optimise against, because the union is yours to grow.',
    );
    if (anim.drawnRatio > OVERDRAW_RATIO) {
      const mine = Math.round(anim.frames.reduce((sum, f) => sum + f.candidatePixels, 0) / anim.frames.length);
      const theirs = Math.round(anim.frames.reduce((sum, f) => sum + f.referencePixels, 0) / anim.frames.length);
      lines.push(
        `                ⚠️ overdraw: this shot draws ${mine.toLocaleString('en-US')} px a frame where the reference ` +
          `draws ${theirs.toLocaleString('en-US')} — ${anim.drawnRatio.toFixed(2)}x as much ink, past the ` +
          `${OVERDRAW_RATIO}x no committed candidate reaches. Most of that excess lands in the MAE's own ` +
          'denominator and makes the figure above cheaper without moving a pixel closer, so read the one under it. ' +
          'Something here is drawn that should not be, or is far too big.',
      );
    }
    const blind =
      anim.framesWithoutDrift === 0
        ? ''
        : `   (${anim.framesWithoutDrift} of ${anim.compared} frame(s) attributed no slot at all)`;
    lines.push(
      anim.worstDriftFrame < 0
        ? `     slot drift no slot could be attributed in any of the ${anim.compared} frame(s) — read the MAE instead`
        : `     slot drift worst ${anim.worstDrift.toFixed(1)} px  ${JSON.stringify(anim.worstDriftSlot)} at ` +
          `f${String(anim.worstDriftFrame).padStart(4, '0')}${blind}`,
    );
    lines.push(changeSummary(anim));
    for (const line of chainTable(anim)) lines.push(line);
    lines.push('');

    const listed = framesToList(anim, opts?.allFrames === true);
    const heading =
      listed.length === anim.frames.length
        ? 'every frame'
        : `the ${listed.length} frames worth reading — worst by MAE, plus every frame whose own change disagrees`;
    lines.push(`     ${heading}, in index order`);
    lines.push('       frame      MAE   union px     Δpx  ref Δ   worst slot            drift   how       slots   note');
    for (const frame of listed) {
      const worst = frame.slots.find((s) => s.slot === frame.worstSlot) ?? null;
      const drift = frame.worstDrift === null ? '    —' : `${frame.worstDrift.toFixed(1).padStart(5)}`;
      const how =
        worst === null
          ? '—        '
          : worst.method === 'template'
            ? `tmpl ${(worst.confidence ?? 0).toFixed(2)}`
            : 'component ';
      const note = [changeNote(frame.change), frame.unmatchedComponents > 0 ? `${frame.unmatchedComponents} reference component(s) no slot reaches` : '']
        .filter(Boolean)
        .join('; ');
      const change = frame.change
        ? `${String(frame.change.candidate).padStart(7)}${String(frame.change.reference).padStart(7)}`
        : `${'—'.padStart(7)}${'—'.padStart(7)}`;
      lines.push(
        `       f${String(frame.index).padStart(4, '0')} ${f2(frame.mae).padStart(8)}  ${String(frame.unionPixels).padStart(9)} ${change}   ` +
          `${(frame.worstSlot ?? '—').padEnd(20)} ${drift}   ${how.padEnd(9)} ${String(frame.attributed)}/${String(frame.drawn)}` +
          `${note ? `   ${note}` : ''}`,
      );
    }
    lines.push('');
  }

  for (const line of chainFoot(report)) lines.push(line);

  lines.push('  MAE is the mean absolute RGB difference over the pixels either side covers, so it is');
  lines.push('  read against 255 and not against a threshold: there is no pass mark here any more than');
  lines.push('  there is one in `diff`. The figure under it divides the same difference by the pixels the');
  lines.push('  REFERENCE drew — a denominator you cannot grow, which is what makes it the one to author');
  lines.push('  against; it is not bounded by 255. Read the framing line first: it is upstream of every number');
  lines.push('  below, and a residual much wider than a pixel moves all of them at once.');
  lines.push('  The slots column is how many of the drawn slots could be attributed at all. A drift');
  lines.push('  marked `tmpl` was correlated against the slot’s own pixels because the reference');
  lines.push('  merged it into a neighbour; the number beside it is how much better that match was');
  lines.push('  than its best rival, and a slot that matched nothing at all is left out of the count.');
  lines.push('  `Δpx` and `ref Δ` are how many pixels each side moved since ITS OWN previous frame —');
  lines.push('  not against each other. They are the only columns that can see a held pose that is');
  lines.push('  not held, or a one-frame event that never fired: both are small in every frame and');
  lines.push('  wrong only in the relation between two, which is where the MAE cannot look.');
  return lines;
}

/** One drift, as the table says it: distance, slot, frame. */
function driftPhrase(drift: number, slot: string | null, frame: number): string {
  if (slot === null) return 'no slot attributable';
  return `${drift.toFixed(1)} px ${JSON.stringify(slot)} f${String(frame).padStart(4, '0')}`;
}

/** One set, broken down by chain — see `ChainCheck`. */
function chainTable(anim: AnimationCheck): string[] {
  if (anim.chains.length === 0) return [];
  const out: string[] = [];
  out.push(
    `     chains     ${anim.chains.length} from the candidate's own bone tree — the roster is at the foot of the report`,
  );
  out.push(
    `       ${'chain'.padEnd(20)} ${'slots'.padStart(6)}   ${'worst slot drift'.padEnd(33)} ` +
      `${'mean'.padStart(8)}   ${'MAE in it'.padStart(9)}   ${'share'.padStart(6)}`,
  );
  // Derivation order rather than worst-first, so the same row is in the same place
  // in every set's table and a run can be read down a column.
  for (const chain of anim.chains) {
    const mean = chain.driftSamples === 0 ? '—' : `${chain.meanDrift.toFixed(1)} px`;
    out.push(
      `       ${chain.chain.padEnd(20)} ${`${chain.drewSlots}/${chain.slots}`.padStart(6)}   ` +
        `${driftPhrase(chain.worstDrift, chain.worstDriftSlot, chain.worstDriftFrame).padEnd(33)} ` +
        `${mean.padStart(8)}   ${f2(chain.mae).padStart(9)}   ${`${(chain.maeShare * 100).toFixed(1)}%`.padStart(6)}`,
    );
  }
  if (anim.unattributedError > 0 && anim.chainDenominator > 0) {
    const share = (anim.unattributedError / anim.chainDenominator) * 100;
    out.push(
      `       ${'(unattributed)'.padEnd(20)} ${'—'.padStart(6)}   ${'—'.padEnd(33)} ${'—'.padStart(8)}   ` +
        `${'—'.padStart(9)}   ${`${share.toFixed(1)}%`.padStart(6)}`,
    );
  }
  out.push(
    "                ⤷ share is of this set's own difference over the REFERENCE's drawn pixels, split by nearest ink; " +
      '`MAE in it` is that same error per pixel. The rule, the denominator and what a 0 % row means are under ' +
      '"chains" at the foot of the report.',
  );
  return out;
}

/** One line per chain across every set, plus the roster the names refer to. */
function chainFoot(report: CheckReport): string[] {
  if (report.chains.length === 0) return [];
  const out: string[] = [];
  out.push('  ── chains ──');
  out.push(
    "  Cut from the CANDIDATE's own bone tree at every branch point: a chain runs from a root or a fork down to the",
  );
  out.push(
    '  next fork, a single-bone chain that is itself a fork folds into its parent, and each is named after the first',
  );
  out.push(
    '  bone in it that carries a slot. The reference is still nothing but pixels — this is your figure decomposed,',
  );
  out.push('  not the reference’s, which is what keeps it inside the ladder’s honesty rule.');
  out.push('');
  out.push("  MAE share divides the difference over the REFERENCE's own drawn pixels — the denominator from the MAE");
  out.push('  line above, which nothing you draw can grow — and splits it by giving each of those pixels to the chain');
  out.push('  whose ink is NEAREST it. So the shares are a partition and add to the whole, and no chain can look');
  out.push('  better by drawing more: growing its ink only pulls more of the reference’s pixels, and their error,');
  out.push('  into it. `MAE in it` is the same error per pixel it took, and it is the column that separates a chain');
  out.push('  that is WRONG from one that is merely large — a head and its features cover a lot of a figure and can');
  out.push('  carry a third of the error at a below-average figure per pixel.');
  out.push('');
  out.push('  ⚠️ Two things the split cannot do, both of which show rather than hide. Reference ink further from your');
  out.push('  ink than the part’s own size is left `(unattributed)` instead of blamed on a neighbour, so a part that');
  out.push('  has left its place stops being charged to whatever is next to it. And a chain that draws NOTHING seeds');
  out.push('  nothing and reads 0 % — which is why the slots column is beside the share: 0 % on 0 slots drawn is the');
  out.push('  loudest row here, not the quietest.');
  out.push(`    ${'chain'.padEnd(20)} ${'bones'.padEnd(57)} slots`);
  for (const chain of report.chains) {
    out.push(
      `    ${chain.name.padEnd(20)} ${chain.bones.join(', ').padEnd(57)} ` +
        `${chain.slots.length === 0 ? '(draws nothing)' : chain.slots.join(', ')}`,
    );
  }
  const rows = chainRollup(report);
  if (rows.length === 0) return out;
  out.push('');
  out.push(
    `    ${'chain'.padEnd(20)} ${'worst slot drift across every set'.padEnd(56)} ` +
      `${'mean'.padStart(8)}   ${'MAE in it'.padStart(9)}   ${'share'.padStart(6)}`,
  );
  for (const row of rows) {
    const where = row.set === null ? '' : ` in ${row.set}/f${String(row.frame).padStart(4, '0')}`;
    const worst =
      row.slot === null ? 'no slot attributable in any set' : `${row.drift.toFixed(1)} px ${JSON.stringify(row.slot)}${where}`;
    const mean = row.samples === 0 ? '—' : `${row.mean.toFixed(1)} px`;
    out.push(
      `    ${row.chain.padEnd(20)} ${worst.padEnd(56)} ${mean.padStart(8)}   ` +
        `${(row.pixels === 0 ? 0 : row.error / row.pixels).toFixed(2).padStart(9)}   ` +
        `${`${(row.share * 100).toFixed(1)}%`.padStart(6)}`,
    );
  }
  out.push('');
  return out;
}

interface ChainRollup {
  chain: string;
  drift: number;
  slot: string | null;
  set: string | null;
  frame: number;
  mean: number;
  samples: number;
  error: number;
  pixels: number;
  share: number;
}

/**
 * Each chain's worst reading anywhere in the run, worst share first.
 *
 * Worst-first here and derivation order in the per-set tables, deliberately: this
 * is the line a run’s README quotes, so it is ranked by what to fix, while a table
 * printed once per set is ranked so the sets line up.
 */
function chainRollup(report: CheckReport): ChainRollup[] {
  const rows = new Map<string, ChainRollup>();
  let denominator = 0;
  for (const anim of report.animations) {
    if (anim.compared === 0) continue;
    denominator += anim.chainDenominator;
    for (const chain of anim.chains) {
      const row = rows.get(chain.chain) ?? {
        chain: chain.chain,
        drift: 0,
        slot: null,
        set: null,
        frame: -1,
        mean: 0,
        samples: 0,
        error: 0,
        pixels: 0,
        share: 0,
      };
      if (chain.worstDriftSlot !== null && chain.worstDrift > row.drift) {
        row.drift = chain.worstDrift;
        row.slot = chain.worstDriftSlot;
        row.set = anim.dir;
        row.frame = chain.worstDriftFrame;
      }
      row.mean = row.mean * row.samples + chain.meanDrift * chain.driftSamples;
      row.samples += chain.driftSamples;
      row.mean = row.samples === 0 ? 0 : row.mean / row.samples;
      row.error += chain.error;
      row.pixels += chain.referencePixels;
      rows.set(chain.chain, row);
    }
  }
  const out = [...rows.values()];
  for (const row of out) row.share = denominator === 0 ? 0 : row.error / denominator;
  return out.sort((a, b) => b.share - a.share);
}

/**
 * The frames worth printing: the worst by MAE, plus every change disagreement.
 *
 * The union matters rather than being tidy. The defects `FrameChange` exists to
 * catch are **cheap in MAE by construction** — a plateau sloped through by a
 * fraction of a pixel, a three-pixel reveal that did not fire — so a listing
 * ranked by MAE is exactly the listing that leaves them out. Rung 6's f65–f68 sit
 * near the bottom of that ranking.
 */
function framesToList(anim: AnimationCheck, allFrames: boolean): FrameCheck[] {
  if (allFrames || anim.frames.length <= LIST_EVERY) return anim.frames;
  const chosen = new Set(
    [...anim.frames]
      .sort((a, b) => b.mae - a.mae)
      .slice(0, WORST_FRAMES)
      .map((f) => f.index),
  );
  for (const frame of anim.frames) if (frame.change && frame.change.verdict !== 'agrees') chosen.add(frame.index);
  return anim.frames.filter((f) => chosen.has(f.index));
}

/** The per-frame change measure, as the animation's own summary line. */
function changeSummary(anim: AnimationCheck): string {
  if (anim.changePairs === 0) {
    return (
      '     per-frame no two compared frames are adjacent, so nothing was measured about how much this shot ' +
      'changes from frame to frame'
    );
  }
  if (anim.changeDisagreements === 0) {
    return `     per-frame all ${anim.changePairs} adjacent pair(s) change by as much as the reference's own frames do`;
  }
  const worst = anim.frames.find((f) => f.index === anim.worstChangeFrame);
  const at =
    worst && worst.change
      ? `; worst f${String(worst.index).padStart(4, '0')}, yours moved ${worst.change.candidate} px where the ` +
        `reference moved ${worst.change.reference}`
      : '';
  return (
    `     per-frame ${anim.changeDisagreements} of ${anim.changePairs} adjacent pair(s) change by a different ` +
    `amount than the reference does${at}`
  );
}

/** What one frame's change disagreement says, in the words that name the defect. */
function changeNote(change: FrameChange | null): string {
  if (!change || change.verdict === 'agrees') return '';
  if (change.verdict === 'moves') {
    return change.reference === 0
      ? 'the reference holds still here and yours does not'
      : `yours moves ${(change.candidate / Math.max(1, change.reference)).toFixed(0)}x the reference`;
  }
  return change.candidate === 0
    ? 'the reference moves here and yours holds still'
    : `yours moves ${(change.reference / Math.max(1, change.candidate)).toFixed(0)}x less than the reference`;
}

/**
 * What the fit did, in one word.
 *
 * The declared box is never "unsettled" — it was not being iterated towards, it
 * was measured and kept, and `coincident` says the measurement that kept it.
 */
function convergence(framing: FramingReport): string {
  if (framing.settled) return 'settled';
  if (framing.source === 'declared') return 'coincident';
  return framing.cycled ? 'cycling' : 'unsettled';
}

/** The framing, as the line an author reads before anything else. */
/** The `framed to` line: the box that was rendered into, and how it was chosen. */
function framedToLines(v: Framing, how: FramingHow | null, indent = ''): string[] {
  const said =
    how === 'candidate-pixels'
      ? "fitted to the candidate's own drawn pixels"
      : how === 'frames-viewport'
        ? `${FRAMES_SIDECAR}'s own box — the candidate measured into it`
        : '--viewport';
  return [
    `${indent}  framed to  ${v.pixelWidth}x${v.pixelHeight}px  ${v.scale.toFixed(6)} px/unit  ` +
      `world x[${v.x.toFixed(1)} .. ${(v.x + v.width).toFixed(1)}] y[${v.y.toFixed(1)} .. ${(v.y + v.height).toFixed(1)}]  (${said})`,
  ];
}

function framingLines(framing: FramingReport | null, indent = ''): string[] {
  if (!framing) return [];
  const { fit } = framing;
  const c = fit.candidate;
  const r = fit.reference;
  const percent = (n: number): string => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(2)}%`;
  const box = (b: ContentBox): string =>
    `${boxWidth(b).toFixed(1)}x${boxHeight(b).toFixed(1)}px at (${b.left.toFixed(1)}, ${b.top.toFixed(1)})`;
  const signed = (n: number): string => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
  const out = [
    `${indent}  content    candidate ${box(c)}   reference ${box(r)}   (union over ${fit.frames} frame(s))`,
    `${indent}             ⤷ fit x${fit.scale.toFixed(6)}  offset ${signed(fit.dx)}, ${signed(fit.dy)} px   ` +
      `rms ${fit.rms.toFixed(2)} px over ${fit.frames * 4} edge(s)   ` +
      `union residual ${signed(fit.residualWidth)} x ${signed(fit.residualHeight)} px   ` +
      `aspect ${percent(fit.aspectError)}` +
      (framing.applied
        ? `  (${framing.source}, ${framing.passes} pass(es), ${convergence(framing)})`
        : '  (measured, NOT applied — --viewport pinned)'),
  ];
  const spread = Math.max(Math.abs(fit.residualWidth), Math.abs(fit.residualHeight));
  if (spread > 1) {
    const axis = fit.residualWidth > 0 ? 'wider' : 'narrower';
    out.push(
      `${indent}             ⚠️ after the fit your shot still covers ${Math.abs(fit.residualWidth).toFixed(1)} px ` +
        `${axis} and ${Math.abs(fit.residualHeight).toFixed(1)} px ` +
        `${fit.residualHeight > 0 ? 'taller' : 'shorter'} than the reference's. One uniform scale cannot absorb ` +
        'that: something reaches somewhere nothing in the frames does, or is a different size. Read it before ' +
        'reading a drift.',
    );
  }
  if (fit.rms > 1) {
    out.push(
      `${indent}             ⚠️ the fit leaves ${fit.rms.toFixed(2)} px rms across the frames' edges, so no single ` +
        'scale and offset puts the two shots on each other — they are different shapes, not the same shape ' +
        'misframed.',
    );
  }
  const units = framing.units;
  if (units) {
    out.push(
      `${indent}  in units   candidate ${units.candidate.width.toFixed(1)} x ${units.candidate.height.toFixed(1)}   ` +
        `reference ${units.reference.width.toFixed(1)} x ${units.reference.height.toFixed(1)}   ` +
        `x${units.ratio.toFixed(4)}`,
    );
    out.push(
      `${indent}             ⤷ the same two boxes in world units. The framing absorbs a difference of pure scale on ` +
        'purpose — a rig is authored in its own coordinates — so this is the only place one shows. It compares ' +
        'only if you measured the shot in the frames’ own units.',
    );
  }
  return out;
}
