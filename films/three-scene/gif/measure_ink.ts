/**
 * Where the figure's ink actually reaches, so the bust window can clear it.
 *
 * ⚠️ The window CANNOT be derived from the rig's numbers alone. A part's plate
 * is bigger than the drawing on it (`torso.png` is 540 wide and the shoulders
 * inside it are not), and the turn moves five hair layers by five different
 * amounts. So this measures the real thing: every frame of the film's own
 * source sets, differenced against the stage plate — which is the exact
 * backdrop, because `plate` hangs off `root` and no animation keys it — and the
 * bounding box of what is left over is the figure.
 *
 * It prints, and the film's `layout.ts` quotes the printed numbers.
 */
import { mkdirSync } from 'node:fs';
import { $ } from 'bun';
import { WIN_Y0, WIN_Y1 } from './layout';

const ROOT = new URL('../', import.meta.url).pathname;
const SCALE = 1.875;

interface Sidecar {
  viewport: { x: number; y: number; width: number; height: number; scale: number; pixelWidth: number; pixelHeight: number };
  sets: { dir: string; animation: string; fps: number; written: number; duration: number }[];
}

const fast: Sidecar = await Bun.file(`${ROOT}render/frames.json`).json();
const slow: Sidecar = await Bun.file(`${ROOT}render-slow/frames.json`).json();
if (JSON.stringify(fast.viewport) !== JSON.stringify(slow.viewport)) {
  throw new Error('the 25 fps and 50 fps renders disagree about the viewport; one window cannot fit both');
}
const vp = fast.viewport;
if (Math.abs(vp.scale - SCALE) > 1e-9) throw new Error(`viewport scale is ${vp.scale}, not the intended ${SCALE}`);

/** Plate origin in frame pixels, straight out of the sidecar's contract. */
const ox = (0 - vp.x) * vp.scale;
const oy = (vp.y + vp.height - 880) * vp.scale;
console.log(`viewport ${vp.pixelWidth}x${vp.pixelHeight} scale ${vp.scale}  plate origin in frame (${ox.toFixed(2)}, ${oy.toFixed(2)})`);

mkdirSync(`${ROOT}probe`, { recursive: true });

/** The plate alone, on the render's own pixel grid. */
const PLATE = `${ROOT}probe/plate_frame.png`;
await $`magick ${ROOT}portrait-src/parts/plate.png -filter Lanczos -resize ${`${640 * vp.scale}x${880 * vp.scale}!`} -background ${'#e8e8e8'} -extent ${`${vp.pixelWidth}x${vp.pixelHeight}-${Math.round(ox)}-${Math.round(oy)}`} -alpha remove -alpha off ${PLATE}`.quiet();

/** The whole film's source frames, every one of them. */
const sets: [string, string, number][] = [
  ['render', 'idle@25fps', 81],
  ['render', 'gaze@25fps', 39],
  ['render', 'turn@25fps', 56],
  ['render-slow', 'turn@50fps', 111],
];

let x0 = Infinity;
let x1 = -Infinity;
let y0 = Infinity;
let y1 = -Infinity;
let worstFrame = '';

/**
 * ⚠️ Measured inside the WINDOW's own y band, not over the whole plate.
 *
 * Over the whole plate the answer is x 81.6..558.4 and it is the wrong answer:
 * that width is the torso at the plate's bottom edge, 350 units below the
 * window's floor. Sizing the window to clear ink it does not contain shrinks
 * the head for nothing — which is the one thing this framing cannot spare.
 */
const BAND_Y0 = Math.round(oy + WIN_Y0 * vp.scale);
const BAND_H = Math.round((WIN_Y1 - WIN_Y0) * vp.scale);
const BAND = `${vp.pixelWidth}x${BAND_H}+0+${BAND_Y0}`;

for (const [dir, set, n] of sets) {
  for (let i = 0; i < n; i += 1) {
    const f = `${ROOT}${dir}/${set}/f${String(i).padStart(4, '0')}.png`;
    // Threshold 2%: the plate's own Lanczos resample differs from rigc's by a
    // count or two at the gradient, and a 2% floor is below any ink.
    // ⚠️ An argv ARRAY, not a shell string: Bun's `$` parses a bare `(` as its
    // own shell syntax and refuses the line, and `(`/`)` are how ImageMagick
    // scopes a per-image crop.
    const args = [
      '(', PLATE, '-crop', BAND, '+repage', ')',
      '(', f, '-crop', BAND, '+repage', ')',
      '-compose', 'difference', '-composite', '-colorspace', 'Gray', '-threshold', '2%', '-format', '%@', 'info:',
    ];
    const bb = (await $`magick ${args}`.text()).trim();
    const m = /^(\d+)x(\d+)\+(\d+)\+(\d+)$/.exec(bb);
    if (m === null) throw new Error(`${f}: no ink found (bbox "${bb}")`);
    const [w, h, x, y] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    const px0 = (x - ox) / vp.scale;
    const px1 = (x + w - ox) / vp.scale;
    const py0 = (y + BAND_Y0 - oy) / vp.scale;
    const py1 = (y + h + BAND_Y0 - oy) / vp.scale;
    if (px0 < x0) {
      x0 = px0;
      worstFrame = `${set}/f${String(i).padStart(4, '0')} (left)`;
    }
    if (px1 > x1) x1 = px1;
    if (py0 < y0) y0 = py0;
    if (py1 > y1) y1 = py1;
  }
  console.log(`  ${set}  ${n} frames measured`);
}

console.log(`\nink union, plate units:  x ${x0.toFixed(1)}..${x1.toFixed(1)}   y ${y0.toFixed(1)}..${y1.toFixed(1)}`);
console.log(`  widest reach          ${worstFrame}`);
console.log(`  measured inside the window band, plate y ${WIN_Y0}..${WIN_Y1}`);
