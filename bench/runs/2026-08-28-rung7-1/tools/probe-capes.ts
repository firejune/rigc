/**
 * Rung 7 — separating the two crimson parts.
 *
 * Both cape images are crimson, so the g-b split cannot tell them apart. What can:
 * the collar is drawn IN FRONT of the sack (the brief proves it from the beige-piece
 * census) and the panel BEHIND it, so on a frame where the sack covers the panel
 * entirely the only crimson left is the collar. walk/f0 is that frame — its sack is
 * 104 px wide against the panel's 97.6 art width.
 *
 * That gives the collar's own size for free, and the rest-pose crimson minus the
 * collar gives the panel's.
 */
import { readPlate } from '../../../../tools/plate.ts';
import { masksOf } from './frames.ts';
import { toWorldX, toWorldY } from './probe-rest.ts';

function box(m: Uint8Array, w: number, h: number, keep: (x: number, y: number) => boolean) {
  let l = w;
  let t = h;
  let r = -1;
  let b = -1;
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (m[y * w + x] && keep(x, y)) {
        n++;
        sx += x;
        sy += y;
        if (x < l) l = x;
        if (x > r) r = x;
        if (y < t) t = y;
        if (y > b) b = y;
      }
  return { n, l, t, r, b, cx: n ? sx / n : 0, cy: n ? sy / n : 0 };
}

for (const ref of ['walk/f0000', 'hello/f0000', 'fall-in/f0000', 'cape-follow-example/f0020']) {
  const m = masksOf(readPlate(`bench/reference-local/7-anticipation/${ref}.png`));
  const s = m.sackP;
  const inside = box(m.cape, m.w, m.h, (x) => x >= s.left && x <= s.right);
  const outside = box(m.cape, m.w, m.h, (x) => x < s.left || x > s.right);
  console.log(`\n== ${ref} ==   sack box x[${s.left}..${s.right}] y[${s.top}..${s.bottom}]`);
  console.log(
    `  crimson within the sack's x-span : ${String(inside.n).padStart(5)} px  box [${inside.l},${inside.t},${inside.r},${inside.b}]  ${inside.r - inside.l + 1}x${inside.b - inside.t + 1}  centroid (${inside.cx.toFixed(1)}, ${inside.cy.toFixed(1)})`,
  );
  console.log(
    `  crimson outside it              : ${String(outside.n).padStart(5)} px  box [${outside.l},${outside.t},${outside.r},${outside.b}]  ${outside.r - outside.l + 1}x${outside.b - outside.t + 1}  centroid (${outside.cx.toFixed(1)}, ${outside.cy.toFixed(1)})`,
  );
  if (inside.n)
    console.log(
      `  inside-span box in world: x [${toWorldX(inside.l).toFixed(1)} .. ${toWorldX(inside.r + 1).toFixed(1)}]  y [${toWorldY(inside.b + 1).toFixed(1)} .. ${toWorldY(inside.t).toFixed(1)}]`,
    );
}
