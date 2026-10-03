/**
 * trace_footprint — the footprint a region-kind region would pack by if its
 * region attachments were converted to contour meshes, measured without
 * converting anything on disk (issue #1115).
 *
 * Shared by `tools/hull_ceiling.ts` (whose *regions traced* ceiling counts the
 * polygon `traceOutline` states) and `tools/pack_anchor.ts --trace-regions`
 * (which packs by it). Nothing here writes a file or reaches under `src/`
 * beyond the exported tracer, mesher and footprint reader.
 *
 * ## The two tightnesses
 *
 *   * **`lattice`** — tolerance 0, no margin: the corner-lattice outline
 *     `traceAlphaOutline` states at threshold 1 (every texel with alpha > 0 is
 *     art; the outer loop of the largest island, holes filled), with repeated
 *     and exactly collinear lattice vertices dropped (`prunePolygon`, which
 *     changes no point of the polygon), triangulated by `earClip` — the
 *     polygon `hull_ceiling`'s *regions traced* row counts, and the tightest a
 *     contour mesh of that art can be.
 *   * **`mesher`** — `buildContourMesh` itself, at a tolerance the caller
 *     names and the contour generator's stated defaults for the rest
 *     (`CONTOUR_GENERATOR_DEFAULTS`: margin 1, maxVertices 64, alpha 1) — the
 *     mesh a conversion would emit as the mesher stands, its refusals included.
 *     The generator has **no default tolerance**: `RigContourGenerator.tolerance`
 *     is required, and `buildContourMesh` refuses 0 — so the tolerance is the
 *     caller's to state, and is never chosen here.
 *
 * A region the tracer or the mesher refuses keeps its rectangle, and the
 * refusal is counted by name: `pinch`, `empty`, `islands` (the largest island
 * under `CONTOUR_MIN_COVERAGE` of the art), `trace`; and from the mesher also
 * `opaque` (no transparent texel: the silhouette is the window), `vertices`
 * (past `maxVertices`), `crosses`, `coverage`, `overshoot`, `mesher`.
 *
 * ## The conversion, in memory
 *
 * `convertRegionAttachments` rewrites a build's `skeleton.json` text: every
 * region attachment (no `sequence`) whose region has a geometry becomes a mesh
 * attachment carrying that geometry's `uvs` (each the float32 name of the
 * six-decimal grid value, as the compiler emits a generated mesh's), `hull`
 * and `triangles`, with its region named by `path`. The footprints are then
 * read off that text by `packFootprints` — the same reader `build --pack
 * --pack-shape polygon` runs — so mesh-kind regions keep exactly the
 * footprint they pack by today, and a region sampled by a region attachment
 * and a mesh packs by the union of both, as a converted build would. A region
 * attachment with a `sequence` keeps its rectangle (one attachment's geometry
 * would have to serve every frame's art) and is counted as `sequence`.
 */
import { packFootprints, type PackFootprint } from '../src/atlas.ts';
import { f32 } from '../src/compile.ts';
import { buildContourMesh, CONTOUR_MIN_COVERAGE, earClip, MeshError, prunePolygon, traceAlphaOutline, type AlphaMask } from '../src/mesh.ts';
import { readPlate } from './plate.ts';

/**
 * The contour generator's defaults for its optional fields, as `src/compile.ts`
 * states them (`CONTOUR_DEFAULTS`, not exported). Restated here and held to
 * that text by `PK103`, so a change there that is not made here is named.
 */
export const CONTOUR_GENERATOR_DEFAULTS = { margin: 1, maxVertices: 64, alpha: 1 } as const;

/** Why the tracer refused a region (`traceOutline`). */
export type TraceRefusal = 'pinch' | 'empty' | 'islands' | 'trace';

/**
 * `traceAlphaOutline` at threshold 1: the outer corner-lattice loop of the
 * largest island and how many islands it saw, or why it refused — `pinch`,
 * `empty`, `trace` (any other refusal of the tracer), or `islands` (the
 * largest island under `CONTOUR_MIN_COVERAGE` of the art, which the mesher
 * refuses).
 */
export function traceOutline(mask: AlphaMask): { outline: Array<[number, number]>; islands: number } | { refused: TraceRefusal } {
  let traced: ReturnType<typeof traceAlphaOutline>;
  try {
    traced = traceAlphaOutline(mask, 1);
  } catch (err) {
    if (err instanceof MeshError) return { refused: err.message.startsWith('the alpha silhouette pinches') ? 'pinch' : err.message.startsWith('no pixel') ? 'empty' : 'trace' };
    throw err;
  }
  if (traced.islandPixels / traced.artPixels < CONTOUR_MIN_COVERAGE) return { refused: 'islands' };
  return { outline: traced.outline, islands: traced.islands };
}

/** Which polygon a region-kind region packs by. */
export type Tightness = { kind: 'lattice' } | { kind: 'mesher'; tolerance: number };

/** A converted mesh's geometry in the drawing's UVs, or why the region keeps its rectangle. */
export type ContourGeometry = { uvs: number[]; hull: number; triangles: number[] } | { refused: string };

/** The six-decimal grid the mesher writes points on (`r6` in src/mesh.ts), then float32 as the compiler emits it. */
function emittedUv(n: number): number {
  const v = Math.round(n * 1e6) / 1e6;
  return f32(v === 0 ? 0 : v);
}

/** How a `buildContourMesh` refusal is counted. */
function mesherRefusal(message: string): string {
  if (message.startsWith('the alpha silhouette pinches')) return 'pinch';
  if (message.startsWith('no pixel')) return 'empty';
  if (message.startsWith('every pixel of the')) return 'opaque';
  if (message.startsWith('the art is ') && message.includes('separate islands')) return 'islands';
  if (message.includes('past the') && message.includes('this mesh allows')) return 'vertices';
  if (message.startsWith('the outline crosses itself')) return 'crosses';
  if (message.startsWith('the mesh covers')) return 'coverage';
  if (message.startsWith('the mesh reaches')) return 'overshoot';
  return 'mesher';
}

/**
 * The geometry a conversion of one region's art would carry, at one
 * tightness. `pageScale` is the `scale:` the region's page states when it is
 * not 1: the mesher applies its distances as `value × pageScale` texels, as
 * the compiler does for an imported page (issue #779).
 */
export function contourGeometry(mask: AlphaMask, tightness: Tightness, pageScale?: number): ContourGeometry {
  const { width: w, height: h } = mask;
  if (tightness.kind === 'lattice') {
    const traced = traceOutline(mask);
    if ('refused' in traced) return { refused: traced.refused };
    const poly = prunePolygon(traced.outline);
    let triangles: number[];
    try {
      triangles = earClip(poly);
    } catch (err) {
      if (err instanceof MeshError) return { refused: 'trace' };
      throw err;
    }
    const uvs: number[] = [];
    for (const [x, y] of poly) uvs.push(emittedUv(x / w), emittedUv(y / h));
    return { uvs, hull: poly.length, triangles };
  }
  try {
    const mesh = buildContourMesh({
      mask,
      threshold: CONTOUR_GENERATOR_DEFAULTS.alpha,
      tolerance: tightness.tolerance,
      margin: CONTOUR_GENERATOR_DEFAULTS.margin,
      maxVertices: CONTOUR_GENERATOR_DEFAULTS.maxVertices,
      ...(pageScale === undefined || pageScale === 1 ? {} : { pageScale }),
    });
    return { uvs: mesh.uvs.map(f32), hull: mesh.hullVertices, triangles: mesh.triangles };
  } catch (err) {
    if (err instanceof MeshError) return { refused: mesherRefusal(err.message) };
    throw err;
  }
}

type Json = Record<string, unknown>;

function isRecord(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** The region a region attachment samples: `path`, else `name`, else its key — `runtimeRegion` in tools/hull_ceiling.ts, restated so this module imports nothing from either tool. */
function regionOf(key: string, att: Json): string {
  return typeof att.path === 'string' ? att.path : typeof att.name === 'string' ? att.name : key;
}

/** Every region a region attachment samples (sequence frames included), and the regions of region attachments carrying a `sequence`. */
export function regionKindRegions(skeletonText: string): { regions: Set<string>; sequenced: Set<string> } {
  const doc: unknown = JSON.parse(skeletonText);
  const regions = new Set<string>();
  const sequenced = new Set<string>();
  const skins = isRecord(doc) && Array.isArray(doc.skins) ? doc.skins : [];
  for (const skin of skins) {
    if (!isRecord(skin) || !isRecord(skin.attachments)) continue;
    for (const table of Object.values(skin.attachments)) {
      if (!isRecord(table)) continue;
      for (const [key, att] of Object.entries(table)) {
        if (!isRecord(att) || (att.type ?? 'region') !== 'region') continue;
        const base = regionOf(key, att);
        const seq = att.sequence;
        if (isRecord(seq) && typeof seq.count === 'number') {
          const start = typeof seq.start === 'number' ? seq.start : 1;
          const digits = typeof seq.digits === 'number' ? seq.digits : 0;
          for (let f = 0; f < seq.count; f++) {
            const name = base + String(start + f).padStart(digits, '0');
            regions.add(name);
            sequenced.add(name);
          }
        } else regions.add(base);
      }
    }
  }
  return { regions, sequenced };
}

/**
 * The skeleton text with every region attachment (no `sequence`) whose region
 * `geometryOf` gives a geometry replaced by a mesh attachment carrying it — the
 * attachment stage 2 would write, read only by `packFootprints`.
 */
export function convertRegionAttachments(skeletonText: string, geometryOf: (region: string) => { uvs: number[]; hull: number; triangles: number[] } | null): string {
  const doc: unknown = JSON.parse(skeletonText);
  const skins = isRecord(doc) && Array.isArray(doc.skins) ? doc.skins : [];
  for (const skin of skins) {
    if (!isRecord(skin) || !isRecord(skin.attachments)) continue;
    for (const table of Object.values(skin.attachments)) {
      if (!isRecord(table)) continue;
      for (const key of Object.keys(table).sort()) {
        const att = table[key];
        if (!isRecord(att) || (att.type ?? 'region') !== 'region' || att.sequence !== undefined) continue;
        const region = regionOf(key, att);
        const g = geometryOf(region);
        if (g === null) continue;
        table[key] = { type: 'mesh', path: region, uvs: g.uvs, triangles: g.triangles, hull: g.hull };
      }
    }
  }
  return JSON.stringify(doc);
}

/** One part a set packs: its lifted PNG at the drawing's size, and its page's `scale:`. */
export interface TracePart {
  region: string;
  absPath: string;
  width: number;
  height: number;
  pageScale?: number;
}

/** What tracing a set's region-kind regions found, and the footprints to pack by. */
export interface TracedSet {
  /** Per region name, its footprint, or null for a rectangle (`packFootprints`'s map, read off the converted text). */
  footprints: Map<string, PackFootprint | null>;
  /** The converted skeleton text the footprints were read off. */
  skeletonText: string;
  /** Region-kind regions among the parts (sampled by any region attachment). */
  regionKind: number;
  /** Of those, how many pack by a contour (their footprint is not the rectangle). */
  byContour: number;
  /** Why the rest keep their rectangle, by name, sorted. */
  refused: Record<string, number>;
}

/** A part's alpha channel, row major. */
export function alphaOf(absPath: string): AlphaMask {
  const plate = readPlate(absPath);
  const alpha = new Uint8Array(plate.width * plate.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = plate.data[i * 4 + 3];
  return { width: plate.width, height: plate.height, alpha };
}

/**
 * Every region-kind region of a set traced at one tightness, converted in
 * memory, and the footprints `packFootprints` reads off the result.
 * `drop: true` is the selftest's plant (`PK104`) and nothing else: the contour
 * is read and then dropped, so every region-kind region packs as its
 * rectangle after all while the counts still say it packs by contour — the
 * failure only the pack itself can show.
 *
 * A region the conversion gave a geometry whose footprint still comes back as
 * the rectangle (another attachment over the same region that
 * `packFootprints` reads as a rectangle) is counted as `mixed`.
 */
export function tracedSet(skeletonText: string, parts: readonly TracePart[], tightness: Tightness, drop = false): TracedSet {
  const { regions: regionKind, sequenced } = regionKindRegions(skeletonText);
  const geometries = new Map<string, { uvs: number[]; hull: number; triangles: number[] }>();
  const refused: Record<string, number> = {};
  const count = (why: string): void => {
    refused[why] = (refused[why] ?? 0) + 1;
  };
  const kinds = parts.filter((p) => regionKind.has(p.region));
  for (const part of kinds) {
    if (sequenced.has(part.region)) {
      count('sequence');
      continue;
    }
    const g = contourGeometry(alphaOf(part.absPath), tightness, part.pageScale);
    if ('refused' in g) count(g.refused);
    else geometries.set(part.region, g);
  }
  const converted = convertRegionAttachments(skeletonText, (region) => (drop ? null : (geometries.get(region) ?? null)));
  const sizes = new Map(parts.map((p) => [p.region, { width: p.width, height: p.height }]));
  const footprints = packFootprints(converted, (region) => sizes.get(region));
  let byContour = 0;
  for (const part of kinds) {
    if (!geometries.has(part.region)) continue;
    // The plant counts what it traced, as the honest path counts what it packs by.
    if (drop || (footprints.get(part.region) ?? null) !== null) byContour++;
    else count('mixed');
  }
  const sorted: Record<string, number> = {};
  for (const k of Object.keys(refused).sort()) sorted[k] = refused[k];
  return { footprints, skeletonText: converted, regionKind: kinds.length, byContour, refused: sorted };
}
