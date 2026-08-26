// show.ts <set> <index> [out.png] — side-by-side ref | candidate | overlay
import { readFileSync, writeFileSync } from 'node:fs';
import { sidecar, declaredViewport, rigFrom, pose, type Knobs } from './fitlib.ts';
import { renderFrame } from '../../../../src/render.ts';
import { readPlate, Plate, encodePng } from '../../../../tools/plate.ts';
const D = 'bench/runs/2026-08-26-rung4-1/spine';
const set = process.argv[2]; const idx = Number(process.argv[3]);
const out = process.argv[4] ?? `/tmp/z/cmp-${set}-${idx}.png`;
const win = process.argv[5] ? process.argv[5].split(',').map(Number) : null;
const rig = rigFrom(readFileSync(`${D}/skeleton.json`,'utf8'), readFileSync(`${D}/skeleton.atlas`,'utf8'), D);
const s = sidecar(); const v = declaredViewport(s, 1);
const poses = JSON.parse(readFileSync(`bench/runs/2026-08-26-rung4-1/fit/${set}.poses.json`,'utf8')).poses as Knobs[];
const cand = renderFrame({index:idx,time:0,pieces:pose(rig, poses[idx])}, rig.posable.pages, v, [232,232,232,255]);
const ref = readPlate(`bench/reference/4-wave-principle/${set}/f${String(idx).padStart(4,'0')}.png`);
// window
let x0=1e9,y0=1e9,x1=-1,y1=-1;
for (const p of [ref, cand]) for (let y=0;y<p.height;y++) for(let x=0;x<p.width;x++){const i=(y*p.width+x)*4;const d=Math.abs(p.data[i]-232)+Math.abs(p.data[i+1]-232)+Math.abs(p.data[i+2]-232); if(d>24){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}}
if (win) { x0=win[0]; y0=win[1]; x1=win[0]+win[2]; y1=win[1]+win[3]; }
const pad=6; x0=Math.max(0,x0-pad); y0=Math.max(0,y0-pad); x1=Math.min(ref.width-1,x1+pad); y1=Math.min(ref.height-1,y1+pad);
const w=x1-x0+1,h=y1-y0+1; const z = Math.max(1, Math.min(6, Math.floor(1400/(3*w))));
const o = new Plate(w*3*z, h*z);
for (let j=0;j<h*z;j++) for(let i=0;i<w*3*z;i++){
  const col = Math.floor(i/(w*z)); const lx = Math.floor((i-col*w*z)/z)+x0; const ly = Math.floor(j/z)+y0;
  const si=(ly*ref.width+lx)*4; const di=(j*w*3*z+i)*4;
  const a = col===0? ref : col===1? cand : null;
  if (a) { o.data[di]=a.data[si]; o.data[di+1]=a.data[si+1]; o.data[di+2]=a.data[si+2]; o.data[di+3]=255; }
  else {
    const dr=Math.abs(ref.data[si]-cand.data[si])+Math.abs(ref.data[si+1]-cand.data[si+1])+Math.abs(ref.data[si+2]-cand.data[si+2]);
    const rInk = Math.abs(ref.data[si]-232)+Math.abs(ref.data[si+1]-232)+Math.abs(ref.data[si+2]-232) > 24;
    const cInk = Math.abs(cand.data[si]-232)+Math.abs(cand.data[si+1]-232)+Math.abs(cand.data[si+2]-232) > 24;
    let c=[240,240,240];
    if (rInk && !cInk) c=[220,40,40];        // reference only  (red)
    else if (cInk && !rInk) c=[40,90,220];   // candidate only  (blue)
    else if (rInk && cInk) { const g=Math.max(0,255-dr*2); c=[g,255-Math.min(255,dr),g]; }
    o.data[di]=c[0]; o.data[di+1]=c[1]; o.data[di+2]=c[2]; o.data[di+3]=255;
  }
}
writeFileSync(out, encodePng(o.width,o.height,o.data));
console.log(`${out} ${o.width}x${o.height}  window x[${x0}..${x1}] y[${y0}..${y1}] zoom=${z}`);
