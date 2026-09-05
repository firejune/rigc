/**
 * Draws every part PNG, depth sheet and mask this example needs.
 *
 *     bun gallery/look/make_parts.ts
 *
 * The PNGs are committed, so nobody needs to run this to build or render the
 * example — it is here so the art is reproducible. The character half needs
 * `rsvg-convert` (librsvg) on PATH, the gallery's one art-time prerequisite;
 * the measurement half needs nothing, because it is arithmetic.
 *
 * ## The character is Vela, and she is imported rather than re-drawn
 *
 * `../portrait/make_parts.ts` draws her, and this file calls that function. The
 * gallery's rule is **one drawing per character** ([`../README.md`](../README.md)):
 * `portrait` already defended a second cast member, and drawing a third face
 * here would break the rule this example has no reason to bend. The two
 * examples are the same subject on two different mechanisms — `portrait` turns
 * her head on a **timeline**, `look` turns it on a **value** — so sharing the
 * face is the whole point of the pairing.
 *
 * The parts list here is a **subset**: no lids, because nothing blinks. The
 * gallery's rule is that only the parts a rig names are in `parts/`.
 *
 * ## What this file adds
 *
 * 1. **Two gauges**, drawn here and nowhere else. They are the value made
 *    visible: the rendered animation turns the needles, and the head follows
 *    the number the needle is pointing at.
 * 2. **Three depth sheets and one soft mask.** These are not art — nothing
 *    draws them, they are never packed into the atlas, and rigc reads them at
 *    compile time the way it reads a PNG's header (AUTHORING §3.4). They are
 *    written pixel by pixel from a closed form rather than rasterised from SVG,
 *    for the reason [FACE §2.2](../../docs/FACE.md) gives: **the largest turn a
 *    part admits is the reciprocal of the steepest slope anywhere in its
 *    sheet**, so the slope is the thing being authored and it has to be
 *    something this file can state rather than something a rasteriser happened
 *    to produce.
 *
 * ## Scale
 *
 * `ART_SCALE` is **1**, as in `portrait`: every part is rasterised at the
 * nominal size its outline weight was drawn for, and the sheets are written at
 * the part's own pixel size, which is what rigc requires of them.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { encodePng } from '../../tools/plate.ts';
import { FUR_LT, GROUND, INK, METAL, METAL_DK, SUN, SW, TEAL_DK, part, rasterise } from '../rigby.ts';
import type { Part } from '../rigby.ts';
import { velaParts } from '../portrait/make_parts.ts';
import { readStage } from '../stage.ts';

/** Rasterisation scale for every drawn part in this example — see the header. */
const ART_SCALE = 1;

/** The parts of Vela this rig names. `lid_l`/`lid_r` are hers and are not here. */
const WANTED = new Set([
  'hair_back',
  'neck',
  'torso',
  'choker',
  'head',
  'eye_l',
  'eye_r',
  'iris_l',
  'iris_r',
  'spark_l',
  'spark_r',
  'brow_l',
  'brow_r',
  'nose',
  'mouth',
  'hair_bang',
  'hair_lock_l',
  'hair_lock_r',
  'ahoge',
]);

// ---------------------------------------------------------------------------
// the depth sheets
// ---------------------------------------------------------------------------

/**
 * A raised cosine: 1 at `s = 0`, 0 at `|s| >= 1`, and **flat at both ends**.
 *
 * 🚨 This shape rather than a dome, and the difference is the whole reason the
 * sheets in this file are generated from a formula.
 * [FACE §2.2](../../docs/FACE.md) measures both over a 1,300x range of lattice
 * densities: a dome (`z = Z*sqrt(1 - r^2)`) is **vertical at its rim**, so the
 * largest turn it admits falls from 62 deg at 5x5 to 14 deg at 181x181 and
 * keeps going — the angle is a property of how finely you happened to mesh it.
 * A raised cosine holds 63-64 deg at every one of those densities, because its
 * slope is bounded by `Z*pi/(2*R)` everywhere and `tan t_max = 1/max|dz/du|`
 * has no mesh term in it.
 *
 * ⇒ Everything below is a sum of these, and every steep place in the result is
 * one this file chose the width and height of.
 */
const cosBump = (s: number): number => (Math.abs(s) >= 1 ? 0 : (1 + Math.cos(Math.PI * s)) / 2);

/** A depth field over a part window, in the part's own pixels, y down. */
type Field = (u: number, v: number) => number;

/**
 * A **plateau with cosine shoulders**: 1 over `|s| <= flat`, 0 at `|s| >= 1`.
 *
 * A face is not a bump — it is broadly flat across the front and turns away at
 * its edges — and this is that shape with the slope still bounded, by
 * `Z*pi/(2*(1-flat))` in `s` units. 🚨 It also does the edit
 * [FACE §2.2](../../docs/FACE.md) names as the one that buys the angle back on
 * a sheet traced off a render: **z reaches its floor BEFORE the outline rather
 * than at it**, which is what {@link SKULL_RU} at 152 against the drawing's own
 * ink edge at 154.5 is doing.
 */
const ridge = (s: number, flat: number): number => {
  const a = Math.abs(s);
  if (a <= flat) return 1;
  if (a >= 1) return 0;
  return cosBump((a - flat) / (1 - flat));
};

/**
 * The face's surface: a broad skull, and a nose ridge standing proud of it.
 *
 * `u`/`v` are pixels from the plate's centre, y down. The numbers are decisions
 * about a shape the drawing only implies, which is what a depth map always is
 * (AUTHORING §3.4: `zScale` is authored, never measured):
 *
 * | | what it says |
 * | --- | --- |
 * | `SKULL_Z` 150 | the front of the face stands 150 units in front of the plane its silhouette sits in |
 * | `SKULL_RU` 152, flat to 40 | z is constant across the middle 80 px of the face and reaches its floor 2.5 px inside the drawing's own outline. Shoulder slope `150*pi/(2*112)` = 2.10 |
 * | `SKULL_RV` 186, flat to 80 | the same up and down: a forehead is not a slope |
 * | `NOSE_Z` 44 | the nose tip stands 44 further forward again |
 * | `NOSE_RU` 22 | and the ridge is 44 px across. **This is the steepest thing on the sheet, so it is the number that sets the turn ceiling** — `44*pi/(2*22)` = 3.14 units of depth per pixel against the skull's 2.10 |
 * | `NOSE_V` 50 / `NOSE_RV` 90 | the ridge runs from the brow to below the mouth, centred 50 px below the plate's middle |
 *
 * ⭐ Those last two rows are the example's whole argument about angle. A face's
 * fold ceiling is **not** set by the skull: a bounded shoulder over 112 px
 * admits 25 deg, past anything this construction can draw. It is set by the
 * smallest, steepest feature the lattice can see, and on a face that is the
 * nose. Flattening the nose would buy angle and spend the one depth cue that
 * survives foreshortening.
 */
const SKULL_Z = 150;
const SKULL_RU = 152;
const SKULL_FLAT_U = 40 / 152;
const SKULL_RV = 186;
const SKULL_FLAT_V = 80 / 186;
const NOSE_Z = 44;
const NOSE_RU = 22;
const NOSE_V = 50;
const NOSE_RV = 90;

const faceField: Field = (u, v) =>
  SKULL_Z * ridge(u / SKULL_RU, SKULL_FLAT_U) * ridge(v / SKULL_RV, SKULL_FLAT_V) +
  NOSE_Z * cosBump(u / NOSE_RU) * cosBump((v - NOSE_V) / NOSE_RV);

/**
 * The face sheet's white point, in the attachment's own units.
 *
 * `SKULL_Z + NOSE_Z` exactly: the plateau means the skull is still at its full
 * 150 where the nose ridge peaks, so the field's maximum is a number this file
 * states rather than one it has to search for, and the sheet's whitest pixel is
 * level 255. Nothing is normalised — a depth printed by this script is a number
 * in these units, which is what lets `motion.json`'s bone depths be read
 * straight off the same field.
 */
const FACE_Z_SCALE = SKULL_Z + NOSE_Z;

/**
 * A sidelock's surface — and the reason its ceiling is **asymmetric**.
 *
 * A strand of hair hanging beside the face is a tube seen from the front: its
 * OUTER edge is the silhouette, where the surface curves away over a few
 * pixels, and its INNER edge blends into the cheek behind it over the whole
 * rest of the plate. So the crest sits {@link LOCK_CREST} px in from the outer
 * edge and the two halves are two different cosines:
 *
 *     outer half   42 units over 18 px   =>  slope 3.67, ceiling ~15 deg
 *     inner half   42 units over 66 px   =>  slope 1.00, ceiling ~45 deg
 *
 * ⇒ Its steep side folds well INSIDE the face's own ceiling, and that is the
 * point rather than an accident: the sheet says the lock cannot take the turn,
 * so the rig has to take the lock off the screen before the turn gets there.
 *
 * ⭐ **And the steep half is the one that folds on the side the head is turning
 * away from.** A yaw sends `x' = x*cos t - z*sin t`, so two neighbouring
 * vertices swap when `tan t >= du/dz` — at POSITIVE t where depth increases
 * with u, at negative t where it decreases. On the viewer's-left lock the outer
 * edge is on the left, depth increases rightward across it, and it folds at
 * positive t: exactly the direction in which that lock has swung behind the jaw
 * and is not being drawn. The mirror lock is the mirror statement.
 *
 * `LOCK_FLOOR` is where the strand's own silhouette sits in the head's depth,
 * not zero: the lock hangs in front of the cheek, and a sheet whose black meant
 * "on the yaw axis" would put it back at the widest part of the skull.
 */
const LOCK_CREST = 18;
const LOCK_Z = 42;
const LOCK_FLOOR = 22;

/** `side: -1` puts the steep edge on the left (the viewer's-left lock), `+1` on the right. */
function lockField(width: number, side: -1 | 1): Field {
  return (u) => {
    // u is measured from the plate centre; convert to a distance from the outer edge.
    const fromOuter = side < 0 ? u + width / 2 : width / 2 - u;
    const d = fromOuter - LOCK_CREST;
    const reach = d < 0 ? LOCK_CREST : width - LOCK_CREST;
    return LOCK_FLOOR + LOCK_Z * cosBump(d / reach);
  };
}

/** A sidelock's white point: the crest of the strand, `LOCK_FLOOR + LOCK_Z`. */
const LOCK_Z_SCALE = LOCK_FLOOR + LOCK_Z;

/**
 * Write a greyscale sheet: `level = round(255 * z / zScale)`, alpha 255 everywhere.
 *
 * 🚨 **Opaque everywhere on purpose.** rigc refuses a sheet that does not cover
 * every texel a mesh vertex's bilinear tap touches, and a grid spans the whole
 * part window including the corners the art leaves transparent (AUTHORING §3.4).
 * A sheet cut to the art's own alpha would give those corner vertices the
 * background depth and fold them away from the turn, with correct arithmetic
 * all the way down — so these sheets are cut to the WINDOW.
 *
 * Returns the sheet's own peak, so the caller can print what it wrote.
 */
function writeSheet(path: string, width: number, height: number, field: Field, zScale: number): number {
  const rgba = new Uint8Array(width * height * 4);
  let peak = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const z = field(x + 0.5 - width / 2, y + 0.5 - height / 2);
      if (z > peak) peak = z;
      const level = Math.max(0, Math.min(255, Math.round((255 * z) / zScale)));
      const i = (y * width + x) * 4;
      rgba[i] = level;
      rgba[i + 1] = level;
      rgba[i + 2] = level;
      rgba[i + 3] = 255;
    }
  }
  writeFileSync(path, encodePng(width, height, rgba));
  return peak;
}

/**
 * The cowlick's soft mask — **painted, and the falloff is painted too**.
 *
 * The level IS the weight: black stays on the slot bone, white is carried
 * outright by the physics bone, and what is between is between. AUTHORING §3.4
 * records why this is a mask and not a depth threshold, in one sentence worth
 * repeating: the most prominent thing on a face is the nose, and a nose does
 * not wobble. Softness and prominence are different properties of a drawing,
 * and rigc will not guess one from the other.
 *
 * Here the base of the cowlick is held and the tip is free, with the handover
 * across the middle third of the plate. `1 - v` rather than a step, because a
 * step is a crease.
 */
function writeAhogeMask(path: string, width: number, height: number): { carried: number; ramped: number } {
  const rgba = new Uint8Array(width * height * 4);
  let carried = 0;
  let ramped = 0;
  for (let y = 0; y < height; y++) {
    // 0 at the top of the plate (the tip) and 1 at the bottom (the base).
    const down = (y + 0.5) / height;
    const w = down <= 0.28 ? 1 : down >= 0.66 ? 0 : (0.66 - down) / (0.66 - 0.28);
    const level = Math.round(255 * w);
    if (level === 255) carried++;
    else if (level > 0) ramped++;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      rgba[i] = level;
      rgba[i + 1] = level;
      rgba[i + 2] = level;
      rgba[i + 3] = 255;
    }
  }
  writeFileSync(path, encodePng(width, height, rgba));
  return { carried, ramped };
}

// ---------------------------------------------------------------------------
// the gauges — the value, made visible
// ---------------------------------------------------------------------------

/** The gauge's nominal size. Both dials share it; only their scales differ. */
const DIAL_W = 150;
const NEEDLE_W = 40;
const NEEDLE_H = 140;
/** Where the needle's pivot sits in its own plate, y down. `rig.json` states the offset. */
const NEEDLE_PIVOT_Y = 110;
/** How far the tip reaches from the pivot. Inside the gauge's tick ring at `DIAL_W/2 - 10`. */
const NEEDLE_REACH = 62;
/** White, for the needle's highlight. Not a palette hue — it is paper. */
const PAPER = '#FFFFFF';

/**
 * A gauge face, marked with **the range its own slider declares**.
 *
 * 🚨 The tick angles are read out of `rig.json`, not typed here. A dial marked
 * with one range while its constraint maps another is a picture that lies about
 * the rig it is standing next to, and both files would be internally
 * consistent — the same defect `../stage.ts` exists to prevent for bone
 * positions.
 */
function dialPart(name: string, extent: number, accent: string): Part {
  const c = DIAL_W / 2;
  // 🚨 The mirror is the whole correctness of this drawing. SVG is y-DOWN and a
  // Spine bone's positive rotation is counter-CLOCKWISE in a y-UP world, so a
  // needle at +19 deg points up and to the LEFT. A face drawn with its "+" tick
  // at the SVG-positive angle would put the two on opposite sides and read as a
  // gauge running backwards — with nothing anywhere to say so, because the
  // drawing and the constraint are each internally consistent.
  const at = (deg: number, r: number): [number, number] => {
    const a = ((-deg - 90) * Math.PI) / 180;
    return [c + r * Math.cos(a), c + r * Math.sin(a)];
  };
  const tick = (deg: number, len: number, w: number, opacity: number): string => {
    const [x0, y0] = at(deg, c - 10 - len);
    const [x1, y1] = at(deg, c - 10);
    return (
      `<path d="M${x0.toFixed(2)} ${y0.toFixed(2)} L${x1.toFixed(2)} ${y1.toFixed(2)}" ` +
      `stroke="${FUR_LT}" stroke-width="${w}" stroke-linecap="round" opacity="${opacity}"/>`
    );
  };
  // The travelled arc, as a dim TRACK rather than in the accent: the accent is
  // the needle's, so that what moves and what is printed on the face cannot be
  // mistaken for each other at a glance. Drawn from +extent (up-left) clockwise
  // to -extent (up-right), which is the minor arc over the top.
  const [ax0, ay0] = at(extent, c - 20);
  const [ax1, ay1] = at(-extent, c - 20);
  const [dx, dy] = at(0, c - 20);
  return part(
    name,
    DIAL_W,
    DIAL_W,
    `
  <circle cx="${c}" cy="${c}" r="${c - 4}" fill="${METAL_DK}" stroke="${INK}" stroke-width="${SW}"/>
  <circle cx="${c}" cy="${c}" r="${c - 15}" fill="${GROUND}" opacity="0.62"/>
  <path d="M${ax0.toFixed(2)} ${ay0.toFixed(2)} A ${c - 20} ${c - 20} 0 0 1 ${ax1.toFixed(2)} ${ay1.toFixed(2)}"
        fill="none" stroke="${METAL}" stroke-width="12" stroke-linecap="round" opacity="0.32"/>
  ${tick(-extent, 20, 9, 0.95)}
  ${tick(extent, 20, 9, 0.95)}
  <circle cx="${dx.toFixed(2)}" cy="${dy.toFixed(2)}" r="5" fill="${FUR_LT}" opacity="0.6"/>
  <circle cx="${c}" cy="${c}" r="10" fill="${METAL}" stroke="${INK}" stroke-width="4"/>
  <circle cx="${c}" cy="${c}" r="${c - 4}" fill="none" stroke="${accent}" stroke-width="5" opacity="0.6"/>
`,
  );
}

/**
 * The needle. Its pivot is at {@link NEEDLE_PIVOT_Y}, so the plate is offset, not the art.
 *
 * Its tip stops at radius {@link NEEDLE_REACH} from the pivot, which is inside
 * the gauge's own tick ring: a needle that overshot its bezel would be pointing
 * at nothing, and the whole job of the drawing is that the reader can see it
 * land on the end tick at each extreme of the range.
 */
function needlePart(name: string, accent: string): Part {
  const c = NEEDLE_W / 2;
  const tip = NEEDLE_PIVOT_Y - NEEDLE_REACH;
  return part(
    name,
    NEEDLE_W,
    NEEDLE_H,
    `
  <path d="M${c} ${tip} L${c + 11} ${NEEDLE_PIVOT_Y + 18} L${c - 11} ${NEEDLE_PIVOT_Y + 18} Z"
        fill="${accent}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <circle cx="${c}" cy="${tip + 4}" r="4" fill="${PAPER}" opacity="0.75"/>
  <circle cx="${c}" cy="${NEEDLE_PIVOT_Y}" r="13" fill="${METAL}" stroke="${INK}" stroke-width="5"/>
`,
  );
}

/**
 * The stage plate — a vignette, and a well behind each gauge.
 *
 * Numbers are in plate pixels, y DOWN; {@link readStage}'s `imageY` is the one
 * place this file flips between that and Spine's world.
 */
function stagePlatePart(
  width: number,
  height: number,
  glow: { x: number; y: number; r: number },
  wells: Array<{ x: number; y: number }>,
): Part {
  return part(
    'plate',
    width,
    height,
    `
  <defs>
    <radialGradient id="halo" gradientUnits="userSpaceOnUse" cx="${glow.x}" cy="${glow.y}" r="${glow.r}">
      <stop offset="0"    stop-color="#41506B" stop-opacity="0.9"/>
      <stop offset="0.42" stop-color="#2C3646" stop-opacity="0.5"/>
      <stop offset="1"    stop-color="${GROUND}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="floorless" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.5"  stop-color="#000000" stop-opacity="0"/>
      <stop offset="1"    stop-color="#000000" stop-opacity="0.55"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="${GROUND}"/>
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#halo)"/>
  ${wells
    .map((w) => `<circle cx="${w.x}" cy="${w.y}" r="96" fill="#0F1319" opacity="0.55"/>`)
    .join('\n  ')}
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#floorless)"/>
`,
  );
}

// ---------------------------------------------------------------------------

/** The slice of `rig.json` this script reads, beyond what `readStage` reads. */
interface SliderRow {
  name: string;
  type?: string;
  bone?: string;
  from?: number;
  max?: number;
}

if (import.meta.main) {
  const HERE = new URL('.', import.meta.url).pathname;
  const OUT = join(HERE, 'parts');
  mkdirSync(OUT, { recursive: true });

  console.log(`character parts, from ../portrait (nominal x ${ART_SCALE}):`);
  const vela = velaParts().filter((p) => WANTED.has(p.name));
  const missing = [...WANTED].filter((name) => !vela.some((p) => p.name === name));
  if (missing.length > 0) throw new Error(`../portrait/make_parts.ts no longer draws: ${missing.join(', ')}`);
  await rasterise(vela, OUT, ART_SCALE);

  const rigPath = join(HERE, 'rig.json');
  const stage = readStage(rigPath);
  const rig = JSON.parse(await Bun.file(rigPath).text()) as {
    constraints?: SliderRow[];
    skins: { default: Record<string, Record<string, { image?: string }>> };
  };
  const sliders = (rig.constraints ?? []).filter((c) => c.type === 'slider');
  const extentOf = (name: string): number => {
    const row = sliders.find((s) => s.name === name);
    if (!row || typeof row.max !== 'number' || typeof row.from !== 'number') {
      throw new Error(`${rigPath} declares no slider "${name}" with a "from" and a "max" to mark the gauge from`);
    }
    if (row.max !== -row.from) throw new Error(`slider "${name}" is not symmetric: from ${row.from}, max ${row.max}`);
    return row.max;
  };
  const yawExtent = extentOf('yaw');
  const tiltExtent = extentOf('tilt');

  console.log('gauges (marked from rig.json\'s own slider ranges):');
  await rasterise(
    [
      dialPart('dial_yaw', yawExtent, SUN),
      needlePart('needle_yaw', SUN),
      dialPart('dial_tilt', tiltExtent, TEAL_DK),
      needlePart('needle_tilt', TEAL_DK),
    ],
    OUT,
    ART_SCALE,
  );

  const yawDial = stage.bone('yaw_dial');
  const tiltDial = stage.bone('tilt_dial');
  const head = stage.bone('head');
  console.log('stage plate (already at world scale):');
  await rasterise(
    [
      stagePlatePart(
        stage.width,
        stage.height,
        { x: head.x, y: stage.imageY(head.y), r: 470 },
        [
          { x: yawDial.x, y: stage.imageY(yawDial.y) },
          { x: tiltDial.x, y: stage.imageY(tiltDial.y) },
        ],
      ),
    ],
    OUT,
    1,
  );

  // --- the measurement half ------------------------------------------------
  //
  // Sizes come from the parts that were just written, so a sheet cannot be the
  // wrong size for the plate it describes — that is one of rigc's refusals, and
  // getting it from the drawing instead of from a literal is how it stays true.
  const sizeOf = (name: string): [number, number] => {
    const p = vela.find((q) => q.name === name);
    if (!p) throw new Error(`no part "${name}" to size a sheet against`);
    return [Math.round(p.w * ART_SCALE), Math.round(p.h * ART_SCALE)];
  };

  console.log('depth sheets and masks (written from a closed form, never rasterised):');
  const [fw, fh] = sizeOf('head');
  const facePeak = writeSheet(join(OUT, 'face_depth.png'), fw, fh, faceField, FACE_Z_SCALE);
  console.log(`  face_depth     ${fw}x${fh}  zScale ${FACE_Z_SCALE}  peak ${facePeak.toFixed(3)}`);

  const [lw, lh] = sizeOf('hair_lock_l');
  writeSheet(join(OUT, 'lock_l_depth.png'), lw, lh, lockField(lw, -1), LOCK_Z_SCALE);
  writeSheet(join(OUT, 'lock_r_depth.png'), lw, lh, lockField(lw, 1), LOCK_Z_SCALE);
  console.log(`  lock_?_depth   ${lw}x${lh}  zScale ${LOCK_Z_SCALE}  crest ${LOCK_FLOOR + LOCK_Z}, floor ${LOCK_FLOOR}`);

  const [aw, ah] = sizeOf('ahoge');
  const mask = writeAhogeMask(join(OUT, 'ahoge_soft.png'), aw, ah);
  console.log(`  ahoge_soft     ${aw}x${ah}  ${mask.carried} rows carried outright, ${mask.ramped} in the falloff`);

  // --- the depth table this rig's bone tracks are built on -----------------
  //
  // ⭐ The feature depths in `motion.json` are not guesses: they are THIS
  // sheet, sampled where each feature bone actually sits, plus a stated stand-
  // off. `portrait` had to invent its equivalents, because it had no surface to
  // read — a cylinder radius is one number and a face is not one number. Every
  // row below is `motion.json`'s `depth` for that member before the stand-off
  // in its own column, so a reader can check the two against each other.
  console.log('\nthe face sheet, sampled at each feature bone (head-local x, y -> z):');
  for (const name of ['faceshift', 'eye_l', 'eye_r', 'brow_l', 'brow_r', 'nose', 'mouth']) {
    const b = stage.bone(name);
    const x = b.x - head.x;
    const y = b.y - head.y;
    const z = faceField(x, -y);
    console.log(`  ${name.padEnd(10)} (${x.toFixed(0).padStart(4)}, ${y.toFixed(0).padStart(4)})  z = ${z.toFixed(2)}`);
  }
  // 🚨 The fringe is sampled where it HANGS, not where its bone sits. Its bone
  // is at the crown, y = 137, where the sheet has already fallen to 66 because
  // the plate is curving away there — and a fringe that took that number would
  // travel 24px less than the face under it and slide across the forehead. What
  // the plate is doing under the fringe is the forehead, so that is the sample.
  const FOREHEAD_Y = 100;
  console.log(
    `  forehead   (   0, ${String(FOREHEAD_Y).padStart(4)})  z = ${faceField(0, -FOREHEAD_Y).toFixed(2)}` +
      '   <- what "bang" reads, plus its own stand-off',
  );
}

export { faceField, lockField, cosBump, FACE_Z_SCALE, LOCK_Z_SCALE };
