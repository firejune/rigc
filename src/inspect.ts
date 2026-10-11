/**
 * `rigc inspect` — a picture of a compiled build made for an agent to read,
 * and the legend that turns a pixel of it back into a number (issue #1357).
 *
 * ⭐ **The picture is a question about geometry, and the legend is its answer
 * key.** `render` draws what the rig looks like; this draws what the rig IS at
 * one moment — where each bone starts and ends, which way its axes point, where
 * the world's units fall, and the line a rig declares some bones to lie along —
 * over the same art on the same pixel grid. Without the legend the picture is
 * for a person: an agent that reads "the elbow is at pixel 412, 180" needs the
 * transform to say where that is in the rig spec, and every drawn bone's pixel
 * origin and tip to say which mark is which. So the legend states the transform
 * exactly, in both directions, and every mark the picture carries.
 *
 * 🔒 **It poses through what `render` poses the candidate with, and says
 * which.** The caller hands over the candidate `loadCandidate` read and runs
 * this through `throughPoser`, the seam `render` runs — so a rigc build is posed
 * by rigc's own core and an export by spine-core, a fallback is named, and the
 * art of a picture with nothing drawn over it is `render`'s frame at the same
 * time and the same `--max`, pixel for pixel (`IN09`).
 *
 * ⭐ **A time is a frame of `render`'s grid.** The poser steps one continuous
 * trajectory at `1/fps` (physics included), so the pose "at t" is the one
 * `render --fps <fps>` wrote as frame `t·fps`, and a time off that grid is
 * refused naming the two grid times either side rather than posed some other
 * way — a second recipe for one moment would be a second opinion about the pose.
 *
 * Links nothing from the runtime: the poser is handed in.
 */
import { drawText, GLYPH_H, textWidth } from '../tools/font5x7.ts';
import { Plate, type RGBA } from '../tools/plate.ts';
import { lineGap, worldAxisDegrees } from './assertions/bodies/a51.ts';
import {
  BACKGROUND,
  type BoneSnapshot,
  type Candidate,
  type Frame,
  framingViewport,
  type Poser,
  type PoseOptions,
  renderFrame,
  sampleAnimation,
  sampleSetupPose,
  SHEET_COLUMNS,
  SHEET_GAP,
  SHEET_LABEL,
  SHEET_RULE,
  type SkinRoster,
  throughPoser,
  type Viewport,
  viewportFor,
} from './render_shared.ts';

/** The legend's format tag. */
export const INSPECT_SPEC = 'rigc-inspect/1';

/** Every word `--show` takes, in the order the picture draws them (bottom first). */
export const SHOW_WORDS = ['art', 'grid', 'declared', 'bones', 'axes', 'names'] as const;
export type ShowWord = (typeof SHOW_WORDS)[number];

/** What `--show` draws when it is not given. */
export const DEFAULT_SHOW: readonly ShowWord[] = ['art', 'bones'];

/** The frame rate a time is read on when `--fps` is not given — `render`'s own default, so the two grids are one. */
export const INSPECT_DEFAULT_FPS = 12;

/**
 * How far from a whole frame `t·fps` may be and still name that frame, in
 * frames. Not a tolerance on the pose: it absorbs the binary spelling of a
 * decimal time (`0.1 · 12` is `1.2000000000000002`), and the frame posed is the
 * whole one, filed under `index / fps` in the legend.
 */
export const ON_GRID_FRAMES = 1e-6;

/** A zoom with no pad stated is padded by this share of the zoomed box's longer side, on every side. */
export const DEFAULT_ZOOM_PAD_SHARE = 0.25;

/** The grid's step is the smallest 1, 2 or 5 × 10ⁿ world units at least this many pixels apart. */
export const GRID_MIN_PIXELS = 32;

/** An axis is drawn this many pixels long for a bone whose world scale on it is 1 — longer or shorter as it scales. */
export const AXIS_PIXELS = 24;

/** `--dim`: every art pixel is moved toward white, keeping this share of its distance from white. */
export const DIM_KEEP = 0.4;

/** What each colour the picture draws means — the legend repeats this table. */
export const INSPECT_COLOURS = {
  bone: { rgba: [0, 110, 255, 255], meaning: "a bone's line, from its origin to its tip (origin + length along its world x axis)" },
  origin: { rgba: [235, 0, 190, 255], meaning: "a bone's origin: a filled 3x3 square centred on the origin's pixel" },
  tip: { rgba: [255, 140, 0, 255], meaning: "a bone's tip: a hollow 3x3 square centred on the tip's pixel" },
  zero: { rgba: [255, 210, 0, 255], meaning: 'a bone of length 0: a hollow 5x5 square around its origin, which is also its tip' },
  name: { rgba: [25, 25, 25, 255], meaning: "a bone's name, starting 4 px right of and 3 px below its origin's pixel; bones sharing that pixel list their names one per line under it, in declaration order" },
  axisX: { rgba: [215, 30, 30, 255], meaning: `a bone's world x axis from its origin, ${AXIS_PIXELS} px long at a world scale of 1` },
  axisY: { rgba: [20, 160, 40, 255], meaning: `a bone's world y axis from its origin, ${AXIS_PIXELS} px long at a world scale of 1` },
  grid: { rgba: [150, 150, 150, 255], meaning: 'a grid line at a whole multiple of the step, in world units, with its value at the edge' },
  gridZero: { rgba: [70, 70, 70, 255], meaning: 'the grid line at world x = 0 or y = 0' },
  declared: { rgba: [0, 190, 190, 255], meaning: 'an invariants.axes line, through its two bones\' origins, across the whole tile' },
  held: { rgba: [0, 95, 95, 255], meaning: 'the line of a bone an invariants.axes entry holds to its line, in place of the bone colour' },
  label: { rgba: [...SHEET_LABEL], meaning: "a sheet tile's time and frame, at its bottom-left corner" },
  rule: { rgba: [...SHEET_RULE], meaning: 'the gap between two tiles of a sheet' },
} as const satisfies Record<string, { rgba: readonly number[]; meaning: string }>;

type ColourName = keyof typeof INSPECT_COLOURS;
const colour = (name: ColourName): RGBA => [...INSPECT_COLOURS[name].rgba] as RGBA;

/** A refusal of the invocation: a name the build does not have, a time off the grid, a box that cannot be drawn. Exit 2, nothing written. */
export class InspectError extends Error {}

/** What to frame a picture to. */
export type InspectFrame =
  | { kind: 'shot' }
  | { kind: 'zoom'; target: string; pad: number | null }
  | { kind: 'viewport'; x: number; y: number; width: number; height: number };

/** One `rigc inspect` invocation, its flags read but not yet checked against the build. */
export interface InspectRequest {
  show: readonly ShowWord[];
  dim: boolean;
  /** `null` is the setup pose. */
  animation: string | null;
  /** Seconds, in the order given; empty with no animation. */
  times: readonly number[];
  fps: number;
  skin: string | undefined;
  frame: InspectFrame;
  maxSide: number;
}

/** What the picture is made from besides the poser: the build's own texts. */
export interface InspectTexts {
  /** `skeleton.json` — read for each bone's `length`, which no pose carries. */
  skeletonText: string;
  /** The `skeleton.model.json` that is this skeleton's, or `undefined` — what `declared` reads `rig.axes` from. */
  modelText: string | undefined;
}

/**
 * A planted defect, for the suite's mutants only (`IN` controls in
 * `selftest.ts`). Each one is a way the picture or the legend can be wrong that
 * a control has to catch by name; production passes none.
 */
export interface InspectPlant {
  /** Draw every bone mark this many pixels off where the legend says it is. */
  overlayShift?: [number, number];
  /** State every bone mark this many pixels off where the picture draws it. */
  legendShift?: [number, number];
  /** Read the grid step as pixels rather than world units. */
  gridInPixels?: boolean;
  /** Map world y to image y without turning it over. */
  unflipped?: boolean;
  /** Zoom to this bone, whatever the request named. */
  zoomBone?: string;
}

/** A point in both spaces. */
export interface LegendPoint {
  /** Spine world, y up, world units. */
  world: [number, number];
  /** The picture's pixels, y down, from its top-left corner; pixel (i, j) covers [i, i+1) x [j, j+1). */
  pixel: [number, number];
}

/** One bone in one tile. */
export interface LegendBone {
  name: string;
  parent: string | null;
  /** The skeleton's `length` for it, world units (0 where the file states none). */
  length: number;
  /** `length` is 0: origin and tip are one point, marked by the `zero` square. */
  zeroLength: boolean;
  /** `null` when the bone is drawn; otherwise why it is not (its world matrix is 0). */
  undrawn: string | null;
  origin: LegendPoint;
  tip: LegendPoint;
  /** The ends of its drawn world x and y axes — present when `axes` is shown and the bone is drawn. */
  axes?: { x: LegendPoint; y: LegendPoint };
}

/** One `invariants.axes` entry in one tile. */
export interface LegendDeclared {
  name: string;
  through: [string, string];
  tolerance: number;
  /** The line's direction in world degrees (CCW from +x), or `null` when the two origins coincide (`why`). */
  degrees: number | null;
  why: string | null;
  from: LegendPoint | null;
  to: LegendPoint | null;
  /** Each held bone's world x axis, and how far off the line it lies, as A51 measures it, at this tile's pose. */
  bones: Array<{ name: string; degrees: number | null; off: number | null }>;
}

export interface LegendTile {
  /** `null` for the setup pose. */
  animation: string | null;
  /** The frame of `render --fps <fps>` this pose is, and its time `frame / fps`. */
  frame: number;
  time: number;
  /** Where the tile sits in the picture: its top-left pixel and its size. */
  box: { x: number; y: number; width: number; height: number };
  /** The tile's transform. `px = x0 + (x - minX)·scale`, `py = y0 + (maxY - y)·scale`; back: `x = minX + (px - x0)/scale`, `y = maxY - (py - y0)/scale`. */
  transform: { minX: number; maxY: number; scale: number; x0: number; y0: number };
  bones: LegendBone[];
  declared?: LegendDeclared[];
  grid?: { step: number; x: number[]; y: number[] };
}

export interface InspectLegend {
  spec: typeof INSPECT_SPEC;
  poser: 'core' | 'spine';
  show: ShowWord[];
  dim: boolean;
  skin?: string;
  animation: string | null;
  fps: number;
  framing:
    | { kind: 'shot'; note: string }
    | { kind: 'zoom'; bone?: string; slot?: string; pad: number; padFrom: 'stated' | 'default' }
    | { kind: 'viewport' };
  coordinates: { world: string; image: string; toPixel: string; toWorld: string };
  /** The world box every tile is a picture of, and its pixels — one for the whole picture. */
  viewport: { minX: number; minY: number; maxX: number; maxY: number; scale: number; width: number; height: number };
  size: { width: number; height: number };
  colours: Record<ColourName, { rgba: number[]; meaning: string }>;
  tiles: LegendTile[];
}

/** The picture and its legend, and which poser posed it and why. */
export interface InspectResult {
  plate: Plate;
  legend: InspectLegend;
  poserNote: string;
  /** Lines worth printing beside the picture: what a view drew nothing for, and why. */
  notes: string[];
}

// ---------------------------------------------------------------------------
// reading the request against the build
// ---------------------------------------------------------------------------

/** `--show`'s words, refused by name — a word this command does not draw lists every one it does. */
export function readShowWords(raw: string | undefined): ShowWord[] {
  if (raw === undefined) return [...DEFAULT_SHOW];
  const words = raw.split(',').map((w) => w.trim()).filter((w) => w !== '');
  if (words.length === 0) throw new InspectError(`--show ${JSON.stringify(raw)} names no view; it takes [${SHOW_WORDS.join(', ')}]`);
  const out: ShowWord[] = [];
  for (const word of words) {
    const known = SHOW_WORDS.find((w) => w === word);
    if (known === undefined) throw new InspectError(`--show ${JSON.stringify(word)} is not a view inspect draws; it draws [${SHOW_WORDS.join(', ')}]`);
    if (out.includes(known)) throw new InspectError(`--show names ${JSON.stringify(word)} twice`);
    out.push(known);
  }
  // In the drawing order, so two spellings of one set are one picture and one legend.
  return SHOW_WORDS.filter((w) => out.includes(w));
}

/** `--at`'s seconds. Their grid frames are checked against the animation later, where its length is known. */
export function readTimes(raw: string | undefined): number[] {
  if (raw === undefined) return [];
  const parts = raw.split(',').map((s) => s.trim());
  const times = parts.map(Number);
  const bad = parts.find((s, i) => s === '' || !Number.isFinite(times[i]) || times[i] < 0);
  if (bad !== undefined) throw new InspectError(`--at ${JSON.stringify(raw)}: ${JSON.stringify(bad)} is not a time in seconds of at least 0`);
  return times;
}

/** `--zoom <name>[:<pad>]`: the name, and the pad in world units when one is stated. */
export function readZoom(raw: string): { target: string; pad: number | null } {
  const colon = raw.lastIndexOf(':');
  if (colon > 0) {
    const tail = raw.slice(colon + 1);
    const pad = Number(tail);
    if (tail.trim() !== '' && Number.isFinite(pad)) {
      if (pad < 0) throw new InspectError(`--zoom ${JSON.stringify(raw)}: the pad ${tail} is below 0; it is world units on every side`);
      return { target: raw.slice(0, colon), pad };
    }
  }
  if (raw === '') throw new InspectError('--zoom needs a bone or slot name: --zoom <name>[:<pad>]');
  return { target: raw, pad: null };
}

/** The grid frame `t` names at `fps`, or the refusal naming the two either side. */
function gridFrame(t: number, fps: number, duration: number, animation: string): number {
  const exact = t * fps;
  const frame = Math.round(exact);
  const last = Math.round(duration * fps);
  if (Math.abs(exact - frame) > ON_GRID_FRAMES) {
    const below = Math.floor(exact);
    throw new InspectError(
      `--at ${t} is not on the ${fps} fps frame grid render draws "${animation}" on: the frames either side are ` +
        `${below} (${(below / fps).toFixed(4)}s) and ${below + 1} (${((below + 1) / fps).toFixed(4)}s). Name one of them, or pass --fps for another grid`,
    );
  }
  if (frame > last) {
    throw new InspectError(
      `--at ${t} is past the end of "${animation}": it lasts ${duration}s, frame ${last} (${(last / fps).toFixed(4)}s) at ${fps} fps`,
    );
  }
  return frame;
}

/** Each bone's `length` off the skeleton file — Spine's default is 0, which is what a file that states none means. */
export function boneLengths(skeletonText: string): Map<string, number> {
  const parsed = JSON.parse(skeletonText) as { bones?: Array<{ name?: unknown; length?: unknown }> };
  const out = new Map<string, number>();
  for (const bone of parsed.bones ?? []) {
    if (typeof bone.name !== 'string') continue;
    out.set(bone.name, typeof bone.length === 'number' ? bone.length : 0);
  }
  return out;
}

/** One `invariants.axes` entry, as the model document's `rig.axes` spells it. */
export interface DeclaredAxis {
  name: string;
  through: [string, string];
  bones: string[];
  tolerance: number;
}

/** `rig.axes` off the build's model document, or the refusal saying why `declared` has nothing to read. */
export function declaredAxes(modelText: string | undefined): DeclaredAxis[] {
  if (modelText === undefined) {
    throw new InspectError(
      '--show declared reads invariants.axes from the skeleton.model.json `build` writes beside a skeleton, and there is none ' +
        'here whose spine.sha256 is this skeleton\'s — a Spine export states no rig invariants',
    );
  }
  const doc = JSON.parse(modelText) as { rig?: { axes?: unknown } };
  const axes = doc.rig?.axes;
  if (!Array.isArray(axes)) {
    throw new InspectError(
      '--show declared reads rig.axes from the skeleton.model.json beside this skeleton, and that document states no rig.axes — ' +
        'it was written by a rigc older than invariants.axes; build it again',
    );
  }
  return axes as DeclaredAxis[];
}

// ---------------------------------------------------------------------------
// drawing
// ---------------------------------------------------------------------------

/** One pixel, set outright; off the tile is nothing. */
function put(plate: Plate, x: number, y: number, rgba: RGBA): void {
  if (x < 0 || y < 0 || x >= plate.width || y >= plate.height) return;
  const i = (y * plate.width + x) * 4;
  plate.data[i] = rgba[0];
  plate.data[i + 1] = rgba[1];
  plate.data[i + 2] = rgba[2];
  plate.data[i + 3] = rgba[3];
}

/** A one-pixel line between two continuous pixel positions: every pixel whose square a dense walk along it enters. */
function line(plate: Plate, x0: number, y0: number, x1: number, y1: number, rgba: RGBA): void {
  const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2) + 1;
  for (let s = 0; s <= steps; s++) {
    const u = s / steps;
    put(plate, Math.floor(x0 + (x1 - x0) * u), Math.floor(y0 + (y1 - y0) * u), rgba);
  }
}

/** A square of side `2r + 1` centred on pixel (cx, cy): filled, or its border only. */
function square(plate: Plate, cx: number, cy: number, r: number, hollow: boolean, rgba: RGBA): void {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (hollow && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
      put(plate, cx + dx, cy + dy, rgba);
    }
  }
}

function text(plate: Plate, value: string, x: number, y: number, rgba: RGBA): void {
  drawText(value, x, y, 1, (px, py) => put(plate, px, py, rgba));
}

/** The grid step: the smallest 1, 2 or 5 × 10ⁿ world units whose lines land at least `GRID_MIN_PIXELS` apart. */
export function gridStep(scale: number): number {
  const least = GRID_MIN_PIXELS / scale;
  let power = 10 ** Math.floor(Math.log10(least));
  for (;;) {
    for (const m of [1, 2, 5]) if (m * power >= least) return m * power;
    power *= 10;
  }
}

/** A grid value as its label prints it: as many decimals as the step has, no more. */
function gridLabel(value: number, step: number): string {
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const shown = value.toFixed(decimals);
  return /^-0(\.0*)?$/.test(shown) ? shown.slice(1) : shown;
}

/** Whole multiples of `step` from `lo` to `hi`, inclusive. */
function multiples(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  for (let k = Math.ceil(lo / step); k * step <= hi; k++) out.push(k * step === 0 ? 0 : k * step);
  return out;
}

// ---------------------------------------------------------------------------
// the view
// ---------------------------------------------------------------------------

/** The poses one picture is of: the frames, in the order the request named their times. */
function posesOf(poser: Poser, request: InspectRequest, needAttachments: boolean): Array<{ frame: Frame; index: number }> {
  const opts: PoseOptions = { bones: true, ...(needAttachments ? { geometry: true } : {}), ...(request.skin === undefined ? {} : { skin: request.skin }) };
  if (request.animation === null) return [{ frame: sampleSetupPose(poser, opts)[0], index: 0 }];
  const animation = poser.animations.find((a) => a.name === request.animation);
  if (animation === undefined) {
    throw new InspectError(`no animation ${JSON.stringify(request.animation)} in this skeleton; it has [${poser.animations.map((a) => a.name).join(', ') || 'none'}]`);
  }
  const indices = request.times.map((t) => gridFrame(t, request.fps, animation.duration, animation.name));
  const seen = new Set<number>();
  for (const [i, index] of indices.entries()) {
    if (seen.has(index)) throw new InspectError(`--at names frame ${index} (${(index / request.fps).toFixed(4)}s) twice — at ${request.times[i]}`);
    seen.add(index);
  }
  const frames = sampleAnimation(poser, animation.name, request.fps, opts);
  return indices.map((index) => ({ frame: frames[index], index }));
}

/** The world box of what `--zoom` names, over every pose of the picture. */
function zoomBox(
  poser: Poser,
  poses: ReadonlyArray<{ frame: Frame }>,
  target: string,
  lengths: Map<string, number>,
): { box: [number, number, number, number]; bone?: string; slot?: string } {
  const isBone = poser.bones.some((b) => b.name === target);
  const isSlot = poser.slots.some((s) => s.name === target);
  if (isBone && isSlot) {
    // A rig names a slot after its bone often; which box is meant is the caller's to say, not a guess.
    throw new InspectError(
      `--zoom ${JSON.stringify(target)} names both a bone and a slot; say which with --zoom bone:${target} or --zoom slot:${target}`,
    );
  }
  let kind: 'bone' | 'slot' | null = isBone ? 'bone' : isSlot ? 'slot' : null;
  let name = target;
  for (const prefix of ['bone', 'slot'] as const) {
    if (kind === null && target.startsWith(`${prefix}:`)) {
      name = target.slice(prefix.length + 1);
      const has = prefix === 'bone' ? poser.bones.some((b) => b.name === name) : poser.slots.some((s) => s.name === name);
      if (has) kind = prefix;
    }
  }
  if (kind === null) {
    throw new InspectError(
      `--zoom ${JSON.stringify(target)}: no bone or slot of that name. Bones: [${poser.bones.map((b) => b.name).join(', ')}]; ` +
        `slots: [${poser.slots.map((s) => s.name).join(', ')}]`,
    );
  }
  const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  const take = (x: number, y: number): void => {
    box[0] = Math.min(box[0], x);
    box[1] = Math.min(box[1], y);
    box[2] = Math.max(box[2], x);
    box[3] = Math.max(box[3], y);
  };
  for (const { frame } of poses) {
    if (kind === 'bone') {
      const b = frame.bones?.find((s) => s.name === name);
      if (b === undefined) continue;
      if (b.a === 0 && b.b === 0 && b.c === 0 && b.d === 0) continue;
      const length = lengths.get(name) ?? 0;
      take(b.worldX, b.worldY);
      take(b.worldX + length * b.a, b.worldY + length * b.c);
    } else {
      for (const shown of frame.attachments ?? []) {
        if (shown.slot !== name) continue;
        for (let i = 0; i + 1 < shown.vertices.length; i += 2) take(shown.vertices[i], shown.vertices[i + 1]);
      }
    }
  }
  if (!box.every(Number.isFinite)) {
    throw new InspectError(
      kind === 'bone'
        ? `--zoom ${JSON.stringify(target)}: bone "${name}" is not posed at any time of this picture (its world matrix is 0 — unposed by the skin, or a scale of 0)`
        : `--zoom ${JSON.stringify(target)}: slot "${name}" shows no region or mesh at any time of this picture`,
    );
  }
  return kind === 'bone' ? { box, bone: name } : { box, slot: name };
}

/**
 * The picture and its legend, posed through `candidate`'s chosen poser — the
 * one `render` would pose it with (`throughPoser`), named in the result.
 */
export function inspectCandidate(candidate: Candidate, texts: InspectTexts, request: InspectRequest, plant: InspectPlant = {}): InspectResult {
  const { facts, pages } = candidate;
  if (request.skin !== undefined && !facts.skins.includes(request.skin)) {
    throw new InspectError(`no skin ${JSON.stringify(request.skin)} in this skeleton; it declares [${facts.skins.join(', ') || 'none'}]`);
  }
  if (request.animation === null && request.times.length > 0) {
    throw new InspectError('--at needs --animation <name>: the setup pose has no time. Without --at the picture is the setup pose');
  }
  if (request.animation !== null && request.times.length === 0) {
    throw new InspectError(`--animation ${request.animation} needs --at <s[,s…]>: the times of it to draw, on the ${request.fps} fps grid render draws it on`);
  }
  const axes = request.show.includes('declared') ? declaredAxes(texts.modelText) : [];
  const lengths = boneLengths(texts.skeletonText);
  const posed = throughPoser(candidate.choice, (poser, roster) => view(poser, roster, pages, lengths, axes, request, plant));
  return { ...posed.value, legend: { ...posed.value.legend, poser: posed.poser }, poserNote: posed.note };
}

function view(
  poser: Poser,
  roster: SkinRoster,
  pages: Map<string, Plate>,
  lengths: Map<string, number>,
  axes: readonly DeclaredAxis[],
  request: InspectRequest,
  plant: InspectPlant,
): Omit<InspectResult, 'poserNote'> {
  const notes: string[] = [];
  const zooming = request.frame.kind === 'zoom';
  const poses = posesOf(poser, request, zooming);
  // The world box and its pixels: one for every tile, so a sheet's tiles overlay.
  let viewport: Viewport;
  let framing: InspectLegend['framing'];
  if (request.frame.kind === 'viewport') {
    const f = request.frame;
    viewport = viewportFor(f.x, f.y, f.x + f.width, f.y + f.height, request.maxSide);
    framing = { kind: 'viewport' };
  } else if (request.frame.kind === 'zoom') {
    const target = plant.zoomBone ?? request.frame.target;
    const found = zoomBox(poser, poses, target, lengths);
    const [x0, y0, x1, y1] = found.box;
    const longer = Math.max(x1 - x0, y1 - y0);
    const pad = request.frame.pad ?? longer * DEFAULT_ZOOM_PAD_SHARE;
    if (longer + 2 * pad === 0) {
      throw new InspectError(
        `--zoom ${JSON.stringify(request.frame.target)}: what it names is one point, (${x0}, ${y0}), at every time of this picture, so ` +
          `the box has no size — state a pad in world units: --zoom ${request.frame.target}:<pad>`,
      );
    }
    viewport = viewportFor(x0 - pad, y0 - pad, x1 + pad, y1 + pad, request.maxSide);
    framing = { kind: 'zoom', ...(found.bone === undefined ? {} : { bone: found.bone }), ...(found.slot === undefined ? {} : { slot: found.slot }), pad, padFrom: request.frame.pad === null ? 'default' : 'stated' };
  } else {
    const shot = framingViewport(poser, request.maxSide, request.skin === undefined ? undefined : { skin: request.skin }, roster);
    if (shot === null) throw new InspectError('this skeleton poses no drawable attachment in any animation or in its setup pose — there is nothing to frame; name a box with --viewport');
    viewport = shot;
    framing = { kind: 'shot', note: "render's own framing: every animation's posed box at 60 fps, padded — the grid render draws this build on at the same --max" };
  }
  const { width, height, scale } = viewport;
  const sheet = poses.length > 1;
  const columns = sheet ? Math.min(SHEET_COLUMNS, poses.length) : 1;
  const rows = Math.ceil(poses.length / columns);
  const gap = sheet ? SHEET_GAP : 0;
  const plate = new Plate(columns * (width + gap) + gap, rows * (height + gap) + gap);
  for (let i = 0; i < plate.data.length; i += 4) plate.data.set(colour('rule'), i);
  const [shiftX, shiftY] = plant.overlayShift ?? [0, 0];
  const [lieX, lieY] = plant.legendShift ?? [0, 0];
  const tiles: LegendTile[] = [];
  for (const [i, { frame, index }] of poses.entries()) {
    const x0 = gap + (i % columns) * (width + gap);
    const y0 = gap + Math.floor(i / columns) * (height + gap);
    // ⭐ The one projection both the picture and the legend read: continuous pixels in the whole picture.
    const toPixel = (wx: number, wy: number): [number, number] => [
      x0 + (wx - viewport.minX) * scale,
      y0 + (plant.unflipped ? wy - viewport.minY : viewport.maxY - wy) * scale,
    ];
    const point = (wx: number, wy: number): LegendPoint => {
      const [px, py] = toPixel(wx, wy);
      return { world: [wx, wy], pixel: [px + lieX, py + lieY] };
    };
    const tile = request.show.includes('art') ? renderFrame(frame, pages, viewport, BACKGROUND) : filled(width, height, BACKGROUND);
    if (request.dim) {
      for (let p = 0; p < tile.data.length; p += 4) {
        for (let c = 0; c < 3; c++) tile.data[p + c] = Math.round(255 - (255 - tile.data[p + c]) * DIM_KEEP);
      }
    }
    // Drawn on the tile in tile pixels; `tx`/`ty` take a picture pixel back to the tile's.
    const tx = (px: number): number => px - x0;
    const ty = (py: number): number => py - y0;
    const legendTile: LegendTile = {
      animation: request.animation,
      frame: index,
      time: request.animation === null ? 0 : index / request.fps,
      box: { x: x0, y: y0, width, height },
      transform: { minX: viewport.minX, maxY: viewport.maxY, scale, x0, y0 },
      bones: [],
    };
    if (request.show.includes('grid')) {
      const step = plant.gridInPixels ? gridStep(scale) / scale : gridStep(scale);
      const xs = multiples(viewport.minX, viewport.maxX, step);
      const ys = multiples(viewport.minY, viewport.maxY, step);
      for (const gx of xs) {
        const col = Math.floor(tx(toPixel(gx, 0)[0]));
        for (let y = 0; y < height; y++) put(tile, col, y, colour(gx === 0 ? 'gridZero' : 'grid'));
      }
      for (const gy of ys) {
        const row = Math.floor(ty(toPixel(0, gy)[1]));
        for (let x = 0; x < width; x++) put(tile, x, row, colour(gy === 0 ? 'gridZero' : 'grid'));
      }
      for (const gx of xs) text(tile, gridLabel(gx, step), Math.floor(tx(toPixel(gx, 0)[0])) + 2, 2, colour('gridZero'));
      for (const gy of ys) text(tile, gridLabel(gy, step), 2, Math.floor(ty(toPixel(0, gy)[1])) + 2, colour('gridZero'));
      legendTile.grid = { step, x: xs, y: ys };
    }
    const snapshots = new Map<string, BoneSnapshot>((frame.bones ?? []).map((b) => [b.name, b]));
    const isPosed = (b: BoneSnapshot | undefined): b is BoneSnapshot => b !== undefined && !(b.a === 0 && b.b === 0 && b.c === 0 && b.d === 0);
    const held = new Set<string>();
    if (request.show.includes('declared')) {
      legendTile.declared = [];
      for (const axis of axes) {
        const a = snapshots.get(axis.through[0]);
        const b = snapshots.get(axis.through[1]);
        const entry: LegendDeclared = { name: axis.name, through: axis.through, tolerance: axis.tolerance, degrees: null, why: null, from: null, to: null, bones: [] };
        if (!isPosed(a) || !isPosed(b)) {
          entry.why = `${!isPosed(a) ? axis.through[0] : axis.through[1]} is not posed at this time (its world matrix is 0), so the line has no point there`;
        } else if (a.worldX === b.worldX && a.worldY === b.worldY) {
          entry.why = `"${axis.through[0]}" and "${axis.through[1]}" share the world origin (${a.worldX}, ${a.worldY}), so they draw no line`;
        } else {
          const degrees = (Math.atan2(b.worldY - a.worldY, b.worldX - a.worldX) * 180) / Math.PI;
          entry.degrees = degrees;
          entry.from = point(a.worldX, a.worldY);
          entry.to = point(b.worldX, b.worldY);
          // Across the whole tile: extend the line past both ends by the tile's diagonal, in world units.
          const reach = Math.hypot(viewport.maxX - viewport.minX, viewport.maxY - viewport.minY);
          const ux = (b.worldX - a.worldX) / Math.hypot(b.worldX - a.worldX, b.worldY - a.worldY);
          const uy = (b.worldY - a.worldY) / Math.hypot(b.worldX - a.worldX, b.worldY - a.worldY);
          const [p0x, p0y] = toPixel(a.worldX - ux * reach, a.worldY - uy * reach);
          const [p1x, p1y] = toPixel(a.worldX + ux * reach, a.worldY + uy * reach);
          line(tile, tx(p0x) + shiftX, ty(p0y) + shiftY, tx(p1x) + shiftX, ty(p1y) + shiftY, colour('declared'));
          for (const name of axis.bones) {
            const s = snapshots.get(name);
            if (!isPosed(s) || (s.a === 0 && s.c === 0)) {
              entry.bones.push({ name, degrees: null, off: null });
              continue;
            }
            const found = worldAxisDegrees(s);
            entry.bones.push({ name, degrees: found, off: lineGap(found, degrees) });
            held.add(name);
          }
        }
        if (entry.why !== null && i === 0) notes.push(`declared: axis "${axis.name}" — ${entry.why}`);
        legendTile.declared.push(entry);
      }
      if (axes.length === 0 && i === 0) notes.push('declared: the rig declares no invariants.axes — nothing drawn for it');
    }
    // Every bone, in declaration order — drawn or not, so the legend names each.
    const drawn: Array<{ bone: LegendBone; o: [number, number]; t: [number, number] }> = [];
    for (const declared of poser.bones) {
      const s = snapshots.get(declared.name);
      const length = lengths.get(declared.name) ?? 0;
      const posedBone = isPosed(s);
      const ox = s?.worldX ?? 0;
      const oy = s?.worldY ?? 0;
      const bone: LegendBone = {
        name: declared.name,
        parent: declared.parent,
        length,
        zeroLength: length === 0,
        undrawn: posedBone ? null : 'its world matrix is 0 at this time — unposed by the skin, or a scale of 0',
        origin: point(ox, oy),
        tip: point(ox + length * (s?.a ?? 0), oy + length * (s?.c ?? 0)),
      };
      if (posedBone && request.show.includes('axes')) {
        const unit = AXIS_PIXELS / scale;
        bone.axes = { x: point(ox + s.a * unit, oy + s.c * unit), y: point(ox + s.b * unit, oy + s.d * unit) };
      }
      legendTile.bones.push(bone);
      if (posedBone) drawn.push({ bone, o: toPixel(ox, oy), t: toPixel(bone.tip.world[0], bone.tip.world[1]) });
    }
    // Lines, then axes, then names, then the marks — so a mark is never covered.
    const at = (p: [number, number]): [number, number] => [tx(p[0]) + shiftX, ty(p[1]) + shiftY];
    if (request.show.includes('bones')) {
      for (const { bone, o, t } of drawn) {
        if (bone.zeroLength) continue;
        const [ax, ay] = at(o);
        const [bx, by] = at(t);
        line(tile, ax, ay, bx, by, colour(held.has(bone.name) ? 'held' : 'bone'));
      }
    }
    if (request.show.includes('axes')) {
      for (const { bone, o } of drawn) {
        if (bone.axes === undefined) continue;
        const [ax, ay] = at(o);
        for (const [end, name] of [[bone.axes.y, 'axisY'], [bone.axes.x, 'axisX']] as const) {
          const [ex, ey] = at(toPixel(end.world[0], end.world[1]));
          line(tile, ax, ay, ex, ey, colour(name));
        }
      }
    }
    if (request.show.includes('names')) {
      // Bones whose origins share a pixel — a `_ctl` parent and its child, a chain's joint — list their names one per
      // line under it, in declaration order, rather than printing them over each other.
      const below = new Map<string, number>();
      for (const { bone, o } of drawn) {
        const [ax, ay] = at(o);
        const key = `${Math.floor(ax)},${Math.floor(ay)}`;
        const line = below.get(key) ?? 0;
        below.set(key, line + 1);
        text(tile, bone.name, Math.floor(ax) + 4, Math.floor(ay) + 3 + line * (GLYPH_H + 2), colour('name'));
      }
    }
    if (request.show.includes('bones')) {
      for (const { bone, t } of drawn) {
        if (bone.zeroLength) continue;
        const [bx, by] = at(t);
        square(tile, Math.floor(bx), Math.floor(by), 1, true, colour('tip'));
      }
      for (const { bone, o } of drawn) {
        const [ax, ay] = at(o);
        if (bone.zeroLength) square(tile, Math.floor(ax), Math.floor(ay), 2, true, colour('zero'));
        square(tile, Math.floor(ax), Math.floor(ay), 1, false, colour('origin'));
      }
    }
    if (sheet) {
      const label = request.animation === null ? 'setup' : `t=${legendTile.time.toFixed(3)} f${index}`;
      const ly = height - GLYPH_H - 2;
      for (let y = ly - 1; y < ly + GLYPH_H + 1; y++) for (let x = 1; x < textWidth(label, 1) + 3; x++) put(tile, x, y, BACKGROUND);
      text(tile, label, 2, ly, colour('label'));
    }
    for (let y = 0; y < height; y++) plate.data.set(tile.data.subarray(y * width * 4, (y + 1) * width * 4), ((y0 + y) * plate.width + x0) * 4);
    tiles.push(legendTile);
  }
  const legend: InspectLegend = {
    spec: INSPECT_SPEC,
    poser: 'core',
    show: [...request.show],
    dim: request.dim,
    ...(request.skin === undefined ? {} : { skin: request.skin }),
    animation: request.animation,
    fps: request.fps,
    framing,
    coordinates: {
      world: 'spine world: y up, world units',
      image: 'the picture: y down, from its top-left corner; pixel (i, j) covers [i, i+1) x [j, j+1), so a position\'s pixel is its floor',
      toPixel: 'px = x0 + (x - minX) * scale; py = y0 + (maxY - y) * scale — each tile\'s own transform',
      toWorld: 'x = minX + (px - x0) / scale; y = maxY - (py - y0) / scale',
    },
    viewport: { minX: viewport.minX, minY: viewport.minY, maxX: viewport.maxX, maxY: viewport.maxY, scale, width, height },
    size: { width: plate.width, height: plate.height },
    colours: Object.fromEntries(Object.entries(INSPECT_COLOURS).map(([k, v]) => [k, { rgba: [...v.rgba], meaning: v.meaning }])) as InspectLegend['colours'],
    tiles,
  };
  return { plate, legend, notes };
}

function filled(width: number, height: number, rgba: RGBA): Plate {
  const plate = new Plate(width, height);
  for (let i = 0; i < plate.data.length; i += 4) plate.data.set(rgba, i);
  return plate;
}

/** The legend as its file holds it: two-space JSON and a newline, so two runs over one build are one byte sequence. */
export function legendText(legend: InspectLegend): string {
  return `${JSON.stringify(legend, null, 2)}\n`;
}
