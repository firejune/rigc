/**
 * Draws every part PNG this example needs, and then checks the one number that
 * two files both know.
 *
 *   bun gallery/ride/make_parts.ts
 *
 * The PNGs are committed, so nobody needs to run this to build or render the
 * example — it is here so the art is reproducible and so the check below has
 * somewhere to live. It needs `rsvg-convert` (librsvg) on PATH.
 *
 * ## The check
 *
 * The rail is drawn from `curve.ts`; the path attachment in `rig.json` is
 * written out by hand from the same list, because a rig spec is the artifact a
 * reader learns from and a generated one teaches nothing. That makes two copies,
 * so the last thing this script does is read `rig.json` back and refuse to
 * finish if they have drifted apart. A drift is otherwise invisible: the gate
 * has no opinion about where a rail was painted.
 */
import { mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GROUND,
  INK,
  METAL,
  METAL_DK,
  SUN,
  WOOD,
  WOOD_DK,
  part,
  rasterise,
  rigbyParts,
  type Part,
} from '../rigby.ts';
import { ART_SCALE, POINTS, STAGE_H, STAGE_W, WHEEL_RADIUS, polyline, svgPath, vertices } from './curve.ts';

const HERE = new URL('.', import.meta.url).pathname;
const OUT = join(HERE, 'parts');
mkdirSync(OUT, { recursive: true });

/** SVG is y-down and Spine is y-up; this is the only conversion in the file. */
const flip = (y: number): number => STAGE_H - y;

/** Drawn at final size: the stage plate and the rail are already world-scaled. */
const stageProps: Part[] = [];
/** Drawn at 2x and rasterised down, like the character parts. */
const vehicleProps: Part[] = [];

// --- the stage plate -------------------------------------------------------
// Dusk over a valley, and the only part in this example allowed to be opaque:
// `A19_OVERLAY_PNGS_HAVE_ALPHA` exempts the full-stage base plate and refuses
// every other part that cannot be transparent.
{
  const stars = Array.from({ length: 46 }, (_, i) => {
    // A fixed pseudo-random scatter: two irrationals mod 1, so the field is
    // reproducible without a seeded generator and without a table of 92 numbers.
    const x = ((i * 0.7548776662) % 1) * STAGE_W;
    const y = ((i * 0.5698402909) % 1) * STAGE_H * 0.55;
    const r = 1.6 + ((i * 0.4142135624) % 1) * 2.2;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="#ffffff" opacity="${(
      0.25 +
      ((i * 0.3166247904) % 1) * 0.5
    ).toFixed(2)}"/>`;
  }).join('');
  stageProps.push(
    part(
      'plate',
      STAGE_W,
      STAGE_H,
      `
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0"    stop-color="#171a24"/>
      <stop offset="0.52" stop-color="#2b2f45"/>
      <stop offset="0.78" stop-color="#4a3d55"/>
      <stop offset="1"    stop-color="${GROUND}"/>
    </linearGradient>
    <radialGradient id="moon" cx="0.82" cy="0.16" r="0.34">
      <stop offset="0"   stop-color="#ffe9b8" stop-opacity="0.55"/>
      <stop offset="0.4" stop-color="#ffe9b8" stop-opacity="0.14"/>
      <stop offset="1"   stop-color="#ffe9b8" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${STAGE_W}" height="${STAGE_H}" fill="url(#sky)"/>
  ${stars}
  <rect width="${STAGE_W}" height="${STAGE_H}" fill="url(#moon)"/>
  <circle cx="${STAGE_W * 0.82}" cy="${STAGE_H * 0.16}" r="26" fill="#FDF0CE"/>
  <path d="M0 ${flip(210)} C 180 ${flip(250)}, 330 ${flip(150)}, 520 ${flip(180)}
           C 720 ${flip(212)}, 900 ${flip(140)}, ${STAGE_W} ${flip(178)}
           L ${STAGE_W} ${STAGE_H} L 0 ${STAGE_H} Z"
        fill="#2a2b3a" opacity="0.85"/>
  <path d="M0 ${flip(120)} C 240 ${flip(150)}, 470 ${flip(70)}, 700 ${flip(104)}
           C 940 ${flip(140)}, 1120 ${flip(60)}, ${STAGE_W} ${flip(96)}
           L ${STAGE_W} ${STAGE_H} L 0 ${STAGE_H} Z"
        fill="${GROUND}"/>
`,
    ),
  );
}

// --- the rail --------------------------------------------------------------
// Stage-sized and mostly transparent, so that a rail pixel at (x, flip(y)) is
// world (x, y) with no arithmetic in between. That is the whole reason it is not
// cropped: a cropped rail needs an attachment offset, and an offset is one more
// number that can disagree with the curve.
{
  const line = polyline();
  // The two points no curve uses still say which way the rail leaves the frame:
  // the outer handles at POINTS[0] and POINTS[11] are the end knots' tangent
  // directions, so the drawn rail runs off both edges instead of stopping at a
  // tip the cart appears to balance on. The traversal is unaffected — Spine
  // reads them and no curve is built from them.
  const runOff = (
    knot: readonly [number, number],
    handle: readonly [number, number],
    px: number,
    drop: number,
  ): string => {
    const dx = knot[0] - handle[0];
    const dy = knot[1] - handle[1];
    const len = Math.hypot(dx, dy);
    const ex = knot[0] + (dx / len) * px;
    const ey = knot[1] + (dy / len) * px;
    return `M${knot[0]} ${flip(knot[1] - drop)} L${ex.toFixed(1)} ${flip(ey - drop).toFixed(1)}`;
  };
  /** The whole drawn rail at a given drop below the axle curve. */
  const railAt = (drop: number): string =>
    `${runOff(POINTS[1], POINTS[2], 170, drop)} ${svgPath(flip, drop)} ${runOff(POINTS[10], POINTS[9], 170, drop)}`;
  const centre = railAt(WHEEL_RADIUS);
  const highlight = railAt(WHEEL_RADIUS + 3);

  // Sleepers, spaced by walked distance along the drawn polyline rather than by
  // parameter: a Bezier's parameter is not its arc length, and evenly spaced `t`
  // bunches them up wherever the curve is steep.
  const SLEEPER_EVERY = 44;
  const sleepers: string[] = [];
  const posts: string[] = [];
  let walked = 0;
  let sinceSleeper = SLEEPER_EVERY;
  for (let i = 1; i < line.length; i++) {
    const [px, py] = line[i - 1];
    const [x, y] = line[i];
    const dx = x - px;
    const dy = y - py;
    const seg = Math.hypot(dx, dy);
    walked += seg;
    sinceSleeper += seg;
    if (sinceSleeper < SLEEPER_EVERY) continue;
    sinceSleeper = 0;
    // The downward normal: rotate the tangent a quarter turn and take the side
    // that points at the ground.
    const nx = dy / seg;
    const ny = -dx / seg;
    const s = ny > 0 ? -1 : 1;
    const railY = y - WHEEL_RADIUS;
    sleepers.push(
      `<path d="M${(x - nx * s * 4).toFixed(1)} ${flip(railY - ny * s * 4).toFixed(1)} L${(x + nx * s * 22).toFixed(
        1,
      )} ${flip(railY + ny * s * 22).toFixed(1)}" stroke="${WOOD_DK}" stroke-width="11" stroke-linecap="round"/>`,
    );
    // A trestle down to the hillside, every eighth sleeper. It stops at the near
    // ridge the plate draws rather than running off the bottom of the frame.
    if (sleepers.length % 8 === 5) {
      const foot = 92 + 26 * Math.sin(x / 190);
      posts.push(
        `<path d="M${x.toFixed(1)} ${flip(railY - 12).toFixed(1)} L${x.toFixed(1)} ${flip(foot).toFixed(
          1,
        )}" stroke="${WOOD_DK}" stroke-width="11" stroke-linecap="round"/>` +
          `<path d="M${(x - 15).toFixed(1)} ${flip(railY - 26).toFixed(1)} L${(x + 15).toFixed(1)} ${flip(
            railY - 26,
          ).toFixed(1)}" stroke="${WOOD}" stroke-width="8" stroke-linecap="round"/>`,
      );
    }
  }
  console.log(`  rail: ${sleepers.length} sleepers, ${posts.length} trestles over ~${walked.toFixed(0)}px of polyline`);
  stageProps.push(
    part(
      'rail',
      STAGE_W,
      STAGE_H,
      `
  ${posts.join('\n  ')}
  ${sleepers.join('\n  ')}
  <path d="${centre}" fill="none" stroke="${INK}" stroke-width="19" stroke-linecap="round"/>
  <path d="${centre}" fill="none" stroke="${METAL_DK}" stroke-width="12" stroke-linecap="round"/>
  <path d="${highlight}" fill="none" stroke="${METAL}" stroke-width="4" stroke-linecap="round" opacity="0.9"/>
`,
    ),
  );
}

// --- the trolley -----------------------------------------------------------
// A flat deck rather than a tub, so the whole figure stands on it and reads: a
// tub deep enough to look like one swallows the legs, and a rig whose parts the
// shot cannot show is a rig that taught the reader nothing about them.
//
// Drawn at nominal 460x150 and rasterised to 230x75. Its bone rides the AXLE
// curve, so the plate is offset up in the rig spec until the deck clears the
// wheels — `rig.json`'s `cart` attachment `y` and nothing else decides that.
vehicleProps.push(
  part(
    'cart',
    640,
    200,
    `
  <path d="M62 118 L44 52 C 40 30, 52 18, 74 22" fill="none" stroke="${INK}" stroke-width="26" stroke-linecap="round"/>
  <path d="M62 118 L44 52 C 40 30, 52 18, 74 22" fill="none" stroke="${WOOD}" stroke-width="16" stroke-linecap="round"/>
  <path d="M604 120 L616 82" fill="none" stroke="${INK}" stroke-width="24" stroke-linecap="round"/>
  <path d="M604 120 L616 82" fill="none" stroke="${METAL}" stroke-width="14" stroke-linecap="round"/>
  <path d="M26 116 L614 116 C 622 116, 622 172, 614 172 L26 172 C 18 172, 18 116, 26 116 Z"
        fill="${WOOD}" stroke="${INK}" stroke-width="12"/>
  <path d="M44 127 L596 127" fill="none" stroke="${SUN}" stroke-width="10" stroke-linecap="round" opacity="0.9"/>
  <path d="M70 160 L560 160" fill="none" stroke="${WOOD_DK}" stroke-width="9" stroke-linecap="round" opacity="0.7"/>
  <path d="M172 116 L172 172 M320 116 L320 172 L320 172 M468 116 L468 172"
        fill="none" stroke="${WOOD_DK}" stroke-width="8" opacity="0.45"/>
  <rect x="246" y="168" width="148" height="24" rx="11" fill="${METAL_DK}" stroke="${INK}" stroke-width="10"/>
  <circle cx="320" cy="180" r="11" fill="${METAL}" opacity="0.85"/>
`,
  ),
);

// --- the wheels ------------------------------------------------------------
// Two plates rather than one shared region: the spokes sit at different phases,
// so a rolling pair does not read as one wheel drawn twice. Nominal 112, so the
// rasterised radius is exactly WHEEL_RADIUS.
const WHEEL_NOMINAL = Math.round((WHEEL_RADIUS * 2) / ART_SCALE);
const wheel = (phase: number): string => {
  const c = WHEEL_NOMINAL / 2;
  const spokes = Array.from({ length: 6 }, (_, i) => {
    const a = ((i * 60 + phase) * Math.PI) / 180;
    return `<path d="M${(c + Math.cos(a) * 16).toFixed(1)} ${(c + Math.sin(a) * 16).toFixed(1)} L${(
      c +
      Math.cos(a) * 50
    ).toFixed(1)} ${(c + Math.sin(a) * 50).toFixed(1)}" stroke="${METAL_DK}" stroke-width="12" stroke-linecap="round"/>`;
  }).join('\n  ');
  return `
  <circle cx="${c}" cy="${c}" r="${c - 8}" fill="${METAL_DK}" stroke="${INK}" stroke-width="12"/>
  <circle cx="${c}" cy="${c}" r="${c - 20}" fill="${GROUND}"/>
  ${spokes}
  <circle cx="${c}" cy="${c}" r="18" fill="${METAL}" stroke="${INK}" stroke-width="9"/>
  <path d="M${c - 44} ${c - 32} A ${c - 14} ${c - 14} 0 0 1 ${c - 8} ${c - 54}" fill="none" stroke="${METAL}"
        stroke-width="8" stroke-linecap="round" opacity="0.7"/>
`;
};
vehicleProps.push(part('wheel_b', WHEEL_NOMINAL, WHEEL_NOMINAL, wheel(0)));
vehicleProps.push(part('wheel_f', WHEEL_NOMINAL, WHEEL_NOMINAL, wheel(30)));

// --- rasterise -------------------------------------------------------------
console.log('character parts (nominal x %s):'.replace('%s', String(ART_SCALE)));
await rasterise(rigbyParts(), OUT, ART_SCALE);
console.log(`vehicle props (nominal x ${ART_SCALE}):`);
await rasterise(vehicleProps, OUT, ART_SCALE);
console.log('stage props (drawn at world size):');
await rasterise(stageProps, OUT, 1);

// --- the check -------------------------------------------------------------
{
  const rig = JSON.parse(readFileSync(join(HERE, 'rig.json'), 'utf8')) as {
    skins: Record<string, Record<string, Record<string, { vertexCount?: number; vertices?: number[] }>>>;
    skeleton: { width: number; height: number };
  };
  const attachment = rig.skins.default.track?.track;
  if (!attachment) throw new Error('rig.json has no `track` path attachment for the rail to agree with');
  const want = vertices();
  const got = attachment.vertices ?? [];
  const drift = want.length === got.length ? want.findIndex((v, i) => v !== got[i]) : -2;
  if (drift !== -1) {
    const where =
      drift === -2
        ? `it holds ${got.length} numbers and curve.ts has ${want.length}`
        : `point ${Math.floor(drift / 2)} is [${got[drift & ~1]}, ${got[(drift & ~1) + 1]}] in rig.json and ` +
          `[${want[drift & ~1]}, ${want[(drift & ~1) + 1]}] in curve.ts`;
    throw new Error(
      `the rail was drawn from curve.ts and rig.json's path attachment disagrees with it: ${where}. ` +
        `The cart would ride a curve the rail is not on, and nothing in the gate can see that.`,
    );
  }
  if (attachment.vertexCount !== POINTS.length) {
    throw new Error(`rig.json declares vertexCount ${attachment.vertexCount}; curve.ts has ${POINTS.length} points`);
  }
  if (rig.skeleton.width !== STAGE_W || rig.skeleton.height !== STAGE_H) {
    throw new Error(
      `rig.json's stage is ${rig.skeleton.width}x${rig.skeleton.height} and the plate was drawn ${STAGE_W}x${STAGE_H}`,
    );
  }
  console.log(`\nchecked: rig.json's path attachment matches curve.ts, all ${POINTS.length} points`);
}
