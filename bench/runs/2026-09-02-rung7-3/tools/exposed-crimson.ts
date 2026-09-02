/**
 * How much crimson is on the OUTSIDE of the figure, frame by frame.
 *
 * The panel is behind the sack, so the only crimson it can put on screen is
 * crimson that is not enclosed by beige — and a template match on the panel can
 * only find a peak where the panel's own pixels agree with the reference. This
 * measures the ceiling on that agreement: crimson in the outer 4-connected
 * boundary layer of the drawn region, and crimson total, per frame.
 *
 * Conventions, stated because they are choices: drawn = a channel more than
 * 8/255 from the backdrop (232, 232, 232), the same threshold `check` uses;
 * crimson ⇔ `g - b <= 8`, this brief's own split; "outer" = a drawn pixel with a
 * backdrop pixel among its four neighbours, dilated `--reach` times inward, so
 * `--reach 4` counts crimson within 4 px of the silhouette rather than only on it.
 * Raw masks, no denoise.
 *
 * usage: bun tools/exposed-crimson.ts --frames <dir> [--set <dir>] [--reach 4]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { readPlate, type Plate, type RGBA } from '../../../../tools/plate.ts';
import { isContent } from '../../../../src/framing.ts';

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? undefined : process.argv[at + 1];
}

function main(): void {
  const framesRoot = resolve(flag('frames') ?? '');
  const only = flag('set');
  const reach = Number(flag('reach') ?? 4);
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
      const drawn = new Uint8Array(p.width * p.height);
      const crimson = new Uint8Array(p.width * p.height);
      let crimsonTotal = 0;
      for (let y = 0; y < p.height; y++) {
        for (let x = 0; x < p.width; x++) {
          if (!isContent(p, x, y, background)) continue;
          const at = y * p.width + x;
          drawn[at] = 1;
          const [, g, b] = p.get(x, y);
          if (g - b <= 8) {
            crimson[at] = 1;
            crimsonTotal++;
          }
        }
      }
      // Layer 1: drawn pixels with a background 4-neighbour. Then grow inward.
      let layer = new Uint8Array(p.width * p.height);
      for (let y = 0; y < p.height; y++) {
        for (let x = 0; x < p.width; x++) {
          const at = y * p.width + x;
          if (!drawn[at]) continue;
          const edge =
            x === 0 ||
            y === 0 ||
            x + 1 === p.width ||
            y + 1 === p.height ||
            !drawn[at - 1] ||
            !drawn[at + 1] ||
            !drawn[at - p.width] ||
            !drawn[at + p.width];
          if (edge) layer[at] = 1;
        }
      }
      for (let step = 1; step < reach; step++) {
        const next = Uint8Array.from(layer);
        for (let y = 1; y + 1 < p.height; y++) {
          for (let x = 1; x + 1 < p.width; x++) {
            const at = y * p.width + x;
            if (!drawn[at] || layer[at]) continue;
            if (layer[at - 1] || layer[at + 1] || layer[at - p.width] || layer[at + p.width]) next[at] = 1;
          }
        }
        layer = next;
      }
      let outer = 0;
      for (let at = 0; at < crimson.length; at++) if (crimson[at] && layer[at]) outer++;
      console.log(
        `  ${file}  crimson ${String(crimsonTotal).padStart(5)}   within ${reach} px of the outline ` +
          `${String(outer).padStart(5)}  (${((100 * outer) / Math.max(1, crimsonTotal)).toFixed(0)}%)`,
      );
    }
  }
}

main();
