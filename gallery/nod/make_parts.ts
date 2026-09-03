/**
 * Draws every part PNG this example needs.
 *
 *     bun gallery/nod/make_parts.ts
 *
 * The PNGs are committed, so nobody needs to run this to build or render the
 * example — it is here so the art is reproducible. It needs `rsvg-convert`
 * (librsvg) on PATH, which is the gallery's one art-time prerequisite.
 *
 * ## Why a third character lives here rather than in `../rigby.ts`
 *
 * The gallery shares one drawing of Rigby so its examples read as shots of one
 * character, and [`../portrait`](../portrait) already bent that once for a face
 * that had to sell a **yaw**. This example needs the other two moves of the same
 * construct — a **nod** and a **ripple** — and each one needs geometry neither
 * of the two existing casts has:
 *
 * - a nod is a `pitch`, which reads a part's **height** rather than its
 *   position across the screen, so it needs features stacked up the face at
 *   different depths. Rigby's muzzle, nose and mouth are drawn *into* one head
 *   plate, and Vela's six features are laid out for a yaw — four of them share a
 *   `y`, so a pitch over her face would key two identical pairs.
 * - a ripple needs a long soft appendage whose mesh is a regular strip. Rigby's
 *   scarf tail is a stroked centreline that tapers, and Vela's hair locks are
 *   rigid plates.
 *
 * So **Lepus** is drawn here, in Rigby's own palette and outline weight. His fur
 * tones are her fur — she is his own family and the resemblance is the point —
 * his scarf's teal is her kerchief, and the warm accent his props use is the
 * light coming *through* her ears, which is what a hare's ears do against a lamp
 * and what makes the rippling part of the drawing the warmest thing on screen.
 * `../rigby.ts` still owns every colour and the rasteriser. Her name continues
 * `portrait`'s: Vela and Lepus are both constellations, and Lepus is the hare.
 *
 * ## Scale
 *
 * `ART_SCALE` is **1**: every part is rasterised at the nominal size its outline
 * weight was drawn for, and the three mesh tables in `rig.json` are stated in
 * the same unit — a row at `y = 140` is 140 of these pixels above the head
 * plate's centre, and its uv is that offset over the plate's own 300.
 *
 * ## 🚨 The one rule that ties this file to `rig.json`
 *
 * Three parts are **meshes**, and a mesh draws nothing outside its own
 * triangles. So every stroke of `head`, `ear_l` and `ear_r` has to stay inside
 * the grid that covers it, and the four numbers below are the whole contract:
 * {@link HEAD_INK} and {@link EAR_INK} are the boxes the ink may occupy, in
 * canvas pixels, and they are the grids of `rig.json` converted once. Cross one
 * and the outline is silently cut off — the way `squash`'s first ball lost its
 * own line.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { BLUSH, FUR, FUR_DK, FUR_LT, GROUND, INK, SUN, SW, TEAL, TEAL_DK, part, rasterise } from '../rigby.ts';
import type { Part } from '../rigby.ts';
import { readStage } from '../stage.ts';

/** Rasterisation scale for every part in this example — see the header. */
const ART_SCALE = 1;

// --- the two meshed plates, and the boxes their ink may occupy --------------

/** The head plate's nominal size. `rig.json`'s head uvs are stated over these. */
const HEAD_W = 320;
const HEAD_H = 300;
/**
 * Where the head grid's outer columns and rows land in canvas pixels: columns
 * `x = ±152` and rows `y = ±140` over a 320x300 plate, so the ink lives inside
 * `[8, 312] x [10, 290]`. Every path below is drawn a few pixels inside it.
 */
const HEAD_INK = { x0: 8, y0: 10, x1: 312, y1: 290 } as const;

/** The ear plate's nominal size. */
const EAR_W = 112;
const EAR_H = 420;
/**
 * The ear grid's box: columns `x = ±50` and rows `y = 0 .. −400`, mapped so the
 * plate's top edge is 10 units above the root — `[6, 106] x [10, 410]`.
 *
 * ⭐ The root is at the TOP of this box rather than at its centre, and that is a
 * decision `rig.json` shares: the ear's slot bone sits where the ear meets the
 * skull, so the mesh's `y` runs 0 at the root to −400 at the tip and the wave's
 * `along` coordinate is *how far down the ear a vertex is*. A plate centred on
 * its bone would have made that coordinate an offset from the ear's middle.
 */
const EAR_INK = { x0: 6, y0: 10, x1: 106, y1: 410 } as const;

/**
 * The skull: a wide cranium tapering to a small muzzle-less chin.
 *
 * Drawn as a path rather than an ellipse because a nod reads off the crown and
 * the chin — the two places a pitch redistributes the most (`README.md`'s band
 * table). An ellipse's top and bottom carry no landmark, so its vertical
 * texture shift has nothing to shift *against*.
 *
 * The ink reaches `x = 17.5 .. 302.5` and `y = 14.5 .. 285.5`, inside
 * {@link HEAD_INK} on all four sides. The widest point is level with the eyes,
 * and at the ears' own height (canvas `y = 70`) the silhouette still reaches
 * out to 41 — which is what hides the ear roots, and `README.md` prices it.
 */
const SKULL = `
  <path d="M160 19 C 88 19, 30 60, 25 126
           C 20 178, 46 240, 94 266
           C 120 280, 142 281, 160 281
           C 178 281, 200 280, 226 266
           C 274 240, 300 178, 295 126
           C 290 60, 232 19, 160 19 Z"
        fill="${FUR}" stroke="${INK}" stroke-width="${SW}"/>
  <path d="M44 152 C 50 210, 74 252, 108 268" fill="none" stroke="${FUR_DK}" stroke-width="14"
        stroke-linecap="round" opacity="0.4"/>
  <path d="M276 152 C 270 210, 246 252, 212 268" fill="none" stroke="${FUR_DK}" stroke-width="14"
        stroke-linecap="round" opacity="0.4"/>
  <path d="M56 82 A 124 116 0 0 1 146 30" fill="none" stroke="${FUR_LT}" stroke-width="17"
        stroke-linecap="round" opacity="0.55"/>
  <ellipse cx="160" cy="238" rx="72" ry="40" fill="${FUR_LT}" opacity="0.35"/>
  <ellipse cx="64"  cy="196" rx="30" ry="17" fill="${BLUSH}" opacity="0.5"/>
  <ellipse cx="256" cy="196" rx="30" ry="17" fill="${BLUSH}" opacity="0.5"/>
`;

/**
 * One lop ear, drawn hanging straight down its own plate.
 *
 * 🚨 **The splay is in the bone and the curl is in the drawing, and neither is
 * in the mesh.** `rig.json` rotates each ear's root bone 14° outward, so the
 * wave's `axis: "x"` displaces the ear across *its own* length rather than
 * across the screen — which is what a floppy ear actually does. The mesh itself
 * stays axis-aligned inside this plate, because that is the only frame in which
 * "one row per 40 units down the ear" is a true statement.
 *
 * The ink reaches `x = 9.5 .. 104.5` and `y = 10.5 .. 408.5`, inside
 * {@link EAR_INK}. The root is deliberately the narrowest part: the wave has no
 * taper, so the root row slides sideways by up to the amplitude, and a narrow
 * root is what keeps that slide behind the skull.
 */
const EAR = `
  <path d="M40 15 C 24 96, 14 200, 20 302 C 24 372, 40 402, 57 404
           C 74 402, 90 372, 94 302 C 100 200, 90 96, 74 15 Z"
        fill="${FUR}" stroke="${INK}" stroke-width="${SW}"/>
  <path d="M47 34 C 33 106, 25 204, 31 300 C 35 362, 47 388, 57 390
           C 67 388, 79 362, 83 300 C 89 204, 81 106, 67 34 Z"
        fill="${BLUSH}" opacity="0.6"/>
  <path d="M50 52 C 38 118, 31 208, 35 296" fill="none" stroke="${SUN}" stroke-width="10"
        stroke-linecap="round" opacity="0.72"/>
  <path d="M66 66 C 75 130, 78 210, 74 292" fill="none" stroke="${FUR_LT}" stroke-width="8"
        stroke-linecap="round" opacity="0.5"/>
`;

/**
 * The tuft between the ears — the highest thing on the face, and the member
 * whose foreshortening a nod pushes hardest (`README.md`'s scale table).
 *
 * ⭐ It is drawn BEHIND the head plate, and that is the whole reason it reads as
 * fur rather than as a cap. Only the 27 units that clear the skull's own
 * outline are ever seen, so the flat bottom edge is never in the picture and
 * three peaks are enough. The first pass drew it in front, and a lobe with an
 * ink line across the forehead reads as a hat no matter what colour it is.
 */
const CROWN = `
  <path d="M20 130 C 14 104, 18 82, 30 72
           C 44 60, 56 66, 62 80
           C 70 58, 84 44, 100 42
           C 114 40, 122 50, 124 62
           C 130 40, 148 32, 162 40
           C 174 47, 178 60, 176 72
           C 186 56, 204 56, 214 70
           C 226 86, 228 110, 222 130 Z"
        fill="${FUR}" stroke="${INK}" stroke-width="${SW}"/>
  <path d="M38 92 C 46 80, 56 82, 60 94 M96 62 C 106 54, 116 58, 119 70
           M148 54 C 158 48, 168 52, 171 64 M198 78 C 206 72, 214 76, 216 88"
        fill="none" stroke="${FUR_LT}" stroke-width="9" stroke-linecap="round" opacity="0.5"/>
`;

/**
 * One eye — drawn for the RIGHT side and mirrored for the left.
 *
 * The lash is heavy on the OUTER half with one tick at the outer corner, which
 * is `portrait`'s own finding restated: ink loaded at the inner corner reads as
 * a scowl no matter what the rest of the face does.
 */
const EYE = `
  <ellipse cx="44" cy="42" rx="31" ry="34" fill="${INK}"/>
  <ellipse cx="53" cy="29" rx="11" ry="12" fill="#FFFFFF"/>
  <ellipse cx="34" cy="55" rx="6.5" ry="6" fill="#FFFFFF" opacity="0.62"/>
  <path d="M14 26 C 22 12, 40 6, 58 9" fill="none" stroke="${INK}" stroke-width="7"
        stroke-linecap="round" opacity="0.75"/>
  <path d="M40 7 C 52 6, 64 12, 72 24" fill="none" stroke="${INK}" stroke-width="11"
        stroke-linecap="round"/>
  <path d="M72 22 l 9 -9" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
`;

/**
 * The muzzle: the only feature in FRONT of the skull surface, which is what
 * makes its residual the negative one `README.md` uses as a diagnostic.
 */
const SNOUT = `
  <path d="M84 14 C 122 14, 150 40, 150 66 C 150 90, 122 104, 84 104
           C 46 104, 18 90, 18 66 C 18 40, 46 14, 84 14 Z"
        fill="${FUR_LT}" stroke="${INK}" stroke-width="${SW}"/>
  <path d="M84 34 C 96 34, 104 42, 104 50 C 104 60, 95 66, 84 66
           C 73 66, 64 60, 64 50 C 64 42, 72 34, 84 34 Z"
        fill="${BLUSH}" stroke="${INK}" stroke-width="7"/>
  <path d="M84 66 l 0 16" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
  <path d="M30 46 l -22 -9 M28 62 l -22 3 M138 46 l 22 -9 M140 62 l 22 3"
        stroke="${INK}" stroke-width="5" stroke-linecap="round" opacity="0.6"/>
`;

/**
 * The lip line under the muzzle — almost on the skull surface.
 *
 * It picks up exactly where {@link SNOUT}'s cleft stops. The first pass hung it
 * 24 units lower and it read as a second mouth; `rig.json`'s `mouth` bone moved
 * from `y −104` to `y −80` to close that gap, and the depth beside it did not
 * change, because how far a part stands off the skull is not a function of how
 * high up the face it is.
 */
const MOUTH = `
  <path d="M12 12 C 26 32, 40 38, 48 38 C 56 38, 70 32, 84 12" fill="none"
        stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
`;

/**
 * Chest, shoulders and the kerchief that ties her to Rigby's scarf.
 *
 * The first pass drew the sides straight and the shoulders square, and a pale
 * plate with two vertical edges reads as a bottle. The shoulders now slope out
 * of the neck and the flanks flare, which is also what gives the kerchief
 * somewhere to sit.
 */
const TORSO = `
  <path d="M126 62 C 126 30, 140 12, 170 12
           C 200 12, 214 30, 214 62
           C 214 84, 226 96, 248 108
           C 280 126, 300 168, 306 236
           C 312 300, 308 356, 306 399
           L 34 399
           C 32 356, 28 300, 34 236
           C 40 168, 60 126, 92 108
           C 114 96, 126 84, 126 62 Z"
        fill="${FUR}" stroke="${INK}" stroke-width="${SW}"/>
  <path d="M170 190 C 204 190, 226 226, 232 274
           C 238 322, 234 366, 233 399 L 107 399
           C 106 366, 102 322, 108 274 C 114 226, 136 190, 170 190 Z"
        fill="${FUR_LT}" opacity="0.62"/>
  <path d="M74 168 C 82 140, 96 122, 116 110" fill="none" stroke="${FUR_DK}" stroke-width="15"
        stroke-linecap="round" opacity="0.45"/>
  <path d="M112 108 C 132 92, 208 92, 228 108 C 240 118, 240 138, 228 147
           C 204 161, 136 161, 112 147 C 100 138, 100 118, 112 108 Z"
        fill="${TEAL}" stroke="${INK}" stroke-width="${SW}"/>
  <path d="M116 115 C 138 130, 202 130, 224 115" fill="none" stroke="${TEAL_DK}" stroke-width="9"
        stroke-linecap="round" opacity="0.85"/>
  <path d="M136 146 C 140 158, 139 165, 133 174" fill="none" stroke="${TEAL_DK}" stroke-width="8"
        stroke-linecap="round"/>
  <path d="M204 146 C 208 158, 207 165, 201 174" fill="none" stroke="${TEAL_DK}" stroke-width="8"
        stroke-linecap="round"/>
`;

/**
 * The stage: flat ground, a cool halo behind the head, and one warm pool low
 * and to the left.
 *
 * ⭐ The warm pool is not decoration — it is what the ears' {@link SUN} rim is
 * light *from*, so the plate and the parts agree about where the lamp is. Its
 * position is read off the rig's own bones through `../stage.ts` rather than
 * typed a second time.
 */
function lampPlatePart(
  width: number,
  height: number,
  halo: { x: number; y: number; r: number },
  lamp: { x: number; y: number; r: number },
): Part {
  return part(
    'plate',
    width,
    height,
    `
  <defs>
    <radialGradient id="halo" gradientUnits="userSpaceOnUse" cx="${halo.x}" cy="${halo.y}" r="${halo.r}">
      <stop offset="0"    stop-color="#3C4A60" stop-opacity="0.88"/>
      <stop offset="0.44" stop-color="#2A3342" stop-opacity="0.48"/>
      <stop offset="1"    stop-color="${GROUND}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="lamp" gradientUnits="userSpaceOnUse" cx="${lamp.x}" cy="${lamp.y}" r="${lamp.r}">
      <stop offset="0"    stop-color="${SUN}" stop-opacity="0.34"/>
      <stop offset="0.5"  stop-color="#8A6234" stop-opacity="0.16"/>
      <stop offset="1"    stop-color="${GROUND}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="floorless" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.52" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1"    stop-color="#000000" stop-opacity="0.5"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="${GROUND}"/>
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#halo)"/>
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#lamp)"/>
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#floorless)"/>
`,
  );
}

/** Lepus's parts, at nominal size. */
export function lepusParts(): Part[] {
  const mirror = (w: number, body: string): string => `<g transform="scale(-1,1) translate(${-w},0)">${body}</g>`;
  return [
    part('torso', 340, 430, TORSO),
    part('ear_l', EAR_W, EAR_H, mirror(EAR_W, EAR)),
    part('ear_r', EAR_W, EAR_H, EAR),
    part('head', HEAD_W, HEAD_H, SKULL),
    part('crown', 250, 150, CROWN),
    part('eye_l', 90, 78, mirror(90, EYE)),
    part('eye_r', 90, 78, EYE),
    part('snout', 168, 118, SNOUT),
    part('mouth', 96, 48, MOUTH),
  ];
}

if (import.meta.main) {
  const HERE = new URL('.', import.meta.url).pathname;
  const OUT = join(HERE, 'parts');
  mkdirSync(OUT, { recursive: true });

  console.log(`character parts (nominal x ${ART_SCALE}):`);
  await rasterise(lepusParts(), OUT, ART_SCALE);

  const stage = readStage(join(HERE, 'rig.json'));
  const head = stage.bone('head');
  const earTip = stage.bone('ear_l');
  console.log('stage plate (already at world scale):');
  await rasterise(
    [
      lampPlatePart(
        stage.width,
        stage.height,
        { x: head.x, y: stage.imageY(head.y), r: 430 },
        // Low and on the left ear's side, so the SUN rim inside the ears reads
        // as the same lamp. `ear_l`'s bone is the ear's ROOT, so the pool sits
        // a plate-length below it.
        { x: earTip.x - 40, y: stage.imageY(earTip.y - 300), r: 330 },
      ),
    ],
    OUT,
    1,
  );
}
