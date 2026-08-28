/** Constrained re-matches for the small/ambiguous parts. */
import { refFrames } from './lib.ts';
import { matchPart } from './match.ts';

const idle0 = refFrames('idle')[0];
const aim0 = refFrames('aim')[0];
const walk0 = refFrames('walk')[0];

const fine = Array.from({ length: 145 }, (_, i) => i * 2.5 - 180);

const jobs: [string, 'idle' | 'aim' | 'walk', { x0: number; y0: number; x1: number; y1: number }][] = [
  ['front-fist-open', 'idle', { x0: 140, y0: 270, x1: 168, y1: 298 }],
  ['front-bracer', 'idle', { x0: 143, y0: 258, x1: 170, y1: 288 }],
  ['front-upper-arm', 'idle', { x0: 146, y0: 250, x1: 174, y1: 280 }],
  ['neck', 'idle', { x0: 166, y0: 238, x1: 188, y1: 260 }],
  ['front-foot', 'idle', { x0: 145, y0: 312, x1: 188, y1: 340 }],
  ['rear-foot', 'idle', { x0: 188, y0: 312, x1: 232, y1: 340 }],
  ['front-thigh', 'idle', { x0: 148, y0: 278, x1: 182, y1: 312 }],
  ['rear-thigh', 'idle', { x0: 182, y0: 278, x1: 218, y1: 312 }],
  ['rear-upper-arm', 'aim', { x0: 170, y0: 242, x1: 208, y1: 272 }],
  ['rear-bracer', 'aim', { x0: 192, y0: 242, x1: 222, y1: 272 }],
  ['front-fist-closed', 'walk', { x0: 150, y0: 275, x1: 180, y1: 300 }],
  // cross-check: swapped feet and thighs, to read the separation
  ['rear-foot', 'idle', { x0: 145, y0: 312, x1: 188, y1: 340 }],
  ['front-foot', 'idle', { x0: 188, y0: 312, x1: 232, y1: 340 }],
  ['rear-thigh', 'idle', { x0: 148, y0: 278, x1: 182, y1: 312 }],
  ['front-thigh', 'idle', { x0: 182, y0: 278, x1: 218, y1: 312 }],
  ['rear-shin', 'idle', { x0: 150, y0: 295, x1: 180, y1: 330 }],
  ['front-shin', 'idle', { x0: 180, y0: 295, x1: 210, y1: 330 }],
];

const frames = { idle: idle0, aim: aim0, walk: walk0 };
for (const [name, fr, w] of jobs) {
  const m = matchPart(name, frames[fr], w, fine);
  console.log(
    `${name.padEnd(18)} ${fr.padEnd(4)} centre (${m.x},${m.y}) phi ${m.phi.toFixed(1)} score ${m.score.toFixed(0)} vis ${(m.vis * 100).toFixed(0)}%`,
  );
}
