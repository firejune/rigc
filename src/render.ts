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
 * A **clipping attachment** draws no pixel of its own and removes the pixels of
 * every slot from the one carrying it through its `end` slot. `piecesOf` runs
 * spine-core's own `SkeletonClipping` beside the draw-order walk, in the call
 * sequence spine-webgl's `SkeletonRenderer.draw` runs, so a slot inside a clip
 * reaches the rasteriser as the geometry the runtime draws rather than as the
 * attachment's whole (issue #844).
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
  ClippingAttachment,
  MeshAttachment,
  Physics,
  RegionAttachment,
  Skeleton,
  SkeletonClipping,
  SkeletonJson,
  TextureAtlas,
  TextureAtlasRegion,
  SkeletonData,
  type Slot,
} from '@esotericsoftware/spine-core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Plate, readPlate, type RGBA } from '../tools/plate.ts';
import { pageFootprint } from './atlas.ts';

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
  /**
   * The skin these frames were posed under, when one was asked for (issue #571).
   *
   * ⭐ **Absent is not `"default"`.** A render with no skin sets none — every
   * slot resolves through `SkeletonData.defaultSkin` alone — and a frame set
   * written before this field existed says nothing either, so the two are the
   * same fact on disk and the field is omitted for both. That is what keeps
   * every frame set in this repository byte-identical across this change, and it
   * is why `check` can refuse a mismatch it can SEE (`skin` present and
   * different, or present where the run asked for none) and can only NOTE the
   * one it cannot (`skin` absent while the run asked for one).
   */
  skin?: string;
  /**
   * The slots these frames draw, when `render --slot` narrowed them to a subset
   * (issue #835) — in the skeleton's draw order, whatever order they were named in.
   *
   * ⭐ Absent on a render of every slot, for the reason `skin` is: that is what
   * every frame set written before this field existed says too, so the whole-rig
   * render stays byte-identical and the key's presence is the claim. A frame set
   * carrying this or `hidden` is a picture of PART of the rig, and `check` refuses
   * it as a reference by name rather than scoring a whole candidate against it.
   */
  slots?: string[];
  /** The slots these frames leave out, when `render --hide` named them — see `slots`. */
  hidden?: string[];
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
  /**
   * The slot's **dark** colour, 0..1 — the other half of Spine's two-colour
   * tint, and absent on every slot that does not carry one.
   *
   * ⚠️ Absent rather than black, and that is the whole of why it is optional.
   * `(0, 0, 0)` is a real dark colour and the identity of the blend, so the two
   * spellings paint the same pixels — but the runtime distinguishes them
   * (`SlotPose.darkColor` is `null` for a slot with no `dark`, and `Slot`'s
   * constructor never allocates one), and a piece that carried a black default
   * would take the two-colour path for every slot in every frame this
   * repository renders. `undefined` is what keeps the arithmetic below off the
   * ordinary case (issue #690).
   *
   * Three channels, not four: the format writes `dark` as `rrggbb` and
   * `RGBA2Timeline` stores three dark channels. The alpha a shader reads on the
   * dark colour is not a colour at all — see `tintChannel`.
   */
  dark?: [number, number, number];
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
  /**
   * Also record every slot's attachment geometry, whole — see `AttachmentPose`
   * and `Frame.attachments` (issue #864). Off by default for `bones`' reason:
   * nothing that draws reads it, and `render --geometry` is the one caller.
   *
   * ⭐ **It is not filtered by `slots`/`hidden` and not cut by a clip.** Those
   * are statements about which pixels are drawn; the geometry is a statement
   * about where the pose put each attachment, and it is the same pose whatever
   * a picture of it leaves out.
   */
  geometry?: boolean;
  /**
   * Pose under this skin, by the name the skeleton declares for it.
   *
   * ⭐ Absent means **no skin is set at all**, which is spine-core's own initial
   * state (`Skeleton.skin` is null) and resolves every slot through
   * `SkeletonData.defaultSkin` alone. That is not the same claim as "the default
   * skin was chosen": it is the absence of a choice, and the two are spelled
   * differently everywhere this travels — the frames sidecar omits the field
   * rather than writing `"default"` into it (issue #571).
   *
   * ⚠️ Read by the SAMPLERS, never by `piecesOf`, which is handed a skeleton
   * somebody else already posed; handing it one is refused by name rather than
   * ignored, because a skin quietly dropped here is exactly the silence this
   * whole flag exists to remove.
   */
  skin?: string;
  /**
   * Draw only these slots, by name (issue #835). `hidden` is the same statement
   * the other way round, and the two together are refused.
   *
   * ⭐ **It is a filter on what is DRAWN, never on what is framed.**
   * `framingViewport` takes both off before it samples, so a frame with `head`
   * hidden sits on exactly the pixel grid of the frame with it and the two
   * overlay — which is the whole use of the picture: *which part is this pixel*
   * is answered by the difference between two frames of one grid, and a subset
   * re-framed to its own extent would have no second frame to differ from.
   *
   * ⚠️ Applied in `piecesOf`, where the pieces are collected, and resolved there
   * against the posed skeleton's own slots and skin — see `slotSubsetOf` — so a
   * name that draws nothing is refused by name rather than quietly matching no
   * piece.
   */
  slots?: string[];
  /** Draw every slot but these — see `slots`. */
  hidden?: string[];
  /**
   * Pose every attachment whole, with no clipping attachment applied — set by
   * `framingViewport` and by nothing that draws.
   *
   * ⭐ **The framing box counts what a clip removes**, for the reason it counts
   * what `--slot`/`--hide` leave out: the box is a property of the shot, and a
   * clip is a statement about which pixels of it are drawn. Framed on the
   * clipped geometry, a rig's viewport would move the moment a clip is added or
   * keyed, and every frame set already on disk for it — `frames.json`'s world
   * box, the grid `check` compares on — would stop describing the frames a
   * second render writes.
   */
  unclipped?: boolean;
}

/**
 * Why a slot subset cannot be drawn — a `--slot`/`--hide` naming no slot, a slot
 * whose art only another skin carries, or both flags at once (issue #835).
 *
 * A class of its own so `cli.ts` can turn it into a usage refusal (exit 2,
 * nothing written) without reading a message to decide what kind it is.
 */
export class SlotSubsetError extends Error {}

/** The flag spelling each half of a subset is refused under — the UI's, since that is who reads it. */
const SUBSET_FLAG = { slots: '--slot', hidden: '--hide' } as const;

/**
 * A slot subset resolved against a skeleton: which half was asked for, and the
 * names in the skeleton's **draw order** rather than the order they were typed.
 *
 * Draw order because the names are a set and the sidecar records them: `--hide
 * b,a` and `--hide a,b` are one picture, and a sidecar whose bytes depended on
 * the spelling would make two identical frame sets differ.
 */
export interface SlotSubset {
  mode: 'slots' | 'hidden';
  names: string[];
}

/**
 * Resolve `slots` / `hidden` against `data` as posed under `skin`, or refuse by name.
 *
 * `undefined` when neither is set — the whole rig, which is the ordinary case and
 * costs nothing. Refused, each naming what would have worked:
 *
 * - **both at once** — one statement two ways, as `--rig` with `--cut` is;
 * - **a name the skeleton does not declare** — with every slot it does declare,
 *   in draw order, and how many;
 * - **a slot whose attachments live only under skins this pose does not
 *   resolve through.** Every slot is declared at the skeleton's top level, so
 *   "a slot only a named skin declares" is not a shape the format has — what a
 *   skin declares is the slot's ART. A pose resolves an attachment through the
 *   skin it was set to and then the default skin (`Skeleton.getAttachment`), so
 *   a slot none of whose attachments is in either of those draws nothing in
 *   every frame, and `--slot` on it would be a blank picture that looks like an
 *   answer. The refusal names the skin(s) that do carry it.
 *
 * ⚠️ A declared slot with no attachment in ANY skin is accepted: it draws
 * nothing under every skin, so there is no skin to name and no picture of it
 * that a different invocation would produce.
 */
export function slotSubsetOf(
  data: SkeletonData,
  opts: Pick<PoseOptions, 'slots' | 'hidden'> | undefined,
  skin: string | undefined,
): SlotSubset | undefined {
  if (opts?.slots !== undefined && opts.hidden !== undefined) {
    throw new SlotSubsetError(
      '--slot and --hide are one statement two ways; name the slots to draw or the slots to hide, not both',
    );
  }
  const mode = opts?.slots !== undefined ? 'slots' : opts?.hidden !== undefined ? 'hidden' : undefined;
  if (mode === undefined) return undefined;
  const asked = (mode === 'slots' ? opts?.slots : opts?.hidden) ?? [];
  const flag = SUBSET_FLAG[mode];
  const declared = data.slots.map((slot) => slot.name);

  const unknown = asked.filter((name) => data.findSlot(name) === null);
  if (unknown.length > 0 || asked.length === 0) {
    const named =
      unknown.length === 0
        ? 'was given no slot name'
        : `${unknown.map((name) => JSON.stringify(name)).join(', ')} ${unknown.length === 1 ? 'names' : 'name'} no slot`;
    throw new SlotSubsetError(
      `${flag} ${named}; this skeleton declares, in draw order: ${declared.join(', ') || 'none'} (${declared.length})`,
    );
  }

  const resolving = new Set([skin ?? null, data.defaultSkin?.name ?? null]);
  const underThisPose =
    skin === undefined ? 'under no skin (the default skin alone)' : `under skin ${JSON.stringify(skin)}`;
  for (const name of asked) {
    const index = data.findSlot(name)?.index ?? -1;
    const carriers = data.skins.filter((s) => s.getAttachments().some((entry) => entry.slotIndex === index));
    if (carriers.length === 0 || carriers.some((s) => resolving.has(s.name))) continue;
    const skins = carriers.map((s) => JSON.stringify(s.name));
    throw new SlotSubsetError(
      `${flag} ${JSON.stringify(name)} draws nothing ${underThisPose}: its attachments are declared only under ` +
        `${skins.length === 1 ? 'skin' : 'skins'} ${skins.join(', ')} — pass --skin ${
          skins.length === 1 ? skins[0] : 'with one of them'
        }`,
    );
  }
  const chosen = new Set(asked);
  return { mode, names: declared.filter((name) => chosen.has(name)) };
}

/**
 * A fresh skeleton with `skin` applied, or refused by name.
 *
 * ## Why the skin goes on before `setupPose`, and why nothing else is needed
 *
 * `Skeleton.setSkin` (spine-core 4.3.13 `Skeleton.js:279-311`) attaches the new
 * skin's art into each slot's pose and calls `updateCache`, which is what turns
 * on a `skinRequired` bone or constraint the skin names. Every sampler below
 * then calls `skeleton.setupPose()`, and `setupPose` → `setupPoseSlots`
 * (`Skeleton.js:231-249`) re-resolves each slot's setup attachment through
 * `Slot.setupPose` → `Skeleton.getAttachment`, which checks `this.skin` first
 * and `SkeletonData.defaultSkin` second (`Skeleton.js:335-346`). So the setup
 * pose of a skinned skeleton is already the skin's, and the extra
 * `setSlotsToSetupPose()` a 4.1-era recipe prescribes has no 4.3 spelling to
 * call: the method is named `setupPoseSlots` here, and `setupPose()` runs it.
 *
 * `setSkin(string)` exists too, but its by-name half throws
 * `Skin not found: <name>` (`Skeleton.js:286-291`) — a message that names the
 * miss and not the alternatives. Everything in a rig resolves by name and a miss
 * is refused **by name, with the names that would have worked**, so the lookup
 * happens here and the runtime is handed a `Skin` it cannot fail on.
 */
function skeletonUnderSkin(data: SkeletonData, skin: string | undefined): Skeleton {
  const skeleton = new Skeleton(data);
  if (skin === undefined) return skeleton;
  const found = data.findSkin(skin);
  if (!found) {
    throw new Error(
      `no skin ${JSON.stringify(skin)} in this skeleton; it declares [${
        data.skins.map((s) => s.name).join(', ') || 'none'
      }]`,
    );
  }
  skeleton.setSkin(found);
  return skeleton;
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
  /**
   * Every slot's attachment as the pose left it, in draw order — present only
   * when `PoseOptions.geometry` asked for it (issue #864).
   *
   * ⚠️ Not `pieces` again. A piece is what gets DRAWN: `--slot`/`--hide` remove
   * pieces and a clip replaces one with the clipper's own triangle list, whose
   * vertices are not the attachment's and are not numbered like them. A
   * consumer comparing a triangle's edges across frames needs vertex `i` to be
   * the same vertex in every frame, so these are the attachment's own vertices,
   * whole, for every slot that shows a region or a mesh.
   *
   * Read off the same skeleton at the same step as `pieces` and `bones`, which
   * is what puts it on render's frame grid by construction rather than by a
   * second derivation of it.
   */
  attachments?: AttachmentPose[];
}

/**
 * One slot's region or mesh attachment in one posed frame (issue #864).
 *
 * `vertices` come from the runtime's own `computeWorldVertices` over the whole
 * attachment — the call `pieceOf` makes, through the one helper both share —
 * so skinning and deform live in spine-core and nowhere here.
 */
export interface AttachmentPose {
  slot: string;
  /** The attachment's own name, which is what a deform or attachment timeline keys. */
  attachment: string;
  /**
   * World positions, `x, y` per vertex, **y up**. A region's four corners are in
   * spine-core's order — bottom-left, top-left, top-right, bottom-right — and a
   * mesh's vertices in the attachment's own order, so index `i` names the same
   * vertex in every frame.
   */
  vertices: number[];
  /** Slot colour x attachment colour, straight alpha, 0..1 — the piece's `tint`, by the same arithmetic. */
  color: [number, number, number, number];
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

// ---------------------------------------------------------------------------
// the posing seam (issue #965, step 3a of #380)
// ---------------------------------------------------------------------------
//
// ⭐ Everything this file reads off a posed skeleton goes through one
// interface, `Poser`, and the samplers below are written against it alone. The
// implementation behind it today is spine-core's (`spinePoser`, further down);
// the core-backed poser of issue #968 is a SECOND implementation of the same
// interface, handed to the same samplers, rather than a rewrite of them. What
// the interface fixes is exactly what a consumer of a posed frame reads:
//
// - the setup pose, under a skin or under none;
// - an animation's frames at `i/fps` for `i = 0..count`, one continuous
//   trajectory stepped once per frame (the stepping recipe is the
//   implementation's; the schedule — which `i`, what `count`, what time a
//   frame is filed under — is the sampler's, and stays here);
// - per posed frame: the pieces in draw order (world vertices, page UVs,
//   triangles, tint, dark, page, clip output), the bone snapshots, and every
//   slot's whole attachment geometry;
// - the rest table, and the names a geometry file and a slot subset read.
//
// The framing samples are not a fourth entry: `framingViewport` is the same
// animation entry at `FRAMING_FPS` with the clip off.
//
// 🔒 What stays spine-core's and outside the seam, deliberately: the atlas
// (`posableFromText`'s pages, `substituteTexture`'s region lookup — step 3c of
// #380) and `nonFiniteOfPosed`, which `validate.ts` calls on a spine-core
// skeleton it stepped itself (A10), so the round trip keeps its spine-core
// entry whatever poses the renders.

/** What a sampler hands a posed frame's draw walk — `PoseOptions` with the subset already resolved. */
export interface DrawOptions {
  /** The slots drawn, resolved against the posed skeleton (`slotSubsetOf`); `undefined` draws every slot. */
  subset: SlotSubset | undefined;
  /** Every attachment whole, no clip applied — the framing box's reading. */
  unclipped: boolean;
  /** Also record each piece's original-art UVs — see `PieceTexture`. */
  texture: boolean;
}

/**
 * One posed moment, readable only while the `Poser` call that produced it is
 * running: an implementation may step one skeleton in place, so a reader takes
 * what it needs before the next frame is posed.
 */
export interface Posed {
  /** The drawables in draw order — see `piecesOf` for the walk and the clip. */
  pieces(draw: DrawOptions): Piece[];
  /** Every bone's world transform, in the skeleton's declaration order. */
  bones(): BoneSnapshot[];
  /** Every slot's region or mesh attachment, whole, in the posed draw order. */
  attachments(): AttachmentPose[];
}

/**
 * The posing seam: one skeleton, posed on demand.
 *
 * Named for what it does rather than for the runtime behind it, because the
 * point of the name is that there are two: `spinePoser` today, the core's at
 * #968. Every sampler, the framing, the geometry export and the non-finite
 * sentence take one (or a `SkeletonData`, which they wrap in `spinePoser`).
 */
export interface Poser {
  /** Every animation, in declaration order, with its duration in seconds. */
  readonly animations: ReadonlyArray<{ name: string; duration: number }>;
  /** Every bone in declaration order, and its parent's name. */
  readonly bones: ReadonlyArray<{ name: string; parent: string | null }>;
  /** Every slot in declaration order, and the bone it hangs from. */
  readonly slots: ReadonlyArray<{ name: string; bone: string }>;
  /** `slotSubsetOf` against this skeleton posed under `skin` — refused by `SlotSubsetError`. */
  subset(opts: Pick<PoseOptions, 'slots' | 'hidden'> | undefined, skin: string | undefined): SlotSubset | undefined;
  /** The setup pose under `skin` (absent: no skin set at all). */
  setup(skin: string | undefined): Posed;
  /**
   * Animation `name` under `skin`, not looping: `visit(i, posed)` for every
   * `i` from 0 to `count`, the pose at `i/fps`. The caller has checked `name`.
   */
  animation(name: string, skin: string | undefined, fps: number, count: number, visit: (index: number, posed: Posed) => void): void;
  /** The rest table for the (slot, attachment) pairs `shown` holds — see `AttachmentRest`. */
  rest(skin: string | undefined, shown: readonly AttachmentPose[][]): AttachmentRest[];
}

/** What every sampler takes: a poser, or spine-core's parsed skeleton, which is posed through `spinePoser`. */
export type PoseSource = Poser | SkeletonData;

function poserOf(source: PoseSource): Poser {
  return source instanceof SkeletonData ? spinePoser(source) : source;
}

/** A sampler's `PoseOptions` as a draw walk reads them, the subset resolved once, on the first frame posed. */
function drawResolver(poser: Poser, opts: PoseOptions | undefined): () => DrawOptions {
  let draw: DrawOptions | undefined;
  return () => {
    draw ??= { subset: poser.subset(opts, opts?.skin), unclipped: opts?.unclipped === true, texture: opts?.texture === true };
    return draw;
  };
}

/** One frame off one posed moment, with what `opts` asked to record beside the pieces. */
function frameOf(index: number, time: number, posed: Posed, draw: DrawOptions, opts: PoseOptions | undefined): Frame {
  return {
    index,
    time,
    pieces: posed.pieces(draw),
    ...(opts?.bones ? { bones: posed.bones() } : {}),
    ...(opts?.geometry ? { attachments: posed.attachments() } : {}),
  };
}

/**
 * Sample one animation at a fixed rate and collect the posed pieces per frame.
 *
 * Frame `i` is the pose at `i/fps`, for `i = 0..round(duration·fps)` — the
 * schedule is this function's; how a pose reaches `i/fps` is the poser's.
 */
export function sampleAnimation(source: PoseSource, name: string, fps: number, opts?: PoseOptions): Frame[] {
  const poser = poserOf(source);
  const animation = poser.animations.find((a) => a.name === name);
  if (!animation) {
    throw new Error(
      `no animation "${name}" in this skeleton; it has [${poser.animations.map((a) => a.name).join(', ') || 'none'}]`,
    );
  }
  const step = 1 / fps;
  const count = Math.round(animation.duration * fps);
  const draw = drawResolver(poser, opts);
  const frames: Frame[] = [];
  poser.animation(name, opts?.skin, fps, count, (i, posed) => frames.push(frameOf(i, i * step, posed, draw(), opts)));
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
export function sampleSetupPose(source: PoseSource, opts?: PoseOptions): Frame[] {
  const poser = poserOf(source);
  const posed = poser.setup(opts?.skin);
  return [frameOf(0, 0, posed, drawResolver(poser, opts)(), opts)];
}

// ---------------------------------------------------------------------------
// the spine-core implementation of the seam
// ---------------------------------------------------------------------------

/**
 * `Poser` over spine-core: the runtime's own `Skeleton`, `AnimationState` and
 * `SkeletonClipping`, stepped the way a runtime steps them.
 *
 * The pose is driven through `AnimationState` rather than `Animation.apply`
 * because that is the path a runtime actually takes, and 4.3's
 * `Animation.apply` takes a `MixFrom` that only the state machine has any
 * business choosing. Frame 0 applies, updates by 0 and resets physics; every
 * later frame is one `state.update(1/fps)`, apply, `skeleton.update(1/fps)` and
 * `Physics.update` — one continuous trajectory, so the track time of frame `i`
 * is the sum of `i` steps.
 */
export function spinePoser(data: SkeletonData): Poser {
  return {
    animations: data.animations.map((a) => ({ name: a.name, duration: a.duration })),
    bones: data.bones.map((bone) => ({ name: bone.name, parent: bone.parent?.name ?? null })),
    slots: data.slots.map((slot) => ({ name: slot.name, bone: slot.boneData.name })),
    subset: (opts, skin) => slotSubsetOf(data, opts, skin),
    setup: (skin) => spinePosed(setupPosed(data, skin)),
    animation: (name, skin, fps, count, visit) => {
      const skeleton = skeletonUnderSkin(data, skin);
      const state = new AnimationState(new AnimationStateData(data));
      // Not looping: the last frame sits at the animation's duration, and a looping
      // entry would wrap it back onto the first pose.
      state.setAnimation(0, name, false);
      skeleton.setupPose();
      const step = 1 / fps;
      const posed = spinePosed(skeleton);
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
        visit(i, posed);
      }
    },
    rest: (skin, shown) => restOf(data, skin, shown),
  };
}

/** A spine-core skeleton as it stands posed, read through the seam's `Posed`. */
function spinePosed(skeleton: Skeleton): Posed {
  return {
    pieces: (draw) => drawPieces(skeleton, draw),
    bones: () => boneSnapshots(skeleton),
    attachments: () => attachmentsOf(skeleton),
  };
}

/**
 * A fresh skeleton under `skin`, stepped into its setup pose — the one recipe
 * `sampleSetupPose` and the geometry export's `rest` table both pose from, so
 * the two cannot come to describe different rest poses.
 */
function setupPosed(data: SkeletonData, skin: string | undefined): Skeleton {
  const skeleton = skeletonUnderSkin(data, skin);
  skeleton.setupPose();
  skeleton.update(0);
  skeleton.updateWorldTransform(Physics.reset);
  return skeleton;
}

/**
 * Every animation of one skeleton at one rate, keyed by the name its frames are
 * filed under. A skeleton with no animation at all contributes its setup pose
 * under `SETUP_POSE_DIR`.
 */
export function sampleAll(source: PoseSource, fps: number, opts?: PoseOptions): Map<string, Frame[]> {
  const poser = poserOf(source);
  const out = new Map<string, Frame[]>();
  if (poser.animations.length === 0) out.set(SETUP_POSE_DIR, sampleSetupPose(poser, opts));
  else for (const animation of poser.animations) out.set(animation.name, sampleAnimation(poser, animation.name, fps, opts));
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
 *
 * ## A clipping attachment is skipped as a piece and applied as a mask
 *
 * It draws nothing, and it removes what every slot from its own through its
 * `end` slot draws outside its polygon. Skipping it outright drew those pixels —
 * measured on a port whose eye masks clip the irises: the blink frame read MAE
 * 1.07 against 0.53 at an open eye, with both irises drawn over closed lids,
 * where spine-webgl reads 0.16 (issue #844). So spine-core's own
 * `SkeletonClipping` runs beside the walk, and the call sequence is
 * spine-webgl's `SkeletonRenderer.draw` (branch `4.3`) step for step: at a
 * clipping attachment `clipEnd(slot)` then `clipStart(skeleton, slot, clip)` and
 * nothing drawn; at every other slot, drawn or not, `clipEnd(slot)` after it,
 * which is what ends a clip AT its end slot rather than before it; `clipEnd()`
 * after the walk. The polygon, its convex decomposition, `inverse` and `convex`
 * are the clipper's, so there is no second opinion about any of them here.
 *
 * A slot inside a clip hands its world vertices, its triangles — a region's are
 * the runtime's own `0 1 2 2 3 0` — and its UVs to `clipTrianglesUnpacked`, and
 * the piece carries what comes back. ⚠️ **Only when the clipper says it clipped**,
 * exactly as spine-webgl uses the result only when `clipTriangles` returns
 * true: an attachment wholly inside the polygon draws its own geometry, so a
 * region there is still a `Quad` and its pixels are the unclipped ones to the
 * bit. One that is cut becomes a `Mesh` — the clipper's output is a triangle
 * list — and one wholly outside becomes a mesh with no triangle, which keeps the
 * slot in the frame, undrawn, rather than absent.
 *
 * The clip is applied whatever `slots`/`hidden` draw: a hidden clip still masks
 * what is shown, so a subset frame is the whole frame's pixels for those slots.
 * `unclipped` turns it off for the framing box alone — see its note.
 */
export function piecesOf(skeleton: Skeleton, opts?: PoseOptions): Piece[] {
  // A skin is chosen before a skeleton is posed, and this one is already posed —
  // so there is nothing honest to do with the name except say so. Silently
  // ignoring it is the shape of defect #571 itself: a skin asked for, no skin
  // applied, and a picture that looks like an answer.
  if (opts?.skin !== undefined) {
    throw new Error(
      `piecesOf was asked for skin ${JSON.stringify(opts.skin)}, and it reads a skeleton that is already posed. ` +
        'Ask a sampler for it — sampleSetupPose/sampleAnimation/sampleAll take { skin } — or call ' +
        'skeleton.setSkin(...) and skeleton.setupPose() before this.',
    );
  }
  // Resolved against the skeleton as it was posed — its own slots and the skin
  // it was set to — so a name that draws nothing is refused here, where the one
  // application point is, rather than matching no piece in silence.
  const subset = slotSubsetOf(skeleton.data, opts, skeleton.skin?.name);
  return drawPieces(skeleton, { subset, unclipped: opts?.unclipped === true, texture: opts?.texture === true });
}

/** `piecesOf`'s walk over a posed spine-core skeleton, the subset already resolved — the spine poser's `Posed.pieces`. */
function drawPieces(skeleton: Skeleton, draw: DrawOptions): Piece[] {
  const { subset } = draw;
  const named = subset === undefined ? undefined : new Set(subset.names);
  const clipper = draw.unclipped ? null : new SkeletonClipping();
  const pieces: Piece[] = [];
  for (const slot of skeleton.drawOrder.appliedPose) {
    const attachment = slot.appliedPose.attachment;
    if (attachment instanceof ClippingAttachment) {
      if (clipper !== null) {
        clipper.clipEnd(slot);
        // spine-webgl ends the clip at a slot whose bone is inactive and starts
        // none there; the order of the two calls is the same either way.
        if (slot.bone.active) clipper.clipStart(skeleton, slot, attachment);
      }
      continue;
    }
    const drawn = subset === undefined || named === undefined || named.has(slot.data.name) === (subset.mode === 'slots');
    const piece = drawn ? pieceOf(skeleton, slot, draw.texture, clipper) : null;
    if (piece !== null) pieces.push(piece);
    clipper?.clipEnd(slot);
  }
  clipper?.clipEnd();
  return pieces;
}

/** The runtime's own triangulation of a region's quad — spine-webgl's `QUAD_TRIANGLES`. */
const QUAD_TRIANGLES = [0, 1, 2, 2, 3, 0];

/**
 * One slot's posed drawable, or `null` for an attachment that draws nothing —
 * clipped by `clipper` when a clip is active over it (see `piecesOf`).
 */
function pieceOf(
  skeleton: Skeleton,
  slot: Slot,
  withTexture: boolean,
  clipper: SkeletonClipping | null,
): Piece | null {
  const pose = slot.appliedPose;
  const attachment = pose.attachment;
  if (!attachment) return null;
  const isMesh = attachment instanceof MeshAttachment;
  if (!isMesh && !(attachment instanceof RegionAttachment)) return null;

  const index = attachment.sequence.resolveIndex(pose);
  const region = attachment.sequence.regions[index];
  if (!(region instanceof TextureAtlasRegion)) {
    throw new Error(
      `slot "${slot.data.name}" attachment "${attachment.name}" resolved to no atlas region; ` +
        'the attachment names a region the atlas does not have',
    );
  }
  const tint = tintOf(slot, attachment);
  // The dark colour is the SLOT's alone — an attachment has a `color` and no
  // dark one, so there is nothing to multiply it by. Read off `appliedPose`
  // like the light colour, so an `rgba2` timeline reaches the picture.
  const darkPose = pose.darkColor;
  const dark: [number, number, number] | undefined =
    darkPose === null ? undefined : [darkPose.r, darkPose.g, darkPose.b];
  const common = { tint, dark, slot: slot.data.name, page: region.page.name };
  const texture = withTexture ? artUvsOf(attachment, region) : undefined;
  const uvs = attachment.sequence.getUVs(index);

  let piece: Piece;
  let triangles: number[];
  const world = worldVerticesOf(skeleton, slot, attachment);
  if (isMesh) {
    triangles = attachment.triangles;
    piece = { kind: 'mesh', ...common, texture, world, uvs, triangles };
  } else {
    triangles = QUAD_TRIANGLES;
    piece = { kind: 'region', ...common, texture, world, uvs };
  }
  if (clipper === null || !clipper.isClipping()) return piece;
  return clippedPiece(piece, triangles, uvs, clipper);
}

/** Slot colour x attachment colour, straight alpha — what a piece is tinted by and a geometry entry records. */
function tintOf(slot: Slot, attachment: MeshAttachment | RegionAttachment): [number, number, number, number] {
  const colour = slot.appliedPose.color;
  const own = attachment.color;
  return [colour.r * own.r, colour.g * own.g, colour.b * own.b, colour.a * own.a];
}

/**
 * One attachment's world vertices on `slot`, whole, by the runtime's own routine.
 *
 * The one place either kind is asked for them: `pieceOf` draws what this returns
 * and `attachmentsOf` records it, so a drawn frame and its geometry export
 * cannot disagree about where a vertex is.
 *
 * `worldVerticesLength` is 2 per vertex whether or not the mesh is weighted —
 * the weight runs live in `vertices`, not here — so this is the full output
 * length and the whole mesh is computed in one call. Deform offsets, if the
 * slot's pose carries any, are applied inside it; a region's offsets are read
 * for the sequence frame the slot's pose resolves.
 */
function worldVerticesOf(skeleton: Skeleton, slot: Slot, attachment: MeshAttachment | RegionAttachment): number[] {
  if (attachment instanceof MeshAttachment) {
    const world = new Array<number>(attachment.worldVerticesLength).fill(0);
    attachment.computeWorldVertices(skeleton, slot, 0, attachment.worldVerticesLength, world, 0, 2);
    return world;
  }
  const world = new Array<number>(8).fill(0);
  attachment.computeWorldVertices(slot, attachment.getOffsets(slot.appliedPose), world, 0, 2);
  return world;
}

/**
 * Every slot's region or mesh attachment, whole, in the posed draw order — see
 * `Frame.attachments`. No subset and no clip: those are `piecesOf`'s business.
 */
function attachmentsOf(skeleton: Skeleton): AttachmentPose[] {
  const out: AttachmentPose[] = [];
  for (const slot of skeleton.drawOrder.appliedPose) {
    const attachment = slot.appliedPose.attachment;
    if (!(attachment instanceof MeshAttachment) && !(attachment instanceof RegionAttachment)) continue;
    out.push({
      slot: slot.data.name,
      attachment: attachment.name,
      vertices: worldVerticesOf(skeleton, slot, attachment),
      color: tintOf(slot, attachment),
    });
  }
  return out;
}

/**
 * `piece` as the active clip leaves it, or `piece` itself when the clipper cut
 * nothing — see `piecesOf`.
 *
 * The page UVs and the original-art UVs (`PieceTexture`, when the piece carries
 * them) each go through their own `clipTrianglesUnpacked` call over the same
 * vertices and triangles. The clipper's geometry depends on the positions alone
 * and it interpolates a UV set barycentrically inside each source triangle, so
 * the two calls cut the same polygons and each UV set lands on them — which is
 * what lets `substituteTexture` re-seat a clipped piece exactly as it re-seats a
 * whole one, through the drawing's own coordinates. The vertex count is compared
 * all the same, because a clipped piece whose two UV sets disagreed on it would
 * sample the wrong texels and say nothing.
 */
function clippedPiece(piece: Piece, triangles: number[], uvs: Float32Array, clipper: SkeletonClipping): Piece {
  if (!clipper.clipTrianglesUnpacked(piece.world, 0, triangles, triangles.length, uvs, 2)) return piece;
  const world = Array.from(clipper.clippedVerticesTyped);
  const clippedUvs = Array.from(clipper.clippedUVsTyped);
  const clipped = Array.from(clipper.clippedTrianglesTyped);
  let texture = piece.texture;
  if (texture !== undefined) {
    clipper.clipTrianglesUnpacked(piece.world, 0, triangles, triangles.length, texture.artUvs, 2);
    const artUvs = Array.from(clipper.clippedUVsTyped);
    if (artUvs.length !== clippedUvs.length) {
      throw new Error(
        `slot "${piece.slot}": the clip cut ${clippedUvs.length / 2} vertices for the page UVs and ` +
          `${artUvs.length / 2} for the original-art UVs over the same geometry`,
      );
    }
    texture = { region: texture.region, artUvs };
  }
  const { tint, dark, slot, page } = piece;
  return { kind: 'mesh', tint, dark, slot, page, texture, world, uvs: clippedUvs, triangles: clipped };
}

// ---------------------------------------------------------------------------
// the geometry export — `render --geometry` (issue #864)
// ---------------------------------------------------------------------------
//
// ⭐ A frame set is pixels, and two judgements a consumer that does not link
// spine-core wants to make are not about pixels: how far a mesh triangle is
// stretched over its rest shape, and whether a region holds still in its own
// bone's frame. Both need the numbers the pose was drawn FROM. So `render` writes
// them beside the pictures, off the very `Frame`s it drew — one call, one frame
// grid, one viewport — rather than a second command re-deriving any of the three.

/** The export's file name inside an animation's frame directory, and its format tag. */
export const GEOMETRY_FILE = 'geometry.json';
export const GEOMETRY_SPEC = 'rigc-geometry/1';
/** Stated in the file, so a reader cannot take the numbers for frame pixels. */
export const GEOMETRY_COORDINATES = 'spine world, y up, world units';

/** A geometry file's frame: `Frame` reduced to the numbers the export promises. */
export interface GeometryFrame {
  index: number;
  time: number;
  bones: GeometryBone[];
  attachments: AttachmentPose[];
}

/** One bone's world transform: `world = [a b; c d]·local + (worldX, worldY)`. */
export interface GeometryBone {
  name: string;
  a: number;
  b: number;
  c: number;
  d: number;
  worldX: number;
  worldY: number;
}

/**
 * One attachment's rest geometry and its topology — the half of a stretch ratio
 * no frame carries.
 *
 * ⭐ **Rest is the setup pose's bones with no deform**, taken for every
 * attachment any frame of the file shows — including one the setup pose does not
 * show, which a slot only swaps to later. For an attachment the setup pose does
 * show, these vertices are the `setup` entry's own, bit for bit: both come off
 * one skeleton posed by `setupPosed`.
 */
export interface AttachmentRest {
  slot: string;
  attachment: string;
  kind: 'region' | 'mesh';
  vertices: number[];
  /** Vertex index triplets. A region's are the runtime's own `0 1 2 2 3 0`. */
  triangles: number[];
  /** A mesh's hull vertex count — the first `hull` vertices, as the format's `hull` field counts them. */
  hull?: number;
  /** A mesh's `uvs`, `u, v` per vertex over the untrimmed drawing, y down — the attachment's own, not a page's. */
  uvs?: number[];
}

export interface GeometryFile {
  spec: string;
  coordinates: string;
  /** The animation, or `null` for a skeleton with none (its one frame is the setup pose). */
  animation: string | null;
  skin?: string;
  fps: number;
  /** The box the PNG frames beside this file were drawn over — `frames.json`'s own `viewport`. */
  viewport: FramesSidecar['viewport'];
  /** Every bone in the skeleton's declaration order, and its parent's name. */
  bones: Array<{ name: string; parent: string | null }>;
  /**
   * Every slot in the skeleton's declaration order, and the bone it hangs from —
   * which is the bone whose frame "still in its own bone's frame" is read in.
   */
  slots: Array<{ name: string; bone: string }>;
  rest: AttachmentRest[];
  /** The setup pose, sampled the way `sampleSetupPose` samples it. */
  setup: Omit<GeometryFrame, 'index' | 'time'>;
  frames: GeometryFrame[];
}

/**
 * A pose holding a number that is not finite — refused by the bone or the vertex
 * that holds it, and the value, rather than drawn, framed or written.
 *
 * Two callers throw it, with one sentence between them (`nonFiniteSentence`):
 * the geometry export, because `JSON.stringify` writes `NaN` and `Infinity` as
 * `null` and a consumer would read a hole in the geometry as a vertex at
 * nothing; and `framingViewport`, because a box over an infinite vertex is no
 * box at all (issue #873). Before that second caller the framing answered `null`
 * for it, which `render` prints as "posed no drawable attachment" — true of a
 * skeleton that draws nothing and false of this one, whose attachment is there
 * and posed to a number no picture can hold.
 */
export class GeometryError extends Error {}

/** `frames.json`'s viewport block for `v` — the one spelling both files use. */
export function sidecarViewport(v: Viewport): FramesSidecar['viewport'] {
  return {
    x: v.minX,
    y: v.minY,
    width: v.maxX - v.minX,
    height: v.maxY - v.minY,
    scale: v.scale,
    pixelWidth: v.width,
    pixelHeight: v.height,
  };
}

/**
 * The geometry file for one frame set — `frames` exactly as a sampler returned
 * them with `{ bones: true, geometry: true }`, which is what makes its grid the
 * frame set's own.
 *
 * Refused by `GeometryError`, naming the frame, the slot, the attachment and the
 * vertex (or the bone), when any number in it is not finite.
 */
export function geometryFileOf(
  source: PoseSource,
  animation: string | null,
  fps: number,
  frames: Frame[],
  viewport: Viewport,
  skin: string | undefined,
): GeometryFile {
  const geometryFrame = (frame: Frame, where: string): Omit<GeometryFrame, 'index' | 'time'> => {
    if (frame.bones === undefined || frame.attachments === undefined) {
      throw new Error(`${where} was sampled without { bones: true, geometry: true }; the geometry export needs both`);
    }
    return {
      bones: frame.bones.map(({ name, a, b, c, d, worldX, worldY }) => ({ name, a, b, c, d, worldX, worldY })),
      attachments: frame.attachments,
    };
  };
  const posed = frames.map((frame) => ({
    index: frame.index,
    time: frame.time,
    ...geometryFrame(frame, `frame ${frame.index}`),
  }));
  const poser = poserOf(source);
  const setupFrame = sampleSetupPose(poser, { ...(skin === undefined ? {} : { skin }), bones: true, geometry: true })[0];
  const setup = geometryFrame(setupFrame, 'the setup pose');
  const file: GeometryFile = {
    spec: GEOMETRY_SPEC,
    coordinates: GEOMETRY_COORDINATES,
    animation,
    ...(skin === undefined ? {} : { skin }),
    fps,
    viewport: sidecarViewport(viewport),
    bones: poser.bones.map(({ name, parent }) => ({ name, parent })),
    slots: poser.slots.map(({ name, bone }) => ({ name, bone })),
    rest: poser.rest(skin, [setup.attachments, ...posed.map((frame) => frame.attachments)]),
    setup,
    frames: posed,
  };
  refuseNonFinite(file);
  return file;
}

/**
 * The rest table: every (slot, attachment) the given frames show, in order of
 * first appearance, posed on one setup skeleton with the slot's deform empty.
 *
 * The attachment is resolved the way the pose resolved it — `Skeleton.getAttachment`,
 * the skin first and the default skin second — so a name means the object the
 * frames drew. A region's rest corners are read for the sequence frame the setup
 * pose resolves, which is the frame its setup pose draws.
 */
function restOf(data: SkeletonData, skin: string | undefined, shown: readonly AttachmentPose[][]): AttachmentRest[] {
  const skeleton = setupPosed(data, skin);
  // Slot, then attachment: two maps rather than one joined key, so no pair of
  // names can fold into another's entry whatever characters they carry.
  const seen = new Map<string, Set<string>>();
  const out: AttachmentRest[] = [];
  for (const entries of shown) {
    for (const entry of entries) {
      const names = seen.get(entry.slot) ?? new Set<string>();
      if (names.has(entry.attachment)) continue;
      names.add(entry.attachment);
      seen.set(entry.slot, names);
      const slotIndex = data.findSlot(entry.slot)?.index ?? -1;
      const slot = skeleton.slots[slotIndex];
      const attachment = slot === undefined ? null : skeleton.getAttachment(slotIndex, entry.attachment);
      if (slot === undefined || !(attachment instanceof MeshAttachment || attachment instanceof RegionAttachment)) {
        throw new Error(
          `slot ${JSON.stringify(entry.slot)} showed attachment ${JSON.stringify(entry.attachment)} in a frame, and ` +
            'the setup skeleton resolves no region or mesh of that name there',
        );
      }
      // A mesh reads the slot's deform array; the setup pose leaves it empty,
      // and emptying it here says so rather than trusting that it is.
      slot.appliedPose.deform.length = 0;
      const vertices = worldVerticesOf(skeleton, slot, attachment);
      out.push(
        attachment instanceof MeshAttachment
          ? {
              slot: entry.slot,
              attachment: entry.attachment,
              kind: 'mesh',
              vertices,
              triangles: Array.from(attachment.triangles),
              hull: attachment.hullLength / 2,
              uvs: Array.from(attachment.regionUVs),
            }
          : { slot: entry.slot, attachment: entry.attachment, kind: 'region', vertices, triangles: [...QUAD_TRIANGLES] },
      );
    }
  }
  return out;
}

/** The bone fields a world transform is made of — what `firstNonFinite` reads off a bone. */
type WorldTransform = Pick<GeometryBone, 'name' | 'a' | 'b' | 'c' | 'd' | 'worldX' | 'worldY'>;

/** The fields of an attachment entry `firstNonFinite` reads — a frame's `AttachmentPose` or a rest entry. */
type PosedVertices = Pick<AttachmentPose, 'slot' | 'attachment' | 'vertices'>;

/**
 * The sentence for the first number at `where` that is not finite — bones before
 * vertices, since a bone that overflowed is the cause and its vertices the
 * symptom — or `null` when every number there is finite.
 */
function firstNonFinite(where: string, entries: readonly PosedVertices[], bones: readonly WorldTransform[]): string | null {
  for (const bone of bones) {
    for (const field of ['a', 'b', 'c', 'd', 'worldX', 'worldY'] as const) {
      if (!Number.isFinite(bone[field])) {
        return `${where}: bone ${JSON.stringify(bone.name)} has ${field} ${String(bone[field])}; a world transform is finite`;
      }
    }
  }
  for (const entry of entries) {
    const bad = entry.vertices.findIndex((value) => !Number.isFinite(value));
    if (bad === -1) continue;
    return (
      `${where}: slot ${JSON.stringify(entry.slot)} attachment ${JSON.stringify(entry.attachment)} vertex ` +
      `${Math.floor(bad / 2)} has ${bad % 2 === 0 ? 'x' : 'y'} ${String(entry.vertices[bad])}; a posed vertex is finite`
    );
  }
  return null;
}

/**
 * The same sentence for one skeleton as it stands posed now — its bones, then
 * the vertices of every region and mesh its slots show, in draw order — or
 * `null` when every one of those numbers is finite.
 *
 * ⭐ This is how `A10_NO_NAN_AFTER_STEPPING` reads each pose it steps (issue
 * #882), so the gate and the renderer hold one definition of "not finite": the
 * six terms `firstNonFinite` reads off a bone, and the vertices the runtime
 * computes from them. Before it A10 read the world POSITION alone, and a bone at
 * `rotation: 1e309` — finite position, NaN `a`, `b`, `c`, `d` — was gated green
 * and then refused here. The vertices are read too because a bone can be finite
 * and still carry one that is not: a two-bone `scaleX` chain of 1e154 × 1e154
 * leaves the child's `a` at 1e308, finite, and every vertex of its attachment
 * past the largest double. Only computed once every bone is finite, so a
 * broken bone is named as the cause rather than through its vertices.
 */
export function nonFiniteOfPosed(where: string, skeleton: Skeleton): string | null {
  const bones: WorldTransform[] = skeleton.bones.map((bone) => {
    const { a, b, c, d, worldX, worldY } = bone.appliedPose;
    return { name: bone.data.name, a, b, c, d, worldX, worldY };
  });
  const found = firstNonFinite(where, [], bones);
  if (found !== null) return found;
  const entries: PosedVertices[] = [];
  for (const slot of skeleton.drawOrder.appliedPose) {
    const attachment = slot.appliedPose.attachment;
    if (!(attachment instanceof MeshAttachment) && !(attachment instanceof RegionAttachment)) continue;
    entries.push({ slot: slot.data.name, attachment: attachment.name, vertices: worldVerticesOf(skeleton, slot, attachment) });
  }
  return firstNonFinite(where, entries, []);
}

/**
 * How a sampled frame is named in that sentence: the animation, the frame's
 * index at the rate it was sampled and its time — or the bare index for the one
 * frame of a skeleton with no animation, whose setup pose is checked first.
 */
function frameWhere(animation: string | null, index: number, time: number, fps: number): string {
  if (animation === null) return `frame ${index}`;
  return `animation ${JSON.stringify(animation)} frame ${index} at ${fps} fps (t=${time.toFixed(4)}s)`;
}

/** One sampled frame's numbers, under the name the sentence gives it. */
interface NamedPose {
  where: string;
  attachments: readonly PosedVertices[];
  bones: readonly WorldTransform[];
}

/**
 * ⭐ **The one derivation of the non-finite sentence** (issue #873): the setup
 * pose, then every frame in order, then the rest table. The export and the
 * framing both reach it, so `render` and `render --geometry` refuse one planted
 * overflow in the same words.
 *
 * The setup pose first because a setup bone that overflowed is named there as
 * the BONE, and the rest table — the setup's bones with no deform — would name
 * the same fault one step on, as a vertex. Rest is still checked, last: it holds
 * attachments the setup pose does not show.
 */
function nonFiniteSentence(
  setup: Pick<NamedPose, 'attachments' | 'bones'>,
  frames: readonly NamedPose[],
  rest: readonly PosedVertices[],
): string | null {
  const first = firstNonFinite('the setup pose', setup.attachments, setup.bones);
  if (first !== null) return first;
  for (const frame of frames) {
    const found = firstNonFinite(frame.where, frame.attachments, frame.bones);
    if (found !== null) return found;
  }
  return firstNonFinite('the rest table', rest, []);
}

/** Throw a `GeometryError` at the first number in `file` that is not finite, naming where it sits. */
function refuseNonFinite(file: GeometryFile): void {
  const sentence = nonFiniteSentence(
    file.setup,
    file.frames.map((frame) => ({ ...frame, where: frameWhere(file.animation, frame.index, frame.time, file.fps) })),
    file.rest,
  );
  if (sentence !== null) throw new GeometryError(sentence);
}

/**
 * Where a skeleton's pose is not finite, as the sentence the geometry export
 * refuses on — or `null` when every bone and vertex of it is finite.
 *
 * Each set is sampled at its own rate, with its bones and whole attachments —
 * `animation: null` is the setup pose alone — so the frame it names is a frame of
 * the caller's own grid. It samples again rather than taking the caller's
 * frames, because a caller that only draws sampled no bones; it is run only
 * once the caller has found a number that is not finite, so a finite pose never
 * pays for it.
 */
export function nonFinitePoseOf(
  source: PoseSource,
  skin: string | undefined,
  sets: ReadonlyArray<{ animation: string | null; fps: number }>,
): string | null {
  const poser = poserOf(source);
  const opts: PoseOptions = { ...(skin === undefined ? {} : { skin }), bones: true, geometry: true };
  // Every attachment list the frames showed, for the rest table's roster.
  const shown: AttachmentPose[][] = [];
  const named = (frame: Frame, where: string): NamedPose => {
    if (frame.bones === undefined || frame.attachments === undefined) {
      throw new Error(`${where} was sampled without { bones: true, geometry: true }`);
    }
    shown.push(frame.attachments);
    return { where, attachments: frame.attachments, bones: frame.bones };
  };
  const setup = named(sampleSetupPose(poser, opts)[0], 'the setup pose');
  const frames = sets.flatMap(({ animation, fps }) =>
    animation === null
      ? []
      : sampleAnimation(poser, animation, fps, opts).map((frame) =>
          named(frame, frameWhere(animation, frame.index, frame.time, fps)),
        ),
  );
  // Not read unless the setup pose and every frame are finite: `restOf` poses
  // what they show, and would be posing the same overflow a third time.
  const found = nonFiniteSentence(setup, frames, []);
  if (found !== null) return found;
  return nonFiniteSentence({ attachments: [], bones: [] }, [], poser.rest(skin, shown));
}

/**
 * The file's text: a JSON object whose header fields sit one per line and whose
 * `rest` entries and `frames` sit one per line each, so a diff of two exports
 * names the frame that moved.
 *
 * Numbers are `JSON.stringify`'s, which is how every JSON this tree writes prints
 * them — the shortest decimal that reads back as the same double, fixed by the
 * language rather than a locale — so a vertex in the file IS the runtime's
 * vertex, not a rounding of it.
 */
export function geometryText(file: GeometryFile): string {
  const lines: string[] = [];
  const entries = Object.entries(file);
  entries.forEach(([key, value], i) => {
    const comma = i + 1 < entries.length ? ',' : '';
    if ((key === 'rest' || key === 'frames') && Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`  ${JSON.stringify(key)}: []${comma}`);
        return;
      }
      lines.push(`  ${JSON.stringify(key)}: [`);
      value.forEach((item, j) => lines.push(`    ${JSON.stringify(item)}${j + 1 < value.length ? ',' : ''}`));
      lines.push(`  ]${comma}`);
      return;
    }
    lines.push(`  ${JSON.stringify(key)}: ${JSON.stringify(value)}${comma}`);
  });
  return `{\n${lines.join('\n')}\n}\n`;
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
 * size is `pageFootprint`'s, which is the region's own transposed for a quarter
 * turn — what the atlas format means by `bounds` on a rotated region. That
 * derivation was written out here, and in three other places that wanted the same
 * rectangle; two of them had it wrong at 270 (issue #579), so it is one function
 * now and this is one of its callers.
 */
function windowOf(region: TextureAtlasRegion): UvWindow {
  const rect = pageFootprint(region);
  const page = region.page;
  return {
    u0: region.x / page.width,
    v0: region.y / page.height,
    u1: (region.x + rect.width) / page.width,
    v1: (region.y + rect.height) / page.height,
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
 *
 * `null` means the skeleton posed no vertex at all — nothing to draw. A pose
 * holding a vertex at Infinity or NaN is refused by a `GeometryError` naming the
 * bone or vertex and its value (issue #873), never answered `null`.
 */
export function framingViewport(source: PoseSource, maxSide: number, opts?: PoseOptions): Viewport | null {
  const poser = poserOf(source);
  // The skin belongs here as much as in the frames: the union box is over the
  // attachments that POSE, and two skins fill a slot with art of different sizes
  // in different places. Framing one skin's shot with another skin's box would
  // put the difference between two skins into every measurement taken in it.
  //
  // ⭐ A slot subset is the opposite case, and is taken off (issue #835): what
  // `--slot`/`--hide` leave out still counts toward the box, so a frame with a
  // part hidden lands on the pixel grid of the frame with it and the two overlay.
  // A subset framed to its own extent would move every pixel it kept.
  //
  // A clip is taken off for the same reason (issue #844): what it removes still
  // counts toward the box, so adding or keying a mask moves no pixel it leaves
  // drawn — see `PoseOptions.unclipped`.
  // Neither the bone snapshots nor the geometry export frame anything, and
  // both would be taken at `FRAMING_FPS` for every animation only to be dropped.
  const { slots: _drawn, hidden: _hidden, bones: _bones, geometry: _geometry, ...whole } = opts ?? {};
  const framed: PoseOptions = { ...whole, unclipped: true };
  const sets =
    poser.animations.length === 0
      ? [sampleSetupPose(poser, framed)]
      : poser.animations.map((a) => sampleAnimation(poser, a.name, FRAMING_FPS, framed));
  // ⚠️ Two different reasons a box is not finite, told apart here and nowhere
  // else (issue #873). A skeleton that posed no vertex at all has nothing to
  // draw, and that is `null`. One that posed a vertex at Infinity or NaN has a
  // drawable attachment in a place no box can hold — so it is refused by the
  // bone or vertex and its value, in the geometry export's own sentence. Before
  // this, the first case's `null` covered both, and a single overflowing bone
  // among finite ones reached neither: its box was finite on one side, and
  // `render` wrote a NaN-by-NaN frame set with exit 0.
  const posedAny = sets.some((frames) => frames.some((frame) => frame.pieces.some((piece) => piece.world.length > 0)));
  if (!posedAny) return null;
  const box = unionBounds(sets);
  if (![box.minX, box.minY, box.maxX, box.maxY].every(Number.isFinite)) {
    const found = nonFinitePoseOf(
      poser,
      framed.skin,
      poser.animations.length === 0
        ? [{ animation: null, fps: FRAMING_FPS }]
        : poser.animations.map((a) => ({ animation: a.name, fps: FRAMING_FPS })),
    );
    // Reaching here with nothing found would mean the pieces and the whole
    // attachments disagree about one pose — a defect here, said as one.
    if (found === null) {
      throw new Error(
        `the framing box is not finite (${box.minX}, ${box.minY}, ${box.maxX}, ${box.maxY}) and no bone or ` +
          'vertex of the pose is — the drawn pieces and the attachments were posed differently',
      );
    }
    throw new GeometryError(found);
  }
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
 * One colour channel of one texel, tinted — the whole of what a slot's colours
 * do to a pixel.
 *
 * With no dark colour this is the multiply it always was, to the bit: `dark`
 * absent returns `sample * light` and nothing else, which is why every frame in
 * this repository renders byte for byte as it did before two-colour tinting
 * existed.
 *
 * With one, the light colour multiplies the texel and the dark colour fills in
 * what the texel leaves behind, so a black region can be tinted to any colour
 * while its bright parts keep the light tint. [official] — spine-ts's own
 * two-colour fragment shader, `spine-ts/spine-webgl/src/Shader.ts`
 * (`newTwoColoredTextured`), read at branch `4.3` of `EsotericSoftware/spine-runtimes`:
 *
 *     gl_FragColor.a = texColor.a * v_light.a;
 *     gl_FragColor.rgb = ((texColor.a - 1.0) * v_dark.a + 1.0 - texColor.rgb) * v_dark.rgb
 *                        + texColor.rgb * v_light.rgb;
 *
 * ⚠️ `v_dark.a` in that line is **not a colour channel** — it is the
 * premultiplied-alpha flag, which is why the dark colour is six hex digits in
 * the file and four bytes on the vertex. `SkeletonRendererCore` packs it as such:
 * `darkColor = 0xff000000 | …` on the `pma` branch and `darkColor = (r << 16) |
 * (g << 8) | b` — alpha byte **zero** — on the other. This rasteriser composites
 * **straight** alpha (see `premultiplied` below), so the flag is 0 and the shader
 * reduces to the two terms this function computes. Reading `dark.a` out of the
 * file here would be reading a flag as a colour.
 *
 * The clamp is on the dark path only, for the same reason: `sample * light` is
 * already inside the range whenever `light` is, and a clamp on that path would
 * be a change to pixels nothing asked to change.
 */
function tintChannel(sample: number, light: number, dark: number | undefined): number {
  if (dark === undefined) return sample * light;
  const mixed = sample * light + (255 - sample) * dark;
  return mixed < 0 ? 0 : mixed > 255 ? 255 : mixed;
}

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
        Math.round(tintChannel(sample[0], quad.tint[0], quad.dark?.[0])),
        Math.round(tintChannel(sample[1], quad.tint[1], quad.dark?.[1])),
        Math.round(tintChannel(sample[2], quad.tint[2], quad.dark?.[2])),
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
          Math.round(tintChannel(sample[0], mesh.tint[0], mesh.dark?.[0])),
          Math.round(tintChannel(sample[1], mesh.tint[1], mesh.dark?.[1])),
          Math.round(tintChannel(sample[2], mesh.tint[2], mesh.dark?.[2])),
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
 * `SM08_NO_PRODUCTION_MODULE_READS_THE_STRAIGHT_TAP` is what keeps the first
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
