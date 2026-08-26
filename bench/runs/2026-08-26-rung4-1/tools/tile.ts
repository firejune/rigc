// tile.ts <set> <index> — reference tile | candidate | overlay, at 3x
import { readFileSync, writeFileSync } from 'node:fs';
import { sheetTiles, rigFrom, pose, type Knobs } from './fitlib.ts';
import { tileViewport } from './half.ts';
import { renderFrame } from '../../../../src/render.ts';
import { Plate, encodePng } from '../../../../tools/plate.ts';
const D = 'bench/runs/2026-08-26-rung4-1/spine';
const set = process.argv[2]; const idx = Number(process.argv[3]);
const n = set === 'ball-catch' ? 241 : 33;
const tiles = sheetTiles(`bench/reference/4-wave-principle/${set}@24fps/contact.png`, n, 8, 0, 0);
const rig = rigFrom(readFileSync(`${D}/skeleton.json`,'utf8'), readFileSync(`${D}/skeleton.atlas`,'utf8'), D);
const v = tileViewport(3);
const poses = JSON.parse(readFileSync(`bench/runs/2026-08-26-rung4-1/fit/${set}.half.json`,'utf8')).poses as Knobs[];
const cand = renderFrame({index:idx,time:0,pieces:pose(rig, poses[idx])}, rig.posable.pages, v, [232,232,232,255]);
const ref = tiles[idx];
// window on both
let x0=1e9,y0=1e9,x1=-1,y1=-1;
const inkAt=(get:(x:number,y:number)=>number[])=>{for(let y=0;y<ref.height;y++)for(let x=0;x<ref.width;x++){const c=get(x,y);const d=Math.abs(c[0]-232)+Math.abs(c[1]-232)+Math.abs(c[2]-232); if(d>24){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}}};
inkAt((x,y)=>[ref.rgb[(y*ref.width+x)*3],ref.rgb[(y*ref.width+x)*3+1],ref.rgb[(y*ref.width+x)*3+2]]);
inkAt((x,y)=>cand.get(x,y) as unknown as number[]);
const pad=4; x0=Math.max(0,x0-pad); y0=Math.max(0,y0-pad); x1=Math.min(ref.width-1,x1+pad); y1=Math.min(ref.height-1,y1+pad);
const w=x1-x0+1,h=y1-y0+1,z=Math.max(1,Math.min(8,Math.floor(1300/(3*w))));
const o = new Plate(w*3*z,h*z);
for (let j=0;j<h*z;j++) for(let i=0;i<w*3*z;i++){
  const col=Math.floor(i/(w*z)); const lx=Math.floor((i-col*w*z)/z)+x0, ly=Math.floor(j/z)+y0;
  const ri=(ly*ref.width+lx)*3; const rc=[ref.rgb[ri],ref.rgb[ri+1],ref.rgb[ri+2]]; const cc=cand.get(lx,ly);
  const di=(j*w*3*z+i)*4;
  let c:number[];
  if (col===0) c=rc; else if (col===1) c=[cc[0],cc[1],cc[2]];
  else { const rI=Math.abs(rc[0]-232)+Math.abs(rc[1]-232)+Math.abs(rc[2]-232)>24; const cI=Math.abs(cc[0]-232)+Math.abs(cc[1]-232)+Math.abs(cc[2]-232)>24;
    c = rI&&!cI?[220,40,40]:cI&&!rI?[40,90,220]:rI&&cI?[40,200,40]:[240,240,240]; }
  o.data[di]=c[0];o.data[di+1]=c[1];o.data[di+2]=c[2];o.data[di+3]=255;
}
writeFileSync(`/tmp/z/tile-${set}-${idx}.png`, encodePng(o.width,o.height,o.data));
console.log(`/tmp/z/tile-${set}-${idx}.png ${o.width}x${o.height} zoom ${z}`);
