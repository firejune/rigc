/**
 * Which triangles of a posed mesh are turned over — the fold reading behind
 * `rigc render --folds` and `rigc inspect --show folds` (issue #1383).
 *
 * ⭐ **A reading, not a gate.** A mesh can fold — a triangle flipping over under
 * a bend — on a build that passes every assertion and every check, and until
 * this it was found by a person looking at the right frame. Whether a fold is
 * acceptable is the consumer's: a tassel that swings past 90° folds honestly.
 * So this names the triangles and the frames and decides nothing.
 *
 * ## What "folded" means here
 *
 * A triangle is folded at a frame when its orientation there — the sign of its
 * signed area in world space — is the opposite of its orientation at the setup
 * pose. The setup pose is the rest table's (`AttachmentRest.vertices`: the setup
 * pose's bones with no deform, the table `render --geometry` writes as `rest`),
 * so an attachment a slot only swaps to later has a reference too.
 *
 * A triangle that is already wrong at the setup pose is reported once as that
 * and never counted as folding, because "opposite to the setup pose" says
 * nothing about it:
 *
 * - **degenerate** — thinner than the posed numbers resolve (`DEGENERATE_SHARE`
 *   below), in world space or in its UVs, so it has no orientation to keep;
 * - **inverted** — its texture is drawn mirrored against the rest of its mesh:
 *   the sign of world area × UV area is the opposite of the mesh's own sense,
 *   which is the sign of that product summed over its triangles, weighted by
 *   world area. Read through the UVs rather than the index order because the
 *   format does not fix a winding: a mesh whose triangles are listed in mixed
 *   orders is drawn correctly, and a winding test would call half of it folded.
 *
 * A triangle that is degenerate at a frame — collapsed to a line by the pose —
 * is not counted at that frame either: the sign of a zero area is the rounding's,
 * not the pose's.
 *
 * A mesh mirrored whole by a negative scale reads every triangle as folded: that
 * is what "opposite to the setup pose" is, and the count says which it was.
 *
 * ## Where and how big (issue #1386)
 *
 * Each folded frame also carries the world box of its folded triangles' posed
 * vertices and their summed setup-pose area, alone and as a share of the mesh's
 * — `foldExtent` says why the box is the frame's and the area the setup pose's.
 *
 * Pure: no clock, no randomness, no runtime. The posed vertices are handed in by
 * whichever poser drew the frames (rigc's core for a rigc build).
 */

/** The fold file's name inside an animation's frame directory, and its format tag. */
export const FOLDS_FILE = 'folds.json';
export const FOLDS_SPEC = 'rigc-folds/1';

/**
 * A triangle is degenerate when its height over its longest edge is at most
 * this share of the largest coordinate magnitude its attachment holds at that
 * pose (world units, or UV units for the UV triangle).
 *
 * 2⁻³⁰ ≈ 9.3e-10, chosen between two bounds that are both stated rather than
 * tuned:
 *
 * - **above the rounding**: a posed coordinate is a chain of bone transforms in
 *   doubles, each step rounding by half an ulp (2⁻⁵³) of numbers no larger than
 *   a few times the coordinate. 2⁻³⁰ is 2²³ ulps — eight million steps of
 *   headroom — so a sign this flags is never one a different rounding could
 *   have given the other way;
 * - **below anything drawn**: on a rig 10⁴ world units across it is 1e-5 world
 *   units, a hundred-thousandth of a pixel at one pixel per unit, so no triangle
 *   a picture can show is called degenerate.
 *
 * Relative to the attachment's own magnitude because the rounding is: a mesh at
 * 3,200 units from its origin carries 3,200 times the absolute noise of one at 1.
 */
export const DEGENERATE_SHARE = 2 ** -30;

/** The rest geometry the reading needs: the triangles, the UVs and the setup pose's vertices. */
export interface FoldRest {
  slot: string;
  attachment: string;
  kind: 'region' | 'mesh';
  vertices: readonly number[];
  triangles: readonly number[];
  uvs?: readonly number[];
}

/** One posed attachment: its slot, its name, its world vertices `x, y` per vertex. */
export interface FoldPose {
  slot: string;
  attachment: string;
  vertices: readonly number[];
}

/** One sampled frame: its index on the grid, its time and every attachment it shows. */
export interface FoldFrame {
  index: number;
  time: number;
  attachments: readonly FoldPose[];
}

/** A mesh's triangles that are wrong at the setup pose — reported once, never counted. */
export interface SetupFaults {
  /** Thinner than the posed numbers resolve, in world space or in the UVs — by triangle index. */
  degenerate: number[];
  /** Drawn mirrored against the rest of its mesh at the setup pose — by triangle index. */
  inverted: number[];
}

/** A world box `[minX, minY, maxX, maxY]`, world units, y up. */
export type FoldBox = [number, number, number, number];

/** Where a set of folded triangles is at one pose, and how big they are (issue #1386). */
export interface FoldExtent {
  /** The world box of the folded triangles' vertices as posed at this frame — every vertex of each, nothing else. */
  box: FoldBox;
  /** Their summed area at the setup pose, world units² — each triangle's unsigned area in the rest table. */
  area: number;
  /** `area` over the mesh's own setup-pose area (every triangle's, unsigned): the share of the mesh's art that is turned over. */
  share: number;
}

/** One frame on which a mesh has a folded triangle. */
export interface FoldedFrame extends FoldExtent {
  index: number;
  time: number;
  /** The folded triangles, by index (`triangles[3i..3i+2]` of the rest table), ascending. */
  triangles: number[];
}

/** One mesh's reading over one frame set. */
export interface MeshFolds {
  slot: string;
  attachment: string;
  /** How many triangles the mesh has. */
  triangleCount: number;
  /** The mesh's area at the setup pose, world units²: every triangle's unsigned area in the rest table, summed — what `share` is over. */
  area: number;
  setup: SetupFaults;
  /** Every frame with a folded triangle, in frame order; empty when the mesh never folds. */
  frames: FoldedFrame[];
  /** The frame with the most folded triangles — the earliest, on a tie — or `null` when it never folds. */
  worst: FoldedFrame | null;
  /** Every triangle folded on some frame, ascending. */
  folded: number[];
}

/** `folds.json`: one frame set's reading, every mesh any frame shows. */
export interface FoldsFile {
  spec: typeof FOLDS_SPEC;
  /** The animation, or `null` for a skeleton with none (its one frame is the setup pose). */
  animation: string | null;
  skin?: string;
  fps: number;
  /** What the numbers mean, stated in the file so a reader does not need this module. */
  reading: { folded: string; degenerate: string; inverted: string; index: string; box: string; area: string };
  /** Every mesh any frame of the set shows, in the order the rest table lists them. */
  meshes: MeshFolds[];
}

/**
 * A planted defect, for the suite's mutants only (`FO` controls in
 * `selftest.ts`). Production passes none.
 */
export interface FoldPlant {
  /** Count a triangle whose sign AGREES with the setup pose's, rather than the one opposite it. */
  signFlipped?: boolean;
  /** Read each frame against the frame before it — a flip detector — rather than against the setup pose. */
  againstPreviousFrame?: boolean;
  /** Count the setup pose's degenerate and inverted triangles like any other. */
  countSetupFaults?: boolean;
  /** Box every vertex of the mesh at the frame, rather than the folded triangles' vertices. */
  boxWholeMesh?: boolean;
  /** Size the folded triangles by their unsigned area as posed at the frame, rather than at the setup pose. */
  areaPosed?: boolean;
}

/** Twice the signed area of triangle `t` in `xy` (`x, y` per vertex). */
function cross2(xy: readonly number[], triangles: readonly number[], t: number): number {
  const a = triangles[3 * t] * 2;
  const b = triangles[3 * t + 1] * 2;
  const c = triangles[3 * t + 2] * 2;
  return (xy[b] - xy[a]) * (xy[c + 1] - xy[a + 1]) - (xy[c] - xy[a]) * (xy[b + 1] - xy[a + 1]);
}

/** The longest edge of triangle `t` in `xy`. */
function longestEdge(xy: readonly number[], triangles: readonly number[], t: number): number {
  const ids = [triangles[3 * t] * 2, triangles[3 * t + 1] * 2, triangles[3 * t + 2] * 2];
  let most = 0;
  for (const [i, j] of [[0, 1], [1, 2], [2, 0]] as const) {
    const dx = xy[ids[j]] - xy[ids[i]];
    const dy = xy[ids[j] + 1] - xy[ids[i] + 1];
    most = Math.max(most, Math.sqrt(dx * dx + dy * dy));
  }
  return most;
}

/** The largest coordinate magnitude in `xy` — what the rounding of every number in it is relative to. */
function magnitude(xy: readonly number[]): number {
  let most = 0;
  for (const v of xy) most = Math.max(most, Math.abs(v));
  return most;
}

/**
 * The sign of triangle `t`'s area in `xy`: +1, −1, or 0 when it is degenerate
 * — its height over its longest edge at most `DEGENERATE_SHARE` of `scale`.
 */
function orientation(xy: readonly number[], triangles: readonly number[], t: number, scale: number): -1 | 0 | 1 {
  const twice = cross2(xy, triangles, t);
  const edge = longestEdge(xy, triangles, t);
  if (edge === 0 || Math.abs(twice) / edge <= DEGENERATE_SHARE * scale) return 0;
  return twice > 0 ? 1 : -1;
}

/** A mesh's setup reading: each triangle's world sign at the setup pose, and the triangles reported as setup faults. */
export interface SetupReading {
  /** Per triangle: +1 or −1, its world sign at the setup pose; 0 for a setup fault (never counted). */
  signs: Int8Array;
  faults: SetupFaults;
}

/** The setup reading of one mesh — see the module comment for what degenerate and inverted mean. */
export function setupReading(rest: FoldRest, plant: FoldPlant = {}): SetupReading {
  const count = Math.floor(rest.triangles.length / 3);
  const signs = new Int8Array(count);
  const world: number[] = [];
  const uvSigns: number[] = [];
  const worldScale = magnitude(rest.vertices);
  const uvs = rest.uvs ?? [];
  const uvScale = magnitude(uvs);
  let sense = 0;
  const degenerate: number[] = [];
  for (let t = 0; t < count; t++) {
    const w = orientation(rest.vertices, rest.triangles, t, worldScale);
    const u = uvs.length === rest.vertices.length ? orientation(uvs, rest.triangles, t, uvScale) : 1;
    world.push(w);
    uvSigns.push(u);
    if (w === 0 || u === 0) {
      degenerate.push(t);
      continue;
    }
    sense += w * u * Math.abs(cross2(rest.vertices, rest.triangles, t));
  }
  const inverted: number[] = [];
  for (let t = 0; t < count; t++) {
    if (world[t] === 0 || uvSigns[t] === 0) continue;
    // A mesh whose two senses weigh exactly the same has no rest to be inverted against: none is flagged.
    if (sense !== 0 && Math.sign(world[t] * uvSigns[t]) !== Math.sign(sense)) {
      inverted.push(t);
      continue;
    }
    signs[t] = world[t];
  }
  if (plant.countSetupFaults) {
    for (let t = 0; t < count; t++) signs[t] = world[t] === 0 ? 1 : world[t];
  }
  return { signs, faults: { degenerate, inverted } };
}

/** The triangles of one mesh folded at one pose, ascending — `vertices` posed, `setup` its setup reading. */
export function foldedAt(rest: FoldRest, setup: SetupReading, vertices: readonly number[], plant: FoldPlant = {}): number[] {
  if (vertices.length !== rest.vertices.length) {
    throw new Error(
      `slot "${rest.slot}" mesh "${rest.attachment}": the rest table states ${rest.vertices.length / 2} vertices, the pose ${vertices.length / 2} — the poser disagrees with itself`,
    );
  }
  const scale = magnitude(vertices);
  const out: number[] = [];
  for (let t = 0; t < setup.signs.length; t++) {
    const before = setup.signs[t];
    if (before === 0) continue;
    const now = orientation(vertices, rest.triangles, t, scale);
    if (now === 0) continue;
    if (plant.signFlipped ? now === before : now === -before) out.push(t);
  }
  return out;
}

/** A mesh's area at the setup pose: every triangle's unsigned area in the rest table, summed in index order. */
export function setupArea(rest: FoldRest): number {
  let area = 0;
  for (let t = 0; t < Math.floor(rest.triangles.length / 3); t++) area += Math.abs(cross2(rest.vertices, rest.triangles, t)) / 2;
  return area;
}

/**
 * Where `triangles` of one mesh are at one pose and how big they are: the world
 * box of their posed vertices, and their summed setup-pose area, alone and as a
 * share of `meshArea` (`setupArea(rest)`). `null` for no triangle.
 *
 * ⭐ The box is the pose's and the area is the setup pose's, on purpose. The box
 * answers "where is it in this frame" — it is what a picture is framed to. The
 * area answers "how much of the art is turned over", and a folded triangle's
 * posed area cannot: it passes through 0 at the frame the triangle turns, so one
 * triangle reads a different size on every frame it is folded and none of them
 * says how much art it carries.
 */
export function foldExtent(
  rest: FoldRest,
  vertices: readonly number[],
  triangles: readonly number[],
  meshArea: number,
  plant: FoldPlant = {},
): FoldExtent | null {
  if (triangles.length === 0) return null;
  const box: FoldBox = [Infinity, Infinity, -Infinity, -Infinity];
  const take = (v: number): void => {
    box[0] = Math.min(box[0], vertices[2 * v]);
    box[1] = Math.min(box[1], vertices[2 * v + 1]);
    box[2] = Math.max(box[2], vertices[2 * v]);
    box[3] = Math.max(box[3], vertices[2 * v + 1]);
  };
  if (plant.boxWholeMesh) for (let v = 0; v < vertices.length / 2; v++) take(v);
  let area = 0;
  for (const t of triangles) {
    if (!plant.boxWholeMesh) for (let k = 0; k < 3; k++) take(rest.triangles[3 * t + k]);
    area += Math.abs(cross2(plant.areaPosed ? vertices : rest.vertices, rest.triangles, t)) / 2;
  }
  return { box, area, share: meshArea > 0 ? area / meshArea : 0 };
}

const restKey = (slot: string, attachment: string): string => `${slot}\u0000${attachment}`;

/**
 * Every mesh's reading over one frame set: `rest` the rest table (regions are
 * skipped — a region is a quad and cannot fold), `frames` the frames as the
 * sampler returned them. A mesh any frame shows is read; one no frame shows is
 * not listed. Order is the rest table's, so one build reads in one order.
 */
export function foldsOf(rest: readonly FoldRest[], frames: readonly FoldFrame[], plant: FoldPlant = {}): MeshFolds[] {
  const shown = new Set<string>();
  for (const frame of frames) for (const a of frame.attachments) shown.add(restKey(a.slot, a.attachment));
  const out: MeshFolds[] = [];
  for (const r of rest) {
    if (r.kind !== 'mesh' || !shown.has(restKey(r.slot, r.attachment))) continue;
    let setup = setupReading(r, plant);
    const area = setupArea(r);
    const folded: FoldedFrame[] = [];
    const union = new Set<number>();
    for (const frame of frames) {
      const posed = frame.attachments.find((a) => a.slot === r.slot && a.attachment === r.attachment);
      if (posed === undefined) continue;
      const triangles = foldedAt(r, setup, posed.vertices, plant);
      if (plant.againstPreviousFrame) {
        const signs = Int8Array.from(setup.signs, (sign, t) => (triangles.includes(t) ? -sign : sign));
        setup = { ...setup, signs };
      }
      const extent = foldExtent(r, posed.vertices, triangles, area, plant);
      if (extent === null) continue;
      for (const t of triangles) union.add(t);
      folded.push({ index: frame.index, time: frame.time, triangles, ...extent });
    }
    let worst: FoldedFrame | null = null;
    for (const f of folded) if (worst === null || f.triangles.length > worst.triangles.length) worst = f;
    out.push({
      slot: r.slot,
      attachment: r.attachment,
      triangleCount: setup.signs.length,
      area,
      setup: setup.faults,
      frames: folded,
      worst,
      folded: [...union].sort((a, b) => a - b),
    });
  }
  return out;
}

/** What `folds.json` states its numbers mean — the one wording the file and the docs share. */
export const FOLDS_READING: FoldsFile['reading'] = {
  folded:
    "a triangle whose world orientation (the sign of its signed area) at the frame is the opposite of its orientation at the setup pose — the rest table's vertices, the setup pose's bones with no deform. A triangle degenerate at the frame is not counted there",
  degenerate: `a triangle whose height over its longest edge is at most ${DEGENERATE_SHARE} of the largest coordinate magnitude its attachment holds at that pose, in world space or in its UVs — thinner than the posed numbers resolve`,
  inverted:
    "a triangle drawn mirrored against the rest of its mesh at the setup pose: the sign of world area x UV area is the opposite of the mesh's own sense (that product summed over its triangles, weighted by world area). Setup faults are listed once and never counted as folds",
  index: 'a triangle is named by its index i in the rest table: vertices triangles[3i], triangles[3i+1], triangles[3i+2]',
  box: "a frame's box is [minX, minY, maxX, maxY] in world units (y up) over every vertex of that frame's folded triangles as posed there, and nothing else",
  area:
    "a frame's area is its folded triangles' unsigned areas at the setup pose (the rest table), summed, in world units²; share is that over the mesh's area, every triangle's unsigned setup-pose area summed. The setup pose's, not the frame's: a folded triangle's posed area passes through 0 as it turns, so it says how far the turn has gone rather than how much art is turned over",
};

/** The file for one frame set. */
export function foldsFileOf(animation: string | null, fps: number, skin: string | undefined, meshes: MeshFolds[]): FoldsFile {
  return { spec: FOLDS_SPEC, animation, ...(skin === undefined ? {} : { skin }), fps, reading: FOLDS_READING, meshes };
}

/** The file's text: two-space JSON and a newline, so one build and one request are one byte sequence. */
export function foldsText(file: FoldsFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** Ascending indices as runs: `[3, 4, 5, 9]` → `3-5, 9`. */
export function indexRuns(indices: readonly number[]): string {
  const runs: string[] = [];
  for (let i = 0; i < indices.length; ) {
    let j = i;
    while (j + 1 < indices.length && indices[j + 1] === indices[j] + 1) j++;
    runs.push(j === i ? String(indices[i]) : `${indices[i]}-${indices[j]}`);
    i = j + 1;
  }
  return runs.join(', ');
}

/** `x` rounded to hundredths away from the box's inside, so the printed box holds every vertex the exact one does. */
const outward = (x: number, up: boolean): string => ((up ? Math.ceil(x * 100) : Math.floor(x * 100)) / 100).toFixed(2);

/**
 * Where and how big, as the fold line and the inspect note print it:
 * `in world box x [x0, x1] y [y0, y1] (w × h), setup-pose area A units² = S% of the mesh's`.
 * The box is rounded outward to hundredths; the file states it exactly.
 */
export function extentText(extent: FoldExtent): string {
  const [x0, y0, x1, y1] = extent.box;
  return (
    `in world box x [${outward(x0, false)}, ${outward(x1, true)}] y [${outward(y0, false)}, ${outward(y1, true)}] ` +
    `(${(x1 - x0).toFixed(2)} × ${(y1 - y0).toFixed(2)}), setup-pose area ${extent.area.toFixed(2)} units² = ${(100 * extent.share).toPrecision(3)}% of the mesh's`
  );
}

/**
 * The printed line for a mesh that folds, or `null` for one that never does.
 * It names the animation, the mesh and its slot, the frames, the worst frame's
 * count, its triangles, where they are and how big, and every triangle folded
 * on any frame.
 */
export function foldLine(animation: string | null, fps: number, mesh: MeshFolds): string | null {
  const worst = mesh.worst;
  if (worst === null) return null;
  const where = animation === null ? 'the setup pose' : JSON.stringify(animation);
  const frames = mesh.frames.map((f) => f.index);
  return (
    `${where}: mesh "${mesh.attachment}" (slot "${mesh.slot}") folds on ${frames.length} frame(s) [${indexRuns(frames)}] at ${fps} fps; ` +
    `worst frame ${worst.index} (t=${worst.time.toFixed(4)}s): ${worst.triangles.length} of ${mesh.triangleCount} triangle(s) [${worst.triangles.join(', ')}] ` +
    `${extentText(worst)}; ` +
    `${mesh.folded.length} triangle(s) fold on some frame [${mesh.folded.join(', ')}]`
  );
}

/** The printed line for a mesh with setup faults, or `null` for one with none — printed once per run, not per animation. */
export function setupFaultLine(mesh: Pick<MeshFolds, 'slot' | 'attachment' | 'setup'>): string | null {
  const { degenerate, inverted } = mesh.setup;
  if (degenerate.length === 0 && inverted.length === 0) return null;
  const parts = [
    ...(degenerate.length === 0 ? [] : [`${degenerate.length} degenerate [${degenerate.join(', ')}]`]),
    ...(inverted.length === 0 ? [] : [`${inverted.length} inverted against the rest of the mesh [${inverted.join(', ')}]`]),
  ];
  return `mesh "${mesh.attachment}" (slot "${mesh.slot}") at the setup pose: triangle(s) ${parts.join('; ')} — reported here once and never counted as folding`;
}
