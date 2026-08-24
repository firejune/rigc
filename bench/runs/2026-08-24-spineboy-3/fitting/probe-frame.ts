import { Fitter, refFrame, cropPlate } from './fit.ts';
import { Plate, encodePng } from '../../../../tools/plate.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import { FIST } from './fitrun.ts';
const [anim, iS, file] = [process.argv[2], Number(process.argv[3]), process.argv[4] ?? `work/placements-${process.argv[2]}.json`];
const pl = JSON.parse(readFileSync(file, 'utf8'))[anim];
const f = new Fitter();
f.rig.setAttachment('front-fist', FIST[anim] ?? 'front-fist-open');
const X = 110, Y = 165, W = 165, H = 190, S = 4;
const view = f.window(X, Y, W, H);
const idxs = iS >= 0 ? [iS] : [0, 5, 10, 15, 20];
const out = new Plate(W * S * 2 * idxs.length + 8 * idxs.length, H * S);
idxs.forEach((i, k) => {
  f.rig.apply(pl[i]);
  const mine = f.rig.render(view);
  const ref = cropPlate(refFrame(anim, i), X, Y, W, H);
  for (const [p, o] of [[mine, 0], [ref, W * S]] as [Plate, number][])
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const si = (y * W + x) * 4;
      for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
        const di = ((y * S + dy) * out.width + x * S + dx + o + k * (W * S * 2 + 8)) * 4;
        out.data[di] = p.data[si]; out.data[di+1] = p.data[si+1]; out.data[di+2] = p.data[si+2]; out.data[di+3] = 255;
      }
    }
});
writeFileSync('work/frame.png', encodePng(out.width, out.height, out.data));
console.log(JSON.stringify(pl[idxs[0]]));
