#!/usr/bin/env bun
/**
 * rigc selftest — proof that the validator can go RED.
 *
 * A gate nobody has seen fail is not a gate. Plan 04 section 2-3 measured six
 * ways to write a wrong skeleton that the parser accepts without a murmur, so
 * this file takes real compiled artifacts, breaks them one way at a time, and
 * asserts that the named assertion fires for each break.
 *
 * There is a positive control too (the pristine artifacts must come back with
 * zero failures) — without it a validator that failed everything would look
 * like a validator that worked. A check with no positive control manufactures
 * false greens.
 *
 *   bun selftest.ts --cuts <cuts.json>
 *   RIGC_CUTS=<cuts.json> bun selftest.ts
 *   bun selftest.ts                      # falls back to ./cuts.json
 *
 * ⚠️ The mutants below name attachments, bones and animations by hand, because a
 * break has to be aimed at something real to be a break at all. That makes the
 * suite fixture-bound: the cuts.json it is pointed at must supply cuts named
 * `face_trial`, `joint_dev` and `seam_trial` with the geometry these edits
 * assume. Those fixtures are not in this repository — see CLAUDE.md, PUBLIC
 * GATE. Until they are, this file is a gate for the project that owns the art,
 * not a gate a fresh clone can run.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { compile } from './src/compile.ts';
import { validate } from './src/validate.ts';

/** Same shape `cli.ts` reads; declared here so this file never imports the CLI. */
interface CutEntry {
  manifest: string;
  motion: string;
  out: string;
}
type CutTable = Record<string, CutEntry>;

interface Options {
  manifestPath: string;
  motionPath: string;
  outDir: string;
}

/** Argument, then environment, then a cuts.json sitting next to this file. */
function cutsPath(): string {
  const argv = process.argv.slice(2);
  const flag = argv.indexOf('--cuts');
  if (flag !== -1) {
    const value = argv[flag + 1];
    if (!value) {
      console.error('selftest: --cuts needs a path');
      process.exit(2);
    }
    return resolve(value);
  }
  if (process.env.RIGC_CUTS) return resolve(process.env.RIGC_CUTS);
  return resolve(import.meta.dir, 'cuts.json');
}

const CUTS_FILE = cutsPath();
if (!existsSync(CUTS_FILE)) {
  // Exiting 0 here would be the exact failure this file exists to prevent: a
  // gate that checked nothing, reporting green.
  console.error(
    `selftest: no cuts file at ${CUTS_FILE}\n` +
      '  point it at a cuts.json that registers face_trial, joint_dev and seam_trial:\n' +
      '    bun selftest.ts --cuts <path>   (or RIGC_CUTS=<path>)',
  );
  process.exit(2);
}
const CUTS_DIR = dirname(CUTS_FILE);
const CUT_TABLE = JSON.parse(readFileSync(CUTS_FILE, 'utf8')) as CutTable;

function optsFor(name: string): Options {
  const entry: CutEntry | undefined = CUT_TABLE[name];
  if (!entry) {
    console.error(`selftest: ${CUTS_FILE} has no cut named ${JSON.stringify(name)} — this suite cannot run without it`);
    process.exit(2);
  }
  return {
    manifestPath: resolve(CUTS_DIR, entry.manifest),
    motionPath: resolve(CUTS_DIR, entry.motion),
    outDir: resolve(CUTS_DIR, entry.out),
  };
}

const OPTS = optsFor('face_trial');
/**
 * Tier 2. The joint archetype's invariants live on bones the face rig does not
 * have — an axis, a detached emitter, a grip ring, a chain — so they need their
 * own artifacts to break. Same discipline, second suite.
 */
const JOINT_OPTS = optsFor('joint_dev');
/**
 * The REAL tier-2 cut. It earns a third suite for two reasons, and neither is
 * symmetry: it is the only cut that declares a cap-containment ceiling, so A30 is
 * VACUOUS on the other two and a break there would be caught by nothing; and it
 * is the only cut whose manifest names its slots something other than the
 * archetype does, so the mapping that resolves that is worth a break of its own.
 */
const SEAM_OPTS = optsFor('seam_trial');

interface Artifacts {
  skeletonText: string;
  atlasText: string;
}

interface Mutant {
  name: string;
  /** What plan 04 calls this failure, when it has a case number. */
  origin: string;
  expect: string;
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
    origin: 'plan 04 case 6a — the constraint vanishes, load is clean',
    expect: 'A01_NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).physics = [{ name: 'grip_phys', bone: 'face', inertia: 0.6 }];
      }),
    }),
  },
  {
    name: 'M02_bone_transform_key',
    origin: 'plan 04 case 6b — inheritance silently falls back to Normal',
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
    origin: 'plan 04 case 6c — width/height load as NaN, no error',
    expect: 'A03_REGION_WIDTH_HEIGHT_FINITE',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        delete (j as any).skins[0].attachments.eye_l.eye_l_closed.width;
      }),
    }),
  },
  {
    name: 'M04_short_curve_array',
    origin: 'plan 04 case 6g — 4 numbers where 16 are needed; NaN curve, no error',
    expect: 'A05_CURVE_ARRAY_LENGTH',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        const keys = (j as any).animations.blink_once.slots.eye_l.rgba;
        keys[0].curve = keys[0].curve.slice(0, 4);
      }),
    }),
  },
  {
    name: 'M05_curve_on_attachment_timeline',
    origin: 'plan 04 section 1-6 — attachment timelines take no curve',
    expect: 'A05_CURVE_ARRAY_LENGTH',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).animations.talk.slots.mouth.attachment[0].curve = 'stepped';
      }),
    }),
  },
  {
    name: 'M06_atlas_size_disagrees_with_png',
    origin: 'plan 04 case 6h — UVs collapse; rigid looks fine, meshes do not',
    expect: 'A06_ATLAS_PAGE_SIZE_MATCHES_PNG',
    mutate: (a) => ({ ...a, atlasText: a.atlasText.replace('size: 277, 191', 'size: 2048, 2048') }),
  },
  {
    name: 'M07_atlas_region_name_indented',
    origin: 'plan 04 section 2-3 — page names are trimmed, region names are not',
    expect: 'A07_ATLAS_TEXT_SHAPE',
    mutate: (a) => ({ ...a, atlasText: a.atlasText.replace('\neye_l_closed\n', '\n  eye_l_closed\n') }),
  },
  {
    name: 'M08_atlas_blank_line_inside_page_block',
    origin: 'plan 04 section 2-3 — a blank line closes the page; regions become pages',
    expect: 'A07_ATLAS_TEXT_SHAPE',
    mutate: (a) => ({ ...a, atlasText: a.atlasText.replace('pma: false\nface_base', 'pma: false\n\nface_base') }),
  },
  {
    name: 'M09_dark_two_colour_tint',
    origin: 'plan 02 section 7 — parsed, then silently ignored by the renderer',
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
    origin: 'plan 04 rule 4 — JSON has no duration field; the last key IS the duration',
    expect: 'A09_ANIMATION_DURATION_MATCHES_SPEC',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        for (const slot of ['eye_l', 'eye_r']) (j as any).animations.blink_auto.slots[slot].rgba.pop();
      }),
    }),
  },
  {
    name: 'M11_attachment_points_at_a_missing_region',
    origin: 'plan 04 case 6d — one of the two things that DOES throw loudly',
    expect: 'A00_ROUNDTRIP_PARSE',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).skins[0].attachments.mouth.mouth_wide_open.path = '99_typo';
      }),
    }),
  },
  {
    name: 'M12_page_png_not_on_disk',
    origin: 'plan 03 section 2-0 — the shipped skeleton.atlas declared a page that never existed',
    expect: 'A17_ATLAS_PAGE_FILES_EXIST',
    mutate: (a) => ({ ...a, atlasText: a.atlasText.replace('../parts/eye_r_closed.png', '../parts/nope.png') }),
  },
  {
    name: 'M13_version_label_from_the_4_2_era',
    origin: 'plan 04 section 7-3 — the label is never checked by the parser',
    expect: 'A16_SKELETON_VERSION_4_3',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).skeleton.spine = '4.2.43';
      }),
    }),
  },
  {
    name: 'M14_region_does_not_cover_its_page',
    origin: 'plan 04 section 7-3 — one part per page means u2=v2=1, always',
    expect: 'A06_ATLAS_PAGE_SIZE_MATCHES_PNG',
    mutate: (a) => ({ ...a, atlasText: a.atlasText.replace('bounds: 0, 0, 136, 107', 'bounds: 4, 4, 100, 100') }),
  },
  {
    name: 'M16_rim_vertex_pinned_to_the_control_bone',
    origin: 'plan 02 section 2-3 — if the rim can move, the seam can move',
    expect: 'A21_MESH_RIM_PINNED',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        // vertex 0 is a hull vertex: [boneCount=1, boneIndex, bindX, bindY, 1].
        // Repoint it at the control bone and the weight stays valid — sum is
        // still 1, nothing throws, and the seam quietly gains a hinge.
        const mesh = (j as any).skins[0].attachments.mouth.mouth_wide_open;
        mesh.vertices[1] = (j as any).bones.findIndex((b: any) => b.name === 'mouth_aperture');
      }),
    }),
  },
  {
    name: 'M17_weights_do_not_sum_to_one',
    origin: 'plan 04 section 1-3 — weights are read, never checked',
    expect: 'A20_MESH_WEIGHTS_COHERENT',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        const mesh = (j as any).skins[0].attachments.mouth.mouth_wide_open;
        // First inner-ring vertex: [2, anchor, bx, by, w0, control, bx, by, w1].
        mesh.vertices[84] = 0.9;
      }),
    }),
  },
  {
    name: 'M18_uv_outside_the_region',
    origin: 'plan 04 section 1-3 — uvs decide worldVerticesLength, not their own sanity',
    expect: 'A22_MESH_UVS_IN_UNIT_RANGE',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).skins[0].attachments.mouth.mouth_wide_open.uvs[0] = 1.4;
      }),
    }),
  },
  {
    name: 'M19_idle_keys_the_mesh_control_bone',
    origin: 'plan 02 section 2-3 — a mesh keyed in idle dirties its canvas forever',
    expect: 'A15_IDLE_NO_MESH_BONE_KEYS',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        // The pre-mesh check looked at the slot's own bone only, so this exact
        // break used to pass: the control bone is a different bone.
        (j as any).animations.idle.bones = {
          mouth_aperture: { scale: [{ time: 0, x: 1, y: 1 }] },
        };
      }),
    }),
  },
  {
    name: 'M20_mesh_falls_back_to_unweighted',
    origin: 'plan 04 section 1-3 — encoding is chosen by a length comparison alone',
    expect: 'A20_MESH_WEIGHTS_COHERENT',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        const mesh = (j as any).skins[0].attachments.mouth.mouth_wide_open;
        // Exactly uvs.length numbers => the loader reads them as raw positions
        // and the bone weights are gone. No error, and the mesh stops moving.
        mesh.vertices = new Array(mesh.uvs.length).fill(0);
      }),
    }),
  },
  {
    name: 'M21_physics_drives_no_component',
    origin: 'plan 04 section 1-5 — the five component fields all default to 0',
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
    origin: 'plan 02 section 3 — damping >= 1 keeps a mesh canvas alive forever',
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
    origin: 'plan 04 section 1-5 — mass is stored as 1/mass, so 0 becomes Infinity',
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
    origin: 'plan 02 section 5-2 — the renderer does not un-premultiply; every part gets a black rim',
    expect: 'A06_ATLAS_PAGE_SIZE_MATCHES_PNG',
    mutate: (a) => ({ ...a, atlasText: a.atlasText.replace('pma: false', 'pma: true') }),
  },
];
/* eslint-enable @typescript-eslint/no-explicit-any */


/* eslint-disable @typescript-eslint/no-explicit-any */
const JOINT_MUTANTS: Mutant[] = [
  {
    name: 'M24_base_plate_promoted_to_a_mesh',
    origin: 'plan 02 section 2-3 / section 7 — a full-frame mesh is a full-frame canvas that can never dirty-skip',
    expect: 'A14_NO_FULL_FRAME_MESH',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        // Already covered: A14 recognises the base plate structurally (its mesh
        // spans the stage), so "base is never a mesh" needed a MUTANT, not a new
        // assertion. The compiler refuses it too, which is why this has to be
        // forged in the artifact to be tested at all.
        const base = (j as any).bones.findIndex((b: any) => b.name === 'base');
        (j as any).skins[0].attachments.base['00_base_body'] = {
          type: 'mesh',
          uvs: [0, 0, 1, 0, 1, 1, 0, 1],
          triangles: [0, 1, 2, 0, 2, 3],
          vertices: [
            1, base, -960, 540, 1,
            1, base, 960, 540, 1,
            1, base, 960, -540, 1,
            1, base, -960, -540, 1,
          ],
          hull: 4,
          width: 1920,
          height: 1080,
        };
      }),
    }),
  },
  {
    name: 'M25_stroke_key_carries_a_screen_space_y',
    origin: "plan 02 section 2-1 — the scaffold's `x: 30, y: 8` pairs, which is why its animation could not move to another cut",
    expect: 'A24_AXIS_SPACE_STROKE',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        // Loads clean, animates, and looks right on THIS cut. It is wrong only in
        // the sense that the direction is now half in the keys and half in the
        // axis bone, so the next cut inherits a lie.
        (j as any).animations.piston_slow.bones.piston.translate[1].y = 8;
      }),
    }),
  },
  {
    name: 'M26_axis_bone_is_animated',
    origin: 'plan 02 section 2-1 — the axis angle is the one per-cut SETUP value; animating it swings the whole formation',
    expect: 'A24_AXIS_SPACE_STROKE',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).animations.idle.bones.axis = { rotate: [{ time: 0, value: 3 }] };
      }),
    }),
  },
  {
    name: 'M27_fluid_src_reparented_under_the_moving_part',
    origin: 'spine_builder.py:49 — emitted fluid gets dragged left and right with every stroke',
    expect: 'A25_DETACHED_BONE_PARENTAGE',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        (j as any).bones.find((b: any) => b.name === 'fluid_src').parent = 'piston';
      }),
    }),
  },
  {
    name: 'M28_occluder_drawn_before_the_moving_part',
    origin: 'plan 01 section 2 — the entry point only reads as swallowed while the occluder is in front',
    expect: 'A26_SLOT_DRAW_ORDER',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        const slots = (j as any).slots;
        const lip = slots.findIndex((s: any) => s.name === 'lip');
        const piston = slots.findIndex((s: any) => s.name === 'piston');
        slots.splice(piston, 0, slots.splice(lip, 1)[0]);
      }),
    }),
  },
  {
    name: 'M29_region_name_diverges_from_its_page_filename',
    origin: 'plan 02 section 2-2 — attachment = region = filename is the runtime join key, and a break makes the slot vanish silently',
    expect: 'A27_REGION_NAME_MATCHES_PAGE_FILENAME',
    mutate: (a) => ({
      // Renamed on BOTH sides, so the attachment still resolves and A08 stays
      // green. That is the hole: the first two links of the chain agreed with
      // each other while pointing at a file called something else.
      atlasText: a.atlasText.replace('\n05_fluid_pool\n', '\n05_pool_typo\n'),
      skeletonText: editJson(a.skeletonText, (j) => {
        const atts = (j as any).skins[0].attachments.fluid_pool;
        atts['05_pool_typo'] = atts['05_fluid_pool'];
        delete atts['05_fluid_pool'];
      }),
    }),
  },
  {
    name: 'M30_ribbon_row_weights_diverge',
    origin: 'plan 02 section 2-3 item 2 — a drip changes length without changing width',
    expect: 'A28_RIBBON_ROWS_SHARE_WEIGHTS',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        // Vertex 1 is the left side of row 1: [2, b0, x, y, w0, b1, x, y, w1]
        // starting at index 5. Re-splitting 50/50 keeps the sum at 1, so A20 has
        // nothing to say and the drip quietly develops a taper that grows with
        // the sag.
        const mesh = (j as any).skins[0].attachments.fluid['03_fluid_overflow'];
        mesh.vertices[9] = 0.5;
        mesh.vertices[13] = 0.5;
      }),
    }),
  },
  {
    name: 'M31_ribbon_entry_row_rides_the_chain',
    origin: 'plan 02 section 2-3 — a ribbon may move its tip, never its entry: that row is where the fluid leaves the body',
    expect: 'A21_MESH_RIM_PINNED',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        const mesh = (j as any).skins[0].attachments.fluid['03_fluid_overflow'];
        mesh.vertices[1] = (j as any).bones.findIndex((b: any) => b.name === 'fluid_c');
      }),
    }),
  },
  {
    name: 'M32_stroke_drives_past_the_contact_point',
    origin: "owner rule 2026-08-22 — the swallow goes at most until the inserting mass touches the occluder",
    expect: 'A29_STROKE_WITHIN_CONTACT_DEPTH',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        // +10px on the deepest key. Loads, plays, and renders two bodies passing
        // through each other; nothing in the file has an opinion about it. The
        // shipped rig sits 6.5px under the limit, so this is the smallest edit
        // that crosses it.
        const keys = (j as any).animations.piston_fast.bones.piston.translate;
        keys[1].x += 10;
      }),
    }),
  },
];
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
const SEAM_MUTANTS: Mutant[] = [
  {
    name: 'M33_stroke_drives_past_the_cap_containment_ceiling',
    origin:
      'plan 01 section 4.5 — past the containment window the cap contour is drawn where the art says it is inside the body',
    expect: 'A30_STROKE_WITHIN_CAP_CONTAINMENT',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        // The shipped rig's deepest key is 75.733 against a ceiling of 118, so
        // +43 is the smallest whole-pixel edit that crosses it. Loads, plays,
        // and renders the cap outside the flesh that should have swallowed it.
        const keys = (j as any).animations.piston_fast.bones.piston.translate;
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
        // Copied from the placeholder cut's own piston_slow, where it is correct.
        // That is the point: this is the tempting edit, not an absurd one, and it
        // silently takes the rig outside the evidence for its only ceiling.
        (j as any).animations.piston_slow.bones.piston.scale = [
          { time: 0, x: 1, y: 1 },
          { time: 0.2, x: 1.04, y: 0.97 },
          { time: 0.8, x: 1, y: 1 },
        ];
      }),
    }),
  },
  {
    name: 'M35_slot_keeps_the_parts_lane_name',
    origin:
      'the manifest calls it `occluder` and the archetype calls it `lip`; the emitted name is the join key and a mismatch makes the slot vanish with no error',
    expect: 'A26_SLOT_DRAW_ORDER',
    mutate: (a) => ({
      ...a,
      skeletonText: editJson(a.skeletonText, (j) => {
        const slots = (j as any).slots;
        slots.find((s: any) => s.name === 'lip').name = 'occluder';
        const atts = (j as any).skins[0].attachments;
        atts.occluder = atts.lip;
        delete atts.lip;
      }),
    }),
  },
];
/* eslint-enable @typescript-eslint/no-explicit-any */

interface Suite {
  name: string;
  opts: typeof OPTS;
  mutants: Mutant[];
}

const SUITES: Suite[] = [
  { name: 'face_trial', opts: OPTS, mutants: MUTANTS },
  { name: 'joint_dev', opts: JOINT_OPTS, mutants: JOINT_MUTANTS },
  { name: 'seam_trial', opts: SEAM_OPTS, mutants: SEAM_MUTANTS },
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
    });
    const hit = report.failures.find((f) => f.assertion === mutant.expect);
    if (hit) {
      console.log(`  PASS  ${mutant.name}`);
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

function main(): void {
  let bad = 0;
  let mutants = 0;
  for (const suite of SUITES) {
    bad += runSuite(suite);
    mutants += suite.mutants.length;
  }

  console.log('');
  if (bad > 0) {
    console.error(`rigc selftest: ${bad} control(s) failed`);
    process.exit(1);
  }
  console.log(
    `rigc selftest: green — ${SUITES.length} positive controls + ${mutants} deliberate breaks, each caught by its named assertion`,
  );
}

main();
