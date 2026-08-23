/**
 * The pendulum's structural constants, fitted from the frames' geometry alone.
 *
 * The topmost bead is the one the discus covers, so its centroid is a crescent's
 * and it wanders with the relative angle — measuring the top joint off it is the
 * one thing in this shot that is *not* solid. So the top joint is fitted instead:
 * the pivot the chain hangs from is the point, fixed in the discus's own frame,
 * that keeps its distance to the **second** bead constant across every frame. The
 * second bead is never occluded.
 *
 * `bun bench/runs/2026-08-23-rung8-1/tools/fit-pendulum-geometry.ts`
 */
import { readPlate } from '../../../../tools/plate.ts';
import { IMAGES, sidecar, isOrange } from './frames.ts';
import { measurePendulum } from './measure-pendulum.ts';
import { join } from 'node:path';

/** Farthest-apart pair of the platform art's orange rim, in image pixels. */
function rimTipsOfArt(): { midX: number; midY: number; length: number } {
  const plate = readPlate(join(IMAGES, 'platform.png'));
  const pts: [number, number][] = [];
  for (let y = 0; y < plate.height; y++) {
    for (let x = 0; x < plate.width; x++) {
      const [r, g, b, a] = plate.get(x, y);
      if (a > 128 && isOrange(r, g, b)) pts.push([x, y]);
    }
  }
  let best = -1;
  let a: [number, number] = pts[0];
  let b: [number, number] = pts[0];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = (pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2;
      if (d > best) {
        best = d;
        a = pts[i];
        b = pts[j];
      }
    }
  }
  return { midX: (a[0] + b[0]) / 2, midY: (a[1] + b[1]) / 2, length: Math.sqrt(best) };
}

if (import.meta.main) {
  const side = sidecar('pendulum');
  const scale = side.viewport.scale;
  const art = rimTipsOfArt();
  console.log(
    `platform.png rim: tip-to-tip ${art.length.toFixed(1)} art px → ${(art.length * scale).toFixed(2)} frame px ` +
      `at scale ${scale.toFixed(6)}; tip midpoint (${art.midX.toFixed(1)}, ${art.midY.toFixed(1)}) in a ${687}x${106} image`,
  );

  for (const [label, dir] of [
    ['12 fps', 'follow-through'],
    ['24 fps', 'follow-through@24fps'],
  ] as const) {
    const frames = measurePendulum(dir);
    // bead 2 in the discus's own frame
    const q: [number, number][] = frames.map((f) => {
      const dx = f.beads[1].cx - f.cx;
      const dy = f.beads[1].cy - f.cy;
      const t = (-f.angle * Math.PI) / 180;
      return [dx * Math.cos(t) - dy * Math.sin(t), dx * Math.sin(t) + dy * Math.cos(t)];
    });
    const spread = (px: number, py: number): { sd: number; mean: number } => {
      const d = q.map(([x, y]) => Math.hypot(x - px, y - py));
      const mean = d.reduce((s, v) => s + v, 0) / d.length;
      const sd = Math.sqrt(d.reduce((s, v) => s + (v - mean) ** 2, 0) / d.length);
      return { sd, mean };
    };
    let bx = 0;
    let by = 8;
    let step = 8;
    while (step > 1e-4) {
      let improved = false;
      const base = spread(bx, by).sd;
      for (const [dx, dy] of [
        [step, 0],
        [-step, 0],
        [0, step],
        [0, -step],
      ]) {
        const s = spread(bx + dx, by + dy).sd;
        if (s < base - 1e-12) {
          bx += dx;
          by += dy;
          improved = true;
          break;
        }
      }
      if (!improved) step /= 2;
    }
    const fit = spread(bx, by);
    // Same three link lengths, straight off the beads that are never occluded.
    const L: number[] = [];
    for (let i = 1; i < 4; i++) {
      const d = frames.map((f) => Math.hypot(f.beads[i + 1].cx - f.beads[i].cx, f.beads[i + 1].cy - f.beads[i].cy));
      L.push(d.reduce((s, v) => s + v, 0) / d.length);
    }
    console.log(
      `\n${label}: chain pivot in the discus's frame = (${bx.toFixed(2)}, ${by.toFixed(2)}) px ` +
        `= (${(bx / scale).toFixed(1)}, ${(-by / scale).toFixed(1)}) units`,
    );
    console.log(
      `        link 1 length ${fit.mean.toFixed(2)} px (sd ${fit.sd.toFixed(3)}) = ${(fit.mean / scale).toFixed(1)} units`,
    );
    L.forEach((v, i) =>
      console.log(`        link ${i + 2} length ${v.toFixed(2)} px = ${(v / scale).toFixed(1)} units`),
    );
    // For comparison: the naive top joint straight off the occluded bead.
    const naive = frames.map((f) => Math.hypot(f.beads[1].cx - f.beads[0].cx, f.beads[1].cy - f.beads[0].cy));
    const nm = naive.reduce((s, v) => s + v, 0) / naive.length;
    console.log(
      `        (the occluded-bead reading of link 1 is ${nm.toFixed(2)} px = ${(nm / scale).toFixed(1)} units — ` +
        `${(fit.mean - nm).toFixed(2)} px short)`,
    );
  }
}
