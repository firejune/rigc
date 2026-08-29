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
import {
  parseRigSpec,
  type RigAttachment,
  type RigBone,
  type RigBoundingBoxAttachment,
  type RigClippingAttachment,
  type RigEvent,
  type RigMeshAttachment,
  type RigMeshBinding,
  type RigRegionAttachment,
  type RigSpec,
  type RigVertexGeometry,
} from './rig.ts';
import { buildRibbonMesh, buildRingMesh, encodeWeightedVertices, MeshError, type MeshBoneRef } from './mesh.ts';
import { KEY_TIME_EPSILON } from './timelines.ts';
import {
  computeWorldTransforms,
  cropToSpineY,
  normaliseDegrees,
  screenToSpineDegrees,
  toBoneLocal,
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
  MotionSpec,
  MotionTrack,
  MotionTransformTrack,
  RigInfo,
  SpineAttachment,
  SpineBone,
  SpineBoundingBoxAttachment,
  SpineClippingAttachment,
  SpineConstraint,
  SpineEvent,
  SpineMeshAttachment,
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
}

/**
 * One part = one page. No packer, so no PMA trap, no rotation, no strip
 * offsets. Region covers the page exactly => u2=v2=1.
 *
 * Two text-shape traps are load-bearing here:
 *   * a region name is the RAW line, not a trimmed one -> no indentation;
 *   * a blank line closes the page block -> none between header and regions.
 *
 * Exported (rather than inlined into `compile`) so `--copy-images` can call it a
 * second time with `page` rewritten to the copies' filenames, after the copy
 * itself has happened — see [`src/emit.ts`](emit.ts). Everything else about an
 * image (`region`, `width`, `height`) is unchanged by that rewrite; only where the
 * bytes live moved.
 */
export function buildAtlasText(images: CompiledImage[]): string {
  const atlasLines: string[] = [];
  images.forEach((img, i) => {
    if (i > 0) atlasLines.push(''); // exactly one blank line BETWEEN pages
    atlasLines.push(img.page);
    atlasLines.push(`size: ${img.width}, ${img.height}`);
    atlasLines.push('filter: Linear, Linear');
    atlasLines.push('pma: false');
    atlasLines.push(img.region);
    atlasLines.push(`bounds: 0, 0, ${img.width}, ${img.height}`);
    atlasLines.push(`offsets: 0, 0, ${img.width}, ${img.height}`);
    atlasLines.push('rotate: 0');
  });
  return `${atlasLines.join('\n')}\n`;
}

export function compile(opts: CompileOptions): CompileResult {
  const rigPath = resolve(opts.rigPath);
  const motionPath = resolve(opts.motionPath);
  const outDir = resolve(opts.outDir);
  const manifestPath = opts.manifestPath === undefined ? null : resolve(opts.manifestPath);
  const manifestDir = manifestPath === null ? null : dirname(manifestPath);

  const rig = parseRigSpec(readJson<unknown>(rigPath), rigPath);
  const motion = readJson<MotionSpec>(motionPath);
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
    if (motion.spec !== 'rigc-motion/1') {
      throw new CompileError(`unknown motion spec version: ${String(motion.spec)}`);
    }
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

  const addImage = (relPath: string, baseDir: string, isBase: boolean): CompiledImage => {
    const absPath = resolve(baseDir, relPath);
    const region = basename(relPath, '.png');
    if (seenRegions.has(region)) {
      throw new CompileError(`duplicate region name "${region}" (${relPath})`);
    }
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
    const img: CompiledImage = {
      region,
      page,
      absPath,
      width: info.width,
      height: info.height,
      hasAlpha: info.hasAlpha,
      isBase,
    };
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

  for (const part of parts) {
    const win = partWindow(part, manifest!);
    if (part.image) {
      // One unconditional attachment: the base plate, and every joint part.
      const img = addImage(part.image, manifestDir!, isBasePlate(part, manifest!));
      if (img.width !== win.w || img.height !== win.h) {
        throw new CompileError(
          `${part.image} is ${img.width}x${img.height} but the manifest window for "${part.slot}" is ${win.w}x${win.h}`,
        );
      }
      slotAttachments.set(part.slot, [img.region]);
      continue;
    }
    const names: string[] = [];
    for (const [state, relPath] of Object.entries(part.states ?? {})) {
      if (relPath === null) continue; // base pixels show through; nothing to emit
      const absPath = resolve(manifestDir!, relPath);
      if (!existsSync(absPath)) {
        // A manifest can outlive a state whose art was dropped. It still lists
        // it, so the compiler reports the gap rather than pretending either way.
        droppedStates.push({ slot: part.slot, state, path: relPath });
        continue;
      }
      const img = addImage(relPath, manifestDir!, false);
      if (img.width !== win.w || img.height !== win.h) {
        throw new CompileError(
          `${relPath} is ${img.width}x${img.height} but slot "${part.slot}" declares ${win.w}x${win.h}`,
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
  const rigAttachmentNames = new Map<string, string[]>();
  for (const skinName of skinNames) {
    for (const [slotName, placeholders] of Object.entries(rig.skins![skinName])) {
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
  const atlasText = buildAtlasText(images);

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
  const meshBones = new Set<string>();
  const meshes: CompileResult['meshes'] = [];

  for (const rigSlot of rig.slots) {
    const part = partBySlot.get(rigSlot.name);
    const names = slotAttachments.get(rigSlot.name) ?? rigAttachmentNames.get(rigSlot.name) ?? [];
    if (!names.length) continue;

    const setup = motion.setup?.[rigSlot.name];
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
      const placeholders = rig.skins![skinName][rigSlot.name];
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
  // 📐 The implicit budget of 0 is a statement about rigc's own GENERATORS: a rig
  // that declares no `invariants.meshSlots` has not asked rigc to build any mesh,
  // so building one is a mistake. It is not a statement about geometry somebody
  // else drew — `RigInvariants.meshTriangles` says the same thing in words:
  // a number baked in here would be one project's frame time masquerading as a
  // property of the format. So authored meshes count against a budget the rig
  // states out loud, and against nothing when it states none.
  const budgeted = rig.invariants?.meshSlots === undefined ? meshes.filter((m) => m.kind !== 'authored') : meshes;
  if (budgeted.length > meshBudget) {
    throw new CompileError(`${budgeted.length} mesh slot(s) emitted but the rig "${rig.name}" allows ${meshBudget}`);
  }

  // -- 4b. constraints -------------------------------------------------------
  // One top-level `constraints` array, `type` per entry. Rig-declared first
  // (structure), then the motion spec's physics table (tuning). A name in both is
  // refused: `mix` timelines resolve by name, and two constraints answering to
  // one name is a timeline driving something nobody chose.
  const constraints: SpineConstraint[] = [];
  const physicsReport: CompileResult['physics'] = [];
  const constraintNames = new Set<string>();
  // `ik` and `transform` timelines resolve their target by name AND by type —
  // `findConstraint(name, IkConstraintData)` returns null for a transform
  // constraint of the same name and the parser then throws. Keeping the type
  // beside the name is what lets the refusal say which of the two it is.
  const constraintTypes = new Map<string, string>();
  for (const spec of rig.constraints ?? []) {
    constraints.push(buildRigConstraint(spec as RigConstraintInput, boneNames));
    constraintNames.add(spec.name);
    constraintTypes.set(spec.name, spec.type);
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
    for (const [animName, anim] of Object.entries(motion.animations)) {
      declaredDurations[animName] = anim.duration;
      const slotTimelines: Record<string, Record<string, SpineTimelineKey[]>> = {};
      const boneTimelines: Record<string, Record<string, SpineTimelineKey[]>> = {};
      const physicsTimelines: Record<string, Record<string, SpineTimelineKey[]>> = {};
      const claimed = new Set<string>();
      let compiledDuration = 0;

      for (const track of anim.tracks) {
        const isPhysicsTrack = track.property in PHYSICS_TRACKS;
        const isBoneTrack = !isPhysicsTrack && track.property in BONE_TRACKS;
        const targets = resolveTargets(track, motion, animName);
        targets.forEach((target, index) => {
          if (isPhysicsTrack) {
            if (!constraintNames.has(target)) {
              throw new CompileError(`animation "${animName}" keys unknown physics constraint "${target}"`);
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
          const keys = isPhysicsTrack
            ? compileValueTrack(track, motion, animName, anim.duration, target, shift, PHYSICS_TRACKS, 'physics constraint')
            : isBoneTrack
              ? compileValueTrack(track, motion, animName, anim.duration, target, shift, BONE_TRACKS, 'bone')
              : compileTrack(track, motion, animName, anim.duration, target, shift, tableFor('default'));
          for (const key of keys) compiledDuration = Math.max(compiledDuration, key.time as number);
          if (isPhysicsTrack) (physicsTimelines[target] ??= {})[track.property] = keys;
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
        const tracks: Array<MotionIkTrack | MotionTransformTrack> = anim[group] ?? [];
        if (!Array.isArray(tracks)) {
          throw new CompileError(`animation "${animName}": "${group}" must be an array of { constraint, keys } entries`);
        }
        for (const track of tracks) {
          const name = track.constraint;
          if (typeof name !== 'string' || name.length === 0) {
            throw new CompileError(`animation "${animName}": a ${group} timeline needs a "constraint" name`);
          }
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
          const keys = compileConstraintTrack(group, track, motion, animName, anim.duration);
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
      if (!Array.isArray(deformTracks)) {
        throw new CompileError(
          `animation "${animName}": "deform" must be an array of { slot, attachment, keys } entries`,
        );
      }
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
      if (Object.keys(physicsTimelines).length) animations[animName].physics = physicsTimelines;
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
    skins: [...skinTables.entries()].map(([name, attachments]) => ({ name, attachments })),
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
  if (type === 'mesh') return buildRigMesh(att as RigMeshAttachment, where, ctx);
  if (type === 'boundingbox') return buildRigBoundingBox(att as RigBoundingBoxAttachment, where, ctx);
  if (type === 'clipping') return buildRigClipping(att as RigClippingAttachment, where, ctx);
  throw new NotImplementedError(
    `${where}: attachment type "${String(type)}" is in the Spine 4.3 format and rigc does not emit it yet. ` +
      'Implemented: region, mesh, boundingbox, clipping. ' +
      'point, path and linkedmesh are deliberately deferred: not one of them appears anywhere in the benchmark ' +
      'corpus (docs/SPEC_COVERAGE.md parts 3-1 and 4-2), so none is on the ladder\'s critical path. ' +
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

function buildRigRegion(
  att: RigRegionAttachment,
  placeholder: string,
  where: string,
  ctx: AttachmentContext,
): SpineRegionAttachment {
  const img = att.image === undefined ? null : ctx.images.find((im) => im.region === basename(att.image!, '.png'));
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

function buildRigMesh(att: RigMeshAttachment, where: string, ctx: AttachmentContext): SpineMeshAttachment {
  const authored =
    att.uvs !== undefined || att.triangles !== undefined || att.vertices !== undefined || att.weights !== undefined;
  if (authored && att.generator) {
    throw new CompileError(`${where}: a mesh is either authored geometry or a generator, never both`);
  }
  if (att.generator) return buildGeneratedMesh(att, att.generator, where, ctx);
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
  ctx.meshes.push({
    slot: ctx.slotName,
    kind: 'authored',
    attachments: [ctx.slotName],
    vertices: uvCount / 2,
    triangles: att.triangles.length / 3,
    bones: boundBones.length ? boundBones : [ctx.anchorBone],
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
  where: string,
  ctx: AttachmentContext,
): SpineMeshAttachment {
  if (generator.kind === 'contour') {
    throw new NotImplementedError(
      `${where}: the "contour" generator would triangulate a part's own alpha mask, and src/mesh.ts has no triangulator — ` +
        'it holds buildRingMesh and buildRibbonMesh only',
    );
  }
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

// ---------------------------------------------------------------------------
// rig-declared constraints
// ---------------------------------------------------------------------------

/** The rig-constraint shape as this file consumes it: a name, a type, and fields. */
type RigConstraintInput = { name: string; type: string } & Record<string, unknown>;

/** The six property names a transform constraint may map between (`:241`, `:521`). */
const TRANSFORM_PROPERTIES = ['rotate', 'x', 'y', 'scaleX', 'scaleY', 'shearY'];

/**
 * 4.3 puts every constraint in one array and branches on `type`. An entry whose
 * type matches no case is dropped with no error and no `default:` branch, so an
 * unimplemented type is refused here by name rather than emitted and lost.
 */
function buildRigConstraint(spec: RigConstraintInput, boneNames: Set<string>): SpineConstraint {
  const where = `rig constraint "${spec.name}"`;
  const needBone = (name: unknown, field: string): string => {
    if (typeof name !== 'string' || !boneNames.has(name)) {
      throw new CompileError(`${where}: ${field} names ${JSON.stringify(name)}, which the rig does not declare as a bone`);
    }
    return name;
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
  throw new NotImplementedError(
    `${where}: constraint type "${String(spec.type)}" is in the Spine 4.3 format and rigc does not emit it yet. ` +
      'Implemented: ik, transform, physics. Neither path nor slider appears anywhere in the benchmark corpus ' +
      '(docs/SPEC_COVERAGE.md part 4-2).',
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
  const meshKinds: Record<string, 'ring' | 'ribbon' | 'authored'> = {};
  for (const mesh of meshes) meshKinds[mesh.slot] = mesh.kind;
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
  track: MotionTrack,
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
    if (!Number.isFinite(key.t)) throw new CompileError(`${where}: key ${i} has a non-finite time ${String(key.t)}`);
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
 */
function compileConstraintTrack(
  group: 'ik' | 'transform',
  track: MotionIkTrack | MotionTransformTrack,
  motion: MotionSpec,
  animName: string,
  duration: number,
): SpineTimelineKey[] {
  const shape = CONSTRAINT_TIMELINES[group];
  const article = group === 'ik' ? 'an' : 'a';
  const where = `animation "${animName}" ${group} constraint "${track.constraint}"`;
  const keys = track.keys;
  if (!Array.isArray(keys) || keys.length === 0) throw new CompileError(`${where}: no keys`);

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
    if (!Number.isFinite(key.t)) throw new CompileError(`${where}: key ${i} has a non-finite time ${String(key.t)}`);
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
      if (v === undefined) continue;
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
  } else {
    throw new CompileError(
      `${where}: a deform timeline keys the vertices of an attachment, and this one is a "${type}" — ` +
        'it has no vertex array to deform. Deformable types: mesh, boundingbox, clipping.',
    );
  }
  const vertices = (att as SpineMeshAttachment).vertices ?? [];
  const weighted = vertices.length !== worldVerticesLength;
  if (!weighted) {
    return { weighted, deformLength: worldVerticesLength, vertexCount: worldVerticesLength / 2, boneCounts: null };
  }
  // Walk the weight run for the per-vertex influence counts. The run's own shape
  // is already assured by the attachment builders and by A33/A04; this only
  // counts, and a malformed run stops rather than producing a plausible number.
  const boneCounts: number[] = [];
  for (let i = 0; i < vertices.length; ) {
    const n = vertices[i++];
    if (!Number.isInteger(n) || n < 1) {
      throw new CompileError(`${where}: the attachment's weighted vertex run has a bone count of ${String(n)} at index ${i - 1}`);
    }
    i += n * 4;
    if (i > vertices.length) {
      throw new CompileError(`${where}: the attachment's weighted vertex run is truncated at vertex ${boneCounts.length}`);
    }
    boneCounts.push(n);
  }
  const influences = vertices.length / 3;
  return { weighted, deformLength: influences * 2, vertexCount: boneCounts.length, boneCounts };
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
): SpineTimelineKey[] {
  const skin = track.skin ?? 'default';
  const where = `animation "${animName}" deform ${skin}/${track.slot}/${track.attachment}`;
  const keys = track.keys;
  if (!Array.isArray(keys) || keys.length === 0) throw new CompileError(`${where}: no keys`);

  const out: SpineTimelineKey[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (!Number.isFinite(key.t)) throw new CompileError(`${where}: key ${i} has a non-finite time ${String(key.t)}`);
    const time = keyTime(key.t);
    if (i > 0 && time <= (out[i - 1].time as number)) {
      throw new CompileError(`${where}: key times must strictly increase (at t=${key.t})`);
    }
    checkKeyTime(where, time, key.t, duration);
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
  const named = [track.slot, track.group, track.bone, track.physics].filter((v) => v !== undefined);
  if (named.length > 1) {
    throw new CompileError(`animation "${animName}": a track names more than one target (slot/group/bone/physics)`);
  }
  if (track.property in PHYSICS_TRACKS) {
    if (track.physics) return [track.physics];
    if (track.group) {
      const members = motion.groups?.[track.group];
      if (!members) throw new CompileError(`animation "${animName}": unknown group "${track.group}"`);
      return members;
    }
    throw new CompileError(
      `animation "${animName}": "${track.property}" is a physics timeline but no constraint or group is named`,
    );
  }
  if (track.physics) {
    throw new CompileError(
      `animation "${animName}": physics constraint "${track.physics}" cannot take property "${track.property}"`,
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

function compileTrack(
  track: MotionTrack,
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
