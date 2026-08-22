/**
 * The selftest's own fixtures — synthetic, public, and written fresh every run.
 *
 * ⭐ Why this file exists. The suite in [`selftest.ts`](../selftest.ts) proves the
 * validator can go RED, and a break has to be aimed at something real to be a
 * break at all: a mutant names an attachment, a bone, an animation. For as long
 * as those names belonged to one private project's art, the gate this repository
 * ships was a gate a fresh clone could not run — the tool's central claim,
 * demonstrable only by the one person who already had the fixtures.
 *
 * So the fixtures are generated. Three of them, and between them they carry every
 * structure the assertions have an opinion about:
 *
 *   - `overlay_probe`    — a base plate with alpha overlays pinned on top, one of
 *                          them a deformable ring mesh on a control bone, plus a
 *                          physics constraint and four animations. Region
 *                          attachments, attachment swaps, rgba fades, curves.
 *   - `articulated_probe` — a bone tree with an AXIS bone whose subtree travels
 *                          along it, a detached emitter, a ribbon mesh on a bone
 *                          chain, a second ring mesh, an occluder that must be
 *                          drawn after the part it hides, and a measured contact
 *                          ceiling.
 *   - `contained_probe`  — the SAME rig against a second manifest: no contact
 *                          ceiling, a containment ceiling instead, and a slot
 *                          whose manifest name differs from its rig name. It is a
 *                          separate fixture for the same reason its private
 *                          ancestor was: a ceiling that only one cut declares
 *                          makes its assertion vacuous on every other one, and a
 *                          break there would be caught by nothing.
 *
 * 🚫 **None of this is art.** Every plate is a checkerboard with its own name
 * burned into it by `tools/plate.ts`, and no claim about seams, blending or style
 * can be made from any of them. They exist to be structurally real — a PNG with a
 * true size and a true alpha channel, in the place the manifest says it is — so
 * that the compiler measures something and the atlas points somewhere.
 *
 * The numbers are chosen, not measured, and two of them are load-bearing:
 * `contact_depth` and `cap_containment_ceiling` sit a known distance above the
 * deepest key their motion spec asks for, so that the mutants which drive past
 * them can state the SMALLEST whole-pixel edit that crosses the line. A fixture
 * that cleared its ceiling by a mile would let a mutant pass while proving
 * nothing about where the boundary is.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Plate, type RGBA } from '../tools/plate.ts';

/** Everything `compile()` needs, plus where the fixture put itself. */
export interface Fixture {
  /** The rig spec's `name`, which is also what the validator reports. */
  rig: string;
  dir: string;
  rigPath: string;
  motionPath: string;
  manifestPath: string;
  outDir: string;
}

const INK: RGBA = [24, 28, 36, 255];
const PAPER: RGBA = [206, 212, 226, 255];
const ACCENT: RGBA = [198, 96, 72, 255];

/**
 * A checkerboard plate with its name across it.
 *
 * The checker is not decoration: a flat fill would make a wrong UV mapping
 * invisible, and half the point of a fixture is that a defect in the geometry
 * has somewhere to show up. `PLACEHOLDER` is burned in for the same reason it is
 * in every other synthetic plate in this project — so that no image from here can
 * ever be mistaken for a rendered part.
 */
function writePlate(path: string, width: number, height: number, label: string, opaque = false): void {
  const plate = new Plate(width, height);
  const cell = 8;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const on = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      plate.set(x, y, on ? PAPER : INK);
    }
  }
  plate.frame(0, 0, width, height, 1, ACCENT);
  if (height >= 20) plate.textCentred(label.toUpperCase().slice(0, 18), width / 2, Math.max(2, height / 2 - 10), 1, ACCENT);
  if (height >= 34) plate.textCentred('PLACEHOLDER', width / 2, Math.max(12, height / 2 + 2), 1, ACCENT);
  if (!opaque) {
    // A transparent margin, so an overlay part is genuinely an overlay: it has
    // to carry alpha or A19 is measuring a rectangle that would paint over the
    // base plate it is supposed to sit on.
    plate.maskAlpha((x, y) => (x < 2 || y < 2 || x >= width - 2 || y >= height - 2 ? 0 : 255));
  }
  plate.writePng(path);
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** A convex-ish octagon inscribed in a window, in CROP pixels, y down. */
function octagon(x: number, y: number, w: number, h: number, inset: number): Array<[number, number]> {
  const l = x + inset;
  const r = x + w - inset;
  const t = y + inset;
  const b = y + h - inset;
  const mx = x + w / 2;
  const my = y + h / 2;
  const dx = (r - l) / 4;
  const dy = (b - t) / 4;
  return [
    [mx - dx, t],
    [mx + dx, t],
    [r, my - dy],
    [r, my + dy],
    [mx + dx, b],
    [mx - dx, b],
    [l, my + dy],
    [l, my - dy],
  ];
}

let root: string | null = null;

/** One temp root for the whole run, so a failed run leaves one directory to read. */
function fixtureRoot(): string {
  if (root === null) root = mkdtempSync(join(tmpdir(), 'rigc-fixtures-'));
  return root;
}

function makeDir(name: string): string {
  const dir = join(fixtureRoot(), name);
  mkdirSync(join(dir, 'plates'), { recursive: true });
  mkdirSync(join(dir, 'parts'), { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// overlay_probe
// ---------------------------------------------------------------------------

/**
 * A base plate with three overlay slots pinned on top by manifest offsets, one of
 * them promoted to a ring mesh.
 *
 * The shape it stands in for is the commonest one there is: an untouched frame
 * plus small regenerated patches that have to composite back onto it without a
 * findable seam. Everything the overlay assertions look at is here — a slot that
 * fades with an rgba timeline, a slot that swaps attachments, a mesh whose rim is
 * pinned and whose interior is driven by a control bone, and an `idle` that is
 * allowed to key none of it.
 */
export function overlayFixture(): Fixture {
  const dir = makeDir('overlay_probe');
  const crop = 256;

  writePlate(join(dir, 'plates', '00_stage.png'), crop, crop, 'stage', true);
  writePlate(join(dir, 'parts', 'lens_l_shut.png'), 64, 40, 'lens l');
  writePlate(join(dir, 'parts', 'lens_r_shut.png'), 64, 40, 'lens r');
  writePlate(join(dir, 'parts', 'iris_open.png'), 96, 64, 'iris open');
  writePlate(join(dir, 'parts', 'iris_wide.png'), 96, 64, 'iris wide');

  const irisWindow = { x: 80, y: 150, w: 96, h: 64 };
  const manifestPath = join(dir, 'manifest.json');
  writeJson(manifestPath, {
    schema: 'rigc-fixture/overlay/1',
    note: 'Synthetic. Every plate is a generated checkerboard; no seam or style claim can come from this cut.',
    crop: { x: 0, y: 0, w: crop, h: crop, resample: 'none' },
    base: 'plates/00_stage.png',
    state_machine: { lens: ['open', 'shut'], iris: ['closed', 'open', 'wide'] },
    parts: [
      { slot: 'stage', draw_order: 0, image: 'plates/00_stage.png', offset: [0, 0] },
      {
        slot: 'lens_l',
        draw_order: 10,
        state_key: 'lens',
        offset: [40, 60],
        size: [64, 40],
        states: { open: null, shut: 'parts/lens_l_shut.png' },
      },
      {
        slot: 'lens_r',
        draw_order: 11,
        state_key: 'lens',
        offset: [150, 60],
        size: [64, 40],
        states: { open: null, shut: 'parts/lens_r_shut.png' },
      },
      {
        slot: 'iris',
        draw_order: 20,
        state_key: 'iris',
        offset: [irisWindow.x, irisWindow.y],
        size: [irisWindow.w, irisWindow.h],
        polygon: octagon(irisWindow.x, irisWindow.y, irisWindow.w, irisWindow.h, 14),
        states: { closed: null, open: 'parts/iris_open.png', wide: 'parts/iris_wide.png' },
        mesh: {
          kind: 'ring',
          hull: 'polygon',
          center: [irisWindow.x + irisWindow.w / 2, irisWindow.y + irisWindow.h / 2],
          inner: 0.45,
          control_bone: 'iris_aperture',
          bias: { axis_deg: 0, ramp: [4, 16] },
        },
      },
    ],
  });

  const rigPath = join(dir, 'overlay_probe.rig.json');
  writeJson(rigPath, {
    spec: 'rigc-rig/1',
    name: 'overlay_probe',
    note: 'Synthetic fixture for the selftest. A handle bone re-seats the whole formation; every other bone sits at its part window centre, and `iris_aperture` is the mesh control bone the manifest names.',
    invariants: { meshSlots: 3, meshTriangles: 80 },
    bones: [
      { name: 'root' },
      { name: 'panel', parent: 'root', x: 0, y: 0 },
      { name: 'stage', parent: 'panel', from: { slotWindow: 'stage' } },
      { name: 'lens_l', parent: 'panel', from: { slotWindow: 'lens_l' } },
      { name: 'lens_r', parent: 'panel', from: { slotWindow: 'lens_r' } },
      { name: 'iris', parent: 'panel', from: { slotWindow: 'iris' } },
      { name: 'iris_aperture', parent: 'iris', from: { meshCenter: 'iris' } },
    ],
    slots: [
      { name: 'stage', bone: 'stage' },
      { name: 'lens_l', bone: 'lens_l' },
      { name: 'lens_r', bone: 'lens_r' },
      { name: 'iris', bone: 'iris' },
    ],
  });

  const fade = (t: number, a: number, ease?: string): Record<string, unknown> => ({
    t,
    v: [1, 1, 1, a],
    ...(ease ? { ease } : {}),
  });
  const motionPath = join(dir, 'overlay_probe.motion.json');
  writeJson(motionPath, {
    spec: 'rigc-motion/1',
    archetype: 'overlay_probe',
    cut: 'overlay_probe',
    easings: { soft: [0.25, 0, 0.75, 1] },
    groups: { lenses: ['lens_l', 'lens_r'] },
    setup: {
      stage: { attachment: '00_stage' },
      lens_l: { attachment: 'lens_l_shut', color: [1, 1, 1, 0] },
      lens_r: { attachment: 'lens_r_shut', color: [1, 1, 1, 0] },
      iris: { attachment: null },
    },
    physics: {
      iris_settle: {
        bone: 'iris_aperture',
        x: 0.6,
        y: 0.6,
        inertia: 0.6,
        strength: 100,
        damping: 0.85,
        mass: 1,
        mix: 1,
      },
    },
    animations: {
      // `idle` keys nothing that drives a mesh: that is A15's whole subject, and
      // a fixture whose idle broke the rule could never show the rule holding.
      idle: {
        duration: 2,
        loop: true,
        tracks: [{ slot: 'stage', property: 'rgba', keys: [fade(0, 1), fade(2, 1)] }],
      },
      shut_once: {
        duration: 0.4,
        loop: false,
        tracks: [{ group: 'lenses', property: 'rgba', keys: [fade(0, 0, 'soft'), fade(0.2, 1, 'soft'), fade(0.4, 0)] }],
      },
      shut_auto: {
        duration: 3,
        loop: true,
        tracks: [{ group: 'lenses', property: 'rgba', keys: [fade(0, 0), fade(1.4, 1), fade(1.6, 0), fade(3, 0)] }],
      },
      cycle: {
        duration: 1,
        loop: true,
        tracks: [
          {
            slot: 'iris',
            property: 'attachment',
            keys: [
              { t: 0, v: 'iris_open' },
              { t: 0.5, v: 'iris_wide' },
              { t: 1, v: 'iris_open' },
            ],
          },
        ],
      },
    },
  });

  return { rig: 'overlay_probe', dir, rigPath, motionPath, manifestPath, outDir: join(dir, 'spine') };
}

// ---------------------------------------------------------------------------
// articulated_probe — the rig both remaining fixtures compile against
// ---------------------------------------------------------------------------

const ARTICULATED_ANCHORS: Record<string, number[]> = {
  cam: [240, 135],
  stage: [240, 135],
  mass: [233, 175],
  mass_a: [212, 169, 195],
  mass_b: [255, 180, 15],
  axis: [158, 110],
  plunger: [230, 130],
  plunger_tip: [155, 110],
  rim: [158, 110],
  rim_grip_a: [168, 121, 45],
  rim_grip_b: [147, 121, 135],
  rim_grip_c: [147, 100, 225],
  rim_grip_d: [168, 100, 315],
  emitter: [158, 110],
  trail_a: [158, 132],
  trail_b: [158, 154],
  trail_c: [158, 176],
};

/** Screen degrees, y down. The compiler negates it into Spine's y-up CCW. */
const ARTICULATED_AXIS = { deg: 195, unit: [-0.9659, -0.2588] };

/**
 * The bone tree and slot table both articulated fixtures share.
 *
 * ⭐ The axis bone is the point of the whole formation. Its setup rotation
 * carries the direction of travel, so everything under it moves with a
 * translateX and one number re-aims the entire animation at a cut framed from
 * somewhere else. `invariants` is where that fact — and the forbidden parentage,
 * and the bone the mass hangs on — is written down, because the emitted skeleton
 * has nowhere to say any of it.
 */
function writeArticulatedRig(dir: string): string {
  const rigPath = join(dir, 'articulated_probe.rig.json');
  writeJson(rigPath, {
    spec: 'rigc-rig/1',
    name: 'articulated_probe',
    note: 'Synthetic fixture for the selftest. Nothing here is cut-specific: every position comes from the manifest anchors and the direction of travel from its axis angle, which is what lets one rig serve both articulated fixtures.',
    invariants: {
      meshSlots: 3,
      meshTriangles: 80,
      axisBone: 'axis',
      massBone: 'mass',
      detached: [
        {
          bone: 'emitter',
          notUnder: 'plunger',
          why: 'what the emitter releases stays where it was released and takes gravity; parented to the moving part it would be dragged along with every stroke',
        },
      ],
    },
    bones: [
      { name: 'root' },
      { name: 'cam', parent: 'root', from: { anchor: 'cam' } },
      { name: 'stage', parent: 'cam', from: { anchor: 'stage' } },
      { name: 'mass', parent: 'cam', from: { anchor: 'mass' } },
      { name: 'mass_a', parent: 'mass', from: { anchor: 'mass_a', rotation: 'anchor' } },
      { name: 'mass_b', parent: 'mass', from: { anchor: 'mass_b', rotation: 'anchor' } },
      { name: 'axis', parent: 'cam', from: { anchor: 'axis', rotation: 'axis' } },
      { name: 'plunger', parent: 'axis', from: { anchor: 'plunger' } },
      { name: 'plunger_tip', parent: 'plunger', from: { anchor: 'plunger_tip' } },
      { name: 'rim', parent: 'axis', from: { anchor: 'rim' } },
      { name: 'rim_grip_a', parent: 'rim', from: { anchor: 'rim_grip_a', rotation: 'anchor' } },
      { name: 'rim_grip_b', parent: 'rim', from: { anchor: 'rim_grip_b', rotation: 'anchor' } },
      { name: 'rim_grip_c', parent: 'rim', from: { anchor: 'rim_grip_c', rotation: 'anchor' } },
      { name: 'rim_grip_d', parent: 'rim', from: { anchor: 'rim_grip_d', rotation: 'anchor' } },
      { name: 'emitter', parent: 'axis', from: { anchor: 'emitter' } },
      { name: 'trail_a', parent: 'emitter', from: { anchor: 'trail_a' } },
      { name: 'trail_b', parent: 'trail_a', from: { anchor: 'trail_b' } },
      { name: 'trail_c', parent: 'trail_b', from: { anchor: 'trail_c' } },
    ],
    // The array order IS the draw order, and `collar` sitting after `plunger` is
    // the adjacency the whole illusion rests on: the moving part has to be hidden
    // where it enters. `near` and `grade` are declared and filled by no fixture,
    // which is legitimate — a slot table fixes where a slot will sit when a cut
    // does carry it.
    slots: [
      { name: 'stage', bone: 'stage' },
      { name: 'mass_pad', bone: 'mass' },
      { name: 'plunger', bone: 'plunger' },
      { name: 'plunger_blur', bone: 'plunger' },
      { name: 'collar', bone: 'rim' },
      { name: 'trail', bone: 'emitter' },
      { name: 'pool', bone: 'rim' },
      { name: 'near', bone: 'mass' },
      { name: 'grade', bone: 'cam' },
    ],
  });
  return rigPath;
}

/**
 * The full articulated cut: two ring meshes, a ribbon on a bone chain, and a
 * measured contact ceiling.
 *
 * 🎯 `contact_depth` is 66 and the deepest key its motion spec asks for is 57, so
 * the smallest whole-pixel edit that crosses the ceiling is +10 — which is what
 * the mutant that drives past it claims, and the claim is only checkable because
 * the gap is stated here.
 */
export function articulatedFixture(): Fixture {
  const dir = makeDir('articulated_probe');
  const rigPath = writeArticulatedRig(dir);

  writePlate(join(dir, 'plates', '00_stage.png'), 480, 270, 'stage', true);
  writePlate(join(dir, 'plates', '04_mass_pad.png'), 130, 90, 'mass pad');
  writePlate(join(dir, 'plates', '01_plunger.png'), 200, 80, 'plunger');
  writePlate(join(dir, 'plates', '01b_plunger_blur.png'), 200, 80, 'blur');
  writePlate(join(dir, 'plates', '02_collar.png'), 105, 105, 'collar');
  writePlate(join(dir, 'plates', '03_trail.png'), 30, 105, 'trail');
  writePlate(join(dir, 'plates', '05_pool.png'), 75, 28, 'pool');

  const manifestPath = join(dir, 'manifest.json');
  writeJson(manifestPath, {
    schema: 'rigc-fixture/articulated/1',
    archetype: 'articulated_probe',
    note: 'Synthetic. Every plate is a generated checkerboard; this fixture proves rig mechanics and nothing about appearance.',
    crop: { x: 0, y: 0, w: 480, h: 270, resample: 'none' },
    base: 'plates/00_stage.png',
    insertion: [158, 110],
    axis: ARTICULATED_AXIS,
    stroke: { amplitude: 30, extension: 190, contact_depth: 66 },
    anchors: ARTICULATED_ANCHORS,
    parts: [
      { slot: 'stage', draw_order: 0, image: 'plates/00_stage.png', offset: [0, 0], size: [480, 270] },
      {
        slot: 'mass_pad',
        draw_order: 1,
        image: 'plates/04_mass_pad.png',
        offset: [168, 130],
        size: [130, 90],
        polygon: octagon(168, 130, 130, 90, 18),
        mesh: {
          kind: 'ring',
          hull: 'polygon',
          center: [233, 175],
          inner: 0.5,
          control_bones: ['mass_a', 'mass_b'],
        },
      },
      { slot: 'plunger', draw_order: 2, image: 'plates/01_plunger.png', offset: [130, 90], size: [200, 80] },
      { slot: 'plunger_blur', draw_order: 3, image: 'plates/01b_plunger_blur.png', offset: [130, 90], size: [200, 80] },
      {
        slot: 'collar',
        draw_order: 4,
        image: 'plates/02_collar.png',
        offset: [105, 58],
        size: [105, 105],
        polygon: octagon(105, 58, 105, 105, 22),
        mesh: {
          kind: 'ring',
          hull: 'polygon',
          center: [158, 110],
          inner: 0.47,
          control_bones: ['rim_grip_a', 'rim_grip_b', 'rim_grip_c', 'rim_grip_d'],
        },
      },
      {
        slot: 'trail',
        draw_order: 5,
        image: 'plates/03_trail.png',
        offset: [143, 110],
        size: [30, 105],
        mesh: { kind: 'ribbon', rows: 8, chain: ['trail_a', 'trail_b', 'trail_c'] },
      },
      { slot: 'pool', draw_order: 6, image: 'plates/05_pool.png', offset: [120, 207], size: [75, 28] },
    ],
  });

  const motionPath = join(dir, 'articulated_probe.motion.json');
  writeJson(motionPath, {
    spec: 'rigc-motion/1',
    archetype: 'articulated_probe',
    cut: 'articulated_probe',
    easings: { drive: [0.4, 0, 0.2, 1] },
    setup: {
      stage: { attachment: '00_stage' },
      mass_pad: { attachment: '04_mass_pad' },
      plunger: { attachment: '01_plunger' },
      plunger_blur: { attachment: null },
      collar: { attachment: '02_collar' },
      trail: { attachment: '03_trail', color: [1, 1, 1, 0] },
      pool: { attachment: null },
    },
    physics: {
      mass_a_settle: { bone: 'mass_a', x: 0.5, y: 0.5, inertia: 0.55, strength: 90, damping: 0.8, mass: 1, mix: 1 },
      rim_a_settle: { bone: 'rim_grip_a', x: 0.4, y: 0.4, inertia: 0.6, strength: 110, damping: 0.75, mass: 1, mix: 1 },
      trail_a_hang: {
        bone: 'trail_a',
        x: 0.8,
        y: 0.8,
        inertia: 0.4,
        strength: 60,
        damping: 0.7,
        mass: 1,
        gravity: 60,
        mix: 1,
      },
    },
    animations: {
      // Keys `cam`, which drives no mesh — see A15. The bones that do (`mass_*`,
      // `rim_grip_*`, `trail_*`) are driven by physics and never by idle keys.
      idle: {
        duration: 2,
        loop: true,
        tracks: [
          {
            bone: 'cam',
            property: 'translate',
            keys: [
              { t: 0, v: [0, 0] },
              { t: 1, v: [0, 1] },
              { t: 2, v: [0, 0] },
            ],
          },
        ],
      },
      advance_slow: {
        duration: 1.2,
        loop: true,
        tracks: [
          {
            bone: 'plunger',
            property: 'translate',
            keys: [
              { t: 0, v: [0, 0] },
              { t: 0.6, v: [57, 0], ease: 'drive' },
              { t: 1.2, v: [0, 0] },
            ],
          },
          {
            // Legal here, and only here: this fixture declares no containment
            // ceiling, so nothing was measured on an undeformed contour for a
            // scale key to invalidate. The same key on the contained fixture is a
            // defect, which is exactly what one of its mutants asserts.
            bone: 'plunger',
            property: 'scale',
            keys: [
              { t: 0, v: [1, 1] },
              { t: 0.2, v: [1.04, 0.97] },
              { t: 0.8, v: [1, 1] },
            ],
          },
        ],
      },
      advance_fast: {
        duration: 0.5,
        loop: true,
        tracks: [
          {
            bone: 'plunger',
            property: 'translate',
            keys: [
              { t: 0, v: [0, 0] },
              { t: 0.25, v: [57, 0], ease: 'drive' },
              { t: 0.5, v: [0, 0] },
            ],
          },
        ],
      },
    },
  });

  return { rig: 'articulated_probe', dir, rigPath, motionPath, manifestPath, outDir: join(dir, 'spine') };
}

/**
 * The same rig, three plates, and the OTHER ceiling.
 *
 * 🎯 `cap_containment_ceiling` is 96 against a deepest key of 54, so +43 is the
 * smallest whole-pixel edit that crosses it and +42 is not. It declares no
 * contact depth at all — two plates cut from one piece of art are adjacent at
 * rest and never "meet" — which is what makes this a fixture rather than a
 * duplicate: on the other two, the containment assertion has nothing to look at.
 *
 * It also renames a slot. The manifest calls the occluding part `shroud` and maps
 * it onto the rig's `collar` with `rig_slot`, so the join that resolves the two
 * gets exercised by something.
 */
export function containedFixture(): Fixture {
  const dir = makeDir('contained_probe');
  const rigPath = writeArticulatedRig(dir);

  writePlate(join(dir, 'plates', '00_stage.png'), 480, 270, 'stage', true);
  writePlate(join(dir, 'plates', '01_plunger.png'), 200, 80, 'plunger');
  writePlate(join(dir, 'plates', '02_shroud.png'), 105, 105, 'shroud');

  const manifestPath = join(dir, 'manifest.json');
  writeJson(manifestPath, {
    schema: 'rigc-fixture/contained/1',
    archetype: 'articulated_probe',
    note: 'Synthetic. Three plates, no meshes, and the containment ceiling the other fixtures do not declare.',
    crop: { x: 0, y: 0, w: 480, h: 270, resample: 'none' },
    base: 'plates/00_stage.png',
    insertion: [158, 110],
    axis: ARTICULATED_AXIS,
    stroke: { amplitude: 28, extension: 190, cap_containment_ceiling: 96 },
    anchors: ARTICULATED_ANCHORS,
    parts: [
      { slot: 'stage', draw_order: 0, image: 'plates/00_stage.png', offset: [0, 0], size: [480, 270] },
      { slot: 'plunger', draw_order: 2, image: 'plates/01_plunger.png', offset: [130, 90], size: [200, 80] },
      {
        slot: 'shroud',
        rig_slot: 'collar',
        draw_order: 4,
        image: 'plates/02_shroud.png',
        offset: [105, 58],
        size: [105, 105],
      },
    ],
  });

  const motionPath = join(dir, 'contained_probe.motion.json');
  writeJson(motionPath, {
    spec: 'rigc-motion/1',
    archetype: 'articulated_probe',
    cut: 'contained_probe',
    easings: { drive: [0.4, 0, 0.2, 1] },
    setup: {
      stage: { attachment: '00_stage' },
      plunger: { attachment: '01_plunger' },
      collar: { attachment: '02_shroud' },
    },
    animations: {
      idle: {
        duration: 2,
        loop: true,
        tracks: [
          {
            bone: 'cam',
            property: 'translate',
            keys: [
              { t: 0, v: [0, 0] },
              { t: 1, v: [0, 1] },
              { t: 2, v: [0, 0] },
            ],
          },
        ],
      },
      advance_slow: {
        duration: 1.2,
        loop: true,
        tracks: [
          {
            bone: 'plunger',
            property: 'translate',
            keys: [
              { t: 0, v: [0, 0] },
              { t: 0.6, v: [54, 0], ease: 'drive' },
              { t: 1.2, v: [0, 0] },
            ],
          },
        ],
      },
      advance_fast: {
        duration: 0.5,
        loop: true,
        tracks: [
          {
            bone: 'plunger',
            property: 'translate',
            keys: [
              { t: 0, v: [0, 0] },
              { t: 0.25, v: [54, 0], ease: 'drive' },
              { t: 0.5, v: [0, 0] },
            ],
          },
        ],
      },
    },
  });

  return { rig: 'articulated_probe', dir, rigPath, motionPath, manifestPath, outDir: join(dir, 'spine') };
}
