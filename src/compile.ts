/**
 * rigc compile — rig spec + motion spec (+ an optional cut manifest) -> Spine 4.3
 * skeleton JSON and a one-part-per-page atlas. Pure data assembly: no spine-core
 * here (that is the validator's job), no clock, no randomness.
 *
 * Three inputs, one domain each — [`src/rig.ts`](rig.ts) states the split in
 * full. In one line: the **manifest** owns measured art, the **rig spec** owns
 * skeleton structure, the **motion spec** owns time.
 *
 * ⭐ The rig spec is what this file used to hard-code. Until it existed the bone
 * tree and the slot table were three tables in `src/archetype.ts`, a slot outside
 * them was a compile error, and no skeleton anybody else owns could be stated at
 * all (blocker B1). The two things that were genuinely code and stayed code are
 * the **mesh generators** (`src/mesh.ts` — they encode a deformation model, not a
 * table of numbers) and the **coordinate contract** (`src/transform.ts`).
 *
 * Determinism is a contract, not a habit: `validate` re-runs this and compares
 * the two emits byte for byte (assertion A18).
 */
import { basename, dirname, relative, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { readPngInfo } from './png.ts';
import { CompileError, NotImplementedError } from './errors.ts';
import { parseJsonWithPosition } from './json-position.ts';
import { parseMotionSpec } from './motion.ts';
import {
  parseRigSpec,
  RIG_FROM_PROPERTIES,
  RIG_PATH_POSITION_MODES,
  RIG_PATH_ROTATE_MODES,
  RIG_PATH_SPACING_MODES,
  RIG_SKIN_CONSTRAINT_KEYS,
  splitRigSkin,
  type RigAttachment,
  type RigBone,
  type RigBoundingBoxAttachment,
  type RigClippingAttachment,
  type RigEvent,
  type RigMeshAttachment,
  type RigMeshBinding,
  type RigPathAttachment,
  type RigRegionAttachment,
  type RigSpec,
  type RigVertexGeometry,
} from './rig.ts';
import {
  buildContourMesh,
  buildRibbonMesh,
  buildRingMesh,
  encodeWeightedVertices,
  measureAuthoredMeshFit,
  MeshError,
  type MeshBoneRef,
  type MeshFitReport,
} from './mesh.ts';
import { Plate, readPlate } from '../tools/plate.ts';
import {
  extractRegion,
  parseAtlasText,
  rewritePageNames,
  writeAtlasText,
  type AtlasRegion,
  type ParsedAtlas,
} from './atlas.ts';
import { KEY_TIME_EPSILON } from './timelines.ts';
import { evaluateDeformTransform } from './deformgen.ts';
import { evaluateTrackDerive, TRACK_DERIVE_PROJECTIONS, type TrackDeriveMember } from './trackgen.ts';
import {
  computeWorldTransforms,
  cropToSpineY,
  normaliseDegrees,
  screenToSpineDegrees,
  toBoneLocal,
  toWorld,
  TransformError,
  type BoneTransform,
} from './transform.ts';
import type {
  CompileResult,
  CompiledImage,
  EasingHandles,
  FaceManifest,
  FaceManifestPart,
  MotionDeformTrack,
  MotionDrawOrderKey,
  MotionEventKey,
  MotionIkTrack,
  MotionMemberValues,
  MotionSpec,
  MotionTrack,
  MotionTransformTrack,
  MotionValueKey,
  MotionValueTrack,
  RigInfo,
  SpineAttachment,
  SpineBone,
  SpineBoundingBoxAttachment,
  SpineClippingAttachment,
  SpineConstraint,
  SpineEvent,
  SpineMeshAttachment,
  SpinePathAttachment,
  SpineRegionAttachment,
  SpineSkeletonJson,
  SpineSlot,
  SpineTimelineKey,
} from './types.ts';

export { CompileError, NotImplementedError };

/** The spine-core line the validator round-trips through. */
export const SPINE_VERSION = '4.3.13';

const FRAME = 1 / 60;

// ---------------------------------------------------------------------------
// number formatting — deterministic, and free of "-0"
// ---------------------------------------------------------------------------

function r6(n: number): number {
  const v = Math.round(n * 1e6) / 1e6;
  return v === 0 ? 0 : v;
}

/**
 * A **key time** on that same 1e-6 s grid — rounded DOWN rather than to nearest.
 *
 * ## Why key times get their own quantiser
 *
 * Every other emitted number is a quantity, and for a quantity nearest is the
 * least wrong answer. A key time is not a quantity: it is a **position against a
 * sample grid a player will step**, and the two directions of a half-step error
 * are not equally wrong. Rounded down, a key fires on the sample it was written
 * for, half a millionth of a second early, and nothing can see it. Rounded up, it
 * fires on the NEXT sample — a whole frame late — and on a stepped timeline that
 * is the wrong picture rather than a slightly wrong value.
 *
 * The arithmetic is not exotic, it is the common case: `2/12 s` and `5/30 s` are
 * both 0.16666666…, `r6` emits 0.166667, and 0.166667 is larger than either. The
 * spineboy run's muzzle flare fired one 12 fps frame late for exactly that, with
 * no error and no warning, until the run's own frame self-check caught it (issue
 * #99). ⚠️ An attachment timeline is inherently stepped, so it is where this
 * surfaces first — but a rotate key rounded up is a frame late too; it just hides
 * inside the interpolation.
 *
 * ## Why this is not `Math.floor(n * 1e6)`
 *
 * `n * 1e6` is itself a rounded double: `0.7 * 1e6` is 699999.9999999999, and
 * flooring it would move a time the grid represents **exactly** a whole step down.
 * So the value is rounded to nearest first and stepped back only when the result
 * genuinely overshoots the time it came from. A time already on the grid is
 * therefore emitted unchanged, which is what keeps `A18_DETERMINISTIC_EMIT` and
 * every committed artifact where they were.
 *
 * ## What it means for `KEY_TIME_EPSILON`
 *
 * The tolerance's job narrows rather than moves: an authored key can no longer
 * land past its own `duration` by the compiler's own rounding, so `checkKeyTime`
 * only refuses a key the author really did put past the end. The epsilon stays,
 * because A09 re-checks the same rule on an emitted file read back through a
 * Float32Array — where the grid is coarser and rounds both ways — and because a
 * `duration` is not required to be on the grid either.
 */
function keyTime(n: number): number {
  let units = Math.round(n * 1e6);
  if (units / 1e6 > n) units -= 1;
  const v = units / 1e6;
  return v === 0 ? 0 : v;
}

/**
 * Rule 4, per timeline: no key may land past the animation's declared duration.
 *
 * Rule 4 itself compares one number per animation — the largest key time across
 * every track — so a single track sitting on the declared duration answers for
 * all of them, and a key past the end on some *other* track is invisible to it.
 * That is exactly how rung 6 lost a one-frame attachment reveal; the tolerance
 * story is in `KEY_TIME_EPSILON`.
 *
 * ⚠️ It compares the **emitted** time, not the authored one, and since `keyTime`
 * rounds down that can only be more forgiving than comparing the author's number
 * — by less than one step of the grid. That is the honest side to err on: the
 * emitted time is the one a player samples, and refusing a key that will in fact
 * be reached would be refusing a correct animation.
 *
 * This is a refusal rather than an assertion because the key is the thing to
 * change and the motion spec is the file it lives in: the message has to name
 * the track and the key, and by gate time both are gone — the emitted skeleton
 * carries no declared duration at all, which is why Rule 4 exists.
 */
function checkKeyTime(where: string, time: number, authored: number, duration: number): void {
  const past = time - duration;
  if (past <= KEY_TIME_EPSILON) return;
  const at = time === authored ? `${time}s` : `t=${authored}, ${time}s after lag/stagger`;
  throw new CompileError(
    `${where}: key at ${at} is ${r6(past)}s past the declared duration ${duration}s — nothing that plays this ` +
      `animation for the duration it declares ever reaches it. Move the key to ${duration}, or declare the ` +
      `duration you meant.`,
  );
}

function channelHex(v: number): string {
  const clamped = Math.max(0, Math.min(1, v));
  return Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
}

function rgbaHex(v: number[]): string {
  if (v.length !== 4) throw new CompileError(`rgba value needs 4 channels, got ${v.length}`);
  return v.map(channelHex).join('');
}

/**
 * Bone timeline shapes: which JSON fields a key carries, and their defaults.
 *
 * The defaults matter more than they look: Spine omits a field that equals the
 * setup value, and `scale` defaults to 1 while `translate` defaults to 0. Emit
 * `x: 0` on a scale key and the bone collapses to nothing, silently.
 */
const BONE_TRACKS: Record<string, { fields: string[]; identity: number[] }> = {
  translate: { fields: ['x', 'y'], identity: [0, 0] },
  translatex: { fields: ['value'], identity: [0] },
  translatey: { fields: ['value'], identity: [0] },
  scale: { fields: ['x', 'y'], identity: [1, 1] },
  scalex: { fields: ['value'], identity: [1] },
  scaley: { fields: ['value'], identity: [1] },
  shear: { fields: ['x', 'y'], identity: [0, 0] },
  shearx: { fields: ['value'], identity: [0] },
  sheary: { fields: ['value'], identity: [0] },
  rotate: { fields: ['value'], identity: [0] },
};

/**
 * Physics timelines. `mix` is the constraint's authority; `reset` is an event
 * with no value — one key at the entry frame stops the constraint from flying
 * in from whatever pose the previous animation left — solved in DATA rather
 * than in caller glue.
 */
const PHYSICS_TRACKS: Record<string, { fields: string[]; identity: number[] }> = {
  mix: { fields: ['value'], identity: [1] },
  reset: { fields: [], identity: [] },
};

/**
 * Path constraint timelines (`animations.<a>.path.<constraint>.<timeline>`).
 *
 * ⭐ Same shape as the physics group — a constraint name, a timeline name under
 * it — which is why they share `compileValueTrack` and a `MotionTrack` rather
 * than getting the `ik`/`transform` treatment: those two are ONE unnamed
 * timeline per constraint and needed a key type of their own, and these are not.
 *
 * `mix` is the exception inside the group: one timeline, three values in a key,
 * three curve channels, in the order the parser reads them (`:1027-1029`). ⚠️ Its
 * `mixY` defaults to the same key's `mixX` in the file, so rigc writes all three
 * out — `compileValueTrack` never omits a field, which is what keeps "the author
 * wrote mixY" and "mixY happened to equal mixX" from emitting the same file.
 */
const PATH_TRACKS: Record<string, { fields: string[]; identity: number[] }> = {
  position: { fields: ['value'], identity: [0] },
  spacing: { fields: ['value'], identity: [0] },
  mix: { fields: ['mixRotate', 'mixX', 'mixY'], identity: [1, 1, 1] },
};

/**
 * Slider timelines (`animations.<a>.slider.<constraint>.<timeline>`).
 *
 * ⚠️ `time`'s per-key default is **1**, not 0 (`:1121` passes `defaultValue` 1
 * to `readTimeline1` for both timelines). Nothing here depends on that, because
 * `compileValueTrack` writes every field explicitly — it is recorded because it
 * is the one timeline in the format whose default is neither its own identity nor
 * a copy of a neighbour, and a reader checking rigc against the parser will trip
 * over it.
 */
const SLIDER_TRACKS: Record<string, { fields: string[]; identity: number[] }> = {
  time: { fields: ['value'], identity: [1] },
  mix: { fields: ['value'], identity: [1] },
};

/**
 * The three constraint families a `MotionTrack` can target, and the table of
 * timelines each one accepts.
 *
 * 🚨 The key here is the field a track names its target with, NOT the property.
 * All three families have a timeline called `mix`, so dispatching on `property`
 * — which is what this file did while `physics` was the only such family — would
 * send a path constraint's mix keys into the physics group, where the parser
 * would look for a physics constraint of that name and throw.
 */
const CONSTRAINT_TRACK_FAMILIES = {
  physics: { tracks: PHYSICS_TRACKS, label: 'physics constraint' },
  path: { tracks: PATH_TRACKS, label: 'path constraint' },
  slider: { tracks: SLIDER_TRACKS, label: 'slider' },
} as const;

type ConstraintTrackFamily = keyof typeof CONSTRAINT_TRACK_FAMILIES;

const CONSTRAINT_TRACK_TARGETS = Object.keys(CONSTRAINT_TRACK_FAMILIES) as ConstraintTrackFamily[];

/**
 * Which family a track belongs to, from the target it names — or null for the
 * slot and bone tracks that name none.
 *
 * The `group` form is physics-only and stays that way: a group of physics
 * constraints is how the ring's four grips are tuned in one track, and no path
 * constraint or slider in this format is ever authored in bulk. A `group` track
 * whose property is one of theirs is refused below rather than silently read as
 * a slot track.
 */
function constraintFamilyOf(track: MotionTrack): ConstraintTrackFamily | null {
  for (const family of CONSTRAINT_TRACK_TARGETS) {
    if (track[family] !== undefined) return family;
  }
  if (track.group !== undefined && track.property in PHYSICS_TRACKS) return 'physics';
  return null;
}

/**
 * One numeric channel of a constraint timeline: the JSON field, the value the
 * parser uses when a key omits it, and — for `mixY` alone — the field it takes
 * that default FROM.
 *
 * Channel order is load-bearing twice over. `readCurve` indexes a curve array by
 * channel (`curve[value << 2]`), so the order here is the order four-number
 * groups concatenate in; and the parser reads the fields in this order, so
 * emitting them in it keeps the file readable against an editor export.
 */
interface ConstraintChannel {
  field: string;
  dflt: number;
  /** `mixY` defaults to the SAME key's `mixX`, not to 1 (`:988`). */
  inheritsFrom?: string;
}

/** A stepped-by-nature boolean on a constraint key. Never a curve channel. */
interface ConstraintFlag {
  field: string;
  dflt: boolean;
}

interface ConstraintTimelineShape {
  channels: ConstraintChannel[];
  flags: ConstraintFlag[];
  /** Per-field bounds, where the runtime documents one. */
  range: Record<string, [number, number]>;
}

/**
 * The two constraint groups that are ONE unnamed timeline per constraint
 * (`animations.<a>.ik.<name>`, `animations.<a>.transform.<name>`).
 *
 * ⚠️ Every field is optional in the file and every one has a per-key default, so
 * omitting a field on one key of a track does not carry the previous key's value
 * forward — it snaps to the default. `compileConstraintTrack` refuses a track
 * whose keys disagree about which fields they name, because that is the shape
 * that loads clean and plays something nobody wrote.
 *
 * The bounds: `IkConstraintPose.mix` is documented as a percentage 0-1 and
 * `softness` as a distance, while every transform mix is documented **unbounded**
 * — so only the IK pair carries a range, and refusing a transform mix above 1
 * would refuse correct data (an over-mix is a real editor idiom).
 */
const CONSTRAINT_TIMELINES: Record<'ik' | 'transform', ConstraintTimelineShape> = {
  ik: {
    channels: [
      { field: 'mix', dflt: 1 },
      { field: 'softness', dflt: 0 },
    ],
    flags: [
      { field: 'bendPositive', dflt: true },
      { field: 'compress', dflt: false },
      { field: 'stretch', dflt: false },
    ],
    range: { mix: [0, 1], softness: [0, Infinity] },
  },
  transform: {
    channels: [
      { field: 'mixRotate', dflt: 1 },
      { field: 'mixX', dflt: 1 },
      { field: 'mixY', dflt: 1, inheritsFrom: 'mixX' },
      { field: 'mixScaleX', dflt: 1 },
      { field: 'mixScaleY', dflt: 1 },
      { field: 'mixShearY', dflt: 1 },
    ],
    flags: [],
    range: {},
  },
};

/** Physics constraint fields and their parser defaults (SkeletonJson.js:295-319). */
const PHYSICS_COMPONENTS = ['x', 'y', 'rotate', 'scaleX', 'shearX'] as const;
const PHYSICS_PARAMS: Array<[string, number]> = [
  ['inertia', 0.5],
  ['strength', 100],
  ['damping', 0.85],
  ['mass', 1],
  ['wind', 0],
  ['gravity', 0],
  ['mix', 1],
  ['fps', 60],
  ['limit', 5000],
];

// ---------------------------------------------------------------------------
// curves
// ---------------------------------------------------------------------------

/**
 * Graph-view handles -> ABSOLUTE (time, value) control points.
 *
 * `Animation.setBezier` samples the cubic in the (time, value) plane, so the
 * normalised handles an editor shows are NOT what the JSON holds. Writing the
 * handles straight into the file loads without error and produces a different
 * curve.
 *
 * Four numbers PER VALUE CHANNEL, concatenated in channel order. A short array
 * multiplies `undefined` and yields a NaN curve, silently (case 6g).
 */
export function bezierForChannel(
  handles: EasingHandles,
  t1: number,
  t2: number,
  v1: number,
  v2: number,
): [number, number, number, number] {
  const [hx1, hy1, hx2, hy2] = handles;
  return [
    r6(t1 + (t2 - t1) * hx1),
    r6(v1 + (v2 - v1) * hy1),
    r6(t1 + (t2 - t1) * hx2),
    r6(v1 + (v2 - v1) * hy2),
  ];
}

// ---------------------------------------------------------------------------
// inputs
// ---------------------------------------------------------------------------

function readJson<T>(path: string): T {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    throw new CompileError(`cannot read ${path}: ${(err as Error).message}`);
  }
  try {
    // A parse failure gets a line/column appended to the runtime's own
    // message — see `parseJsonWithPosition` for why `JSON.parse` alone
    // cannot say where.
    return parseJsonWithPosition(text) as T;
  } catch (err) {
    throw new CompileError(`cannot read ${path}: ${(err as Error).message}`);
  }
}

function partWindow(part: FaceManifestPart, manifest: FaceManifest): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const [x, y] = part.offset;
  const size = part.size ?? [manifest.crop.w, manifest.crop.h];
  return { x, y, w: size[0], h: size[1] };
}

/**
 * The base plate is the part whose window IS the crop, and that is a structural
 * fact rather than a naming convention.
 *
 * It matters twice. A full-frame mesh is a full-frame canvas that can never
 * dirty-skip, so the base must never be
 * a mesh — and the validator recognises the same shape from the other side, which
 * is why assertion A14 already covers this without a new check. And a full-frame
 * region is the one page allowed to be opaque (A19).
 */
function isBasePlate(part: FaceManifestPart, manifest: FaceManifest): boolean {
  const win = partWindow(part, manifest);
  return win.x === 0 && win.y === 0 && win.w === manifest.crop.w && win.h === manifest.crop.h;
}

/** The rig slot a manifest part joins on. See the `parts` mapping below. */
function rigSlotOf(part: FaceManifestPart): string {
  return part.rig_slot ?? part.slot;
}

/** The control bones a mesh part drives, in declaration order. */
function meshControlBones(part: FaceManifestPart): string[] {
  const spec = part.mesh;
  if (!spec) return [];
  const kind = spec.kind ?? 'ring';
  if (kind === 'ribbon') return spec.chain ?? [];
  if (spec.control_bones?.length) return spec.control_bones;
  return spec.control_bone ? [spec.control_bone] : [];
}

// ---------------------------------------------------------------------------
// compile
// ---------------------------------------------------------------------------

export interface CompileOptions {
  /** The rig spec. Required: it is the skeleton's structure. */
  rigPath: string;
  motionPath: string;
  /** Directory the atlas + skeleton will be written to (page names are relative to it). */
  outDir: string;
  /** The cut manifest. Absent for a skeleton with no measured art behind it. */
  manifestPath?: string;
  /** Overrides the rig spec's own `images` directory (CLI `--images <dir>`). */
  imagesDir?: string;
  /**
   * A pre-packed atlas to resolve `image` entries against, instead of loose PNGs
   * (CLI `--atlas-in <file>`). Every region a part names is looked up in this
   * file and its geometry read from it; the emitted atlas is this one, re-anchored
   * to `outDir`. See `resolveFromAtlas`.
   */
  atlasInPath?: string;
}

/**
 * One part = one page. No packer in this shape, so no PMA trap, no rotation, no
 * strip offsets. Region covers the page exactly => u2=v2=1.
 *
 * ⭐ The BODY of the emit moved to [`src/atlas.ts`](atlas.ts) in issue #4, and
 * that is the whole point of the move: `--pack` writes a different arrangement
 * through the same `writeAtlasText`, so "the defaults change nothing" is a
 * property of one function rather than a promise made by two that look alike.
 * The two text-shape traps A07 checks (a region name is the RAW line; a blank
 * line closes a page block) live there now.
 *
 * Exported (rather than inlined into `compile`) so `--copy-images` can call it a
 * second time with `page` rewritten to the copies' filenames, after the copy
 * itself has happened — see [`src/emit.ts`](emit.ts). Everything else about an
 * image (`region`, `width`, `height`) is unchanged by that rewrite; only where the
 * bytes live moved.
 */
export function buildAtlasText(images: CompiledImage[]): string {
  return writeAtlasText(
    images.map((img) => ({
      name: img.page,
      width: img.width,
      height: img.height,
      regions: [
        {
          name: img.region,
          x: 0,
          y: 0,
          width: img.width,
          height: img.height,
          offsetX: 0,
          offsetY: 0,
          originalWidth: img.width,
          originalHeight: img.height,
        },
      ],
    })),
  );
}

// ---------------------------------------------------------------------------
// where a part's pixels come from: a loose PNG, or a region of a packed atlas
// ---------------------------------------------------------------------------

/** One part resolved out of a loose PNG on disk — the default, and unchanged. */
function fromLoosePng(
  relPath: string,
  absPath: string,
  region: string,
  isBase: boolean,
  outDir: string,
): CompiledImage {
  if (!existsSync(absPath)) {
    // Left to `readFileSync` this arrives as a raw ENOENT with a stack, which
    // is the tool telling an agent about its own internals instead of about
    // the rig. The validator's messages are the UI, and so are these.
    throw new CompileError(`image "${relPath}" is not on disk at ${absPath}`);
  }
  const info = readPngInfo(absPath);
  // Page name is the PNG path *relative to the atlas file*, so the viewer
  // resolves it the way every Spine consumer does: against the atlas URL.
  // The PNGs are not copied: they pass through untouched, and the atlas points
  // at wherever they already live.
  const page = relative(outDir, absPath).split('\\').join('/');
  return { region, page, absPath, width: info.width, height: info.height, hasAlpha: info.hasAlpha, isBase };
}

/** A pre-packed atlas plus where it was read from, so messages can name it. */
interface AtlasSource {
  path: string;
  dir: string;
  parsed: ParsedAtlas;
  /** Trimmed region name -> the region, first occurrence wins (as `findRegion` does). */
  byName: Map<string, { region: AtlasRegion; page: ParsedAtlas['pages'][number] }>;
}

function readAtlasIn(path: string): AtlasSource {
  if (!existsSync(path)) throw new CompileError(`--atlas-in names ${path}, which is not on disk`);
  const parsed = parseAtlasText(readFileSync(path, 'utf8'));
  const byName = new Map<string, { region: AtlasRegion; page: ParsedAtlas['pages'][number] }>();
  for (const page of parsed.pages) {
    for (const region of page.regions) {
      const key = region.name.trim();
      // `TextureAtlas.findRegion` returns the FIRST match, so a sequence's later
      // indices are not separately addressable by name. Mirrored rather than
      // improved on: the runtime is what will resolve these at load time.
      if (!byName.has(key)) byName.set(key, { region, page });
    }
  }
  if (byName.size === 0) throw new CompileError(`--atlas-in ${path} declares no regions`);
  return { path, dir: dirname(path), parsed, byName };
}

/**
 * How far apart two names are, for the "did you mean" list on a missing region.
 *
 * Plain Levenshtein. An atlas has tens of regions and this runs once per
 * refusal, so the O(n*m) table is free and a cheaper heuristic (shared prefix,
 * substring) would miss the commonest real case — a transposition or one wrong
 * character in a hand-typed `image`.
 */
function nameDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  let previous = new Array<number>(cols);
  for (let j = 0; j < cols; j++) previous[j] = j;
  for (let i = 1; i < rows; i++) {
    const current = new Array<number>(cols);
    current[0] = i;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[cols - 1];
}

/** Up to five region names closest to the one that was not found. */
function nearMisses(wanted: string, known: Iterable<string>): string[] {
  const scored: Array<{ name: string; d: number }> = [];
  for (const name of known) {
    const d = nameDistance(wanted.toLowerCase(), name.toLowerCase());
    // Half the name's length, floored at 2: "leg" must not suggest "arm", and a
    // long name may still be recognisable through several typos.
    if (d <= Math.max(2, Math.floor(wanted.length / 2))) scored.push({ name, d });
  }
  scored.sort((x, y) => x.d - y.d || (x.name < y.name ? -1 : 1));
  return scored.slice(0, 5).map((s) => s.name);
}

/**
 * One part resolved out of a region of a pre-packed atlas — CLI `--atlas-in`.
 *
 * ## What comes from where
 *
 * The join key is the region NAME, which rigc already equates with the PNG
 * basename everywhere else (`addImage`), so a rig spec written against loose
 * parts resolves against a pack of the same parts with no edit. The geometry —
 * `x`/`y`/`width`/`height`/`offsets`/`rotate` — is the atlas's, read rather than
 * invented, and `width`/`height` on the resulting image are the region's
 * `originalWidth`/`originalHeight` **divided by the page's `scale:`**: the
 * UNTRIMMED drawing at its own size, which is what an attachment's width and
 * height mean and therefore what every downstream measurement in this file
 * already expects.
 *
 * ## 🚨 Why the `scale:` divide is not a refinement (issue #267)
 *
 * A region's `originalWidth/Height` are in the PAGE's texels, and a page that
 * declares `scale: 0.5` holds texels half the size of the drawings it was packed
 * from — the field says so in as many words, and `atlasScales`
 * ([`src/render.ts`](render.ts)) already reported it. An attachment's `width` is
 * in world units, and `SkeletonJson` reads it straight out of the JSON
 * (`region.width = map.width * scale`) with the atlas nowhere in the expression,
 * so nothing downstream of rigc will ever undo a scale rigc failed to apply.
 * Taking the texel count as the world size therefore produced a valid skeleton
 * drawn at half size, green, with nothing in the report saying so — and NINE of
 * the ten atlases in the example corpus declare a `scale:`, because an editor
 * pack is routinely coarser than its art.
 *
 * ⚠️ **The divide recovers the drawing to within the pack's own quantisation, not
 * exactly.** The packer wrote `round(drawing x scale)`, so a region 373 texels
 * wide at `scale: 0.5` is consistent with a 745- and a 746-pixel drawing and the
 * pack does not say which. `originalWidth / scale` is the midpoint of that
 * interval — the unbiased estimate — and it is off by at most `0.5 / scale`
 * source pixels (one pixel at `scale: 0.5`). That residual is information the
 * pack destroyed; the only way to be exact is to be handed the loose art, which
 * is the default route. What the divide removes is the factor-of-two error.
 *
 * ## Three refusals, and why none of them can be a warning
 *
 *   * a name the atlas does not carry — the attachment would resolve to no
 *     region, `AtlasAttachmentLoader` returns null and the part silently does
 *     not draw. Refused with the near misses, because the commonest cause is one
 *     character;
 *   * a page the atlas names and the disk does not have — the same silence, one
 *     step further along;
 *   * a rectangle that runs off its page — `region.x + width > page.width` makes
 *     `u2 > 1`, which samples whatever the wrap mode does and is never what the
 *     pack meant. A16-style validity, caught at the point the number is read.
 */
function resolveFromAtlas(
  relPath: string,
  region: string,
  isBase: boolean,
  outDir: string,
  atlas: AtlasSource,
): CompiledImage {
  const found = atlas.byName.get(region);
  if (!found) {
    const near = nearMisses(region, atlas.byName.keys());
    const known = [...atlas.byName.keys()].sort();
    throw new CompileError(
      `image "${relPath}" resolves to region "${region}", which the atlas at ${atlas.path} does not have. ` +
        (near.length ? `Did you mean ${near.map((n) => JSON.stringify(n)).join(', ')}? ` : '') +
        `The atlas declares ${known.length} region(s): ${known.join(', ')}`,
    );
  }
  const absPath = resolve(atlas.dir, found.page.name);
  if (!existsSync(absPath)) {
    throw new CompileError(
      `region "${region}" sits on page "${found.page.name}" of ${atlas.path}, which is not on disk at ${absPath}`,
    );
  }
  const turned = found.region.degrees === 90 || found.region.degrees === 270;
  const rectW = turned ? found.region.height : found.region.width;
  const rectH = turned ? found.region.width : found.region.height;
  if (
    found.region.x < 0 ||
    found.region.y < 0 ||
    found.region.x + rectW > found.page.width ||
    found.region.y + rectH > found.page.height
  ) {
    throw new CompileError(
      `region "${region}" is at ${found.region.x},${found.region.y} sized ${rectW}x${rectH} on a ` +
        `${found.page.width}x${found.page.height} page in ${atlas.path}; the rectangle runs off the page, so its ` +
        'UVs would leave the texture',
    );
  }
  const info = readPngInfo(absPath);
  const page = relative(outDir, absPath).split('\\').join('/');
  const scale = found.page.scale;
  return {
    region,
    page,
    absPath,
    // `r6` for the same reason every other emitted number takes it: 55 / 0.4 is
    // 137.49999999999997 in binary floating point, and a size is a number the
    // artifact states rather than one it accumulates.
    width: r6(found.region.originalWidth / scale),
    height: r6(found.region.originalHeight / scale),
    hasAlpha: info.hasAlpha,
    isBase,
    atlas: found.region,
    ...(scale === 1 ? {} : { atlasScale: scale }),
  };
}

/**
 * A part's own pixel grid, wherever its bytes live.
 *
 * The only reader of pixels in the compiler is the contour generator, which
 * traces a part's alpha — and a part imported from a pack has no file of its
 * own, only a rectangle of somebody's page. `extractRegion` lifts the drawing
 * back out, so the generator sees the same grid either way and its output does
 * not depend on how the art was delivered.
 */
function partPlate(img: CompiledImage): Plate {
  const page = readPlate(img.absPath);
  return img.atlas === undefined ? page : extractRegion(page, img.atlas);
}

export function compile(opts: CompileOptions): CompileResult {
  const rigPath = resolve(opts.rigPath);
  const motionPath = resolve(opts.motionPath);
  const outDir = resolve(opts.outDir);
  const manifestPath = opts.manifestPath === undefined ? null : resolve(opts.manifestPath);
  const manifestDir = manifestPath === null ? null : dirname(manifestPath);

  const rig = parseRigSpec(readJson<unknown>(rigPath), rigPath);
  // Parsed, not cast, since issue #307 — `src/motion.ts` states what it proves
  // and which refusals it deliberately leaves in this file.
  const motion = parseMotionSpec(readJson<unknown>(motionPath), motionPath);
  const manifest = manifestPath === null ? null : readJson<FaceManifest>(manifestPath);

  // The rig spec names its own path in every message `parseRigSpec` throws (its
  // `where` argument, above). The motion spec gets no such treatment below —
  // every "animation … bone … property" refusal is built from data alone — so a
  // reader with two input files and one error has no way to tell which one is at
  // fault. This wraps the motion-only regions (the version/archetype check right
  // below, the physics table and the animation loop further down) and prefixes
  // the motion path onto any `CompileError` that escapes them, unless the
  // message already names it.
  const withMotionSource = <T>(fn: () => T): T => {
    try {
      return fn();
    } catch (err) {
      if (err instanceof CompileError && !err.message.includes(motionPath)) {
        throw new CompileError(`${motionPath}: ${err.message}`);
      }
      throw err;
    }
  };

  withMotionSource(() => {
    // The version tag is `parseMotionSpec`'s, and so is every shape under it.
    // What is left in this block is the one question the motion file cannot
    // answer on its own.
    // The motion spec was authored against one formation. Pairing it with another
    // rig would aim its keys at bones whose names happen to match and whose meaning
    // does not — the class of wrongness that loads, plays and lies.
    if (motion.archetype !== rig.name) {
      throw new CompileError(
        `motion spec names archetype "${motion.archetype}" but the rig spec at ${rigPath} is called "${rig.name}"`,
      );
    }
  });

  // The stage. The rig may state it outright (a foreign skeleton has no crop);
  // otherwise the manifest's crop is it. With neither there is nothing to
  // measure a full-frame mesh against, so the compile stops rather than guess.
  const stageWidth = rig.skeleton?.width ?? manifest?.crop.w;
  const stageHeight = rig.skeleton?.height ?? manifest?.crop.h;
  if (stageWidth === undefined || stageHeight === undefined) {
    throw new CompileError(
      'no stage size: give the rig spec a `skeleton.width`/`skeleton.height`, or compile against a cut manifest whose `crop` states them',
    );
  }
  /** Crop height, for the y-down -> y-up flip. Only manifest data uses it. */
  const cropH = manifest?.crop.h ?? stageHeight;
  const imagesDir = opts.imagesDir !== undefined ? resolve(opts.imagesDir) : resolve(dirname(rigPath), rig.images ?? '.');

  // -- 1. gather images ------------------------------------------------------
  // Region name = attachment name = PNG basename.
  const images: CompiledImage[] = [];
  const droppedStates: CompileResult['droppedStates'] = [];
  const seenRegions = new Set<string>();

  /** The pre-packed atlas `--atlas-in` named, parsed once, or null. */
  const atlasIn = opts.atlasInPath === undefined ? null : readAtlasIn(resolve(opts.atlasInPath));

  const addImage = (relPath: string, baseDir: string, isBase: boolean): CompiledImage => {
    const region = basename(relPath, '.png');
    if (seenRegions.has(region)) {
      throw new CompileError(`duplicate region name "${region}" (${relPath})`);
    }
    const img =
      atlasIn === null
        ? fromLoosePng(relPath, resolve(baseDir, relPath), region, isBase, outDir)
        : resolveFromAtlas(relPath, region, isBase, outDir, atlasIn);
    seenRegions.add(region);
    images.push(img);
    return img;
  };

  // A manifest may name a part the cut does not carry. A formation can declare
  // more slots than any one cut fills, and a cut that shares a sprite with the
  // scene around it has no plate of its own to point at — the manifest then
  // records the part as `image: null` with no window at all. That entry is a
  // documented ABSENCE, not a part — and it used to crash the compiler on its
  // missing `offset` rather than being tolerated, so "the optional slots are
  // optional" needed this line to actually be true.
  const absentParts: CompileResult['absentParts'] = [];
  const declaredParts = (manifest?.parts ?? []).filter((part) => {
    if (part.image === null && !part.states) {
      absentParts.push({ slot: rigSlotOf(part), why: 'manifest declares `image: null` and no states' });
      return false;
    }
    return true;
  });
  // ⚠️ `rig_slot` is the join key, not `slot`. A cut manifest that doubles as the
  // art pipeline's record carries slot names of its own and that pipeline's
  // scripts select on them; the rig's slot table is what the runtime, the tooling
  // and the viewer join on. So the mapping is manifest data, and the rig's table
  // stays single-valued — one name per slot, which is the only way A26 and a
  // "hide this slot" probe can mean the same thing on every cut.
  const parts = declaredParts
    .map((part) => (part.rig_slot && part.rig_slot !== part.slot ? { ...part, slot: part.rig_slot } : part))
    .sort((a, b) => a.draw_order - b.draw_order);

  const rigSlotIndex = new Map(rig.slots.map((slot, i) => [slot.name, i]));
  for (const part of parts) {
    if (!rigSlotIndex.has(part.slot)) {
      throw new CompileError(
        `the manifest binds a part to slot "${part.slot}" (via rig_slot), which the rig "${rig.name}" does not declare — add the slot to the rig rather than inventing one here`,
      );
    }
  }
  // 🔑 Two files now state a draw order — the manifest's `draw_order` numbers and
  // the rig's slot array — and two sources for one fact is how they come to
  // disagree. The rig's array wins (it IS the emitted order, which is Spine's own
  // semantics), and a manifest that orders its parts differently is refused here
  // rather than silently overruled.
  let orderCursor = -1;
  for (const part of parts) {
    const at = rigSlotIndex.get(part.slot)!;
    if (at < orderCursor) {
      throw new CompileError(
        `the manifest draws "${part.slot}" (draw_order ${part.draw_order}) out of the rig's slot order; the rig's slots array IS the draw order`,
      );
    }
    orderCursor = at;
  }

  /** slot -> [attachment names], in the order the manifest lists the states. */
  const slotAttachments = new Map<string, string[]>();

  // Mesh parts, checked against the rig's budget before any geometry runs.
  const meshBudget = rig.invariants?.meshSlots ?? 0;
  const meshParts = parts.filter((part) => part.mesh);
  if (meshParts.length > meshBudget) {
    throw new CompileError(
      `${meshParts.length} mesh slot(s) declared but the rig "${rig.name}" allows ${meshBudget}` +
        ' — raise `invariants.meshSlots` in the rig spec if that budget is the thing being changed',
    );
  }
  for (const part of meshParts) {
    if (isBasePlate(part, manifest!)) {
      // A base plate mesh is a full-frame canvas every frame.
      throw new CompileError(`slot "${part.slot}" is the base plate; it must never be a mesh`);
    }
    const spec = part.mesh!;
    const kind = spec.kind ?? 'ring';
    if (kind === 'ring') {
      if (!part.polygon?.length) {
        throw new CompileError(`slot "${part.slot}" declares a ring mesh but has no polygon to use as its rim`);
      }
      if (spec.hull !== 'polygon') {
        throw new CompileError(`slot "${part.slot}": mesh.hull must be "polygon", got ${JSON.stringify(spec.hull)}`);
      }
      if (!spec.center || spec.inner === undefined) {
        throw new CompileError(`slot "${part.slot}": a ring mesh needs mesh.center and mesh.inner`);
      }
    } else {
      if (!spec.rows || !spec.chain?.length) {
        throw new CompileError(`slot "${part.slot}": a ribbon mesh needs mesh.rows and a mesh.chain`);
      }
    }
    if (!meshControlBones(part).length) {
      throw new CompileError(`slot "${part.slot}": a mesh with no control bone deforms nothing`);
    }
  }

  /**
   * How to name the thing whose size disagreed with the spec.
   *
   * ⭐ The message has to say which of the two it MEASURED, because the remedy is
   * different: a loose PNG is re-exported, an atlas region is repacked or the
   * spec is wrong about which region it wanted. Reading "torso.png is 40x80 but
   * the window is 40x81" while no torso.png was ever opened is the sort of
   * message that sends an author to the wrong file.
   */
  const measuredFrom = (img: CompiledImage, relPath: string): string =>
    img.atlas === undefined
      ? relPath
      : `region "${img.region}" of ${opts.atlasInPath!} (declared ${img.atlas.originalWidth}x${img.atlas.originalHeight} ` +
        `by its offsets${img.atlasScale === undefined ? '' : `, at scale: ${img.atlasScale}`})`;

  for (const part of parts) {
    const win = partWindow(part, manifest!);
    if (part.image) {
      // One unconditional attachment: the base plate, and every joint part.
      const img = addImage(part.image, manifestDir!, isBasePlate(part, manifest!));
      if (img.width !== win.w || img.height !== win.h) {
        throw new CompileError(
          `${measuredFrom(img, part.image)} is ${img.width}x${img.height} but the manifest window for "${part.slot}" is ${win.w}x${win.h}`,
        );
      }
      slotAttachments.set(part.slot, [img.region]);
      continue;
    }
    const names: string[] = [];
    for (const [state, relPath] of Object.entries(part.states ?? {})) {
      if (relPath === null) continue; // base pixels show through; nothing to emit
      // A manifest can outlive a state whose art was dropped. It still lists
      // it, so the compiler reports the gap rather than pretending either way —
      // and under `--atlas-in` the same question is asked of the atlas, because
      // there the pack IS where the art either is or is not. An OPTIONAL state
      // absent from the pack is that same documented gap; the unconditional
      // `part.image` above is the one that refuses by name (`resolveFromAtlas`).
      const absPath = resolve(manifestDir!, relPath);
      const present = atlasIn === null ? existsSync(absPath) : atlasIn.byName.has(basename(relPath, '.png'));
      if (!present) {
        droppedStates.push({
          slot: part.slot,
          state,
          path: relPath,
          // The DROP line has to name what was CONSULTED. "no PNG at
          // parts/iris_open.png" is a lie about an `--atlas-in` build, which
          // opened no such file, and it sends the reader to a directory instead
          // of to the pack that is missing the region.
          ...(atlasIn === null
            ? {}
            : { why: `no region "${basename(relPath, '.png')}" in ${atlasIn.path}` }),
        });
        continue;
      }
      const img = addImage(relPath, manifestDir!, false);
      if (img.width !== win.w || img.height !== win.h) {
        throw new CompileError(
          `${measuredFrom(img, relPath)} is ${img.width}x${img.height} but slot "${part.slot}" declares ${win.w}x${win.h}`,
        );
      }
      names.push(img.region);
    }
    slotAttachments.set(part.slot, names);
  }

  // Attachments the RIG declares. A cut with a manifest leaves `skins` empty and
  // gets its attachments from the parts above; a foreign skeleton has no manifest
  // and states them here. A slot filled from both is a compile error, because the
  // two would then be two records of one thing.
  const skinNames = Object.keys(rig.skins ?? {});
  // The two spellings of a skin entry, normalised once — every reader below takes
  // its attachments and its member lists from here rather than re-deciding which
  // form the spec used.
  const skinParts = new Map(
    skinNames.map((skinName) => [skinName, splitRigSkin(rig.skins![skinName], `rig skin "${skinName}"`)] as const),
  );
  const rigAttachmentNames = new Map<string, string[]>();
  for (const skinName of skinNames) {
    for (const [slotName, placeholders] of Object.entries(skinParts.get(skinName)!.attachments)) {
      if (!rigSlotIndex.has(slotName)) {
        throw new CompileError(`rig skin "${skinName}" gives attachments to slot "${slotName}", which the rig does not declare`);
      }
      if (slotAttachments.has(slotName)) {
        throw new CompileError(
          `slot "${slotName}" is filled by a manifest part AND by rig skin "${skinName}"; one slot, one source of attachments`,
        );
      }
      const names = rigAttachmentNames.get(slotName) ?? [];
      for (const [placeholder, att] of Object.entries(placeholders)) {
        if (names.includes(placeholder)) continue;
        names.push(placeholder);
        const image = (att as RigRegionAttachment).image;
        if (typeof image === 'string' && !seenRegions.has(basename(image, '.png'))) {
          addImage(image, imagesDir, false);
        }
      }
      rigAttachmentNames.set(slotName, names);
    }
  }

  // -- 2. atlas --------------------------------------------------------------
  //
  // Two shapes. The default builds one page per part out of what was measured.
  // `--atlas-in` emits the imported atlas itself, verbatim except for its page
  // NAMES, which are paths and have to be re-anchored to `outDir`. Re-serialising
  // it from the parse would silently drop every field this compiler has no reader
  // for — `scale:` most expensively — so the text passes through by line and only
  // the name lines are replaced (`rewritePageNames`).
  //
  // ⚠️ Regions the rig does not use stay in the emitted atlas. They are not a
  // defect: a real pack is shared between cuts, an unused region costs a consumer
  // nothing, and dropping them would make `--out` disagree with the pack it was
  // built from — which is the one thing an importer must not do.
  const atlasText =
    atlasIn === null
      ? buildAtlasText(images)
      : rewritePageNames(atlasIn.parsed, (name) =>
          relative(outDir, resolve(atlasIn.dir, name)).split('\\').join('/'),
        );

  // -- 3. bones --------------------------------------------------------------
  //
  // One path for every rig, because the two the archetype tables used to have
  // (an explicit tree placed by manifest anchors, and one bone per slot at the
  // part window's centre) are the same operation over a different crop point.
  // What the rig spec chooses is WHERE the point comes from; the flip into Spine
  // world and the inverse into the parent's local space are the same either way.
  if (manifest) checkAxisSelfConsistency(manifest);
  const axisSpineDeg = manifest?.axis ? screenToSpineDegrees(manifest.axis.deg) : null;
  const partBySlot = new Map(parts.map((part) => [part.slot, part]));

  const bones: SpineBone[] = [];
  for (const spec of rig.bones) {
    bones.push(buildBone(spec, bones, { rig, manifest, cropH, axisSpineDeg, partBySlot }));
  }
  const boneNames = new Set(bones.map((b) => b.name));
  let transforms: Map<string, BoneTransform>;
  try {
    transforms = computeWorldTransforms(bones);
  } catch (err) {
    if (err instanceof TransformError) throw new CompileError(err.message);
    throw err;
  }

  for (const part of parts) {
    for (const name of meshControlBones(part)) {
      if (!boneNames.has(name)) {
        throw new CompileError(
          `slot "${part.slot}" drives control bone "${name}", which the rig "${rig.name}" does not declare`,
        );
      }
    }
  }

  // -- 4. slots + skins ------------------------------------------------------
  // Draw order IS the slots array order. No separate field,
  // and the rig's array is that order.
  const slots: SpineSlot[] = [];
  const skinTables = new Map<string, Record<string, Record<string, SpineAttachment>>>();
  const tableFor = (skinName: string): Record<string, Record<string, SpineAttachment>> => {
    let table = skinTables.get(skinName);
    if (!table) {
      table = {};
      skinTables.set(skinName, table);
    }
    return table;
  };
  tableFor('default'); // rigc always emits a default skin, even when it is empty
  // ...and every skin the rig declares, for the same reason: a skin can now carry
  // `bones`/constraint lists with no attachments at all, and a skin that only
  // switches bones on would otherwise never reach the emitted array.
  for (const skinName of skinNames) tableFor(skinName);
  const meshBones = new Set<string>();
  const meshes: CompileResult['meshes'] = [];

  for (const rigSlot of rig.slots) {
    const part = partBySlot.get(rigSlot.name);
    const names = slotAttachments.get(rigSlot.name) ?? rigAttachmentNames.get(rigSlot.name) ?? [];
    if (!names.length) continue;

    const setup = motion.setup?.[rigSlot.name];
    // ⚠️ The entry's SHAPE is `parseMotionSpec`'s now (issue #307), and it had to
    // move: this loop walks the RIG's slots and `continue`s past one with no
    // attachments a few lines above, so the #293 shapes — `"lid_l": null` and,
    // far worse, `"lid_l": "plate"`, which reads `.attachment` off a string as
    // `undefined` and hides the slot in silence — stayed GREEN for exactly the
    // slots a reader is most likely to be halfway through wiring up. Everything
    // from here down is the half that needs the rig in front of it.
    if (setup !== undefined && rigSlot.attachment !== undefined) {
      throw new CompileError(
        `slot "${rigSlot.name}" has a setup attachment in the rig spec AND in the motion spec; the setup pose has one author`,
      );
    }
    let setupAttachment: string | null;
    if (setup !== undefined) setupAttachment = setup.attachment ?? null;
    else if (rigSlot.attachment !== undefined) setupAttachment = rigSlot.attachment;
    else {
      throw new CompileError(
        `no setup pose for slot "${rigSlot.name}": give the motion spec a \`setup\` entry or the rig slot an \`attachment\` — the compiler will not guess one`,
      );
    }
    if (setupAttachment !== null && !names.includes(setupAttachment)) {
      throw new CompileError(
        `setup attachment "${setupAttachment}" for slot "${rigSlot.name}" is not one of [${names.join(', ')}]`,
      );
    }
    if (setup?.color && rigSlot.color !== undefined) {
      throw new CompileError(`slot "${rigSlot.name}" has a setup colour in the rig spec AND in the motion spec`);
    }
    const slot: SpineSlot = { name: rigSlot.name, bone: rigSlot.bone };
    if (setupAttachment !== null) slot.attachment = setupAttachment;
    if (setup?.color) slot.color = rgbaHex(setup.color);
    else if (rigSlot.color !== undefined) slot.color = rigSlot.color;
    if (rigSlot.dark !== undefined) slot.dark = rigSlot.dark;
    if (rigSlot.blend !== undefined) slot.blend = rigSlot.blend;
    slots.push(slot);

    if (part) {
      const perSlot: Record<string, SpineAttachment> = {};
      const mesh = part.mesh ? buildMesh(part, manifest!, bones, transforms, rigSlot.bone) : null;
      for (const name of names) {
        const img = images.find((im) => im.region === name);
        if (!img) throw new CompileError(`internal: no image for attachment ${name}`);
        if (mesh) {
          // Every state of a mesh slot gets the SAME geometry. That is what makes
          // an attachment swap mid-deform safe: the control bone's pose means the
          // same thing under all of them, so the swap and the deform do not fight.
          perSlot[name] = { ...mesh.attachment };
          continue;
        }
        perSlot[name] = placeRegion(part, manifest!, transforms.get(rigSlot.bone)!, img);
      }
      if (mesh) {
        const controls = meshControlBones(part);
        meshBones.add(rigSlot.bone);
        for (const name of controls) meshBones.add(name);
        meshes.push({
          slot: rigSlot.name,
          kind: mesh.kind,
          attachments: names,
          vertices: mesh.attachment.uvs.length / 2,
          triangles: mesh.attachment.triangles.length / 3,
          bones: [rigSlot.bone, ...controls],
        });
      }
      tableFor('default')[rigSlot.name] = perSlot;
      continue;
    }

    for (const skinName of skinNames) {
      const placeholders = skinParts.get(skinName)!.attachments[rigSlot.name];
      if (!placeholders) continue;
      const perSlot: Record<string, SpineAttachment> = {};
      for (const [placeholder, att] of Object.entries(placeholders)) {
        const where = `skin "${skinName}" slot "${rigSlot.name}" attachment "${placeholder}"`;
        perSlot[placeholder] = buildRigAttachment(att, placeholder, where, {
          images,
          bones,
          transforms,
          meshBones,
          meshes,
          slotName: rigSlot.name,
          anchorBone: rigSlot.bone,
          slotNames: new Set(rig.slots.map((s) => s.name)),
        });
      }
      tableFor(skinName)[rigSlot.name] = perSlot;
    }
  }
  // 📐 The implicit budget of 0 is a statement about rigc's own GENERATORS:
  // geometry rigc built is geometry rigc will not ship unmeasured, and
  // `A13_MESH_BUDGET` has nothing to measure a generated mesh against until the
  // rig states a budget out loud. It is not a statement about geometry somebody
  // else drew — `RigInvariants.meshTriangles` says the same thing in words:
  // a number baked in here would be one project's frame time masquerading as a
  // property of the format. So authored meshes count against a budget the rig
  // states out loud, and against nothing when it states none: rigc did not draw
  // them, so leaving them unmeasured is the author's call (issue #44's rule).
  // #277's coverage report splits the same way and lands on the other side of it:
  // both kinds are MEASURED, and only rigc's own output gets a wall.
  //
  // ⚠️ The message has to name the field, because the three doc places a reader
  // checks all read as "you do not need this" and one of them is §3.4's own
  // worked example (issue #274).
  const budgeted = rig.invariants?.meshSlots === undefined ? meshes.filter((m) => m.kind !== 'authored') : meshes;
  if (budgeted.length > meshBudget) {
    throw new CompileError(
      `${budgeted.length} mesh slot(s) emitted but the rig "${rig.name}" allows ${meshBudget}` +
        (rig.invariants?.meshSlots === undefined
          ? ' — a mesh rigc GENERATED counts against `invariants.meshSlots`, and this rig declares none, which is a ' +
            'budget of 0. Add `"invariants": { "meshSlots": ' +
            `${budgeted.length}, "meshTriangles": <triangles one mesh may carry> }\` to the rig spec: geometry rigc ` +
            'built is geometry it will not ship unmeasured, and `A13_MESH_BUDGET` has nothing to measure against ' +
            'until that budget is stated. (Authored geometry is exempt — rigc did not draw it.)'
          : ' — raise `invariants.meshSlots` in the rig spec if that budget is the thing being changed'),
    );
  }

  // -- 4b. constraints -------------------------------------------------------
  // One top-level `constraints` array, `type` per entry. Rig-declared first
  // (structure), then the motion spec's physics table (tuning). A name in both is
  // refused: `mix` timelines resolve by name, and two constraints answering to
  // one name is a timeline driving something nobody chose.
  const constraints: SpineConstraint[] = [];
  const physicsReport: CompileResult['physics'] = [];
  // Deform keys that stated a model instead of a run (issue #294). Declared here
  // rather than inside the animation loop because `explain` reports it across
  // every animation, and appended in emit order so the report reads in the order
  // the file does.
  const deformTransforms: CompileResult['deformTransforms'] = [];
  /** Group-track keys whose per-member values were stated or derived (issue #295). */
  const trackDerivations: CompileResult['trackDerivations'] = [];
  const constraintNames = new Set<string>();
  // `ik` and `transform` timelines resolve their target by name AND by type —
  // `findConstraint(name, IkConstraintData)` returns null for a transform
  // constraint of the same name and the parser then throws. Keeping the type
  // beside the name is what lets the refusal say which of the two it is.
  const constraintTypes = new Map<string, string>();
  /**
   * ik constraint -> the booleans it declares that the timeline format would
   * otherwise take away from it. Issue #273.
   *
   * 🚨 `SkeletonJson` reads `bendPositive`, `compress` and `stretch` in TWO
   * places with the same defaults: once on the constraint (`:155`) and once on
   * **every timeline key** (`:912`). A key that omits one does not inherit the
   * constraint's value — it asserts the parser's default. So a rig that declares
   * `bendPositive: false` and an `ik` timeline that keys only `mix` produce a
   * constraint that bends the other way for the whole animation, with the field
   * still in the file and inert: four builds differing only in these flags posed
   * one pose. What goes in this map is only the values that DIFFER from the
   * per-key default, because a rig that says nothing and a key that says nothing
   * already agree and there is nothing to carry.
   */
  const ikRigFlags = new Map<string, Record<string, boolean>>();
  // Which slots can actually show a path, for the path constraint's own check.
  // Read off the emitted skin tables rather than the spec, so it answers the
  // question the runtime asks: is there an attachment of that type on that slot?
  const pathSlots = new Map<string, string[]>();
  for (const [skinName, table] of skinTables) {
    for (const [slotName, perSlot] of Object.entries(table)) {
      for (const att of Object.values(perSlot)) {
        if ((att as { type?: string }).type !== 'path') continue;
        pathSlots.set(slotName, [...(pathSlots.get(slotName) ?? []), skinName]);
        break;
      }
    }
  }
  const constraintCtx: ConstraintContext = {
    boneNames,
    slotNames: new Set(rig.slots.map((s) => s.name)),
    pathSlots,
    animationNames: new Set(Object.keys(motion.animations ?? {})),
  };
  // Read as the raw records they are on disk: `buildRigConstraint` checks every
  // field itself, because a spec that came off a file has whatever the author
  // wrote in it and the union above is a claim about a correct one.
  for (const spec of (rig.constraints ?? []) as unknown as RigConstraintInput[]) {
    constraints.push(buildRigConstraint(spec, constraintCtx));
    constraintNames.add(spec.name);
    constraintTypes.set(spec.name, spec.type);
    if (spec.type === 'ik') {
      const carried: Record<string, boolean> = {};
      for (const flag of CONSTRAINT_TIMELINES.ik.flags) {
        const declared = spec[flag.field];
        if (typeof declared === 'boolean' && declared !== flag.dflt) carried[flag.field] = declared;
      }
      if (Object.keys(carried).length) ikRigFlags.set(spec.name, carried);
    }
  }
  withMotionSource(() => {
    for (const [name, spec] of Object.entries(motion.physics ?? {})) {
      if (constraintNames.has(name)) {
        throw new CompileError(`constraint "${name}" is declared in both the rig spec and the motion spec's physics table`);
      }
      constraintNames.add(name);
      constraintTypes.set(name, 'physics');
      if (!boneNames.has(spec.bone)) {
        throw new CompileError(`physics constraint "${name}" targets unknown bone "${spec.bone}"`);
      }
      const entry: SpineConstraint = {
        name,
        type: 'physics',
        bone: spec.bone,
      };
      const components: string[] = [];
      for (const comp of PHYSICS_COMPONENTS) {
        const v = spec[comp];
        if (v === undefined || v === 0) continue;
        entry[comp] = r6(v);
        components.push(comp);
      }
      if (!components.length) {
        // The parser is happy with this and the constraint does nothing at all.
        // A23 catches it too; refusing here means it never reaches the gate.
        throw new CompileError(
          `physics constraint "${name}" drives no component — set at least one of ${PHYSICS_COMPONENTS.join('/')}`,
        );
      }
      for (const [param, dflt] of PHYSICS_PARAMS) {
        const v = spec[param as keyof typeof spec] as number | undefined;
        if (v === undefined || v === dflt) continue;
        entry[param] = r6(v);
      }
      constraints.push(entry);
      physicsReport.push({
        name,
        bone: spec.bone,
        components,
        mix: spec.mix ?? 1,
        drivesMesh: meshBones.has(spec.bone),
      });
    }
  });

  // -- 5. animations ---------------------------------------------------------
  const animations: SpineSkeletonJson['animations'] = {};
  const declaredDurations: Record<string, number> = {};
  const slotNames = new Set(slots.map((s) => s.name));

  withMotionSource(() => {
    checkMotionGroups(motion);
    for (const [animName, anim] of Object.entries(motion.animations)) {
      declaredDurations[animName] = anim.duration;
      const slotTimelines: Record<string, Record<string, SpineTimelineKey[]>> = {};
      const boneTimelines: Record<string, Record<string, SpineTimelineKey[]>> = {};
      /** One table per constraint family, keyed the way the file is. */
      const familyTimelines: Record<ConstraintTrackFamily, Record<string, Record<string, SpineTimelineKey[]>>> = {
        physics: {},
        path: {},
        slider: {},
      };
      const claimed = new Set<string>();
      let compiledDuration = 0;

      for (const track of anim.tracks) {
        const family = constraintFamilyOf(track);
        const isBoneTrack = family === null && track.property in BONE_TRACKS;
        const targets = resolveTargets(track, motion, animName);
        // Per-member values are one statement about every member, so they are
        // resolved for the whole track before any target is compiled — and the
        // resolved keys are what everything below sees, which is why `v` means
        // one thing from here down (`MotionValueTrack`).
        const perMember = resolveMemberTrack(track, animName, targets, bones, trackDerivations);
        targets.forEach((target, index) => {
          const resolved = perMember.get(target)!;
          if (family !== null) {
            const label = CONSTRAINT_TRACK_FAMILIES[family].label;
            if (!constraintNames.has(target)) {
              const known = [...constraintTypes.entries()].filter(([, t]) => t === family).map(([n]) => n);
              throw new CompileError(
                `animation "${animName}" keys unknown ${label} "${target}"` +
                  (known.length ? ` (the rig declares: ${known.join(', ')})` : `, and the rig declares no ${family} constraint at all`),
              );
            }
            // Resolved by name AND by type in the parser
            // (`findConstraint(name, PathConstraintData)`), which returns null on
            // a type mismatch and makes `readAnimation` throw in the consumer's
            // process. Named here instead, where the motion file can be named too.
            const declared = constraintTypes.get(target);
            if (declared !== family) {
              throw new CompileError(
                `animation "${animName}" keys "${target}" as a ${label}, but the rig declares it as a "${declared}" ` +
                  'constraint — a timeline group resolves its target by name AND type, misses, and the loader throws',
              );
            }
          } else if (isBoneTrack) {
            if (!boneNames.has(target)) {
              throw new CompileError(`animation "${animName}" keys unknown bone "${target}"`);
            }
          } else if (!slotNames.has(target)) {
            throw new CompileError(`animation "${animName}" targets unknown slot "${target}"`);
          }
          const claim = `${target}.${track.property}`;
          if (claimed.has(claim)) {
            throw new CompileError(
              `animation "${animName}" has two tracks on ${claim}; merge them into one track`,
            );
          }
          claimed.add(claim);

          const shift = (track.lag ?? 0) + (track.stagger ?? 0) * index;
          const keys =
            family !== null
              ? compileValueTrack(
                  resolved,
                  motion,
                  animName,
                  anim.duration,
                  target,
                  shift,
                  CONSTRAINT_TRACK_FAMILIES[family].tracks,
                  CONSTRAINT_TRACK_FAMILIES[family].label,
                )
              : isBoneTrack
                ? compileValueTrack(resolved, motion, animName, anim.duration, target, shift, BONE_TRACKS, 'bone')
                : compileTrack(resolved, motion, animName, anim.duration, target, shift, tableFor('default'));
          for (const key of keys) compiledDuration = Math.max(compiledDuration, key.time as number);
          if (family !== null) (familyTimelines[family][target] ??= {})[track.property] = keys;
          else if (isBoneTrack) (boneTimelines[target] ??= {})[track.property] = keys;
          else (slotTimelines[target] ??= {})[track.property] = keys;
        });
      }

      // -- constraint timelines: one unnamed timeline per constraint ---------
      //
      // `ik` and `transform` sit beside `tracks` rather than in it because their
      // keys carry named fields instead of one `v` — see `MotionAnimation.ik`.
      // The target is resolved by name AND by type: `findConstraint(name,
      // IkConstraintData)` misses a transform constraint of the same name and the
      // parser throws in the consumer's process, so the mismatch is named here.
      const constraintTimelines: Record<'ik' | 'transform', Record<string, SpineTimelineKey[]>> = {
        ik: {},
        transform: {},
      };
      for (const group of ['ik', 'transform'] as const) {
        // The array, the entries and their `constraint` names are shapes, so
        // they are `parseMotionSpec`'s; what is left here needs the rig's
        // constraint table.
        const tracks: Array<MotionIkTrack | MotionTransformTrack> = anim[group] ?? [];
        for (const track of tracks) {
          const name = track.constraint;
          const type = constraintTypes.get(name);
          if (type === undefined) {
            const known = [...constraintTypes.entries()].filter(([, t]) => t === group).map(([n]) => n);
            throw new CompileError(
              `animation "${animName}" keys unknown ${group} constraint "${name}"; ` +
                (known.length
                  ? `the rig declares ${group} constraint(s): ${known.join(', ')}`
                  : `the rig declares no ${group} constraint at all`),
            );
          }
          if (type !== group) {
            throw new CompileError(
              `animation "${animName}" keys "${name}" as ${group === 'ik' ? 'an' : 'a'} ${group} constraint, but the rig declares it as a ` +
                `"${type}" constraint — the parser looks a timeline's target up by name AND type, misses, and throws`,
            );
          }
          if (constraintTimelines[group][name]) {
            throw new CompileError(
              `animation "${animName}" has two ${group} timelines on constraint "${name}"; ` +
                'the group holds one timeline per constraint, so merge them into one',
            );
          }
          const keys = compileConstraintTrack(
            group,
            track,
            motion,
            animName,
            anim.duration,
            ikRigFlags.get(name) ?? {},
          );
          for (const key of keys) compiledDuration = Math.max(compiledDuration, key.time as number);
          constraintTimelines[group][name] = keys;
        }
      }

      // -- deform timelines: keyed on a skin/slot/attachment triple ----------
      // Four deep, because the format is: skin -> slot -> attachment -> timeline
      // name -> keys. `deform` is one of two timeline names an attachment can
      // carry (the other is `sequence`), which is why the level exists at all.
      const deformTimelines: Record<string, Record<string, Record<string, Record<string, SpineTimelineKey[]>>>> = {};
      const deformTracks: MotionDeformTrack[] = anim.deform ?? [];
      for (const track of deformTracks) {
        const skinName = track.skin ?? 'default';
        const at = `animation "${animName}" deform ${skinName}/${String(track.slot)}/${String(track.attachment)}`;
        const table = skinTables.get(skinName);
        if (!table) {
          throw new CompileError(
            `${at}: this rig emits no skin called "${skinName}" (it emits: ${[...skinTables.keys()].join(', ')})`,
          );
        }
        const perSlot = table[track.slot];
        if (!perSlot) {
          throw new CompileError(
            `${at}: skin "${skinName}" gives slot "${String(track.slot)}" no attachments` +
              (slotNames.has(track.slot) ? '' : ', and this rig does not declare that slot at all'),
          );
        }
        const attachment = perSlot[track.attachment];
        if (!attachment) {
          throw new CompileError(
            `${at}: slot "${track.slot}" in skin "${skinName}" has no attachment "${String(track.attachment)}" ` +
              `(it has: ${Object.keys(perSlot).join(', ')})`,
          );
        }
        if (deformTimelines[skinName]?.[track.slot]?.[track.attachment]) {
          throw new CompileError(`${at}: two deform timelines on one attachment; merge them into one`);
        }
        const keys = compileDeformTrack(
          track,
          motion,
          animName,
          anim.duration,
          deformGeometryOf(attachment, at),
          deformTransforms,
        );
        for (const key of keys) compiledDuration = Math.max(compiledDuration, key.time as number);
        ((deformTimelines[skinName] ??= {})[track.slot] ??= {})[track.attachment] = { deform: keys };
      }

      const drawOrder = anim.drawOrder ? compileDrawOrder(anim.drawOrder, animName, anim.duration, slots) : null;
      if (drawOrder) for (const key of drawOrder) compiledDuration = Math.max(compiledDuration, key.time as number);

      const eventKeys = anim.events ? compileEvents(anim.events, animName, anim.duration, rig.events ?? {}) : null;
      // An event timeline counts towards the animation's length the same as any
      // other: `readAnimation` takes the duration from the longest timeline it
      // built, and `EventTimeline.getDuration()` is its last frame like the rest.
      if (eventKeys) for (const key of eventKeys) compiledDuration = Math.max(compiledDuration, key.time as number);

      // Rule 4: the declared duration is verified, because skeleton JSON does not
      // carry one — the loader takes the max key time.
      //
      // This arm is about the DECLARED DURATION being wrong, so it compares one
      // number per animation and tolerates a frame of it. The other arm —
      // `checkKeyTime`, above, per key — is about a key landing past the end, and
      // a frame is 16,667 times too coarse to see one. Both are needed: this one
      // catches an animation that stops a second early, and only that one catches
      // a key on a track whose neighbour already sits on the declared duration.
      if (Math.abs(compiledDuration - anim.duration) > FRAME) {
        throw new CompileError(
          `animation "${animName}" declares duration ${anim.duration}s but its last key is at ${compiledDuration}s`,
        );
      }
      // Group order is `readAnimation`'s own reading order, so an emitted file
      // diffs cleanly against an editor export. Each line is conditional, which
      // is what keeps a spec that uses none of the new groups byte-identical.
      animations[animName] = {};
      if (Object.keys(slotTimelines).length) animations[animName].slots = slotTimelines;
      if (Object.keys(boneTimelines).length) animations[animName].bones = boneTimelines;
      if (Object.keys(constraintTimelines.ik).length) animations[animName].ik = constraintTimelines.ik;
      if (Object.keys(constraintTimelines.transform).length) {
        animations[animName].transform = constraintTimelines.transform;
      }
      if (Object.keys(familyTimelines.path).length) animations[animName].path = familyTimelines.path;
      if (Object.keys(familyTimelines.physics).length) animations[animName].physics = familyTimelines.physics;
      if (Object.keys(familyTimelines.slider).length) animations[animName].slider = familyTimelines.slider;
      if (Object.keys(deformTimelines).length) animations[animName].attachments = deformTimelines;
      if (drawOrder) animations[animName].drawOrder = drawOrder;
      if (eventKeys) animations[animName].events = eventKeys;
    }
  });

  // -- 6. assemble -----------------------------------------------------------
  const header: SpineSkeletonJson['skeleton'] = {
    spine: SPINE_VERSION,
    x: rig.skeleton?.x ?? 0,
    y: rig.skeleton?.y ?? 0,
    width: stageWidth,
    height: stageHeight,
  };
  if (rig.skeleton?.fps !== undefined) header.fps = rig.skeleton.fps;
  if (rig.skeleton?.referenceScale !== undefined) header.referenceScale = rig.skeleton.referenceScale;
  if (rig.skeleton?.images !== undefined) header.images = rig.skeleton.images;

  // Event definitions. Emitted in the order the rig spec declares them — object
  // key order is the spec's, not a set's, so A18 stays a contract.
  const events: Record<string, SpineEvent> = {};
  for (const [name, def] of Object.entries(rig.events ?? {})) {
    const entry: SpineEvent = {};
    if (def.int !== undefined) entry.int = def.int;
    if (def.float !== undefined) entry.float = r6(def.float);
    if (def.string !== undefined) entry.string = def.string;
    if (def.audio !== undefined) entry.audio = def.audio;
    if (def.volume !== undefined) entry.volume = r6(def.volume);
    if (def.balance !== undefined) entry.balance = r6(def.balance);
    events[name] = entry;
  }

  const skeleton: SpineSkeletonJson = {
    skeleton: header,
    bones,
    slots,
    // A skin entry is `name`, then whatever it activates, then `attachments` —
    // `readSkeletonData`'s own order (`:372-443`). Every member list is a
    // conditional spread, so a rig that declares none emits the two-key entry it
    // always did, byte for byte.
    skins: [...skinTables.entries()].map(([name, attachments]) => {
      const parts = skinParts.get(name);
      return {
        name,
        ...(parts?.bones.length ? { bones: parts.bones } : {}),
        ...Object.fromEntries(
          RIG_SKIN_CONSTRAINT_KEYS.filter((key) => parts?.constraints[key].length).map((key) => [
            key,
            parts!.constraints[key],
          ]),
        ),
        attachments,
      };
    }),
    // Between `skins` and `animations`, which is where the editor writes it. A
    // conditional spread rather than an assignment after the literal, so the key
    // lands in that position instead of at the end.
    ...(Object.keys(events).length ? { events } : {}),
    animations,
  };
  if (constraints.length) skeleton.constraints = constraints;

  for (const slot of slots) {
    if (!boneNames.has(slot.bone)) throw new CompileError(`slot "${slot.name}" has no bone`);
  }

  return {
    skeleton,
    skeletonText: `${JSON.stringify(skeleton, null, 2)}\n`,
    atlasText,
    images,
    droppedStates,
    absentParts,
    declaredDurations,
    meshBones: [...meshBones],
    meshes,
    physics: physicsReport,
    deformTransforms,
    trackDerivations,
    rig: buildRigInfo(rig, bones, meshes, manifest),
  };
}

// ---------------------------------------------------------------------------
// bones
// ---------------------------------------------------------------------------

interface BoneContext {
  rig: RigSpec;
  manifest: FaceManifest | null;
  cropH: number;
  axisSpineDeg: number | null;
  partBySlot: Map<string, FaceManifestPart>;
}

/**
 * One rig bone -> one emitted bone.
 *
 * 🔑 A field is emitted exactly when the spec declared it. That is not Spine's
 * own exporter convention (it omits anything equal to the default) and the
 * difference is deliberate: a formation may need to say `x: 0` out loud, and
 * deciding emission from the arithmetic rather than from the author's text makes
 * the file depend on a rounding.
 */
function buildBone(spec: RigBone, soFar: SpineBone[], ctx: BoneContext): SpineBone {
  const bone: SpineBone = { name: spec.name };
  if (spec.parent !== undefined) bone.parent = spec.parent;
  if (spec.length !== undefined) bone.length = r6(spec.length);

  const crop = cropPointOf(spec, ctx);
  if (crop) {
    // Crop pixels (y down) -> Spine world (y up) -> the parent's local space. The
    // inverse is the same one the mesh binder uses, so a rotated parent (the axis
    // bone, a grip) is handled once rather than per call site.
    const world: [number, number] = [crop[0], cropToSpineY(crop[1], ctx.cropH)];
    if (spec.parent === undefined) {
      bone.x = r6(world[0]);
      bone.y = r6(world[1]);
    } else {
      const parent = computeWorldTransforms(soFar).get(spec.parent);
      if (!parent) throw new CompileError(`bone "${spec.name}" names parent "${spec.parent}", which is declared after it`);
      const [lx, ly] = toBoneLocal(parent, world[0], world[1]);
      bone.x = lx;
      bone.y = ly;
    }
  } else {
    if (spec.x !== undefined) bone.x = r6(spec.x);
    if (spec.y !== undefined) bone.y = r6(spec.y);
  }

  const rotation = rotationOf(spec, ctx);
  if (rotation !== null) bone.rotation = r6(rotation);
  if (spec.scaleX !== undefined) bone.scaleX = r6(spec.scaleX);
  if (spec.scaleY !== undefined) bone.scaleY = r6(spec.scaleY);
  if (spec.shearX !== undefined) bone.shearX = r6(spec.shearX);
  if (spec.shearY !== undefined) bone.shearY = r6(spec.shearY);
  if (spec.inherit !== undefined) bone.inherit = spec.inherit;
  if (spec.skin !== undefined) bone.skin = spec.skin;
  if (spec.color !== undefined) bone.color = spec.color;
  if (spec.icon !== undefined) bone.icon = spec.icon;
  return bone;
}

/** The crop-pixel point a bone's `from` names, or null when it declares none. */
function cropPointOf(spec: RigBone, ctx: BoneContext): [number, number] | null {
  const from = spec.from;
  if (!from) return null;
  const needManifest = (what: string): FaceManifest => {
    if (!ctx.manifest) {
      throw new CompileError(`bone "${spec.name}" takes its position from ${what}, which needs a cut manifest`);
    }
    return ctx.manifest;
  };
  if (from.anchor !== undefined) {
    const manifest = needManifest(`the manifest anchor "${from.anchor}"`);
    const anchor = manifest.anchors?.[from.anchor];
    if (!anchor || anchor.length < 2) {
      throw new CompileError(
        `manifest anchors has no [x, y] for "${from.anchor}" (bone "${spec.name}" of rig "${ctx.rig.name}")`,
      );
    }
    return [anchor[0], anchor[1]];
  }
  if (from.slotWindow !== undefined) {
    const manifest = needManifest(`the window of slot "${from.slotWindow}"`);
    const part = ctx.partBySlot.get(from.slotWindow);
    if (!part) {
      throw new CompileError(
        `bone "${spec.name}" sits at the centre of slot "${from.slotWindow}", which this cut's manifest carries no part for`,
      );
    }
    const win = partWindow(part, manifest);
    return [win.x + win.w / 2, win.y + win.h / 2];
  }
  if (from.meshCenter !== undefined) {
    needManifest(`the mesh centre of slot "${from.meshCenter}"`);
    const centre = ctx.partBySlot.get(from.meshCenter)?.mesh?.center;
    if (!centre) {
      throw new CompileError(
        `bone "${spec.name}" sits on the mesh centre of slot "${from.meshCenter}", which declares no mesh.center`,
      );
    }
    return [centre[0], centre[1]];
  }
  return null;
}

/** The setup rotation a bone declares, in Spine degrees, or null for none. */
function rotationOf(spec: RigBone, ctx: BoneContext): number | null {
  const source = spec.from?.rotation;
  if (source === 'axis') {
    if (ctx.axisSpineDeg === null) {
      throw new CompileError(`bone "${spec.name}" takes its rotation from the cut axis, which the manifest does not declare`);
    }
    return ctx.axisSpineDeg;
  }
  if (source === 'anchor') {
    const key = spec.from!.anchor!;
    const anchor = ctx.manifest?.anchors?.[key];
    if (!anchor || anchor.length < 3) {
      throw new CompileError(
        `bone "${spec.name}" takes its rotation from anchor "${key}", which has no third element (a screen-space facing angle)`,
      );
    }
    return screenToSpineDegrees(anchor[2]);
  }
  return spec.rotation ?? null;
}

// ---------------------------------------------------------------------------
// rig-declared attachments
// ---------------------------------------------------------------------------

interface AttachmentContext {
  images: CompiledImage[];
  bones: SpineBone[];
  transforms: Map<string, BoneTransform>;
  meshBones: Set<string>;
  meshes: CompileResult['meshes'];
  slotName: string;
  anchorBone: string;
  /** Every slot the rig declares — a clipping attachment's `end` resolves here. */
  slotNames: Set<string>;
}

/**
 * Build one attachment a rig spec authored, as opposed to one a manifest part
 * produced.
 *
 * The types this refuses are refused BY NAME. The parser's own behaviour on an
 * attachment type it does not know is to return null and drop it
 * (`SkeletonJson.ts:653`), so passing an unimplemented type through would produce
 * a skeleton missing an attachment nobody was told about.
 */
function buildRigAttachment(
  att: RigAttachment,
  placeholder: string,
  where: string,
  ctx: AttachmentContext,
): SpineAttachment {
  const type = att.type ?? 'region';
  if (type === 'region') return buildRigRegion(att as RigRegionAttachment, placeholder, where, ctx);
  if (type === 'mesh') return buildRigMesh(att as RigMeshAttachment, placeholder, where, ctx);
  if (type === 'boundingbox') return buildRigBoundingBox(att as RigBoundingBoxAttachment, where, ctx);
  if (type === 'clipping') return buildRigClipping(att as RigClippingAttachment, where, ctx);
  if (type === 'path') return buildRigPath(att as RigPathAttachment, where, ctx);
  throw new NotImplementedError(
    `${where}: attachment type "${String(type)}" is in the Spine 4.3 format and rigc does not emit it yet. ` +
      'Implemented: region, mesh, boundingbox, clipping, path. ' +
      'point and linkedmesh are deliberately deferred: neither appears anywhere in the benchmark ' +
      'corpus (docs/SPEC_COVERAGE.md parts 3-1 and 4-2), so neither is on the ladder\'s critical path. ' +
      'docs/SPEC_COVERAGE.md part 1-6 lists what each type would have to carry.',
  );
}

/**
 * Encode the polygon a bounding box or a clipping attachment carries.
 *
 * 🚨 `vertexCount` is required, and everything else here is a cross-check of it.
 * The parser reads `map.vertexCount << 1` and hands that to `readVertices` as the
 * length to expect (`:552`, `:632`) — so with the field absent it expects 0,
 * takes the weighted branch, decodes the coordinate list as
 * `boneCount, (index, x, y, weight) × n`, and returns an attachment holding
 * whatever that garbage produced. It loads. It draws nothing (a bounding box
 * never did) and clips nothing, or clips the wrong shape, in complete silence.
 *
 * The two encodings are the mesh's — `encodeNamedWeights` is the same function —
 * because they are the same field with the same trap: `readVertices` decides
 * weighted vs unweighted by a length comparison alone, and a coincidental match
 * reads weight data as coordinates.
 */
function buildVertexGeometry(att: RigVertexGeometry, where: string, ctx: AttachmentContext): number[] {
  const count = att.vertexCount;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 3) {
    throw new CompileError(
      `${where}: vertexCount is ${JSON.stringify(count)}; a polygon needs at least 3 vertices, stated outright — ` +
        'the field has no parser default, and an absent one reads as 0 and takes the polygon with it',
    );
  }
  if (att.vertices && att.weights) {
    throw new CompileError(
      `${where}: geometry comes as "vertices" or as "weights", never both — "weights" is the by-name form of the same data`,
    );
  }
  if (att.weights) {
    if (att.boneIndexing === 'raw') {
      throw new CompileError(`${where}: "boneIndexing": "raw" describes a "vertices" run; "weights" always binds by name`);
    }
    if (att.weights.length !== count) {
      throw new CompileError(`${where}: weights cover ${att.weights.length} vertices but vertexCount is ${count}`);
    }
    return encodeNamedWeights(att.weights, where, ctx);
  }
  const raw = att.vertices;
  if (!raw || raw.length === 0) {
    throw new CompileError(`${where}: needs geometry — "vertices" (x, y per vertex) or "weights" (bound by name)`);
  }
  const unweighted = raw.length === count * 2;
  if (!unweighted) {
    if (att.boneIndexing !== 'raw') {
      throw new CompileError(
        `${where}: vertexCount ${count} wants ${count * 2} unweighted numbers and "vertices" holds ${raw.length}. ` +
          'The parser reads that as a WEIGHTED run, whose bone INDEXES point into the emitted bone array — a list ' +
          'the spec never writes, so inserting a bone rebinds every vertex in silence. ' +
          'Give the bindings by name as "weights": [[{ "bone": …, "x": …, "y": …, "weight": … }, …], …], ' +
          'fix vertexCount, or say "boneIndexing": "raw" on this attachment to keep the index form deliberately.',
      );
    }
    // A raw run still has to decode to exactly `vertexCount` vertices, or the
    // count and the polygon disagree and the parser believes the count.
    let decoded = 0;
    for (let i = 0; i < raw.length; decoded++) {
      const bones = raw[i++];
      if (!Number.isInteger(bones) || bones < 1) {
        throw new CompileError(`${where}: the raw weighted run has a bone count of ${String(bones)} at index ${i - 1}`);
      }
      i += bones * 4;
      if (i > raw.length) {
        throw new CompileError(
          `${where}: the raw weighted run is truncated — vertex ${decoded} claims ${bones} bone(s) and the array ends first`,
        );
      }
    }
    if (decoded !== count) {
      throw new CompileError(`${where}: the raw weighted run decodes to ${decoded} vertices but vertexCount is ${count}`);
    }
    // Register the bones it binds so the mesh-bone reports stay complete.
    for (let i = 0; i < raw.length; ) {
      const bones = raw[i++];
      for (let k = 0; k < bones; k++, i += 4) {
        const bone = ctx.bones[raw[i]];
        if (bone) ctx.meshBones.add(bone.name);
      }
    }
  }
  for (const n of raw) {
    if (!Number.isFinite(n)) throw new CompileError(`${where}: the vertex array holds a non-finite value ${String(n)}`);
  }
  return raw.map(r6);
}

function buildRigBoundingBox(
  att: RigBoundingBoxAttachment,
  where: string,
  ctx: AttachmentContext,
): SpineBoundingBoxAttachment {
  const out: SpineBoundingBoxAttachment = {
    type: 'boundingbox',
    vertexCount: att.vertexCount,
    vertices: buildVertexGeometry(att, where, ctx),
  };
  if (att.color !== undefined) out.color = att.color;
  return out;
}

function buildRigClipping(
  att: RigClippingAttachment,
  where: string,
  ctx: AttachmentContext,
): SpineClippingAttachment {
  if (att.end !== undefined) {
    // `skeletonData.findSlot` returns null on a miss and the parser assigns that
    // null (`:626-627`), so a typo does not fail — the clip simply never ends and
    // takes every slot below it out of the frame.
    if (typeof att.end !== 'string' || !ctx.slotNames.has(att.end)) {
      throw new CompileError(
        `${where}: end names slot ${JSON.stringify(att.end)}, which this rig does not declare; ` +
          'a miss loads as null and the clip then runs to the bottom of the draw order',
      );
    }
  }
  // Field order is the editor's here — `end`, `convex`, `inverse` before the
  // geometry — via conditional spreads, because a key assigned after the literal
  // lands at the end instead. Order carries no meaning in JSON; it is read by
  // people, and this file's diff against a reference is read a lot.
  const out: SpineClippingAttachment = {
    type: 'clipping',
    ...(att.end !== undefined ? { end: att.end } : {}),
    ...(att.convex !== undefined ? { convex: att.convex } : {}),
    ...(att.inverse !== undefined ? { inverse: att.inverse } : {}),
    vertexCount: att.vertexCount,
    vertices: buildVertexGeometry(att, where, ctx),
  };
  if (att.color !== undefined) out.color = att.color;
  return out;
}

/**
 * Setup-pose world position of every vertex of an emitted vertex run.
 *
 * The two encodings again, and the same split `readVertices` makes: an unweighted
 * run is one `x, y` in the SLOT BONE's space; a weighted one is
 * `boneCount, (boneIndex, bindX, bindY, weight) × n` per vertex, and the vertex
 * is the weighted sum of each influence's bind point taken to world through its
 * own bone. This is `VertexAttachment.computeWorldVertices` at setup, restated in
 * the compiler because the compiler must not link the runtime.
 */
function setupWorldVertices(
  vertices: number[],
  vertexCount: number,
  anchor: BoneTransform,
  bones: SpineBone[],
  transforms: Map<string, BoneTransform>,
  where: string,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (vertices.length === vertexCount * 2) {
    for (let i = 0; i < vertices.length; i += 2) out.push(toWorld(anchor, vertices[i], vertices[i + 1]));
    return out;
  }
  for (let i = 0; i < vertices.length; ) {
    const count = vertices[i++];
    let x = 0;
    let y = 0;
    for (let n = 0; n < count; n++, i += 4) {
      const bone = bones[vertices[i]];
      const m = bone === undefined ? undefined : transforms.get(bone.name);
      if (!m) throw new CompileError(`${where}: vertex ${out.length} binds bone index ${vertices[i]}, which is not in the bone list`);
      const [wx, wy] = toWorld(m, vertices[i + 1], vertices[i + 2]);
      const weight = vertices[i + 3];
      x += wx * weight;
      y += wy * weight;
    }
    out.push([x, y]);
  }
  return out;
}

/**
 * How many samples per curve the arc-length measurement takes.
 *
 * 64 is a choice about accuracy, and the accuracy that matters is against the
 * runtime rather than against calculus: `PathConstraint` re-measures a
 * `constantSpeed` path with a **4-sample** forward difference per curve, so the
 * number here only has to be fine enough that the two agree to well inside the
 * tolerance anything downstream compares at. It is a constant rather than a
 * parameter because a per-call sample count would make `lengths` depend on the
 * caller, and A18 compares two emits byte for byte.
 */
const PATH_LENGTH_SAMPLES = 64;

/**
 * The knot-and-handle chain a path attachment's vertices actually form, in the
 * runtime's own order (`PathConstraint.computeWorldPositions`).
 *
 * ⭐ This is the part of the format a reader guesses wrong. The vertices are NOT
 * `3K + 1` Bezier points: the parser hands them to `readVertices` untouched, and
 * the constraint then **drops the first and last** on an open path (it computes
 * world vertices from offset 2 for `verticesLength - 4` numbers) because those
 * two are the outer control handles of the end knots, which no curve uses. A
 * closed path instead rotates by one and repeats the first knot at the end.
 * Either way what comes out is a `3K + 1` chain: knot, handle, handle, knot, …
 */
function pathChain(points: Array<[number, number]>, closed: boolean): Array<[number, number]> {
  if (!closed) return points.slice(1, points.length - 1);
  return [...points.slice(1), points[0], points[1]];
}

/**
 * Cumulative arc length at the end of each curve of the chain, in world units.
 *
 * One entry per curve, which is what `lengths[curve]` indexes: the parser walks
 * curves with `if (p > lengths[curve]) continue`, and reads `lengths[curveCount]`
 * — where `curveCount` is the LAST curve's index — as the total path length.
 */
function pathCurveLengths(chain: Array<[number, number]>): number[] {
  const out: number[] = [];
  let total = 0;
  for (let c = 0; c + 3 < chain.length; c += 3) {
    const [x1, y1] = chain[c];
    const [cx1, cy1] = chain[c + 1];
    const [cx2, cy2] = chain[c + 2];
    const [x2, y2] = chain[c + 3];
    let px = x1;
    let py = y1;
    for (let s = 1; s <= PATH_LENGTH_SAMPLES; s++) {
      const t = s / PATH_LENGTH_SAMPLES;
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const d = 3 * u * t * t;
      const e = t * t * t;
      const x = a * x1 + b * cx1 + d * cx2 + e * x2;
      const y = a * y1 + b * cy1 + d * cy2 + e * y2;
      total += Math.hypot(x - px, y - py);
      px = x;
      py = y;
    }
    out.push(total);
  }
  return out;
}

/**
 * `type: "path"` — the curve a path constraint slides bones along.
 *
 * Three things happen here that the parser will not do:
 *
 *   1. **`vertexCount` is checked against the group-of-three structure.** A count
 *      that is not a multiple of 3 does not throw anywhere:
 *      `Utils.newArray(vertexCount / 3, 0)` takes a fractional size happily, the
 *      groups of six then straddle the knots, and bones slide along a curve
 *      nobody drew. Too few points is the same failure with fewer symptoms — an
 *      open path needs 6 for one curve, a closed one 3.
 *   2. **`lengths` is measured, not copied.** See `RigPathAttachment`: it is the
 *      setup arc length of the geometry two fields above it, and a restated
 *      number that disagrees is only visible under `constantSpeed: false`, where
 *      it silently rescales the whole traversal.
 *   3. **An authored `lengths` is refused**, for that reason.
 */
function buildRigPath(att: RigPathAttachment, where: string, ctx: AttachmentContext): SpinePathAttachment {
  if (att.lengths !== undefined) {
    throw new CompileError(
      `${where}: "lengths" is not authored — rigc measures the setup arc length of each curve off the geometry, the ` +
        'same way it measures a region\'s size off its PNG. A restated length that disagrees with the vertices is ' +
        'invisible until `constantSpeed` is false, and then it rescales the whole traversal in silence.',
    );
  }
  const vertices = buildVertexGeometry(att, where, ctx);
  const count = att.vertexCount;
  const closed = att.closed === true;
  if (count % 3 !== 0) {
    throw new CompileError(
      `${where}: vertexCount is ${count}, which is not a multiple of 3. A path's vertices are knots AND their ` +
        'Bezier handles, read in groups of three; the parser sizes its lengths array with `vertexCount / 3` and ' +
        'accepts a fractional size without a word, so the curves would straddle the knots.',
    );
  }
  const minimum = closed ? 3 : 6;
  if (count < minimum) {
    throw new CompileError(
      `${where}: vertexCount is ${count} and ${closed ? 'a closed' : 'an open'} path needs at least ${minimum} — ` +
        `${closed ? 'a closed path of K curves carries 3K points' : 'an open one carries 3(K + 1), the first and last being the end knots\' outer handles'}`,
    );
  }
  const anchor = ctx.transforms.get(ctx.anchorBone);
  if (!anchor) throw new CompileError(`${where}: slot bone "${ctx.anchorBone}" has no setup transform`);
  const points = setupWorldVertices(vertices, count, anchor, ctx.bones, ctx.transforms, where);
  const lengths = pathCurveLengths(pathChain(points, closed));
  if (!lengths.length || !lengths.every((n) => Number.isFinite(n)) || lengths[lengths.length - 1] <= 0) {
    throw new CompileError(
      `${where}: the geometry measures ${lengths.length} curve(s) of total length ${String(lengths[lengths.length - 1])}; ` +
        'a path of zero length divides by zero the first time a bone is placed on it',
    );
  }
  // Field order is the parser's reading order (`:606-623`), and each optional key
  // is present exactly when the spec declared it — the rule the whole rig spec
  // follows, so Spine's own defaults stand for the rest.
  return {
    type: 'path',
    ...(att.closed !== undefined ? { closed: att.closed } : {}),
    ...(att.constantSpeed !== undefined ? { constantSpeed: att.constantSpeed } : {}),
    vertexCount: count,
    vertices,
    lengths: lengths.map(r6),
    ...(att.color !== undefined ? { color: att.color } : {}),
  };
}

function buildRigRegion(
  att: RigRegionAttachment,
  placeholder: string,
  where: string,
  ctx: AttachmentContext,
): SpineRegionAttachment {
  const img = att.image === undefined ? null : ctx.images.find((im) => im.region === basename(att.image!, '.png'));
  // ⭐ An IMPORTED region's size is not a default the spec may override. On the
  // loose path `att.width` and the PNG's width are two legitimate numbers — "draw
  // this drawing at this size" is a scale, and the region covers its page either
  // way. A packed region's rectangle is already fixed in the atlas, so a spec that
  // states a different size is stating a disagreement with the file it is being
  // resolved against, and the two would produce a quad the pack cannot fill.
  if (img?.atlas !== undefined) {
    for (const [field, stated, measured] of [
      ['width', att.width, img.width],
      ['height', att.height, img.height],
    ] as const) {
      if (stated !== undefined && stated !== measured) {
        throw new CompileError(
          `${where}: the spec says ${field} ${stated} and region "${img.region}" of the imported atlas is ` +
            `${measured} (bounds ${img.atlas.width}x${img.atlas.height}, offsets state a ` +
            `${img.atlas.originalWidth}x${img.atlas.originalHeight} drawing` +
            // The descaled number is in neither file, so the message says how it
            // was reached — otherwise "the spec says 745 and the region is 746"
            // reads as an off-by-one in the spec rather than as the pack's own
            // rounding, and the remedy is the opposite one.
            (img.atlasScale === undefined
              ? ''
              : ` in the page's texels, which its scale: ${img.atlasScale} makes a ` +
                `${img.width}x${img.height} drawing (+/- ${r6(0.5 / img.atlasScale)}px, the pack's rounding)`) +
            ')',
        );
      }
    }
  }
  const width = att.width ?? img?.width;
  const height = att.height ?? img?.height;
  if (width === undefined || height === undefined) {
    // No parser default: an omission loads as NaN and every UV collapses, with
    // no error at all. So it is this or nothing.
    throw new CompileError(
      `${where}: a region needs width and height — give them, or give an "image" and rigc will measure the PNG`,
    );
  }
  const out: SpineRegionAttachment = { width: r6(width), height: r6(height) };
  const region = att.image === undefined ? undefined : basename(att.image, '.png');
  if (att.path !== undefined) out.path = att.path;
  else if (region !== undefined && region !== placeholder) out.path = region;
  if (att.x !== undefined) out.x = r6(att.x);
  if (att.y !== undefined) out.y = r6(att.y);
  if (att.rotation !== undefined) out.rotation = r6(att.rotation);
  if (att.scaleX !== undefined) out.scaleX = r6(att.scaleX);
  if (att.scaleY !== undefined) out.scaleY = r6(att.scaleY);
  if (att.color !== undefined) out.color = att.color;
  return out;
}

/**
 * Resolve an authored mesh's by-name weights into Spine's index run.
 *
 * 🚨 This is the whole point of the `weights` form. The run is
 * `boneCount, (boneIndex, bindX, bindY, weight) x n` per vertex and those
 * indices are positions in the emitted bone array — a thing the rig spec never
 * writes. Resolving them here, from names, is what makes "insert a bone" a
 * renumbering rather than a rebinding: the names still point at the same bones,
 * so the emitted indices move and the mesh does not.
 *
 * An unknown name is a `CompileError`, the same as a bone's `parent`, a slot's
 * `bone` or a constraint's `target`. The alternative — the raw form — cannot
 * refuse anything, because an index has no name to be wrong.
 */
function encodeNamedWeights(weights: RigMeshBinding[][], where: string, ctx: AttachmentContext): number[] {
  const out: number[] = [];
  weights.forEach((vertex, i) => {
    if (!Array.isArray(vertex) || vertex.length === 0) {
      throw new CompileError(`${where}: vertex ${i} has no bone bindings; a weighted vertex names at least one bone`);
    }
    out.push(vertex.length);
    for (const binding of vertex) {
      const index = ctx.bones.findIndex((b) => b.name === binding.bone);
      if (index < 0) {
        throw new CompileError(
          `${where}: vertex ${i} binds bone ${JSON.stringify(binding.bone)}, which the rig does not declare as a bone`,
        );
      }
      out.push(index, r6(binding.x), r6(binding.y), r6(binding.weight));
    }
  });
  return out;
}

/**
 * Measure an authored mesh against the art it names, or report nothing.
 *
 * 🚨 A measurement, never a refusal — and that asymmetry with `contour` is the
 * whole decision (issue #277). A contour mesh is refused under 99.5% because rigc
 * GENERATED that geometry as a claim about the art: below the bar, rigc's own
 * arithmetic clipped the drawing. Authored geometry is the author's intent, and a
 * mesh that sits inside its art is a legitimate thing to draw — a soft feather, a
 * deliberately trimmed hull, a mesh meant to bend a core while its edges stretch.
 * Refusing those would be #44's mistake in a new place. So the figure is printed
 * and the decision stays with the author.
 *
 * Nothing is reported in the two cases where there is nothing to compare:
 * an attachment with no `image` (there is no PNG the mesh is a claim about), and
 * a part with no art at all (0 of 0 pixels is not a percentage). Neither is an
 * error here — a mesh with no image is ordinary data, and an all-transparent part
 * is somebody else's assertion to make.
 */
function measureAuthoredFit(att: RigMeshAttachment, ctx: AttachmentContext): MeshFitReport | null {
  if (att.image === undefined || att.uvs === undefined || att.triangles === undefined) return null;
  const region = basename(att.image, '.png');
  const img = ctx.images.find((im) => im.region === region);
  if (!img) return null;
  const plate = partPlate(img);
  const alpha = new Uint8Array(plate.width * plate.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = plate.data[i * 4 + 3];
  // uvs are the part window in 0..1 — the same normalisation `buildContourMesh`
  // emits — so the pixel grid they land on is the PLATE's, which is the grid the
  // alpha was read off. On an imported page that declares a `scale:` the
  // drawing's size and the plate's differ, and it is the plate that has pixels.
  const points = [] as Array<[number, number]>;
  for (let i = 0; i + 1 < att.uvs.length; i += 2) {
    points.push([att.uvs[i] * plate.width, att.uvs[i + 1] * plate.height]);
  }
  const fit = measureAuthoredMeshFit({ width: plate.width, height: plate.height, alpha }, 1, points, att.triangles);
  return fit.artPixels === 0 ? null : fit;
}

function buildRigMesh(
  att: RigMeshAttachment,
  placeholder: string,
  where: string,
  ctx: AttachmentContext,
): SpineMeshAttachment {
  const authored =
    att.uvs !== undefined || att.triangles !== undefined || att.vertices !== undefined || att.weights !== undefined;
  if (authored && att.generator) {
    throw new CompileError(`${where}: a mesh is either authored geometry or a generator, never both`);
  }
  if (att.generator) return buildGeneratedMesh(att, att.generator, placeholder, where, ctx);
  if (att.vertices && att.weights) {
    throw new CompileError(
      `${where}: a mesh gives geometry as "vertices" or as "weights", never both — "weights" is the by-name form of the same data`,
    );
  }
  if (!att.uvs || !att.triangles || !(att.vertices || att.weights)) {
    throw new CompileError(`${where}: an authored mesh needs uvs, triangles and vertices or weights (or a "generator")`);
  }
  const uvCount = att.uvs.length;
  let vertices: number[];
  let boundBones: string[] = [];
  if (att.weights) {
    if (att.boneIndexing === 'raw') {
      throw new CompileError(`${where}: "boneIndexing": "raw" describes a "vertices" run; "weights" always binds by name`);
    }
    if (att.weights.length !== uvCount / 2) {
      throw new CompileError(
        `${where}: weights cover ${att.weights.length} vertices but there are ${uvCount / 2} uv pairs`,
      );
    }
    vertices = encodeNamedWeights(att.weights, where, ctx);
    boundBones = [...new Set(att.weights.flat().map((b) => b.bone))];
  } else {
    const raw = att.vertices!;
    // An unweighted mesh is one x,y per uv pair. It names no bone, so there is
    // nothing here to rebind and nothing to opt into.
    const weighted = raw.length !== uvCount;
    if (weighted && att.boneIndexing !== 'raw') {
      throw new CompileError(
        `${where}: this mesh's "vertices" is a weighted run, whose bone INDEXES point into the emitted bone array — ` +
          'a list the spec never writes, so inserting a bone rebinds every vertex in silence. ' +
          'Give the bindings by name as "weights": [[{ "bone": …, "x": …, "y": …, "weight": … }, …], …], ' +
          'or say "boneIndexing": "raw" on this attachment to keep the index form deliberately.',
      );
    }
    vertices = raw.map(r6);
    if (weighted) {
      const names = new Set<string>();
      for (let i = 0; i < raw.length; ) {
        const n = raw[i++];
        for (let k = 0; k < n; k++, i += 4) {
          const bone = ctx.bones[raw[i]];
          if (bone) names.add(bone.name);
        }
      }
      boundBones = [...names];
    }
  }
  const out: SpineMeshAttachment = {
    type: 'mesh',
    uvs: att.uvs.map(r6),
    triangles: att.triangles,
    vertices,
    hull: att.hull ?? 0,
    width: r6(att.width ?? 0),
    height: r6(att.height ?? 0),
  };
  if (att.path !== undefined) out.path = att.path;
  if (att.edges !== undefined) out.edges = att.edges;
  if (att.color !== undefined) out.color = att.color;
  // Register it as `authored`: geometry rigc did not build and whose topology it
  // therefore gets to assume nothing about. The generator-topology assertions
  // read this and skip rather than measuring a ring that was never a ring.
  ctx.meshBones.add(ctx.anchorBone);
  for (const name of boundBones) ctx.meshBones.add(name);
  const fit = measureAuthoredFit(att, ctx);
  ctx.meshes.push({
    slot: ctx.slotName,
    kind: 'authored',
    attachments: [ctx.slotName],
    vertices: uvCount / 2,
    triangles: att.triangles.length / 3,
    bones: boundBones.length ? boundBones : [ctx.anchorBone],
    coverage: fit === null ? undefined : r6(fit.coverage),
    overshoot: fit?.overshoot,
  });
  return out;
}

/**
 * Invoke a `src/mesh.ts` builder from rig-spec data.
 *
 * ⚠️ This is the path a skeleton with NO cut manifest takes. A cut that has one
 * invokes the same builders through the manifest's `mesh` block instead, because
 * everything the builders need — the mask contour, the aperture centre, the part
 * window — is measured art, and measured art has exactly one home.
 */
function buildGeneratedMesh(
  att: RigMeshAttachment,
  generator: NonNullable<RigMeshAttachment['generator']>,
  placeholder: string,
  where: string,
  ctx: AttachmentContext,
): SpineMeshAttachment {
  if (generator.kind === 'contour') return buildContourAttachment(att, generator, placeholder, where, ctx);
  const controls = generator.kind === 'ring' ? generator.controls : generator.chain;
  const refFor = (name: string): MeshBoneRef => {
    const index = ctx.bones.findIndex((b) => b.name === name);
    if (index < 0) throw new CompileError(`${where}: mesh bone "${name}" is not in the rig's bone list`);
    const m = ctx.transforms.get(name);
    if (!m) throw new CompileError(`${where}: no setup transform for mesh bone "${name}"`);
    return { index, toBind: (wx, wy) => toBoneLocal(m, wx, wy) };
  };
  let geometry;
  try {
    geometry =
      generator.kind === 'ribbon'
        ? buildRibbonMesh({ size: generator.size, rows: generator.rows, chainCount: generator.chain.length })
        : buildRingMesh({
            hull: generator.hull,
            center: generator.center,
            inner: generator.inner,
            size: generator.size,
            bias: generator.bias,
          });
  } catch (err) {
    if (err instanceof MeshError) throw new CompileError(`${where}: ${err.message}`);
    throw err;
  }
  // The generator works in part-local pixels, y down. Without a manifest there is
  // no crop to flip against, so the part window is centred on its own slot bone.
  const [w, h] = generator.size;
  const anchor = ctx.transforms.get(ctx.anchorBone);
  if (!anchor) throw new CompileError(`${where}: slot bone "${ctx.anchorBone}" has no setup transform`);
  const vertices = encodeWeightedVertices(
    geometry,
    (px, py) => [r6(anchor.worldX + px - w / 2), r6(anchor.worldY + h / 2 - py)],
    { anchor: refFor(ctx.anchorBone), controls: controls.map(refFor) },
  );
  ctx.meshBones.add(ctx.anchorBone);
  for (const name of controls) ctx.meshBones.add(name);
  ctx.meshes.push({
    slot: ctx.slotName,
    kind: geometry.kind,
    attachments: [ctx.slotName],
    vertices: geometry.uvs.length / 2,
    triangles: geometry.triangles.length / 3,
    bones: [ctx.anchorBone, ...controls],
  });
  const out: SpineMeshAttachment = {
    type: 'mesh',
    uvs: geometry.uvs,
    triangles: geometry.triangles,
    vertices,
    hull: geometry.hullVertices,
    width: r6(w),
    height: r6(h),
  };
  if (att.path !== undefined) out.path = att.path;
  if (att.color !== undefined) out.color = att.color;
  return out;
}

/** Defaults for the `contour` generator's optional parameters, stated once. */
const CONTOUR_DEFAULTS = { margin: 1, maxVertices: 64, alpha: 1 } as const;

/**
 * Build a `contour` mesh: measure the attachment's own PNG, trace it, mesh it.
 *
 * ## Why this branch does not share the one above
 *
 * A `ring` or a `ribbon` takes its window size from the spec and its authority
 * from control bones. A contour takes both from the art: the size is the PNG's
 * own (so there is no number to disagree with the pixels), and there are no
 * control bones at all, because every vertex is pinned to the slot bone —
 * `buildContourMesh`'s header says why that is the whole weighting model.
 *
 * ⚠️ It reads PIXELS, which nothing else in this compiler does. `src/png.ts`
 * deliberately stops at the header, so the decode comes from
 * [`tools/plate.ts`](../tools/plate.ts) — the same codec `render` and `check`
 * already sample pages with, so "what alpha does this file have" has one answer
 * in this repository rather than two.
 *
 * The placement is the one the generator path documents: no manifest means no
 * crop to flip against, so the part window is centred on its own slot bone —
 * which is also what puts an undeformed contour mesh exactly where the plain
 * region attachment would have drawn it.
 */
function buildContourAttachment(
  att: RigMeshAttachment,
  generator: Extract<NonNullable<RigMeshAttachment['generator']>, { kind: 'contour' }>,
  placeholder: string,
  where: string,
  ctx: AttachmentContext,
): SpineMeshAttachment {
  if (att.image === undefined) {
    throw new CompileError(
      `${where}: a "contour" generator traces the part's own alpha, so the attachment needs an "image" — ` +
        'there is nothing else here that says which pixels to measure',
    );
  }
  const region = basename(att.image, '.png');
  const img = ctx.images.find((im) => im.region === region);
  if (!img) throw new CompileError(`${where}: no compiled image for "${att.image}"`);
  // ⚠️ Nothing here reads the PNG's colour type. `hasAlpha` answers "where does
  // this file keep its alpha", not "is any pixel of it transparent" — a tRNS
  // chunk is real transparency (issue #215) and an all-255 alpha channel is
  // none — so "this part has no silhouette to trace" is a question about pixels,
  // and `buildContourMesh` refuses it by counting them.
  const plate = partPlate(img);
  const alpha = new Uint8Array(plate.width * plate.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = plate.data[i * 4 + 3];

  const margin = generator.margin ?? CONTOUR_DEFAULTS.margin;
  const maxVertices = generator.maxVertices ?? CONTOUR_DEFAULTS.maxVertices;
  const threshold = generator.alpha ?? CONTOUR_DEFAULTS.alpha;
  let geometry;
  try {
    geometry = buildContourMesh({
      mask: { width: plate.width, height: plate.height, alpha },
      threshold,
      tolerance: generator.tolerance,
      margin,
      maxVertices,
    });
  } catch (err) {
    if (err instanceof MeshError) throw new CompileError(`${where}: ${err.message}`);
    throw err;
  }

  // Two grids, and they are the same one except on an imported page that
  // declares a `scale:`. The trace happens on the pixels that exist — the
  // plate's — and the mapping into world units below is the DRAWING's, which is
  // what `img.width/height` are (`resolveFromAtlas`). Keeping them apart is what
  // stops a contour mesh and a plain region attachment of the same imported art
  // from landing in different units (#267); on the loose path and on any pack at
  // `scale: 1` the two are equal and `toArt` is 1, so nothing moves.
  const w = img.width;
  const h = img.height;
  const toArt = w / plate.width;
  if (att.width !== undefined && att.width !== w) {
    throw new CompileError(`${where}: the spec says width ${att.width} and "${att.image}" measures ${w}`);
  }
  if (att.height !== undefined && att.height !== h) {
    throw new CompileError(`${where}: the spec says height ${att.height} and "${att.image}" measures ${h}`);
  }
  const anchor = ctx.transforms.get(ctx.anchorBone);
  if (!anchor) throw new CompileError(`${where}: slot bone "${ctx.anchorBone}" has no setup transform`);
  const index = ctx.bones.findIndex((b) => b.name === ctx.anchorBone);
  if (index < 0) throw new CompileError(`${where}: slot bone "${ctx.anchorBone}" is not in the rig's bone list`);
  const vertices = encodeWeightedVertices(
    geometry,
    (px, py) => [r6(anchor.worldX + px * toArt - w / 2), r6(anchor.worldY + h / 2 - py * toArt)],
    { anchor: { index, toBind: (wx, wy) => toBoneLocal(anchor, wx, wy) }, controls: [] },
  );
  ctx.meshBones.add(ctx.anchorBone);
  ctx.meshes.push({
    slot: ctx.slotName,
    kind: 'contour',
    attachments: [placeholder],
    vertices: geometry.uvs.length / 2,
    triangles: geometry.triangles.length / 3,
    bones: [ctx.anchorBone],
    coverage: geometry.contour?.coverage,
    overshoot: geometry.contour?.overshoot,
    holePixels: geometry.contour?.holePixels,
  });
  const out: SpineMeshAttachment = {
    type: 'mesh',
    uvs: geometry.uvs,
    triangles: geometry.triangles,
    vertices,
    hull: geometry.hullVertices,
    width: r6(w),
    height: r6(h),
  };
  // Same rule a region attachment follows: the atlas region is the PNG's
  // basename, so a placeholder named anything else needs `path` written down or
  // the loader resolves nothing.
  if (att.path !== undefined) out.path = att.path;
  else if (region !== placeholder) out.path = region;
  if (att.color !== undefined) out.color = att.color;
  return out;
}

// ---------------------------------------------------------------------------
// rig-declared constraints
// ---------------------------------------------------------------------------

/** The rig-constraint shape as this file consumes it: a name, a type, and fields. */
type RigConstraintInput = { name: string; type: string } & Record<string, unknown>;

/** The six property names a transform constraint may map between (`:241`, `:521`). */
const TRANSFORM_PROPERTIES = ['rotate', 'x', 'y', 'scaleX', 'scaleY', 'shearY'];

/** What a constraint's names resolve against. */
interface ConstraintContext {
  boneNames: Set<string>;
  slotNames: Set<string>;
  /** slot -> the skins whose table gives that slot a path attachment. */
  pathSlots: Map<string, string[]>;
  /** Animations the motion spec declares — a slider names one of them. */
  animationNames: Set<string>;
}

/**
 * 4.3 puts every constraint in one array and branches on `type`. An entry whose
 * type matches no case is dropped with no error and no `default:` branch, so an
 * unimplemented type is refused here by name rather than emitted and lost.
 */
function buildRigConstraint(spec: RigConstraintInput, ctx: ConstraintContext): SpineConstraint {
  const where = `rig constraint "${spec.name}"`;
  const boneNames = ctx.boneNames;
  const needBone = (name: unknown, field: string): string => {
    if (typeof name !== 'string' || !boneNames.has(name)) {
      throw new CompileError(`${where}: ${field} names ${JSON.stringify(name)}, which the rig does not declare as a bone`);
    }
    return name;
  };
  /**
   * One of the enum names the parser's `Utils.enumValue` can resolve.
   *
   * The rule is exactly `enumValue`'s own: only the first letter's case is free,
   * because that is the single character it normalises. Anything else resolves to
   * `undefined` and is assigned without a word, and the constraint then runs a
   * mode nobody chose — see `RIG_PATH_POSITION_MODES`.
   */
  const needEnum = (value: unknown, field: string, allowed: readonly string[]): string => {
    if (typeof value !== 'string' || !allowed.includes(value.charAt(0).toUpperCase() + value.slice(1))) {
      throw new CompileError(
        `${where}: ${field} is ${JSON.stringify(value)}; known: ${allowed.join(', ')} (only the first letter's case is ` +
          "free — the parser's enumValue uppercases that one character and nothing else, and an unresolved name " +
          'becomes undefined without an error)',
      );
    }
    return value;
  };
  const needNumber = (value: unknown, field: string): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new CompileError(`${where}: ${field} is ${JSON.stringify(value)}, which is not a finite number`);
    }
    return value;
  };
  const out: SpineConstraint = { name: spec.name, type: spec.type };
  const copy = (fields: readonly string[]) => {
    for (const field of fields) {
      const v = spec[field];
      if (v !== undefined) out[field] = typeof v === 'number' ? r6(v) : v;
    }
  };
  const boneList = (): string[] => {
    const list = spec.bones;
    if (!Array.isArray(list) || list.length === 0) {
      throw new CompileError(`${where}: a ${spec.type} constraint needs a non-empty "bones" array`);
    }
    return list.map((name, i) => needBone(name, `bones[${i}]`));
  };

  if (spec.type === 'ik') {
    out.bones = boneList();
    out.target = needBone(spec.target, 'target');
    copy(['scaleY', 'mix', 'softness', 'bendPositive', 'compress', 'stretch', 'skin']);
    return out;
  }
  if (spec.type === 'transform') {
    out.bones = boneList();
    out.source = needBone(spec.source, 'source');
    const properties = spec.properties as Record<string, { to?: Record<string, unknown> }> | undefined;
    for (const [from, entry] of Object.entries(properties ?? {})) {
      // The parser THROWS on a name outside the six, which is one of the few
      // places in this format that does not fail silently — but it throws at load
      // time, in the consumer's process, and that is late.
      if (!TRANSFORM_PROPERTIES.includes(from)) {
        throw new CompileError(`${where}: properties has "${from}"; known: ${TRANSFORM_PROPERTIES.join(', ')}`);
      }
      for (const to of Object.keys(entry?.to ?? {})) {
        if (!TRANSFORM_PROPERTIES.includes(to)) {
          throw new CompileError(`${where}: properties.${from}.to has "${to}"; known: ${TRANSFORM_PROPERTIES.join(', ')}`);
        }
      }
    }
    if (properties !== undefined) out.properties = properties;
    copy([
      'localSource',
      'localTarget',
      'additive',
      'clamp',
      'rotation',
      'x',
      'y',
      'scaleX',
      'scaleY',
      'shearY',
      'mixRotate',
      'mixX',
      'mixY',
      'mixScaleX',
      'mixScaleY',
      'mixShearY',
      'skin',
    ]);
    return out;
  }
  if (spec.type === 'path') {
    out.bones = boneList();
    // The parser throws `Couldn't find slot X for path constraint Y` on a miss —
    // loud, but in the consumer's process. The silent half is the one below it.
    const slot = spec.slot;
    if (typeof slot !== 'string' || !ctx.slotNames.has(slot)) {
      throw new CompileError(`${where}: slot names ${JSON.stringify(slot)}, which the rig does not declare as a slot`);
    }
    if (!ctx.pathSlots.has(slot)) {
      // `PathConstraint.update` opens with
      // `if (!(attachment instanceof PathAttachment)) return`, so a constraint
      // aimed at a slot that never shows a path does nothing whatsoever — no
      // error, no warning, and every mix in the file still says it is on.
      throw new CompileError(
        `${where}: slot "${slot}" has no path attachment in any skin, so the constraint has no curve to follow — ` +
          'PathConstraint.update returns immediately unless the slot\'s attachment is a path, which means this ' +
          'constraint would load, report every mix it was given, and move nothing. ' +
          'Give that slot an attachment with "type": "path".',
      );
    }
    out.slot = slot;
    for (const [field, allowed] of [
      ['positionMode', RIG_PATH_POSITION_MODES],
      ['spacingMode', RIG_PATH_SPACING_MODES],
      ['rotateMode', RIG_PATH_ROTATE_MODES],
    ] as const) {
      if (spec[field] !== undefined) out[field] = needEnum(spec[field], field, allowed);
    }
    for (const field of ['rotation', 'position', 'spacing', 'mixRotate', 'mixX', 'mixY'] as const) {
      if (spec[field] !== undefined) out[field] = r6(needNumber(spec[field], field));
    }
    copy(['skin']);
    return out;
  }
  if (spec.type === 'slider') {
    // ⭐ The one field in a rig spec that points at the MOTION spec. It is
    // resolved in a second pass over the constraints array once the animations
    // are read (`:495-507`) and a miss throws `Slider animation not found`, so
    // the refusal here is what turns that into a message naming both files.
    const animation = spec.animation;
    if (typeof animation !== 'string' || animation.length === 0) {
      throw new CompileError(
        `${where}: a slider needs an "animation" — the animation it applies. Without one the parser's second pass ` +
          'over the constraints array throws `Slider animation not found`.',
      );
    }
    if (!ctx.animationNames.has(animation)) {
      const known = [...ctx.animationNames];
      throw new CompileError(
        `${where}: applies animation "${animation}", which the motion spec does not declare` +
          (known.length ? ` (it declares: ${known.join(', ')})` : ' (it declares none at all)'),
      );
    }
    out.animation = animation;
    for (const field of ['additive', 'loop'] as const) {
      if (spec[field] !== undefined) out[field] = spec[field];
    }
    if (spec.mix !== undefined) out.mix = r6(needNumber(spec.mix, 'mix'));
    // `bone` is the switch between the two models, so the fields of the model
    // that was NOT chosen are refused rather than emitted: the parser reads
    // `time` only in the `else` branch and the property fields only in the `if`,
    // so the losing half is data no runtime will ever look at.
    const timeSide = ['time'] as const;
    const boneSide = ['property', 'from', 'to', 'scale', 'max', 'local'] as const;
    if (spec.bone !== undefined) {
      out.bone = needBone(spec.bone, 'bone');
      const property = spec.property;
      if (typeof property !== 'string' || !RIG_FROM_PROPERTIES.includes(property as (typeof RIG_FROM_PROPERTIES)[number])) {
        throw new CompileError(
          `${where}: drives off bone "${String(spec.bone)}" but its property is ${JSON.stringify(property)}; ` +
            `known: ${RIG_FROM_PROPERTIES.join(', ')} (the parser throws on anything else)`,
        );
      }
      out.property = property;
      for (const field of ['from', 'to', 'scale', 'max'] as const) {
        if (spec[field] !== undefined) out[field] = r6(needNumber(spec[field], field));
      }
      if (spec.local !== undefined) out.local = spec.local;
      if (spec.scale !== undefined && spec.scale === 0) {
        // time = to + (value - from) * 0, so the slider holds one frame forever.
        throw new CompileError(`${where}: scale is 0, so the bone's property cannot move the slider's time at all`);
      }
      for (const field of timeSide) {
        if (spec[field] !== undefined) {
          throw new CompileError(
            `${where}: declares both a "bone" and "${field}". A slider with a bone takes its time from that bone's ` +
              `property; "${field}" is read only by the bone-less form (\`:361\`), so it would be dropped in silence.`,
          );
        }
      }
    } else {
      if (spec.time !== undefined) out.time = r6(needNumber(spec.time, 'time'));
      for (const field of boneSide) {
        if (spec[field] !== undefined) {
          throw new CompileError(
            `${where}: declares "${field}" but no "bone". Every one of ${boneSide.join('/')} is read only inside the ` +
              "parser's `if (boneName)` branch (`:350-360`), so it would be dropped in silence. Name the driving bone, " +
              'or key `slider.<name>.time` in the motion spec instead.',
          );
        }
      }
    }
    copy(['skin']);
    return out;
  }
  if (spec.type === 'physics') {
    out.bone = needBone(spec.bone, 'bone');
    copy([
      'x',
      'y',
      'rotate',
      'scaleX',
      'shearX',
      'scaleY',
      'limit',
      'fps',
      'inertia',
      'strength',
      'damping',
      'mass',
      'wind',
      'gravity',
      'mix',
      'inertiaGlobal',
      'strengthGlobal',
      'dampingGlobal',
      'massGlobal',
      'windGlobal',
      'gravityGlobal',
      'mixGlobal',
      'skin',
    ]);
    return out;
  }
  // Every type 4.3 has is implemented, so this is now only reachable from a typo
  // — and a typo is exactly what the parser drops in silence (no `default:`
  // branch, `:148-367`), which is why the refusal stays.
  throw new NotImplementedError(
    `${where}: constraint type ${JSON.stringify(spec.type)} is not one Spine 4.3 knows. ` +
      'The five are: ik, transform, path, physics, slider. An unrecognised type matches no case in the parser and ' +
      'the constraint is dropped without a word.',
  );
}

/**
 * Collect what the artifact cannot say about itself.
 *
 * Nothing in skeleton JSON records that a mesh is a ribbon, that a bone's
 * subtree is authored in axis space, or that one parentage is forbidden. Those
 * are rig facts, so the compiler hands them to the validator instead of letting
 * it guess — and a mutant stays honest because it edits the artifact while this
 * block keeps saying what the rig was supposed to be.
 */
function buildRigInfo(
  rig: RigSpec,
  bones: SpineBone[],
  meshes: CompileResult['meshes'],
  manifest: FaceManifest | null,
): RigInfo {
  const axisBone = rig.invariants?.axisBone ?? null;
  if (axisBone !== null && !bones.some((b) => b.name === axisBone)) {
    throw new CompileError(`rig "${rig.name}" names "${axisBone}" as its axis bone, which it does not declare`);
  }
  const axisSubtree: string[] = [];
  if (axisBone) {
    const parentOf = new Map(bones.map((b) => [b.name, b.parent ?? null]));
    for (const bone of bones) {
      for (let cursor: string | null = bone.name; cursor; cursor = parentOf.get(cursor) ?? null) {
        if (cursor !== axisBone) continue;
        axisSubtree.push(bone.name);
        break;
      }
    }
  }
  const meshKinds: RigInfo['meshKinds'] = {};
  for (const mesh of meshes) meshKinds[mesh.slot] = mesh.kind;
  // A fold exemption on a slot that carries no mesh cannot exempt anything —
  // A39 reads triangles, and only a mesh has them. `parseRigSpec` already
  // refused a name that is not a SLOT; this is the second half, and it needs
  // the compiled meshes so it lives here rather than there.
  const deformMayFold = (rig.invariants?.deformMayFold ?? []).map((e) => e.slot);
  for (const slot of deformMayFold) {
    if (meshKinds[slot] === undefined) {
      throw new CompileError(
        `rig "${rig.name}" exempts slot "${slot}" from A39_DEFORM_KEEPS_TRIANGLE_WINDING, but that slot carries no ` +
          'mesh — winding is a property of triangles, so there is nothing there to exempt',
      );
    }
  }
  // Inward, in Spine world. Off-axis keys (the mass bone usually hangs outside
  // the axis subtree) have to be projected onto it before they can be compared
  // with travel along the axis.
  const spineDeg = manifest?.axis ? screenToSpineDegrees(manifest.axis.deg) : null;
  const inwardUnit: [number, number] | null =
    spineDeg === null ? null : [r6(Math.cos((spineDeg * Math.PI) / 180)), r6(Math.sin((spineDeg * Math.PI) / 180))];
  const contactDepth = manifest?.stroke?.contact_depth ?? null;
  if (contactDepth !== null && !(contactDepth > 0)) {
    throw new CompileError(`manifest stroke.contact_depth is ${contactDepth}; it must be a positive number of axis pixels`);
  }
  const capCeiling = manifest?.stroke?.cap_containment_ceiling ?? null;
  if (capCeiling !== null && !(capCeiling > 0)) {
    throw new CompileError(
      `manifest stroke.cap_containment_ceiling is ${capCeiling}; it must be a positive number of axis pixels (use null for "not measurable on this cut")`,
    );
  }
  return {
    archetype: rig.name,
    axisBone,
    axisSubtree,
    detached: (rig.invariants?.detached ?? []).map((d) => [d.bone, d.notUnder] as [string, string]),
    slotOrder: rig.slots.length ? rig.slots.map((s) => s.name) : null,
    meshKinds,
    deformMayFold,
    meshSlotBudget: rig.invariants?.meshSlots ?? null,
    meshTriangleBudget: rig.invariants?.meshTriangles ?? null,
    contactDepth,
    capContainmentCeiling: capCeiling,
    massBone: rig.invariants?.massBone ?? null,
    inwardUnit,
  };
}

/**
 * A manifest that disagrees with itself is the cheapest bug to catch and the
 * worst to debug three files later, so the axis unit vector is checked against
 * the axis angle before anything is built from either.
 */
function checkAxisSelfConsistency(manifest: FaceManifest): void {
  if (!manifest.axis) return;
  const { deg, unit } = manifest.axis;
  if (!Array.isArray(unit) || unit.length !== 2) {
    throw new CompileError(`manifest axis.unit must be [x, y], got ${JSON.stringify(unit)}`);
  }
  const ex = Math.cos((deg * Math.PI) / 180);
  const ey = Math.sin((deg * Math.PI) / 180);
  if (Math.hypot(unit[0] - ex, unit[1] - ey) > 1e-3) {
    throw new CompileError(
      `manifest axis.unit [${unit[0]}, ${unit[1]}] does not match axis.deg ${deg} (expected [${r6(ex)}, ${r6(ey)}])`,
    );
  }
}

/**
 * Place a rigid region on its bone.
 *
 * Two offsets are folded in here. The attachment is centred on the part window
 * rather than on the bone, because several slots may share one bone — a part and
 * its motion-blur variant, an occluder and what pools against it — while their
 * windows sit in different places. And the attachment's own `rotation` cancels
 * the bone's world rotation, because a plate is authored in screen space:
 * without it every slot hanging off a rotated axis bone would render tilted by
 * the cut's axis angle.
 *
 * On an unrotated bone sitting at its window centre both terms are zero and the
 * fields are omitted, which is why a formation with no axis emits the same
 * bytes it always did.
 */
function placeRegion(
  part: FaceManifestPart,
  manifest: FaceManifest,
  bone: BoneTransform,
  img: CompiledImage,
): SpineRegionAttachment {
  const win = partWindow(part, manifest);
  // width/height are NOT optional: omitting them loads as NaN with no error.
  // The compiler fills them from the PNG.
  const att: SpineRegionAttachment = { width: img.width, height: img.height };
  const [ax, ay] = toBoneLocal(bone, win.x + win.w / 2, cropToSpineY(win.y + win.h / 2, manifest.crop.h));
  if (ax !== 0) att.x = ax;
  if (ay !== 0) att.y = ay;
  const rotation = normaliseDegrees(-bone.worldRotation);
  if (rotation !== 0) att.rotation = rotation;
  return att;
}

/**
 * Build one mesh for a manifest part and encode its weighted vertices.
 *
 * Two generators, one call site. A `ring` pins its two outer rings and moves only
 * the aperture; a `ribbon` pins its entry row and lets the chain stretch the rest.
 * Which one a part gets is manifest data, not a guess — the compiler will not
 * infer a deformation model from a polygon's shape.
 */
function buildMesh(
  part: FaceManifestPart,
  manifest: FaceManifest,
  bones: SpineBone[],
  transforms: Map<string, BoneTransform>,
  anchorName: string,
): { attachment: SpineMeshAttachment; kind: 'ring' | 'ribbon' } {
  const spec = part.mesh!;
  const kind = spec.kind ?? 'ring';
  const win = partWindow(part, manifest);
  const cropH = manifest.crop.h;
  const controls = meshControlBones(part);

  const refFor = (name: string): MeshBoneRef => {
    const index = bones.findIndex((b) => b.name === name);
    if (index < 0) throw new CompileError(`internal: mesh bone "${name}" is not in the bone list`);
    const m = transforms.get(name);
    if (!m) throw new CompileError(`internal: no setup transform for mesh bone "${name}"`);
    return { index, toBind: (wx, wy) => toBoneLocal(m, wx, wy) };
  };

  let geometry;
  try {
    if (kind === 'ribbon') {
      geometry = buildRibbonMesh({ size: [win.w, win.h], rows: spec.rows!, chainCount: controls.length });
    } else {
      const centre: [number, number] = [spec.center![0] - win.x, spec.center![1] - win.y];
      // Control bones enter the ring builder as ANGLES about the aperture, taken
      // from where the rig actually put them. The alternative — a per-bone angle
      // in the manifest — would let the declared angle drift away from the
      // declared position, and then the ring would deform toward a bone that is
      // somewhere else.
      //
      // A single control bone needs no angle at all: it owns the whole ring, and
      // the face rig deliberately puts it ON the aperture centre, where a radial
      // direction does not exist.
      const controlAngles =
        controls.length > 1
          ? controls.map((name) => {
              const m = transforms.get(name);
              if (!m) throw new CompileError(`internal: no setup transform for control bone "${name}"`);
              const dx = m.worldX - spec.center![0];
              const dy = cropH - m.worldY - spec.center![1];
              if (Math.hypot(dx, dy) < 1e-6) {
                throw new CompileError(
                  `control bone "${name}" sits on the aperture centre of slot "${part.slot}", so it has no radial direction`,
                );
              }
              return (Math.atan2(dy, dx) * 180) / Math.PI;
            })
          : undefined;
      geometry = buildRingMesh({
        hull: (part.polygon ?? []).map(([x, y]) => [x - win.x, y - win.y] as [number, number]),
        center: centre,
        inner: spec.inner!,
        size: [win.w, win.h],
        bias: spec.bias ? { axis_deg: spec.bias.axis_deg, ramp: spec.bias.ramp } : undefined,
        controlAngles,
      });
    }
  } catch (err) {
    if (err instanceof MeshError) throw new CompileError(`slot "${part.slot}" mesh: ${err.message}`);
    throw err;
  }

  const vertices = encodeWeightedVertices(
    geometry,
    (px, py) => [r6(win.x + px), r6(cropToSpineY(win.y + py, cropH))],
    { anchor: refFor(anchorName), controls: controls.map(refFor) },
  );

  return {
    kind: geometry.kind,
    attachment: {
      type: 'mesh',
      uvs: geometry.uvs,
      triangles: geometry.triangles,
      vertices,
      hull: geometry.hullVertices,
      width: win.w,
      height: win.h,
    },
  };
}

/**
 * The raw-curve escape hatch: absolute (time, value) control points, verbatim.
 *
 * ⭐ Named easings stay the recommended path: a handle set with
 * a name is reusable, reviewable and retargetable, and it is what makes a motion
 * spec readable as intent rather than as numbers. But a named easing can only say
 * "the same shape, everywhere", and an editor export says a different shape per
 * key per channel — rung 3 of the benchmark ladder carries 54 bezier keys and no
 * two of them share handles. Refusing to express that would not make rigc's
 * output better; it would make rigc unable to state what Spine's format holds,
 * which is the same blocker as the bone tree being code, one layer down.
 *
 * So this is the escape hatch, and it is shaped like one: the numbers are the
 * file's own, checked for length and finiteness and passed through. What it is
 * NOT is a second way to write an easing — a key may carry `ease` or `curve`,
 * never both.
 *
 * ⚠️ These are ABSOLUTE (time, value) points, not the normalised graph-view
 * handles an editor shows. Writing the handles here would load without error and
 * produce a different curve, which is exactly the
 * trap `bezierForChannel` exists to keep authors out of.
 */
function rawCurve(curve: number[] | 'stepped', channels: number, where: string, at: string): number[] | 'stepped' {
  if (curve === 'stepped') return 'stepped';
  if (!Array.isArray(curve)) throw new CompileError(`${where} (t=${at}): curve must be an array or "stepped"`);
  if (curve.length !== channels * 4) {
    // A short array multiplies `undefined` into the cubic and yields NaN with no
    // error at all — case 6g, and the reason A05 exists.
    throw new CompileError(
      `${where} (t=${at}): raw curve has ${curve.length} numbers, this timeline needs ${channels} channel(s) x 4 = ${channels * 4}`,
    );
  }
  for (const n of curve) {
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      throw new CompileError(`${where} (t=${at}): raw curve holds a non-finite value ${JSON.stringify(n)}`);
    }
  }
  return curve.map(r6);
}

/**
 * Bone timelines. Same curve rule as the slot tracks — four numbers per value
 * channel, in field order — but the identity value differs per property, so a
 * key that matches setup is still emitted explicitly rather than omitted. An
 * omitted field is not "no change"; it is "the setup value", which is the same
 * thing only by accident.
 */
function compileValueTrack(
  track: MotionValueTrack,
  motion: MotionSpec,
  animName: string,
  duration: number,
  target: string,
  shift: number,
  shapes: Record<string, { fields: string[]; identity: number[] }>,
  kind: string,
): SpineTimelineKey[] {
  const shape = shapes[track.property];
  if (!shape) throw new CompileError(`animation "${animName}": ${kind} "${target}" has no property "${track.property}"`);
  const where = `animation "${animName}" ${kind} "${target}" ${track.property}`;
  if (!track.keys.length) throw new CompileError(`${where}: no keys`);

  const out: SpineTimelineKey[] = [];
  for (let i = 0; i < track.keys.length; i++) {
    const key = track.keys[i];
    const next = track.keys[i + 1];
    const time = keyTime(key.t + shift);
    if (i > 0 && time <= (out[i - 1].time as number)) {
      throw new CompileError(`${where}: key times must strictly increase (at t=${key.t})`);
    }
    checkKeyTime(where, time, key.t, duration);
    // A no-field timeline (`reset`) is an event: the key IS the value, so it
    // carries none. Anything else must match the field count exactly.
    if (shape.fields.length === 0) {
      if (key.v !== null) throw new CompileError(`${where}: this timeline takes no value; use null`);
      if (key.ease) throw new CompileError(`${where}: an event timeline cannot carry an easing`);
      out.push({ time });
      continue;
    }
    if (!Array.isArray(key.v) || key.v.length !== shape.fields.length) {
      throw new CompileError(`${where}: key value must be an array of ${shape.fields.length} number(s)`);
    }
    const entry: SpineTimelineKey = { time };
    shape.fields.forEach((field, c) => {
      const v = key.v as number[];
      if (!Number.isFinite(v[c])) throw new CompileError(`${where}: non-finite value ${String(v[c])}`);
      entry[field] = r6(v[c]);
    });
    if (key.ease !== undefined && key.curve !== undefined) {
      throw new CompileError(`${where}: a key carries both a named easing and a raw curve; pick one`);
    }
    if (key.curve !== undefined) {
      if (!next) throw new CompileError(`${where}: last key carries a curve but has nothing to ease to`);
      entry.curve = rawCurve(key.curve, shape.fields.length, where, String(key.t));
    } else if (key.ease && next) {
      if (key.ease === 'stepped') {
        entry.curve = 'stepped';
      } else {
        const handles = motion.easings?.[key.ease];
        if (!handles) throw new CompileError(`${where}: unknown easing "${key.ease}"`);
        if (!Array.isArray(next.v)) throw new CompileError(`${where}: next key value must be an array`);
        const t2 = keyTime(next.t + shift);
        const curve: number[] = [];
        for (let c = 0; c < shape.fields.length; c++) {
          curve.push(...bezierForChannel(handles, time, t2, (key.v as number[])[c], (next.v as number[])[c]));
        }
        entry.curve = curve;
      }
    } else if (key.ease && !next) {
      throw new CompileError(`${where}: last key carries an easing but has nothing to ease to`);
    }
    out.push(entry);
  }
  return out;
}

/**
 * The whole-animation draw-order timeline (`animations.<a>.drawOrder`).
 *
 * ⭐ Four refusals here, and three of them exist because `readDrawOrder`
 * (SkeletonJson.ts:1336-1374) rebuilds the permutation with a **forward-only**
 * cursor over the setup order:
 *
 * ```
 * while (originalIndex !== index) unchanged[unchangedIndex++] = originalIndex++;
 * drawOrder[originalIndex + offsetMap.offset] = originalIndex++;
 * ```
 *
 *   1. **Offsets are emitted in slot order.** An entry whose slot sits EARLIER
 *      than the previous entry's can never make `originalIndex` equal `index`
 *      again, so that loop runs away — an artifact that hangs the loader rather
 *      than loading wrong. The author states a set of moves; the array order in
 *      the file is the parser's requirement and not a decision, so rigc sorts
 *      rather than making every caller remember. Deterministic: the key is the
 *      emitted slot index.
 *   2. **One slot per key.** Two entries for the same slot means two writes at
 *      one cursor position; the second silently wins and the first slot's place
 *      is left to the unchanged-fill.
 *   3. **The destination must be inside the array.** `originalIndex + offset`
 *      out of range writes past the end (or at −1), leaves a −1 hole behind, and
 *      the fill loop then reads `unchanged[-1]` = `undefined`. Nothing throws:
 *      the animation simply draws a slot that is not a slot.
 *   4. A slot the skeleton does not have IS caught by the parser (`Draw order
 *      slot not found`) — but in the consumer's process, which is late, so it is
 *      refused here too.
 *
 * `A31_DRAW_ORDER_OFFSETS_RESOLVE` checks the same four properties from the
 * other side, on the emitted file, because a hand-written or foreign skeleton
 * never passed through this function.
 */
function compileDrawOrder(
  keys: MotionDrawOrderKey[],
  animName: string,
  duration: number,
  slots: SpineSlot[],
): SpineTimelineKey[] {
  const where = `animation "${animName}" drawOrder`;
  if (!keys.length) throw new CompileError(`${where}: no keys`);
  const indexOf = new Map(slots.map((s, i) => [s.name, i]));

  const out: SpineTimelineKey[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const time = keyTime(key.t);
    if (i > 0 && time <= (out[i - 1].time as number)) {
      throw new CompileError(`${where}: key times must strictly increase (at t=${key.t})`);
    }
    checkKeyTime(where, time, key.t, duration);
    // No offsets = "back to the setup draw order", which is the parser's own
    // encoding for it. An empty array means the same thing and is written the
    // same way, so that two spellings cannot emit two different files.
    if (!key.offsets?.length) {
      out.push({ time });
      continue;
    }
    const seen = new Set<string>();
    const entries: Array<{ slot: string; offset: number; index: number }> = [];
    for (const off of key.offsets) {
      const index = indexOf.get(off.slot);
      if (index === undefined) {
        throw new CompileError(`${where} at t=${key.t}: slot "${off.slot}" is not one this rig emits`);
      }
      if (seen.has(off.slot)) {
        throw new CompileError(`${where} at t=${key.t}: slot "${off.slot}" is offset twice in one key`);
      }
      if (!Number.isInteger(off.offset)) {
        throw new CompileError(`${where} at t=${key.t}: slot "${off.slot}" offset ${off.offset} is not a whole number`);
      }
      const landing = index + off.offset;
      if (landing < 0 || landing >= slots.length) {
        throw new CompileError(
          `${where} at t=${key.t}: slot "${off.slot}" is at index ${index} and offset ${off.offset} puts it at ` +
            `${landing}, outside the ${slots.length} emitted slots`,
        );
      }
      seen.add(off.slot);
      entries.push({ slot: off.slot, offset: off.offset, index });
    }
    entries.sort((a, b) => a.index - b.index);
    out.push({ time, offsets: entries.map((e) => ({ slot: e.slot, offset: e.offset })) });
  }
  return out;
}

/**
 * The whole-animation event timeline (`animations.<a>.events`).
 *
 * Four refusals, and the reason each one is here is a different failure mode of
 * `readAnimation`'s event branch (SkeletonJson.ts:1238-1261):
 *
 *   1. **The name must be declared.** `skeletonData.findEvent` returns null and
 *      the parser throws `Event not found` — one of the format's few loud
 *      failures, but it throws in the CONSUMER's process, which is late. Refused
 *      here so the message can name the rig spec's `events` block instead.
 *   2. **Key times must not go backwards.** The loop writes frame `i` from key
 *      `i` in ARRAY order and never sorts, so a time that decreases produces an
 *      `EventTimeline` whose frames are out of order. Nothing throws; the
 *      timeline's search simply stops finding the firings behind the fold. Equal
 *      times are legal and deliberate — two different events on the same frame is
 *      an ordinary thing to want — so this is non-decreasing, not the strictly
 *      increasing rule a value track lives under (a value track has one value per
 *      time and two keys at one time is a contradiction; two firings are not).
 *   3. **`volume`/`balance` need the event to carry `audio`.** `:1254-1257` reads
 *      them only inside `if (event.data.audioPath)`, so on a silent event they
 *      are dropped without a word.
 *   4. **A key past the declared duration.** The same `checkKeyTime` every other
 *      timeline goes through: a firing after the end never fires (issue #54 was
 *      exactly this shape on an attachment reveal).
 */
function compileEvents(
  keys: MotionEventKey[],
  animName: string,
  duration: number,
  events: Record<string, RigEvent>,
): SpineTimelineKey[] {
  const where = `animation "${animName}" events`;
  if (!keys.length) throw new CompileError(`${where}: no keys`);

  const out: SpineTimelineKey[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (typeof key.name !== 'string' || key.name.length === 0) {
      throw new CompileError(`${where}: key ${i} has no "name"; an event key fires an event by name`);
    }
    const declared = events[key.name];
    if (declared === undefined) {
      const known = Object.keys(events);
      throw new CompileError(
        `${where} at t=${key.t}: event "${key.name}" is not declared in the rig spec's "events" block; ` +
          (known.length ? `declared: ${known.join(', ')}` : 'that block is empty or absent'),
      );
    }
    const time = keyTime(key.t);
    if (i > 0 && time < (out[i - 1].time as number)) {
      throw new CompileError(
        `${where}: key times must not go backwards (at t=${key.t}, after t=${String(out[i - 1].time)}) — ` +
          'the parser writes frames in array order and never sorts them',
      );
    }
    checkKeyTime(where, time, key.t, duration);

    const entry: SpineTimelineKey = { time, name: key.name };
    if (key.int !== undefined) {
      if (!Number.isInteger(key.int)) {
        throw new CompileError(`${where} at t=${key.t}: int ${String(key.int)} is not an integer`);
      }
      entry.int = key.int;
    }
    if (key.float !== undefined) {
      if (!Number.isFinite(key.float)) {
        throw new CompileError(`${where} at t=${key.t}: float ${String(key.float)} is not finite`);
      }
      entry.float = r6(key.float);
    }
    if (key.string !== undefined) {
      if (typeof key.string !== 'string') {
        throw new CompileError(`${where} at t=${key.t}: string ${JSON.stringify(key.string)} is not a string`);
      }
      entry.string = key.string;
    }
    for (const field of ['volume', 'balance'] as const) {
      const v = key[field];
      if (v === undefined) continue;
      if (declared.audio === undefined) {
        throw new CompileError(
          `${where} at t=${key.t}: ${field} is set but event "${key.name}" declares no "audio"; ` +
            `the parser reads ${field} only for an event with an audio path, so it would be dropped in silence`,
        );
      }
      if (!Number.isFinite(v)) throw new CompileError(`${where} at t=${key.t}: ${field} ${String(v)} is not finite`);
      entry[field] = r6(v);
    }
    out.push(entry);
  }
  return out;
}

/**
 * An IK or transform constraint keyed over time — `animations.<a>.<group>.<name>`.
 *
 * One function for both because the two differ only in their field table: the
 * group is one unnamed timeline per constraint, every field is optional with a
 * per-key default, and the curve concatenates four numbers per channel in field
 * order. `CONSTRAINT_TIMELINES` holds what differs.
 *
 * 🚨 The refusal that is not obvious is the **uniform field set**. In this format
 * a key does not inherit anything from the key before it: `getValue(keyMap,
 * "softness", 0)` is read fresh per key, so a track written as
 *
 * ```
 * { "t": 0, "mix": 1, "softness": 20 },  { "t": 1, "mix": 0 }
 * ```
 *
 * does not hold softness at 20 and fade the mix out — it snaps softness to 0 at
 * t=1 and interpolates from 20 down to 0 on the way, which is a thing the author
 * did not write and cannot see. It loads, it plays, and it is wrong. So every key
 * of a track has to name the same fields; stating the default explicitly is the
 * way to opt in.
 *
 * ⚠️ The values a curve is built between are the **effective** ones — the
 * author's number where there is one, the parser's default where there is not.
 * That is reading the format, not inventing a value: it is exactly what the
 * runtime will interpolate, and a bezier built against anything else would
 * describe a curve the player does not play.
 *
 * 🚨 `rigFlags` is the same reading applied one level up, for the three ik
 * booleans (issue #273). The parser reads them per KEY as well as on the
 * constraint, with the same defaults in both places, so an ik timeline whose keys
 * omit `bendPositive` does not inherit the rig's — it asserts `true`, and a rig
 * that declared `false` bends the other way for the whole animation with the
 * field still sitting in the file. Every key therefore carries the EFFECTIVE
 * direction: the motion's where the motion states one, and the rig's where it
 * does not.
 *
 * **A motion key may still override.** The format keys these per key on purpose
 * — they are stepped by nature, and a bend that flips partway through an
 * animation is a real thing to write — so a track that states a flag on every key
 * is honoured as written, whatever the rig says. That is also what the editor's
 * own export does: spineboy-pro declares `bendPositive: false` on both leg chains
 * and restates it on every key of all six ik timelines that touch them. What
 * changes here is only the silent case.
 */
function compileConstraintTrack(
  group: 'ik' | 'transform',
  track: MotionIkTrack | MotionTransformTrack,
  motion: MotionSpec,
  animName: string,
  duration: number,
  /** Non-default ik booleans the rig declared, by field. Empty for `transform`. */
  rigFlags: Record<string, boolean>,
): SpineTimelineKey[] {
  const shape = CONSTRAINT_TIMELINES[group];
  const article = group === 'ik' ? 'an' : 'a';
  const where = `animation "${animName}" ${group} constraint "${track.constraint}"`;
  const keys = track.keys;
  // An array by the time this runs (`parseMotionSpec`); an EMPTY one is a
  // format rule rather than a shape — the parser reads key 0, finds nothing and
  // skips the timeline, which is assertion A34's silent case.
  if (keys.length === 0) throw new CompileError(`${where}: no keys`);

  const read = (key: MotionIkTrack['keys'][number] | MotionTransformTrack['keys'][number], field: string): unknown =>
    (key as unknown as Record<string, unknown>)[field];
  const named = (key: MotionIkTrack['keys'][number] | MotionTransformTrack['keys'][number]): string[] =>
    [...shape.channels, ...shape.flags].map((c) => c.field).filter((field) => read(key, field) !== undefined);

  // The uniform-field-set rule, checked against key 0 so the message can name the
  // key that differs rather than "some key".
  const first = named(keys[0]);
  const firstSet = new Set(first);
  keys.forEach((key, i) => {
    if (i === 0) return;
    const here = named(key);
    for (const field of here) {
      if (firstSet.has(field)) continue;
      throw new CompileError(
        `${where}: key ${i} (t=${key.t}) names "${field}" and key 0 does not. Every key of ${article} ${group} timeline ` +
          'is read with its own default, so a field stated on some keys and not others snaps to the default on ' +
          'the rest — state it on every key or on none.',
      );
    }
    for (const field of first) {
      if (here.includes(field)) continue;
      throw new CompileError(
        `${where}: key 0 names "${field}" and key ${i} (t=${key.t}) does not. Every key of ${article} ${group} timeline ` +
          `is read with its own default, so "${field}" would snap to ` +
          `${JSON.stringify(defaultOf(shape, field))} at t=${key.t} — state it on every key or on none.`,
      );
    }
  });

  /** The value the runtime will see for `field` on this key: authored, or default. */
  const effective = (key: MotionIkTrack['keys'][number] | MotionTransformTrack['keys'][number], channel: ConstraintChannel): number => {
    const v = read(key, channel.field);
    if (v !== undefined) return v as number;
    if (channel.inheritsFrom === undefined) return channel.dflt;
    const inherited = read(key, channel.inheritsFrom);
    return inherited === undefined ? channel.dflt : (inherited as number);
  };

  const out: SpineTimelineKey[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const next = keys[i + 1];
    const time = keyTime(key.t);
    if (i > 0 && time <= (out[i - 1].time as number)) {
      throw new CompileError(`${where}: key times must strictly increase (at t=${key.t})`);
    }
    checkKeyTime(where, time, key.t, duration);

    const entry: SpineTimelineKey = { time };
    for (const channel of shape.channels) {
      const v = read(key, channel.field);
      if (v === undefined) continue;
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new CompileError(`${where} (t=${key.t}): ${channel.field} is ${JSON.stringify(v)}, not a finite number`);
      }
      const bounds = shape.range[channel.field];
      if (bounds && (v < bounds[0] || v > bounds[1])) {
        throw new CompileError(
          `${where} (t=${key.t}): ${channel.field} is ${v}, outside ${bounds[0]}..${
            bounds[1] === Infinity ? '∞' : bounds[1]
          } — the runtime documents it as ${channel.field === 'mix' ? 'a percentage 0-1' : 'a distance'}`,
        );
      }
      entry[channel.field] = r6(v);
    }
    for (const flag of shape.flags) {
      const v = read(key, flag.field);
      if (v === undefined) {
        // The rig's value, stamped on this key because nothing else will carry
        // it there. Absent from `rigFlags` means the rig's value IS the per-key
        // default, so omitting the field says the same thing and the emitted
        // bytes do not move.
        const carried = rigFlags[flag.field];
        if (carried !== undefined) entry[flag.field] = carried;
        continue;
      }
      if (typeof v !== 'boolean') {
        throw new CompileError(`${where} (t=${key.t}): ${flag.field} is ${JSON.stringify(v)}, not true or false`);
      }
      entry[flag.field] = v;
    }

    if (key.ease !== undefined && key.curve !== undefined) {
      throw new CompileError(`${where}: a key carries both a named easing and a raw curve; pick one`);
    }
    if (key.curve !== undefined) {
      if (!next) throw new CompileError(`${where}: last key carries a curve but has nothing to ease to`);
      entry.curve = rawCurve(key.curve, shape.channels.length, where, String(key.t));
    } else if (key.ease !== undefined && next) {
      if (key.ease === 'stepped') {
        entry.curve = 'stepped';
      } else {
        const handles = motion.easings?.[key.ease];
        if (!handles) throw new CompileError(`${where}: unknown easing "${key.ease}"`);
        const t2 = keyTime(next.t);
        const curve: number[] = [];
        for (const channel of shape.channels) {
          curve.push(...bezierForChannel(handles, time, t2, effective(key, channel), effective(next, channel)));
        }
        entry.curve = curve;
      }
    } else if (key.ease !== undefined && !next) {
      throw new CompileError(`${where}: last key carries an easing but has nothing to ease to`);
    }
    out.push(entry);
  }
  return out;
}

/** The parser default for one field of a constraint timeline, for a message. */
function defaultOf(shape: ConstraintTimelineShape, field: string): number | boolean {
  const channel = shape.channels.find((c) => c.field === field);
  if (channel) return channel.dflt;
  return shape.flags.find((f) => f.field === field)?.dflt ?? 0;
}

/**
 * What a deform key is editing: the array the parser builds for one attachment.
 *
 * The two encodings are the reason this is derived rather than assumed, and they
 * are the same split `readVertices` makes when it decides whether a `vertices`
 * array is coordinates or a weight run:
 *
 *   unweighted — `deformLength = vertices.length`, one `x, y` pair per vertex;
 *   weighted   — `deformLength = vertices.length / 3 * 2`, one pair per bone
 *                INFLUENCE, because the loaded `vertices` is `x, y, weight` per
 *                influence.
 *
 * Same shape, two meanings, and picking the wrong one writes a run that silently
 * lands on the wrong vertices.
 */
interface DeformGeometry {
  weighted: boolean;
  /** How long the array the key edits is. */
  deformLength: number;
  vertexCount: number;
  /** Bone influences per vertex, in vertex order. Null on an unweighted attachment. */
  boneCounts: number[] | null;
  /**
   * Setup `x, y` per vertex **in the space a deform offset lives in**, for a
   * `transform` key to evaluate a model over (issue #294).
   *
   * Null when there is no single such space, and `setupWhy` then says which of
   * the two reasons it was: a vertex with more than one bone on it, whose offset
   * is a weighted sum of a pair in each bone's own bind space; or a run bound to
   * several bones, where one closed form would be evaluated across several
   * unrelated coordinate systems. Both are the `fromVertex` refusal's reasoning
   * applied to a whole run — rigc will not guess a space.
   */
  setup: number[] | null;
  /** Why `setup` is null, phrased for the refusal. Null when it is not. */
  setupWhy: string | null;
}

/**
 * Measure one emitted attachment's deform array.
 *
 * A region attachment is refused rather than measured: it has no `vertices` at
 * all, so `attachment.vertices.length` throws inside the parser — one of the very
 * few places this format fails loudly, and it fails in the consumer's process.
 */
function deformGeometryOf(att: SpineAttachment, where: string): DeformGeometry {
  const type = (att as { type?: string }).type ?? 'region';
  let worldVerticesLength: number;
  if (type === 'mesh') {
    worldVerticesLength = (att as SpineMeshAttachment).uvs.length;
  } else if (type === 'boundingbox' || type === 'clipping') {
    worldVerticesLength = (att as SpineBoundingBoxAttachment).vertexCount * 2;
  } else if (type === 'path') {
    // The one type that HAS a vertex array and is still refused here. Deforming
    // a path is a real idiom — an animated track — but it also invalidates the
    // measured `lengths` that a `constantSpeed: false` traversal reads, so it is
    // a feature with a rule attached rather than one line of plumbing.
    throw new NotImplementedError(
      `${where}: a path attachment does have a vertex array, and rigc does not key it yet — a deformed path ` +
        'changes the arc lengths its `lengths` array records, which only `constantSpeed: false` reads. ' +
        'Move the curve by posing the bones its vertices are bound to.',
    );
  } else {
    throw new CompileError(
      `${where}: a deform timeline keys the vertices of an attachment, and this one is a "${type}" — ` +
        'it has no vertex array to deform. Deformable types: mesh, boundingbox, clipping.',
    );
  }
  const vertices = (att as SpineMeshAttachment).vertices ?? [];
  const weighted = vertices.length !== worldVerticesLength;
  if (!weighted) {
    return {
      weighted,
      deformLength: worldVerticesLength,
      vertexCount: worldVerticesLength / 2,
      boneCounts: null,
      // An unweighted attachment IS its own space: the array is one `x, y` per
      // vertex in the slot bone's space, which is the space the offsets are in.
      setup: vertices.slice(),
      setupWhy: null,
    };
  }
  // Walk the weight run for the per-vertex influence counts. The run's own shape
  // is already assured by the attachment builders and by A33/A04; this only
  // counts, and a malformed run stops rather than producing a plausible number.
  const boneCounts: number[] = [];
  const bindSpace: number[] = [];
  const bones = new Set<number>();
  for (let i = 0; i < vertices.length; ) {
    const n = vertices[i++];
    if (!Number.isInteger(n) || n < 1) {
      throw new CompileError(`${where}: the attachment's weighted vertex run has a bone count of ${String(n)} at index ${i - 1}`);
    }
    if (n === 1) {
      bones.add(vertices[i]);
      bindSpace.push(vertices[i + 1], vertices[i + 2]);
    }
    i += n * 4;
    if (i > vertices.length) {
      throw new CompileError(`${where}: the attachment's weighted vertex run is truncated at vertex ${boneCounts.length}`);
    }
    boneCounts.push(n);
  }
  // ⚠️ The influence count is the SUM of the per-vertex counts, not a division
  // of the JSON array's length. The emitted array is `boneCount` followed by
  // `boneIndex, x, y, weight` per influence — five numbers for a single-bone
  // vertex, not three — so `vertices.length / 3` overstated the deform array by
  // two thirds on a one-bone-per-vertex mesh (`gallery/flex`'s 77-vertex leaf
  // measured 256.667 against its true 154) and made A35's own overrun bar too
  // wide by that much. `readVertices` stores three numbers per influence in the
  // LOADED attachment, which is where the `/3*2` in the parser comes from.
  let influences = 0;
  for (const n of boneCounts) influences += n;
  const multi = boneCounts.findIndex((n) => n !== 1);
  const setupWhy =
    multi !== -1
      ? `vertex ${multi} has ${boneCounts[multi]} bone influences on it, and one x, y pair for such a vertex is not a ` +
        'thing the deform array can hold: its world offset is the weighted sum of a pair in each bone\'s own bind space'
      : bones.size > 1
        ? `its ${boneCounts.length} vertices are bound to ${bones.size} different bones, so their x, y pairs are in ` +
          'that many different bind spaces and one closed form evaluated across them would mean nothing'
        : null;
  return {
    weighted,
    deformLength: influences * 2,
    vertexCount: boneCounts.length,
    boneCounts,
    setup: setupWhy === null ? bindSpace : null,
    setupWhy,
  };
}

/**
 * One attachment's geometry keyed over time —
 * `animations.<a>.attachments.<skin>.<slot>.<attachment>.deform`.
 *
 * ⭐ Every refusal below is a silent failure of the parser's own deform branch,
 * and the first is the one that matters most:
 *
 *   1. **A run that does not fit.** The parser copies with
 *      `Utils.arrayCopy(vertices, 0, deform, start, vertices.length)` into a
 *      `Float32Array` sized from the attachment. Writing past the end of a typed
 *      array is a **no-op in JavaScript** — no throw, no warning — so a run one
 *      pair too long, or aimed at the wrong attachment, loses its tail and
 *      deforms part of the mesh correctly. That is the worst possible failure
 *      shape: it looks almost right.
 *   2. **An odd `offset`, or an odd run length.** The array is `x, y` pairs; an
 *      odd index puts every x of the run on a y and vice versa. It loads.
 *   3. **`fromVertex` where a vertex is not one pair.** See below.
 *   4. **A key that carries both a run and no room for one**, or a non-finite
 *      offset — a NaN in the deform array propagates into world vertices.
 *
 * `fromVertex` is rigc's own field and the reason it exists is issue #89's
 * observation: a deform key is the only key in the format whose meaning depends
 * on the attachment it is attached to, and an author reasons in vertices while
 * the array is indexed in influences. On an **unweighted** attachment the two
 * coincide, so the translation is exact. On a **weighted** one it is exact only
 * where each vertex the run covers has exactly ONE bone on it; with two bones a
 * vertex occupies two pairs and "move vertex 3 by (dx, dy)" is not a statement
 * the array can hold — the world offset would be
 * `Σ weightᵦ · Mᵦ · (dx, dy)`, which equals `(dx, dy)` only if every influencing
 * bone happens to share one world matrix. So that case is refused by name and
 * `offset` stays available for an author who really is writing bind-space
 * offsets per influence.
 */
function compileDeformTrack(
  track: MotionDeformTrack,
  motion: MotionSpec,
  animName: string,
  duration: number,
  geometry: DeformGeometry,
  generated: CompileResult['deformTransforms'],
): SpineTimelineKey[] {
  const skin = track.skin ?? 'default';
  const where = `animation "${animName}" deform ${skin}/${track.slot}/${track.attachment}`;
  const keys = track.keys;
  // An array by the time this runs (`parseMotionSpec`); an EMPTY one is a
  // format rule rather than a shape — the parser reads key 0, finds nothing and
  // skips the timeline, which is assertion A34's silent case.
  if (keys.length === 0) throw new CompileError(`${where}: no keys`);

  const out: SpineTimelineKey[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const time = keyTime(key.t);
    if (i > 0 && time <= (out[i - 1].time as number)) {
      throw new CompileError(`${where}: key times must strictly increase (at t=${key.t})`);
    }
    checkKeyTime(where, time, key.t, duration);
    // -- a key that states a MODEL rather than a run (issue #294) ------------
    //
    // Handled before everything below, because a transform key carries no
    // `vertices` and would otherwise be read as the format's "back to the setup
    // pose". The three refusals are the bounds the issue drew: a key states one
    // or the other, never both; a model covers every vertex, so a start index
    // has nothing to mean; and a model needs one coordinate space to be
    // evaluated in, which a multi-bone or multi-space weighted attachment does
    // not have.
    if (key.transform !== undefined) {
      if (key.vertices !== undefined && key.vertices !== null) {
        throw new CompileError(
          `${where} (t=${key.t}): the key carries both a "transform" and a "vertices" run, and they are two answers to ` +
            'one question. Authored offsets and a stated model do not combine, for the same reason a mesh cannot carry ' +
            'both a "generator" and authored geometry — drop one.',
        );
      }
      if (key.offset !== undefined || key.fromVertex !== undefined) {
        throw new CompileError(
          `${where} (t=${key.t}): the key states a "transform" and a start index. A transform is a model of the whole ` +
            `attachment and is evaluated over all ${geometry.vertexCount} of its vertices, so it always starts at deform ` +
            'index 0. A model applied to part of a run leaves a step at the run\'s edge — write the partial run by hand ' +
            'if that is what you mean.',
        );
      }
      if (geometry.setup === null) {
        throw new CompileError(
          `${where} (t=${key.t}): a "transform" is evaluated over the attachment's own setup geometry, and this ` +
            `attachment has no single space to evaluate it in — ${geometry.setupWhy}. Key the control bone instead, or ` +
            'write the bind-space pairs yourself and start the run with "offset".',
        );
      }
      const report = evaluateDeformTransform(key.transform, geometry.setup, r6, `${where} (t=${key.t})`);
      if (report.offsets.length !== geometry.deformLength) {
        // Unreachable while `setup` is one pair per vertex and `deformLength` is
        // twice the vertex count, which is the whole reason both are derived
        // from the same walk. Stated rather than assumed: a silent mismatch here
        // is the overrun A35 exists for.
        throw new CompileError(
          `${where} (t=${key.t}): the transform produced ${report.offsets.length} numbers and this attachment's deform ` +
            `array is ${geometry.deformLength} long`,
        );
      }
      generated.push({ animation: animName, skin, slot: track.slot, attachment: track.attachment, time, ...report });
      out.push(deformKeyCurve({ time, vertices: report.offsets }, key, keys, i, motion, where));
      continue;
    }
    if (key.offset !== undefined && key.fromVertex !== undefined) {
      throw new CompileError(
        `${where} (t=${key.t}): a key gives its start as "offset" (an index into the deform array) or as ` +
          '"fromVertex" (a vertex index rigc translates), never both',
      );
    }
    const run = key.vertices ?? null;
    if (run === null) {
      // The parser's own encoding for "no edit": with no `vertices` the deform is
      // the setup pose. `offset`/`fromVertex` would be pointing into nothing, and
      // two spellings of one key must not emit two different files.
      if (key.offset !== undefined || key.fromVertex !== undefined) {
        throw new CompileError(
          `${where} (t=${key.t}): the key has no "vertices", which is the format's way of saying "back to the ` +
            'setup pose" — so there is nothing for a start index to point at. Drop the offset, or give it a run.',
        );
      }
      out.push(deformKeyCurve({ time }, key, keys, i, motion, where));
      continue;
    }
    if (!Array.isArray(run) || run.length === 0) {
      throw new CompileError(
        `${where} (t=${key.t}): "vertices" is ${JSON.stringify(key.vertices)}; give an array of x, y offsets, ` +
          'or omit it entirely for "back to the setup pose"',
      );
    }
    if (run.length % 2 !== 0) {
      throw new CompileError(
        `${where} (t=${key.t}): "vertices" holds ${run.length} numbers; the deform array is x, y PAIRS, so a run has an even length`,
      );
    }
    for (const n of run) {
      if (typeof n !== 'number' || !Number.isFinite(n)) {
        throw new CompileError(`${where} (t=${key.t}): "vertices" holds a non-finite value ${JSON.stringify(n)}`);
      }
    }
    const start = deformStart(key, run.length, geometry, where);
    if (start + run.length > geometry.deformLength) {
      throw new CompileError(
        `${where} (t=${key.t}): the run starts at deform index ${start} and is ${run.length} long, which ends at ` +
          `${start + run.length}; this attachment's deform array is ${geometry.deformLength} long ` +
          `(${geometry.weighted ? `${geometry.deformLength / 2} bone influences` : `${geometry.vertexCount} vertices`}). ` +
          'The parser copies into a Float32Array, so everything past the end is dropped without a word.',
      );
    }
    const entry: SpineTimelineKey = { time };
    // `offset` defaults to 0 in the parser and the editor omits it there, so an
    // authored 0, an authored `fromVertex: 0` and an absent start all emit the
    // same bytes — one meaning, one file.
    if (start !== 0) entry.offset = start;
    entry.vertices = run.map(r6);
    out.push(deformKeyCurve(entry, key, keys, i, motion, where));
  }
  return out;
}

/**
 * Where in the deform array this key's run begins.
 *
 * `offset` is that index outright. `fromVertex` is a vertex index, and turning
 * one into the other is exact only where a vertex occupies exactly one pair —
 * which is every vertex of an unweighted attachment and only the single-bone
 * vertices of a weighted one.
 */
function deformStart(
  key: MotionDeformTrack['keys'][number],
  runLength: number,
  geometry: DeformGeometry,
  where: string,
): number {
  if (key.offset !== undefined) {
    if (!Number.isInteger(key.offset) || key.offset < 0) {
      throw new CompileError(
        `${where} (t=${key.t}): offset is ${JSON.stringify(key.offset)}; it is an index into the deform array, so a whole number ≥ 0`,
      );
    }
    if (key.offset % 2 !== 0) {
      throw new CompileError(
        `${where} (t=${key.t}): offset ${key.offset} is odd. The deform array is x, y pairs, so an odd start puts ` +
          "every x of this run on a y — it loads, and the mesh tears. Use an even index, or say which vertex you meant with \"fromVertex\".",
      );
    }
    return key.offset;
  }
  if (key.fromVertex === undefined) return 0;
  const from = key.fromVertex;
  if (!Number.isInteger(from) || from < 0) {
    throw new CompileError(`${where} (t=${key.t}): fromVertex is ${JSON.stringify(from)}; it is a vertex index, so a whole number ≥ 0`);
  }
  const covered = runLength / 2;
  if (from + covered > geometry.vertexCount) {
    throw new CompileError(
      `${where} (t=${key.t}): fromVertex ${from} plus ${covered} vertex offset(s) runs to vertex ${from + covered}, ` +
        `and the attachment has ${geometry.vertexCount}`,
    );
  }
  if (!geometry.weighted) return from * 2;
  const counts = geometry.boneCounts!;
  for (let v = from; v < from + covered; v++) {
    if (counts[v] === 1) continue;
    throw new CompileError(
      `${where} (t=${key.t}): "fromVertex" counts VERTICES, and this attachment is weighted — its deform array ` +
        `holds one x, y pair per bone INFLUENCE, and vertex ${v} has ${counts[v]} of them. One offset per vertex ` +
        'is not a thing that array can hold: the world offset of a multi-bone vertex is the weighted sum of a ' +
        'per-bone offset in each bone\'s own bind space, so rigc will not guess one for you. Either key the ' +
        'control bone instead, or write the bind-space pairs yourself and start the run with "offset" ' +
        `(vertex ${from} starts at deform index ${2 * counts.slice(0, from).reduce((a, b) => a + b, 0)}).`,
    );
  }
  let start = 0;
  for (let v = 0; v < from; v++) start += counts[v];
  return start * 2;
}

/**
 * A deform key's curve.
 *
 * One channel, and it is not any value in `vertices`: `readCurve(curve, timeline,
 * bezier, frame, 0, time, time2, 0, 1, 1)` builds the cubic between **0 and 1**,
 * the fraction of the way from this key's geometry to the next one's. So a named
 * easing here is the same shape it would be anywhere, applied to the blend rather
 * than to a coordinate, and a raw curve is four numbers whose value axis is 0..1.
 */
function deformKeyCurve(
  entry: SpineTimelineKey,
  key: MotionDeformTrack['keys'][number],
  keys: MotionDeformTrack['keys'],
  index: number,
  motion: MotionSpec,
  where: string,
): SpineTimelineKey {
  const hasNext = index + 1 < keys.length;
  if (key.ease !== undefined && key.curve !== undefined) {
    throw new CompileError(`${where}: a key carries both a named easing and a raw curve; pick one`);
  }
  if (key.curve !== undefined) {
    if (!hasNext) throw new CompileError(`${where}: last key carries a curve but has nothing to ease to`);
    entry.curve = rawCurve(key.curve, 1, where, String(key.t));
    return entry;
  }
  if (key.ease === undefined) return entry;
  if (!hasNext) throw new CompileError(`${where}: last key carries an easing but has nothing to ease to`);
  if (key.ease === 'stepped') {
    entry.curve = 'stepped';
    return entry;
  }
  const handles = motion.easings?.[key.ease];
  if (!handles) throw new CompileError(`${where}: unknown easing "${key.ease}"`);
  entry.curve = bezierForChannel(handles, entry.time as number, keyTime(keys[index + 1].t), 0, 1);
  return entry;
}

function resolveTargets(track: MotionTrack, motion: MotionSpec, animName: string): string[] {
  const targetFields = ['slot', 'group', 'bone', ...CONSTRAINT_TRACK_TARGETS] as const;
  const named = targetFields.filter((field) => track[field] !== undefined);
  if (named.length > 1) {
    throw new CompileError(
      `animation "${animName}": a track names more than one target (${named.join(', ')}); the list is ` +
        `${targetFields.join('/')} and a track names exactly one`,
    );
  }
  const family = constraintFamilyOf(track);
  if (family) {
    const { tracks, label } = CONSTRAINT_TRACK_FAMILIES[family];
    const direct = track[family];
    const who = direct === undefined ? `group "${String(track.group)}"` : `${label} "${direct}"`;
    if (!(track.property in tracks)) {
      throw new CompileError(
        `animation "${animName}": ${who} has no timeline "${track.property}" (it has: ${Object.keys(tracks).join(', ')})`,
      );
    }
    if (direct !== undefined) return [direct];
    const members = motion.groups?.[String(track.group)];
    if (!members) throw new CompileError(`animation "${animName}": unknown group "${String(track.group)}"`);
    return members;
  }
  // A constraint timeline with no constraint named. Worth its own refusal: the
  // property names a family, so the message can say which field would carry it
  // rather than leaving the track to be read as a slot track and refused for
  // targeting a slot nobody declared.
  const owning = CONSTRAINT_TRACK_TARGETS.filter((f) => track.property in CONSTRAINT_TRACK_FAMILIES[f].tracks);
  if (owning.length) {
    throw new CompileError(
      `animation "${animName}": "${track.property}" is a ${owning.map((f) => CONSTRAINT_TRACK_FAMILIES[f].label).join(' / ')} ` +
        `timeline, and this track names no constraint — put the name in "${owning.join('" or "')}"`,
    );
  }
  const isBoneTrack = track.property in BONE_TRACKS;
  if (isBoneTrack && !track.bone && !track.group) {
    throw new CompileError(`animation "${animName}": "${track.property}" is a bone track but no bone is named`);
  }
  if (!isBoneTrack && track.bone) {
    throw new CompileError(`animation "${animName}": bone "${track.bone}" cannot take slot property "${track.property}"`);
  }
  if (track.bone) return [track.bone];
  if (track.slot) return [track.slot];
  if (track.group) {
    // A group's members are bones or slots depending on the property, which is
    // what lets `stagger` express the ring lag: four grips, one track, a few
    // frames apart. Plan 02 section 4-2 calls that lag the real detail of the
    // stroke, and it is the difference between a ring following the part and two
    // objects moving together (which reads as a composite).
    const members = motion.groups?.[track.group];
    if (!members) throw new CompileError(`animation "${animName}": unknown group "${track.group}"`);
    return members;
  }
  throw new CompileError(`animation "${animName}": a track targets neither slot nor group`);
}

/**
 * The `groups` table itself, checked once before any animation reads it.
 *
 * ⭐ **A member named twice is refused here and nowhere else.** JSON collapses a
 * repeated object key silently, so a repeat inside a `v` map or a `depth` map is
 * unreachable by the time `JSON.parse` is done with it — the group declaration
 * is the one place a repeated member survives into the data, and it is also the
 * place that decides `stagger`'s member order. A duplicate there used to reach
 * the per-target loop and come back as *"animation X has two tracks on
 * eye_l.translatex; merge them"* — true of nothing the author wrote, and it
 * names the wrong file.
 *
 * An **empty** group is refused for the reason a vacuous assertion is: a track
 * naming one compiles no timeline at all, reports nothing, and gates green.
 */
function checkMotionGroups(motion: MotionSpec): void {
  for (const [name, members] of Object.entries(motion.groups ?? {})) {
    if (!Array.isArray(members)) {
      throw new CompileError(`group "${name}" is ${JSON.stringify(members)}; it is an array of member names`);
    }
    if (members.length === 0) {
      throw new CompileError(
        `group "${name}" declares no members, so every track naming it would compile no timeline and gate green`,
      );
    }
    const seen = new Set<string>();
    members.forEach((member, i) => {
      if (typeof member !== 'string' || member.length === 0) {
        throw new CompileError(`group "${name}" member ${i} is ${JSON.stringify(member)}; it is a bone or slot name`);
      }
      if (seen.has(member)) {
        throw new CompileError(
          `group "${name}" names member "${member}" twice (at index ${members.indexOf(member)} and ${i}). ` +
            'Member order is what `stagger` counts and what a per-member value map is read against, so a repeat is ' +
            'two different delays and two different values for one bone.',
        );
      }
      seen.add(member);
    });
  }
}

/** Is this `v` the per-member map rather than one value? */
function isMemberValues(v: unknown): v is MotionMemberValues {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Resolve a track's values **per target**: a plain `v` unchanged, a stated `v`
 * map split up, or a `derive` model evaluated — plus the report `explain` prints
 * (issue #295).
 *
 * Every track goes through here, and a track with no per-member value in it
 * comes out holding exactly the keys it went in with. That is deliberate: it
 * makes "`v` means one thing below this line" a property of the type
 * (`MotionValueTrack`) rather than of a branch somebody has to remember.
 *
 * ## Why the whole track is resolved at once
 *
 * Because a model is **one statement about all the members**, and the report has
 * to be able to print them side by side. Evaluating per target would run the
 * closed form once per member, produce N reports of one row each, and lose the
 * only arrangement in which a wrong sign is visible.
 */
function resolveMemberTrack(
  track: MotionTrack,
  animName: string,
  targets: readonly string[],
  bones: readonly SpineBone[],
  derivations: CompileResult['trackDerivations'],
): Map<string, MotionValueTrack> {
  const carriesMap = track.keys.some((key) => isMemberValues(key.v));
  const carriesModel = track.keys.some((key) => key.derive !== undefined);

  const targetKind: 'group' | 'bone' = track.group === undefined ? 'bone' : 'group';
  const target = track.group ?? track.bone ?? String(targets[0]);
  const at = `animation "${animName}" ${targetKind} "${target}" ${track.property}`;
  if ((carriesMap || carriesModel) && track.group === undefined && track.bone === undefined) {
    throw new CompileError(
      `${at}: per-member values need a target whose members are named — put them on a track that names a "group", or ` +
        'a "bone" for the one-member case',
    );
  }
  if (carriesMap && targetKind === 'bone') {
    throw new CompileError(
      `${at}: a per-member "v" map names members, and a bone track has one target rather than members. Write the ` +
        'value directly, or move the track onto a group.',
    );
  }

  // The setup coordinate a `derive` kind reads, and the parent it is measured in.
  // Resolved here rather than in `src/trackgen.ts` because the rig is the
  // compiler's to read: the model gets numbers that already mean one thing.
  const boneOf = new Map(bones.map((b) => [b.name, b]));
  const perTarget = new Map<string, MotionValueKey[]>();
  for (const name of targets) perTarget.set(name, []);

  for (const key of track.keys) {
    const where = `${at} (t=${key.t})`;
    if (key.derive !== undefined && isMemberValues(key.v)) {
      throw new CompileError(
        `${where}: this key carries both a "derive" model and a per-member "v" map — two answers to one question. ` +
          'The model states the arithmetic and the depths that produced the numbers; the map states the numbers. ' +
          'Pick one.',
      );
    }
    if (key.derive === undefined) {
      // Either a plain value (every member gets it, as today) or a stated map.
      if (!isMemberValues(key.v)) {
        for (const name of targets) perTarget.get(name)!.push({ ...key, v: key.v as number[] | string | null });
        continue;
      }
      const table = key.v;
      const known = new Set(targets);
      for (const named of Object.keys(table)) {
        if (!known.has(named)) {
          throw new CompileError(
            `${where}: the value map names "${named}", which group "${target}" does not declare ` +
              `(its members are: ${targets.join(', ')})`,
          );
        }
      }
      const row: Array<{ member: string; value: number[] | string | null }> = [];
      for (const name of targets) {
        if (!(name in table)) {
          throw new CompileError(
            `${where}: the value map states no value for member "${name}" ` +
              `(it states: ${Object.keys(table).join(', ') || 'nothing'}). ` +
              'A member is refused rather than defaulted: an absent value is exactly the thing a map of six is ' +
              'written to make visible, and defaulting it to the identity would key that one bone with a different ' +
              'motion in silence.',
          );
        }
        const value = table[name];
        perTarget.get(name)!.push({ ...key, v: value });
        row.push({ member: name, value });
      }
      derivations.push({
        animation: animName,
        target,
        targetKind,
        property: track.property,
        time: keyTime(key.t + (track.lag ?? 0)),
        authoredTime: key.t,
        model: null,
        members: row,
      });
      continue;
    }

    // A stated model. The members' setup coordinates come off the rig, and the
    // one thing that makes them comparable is that they are measured in the SAME
    // space — see the refusal below.
    const kind = (key.derive as { kind?: unknown }).kind;
    const coordinate =
      typeof kind === 'string' && kind in TRACK_DERIVE_PROJECTIONS
        ? TRACK_DERIVE_PROJECTIONS[kind as keyof typeof TRACK_DERIVE_PROJECTIONS].coordinate
        : 'x';
    const members: TrackDeriveMember[] = [];
    const parents = new Set<string>();
    for (const name of targets) {
      const bone = boneOf.get(name);
      if (!bone) {
        throw new CompileError(
          `${where}: derive reads member "${name}"'s setup position, and this rig declares no such bone. ` +
            'A model over a group of slots or constraints has no coordinate to be evaluated at — state the values ' +
            'as a "v" map.',
        );
      }
      parents.add(bone.parent ?? '(root)');
      members.push({ name, at: coordinate === 'x' ? (bone.x ?? 0) : (bone.y ?? 0) });
    }
    if (parents.size > 1) {
      throw new CompileError(
        `${where}: derive measures every member's "${coordinate}" from its parent's origin and "about" says where the ` +
          `axis crosses it, so one space is what makes the members comparable. These members sit under ` +
          `${parents.size} different parents (${[...parents].join(', ')}), and their coordinates are therefore ` +
          'measured from different origins. Split the track by parent, or state the values as a "v" map.',
      );
    }
    const report = evaluateTrackDerive(key.derive, track.property, members, r6, where);
    const row: Array<{ member: string; value: number[] | string | null }> = [];
    report.members.forEach((m, i) => {
      perTarget.get(members[i].name)!.push({ ...key, v: [m.value] });
      row.push({ member: m.member, value: [m.value] });
    });
    derivations.push({
      animation: animName,
      target,
      targetKind,
      property: track.property,
      time: keyTime(key.t + (track.lag ?? 0)),
      authoredTime: key.t,
      model: report,
      members: row,
    });
  }

  const out = new Map<string, MotionValueTrack>();
  for (const name of targets) out.set(name, { ...track, keys: perTarget.get(name)! });
  return out;
}

function compileTrack(
  track: MotionValueTrack,
  motion: MotionSpec,
  animName: string,
  duration: number,
  target: string,
  shift: number,
  skinAttachments: Record<string, Record<string, SpineAttachment>>,
): SpineTimelineKey[] {
  const where = `animation "${animName}" slot "${target}" ${track.property}`;
  if (!track.keys.length) throw new CompileError(`${where}: no keys`);

  const out: SpineTimelineKey[] = [];
  for (let i = 0; i < track.keys.length; i++) {
    const key = track.keys[i];
    const next = track.keys[i + 1];
    const time = keyTime(key.t + shift);
    if (i > 0 && time <= (out[i - 1].time as number)) {
      throw new CompileError(`${where}: key times must strictly increase (at t=${key.t})`);
    }
    checkKeyTime(where, time, key.t, duration);

    if (track.property === 'attachment') {
      if (key.v !== null && typeof key.v !== 'string') {
        throw new CompileError(`${where}: attachment key value must be a string or null`);
      }
      if (key.v !== null && !(key.v in (skinAttachments[target] ?? {}))) {
        throw new CompileError(`${where}: attachment "${key.v}" is not in slot "${target}"`);
      }
      if (key.ease) throw new CompileError(`${where}: attachment keys cannot carry an easing`);
      // Attachment timelines are inherently stepped — exactly what lip-sync wants.
      out.push({ time, name: key.v });
      continue;
    }

    // rgba
    if (!Array.isArray(key.v)) throw new CompileError(`${where}: rgba key value must be [r,g,b,a]`);
    const entry: SpineTimelineKey = { time, color: rgbaHex(key.v) };
    if (key.ease !== undefined && key.curve !== undefined) {
      throw new CompileError(`${where}: a key carries both a named easing and a raw curve; pick one`);
    }
    if (key.curve !== undefined) {
      if (!next) throw new CompileError(`${where}: last key carries a curve but has nothing to ease to`);
      entry.curve = rawCurve(key.curve, 4, where, String(key.t));
      out.push(entry);
      continue;
    }
    if (key.ease && next) {
      if (key.ease === 'stepped') {
        entry.curve = 'stepped';
      } else {
        const handles = motion.easings?.[key.ease];
        if (!handles) throw new CompileError(`${where}: unknown easing "${key.ease}"`);
        if (!Array.isArray(next.v)) {
          throw new CompileError(`${where}: rgba key value must be [r,g,b,a]`);
        }
        const t2 = keyTime(next.t + shift);
        // 4 numbers per channel, r g b a — 16 in total. Short arrays become NaN
        // curves with no error.
        const curve: number[] = [];
        for (let c = 0; c < 4; c++) {
          curve.push(...bezierForChannel(handles, time, t2, key.v[c], next.v[c]));
        }
        entry.curve = curve;
      }
    } else if (key.ease && !next) {
      throw new CompileError(`${where}: last key carries an easing but has nothing to ease to`);
    }
    out.push(entry);
  }
  return out;
}
