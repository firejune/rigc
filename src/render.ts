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
 * ⭐ **Sampling is bilinear on both paths, and the source is straight alpha —
 * so the interpolation is premultiplied.** One filter rather than two is not a
 * detail: `check` measures a candidate against reference frames, and a mesh
 * triangle sampled nearest against a reference sampled bilinear would put a
 * filter difference into the residual where only a rig difference belongs.
 * Bilinear rather than nearest because the region path was already bilinear and
 * the five committed rungs are rendered with it.
 *
 * Straight alpha is a property of the SOURCE, not a licence to average it
 * channel by channel: a transparent texel's `(0, 0, 0, 0)` is the absence of a
 * colour, and giving it a vote drew a dark rim along every region edge — over
 * the top of whatever was behind the part, and into `check`'s residual on the
 * candidate side. `bilinear` weights each colour by its own alpha and divides
 * back out; see it for what that does and does not move (issue #292).
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

/**
 * The contact sheet beside a frame set, and the one number its layout needs.
 *
 * ⭐ A sheet is **part of the frame set**, not an illustration of it: a long shot
 * commits a couple of stills and folds every sampled frame into one PNG, so for
 * such a set the sheet is the only picture of the 309 frames in between, and
 * `check` compares against its tiles (issue #36). That makes the layout a
 * contract between two programs — `bench/render_reference.ts` writes the grid and
 * `src/check.ts` reads it — so the column count lives here rather than in either.
 *
 * The tile SIZE is deliberately not here. It is a `--tile` choice per run, and a
 * reader can measure it exactly off the sheet's own dimensions given the frame
 * count and the column count (`check`'s `sheetGeometry` does), so recording it
 * would be a second definition of something already written down in pixels.
 */
export const SHEET_COLUMNS = 8;
/** The sheet's file name inside a frame directory. */
export const SHEET_FILE = 'contact.png';
/** One pixel of rule between tiles, and one around the outside. */
export const SHEET_GAP = 1;
/** Default long side of one contact-sheet tile, in pixels. */
export const SHEET_TILE = 128;
/** The rule between tiles, and the frame number drawn in each. */
export const SHEET_RULE: RGBA = [176, 176, 176, 255];
export const SHEET_LABEL: RGBA = [96, 96, 96, 255];

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
  /**
   * What a **texture-only** substitution needs to re-seat this piece on another
   * atlas — see `PieceTexture`.
   *
   * Absent unless `piecesOf` was asked for it, because it is a second copy of the
   * UVs and every posed frame of every set is held in memory at once.
   */
  texture?: PieceTexture;
  /**
   * The page-UV rectangle this piece may sample, and no further — see `UvWindow`.
   *
   * Absent on a piece posed from its own atlas: its UVs cover its own region's
   * rectangle exactly, so there is nothing to fence off. It is set by
   * `substituteTexture`, where the piece's geometry spans an area of the original
   * drawing that the substituting atlas may have trimmed away.
   */
  uvWindow?: UvWindow;
}

/**
 * One piece's texture coordinates in the **original drawing's** own space, plus
 * the name of the region it came from.
 *
 * ## Why original-art space and not the page's
 *
 * Page UVs are useless for substitution: they name texels in *this* atlas, and
 * two atlases pack the same drawing at different places, at different scales, and
 * possibly rotated or trimmed. What survives a repack is the position **within the
 * drawing** — the coordinate an artist would point at — so that is the space a
 * substitution goes through. `(0, 0)` is the untrimmed drawing's top-left corner
 * and `(1, 1)` its bottom-right, which is the convention `spine-core`'s own
 * `MeshAttachment.computeUVs` reads its `regionUVs` in; going through it is what
 * lets `substituteTexture` reuse the runtime's rotation and trim arithmetic
 * instead of holding a second opinion about it.
 */
export interface PieceTexture {
  /** The atlas region this piece samples, by the name its atlas gives it. */
  region: string;
  /** Original-art coordinates, `u, v` per vertex, parallel to `uvs`. */
  artUvs: number[];
}

/** A page-UV rectangle outside which a piece samples nothing. */
export interface UvWindow {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** Options for `piecesOf` and the samplers that call it. */
export interface PoseOptions {
  /** Also record each piece's original-art UVs — see `PieceTexture`. */
  texture?: boolean;
  /**
   * Also record every bone's world transform — see `BoneSnapshot` and
   * `Frame.bones`. Off by default: nothing that draws needs it, and the
   * one instrument that does (`bonedist.ts`) needs it on every frame.
   */
  bones?: boolean;
}

/**
 * One bone's world transform in one posed frame.
 *
 * ⚠️ Read off `spine-core`'s own `BonePose` and derived by its own routines —
 * `getWorldRotationX`, `getWorldScaleX` and friends — rather than recomputed
 * from `a b c d` here. A second opinion about what a bone's world rotation *is*
 * is exactly what an instrument comparing two skeletons must not carry: it
 * would show up as a difference between the two rigs.
 */
export interface BoneSnapshot {
  name: string;
  /** World origin. */
  worldX: number;
  worldY: number;
  /**
   * The world matrix's linear part, `[a b][c d]`. **Complete**: rotation, scale
   * and shear all live in these four numbers, and they are dimensionless — they
   * map a local offset to a world offset, both in world units.
   */
  a: number;
  b: number;
  c: number;
  d: number;
  /** The direction the bone points, in degrees CCW. */
  rotationX: number;
  /** The y axis's own direction — the pair with `rotationX` is where shear shows. */
  rotationY: number;
  /** Magnitudes, always positive. */
  scaleX: number;
  scaleY: number;
}

/** Every bone's world transform in the skeleton's own declaration order. */
export function boneSnapshots(skeleton: Skeleton): BoneSnapshot[] {
  return skeleton.bones.map((bone) => {
    const pose = bone.appliedPose;
    return {
      name: bone.data.name,
      worldX: pose.worldX,
      worldY: pose.worldY,
      a: pose.a,
      b: pose.b,
      c: pose.c,
      d: pose.d,
      rotationX: pose.getWorldRotationX(),
      rotationY: pose.getWorldRotationY(),
      scaleX: pose.getWorldScaleX(),
      scaleY: pose.getWorldScaleY(),
    };
  });
}

export interface Quad extends PieceCommon {
  kind: 'region';
  /** World-space corners, in spine-core's region order: bl, ul, ur, br (verified against computeWorldVertices — the 2026-09-03 run reconstructed this from measurement after the old comment cost it days). */
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
  /**
   * Every bone's world transform at this frame — present only when
   * `PoseOptions.bones` asked for it, so a renderer neither pays for it nor
   * sees a field it would have to ignore.
   *
   * ⭐ It rides on `Frame` rather than being sampled by a loop of its own so
   * that the ladder's stage 3 and the reference frames step a skeleton through
   * **one** recipe. `sampleAnimation`'s stepping order — `state.update`,
   * `state.apply`, `skeleton.update`, `updateWorldTransform(Physics.update)`,
   * and `Physics.reset` on the first frame alone — is a sequence two
   * implementations would drift on, and a per-frame pose comparison that
   * drifted from the renderer would report the drift as a difference between
   * the two rigs.
   */
  bones?: BoneSnapshot[];
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

/**
 * The page names an atlas declares, in the order it declares them.
 *
 * Through `TextureAtlas` rather than by reading the lines: a page name and a
 * region name are both unindented in the atlas format, so anything that told them
 * apart here would be a second opinion about the file's syntax — and the one
 * caller that needs this list (`rigc preview`, embedding each page) has to agree
 * exactly with the player that will ask for them by name.
 */
export function atlasPageNames(atlasText: string): string[] {
  return new TextureAtlas(atlasText).pages.map((page) => page.name);
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
export function sampleAnimation(data: SkeletonData, name: string, fps: number, opts?: PoseOptions): Frame[] {
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
    frames.push({
      index: i,
      time: i * step,
      pieces: piecesOf(skeleton, opts),
      ...(opts?.bones ? { bones: boneSnapshots(skeleton) } : {}),
    });
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
export function sampleSetupPose(data: SkeletonData, opts?: PoseOptions): Frame[] {
  const skeleton = new Skeleton(data);
  skeleton.setupPose();
  skeleton.update(0);
  skeleton.updateWorldTransform(Physics.reset);
  return [
    {
      index: 0,
      time: 0,
      pieces: piecesOf(skeleton, opts),
      ...(opts?.bones ? { bones: boneSnapshots(skeleton) } : {}),
    },
  ];
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
export function piecesOf(skeleton: Skeleton, opts?: PoseOptions): Piece[] {
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
    const texture = opts?.texture !== true ? undefined : artUvsOf(attachment, region);

    if (isMesh) {
      // `worldVerticesLength` is 2 per vertex whether or not the mesh is
      // weighted — the weight runs live in `vertices`, not here — so this is the
      // full output length and the whole mesh is computed in one call. Deform
      // offsets, if the pose carries any, are applied inside it.
      const world = new Array<number>(attachment.worldVerticesLength).fill(0);
      attachment.computeWorldVertices(skeleton, slot, 0, attachment.worldVerticesLength, world, 0, 2);
      pieces.push({
        kind: 'mesh',
        ...common,
        texture,
        world,
        uvs: attachment.sequence.getUVs(index),
        triangles: attachment.triangles,
      });
      continue;
    }

    const world = new Array<number>(8).fill(0);
    attachment.computeWorldVertices(slot, attachment.getOffsets(pose), world, 0, 2);
    pieces.push({ kind: 'region', ...common, texture, world, uvs: attachment.sequence.getUVs(index) });
  }
  return pieces;
}

// ---------------------------------------------------------------------------
// texture-only substitution — see `substituteTexture`
// ---------------------------------------------------------------------------

/**
 * One piece's UVs in the drawing's own space, for the region it resolved to.
 *
 * ## The two shapes, and why only one needs arithmetic
 *
 * A **mesh** already carries them. `MeshAttachment.regionUVs` are read by
 * `spine-core` as coordinates over the *untrimmed* drawing — that is what its own
 * `u -= region.offsetX / textureWidth` and `width = region.originalWidth /
 * textureWidth` mean — so a mesh's authored UVs are atlas-independent by
 * construction, and so is its geometry: `MeshAttachment.computeWorldVertices`
 * reads `vertices` and bones and never touches the region at all. A mesh
 * therefore has nothing an atlas swap could move except its texels.
 *
 * A **region** is the case issue #199 is about. Its quad is derived from the
 * region rectangle — `RegionAttachment.computeUVs` insets it by `offsetX/offsetY`
 * and sizes it by `region.width/height` over `originalWidth/originalHeight` — so
 * swapping the atlas re-seats the quad as well as the texels. Its four corners
 * span the sub-rectangle of the drawing its own atlas kept, in `spine-core`'s
 * corner order (left-bottom, left-top, right-top, right-bottom, read straight off
 * that function's `uvs` assignments).
 *
 * ⚠️ `null` for a region whose own atlas packs it **rotated**: the corner order
 * above is the unrotated one, and `RegionAttachment.computeUVs` assigns a
 * different one at 90°. rigc emits one unrotated part per page and never packs, so
 * no candidate this ships for reaches that branch; a refusal that names itself is
 * better than a fourth opinion about a mapping only three callers have.
 */
function artUvsOf(attachment: MeshAttachment | RegionAttachment, region: TextureAtlasRegion): PieceTexture | undefined {
  if (attachment instanceof MeshAttachment) {
    return { region: regionKey(region), artUvs: Array.from(attachment.regionUVs) };
  }
  if (region.degrees !== 0) return undefined;
  const ow = region.originalWidth;
  const oh = region.originalHeight;
  if (!(ow > 0) || !(oh > 0)) return undefined;
  const s0 = region.offsetX / ow;
  const s1 = (region.offsetX + region.width) / ow;
  // `offsetY` is the trim measured from the drawing's BOTTOM and art space runs
  // downwards, so the region's bottom edge is the larger of the two.
  const tBottom = 1 - region.offsetY / oh;
  const tTop = 1 - (region.offsetY + region.height) / oh;
  return { region: regionKey(region), artUvs: [s0, tBottom, s0, tTop, s1, tTop, s1, tBottom] };
}

/**
 * The name two atlases have to agree on for a substitution to find a region.
 *
 * Trimmed, because `TextureAtlas` names a region after the raw line it was read
 * from — so the same region in a file written with CRLF and one without would be
 * two different strings, and a substitution would report every region unmatched
 * for a reason that is invisible in both files. The index is folded in because a
 * sequence packs several regions under one name and `findRegion` returns only the
 * first of them.
 */
function regionKey(region: TextureAtlasRegion): string {
  return `${region.name.trim()}#${region.index}`;
}

/**
 * Page names of a substituting atlas carry this prefix, so an own page and a
 * substituted page that happen to share a filename cannot be taken for each other.
 */
export const SUBSTITUTE_PAGE = 'texture-from:';

/** An atlas whose texels can stand in for another's — see `substituteTexture`. */
export interface TextureSubstitution {
  /** Prefixed page name → the page, ready to merge into a render's page map. */
  pages: Map<string, Plate>;
  /** The atlas's regions, by the key both sides agree on — see `regionKey`. */
  regions: Map<string, TextureAtlasRegion>;
  /** Every `scale:` the atlas text declares, in the order the pages declare them. */
  scales: number[];
}

/** Load an atlas and its pages as a substitution source. */
export function textureSubstitutionFromText(atlasText: string, atlasDir: string): TextureSubstitution {
  const atlas = new TextureAtlas(atlasText);
  const pages = new Map<string, Plate>();
  for (const page of atlas.pages) {
    if (page.name.startsWith(SUBSTITUTE_PAGE)) {
      throw new Error(`atlas page "${page.name}" starts with the reserved prefix ${JSON.stringify(SUBSTITUTE_PAGE)}`);
    }
    pages.set(SUBSTITUTE_PAGE + page.name, readPlate(join(atlasDir, page.name)));
  }
  const regions = new Map<string, TextureAtlasRegion>();
  for (const region of atlas.regions) regions.set(regionKey(region), region);
  return { pages, regions, scales: atlasScales(atlasText) };
}

/**
 * The `scale:` values an atlas text declares, read off the text.
 *
 * ⚠️ Off the text, and reluctantly: `TextureAtlas` drops the field (its page
 * reader silently ignores every key it has no handler for), because `scale:` is
 * an instruction to whoever *imports* the pack — "the artwork was this much
 * bigger than these texels" — and a runtime has nothing to do with it. It is
 * nevertheless the one line that says a pack is coarser than the drawing it came
 * from, which is exactly the fact a reader of an MAE needs (issue #171), so it is
 * read here rather than left unreported.
 *
 * Narrow on purpose: an indented `scale:` line inside a page block, and nothing
 * else. It is not a second parser for the format and must not grow into one.
 */
export function atlasScales(atlasText: string): number[] {
  const out: number[] = [];
  for (const line of atlasText.split(/\r\n|\r|\n/)) {
    const m = /^[ \t]+scale:[ \t]*([0-9.eE+-]+)[ \t]*$/.exec(line);
    if (!m) continue;
    const value = Number(m[1]);
    if (Number.isFinite(value)) out.push(value);
  }
  return out;
}

/**
 * The page rectangle a region occupies, as UVs — the fence `substituteTexture`
 * puts around a substituted piece.
 *
 * ⚠️ Derived from `region.x/y/width/height` and its rotation rather than read off
 * `region.u2/v2`, and that is not fastidiousness: `TextureAtlas` transposes a
 * rotated region's rectangle when computing `u2/v2` **only at `degrees === 90`**,
 * so at 180 and 270 those two numbers describe a rectangle the page does not have.
 * (The same gap is why `RegionAttachment.computeUVs` draws a 270-packed region
 * wrong, which is what `--atlas` was measuring on rung 7 — issue #199.)
 * `region.u/v` are always `x/pageWidth, y/pageHeight` and are used as they are; the
 * size is the region's own, transposed for a quarter turn, which is what the atlas
 * format means by `bounds` on a rotated region.
 */
function windowOf(region: TextureAtlasRegion): UvWindow {
  const turned = region.degrees === 90 || region.degrees === 270;
  const rectWidth = turned ? region.height : region.width;
  const rectHeight = turned ? region.width : region.height;
  const page = region.page;
  return {
    u0: region.x / page.width,
    v0: region.y / page.height,
    u1: (region.x + rectWidth) / page.width,
    v1: (region.y + rectHeight) / page.height,
  };
}

/**
 * The same posed frame, drawn from another atlas's **texels only**.
 *
 * ## 🔒 What is and is not substituted, and why that is the whole point
 *
 * `world` is copied across untouched — every vertex, both shapes — so the
 * substituted frame draws the candidate's own geometry and nothing else. Only
 * `page` and `uvs` change, and they change through the drawing's own coordinates
 * (`PieceTexture`), so the same point of the artwork lands at the same world
 * position on both sides. What is left between the two renders is a difference of
 * **texels**: the same shapes, in the same places, filtered from a different
 * source.
 *
 * That is what `rigc check --atlas <the frames' own atlas>` was being used for and
 * is not: pointing `--atlas` at another atlas re-loads the skeleton against it, and
 * a region attachment's quad is derived from the region rectangle, so a `rotate:`
 * or a trim in the substituting pack moves the geometry too. Measured on rung 7,
 * whose pack is `rotate: 270` and trimmed: that swap sends the reported MAE **up**
 * on every set, which a texture floor cannot do — a coarser texture can only
 * explain error, never add it (issue #199).
 *
 * ## The window
 *
 * A trimmed pack keeps only the drawing's opaque sub-rectangle, while the
 * candidate's own quad spans the whole drawing. Art-space coordinates outside what
 * the pack kept map to page texels **belonging to whatever was packed next door**,
 * so the substituted piece is fenced to its own rectangle (`UvWindow`) and draws
 * nothing outside it. That is the faithful answer rather than a convenience: a
 * packer trims only fully transparent border, so outside the rectangle the drawing
 * *is* empty.
 */
export function substituteTexture(
  frame: Frame,
  into: TextureSubstitution,
): { frame: Frame; unmatched: string[] } {
  const unmatched: string[] = [];
  const pieces: Piece[] = [];
  for (const piece of frame.pieces) {
    const texture = piece.texture;
    const region = texture ? (into.regions.get(texture.region) ?? null) : null;
    if (!texture || !region) {
      unmatched.push(texture ? texture.region : piece.slot);
      pieces.push(piece);
      continue;
    }
    const uvs = new Array<number>(texture.artUvs.length).fill(0);
    // `spine-core`'s own mapping from the drawing's coordinates into a page's,
    // which is where `rotate:` (all four of them) and the trim offsets are
    // handled. Calling it rather than repeating it is what keeps this from being
    // a second opinion about the atlas format.
    MeshAttachment.computeUVs(region, texture.artUvs, uvs);
    pieces.push({ ...piece, page: SUBSTITUTE_PAGE + region.page.name, uvs, uvWindow: windowOf(region) });
  }
  return { frame: { ...frame, pieces }, unmatched };
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
      if (outsideWindow(quad.uvWindow, u, v)) continue;
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
 * Slack on a `UvWindow`'s edges, in page UVs.
 *
 * The window's bounds *are* the region rectangle's own UVs, and a piece's
 * interpolated UV reaches them exactly at its edge — so the test has to admit
 * equality, and a bare `<` would drop a boundary pixel whenever the arithmetic
 * lands a bit under. A billionth of a page is far below a texel and far above the
 * error of two multiplies.
 */
const WINDOW_SLACK = 1e-9;

/**
 * Is this texel outside the rectangle its piece is allowed to sample?
 *
 * `undefined` is the ordinary case — a piece posed from its own atlas has no
 * window — and answers `false` without arithmetic, which keeps this off the cost
 * of every reference frame ever rendered.
 */
function outsideWindow(window: UvWindow | undefined, u: number, v: number): boolean {
  if (window === undefined) return false;
  return (
    u < window.u0 - WINDOW_SLACK ||
    u > window.u1 + WINDOW_SLACK ||
    v < window.v0 - WINDOW_SLACK ||
    v > window.v1 + WINDOW_SLACK
  );
}

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
        if (outsideWindow(mesh.uvWindow, u, v)) continue;
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

/** The four texels one bilinear tap reads, and the fractions between them. */
interface Taps {
  c00: RGBA;
  c10: RGBA;
  c01: RGBA;
  c11: RGBA;
  fx: number;
  fy: number;
}

/**
 * The four texels around `(x, y)`, CLAMPED at the page edge.
 *
 * ⚠️ The clamp is load-bearing beyond this function: `src/atlas.ts` sizes the
 * gutter between packed regions against the fact that one tap reaches exactly one
 * texel, and `gallery/portrait`'s lid runs its art flush to its own window
 * because a clamped tap has no transparent neighbour to reach into. Widening the
 * tap is not a local change.
 */
function taps(page: Plate, x: number, y: number): Taps {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const at = (ix: number, iy: number): RGBA => {
    const cx = Math.max(0, Math.min(page.width - 1, ix));
    const cy = Math.max(0, Math.min(page.height - 1, iy));
    return page.get(cx, cy);
  };
  return { c00: at(x0, y0), c10: at(x0 + 1, y0), c01: at(x0, y0 + 1), c11: at(x0 + 1, y0 + 1), fx: x - x0, fy: y - y0 };
}

/** One channel of a bilinear tap: lerp along x on both rows, then between them. */
function lerpTap(v00: number, v10: number, v01: number, v11: number, fx: number, fy: number): number {
  const top = v00 + (v10 - v00) * fx;
  const bottom = v01 + (v11 - v01) * fx;
  return top + (bottom - top) * fy;
}

/**
 * Sample a straight-alpha page bilinearly — interpolating in PREMULTIPLIED space.
 *
 * ⭐ **Why the premultiply.** The source is straight alpha, so a transparent
 * texel beside the art is `(0, 0, 0, 0)`: its colour is not a colour, it is the
 * absence of one. Averaging R, G and B against it pulls the sample toward black
 * while alpha only drops part of the way, and the difference between those two
 * rates IS a dark rim, one pixel wide, drawn over whatever is behind the part.
 * Weighting each colour by its own alpha and dividing the sum back out gives the
 * transparent texel no vote in the colour, which is the whole of the fix: two
 * parts of one colour, overlapping, come out that colour. Measured before the
 * fix at −60/255 between two parts sharing one flat field, and −31/255 down
 * `gallery/portrait`'s forehead — issue #292.
 *
 * ⭐ **Why alpha is computed the old way, and why equal alpha short-circuits.**
 * `rasteriseQuad` and `rasteriseMesh` gate coverage on `alpha > 0.5`, so the
 * alpha arithmetic decides WHICH pixels are drawn — and through `frameGeometry`,
 * the framing box every reference frame was rendered inside. `lerpTap` on the
 * alpha channel is therefore the original expression, unchanged, not an
 * algebraically equal rearrangement: equal-but-rearranged is a last-bit
 * difference, and a last bit either side of 0.5 is a pixel.
 *
 * For the same reason the equal-alpha case returns early. When all four taps
 * carry one alpha, premultiplying by it and dividing it back out is the identity
 * — so the straight path is not an approximation there, it is the same number,
 * and taking it reproduces the five committed rungs BIT for bit rather than
 * merely closely. What moves is exactly the mixed-alpha tap: the edges, where the
 * rim was.
 */
export function bilinear(page: Plate, x: number, y: number): [number, number, number, number] {
  const { c00, c10, c01, c11, fx, fy } = taps(page, x, y);
  const a = lerpTap(c00[3], c10[3], c01[3], c11[3], fx, fy);
  if (c00[3] === c10[3] && c00[3] === c01[3] && c00[3] === c11[3]) {
    return [
      lerpTap(c00[0], c10[0], c01[0], c11[0], fx, fy),
      lerpTap(c00[1], c10[1], c01[1], c11[1], fx, fy),
      lerpTap(c00[2], c10[2], c01[2], c11[2], fx, fy),
      a,
    ];
  }
  // Every tap is transparent in some proportion that sums to nothing: there is no
  // colour to recover and no pixel to draw (both callers gate on alpha anyway).
  if (a <= 0) return [0, 0, 0, 0];
  const out: [number, number, number, number] = [0, 0, 0, a];
  for (let c = 0; c < 3; c++) {
    const pm = lerpTap(c00[c] * c00[3], c10[c] * c10[3], c01[c] * c01[3], c11[c] * c11[3], fx, fy);
    // Bounded by 255 in exact arithmetic — the weighted mean of the taps' colours
    // cannot exceed their maximum — so the clamp absorbs float error only. It is
    // here rather than trusted because `Plate`'s store is a `Uint8Array`, which
    // WRAPS: 256 would land as a black pixel in the brightest part of the art.
    out[c] = Math.min(255, pm / a);
  }
  return out;
}

/**
 * The same tap, each channel interpolated independently — the arithmetic
 * `bilinear` used until #292, kept as the CONTROL that fix is measured against.
 *
 * 🚫 **Nothing in `src/` calls this, and nothing in `src/` should.** It had one
 * production caller until #306: `src/pose.ts`'s `errBilinear`, on the argument
 * that `materialPlate`'s fourth channel is a material mask rather than opacity.
 * That argument was wrong in the direction that mattered — the mask is exactly
 * the weight the colour wanted, because a texel with no material carries the
 * background's colour and not the part's — so `errBilinear` now takes
 * `bilinear` too, and the only importer left is `selftest.ts`.
 *
 * ⭐ It lives here rather than in the suite so the control shares `taps` — the
 * edge clamp above — with the sampler it is a control for. A hand copy in the
 * test file would drift from it silently, and then `SM01` would be comparing the
 * fix against something that is not what the renderer used to do.
 * `SM07_NO_PRODUCTION_MODULE_READS_THE_STRAIGHT_TAP` is what keeps the first
 * paragraph true rather than merely written down.
 */
export function bilinearChannels(page: Plate, x: number, y: number): [number, number, number, number] {
  const { c00, c10, c01, c11, fx, fy } = taps(page, x, y);
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) out[c] = lerpTap(c00[c], c10[c], c01[c], c11[c], fx, fy);
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

/**
 * Every frame of one animation as one labelled grid, row major.
 *
 * Not decoration: rung 3's subject is *spacing* — how far a thing travels
 * between two consecutive frames — and that is a comparison across frames. A
 * reader flipping through 65 separate files is comparing against memory.
 *
 * ⭐ It lives here rather than beside either caller because the layout is a
 * CONTRACT: `bench/render_reference.ts` writes the grid, `rigc render` writes the
 * same grid for a user's own build, and `src/check.ts` reads a sheet's tiles back
 * out of it (issue #36). Three programs reading one geometry is one definition or
 * it is a bug waiting for the day two of them are edited apart.
 */
export function contactSheet(frames: Frame[], pages: Map<string, Plate>, viewport: Viewport, tile: number): Plate {
  const tileScale = tile / Math.max(viewport.width, viewport.height);
  const tileW = Math.max(1, Math.round(viewport.width * tileScale));
  const tileH = Math.max(1, Math.round(viewport.height * tileScale));
  const columns = Math.min(SHEET_COLUMNS, frames.length);
  const rows = Math.ceil(frames.length / columns);
  const sheet = new Plate(columns * (tileW + SHEET_GAP) + SHEET_GAP, rows * (tileH + SHEET_GAP) + SHEET_GAP);
  fill(sheet, SHEET_RULE);
  const base = projector(viewport);
  frames.forEach((frame, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const ox = col * (tileW + SHEET_GAP) + SHEET_GAP;
    const oy = row * (tileH + SHEET_GAP) + SHEET_GAP;
    const plate = new Plate(tileW, tileH);
    fill(plate, BACKGROUND);
    const project = (wx: number, wy: number): [number, number] => {
      const [px, py] = base(wx, wy);
      return [px * tileScale, py * tileScale];
    };
    for (const piece of frame.pieces) blitPiece(plate, pageFor(pages, piece), piece, project);
    plate.text(String(i), 2, 2, 1, SHEET_LABEL);
    for (let y = 0; y < tileH; y++) for (let x = 0; x < tileW; x++) sheet.set(ox + x, oy + y, plate.get(x, y));
  });
  return sheet;
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
