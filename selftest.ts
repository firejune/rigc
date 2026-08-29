#!/usr/bin/env bun
/**
 * rigc selftest — proof that the validator can go RED.
 *
 * A gate nobody has seen fail is not a gate. There are at least six ways to write
 * a wrong skeleton that Spine's own parser accepts without a murmur, so this file
 * takes real compiled artifacts, breaks them one way at a time, and asserts that
 * the named assertion fires for each break.
 *
 * There is a positive control for every suite too (the pristine artifacts must
 * come back with zero failures) — without it a validator that failed everything
 * would look like a validator that worked. A check with no positive control
 * manufactures false greens.
 *
 *   bun selftest.ts                      the public suite: everything below
 *   bun selftest.ts --cuts <cuts.json>   plus an extra suite over those cuts
 *   RIGC_CUTS=<cuts.json> bun selftest.ts
 *
 * ## The public suite runs on fixtures this file generates
 *
 * ⭐ A break has to be aimed at something real to be a break at all: a mutant
 * names an attachment, a bone, an animation, and edits it. That used to make this
 * suite fixture-bound to one private project's art — a gate a fresh clone could
 * not run, which is the tool's central claim left undemonstrable by anybody who
 * did not already have the fixtures.
 *
 * So the fixtures are written fresh into a temp directory on every run, by
 * [`fixtures/public.ts`](fixtures/public.ts). Three of them, one per shape the
 * assertions care about: `overlay_probe`, `articulated_probe` and
 * `contained_probe`. Two further suites build their own even smaller rigs inline
 * (static rigs, draw-order timelines), and two more measure against the official
 * Spine example corpus that `bun run fetch-examples` downloads.
 *
 * ## What `--cuts` adds
 *
 * A cuts table is a project's own registry of cuts with measured art behind them.
 * When one is supplied, an EXTRA suite compiles every cut in it and holds the
 * result to the same gate — a regression test for the owning project, run against
 * the real geometry the fixtures only stand in for. Without one, that suite says
 * it was skipped and the run still passes on the public suite alone.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import {
  BoundingBoxAttachment,
  ClippingAttachment,
  EventTimeline,
  MeshAttachment,
  Physics,
  Skeleton,
  type SkeletonData,
} from '@esotericsoftware/spine-core';
import {
  assertFrameReadable,
  checkAgainstFrames,
  checkLines,
  componentField,
  matchSlots,
  OVERDRAW_RATIO,
  type AnimationCheck,
  type ChainCheck,
  type CheckReport,
  type FrameChange,
  type FramingHow,
  type FramingSource,
} from './src/check.ts';
import { compile, CompileError } from './src/compile.ts';
import { diffSkeletons, movedAgnosticMeasures, movedMeasures } from './src/diff.ts';
import { copyAtlasImages } from './src/emit.ts';
import { isContent } from './src/framing.ts';
import {
  BACKGROUND,
  EMPTY_FOOTPRINT,
  fill,
  FRAMES_SIDECAR,
  frameGeometry,
  framingViewport,
  loadPosable,
  pageFor,
  piecesOf,
  posableFromText,
  projector,
  PROTOCOL_FPS,
  rasterisePiece,
  renderFrame,
  sampleAll,
  sampleAnimation,
  sampleSetupPose,
  SHEET_COLUMNS,
  SHEET_FILE,
  SHEET_GAP,
  viewportOfSize,
  type Footprint,
  type Frame,
  type Mesh,
  type Piece,
  type Posable,
  type Viewport,
} from './src/render.ts';
import { readPngInfo } from './src/png.ts';
import type { CompiledImage, CompileResult } from './src/types.ts';
import { validate, type ValidateProfile } from './src/validate.ts';
import { articulatedFixture, containedFixture, overlayFixture, type Fixture } from './fixtures/public.ts';
import { Plate, PNG_SIGNATURE, pngChunk, readPlate, type RGBA } from './tools/plate.ts';

/** Same shape `cli.ts` reads; declared here so this file never imports the CLI. */
interface CutEntry {
  rig: string;
  motion: string;
  out: string;
  manifest?: string;
  images?: string;
}
type CutTable = Record<string, CutEntry>;

interface Options {
  rigPath: string;
  motionPath: string;
  outDir: string;
  manifestPath?: string;
  imagesDir?: string;
}

/**
 * The cuts table, if one was named. `null` is a normal outcome, not a failure:
 * the public suite does not need it and the extra suite says so out loud.
 *
 * ⚠️ A path that was NAMED and is not there is a different thing entirely, and it
 * exits 2. Treating a typo as "no cuts file" would mean the one caller who asked
 * for the extra suite is the one caller who silently does not get it.
 */
function readCutTable(): { file: string; dir: string; table: CutTable } | null {
  const argv = process.argv.slice(2);
  const flag = argv.indexOf('--cuts');
  let named: string | null = null;
  if (flag !== -1) {
    const value = argv[flag + 1];
    if (!value) {
      console.error('selftest: --cuts needs a path');
      process.exit(2);
    }
    named = resolve(value);
  } else if (process.env.RIGC_CUTS) {
    named = resolve(process.env.RIGC_CUTS);
  }
  if (named === null) return null;
  if (!existsSync(named)) {
    console.error(`selftest: --cuts named ${named}, which does not exist`);
    process.exit(2);
  }
  return { file: named, dir: dirname(named), table: JSON.parse(readFileSync(named, 'utf8')) as CutTable };
}

const CUTS = readCutTable();

function optsForCut(dir: string, entry: CutEntry): Options {
  const opts: Options = {
    rigPath: resolve(dir, entry.rig),
    motionPath: resolve(dir, entry.motion),
    outDir: resolve(dir, entry.out),
  };
  if (entry.manifest !== undefined) opts.manifestPath = resolve(dir, entry.manifest);
  if (entry.images !== undefined) opts.imagesDir = resolve(dir, entry.images);
  return opts;
}

function optsForFixture(fixture: Fixture): Options {
  return {
    rigPath: fixture.rigPath,
    motionPath: fixture.motionPath,
    outDir: fixture.outDir,
    manifestPath: fixture.manifestPath,
  };
}

/**
 * The overlay fixture: a base plate, two slots that fade, and one ring mesh.
 * Everything the region, timeline, atlas, mesh and physics assertions look at.
 */
const OVERLAY = overlayFixture();
/**
 * The articulated fixture. Its invariants live on bones the overlay rig does not
 * have — an axis, a detached emitter, a grip ring, a bone chain — so they need
 * their own artifacts to break. Same discipline, second suite.
 */
const ARTICULATED = articulatedFixture();
/**
 * The third fixture earns its place the way its predecessor did, and not by
 * symmetry: it is the only one that declares a cap-containment ceiling, so A30 is
 * VACUOUS on the other two and a break there would be caught by nothing; and it
 * is the only one whose manifest names a slot something other than the rig does,
 * so the mapping that resolves that is worth a break of its own.
 */
const CONTAINED = containedFixture();

// ---------------------------------------------------------------------------
// locating things inside an artifact, so no mutant hardcodes a measured number
// ---------------------------------------------------------------------------

/**
 * Start index of each vertex's run inside a weighted `vertices` array.
 *
 * ⚠️ The encoding is `boneCount, (boneIndex, bindX, bindY, weight) × n` repeated,
 * with no marker and no fixed stride — so a mutant that wants "the first weight
 * of the second vertex" has to walk the run to find it. Writing the index as a
 * literal is how a suite comes to depend on one fixture's exact geometry.
 */
function weightRuns(vertices: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < vertices.length; ) {
    out.push(i);
    i += 1 + vertices[i] * 4;
  }
  return out;
}

/** Index of the first vertex bound to more than one bone — the first one that moves. */
function firstBlendedRun(vertices: number[]): number {
  const runs = weightRuns(vertices);
  const at = runs.find((start) => vertices[start] > 1);
  if (at === undefined) throw new Error('the fixture mesh has no multi-bone vertex to re-weight');
  return at;
}

/** The first page line of an atlas: a path on a line of its own. */
function firstPageLine(atlasText: string): string {
  const line = atlasText.split('\n').find((l) => l.endsWith('.png'));
  if (!line) throw new Error('the fixture atlas declares no page');
  return line;
}

/** The first region name in an atlas: the line right after its page's `pma:`. */
function firstRegionName(atlasText: string): string {
  const lines = atlasText.split('\n');
  const at = lines.findIndex((l) => l.startsWith('pma: '));
  if (at < 0 || !lines[at + 1]) throw new Error('the fixture atlas declares no region');
  return lines[at + 1];
}

interface Artifacts {
  skeletonText: string;
  atlasText: string;
}

interface Mutant {
  name: string;
  /** The silent failure this break reproduces, and where it was first seen. */
  origin: string;
  /**
   * The assertion that must fire — or `null` for an edit the gate must ACCEPT.
   *
   * ⚠️ The second kind is not decoration. Every time an assertion is WIDENED,
   * the risk moves from "it fires too rarely" to "it fires too often" and then
   * to "it no longer fires at all", and a suite made only of breaks cannot see
   * either end of that. A16 widening to accept `4.3.75-beta` is the first case:
   * the edit must be accepted, its 4.2 and 5.x neighbours must not.
   */
  expect: string | null;
  /**
   * Which rulebook to run the break against. Defaults to `spine-html`, the
   * profile every other mutant in this file was written for. A mutant that names
   * a profile is asserting something about the SPLIT rather than about one
   * assertion — see M36a/M36b, which are the same edit under both profiles.
   */
  profile?: ValidateProfile;
  mutate: (a: Artifacts) => Artifacts;
}

const editJson = (text: string, f: (j: Record<string, unknown>) => void): string => {
  const j = JSON.parse(text) as Record<string, unknown>;
  f(j);
  return `${JSON.stringify(j, null, 2)}\n`;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const MUTANTS: Mutant[] = [
  {
    name: 'M01_legacy_toplevel_physics_array',
    origin: 'the constraint vanishes and the load is clean',
    expect: 'A01_NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).physics = [{ name: 'stray_phys', bone: 'panel', inertia: 0.6 }];
      }),
    }),
  },
  {
    name: 'M02_bone_transform_key',
    origin: 'inheritance silently falls back to Normal',
    expect: 'A02_NO_BONE_TRANSFORM_KEY',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).bones[2].transform = 'noRotationOrReflection';
      }),
    }),
  },
  {
    name: 'M03_region_missing_width',
    origin: 'width/height load as NaN, with no error',
    expect: 'A03_REGION_WIDTH_HEIGHT_FINITE',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        delete (j as any).skins[0].attachments.lens_l.lens_l_shut.width;
      }),
    }),
  },
  {
    name: 'M04_short_curve_array',
    origin: '4 numbers where 16 are needed; a NaN curve, with no error',
    expect: 'A05_CURVE_ARRAY_LENGTH',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        const keys = (j as any).animations.shut_once.slots.lens_l.rgba;
        keys[0].curve = keys[0].curve.slice(0, 4);
      }),
    }),
  },
  {
    name: 'M05_curve_on_attachment_timeline',
    origin: 'attachment timelines take no curve',
    expect: 'A05_CURVE_ARRAY_LENGTH',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).animations.cycle.slots.iris.attachment[0].curve = 'stepped';
      }),
    }),
  },
  {
    name: 'M06_atlas_size_disagrees_with_png',
    origin: 'the UVs collapse; rigid attachments look fine and meshes do not',
    expect: 'A06_ATLAS_PAGE_SIZE_MATCHES_PNG',
    mutate: (a) => ({ ...a, atlasText: a.atlasText.replace(/^size: .*$/m, 'size: 2048, 2048') }),
  },
  {
    name: 'M07_atlas_region_name_indented',
    origin: 'page names are trimmed and region names are not, so an indent renames the region',
    expect: 'A07_ATLAS_TEXT_SHAPE',
    mutate: (a) => {
      const region = firstRegionName(a.atlasText);
      return { ...a, atlasText: a.atlasText.replace(`\n${region}\n`, `\n  ${region}\n`) };
    },
  },
  {
    name: 'M08_atlas_blank_line_inside_page_block',
    origin: 'a blank line closes the page block, so every region after it becomes a page',
    expect: 'A07_ATLAS_TEXT_SHAPE',
    mutate: (a) => ({ ...a, atlasText: a.atlasText.replace(/^(pma: .*)$/m, '$1\n') }),
  },
  {
    name: 'M09_dark_two_colour_tint',
    origin: 'parsed, then silently ignored by the renderer',
    expect: 'A12_NO_DARK_COLOR',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).slots[1].dark = '404040';
      }),
    }),
  },
  {
    name: 'M10_loop_truncated_by_a_missing_last_key',
    origin: 'skeleton JSON has no duration field; the last key IS the duration',
    expect: 'A09_ANIMATION_DURATION_MATCHES_SPEC',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        for (const slot of ['lens_l', 'lens_r']) (j as any).animations.shut_auto.slots[slot].rgba.pop();
      }),
    }),
  },
  {
    name: 'M11_attachment_points_at_a_missing_region',
    origin: 'one of the two things that DOES throw loudly',
    expect: 'A00_ROUNDTRIP_PARSE',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).skins[0].attachments.iris.iris_wide.path = '99_typo';
      }),
    }),
  },
  {
    name: 'M12_page_png_not_on_disk',
    origin: 'a shipped skeleton.atlas once declared a page that never existed on disk',
    expect: 'A17_ATLAS_PAGE_FILES_EXIST',
    mutate: (a) => ({ ...a, atlasText: a.atlasText.replace(firstPageLine(a.atlasText), '../nope_not_here.png') }),
  },
  {
    name: 'M13_version_label_from_the_4_2_era',
    origin: 'the label is never checked by the parser',
    expect: 'A16_SKELETON_VERSION_4_3',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).skeleton.spine = '4.2.43';
      }),
    }),
  },
  {
    name: 'M13a_version_label_from_the_next_major',
    origin: 'the assertion is about the MAJOR.MINOR pair, and widening it for pre-releases must not widen it past 4.3',
    expect: 'A16_SKELETON_VERSION_4_3',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).skeleton.spine = '5.0.13';
      }),
    }),
  },
  {
    name: 'M13b_editor_pre_release_label_is_accepted',
    origin: 'SPEC_COVERAGE part 3-0 — all twelve official example exports declare "4.3.75-beta", which the old regex rejected (blocker B2)',
    expect: null,
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).skeleton.spine = '4.3.75-beta';
      }),
    }),
  },
  {
    // ⭐ The profile split's own control, and it takes two mutants because the
    // claim is a difference: the SAME edit must be caught by one rulebook and
    // waved through by the other. One mutant could only ever prove half of it,
    // and the half it proved would look identical either way.
    name: 'M36a_clipping_attachment_is_renderer_policy',
    origin: 'SPEC_COVERAGE part 2-2 — A11 is renderer-profile: spine-html skips clipping attachments silently, spineboy-pro ships one',
    expect: 'A11_NO_CLIPPING_ATTACHMENTS',
    profile: 'spine-html',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).skins[0].attachments.stage.stage_clip = {
          type: 'clipping',
          vertexCount: 4,
          vertices: [0, 0, 64, 0, 64, 64, 0, 64],
        };
      }),
    }),
  },
  {
    name: 'M36b_clipping_attachment_is_valid_spine',
    origin: 'the same edit under --profile spine: a clipping attachment is legal Spine 4.3 and no runtime but ours objects',
    expect: null,
    profile: 'spine',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).skins[0].attachments.stage.stage_clip = {
          type: 'clipping',
          vertexCount: 4,
          vertices: [0, 0, 64, 0, 64, 64, 0, 64],
        };
      }),
    }),
  },
  {
    // The three event mutants are one claim in three parts, and they need each
    // other: the accepted one proves the assertion is not simply refusing every
    // event timeline, and the two breaks are the only failure modes of an event
    // timeline that a runtime does not shout about.
    name: 'M45a_event_timeline_is_accepted_when_it_resolves',
    origin: 'the positive control for A32 — a declared event fired once in order is ordinary, correct Spine 4.3',
    expect: null,
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).events = { probe_step: { int: 2 } };
        const anim = Object.values((j as any).animations)[0] as any;
        anim.events = [{ time: 0, name: 'probe_step' }];
      }),
    }),
  },
  {
    name: 'M45b_event_key_fires_an_undeclared_event',
    origin: 'SkeletonJson.ts:1244 — findEvent returns null and readAnimation throws, in the CONSUMER’s process',
    expect: 'A32_EVENT_KEYS_RESOLVE',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).events = { probe_step: {} };
        const anim = Object.values((j as any).animations)[0] as any;
        anim.events = [{ time: 0, name: 'probe_stpe' }];
      }),
    }),
  },
  {
    name: 'M45c_event_key_times_go_backwards',
    origin:
      'SkeletonJson.ts:1241 — frames are filled in ARRAY order and never sorted, so a decreasing time builds ' +
      'an EventTimeline whose earlier firing is unreachable, with a perfectly clean load',
    expect: 'A32_EVENT_KEYS_RESOLVE',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).events = { probe_step: {} };
        const anim = Object.values((j as any).animations)[0] as any;
        anim.events = [
          { time: 0.5, name: 'probe_step' },
          { time: 0.25, name: 'probe_step' },
        ];
      }),
    }),
  },
  {
    name: 'M45d_event_key_sets_volume_on_a_silent_event',
    origin:
      'SkeletonJson.ts:1254-1257 — volume and balance are read only inside `if (event.data.audioPath)`, ' +
      'so on an event with no audio path they are two numbers nothing will ever read',
    expect: 'A32_EVENT_KEYS_RESOLVE',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).events = { probe_step: {} };
        const anim = Object.values((j as any).animations)[0] as any;
        anim.events = [{ time: 0, name: 'probe_step', volume: 0.5 }];
      }),
    }),
  },
  {
    name: 'M46a_a_well_formed_bounding_box_is_accepted',
    origin: 'the positive control for A33 — spineboy-ess ships exactly this shape, a 6-vertex box on a head slot',
    expect: null,
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).skins[0].attachments.stage.stage_bb = {
          type: 'boundingbox',
          vertexCount: 4,
          vertices: [0, 0, 64, 0, 64, 64, 0, 64],
        };
      }),
    }),
  },
  {
    name: 'M46b_bounding_box_without_a_vertex_count',
    origin:
      'SkeletonJson.ts:552 — `undefined << 1` is 0, so readVertices takes the weighted branch, decodes the ' +
      'coordinates as a weight run, and hands back a box with nothing in it. A bounding box draws no pixel, ' +
      'so nothing downstream ever notices',
    expect: 'A33_VERTEX_ATTACHMENT_GEOMETRY',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).skins[0].attachments.stage.stage_bb = {
          type: 'boundingbox',
          vertices: [0, 0, 64, 0, 64, 64, 0, 64],
        };
      }),
    }),
  },
  {
    name: 'M46c_bounding_box_vertex_count_disagrees_with_its_vertices',
    origin: 'a count one short reads the coordinate array as a weighted run — the mesh trap of A04 without the uvs',
    expect: 'A33_VERTEX_ATTACHMENT_GEOMETRY',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).skins[0].attachments.stage.stage_bb = {
          type: 'boundingbox',
          vertexCount: 3,
          vertices: [0, 0, 64, 0, 64, 64, 0, 64],
        };
      }),
    }),
  },
  {
    name: 'M46d_clipping_ends_at_a_slot_that_is_not_there',
    origin:
      'SkeletonJson.ts:626-627 — findSlot returns null on a miss and the null is assigned, so the clip runs ' +
      'to the bottom of the draw order. Checked on the raw JSON: a null endSlot and an absent `end` load alike',
    expect: 'A33_VERTEX_ATTACHMENT_GEOMETRY',
    profile: 'spine',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).skins[0].attachments.stage.stage_clip = {
          type: 'clipping',
          end: 'no_such_slot',
          vertexCount: 4,
          vertices: [0, 0, 64, 0, 64, 64, 0, 64],
        };
      }),
    }),
  },
  {
    name: 'M14_region_does_not_cover_its_page',
    origin: 'one part per page means u2=v2=1, always',
    expect: 'A06_ATLAS_PAGE_SIZE_MATCHES_PNG',
    mutate: (a) => ({ ...a, atlasText: a.atlasText.replace(/^bounds: .*$/m, 'bounds: 4, 4, 12, 12') }),
  },
  {
    name: 'M16_rim_vertex_pinned_to_the_control_bone',
    origin: 'if the rim can move, the seam can move',
    expect: 'A21_MESH_RIM_PINNED',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        // Vertex 0 is a rim vertex: [boneCount=1, boneIndex, bindX, bindY, 1].
        // Repoint it at the control bone and the weight stays valid — the sum is
        // still 1, nothing throws, and the seam quietly gains a hinge.
        const mesh = (j as any).skins[0].attachments.iris.iris_wide;
        mesh.vertices[weightRuns(mesh.vertices)[0] + 1] = (j as any).bones.findIndex(
          (b: any) => b.name === 'iris_aperture',
        );
      }),
    }),
  },
  {
    name: 'M17_weights_do_not_sum_to_one',
    origin: 'weights are read, never checked',
    expect: 'A20_MESH_WEIGHTS_COHERENT',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        const mesh = (j as any).skins[0].attachments.iris.iris_wide;
        // The first vertex that blends two bones: [2, b0, x, y, w0, b1, x, y, w1].
        // Knock its first weight down and the pair no longer sums to 1.
        mesh.vertices[firstBlendedRun(mesh.vertices) + 4] = 0.9;
      }),
    }),
  },
  {
    name: 'M18_uv_outside_the_region',
    origin: 'uvs decide worldVerticesLength, not their own sanity',
    expect: 'A22_MESH_UVS_IN_UNIT_RANGE',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).skins[0].attachments.iris.iris_wide.uvs[0] = 1.4;
      }),
    }),
  },
  {
    name: 'M19_idle_keys_the_mesh_control_bone',
    origin: 'a mesh keyed in idle dirties its canvas forever',
    expect: 'A15_IDLE_NO_MESH_BONE_KEYS',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        // The pre-mesh check looked at the slot's own bone only, so this exact
        // break used to pass: the control bone is a different bone.
        (j as any).animations.idle.bones = {
          iris_aperture: { scale: [{ time: 0, x: 1, y: 1 }] },
        };
      }),
    }),
  },
  {
    name: 'M20_mesh_falls_back_to_unweighted',
    origin: 'the encoding is chosen by a length comparison alone',
    expect: 'A20_MESH_WEIGHTS_COHERENT',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        const mesh = (j as any).skins[0].attachments.iris.iris_wide;
        // Exactly uvs.length numbers => the loader reads them as raw positions
        // and the bone weights are gone. No error, and the mesh stops moving.
        mesh.vertices = new Array(mesh.uvs.length).fill(0);
      }),
    }),
  },
  {
    name: 'M21_physics_drives_no_component',
    origin: 'the five component fields all default to 0',
    expect: 'A23_PHYSICS_CONSTRAINT_EFFECTIVE',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        const c = (j as any).constraints.find((x: any) => x.type === 'physics');
        delete c.x;
        delete c.y;
      }),
    }),
  },
  {
    name: 'M22_physics_damping_never_settles',
    origin: 'damping >= 1 keeps a mesh canvas alive forever',
    expect: 'A23_PHYSICS_CONSTRAINT_EFFECTIVE',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).constraints.find((x: any) => x.type === 'physics').damping = 1;
      }),
    }),
  },
  {
    name: 'M23_physics_zero_mass',
    origin: 'mass is stored as 1/mass, so 0 becomes Infinity',
    expect: 'A23_PHYSICS_CONSTRAINT_EFFECTIVE',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).constraints.find((x: any) => x.type === 'physics').mass = 0;
      }),
    }),
  },
  {
    name: 'M15_premultiplied_alpha_flag',
    origin: 'the renderer does not un-premultiply, so every part gains a black rim',
    expect: 'A06_ATLAS_PAGE_SIZE_MATCHES_PNG',
    mutate: (a) => ({ ...a, atlasText: a.atlasText.replace('pma: false', 'pma: true') }),
  },

  // ─── the timeline groups the walker used to skip ─────────────────────────
  //
  // ⚠️ Seven of the eleven 4.3 timeline groups were never visited by
  // `walkTimelines`, so A05 could not see a curve array in any of them. That is
  // the format's nastiest silent failure (a short bezier multiplies `undefined`
  // into the cubic and yields NaN with no error) going completely unguarded on
  // every group rigc does not itself emit yet — which is every group the
  // benchmark ladder needs. These seven mutants are the proof that the walker
  // now reaches them, one per group, and they are deliberately written against
  // constraints and events the fixture does not have: a rig cannot be broken in
  // a group it has no data in, so each mutant forges the minimum real structure
  // (a constraint the parser will accept) and then breaks its timeline.
  //
  // Each key stays inside the animation's declared duration, so A09 does not
  // fire alongside and the mutant proves exactly one thing.
  {
    name: 'M37_ik_timeline_short_curve',
    origin: 'SPEC_COVERAGE part 1-8 — an ik timeline is 2 channels (mix, softness), so its bezier is 8 numbers',
    expect: 'A05_CURVE_ARRAY_LENGTH',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).constraints.push({ type: 'ik', name: 'probe_ik', bones: ['panel'], target: 'root' });
        (j as any).animations.shut_once.ik = {
          probe_ik: [{ time: 0, mix: 1, curve: [0, 1, 0.1] }, { time: 0.1, mix: 0 }],
        };
      }),
    }),
  },
  {
    name: 'M38_transform_timeline_short_curve_is_a_nan_curve',
    origin:
      'SPEC_COVERAGE part 1-8 — 6 channels, 24 numbers. ⭐ A10 does NOT catch this one: the NaN never reaches a bone world transform, so A05 is the only guard the format has here',
    expect: 'A05_CURVE_ARRAY_LENGTH',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).constraints.push({
          type: 'transform',
          name: 'probe_tf',
          bones: ['panel'],
          source: 'root',
          properties: { rotate: { to: { rotate: {} } } },
        });
        (j as any).animations.shut_once.transform = {
          probe_tf: [{ time: 0, mixRotate: 1, curve: [0, 1, 0.1, 1] }, { time: 0.1, mixRotate: 0 }],
        };
      }),
    }),
  },
  {
    name: 'M39_path_timeline_short_curve',
    origin: 'SPEC_COVERAGE part 1-8 — path position is 1 channel, 4 numbers',
    expect: 'A05_CURVE_ARRAY_LENGTH',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).constraints.push({ type: 'path', name: 'probe_path', bones: ['panel'], slot: 'stage' });
        (j as any).animations.shut_once.path = {
          probe_path: { position: [{ time: 0, value: 0, curve: [0, 1] }, { time: 0.1, value: 1 }] },
        };
      }),
    }),
  },
  {
    name: 'M40_slider_timeline_short_curve',
    origin: 'SPEC_COVERAGE part 1-8 — the slider constraint is 4.3-only; its time timeline is 1 channel',
    expect: 'A05_CURVE_ARRAY_LENGTH',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).constraints.push({ type: 'slider', name: 'probe_slider', animation: 'idle' });
        (j as any).animations.shut_once.slider = {
          probe_slider: { time: [{ time: 0, value: 0, curve: [0, 1] }, { time: 0.1, value: 1 }] },
        };
      }),
    }),
  },
  {
    name: 'M41_draw_order_key_carries_a_curve',
    origin:
      'a drawOrder timeline takes no curve and the parser ignores a stray one. ⚠️ The obvious break — an offset naming a slot that does not exist — is NOT this mutant: the parser throws "Draw order slot not found" on that, so it was never the blind spot',
    expect: 'A05_CURVE_ARRAY_LENGTH',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).animations.shut_once.drawOrder = [
          { time: 0, offsets: [{ slot: 'lens_l', offset: 1 }], curve: 'stepped' },
        ];
      }),
    }),
  },
  {
    name: 'M42_draw_order_folder_key_carries_a_curve',
    origin: 'SPEC_COVERAGE part 1-8 — drawOrderFolder is 4.3-only and nests its keys one level deeper than drawOrder',
    expect: 'A05_CURVE_ARRAY_LENGTH',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).animations.shut_once.drawOrderFolder = [
          { slots: ['lens_l', 'lens_r'], keys: [{ time: 0, curve: 'stepped' }] },
        ];
      }),
    }),
  },
  {
    name: 'M43_event_key_carries_a_curve',
    origin: 'SPEC_COVERAGE part 1-8 — an event timeline is a list of firings, and a curve on one is meaningless data the parser drops',
    expect: 'A05_CURVE_ARRAY_LENGTH',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).events = { probe_event: {} };
        (j as any).animations.shut_once.events = [{ time: 0, name: 'probe_event', curve: 'stepped' }];
      }),
    }),
  },
];
/* eslint-enable @typescript-eslint/no-explicit-any */


/* eslint-disable @typescript-eslint/no-explicit-any */
const ARTICULATED_MUTANTS: Mutant[] = [
  {
    name: 'M24_base_plate_promoted_to_a_mesh',
    origin: 'a full-frame mesh is a full-frame canvas that can never dirty-skip',
    expect: 'A14_NO_FULL_FRAME_MESH',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        // Already covered: A14 recognises the base plate structurally (its mesh
        // spans the stage), so "base is never a mesh" needed a MUTANT, not a new
        // assertion. The compiler refuses it too, which is why this has to be
        // forged in the artifact to be tested at all.
        const stage = (j as any).bones.findIndex((b: any) => b.name === 'stage');
        const halfW = (j as any).skeleton.width / 2;
        const halfH = (j as any).skeleton.height / 2;
        (j as any).skins[0].attachments.stage['00_stage'] = {
          type: 'mesh',
          uvs: [0, 0, 1, 0, 1, 1, 0, 1],
          triangles: [0, 1, 2, 0, 2, 3],
          vertices: [
            1, stage, -halfW, halfH, 1,
            1, stage, halfW, halfH, 1,
            1, stage, halfW, -halfH, 1,
            1, stage, -halfW, -halfH, 1,
          ],
          hull: 4,
          width: (j as any).skeleton.width,
          height: (j as any).skeleton.height,
        };
      }),
    }),
  },
  {
    name: 'M25_travel_key_carries_a_screen_space_y',
    origin: "a generator's `x: 30, y: 8` pairs, which is why its animation could not move to another cut",
    expect: 'A24_AXIS_SPACE_STROKE',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        // Loads clean, animates, and looks right on THIS cut. It is wrong only in
        // the sense that the direction is now half in the keys and half in the
        // axis bone, so the next cut inherits a lie.
        (j as any).animations.advance_slow.bones.plunger.translate[1].y = 8;
      }),
    }),
  },
  {
    name: 'M26_axis_bone_is_animated',
    origin: 'the axis angle is the one per-cut SETUP value; animating it swings the whole formation',
    expect: 'A24_AXIS_SPACE_STROKE',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).animations.idle.bones.axis = { rotate: [{ time: 0, value: 3 }] };
      }),
    }),
  },
  {
    name: 'M27_emitter_reparented_under_the_moving_part',
    origin: 'what the emitter released gets dragged left and right with every stroke',
    expect: 'A25_DETACHED_BONE_PARENTAGE',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).bones.find((b: any) => b.name === 'emitter').parent = 'plunger';
      }),
    }),
  },
  {
    name: 'M28_occluder_drawn_before_the_moving_part',
    origin: 'the entry point only reads as covered while the occluder is drawn in front of it',
    expect: 'A26_SLOT_DRAW_ORDER',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        const slots = (j as any).slots;
        const collar = slots.findIndex((s: any) => s.name === 'collar');
        const plunger = slots.findIndex((s: any) => s.name === 'plunger');
        slots.splice(plunger, 0, slots.splice(collar, 1)[0]);
      }),
    }),
  },
  {
    name: 'M29_region_name_diverges_from_its_page_filename',
    origin: 'attachment = region = filename is the runtime join key, and a break makes the slot vanish silently',
    expect: 'A27_REGION_NAME_MATCHES_PAGE_FILENAME',
    mutate: (a) => ({
      // Renamed on BOTH sides, so the attachment still resolves and A08 stays
      // green. That is the hole: the first two links of the chain agreed with
      // each other while pointing at a file called something else.
      atlasText: a.atlasText.replace('\n05_pool\n', '\n05_pool_typo\n'),
      skeletonText: editJson(a.skeletonText, (j) => {
        const atts = (j as any).skins[0].attachments.pool;
        atts['05_pool_typo'] = atts['05_pool'];
        delete atts['05_pool'];
      }),
    }),
  },
  {
    name: 'M30_ribbon_row_weights_diverge',
    origin: 'a strip changes length without changing width',
    expect: 'A28_RIBBON_ROWS_SHARE_WEIGHTS',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        // The first blended vertex is one side of row 1: [2, b0, x, y, w0, b1, x,
        // y, w1]. Re-splitting it 50/50 keeps the sum at 1, so A20 has nothing to
        // say and the strip quietly develops a taper that grows with its travel.
        const mesh = (j as any).skins[0].attachments.trail['03_trail'];
        const run = firstBlendedRun(mesh.vertices);
        mesh.vertices[run + 4] = 0.5;
        mesh.vertices[run + 8] = 0.5;
      }),
    }),
  },
  {
    name: 'M31_ribbon_entry_row_rides_the_chain',
    origin: 'a ribbon may move its tip, never its entry: that row is where the strip joins what it comes out of',
    expect: 'A21_MESH_RIM_PINNED',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        const mesh = (j as any).skins[0].attachments.trail['03_trail'];
        mesh.vertices[weightRuns(mesh.vertices)[0] + 1] = (j as any).bones.findIndex((b: any) => b.name === 'trail_c');
      }),
    }),
  },
  {
    name: 'M44_one_mesh_slot_past_the_declared_budget',
    origin:
      'the budget is the RIG\'s (`invariants.meshTriangles` / `meshSlots`), not the validator\'s — so this mutant is what keeps the reading of it honest after the numbers stopped being constants',
    expect: 'A13_MESH_BUDGET',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        // A fourth mesh slot, small enough that A14 has nothing to say and
        // weighted correctly so A20 has nothing to say either. The only thing
        // wrong with it is that the rig budgeted three.
        const rim = (j as any).bones.findIndex((b: any) => b.name === 'rim');
        (j as any).skins[0].attachments.pool['05_pool'] = {
          type: 'mesh',
          uvs: [0, 0, 1, 0, 1, 1, 0, 1],
          triangles: [0, 1, 2, 0, 2, 3],
          vertices: [1, rim, -20, 10, 1, 1, rim, 20, 10, 1, 1, rim, 20, -10, 1, 1, rim, -20, -10, 1],
          hull: 4,
          width: 40,
          height: 20,
        };
      }),
    }),
  },
  {
    name: 'M32_travel_drives_past_the_contact_point',
    origin: 'inward travel goes at most until the moving mass touches the part that occludes it',
    expect: 'A29_STROKE_WITHIN_CONTACT_DEPTH',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        // +10px on the deepest key. Loads, plays, and renders two plates passing
        // through each other; nothing in the file has an opinion about it. The
        // fixture's deepest key is 57 against a contact depth of 66, so +10 is the
        // smallest whole-pixel edit that crosses the line and +9 is not.
        const keys = (j as any).animations.advance_fast.bones.plunger.translate;
        keys[1].x += 10;
      }),
    }),
  },
];
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
const CONTAINED_MUTANTS: Mutant[] = [
  {
    name: 'M33_travel_drives_past_the_containment_ceiling',
    origin: 'past the containment window the leading contour is drawn where the art says it is covered',
    expect: 'A30_STROKE_WITHIN_CAP_CONTAINMENT',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        // The fixture's deepest key is 54 against a ceiling of 96, so +43 is the
        // smallest whole-pixel edit that crosses it and +42 is not. Loads, plays,
        // and renders the part outside the cover that should have hidden it.
        const keys = (j as any).animations.advance_fast.bones.plunger.translate;
        keys[1].x += 43;
      }),
    }),
  },
  {
    name: 'M34_squash_key_invalidates_the_measured_ceiling',
    origin:
      'the ceiling was measured by TRANSLATING the plate; a scaled plate changes the contour the measurement was about',
    expect: 'A30_STROKE_WITHIN_CAP_CONTAINMENT',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        // Copied verbatim from the articulated fixture's own advance_slow, where
        // it is correct. That is the point: this is the tempting edit, not an
        // absurd one, and it silently takes the rig outside the evidence for its
        // only ceiling.
        (j as any).animations.advance_slow.bones.plunger.scale = [
          { time: 0, x: 1, y: 1 },
          { time: 0.2, x: 1.04, y: 0.97 },
          { time: 0.8, x: 1, y: 1 },
        ];
      }),
    }),
  },
  {
    name: 'M35_slot_keeps_the_manifest_name',
    origin:
      'the manifest calls it `shroud` and the rig calls it `collar`; the emitted name is the join key and a mismatch makes the slot vanish with no error',
    expect: 'A26_SLOT_DRAW_ORDER',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        const slots = (j as any).slots;
        slots.find((s: any) => s.name === 'collar').name = 'shroud';
        const atts = (j as any).skins[0].attachments;
        atts.shroud = atts.collar;
        delete atts.collar;
      }),
    }),
  },
];
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// `rigc diff` — the same discipline, applied to a comparison instead of a gate
// ---------------------------------------------------------------------------
//
// A gate is proved by making it go red; a MEASURE is proved by making it move,
// and by making the measures beside it stay still. A comparison tool whose
// numbers all wobble together tells you a rig is wrong without telling you
// where, which is the same as telling you nothing — so each case below states
// the exact set of measures its edit may disturb, and the assertion is on the
// whole set, not on membership.
//
// The fixture is a Spine example rather than one of our cuts on purpose: the
// point of `diff` is comparing against editor output, and a fixture that only
// ever sees rigc's own emitter would let a whole-format blind spot survive.
// `examples/` is gitignored, so it may be absent — and then these cases say so
// loudly instead of quietly not running.

const DIFF_FIXTURE = resolve(import.meta.dir, 'examples/3-timing-and-spacing/export/3-timing-and-spacing-ess.json');

interface DiffCase {
  name: string;
  why: string;
  /** Every NAME-MATCHED measure id this edit must move — exactly, no more and no fewer. */
  expect: string[];
  /**
   * The same, for the name-agnostic reports under `bones` and `slots`. Pinned
   * on every case rather than only the ones about naming: those figures are
   * what a reader is now shown beside the section mean, and a figure nothing
   * asserts on is a figure that can quietly stop moving.
   */
  expectAgnostic: string[];
  mutate: (skeleton: Record<string, unknown>) => void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Rename every bone and slot, and every reference to one, leaving the shape alone. */
function renameEverything(j: any): void {
  const boneName = (n: string): string => `b_${n}`;
  const slotName = (n: string): string => `s_${n}`;
  for (const b of j.bones) {
    if (b.parent !== undefined) b.parent = boneName(b.parent);
    b.name = boneName(b.name);
  }
  for (const s of j.slots) {
    s.bone = boneName(s.bone);
    s.name = slotName(s.name);
  }
  for (const skin of j.skins) {
    skin.attachments = Object.fromEntries(
      Object.entries(skin.attachments).map(([slot, atts]) => [slotName(slot), atts]),
    );
  }
  for (const anim of Object.values(j.animations) as any[]) {
    if (anim.bones) anim.bones = Object.fromEntries(Object.entries(anim.bones).map(([n, t]) => [boneName(n), t]));
    if (anim.slots) anim.slots = Object.fromEntries(Object.entries(anim.slots).map(([n, t]) => [slotName(n), t]));
  }
}

const DIFF_CASES: DiffCase[] = [
  {
    name: 'D01_drop_a_bone',
    why: 'the whole bones section moves and nothing else does — a slot still names the bone it named, so the NAME-MATCHED binding figure is untouched and stays diagnostic. Name-agnostically the binding IS broken, because the bone is gone: the two reports disagree here on purpose, and that is what they are for',
    expect: [
      'bones.count',
      'bones.names',
      'bones.parent_by_name',
      'bones.order',
      'bones.length_present',
      'bones.inherit_present',
      'bones.depth_histogram',
      'bones.degree_sequence',
    ],
    expectAgnostic: [
      'bones.agnostic.count',
      'bones.agnostic.depth_histogram',
      'bones.agnostic.degree_sequence',
      'bones.agnostic.shape_histogram',
      'bones.agnostic.order_shape',
      'slots.agnostic.bone_binding_shape',
      'slots.agnostic.order_shape',
    ],
    mutate: (j) => {
      (j as any).bones = (j as any).bones.filter((b: any) => b.name !== 'square');
    },
  },
  {
    name: 'D02_reorder_two_slots',
    why: 'the slots array IS the draw order, so this is a real defect — and it must move ONLY the order measure, or "wrong z-order" and "wrong rig" would read the same. Nothing agnostic moves: these two slots draw the same kind of attachment off the same shape of bone, so without their names they are the same slot and a swap is not observable. That is the measure the name-matched half exists to carry',
    expect: ['slots.order'],
    expectAgnostic: [],
    mutate: (j) => {
      const slots = (j as any).slots;
      (j as any).slots = [slots[1], slots[0], ...slots.slice(2)];
    },
  },
  {
    name: 'D03_remove_an_animation',
    why: 'every animation measure that can see a missing animation moves; event_keys does not, because neither side has events and a vacuous measure must not manufacture a gap. The skeleton is untouched, so no bone or slot figure moves in either report',
    expect: [
      'animations.count',
      'animations.names',
      'animations.duration',
      'animations.timeline_kinds',
      'animations.key_counts',
      'animations.curve_kinds',
      'animations.draw_order',
      'animations.deform',
    ],
    expectAgnostic: [],
    mutate: (j) => {
      delete (j as any).animations.light;
    },
  },
  {
    name: 'D04_change_a_curve_kind',
    why: 'one bezier becomes stepped: same timelines, same key count, same duration. Only the curve histogram may notice, and that is the measure that carries timing quality',
    expect: ['animations.curve_kinds'],
    expectAgnostic: [],
    mutate: (j) => {
      const keys = (j as any).animations.heavy.bones.bone.rotate;
      const at = keys.findIndex((k: any) => Array.isArray(k.curve));
      if (at < 0) throw new Error('fixture has no bezier key on heavy.bones.bone.rotate');
      keys[at].curve = 'stepped';
    },
  },
  {
    name: 'D05_rename_every_bone_and_slot',
    why: 'the case issue #21 was filed about: the same rig with its own vocabulary. Every name-keyed measure floors — including `attachments.names`, whose key embeds the slot name — and the name-agnostic reports stay at 1.000 throughout, because not one of their measures consults a name. A reader shown only the section mean would call this rig a total failure; shown the pair, they read "right shape, different words"',
    expect: [
      'bones.names',
      'bones.parent_by_name',
      'bones.order',
      'bones.length_present',
      'bones.inherit_present',
      'slots.names',
      'slots.order',
      'slots.bone',
      'slots.attachment',
      'slots.blend',
      'slots.color_present',
      'attachments.names',
    ],
    expectAgnostic: [],
    mutate: (j) => renameEverything(j),
  },
  {
    name: 'D06_reparent_a_bone',
    why: 'the negative control for D05: a real structural defect, made under the SAME names, so the name-agnostic figures have to move on their own. Without this, "agnostic stays 1.000" in D05 would be indistinguishable from an agnostic report that can never move at all. `bones.names`, `bones.order` and `slots.bone` are untouched — the vocabulary is intact and only the tree changed',
    expect: ['bones.parent_by_name', 'bones.depth_histogram', 'bones.degree_sequence'],
    expectAgnostic: [
      'bones.agnostic.depth_histogram',
      'bones.agnostic.degree_sequence',
      'bones.agnostic.shape_histogram',
      'bones.agnostic.order_shape',
      'slots.agnostic.bone_binding_shape',
      'slots.agnostic.order_shape',
    ],
    mutate: (j) => {
      const bone = (j as any).bones.find((b: any) => b.name === 'bone');
      if (!bone || bone.parent !== 'root') throw new Error('fixture bone `bone` is not a child of `root`');
      bone.parent = 'square';
    },
  },
  {
    name: 'D07_resize_a_region',
    why: 'what replaced `region_size_present` (issue #28). The old measure asked whether a size was STATED, was keyed by name, and so reported the naming gap a third time — D05 above would have moved it. This one asks how big the region is, name-agnostically, so D05 leaves it alone and an actual size difference moves it and nothing else',
    expect: ['attachments.region_size'],
    expectAgnostic: [],
    mutate: (j) => {
      const att = (j as any).skins[0].attachments.square.square;
      if (typeof att.width !== 'number') throw new Error('fixture region `square` states no width');
      att.width += 41;
    },
  },
];
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Returns the number of failures, or `null` when the fixture is not on disk. */
function runDiffSuite(): number | null {
  if (!existsSync(DIFF_FIXTURE)) {
    console.log('\n── rigc diff ──');
    console.log('  SKIP  the diff self-checks did not run: no example corpus on disk.');
    console.log(`          expected ${DIFF_FIXTURE}`);
    console.log('          run `bun run fetch-examples` and re-run this suite.');
    console.log('          ⚠️ This is a HOLE in this run, not a pass — `rigc diff` was not exercised at all.');
    return null;
  }
  console.log('\n── rigc diff (fixture: 3-timing-and-spacing-ess) ──');
  const text = readFileSync(DIFF_FIXTURE, 'utf8');
  const reference: Record<string, unknown> = JSON.parse(text);
  let bad = 0;

  // Positive control. `diff X X` has to be 1.000 on every measure, or every
  // number below it is being read against a baseline that is not zero.
  const identity = diffSkeletons(JSON.parse(text), reference);
  const drift = movedMeasures(identity);
  if (drift.length === 0) {
    const measures = identity.sections.reduce((n, sec) => n + sec.measures.length, 0);
    console.log(`  PASS  CONTROL_DIFF_OF_A_FILE_WITH_ITSELF_IS_ONE  (${measures} measures, all 1.000)`);
  } else {
    bad++;
    console.log(`  FAIL  CONTROL_DIFF_OF_A_FILE_WITH_ITSELF_IS_ONE: [${drift.join(', ')}] are below 1.000`);
  }

  // Second positive control, for the half the one above cannot see: the
  // name-agnostic reports have to exist and have to be 1.000 on identity too. A
  // section that quietly stopped emitting one would still pass the control
  // above, because a report with no measures has nothing below 1.000 in it.
  const split = identity.sections.filter((s) => s.nameAgnostic !== undefined);
  const agnosticDrift = movedAgnosticMeasures(identity);
  const agnosticCount = split.reduce((n, s) => n + (s.nameAgnostic?.measures.length ?? 0), 0);
  if (split.length === 2 && agnosticCount === 9 && agnosticDrift.length === 0) {
    console.log(
      `  PASS  CONTROL_NAME_AGNOSTIC_REPORTS_EXIST_AND_ARE_ONE  (${split.map((s) => s.name).join(', ')}; ${agnosticCount} measures, all 1.000)`,
    );
  } else {
    bad++;
    console.log(
      `  FAIL  CONTROL_NAME_AGNOSTIC_REPORTS_EXIST_AND_ARE_ONE: sections [${split.map((s) => s.name).join(', ')}] ` +
        `carrying ${agnosticCount} measure(s); below 1.000: [${agnosticDrift.join(', ')}]  ` +
        '(want: bones and slots, 9 measures, none below 1.000)',
    );
  }

  for (const c of DIFF_CASES) {
    const candidate: Record<string, unknown> = JSON.parse(text);
    c.mutate(candidate);
    const report = diffSkeletons(candidate, reference);
    const moved = movedMeasures(report);
    const movedAgnostic = movedAgnosticMeasures(report);
    const want = [...c.expect].sort().join(', ');
    const got = [...moved].sort().join(', ');
    const wantAgnostic = [...c.expectAgnostic].sort().join(', ');
    const gotAgnostic = [...movedAgnostic].sort().join(', ');
    if (want === got && wantAgnostic === gotAgnostic) {
      console.log(
        `  PASS  ${c.name}  (moved exactly ${moved.length} name-matched, ${movedAgnostic.length} name-agnostic measure(s))`,
      );
      console.log(`          ${c.why}`);
    } else {
      bad++;
      console.log(`  FAIL  ${c.name}`);
      if (want !== got) {
        console.log(`          name-matched expected to move: [${want}]`);
        console.log(`          name-matched actually moved:   [${got}]`);
      }
      if (wantAgnostic !== gotAgnostic) {
        console.log(`          name-agnostic expected to move: [${wantAgnostic}]`);
        console.log(`          name-agnostic actually moved:   [${gotAgnostic}]`);
      }
    }
  }
  return bad;
}

// ---------------------------------------------------------------------------
// `rigc check` — the instrument for the thing the gate cannot see
// ---------------------------------------------------------------------------
//
// The validator has no opinion about whether an animation is the RIGHT
// animation: three honest ladder runs produced zero FAILs between them, and one
// of them shipped a build with every easing reversed and came back green. `check`
// is what closes that, so it needs the same discipline as every other measure
// here — a positive control that says "right rig, nothing to report", and a
// negative control that makes it fire.
//
// The pair below is deliberately the same rig twice. `bench/transcriptions/` is a
// mechanical transcription of rung 3's export, so it scores 1.000 structurally;
// reversing its key times leaves the structure untouched — same timelines, same
// key count, same duration — and changes only what the shot LOOKS like. A tool
// that can tell those two apart is measuring motion and not structure, and that
// is the whole claim.
//
// ⚠️ The faithful control is not zero, and the reason is worth knowing before
// reading its threshold. The reference frames were rendered from the example's
// own packed atlas page, which ships at `scale: 0.5` — half resolution — while a
// rigc rig is compiled from the loose full-size PNGs beside it. Identical
// skeleton data, different pixels. The geometry agreement is exact to well under
// a pixel, which is what the drift threshold asserts; the residual colour
// difference is the resampling and nothing else.

/** Transparent columns C03 adds to each side of every plate. */
const FRAMING_PAD = 20;
/** How far C03 lets a number move before the framing is calling it a difference. */
const FRAMING_TOLERANCE = 0.1;
/** The whole-rig scale C04 asks the framing report to name. */
const FRAMING_SCALE = 1.02;
/** How far C05 lets the automatic framing differ from pinning the same box by hand. */
const DECLARED_MAE_TOLERANCE = 0.01;
/** The whole-rig translation C06 asks `check` to refuse the declared box for. */
const FRAMING_MOVE = 300;
/** The ONE-shot translation C07 offsets `light` by, in the rig's own units (~35 px). */
const SHOT_OFFSET = 300;
/** How far C07 lets the untouched shot's MAE move when another shot is offset. */
const SCOPE_TOLERANCE = 0.01;
/** How far C07 needs a SHARED framing to move it, for the per-shot claim to mean anything. */
const SCOPE_MOVE = 10;
/** How far past its own art C08 scales the one sprite it bloats. */
const OVERDRAW_SCALE = 8;
/** How faint C08 leaves that sprite — the defect's shape is large AND mostly transparent. */
const OVERDRAW_ALPHA = 0.1;
/** How far C09 lets a faithful transcription's two MAE figures differ. */
const DENOMINATOR_TOLERANCE = 0.05;
/** How far C10 moves ONE of the fixture's two chains, in the rig's own units (~25 px). */
const CHAIN_OFFSET = 150;
/** How many times the offset chain's own per-pixel error must beat the untouched one's, in C10. */
const CHAIN_BLAME_RATIO = 5;
/** How far apart C10 lets the same two chains sit when NOTHING is offset. */
const CHAIN_AGREE_RATIO = 1.5;
/** How far the offset chain's worst drift must travel for C10 to call it named. */
const CHAIN_OFFSET_DRIFT = 10;
/** The drift every chain of a faithful transcription must stay under, in frame pixels (C10, C11). */
const CHAIN_FLOOR_DRIFT = 1;
/** How far above its set's own reference-denominator MAE C11 lets any one chain sit. */
const CHAIN_FLOOR_RATIO = 1.25;
/** The share C11 lets a faithful build leave unattributed to any chain. */
const CHAIN_UNATTRIBUTED_TOLERANCE = 0.01;
/**
 * How far C12 displaces ONE part of the fixture, in the rig's own units (~1 px).
 *
 * Small on purpose. What C12 needs is a silhouette that DIFFERS — which is what
 * pulls the best fit of two extents away from the best alignment of two pictures
 * — and not a candidate that is grossly wrong: a monster fixture would make the
 * pass fire for reasons that have nothing to do with the floor being measured.
 */
const REFINE_PART_OFFSET = 20;
/** How far C13 pins the box off the frames' own, in frame pixels. */
const REFINE_PIN_PIXELS = 2;
/** How exactly re-measuring at the refined box must reproduce the search's figure. */
const REFINE_REPORT_TOLERANCE = 0.01;
/** Which rung-3 set C14 and C15 rebuild as a stills-plus-sheet frame set. */
const SHEET_SET = 'heavy';
/** The long side of one tile in that fixture's sheet, in pixels. */
const SHEET_FIXTURE_TILE = 64;
/** The rule between its tiles, and the colour its frame numbers are burned in. */
const SHEET_FIXTURE_RULE: RGBA = [176, 176, 176, 255];
const SHEET_FIXTURE_LABEL: RGBA = [96, 96, 96, 255];
/** How far C14's mutant pushes the middle of the shot, in the rig's own units. */
const SHEET_BUMP = 300;
/** The floor a faithful candidate must read on the sheet it was rendered into. */
const SHEET_FLOOR_MAE = 1;
/** How far C14 lets the two committed stills move when only the middle is wrong. */
const SHEET_STILLS_TOLERANCE = 0.01;
/** ...and how much worse the sheet has to read for the hole to count as closed. */
const SHEET_LOUD_MAE = 10;
/** The width C15 adds to a sheet so its dimensions are not a grid of these tiles. */
const SHEET_STRAY_COLUMN = 1;

const CHECK_TRANSCRIPTION = resolve(import.meta.dir, 'bench/transcriptions/3-timing-and-spacing');
const CHECK_FRAMES = resolve(import.meta.dir, 'bench/reference/3-timing-and-spacing');
const CHECK_IMAGES = resolve(import.meta.dir, 'examples/3-timing-and-spacing/images');

/** Compile the rung-3 transcription, optionally against a rewritten motion spec. */
function compileTranscription(
  motionText: string | null,
  imagesDir = CHECK_IMAGES,
): { skeletonText: string; atlasText: string; atlasDir: string } {
  const outDir = mkdtempSync(join(tmpdir(), 'rigc-check-'));
  let motionPath = join(CHECK_TRANSCRIPTION, '3-timing-and-spacing-ess.motion.json');
  if (motionText !== null) {
    motionPath = join(outDir, 'rewritten.motion.json');
    writeFileSync(motionPath, motionText);
  }
  const result = compile({
    rigPath: join(CHECK_TRANSCRIPTION, '3-timing-and-spacing-ess.rig.json'),
    motionPath,
    outDir,
    imagesDir,
  });
  return { skeletonText: result.skeletonText, atlasText: result.atlasText, atlasDir: outDir };
}

/**
 * The example art again, with `pad` transparent columns added on the left and the
 * right of every plate.
 *
 * Left AND right, in equal measure, because that is what leaves the artwork where
 * it was: a region attachment is centred on its own image, so padding one side
 * moves the art and padding both does not. What it does move is every quad corner,
 * outwards, into transparency — which is exactly the thing the old framing was
 * measuring and the new one is not.
 */
function padImagesSideways(pad: number): string {
  const outDir = mkdtempSync(join(tmpdir(), 'rigc-padded-'));
  mkdirSync(outDir, { recursive: true });
  for (const name of readdirSync(CHECK_IMAGES)) {
    if (!name.endsWith('.png')) continue;
    const source = readPlate(join(CHECK_IMAGES, name));
    const padded = new Plate(source.width + pad * 2, source.height);
    for (let y = 0; y < source.height; y++) {
      for (let x = 0; x < source.width; x++) padded.set(x + pad, y, source.get(x, y));
    }
    padded.writePng(join(outDir, basename(name)));
  }
  return outDir;
}

/**
 * The same skeleton with everything under a bone that scales it by `factor`.
 *
 * A whole-rig scale is not an error — a rig is authored in its own coordinates and
 * `check` is built to be blind to the choice of units — so this exists to prove
 * where it DOES surface: the framing report's world-unit line, and nowhere else.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function scaleWholeRig(skeletonText: string, factor: number, boneName = 'rigc-selftest-scale'): string {
  const skeleton = JSON.parse(skeletonText);
  const bones = skeleton.bones as any[];
  for (const bone of bones) {
    if (bone.parent === undefined) bone.parent = boneName;
  }
  bones.unshift({ name: boneName, scaleX: factor, scaleY: factor });
  return `${JSON.stringify(skeleton, null, 2)}\n`;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * The same skeleton with everything under a bone that moves it by `dx, dy`.
 *
 * The negative control for the declared-box framing (C06). A rig that draws the
 * same picture somewhere else in the world is the ordinary case — an author cannot
 * see the reference's origin and has no way to land on it — so `check` must refuse
 * `frames.json`'s box for it and fit one instead. Without this, "the box was used"
 * in C05 would be indistinguishable from "the box is always used".
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function moveWholeRig(skeletonText: string, dx: number, dy: number, boneName = 'rigc-selftest-move'): string {
  const skeleton = JSON.parse(skeletonText);
  const bones = skeleton.bones as any[];
  for (const bone of bones) {
    if (bone.parent === undefined) bone.parent = boneName;
  }
  bones.unshift({ name: boneName, x: dx, y: dy });
  return `${JSON.stringify(skeleton, null, 2)}\n`;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * The same skeleton with ONE slot's attachment scaled far past its own art, and
 * that slot left mostly transparent.
 *
 * The defect C08 reproduces (issue #119), in the two parts that make it work.
 * **Large** puts the sprite's pixels where the reference has none, which is what
 * grows the union `mae` divides by. **Mostly transparent** is what makes those
 * pixels *cheap*: each one still clears the content threshold, so it counts in
 * the denominator, while contributing far less than the shot's own error to the
 * numerator. Do only the first and the mean rises, which is the tool working;
 * do both and the mean falls on a candidate that got worse, which is the hole.
 *
 * It is not a hypothetical shape. spineboy-2's muzzle flare — a faint flash drawn
 * over the barrel — walked its own scale to 13x under an optimiser doing exactly
 * this, and took every set in that run's framing with it.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function bloatOneSlot(skeletonText: string, slot: string, factor: number, alpha: number): string {
  const skeleton = JSON.parse(skeletonText);
  for (const skin of skeleton.skins as any[]) {
    for (const attachment of Object.values(skin.attachments?.[slot] ?? {}) as any[]) {
      attachment.scaleX = (attachment.scaleX ?? 1) * factor;
      attachment.scaleY = (attachment.scaleY ?? 1) * factor;
    }
  }
  const hex = Math.round(alpha * 255).toString(16).padStart(2, '0');
  for (const entry of skeleton.slots as any[]) if (entry.name === slot) entry.color = `ffffff${hex}`;
  return `${JSON.stringify(skeleton, null, 2)}\n`;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * The same motion, played backwards: `t -> duration - t`, keys reversed.
 *
 * Every raw `curve` is dropped with them, because those control points are
 * absolute `(time, value)` pairs and reversing the times would leave them
 * pointing at moments that no longer exist. What is left is the same set of poses
 * in the opposite order — legal, compilable, gate-green, and not the shot.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function reverseMotionTimes(text: string): string {
  const motion = JSON.parse(text);
  for (const animation of Object.values(motion.animations) as any[]) {
    const duration: number = animation.duration;
    for (const track of animation.tracks as any[]) {
      track.keys = (track.keys as any[])
        .map((key: any) => ({ t: Number((duration - key.t).toFixed(7)), v: key.v }))
        .reverse();
    }
  }
  return `${JSON.stringify(motion, null, 2)}\n`;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * The world box `frames.json` records for the rung-3 frames.
 *
 * The suite may read it; `check` reading it is the point of C05. It is what
 * `--viewport` would be handed by an author following
 * [`docs/AUTHORING.md`](docs/AUTHORING.md) §9's second case, and C05 asserts that
 * the tool now reaches the same place without being told.
 */
function sidecarViewport(): { x: number; y: number; width: number; height: number } {
  const sidecar: unknown = JSON.parse(readFileSync(join(CHECK_FRAMES, 'frames.json'), 'utf8'));
  const { x, y, width, height } = (sidecar as { viewport: { x: number; y: number; width: number; height: number } })
    .viewport;
  return { x, y, width, height };
}

/** The figures a check control asserts on, across every animation in the set. */
function checkExtremes(report: CheckReport): {
  meanMae: number;
  refMae: number;
  frameMae: number;
  drift: number;
  drawn: number;
  sets: number;
} {
  let meanMae = 0;
  let refMae = 0;
  let frameMae = 0;
  let drift = 0;
  let drawn = 0;
  for (const anim of report.animations) {
    meanMae = Math.max(meanMae, anim.meanMae);
    refMae = Math.max(refMae, anim.meanMaeReference);
    frameMae = Math.max(frameMae, anim.meanMaeFrame);
    drift = Math.max(drift, anim.worstDrift);
    drawn = Math.max(drawn, anim.compared === 0 ? 0 : anim.drawnRatio);
  }
  return { meanMae, refMae, frameMae, drift, drawn, sets: report.animations.length };
}

/** How many sets of a report printed the overdraw warning. */
function overdrawWarnings(report: CheckReport): number {
  return checkLines(report).filter((line) => line.includes('⚠️ overdraw:')).length;
}

/** Every set that was actually compared — each carries its own framing since #100. */
function comparedSets(report: CheckReport): AnimationCheck[] {
  return report.animations.filter((a) => a.compared > 0);
}

/**
 * Did EVERY compared set reach this framing?
 *
 * The report's top-level framing fields are `null` under the default per-shot
 * scope with more than one set, and rightly: there is no single answer then. So a
 * control that used to read one field now asks the stronger question, which is
 * also the one it always meant — *did every set land here?*
 */
function framedBy(report: CheckReport, how: FramingHow, source: FramingSource): boolean {
  const sets = comparedSets(report);
  return sets.length > 0 && sets.every((a) => a.framing === how && a.framingFit?.source === source);
}

/** One compared set's MAE by directory name. */
function maeOf(report: CheckReport, dir: string): number | null {
  return report.animations.find((a) => a.dir === dir)?.meanMae ?? null;
}

/** Every compared set's row for one chain, by the name `src/chains.ts` gives it. */
function chainRows(report: CheckReport, chain: string): ChainCheck[] {
  return comparedSets(report)
    .map((anim) => anim.chains.find((row) => row.chain === chain))
    .filter((row): row is ChainCheck => row !== undefined);
}

/** The widest reading one chain gives anywhere in a report, on either measure. */
function chainWorst(report: CheckReport, chain: string): { mae: number; drift: number } {
  let mae = 0;
  let drift = 0;
  for (const row of chainRows(report, chain)) {
    mae = Math.max(mae, row.mae);
    drift = Math.max(drift, row.worstDrift);
  }
  return { mae, drift };
}

/**
 * The same skeleton with ONE chain moved, by moving the bone it hangs from.
 *
 * The fixture's two drawn parts sit on two bones under one root, which
 * `src/chains.ts` cuts into two chains — so moving one bone moves exactly one
 * chain and leaves the other where it was. That is the shape C10 needs: an error
 * with a known owner, in a report that has to name the owner and not its
 * neighbour.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function offsetOneChain(skeletonText: string, boneName: string, dx: number, dy: number): string {
  const skeleton = JSON.parse(skeletonText);
  let found = false;
  for (const bone of skeleton.bones as any[]) {
    if (bone.name !== boneName) continue;
    bone.x = (bone.x ?? 0) + dx;
    bone.y = (bone.y ?? 0) + dy;
    found = true;
  }
  if (!found) throw new Error(`selftest: no bone "${boneName}" to offset`);
  return `${JSON.stringify(skeleton, null, 2)}\n`;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * The same motion spec with ONE animation moved bodily, by a translate track on
 * the root bone that holds one value for the whole shot.
 *
 * A whole-rig move (`moveWholeRig`) moves every shot and is the ordinary case that
 * the framing exists to absorb. This moves one shot and leaves the others where
 * they were, which is the case a SHARED framing cannot absorb: there is no one
 * similarity that puts both on the reference.
 */
function offsetOneAnimation(motionText: string, name: string, dx: number, dy: number): string {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const spec = JSON.parse(motionText);
  const anim = spec.animations[name] as any;
  anim.tracks.push({
    bone: 'root',
    property: 'translate',
    keys: [
      { t: 0, v: [dx, dy] },
      { t: anim.duration, v: [dx, dy] },
    ],
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return `${JSON.stringify(spec, null, 2)}\n`;
}

/**
 * The same motion spec with ONE animation pushed away in the MIDDLE and left where
 * it was at both ends.
 *
 * The defect a stills-plus-sheet frame set hides by construction (C14): the two
 * committed frames are the two this leaves alone, so every number computed from
 * files on disk is right and every tile between them is wrong.
 */
function bumpMiddleOfAnimation(motionText: string, name: string, dx: number): string {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const spec = JSON.parse(motionText);
  const anim = spec.animations[name] as any;
  anim.tracks.push({
    bone: 'root',
    property: 'translate',
    keys: [
      { t: 0, v: [0, 0] },
      { t: anim.duration / 2, v: [dx, 0] },
      { t: anim.duration, v: [0, 0] },
    ],
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return `${JSON.stringify(spec, null, 2)}\n`;
}

/**
 * A frame set of the shape issue #36 is about: two stills on disk, and a contact
 * sheet holding every sampled frame.
 *
 * ⚠️ Built here rather than fetched, because no committed set the check suite uses
 * has that shape — rung 3 ships every frame — and a control for a sheet needs a
 * sheet whose contents are known. The two stills are the corpus's own PNGs,
 * unmodified; the sheet is rendered from the faithful candidate at the tile scale,
 * which is what `bench/render_reference.ts` does with the reference and what makes
 * the faithful reading a floor rather than a number nobody can predict.
 *
 * `padWidth` adds that many pixels of width to the sheet, which is how C15 asks for
 * a sheet whose dimensions are not a grid of this many tiles.
 */
function buildSheetFixture(
  artifacts: { skeletonText: string; atlasText: string; atlasDir: string },
  setDir: string,
  padWidth = 0,
): string {
  const sidecar: unknown = JSON.parse(readFileSync(join(CHECK_FRAMES, FRAMES_SIDECAR), 'utf8'));
  const source = sidecar as {
    spec: string;
    background: RGBA;
    viewport: { x: number; y: number; width: number; height: number; scale: number; pixelWidth: number; pixelHeight: number };
    sets: Array<{ dir: string; animation: string | null; fps: number; sampled: number; written: number; stride: number; duration: number }>;
  };
  const set = source.sets.find((s) => s.dir === setDir);
  if (!set) throw new Error(`selftest: no set ${JSON.stringify(setDir)} in ${CHECK_FRAMES}/${FRAMES_SIDECAR}`);
  const root = mkdtempSync(join(tmpdir(), 'rigc-sheet-'));
  mkdirSync(join(root, setDir), { recursive: true });

  // The first and last frames, from the corpus, untouched.
  const stills = [0, set.sampled - 1];
  for (const index of stills) {
    const name = `f${String(index).padStart(4, '0')}.png`;
    copyFileSync(join(CHECK_FRAMES, setDir, name), join(root, setDir, name));
  }
  writeFileSync(
    join(root, FRAMES_SIDECAR),
    `${JSON.stringify(
      { ...source, sets: [{ ...set, written: stills.length, stride: set.sampled }] },
      null,
      2,
    )}\n`,
  );

  // ...and the sheet, at the tile scale, laid out the way the frame-set contract says.
  const v = source.viewport;
  const posable = posableFromText(artifacts.skeletonText, artifacts.atlasText, artifacts.atlasDir);
  const frames = sampleAnimation(posable.data, set.animation as string, set.fps).slice(0, set.sampled);
  const tileScale = SHEET_FIXTURE_TILE / Math.max(v.pixelWidth, v.pixelHeight);
  const tileW = Math.max(1, Math.round(v.pixelWidth * tileScale));
  const tileH = Math.max(1, Math.round(v.pixelHeight * tileScale));
  const columns = Math.min(SHEET_COLUMNS, frames.length);
  const rows = Math.ceil(frames.length / columns);
  const sheet = new Plate(
    columns * (tileW + SHEET_GAP) + SHEET_GAP + padWidth,
    rows * (tileH + SHEET_GAP) + SHEET_GAP,
  );
  fill(sheet, SHEET_FIXTURE_RULE);
  const tileViewport = viewportOfSize(v.x, v.y, v.width, v.height, v.scale * tileScale, tileW, tileH);
  frames.forEach((frame, index) => {
    const tile = renderFrame(frame, posable.pages, tileViewport, source.background);
    tile.text(String(index), 2, 2, 1, SHEET_FIXTURE_LABEL);
    const ox = SHEET_GAP + (index % columns) * (tileW + SHEET_GAP);
    const oy = SHEET_GAP + Math.floor(index / columns) * (tileH + SHEET_GAP);
    for (let y = 0; y < tileH; y++) for (let x = 0; x < tileW; x++) sheet.set(ox + x, oy + y, tile.get(x, y));
  });
  sheet.writePng(join(root, setDir, SHEET_FILE));
  return root;
}

/** Returns the number of failures, or `null` when the example corpus is absent. */
function runCheckSuite(): number | null {
  console.log('\n── rigc check (fixture: the rung 3 transcription vs rung 3 reference frames) ──');
  if (!existsSync(CHECK_IMAGES) || !existsSync(join(CHECK_FRAMES, 'frames.json'))) {
    console.log('  SKIP  the check self-checks did not run.');
    console.log(`          expected art at   ${CHECK_IMAGES}`);
    console.log(`          expected frames at ${CHECK_FRAMES}/frames.json`);
    console.log('          run `bun run fetch-examples`, then `bun bench/render_reference.ts --rung 3`.');
    console.log('          ⚠️ This is a HOLE in this run, not a pass — `rigc check` was not exercised at all.');
    return null;
  }
  let bad = 0;

  // --- the honesty invariant, made to refuse ------------------------------
  // `check` reading the reference skeleton would silently convert every future
  // ladder run from authoring into transcription, so the guard that stops it
  // gets a negative control like any other gate.
  const refusals: Array<{ what: string; path: string }> = [
    { what: 'a reference skeleton beside the frames', path: join(CHECK_FRAMES, '3-timing-and-spacing-ess.json') },
    { what: 'anything at all outside --frames', path: resolve(import.meta.dir, 'examples/3-timing-and-spacing/export/3-timing-and-spacing-ess.json') },
    { what: 'the licence text the frames ship with', path: join(CHECK_FRAMES, 'license.txt') },
  ];
  const accepted = { what: 'a frame', path: join(CHECK_FRAMES, 'heavy', 'f0000.png') };
  const refused: string[] = [];
  for (const { what, path } of refusals) {
    try {
      assertFrameReadable(CHECK_FRAMES, path);
    } catch {
      refused.push(what);
    }
  }
  let acceptsFrames = true;
  try {
    assertFrameReadable(CHECK_FRAMES, accepted.path);
  } catch {
    acceptsFrames = false;
  }
  if (refused.length === refusals.length && acceptsFrames) {
    console.log(`  PASS  C00_CHECK_READS_FRAMES_AND_NOTHING_ELSE  (refused ${refused.length}, accepted a .png)`);
    console.log('          origin: the ladder honesty rule is the only thing that makes a rung number mean anything');
  } else {
    bad++;
    console.log(
      `  FAIL  C00_CHECK_READS_FRAMES_AND_NOTHING_ELSE: refused ${refused.length}/${refusals.length}` +
        `${acceptsFrames ? '' : ', and it also refused a real frame'}`,
    );
  }

  // --- positive control ---------------------------------------------------
  const faithful = compileTranscription(null);
  const faithfulReport = checkAgainstFrames({ ...faithful, framesDir: CHECK_FRAMES });
  const f = checkExtremes(faithfulReport);
  // Sub-pixel geometry and a colour residual that is only the atlas resampling.
  const faithfulOk = f.sets === 2 && f.drift < 1 && f.frameMae < 0.5 && f.meanMae < 10;
  if (faithfulOk) {
    console.log(
      `  PASS  C01_A_FAITHFUL_TRANSCRIPTION_HAS_NOTHING_TO_REPORT  ` +
        `(worst slot drift ${f.drift.toFixed(2)}px, whole-frame MAE ${f.frameMae.toFixed(3)}, union MAE ${f.meanMae.toFixed(2)})`,
    );
    console.log('          origin: a comparison tool that cannot recognise a right answer is reporting noise');
  } else {
    bad++;
    console.log(
      `  FAIL  C01_A_FAITHFUL_TRANSCRIPTION_HAS_NOTHING_TO_REPORT: ${f.sets} set(s), drift ${f.drift.toFixed(2)}px, ` +
        `whole-frame MAE ${f.frameMae.toFixed(3)}, union MAE ${f.meanMae.toFixed(2)}`,
    );
  }

  // --- negative control ---------------------------------------------------
  const reversedText = reverseMotionTimes(
    readFileSync(join(CHECK_TRANSCRIPTION, '3-timing-and-spacing-ess.motion.json'), 'utf8'),
  );
  const reversed = compileTranscription(reversedText);
  // The gate has to be green on it, or the control proves nothing about the
  // gate's blindness — that blindness is the reason `check` exists.
  const gate = validate({
    skeletonText: reversed.skeletonText,
    atlasText: reversed.atlasText,
    atlasDir: reversed.atlasDir,
    profile: 'spine',
  });
  const reversedReport = checkAgainstFrames({ ...reversed, framesDir: CHECK_FRAMES });
  const r = checkExtremes(reversedReport);
  const reversedOk = gate.failures.length === 0 && r.drift > 10 && r.meanMae > f.meanMae * 3;
  if (reversedOk) {
    console.log(
      `  PASS  C02_A_TIME_REVERSED_MOTION_IS_LOUD  ` +
        `(gate green, worst slot drift ${r.drift.toFixed(1)}px vs ${f.drift.toFixed(2)}px, union MAE ` +
        `${r.meanMae.toFixed(1)} vs ${f.meanMae.toFixed(1)})`,
    );
    console.log('          origin: rung 1 shipped a build with every easing reversed and the validator passed it green');
  } else {
    bad++;
    console.log(
      `  FAIL  C02_A_TIME_REVERSED_MOTION_IS_LOUD: gate ${gate.failures.length} FAIL(s), drift ${r.drift.toFixed(1)}px, ` +
        `union MAE ${r.meanMae.toFixed(1)} against a faithful ${f.meanMae.toFixed(1)}`,
    );
  }

  // --- framing: an invisible margin must not move a single number ----------
  // The defect this closes (issue #34): the candidate used to be framed by the
  // union of its posed QUAD CORNERS, and a region's quad runs past its own artwork
  // wherever the art is transparent. So art with a wider transparent margin framed
  // itself differently and every pixel below moved — rung 5 measured MAE 39.00
  // where the right answer was 4.35, with no key changed. Padding both sides of
  // every plate leaves the picture pixel-identical and the quad corners 20 px out,
  // so a framing that reads pixels reports the same numbers and one that reads
  // corners cannot.
  const paddedImages = padImagesSideways(FRAMING_PAD);
  const padded = compileTranscription(null, paddedImages);
  const p = checkExtremes(checkAgainstFrames({ ...padded, framesDir: CHECK_FRAMES }));
  const maeMoved = Math.abs(p.meanMae - f.meanMae);
  const driftMoved = Math.abs(p.drift - f.drift);
  const paddedOk = p.sets === f.sets && maeMoved <= FRAMING_TOLERANCE && driftMoved <= FRAMING_TOLERANCE;
  if (paddedOk) {
    console.log(
      `  PASS  C03_A_TRANSPARENT_MARGIN_DOES_NOT_MOVE_THE_FRAMING  ` +
        `(+${FRAMING_PAD}px each side: MAE ${p.meanMae.toFixed(2)} vs ${f.meanMae.toFixed(2)}, drift ` +
        `${p.drift.toFixed(2)}px vs ${f.drift.toFixed(2)}px)`,
    );
    console.log('          origin: quad corners sit where no pixel is, and they used to set the scale for a whole run');
  } else {
    bad++;
    console.log(
      `  FAIL  C03_A_TRANSPARENT_MARGIN_DOES_NOT_MOVE_THE_FRAMING: MAE moved ${maeMoved.toFixed(2)} ` +
        `(${f.meanMae.toFixed(2)} -> ${p.meanMae.toFixed(2)}), drift moved ${driftMoved.toFixed(2)}px ` +
        `(${f.drift.toFixed(2)} -> ${p.drift.toFixed(2)}), tolerance ${FRAMING_TOLERANCE}`,
    );
  }

  // --- the same rig in its own coordinates: moved, and scaled --------------
  // Two variants of the fixture that differ from it only in where and in what
  // units it was authored — which is the ordinary case, and the one the ladder's
  // honesty rule guarantees, because the reference's origin and units are in the
  // file the author is not allowed to open. Both are compiled here because C04 and
  // C06 need each other's: `check` frames both of them by FITTING, so they are
  // each other's like-for-like baseline, while the untouched fixture is now framed
  // by the frames' own declared box (C05) and is not.
  const moved = compileTranscription(null);
  const movedReport = checkAgainstFrames({
    ...moved,
    skeletonText: moveWholeRig(moved.skeletonText, FRAMING_MOVE, FRAMING_MOVE),
    framesDir: CHECK_FRAMES,
  });
  const m = checkExtremes(movedReport);
  const scaledReport = checkAgainstFrames({
    ...faithful,
    skeletonText: scaleWholeRig(faithful.skeletonText, FRAMING_SCALE),
    framesDir: CHECK_FRAMES,
  });
  const scaled = checkExtremes(scaledReport);

  // --- framing: a scale difference is REPORTED, not absorbed in silence ----
  // A whole-rig scale is not an error, and the framing corrects it on purpose: a
  // candidate is authored in its own coordinates and no comparison of pictures may
  // depend on the units it chose. The claim under test is the other half of that —
  // that the correction is *visible*. It lands in the framing report's world-unit
  // line, and it does NOT land in the MAE, where it would read as bad animation.
  //
  // ⚠️ The MAE half is measured against the MOVED rig, not the untouched one, and
  // the reason is issue #52. Both of these are framed by a fit, which has a floor
  // of about 0.1 px; the untouched fixture is framed by the box `frames.json`
  // records, which has none, and on this shot that difference is worth about 0.9
  // MAE all by itself. Comparing the scaled rig against the untouched one would
  // therefore be measuring the framing PATH and calling it the scale. Against
  // another rig in its own coordinates the claim is exact, and it is the claim: the
  // MAE must not depend on the coordinates a rig was authored in.
  const units = comparedSets(scaledReport)[0]?.framingFit?.units ?? null;
  const baseline = comparedSets(faithfulReport)[0]?.framingFit?.units ?? null;
  const reported = units === null ? 0 : units.ratio;
  const reportedOk =
    units !== null &&
    baseline !== null &&
    Math.abs(reported - FRAMING_SCALE) <= 0.004 &&
    Math.abs(baseline.ratio - 1) <= 0.004 &&
    framedBy(scaledReport, 'candidate-pixels', 'derived') &&
    Math.abs(scaled.meanMae - m.meanMae) <= FRAMING_TOLERANCE;
  if (reportedOk) {
    console.log(
      `  PASS  C04_A_SCALE_DIFFERENCE_IS_REPORTED_NOT_HIDDEN  ` +
        `(x${FRAMING_SCALE} rig reads x${reported.toFixed(4)} in units against a faithful ` +
        `x${(baseline as { ratio: number }).ratio.toFixed(4)}, MAE ${scaled.meanMae.toFixed(2)} against ` +
        `${m.meanMae.toFixed(2)} for the same rig merely moved)`,
    );
    console.log('          origin: a framing that silently absorbs a scale reports it as motion instead');
  } else {
    bad++;
    console.log(
      `  FAIL  C04_A_SCALE_DIFFERENCE_IS_REPORTED_NOT_HIDDEN: units ratio ${reported.toFixed(4)} ` +
        `(faithful ${(baseline?.ratio ?? 0).toFixed(4)}) for a x${FRAMING_SCALE} rig framed by ` +
        `${JSON.stringify(comparedSets(scaledReport).map((a) => a.framing))}, MAE ${scaled.meanMae.toFixed(2)} ` +
        `against a moved ${m.meanMae.toFixed(2)}`,
    );
  }

  // --- framing: the frames' own box is used when the candidate lands in it ---
  // Issue #52. The fit is an estimate of where the frames were drawn and it has a
  // floor — it registers EXTENT, so a silhouette that differs anywhere pulls the
  // best fit away from the best alignment. `frames.json` records the box the frames
  // were actually drawn at, which is not an estimate of anything. So a candidate
  // whose own pixels are measured to land in that box is framed by it, and the
  // claim under test is that doing so is worth exactly what pinning it by hand is
  // worth: rung 6 read 8.73 fitted against 3.50 pinned, and an author had no way to
  // tell "my keys are wrong" from "the fit did not finish" without running both.
  const pinned = checkAgainstFrames({ ...faithful, framesDir: CHECK_FRAMES, viewport: sidecarViewport() });
  const p2 = checkExtremes(pinned);
  const declaredGap = Math.abs(f.meanMae - p2.meanMae);
  const declaredOk = framedBy(faithfulReport, 'frames-viewport', 'declared') && declaredGap <= DECLARED_MAE_TOLERANCE;
  if (declaredOk) {
    console.log(
      `  PASS  C05_A_CANDIDATE_IN_THE_FRAMES_COORDINATES_IS_FRAMED_BY_THEIR_BOX  ` +
        `(unpinned MAE ${f.meanMae.toFixed(2)} against ${p2.meanMae.toFixed(2)} pinned to the same box)`,
    );
    console.log('          origin: rung 6 read 8.73 fitted and 3.50 pinned, and the report could not say which was the shot');
  } else {
    bad++;
    console.log(
      `  FAIL  C05_A_CANDIDATE_IN_THE_FRAMES_COORDINATES_IS_FRAMED_BY_THEIR_BOX: framing ` +
        `${JSON.stringify(comparedSets(faithfulReport).map((a) => `${a.dir}:${a.framing}/${a.framingFit?.source ?? null}`))}, ` +
        `unpinned MAE ${f.meanMae.toFixed(2)} against ${p2.meanMae.toFixed(2)} pinned, tolerance ${DECLARED_MAE_TOLERANCE}`,
    );
  }

  // --- and refused for a candidate that is somewhere else -------------------
  // The negative control for C05. Under the ladder's honesty rule an author cannot
  // see the reference's origin, so the ordinary candidate draws the same picture in
  // its own place — and pinning THAT to the frames' box would report a rig that is
  // right as catastrophically wrong (rung 3's own candidate reads MAE 146 there).
  const movedOk = framedBy(movedReport, 'candidate-pixels', 'derived') && m.drift < 1 && m.meanMae < 10;
  if (movedOk) {
    console.log(
      `  PASS  C06_A_CANDIDATE_IN_ITS_OWN_COORDINATES_IS_NOT_PINNED_TO_THEIRS  ` +
        `(+${FRAMING_MOVE} units: fitted, drift ${m.drift.toFixed(2)}px, union MAE ${m.meanMae.toFixed(2)})`,
    );
    console.log('          origin: the reference\'s origin is in the file the author is not allowed to open');
  } else {
    bad++;
    console.log(
      `  FAIL  C06_A_CANDIDATE_IN_ITS_OWN_COORDINATES_IS_NOT_PINNED_TO_THEIRS: framing ` +
        `${JSON.stringify(comparedSets(movedReport).map((a) => `${a.dir}:${a.framing}/${a.framingFit?.source ?? null}`))}, ` +
        `drift ${m.drift.toFixed(2)}px, union MAE ${m.meanMae.toFixed(2)}`,
    );
  }

  // --- framing scope: one bad shot may not move a good one -------------------
  // Issue #100, and it is a pair rather than one assertion. The claim is that a
  // per-shot framing keeps each set's numbers its own; the control that makes the
  // claim mean anything is the SAME candidate under `--framing shared`, where the
  // offset shot must visibly wreck the other one. Without that half, "the good
  // shot did not move" would be indistinguishable from a report that cannot move.
  //
  // Measured on the spineboy rung, this is worth 15-25 MAE on a real character:
  // `idle` read 18.77 on its own frames and 41.59 under one framing fitted over
  // all 147, with not one key different. Here it is worth about 108.
  const offset = compileTranscription(
    offsetOneAnimation(readFileSync(join(CHECK_TRANSCRIPTION, '3-timing-and-spacing-ess.motion.json'), 'utf8'), 'light', SHOT_OFFSET, 0),
  );
  const perShot = checkAgainstFrames({ ...offset, framesDir: CHECK_FRAMES });
  const shared = checkAgainstFrames({ ...offset, framesDir: CHECK_FRAMES, framing: 'shared' });
  const baselineHeavy = maeOf(faithfulReport, 'heavy');
  const perShotHeavy = maeOf(perShot, 'heavy');
  const sharedHeavy = maeOf(shared, 'heavy');
  const scopeOk =
    baselineHeavy !== null &&
    perShotHeavy !== null &&
    sharedHeavy !== null &&
    perShot.framingScope === 'per-shot' &&
    perShot.viewport === null &&
    perShot.sharedFraming !== null &&
    Math.abs(perShotHeavy - baselineHeavy) <= SCOPE_TOLERANCE &&
    sharedHeavy - baselineHeavy > SCOPE_MOVE;
  if (scopeOk) {
    console.log(
      `  PASS  C07_ONE_OFFSET_SHOT_DOES_NOT_MOVE_ANOTHER_SHOTS_NUMBERS  ` +
        `("light" moved +${SHOT_OFFSET} units: "heavy" reads ${(perShotHeavy as number).toFixed(2)} per shot against an ` +
        `untouched ${(baselineHeavy as number).toFixed(2)}, and ${(sharedHeavy as number).toFixed(2)} under --framing shared)`,
    );
    console.log(
      '          origin: a whole-root run fitted one framing over every set, so the spineboy rung read its best shot ' +
        'as if it were its worst — idle 41.59 shared against 18.77 on its own frames (issue #100)',
    );
  } else {
    bad++;
    console.log(
      `  FAIL  C07_ONE_OFFSET_SHOT_DOES_NOT_MOVE_ANOTHER_SHOTS_NUMBERS: "heavy" reads ` +
        `${perShotHeavy?.toFixed(2) ?? 'n/a'} per shot against an untouched ${baselineHeavy?.toFixed(2) ?? 'n/a'} ` +
        `(tolerance ${SCOPE_TOLERANCE}) and ${sharedHeavy?.toFixed(2) ?? 'n/a'} shared (needs +${SCOPE_MOVE}); ` +
        `scope ${perShot.framingScope}, one box ${JSON.stringify(perShot.viewport)}`,
    );
  }

  // --- the union denominator is the candidate's to grow, and it says so --------
  // Issue #119. `mae` divides by the pixels EITHER side drew, so a candidate can
  // lower it by drawing more — and the run that found this had an optimiser walk a
  // muzzle flare's scale to 13x doing precisely that. The control is the same
  // reversed rig from C02 with one sprite blown up and left mostly transparent,
  // and it makes both halves of the claim at once: the union figure must FALL on a
  // build that got worse, and the figure over the reference's own drawn pixels —
  // a denominator the candidate does not own — must RISE. A control that only
  // checked the second would pass on a tool that had merely got noisier.
  const bloatedReport = checkAgainstFrames({
    ...reversed,
    skeletonText: bloatOneSlot(reversed.skeletonText, 'square', OVERDRAW_SCALE, OVERDRAW_ALPHA),
    framesDir: CHECK_FRAMES,
  });
  const b = checkExtremes(bloatedReport);
  const bloatedWarnings = overdrawWarnings(bloatedReport);
  const overdrawOk =
    b.sets === r.sets &&
    b.meanMae < r.meanMae &&
    b.refMae > r.refMae &&
    b.drawn > OVERDRAW_RATIO &&
    bloatedWarnings === comparedSets(bloatedReport).length;
  if (overdrawOk) {
    console.log(
      `  PASS  C08_GROWING_THE_UNION_IS_CHEAP_IN_THE_MEAN_AND_THE_REPORT_SAYS_SO  ` +
        `(one sprite x${OVERDRAW_SCALE} at ${OVERDRAW_ALPHA} alpha: union MAE ${b.meanMae.toFixed(2)} DOWN from ` +
        `${r.meanMae.toFixed(2)}, over the reference's pixels ${b.refMae.toFixed(2)} UP from ${r.refMae.toFixed(2)}, ` +
        `${b.drawn.toFixed(1)}x the reference's ink, warned on ${bloatedWarnings} set(s))`,
    );
    console.log(
      '          origin: a union-mean objective is minimised by making the union bigger — spineboy-2 walked a muzzle ' +
        'flare to 13x and cost every set in the run its framing (issue #119)',
    );
  } else {
    bad++;
    console.log(
      `  FAIL  C08_GROWING_THE_UNION_IS_CHEAP_IN_THE_MEAN_AND_THE_REPORT_SAYS_SO: union MAE ${b.meanMae.toFixed(2)} ` +
        `against a reversed ${r.meanMae.toFixed(2)} (needs to FALL), over the reference's pixels ${b.refMae.toFixed(2)} ` +
        `against ${r.refMae.toFixed(2)} (needs to RISE), ${b.drawn.toFixed(2)}x the reference's ink ` +
        `(needs > ${OVERDRAW_RATIO}), warned on ${bloatedWarnings} of ${comparedSets(bloatedReport).length} set(s)`,
    );
  }

  // --- and it stays quiet on a candidate that is not overdrawing ---------------
  // The negative control for C08, and it has two halves because the warning has
  // two ways to be useless. A faithful transcription draws what the reference
  // draws, so its two MAE figures are over the same pixels and must agree — that
  // is the shape of "nothing to report". The reversed rig is the sharper half: its
  // ink is RIGHT and its timing is wrong, it reads 100+ MAE, and it must still not
  // be called overdraw. Without it, "the warning fired on the bloated rig" would be
  // indistinguishable from a warning that fires on anything that scores badly.
  const faithfulWarnings = overdrawWarnings(faithfulReport);
  const reversedWarnings = overdrawWarnings(reversedReport);
  const denominatorGap = Math.abs(f.meanMae - f.refMae);
  const quietOk =
    faithfulWarnings === 0 &&
    reversedWarnings === 0 &&
    r.drawn < OVERDRAW_RATIO &&
    denominatorGap <= DENOMINATOR_TOLERANCE;
  if (quietOk) {
    console.log(
      `  PASS  C09_A_FAITHFUL_TRANSCRIPTION_IS_NOT_CALLED_OVERDRAW  ` +
        `(faithful: union ${f.meanMae.toFixed(2)} and over the reference's pixels ${f.refMae.toFixed(2)}, the same ` +
        `pixels either way; time-reversed at ${r.meanMae.toFixed(1)} MAE draws ${r.drawn.toFixed(2)}x and is also quiet)`,
    );
    console.log('          origin: a guard that fires on every bad score names nothing — the diagnosis has to be overdraw');
  } else {
    bad++;
    console.log(
      `  FAIL  C09_A_FAITHFUL_TRANSCRIPTION_IS_NOT_CALLED_OVERDRAW: ${faithfulWarnings} warning(s) on the faithful ` +
        `build and ${reversedWarnings} on the time-reversed one (both need 0), reversed draws ${r.drawn.toFixed(2)}x ` +
        `(needs < ${OVERDRAW_RATIO}), faithful union ${f.meanMae.toFixed(2)} against ${f.refMae.toFixed(2)} over the ` +
        `reference's pixels (gap ${denominatorGap.toFixed(3)}, tolerance ${DENOMINATOR_TOLERANCE})`,
    );
  }

  // --- the chain dashboard: the error is charged to the chain it is in ---------
  // Issue #123. One number per shot hides where a many-joint figure fails, so
  // `check` splits each set by the CANDIDATE's own bone chains. The claim under
  // test is the only one that matters for a dashboard — that the split NAMES the
  // unit at fault — and it needs both halves to mean anything: the two chains
  // must agree when nothing is wrong, and one of them must carry the error when
  // one of them is moved. A table that always blamed the same chain would pass the
  // second half on its own.
  //
  // Measured through a PINNED viewport, and that is the point rather than a
  // convenience: an unpinned framing absorbs part of a one-chain offset by moving
  // the whole rig, which is `fitFraming` doing its job and would leave this
  // control measuring the framing instead of the attribution. C05 already
  // established that pinning this fixture's own box costs nothing.
  const chainBase = checkAgainstFrames({ ...faithful, framesDir: CHECK_FRAMES, viewport: sidecarViewport() });
  const chainMoved = checkAgainstFrames({
    ...faithful,
    skeletonText: offsetOneChain(faithful.skeletonText, 'square', CHAIN_OFFSET, CHAIN_OFFSET),
    framesDir: CHECK_FRAMES,
    viewport: sidecarViewport(),
  });
  const quiet = comparedSets(chainBase);
  const loud = comparedSets(chainMoved);
  // Per set, because a mean over sets would let one set's blame cover another's.
  const agreesWhenRight =
    quiet.length > 0 &&
    quiet.every((anim) => {
      const moved = anim.chains.find((row) => row.chain === 'square');
      const still = anim.chains.find((row) => row.chain === 'bone');
      if (!moved || !still || still.mae === 0) return false;
      const ratio = moved.mae / still.mae;
      return ratio <= CHAIN_AGREE_RATIO && ratio >= 1 / CHAIN_AGREE_RATIO;
    });
  const blamesTheOffsetOne =
    loud.length === quiet.length &&
    loud.length > 0 &&
    loud.every((anim) => {
      const moved = anim.chains.find((row) => row.chain === 'square');
      const still = anim.chains.find((row) => row.chain === 'bone');
      return moved !== undefined && still !== undefined && moved.mae >= still.mae * CHAIN_BLAME_RATIO;
    });
  const movedChain = chainWorst(chainMoved, 'square');
  const stillChain = chainWorst(chainMoved, 'bone');
  const attributionOk =
    agreesWhenRight &&
    blamesTheOffsetOne &&
    movedChain.drift >= CHAIN_OFFSET_DRIFT &&
    stillChain.drift < CHAIN_FLOOR_DRIFT &&
    chainWorst(chainBase, 'square').drift < CHAIN_FLOOR_DRIFT;
  if (attributionOk) {
    const worstRatio = Math.min(
      ...loud.map((anim) => {
        const moved = anim.chains.find((row) => row.chain === 'square') as ChainCheck;
        const still = anim.chains.find((row) => row.chain === 'bone') as ChainCheck;
        return moved.mae / still.mae;
      }),
    );
    console.log(
      `  PASS  C10_AN_OFFSET_CHAIN_IS_BLAMED_AND_ITS_NEIGHBOUR_IS_NOT  ` +
        `("square" moved +${CHAIN_OFFSET} units: its own error per pixel runs ${worstRatio.toFixed(1)}x the ` +
        `untouched chain's in every set, drift ${movedChain.drift.toFixed(1)} px against ` +
        `${stillChain.drift.toFixed(2)} px, and the two agree within ${CHAIN_AGREE_RATIO}x when nothing is moved)`,
    );
    console.log(
      "          origin: spineboy-2's verdict was one number per shot, and \"motion ✗\" over sixteen sets says " +
        'nothing about which limb to re-key (issue #123)',
    );
  } else {
    bad++;
    console.log(
      `  FAIL  C10_AN_OFFSET_CHAIN_IS_BLAMED_AND_ITS_NEIGHBOUR_IS_NOT: with "square" moved +${CHAIN_OFFSET} units ` +
        `it reads ${movedChain.mae.toFixed(2)} per pixel and drift ${movedChain.drift.toFixed(1)} px against the ` +
        `untouched chain's ${stillChain.mae.toFixed(2)} and ${stillChain.drift.toFixed(2)} px ` +
        `(needs ${CHAIN_BLAME_RATIO}x per set: ${blamesTheOffsetOne}; needs ${CHAIN_OFFSET_DRIFT} px of drift on ` +
        `the moved one and under ${CHAIN_FLOOR_DRIFT} px on the other), and untouched they agree within ` +
        `${CHAIN_AGREE_RATIO}x: ${agreesWhenRight}`,
    );
  }

  // --- and a faithful transcription puts every chain on the floor --------------
  // The negative control for C10, and the one that makes the dashboard readable:
  // if a chain of a rig that is RIGHT could read high, an author would have no way
  // to tell a chain worth re-keying from the tool's own noise. Three halves,
  // because there are three ways for the table to be useless — a chain that drifts
  // when nothing moved, a chain whose own error per pixel stands out from its
  // set's, and reference ink the split could not place at all.
  //
  // ⚠️ The count is asserted too. "Every chain is at the floor" is vacuously true
  // of a decomposition that produced one chain, which is exactly what a broken
  // derivation returns.
  const chainCounts = comparedSets(faithfulReport).map((anim) => anim.chains.length);
  const worstChainDrift = Math.max(
    0,
    ...comparedSets(faithfulReport).flatMap((anim) => anim.chains.map((row) => row.worstDrift)),
  );
  const worstChainRatio = Math.max(
    0,
    ...comparedSets(faithfulReport).flatMap((anim) =>
      anim.chains.map((row) => (anim.meanMaeReference === 0 ? 0 : row.mae / anim.meanMaeReference)),
    ),
  );
  const worstUnattributed = Math.max(
    0,
    ...comparedSets(faithfulReport).map((anim) =>
      anim.chainDenominator === 0 ? 0 : anim.unattributedError / anim.chainDenominator,
    ),
  );
  const floorOk =
    chainCounts.length > 0 &&
    chainCounts.every((count) => count >= 2) &&
    worstChainDrift < CHAIN_FLOOR_DRIFT &&
    worstChainRatio <= CHAIN_FLOOR_RATIO &&
    worstUnattributed <= CHAIN_UNATTRIBUTED_TOLERANCE;
  if (floorOk) {
    console.log(
      `  PASS  C11_A_FAITHFUL_TRANSCRIPTION_READS_FLAT_ACROSS_ITS_CHAINS  ` +
        `(${chainCounts.join('/')} chains a set: worst drift ${worstChainDrift.toFixed(2)} px, no chain above ` +
        `${worstChainRatio.toFixed(2)}x its set's own reference-denominator MAE, ` +
        `${(worstUnattributed * 100).toFixed(1)}% unattributed)`,
    );
    console.log('          origin: a dashboard whose floor is not flat cannot tell a limb worth re-keying from its own noise');
  } else {
    bad++;
    console.log(
      `  FAIL  C11_A_FAITHFUL_TRANSCRIPTION_READS_FLAT_ACROSS_ITS_CHAINS: ${JSON.stringify(chainCounts)} chain(s) a ` +
        `set (each needs 2+), worst chain drift ${worstChainDrift.toFixed(2)} px (needs < ${CHAIN_FLOOR_DRIFT}), ` +
        `worst chain ${worstChainRatio.toFixed(2)}x its set's MAE (needs <= ${CHAIN_FLOOR_RATIO}), ` +
        `${(worstUnattributed * 100).toFixed(1)}% unattributed (needs <= ` +
        `${(CHAIN_UNATTRIBUTED_TOLERANCE * 100).toFixed(1)}%)`,
    );
  }

  // --- the contact sheet: the frames a set does not commit as files -----------
  // Issue #36. A long shot commits two stills and folds every sampled frame into
  // one `contact.png`, and `check` used to compare the two stills and say so — an
  // honest `2 compared` with nothing measured about the other 309 frames. The
  // fixture builds exactly that shape: a frame set with the FIRST and LAST frames
  // on disk and a sheet holding all 65, and a candidate whose defect is entirely
  // in between.
  //
  // The mutant is the one the hole was hiding: a track that leaves both ends where
  // the reference has them and pushes the middle of the shot away. Its two stills
  // are right, so the frame table cannot see it; every tile between them is wrong.
  // Three assertions, and the first is what makes the other two mean anything:
  //
  //   * the FAITHFUL candidate reads a floor on the sheet — if the grid were
  //     misread by a pixel, or the burned-in frame number counted as a difference,
  //     nothing here would read a floor at all;
  //   * the mutant's committed stills read the same as the faithful ones;
  //   * and its sheet reads many times worse, with the worst tile in the middle.
  const sheetFrames = buildSheetFixture(faithful, SHEET_SET);
  const sheetFaithful = checkAgainstFrames({ ...faithful, framesDir: sheetFrames });
  const bumped = compileTranscription(
    bumpMiddleOfAnimation(
      readFileSync(join(CHECK_TRANSCRIPTION, '3-timing-and-spacing-ess.motion.json'), 'utf8'),
      SHEET_SET,
      SHEET_BUMP,
    ),
  );
  const sheetBumped = checkAgainstFrames({ ...bumped, framesDir: sheetFrames });
  const goodSheet = comparedSets(sheetFaithful)[0]?.sheet ?? null;
  const badSheet = comparedSets(sheetBumped)[0]?.sheet ?? null;
  const goodStills = comparedSets(sheetFaithful)[0]?.meanMae ?? null;
  const badStills = comparedSets(sheetBumped)[0]?.meanMae ?? null;
  const middle = badSheet === null ? -1 : badSheet.worstTile / Math.max(1, badSheet.tiles - 1);
  const sheetOk =
    goodSheet !== null &&
    badSheet !== null &&
    goodStills !== null &&
    badStills !== null &&
    // The stills are two of 65, and both of them are frames the mutant leaves alone.
    comparedSets(sheetFaithful)[0]?.compared === 2 &&
    goodSheet.compared === goodSheet.tiles &&
    goodSheet.tiles > 2 &&
    goodSheet.meanMae < SHEET_FLOOR_MAE &&
    Math.abs(badStills - goodStills) <= SHEET_STILLS_TOLERANCE &&
    badSheet.meanMae > goodSheet.meanMae + SHEET_LOUD_MAE &&
    middle > 0.25 &&
    middle < 0.75;
  if (sheetOk) {
    console.log(
      `  PASS  C14_A_DEFECT_BETWEEN_THE_STILLS_IS_LOUD_ON_THE_SHEET  ` +
        `(${goodSheet.tiles} tiles at ${goodSheet.tileWidth}x${goodSheet.tileHeight}px: faithful ` +
        `${goodSheet.meanMae.toFixed(2)}, a mid-shot push ${badSheet.meanMae.toFixed(2)} worst at ` +
        `f${String(badSheet.worstTile).padStart(4, '0')} — while the two committed stills read ` +
        `${(badStills as number).toFixed(2)} against ${(goodStills as number).toFixed(2)})`,
    );
    console.log(
      '          origin: rung 2 ships 2 of 311 frames per shot, so a clean `2 compared` table said nothing about ' +
        'the shot (issue #36)',
    );
  } else {
    bad++;
    console.log(
      `  FAIL  C14_A_DEFECT_BETWEEN_THE_STILLS_IS_LOUD_ON_THE_SHEET: faithful sheet ${JSON.stringify(goodSheet)}, ` +
        `mutant sheet ${JSON.stringify(badSheet)}, stills ${goodStills?.toFixed(2) ?? 'n/a'} against ` +
        `${badStills?.toFixed(2) ?? 'n/a'}, worst tile at ${(middle * 100).toFixed(0)}% of the shot`,
    );
  }

  // --- and a sheet that is not a grid of these frames is refused, by name ------
  // The negative control, and it guards the failure that would be worst: a grid
  // read wrong by one pixel puts every tile a little off its own frame and reports
  // the offset as motion, on every frame of the shot at once. So the geometry is
  // derived from the sheet's own dimensions and REFUSED when they are not a grid of
  // this many tiles at these frames' aspect — with the file named, because the
  // author's next move is to re-render the set.
  const strayFrames = buildSheetFixture(faithful, SHEET_SET, SHEET_STRAY_COLUMN);
  const strayReport = checkAgainstFrames({ ...faithful, framesDir: strayFrames });
  const strayAnim = comparedSets(strayReport)[0] ?? null;
  const strayOk =
    strayAnim !== null &&
    strayAnim.sheet === null &&
    strayAnim.compared === 2 &&
    strayAnim.notes.some((note) => note.includes(SHEET_FILE) && note.includes('not a grid'));
  if (strayOk) {
    console.log(
      `  PASS  C15_A_SHEET_THAT_IS_NOT_A_GRID_OF_THESE_FRAMES_IS_REFUSED  ` +
        `(+${SHEET_STRAY_COLUMN} px of width: no sheet figure, and the note names ${SHEET_FILE})`,
    );
    console.log(
      '          origin: a grid read wrong by a pixel reports a constant offset as motion on every frame of the shot',
    );
  } else {
    bad++;
    console.log(
      `  FAIL  C15_A_SHEET_THAT_IS_NOT_A_GRID_OF_THESE_FRAMES_IS_REFUSED: sheet ` +
        `${JSON.stringify(strayAnim?.sheet ?? null)}, notes ${JSON.stringify(strayAnim?.notes ?? [])}`,
    );
  }

  // --- the MAE-refined final pass: a constant pixel is not motion -------------
  // Issue #146. A settled extent fit can still leave a CONSTANT translation of a
  // pixel or two, and on a hard shot that constant is a tenth of the headline
  // figure — spineboy's `death` reads 54.31 at its fitted box and 48.47 one pixel
  // away, with the per-frame remainder an order of magnitude smaller. So the
  // framing gets one last pass that searches whole-pixel offsets against the
  // reported figure itself.
  //
  // The fixture is the faithful rig with ONE part displaced, which is the shape
  // that produces the defect: the fit registers extent, so a silhouette that
  // differs anywhere pulls the best fit of the extents away from the best
  // alignment of the pictures. Three numbers make the claim, and the third is why
  // this is a control rather than "a number went down":
  //
  //   * `before` — the figure at the fitted box, i.e. what this tool reported
  //     before this pass existed;
  //   * `after`  — the same figure with the best constant taken out;
  //   * `truth`  — the same candidate PINNED to the box `frames.json` records,
  //     which is where the frames were actually drawn and is not an estimate.
  //
  // A pass that merely lowered a number could move `after` anywhere. This one has
  // to move it TOWARDS `truth`, and at `truth` itself it has to find nothing —
  // otherwise what it is removing is the candidate's own displaced part rather
  // than the fit's floor.
  const displaced = compileTranscription(null);
  const displacedText = offsetOneChain(displaced.skeletonText, 'square', REFINE_PART_OFFSET, 0);
  const refinedReport = checkAgainstFrames({
    ...displaced,
    skeletonText: displacedText,
    framesDir: CHECK_FRAMES,
  });
  const truthReport = checkAgainstFrames({
    ...displaced,
    skeletonText: displacedText,
    framesDir: CHECK_FRAMES,
    viewport: sidecarViewport(),
  });
  const refinements = comparedSets(refinedReport).map((a) => a.framingFit?.refinement ?? null);
  const truthRefinements = comparedSets(truthReport).map((a) => a.framingFit?.refinement ?? null);
  const closer = comparedSets(refinedReport).map((anim, i) => {
    const r = refinements[i];
    const truth = comparedSets(truthReport)[i]?.meanMaeReference ?? null;
    if (!r || truth === null) return null;
    return { r, truth, gained: Math.abs(r.before - truth) - Math.abs(r.after - truth) };
  });
  const refinedOk =
    refinements.length > 0 &&
    framedBy(refinedReport, 'candidate-pixels', 'derived') &&
    refinements.every((r) => r !== null && r.applied && (r.dx !== 0 || r.dy !== 0) && r.after < r.before) &&
    closer.every((c) => c !== null && c.gained > 0) &&
    // ...and re-measuring at the box it chose reproduces what the search promised,
    // which is the property that lets a 25-offset search cost one render a frame.
    comparedSets(refinedReport).every(
      (anim, i) => Math.abs(anim.meanMaeReference - (refinements[i] as { after: number }).after) <= REFINE_REPORT_TOLERANCE,
    ) &&
    // At the box the frames were drawn at there is no constant left to take.
    truthRefinements.every((r) => r !== null && r.dx === 0 && r.dy === 0 && r.declined === 'identity');
  if (refinedOk) {
    const first = refinements[0] as { dx: number; dy: number; before: number; after: number };
    const truth = (closer[0] as { truth: number }).truth;
    console.log(
      `  PASS  C12_A_CONSTANT_FRAMING_PIXEL_IS_TAKEN_OUT_OF_THE_FIGURE  ` +
        `(one part +${REFINE_PART_OFFSET} units: refined by ${first.dx}, ${first.dy} px, ` +
        `${first.before.toFixed(2)} → ${first.after.toFixed(2)} against ${truth.toFixed(2)} at the frames' own box, ` +
        'which reports no constant of its own)',
    );
    console.log(
      "          origin: spineboy's `death` read 54.31 at a settled fit and 48.47 one pixel away, and a loop reads " +
        'that difference as motion (issue #146)',
    );
  } else {
    bad++;
    console.log(
      `  FAIL  C12_A_CONSTANT_FRAMING_PIXEL_IS_TAKEN_OUT_OF_THE_FIGURE: framing ` +
        `${JSON.stringify(comparedSets(refinedReport).map((a) => a.framing))}, refinements ` +
        `${JSON.stringify(refinements)}, closer-to-truth ${JSON.stringify(closer.map((c) => c?.gained ?? null))}, ` +
        `at the declared box ${JSON.stringify(truthRefinements.map((r) => r?.declined ?? null))}`,
    );
  }

  // --- and it invents no offset where there is none ---------------------------
  // The negative control for C12, in three halves, because there are three ways
  // for this pass to be worse than not having it. A faithful candidate framed by
  // the frames' own box must come back the exact identity — that is issue #146's
  // own `idle`-class control. The same rig moved BODILY must too, and that half is
  // the sharper one: its box is FITTED, so it proves the pass is not simply firing
  // wherever a fit was involved — a pure translation is the one thing the extent
  // fit recovers exactly, and there is nothing left for a constant to buy.
  //
  // The third half is the positive control for the search itself, without which
  // the two above would also pass on a pass that could not find anything at all:
  // the same faithful rig, PINNED two pixels off the box the frames were drawn at,
  // has to find those two pixels — and must still not apply them, because a pin is
  // the author's claim and nothing here overrides it.
  const declared = sidecarViewport();
  const declaredScale = comparedSets(faithfulReport)[0]?.viewport.scale ?? 0;
  const offBy = declaredScale > 0 ? REFINE_PIN_PIXELS / declaredScale : 0;
  const pinnedOff = checkAgainstFrames({
    ...faithful,
    framesDir: CHECK_FRAMES,
    viewport: { ...declared, x: declared.x - offBy },
  });
  const faithfulRefinements = comparedSets(faithfulReport).map((a) => a.framingFit?.refinement ?? null);
  const movedRefinements = comparedSets(movedReport).map((a) => a.framingFit?.refinement ?? null);
  const pinnedRefinements = comparedSets(pinnedOff).map((a) => a.framingFit?.refinement ?? null);
  const identityEverywhere = (
    rows: Array<{ dx: number; dy: number; declined: string | null } | null>,
  ): boolean => rows.length > 0 && rows.every((r) => r !== null && r.dx === 0 && r.dy === 0 && r.declined === 'identity');
  const inventsNothingOk =
    identityEverywhere(faithfulRefinements) &&
    identityEverywhere(movedRefinements) &&
    pinnedRefinements.length > 0 &&
    pinnedRefinements.every(
      // −2 and not +2: `projector` is px = (wx − minX)·k, so a box whose origin is
      // two pixels' worth of world to the LEFT draws its content two pixels to the
      // right, and the offset that would bring it back is negative. Asserting the
      // sign rather than the magnitude is what makes this control catch an
      // inversion in the search or in `shiftViewport`.
      (r) => r !== null && !r.applied && r.declined === 'pinned' && r.dx === -REFINE_PIN_PIXELS && r.dy === 0,
    );
  if (inventsNothingOk) {
    const found = pinnedRefinements[0] as { dx: number; dy: number; before: number; after: number };
    console.log(
      `  PASS  C13_THE_REFINED_PASS_INVENTS_NO_OFFSET  ` +
        `(faithful and +${FRAMING_MOVE}-units-moved both come back the exact identity; pinned ` +
        `${REFINE_PIN_PIXELS} px off, it finds ${found.dx}, ${found.dy} px — ${found.before.toFixed(2)} → ` +
        `${found.after.toFixed(2)} — and does not apply it)`,
    );
    console.log(
      '          origin: a framing pass that moves a right answer is worse than no pass at all, and a pin is a claim ' +
        'the tool does not overrule',
    );
  } else {
    bad++;
    console.log(
      `  FAIL  C13_THE_REFINED_PASS_INVENTS_NO_OFFSET: faithful ${JSON.stringify(faithfulRefinements)}, moved ` +
        `${JSON.stringify(movedRefinements)}, pinned ${REFINE_PIN_PIXELS} px off ${JSON.stringify(pinnedRefinements)}`,
    );
  }
  return bad;
}

// ---------------------------------------------------------------------------
// slot attribution — a reference blob is not a part
// ---------------------------------------------------------------------------
//
// `check`'s cheap matcher asks which connected component of the REFERENCE frame
// each of the candidate's slots landed on, and a component that holds two parts
// has a centroid that belongs to neither. Two tests guard that — the blob may not
// be much bigger than the slot, and its box may not be much wider — and issue #37
// filed the case that walks through both: rung 2's reference merges the course,
// the water, the panel and both rings into one blob in which the **course is 81 %
// of the ink**, so the blob is 1.24x the course's own and barely wider than its
// box. The summary line read `course drift 11.2 px` for a part whose own error per
// pixel was below the set's mean, and the drift was the distance from the course's
// centroid to a five-part blob's.
//
// ⚠️ These two controls draw their own reference frame instead of using the
// corpus, and that is the point: the defect is a property of the REFERENCE's
// labelling, so it needs a blob one part dominates, and no committed frame set
// that the check suite already uses has one. Drawn here, the whole thing is
// arithmetic — the true drift is zero by construction — and the suite still runs
// on a fresh clone with no art at all.

/** A part of the synthetic frame: where it is, and nothing about what it means. */
interface InkRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How dark a synthetic part is drawn — anything past `BACKGROUND_TOLERANCE` will do. */
const INK: RGBA = [16, 16, 16, 255];
/** The synthetic frame's size, in pixels. */
const SLOT_FRAME = { width: 64, height: 24 };
/**
 * The dominant part, and the small one the reference merges into it.
 *
 * Chosen so the blob passes **both** existing merge tests, which is what makes it
 * the case #37 filed rather than one already caught: 224 px against the small
 * part's 100 px is 1.45x (under `MERGE_RATIO`'s 1.6), and the blob's box is no
 * wider than the wide part's own, so the bounding-box test sees nothing either.
 * What it does move is the centroid, by several pixels, because the small part's
 * mass is all on one side.
 */
const SLOT_WIDE: InkRect = { x: 4, y: 4, width: 56, height: 4 };
const SLOT_SMALL: InkRect = { x: 4, y: 8, width: 20, height: 5 };
/** ...and where the small one goes when the two are meant to be separate blobs. */
const SLOT_SMALL_APART: InkRect = { x: 4, y: 14, width: 20, height: 5 };
/** How far a control lets a faithful component match sit from the truth, in pixels. */
const SLOT_TRUE_DRIFT = 0.01;
/** How big the fabricated drift has to be for S01's fixture to be worth asserting on. */
const SLOT_LIE_PIXELS = 1;

function drawInk(plate: Plate, rect: InkRect): void {
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) plate.set(x, y, INK);
  }
}

/** A frame with these parts drawn on the frames' own background. */
function inkFrame(rects: InkRect[]): Plate {
  const plate = new Plate(SLOT_FRAME.width, SLOT_FRAME.height);
  fill(plate, BACKGROUND);
  for (const rect of rects) drawInk(plate, rect);
  return plate;
}

/**
 * The footprint a candidate drawing exactly this part would have.
 *
 * Measured off a plate rather than written down, for the same reason no mutant in
 * this file hardcodes an offset: a footprint stated by hand is a second definition
 * of "where the ink is" that can drift from `frameGeometry`'s.
 */
function inkFootprint(rect: InkRect): Footprint {
  const plate = inkFrame([rect]);
  let pixels = 0;
  let sx = 0;
  let sy = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < plate.height; y++) {
    for (let x = 0; x < plate.width; x++) {
      if (!isContent(plate, x, y, BACKGROUND)) continue;
      pixels++;
      sx += x + 0.5;
      sy += y + 0.5;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (pixels === 0) return EMPTY_FOOTPRINT;
  return { pixels, cx: sx / pixels, cy: sy / pixels, minX, minY, maxX: maxX + 1, maxY: maxY + 1 };
}

function runSlotSuite(): number {
  console.log('\n── slot attribution (fixture: a two-part frame drawn here) ──');
  let bad = 0;
  const wide = inkFootprint(SLOT_WIDE);
  const small = inkFootprint(SLOT_SMALL);
  const apart = inkFootprint(SLOT_SMALL_APART);

  // --- the merged blob, with the dominant part in it --------------------------
  const merged = componentField(inkFrame([SLOT_WIDE, SLOT_SMALL]), BACKGROUND);
  // No SlotSource: the template fallback is the OTHER matcher and this control is
  // about what the component pass is willing to call a measurement.
  const mergedTracks = matchSlots(new Map([['wide', wide], ['small', small]]), merged, null).tracks;
  const wideTrack = mergedTracks.find((t) => t.slot === 'wide') ?? null;
  const blob = merged.components[0];
  // What the component pass WOULD have reported, derived rather than quoted: the
  // distance from the dominant part's own centroid to the blob's.
  const lie = blob === undefined ? 0 : Math.hypot(blob.cx - wide.cx, blob.cy - wide.cy);
  const oneBlob = merged.components.length === 1;
  const mergedOk =
    oneBlob &&
    lie > SLOT_LIE_PIXELS &&
    wideTrack !== null &&
    wideTrack.drift === null &&
    wideTrack.method === 'none' &&
    wideTrack.ambiguity !== null &&
    wideTrack.ambiguity.includes('"small"');
  if (mergedOk) {
    console.log(
      `  PASS  T01_A_BLOB_ITS_OWN_SLOT_DOMINATES_IS_STILL_A_BLOB  ` +
        `(${blob.pixels} px blob against the part's own ${Math.round(wide.pixels)} px — ` +
        `${(blob.pixels / wide.pixels).toFixed(2)}x, under the size test, and no wider than its box: reported as ` +
        `ambiguous rather than as the ${lie.toFixed(1)} px the centroids are apart)`,
    );
    console.log(
      '          origin: rung 2 read `course drift 11.2 px` off a blob holding the course, the water, the panel and ' +
        'both rings (issue #37)',
    );
  } else {
    bad++;
    console.log(
      `  FAIL  T01_A_BLOB_ITS_OWN_SLOT_DOMINATES_IS_STILL_A_BLOB: ${merged.components.length} component(s), ` +
        `centroids ${lie.toFixed(2)} px apart (needs > ${SLOT_LIE_PIXELS}), track ${JSON.stringify(wideTrack)}`,
    );
  }

  // --- and two parts that are two blobs still get their drift -----------------
  // The negative control, and the suite needs it more than usual: "reported as
  // ambiguous" is also what a matcher that has stopped measuring anything reports.
  // The same two parts, moved apart by a row of background, must both come back
  // with a component match and the drift the fixture makes true — zero.
  const separate = componentField(inkFrame([SLOT_WIDE, SLOT_SMALL_APART]), BACKGROUND);
  const separateTracks = matchSlots(new Map([['wide', wide], ['small', apart]]), separate, null).tracks;
  const separateOk =
    separate.components.length === 2 &&
    separateTracks.length === 2 &&
    separateTracks.every(
      (t) => t.method === 'component' && t.ambiguity === null && t.drift !== null && t.drift <= SLOT_TRUE_DRIFT,
    );
  if (separateOk) {
    console.log(
      `  PASS  T02_TWO_PARTS_THAT_ARE_TWO_BLOBS_STILL_GET_A_DRIFT  ` +
        `(both matched by component at ${separateTracks.map((t) => (t.drift ?? 0).toFixed(2)).join(' / ')} px)`,
    );
    console.log('          origin: a matcher that answers "ambiguous" to everything is not a matcher');
  } else {
    bad++;
    console.log(
      `  FAIL  T02_TWO_PARTS_THAT_ARE_TWO_BLOBS_STILL_GET_A_DRIFT: ${separate.components.length} component(s), ` +
        `tracks ${JSON.stringify(separateTracks.map((t) => ({ slot: t.slot, method: t.method, drift: t.drift })))}`,
    );
  }
  return bad;
}

// ---------------------------------------------------------------------------
// the rig spec — negative controls for the COMPILER, not for the validator
// ---------------------------------------------------------------------------
//
// The three suites above break an ARTIFACT and assert that a named assertion
// fires. These break an INPUT and assert that the compile is refused by name,
// which is a different gate with the same job: a rig spec is now the skeleton's
// structure, and every one of the edits below produces a file that Spine's own
// parser would accept while quietly meaning something else.
//
//   * a bone naming a parent declared after it loads as a SECOND ROOT — the
//     parser resolves `parent` against the bones it has already read;
//   * two bones with one name make every join by that name ambiguous, and the
//     loser is whichever the runtime indexed second;
//   * a slot naming a bone that does not exist is one of the format's few loud
//     failures, but it throws in the CONSUMER's process, which is late;
//   * an ik constraint pointing at an unknown bone likewise;
//   * an attachment naming a PNG that is not there used to arrive as a raw
//     ENOENT — the tool talking about its own internals instead of the rig;
//   * a wrong `spec` field is how a v2 format would get read as a v1 one.
//
// ⚠️ There is a positive control first, and it is not symmetry: these cases
// compile a COPY of the rig from a temp directory, so a harness bug (a bad copy,
// a path that no longer resolves) would make every case "pass" by refusing a rig
// for reasons that have nothing to do with the edit.

interface RigMutant {
  name: string;
  origin: string;
  /** A substring the refusal must contain. Whole messages are too brittle. */
  expect: string;
  mutate: (rig: Record<string, unknown>) => void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const RIG_MUTANTS: RigMutant[] = [
  {
    name: 'R01_bone_names_a_parent_declared_after_it',
    origin: 'SkeletonJson.ts:90-118 — `parent` resolves against the bones already read, so a forward reference loads as a second root',
    expect: 'is not declared before it',
    mutate: (rig) => {
      (rig as any).bones.find((b: any) => b.name === 'cam').parent = 'trail_c';
    },
  },
  {
    name: 'R02_two_bones_share_one_name',
    origin: 'bone names are the join key for slots, meshes and every timeline; a duplicate makes the join ambiguous with no error',
    expect: 'two bones are called',
    mutate: (rig) => {
      (rig as any).bones.push({ name: 'plunger', parent: 'root' });
    },
  },
  {
    name: 'R03_slot_names_a_bone_the_rig_does_not_have',
    origin: "SkeletonJson.ts:127 — the parser throws `Couldn't find bone … for slot …`, but in the consumer's process",
    expect: 'which this rig does not declare',
    mutate: (rig) => {
      (rig as any).slots.find((s: any) => s.name === 'collar').bone = 'rim_typo';
    },
  },
  {
    name: 'R04_attachment_image_is_not_on_disk',
    origin: 'a rig-declared attachment naming a missing PNG used to surface as a raw ENOENT from readFileSync',
    expect: 'is not on disk at',
    mutate: (rig) => {
      // `near` is a slot the manifest carries no part for, so filling it from the
      // rig is the one place this fixture can exercise the rig-skin path.
      (rig as any).skins = { default: { near: { probe_missing: { image: 'nope_not_here.png' } } } };
    },
  },
  {
    name: 'R05_ik_constraint_targets_an_unknown_bone',
    origin: 'SkeletonJson.ts:149-176 — ik `bones`/`target` resolve by name and throw on a miss, again in the consumer',
    expect: 'which the rig does not declare as a bone',
    mutate: (rig) => {
      (rig as any).constraints = [{ name: 'probe_ik', type: 'ik', bones: ['plunger'], target: 'nowhere' }];
    },
  },
  {
    name: 'R08_authored_mesh_binds_a_bone_the_rig_does_not_have',
    origin:
      'issue #45 — an authored mesh used to bind bones by INDEX into the emitted bone array, ' +
      'so a wrong binding had no name to be wrong and nothing could refuse it; by name it joins R01/R03/R05',
    expect: 'which the rig does not declare as a bone',
    mutate: (rig) => {
      (rig as any).slots.find((sl: any) => sl.name === 'near').attachment = 'probe_mesh';
      (rig as any).skins = {
        default: {
          near: {
            probe_mesh: {
              type: 'mesh',
              uvs: [0, 0, 1, 0, 1, 1, 0, 1],
              triangles: [0, 1, 2, 0, 2, 3],
              hull: 4,
              width: 10,
              height: 10,
              weights: [
                [{ bone: 'plunger', x: 0, y: 0, weight: 1 }],
                [{ bone: 'plunger', x: 10, y: 0, weight: 1 }],
                [{ bone: 'no_such_bone', x: 10, y: 10, weight: 1 }],
                [{ bone: 'plunger', x: 0, y: 10, weight: 1 }],
              ],
            },
          },
        },
      };
    },
  },
  {
    name: 'R09_authored_mesh_uses_raw_bone_indices_without_saying_so',
    origin:
      'issue #45 — the index form is still reachable, deliberately, but it costs silence: ' +
      'inserting a bone rebinds every vertex. It has to be asked for by name.',
    expect: 'boneIndexing',
    mutate: (rig) => {
      (rig as any).slots.find((sl: any) => sl.name === 'near').attachment = 'probe_mesh';
      (rig as any).skins = {
        default: {
          near: {
            probe_mesh: {
              type: 'mesh',
              uvs: [0, 0, 1, 0, 1, 1, 0, 1],
              triangles: [0, 1, 2, 0, 2, 3],
              hull: 4,
              width: 10,
              height: 10,
              // Spine's own run: boneCount, (boneIndex, bindX, bindY, weight) x n
              vertices: [1, 1, 0, 0, 1, 1, 1, 10, 0, 1, 1, 1, 10, 10, 1, 1, 1, 0, 10, 1],
            },
          },
        },
      };
    },
  },
  {
    name: 'R10_bounding_box_without_a_vertex_count',
    origin:
      'SkeletonJson.ts:552 — the parser reads `map.vertexCount << 1`, and `undefined << 1` is 0, ' +
      'so the coordinate array is decoded as a weight run and the box ends up with no vertices at all',
    expect: 'vertexCount is undefined',
    mutate: (rig) => {
      (rig as any).slots.find((sl: any) => sl.name === 'near').attachment = 'probe_bb';
      (rig as any).skins = {
        default: { near: { probe_bb: { type: 'boundingbox', vertices: [0, 0, 10, 0, 10, 10, 0, 10] } } },
      };
    },
  },
  {
    name: 'R11_bounding_box_vertices_disagree_with_its_vertex_count',
    origin:
      'the same length comparison that decides a mesh’s encoding (A04), minus the uvs that would have caught it: ' +
      'a count that does not match makes readVertices take the weighted branch and read coordinates as weights',
    expect: 'reads that as a WEIGHTED run',
    mutate: (rig) => {
      (rig as any).slots.find((sl: any) => sl.name === 'near').attachment = 'probe_bb';
      (rig as any).skins = {
        default: { near: { probe_bb: { type: 'boundingbox', vertexCount: 4, vertices: [0, 0, 10, 0, 10, 10] } } },
      };
    },
  },
  {
    name: 'R12_clipping_ends_at_a_slot_the_rig_does_not_have',
    origin:
      'SkeletonJson.ts:626-627 — `findSlot` returns null on a miss and the parser assigns it, so the clip ' +
      'never ends: it runs to the bottom of the draw order and takes every slot below it out of the frame',
    expect: 'which this rig does not declare',
    mutate: (rig) => {
      (rig as any).slots.find((sl: any) => sl.name === 'near').attachment = 'probe_clip';
      (rig as any).skins = {
        default: {
          near: {
            probe_clip: {
              type: 'clipping',
              end: 'collarr',
              vertexCount: 3,
              vertices: [0, 0, 10, 0, 0, 10],
            },
          },
        },
      };
    },
  },
  {
    name: 'R13_attachment_type_the_emitter_cannot_write',
    origin: 'SkeletonJson.ts:653 — an unknown attachment `type` returns null and the attachment disappears with no error',
    expect: 'rigc does not emit it yet',
    mutate: (rig) => {
      (rig as any).slots.find((sl: any) => sl.name === 'near').attachment = 'probe_point';
      (rig as any).skins = { default: { near: { probe_point: { type: 'point', x: 1, y: 2 } } } };
    },
  },
  {
    name: 'R06_wrong_spec_version_field',
    origin: 'the envelope is the only thing standing between a v1 reader and a v2 file',
    expect: 'unknown rig spec version',
    mutate: (rig) => {
      rig.spec = 'rigc-rig/2';
    },
  },
  {
    name: 'R07_constraint_type_the_emitter_cannot_write',
    origin: 'SkeletonJson.ts:148-367 — an entry whose `type` matches no case is dropped with no error and no default branch',
    expect: 'rigc does not emit it yet',
    mutate: (rig) => {
      (rig as any).constraints = [{ name: 'probe_path', type: 'path', bones: ['plunger'], slot: 'collar' }];
    },
  },
];
/* eslint-enable @typescript-eslint/no-explicit-any */

function runRigSuite(): number {
  const opts = optsForFixture(ARTICULATED);
  const sourceText = readFileSync(opts.rigPath, 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'rigc-rigspec-'));
  const rigPath = join(dir, 'probe.rig.json');
  let bad = 0;
  console.log(`\n── rig spec refusals (${ARTICULATED.rig}) ──`);

  // Positive control. The copy must compile to the same bytes as the original,
  // or every refusal below could be the copy's fault rather than the edit's.
  writeFileSync(rigPath, sourceText);
  const pristine = compile(opts);
  try {
    const copied = compile({ ...opts, rigPath });
    if (copied.skeletonText === pristine.skeletonText && copied.atlasText === pristine.atlasText) {
      console.log('  PASS  CONTROL_RIG_COPY_COMPILES_IDENTICALLY');
    } else {
      bad++;
      console.log('  FAIL  CONTROL_RIG_COPY_COMPILES_IDENTICALLY: the untouched copy emitted different bytes');
    }
  } catch (err) {
    bad++;
    console.log(`  FAIL  CONTROL_RIG_COPY_COMPILES_IDENTICALLY: ${(err as Error).message}`);
  }

  for (const mutant of RIG_MUTANTS) {
    const rig = JSON.parse(sourceText) as Record<string, unknown>;
    mutant.mutate(rig);
    writeFileSync(rigPath, `${JSON.stringify(rig, null, 2)}\n`);
    let message: string | null = null;
    try {
      compile({ ...opts, rigPath });
    } catch (err) {
      message = err instanceof CompileError ? err.message : `NOT a CompileError: ${(err as Error).message}`;
    }
    if (message !== null && message.includes(mutant.expect)) {
      console.log(`  PASS  ${mutant.name}`);
      console.log(`          refused with: ${message}`);
      console.log(`          origin: ${mutant.origin}`);
    } else {
      bad++;
      console.log(
        `  FAIL  ${mutant.name}: expected a refusal naming ${JSON.stringify(mutant.expect)}, got ` +
          (message === null ? 'a clean compile — the broken rig went through' : message),
      );
    }
  }
  return bad;
}

// ---------------------------------------------------------------------------
// static rigs — a skeleton with no animation at all
// ---------------------------------------------------------------------------
//
// ⭐ This suite builds its own art and its own specs in a temp directory, so it
// is the one suite here that is NOT aimed at the owning project's fixtures. It
// exists because the ladder's first rung ships a **static rig** — an export
// whose entire content is the setup pose — and rigc had no coverage of that
// shape at all. What it found: `A09_ANIMATION_DURATION_MATCHES_SPEC` reported
// PASS on it. Both of A09's loops iterate over animations, a static rig has
// none, so the assertion ran, looked at nothing, and counted itself green. That
// is the exact false green the SKIP channel was built for.
//
// Three of the cases below are one assertion's three states, because a skip that
// swallows a real mismatch would be a worse bug than the vacuous pass it fixed:
// nothing to compare (SKIP), something to compare (PASS), a disagreement (FAIL).
// The fourth is a second assertion's skip, and it is here for the same reason —
// this is the only rig in the file that declares no invariants at all.

/** One line per case, in the same shape the fixture suites print. Returns 1 when it failed. */
function reportCase(name: string, ok: boolean, detail: string, why: string): number {
  if (ok) {
    console.log(`  PASS  ${name}`);
    console.log(`          ${detail}`);
    console.log(`          origin: ${why}`);
    return 0;
  }
  console.log(`  FAIL  ${name}: ${detail}`);
  return 1;
}

/** A tiny opaque PNG. Size and colour are arbitrary; only "it is a real file" is load-bearing. */
function writeProbePng(path: string, width: number, height: number, colour: RGBA): void {
  const plate = new Plate(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) plate.set(x, y, colour);
  plate.writePng(path);
}

interface ProbeDirs {
  dir: string;
  rigPath: string;
  outDir: string;
}

/**
 * A two-slot rig spec plus its art, written fresh into a temp directory.
 *
 * `extra` is merged over the spec, so a suite that needs one more block — an
 * `events` table, an attachment the base probe does not carry — states just that
 * block instead of forking a second near-identical rig. The base spec stays the
 * one every other suite already runs against.
 */
function writeProbeRig(extra: Record<string, unknown> = {}): ProbeDirs {
  const dir = mkdtempSync(join(tmpdir(), 'rigc-static-'));
  writeProbePng(join(dir, 'block.png'), 12, 8, [40, 60, 90, 255]);
  writeProbePng(join(dir, 'marker.png'), 6, 6, [180, 70, 50, 255]);
  const rigPath = join(dir, 'probe.rig.json');
  writeFileSync(
    rigPath,
    `${JSON.stringify(
      {
        spec: 'rigc-rig/1',
        name: 'static_probe',
        skeleton: { width: 64, height: 64 },
        bones: [{ name: 'root' }, { name: 'block', parent: 'root', x: 0, y: 0, length: 12 }],
        slots: [
          { name: 'block', bone: 'block', attachment: 'block' },
          { name: 'marker', bone: 'block', attachment: 'marker' },
        ],
        skins: {
          default: {
            block: { block: { image: 'block.png' } },
            marker: { marker: { image: 'marker.png' } },
          },
        },
        ...extra,
      },
      null,
      2,
    )}\n`,
  );
  return { dir, rigPath, outDir: join(dir, 'spine') };
}

/**
 * Compile one motion spec against the probe rig and gate the result.
 *
 * ⚠️ The profile is a parameter and it matters. Under `spine` the renderer-policy
 * assertions do not run AT ALL — they are reported on a third channel,
 * `profileSkipped`, which is neither a pass nor a skip — so a control that wants
 * to see one of them SKIP has to ask for the profile that runs it. Reading
 * `skipped` alone under the wrong profile produces a confident, wrong answer.
 */
function gateProbe(
  dirs: ProbeDirs,
  motion: Record<string, unknown>,
  profile: ValidateProfile = 'spine',
): ReturnType<typeof validate> {
  const motionPath = join(dirs.dir, 'probe.motion.json');
  writeFileSync(motionPath, `${JSON.stringify(motion, null, 2)}\n`);
  const opts: Options = { rigPath: dirs.rigPath, motionPath, outDir: dirs.outDir, imagesDir: dirs.dir };
  const result = compile(opts);
  return validate({
    skeletonText: result.skeletonText,
    atlasText: result.atlasText,
    atlasDir: opts.outDir,
    declaredDurations: result.declaredDurations,
    rig: result.rig,
    profile,
  });
}

/** Compile the probe, then break the emitted skeleton and gate THAT. */
function gateProbeArtifacts(
  dirs: ProbeDirs,
  motion: Record<string, unknown>,
  mutate: (skeleton: Record<string, unknown>) => void,
): ReturnType<typeof validate> {
  const motionPath = join(dirs.dir, 'probe.motion.json');
  writeFileSync(motionPath, `${JSON.stringify(motion, null, 2)}\n`);
  const opts: Options = { rigPath: dirs.rigPath, motionPath, outDir: dirs.outDir, imagesDir: dirs.dir };
  const result = compile(opts);
  const skeleton = JSON.parse(result.skeletonText) as Record<string, unknown>;
  mutate(skeleton);
  return validate({
    skeletonText: `${JSON.stringify(skeleton, null, 2)}\n`,
    atlasText: result.atlasText,
    atlasDir: opts.outDir,
    declaredDurations: result.declaredDurations,
    rig: result.rig,
    profile: 'spine',
  });
}

/**
 * Compile the probe and STEP it through spine-core at one rate, as a player does.
 *
 * The gate cannot answer "is this key on the sample it was written for": it reads
 * the emitted numbers, and a key time that is a millionth of a second too large is
 * a perfectly good number. Only sampling the animation the way a runtime samples it
 * — `AnimationState.update` at a fixed step, which is exactly `sampleAnimation` —
 * puts the emitted time and the sample time on the same line.
 */
function stepProbe(
  dirs: ProbeDirs,
  motion: Record<string, unknown>,
  animation: string,
  fps: number,
): Frame[] {
  const motionPath = join(dirs.dir, 'probe.motion.json');
  writeFileSync(motionPath, `${JSON.stringify(motion, null, 2)}\n`);
  const opts: Options = { rigPath: dirs.rigPath, motionPath, outDir: dirs.outDir, imagesDir: dirs.dir };
  const result = compile(opts);
  // The atlas names its pages relative to `outDir`, so the loader resolves them
  // back to the probe's own PNGs without anything having been written.
  const posable = posableFromText(result.skeletonText, result.atlasText, opts.outDir);
  return sampleAnimation(posable.data, animation, fps);
}

/** The message a compile was refused with, or null if it went through. */
function refusal(dirs: ProbeDirs, motion: Record<string, unknown>): string | null {
  const motionPath = join(dirs.dir, 'probe.motion.json');
  writeFileSync(motionPath, `${JSON.stringify(motion, null, 2)}\n`);
  try {
    compile({ rigPath: dirs.rigPath, motionPath, outDir: dirs.outDir, imagesDir: dirs.dir });
    return null;
  } catch (err) {
    return err instanceof CompileError ? err.message : `NOT a CompileError: ${(err as Error).message}`;
  }
}

const STATIC_MOTION = {
  spec: 'rigc-motion/1',
  archetype: 'static_probe',
  cut: 'static_probe',
  easings: {},
  animations: {},
};

function runStaticRigSuite(): number {
  const dirs = writeProbeRig();
  let bad = 0;
  console.log('\n── static rigs (self-contained: this suite writes its own art) ──');

  const report = gateProbe(dirs, STATIC_MOTION);
  const say = (name: string, ok: boolean, detail: string, why: string): void => {
    bad += reportCase(name, ok, detail, why);
  };

  say(
    'CONTROL_A_RIG_WITH_NO_ANIMATIONS_IS_GREEN',
    report.failures.length === 0,
    report.failures.length === 0
      ? `${report.passed.length} assertions ran, ${report.skipped.length} skipped`
      : `[${report.failures.map((f) => `${f.assertion}: ${f.detail}`).join('; ')}]`,
    'a skeleton that exists to be posed is a deliverable, not a degenerate case — ladder rung 1 ships one',
  );

  const skip = report.skipped.find((s) => s.assertion === 'A09_ANIMATION_DURATION_MATCHES_SPEC');
  say(
    'S01_A09_SKIPS_INSTEAD_OF_PASSING_VACUOUSLY',
    skip !== undefined && !report.passed.includes('A09_ANIMATION_DURATION_MATCHES_SPEC'),
    skip ? `skipped: ${skip.reason}` : 'A09 did not skip — it looked at zero animations and called that a pass',
    'both of A09’s loops iterate over animations; with none, "ran and held" and "never looked" are the same report',
  );

  const compared = gateProbe(dirs, {
    ...STATIC_MOTION,
    animations: { 'ready-to-animate': { duration: 0, loop: false, tracks: [] } },
  });
  say(
    'S02_A09_STILL_RUNS_ON_A_NAMED_EMPTY_ANIMATION',
    compared.passed.includes('A09_ANIMATION_DURATION_MATCHES_SPEC'),
    'an animation with no tracks is still an animation: 0s declared against 0s loaded is a real comparison',
    'the skip must be keyed on "there is nothing to compare", not on "the durations are zero"',
  );

  // A13's other state, and it belongs in this suite because the probe rig is the
  // only one here that declares no `invariants` at all. A mesh budget is one
  // consumer's frame time, not a property of Spine, so a rig that never wrote one
  // down has nothing for the assertion to measure against — and "nothing to
  // measure" must report SKIP, never a pass.
  const policy = gateProbe(dirs, STATIC_MOTION, 'spine-html');
  const budget = policy.skipped.find((s) => s.assertion === 'A13_MESH_BUDGET');
  say(
    'S04_A13_SKIPS_WHEN_THE_RIG_DECLARED_NO_BUDGET',
    budget !== undefined && !policy.passed.includes('A13_MESH_BUDGET'),
    budget ? `skipped: ${budget.reason}` : 'A13 looked at a rig with no budget and called that a pass',
    'the numbers used to be constants in the validator, which failed correct foreign data against one project\'s canvas',
  );

  // The mismatch branch, with the skip's precondition HALF true: the spec
  // declares nothing and the skeleton carries one anyway. A skip keyed on the
  // spec side alone would swallow this, and "the artifact grew an animation
  // nobody declared" is exactly what A09's second loop is for.
  const stray = gateProbeArtifacts(dirs, STATIC_MOTION, (skeleton) => {
    skeleton.animations = { stray: {} };
  });
  say(
    'S03_A09_STILL_FAILS_ON_AN_ANIMATION_NOBODY_DECLARED',
    stray.failures.some((f) => f.assertion === 'A09_ANIMATION_DURATION_MATCHES_SPEC'),
    stray.failures.find((f) => f.assertion === 'A09_ANIMATION_DURATION_MATCHES_SPEC')?.detail ??
      'A09 accepted an animation the motion spec never declared',
    'the skip is keyed on BOTH sides being empty; one side alone must still be compared',
  );
  return bad;
}

// ---------------------------------------------------------------------------
// PNG transparency — the colour types rigc's own writer never produces
// ---------------------------------------------------------------------------
//
// ⭐ Every PNG in every other suite is written by `tools/plate.ts`, which emits
// colour type 6 and nothing else. So for as long as A19 judged a part by its
// colour type alone, the suite could not have caught the error it made: no
// fixture here was ever an indexed or greyscale file.
//
// A stranger's files are. Indexed-with-`tRNS` is the default or ordinary output
// of ImageMagick, Photoshop's "Export as PNG-8", GIMP's indexed mode, aseprite,
// pngquant and optipng, and #215 is what that cost — seven of nine hand-drawn
// parts refused on a first build, told they carried "no alpha channel" when the
// art was genuinely transparent and rendered correctly.
//
// The cases below are the two sides of the corrected rule (transparency present
// versus genuinely absent) across the three colour types that can carry a `tRNS`
// chunk, plus the greyscale+alpha file that always passed — that one is here
// because it is the OTHER half of the audit: two of those nine parts came out
// type 4 from the same tool in the same command and sailed through, which is why
// the author could not see any property of their own that explained the split.

/** Palette and pixel plan for one synthetic part, in a colour type `Plate` cannot write. */
interface TypedPng {
  /** 0 greyscale, 2 truecolour, 3 indexed. Types 4 and 6 come from `Plate` instead. */
  colourType: 0 | 2 | 3;
  /** Emit a `tRNS` chunk: a palette alpha table for type 3, one invisible colour for 0 and 2. */
  trns: boolean;
}

/**
 * Write an 8-bit PNG in a colour type `tools/plate.ts` does not produce.
 *
 * The pixels are a checkerboard for the same reason every other fixture's are —
 * a flat fill hides a wrong mapping — but nothing here is measured. The only
 * load-bearing property is the chunk list: which colour type the IHDR declares,
 * and whether a `tRNS` chunk sits between `PLTE` and `IDAT` where the spec puts
 * it. That is exactly the surface `readPngInfo` reads and A19 judges.
 */
function writeTypedPng(path: string, width: number, height: number, spec: TypedPng): void {
  const samples = spec.colourType === 2 ? 3 : 1;
  const stride = width * samples + 1;
  const raw = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none, as `encodePng` does
    for (let x = 0; x < width; x++) {
      const on = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
      const at = y * stride + 1 + x * samples;
      if (spec.colourType === 3) {
        // Palette index 0 is the entry `tRNS` makes invisible, so the "off"
        // squares are the transparent ones when a tRNS chunk is present.
        raw[at] = on ? 1 : 0;
      } else if (spec.colourType === 0) {
        raw[at] = on ? 220 : 30;
      } else {
        raw[at] = on ? 220 : 30;
        raw[at + 1] = on ? 210 : 40;
        raw[at + 2] = on ? 200 : 50;
      }
    }
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = spec.colourType;
  const parts: Uint8Array[] = [PNG_SIGNATURE, pngChunk('IHDR', ihdr)];
  if (spec.colourType === 3) {
    parts.push(pngChunk('PLTE', new Uint8Array([30, 40, 50, 220, 210, 200])));
    // One alpha byte per palette entry, shortest-first: entry 0 invisible.
    if (spec.trns) parts.push(pngChunk('tRNS', new Uint8Array([0])));
  } else if (spec.trns) {
    // One colour declared invisible: a 16-bit sample per channel, big-endian.
    parts.push(
      pngChunk('tRNS', spec.colourType === 0 ? new Uint8Array([0, 30]) : new Uint8Array([0, 30, 0, 40, 0, 50])),
    );
  }
  parts.push(pngChunk('IDAT', new Uint8Array(deflateSync(raw, { level: 9 }))));
  parts.push(pngChunk('IEND', new Uint8Array(0)));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  writeFileSync(path, out);
}

/**
 * Write a greyscale+alpha (colour type 4) PNG — the file that always passed.
 *
 * `Plate` cannot write this one either, and it is not a `TypedPng`: it carries a
 * real per-pixel alpha channel rather than a `tRNS` chunk, which is the whole
 * point of having it here.
 */
function writeGreyAlphaPng(path: string, width: number, height: number): void {
  const stride = width * 2 + 1;
  const raw = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < width; x++) {
      const at = y * stride + 1 + x * 2;
      raw[at] = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0 ? 220 : 30;
      raw[at + 1] = x < 2 || y < 2 || x >= width - 2 || y >= height - 2 ? 0 : 255;
    }
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 4;
  const parts = [
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', new Uint8Array(deflateSync(raw, { level: 9 }))),
    pngChunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  writeFileSync(path, out);
}

const A19 = 'A19_OVERLAY_PNGS_HAVE_ALPHA';

/**
 * Replace the probe rig's `block.png` with one of these files and gate the rig.
 *
 * ⚠️ The profile is `spine-html` and it has to be: A19 is renderer policy, so
 * under `spine` it is not a pass and not a skip but a third thing —
 * `profileSkipped` — and a case that read `passed` under the wrong profile would
 * report a confident green for an assertion that never ran.
 *
 * `block.png` is 12x8 against a 64x64 stage, so it is nowhere near covering the
 * stage: it is judged as an overlay, which is the branch under test. The rig is
 * rebuilt per case so no case can inherit another's art.
 */
function gatePartImage(write: (path: string) => void): ReturnType<typeof validate> {
  const dirs = writeProbeRig();
  write(join(dirs.dir, 'block.png'));
  return gateProbe(dirs, STATIC_MOTION, 'spine-html');
}

function runPngTransparencySuite(): number {
  let bad = 0;
  console.log('\n── PNG transparency (self-contained: this suite writes its own art) ──');
  const say = (name: string, ok: boolean, detail: string, why: string): void => {
    bad += reportCase(name, ok, detail, why);
  };
  const verdict = (report: ReturnType<typeof validate>): string => {
    const failure = report.failures.find((f) => f.assertion === A19);
    if (failure) return `A19 failed: ${failure.detail}`;
    if (report.passed.includes(A19)) return 'A19 passed';
    const skipped = report.skipped.find((s) => s.assertion === A19);
    if (skipped) return `A19 skipped: ${skipped.reason}`;
    return 'A19 did not run at all';
  };

  const indexedTrns = gatePartImage((p) => writeTypedPng(p, 12, 8, { colourType: 3, trns: true }));
  say(
    'T01_INDEXED_WITH_TRNS_IS_TRANSPARENT_ART',
    indexedTrns.passed.includes(A19),
    verdict(indexedTrns),
    'colour type 3 + tRNS is what ImageMagick, PNG-8 export, GIMP indexed and pngquant produce; the art is transparent (#215)',
  );

  const greyTrns = gatePartImage((p) => writeTypedPng(p, 12, 8, { colourType: 0, trns: true }));
  say(
    'T02_GREYSCALE_WITH_TRNS_IS_TRANSPARENT_ART',
    greyTrns.passed.includes(A19),
    verdict(greyTrns),
    'tRNS on a greyscale file names one invisible shade; the rule is transparency, not the channel it is stored in',
  );

  const rgbTrns = gatePartImage((p) => writeTypedPng(p, 12, 8, { colourType: 2, trns: true }));
  say(
    'T03_TRUECOLOUR_WITH_TRNS_IS_TRANSPARENT_ART',
    rgbTrns.passed.includes(A19),
    verdict(rgbTrns),
    'same chunk, third colour type — a rule keyed on tRNS must not be keyed on "indexed" by accident',
  );

  const greyAlpha = gatePartImage((p) => writeGreyAlphaPng(p, 12, 8));
  say(
    'T04_GREYSCALE_ALPHA_STILL_PASSES',
    greyAlpha.passed.includes(A19),
    verdict(greyAlpha),
    'the other half of the #215 audit: two of nine parts came out type 4 from the same command and passed',
  );

  // The break. Nothing about the fix may make A19 unable to go RED — an opaque
  // part with no alpha channel and no tRNS still paints over what is behind it.
  const opaque = gatePartImage((p) => writeTypedPng(p, 12, 8, { colourType: 3, trns: false }));
  const refusal = opaque.failures.find((f) => f.assertion === A19);
  say(
    'T05_INDEXED_WITHOUT_TRNS_IS_STILL_REFUSED',
    refusal !== undefined,
    verdict(opaque),
    'the assertion still has to fire, or the fix has replaced a false alarm with a blind spot',
  );

  // ⭐ The message is the deliverable here, not just the verdict. #215 was ranked
  // above every other wall in the audit because the explanation was WRONG, and a
  // true verdict with an unhelpful message would leave most of that unfixed: the
  // reader has to be told what to do and that a profile exists which does not ask.
  const detail = refusal?.detail ?? '';
  const missing = [
    /re-export/i.test(detail) ? null : 'a remedy ("re-export")',
    /rgba/i.test(detail) ? null : 'the target format (RGBA)',
    /tRNS/.test(detail) ? null : 'the chunk that would make it transparent (tRNS)',
    /--profile spine\b/.test(detail) ? null : 'the profile that does not enforce it (--profile spine)',
    /no alpha channel/i.test(detail) ? 'DROP the old untrue "no alpha channel" phrasing' : null,
  ].filter((m): m is string => m !== null);
  say(
    'T06_THE_REFUSAL_NAMES_A_REMEDY_AND_A_PROFILE',
    refusal !== undefined && missing.length === 0,
    missing.length === 0 ? detail : `message is missing: ${missing.join(', ')} — got: ${detail}`,
    'every other error in the audit named a fix; the one a stranger meets first did not',
  );

  // Where the defect actually lived: the reader stopped at the IHDR, so a chunk
  // sitting after it could not be seen no matter what the rule above it said.
  const probe = mkdtempSync(join(tmpdir(), 'rigc-trns-'));
  writeTypedPng(join(probe, 'with.png'), 12, 8, { colourType: 3, trns: true });
  writeTypedPng(join(probe, 'without.png'), 12, 8, { colourType: 3, trns: false });
  const withTrns = readPngInfo(join(probe, 'with.png'));
  const withoutTrns = readPngInfo(join(probe, 'without.png'));
  say(
    'T07_READ_PNG_INFO_WALKS_PAST_THE_HEADER',
    withTrns.colourType === 3 &&
      withTrns.hasTrns &&
      withTrns.hasTransparency &&
      !withTrns.hasAlpha &&
      !withoutTrns.hasTrns &&
      !withoutTrns.hasTransparency &&
      withTrns.width === 12 &&
      withTrns.height === 8,
    `with tRNS: ${JSON.stringify(withTrns)}; without: ${JSON.stringify(withoutTrns)}`,
    'hasAlpha stays "a per-pixel alpha channel"; the tRNS chunk is a separate fact and the size must survive the walk',
  );
  return bad;
}

// ---------------------------------------------------------------------------
// draw-order timelines
// ---------------------------------------------------------------------------
//
// The probe rig emits two slots, `block` (index 0) and `marker` (index 1), which
// is the smallest skeleton in which a draw-order key can be both right and
// wrong. Nothing in the owning project's fixtures keys draw order, so without
// this suite the emitter would ship with no negative control at all.
//
// Three of the four breaks below load with no error in Spine's own parser, and
// the fourth does not load at ALL — see A31's comment in `src/validate.ts`.

/** `block` moves one place later; `marker` therefore moves one place earlier. */
function drawOrderMotion(offsets: Array<{ slot: string; offset: number }>): Record<string, unknown> {
  return {
    spec: 'rigc-motion/1',
    archetype: 'static_probe',
    cut: 'static_probe',
    easings: {},
    animations: {
      swap: {
        duration: 1,
        loop: false,
        drawOrder: [{ t: 0 }, { t: 0.5, offsets }, { t: 1 }],
        tracks: [],
      },
    },
  };
}

const LEGAL_SWAP = drawOrderMotion([{ slot: 'block', offset: 1 }]);

/** The first `offsets` array in the emitted skeleton, for a mutant to break. */
function firstOffsets(skeleton: Record<string, unknown>): Array<Record<string, unknown>> {
  const animations = skeleton.animations as Record<string, { drawOrder?: Array<Record<string, unknown>> }>;
  const keys = animations.swap.drawOrder;
  if (!keys) throw new Error('the probe emitted no drawOrder timeline');
  return keys[1].offsets as Array<Record<string, unknown>>;
}

function runDrawOrderSuite(): number {
  const dirs = writeProbeRig();
  let bad = 0;
  console.log('\n── draw-order timelines (self-contained) ──');
  const say = (name: string, ok: boolean, detail: string, why: string): void => {
    bad += reportCase(name, ok, detail, why);
  };

  const green = gateProbe(dirs, LEGAL_SWAP);
  say(
    'CONTROL_A_DRAW_ORDER_TIMELINE_IS_GREEN',
    green.failures.length === 0 && green.passed.includes('A31_DRAW_ORDER_OFFSETS_RESOLVE'),
    green.failures.length === 0
      ? 'A31 ran and held on a legal swap-and-restore'
      : `[${green.failures.map((f) => `${f.assertion}: ${f.detail}`).join('; ')}]`,
    'without a positive control a suite of breaks cannot tell a working gate from one that fails everything',
  );

  // --- the compiler refuses, by name ---------------------------------------
  for (const [name, motion, expect, why] of [
    [
      'O01_offset_leaves_the_slot_array',
      drawOrderMotion([{ slot: 'block', offset: 4 }]),
      'outside the 2 emitted slots',
      'the parser writes past the end, leaves a −1 hole, and fills it from unchanged[-1] — undefined, silently',
    ],
    [
      'O02_one_slot_offset_twice_in_one_key',
      drawOrderMotion([
        { slot: 'block', offset: 1 },
        { slot: 'block', offset: 0 },
      ]),
      'is offset twice in one key',
      'two writes at one cursor position: the second wins and the first move is simply lost',
    ],
    [
      'O03_offsets_a_slot_the_rig_does_not_emit',
      drawOrderMotion([{ slot: 'nowhere', offset: 1 }]),
      'is not one this rig emits',
      'SkeletonJson.ts:1345 throws `Draw order slot not found` — but in the consumer process, which is late',
    ],
  ] as Array<[string, Record<string, unknown>, string, string]>) {
    const message = refusal(dirs, motion);
    say(
      name,
      message !== null && message.includes(expect),
      message === null ? 'the compile went through — the broken timeline was emitted' : `refused with: ${message}`,
      why,
    );
  }

  // --- the validator catches the same shapes in a foreign artifact ----------
  const outOfRange = gateProbeArtifacts(dirs, LEGAL_SWAP, (skeleton) => {
    firstOffsets(skeleton)[0].offset = 5;
  });
  say(
    'O04_A31_catches_an_out_of_range_offset',
    outOfRange.failures.some((f) => f.assertion === 'A31_DRAW_ORDER_OFFSETS_RESOLVE'),
    outOfRange.failures.find((f) => f.assertion === 'A31_DRAW_ORDER_OFFSETS_RESOLVE')?.detail ??
      'A31 accepted an offset that lands outside the slot array',
    'a hand-written or foreign skeleton never went through the compiler, so the gate must find this from the file',
  );

  // Descending slot order does not load WRONG — it does not load. The round trip
  // must therefore be refused rather than attempted, or this control hangs the
  // suite that is supposed to prove the gate works.
  const descending = gateProbeArtifacts(dirs, LEGAL_SWAP, (skeleton) => {
    firstOffsets(skeleton).length = 0;
    firstOffsets(skeleton).push({ slot: 'marker', offset: -1 }, { slot: 'block', offset: 1 });
  });
  const a00 = descending.failures.find((f) => f.assertion === 'A00_ROUNDTRIP_PARSE');
  say(
    'O05_A31_catches_descending_offsets_before_the_parser_hangs',
    descending.failures.some((f) => f.assertion === 'A31_DRAW_ORDER_OFFSETS_RESOLVE') &&
      a00 !== undefined &&
      a00.detail.includes('not attempted'),
    a00 ? `A31 named it and A00 reported: ${a00.detail}` : 'A00 was attempted anyway — this run got lucky, not correct',
    'readDrawOrder walks a forward-only cursor, so an earlier slot after a later one spins until the process dies',
  );

  const curved = gateProbeArtifacts(dirs, LEGAL_SWAP, (skeleton) => {
    const animations = skeleton.animations as Record<string, { drawOrder?: Array<Record<string, unknown>> }>;
    animations.swap.drawOrder![1].curve = [0, 0, 1, 1];
  });
  say(
    'O06_A05_reaches_the_draw_order_group',
    curved.failures.some((f) => f.assertion === 'A05_CURVE_ARRAY_LENGTH'),
    curved.failures.find((f) => f.assertion === 'A05_CURVE_ARRAY_LENGTH')?.detail ??
      'A05 did not walk the drawOrder group — its curve arrays are unchecked',
    'a draw order is stepped by nature; the parser ignores a stray curve rather than rejecting it',
  );
  return bad;
}

// ---------------------------------------------------------------------------
// key times against the declared duration
// ---------------------------------------------------------------------------
//
// Rule 4 and `A09` each compare ONE number per animation — the largest key time
// across every track — against the declared duration, within 1/60 s. Neither
// ever looked at an individual timeline's own last key, and rung 6 fell straight
// through the gap: its authoring tooling rounded key times to 4 dp, so a
// one-frame attachment reveal landed at 5.6667 while the animation declared
// 68/12 s (5.666666…). Being 0.000034 s past the end is nowhere near 1/60 s,
// another track already sat on the declared duration, so the animation's max key
// time was right and both checks read as agreeing. The reveal never fired, and
// only re-rendering the animation and diffing the last two frames showed it
// (issue #54).
//
// The probe declares 68/12 s on purpose: a duration no number of microseconds
// lands on. Rounding a key placed exactly there to NEAREST put it 3.3e-7 s past
// the end — legal only because `KEY_TIME_EPSILON` is a step of the grid and not
// zero. Since #99 the compiler rounds key times DOWN (`keyTime`), so that case
// now rides on the grid rather than on the tolerance, and K04 is where the
// epsilon is still load-bearing: a key read back through a Float32Array can land
// past its own declared duration by more than a whole step of the 1e-6 grid.
//
// K05/K06 are the other half of the same rule, from the player's side rather than
// the duration's: 2/12 s and 5/30 s are both 0.16666666…, nearest emits 0.166667,
// and 0.166667 is LARGER than either — so a stepped key written for sample 2 was
// applied at sample 3, inside the animation, where there is no duration to compare
// against and nothing errors (issue #99, the spineboy run's muzzle flare).

/** The rung 6 duration: 68 frames at 12 fps, and not representable in decimal. */
const SIXTY_EIGHT_TWELFTHS = 68 / 12;

/** Rung 6's key time, as its authoring tooling rounded it. */
const ROUNDED_TO_4DP = 5.6667;

/**
 * Two tracks, each with its own last key time.
 *
 * `anchor` is what made rung 6 invisible: a second track sitting on the declared
 * duration keeps the animation's max key time — the only number Rule 4 and A09
 * ever compared — correct no matter where `lastKey` lands.
 */
function keyTimeMotion(duration: number, anchor: number, lastKey: number): Record<string, unknown> {
  return {
    spec: 'rigc-motion/1',
    archetype: 'static_probe',
    cut: 'static_probe',
    easings: {},
    animations: {
      reveal: {
        duration,
        loop: false,
        tracks: [
          {
            slot: 'block',
            property: 'rgba',
            keys: [
              { t: 0, v: [1, 1, 1, 1] },
              { t: anchor, v: [1, 1, 1, 1] },
            ],
          },
          {
            slot: 'marker',
            property: 'attachment',
            keys: [
              { t: 0, v: null },
              { t: lastKey, v: 'marker' },
            ],
          },
        ],
      },
    },
  };
}

/** The 12 fps sample the spineboy run's flare was written for: 2/12 s, and 5/30 s too. */
const TWO_TWELFTHS = 2 / 12;

/**
 * A stepped attachment reveal at `revealAt`, inside an animation `duration` long.
 *
 * The `block` track only pins the declared duration; the reveal is the subject.
 * An attachment timeline is inherently stepped, which is why it is the one that
 * shows this: an interpolated track fired a frame late is a frame of slightly
 * wrong values, and a stepped one is the wrong picture outright.
 */
function steppedRevealMotion(revealAt: number, duration: number): Record<string, unknown> {
  return {
    spec: 'rigc-motion/1',
    archetype: 'static_probe',
    cut: 'static_probe',
    easings: {},
    animations: {
      reveal: {
        duration,
        loop: false,
        tracks: [
          {
            slot: 'block',
            property: 'rgba',
            keys: [
              { t: 0, v: [1, 1, 1, 1] },
              { t: duration, v: [1, 1, 1, 1] },
            ],
          },
          {
            slot: 'marker',
            property: 'attachment',
            keys: [
              { t: 0, v: null },
              { t: revealAt, v: 'marker' },
            ],
          },
        ],
      },
    },
  };
}

/** Is the reveal's attachment drawn in this sampled frame? */
function markerShows(frames: Frame[], index: number): boolean {
  return frames[index].pieces.some((piece) => piece.slot === 'marker');
}

function runKeyTimeSuite(): number {
  const dirs = writeProbeRig();
  let bad = 0;
  console.log('\n── key times against the declared duration (self-contained) ──');
  const say = (name: string, ok: boolean, detail: string, why: string): void => {
    bad += reportCase(name, ok, detail, why);
  };

  const onGrid = keyTimeMotion(SIXTY_EIGHT_TWELFTHS, SIXTY_EIGHT_TWELFTHS, SIXTY_EIGHT_TWELFTHS);
  const green = gateProbe(dirs, onGrid);
  say(
    'CONTROL_A_KEY_ON_THE_DECLARED_DURATION_IS_GREEN',
    green.failures.length === 0 && green.passed.includes('A09_ANIMATION_DURATION_MATCHES_SPEC'),
    green.failures.length === 0
      ? `both tracks key ${SIXTY_EIGHT_TWELFTHS}s, a duration no microsecond lands on — keyTime emits 5.666666`
      : `[${green.failures.map((f) => `${f.assertion}: ${f.detail}`).join('; ')}]`,
    'a key the author put ON a duration that is not a round number of microseconds must compile; before #99 it was the epsilon that allowed it, and now it is the grid',
  );

  const rounded = refusal(dirs, keyTimeMotion(SIXTY_EIGHT_TWELFTHS, SIXTY_EIGHT_TWELFTHS, ROUNDED_TO_4DP));
  say(
    'K01_a_key_rounded_past_the_declared_duration_is_refused',
    rounded !== null && rounded.includes('past the declared duration'),
    rounded === null
      ? 'the compile went through — the key that nothing will ever sample was emitted'
      : `refused with: ${rounded}`,
    'rung 6: 4 dp rounding put an attachment reveal 0.000034s past the end, 1/1000 of the tolerance Rule 4 compares with',
  );

  const artifact = gateProbeArtifacts(dirs, onGrid, (skeleton) => {
    const animations = skeleton.animations as Record<
      string,
      { slots?: Record<string, Record<string, Array<Record<string, unknown>>>> }
    >;
    const attachment = animations.reveal.slots?.marker.attachment;
    if (!attachment) throw new Error('the probe emitted no attachment timeline');
    attachment[attachment.length - 1].time = ROUNDED_TO_4DP;
  });
  say(
    'K02_A09_catches_the_same_overshoot_in_an_artifact_the_compiler_never_saw',
    artifact.failures.some((f) => f.assertion === 'A09_ANIMATION_DURATION_MATCHES_SPEC'),
    artifact.failures.find((f) => f.assertion === 'A09_ANIMATION_DURATION_MATCHES_SPEC')?.detail ??
      'A09 accepted a loaded duration 0.000034s past the one the spec declares',
    'the loaded duration IS the largest key time, so A09 sees this overshoot — it just used to tolerate 1/60 s of it',
  );

  const short = gateProbe(dirs, keyTimeMotion(1, 0.99, 0.99));
  say(
    'K03_a_last_key_inside_one_frame_of_the_end_is_still_accepted',
    short.failures.length === 0 && short.passed.includes('A09_ANIMATION_DURATION_MATCHES_SPEC'),
    short.failures.length === 0
      ? 'declared 1s, last key 0.99s — an animation may hold its final pose, and 1/60 s of slack is R7'
      : `[${short.failures.map((f) => `${f.assertion}: ${f.detail}`).join('; ')}]`,
    'only the OVERSHOOT arm is about the sample grid; tightening both would make R7 a frame-accurate duration rule',
  );

  // The compiler works in doubles on its own 1e-6 grid; the validator reads times
  // back out of a Float32Array, whose steps grow with the value. 972 frames at 30
  // fps is 32.4 s exactly — a time the 1e-6 grid holds exactly, so `keyTime`
  // changes nothing — and float32 stores it as 32.400001525878906: a legal key on
  // the declared duration, arriving 1.5e-6 s late, half again the compiler's whole
  // epsilon. A flat epsilon here would fail correct data for being long, which is
  // why A09 adds one float32 step at the duration.
  //
  // ⚠️ It used to be 971/30, and #99 made that vacuous: 32.366666… now emits as
  // 32.366666 and lands 1.8e-6 s BEFORE the declared duration, so the case passed
  // without the float32 slack being needed at all. A control that cannot fail is
  // not a control — this one is chosen so that dropping `float32Step` still
  // reddens it.
  const long = 972 / 30;
  const far = gateProbe(dirs, keyTimeMotion(long, long, long));
  say(
    'K04_a_long_animation_does_not_fail_for_float32_quantisation',
    far.failures.length === 0 && far.passed.includes('A09_ANIMATION_DURATION_MATCHES_SPEC'),
    far.failures.length === 0
      ? `${long}s declared and keyed; the emitted ${long} loads back as ${Math.fround(long)}`
      : `[${far.failures.map((f) => `${f.assertion}: ${f.detail}`).join('; ')}]`,
    'the two layers read different grids: 1e-6 s is fixed, a float32 step at 32 s is 3.8e-6 s and at 5 s is 4.8e-7 s',
  );

  // K05/K06 are about the DIRECTION the grid rounds, not about the duration, and
  // they are the pair: K05 asserts the key lands on its own sample and K06 asserts
  // the probe can still say "not yet". Without K06, an instrument that reported
  // every frame as showing the marker would pass K05 and measure nothing.
  const onSample = stepProbe(dirs, steppedRevealMotion(TWO_TWELFTHS, 4 / 12), 'reveal', PROTOCOL_FPS);
  say(
    'K05_a_stepped_key_on_the_sample_grid_fires_on_that_sample',
    markerShows(onSample, 2) && !markerShows(onSample, 1),
    markerShows(onSample, 2)
      ? `a reveal keyed at 2/12 s is drawn at sample 2 of ${PROTOCOL_FPS} fps and not before it`
      : 'the reveal keyed at 2/12 s is NOT drawn at sample 2 — it fires a frame late, silently',
    'spineboy: 2/12 s is 0.16666666…, r6 to nearest emits 0.166667, and 0.166667 > 2/12 — the muzzle flare fired one 12 fps frame late (issue #99)',
  );

  const offSample = stepProbe(dirs, steppedRevealMotion(2.5 / 12, 4 / 12), 'reveal', PROTOCOL_FPS);
  say(
    'K06_a_key_between_two_samples_still_waits_for_the_later_one',
    !markerShows(offSample, 2) && markerShows(offSample, 3),
    !markerShows(offSample, 2) && markerShows(offSample, 3)
      ? 'a reveal keyed at 2.5/12 s is drawn at sample 3 and not at sample 2 — rounding down is not "always one sample earlier"'
      : `sample 2 shows ${String(markerShows(offSample, 2))}, sample 3 shows ${String(markerShows(offSample, 3))}`,
    "K05's negative control: a probe that answered \"drawn\" for every frame would pass K05 while measuring nothing",
  );
  return bad;
}

// ---------------------------------------------------------------------------
// event definitions and event timelines
// ---------------------------------------------------------------------------
//
// ⭐ An event is the one thing a skeleton emits that is not geometry and not a
// pose: the name is structure (the rig spec declares it), the firing is time
// (the motion spec keys it), and a game listens for it. Nothing in the owning
// project's fixtures declares one, so without this suite the emitter would ship
// with no control at all — and the spineboy rung of the ladder needs them.
//
// The round-trip case is the reason this is a suite and not four more refusals.
// A compile refusal proves the compiler said no; it says nothing about whether
// the thing it DOES emit arrives at the runtime intact. So the control below
// loads the emitted skeleton through spine-core and reads the name, the time and
// the int payload back off the `EventTimeline`.

const EVENT_RIG = {
  events: {
    footfall: { int: 1 },
    voiced: { audio: 'voiced.ogg', volume: 0.8 },
  },
};

/** A motion spec whose single animation carries only an event timeline. */
function eventMotion(duration: number, events: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    spec: 'rigc-motion/1',
    archetype: 'static_probe',
    cut: 'static_probe',
    easings: {},
    animations: { step: { duration, loop: false, tracks: [], events } },
  };
}

function runEventSuite(): number {
  const dirs = writeProbeRig(EVENT_RIG);
  let bad = 0;
  console.log('\n── events (self-contained: declarations in the rig, firings in the motion) ──');
  const say = (name: string, ok: boolean, detail: string, why: string): void => {
    bad += reportCase(name, ok, detail, why);
  };

  // --- the control: it survives the runtime ---------------------------------
  const motionPath = join(dirs.dir, 'probe.motion.json');
  const motion = eventMotion(0.75, [
    { t: 0, name: 'footfall' },
    { t: 0.75, name: 'footfall', int: 7 },
  ]);
  writeFileSync(motionPath, `${JSON.stringify(motion, null, 2)}\n`);
  const built = compile({ rigPath: dirs.rigPath, motionPath, outDir: dirs.outDir, imagesDir: dirs.dir });
  const gate = validate({
    skeletonText: built.skeletonText,
    atlasText: built.atlasText,
    atlasDir: dirs.outDir,
    declaredDurations: built.declaredDurations,
    rig: built.rig,
    profile: 'spine',
  });
  say(
    'CONTROL_AN_EVENT_TIMELINE_IS_GREEN',
    gate.failures.length === 0 && gate.passed.includes('A32_EVENT_KEYS_RESOLVE'),
    gate.failures.length === 0
      ? `${gate.passed.length} assertions ran; A32 ${gate.passed.includes('A32_EVENT_KEYS_RESOLVE') ? 'ran' : 'did NOT run'}`
      : `[${gate.failures.map((f) => `${f.assertion}: ${f.detail}`).join('; ')}]`,
    'a suite made only of refusals cannot tell a compiler that emits nothing from one that emits the right thing',
  );

  const posable = posableFromText(built.skeletonText, built.atlasText, dirs.outDir);
  const declared = posable.data.events.map((e) => e.name);
  say(
    'V01_the_declaration_survives_the_round_trip',
    declared.includes('footfall') && declared.includes('voiced'),
    `spine-core loaded events [${declared.join(', ')}]`,
    'root.events is an OBJECT keyed by name, the one top-level collection in the format that is not an array',
  );

  const timeline = posable.data
    .findAnimation('step')
    ?.timelines.find((t): t is EventTimeline => t instanceof EventTimeline);
  const fired = timeline ? timeline.events.map((e) => ({ name: e.data.name, time: e.time, int: e.intValue })) : [];
  say(
    'V02_each_firing_loads_back_with_its_name_time_and_int',
    fired.length === 2 &&
      fired[0].name === 'footfall' &&
      fired[0].time === 0 &&
      // No override on the first key, so it inherits the declaration's int of 1.
      fired[0].int === 1 &&
      fired[1].name === 'footfall' &&
      Math.abs(fired[1].time - 0.75) < 1e-6 &&
      fired[1].int === 7,
    `EventTimeline holds ${JSON.stringify(fired)}`,
    'an override the parser dropped and an override that matched the default are the same object once loaded — so the numbers have to differ',
  );

  // --- the refusals ---------------------------------------------------------
  const undeclaredEvent = refusal(dirs, eventMotion(0.5, [{ t: 0.5, name: 'footfalll' }]));
  say(
    'V03_a_firing_of_an_undeclared_event_is_refused',
    undeclaredEvent !== null && undeclaredEvent.includes('is not declared in the rig spec'),
    undeclaredEvent === null ? 'the compile went through' : `refused with: ${undeclaredEvent}`,
    'SkeletonJson.ts:1244 throws `Event not found` — loud, but in the consumer’s process, which is late',
  );

  const backwards = refusal(
    dirs,
    eventMotion(0.5, [
      { t: 0.5, name: 'footfall' },
      { t: 0.25, name: 'footfall' },
    ]),
  );
  say(
    'V04_event_key_times_that_go_backwards_are_refused',
    backwards !== null && backwards.includes('must not go backwards'),
    backwards === null ? 'the compile went through' : `refused with: ${backwards}`,
    'readAnimation fills frame i from key i in array order and never sorts, so the earlier firing becomes unreachable',
  );

  const together = refusal(
    dirs,
    eventMotion(0.5, [
      { t: 0.5, name: 'footfall' },
      { t: 0.5, name: 'voiced' },
    ]),
  );
  say(
    'V05_two_events_on_one_frame_are_accepted',
    together === null,
    together === null
      ? 'equal times are not a contradiction the way two values at one time would be — two things can happen at once'
      : `refused with: ${together}`,
    'the ordering rule has to be non-decreasing, not strictly increasing, or a footfall and its sound could not share a frame',
  );

  const silent = refusal(dirs, eventMotion(0.5, [{ t: 0.5, name: 'footfall', volume: 0.5 }]));
  say(
    'V06_volume_on_an_event_with_no_audio_is_refused',
    silent !== null && silent.includes('declares no "audio"'),
    silent === null ? 'the compile went through' : `refused with: ${silent}`,
    'SkeletonJson.ts:1254-1257 reads volume only inside `if (event.data.audioPath)` — otherwise it is dropped in silence',
  );

  const declaredSilently = writeProbeRig({ events: { footfall: { volume: 0.5 } } });
  const badDeclaration = refusal(declaredSilently, eventMotion(0.5, [{ t: 0.5, name: 'footfall' }]));
  say(
    'V07_a_declaration_with_volume_and_no_audio_is_refused',
    badDeclaration !== null && badDeclaration.includes('declares volume but no "audio"'),
    badDeclaration === null ? 'the compile went through' : `refused with: ${badDeclaration}`,
    'the same silence one level up: SkeletonJson.ts:478-481 reads the setup volume only when an audio path is set',
  );

  return bad;
}

// ---------------------------------------------------------------------------
// bounding boxes and clipping attachments
// ---------------------------------------------------------------------------
//
// ⭐ These two are the only attachment types whose purpose is entirely outside
// the renderer: a bounding box is a polygon the game hit-tests, a clipping
// attachment is a mask over the slots behind it. Neither draws a pixel, which is
// exactly why they need a suite — every downstream check this repository has
// (the rasteriser, `check`, the diff's region measures) is blind to both, so a
// bounding box that loaded with zero vertices would sail through all of them.
//
// The round-trip cases are the point. `A33` reads the loaded objects, but a
// validator and a compiler that agree with each other prove nothing; these read
// the geometry and the end slot back off spine-core and compare them with the
// numbers the spec wrote.

const POLYGON_RIG = {
  skins: {
    default: {
      block: { block: { image: 'block.png' } },
      marker: {
        marker: { image: 'marker.png' },
        marker_bb: { type: 'boundingbox', vertexCount: 4, vertices: [0, 0, 12, 0, 12, 8, 0, 8], color: 'ce3a3aff' },
        marker_clip: { type: 'clipping', end: 'marker', vertexCount: 3, vertices: [0, 0, 20, 0, 0, 20] },
      },
    },
  },
};

const POLYGON_MOTION = {
  spec: 'rigc-motion/1',
  archetype: 'static_probe',
  cut: 'static_probe',
  easings: {},
  animations: {},
};

function runPolygonSuite(): number {
  const dirs = writeProbeRig(POLYGON_RIG);
  let bad = 0;
  console.log('\n── bounding boxes and clipping (self-contained) ──');
  const say = (name: string, ok: boolean, detail: string, why: string): void => {
    bad += reportCase(name, ok, detail, why);
  };

  const motionPath = join(dirs.dir, 'probe.motion.json');
  writeFileSync(motionPath, `${JSON.stringify(POLYGON_MOTION, null, 2)}\n`);
  const built = compile({ rigPath: dirs.rigPath, motionPath, outDir: dirs.outDir, imagesDir: dirs.dir });
  const gate = validate({
    skeletonText: built.skeletonText,
    atlasText: built.atlasText,
    atlasDir: dirs.outDir,
    declaredDurations: built.declaredDurations,
    rig: built.rig,
    profile: 'spine',
  });
  say(
    'CONTROL_A_RIG_WITH_A_BOX_AND_A_CLIP_IS_GREEN',
    gate.failures.length === 0 && gate.passed.includes('A33_VERTEX_ATTACHMENT_GEOMETRY'),
    gate.failures.length === 0
      ? `${gate.passed.length} assertions ran; A33 ${gate.passed.includes('A33_VERTEX_ATTACHMENT_GEOMETRY') ? 'ran' : 'did NOT run'}`
      : `[${gate.failures.map((f) => `${f.assertion}: ${f.detail}`).join('; ')}]`,
    'neither type draws a pixel, so every other check in this repository is blind to both — this is the only one that is not',
  );

  const policy = validate({
    skeletonText: built.skeletonText,
    atlasText: built.atlasText,
    atlasDir: dirs.outDir,
    declaredDurations: built.declaredDurations,
    rig: built.rig,
    profile: 'spine-html',
  });
  say(
    'P01_the_same_rig_is_refused_by_the_renderer_profile',
    policy.failures.some((f) => f.assertion === 'A11_NO_CLIPPING_ATTACHMENTS'),
    policy.failures.find((f) => f.assertion === 'A11_NO_CLIPPING_ATTACHMENTS')?.detail ??
      'A11 accepted a clipping attachment under the profile whose renderer skips them',
    'valid Spine that one renderer will not draw: the emitter must be able to write it and the policy must still say no',
  );

  const posable = posableFromText(built.skeletonText, built.atlasText, dirs.outDir);
  const skin = posable.data.findSkin('default');
  const box = skin?.getAttachment(posable.data.findSlot('marker')!.index, 'marker_bb');
  say(
    'P02_the_bounding_box_loads_back_with_its_polygon',
    box instanceof BoundingBoxAttachment &&
      box.worldVerticesLength === 8 &&
      !box.bones &&
      [...box.vertices].join(',') === '0,0,12,0,12,8,0,8',
    box instanceof BoundingBoxAttachment
      ? `worldVerticesLength ${box.worldVerticesLength}, vertices [${[...box.vertices].join(', ')}]`
      : `the skin returned ${box === null || box === undefined ? 'nothing' : box.constructor.name}`,
    'a box that loaded with zero vertices is indistinguishable from a correct one everywhere except here',
  );

  const clip = skin?.getAttachment(posable.data.findSlot('marker')!.index, 'marker_clip');
  say(
    'P03_the_clip_loads_back_pointing_at_its_end_slot',
    clip instanceof ClippingAttachment && clip.endSlot?.name === 'marker' && clip.worldVerticesLength === 6,
    clip instanceof ClippingAttachment
      ? `endSlot ${clip.endSlot ? `"${clip.endSlot.name}"` : 'null'}, worldVerticesLength ${clip.worldVerticesLength}`
      : `the skin returned ${clip === null || clip === undefined ? 'nothing' : clip.constructor.name}`,
    'findSlot returns null on a miss and the parser assigns it, so "ends nowhere" has to be told apart from "ends here"',
  );

  // --- the refusals ---------------------------------------------------------
  const weighted = writeProbeRig({
    skins: {
      default: {
        block: { block: { image: 'block.png' } },
        marker: {
          marker: { image: 'marker.png' },
          marker_bb: {
            type: 'boundingbox',
            vertexCount: 3,
            weights: [
              [{ bone: 'block', x: 0, y: 0, weight: 1 }],
              [{ bone: 'block', x: 12, y: 0, weight: 1 }],
              [{ bone: 'no_such_bone', x: 12, y: 8, weight: 1 }],
            ],
          },
        },
      },
    },
  });
  const unknownBone = refusal(weighted, POLYGON_MOTION);
  say(
    'P04_a_weighted_box_binding_an_unknown_bone_is_refused',
    unknownBone !== null && unknownBone.includes('which the rig does not declare as a bone'),
    unknownBone === null ? 'the compile went through' : `refused with: ${unknownBone}`,
    'the polygon shares the mesh’s by-name encoder, so it inherits the refusal issue #45 was filed for',
  );

  const deferred = writeProbeRig({
    skins: {
      default: {
        block: { block: { image: 'block.png' } },
        marker: { marker: { image: 'marker.png' }, marker_pt: { type: 'point', x: 1, y: 2 } },
      },
    },
  });
  const notImplemented = refusal(deferred, POLYGON_MOTION);
  say(
    'P05_a_deferred_attachment_type_says_why_it_is_deferred',
    notImplemented !== null &&
      notImplemented.includes('rigc does not emit it yet') &&
      notImplemented.includes('benchmark corpus'),
    notImplemented === null ? 'the compile went through' : `refused with: ${notImplemented}`,
    'a NotImplementedError is a promise about the failure mode, and a deferral without its reason is a wall (issue #5)',
  );

  return bad;
}

// ---------------------------------------------------------------------------
// the mesh rasteriser — the path `check` had no way to draw before #27
// ---------------------------------------------------------------------------
//
// `src/render.ts` used to refuse a mesh attachment by name, which stopped the
// whole frame-fidelity lane at rung 5: no reference frames for rungs 6, 7 or 8,
// and therefore no `check` on them either. The controls below are the ones that
// would have caught that refusal coming back, and the ones that say the
// replacement actually draws something.
//
// Three of them run on a fixture this file generates and need no corpus. The
// fourth needs `examples/6-arcs`, and reports a HOLE rather than a pass when it
// is absent — an assertion with nothing to measure has measured nothing.
//
// The `MR` prefix keeps them apart from the overlay fixture's `M##` mutants,
// which are numbered from an unrelated table and print in the same run.
//
// ⚠️ What these do NOT claim: that a mesh looks right. A checkerboard plate
// cannot support a claim about appearance and none is made. They claim that a
// mesh is posed at all, that its pixels reach the coverage mask `frameGeometry`
// hands to `check`, that a deform moves them, and that two triangles sharing an
// edge do not both draw it.

/** How far M02's deform pushes the iris mesh, in the rig's own units. */
const DEFORM_NUDGE = 12;

/** The posed pieces of a compiled fixture's first animation, at the protocol rate. */
function poseFixture(opts: Options): { posable: Posable; frames: Frame[] } {
  const built = compile(opts);
  const posable = posableFromText(built.skeletonText, built.atlasText, opts.outDir);
  const animation = posable.data.animations[0];
  const frames = animation
    ? sampleAnimation(posable.data, animation.name, PROTOCOL_FPS)
    : sampleSetupPose(posable.data);
  return { posable, frames };
}

/**
 * Pose one frame with every deform offset of `slotName`'s mesh set to `(dx, dy)`.
 *
 * ⭐ The skeleton pose is untouched — no bone moves, no timeline changes. That is
 * what makes this a test of the *deform* path specifically: if the pixels move,
 * the only thing that can have moved them is `SlotPose.deform` being read.
 *
 * The array's length is `influences x 2` either way. For an unweighted mesh the
 * deform array REPLACES the local vertices, one `x, y` per vertex; for a weighted
 * one it carries an offset per bone influence, and `vertices` holds one
 * `x, y, weight` triple per influence. Same count, two meanings — which is why
 * this derives it from the attachment rather than assuming either.
 */
function poseWithDeform(data: SkeletonData, slotName: string, dx: number, dy: number): Frame {
  const skeleton = new Skeleton(data);
  skeleton.setupPose();
  const slot = skeleton.slots.find((s) => s.data.name === slotName);
  if (!slot) throw new Error(`the fixture has no slot "${slotName}"`);
  const attachment = slot.appliedPose.attachment;
  if (!(attachment instanceof MeshAttachment)) {
    throw new Error(`slot "${slotName}" does not show a mesh in the setup pose`);
  }
  const influences = attachment.bones ? attachment.vertices.length / 3 : attachment.worldVerticesLength / 2;
  const deform = slot.appliedPose.deform;
  deform.length = 0;
  for (let i = 0; i < influences; i++) deform.push(dx, dy);
  skeleton.update(0);
  skeleton.updateWorldTransform(Physics.reset);
  return { index: 0, time: 0, pieces: piecesOf(skeleton) };
}

/** The largest number of times any one destination pixel was drawn by one piece. */
function worstOverdraw(piece: Piece, pages: Map<string, Plate>, viewport: Viewport): number {
  const hits = new Map<number, number>();
  rasterisePiece(pageFor(pages, piece), piece, projector(viewport), viewport, (px, py) => {
    const key = py * viewport.width + px;
    hits.set(key, (hits.get(key) ?? 0) + 1);
  });
  let worst = 0;
  for (const n of hits.values()) worst = Math.max(worst, n);
  return worst;
}

/**
 * The slot the articulated fixture's manifest promotes to a ring mesh.
 *
 * `collar` rather than the overlay probe's `iris`, for one structural reason:
 * `iris` has no setup attachment — its manifest gives it a `closed: null` state —
 * so the setup pose and the `idle` animation both show nothing there, and a
 * deform baseline needs a mesh that is on screen before anything is keyed.
 */
const MESH_SLOT = 'collar';

function runMeshSuite(): number {
  let bad = 0;
  console.log('\n── mesh rasterising (fixture: the articulated probe\'s ring mesh) ──');
  const say = (name: string, ok: boolean, detail: string, why: string): number => reportCase(name, ok, detail, why);

  const opts = optsForFixture(ARTICULATED);
  const { posable, frames } = poseFixture(opts);
  const withMesh = frames.find((frame) => frame.pieces.some((p) => p.kind === 'mesh' && p.slot === MESH_SLOT));
  const meshPiece = withMesh?.pieces.find((p): p is Mesh => p.kind === 'mesh' && p.slot === MESH_SLOT);

  bad += say(
    'MR00_CONTROL_A_MESH_RIG_POSES_A_MESH',
    meshPiece !== undefined,
    meshPiece
      ? `slot "${MESH_SLOT}" posed a mesh of ${meshPiece.world.length / 2} vertices and ` +
          `${meshPiece.triangles.length / 3} triangles`
      : `no frame of the fixture posed a mesh on slot "${MESH_SLOT}" — everything below would be vacuous`,
    'a suite that measures mesh pixels on a rig that poses no mesh reports green over nothing',
  );
  if (!meshPiece || !withMesh) return bad + 3;

  // --- coverage ------------------------------------------------------------
  // `frameGeometry`'s coverage mask and per-slot footprints are what `check`
  // measures a candidate on. A mesh that draws to the plate but not into the mask
  // would read as a part that is simply missing.
  const viewport = framingViewport(posable.data, 256);
  if (!viewport) return bad + 3 + say('MR01_A_POSED_MESH_COVERS_PIXELS', false, 'the fixture framed to nothing', '');
  const geometry = frameGeometry(withMesh, posable.pages, viewport);
  const footprint = geometry.footprints.get(MESH_SLOT);
  let covered = 0;
  for (const bit of geometry.coverage) covered += bit;
  bad += say(
    'MR01_A_POSED_MESH_COVERS_PIXELS',
    (footprint?.pixels ?? 0) > 0 && covered > 0,
    `slot "${MESH_SLOT}" weighs ${(footprint?.pixels ?? 0).toFixed(1)} px in its own footprint, ` +
      `and the frame's coverage mask holds ${covered} px`,
    'check reads a candidate through the coverage mask, so a mesh missing from it reads as a missing part',
  );

  // --- the deform path -----------------------------------------------------
  // Paired on purpose. An empty deform must leave the pose exactly where the
  // setup pose put it, or "the deform moved it" is not a claim about the deform.
  const still = poseWithDeform(posable.data, MESH_SLOT, 0, 0);
  const nudged = poseWithDeform(posable.data, MESH_SLOT, DEFORM_NUDGE, 0);
  const centroid = (frame: Frame): Footprint =>
    frameGeometry(frame, posable.pages, viewport).footprints.get(MESH_SLOT) ?? EMPTY_FOOTPRINT;
  const base = centroid(still);
  const moved = centroid(nudged);
  const shift = Math.hypot(moved.cx - base.cx, moved.cy - base.cy);
  const setupFootprint = centroid(sampleSetupPose(posable.data)[0]);
  const emptyIsIdentity = Math.hypot(base.cx - setupFootprint.cx, base.cy - setupFootprint.cy) < 1e-9;
  bad += say(
    'MR02_A_VERTEX_DEFORM_MOVES_THE_CENTROID',
    emptyIsIdentity && shift > 1,
    emptyIsIdentity
      ? `an all-zero deform left the centroid exactly where the setup pose put it, and a ${DEFORM_NUDGE}-unit ` +
          `offset moved it ${shift.toFixed(2)} px`
      : 'an all-zero deform already moved the centroid, so this measures the harness rather than the deform',
    'a deform timeline that is stepped and ignored is invisible to every structural measure there is',
  );

  // --- the fill rule -------------------------------------------------------
  // Two triangles that share an edge must cover the pixels along it exactly once;
  // twice is a lattice of double-blended seams and none is a lattice of holes.
  // The synthetic pair is the instrument's own control: it genuinely overlaps, so
  // a counter that cannot see 2 there cannot report 1 anywhere as evidence.
  const overlapping: Mesh = {
    ...meshPiece,
    world: [...meshPiece.world.slice(0, 6), ...meshPiece.world.slice(0, 6)],
    uvs: [...Array.from(meshPiece.uvs).slice(0, 6), ...Array.from(meshPiece.uvs).slice(0, 6)],
    triangles: [0, 1, 2, 3, 4, 5],
  };
  const shared = worstOverdraw(meshPiece, posable.pages, viewport);
  const doubled = worstOverdraw(overlapping, posable.pages, viewport);
  bad += say(
    'MR03_SHARED_EDGES_ARE_DRAWN_ONCE',
    shared === 1 && doubled === 2,
    `the fixture's ${meshPiece.triangles.length / 3} triangles cover their worst pixel ${shared}x, ` +
      `while two deliberately coincident triangles cover theirs ${doubled}x`,
    'source-over blending makes a doubly-covered edge visible wherever the art is not opaque',
  );
  return bad;
}

/** The rung-6 transcription and the frames it is measured against. */
const MESH_TRANSCRIPTION = resolve(import.meta.dir, 'bench/transcriptions/6-arcs');
const MESH_FRAMES = resolve(import.meta.dir, 'bench/reference/6-arcs');
const MESH_IMAGES = resolve(import.meta.dir, 'examples/6-arcs/images');
/** The slots whose attachments are meshes, which is what these two controls are about. */
const MESH_SLOTS = ['ball', 'tail'];

/** Compile the rung-6 transcription, optionally through a rewritten spec. */
function compileMeshTranscription(
  rigText: string | null,
  motionText?: string,
): {
  skeletonText: string;
  atlasText: string;
  atlasDir: string;
  rig: CompileResult['rig'];
} {
  const outDir = mkdtempSync(join(tmpdir(), 'rigc-mesh-'));
  let rigPath = join(MESH_TRANSCRIPTION, '6-arcs-pro.rig.json');
  if (rigText !== null) {
    rigPath = join(outDir, 'rewritten.rig.json');
    writeFileSync(rigPath, rigText);
  }
  let motionPath = join(MESH_TRANSCRIPTION, '6-arcs-pro.motion.json');
  if (motionText !== undefined) {
    motionPath = join(outDir, 'rewritten.motion.json');
    writeFileSync(motionPath, motionText);
  }
  const result = compile({ rigPath, motionPath, outDir, imagesDir: MESH_IMAGES });
  return { skeletonText: result.skeletonText, atlasText: result.atlasText, atlasDir: outDir, rig: result.rig };
}

/** The rung-6 motion spec as text, which the two change-fidelity mutants rewrite. */
function meshMotionText(): string {
  return readFileSync(join(MESH_TRANSCRIPTION, '6-arcs-pro.motion.json'), 'utf8');
}

/** How many degrees the plateau mutant tilts a held segment by. */
const PLATEAU_NUDGE = 6;

/**
 * The same motion with its busiest rotation carried on past its last key.
 *
 * This is rung 6's own defect, reproduced (LOOP.md §10): greedy key reduction is
 * allowed to slope a line through a plateau while every individual key stays
 * inside its tolerance, so the held tail keeps drifting across frames the
 * reference holds pixel-identical. One key appended **at the animation's own
 * duration** does the same thing — nothing between the old last key and the end
 * holds still any more — and it keeps `A09` satisfied, which matters because a
 * control has to be a rig the gate passes.
 *
 * Structural, with no measured number in it: the track is chosen as the rotation
 * with the most keys, and the nudge is a delta in degrees rather than a value read
 * off this shot.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function slopeThroughAPlateau(motionText: string): string | null {
  const motion = JSON.parse(motionText);
  for (const animation of Object.values(motion.animations) as any[]) {
    const rotations = (animation.tracks as any[])
      .filter((t: any) => t.property === 'rotate' && Array.isArray(t.keys) && t.keys.length > 0)
      .sort((a: any, b: any) => b.keys.length - a.keys.length);
    if (rotations.length === 0) return null;
    const keys = rotations[0].keys as any[];
    const last = keys[keys.length - 1];
    if (!(last.t < animation.duration)) return null;
    keys.push({ t: animation.duration, v: [last.v[0] + PLATEAU_NUDGE] });
  }
  return `${JSON.stringify(motion, null, 2)}\n`;
}

/**
 * The same motion with its one-frame attachment reveal never firing.
 *
 * The other half of LOOP.md §10: the reveal's key landed a fraction of a
 * millisecond past the animation's last sample, so the attachment never appeared.
 * Reproduced here by keying `null` at the same moment instead of moving the time,
 * because moving it past the duration is a compile error and a control has to be a
 * rig the gate passes. What lands in the frames is identical: the last frame does
 * not change, where the reference's does.
 */
function dropAOneFrameReveal(motionText: string): string | null {
  const motion = JSON.parse(motionText);
  let dropped = 0;
  for (const animation of Object.values(motion.animations) as any[]) {
    for (const track of animation.tracks as any[]) {
      if (track.property !== 'attachment') continue;
      for (const key of track.keys as any[]) {
        if (key.v === null) continue;
        key.v = null;
        dropped++;
      }
    }
  }
  return dropped === 0 ? null : `${JSON.stringify(motion, null, 2)}\n`;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Every frame whose own change from the frame before it disagrees with the reference's. */
function changeDisagreements(report: CheckReport): Array<{ dir: string; index: number; change: FrameChange }> {
  const out: Array<{ dir: string; index: number; change: FrameChange }> = [];
  for (const anim of report.animations) {
    for (const frame of anim.frames) {
      if (frame.change && frame.change.verdict !== 'agrees') {
        out.push({ dir: anim.dir, index: frame.index, change: frame.change });
      }
    }
  }
  return out;
}

/** Adjacent pairs across which the REFERENCE itself holds pixel-identical, or moves. */
function referenceRhythm(report: CheckReport): { held: number; moved: number; smallest: number } {
  let held = 0;
  let moved = 0;
  let smallest = Infinity;
  for (const anim of report.animations) {
    for (const frame of anim.frames) {
      if (!frame.change) continue;
      if (frame.change.reference === 0) held++;
      else {
        moved++;
        smallest = Math.min(smallest, frame.change.reference);
      }
    }
  }
  return { held, moved, smallest: Number.isFinite(smallest) ? smallest : 0 };
}

/** The median and worst drift of the mesh-bearing slots, over every frame compared. */
function meshDrift(report: CheckReport): { median: number; worst: number; samples: number } {
  const drifts: number[] = [];
  for (const anim of report.animations) {
    for (const frame of anim.frames) {
      for (const slot of frame.slots) {
        if (slot.drift !== null && MESH_SLOTS.includes(slot.slot)) drifts.push(slot.drift);
      }
    }
  }
  drifts.sort((a, b) => a - b);
  return {
    median: drifts.length ? drifts[drifts.length >> 1] : Infinity,
    worst: drifts.length ? drifts[drifts.length - 1] : Infinity,
    samples: drifts.length,
  };
}

/**
 * Rewrite a rig spec's by-name mesh `weights` back into Spine's raw index run,
 * with every bone index shifted by one.
 *
 * ⚠️ This is the break issue #45 named, in the form it used to arrive in. An
 * authored mesh's weights used to bind bones by **index into the emitted bone
 * array** — the one place a rig spec did not resolve by name — so inserting a
 * bone anywhere ahead of the meshes did exactly this, in silence, on a rig
 * nobody meant to change. The gate stayed green because every index was still in
 * range and every vertex's weights still summed to 1, which is all A04 and A20
 * can ask of a number with no name attached to it.
 *
 * `flag` decides which half of the fix is under test:
 *   * `false` — the run arrives with no `boneIndexing`, and the compiler must
 *     refuse it. That is MR06 now.
 *   * `true`  — the spec says `"boneIndexing": "raw"` and gets the index form it
 *     asked for, silence included. That escape hatch still has its old cost, and
 *     MR07 holds the line there the way MR06 used to: gate green, `check` loud.
 */
function rawShiftedMeshWeights(rigText: string, flag: boolean): string {
  interface Binding {
    bone: string;
    x: number;
    y: number;
    weight: number;
  }
  interface Att {
    type?: string;
    uvs?: number[];
    weights?: Binding[][];
    vertices?: number[];
    boneIndexing?: string;
  }
  const rig = JSON.parse(rigText) as {
    bones: Array<{ name: string }>;
    skins: Record<string, Record<string, Record<string, Att>>>;
  };
  const index = new Map(rig.bones.map((b, i) => [b.name, i]));
  const last = rig.bones.length - 1;
  for (const slots of Object.values(rig.skins)) {
    for (const atts of Object.values(slots)) {
      for (const att of Object.values(atts)) {
        if (att.type !== 'mesh' || !att.weights) continue;
        const run: number[] = [];
        for (const vertex of att.weights) {
          run.push(vertex.length);
          for (const b of vertex) run.push(Math.min(last, (index.get(b.bone) ?? 0) + 1), b.x, b.y, b.weight);
        }
        delete att.weights;
        att.vertices = run;
        if (flag) att.boneIndexing = 'raw';
      }
    }
  }
  return `${JSON.stringify(rig, null, 2)}\n`;
}

/**
 * The mesh path measured end to end: a faithful mesh rig against real reference
 * frames, and the silent break that only this instrument can see.
 *
 * ⭐ Why these are worth more than `MR00`–`MR03`. Those run on a generated
 * checkerboard and answer "does a mesh reach the plate at all". These answer "does
 * it reach the *right pixels*", against frames rendered from the example's own
 * export — which is the only claim that would catch a mesh drawn with its UVs
 * transposed, its triangles wound the other way, or its deform applied to the
 * wrong vertices.
 */
function runMeshCheckSuite(): number | null {
  console.log('\n── rigc check on meshes (fixture: the rung 6 transcription vs rung 6 reference frames) ──');
  if (!existsSync(MESH_IMAGES) || !existsSync(join(MESH_FRAMES, 'frames.json'))) {
    console.log('  SKIP  the mesh check self-checks did not run.');
    console.log(`          expected art at   ${MESH_IMAGES}`);
    console.log(`          expected frames at ${MESH_FRAMES}/frames.json`);
    console.log('          run `bun run fetch-examples`.');
    console.log('          ⚠️ This is a HOLE in this run, not a pass — the mesh rasteriser was never measured.');
    return null;
  }
  let bad = 0;
  const say = (name: string, ok: boolean, detail: string, why: string): number => reportCase(name, ok, detail, why);

  const rigText = readFileSync(join(MESH_TRANSCRIPTION, '6-arcs-pro.rig.json'), 'utf8');
  const faithful = compileMeshTranscription(null);
  const faithfulReport = checkAgainstFrames({ ...faithful, framesDir: MESH_FRAMES });
  const f = checkExtremes(faithfulReport);
  const fd = meshDrift(faithfulReport);
  // The colour residual is the atlas resampling and nothing else — the reference
  // frames come from the example's packed page, which ships at `scale: 0.5`, and
  // the candidate is compiled from the loose full-size PNGs beside it.
  bad += say(
    'MR05_A_FAITHFUL_MESH_RIG_LANDS_ON_THE_REFERENCE',
    f.sets === 2 && fd.median < 0.5 && fd.worst < 3 && f.meanMae < 6,
    `${fd.samples} mesh-slot drifts: median ${fd.median.toFixed(2)}px, worst ${fd.worst.toFixed(2)}px; ` +
      `union MAE ${f.meanMae.toFixed(2)}, whole-frame ${f.frameMae.toFixed(2)}`,
    'a rasteriser that draws meshes in roughly the right place is not the same as one that draws them right',
  );

  // MR06. The rebind used to arrive silently and `check` was the only instrument
  // that could see it. It is now refused at compile, by name, so the control
  // moved one gate earlier — it asserts a REFUSAL rather than a loud reading.
  let refusal = '';
  try {
    compileMeshTranscription(rawShiftedMeshWeights(rigText, false));
  } catch (err) {
    refusal = (err as Error).message;
  }
  bad += say(
    'MR06_A_SILENTLY_REBOUND_MESH_IS_REFUSED',
    refusal.includes('boneIndexing'),
    refusal ? `refused: ${refusal.split(' — ')[0]}` : 'the compiler accepted a raw index run with no boneIndexing flag',
    'a weighted run whose bone indexes the spec never wrote is a rebinding waiting to happen; it has to be asked for out loud',
  );

  // MR07. The escape hatch still costs what it always cost. Green gate first, or
  // the control proves nothing: the point is that the file is valid Spine 4.3 and
  // plays a different shot, which is why `check` exists.
  const shifted = compileMeshTranscription(rawShiftedMeshWeights(rigText, true));
  const gate = validate({
    skeletonText: shifted.skeletonText,
    atlasText: shifted.atlasText,
    atlasDir: shifted.atlasDir,
    profile: 'spine',
  });
  const shiftedReport = checkAgainstFrames({ ...shifted, framesDir: MESH_FRAMES });
  const sd = meshDrift(shiftedReport);
  const s2 = checkExtremes(shiftedReport);
  bad += say(
    'MR07_THE_RAW_INDEXING_ESCAPE_HATCH_STILL_COSTS_SILENCE',
    gate.failures.length === 0 && sd.worst > fd.worst * 3 && s2.meanMae > f.meanMae * 2,
    gate.failures.length === 0
      ? `gate green, mesh drift ${sd.worst.toFixed(1)}px against a faithful ${fd.worst.toFixed(2)}px, ` +
          `union MAE ${s2.meanMae.toFixed(1)} against ${f.meanMae.toFixed(1)}`
      : `the shifted rig did not pass the gate — [${gate.failures.map((x) => x.assertion).join(', ')}] fired, ` +
          'so this measures the gate rather than check',
    '"boneIndexing": "raw" opts back into index binding, and the gate still cannot see a rebind under it',
  );

  // MR08. #44: the transcription is correct foreign geometry, and the DEFAULT
  // profile has to say so. The generator-topology assertions have nothing to
  // measure on a mesh rigc did not build, and nothing to measure is a SKIP.
  const faithfulGate = validate({
    skeletonText: faithful.skeletonText,
    atlasText: faithful.atlasText,
    atlasDir: faithful.atlasDir,
    profile: 'spine-html',
    rig: faithful.rig,
  });
  const skipped = new Map(faithfulGate.skipped.map((x) => [x.assertion, x.reason]));
  const topology = ['A21_MESH_RIM_PINNED', 'A28_RIBBON_ROWS_SHARE_WEIGHTS'];
  const missing = topology.filter((name) => !skipped.has(name));
  bad += say(
    'MR08_AUTHORED_MESHES_SKIP_THE_GENERATOR_TOPOLOGY_RULES',
    faithfulGate.failures.length === 0 && missing.length === 0,
    faithfulGate.failures.length === 0
      ? `green under spine-html; ${topology.map((n) => `${n} SKIP (${skipped.get(n)?.slice(0, 48)}…)`).join('; ')}`
      : `${faithfulGate.failures.length} failure(s) on correct foreign geometry: ` +
          `[${[...new Set(faithfulGate.failures.map((x) => x.assertion))].join(', ')}]`,
    'an assertion that calls correct foreign data broken is worse than one that says it has nothing to measure',
  );

  // --- per-frame change fidelity (issue #53) ------------------------------
  //
  // These three live on this fixture because rung 6's frames are the only set in
  // the corpus that HOLDS STILL: the reference is pixel-identical across f64-f67
  // and then changes by three pixels at f68, a one-frame reveal. Everything else
  // in the ladder moves every frame, and a measure about held poses and one-frame
  // events cannot be controlled on frames that never hold and never blink.
  //
  // Both mutants below are the run's own two defects (LOOP.md §10). Both are green
  // at the gate, both leave `diff`'s structural measures where they were, and both
  // leave the aggregate union MAE unmoved — which is the whole reason the per-frame
  // change columns exist. MR09 asserts the fixture actually contains the rhythm the
  // other two break, so that "no disagreements" is a result rather than a vacuum.
  const rhythm = referenceRhythm(faithfulReport);
  const faithfulChanges = changeDisagreements(faithfulReport);
  bad += say(
    'MR09_A_FAITHFUL_RIG_MOVES_WHEN_THE_REFERENCE_MOVES',
    rhythm.held > 0 && rhythm.moved > 0 && faithfulChanges.length === 0,
    `the reference holds still across ${rhythm.held} adjacent pair(s) and moves across ${rhythm.moved} ` +
      `(smallest ${rhythm.smallest} px); the transcription disagrees on ${faithfulChanges.length}`,
    'a measure of held poses proves nothing on frames that never hold — the fixture has to contain the rhythm',
  );

  const sloped = slopeThroughAPlateau(meshMotionText());
  const slopedReport =
    sloped === null ? null : checkAgainstFrames({ ...compileMeshTranscription(null, sloped), framesDir: MESH_FRAMES });
  const slopedChanges = slopedReport === null ? [] : changeDisagreements(slopedReport);
  const brokePlateau = slopedChanges.filter((c) => c.change.verdict === 'moves' && c.change.reference === 0);
  const slopedMae = slopedReport === null ? 0 : checkExtremes(slopedReport).meanMae;
  bad += say(
    'MR10_A_HELD_POSE_THAT_IS_NOT_HELD_IS_NAMED',
    slopedReport !== null && brokePlateau.length > 0 && Math.abs(slopedMae - f.meanMae) < 0.1,
    slopedReport === null
      ? 'the fixture has no rotation track to carry past its last key'
      : `${brokePlateau.length} frame(s) named (${brokePlateau
          .map((c) => `f${String(c.index).padStart(4, '0')} ${c.change.candidate}px vs 0`)
          .join(', ')}) while the union MAE stays ${slopedMae.toFixed(2)} against a faithful ${f.meanMae.toFixed(2)}`,
    'greedy key reduction may slope a line through a plateau inside its own tolerance, and the aggregate cannot see it',
  );

  const withoutReveal = dropAOneFrameReveal(meshMotionText());
  const revealReport =
    withoutReveal === null
      ? null
      : checkAgainstFrames({ ...compileMeshTranscription(null, withoutReveal), framesDir: MESH_FRAMES });
  const revealChanges = revealReport === null ? [] : changeDisagreements(revealReport);
  const missedReveal = revealChanges.filter((c) => c.change.verdict === 'holds' && c.change.candidate === 0);
  const revealMae = revealReport === null ? 0 : checkExtremes(revealReport).meanMae;
  bad += say(
    'MR11_A_ONE_FRAME_EVENT_THAT_NEVER_FIRED_IS_NAMED',
    revealReport !== null && missedReveal.length > 0 && Math.abs(revealMae - f.meanMae) < 0.1,
    revealReport === null
      ? 'the fixture has no attachment timeline to drop'
      : `${missedReveal.length} frame(s) named (${missedReveal
          .map((c) => `f${String(c.index).padStart(4, '0')} 0px vs ${c.change.reference}`)
          .join(', ')}) while the union MAE stays ${revealMae.toFixed(2)} against a faithful ${f.meanMae.toFixed(2)}`,
    'a reveal that lands past the last sample never happens, and every structural measure reads it as present',
  );

  return bad;
}

/**
 * Rung 6's own export, drawn — the rung the refusal used to stop dead.
 *
 * In process rather than by running `bench/render_reference.ts`: the refusal was
 * never in that script, it was in `sampleAll` -> `piecesOf`, and these three calls
 * are the ones the script makes. Shelling out would test the argument parser.
 */
function runMeshRungSuite(): number | null {
  const dir = resolve(import.meta.dir, 'examples/6-arcs/export');
  console.log('\n── mesh rasterising on a real rung (6-arcs) ──');
  if (!existsSync(join(dir, '6-arcs-pro.json'))) {
    console.log('  SKIP  the rung-6 render control did not run.');
    console.log(`          expected an export at ${dir}`);
    console.log('          run `bun run fetch-examples`.');
    console.log('          ⚠️ This is a HOLE in this run, not a pass — the mesh path was not drawn on real geometry.');
    return null;
  }
  const posable = loadPosable(join(dir, '6-arcs-pro.json'), join(dir, '6-arcs.atlas'), dir);
  const viewport = framingViewport(posable.data, 256);
  let meshes = 0;
  let drawn = 0;
  let detail = '';
  let ok = false;
  try {
    const sets = sampleAll(posable.data, PROTOCOL_FPS);
    for (const frames of sets.values()) {
      for (const piece of frames[0].pieces) if (piece.kind === 'mesh') meshes++;
    }
    if (viewport) {
      for (const frames of sets.values()) {
        const geometry = frameGeometry(frames[Math.floor(frames.length / 2)], posable.pages, viewport);
        for (const bit of geometry.coverage) drawn += bit;
      }
    }
    ok = meshes > 0 && drawn > 0;
    detail = ok
      ? `posed ${meshes} mesh attachment(s) and drew ${drawn} px of a mid-shot frame at ${viewport?.width}x${viewport?.height}`
      : `posed ${meshes} mesh(es) and drew ${drawn} px — the export loaded but nothing reached the plate`;
  } catch (err) {
    detail = `it still refuses: ${(err as Error).message}`;
  }
  return reportCase(
    'MR04_A_RUNG_WITH_MESHES_RENDERS',
    ok,
    detail,
    'the refusal stopped the frame-fidelity lane at rung 5 — no reference frames for 6, 7 or 8, and so no check',
  );
}

interface Suite {
  name: string;
  opts: Options;
  mutants: Mutant[];
}

const SUITES: Suite[] = [
  { name: OVERLAY.rig, opts: optsForFixture(OVERLAY), mutants: MUTANTS },
  { name: ARTICULATED.rig, opts: optsForFixture(ARTICULATED), mutants: ARTICULATED_MUTANTS },
  { name: `${CONTAINED.rig} (contained cut)`, opts: optsForFixture(CONTAINED), mutants: CONTAINED_MUTANTS },
];

function runSuite(suite: Suite): number {
  const pristine = compile(suite.opts);
  const base: Artifacts = { skeletonText: pristine.skeletonText, atlasText: pristine.atlasText };
  let bad = 0;
  console.log(`\n── ${suite.name} (${pristine.rig.archetype}) ──`);

  // --- positive control -----------------------------------------------------
  const control = validate({
    ...base,
    atlasDir: suite.opts.outDir,
    declaredDurations: pristine.declaredDurations,
    rig: pristine.rig,
    reEmit: { skeletonText: compile(suite.opts).skeletonText, atlasText: compile(suite.opts).atlasText },
  });
  if (control.failures.length === 0) {
    // Skips are reported separately from passes: an assertion with no data to
    // check has not checked anything, and folding it into the pass count is how
    // a vacuous gate comes to look like a kept one.
    const skips = control.skipped.length ? `, ${control.skipped.length} skipped: ${control.skipped.map((s) => s.assertion).join(', ')}` : '';
    console.log(`  PASS  CONTROL_PRISTINE_IS_GREEN  (${control.passed.length} assertions ran${skips})`);
  } else {
    bad++;
    console.log('  FAIL  CONTROL_PRISTINE_IS_GREEN');
    for (const f of control.failures) console.log(`          ${f.assertion}: ${f.detail}`);
  }

  // --- negative controls ----------------------------------------------------
  for (const mutant of suite.mutants) {
    const broken = mutant.mutate(base);
    const report = validate({
      ...broken,
      atlasDir: suite.opts.outDir,
      declaredDurations: pristine.declaredDurations,
      rig: pristine.rig,
      profile: mutant.profile,
    });
    const where = mutant.profile ? `  [profile ${mutant.profile}]` : '';
    if (mutant.expect === null) {
      // A tolerance control: this edit is legal and the gate must let it past.
      if (report.failures.length === 0) {
        console.log(`  PASS  ${mutant.name}${where}  (accepted, as it must be)`);
        console.log(`          origin: ${mutant.origin}`);
      } else {
        bad++;
        console.log(
          `  FAIL  ${mutant.name}: this edit is legal and must be accepted, but [${report.failures.map((f) => f.assertion).join(', ')}] fired`,
        );
        for (const f of report.failures) console.log(`          ${f.assertion}: ${f.detail}`);
      }
      continue;
    }
    const hit = report.failures.find((f) => f.assertion === mutant.expect);
    if (hit) {
      console.log(`  PASS  ${mutant.name}${where}`);
      console.log(`          caught by ${hit.assertion}: ${hit.detail}`);
      console.log(`          origin: ${mutant.origin}`);
    } else {
      bad++;
      console.log(
        `  FAIL  ${mutant.name}: expected ${mutant.expect}, got [${report.failures.map((f) => f.assertion).join(', ') || 'nothing — the break loaded clean'}]`,
      );
    }
  }
  return bad;
}

// ---------------------------------------------------------------------------
// --copy-images — issue #217: `--out` was not self-contained
// ---------------------------------------------------------------------------
//
// `compile()` never writes a page's bytes anywhere, and a page's NAME is
// relative to the atlas file — by default that name is wherever the source art
// already sits, which is very often outside `--out` (`../parts/torso.png`).
// `copyAtlasImages` (`src/emit.ts`) is the opt-in that copies every page into
// the output directory and rewrites the atlas to match. Three things have to
// hold:
//
//   * left alone, nothing changed — a page still points outside `outDir`;
//   * asked for, every page lands inside `outDir` and the REWRITTEN atlas
//     resolves there — read back and stat-ed, not merely asserted from memory;
//   * two different source files that happen to share a basename are
//     disambiguated the same way on every run, not silently overwritten.

function runCopyImagesSuite(): number {
  console.log('\n── --copy-images: out becomes self-contained (issue #217) ──');
  let bad = 0;

  const opts = optsForFixture(OVERLAY);
  const result = compile(opts);

  // --- left alone, the default is exactly what it was ------------------------
  const stillEscapes = result.images.length > 0 && result.images.every((img) => img.page.startsWith('..'));
  bad += reportCase(
    'CPI01_DEFAULT_BUILD_STILL_POINTS_OUTSIDE_OUT',
    stillEscapes,
    `${result.images.length} page(s), e.g. "${result.images[0]?.page}" — --copy-images is opt-in, so a build ` +
      'with no flag emits the same paths it always did',
    'issue #217 IS this path; a fix that flipped it by default would silently change every existing build with ' +
      'no flag to say so',
  );

  // --- asked for, the directory is genuinely self-contained -------------------
  const selfContainedDir = join(OVERLAY.dir, 'spine_self_contained');
  const copied = copyAtlasImages(result.images, selfContainedDir);
  const pageLines = copied.atlasText.split('\n').filter((l) => l.endsWith('.png'));
  const flat = pageLines.every((l) => !l.includes('/') && !l.includes('\\'));
  const landed = copied.pages.every((p) => {
    const abs = join(selfContainedDir, p.to);
    return existsSync(abs) && statSync(abs).size > 0;
  });
  const countMatches = pageLines.length === result.images.length && copied.pages.length === result.images.length;
  bad += reportCase(
    'CPI02_COPY_IMAGES_MAKES_OUT_SELF_CONTAINED',
    flat && landed && countMatches,
    `${copied.pages.length} page(s) copied into ${selfContainedDir}; atlas re-read (${pageLines.join(', ')}) and ` +
      'every page stat-ed there',
    'zipping or committing --out alone loses every texture, because the emitted paths pointed at the source art ' +
      'rather than at the directory being handed off',
  );

  // --- a basename collision is disambiguated, deterministically ---------------
  const collideRoot = mkdtempSync(join(tmpdir(), 'rigc-collide-'));
  const dirA = join(collideRoot, 'a');
  const dirB = join(collideRoot, 'b');
  mkdirSync(dirA, { recursive: true });
  mkdirSync(dirB, { recursive: true });
  writeProbePng(join(dirA, 'torso.png'), 4, 4, [220, 30, 30, 255]);
  writeProbePng(join(dirB, 'torso.png'), 4, 4, [30, 220, 30, 255]);
  const synthetic: CompiledImage[] = [
    { region: 'torso', page: 'a/torso.png', absPath: join(dirA, 'torso.png'), width: 4, height: 4, hasAlpha: false, isBase: false },
    { region: 'torso_alt', page: 'b/torso.png', absPath: join(dirB, 'torso.png'), width: 4, height: 4, hasAlpha: false, isBase: false },
  ];
  const firstRun = copyAtlasImages(synthetic, join(collideRoot, 'out1'));
  // Same inputs, a different outDir: the mapping must not depend on what else
  // happened to be on disk already.
  const secondRun = copyAtlasImages(synthetic, join(collideRoot, 'out2'));
  const names = firstRun.pages.map((p) => p.to);
  const disambiguated = names[0] === 'torso.png' && names[1] === 'torso-2.png';
  const deterministic = names.join(',') === secondRun.pages.map((p) => p.to).join(',');
  const notMixedUp =
    disambiguated &&
    readPlate(join(collideRoot, 'out1', 'torso.png')).get(0, 0)[0] === 220 &&
    readPlate(join(collideRoot, 'out1', 'torso-2.png')).get(0, 0)[1] === 220;
  bad += reportCase(
    'CPI03_BASENAME_COLLISION_IS_DISAMBIGUATED_DETERMINISTICALLY',
    disambiguated && deterministic && notMixedUp,
    `${JSON.stringify(names)}, identical on a second run over the same inputs, neither file's pixels landed under ` +
      "the other's name",
    "compile() already refuses two images sharing a region (== basename); this is the defence for the day that " +
      'invariant changes, plus a case-insensitive filesystem colliding two basenames the region check saw as distinct',
  );

  return bad;
}

// ---------------------------------------------------------------------------
// the extra suite — a project's own cuts, when it points the run at them
// ---------------------------------------------------------------------------
//
// ⭐ This suite is a POSITIVE control and deliberately nothing else. The mutant
// tables above are aimed at generated fixtures because a break has to name
// something, and hand-aiming a second set at somebody's real art is how this file
// became unrunnable outside one repository in the first place. What real art adds
// that a fixture cannot is the geometry itself: measured offsets, a measured
// axis, a measured ceiling, a mesh built over a mask contour nobody drew by hand.
// So the question this suite asks is the one only the real cuts can answer —
// **does the whole gate still come back green on them, and does it still emit the
// same bytes twice?**
//
// A cuts table names cuts; it does not have to name any particular ones. Every
// entry in it is compiled and gated, so a project that adds a cut gets it covered
// without editing this file.

// ---------------------------------------------------------------------------
// error attribution — issue #219: which file, and where in it
// ---------------------------------------------------------------------------
//
// Two gaps, closed together because they share one shape: an error that names
// a file is more useful than one that does not, and with two input files (a
// rig spec and a motion spec) or one malformed one, "which" and "where" are
// exactly the information a reader is missing.

function runErrorAttributionSuite(): number {
  console.log('\n── error attribution (issue #219) ──');
  let bad = 0;
  const say = (name: string, ok: boolean, detail: string, why: string): void => {
    bad += reportCase(name, ok, detail, why);
  };

  const dirs = writeProbeRig();
  const motionPath = join(dirs.dir, 'probe.motion.json');

  // E01: a fault in the motion spec's own content (an animation targeting a
  // bone the RIG does not declare) used to be reported with no path at all,
  // and the header above it named only the rig — the one file that is NOT at
  // fault here.
  {
    const message = refusal(dirs, {
      spec: 'rigc-motion/1',
      archetype: 'static_probe',
      cut: 'static_probe',
      easings: {},
      animations: {
        probe: {
          duration: 1,
          loop: false,
          tracks: [
            {
              bone: 'nonexistent_bone',
              property: 'translatey',
              keys: [
                { t: 0, v: 0 },
                { t: 1, v: 1 },
              ],
            },
          ],
        },
      },
    });
    say(
      'E01_A_MOTION_SPEC_FAULT_NAMES_THE_MOTION_FILE',
      message !== null && message.startsWith(motionPath) && message.includes('unknown bone "nonexistent_bone"'),
      message === null ? 'the compile went through — the broken track was accepted' : `refused with: ${message}`,
      'every "animation … bone … property" refusal named no file at all, and the one path the surrounding ' +
        'output DID print was the rig\'s — the wrong file whenever the fault is here',
    );
  }

  // E02: a motion file that fails to parse as JSON at all names the file (it
  // always did) but not where inside it the syntax broke.
  {
    const brokenPath = join(dirs.dir, 'probe.motion.broken.json');
    writeFileSync(brokenPath, '{\n  "spec": "rigc-motion/1",\n  archetype: "static_probe"\n}\n');
    let message: string | null = null;
    try {
      compile({ rigPath: dirs.rigPath, motionPath: brokenPath, outDir: dirs.outDir, imagesDir: dirs.dir });
    } catch (err) {
      message = err instanceof CompileError ? err.message : `NOT a CompileError: ${(err as Error).message}`;
    }
    say(
      'E02_A_JSON_PARSE_FAILURE_REPORTS_A_LINE_NUMBER',
      message !== null && message.includes(brokenPath) && /line 3, column \d+/.test(message),
      message === null ? 'the malformed JSON was somehow accepted' : `refused with: ${message}`,
      "the runtime's own JSON.parse names the fault (\"Property name must be a string literal\") and never a " +
        'position, so a reader knows which file broke and not where',
    );
  }

  return bad;
}

// ---------------------------------------------------------------------------
// cli ergonomics — issue #218, exercised as the installed command sees it:
// a real `bun cli.ts …` subprocess, not the functions cli.ts happens to export
// ---------------------------------------------------------------------------

/** Run `bun cli.ts <args>` as a real subprocess, from the repository root. */
function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ['cli.ts', ...args], {
    cwd: import.meta.dir,
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function runCliSuite(): number {
  console.log('\n── cli ergonomics (subprocess: bun cli.ts …) ──');
  let bad = 0;
  const say = (name: string, ok: boolean, detail: string, why: string): void => {
    bad += reportCase(name, ok, detail, why);
  };

  {
    const { status, stderr } = runCli(['init']);
    say(
      'CLI01_UNKNOWN_SUBCOMMAND_IS_NAMED_AND_NONZERO',
      status !== 0 && status !== null && stderr.includes('unknown command: init'),
      `exit=${String(status)} stderr=${JSON.stringify(stderr.split('\n')[0])}`,
      '`rigc init` used to fall through to the plain usage text, silently indistinguishable from any other typo',
    );
  }

  {
    const { status: bareStatus, stderr: bareStderr } = runCli([]);
    say(
      'CLI02_NO_ARGS_IS_USAGE_NOT_AN_UNKNOWN_COMMAND',
      bareStatus !== 0 && bareStatus !== null && bareStderr.includes('usage:') && !bareStderr.includes('unknown command'),
      `exit=${String(bareStatus)} stderr=${JSON.stringify(bareStderr.split('\n')[0])}`,
      'a bare invocation is a caller asking for the shape of the tool, not a typo\'d command name',
    );
  }

  {
    const { status, stdout, stderr } = runCli(['build', '--help']);
    say(
      'CLI03_BUILD_HELP_NO_LONGER_ERRORS',
      status === 0 && stderr === '' && stdout.includes('--rig') && stdout.includes('flags:'),
      `exit=${String(status)} stderr=${JSON.stringify(stderr)} stdout starts ${JSON.stringify(stdout.slice(0, 60))}`,
      '`rigc build --help` used to fail argument parsing itself: "rigc: --help needs a value"',
    );
  }

  {
    const pkgVersion = (JSON.parse(readFileSync(join(import.meta.dir, 'package.json'), 'utf8')) as { version: string })
      .version;
    const { status, stdout } = runCli(['--version']);
    say(
      'CLI04_VERSION_PRINTS_THE_PACKAGE_VERSION',
      status === 0 && stdout.trim() === pkgVersion,
      `expected ${pkgVersion}, got ${JSON.stringify(stdout.trim())} (exit=${String(status)})`,
      '`rigc --version` used to fall through to the plain usage text instead of naming a version at all',
    );
  }

  {
    const { status, stdout } = runCli(['-v']);
    say(
      'CLI05_SHORT_VERSION_FLAG_WORKS_TOO',
      status === 0 && /^\d+\.\d+\.\d+/.test(stdout.trim()),
      `got ${JSON.stringify(stdout.trim())} (exit=${String(status)})`,
      'cheap to add alongside --version, and every other CLI\'s users reach for it out of habit',
    );
  }

  return bad;
}

function runCutsSuite(): { failures: number; cuts: number } {
  console.log('\n── extra suite: registered cuts ──');
  if (CUTS === null) {
    console.log('  INFO  no cuts file given, so the extra suite was skipped. The public suite above does not need one.');
    console.log('        Point a run at a project\'s registry with --cuts <cuts.json> (or RIGC_CUTS=<path>).');
    return { failures: 0, cuts: 0 };
  }
  const names = Object.keys(CUTS.table);
  if (names.length === 0) {
    console.log(`  FAIL  ${CUTS.file} registers no cuts at all`);
    return { failures: 1, cuts: 0 };
  }
  let bad = 0;
  console.log(`  from ${CUTS.file}`);
  for (const name of names) {
    const entry = CUTS.table[name];
    for (const key of ['rig', 'motion', 'out'] as const) {
      if (typeof entry?.[key] !== 'string') {
        bad++;
        console.log(`  FAIL  ${name}: the cuts table gives it no "${key}" path`);
      }
    }
    if (typeof entry?.rig !== 'string' || typeof entry?.motion !== 'string' || typeof entry?.out !== 'string') continue;
    const opts = optsForCut(CUTS.dir, entry);
    try {
      const result = compile(opts);
      const report = validate({
        skeletonText: result.skeletonText,
        atlasText: result.atlasText,
        atlasDir: opts.outDir,
        declaredDurations: result.declaredDurations,
        rig: result.rig,
        // Compiling twice is what makes A18 mean anything here: on real art the
        // determinism claim is worth more than on a fixture, because the manifest
        // carries floats nobody chose.
        reEmit: { skeletonText: compile(opts).skeletonText, atlasText: compile(opts).atlasText },
      });
      if (report.failures.length === 0) {
        const skips = report.skipped.length ? `, ${report.skipped.length} skipped` : '';
        console.log(`  PASS  CUT_IS_GREEN[${name}]  (${result.rig.archetype}: ${report.passed.length} assertions ran${skips})`);
      } else {
        bad++;
        console.log(`  FAIL  CUT_IS_GREEN[${name}]`);
        for (const f of report.failures) console.log(`          ${f.assertion}: ${f.detail}`);
      }
    } catch (err) {
      bad++;
      console.log(`  FAIL  CUT_IS_GREEN[${name}]: ${(err as Error).message}`);
    }
  }
  return { failures: bad, cuts: names.length };
}

function main(): void {
  let bad = 0;
  let breaks = 0;
  let tolerances = 0;
  // Every case that actually looked at something.
  //
  // ⚠️ Read this for what it is: a FLOOR, not a gate with a mutant behind it. It
  // cannot fire while the tables above have entries in them, and if the fixture
  // builder ever failed outright the process would die at import with a stack
  // trace rather than reach here. What it does cover is attrition — a future run
  // where the example corpus is gone, no cuts file is given and somebody has
  // emptied a suite, which would otherwise print "green" over an empty gate.
  let substantive = 0;
  for (const suite of SUITES) {
    bad += runSuite(suite);
    substantive += 1 + suite.mutants.length;
    for (const mutant of suite.mutants) {
      if (mutant.expect === null) tolerances++;
      else breaks++;
    }
  }
  bad += runRigSuite();
  substantive += 1 + RIG_MUTANTS.length;
  bad += runStaticRigSuite();
  substantive += 4;
  bad += runPngTransparencySuite();
  substantive += 7;
  bad += runDrawOrderSuite();
  substantive += 6;
  bad += runKeyTimeSuite();
  substantive += 5;
  bad += runEventSuite();
  substantive += 8;
  bad += runPolygonSuite();
  substantive += 6;
  bad += runMeshSuite();
  substantive += 4;
  const meshRungBad = runMeshRungSuite();
  if (meshRungBad !== null) {
    bad += meshRungBad;
    substantive += 1;
  }
  const meshCheckBad = runMeshCheckSuite();
  if (meshCheckBad !== null) {
    bad += meshCheckBad;
    substantive += 2;
  }
  bad += runSlotSuite();
  substantive += 2;
  bad += runErrorAttributionSuite();
  substantive += 2;
  bad += runCliSuite();
  substantive += 5;
  bad += runCopyImagesSuite();
  substantive += 3;
  const diffBad = runDiffSuite();
  if (diffBad !== null) {
    bad += diffBad;
    substantive += 1 + DIFF_CASES.length;
  }
  const checkBad = runCheckSuite();
  if (checkBad !== null) {
    bad += checkBad;
    substantive += 3;
  }
  const cuts = runCutsSuite();
  bad += cuts.failures;
  substantive += cuts.cuts;

  console.log('');
  if (substantive === 0) {
    console.error('rigc selftest: nothing substantive ran — this is not a pass, it is an empty gate');
    process.exit(2);
  }
  if (bad > 0) {
    console.error(`rigc selftest: ${bad} control(s) failed`);
    process.exit(1);
  }
  const corpus =
    diffBad === null || checkBad === null
      ? '\n  ⚠️ The example corpus is absent, so the ' +
        [diffBad === null ? 'diff' : null, checkBad === null ? 'check' : null].filter(Boolean).join(' and ') +
        ' self-checks did NOT run — this run does not cover them. `bun run fetch-examples` gets them.'
      : `, + 2 diff identity controls (name-matched and name-agnostic), + ${DIFF_CASES.length} diff measure controls, ` +
        '+ 16 check controls (frames-only reads, a faithful ' +
        'transcription, a time-reversed one, a framing invariant to transparent margins, a scale difference ' +
        "the framing names, the frames' own box used when the candidate lands in it and refused when it does " +
        "not, one offset shot that must not move another shot's numbers, one bloated sprite that must " +
        'lower the union mean, raise the figure over the reference’s own pixels, and be named as overdraw, ' +
        'one offset bone CHAIN that must be blamed while its neighbour and a faithful build stay on the floor, ' +
        'a constant framing pixel that must be taken out of the figure on a displaced silhouette and ' +
        'invented on neither a faithful nor a bodily moved one, and a defect between two committed stills that ' +
        'must be loud on the contact sheet holding the frames between them while a sheet that is not a grid of ' +
        'those frames is refused by name)';
  const meshRung =
    meshRungBad === null
      ? '\n  ⚠️ `examples/6-arcs` is absent, so the mesh path was never drawn on real geometry in this run.'
      : `, + 1 rung-6 mesh render${
          meshCheckBad === null ? '' : ', + 7 rung-6 fidelity controls (4 mesh, 3 per-frame change)'
        }`;
  console.log(
    `rigc selftest: green — ${SUITES.length + 3} positive controls + ${breaks} deliberate breaks, each caught by its ` +
      `named assertion, + ${RIG_MUTANTS.length} broken rig specs the compiler refused by name, ` +
      `+ ${tolerances} legal edits the gate had to accept, + 4 static-rig controls, ` +
      '+ 7 PNG transparency controls (indexed, greyscale and truecolour art whose transparency lives in a tRNS ' +
      'chunk, a greyscale+alpha file, a genuinely opaque part the gate still refuses, and the wording of that ' +
      'refusal), + 2 slot-attribution ' +
      'controls (a blob one part dominates, and two parts that are two blobs), + 6 draw-order controls, ' +
      '+ 7 key-time controls, + 8 event controls (2 of them a spine-core round trip of the firings), ' +
      '+ 6 bounding-box / clipping controls (2 of them a spine-core round trip of the polygon and its end slot), ' +
      `+ 4 mesh-rasteriser controls${meshRung.startsWith(',') ? meshRung : ''}` +
      ', + 2 error-attribution controls (a motion-spec fault names the motion file, a JSON parse failure ' +
      'reports a line number), + 5 cli ergonomics controls (unknown command, bare invocation, `build --help`, ' +
      '`--version`, `-v`)' +
      ', + 3 copy-images controls (self-contained out dir, unchanged default, deterministic basename collision)' +
      corpus +
      (meshRung.startsWith(',') ? '' : meshRung) +
      (cuts.cuts > 0 ? `\n  + the extra suite gated ${cuts.cuts} registered cut(s) green` : ''),
  );
}

main();
