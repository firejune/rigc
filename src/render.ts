/**
 * The region rasteriser — one code path for reference frames and for candidates.
 *
 * ⭐ Why this is a module and not a script. `bench/render_reference.ts` renders
 * the official export to the PNG frames an authoring agent is allowed to see;
 * `rigc check` renders the agent's own candidate and compares it against those
 * frames. If those two drew pixels differently, every number `check` reports
 * would carry the difference between two renderers on top of the difference
 * between two rigs — and the second is the only one anybody wants to read. So
 * there is exactly one rasteriser, and both callers are thin.
 *
 * ## What it draws, and what it refuses
 *
 * Region attachments only. For a region attachment a bone transform is a plain
 * affine map: `spine-core` computes the four world vertices on the CPU, a
 * destination pixel maps back into the region's rectangle by inverting one 2x2,
 * and there is no perspective divide and no triangle split. Sampling is bilinear
 * and the source is straight alpha.
 *
 * 🚧 A mesh attachment needs a triangle rasteriser and a deform path, and this
 * **refuses it by name** rather than dropping it silently — the same rule the
 * compiler follows for a format feature it does not emit. A rung that ships
 * meshes cannot be rendered, and says so.
 *
 * ## Two conventions this file owns
 *
 * - **Spine world is y up; an image is y down.** The projection from world to
 *   frame pixels lives in `projector` and nowhere else.
 * - **The framing box is measured at `FRAMING_FPS`, whatever rate frames are
 *   written at.** The union of the posed quads depends on WHICH TIMES you
 *   sample, so taking it at the output rate made the viewport a property of the
 *   rate: rung 1's `balls` framed to 256x240 at 12 fps and 256x239 at 24 fps.
 *   One pixel is enough to be a trap — the two sets look comparable, an author
 *   measures a distance in one and a time in the other, and the scale between
 *   them is silently off.
 *
 * ⚠️ Two notes on where this sits. It imports `spine-core`, which `src/` is
 * otherwise careful about: posing a skeleton *is* running the runtime, and there
 * is no honest way to render one without it. The rule that matters is unchanged
 * — `src/compile.ts` must stay independent of the runtime so the compiler and
 * the gate are not checking each other's assumptions — and this file is neither.
 * It also imports `tools/plate.ts` for the PNG codec, which is dependency-free.
 */
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
  TextureAtlasRegion,
  type SkeletonData,
} from '@esotericsoftware/spine-core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Plate, readPlate, type RGBA } from '../tools/plate.ts';

/** Opaque, and light: both of rung 3's parts are dark slate, so is every ground. */
export const BACKGROUND: RGBA = [232, 232, 232, 255];
/** Padding around the union bounding box, as a fraction of its long side. */
export const PAD = 0.04;
/**
 * Directory a skeleton with no animation writes its one frame into.
 *
 * It cannot collide with an animation's directory, because an animation named
 * `setup` would have to live in a skeleton that has at least one animation, and
 * this name is only ever used when there are none.
 */
export const SETUP_POSE_DIR = 'setup';
/**
 * The sampling rate the ladder's briefs are written against.
 *
 * It is a constant rather than a bare `12` in the default because it is also the
 * rate at which the directory name says nothing: a rung rendered at the protocol
 * rate writes `<animation>/`, and any other rate writes `<animation>@<fps>fps/`.
 */
export const PROTOCOL_FPS = 12;
/** The rate the framing box is measured at, whatever `--fps` writes frames at. */
export const FRAMING_FPS = 60;

// ---------------------------------------------------------------------------
// the frame-set sidecar
// ---------------------------------------------------------------------------
//
// ⭐ A rendered frame set is a picture of a world box, and the box used to be
// nowhere. That cost two things. An author measuring a distance in pixels had no
// way to turn it into the units a rig is authored in except by finding something
// of a known size in the shot; and nothing could render a SECOND skeleton onto
// the same pixel grid, because the grid was a number that existed only inside one
// run of `render_reference.ts`. `frames.json` writes it down.

/** The sidecar's file name and format tag. */
export const FRAMES_SIDECAR = 'frames.json';
export const FRAMES_SPEC = 'rigc-frames/1';

/** One rendered frame directory: which animation, at what rate, and what is on disk. */
export interface FrameSet {
  /** Directory name under the skeleton root — `heavy`, or `heavy@24fps`. */
  dir: string;
  /** The animation these frames show, or `null` for a skeleton with none. */
  animation: string | null;
  fps: number;
  /** How many frames the animation sampled to at this rate. */
  sampled: number;
  /** How many were actually written (a stride writes fewer). */
  written: number;
  stride: number;
  /**
   * The last sampled frame's time, in seconds.
   *
   * ⚠️ Which indices are on disk is deliberately NOT recorded here. The
   * directory is the only author of that fact, and a second copy of it in this
   * file could only ever be the stale one.
   */
  duration: number;
}

export interface FramesSidecar {
  spec: string;
  example?: string;
  rung?: string;
  skeleton?: string;
  /** The colour the frames were cleared to, straight RGBA 0..255. */
  background: RGBA;
  viewport: {
    /** World box, y up, matching Spine's own coordinates. */
    x: number;
    y: number;
    width: number;
    height: number;
    /** Frame pixels per world unit. */
    scale: number;
    pixelWidth: number;
    pixelHeight: number;
  };
  sets: FrameSet[];
}

// ---------------------------------------------------------------------------
// posing
// ---------------------------------------------------------------------------

export interface Quad {
  /** World-space corners, in spine-core's region order: br, bl, ul, ur. */
  world: number[];
  /** Page UVs for the same four corners. */
  uvs: ArrayLike<number>;
  /** Slot colour x attachment colour, straight alpha, 0..1. */
  tint: [number, number, number, number];
  /** The slot this quad was drawn for — what per-slot tracking is keyed by. */
  slot: string;
  /** The atlas page name this quad samples, so a multi-page atlas resolves. */
  page: string;
}

export interface Frame {
  /** Index within the sampled sequence — the number in `f0000.png`. */
  index: number;
  time: number;
  quads: Quad[];
}

/** Where the world sits in a frame: the four world numbers plus the scale. */
export interface Viewport {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Frame pixels per world unit. */
  scale: number;
  /** Frame size in pixels. */
  width: number;
  height: number;
}

/** A loaded skeleton and every atlas page it can sample, keyed by page name. */
export interface Posable {
  data: SkeletonData;
  pages: Map<string, Plate>;
}

/**
 * Load a skeleton, its atlas and every page the atlas declares.
 *
 * Every page, not the first: rigc emits **one part per page**, so a rigc
 * candidate for rung 1 has eight of them. `render_reference.ts` used to insist
 * on exactly one because an editor export packs into one — that assumption is
 * true of the reference and false of every candidate, and a renderer both sides
 * share cannot hold it.
 */
export function loadPosable(skeletonPath: string, atlasPath: string, atlasDir: string): Posable {
  return posableFromText(readFileSync(skeletonPath, 'utf8'), readFileSync(atlasPath, 'utf8'), atlasDir);
}

/** Same, for artifacts held in memory rather than on disk. */
export function posableFromText(skeletonText: string, atlasText: string, atlasDir: string): Posable {
  const atlas = new TextureAtlas(atlasText);
  const pages = new Map<string, Plate>();
  for (const page of atlas.pages) pages.set(page.name, readPlate(join(atlasDir, page.name)));
  const data = new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(JSON.parse(skeletonText));
  return { data, pages };
}

/**
 * Sample one animation at a fixed rate and collect the posed quads per frame.
 *
 * The pose is driven through `AnimationState` rather than `Animation.apply`
 * because that is the path a runtime actually takes, and 4.3's `Animation.apply`
 * takes a `MixFrom` that only the state machine has any business choosing.
 */
export function sampleAnimation(data: SkeletonData, name: string, fps: number): Frame[] {
  const animation = data.findAnimation(name);
  if (!animation) {
    throw new Error(
      `no animation "${name}" in this skeleton; it has [${data.animations.map((a) => a.name).join(', ') || 'none'}]`,
    );
  }
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
    frames.push({ index: i, time: i * step, quads: quadsOf(skeleton) });
  }
  return frames;
}

/**
 * The setup pose as a single frame — what a skeleton with **no animation at all**
 * looks like.
 *
 * ⭐ Not a degenerate case to be tolerated: a static rig is a deliverable. The
 * ladder's first rung ships one (`1-weight-and-mass`'s second export), and its
 * whole content is the setup pose.
 */
export function sampleSetupPose(data: SkeletonData): Frame[] {
  const skeleton = new Skeleton(data);
  skeleton.setupPose();
  skeleton.update(0);
  skeleton.updateWorldTransform(Physics.reset);
  return [{ index: 0, time: 0, quads: quadsOf(skeleton) }];
}

/**
 * Every animation of one skeleton at one rate, keyed by the name its frames are
 * filed under. A skeleton with no animation at all contributes its setup pose
 * under `SETUP_POSE_DIR`.
 */
export function sampleAll(data: SkeletonData, fps: number): Map<string, Frame[]> {
  const out = new Map<string, Frame[]>();
  if (data.animations.length === 0) out.set(SETUP_POSE_DIR, sampleSetupPose(data));
  else for (const animation of data.animations) out.set(animation.name, sampleAnimation(data, animation.name, fps));
  return out;
}

/** The posed region attachments of one frame, in draw order. */
export function quadsOf(skeleton: Skeleton): Quad[] {
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
    const region = attachment.sequence.regions[index];
    if (!(region instanceof TextureAtlasRegion)) {
      throw new Error(
        `slot "${slot.data.name}" attachment "${attachment.name}" resolved to no atlas region; ` +
          'the attachment names a region the atlas does not have',
      );
    }
    quads.push({
      world,
      uvs: attachment.sequence.getUVs(index),
      tint: [colour.r * own.r, colour.g * own.g, colour.b * own.b, colour.a * own.a],
      slot: slot.data.name,
      page: region.page.name,
    });
  }
  return quads;
}

// ---------------------------------------------------------------------------
// framing
// ---------------------------------------------------------------------------

/** The world-space box every posed quad of these frames fits inside. */
export function unionBounds(frameSets: Iterable<Frame[]>): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const frames of frameSets) {
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
  return { minX, minY, maxX, maxY };
}

/**
 * The viewport a skeleton is framed to: its union box at `FRAMING_FPS`, padded,
 * scaled so the long side is `maxSide` pixels.
 *
 * Measuring the box densely and once makes the framing a property of the SHOT,
 * so every rate of one skeleton lands on the same pixels.
 */
export function framingViewport(data: SkeletonData, maxSide: number): Viewport | null {
  const sets =
    data.animations.length === 0
      ? [sampleSetupPose(data)]
      : data.animations.map((a) => sampleAnimation(data, a.name, FRAMING_FPS));
  const box = unionBounds(sets);
  if (!Number.isFinite(box.minX)) return null;
  const pad = Math.max(box.maxX - box.minX, box.maxY - box.minY) * PAD;
  return viewportFor(box.minX - pad, box.minY - pad, box.maxX + pad, box.maxY + pad, maxSide);
}

/** A viewport over an explicit world box, scaled so its long side is `maxSide`. */
export function viewportFor(minX: number, minY: number, maxX: number, maxY: number, maxSide: number): Viewport {
  const scale = maxSide / Math.max(maxX - minX, maxY - minY);
  return {
    minX,
    minY,
    maxX,
    maxY,
    scale,
    width: Math.max(1, Math.round((maxX - minX) * scale)),
    height: Math.max(1, Math.round((maxY - minY) * scale)),
  };
}

/**
 * A viewport over an explicit world box whose pixel size is already known.
 *
 * This is the shape `check` needs: the frames on disk fix the pixel size, and
 * re-deriving it from the box would round to a different integer and silently
 * shift every measurement by up to half a pixel.
 */
export function viewportOfSize(
  minX: number,
  minY: number,
  width: number,
  height: number,
  scale: number,
  pixelWidth: number,
  pixelHeight: number,
): Viewport {
  return { minX, minY, maxX: minX + width, maxY: minY + height, scale, width: pixelWidth, height: pixelHeight };
}

/** World (y up) to frame pixels (y down). The only place that conversion lives. */
export function projector(v: Viewport): (wx: number, wy: number) => [number, number] {
  return (wx, wy) => [(wx - v.minX) * v.scale, (v.maxY - wy) * v.scale];
}

// ---------------------------------------------------------------------------
// rasterising
// ---------------------------------------------------------------------------

/**
 * Walk the destination pixels one affine quad covers, sampling the page.
 *
 * The quad is an affine image of the region's rectangle, so a destination pixel
 * maps back to a (s, t) inside it by inverting one 2x2 — no perspective divide,
 * no triangle split. `emit` is called for every covered pixel whose composited
 * alpha clears the coverage threshold, which is what makes "draw it" and
 * "measure where it landed" the same traversal rather than two that can drift.
 */
export function rasteriseQuad(
  page: Plate,
  quad: Quad,
  project: (wx: number, wy: number) => [number, number],
  clip: { width: number; height: number },
  emit: (px: number, py: number, r: number, g: number, b: number, a: number) => void,
): void {
  // spine-core's region order is br, bl, ul, ur.
  const [brx, bry, blx, bly, ulx, uly] = quad.world;
  const bl = project(blx, bly);
  const br = project(brx, bry);
  const ul = project(ulx, uly);
  const ex = [br[0] - bl[0], br[1] - bl[1]];
  const ey = [ul[0] - bl[0], ul[1] - bl[1]];
  const det = ex[0] * ey[1] - ex[1] * ey[0];
  if (Math.abs(det) < 1e-9) return; // degenerate: zero scale, nothing to draw
  const [ubr, vbr, ubl, vbl, uul, vul] = [quad.uvs[0], quad.uvs[1], quad.uvs[2], quad.uvs[3], quad.uvs[4], quad.uvs[5]];

  const corners = [bl, br, ul, [br[0] + ey[0], br[1] + ey[1]]];
  const minX = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0]))));
  const maxX = Math.min(clip.width - 1, Math.ceil(Math.max(...corners.map((c) => c[0]))));
  const minY = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1]))));
  const maxY = Math.min(clip.height - 1, Math.ceil(Math.max(...corners.map((c) => c[1]))));

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
      emit(
        px,
        py,
        Math.round(sample[0] * quad.tint[0]),
        Math.round(sample[1] * quad.tint[1]),
        Math.round(sample[2] * quad.tint[2]),
        Math.round(alpha),
      );
    }
  }
}

/** Blit one affine quad onto the plate, source-over. */
export function blitQuad(
  dst: Plate,
  page: Plate,
  quad: Quad,
  project: (wx: number, wy: number) => [number, number],
): void {
  rasteriseQuad(page, quad, project, dst, (px, py, r, g, b, a) => dst.blend(px, py, [r, g, b, a]));
}

export function bilinear(page: Plate, x: number, y: number): [number, number, number, number] {
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

export function fill(plate: Plate, colour: RGBA): void {
  for (let y = 0; y < plate.height; y++) for (let x = 0; x < plate.width; x++) plate.set(x, y, colour);
}

/** Look a page up by name, with a failure that names what the atlas did declare. */
export function pageFor(pages: Map<string, Plate>, quad: Quad): Plate {
  const page = pages.get(quad.page);
  if (!page) {
    throw new Error(
      `slot "${quad.slot}" samples atlas page "${quad.page}", which is not among [${[...pages.keys()].join(', ')}]`,
    );
  }
  return page;
}

/** One frame, composited over `background`, at the viewport's pixel size. */
export function renderFrame(frame: Frame, pages: Map<string, Plate>, viewport: Viewport, background: RGBA): Plate {
  const plate = new Plate(viewport.width, viewport.height);
  fill(plate, background);
  const project = projector(viewport);
  for (const quad of frame.quads) blitQuad(plate, pageFor(pages, quad), quad, project);
  return plate;
}

/** Where one thing landed in a frame, in frame pixels. */
export interface Footprint {
  /** Alpha-weighted count of covered pixels. 0 means nothing was drawn. */
  pixels: number;
  cx: number;
  cy: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const EMPTY_FOOTPRINT: Footprint = { pixels: 0, cx: 0, cy: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };

/** Where a frame's pixels went: the coverage mask, and each slot's own footprint. */
export interface FrameGeometry {
  /** 1 where any quad drew, in `viewport.width * viewport.height` row-major order. */
  coverage: Uint8Array;
  footprints: Map<string, Footprint>;
}

/**
 * Rasterise one frame for measurement rather than for looking at: which pixels
 * it covers, and where each slot landed.
 *
 * ⚠️ A slot's footprint is measured on the pixels **that slot draws**, ignoring
 * what is drawn over it. That is deliberate. A slot hidden behind another still
 * has a position, and it is the position the rig gives it; measuring it on the
 * composite would report the occluder's geometry instead and call the rig wrong
 * for being covered up. What the composite costs is on the reference side, where
 * an occluded part merges into its occluder's component — and that is what the
 * matcher reports as ambiguity rather than as drift.
 */
export function frameGeometry(frame: Frame, pages: Map<string, Plate>, viewport: Viewport): FrameGeometry {
  const coverage = new Uint8Array(viewport.width * viewport.height);
  const footprints = new Map<string, Footprint>();
  const project = projector(viewport);
  for (const quad of frame.quads) {
    let weight = 0;
    let sx = 0;
    let sy = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    rasteriseQuad(pageFor(pages, quad), quad, project, viewport, (px, py, _r, _g, _b, a) => {
      coverage[py * viewport.width + px] = 1;
      const w = a / 255;
      weight += w;
      sx += (px + 0.5) * w;
      sy += (py + 0.5) * w;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    });
    const previous = footprints.get(quad.slot);
    const here: Footprint =
      weight === 0
        ? EMPTY_FOOTPRINT
        : { pixels: weight, cx: sx / weight, cy: sy / weight, minX, minY, maxX: maxX + 1, maxY: maxY + 1 };
    // A slot shows one attachment at a time, so this only merges when a caller
    // hands us a frame with two quads on one slot; merging is still the honest
    // answer, and it keeps the map keyed by slot the way the report reads it.
    footprints.set(quad.slot, previous && previous.pixels > 0 ? mergeFootprints(previous, here) : here);
  }
  return { coverage, footprints };
}

function mergeFootprints(a: Footprint, b: Footprint): Footprint {
  if (b.pixels === 0) return a;
  const pixels = a.pixels + b.pixels;
  return {
    pixels,
    cx: (a.cx * a.pixels + b.cx * b.pixels) / pixels,
    cy: (a.cy * a.pixels + b.cy * b.pixels) / pixels,
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}
