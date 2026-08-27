/**
 * Rung 7 — what the rest pose looks like, part by part, and where it sits in the
 * frames' own world coordinates.
 *
 * frames.json declares the viewport box and the scale, so a screen pixel converts
 * into the units a rig is authored in without any fitting. check() will keep that
 * box for a candidate whose pixels land in it, which is worth 15-25 MAE
 * (AUTHORING.md §9.2), so the rig is authored in these coordinates from the start.
 */
import { readPlate } from '../../../../tools/plate.ts';
import { masksOf, components, diameterOf } from './frames.ts';

const V = { x: -782.813282811969, y: -317.25848745883843, scale: 0.18987105139412822, ph: 798 };
export const toWorldX = (px: number): number => V.x + px / V.scale;
export const toWorldY = (py: number): number => V.y + (V.ph - py) / V.scale;
export const toPixelX = (wx: number): number => (wx - V.x) * V.scale;
export const toPixelY = (wy: number): number => V.ph - (wy - V.y) * V.scale;

function labelled(m: Uint8Array, w: number, h: number): { size: number; box: number[]; cx: number; cy: number }[] {
  const seen = new Uint8Array(w * h);
  const out: { size: number; box: number[]; cx: number; cy: number }[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || seen[s]) continue;
    const stack = [s];
    seen[s] = 1;
    let size = 0;
    let sx = 0;
    let sy = 0;
    let l = w;
    let t = h;
    let r = -1;
    let b = -1;
    while (stack.length) {
      const i = stack.pop()!;
      const y = (i / w) | 0;
      const x = i % w;
      size++;
      sx += x;
      sy += y;
      if (x < l) l = x;
      if (x > r) r = x;
      if (y < t) t = y;
      if (y > b) b = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (m[j] && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
    }
    out.push({ size, box: [l, t, r, b], cx: sx / size, cy: sy / size });
  }
  return out.sort((a, b) => b.size - a.size);
}

for (const ref of ['hello/f0000', 'fall-in/f0020', 'cape-follow-example/f0000', 'walk/f0000']) {
  const m = masksOf(readPlate(`bench/reference-local/7-anticipation/${ref}.png`));
  console.log(`\n== ${ref} ==`);
  const s = m.sackP;
  const c = m.capeP;
  console.log(
    `  beige  box px [${s.left}..${s.right}] x [${s.top}..${s.bottom}]  ${s.right - s.left + 1}x${s.bottom - s.top + 1}` +
      `  area ${s.area}  centroid (${s.cx.toFixed(1)}, ${s.cy.toFixed(1)})  diameter ${diameterOf(m.sack, m.w, m.h).toFixed(1)}`,
  );
  console.log(
    `         world box x [${toWorldX(s.left).toFixed(1)} .. ${toWorldX(s.right + 1).toFixed(1)}]` +
      `  y [${toWorldY(s.bottom + 1).toFixed(1)} .. ${toWorldY(s.top).toFixed(1)}]` +
      `  => ${((s.right + 1 - s.left) / V.scale).toFixed(1)} x ${((s.bottom + 1 - s.top) / V.scale).toFixed(1)} units`,
  );
  console.log(`         beige components: ${labelled(m.sack, m.w, m.h).map((k) => `${k.size}@[${k.box.join(',')}]`).join('  ')}`);
  console.log(`  crimson box px [${c.left}..${c.right}] x [${c.top}..${c.bottom}]  area ${c.area}  centroid (${c.cx.toFixed(1)}, ${c.cy.toFixed(1)})`);
  console.log(`         crimson components (size@[l,t,r,b]):`);
  for (const k of labelled(m.cape, m.w, m.h).slice(0, 8))
    console.log(`           ${String(k.size).padStart(5)} @ [${k.box.join(', ')}]  centroid (${k.cx.toFixed(1)}, ${k.cy.toFixed(1)})`);
  console.log(`  subject components: ${components(m.drawn, m.w, m.h)}`);
}
