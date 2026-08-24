/** Spine's normalised Bezier handles, evaluated the way the runtime does. */
export type Handles = [number, number, number, number];
export function bezierY(h: Handles, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const [x1, y1, x2, y2] = h;
  let lo = 0, hi = 1, t = x;
  for (let i = 0; i < 24; i++) {
    const mt = 1 - t;
    const bx = 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t;
    if (bx < x) lo = t; else hi = t;
    t = (lo + hi) / 2;
  }
  const mt = 1 - t;
  return 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t;
}
/** the candidate shapes pass A draws from — ease in / out / both, at strengths. */
export function candidateTable(): Record<string, Handles> {
  const out: Record<string, Handles> = {};
  const S = [0.2, 0.35, 0.5, 0.7, 0.9];
  for (const a of S) for (const b of S) out[`e${Math.round(a * 100)}_${Math.round(b * 100)}`] = [a, 0, 1 - b, 1];
  for (const a of S) out[`out${Math.round(a * 100)}`] = [a, 0, 1, 1];
  for (const b of S) out[`in${Math.round(b * 100)}`] = [0, 0, 1 - b, 1];
  for (const a of S) out[`over${Math.round(a * 100)}`] = [a, 0.25, 1 - a, 0.75];
  // near-linear and shallow shapes, so that a span whose automatic handles are
  // straight has something to snap to other than a hard ease.
  out.line = [1 / 3, 1 / 3, 2 / 3, 2 / 3];
  out.drift = [0.25, 0.2, 0.75, 0.8];
  out.hold = [0.5, 0.5, 0.5, 0.5];
  return out;
}
