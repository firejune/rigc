/**
 * chainfit — where the parts `pose` cannot see sit, read through the candidate rig.
 *
 * ⭐ This is `pose`'s sibling, not its replacement, and the difference is one
 * input. `pose` is handed a picture and a pile of loose PNGs and nothing else, so
 * it searches each part's full rigid family — two translations, a rotation and a
 * scale — and it is honest about what that costs on a dense figure: a part drawn
 * behind another has the occluder's pixels where its own should be, so its
 * residual rises **at the correct placement**. On a biped in a stance that is the
 * far arm, both thighs, the feet, the fists and whatever the hands hold.
 *
 * chainfit is handed the **candidate rig as well**. That buys two things `pose`
 * structurally cannot have:
 *
 * 1. **Draw order**, so occlusion becomes measurable rather than a caveat. The
 *    parts drawn after a part are exactly what covers it, and the pixels they
 *    cover are EXCLUDED from that part's objective instead of charged to it. A
 *    residual here is over the part's VISIBLE pixels, and `visibleShare` says how
 *    much of the part that was — so a 12%-visible answer carries its uncertainty
 *    in the report rather than in the reader's head.
 * 2. **Hierarchy and attachment geometry**, so the search collapses. A child bone
 *    whose parent is already placed does not have four degrees of freedom: its
 *    pivot is fixed by the rig's own joint offset, so all that is left is the
 *    hinge — one rotation about that pivot — plus a stretch, and only where the
 *    candidate's own timelines say the rig leaves scale free. One degree of
 *    freedom instead of four also kills the duplication `pose` has to report as
 *    ambiguous: two identical limbs are no longer two equal answers when each of
 *    them hangs off a different placed shoulder.
 *
 * 🚫 **Usage phase, so nothing here is a score and no pass bar attaches.** Same
 * framing as `pose`, and for the same reason: this reads a **given condition** —
 * the pose the user handed over — into spec coordinates an agent then states by
 * construction. The residual and `visibleShare` exist so a caller knows how far
 * to trust a placement and where two answers are equally good. The only
 * thresholds in this file are the ones that decide whether to print an answer at
 * all, and every one of them is reported and movable.
 *
 * 🔍 The objective is `src/pose.ts`'s, borrowed rather than rewritten — see the
 * ⭐ note at the head of that file. What this adds is the mask, and the one place
 * a mask can go wrong is worth stating before the code: **the visible set is
 * frozen in the part's own space before the search runs**, at the placement the
 * rig itself predicts. A mask recomputed per candidate placement makes the
 * denominator a free variable, and the cheapest move is then to slide the part
 * until the occluder covers nearly all of it and a handful of agreeing pixels are
 * all that is scored. Frozen, the denominator is a constant and a move can only
 * be paid for by agreeing with the frame.
 *
 * ⬇️ **The walk goes outward from an anchor, which means downward only.** An
 * anchored part fixes its own bone completely — four numbers read off the picture
 * for the four a similarity has — and every descendant then follows from the rig.
 * A bone ABOVE an anchor does not: recovering it would need to know what the link
 * between them did, which is precisely the unknown the anchor does not carry. So a
 * limb with no trusted part on it or above it is refused `no-anchor` rather than
 * guessed at from a cousin.
 *
 * Coordinates are the frame's own — **frame pixels, y down, origin top-left** —
 * exactly as in a `pose` report, so the two are readable side by side. The one
 * addition is `hingeDeg` and `localRotationDeg`, which are **Spine** degrees
 * (CCW, y up) because they are timeline values: what a `rotate` key would carry.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { Plate, readPlate } from '../tools/plate.ts';
import {
  AMBIGUITY_ABSOLUTE,
  AMBIGUITY_RELATIVE,
  DEFAULT_MAX_RESIDUAL,
  POSE_SPEC,
  UNEXPLAINED_TOLERANCE,
  buildSamples,
  errBilinear,
  errNearest,
  estimatePose,
  halvePlate,
  levelOf,
  materialPlate,
  normaliseDegrees,
  readBackground,
  roundTo,
  type Level,
  type PoseBackground,
  type PoseReport,
  type Samples,
} from './pose.ts';
import type { SpineBone, SpineRegionAttachment, SpineSkeletonJson } from './types.ts';

export class ChainFitError extends Error {}

/** The `spec` field every report carries, so a consumer can refuse a future shape. */
export const CHAINFIT_SPEC = 'rigc-chainfit/1';

// ---------------------------------------------------------------------------
// the constants the search is made of — every one of them is reported
// ---------------------------------------------------------------------------

/**
 * Share of a part's own alpha weight that has to survive the occluders before an
 * answer about it is printed rather than refused.
 *
 * ⚠️ Not a pass bar; it is where "this measurement is of that part" stops being
 * true. Below it the residual is a statement about a sliver, and the refusal names
 * the measured share beside this number so a caller who wants the sliver can read
 * past it — the placement is still filled in.
 */
export const DEFAULT_MIN_VISIBLE = 0.25;

/**
 * Alpha, 0..255, at which a pixel of a later-drawn part counts as covering.
 *
 * The same threshold the 2026-09-03 measurement run's occluder masks used, and it
 * is a threshold rather than a blend because the question is binary: either this
 * pixel of the frame is evidence about this part, or it is evidence about the
 * thing in front of it.
 */
export const OCCLUDER_ALPHA = 96;

/** Default hinge window, in Spine degrees about the bone's setup rotation. */
export const DEFAULT_HINGE_MIN = -180;
export const DEFAULT_HINGE_MAX = 180;

/**
 * The hinge sweep's step, in degrees.
 *
 * A full turn at this step is 120 evaluations of one bone, which is what a single
 * degree of freedom buys: `pose` cannot afford an exhaustive rotation ladder at
 * every position and every scale, and this has no positions or scales to cross.
 * So the default window is the whole turn. A window that does not contain the
 * truth is the failure `pose`'s §11.4 warns about — it does not reliably refuse,
 * it reports the best thing inside the window — and one degree of freedom is cheap
 * enough not to have to run that risk by default.
 */
export const HINGE_STEP = 3;

/**
 * Ratio window the stretch degree of freedom is searched over, when it is free.
 *
 * Free means the candidate's own animations key a `scale` timeline on that bone,
 * or the caller named `--stretch`. A rig that never scales a bone is a rig saying
 * that bone does not stretch, and inventing the freedom would hand back a length
 * the spec does not have.
 */
export const DEFAULT_STRETCH_RATIO = 1.25;

/** Rungs the stretch ladder gets across its window. */
export const STRETCH_STEPS = 4;

/**
 * How many times the masks are rebuilt from the answers and the fit rerun.
 *
 * The first pass freezes each part's visible set at the placement the RIG
 * predicts, which is the only seed available before anything is fitted. Where the
 * fit then moves a limb a long way, that frozen set was measured somewhere the
 * part no longer is — `visibleShareAtFit` is the field that says so. A second pass
 * re-freezes on the first pass's own answers, which is why two is the default and
 * one is a legitimate, faster, less converged choice.
 */
export const DEFAULT_PASSES = 2;

/**
 * What makes a `pose` answer good enough to anchor a chain on.
 *
 * ⭐ These two numbers are the 2026-09-03 measurement run's own "clean frame"
 * criterion, taken rather than invented: that run folded 147 `pose` reports and
 * counted a part as read when its residual was within 0.16, its `unexplained`
 * within 0.45, and it came back unambiguous. Anchoring asks the same question —
 * *is this placement trustworthy enough to hang other placements off?* — so it
 * gets the same line, and a caller who moves it moves a reported field.
 */
export const ANCHOR_MAX_RESIDUAL = 0.16;
export const ANCHOR_MAX_UNEXPLAINED = 0.45;

/** Two hinge answers this close are one answer under two names. */
export const AMBIGUITY_HINGE_DEG = 5;

/** Sample budget per part per evaluation. The reported numbers use every pixel regardless. */
const SEARCH_SAMPLES = 512;

/** Basins each stretch rung sends to the polish, and how many survive to it in all. */
const MINIMA_PER_RUNG = 6;
const POLISH_CANDIDATES = 12;

/** Alternates beyond this many are not printed; the count is still stated. */
const MAX_ALTERNATES = 3;

/**
 * How far the visible share may move between the seed and the fit before the
 * report says the measurement and the answer are not in the same place.
 */
const VISIBILITY_DRIFT_TOLERANCE = 0.15;

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// the report
// ---------------------------------------------------------------------------

/** One placement of one part, in frame pixels, y down, origin top-left. */
export interface ChainFitPlacement {
  /** Where the part image's own centre — `(width/2, height/2)` — lands. */
  x: number;
  y: number;
  /** Screen degrees: positive turns clockwise on screen. `screenToSpineDegrees` converts. */
  rotationDeg: number;
  /** Uniform, as frame pixels per part pixel. */
  scale: number;
  /**
   * The searched degree of freedom, in **Spine** degrees relative to the bone's
   * setup rotation — the delta a `rotate` key would carry.
   *
   * `null` where the quantity does not exist: an anchored bone whose own parent is
   * unplaced has a placement read straight off the picture and no link above it to
   * measure a local rotation against.
   */
  hingeDeg: number | null;
  /** The bone's local rotation this placement implies, Spine degrees. `null` with `hingeDeg`. */
  localRotationDeg: number | null;
  /** The stretch factor on the bone. `1` where the DOF was not free, `null` with `hingeDeg`. */
  stretch: number | null;
  /**
   * Alpha-weighted mean absolute colour error over the part's **visible** pixels,
   * 0..1 — the objective of `src/pose.ts`, with the covered pixels dropped from
   * both sums rather than charged. Lower is better explained; that is all it means.
   */
  residual: number;
  /**
   * The share of the part's own alpha weight the residual was computed on: what
   * nothing drawn after it covered, at the placement the set was frozen at.
   *
   * ⚠️ Read every residual next to this. Both halves of a low residual on a 0.08
   * visible share are true, and neither is worth much on its own.
   */
  visibleShare: number;
  /** Part pixels behind that share — the count the number actually rests on. */
  scoredPixels: number;
  /**
   * The same share recomputed where the answer LANDED, rather than where the set
   * was frozen. Far from `visibleShare` means the fit moved out of its own
   * measurement; another pass is the repair, and `search.passes` says how many ran.
   */
  visibleShareAtFit: number;
  /** Share of the VISIBLE weight whose per-pixel error clears `UNEXPLAINED_TOLERANCE`. */
  unexplained: number;
  /** Share of the part's WHOLE alpha weight that lands outside the frame canvas. */
  offCanvas: number;
  /** Frame pixels of material this placement accounts for, over its visible set. */
  footprint: number;
  /** Axis-aligned box the placed part occupies, frame pixels. */
  bbox: { x: number; y: number; width: number; height: number };
}

export type ChainFitRefusalReason =
  | 'no-anchor'
  | 'occluded'
  | 'no-match'
  | 'empty-part'
  | 'no-part-image'
  | 'unsupported-geometry';

export interface ChainFitRefusal {
  reason: ChainFitRefusalReason;
  detail: string;
}

/** What the rig says about the bone this part hangs off, and what was searched on it. */
export interface ChainFitBoneView {
  name: string;
  parent: string | null;
  /** The bone's own setup rotation, Spine degrees — what `hingeDeg` is measured from. */
  setupRotationDeg: number;
  /** Chain links from the anchor. `0` means this part's own bone was anchored, `-1` unplaced. */
  depth: number;
  /** The anchored bone this part's placement is ultimately hung from, or `null`. */
  anchoredTo: string | null;
  dof: {
    /** Always searched on a chain bone: the hinge is the premise of the instrument. */
    rotation: boolean;
    /** Searched only where the candidate leaves scale free — see `DEFAULT_STRETCH_RATIO`. */
    stretch: boolean;
    /**
     * The candidate keys a `translate` timeline on this bone, so the pivot the
     * hinge turned about is itself something the rig moves. The placement is still
     * read off pixels; it is `localRotationDeg` that stops being keyable alone.
     */
    pivotFree: boolean;
  };
  /** The window taken, so an answer at its edge is visible as one. */
  window: { hingeMinDeg: number; hingeMaxDeg: number; hingeStepDeg: number; stretchMin: number; stretchMax: number };
  /** Other parts scored together with this one, because they hang off the same bone. */
  sharedWith: string[];
  /**
   * Bones between the anchor and this one that carry no art. Nothing could fit
   * their hinge, so their setup rotation was carried through and every placement
   * below them inherits that assumption.
   */
  carriedBones: string[];
  /**
   * Anchored bones only: how far the chain's own prediction of this bone's pivot
   * is from where the anchor put it, in frame pixels. It is a measure of the RIG
   * against the picture — a large value says the joint offset the candidate
   * declares is not the joint the frame shows. `null` when the chain had no
   * prediction, which is every anchor whose parent is unplaced.
   */
  pivotDisagreementPx: number | null;
}

/** What the anchor pass said about this part, whether or not it became an anchor. */
export interface ChainFitAnchorVerdict {
  residual: number;
  unexplained: number;
  ambiguous: boolean;
  /** Did it clear `ANCHOR_MAX_RESIDUAL` / `ANCHOR_MAX_UNEXPLAINED` and come back unique? */
  eligible: boolean;
}

export interface ChainFitPart {
  /** The part PNG's file name — how the report names the part everywhere. */
  part: string;
  path: string;
  slot: string;
  attachment: string;
  width: number;
  height: number;
  /** `anchor` = taken from the anchor pass; `chain` = fitted through the rig; `unplaced` = neither. */
  role: 'anchor' | 'chain' | 'unplaced';
  bone: ChainFitBoneView;
  /**
   * Why this answer should not be taken at face value, or `null`.
   *
   * ⚠️ `placement` is still filled in under `occluded` and `no-match`, on purpose:
   * a refusal names why not to trust a number, it does not hide it. The reasons
   * that leave it `null` — `no-anchor`, `empty-part`, `no-part-image`,
   * `unsupported-geometry` — are the ones where nothing was searched.
   */
  refusal: ChainFitRefusal | null;
  placement: ChainFitPlacement | null;
  /** Other hinge answers inside the ambiguity margin, best first. */
  alternates: ChainFitPlacement[];
  ambiguous: boolean;
  /**
   * What the anchor pass made of this same part on this same frame, or `null` when
   * it had nothing for it.
   *
   * ⭐ The field that makes the two instruments readable together: `eligible` false
   * with a `chain` placement beside it is a part the chain bought.
   */
  anchorVerdict: ChainFitAnchorVerdict | null;
  /** Plain-language versions of everything above, in the order they were found. */
  notes: string[];
}

export interface ChainFitReport {
  spec: string;
  /** The coordinate contract, spelled out in the file rather than assumed. */
  space: string;
  candidate: {
    skeleton: string;
    /** The skins searched for each slot's setup attachment, in the order tried. */
    skins: string[];
    bones: number;
    slots: number;
    /** Slots with a setup attachment this run could resolve to a region. */
    drawn: number;
    /** Setup draw order, back to front — the order the masks were built in. */
    drawOrder: string[];
  };
  images: string;
  frame: { path: string; width: number; height: number; background: PoseBackground };
  anchor: {
    source: 'pose' | 'file';
    path: string | null;
    criterion: { maxResidual: number; maxUnexplained: number; requireUnambiguous: boolean };
    /** The parts whose answer was trusted, and whose bones the walk started from. */
    anchored: string[];
  };
  search: {
    hinge: { minDeg: number; maxDeg: number; stepDeg: number; steps: number };
    stretch: { ratio: number; steps: number; freeFrom: string };
    minVisible: number;
    maxResidual: number;
    ambiguity: { absolute: number; relative: number; hingeDeg: number };
    passes: number;
    occluderAlpha: number;
  };
  /** What the numbers above cannot see. Read before consuming them. */
  caveats: string[];
  parts: ChainFitPart[];
}

export interface ChainFitOptions {
  /** A compiled candidate: a directory holding `skeleton.json`, or the path to one. */
  candidatePath: string;
  /** Where the candidate's attachment image names resolve to loose PNGs. */
  imagesDir: string;
  /** One pose frame. */
  framePath: string;
  /** A `rigc pose` report for this frame. Without it, one is computed internally. */
  anchorPath?: string;
  hinge?: { minDeg: number; maxDeg: number };
  /** Ratio window for the stretch DOF, and an explicit request to search it everywhere. */
  stretch?: number;
  minVisible?: number;
  maxResidual?: number;
  passes?: number;
  /** Sizes the internal anchor pass only; refused together with `anchorPath`. */
  scale?: { min: number; max: number };
  rotation?: { minDeg: number; maxDeg: number };
  anchorMaxResidual?: number;
  anchorMaxUnexplained?: number;
}

// ---------------------------------------------------------------------------
// the candidate, as much of it as a chain fit needs
// ---------------------------------------------------------------------------

/** A region attachment's own geometry, defaulted, in the bone's local space. */
interface AttachmentGeometry {
  x: number;
  y: number;
  /** Spine degrees, CCW — the attachment's own rotation inside the bone. */
  rotation: number;
  scaleX: number;
  scaleY: number;
  width: number;
  height: number;
}

/** One drawable this run will place. */
interface DrawnSlot {
  slot: string;
  bone: string;
  attachment: string;
  /** The image name the attachment resolves against `--images`. */
  image: string;
  geometry: AttachmentGeometry;
}

/** A bone's placement in the frame's own pixels. */
interface BonePlace {
  x: number;
  y: number;
  /** Screen degrees, positive clockwise — the bone's world rotation, y-flipped. */
  rotDeg: number;
  /** Frame pixels per bone unit. */
  unit: number;
}

/** A part's placement in the frame's own pixels, before it is measured. */
interface PartPlace {
  cx: number;
  cy: number;
  rotDeg: number;
  /** Frame pixels per part pixel. */
  scale: number;
}

/**
 * A bone-local point (Spine's y-up local space) into frame pixels.
 *
 * ⭐ The whole y flip, in one place. Spine composes in a y-up world with CCW
 * rotations; a frame is y-down with clockwise ones. Negating the local `y` and the
 * rotation together turns the composition into a plain screen-space similarity,
 * which is what lets every step below be one multiply — and it is verified rather
 * than argued: this reproduces `src/render.ts`'s own posed quads to 1e-5 px across
 * a 17-bone candidate, which is the check the selftest keeps.
 */
function applyBoneLocal(p: BonePlace, u: number, v: number): [number, number] {
  const cos = Math.cos(p.rotDeg * DEG);
  const sin = Math.sin(p.rotDeg * DEG);
  const sv = -v;
  return [p.x + p.unit * (cos * u - sin * sv), p.y + p.unit * (sin * u + cos * sv)];
}

/** The child's placement, given the parent's and the two residual degrees of freedom. */
function childPlace(parent: BonePlace, bone: SpineBone, hingeDeg: number, stretch: number): BonePlace {
  const [x, y] = applyBoneLocal(parent, bone.x ?? 0, bone.y ?? 0);
  return {
    x,
    y,
    rotDeg: parent.rotDeg - ((bone.rotation ?? 0) + hingeDeg),
    unit: parent.unit * (bone.scaleX ?? 1) * stretch,
  };
}

/** Where the part image lands, given its bone's placement. */
function partPlaceOf(bp: BonePlace, geometry: AttachmentGeometry, pngWidth: number): PartPlace {
  const [cx, cy] = applyBoneLocal(bp, geometry.x, geometry.y);
  return {
    cx,
    cy,
    rotDeg: bp.rotDeg - geometry.rotation,
    scale: (bp.unit * geometry.scaleX * geometry.width) / pngWidth,
  };
}

/** The inverse: one known part placement fixes its bone's, all four numbers of it. */
function bonePlaceFromPart(pl: PartPlace, geometry: AttachmentGeometry, pngWidth: number): BonePlace {
  const unit = (pl.scale * pngWidth) / (geometry.width * geometry.scaleX);
  const rotDeg = pl.rotDeg + geometry.rotation;
  const cos = Math.cos(rotDeg * DEG);
  const sin = Math.sin(rotDeg * DEG);
  const sv = -geometry.y;
  return {
    x: pl.cx - unit * (cos * geometry.x - sin * sv),
    y: pl.cy - unit * (sin * geometry.x + cos * sv),
    rotDeg,
    unit,
  };
}

/** The link an already-placed pair of bones implies — the inverse of `childPlace`. */
function linkOf(parent: BonePlace, child: BonePlace, bone: SpineBone): { hingeDeg: number; stretch: number } {
  return {
    hingeDeg: normaliseDegrees(parent.rotDeg - child.rotDeg - (bone.rotation ?? 0)),
    stretch: child.unit / Math.max(1e-9, parent.unit * (bone.scaleX ?? 1)),
  };
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Read the skeleton file, or refuse by name. */
function readSkeleton(path: string): SpineSkeletonJson {
  if (!existsSync(path)) throw new ChainFitError(`no skeleton at ${path}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new ChainFitError(`cannot parse ${path} as JSON: ${(err as Error).message}`);
  }
  const skel = parsed as SpineSkeletonJson;
  if (!Array.isArray(skel?.bones) || !Array.isArray(skel?.slots) || !Array.isArray(skel?.skins)) {
    throw new ChainFitError(
      `${path} is not Spine skeleton data — a chain fit needs its bones, its slots in draw order and its skins`,
    );
  }
  return skel;
}

/**
 * The bones a chain fit cannot compose through, by name and reason.
 *
 * ⚠️ Refused rather than approximated, and propagated down the tree: shear, a
 * non-uniform scale and every `inherit` mode but `normal` all make the world
 * transform something other than the similarity every placement in this file is.
 * Approximating one would put a plausible number on a part whose geometry this
 * instrument does not model — the same failure as searching a window that does not
 * contain the truth, which does not refuse either, it just answers wrongly.
 */
function unsupportedBones(bones: SpineBone[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const bone of bones) {
    const inherited = bone.parent === undefined ? undefined : out.get(bone.parent);
    if (inherited !== undefined) {
      out.set(bone.name, `its parent "${bone.parent}" is unsupported (${inherited})`);
      continue;
    }
    const sx = num(bone.scaleX, 1);
    const sy = num(bone.scaleY, 1);
    const shearX = num(bone.shearX, 0);
    const shearY = num(bone.shearY, 0);
    if (shearX !== 0 || shearY !== 0) {
      out.set(bone.name, `it shears (shearX ${shearX}, shearY ${shearY}), which is not a similarity`);
    } else if (sx !== sy) {
      out.set(bone.name, `its setup scale is non-uniform (scaleX ${sx}, scaleY ${sy}), which is not a similarity`);
    } else if (sx <= 0) {
      out.set(bone.name, `its setup scale is ${sx}; a mirrored or zero-scale bone has no rigid placement`);
    } else if (bone.inherit !== undefined && bone.inherit !== 'normal') {
      out.set(bone.name, `it inherits "${bone.inherit}" rather than "normal", so its world transform is not the chain's`);
    }
  }
  return out;
}

/** The region attachment for one slot's setup attachment, and the image it names. */
function resolveAttachment(
  skel: SpineSkeletonJson,
  slot: string,
  attachment: string,
): { geometry: AttachmentGeometry; image: string } | { unsupported: string } | null {
  for (const skin of skel.skins) {
    const raw = skin.attachments?.[slot]?.[attachment];
    if (raw === undefined) continue;
    // A region attachment is the one member of the union with no `type`, which is
    // also how the parser reads it, so this is the format's own discriminator
    // rather than a convention chosen here.
    const kind: string = 'type' in raw ? raw.type : 'region';
    if (kind !== 'region') {
      return {
        unsupported: `attachment "${attachment}" is a ${kind}, and only a region attachment has a rigid placement`,
      };
    }
    const region = raw as SpineRegionAttachment;
    const scaleX = num(region.scaleX, 1);
    const scaleY = num(region.scaleY, 1);
    if (scaleX !== scaleY) {
      return { unsupported: `attachment "${attachment}" scales non-uniformly (scaleX ${scaleX}, scaleY ${scaleY})` };
    }
    if (scaleX <= 0) {
      return { unsupported: `attachment "${attachment}" has scaleX ${scaleX}; a mirrored region has no rigid placement` };
    }
    const width = num(region.width, 0);
    const height = num(region.height, 0);
    if (width <= 0 || height <= 0) {
      return { unsupported: `attachment "${attachment}" declares width ${width} and height ${height}` };
    }
    return {
      geometry: {
        x: num(region.x, 0),
        y: num(region.y, 0),
        rotation: num(region.rotation, 0),
        scaleX,
        scaleY,
        width,
        height,
      },
      image: typeof region.path === 'string' && region.path.length > 0 ? region.path : attachment,
    };
  }
  return null;
}

/** Which local properties the candidate's own animations key, per bone. */
function keyedProperties(skel: SpineSkeletonJson): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const animation of Object.values(skel.animations ?? {})) {
    for (const [bone, timelines] of Object.entries(animation.bones ?? {})) {
      const set = out.get(bone) ?? new Set<string>();
      for (const name of Object.keys(timelines)) set.add(name);
      out.set(bone, set);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// the mask
// ---------------------------------------------------------------------------

/**
 * Stamp one placed part's own coverage into a frame-sized mask.
 *
 * ⚠️ Walked over the DESTINATION pixels and inverse-mapped, not forward from the
 * part's pixels. Forward stamping leaves holes wherever the placement magnifies —
 * one part pixel then covers several frame pixels and only one of them is written
 * — and a mask with holes lets an occluder's pixels back into a child's objective
 * in a lattice, which is worse than not masking at all because it looks masked.
 */
function stampCover(into: Uint8Array, width: number, height: number, part: Plate, pl: PartPlace): void {
  if (!(pl.scale > 0)) return;
  const cos = Math.cos(pl.rotDeg * DEG);
  const sin = Math.sin(pl.rotDeg * DEG);
  const halfW = part.width / 2;
  const halfH = part.height / 2;
  const reach = Math.hypot(halfW, halfH) * pl.scale + 1;
  const x0 = Math.max(0, Math.floor(pl.cx - reach));
  const x1 = Math.min(width - 1, Math.ceil(pl.cx + reach));
  const y0 = Math.max(0, Math.floor(pl.cy - reach));
  const y1 = Math.min(height - 1, Math.ceil(pl.cy + reach));
  for (let fy = y0; fy <= y1; fy++) {
    for (let fx = x0; fx <= x1; fx++) {
      const dx = fx + 0.5 - pl.cx;
      const dy = fy + 0.5 - pl.cy;
      const u = (dx * cos + dy * sin) / pl.scale + halfW;
      const v = (-dx * sin + dy * cos) / pl.scale + halfH;
      if (u < 0 || v < 0 || u >= part.width || v >= part.height) continue;
      if (part.data[(Math.floor(v) * part.width + Math.floor(u)) * 4 + 3] < OCCLUDER_ALPHA) continue;
      into[fy * width + fx] = 1;
    }
  }
}

/** A part's own visible pixels under a cover mask, in the part's own space. */
interface VisibleSet {
  keep: Uint8Array;
  /** Alpha weight the cover leaves, and the part's whole alpha weight. */
  weight: number;
  total: number;
  /** Part pixels the residual will rest on. */
  pixels: number;
}

function visibleMask(part: Plate, pl: PartPlace, cover: Uint8Array, width: number, height: number): VisibleSet {
  const keep = new Uint8Array(part.width * part.height);
  const cos = Math.cos(pl.rotDeg * DEG) * pl.scale;
  const sin = Math.sin(pl.rotDeg * DEG) * pl.scale;
  let weight = 0;
  let total = 0;
  let pixels = 0;
  for (let y = 0; y < part.height; y++) {
    for (let x = 0; x < part.width; x++) {
      const a = part.data[(y * part.width + x) * 4 + 3];
      if (a === 0) continue;
      const w = a / 255;
      total += w;
      const u = x + 0.5 - part.width / 2;
      const v = y + 0.5 - part.height / 2;
      const fx = pl.cx + u * cos - v * sin;
      const fy = pl.cy + u * sin + v * cos;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      // ⭐ Off the canvas is NOT covered: nothing is drawn over it, it simply is
      // not in the picture. It stays in the visible set and the objective charges
      // it the full 1, which is how a placement that hangs the part off the frame
      // pays for it instead of being excused by the mask.
      if (ix >= 0 && iy >= 0 && ix < width && iy < height && cover[iy * width + ix] === 1) continue;
      keep[y * part.width + x] = 1;
      weight += w;
      pixels++;
    }
  }
  return { keep, weight, total, pixels };
}

/** Which SAMPLES of a part survive its visible mask, and their weight. */
function keptSamples(samples: Samples, keep: Uint8Array, part: Plate): { flags: Uint8Array; weight: number } {
  const flags = new Uint8Array(samples.count);
  let weight = 0;
  for (let i = 0; i < samples.count; i++) {
    // `u + width/2` is exactly the centre of the mip cell this sample averages,
    // in full-resolution part pixels, so this reads the mask where the sample is.
    const px = Math.floor(samples.u[i] + part.width / 2);
    const py = Math.floor(samples.v[i] + part.height / 2);
    if (px < 0 || py < 0 || px >= part.width || py >= part.height) continue;
    if (keep[py * part.width + px] === 0) continue;
    flags[i] = 1;
    weight += samples.w[i];
  }
  return { flags, weight };
}

// ---------------------------------------------------------------------------
// the objective
// ---------------------------------------------------------------------------

/** One part, ready to be scored: its art, its samples and the frozen visible set. */
interface Target {
  geometry: AttachmentGeometry;
  plate: Plate;
  samples: Samples;
  flags: Uint8Array;
  /** Sampled visible weight — the denominator, and a constant by construction. */
  weight: number;
}

/**
 * The objective for one bone, over every part that hangs off it.
 *
 * ⭐ The degree of freedom belongs to the BONE, not to the part, so a bone
 * carrying four slots — a head with its eye, its mouth and its goggles — is fitted
 * once against all four rather than four times against one each. The parts are
 * pooled by their visible weight, which is the honest weighting: a bone whose head
 * is most of the way visible and whose eye is a sliver is mostly told by the head.
 */
function boneResidual(bp: BonePlace, targets: Target[], level: Level, plate: Plate, smooth: boolean): number {
  let acc = 0;
  let denom = 0;
  for (const target of targets) {
    if (target.weight <= 0) continue;
    const s = target.samples;
    const pl = partPlaceOf(bp, target.geometry, target.plate.width);
    const cos = Math.cos(pl.rotDeg * DEG) * pl.scale;
    const sin = Math.sin(pl.rotDeg * DEG) * pl.scale;
    for (let i = 0; i < s.count; i++) {
      if (target.flags[i] === 0) continue;
      const fx = pl.cx + s.u[i] * cos - s.v[i] * sin;
      const fy = pl.cy + s.u[i] * sin + s.v[i] * cos;
      acc +=
        s.w[i] *
        (smooth
          ? errBilinear(level, plate, fx, fy, s.r[i], s.g[i], s.b[i])
          : errNearest(level, fx, fy, s.r[i], s.g[i], s.b[i]));
    }
    denom += target.weight;
  }
  return denom > 0 ? acc / denom : 1;
}

/** One answer mid-search: the two residual degrees of freedom and what they scored. */
interface HingeCandidate {
  hingeDeg: number;
  stretch: number;
  residual: number;
}

/**
 * Pattern search on the residual degrees of freedom: probe, take the best
 * improvement, halve the steps when none of them improves.
 *
 * The sweep has already done the part a local method cannot — with one degree of
 * freedom, "find the right basin" is an exhaustive scan of a line, which is why
 * this file can afford the whole turn as its default window.
 */
function polishHinge(
  start: HingeCandidate,
  targets: Target[],
  level: Level,
  plate: Plate,
  parent: BonePlace,
  bone: SpineBone,
  stretchBounds: { min: number; max: number },
  /**
   * The hinge window the report declares.
   *
   * ⚠️ Clamped here for the same reason `pose`'s polish clamps its scale: a
   * refinement free to walk outside the window would report an answer nobody
   * searched, and the window is a reported field a caller is entitled to read as
   * a promise. A full turn contains every angle, so it is left unclamped and the
   * hinge may wrap.
   */
  hingeBounds: { min: number; max: number; wraps: boolean },
): HingeCandidate {
  const at = (hingeDeg: number, stretch: number): number =>
    boneResidual(childPlace(parent, bone, hingeDeg, stretch), targets, level, plate, true);
  const clamp = (v: number): number => Math.min(stretchBounds.max, Math.max(stretchBounds.min, v));
  const hold = (v: number): number =>
    hingeBounds.wraps ? v : Math.min(hingeBounds.max, Math.max(hingeBounds.min, v));
  let cur: HingeCandidate = { ...start, residual: at(start.hingeDeg, start.stretch) };
  let dh = HINGE_STEP;
  let ds = stretchBounds.max > stretchBounds.min ? 0.04 : 0;
  for (let guard = 0; guard < 200; guard++) {
    if (dh <= 0.02 && ds <= 0.002) break;
    let best = cur;
    const probe = (hingeDeg: number, stretch: number): void => {
      const residual = at(hingeDeg, stretch);
      if (residual < best.residual) best = { hingeDeg, stretch, residual };
    };
    if (dh > 0.02) {
      probe(hold(cur.hingeDeg + dh), cur.stretch);
      probe(hold(cur.hingeDeg - dh), cur.stretch);
    }
    if (ds > 0.002) {
      probe(cur.hingeDeg, clamp(cur.stretch * (1 + ds)));
      probe(cur.hingeDeg, clamp(cur.stretch * (1 - ds)));
    }
    if (best === cur) {
      dh /= 2;
      ds /= 2;
      continue;
    }
    cur = best;
  }
  return cur;
}

/** The hinge ladder, with a full turn's duplicate endpoint dropped. */
function hingeLadder(minDeg: number, maxDeg: number): number[] {
  const span = maxDeg - minDeg;
  if (span <= 0) return [minDeg];
  if (span >= 360 - 1e-9) {
    const count = Math.round(360 / HINGE_STEP);
    const out: number[] = [];
    for (let i = 0; i < count; i++) out.push(minDeg + (i * 360) / count);
    return out;
  }
  const out: number[] = [];
  for (let deg = minDeg; deg <= maxDeg + 1e-9; deg += HINGE_STEP) out.push(deg);
  if (out[out.length - 1] < maxDeg - 1e-9) out.push(maxDeg);
  return out;
}

function stretchLadder(bounds: { min: number; max: number }): number[] {
  if (bounds.max <= bounds.min) return [1];
  const out: number[] = [];
  for (let i = 0; i <= STRETCH_STEPS; i++) out.push(bounds.min * (bounds.max / bounds.min) ** (i / STRETCH_STEPS));
  return out;
}

/**
 * Every basin on the hinge line, best first.
 *
 * 🚨 Local minima rather than the global best alone, and per stretch rung rather
 * than pooled — the same reason `pose` keeps its coarse scale fields apart. A limb
 * that explains the picture pointing forwards and again pointing back is two
 * answers, and an instrument that reports one of them has picked without saying so.
 */
function hingeMinima(sweep: HingeCandidate[], wraps: boolean): HingeCandidate[] {
  const out: HingeCandidate[] = [];
  const n = sweep.length;
  for (let i = 0; i < n; i++) {
    const prev = i === 0 ? (wraps ? sweep[n - 1] : null) : sweep[i - 1];
    const next = i === n - 1 ? (wraps ? sweep[0] : null) : sweep[i + 1];
    if (prev !== null && prev.residual < sweep[i].residual) continue;
    if (next !== null && next.residual < sweep[i].residual) continue;
    out.push(sweep[i]);
  }
  if (out.length === 0 && n > 0) out.push(sweep.reduce((a, b) => (b.residual < a.residual ? b : a)));
  return out.sort((a, b) => a.residual - b.residual);
}

// ---------------------------------------------------------------------------
// measuring the answer
// ---------------------------------------------------------------------------

interface Measured {
  residual: number;
  visibleShare: number;
  scoredPixels: number;
  unexplained: number;
  offCanvas: number;
  footprint: number;
  bbox: { x: number; y: number; width: number; height: number };
}

/**
 * The reported numbers, over EVERY visible pixel of the part rather than a sample
 * of them — and over the frozen set, which is the set the search minimised.
 */
function measure(part: Plate, pl: PartPlace, frozen: VisibleSet, level: Level, plate: Plate): Measured {
  const cos = Math.cos(pl.rotDeg * DEG) * pl.scale;
  const sin = Math.sin(pl.rotDeg * DEG) * pl.scale;
  let acc = 0;
  let unexplained = 0;
  let onMaterial = 0;
  let off = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < part.height; y++) {
    for (let x = 0; x < part.width; x++) {
      const i = (y * part.width + x) * 4;
      const a = part.data[i + 3];
      if (a === 0) continue;
      const w = a / 255;
      const u = x + 0.5 - part.width / 2;
      const v = y + 0.5 - part.height / 2;
      const fx = pl.cx + u * cos - v * sin;
      const fy = pl.cy + u * sin + v * cos;
      if (fx < minX) minX = fx;
      if (fx > maxX) maxX = fx;
      if (fy < minY) minY = fy;
      if (fy > maxY) maxY = fy;
      const inside = fx >= 0 && fy >= 0 && fx < level.width && fy < level.height;
      if (!inside) off += w;
      if (frozen.keep[y * part.width + x] === 0) continue;
      const err = errBilinear(level, plate, fx, fy, part.data[i], part.data[i + 1], part.data[i + 2]);
      acc += w * err;
      if (err > UNEXPLAINED_TOLERANCE) unexplained += w;
      if (inside) {
        const ix = Math.min(level.width - 1, Math.floor(fx));
        const iy = Math.min(level.height - 1, Math.floor(fy));
        onMaterial += w * (plate.data[(iy * level.width + ix) * 4 + 3] / 255);
      }
    }
  }
  const denom = frozen.weight > 0 ? frozen.weight : 1;
  const total = frozen.total > 0 ? frozen.total : 1;
  return {
    residual: frozen.weight > 0 ? acc / denom : 1,
    visibleShare: frozen.weight / total,
    scoredPixels: frozen.pixels,
    unexplained: frozen.weight > 0 ? unexplained / denom : 1,
    offCanvas: off / total,
    // One part pixel covers `scale²` frame pixels, so this is the frame area the
    // placement accounts for over the pixels it was allowed to claim.
    footprint: onMaterial * pl.scale * pl.scale,
    bbox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
  };
}

function toPlacement(
  pl: PartPlace,
  link: { hingeDeg: number; stretch: number } | null,
  setupRotation: number,
  stats: Measured,
  visibleShareAtFit: number,
): ChainFitPlacement {
  return {
    x: roundTo(pl.cx, 3),
    y: roundTo(pl.cy, 3),
    rotationDeg: roundTo(normaliseDegrees(pl.rotDeg), 3),
    scale: roundTo(pl.scale, 5),
    hingeDeg: link === null ? null : roundTo(normaliseDegrees(link.hingeDeg), 3),
    localRotationDeg: link === null ? null : roundTo(normaliseDegrees(setupRotation + link.hingeDeg), 3),
    stretch: link === null ? null : roundTo(link.stretch, 5),
    residual: roundTo(stats.residual, 5),
    visibleShare: roundTo(stats.visibleShare, 4),
    scoredPixels: stats.scoredPixels,
    visibleShareAtFit: roundTo(visibleShareAtFit, 4),
    unexplained: roundTo(stats.unexplained, 4),
    offCanvas: roundTo(stats.offCanvas, 4),
    footprint: roundTo(stats.footprint, 1),
    bbox: {
      x: roundTo(stats.bbox.x, 2),
      y: roundTo(stats.bbox.y, 2),
      width: roundTo(stats.bbox.width, 2),
      height: roundTo(stats.bbox.height, 2),
    },
  };
}

// ---------------------------------------------------------------------------
// the anchor
// ---------------------------------------------------------------------------

/** One part's anchor-pass answer, in the shape the walk needs it. */
interface AnchorEntry {
  place: PartPlace;
  verdict: ChainFitAnchorVerdict;
}

function readAnchorFile(path: string): PoseReport {
  if (!existsSync(path)) throw new ChainFitError(`no anchor report at ${path}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new ChainFitError(`cannot parse the anchor report ${path} as JSON: ${(err as Error).message}`);
  }
  const report = parsed as PoseReport;
  if (report?.spec !== POSE_SPEC) {
    throw new ChainFitError(
      `${path} declares spec ${JSON.stringify(report?.spec ?? null)}; --anchor takes a ${POSE_SPEC} report, ` +
        'which is what `rigc pose --out` writes',
    );
  }
  if (!Array.isArray(report.parts)) throw new ChainFitError(`${path} carries no parts array`);
  return report;
}

/** An anchor report folded into per-part entries, keyed by PNG file name. */
function anchorEntries(
  report: PoseReport,
  criterion: { maxResidual: number; maxUnexplained: number },
): Map<string, AnchorEntry> {
  const out = new Map<string, AnchorEntry>();
  for (const part of report.parts) {
    if (part.placement === null) continue;
    const p = part.placement;
    const eligible =
      part.refusal === null &&
      !part.ambiguous &&
      p.residual <= criterion.maxResidual &&
      p.unexplained <= criterion.maxUnexplained;
    out.set(basename(part.part), {
      place: { cx: p.x, cy: p.y, rotDeg: p.rotationDeg, scale: p.scale },
      verdict: { residual: p.residual, unexplained: p.unexplained, ambiguous: part.ambiguous, eligible },
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// the instrument
// ---------------------------------------------------------------------------

/** The mutable state of one part across the passes. */
interface PartState {
  drawn: DrawnSlot;
  path: string;
  plate: Plate | null;
  /** Why nothing was searched, when nothing was. */
  blocked: ChainFitRefusal | null;
  place: PartPlace | null;
  /** The visible set the search was scored on, frozen before it ran. */
  frozen: VisibleSet | null;
  /** The link its bone ended up on, or `null` where the quantity does not exist. */
  link: { hingeDeg: number; stretch: number } | null;
  /** Its bone's visible set had to be relocated by an unmasked look before it froze. */
  relocated: boolean;
  /**
   * This part IS the one its bone's anchor was read from.
   *
   * ⭐ The distinction the refusals turn on. Three kinds of placement live in one
   * report: the anchor's own, which came from the anchor pass and was not searched
   * here; the other parts on an anchored bone, whose placement is the RIG's and is
   * therefore a real measurement of it; and the chain's, which was searched. This
   * instrument refuses the last two and does not second-guess the first — an
   * `occluded` refusal says "a search over a sliver is not a measurement", and no
   * search happened. Its trust signal is `anchorVerdict`, which is the pass's own.
   */
  isAnchorSource: boolean;
  alternates: { place: PartPlace; link: { hingeDeg: number; stretch: number } }[];
  role: 'anchor' | 'chain' | 'unplaced';
}

export function estimateChainFit(options: ChainFitOptions): ChainFitReport {
  const skeletonPath = resolveSkeletonPath(options.candidatePath);
  const framePath = resolve(options.framePath);
  const imagesDir = resolve(options.imagesDir);
  if (!existsSync(framePath)) throw new ChainFitError(`no pose frame at ${framePath}`);
  if (!existsSync(imagesDir) || !statSync(imagesDir).isDirectory()) {
    throw new ChainFitError(`${imagesDir} is not a directory — --images takes the directory the part PNGs are in`);
  }
  if (options.anchorPath !== undefined && (options.scale !== undefined || options.rotation !== undefined)) {
    throw new ChainFitError(
      '--scale and --rotation size the internal anchor pass, and --anchor means there is no internal pass; ' +
        'give those two to `rigc pose` when you make the report instead',
    );
  }
  let frame: Plate;
  try {
    frame = readPlate(framePath);
  } catch (err) {
    throw new ChainFitError(`cannot read the pose frame ${framePath}: ${(err as Error).message}`);
  }

  const skel = readSkeleton(skeletonPath);
  const bones = new Map<string, SpineBone>(skel.bones.map((b) => [b.name, b]));
  const boneOrder = skel.bones.map((b) => b.name);
  const unsupported = unsupportedBones(skel.bones);
  const keyed = keyedProperties(skel);

  const hingeMin = options.hinge?.minDeg ?? DEFAULT_HINGE_MIN;
  const hingeMax = options.hinge?.maxDeg ?? DEFAULT_HINGE_MAX;
  const hinges = hingeLadder(hingeMin, hingeMax);
  const wraps = hingeMax - hingeMin >= 360 - 1e-9;
  const stretchRatio = options.stretch ?? DEFAULT_STRETCH_RATIO;
  const stretchEverywhere = options.stretch !== undefined;
  const minVisible = options.minVisible ?? DEFAULT_MIN_VISIBLE;
  const maxResidual = options.maxResidual ?? DEFAULT_MAX_RESIDUAL;
  const passes = Math.max(1, Math.round(options.passes ?? DEFAULT_PASSES));
  const criterion = {
    maxResidual: options.anchorMaxResidual ?? ANCHOR_MAX_RESIDUAL,
    maxUnexplained: options.anchorMaxUnexplained ?? ANCHOR_MAX_UNEXPLAINED,
  };

  // --- what the candidate draws, in its own order --------------------------
  const drawn: DrawnSlot[] = [];
  const undrawn: string[] = [];
  const blockedSlots: { slot: string; why: string }[] = [];
  for (const slot of skel.slots) {
    if (slot.attachment === undefined) {
      undrawn.push(slot.name);
      continue;
    }
    const resolved = resolveAttachment(skel, slot.name, slot.attachment);
    if (resolved === null) {
      undrawn.push(slot.name);
      continue;
    }
    if ('unsupported' in resolved) {
      blockedSlots.push({ slot: slot.name, why: resolved.unsupported });
      continue;
    }
    drawn.push({
      slot: slot.name,
      bone: slot.bone,
      attachment: slot.attachment,
      image: resolved.image,
      geometry: resolved.geometry,
    });
  }
  if (drawn.length === 0) {
    throw new ChainFitError(
      `${skeletonPath} poses no region attachment in its setup pose — a chain fit places region attachments, and ` +
        'this candidate has none to place',
    );
  }

  // --- the parts, and the states that carry them ---------------------------
  const states: PartState[] = [];
  const plateCache = new Map<string, Plate | null>();
  for (const slot of drawn) {
    const path = join(imagesDir, `${slot.image}.png`);
    const state: PartState = {
      drawn: slot,
      path,
      plate: null,
      blocked: null,
      place: null,
      frozen: null,
      link: null,
      relocated: false,
      isAnchorSource: false,
      alternates: [],
      role: 'unplaced',
    };
    const boneBlock = unsupported.get(slot.bone);
    if (!bones.has(slot.bone)) {
      state.blocked = {
        reason: 'unsupported-geometry',
        detail: `slot "${slot.slot}" hangs off bone "${slot.bone}", which the skeleton does not declare`,
      };
    } else if (boneBlock !== undefined) {
      state.blocked = { reason: 'unsupported-geometry', detail: `bone "${slot.bone}": ${boneBlock}` };
    } else {
      const plate = loadPart(path, plateCache);
      if (typeof plate === 'string') {
        state.blocked = { reason: 'no-part-image', detail: plate };
      } else if (!hasMaterial(plate)) {
        state.blocked = {
          reason: 'empty-part',
          detail: `${basename(path)} is ${plate.width}x${plate.height} and every pixel of it is transparent`,
        };
      } else {
        state.plate = plate;
      }
    }
    states.push(state);
  }

  // --- the frame, as the objective reads it --------------------------------
  const background = readBackground(frame);
  const material = materialPlate(frame, background);
  background.materialShare = roundTo(material.share, 4);
  const level = levelOf(material.plate, 1);

  // --- the anchor ----------------------------------------------------------
  const anchorSource: 'pose' | 'file' = options.anchorPath === undefined ? 'pose' : 'file';
  const partPaths = [...new Set(states.filter((s) => s.plate !== null).map((s) => s.path))].sort();
  const anchorReport =
    options.anchorPath === undefined
      ? // ⭐ The internal anchor pass IS `pose`, over exactly the parts this
        // candidate draws — not a second estimator with the same job. `--anchor`
        // is the same call made earlier and saved.
        estimatePose({ imagesDir, framePath, parts: partPaths, scale: options.scale, rotation: options.rotation })
      : readAnchorFile(options.anchorPath);
  const anchors = anchorEntries(anchorReport, criterion);

  const anchorForBone = new Map<string, { state: PartState; entry: AnchorEntry }>();
  for (const state of states) {
    if (state.plate === null) continue;
    const entry = anchors.get(basename(state.path));
    if (entry === undefined || !entry.verdict.eligible) continue;
    const held = anchorForBone.get(state.drawn.bone);
    // A bone carrying several drawn parts is anchored by the one the pass trusts
    // most, because they cannot all be right and the residual is the tie-break.
    if (held === undefined || entry.verdict.residual < held.entry.verdict.residual) {
      anchorForBone.set(state.drawn.bone, { state, entry });
    }
  }

  // --- the walk ------------------------------------------------------------
  const placedBones = new Map<string, BonePlace>();
  const depthOf = new Map<string, number>();
  const anchoredTo = new Map<string, string>();
  const carried = new Map<string, string[]>();
  const pivotDisagreement = new Map<string, number>();
  const targetsOfBone = new Map<string, PartState[]>();
  for (const state of states) {
    if (state.plate === null) continue;
    const list = targetsOfBone.get(state.drawn.bone) ?? [];
    list.push(state);
    targetsOfBone.set(state.drawn.bone, list);
  }

  /** Where the rig currently puts a part, given the placed bones. */
  const placeOf = (state: PartState): PartPlace | null => {
    const bp = placedBones.get(state.drawn.bone);
    if (bp === undefined || state.plate === null) return null;
    return partPlaceOf(bp, state.drawn.geometry, state.plate.width);
  };

  /** Seed every bone: anchored bones from their anchor, the rest from the rig itself. */
  const seedBones = (): void => {
    for (const name of boneOrder) {
      const bone = bones.get(name);
      if (bone === undefined || unsupported.has(name)) continue;
      const anchor = anchorForBone.get(name);
      const parentPlace = bone.parent === undefined ? undefined : placedBones.get(bone.parent);
      const chainPlace = parentPlace === undefined ? null : childPlace(parentPlace, bone, 0, 1);
      if (anchor !== undefined && anchor.state.plate !== null) {
        const place = bonePlaceFromPart(anchor.entry.place, anchor.state.drawn.geometry, anchor.state.plate.width);
        placedBones.set(name, place);
        depthOf.set(name, 0);
        anchoredTo.set(name, name);
        carried.set(name, []);
        if (chainPlace !== null) {
          pivotDisagreement.set(name, Math.hypot(chainPlace.x - place.x, chainPlace.y - place.y));
        }
        continue;
      }
      if (chainPlace === null || bone.parent === undefined) continue;
      placedBones.set(name, chainPlace);
      depthOf.set(name, (depthOf.get(bone.parent) ?? 0) + 1);
      const root = anchoredTo.get(bone.parent);
      if (root !== undefined) anchoredTo.set(name, root);
      const inherited = carried.get(bone.parent) ?? [];
      const fittable = (targetsOfBone.get(name) ?? []).length > 0;
      carried.set(name, fittable ? inherited : [...inherited, name]);
    }
  };

  /**
   * The union of everything drawn AFTER each of the named parts, at wherever those
   * later parts currently sit.
   *
   * 🚨 Rebuilt for each bone the moment before that bone is fitted, and NOT once
   * per pass — this is the difference between the instrument working on a stance
   * and not. Building every mask from the rig's setup prediction seems equivalent
   * and is not: a setup pose has the arms hanging down the body, so the first pass
   * masks a thigh with an arm that is not there. Measured on `ess/idle/f0000`,
   * `front-thigh` came back 4.5% visible, was searched over 202 pixels and landed
   * 78° out; with the mask refreshed from the arm's own fitted placement — the arm
   * bones are declared before the thighs, so they are already fitted by then — the
   * same part reads 71% visible and lands on the leg. What remains order-dependent
   * is what `passes` is for.
   *
   * Walked in reverse draw order with one running union, so the union holds
   * exactly the later-drawn parts at each snapshot, and one frame-sized array is
   * all it costs however many parts there are.
   */
  const coversFor = (indices: number[]): Map<number, Uint8Array> => {
    const out = new Map<number, Uint8Array>();
    if (indices.length === 0) return out;
    const wanted = new Set(indices);
    const lowest = Math.min(...indices);
    const cover = new Uint8Array(frame.width * frame.height);
    for (let i = states.length - 1; i >= lowest; i--) {
      if (wanted.has(i)) out.set(i, cover.slice());
      const state = states[i];
      if (state.plate === null || state.place === null) continue;
      stampCover(cover, frame.width, frame.height, state.plate, state.place);
    }
    return out;
  };
  const indexOfState = new Map<PartState, number>();
  states.forEach((state, i) => indexOfState.set(state, i));

  const samplesCache = new Map<string, Samples>();
  const samplesFor = (state: PartState, plate: Plate, scale: number): Samples => {
    // The part is reduced to about the frame's own resolution before it is
    // sampled — comparing full-resolution art against a frame drawn at a fifth of
    // it charges the frame's own downsampling on every edge pixel.
    const mip = Math.max(0, Math.min(8, Math.round(Math.log2(1 / Math.max(1e-6, scale)))));
    const key = `${state.path}:${mip}`;
    const hit = samplesCache.get(key);
    if (hit !== undefined) return hit;
    let reduced = plate;
    for (let i = 0; i < mip; i++) reduced = halvePlate(reduced);
    const built = buildSamples(reduced, 2 ** mip, plate.width / 2, plate.height / 2, SEARCH_SAMPLES);
    samplesCache.set(key, built);
    return built;
  };

  for (let pass = 0; pass < passes; pass++) {
    if (pass === 0) {
      seedBones();
      for (const state of states) state.place = placeOf(state);
    }
    // Pass 0 seeds every chain bone on the rig's own prediction from the anchors;
    // every later pass seeds on the previous pass's answers, which is what makes
    // the frozen visible set and the answer converge on the same place.

    for (const name of boneOrder) {
      const bone = bones.get(name);
      if (bone === undefined || unsupported.has(name) || anchorForBone.has(name)) continue;
      const parentPlace = bone.parent === undefined ? undefined : placedBones.get(bone.parent);
      if (parentPlace === undefined) continue;
      const boneTargets = targetsOfBone.get(name) ?? [];
      const stretchFree = stretchEverywhere || (keyed.get(name)?.has('scale') ?? false);
      const stretchBounds = stretchFree ? { min: 1 / stretchRatio, max: stretchRatio } : { min: 1, max: 1 };

      // The occluders do not move while this bone is fitted, so one snapshot per
      // bone serves both the seed below and the freeze after it.
      const covers = coversFor(boneTargets.map((s) => indexOfState.get(s) ?? 0));

      /**
       * Freeze the bone's parts where they currently sit, and report how much of
       * the bone that leaves scoreable.
       *
       * ⭐ Frozen HERE: the visible set is decided once, before the search, and
       * the search cannot change it. A denominator the search can shrink turns
       * "explain these pixels" into "cover yourself up", and the cheapest move is
       * then to slide behind the occluder until a handful of agreeing pixels are
       * all that is scored — measured, that produced parts reporting an 8–20%
       * visible share with a confident residual at rotations 100–140° out on an
       * upright stance.
       */
      const freezeHere = (): { targets: Target[]; visible: number; whole: number } => {
        const targets: Target[] = [];
        let visible = 0;
        let whole = 0;
        for (const state of boneTargets) {
          const cover = covers.get(indexOfState.get(state) ?? -1);
          if (state.plate === null || cover === undefined || state.place === null) continue;
          const set = visibleMask(state.plate, state.place, cover, frame.width, frame.height);
          state.frozen = set;
          visible += set.weight;
          whole += set.total;
          const samples = samplesFor(state, state.plate, state.place.scale);
          const kept = keptSamples(samples, set.keep, state.plate);
          targets.push({
            geometry: state.drawn.geometry,
            plate: state.plate,
            samples,
            flags: kept.flags,
            weight: kept.weight,
          });
        }
        return { targets, visible, whole };
      };

      /** The same parts with nothing masked out — every pixel of them scoreable. */
      const bareTargets = (): Target[] => {
        const out: Target[] = [];
        for (const state of boneTargets) {
          if (state.plate === null || state.place === null) continue;
          const samples = samplesFor(state, state.plate, state.place.scale);
          out.push({
            geometry: state.drawn.geometry,
            plate: state.plate,
            samples,
            flags: new Uint8Array(samples.count).fill(1),
            weight: samples.weight,
          });
        }
        return out;
      };

      /** The best hinge on one set of targets, found by sweeping and refining. */
      const searchOver = (targets: Target[]): HingeCandidate[] => {
        const seeds: HingeCandidate[] = [];
        for (const stretch of stretchLadder(stretchBounds)) {
          const rung: HingeCandidate[] = hinges.map((hingeDeg) => ({
            hingeDeg,
            stretch,
            residual: boneResidual(
              childPlace(parentPlace, bone, hingeDeg, stretch),
              targets,
              level,
              material.plate,
              false,
            ),
          }));
          seeds.push(...hingeMinima(rung, wraps).slice(0, MINIMA_PER_RUNG));
        }
        seeds.sort((a, b) => a.residual - b.residual);
        return seeds
          .slice(0, POLISH_CANDIDATES)
          .map((seed) =>
            polishHinge(seed, targets, level, material.plate, parentPlace, bone, stretchBounds, {
              min: hingeMin,
              max: hingeMax,
              wraps,
            }),
          )
          .sort((a, b) => a.residual - b.residual);
      };

      /** Move the bone, and its parts with it. */
      const put = (cand: HingeCandidate): void => {
        placedBones.set(name, childPlace(parentPlace, bone, cand.hingeDeg, cand.stretch));
        for (const state of boneTargets) state.place = placeOf(state);
      };

      let frozenHere = freezeHere();
      let relocated = false;
      // 🚨 A part the RIG predicts is invisible would otherwise never be looked
      // for. The seed of the first pass is the candidate's own setup, and a setup
      // pose routinely hides a limb the frame shows — a spineboy setup has both
      // arms hanging down the body, so the thigh's visible set freezes at 4% and a
      // search over 202 pixels lands 78° out. So a bone whose frozen share is
      // under the floor gets ONE unmasked look first — `pose`'s own question,
      // restricted to this arc — purely to decide WHERE to freeze. The answer is
      // then re-searched with the mask in place, so nothing is ever ranked on a
      // denominator the search could shrink.
      if (frozenHere.visible < minVisible * frozenHere.whole) {
        const bare = bareTargets();
        if (bare.some((t) => t.weight > 0)) {
          const relocation = searchOver(bare);
          const before = { place: boneTargets.map((st) => st.place), visible: frozenHere.visible };
          if (relocation.length > 0) {
            put(relocation[0]);
            const after = freezeHere();
            // ⚠️ Kept only if it actually helped. An unmasked look at a part that
            // is genuinely behind something reads the occluder and can land
            // somewhere even more covered than the rig's guess; taking that would
            // trade a useful fallback — "the chain put it here" — for a wandered
            // number, and the refusal below would then name a placement nobody
            // has a reason to believe.
            if (after.visible > before.visible) {
              frozenHere = after;
              relocated = true;
              for (const state of boneTargets) {
                state.link = { hingeDeg: relocation[0].hingeDeg, stretch: relocation[0].stretch };
              }
            } else {
              put({ hingeDeg: 0, stretch: 1, residual: 1 });
              boneTargets.forEach((st, i) => {
                st.place = before.place[i];
              });
              frozenHere = freezeHere();
            }
          }
        }
      }

      // ⚠️ Still under the floor after that look: nothing more is searched, and
      // what gets reported is where the chain put it. The honest answer there is
      // "the chain put it here and the pixels could not confirm it", which is what
      // the `occluded` refusal says — and the placement is printed anyway.
      if (frozenHere.targets.every((t) => t.weight <= 0) || frozenHere.visible < minVisible * frozenHere.whole) {
        if (!relocated) put({ hingeDeg: 0, stretch: 1, residual: 1 });
        for (const state of boneTargets) {
          state.role = 'chain';
          state.alternates = [];
          state.relocated = relocated;
          if (!relocated) state.link = { hingeDeg: 0, stretch: 1 };
        }
        continue;
      }

      const polished = searchOver(frozenHere.targets);
      const distinct: HingeCandidate[] = [];
      for (const cand of polished) {
        const same = distinct.some(
          (d) =>
            Math.abs(normaliseDegrees(d.hingeDeg - cand.hingeDeg)) <= AMBIGUITY_HINGE_DEG &&
            Math.abs(Math.log(d.stretch / cand.stretch)) <= Math.log(1.03),
        );
        if (!same) distinct.push(cand);
      }

      put(distinct[0]);
      for (const state of boneTargets) {
        state.role = 'chain';
        state.link = { hingeDeg: distinct[0].hingeDeg, stretch: distinct[0].stretch };
        state.relocated = relocated;
        state.alternates =
          state.plate === null
            ? []
            : distinct.slice(1, 1 + MAX_ALTERNATES).map((cand) => ({
                place: partPlaceOf(
                  childPlace(parentPlace, bone, cand.hingeDeg, cand.stretch),
                  state.drawn.geometry,
                  (state.plate as Plate).width,
                ),
                link: { hingeDeg: cand.hingeDeg, stretch: cand.stretch },
              }));
      }
    }

    // Anchored parts keep the anchor's own placement — nothing here re-fits it.
    // The LINK is still derived where the parent is placed, because "what local
    // rotation does this anchor imply" is a number the caller wants and the chain
    // above it can answer.
    for (const state of states) {
      if (state.plate === null) continue;
      const anchor = anchorForBone.get(state.drawn.bone);
      if (anchor === undefined) continue;
      const bonePlace = placedBones.get(state.drawn.bone);
      const bone = bones.get(state.drawn.bone);
      state.role = 'anchor';
      state.isAnchorSource = anchor.state === state;
      state.place = state.isAnchorSource ? anchor.entry.place : placeOf(state);
      const parentPlace =
        bone === undefined || bone.parent === undefined ? undefined : placedBones.get(bone.parent);
      state.link =
        bone !== undefined && bonePlace !== undefined && parentPlace !== undefined
          ? linkOf(parentPlace, bonePlace, bone)
          : null;
    }
  }

  // What each part shows WHERE IT LANDED, as opposed to where its visible set was
  // frozen. One reverse-draw-order sweep over the fitted placements, and it does
  // double duty: it is `visibleShareAtFit` for a fitted part, and it IS the frozen
  // set for a part nothing searched — an anchor's placement is its own seed, so
  // "frozen at the seed" and "measured where it landed" are the same set there.
  const shareAtFit = new Map<string, number>();
  {
    const cover = new Uint8Array(frame.width * frame.height);
    for (let i = states.length - 1; i >= 0; i--) {
      const state = states[i];
      if (state.plate === null || state.place === null) continue;
      const set = visibleMask(state.plate, state.place, cover, frame.width, frame.height);
      shareAtFit.set(state.drawn.slot, set.total > 0 ? set.weight / set.total : 0);
      if (state.frozen === null) state.frozen = set;
      stampCover(cover, frame.width, frame.height, state.plate, state.place);
    }
  }

  // --- the report ----------------------------------------------------------
  const report: ChainFitReport = {
    spec: CHAINFIT_SPEC,
    space:
      'frame pixels, y down, origin top-left. (x, y) is where the part image\'s own centre lands; rotationDeg is ' +
      'screen degrees, positive clockwise; scale is frame pixels per part pixel. Reconstruct a part pixel p as ' +
      'centre + scale * R(rotationDeg) * (p - (width/2, height/2)) — the same contract a rigc-pose report ' +
      'carries. hingeDeg and localRotationDeg are SPINE degrees (CCW, y up) instead, because they are timeline ' +
      'values: what a rotate key would carry. src/transform.ts converts between the two (screenToSpineDegrees, ' +
      'cropToSpineY).',
    candidate: {
      skeleton: skeletonPath,
      skins: skel.skins.map((s) => s.name),
      bones: skel.bones.length,
      slots: skel.slots.length,
      drawn: drawn.length,
      drawOrder: drawn.map((d) => d.slot),
    },
    images: imagesDir,
    frame: { path: framePath, width: frame.width, height: frame.height, background },
    anchor: {
      source: anchorSource,
      path: options.anchorPath === undefined ? null : resolve(options.anchorPath),
      criterion: { ...criterion, requireUnambiguous: true },
      anchored: [...anchorForBone.values()].map((a) => basename(a.state.path)).sort(),
    },
    search: {
      hinge: { minDeg: hingeMin, maxDeg: hingeMax, stepDeg: HINGE_STEP, steps: hinges.length },
      stretch: {
        ratio: stretchRatio,
        steps: STRETCH_STEPS,
        freeFrom: stretchEverywhere
          ? 'every bone, because --stretch was named'
          : "the candidate's own bone `scale` timelines",
      },
      minVisible,
      maxResidual,
      ambiguity: { absolute: AMBIGUITY_ABSOLUTE, relative: AMBIGUITY_RELATIVE, hingeDeg: AMBIGUITY_HINGE_DEG },
      passes,
      occluderAlpha: OCCLUDER_ALPHA,
    },
    caveats: [
      'No number here is a score and none of them has a pass bar. This reads a given condition — the pose you ' +
        'were handed — into spec coordinates an agent then states by construction. The residual and ' +
        '`visibleShare` say how far to trust a placement and where two answers are equally good.',
      'Every residual is over the part\'s VISIBLE pixels: what nothing drawn after it in the candidate\'s own ' +
        'setup draw order covered. That is the whole difference from `rigc pose`, whose residuals are charged for ' +
        'the occluder — so the two are NOT the same number on an occluded part, and this one always has to be read ' +
        'next to `visibleShare`. A low residual on a 0.08 share is a confident statement about a sliver.',
      'The occlusion is the CANDIDATE\'s, not the picture\'s, and so is the geometry. A wrong draw order masks the ' +
        'wrong pixels, and a joint offset the rig gets wrong moves the pivot every hinge below it turns about — an ' +
        'answer here is only as good as the structure it was read through. `pivotDisagreementPx` on an anchored ' +
        'bone is the one direct measurement of that: how far the rig\'s own prediction of the joint sits from ' +
        'where the anchor found it.',
      'Setup draw order, on one frame. A `drawOrder` timeline reorders the slots at runtime and this cannot know ' +
        'the time, so a candidate that has one is masked in the order its setup pose declares.',
      'The hinge is searched; the pivot is NOT. A bone the candidate keys a `translate` timeline on carries ' +
        '`dof.pivotFree`, which means the arc this answer sits on has a centre the rig itself moves — the ' +
        'placement is still read off pixels, but `localRotationDeg` alone will not reproduce it.',
      'The walk goes OUTWARD from an anchor, so a limb with no trusted part on it or above it is refused ' +
        '`no-anchor` rather than guessed at. An anchor fixes its own bone completely; it says nothing about what ' +
        'the link above it did, so nothing above an anchor is recoverable from it.',
      'An `ambiguous` part has two or more hinge answers this instrument cannot separate — a limb that explains ' +
        'the picture forwards and again backwards. All of them are reported and none was picked.',
      'A part refused `occluded` is refused because too little of it survives the parts in front of it, and the ' +
        'best placement found is still in `placement`: the chain put it there and the pixels did not confirm it. ' +
        'A refusal names why not to trust a number; it does not hide it.',
      'An ANCHOR can be refused too, and it is not a contradiction: the anchor pass judged the placement over ' +
        "the part's WHOLE footprint — all `pose` can see, and blind to what covers it — while this instrument has " +
        'measured how much of the part is visible at all. A refused anchor means the placement may well be right ' +
        'and the CONFIRMATION is missing, and every part whose `anchoredTo` names that bone rests on it. ' +
        '`anchorVerdict` carries the pass\'s own numbers so the two readings can be compared rather than merged.',
    ],
    parts: [],
  };

  if (undrawn.length > 0) {
    report.caveats.push(
      `${undrawn.length} slot(s) hold no region this run could resolve in the setup pose, so they were neither ` +
        `placed nor treated as occluders: ${undrawn.join(', ')}.`,
    );
  }
  for (const { slot, why } of blockedSlots) {
    report.caveats.push(`slot "${slot}" was neither placed nor treated as an occluder: ${why}.`);
  }
  const unplacedOccluders = states.filter((s) => s.plate === null || s.place === null).map((s) => s.drawn.slot);
  if (unplacedOccluders.length > 0) {
    report.caveats.push(
      `${unplacedOccluders.length} drawn slot(s) could not be placed, so they masked nothing and every part ` +
        `behind them is reported MORE visible than the picture shows: ${unplacedOccluders.join(', ')}.`,
    );
  }
  if (Object.values(skel.animations ?? {}).some((a) => Array.isArray(a.drawOrder) && a.drawOrder.length > 0)) {
    report.caveats.push(
      'the candidate carries a `drawOrder` timeline, so the order the masks were built in is its setup order and ' +
        'not necessarily the order this frame was drawn in.',
    );
  }
  if (skel.constraints !== undefined && skel.constraints.length > 0) {
    report.caveats.push(
      `the candidate declares ${skel.constraints.length} constraint(s) (${skel.constraints
        .map((c) => `${c.name}:${c.type}`)
        .join(', ')}). A constraint moves bones after their local transforms are composed, so a fitted ` +
        '`localRotationDeg` here is a placement, not necessarily a value you can key and reproduce.',
    );
  }

  const ctx: FinishContext = {
    bones,
    keyed,
    placedBones,
    depthOf,
    anchoredTo,
    carried,
    pivotDisagreement,
    targetsOfBone,
    anchorForBone,
    anchors,
    shareAtFit,
    level,
    material: material.plate,
    hinge: { minDeg: hingeMin, maxDeg: hingeMax },
    stretchRatio,
    stretchEverywhere,
    minVisible,
    maxResidual,
  };
  for (const state of states) report.parts.push(finishPart(state, ctx));
  return report;
}

interface FinishContext {
  bones: Map<string, SpineBone>;
  keyed: Map<string, Set<string>>;
  placedBones: Map<string, BonePlace>;
  depthOf: Map<string, number>;
  anchoredTo: Map<string, string>;
  carried: Map<string, string[]>;
  pivotDisagreement: Map<string, number>;
  targetsOfBone: Map<string, PartState[]>;
  anchorForBone: Map<string, { state: PartState; entry: AnchorEntry }>;
  anchors: Map<string, AnchorEntry>;
  shareAtFit: Map<string, number>;
  level: Level;
  material: Plate;
  hinge: { minDeg: number; maxDeg: number };
  stretchRatio: number;
  stretchEverywhere: boolean;
  minVisible: number;
  maxResidual: number;
}

function finishPart(state: PartState, ctx: FinishContext): ChainFitPart {
  const name = basename(state.path);
  const bone = ctx.bones.get(state.drawn.bone);
  const anchored = ctx.anchorForBone.has(state.drawn.bone);
  const stretchFree = ctx.stretchEverywhere || (ctx.keyed.get(state.drawn.bone)?.has('scale') ?? false);
  const view: ChainFitBoneView = {
    name: state.drawn.bone,
    parent: bone?.parent ?? null,
    setupRotationDeg: num(bone?.rotation, 0),
    depth: ctx.depthOf.get(state.drawn.bone) ?? -1,
    anchoredTo: ctx.anchoredTo.get(state.drawn.bone) ?? null,
    dof: {
      rotation: !anchored,
      stretch: stretchFree && !anchored,
      pivotFree: ctx.keyed.get(state.drawn.bone)?.has('translate') ?? false,
    },
    window: {
      hingeMinDeg: ctx.hinge.minDeg,
      hingeMaxDeg: ctx.hinge.maxDeg,
      hingeStepDeg: HINGE_STEP,
      stretchMin: stretchFree ? roundTo(1 / ctx.stretchRatio, 5) : 1,
      stretchMax: stretchFree ? ctx.stretchRatio : 1,
    },
    sharedWith: (ctx.targetsOfBone.get(state.drawn.bone) ?? [])
      .filter((s) => s !== state)
      .map((s) => basename(s.path))
      .sort(),
    carriedBones: ctx.carried.get(state.drawn.bone) ?? [],
    pivotDisagreementPx: ctx.pivotDisagreement.has(state.drawn.bone)
      ? roundTo(ctx.pivotDisagreement.get(state.drawn.bone) as number, 3)
      : null,
  };
  const out: ChainFitPart = {
    part: name,
    path: state.path,
    slot: state.drawn.slot,
    attachment: state.drawn.attachment,
    width: state.plate?.width ?? 0,
    height: state.plate?.height ?? 0,
    role: state.role,
    bone: view,
    refusal: state.blocked,
    placement: null,
    alternates: [],
    ambiguous: false,
    anchorVerdict: ctx.anchors.get(name)?.verdict ?? null,
    notes: [],
  };
  if (state.blocked !== null) {
    out.notes.push(`${name} was not searched: ${state.blocked.detail}.`);
    return out;
  }
  const plate = state.plate as Plate;
  const frozen = state.frozen;
  if (state.place === null || frozen === null || !ctx.placedBones.has(state.drawn.bone)) {
    out.role = 'unplaced';
    out.refusal = {
      reason: 'no-anchor',
      detail:
        `${name} hangs off bone "${state.drawn.bone}", which has no placed ancestor: no part on it or above it ` +
        'came back from the anchor pass inside the anchor criterion, so there was nothing to walk a chain from',
    };
    out.notes.push(
      `${name} was not placed. A chain needs a trunk — supply --anchor with a report that reads at least one part ` +
        'of this limb or above it, or loosen --anchor-residual. Nothing above an anchor is recoverable from it, so ' +
        'a trusted part further out does not help this one.',
    );
    return out;
  }

  const stats = measure(plate, state.place, frozen, ctx.level, ctx.material);
  const atFit = ctx.shareAtFit.get(state.drawn.slot) ?? stats.visibleShare;
  const placement = toPlacement(state.place, state.link, view.setupRotationDeg, stats, atFit);
  out.placement = placement;

  const margin = Math.max(AMBIGUITY_ABSOLUTE, placement.residual * AMBIGUITY_RELATIVE);
  out.alternates = state.alternates
    .map((alt) =>
      toPlacement(alt.place, alt.link, view.setupRotationDeg, measure(plate, alt.place, frozen, ctx.level, ctx.material), atFit),
    )
    .filter((alt) => alt.residual - placement.residual <= margin)
    .slice(0, MAX_ALTERNATES);
  out.ambiguous = out.alternates.length > 0;
  if (out.ambiguous) {
    out.notes.push(
      `${name} has ${out.alternates.length + 1} hinge answers within ${roundTo(margin, 4)} residual of each other ` +
        '— all of them are reported and none was picked. A limb that explains the picture forwards and again ' +
        'backwards looks exactly like this.',
    );
  }

  if (out.role === 'anchor') {
    out.notes.push(
      `${name} is an ANCHOR: this placement is the anchor pass's own answer, taken because it cleared the anchor ` +
        'criterion, and nothing here re-fitted it. Its residual and visible share are this instrument\'s, measured ' +
        'over the masked pixels.',
    );
    if (view.pivotDisagreementPx !== null && view.pivotDisagreementPx > 2) {
      out.notes.push(
        `the chain above it predicts this bone's pivot ${view.pivotDisagreementPx} px from where the anchor put ` +
          "it — the candidate's own joint offset and the picture disagree by that much.",
      );
    }
  } else {
    const dof = view.dof.stretch ? 'a hinge and a stretch' : 'one hinge';
    out.notes.push(
      `${name} was read by walking ${view.depth} link(s) out from ${view.anchoredTo ?? 'an anchor'} and searching ` +
        `${dof} over ${ctx.hinge.minDeg}°…${ctx.hinge.maxDeg}° in ${HINGE_STEP}° steps — not the four degrees of ` +
        'freedom `pose` has to search.',
    );
  }
  if (state.relocated) {
    out.notes.push(
      `the rig predicted ${name} almost entirely covered, so its visible set was frozen at an UNMASKED look ` +
        "instead — `pose`'s own question restricted to this arc — and the masked search ran from there. The share " +
        'below is what that relocation left scoreable.',
    );
  }
  if (view.carriedBones.length > 0) {
    out.notes.push(
      `${view.carriedBones.join(', ')} carry nothing scoreable, so their hinge could not be fitted and their setup ` +
        'rotation was carried through. Every number here inherits that assumption.',
    );
  }
  if (view.dof.pivotFree) {
    out.notes.push(
      `the candidate keys a \`translate\` timeline on "${view.name}", so the pivot this hinge turned about is ` +
        'itself something the rig moves; `localRotationDeg` alone will not reproduce this placement.',
    );
  }

  if (placement.visibleShare < ctx.minVisible) {
    // ⚠️ An ANCHOR gets this refusal too, and the wording carries why rather than
    // leaving a reader to reconcile two rows. The two criteria disagree on
    // purpose: the anchor pass judged this placement over the part's WHOLE
    // footprint, which is all `pose` can see and which does not know what covers
    // it, and this instrument has just measured that almost nothing of the part is
    // visible. Both are true. Suppressing the refusal because "no search happened
    // here" was tried and is worse — measured on the 2026-09-03 corpus it printed
    // `rear-bracer` as READ on 82 of 147 frames at a median visible share of 0.1%,
    // which is the number this floor exists to stop anybody quoting.
    out.refusal = {
      reason: 'occluded',
      detail:
        `${name}: only ${(placement.visibleShare * 100).toFixed(1)}% of it survives the parts drawn over it, ` +
        `below the visibility floor ${ctx.minVisible}; the residual ${placement.residual.toFixed(4)} is a ` +
        `statement about ${placement.scoredPixels} part pixel(s)` +
        (state.isAnchorSource
          ? ` — and it is an ANCHOR, accepted by the anchor pass on its own criterion (residual ` +
            `${(out.anchorVerdict?.residual ?? 0).toFixed(4)}, unexplained ` +
            `${((out.anchorVerdict?.unexplained ?? 0) * 100).toFixed(0)}% over the part's WHOLE footprint, which ` +
            'cannot know what covers it), so every placement hung off it inherits this doubt'
          : ''),
    };
    out.notes.push(
      state.isAnchorSource
        ? `${name} anchors this chain and this instrument can barely see it. The placement is the anchor pass's ` +
          'and may well be right; what is refused is the confirmation, and everything with ' +
          `\`anchoredTo\` = "${view.name}" rests on it.`
        : `${name} is too far behind other parts to measure on this frame. The best placement found is still in ` +
          '`placement`.',
    );
  } else if (placement.residual > ctx.maxResidual) {
    out.refusal = {
      reason: 'no-match',
      detail:
        `${name}: the best placement found has residual ${placement.residual.toFixed(4)} over its visible pixels, ` +
        `above --max-residual ${ctx.maxResidual}`,
    };
    out.notes.push(
      `${name}'s visible pixels do not agree with the frame at any hinge in the window. Check the window, the ` +
        "candidate's joint offset for this limb, and its draw order.",
    );
  }
  if (Math.abs(placement.visibleShareAtFit - placement.visibleShare) > VISIBILITY_DRIFT_TOLERANCE) {
    out.notes.push(
      `the visible set was frozen where ${(placement.visibleShare * 100).toFixed(1)}% of ${name} showed and the ` +
        `answer landed where ${(placement.visibleShareAtFit * 100).toFixed(1)}% does — the measurement and the ` +
        'answer are not quite in the same place. Another --passes is the repair.',
    );
  }
  if (placement.offCanvas > 0.01) {
    out.notes.push(
      `${roundTo(placement.offCanvas * 100, 1)}% of ${name}'s material falls outside the frame canvas at this placement.`,
    );
  }
  return out;
}

/** A part PNG, or the reason it is not one. */
function loadPart(path: string, cache: Map<string, Plate | null>): Plate | string {
  if (cache.has(path)) {
    const held = cache.get(path) ?? null;
    return held === null ? `cannot read ${path}` : held;
  }
  if (!existsSync(path)) {
    cache.set(path, null);
    return `${path} is not there — --images must hold one PNG per attachment image name the candidate uses`;
  }
  try {
    const plate = readPlate(path);
    cache.set(path, plate);
    return plate;
  } catch (err) {
    cache.set(path, null);
    return `cannot decode ${path}: ${(err as Error).message}`;
  }
}

function hasMaterial(plate: Plate): boolean {
  for (let i = 3; i < plate.data.length; i += 4) if (plate.data[i] !== 0) return true;
  return false;
}

/** A directory or a `skeleton.json` path, the way every other command takes a candidate. */
function resolveSkeletonPath(target: string): string {
  const abs = resolve(target);
  if (!existsSync(abs)) throw new ChainFitError(`nothing at ${abs}`);
  if (statSync(abs).isDirectory()) return join(abs, 'skeleton.json');
  if (!abs.endsWith('.json')) throw new ChainFitError(`${abs} is neither a directory nor a .json skeleton`);
  return abs;
}

// ---------------------------------------------------------------------------
// the console report
// ---------------------------------------------------------------------------

function placementLine(p: ChainFitPlacement): string {
  return (
    `x=${p.x.toFixed(1).padStart(7)}  y=${p.y.toFixed(1).padStart(7)}  rot=${p.rotationDeg.toFixed(1).padStart(7)}°  ` +
    `scale=${p.scale.toFixed(3)}  residual=${p.residual.toFixed(4)}  visible=${(p.visibleShare * 100).toFixed(0).padStart(3)}%`
  );
}

export function chainFitLines(report: ChainFitReport): string[] {
  const bg = report.frame.background;
  const bgText =
    bg.kind === 'colour' && bg.colour !== null
      ? `rgb(${bg.colour.join(', ')}) over ${(bg.borderShare * 100).toFixed(0)}% of the border ring`
      : bg.kind === 'transparent'
        ? `transparency over ${(bg.borderShare * 100).toFixed(0)}% of the border ring`
        : 'UNKNOWN — the border ring has no dominant colour, so every pixel counts as material and the silhouette ' +
          'signal is gone; residuals here are colour agreement only';
  const lines = [
    `  ..    frame     ${report.frame.path}  (${report.frame.width}x${report.frame.height})`,
    `  ..    ground    ${bgText}`,
    `  ..    candidate ${report.candidate.skeleton}  (${report.candidate.bones} bones, ` +
      `${report.candidate.drawn} of ${report.candidate.slots} slots drawn)`,
    `  ..    parts     ${report.images}`,
    `  ..    anchor    ${report.anchor.source === 'pose' ? 'an internal `rigc pose` pass' : (report.anchor.path ?? '')} · ` +
      `${report.anchor.anchored.length} trusted (residual ≤ ${report.anchor.criterion.maxResidual}, ` +
      `unexplained ≤ ${report.anchor.criterion.maxUnexplained}, unambiguous)`,
    `  ..    search    hinge ${report.search.hinge.minDeg}°–${report.search.hinge.maxDeg}° step ` +
      `${report.search.hinge.stepDeg}° (${report.search.hinge.steps} rungs) · stretch free from ` +
      `${report.search.stretch.freeFrom} · refuse below visible ${report.search.minVisible} or above residual ` +
      `${report.search.maxResidual} · ${report.search.passes} pass(es)`,
  ];
  const width = Math.max(8, ...report.parts.map((p) => p.part.length));
  for (const part of report.parts) {
    const label = part.part.padEnd(width);
    const pad = ' '.repeat(width);
    if (part.placement === null) {
      lines.push(`  REFUSE ${label}  ${part.refusal?.reason ?? 'unplaced'}: ${part.refusal?.detail ?? ''}`);
      continue;
    }
    const tag =
      part.refusal !== null ? 'REFUSE' : part.ambiguous ? 'AMBIG ' : part.role === 'anchor' ? 'ANCHOR' : 'CHAIN ';
    lines.push(`  ${tag} ${label}  ${placementLine(part.placement)}`);
    if (part.role === 'chain') {
      const hinge = part.placement.hingeDeg === null ? '—' : `${part.placement.hingeDeg.toFixed(2)}°`;
      const local = part.placement.localRotationDeg === null ? '—' : `${part.placement.localRotationDeg.toFixed(2)}°`;
      lines.push(
        `         ${pad}  bone ${part.bone.name} · depth ${part.bone.depth} from ${part.bone.anchoredTo ?? '?'} · ` +
          `hinge ${hinge} (local ${local} Spine)` +
          (part.bone.dof.stretch && part.placement.stretch !== null ? ` · stretch ${part.placement.stretch.toFixed(3)}` : '') +
          ` · ${part.placement.scoredPixels} px scored`,
      );
    }
    if (part.bone.carriedBones.length > 0) {
      lines.push(`         ${pad}  carried through un-fitted: ${part.bone.carriedBones.join(', ')}`);
    }
    part.alternates.forEach((alt, i) => {
      const hinge = alt.hingeDeg === null ? '—' : `${alt.hingeDeg.toFixed(2)}°`;
      lines.push(`         ${pad}  alt ${i + 2}: ${placementLine(alt)}  hinge ${hinge}`);
    });
    if (part.refusal !== null) lines.push(`         ${pad}  ${part.refusal.reason}: ${part.refusal.detail}`);
  }
  const read = report.parts.filter((p) => p.refusal === null).length;
  const bought = report.parts.filter(
    (p) => p.refusal === null && p.role === 'chain' && p.anchorVerdict?.eligible === false,
  ).length;
  lines.push('');
  lines.push(
    `  ..    ${read} of ${report.parts.length} part(s) read; ${bought} of them the anchor pass refused and the chain bought.`,
  );
  lines.push('  ..    residuals are over VISIBLE pixels and are a trust signal, not a score — nothing here has a');
  lines.push('  ..    pass bar. Read every one next to its `visible` share, and remember the occlusion is the');
  lines.push("  ..    candidate's own: a wrong draw order masks the wrong pixels.");
  return lines;
}
