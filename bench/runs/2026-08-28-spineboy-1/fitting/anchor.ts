/** Match anchor parts on idle/f0000 (+ aim for the gun) and print centre poses. */
import { refFrames } from './lib.ts';
import { matchPart } from './match.ts';

const idle0 = refFrames('idle')[0];
const aim0 = refFrames('aim')[0];

const box = { x0: 137, y0: 185, x1: 246, y1: 340 };
const fine = Array.from({ length: 145 }, (_, i) => i * 2.5 - 180);

const jobs: [string, typeof idle0, { x0: number; y0: number; x1: number; y1: number }, number[]?][] = [
  ['torso', idle0, box],
  ['head', idle0, box],
  ['goggles', idle0, box],
  ['neck', idle0, box],
  ['gun', idle0, box],
  ['gun', aim0, { x0: 137, y0: 185, x1: 260, y1: 340 }],
  ['front-fist-open', idle0, box],
  ['front-shin', idle0, box],
  ['rear-shin', idle0, box],
  ['front-foot', idle0, box],
  ['rear-foot', idle0, box],
  ['front-thigh', idle0, box],
  ['rear-thigh', idle0, box],
  ['front-upper-arm', idle0, box],
  ['front-bracer', idle0, box],
  ['rear-upper-arm', idle0, box],
  ['rear-bracer', idle0, box],
];

for (const [name, frame, w, phis] of jobs) {
  const t0 = Date.now();
  const m = matchPart(name, frame, w, phis ?? fine);
  console.log(
    `${name.padEnd(16)} ${frame === aim0 ? 'aim ' : 'idle'} centre (${m.x},${m.y}) phi ${m.phi.toFixed(1)} score ${m.score.toFixed(0)} vis ${(m.vis * 100).toFixed(0)}% ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
}
