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
 * ⭐ **What a bone moves is read where it is written** (cut 2). Mesh edges and
 * hulls are the topology the poser's own rest table states (`Poser.rest`, the
 * table `render --geometry` writes), drawn through the posed vertices the frame
 * carries; a bone's weights are read off the build's `skeleton.json`, the file
 * both posers derive their skinning from, never re-derived from a pose.
 *
 * ⭐ **Two builds share one transform** (`--compare`). Both are posed at the
 * same times; the world box is the union of what each would be framed to (or
 * the one a viewport pins), so a mark that sits on a different pixel in the two
 * halves sits at a different place in the two rigs.
 *
 * ⭐ **Density is a measurement, never a verdict** (issue #1371). A part's
 * triangles over its posed area, against the figure's — the triangles and area
 * of every slot the pose shows, whatever a slot filter keeps. No bar, no
 * budget: `A13_MESH_BUDGET` is the one gate on counts, and this only says where
 * the triangles are.
 *
 * Links nothing from the runtime: the poser is handed in.
 */
import { createHash } from 'node:crypto';
import { drawText, GLYPH_H, textWidth } from '../tools/font5x7.ts';
import { Plate, type RGBA } from '../tools/plate.ts';
import { lineGap, worldAxisDegrees } from './assertions/bodies/a51.ts';
import {
  BACKGROUND,
  type AttachmentPose,
  type AttachmentRest,
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

/** Every word `--show` takes, in the order the picture draws them (bottom first). `weights` is spelled `weights:<bone>`. */
export const SHOW_WORDS = ['art', 'grid', 'density', 'weights', 'mesh', 'hull', 'declared', 'bones', 'axes', 'slots', 'names'] as const;
export type ShowWord = (typeof SHOW_WORDS)[number];

/** The words as a refusal lists them — `weights` with the bone it needs. */
export const SHOW_SPELLINGS: readonly string[] = SHOW_WORDS.map((w) => (w === 'weights' ? 'weights:<bone>' : w));

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

/**
 * The weight heat's colour ramp: piecewise linear between these stops, each
 * channel rounded to the nearest whole value. A pixel whose weight is below
 * `WEIGHT_FLOOR` is not painted, so the art shows where the bone does not reach.
 */
export const WEIGHT_RAMP: ReadonlyArray<{ weight: number; rgba: readonly [number, number, number, number] }> = [
  { weight: 0, rgba: [40, 80, 230, 255] },
  { weight: 0.5, rgba: [250, 205, 0, 255] },
  { weight: 1, rgba: [215, 20, 20, 255] },
];

/**
 * The density ramp (issue #1371): a part's ratio — its triangles per world
 * unit² over the figure's — painted at its colour here, interpolated **in log₂
 * of the ratio** between the two stops either side, each channel rounded, and
 * clamped to the end stops outside 1/16..16. Log because the ratio is a
 * quotient: 4× and 1/4× are the same distance from the figure, and a linear
 * ramp would spend half its colours between 8× and 16×.
 *
 * ⭐ **1× is a mid grey, neither hue, and not the background.** A part as dense
 * as the figure reads as neutral, and is still visibly a part (the background is
 * `[232, 232, 232]`, `--dim`'s art is paler still).
 *
 * ⭐ **Green to magenta, never blue to red** — ColorBrewer's PiYG ends with
 * the light stops between them. The weights ramp says blue is 0 and red is 1,
 * and an agent may read the two pictures side by side; a density ramp that ran
 * blue to red would put "sparse" and "weight 0" in one colour. Neither end is a
 * mark colour either: the mesh edge and hull drawn over a fill stay readable.
 */
export const DENSITY_RAMP: ReadonlyArray<{ ratio: number; rgba: readonly [number, number, number, number] }> = [
  { ratio: 1 / 16, rgba: [39, 100, 25, 255] },
  { ratio: 1 / 4, rgba: [161, 215, 106, 255] },
  { ratio: 1, rgba: [185, 185, 185, 255] },
  { ratio: 4, rgba: [233, 163, 201, 255] },
  { ratio: 16, rgba: [142, 1, 82, 255] },
];

/** Below this weight a heat pixel is not painted. Not a rounding of any weight: it only keeps a weight of 0 that a barycentric sum spelled as 1e-17 off the picture. */
export const WEIGHT_FLOOR = 1e-6;

/**
 * How many lines down a label is moved, one text line at a time, looking for a
 * place no earlier label holds. Past this it stays where it began and the
 * legend says it overlaps.
 */
export const LABEL_TRIES = 16;

/** What each colour the picture draws means — the legend repeats this table. */
export const INSPECT_COLOURS = {
  bone: { rgba: [0, 110, 255, 255], meaning: "a bone's line, from its origin to its tip (origin + length along its world x axis)" },
  origin: { rgba: [235, 0, 190, 255], meaning: "a bone's origin: a filled 3x3 square centred on the origin's pixel" },
  tip: { rgba: [255, 140, 0, 255], meaning: "a bone's tip: a hollow 3x3 square centred on the tip's pixel" },
  zero: { rgba: [255, 210, 0, 255], meaning: 'a bone of length 0: a hollow 5x5 square around its origin, which is also its tip' },
  name: {
    rgba: [25, 25, 25, 255],
    meaning:
      "a name label, starting 4 px right of and 3 px below its origin's pixel: one per pixel, so bones whose origins share a pixel " +
      'are one label, the first by declaration order and "+N" for the rest (the legend\'s labels list every bone in it); a label ' +
      'that would overprint an earlier one is moved down a line at a time, with a leader back to its origin',
  },
  leader: { rgba: [120, 120, 120, 255], meaning: "a label's leader, from its anchor pixel to the label — drawn where the label was moved to clear an earlier one" },
  axisX: { rgba: [215, 30, 30, 255], meaning: `a bone's world x axis from its origin, ${AXIS_PIXELS} px long at a world scale of 1` },
  axisY: { rgba: [20, 160, 40, 255], meaning: `a bone's world y axis from its origin, ${AXIS_PIXELS} px long at a world scale of 1` },
  grid: { rgba: [150, 150, 150, 255], meaning: 'a grid line at a whole multiple of the step, in world units, with its value at the edge' },
  gridZero: { rgba: [70, 70, 70, 255], meaning: 'the grid line at world x = 0 or y = 0' },
  declared: { rgba: [0, 190, 190, 255], meaning: 'an invariants.axes line, through its two bones\' origins, across the whole tile' },
  held: { rgba: [0, 95, 95, 255], meaning: 'the line of a bone an invariants.axes entry holds to its line, in place of the bone colour' },
  mesh: { rgba: [90, 30, 160, 255], meaning: "a mesh's triangle edge between two posed vertices — meshes only; a region is not drawn" },
  hull: { rgba: [0, 150, 90, 255], meaning: "a mesh's hull, vertex 0 to 1 to … to hull−1 and back, drawn over its triangle edges — meshes only" },
  slot: { rgba: [150, 0, 120, 255], meaning: "a slot's place in the posed draw order (0 is drawn first), from the centre of its attachment's box, on a white box" },
  slotBack: { rgba: [255, 255, 255, 255], meaning: 'the box under a slot number' },
  label: { rgba: [...SHEET_LABEL], meaning: "a tile's build and poser (with --compare), time and frame (on a sheet), at its bottom-left corner" },
  rule: { rgba: [...SHEET_RULE], meaning: 'the gap between two tiles' },
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

/** `--bone` / `--hide-bone`: which bones the bone views draw, by glob. */
export interface BoneFilter {
  /** Draw only the bones some pattern matches; absent draws every bone. */
  include?: readonly string[];
  /** Draw none of the bones a pattern matches — applied after `include`. */
  exclude?: readonly string[];
}

/**
 * `--overlay-slot` / `--hide-overlay-slot`: which slots the per-slot views
 * (`mesh`, `hull`, `weights:<bone>`, `density`, `slots`) draw, by glob. The art
 * is not filtered — it is what the geometry is read against — and neither is the
 * figure a density is measured against.
 */
export interface SlotFilter {
  /** Draw only the slots some pattern matches; absent draws every slot. */
  include?: readonly string[];
  /** Draw none of the slots a pattern matches — applied after `include`. */
  exclude?: readonly string[];
}

/** One `rigc inspect` invocation, its flags read but not yet checked against the build. */
export interface InspectRequest {
  show: readonly ShowWord[];
  /** The bone `weights:<bone>` names — present exactly when `show` holds `weights`. */
  weightsBone?: string;
  /** Which bones `bones`, `axes` and `names` draw; absent is every one. */
  boneFilter?: BoneFilter;
  /** Which slots `mesh`, `hull`, `weights`, `density` and `slots` draw; absent is every one. */
  slotFilter?: SlotFilter;
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
  /** `skeleton.json` — read for each bone's `length`, which no pose carries, and for each attachment's weights. */
  skeletonText: string;
  /** The `skeleton.model.json` that is this skeleton's, or `undefined` — what `declared` reads `rig.axes` from. */
  modelText: string | undefined;
}

/** The second build `--compare` draws beside the first. */
export interface InspectCompare {
  candidate: Candidate;
  texts: InspectTexts;
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
  /** Draw every mesh edge this many pixels off the vertices the legend states. */
  meshShift?: [number, number];
  /** Paint (and state) this bone's weights, whatever `weights:<bone>` named. */
  weightsOf?: string;
  /** Number the slots in the reverse of the posed draw order. */
  slotsReversed?: boolean;
  /** Draw every triangle edge in the hull's colour. */
  hullAllEdges?: boolean;
  /** One label per bone, stacked under a shared pixel as cut 1 printed them. */
  noFold?: boolean;
  /** Place every label where it begins, over whatever is there. */
  noAvoid?: boolean;
  /** Draw every bone whatever `--bone`/`--hide-bone` say. */
  ignoreFilter?: boolean;
  /** Draw every slot's geometry whatever `--overlay-slot`/`--hide-overlay-slot` say. */
  ignoreSlotFilter?: boolean;
  /** Draw the first build in both halves of a `--compare`. */
  compareFirstTwice?: boolean;
  /** Density: take a part's area as its posed vertices' bounding box — the image's box, for an unrotated region — rather than its triangles'. */
  densityAreaOfBox?: boolean;
  /** Density: state and paint the figure's density over the part's, upside down. */
  densityRatioInverted?: boolean;
  /** Density: interpolate the ramp linearly in the ratio, not in its log. */
  densityLinearRamp?: boolean;
  /** Density: take the figure's totals over the slots the filter keeps, not over every slot. */
  densityTotalsFiltered?: boolean;
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
  /** `null` when the bone is drawn; otherwise why it is not (its world matrix is 0, or a bone filter left it out). */
  undrawn: string | null;
  origin: LegendPoint;
  tip: LegendPoint;
  /** The ends of its drawn world x and y axes — present when `axes` is shown and the bone is drawn. */
  axes?: { x: LegendPoint; y: LegendPoint };
}

/** A box of picture pixels: columns `x .. x+width-1`, rows `y .. y+height-1`. */
export interface PixelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One name label in one tile. */
export interface LegendLabel {
  text: string;
  /** Every bone the label stands for, in declaration order — the first is the one named, the rest are the "+N". */
  bones: string[];
  /** The origin pixel the bones share. */
  anchor: [number, number];
  /** Where the text is drawn. */
  box: PixelBox;
  /** It was moved down to clear an earlier label, and a leader joins it to `anchor`. */
  moved: boolean;
  /** No place within `LABEL_TRIES` lines was clear, so it stays where it began, over an earlier label. */
  overlaps: boolean;
}

/** One region or mesh the frame shows, when `mesh`, `hull`, `weights` or `density` is drawn — and, with a slot filter, that it keeps. */
export interface LegendMesh {
  slot: string;
  attachment: string;
  kind: 'region' | 'mesh';
  vertexCount: number;
  triangleCount: number;
  /** A mesh's hull vertex count (vertices 0..hull−1); `null` for a region. */
  hull: number | null;
  /** Its unique triangle edges, each `[i, j]` with `i < j`, in the order the triangles first name them. */
  edges: Array<[number, number]>;
  /** Posed vertices, `x, y` per vertex: world units, and the picture's pixels. */
  world: number[];
  pixel: number[];
  /** With `weights:<bone>`: that bone's weight at each vertex. */
  weights?: number[];
}

/** One slot that shows a region or mesh at this tile's pose. */
export interface LegendSlot {
  /** Its place in the posed draw order among the slots that show a region or mesh — 0 is drawn first. */
  order: number;
  slot: string;
  attachment: string;
  bone: string;
  /** The centre of its posed vertices' box, where its number is drawn from. */
  anchor: LegendPoint;
  /** Where the number is drawn: the white box under it, text 1 px inside. */
  box: PixelBox;
  moved: boolean;
  overlaps: boolean;
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

/** One slot's row of the density table: one region or mesh the pose shows. */
export interface LegendDensitySlot {
  /** Its place in the posed draw order (0 is drawn first) — the number `slots` draws, filtered or not. */
  order: number;
  slot: string;
  attachment: string;
  kind: 'region' | 'mesh';
  /** The slot colour × attachment colour alpha at this pose: a part at 0 is in the totals and draws nothing. */
  alpha: number;
  vertices: number;
  triangles: number;
  /** A mesh's hull vertex count; `null` for a region. */
  hull: number | null;
  /** The posed area: the sum of its triangles' absolute areas, world units². */
  area: number;
  /** `triangles / area`, per world unit²; `null` with `why` when the area is 0. */
  trianglesPerArea: number | null;
  /** `trianglesPerArea` over the figure's: the number to read. `null` with `why`. */
  ratio: number | null;
  /** The colour the part is painted, or `null` when it is not (no ratio, or a slot filter left it out of the picture — then it is not listed). */
  rgba: number[] | null;
  /** How many bones its vertices are weighted to (weight above 0) — a region's or an unweighted mesh's is its slot's one bone. */
  bones: number;
  /** Those bones, in the order the skeleton declares them. */
  boneNames: string[];
  /** `null`, or why `trianglesPerArea` or `ratio` has no value. */
  why: string | null;
}

/** The figure's density at one tile's pose, and each kept slot's row. */
export interface LegendDensity {
  /** Over EVERY slot whose attachment at this pose is a region or mesh, whatever a slot filter keeps. */
  figure: { slots: number; triangles: number; area: number; trianglesPerArea: number | null; why: string | null };
  /** The slots the filter keeps, in the posed draw order. */
  slots: LegendDensitySlot[];
}

export interface LegendTile {
  /** With `--compare`: which build this tile is — `A` is `--candidate`, `B` is `--compare`. */
  build?: 'A' | 'B';
  /** `null` for the setup pose. */
  animation: string | null;
  /** The frame of `render --fps <fps>` this pose is, and its time `frame / fps`. */
  frame: number;
  time: number;
  /** Where the tile sits in the picture: its top-left pixel and its size. */
  box: { x: number; y: number; width: number; height: number };
  /** The tile's transform. `px = x0 + (x - minX)·scale`, `py = y0 + (maxY - y)·scale`; back: `x = minX + (px - x0)/scale`, `y = maxY - (py - y0)/scale`. */
  transform: { minX: number; maxY: number; scale: number; x0: number; y0: number };
  /** On a sheet or a compare: the tile's label and the box it is drawn on. */
  label?: { text: string; box: PixelBox };
  bones: LegendBone[];
  labels?: LegendLabel[];
  meshes?: LegendMesh[];
  slots?: LegendSlot[];
  /** With `density`: the figure's totals and every kept slot's row. */
  density?: LegendDensity;
  declared?: LegendDeclared[];
  grid?: { step: number; x: number[]; y: number[] };
}

export interface InspectLegend {
  spec: typeof INSPECT_SPEC;
  /** The poser that posed `--candidate`; with `--compare`, `builds` names both. */
  poser: 'core' | 'spine';
  show: string[];
  dim: boolean;
  skin?: string;
  animation: string | null;
  fps: number;
  framing:
    | { kind: 'shot'; note: string }
    | { kind: 'zoom'; bone?: string; slot?: string; pad: number; padFrom: 'stated' | 'default' }
    | { kind: 'viewport' };
  /** `--bone` / `--hide-bone` as given — each bone they leave out says so in its `undrawn`. */
  boneFilter?: { include: string[] | null; exclude: string[] | null };
  /** `--overlay-slot` / `--hide-overlay-slot` as given — `meshes[]` and `slots[]` then list only the slots they keep. */
  slotFilter?: { include: string[] | null; exclude: string[] | null };
  /** With `weights:<bone>`: the bone, the ramp a weight is painted with, and how a pixel's weight is read. */
  weights?: { bone: string; ramp: Array<{ weight: number; rgba: number[] }>; floor: number; reading: string };
  /** With `density`: the ramp, its scale, and how area, totals and ratio are read. */
  density?: { ramp: Array<{ ratio: number; rgba: number[] }>; scale: string; area: string; totals: string; ratio: string; reading: string };
  /** With `--compare`: each build, the poser that posed it and its `skeleton.json`'s sha256; a tile names its own in `build`. */
  builds?: Array<{ build: 'A' | 'B'; poser: 'core' | 'spine'; skeletonSha256: string }>;
  coordinates: { world: string; image: string; toPixel: string; toWorld: string };
  /** The world box every tile is a picture of, and its pixels — one for the whole picture, both builds of a compare included. */
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
  /** With `--compare`: the second build's poser line. */
  comparePoserNote?: string;
  /** Lines worth printing beside the picture: what a view drew nothing for, and why. */
  notes: string[];
}

// ---------------------------------------------------------------------------
// reading the request against the build
// ---------------------------------------------------------------------------

/**
 * `--show`'s words, refused by name — a word this command does not draw lists
 * every one it does — and the bone `weights:<bone>` names. The bone is checked
 * against the build later, where its roster is known.
 */
export function readShow(raw: string | undefined): { show: ShowWord[]; weightsBone?: string } {
  if (raw === undefined) return { show: [...DEFAULT_SHOW] };
  const words = raw.split(',').map((w) => w.trim()).filter((w) => w !== '');
  if (words.length === 0) throw new InspectError(`--show ${JSON.stringify(raw)} names no view; it takes [${SHOW_SPELLINGS.join(', ')}]`);
  const out: ShowWord[] = [];
  let weightsBone: string | undefined;
  for (const spelled of words) {
    let word = spelled;
    if (spelled === 'weights' || spelled.startsWith('weights:')) {
      const bone = spelled.slice('weights:'.length);
      if (spelled === 'weights' || bone === '') {
        throw new InspectError(`--show ${JSON.stringify(spelled)} needs the bone whose weights it paints: weights:<bone>`);
      }
      word = 'weights';
      weightsBone = bone;
    }
    const known = SHOW_WORDS.find((w) => w === word);
    if (known === undefined) throw new InspectError(`--show ${JSON.stringify(spelled)} is not a view inspect draws; it draws [${SHOW_SPELLINGS.join(', ')}]`);
    if (out.includes(known)) throw new InspectError(`--show names ${JSON.stringify(word)} twice`);
    out.push(known);
  }
  // In the drawing order, so two spellings of one set are one picture and one legend.
  return { show: SHOW_WORDS.filter((w) => out.includes(w)), ...(weightsBone === undefined ? {} : { weightsBone }) };
}

/** `--show` as the legend spells it: the words in drawing order, `weights` with its bone. */
function showSpelled(request: InspectRequest, weightsBone: string | undefined): string[] {
  return request.show.map((w) => (w === 'weights' ? `weights:${weightsBone ?? ''}` : w));
}

/**
 * `--bone` / `--hide-bone`'s patterns: comma-separated globs, `*` any run of
 * characters and `?` one, matched against a bone's whole name. Checked against
 * the build later, where a pattern that matches no bone is refused.
 */
export function readBonePatterns(flag: string, raw: string | undefined, example = 'bang_*,*_ctl'): string[] | undefined {
  if (raw === undefined) return undefined;
  const patterns = raw.split(',').map((p) => p.trim());
  if (patterns.some((p) => p === '')) throw new InspectError(`--${flag} ${JSON.stringify(raw)}: an empty pattern; it takes globs, comma-separated, e.g. --${flag} '${example}'`);
  return patterns;
}

/** A glob as the regular expression it means: `*` any run, `?` one character, everything else itself, the whole name. */
export function globMatcher(pattern: string): (name: string) => boolean {
  const body = [...pattern].map((c) => (c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.+^${}()|[\]\\/]/g, '\\$&'))).join('');
  const re = new RegExp(`^${body}$`, 'su');
  return (name) => re.test(name);
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
// what a bone moves: the build's weights, the poser's topology
// ---------------------------------------------------------------------------

/** Per vertex, the bones that move it and by how much. */
export type VertexWeights = Array<Array<[string, number]>>;

type SkinFileAttachment = Record<string, unknown>;

/**
 * Each region's and mesh's per-vertex bone weights, read off the build's
 * `skeleton.json` — the file both posers derive their skinning from — under
 * `skin` and then the default skin, which is the order the runtime resolves an
 * attachment in. A weighted mesh's runs name bones by their index in the file's
 * `bones` array; an unweighted mesh and a region are moved whole by their slot's
 * bone. A linked mesh reads its parent's. What cannot be read is answered with
 * the sentence saying why, for the caller to refuse by.
 */
export function weightsReader(skeletonText: string, skin: string | undefined): (slot: string, attachment: string) => VertexWeights | string {
  const doc = JSON.parse(skeletonText) as {
    bones?: Array<{ name?: unknown }>;
    slots?: Array<{ name?: unknown; bone?: unknown }>;
    skins?: unknown;
  };
  const boneNames = (doc.bones ?? []).map((b) => (typeof b.name === 'string' ? b.name : ''));
  const slotBone = new Map<string, string>();
  for (const s of doc.slots ?? []) if (typeof s.name === 'string' && typeof s.bone === 'string') slotBone.set(s.name, s.bone);
  const skins = Array.isArray(doc.skins) ? (doc.skins as Array<{ name?: unknown; attachments?: Record<string, Record<string, SkinFileAttachment>> }>) : [];
  const find = (skinName: string, slot: string, attachment: string): SkinFileAttachment | undefined => {
    const entries = skins.find((k) => k.name === skinName)?.attachments?.[slot];
    if (entries === undefined) return undefined;
    // Keyed by its name; an entry may also rename itself with a `name` field, which is what the posers report.
    return entries[attachment] ?? Object.values(entries).find((a) => a.name === attachment);
  };
  const order = skin === undefined ? ['default'] : skin === 'default' ? ['default'] : [skin, 'default'];
  return (slot, attachment) => {
    let found: SkinFileAttachment | undefined;
    for (const k of order) {
      found = find(k, slot, attachment);
      if (found !== undefined) break;
    }
    const where = `slot "${slot}" attachment "${attachment}"`;
    if (found === undefined) return `${where}: skeleton.json has no such attachment under skin ${order.map((k) => JSON.stringify(k)).join(' or ')}`;
    const bone = slotBone.get(slot);
    if (bone === undefined) return `${where}: skeleton.json declares no slot "${slot}" with a bone`;
    const type = typeof found.type === 'string' ? found.type : 'region';
    if (type === 'region') return [[[bone, 1]], [[bone, 1]], [[bone, 1]], [[bone, 1]]];
    let mesh = found;
    if (type === 'linkedmesh') {
      const parentSkin = typeof found.skin === 'string' ? found.skin : 'default';
      const parent = typeof found.parent === 'string' ? find(parentSkin, slot, found.parent) : undefined;
      if (parent === undefined) return `${where}: its parent mesh ${JSON.stringify(found.parent)} is not in skin "${parentSkin}"`;
      mesh = parent;
    } else if (type !== 'mesh') {
      return `${where} is a ${type}, which poses no vertices`;
    }
    const uvs = mesh.uvs;
    const vertices = mesh.vertices;
    if (!Array.isArray(uvs) || !Array.isArray(vertices)) return `${where}: its mesh states no uvs or vertices`;
    const count = uvs.length / 2;
    if (vertices.length === uvs.length) return Array.from({ length: count }, (): Array<[string, number]> => [[bone, 1]]);
    const out: VertexWeights = [];
    let i = 0;
    for (let v = 0; v < count; v++) {
      const n = Number(vertices[i++]);
      const run: Array<[string, number]> = [];
      for (let k = 0; k < n; k++, i += 4) {
        const name = boneNames[Number(vertices[i])];
        if (name === undefined) return `${where}: vertex ${v} names bone index ${String(vertices[i])}, and skeleton.json has ${boneNames.length} bones`;
        run.push([name, Number(vertices[i + 3])]);
      }
      out.push(run);
    }
    return out;
  };
}

/** A triangle list's unique edges, `[i, j]` with `i < j`, in the order the triangles first name them. */
export function edgesOf(triangles: ArrayLike<number>): Array<[number, number]> {
  const seen = new Set<string>();
  const out: Array<[number, number]> = [];
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    const [a, b, c] = [triangles[t], triangles[t + 1], triangles[t + 2]];
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const e: [number, number] = p < q ? [p, q] : [q, p];
      const key = `${e[0]},${e[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
    }
  }
  return out;
}

/** The ramp's colour at `weight` (clamped to 0..1): linear between the two stops either side, each channel rounded. */
export function rampColour(weight: number): RGBA {
  const w = Math.min(1, Math.max(0, weight));
  for (let i = 0; i + 1 < WEIGHT_RAMP.length; i++) {
    const lo = WEIGHT_RAMP[i];
    const hi = WEIGHT_RAMP[i + 1];
    if (w > hi.weight) continue;
    const t = (w - lo.weight) / (hi.weight - lo.weight);
    return [0, 1, 2, 3].map((c) => Math.round(lo.rgba[c] + (hi.rgba[c] - lo.rgba[c]) * t)) as RGBA;
  }
  return [...WEIGHT_RAMP[WEIGHT_RAMP.length - 1].rgba] as RGBA;
}

/**
 * The heat over one triangle: every pixel whose centre the triangle holds,
 * painted the ramp's colour at the barycentric blend of its corners' weights —
 * so a pixel whose centre is a vertex is that vertex's weight exactly.
 */
function heatTriangle(plate: Plate, p: ReadonlyArray<[number, number]>, w: readonly number[]): void {
  const [[x0, y0], [x1, y1], [x2, y2]] = p;
  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (area === 0 || w.every((v) => v < WEIGHT_FLOOR)) return;
  const left = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
  const right = Math.min(plate.width - 1, Math.floor(Math.max(x0, x1, x2)));
  const top = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const bottom = Math.min(plate.height - 1, Math.floor(Math.max(y0, y1, y2)));
  // A pixel centre ON a vertex or an edge is inside: posed vertices carry float noise of ~1e-7 world units, which
  // must not leave the pixel under a vertex unpainted. In barycentric units, so it is the same share of every triangle.
  const inside = -1e-6;
  for (let py = top; py <= bottom; py++) {
    for (let px = left; px <= right; px++) {
      const cx = px + 0.5;
      const cy = py + 0.5;
      const b0 = ((x1 - cx) * (y2 - cy) - (x2 - cx) * (y1 - cy)) / area;
      const b1 = ((x2 - cx) * (y0 - cy) - (x0 - cx) * (y2 - cy)) / area;
      const b2 = 1 - b0 - b1;
      if (b0 < inside || b1 < inside || b2 < inside) continue;
      const weight = b0 * w[0] + b1 * w[1] + b2 * w[2];
      if (weight < WEIGHT_FLOOR) continue;
      put(plate, px, py, rampColour(weight));
    }
  }
}

/**
 * The density ramp's colour at `ratio`: interpolated in log₂ of the ratio
 * between the two stops either side, each channel rounded, clamped to the end
 * stops. `linear` is the mutant's reading — interpolated in the ratio itself.
 */
export function densityColour(ratio: number, linear = false): RGBA {
  const at = (r: number): number => (linear ? r : Math.log2(r));
  const first = DENSITY_RAMP[0];
  const last = DENSITY_RAMP[DENSITY_RAMP.length - 1];
  if (ratio <= first.ratio) return [...first.rgba] as RGBA;
  if (ratio >= last.ratio) return [...last.rgba] as RGBA;
  for (let i = 0; i + 1 < DENSITY_RAMP.length; i++) {
    const lo = DENSITY_RAMP[i];
    const hi = DENSITY_RAMP[i + 1];
    if (ratio > hi.ratio) continue;
    const t = (at(ratio) - at(lo.ratio)) / (at(hi.ratio) - at(lo.ratio));
    return [0, 1, 2, 3].map((c) => Math.round(lo.rgba[c] + (hi.rgba[c] - lo.rgba[c]) * t)) as RGBA;
  }
  return [...last.rgba] as RGBA;
}

/** A posed attachment's area: the sum of its triangles' absolute areas, in the units its vertices are in. */
export function trianglesArea(vertices: readonly number[], triangles: readonly number[]): number {
  let sum = 0;
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    const [a, b, c] = [triangles[t] * 2, triangles[t + 1] * 2, triangles[t + 2] * 2];
    sum += Math.abs((vertices[b] - vertices[a]) * (vertices[c + 1] - vertices[a + 1]) - (vertices[c] - vertices[a]) * (vertices[b + 1] - vertices[a + 1])) / 2;
  }
  return sum;
}

/** The bounding box of the vertices, as an area — the density mutant's wrong reading of a part's size. */
function boxArea(vertices: readonly number[]): number {
  const xs = vertices.filter((_, i) => i % 2 === 0);
  const ys = vertices.filter((_, i) => i % 2 === 1);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
}

/** Every pixel whose centre the triangle holds, painted one colour — the heat's inside test. */
function fillTriangle(plate: Plate, p: ReadonlyArray<[number, number]>, rgba: RGBA): void {
  const [[x0, y0], [x1, y1], [x2, y2]] = p;
  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (area === 0) return;
  const left = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
  const right = Math.min(plate.width - 1, Math.floor(Math.max(x0, x1, x2)));
  const top = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const bottom = Math.min(plate.height - 1, Math.floor(Math.max(y0, y1, y2)));
  const inside = -1e-6;
  for (let py = top; py <= bottom; py++) {
    for (let px = left; px <= right; px++) {
      const cx = px + 0.5;
      const cy = py + 0.5;
      const b0 = ((x1 - cx) * (y2 - cy) - (x2 - cx) * (y1 - cy)) / area;
      const b1 = ((x2 - cx) * (y0 - cy) - (x0 - cx) * (y2 - cy)) / area;
      if (b0 < inside || b1 < inside || 1 - b0 - b1 < inside) continue;
      put(plate, px, py, rgba);
    }
  }
}

/**
 * The density table at one pose: every region and mesh the pose shows, in the
 * posed draw order, with the figure's totals over all of them — the slot filter
 * decides which rows are listed and painted, never what the figure is. Read,
 * never filled in: a part whose posed area is 0 has no density and says why,
 * and a figure with no area has none either.
 */
function densityAt(
  attachments: readonly AttachmentPose[],
  rest: ReadonlyMap<string, AttachmentRest>,
  weights: (slot: string, attachment: string) => VertexWeights | string,
  boneOrder: readonly string[],
  slotsOut: ReadonlySet<string>,
  plant: InspectPlant,
): LegendDensity {
  const rows: Array<LegendDensitySlot & { kept: boolean }> = [];
  for (const [order, shown] of attachments.entries()) {
    const r = rest.get(restKey(shown.slot, shown.attachment));
    if (r === undefined) throw new Error(`slot "${shown.slot}" attachment "${shown.attachment}": the rest table has no entry for it — the poser disagrees with itself`);
    const read = weights(shown.slot, shown.attachment);
    if (typeof read === 'string') throw new InspectError(`--show density: ${read}`);
    const named = new Set<string>();
    for (const run of read) for (const [bone, w] of run) if (w > 0) named.add(bone);
    const boneNames = boneOrder.filter((b) => named.has(b));
    const triangles = r.triangles.length / 3;
    const area = plant.densityAreaOfBox ? boxArea(shown.vertices) : trianglesArea(shown.vertices, r.triangles);
    rows.push({
      order,
      slot: shown.slot,
      attachment: shown.attachment,
      kind: r.kind,
      alpha: shown.color[3],
      vertices: shown.vertices.length / 2,
      triangles,
      hull: r.kind === 'mesh' ? (r.hull ?? null) : null,
      area,
      trianglesPerArea: area > 0 ? triangles / area : null,
      ratio: null,
      rgba: null,
      bones: boneNames.length,
      boneNames,
      why: area > 0 ? null : 'its posed area is 0 — every triangle collapsed to a line or a point at this pose (a scale of 0 does), so it covers nothing and has no density',
      kept: !slotsOut.has(shown.slot),
    });
  }
  const over = plant.densityTotalsFiltered ? rows.filter((r) => r.kept) : rows;
  const triangles = over.reduce((n, r) => n + r.triangles, 0);
  const area = over.reduce((n, r) => n + r.area, 0);
  const figurePerArea = area > 0 ? triangles / area : null;
  const figure = {
    slots: over.length,
    triangles,
    area,
    trianglesPerArea: figurePerArea,
    why: figurePerArea !== null ? null : over.length === 0 ? 'the pose shows no region or mesh' : "every part's posed area is 0, so the figure covers nothing and has no density",
  };
  const slots: LegendDensitySlot[] = [];
  for (const { kept, ...row } of rows) {
    if (!kept) continue;
    if (row.trianglesPerArea !== null && figurePerArea !== null) {
      row.ratio = plant.densityRatioInverted ? figurePerArea / row.trianglesPerArea : row.trianglesPerArea / figurePerArea;
      row.rgba = [...densityColour(row.ratio, plant.densityLinearRamp === true)];
    } else if (row.why === null) {
      row.why = `the figure has no density: ${figure.why ?? ''}`;
    }
    slots.push(row);
  }
  return { figure, slots };
}

/** Two pixel boxes overlap, or sit with no clear pixel between them. */
function crowds(a: PixelBox, b: PixelBox): boolean {
  return a.x < b.x + b.width + 1 && b.x < a.x + a.width + 1 && a.y < b.y + b.height + 1 && b.y < a.y + a.height + 1;
}

/**
 * Where a label goes: `first`, or the first place below it, a text line at a
 * time, that no earlier label crowds — in the order labels are placed, which is
 * declaration order, so one build and one request place every label alike.
 */
function placeLabel(first: PixelBox, taken: PixelBox[], avoid: boolean): { box: PixelBox; moved: boolean; overlaps: boolean } {
  if (avoid) {
    for (let step = 0; step <= LABEL_TRIES; step++) {
      const box = { ...first, y: first.y + step * (GLYPH_H + 2) };
      if (!taken.some((t) => crowds(t, box))) {
        taken.push(box);
        return { box, moved: step > 0, overlaps: false };
      }
    }
  }
  const overlaps = taken.some((t) => crowds(t, first));
  taken.push(first);
  return { box: first, moved: false, overlaps };
}

/** `--bone` / `--hide-bone` against one build's bones: the bones they leave out, each with why. A pattern matching no bone is refused naming the bones there are. */
function filterOut(bones: ReadonlyArray<{ name: string }>, filter: BoneFilter | undefined, apply: boolean): Map<string, string> {
  const out = new Map<string, string>();
  if (filter === undefined) return out;
  const names = bones.map((b) => b.name);
  const matchers = (flag: string, patterns: readonly string[]): Array<(name: string) => boolean> =>
    patterns.map((p) => {
      const m = globMatcher(p);
      if (!names.some(m)) throw new InspectError(`--${flag} ${JSON.stringify(p)} matches no bone; the bones are [${names.join(', ')}]`);
      return m;
    });
  const include = filter.include === undefined ? null : matchers('bone', filter.include);
  const exclude = filter.exclude === undefined ? null : matchers('hide-bone', filter.exclude);
  if (!apply) return out;
  for (const name of names) {
    if (include !== null && !include.some((m) => m(name))) out.set(name, `not matched by --bone ${filter.include?.join(',')}`);
    else if (exclude !== null && exclude.some((m) => m(name))) out.set(name, `left out by --hide-bone ${filter.exclude?.join(',')}`);
  }
  return out;
}

/**
 * `--overlay-slot` / `--hide-overlay-slot` against one build's slots: the slots
 * whose geometry is not drawn. A pattern matching no slot is refused naming the
 * slots there are — checked even when `apply` is off, so a mutant that ignores
 * the filter still refuses a typo.
 */
function slotsLeftOut(slots: ReadonlyArray<{ name: string }>, filter: SlotFilter | undefined, apply: boolean): Set<string> {
  const out = new Set<string>();
  if (filter === undefined) return out;
  const names = slots.map((s) => s.name);
  const matchers = (flag: string, patterns: readonly string[]): Array<(name: string) => boolean> =>
    patterns.map((p) => {
      const m = globMatcher(p);
      if (!names.some(m)) throw new InspectError(`--${flag} ${JSON.stringify(p)} matches no slot; the slots are [${names.join(', ')}]`);
      return m;
    });
  const include = filter.include === undefined ? null : matchers('overlay-slot', filter.include);
  const exclude = filter.exclude === undefined ? null : matchers('hide-overlay-slot', filter.exclude);
  if (!apply) return out;
  for (const name of names) {
    if ((include !== null && !include.some((m) => m(name))) || (exclude !== null && exclude.some((m) => m(name)))) out.add(name);
  }
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

type WorldBox = [number, number, number, number];

/** The world box of what `--zoom` names, over every pose of the picture. */
function zoomBox(
  poser: Poser,
  poses: ReadonlyArray<{ frame: Frame }>,
  target: string,
  lengths: Map<string, number>,
): { box: WorldBox; bone?: string; slot?: string } {
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
  const box: WorldBox = [Infinity, Infinity, -Infinity, -Infinity];
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

/** One build as the drawing reads it: everything taken off its poser while the poser ran, so drawing poses nothing. */
interface Gathered {
  tag: 'A' | 'B';
  poser: 'core' | 'spine';
  note: string;
  bones: ReadonlyArray<{ name: string; parent: string | null }>;
  slots: ReadonlyArray<{ name: string; bone: string }>;
  poses: Array<{ frame: Frame; index: number }>;
  /** `render`'s framing of the build — taken only when the picture is framed as a shot. */
  shot: Viewport | null;
  zoom: { box: WorldBox; bone?: string; slot?: string } | null;
  /** The rest table's topology for every attachment a pose shows, by `slot\0attachment` — taken only when a mesh view is drawn. */
  rest: Map<string, AttachmentRest> | null;
  pages: Map<string, Plate>;
  lengths: Map<string, number>;
  axes: readonly DeclaredAxis[];
  weights: ((slot: string, attachment: string) => VertexWeights | string) | null;
  sha: string;
}

const MESH_VIEWS: readonly ShowWord[] = ['mesh', 'hull', 'weights', 'density'];
const restKey = (slot: string, attachment: string): string => `${slot}\u0000${attachment}`;

/** A refusal about the second build says so: the same sentence, under the name of the build it is about. */
function aboutBuild<T>(tag: 'A' | 'B', run: () => T): T {
  if (tag === 'A') return run();
  try {
    return run();
  } catch (err) {
    if (err instanceof InspectError) throw new InspectError(`the --compare build: ${err.message}`);
    throw err;
  }
}

/** Everything a picture needs off one build, posed through the poser `render` would pose it with. */
function gather(tag: 'A' | 'B', candidate: Candidate, texts: InspectTexts, request: InspectRequest, plant: InspectPlant): Gathered {
  return aboutBuild(tag, () => {
    const { facts, pages } = candidate;
    if (request.skin !== undefined && !facts.skins.includes(request.skin)) {
      throw new InspectError(`no skin ${JSON.stringify(request.skin)} in this skeleton; it declares [${facts.skins.join(', ') || 'none'}]`);
    }
    const axes = request.show.includes('declared') ? declaredAxes(texts.modelText) : [];
    const lengths = boneLengths(texts.skeletonText);
    const meshViews = request.show.some((w) => MESH_VIEWS.includes(w));
    const needAttachments = request.frame.kind === 'zoom' || meshViews || request.show.includes('slots');
    const posed = throughPoser(candidate.choice, (poser, roster) => {
      const poses = posesOf(poser, request, needAttachments);
      const shot =
        request.frame.kind === 'shot' ? framingViewport(poser, request.maxSide, request.skin === undefined ? undefined : { skin: request.skin }, roster) : null;
      if (request.frame.kind === 'shot' && shot === null) {
        throw new InspectError('this skeleton poses no drawable attachment in any animation or in its setup pose — there is nothing to frame; name a box with --viewport');
      }
      const zoom = request.frame.kind === 'zoom' ? zoomBox(poser, poses, plant.zoomBone ?? request.frame.target, lengths) : null;
      const rest = meshViews
        ? new Map(poser.rest(request.skin, poses.map((p) => p.frame.attachments ?? [])).map((r) => [restKey(r.slot, r.attachment), r]))
        : null;
      return { poses, shot, zoom, rest, bones: poser.bones, slots: poser.slots };
    });
    return {
      tag,
      poser: posed.poser,
      note: posed.note,
      ...posed.value,
      pages,
      lengths,
      axes,
      weights: request.show.includes('weights') || request.show.includes('density') ? weightsReader(texts.skeletonText, request.skin) : null,
      sha: createHash('sha256').update(texts.skeletonText).digest('hex'),
    };
  });
}

/**
 * The picture and its legend, posed through `candidate`'s chosen poser — the
 * one `render` would pose it with (`throughPoser`), named in the result — and,
 * with `compare`, the same view of a second build beside it on one transform.
 */
export function inspectCandidate(candidate: Candidate, texts: InspectTexts, request: InspectRequest, plant: InspectPlant = {}, compare?: InspectCompare): InspectResult {
  if (request.animation === null && request.times.length > 0) {
    throw new InspectError('--at needs --animation <name>: the setup pose has no time. Without --at the picture is the setup pose');
  }
  if (request.animation !== null && request.times.length === 0) {
    throw new InspectError(`--animation ${request.animation} needs --at <s[,s…]>: the times of it to draw, on the ${request.fps} fps grid render draws it on`);
  }
  if (request.show.includes('weights') !== (request.weightsBone !== undefined)) {
    throw new InspectError('--show weights needs the bone whose weights it paints: weights:<bone>');
  }
  const a = gather('A', candidate, texts, request, plant);
  const builds = [a];
  if (compare !== undefined) builds.push(plant.compareFirstTwice ? { ...a, tag: 'B' } : gather('B', compare.candidate, compare.texts, request, plant));
  const drawn = view(builds, request, plant);
  return { ...drawn, poserNote: a.note, ...(compare === undefined ? {} : { comparePoserNote: builds[1].note }) };
}

function view(builds: readonly Gathered[], request: InspectRequest, plant: InspectPlant): Omit<InspectResult, 'poserNote' | 'comparePoserNote'> {
  const notes: string[] = [];
  const compare = builds.length > 1;
  const weightsBone = plant.weightsOf ?? request.weightsBone;
  if (weightsBone !== undefined) {
    for (const b of builds) {
      if (!b.bones.some((bone) => bone.name === weightsBone)) {
        aboutBuild(b.tag, () => {
          throw new InspectError(`--show weights:${weightsBone}: no bone of that name; the bones are [${b.bones.map((bone) => bone.name).join(', ')}]`);
        });
      }
    }
  }
  const filtered = builds.map((b) => aboutBuild(b.tag, () => filterOut(b.bones, request.boneFilter, plant.ignoreFilter !== true)));
  const slotsOut = builds.map((b) => aboutBuild(b.tag, () => slotsLeftOut(b.slots, request.slotFilter, plant.ignoreSlotFilter !== true)));
  // The world box and its pixels: one for every tile of both builds, so a sheet's tiles and a compare's halves overlay.
  let viewport: Viewport;
  let framing: InspectLegend['framing'];
  if (request.frame.kind === 'viewport') {
    const f = request.frame;
    viewport = viewportFor(f.x, f.y, f.x + f.width, f.y + f.height, request.maxSide);
    framing = { kind: 'viewport' };
  } else if (request.frame.kind === 'zoom') {
    const found = builds.map((b) => b.zoom).filter((z): z is NonNullable<Gathered['zoom']> => z !== null);
    const [x0, y0, x1, y1] = found.reduce<WorldBox>(
      (u, z) => [Math.min(u[0], z.box[0]), Math.min(u[1], z.box[1]), Math.max(u[2], z.box[2]), Math.max(u[3], z.box[3])],
      [Infinity, Infinity, -Infinity, -Infinity],
    );
    const longer = Math.max(x1 - x0, y1 - y0);
    const pad = request.frame.pad ?? longer * DEFAULT_ZOOM_PAD_SHARE;
    if (longer + 2 * pad === 0) {
      throw new InspectError(
        `--zoom ${JSON.stringify(request.frame.target)}: what it names is one point, (${x0}, ${y0}), at every time of this picture, so ` +
          `the box has no size — state a pad in world units: --zoom ${request.frame.target}:<pad>`,
      );
    }
    viewport = viewportFor(x0 - pad, y0 - pad, x1 + pad, y1 + pad, request.maxSide);
    const first = found[0];
    framing = { kind: 'zoom', ...(first?.bone === undefined ? {} : { bone: first.bone }), ...(first?.slot === undefined ? {} : { slot: first.slot }), pad, padFrom: request.frame.pad === null ? 'default' : 'stated' };
  } else {
    const shots = builds.map((b) => b.shot).filter((v): v is Viewport => v !== null);
    if (!compare) {
      viewport = shots[0];
      framing = { kind: 'shot', note: "render's own framing: every animation's posed box at 60 fps, padded — the grid render draws this build on at the same --max" };
    } else {
      viewport = viewportFor(
        Math.min(...shots.map((v) => v.minX)),
        Math.min(...shots.map((v) => v.minY)),
        Math.max(...shots.map((v) => v.maxX)),
        Math.max(...shots.map((v) => v.maxY)),
        request.maxSide,
      );
      framing = {
        kind: 'shot',
        note:
          "the union of render's own framing of each build (every animation's posed box at 60 fps, padded), so both halves share one " +
          "transform — a half is render's frame of its build only where the two boxes agree",
      };
    }
  }
  const { width, height, scale } = viewport;
  const count = builds[0].poses.length;
  const sheet = count > 1;
  // One build: tiles left to right, eight to a row. Two: each time's pair side by side, four pairs to a row.
  const pairs = compare ? Math.min(SHEET_COLUMNS / 2, count) : 0;
  const columns = compare ? pairs * 2 : sheet ? Math.min(SHEET_COLUMNS, count) : 1;
  const rows = compare ? Math.ceil(count / pairs) : Math.ceil(count / columns);
  const gap = sheet || compare ? SHEET_GAP : 0;
  const plate = new Plate(columns * (width + gap) + gap, rows * (height + gap) + gap);
  for (let i = 0; i < plate.data.length; i += 4) plate.data.set(colour('rule'), i);
  const tiles: LegendTile[] = [];
  const weighted = builds.map(() => false);
  let anyMesh = false;
  for (let k = 0; k < count; k++) {
    for (const [bi, build] of builds.entries()) {
      const column = compare ? (k % pairs) * 2 + bi : k % columns;
      const row = compare ? Math.floor(k / pairs) : Math.floor(k / columns);
      const x0 = gap + column * (width + gap);
      const y0 = gap + row * (height + gap);
      const drawnTile = drawTile(build, build.poses[k], filtered[bi], slotsOut[bi], { x0, y0, viewport, sheet, compare, weightsBone, first: k === 0 && bi === 0 }, request, plant, notes);
      if (drawnTile.weighted) weighted[bi] = true;
      if (drawnTile.anyMesh) anyMesh = true;
      for (let y = 0; y < height; y++) plate.data.set(drawnTile.tile.data.subarray(y * width * 4, (y + 1) * width * 4), ((y0 + y) * plate.width + x0) * 4);
      tiles.push(drawnTile.legend);
    }
  }
  // With a slot filter the sentence says the filter is part of why: the same build unfiltered may paint.
  if (weightsBone !== undefined) {
    for (const [bi, b] of builds.entries()) {
      if (!weighted[bi]) notes.push(`weights: bone "${weightsBone}" weights no vertex of any region or mesh${request.slotFilter === undefined ? '' : ' of the slots the filter keeps'} ${compare ? `build ${b.tag} ` : ''}shows here — nothing painted`);
    }
  }
  if ((request.show.includes('mesh') || request.show.includes('hull')) && !anyMesh) notes.push(`mesh/hull: no slot${request.slotFilter === undefined ? '' : ' the filter keeps'} shows a mesh here — nothing drawn for it`);
  const legend: InspectLegend = {
    spec: INSPECT_SPEC,
    poser: builds[0].poser,
    show: showSpelled(request, weightsBone),
    dim: request.dim,
    ...(request.skin === undefined ? {} : { skin: request.skin }),
    animation: request.animation,
    fps: request.fps,
    framing,
    ...(request.boneFilter === undefined
      ? {}
      : { boneFilter: { include: request.boneFilter.include === undefined ? null : [...request.boneFilter.include], exclude: request.boneFilter.exclude === undefined ? null : [...request.boneFilter.exclude] } }),
    ...(request.slotFilter === undefined
      ? {}
      : { slotFilter: { include: request.slotFilter.include === undefined ? null : [...request.slotFilter.include], exclude: request.slotFilter.exclude === undefined ? null : [...request.slotFilter.exclude] } }),
    ...(weightsBone === undefined
      ? {}
      : {
          weights: {
            bone: weightsBone,
            ramp: WEIGHT_RAMP.map((s) => ({ weight: s.weight, rgba: [...s.rgba] })),
            floor: WEIGHT_FLOOR,
            reading:
              "a pixel is painted when its centre lies in a triangle of a region or mesh: the ramp's colour at the barycentric blend of " +
              "the triangle's corners' weights for the bone, each channel rounded, linear between the stops; below floor it is not painted. " +
              "Each vertex's weight is in its tile's meshes[].weights, read off skeleton.json",
          },
        }),
    ...(request.show.includes('density')
      ? {
          density: {
            ramp: DENSITY_RAMP.map((s) => ({ ratio: s.ratio, rgba: [...s.rgba] })),
            scale:
              "log2: a ratio's colour is interpolated in log2(ratio) between the two stops either side, each channel rounded; " +
              `at or below ${DENSITY_RAMP[0].ratio} and at or above ${DENSITY_RAMP[DENSITY_RAMP.length - 1].ratio} it is the end stop's. ` +
              '1, as dense as the figure, is the neutral grey',
            area:
              "a part's area is its posed mesh's own: the sum of its triangles' absolute areas in world units², through the vertices " +
              "the pose carries — not the image's box and not its alpha. A region is two triangles over its quad",
            totals:
              "the figure's are over EVERY slot whose attachment at the pose is a region or mesh — whatever --overlay-slot and " +
              '--hide-overlay-slot keep, whatever its alpha, wherever it lies against the box drawn',
            ratio:
              "a part's triangles per world unit² over the figure's (Σ triangles / Σ area): 2 is twice as dense as the figure, 0.5 " +
              "half. null where a part's posed area is 0, with why",
            reading:
              "each kept part is filled with its ratio's colour — every pixel whose centre lies in one of its triangles — in the " +
              "posed draw order, so where parts overlap the pixel is the part drawn last, as in the art. Each tile's density " +
              "states the figure and every kept part's row, in draw order",
          },
        }
      : {}),
    ...(compare ? { builds: builds.map((b) => ({ build: b.tag, poser: b.poser, skeletonSha256: b.sha })) } : {}),
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

interface TilePlace {
  x0: number;
  y0: number;
  viewport: Viewport;
  sheet: boolean;
  compare: boolean;
  weightsBone: string | undefined;
  /** The picture's first tile — the one whose notes are printed, so a sheet says a thing once. */
  first: boolean;
}

/** One tile: one build at one pose, drawn on its own plate in tile pixels, and its legend in picture pixels. */
function drawTile(
  build: Gathered,
  pose: { frame: Frame; index: number },
  filtered: Map<string, string>,
  slotsOut: ReadonlySet<string>,
  place: TilePlace,
  request: InspectRequest,
  plant: InspectPlant,
  notes: string[],
): { tile: Plate; legend: LegendTile; weighted: boolean; anyMesh: boolean } {
  const { frame, index } = pose;
  const { x0, y0, viewport } = place;
  const { width, height, scale } = viewport;
  const first = place.first;
  const [shiftX, shiftY] = plant.overlayShift ?? [0, 0];
  const [lieX, lieY] = plant.legendShift ?? [0, 0];
  // ⭐ The one projection both the picture and the legend read: continuous pixels in the whole picture.
  const toPixel = (wx: number, wy: number): [number, number] => [
    x0 + (wx - viewport.minX) * scale,
    y0 + (plant.unflipped ? wy - viewport.minY : viewport.maxY - wy) * scale,
  ];
  const point = (wx: number, wy: number): LegendPoint => {
    const [px, py] = toPixel(wx, wy);
    return { world: [wx, wy], pixel: [px + lieX, py + lieY] };
  };
  const tile = request.show.includes('art') ? renderFrame(frame, build.pages, viewport, BACKGROUND) : filled(width, height, BACKGROUND);
  if (request.dim) {
    for (let p = 0; p < tile.data.length; p += 4) {
      for (let c = 0; c < 3; c++) tile.data[p + c] = Math.round(255 - (255 - tile.data[p + c]) * DIM_KEEP);
    }
  }
  // Drawn on the tile in tile pixels; `tx`/`ty` take a picture pixel back to the tile's.
  const tx = (px: number): number => px - x0;
  const ty = (py: number): number => py - y0;
  const legendTile: LegendTile = {
    ...(place.compare ? { build: build.tag } : {}),
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
  // ── what a bone moves: weights under the edges, the edges under the hull ──
  let weighted = false;
  let anyMesh = false;
  // ── density: each kept part filled with its ratio's colour, under the heat and the edges ──
  if (build.rest !== null && build.weights !== null && request.show.includes('density')) {
    const shownAll = frame.attachments ?? [];
    const density = densityAt(shownAll, build.rest, build.weights, build.bones.map((b) => b.name), slotsOut, plant);
    legendTile.density = density;
    for (const row of density.slots) {
      const shown = shownAll[row.order];
      const rest = build.rest.get(restKey(shown.slot, shown.attachment));
      if (rest === undefined || row.rgba === null) continue;
      const rgba = row.rgba as RGBA;
      const at = (v: number): [number, number] => {
        const [px, py] = toPixel(shown.vertices[2 * v], shown.vertices[2 * v + 1]);
        return [tx(px), ty(py)];
      };
      for (let t = 0; t + 2 < rest.triangles.length; t += 3) fillTriangle(tile, [at(rest.triangles[t]), at(rest.triangles[t + 1]), at(rest.triangles[t + 2])], rgba);
    }
    if (first) {
      const f = density.figure;
      const fmt = (n: number): string => String(Number(n.toPrecision(4)));
      if (f.trianglesPerArea === null) notes.push(`density: ${f.why ?? ''} — nothing painted`);
      else {
        const by = density.slots.filter((r) => r.ratio !== null).sort((p, q) => (q.ratio ?? 0) - (p.ratio ?? 0) || p.order - q.order);
        const at = (r: LegendDensitySlot): string => `"${r.slot}" at ${fmt(r.ratio ?? 0)}x`;
        const ends =
          by.length === 0 ? '' : by.length === 1 ? `; the one listed, ${at(by[0])}` : `; of the ${density.slots.length} listed, the densest ${at(by[0])}, the sparsest ${at(by[by.length - 1])}`;
        notes.push(`density: the figure is ${f.triangles} triangles over ${Number(f.area.toFixed(2))} world units² across ${f.slots} slots${ends} — every row is in the legend`);
        const unrated = density.slots.filter((r) => r.ratio === null);
        if (unrated.length > 0) notes.push(`density: no ratio for ${unrated.map((r) => `"${r.slot}"`).join(', ')} — ${unrated[0].why ?? ''}`);
      }
    }
  }
  if (build.rest !== null) {
    legendTile.meshes = [];
    const [mx, my] = plant.meshShift ?? [0, 0];
    for (const shown of frame.attachments ?? []) {
      if (slotsOut.has(shown.slot)) continue;
      const rest = build.rest.get(restKey(shown.slot, shown.attachment));
      const vertexCount = shown.vertices.length / 2;
      if (rest === undefined || rest.vertices.length !== shown.vertices.length) {
        throw new Error(
          `slot "${shown.slot}" attachment "${shown.attachment}": the rest table ${rest === undefined ? 'has no entry for it' : `states ${rest.vertices.length / 2} vertices`}, the pose ${vertexCount} — the poser disagrees with itself`,
        );
      }
      const pixel: number[] = [];
      for (let v = 0; v < shown.vertices.length; v += 2) pixel.push(...toPixel(shown.vertices[v], shown.vertices[v + 1]));
      const at = (v: number): [number, number] => [tx(pixel[2 * v]), ty(pixel[2 * v + 1])];
      const edges = edgesOf(rest.triangles);
      const entry: LegendMesh = {
        slot: shown.slot,
        attachment: shown.attachment,
        kind: rest.kind,
        vertexCount,
        triangleCount: rest.triangles.length / 3,
        hull: rest.kind === 'mesh' ? (rest.hull ?? null) : null,
        edges,
        world: [...shown.vertices],
        pixel,
      };
      if (place.weightsBone !== undefined && build.weights !== null) {
        const read = build.weights(shown.slot, shown.attachment);
        if (typeof read === 'string') throw new InspectError(`--show weights:${place.weightsBone}: ${read}`);
        if (read.length !== vertexCount) {
          throw new InspectError(`--show weights:${place.weightsBone}: slot "${shown.slot}" attachment "${shown.attachment}" — skeleton.json weights ${read.length} vertices, the pose has ${vertexCount}`);
        }
        const bone = place.weightsBone;
        const weights = read.map((run) => run.reduce((sum, [name, w]) => (name === bone ? sum + w : sum), 0));
        entry.weights = weights;
        if (weights.some((w) => w >= WEIGHT_FLOOR)) weighted = true;
        for (let t = 0; t + 2 < rest.triangles.length; t += 3) {
          const corners = [rest.triangles[t], rest.triangles[t + 1], rest.triangles[t + 2]];
          heatTriangle(tile, corners.map(at), corners.map((v) => weights[v]));
        }
      }
      legendTile.meshes.push(entry);
    }
    for (const entry of legendTile.meshes) {
      if (entry.kind !== 'mesh') continue;
      anyMesh = true;
      const at = (v: number): [number, number] => [tx(entry.pixel[2 * v]) + mx, ty(entry.pixel[2 * v + 1]) + my];
      if (request.show.includes('mesh')) {
        for (const [p, q] of entry.edges) line(tile, ...at(p), ...at(q), colour('mesh'));
      }
      if (request.show.includes('hull')) {
        const hull = entry.hull ?? 0;
        const ring: Array<[number, number]> = plant.hullAllEdges ? entry.edges : Array.from({ length: hull }, (_, i): [number, number] => [i, (i + 1) % hull]);
        for (const [p, q] of ring) line(tile, ...at(p), ...at(q), colour('hull'));
      }
    }
  }
  const snapshots = new Map<string, BoneSnapshot>((frame.bones ?? []).map((b) => [b.name, b]));
  const isPosed = (b: BoneSnapshot | undefined): b is BoneSnapshot => b !== undefined && !(b.a === 0 && b.b === 0 && b.c === 0 && b.d === 0);
  const held = new Set<string>();
  if (request.show.includes('declared')) {
    legendTile.declared = [];
    for (const axis of build.axes) {
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
      if (entry.why !== null && first) notes.push(`declared: axis "${axis.name}" — ${entry.why}`);
      legendTile.declared.push(entry);
    }
    if (build.axes.length === 0 && first) notes.push('declared: the rig declares no invariants.axes — nothing drawn for it');
  }
  // Every bone, in declaration order — drawn or not, so the legend names each.
  const drawn: Array<{ bone: LegendBone; o: [number, number]; t: [number, number] }> = [];
  for (const declared of build.bones) {
    const s = snapshots.get(declared.name);
    const length = build.lengths.get(declared.name) ?? 0;
    const posedBone = isPosed(s);
    const left = filtered.get(declared.name);
    const ox = s?.worldX ?? 0;
    const oy = s?.worldY ?? 0;
    const bone: LegendBone = {
      name: declared.name,
      parent: declared.parent,
      length,
      zeroLength: length === 0,
      undrawn: !posedBone ? 'its world matrix is 0 at this time — unposed by the skin, or a scale of 0' : (left ?? null),
      origin: point(ox, oy),
      tip: point(ox + length * (s?.a ?? 0), oy + length * (s?.c ?? 0)),
    };
    const shows = posedBone && left === undefined;
    if (shows && request.show.includes('axes')) {
      const unit = AXIS_PIXELS / scale;
      bone.axes = { x: point(ox + s.a * unit, oy + s.c * unit), y: point(ox + s.b * unit, oy + s.d * unit) };
    }
    legendTile.bones.push(bone);
    if (shows) drawn.push({ bone, o: toPixel(ox, oy), t: toPixel(bone.tip.world[0], bone.tip.world[1]) });
  }
  // Lines, then axes, then slot numbers and names, then the marks — so a mark is never covered.
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
  // ── labels: slot numbers, then names, placed in one pass so neither overprints the other ──
  const taken: PixelBox[] = [];
  const avoid = plant.noAvoid !== true;
  const toPicture = (b: PixelBox): PixelBox => ({ x: b.x + x0, y: b.y + y0, width: b.width, height: b.height });
  const writes: Array<() => void> = [];
  const leader = (ax: number, ay: number, box: PixelBox): void => line(tile, ax + 0.5, ay + 0.5, box.x - 0.5, box.y + Math.floor(box.height / 2) + 0.5, colour('leader'));
  if (request.show.includes('slots')) {
    legendTile.slots = [];
    const shown = frame.attachments ?? [];
    for (const [i, att] of shown.entries()) {
      // A left-out slot keeps its place: a number is the slot's place in the whole draw order, filtered or not.
      if (slotsOut.has(att.slot)) continue;
      const order = plant.slotsReversed ? shown.length - 1 - i : i;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let v = 0; v + 1 < att.vertices.length; v += 2) {
        minX = Math.min(minX, att.vertices[v]);
        maxX = Math.max(maxX, att.vertices[v]);
        minY = Math.min(minY, att.vertices[v + 1]);
        maxY = Math.max(maxY, att.vertices[v + 1]);
      }
      const anchor = point((minX + maxX) / 2, (minY + maxY) / 2);
      const [apx, apy] = toPixel((minX + maxX) / 2, (minY + maxY) / 2);
      const [ax, ay] = [Math.floor(tx(apx)), Math.floor(ty(apy))];
      const label = String(order);
      const w = textWidth(label, 1) + 2;
      const h = GLYPH_H + 2;
      const placed = placeLabel({ x: ax - Math.floor(w / 2), y: ay - Math.floor(h / 2), width: w, height: h }, taken, avoid);
      writes.push(() => {
        if (placed.moved) leader(ax, ay, placed.box);
      });
      writes.push(() => {
        for (let y = placed.box.y; y < placed.box.y + h; y++) for (let x = placed.box.x; x < placed.box.x + w; x++) put(tile, x, y, colour('slotBack'));
        text(tile, label, placed.box.x + 1, placed.box.y + 1, colour('slot'));
      });
      const slotBone = build.slots.find((s) => s.name === att.slot)?.bone;
      if (slotBone === undefined) throw new Error(`slot "${att.slot}" shows an attachment and is not in the poser's slot list — the poser disagrees with itself`);
      legendTile.slots.push({
        order,
        slot: att.slot,
        attachment: att.attachment,
        bone: slotBone,
        anchor,
        box: toPicture(placed.box),
        moved: placed.moved,
        overlaps: placed.overlaps,
      });
    }
    legendTile.slots.sort((p, q) => p.order - q.order);
  }
  if (request.show.includes('names')) {
    // ⭐ One label per pixel. What overprints is two labels starting on one pixel — a `_ctl` and its child, a chain's
    // joint — and the pixel is the unit of that, not the world origin: two origins 0.3 px apart overprint as surely as
    // two that coincide, and two that coincide always share a pixel.
    legendTile.labels = [];
    const groups = new Map<string, { anchor: [number, number]; bones: string[] }>();
    for (const { bone, o } of drawn) {
      const [ax, ay] = at(o);
      const anchor: [number, number] = [Math.floor(ax), Math.floor(ay)];
      const key = plant.noFold ? `${anchor[0]},${anchor[1]},${bone.name}` : `${anchor[0]},${anchor[1]}`;
      const group = groups.get(key) ?? { anchor, bones: [] };
      group.bones.push(bone.name);
      groups.set(key, group);
    }
    for (const { anchor, bones } of groups.values()) {
      const label = bones.length > 1 ? `${bones[0]} +${bones.length - 1}` : bones[0];
      const placed = placeLabel({ x: anchor[0] + 4, y: anchor[1] + 3, width: textWidth(label, 1), height: GLYPH_H }, taken, avoid);
      writes.push(() => {
        if (placed.moved) leader(anchor[0], anchor[1], placed.box);
      });
      writes.push(() => text(tile, label, placed.box.x, placed.box.y, colour('name')));
      legendTile.labels.push({
        text: label,
        bones,
        anchor: [anchor[0] + x0, anchor[1] + y0],
        box: toPicture(placed.box),
        moved: placed.moved,
        overlaps: placed.overlaps,
      });
    }
  }
  // Every leader first, then every label, so no leader crosses a label's text.
  for (const w of writes.filter((_, i) => i % 2 === 0)) w();
  for (const w of writes.filter((_, i) => i % 2 === 1)) w();
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
  if (place.sheet || place.compare) {
    const when = request.animation === null ? 'setup' : `t=${legendTile.time.toFixed(3)} f${index}`;
    const label = place.compare ? `${build.tag} ${build.poser}${place.sheet ? ` ${when}` : ''}` : when;
    const ly = height - GLYPH_H - 2;
    const box: PixelBox = { x: 1, y: ly - 1, width: textWidth(label, 1) + 2, height: GLYPH_H + 2 };
    for (let y = box.y; y < box.y + box.height; y++) for (let x = box.x; x < box.x + box.width; x++) put(tile, x, y, BACKGROUND);
    text(tile, label, 2, ly, colour('label'));
    legendTile.label = { text: label, box: toPicture(box) };
  }
  return { tile, legend: legendTile, weighted, anyMesh };
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
