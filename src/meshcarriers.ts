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
const CONTAINS = 1e-9;

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
 * Each sample's carrier in one mesh's UV triangulation — §3 and correction 4.
 * Throws `COMPARE_UV_CARRIER_NOT_UNIQUE` for a sample two triangles carry
 * other than across a vertex or edge they share.
 */
export function uvCarriers(uvs: readonly number[], triangles: readonly number[], samples: ReadonlyArray<{ uv: [number, number] }>, who: string): Array<Carrier | null> {
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
  return samples.map((s) => {
    const [px, py] = s.uv;
    const hits: Carrier[] = [];
    live.forEach((t, k) => {
      const slack = 1e-9;
      if (px < boxes[k * 4] - slack || py < boxes[k * 4 + 1] - slack || px > boxes[k * 4 + 2] + slack || py > boxes[k * 4 + 3] + slack) return;
      const i0 = triangles[t * 3];
      const i1 = triangles[t * 3 + 1];
      const i2 = triangles[t * 3 + 2];
      const ax = uvs[i0 * 2];
      const ay = uvs[i0 * 2 + 1];
      const bx = uvs[i1 * 2] - ax;
      const by = uvs[i1 * 2 + 1] - ay;
      const cx = uvs[i2 * 2] - ax;
      const cy = uvs[i2 * 2 + 1] - ay;
      const qx = px - ax;
      const qy = py - ay;
      const det = bx * cy - cx * by;
      const l1 = (qx * cy - cx * qy) / det;
      const l2 = (bx * qy - qx * by) / det;
      const l0 = 1 - l1 - l2;
      if (l0 < -CONTAINS || l1 < -CONTAINS || l2 < -CONTAINS) return;
      hits.push({ triangle: t, corners: [i0, i1, i2], bary: [l0, l1, l2] });
    });
    if (hits.length === 0) return null;
    if (hits.length === 1) return hits[0];
    // Several carriers are one hit only across a vertex or an edge they all share: the sample's support — the corners
    // it does not sit at zero weight on — is then the same vertex indices in each, and the carried point is theirs.
    const support = (c: Carrier): string =>
      c.corners
        .filter((_v, k) => c.bary[k] > CONTAINS)
        .sort((a, b) => a - b)
        .join(',');
    const first = support(hits[0]);
    const shared = first.split(',').length <= 2 && hits.every((c) => support(c) === first);
    if (!shared) {
      refuse(
        'COMPARE_UV_CARRIER_NOT_UNIQUE',
        `${who}: the sample at uv (${px}, ${py}) lies in ${hits.length} UV triangles — ${hits.map((c) => `triangle ${c.triangle} (vertices ${c.corners.join(', ')})`).join(' and ')} — that do not meet there at a shared vertex or edge; required one carrier per sample (correction 4: overlapping or folded UV triangles would carry it by an arbitrary one)`,
      );
    }
    return hits[0];
  });
}
