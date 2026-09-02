/**
 * Rigby — the gallery's mascot, and the shared half of every example's art.
 *
 * Everything here is drawn from scratch as SVG: no example asset, no traced
 * reference, nothing lifted out of the benchmark corpus. That matters twice
 * over — the gallery is what a stranger copies, so it has to be theirs to copy,
 * and AUTHORING.md §3's honesty rule forbids handing an authoring agent numbers
 * measured off a reference.
 *
 * ## Two coordinate systems, and the one conversion
 *
 * SVG is y-DOWN and Spine is y-UP. Every part body below is written in SVG's
 * frame, so a part's own pixels are top-down; the bone tables in the examples'
 * `rig.json` are bottom-up. The only place the two meet is a region
 * attachment's `y` offset, and each example's `make_parts.ts` says which of its
 * numbers came from here.
 *
 * ## Nominal size, and why the examples rasterise smaller
 *
 * The bodies are drawn at "nominal" size — the size the outline weight of
 * {@link SW} was chosen for. An example asks for a fraction of that with
 * {@link rasterise}'s `scale`, and because the source is vector rather than
 * pixels the downscale is a re-render and not a resample: no soft edges, no
 * half-pixel outlines. A part's PNG size is therefore `round(nominal * scale)`,
 * which is what rigc measures (AUTHORING.md R5) and what the bone offsets in
 * the rig specs are stated against.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

// --- palette ---------------------------------------------------------------
// Two hues plus ink for the character; wood, iron and a warm accent for the
// props the two examples add. Every example draws from this one list so a cart
// and a banner read as belonging to the same world as the mascot.

/** Outlines, pupils, and the dark side of everything. */
export const INK = '#241E2B';
/** Fur, mid tone. */
export const FUR = '#F2D49C';
/** Fur, lit. */
export const FUR_LT = '#FBE8C4';
/** Fur, shaded — the far arm, and rim shadows. */
export const FUR_DK = '#DCB472';
/** The scarf. */
export const TEAL = '#4FC7B4';
/** The scarf's folds. */
export const TEAL_DK = '#2E9A8A';
/** Cheeks, and the inside of an ear. */
export const BLUSH = '#E98D7C';
/** The stage plate. */
export const GROUND = '#1b1f26';
/** Props: cart planks, a banner mast. */
export const WOOD = '#B7794A';
/** Props: the shaded side of the same. */
export const WOOD_DK = '#8B5730';
/** Props: rail, wheel rims, iron banding. */
export const METAL = '#8E9AA8';
/** Props: the shaded side of the same. */
export const METAL_DK = '#5E6975';
/** The warm accent — a banner's second panel, a cart's trim. */
export const SUN = '#F2A83B';
/** Leaves. */
export const LEAF = '#7FB86B';
/** Leaf veins and the shaded lobe. */
export const LEAF_DK = '#4E8C46';

/** Outline weight, at nominal size. */
export const SW = 9;

/** One part: a name, a nominal canvas, and the body of its SVG. */
export interface Part {
  /** The PNG basename, which is also the atlas region name (AUTHORING.md R5). */
  name: string;
  /** Nominal width, before {@link rasterise}'s scale. */
  w: number;
  /** Nominal height, before {@link rasterise}'s scale. */
  h: number;
  /** SVG markup, in a `0 0 w h` viewBox. */
  body: string;
}

/** Convenience for building a {@link Part} list. */
export function part(name: string, w: number, h: number, body: string): Part {
  return { name, w, h, body };
}

// --- the character ---------------------------------------------------------

const EYE = (cx: number): string => `
  <ellipse cx="${cx}" cy="42" rx="30" ry="34" fill="${INK}"/>
  <ellipse cx="${cx + 10}" cy="30" rx="11" ry="12" fill="#ffffff"/>
  <ellipse cx="${cx - 11}" cy="54" rx="6" ry="6" fill="#ffffff" opacity="0.6"/>
`;

const LID = (cx: number): string => `
  <path d="M${cx - 30} 34 q 30 30 60 0" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>
  <path d="M${cx - 34} 22 l -7 -8 M${cx + 34} 22 l 7 -8" stroke="${INK}" stroke-width="7" stroke-linecap="round" opacity="0.7"/>
`;

const EAR_BODY = `
  <path d="M46 6 C 64 42, 82 76, 86 106 C 62 113, 30 113, 6 106 C 10 76, 28 42, 46 6 Z"
        fill="${FUR}" stroke="${INK}" stroke-width="${SW}"/>
  <path d="M46 44 C 56 66, 65 86, 67 98 C 54 101, 38 101, 25 98 C 27 86, 36 66, 46 44 Z"
        fill="${BLUSH}" opacity="0.7"/>
`;

const LEG_BODY = `
  <path d="M42 6 C 62 6, 70 26, 70 52 L 70 88 C 70 108, 58 118, 42 118 C 26 118, 14 108, 14 88 L 14 52 C 14 26, 22 6, 42 6 Z"
        fill="${FUR}" stroke="${INK}" stroke-width="${SW}"/>
  <ellipse cx="42" cy="96" rx="20" ry="14" fill="${FUR_LT}"/>
  <path d="M32 100 l 0 12 M42 101 l 0 13 M52 100 l 0 12" stroke="${INK}" stroke-width="5" stroke-linecap="round" opacity="0.55"/>
`;

/** The scarf tail's centreline, and the fringe that frays off its end. */
const TAIL_PATH = 'M240 42 C 186 40, 122 64, 72 98 C 52 112, 38 124, 30 134';
const TAIL_FRINGE = 'M30 134 l -20 16 M42 144 l -12 22 M58 152 l -4 24 M76 154 l 6 24';

/**
 * Where the scarf tail hangs from, in its own image pixels (y down).
 *
 * The plate is anchored under the collar rather than at its own centre, so the
 * tail swings from the neck when its bone turns. A rig states that as the
 * attachment offset from the plate's CENTRE — which is what
 * {@link tailOffset} works out, because doing the subtraction by hand in two
 * rig specs is how one of them ends up hanging the scarf off a shoulder.
 */
export const TAIL_ANCHOR = { x: 200, y: 38 } as const;

/**
 * The scarf tail's `x`/`y` attachment offset, in SPINE coordinates (y up), for
 * a given rasterisation scale.
 *
 * A region attachment with no offset draws centred on its slot's bone
 * (AUTHORING.md §3.4). To hang the tail from {@link TAIL_ANCHOR} instead, the
 * offset is the vector from the anchor to the plate's centre, with y negated
 * for Spine's frame.
 */
export function tailOffset(scale: number): { x: number; y: number } {
  const w = Math.round(280 * scale);
  const h = Math.round(184 * scale);
  return {
    x: Math.round(w / 2 - TAIL_ANCHOR.x * scale),
    y: -Math.round(h / 2 - TAIL_ANCHOR.y * scale),
  };
}

/**
 * The twelve character parts, at nominal size.
 *
 * `eyes` and `eyes_shut` are two attachments for one slot: a blink is an
 * `attachment` timeline, not a second head.
 */
export function rigbyParts(): Part[] {
  return [
    part(
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
    ),
    part('eyes', 216, 84, `${EYE(38)}${EYE(178)}`),
    part('eyes_shut', 216, 84, `${LID(38)}${LID(178)}`),
    part('ear_l', 92, 114, `<g transform="scale(-1,1) translate(-92,0)">${EAR_BODY}</g>`),
    part('ear_r', 92, 114, EAR_BODY),
    part(
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
    ),
    part('leg_l', 84, 124, `<g transform="scale(-1,1) translate(-84,0)">${LEG_BODY}</g>`),
    part('leg_r', 84, 124, LEG_BODY),
    part(
      'arm_b',
      72,
      216,
      `
  <path d="M36 6 C 54 6, 62 22, 62 44 L 62 168 C 62 194, 52 210, 36 210 C 20 210, 10 194, 10 168 L 10 44 C 10 22, 18 6, 36 6 Z"
        fill="${FUR_DK}" stroke="${INK}" stroke-width="${SW}"/>
  <ellipse cx="36" cy="186" rx="17" ry="14" fill="${FUR_LT}" opacity="0.75"/>
`,
    ),
    part(
      'arm_f',
      72,
      124,
      `
  <path d="M36 6 C 55 6, 63 22, 63 46 L 63 92 C 63 112, 52 118, 36 118 C 20 118, 9 112, 9 92 L 9 46 C 9 22, 17 6, 36 6 Z"
        fill="${FUR}" stroke="${INK}" stroke-width="${SW}"/>
  <path d="M18 34 A 26 30 0 0 1 40 14" fill="none" stroke="${FUR_LT}" stroke-width="11" stroke-linecap="round" opacity="0.6"/>
`,
    ),
    part(
      'hand_f',
      68,
      112,
      `
  <path d="M34 6 C 52 6, 60 20, 60 42 L 60 68 C 60 94, 50 106, 34 106 C 18 106, 8 94, 8 68 L 8 42 C 8 20, 16 6, 34 6 Z"
        fill="${FUR}" stroke="${INK}" stroke-width="${SW}"/>
  <ellipse cx="34" cy="76" rx="21" ry="16" fill="${FUR_LT}"/>
  <path d="M22 66 l -3 -13 M34 63 l 0 -14 M46 66 l 3 -13" stroke="${INK}" stroke-width="6" stroke-linecap="round" opacity="0.5"/>
`,
    ),
    part(
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
    ),
    // Drawn as a STROKED centreline rather than a filled silhouette: a scarf
    // keeps its width along its length, and a fill authored by hand tapers to a
    // leaf without meaning to.
    part(
      'scarf_tail',
      280,
      184,
      `
  <path d="${TAIL_FRINGE}" fill="none" stroke="${INK}" stroke-width="24" stroke-linecap="round"/>
  <path d="${TAIL_PATH}" fill="none" stroke="${INK}" stroke-width="58" stroke-linecap="round"/>
  <path d="${TAIL_FRINGE}" fill="none" stroke="${TEAL_DK}" stroke-width="11" stroke-linecap="round"/>
  <path d="${TAIL_PATH}" fill="none" stroke="${TEAL}" stroke-width="40" stroke-linecap="round"/>
  <path d="M226 36 C 176 38, 116 62, 66 98" fill="none" stroke="${TEAL_DK}" stroke-width="7" stroke-linecap="round" opacity="0.55"/>
  <path d="M166 44 C 174 56, 177 64, 176 76" fill="none" stroke="${TEAL_DK}" stroke-width="8" stroke-linecap="round" opacity="0.8"/>
  <path d="M110 70 C 118 82, 121 90, 120 102" fill="none" stroke="${TEAL_DK}" stroke-width="8" stroke-linecap="round" opacity="0.8"/>
  <path d="M60 100 C 68 112, 71 120, 70 132" fill="none" stroke="${TEAL_DK}" stroke-width="8" stroke-linecap="round" opacity="0.8"/>
`,
    ),
  ];
}

// --- optional parts, asked for by name -------------------------------------
//
// ⭐ These are NOT in {@link rigbyParts}, and that is the whole point of the
// split: `rasterise(rigbyParts(), …)` writes every part in the list, so adding
// a leg segment or a prop there would drop unused PNGs into every other
// example's `parts/` the next time its art script ran. They live here rather
// than in one example's own script because they are the *character's* — a
// segmented leg and his ball are Rigby, and a second drawing of either is a
// second character.

/** The leg, split at the knee — hip-to-knee. See {@link legSegments}. */
const THIGH_BODY = (fill: string): string => `
  <path d="M32 6 C 50 6, 57 20, 57 42 L 57 62 C 57 82, 47 90, 32 90 C 17 90, 7 82, 7 62 L 7 42 C 7 20, 14 6, 32 6 Z"
        fill="${fill}" stroke="${INK}" stroke-width="${SW}"/>
  <path d="M16 32 A 22 26 0 0 1 34 14" fill="none" stroke="${FUR_LT}" stroke-width="10" stroke-linecap="round" opacity="0.5"/>
`;

/** The leg, split at the knee — knee-to-sole, foot pad included. */
const SHIN_BODY = (fill: string): string => `
  <path d="M32 6 C 48 6, 55 18, 55 38 L 55 64 C 55 86, 46 96, 32 96 C 18 96, 9 86, 9 64 L 9 38 C 9 18, 16 6, 32 6 Z"
        fill="${fill}" stroke="${INK}" stroke-width="${SW}"/>
  <ellipse cx="32" cy="76" rx="19" ry="13" fill="${FUR_LT}"/>
  <path d="M23 80 l 0 11 M32 81 l 0 12 M41 80 l 0 11" stroke="${INK}" stroke-width="5" stroke-linecap="round" opacity="0.55"/>
`;

/**
 * The leg in two plates, for a knee — `<suffix>` names the pair.
 *
 * 🚨 **Both plates are drawn from their own joint, and the joint's position in
 * each is a number the rig has to know.** The hip pivot is at (32, 20) in the
 * thigh and the knee pivot at (32, 20) in the shin; the knee is at (32, 76) in
 * the thigh and the sole at (32, 94) in the shin. Those four points are what a
 * two-bone IK chain's `length` and its attachment offsets are measured from —
 * `gallery/walk/rig.json` states all four and its README shows the arithmetic.
 *
 * The near and far leg are one drawing in two fur tones, the way the far arm
 * already is: that is what reads as depth on a flat figure, and it costs a
 * parameter rather than a second drawing.
 */
export function legSegments(suffix: string, fill: string): Part[] {
  return [part(`thigh_${suffix}`, 64, 96, THIGH_BODY(fill)), part(`shin_${suffix}`, 64, 102, SHIN_BODY(fill))];
}

/**
 * Rigby's ball — the companion prop, and the part `gallery/squash` bends.
 *
 * A plain disc rather than anything clever, because every vertex offset in a
 * `deform` timeline has to be readable against a shape a reader can hold in
 * their head. A circle of known radius is that shape.
 *
 * 🚨 **The two radii below are not the same number and the gap between them is
 * load-bearing.** {@link R_BALL_INK} is where the ink outline ends;
 * {@link R_BALL_RIM} is where a mesh's eight rim vertices sit, and eight
 * vertices form an **octagon**, whose sides pass `R · cos(22.5°)` from the
 * centre — 8% closer in than its own vertices. Texture outside a mesh's
 * triangles is not drawn, so a rim placed *on* the silhouette eats the outline
 * everywhere except along the eight spokes and the ball renders as a flat teal
 * disc with no line around it. Nothing reports that: the mesh is valid, the uvs
 * are in range, the gate is green (issue #277). The **inradius** is what has to
 * clear the art:
 *
 *     R_BALL_RIM · cos(π / 8) = 110 · 0.92388 = 101.6  >  94.5 = R_BALL_INK
 */
export const R_BALL_INK = 94.5;
export const R_BALL_RIM = 110;
/** Half the ball part's canvas. The rim must fit inside it or the uvs leave 0..1. */
export const R_BALL_CANVAS = 120;

export function ballPart(): Part {
  const m = R_BALL_CANVAS;
  return part(
    'ball',
    2 * m,
    2 * m,
    `
  <ellipse cx="${m}" cy="${m}" rx="${R_BALL_INK - SW / 2}" ry="${R_BALL_INK - SW / 2}"
           fill="${TEAL}" stroke="${INK}" stroke-width="${SW}"/>
  <path d="M${m - 76} ${m + 20} C ${m - 43} ${m + 47}, ${m + 43} ${m + 47}, ${m + 76} ${m + 20}"
        fill="none" stroke="${TEAL_DK}" stroke-width="11" stroke-linecap="round" opacity="0.85"/>
  <path d="M${m - 60} ${m - 37} C ${m - 31} ${m - 56}, ${m + 31} ${m - 56}, ${m + 60} ${m - 37}"
        fill="none" stroke="${TEAL_DK}" stroke-width="9" stroke-linecap="round" opacity="0.45"/>
  <ellipse cx="${m - 31}" cy="${m - 31}" rx="24" ry="17" fill="${FUR_LT}" opacity="0.75"/>
`,
  );
}

/**
 * A soft cast shadow, as its own part.
 *
 * A stage plate can bake the shadow of anything that stands still. This one is
 * for something that does not: a slot's own bone can scale and fade it, which is
 * how a bouncing prop keeps its contact with the ground while it is nowhere near
 * it. `id` is in the markup, so a part list may only hold one of these.
 */
export function castShadowPart(name: string, rx: number, ry: number): Part {
  const w = Math.ceil(2 * rx) + 8;
  const h = Math.ceil(2 * ry) + 8;
  return part(
    name,
    w,
    h,
    `
  <defs>
    <radialGradient id="cast" gradientUnits="userSpaceOnUse" cx="${w / 2}" cy="${h / 2}" r="${rx}"
                    gradientTransform="translate(${w / 2} ${h / 2}) scale(1 ${(ry / rx).toFixed(6)}) translate(${-w / 2} ${-h / 2})">
      <stop offset="0"    stop-color="#000000" stop-opacity="0.62"/>
      <stop offset="0.55" stop-color="#000000" stop-opacity="0.30"/>
      <stop offset="1"    stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="${w / 2}" cy="${h / 2}" rx="${rx}" ry="${ry}" fill="url(#cast)"/>
`,
  );
}

/**
 * A stage plate: flat ground, a glow behind the figure, a baked contact shadow.
 *
 * Every number is in **plate pixels, y down** — the frame the part bodies above
 * are written in — so a caller converts once, out of the rig spec's y-up world.
 * `gallery/stage.ts` is what does that conversion, and it reads the bone
 * positions rather than repeating them: two copies of these coordinates is
 * exactly how a contact shadow ends up under nobody's feet.
 */
export function stagePlatePart(
  width: number,
  height: number,
  glow: { x: number; y: number; r: number },
  shadow: { x: number; y: number; rx: number; ry: number },
): Part {
  return part(
    'plate',
    width,
    height,
    `
  <defs>
    <radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="${glow.x}" cy="${glow.y}" r="${glow.r}">
      <stop offset="0"    stop-color="#3b4859" stop-opacity="0.85"/>
      <stop offset="0.45" stop-color="#2a3340" stop-opacity="0.44"/>
      <stop offset="1"    stop-color="${GROUND}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="floor" gradientUnits="userSpaceOnUse" cx="${shadow.x}" cy="${shadow.y}" r="${shadow.rx}"
                    gradientTransform="translate(${shadow.x} ${shadow.y}) scale(1 ${(shadow.ry / shadow.rx).toFixed(6)}) translate(${-shadow.x} ${-shadow.y})">
      <stop offset="0"   stop-color="#000000" stop-opacity="0.58"/>
      <stop offset="0.6" stop-color="#000000" stop-opacity="0.24"/>
      <stop offset="1"   stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="${GROUND}"/>
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#glow)"/>
  <ellipse cx="${shadow.x}" cy="${shadow.y}" rx="${shadow.rx}" ry="${shadow.ry}" fill="url(#floor)"/>
`,
  );
}

// --- rasterising -----------------------------------------------------------

/**
 * The one external tool the gallery's art scripts need.
 *
 * `rsvg-convert` already writes 8-bit, non-interlaced, **straight**-alpha
 * colour-type-6 PNGs, which is exactly what rigc's decoder reads and what
 * `A19_OVERLAY_PNGS_HAVE_ALPHA` wants — verified on its output rather than
 * assumed, so there is no second pass through an image tool to undo. Straight
 * alpha is the setting worth checking: a premultiplied part gains a dark rim
 * that no assertion can see.
 */
const RSVG = 'rsvg-convert';

async function haveRsvg(): Promise<boolean> {
  try {
    await $`${RSVG} --version`.quiet();
    return true;
  } catch {
    return false;
  }
}

/**
 * Render every part to `outDir/<name>.png` at `scale` times its nominal size.
 *
 * The SVGs are intermediates and are written to a temporary directory: the
 * committed artifact is the PNG, because that is what the rig spec names.
 */
export async function rasterise(parts: Part[], outDir: string, scale: number): Promise<void> {
  if (!(await haveRsvg())) {
    throw new Error(
      `${RSVG} is not on PATH. The gallery's PNGs are committed, so building and rendering an example needs ` +
        `nothing; re-DRAWING the art needs librsvg (\`brew install librsvg\`, \`apt install librsvg2-bin\`).`,
    );
  }
  mkdirSync(outDir, { recursive: true });
  const svgDir = mkdtempSync(join(tmpdir(), 'rigc-gallery-'));
  try {
    for (const p of parts) {
      const w = Math.round(p.w * scale);
      const h = Math.round(p.h * scale);
      const svgPath = join(svgDir, `${p.name}.svg`);
      await Bun.write(
        svgPath,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${p.w}" height="${p.h}" viewBox="0 0 ${p.w} ${p.h}">${p.body}</svg>`,
      );
      await $`${RSVG} -w ${w} -h ${h} -o ${join(outDir, `${p.name}.png`)} ${svgPath}`.quiet();
      console.log(`  ${p.name.padEnd(14)} ${w}x${h}`);
    }
  } finally {
    rmSync(svgDir, { recursive: true, force: true });
  }
}
