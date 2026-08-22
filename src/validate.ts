/**
 * rigc validate — the other half of the tool (plan 04 section 4-4).
 *
 * The parser is forgiving, and that is the danger: plan 04 section 2-3 measured
 * six ways to write a wrong skeleton that loads with no error at all. So this
 * stage has two layers:
 *
 *   A. Round-trip through the REAL spine-core. If TextureAtlas or SkeletonJson
 *      throws, the artifact is dead on arrival (cases 6d, 6e).
 *   B. Assertions we make ourselves, because the parser will not. Every silent
 *      failure in plan 04 section 2-3 becomes one named machine check here.
 *
 * A failure is a named assertion, and a named assertion is a nonzero exit.
 */
import { existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import {
  AnimationState,
  AnimationStateData,
  AtlasAttachmentLoader,
  ClippingAttachment,
  MeshAttachment,
  Physics,
  PhysicsConstraintData,
  RegionAttachment,
  Skeleton,
  SkeletonJson,
  TextureAtlas,
} from '@esotericsoftware/spine-core';
import { readPngInfo } from './png.ts';
import type { RigInfo } from './types.ts';

export interface Failure {
  assertion: string;
  detail: string;
}

/**
 * Which body of rules to hold the artifact to.
 *
 * ⭐ The distinction this draws is the difference between "wrong" and "not how we
 * do it here", and conflating the two is how a validator stops being usable on
 * anybody else's data. Nine of the 31 assertions are policy for one renderer
 * (`spine-html`) or for one project's canvas budget, and every one of them fires
 * on real, correct, editor-produced Spine data — the official example projects
 * carry clipping attachments, unweighted meshes, 116-triangle meshes and packed
 * atlases, all of which are perfectly valid and none of which spine-html likes.
 *
 * - `spine`      — is this valid Spine 4.3 that any runtime will play correctly?
 * - `spine-html` — the above, plus this project's renderer and archetype policy.
 *
 * ⚠️ `spine-html` is the DEFAULT and must stay the default: it is the behaviour
 * every existing caller already has, and a switch that silently loosens a gate
 * for callers who did not ask is worse than no switch at all.
 */
export type ValidateProfile = 'spine' | 'spine-html';

export const VALIDATE_PROFILES: readonly ValidateProfile[] = ['spine', 'spine-html'];

export const DEFAULT_PROFILE: ValidateProfile = 'spine-html';

/**
 * What kind of rule each assertion is. Every assertion has an entry, and
 * `check()` throws on a name that has none — a new assertion must state its kind
 * rather than defaulting into one, because the default would decide, silently,
 * whether it runs on foreign data.
 *
 *   validity  — the file is wrong for any consumer. Runs under every profile.
 *   renderer  — valid Spine that this project's renderer or frame budget refuses.
 *   archetype — a structural rule about rigc's own formations, meaningless to a
 *               skeleton rigc did not compile.
 *
 * Three assertions are MIXED and are marked `validity` here because their
 * validity half must never stop running; their policy clauses are gated inside
 * the assertion body against `profile`, and each such clause says so where it
 * lives. They are A06 (size-vs-PNG is validity; pma / rotation / full-page
 * coverage are policy), A08 (the attachment→region join is validity; requiring
 * the two names to be identical is policy) and A20 (weight coherence is
 * validity; requiring a mesh to be weighted at all is policy).
 */
const ASSERTION_KIND: Record<string, 'validity' | 'renderer' | 'archetype'> = {
  A00_ROUNDTRIP_PARSE: 'validity',
  A01_NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS: 'validity',
  A02_NO_BONE_TRANSFORM_KEY: 'validity',
  A03_REGION_WIDTH_HEIGHT_FINITE: 'validity',
  A04_MESH_TRIANGLES_AND_ENCODING: 'validity',
  A05_CURVE_ARRAY_LENGTH: 'validity',
  A06_ATLAS_PAGE_SIZE_MATCHES_PNG: 'validity', // mixed — see above
  A07_ATLAS_TEXT_SHAPE: 'validity',
  A08_REGION_NAMES_MATCH_ATTACHMENTS: 'validity', // mixed — see above
  A09_ANIMATION_DURATION_MATCHES_SPEC: 'validity',
  A10_NO_NAN_AFTER_STEPPING: 'validity',
  A11_NO_CLIPPING_ATTACHMENTS: 'renderer',
  A12_NO_DARK_COLOR: 'renderer',
  A13_MESH_BUDGET: 'renderer',
  A14_NO_FULL_FRAME_MESH: 'renderer',
  A15_IDLE_NO_MESH_BONE_KEYS: 'renderer',
  A16_SKELETON_VERSION_4_3: 'validity',
  A17_ATLAS_PAGE_FILES_EXIST: 'validity',
  A18_DETERMINISTIC_EMIT: 'validity',
  A19_OVERLAY_PNGS_HAVE_ALPHA: 'renderer',
  A20_MESH_WEIGHTS_COHERENT: 'validity', // mixed — see above
  A21_MESH_RIM_PINNED: 'archetype',
  A22_MESH_UVS_IN_UNIT_RANGE: 'validity',
  A23_PHYSICS_CONSTRAINT_EFFECTIVE: 'validity',
  A24_AXIS_SPACE_STROKE: 'archetype',
  A25_DETACHED_BONE_PARENTAGE: 'archetype',
  A26_SLOT_DRAW_ORDER: 'archetype',
  A27_REGION_NAME_MATCHES_PAGE_FILENAME: 'renderer',
  A28_RIBBON_ROWS_SHARE_WEIGHTS: 'archetype',
  A29_STROKE_WITHIN_CONTACT_DEPTH: 'archetype',
  A30_STROKE_WITHIN_CAP_CONTAINMENT: 'archetype',
};

export interface ValidateInput {
  skeletonText: string;
  atlasText: string;
  /** Directory the atlas lives in; page names resolve against it. */
  atlasDir: string;
  /** Declared durations from the motion spec (plan 04 section 4-2 rule 4). */
  declaredDurations?: Record<string, number>;
  /** Re-emitted artifacts, for the determinism check. */
  reEmit?: { skeletonText: string; atlasText: string };
  /**
   * Structural expectations the artifact cannot state about itself: which mesh is
   * a ribbon, which bone carries the axis, which parentage is forbidden, what the
   * canonical draw order is. Absent when `validate <dir>` is pointed at a bare
   * directory, and the assertions that need it then SKIP rather than guess — the
   * stats line says `rig=absent` so a green run cannot be mistaken for a full one.
   */
  rig?: RigInfo;
  /** Which body of rules to apply. Defaults to `spine-html`; see ValidateProfile. */
  profile?: ValidateProfile;
}

export interface ValidateReport {
  failures: Failure[];
  /** Assertions that ran and passed, in order. */
  passed: string[];
  /**
   * Assertions that had no data to run against, with the reason.
   *
   * ⚠️ Not cosmetic. An assertion whose subject is a per-cut MEASUREMENT (a
   * contact depth, a containment ceiling) is vacuous on a cut that never measured
   * one, and reporting that as PASS is this project's favourite false green: a
   * gate that says it checked something it never looked at. So the report says
   * SKIP and why, and `passed` does not count it.
   */
  skipped: Array<{ assertion: string; reason: string }>;
  /** Which body of rules ran. */
  profile: ValidateProfile;
  /**
   * Assertions this profile does not apply, with their kind.
   *
   * Kept separate from `skipped` on purpose: a SKIP means "there was nothing to
   * look at", a profile skip means "this rule was deliberately out of scope".
   * Reading a `--profile spine` green as though the renderer policy had passed
   * is exactly the misreading the two lists exist to prevent.
   */
  profileSkipped: Array<{ assertion: string; kind: 'renderer' | 'archetype' }>;
  stats: Record<string, number | string>;
}

const FRAME = 1 / 60;
const STEP_FRAMES = 120;

/**
 * `4.3`, `4.3.<patch>`, or `4.3.<patch>-<suffix>` — the last of which is what the
 * Spine editor writes for a pre-release (`"4.3.75-beta"` in all twelve official
 * example exports). The major/minor pair is the load-bearing part; see A16.
 */
const SPINE_4_3_VERSION = /^4\.3(\.\d+(-[0-9A-Za-z][0-9A-Za-z.+-]*)?)?$/;

/**
 * How many value channels each timeline carries. A curve array holds exactly
 * four numbers PER channel (plan 04 section 1-6 item 2); anything shorter
 * multiplies `undefined` into the cubic and produces a NaN curve with no error
 * (case 6g). `null` means "this timeline takes no curve at all".
 */
const BONE_CHANNELS: Record<string, number | null> = {
  rotate: 1,
  translate: 2,
  translatex: 1,
  translatey: 1,
  scale: 2,
  scalex: 1,
  scaley: 1,
  shear: 2,
  shearx: 1,
  sheary: 1,
  inherit: null,
};
const SLOT_CHANNELS: Record<string, number | null> = {
  attachment: null,
  rgba: 4,
  rgb: 3,
  alpha: 1,
  rgba2: 7,
  rgb2: 6,
};
const ATTACHMENT_CHANNELS: Record<string, number | null> = {
  deform: 1,
  sequence: null,
};
const PHYSICS_CHANNELS: Record<string, number | null> = {
  inertia: 1,
  strength: 1,
  damping: 1,
  mass: 1,
  wind: 1,
  gravity: 1,
  mix: 1,
  reset: null,
};

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function validate(input: ValidateInput): ValidateReport {
  const failures: Failure[] = [];
  const passed: string[] = [];
  const skipped: ValidateReport['skipped'] = [];
  const profileSkipped: ValidateReport['profileSkipped'] = [];
  const stats: Record<string, number | string> = {};
  const profile = input.profile ?? DEFAULT_PROFILE;
  /** True when this profile's rulebook includes the policy layer. */
  const policy = profile === 'spine-html';

  const fail = (assertion: string, detail: string) => failures.push({ assertion, detail });
  /** Declare that an assertion had nothing to check, and why. */
  const skip = (assertion: string, reason: string) => skipped.push({ assertion, reason });
  /**
   * Run one assertion; record it as passed only if it neither failed nor skipped,
   * and do not run it at all when the profile does not carry that kind of rule.
   *
   * The unknown-assertion throw is deliberate: an assertion with no entry in
   * ASSERTION_KIND would otherwise pick a profile by accident, and picking wrong
   * means either a rule that never runs or a rule that fires on everybody's data.
   */
  const check = (assertion: string, body: () => void) => {
    const kind = ASSERTION_KIND[assertion];
    if (!kind) throw new Error(`validate: assertion "${assertion}" has no ASSERTION_KIND entry`);
    if (kind !== 'validity' && !policy) {
      profileSkipped.push({ assertion, kind });
      return;
    }
    const before = failures.length;
    const skippedBefore = skipped.length;
    try {
      body();
    } catch (err) {
      fail(assertion, `threw: ${(err as Error).message}`);
    }
    if (failures.length === before && skipped.length === skippedBefore) passed.push(assertion);
  };

  // -------------------------------------------------------------------------
  // Raw text / raw JSON assertions (they must run even if the parser is happy)
  // -------------------------------------------------------------------------

  let raw: Json | null = null;
  try {
    raw = JSON.parse(input.skeletonText) as Json;
  } catch (err) {
    fail('A00_ROUNDTRIP_PARSE', `skeleton JSON is not parseable: ${(err as Error).message}`);
  }

  // --- A07: atlas text shape ------------------------------------------------
  // Two traps, both measured in plan 04 section 2-3: a region name is the RAW
  // line (only the page name is trimmed), and a blank line closes the page
  // block, so a blank line between a page header and its regions turns the
  // regions into pages.
  const atlasLines = input.atlasText.replace(/\n$/, '').split('\n');
  check('A07_ATLAS_TEXT_SHAPE', () => {
    let expectPage = true;
    let sawRegionForPage = false;
    for (let i = 0; i < atlasLines.length; i++) {
      const line = atlasLines[i];
      if (line.trim().length === 0) {
        if (expectPage) fail('A07_ATLAS_TEXT_SHAPE', `line ${i + 1}: consecutive blank lines`);
        else if (!sawRegionForPage) {
          fail('A07_ATLAS_TEXT_SHAPE', `line ${i + 1}: blank line before this page had any region`);
        }
        expectPage = true;
        sawRegionForPage = false;
        continue;
      }
      if (expectPage) {
        expectPage = false;
        continue; // page name line
      }
      if (line.includes(':')) continue; // key: value line
      // A bare non-key line is a region name, and it is used untrimmed.
      if (line !== line.trim()) {
        fail('A07_ATLAS_TEXT_SHAPE', `line ${i + 1}: region name has stray whitespace: ${JSON.stringify(line)}`);
      }
      sawRegionForPage = true;
    }
    if (!sawRegionForPage && atlasLines.length) {
      fail('A07_ATLAS_TEXT_SHAPE', 'the last page block declares no region');
    }
  });

  // --- A: the round trip ----------------------------------------------------
  let atlas: TextureAtlas | null = null;
  let skeletonData: ReturnType<SkeletonJson['readSkeletonData']> | null = null;
  check('A00_ROUNDTRIP_PARSE', () => {
    atlas = new TextureAtlas(input.atlasText);
    const json = new SkeletonJson(new AtlasAttachmentLoader(atlas));
    skeletonData = json.readSkeletonData(JSON.parse(input.skeletonText));
  });

  if (atlas) {
    stats.pages = atlas.pages.length;
    stats.regions = atlas.regions.length;
  }
  if (skeletonData) {
    stats.bones = skeletonData.bones.length;
    stats.slots = skeletonData.slots.length;
    stats.animations = skeletonData.animations.length;
    stats.version = skeletonData.version ?? '(none)';
  }

  // --- A16: version label ---------------------------------------------------
  //
  // The label must be on the 4.3 line, and the line includes its pre-releases:
  // every one of the nine official example exports declares "4.3.75-beta", which
  // the original `/^4\.3(\.\d+)?$/` rejected. That made the first file of the
  // benchmark ladder fail on a cosmetic string. What the assertion is actually
  // for is the MAJOR.MINOR pair — a 4.2 or 5.x label is portable-fragile because
  // some runtimes refuse a version mismatch outright (spine-runtimes CHANGELOG
  // line 1678), while spine-ts stores the string and never compares it. So the
  // patch component and any pre-release suffix after it are free, and 4.2/5.x
  // stay rejected.
  check('A16_SKELETON_VERSION_4_3', () => {
    const declared = isObj(raw?.skeleton) ? (raw.skeleton as Json).spine : undefined;
    if (typeof declared !== 'string' || !SPINE_4_3_VERSION.test(declared)) {
      fail(
        'A16_SKELETON_VERSION_4_3',
        `skeleton.spine is ${JSON.stringify(declared)}, expected 4.3, 4.3.<patch> or 4.3.<patch>-<suffix>`,
      );
    }
  });

  // --- A01: no legacy top-level constraint arrays ---------------------------
  // 4.3 folds every constraint into one `constraints` array with a `type`.
  // A 4.1/4.2-shaped `physics` array loads clean and the constraint just
  // vanishes (plan 04 section 2-3 case 6a).
  check('A01_NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS', () => {
    for (const key of ['ik', 'transform', 'path', 'physics', 'slider']) {
      if (raw && key in raw) {
        fail(
          'A01_NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS',
          `top-level "${key}" array present; 4.3 wants it inside "constraints" with type:"${key}"`,
        );
      }
    }
  });

  // --- A02: no bone.transform key ------------------------------------------
  // 4.3 renamed it to `inherit`; the old key loads and silently falls back to
  // Normal inheritance (case 6b).
  check('A02_NO_BONE_TRANSFORM_KEY', () => {
    const bones = Array.isArray(raw?.bones) ? (raw.bones as unknown[]) : [];
    for (const bone of bones) {
      if (isObj(bone) && 'transform' in bone) {
        fail('A02_NO_BONE_TRANSFORM_KEY', `bone "${String(bone.name)}" uses 4.2's "transform"; 4.3 wants "inherit"`);
      }
    }
  });

  // --- A12: no dark / two-colour tint --------------------------------------
  // Parsed, then silently ignored by spine-html (plan 02 section 7).
  check('A12_NO_DARK_COLOR', () => {
    const slots = Array.isArray(raw?.slots) ? (raw.slots as unknown[]) : [];
    for (const slot of slots) {
      if (isObj(slot) && 'dark' in slot) {
        fail('A12_NO_DARK_COLOR', `slot "${String(slot.name)}" declares a dark colour; the renderer ignores it`);
      }
    }
    walkTimelines(raw, (path, kind, name) => {
      if (kind === 'slot' && (name === 'rgba2' || name === 'rgb2')) {
        fail('A12_NO_DARK_COLOR', `${path}: two-colour timeline "${name}" is silently ignored by the renderer`);
      }
    });
  });

  // --- A05: curve arrays are 4 numbers per value channel --------------------
  check('A05_CURVE_ARRAY_LENGTH', () => {
    walkTimelines(raw, (path, kind, name, keys) => {
      const table =
        kind === 'bone'
          ? BONE_CHANNELS
          : kind === 'slot'
            ? SLOT_CHANNELS
            : kind === 'attachment'
              ? ATTACHMENT_CHANNELS
              : PHYSICS_CHANNELS;
      if (!(name in table)) {
        fail('A05_CURVE_ARRAY_LENGTH', `${path}: unchecked ${kind} timeline "${name}" — extend the validator`);
        return;
      }
      const channels = table[name];
      for (const key of keys) {
        if (!isObj(key) || !('curve' in key)) continue;
        const curve = key.curve;
        if (channels === null) {
          fail('A05_CURVE_ARRAY_LENGTH', `${path}: timeline "${name}" cannot carry a curve`);
          continue;
        }
        if (curve === 'stepped') continue;
        if (!Array.isArray(curve)) {
          fail('A05_CURVE_ARRAY_LENGTH', `${path}: curve is ${JSON.stringify(curve)}, expected "stepped" or an array`);
          continue;
        }
        if (curve.length !== channels * 4) {
          fail(
            'A05_CURVE_ARRAY_LENGTH',
            `${path} (t=${String(key.time ?? 0)}): curve has ${curve.length} numbers, "${name}" needs ${channels} channels x 4 = ${channels * 4}`,
          );
        }
        for (const n of curve) {
          if (typeof n !== 'number' || !Number.isFinite(n)) {
            fail('A05_CURVE_ARRAY_LENGTH', `${path}: curve holds a non-finite value ${JSON.stringify(n)}`);
          }
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // Loaded-data assertions
  // -------------------------------------------------------------------------

  const regionAttachments: RegionAttachment[] = [];
  const meshAttachments: MeshAttachment[] = [];
  let clippingCount = 0;
  const meshSlots = new Set<number>();

  if (skeletonData) {
    const data = skeletonData as NonNullable<typeof skeletonData>;
    for (const skin of data.skins) {
      for (const entry of skin.getAttachments()) {
        const att = entry.attachment;
        if (att instanceof RegionAttachment) regionAttachments.push(att);
        else if (att instanceof MeshAttachment) {
          meshAttachments.push(att);
          meshSlots.add(entry.slotIndex);
        } else if (att instanceof ClippingAttachment) clippingCount++;
      }
    }
    stats.regionAttachments = regionAttachments.length;
    stats.meshAttachments = meshAttachments.length;

    // --- A03: every region has finite width/height (case 6c) ---------------
    check('A03_REGION_WIDTH_HEIGHT_FINITE', () => {
      for (const att of regionAttachments) {
        if (!Number.isFinite(att.width) || !Number.isFinite(att.height)) {
          fail('A03_REGION_WIDTH_HEIGHT_FINITE', `region "${att.name}" loaded w=${att.width} h=${att.height}`);
        }
        if (att.width <= 0 || att.height <= 0) {
          fail('A03_REGION_WIDTH_HEIGHT_FINITE', `region "${att.name}" has a non-positive size`);
        }
      }
    });

    // --- A04: mesh triangles + encoding coherence (case 6f) ----------------
    check('A04_MESH_TRIANGLES_AND_ENCODING', () => {
      for (const mesh of meshAttachments) {
        if (!mesh.triangles || mesh.triangles.length === 0) {
          fail('A04_MESH_TRIANGLES_AND_ENCODING', `mesh "${mesh.name}" has no triangles`);
          continue;
        }
        if (mesh.triangles.length % 3 !== 0) {
          fail('A04_MESH_TRIANGLES_AND_ENCODING', `mesh "${mesh.name}" triangle count is not a multiple of 3`);
        }
        const vertexCount = mesh.worldVerticesLength / 2;
        for (const idx of mesh.triangles) {
          if (idx < 0 || idx >= vertexCount) {
            fail('A04_MESH_TRIANGLES_AND_ENCODING', `mesh "${mesh.name}" index ${idx} is outside 0..${vertexCount - 1}`);
            break;
          }
        }
        // Weighted vs unweighted is decided by a length comparison alone — a
        // coincidental match reads weight data as coordinates (plan 04 s1-3).
        const weighted = !!mesh.bones;
        if (weighted && mesh.vertices.length % 3 !== 0) {
          fail('A04_MESH_TRIANGLES_AND_ENCODING', `mesh "${mesh.name}" weighted vertex run is not a multiple of 3`);
        }
        if (!weighted && mesh.vertices.length !== mesh.worldVerticesLength) {
          fail('A04_MESH_TRIANGLES_AND_ENCODING', `mesh "${mesh.name}" unweighted vertices disagree with uvs`);
        }
      }
    });

    // --- A11 / A13 / A14: renderer + canvas budgets (plan 02 section 7) ----
    check('A11_NO_CLIPPING_ATTACHMENTS', () => {
      if (clippingCount > 0) {
        fail('A11_NO_CLIPPING_ATTACHMENTS', `${clippingCount} clipping attachment(s); the renderer skips them silently`);
      }
    });
    check('A13_MESH_BUDGET', () => {
      if (meshSlots.size > 4) fail('A13_MESH_BUDGET', `${meshSlots.size} mesh slots, budget is 4`);
      for (const mesh of meshAttachments) {
        const tris = (mesh.triangles?.length ?? 0) / 3;
        if (tris > 80) fail('A13_MESH_BUDGET', `mesh "${mesh.name}" has ${tris} triangles, budget is 80`);
      }
    });
    check('A14_NO_FULL_FRAME_MESH', () => {
      const stageW = data.width || 0;
      const stageH = data.height || 0;
      for (const mesh of meshAttachments) {
        if (stageW && stageH && mesh.width >= stageW && mesh.height >= stageH) {
          fail('A14_NO_FULL_FRAME_MESH', `mesh "${mesh.name}" spans the whole ${stageW}x${stageH} stage`);
        }
      }
    });

    // --- A15: idle must not key a mesh-driving bone (dirty-skip lever) -----
    check('A15_IDLE_NO_MESH_BONE_KEYS', () => {
      const meshBoneNames = new Set<string>();
      for (const slotIndex of meshSlots) meshBoneNames.add(data.slots[slotIndex].boneData.name);
      // The slot's own bone is not the whole story once weights exist: a ring
      // mesh is driven by its CONTROL bone, which is a different bone entirely.
      // Checking only the slot bone would let `idle` key the one bone that
      // actually dirties the canvas every frame.
      for (const mesh of meshAttachments) {
        if (!mesh.bones) continue;
        for (let i = 0; i < mesh.bones.length; ) {
          const boneCount = mesh.bones[i++];
          for (let n = 0; n < boneCount; n++, i++) {
            const bone = data.bones[mesh.bones[i]];
            if (bone) meshBoneNames.add(bone.name);
          }
        }
      }
      const idle = isObj(raw?.animations) ? (raw.animations as Json).idle : undefined;
      if (!isObj(idle) || !isObj(idle.bones)) return;
      for (const boneName of Object.keys(idle.bones as Json)) {
        if (meshBoneNames.has(boneName)) {
          fail('A15_IDLE_NO_MESH_BONE_KEYS', `idle keys bone "${boneName}", which drives a mesh — meshes never idle-skip`);
        }
      }
    });

    // --- A20/A21/A22: the mesh checks the parser will never make ------------
    //
    // A mesh is the one attachment type where every mistake is silent. Bad
    // weights do not throw, they skew; a uv outside the region samples the
    // wrong pixels; and an unpinned rim moves the seam, which is the single
    // thing the whole generated-parts approach depends on not happening.
    const meshWeights = meshWeightsOf;

    check('A20_MESH_WEIGHTS_COHERENT', () => {
      for (const mesh of meshAttachments) {
        if (!mesh.bones) {
          // 📐 PROFILE. An unweighted mesh is perfectly valid Spine — spineboy
          // ships two — and the runtime poses it from the slot bone. What is
          // NOT valid, in any profile, is a weighted mesh whose weights do not
          // cohere, which is everything below this branch. So the requirement
          // that a mesh be weighted at all is the policy half, and it is the
          // only half gated here.
          if (policy) {
            fail('A20_MESH_WEIGHTS_COHERENT', `mesh "${mesh.name}" is unweighted; the ring tier drives meshes by bones`);
          }
          continue;
        }
        const perVertex = meshWeights(mesh);
        const expected = mesh.worldVerticesLength / 2;
        if (perVertex.length !== expected) {
          fail(
            'A20_MESH_WEIGHTS_COHERENT',
            `mesh "${mesh.name}" has weights for ${perVertex.length} vertices but ${expected} uv pairs`,
          );
          continue;
        }
        perVertex.forEach((vertex, i) => {
          if (!vertex.length) fail('A20_MESH_WEIGHTS_COHERENT', `mesh "${mesh.name}" vertex ${i} has no bones`);
          let sum = 0;
          for (const { bone, weight } of vertex) {
            if (!Number.isFinite(weight) || weight <= 0) {
              fail('A20_MESH_WEIGHTS_COHERENT', `mesh "${mesh.name}" vertex ${i} has weight ${weight}`);
            }
            if (!(bone >= 0 && bone < data.bones.length)) {
              fail('A20_MESH_WEIGHTS_COHERENT', `mesh "${mesh.name}" vertex ${i} references bone index ${bone}`);
            }
            sum += weight;
          }
          if (Math.abs(sum - 1) > 1e-3) {
            fail('A20_MESH_WEIGHTS_COHERENT', `mesh "${mesh.name}" vertex ${i} weights sum to ${sum.toFixed(4)}`);
          }
        });
      }
    });

    /** The slot a skin attachment belongs to; several assertions need it. */
    const slotOfAttachment = (target: MeshAttachment): string | null => {
      for (const skin of data.skins) {
        for (const entry of skin.getAttachments()) {
          if (entry.attachment === target) return data.slots[entry.slotIndex].name;
        }
      }
      return null;
    };
    /** ring unless the rig says ribbon; absent rig info reads as ring (legacy). */
    const kindOf = (target: MeshAttachment): 'ring' | 'ribbon' => {
      const slot = slotOfAttachment(target);
      return (slot && input.rig?.meshKinds[slot]) || 'ring';
    };

    check('A21_MESH_RIM_PINNED', () => {
      for (const mesh of meshAttachments) {
        if (!mesh.bones) continue;
        const perVertexAll = meshWeights(mesh);
        const slotBoneOf = (() => {
          for (const skin of data.skins) {
            for (const entry of skin.getAttachments()) {
              if (entry.attachment === mesh) return data.slots[entry.slotIndex].boneData;
            }
          }
          return null;
        })();
        // A ribbon's outer boundary is SUPPOSED to move — that is the whole point
        // of a drip. So the rule splits by mesh kind rather than being relaxed:
        // for a ribbon the invariant is that the ENTRY row cannot move, because
        // that row is where the fluid leaves the body. Both rules protect the
        // same thing (the part's join to the plate underneath); they just live at
        // different edges of the mesh.
        if (kindOf(mesh) === 'ribbon') {
          const uvs = mesh.regionUVs ?? [];
          let entryRow = 0;
          for (let v = 0; v < perVertexAll.length; v++) {
            if (Math.abs(uvs[v * 2 + 1]) > 1e-6) continue; // not on the entry edge
            entryRow++;
            const vertex = perVertexAll[v];
            if (vertex.length !== 1 || Math.abs(vertex[0].weight - 1) > 1e-6) {
              fail(
                'A21_MESH_RIM_PINNED',
                `ribbon "${mesh.name}" entry vertex ${v} is not pinned (${vertex.map((w) => w.weight.toFixed(3)).join('+')})`,
              );
              continue;
            }
            if (slotBoneOf && data.bones[vertex[0].bone]?.name !== slotBoneOf.name) {
              fail(
                'A21_MESH_RIM_PINNED',
                `ribbon "${mesh.name}" entry vertex ${v} is pinned to "${data.bones[vertex[0].bone]?.name}", not the anchor bone "${slotBoneOf.name}"`,
              );
            }
          }
          if (entryRow < 2) {
            fail('A21_MESH_RIM_PINNED', `ribbon "${mesh.name}" has ${entryRow} vertices on its entry edge; a strip needs two`);
          }
          continue;
        }
        const hullVertices = mesh.hullLength / 2;
        if (!Number.isInteger(hullVertices) || hullVertices < 3) {
          fail('A21_MESH_RIM_PINNED', `mesh "${mesh.name}" declares hull ${mesh.hullLength / 2}; the rim must be a real ring`);
          continue;
        }
        const perVertex = meshWeights(mesh);
        if (hullVertices > perVertex.length) {
          fail('A21_MESH_RIM_PINNED', `mesh "${mesh.name}" hull is ${hullVertices} of ${perVertex.length} vertices`);
          continue;
        }
        // The rim is the alpha contour where generated pixels meet untouched
        // base. One bone at weight 1, and that bone must be the slot's own —
        // anything else and the seam can move (plan 02 section 2-3).
        const slotBone = (() => {
          for (const skin of data.skins) {
            for (const entry of skin.getAttachments()) {
              if (entry.attachment === mesh) return data.slots[entry.slotIndex].boneData;
            }
          }
          return null;
        })();
        for (let i = 0; i < hullVertices; i++) {
          const vertex = perVertex[i];
          if (vertex.length !== 1 || Math.abs(vertex[0].weight - 1) > 1e-6) {
            fail(
              'A21_MESH_RIM_PINNED',
              `mesh "${mesh.name}" rim vertex ${i} is not pinned (${vertex.map((v) => v.weight.toFixed(3)).join('+')})`,
            );
            continue;
          }
          if (slotBone && data.bones[vertex[0].bone]?.name !== slotBone.name) {
            fail(
              'A21_MESH_RIM_PINNED',
              `mesh "${mesh.name}" rim vertex ${i} is pinned to "${data.bones[vertex[0].bone]?.name}", not the slot bone "${slotBone.name}"`,
            );
          }
        }
        // Independent of the ring ORDER: whatever sits on the region border is
        // the outline, and the outline moving means the part's own edge moving.
        // Without this, reordering the rings would move the pinned prefix off
        // the outline and A21 would still pass on the count alone.
        const uvs = mesh.regionUVs ?? [];
        for (let v = 0; v < perVertex.length; v++) {
          const u = uvs[v * 2];
          const t = uvs[v * 2 + 1];
          const onBorder = [u, t].some((c) => Math.abs(c) < 1e-6 || Math.abs(c - 1) < 1e-6);
          if (!onBorder) continue;
          const vertex = perVertex[v];
          if (vertex.length !== 1 || Math.abs(vertex[0].weight - 1) > 1e-6) {
            fail('A21_MESH_RIM_PINNED', `mesh "${mesh.name}" vertex ${v} is on the region border but not pinned`);
            break;
          }
        }
      }
    });

    check('A22_MESH_UVS_IN_UNIT_RANGE', () => {
      for (const mesh of meshAttachments) {
        // `regionUVs` is what the JSON authored; `uvs` is the page-space result
        // and stays EMPTY until a renderer calls computeUVs, so asserting on it
        // here would be asserting on the wrong array (measured: length 0 after
        // a clean load). With one part per page the two are equal anyway —
        // computeUVs reduces to `u + regionUV * width` with u=0, width=1
        // (MeshAttachment.js:173-174), which is the claim plan 04 section 1-3
        // makes and this is where it is checked.
        const uvs = mesh.regionUVs;
        if (!uvs || uvs.length !== mesh.worldVerticesLength) {
          fail(
            'A22_MESH_UVS_IN_UNIT_RANGE',
            `mesh "${mesh.name}" has ${uvs?.length ?? 0} authored uv values for ${mesh.worldVerticesLength}`,
          );
          continue;
        }
        for (let i = 0; i < uvs.length; i++) {
          if (!Number.isFinite(uvs[i]) || uvs[i] < -1e-6 || uvs[i] > 1 + 1e-6) {
            fail('A22_MESH_UVS_IN_UNIT_RANGE', `mesh "${mesh.name}" uv[${i}] is ${uvs[i]}`);
            break;
          }
        }
      }
    });

    // --- A23: a physics constraint that does nothing, quietly ---------------
    //
    // Every failure mode here is silent. The five component fields default to
    // 0, so a constraint can drive nothing at all; `mix` 0 mutes it; `mass` 0
    // becomes an infinite massInverse; and `damping` >= 1 never settles, which
    // on a mesh-driving bone means the canvas re-rasterises forever.
    check('A23_PHYSICS_CONSTRAINT_EFFECTIVE', () => {
      const meshBoneNames = new Set<string>();
      for (const slotIndex of meshSlots) meshBoneNames.add(data.slots[slotIndex].boneData.name);
      for (const mesh of meshAttachments) {
        if (!mesh.bones) continue;
        for (let i = 0; i < mesh.bones.length; ) {
          const boneCount = mesh.bones[i++];
          for (let n = 0; n < boneCount; n++, i++) {
            const bone = data.bones[mesh.bones[i]];
            if (bone) meshBoneNames.add(bone.name);
          }
        }
      }
      for (const constraint of data.constraints) {
        if (!(constraint instanceof PhysicsConstraintData)) continue;
        const where = `physics "${constraint.name}"`;
        const components = (['x', 'y', 'rotate', 'scaleX', 'shearX'] as const).filter((k) => constraint[k] > 0);
        if (!components.length) {
          fail('A23_PHYSICS_CONSTRAINT_EFFECTIVE', `${where} drives no component; it parses and does nothing`);
        }
        const pose = constraint.setupPose;
        if (!(pose.mix > 0)) fail('A23_PHYSICS_CONSTRAINT_EFFECTIVE', `${where} has mix ${pose.mix}; it is muted`);
        if (!Number.isFinite(pose.massInverse) || pose.massInverse <= 0) {
          fail('A23_PHYSICS_CONSTRAINT_EFFECTIVE', `${where} has massInverse ${pose.massInverse} (mass must be > 0)`);
        }
        if (!(pose.strength > 0)) {
          fail('A23_PHYSICS_CONSTRAINT_EFFECTIVE', `${where} has strength ${pose.strength}; nothing pulls it back`);
        }
        if (!(pose.damping > 0 && pose.damping < 1)) {
          fail(
            'A23_PHYSICS_CONSTRAINT_EFFECTIVE',
            `${where} has damping ${pose.damping}; outside (0,1) it never settles` +
              (meshBoneNames.has(constraint.bone.name) ? ' — and this bone drives a mesh, so the canvas never rests' : ''),
          );
        }
        if (constraint.step <= 0 || !Number.isFinite(constraint.step)) {
          fail('A23_PHYSICS_CONSTRAINT_EFFECTIVE', `${where} has step ${constraint.step} (fps must be > 0)`);
        }
      }
      stats.physicsConstraints = data.constraints.filter((c) => c instanceof PhysicsConstraintData).length;
    });

    // --- A08: region names exact-match attachment names --------------------
    check('A08_REGION_NAMES_MATCH_ATTACHMENTS', () => {
      const regionNames = new Set(atlas!.regions.map((r) => r.name));
      for (const skin of data.skins) {
        for (const entry of skin.getAttachments()) {
          const att = entry.attachment;
          const lookup = att instanceof RegionAttachment || att instanceof MeshAttachment ? att.path || att.name : null;
          if (lookup === null) continue;
          if (lookup !== lookup.trim()) {
            fail('A08_REGION_NAMES_MATCH_ATTACHMENTS', `attachment path ${JSON.stringify(lookup)} has stray whitespace`);
          }
          if (!regionNames.has(lookup)) {
            fail('A08_REGION_NAMES_MATCH_ATTACHMENTS', `attachment "${entry.placeholder}" wants region "${lookup}", which the atlas does not have`);
          }
          // 📐 PROFILE. That the join RESOLVES is validity — an attachment
          // pointing at a region the atlas does not have is a hole in the rig
          // whoever loads it. That the two names are IDENTICAL is rigc's v0
          // policy: it holds because there is no packer, and a real packer
          // renames regions by design (spineboy's `path` differs from its
          // placeholder in 26 attachments).
          if (policy && entry.placeholder !== lookup) {
            fail('A08_REGION_NAMES_MATCH_ATTACHMENTS', `attachment "${entry.placeholder}" resolves to region "${lookup}"; v0 requires them identical`);
          }
        }
      }
      for (const region of atlas!.regions) {
        if (region.name !== region.name.trim()) {
          fail('A08_REGION_NAMES_MATCH_ATTACHMENTS', `atlas region ${JSON.stringify(region.name)} has stray whitespace`);
        }
      }
    });

    // --- A09: compiled duration == declared duration (rule 4) --------------
    check('A09_ANIMATION_DURATION_MATCHES_SPEC', () => {
      if (!input.declaredDurations) return;
      for (const [name, declared] of Object.entries(input.declaredDurations)) {
        const anim = data.findAnimation(name);
        if (!anim) {
          fail('A09_ANIMATION_DURATION_MATCHES_SPEC', `spec declares animation "${name}" but the skeleton has none`);
          continue;
        }
        if (Math.abs(anim.duration - declared) > FRAME) {
          fail(
            'A09_ANIMATION_DURATION_MATCHES_SPEC',
            `animation "${name}" loaded duration ${anim.duration}s, spec declares ${declared}s`,
          );
        }
      }
      for (const anim of data.animations) {
        if (!(anim.name in input.declaredDurations)) {
          fail('A09_ANIMATION_DURATION_MATCHES_SPEC', `skeleton has animation "${anim.name}" with no spec entry`);
        }
      }
    });

    // --- A10: step every animation and look for NaN ------------------------
    check('A10_NO_NAN_AFTER_STEPPING', () => {
      for (const anim of data.animations) {
        const skeleton = new Skeleton(data);
        const state = new AnimationState(new AnimationStateData(data));
        state.setAnimation(0, anim.name, true);
        skeleton.setupPose();
        skeleton.update(0);
        skeleton.updateWorldTransform(Physics.reset);
        const step = Math.max(anim.duration, 1) / STEP_FRAMES;
        for (let i = 0; i < STEP_FRAMES; i++) {
          state.update(step);
          state.apply(skeleton);
          skeleton.update(step);
          skeleton.updateWorldTransform(Physics.update);
          for (const bone of skeleton.bones) {
            const pose = bone.appliedPose;
            if (!Number.isFinite(pose.worldX) || !Number.isFinite(pose.worldY)) {
              fail('A10_NO_NAN_AFTER_STEPPING', `${anim.name}: bone "${bone.data.name}" world is (${pose.worldX}, ${pose.worldY})`);
              return;
            }
          }
          for (const slot of skeleton.slots) {
            const c = slot.appliedPose.color;
            if (![c.r, c.g, c.b, c.a].every(Number.isFinite)) {
              fail('A10_NO_NAN_AFTER_STEPPING', `${anim.name}: slot "${slot.data.name}" colour is non-finite`);
              return;
            }
          }
        }
      }
    });
  }

  // --- A06 / A17 / A19: the atlas against the PNGs on disk ------------------
  // Case 6h: a `size:` that disagrees with the file loads fine and collapses
  // every UV — rigid stays correct, meshes sample a corner scrap.
  check('A17_ATLAS_PAGE_FILES_EXIST', () => {
    if (!atlas) return;
    for (const page of atlas.pages) {
      const abs = resolve(input.atlasDir, page.name);
      if (!existsSync(abs)) fail('A17_ATLAS_PAGE_FILES_EXIST', `page "${page.name}" is not on disk at ${abs}`);
    }
  });
  check('A06_ATLAS_PAGE_SIZE_MATCHES_PNG', () => {
    if (!atlas) return;
    for (const page of atlas.pages) {
      const abs = resolve(input.atlasDir, page.name);
      if (!existsSync(abs)) continue; // A17 owns this
      const info = readPngInfo(abs);
      if (page.width !== info.width || page.height !== info.height) {
        fail(
          'A06_ATLAS_PAGE_SIZE_MATCHES_PNG',
          `page "${page.name}" declares ${page.width}x${page.height} but the PNG is ${info.width}x${info.height}`,
        );
      }
      // 📐 PROFILE, from here down. `pma: false`, one region per page and no
      // rotation are rigc's atlas CONVENTION, not the atlas format's rules — a
      // packed page with `rotate: 90` is what the Spine packer produces and
      // every official example ships one. The convention is what makes the
      // attachment -> region -> file chain checkable exactly (A27), so it stays
      // on for spine-html; under `spine` an atlas is judged only on whether its
      // declared size matches the file it names.
      if (policy && page.pma) {
        fail('A06_ATLAS_PAGE_SIZE_MATCHES_PNG', `page "${page.name}" claims premultiplied alpha; parts are straight alpha`);
      }
    }
    if (!policy) return;
    for (const region of atlas.regions) {
      if (region.u !== 0 || region.v !== 0 || region.u2 !== 1 || region.v2 !== 1) {
        fail(
          'A06_ATLAS_PAGE_SIZE_MATCHES_PNG',
          `region "${region.name}" has UVs (${region.u},${region.v})-(${region.u2},${region.v2}); one part per page must cover the page exactly`,
        );
      }
      if (region.degrees !== 0) {
        fail('A06_ATLAS_PAGE_SIZE_MATCHES_PNG', `region "${region.name}" is rotated; there is no packer, so nothing can be`);
      }
    }
  });
  // An overlay part must carry an alpha channel or it cannot be an overlay: it
  // would paint an opaque rectangle over the untouched base (plan 05 s2-2, the
  // formation whose whole claim is that the still frame has no seam). The base
  // plate itself is the one page allowed to be opaque, and it identifies
  // itself structurally — it is the region that covers the whole stage.
  check('A19_OVERLAY_PNGS_HAVE_ALPHA', () => {
    if (!atlas) return;
    const stageW = skeletonData?.width ?? 0;
    const stageH = skeletonData?.height ?? 0;
    const basePages = new Set<string>();
    for (const att of regionAttachments) {
      if (stageW && stageH && att.width >= stageW && att.height >= stageH) {
        const region = atlas.findRegion(att.path || att.name);
        if (region) basePages.add(region.page.name);
      }
    }
    for (const page of atlas.pages) {
      const abs = resolve(input.atlasDir, page.name);
      if (!existsSync(abs)) continue;
      const info = readPngInfo(abs);
      if (info.hasAlpha) continue;
      if (basePages.has(page.name)) continue; // full-stage base plate: opaque is correct
      fail(
        'A19_OVERLAY_PNGS_HAVE_ALPHA',
        `overlay page "${page.name}" has colour type ${info.colourType}, which carries no alpha channel`,
      );
    }
  });

  // -------------------------------------------------------------------------
  // Tier-2 archetype assertions. These need `input.rig`, because skeleton JSON
  // does not record which bone carries the axis, which parentage is forbidden,
  // what the canonical draw order is, or which mesh is a ribbon.
  // -------------------------------------------------------------------------
  stats.rig = input.rig ? input.rig.archetype : 'absent';
  stats.profile = profile;

  // --- A24: the stroke is authored in AXIS space ---------------------------
  //
  // ⭐ The keystone of the joint archetype, and the exact bug the scaffold had:
  // it wrote the stroke as screen-space x/y pairs (`x: 30, y: 8` -> `x: -45,
  // y: -12`), so every key had to be re-recorded for a cut at a different camera
  // angle — and plan 01 section 1-1 measured a ~40 degree difference between
  // sibling variants of ONE cut. With the direction living in the axis bone's
  // setup rotation, a screen-space y component on any bone in that subtree means
  // somebody put the direction back into the keys.
  //
  // The axis bone itself must carry no keys at all: it is a per-cut setup value,
  // and animating it swings the whole formation.
  check('A24_AXIS_SPACE_STROKE', () => {
    const rig = input.rig;
    if (!rig?.axisBone) return;
    const subtree = new Set(rig.axisSubtree);
    const anims = isObj(raw?.animations) ? (raw.animations as Json) : {};
    for (const [animName, anim] of Object.entries(anims)) {
      if (!isObj(anim) || !isObj(anim.bones)) continue;
      for (const [boneName, timelines] of Object.entries(anim.bones as Json)) {
        if (boneName === rig.axisBone) {
          fail(
            'A24_AXIS_SPACE_STROKE',
            `"${animName}" keys the axis bone "${boneName}"; the axis angle is a per-cut SETUP value, not animation`,
          );
          continue;
        }
        if (!subtree.has(boneName) || !isObj(timelines)) continue;
        if ('translatey' in timelines) {
          fail(
            'A24_AXIS_SPACE_STROKE',
            `"${animName}" gives "${boneName}" a translatey timeline; a bone under "${rig.axisBone}" moves along the axis only`,
          );
        }
        const keys = (timelines as Json).translate;
        if (!Array.isArray(keys)) continue;
        for (const key of keys) {
          if (!isObj(key)) continue;
          const y = Number(key.y ?? 0);
          if (Number.isFinite(y) && Math.abs(y) > 1e-6) {
            fail(
              'A24_AXIS_SPACE_STROKE',
              `"${animName}" keys "${boneName}" translate y=${y} at t=${String(key.time ?? 0)}; the axis bone carries the direction, so keys are translateX only`,
            );
          }
        }
      }
    }
  });

  // --- A25: parentage that must never happen -------------------------------
  //
  // ⚠️ `fluid_src` under `piston` is the scaffold's other structural bug
  // (`spine_builder.py:49`): emitted fluid then gets dragged left and right with
  // every stroke. Once released, fluid stays at the entry point and takes gravity.
  // It is exactly the class of invariant this project puts in a machine guard
  // instead of prose, because the rig still loads and animates — it just lies.
  check('A25_DETACHED_BONE_PARENTAGE', () => {
    const rig = input.rig;
    if (!rig?.detached.length) return;
    const parentOf = new Map<string, string | null>();
    for (const bone of Array.isArray(raw?.bones) ? (raw.bones as unknown[]) : []) {
      if (isObj(bone) && typeof bone.name === 'string') {
        parentOf.set(bone.name, typeof bone.parent === 'string' ? bone.parent : null);
      }
    }
    for (const [child, forbidden] of rig.detached) {
      if (!parentOf.has(child)) {
        fail('A25_DETACHED_BONE_PARENTAGE', `the rig declares "${child}" detached from "${forbidden}" but has no such bone`);
        continue;
      }
      const seen = new Set<string>();
      for (let cursor = parentOf.get(child) ?? null; cursor; cursor = parentOf.get(cursor) ?? null) {
        if (seen.has(cursor)) break; // a cycle; the loader would have thrown first
        seen.add(cursor);
        if (cursor !== forbidden) continue;
        fail(
          'A25_DETACHED_BONE_PARENTAGE',
          `"${child}" is a descendant of "${forbidden}"; it must not be dragged by that bone's motion`,
        );
        break;
      }
    }
  });

  // --- A26: draw order matches the archetype's slot table ------------------
  //
  // The slots array IS the draw order (z-index = array index), and the illusion
  // this archetype sells depends on one adjacency: `lip` must be drawn AFTER
  // `piston`, or the entry point is not swallowed. Nothing in the file objects to
  // the wrong order, and on a still frame it can even look plausible.
  check('A26_SLOT_DRAW_ORDER', () => {
    const order = input.rig?.slotOrder;
    if (!order) return;
    const names = (Array.isArray(raw?.slots) ? (raw.slots as unknown[]) : [])
      .filter(isObj)
      .map((s) => String(s.name));
    let at = 0;
    for (const name of names) {
      const found = order.indexOf(name, at);
      if (found < 0) {
        const known = order.indexOf(name);
        fail(
          'A26_SLOT_DRAW_ORDER',
          known < 0
            ? `slot "${name}" is not in the archetype's slot table`
            : `slot "${name}" is drawn out of order (table position ${known}, after a slot at ${at})`,
        );
        return;
      }
      at = found + 1;
    }
  });

  // --- A27: region name == the PNG's basename ------------------------------
  //
  // The join key is a chain of three names — attachment -> atlas region -> file —
  // and A08 only holds the first link. The second was held by convention alone:
  // an atlas could declare page `../plates/02_lip_overlay.png` with a region
  // called anything at all, every attachment could agree with it, and the rig
  // would load with the wrong pixels under the right name. One part per page (A06
  // forces it) makes the check exact.
  check('A27_REGION_NAME_MATCHES_PAGE_FILENAME', () => {
    if (!atlas) return;
    const perPage = new Map<string, number>();
    for (const region of atlas.regions) perPage.set(region.page.name, (perPage.get(region.page.name) ?? 0) + 1);
    for (const region of atlas.regions) {
      // A real packer puts many regions on one page and the names stop matching
      // filenames by design. Then this check has nothing to say, so it says
      // nothing rather than something wrong.
      if ((perPage.get(region.page.name) ?? 0) !== 1) continue;
      const expected = basename(region.page.name).replace(/\.png$/i, '');
      if (region.name !== expected) {
        fail(
          'A27_REGION_NAME_MATCHES_PAGE_FILENAME',
          `region "${region.name}" is the only region on page "${region.page.name}", whose basename is "${expected}"`,
        );
      }
    }
  });

  // --- A28: a ribbon's rows share their weights ----------------------------
  //
  // This is what makes "length without width" a property of the file rather than
  // a hope. Both vertices of a row carry the same bones at the same weights, so
  // whatever the chain does to one it does to the other and their separation can
  // only rotate — the strip curves and stretches, and never gets fatter. Give one
  // side a different weight and the drip develops a taper that grows with the
  // sag, which is the sort of thing that reads as bad art rather than as a bug.
  check('A28_RIBBON_ROWS_SHARE_WEIGHTS', () => {
    if (!skeletonData || !input.rig) return;
    const data = skeletonData as NonNullable<typeof skeletonData>;
    for (const skin of data.skins) {
      for (const entry of skin.getAttachments()) {
        const mesh = entry.attachment;
        if (!(mesh instanceof MeshAttachment) || !mesh.bones) continue;
        if (input.rig.meshKinds[data.slots[entry.slotIndex].name] !== 'ribbon') continue;
        const perVertex = meshWeightsOf(mesh);
        if (perVertex.length % 2 !== 0) {
          fail('A28_RIBBON_ROWS_SHARE_WEIGHTS', `ribbon "${mesh.name}" has ${perVertex.length} vertices; a strip has an even count`);
          continue;
        }
        // Perimeter order: left row i is index i, right row i is its mirror.
        const rows = perVertex.length / 2;
        for (let i = 0; i < rows; i++) {
          const left = perVertex[i];
          const right = perVertex[perVertex.length - 1 - i];
          const shape = (v: typeof left) => v.map((w) => `${w.bone}:${w.weight.toFixed(6)}`).join(',');
          if (shape(left) !== shape(right)) {
            fail(
              'A28_RIBBON_ROWS_SHARE_WEIGHTS',
              `ribbon "${mesh.name}" row ${i} has [${shape(left)}] on one side and [${shape(right)}] on the other; its width would change with the chain`,
            );
          }
        }
      }
    }
  });

  // --- A29: the stroke stops where the bodies meet -------------------------
  //
  // 🎯 Owner rule, 2026-08-22: the swallow depth goes at most until the inserting
  // mass touches the occluder. A stroke that drives past that point renders as two
  // bodies interpenetrating, and NOTHING in skeleton JSON objects - the animation
  // loads, plays, and is simply wrong. Exactly the shape of silent wrongness this
  // validator exists for.
  //
  // Two things spend the same clearance and so are added together:
  //   * the stroke, which is a translateX on a bone in the axis subtree (A24
  //     guarantees there is no hidden screen-space component to miss); and
  //   * the mass bone's own inward keys. It hangs off `cam`, not off `axis`, so its
  //     keys are screen-space by design - they get projected onto the axis rather
  //     than read as axis coordinates. Ignoring them would let a rig pass while the
  //     recoil closed the last few pixels of the gap.
  check('A29_STROKE_WITHIN_CONTACT_DEPTH', () => {
    const rig = input.rig;
    if (!rig) return skip('A29_STROKE_WITHIN_CONTACT_DEPTH', 'no rig info (validating a bare directory)');
    if (!rig.contactDepth) {
      return skip(
        'A29_STROKE_WITHIN_CONTACT_DEPTH',
        'the manifest declares no `stroke.contact_depth`, so this cut has no measured contact ceiling to hold the stroke to',
      );
    }
    const deep = deepestInwardAdvance(raw, rig);
    stats.contactDepth = rig.contactDepth;
    stats.deepestAdvance = Math.round(deep.total * 1000) / 1000;
    if (deep.total > rig.contactDepth + 1e-6) {
      fail(
        'A29_STROKE_WITHIN_CONTACT_DEPTH',
        `${deep.describe()} but the masses meet at ${rig.contactDepth}px — the bodies would interpenetrate`,
      );
    }
  });

  // --- A30: the stroke stops where the drawn flesh runs out ----------------
  //
  // 🎯 The second ceiling, and it is NOT a restatement of A29. Contact asks when
  // two masses collide; containment asks when the moving part's cap contour stops
  // being covered by the occluder's opaque footprint. Past that point the cap is
  // drawn in a place the art says is inside the body — the exact inverse of plan
  // 02 section 8-8's defect, where the part was too short to reach the rim — and
  // like every failure in this family it is completely silent: the animation
  // loads, plays, and shows flesh passing through flesh.
  //
  // A cut can have either ceiling without the other, which is why they are two
  // fields and two assertions. The real tier-2 cut has no contact ceiling at all
  // (its mass and its occluder are complementary cuts of one anatomy, so they are
  // adjacent at rest and never "meet") and a containment ceiling of 118px.
  //
  // ⚠️ Second half, and it is what keeps the first half true: the ceiling is
  // measured on the UNDEFORMED contour, by translating the plate along the axis.
  // A scale key on any bone in the axis subtree changes the contour itself, so the
  // measured number stops describing the rig — quietly, because the file still
  // validates. Rather than assert a number that no longer means anything, refuse
  // the deformation. A cut that wants squash under a declared ceiling has to
  // re-measure containment for the scaled contour and say so.
  check('A30_STROKE_WITHIN_CAP_CONTAINMENT', () => {
    const rig = input.rig;
    if (!rig) return skip('A30_STROKE_WITHIN_CAP_CONTAINMENT', 'no rig info (validating a bare directory)');
    if (!rig.capContainmentCeiling) {
      return skip(
        'A30_STROKE_WITHIN_CAP_CONTAINMENT',
        'the manifest declares no `stroke.cap_containment_ceiling`, so this cut has no measured containment ceiling',
      );
    }
    const deep = deepestInwardAdvance(raw, rig);
    stats.capCeiling = rig.capContainmentCeiling;
    stats.deepestAdvance = Math.round(deep.total * 1000) / 1000;
    if (deep.total > rig.capContainmentCeiling + 1e-6) {
      fail(
        'A30_STROKE_WITHIN_CAP_CONTAINMENT',
        `${deep.describe()} but the cap contour leaves the occluder's opaque footprint at ` +
          `${rig.capContainmentCeiling}px — the cap would be drawn where it should be swallowed`,
      );
    }
    const subtree = new Set(rig.axisSubtree);
    const anims = isObj(raw?.animations) ? (raw.animations as Json) : {};
    for (const [animName, anim] of Object.entries(anims)) {
      if (!isObj(anim) || !isObj(anim.bones)) continue;
      for (const [boneName, timelines] of Object.entries(anim.bones as Json)) {
        if (!subtree.has(boneName) || !isObj(timelines)) continue;
        for (const name of Object.keys(timelines)) {
          if (name !== 'scale' && name !== 'scalex' && name !== 'scaley') continue;
          fail(
            'A30_STROKE_WITHIN_CAP_CONTAINMENT',
            `"${animName}" gives "${boneName}" a ${name} timeline while a cap-containment ceiling is declared; ` +
              'the ceiling was measured on the undeformed contour, so a scaled plate is outside its evidence',
          );
        }
      }
    }
  });

  // --- A18: determinism ----------------------------------------------------
  check('A18_DETERMINISTIC_EMIT', () => {
    if (!input.reEmit) return;
    if (input.reEmit.skeletonText !== input.skeletonText) {
      fail('A18_DETERMINISTIC_EMIT', 'recompiling produced a different skeleton.json');
    }
    if (input.reEmit.atlasText !== input.atlasText) {
      fail('A18_DETERMINISTIC_EMIT', 'recompiling produced a different skeleton.atlas');
    }
  });

  return { failures, passed, skipped, profileSkipped, profile, stats };
}

/**
 * Deepest inward advance the animation data asks for, in axis pixels.
 *
 * Shared by A29 and A30 because they bound the SAME quantity against two
 * different measured facts. Two things spend the same clearance and so are added:
 *
 *   * the stroke — a translateX on a bone in the axis subtree. A24 guarantees
 *     there is no hidden screen-space component to miss.
 *   * the mass bone's own inward keys. It hangs off `cam`, not off `axis`, so its
 *     keys are screen-space by design and get PROJECTED onto the axis rather than
 *     read as axis coordinates. Ignoring them would let a rig pass while the
 *     recoil closed the last few pixels.
 */
function deepestInwardAdvance(
  raw: Json | null,
  rig: NonNullable<ValidateInput['rig']>,
): { total: number; describe: () => string } {
  const anims = isObj(raw?.animations) ? (raw.animations as Json) : {};
  const subtree = new Set(rig.axisSubtree);
  let strokeMax = 0;
  let strokeWhere = '';
  let massMax = 0;
  let massWhere = '';
  for (const [animName, anim] of Object.entries(anims)) {
    if (!isObj(anim) || !isObj(anim.bones)) continue;
    for (const [boneName, timelines] of Object.entries(anim.bones as Json)) {
      if (!isObj(timelines)) continue;
      const keys = (timelines as Json).translate;
      if (!Array.isArray(keys)) continue;
      for (const key of keys) {
        if (!isObj(key)) continue;
        if (subtree.has(boneName)) {
          // +x is inward along the axis; a retracted key is negative and spends
          // no clearance, so only the inward extreme matters.
          const x = Number(key.x ?? 0);
          if (Number.isFinite(x) && x > strokeMax) {
            strokeMax = x;
            strokeWhere = `${animName}.${boneName} t=${String(key.time ?? 0)}`;
          }
        } else if (boneName === rig.massBone && rig.inwardUnit) {
          const inward = Number(key.x ?? 0) * rig.inwardUnit[0] + Number(key.y ?? 0) * rig.inwardUnit[1];
          if (Number.isFinite(inward) && inward > massMax) {
            massMax = inward;
            massWhere = `${animName}.${boneName} t=${String(key.time ?? 0)}`;
          }
        }
      }
    }
  }
  return {
    total: strokeMax + massMax,
    describe: () =>
      `deepest inward advance is ${(strokeMax + massMax).toFixed(3)}px (stroke ${strokeMax.toFixed(3)} at ${strokeWhere}` +
      `${massMax > 0 ? ` + mass ${massMax.toFixed(3)} at ${massWhere}` : ''})`,
  };
}

/**
 * Walks `animations.<anim>.{bones,slots,attachments,physics}` and hands each
 * timeline to the visitor. `drawOrder` and `events` carry no curves and no
 * per-channel data, so they are skipped by design.
 */
function walkTimelines(
  raw: Json | null,
  visit: (path: string, kind: 'bone' | 'slot' | 'attachment' | 'physics', name: string, keys: unknown[]) => void,
): void {
  if (!raw || !isObj(raw.animations)) return;
  for (const [animName, anim] of Object.entries(raw.animations as Json)) {
    if (!isObj(anim)) continue;
    for (const [group, kind] of [
      ['bones', 'bone'],
      ['slots', 'slot'],
      ['physics', 'physics'],
    ] as const) {
      if (!isObj(anim[group])) continue;
      for (const [targetName, timelines] of Object.entries(anim[group] as Json)) {
        if (!isObj(timelines)) continue;
        for (const [timelineName, keys] of Object.entries(timelines)) {
          if (!Array.isArray(keys)) continue;
          visit(`${animName}.${group}.${targetName}.${timelineName}`, kind, timelineName, keys);
        }
      }
    }
    // attachments.<skin>.<slot>.<attachment>.<timeline>
    if (isObj(anim.attachments)) {
      for (const [skinName, skinMap] of Object.entries(anim.attachments as Json)) {
        if (!isObj(skinMap)) continue;
        for (const [slotName, slotMap] of Object.entries(skinMap)) {
          if (!isObj(slotMap)) continue;
          for (const [attName, attMap] of Object.entries(slotMap)) {
            if (!isObj(attMap)) continue;
            for (const [timelineName, keys] of Object.entries(attMap)) {
              if (!Array.isArray(keys)) continue;
              visit(
                `${animName}.attachments.${skinName}.${slotName}.${attName}.${timelineName}`,
                'attachment',
                timelineName,
                keys,
              );
            }
          }
        }
      }
    }
  }
}

/**
 * Decode a weighted mesh's `vertices` run into per-vertex (boneIndex, weight).
 *
 * The encoding carries no marker at all — weighted versus unweighted is decided
 * by a length comparison (plan 04 section 1-3) — so every assertion that talks
 * about weights has to walk the run itself.
 */
function meshWeightsOf(mesh: MeshAttachment): Array<Array<{ bone: number; weight: number }>> {
  const out: Array<Array<{ bone: number; weight: number }>> = [];
  if (!mesh.bones) return out;
  let bi = 0;
  let vi = 0;
  while (bi < mesh.bones.length) {
    const boneCount = mesh.bones[bi++];
    const vertex: Array<{ bone: number; weight: number }> = [];
    for (let n = 0; n < boneCount; n++, bi++, vi += 3) {
      vertex.push({ bone: mesh.bones[bi], weight: mesh.vertices[vi + 2] });
    }
    out.push(vertex);
  }
  return out;
}

export function reportLines(report: ValidateReport): string[] {
  const lines: string[] = [];
  // The profile goes FIRST and names what it left out. A report that says
  // "green" without saying which rulebook produced it is the one thing this
  // switch could make worse than no switch: `--profile spine` green means
  // "valid Spine", never "passes the renderer policy".
  const renderer = report.profileSkipped.filter((p) => p.kind === 'renderer').length;
  const archetype = report.profileSkipped.filter((p) => p.kind === 'archetype').length;
  lines.push(
    report.profileSkipped.length === 0
      ? `  ..    profile ${report.profile} — every assertion applies`
      : `  ..    profile ${report.profile} — ${renderer} renderer-policy and ${archetype} archetype assertion(s) do not apply`,
  );
  for (const name of report.passed) lines.push(`  PASS  ${name}`);
  for (const s of report.skipped) lines.push(`  SKIP  ${s.assertion}: ${s.reason}`);
  for (const p of report.profileSkipped) lines.push(`  PROF  ${p.assertion}: ${p.kind} rule, not in profile "${report.profile}"`);
  for (const f of report.failures) lines.push(`  FAIL  ${f.assertion}: ${f.detail}`);
  return lines;
}

export function atlasDirOf(atlasPath: string): string {
  return dirname(resolve(atlasPath));
}
