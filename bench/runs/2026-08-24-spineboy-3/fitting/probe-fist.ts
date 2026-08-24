import { readPlate } from '../tools/plate.ts';
import { buildTemplate, match, score, visibility, ESS_SCALE } from './match.ts';
const CASES: [string, number[]][] = [['idle',[0,10]],['walk',[0,4,8]],['run',[0,4]],['jump',[0,8,16]],['shoot',[0,3]],['hit',[0,4]],['death',[0,30,50]],['aim',[0]]];
const tc = buildTemplate('examples/spineboy/images/front-fist-closed.png','c');
const to = buildTemplate('examples/spineboy/images/front-fist-open.png','o');
for (const [anim, idxs] of CASES) {
  for (const i of idxs) {
    const fr = readPlate(`bench/reference/spineboy/ess/${anim}/f${String(i).padStart(4,'0')}.png`);
    let x0=1e9,y0=1e9,x1=-1,y1=-1;
    for (let y=0;y<fr.height;y++) for (let x=0;x<fr.width;x++){const j=(y*fr.width+x)*4;
      if (Math.abs(fr.data[j]-232)>8||Math.abs(fr.data[j+1]-232)>8||Math.abs(fr.data[j+2]-232)>8){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}}
    const mc = match(tc, fr, [x0-4,y0-4,x1+4,y1+4]);
    const mo = match(to, fr, [x0-4,y0-4,x1+4,y1+4]);
    // cross-score: each template at the other's best placement
    const at = (t: typeof tc, m: typeof mc) => { const r=m.deg*Math.PI/180; return [score(t,fr,m.x,m.y,Math.cos(r),Math.sin(r),ESS_SCALE), visibility(t,fr,m.x,m.y,Math.cos(r),Math.sin(r),ESS_SCALE)] as [number,number]; };
    const [cAtO] = at(tc, mo); const [oAtC] = at(to, mc);
    console.log(`${anim}/f${i}`.padEnd(12),
      `closed (${mc.x.toFixed(0)},${mc.y.toFixed(0)}) res ${mc.residual.toFixed(0)} vis ${(mc.vis*100).toFixed(0)}%`.padEnd(44),
      `open (${mo.x.toFixed(0)},${mo.y.toFixed(0)}) res ${mo.residual.toFixed(0)} vis ${(mo.vis*100).toFixed(0)}%`.padEnd(42),
      `cross: closed@open ${cAtO.toFixed(0)} open@closed ${oAtC.toFixed(0)}`);
  }
}
