/**
 * Author's probe — why one slot is or is not attributable, per frame.
 *
 * Candidate-side only plus the rendered frames: it calls the same `matchSlots`
 * `check` calls, and adds the one thing `check` does not print — what the
 * reference shows underneath the slot's own drawn pixels. The template matcher's
 * residual is a mean over exactly those pixels, so their composition (crimson,
 * beige, backdrop) is the quantity that decides whether the correlation has a
 * peak to find.
 *
 * usage:
 *   bun tools/probe-slot.ts --candidate <dir> --frames <dir> --slot <name>
 *                           [--set <dir>] [--frame <i>]
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { readPlate, type Plate, type RGBA } from '../../../../tools/plate.ts';
import { componentField, matchSlots, searchRadius } from '../../../../src/slots.ts';
import {
  frameGeometry,
  pageFor,
  posableFromText,
  projector,
  rasterisePiece,
  sampleAnimation,
  type Frame,
  type Viewport,
} from '../../../../src/render.ts';
import { isContent } from '../../../../src/framing.ts';

interface Args {
  candidate: string;
  frames: string;
  slot: string;
  set?: string;
  frame?: number;
}

function args(): Args {
  const out: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    out[argv[i].slice(2)] = argv[i + 1];
    i++;
  }
  if (!out.candidate || !out.frames || !out.slot) {
    throw new Error('need --candidate <dir> --frames <dir> --slot <name>');
  }
  return {
    candidate: out.candidate,
    frames: out.frames,
    slot: out.slot,
    set: out.set,
    frame: out.frame === undefined ? undefined : Number(out.frame),
  };
}

/** This brief's own part split: cape ⇔ `g - b <= 8`, drawn at 8/255. */
type Klass = 'crimson' | 'beige' | 'backdrop';
function classify(plate: Plate, x: number, y: number, background: RGBA): Klass {
  if (!isContent(plate, x, y, background)) return 'backdrop';
  const [, g, b] = plate.get(x, y);
  return g - b <= 8 ? 'crimson' : 'beige';
}

function main(): void {
  const a = args();
  const candidateDir = resolve(a.candidate);
  const posable = posableFromText(
    readFileSync(join(candidateDir, 'skeleton.json'), 'utf8'),
    readFileSync(join(candidateDir, 'skeleton.atlas'), 'utf8'),
    candidateDir,
  );
  const framesRoot = resolve(a.frames);
  const sidecar = JSON.parse(readFileSync(join(framesRoot, 'frames.json'), 'utf8'));
  const background = sidecar.background as RGBA;
  const v = sidecar.viewport;
  const viewport: Viewport = {
    minX: v.x,
    minY: v.y,
    maxX: v.x + v.width,
    maxY: v.y + v.height,
    scale: v.scale,
    width: v.pixelWidth,
    height: v.pixelHeight,
  };

  const chainOfSlot = new Map<string, number>();
  posable.data.slots.forEach((s: { name: string }, i: number) => chainOfSlot.set(s.name, i));

  for (const set of sidecar.sets as Array<{ dir: string; animation: string; fps: number }>) {
    if (a.set && set.dir !== a.set) continue;
    const candidateFrames = sampleAnimation(posable.data, set.animation, set.fps);
    console.log(`=== ${set.dir} ===`);
    const dir = join(framesRoot, set.dir);
    for (let i = 0; i < candidateFrames.length; i++) {
      const file = `f${String(i).padStart(4, '0')}.png`;
      let reference: Plate;
      try {
        reference = readPlate(join(dir, file));
      } catch {
        continue;
      }
      if (a.frame !== undefined && i !== a.frame) continue;
      const frame = candidateFrames[i];
      const { footprints } = frameGeometry(frame, posable.pages, viewport, chainOfSlot);
      const field = componentField(reference, background);
      const { tracks } = matchSlots(footprints, field, {
        frame,
        pages: posable.pages,
        viewport,
        background,
        reference,
      });
      const track = tracks.find((t) => t.slot === a.slot);
      const foot = footprints.get(a.slot);
      if (!track || !foot || foot.pixels === 0) {
        console.log(`  f${String(i).padStart(4, '0')}  draws nothing`);
        continue;
      }

      // What the reference shows under exactly the pixels this slot draws.
      const project = projector(viewport);
      const seen = new Uint8Array(viewport.width * viewport.height);
      const tally: Record<Klass, number> = { crimson: 0, beige: 0, backdrop: 0 };
      for (const piece of frame.pieces) {
        if (piece.slot !== a.slot) continue;
        rasterisePiece(pageFor(posable.pages, piece), piece, project, viewport, (px, py) => {
          const at = py * viewport.width + px;
          if (seen[at]) return;
          seen[at] = 1;
          tally[classify(reference, px, py, background)]++;
        });
      }
      const drawn = tally.crimson + tally.beige + tally.backdrop;
      const w = Math.round(foot.maxX - foot.minX);
      const h = Math.round(foot.maxY - foot.minY);
      const share = (n: number): string => `${((100 * n) / Math.max(1, drawn)).toFixed(0)}%`;
      const verdict = track.ambiguity === null ? `ATTRIBUTABLE drift ${(track.drift ?? 0).toFixed(2)} px` : track.ambiguity;
      console.log(
        `  f${String(i).padStart(4, '0')}  ${w}x${h} own=${drawn}  r=${searchRadius(w, h)}  ` +
          `ref under it: crimson ${share(tally.crimson)} beige ${share(tally.beige)} backdrop ${share(tally.backdrop)}`,
      );
      console.log(`          ${verdict}`);
    }
  }
}

main();
