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
  isContent,
  BACKGROUND_TOLERANCE,
  CYCLE_PIXELS,
  type BoxPair,
  type ContentBox,
  type FramingFit,
} from './framing.ts';
import { componentsOf, isAttributable, matchSlots, type SlotTrack } from './slots.ts';
import { readPlate, type Plate, type RGBA } from '../tools/plate.ts';

export { componentsOf, matchSlots, searchRadius, type Component, type MatchMethod, type SlotTrack } from './slots.ts';
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

export interface FrameCheck {
  index: number;
  /** The reference PNG, so a worst-frame line is directly openable. */
  file: string;
  /** Mean absolute RGB difference over the union alpha, 0..255. */
  mae: number;
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
  /** Mean of the per-frame whole-frame MAE — see `FrameCheck.maeFrame`. */
  meanMaeFrame: number;
  worstMae: number;
  worstMaeFrame: number;
  worstDrift: number;
  worstDriftFrame: number;
  worstDriftSlot: string | null;
  /** Frames in which no slot at all could be attributed — the drift's denominator. */
  framesWithoutDrift: number;
  frames: FrameCheck[];
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
  /** How the candidate's own world box was chosen. */
  framing: 'candidate-pixels' | 'frames-viewport' | 'viewport-flag';
  /** The box the CANDIDATE was rendered into, at the reference's pixel size. */
  viewport: Framing;
  /** Where the candidate's drawn pixels ended up against the reference's. */
  framingFit: FramingReport | null;
  /**
   * The box the REFERENCE was rendered into, when the sidecar records one.
   *
   * Informational: the two skeletons do not share a coordinate system, so these
   * numbers are not comparable term by term. The pixel dimensions are — they are
   * the same grid — and a difference between them is the diagnostic.
   */
  referenceViewport: Framing | null;
  background: RGBA;
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

  let viewport: Viewport;
  let framingFit: FramingReport | null = null;
  if (options.viewport) {
    const v = options.viewport;
    viewport = viewportOfSize(v.x, v.y, v.width, v.height, maxSide / Math.max(v.width, v.height), pixelWidth, pixelHeight);
    notes.push(
      `the candidate's world box was pinned by --viewport ${v.x},${v.y},${v.width},${v.height} rather than derived ` +
        "from its own pixels — that is a claim about the candidate's coordinates, and nothing here checks it. The " +
        'framing line below is still measured, so it says what the pin cost.',
    );
    const boxes = pairUpBoxes(prepared, posable.pages, viewport, background, level, referenceBoxes);
    if (boxes.length > 0) {
      const fit = fitFraming(boxes);
      framingFit = {
        fit,
        passes: 1,
        settled: false,
        source: 'pinned',
        cycled: false,
        agrees: fitDistance(fit) <= COINCIDENT_PIXELS,
        applied: false,
        units: extentsOf(fit, viewport.scale, referenceViewport),
      };
    }
  } else {
    if (referenceBoxes.every((b) => b === null)) {
      throw new CheckError('no reference frame could be compared, so there is nothing to frame against');
    }
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
    viewport = framed.viewport;
    framingFit = { ...framed.report, units: extentsOf(framed.report.fit, viewport.scale, referenceViewport) };
    notes.push(...framingNotes(framed.report));
  }

  const animations: AnimationCheck[] = [];
  for (const p of prepared) {
    animations.push(checkOneSet(located.root, p, posable, viewport, background));
  }

  return {
    candidate: {
      skeleton: options.labels?.skeleton ?? '(in memory)',
      atlas: options.labels?.atlas ?? '(in memory)',
    },
    framesDir: resolve(options.framesDir),
    framesRoot: located.root,
    framing: options.viewport
      ? 'viewport-flag'
      : framingFit?.source === 'declared'
        ? 'frames-viewport'
        : 'candidate-pixels',
    viewport: {
      x: viewport.minX,
      y: viewport.minY,
      width: viewport.maxX - viewport.minX,
      height: viewport.maxY - viewport.minY,
      scale: viewport.scale,
      pixelWidth: viewport.width,
      pixelHeight: viewport.height,
    },
    framingFit,
    referenceViewport,
    background,
    animations,
    notes,
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
): { viewport: Viewport; report: Omit<FramingReport, 'units'> } {
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
  if (declared) return declared;

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
  const maxSide = Math.max(pixelWidth, pixelHeight);
  const seed = viewportOfSize(
    world.minX,
    world.minY,
    world.maxX - world.minX,
    world.maxY - world.minY,
    maxSide / Math.max(world.maxX - world.minX, world.maxY - world.minY),
    pixelWidth,
    pixelHeight,
  );
  const chain = runFramingChain(
    seed,
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
  viewport: Viewport,
  background: RGBA,
): AnimationCheck {
  const { set } = prepared;
  const blank: AnimationCheck = {
    dir: set.dir,
    animation: set.animation,
    candidateAnimation: prepared.candidateAnimation,
    fps: set.fps,
    referenceFrames: prepared.referenceFrames,
    candidateFrames: prepared.candidateFrames,
    compared: 0,
    meanMae: 0,
    meanMaeFrame: 0,
    worstMae: 0,
    worstMaeFrame: -1,
    worstDrift: 0,
    worstDriftFrame: -1,
    worstDriftSlot: null,
    framesWithoutDrift: 0,
    frames: [],
    notes: prepared.missing ? [prepared.missing] : prepared.notes,
  };
  if (prepared.missing !== null || prepared.pairs.length === 0) return blank;

  const frames: FrameCheck[] = [];
  let maeSum = 0;
  let maeFrameSum = 0;
  let worstMae = 0;
  let worstMaeFrame = -1;
  let worstDrift = 0;
  let worstDriftFrame = -1;
  let worstDriftSlot: string | null = null;
  let framesWithoutDrift = 0;

  for (const { index, file, frame } of prepared.pairs) {
    const reference = readPlateFrom(root, file);
    const check = checkOneFrame(index, file, frame, posable.pages, viewport, background, reference);
    frames.push(check);
    maeSum += check.mae;
    maeFrameSum += check.maeFrame;
    if (check.attributed === 0) framesWithoutDrift++;
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
    meanMae: maeSum / frames.length,
    meanMaeFrame: maeFrameSum / frames.length,
    worstMae,
    worstMaeFrame,
    worstDrift,
    worstDriftFrame,
    worstDriftSlot,
    framesWithoutDrift,
    frames,
    notes: prepared.notes,
  };
}

function checkOneFrame(
  index: number,
  file: string,
  frame: Frame,
  pages: Map<string, Plate>,
  viewport: Viewport,
  background: RGBA,
  reference: Plate,
): FrameCheck {
  const rendered = renderFrame(frame, pages, viewport, background);
  const { coverage, footprints } = frameGeometry(frame, pages, viewport);

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
  };
}

// ---------------------------------------------------------------------------
// the report
// ---------------------------------------------------------------------------

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
  const v = report.viewport;
  const how =
    report.framing === 'candidate-pixels'
      ? "fitted to the candidate's own drawn pixels"
      : report.framing === 'frames-viewport'
        ? `${FRAMES_SIDECAR}'s own box — the candidate measured into it`
        : '--viewport';
  lines.push(
    `  framed to  ${v.pixelWidth}x${v.pixelHeight}px  ${v.scale.toFixed(6)} px/unit  ` +
      `world x[${v.x.toFixed(1)} .. ${(v.x + v.width).toFixed(1)}] y[${v.y.toFixed(1)} .. ${(v.y + v.height).toFixed(1)}]  (${how})`,
  );
  const r = report.referenceViewport;
  if (r) {
    lines.push(
      `  reference  ${r.pixelWidth}x${r.pixelHeight}px  ${r.scale.toFixed(6)} px/unit  ` +
        `world x[${r.x.toFixed(1)} .. ${(r.x + r.width).toFixed(1)}] y[${r.y.toFixed(1)} .. ${(r.y + r.height).toFixed(1)}]  (${FRAMES_SIDECAR})`,
    );
    lines.push('             ⤷ the two world boxes are different coordinate systems and do not compare; the pixel grid does.');
  }
  for (const line of framingLines(report)) lines.push(line);
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
    for (const note of anim.notes) lines.push(`     ⚠️ ${note}`);
    if (anim.compared === 0) {
      lines.push('');
      continue;
    }
    lines.push(
      `     MAE        mean ${f2(anim.meanMae)}  worst ${f2(anim.worstMae)} at f${String(anim.worstMaeFrame).padStart(4, '0')}` +
        `   (0..255 over the union alpha; over the whole frame, mean ${f2(anim.meanMaeFrame)})`,
    );
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
    lines.push('');

    const listed =
      opts?.allFrames || anim.frames.length <= LIST_EVERY
        ? anim.frames
        : [...anim.frames].sort((a, b) => b.mae - a.mae).slice(0, WORST_FRAMES).sort((a, b) => a.index - b.index);
    const heading =
      listed.length === anim.frames.length ? 'every frame' : `the ${listed.length} worst frames by MAE, in index order`;
    lines.push(`     ${heading}`);
    lines.push('       frame      MAE   union px   worst slot            drift   how       slots   note');
    for (const frame of listed) {
      const worst = frame.slots.find((s) => s.slot === frame.worstSlot) ?? null;
      const drift = frame.worstDrift === null ? '    —' : `${frame.worstDrift.toFixed(1).padStart(5)}`;
      const how =
        worst === null
          ? '—        '
          : worst.method === 'template'
            ? `tmpl ${(worst.confidence ?? 0).toFixed(2)}`
            : 'component ';
      const unmatched =
        frame.unmatchedComponents > 0 ? `${frame.unmatchedComponents} reference component(s) no slot reaches` : '';
      lines.push(
        `       f${String(frame.index).padStart(4, '0')} ${f2(frame.mae).padStart(8)}  ${String(frame.unionPixels).padStart(9)}   ` +
          `${(frame.worstSlot ?? '—').padEnd(20)} ${drift}   ${how.padEnd(9)} ${String(frame.attributed)}/${String(frame.drawn)}` +
          `${unmatched ? `   ${unmatched}` : ''}`,
      );
    }
    lines.push('');
  }

  lines.push('  MAE is the mean absolute RGB difference over the pixels either side covers, so it is');
  lines.push('  read against 255 and not against a threshold: there is no pass mark here any more than');
  lines.push('  there is one in `diff`. Read the framing line first: it is upstream of every number');
  lines.push('  below, and a residual much wider than a pixel moves all of them at once.');
  lines.push('  The slots column is how many of the drawn slots could be attributed at all. A drift');
  lines.push('  marked `tmpl` was correlated against the slot’s own pixels because the reference');
  lines.push('  merged it into a neighbour; the number beside it is how much better that match was');
  lines.push('  than its best rival, and a slot that matched nothing at all is left out of the count.');
  return lines;
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
function framingLines(report: CheckReport): string[] {
  const framing = report.framingFit;
  if (!framing) return [];
  const { fit } = framing;
  const c = fit.candidate;
  const r = fit.reference;
  const percent = (n: number): string => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(2)}%`;
  const box = (b: ContentBox): string =>
    `${boxWidth(b).toFixed(1)}x${boxHeight(b).toFixed(1)}px at (${b.left.toFixed(1)}, ${b.top.toFixed(1)})`;
  const signed = (n: number): string => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
  const out = [
    `  content    candidate ${box(c)}   reference ${box(r)}   (union over ${fit.frames} frame(s))`,
    `             ⤷ fit x${fit.scale.toFixed(6)}  offset ${signed(fit.dx)}, ${signed(fit.dy)} px   ` +
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
      `             ⚠️ after the fit your shot still covers ${Math.abs(fit.residualWidth).toFixed(1)} px ` +
        `${axis} and ${Math.abs(fit.residualHeight).toFixed(1)} px ` +
        `${fit.residualHeight > 0 ? 'taller' : 'shorter'} than the reference's. One uniform scale cannot absorb ` +
        'that: something reaches somewhere nothing in the frames does, or is a different size. Read it before ' +
        'reading a drift.',
    );
  }
  if (fit.rms > 1) {
    out.push(
      `             ⚠️ the fit leaves ${fit.rms.toFixed(2)} px rms across the frames' edges, so no single ` +
        'scale and offset puts the two shots on each other — they are different shapes, not the same shape ' +
        'misframed.',
    );
  }
  const units = framing.units;
  if (units) {
    out.push(
      `  in units   candidate ${units.candidate.width.toFixed(1)} x ${units.candidate.height.toFixed(1)}   ` +
        `reference ${units.reference.width.toFixed(1)} x ${units.reference.height.toFixed(1)}   ` +
        `x${units.ratio.toFixed(4)}`,
    );
    out.push(
      '             ⤷ the same two boxes in world units. The framing absorbs a difference of pure scale on ' +
        'purpose — a rig is authored in its own coordinates — so this is the only place one shows. It compares ' +
        'only if you measured the shot in the frames’ own units.',
    );
  }
  return out;
}
