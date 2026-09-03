/**
 * Cut a 30 fps contact sheet into its tiles and read one predicate per tile.
 *
 * The layout is the one the BRIEF states — "Tiles are cut out with
 * `render_reference.ts`'s own layout — 128 px long side, 1 px rules, 8 columns,
 * row major" — so this needs nothing from that file, which is on the forbidden
 * list. The control is arithmetic: the reconstructed sheet size has to equal the
 * file's own, and the tool refuses the sheet if it does not.
 *
 * Why it is worth a tool: the flare's window decides an ATTACHMENT timeline,
 * which is stepped, and a stepped key is either on the sample that was meant to
 * see it or a whole frame out (§4.5's 🚨). The 12 fps set brackets the flare's
 * end between 0.333 s and 0.417 s; the sheet puts it inside a thirtieth. §9.3's
 * ⭐ is exactly this: "on a set rendered at a higher rate than the frames on
 * disk, every sampled frame is compared, so the samples between two committed
 * ones are measured there and nowhere else."
 *
 * usage: sheet.ts <set@30fps> [more sets…]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Plate, readPlate } from '../../../../tools/plate';
import { BACKGROUND, MASK_TOLERANCE, sidecarOf } from './geom';

/** The brief's stated geometry. */
export const SHEET_TILE = 128;
export const SHEET_GAP = 1;
export const SHEET_COLUMNS = 8;

const REF = process.env.REF ?? 'bench/reference/spineboy/ess';
const sidecar = sidecarOf(REF);

export interface Tiles {
  sheet: Plate;
  tileW: number;
  tileH: number;
  columns: number;
  rows: number;
  count: number;
}

export function cut(dir: string, frames: number, frameW: number, frameH: number): Tiles {
  const sheet = readPlate(join(dir, 'contact.png'));
  const tileScale = SHEET_TILE / Math.max(frameW, frameH);
  const tileW = Math.max(1, Math.round(frameW * tileScale));
  const tileH = Math.max(1, Math.round(frameH * tileScale));
  const columns = Math.min(SHEET_COLUMNS, frames);
  const rows = Math.ceil(frames / columns);
  const expectW = columns * (tileW + SHEET_GAP) + SHEET_GAP;
  const expectH = rows * (tileH + SHEET_GAP) + SHEET_GAP;
  if (sheet.width !== expectW || sheet.height !== expectH) {
    throw new Error(
      `${dir}/contact.png is ${sheet.width}x${sheet.height}; the brief's stated layout for ` +
        `${frames} frames at ${frameW}x${frameH} reconstructs ${expectW}x${expectH} — refusing to read it`,
    );
  }
  return { sheet, tileW, tileH, columns, rows, count: frames };
}

export function tileOrigin(t: Tiles, index: number): [number, number] {
  const col = index % t.columns;
  const row = Math.floor(index / t.columns);
  return [SHEET_GAP + col * (t.tileW + SHEET_GAP), SHEET_GAP + row * (t.tileH + SHEET_GAP)];
}

/** The brief's own pink muzzle-flash predicate, per tile. */
export function flarePerTile(t: Tiles): number[] {
  const out: number[] = [];
  const d = t.sheet.data;
  for (let i = 0; i < t.count; i++) {
    const [ox, oy] = tileOrigin(t, i);
    let n = 0;
    for (let y = oy; y < oy + t.tileH; y++) {
      for (let x = ox; x < ox + t.tileW; x++) {
        const at = (y * t.sheet.width + x) * 4;
        const r = d[at];
        const g = d[at + 1];
        const b = d[at + 2];
        const ink =
          Math.abs(r - BACKGROUND[0]) > MASK_TOLERANCE ||
          Math.abs(g - BACKGROUND[1]) > MASK_TOLERANCE ||
          Math.abs(b - BACKGROUND[2]) > MASK_TOLERANCE;
        if (ink && r > 200 && b > 140 && g < Math.min(r, b) - 30) n++;
      }
    }
    out.push(n);
  }
  return out;
}

if (import.meta.main) {
  const wanted = process.argv.slice(2);
  for (const s of sidecar.sets) {
    if (!s.dir.endsWith('@30fps')) continue;
    if (wanted.length && !wanted.includes(s.dir)) continue;
    let t: Tiles;
    try {
      t = cut(join(REF, s.dir), s.sampled, sidecar.viewport.pixelWidth, sidecar.viewport.pixelHeight);
    } catch (e) {
      process.stdout.write(`${s.dir}: ${(e as Error).message}\n`);
      continue;
    }
    const flare = flarePerTile(t);
    const hits = flare.map((n, i) => [i, n] as const).filter(([, n]) => n > 0);
    process.stdout.write(
      `${s.dir.padEnd(14)} ${t.count} tile(s) at ${t.tileW}x${t.tileH} in ${t.columns} column(s), ${t.rows} row(s)  ` +
        `[layout control: ${t.sheet.width}x${t.sheet.height} reconstructed exactly]\n`,
    );
    if (hits.length === 0) process.stdout.write('  flare: none\n');
    else {
      process.stdout.write(
        `  flare on tiles ${hits[0][0]}..${hits[hits.length - 1][0]}  ` +
          `(${hits.map(([i, n]) => `t${i}=${n}`).join(' ')})\n` +
          `  ⇒ first tile ${hits[0][0]} at ${(hits[0][0] / 30).toFixed(4)} s, ` +
          `last tile ${hits[hits.length - 1][0]} at ${(hits[hits.length - 1][0] / 30).toFixed(4)} s, ` +
          `first CLEAR tile after it ${hits[hits.length - 1][0] + 1} at ${((hits[hits.length - 1][0] + 1) / 30).toFixed(4)} s\n`,
      );
    }
  }
  void readFileSync;
}
