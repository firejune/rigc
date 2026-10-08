/**
 * The art-derived rasters one mesh measurement reads — every quantity of
 * `measureMeshQuality`'s raster rows (`src/meshquality.ts`) whose only input is
 * the art: the art bits at the threshold, the filled silhouette at both
 * background connectivities and each one's distance transform, the
 * 4-connected island labels, and the traced outline in drawing pixels.
 *
 * ## Why it is a value and not a cache
 *
 * `reduceMesh` measures one candidate per step against art that never changes
 * within the call, and recomputing these per step was nearly all of its cost
 * (issue #1240: 98.98 % of a 1101-step call's samples in the measurement, at
 * least 40 % in functions of the art alone). So the call takes them once, at
 * admission, and hands this object to every measurement it makes. There is no
 * module-level cache and no hidden state: the object is created by the caller,
 * passed explicitly, and dropped with the call. `measureMeshQuality` itself
 * makes a fresh one per call, so its behaviour is the uncached one.
 *
 * Each quantity is computed on first read and kept, so a measurement that
 * never reaches a row (a source that is not one loop, art under its sample
 * floor) computes no more than it did before. `tally` counts every
 * computation and every measurement handed the object — the count a control
 * reads to see that a reduction computed each quantity once.
 *
 * ## What it is taken at, and the refusal
 *
 * The object holds the `ArtInput` it was made from. A measurement handed it
 * for a different art is refused, not served stale numbers: the mask array,
 * the mask's size, the threshold and the frame's scale and size are each
 * compared, and a difference is `REDUCE_ART_RASTERS_MISMATCH` naming the field,
 * the value the rasters were taken at and the value the input requires
 * (`checkArtRasters`, `src/meshquality.ts`).
 *
 * Not re-exported by `src/mesh.ts`: nothing here is on `spine-rigc/mesh`.
 */
import { artOf, distancePassesOf, fillEnclosed, labelIslands, MeshError, pixelCentreInTriangle, prunePolygon, squaredDistanceToSet, traceAlphaOutline, triangleRasterBox } from './mesh.ts';
import type { ArtInput } from './meshquality.ts';

/** How many times each quantity was computed, and how many measurements were handed the object. */
export interface ArtRasterTally {
  /** Measurements that read the object (each after its own check). */
  uses: number;
  artBits: number;
  fills: number;
  toFilled8: number;
  toFilled4: number;
  islands: number;
  traced: number;
}

/** The traced art outline in drawing pixels, pruned — or the tracer's refusal, as its message. */
export type TracedArt = { outline: Array<[number, number]> } | { refused: string };

export interface ArtRasters {
  /** The art these were taken from: its mask array, size, threshold and frame. */
  readonly art: ArtInput;
  readonly tally: ArtRasterTally;
  /** `artOf(mask, threshold)`: 1 where alpha >= threshold. */
  artBits(): Uint8Array;
  /** The number of art pixels in `artBits()`. */
  artCount(): number;
  /** `fillEnclosed` of the art at both background connectivities, and whether they differ anywhere. */
  fills(): { fill8: Uint8Array; fill4: Uint8Array; differ: boolean };
  /** `squaredDistanceToSet` of the filled silhouette at one connectivity. */
  toFilled(connectivity: 4 | 8): Float64Array;
  /** `labelIslands` of the art: 4-connected labels, 1-based, and each island's size. */
  islands(): { label: Int32Array; sizes: number[] };
  /** `traceAlphaOutline` at the threshold, carried to drawing pixels by `pageScale` and pruned. */
  traced(): TracedArt;
}

/**
 * The rasters of one art, each computed on first read. Reads nothing at
 * construction, so it may be made before the art is validated; every reader
 * checks it against a validated input first.
 */
export function artRastersOf(art: ArtInput): ArtRasters {
  const tally: ArtRasterTally = { uses: 0, artBits: 0, fills: 0, toFilled8: 0, toFilled4: 0, islands: 0, traced: 0 };
  let bits: { bits: Uint8Array; count: number } | null = null;
  let fills: { fill8: Uint8Array; fill4: Uint8Array; differ: boolean } | null = null;
  let toFilled8: Float64Array | null = null;
  let toFilled4: Float64Array | null = null;
  let islands: { label: Int32Array; sizes: number[] } | null = null;
  let traced: TracedArt | null = null;
  const artBitsOf = (): { bits: Uint8Array; count: number } => {
    if (bits === null) {
      tally.artBits++;
      const b = artOf(art.mask, art.threshold);
      let count = 0;
      for (const bit of b) count += bit;
      bits = { bits: b, count };
    }
    return bits;
  };
  const fillsOf = (): { fill8: Uint8Array; fill4: Uint8Array; differ: boolean } => {
    if (fills === null) {
      tally.fills++;
      const { width: w, height: h } = art.mask;
      const b = artBitsOf().bits;
      const fill8 = fillEnclosed(b, w, h, 8).filled;
      const fill4 = fillEnclosed(b, w, h, 4).filled;
      let differ = false;
      for (let i = 0; i < fill8.length; i++) {
        if (fill8[i] !== fill4[i]) {
          differ = true;
          break;
        }
      }
      fills = { fill8, fill4, differ };
    }
    return fills;
  };
  return {
    art,
    tally,
    artBits: () => artBitsOf().bits,
    artCount: () => artBitsOf().count,
    fills: fillsOf,
    toFilled: (connectivity) => {
      const { width: w, height: h } = art.mask;
      if (connectivity === 8) {
        if (toFilled8 === null) {
          tally.toFilled8++;
          toFilled8 = squaredDistanceToSet(fillsOf().fill8, w, h);
        }
        return toFilled8;
      }
      if (toFilled4 === null) {
        tally.toFilled4++;
        toFilled4 = squaredDistanceToSet(fillsOf().fill4, w, h);
      }
      return toFilled4;
    },
    islands: () => {
      if (islands === null) {
        tally.islands++;
        islands = labelIslands(artBitsOf().bits, art.mask.width, art.mask.height);
      }
      return islands;
    },
    traced: () => {
      if (traced === null) {
        tally.traced++;
        const scale = art.frame.pageScale;
        try {
          const t = traceAlphaOutline(art.mask, art.threshold);
          traced = { outline: prunePolygon(t.outline.map(([x, y]): [number, number] => [x / scale, y / scale])) };
        } catch (err) {
          if (!(err instanceof MeshError)) throw err;
          traced = { refused: err.message };
        }
      }
      return traced;
    },
  };
}

/**
 * Overshoot and holes against one filled silhouette: the covered centre
 * outside it furthest from it (the first in pixel order among equals; −1 when
 * none) with its squared distance, and the covered centres inside it that are
 * not art — how many, and the first in pixel order (−1 when none).
 */
export interface SilhouetteReading {
  overAt: number;
  overSq: number;
  holes: number;
  holeAt: number;
}

/**
 * What one step's coverage reads, from either path: the covered pixel centres,
 * their distance transform, the covered art pixels, whether any centre is
 * covered, the uncovered art pixel furthest from the covered set (the first in
 * pixel order among equals; −1 when none) with its squared distance, the
 * silhouette reading at either connectivity, and the 4-connected art islands
 * the coverage touches — how many, and the second-smallest label among them
 * (0 when fewer than two).
 */
export interface CoverageReading {
  covered: Uint8Array;
  toCovered: Float64Array;
  coveredArt: number;
  anyCovered: boolean;
  undercut: { at: number; sq: number };
  silhouette(connectivity: 4 | 8): SilhouetteReading;
  islandsTouched: number;
  secondIsland: number;
}

/** How a step-rasters object came by each reading, and what it redid. */
export interface StepRasterTally {
  /** Coverage readings handed out. */
  readings: number;
  /** Readings built from nothing: the first, and any whose triangles differ from the last in more than they share. */
  rebuilt: number;
  /** Readings carried from the last one by the triangles that differ. */
  carried: number;
  /** Triangles drawn (taken away or added) by carried readings. */
  trianglesDrawn: number;
  /** Triangles a carried reading did not draw because the last reading held them already. */
  trianglesKept: number;
  /** Pixel centres whose coverage changed between readings. */
  pixelsFlipped: number;
  /** Columns and rows of the distance transform carried readings redid. */
  columnsRedone: number;
  rowsRedone: number;
  /** Outline deviations measured, and handed back because the outline and the polygon it is read against equal the last ones. */
  outlinesMeasured: number;
  outlinesReused: number;
  /** Point-to-edge distance lists an outline measurement asked for, and how each was had: handed back whole, carried edge by edge from the last list of the same point, or computed. */
  distanceLists: number;
  distanceListsReused: number;
  distanceListsCarried: number;
  /** Edges a carried list took from the last list of its point, and edges it computed because the edge is new. */
  edgesCarried: number;
  edgesComputed: number;
}

/**
 * A fault planted on purpose in the carried path, for the mesh-quality
 * controls to show they catch it: one added triangle not drawn, one changed
 * column or row of the distance transform not redone, or an outline reading
 * reused when only the vertex counts match. `reduceMesh` plants none.
 */
export type StepRasterPlant = 'skip-a-triangle' | 'skip-a-column' | 'skip-a-row' | 'stale-outline' | 'skip-an-edge';

/**
 * One outline slot's carried distances (`src/meshquality.ts`, `hausdorff`): a
 * directed Hausdorff reading asks, for points along one polygon, the distance
 * to every edge of the other, and those lists are kept from the last reading
 * of the slot by the point they were asked for, keyed by its exact
 * coordinates.
 *
 * - `toAgainst` — lists of distances to the edges of the polygon the outline
 *   is read against (fixed for a reduction). Kept while that polygon is equal;
 *   an entry not asked for by the last two readings is dropped.
 * - `toOutline` — lists of distances to the outline's own edges, which a step
 *   changes. Kept for the last reading's outline only, with its edges
 *   (`outlineEdges`, keyed by both ends), so the next reading copies each
 *   distance whose edge it still has and computes the rest.
 */
export interface OutlineMemo {
  against: Float64Array | null;
  toAgainst: Map<string, { list: Float64Array; used: number }>;
  outlineEdges: Map<string, number> | null;
  toOutline: Map<string, Float64Array>;
  readings: number;
}

/**
 * The per-step state of one reduction (issue #1246): the last coverage
 * reading and the last outline deviations, so the next measurement redoes only
 * what its mesh changed. Like `ArtRasters` it is a value made by the caller,
 * passed explicitly and dropped with the call; nothing is kept at module level.
 *
 * ## Why every reading equals the full one
 *
 * A reduction step changes the triangles of one vertex's link and nothing
 * else, yet the full measurement redraws every triangle and redoes the whole
 * distance transform. Here each quantity is carried from the last reading by a
 * rule under which it is the same function of the same input:
 *
 * - **Coverage** is held as a count per pixel centre of the triangles whose
 *   centre test (`triangleRasterBox`, `pixelCentreInTriangle` — the rule
 *   `rasteriseTriangles` reads) holds there. The triangles are compared with
 *   the last reading's as a multiset keyed by their three corners' exact
 *   coordinates in the order given (a zero's sign included); a triangle taken
 *   away is drawn with −1 and one added with +1, so every count is the exact
 *   number of triangles covering that centre, and a centre is covered exactly
 *   when its count is positive — `rasteriseTriangles`'s union.
 * - **The distance transform** is `squaredDistanceToSet`'s two passes
 *   (`distancePassesOf`). A column's pass reads that column of the coverage
 *   alone, so only columns holding a flipped centre are redone; a row's pass
 *   reads that row of the column results alone, so only rows where a redone
 *   column's value changed are redone. Every other value is the output of the
 *   same pass over the same input.
 * - **Covered art and islands** are integer counts updated at each flipped
 *   centre: art pixels covered, centres covered, and covered pixels per island
 *   label; the islands touched are the labels whose count is positive.
 * - **Outline deviations** (`outline`) are handed back only when the outline
 *   and the polygon it is read against are equal, coordinate by coordinate
 *   with a zero's sign, to the last ones of that slot — the same pure function
 *   of the same input.
 *
 * A reading whose triangles differ from the last in more triangles than they
 * share is built from nothing, as the first one is; which way a reading is
 * built changes its cost and never its values.
 */
export interface StepRasters {
  readonly rasters: ArtRasters;
  readonly tally: StepRasterTally;
  /** The coverage reading of these triangles over the drawing-pixel `points`; its arrays are valid until the next reading. */
  coverage(points: Array<[number, number]>, triangles: number[]): CoverageReading;
  /** The fault planted for a control, or null. */
  readonly plant: StepRasterPlant | null;
  /**
   * `measure(memo)`'s value, or the last one of `slot` when `outline` and
   * `against` equal the last ones exactly; `memo` is the slot's carried
   * distances, which `measure` reads and keeps current.
   */
  outline<T>(slot: string, outline: ReadonlyArray<readonly [number, number]>, against: ReadonlyArray<readonly [number, number]>, measure: (memo: OutlineMemo) => T): T;
}

/** A coordinate as a key: its shortest round-trip decimal, with a negative zero told from a positive one. */
function coordKey(v: number): string {
  return v === 0 && 1 / v < 0 ? '-0' : String(v);
}

/** Equal coordinate by coordinate, a zero's sign included. */
function samePolygon(a: ReadonlyArray<readonly [number, number]>, b: Float64Array): boolean {
  if (a.length * 2 !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i][0], b[i * 2]) || !Object.is(a[i][1], b[i * 2 + 1])) return false;
  return true;
}

function flat(p: ReadonlyArray<readonly [number, number]>): Float64Array {
  const out = new Float64Array(p.length * 2);
  for (let i = 0; i < p.length; i++) {
    out[i * 2] = p[i][0];
    out[i * 2 + 1] = p[i][1];
  }
  return out;
}

type Corners = [readonly [number, number], readonly [number, number], readonly [number, number]];

interface HeldTriangles {
  corners: Corners;
  n: number;
}

interface CoverageState {
  held: Map<string, HeldTriangles>;
  /** Triangles covering each pixel centre. */
  count: Int32Array;
  covered: Uint8Array;
  /** The column pass of the distance transform, and the transform. */
  columns: Float64Array;
  dist: Float64Array;
  coveredArt: number;
  coveredTotal: number;
  /** Covered pixels per island label (index 0 unused). */
  islandHits: Int32Array;
  islandsTouched: number;
  /** Art pixels not covered. */
  uncoveredArt: Set<number>;
  /** Per connectivity, once read: covered centres outside the filled silhouette, and covered centres inside it that are not art. */
  silhouettes: Map<4 | 8, { outside: Set<number>; holes: Set<number> }>;
}

/** Step rasters over `rasters`' art. Reads nothing until the first reading. */
export function stepRastersOf(rasters: ArtRasters, plant: StepRasterPlant | null = null): StepRasters {
  const tally: StepRasterTally = {
    readings: 0,
    rebuilt: 0,
    carried: 0,
    trianglesDrawn: 0,
    trianglesKept: 0,
    pixelsFlipped: 0,
    columnsRedone: 0,
    rowsRedone: 0,
    outlinesMeasured: 0,
    outlinesReused: 0,
    distanceLists: 0,
    distanceListsReused: 0,
    distanceListsCarried: 0,
    edgesCarried: 0,
    edgesComputed: 0,
  };
  const { width: w, height: h } = rasters.art.mask;
  let state: CoverageState | null = null;
  const outlines = new Map<string, { outline: Float64Array; against: Float64Array; value: unknown }>();
  const memos = new Map<string, OutlineMemo>();

  /** Add `sign` to the count of every centre the triangle covers, pushing each such centre to `touched`. */
  const draw = (count: Int32Array, corners: Corners, sign: number, touched: number[] | null): void => {
    const [a, b, c] = corners;
    const box = triangleRasterBox(a, b, c, w, h);
    if (box === null) return;
    for (let y = box.minY; y <= box.maxY; y++) {
      for (let x = box.minX; x <= box.maxX; x++) {
        if (!pixelCentreInTriangle(x, y, a, b, c, box.orient)) continue;
        count[y * w + x] += sign;
        if (touched !== null) touched.push(y * w + x);
      }
    }
  };

  const readingOf = (s: CoverageState): CoverageReading => {
    let second = 0;
    if (s.islandsTouched >= 2) {
      let seen = 0;
      for (let l = 1; l < s.islandHits.length; l++) {
        if (s.islandHits[l] > 0 && ++seen === 2) {
          second = l;
          break;
        }
      }
    }
    // The worst of a set by the full scan's rule: the largest value, the smallest index among equals.
    const worstOf = (set: Set<number>, value: Float64Array): { at: number; sq: number } => {
      let at = -1;
      let sq = 0;
      for (const i of set) {
        const v = value[i];
        if (at === -1 || v > sq || (v === sq && i < at)) {
          at = i;
          sq = v;
        }
      }
      return { at, sq };
    };
    const silhouette = (connectivity: 4 | 8): SilhouetteReading => {
      let sets = s.silhouettes.get(connectivity);
      if (sets === undefined) {
        const fills = rasters.fills();
        const filled = connectivity === 8 ? fills.fill8 : fills.fill4;
        const artBits = rasters.artBits();
        sets = { outside: new Set(), holes: new Set() };
        for (let i = 0; i < s.covered.length; i++) {
          if (!s.covered[i]) continue;
          if (!filled[i]) sets.outside.add(i);
          else if (!artBits[i]) sets.holes.add(i);
        }
        s.silhouettes.set(connectivity, sets);
      }
      const over = worstOf(sets.outside, rasters.toFilled(connectivity));
      let holeAt = -1;
      for (const i of sets.holes) if (holeAt === -1 || i < holeAt) holeAt = i;
      return { overAt: over.at, overSq: over.sq, holes: sets.holes.size, holeAt };
    };
    return {
      covered: s.covered,
      toCovered: s.dist,
      coveredArt: s.coveredArt,
      anyCovered: s.coveredTotal > 0,
      undercut: worstOf(s.uncoveredArt, s.dist),
      silhouette,
      islandsTouched: s.islandsTouched,
      secondIsland: second,
    };
  };

  const rebuild = (held: Map<string, HeldTriangles>): CoverageState => {
    tally.rebuilt++;
    const artBits = rasters.artBits();
    const { label, sizes } = rasters.islands();
    const count = new Int32Array(w * h);
    for (const { corners, n } of held.values()) for (let k = 0; k < n; k++) draw(count, corners, 1, null);
    const covered = new Uint8Array(w * h);
    const islandHits = new Int32Array(sizes.length + 1);
    let coveredArt = 0;
    let coveredTotal = 0;
    let islandsTouched = 0;
    const uncoveredArt = new Set<number>();
    for (let i = 0; i < covered.length; i++) {
      if (count[i] <= 0) {
        if (artBits[i]) uncoveredArt.add(i);
        continue;
      }
      covered[i] = 1;
      coveredTotal++;
      if (artBits[i]) coveredArt++;
      if (label[i] && islandHits[label[i]]++ === 0) islandsTouched++;
    }
    const passes = distancePassesOf(w, h);
    const columns = new Float64Array(w * h);
    for (let x = 0; x < w; x++) {
      const out = passes.column(covered, x);
      for (let y = 0; y < h; y++) columns[y * w + x] = out[y];
    }
    const dist = new Float64Array(w * h);
    for (let y = 0; y < h; y++) {
      const out = passes.row(columns, y);
      for (let x = 0; x < w; x++) dist[y * w + x] = out[x];
    }
    return { held, count, covered, columns, dist, coveredArt, coveredTotal, islandHits, islandsTouched, uncoveredArt, silhouettes: new Map() };
  };

  /** Carry `s` to the triangles `held` by drawing the ones that differ, then redo the distance transform where it changed. */
  const carry = (s: CoverageState, held: Map<string, HeldTriangles>, removed: Corners[], added: Corners[]): void => {
    tally.carried++;
    tally.trianglesDrawn += removed.length + added.length;
    const touched: number[] = [];
    for (const corners of removed) draw(s.count, corners, -1, touched);
    added.forEach((corners, k) => {
      if (plant === 'skip-a-triangle' && k === 0) return;
      draw(s.count, corners, 1, touched);
    });
    s.held = held;
    // Flip the centres whose count crossed zero, keeping the integer counts with them.
    const artBits = rasters.artBits();
    const { label } = rasters.islands();
    const fills = s.silhouettes.size > 0 ? rasters.fills() : null;
    const dirtyColumns = new Uint8Array(w);
    for (const i of touched) {
      const now = s.count[i] > 0 ? 1 : 0;
      if (now === s.covered[i]) continue;
      s.covered[i] = now;
      tally.pixelsFlipped++;
      dirtyColumns[i % w] = 1;
      const d = now === 1 ? 1 : -1;
      s.coveredTotal += d;
      if (artBits[i]) {
        s.coveredArt += d;
        if (now === 1) s.uncoveredArt.delete(i);
        else s.uncoveredArt.add(i);
      }
      for (const [connectivity, sets] of s.silhouettes) {
        if (now === 0) {
          sets.outside.delete(i);
          sets.holes.delete(i);
          continue;
        }
        const filled = connectivity === 8 ? fills!.fill8 : fills!.fill4;
        if (!filled[i]) sets.outside.add(i);
        else if (!artBits[i]) sets.holes.add(i);
      }
      const l = label[i];
      if (l) {
        const before = s.islandHits[l];
        s.islandHits[l] += d;
        if (before === 0) s.islandsTouched++;
        else if (s.islandHits[l] === 0) s.islandsTouched--;
      }
    }
    // Redo the columns holding a flipped centre, then the rows where a column value changed.
    const passes = distancePassesOf(w, h);
    const dirtyRows = new Uint8Array(h);
    let skipColumn = plant === 'skip-a-column';
    for (let x = 0; x < w; x++) {
      if (!dirtyColumns[x]) continue;
      if (skipColumn) {
        skipColumn = false;
        continue;
      }
      tally.columnsRedone++;
      const out = passes.column(s.covered, x);
      for (let y = 0; y < h; y++) {
        if (Object.is(s.columns[y * w + x], out[y])) continue;
        s.columns[y * w + x] = out[y];
        dirtyRows[y] = 1;
      }
    }
    let skipRow = plant === 'skip-a-row';
    for (let y = 0; y < h; y++) {
      if (!dirtyRows[y]) continue;
      if (skipRow) {
        skipRow = false;
        continue;
      }
      tally.rowsRedone++;
      const out = passes.row(s.columns, y);
      for (let x = 0; x < w; x++) s.dist[y * w + x] = out[x];
    }
  };

  return {
    rasters,
    tally,
    coverage: (points, triangles) => {
      tally.readings++;
      const held = new Map<string, HeldTriangles>();
      for (let t = 0; t + 2 < triangles.length; t += 3) {
        const corners: Corners = [points[triangles[t]], points[triangles[t + 1]], points[triangles[t + 2]]];
        const key = `${coordKey(corners[0][0])},${coordKey(corners[0][1])},${coordKey(corners[1][0])},${coordKey(corners[1][1])},${coordKey(corners[2][0])},${coordKey(corners[2][1])}`;
        const entry = held.get(key);
        if (entry === undefined) held.set(key, { corners, n: 1 });
        else entry.n++;
      }
      if (state === null) {
        state = rebuild(held);
        return readingOf(state);
      }
      // The multiset difference against the last reading's triangles.
      const removed: Corners[] = [];
      const added: Corners[] = [];
      let kept = 0;
      for (const [key, { corners, n }] of held) {
        const was = state.held.get(key)?.n ?? 0;
        kept += Math.min(was, n);
        for (let k = was; k < n; k++) added.push(corners);
      }
      for (const [key, { corners, n }] of state.held) {
        const now = held.get(key)?.n ?? 0;
        for (let k = now; k < n; k++) removed.push(corners);
      }
      if (removed.length + added.length > kept) {
        state = rebuild(held);
        return readingOf(state);
      }
      tally.trianglesKept += kept;
      carry(state, held, removed, added);
      return readingOf(state);
    },
    plant,
    outline: <T>(slot: string, outline: ReadonlyArray<readonly [number, number]>, against: ReadonlyArray<readonly [number, number]>, measure: (memo: OutlineMemo) => T): T => {
      const last = outlines.get(slot);
      if (last !== undefined) {
        const same =
          plant === 'stale-outline'
            ? last.outline.length === outline.length * 2 && last.against.length === against.length * 2
            : samePolygon(outline, last.outline) && samePolygon(against, last.against);
        if (same) {
          tally.outlinesReused++;
          return last.value as T;
        }
      }
      tally.outlinesMeasured++;
      let memo = memos.get(slot);
      if (memo === undefined) {
        memo = { against: null, toAgainst: new Map(), outlineEdges: null, toOutline: new Map(), readings: 0 };
        memos.set(slot, memo);
      }
      const value = measure(memo);
      outlines.set(slot, { outline: flat(outline), against: flat(against), value });
      return value;
    },
  };
}
