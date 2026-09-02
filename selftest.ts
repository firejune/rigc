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
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import {
  AnimationState,
  AnimationStateData,
  BoundingBoxAttachment,
  ClippingAttachment,
  EventTimeline,
  IkConstraint,
  MeshAttachment,
  PathAttachment,
  PathConstraint,
  Physics,
  Skeleton,
  Slider,
  TransformConstraint,
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
import {
  contourOvershootBound,
  CONTOUR_MIN_COVERAGE,
  measureContourFit,
  traceAlphaOutline,
} from './src/mesh.ts';
import { diffSkeletons, movedAgnosticMeasures, movedMeasures } from './src/diff.ts';
import { copyAtlasImages } from './src/emit.ts';
import { isContent } from './src/framing.ts';
import {
  DEFAULT_MAX_RESIDUAL,
  estimatePose,
  POSE_SPEC,
  ROTATION_FREE_TOLERANCE,
  type PosePlacement,
} from './src/pose.ts';
import {
  atlasPageNames,
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
  unionBounds,
  viewportFor,
  viewportOfSize,
  type Footprint,
  type Frame,
  type FramesSidecar,
  type Mesh,
  type Piece,
  type Posable,
  type Viewport,
} from './src/render.ts';
import {
  BALLOT_SPEC,
  ballotId,
  MANIFEST_ELEMENT_ID,
  resultFilename,
  TIE,
  VOTE_SPEC,
  type BallotManifest,
  type LedgerLine,
} from './src/ballot.ts';
import { ATLAS_KEY, SKELETON_KEY } from './src/preview.ts';
import { readPngInfo } from './src/png.ts';
import type { CompiledImage, CompileResult } from './src/types.ts';
import { validate, type ValidateProfile } from './src/validate.ts';
import { articulatedFixture, containedFixture, overlayFixture, type Fixture } from './fixtures/public.ts';
import { decodePng, Plate, PNG_SIGNATURE, pngChunk, readPlate, type RGBA } from './tools/plate.ts';

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
   * Which rulebook to run the break against. Absent means `MUTANT_PROFILE`
   * (`spine-html`), the profile every other mutant in this file was written for
   * — the suite pins it rather than inheriting a default, so that flipping the
   * CLI's default (#221) cannot quietly stop a mutant's assertion from running
   * at all. A mutant that names a profile is asserting something about the SPLIT
   * rather than about one assertion — see M36a/M36b, the same edit under both.
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
    name: 'R07_constraint_type_the_format_does_not_have',
    origin: 'SkeletonJson.ts:148-367 — an entry whose `type` matches no case is dropped with no error and no default branch',
    // The five types are all emitted now (issue #2 closed the last two), so what
    // this mutant proves is what it always proved: the parser has no `default:`
    // branch, so a type nobody recognises has to be refused HERE or it vanishes.
    expect: 'is not one Spine 4.3 knows',
    mutate: (rig) => {
      (rig as any).constraints = [{ name: 'probe_twist', type: 'twist', bones: ['plunger'], target: 'collar' }];
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
    // Both halves of the profile split, and `spine` is matched with `-` excluded
    // so that the words "--profile spine-html" cannot satisfy both requirements
    // at once. Since #221 the reader arrives here only by opting in, so the
    // message has to say which rulebook they opted into as well as which one
    // would not have asked — naming only the escape hatch now reads as though
    // the tool had chosen this rule for them.
    /--profile spine-html/.test(detail) ? null : 'the profile this rule belongs to (--profile spine-html)',
    /--profile spine\b(?!-)/.test(detail) ? null : 'the default profile that does not enforce it (--profile spine)',
    /no alpha channel/i.test(detail) ? 'DROP the old untrue "no alpha channel" phrasing' : null,
  ].filter((m): m is string => m !== null);
  say(
    'T06_THE_REFUSAL_NAMES_A_REMEDY_AND_BOTH_PROFILES',
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
// constraint timelines (ik, transform) and deform timelines
// ---------------------------------------------------------------------------
//
// ⭐ The three timeline families a first-time author reaches for the moment an
// idle works: a walk needs IK, an aim rig needs a transform constraint mixed in
// by the animation that wants it, and squash-and-stretch needs a deform. rigc
// could emit all three CONSTRAINTS since rung 6 and could not key any of them
// (issues #87, #88, #89).
//
// 🚨 Every case below that matters loads the emitted skeleton through spine-core
// and reads a NUMBER back off the posed skeleton, because the failure mode this
// suite is designed against is the one a parse-only test cannot see: a timeline
// written under a field name the parser does not read loads perfectly and does
// nothing. `mixRotation` instead of `mixRotate`, `bendDirection` instead of
// `bendPositive`, `vertices` at an offset one pair past the end of a
// `Float32Array` — all three produce a green parse and a dead animation. So the
// controls assert the mix the runtime applied, the rotation the constrained bone
// actually took, and the world position the deformed vertex actually moved to.

/**
 * A rig with the three things the families need: an IK chain with a target, a
 * transform constraint whose mixes are all off at setup, an UNWEIGHTED mesh and
 * a WEIGHTED one whose third vertex deliberately carries two bones.
 *
 * The two meshes are the point of the deform half. A deform array is one `x, y`
 * pair per vertex on the first and one pair per bone INFLUENCE on the second, so
 * a suite with only one of them would prove the emitter right about half the
 * meshes in the world and say nothing about the other half.
 */
const TIMELINE_RIG = {
  bones: [
    { name: 'root' },
    { name: 'thigh', parent: 'root', x: 0, y: 0, length: 20 },
    { name: 'shin', parent: 'thigh', x: 20, y: 0, length: 20 },
    { name: 'foot-target', parent: 'root', x: 30, y: -10 },
    { name: 'aim', parent: 'root', x: 0, y: 30, rotation: 40 },
  ],
  slots: [
    // `flat` hangs off the ROOT on purpose: T04 measures a world vertex, and a
    // slot on a constrained bone would move for two reasons at once — the IK
    // swinging the chain and the deform — which is a measurement of neither.
    { name: 'flat', bone: 'root', attachment: 'flat' },
    { name: 'bound', bone: 'thigh', attachment: 'bound' },
  ],
  skins: {
    default: {
      flat: {
        flat: {
          type: 'mesh',
          image: 'block.png',
          path: 'block',
          uvs: [0, 0, 1, 0, 1, 1, 0, 1],
          triangles: [0, 1, 2, 0, 2, 3],
          // Unweighted: one x, y per uv pair, so `vertices.length === uvs.length`
          // and the deform array is 8 long — one pair per vertex.
          vertices: [0, 0, 12, 0, 12, 8, 0, 8],
          hull: 4,
          width: 12,
          height: 8,
        },
      },
      bound: {
        bound: {
          type: 'mesh',
          image: 'marker.png',
          path: 'marker',
          uvs: [0, 0, 1, 0, 1, 1, 0, 1],
          triangles: [0, 1, 2, 0, 2, 3],
          // Weighted, bound by name. Vertex 2 carries two bones on purpose: it is
          // the vertex `fromVertex` must refuse, and the reason the deform array
          // is 10 long (5 influences) rather than 8.
          weights: [
            [{ bone: 'thigh', x: 0, y: 0, weight: 1 }],
            [{ bone: 'thigh', x: 6, y: 0, weight: 1 }],
            [
              { bone: 'thigh', x: 6, y: 6, weight: 0.5 },
              { bone: 'shin', x: -14, y: 6, weight: 0.5 },
            ],
            [{ bone: 'thigh', x: 0, y: 6, weight: 1 }],
          ],
          hull: 4,
          width: 6,
          height: 6,
        },
      },
    },
  },
  constraints: [
    // Both start muted, so "the animation turned it on" is a measurable event
    // rather than a value that was already there — which is exactly the idiom
    // issue #88 found in spineboy's aim rig.
    { name: 'leg-ik', type: 'ik', bones: ['thigh', 'shin'], target: 'foot-target', mix: 0 },
    {
      name: 'aim-shin',
      type: 'transform',
      bones: ['shin'],
      source: 'aim',
      properties: { rotate: { to: { rotate: {} } } },
      mixRotate: 0,
    },
  ],
};

/** A motion spec for the timeline rig, with whatever animation body is handed in. */
function timelineMotion(animation: Record<string, unknown>): Record<string, unknown> {
  return {
    spec: 'rigc-motion/1',
    archetype: 'static_probe',
    cut: 'static_probe',
    // Deliberately asymmetric: a symmetric ease is 0.5 at the midpoint whether the
    // bezier was written or not, so it cannot tell a curve from a straight line.
    easings: { lateBloom: [0.9, 0, 1, 0.35] },
    animations: { move: animation },
  };
}

/** Compile the timeline probe and load the result through spine-core. */
function timelinePosable(dirs: ProbeDirs, motion: Record<string, unknown>): Posable {
  const motionPath = join(dirs.dir, 'probe.motion.json');
  writeFileSync(motionPath, `${JSON.stringify(motion, null, 2)}\n`);
  const built = compile({ rigPath: dirs.rigPath, motionPath, outDir: dirs.outDir, imagesDir: dirs.dir });
  return posableFromText(built.skeletonText, built.atlasText, dirs.outDir);
}

/**
 * Pose the skeleton at one time the way `sampleAnimation` does — by accumulating
 * `1/fps`, not by seeking.
 *
 * ⚠️ Seeking (`state.update(t)` once) and accumulating do not land on the same
 * number, and the difference is the whole subject of AUTHORING §10.3: a player
 * reaches sample *i* by adding `1/fps` *i* times, which for many *i* lands a few
 * ULPs BELOW `i/fps`. A stepped key written at exactly that time is then never
 * seen. So the sampler here has to accumulate or it would test a thing no runtime
 * does.
 */
function poseAtSample(data: SkeletonData, animation: string, fps: number, sample: number): Skeleton {
  const skeleton = new Skeleton(data);
  const state = new AnimationState(new AnimationStateData(data));
  state.setAnimation(0, animation, false);
  skeleton.setupPose();
  state.apply(skeleton);
  skeleton.update(0);
  skeleton.updateWorldTransform(Physics.reset);
  const step = 1 / fps;
  for (let i = 0; i < sample; i++) {
    state.update(step);
    state.apply(skeleton);
    skeleton.update(step);
    skeleton.updateWorldTransform(Physics.update);
  }
  return skeleton;
}

/** The world x, y of one vertex of a slot's mesh, with the deform applied. */
function worldVertex(skeleton: Skeleton, slotName: string, vertex: number): [number, number] {
  const slot = skeleton.slots.find((s) => s.data.name === slotName)!;
  const attachment = slot.appliedPose.attachment;
  if (!(attachment instanceof MeshAttachment)) throw new Error(`slot "${slotName}" shows no mesh`);
  const world = new Array<number>(attachment.worldVerticesLength).fill(0);
  attachment.computeWorldVertices(skeleton, slot, 0, attachment.worldVerticesLength, world, 0, 2);
  return [world[vertex * 2], world[vertex * 2 + 1]];
}

function runConstraintAndDeformSuite(): number {
  const dirs = writeProbeRig(TIMELINE_RIG);
  let bad = 0;
  console.log('\n── constraint and deform timelines (self-contained: an IK chain, an aim rig and two meshes) ──');
  const say = (name: string, ok: boolean, detail: string, why: string): void => {
    bad += reportCase(name, ok, detail, why);
  };
  const near = (a: number, b: number, tol = 1e-4): boolean => Math.abs(a - b) <= tol;

  // --- the control ----------------------------------------------------------
  const everything = timelineMotion({
    duration: 1,
    loop: false,
    tracks: [],
    ik: [
      {
        constraint: 'leg-ik',
        keys: [
          { t: 0, mix: 0, softness: 0, bendPositive: true, stretch: false },
          { t: 1, mix: 1, softness: 8, bendPositive: false, stretch: true },
        ],
      },
    ],
    transform: [
      {
        constraint: 'aim-shin',
        keys: [
          { t: 0, mixRotate: 0 },
          { t: 1, mixRotate: 1 },
        ],
      },
    ],
    deform: [
      { slot: 'flat', attachment: 'flat', keys: [{ t: 0 }, { t: 0.5, fromVertex: 1, vertices: [0, 6] }, { t: 1 }] },
      { slot: 'bound', attachment: 'bound', keys: [{ t: 0 }, { t: 1, fromVertex: 1, vertices: [3, -3] }] },
    ],
  });
  const gate = gateProbe(dirs, everything);
  say(
    'CONTROL_ALL_THREE_TIMELINE_FAMILIES_ARE_GREEN',
    gate.failures.length === 0 &&
      gate.passed.includes('A34_CONSTRAINT_TIMELINE_TARGETS') &&
      gate.passed.includes('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT'),
    gate.failures.length === 0
      ? `${gate.passed.length} assertions ran; A34 and A35 both ${
          gate.passed.includes('A34_CONSTRAINT_TIMELINE_TARGETS') && gate.passed.includes('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT')
            ? 'ran'
            : 'did NOT run'
        }`
      : `[${gate.failures.map((f) => `${f.assertion}: ${f.detail}`).join('; ')}]`,
    'a suite of refusals cannot tell a compiler that emits nothing from one that emits the right thing',
  );

  const data = timelinePosable(dirs, everything).data;

  // --- the round trip: IK ---------------------------------------------------
  const ikAt = (t: number): { mix: number; softness: number; bend: number; stretch: boolean } => {
    const constraint = poseAtSample(data, 'move', 4, t * 4).findConstraint('leg-ik', IkConstraint)!;
    return {
      mix: constraint.pose.mix,
      softness: constraint.pose.softness,
      bend: constraint.pose.bendDirection,
      stretch: constraint.pose.stretch,
    };
  };
  const ik0 = ikAt(0);
  const ikHalf = ikAt(0.5);
  const ik1 = ikAt(1);
  say(
    'T01_an_ik_timeline_mixes_the_constraint_in_at_the_runtime',
    near(ik0.mix, 0) && near(ikHalf.mix, 0.5) && near(ik1.mix, 1) &&
      near(ik0.softness, 0) && near(ikHalf.softness, 4) && near(ik1.softness, 8),
    `mix 0 -> ${ikHalf.mix.toFixed(4)} -> ${ik1.mix.toFixed(4)}, softness 0 -> ${ikHalf.softness.toFixed(4)} -> ${ik1.softness.toFixed(4)}`,
    'the setup constraint is mix 0, so every number here came from the timeline — a wrong field name would leave it at 0',
  );
  say(
    'T02_the_ik_booleans_arrive_as_bend_direction_and_stretch',
    ik0.bend === 1 && !ik0.stretch && ik1.bend === -1 && ik1.stretch,
    `bendDirection ${ik0.bend} -> ${ik1.bend}, stretch ${String(ik0.stretch)} -> ${String(ik1.stretch)}`,
    '`bendPositive` in the file becomes `bendDirection` ±1 in the pose, and the three booleans are stepped by nature',
  );

  // --- the round trip: transform constraint ---------------------------------
  //
  // The mix alone is not the claim: a mix the runtime holds and never applies
  // would pass that. So this also reads the constrained bone's world rotation,
  // which is what a transform constraint exists to change.
  const tcAt = (t: number): { mix: number; rotation: number } => {
    const skeleton = poseAtSample(data, 'move', 4, t * 4);
    const constraint = skeleton.findConstraint('aim-shin', TransformConstraint)!;
    const shin = skeleton.bones.find((b) => b.data.name === 'shin')!;
    return { mix: constraint.pose.mixRotate, rotation: shin.appliedPose.getWorldRotationX() };
  };
  const tc0 = tcAt(0);
  const tc1 = tcAt(1);
  say(
    'T03_a_transform_timeline_turns_a_muted_constraint_on_and_the_bone_moves',
    near(tc0.mix, 0) && near(tc1.mix, 1) && Math.abs(tc1.rotation - tc0.rotation) > 1,
    `mixRotate ${tc0.mix.toFixed(4)} -> ${tc1.mix.toFixed(4)}, shin world rotation ${tc0.rotation.toFixed(2)}° -> ${tc1.rotation.toFixed(2)}°`,
    'issue #88: the whole idiom is a constraint muted at setup that the animation mixes in — so the bone has to actually move',
  );

  // --- the round trip: deform, both encodings -------------------------------
  const flatSetup = worldVertex(poseAtSample(data, 'move', 4, 0), 'flat', 1);
  const flatDeformed = worldVertex(poseAtSample(data, 'move', 4, 2), 'flat', 1);
  say(
    'T04_an_unweighted_deform_key_moves_the_vertex_it_names',
    near(flatDeformed[0] - flatSetup[0], 0, 1e-3) && near(flatDeformed[1] - flatSetup[1], 6, 1e-3),
    `vertex 1 world (${flatSetup[0].toFixed(3)}, ${flatSetup[1].toFixed(3)}) -> (${flatDeformed[0].toFixed(3)}, ${flatDeformed[1].toFixed(3)})`,
    'on an unweighted mesh the parser ADDS the setup position back, so the file holds offsets and the world must move by exactly the offset',
  );
  const boundDeform = poseAtSample(data, 'move', 4, 4).slots.find((s) => s.data.name === 'bound')!.pose.deform;
  say(
    'T05_a_weighted_deform_array_is_one_pair_per_influence_and_the_run_lands_on_the_named_vertex',
    boundDeform.length === 10 && near(boundDeform[2], 3) && near(boundDeform[3], -3) && near(boundDeform[0], 0) && near(boundDeform[4], 0),
    `deform[${boundDeform.length}] = [${Array.from(boundDeform).map((n) => n.toFixed(1)).join(', ')}]`,
    'vertex 2 carries two bones, so the array is 5 influences x 2 = 10 — a per-vertex assumption would size it 8 and land the run one pair early',
  );

  // --- the round trip: the deform curve is the BLEND, not a coordinate ------
  const eased = timelineMotion({
    duration: 1,
    loop: false,
    tracks: [],
    deform: [
      { slot: 'flat', attachment: 'flat', keys: [{ t: 0, fromVertex: 1, vertices: [0, 0], ease: 'lateBloom' }, { t: 1, fromVertex: 1, vertices: [0, 10] }] },
    ],
  });
  const easedData = timelinePosable(dirs, eased).data;
  const easedMid = poseAtSample(easedData, 'move', 4, 2).slots.find((s) => s.data.name === 'flat')!.pose.deform[3];
  say(
    'T06_a_named_easing_on_a_deform_key_curves_the_blend',
    easedMid < 4,
    `the y offset is ${easedMid.toFixed(4)} at the midpoint of a 0 -> 10 ease, where linear would be 5`,
    "readCurve builds a deform's one channel between 0 and 1 — the fraction — so the easing has to be written against 0..1, not against the vertex numbers",
  );

  // --- the curve arrays A05 counts ------------------------------------------
  //
  // Each family has its own channel count — 2 for an IK constraint, 6 for a
  // transform constraint, 1 for a deform — and a curve array is four numbers per
  // channel. A short one multiplies `undefined` into the cubic and yields a NaN
  // curve with no error at all (the reason A05 exists), so the lengths the
  // emitter writes have to be checked by the gate and not merely by this file.
  const curved = timelineMotion({
    duration: 1,
    loop: false,
    tracks: [],
    ik: [{ constraint: 'leg-ik', keys: [{ t: 0, mix: 0, softness: 0, ease: 'lateBloom' }, { t: 1, mix: 1, softness: 4 }] }],
    transform: [{ constraint: 'aim-shin', keys: [{ t: 0, mixRotate: 0, ease: 'lateBloom' }, { t: 1, mixRotate: 1 }] }],
    deform: [{ slot: 'flat', attachment: 'flat', keys: [{ t: 0, fromVertex: 0, vertices: [0, 0], ease: 'lateBloom' }, { t: 1, fromVertex: 0, vertices: [0, 3] }] }],
  });
  const curvedGate = gateProbe(dirs, curved);
  const curvedJson = JSON.parse(
    compile({
      rigPath: dirs.rigPath,
      motionPath: join(dirs.dir, 'probe.motion.json'),
      outDir: dirs.outDir,
      imagesDir: dirs.dir,
    }).skeletonText,
  ) as { animations: Record<string, Record<string, unknown>> };
  const lengthsOf = (): number[] => {
    const move = curvedJson.animations.move;
    const ik = (move.ik as Record<string, Array<Record<string, unknown>>>)['leg-ik'][0].curve as number[];
    const tc = (move.transform as Record<string, Array<Record<string, unknown>>>)['aim-shin'][0].curve as number[];
    return [ik.length, tc.length, (deformKeysOf(move, 'flat')[0].curve as number[]).length];
  };
  const lengths = lengthsOf();
  say(
    'T06B_each_family_writes_four_curve_numbers_per_channel',
    curvedGate.failures.length === 0 &&
      curvedGate.passed.includes('A05_CURVE_ARRAY_LENGTH') &&
      lengths[0] === 8 && lengths[1] === 24 && lengths[2] === 4,
    `ik ${lengths[0]}, transform ${lengths[1]}, deform ${lengths[2]} numbers; A05 ${
      curvedGate.passed.includes('A05_CURVE_ARRAY_LENGTH') ? 'ran and held' : 'did NOT run'
    }${curvedGate.failures.length ? ` — ${curvedGate.failures.map((f) => f.assertion).join(', ')}` : ''}`,
    'a short curve array multiplies undefined into the cubic and yields NaN with no error — 2, 6 and 1 channels, so 8, 24 and 4',
  );

  // --- the ULP trap, AUTHORING §10.3 ---------------------------------------
  //
  // A player reaches sample i by adding 1/fps i times. At 12 fps over 0.5 s that
  // accumulates to 0.49999999999999994 — below the 0.5 a stepped key would be
  // written at — so the last sample never sees such a key, and on a stepped
  // timeline that is the whole event rather than a few ULPs of value.
  const steppedAt = (keyTime: number): number => {
    const motion = timelineMotion({
      duration: 0.5,
      loop: false,
      tracks: [],
      ik: [
        {
          constraint: 'leg-ik',
          keys: [
            { t: 0, mix: 0, ease: 'stepped' },
            { t: keyTime, mix: 1 },
          ],
        },
      ],
    });
    return poseAtSample(timelinePosable(dirs, motion).data, 'move', 12, 6).findConstraint('leg-ik', IkConstraint)!.pose.mix;
  };
  const onTheGrid = steppedAt(0.5);
  const oneStepEarly = steppedAt(0.5 - 1e-6);
  say(
    'T07_a_stepped_key_on_the_last_sample_needs_the_grid_step_AUTHORING_10_3',
    near(onTheGrid, 0) && near(oneStepEarly, 1),
    `a stepped key at 0.5 reads mix=${onTheGrid.toFixed(4)} on the last sample; the same key at 0.5-1e-6 reads mix=${oneStepEarly.toFixed(4)}`,
    'accumulating 1/12 six times lands at 0.49999999999999994, so a key written exactly on the declared duration is one ULP out of reach',
  );

  // --- the refusals ---------------------------------------------------------
  const unknownIk = refusal(dirs, timelineMotion({
    duration: 1, loop: false, tracks: [],
    ik: [{ constraint: 'leg-ikk', keys: [{ t: 0, mix: 0 }, { t: 1, mix: 1 }] }],
  }));
  say(
    'T08_an_unknown_ik_constraint_is_refused_and_names_the_motion_file',
    unknownIk !== null && unknownIk.includes('keys unknown ik constraint "leg-ikk"') && unknownIk.includes('probe.motion.json'),
    unknownIk === null ? 'the compile went through' : `refused with: ${unknownIk}`,
    'the parser throws `IK Constraint not found` in the consumer’s process, and a reader with two input files needs to be told which one is at fault (#227)',
  );

  const wrongType = refusal(dirs, timelineMotion({
    duration: 1, loop: false, tracks: [],
    ik: [{ constraint: 'aim-shin', keys: [{ t: 0, mix: 0 }, { t: 1, mix: 1 }] }],
  }));
  say(
    'T09_keying_a_transform_constraint_as_ik_is_refused_by_type',
    wrongType !== null && wrongType.includes('"transform" constraint'),
    wrongType === null ? 'the compile went through' : `refused with: ${wrongType}`,
    'findConstraint(name, IkConstraintData) resolves by name AND type, so a right name of the wrong type is a miss, not a match',
  );

  const uneven = refusal(dirs, timelineMotion({
    duration: 1, loop: false, tracks: [],
    ik: [{ constraint: 'leg-ik', keys: [{ t: 0, mix: 1, softness: 20 }, { t: 1, mix: 0 }] }],
  }));
  say(
    'T10_a_field_on_one_key_and_not_the_next_is_refused',
    uneven !== null && uneven.includes('softness') && uneven.includes('snap'),
    uneven === null ? 'the compile went through' : `refused with: ${uneven}`,
    'every key is read with its own default, so an omitted softness is 0 rather than "unchanged" — it loads, it plays, and it is not what was written',
  );

  const overMix = refusal(dirs, timelineMotion({
    duration: 1, loop: false, tracks: [],
    ik: [{ constraint: 'leg-ik', keys: [{ t: 0, mix: 0 }, { t: 1, mix: 1.5 }] }],
  }));
  say(
    'T11_an_ik_mix_outside_0_to_1_is_refused',
    overMix !== null && overMix.includes('outside 0..1'),
    overMix === null ? 'the compile went through' : `refused with: ${overMix}`,
    'IkConstraintPose.mix is documented as a percentage 0-1; a transform mix is documented UNBOUNDED, so only this one carries a range',
  );

  const overrun = refusal(dirs, timelineMotion({
    duration: 1, loop: false, tracks: [],
    deform: [{ slot: 'flat', attachment: 'flat', keys: [{ t: 0 }, { t: 1, offset: 4, vertices: [1, 1, 1, 1, 1, 1] }] }],
  }));
  say(
    'T12_a_deform_run_past_the_end_of_the_attachment_is_refused',
    overrun !== null && overrun.includes('deform array is 8 long'),
    overrun === null ? 'the compile went through' : `refused with: ${overrun}`,
    'the parser copies into a Float32Array, and writing past the end of a typed array is a no-op — the tail is dropped without a word',
  );

  const multiBone = refusal(dirs, timelineMotion({
    duration: 1, loop: false, tracks: [],
    deform: [{ slot: 'bound', attachment: 'bound', keys: [{ t: 0 }, { t: 1, fromVertex: 2, vertices: [1, 1] }] }],
  }));
  say(
    'T13_fromVertex_on_a_multi_bone_vertex_is_refused_by_name',
    multiBone !== null && multiBone.includes('vertex 2 has 2 of them') && multiBone.includes('deform index 4'),
    multiBone === null ? 'the compile went through' : `refused with: ${multiBone}`,
    "a weighted vertex's world offset is a weighted sum of per-bone offsets in each bone's bind space, so one x, y for the vertex is not a thing the array can hold",
  );

  const unknownAttachment = refusal(dirs, timelineMotion({
    duration: 1, loop: false, tracks: [],
    deform: [{ slot: 'flat', attachment: 'flatt', keys: [{ t: 0 }, { t: 1, fromVertex: 0, vertices: [1, 1] }] }],
  }));
  say(
    'T14_an_unknown_attachment_is_refused_and_lists_the_ones_there_are',
    unknownAttachment !== null && unknownAttachment.includes('no attachment "flatt"') && unknownAttachment.includes('it has: flat'),
    unknownAttachment === null ? 'the compile went through' : `refused with: ${unknownAttachment}`,
    'the parser throws `Timeline attachment not found`, which names the attachment and not the ones that were there instead',
  );

  const oddOffset = refusal(dirs, timelineMotion({
    duration: 1, loop: false, tracks: [],
    deform: [{ slot: 'flat', attachment: 'flat', keys: [{ t: 0 }, { t: 1, offset: 3, vertices: [1, 1] }] }],
  }));
  say(
    'T15_an_odd_deform_offset_is_refused',
    oddOffset !== null && oddOffset.includes('is odd'),
    oddOffset === null ? 'the compile went through' : `refused with: ${oddOffset}`,
    'the deform array is x, y pairs and nothing in the format says so, so an odd start silently puts every x of the run on a y',
  );

  // --- the gate's own mutants: A34 and A35 have to be reachable -------------
  const emptied = gateProbeArtifacts(dirs, everything, (skeleton) => {
    const animations = skeleton.animations as Record<string, Record<string, unknown>>;
    (animations.move.ik as Record<string, unknown[]>)['leg-ik'] = [];
  });
  say(
    'T16_A34_fires_on_an_ik_timeline_with_no_keys',
    emptied.failures.some((f) => f.assertion === 'A34_CONSTRAINT_TIMELINE_TARGETS'),
    emptied.failures.find((f) => f.assertion === 'A34_CONSTRAINT_TIMELINE_TARGETS')?.detail ?? 'A34 accepted an empty key array',
    '`let keyMap = constraintMap[0]; if (!keyMap) continue;` — the timeline is skipped and nothing is said',
  );

  const renamed = gateProbeArtifacts(dirs, everything, (skeleton) => {
    const animations = skeleton.animations as Record<string, Record<string, unknown>>;
    const ik = animations.move.ik as Record<string, unknown>;
    ik['aim-shin'] = ik['leg-ik'];
    delete ik['leg-ik'];
  });
  say(
    'T17_A34_fires_when_a_timeline_names_a_constraint_of_the_wrong_type',
    renamed.failures.some((f) => f.assertion === 'A34_CONSTRAINT_TIMELINE_TARGETS'),
    renamed.failures.find((f) => f.assertion === 'A34_CONSTRAINT_TIMELINE_TARGETS')?.detail ?? 'A34 accepted an ik timeline aimed at a transform constraint',
    'the name resolves and the type does not, so the loader throws — A00 would say so, without saying which constraints there were',
  );

  const overflowed = gateProbeArtifacts(dirs, everything, (skeleton) => {
    const animations = skeleton.animations as Record<string, Record<string, unknown>>;
    const keys = deformKeysOf(animations.move, 'flat');
    keys[1].vertices = [1, 2, 3, 4, 5, 6, 7, 8];
  });
  say(
    'T18_A35_fires_on_a_run_that_overflows_the_deform_array',
    overflowed.failures.some((f) => f.assertion === 'A35_DEFORM_KEYS_FIT_THE_ATTACHMENT'),
    overflowed.failures.find((f) => f.assertion === 'A35_DEFORM_KEYS_FIT_THE_ATTACHMENT')?.detail ?? 'A35 accepted a run past the end',
    'Utils.arrayCopy into a Float32Array drops everything past the end, so the deform is applied to part of the mesh and looks nearly right',
  );

  const misaligned = gateProbeArtifacts(dirs, everything, (skeleton) => {
    const animations = skeleton.animations as Record<string, Record<string, unknown>>;
    deformKeysOf(animations.move, 'flat')[1].offset = 3;
  });
  say(
    'T19_A35_fires_on_an_odd_offset',
    misaligned.failures.some((f) => f.assertion === 'A35_DEFORM_KEYS_FIT_THE_ATTACHMENT'),
    misaligned.failures.find((f) => f.assertion === 'A35_DEFORM_KEYS_FIT_THE_ATTACHMENT')?.detail ?? 'A35 accepted an odd offset',
    'the array is pairs; an odd start reads every x as a y, which loads and tears the mesh',
  );

  return bad;
}

/** The `deform` key array of one slot in an emitted animation, for a mutant to edit. */
function deformKeysOf(animation: Record<string, unknown>, slot: string): Array<Record<string, unknown>> {
  const attachments = animation.attachments as Record<string, Record<string, Record<string, Record<string, unknown>>>>;
  return attachments.default[slot][slot].deform as Array<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// path constraints, sliders, and per-skin member lists
// ---------------------------------------------------------------------------
//
// ⭐ The last three expressiveness gaps in the rig spec (issues #2 and #7), and
// all three are checked the same way: by reading a NUMBER back off a posed
// skeleton. "It parses" is the failure mode this suite is designed against,
// because every one of these features has a way to load perfectly and do
// nothing:
//
//   * a path constraint whose slot shows no path attachment — `update()` returns
//     on the first line and the mixes in the file are a lie;
//   * a `lengths` array that disagrees with the vertices — invisible until
//     `constantSpeed` is false, and then it rescales the whole traversal;
//   * a slider whose animation is never applied, or applied at NaN;
//   * a per-skin `bones`/constraint list without `skin: true` on the member,
//     which changes nothing at all.
//
// So the geometry here is chosen to make the arithmetic exact rather than
// approximate. The path is a straight line whose Bezier handles are evenly
// spaced, which makes the curve parameter equal the arc-length parameter: the
// knots sit at x = 0, 90, 180, the path is 180 long, and a bone at position p
// (Percent) must land at exactly `180 * p`. A tolerance would hide a systematic
// error of a few percent; an exact number cannot.
const PATH_RIG = {
  bones: [
    { name: 'root' },
    { name: 'rider', parent: 'root', x: 0, y: 0, length: 20 },
    // The slider's dial and the bone its animation moves. Both hang off the root
    // so that neither is touched by the path constraint.
    { name: 'knob', parent: 'root', x: 0, y: 60 },
    { name: 'flag', parent: 'root', x: 40, y: 60, length: 20 },
    // The per-skin pair: a bone that only exists under one skin, and the IK
    // constraint that poses it there.
    { name: 'pauldron', parent: 'root', x: -40, y: 0, length: 10, skin: true },
    { name: 'pauldron-target', parent: 'root', x: -40, y: 20 },
  ],
  slots: [
    { name: 'track', bone: 'root', attachment: 'track' },
    { name: 'block', bone: 'rider', attachment: 'block' },
  ],
  skins: {
    default: {
      attachments: {
        track: {
          track: {
            type: 'path',
            vertexCount: 9,
            // Nine points: the first and last are the end knots' outer handles
            // and no curve uses them, which is why an open path of K curves
            // carries 3(K + 1) of them rather than 3K + 1.
            vertices: [-30, 0, 0, 0, 30, 0, 60, 0, 90, 0, 120, 0, 150, 0, 180, 0, 210, 0],
          },
        },
        block: { block: { image: 'block.png' } },
      },
    },
    // A skin with no attachments at all: everything it does, it does by
    // activating members. Emitting it is what makes the lists reachable.
    armoured: { bones: ['pauldron'], ik: ['pauldron-ik'] },
  },
  constraints: [
    {
      name: 'ride',
      type: 'path',
      bones: ['rider'],
      slot: 'track',
      positionMode: 'percent',
      spacingMode: 'percent',
      rotateMode: 'tangent',
      position: 0.25,
    },
    // 1/90 per degree, so 90° of dial is one second of animation.
    { name: 'dial', type: 'slider', animation: 'dial-pose', bone: 'knob', property: 'rotate', scale: 0.011111 },
    { name: 'pauldron-ik', type: 'ik', bones: ['pauldron'], target: 'pauldron-target', mix: 1, skin: true },
  ],
};

/** The animation the slider applies, plus whatever `move` is handed. */
function pathMotion(move: Record<string, unknown>): Record<string, unknown> {
  return {
    spec: 'rigc-motion/1',
    archetype: 'static_probe',
    cut: 'static_probe',
    easings: {},
    animations: {
      'dial-pose': {
        duration: 1,
        loop: false,
        tracks: [{ bone: 'flag', property: 'rotate', keys: [{ t: 0, v: [0] }, { t: 1, v: [90] }] }],
      },
      move,
    },
  };
}

/** The `move` animation the round-trip cases below all read. */
const PATH_MOVE = {
  duration: 1,
  loop: false,
  tracks: [
    // The physics shape: a target, a property, one key list (issue #2's comment).
    { path: 'ride', property: 'position', keys: [{ t: 0, v: [0] }, { t: 1, v: [0.5] }] },
    { bone: 'knob', property: 'rotate', keys: [{ t: 0, v: [0] }, { t: 1, v: [90] }] },
  ],
};

function runPathAndSliderSuite(): number {
  const dirs = writeProbeRig(PATH_RIG);
  let bad = 0;
  console.log('\n── path constraints, sliders and per-skin lists (self-contained: a straight 180-long path) ──');
  const say = (name: string, ok: boolean, detail: string, why: string): void => {
    bad += reportCase(name, ok, detail, why);
  };
  const near = (a: number, b: number, tol = 1e-4): boolean => Math.abs(a - b) <= tol;
  const motion = pathMotion(PATH_MOVE);

  const gate = gateProbe(dirs, motion);
  const wanted = [
    'A33_VERTEX_ATTACHMENT_GEOMETRY',
    'A34_CONSTRAINT_TIMELINE_TARGETS',
    'A36_PATH_CONSTRAINT_EFFECTIVE',
    'A37_SLIDER_CONSTRAINT_EFFECTIVE',
    'A38_SKIN_MEMBERS_ARE_SKIN_REQUIRED',
  ];
  say(
    'CONTROL_A_PATH_A_SLIDER_AND_TWO_SKINS_ARE_GREEN',
    gate.failures.length === 0 && wanted.every((a) => gate.passed.includes(a)),
    gate.failures.length === 0
      ? `${gate.passed.length} assertions ran; ${wanted.filter((a) => !gate.passed.includes(a)).join(', ') || 'all five new ones ran'}`
      : `[${gate.failures.map((f) => `${f.assertion}: ${f.detail}`).join('; ')}]`,
    'a suite of refusals cannot tell a compiler that emits nothing from one that emits the right thing',
  );

  const data = timelinePosable(dirs, motion).data;
  const boneOf = (skeleton: Skeleton, name: string) => skeleton.bones.find((b) => b.data.name === name)!.appliedPose;

  // --- the path: is the bone ON the curve? ---------------------------------
  const emitted = JSON.parse(
    compile({
      rigPath: dirs.rigPath,
      motionPath: join(dirs.dir, 'probe.motion.json'),
      outDir: dirs.outDir,
      imagesDir: dirs.dir,
    }).skeletonText,
  ) as Record<string, unknown>;
  const emittedPath = (
    (emitted.skins as Array<{ name: string; attachments: Record<string, Record<string, Record<string, unknown>>> }>)[0]
      .attachments.track.track
  );
  say(
    'PS01_the_path_lengths_are_MEASURED_off_the_geometry',
    Array.isArray(emittedPath.lengths) &&
      (emittedPath.lengths as number[]).length === 2 &&
      near((emittedPath.lengths as number[])[0], 90) &&
      near((emittedPath.lengths as number[])[1], 180),
    `lengths = [${(emittedPath.lengths as number[]).join(', ')}] for two curves whose knots sit at x = 0, 90, 180`,
    'the field has no parser default and a restated number that disagrees with the vertices is invisible until constantSpeed is false',
  );

  const setup = poseAtSample(data, 'move', 4, 0);
  const riderSetup = boneOf(setup, 'rider');
  say(
    'PS02_a_bone_lands_on_the_path_at_the_position_it_was_given',
    near(riderSetup.worldX, 0) && near(riderSetup.worldY, 0),
    `at position 0 the rider is at (${riderSetup.worldX.toFixed(4)}, ${riderSetup.worldY.toFixed(4)}); ` +
      `the setup constraint's own position 0.25 puts it at ${boneOf(
        poseAtSample(timelinePosable(dirs, pathMotion({ duration: 0, loop: false, tracks: [] })).data, 'move', 4, 0),
        'rider',
      ).worldX.toFixed(4)}`,
    'PathConstraint.update returns before touching a bone unless the slot shows a path, so "it moved at all" is the claim',
  );

  const riderAt = (sample: number): [number, number] => {
    const bone = boneOf(poseAtSample(data, 'move', 4, sample), 'rider');
    return [bone.worldX, bone.worldY];
  };
  const walk = [0, 1, 2, 4].map(riderAt);
  say(
    'PS03_a_position_timeline_slides_the_bone_along_the_path',
    walk.every(([, y]) => near(y, 0)) &&
      near(walk[0][0], 0) &&
      near(walk[1][0], 22.5) &&
      near(walk[2][0], 45) &&
      near(walk[3][0], 90),
    `worldX ${walk.map(([x]) => x.toFixed(3)).join(' -> ')} for position 0 -> 0.5 over a 180-long path`,
    'position is a fraction of the arc length under Percent, so 0.125 of 180 is 22.5 and any other number is a wrong traversal',
  );

  const slowDirs = writeProbeRig({
    ...PATH_RIG,
    skins: {
      ...PATH_RIG.skins,
      default: {
        attachments: {
          ...PATH_RIG.skins.default.attachments,
          track: { track: { ...PATH_RIG.skins.default.attachments.track.track, constantSpeed: false } },
        },
      },
    },
  });
  const slowRider = boneOf(poseAtSample(timelinePosable(slowDirs, motion).data, 'move', 4, 2), 'rider');
  say(
    'PS04_constantSpeed_false_lands_in_the_same_place_as_true',
    near(slowRider.worldX, 45) && near(slowRider.worldY, 0),
    `with constantSpeed false the rider is at x=${slowRider.worldX.toFixed(4)}, where the re-measuring traversal puts it at 45`,
    'this is the only case that reads the emitted lengths at all: `false` trusts them, `true` recomputes, and a wrong array shows up as a different place',
  );

  // A path weighted across two bones 180 apart is the one shape where measuring
  // the arc length in a bone's own space and measuring it in the world give
  // different answers.
  const spanDirs = writeProbeRig({
    ...PATH_RIG,
    bones: [...PATH_RIG.bones, { name: 'left', parent: 'root', x: 0, y: 0 }, { name: 'right', parent: 'root', x: 180, y: 0 }],
    skins: {
      ...PATH_RIG.skins,
      default: {
        attachments: {
          ...PATH_RIG.skins.default.attachments,
          track: {
            track: {
              type: 'path',
              vertexCount: 9,
              weights: [-30, 0, 30, 60, 90, 120, 150, 180, 210].map((x, i) =>
                i < 5 ? [{ bone: 'left', x, y: 0, weight: 1 }] : [{ bone: 'right', x: x - 180, y: 0, weight: 1 }],
              ),
            },
          },
        },
      },
    },
  });
  const spanRider = boneOf(poseAtSample(timelinePosable(spanDirs, motion).data, 'move', 4, 2), 'rider');
  say(
    'PS05_a_weighted_path_is_measured_in_WORLD_space',
    near(spanRider.worldX, 45) && near(spanRider.worldY, 0),
    `the same curve bound half to a bone at x=0 and half to one at x=180 puts the rider at x=${spanRider.worldX.toFixed(4)}`,
    'each influence has to go to the world through its OWN bone before the arc length is summed; a per-attachment shortcut gets this one wrong',
  );

  // --- the slider: does the animation it applies actually arrive? -----------
  const dialAt = (sample: number): { time: number; flag: number; knob: number } => {
    const skeleton = poseAtSample(data, 'move', 4, sample);
    return {
      time: skeleton.findConstraint('dial', Slider)!.appliedPose.time,
      flag: boneOf(skeleton, 'flag').rotation,
      knob: boneOf(skeleton, 'knob').rotation,
    };
  };
  const dial0 = dialAt(0);
  const dialHalf = dialAt(2);
  const dialEnd = dialAt(4);
  say(
    'PS06_a_slider_maps_a_bone_property_to_the_time_of_the_animation_it_applies',
    near(dial0.flag, 0) && near(dialHalf.flag, 45, 0.01) && near(dialEnd.flag, 90, 0.01) && near(dialHalf.time, 0.5, 0.01),
    `knob ${dial0.knob.toFixed(1)}° -> ${dialHalf.knob.toFixed(1)}° -> ${dialEnd.knob.toFixed(1)}° drives slider time ` +
      `${dial0.time.toFixed(3)} -> ${dialHalf.time.toFixed(3)} -> ${dialEnd.time.toFixed(3)}, and the animation it applies ` +
      `puts flag at ${dial0.flag.toFixed(1)}° -> ${dialHalf.flag.toFixed(1)}° -> ${dialEnd.flag.toFixed(1)}°`,
    'nothing else in this format applies an animation, so the only proof that a slider works is a bone moving that no timeline in the playing animation touches',
  );

  const muted = timelinePosable(
    dirs,
    pathMotion({
      duration: 1,
      loop: false,
      tracks: [
        { bone: 'knob', property: 'rotate', keys: [{ t: 0, v: [0] }, { t: 1, v: [90] }] },
        { slider: 'dial', property: 'mix', keys: [{ t: 0, v: [0] }, { t: 1, v: [0] }] },
      ],
    }),
  ).data;
  const mutedFlag = boneOf(poseAtSample(muted, 'move', 4, 2), 'flag').rotation;
  say(
    'PS07_a_slider_mix_timeline_mutes_it',
    near(mutedFlag, 0),
    `with the mix keyed to 0 while the dial still turns to 45°, flag stays at ${mutedFlag.toFixed(3)}°`,
    'update() returns on mix 0, so a mix timeline is the difference between a slider that is off and one nobody keyed',
  );

  // --- the per-skin lists: which skin has the bone? ------------------------
  const withSkin = (skin: string | null): { active: boolean; ik: boolean; rotation: number } => {
    const skeleton = new Skeleton(data);
    if (skin) skeleton.setSkin(skin);
    skeleton.setupPose();
    skeleton.update(0);
    skeleton.updateWorldTransform(Physics.reset);
    const bone = skeleton.bones.find((b) => b.data.name === 'pauldron')!;
    return {
      active: bone.active,
      ik: skeleton.findConstraint('pauldron-ik', IkConstraint)!.active,
      rotation: bone.appliedPose.getWorldRotationX(),
    };
  };
  const bare = withSkin(null);
  const asDefault = withSkin('default');
  const armoured = withSkin('armoured');
  say(
    'PS08_a_per_skin_list_gates_which_bones_and_constraints_are_active',
    !bare.active && !bare.ik && !asDefault.active && armoured.active && armoured.ik &&
      near(asDefault.rotation, 0) && near(armoured.rotation, 90),
    `pauldron active: no skin ${String(bare.active)}, "default" ${String(asDefault.active)}, "armoured" ` +
      `${String(armoured.active)}; its IK ${String(armoured.ik)} under "armoured", and the bone poses to ` +
      `${armoured.rotation.toFixed(2)}° there against ${asDefault.rotation.toFixed(2)}° elsewhere`,
    'the pose is the claim: skinRequired members are switched off until a skin names them, and "listed" without the flag would look identical here',
  );

  // --- the refusals ---------------------------------------------------------
  const noPath = refusal(
    writeProbeRig({
      ...PATH_RIG,
      constraints: [{ ...PATH_RIG.constraints[0], slot: 'block' }, PATH_RIG.constraints[1], PATH_RIG.constraints[2]],
    }),
    motion,
  );
  say(
    'PS09_a_path_constraint_on_a_slot_with_no_path_is_refused',
    noPath !== null && noPath.includes('has no path attachment in any skin'),
    noPath === null ? 'the compile went through' : `refused with: ${noPath}`,
    'PathConstraint.update returns on its first line unless the slot shows a path, so the constraint loads, reports its mixes and moves nothing',
  );

  const pathAttachment = (patch: Record<string, unknown>): ProbeDirs =>
    writeProbeRig({
      ...PATH_RIG,
      skins: {
        ...PATH_RIG.skins,
        default: {
          attachments: {
            ...PATH_RIG.skins.default.attachments,
            track: { track: { ...PATH_RIG.skins.default.attachments.track.track, ...patch } },
          },
        },
      },
    });

  const notThree = refusal(pathAttachment({ vertexCount: 8, vertices: new Array(16).fill(0).map((_, i) => (i % 2 ? 0 : i * 10)) }), motion);
  say(
    'PS10_a_vertexCount_that_is_not_a_multiple_of_3_is_refused',
    notThree !== null && notThree.includes('not a multiple of 3'),
    notThree === null ? 'the compile went through' : `refused with: ${notThree}`,
    '`Utils.newArray(vertexCount / 3, 0)` accepts a fractional size without a word and the groups of six then straddle the knots',
  );

  const tooShort = refusal(pathAttachment({ vertexCount: 3, vertices: [0, 0, 30, 0, 60, 0] }), motion);
  say(
    'PS11_an_open_path_with_less_than_one_curve_is_refused',
    tooShort !== null && tooShort.includes('needs at least 6'),
    tooShort === null ? 'the compile went through' : `refused with: ${tooShort}`,
    'an open path drops its first and last point, so three of them leave a one-point chain and no curve at all',
  );

  const restated = refusal(pathAttachment({ lengths: [90, 180] }), motion);
  say(
    'PS12_an_authored_lengths_array_is_refused',
    restated !== null && restated.includes('rigc measures the setup arc length'),
    restated === null ? 'the compile went through' : `refused with: ${restated}`,
    'it is a measurement of the vertices two fields above it, exactly like a region\'s size against its PNG — a second copy can only drift',
  );

  const badMode = refusal(
    writeProbeRig({
      ...PATH_RIG,
      constraints: [{ ...PATH_RIG.constraints[0], rotateMode: 'CHAINSCALE' }, PATH_RIG.constraints[1], PATH_RIG.constraints[2]],
    }),
    motion,
  );
  say(
    'PS13_an_enum_name_the_parser_cannot_resolve_is_refused',
    badMode !== null && badMode.includes('rotateMode is "CHAINSCALE"') && badMode.includes('first letter'),
    badMode === null ? 'the compile went through' : `refused with: ${badMode}`,
    'enumValue uppercases the first letter and nothing else, so an unresolved name is assigned as undefined and the constraint runs a mode nobody chose',
  );

  const noAnimation = refusal(
    writeProbeRig({
      ...PATH_RIG,
      constraints: [PATH_RIG.constraints[0], { ...PATH_RIG.constraints[1], animation: 'dial-posee' }, PATH_RIG.constraints[2]],
    }),
    motion,
  );
  say(
    'PS14_a_slider_naming_an_animation_the_motion_spec_lacks_is_refused',
    noAnimation !== null && noAnimation.includes('which the motion spec does not declare') && noAnimation.includes('dial-pose'),
    noAnimation === null ? 'the compile went through' : `refused with: ${noAnimation}`,
    'a slider is the one field in a rig spec that points across the file boundary, and the parser resolves it in a second pass and throws',
  );

  const bothModels = refusal(
    writeProbeRig({
      ...PATH_RIG,
      constraints: [PATH_RIG.constraints[0], { ...PATH_RIG.constraints[1], time: 0.5 }, PATH_RIG.constraints[2]],
    }),
    motion,
  );
  say(
    'PS15_a_slider_that_mixes_its_two_models_is_refused',
    bothModels !== null && bothModels.includes('declares both a "bone" and "time"'),
    bothModels === null ? 'the compile went through' : `refused with: ${bothModels}`,
    '`bone` switches the whole model and the parser reads `time` only in the other branch, so it would be dropped in silence',
  );

  const unflagged = refusal(
    writeProbeRig({
      ...PATH_RIG,
      bones: PATH_RIG.bones.map((b) => (b.name === 'pauldron' ? { ...b, skin: undefined } : b)),
    }),
    motion,
  );
  say(
    'PS16_a_skin_member_without_skin_true_is_refused',
    unflagged !== null && unflagged.includes('does not declare `"skin": true`'),
    unflagged === null ? 'the compile went through' : `refused with: ${unflagged}`,
    'updateCache starts a bone active unless it is skinRequired, so the list would change nothing and the rig would look skinned',
  );

  const orphan = refusal(
    writeProbeRig({ ...PATH_RIG, skins: { default: PATH_RIG.skins.default, armoured: { ik: ['pauldron-ik'] } } }),
    motion,
  );
  say(
    'PS17_a_skin_true_member_no_skin_activates_is_refused',
    orphan !== null && orphan.includes('but no skin activates it'),
    orphan === null ? 'the compile went through' : `refused with: ${orphan}`,
    'the other direction of the same switch, and the one that costs a pose: the bone is inactive under every skin there is',
  );

  const strayKey = refusal(
    writeProbeRig({
      ...PATH_RIG,
      skins: { ...PATH_RIG.skins, armoured: { bones: ['pauldron'], ik: ['pauldron-ik'], block: { block: { image: 'block.png' } } } },
    }),
    motion,
  );
  say(
    'PS18_a_slot_left_outside_a_long_form_skin_is_refused',
    strayKey !== null && strayKey.includes('Move it inside "attachments"'),
    strayKey === null ? 'the compile went through' : `refused with: ${strayKey}`,
    'the two spellings of a skin are told apart by these keys, so a slot beside them is an attachment table nobody would read',
  );

  const wrongType = refusal(
    dirs,
    pathMotion({
      duration: 1,
      loop: false,
      tracks: [{ path: 'dial', property: 'position', keys: [{ t: 0, v: [0] }, { t: 1, v: [0.5] }] }],
    }),
  );
  say(
    'PS19_keying_a_slider_as_a_path_constraint_is_refused_by_type',
    wrongType !== null && wrongType.includes('but the rig declares it as a "slider"'),
    wrongType === null ? 'the compile went through' : `refused with: ${wrongType}`,
    'findConstraint(name, PathConstraintData) resolves by name AND type, so a right name of the wrong type is a miss and the loader throws',
  );

  const deadSlider = gateProbe(
    writeProbeRig({
      ...PATH_RIG,
      constraints: [PATH_RIG.constraints[0], { ...PATH_RIG.constraints[1], animation: 'still', loop: true }, PATH_RIG.constraints[2]],
    }),
    {
      ...pathMotion(PATH_MOVE),
      animations: {
        ...(pathMotion(PATH_MOVE).animations as Record<string, unknown>),
        still: { duration: 0, loop: false, tracks: [] },
      },
    },
  );
  say(
    'PS20_A37_fires_on_a_slider_that_loops_an_empty_animation',
    deadSlider.failures.filter((f) => f.assertion === 'A37_SLIDER_CONSTRAINT_EFFECTIVE').length === 2,
    deadSlider.failures
      .filter((f) => f.assertion === 'A37_SLIDER_CONSTRAINT_EFFECTIVE')
      .map((f) => f.detail)
      .join(' | ') || 'A37 accepted a slider whose animation has no timelines and whose loop divides by its duration',
    'looping divides by the animation duration, so a zero-length one applies the animation at NaN — and an animation with no timelines applies nothing at all',
  );

  const brokenPath = gateProbeArtifacts(dirs, motion, (skeleton) => {
    const skins = skeleton.skins as Array<{ attachments: Record<string, Record<string, Record<string, unknown>>> }>;
    skins[0].attachments.track.track.type = 'boundingbox';
  });
  say(
    'PS21_A36_fires_when_the_constrained_slot_stops_showing_a_path',
    brokenPath.failures.some((f) => f.assertion === 'A36_PATH_CONSTRAINT_EFFECTIVE'),
    brokenPath.failures.find((f) => f.assertion === 'A36_PATH_CONSTRAINT_EFFECTIVE')?.detail ??
      'A36 accepted a path constraint whose slot shows no path',
    'the artifact is internally consistent — the slot exists, the attachment loads, every mix is 1 — and the constraint still does nothing',
  );

  const brokenLengths = gateProbeArtifacts(dirs, motion, (skeleton) => {
    const skins = skeleton.skins as Array<{ attachments: Record<string, Record<string, Record<string, unknown>>> }>;
    (skins[0].attachments.track.track.lengths as number[])[1] = 45;
  });
  say(
    'PS22_A33_fires_on_a_lengths_array_that_does_not_increase',
    brokenLengths.failures.some((f) => f.assertion === 'A33_VERTEX_ATTACHMENT_GEOMETRY'),
    brokenLengths.failures.find((f) => f.assertion === 'A33_VERTEX_ATTACHMENT_GEOMETRY')?.detail ??
      'A33 accepted a cumulative length that went backwards',
    'the array is cumulative, so a value below its predecessor is either a zero-length curve or an array shorter than the geometry',
  );

  const unflaggedArtifact = gateProbeArtifacts(dirs, motion, (skeleton) => {
    const bones = skeleton.bones as Array<Record<string, unknown>>;
    delete bones.find((b) => b.name === 'pauldron')!.skin;
  });
  say(
    'PS23_A38_fires_on_a_listed_bone_that_is_not_skinRequired',
    unflaggedArtifact.failures.some((f) => f.assertion === 'A38_SKIN_MEMBERS_ARE_SKIN_REQUIRED'),
    unflaggedArtifact.failures.find((f) => f.assertion === 'A38_SKIN_MEMBERS_ARE_SKIN_REQUIRED')?.detail ??
      'A38 accepted a skin list whose member is active under every skin',
    'the pairing is what is wrong, so nothing else can see it: the bone loads, the list loads, and the skin changes nothing',
  );

  const emptyKeys = gateProbeArtifacts(dirs, motion, (skeleton) => {
    const animations = skeleton.animations as Record<string, Record<string, unknown>>;
    (animations.move.path as Record<string, Record<string, unknown[]>>).ride.position = [];
  });
  say(
    'PS24_A34_fires_on_a_path_timeline_with_no_keys',
    emptyKeys.failures.some((f) => f.assertion === 'A34_CONSTRAINT_TIMELINE_TARGETS'),
    emptyKeys.failures.find((f) => f.assertion === 'A34_CONSTRAINT_TIMELINE_TARGETS')?.detail ??
      'A34 accepted an empty key array on a path timeline',
    '`let keyMap = timelineMap[0]; if (!keyMap) continue;` — the group is walked, the timeline is skipped, and nothing is said',
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
// contour meshes, and the rig-spec generator path (issues #6 and #1)
// ---------------------------------------------------------------------------
//
// Two gaps, one suite, because they are the same missing fixture. `generator` on
// a rig-spec mesh attachment — the path a skeleton with NO manifest takes — had
// no coverage at all (#1): every ring and ribbon in this repository reaches
// `src/mesh.ts` through a manifest's `mesh` block, so the placement convention
// that path documents ("no crop to flip against, so the part window is centred
// on its own slot bone") was a comment nothing measured. `contour` is a third
// generator that only exists on that path, because the shape it builds is
// measured off the attachment's own PNG rather than declared anywhere.
//
// ⭐ What makes this suite different from the ones above it: a contour mesh's
// geometry is a CLAIM ABOUT THE ART — "these triangles are that silhouette" —
// and no assertion over a skeleton file can check it, because the file does not
// carry the art. So the cases below rasterise the emitted triangles back against
// the very PNG they were traced from, and render the mesh beside the plain region
// attachment of the same part. Everything they read comes back out of the
// artifact through spine-core; nothing here asks the compiler what it built.
//
// ⚠️ What they do NOT claim: that a contour mesh looks better than a region, or
// that this outline is the outline an artist would draw. The blob below is a
// generated checkerboard. What they claim is that the mesh covers the art, does
// not reach past it, is a well-formed triangulation, and draws the SAME PICTURE
// as the region does at rest — which is the honesty check, since a mesh that
// distorted the art at rest would be a defect no other number here would show.

/** The part window every case in this suite traces. */
const CONTOUR_W = 96;
const CONTOUR_H = 64;

/**
 * Where the slot bone sits, away from the origin on both axes.
 *
 * At (0,0) "the window is centred on its slot bone" and "the window is centred
 * on the world origin" are the same measurement, and issue #1's convention is
 * the first of those. A bone off both axes tells them apart.
 */
const CONTOUR_BONE: [number, number] = [20, -10];

/** Tolerance and margin every accepted case uses, so the numbers are comparable. */
const CONTOUR_TOLERANCE = 1.5;
const CONTOUR_MARGIN = 2;

/**
 * How far apart the contour build and the region build of one part may draw.
 *
 * 1/255 on the worst channel of the worst pixel. Not 0, and the reason is
 * arithmetic rather than art: `rasteriseQuad` inverts one affine map to get its
 * (u,v) and `rasteriseMesh` interpolates barycentrics, so the two agree to
 * floating-point and then round to bytes — a pixel whose sample lands on x.5
 * can round either way. Anything a mesh could do WRONG here (a clipped
 * silhouette, a distorted uv, a vertex in the wrong place) moves whole pixels of
 * colour, which is what the 2px control below measures for comparison.
 */
const CONTOUR_REST_TOLERANCE = 1;

const CONTOUR_MOTION = {
  spec: 'rigc-motion/1',
  archetype: 'contour_probe',
  cut: 'contour_probe',
  easings: {},
  animations: {},
};

/**
 * The blob every case traces: a checkered ellipse with a bite out of one side.
 *
 * Concave on purpose — a convex outline is triangulated correctly by a fan, so an
 * ear-clipper that could only do fans would pass a convex fixture. The bite is
 * what makes at least one corner reflex.
 *
 * Checkered rather than flat for the reason every plate in this repository is:
 * a flat fill makes a wrong uv invisible, and the rest-pose comparison is
 * exactly a claim about uvs.
 */
function contourBlob(x: number, y: number): boolean {
  const inEllipse = Math.hypot((x - 44) / 40, (y - 32) / 28) <= 1;
  const inBite = Math.hypot(x - 92, y - 32) <= 22;
  return inEllipse && !inBite;
}

function writeContourArt(path: string, art: (x: number, y: number) => boolean, width: number, height: number): void {
  const plate = new Plate(width, height);
  const cell = 6;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!art(x, y)) continue;
      const on = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      plate.set(x, y, on ? [206, 212, 226, 255] : [24, 28, 36, 255]);
    }
  }
  plate.writePng(path);
}

interface ContourBuild {
  dir: string;
  opts: Options;
  artPath: string;
  result: CompileResult;
}

/**
 * One bare rig spec — no manifest — showing `attachment` on a slot whose bone
 * sits at `CONTOUR_BONE`, plus whatever extra bones the generator needs.
 *
 * `invariants.meshSlots` is declared because it has to be: a rig that states no
 * budget has an implicit one of ZERO for rigc's own generators (compile.ts's
 * `budgeted`), so "the rig never asked rigc to build a mesh" is itself a
 * refusal. A suite that omitted it would be testing that refusal.
 */
function buildContourRig(
  attachment: Record<string, unknown>,
  extra: {
    bones?: Array<Record<string, unknown>>;
    art?: (x: number, y: number) => boolean;
    width?: number;
    height?: number;
    bone?: [number, number];
    invariants?: Record<string, unknown> | null;
  } = {},
): ContourBuild {
  const dir = mkdtempSync(join(tmpdir(), 'rigc-contour-'));
  const artPath = join(dir, 'blob.png');
  writeContourArt(artPath, extra.art ?? contourBlob, extra.width ?? CONTOUR_W, extra.height ?? CONTOUR_H);
  const [bx, by] = extra.bone ?? CONTOUR_BONE;
  const rigPath = join(dir, 'probe.rig.json');
  writeFileSync(
    rigPath,
    `${JSON.stringify(
      {
        spec: 'rigc-rig/1',
        name: 'contour_probe',
        skeleton: { width: 256, height: 256 },
        ...(extra.invariants === null ? {} : { invariants: extra.invariants ?? { meshSlots: 1, meshTriangles: 120 } }),
        bones: [{ name: 'root' }, { name: 'blob', parent: 'root', x: bx, y: by }, ...(extra.bones ?? [])],
        slots: [{ name: 'blob', bone: 'blob', attachment: 'blob' }],
        skins: { default: { blob: { blob: attachment } } },
      },
      null,
      2,
    )}\n`,
  );
  const motionPath = join(dir, 'probe.motion.json');
  writeFileSync(motionPath, `${JSON.stringify(CONTOUR_MOTION, null, 2)}\n`);
  const opts: Options = { rigPath, motionPath, outDir: join(dir, 'spine'), imagesDir: dir };
  return { dir, opts, artPath, result: compile(opts) };
}

/** The `contour` generator every accepted case in this suite declares. */
const CONTOUR_ATTACHMENT = {
  type: 'mesh',
  image: 'blob.png',
  generator: { kind: 'contour', tolerance: CONTOUR_TOLERANCE, margin: CONTOUR_MARGIN, maxVertices: 48 },
};

/**
 * A `ring` generator on the same window, for issue #1's placement case.
 *
 * The hull is an invented octagon inside the window, star-shaped about its
 * centre — the two things `buildRingMesh` refuses without. Nothing about it is
 * measured off the blob: the ring's rim sits on the WINDOW edge whatever the
 * hull is, and the window is what this case is about.
 */
const RING_ATTACHMENT = {
  type: 'mesh',
  image: 'blob.png',
  generator: {
    kind: 'ring',
    size: [CONTOUR_W, CONTOUR_H],
    center: [CONTOUR_W / 2, CONTOUR_H / 2],
    inner: 0.45,
    controls: ['blob_ctl'],
    hull: [
      [36, 8],
      [60, 8],
      [88, 24],
      [88, 40],
      [60, 56],
      [36, 56],
      [8, 40],
      [8, 24],
    ],
  },
};

/** The compile message a rig spec was refused with, or null if it went through. */
function contourRefusal(attachment: Record<string, unknown>, extra?: Parameters<typeof buildContourRig>[1]): string | null {
  try {
    buildContourRig(attachment, extra);
    return null;
  } catch (err) {
    return err instanceof CompileError ? err.message : `NOT a CompileError: ${(err as Error).message}`;
  }
}

/** The mesh attachment a build emitted, read back off the artifact through spine-core. */
function loadedContourMesh(build: ContourBuild): { posable: Posable; mesh: MeshAttachment } {
  const posable = posableFromText(build.result.skeletonText, build.result.atlasText, build.opts.outDir);
  const slot = posable.data.findSlot('blob');
  const attachment = slot ? posable.data.findSkin('default')?.getAttachment(slot.index, 'blob') : null;
  if (!(attachment instanceof MeshAttachment)) {
    throw new Error(`the contour build's slot shows ${attachment ? attachment.constructor.name : 'nothing'}`);
  }
  return { posable, mesh: attachment };
}

/** The part-local pixel positions of a loaded mesh, recovered from its own uvs. */
function contourPointsOf(mesh: MeshAttachment): Array<[number, number]> {
  const uvs = mesh.regionUVs ?? [];
  const points: Array<[number, number]> = [];
  for (let i = 0; i < uvs.length; i += 2) points.push([uvs[i] * mesh.width, uvs[i + 1] * mesh.height]);
  return points;
}

/**
 * Every geometric property a triangle set has to have, measured in one pass.
 *
 * Written as a function taking geometry rather than as four inline loops so that
 * every case below can run it on a DELIBERATELY BROKEN set as its own control.
 * A property checker nobody has watched reject something is not a check.
 */
function triangleFaults(points: Array<[number, number]>, triangles: ArrayLike<number>): string[] {
  const faults: string[] = [];
  const seen = new Map<string, number>();
  points.forEach(([x, y], i) => {
    const key = `${x.toFixed(6)},${y.toFixed(6)}`;
    const at = seen.get(key);
    if (at !== undefined) faults.push(`vertices ${at} and ${i} are the same point (${key})`);
    else seen.set(key, i);
  });
  if (triangles.length === 0 || triangles.length % 3 !== 0) faults.push(`${triangles.length} indices is not whole triangles`);
  const edges = new Map<string, number>();
  const signs = new Set<number>();
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    const ids = [triangles[t], triangles[t + 1], triangles[t + 2]];
    for (const id of ids) {
      if (!(id >= 0 && id < points.length)) faults.push(`triangle ${t / 3} indexes vertex ${id} of ${points.length}`);
    }
    const [a, b, c] = ids.map((id) => points[id] ?? [0, 0]);
    const twice = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(twice) < 1e-9) faults.push(`triangle ${t / 3} has no area`);
    else signs.add(Math.sign(twice));
    for (let k = 0; k < 3; k++) {
      const u = ids[k];
      const v = ids[(k + 1) % 3];
      const key = `${Math.min(u, v)}-${Math.max(u, v)}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  if (signs.size > 1) faults.push(`the triangles wind both ways (${[...signs].join(' and ')})`);
  for (const [edge, n] of edges) {
    // 1 = a boundary edge of the mesh, 2 = an interior edge shared by its two
    // triangles. 3 or more is a fold: two triangles claim the same side of one
    // edge, which the rasteriser draws twice and source-over blends twice.
    if (n > 2) faults.push(`edge ${edge} is shared by ${n} triangles`);
  }
  return faults;
}

/** Worst and mean per-channel difference between two plates of the same size. */
function plateDifference(a: Plate, b: Plate): { worst: number; mean: number; differing: number } {
  if (a.width !== b.width || a.height !== b.height) throw new Error('comparing plates of different sizes');
  let worst = 0;
  let sum = 0;
  let differing = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    let d = 0;
    for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(a.data[i + c] - b.data[i + c]));
    worst = Math.max(worst, d);
    sum += d;
    if (d > 0) differing++;
  }
  return { worst, mean: sum / (a.data.length / 4), differing };
}

/** The world box of one slot's posed vertices, at the setup pose. */
function slotWorldBox(posable: Posable, slot: string): { cx: number; cy: number; w: number; h: number } {
  const frame = sampleSetupPose(posable.data)[0];
  const piece = frame.pieces.find((p) => p.slot === slot);
  if (!piece) throw new Error(`the setup pose draws nothing on slot "${slot}"`);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < piece.world.length; i += 2) {
    minX = Math.min(minX, piece.world[i]);
    maxX = Math.max(maxX, piece.world[i]);
    minY = Math.min(minY, piece.world[i + 1]);
    maxY = Math.max(maxY, piece.world[i + 1]);
  }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}

function runContourMeshSuite(): number {
  let bad = 0;
  console.log('\n── contour meshes and the rig-spec generator path (self-contained) ──');
  const say = (name: string, ok: boolean, detail: string, why: string): void => {
    bad += reportCase(name, ok, detail, why);
  };

  const build = buildContourRig(CONTOUR_ATTACHMENT);
  const gate = validate({
    skeletonText: build.result.skeletonText,
    atlasText: build.result.atlasText,
    atlasDir: build.opts.outDir,
    declaredDurations: build.result.declaredDurations,
    rig: build.result.rig,
    profile: 'spine-html',
  });
  const emitted = build.result.meshes[0];
  say(
    'CT00_CONTROL_A_CONTOUR_MESH_COMPILES_AND_GATES_GREEN',
    gate.failures.length === 0 &&
      gate.passed.includes('A21_MESH_RIM_PINNED') &&
      emitted?.kind === 'contour' &&
      emitted.triangles > 0,
    gate.failures.length === 0
      ? `${gate.passed.length} assertions ran under the renderer profile; slot "${emitted?.slot}" is a ` +
          `${emitted?.kind} of ${emitted?.vertices} vertices / ${emitted?.triangles} triangles, and ` +
          `A21_MESH_RIM_PINNED ${gate.passed.includes('A21_MESH_RIM_PINNED') ? 'ran' : 'did NOT run'}`
      : `[${gate.failures.map((f) => `${f.assertion}: ${f.detail}`).join('; ')}]`,
    'the generator used to be a NotImplementedError naming itself; everything below would be vacuous without this',
  );
  if (gate.failures.length > 0 || !emitted) return bad + 8;

  // --- the triangulation, and the checker's own control --------------------
  const { posable, mesh } = loadedContourMesh(build);
  const points = contourPointsOf(mesh);
  const faults = triangleFaults(points, mesh.triangles);
  // The control: fold one triangle back on top of its neighbour, which makes a
  // third claimant for their shared edge and reverses a winding. A checker that
  // cannot see this cannot report the clean set above as evidence.
  const folded = [...Array.from(mesh.triangles), mesh.triangles[0], mesh.triangles[2], mesh.triangles[1]];
  const foldFaults = triangleFaults(points, folded);
  say(
    'CT01_THE_TRIANGULATION_IS_WELL_FORMED_AND_THE_CHECK_CAN_SAY_OTHERWISE',
    faults.length === 0 && foldFaults.length > 0,
    faults.length === 0
      ? `${mesh.triangles.length / 3} triangles over ${points.length} distinct vertices: every one has area, all ` +
          `wind the same way, no edge is claimed more than twice — while one triangle folded back on its ` +
          `neighbour reports [${foldFaults.join('; ')}]`
      : `[${faults.join('; ')}]`,
    'a folded or zero-area triangle loads clean, sums its weights to 1, and renders as a double-blended crease',
  );

  // --- the claim about the art ---------------------------------------------
  // Measured through `src/mesh.ts`'s own instruments on purpose: the generator
  // refuses a build below CONTOUR_MIN_COVERAGE using this same function, so a
  // second implementation here would be a second opinion about what "covered"
  // means. What is independent is the GEOMETRY — it comes back out of the
  // artifact through spine-core, not from the builder.
  const plate = readPlate(build.artPath);
  const alpha = new Uint8Array(plate.width * plate.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = plate.data[i * 4 + 3];
  const artMask = { width: plate.width, height: plate.height, alpha };
  const traced = traceAlphaOutline(artMask, 1);
  const bound = contourOvershootBound(CONTOUR_MARGIN, CONTOUR_TOLERANCE);
  const fit = measureContourFit(artMask, 1, traced.filled, points, Array.from(mesh.triangles), bound + 1);
  // The wall, from the other side: a margin that cannot pay for the tolerance
  // must be REFUSED rather than shipped as a mesh that bites into the art.
  const clipped = contourRefusal({
    type: 'mesh',
    image: 'blob.png',
    generator: { kind: 'contour', tolerance: 9, margin: 0, maxVertices: 48 },
  });
  say(
    'CT02_THE_EMITTED_TRIANGLES_COVER_THE_ART_AND_A_MESH_THAT_WOULD_NOT_IS_REFUSED',
    fit.coverage >= CONTOUR_MIN_COVERAGE &&
      fit.overshoot <= bound &&
      clipped !== null &&
      clipped.includes('of the art') &&
      clipped.includes('a contour mesh guarantees'),
    fit.coverage >= CONTOUR_MIN_COVERAGE
      ? `${(fit.coverage * 100).toFixed(3)}% of ${fit.artPixels} art px are inside the emitted triangles ` +
          `(guarantee ${(CONTOUR_MIN_COVERAGE * 100).toFixed(1)}%), reaching ${fit.overshoot.toFixed(2)}px past the ` +
          `silhouette against a ${bound.toFixed(2)}px ceiling — and tolerance 9 with margin 0 is refused: ` +
          `${clipped?.split(': ').slice(1).join(': ')}`
      : `only ${(fit.coverage * 100).toFixed(3)}% of ${fit.artPixels} art px are covered ` +
          `(${fit.coveredArt}); the mesh clips the art`,
    'a mesh that clips its own art is invisible in every number a skeleton file carries',
  );

  // --- the spine-core round trip -------------------------------------------
  const emittedJson = JSON.parse(build.result.skeletonText) as {
    skins: Array<{ attachments: Record<string, Record<string, { triangles: number[]; hull: number; uvs: number[] }>> }>;
  };
  const onDisk = emittedJson.skins[0].attachments.blob.blob;
  const slotBone = posable.data.findSlot('blob')?.boneData.name;
  // ⚠️ NOT `weightRuns`: that walks the JSON's `boneCount, (index, x, y, weight)`
  // run, and spine-core splits the same data into two arrays with two strides —
  // `bones` holds `boneCount, index...` and `vertices` holds an `x, y, weight`
  // triple per influence. Reading one with the other's stride finds bone indices
  // where the weights are and reports a correct mesh as unpinned.
  const perVertex: Array<Array<{ bone: number; weight: number }>> = [];
  if (mesh.bones) {
    for (let bi = 0, vi = 0; bi < mesh.bones.length; ) {
      const boneCount = mesh.bones[bi++];
      const vertex: Array<{ bone: number; weight: number }> = [];
      for (let n = 0; n < boneCount; n++, bi++, vi += 3) {
        vertex.push({ bone: mesh.bones[bi], weight: mesh.vertices[vi + 2] });
      }
      perVertex.push(vertex);
    }
  }
  const pinnedToSlot =
    perVertex.length === points.length &&
    perVertex.every(
      (vertex) =>
        vertex.length === 1 &&
        Math.abs(vertex[0].weight - 1) < 1e-9 &&
        posable.data.bones[vertex[0].bone]?.name === slotBone,
    );
  say(
    'CT03_THE_ARTIFACT_LOADS_BACK_AS_THE_MESH_THAT_WAS_WRITTEN',
    mesh.worldVerticesLength === points.length * 2 &&
      mesh.hullLength === points.length * 2 &&
      onDisk.hull === points.length &&
      Array.from(mesh.triangles).join(',') === onDisk.triangles.join(',') &&
      pinnedToSlot,
    `${points.length} vertices and ${mesh.triangles.length / 3} triangles came back with indices identical to the ` +
      `file's, hull ${onDisk.hull} loading as ${mesh.hullLength} (the loader doubles it), and every vertex ` +
      `${pinnedToSlot ? `bound to one bone — the slot's own "${slotBone}" — at weight 1` : 'NOT pinned to the slot bone'}`,
    'the weighted run carries no encoding flag, so a wrong length reads weights as coordinates in silence',
  );

  // --- the honesty check: does the mesh distort the art at rest? -----------
  const regionBuild = buildContourRig({ type: 'region', image: 'blob.png' }, { invariants: null });
  const regionPosable = posableFromText(
    regionBuild.result.skeletonText,
    regionBuild.result.atlasText,
    regionBuild.opts.outDir,
  );
  // One viewport for every render here, generously bigger than the part: fitting
  // each build to its own content would move the pixel grid between them and
  // report the framing as a difference.
  const viewport = viewportFor(-60, -80, 100, 60, 320);
  const drawn = (p: Posable): Plate => renderFrame(sampleSetupPose(p.data)[0], p.pages, viewport, BACKGROUND);
  const asMesh = drawn(posable);
  const asRegion = drawn(regionPosable);
  const rest = plateDifference(asMesh, asRegion);
  // The instrument's control: the same measurement between the region and the
  // same region moved two pixels. Without it, "worst channel 1" is a number with
  // nothing to be small compared to.
  const nudgedBuild = buildContourRig({ type: 'region', image: 'blob.png', x: 2 }, { invariants: null });
  const nudged = plateDifference(
    asRegion,
    drawn(posableFromText(nudgedBuild.result.skeletonText, nudgedBuild.result.atlasText, nudgedBuild.opts.outDir)),
  );
  say(
    'CT04_AN_UNDEFORMED_CONTOUR_MESH_DRAWS_WHAT_THE_REGION_DRAWS',
    rest.worst <= CONTOUR_REST_TOLERANCE && nudged.worst > 8 * CONTOUR_REST_TOLERANCE,
    `over ${viewport.width}x${viewport.height} px the two builds differ by at most ${rest.worst}/255 on any ` +
      `channel (mean ${rest.mean.toFixed(4)}, ${rest.differing} px differ at all), while the same region moved ` +
      `two pixels differs by ${nudged.worst}/255 (mean ${nudged.mean.toFixed(4)}, ${nudged.differing} px)`,
    'a mesh that stretched, clipped or mis-mapped the art at rest would still gate green on every assertion there is',
  );

  // --- issue #1: the placement convention of the no-manifest path ----------
  // ⭐ Ring and ribbon, not contour. A contour's vertices sit on the SILHOUETTE,
  // so its world box is the art's box and not the window's; the two generators
  // that do span their window are the ones this convention is measurable on, and
  // they are the two the issue names.
  const ringControl = [{ name: 'blob_ctl', parent: 'blob', x: 0, y: 0 }];
  const ring = buildContourRig(RING_ATTACHMENT, { bones: ringControl });
  const ribbon = buildContourRig(
    {
      type: 'mesh',
      image: 'blob.png',
      generator: { kind: 'ribbon', size: [CONTOUR_W, CONTOUR_H], rows: 6, chain: ['trail_a', 'trail_b'] },
    },
    {
      bones: [
        { name: 'trail_a', parent: 'blob', x: 0, y: -20 },
        { name: 'trail_b', parent: 'trail_a', x: 0, y: -20 },
      ],
    },
  );
  // The control: the same rig with its slot bone somewhere else. If the boxes did
  // not move with it, the measurement would be about the world origin instead.
  const moved: [number, number] = [-35, 45];
  const ringMoved = buildContourRig(RING_ATTACHMENT, { bones: ringControl, bone: moved });
  const boxes = [
    ['ring', slotWorldBox(posableFromText(ring.result.skeletonText, ring.result.atlasText, ring.opts.outDir), 'blob')],
    [
      'ribbon',
      slotWorldBox(posableFromText(ribbon.result.skeletonText, ribbon.result.atlasText, ribbon.opts.outDir), 'blob'),
    ],
  ] as const;
  const movedBox = slotWorldBox(
    posableFromText(ringMoved.result.skeletonText, ringMoved.result.atlasText, ringMoved.opts.outDir),
    'blob',
  );
  // A thousandth of a pixel. Not exact equality: the bind coordinates are
  // rounded to six decimals on the way into the file and spine-core walks them
  // back out through a world transform, so "centred" is a statement about
  // pixels and has to be measured in them.
  const near = (got: number, want: number): boolean => Math.abs(got - want) < 1e-3;
  const centred = boxes.every(
    ([, box]) => near(box.cx, CONTOUR_BONE[0]) && near(box.cy, CONTOUR_BONE[1]) && near(box.w, CONTOUR_W) && near(box.h, CONTOUR_H),
  );
  const followed = near(movedBox.cx, moved[0]) && near(movedBox.cy, moved[1]);
  say(
    'CT05_A_GENERATOR_WITH_NO_MANIFEST_CENTRES_THE_PART_WINDOW_ON_ITS_SLOT_BONE',
    centred && followed,
    centred
      ? `${boxes.map(([kind, box]) => `${kind} spans ${box.w.toFixed(3)}x${box.h.toFixed(3)} centred on (${box.cx.toFixed(3)}, ${box.cy.toFixed(3)})`).join(', ')}` +
          `, which is the slot bone at (${CONTOUR_BONE.join(', ')}) and the declared ${CONTOUR_W}x${CONTOUR_H} ` +
          `window — and moving that bone to (${moved.join(', ')}) moves the box with it${followed ? '' : ' — IT DID NOT'}`
      : `${boxes
          .map(([kind, box]) => `${kind} spans ${box.w.toFixed(3)}x${box.h.toFixed(3)} centred on (${box.cx.toFixed(3)}, ${box.cy.toFixed(3)})`)
          .join(', ')}; the slot bone is at (${CONTOUR_BONE.join(', ')}), and the moved ring landed at (${movedBox.cx.toFixed(3)}, ${movedBox.cy.toFixed(3)}) for (${moved.join(', ')})`,
    'the convention was a comment on compile.ts and every ring in this repository reaches the builder through a manifest instead (issue #1)',
  );

  // --- what it refuses, by name -------------------------------------------
  // Each of these is a way to get geometry that loads, validates and draws
  // WRONG art, so each has to be refused where the author can read it rather
  // than measured later by somebody comparing pictures.
  const refusals: Array<[string, string | null, string]> = [
    [
      'no image to trace',
      contourRefusal({ type: 'mesh', generator: { kind: 'contour', tolerance: CONTOUR_TOLERANCE } }),
      'needs an "image"',
    ],
    [
      'art with no transparency at all',
      contourRefusal(
        { type: 'mesh', image: 'blob.png', generator: { kind: 'contour', tolerance: CONTOUR_TOLERANCE } },
        { art: () => true },
      ),
      'silhouette IS the part window',
    ],
    [
      'more vertices than the mesh allows',
      contourRefusal({
        type: 'mesh',
        image: 'blob.png',
        generator: { kind: 'contour', tolerance: CONTOUR_TOLERANCE, maxVertices: 4 },
      }),
      'this mesh allows',
    ],
    [
      'art in two islands',
      contourRefusal(
        { type: 'mesh', image: 'blob.png', generator: { kind: 'contour', tolerance: CONTOUR_TOLERANCE } },
        { art: (x, y) => y > 8 && y < 56 && (x < 30 || x > 66) },
      ),
      'one outline can only enclose the largest',
    ],
    [
      'a silhouette pinched to one corner',
      contourRefusal(
        { type: 'mesh', image: 'blob.png', generator: { kind: 'contour', tolerance: CONTOUR_TOLERANCE } },
        {
          width: 12,
          height: 10,
          art: (x, y) => new Set(['2,2', '3,2', '4,2', '2,3', '4,3', '4,4', '3,4']).has(`${x},${y}`),
        },
      ),
      'pinches to a single point',
    ],
    [
      'a tolerance of zero',
      contourRefusal({ type: 'mesh', image: 'blob.png', generator: { kind: 'contour', tolerance: 0 } }),
      'must be a positive number of pixels',
    ],
  ];
  const missed = refusals.filter(([, got, want]) => got === null || !got.includes(want));
  say(
    'CT06_THE_SIX_WAYS_TO_ASK_FOR_A_MESH_THAT_CANNOT_EXIST_ARE_REFUSED_BY_NAME',
    missed.length === 0,
    missed.length === 0
      ? refusals.map(([label]) => label).join('; ')
      : missed
          .map(([label, got, want]) => `${label}: expected "${want}", got ${got === null ? 'a clean compile' : got}`)
          .join(' | '),
    'the parser drops an attachment it cannot read and says nothing, so a generator that cannot deliver has to say so itself',
  );

  // --- determinism ---------------------------------------------------------
  // A18 says this about a re-emit of the same compile; this says it about the
  // whole pipeline from PIXELS, which is where a contour mesh's numbers come
  // from. Ear clipping picks vertices by scanning a list, and a scan whose order
  // depended on a Map or a Set would produce a different fan every run.
  const again = compile(build.opts);
  say(
    'CT07_TRACING_THE_SAME_PIXELS_TWICE_EMITS_THE_SAME_BYTES',
    again.skeletonText === build.result.skeletonText,
    again.skeletonText === build.result.skeletonText
      ? `two compiles of the same art produced identical skeleton text (${build.result.skeletonText.length} bytes)`
      : 'the second compile of the same art differed from the first',
    'a mesh whose vertices move between runs makes every artifact hash in this repository meaningless',
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

/**
 * The rulebook the mutation suite runs under, pinned.
 *
 * Every mutant in this file was written against the full 36, and 14 of those
 * rules exist only under `spine-html`. Under `spine` those 14 do not pass and do
 * not skip — they are `profileSkipped`, a third channel — so a mutant aimed at
 * one of them would come back with nothing fired and no complaint. This suite is
 * the reason the assertions are known to be reachable at all, so it names its
 * profile out loud instead of inheriting whatever the CLI happens to default to.
 */
const MUTANT_PROFILE: ValidateProfile = 'spine-html';

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
    profile: MUTANT_PROFILE,
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
      profile: mutant.profile ?? MUTANT_PROFILE,
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
// cli ergonomics — issues #218 and #221, exercised as the installed command sees
// it: a real `bun cli.ts …` subprocess, not the functions cli.ts happens to
// export. A default is a claim about what happens when the caller says nothing,
// so the only honest way to test one is to say nothing.
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

  // --- the default profile, exercised as a stranger meets it (issue #221) ----
  //
  // ⭐ The art is chosen so that ONE rule separates the two profiles: `block.png`
  // is an opaque indexed PNG with no tRNS, which A19 — renderer policy — refuses
  // and no validity rule has an opinion about. So the same two files must build
  // green with no flag and RED under `--profile spine-html`, and the pair states
  // the default in the only place a default can be stated honestly: what happens
  // when nobody says anything.
  //
  // It runs the real subprocess rather than reading `CLI_DEFAULT_PROFILE`,
  // because the constant is not the thing users meet — the flag plumbing between
  // it and the gate is, and a test that imported the constant would go on passing
  // if `readProfile` stopped consulting it.
  {
    const dirs = writeProbeRig();
    writeTypedPng(join(dirs.dir, 'block.png'), 12, 8, { colourType: 3, trns: false });
    const motionPath = join(dirs.dir, 'probe.motion.json');
    writeFileSync(motionPath, `${JSON.stringify(STATIC_MOTION, null, 2)}\n`);
    const args = (extra: string[]): string[] => [
      'build',
      '--rig',
      dirs.rigPath,
      '--motion',
      motionPath,
      '--images',
      dirs.dir,
      '--out',
      dirs.outDir,
      ...extra,
    ];
    const assertions = (out: string): Set<string> =>
      new Set([...out.matchAll(/^ {2}(?:PASS|FAIL|SKIP|PROF) {2}(A\d\d_[A-Z0-9_]+)/gm)].map((m) => m[1]));

    const bare = runCli(args([]));
    const bareProf = [...bare.stdout.matchAll(/^ {2}PROF {2}(A\d\d_[A-Z0-9_]+)/gm)].map((m) => m[1]);
    say(
      'CLI06_NO_PROFILE_FLAG_MEANS_SPINE',
      bare.status === 0 &&
        /profile spine\b/.test(bare.stdout) &&
        !/profile spine-html/.test(bare.stdout) &&
        bareProf.includes(A19) &&
        bareProf.length === 14,
      bare.status === 0
        ? `green, profile=${/rig=\S+ profile=(\S+)/.exec(bare.stdout)?.[1] ?? '?'}, ${bareProf.length} PROF including ` +
            `${bareProf.includes(A19) ? A19 : `NOT ${A19}`}`
        : `exit=${String(bare.status)} — the default refused art only renderer policy objects to: ${bare.stderr.trim()}`,
      "the npm pitch is that the output imports into the Spine editor, and a stranger's first build was being " +
        "judged against a third-party renderer's policy instead (#221)",
    );

    const opted = runCli(args(['--profile', 'spine-html']));
    const optedAll = assertions(opted.stdout);
    const optedProf = [...opted.stdout.matchAll(/^ {2}PROF {2}A\d\d_/gm)].length;
    say(
      'CLI07_PROFILE_SPINE_HTML_STILL_RUNS_ALL_39',
      opted.status !== 0 &&
        opted.status !== null &&
        optedAll.size === 39 &&
        optedProf === 0 &&
        new RegExp(`^ {2}FAIL {2}${A19}`, 'm').test(opted.stdout),
      `exit=${String(opted.status)}, ${optedAll.size}/39 assertions reported, ${optedProf} PROF, ` +
        `A19 ${new RegExp(`^ {2}FAIL {2}${A19}`, 'm').test(opted.stdout) ? 'FAILED as it must' : 'did not fire'}`,
      'flipping a default is only safe if the old one is still reachable and still complete — the opt-in has to be ' +
        'every rule it always was, not a weakened copy',
    );
  }

  return bad;
}

// ---------------------------------------------------------------------------
// bin launcher — issue #220: npm's `bin` field is bin/rigc.cjs, a plain Node
// script, not cli.ts. It has to be invisible when Bun is on PATH (same argv,
// same stdout/stderr, same exit code as `bun cli.ts …`) and it has to explain
// itself — once, to stderr, non-zero — when Bun is not, instead of the bare
// `env: bun: No such file or directory` a Bun-less machine used to get.
// ---------------------------------------------------------------------------

const LAUNCHER = join(import.meta.dir, 'bin', 'rigc.cjs');

/** The first directory on PATH holding an executable literally named `name`, or null. */
function firstOnPath(name: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (dir !== '' && existsSync(join(dir, name))) return dir;
  }
  return null;
}

/** The current PATH with every directory that has a `bun` executable removed. */
function pathWithoutBun(): string {
  return (process.env.PATH ?? '')
    .split(delimiter)
    .filter((dir) => dir !== '' && !existsSync(join(dir, 'bun')))
    .join(delimiter);
}

/** Run the packaged launcher (bin/rigc.cjs) under a real `node`, as npm's own shim would. */
function runLauncher(args: string[], pathOverride?: string): { status: number | null; stdout: string; stderr: string } {
  const nodeDir = firstOnPath('node');
  if (nodeDir === null) throw new Error('runLauncher needs a `node` binary on PATH — call sites must check firstOnPath first');
  const result = spawnSync(join(nodeDir, 'node'), [LAUNCHER, ...args], {
    cwd: import.meta.dir,
    encoding: 'utf8',
    env: pathOverride === undefined ? process.env : { ...process.env, PATH: pathOverride },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Returns null (and prints why) when there is no `node` on PATH to run the launcher under. */
function runLauncherSuite(): number | null {
  console.log('\n── bin launcher (subprocess: node bin/rigc.cjs …) ──');
  if (firstOnPath('node') === null) {
    console.log('  INFO  no `node` binary found on PATH, so the launcher suite was skipped.');
    console.log('        bin/rigc.cjs is the thing npm installs and Node is the thing it is meant to run');
    console.log('        under — this run cannot exercise it without one.');
    return null;
  }

  let bad = 0;
  const say = (name: string, ok: boolean, detail: string, why: string): void => {
    bad += reportCase(name, ok, detail, why);
  };

  {
    const launcher = runLauncher(['--version']);
    const direct = runCli(['--version']);
    say(
      'BIN01_LAUNCHER_MATCHES_DIRECT_INVOCATION_FOR_VERSION',
      launcher.status === direct.status && launcher.stdout === direct.stdout,
      `launcher exit=${String(launcher.status)} stdout=${JSON.stringify(launcher.stdout.trim())}; ` +
        `direct exit=${String(direct.status)} stdout=${JSON.stringify(direct.stdout.trim())}`,
      'npm installs bin/rigc.cjs, never cli.ts directly — a caller asking for the version must not be able to tell',
    );
  }

  {
    const launcher = runLauncher(['init']);
    const direct = runCli(['init']);
    say(
      'BIN02_LAUNCHER_MATCHES_DIRECT_INVOCATION_FOR_UNKNOWN_COMMAND',
      launcher.status === direct.status && launcher.stdout === direct.stdout && launcher.stderr === direct.stderr,
      `launcher exit=${String(launcher.status)}; direct exit=${String(direct.status)}`,
      'the hand-off has to carry argv, stdout, stderr AND the exit code through unchanged — not just the happy path',
    );
  }

  {
    const { status, stdout, stderr } = runLauncher(['--version'], pathWithoutBun());
    say(
      'BIN03_MISSING_BUN_EXPLAINS_ITSELF_AT_THE_FAILURE_POINT',
      status !== 0 && status !== null && stdout === '' && stderr.includes('https://bun.sh'),
      `exit=${String(status)} stderr=${JSON.stringify(stderr.trim())}`,
      'installing on a Bun-less machine used to fail as a bare `env: bun: No such file or directory` with no ' +
        'hint why — issue #220',
    );
  }

  return bad;
}

// ---------------------------------------------------------------------------
// seeing the result — `rigc render` and `rigc preview` (issues #216, #226)
// ---------------------------------------------------------------------------
//
// ⭐ Why this suite exists and what it is aimed at. Every other control in this
// file asks whether the artifact is RIGHT; these ask whether anybody can LOOK at
// it. A rig whose head sits visibly off its torso passes the whole gate, loads in
// `spine-core` and steps numerically clean — the offsets are the ones the spec
// asked for — so looking is the only remedy there is, and until #216 the package
// had no command that looked.
//
// 🚨 The load-bearing case is R04, and it is a REGRESSION control rather than a
// feature one. `A19` learned in #215 that indexed and greyscale art carrying a
// `tRNS` chunk is ordinary transparent art (T01–T07 above), so such a part builds
// and validates green — while `decodePng` still refused colour types 0 and 3, and
// `src/render.ts` reads its pages through exactly that decoder. Shipping a "see
// what you built" command on top of it would have rebuilt #215's wall one step
// further along: green from `build`, refused by the picture. R04 walks the whole
// path a stranger walks, on the art the tools they own actually write.
//
// The rig deliberately mixes colour types — an indexed+tRNS `block.png` beside a
// truecolour+alpha `marker.png` — because one page of each is what proves the
// expansion happens per page rather than per file format.

/** The probe rig's art, translated 40 units across one second: 13 frames at 12 fps. */
const SLIDE_MOTION = {
  spec: 'rigc-motion/1',
  archetype: 'static_probe',
  cut: 'static_probe',
  easings: {},
  animations: {
    slide: {
      duration: 1,
      loop: false,
      tracks: [
        {
          bone: 'block',
          property: 'translatex',
          keys: [
            { t: 0, v: [0] },
            { t: 1, v: [40] },
          ],
        },
      ],
    },
  },
};

/** Every `f####.png` in a frame directory, in index order. */
function frameFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => /^f\d{4}\.png$/.test(f))
    .sort();
}

function runSeeItSuite(): number {
  console.log('\n── seeing the result: render + preview (issues #216, #226) ──');
  let bad = 0;
  const say = (name: string, ok: boolean, detail: string, why: string): void => {
    bad += reportCase(name, ok, detail, why);
  };

  // --- the artifact, built through the CLI on deliberately mixed colour types ---
  const dirs = writeProbeRig();
  writeTypedPng(join(dirs.dir, 'block.png'), 12, 8, { colourType: 3, trns: true });
  const motionPath = join(dirs.dir, 'probe.motion.json');
  writeFileSync(motionPath, `${JSON.stringify(SLIDE_MOTION, null, 2)}\n`);
  const build = runCli([
    'build',
    '--rig', dirs.rigPath,
    '--motion', motionPath,
    '--images', dirs.dir,
    '--out', dirs.outDir,
  ]);
  say(
    'R04_INDEXED_ART_BUILDS_AND_THEN_RENDERS',
    build.status === 0,
    `build exit=${String(build.status)} on a rig whose block.png is colour type 3 + tRNS`,
    'issue #226: the gate accepts this art since #215, and the renderer read it through a decoder that did not',
  );

  const framesDir = join(dirs.dir, 'frames');
  const render = runCli(['render', '--candidate', dirs.outDir, '--animation', 'slide', '--out', framesDir]);
  const set = join(framesDir, 'slide');
  const files = render.status === 0 && existsSync(set) ? frameFiles(set) : [];
  say(
    'R01_RENDER_WRITES_THE_SAMPLED_FRAME_SERIES',
    render.status === 0 && files.length === 13,
    render.status === 0
      ? `${files.length} frame(s) in ${set} (1.000s at ${PROTOCOL_FPS} fps samples to 13)`
      : `render exit=${String(render.status)}: ${render.stderr.split('\n')[0]}`,
    'the frame series is the cheapest possible answer to "did I get what I authored", and #226 sat on its path',
  );

  // The sidecar is what makes the directory a frame SET, so the pictures are
  // measured against IT rather than against a number this file repeats.
  let sidecar: FramesSidecar | null = null;
  if (existsSync(join(framesDir, FRAMES_SIDECAR))) {
    sidecar = JSON.parse(readFileSync(join(framesDir, FRAMES_SIDECAR), 'utf8')) as FramesSidecar;
  }
  const plates = files.map((f) => readPlate(join(set, f)));
  const expected = sidecar ? [sidecar.viewport.pixelWidth, sidecar.viewport.pixelHeight] : [0, 0];
  const sized = plates.length > 0 && plates.every((p) => p.width === expected[0] && p.height === expected[1]);
  say(
    'R02_EVERY_FRAME_IS_THE_SIZE_THE_SIDECAR_DECLARES',
    sidecar !== null && sized && sidecar.sets.length === 1 && sidecar.sets[0].sampled === files.length,
    sidecar === null
      ? `no ${FRAMES_SIDECAR} beside the frames`
      : `${files.length} frame(s) at ${expected[0]}x${expected[1]}, sidecar declares ${sidecar.sets[0].sampled} sampled`,
    'a frame set whose pictures are not the size its own box says is unreadable by `check` and by a human with a ruler',
  );

  // Motion, not merely files: 13 identical pictures is what a renderer that never
  // advanced the pose would also write, and it would pass every count above.
  let moved = 0;
  if (plates.length > 1) {
    for (let i = 0; i < plates[0].data.length; i++) moved += Math.abs(plates[0].data[i] - plates[plates.length - 1].data[i]);
  }
  say(
    'R03_THE_FRAMES_ACTUALLY_MOVE',
    moved > 0 && existsSync(join(set, SHEET_FILE)),
    `|f0000 − f${String(files.length - 1).padStart(4, '0')}| = ${moved} across the plate, and ${SHEET_FILE} is beside them`,
    'a series of identical stills passes every count a frame set has; only comparing two of them can tell',
  );

  // The decoder itself, at the level the fix lives: one control per colour type
  // `tools/plate.ts` could not write and therefore never met until #226.
  const probe = mkdtempSync(join(tmpdir(), 'rigc-decode-'));
  writeTypedPng(join(probe, 'indexed.png'), 8, 4, { colourType: 3, trns: true });
  writeTypedPng(join(probe, 'grey.png'), 8, 4, { colourType: 0, trns: true });
  // 8x8 rather than 8x4: `writeGreyAlphaPng` makes a two-pixel transparent border,
  // and at height 4 there is no interior left for the opaque half of the control.
  writeGreyAlphaPng(join(probe, 'greyalpha.png'), 8, 8);
  const indexed = readPlate(join(probe, 'indexed.png'));
  const grey = readPlate(join(probe, 'grey.png'));
  const greyAlpha = readPlate(join(probe, 'greyalpha.png'));
  // The fixtures put palette entry 0 (and greyscale 30) on the "off" squares and
  // declare exactly those invisible, so the checkerboard's two halves are the two
  // alpha answers — a decoder that ignored tRNS would return 255 everywhere.
  const expansions =
    indexed.get(0, 0)[3] === 255 &&
    indexed.get(4, 0)[3] === 0 &&
    indexed.get(0, 0).slice(0, 3).join() === '220,210,200' &&
    grey.get(0, 0)[3] === 255 &&
    grey.get(4, 0)[3] === 0 &&
    grey.get(0, 0).slice(0, 3).join() === '220,220,220' &&
    greyAlpha.get(0, 0)[3] === 0 &&
    greyAlpha.get(4, 4)[3] === 255;
  say(
    'R05_DECODE_EXPANDS_PALETTES_AND_GREYSCALE_TO_RGBA',
    expansions,
    `indexed ${JSON.stringify(indexed.get(0, 0))}/${JSON.stringify(indexed.get(4, 0))}, ` +
      `greyscale ${JSON.stringify(grey.get(0, 0))}/${JSON.stringify(grey.get(4, 0))}, ` +
      `greyscale+alpha ${JSON.stringify(greyAlpha.get(0, 0))}/${JSON.stringify(greyAlpha.get(4, 4))}`,
    'every one of these threw `unsupported colour type` before #226, and the gate had been accepting them since #215',
  );

  // A colour type that is not one still has to be refused: the fix must not have
  // replaced a false refusal with a decoder that reads anything it is handed.
  let refused = '';
  try {
    const ihdr = new Uint8Array(13);
    new DataView(ihdr.buffer).setUint32(0, 1);
    new DataView(ihdr.buffer).setUint32(4, 1);
    ihdr[8] = 8;
    ihdr[9] = 5; // not a PNG colour type at all
    const bytes = [PNG_SIGNATURE, pngChunk('IHDR', ihdr), pngChunk('IEND', new Uint8Array(0))];
    const flat = new Uint8Array(bytes.reduce((n, b) => n + b.length, 0));
    let at = 0;
    for (const b of bytes) {
      flat.set(b, at);
      at += b.length;
    }
    decodePng(flat);
  } catch (err) {
    refused = (err as Error).message;
  }
  say(
    'R06_A_COLOUR_TYPE_THAT_IS_NOT_ONE_IS_STILL_REFUSED',
    /unsupported colour type 5/.test(refused),
    refused || 'colour type 5 decoded without complaint',
    'widening a decoder is only a fix while the things it must not read still fail loudly',
  );

  // --- preview: one file, everything in it, and the player referenced not copied
  const html = join(dirs.dir, 'preview.html');
  const preview = runCli(['preview', '--candidate', dirs.outDir, '--out', html]);
  const page = preview.status === 0 && existsSync(html) ? readFileSync(html, 'utf8') : '';
  // Read through `existsSync` rather than straight: a build that failed above must
  // leave this suite reporting FAIL lines, not dying on an ENOENT — a crash here
  // would take every case after it with it and print no verdict at all.
  const readIfThere = (path: string): string => (existsSync(path) ? readFileSync(path, 'utf8') : '');
  const atlasText = readIfThere(join(dirs.outDir, 'skeleton.atlas'));
  const skeletonText = readIfThere(join(dirs.outDir, 'skeleton.json'));
  const pageNames = atlasText === '' ? [] : atlasPageNames(atlasText);
  const pageCount = pageNames.length;
  const imageUris = page.split('data:image/png;base64,').length - 1;
  const carries = (mime: string, body: string): boolean =>
    page.includes(`data:${mime};base64,${Buffer.from(body, 'utf8').toString('base64')}`);
  say(
    'P01_PREVIEW_EMBEDS_THE_WHOLE_ARTIFACT',
    preview.status === 0 &&
      skeletonText !== '' &&
      carries('application/json', skeletonText) &&
      carries('text/plain', atlasText) &&
      imageUris === pageCount &&
      pageCount === 2,
    preview.status === 0
      ? `skeleton and atlas embedded byte for byte, ${imageUris} image data URI(s) for ${pageCount} atlas page(s)`
      : `preview exit=${String(preview.status)}: ${preview.stderr.split('\n')[0]}`,
    'a preview missing one page is a file that opens and draws the wrong picture — the failure this command exists to catch',
  );

  // The keys are what the player asks for, so they are as load-bearing as the
  // bytes: a page embedded under a name nothing requests is not embedded.
  const keyed = pageCount > 0 && pageNames.every((name) => page.includes(JSON.stringify(name).slice(1, -1)));
  say(
    'P02_THE_EMBEDDED_KEYS_ARE_THE_NAMES_THE_PLAYER_ASKS_FOR',
    keyed && page.includes(SKELETON_KEY) && page.includes(ATLAS_KEY),
    `rawDataURIs keyed by ${JSON.stringify([SKELETON_KEY, ATLAS_KEY, ...pageNames])}`,
    "`config.atlas` has no directory part, so the player asks for each page under the name the ATLAS spells — not its basename",
  );

  // ⚖️ The licence line, as a machine check rather than as a note somebody has to
  // remember: the player is referenced by URL and nothing Esoteric owns is copied
  // into the page. A vendored player would be hundreds of kilobytes of it.
  const referenced = /<script src="https:\/\/unpkg\.com\/@esotericsoftware\/spine-player@[^"]+"><\/script>/.test(page);
  say(
    'P03_THE_PLAYER_IS_REFERENCED_AND_NEVER_VENDORED',
    referenced && !page.includes('SpinePlayer = class') && page.includes('spine-runtimes-license'),
    `player loaded by <script src>, page is ${(page.length / 1024).toFixed(1)} KiB, and it names the Spine Runtimes licence`,
    'NOTICE.md: the Spine Runtimes are Esoteric Software\'s and rigc redistributes none of them',
  );

  // --- both commands are discoverable, which is half of shipping them ----------
  const renderHelp = runCli(['render', '--help']);
  const previewHelp = runCli(['preview', '--help']);
  const topLevel = runCli([]);
  say(
    'P04_BOTH_COMMANDS_ARE_IN_THE_HELP',
    renderHelp.status === 0 &&
      renderHelp.stdout.includes('--animation') &&
      renderHelp.stdout.includes('frame series') &&
      previewHelp.status === 0 &&
      previewHelp.stdout.includes('.html') &&
      topLevel.stderr.includes('rigc render') &&
      topLevel.stderr.includes('rigc preview'),
    `render --help ${renderHelp.status === 0 ? 'ok' : 'FAILED'}, preview --help ${previewHelp.status === 0 ? 'ok' : 'FAILED'}, ` +
      'both named in the bare-invocation usage',
    'issue #216 is a discoverability failure as much as a capability one — the renderer already existed and no command exposed it',
  );

  // An animation this skeleton does not have must be refused BY NAME, with the
  // ones it does have listed: the flag is the one place a typo is silent.
  const wrong = runCli(['render', '--candidate', dirs.outDir, '--animation', 'nope', '--out', framesDir]);
  say(
    'P05_AN_UNKNOWN_ANIMATION_IS_REFUSED_AND_THE_REAL_ONES_LISTED',
    wrong.status === 2 && /no animation "nope"/.test(wrong.stderr) && /slide/.test(wrong.stderr),
    `exit=${String(wrong.status)} stderr=${JSON.stringify(wrong.stderr.split('\n')[0])}`,
    'silently rendering every animation because one name was misspelled is a report about the wrong shot',
  );

  return bad;
}

// ---------------------------------------------------------------------------
// reading a pose frame — pose (issue #241)
// ---------------------------------------------------------------------------
//
// ⭐ Why this suite can exist at all, and what shape that gives it. Every number
// `rigc pose` prints is an estimate of something nobody wrote down: it is handed
// a picture and loose parts and it has to work out where each part sits. So the
// only honest way to check it is to build the picture from placements we DO know
// — a rig with chosen bone angles, rendered by `src/render.ts` — and then ask the
// estimator, which never sees the rig, whether it can read them back.
//
// 🔒 The ground truth is derived from the posed quads and the viewport, not from
// the numbers in the rig spec: three corners of a region and its own UVs give the
// affine map from part pixels to frame pixels, and the placement is that map's
// centre, rotation and scale. That keeps the yardstick on the side of the drawing
// rather than the side of the arithmetic — a compiler bug that moved the art would
// move the truth with it, and the estimator would still have to agree.
//
// ⚠️ The tolerances are the METHOD FLOOR of a raster compare, and they are stated
// here with what was measured rather than left as round numbers. The frame is a
// bilinear resampling of the part with its edge pixels dropped below half
// coverage, so the pixels the estimator matches are not the part's pixels; and the
// objective charges for every part pixel that lands off the figure while charging
// nothing for figure left uncovered, which puts the optimum a fraction inside the
// true silhouette. Measured on this fixture: translation within 0.12 px, rotation
// within 0.4°, scale 2–4% LOW on every one of five parts — a consistent sign,
// which is what a systematic half-pixel of silhouette looks like over a part 26 px
// across. The bars below sit a few times clear of each.
const POSE_TOLERANCE = { translate: 1, rotateDeg: 2, scaleRatio: 0.08 };

/** A checkerboard, for parts whose interior has to be identifiable. */
function poseChecker(w: number, h: number, a: RGBA, b: RGBA, band: number): Plate {
  const p = new Plate(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) p.set(x, y, (Math.floor(x / band) + Math.floor(y / band)) % 2 === 0 ? a : b);
  }
  return p;
}

/**
 * A smoothly shaded ball of concentric rings.
 *
 * Rotation-symmetric on purpose — that is the degree of freedom `pose` has to
 * report as free — while the ring spacing still pins its SCALE, so the control is
 * about rotation alone and not about a uniform disc nothing can size.
 */
function poseBall(size: number): Plate {
  const p = new Plate(size, size);
  const r = size / 2 - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
      if (d > r + 0.5) continue;
      const wave = (Math.cos((d / r) * Math.PI * 3) + 1) / 2;
      p.set(x, y, [
        Math.round(60 + wave * 150),
        Math.round(160 + wave * 60),
        Math.round(90 + wave * 40),
        Math.round(255 * Math.max(0, Math.min(1, r + 0.5 - d))),
      ]);
    }
  }
  return p;
}

/** One placement in frame pixels, the shape both the truth and the estimate take. */
interface PosePlacementTruth {
  x: number;
  y: number;
  rotationDeg: number;
  scale: number;
}

/**
 * The affine map one posed region applies to its own page, read off three corners.
 *
 * `world` carries the corners in spine-core's order and `uvs` carries the same
 * corners' page coordinates, so multiplying one basis by the other's inverse gives
 * the map without this file needing to know how the atlas packed the region — a
 * rotated or trimmed region would change both sides together.
 */
function poseTruthOf(piece: Piece, page: Plate, project: (wx: number, wy: number) => [number, number]): PosePlacementTruth {
  const part = (i: number): [number, number] => [piece.uvs[i * 2] * page.width, piece.uvs[i * 2 + 1] * page.height];
  const frame = (i: number): [number, number] => project(piece.world[i * 2], piece.world[i * 2 + 1]);
  const [p0, p1, p2] = [part(1), part(0), part(2)];
  const [f0, f1, f2] = [frame(1), frame(0), frame(2)];
  const e1p = [p1[0] - p0[0], p1[1] - p0[1]];
  const e2p = [p2[0] - p0[0], p2[1] - p0[1]];
  const e1f = [f1[0] - f0[0], f1[1] - f0[1]];
  const e2f = [f2[0] - f0[0], f2[1] - f0[1]];
  const det = e1p[0] * e2p[1] - e1p[1] * e2p[0];
  const a = (e1f[0] * e2p[1] - e2f[0] * e1p[1]) / det;
  const b = (e2f[0] * e1p[0] - e1f[0] * e2p[0]) / det;
  const c = (e1f[1] * e2p[1] - e2f[1] * e1p[1]) / det;
  const d = (e2f[1] * e1p[0] - e1f[1] * e2p[0]) / det;
  const tx = f0[0] - (a * p0[0] + b * p0[1]);
  const ty = f0[1] - (c * p0[0] + d * p0[1]);
  return {
    x: a * (page.width / 2) + b * (page.height / 2) + tx,
    y: c * (page.width / 2) + d * (page.height / 2) + ty,
    rotationDeg: (Math.atan2(c, a) * 180) / Math.PI,
    scale: Math.sqrt(Math.abs(a * d - b * c)),
  };
}

/** How far one estimate is from one truth, in the three units the tolerances are stated in. */
function poseDelta(got: PosePlacement, want: PosePlacementTruth): { translate: number; rotateDeg: number; scaleRatio: number } {
  let turn = (((got.rotationDeg - want.rotationDeg) % 360) + 360) % 360;
  if (turn > 180) turn -= 360;
  return {
    translate: Math.hypot(got.x - want.x, got.y - want.y),
    rotateDeg: Math.abs(turn),
    scaleRatio: Math.abs(got.scale / want.scale - 1),
  };
}

function poseWithin(d: { translate: number; rotateDeg: number; scaleRatio: number }): boolean {
  return (
    d.translate <= POSE_TOLERANCE.translate &&
    d.rotateDeg <= POSE_TOLERANCE.rotateDeg &&
    d.scaleRatio <= POSE_TOLERANCE.scaleRatio
  );
}

function poseSay(d: { translate: number; rotateDeg: number; scaleRatio: number }): string {
  return `Δpos ${d.translate.toFixed(2)}px Δrot ${d.rotateDeg.toFixed(2)}° Δscale ${(d.scaleRatio * 100).toFixed(1)}%`;
}

/**
 * The fixture: five plates, a rig that poses them at chosen angles, and one
 * rendered frame with the placements it implies.
 *
 * ⚠️ The viewport is built by hand rather than by `framingViewport`, and the scale
 * 1.15 is the reason. A fitted viewport lands wherever the figure's bounds put it,
 * which for this rig is a scale outside `pose`'s own default window — the control
 * would then be measuring the window rather than the estimator. 1.15 also sits
 * deliberately BETWEEN two rungs of the coarse scale ladder (1.0 and 1.26), so a
 * pass means the refinement actually moved rather than landing on a rung.
 *
 * The two arms carry the SAME plate at mirrored angles. That is the ambiguity
 * control: one PNG, two places in the picture that explain it equally well, and
 * the instrument must report both rather than pick.
 */
function buildPoseFixture(): {
  dir: string;
  parts: string;
  framePath: string;
  clearPath: string;
  truth: Map<string, PosePlacementTruth>;
} {
  const dir = mkdtempSync(join(tmpdir(), 'rigc-pose-'));
  const parts = join(dir, 'parts');
  mkdirSync(parts, { recursive: true });

  const torso = poseChecker(24, 36, [60, 90, 160, 255], [110, 140, 200, 255], 6);
  torso.rect(0, 0, 24, 4, [220, 60, 60, 255]);
  torso.writePng(join(parts, 'torso.png'));

  const arm = poseChecker(10, 26, [200, 160, 60, 255], [150, 110, 30, 255], 5);
  arm.rect(0, 0, 10, 3, [40, 40, 40, 255]);
  arm.writePng(join(parts, 'arm.png'));

  const head = poseChecker(22, 22, [230, 200, 170, 255], [200, 160, 130, 255], 11);
  head.rect(2, 4, 5, 4, [30, 30, 30, 255]);
  head.rect(15, 4, 5, 4, [30, 30, 30, 255]);
  head.writePng(join(parts, 'head.png'));

  poseBall(32).writePng(join(parts, 'ball.png'));

  // The three decoys. None of them is in the rig, so none of them is in the
  // picture, and each has to come back refused for its own reason.
  poseChecker(20, 20, [255, 0, 255, 255], [0, 255, 255, 255], 4).writePng(join(parts, 'foreign.png'));
  poseChecker(700, 700, [10, 10, 10, 255], [250, 250, 250, 255], 40).writePng(join(parts, 'toobig.png'));
  new Plate(16, 16).writePng(join(parts, 'blank.png'));

  const rigPath = join(dir, 'pose.rig.json');
  writeFileSync(
    rigPath,
    `${JSON.stringify(
      {
        spec: 'rigc-rig/1',
        name: 'pose_probe',
        skeleton: { width: 200, height: 200 },
        bones: [
          { name: 'root' },
          { name: 'torso', parent: 'root', x: 0, y: 0 },
          { name: 'head', parent: 'torso', x: 0, y: 34 },
          // Inboard enough that each arm covers part of the torso: the torso is
          // then the occlusion control, measured rather than asserted.
          { name: 'arm_l', parent: 'torso', x: -15, y: 8, rotation: 35 },
          { name: 'arm_r', parent: 'torso', x: 15, y: 8, rotation: -35 },
          { name: 'ball', parent: 'torso', x: 0, y: -34 },
        ],
        slots: [
          { name: 'torso', bone: 'torso', attachment: 'torso' },
          { name: 'head', bone: 'head', attachment: 'head' },
          { name: 'arm_l', bone: 'arm_l', attachment: 'arm_l' },
          { name: 'arm_r', bone: 'arm_r', attachment: 'arm_r' },
          { name: 'ball', bone: 'ball', attachment: 'ball' },
        ],
        skins: {
          default: {
            torso: { torso: { image: 'torso.png' } },
            head: { head: { image: 'head.png' } },
            arm_l: { arm_l: { image: 'arm.png' } },
            arm_r: { arm_r: { image: 'arm.png' } },
            ball: { ball: { image: 'ball.png' } },
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  const motionPath = join(dir, 'pose.motion.json');
  writeFileSync(
    motionPath,
    `${JSON.stringify({ spec: 'rigc-motion/1', archetype: 'pose_probe', cut: 'pose_probe', easings: {}, animations: {} }, null, 2)}\n`,
  );
  const outDir = join(dir, 'spine');
  const built = compile({ rigPath, motionPath, outDir, imagesDir: parts });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'skeleton.json'), built.skeletonText);
  writeFileSync(join(outDir, 'skeleton.atlas'), built.atlasText);

  const posable = loadPosable(join(outDir, 'skeleton.json'), join(outDir, 'skeleton.atlas'), outDir);
  const frames = sampleSetupPose(posable.data);
  const bounds = unionBounds([frames]);
  const scale = 1.15;
  const pad = 12;
  const worldW = bounds.maxX - bounds.minX + pad * 2;
  const worldH = bounds.maxY - bounds.minY + pad * 2;
  const viewport = viewportOfSize(
    bounds.minX - pad,
    bounds.minY - pad,
    worldW,
    worldH,
    scale,
    Math.round(worldW * scale),
    Math.round(worldH * scale),
  );
  const plate = renderFrame(frames[0], posable.pages, viewport, BACKGROUND);
  const framePath = join(dir, 'poseA.png');
  plate.writePng(framePath);

  // The same picture with the flat ground knocked out to transparency, so the
  // other branch of background detection has something real to read.
  const clear = new Plate(plate.width, plate.height);
  for (let y = 0; y < plate.height; y++) {
    for (let x = 0; x < plate.width; x++) {
      const c = plate.get(x, y);
      clear.set(x, y, c[0] === BACKGROUND[0] && c[1] === BACKGROUND[1] && c[2] === BACKGROUND[2] ? [0, 0, 0, 0] : c);
    }
  }
  const clearPath = join(dir, 'poseA_clear.png');
  clear.writePng(clearPath);

  const project = projector(viewport);
  const truth = new Map<string, PosePlacementTruth>();
  for (const piece of frames[0].pieces) {
    const page = posable.pages.get(piece.page);
    if (piece.kind !== 'region' || !page) continue;
    truth.set(piece.slot, poseTruthOf(piece, page, project));
  }
  return { dir, parts, framePath, clearPath, truth };
}

function runPoseSuite(): number {
  console.log('\n── reading a pose frame: pose (issue #241) ──');
  let bad = 0;
  const say = (name: string, ok: boolean, detail: string, why: string): void => {
    bad += reportCase(name, ok, detail, why);
  };

  const fixture = buildPoseFixture();
  const report = estimatePose({ imagesDir: fixture.parts, framePath: fixture.framePath });
  const byName = new Map(report.parts.map((p) => [p.part, p]));
  const want = (slot: string): PosePlacementTruth => {
    const t = fixture.truth.get(slot);
    if (!t) throw new Error(`internal: the fixture posed no slot "${slot}"`);
    return t;
  };

  // --- the placements themselves -------------------------------------------
  {
    const singles: [string, string][] = [
      ['torso.png', 'torso'],
      ['head.png', 'head'],
      ['ball.png', 'ball'],
    ];
    const rows = singles.map(([file, slot]) => {
      const got = byName.get(file)?.placement;
      return { file, ok: got !== undefined && got !== null, delta: got ? poseDelta(got, want(slot)) : null };
    });
    const ok = rows.every((r) => r.ok && r.delta !== null && poseWithin(r.delta));
    say(
      'PS01_KNOWN_PLACEMENTS_ARE_READ_BACK_OUT_OF_THE_PICTURE',
      ok,
      rows.map((r) => `${r.file}: ${r.delta ? poseSay(r.delta) : 'no placement'}`).join('  ·  '),
      'the whole command is this claim; a `pose` that cannot recover a placement it was shown is a plausible-number generator',
    );
  }

  // --- two identical limbs --------------------------------------------------
  {
    const arm = byName.get('arm.png');
    const found = arm?.placement ? [arm.placement, ...arm.alternates] : [];
    const nearest = (slot: string): { translate: number; rotateDeg: number; scaleRatio: number } | null => {
      const t = want(slot);
      let best: { translate: number; rotateDeg: number; scaleRatio: number } | null = null;
      for (const p of found) {
        const d = poseDelta(p, t);
        if (best === null || d.translate < best.translate) best = d;
      }
      return best;
    };
    const left = nearest('arm_l');
    const right = nearest('arm_r');
    const ok =
      arm !== undefined &&
      arm.ambiguous &&
      arm.alternates.length >= 1 &&
      left !== null &&
      right !== null &&
      poseWithin(left) &&
      poseWithin(right);
    say(
      'PS02_TWO_IDENTICAL_LIMBS_COME_BACK_AS_TWO_PLACEMENTS',
      ok,
      arm === undefined
        ? 'arm.png is not in the report'
        : `ambiguous=${arm.ambiguous}, ${1 + arm.alternates.length} placement(s); ` +
          `arm_l ${left ? poseSay(left) : 'unmatched'}; arm_r ${right ? poseSay(right) : 'unmatched'}`,
      'picking one of two equally good optima silently is the failure this instrument was specified to refuse',
    );
  }

  // --- rotation as a degree of freedom -------------------------------------
  {
    const ball = byName.get('ball.png');
    const others = report.parts.filter((p) => p.part !== 'ball.png' && p.part !== 'blank.png');
    const ok =
      ball !== undefined &&
      ball.rotationFree &&
      ball.rotationSelfSimilarity <= ROTATION_FREE_TOLERANCE &&
      others.every((p) => !p.rotationFree);
    say(
      'PS03_A_ROUND_PART_REPORTS_ROTATION_AS_FREE_AND_NOTHING_ELSE_DOES',
      ok,
      `ball self-residual ${ball?.rotationSelfSimilarity ?? 'n/a'} (tolerance ${ROTATION_FREE_TOLERANCE}); ` +
        `others: ${others.map((p) => `${p.part} ${p.rotationSelfSimilarity}`).join(', ')}`,
      'a ball has no rotation to get right; reporting one is a made-up number and refusing the part is worse',
    );
  }

  // --- the three refusals ---------------------------------------------------
  {
    const foreign = byName.get('foreign.png');
    const ok =
      foreign !== undefined &&
      foreign.refusal?.reason === 'no-match' &&
      foreign.refusal.detail.includes('foreign.png') &&
      // Still reported: a refusal here names why not to trust a number, it does
      // not hide it, and an agent that disagrees has to be able to read past it.
      foreign.placement !== null &&
      foreign.placement.residual > DEFAULT_MAX_RESIDUAL;
    say(
      'PS04_A_PART_THAT_IS_IN_NO_PICTURE_IS_REFUSED_BY_NAME',
      ok,
      foreign === undefined
        ? 'foreign.png is not in the report'
        : `${foreign.refusal?.reason ?? 'accepted'}: best residual ${foreign.placement?.residual ?? 'n/a'} against ${DEFAULT_MAX_RESIDUAL}`,
      'the alternative is a confident placement for a part that is not there, which is the one output an agent cannot detect',
    );
  }

  {
    const big = byName.get('toobig.png');
    const ok =
      big !== undefined &&
      big.refusal?.reason === 'larger-than-canvas' &&
      big.placement === null &&
      big.refusal.detail.includes('700x700');
    say(
      'PS05_A_PART_THE_CANVAS_CANNOT_HOLD_IS_REFUSED_BY_NAME',
      ok,
      big === undefined ? 'toobig.png is not in the report' : `${big.refusal?.reason ?? 'accepted'}: ${big.refusal?.detail ?? ''}`,
      'nothing was searched, so a placement here would be arithmetic about a case that does not exist',
    );
  }

  {
    const blank = byName.get('blank.png');
    const ok = blank !== undefined && blank.refusal?.reason === 'empty-part' && blank.placement === null;
    say(
      'PS06_A_PART_WITH_NO_MATERIAL_IS_REFUSED_BY_NAME',
      ok,
      blank === undefined ? 'blank.png is not in the report' : `${blank.refusal?.reason ?? 'accepted'}: ${blank.refusal?.detail ?? ''}`,
      'an all-transparent PNG divides by a zero footprint; the honest answer names the file',
    );
  }

  // --- occlusion ------------------------------------------------------------
  {
    const torso = byName.get('torso.png');
    const arm = byName.get('arm.png');
    const ok =
      torso?.placement != null &&
      arm?.placement != null &&
      poseWithin(poseDelta(torso.placement, want('torso'))) &&
      // The arms cover part of it, so its residual and its unexplained share are
      // both well above an unoccluded part's while the PLACEMENT is unmoved.
      torso.placement.unexplained > arm.placement.unexplained * 3 &&
      torso.placement.residual > arm.placement.residual * 2;
    say(
      'PS07_OCCLUSION_RAISES_THE_RESIDUAL_WITHOUT_MOVING_THE_PLACEMENT',
      ok,
      torso?.placement == null || arm?.placement == null
        ? 'torso.png or arm.png has no placement'
        : `torso residual ${torso.placement.residual} unexplained ${torso.placement.unexplained} at ` +
          `${poseSay(poseDelta(torso.placement, want('torso')))}; unoccluded arm ${arm.placement.residual}/${arm.placement.unexplained}`,
      'the documented caveat is exactly this pair of facts; if the residual did not move, the caveat is fiction, and if the placement did, the number is not a trust signal',
    );
  }

  // --- background detection -------------------------------------------------
  {
    const clear = estimatePose({ imagesDir: fixture.parts, framePath: fixture.clearPath });
    const clearByName = new Map(clear.parts.map((p) => [p.part, p]));
    const same = (['torso.png', 'head.png', 'ball.png'] as const).every((file) => {
      const a = byName.get(file)?.placement;
      const b = clearByName.get(file)?.placement;
      return a != null && b != null && Math.hypot(a.x - b.x, a.y - b.y) <= 0.5 && Math.abs(a.scale / b.scale - 1) <= 0.02;
    });
    const ok = clear.frame.background.kind === 'transparent' && report.frame.background.kind === 'colour' && same;
    say(
      'PS08_A_TRANSPARENT_GROUND_AND_A_FLAT_ONE_READ_THE_SAME',
      ok,
      `flat ground: ${report.frame.background.kind} ${JSON.stringify(report.frame.background.colour)}; ` +
        `knocked out: ${clear.frame.background.kind}; placements agree: ${same}`,
      'the objective needs to know where the picture has nothing in it; a ground it misreads turns the silhouette signal off silently',
    );
  }

  // --- the window the report says it searched -------------------------------
  //
  // ⚠️ Two halves, and the first one is deliberately NOT "a wrong window is
  // refused". It is not: a checkerboard shrunk to a third of its size still sits
  // inside the blob it came from and explains those pixels well enough to clear
  // the refusal threshold. That is the honest limit of a footprint-only objective
  // and the reason the window is a reported field rather than an implementation
  // detail — an agent that narrowed it wrongly can see that it did.
  {
    const wrong = estimatePose({ imagesDir: fixture.parts, framePath: fixture.framePath, scale: { min: 0.2, max: 0.4 } });
    const inside = wrong.parts.every(
      (p) => p.placement === null || (p.placement.scale >= 0.2 - 1e-9 && p.placement.scale <= 0.4 + 1e-9),
    );
    const stated = wrong.search.scale.min === 0.2 && wrong.search.scale.max === 0.4;
    const right = estimatePose({ imagesDir: fixture.parts, framePath: fixture.framePath, scale: { min: 1.1, max: 1.25 } });
    const rows = (['torso.png', 'head.png', 'ball.png'] as const).map((file) => {
      const got = right.parts.find((p) => p.part === file)?.placement ?? null;
      const slot = file.replace('.png', '');
      return { file, delta: got ? poseDelta(got, want(slot)) : null };
    });
    const recovered = rows.every((r) => r.delta !== null && poseWithin(r.delta));
    say(
      'PS09_THE_SEARCH_WINDOW_IS_A_PROMISE_THE_REPORT_KEEPS',
      inside && stated && recovered,
      `--scale 0.2,0.4: every reported scale inside it = ${inside}, report states it = ${stated}; ` +
        `--scale 1.1,1.25: ${rows.map((r) => `${r.file} ${r.delta ? poseSay(r.delta) : 'no placement'}`).join('  ·  ')}`,
      'a polish free to walk outside the ladder would report a scale nobody searched, and a narrowed window that stopped working would make the flag useless',
    );
  }

  // --- the command ----------------------------------------------------------
  {
    const out = join(fixture.dir, 'pose.json');
    const run = runCli(['pose', '--images', fixture.parts, '--frame', fixture.framePath, '--out', out]);
    let written: { spec?: string; parts?: unknown[] } | null = null;
    if (existsSync(out)) written = JSON.parse(readFileSync(out, 'utf8')) as { spec?: string; parts?: unknown[] };
    const help = runCli(['pose', '--help']);
    const missing = runCli(['pose', '--images', join(fixture.dir, 'nope'), '--frame', fixture.framePath]);
    const ok =
      run.status === 0 &&
      written?.spec === POSE_SPEC &&
      (written.parts?.length ?? 0) === 7 &&
      run.stdout.includes('AMBIG') &&
      run.stdout.includes('REFUSE') &&
      help.status === 0 &&
      help.stdout.includes('--frame') &&
      help.stdout.includes('--max-residual') &&
      missing.status === 2 &&
      missing.stderr.includes('no parts directory at');
    say(
      'PS10_THE_COMMAND_WRITES_ITS_REPORT_AND_REFUSES_A_BAD_PATH',
      ok,
      `pose exit=${String(run.status)} spec=${written?.spec ?? 'none'} parts=${written?.parts?.length ?? 0}; ` +
        `--help exit=${String(help.status)}; missing dir exit=${String(missing.status)} ` +
        `${JSON.stringify(missing.stderr.split('\n')[0])}`,
      'the JSON is the whole product — an agent reads it and never sees the table — and a mistyped directory must not read as an empty pose',
    );
  }

  return bad;
}

/**
 * The A/B ballot and its ledger (issue #151).
 *
 * ⚠️ What this suite can and cannot see, stated up front. It reads the
 * generated page as **text** and the ledger as **JSON**, so it covers the
 * artifact's shape, its hashes and every refusal `--record` can make. It does
 * not open a browser, so "the two panes actually play" is not in here — that
 * needs a runtime with WebGL and this file has to run on a fresh clone with no
 * network. The check that closes that gap is in the pull request's notes, not
 * in the suite, and this comment exists so nobody reads a green here as one.
 *
 * The mutants are the tampered results: a forged digest, a choice that is not
 * on the ballot, a reason code that contradicts the choice and a second vote on
 * a ballot the ledger already has. Each has to be refused **by its own rule
 * name**, because the caller is an agent and "invalid vote" is not actionable.
 */
function runBallotSuite(): number {
  console.log('\n── the A/B ballot and its ledger (issue #151) ──');
  let bad = 0;
  const say = (name: string, ok: boolean, detail: string, why: string): void => {
    bad += reportCase(name, ok, detail, why);
  };

  // --- two candidates that differ, built through the CLI ----------------------
  //
  // They must differ in BOTH halves of a digest — the skeleton and the page
  // bytes — or a mutant that forges one of them would still hash to the other's
  // value and the refusal would pass for the wrong reason.
  const built: { dir: string; outDir: string }[] = [];
  for (const [length, colour] of [
    [12, [40, 60, 200, 255]],
    [22, [200, 60, 40, 255]],
  ] as [number, RGBA][]) {
    const dirs = writeProbeRig({
      bones: [{ name: 'root' }, { name: 'block', parent: 'root', x: 0, y: 0, length }],
    });
    writeProbePng(join(dirs.dir, 'block.png'), 12, 8, colour);
    const motionPath = join(dirs.dir, 'probe.motion.json');
    writeFileSync(motionPath, `${JSON.stringify(SLIDE_MOTION, null, 2)}\n`);
    const build = runCli(['build', '--rig', dirs.rigPath, '--motion', motionPath, '--images', dirs.dir, '--out', dirs.outDir]);
    if (build.status !== 0) {
      say('B00_THE_TWO_CANDIDATES_BUILD', false, `build exit=${String(build.status)}: ${build.stderr.split('\n')[0]}`, '');
      return bad;
    }
    built.push({ dir: dirs.dir, outDir: dirs.outDir });
  }
  const work = mkdtempSync(join(tmpdir(), 'rigc-ballot-'));
  const ballotPath = join(work, 'ballot.html');
  const ledgerPath = join(work, 'votes.jsonl');
  const vote = runCli([
    'vote',
    '--candidate', built[0].outDir,
    '--candidate', built[1].outDir,
    '--out', ballotPath,
  ]);
  const page = vote.status === 0 && existsSync(ballotPath) ? readFileSync(ballotPath, 'utf8') : '';

  const readIfThere = (path: string): string => (existsSync(path) ? readFileSync(path, 'utf8') : '');
  const skeletons = built.map((b) => readIfThere(join(b.outDir, 'skeleton.json')));
  const atlases = built.map((b) => readIfThere(join(b.outDir, 'skeleton.atlas')));
  const pageNames = atlases.map((text) => (text === '' ? [] : atlasPageNames(text)));
  const carries = (mime: string, body: string): boolean =>
    body !== '' && page.includes(`data:${mime};base64,${Buffer.from(body, 'utf8').toString('base64')}`);
  const imageUris = page.split('data:image/png;base64,').length - 1;
  say(
    'B01_THE_BALLOT_EMBEDS_EVERY_CANDIDATE',
    vote.status === 0 &&
      skeletons.every((text) => carries('application/json', text)) &&
      atlases.every((text) => carries('text/plain', text)) &&
      skeletons[0] !== skeletons[1] &&
      imageUris === pageNames[0].length + pageNames[1].length,
    vote.status === 0
      ? `${skeletons.length} skeletons and atlases embedded byte for byte, ${imageUris} image data URI(s) for ` +
        `${pageNames[0].length}+${pageNames[1].length} atlas page(s)`
      : `vote exit=${String(vote.status)}: ${vote.stderr.split('\n')[0]}`,
    'a ballot missing one candidate\'s pages is a comparison against a blank pane, which reads as a defect in that candidate',
  );

  // The manifest is the machine-readable half of the file, and everything below
  // reads the ballot through it rather than through the prose.
  let manifest: BallotManifest | null = null;
  const manifestText = new RegExp(
    `<script type="application/json" id="${MANIFEST_ELEMENT_ID}">([\\s\\S]*?)</script>`,
  ).exec(page);
  if (manifestText) manifest = JSON.parse(manifestText[1]) as BallotManifest;

  // ⚖️ The one thing the page must NOT say. A voter who can see that B came out
  // of `experiments/` is not comparing pictures any more, so the paths live in
  // the manifest and the manifest only — checked by looking for them in the page
  // with that element cut out of it.
  const withoutManifest = manifestText ? page.replace(manifestText[0], '') : page;
  const sources = manifest?.candidates.map((c) => c.source) ?? [];
  say(
    'B02_THE_PAGE_SHOWS_NO_CANDIDATE_PATH',
    manifest !== null &&
      sources.length === 2 &&
      sources.every((source) => source !== '' && page.includes(source) && !withoutManifest.includes(source)) &&
      /<h2>A<\/h2>/.test(page) &&
      /<h2>B<\/h2>/.test(page),
    manifest === null
      ? `no <script id="${MANIFEST_ELEMENT_ID}"> in the page`
      : `panes labelled A and B; both source paths present in the manifest and absent from the rest of the file`,
    'labels are neutral so the vote is about pixels; the mapping still has to be auditable, so it is in the file but never on the screen',
  );

  // The id is a hash of the candidates, which is what makes a result checkable
  // against a ballot at all — and swapping the panes has to make a NEW ballot,
  // because "which side was it on" is exactly the bias a re-vote controls for.
  const digests = manifest?.candidates.map((c) => c.digest) ?? [];
  const derived = manifest === null ? '' : ballotId(manifest.animation, digests);
  const swapped = manifest === null ? '' : ballotId(manifest.animation, [...digests].reverse());
  say(
    'B03_THE_BALLOT_ID_DERIVES_FROM_ITS_CANDIDATE_DIGESTS',
    manifest !== null &&
      manifest.spec === BALLOT_SPEC &&
      derived === manifest.ballot &&
      swapped !== manifest.ballot &&
      digests[0] !== digests[1] &&
      new Set(digests).size === 2,
    manifest === null ? 'no manifest to read' : `${manifest.ballot} = hash(${digests.length} digests), and reversed = ${swapped}`,
    'a label means nothing outside one ballot and a path means nothing once the directory is rebuilt; the digest is the only stable name',
  );

  // --- a vote comes back ------------------------------------------------------
  //
  // Synthesised exactly as the page writes it. Building it from the manifest
  // rather than from a literal is what makes the round trip a round trip: a
  // change to either shape breaks this without anybody editing the expectation.
  const resultFor = (against: BallotManifest | null, choice: string, reasonCode: string, reason: string): string =>
    `${JSON.stringify(
      {
        spec: VOTE_SPEC,
        ballot: against?.ballot,
        animation: against?.animation ?? null,
        candidates: (against?.candidates ?? []).map((c) => ({ label: c.label, digest: c.digest })),
        choice,
        reasonCode,
        reason,
        at: '2026-08-25T09:00:00.000Z',
        player: '4.3.*',
      },
      null,
      2,
    )}\n`;
  const writeResult = (name: string, text: string): string => {
    const path = join(work, name);
    writeFileSync(path, text);
    return path;
  };
  const record = (path: string, extra: string[] = [], against = ballotPath): ReturnType<typeof runCli> =>
    runCli(['vote', '--record', path, '--ballot', against, '--ledger', ledgerPath, ...extra]);
  const ledger = (): LedgerLine[] =>
    existsSync(ledgerPath)
      ? readFileSync(ledgerPath, 'utf8')
          .split('\n')
          .filter((line) => line.trim() !== '')
          .map((line) => JSON.parse(line) as LedgerLine)
      : [];

  const winnerPath = writeResult(
    resultFilename(manifest?.ballot ?? 'x'),
    resultFor(manifest, 'B', 'defect-in-others', "A's marker drifts"),
  );
  const first = record(winnerPath);
  const afterFirst = ledger();
  say(
    'B04_A_VOTE_ROUND_TRIPS_INTO_THE_LEDGER',
    first.status === 0 &&
      afterFirst.length === 1 &&
      afterFirst[0].spec === VOTE_SPEC &&
      afterFirst[0].seq === 1 &&
      afterFirst[0].attempt === 1 &&
      afterFirst[0].ballot === manifest?.ballot &&
      afterFirst[0].choice === 'B' &&
      afterFirst[0].winner === digests[1] &&
      afterFirst[0].coverage.length === 2 &&
      afterFirst[0].coverage.map((c) => c.digest).join() === digests.join(),
    first.status === 0
      ? `line 1: choice=${afterFirst[0]?.choice} winner=${String(afterFirst[0]?.winner).slice(0, 20)}… coverage=${afterFirst[0]?.coverage.length}`
      : `record exit=${String(first.status)}: ${first.stderr.split('\n').find((l) => l.includes('FAIL')) ?? first.stderr.split('\n')[0]}`,
    'the ledger carries the WINNER as a digest, not as "B": the next ballot\'s B is a different rig',
  );

  // ⭐ The distinction the whole record exists for. A tie the human declared is
  // an ANSWER and lands as a line; only an unopened ballot is missing from the
  // ledger. `both-unacceptable` is the tie that means "propose again", and it is
  // unreachable if a tie is not recordable.
  //
  // Recorded against a SECOND ballot — the same two builds with the panes
  // swapped — because one ballot is one question and B09 below is the control
  // that says so. The swap is also how a run controls for a voter's bias toward
  // the left pane, so this doubles as the end-to-end version of B03's `swapped`.
  const swappedPath = join(work, 'swapped.html');
  const swapVote = runCli([
    'vote',
    '--candidate', built[1].outDir,
    '--candidate', built[0].outDir,
    '--out', swappedPath,
  ]);
  let swappedManifest: BallotManifest | null = null;
  if (swapVote.status === 0 && existsSync(swappedPath)) {
    const found = new RegExp(
      `<script type="application/json" id="${MANIFEST_ELEMENT_ID}">([\\s\\S]*?)</script>`,
    ).exec(readFileSync(swappedPath, 'utf8'));
    if (found) swappedManifest = JSON.parse(found[1]) as BallotManifest;
  }
  const tiePath = writeResult('tie.json', resultFor(swappedManifest, TIE, 'both-unacceptable', 'neither holds the pose'));
  const tie = record(tiePath, [], swappedPath);
  const afterTie = ledger();
  say(
    'B05_A_TIE_IS_A_RECORDED_OUTCOME_NOT_A_MISSING_ONE',
    tie.status === 0 &&
      swappedManifest !== null &&
      swappedManifest.ballot !== manifest?.ballot &&
      afterTie.length === 2 &&
      afterTie[1].seq === 2 &&
      afterTie[1].ballot === swappedManifest.ballot &&
      afterTie[1].choice === TIE &&
      afterTie[1].winner === null &&
      afterTie[1].reasonCode === 'both-unacceptable' &&
      afterTie[1].coverage.length === 2,
    tie.status === 0
      ? `line 2 on the pane-swapped ballot ${String(swappedManifest?.ballot)}: choice=${afterTie[1]?.choice} ` +
        `winner=${String(afterTie[1]?.winner)} reasonCode=${afterTie[1]?.reasonCode}`
      : `record exit=${String(tie.status)}: ${tie.stderr.split('\n').find((l) => l.includes('FAIL')) ?? ''}`,
    'an interface that only offers "pick one" turns "these are indistinguishable" into an unanswered question',
  );

  // --- the mutants: four tampered results, four named refusals ----------------
  const refusals: { name: string; rule: string; path: string; extra?: string[]; why: string }[] = [
    {
      name: 'B06_A_FORGED_DIGEST_IS_REFUSED_BY_NAME',
      rule: 'V02_CANDIDATE_DIGESTS_ARE_THE_BALLOTS',
      path: writeResult(
        'forged.json',
        resultFor(manifest, 'A', 'preferred', '').replace(digests[1] ?? '', `sha256:${'0'.repeat(64)}`),
      ),
      why: 'a vote is about the pixels whose hashes it carries; a result naming other pixels is a vote on something else',
    },
    {
      name: 'B07_A_CHOICE_THAT_IS_NOT_ON_THE_BALLOT_IS_REFUSED',
      rule: 'V04_CHOICE_IS_ON_THE_BALLOT',
      path: writeResult('unknown-choice.json', resultFor(manifest, 'Z', 'preferred', '')),
      why: 'a winner nobody can resolve to a digest is a ledger line that means nothing to the agent that reads it',
    },
    {
      name: 'B08_A_REASON_CODE_THAT_CONTRADICTS_THE_CHOICE_IS_REFUSED',
      rule: 'V05_REASON_CODE_FITS_THE_CHOICE',
      path: writeResult('mismatched-code.json', resultFor(manifest, TIE, 'preferred', '')),
      why: '"tie, because this one is better" is not a state; the enumeration is only worth having if it is enforced',
    },
    {
      name: 'B09_A_SECOND_VOTE_ON_ONE_BALLOT_NEEDS_AGAIN',
      rule: 'V06_NOT_ALREADY_RECORDED',
      path: winnerPath,
      why: 'a result file recorded twice by a retrying agent would double one human\'s answer and skew every count over the ledger',
    },
  ];
  for (const mutant of refusals) {
    const before = ledger().length;
    const run = record(mutant.path, mutant.extra);
    const after = ledger();
    const named = run.stderr.includes(`FAIL  ${mutant.rule}`);
    say(
      mutant.name,
      run.status === 1 && named && after.length === before,
      run.status === 1
        ? `exit=1, ${named ? `refused by ${mutant.rule}` : `WRONG RULE: ${JSON.stringify(run.stderr.split('\n')[4] ?? '')}`}, ` +
          `ledger still ${after.length} line(s)`
        : `exit=${String(run.status)} — the ledger took it`,
      mutant.why,
    );
  }

  // …and `--again` is the door, so the refusal above is a gate rather than a wall.
  const again = record(winnerPath, ['--again']);
  const afterAgain = ledger();
  say(
    'B10_AGAIN_RECORDS_A_DELIBERATE_RE_VOTE_AS_A_SECOND_ATTEMPT',
    again.status === 0 &&
      afterAgain.length === 3 &&
      afterAgain[2].seq === 3 &&
      afterAgain[2].attempt === 2 &&
      afterAgain[2].ballot === manifest?.ballot &&
      // `attempt` counts this ballot's votes and `seq` counts the ledger's: the
      // tie on the swapped ballot sits between them, so a line whose attempt is
      // 2 at seq 3 is the proof the two counters are not the same number.
      afterAgain[1].ballot !== manifest?.ballot,
    again.status === 0
      ? `line 3: seq=${afterAgain[2]?.seq} attempt=${afterAgain[2]?.attempt}`
      : `record --again exit=${String(again.status)}`,
    'a re-vote after a change of mind is a real event; refusing it outright would push it into hand-editing the ledger',
  );

  // --- the arguments ----------------------------------------------------------
  const alone = runCli(['vote', '--candidate', built[0].outDir, '--out', join(work, 'alone.html')]);
  const tooMany = runCli([
    'vote',
    ...built.flatMap((b) => ['--candidate', b.outDir]),
    ...built.flatMap((b) => ['--candidate', b.outDir]),
    '--candidate', built[0].outDir,
    '--out', join(work, 'crowd.html'),
  ]);
  const repeatedElsewhere = runCli(['check', '--candidate', built[0].outDir, '--candidate', built[1].outDir, '--frames', work]);
  say(
    'B11_THE_CANDIDATE_COUNT_IS_BOUNDED_AND_A_REPEAT_ELSEWHERE_IS_A_TYPO',
    alone.status === 2 &&
      /one candidate on its own is `rigc preview`/.test(alone.stderr) &&
      tooMany.status === 2 &&
      /at most 4/.test(tooMany.stderr) &&
      repeatedElsewhere.status === 2 &&
      /--candidate was given more than once/.test(repeatedElsewhere.stderr),
    `one candidate exit=${String(alone.status)}, five exit=${String(tooMany.status)}, ` +
      `\`check --candidate a --candidate b\` exit=${String(repeatedElsewhere.status)}`,
    'a repeated --candidate used to be silently last-wins everywhere, which is a report about a rig nobody asked about',
  );

  // Two panes playing two different animations look like a comparison and are
  // not one — and the labels are A and B, so nothing on the screen would say so.
  const mismatched = runCli([
    'vote',
    '--candidate', built[0].outDir,
    '--candidate', built[1].outDir,
    '--animation', 'nope',
    '--out', join(work, 'mismatched.html'),
  ]);
  const help = runCli(['vote', '--help']);
  const topLevel = runCli([]);
  say(
    'B12_AN_ANIMATION_NO_CANDIDATE_HAS_IS_REFUSED_AND_VOTE_IS_DISCOVERABLE',
    mismatched.status === 2 &&
      /no animation "nope" in candidate 1/.test(mismatched.stderr) &&
      /slide/.test(mismatched.stderr) &&
      help.status === 0 &&
      help.stdout.includes('--record') &&
      help.stdout.includes('--ledger') &&
      topLevel.stderr.includes('rigc vote'),
    `mismatched animation exit=${String(mismatched.status)}, \`vote --help\` ${help.status === 0 ? 'ok' : 'FAILED'}, ` +
      'named in the bare-invocation usage',
    'a ballot whose panes play different animations is unfalsifiable from the outside — the voter cannot see which is which',
  );

  // ⚖️ The licence line for the new surface, as a machine check: same posture as
  // the preview, so NOTICE.md needs no new sentence and this is what keeps that true.
  say(
    'B13_THE_PLAYER_IS_REFERENCED_AND_NEVER_VENDORED',
    /<script src="https:\/\/unpkg\.com\/@esotericsoftware\/spine-player@[^"]+"><\/script>/.test(page) &&
      !page.includes('SpinePlayer = class') &&
      page.includes('spine-runtimes-license'),
    `player loaded by <script src>, page is ${(page.length / 1024).toFixed(1)} KiB, and it names the Spine Runtimes licence`,
    'NOTICE.md: the Spine Runtimes are Esoteric Software\'s and rigc redistributes none of them — a second surface must not be the exception',
  );

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
        // `spine-html`, pinned: a registered cut is a rig this project ships, and
        // "can this project ship it" is the whole question the extra suite asks.
        // It is the reading this suite has always had, and it is now stated
        // rather than inherited (#221).
        profile: 'spine-html',
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
  bad += runConstraintAndDeformSuite();
  substantive += 21;
  bad += runPathAndSliderSuite();
  substantive += 25;
  bad += runPolygonSuite();
  substantive += 6;
  bad += runContourMeshSuite();
  substantive += 8;
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
  const launcherBad = runLauncherSuite();
  if (launcherBad !== null) {
    bad += launcherBad;
    substantive += 3;
  }
  bad += runSeeItSuite();
  substantive += 11;
  bad += runPoseSuite();
  substantive += 10;
  bad += runBallotSuite();
  substantive += 13;
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
  const launcher =
    launcherBad === null
      ? '\n  ⚠️ No `node` binary was found on PATH, so the packaged bin/rigc.cjs launcher (issue #220) was not ' +
        'exercised in this run.'
      : ', + 3 bin-launcher controls (`--version` and an unknown command match direct invocation, and the exact ' +
        'message printed when Bun is missing from PATH)';
  console.log(
    `rigc selftest: green — ${SUITES.length + 3} positive controls + ${breaks} deliberate breaks, each caught by its ` +
      `named assertion, + ${RIG_MUTANTS.length} broken rig specs the compiler refused by name, ` +
      `+ ${tolerances} legal edits the gate had to accept, + 4 static-rig controls, ` +
      '+ 7 PNG transparency controls (indexed, greyscale and truecolour art whose transparency lives in a tRNS ' +
      'chunk, a greyscale+alpha file, a genuinely opaque part the gate still refuses, and the wording of that ' +
      'refusal), + 2 slot-attribution ' +
      'controls (a blob one part dominates, and two parts that are two blobs), + 6 draw-order controls, ' +
      '+ 7 key-time controls, + 8 event controls (2 of them a spine-core round trip of the firings), ' +
      '+ 21 constraint- and deform-timeline controls (8 of them a spine-core round trip that reads the ik and ' +
      'transform mixes off the posed constraints, the world position of a deformed vertex, and a weighted ' +
      "attachment's per-influence deform array), " +
      '+ 25 path / slider / per-skin controls (8 of them a spine-core round trip that reads the world position a ' +
      'path constraint puts a bone at, the arc lengths measured off the curve, the animation a slider applies, ' +
      'and which bones a skin switches on), ' +
      '+ 6 bounding-box / clipping controls (2 of them a spine-core round trip of the polygon and its end slot), ' +
      '+ 8 contour-mesh and rig-spec-generator controls (a mesh traced off a part\'s own alpha that gates green, a ' +
      'triangulation with area, one winding and no over-shared edge — with a folded triangle the same check must ' +
      'reject, the emitted triangles rasterised back over the very PNG they were traced from to cover 99.5% of the ' +
      'art without reaching past the margin while a mesh that would clip it is refused by name, a spine-core round ' +
      'trip of the indices, the hull and the pin to the slot bone, the undeformed mesh drawn beside the plain ' +
      'region of the same part with the same part moved two pixels as the instrument\'s control, the no-manifest ' +
      'placement convention measured on a ring and a ribbon and on a moved slot bone, six ways to ask for an ' +
      'impossible mesh each refused by name, and two traces of one PNG emitting the same bytes), ' +
      `+ 4 mesh-rasteriser controls${meshRung.startsWith(',') ? meshRung : ''}` +
      ', + 2 error-attribution controls (a motion-spec fault names the motion file, a JSON parse failure ' +
      'reports a line number), + 7 cli ergonomics controls (unknown command, bare invocation, `build --help`, ' +
      '`--version`, `-v`, and the profile default in both directions — art only renderer policy objects to ' +
      'builds green with no flag and is refused by every rule under `--profile spine-html`)' +
      `${launcher.startsWith(',') ? launcher : ''}` +
      ', + 11 see-it controls (a rig built from indexed+tRNS art and then RENDERED — issue #226 — its frame series, ' +
      'sidecar-declared frame size, motion between two of the frames, the decoder expanding palettes and greyscale ' +
      'to RGBA while still refusing a colour type that is not one, a preview embedding the skeleton, the atlas and ' +
      'one data URI per page under the names the player asks for, the player referenced rather than vendored, both ' +
      'commands in the help, and a misspelled --animation refused by name)' +
      ', + 10 pose controls (a rig rendered at a chosen scale and its placements read back out of the picture ' +
      'within a pixel, a degree and 8% — one PNG posed twice reported as TWO placements rather than picked ' +
      "between, a round part's rotation reported as free where nothing else is, a foreign part / a part the " +
      'canvas cannot hold / an all-transparent part each refused by their own reason, an occluded part whose ' +
      'residual rises while its placement does not move, a knocked-out ground read the same as a flat one, the ' +
      'declared scale window honoured in both directions, and the command writing its JSON while a mistyped ' +
      'directory is refused by name)' +
      ', + 13 ballot controls (two candidates embedded whole in one page, neutral A/B panes with both source paths ' +
      'in the manifest and nowhere else, a ballot id that derives from the candidate digests and changes when the ' +
      'panes swap, a winner and a tie each landing as a ledger line carrying the winning DIGEST and its coverage, ' +
      'four tampered results — a forged digest, a choice that is not on the ballot, a reason code contradicting the ' +
      'choice, and a duplicate — each refused by its own rule name with nothing appended, --again recording a ' +
      'deliberate re-vote as attempt 2, the candidate count bounded at both ends with a repeated --candidate ' +
      'elsewhere refused as the typo it is, an animation no candidate has refused by name, `vote` in the help, and ' +
      'the player referenced rather than vendored)' +
      ', + 3 copy-images controls (self-contained out dir, unchanged default, deterministic basename collision)' +
      corpus +
      (meshRung.startsWith(',') ? '' : meshRung) +
      (launcher.startsWith(',') ? '' : launcher) +
      (cuts.cuts > 0 ? `\n  + the extra suite gated ${cuts.cuts} registered cut(s) green` : ''),
  );
}

main();
