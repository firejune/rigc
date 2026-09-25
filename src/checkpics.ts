/**
 * rigc check --out — the picture each of `check`'s numbers came from.
 *
 * ## Why this exists
 *
 * `check` renders the candidate onto the reference frames' own grid, subtracts,
 * and prints the result as numbers. A number says *how much*; only a picture says
 * *where*. An agent porting a sample drew the same face composite twice at a
 * 20 px offset — a ghost hairline — with a green gate and a contact sheet of
 * ~100 px tiles in hand, and did not see it (issue #834). The comparison that
 * would have shown it was already computed and thrown away.
 *
 * So for every frame the report lists under *the frames worth reading* (every
 * compared frame under `--all-frames`), this composes one image, left to right:
 *
 * 1. **reference** — the frame as read from `--frames`;
 * 2. **candidate** — the candidate exactly as `check` rendered it onto that grid;
 * 3. **difference** — per pixel, the largest of the three channel differences
 *    `|candidate − reference|`, 0..255 on a fixed grey ramp, over the pixels the
 *    MAE averages over (the union alpha) and transparent everywhere else;
 * 4. **overlay** — the two at 50 % each, so a displaced edge reads as a double line.
 *
 * Each pane is at the grid's **native size**. An upscaled difference is a
 * difference the instrument invented: a resampling filter moves ink into pixels
 * the comparison never measured. The picture is only ever the comparison.
 *
 * ## 🔒 Nothing here is a new number
 *
 * Every figure burned into a picture is read off the `CheckReport` the table was
 * printed from, at the precision the table prints it — the difference pane's MAE,
 * the per-side change counts, the union — and the per-slot rows are the frame's
 * own `slots`. The rasters are the ones the figures were computed on, kept by
 * `CheckPlates` at the moment they were compared, not re-rendered afterwards: a
 * second render that happened to agree would be a claim, and this is a record.
 *
 * ⚠️ Two things a picture cannot say, and it says neither: which side is right,
 * and anything about a frame it does not show.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COMPARISON_FIELD,
  framesToList,
  type AnimationCheck,
  type CheckPlates,
  type CheckReport,
  type ComparedPlates,
  type Framing,
  type FrameCheck,
} from './check.ts';
import { FRAMES_SIDECAR, FRAMES_SPEC } from './render.ts';
import { isContent } from './framing.ts';
import { isAttributable } from './slots.ts';
import { encodePng, Plate, type RGBA } from '../tools/plate.ts';
import { GLYPH_H, textWidth } from '../tools/font5x7.ts';

/** The four panes, left to right, by the names their labels carry. */
export const PANES = ['reference', 'candidate', 'difference', 'overlay'] as const;
export type Pane = (typeof PANES)[number];

/** Transparent pixels between two panes, and between the panes and the slot rows. */
export const PANE_GAP = 4;
/** Pixels of strip around a line of text, above and below. */
const TEXT_PAD = 2;
/** One line of 5x7 text with its padding: the label strip, and each slot row. */
export const TEXT_ROW = GLYPH_H + 2 * TEXT_PAD;
/** The strips' own colour, and the text's — opaque, so the labels read on any viewer background. */
const STRIP: RGBA = [0, 0, 0, 255];
const INK: RGBA = [255, 255, 255, 255];

const f2 = (n: number): string => n.toFixed(2);
const frameName = (index: number): string => `f${String(index).padStart(4, '0')}`;

/** Where one pane sits in a picture, in picture pixels. */
export interface PaneRect {
  pane: Pane;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The geometry of one picture — exported so a reader can find a pane without
 * knowing how the picture was drawn, which is what the selftest does.
 *
 * A column is as wide as its pane, or as its label when the label is wider: the
 * PANE stays at native size either way, and a label clipped to fit a small grid
 * would drop the one figure it exists to carry.
 */
export function pictureLayout(
  gridWidth: number,
  gridHeight: number,
  labels: readonly string[],
  rows: readonly string[],
): { width: number; height: number; panes: PaneRect[]; rowsTop: number } {
  const columns = labels.map((label) => Math.max(gridWidth, textWidth(label, 1) + 2 * TEXT_PAD));
  const panes: PaneRect[] = [];
  let x = 0;
  PANES.forEach((pane, i) => {
    panes.push({ pane, x, y: TEXT_ROW, width: gridWidth, height: gridHeight });
    x += columns[i] + (i < PANES.length - 1 ? PANE_GAP : 0);
  });
  const widestRow = rows.reduce((w, row) => Math.max(w, textWidth(row, 1) + 2 * TEXT_PAD), 0);
  const rowsTop = TEXT_ROW + gridHeight + PANE_GAP;
  return { width: Math.max(x, widestRow), height: rowsTop + rows.length * TEXT_ROW, panes, rowsTop };
}

/** The label above each pane: the frame, the pane, and the pane's own figure from the table. */
export function paneLabels(frame: FrameCheck): string[] {
  const at = frameName(frame.index);
  const moved = (n: number | undefined): string => (n === undefined ? '-' : String(n));
  return [
    // The table's `ref Δ` and `Δpx` columns: how far each side moved since its own previous frame.
    `${at} reference ref d ${moved(frame.change?.reference)}`,
    `${at} candidate dpx ${moved(frame.change?.candidate)}`,
    `${at} difference mae ${f2(frame.mae)}`,
    `${at} overlay union ${frame.unionPixels}`,
  ];
}

/**
 * One row per slot in the frame's own `slots`, in the order the report holds them.
 *
 * The drift is printed at the table's precision, and a slot with no attributable
 * drift says which of the two reasons it is rather than printing a number — the
 * rule `src/slots.ts` owns for every figure beside a part's name. The frame's
 * worst slot, the one the table's row names, is marked `>`.
 */
export function slotRows(frame: FrameCheck): string[] {
  return frame.slots.map((track) => {
    const mark = track.slot === frame.worstSlot ? '>' : ' ';
    if (!isAttributable(track)) {
      return `${mark} ${track.slot} -  ${track.candidate === null ? 'not drawn' : 'no attributable drift'}`;
    }
    const how = track.method === 'template' ? `tmpl ${(track.confidence ?? 0).toFixed(2)}` : 'component';
    return `${mark} ${track.slot} ${(track.drift as number).toFixed(1)} px  ${how}`;
  });
}

/** Compose one frame's picture from the rasters its figures were computed on. */
export function composePicture(frame: FrameCheck, plates: ComparedPlates, background: RGBA): Plate {
  const { reference, candidate, coverage } = plates;
  const w = reference.width;
  const h = reference.height;
  const labels = paneLabels(frame);
  const rows = slotRows(frame);
  const layout = pictureLayout(w, h, labels, rows);
  const out = new Plate(layout.width, layout.height);

  layout.panes.forEach((rect, i) => {
    out.rect(rect.x, 0, Math.max(rect.width, textWidth(labels[i], 1) + 2 * TEXT_PAD), TEXT_ROW, STRIP);
    out.text(labels[i], rect.x + TEXT_PAD, TEXT_PAD, 1, INK);
  });
  const [ref, cand, diff, over] = layout.panes;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = candidate.get(x, y);
      const b = reference.get(x, y);
      out.set(ref.x + x, ref.y + y, b);
      out.set(cand.x + x, cand.y + y, a);
      // The union `checkOneFrame` averages over: what the candidate's geometry
      // covers, or what the reference drew — the same predicate, not a lookalike.
      if (coverage[y * w + x] === 1 || isContent(reference, x, y, background)) {
        const v = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
        out.set(diff.x + x, diff.y + y, [v, v, v, 255]);
      }
      out.set(over.x + x, over.y + y, [
        Math.round((a[0] + b[0]) / 2),
        Math.round((a[1] + b[1]) / 2),
        Math.round((a[2] + b[2]) / 2),
        Math.round((a[3] + b[3]) / 2),
      ]);
    }
  }
  rows.forEach((row, i) => {
    const top = layout.rowsTop + i * TEXT_ROW;
    out.rect(0, top, layout.width, TEXT_ROW, STRIP);
    out.text(row, TEXT_PAD, top + TEXT_PAD, 1, INK);
  });
  return out;
}

/** What `--out` wrote for one frame set. */
export interface PicturesWritten {
  /** The set's directory, as the report names it. */
  dir: string;
  /** Absolute path of the directory the pictures went into. */
  path: string;
  /** The frame indices written, in index order. */
  frames: number[];
  /** Whether that is every compared frame rather than the frames worth reading. */
  every: boolean;
}

/**
 * Write the pictures for a report into `outDir`, and `frames.json` beside them.
 *
 * `<outDir>/<set>/` is cleared and rewritten for every set the report holds, as
 * `render` clears its own: a set that lists fewer frames this run would otherwise
 * keep last run's pictures beside this run's, and a stale picture of a comparison
 * is indistinguishable from a current one. Nothing else under `outDir` is touched.
 *
 * ⚠️ Throws, naming the frame, when `plates` does not hold a frame the report
 * lists. That is not a reachable input: it is `CheckPlates`'s retention and
 * `framesToList` disagreeing about which frames are worth reading, and a picture
 * set with a hole in it would be the silent version of that disagreement.
 */
export function writeCheckPictures(
  outDir: string,
  report: CheckReport,
  plates: CheckPlates,
  opts: { allFrames: boolean },
): PicturesWritten[] {
  mkdirSync(outDir, { recursive: true });
  const written: PicturesWritten[] = [];
  for (const anim of report.animations) {
    const dir = join(outDir, anim.dir);
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    const listed = anim.compared === 0 ? [] : framesToList(anim, opts.allFrames);
    if (listed.length > 0) mkdirSync(dir, { recursive: true });
    for (const frame of listed) {
      const held = plates.of(anim.dir, frame.index);
      if (held === undefined) {
        throw new Error(
          `check --out: set ${JSON.stringify(anim.dir)} lists ${frameName(frame.index)} as worth reading and no ` +
            'raster was kept for it — CheckPlates and framesToList disagree about the listing (a defect in rigc)',
        );
      }
      const picture = composePicture(frame, held, report.background);
      writeFileSync(join(dir, `${frameName(frame.index)}.png`), encodePng(picture.width, picture.height, picture.data));
    }
    written.push({
      dir: anim.dir,
      path: dir,
      frames: listed.map((f) => f.index),
      every: listed.length === anim.frames.length,
    });
  }
  writeFileSync(join(outDir, FRAMES_SIDECAR), `${JSON.stringify(picturesSidecar(report, written, opts.allFrames), null, 2)}\n`);
  return written;
}

/**
 * What the pictures are OF — the file a reader opens first, under the name a
 * frame set's sidecar has, so "what is this directory" is answered in the place
 * it is always answered.
 *
 * 🔒 The field named by `COMPARISON_FIELD` is what makes it not a frame set, and
 * `check --frames` refuses a sidecar that carries it, by that name: the reference
 * pane inside each picture is a frame, but the file is a comparison, and scoring
 * a candidate against a picture of a comparison is a number about the wrong
 * thing. There is deliberately no top-level `viewport`: under the per-shot scope
 * every set was measured in its own box, so the box is recorded per set, and one
 * box at the top would be a claim the run did not make.
 */
function picturesSidecar(report: CheckReport, written: PicturesWritten[], allFrames: boolean): Record<string, unknown> {
  return {
    spec: FRAMES_SPEC,
    [COMPARISON_FIELD]: {
      candidate: report.candidate,
      frames: report.framesDir,
      skin: report.skin,
      referenceSkin: report.referenceSkin,
      framingScope: report.framingScope,
      grid: gridOf(report),
      panes: [...PANES],
      listing: allFrames ? 'every compared frame (--all-frames)' : 'the frames worth reading',
      textureFrom: report.textureFrom === null ? null : report.textureFrom.atlas,
    },
    background: report.background,
    sets: report.animations.map((anim: AnimationCheck, i) => {
      const viewport: Framing = anim.viewport;
      return {
        dir: anim.dir,
        animation: anim.animation,
        candidateAnimation: anim.candidateAnimation,
        fps: anim.fps,
        compared: anim.compared,
        written: written[i].frames.length,
        frames: written[i].frames,
        framing: anim.framing,
        viewport,
      };
    }),
  };
}

/** The comparison grid — the reference frames' own pixel size, which every set shares. */
function gridOf(report: CheckReport): { pixelWidth: number; pixelHeight: number } | null {
  const v = report.referenceViewport ?? report.animations[0]?.viewport ?? null;
  return v === null ? null : { pixelWidth: v.pixelWidth, pixelHeight: v.pixelHeight };
}
