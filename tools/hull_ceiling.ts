/**
 * hull_ceiling — how much page area polygon packing could buy over a corpus,
 * measured before any packer is written (issue #1093).
 *
 *   bun tools/hull_ceiling.ts [--recipes <recipes.json>] [--root <dir>] [--work <dir>] [--json <out.json>]
 *
 * With no `--recipes`, the tree's own: `tools/emit_hashes.ts`'s `treeRecipes`
 * (every fetched editor export and every gallery rig — nineteen when
 * `examples/` is fetched), built exactly as `emit_hashes run` builds them
 * (`buildRecipes`). `--recipes` takes an `emit-hashes-recipes/1` or
 * `emit-hashes/1` document and `--root` resolves its stages, the way
 * `verdict_gate` takes them: a private corpus keeps its recipes with it and
 * only the table leaves it, which names recipes and nothing else.
 *
 * It changes nothing under `src/` and runs no packer of its own. It reads what
 * a build wrote — `skeleton.json`, `skeleton.atlas` and the pages the atlas
 * names — with rigc's own atlas reader (`parseAtlasText`) and rigc's own
 * contour tracer (`traceAlphaOutline`, the one the contour mesher runs).
 *
 * ## The unit: a packed region, in page texels
 *
 * Packing places regions, not attachments, so every figure is summed over the
 * atlas regions some attachment samples, each region once — two region
 * attachments that share one image share one rectangle on the page. A region
 * is **mesh-kind** when every attachment that samples it is a mesh or a linked
 * mesh, and **region-kind** when any of them is a region attachment, because a
 * region attachment draws its whole quad and a neighbour's pixels inside it
 * would show. Every area is in the page's own texels, whatever `scale:` the
 * page states.
 *
 * - **rectangle** — the region's `bounds:` width × height. A region at
 *   `rotate: 90`/`270` covers `height x width` of the page (`pageFootprint`);
 *   its area is the same, and the table counts how many are turned.
 * - **mesh hull** — the polygon of a mesh's first `hull` vertices, read as
 *   given (closed from the last vertex back to the first, never re-ordered),
 *   in UV space scaled to the drawing: `u × originalWidth`, `v ×
 *   originalHeight`, which is how a mesh's UVs address a region whose
 *   whitespace the packer stripped. The polygon is then clipped to the kept
 *   rectangle (the part of the drawing that is on the page), and its area is
 *   the shoelace area of what remains. A linked mesh takes its source's hull
 *   and its own region. A hull whose pruned polygon crosses or touches itself
 *   (`findSelfIntersection`) has no area to state: the region is counted as its
 *   rectangle and the row says how many. Several meshes sampling one region
 *   with hulls that are not the same polygon likewise count the rectangle, and
 *   are counted — the area to protect is their union, which this does not
 *   compute.
 * - **traced contour** — what a region-kind region would protect if it were
 *   converted to a mesh: the corner-lattice outline of its art, at threshold 1
 *   (every texel with alpha > 0 is art, the same threshold as the floor),
 *   UNSIMPLIFIED and with no margin — tolerance 0. That is the tightest polygon
 *   rigc's tracer states, so the row is a ceiling: a contour mesh an author
 *   builds simplifies and pushes out from it. On that lattice an outline
 *   encloses whole texels, so its area is a count: the texels of the art plus
 *   every transparent texel the art encloses (the tracer fills holes, 4-connected
 *   from the footprint's border). The row counts that over EVERY island of the
 *   art (`silhouetteOf`), because a packer must protect strays too.
 *
 *   ⚠️ `traceAlphaOutline` itself traces one island and refuses a diagonal
 *   pinch, and the mesher refuses art whose largest island is under
 *   `CONTOUR_MIN_COVERAGE` of it — 18 of this corpus's 240 region-kind regions
 *   are refused one way or the other. Counting those as their rectangle put the
 *   traced row ABOVE the convex one on six recipes, which no polygon inside a
 *   convex hull can be. So the tracer is not the row's arithmetic; it is the
 *   row's witness: on every region it traces as ONE island, its outline's
 *   shoelace area must equal `silhouetteOf`'s count to the texel, and a region
 *   where they differ refuses the row by name (`checked` in the JSON says on
 *   how many regions the two agreed).
 * - **opaque texels** — texels in the footprint with alpha > 0: the floor no
 *   packing beats.
 *
 * Per recipe the row states Σ rectangle; Σ hull with meshes only (region-kind
 * regions counted as their rectangle); Σ hull with regions converted, once by
 * trace and once by convex hull (mesh-kind regions keep their mesh hull); Σ
 * opaque; each over Σ rectangle; and **covered** — Σ rectangle of every region
 * on the pages over the pages' area, the figure `build --pack` prints. A
 * recipe whose atlas rigc wrote one part per page is built a second time with
 * `--pack --page-edges free` (into `{{work}}/packed`) and covered is read off
 * that atlas; a recipe built `--atlas-in` reads covered off the pack it was
 * given, whose packer (the editor, for the fetched exports) is named in the
 * row, because its whitespace strip and its rotation are in its rectangles and
 * not in rigc's.
 *
 * Exit codes: 0 every recipe measured; 1 a recipe refused or unreadable (named
 * in the table and on stderr); 2 a bad input by name. The wall time is printed
 * on stderr and nowhere else, so two runs print the same table.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pageFootprint, parseAtlasText, type AtlasPage, type AtlasRegion } from '../src/atlas.ts';
import { CONTOUR_MIN_COVERAGE, findSelfIntersection, MeshError, prunePolygon, signedArea, traceAlphaOutline, type AlphaMask } from '../src/mesh.ts';
import { readPlate, type Plate } from './plate.ts';
import { HashesInputError, readRecipes, treeRecipes, TREE_ROOT, type Recipe } from './emit_hashes.ts';
import { buildRecipes } from './core_gate.ts';

export const CEILING_SPEC = 'hull-ceiling/1';

/** A refusal about an input — the command exits 2 on it. */
export class CeilingInputError extends Error {}

type Point = [number, number];

/**
 * The concave reading of a region's alpha: a polygon's area, or the refusal
 * the tracer gave. A parameter so a control can plant a tracer that is wrong.
 */
export type ContourReader = (mask: AlphaMask) => { area: number; islands: number } | { refused: string };

/**
 * `traceAlphaOutline` at threshold 1, unsimplified: the area its corner-lattice
 * outline encloses and how many islands it saw, or why it refused — `pinch`
 * (a diagonal pinch), `empty` (no art) or `islands` (the largest island under
 * `CONTOUR_MIN_COVERAGE` of the art, which the mesher refuses).
 */
export const traceContour: ContourReader = (mask) => {
  let traced: ReturnType<typeof traceAlphaOutline>;
  try {
    traced = traceAlphaOutline(mask, 1);
  } catch (err) {
    if (err instanceof MeshError) return { refused: err.message.startsWith('the alpha silhouette pinches') ? 'pinch' : err.message.startsWith('no pixel') ? 'empty' : 'trace' };
    throw err;
  }
  if (traced.islandPixels / traced.artPixels < CONTOUR_MIN_COVERAGE) return { refused: 'islands' };
  return { area: Math.abs(signedArea(traced.outline)), islands: traced.islands };
};

/** How one packed region is sampled and what it measures. */
export interface RegionMeasure {
  name: string;
  kind: 'region' | 'mesh';
  rotated: boolean;
  rect: number;
  /** The mesh hull's area clipped to the rectangle; null on a region-kind region. */
  meshHull: number | null;
  /** Why a mesh-kind region is counted as its rectangle, or null. */
  meshFallback: 'self-intersecting' | 'hulls differ' | null;
  /** The art's texels plus every transparent texel it encloses, over every island (`silhouetteOf`). */
  silhouette: number;
  /** The tracer's reading of the same alpha: its outline's area and islands, or its refusal. */
  traced: { area: number; islands: number } | { refused: string };
  convex: number;
  opaque: number;
}

export interface CeilingRow {
  name: string;
  /** Who placed the rectangles the row measures. */
  packer: string;
  /** Null when the row was measured; otherwise why not. */
  refused: string | null;
  attachments: { region: number; mesh: number; linked: number };
  regions: { region: number; mesh: number; rotated: number };
  rect: number;
  hullMeshes: number;
  hullTraced: number;
  hullConvex: number;
  opaque: number;
  /** Counts behind the fallbacks: regions counted as their rectangle, and why. */
  fallbacks: { selfIntersecting: number; hullsDiffer: number; traceRefused: Record<string, number> };
  /** Regions the tracer traced as one island, whose outline area equalled the silhouette to the texel. */
  checked: number;
  /** Σ rectangle of every region on the pages over the pages' area, and whose pages; null when not read. */
  covered: { value: number; of: string } | null;
}

// ---------------------------------------------------------------------------
// geometry
// ---------------------------------------------------------------------------

/** A polygon clipped to an axis-aligned rectangle (Sutherland-Hodgman; the area is right for a concave subject). */
export function clipToRect(poly: readonly Point[], x0: number, y0: number, x1: number, y1: number): Point[] {
  const edges: Array<{ inside: (p: Point) => boolean; cut: (a: Point, b: Point) => Point }> = [
    { inside: (p) => p[0] >= x0, cut: (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])] },
    { inside: (p) => p[0] <= x1, cut: (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])] },
    { inside: (p) => p[1] >= y0, cut: (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0] },
    { inside: (p) => p[1] <= y1, cut: (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1] },
  ];
  let out: Point[] = poly.map(([x, y]) => [x, y]);
  for (const edge of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const here = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      if (edge.inside(here)) {
        if (!edge.inside(prev)) out.push(edge.cut(prev, here));
        out.push(here);
      } else if (edge.inside(prev)) out.push(edge.cut(prev, here));
    }
    if (out.length === 0) break;
  }
  return out;
}

/** The convex hull's area of a point set (Andrew's monotone chain). */
export function convexArea(points: Point[]): number {
  if (points.length < 3) return 0;
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Point, a: Point, b: Point): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Point[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return Math.abs(signedArea([...lower.slice(0, -1), ...upper.slice(0, -1)]));
}

/**
 * A footprint's alpha, its opaque count and the convex hull of its art
 * texels' squares. Per row only the leftmost and rightmost art texel matter
 * to a convex hull, so those two squares' corners are its point set.
 */
export function footprintAlpha(page: Plate, x: number, y: number, w: number, h: number): { mask: AlphaMask; opaque: number; convex: number; silhouette: number } {
  const alpha = new Uint8Array(w * h);
  let opaque = 0;
  const corners: Point[] = [];
  for (let j = 0; j < h; j++) {
    let lo = -1;
    let hi = -1;
    for (let i = 0; i < w; i++) {
      const px = x + i;
      const py = y + j;
      const a = px < page.width && py < page.height ? page.data[(py * page.width + px) * 4 + 3] : 0;
      alpha[j * w + i] = a;
      if (a > 0) {
        opaque++;
        if (lo < 0) lo = i;
        hi = i;
      }
    }
    if (lo >= 0) corners.push([lo, j], [lo, j + 1], [hi + 1, j], [hi + 1, j + 1]);
  }
  const mask = { width: w, height: h, alpha };
  return { mask, opaque, convex: convexArea(corners), silhouette: silhouetteOf(mask) };
}

/**
 * Texels with alpha > 0, plus every transparent texel no 4-connected path
 * reaches from the mask's border — the fill `traceAlphaOutline` applies to its
 * one island, applied to all of them at once.
 */
export function silhouetteOf(mask: AlphaMask): number {
  const { width: w, height: h, alpha } = mask;
  const reach = new Uint8Array(w * h);
  const stack: number[] = [];
  const seed = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (alpha[i] > 0 || reach[i]) return;
    reach[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < w; x++) {
    seed(x, 0);
    seed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    seed(0, y);
    seed(w - 1, y);
  }
  while (stack.length > 0) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i - x) / w;
    seed(x - 1, y);
    seed(x + 1, y);
    seed(x, y - 1);
    seed(x, y + 1);
  }
  let n = 0;
  for (let i = 0; i < reach.length; i++) if (!reach[i]) n++;
  return n;
}

// ---------------------------------------------------------------------------
// reading a build
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

function isRecord(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** One attachment that samples the atlas, with the geometry it samples it through. */
interface Sampler {
  kind: 'region' | 'mesh' | 'linked';
  regions: string[];
  /** The hull polygon in UV space, for a mesh or a linked mesh; null when its source is not found. */
  hullUv: Point[] | null;
}

/** A sequence's frame names: `path + (start + i)` padded to `digits` (start 1, digits 0 when absent — the parser's defaults). */
function sequenceRegions(path: string, seq: unknown): string[] {
  if (!isRecord(seq)) return [path];
  const count = typeof seq.count === 'number' ? seq.count : 0;
  const start = typeof seq.start === 'number' ? seq.start : 1;
  const digits = typeof seq.digits === 'number' ? seq.digits : 0;
  return Array.from({ length: count }, (_v, i) => path + String(start + i).padStart(digits, '0'));
}

function hullOf(att: Json): Point[] | null {
  const uvs = att.uvs;
  const hull = att.hull;
  if (!Array.isArray(uvs) || typeof hull !== 'number') return null;
  const out: Point[] = [];
  for (let i = 0; i < hull; i++) out.push([Number(uvs[2 * i]), Number(uvs[2 * i + 1])]);
  return out;
}

/** Every attachment in every skin that samples the atlas. */
export function samplersOf(skeleton: Json): Sampler[] {
  const skins = Array.isArray(skeleton.skins) ? skeleton.skins.filter(isRecord) : [];
  const find = (skin: string, slot: string, name: string): Json | null => {
    const s = skins.find((k) => k.name === skin);
    const atts = s !== undefined && isRecord(s.attachments) ? s.attachments[slot] : undefined;
    const att = isRecord(atts) ? atts[name] : undefined;
    return isRecord(att) ? att : null;
  };
  const out: Sampler[] = [];
  for (const skin of skins) {
    if (!isRecord(skin.attachments)) continue;
    for (const [slot, atts] of Object.entries(skin.attachments)) {
      if (!isRecord(atts)) continue;
      for (const [name, att] of Object.entries(atts)) {
        if (!isRecord(att)) continue;
        const type = typeof att.type === 'string' ? att.type : 'region';
        if (type !== 'region' && type !== 'mesh' && type !== 'linkedmesh') continue;
        const path = typeof att.path === 'string' ? att.path : name;
        const regions = sequenceRegions(path, att.sequence);
        if (type === 'region') out.push({ kind: 'region', regions, hullUv: null });
        else if (type === 'mesh') out.push({ kind: 'mesh', regions, hullUv: hullOf(att) });
        else {
          const source = typeof att.parent === 'string' ? find(typeof att.skin === 'string' ? att.skin : 'default', slot, att.parent) : null;
          out.push({ kind: 'linked', regions, hullUv: source === null ? null : hullOf(source) });
        }
      }
    }
  }
  return out;
}

/** The hull of a mesh in the drawing's texels (y down from the drawing's top), clipped to the kept rectangle. */
function meshHullArea(hullUv: Point[], r: AtlasRegion): { area: number } | { fallback: 'self-intersecting' } {
  const poly = prunePolygon(hullUv.map(([u, v]): Point => [u * r.originalWidth, v * r.originalHeight]));
  if (poly.length < 3 || findSelfIntersection(poly) !== null) return { fallback: 'self-intersecting' };
  const top = r.originalHeight - r.offsetY - r.height;
  const clipped = clipToRect(poly, r.offsetX, top, r.offsetX + r.width, top + r.height);
  return { area: clipped.length < 3 ? 0 : Math.abs(signedArea(clipped)) };
}

function sameHull(a: Point[], b: Point[]): boolean {
  return a.length === b.length && a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1]);
}

/** The pages of an atlas file, decoded; a refusal names the page. */
function readPages(atlasPath: string, pages: readonly AtlasPage[]): Map<string, Plate> {
  const out = new Map<string, Plate>();
  for (const page of pages) {
    const file = resolve(dirname(atlasPath), page.name);
    if (!existsSync(file)) throw new CeilingInputError(`page "${page.name}" is not on disk`);
    const plate = readPlate(file);
    if (plate.width !== page.width || plate.height !== page.height) {
      throw new CeilingInputError(`page "${page.name}" declares ${page.width}x${page.height} and its file is ${plate.width}x${plate.height}`);
    }
    out.set(page.name, plate);
  }
  return out;
}

/** Σ rectangle of every region on an atlas's pages over the pages' area. */
export function coveredOf(atlasPath: string): number {
  const parsed = parseAtlasText(readFileSync(atlasPath, 'utf8'));
  const area = parsed.pages.reduce((n, p) => n + p.width * p.height, 0);
  const rects = parsed.regions.reduce((n, r) => n + r.width * r.height, 0);
  return rects / area;
}

/** One build's regions measured. */
export function measureBuild(out: string, trace: ContourReader = traceContour): { measures: RegionMeasure[]; attachments: CeilingRow['attachments'] } {
  const skeleton = JSON.parse(readFileSync(join(out, 'skeleton.json'), 'utf8')) as Json;
  const atlasPath = join(out, 'skeleton.atlas');
  if (!existsSync(atlasPath)) throw new CeilingInputError('the build wrote no skeleton.atlas');
  const parsed = parseAtlasText(readFileSync(atlasPath, 'utf8'));
  const pages = readPages(atlasPath, parsed.pages);
  const byName = new Map<string, { page: AtlasPage; region: AtlasRegion }>();
  for (const page of parsed.pages) for (const region of page.regions) if (!byName.has(region.name.trim())) byName.set(region.name.trim(), { page, region });

  const samplers = samplersOf(skeleton);
  const attachments = { region: 0, mesh: 0, linked: 0 };
  const uses = new Map<string, Sampler[]>();
  for (const s of samplers) {
    attachments[s.kind]++;
    for (const name of s.regions) uses.set(name, [...(uses.get(name) ?? []), s]);
  }
  const measures: RegionMeasure[] = [];
  for (const name of [...uses.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const hit = byName.get(name);
    if (hit === undefined) throw new CeilingInputError(`an attachment samples region "${name}", which the atlas does not list`);
    const { page, region } = hit;
    const using = uses.get(name) ?? [];
    const kind: 'region' | 'mesh' = using.every((s) => s.kind !== 'region') ? 'mesh' : 'region';
    const foot = pageFootprint(region);
    const plate = pages.get(page.name) as Plate;
    const alpha = footprintAlpha(plate, region.x, region.y, foot.width, foot.height);
    const rect = region.width * region.height;
    let meshHull: number | null = null;
    let meshFallback: RegionMeasure['meshFallback'] = null;
    if (kind === 'mesh') {
      const hulls = using.map((s) => s.hullUv);
      const first = hulls[0];
      if (first === null || first === undefined || hulls.some((h) => h === null || !sameHull(h, first))) meshFallback = 'hulls differ';
      else {
        const m = meshHullArea(first, region);
        if ('area' in m) meshHull = m.area;
        else meshFallback = m.fallback;
      }
    }
    const traced = trace(alpha.mask);
    if ('area' in traced && traced.islands === 1 && traced.area !== alpha.silhouette) {
      throw new CeilingInputError(
        `region "${name}": the tracer's outline encloses ${traced.area} texels and the silhouette counts ${alpha.silhouette} — ` +
          'one island traced on the corner lattice encloses exactly its filled texels, so one of the two readings is wrong',
      );
    }
    measures.push({
      name,
      kind,
      rotated: region.degrees === 90 || region.degrees === 270,
      rect,
      meshHull,
      meshFallback,
      silhouette: alpha.silhouette,
      traced,
      convex: alpha.convex,
      opaque: alpha.opaque,
    });
  }
  return { measures, attachments };
}

/** A build's measures summed into a row. */
export function rowOf(name: string, packer: string, measured: ReturnType<typeof measureBuild>, covered: CeilingRow['covered']): CeilingRow {
  const row: CeilingRow = {
    name,
    packer,
    refused: null,
    attachments: measured.attachments,
    regions: { region: 0, mesh: 0, rotated: 0 },
    rect: 0,
    hullMeshes: 0,
    hullTraced: 0,
    hullConvex: 0,
    opaque: 0,
    fallbacks: { selfIntersecting: 0, hullsDiffer: 0, traceRefused: {} },
    checked: 0,
    covered,
  };
  for (const m of measured.measures) {
    row.regions[m.kind]++;
    if (m.rotated) row.regions.rotated++;
    row.rect += m.rect;
    row.opaque += m.opaque;
    if ('area' in m.traced && m.traced.islands === 1) row.checked++;
    if ('refused' in m.traced && m.kind === 'region') {
      row.fallbacks.traceRefused[m.traced.refused] = (row.fallbacks.traceRefused[m.traced.refused] ?? 0) + 1;
    }
    if (m.kind === 'mesh') {
      const hull = m.meshHull ?? m.rect;
      if (m.meshFallback === 'self-intersecting') row.fallbacks.selfIntersecting++;
      if (m.meshFallback === 'hulls differ') row.fallbacks.hullsDiffer++;
      row.hullMeshes += hull;
      row.hullTraced += hull;
      row.hullConvex += hull;
    } else {
      row.hullMeshes += m.rect;
      row.hullTraced += m.silhouette;
      row.hullConvex += m.convex;
    }
  }
  return row;
}

// ---------------------------------------------------------------------------
// recipes
// ---------------------------------------------------------------------------

/** The last `build` of a recipe, and who packs its atlas. */
function lastBuild(recipe: Recipe): { at: number; packer: 'atlas-in' | 'pack' | 'loose' } | null {
  for (let i = recipe.commands.length - 1; i >= 0; i--) {
    const c = recipe.commands[i];
    if (c[0] !== 'build') continue;
    return { at: i, packer: c.includes('--atlas-in') ? 'atlas-in' : c.includes('--pack') ? 'pack' : 'loose' };
  }
  return null;
}

/** A loose recipe with its build repeated `--pack --page-edges free` into `{{work}}/packed`. */
export function withPackedTwin(recipe: Recipe): Recipe {
  const b = lastBuild(recipe);
  if (b === null || b.packer !== 'loose') return recipe;
  const src = recipe.commands[b.at];
  const twin: string[] = [];
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '--copy-images') continue;
    if (src[i] === '--out' || src[i] === '--page-edges') {
      i++;
      continue;
    }
    twin.push(src[i]);
  }
  twin.push('--pack', '--page-edges', 'free', '--out', '{{work}}/packed');
  return { ...recipe, commands: [...recipe.commands, twin] };
}

/** Every recipe built into `work` and measured, in name order. */
export function ceilingRows(recipes: readonly Recipe[], work: string, root: string, trace: ContourReader = traceContour, progress: (line: string) => void = () => {}): CeilingRow[] {
  const twinned = recipes.map(withPackedTwin);
  const built = buildRecipes(twinned, work, root, progress);
  return built.map((b, i): CeilingRow => {
    const kind = lastBuild(recipes[i])?.packer ?? 'loose';
    const packer = kind === 'atlas-in' ? 'the --atlas-in pack' : kind === 'pack' ? 'rigc --pack' : 'rigc --pack --page-edges free';
    const failed = (why: string): CeilingRow => ({
      name: b.name,
      packer,
      refused: why,
      attachments: { region: 0, mesh: 0, linked: 0 },
      regions: { region: 0, mesh: 0, rotated: 0 },
      rect: 0,
      hullMeshes: 0,
      hullTraced: 0,
      hullConvex: 0,
      opaque: 0,
      fallbacks: { selfIntersecting: 0, hullsDiffer: 0, traceRefused: {} },
      checked: 0,
      covered: null,
    });
    if (b.exits.some((e) => e !== 0)) return failed(`the build chain exited ${JSON.stringify(b.exits)}`);
    try {
      const measured = measureBuild(b.out, trace);
      const packedAtlas = kind === 'loose' ? join(dirname(b.out), 'packed', 'skeleton.atlas') : join(b.out, 'skeleton.atlas');
      const covered = { value: coveredOf(packedAtlas), of: kind === 'loose' ? 'the packed twin' : 'the build' };
      if (kind === 'loose') {
        // The twin packs the same regions; its rectangles must sum to the loose build's.
        const twin = measureBuild(join(dirname(b.out), 'packed'), traceContour);
        const twinRect = twin.measures.reduce((n, m) => n + m.rect, 0);
        const rect = measured.measures.reduce((n, m) => n + m.rect, 0);
        if (twinRect !== rect) return failed(`the packed twin's rectangles sum to ${twinRect} texels and the loose build's to ${rect}`);
      }
      return rowOf(b.name, packer, measured, covered);
    } catch (err) {
      if (err instanceof CeilingInputError) return failed(err.message);
      throw err;
    }
  });
}

// ---------------------------------------------------------------------------
// the table
// ---------------------------------------------------------------------------

function ratio(n: number, d: number): string {
  return d > 0 ? (n / d).toFixed(3) : '—';
}

function count(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fallbackNote(row: CeilingRow): string {
  const parts: string[] = [];
  if (row.fallbacks.selfIntersecting > 0) parts.push(`${row.fallbacks.selfIntersecting} mesh hull(s) self-intersecting, counted as the rectangle`);
  if (row.fallbacks.hullsDiffer > 0) parts.push(`${row.fallbacks.hullsDiffer} region(s) whose meshes' hulls differ, counted as the rectangle`);
  return parts.length === 0 ? '' : parts.join('; ');
}

function tracerNote(row: CeilingRow): string {
  const refused = Object.entries(row.fallbacks.traceRefused).sort(([a], [b]) => (a < b ? -1 : 1));
  return `${row.checked} = silhouette${refused.length === 0 ? '' : `; refuses ${refused.map(([why, n]) => `${n} ${why}`).join(', ')}`}`;
}

/** The table as markdown lines: one row per recipe, then the sums. */
export function ceilingTable(rows: readonly CeilingRow[]): string[] {
  const head = [
    'recipe',
    'packer',
    'attachments region / mesh / linked',
    'regions region-kind / mesh-kind / rotated',
    'Σ rectangle',
    'Σ hull, meshes only',
    'ratio',
    'Σ hull, regions traced',
    'ratio',
    'Σ hull, regions convex',
    'ratio',
    'Σ opaque',
    'floor',
    'covered',
    'tracer witness',
    'notes',
  ];
  const out = [`| ${head.join(' | ')} |`, `| ${head.map((_h, i) => (i < 4 || i >= head.length - 2 ? '---' : '---:')).join(' | ')} |`];
  const sum = { checked: 0, rect: 0, hullMeshes: 0, hullTraced: 0, hullConvex: 0, opaque: 0, a: [0, 0, 0], r: [0, 0, 0] };
  for (const row of rows) {
    if (row.refused !== null) {
      out.push(`| ${row.name} | ${row.packer} | REFUSED: ${row.refused} |${' |'.repeat(head.length - 3)}`);
      continue;
    }
    sum.rect += row.rect;
    sum.hullMeshes += row.hullMeshes;
    sum.hullTraced += row.hullTraced;
    sum.hullConvex += row.hullConvex;
    sum.opaque += row.opaque;
    sum.checked += row.checked;
    [row.attachments.region, row.attachments.mesh, row.attachments.linked].forEach((v, i) => (sum.a[i] += v));
    [row.regions.region, row.regions.mesh, row.regions.rotated].forEach((v, i) => (sum.r[i] += v));
    out.push(
      `| ${[
        row.name,
        row.packer,
        `${row.attachments.region} / ${row.attachments.mesh} / ${row.attachments.linked}`,
        `${row.regions.region} / ${row.regions.mesh} / ${row.regions.rotated}`,
        count(row.rect),
        count(row.hullMeshes),
        ratio(row.hullMeshes, row.rect),
        count(row.hullTraced),
        ratio(row.hullTraced, row.rect),
        count(row.hullConvex),
        ratio(row.hullConvex, row.rect),
        count(row.opaque),
        ratio(row.opaque, row.rect),
        row.covered === null ? '—' : `${(row.covered.value * 100).toFixed(1)} %`,
        tracerNote(row),
        fallbackNote(row),
      ].join(' | ')} |`,
    );
  }
  out.push(
    `| **all rows** | | ${sum.a.join(' / ')} | ${sum.r.join(' / ')} | ${count(sum.rect)} | ${count(sum.hullMeshes)} | ${ratio(sum.hullMeshes, sum.rect)} | ` +
      `${count(sum.hullTraced)} | ${ratio(sum.hullTraced, sum.rect)} | ${count(sum.hullConvex)} | ${ratio(sum.hullConvex, sum.rect)} | ` +
      `${count(sum.opaque)} | ${ratio(sum.opaque, sum.rect)} | | ${sum.checked} = silhouette | |`,
  );
  return out;
}

/** The JSON document: the rows, key order fixed, areas to six decimals. */
export function ceilingText(rows: readonly CeilingRow[]): string {
  const r6 = (n: number): number => Math.round(n * 1e6) / 1e6;
  const doc = {
    spec: CEILING_SPEC,
    recipes: rows.map((row) => ({
      name: row.name,
      packer: row.packer,
      refused: row.refused,
      attachments: row.attachments,
      regions: row.regions,
      rect: row.rect,
      hullMeshes: r6(row.hullMeshes),
      hullTraced: r6(row.hullTraced),
      hullConvex: r6(row.hullConvex),
      opaque: row.opaque,
      fallbacks: {
        selfIntersecting: row.fallbacks.selfIntersecting,
        hullsDiffer: row.fallbacks.hullsDiffer,
        traceRefused: Object.fromEntries(Object.entries(row.fallbacks.traceRefused).sort(([a], [b]) => (a < b ? -1 : 1))),
      },
      checked: row.checked,
      covered: row.covered === null ? null : { value: r6(row.covered.value), of: row.covered.of },
    })),
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

function parseFlags(args: readonly string[], known: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!known.includes(arg)) throw new CeilingInputError(`unknown argument ${arg}; this command takes ${known.join(', ')}`);
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) throw new CeilingInputError(`${arg} needs a value`);
    if (flags.has(arg)) throw new CeilingInputError(`${arg} given twice`);
    flags.set(arg, value);
    i++;
  }
  return flags;
}

/** The command; returns the exit code. */
export function ceilingMain(argv: readonly string[], print: (line: string) => void = console.log, warn: (line: string) => void = console.error): number {
  try {
    const flags = parseFlags(argv, ['--recipes', '--root', '--work', '--json']);
    const root = resolve(flags.get('--root') ?? TREE_ROOT);
    if (!existsSync(root) || !statSync(root).isDirectory()) throw new CeilingInputError(`--root ${root} is not a directory`);
    const named = flags.get('--recipes');
    const recipes: Recipe[] = named === undefined ? treeRecipes(root, warn) : readRecipes(named);
    if (recipes.length === 0) throw new CeilingInputError('no recipes to run');
    const workFlag = flags.get('--work');
    let work: string;
    if (workFlag === undefined) work = mkdtempSync(join(tmpdir(), 'rigc-hull-ceiling-'));
    else {
      work = resolve(workFlag);
      if (existsSync(work) && readdirSync(work).length > 0) throw new CeilingInputError(`--work ${work} is not empty; every recipe runs in a fresh directory`);
      mkdirSync(work, { recursive: true });
    }
    warn(`hull_ceiling: ${recipes.length} recipe(s), work directory ${work}`);
    const started = performance.now();
    const rows = ceilingRows(recipes, work, root, traceContour, warn);
    for (const line of ceilingTable(rows)) print(line);
    const json = flags.get('--json');
    if (json !== undefined) writeFileSync(json, ceilingText(rows));
    const refused = rows.filter((r) => r.refused !== null);
    for (const r of refused) warn(`hull_ceiling: ${r.name} REFUSED — ${r.refused}`);
    warn(`hull_ceiling: wall time ${((performance.now() - started) / 1000).toFixed(1)} s`);
    return refused.length > 0 ? 1 : 0;
  } catch (err) {
    if (err instanceof CeilingInputError || err instanceof HashesInputError) {
      warn(`hull_ceiling: ${err.message}`);
      return 2;
    }
    throw err;
  }
}

if (import.meta.main) process.exit(ceilingMain(process.argv.slice(2)));
