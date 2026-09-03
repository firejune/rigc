/**
 * Draws the demo character's loose part PNGs.
 *
 * Everything here is drawn from scratch: no example asset, no traced reference.
 * Units are "art pixels" = 2x the final GIF pixels, so the frames rigc renders
 * can be downsampled once at the end and every rotated edge lands clean.
 */
import { mkdirSync } from 'node:fs';
import { $ } from 'bun';

const OUT = new URL('./parts/', import.meta.url).pathname;
const SVG = new URL('./svg/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
mkdirSync(SVG, { recursive: true });

import {
  PLATE_W,
  PLATE_H,
  HIP_X,
  HIP_Y,
  FEET_BELOW_HIP,
  EARS_ABOVE_HIP,
  INK,
  FUR,
  FUR_LT,
  FUR_DK,
  TEAL,
  TEAL_DK,
  BLUSH,
  GROUND,
} from './layout';

const SW = 9; // outline weight

/** One part: a name, a canvas, and the body of its SVG. */
interface Part {
  name: string;
  w: number;
  h: number;
  body: string;
}

const parts: Part[] = [];
const add = (name: string, w: number, h: number, body: string) => parts.push({ name, w, h, body });

// --- the stage plate -------------------------------------------------------
// A near-flat dark ground: it reads on GitHub's light and dark chrome alike,
// and it pins rigc's framing box so both animations render to one viewport.
const glowX = (HIP_X - 34) / PLATE_W;
const glowY = (PLATE_H - (HIP_Y + 250)) / PLATE_H;
const footY = PLATE_H - (HIP_Y - FEET_BELOW_HIP);
add(
  'plate',
  PLATE_W,
  PLATE_H,
  `
  <defs>
    <radialGradient id="glow" cx="${glowX.toFixed(4)}" cy="${glowY.toFixed(4)}" r="0.66">
      <stop offset="0"    stop-color="#3b4859" stop-opacity="0.85"/>
      <stop offset="0.45" stop-color="#2a3340" stop-opacity="0.44"/>
      <stop offset="1"    stop-color="${GROUND}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="floor" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0"   stop-color="#000000" stop-opacity="0.58"/>
      <stop offset="0.6" stop-color="#000000" stop-opacity="0.24"/>
      <stop offset="1"   stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="${PLATE_W}" height="${PLATE_H}" fill="${GROUND}"/>
  <rect x="0" y="0" width="${PLATE_W}" height="${PLATE_H}" fill="url(#glow)"/>
  <ellipse cx="${HIP_X - 26}" cy="${footY + 6}" rx="210" ry="36" fill="url(#floor)"/>
`,
);

// --- head ------------------------------------------------------------------
add(
  'head',
  256,
  236,
  `
  <ellipse cx="128" cy="118" rx="121" ry="112" fill="${FUR}" stroke="${INK}" stroke-width="${SW}"/>
  <path d="M28 96 A 108 100 0 0 1 150 16" fill="none" stroke="${FUR_LT}" stroke-width="16" stroke-linecap="round" opacity="0.6"/>
  <ellipse cx="128" cy="171" rx="66" ry="45" fill="${FUR_LT}"/>
  <ellipse cx="52"  cy="152" rx="26" ry="16" fill="${BLUSH}" opacity="0.5"/>
  <ellipse cx="204" cy="152" rx="26" ry="16" fill="${BLUSH}" opacity="0.5"/>
  <path d="M128 138 c 16 0 24 8 24 15 c 0 9 -11 15 -24 15 c -13 0 -24 -6 -24 -15 c 0 -7 8 -15 24 -15 z" fill="${INK}"/>
  <path d="M105 176 q 23 20 46 0" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
`,
);

// --- eyes: one plate, two attachments in one slot --------------------------
const eye = (cx: number) => `
  <ellipse cx="${cx}" cy="42" rx="30" ry="34" fill="${INK}"/>
  <ellipse cx="${cx + 10}" cy="30" rx="11" ry="12" fill="#ffffff"/>
  <ellipse cx="${cx - 11}" cy="54" rx="6" ry="6" fill="#ffffff" opacity="0.6"/>
`;
add('eyes', 216, 84, `${eye(38)}${eye(178)}`);

const lid = (cx: number) => `
  <path d="M${cx - 30} 34 q 30 30 60 0" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>
  <path d="M${cx - 34} 22 l -7 -8 M${cx + 34} 22 l 7 -8" stroke="${INK}" stroke-width="7" stroke-linecap="round" opacity="0.7"/>
`;
add('eyes_shut', 216, 84, `${lid(38)}${lid(178)}`);

// --- ears ------------------------------------------------------------------
const earBody = `
  <path d="M46 6 C 64 42, 82 76, 86 106 C 62 113, 30 113, 6 106 C 10 76, 28 42, 46 6 Z"
        fill="${FUR}" stroke="${INK}" stroke-width="${SW}"/>
  <path d="M46 44 C 56 66, 65 86, 67 98 C 54 101, 38 101, 25 98 C 27 86, 36 66, 46 44 Z"
        fill="${BLUSH}" opacity="0.7"/>
`;
add('ear_l', 92, 114, `<g transform="scale(-1,1) translate(-92,0)">${earBody}</g>`);
add('ear_r', 92, 114, earBody);

// --- torso -----------------------------------------------------------------
add(
  'torso',
  208,
  184,
  `
  <path d="M104 6 C 148 6, 176 44, 180 92 C 184 140, 158 178, 104 178 C 50 178, 24 140, 28 92 C 32 44, 60 6, 104 6 Z"
        fill="${FUR}" stroke="${INK}" stroke-width="${SW}"/>
  <path d="M104 74 C 128 74, 141 98, 141 122 C 141 148, 124 164, 104 164 C 84 164, 67 148, 67 122 C 67 98, 80 74, 104 74 Z"
        fill="${FUR_LT}"/>
  <path d="M40 62 A 70 76 0 0 1 88 16" fill="none" stroke="${FUR_DK}" stroke-width="12" stroke-linecap="round" opacity="0.55"/>
`,
);

// --- legs ------------------------------------------------------------------
const legBody = `
  <path d="M42 6 C 62 6, 70 26, 70 52 L 70 88 C 70 108, 58 118, 42 118 C 26 118, 14 108, 14 88 L 14 52 C 14 26, 22 6, 42 6 Z"
        fill="${FUR}" stroke="${INK}" stroke-width="${SW}"/>
  <ellipse cx="42" cy="96" rx="20" ry="14" fill="${FUR_LT}"/>
  <path d="M32 100 l 0 12 M42 101 l 0 13 M52 100 l 0 12" stroke="${INK}" stroke-width="5" stroke-linecap="round" opacity="0.55"/>
`;
add('leg_l', 84, 124, `<g transform="scale(-1,1) translate(-84,0)">${legBody}</g>`);
add('leg_r', 84, 124, legBody);

// --- arms ------------------------------------------------------------------
// The far arm is one plate; the near arm is two, so the wave gets a wrist.
add(
  'arm_b',
  72,
  216,
  `
  <path d="M36 6 C 54 6, 62 22, 62 44 L 62 168 C 62 194, 52 210, 36 210 C 20 210, 10 194, 10 168 L 10 44 C 10 22, 18 6, 36 6 Z"
        fill="${FUR_DK}" stroke="${INK}" stroke-width="${SW}"/>
  <ellipse cx="36" cy="186" rx="17" ry="14" fill="${FUR_LT}" opacity="0.75"/>
`,
);
add(
  'arm_f',
  72,
  124,
  `
  <path d="M36 6 C 55 6, 63 22, 63 46 L 63 92 C 63 112, 52 118, 36 118 C 20 118, 9 112, 9 92 L 9 46 C 9 22, 17 6, 36 6 Z"
        fill="${FUR}" stroke="${INK}" stroke-width="${SW}"/>
  <path d="M18 34 A 26 30 0 0 1 40 14" fill="none" stroke="${FUR_LT}" stroke-width="11" stroke-linecap="round" opacity="0.6"/>
`,
);
add(
  'hand_f',
  68,
  112,
  `
  <path d="M34 6 C 52 6, 60 20, 60 42 L 60 68 C 60 94, 50 106, 34 106 C 18 106, 8 94, 8 68 L 8 42 C 8 20, 16 6, 34 6 Z"
        fill="${FUR}" stroke="${INK}" stroke-width="${SW}"/>
  <ellipse cx="34" cy="76" rx="21" ry="16" fill="${FUR_LT}"/>
  <path d="M22 66 l -3 -13 M34 63 l 0 -14 M46 66 l 3 -13" stroke="${INK}" stroke-width="6" stroke-linecap="round" opacity="0.5"/>
`,
);

// --- scarf: a knot at the neck and a tail that trails ----------------------
// A collar that visibly wraps: wider than the neck, a lower edge that dips at
// the throat, and two folds where the wrap crosses itself.
add(
  'scarf_knot',
  180,
  78,
  `
  <path d="M22 24 C 52 8, 128 8, 158 24 C 168 30, 170 46, 160 55
           C 137 70, 119 74, 90 74 C 61 74, 43 70, 20 55
           C 10 46, 12 30, 22 24 Z"
        fill="${TEAL}" stroke="${INK}" stroke-width="${SW}"/>
  <path d="M24 31 C 56 46, 124 46, 156 31" fill="none" stroke="${TEAL_DK}" stroke-width="9" stroke-linecap="round" opacity="0.85"/>
  <path d="M58 42 C 62 55, 62 60, 56 68" fill="none" stroke="${TEAL_DK}" stroke-width="8" stroke-linecap="round"/>
  <path d="M122 42 C 126 55, 126 60, 120 68" fill="none" stroke="${TEAL_DK}" stroke-width="8" stroke-linecap="round"/>
`,
);
// The trailing end. Drawn as a STROKED centreline rather than a filled
// silhouette: a scarf keeps its width along its length, and a fill authored by
// hand tapers to a leaf without meaning to. The bone anchors at image pixel
// (200, 38) — under the collar — which is what the attachment offset states.
const tailPath = 'M240 42 C 186 40, 122 64, 72 98 C 52 112, 38 124, 30 134';
const fringe = 'M30 134 l -20 16 M42 144 l -12 22 M58 152 l -4 24 M76 154 l 6 24';
add(
  'scarf_tail',
  280,
  184,
  `
  <path d="${fringe}" fill="none" stroke="${INK}" stroke-width="24" stroke-linecap="round"/>
  <path d="${tailPath}" fill="none" stroke="${INK}" stroke-width="58" stroke-linecap="round"/>
  <path d="${fringe}" fill="none" stroke="${TEAL_DK}" stroke-width="11" stroke-linecap="round"/>
  <path d="${tailPath}" fill="none" stroke="${TEAL}" stroke-width="40" stroke-linecap="round"/>
  <path d="M226 36 C 176 38, 116 62, 66 98" fill="none" stroke="${TEAL_DK}" stroke-width="7" stroke-linecap="round" opacity="0.55"/>
  <path d="M166 44 C 174 56, 177 64, 176 76" fill="none" stroke="${TEAL_DK}" stroke-width="8" stroke-linecap="round" opacity="0.8"/>
  <path d="M110 70 C 118 82, 121 90, 120 102" fill="none" stroke="${TEAL_DK}" stroke-width="8" stroke-linecap="round" opacity="0.8"/>
  <path d="M60 100 C 68 112, 71 120, 70 132" fill="none" stroke="${TEAL_DK}" stroke-width="8" stroke-linecap="round" opacity="0.8"/>
`,
);

// --- rasterise -------------------------------------------------------------
for (const p of parts) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${p.w}" height="${p.h}" viewBox="0 0 ${p.w} ${p.h}">${p.body}</svg>`;
  const svgPath = `${SVG}${p.name}.svg`;
  await Bun.write(svgPath, svg);
  await $`rsvg-convert -w ${p.w} -h ${p.h} -o ${OUT}${p.name}.raw.png ${svgPath}`.quiet();
  // force 8-bit straight RGBA, non-interlaced: what rigc's own codec reads.
  await $`magick ${OUT}${p.name}.raw.png -depth 8 -define png:color-type=6 -interlace none PNG32:${OUT}${p.name}.png`.quiet();
  await $`rm -f ${OUT}${p.name}.raw.png`.quiet();
  console.log(`${p.name.padEnd(12)} ${p.w}x${p.h}`);
}
