/**
 * What each region of an atlas draws, in page texels, and whether two of those
 * drawings overlap — the reading `A49_PACKED_FOOTPRINTS_DO_NOT_OVERLAP` makes
 * (issue #1099, the gate half of `--pack-shape polygon`).
 *
 * ## The footprint
 *
 * A region's footprint is the part of its page some attachment samples:
 *
 *   * a region a **mesh** names (its `path`, else its name, and every frame of
 *     its `sequence` — the lookups `../region_lookups.ts` makes, the loader's
 *     own) draws the mesh's hull loop — its first `hullLength / 2` UVs, closed
 *     last to first — and each of its triangles; a **linked mesh** draws its
 *     source's, which is what `MeshEntry.regionUVs` and `triangles` already
 *     hold for one. A UV `(u, v)` lands on the page where
 *     `MeshAttachment.computeUVs` puts it, times the page size: the default
 *     case of `computeUvs` in `src/core/uvs.ts`, which the core suite holds to
 *     the runtime — `x = region.x − offsetX + u · originalWidth`,
 *     `y = region.y − (originalHeight − offsetY − height) + v · originalHeight`;
 *   * a region a **region attachment** names draws its whole rectangle, and so
 *     does a region **nothing** names (a frame no attachment reaches, the second
 *     of two regions with one name — the runtime's lookup returns the first);
 *   * a region is its rectangle, too, wherever the mesh cannot be read as a
 *     polygon over it: a mesh whose UVs leave 0..1, a hull or triangle list
 *     that does not index its vertices, a region turned by `rotate:` (the hull
 *     is not turned here; A06 refuses rotation under the profile this runs
 *     in), and every region at all when a skin entry's `sequence` is one the
 *     lookup walk will not guess at — then which regions a mesh reaches is not
 *     known, and the rectangle is the reading that assumes nothing.
 *
 * Those fallbacks are the packer's (`packFootprints` in `src/atlas.ts`), and
 * every one of them is the rectangle — the footprint A06's tiling clause gave
 * every region before this reading existed.
 *
 * ## The overlap, and why it is exactly A06's statement for rectangles
 *
 * Two regions on one page are refused when their rectangles' interiors overlap
 * **and** their footprints' interiors overlap. Touching is not overlapping, as
 * A06 never refused two rectangles that share an edge. A hull lies inside its
 * rectangle wherever it is read as a hull (UVs in 0..1, offsets 0, which is
 * every region rigc packs), so a footprint overlap implies a rectangle overlap;
 * the rectangle test runs first anyway, so that "nothing A06 accepted is
 * refused" is a property of this code rather than of the art.
 *
 * Each footprint is cut into convex pieces — a rectangle is one, a triangle is
 * one, a hull loop is ear-clipped into triangles — and two footprints overlap
 * when some piece of one and some piece of the other do. Two convex pieces are
 * apart when an edge normal of either separates their projections (the
 * separating-axis theorem, complete for two convex polygons in the plane).
 * Every such comparison is made `FOOTPRINT_SLACK` texels in favour of
 * "apart", the packer's own constant: the coordinates are doubles (a UV as the
 * file writes it times an integer size), so a pair that merely touches may
 * compute as overlapping by a few ulps, and a touch is what A06 accepts.
 * Integer rectangles are exact either way.
 *
 * Links nothing from the runtime.
 */
import { FOOTPRINT_SLACK, pageFootprint } from '../atlas.ts';
import type { AtlasRegionEntry, AtlasRegionFacts } from './facts/atlas_regions.ts';
import type { MeshEntry, MeshFacts } from './facts/mesh_attachments.ts';
import type { RegionJoinFacts } from './facts/region_joins.ts';

/** A point in page texels, x right and y down from the page's top-left. */
export type PagePoint = readonly [number, number];

/** A region's rectangle on its page, as `pageFootprint` derives it (a turned region's is transposed). */
export interface PageRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** What one region draws. */
export interface RegionFootprint {
  readonly region: AtlasRegionEntry;
  readonly rect: PageRect;
  /** `true` when the footprint is the whole rectangle. */
  readonly whole: boolean;
  /** What draws it, as the failure sentence states it. */
  readonly drawn: string;
  /** Its convex pieces, each a loop of page points; one piece, the rectangle, when `whole`. */
  readonly pieces: ReadonlyArray<readonly PagePoint[]>;
}

/** The rectangle of a region on its page. */
export function pageRectOf(region: AtlasRegionEntry): PageRect {
  const foot = pageFootprint(region);
  return { x: region.x, y: region.y, width: foot.width, height: foot.height };
}

function rectPiece(r: PageRect): PagePoint[] {
  return [
    [r.x, r.y],
    [r.x + r.width, r.y],
    [r.x + r.width, r.y + r.height],
    [r.x, r.y + r.height],
  ];
}

const cross = (o: PagePoint, a: PagePoint, b: PagePoint): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function signedArea(loop: readonly PagePoint[]): number {
  let sum = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

/**
 * A closed loop cut into triangles by ear clipping. A loop with no area gives
 * no piece (it draws nothing a neighbour could sit in). A vertex on a straight
 * run, or the tip of a zero-area spike, is dropped, since it bounds no area.
 * On a loop that is not simple the clipping still ends, and every triangle it
 * gives has three of the loop's own vertices — so it never reaches outside the
 * loop's convex hull, which is inside the region's rectangle.
 */
export function earClip(loop: readonly PagePoint[]): PagePoint[][] {
  const points: PagePoint[] = [];
  for (const p of loop) {
    const last = points[points.length - 1];
    if (last === undefined || last[0] !== p[0] || last[1] !== p[1]) points.push(p);
  }
  while (points.length > 1 && points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1]) points.pop();
  if (points.length < 3) return [];
  const area = signedArea(points);
  if (area === 0) return [];
  const ring = area > 0 ? points : points.slice().reverse();
  const idx = ring.map((_, i) => i);
  const out: PagePoint[][] = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 4 * ring.length * ring.length) {
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const prev = ring[idx[(k + idx.length - 1) % idx.length]];
      const cur = ring[idx[k]];
      const next = ring[idx[(k + 1) % idx.length]];
      const turn = cross(prev, cur, next);
      if (turn === 0) {
        idx.splice(k, 1);
        clipped = true;
        break;
      }
      if (turn < 0) continue;
      let blocked = false;
      for (const j of idx) {
        const p = ring[j];
        if (p === prev || p === cur || p === next) continue;
        if (cross(prev, cur, p) >= 0 && cross(cur, next, p) >= 0 && cross(next, prev, p) >= 0) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      out.push([prev, cur, next]);
      idx.splice(k, 1);
      clipped = true;
      break;
    }
    // No ear on a loop that is not simple: take the first convex corner anyway,
    // which keeps every triangle on the loop's own vertices (header).
    if (!clipped) {
      const k = idx.findIndex((_, n) => cross(ring[idx[(n + idx.length - 1) % idx.length]], ring[idx[n]], ring[idx[(n + 1) % idx.length]]) > 0);
      const at = k < 0 ? 0 : k;
      out.push([ring[idx[(at + idx.length - 1) % idx.length]], ring[idx[at]], ring[idx[(at + 1) % idx.length]]]);
      idx.splice(at, 1);
    }
  }
  if (idx.length === 3) {
    const tri: PagePoint[] = [ring[idx[0]], ring[idx[1]], ring[idx[2]]];
    if (cross(tri[0], tri[1], tri[2]) !== 0) out.push(tri);
  }
  return out;
}

/** A mesh's UV polygons over its own drawing — the hull loop, then each triangle — or why they cannot be read as polygons over its rectangle. */
function meshPolygons(mesh: MeshEntry): { loops: number[][] } | { why: string } {
  const uvs = mesh.regionUVs;
  const vertices = uvs.length / 2;
  const hull = mesh.hullLength / 2;
  if (uvs.length % 2 !== 0 || !Number.isInteger(hull) || hull < 3 || hull > vertices) return { why: `mesh "${mesh.placeholder}" states a hull of ${hull} over ${vertices} vertex(es)` };
  if (uvs.some((n) => !(n >= 0 && n <= 1))) return { why: `mesh "${mesh.placeholder}"'s UVs leave 0..1, so it samples outside its own rectangle` };
  if (mesh.triangles.length % 3 !== 0 || mesh.triangles.some((t) => !Number.isInteger(t) || t < 0 || t >= vertices)) {
    return { why: `mesh "${mesh.placeholder}"'s triangles do not index its ${vertices} vertex(es)` };
  }
  const loops: number[][] = [uvs.slice(0, 2 * hull)];
  for (let t = 0; t < mesh.triangles.length; t += 3) {
    const [a, b, c] = [mesh.triangles[t], mesh.triangles[t + 1], mesh.triangles[t + 2]];
    loops.push([uvs[2 * a], uvs[2 * a + 1], uvs[2 * b], uvs[2 * b + 1], uvs[2 * c], uvs[2 * c + 1]]);
  }
  return { loops };
}

const keyOf = (skin: string, slot: string, placeholder: string): string => `${skin}\u0000${slot}\u0000${placeholder}`;

/**
 * Every region's footprint, in the atlas's region order. `meshes` is `null`
 * where the skeleton did not load (the round trip's own failure is A00's): then
 * which region a mesh draws is not known, and every footprint is its rectangle.
 */
export function regionFootprints({ atlas }: AtlasRegionFacts, { joins }: RegionJoinFacts, meshes: MeshFacts | null): RegionFootprint[] {
  if (atlas === null) return [];
  const rectOf = (region: AtlasRegionEntry, drawn: string): RegionFootprint => {
    const rect = pageRectOf(region);
    return { region, rect, whole: true, drawn, pieces: [rectPiece(rect)] };
  };
  if (meshes === null || joins === null) {
    const why = meshes === null ? 'the skeleton did not load, so what draws it is not known' : 'the skeleton did not parse, so what draws it is not known';
    return atlas.regions.map((region) => rectOf(region, `its whole rectangle (${why})`));
  }
  const unread = joins.find((join) => join.lookups === null);
  if (unread !== undefined) {
    const why = `skin "${unread.skin}" slot "${unread.slot}" entry "${unread.placeholder}" states a sequence whose frames cannot be read, so which regions a mesh reaches is not known`;
    return atlas.regions.map((region) => rectOf(region, `its whole rectangle (${why})`));
  }
  const meshAt = new Map<string, MeshEntry>();
  for (const mesh of meshes.meshes) {
    const key = keyOf(mesh.skin, mesh.slot, mesh.placeholder);
    if (!meshAt.has(key)) meshAt.set(key, mesh);
  }
  /** Per region drawn: the meshes over it, or the reason it is a rectangle. */
  const uses = new Map<AtlasRegionEntry, { meshes: MeshEntry[]; rect: string | null }>();
  for (const join of joins) {
    const mesh = meshAt.get(keyOf(join.skin, join.slot, join.placeholder));
    for (const name of join.lookups ?? []) {
      const region = atlas.findRegion(name);
      if (region === null) continue; // A08 names a lookup that finds no region
      const use = uses.get(region) ?? { meshes: [], rect: null };
      uses.set(region, use);
      if (mesh === undefined) use.rect ??= `its whole rectangle, which region attachment "${join.placeholder}" (skin "${join.skin}", slot "${join.slot}") draws`;
      else use.meshes.push(mesh);
    }
  }
  return atlas.regions.map((region) => {
    const use = uses.get(region);
    if (use === undefined) return rectOf(region, 'its whole rectangle, which no attachment draws');
    if (use.rect !== null) return rectOf(region, use.rect);
    if (region.degrees !== 0) return rectOf(region, `its whole rectangle (it is turned ${region.degrees} degrees, and a hull is not turned here)`);
    const pieces: PagePoint[][] = [];
    const left = region.x - region.offsetX;
    const top = region.y - (region.originalHeight - region.offsetY - region.height);
    for (const mesh of use.meshes) {
      const read = meshPolygons(mesh);
      if ('why' in read) return rectOf(region, `its whole rectangle (${read.why})`);
      read.loops.forEach((loop, i) => {
        const points: PagePoint[] = [];
        for (let k = 0; k + 1 < loop.length; k += 2) points.push([left + loop[k] * region.originalWidth, top + loop[k + 1] * region.originalHeight]);
        if (i === 0) pieces.push(...earClip(points));
        else if (cross(points[0], points[1], points[2]) !== 0) pieces.push(points);
      });
    }
    const named = use.meshes.map((m) => `"${m.placeholder}" (skin "${m.skin}", slot "${m.slot}")`);
    const drawn = named.length === 1 ? `the hull of mesh ${named[0]}` : `the hulls of meshes ${named.join(', ')}`;
    return { region, rect: pageRectOf(region), whole: false, drawn, pieces };
  });
}

/** Whether two convex pieces' interiors overlap by more than `FOOTPRINT_SLACK` along every edge normal of either. */
export function piecesOverlap(a: readonly PagePoint[], b: readonly PagePoint[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const nx = q[1] - p[1];
      const ny = p[0] - q[0];
      const len = Math.hypot(nx, ny);
      if (len === 0) continue;
      let minA = Infinity;
      let maxA = -Infinity;
      let minB = Infinity;
      let maxB = -Infinity;
      for (const v of a) {
        const d = (v[0] * nx + v[1] * ny) / len;
        minA = Math.min(minA, d);
        maxA = Math.max(maxA, d);
      }
      for (const v of b) {
        const d = (v[0] * nx + v[1] * ny) / len;
        minB = Math.min(minB, d);
        maxB = Math.max(maxB, d);
      }
      if (maxA <= minB + FOOTPRINT_SLACK || maxB <= minA + FOOTPRINT_SLACK) return false;
    }
  }
  return true;
}

/** The convex polygon two convex pieces share (Sutherland–Hodgman), for the sentence that names the overlap. */
function sharedPolygon(subject: readonly PagePoint[], clip: readonly PagePoint[]): PagePoint[] {
  const sign = signedArea(clip) >= 0 ? 1 : -1;
  let out: PagePoint[] = subject.slice();
  for (let i = 0; i < clip.length && out.length > 0; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const input = out;
    out = [];
    const inside = (p: PagePoint): boolean => sign * cross(a, b, p) >= 0;
    for (let k = 0; k < input.length; k++) {
      const p = input[k];
      const q = input[(k + 1) % input.length];
      const pin = inside(p);
      const qin = inside(q);
      if (pin) out.push(p);
      if (pin !== qin) {
        const dp = cross(a, b, p);
        const dq = cross(a, b, q);
        const t = dp / (dp - dq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
  }
  return out;
}

/** What two footprints share: the largest area any two pieces share and the box around every shared part — `null` when they do not overlap. */
export interface FootprintOverlap {
  readonly area: number;
  readonly box: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };
}

const overlaps = (a: PageRect, b: PageRect): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

function boxOf(piece: readonly PagePoint[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of piece) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1 };
}

/** Whether the rectangles' interiors overlap — A06's own test, strict, so two rectangles that share an edge do not. */
export function rectanglesOverlap(a: RegionFootprint, b: RegionFootprint): boolean {
  return overlaps(a.rect, b.rect);
}

/** What two footprints' interiors share, or `null` when they do not overlap. Asked only of a pair whose rectangles overlap. */
export function footprintOverlap(a: RegionFootprint, b: RegionFootprint): FootprintOverlap | null {
  let area = 0;
  let box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  const boxesA = a.pieces.map(boxOf);
  const boxesB = b.pieces.map(boxOf);
  for (let i = 0; i < a.pieces.length; i++) {
    for (let j = 0; j < b.pieces.length; j++) {
      const ba = boxesA[i];
      const bb = boxesB[j];
      if (ba.x1 <= bb.x0 || bb.x1 <= ba.x0 || ba.y1 <= bb.y0 || bb.y1 <= ba.y0) continue;
      if (!piecesOverlap(a.pieces[i], b.pieces[j])) continue;
      // The verdict is the separating-axis test's; the clipped polygon only
      // measures it for the sentence, and where rounding leaves it degenerate
      // the two pieces' boxes stand in for where they meet.
      const shared = sharedPolygon(a.pieces[i], b.pieces[j]);
      if (shared.length >= 3) area = Math.max(area, Math.abs(signedArea(shared)));
      const sb = shared.length >= 3 ? boxOf(shared) : { x0: Math.max(ba.x0, bb.x0), y0: Math.max(ba.y0, bb.y0), x1: Math.min(ba.x1, bb.x1), y1: Math.min(ba.y1, bb.y1) };
      box = box === null ? sb : { x0: Math.min(box.x0, sb.x0), y0: Math.min(box.y0, sb.y0), x1: Math.max(box.x1, sb.x1), y1: Math.max(box.y1, sb.y1) };
    }
  }
  return box === null ? null : { area, box };
}
