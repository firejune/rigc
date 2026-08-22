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
 * - **MAE over the union alpha** — the mean absolute RGB difference between the
 *   candidate composited over the frames' background and the reference frame,
 *   averaged over the pixels either side covers. Over the union rather than the
 *   whole frame because most of a frame is background on both sides, and
 *   averaging that in makes every number small and every difference between
 *   numbers smaller.
 * - **Per-slot tracking** — where each of the candidate's own slots landed
 *   (centroid and bbox, in frame pixels) against the connected component of the
 *   reference frame nearest to it. This is the part an author acts on: MAE says
 *   *how wrong*, a slot's drift says *which part, which way, how far*.
 *
 * ⚠️ The matcher is cheap on purpose — nearest centroid, with the ambiguity
 * reported rather than resolved. Two parts that touch label as **one** component
 * (the trap `docs/AUTHORING.md` §8 opens with), and an occluded slot has no
 * component of its own at all. A matcher that guessed in those cases would
 * report drift where the honest answer is "these pixels cannot be attributed",
 * so it says so and the frame's MAE carries the signal instead.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import {
  BACKGROUND,
  frameGeometry,
  framingViewport,
  PROTOCOL_FPS,
  posableFromText,
  renderFrame,
  sampleAnimation,
  sampleSetupPose,
  viewportOfSize,
  FRAMES_SIDECAR,
  FRAMES_SPEC,
  type Footprint,
  type Frame,
  type FramesSidecar,
  type FrameSet,
  type Viewport,
} from './render.ts';
import { readPlate, type Plate, type RGBA } from '../tools/plate.ts';

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

/** How far a channel must move for a pixel to count as "not background". */
const BACKGROUND_TOLERANCE = 8;
/** Components smaller than this are antialiasing crumbs, not parts. */
const MIN_COMPONENT_PIXELS = 4;
/** A second component this close to the nearest makes the match a guess. */
const AMBIGUITY_RATIO = 1.25;

function differsFromBackground(plate: Plate, x: number, y: number, background: RGBA): boolean {
  const [r, g, b] = plate.get(x, y);
  return (
    Math.abs(r - background[0]) > BACKGROUND_TOLERANCE ||
    Math.abs(g - background[1]) > BACKGROUND_TOLERANCE ||
    Math.abs(b - background[2]) > BACKGROUND_TOLERANCE
  );
}

export interface Component {
  pixels: number;
  cx: number;
  cy: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Connected components of "not the background colour", 8-connected.
 *
 * 8-connected rather than 4: a thin diagonal — a bar, a stick, a shadow's edge —
 * breaks into a dotted line under 4-connectivity, and then one part reads as
 * twenty and every match is ambiguous for a reason that is about the labeller.
 */
export function componentsOf(plate: Plate, background: RGBA): Component[] {
  const { width, height } = plate;
  const label = new Int32Array(width * height).fill(-1);
  const out: Component[] = [];
  const stack: number[] = [];
  for (let y0 = 0; y0 < height; y0++) {
    for (let x0 = 0; x0 < width; x0++) {
      const seed = y0 * width + x0;
      if (label[seed] !== -1 || !differsFromBackground(plate, x0, y0, background)) continue;
      const id = out.length;
      label[seed] = id;
      stack.push(seed);
      let pixels = 0;
      let sx = 0;
      let sy = 0;
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;
      while (stack.length > 0) {
        const at = stack.pop() as number;
        const x = at % width;
        const y = (at - x) / width;
        pixels++;
        sx += x + 0.5;
        sy += y + 0.5;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const n = ny * width + nx;
            if (label[n] !== -1 || !differsFromBackground(plate, nx, ny, background)) continue;
            label[n] = id;
            stack.push(n);
          }
        }
      }
      out.push({ pixels, cx: sx / pixels, cy: sy / pixels, minX, minY, maxX: maxX + 1, maxY: maxY + 1 });
    }
  }
  return out.filter((c) => c.pixels >= MIN_COMPONENT_PIXELS).sort((a, b) => b.pixels - a.pixels);
}

export interface SlotTrack {
  slot: string;
  candidate: { cx: number; cy: number; width: number; height: number; pixels: number } | null;
  /** The reference component this slot was matched to, if one could be. */
  reference: { cx: number; cy: number; width: number; height: number; pixels: number } | null;
  /** Centroid distance in frame pixels. */
  drift: number | null;
  widthDrift: number | null;
  heightDrift: number | null;
  /** Set when the match is a guess, saying why. Read this before the drift. */
  ambiguity: string | null;
}

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
  /** Components no slot matched — something in the shot the candidate has not drawn. */
  unmatchedComponents: number;
  worstSlot: string | null;
  worstDrift: number | null;
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

export interface CheckReport {
  candidate: { skeleton: string; atlas: string };
  framesDir: string;
  framesRoot: string;
  /** How the candidate's own world box was chosen. */
  framing: 'candidate-content' | 'viewport-flag';
  /** The box the CANDIDATE was rendered into, at the reference's pixel size. */
  viewport: Framing;
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
   * The default derivation is the right one almost always — see
   * `checkAgainstFrames`. This is the escape hatch for the case where it is not:
   * a candidate that is deliberately missing a part frames itself differently
   * from the reference, and pinning the box lets the rest of the shot still be
   * measured.
   */
  viewport?: { x: number; y: number; width: number; height: number };
  /** Play this candidate animation against the frames, when the names differ. */
  as?: string;
}

// ---------------------------------------------------------------------------

/**
 * Compare a candidate against a set of reference frames.
 *
 * ## 🧭 Why the candidate is framed by its own content
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
 * So the candidate is framed the way the reference was framed: the union of its
 * posed quads over every animation at `FRAMING_FPS`, padded by `PAD`, scaled so
 * the long side is the reference's long side in pixels. That procedure is
 * content-derived and deterministic, so two skeletons that depict the same shot
 * land on the same pixels whatever coordinates they were authored in — which is
 * exactly the equivalence a frame comparison should be blind to.
 *
 * ⚠️ What it is *not* blind to: the framing box is the candidate's own content,
 * so a candidate that is missing a part, or that has an extra one, frames itself
 * differently and every pixel shifts. That shows up as a large MAE across the
 * whole set rather than at one moment, and the pixel dimensions printed beside
 * each other are where to look first. `--viewport` pins the box when the rest of
 * a shot is worth measuring anyway.
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

  const maxSide = Math.max(pixelWidth, pixelHeight);
  let viewport: Viewport;
  if (options.viewport) {
    const v = options.viewport;
    viewport = viewportOfSize(v.x, v.y, v.width, v.height, maxSide / Math.max(v.width, v.height), pixelWidth, pixelHeight);
    notes.push(
      `the candidate's world box was pinned by --viewport ${v.x},${v.y},${v.width},${v.height} rather than derived ` +
        'from its own content — that is a claim about the candidate\'s coordinates, and nothing here checks it',
    );
  } else {
    const own = framingViewport(posable.data, maxSide);
    if (!own) throw new CheckError('the candidate posed no drawable attachment in any animation or in its setup pose');
    viewport = viewportOfSize(own.minX, own.minY, own.maxX - own.minX, own.maxY - own.minY, own.scale, pixelWidth, pixelHeight);
    const off = Math.max(Math.abs(own.width - pixelWidth), Math.abs(own.height - pixelHeight));
    if (off > 0) {
      const big = off > maxSide * 0.02;
      notes.push(
        `the candidate frames itself to ${own.width}x${own.height}px where the reference frames are ` +
          `${pixelWidth}x${pixelHeight}px (${off}px out). ` +
          (big
            ? 'That is too much to be rounding: something is in one shot and not the other, or is a different size, ' +
              'and it shifts every pixel below. Read that before reading a drift.'
            : 'That is within rounding of the art sizes; it costs up to that many pixels of drift at the far edge ' +
              'of the frame and nothing at the near one.'),
      );
    }
  }

  const animations: AnimationCheck[] = [];
  for (const set of sets) {
    animations.push(checkOneSet(located.root, set, posable, viewport, background, options.as));
  }

  return {
    candidate: {
      skeleton: options.labels?.skeleton ?? '(in memory)',
      atlas: options.labels?.atlas ?? '(in memory)',
    },
    framesDir: resolve(options.framesDir),
    framesRoot: located.root,
    framing: options.viewport ? 'viewport-flag' : 'candidate-content',
    viewport: {
      x: viewport.minX,
      y: viewport.minY,
      width: viewport.maxX - viewport.minX,
      height: viewport.maxY - viewport.minY,
      scale: viewport.scale,
      pixelWidth: viewport.width,
      pixelHeight: viewport.height,
    },
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

function checkOneSet(
  root: string,
  set: FrameSet,
  posable: ReturnType<typeof posableFromText>,
  viewport: Viewport,
  background: RGBA,
  as: string | undefined,
): AnimationCheck {
  const notes: string[] = [];
  const wanted = as ?? set.animation;
  const have = posable.data.animations.map((a) => a.name);

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
  } else if (!have.includes(wanted)) {
    return {
      dir: set.dir,
      animation: set.animation,
      candidateAnimation: null,
      fps: set.fps,
      referenceFrames: set.written,
      candidateFrames: 0,
      compared: 0,
      meanMae: 0,
      meanMaeFrame: 0,
      worstMae: 0,
      worstMaeFrame: -1,
      worstDrift: 0,
      worstDriftFrame: -1,
      worstDriftSlot: null,
      frames: [],
      notes: [
        `the candidate has no animation called ${JSON.stringify(wanted)} — it has [${have.join(', ') || 'none'}]. ` +
          'Nothing was compared for this set; name the candidate animation with --as <name> if it is called ' +
          'something else.',
      ],
    };
  } else {
    candidateFrames = sampleAnimation(posable.data, wanted, set.fps);
    candidateAnimation = wanted;
  }

  const byIndex = new Map<number, Frame>();
  for (const frame of candidateFrames) byIndex.set(frame.index, frame);
  if (candidateFrames.length !== set.sampled) {
    notes.push(
      `the candidate samples to ${candidateFrames.length} frame(s) at ${set.fps} fps where the reference sampled ` +
        `${set.sampled} — the two animations do not last the same time, and only the frames both have were compared`,
    );
  }

  const disk = framesOnDisk(root, set.dir);
  const frames: FrameCheck[] = [];
  let maeSum = 0;
  let maeFrameSum = 0;
  let worstMae = 0;
  let worstMaeFrame = -1;
  let worstDrift = 0;
  let worstDriftFrame = -1;
  let worstDriftSlot: string | null = null;

  for (const { index, file } of disk) {
    const candidate = byIndex.get(index);
    if (!candidate) continue;
    const reference = readPlateFrom(root, file);
    if (reference.width !== viewport.width || reference.height !== viewport.height) {
      throw new CheckError(
        `${file} is ${reference.width}x${reference.height} but the viewport says ${viewport.width}x${viewport.height}; ` +
          'the frames and the sidecar disagree about their own size',
      );
    }
    const check = checkOneFrame(index, file, candidate, posable.pages, viewport, background, reference);
    frames.push(check);
    maeSum += check.mae;
    maeFrameSum += check.maeFrame;
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

  if (frames.length === 0 && disk.length > 0) {
    notes.push(`none of the ${disk.length} reference frame(s) has a candidate frame at the same index`);
  }

  return {
    dir: set.dir,
    animation: set.animation,
    candidateAnimation,
    fps: set.fps,
    referenceFrames: disk.length,
    candidateFrames: candidateFrames.length,
    compared: frames.length,
    meanMae: frames.length === 0 ? 0 : maeSum / frames.length,
    meanMaeFrame: frames.length === 0 ? 0 : maeFrameSum / frames.length,
    worstMae,
    worstMaeFrame,
    worstDrift,
    worstDriftFrame,
    worstDriftSlot,
    frames,
    notes,
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
      const inReference = differsFromBackground(reference, x, y, background);
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
  const { tracks, matchedComponents } = matchSlots(footprints, components);

  let worstDrift: number | null = null;
  let worstSlot: string | null = null;
  for (const track of tracks) {
    if (track.drift === null || track.ambiguity !== null) continue;
    if (worstDrift === null || track.drift > worstDrift) {
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
    slots: tracks,
  };
}

/**
 * Match each drawn slot to the nearest reference component by centroid.
 *
 * Nearest-centroid and nothing cleverer, because the cases a cleverer matcher
 * would have to get right are the cases where the honest answer is "cannot be
 * attributed": two touching parts are one component, and an occluded part is
 * inside somebody else's. Both come back as an `ambiguity` string, and a drift
 * printed beside one of those is not evidence.
 */
export function matchSlots(
  footprints: Map<string, Footprint>,
  components: Component[],
): { tracks: SlotTrack[]; matchedComponents: number } {
  const tracks: SlotTrack[] = [];
  const takenBy = new Map<Component, string[]>();

  for (const [slot, foot] of [...footprints].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (foot.pixels === 0) {
      tracks.push({
        slot,
        candidate: null,
        reference: null,
        drift: null,
        widthDrift: null,
        heightDrift: null,
        ambiguity: 'the candidate draws nothing here — the slot is empty or entirely outside the frame',
      });
      continue;
    }
    const candidate = {
      cx: foot.cx,
      cy: foot.cy,
      width: foot.maxX - foot.minX,
      height: foot.maxY - foot.minY,
      pixels: Math.round(foot.pixels),
    };
    if (components.length === 0) {
      tracks.push({
        slot,
        candidate,
        reference: null,
        drift: null,
        widthDrift: null,
        heightDrift: null,
        ambiguity: 'the reference frame is empty — nothing to match against',
      });
      continue;
    }
    const ranked = components
      .map((c) => ({ c, d: Math.hypot(c.cx - foot.cx, c.cy - foot.cy) }))
      .sort((a, b) => a.d - b.d);
    const best = ranked[0];
    const runnerUp = ranked[1];
    let ambiguity: string | null = null;
    if (runnerUp && runnerUp.d <= best.d * AMBIGUITY_RATIO) {
      ambiguity = `two reference components are about equally near (${best.d.toFixed(1)} px and ${runnerUp.d.toFixed(1)} px)`;
    }
    const claimants = takenBy.get(best.c) ?? [];
    claimants.push(slot);
    takenBy.set(best.c, claimants);
    tracks.push({
      slot,
      candidate,
      reference: {
        cx: best.c.cx,
        cy: best.c.cy,
        width: best.c.maxX - best.c.minX,
        height: best.c.maxY - best.c.minY,
        pixels: best.c.pixels,
      },
      drift: best.d,
      widthDrift: candidate.width - (best.c.maxX - best.c.minX),
      heightDrift: candidate.height - (best.c.maxY - best.c.minY),
      ambiguity,
    });
  }

  // A component two slots both claim is one blob the reference merged — the
  // parts are touching, or one is drawn over the other. Neither slot's drift is
  // a measurement of that slot, so both say so.
  for (const [, claimants] of takenBy) {
    if (claimants.length < 2) continue;
    for (const track of tracks) {
      if (!claimants.includes(track.slot)) continue;
      const others = claimants.filter((s) => s !== track.slot);
      const why = `shares one reference component with ${others.map((s) => JSON.stringify(s)).join(', ')} — they touch or overlap in this frame`;
      track.ambiguity = track.ambiguity ? `${track.ambiguity}; ${why}` : why;
    }
  }
  return { tracks, matchedComponents: takenBy.size };
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
  const how = report.framing === 'candidate-content' ? "the candidate's own content box" : '--viewport';
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
    lines.push(
      anim.worstDriftFrame < 0
        ? '     slot drift no slot could be attributed in any frame — read the MAE instead'
        : `     slot drift worst ${anim.worstDrift.toFixed(1)} px  ${JSON.stringify(anim.worstDriftSlot)} at f${String(anim.worstDriftFrame).padStart(4, '0')}`,
    );
    lines.push('');

    const listed =
      opts?.allFrames || anim.frames.length <= LIST_EVERY
        ? anim.frames
        : [...anim.frames].sort((a, b) => b.mae - a.mae).slice(0, WORST_FRAMES).sort((a, b) => a.index - b.index);
    const heading =
      listed.length === anim.frames.length ? 'every frame' : `the ${listed.length} worst frames by MAE, in index order`;
    lines.push(`     ${heading}`);
    lines.push('       frame      MAE   union px   worst slot            drift   note');
    for (const frame of listed) {
      const drift = frame.worstDrift === null ? '    —' : `${frame.worstDrift.toFixed(1).padStart(5)}`;
      const note =
        frame.unmatchedComponents > 0
          ? `${frame.unmatchedComponents} reference component(s) matched no slot`
          : frame.slots.some((s) => s.ambiguity !== null)
            ? 'some slots ambiguous'
            : '';
      lines.push(
        `       f${String(frame.index).padStart(4, '0')} ${f2(frame.mae).padStart(8)}  ${String(frame.unionPixels).padStart(9)}   ` +
          `${(frame.worstSlot ?? '—').padEnd(20)} ${drift}   ${note}`,
      );
    }
    lines.push('');
  }

  lines.push('  MAE is the mean absolute RGB difference over the pixels either side covers, so it is');
  lines.push('  read against 255 and not against a threshold: there is no pass mark here any more than');
  lines.push('  there is one in `diff`. A slot drift beside an ambiguity note is not a measurement of');
  lines.push('  that slot — the reference merged it into another part, and the MAE carries that frame.');
  return lines;
}
