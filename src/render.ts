/**
 * The rasteriser — one code path for reference frames and for candidates.
 *
 * ⭐ Why this is a module and not a script. `bench/render_reference.ts` renders
 * the official export to the PNG frames an authoring agent is allowed to see;
 * `rigc check` renders the agent's own candidate and compares it against those
 * frames. If those two drew pixels differently, every number `check` reports
 * would carry the difference between two renderers on top of the difference
 * between two rigs — and the second is the only one anybody wants to read. So
 * there is exactly one rasteriser, and both callers are thin.
 *
 * ## What it draws
 *
 * Region and mesh attachments, in draw order, tinted by slot colour x attachment
 * colour. Both are **affine** texture maps and neither divides by w:
 *
 * - a **region** is one quad. `spine-core` computes its four world vertices on
 *   the CPU, a destination pixel maps back into the region's rectangle by
 *   inverting one 2x2, and there is no triangle split at all;
 * - a **mesh** is a triangle list. `MeshAttachment.computeWorldVertices` does the
 *   work — it is the runtime's own routine, so weighted vertices resolve through
 *   their bones and a `deform` timeline's offsets are applied, exactly the way a
 *   real runtime would. Each triangle is then filled with barycentric UV
 *   interpolation.
 *
 * ⭐ **Sampling is bilinear on both paths, and the source is straight alpha.**
 * One filter rather than two is not a detail: `check` measures a candidate
 * against reference frames, and a mesh triangle sampled nearest against a
 * reference sampled bilinear would put a filter difference into the residual
 * where only a rig difference belongs. Bilinear rather than nearest because the
 * region path was already bilinear and the five committed rungs are rendered
 * with it — see `bilinear`.
 *
 * ⚠️ **Region rasterising is untouched by the mesh path**, deliberately. A region
 * could be drawn as two triangles and very nearly the same pixels would come out;
 * "very nearly" would have silently rewritten five rungs of committed reference
 * frames. `rasteriseQuad` still owns regions, `rasteriseMesh` owns meshes, and
 * `rasterisePiece` picks.
 *
 * ## The fill rule, and why a mesh needs one
 *
 * Two triangles that share an edge must cover the pixels along it exactly once.
 * Include the boundary in both and every interior edge of a mesh blends twice —
 * a visible lattice of seams wherever the art is not opaque. Exclude it in both
 * and the seams become holes.
 *
 * So `rasteriseMesh` normalises each triangle's winding and applies the standard
 * **top-left rule**: a pixel centre exactly on an edge belongs to the triangle
 * only when that edge is a top or a left one. The two triangles sharing an edge
 * traverse it in opposite directions, so exactly one of them calls it top-left —
 * which is the property that makes the rule watertight without an epsilon.
 *
 * ## Two conventions this file owns
 *
 * - **Spine world is y up; an image is y down.** The projection from world to
 *   frame pixels lives in `projector` and nowhere else.
 * - **The framing box is measured at `FRAMING_FPS`, whatever rate frames are
 *   written at.** The union of the posed vertices depends on WHICH TIMES you
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

/** What every drawable has in common, whatever shape it is. */
export interface PieceCommon {
  /**
   * World-space vertex positions, `x, y` per vertex.
   *
   * ⭐ The one field the framing code reads, and the reason it is spelled the
   * same on both shapes: a union over "every posed point" is a loop over this
   * array in steps of two, and it does not need to know whether four numbers are
   * a rectangle's corners or two hundred are a mesh's hull.
   */
  world: number[];
  /** Slot colour x attachment colour, straight alpha, 0..1. */
  tint: [number, number, number, number];
  /** The slot this was drawn for — what per-slot tracking is keyed by. */
  slot: string;
  /** The atlas page name this samples, so a multi-page atlas resolves. */
  page: string;
}

export interface Quad extends PieceCommon {
  kind: 'region';
  /** World-space corners, in spine-core's region order: br, bl, ul, ur. */
  world: number[];
  /** Page UVs for the same four corners. */
  uvs: ArrayLike<number>;
}

/**
 * A posed mesh attachment: world vertices, page UVs, and the triangulation.
 *
 * The vertices arrive from `MeshAttachment.computeWorldVertices`, which is the
 * runtime's own routine and therefore the only place the weighting and deform
 * arithmetic lives. Reimplementing either here would give `check` a second
 * opinion about where a vertex is, and a second opinion is exactly what a gate
 * must not have.
 */
export interface Mesh extends PieceCommon {
  kind: 'mesh';
  /** Page UVs, `u, v` per vertex, parallel to `world`. */
  uvs: ArrayLike<number>;
  /** Vertex index triplets. */
  triangles: ArrayLike<number>;
}

/** One drawable in a posed frame. */
export type Piece = Quad | Mesh;

export interface Frame {
  /** Index within the sampled sequence — the number in `f0000.png`. */
  index: number;
  time: number;
  /**
   * Everything the frame draws, in draw order.
   *
   * Named `pieces` rather than `quads` since meshes joined it: a mesh is not a
   * quad, and a field that says otherwise is the kind of name a reader trusts
   * and then indexes `world[6]` through.
   */
  pieces: Piece[];
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
 * Sample one animation at a fixed rate and collect the posed pieces per frame.
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
    frames.push({ index: i, time: i * step, pieces: piecesOf(skeleton) });
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
  return [{ index: 0, time: 0, pieces: piecesOf(skeleton) }];
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

/**
 * The posed drawables of one frame, in draw order.
 *
 * Regions and meshes take the same three steps — resolve the sequence index,
 * ask `spine-core` for the world vertices, read the page UVs back off the same
 * sequence — and differ only in which runtime call does step two. An attachment
 * type that is neither is skipped rather than refused: a bounding box, a point
 * and a clipping attachment are all things a rig legitimately carries and none
 * of them draws a pixel.
 */
export function piecesOf(skeleton: Skeleton): Piece[] {
  const pieces: Piece[] = [];
  for (const slot of skeleton.drawOrder.appliedPose) {
    const pose = slot.appliedPose;
    const attachment = pose.attachment;
    if (!attachment) continue;
    const isMesh = attachment instanceof MeshAttachment;
    if (!isMesh && !(attachment instanceof RegionAttachment)) continue;

    const index = attachment.sequence.resolveIndex(pose);
    const region = attachment.sequence.regions[index];
    if (!(region instanceof TextureAtlasRegion)) {
      throw new Error(
        `slot "${slot.data.name}" attachment "${attachment.name}" resolved to no atlas region; ` +
          'the attachment names a region the atlas does not have',
      );
    }
    const colour = pose.color;
    const own = attachment.color;
    const tint: [number, number, number, number] = [
      colour.r * own.r,
      colour.g * own.g,
      colour.b * own.b,
      colour.a * own.a,
    ];
    const common = { tint, slot: slot.data.name, page: region.page.name };

    if (isMesh) {
      // `worldVerticesLength` is 2 per vertex whether or not the mesh is
      // weighted — the weight runs live in `vertices`, not here — so this is the
      // full output length and the whole mesh is computed in one call. Deform
      // offsets, if the pose carries any, are applied inside it.
      const world = new Array<number>(attachment.worldVerticesLength).fill(0);
      attachment.computeWorldVertices(skeleton, slot, 0, attachment.worldVerticesLength, world, 0, 2);
      pieces.push({ kind: 'mesh', ...common, world, uvs: attachment.sequence.getUVs(index), triangles: attachment.triangles });
      continue;
    }

    const world = new Array<number>(8).fill(0);
    attachment.computeWorldVertices(slot, attachment.getOffsets(pose), world, 0, 2);
    pieces.push({ kind: 'region', ...common, world, uvs: attachment.sequence.getUVs(index) });
  }
  return pieces;
}

// ---------------------------------------------------------------------------
// framing
// ---------------------------------------------------------------------------

/**
 * The world-space box every posed vertex of these frames fits inside.
 *
 * `world.length` rather than a literal 8: a region contributes its four corners
 * and a mesh every one of its vertices, and the loop does not need to know which
 * it is holding.
 */
export function unionBounds(frameSets: Iterable<Frame[]>): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const frames of frameSets) {
    for (const frame of frames) {
      for (const piece of frame.pieces) {
        for (let i = 0; i < piece.world.length; i += 2) {
          minX = Math.min(minX, piece.world[i]);
          maxX = Math.max(maxX, piece.world[i]);
          minY = Math.min(minY, piece.world[i + 1]);
          maxY = Math.max(maxY, piece.world[i + 1]);
        }
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

/**
 * The opaque sub-rectangle of one quad's region, in the quad's own `(s, t)`.
 *
 * `(0,0)` is the region's bottom-left corner and `(1,1)` its top-right, so a trim
 * of `{0, 0, 1, 1}` is a region whose art fills it and anything smaller is the
 * transparent margin the art was exported with.
 */
export interface RegionTrim {
  minS: number;
  minT: number;
  maxS: number;
  maxT: number;
}

/**
 * Where a quad's artwork actually is, as opposed to where its rectangle is.
 *
 * ⭐ This is what stops an invisible margin from being able to move anything. A
 * region attachment's quad is the whole PNG, transparent border included, so two
 * exports of the same drawing with different margins pose to different quads and
 * frame themselves differently — which is how rung 5 reported MAE 39.00 for a rig
 * whose every key was right (issue #34). Trimming to the opaque texels makes the
 * box a property of the drawing.
 *
 * Alpha above zero rather than the rasteriser's coverage threshold, deliberately:
 * this is the box that has to CONTAIN the drawing, and a box that is a texel too
 * generous costs nothing while one that is a texel short clips.
 *
 * `cache` is keyed by page and region rectangle, because a scan per quad per frame
 * would be a scan per quad per frame.
 */
export function regionTrim(page: Plate, quad: Quad, cache: Map<string, RegionTrim | null>): RegionTrim | null {
  const [ubr, vbr, ubl, vbl, uul, vul] = [quad.uvs[0], quad.uvs[1], quad.uvs[2], quad.uvs[3], quad.uvs[4], quad.uvs[5]];
  const key = `${quad.page}|${ubr},${vbr},${ubl},${vbl},${uul},${vul}`;
  const seen = cache.get(key);
  if (seen !== undefined) return seen;

  const ox = ubl * page.width;
  const oy = vbl * page.height;
  const ex = [(ubr - ubl) * page.width, (vbr - vbl) * page.height];
  const ey = [(uul - ubl) * page.width, (vul - vbl) * page.height];
  const det = ex[0] * ey[1] - ex[1] * ey[0];
  if (Math.abs(det) < 1e-9) {
    cache.set(key, null);
    return null;
  }
  const corners = [
    [ox, oy],
    [ox + ex[0], oy + ex[1]],
    [ox + ey[0], oy + ey[1]],
    [ox + ex[0] + ey[0], oy + ex[1] + ey[1]],
  ];
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0]))));
  const x1 = Math.min(page.width - 1, Math.ceil(Math.max(...corners.map((c) => c[0]))));
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1]))));
  const y1 = Math.min(page.height - 1, Math.ceil(Math.max(...corners.map((c) => c[1]))));

  let minS = Infinity;
  let minT = Infinity;
  let maxS = -Infinity;
  let maxT = -Infinity;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (page.get(x, y)[3] === 0) continue;
      const rx = x + 0.5 - ox;
      const ry = y + 0.5 - oy;
      const s = (rx * ey[1] - ry * ey[0]) / det;
      const t = (ex[0] * ry - ex[1] * rx) / det;
      if (s < 0 || s > 1 || t < 0 || t > 1) continue;
      if (s < minS) minS = s;
      if (s > maxS) maxS = s;
      if (t < minT) minT = t;
      if (t > maxT) maxT = t;
    }
  }
  const trim = Number.isFinite(minS) ? { minS, minT, maxS, maxT } : null;
  cache.set(key, trim);
  return trim;
}

/**
 * The world box every piece's **artwork** fits inside, over these frames.
 *
 * The same union as `unionBounds`, taken over the trimmed rectangles instead of
 * the quads. It is a starting box for `check`'s framing and nothing more — the
 * framing itself is fitted on rendered pixels — but the start has to be free of
 * transparent margins too, or the path the fit takes still depends on them.
 *
 * ⚠️ **A mesh contributes its raw vertices and is not trimmed.** The trim exists
 * because a region attachment's quad is the whole PNG, transparent border and
 * all, so its corners sit where no pixel is. A mesh's hull is authored *onto the
 * drawing* — that is what makes it a mesh — so its vertices already are where the
 * artwork is, and there is no rectangle to invert a margin out of. Passing a
 * triangle fan through the rectangle trim would not be a better estimate of the
 * same box; it would be a different box, computed from a rectangle the mesh does
 * not have.
 */
export function trimmedUnionBounds(
  frameSets: Iterable<Frame[]>,
  pages: Map<string, Plate>,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const cache = new Map<string, RegionTrim | null>();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const see = (x: number, y: number): void => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const frames of frameSets) {
    for (const frame of frames) {
      for (const piece of frame.pieces) {
        if (piece.kind === 'mesh') {
          for (let i = 0; i < piece.world.length; i += 2) see(piece.world[i], piece.world[i + 1]);
          continue;
        }
        const quad = piece;
        const [brx, bry, blx, bly, ulx, uly] = quad.world;
        const trim = regionTrim(pageFor(pages, quad), quad, cache);
        if (!trim) {
          for (let i = 0; i < 8; i += 2) see(quad.world[i], quad.world[i + 1]);
          continue;
        }
        const ex = [brx - blx, bry - bly];
        const ey = [ulx - blx, uly - bly];
        for (const [s, t] of [
          [trim.minS, trim.minT],
          [trim.maxS, trim.minT],
          [trim.minS, trim.maxT],
          [trim.maxS, trim.maxT],
        ]) {
          see(blx + s * ex[0] + t * ey[0], bly + s * ex[1] + t * ey[1]);
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

/** A destination pixel and the straight-alpha colour a piece put there. */
export type EmitPixel = (px: number, py: number, r: number, g: number, b: number, a: number) => void;

/**
 * Is this edge a top or a left one, for the winding `rasteriseMesh` normalises to?
 *
 * Derived rather than copied, because the answer depends on the sign convention
 * of the edge function and the direction of y. With `edge(p) = dx·(py−y0) −
 * dy·(px−x0)` and y pointing **down**, the triangle `(0,0) → (1,0) → (0,1)` has
 * positive area, and its horizontal edge `(0,0) → (1,0)` — `dx > 0`, `dy = 0` —
 * is the one along its top. Its `(0,1) → (0,0)` edge — `dy < 0`, going up — is
 * the one down its left.
 *
 * What actually makes the rule watertight needs neither of those facts: the two
 * triangles sharing an edge traverse it in opposite directions, so `dy < 0` holds
 * for exactly one of them, and when `dy` is 0 for both, `dx > 0` holds for
 * exactly one. Every shared edge is therefore claimed once. Getting the
 * orientation right on top of that is what keeps the classic meaning — a pixel
 * centre on a boundary belongs to the triangle below-right of it.
 */
function isTopLeftEdge(dx: number, dy: number): boolean {
  return dy < 0 || (dy === 0 && dx > 0);
}

/**
 * Walk the destination pixels one posed mesh covers, sampling the page.
 *
 * Each triangle is filled independently with barycentric UV interpolation and no
 * perspective divide — a Spine mesh is a flat 2D deformation, so its UVs are
 * affine in screen space and there is no `w` to divide by. The winding is
 * normalised per triangle (a mesh's triangles are not guaranteed to agree, and a
 * bone with negative scale flips them all anyway), and the top-left rule then
 * makes every interior edge belong to exactly one of the two triangles that
 * share it.
 *
 * `emit` has the same contract as `rasteriseQuad`'s — every covered pixel whose
 * composited alpha clears the same 0.5 threshold — so "draw it" and "measure
 * where it landed" stay one traversal for meshes exactly as they are for regions.
 */
export function rasteriseMesh(
  page: Plate,
  mesh: Mesh,
  project: (wx: number, wy: number) => [number, number],
  clip: { width: number; height: number },
  emit: EmitPixel,
): void {
  const count = mesh.world.length / 2;
  // Project once per vertex, not once per triangle: an interior vertex of a
  // 40-vertex hull belongs to half a dozen triangles, and projecting it six times
  // invites six answers the moment anything about `project` stops being exact.
  const px = new Float64Array(count);
  const py = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const [x, y] = project(mesh.world[i * 2], mesh.world[i * 2 + 1]);
    px[i] = x;
    py[i] = y;
  }

  for (let t = 0; t + 2 < mesh.triangles.length; t += 3) {
    let i0 = mesh.triangles[t];
    let i1 = mesh.triangles[t + 1];
    const i2 = mesh.triangles[t + 2];
    let area = (px[i1] - px[i0]) * (py[i2] - py[i0]) - (py[i1] - py[i0]) * (px[i2] - px[i0]);
    if (area === 0) continue; // degenerate: a zero-height triangle covers nothing
    if (area < 0) {
      const swap = i0;
      i0 = i1;
      i1 = swap;
      area = -area;
    }

    const x0 = px[i0];
    const y0 = py[i0];
    const x1 = px[i1];
    const y1 = py[i1];
    const x2 = px[i2];
    const y2 = py[i2];
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxX = Math.min(clip.width - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxY = Math.min(clip.height - 1, Math.ceil(Math.max(y0, y1, y2)));
    if (maxX < minX || maxY < minY) continue;

    // Edge `k` is the one opposite vertex `k`, so its edge function IS the
    // unnormalised barycentric weight of that vertex.
    const topLeft0 = isTopLeftEdge(x2 - x1, y2 - y1);
    const topLeft1 = isTopLeftEdge(x0 - x2, y0 - y2);
    const topLeft2 = isTopLeftEdge(x1 - x0, y1 - y0);

    const u0 = mesh.uvs[i0 * 2];
    const v0 = mesh.uvs[i0 * 2 + 1];
    const u1 = mesh.uvs[i1 * 2];
    const v1 = mesh.uvs[i1 * 2 + 1];
    const u2 = mesh.uvs[i2 * 2];
    const v2 = mesh.uvs[i2 * 2 + 1];

    for (let y = minY; y <= maxY; y++) {
      const sy = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const sx = x + 0.5;
        const w0 = (x2 - x1) * (sy - y1) - (y2 - y1) * (sx - x1);
        if (topLeft0 ? w0 < 0 : w0 <= 0) continue;
        const w1 = (x0 - x2) * (sy - y2) - (y0 - y2) * (sx - x2);
        if (topLeft1 ? w1 < 0 : w1 <= 0) continue;
        const w2 = (x1 - x0) * (sy - y0) - (y1 - y0) * (sx - x0);
        if (topLeft2 ? w2 < 0 : w2 <= 0) continue;

        const b0 = w0 / area;
        const b1 = w1 / area;
        const b2 = w2 / area;
        const u = b0 * u0 + b1 * u1 + b2 * u2;
        const v = b0 * v0 + b1 * v1 + b2 * v2;
        const sample = bilinear(page, u * page.width - 0.5, v * page.height - 0.5);
        const alpha = sample[3] * mesh.tint[3];
        if (alpha <= 0.5) continue;
        emit(
          x,
          y,
          Math.round(sample[0] * mesh.tint[0]),
          Math.round(sample[1] * mesh.tint[1]),
          Math.round(sample[2] * mesh.tint[2]),
          Math.round(alpha),
        );
      }
    }
  }
}

/**
 * Rasterise whichever shape this piece is.
 *
 * ⭐ Every caller that used to reach for `rasteriseQuad` goes through here, so
 * "what counts as a covered pixel" has one definition for both shapes — which is
 * what lets `frameGeometry`, the framing box and the drawn frame agree about a
 * mesh without any of them knowing what a triangle is.
 */
export function rasterisePiece(
  page: Plate,
  piece: Piece,
  project: (wx: number, wy: number) => [number, number],
  clip: { width: number; height: number },
  emit: EmitPixel,
): void {
  if (piece.kind === 'mesh') rasteriseMesh(page, piece, project, clip, emit);
  else rasteriseQuad(page, piece, project, clip, emit);
}

/** Blit one piece onto the plate, source-over. */
export function blitPiece(
  dst: Plate,
  page: Plate,
  piece: Piece,
  project: (wx: number, wy: number) => [number, number],
): void {
  rasterisePiece(page, piece, project, dst, (px, py, r, g, b, a) => dst.blend(px, py, [r, g, b, a]));
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
export function pageFor(pages: Map<string, Plate>, piece: Piece): Plate {
  const page = pages.get(piece.page);
  if (!page) {
    throw new Error(
      `slot "${piece.slot}" samples atlas page "${piece.page}", which is not among [${[...pages.keys()].join(', ')}]`,
    );
  }
  return page;
}

/** One frame, composited over `background`, at the viewport's pixel size. */
export function renderFrame(frame: Frame, pages: Map<string, Plate>, viewport: Viewport, background: RGBA): Plate {
  const plate = new Plate(viewport.width, viewport.height);
  fill(plate, background);
  const project = projector(viewport);
  for (const piece of frame.pieces) blitPiece(plate, pageFor(pages, piece), piece, project);
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
  /** 1 where any piece drew, in `viewport.width * viewport.height` row-major order. */
  coverage: Uint8Array;
  footprints: Map<string, Footprint>;
  /**
   * Which owner drew each pixel last, or `-1` — `null` unless `owners` was given.
   *
   * "Last" is the composite's own rule: pieces arrive in draw order, so the owner
   * left in a pixel is the one you would see there. That is deliberately the
   * opposite of `footprints`, which measures each slot on its own pixels
   * *ignoring* what covers it — a footprint answers "where is this part", and
   * this mask answers "whose part is this pixel", and only the second one can be
   * a partition.
   */
  owner: Int32Array | null;
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
export function frameGeometry(
  frame: Frame,
  pages: Map<string, Plate>,
  viewport: Viewport,
  /** Slot name → owner id, when the caller also wants the per-pixel owner mask. */
  owners?: Map<string, number>,
): FrameGeometry {
  const coverage = new Uint8Array(viewport.width * viewport.height);
  const owner = owners === undefined ? null : new Int32Array(viewport.width * viewport.height).fill(-1);
  const footprints = new Map<string, Footprint>();
  const project = projector(viewport);
  for (const piece of frame.pieces) {
    const owned = owners === undefined ? -1 : (owners.get(piece.slot) ?? -1);
    let weight = 0;
    let sx = 0;
    let sy = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    rasterisePiece(pageFor(pages, piece), piece, project, viewport, (px, py, _r, _g, _b, a) => {
      coverage[py * viewport.width + px] = 1;
      if (owner !== null && owned >= 0) owner[py * viewport.width + px] = owned;
      const w = a / 255;
      weight += w;
      sx += (px + 0.5) * w;
      sy += (py + 0.5) * w;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    });
    const previous = footprints.get(piece.slot);
    const here: Footprint =
      weight === 0
        ? EMPTY_FOOTPRINT
        : { pixels: weight, cx: sx / weight, cy: sy / weight, minX, minY, maxX: maxX + 1, maxY: maxY + 1 };
    // A slot shows one attachment at a time, so this only merges when a caller
    // hands us a frame with two pieces on one slot; merging is still the honest
    // answer, and it keeps the map keyed by slot the way the report reads it.
    footprints.set(piece.slot, previous && previous.pixels > 0 ? mergeFootprints(previous, here) : here);
  }
  return { coverage, footprints, owner };
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
