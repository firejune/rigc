/** Reference | candidate | overlay, zoomed, for a few frames. */
import { loadPosable, sampleAnimation, renderFrame } from '../../../../src/render.ts';
import { readPlate, type Plate } from '../../../../tools/plate.ts';
import { fullViewport, BG, savePlate } from './harness.ts';
import { Plate as P } from '../../../../tools/plate.ts';
import { REF, CAND } from './fit.ts';
const view = fullViewport(`${REF}/frames.json`);
const p = loadPosable(`${CAND}/skeleton.json`, `${CAND}/skeleton.atlas`, CAND);
const drawn = (q: Plate, i: number) => Math.abs(q.data[i]-BG[0])>8 || Math.abs(q.data[i+1]-BG[1])>8 || Math.abs(q.data[i+2]-BG[2])>8;
const specs = process.argv.slice(2).map((s) => { const [a, f] = s.split('/'); return [a, Number(f)] as [string, number]; });
const Z = 3, CW = 200, CH = 190;
const out = new P(specs.length * CW * Z, 3 * CH * Z);
for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 255; out.data[i+1] = 255; out.data[i+2] = 255; out.data[i+3] = 255; }
specs.forEach(([anim, f], col) => {
  const ref = readPlate(`${REF}/${anim}/f${String(f).padStart(4, '0')}.png`);
  const mine = renderFrame(sampleAnimation(p.data, anim, 12)[f], p.pages, view, BG);
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const q of [ref, mine]) for (let y = 0; y < q.height; y++) for (let x = 0; x < q.width; x++)
    if (drawn(q, (y*q.width+x)*4)) { if (x<x0) x0=x; if (x>x1) x1=x; if (y<y0) y0=y; if (y>y1) y1=y; }
  const ox = Math.max(0, Math.round((x0+x1)/2 - CW/2)), oy = Math.max(0, Math.round((y0+y1)/2 - CH/2));
  for (let r = 0; r < 3; r++) for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const sx = ox + x, sy = oy + y;
    let c: [number, number, number] = [255, 255, 255];
    if (sx < ref.width && sy < ref.height) {
      const i = (sy*ref.width+sx)*4;
      const dr = drawn(ref, i), dm = drawn(mine, i);
      if (r === 0) c = [ref.data[i], ref.data[i+1], ref.data[i+2]];
      else if (r === 1) c = [mine.data[i], mine.data[i+1], mine.data[i+2]];
      else c = dr && dm ? [190, 190, 190] : dr ? [220, 40, 40] : dm ? [40, 90, 220] : [252, 252, 252];
    }
    for (let zy = 0; zy < Z; zy++) for (let zx = 0; zx < Z; zx++) {
      const dx = col*CW*Z + x*Z + zx, dy = r*CH*Z + y*Z + zy;
      const di = (dy*out.width+dx)*4;
      out.data[di] = c[0]; out.data[di+1] = c[1]; out.data[di+2] = c[2]; out.data[di+3] = 255;
    }
  }
});
savePlate(out, 'work/panel.png');
console.log('work/panel.png — rows: reference, candidate, overlay (red = reference only, blue = mine only)');
