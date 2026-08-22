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
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { assertFrameReadable, checkAgainstFrames, type CheckReport } from './src/check.ts';
import { compile, CompileError } from './src/compile.ts';
import { diffSkeletons, movedMeasures } from './src/diff.ts';
import { validate, type ValidateProfile } from './src/validate.ts';
import { articulatedFixture, containedFixture, overlayFixture, type Fixture } from './fixtures/public.ts';
import { Plate, type RGBA } from './tools/plate.ts';

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
  /** What plan 04 calls this failure, when it has a case number. */
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
  /** Every measure id this edit must move — exactly, no more and no fewer. */
  expect: string[];
  mutate: (skeleton: Record<string, unknown>) => void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const DIFF_CASES: DiffCase[] = [
  {
    name: 'D01_drop_a_bone',
    why: 'the whole bones section moves and nothing else does — a slot still names the bone it named, so the binding figure is untouched and stays diagnostic',
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
    mutate: (j) => {
      (j as any).bones = (j as any).bones.filter((b: any) => b.name !== 'square');
    },
  },
  {
    name: 'D02_reorder_two_slots',
    why: 'the slots array IS the draw order, so this is a real defect — and it must move ONLY the order measure, or "wrong z-order" and "wrong rig" would read the same',
    expect: ['slots.order'],
    mutate: (j) => {
      const slots = (j as any).slots;
      (j as any).slots = [slots[1], slots[0], ...slots.slice(2)];
    },
  },
  {
    name: 'D03_remove_an_animation',
    why: 'every animation measure that can see a missing animation moves; event_keys does not, because neither side has events and a vacuous measure must not manufacture a gap',
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
    mutate: (j) => {
      delete (j as any).animations.light;
    },
  },
  {
    name: 'D04_change_a_curve_kind',
    why: 'one bezier becomes stepped: same timelines, same key count, same duration. Only the curve histogram may notice, and that is the measure that carries timing quality',
    expect: ['animations.curve_kinds'],
    mutate: (j) => {
      const keys = (j as any).animations.heavy.bones.bone.rotate;
      const at = keys.findIndex((k: any) => Array.isArray(k.curve));
      if (at < 0) throw new Error('fixture has no bezier key on heavy.bones.bone.rotate');
      keys[at].curve = 'stepped';
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

  for (const c of DIFF_CASES) {
    const candidate: Record<string, unknown> = JSON.parse(text);
    c.mutate(candidate);
    const moved = movedMeasures(diffSkeletons(candidate, reference));
    const want = [...c.expect].sort().join(', ');
    const got = [...moved].sort().join(', ');
    if (want === got) {
      console.log(`  PASS  ${c.name}  (moved exactly ${moved.length} measure(s))`);
      console.log(`          ${c.why}`);
    } else {
      bad++;
      console.log(`  FAIL  ${c.name}`);
      console.log(`          expected to move: [${want}]`);
      console.log(`          actually moved:   [${got}]`);
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

const CHECK_TRANSCRIPTION = resolve(import.meta.dir, 'bench/transcriptions/3-timing-and-spacing');
const CHECK_FRAMES = resolve(import.meta.dir, 'bench/reference/3-timing-and-spacing');
const CHECK_IMAGES = resolve(import.meta.dir, 'examples/3-timing-and-spacing/images');

/** Compile the rung-3 transcription, optionally against a rewritten motion spec. */
function compileTranscription(motionText: string | null): { skeletonText: string; atlasText: string; atlasDir: string } {
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
    imagesDir: CHECK_IMAGES,
  });
  return { skeletonText: result.skeletonText, atlasText: result.atlasText, atlasDir: outDir };
}

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

/** The two figures a check control asserts on, across every animation in the set. */
function checkExtremes(report: CheckReport): { meanMae: number; frameMae: number; drift: number; sets: number } {
  let meanMae = 0;
  let frameMae = 0;
  let drift = 0;
  for (const anim of report.animations) {
    meanMae = Math.max(meanMae, anim.meanMae);
    frameMae = Math.max(frameMae, anim.meanMaeFrame);
    drift = Math.max(drift, anim.worstDrift);
  }
  return { meanMae, frameMae, drift, sets: report.animations.length };
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

/** A two-slot rig spec plus its art, written fresh into a temp directory. */
function writeProbeRig(): ProbeDirs {
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
  bad += runDrawOrderSuite();
  substantive += 6;
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
      : `, + ${DIFF_CASES.length} diff measure controls, + 3 check controls (frames-only reads, a faithful ` +
        'transcription, a time-reversed one)';
  console.log(
    `rigc selftest: green — ${SUITES.length + 3} positive controls + ${breaks} deliberate breaks, each caught by its ` +
      `named assertion, + ${RIG_MUTANTS.length} broken rig specs the compiler refused by name, ` +
      `+ ${tolerances} legal edits the gate had to accept, + 4 static-rig controls, + 6 draw-order controls` +
      corpus +
      (cuts.cuts > 0 ? `\n  + the extra suite gated ${cuts.cuts} registered cut(s) green` : ''),
  );
}

main();
