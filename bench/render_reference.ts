#!/usr/bin/env bun
/**
 * Render a rung's OFFICIAL export to PNG frames — the reference an authoring
 * agent is allowed to look at.
 *
 * ⭐ Why this exists. `docs/LADDER.md`'s honesty rule keeps the reference
 * `skeleton.json` away from the authoring agent, because an agent that has seen
 * the answer is being measured on transcription rather than on authoring. But a
 * human animator would be shown the shot, so withholding *what it looks like*
 * measures nothing except whether the agent can guess. Frames are the honest
 * middle: they are exactly what a client watching the animation could see, and
 * they carry no bone name, no key time and no curve handle.
 *
 * ⚠️ The frames must come from the **official export**, never from a
 * transcription or from a candidate — that is the whole point of a reference —
 * so this reads `examples/<rung>/export/` and nothing else.
 *
 * ## Why not spine-html, and why no browser at all
 *
 * The obvious route is the sibling `spine-html` renderer under Playwright. It
 * would work, and it costs a vite build, a preview server and one browser
 * screenshot per frame. Nothing here needs a browser: for a **region
 * attachment** a bone transform is a plain affine map, `spine-core` computes the
 * four world vertices on the CPU, and `tools/plate.ts` already reads and writes
 * PNGs. The rasteriser itself now lives in [`src/render.ts`](../src/render.ts),
 * which `rigc check` shares — a candidate has to be drawn by the same code that
 * drew the reference or every number `check` reports carries the difference
 * between two renderers on top of the difference between two rigs.
 *
 * 🚧 Region attachments only. A rung that ships meshes needs a triangle
 * rasteriser and a deform path, and `src/render.ts` refuses by name rather than
 * dropping the attachment silently.
 *
 * ```
 * bun bench/render_reference.ts --rung 3 [--fps 12] [--max 256] [--tile 128]
 *                                        [--stride 1] [--out <dir>]
 * ```
 *
 * ## Where the frames land
 *
 * ```
 * <out>/[<skeleton label>/]frames.json
 * <out>/[<skeleton label>/]<animation>[@<fps>fps]/f0000.png…, contact.png
 * ```
 *
 * The two optional segments are there only when they carry information, so that
 * the common case stays the short path it already is:
 *
 * - the **label** segment appears when the rung has more than one skeleton (rungs
 *   1 and 8 do). Two skeletons of one rung are two different shots that happen to
 *   share an atlas, and they get their own viewports — pooling their frames in one
 *   directory would say they were comparable;
 * - the **rate** suffix appears at any rate other than the 12 fps protocol, so a
 *   second pass at another rate sits beside the first instead of replacing it.
 *
 * `--stride N` writes every Nth sampled frame while keeping its true index in the
 * name, and the contact sheet still shows **every** sampled frame. That splits two
 * costs a long shot conflates: the frames are what you measure and they are dear
 * (a still of a busy scene is tens of kilobytes, and most of those bytes are the
 * static set redrawn), while the sheet is what you flip through and it is cheap
 * (one file, so deflate finds the redrawn set again in the next tile).
 *
 * ## `frames.json` — the sidecar
 *
 * ⭐ A frame set is a picture of a world box, and until this file was written the
 * box was nowhere: an author could measure a distance in pixels and had no way to
 * turn it into the units a rig is authored in except by finding something of a
 * known size in the shot. Worse, `rigc check` cannot render a candidate *into the
 * same frame* without it, and re-deriving the framing from the candidate would
 * frame the candidate to its own extent — which is precisely the error the
 * reference renderer avoids by measuring the box once, densely, per skeleton.
 *
 * So each skeleton root carries one `frames.json`: the world box, the scale, the
 * background colour, and one entry per frame directory with its rate and count.
 * It is written **beside** the frames rather than inside each directory because
 * the box is a property of the shot and every rate of one skeleton shares it.
 * Sidecars accumulate across runs at different rates; a run whose framing differs
 * from the one on disk replaces the file outright and says which sets it dropped,
 * because those sets are at a scale this file can no longer describe.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { findRung, RUNG_IDS } from '../src/ladder.ts';
import {
  BACKGROUND,
  blitQuad,
  fill,
  FRAMES_SIDECAR,
  FRAMES_SPEC,
  framingViewport,
  loadPosable,
  pageFor,
  PROTOCOL_FPS,
  projector,
  renderFrame,
  sampleAll,
  SETUP_POSE_DIR,
  type Frame,
  type FramesSidecar,
  type FrameSet,
  type Viewport,
} from '../src/render.ts';
import { Plate, type RGBA } from '../tools/plate.ts';

/** Contact sheet: tiles per row, default tile long side, and the separator colour. */
const SHEET_COLUMNS = 8;
const SHEET_TILE = 128;
const SHEET_RULE: RGBA = [176, 176, 176, 255];
const SHEET_LABEL: RGBA = [96, 96, 96, 255];

function usage(message: string): never {
  console.error(`rigc render_reference: ${message}

usage:
  bun bench/render_reference.ts --rung <${RUNG_IDS.join(' | ')}>
      [--fps ${PROTOCOL_FPS}] [--max 256] [--tile ${SHEET_TILE}] [--stride 1] [--out <dir>]

  --fps     frames per second to sample each animation at (default ${PROTOCOL_FPS}, the ladder protocol)
  --max     longest side of a frame in pixels (default 256)
  --tile    longest side of one contact-sheet tile (default ${SHEET_TILE})
  --stride  write every Nth frame; the contact sheet still shows every one (default 1)
  --out     output root; defaults to bench/reference/<example>/`);
  process.exit(2);
}

function parseArgs(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) usage(`unexpected argument ${JSON.stringify(arg)}`);
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) usage(`${arg} needs a value`);
    flags[arg.slice(2)] = next;
    i++;
  }
  return flags;
}

/**
 * Every frame of one animation as one labelled grid, row major.
 *
 * Not decoration: rung 3's subject is *spacing* — how far a thing travels
 * between two consecutive frames — and that is a comparison across frames. A
 * reader flipping through 65 separate files is comparing against memory.
 */
function contactSheet(
  frames: Frame[],
  pages: Map<string, Plate>,
  viewport: Viewport,
  tile: number,
): Plate {
  const tileScale = tile / Math.max(viewport.width, viewport.height);
  const tileW = Math.max(1, Math.round(viewport.width * tileScale));
  const tileH = Math.max(1, Math.round(viewport.height * tileScale));
  const columns = Math.min(SHEET_COLUMNS, frames.length);
  const rows = Math.ceil(frames.length / columns);
  const sheet = new Plate(columns * (tileW + 1) + 1, rows * (tileH + 1) + 1);
  fill(sheet, SHEET_RULE);
  const base = projector(viewport);
  frames.forEach((frame, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const ox = col * (tileW + 1) + 1;
    const oy = row * (tileH + 1) + 1;
    const plate = new Plate(tileW, tileH);
    fill(plate, BACKGROUND);
    const project = (wx: number, wy: number): [number, number] => {
      const [px, py] = base(wx, wy);
      return [px * tileScale, py * tileScale];
    };
    for (const quad of frame.quads) blitQuad(plate, pageFor(pages, quad), quad, project);
    plate.text(String(i), 2, 2, 1, SHEET_LABEL);
    for (let y = 0; y < tileH; y++) for (let x = 0; x < tileW; x++) sheet.set(ox + x, oy + y, plate.get(x, y));
  });
  return sheet;
}

/**
 * Merge this run's sets into whatever sidecar is already on disk.
 *
 * Same framing ⇒ the two runs describe one shot at two rates and both belong in
 * the file. Different framing ⇒ the sets already there are at a scale this run's
 * numbers do not describe, so they are dropped by name rather than left to be
 * read against the wrong viewport.
 */
function writeSidecar(root: string, next: FramesSidecar): void {
  const path = join(root, FRAMES_SIDECAR);
  let sets = next.sets;
  if (existsSync(path)) {
    const previous = JSON.parse(readFileSync(path, 'utf8')) as FramesSidecar;
    const same =
      previous.spec === next.spec &&
      previous.viewport.width === next.viewport.width &&
      previous.viewport.height === next.viewport.height &&
      previous.viewport.scale === next.viewport.scale &&
      previous.viewport.x === next.viewport.x &&
      previous.viewport.y === next.viewport.y;
    const fresh = new Set(next.sets.map((s) => s.dir));
    const kept = (previous.sets ?? []).filter((s) => !fresh.has(s.dir));
    if (same) {
      sets = [...kept, ...next.sets];
    } else if (kept.length > 0) {
      console.log(
        `    ⚠️ framing changed — dropping ${kept.length} stale set(s) from ${FRAMES_SIDECAR}: ` +
          `${kept.map((s) => s.dir).join(', ')} (they are on disk at another scale and this file can no longer describe them)`,
      );
    }
  }
  sets.sort((a, b) => a.dir.localeCompare(b.dir));
  writeFileSync(path, `${JSON.stringify({ ...next, sets }, null, 2)}\n`);
}

// ---------------------------------------------------------------------------

const flags = parseArgs(process.argv.slice(2));
const rungId = flags.rung;
if (!rungId) usage(`--rung is required (${RUNG_IDS.join(' | ')})`);
const rung = findRung(rungId);
if (!rung) usage(`unknown rung ${JSON.stringify(rungId)}; known: ${RUNG_IDS.join(', ')}`);
const fps = Number(flags.fps ?? PROTOCOL_FPS);
const maxSide = Number(flags.max ?? 256);
const tile = Number(flags.tile ?? SHEET_TILE);
const stride = Number(flags.stride ?? 1);
if (!Number.isFinite(fps) || fps <= 0) usage('--fps must be a positive number');
if (!Number.isFinite(maxSide) || maxSide < 16) usage('--max must be at least 16');
if (!Number.isFinite(tile) || tile < 16) usage('--tile must be at least 16');
if (!Number.isInteger(stride) || stride < 1) usage('--stride must be a whole number of 1 or more');

const repoRoot = resolve(import.meta.dir, '..');
const exportDir = join(repoRoot, 'examples', rung.example, 'export');
if (!existsSync(exportDir)) {
  usage(`no example corpus at ${exportDir} — run \`bun run fetch-examples\` first (examples/ is gitignored)`);
}
const outRoot = flags.out ? resolve(flags.out) : join(repoRoot, 'bench', 'reference', rung.example);

// 🔒 A rendered frame carries the example's own pixels, so writing one is
// redistribution of the images. Every example's `license.txt` grants that only
// "as long as they are accompanied by this license file" — and `7-anticipation`
// has no `license.txt` upstream at all, so for that one the grant does not
// exist. Refusing here, and copying the file next to the frames, makes the
// licence a property of the output rather than of somebody remembering.
const licencePath = join(repoRoot, 'examples', rung.example, 'license.txt');
if (!existsSync(licencePath)) {
  usage(
    `${rung.example} ships no license.txt, so its images carry no redistribution grant — ` +
      'rendered frames of it must not be written anywhere, let alone committed (see docs/LADDER.md, Licence per rung)',
  );
}

console.log(`rigc render_reference rung ${rung.id} — ${rung.example}`);
console.log(`  source     ${exportDir}`);
console.log(`  out        ${outRoot}`);
console.log(`  sampling   ${fps} fps, longest side ${maxSide}px, sheet tile ${tile}px`);
if (stride > 1) {
  console.log(`  ⚠️ stride  every ${stride}th frame is written; the contact sheet still shows all of them`);
}

for (const skeletonEntry of rung.skeletons) {
  const skeletonPath = join(exportDir, skeletonEntry.file);
  const { data, pages } = loadPosable(skeletonPath, join(exportDir, skeletonEntry.atlas), exportDir);

  // Pass 1: pose everything at the framing rate and take the union of the posed
  // quads, so that every animation of one skeleton — at every output rate —
  // shares a viewport. Framing each animation to its own extent would rescale
  // the motion between them, which is the one thing a timing-and-spacing
  // reference must not do. A skeleton with no animation contributes its setup
  // pose instead, under the reserved name `setup`.
  const viewport = framingViewport(data, maxSide);
  if (!viewport) usage(`${skeletonPath} posed no drawable attachment in any animation or in its setup pose`);

  // Pass 2: the frames that actually get written.
  const sampled = sampleAll(data, fps);

  const what = data.animations.length === 0 ? 'no animation — setup pose only' : `${sampled.size} animation(s)`;
  console.log(`  ${skeletonEntry.label}: ${viewport.width}x${viewport.height}px, ${what}`);
  mkdirSync(outRoot, { recursive: true });
  copyFileSync(licencePath, join(outRoot, 'license.txt'));
  // Two skeletons of one rung are two shots that share an atlas and nothing else
  // — they were framed to their own viewports a few lines up — so they do not
  // pool their frames in one directory. A rung with one skeleton keeps the short
  // path it already had, and rung 3's committed frames still land where they are.
  const skeletonRoot = rung.skeletons.length > 1 ? join(outRoot, skeletonEntry.label) : outRoot;
  const sets: FrameSet[] = [];
  for (const [name, frames] of sampled) {
    const dirName = fps === PROTOCOL_FPS ? name : `${name}@${fps}fps`;
    const dir = join(skeletonRoot, dirName);
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    mkdirSync(dir, { recursive: true });
    const written: number[] = [];
    for (let i = 0; i < frames.length; i++) {
      // The last frame is always written whatever the stride: it is where the
      // animation ENDS, which is the one frame a brief states outright.
      if (i % stride !== 0 && i !== frames.length - 1) continue;
      renderFrame(frames[i], pages, viewport, BACKGROUND).writePng(join(dir, `f${String(i).padStart(4, '0')}.png`));
      written.push(i);
    }
    // One contact sheet beside the frames, of EVERY sampled frame — including
    // the ones the stride did not write out. Spacing (how far the thing moves
    // between two frames) is a comparison across frames, and it is visible in a
    // grid in a way it is not in 65 separate files.
    //
    // A single frame has nothing to compare itself against, so it gets no sheet:
    // the sheet would be that same frame with a border and a "0" on it, and the
    // reader would have opened a second file to learn nothing.
    if (frames.length > 1) contactSheet(frames, pages, viewport, tile).writePng(join(dir, 'contact.png'));
    const last = frames[frames.length - 1].time;
    sets.push({
      dir: dirName,
      animation: name === SETUP_POSE_DIR && data.animations.length === 0 ? null : name,
      fps,
      sampled: frames.length,
      written: written.length,
      stride,
      duration: last,
    });
    const how = frames.length === 1 ? 'a single pose' : `${last.toFixed(3)}s at ${fps} fps`;
    const kept = written.length === frames.length ? '' : ` (${written.length} written, stride ${stride})`;
    console.log(`    ${name.padEnd(16)} ${frames.length} frame(s)${kept}, ${how} -> ${dir}`);
  }

  writeSidecar(skeletonRoot, {
    spec: FRAMES_SPEC,
    example: rung.example,
    rung: rung.id,
    skeleton: skeletonEntry.label,
    background: BACKGROUND,
    viewport: {
      x: viewport.minX,
      y: viewport.minY,
      width: viewport.maxX - viewport.minX,
      height: viewport.maxY - viewport.minY,
      scale: viewport.scale,
      pixelWidth: viewport.width,
      pixelHeight: viewport.height,
    },
    sets,
  });
  console.log(`    ${FRAMES_SIDECAR.padEnd(16)} viewport ${viewport.width}x${viewport.height}px, ${viewport.scale.toFixed(6)} px per unit -> ${join(skeletonRoot, FRAMES_SIDECAR)}`);
}
