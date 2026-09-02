/**
 * Render one fitted pose beside its reference frame, so a fit can be looked at.
 *
 * AUTHORING §0: `render` and `preview` are how you LOOK at what you built, and a
 * number is not a picture. This is the same thing for a pose that has not become
 * an animation yet — candidate on the left, reference on the right, difference on
 * the far right.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Plate, encodePng, readPlate } from '../../../../tools/plate.ts';
import { readViewport } from './geom.ts';
import { applyPose, BG, loadPosable, refLevels, score } from './fitlib.ts';

const ROOT = 'bench/runs/2026-09-03-spineboy-1';
const REF = 'bench/reference/spineboy/ess';

const key = process.argv[2]; // e.g. idle/f0000
const dest = process.argv[3] ?? '/tmp/show.png';
const [set, frame] = key.split('/');
const vp = readViewport(join(REF, 'frames.json'));
const p = loadPosable(join(ROOT, 'spine'));
const poses = JSON.parse(readFileSync(join(ROOT, `fit/poses/${set.replace('@', '_at_')}.json`), 'utf8'));
const pose = poses[frame];
if (!pose) throw new Error(`no fitted pose for ${key}`);

const levels = refLevels(join(REF, set, `${frame}.png`), vp, 0);
const lv = levels[3];
lv.x0 = 0;
lv.y0 = 0;
lv.x1 = lv.ref.width - 1;
lv.y1 = lv.ref.height - 1;
applyPose(p, pose);
const s = score(p, lv);
const ref = readPlate(join(REF, set, `${frame}.png`));
const w = ref.width;
const h = ref.height;
const out = new Plate(w * 3 + 8, h);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w * 3 + 8; x++) out.set(x, y, [255, 255, 255, 255]);
}
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    out.set(x, y, [lv.buf.data[i], lv.buf.data[i + 1], lv.buf.data[i + 2], 255]);
    out.set(x + w + 4, y, [ref.data[i], ref.data[i + 1], ref.data[i + 2], 255]);
    const d = Math.min(
      255,
      Math.abs(lv.buf.data[i] - ref.data[i]) +
        Math.abs(lv.buf.data[i + 1] - ref.data[i + 1]) +
        Math.abs(lv.buf.data[i + 2] - ref.data[i + 2]),
    );
    out.set(x + 2 * w + 8, y, [255 - d, 255 - d, 255 - d, 255]);
  }
}
writeFileSync(dest, encodePng(out.width, out.height, out.data));
console.log(`${key}  score ${s.value.toFixed(3)}  ink ${s.ink}/${lv.ink}  strays ${s.strays}  -> ${dest}`);
void BG;
