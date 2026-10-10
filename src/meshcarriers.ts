/**
 * Where a UV sample lies in a mesh's UV triangulation — §3 and correction 4 of
 * docs/MESH_REDUCTION.md, the common domain two triangulations of one
 * attachment are compared on.
 *
 * `uvCarriers` was written for the motion comparison (`src/meshcompare.ts`,
 * issue #1230), which still re-exports it from `rig-c/meshcompare` where it is
 * promised. It lives here, in a module that links no poser, because the
 * skinning residual (`src/meshskinning.ts`, issue #1294) reads the same carriers
 * from `rig-c/mesh`, which is geometry-only (§0, P1): one definition of "the
 * triangle that carries this UV" for both, so the residual and the motion row
 * it is compared with can never disagree about which triangle a sample is in.
 *
 * Pure: no clock, no randomness, no runtime.
 */
import { MeshReductionError } from './mesh.ts';
import { areaBand, triangleAreas } from './areaband.ts';

/** `pointInTriangle`'s epsilon in `src/mesh.ts`, applied to each barycentric coordinate. */
export const CONTAINS = 1e-9;

function refuse(code: string, message: string): never {
  throw new MeshReductionError(code, message);
}

/** A sample's carrier: the UV triangle that contains it, its three vertex indices and the sample's barycentric coordinates there. */
export interface Carrier {
  triangle: number;
  corners: [number, number, number];
  bary: [number, number, number];
}

/**
 * Issue #1323's faults in resolving several carriers, for the `mesh-compare` suite's controls: the rule before the
 * issue (the per-coordinate support alone, `slackSupport` never read); the slack read as the narrowest triangle's
 * rather than the widest's; and any shared vertex excused whatever the distance, so two triangles that both hold a
 * sample well inside — an overlap — carry it by the first.
 */
export type CarrierPlant = 'slack-support-unread' | 'narrowest-slack' | 'any-shared-vertex';

/**
 * Each sample's carrier in one mesh's UV triangulation — §3 and correction 4.
 * Throws `COMPARE_UV_CARRIER_NOT_UNIQUE` for a sample two triangles carry
 * other than across a vertex or edge they share — where "across" is read, since
 * issue #1323, to the distance the containment slack itself allows
 * (`slackSupport`).
 */
export function uvCarriers(uvs: readonly number[], triangles: readonly number[], samples: ReadonlyArray<{ uv: [number, number] }>, who: string): Array<Carrier | null> {
  return uvCarriersWith(uvs, triangles, samples, who, null);
}

/** `uvCarriers` with a fault planted in resolving several carriers (`CarrierPlant`). Internal: on no entry. */
export function uvCarriersWith(uvs: readonly number[], triangles: readonly number[], samples: ReadonlyArray<{ uv: [number, number] }>, who: string, plant: CarrierPlant | null): Array<Carrier | null> {
  const areas = triangleAreas(uvs, triangles);
  const band = areaBand(areas, uvs);
  const live: number[] = [];
  const boxes: number[] = [];
  for (let t = 0; t < areas.length; t++) {
    if (Math.abs(areas[t]) <= band) continue;
    live.push(t);
    const xs = [uvs[triangles[t * 3] * 2], uvs[triangles[t * 3 + 1] * 2], uvs[triangles[t * 3 + 2] * 2]];
    const ys = [uvs[triangles[t * 3] * 2 + 1], uvs[triangles[t * 3 + 1] * 2 + 1], uvs[triangles[t * 3 + 2] * 2 + 1]];
    boxes.push(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
  }
  const u = (v: number): number => uvs[v * 2];
  const w = (v: number): number => uvs[v * 2 + 1];
  // Issue #1295: the samples bucketed on a uniform grid, so each live triangle is tested only against the samples in
  // the cells its box (with the containment slack) overlaps — every (sample, triangle) pair the box test could pass is
  // still tested, by the same `carrierIn`, and each sample's hits are gathered in ascending triangle index, the order
  // a scan of every live triangle per sample gathered them in. The carriers are that scan's, value for value; what
  // changes is that the work no longer grows with samples × triangles.
  const n = samples.length;
  const hits: Array<Carrier[] | null> = new Array(n).fill(null);
  if (n > 0 && live.length > 0) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const s of samples) {
      minX = Math.min(minX, s.uv[0]);
      minY = Math.min(minY, s.uv[1]);
      maxX = Math.max(maxX, s.uv[0]);
      maxY = Math.max(maxY, s.uv[1]);
    }
    const G = Math.max(1, Math.min(1024, Math.ceil(Math.sqrt(n / 4))));
    const cw = (maxX - minX) / G || 1;
    const ch = (maxY - minY) / G || 1;
    const cellX = (x: number): number => Math.min(G - 1, Math.max(0, Math.floor((x - minX) / cw)));
    const cellY = (y: number): number => Math.min(G - 1, Math.max(0, Math.floor((y - minY) / ch)));
    const start = new Int32Array(G * G + 1);
    const cellOf = new Int32Array(n);
    samples.forEach((s, j) => {
      cellOf[j] = cellY(s.uv[1]) * G + cellX(s.uv[0]);
      start[cellOf[j] + 1]++;
    });
    for (let c = 0; c < G * G; c++) start[c + 1] += start[c];
    const order = new Int32Array(n);
    const fill = start.slice(0, G * G);
    for (let j = 0; j < n; j++) order[fill[cellOf[j]]++] = j;
    const slack = 1e-9;
    live.forEach((t, k) => {
      const [x0, y0, x1, y1] = [boxes[k * 4], boxes[k * 4 + 1], boxes[k * 4 + 2], boxes[k * 4 + 3]];
      const cy0 = cellY(y0 - slack);
      const cy1 = cellY(y1 + slack);
      const cx0 = cellX(x0 - slack);
      const cx1 = cellX(x1 + slack);
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const c = cy * G + cx;
          for (let q = start[c]; q < start[c + 1]; q++) {
            const j = order[q];
            const hit = carrierIn(samples[j].uv[0], samples[j].uv[1], x0, y0, x1, y1, triangles[t * 3], triangles[t * 3 + 1], triangles[t * 3 + 2], u, w, t);
            if (hit !== null) (hits[j] ??= []).push(hit);
          }
        }
      }
    });
  }
  const uvOf = (v: number): readonly [number, number] => [uvs[v * 2], uvs[v * 2 + 1]];
  return samples.map((s, j) => resolveCarriers(s.uv[0], s.uv[1], hits[j] ?? [], who, uvOf, plant));
}

/**
 * Whether the UV triangle i0, i1, i2 (`t`, its box x0..x1, y0..y1) carries the sample at (px, py), and where: the
 * carrier, or null. The one containment test — `uvCarriers` and the reduction's carried residual (issue #1295) both
 * read it, so a sample is in a triangle by one arithmetic.
 */
export function carrierIn(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  i0: number,
  i1: number,
  i2: number,
  u: (v: number) => number,
  v: (v: number) => number,
  t: number,
): Carrier | null {
  const slack = 1e-9;
  if (px < x0 - slack || py < y0 - slack || px > x1 + slack || py > y1 + slack) return null;
  const ax = u(i0);
  const ay = v(i0);
  const bx = u(i1) - ax;
  const by = v(i1) - ay;
  const cx = u(i2) - ax;
  const cy = v(i2) - ay;
  const qx = px - ax;
  const qy = py - ay;
  const det = bx * cy - cx * by;
  const l1 = (qx * cy - cx * qy) / det;
  const l2 = (bx * qy - qx * by) / det;
  const l0 = 1 - l1 - l2;
  if (l0 < -CONTAINS || l1 < -CONTAINS || l2 < -CONTAINS) return null;
  return { triangle: t, corners: [i0, i1, i2], bary: [l0, l1, l2] };
}

/**
 * The carrier of a sample from every triangle that contains it: none, the one, or — several — the first when they all
 * meet there at a shared vertex or edge; else `COMPARE_UV_CARRIER_NOT_UNIQUE` (correction 4). Where the per-coordinate
 * support refuses, the support is read again to the slack's distance (issue #1323, {@link slackSupport}) when the
 * corners' UVs are given (`uvOf`).
 */
export function resolveCarriers(
  px: number,
  py: number,
  hits: readonly Carrier[],
  who: string,
  uvOf: ((v: number) => readonly [number, number]) | null = null,
  plant: CarrierPlant | null = null,
): Carrier | null {
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0];
  // Several carriers are one hit only across a vertex or an edge they all share: the sample's support — the corners
  // it does not sit at zero weight on — is then the same vertex indices in each, and the carried point is theirs.
  const shared = (supportOf: (c: Carrier) => string): boolean => {
    const first = supportOf(hits[0]);
    return first.split(',').length <= 2 && hits.every((c) => supportOf(c) === first);
  };
  const byCoordinate = (c: Carrier): string =>
    c.corners
      .filter((_v, k) => c.bary[k] > CONTAINS)
      .sort((a, b) => a - b)
      .join(',');
  if (!shared(byCoordinate) && (uvOf === null || plant === 'slack-support-unread' || !shared(slackSupport(hits, uvOf, plant)))) {
    refuse(
      'COMPARE_UV_CARRIER_NOT_UNIQUE',
      `${who}: the sample at uv (${px}, ${py}) lies in ${hits.length} UV triangles — ${hits.map((c) => `triangle ${c.triangle} (vertices ${c.corners.join(', ')})`).join(' and ')} — that do not meet there at a shared vertex or edge; required one carrier per sample (correction 4: overlapping or folded UV triangles would carry it by an arbitrary one)`,
    );
  }
  return hits[0];
}

/**
 * Issue #1323: a carrier's support read to the slack's distance rather than per coordinate — the corners the sample
 * lies further than `CONTAINS × H` (UV units) inside of, measured from each corner's opposite edge, with `H` the widest
 * triangle height among the hits: the furthest outside a triangle the containment test (`carrierIn`) admitted any of
 * them at this sample.
 *
 * Why: the slack is per barycentric coordinate, so in distance it is `CONTAINS` times the height of the corner it is
 * read against. A sample on a shared edge, a hair to one side — a pixel centre on a 45° or axis-parallel edge between
 * whole-pixel vertices, put off it by the UVs' rounding — is admitted by the triangle it is outside of, while the
 * triangle it is inside of, if it is a sliver, reads its third corner's coordinate above `CONTAINS` because its height
 * is small: two per-coordinate supports, read as an overlap though the sample is within the slack of the edge both
 * share. Measured on demo/bottomwear's reduction at source spacing 18: 1.35e-10 uv from the edge, coordinates −3.2e-10
 * and +6.5e-8, heights 0.42 and 0.0021. Read in distance, both corners are within the slack and the support is the
 * shared edge. A sample two triangles both hold further inside than that — an overlap or a fold — is still refused.
 */
function slackSupport(hits: readonly Carrier[], uvOf: (v: number) => readonly [number, number], plant: CarrierPlant | null): (c: Carrier) => string {
  if (plant === 'any-shared-vertex') {
    const common = hits[0].corners.filter((v) => hits.every((c) => c.corners.includes(v)));
    return () => (common.length > 0 ? [...common].sort((a, b) => a - b).slice(0, 1).join(',') : 'none');
  }
  const heights = new Map<Carrier, [number, number, number]>();
  let widest = 0;
  let narrowest = Infinity;
  for (const c of hits) {
    const p = c.corners.map(uvOf);
    const twice = Math.abs((p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[2][0] - p[0][0]) * (p[1][1] - p[0][1]));
    const h = [0, 1, 2].map((k) => {
      const a = p[(k + 1) % 3];
      const b = p[(k + 2) % 3];
      return twice / Math.hypot(b[0] - a[0], b[1] - a[1]);
    }) as [number, number, number];
    heights.set(c, h);
    widest = Math.max(widest, ...h);
    narrowest = Math.min(narrowest, ...h);
  }
  const slack = CONTAINS * (plant === 'narrowest-slack' ? narrowest : widest);
  return (c: Carrier): string => {
    const h = heights.get(c)!;
    return c.corners
      .filter((_v, k) => c.bary[k] * h[k] > slack)
      .sort((a, b) => a - b)
      .join(',');
  };
}
