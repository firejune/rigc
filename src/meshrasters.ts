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
  /** Region pixel sets (`regionPixels`) computed, and handed back because the polygon equals one already read. */
  regionSetsComputed: number;
  regionSetsReused: number;
  /** Region polygons checked for a self-intersection (`polygonCrossing`), and checks handed back for an equal polygon. */
  polygonChecksComputed: number;
  polygonChecksReused: number;
  /** Region edge readings (`regionEdges`): an edge's answers carried from the last reading of its region, or computed. */
  regionEdgesCarried: number;
  regionEdgesComputed: number;
  /** Fill readings (`regionFill`): the region pixels in the hull handed back for an equal hull, carried by the hull edges that changed, or measured from nothing; and pixels measured again inside a changed hull's box. */
  fillHullsReused: number;
  fillHullsCarried: number;
  fillHullsMeasured: number;
  fillHullPixelsMeasured: number;
  /** Fill readings whose nearest-vertex distances were built from nothing, and pixels carried or measured again in the others. */
  fillNearestRebuilt: number;
  fillNearestCarried: number;
  fillNearestMeasured: number;
}

/**
 * A fault planted on purpose in the carried path, for the mesh-quality
 * controls to show they catch it: one added triangle not drawn, one changed
 * column or row of the distance transform not redone, an outline reading
 * reused when only the vertex counts match, or a region's art pixels handed
 * back, or a region polygon's self-intersection check handed back, for a
 * polygon that only has as many vertices as one read before, or a region
 * edge's answers carried from an edge that shares only its first end,
 * the region pixels near a changed hull edge not measured again, or a pixel's
 * nearest vertex kept after that vertex was removed. `reduceMesh` plants none.
 */
export type StepRasterPlant = 'skip-a-triangle' | 'skip-a-column' | 'skip-a-row' | 'stale-outline' | 'skip-an-edge' | 'stale-region' | 'stale-polygon-check' | 'stale-region-edge' | 'stale-fill-hull' | 'stale-fill-nearest';

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
 * - **A region's art pixels** (`regionPixels`, issue #1253) — the art pixels
 *   whose centre lies in a region's closed polygon, which `MQ_FILL_DISTANCE`
 *   reads — are a function of the art and the polygon alone, so a set is
 *   handed back whenever the polygon equals, coordinate by coordinate with a
 *   zero's sign, one already read through this object. A region polygon's
 *   self-intersection check (`polygonCrossing`), a function of the polygon
 *   alone, is handed back the same way.
 * - **A region's edge answers** (`regionEdges`, issue #1253) — whether an
 *   edge meets the closed polygon, and whether the region holds it and how far
 *   it lies — are functions of the edge's two ends and the region's polygon and
 *   band alone, so each is carried from the last reading of that region for an
 *   edge with both ends equal, coordinate by coordinate, in the same order.
 * - **A region's fill distances** (`regionFill`, issue #1253) — which of its
 *   art pixels lie in the hull, and each one's distance to the nearest vertex.
 *   Whether a pixel lies in the hull is measured again only inside the box of
 *   the hull edges that changed (directed, both ends exact), widened by
 *   `HULL_CARRY_MARGIN`: outside it the edges the two hulls share answer the
 *   same, a changed edge is further than the boundary tolerance, and the
 *   changed edges cross a horizontal ray from the pixel an even number of
 *   times between them — none when the pixel is right of, above or below the
 *   box, and when it is left of it, every changed edge that spans its row,
 *   whose count is even because the removed and added edges meet each vertex
 *   an even number of times — so the crossing parity is the last one's.
 *   A pixel's nearest distance is carried by the vertices that differ
 *   from the last reading's, compared as a multiset of exact coordinates: when
 *   the vertex that attained it is still there, the minimum over the vertices
 *   kept is the last minimum, and the new one is the smaller of it and the
 *   distances to the vertices added; when that vertex is gone, the pixel is
 *   measured again over every vertex. A minimum is exact, so either way it is
 *   the same number. A reading whose vertices differ from the last in more than
 *   they share is built from nothing.
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
  /**
   * `compute()`'s value — the art pixels, ascending, whose centre lies in the
   * closed `polygon` — or the set already computed for a polygon equal to it
   * coordinate by coordinate. The art is this object's, so the polygon is the
   * whole of the key.
   */
  regionPixels(polygon: ReadonlyArray<readonly [number, number]>, compute: () => Int32Array): Int32Array;
  /** `compute()`'s value — `findSelfIntersection` of `polygon` — or the one already computed for a polygon equal to it coordinate by coordinate. */
  polygonCrossing(polygon: ReadonlyArray<readonly [number, number]>, compute: () => [number, number] | null): [number, number] | null;
  /**
   * One reading's answers per edge for the region with this polygon and band:
   * `entry(a, b)` is the edge's record, carried from the last reading of the
   * region when an edge with the same two ends (exact coordinates, this order)
   * was read there, else empty for the caller to fill. Records not read again
   * are dropped at the next reading.
   */
  regionEdges(polygon: ReadonlyArray<readonly [number, number]>, transition: number): RegionEdgeReading;
  /** The region's fill reading, carried from the last one of the region with this polygon; valid until the next. */
  regionFill(polygon: ReadonlyArray<readonly [number, number]>, question: RegionFillQuestion): RegionFillReading;
}

/** A region edge's answers, as `src/meshquality.ts`'s `regionRows` reads them; a field absent is not yet computed. */
export interface RegionEdgeRecord {
  /** `segmentMeetsPolygon` of the edge against the closed polygon. */
  meets?: boolean;
  /** The edge's distance from the closed polygon when the region holds it (`edgeIsHeldByRegion`), else null. */
  held?: number | null;
}

export interface RegionEdgeReading {
  entry(a: readonly [number, number], b: readonly [number, number]): RegionEdgeRecord;
}

/**
 * How far beyond the box of a hull's changed edges a pixel centre must lie for
 * its answer to be carried, in the hull's units. Far larger than any rounding
 * of a crossing's abscissa and than the boundary tolerance the test reads.
 */
const HULL_CARRY_MARGIN = 1;

/** What `regionFill` is handed: the definitions it reads, which stay `src/meshquality.ts`'s. */
export interface RegionFillQuestion {
  /** The region's art pixels, ascending (`regionPixels`). */
  pixels: Int32Array;
  /** The centre of art pixel `i`, in the hull's units. */
  centre(i: number): readonly [number, number];
  hull: ReadonlyArray<readonly [number, number]>;
  points: ReadonlyArray<readonly [number, number]>;
  /** Does the centre of art pixel `i` lie in the closed hull? */
  inHull(i: number): boolean;
  /** The distance from the centre of art pixel `i` to `p`. */
  distance(i: number, p: readonly [number, number]): number;
}

/** The region pixels in the hull, ascending, and each one's distance to its nearest vertex. */
export interface RegionFillReading {
  inside: Int32Array;
  nearest: Float64Array;
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

/** One region's carried fill state: the pixels it was read for, the hull and the positions inside it, and per pixel the nearest vertex. */
interface FillSlot {
  polygon: Float64Array;
  pixels: Int32Array;
  /** The last hull's directed edges by both ends' exact coordinates, with their counts, and per pixel whether it lay in that hull. */
  hullEdges: Map<string, { a: readonly [number, number]; b: readonly [number, number]; n: number }> | null;
  inHull: Uint8Array;
  points: Map<string, { p: readonly [number, number]; n: number }> | null;
  nearest: Float64Array;
  nearX: Float64Array;
  nearY: Float64Array;
}

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
    regionSetsComputed: 0,
    regionSetsReused: 0,
    polygonChecksComputed: 0,
    polygonChecksReused: 0,
    regionEdgesCarried: 0,
    regionEdgesComputed: 0,
    fillHullsReused: 0,
    fillHullsCarried: 0,
    fillHullsMeasured: 0,
    fillHullPixelsMeasured: 0,
    fillNearestRebuilt: 0,
    fillNearestCarried: 0,
    fillNearestMeasured: 0,
  };
  const { width: w, height: h } = rasters.art.mask;
  let state: CoverageState | null = null;
  const outlines = new Map<string, { outline: Float64Array; against: Float64Array; value: unknown }>();
  const memos = new Map<string, OutlineMemo>();
  const regionSets: Array<{ polygon: Float64Array; pixels: Int32Array }> = [];
  const polygonChecks: Array<{ polygon: Float64Array; crossing: [number, number] | null }> = [];
  const regionEdgeSlots: Array<{ polygon: Float64Array; transition: number; last: Map<string, RegionEdgeRecord> }> = [];
  const fillSlots: FillSlot[] = [];

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
    regionPixels: (polygon, compute) => {
      const kept = regionSets.find((r) => (plant === 'stale-region' ? r.polygon.length === polygon.length * 2 : samePolygon(polygon, r.polygon)));
      if (kept !== undefined) {
        tally.regionSetsReused++;
        return kept.pixels;
      }
      tally.regionSetsComputed++;
      const pixels = compute();
      regionSets.push({ polygon: flat(polygon), pixels });
      return pixels;
    },
    polygonCrossing: (polygon, compute) => {
      const kept = polygonChecks.find((r) => (plant === 'stale-polygon-check' ? r.polygon.length === polygon.length * 2 : samePolygon(polygon, r.polygon)));
      if (kept !== undefined) {
        tally.polygonChecksReused++;
        return kept.crossing;
      }
      tally.polygonChecksComputed++;
      const crossing = compute();
      polygonChecks.push({ polygon: flat(polygon), crossing });
      return crossing;
    },
    regionFill: (polygon, q) => {
      let slot = fillSlots.find((r) => samePolygon(polygon, r.polygon));
      if (slot === undefined) {
        slot = { polygon: flat(polygon), pixels: q.pixels, hullEdges: null, inHull: new Uint8Array(0), points: null, nearest: new Float64Array(0), nearX: new Float64Array(0), nearY: new Float64Array(0) };
        fillSlots.push(slot);
      }
      const n = q.pixels.length;
      // The vertices, as a multiset of exact coordinates, against the last reading's.
      const keyOf = (p: readonly [number, number]): string => `${coordKey(p[0])},${coordKey(p[1])}`;
      const points = new Map<string, { p: readonly [number, number]; n: number }>();
      for (const p of q.points) {
        const k = keyOf(p);
        const e = points.get(k);
        if (e === undefined) points.set(k, { p, n: 1 });
        else e.n++;
      }
      const measure = (k: number): void => {
        let best = Infinity;
        let bx = NaN;
        let by = NaN;
        for (const p of q.points) {
          const d = q.distance(q.pixels[k], p);
          if (d < best) {
            best = d;
            bx = p[0];
            by = p[1];
          }
        }
        slot!.nearest[k] = best;
        slot!.nearX[k] = bx;
        slot!.nearY[k] = by;
      };
      // A vertex whose coordinates are gone, and one whose coordinates are new; a count that only moved changes no minimum.
      let gone: Set<string> | null = null;
      const added: Array<readonly [number, number]> = [];
      const samePixels = slot.points !== null && slot.pixels === q.pixels;
      if (samePixels) {
        gone = new Set();
        let kept = 0;
        let differ = 0;
        for (const [k, { p, n: now }] of points) {
          const was = slot.points!.get(k)?.n ?? 0;
          kept += Math.min(was, now);
          differ += Math.max(0, now - was);
          if (was === 0) added.push(p);
        }
        for (const [k, { n: was }] of slot.points!) {
          const now = points.get(k)?.n ?? 0;
          differ += Math.max(0, was - now);
          if (now === 0) gone.add(k);
        }
        if (differ > kept) gone = null;
      }
      if (gone === null) {
        tally.fillNearestRebuilt++;
        slot.pixels = q.pixels;
        slot.nearest = new Float64Array(n);
        slot.nearX = new Float64Array(n);
        slot.nearY = new Float64Array(n);
        for (let k = 0; k < n; k++) measure(k);
      } else {
        for (let k = 0; k < n; k++) {
          if (plant !== 'stale-fill-nearest' && gone.has(`${coordKey(slot.nearX[k])},${coordKey(slot.nearY[k])}`)) {
            tally.fillNearestMeasured++;
            measure(k);
            continue;
          }
          tally.fillNearestCarried++;
          for (const p of added) {
            const d = q.distance(q.pixels[k], p);
            if (d < slot.nearest[k]) {
              slot.nearest[k] = d;
              slot.nearX[k] = p[0];
              slot.nearY[k] = p[1];
            }
          }
        }
      }
      slot.points = points;
      // The pixels in the hull: carried outside the box of the hull edges that changed, measured again inside it.
      const hullEdges = new Map<string, { a: readonly [number, number]; b: readonly [number, number]; n: number }>();
      for (let k = 0; k < q.hull.length; k++) {
        const a = q.hull[k];
        const b = q.hull[(k + 1) % q.hull.length];
        const key = `${keyOf(a)}>${keyOf(b)}`;
        const e = hullEdges.get(key);
        if (e === undefined) hullEdges.set(key, { a, b, n: 1 });
        else e.n++;
      }
      if (!samePixels || slot.hullEdges === null) {
        tally.fillHullsMeasured++;
        slot.inHull = new Uint8Array(n);
        for (let k = 0; k < n; k++) slot.inHull[k] = q.inHull(q.pixels[k]) ? 1 : 0;
      } else {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        const widen = (p: readonly [number, number]): void => {
          minX = Math.min(minX, p[0]);
          maxX = Math.max(maxX, p[0]);
          minY = Math.min(minY, p[1]);
          maxY = Math.max(maxY, p[1]);
        };
        for (const [key, e] of hullEdges) if ((slot.hullEdges.get(key)?.n ?? 0) !== e.n) (widen(e.a), widen(e.b));
        for (const [key, e] of slot.hullEdges) if ((hullEdges.get(key)?.n ?? 0) !== e.n) (widen(e.a), widen(e.b));
        if (minX === Infinity) tally.fillHullsReused++;
        else {
          tally.fillHullsCarried++;
          minX -= HULL_CARRY_MARGIN;
          minY -= HULL_CARRY_MARGIN;
          maxX += HULL_CARRY_MARGIN;
          maxY += HULL_CARRY_MARGIN;
          for (let k = 0; k < n; k++) {
            const c = q.centre(q.pixels[k]);
            if (c[0] < minX || c[0] > maxX || c[1] < minY || c[1] > maxY) continue;
            if (plant === 'stale-fill-hull') continue;
            tally.fillHullPixelsMeasured++;
            slot.inHull[k] = q.inHull(q.pixels[k]) ? 1 : 0;
          }
        }
      }
      slot.hullEdges = hullEdges;
      const kept: number[] = [];
      for (let k = 0; k < n; k++) if (slot.inHull[k]) kept.push(k);
      const inside = new Int32Array(kept.length);
      const nearest = new Float64Array(kept.length);
      kept.forEach((k, j) => {
        inside[j] = q.pixels[k];
        nearest[j] = slot!.nearest[k];
      });
      return { inside, nearest };
    },
    regionEdges: (polygon, transition) => {
      let slot = regionEdgeSlots.find((r) => Object.is(r.transition, transition) && samePolygon(polygon, r.polygon));
      if (slot === undefined) {
        slot = { polygon: flat(polygon), transition, last: new Map() };
        regionEdgeSlots.push(slot);
      }
      const last = slot.last;
      const now = new Map<string, RegionEdgeRecord>();
      slot.last = now;
      const keyOf = (p: readonly [number, number]): string => `${coordKey(p[0])},${coordKey(p[1])}`;
      return {
        entry: (a, b) => {
          const key = plant === 'stale-region-edge' ? keyOf(a) : `${keyOf(a)};${keyOf(b)}`;
          let record = now.get(key);
          if (record !== undefined) return record;
          record = last.get(key);
          if (record === undefined) {
            tally.regionEdgesComputed++;
            record = {};
          } else tally.regionEdgesCarried++;
          now.set(key, record);
          return record;
        },
      };
    },
  };
}
