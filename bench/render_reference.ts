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
 * PNGs. So this is spine-core plus an affine blit — deterministic, dependency
 * free, and it runs anywhere `bun` does.
 *
 * 🚧 Region attachments only. A rung that ships meshes needs a triangle
 * rasteriser and a deform path, and this refuses by name rather than dropping
 * the attachment silently — the same rule the compiler follows for a format
 * feature it does not emit.
 *
 * ```
 * bun bench/render_reference.ts --rung 3 [--fps 12] [--max 256] [--tile 128]
 *                                        [--stride 1] [--out <dir>]
 * ```
 *
 * ## Where the frames land
 *
 * ```
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
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  AnimationState,
  AnimationStateData,
  AtlasAttachmentLoader,
  MeshAttachment,
  Physics,
  RegionAttachment,
  Skeleton,
  SkeletonJson,
  TextureAtlas,
} from '@esotericsoftware/spine-core';
import { findRung, RUNG_IDS } from '../src/ladder.ts';
import { Plate, readPlate, type RGBA } from '../tools/plate.ts';

/** Opaque, and light: both of rung 3's parts are dark slate, so is every ground. */
const BACKGROUND: RGBA = [232, 232, 232, 255];
/** Padding around the union bounding box, as a fraction of its long side. */
const PAD = 0.04;
/**
 * Directory a skeleton with no animation writes its one frame into.
 *
 * It cannot collide with an animation's directory, because an animation named
 * `setup` would have to live in a skeleton that has at least one animation, and
 * this name is only ever used when there are none.
 */
const SETUP_POSE_DIR = 'setup';
/** Contact sheet: tiles per row, default tile long side, and the separator colour. */
const SHEET_COLUMNS = 8;
const SHEET_TILE = 128;
const SHEET_RULE: RGBA = [176, 176, 176, 255];
const SHEET_LABEL: RGBA = [96, 96, 96, 255];
/**
 * The sampling rate the ladder's briefs are written against.
 *
 * It is a constant rather than a bare `12` in the default because it is also the
 * rate at which the directory name says nothing: a rung rendered at the protocol
 * rate writes `<animation>/`, and any other rate writes `<animation>@<fps>fps/`.
 */
const PROTOCOL_FPS = 12;
/**
 * The rate the framing box is measured at, whatever `--fps` writes frames at.
 *
 * ⚠️ The union of the posed quads depends on WHICH TIMES you sample, so taking
 * it at the output rate made the viewport a property of the rate: rung 1's
 * `balls` framed to 256x240 at 12 fps and 256x239 at 24 fps, and rung 5 to
 * 256x165 and 256x166. One pixel is enough to be a trap — the two sets look
 * comparable, an author measures a distance in one and a time in the other, and
 * the scale between them is silently off. Measuring the box densely and once
 * makes the framing a property of the SHOT, so every rate of one skeleton lands
 * on the same pixels.
 */
const FRAMING_FPS = 60;

interface Quad {
  /** World-space corners, in spine-core's region order: br, bl, ul, ur. */
  world: number[];
  /** Page UVs for the same four corners. */
  uvs: ArrayLike<number>;
  /** Slot colour x attachment colour, straight alpha, 0..1. */
  tint: [number, number, number, number];
}

interface Frame {
  time: number;
  quads: Quad[];
}

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
 * Sample one animation at a fixed rate and collect the posed quads per frame.
 *
 * The pose is driven through `AnimationState` rather than `Animation.apply`
 * because that is the path a runtime actually takes, and 4.3's `Animation.apply`
 * takes a `MixFrom` that only the state machine has any business choosing.
 */
function sampleAnimation(data: ReturnType<SkeletonJson['readSkeletonData']>, name: string, fps: number): Frame[] {
  const animation = data.findAnimation(name);
  if (!animation) throw new Error(`no animation "${name}" in the reference`);
  const skeleton = new Skeleton(data);
  const state = new AnimationState(new AnimationStateData(data));
  // Not looping: the last frame sits at the animation's duration, and a looping
  // entry would wrap it back onto the first pose.
  state.setAnimation(0, name, false);
  skeleton.setupPose();

  const step = 1 / fps;
  const count = Math.round(animation.duration * fps);
  const frames: Frame[] = [];
  for (let i = 0; i <= count; i++) {
    if (i > 0) {
      state.update(step);
      state.apply(skeleton);
      skeleton.update(step);
      skeleton.updateWorldTransform(Physics.update);
    } else {
      state.apply(skeleton);
      skeleton.update(0);
      skeleton.updateWorldTransform(Physics.reset);
    }
    frames.push({ time: i * step, quads: quadsOf(skeleton) });
  }
  return frames;
}

/**
 * The setup pose as a single frame — what a skeleton with **no animation at all**
 * looks like.
 *
 * ⭐ Not a degenerate case to be tolerated: a static rig is a deliverable. The
 * ladder's first rung ships one (`1-weight-and-mass`'s second export), and its
 * whole content is the setup pose. Falling over on it — which this file did,
 * with `posed no drawable attachment in any animation`, because the union box
 * was taken over `data.animations` and that list was empty — would have made the
 * rung unpreparable for a reason that has nothing to do with the rung.
 */
function sampleSetupPose(data: ReturnType<SkeletonJson['readSkeletonData']>): Frame[] {
  const skeleton = new Skeleton(data);
  skeleton.setupPose();
  skeleton.update(0);
  skeleton.updateWorldTransform(Physics.reset);
  return [{ time: 0, quads: quadsOf(skeleton) }];
}

/** The posed region attachments of one frame, in draw order. */
function quadsOf(skeleton: Skeleton): Quad[] {
  const quads: Quad[] = [];
  for (const slot of skeleton.drawOrder.appliedPose) {
    const pose = slot.appliedPose;
    const attachment = pose.attachment;
    if (!attachment) continue;
    if (attachment instanceof MeshAttachment) {
      throw new Error(
        `slot "${slot.data.name}" shows mesh attachment "${attachment.name}"; this renderer draws region ` +
          'attachments only, so a rung with meshes needs a triangle rasteriser before it can be rendered',
      );
    }
    if (!(attachment instanceof RegionAttachment)) continue;
    const world = new Array<number>(8).fill(0);
    const index = attachment.sequence.resolveIndex(pose);
    attachment.computeWorldVertices(slot, attachment.getOffsets(pose), world, 0, 2);
    const colour = pose.color;
    const own = attachment.color;
    quads.push({
      world,
      uvs: attachment.sequence.getUVs(index),
      tint: [colour.r * own.r, colour.g * own.g, colour.b * own.b, colour.a * own.a],
    });
  }
  return quads;
}

/**
 * Blit one affine quad onto the plate.
 *
 * The quad is an affine image of the region's rectangle, so a destination pixel
 * maps back to a (s, t) inside it by inverting one 2x2 — no perspective divide,
 * no triangle split. Sampling is bilinear and the source is straight alpha
 * (`pma: false` on every page the corpus ships).
 */
function blitQuad(dst: Plate, page: Plate, quad: Quad, project: (wx: number, wy: number) => [number, number]): void {
  // spine-core's region order is br, bl, ul, ur.
  const [brx, bry, blx, bly, ulx, uly] = quad.world;
  const bl = project(blx, bly);
  const br = project(brx, bry);
  const ul = project(ulx, uly);
  const ex = [br[0] - bl[0], br[1] - bl[1]];
  const ey = [ul[0] - bl[0], ul[1] - bl[1]];
  const det = ex[0] * ey[1] - ex[1] * ey[0];
  if (Math.abs(det) < 1e-9) return; // degenerate: zero scale, nothing to draw
  const [ubr, vbr, ubl, vbl, uul, vul] = [
    quad.uvs[0],
    quad.uvs[1],
    quad.uvs[2],
    quad.uvs[3],
    quad.uvs[4],
    quad.uvs[5],
  ];

  const corners = [bl, br, ul, [br[0] + ey[0], br[1] + ey[1]]];
  const minX = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0]))));
  const maxX = Math.min(dst.width - 1, Math.ceil(Math.max(...corners.map((c) => c[0]))));
  const minY = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1]))));
  const maxY = Math.min(dst.height - 1, Math.ceil(Math.max(...corners.map((c) => c[1]))));

  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const rx = px + 0.5 - bl[0];
      const ry = py + 0.5 - bl[1];
      const s = (rx * ey[1] - ry * ey[0]) / det;
      const t = (ex[0] * ry - ex[1] * rx) / det;
      if (s < 0 || s > 1 || t < 0 || t > 1) continue;
      const u = ubl + s * (ubr - ubl) + t * (uul - ubl);
      const v = vbl + s * (vbr - vbl) + t * (vul - vbl);
      const sample = bilinear(page, u * page.width - 0.5, v * page.height - 0.5);
      const alpha = sample[3] * quad.tint[3];
      if (alpha <= 0.5) continue;
      dst.blend(px, py, [
        Math.round(sample[0] * quad.tint[0]),
        Math.round(sample[1] * quad.tint[1]),
        Math.round(sample[2] * quad.tint[2]),
        Math.round(alpha),
      ]);
    }
  }
}

function bilinear(page: Plate, x: number, y: number): [number, number, number, number] {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const at = (ix: number, iy: number): RGBA => {
    const cx = Math.max(0, Math.min(page.width - 1, ix));
    const cy = Math.max(0, Math.min(page.height - 1, iy));
    return page.get(cx, cy);
  };
  const c00 = at(x0, y0);
  const c10 = at(x0 + 1, y0);
  const c01 = at(x0, y0 + 1);
  const c11 = at(x0 + 1, y0 + 1);
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const top = c00[c] + (c10[c] - c00[c]) * fx;
    const bottom = c01[c] + (c11[c] - c01[c]) * fx;
    out[c] = top + (bottom - top) * fy;
  }
  return out;
}

function fill(plate: Plate, colour: RGBA): void {
  for (let y = 0; y < plate.height; y++) for (let x = 0; x < plate.width; x++) plate.set(x, y, colour);
}

/**
 * Every frame of one animation as one labelled grid, row major.
 *
 * Not decoration: this rung's subject is *spacing* — how far a thing travels
 * between two consecutive frames — and that is a comparison across frames. A
 * reader flipping through 65 separate files is comparing against memory.
 */
function contactSheet(
  frames: Frame[],
  page: Plate,
  minX: number,
  maxY: number,
  scale: number,
  width: number,
  height: number,
  tile: number,
): Plate {
  const tileScale = tile / Math.max(width, height);
  const tileW = Math.max(1, Math.round(width * tileScale));
  const tileH = Math.max(1, Math.round(height * tileScale));
  const columns = Math.min(SHEET_COLUMNS, frames.length);
  const rows = Math.ceil(frames.length / columns);
  const sheet = new Plate(columns * (tileW + 1) + 1, rows * (tileH + 1) + 1);
  fill(sheet, SHEET_RULE);
  frames.forEach((frame, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const ox = col * (tileW + 1) + 1;
    const oy = row * (tileH + 1) + 1;
    const tile = new Plate(tileW, tileH);
    fill(tile, BACKGROUND);
    const project = (wx: number, wy: number): [number, number] => [
      (wx - minX) * scale * tileScale,
      (maxY - wy) * scale * tileScale,
    ];
    for (const quad of frame.quads) blitQuad(tile, page, quad, project);
    tile.text(String(i), 2, 2, 1, SHEET_LABEL);
    for (let y = 0; y < tileH; y++) for (let x = 0; x < tileW; x++) sheet.set(ox + x, oy + y, tile.get(x, y));
  });
  return sheet;
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
  const atlasPath = join(exportDir, skeletonEntry.atlas);
  const atlas = new TextureAtlas(readFileSync(atlasPath, 'utf8'));
  const data = new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(
    JSON.parse(readFileSync(skeletonPath, 'utf8')),
  );
  if (atlas.pages.length !== 1) {
    usage(`${atlasPath} declares ${atlas.pages.length} pages; this renderer samples one page`);
  }
  const page = readPlate(join(exportDir, atlas.pages[0].name));

  // Pass 1: pose everything at FRAMING_FPS and take the union of the posed
  // quads, so that every animation of one skeleton — at every output rate —
  // shares a viewport. Framing each animation to its own extent would rescale
  // the motion between them, which is the one thing a timing-and-spacing
  // reference must not do. The frames themselves are sampled again below, at
  // whatever `--fps` asked for; this pass keeps nothing but four numbers.
  //
  // A skeleton with no animation contributes its setup pose instead, under the
  // reserved name `setup` — see `sampleSetupPose`.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const framingRates = data.animations.length === 0 ? [null] : data.animations.map((a) => a.name);
  for (const name of framingRates) {
    const frames = name === null ? sampleSetupPose(data) : sampleAnimation(data, name, FRAMING_FPS);
    for (const frame of frames) {
      for (const quad of frame.quads) {
        for (let i = 0; i < 8; i += 2) {
          minX = Math.min(minX, quad.world[i]);
          maxX = Math.max(maxX, quad.world[i]);
          minY = Math.min(minY, quad.world[i + 1]);
          maxY = Math.max(maxY, quad.world[i + 1]);
        }
      }
    }
  }
  if (!Number.isFinite(minX)) usage(`${skeletonPath} posed no drawable attachment in any animation or in its setup pose`);

  // Pass 2: the frames that actually get written.
  const sampled = new Map<string, Frame[]>();
  if (data.animations.length === 0) sampled.set(SETUP_POSE_DIR, sampleSetupPose(data));
  else for (const animation of data.animations) sampled.set(animation.name, sampleAnimation(data, animation.name, fps));

  const pad = Math.max(maxX - minX, maxY - minY) * PAD;
  minX -= pad;
  maxX += pad;
  minY -= pad;
  maxY += pad;
  const scale = maxSide / Math.max(maxX - minX, maxY - minY);
  const width = Math.max(1, Math.round((maxX - minX) * scale));
  const height = Math.max(1, Math.round((maxY - minY) * scale));
  // World is y up; an image is y down.
  const project = (wx: number, wy: number): [number, number] => [(wx - minX) * scale, (maxY - wy) * scale];

  const what = data.animations.length === 0 ? 'no animation — setup pose only' : `${sampled.size} animation(s)`;
  console.log(`  ${skeletonEntry.label}: ${width}x${height}px, ${what}`);
  mkdirSync(outRoot, { recursive: true });
  copyFileSync(licencePath, join(outRoot, 'license.txt'));
  // Two skeletons of one rung are two shots that share an atlas and nothing else
  // — they were framed to their own viewports a few lines up — so they do not
  // pool their frames in one directory. A rung with one skeleton keeps the short
  // path it already had, and rung 3's committed frames still land where they are.
  const skeletonRoot = rung.skeletons.length > 1 ? join(outRoot, skeletonEntry.label) : outRoot;
  for (const [name, frames] of sampled) {
    const dir = join(skeletonRoot, fps === PROTOCOL_FPS ? name : `${name}@${fps}fps`);
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    mkdirSync(dir, { recursive: true });
    let written = 0;
    for (let i = 0; i < frames.length; i++) {
      // The last frame is always written whatever the stride: it is where the
      // animation ENDS, which is the one frame a brief states outright.
      if (i % stride !== 0 && i !== frames.length - 1) continue;
      const plate = new Plate(width, height);
      fill(plate, BACKGROUND);
      for (const quad of frames[i].quads) blitQuad(plate, page, quad, project);
      plate.writePng(join(dir, `f${String(i).padStart(4, '0')}.png`));
      written++;
    }
    // One contact sheet beside the frames, of EVERY sampled frame — including
    // the ones the stride did not write out. Spacing (how far the thing moves
    // between two frames) is a comparison across frames, and it is visible in a
    // grid in a way it is not in 65 separate files.
    //
    // A single frame has nothing to compare itself against, so it gets no sheet:
    // the sheet would be that same frame with a border and a "0" on it, and the
    // reader would have opened a second file to learn nothing.
    if (frames.length > 1) {
      contactSheet(frames, page, minX, maxY, scale, width, height, tile).writePng(join(dir, 'contact.png'));
    }
    const last = frames[frames.length - 1].time;
    const how = frames.length === 1 ? 'a single pose' : `${last.toFixed(3)}s at ${fps} fps`;
    const kept = written === frames.length ? '' : ` (${written} written, stride ${stride})`;
    console.log(`    ${name.padEnd(16)} ${frames.length} frame(s)${kept}, ${how} -> ${dir}`);
  }
}
