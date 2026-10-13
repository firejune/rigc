/**
 * A render's box given rather than fitted — `rigc render --viewport` and
 * `rigc render --viewport-from` (issue #1414) — and what the frames leave out of it.
 *
 * ⭐ **Why a box is given.** `render` fits its box to the rig it draws, so two
 * candidates — a rig before and after a polish — land on two grids (377×480 against
 * 385×480 on the run that asked for this), and a comparison of their pixels needs a
 * transform written by hand. A given box puts both on one grid: the same world box
 * and the same pixel size, so a world point lands on the same pixel in both.
 *
 * Two ways to give it, and only two:
 *
 * - `--viewport <x,y,w,h>` — a world box, y up, `x,y` its bottom-left corner: the
 *   spelling `check --viewport` and `inspect --viewport` already take, and the
 *   numbers `frames.json`'s `viewport` records. Its pixel size follows from `--max`
 *   as a fitted box's does.
 * - `--viewport-from <frames.json | render root>` — an earlier render's grid exactly:
 *   its box, its scale and its pixel size as that `frames.json` records them, so the
 *   second render is on the first one's pixels to the bit. `--max` is refused beside
 *   it, because the file already fixes the pixel size.
 *
 * ⚠️ **Nothing is cropped silently.** A given box can leave part of the rig out,
 * which a fitted box — measured over the rig's own poses at 60 fps and padded —
 * is built not to. Each frame is the box — what lies past it is not
 * drawn — so every slot whose drawn geometry reaches past it is named, by set and
 * frame, with how far and on which side, and `frames.json` records the same list
 * under `pinned` (`outsideViewport`).
 *
 * Pure: no clock, no randomness, no runtime.
 */
import { indexRuns } from './folds.ts';
import { FRAMES_SPEC, type Frame, type PinnedViewport, type Viewport, unionBounds, viewportOfSize } from './render_shared.ts';

/** A given box that cannot be used — said by name. */
export class ViewportError extends Error {}

/** `--viewport`'s value: four numbers, `x,y,w,h`, the world box, y up — refused by name otherwise. Shared by `render`, `check` and `inspect`. */
export function readViewportBox(raw: string): { x: number; y: number; width: number; height: number } {
  const parts = raw.split(',').map((s) => Number(s.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new ViewportError('--viewport takes four numbers: <x>,<y>,<width>,<height> — the world box, y up');
  }
  if (parts[2] <= 0 || parts[3] <= 0) throw new ViewportError('--viewport width and height must be positive');
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

/**
 * The grid a `frames.json` records — `value` is the parsed file, `where` its path —
 * as the viewport a second render draws on: the box, the scale and the pixel size
 * exactly as written (`viewportOfSize`, the reading `check` takes of the same
 * block). Refused naming the field and its value where the file is not a frame
 * set's sidecar or its `viewport` is not a grid.
 */
export function viewportOfFramesFile(value: unknown, where: string): Viewport {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ViewportError(`--viewport-from ${where}: the file is not a JSON object`);
  const file = value as Record<string, unknown>;
  if (file.spec !== FRAMES_SPEC) {
    throw new ViewportError(`--viewport-from ${where}: spec is ${JSON.stringify(file.spec)}, and the grid is read off a frame set's ${FRAMES_SPEC} sidecar — the frames.json \`render\` writes`);
  }
  const v = file.viewport;
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new ViewportError(`--viewport-from ${where}: no viewport object`);
  const box = v as Record<string, unknown>;
  const field = (name: string, rule: 'finite' | 'positive' | 'pixels'): number => {
    const n = box[name];
    const ok =
      typeof n === 'number' &&
      Number.isFinite(n) &&
      (rule === 'finite' || n > 0) &&
      (rule !== 'pixels' || Number.isInteger(n));
    if (!ok) {
      const need = rule === 'finite' ? 'a finite number' : rule === 'positive' ? 'a number above 0' : 'a whole number of pixels above 0';
      throw new ViewportError(`--viewport-from ${where}: viewport.${name} is ${JSON.stringify(n) ?? 'absent'}; it must be ${need}`);
    }
    return n as number;
  };
  return viewportOfSize(
    field('x', 'finite'),
    field('y', 'finite'),
    field('width', 'positive'),
    field('height', 'positive'),
    field('scale', 'positive'),
    field('pixelWidth', 'pixels'),
    field('pixelHeight', 'pixels'),
  );
}

/** The four sides of a box, world terms, y up, in the order a line names them. */
export const SIDES = ['left', 'right', 'bottom', 'top'] as const;
export type Side = (typeof SIDES)[number];

/** One slot that reaches past the box on one set: the frames, how far at most (world units) and on which sides. */
export interface OutsideReading {
  set: string;
  slot: string;
  frames: number[];
  /** The farthest any of its vertices reaches past the box, on any frame and side, world units. */
  most: number;
  sides: Side[];
}

/**
 * A wrong reading the suite plants to see its control go red (issue #1414):
 * `ownBox` measures each set against the box its own frames fill rather than the
 * given one — a reading that ignores the viewport.
 */
export interface OutsidePlant {
  ownBox?: true;
}

/**
 * Every slot whose drawn geometry reaches past `viewport` — a piece's posed
 * vertex strictly outside the box, as the framing measures a piece — per set in
 * `sets`' order, the slots in the order they first reach past it. Read off the
 * frames as drawn: a slot `--slot`/`--hide` leaves out draws no piece and is not
 * read, and a clip's cut is what is read.
 */
export function outsideViewport(sets: ReadonlyMap<string, readonly Frame[]>, viewport: Viewport, plant: OutsidePlant = {}): OutsideReading[] {
  const out: OutsideReading[] = [];
  for (const [set, frames] of sets) {
    const box = plant.ownBox === true ? unionBounds([[...frames]]) : viewport;
    const bySlot = new Map<string, { frames: Set<number>; most: number; sides: Set<Side> }>();
    for (const frame of frames) {
      for (const piece of frame.pieces) {
        for (let i = 0; i + 1 < piece.world.length; i += 2) {
          const x = piece.world[i];
          const y = piece.world[i + 1];
          const past: Array<[Side, number]> = [
            ['left', box.minX - x],
            ['right', x - box.maxX],
            ['bottom', box.minY - y],
            ['top', y - box.maxY],
          ];
          for (const [side, by] of past) {
            if (!(by > 0)) continue;
            let slot = bySlot.get(piece.slot);
            if (slot === undefined) {
              slot = { frames: new Set(), most: 0, sides: new Set() };
              bySlot.set(piece.slot, slot);
            }
            slot.frames.add(frame.index);
            slot.most = Math.max(slot.most, by);
            slot.sides.add(side);
          }
        }
      }
    }
    for (const [slot, read] of bySlot) {
      out.push({ set, slot, frames: [...read.frames].sort((a, b) => a - b), most: read.most, sides: SIDES.filter((s) => read.sides.has(s)) });
    }
  }
  return out;
}

/** `frames.json`'s `pinned` record for a given box and its reading. */
export function pinnedRecord(by: PinnedViewport['by'], outside: readonly OutsideReading[]): PinnedViewport {
  return { by, outside: outside.map(({ set, slot, frames }) => ({ set, slot, frames })) };
}

/**
 * The printed line for one slot past the box: the set, the slot, the frames, how
 * far at most and on which sides — and what happens to what lies past it.
 */
export function outsideLine(r: OutsideReading, fps: number): string {
  return (
    `${JSON.stringify(r.set)}: slot ${JSON.stringify(r.slot)} reaches past the box on ${r.frames.length} frame(s) [${indexRuns(r.frames)}] at ${fps} fps, ` +
    `by up to ${r.most.toFixed(2)} units (${r.sides.join(', ')}) — what lies past the box is not drawn: each frame is the box`
  );
}
