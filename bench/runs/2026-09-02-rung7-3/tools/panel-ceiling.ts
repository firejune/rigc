/**
 * The ceiling on a behind-the-sack panel's template agreement, frame by frame.
 *
 * `check`'s template matcher scores a slot over exactly the pixels the slot
 * DRAWS, so a part the reference has mostly hidden is scored mostly against the
 * occluder's colour and its correlation has no peak. For the cape's rear panel
 * the observable ceiling is therefore:
 *
 *     agreement <= outer crimson / the area of the smallest quad that covers it
 *
 * where OUTER crimson is crimson reachable from the frame border through
 * {backdrop, crimson} without crossing beige — i.e. crimson the sack is not in
 * front of, which is the only crimson a part drawn behind the sack can put on
 * screen. The denominator is the smallest oriented rectangle covering that
 * region, because one region attachment draws a filled parallelogram and can be
 * rotated and scaled on each axis but not bent.
 *
 * Conventions: drawn = a channel more than 8/255 from the backdrop (232,232,232),
 * `check`'s own threshold; crimson ⇔ `g - b <= 8`, this brief's split; raw masks,
 * no denoise (denoising only shrinks thin features, so it would lower the ceiling).
 * Reachability is 4-connected, which is conservative for the numerator: a crimson
 * pixel joined to the outside only diagonally is counted as hidden.
 *
 * usage: bun tools/panel-ceiling.ts --frames <dir> [--set <dir>]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { readPlate, type Plate, type RGBA } from '../../../../tools/plate.ts';
import { isContent } from '../../../../src/framing.ts';

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? undefined : process.argv[at + 1];
}

/** Smallest-area rectangle over a point set, by rotating callipers at 1° steps. */
function orientedBoxArea(points: Array<[number, number]>): { area: number; deg: number; w: number; h: number } {
  let best = { area: Infinity, deg: 0, w: 0, h: 0 };
  for (let deg = 0; deg < 90; deg++) {
    const a = (deg * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const [x, y] of points) {
      const u = x * c + y * s;
      const v = -x * s + y * c;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const w = maxU - minU + 1;
    const h = maxV - minV + 1;
    if (w * h < best.area) best = { area: w * h, deg, w, h };
  }
  return best;
}

function main(): void {
  const framesRoot = resolve(flag('frames') ?? '');
  const only = flag('set');
  const sidecar = JSON.parse(readFileSync(join(framesRoot, 'frames.json'), 'utf8'));
  const background = sidecar.background as RGBA;

  for (const set of sidecar.sets as Array<{ dir: string }>) {
    if (only && set.dir !== only) continue;
    const dir = join(framesRoot, set.dir);
    const files = readdirSync(dir)
      .filter((f) => /^f\d+\.png$/.test(f))
      .sort();
    console.log(`=== ${set.dir} ===`);
    for (const file of files) {
      const p: Plate = readPlate(join(dir, file));
      const n = p.width * p.height;
      const beige = new Uint8Array(n);
      const crimson = new Uint8Array(n);
      let crimsonTotal = 0;
      for (let y = 0; y < p.height; y++) {
        for (let x = 0; x < p.width; x++) {
          const at = y * p.width + x;
          if (!isContent(p, x, y, background)) continue;
          const [, g, b] = p.get(x, y);
          if (g - b <= 8) {
            crimson[at] = 1;
            crimsonTotal++;
          } else beige[at] = 1;
        }
      }
      // Flood from the border through everything that is not beige.
      const seen = new Uint8Array(n);
      const stack: number[] = [];
      const push = (at: number): void => {
        if (seen[at] || beige[at]) return;
        seen[at] = 1;
        stack.push(at);
      };
      for (let x = 0; x < p.width; x++) {
        push(x);
        push((p.height - 1) * p.width + x);
      }
      for (let y = 0; y < p.height; y++) {
        push(y * p.width);
        push(y * p.width + p.width - 1);
      }
      while (stack.length > 0) {
        const at = stack.pop() as number;
        const x = at % p.width;
        if (x > 0) push(at - 1);
        if (x + 1 < p.width) push(at + 1);
        if (at >= p.width) push(at - p.width);
        if (at + p.width < n) push(at + p.width);
      }
      const points: Array<[number, number]> = [];
      for (let at = 0; at < n; at++) {
        if (!crimson[at] || !seen[at]) continue;
        const x = at % p.width;
        points.push([x, (at - x) / p.width]);
      }
      const outer = points.length;
      if (outer === 0) {
        console.log(`  ${file}  crimson ${crimsonTotal}  outer 0  — no crimson the sack is not in front of`);
        continue;
      }
      const box = orientedBoxArea(points);
      console.log(
        `  ${file}  crimson ${String(crimsonTotal).padStart(5)}  outer ${String(outer).padStart(5)}  ` +
          `hidden ${String(crimsonTotal - outer).padStart(5)}  tightest quad ${box.w.toFixed(0)}x${box.h.toFixed(0)} ` +
          `at ${box.deg}deg = ${box.area.toFixed(0)} px  ⇒ ceiling ${((100 * outer) / box.area).toFixed(0)}%`,
      );
    }
  }
}

main();
