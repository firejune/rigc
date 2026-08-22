#!/usr/bin/env bun
/**
 * Measure a joint-closeup cut's `anchors` block off its own plates.
 *
 *   bun tools/measure_joint_anchors.ts <manifest.json> [--axis-deg <insert deg>]
 *
 * ⭐ Why a tool and not a hand-typed block: the archetype needs a position for
 * all 17 non-root bones (`src/archetype.ts`), a missing one is a compile error by
 * design, and the temptation at that point is to copy the numbers from the cut
 * that already compiles. Those numbers describe ANOTHER cut's art. So every
 * anchor this tool prints is derived from the real plates plus the manifest's own
 * measured geometry, and the derivation is named in `basis` next to each value.
 *
 * The axis frame is the whole trick. `s` is inward along the cut's insert axis
 * and `t` is across it (right-handed in screen space, y down), both with their
 * origin at the entry point. Every anchor below is either
 *   * a point the art itself picks out (an extreme, a centroid), or
 *   * a construction on the axis frame that the archetype demands and this cut
 *     has no art for - and those are labelled `drives_nothing_in_this_cut`.
 *
 * ⚠️ It does NOT write the manifest. A measuring tool that also edits its input
 * makes the next reader guess which numbers were measured and which were carried
 * over; plan 01 section 6.4 traced this pipeline's dead scripts back to exactly
 * that habit.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { readPlate, type Plate } from './plate.ts';
import { BODY_ALPHA } from './contact.ts';

interface Part {
  slot: string;
  rig_slot?: string;
  image?: string | null;
  offset?: [number, number];
  size?: [number, number];
}
interface Manifest {
  crop: { w: number; h: number };
  insertion?: { point_crop?: [number, number] } | [number, number];
  axis?: { deg?: number; alternate_deg_screen?: number; deg_screen?: number };
  parts: Part[];
}

const args = process.argv.slice(2);
const manifestArg = args[0];
if (!manifestArg) {
  console.error('usage: bun tools/measure_joint_anchors.ts <manifest.json> [--axis-deg <insert deg>]');
  process.exit(2);
}
const flag = (name: string): string | null => {
  const i = args.indexOf(name);
  return i < 0 ? null : (args[i + 1] ?? null);
};

const manifestPath = resolve(manifestArg);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
const dir = dirname(manifestPath);

const entry: [number, number] = Array.isArray(manifest.insertion)
  ? manifest.insertion
  : (manifest.insertion?.point_crop as [number, number]);
if (!entry) {
  console.error('manifest has no insertion point; the axis frame has no origin');
  process.exit(1);
}

const axisDegArg = flag('--axis-deg');
const axisDeg = axisDegArg !== null ? Number(axisDegArg) : manifest.axis?.deg;
if (axisDeg === undefined || !Number.isFinite(axisDeg)) {
  console.error('no insert-axis angle: pass --axis-deg or put `axis.deg` in the manifest');
  process.exit(1);
}

const rad = (axisDeg * Math.PI) / 180;
/** Inward along the axis, screen space (y down). */
const U: [number, number] = [Math.cos(rad), Math.sin(rad)];
/** Across the axis. Right-handed with U in screen coordinates. */
const N: [number, number] = [-U[1], U[0]];

const s = (x: number, y: number): number => (x - entry[0]) * U[0] + (y - entry[1]) * U[1];
const t = (x: number, y: number): number => (x - entry[0]) * N[0] + (y - entry[1]) * N[1];
const fromST = (sv: number, tv: number): [number, number] => [
  Math.round(entry[0] + sv * U[0] + tv * N[0]),
  Math.round(entry[1] + sv * U[1] + tv * N[1]),
];

const partOf = (rigSlot: string): { part: Part; plate: Plate; offset: [number, number] } => {
  const part = manifest.parts.find((p) => (p.rig_slot ?? p.slot) === rigSlot);
  if (!part?.image) throw new Error(`manifest has no part with an image for rig slot "${rigSlot}"`);
  return { part, plate: readPlate(resolve(dir, part.image)), offset: part.offset ?? [0, 0] };
};

interface BodyStats {
  count: number;
  centroid: [number, number];
  /** Extreme body pixel in the given direction, with its axis-frame coordinates. */
  extreme: (dx: number, dy: number) => { crop: [number, number]; s: number; t: number; value: number };
  /** Standard deviation of `t` over the body pixels. */
  tSigma: number;
}

function bodyStats(plate: Plate, offset: [number, number], threshold = BODY_ALPHA): BodyStats {
  const xs: number[] = [];
  const ys: number[] = [];
  let sumX = 0;
  let sumY = 0;
  let sumT = 0;
  let sumT2 = 0;
  for (let y = 0; y < plate.height; y++) {
    for (let x = 0; x < plate.width; x++) {
      if (plate.data[(y * plate.width + x) * 4 + 3] < threshold) continue;
      const cx = offset[0] + x;
      const cy = offset[1] + y;
      xs.push(cx);
      ys.push(cy);
      sumX += cx;
      sumY += cy;
      const tv = t(cx, cy);
      sumT += tv;
      sumT2 += tv * tv;
    }
  }
  const n = xs.length;
  if (!n) throw new Error('plate has no body pixels at all');
  const meanT = sumT / n;
  return {
    count: n,
    centroid: [Math.round(sumX / n), Math.round(sumY / n)],
    tSigma: Math.sqrt(Math.max(0, sumT2 / n - meanT * meanT)),
    extreme: (dx, dy) => {
      let best = -Infinity;
      let at = 0;
      for (let i = 0; i < n; i++) {
        const v = xs[i] * dx + ys[i] * dy;
        if (v <= best) continue;
        best = v;
        at = i;
      }
      const crop: [number, number] = [xs[at], ys[at]];
      return { crop, s: round(s(crop[0], crop[1])), t: round(t(crop[0], crop[1])), value: round(best) };
    },
  };
}

const round = (n: number): number => Math.round(n * 10) / 10;
const deg = (dx: number, dy: number): number => Math.round(((Math.atan2(dy, dx) * 180) / Math.PI) * 100) / 100;

const part = partOf('piston');
const occ = partOf('lip');
const partBody = bodyStats(part.plate, part.offset);
const occBody = bodyStats(occ.plate, occ.offset);

// The moving plate's axial extreme IS the cap tip: it is the body pixel furthest
// inward along the axis, and that is the same quantity plan 01 section 4.5's
// corridor probe reports as `tip_at_rest_crop`.
const tip = partBody.extreme(U[0], U[1]);
// The mass centroid projected onto the axis line. The piston bone's own position
// does not move a pixel (a region attachment is placed by its window, not by its
// bone), so what it buys is readability: the handle that carries the stroke sits
// ON the axis, at the middle of the mass it drives.
const centroidS = s(partBody.centroid[0], partBody.centroid[1]);
const centroidT = t(partBody.centroid[0], partBody.centroid[1]);

// The occluder's four diagonal extremes in the axis frame. A grip's local +X has
// to point away from the aperture, so the facing is the diagonal it was found on.
const DIAGS = [
  ['rim_grip_a', 1, 1],
  ['rim_grip_b', -1, 1],
  ['rim_grip_c', -1, -1],
  ['rim_grip_d', 1, -1],
] as const;

const crop = manifest.crop;
const centre: [number, number] = [Math.round(crop.w / 2), Math.round(crop.h / 2)];

interface Anchor {
  name: string;
  value: number[];
  basis: string;
}
const anchors: Anchor[] = [];
const add = (name: string, value: number[], basis: string): void => {
  anchors.push({ name, value, basis });
};

add('cam', centre, `crop centre (${crop.w}x${crop.h}) — the formation's re-seat handle, not an art feature`);
add('base', centre, 'base plate window centre = the crop centre (the plate IS the crop)');
add(
  'body',
  partBody.centroid,
  `body centroid of the moving plate, ${partBody.count} px at alpha>=${BODY_ALPHA} (s=${round(centroidS)}, t=${round(centroidT)})`,
);
for (const [name, sign] of [
  ['body_soft_a', 1],
  ['body_soft_b', -1],
] as const) {
  const facing = deg(sign * N[0], sign * N[1]);
  add(
    name,
    [...fromST(round(centroidS), round(centroidT + sign * partBody.tSigma)), facing],
    `mass centroid +${sign > 0 ? '' : '-'}1 sigma across the axis (sigma=${round(partBody.tSigma)}px), facing ${sign > 0 ? '+' : '-'}across`,
  );
}
add('axis', [...entry], 'insertion point — the cut manifest measured it (cap contour axial extreme, traced at 4x)');
add(
  'piston',
  fromST(round(centroidS), 0),
  `the mass centroid projected onto the axis line (s=${round(centroidS)}, t forced to 0)`,
);
add('piston_tip', [...tip.crop], `the moving plate's furthest-inward body pixel: s=${tip.s}, t=${tip.t}`);
add('rim', [...entry], 'the aperture reference is the entry point, same as `axis`');
for (const [name, ds, dt] of DIAGS) {
  const dir: [number, number] = [
    (ds * U[0] + dt * N[0]) / Math.SQRT2,
    (ds * U[1] + dt * N[1]) / Math.SQRT2,
  ];
  const ex = occBody.extreme(dir[0], dir[1]);
  add(
    name,
    [...ex.crop, deg(dir[0], dir[1])],
    `occluder body extreme on the axis-frame diagonal (s${ds > 0 ? '+' : '-'}, t${dt > 0 ? '+' : '-'}): s=${ex.s}, t=${ex.t}`,
  );
}
add('fluid_src', [...entry], 'fluid leaves the body at the entry point (`axis`), never on the moving part');
// The chain is a construction, and it says so. Gravity is screen-down, so three
// equal links from the entry to the crop's bottom edge is the only thing the
// geometry fixes; the fluid plate is a scene-shared sprite this cut does not
// carry (plan 01 section 3.5), so there is nothing here to measure against.
const linkLen = Math.round((crop.h - 1 - entry[1]) / 3);
for (let i = 1; i <= 3; i++) {
  add(
    ['fluid_a', 'fluid_b', 'fluid_c'][i - 1],
    [entry[0], entry[1] + linkLen * i],
    `construction: entry + ${linkLen}px * ${i} straight down (drives_nothing_in_this_cut — no fluid plate)`,
  );
}

// `--json` prints ONLY the two manifest blocks, so the numbers reach the
// manifest through a pipe rather than through somebody retyping them.
if (args.includes('--json')) {
  console.log(
    JSON.stringify(
      {
        anchors: Object.fromEntries(anchors.map((a) => [a.name, a.value])),
        anchors_basis: Object.fromEntries(anchors.map((a) => [a.name, a.basis])),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

console.log(`anchors for ${manifestPath}`);
console.log(`  insert axis      ${axisDeg} deg (screen, y down) -> U=[${U.map((v) => v.toFixed(4)).join(', ')}] N=[${N.map((v) => v.toFixed(4)).join(', ')}]`);
console.log(`  entry            ${JSON.stringify(entry)}`);
console.log(`  moving plate     ${part.plate.width}x${part.plate.height} at ${JSON.stringify(part.offset)}  ${partBody.count} body px`);
console.log(`  occluder         ${occ.plate.width}x${occ.plate.height} at ${JSON.stringify(occ.offset)}  ${occBody.count} body px`);
console.log('');
for (const a of anchors) {
  console.log(`  ${a.name.padEnd(12)} ${JSON.stringify(a.value).padEnd(22)} ${a.basis}`);
}
console.log('\njson:');
console.log(JSON.stringify(Object.fromEntries(anchors.map((a) => [a.name, a.value])), null, 2));
