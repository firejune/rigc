/**
 * The core's sixth construct: clipping applied to the draw (issue #964, §5
 * item 6 of the design on issue #380) — the oracle's `clipped` block, the
 * triangles every region and mesh drawn while a clip is active hands to the
 * runtime's clipper, as the clipper returns them.
 *
 * ## How every rule below was fixed
 *
 * By running spine-core 4.3.13's `SkeletonClipping` — `clipStart`,
 * `clipEnd(slot)`, `clipEnd()`, `isClipping` and `clipTrianglesUnpacked`, the
 * calls `src/render.ts` makes, in the order it makes them — on hand-written
 * skeletons and on random triangles and polygons, and reading what it
 * returned: the return value, `clippedVerticesTyped`, `clippedUVsTyped`,
 * `clippedTrianglesTyped`. The runtime's source was not read. Each rule is a
 * reading that reproduced every case measured, next to the readings the
 * measurements rejected. The core suite's `CL` controls hold a hand-written
 * skeleton of every case against the runtime at tolerance 0.
 *
 * ## When a clip is active — the draw walk
 *
 * The walk is `src/render.ts`'s `piecesOf`: slots in the posed draw order; at
 * a clipping attachment, end the clip if this slot is its end, then start
 * this clip if its slot's bone is active and no clip is active; at every
 * other slot, clip what it draws while a clip is active, then end the clip
 * if this slot is its end. Measured on one hand-written skeleton per case:
 *
 * | case | read |
 * | --- | --- |
 * | a clip ending at a slot | that slot is clipped, the one after it is not |
 * | ending at a slot that shows nothing | ends there all the same |
 * | ending at a slot drawn BEFORE the clip, or at its own slot | never ends: every later slot is clipped |
 * | no end slot | every later slot is clipped |
 * | a second clip while the first is active | ignored: a region inside the second and outside the first read wholly cut |
 * | a second clip after the first ended | applies |
 * | a clip ending at the slot of the next clip | the next clip starts there |
 * | a clip on an inactive bone | starts nothing |
 * | a region on an inactive bone under a clip | clipped like any other |
 *
 * ## What one triangle becomes
 *
 * The clip polygon is the clipping attachment's world polygon (the `clips`
 * row, `./vertices.ts`), unrounded. When its signed area is positive (counter
 * clockwise, y up) its vertices are reversed, so it is walked clockwise, and
 * its edges are taken from vertex 0: `(v0, v1), (v1, v2), …, (vn-1, v0)`.
 * A point is inside an edge `(p, q)` when `(q.x − p.x)(y − p.y) − (q.y −
 * p.y)(x − p.x) < 0`, strictly.
 *
 * Each triangle `(a, b, c)` of the attachment, in its own order, is clipped
 * edge by edge (Sutherland–Hodgman): walking the current polygon's sides
 * `(s, e)` from `(v0, v1)` round to `(vk, v0)`, an inside `s` with an inside
 * `e` keeps `e`; inside to outside adds the intersection; outside to inside
 * adds the intersection and then `e`; outside to outside adds nothing. The
 * intersection is `s + t·(e − s)` with `t = ((q.x − p.x)(s.y − p.y) − (q.y −
 * p.y)(s.x − p.x)) / ((q.y − p.y)(e.x − s.x) − (q.x − p.x)(e.y − s.y))`, in
 * doubles. A triangle no side of which was outside any edge is returned as it
 * came, `a, b, c` — not the rotation the walk leaves it in. A result of fewer
 * than three points adds nothing; otherwise its points are appended and fanned
 * from the first: `(0, 1, 2), (0, 2, 3), …` offset by the vertices already
 * written. The clipper stores vertices and UVs as float32: every number
 * written goes through `Math.fround`.
 *
 * A triangle no side of which was outside any edge keeps its corners' own
 * UVs (through `Math.fround`) rather than weighing them — the two agree on
 * the grid, and on three rows of `spineboy-pro`'s portal the weighed UV of a
 * corner at 0 read `2e-17` where the runtime holds 0 (issue #966, `dump
 * --raw`). Each point of a triangle that was cut has a UV barycentric over
 * the source triangle, from the unrounded
 * point: with `d = 1 / ((b.y − c.y)(a.x − c.x) + (c.x − b.x)(a.y − c.y))`,
 * `wa = ((b.y − c.y)(x − c.x) + (c.x − b.x)(y − c.y))·d`,
 * `wb = ((c.y − a.y)(x − c.x) + (a.x − c.x)(y − c.y))·d`, `wc = 1 − wa − wb`,
 * and `uv = ua·wa + ub·wb + uc·wc`, the corner UVs read through
 * `Math.fround`.
 *
 * The clipper returns `true` when any triangle had a point outside any edge,
 * else `false` — and `src/render.ts` then draws the attachment's own geometry.
 *
 * Measured on 2641 random cases, every polygon strictly convex, both
 * windings, one to three triangles of both windings each: 400 against
 * polygons of three to seven vertices, 600 whose intersections fall near the
 * origin, 1200 with corner UVs chosen so the weights' rounding shows, 300
 * cutting one edge once, and 141 random star polygons that came out convex —
 * the vertex list, the UVs, the triangle list and the return value exact on
 * 2641 of 2641. On the public corpus, `spineboy-pro`'s portal animation
 * (a three-vertex clip ending at a slot) reads IDENTICAL at tolerance 0 on
 * 4338 rows drawn under it (241 dense samples; 2653 left whole, 106 cut,
 * 1579 cut away). Rejected readings, each with what it read:
 *
 * | reading | read |
 * | --- | --- |
 * | the polygon's own winding, edges from vertex 0 | triangle lists 219 of 400; vertices 36 |
 * | the polygon made counter-clockwise, inside on the left | triangle lists 400; vertices in order 130 of 400 |
 * | a triangle wholly inside returned as the walk leaves it | 396 of 400 in order — the four wholly inside rotated |
 * | the polygon as its JSON spells it, through `Math.fround` | 79 of 400 exact: the world polygon carries the bone's matrix (`b` is `cos 90°` at the runtime's pi, −2.3e-8) |
 * | the intersection from the clip edge, `p + u·(q − p)` | 228 of 300 on a horizontal edge at y = 0, where `s + t·(e − s)` read 300 |
 * | the UV weights by a division rather than a reciprocal | 586 of 600 |
 * | the UV weights relative to `a` (`wb, wc` solved, `wa = 1 − wb − wc`) | 105 of 600 |
 *
 * ## What is not posed, and why
 *
 * The block is left out, naming the slot, when a clip that starts is one of:
 *
 * - ⚠️ **not strictly convex** — a reflex vertex, three collinear vertices or
 *   a repeated one. The runtime decomposes such a polygon into convex pieces
 *   and clips each triangle against each piece in turn: a covering triangle
 *   read the pieces (a notched square into three triangles, an L into two
 *   quads; a collinear vertex dropped; a repeated vertex clipped everything
 *   away). Which pieces, in which order and from which vertex is the
 *   runtime's own decomposition, and the dump alone did not fix it (issue
 *   #964's report). Posing it would be guessing an algorithm.
 * - **`inverse`** — the clip keeps what is outside the polygon, through a
 *   decomposition of the triangle around it (a covering triangle came back as
 *   fifteen vertices in five fans). Not measured past that.
 *
 * `convex: true` on a strictly convex polygon changes nothing: 400 of 400
 * cases byte-identical with and without it. On a polygon that is not, the
 * runtime clips against its convex hull (a notched square with `convex` read
 * as the square); that is the first case above and is left out.
 */
/** One row of `clipped`: `[slot, attachment, clipped, vertices, uvs, triangles]`, the oracle's row. */
export type CoreClippedRow = [string, string, 0 | 1, Array<number | null>, Array<number | null>, number[]];

/** What the clipper returns for one attachment: the return value and the three arrays, unrounded to the oracle's grid. */
export interface ClipResult {
  clipped: boolean;
  vertices: number[];
  uvs: number[];
  triangles: number[];
}

type Pt = [number, number];

/**
 * The readings the header's table rejected, each a switch — what the core
 * suite's `CL` plants pass to show the gate names it. `clipTriangles` with
 * none set is the rule measured; nothing but a plant sets one.
 */
export interface ClipReading {
  /** Walk the polygon in its own winding, not clockwise. */
  ownWinding?: boolean;
  /** Walk the polygon counter-clockwise — the runtime's winding flipped. */
  flippedWinding?: boolean;
  /** Return a triangle wholly inside as the walk leaves it. */
  insideRotated?: boolean;
  /** Take the intersection from the clip edge, `p + u·(q − p)`. */
  fromClipEdge?: boolean;
  /** Divide the UV weights by the determinant rather than multiply by its reciprocal. */
  uvByDivision?: boolean;
}

/** A world polygon's signed area, doubled: positive when counter-clockwise (y up). */
export function signedArea2(polygon: readonly number[]): number {
  let a = 0;
  const n = polygon.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += polygon[2 * i] * polygon[2 * j + 1] - polygon[2 * j] * polygon[2 * i + 1];
  }
  return a;
}

/** Why a world polygon is not one the core clips against — not strictly convex — or null. */
export function convexWhy(polygon: readonly number[]): string | null {
  const n = polygon.length / 2;
  if (n < 3) return `it has ${n} vertex(es)`;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = [polygon[2 * i], polygon[2 * i + 1]];
    const j = (i + 1) % n;
    const k = (i + 2) % n;
    const cross = (polygon[2 * j] - ax) * (polygon[2 * k + 1] - polygon[2 * j + 1]) - (polygon[2 * j + 1] - ay) * (polygon[2 * k] - polygon[2 * j]);
    if (cross === 0) return `vertices ${i}, ${j} and ${k} are collinear or repeated`;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return `vertex ${j} turns against the others (a reflex vertex)`;
  }
  return null;
}

/** The polygon walked clockwise, as the clipper walks it (the header). */
function clockwise(polygon: readonly number[], reading: ClipReading): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < polygon.length; i += 2) pts.push([polygon[i], polygon[i + 1]]);
  if (reading.ownWinding === true) return pts;
  const cw = signedArea2(polygon) > 0 ? pts.reverse() : pts;
  return reading.flippedWinding === true ? cw.reverse() : cw;
}

function intersectFromClipEdge(s: Pt, e: Pt, p: Pt, q: Pt): Pt {
  const dx = e[0] - s[0];
  const dy = e[1] - s[1];
  const ex = q[0] - p[0];
  const ey = q[1] - p[1];
  const u = (dx * (s[1] - p[1]) - dy * (s[0] - p[0])) / (ey * dx - ex * dy);
  return [p[0] + u * ex, p[1] + u * ey];
}

function intersect(s: Pt, e: Pt, p: Pt, q: Pt): Pt {
  const dx = e[0] - s[0];
  const dy = e[1] - s[1];
  const ex = q[0] - p[0];
  const ey = q[1] - p[1];
  const t = (ex * (s[1] - p[1]) - ey * (s[0] - p[0])) / (ey * dx - ex * dy);
  return [s[0] + t * dx, s[1] + t * dy];
}

/** One triangle against the clockwise polygon: the points, and whether any side was outside any edge. */
function clipTriangle(tri: readonly Pt[], poly: readonly Pt[], reading: ClipReading): { points: Pt[]; cut: boolean } {
  const cross = reading.fromClipEdge === true ? intersectFromClipEdge : intersect;
  let input: Pt[] = [...tri];
  let cut = false;
  for (let i = 0; i < poly.length && input.length > 0; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const inside = (v: Pt): boolean => (q[0] - p[0]) * (v[1] - p[1]) - (q[1] - p[1]) * (v[0] - p[0]) < 0;
    const out: Pt[] = [];
    for (let k = 0; k < input.length; k++) {
      const s = input[k];
      const e = input[(k + 1) % input.length];
      const si = inside(s);
      const ei = inside(e);
      if (si) {
        if (ei) out.push(e);
        else {
          out.push(cross(s, e, p, q));
          cut = true;
        }
      } else {
        cut = true;
        if (ei) out.push(cross(s, e, p, q), e);
      }
    }
    input = out;
  }
  return { points: cut || reading.insideRotated === true ? input : [...tri], cut };
}

/**
 * An attachment's triangles clipped against a strictly convex world polygon —
 * the header's rule. `vertices` are the attachment's world vertices, `uvs`
 * one pair per vertex, `triangles` indices into them.
 */
export function clipTriangles(polygon: readonly number[], vertices: readonly number[], triangles: readonly number[], uvs: readonly number[], reading: ClipReading = {}): ClipResult {
  const poly = clockwise(polygon, reading);
  const f = Math.fround;
  const outV: number[] = [];
  const outUv: number[] = [];
  const outT: number[] = [];
  let clipped = false;
  for (let k = 0; k + 2 < triangles.length; k += 3) {
    const idx = [triangles[k], triangles[k + 1], triangles[k + 2]];
    const tri = idx.map((i): Pt => [vertices[2 * i], vertices[2 * i + 1]]);
    const tuv = idx.map((i): Pt => [f(uvs[2 * i]), f(uvs[2 * i + 1])]);
    const { points, cut } = clipTriangle(tri, poly, reading);
    clipped ||= cut;
    if (points.length < 3) continue;
    const [a, b, c] = tri;
    const d0 = b[1] - c[1];
    const d1 = c[0] - b[0];
    const d2 = a[0] - c[0];
    const d4 = c[1] - a[1];
    const det = d0 * d2 + d1 * (a[1] - c[1]);
    const d = 1 / det;
    const weigh = (v: number): number => (reading.uvByDivision === true ? v / det : v * d);
    const base = outV.length / 2;
    // A triangle no side of which was outside any edge keeps its own corner UVs (issue #966): weighed barycentrically, a corner's UV of 0 reads 2e-17 off it, 3 rows of `spineboy-pro`'s portal.
    if (!cut && reading.insideRotated !== true) {
      tri.forEach(([x, y], k2) => {
        outV.push(f(x), f(y));
        outUv.push(tuv[k2][0], tuv[k2][1]);
      });
      for (let j = 1; j + 1 < points.length; j++) outT.push(base, base + j, base + j + 1);
      continue;
    }
    for (const [x, y] of points) {
      const wa = weigh(d0 * (x - c[0]) + d1 * (y - c[1]));
      const wb = weigh(d4 * (x - c[0]) + d2 * (y - c[1]));
      const wc = 1 - wa - wb;
      outV.push(f(x), f(y));
      outUv.push(f(tuv[0][0] * wa + tuv[1][0] * wb + tuv[2][0] * wc), f(tuv[0][1] * wa + tuv[1][1] * wb + tuv[2][1] * wc));
    }
    for (let j = 1; j + 1 < points.length; j++) outT.push(base, base + j, base + j + 1);
  }
  return { clipped, vertices: outV, uvs: outUv, triangles: outT };
}

/** The clipper's reading of one attachment, replaceable by the suite's plants. */
export type TriangleClipper = (polygon: readonly number[], vertices: readonly number[], triangles: readonly number[], uvs: readonly number[]) => ClipResult;

/** One step of the draw walk: a slot, what its bone's activity is, and what it shows as the walk reads it. */
export type DrawStep =
  | { slot: string; kind: 'clip'; attachment: string; active: boolean; end: string | null; polygon: number[]; inverse: boolean }
  | { slot: string; kind: 'draw'; attachment: string; vertices: number[]; triangles: number[]; uvs: number[] }
  | { slot: string; kind: 'none' };

/** The local UVs the oracle hands a region's four corners to the clipper with, in the corner order (bottom-left, upper-left, upper-right, bottom-right). */
export const REGION_UVS: readonly number[] = [0, 1, 0, 0, 1, 0, 1, 1];
/** A region's two triangles over its four corners — the runtime's quad triangulation (`src/render.ts`'s `QUAD_TRIANGLES`). */
export const REGION_TRIANGLES: readonly number[] = [0, 1, 2, 2, 3, 0];

/**
 * The `clipped` block from the draw walk (the header's first table), every
 * number through `round`, or why it is absent: a clip that starts over a
 * polygon the core does not clip against, each named.
 */
export function poseClipped(walk: readonly DrawStep[], round: (v: number) => number | null, clip: TriangleClipper = clipTriangles): { rows: CoreClippedRow[] | null; why: string | null } {
  const rows: CoreClippedRow[] = [];
  const refused: string[] = [];
  let active: { end: string | null; polygon: number[] } | null = null;
  for (const step of walk) {
    if (step.kind === 'clip') {
      if (active !== null && active.end === step.slot) active = null;
      if (step.active && active === null) {
        const why = step.inverse ? 'it is inverse' : convexWhy(step.polygon);
        if (why !== null) refused.push(`slot "${step.slot}" starts clip "${step.attachment}", and ${why}`);
        active = { end: step.end, polygon: step.polygon };
      }
      continue;
    }
    if (step.kind === 'draw' && active !== null) {
      const r = clip(active.polygon, step.vertices, step.triangles, step.uvs);
      rows.push([step.slot, step.attachment, r.clipped ? 1 : 0, r.vertices.map(round), r.uvs.map(round), r.triangles]);
    }
    if (active !== null && active.end === step.slot) active = null;
  }
  if (refused.length > 0) {
    return { rows: null, why: `${refused.join('; ')} — the runtime decomposes such a polygon into convex pieces of its own choosing, or clips the outside of an inverse one, and neither was reproduced from the dump (src/core/clipping.ts)` };
  }
  return { rows, why: null };
}

