/**
 * Draws every part PNG this example needs.
 *
 *     bun gallery/portrait/make_parts.ts
 *
 * The PNGs are committed, so nobody needs to run this to build or render the
 * example — it is here so the art is reproducible. It needs `rsvg-convert`
 * (librsvg) on PATH, which is the gallery's one art-time prerequisite.
 *
 * ## Why a second character lives here rather than in `../rigby.ts`
 *
 * The gallery shares one drawing of Rigby so that its examples read as shots of
 * one character. This example needs a face that sells **gaze** and a **head
 * turn**, and those two read off features Rigby does not have: a brow that
 * frames an iris, hair layers that lag behind the skull, and a cheek-to-jaw
 * silhouette to foreshorten. A muzzle points wherever the head points, so a
 * mascot's turn is a rotation and nothing else — which is the one thing this
 * example is not about.
 *
 * So **Vela** is drawn here, in Rigby's own palette and outline weight: his fur
 * tones are her skin, his scarf's teal is her hair, and the warm accent his
 * props use is her eyes. Nothing about her is a second art language, and
 * `../rigby.ts` still owns every colour and the rasteriser. The split follows
 * that file's own rule for optional parts — a drawing one example needs lives
 * with that example, because `rasterise(rigbyParts(), …)` writes its whole list
 * into every other example's `parts/`.
 *
 * ## Scale
 *
 * `ART_SCALE` is **1**: every part is rasterised at the nominal size its outline
 * weight was drawn for, and the two mesh tables in `rig.json` are stated in the
 * same unit — a column at `x = 162` is 162 of these pixels from the plate's
 * centre, and its uv is that offset over the plate's own 340.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  BLUSH,
  FUR,
  FUR_DK,
  FUR_LT,
  GROUND,
  INK,
  METAL,
  METAL_DK,
  SUN,
  SW,
  TEAL,
  TEAL_DK,
  WOOD_DK,
  part,
  rasterise,
} from '../rigby.ts';
import type { Part } from '../rigby.ts';
import { readStage } from '../stage.ts';

/** Rasterisation scale for every part in this example — see the header. */
const ART_SCALE = 1;

/** Whites: the sclera and an iris highlight. Not a palette hue — it is paper. */
const PAPER = '#FFFFFF';

// --- the head plate --------------------------------------------------------
//
// 🚨 The two numbers this drawing shares with `rig.json`'s mesh table are
// {@link HEAD_W} and {@link HEAD_H}: the grid's uvs are offsets over them, so a
// change here without a change there moves the texture under the mesh. The
// third shared number is the art's own half-width — the ink outline has to stay
// INSIDE the grid's outer columns at ±162, or the mesh clips the line off the
// face the way `squash`'s first ball lost its outline.

/** The head plate's nominal width. `rig.json`'s head uvs are stated over this. */
const HEAD_W = 340;
/** The head plate's nominal height. Ditto. */
const HEAD_H = 380;

/**
 * The face: a wide cranium tapering to a soft chin.
 *
 * Drawn as a path rather than an ellipse because the turn reads off the jaw. An
 * ellipse's silhouette carries no landmark, so its horizontal texture shift has
 * nothing to shift *against*; a cheek that narrows into a chin does.
 *
 * The leftmost ink lies at x = 20 − SW/2 = 15.5, which is 154.5 from the
 * plate's centre — 7.5px inside the mesh's outer column.
 */
const FACE = `
  <path d="M170 20 C 88 20, 20 86, 20 152 C 20 216, 58 288, 116 330
           C 136 346, 153 358, 170 358 C 187 358, 204 346, 224 330
           C 282 288, 320 216, 320 152 C 320 86, 252 20, 170 20 Z"
        fill="${FUR}" stroke="${INK}" stroke-width="${SW}"/>
  <path d="M34 168 C 40 232, 66 288, 106 322" fill="none" stroke="${FUR_DK}" stroke-width="13"
        stroke-linecap="round" opacity="0.42"/>
  <path d="M306 168 C 300 232, 274 288, 234 322" fill="none" stroke="${FUR_DK}" stroke-width="13"
        stroke-linecap="round" opacity="0.42"/>
  <ellipse cx="170" cy="302" rx="62" ry="34" fill="${FUR_LT}" opacity="0.32"/>
  <ellipse cx="76"  cy="242" rx="31" ry="18" fill="${BLUSH}" opacity="0.55"/>
  <ellipse cx="264" cy="242" rx="31" ry="18" fill="${BLUSH}" opacity="0.55"/>
  <path d="M124 222 C 132 214, 146 210, 156 212" fill="none" stroke="${FUR_DK}" stroke-width="7"
        stroke-linecap="round" opacity="0.3"/>
  <path d="M216 222 C 208 214, 194 210, 184 212" fill="none" stroke="${FUR_DK}" stroke-width="7"
        stroke-linecap="round" opacity="0.3"/>
`;

// --- the eye assembly ------------------------------------------------------
//
// Four parts per eye, and the split is what `gaze` and `turn` are made of:
// the socket holds still, the iris travels, the highlight travels LESS, and the
// lid sweeps down over all three. One drawing of an eye could not do any of it.

/**
 * The eye opening: white, an upper lash, a light lower rim.
 *
 * 🚨 **The lash's weight is the expression, and getting it wrong cost an
 * iteration.** The first version stroked the whole upper arc at one width and
 * put a tick at BOTH corners, which loads ink at the inner corner — and two
 * eyes heavy at the nose read as a scowl no matter what the brows do. The lash
 * here is two strokes: a light one over the whole arc and a heavy one over the
 * outer half only, with one tick at the outer corner. `EYE` is drawn for the
 * viewer's-RIGHT eye, so "outer" is this window's right-hand side and the
 * mirror in {@link velaParts} does the other one.
 */
const EYE = `
  <path d="M10 48 C 10 22, 28 8, 46 8 C 66 8, 82 22, 82 48
           C 82 68, 66 78, 46 78 C 26 78, 10 68, 10 48 Z" fill="${PAPER}"/>
  <path d="M10 48 C 10 22, 28 8, 46 8 C 66 8, 82 22, 82 48" fill="none" stroke="${INK}"
        stroke-width="9" stroke-linecap="round"/>
  <path d="M52 9 C 68 13, 80 27, 82 48" fill="none" stroke="${INK}"
        stroke-width="15" stroke-linecap="round"/>
  <path d="M11 52 C 14 68, 28 78, 46 78 C 64 78, 78 69, 81 54" fill="none" stroke="${INK}"
        stroke-width="5" stroke-linecap="round" opacity="0.62"/>
  <path d="M80 24 l 9 -9" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
  <ellipse cx="58" cy="22" rx="22" ry="9" fill="${INK}" opacity="0.12"/>
`;

/**
 * The iris — the part `gaze` moves.
 *
 * 🚨 **Sized to clear the socket at the gaze extremes rather than to fill it**,
 * because the eye carries no `clipping` attachment and therefore nothing trims
 * an iris that walks off its own white. Spine has one (AUTHORING §3.4) and it
 * would lift this ceiling — but `A11_NO_CLIPPING_ATTACHMENTS` refuses one under
 * the `spine-html` profile, since that renderer skips clips silently, so a
 * gallery example that reached for it would only build on one of the two
 * profiles the gallery bar asks for. The arithmetic instead:
 *
 *     iris outer radius   26.5 + 4/2 (the ink ring)  =  28.5
 *     opening half-width  (82 - 10) / 2              =  36     => |dx| <= 7.5
 *     opening half-height (78 -  8) / 2              =  35     => |dy| <= 6.5
 *
 * `gaze` keys 7 and -3. The first draft keyed 9, which is 1.5 past the ceiling,
 * and at 1:1 the iris's ink ring crossed the lash on the far side of the flick —
 * visible only on a 1:1 render of the extreme frame, never on a contact sheet.
 */
const IRIS = `
  <circle cx="29" cy="29" r="26.5" fill="${SUN}"/>
  <circle cx="29" cy="29" r="24"   fill="none" stroke="${WOOD_DK}" stroke-width="6" opacity="0.85"/>
  <ellipse cx="29" cy="39" rx="16" ry="10" fill="${FUR_LT}" opacity="0.55"/>
  <circle cx="29" cy="27" r="12" fill="${INK}"/>
  <circle cx="29" cy="29" r="26.5" fill="none" stroke="${INK}" stroke-width="4" opacity="0.55"/>
`;

/** The specular highlight, its own part so it can lag the iris (parallax). */
const SPARK = `
  <ellipse cx="14" cy="13" rx="10.5" ry="8.5" fill="${PAPER}" opacity="0.94"/>
`;

/**
 * The upper lid — skin, a lash edge, a crease.
 *
 * 🚨 **Its top 30px fade to transparent and its sides run flush to the window
 * edge, and both of those are load-bearing.**
 *
 * The fade is the ordinary reason: the plate is flat skin over a head plate that
 * is not flat there, so a hard top edge would draw a rectangle across the brow
 * every frame.
 *
 * The flush sides are the un-ordinary one. `rigc render` samples an atlas
 * bilinearly in **straight**-alpha space, so at any edge where opaque art meets
 * the transparent `(0,0,0,0)` texels beside it the interpolated colour is pulled
 * toward black while the alpha stays partial — a one-pixel dark rim, over the
 * top of whatever is behind. On a part with an ink outline nobody can see it; on
 * a skin-coloured plate that is supposed to overlap invisibly it is a visible
 * line down the forehead, which is what the first version drew (measured at
 * −31/255, and −60/255 in the minimal case). Running the fill to `x = 0` and
 * `x = 104` removes it, because the sampler CLAMPS at a page edge and therefore
 * has nothing dark to interpolate into. That is a workaround for
 * [issue #292](https://github.com/firejune/rigc/issues/292), not a fix.
 *
 * 🚨 **And the fade is 30 PIXELS, not a fraction of the plate.** The lash curve
 * bottoms out at y = 106 of 112, so the plate carries 106 − 30 = **76px of fully
 * opaque skin above its own lash** — six more than the 70px eye opening the blink
 * has to hide. A proportional fade (`offset 0.34` in objectBoundingBox units) is
 * what the first version used, and on a plate this tall that put the top 38px at
 * partial alpha: closed, the eye's own lash showed straight through the lid as a
 * grey smudge over the shut eye. Sizing the fade in pixels is what makes the
 * plate's height a free variable and the coverage a stated one.
 */
const LID = `
  <defs>
    <linearGradient id="lidfade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="30">
      <stop offset="0" stop-color="${FUR}" stop-opacity="0"/>
      <stop offset="1" stop-color="${FUR}" stop-opacity="1"/>
    </linearGradient>
  </defs>
  <path d="M0 0 H104 V94 C 82 110, 22 110, 0 94 Z" fill="url(#lidfade)"/>
  <path d="M0 94 C 22 110, 82 110, 104 94" fill="none" stroke="${INK}" stroke-width="9"
        stroke-linecap="butt"/>
  <path d="M10 82 C 32 96, 72 96, 94 82" fill="none" stroke="${FUR_DK}" stroke-width="5"
        stroke-linecap="round" opacity="0.45"/>
`;

/**
 * A brow, in the hair's dark tone so it reads as hair rather than as ink.
 *
 * The arch is the whole expression. The first version ran low at the inner end
 * and rose outward, which is a scowl — two of them meeting over the nose read as
 * a V whatever the mouth is doing. This one lifts the inner end and peaks about
 * 60% of the way out, which is neutral-friendly and lets `idle`'s 2px brow lift
 * read as interest rather than as anger relaxing.
 */
const BROW = `
  <path d="M8 16 C 26 6, 56 7, 78 19" fill="none" stroke="${TEAL_DK}" stroke-width="9"
        stroke-linecap="round"/>
`;

/** The nose: a soft wedge of shade and one tick. Small on purpose. */
const NOSE = `
  <path d="M17 5 C 22 13, 27 20, 24 24 C 21 27, 13 27, 10 24 C 7 20, 12 13, 17 5 Z"
        fill="${FUR_DK}" opacity="0.72"/>
  <path d="M12 22 C 15 25, 19 25, 22 22" fill="none" stroke="${INK}" stroke-width="4"
        stroke-linecap="round" opacity="0.5"/>
`;

/** The mouth: a small open smile. */
const MOUTH = `
  <path d="M8 14 C 22 9, 50 9, 64 14 C 60 32, 47 40, 36 40 C 25 40, 12 32, 8 14 Z"
        fill="${BLUSH}" stroke="${INK}" stroke-width="6"/>
  <path d="M16 18 C 29 25, 43 25, 56 18" fill="none" stroke="${INK}" stroke-width="4"
        stroke-linecap="round" opacity="0.35"/>
`;

// --- hair ------------------------------------------------------------------

/** The mass behind the skull — the only part the head's turn shifts the OTHER way. */
const HAIR_BACK = `
  <path d="M220 10 C 118 10, 26 100, 22 210 C 19 288, 30 358, 46 404
           C 58 414, 76 414, 88 404 C 74 344, 66 272, 70 204
           C 112 244, 168 258, 220 258 C 272 258, 328 244, 370 204
           C 374 272, 366 344, 352 404 C 364 414, 382 414, 394 404
           C 410 358, 421 288, 418 210 C 414 100, 322 10, 220 10 Z"
        fill="${TEAL}" stroke="${INK}" stroke-width="${SW}"/>
  <path d="M44 190 C 46 258, 54 330, 66 384" fill="none" stroke="${TEAL_DK}" stroke-width="10"
        stroke-linecap="round" opacity="0.62"/>
  <path d="M396 190 C 394 258, 386 330, 374 384" fill="none" stroke="${TEAL_DK}" stroke-width="10"
        stroke-linecap="round" opacity="0.62"/>
  <path d="M74 132 A 152 152 0 0 1 200 42" fill="none" stroke="${FUR_LT}" stroke-width="16"
        stroke-linecap="round" opacity="0.3"/>
`;

/**
 * The fringe — the second mesh, and the one that carries the turn's parallax.
 *
 * It stands 16px in front of the skull, so its own cylinder is 16 wider and its
 * centre travels further than the face's under the same yaw. That difference is
 * the whole reason it is a mesh rather than a plate on a bone.
 */
const HAIR_BANG = `
  <path d="M24 104 C 26 54, 96 12, 186 12 C 276 12, 346 54, 348 104
           C 345 126, 338 142, 328 154 C 318 140, 310 120, 306 100
           C 294 116, 278 128, 262 133 C 254 118, 248 104, 245 92
           C 232 110, 210 122, 186 126 C 162 122, 140 110, 127 92
           C 124 104, 118 118, 110 133 C 94 128, 78 116, 66 100
           C 62 120, 54 140, 44 154 C 34 142, 27 126, 24 104 Z"
        fill="${TEAL}" stroke="${INK}" stroke-width="${SW}"/>
  <path d="M60 62 C 66 86, 70 108, 70 128" fill="none" stroke="${TEAL_DK}" stroke-width="9"
        stroke-linecap="round" opacity="0.5"/>
  <path d="M146 50 C 152 72, 160 90, 170 106" fill="none" stroke="${TEAL_DK}" stroke-width="9"
        stroke-linecap="round" opacity="0.5"/>
  <path d="M228 50 C 222 72, 214 90, 204 106" fill="none" stroke="${TEAL_DK}" stroke-width="9"
        stroke-linecap="round" opacity="0.5"/>
  <path d="M312 62 C 306 86, 302 108, 302 128" fill="none" stroke="${TEAL_DK}" stroke-width="9"
        stroke-linecap="round" opacity="0.5"/>
  <path d="M84 52 A 122 112 0 0 1 206 24" fill="none" stroke="${FUR_LT}" stroke-width="16"
        stroke-linecap="round" opacity="0.3"/>
`;

/**
 * A front lock, hanging from the scalp.
 *
 * Its pivot is the strand's top, at (42, 10) — the window's own horizontal
 * centre, deliberately, so both the plate and its mirror take the same
 * attachment offset `y: -170` and neither needs an `x`. A pivot one pixel off
 * centre is two more numbers in the rig spec and one of them will be wrong.
 */
const HAIR_LOCK = `
  <path d="M42 10 C 64 10, 75 42, 72 88 C 68 144, 56 202, 46 258
           C 40 298, 36 332, 32 346 C 28 342, 24 318, 22 290
           C 17 232, 19 164, 19 102 C 19 48, 22 10, 42 10 Z"
        fill="${TEAL}" stroke="${INK}" stroke-width="${SW}"/>
  <path d="M52 42 C 55 110, 46 200, 37 288" fill="none" stroke="${TEAL_DK}" stroke-width="9"
        stroke-linecap="round" opacity="0.6"/>
  <path d="M31 48 A 22 40 0 0 1 47 22" fill="none" stroke="${FUR_LT}" stroke-width="9"
        stroke-linecap="round" opacity="0.28"/>
`;

/** The cowlick. Its pivot is the base, at (34, 120). */
const AHOGE = `
  <path d="M20 124 C 22 84, 36 52, 60 30 C 78 15, 96 8, 103 16
           C 110 24, 96 42, 78 56 C 62 70, 52 92, 50 124 Z"
        fill="${TEAL}" stroke="${INK}" stroke-width="${SW}"/>
  <path d="M40 112 C 44 84, 56 58, 76 40" fill="none" stroke="${TEAL_DK}" stroke-width="8"
        stroke-linecap="round" opacity="0.55"/>
`;

/** The throat band — the warm accent, and it hides the neck/garment seam. */
const CHOKER = `
  <path d="M8 14 C 36 6, 96 6, 124 14 C 126 20, 126 26, 124 32
           C 96 42, 36 42, 8 32 C 6 26, 6 20, 8 14 Z"
        fill="${SUN}" stroke="${INK}" stroke-width="${SW}"/>
`;

/** The neck, in the shaded fur tone: it lives under the jaw. */
const NECK = `
  <path d="M24 6 C 24 6, 22 74, 10 132 C 42 150, 98 150, 130 132
           C 118 74, 116 6, 116 6 Z" fill="${FUR_DK}" stroke="${INK}" stroke-width="${SW}"/>
  <path d="M40 24 C 44 66, 42 100, 36 124" fill="none" stroke="${FUR}" stroke-width="16"
        stroke-linecap="round" opacity="0.22"/>
  <path d="M18 18 C 34 48, 106 48, 122 18" fill="none" stroke="${INK}" stroke-width="11"
        stroke-linecap="round" opacity="0.28"/>
`;

/** The bust: shoulders, a scooped neckline, a warm trim. */
const TORSO = `
  <path d="M196 44 C 160 52, 112 82, 84 140 C 52 212, 42 318, 38 412
           L 502 412 C 498 318, 488 212, 456 140 C 428 82, 380 52, 344 44
           C 334 62, 306 72, 270 72 C 234 72, 206 62, 196 44 Z"
        fill="${METAL_DK}" stroke="${INK}" stroke-width="${SW}"/>
  <path d="M120 168 C 148 122, 186 90, 218 78" fill="none" stroke="${METAL}" stroke-width="24"
        stroke-linecap="round" opacity="0.36"/>
  <path d="M420 168 C 392 122, 354 90, 322 78" fill="none" stroke="${METAL}" stroke-width="17"
        stroke-linecap="round" opacity="0.2"/>
  <path d="M168 96 C 140 150, 122 268, 118 412" fill="none" stroke="${INK}" stroke-width="7"
        stroke-linecap="round" opacity="0.26"/>
  <path d="M372 96 C 400 150, 418 268, 422 412" fill="none" stroke="${INK}" stroke-width="7"
        stroke-linecap="round" opacity="0.26"/>
  <path d="M196 46 C 208 64, 234 76, 270 76 C 306 76, 332 64, 344 46"
        fill="none" stroke="${METAL}" stroke-width="10" stroke-linecap="round" opacity="0.45"/>
`;

/**
 * The stage plate — a portrait vignette, and NOT `rigby.ts`'s `stagePlatePart`.
 *
 * That one bakes a contact shadow under a standing figure's feet, which is the
 * right plate for the four examples that have feet. A bust crops the floor out
 * of the shot, so what this frame needs is a rim glow behind the head and a
 * darkening under the shoulders: light for the face to read against, shade for
 * the bust to sit in.
 *
 * Numbers are in plate pixels, y DOWN — {@link readStage}'s `imageY` is what
 * converts the one bone position this drawing asks for.
 */
function portraitPlatePart(width: number, height: number, glow: { x: number; y: number; r: number }): Part {
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
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#floorless)"/>
`,
  );
}

/** Vela's parts, at nominal size. */
export function velaParts(): Part[] {
  const mirror = (w: number, body: string): string => `<g transform="scale(-1,1) translate(${-w},0)">${body}</g>`;
  return [
    part('hair_back', 440, 448, HAIR_BACK),
    part('neck', 140, 150, NECK),
    part('torso', 540, 420, TORSO),
    part('choker', 132, 48, CHOKER),
    part('head', HEAD_W, HEAD_H, FACE),
    part('eye_l', 92, 84, mirror(92, EYE)),
    part('eye_r', 92, 84, EYE),
    part('iris_l', 58, 58, IRIS),
    part('iris_r', 58, 58, IRIS),
    part('spark_l', 28, 26, SPARK),
    part('spark_r', 28, 26, SPARK),
    part('lid_l', 104, 112, mirror(104, LID)),
    part('lid_r', 104, 112, LID),
    part('brow_l', 86, 30, mirror(86, BROW)),
    part('brow_r', 86, 30, BROW),
    part('nose', 34, 30, NOSE),
    part('mouth', 72, 44, MOUTH),
    part('hair_bang', 372, 168, HAIR_BANG),
    part('hair_lock_l', 84, 360, mirror(84, HAIR_LOCK)),
    part('hair_lock_r', 84, 360, HAIR_LOCK),
    part('ahoge', 100, 130, AHOGE),
  ];
}

if (import.meta.main) {
  const HERE = new URL('.', import.meta.url).pathname;
  const OUT = join(HERE, 'parts');
  mkdirSync(OUT, { recursive: true });

  console.log(`character parts (nominal x ${ART_SCALE}):`);
  await rasterise(velaParts(), OUT, ART_SCALE);

  const stage = readStage(join(HERE, 'rig.json'));
  const head = stage.bone('head');
  console.log('stage plate (already at world scale):');
  await rasterise([portraitPlatePart(stage.width, stage.height, { x: head.x, y: stage.imageY(head.y), r: 470 })], OUT, 1);
}
