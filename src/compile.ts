/**
 * rigc compile — cut manifest + motion spec -> Spine 4.3 skeleton JSON + a
 * one-part-per-page atlas. Pure data assembly: no spine-core here (that is the
 * validator's job, plan 04 section 4-1), no clock, no randomness.
 *
 * Determinism is a contract, not a habit: `validate` re-runs this and compares
 * the two emits byte for byte (assertion A18).
 */
import { basename, dirname, relative, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { readPngInfo } from './png.ts';
import { ARCHETYPES, cropToSpineY, type Archetype } from './archetype.ts';
import { buildRibbonMesh, buildRingMesh, encodeWeightedVertices, MeshError, type MeshBoneRef } from './mesh.ts';
import {
  computeWorldTransforms,
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
  MotionSpec,
  MotionTrack,
  RigInfo,
  SpineAttachment,
  SpineBone,
  SpineMeshAttachment,
  SpineRegionAttachment,
  SpineSkeletonJson,
  SpineSlot,
  SpineTimelineKey,
} from './types.ts';

/** The spine-core line the validator round-trips through. */
export const SPINE_VERSION = '4.3.13';

const FRAME = 1 / 60;

export class CompileError extends Error {}

// ---------------------------------------------------------------------------
// number formatting — deterministic, and free of "-0"
// ---------------------------------------------------------------------------

function r6(n: number): number {
  const v = Math.round(n * 1e6) / 1e6;
  return v === 0 ? 0 : v;
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
  scale: { fields: ['x', 'y'], identity: [1, 1] },
  rotate: { fields: ['value'], identity: [0] },
};

/**
 * Physics timelines. `mix` is the constraint's authority; `reset` is an event
 * with no value — one key at the entry frame stops the constraint from flying
 * in from whatever pose the previous animation left (plan 02 section 3 trap 2,
 * solved in DATA rather than in caller glue).
 */
const PHYSICS_TRACKS: Record<string, { fields: string[]; identity: number[] }> = {
  mix: { fields: ['value'], identity: [1] },
  reset: { fields: [], identity: [] },
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
// curves — plan 04 section 1-6
// ---------------------------------------------------------------------------

/**
 * Graph-view handles -> ABSOLUTE (time, value) control points.
 *
 * `Animation.setBezier` samples the cubic in the (time, value) plane, so the
 * normalised handles an editor shows are NOT what the JSON holds. Writing the
 * handles straight into the file loads without error and produces a different
 * curve — plan 04 section 1-6 item 3.
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
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
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
 * dirty-skip (plan 02 section 2-3, plan 02 section 7), so the base must never be
 * a mesh — and the validator recognises the same shape from the other side, which
 * is why assertion A14 already covers this without a new check. And a full-frame
 * region is the one page allowed to be opaque (A19).
 */
function isBasePlate(part: FaceManifestPart, manifest: FaceManifest): boolean {
  const win = partWindow(part, manifest);
  return win.x === 0 && win.y === 0 && win.w === manifest.crop.w && win.h === manifest.crop.h;
}

/** The archetype slot a manifest part joins on. See the `parts` mapping below. */
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
  manifestPath: string;
  motionPath: string;
  /** Directory the atlas + skeleton will be written to (page names are relative to it). */
  outDir: string;
}

export function compile(opts: CompileOptions): CompileResult {
  const manifestPath = resolve(opts.manifestPath);
  const motionPath = resolve(opts.motionPath);
  const outDir = resolve(opts.outDir);
  const manifestDir = dirname(manifestPath);

  const manifest = readJson<FaceManifest>(manifestPath);
  const motion = readJson<MotionSpec>(motionPath);

  if (motion.spec !== 'rigc-motion/1') {
    throw new CompileError(`unknown motion spec version: ${String(motion.spec)}`);
  }
  const archetype = ARCHETYPES[motion.archetype];
  if (!archetype) throw new CompileError(`unknown archetype: ${motion.archetype}`);

  const cropH = manifest.crop.h;

  // -- 1. gather images ------------------------------------------------------
  // Region name = attachment name = PNG basename (plan 04 section 4-3 step 2).
  const images: CompiledImage[] = [];
  const droppedStates: CompileResult['droppedStates'] = [];
  const seenRegions = new Set<string>();

  const addImage = (relPath: string, isBase: boolean): CompiledImage => {
    const absPath = resolve(manifestDir, relPath);
    const region = basename(relPath, '.png');
    if (seenRegions.has(region)) {
      throw new CompileError(`duplicate region name "${region}" (${relPath})`);
    }
    const info = readPngInfo(absPath);
    // Page name is the PNG path *relative to the atlas file*, so the viewer
    // resolves it the way every Spine consumer does: against the atlas URL.
    // The PNGs are not copied — plan 04 section 4-1 ("PNG는 그대로 통과").
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

  // A manifest may name a part the cut does not carry. Plan 02 section 2-2 marks
  // four of this archetype's seven slots optional, and the real tier-2 cut
  // delivers three plates: `03_fluid_overflow` is a scene-shared sprite sheet
  // (plan 01 section 3.5) and the manifest records it as `image: null` with no
  // window at all. That entry is a documented ABSENCE, not a part — and it used
  // to crash the compiler on its missing `offset` rather than being tolerated, so
  // "the optional slots are optional" needed this line to actually be true.
  const absentParts: CompileResult['absentParts'] = [];
  const declaredParts = manifest.parts.filter((part) => {
    if (part.image === null && !part.states) {
      absentParts.push({ slot: rigSlotOf(part), why: 'manifest declares `image: null` and no states' });
      return false;
    }
    return true;
  });
  // ⚠️ `rig_slot` is the join key, not `slot`. A cut manifest that is also a parts
  // lane record carries anatomical slot names of its own (`part`, `occluder`) and
  // scripts select on them; the archetype's table is what the runtime, the
  // probes and the viewer join on. So the mapping is manifest data, and the
  // archetype table stays single-valued — one name per slot, which is the only
  // way A26 and a `hide: ['lip']` probe can mean the same thing on every cut.
  const parts = declaredParts
    .map((part) => (part.rig_slot && part.rig_slot !== part.slot ? { ...part, slot: part.rig_slot } : part))
    .sort((a, b) => a.draw_order - b.draw_order);

  /** slot -> [attachment names], in the order the manifest lists the states. */
  const slotAttachments = new Map<string, string[]>();

  // Mesh parts, checked against the archetype budget before any geometry runs.
  const meshParts = parts.filter((part) => part.mesh);
  if (meshParts.length > archetype.maxMeshSlots) {
    throw new CompileError(
      `${meshParts.length} mesh slot(s) declared but archetype "${archetype.name}" allows ${archetype.maxMeshSlots}` +
        (archetype.maxMeshSlots === 0 ? ' — move the cut to face_overlay_v2 to switch the mesh tier on' : ''),
    );
  }
  for (const part of meshParts) {
    if (isBasePlate(part, manifest)) {
      // A base plate mesh is a full-frame canvas every frame (plan 02 section 2-3).
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
    const win = partWindow(part, manifest);
    if (part.image) {
      // One unconditional attachment: the base plate, and every joint part.
      const img = addImage(part.image, isBasePlate(part, manifest));
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
      const absPath = resolve(manifestDir, relPath);
      if (!existsSync(absPath)) {
        // plan 05 section 5-3 rung 2 dropped the `half` state. The manifest still
        // lists it, so the compiler reports it rather than pretending either way.
        droppedStates.push({ slot: part.slot, state, path: relPath });
        continue;
      }
      const img = addImage(relPath, false);
      if (img.width !== win.w || img.height !== win.h) {
        throw new CompileError(
          `${relPath} is ${img.width}x${img.height} but slot "${part.slot}" declares ${win.w}x${win.h}`,
        );
      }
      names.push(img.region);
    }
    slotAttachments.set(part.slot, names);
  }

  // -- 2. atlas --------------------------------------------------------------
  // One part = one page. No packer, so no PMA trap, no rotation, no strip
  // offsets (plan 04 section 7-3). Region covers the page exactly => u2=v2=1.
  //
  // Two text-shape traps are load-bearing here (plan 04 section 2-3):
  //   * a region name is the RAW line, not a trimmed one -> no indentation;
  //   * a blank line closes the page block -> none between header and regions.
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
  const atlasText = `${atlasLines.join('\n')}\n`;

  // -- 3. bones --------------------------------------------------------------
  const bones: SpineBone[] = [];
  /** slot -> the bone its attachments hang off. */
  const slotBoneOf = new Map<string, string>();
  const liveParts = parts.filter((part) => part.image || slotAttachments.get(part.slot)?.length);

  if (archetype.bones) {
    // Articulated archetype: the tree is declared in code because it is true of
    // every cut, and the positions come from the manifest because they are not.
    checkAxisSelfConsistency(manifest);
    const axisSpineDeg = manifest.axis ? screenToSpineDegrees(manifest.axis.deg) : null;
    for (const spec of archetype.bones) {
      if (!spec.parent) {
        bones.push({ name: spec.name });
        continue;
      }
      const key = spec.anchor ?? spec.name;
      const anchor = manifest.anchors?.[key];
      if (!anchor || anchor.length < 2) {
        throw new CompileError(
          `manifest anchors has no [x, y] for "${key}" (bone "${spec.name}" of archetype "${archetype.name}")`,
        );
      }
      let rotation = 0;
      if (spec.rotationFrom === 'axis') {
        if (axisSpineDeg === null) {
          throw new CompileError(`archetype "${archetype.name}" needs manifest.axis to place bone "${spec.name}"`);
        }
        rotation = axisSpineDeg;
      } else if (anchor.length > 2) {
        // A facing angle: the bone's local +X points that way in screen space, so
        // one shared translate key moves every grip radially outward.
        rotation = screenToSpineDegrees(anchor[2]);
      }
      const soFar = computeWorldTransforms(bones);
      const parent = soFar.get(spec.parent);
      if (!parent) {
        throw new CompileError(`archetype bone "${spec.name}" names parent "${spec.parent}", which is declared after it`);
      }
      const [lx, ly] = toBoneLocal(parent, anchor[0], cropToSpineY(anchor[1], cropH));
      const bone: SpineBone = { name: spec.name, parent: spec.parent, x: lx, y: ly };
      if (rotation !== 0) bone.rotation = rotation;
      bones.push(bone);
    }
    for (const part of liveParts) {
      const boneName = archetype.slotBone?.[part.slot];
      if (!boneName) {
        throw new CompileError(
          `archetype "${archetype.name}" has no bone for slot "${part.slot}" — extend its slot table rather than inventing one`,
        );
      }
      slotBoneOf.set(part.slot, boneName);
    }
    for (const part of liveParts) {
      for (const name of meshControlBones(part)) {
        if (!bones.some((b) => b.name === name)) {
          throw new CompileError(`slot "${part.slot}" drives control bone "${name}", which is not in archetype "${archetype.name}"`);
        }
      }
    }
  } else {
    // Overlay archetype: one bone per slot, pinned at the part window's centre.
    archetype.rootChain.forEach((name, i) => {
      bones.push(i === 0 ? { name } : { name, parent: archetype.rootChain[i - 1], x: 0, y: 0 });
    });
    const slotParent = archetype.rootChain[archetype.rootChain.length - 1];
    for (const part of liveParts) {
      const win = partWindow(part, manifest);
      bones.push({
        name: part.slot,
        parent: slotParent,
        x: r6(win.x + win.w / 2),
        y: r6(cropToSpineY(win.y + win.h / 2, cropH)),
      });
      slotBoneOf.set(part.slot, part.slot);
      const control = part.mesh?.control_bone;
      if (control) {
        // The control bone hangs off the slot bone, so its x/y are LOCAL. Placing
        // it on the aperture is what makes the falloff radial about the opening
        // rather than about the middle of the part window.
        const [ax, ay] = part.mesh!.center!;
        bones.push({
          name: control,
          parent: part.slot,
          x: r6(ax - (win.x + win.w / 2)),
          y: r6(cropToSpineY(ay, cropH) - cropToSpineY(win.y + win.h / 2, cropH)),
        });
      }
    }
  }
  const boneNames = new Set(bones.map((b) => b.name));
  let transforms: Map<string, BoneTransform>;
  try {
    transforms = computeWorldTransforms(bones);
  } catch (err) {
    if (err instanceof TransformError) throw new CompileError(err.message);
    throw err;
  }

  // -- 4. slots + skin -------------------------------------------------------
  // Draw order IS the slots array order (plan 04 section 1-1). No separate field.
  const slots: SpineSlot[] = [];
  const skinAttachments: Record<string, Record<string, SpineAttachment>> = {};
  const meshBones = new Set<string>();
  const meshes: CompileResult['meshes'] = [];

  for (const part of parts) {
    const names = slotAttachments.get(part.slot) ?? [];
    if (!names.length) continue;

    const setup = motion.setup?.[part.slot];
    if (setup === undefined) {
      throw new CompileError(
        `motion spec has no setup entry for slot "${part.slot}" — the compiler will not guess a setup pose`,
      );
    }
    const setupAttachment = setup.attachment ?? null;
    if (setupAttachment !== null && !names.includes(setupAttachment)) {
      throw new CompileError(
        `setup attachment "${setupAttachment}" for slot "${part.slot}" is not one of [${names.join(', ')}]`,
      );
    }
    const boneName = slotBoneOf.get(part.slot);
    if (!boneName) throw new CompileError(`internal: slot "${part.slot}" has no bone`);
    const slot: SpineSlot = { name: part.slot, bone: boneName };
    if (setupAttachment !== null) slot.attachment = setupAttachment;
    if (setup.color) slot.color = rgbaHex(setup.color);
    slots.push(slot);

    const perSlot: Record<string, SpineAttachment> = {};
    const mesh = part.mesh ? buildMesh(part, manifest, bones, transforms, boneName) : null;
    for (const name of names) {
      const img = images.find((im) => im.region === name);
      if (!img) throw new CompileError(`internal: no image for attachment ${name}`);
      if (mesh) {
        // Every state of a mesh slot gets the SAME geometry. That is what makes
        // an attachment swap mid-deform safe: the control bone's pose means the
        // same thing under all of them, so lip-sync and aperture do not fight.
        perSlot[name] = { ...mesh.attachment };
        continue;
      }
      perSlot[name] = placeRegion(part, manifest, transforms.get(boneName)!, img);
    }
    if (mesh) {
      const controls = meshControlBones(part);
      meshBones.add(boneName);
      for (const name of controls) meshBones.add(name);
      meshes.push({
        slot: part.slot,
        kind: mesh.kind,
        attachments: names,
        vertices: mesh.attachment.uvs.length / 2,
        triangles: mesh.attachment.triangles.length / 3,
        bones: [boneName, ...controls],
      });
    }
    skinAttachments[part.slot] = perSlot;
  }

  // -- 4b. physics constraints ----------------------------------------------
  // One top-level `constraints` array, `type` per entry. Defaults are omitted
  // ONLY when the declared value equals the parser default, so the file says
  // what it means and stays byte-stable.
  const constraints: NonNullable<SpineSkeletonJson['constraints']> = [];
  const physicsReport: CompileResult['physics'] = [];
  for (const [name, spec] of Object.entries(motion.physics ?? {})) {
    if (!boneNames.has(spec.bone)) {
      throw new CompileError(`physics constraint "${name}" targets unknown bone "${spec.bone}"`);
    }
    const entry: NonNullable<SpineSkeletonJson['constraints']>[number] = {
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

  // -- 5. animations ---------------------------------------------------------
  const animations: SpineSkeletonJson['animations'] = {};
  const declaredDurations: Record<string, number> = {};
  const slotNames = new Set(slots.map((s) => s.name));

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
          if (!motion.physics?.[target]) {
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
          ? compileValueTrack(track, motion, animName, target, shift, PHYSICS_TRACKS, 'physics constraint')
          : isBoneTrack
            ? compileValueTrack(track, motion, animName, target, shift, BONE_TRACKS, 'bone')
            : compileTrack(track, motion, animName, target, shift, skinAttachments);
        for (const key of keys) compiledDuration = Math.max(compiledDuration, key.time as number);
        if (isPhysicsTrack) (physicsTimelines[target] ??= {})[track.property] = keys;
        else if (isBoneTrack) (boneTimelines[target] ??= {})[track.property] = keys;
        else (slotTimelines[target] ??= {})[track.property] = keys;
      });
    }

    // Rule 4: the declared duration is verified, because skeleton JSON does not
    // carry one — the loader takes the max key time (plan 04 section 1-6).
    if (Math.abs(compiledDuration - anim.duration) > FRAME) {
      throw new CompileError(
        `animation "${animName}" declares duration ${anim.duration}s but its last key is at ${compiledDuration}s`,
      );
    }
    animations[animName] = {};
    if (Object.keys(slotTimelines).length) animations[animName].slots = slotTimelines;
    if (Object.keys(boneTimelines).length) animations[animName].bones = boneTimelines;
    if (Object.keys(physicsTimelines).length) animations[animName].physics = physicsTimelines;
  }

  // -- 6. assemble -----------------------------------------------------------
  const skeleton: SpineSkeletonJson = {
    skeleton: {
      spine: SPINE_VERSION,
      x: 0,
      y: 0,
      width: manifest.crop.w,
      height: manifest.crop.h,
    },
    bones,
    slots,
    skins: [{ name: 'default', attachments: skinAttachments }],
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
    rig: buildRigInfo(archetype, bones, meshes, manifest),
  };
}

/**
 * Collect what the artifact cannot say about itself.
 *
 * Nothing in skeleton JSON records that a mesh is a ribbon, that a bone's
 * subtree is authored in axis space, or that one parentage is forbidden. Those
 * are archetype facts, so the compiler hands them to the validator instead of
 * letting it guess — and a mutant stays honest because it edits the artifact
 * while this block keeps saying what the rig was supposed to be.
 */
function buildRigInfo(
  archetype: Archetype,
  bones: SpineBone[],
  meshes: CompileResult['meshes'],
  manifest: FaceManifest,
): RigInfo {
  const axisBone = archetype.axisBone ?? null;
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
  const meshKinds: Record<string, 'ring' | 'ribbon'> = {};
  for (const mesh of meshes) meshKinds[mesh.slot] = mesh.kind;
  // Inward, in Spine world. Off-axis keys (the mass hangs off `cam`, not `axis`)
  // have to be projected onto it before they can be compared with a stroke.
  const spineDeg = manifest.axis ? screenToSpineDegrees(manifest.axis.deg) : null;
  const inwardUnit: [number, number] | null =
    spineDeg === null ? null : [r6(Math.cos((spineDeg * Math.PI) / 180)), r6(Math.sin((spineDeg * Math.PI) / 180))];
  const contactDepth = manifest.stroke?.contact_depth ?? null;
  if (contactDepth !== null && !(contactDepth > 0)) {
    throw new CompileError(`manifest stroke.contact_depth is ${contactDepth}; it must be a positive number of axis pixels`);
  }
  const capCeiling = manifest.stroke?.cap_containment_ceiling ?? null;
  if (capCeiling !== null && !(capCeiling > 0)) {
    throw new CompileError(
      `manifest stroke.cap_containment_ceiling is ${capCeiling}; it must be a positive number of axis pixels (use null for "not measurable on this cut")`,
    );
  }
  return {
    archetype: archetype.name,
    axisBone,
    axisSubtree,
    detached: (archetype.detached ?? []).map((d) => [d.bone, d.notUnder] as [string, string]),
    slotOrder: archetype.slotOrder ?? null,
    meshKinds,
    contactDepth,
    capContainmentCeiling: capCeiling,
    massBone: archetype.massBone ?? null,
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
 * rather than on the bone, because several slots share one bone in the joint
 * archetype (`piston` + `piston_blur`, `lip` + `fluid_pool`) and their windows
 * are in different places. And the attachment's own `rotation` cancels the bone's
 * world rotation, because a plate is authored in screen space: without it every
 * slot hanging off `axis` would render tilted by the cut's axis angle.
 *
 * On an unrotated bone sitting at its window centre both terms are zero and the
 * fields are omitted, which is why the overlay archetype's output is unchanged.
 */
function placeRegion(
  part: FaceManifestPart,
  manifest: FaceManifest,
  bone: BoneTransform,
  img: CompiledImage,
): SpineRegionAttachment {
  const win = partWindow(part, manifest);
  // width/height are NOT optional: omitting them loads as NaN with no error
  // (plan 04 section 2-3 case 6c). The compiler fills them from the PNG.
  const att: SpineRegionAttachment = { width: img.width, height: img.height };
  const [ax, ay] = toBoneLocal(bone, win.x + win.w / 2, cropToSpineY(win.y + win.h / 2, manifest.crop.h));
  if (ax !== 0) att.x = ax;
  if (ay !== 0) att.y = ay;
  const rotation = normaliseDegrees(-bone.worldRotation);
  if (rotation !== 0) att.rotation = rotation;
  return att;
}

/**
 * Build one mesh for a part and encode its weighted vertices.
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
      // from where the archetype actually put them. The alternative — a per-bone
      // angle in the manifest — would let the declared angle drift away from the
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
    const time = r6(key.t + shift);
    if (i > 0 && time <= (out[i - 1].time as number)) {
      throw new CompileError(`${where}: key times must strictly increase (at t=${key.t})`);
    }
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
    if (key.ease && next) {
      if (key.ease === 'stepped') {
        entry.curve = 'stepped';
      } else {
        const handles = motion.easings[key.ease];
        if (!handles) throw new CompileError(`${where}: unknown easing "${key.ease}"`);
        if (!Array.isArray(next.v)) throw new CompileError(`${where}: next key value must be an array`);
        const t2 = r6(next.t + shift);
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
  target: string,
  shift: number,
  skinAttachments: Record<string, Record<string, SpineRegionAttachment>>,
): SpineTimelineKey[] {
  const where = `animation "${animName}" slot "${target}" ${track.property}`;
  if (!track.keys.length) throw new CompileError(`${where}: no keys`);

  const out: SpineTimelineKey[] = [];
  for (let i = 0; i < track.keys.length; i++) {
    const key = track.keys[i];
    const next = track.keys[i + 1];
    const time = r6(key.t + shift);
    if (i > 0 && time <= (out[i - 1].time as number)) {
      throw new CompileError(`${where}: key times must strictly increase (at t=${key.t})`);
    }

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
    if (key.ease && next) {
      if (key.ease === 'stepped') {
        entry.curve = 'stepped';
      } else {
        const handles = motion.easings[key.ease];
        if (!handles) throw new CompileError(`${where}: unknown easing "${key.ease}"`);
        if (!Array.isArray(next.v)) {
          throw new CompileError(`${where}: rgba key value must be [r,g,b,a]`);
        }
        const t2 = r6(next.t + shift);
        // 4 numbers per channel, r g b a — 16 in total. Short arrays become NaN
        // curves with no error (plan 04 section 2-3 case 6g).
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
