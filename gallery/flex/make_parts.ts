/**
 * Draws every part PNG this example needs.
 *
 *   bun gallery/flex/make_parts.ts
 *
 * The PNGs are committed, so nobody needs to run this to build or render the
 * example. It needs `rsvg-convert` (librsvg) on PATH.
 *
 * ## Everything here is drawn for the generator to trace
 *
 * A `contour` mesh takes **no geometry and no size**: rigc traces the outline
 * off the part's own alpha, so the numbers in the mesh cannot disagree with the
 * pixels. That inverts the usual authoring order — the art is not decoration
 * over a mesh somebody wrote, it *is* the mesh — and it puts two constraints on
 * the drawing that a region attachment would not care about:
 *
 * 1. **A part with no transparent pixel is refused**, by name and for a reason:
 *    its silhouette IS the part window, so a contour of it is a region with
 *    extra vertices. So the banner panels' hems undulate and their windows have
 *    transparent air above and below. Their LEFT and RIGHT edges still run to
 *    the window's edge, because that is where they butt against the next panel.
 * 2. **The hems have to agree across a seam.** Three panels drawn independently
 *    join at two visible steps. So every hem here is one function of a GLOBAL x,
 *    sampled over each panel's own slice of it — {@link hemTop} /
 *    {@link hemBottom} — and the panels line up because they are cut out of one
 *    curve rather than drawn to match.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  INK,
  LEAF,
  LEAF_DK,
  METAL,
  METAL_DK,
  SUN,
  TEAL,
  TEAL_DK,
  WOOD,
  WOOD_DK,
  part,
  rasterise,
  rigbyParts,
  type Part,
} from '../rigby.ts';

const HERE = new URL('.', import.meta.url).pathname;
const OUT = join(HERE, 'parts');
mkdirSync(OUT, { recursive: true });

/** Rasterisation scale for every part in this example. */
const ART_SCALE = 0.5;

/** The stage, in Spine world units — `rig.json`'s `skeleton.width`/`height`. */
const STAGE_W = 1100;
const STAGE_H = 720;

/** SVG is y-down and Spine is y-up. */
const flip = (y: number): number => STAGE_H - y;

const props: Part[] = [];

// --- the stage plate -------------------------------------------------------
{
  const grass = Array.from({ length: 90 }, (_, i) => {
    const x = ((i * 0.7548776662) % 1) * STAGE_W;
    const h = 12 + ((i * 0.4142135624) % 1) * 26;
    const lean = -6 + ((i * 0.5698402909) % 1) * 16;
    const base = 190 - ((i * 0.3166247904) % 1) * 118;
    return `<path d="M${x.toFixed(1)} ${flip(base).toFixed(1)} q ${(lean / 2).toFixed(1)} ${(-h / 2).toFixed(
      1,
    )} ${lean.toFixed(1)} ${(-h).toFixed(1)}" fill="none" stroke="${
      base > 140 ? '#5f8f52' : '#4a7342'
    }" stroke-width="5" stroke-linecap="round" opacity="0.85"/>`;
  }).join('');
  const clouds = [
    [200, 610, 96],
    [470, 662, 62],
    [830, 596, 78],
  ]
    .map(
      ([cx, cy, r]) =>
        `<g opacity="0.9"><ellipse cx="${cx}" cy="${flip(cy)}" rx="${r}" ry="${r * 0.5}" fill="#ffffff"/>` +
        `<ellipse cx="${cx - r * 0.55}" cy="${flip(cy - r * 0.16)}" rx="${r * 0.6}" ry="${r * 0.38}" fill="#ffffff"/>` +
        `<ellipse cx="${cx + r * 0.6}" cy="${flip(cy - r * 0.2)}" rx="${r * 0.52}" ry="${
          r * 0.34
        }" fill="#ffffff"/></g>`,
    )
    .join('');
  props.push(
    part(
      'plate',
      STAGE_W,
      STAGE_H,
      `
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0"    stop-color="#7EC4E8"/>
      <stop offset="0.62" stop-color="#BEE3F2"/>
      <stop offset="1"    stop-color="#E6F3E0"/>
    </linearGradient>
  </defs>
  <rect width="${STAGE_W}" height="${STAGE_H}" fill="url(#sky)"/>
  ${clouds}
  <path d="M0 ${flip(228)} C 210 ${flip(268)}, 430 ${flip(196)}, 660 ${flip(232)}
           C 880 ${flip(266)}, 1000 ${flip(202)}, ${STAGE_W} ${flip(226)}
           L ${STAGE_W} ${STAGE_H} L 0 ${STAGE_H} Z"
        fill="#9CC98C" opacity="0.75"/>
  <path d="M0 ${flip(176)} C 240 ${flip(206)}, 470 ${flip(150)}, 700 ${flip(184)}
           C 900 ${flip(212)}, 1010 ${flip(158)}, ${STAGE_W} ${flip(180)}
           L ${STAGE_W} ${STAGE_H} L 0 ${STAGE_H} Z"
        fill="#6FA860"/>
  <path d="M0 ${flip(96)} C 260 ${flip(122)}, 520 ${flip(72)}, 780 ${flip(104)}
           C 950 ${flip(124)}, 1030 ${flip(80)}, ${STAGE_W} ${flip(98)}
           L ${STAGE_W} ${STAGE_H} L 0 ${STAGE_H} Z"
        fill="#588F4C"/>
  ${grass}
  <g opacity="0.9">
    <ellipse cx="300" cy="${flip(90)}" rx="62" ry="13" fill="#3f6b38" opacity="0.42"/>
    <ellipse cx="152" cy="${flip(94)}" rx="30" ry="8"  fill="#3f6b38" opacity="0.38"/>
    <ellipse cx="602" cy="${flip(98)}" rx="34" ry="9"  fill="#3f6b38" opacity="0.38"/>
  </g>
`,
    ),
  );
}

// --- the banner's hems, as one function of a global x ----------------------
// Sampled per panel below. The two waves are out of phase, so the cloth's width
// varies along its length instead of the whole strip bowing.

/**
 * How far each panel's art reaches back UNDER its left-hand neighbour, nominal.
 *
 * ⭐ This is the whole answer to "a contour mesh is pinned to its slot bone and
 * no bone bends it". Three rigid panels hinged at their seams cannot bend AT a
 * seam: rotating one about a point opens a wedge above the hinge and closes one
 * below it, and the wedge is `halfHeight * tan(angle)` wide — about 22px at 20
 * degrees on this cloth. So every panel is drawn wider than its slice and each
 * one is drawn ON TOP of the one behind it, which hides the wedge inside the
 * overlap. `rig.json`'s hinge spacing is still the exact slice width; only the
 * ART is wider, and the panel's slot bone therefore sits at
 * `width / 2 - OVERLAP` from its hinge rather than at the slice's midpoint.
 *
 * The bend angles in `motion.json` are chosen against this number, not the
 * other way round.
 */
const OVERLAP = 48;
/** The slice each panel owns, nominal — the hinge spacing in `rig.json` x 2. */
const SLICE = [240, 240, 280] as const;
/** Panel widths, nominal: the slice plus the overlap that hides the wedge. */
const PANEL_W = [SLICE[0] + OVERLAP, SLICE[1] + OVERLAP, SLICE[2] + OVERLAP] as const;
/** Panel height, nominal. Both hems live inside it with air to spare. */
const PANEL_H = 300;
/** Where each panel's WINDOW starts on the global x the hems are a function of. */
const PANEL_X0 = [-OVERLAP, SLICE[0] - OVERLAP, SLICE[0] + SLICE[1] - OVERLAP] as const;

const hemTop = (gx: number): number => 48 + 22 * Math.sin((2 * Math.PI * gx) / 460);
const hemBottom = (gx: number): number => 252 + 22 * Math.sin((2 * Math.PI * gx) / 460 + 1.2);

/** A polyline along one hem across a panel, as SVG `L` commands. */
function hemPath(index: number, hem: (gx: number) => number, reverse: boolean): Array<[number, number]> {
  const w = PANEL_W[index];
  const x0 = PANEL_X0[index];
  const steps = 24;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const lx = (w * i) / steps;
    pts.push([lx, hem(x0 + lx)]);
  }
  return reverse ? pts.reverse() : pts;
}

/**
 * The silhouette of one panel: along the top hem, down the right edge, back
 * along the bottom hem, up the left edge.
 *
 * `tail` cuts a swallow-tail notch into the right edge instead of running it
 * straight down — the shape a rectangle of region genuinely cannot be.
 */
function panelOutline(index: number, tail: boolean): string {
  const w = PANEL_W[index];
  const top = hemPath(index, hemTop, false);
  const bottom = hemPath(index, hemBottom, true);
  const d = [`M${top[0][0].toFixed(2)} ${top[0][1].toFixed(2)}`];
  for (const [x, y] of top.slice(1)) d.push(`L${x.toFixed(2)} ${y.toFixed(2)}`);
  if (tail) {
    const yTop = top[top.length - 1][1];
    const yBottom = bottom[0][1];
    const apexY = (yTop + yBottom) / 2;
    d.push(`L${(w - 118).toFixed(2)} ${apexY.toFixed(2)}`);
  }
  for (const [x, y] of bottom) d.push(`L${x.toFixed(2)} ${y.toFixed(2)}`);
  d.push('Z');
  return d.join(' ');
}

/** A five-pointed star, wound so `fill-rule="evenodd"` punches it out. */
function star(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${pts.join(' L')} Z`;
}

// --- the three banner panels ----------------------------------------------
// Each is its own slot with its own contour mesh, and each hangs off its own
// HINGE bone at the seam — see `rig.json`. A contour mesh is pinned to its slot
// bone at weight 1 and no bone bends it, so a waving banner is a chain of rigid
// panels rather than one deforming sheet, and the seams are where the bend is
// allowed to happen.
const PANEL_FILL = [TEAL, SUN, TEAL] as const;
const PANEL_SHADE = [TEAL_DK, '#C9822A', TEAL_DK] as const;

for (let i = 0; i < 3; i++) {
  const w = PANEL_W[i];
  const outline = panelOutline(i, i === 2);
  const hole = i === 1 ? ` ${star(OVERLAP + SLICE[1] / 2, PANEL_H / 2, 54, 23)}` : '';
  const top = hemPath(i, hemTop, false);
  const bottom = hemPath(i, hemBottom, false);
  const asPath = (pts: Array<[number, number]>): string =>
    `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)} ` +
    pts
      .slice(1)
      .map(([x, y]) => `L${x.toFixed(2)} ${y.toFixed(2)}`)
      .join(' ');
  // ⭐ Every mark is CLIPPED to the silhouette, and that is a contour rule
  // rather than a tidiness one. A fold line that overshoots a hem by three
  // pixels is invisible on a region attachment and load-bearing here: the
  // tracer works off alpha, so those pixels either bulge the outline or — if
  // they are detached — become a second island and get the build refused by
  // name. What the drawing says the shape is, the mesh will be.
  //
  // The hems are outlined and the left/right edges are NOT: a stroke there
  // would draw a seam line down the middle of the banner at every join.
  props.push(
    part(
      `flag_${'abc'[i]}`,
      w,
      PANEL_H,
      `
  <defs><clipPath id="cloth"><path d="${outline}${hole}" clip-rule="evenodd"/></clipPath></defs>
  <path d="${outline}${hole}" fill-rule="evenodd" fill="${PANEL_FILL[i]}"/>
  <g clip-path="url(#cloth)">
    <path d="${asPath(top)}" fill="none" stroke="${INK}" stroke-width="15" stroke-linecap="butt"/>
    <path d="${asPath(bottom)}" fill="none" stroke="${INK}" stroke-width="15" stroke-linecap="butt"/>
    ${
      i === 2
        ? `<path d="M${w} ${top[top.length - 1][1].toFixed(2)} L${(w - 118).toFixed(2)} ${(
            (top[top.length - 1][1] + bottom[bottom.length - 1][1]) /
            2
          ).toFixed(2)} L${w} ${bottom[bottom.length - 1][1].toFixed(
            2,
          )}" fill="none" stroke="${INK}" stroke-width="15" stroke-linejoin="round"/>`
        : ''
    }
    ${hole ? `<path d="${hole}" fill="none" stroke="${INK}" stroke-width="14"/>` : ''}
    <path d="${asPath(top.map(([x, y]) => [x, y + 22] as [number, number]))}" fill="none" stroke="${
      PANEL_SHADE[i]
    }" stroke-width="9" stroke-linecap="butt" opacity="0.75"/>
    <path d="${asPath(bottom.map(([x, y]) => [x, y - 17] as [number, number]))}" fill="none" stroke="${
      PANEL_SHADE[i]
    }" stroke-width="7" stroke-linecap="butt" opacity="0.55"/>
  </g>
`,
    ),
  );
}

// --- the mast --------------------------------------------------------------
// A rectangle IS the right shape for a pole, so this one is a plain REGION
// attachment. Reaching for a mesh here would buy vertices and spend them on
// nothing — the contour generator is for silhouettes a quad gets wrong.
props.push(
  part(
    'mast',
    60,
    680,
    `
  <path d="M30 44 L30 674" stroke="${INK}" stroke-width="34" stroke-linecap="round"/>
  <path d="M30 44 L30 674" stroke="${WOOD}" stroke-width="24" stroke-linecap="round"/>
  <path d="M24 60 L24 660" stroke="${WOOD_DK}" stroke-width="7" stroke-linecap="round" opacity="0.6"/>
  <circle cx="30" cy="26" r="22" fill="${SUN}" stroke="${INK}" stroke-width="9"/>
  <rect x="10" y="120" width="40" height="16" rx="6" fill="${METAL}" stroke="${INK}" stroke-width="8"/>
  <rect x="10" y="392" width="40" height="16" rx="6" fill="${METAL_DK}" stroke="${INK}" stroke-width="8"/>
`,
  ),
);

// --- the sprig -------------------------------------------------------------
props.push(
  part(
    'sprig',
    44,
    320,
    `
  <path d="M22 314 C 16 220, 26 120, 22 8" fill="none" stroke="${INK}" stroke-width="28" stroke-linecap="round"/>
  <path d="M22 314 C 16 220, 26 120, 22 8" fill="none" stroke="${LEAF_DK}" stroke-width="17" stroke-linecap="round"/>
  <path d="M20 210 l -14 -16 M25 132 l 14 -14" fill="none" stroke="${LEAF_DK}" stroke-width="8" stroke-linecap="round"/>
`,
  ),
);

// --- the leaf --------------------------------------------------------------
// The other kind of silhouette worth a contour: nine teeth a side, a point at
// the tip, and a stalk. A region attachment of this draws a 240x340 quad of
// which the leaf is under a third, and the rest is transparent pixels the
// renderer still blends.
{
  const W = 240;
  const H = 340;
  const cx = W / 2;
  const TIP = 26;
  const BASE = 286;
  const TEETH = 18;
  /** Half-width of the blade at `s` in 0..1 from tip to base, plus the saw. */
  const halfWidth = (s: number, i: number): number => {
    const ovate = 92 * Math.pow(Math.sin(Math.PI * Math.min(1, s * 0.86 + 0.07)), 0.72);
    return ovate + (i % 2 === 0 ? 0 : 10);
  };
  const right: Array<[number, number]> = [];
  const left: Array<[number, number]> = [];
  for (let i = 0; i <= TEETH; i++) {
    const s = i / TEETH;
    const y = TIP + (BASE - TIP) * s;
    const hw = halfWidth(s, i);
    right.push([cx + hw, y]);
    left.push([cx - hw, y]);
  }
  const blade =
    `M${cx} ${TIP} ` +
    right.map(([x, y]) => `L${x.toFixed(2)} ${y.toFixed(2)}`).join(' ') +
    ` L${cx} ${BASE + 8} ` +
    left
      .reverse()
      .map(([x, y]) => `L${x.toFixed(2)} ${y.toFixed(2)}`)
      .join(' ') +
    ' Z';
  const veins = Array.from({ length: 7 }, (_, i) => {
    const s = 0.16 + i * 0.12;
    const y = TIP + (BASE - TIP) * s;
    const hw = halfWidth(s, 0) * 0.82;
    return (
      `<path d="M${cx} ${(y + 18).toFixed(1)} L${(cx + hw).toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="${LEAF_DK}" ` +
      `stroke-width="6" stroke-linecap="round" opacity="0.75"/>` +
      `<path d="M${cx} ${(y + 18).toFixed(1)} L${(cx - hw).toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="${LEAF_DK}" ` +
      `stroke-width="6" stroke-linecap="round" opacity="0.75"/>`
    );
  }).join('\n  ');
  props.push(
    part(
      'leaf',
      W,
      H,
      `
  <path d="M${cx} ${BASE} L${cx - 4} ${H - 6}" fill="none" stroke="${INK}" stroke-width="24" stroke-linecap="round"/>
  <path d="M${cx} ${BASE} L${cx - 4} ${H - 6}" fill="none" stroke="${LEAF_DK}" stroke-width="14" stroke-linecap="round"/>
  <path d="${blade}" fill="${LEAF}" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
  ${veins}
  <path d="M${cx} ${TIP + 14} L${cx} ${BASE}" fill="none" stroke="${LEAF_DK}" stroke-width="9" stroke-linecap="round"/>
`,
    ),
  );
}

// --- rasterise -------------------------------------------------------------
console.log(`character parts (nominal x ${ART_SCALE}):`);
await rasterise(rigbyParts(), OUT, ART_SCALE);
console.log(`props (nominal x ${ART_SCALE}):`);
await rasterise(
  props.filter((p) => p.name !== 'plate'),
  OUT,
  ART_SCALE,
);
console.log('stage plate (drawn at world size):');
await rasterise(
  props.filter((p) => p.name === 'plate'),
  OUT,
  1,
);
