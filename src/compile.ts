/**
 * rigc compile — rig spec + motion spec (+ an optional cut manifest) -> Spine 4.3
 * skeleton JSON and a one-part-per-page atlas. Pure data assembly: no spine-core
 * here (that is the validator's job, plan 04 section 4-1), no clock, no
 * randomness.
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
import {
  parseRigSpec,
  type RigAttachment,
  type RigBone,
  type RigMeshAttachment,
  type RigRegionAttachment,
  type RigSpec,
} from './rig.ts';
import { buildRibbonMesh, buildRingMesh, encodeWeightedVertices, MeshError, type MeshBoneRef } from './mesh.ts';
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
  MotionSpec,
  MotionTrack,
  RigInfo,
  SpineAttachment,
  SpineBone,
  SpineConstraint,
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

export function compile(opts: CompileOptions): CompileResult {
  const rigPath = resolve(opts.rigPath);
  const motionPath = resolve(opts.motionPath);
  const outDir = resolve(opts.outDir);
  const manifestPath = opts.manifestPath === undefined ? null : resolve(opts.manifestPath);
  const manifestDir = manifestPath === null ? null : dirname(manifestPath);

  const rig = parseRigSpec(readJson<unknown>(rigPath), rigPath);
  const motion = readJson<MotionSpec>(motionPath);
  const manifest = manifestPath === null ? null : readJson<FaceManifest>(manifestPath);

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
  // Region name = attachment name = PNG basename (plan 04 section 4-3 step 2).
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
  // four of this formation's seven slots optional, and the real tier-2 cut
  // delivers three plates: `03_fluid_overflow` is a scene-shared sprite sheet
  // (plan 01 section 3.5) and the manifest records it as `image: null` with no
  // window at all. That entry is a documented ABSENCE, not a part — and it used
  // to crash the compiler on its missing `offset` rather than being tolerated, so
  // "the optional slots are optional" needed this line to actually be true.
  const absentParts: CompileResult['absentParts'] = [];
  const declaredParts = (manifest?.parts ?? []).filter((part) => {
    if (part.image === null && !part.states) {
      absentParts.push({ slot: rigSlotOf(part), why: 'manifest declares `image: null` and no states' });
      return false;
    }
    return true;
  });
  // ⚠️ `rig_slot` is the join key, not `slot`. A cut manifest that is also a parts
  // lane record carries anatomical slot names of its own (`part`, `occluder`) and
  // scripts select on them; the rig's slot table is what the runtime, the probes
  // and the viewer join on. So the mapping is manifest data, and the rig's table
  // stays single-valued — one name per slot, which is the only way A26 and a
  // `hide: ['lip']` probe can mean the same thing on every cut.
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
        // plan 05 section 5-3 rung 2 dropped the `half` state. The manifest still
        // lists it, so the compiler reports it rather than pretending either way.
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
  // Draw order IS the slots array order (plan 04 section 1-1). No separate field,
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
          // same thing under all of them, so lip-sync and aperture do not fight.
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
        });
      }
      tableFor(skinName)[rigSlot.name] = perSlot;
    }
  }
  if (meshes.length > meshBudget) {
    throw new CompileError(`${meshes.length} mesh slot(s) emitted but the rig "${rig.name}" allows ${meshBudget}`);
  }

  // -- 4b. constraints -------------------------------------------------------
  // One top-level `constraints` array, `type` per entry. Rig-declared first
  // (structure), then the motion spec's physics table (tuning). A name in both is
  // refused: `mix` timelines resolve by name, and two constraints answering to
  // one name is a timeline driving something nobody chose.
  const constraints: SpineConstraint[] = [];
  const physicsReport: CompileResult['physics'] = [];
  const constraintNames = new Set<string>();
  for (const spec of rig.constraints ?? []) {
    constraints.push(buildRigConstraint(spec as RigConstraintInput, boneNames));
    constraintNames.add(spec.name);
  }
  for (const [name, spec] of Object.entries(motion.physics ?? {})) {
    if (constraintNames.has(name)) {
      throw new CompileError(`constraint "${name}" is declared in both the rig spec and the motion spec's physics table`);
    }
    constraintNames.add(name);
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
          ? compileValueTrack(track, motion, animName, target, shift, PHYSICS_TRACKS, 'physics constraint')
          : isBoneTrack
            ? compileValueTrack(track, motion, animName, target, shift, BONE_TRACKS, 'bone')
            : compileTrack(track, motion, animName, target, shift, tableFor('default'));
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

  const skeleton: SpineSkeletonJson = {
    skeleton: header,
    bones,
    slots,
    skins: [...skinTables.entries()].map(([name, attachments]) => ({ name, attachments })),
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
  throw new NotImplementedError(
    `${where}: attachment type "${String(type)}" is in the Spine 4.3 format and rigc does not emit it yet. ` +
      'Implemented: region, mesh. docs/SPEC_COVERAGE.md part 1-6 lists what the type would have to carry.',
  );
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
    // no error at all (plan 04 section 2-3 case 6c). So it is this or nothing.
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

function buildRigMesh(att: RigMeshAttachment, where: string, ctx: AttachmentContext): SpineMeshAttachment {
  const authored = att.uvs !== undefined || att.triangles !== undefined || att.vertices !== undefined;
  if (authored && att.generator) {
    throw new CompileError(`${where}: a mesh is either authored geometry or a generator, never both`);
  }
  if (att.generator) return buildGeneratedMesh(att, att.generator, where, ctx);
  if (!att.uvs || !att.triangles || !att.vertices) {
    throw new CompileError(`${where}: an authored mesh needs uvs, triangles and vertices (or a "generator")`);
  }
  const out: SpineMeshAttachment = {
    type: 'mesh',
    uvs: att.uvs.map(r6),
    triangles: att.triangles,
    vertices: att.vertices.map(r6),
    hull: att.hull ?? 0,
    width: r6(att.width ?? 0),
    height: r6(att.height ?? 0),
  };
  if (att.path !== undefined) out.path = att.path;
  if (att.edges !== undefined) out.edges = att.edges;
  if (att.color !== undefined) out.color = att.color;
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
  const meshKinds: Record<string, 'ring' | 'ribbon'> = {};
  for (const mesh of meshes) meshKinds[mesh.slot] = mesh.kind;
  // Inward, in Spine world. Off-axis keys (the mass hangs off `cam`, not `axis`)
  // have to be projected onto it before they can be compared with a stroke.
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
 * rather than on the bone, because several slots share one bone in the joint
 * formation (`piston` + `piston_blur`, `lip` + `fluid_pool`) and their windows
 * are in different places. And the attachment's own `rotation` cancels the bone's
 * world rotation, because a plate is authored in screen space: without it every
 * slot hanging off `axis` would render tilted by the cut's axis angle.
 *
 * On an unrotated bone sitting at its window centre both terms are zero and the
 * fields are omitted, which is why the overlay formation's output is unchanged.
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
 * ⭐ Named easings stay the recommended path (plan 04 rule 2): a handle set with
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
 * produce a different curve (plan 04 section 1-6 item 3), which is exactly the
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
  skinAttachments: Record<string, Record<string, SpineAttachment>>,
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
