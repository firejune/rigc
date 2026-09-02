/**
 * The one place the ride's curve is written down.
 *
 * A path constraint follows a **path attachment**, and a path attachment is not
 * drawn: no runtime renders one (AUTHORING.md §3.4). So an example where the
 * viewer can see the track is really two things that have to agree — the
 * invisible curve in `rig.json`, and the rail PNG the viewer actually looks at.
 * Two copies of these numbers is how the cart ends up riding six pixels above
 * its own rail.
 *
 * ⇒ The numbers live here. `make_parts.ts` draws the rail from them, and then
 * reads `rig.json` back and refuses to finish if the path attachment disagrees.
 *
 * ## What the points are
 *
 * A Spine path is a composite cubic Bezier whose vertices are walked in groups
 * of three, and an **open** path drops the first and last point — those two are
 * the outer control handles of the end knots and no curve uses them. So an open
 * path of K curves carries `3(K + 1)` points, and for the three curves below
 * that is twelve:
 *
 * ```
 *   index  0        unused outer handle
 *          1        knot 0
 *          2, 3     the handles of curve 0
 *          4        knot 1
 *          5, 6     the handles of curve 1
 *          7        knot 2
 *          8, 9     the handles of curve 2
 *          10       knot 3
 *          11       unused outer handle
 * ```
 *
 * ## What the curve IS, physically
 *
 * It is the **axle line** — where the cart's wheel centres travel — not the top
 * of the rail. The rail art is this same curve pushed down by
 * {@link WHEEL_RADIUS}, which is what puts the wheels on it instead of through
 * it. Getting that backwards is invisible in the gate and obvious in a frame.
 */

/** The stage, in Spine world units. `rig.json`'s `skeleton.width`/`height`. */
export const STAGE_W = 1280;
/** The stage, in Spine world units. `rig.json`'s `skeleton.width`/`height`. */
export const STAGE_H = 720;

/** The wheel PNGs are square; this is half their edge, at the ride's scale. */
export const WHEEL_RADIUS = 34;

/** Rasterisation scale for the character parts — see `rigby.ts`. */
export const ART_SCALE = 0.5;

/**
 * The twelve control points of the axle curve, in Spine world coordinates
 * (y **up**, origin at the stage's bottom-left).
 *
 * Knot 0 sits high on the left, knot 1 at the bottom of the dip, knot 2 on the
 * far crest and knot 3 part-way down the other side. The handles at knots 1 and
 * 2 are deliberately level — a knot's tangent runs from the handle before it to
 * the handle after it, so a level pair is a flat bottom and a flat crest rather
 * than a corner.
 */
export const POINTS: ReadonlyArray<readonly [number, number]> = [
  [0, 370], // unused: knot 0's outer handle
  [150, 360], // knot 0
  [300, 350],
  [400, 155],
  [520, 150], // knot 1 — the bottom of the dip
  [640, 148],
  [760, 330],
  [880, 330], // knot 2 — the far crest
  [960, 330],
  [1060, 232],
  [1150, 230], // knot 3
  [1240, 228], // unused: knot 3's outer handle
];

/** The flat `x, y, x, y, …` array a path attachment's `vertices` field holds. */
export function vertices(): number[] {
  return POINTS.flatMap(([x, y]) => [x, y]);
}

/** How many points a path attachment declares. Open, three curves: `3(K + 1)`. */
export const VERTEX_COUNT = POINTS.length;

/** The four control points of curve `i`, in order: knot, handle, handle, knot. */
export function curve(i: number): Array<readonly [number, number]> {
  return [POINTS[3 * i + 1], POINTS[3 * i + 2], POINTS[3 * i + 3], POINTS[3 * i + 4]];
}

/** How many curves the composite has. */
export const CURVES = (POINTS.length - 3) / 3;

/** A point on curve `i` at parameter `t` in 0..1. */
export function pointOn(i: number, t: number): [number, number] {
  const [a, b, c, d] = curve(i);
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [
    w[0] * a[0] + w[1] * b[0] + w[2] * c[0] + w[3] * d[0],
    w[0] * a[1] + w[1] * b[1] + w[2] * c[1] + w[3] * d[1],
  ];
}

/**
 * A dense polyline through the whole composite, for **drawing only**.
 *
 * ⚠️ Not a measurement of the path. rigc measures the setup arc length off the
 * same vertices and writes it into the artifact's `lengths` (AUTHORING.md §3.4,
 * and it refuses an authored one) — that is the number a traversal is stated
 * against. This is here so the rail's sleepers can be spaced evenly along a
 * curve, and its resolution is chosen for that and nothing else.
 */
export function polyline(perCurve = 160): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < CURVES; i++) {
    for (let s = i === 0 ? 0 : 1; s <= perCurve; s++) out.push(pointOn(i, s / perCurve));
  }
  return out;
}

/** The `d` attribute of an SVG path that traces the composite, y flipped. */
export function svgPath(flipY: (y: number) => number, dropY = 0): string {
  const at = ([x, y]: readonly [number, number]): string => `${x} ${flipY(y - dropY)}`;
  let d = `M${at(POINTS[1])}`;
  for (let i = 0; i < CURVES; i++) {
    const [, b, c, e] = curve(i);
    d += ` C${at(b)} ${at(c)} ${at(e)}`;
  }
  return d;
}
