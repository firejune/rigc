/**
 * Procedural mesh geometry — the mesh tier of plan 04 section 7-1 step 4.
 *
 * The shape this builds is the one plan 02 section 2-3 ① asks for and calls the
 * `lip` ring: **the rim is nailed down and only the inside moves.** On the face
 * cut that ring is the mouth aperture, and the rim already exists as data — the
 * mask polygon in the cut manifest is exactly the contour where the generated
 * part fades into untouched base pixels. Pin those vertices to the slot bone at
 * weight 1 and the seam cannot move, which is the whole reason a mesh is safe
 * here at all.
 *
 * Three rings and a hub:
 *
 *     rim ring    = the part WINDOW edge            weight 1.0 -> anchor bone
 *     seam ring   = the manifest polygon            weight 1.0 -> anchor bone
 *     inner ring  = the polygon scaled toward the   weight w   -> control bone
 *                   aperture centre by `inner`
 *     hub         = the aperture centre             weight 1.0 -> control bone
 *
 * The rim ring is not decoration and the first cut of this code did not have it.
 * Measured on `mouth_wide_open`: 6138 pixels of non-zero alpha (up to 192/255)
 * lie OUTSIDE the mask polygon — that is the feather, the soft ramp that makes
 * generated pixels blend into the base at all. A mesh whose outer ring is the
 * polygon simply does not draw them, and the render probe caught it as a halo
 * of difference reaching ~6px past the polygon versus the rigid build. So the
 * mesh covers the whole region (rim ring on the window edge, uv 0 and 1) and the
 * polygon becomes an interior ring — pinned, because it is still the seam.
 *
 * The control bone carries every key, so key count is independent of vertex
 * count and a physics constraint could later be hung on the same bone for free
 * (plan 04 section 1-4, option ①). There are no deform timelines: option ② is
 * the fallback for when procedural weighting fails, and it has not.
 *
 * Everything here is pure and integer-stable: same manifest in, same floats out
 * (assertion A18 recompiles and compares bytes).
 */

export interface MeshSpecInput {
  /** Polygon in part-local pixels, y down, in manifest order. */
  hull: Array<[number, number]>;
  /** Aperture centre in part-local pixels, y down. */
  center: [number, number];
  /** Inner ring position: 0 = at the centre, 1 = on the hull. */
  inner: number;
  /** Part window size in pixels, for UVs. */
  size: [number, number];
  /** Optional directional weighting across the mouth line — see `sideWeight`. */
  bias?: { axis_deg: number; ramp: [number, number] };
  /**
   * Screen-space angle of each control bone as seen from the aperture centre, in
   * control-bone order. One entry keeps the single-bone behaviour exactly; more
   * than one splits the ring's authority by angular position, which is how four
   * grips make a ring expand unevenly without a key per vertex.
   */
  controlAngles?: number[];
}

export interface MeshVertexWeight {
  /** 'anchor' pins to the slot bone, 'control' to a control/chain bone. */
  bone: 'anchor' | 'control';
  /** Index into the control-bone list. Absent means 0. */
  control?: number;
  weight: number;
}

export interface MeshGeometry {
  kind: 'ring' | 'ribbon';
  /** Vertex positions in part-local pixels, y down. */
  points: Array<[number, number]>;
  /** Normalised region UVs, v measured from the top edge. */
  uvs: number[];
  /** Triangle indices, counter-clockwise in Spine world (y up). */
  triangles: number[];
  /** Per-vertex weights, parallel to `points`. */
  weights: MeshVertexWeight[][];
  /** Hull vertex count — emitted as `hull`, which the loader doubles. */
  hullVertices: number;
}

/**
 * A two-wide strip along a bone chain — the `fluid` drip of plan 02 section 2-3
 * item 2. A drip changes length without changing width and its path curves;
 * region scale cannot express either, because scaling a region longer also makes
 * it fatter.
 *
 * The width guarantee is structural, not a hope: the two vertices of a row carry
 * IDENTICAL weights, so whatever the chain does to one it does to the other, and
 * their separation can only rotate. Assertion A28 checks exactly that, which
 * turns "length without width" from a claim into a property of the file.
 */
export interface RibbonSpecInput {
  /** Part window size in pixels. The strip spans it, so uv 0 and 1 are covered. */
  size: [number, number];
  /** Cross rows, entry first. Triangles = 2 * (rows - 1). */
  rows: number;
  /** Number of chain bones after the anchor. */
  chainCount: number;
}

export class MeshError extends Error {}

/** Round to 6 decimals and never emit "-0" (byte-stable output). */
function r6(n: number): number {
  const v = Math.round(n * 1e6) / 1e6;
  return v === 0 ? 0 : v;
}

/**
 * Smoothstep falloff from the hub (r=0, full control) to the hull (r=1, none).
 *
 * A linear ramp puts a visible crease on the inner ring because the second
 * derivative jumps there; smoothstep is flat at both ends, so the deformation
 * dies into the pinned rim instead of hitting it.
 */
export function falloff(r: number): number {
  const t = Math.max(0, Math.min(1, r));
  return r6(1 - (3 * t * t - 2 * t * t * t));
}

/**
 * Directional authority across an axis: 0 on the negative side, 1 on the
 * positive side, smoothstep over `ramp`.
 *
 * This is what makes a jaw read as a jaw. A radial falloff alone deforms the
 * ring symmetrically, so opening the mouth drags the upper lip down with the
 * lower one and takes the upper teeth with it — measured on this art, the teeth
 * sit 15px on the negative side of the mouth line, squarely inside the moving
 * zone. Ramping authority across the line leaves everything above it pinned.
 */
export function sideWeight(signedDistance: number, ramp: [number, number]): number {
  const [d0, d1] = ramp;
  if (!(d1 > d0)) throw new MeshError(`bias ramp must increase, got [${d0}, ${d1}]`);
  const t = Math.max(0, Math.min(1, (signedDistance - d0) / (d1 - d0)));
  return r6(3 * t * t - 2 * t * t * t);
}

/** Signed area of a polygon in the given (y-down) coordinates. */
export function signedArea(poly: Array<[number, number]>): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

/**
 * Is every hull edge visible from `center`? If not, scaling the polygon toward
 * the centre can fold the inner ring through the rim and the triangles cross —
 * a mesh that loads with no error and renders as folded meat. Better to refuse.
 */
export function isStarShaped(poly: Array<[number, number]>, center: [number, number]): boolean {
  const area = signedArea(poly);
  const [cx, cy] = center;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    const cross = (x1 - x0) * (cy - y0) - (y1 - y0) * (cx - x0);
    if (cross * area <= 0) return false;
  }
  return true;
}

/**
 * Cast a ray from `center` through `through` and return the point where it
 * leaves the [0,w]x[0,h] window. The polygon lives inside the window, so the
 * ray always exits after it — this is what keeps the rim ring in 1:1
 * correspondence with the seam ring, and a clean quad strip between them.
 */
export function rayToWindowEdge(
  center: [number, number],
  through: [number, number],
  size: [number, number],
): [number, number] {
  const [cx, cy] = center;
  const [px, py] = through;
  const [w, h] = size;
  const dx = px - cx;
  const dy = py - cy;
  if (dx === 0 && dy === 0) throw new MeshError('a polygon vertex sits exactly on the aperture centre');
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (w - cx) / dx);
  if (dx < 0) t = Math.min(t, (0 - cx) / dx);
  if (dy > 0) t = Math.min(t, (h - cy) / dy);
  if (dy < 0) t = Math.min(t, (0 - cy) / dy);
  if (!Number.isFinite(t) || t <= 0) throw new MeshError('ray to the window edge did not converge');
  return [r6(cx + dx * t), r6(cy + dy * t)];
}

export function buildRingMesh(input: MeshSpecInput): MeshGeometry {
  const { hull, center, inner, size } = input;
  const n = hull.length;
  if (n < 6) throw new MeshError(`hull needs at least 6 points, got ${n}`);
  if (!(inner > 0 && inner < 1)) throw new MeshError(`inner must be in (0,1), got ${inner}`);
  const [w, h] = size;
  if (!(w > 0 && h > 0)) throw new MeshError(`bad part size ${w}x${h}`);

  for (const [x, y] of hull) {
    if (x < 0 || y < 0 || x > w || y > h) {
      throw new MeshError(`hull point (${x},${y}) is outside the ${w}x${h} part window`);
    }
  }
  if (!isStarShaped(hull, center)) {
    throw new MeshError('hull is not star-shaped about the aperture centre; the inner ring would fold');
  }
  const [cx, cy] = center;
  if (cx < 0 || cy < 0 || cx > w || cy > h) {
    throw new MeshError(`aperture centre (${cx},${cy}) is outside the ${w}x${h} part window`);
  }

  const points: Array<[number, number]> = [];
  const weights: MeshVertexWeight[][] = [];
  const pin = (x: number, y: number) => {
    points.push([r6(x), r6(y)]);
    weights.push([{ bone: 'anchor', weight: 1 }]);
  };

  // ring 0 — the window edge. Covers the feather, so nothing the part draws is
  // outside the mesh; pinned, so uv 0/1 stay put.
  for (const [x, y] of hull) {
    const [ex, ey] = rayToWindowEdge(center, [x, y], size);
    pin(ex, ey);
  }
  // ring 1 — the mask contour. This IS the seam: pinned at weight 1.
  for (const [x, y] of hull) pin(x, y);
  // ring 2 — the aperture ring, shared between the two bones by the falloff and,
  // when a bias axis is declared, by which side of the mouth line it lands on.
  const wInner = falloff(inner);
  const axis = input.bias
    ? ([Math.cos((input.bias.axis_deg * Math.PI) / 180), Math.sin((input.bias.axis_deg * Math.PI) / 180)] as const)
    : null;
  // Normal of the mouth line, pointing to the jaw side (screen y down).
  const normal = axis ? ([-axis[1], axis[0]] as const) : null;
  const sideOf = (x: number, y: number): number => {
    if (!normal || !input.bias) return 1;
    return sideWeight((x - cx) * normal[0] + (y - cy) * normal[1], input.bias.ramp);
  };
  // Angular split across several control bones. With one control this collapses
  // to "all authority to control 0", which is the single-bone path byte for byte.
  const controlAngles = input.controlAngles ?? [0];
  if (controlAngles.length < 1) throw new MeshError('a ring mesh needs at least one control bone');
  const sorted = controlAngles
    .map((deg, index) => ({ index, deg: ((deg % 360) + 360) % 360 }))
    .sort((p, q) => (p.deg === q.deg ? p.index - q.index : p.deg - q.deg));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].deg === sorted[i - 1].deg) {
      throw new MeshError(`two control bones share the angle ${sorted[i].deg} degrees about the aperture centre`);
    }
  }
  /** Which controls own the authority at this angle, and in what proportion. */
  const splitByAngle = (x: number, y: number): Array<{ index: number; share: number }> => {
    if (sorted.length === 1) return [{ index: sorted[0].index, share: 1 }];
    const deg = ((Math.atan2(y - cy, x - cx) * 180) / Math.PI + 360) % 360;
    let k = sorted.length - 1; // the wrap-around arc, unless we find a better one
    for (let i = 0; i < sorted.length; i++) {
      const next = (i + 1) % sorted.length;
      const from = sorted[i].deg;
      const to = sorted[next].deg + (next === 0 ? 360 : 0);
      const d = deg < from ? deg + 360 : deg;
      if (d >= from && d < to) {
        k = i;
        break;
      }
    }
    const next = (k + 1) % sorted.length;
    const from = sorted[k].deg;
    const to = sorted[next].deg + (next === 0 ? 360 : 0);
    const d = deg < from ? deg + 360 : deg;
    const t = to === from ? 0 : (d - from) / (to - from);
    // Smoothstep for the same reason the radial falloff uses it: a linear blend
    // puts a crease exactly on the bone's angle.
    const s = r6(3 * t * t - 2 * t * t * t);
    const out: Array<{ index: number; share: number }> = [];
    if (s < 1) out.push({ index: sorted[k].index, share: r6(1 - s) });
    if (s > 0) out.push({ index: sorted[next].index, share: s });
    return out;
  };
  const share = (x: number, y: number, base: number) => {
    const w = r6(base * sideOf(x, y));
    points.push([r6(x), r6(y)]);
    // A zero weight is not a weight: the validator rejects it (A20), and the
    // loader would happily read it as a bone that owns nothing.
    if (w <= 0) {
      weights.push([{ bone: 'anchor', weight: 1 }]);
      return;
    }
    const parts = splitByAngle(x, y);
    const vertex: MeshVertexWeight[] = [];
    if (w < 1) vertex.push({ bone: 'anchor', weight: r6(1 - w) });
    for (const part of parts) {
      const weight = r6(w * part.share);
      if (weight > 0) vertex.push({ bone: 'control', control: part.index, weight });
    }
    weights.push(vertex);
  };
  for (const [x, y] of hull) {
    share(cx + (x - cx) * inner, cy + (y - cy) * inner, wInner);
  }
  // hub — at the centre of the aperture, so the bias ramp decides its share too.
  share(cx, cy, 1);

  const uvs: number[] = [];
  for (const [x, y] of points) uvs.push(r6(x / w), r6(y / h));

  // Counter-clockwise in Spine world: the manifest polygon runs clockwise on
  // screen (y down), and the y flip into world space reverses that.
  const triangles: number[] = [];
  const hub = 3 * n;
  const strip = (outerBase: number, innerBase: number) => {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      triangles.push(outerBase + i, outerBase + j, innerBase + j);
      triangles.push(outerBase + i, innerBase + j, innerBase + i);
    }
  };
  strip(0, n); // window edge -> seam
  strip(n, 2 * n); // seam -> aperture ring
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    triangles.push(2 * n + i, 2 * n + j, hub);
  }

  return { kind: 'ring', points, uvs, triangles, weights, hullVertices: n };
}

/**
 * Build the fluid ribbon.
 *
 * Vertices run in PERIMETER order — left side entry-to-tip, then right side
 * tip-to-entry — so the emitted `hull` is the real outline rather than a
 * convenient prefix. That matters because `hull` is data other tools read, and a
 * strip's outline genuinely is all of its vertices.
 *
 * Weights: knot 0 is the anchor bone at the entry point, knots 1..C are the chain
 * bones, spaced evenly along the strip. A row between two knots blends linearly
 * between them, and BOTH vertices of the row get the same blend. The entry row is
 * pinned to the anchor at weight 1, which is what keeps the drip's origin at the
 * entry point while the rest of it falls — assertion A21's ribbon branch.
 */
export function buildRibbonMesh(input: RibbonSpecInput): MeshGeometry {
  const { rows, chainCount } = input;
  const [w, h] = input.size;
  if (!(w > 0 && h > 0)) throw new MeshError(`bad part size ${w}x${h}`);
  if (!Number.isInteger(rows) || rows < 3) throw new MeshError(`ribbon needs at least 3 rows, got ${rows}`);
  if (!Number.isInteger(chainCount) || chainCount < 1) {
    throw new MeshError(`ribbon needs at least one chain bone, got ${chainCount}`);
  }

  const points: Array<[number, number]> = [];
  const weights: MeshVertexWeight[][] = [];
  const rowWeights: MeshVertexWeight[][] = [];
  for (let i = 0; i < rows; i++) {
    // s runs 0 at the entry to 1 at the tip; knots sit at k / chainCount.
    const s = (i / (rows - 1)) * chainCount;
    const lo = Math.min(Math.floor(s), chainCount - 1);
    const t = r6(s - lo);
    const vertex: MeshVertexWeight[] = [];
    // knot index 0 is the anchor bone; 1..chainCount are chain[0..chainCount-1].
    const push = (knot: number, weight: number) => {
      if (weight <= 0) return;
      if (knot === 0) vertex.push({ bone: 'anchor', weight: r6(weight) });
      else vertex.push({ bone: 'control', control: knot - 1, weight: r6(weight) });
    };
    push(lo, 1 - t);
    push(lo + 1, t);
    rowWeights.push(vertex);
  }
  const rowY = (i: number) => r6((i / (rows - 1)) * h);
  // left side, entry -> tip
  for (let i = 0; i < rows; i++) {
    points.push([0, rowY(i)]);
    weights.push(rowWeights[i]);
  }
  // right side, tip -> entry
  for (let i = rows - 1; i >= 0; i--) {
    points.push([r6(w), rowY(i)]);
    weights.push(rowWeights[i]);
  }

  const uvs: number[] = [];
  for (const [x, y] of points) uvs.push(r6(x / w), r6(y / h));

  // Quad strip. Left row i is index i; right row i is index (2*rows - 1 - i).
  const triangles: number[] = [];
  const L = (i: number) => i;
  const R = (i: number) => 2 * rows - 1 - i;
  for (let i = 0; i < rows - 1; i++) {
    triangles.push(L(i), L(i + 1), R(i + 1));
    triangles.push(L(i), R(i + 1), R(i));
  }

  return { kind: 'ribbon', points, uvs, triangles, weights, hullVertices: 2 * rows };
}

/** One bone a weighted vertex can bind to: its index, and its world inverse. */
export interface MeshBoneRef {
  index: number;
  /** Spine world point -> this bone's local space, at the setup pose. */
  toBind: (worldX: number, worldY: number) => [number, number];
}

/**
 * Weighted-mesh `vertices` encoding: per vertex, boneCount then
 * (boneIndex, bindX, bindY, weight) repeated.
 *
 * Bind coordinates are in each bone's LOCAL space, so a rotated bone needs a real
 * inverse transform — see `src/transform.ts` for why the old "world minus origin"
 * shortcut had to go and what it would have failed like.
 *
 * The encoding is chosen by a length comparison alone (plan 04 section 1-3), so
 * there is no field that says "weighted" — get the run lengths wrong and the
 * loader reads weights as coordinates without a word.
 */
export function encodeWeightedVertices(
  geometry: MeshGeometry,
  /** Part-local pixel -> Spine world. */
  toWorld: (x: number, y: number) => [number, number],
  bones: { anchor: MeshBoneRef; controls: MeshBoneRef[] },
): number[] {
  const out: number[] = [];
  geometry.points.forEach(([px, py], i) => {
    const [wx, wy] = toWorld(px, py);
    const vw = geometry.weights[i];
    out.push(vw.length);
    for (const { bone, control, weight } of vw) {
      const ref = bone === 'anchor' ? bones.anchor : bones.controls[control ?? 0];
      if (!ref) throw new MeshError(`vertex ${i} binds to control bone ${control ?? 0}, which the rig does not have`);
      const [bx, by] = ref.toBind(wx, wy);
      out.push(ref.index, bx, by, r6(weight));
    }
  });
  return out;
}
