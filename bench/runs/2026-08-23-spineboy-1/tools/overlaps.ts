/**
 * Where two parts overlap in the fitted setup pose — the first estimate of a
 * joint.
 *
 * An art plate for a limb segment is drawn to overlap its neighbour at the
 * joint, because that is the only way a rotating join does not open a gap. So
 * the centroid of the two masks' intersection is an anatomical estimate of the
 * pivot, and it costs nothing. It is a **starting** value: `refinejoints.ts`
 * moves it against the whole shot's residual afterwards.
 *
 *   bun … tools/overlaps.ts <setup.json>
 */
import { rasterisePiece } from '../../../../src/render.ts';
import { art, quadOf, viewportOf, pixelToWorld, type Placement } from './lib.ts';

const [file] = process.argv.slice(2);
const doc = JSON.parse(await Bun.file(file).text());
const placements: Placement[] = doc.placements;
const v = viewportOf('ess');
const project = (wx: number, wy: number): [number, number] => [(wx - v.minX) * v.scale, (v.maxY - wy) * v.scale];
const toWorld = pixelToWorld(v);

const masks = new Map<string, Uint8Array>();
for (const p of placements) {
  const m = new Uint8Array(v.width * v.height);
  rasterisePiece(art(p.image ?? p.part), quadOf({ ...p, sx: 1, sy: 1 }), project, v, (px, py, _r, _g, _b, a) => {
    if (a > 120) m[py * v.width + px] = 1;
  });
  masks.set(p.part, m);
}

export const PAIRS: [string, string][] = [
  ['torso', 'neck'],
  ['neck', 'head'],
  ['head', 'goggles'],
  ['head', 'eye'],
  ['head', 'mouth'],
  ['torso', 'front-upper-arm'],
  ['front-upper-arm', 'front-bracer'],
  ['front-bracer', 'front-fist'],
  ['torso', 'rear-upper-arm'],
  ['rear-upper-arm', 'rear-bracer'],
  ['rear-bracer', 'gun'],
  ['torso', 'front-thigh'],
  ['front-thigh', 'front-shin'],
  ['front-shin', 'front-foot'],
  ['torso', 'rear-thigh'],
  ['rear-thigh', 'rear-shin'],
  ['rear-shin', 'rear-foot'],
];

for (const [a, b] of PAIRS) {
  const ma = masks.get(a);
  const mb = masks.get(b);
  if (!ma || !mb) {
    console.log(`${a} / ${b}: missing`);
    continue;
  }
  let n = 0,
    sx = 0,
    sy = 0;
  for (let i = 0; i < ma.length; i++)
    if (ma[i] && mb[i]) {
      n++;
      sx += i % v.width;
      sy += Math.floor(i / v.width);
    }
  if (n === 0) {
    console.log(`${a} / ${b}: no overlap`);
    continue;
  }
  const [wx, wy] = toWorld(sx / n + 0.5, sy / n + 0.5);
  console.log(`${a.padEnd(17)} / ${b.padEnd(17)} n=${String(n).padStart(4)}  world ${wx.toFixed(1)}, ${wy.toFixed(1)}`);
}
