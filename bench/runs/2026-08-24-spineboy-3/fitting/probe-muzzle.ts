import { readPlate } from '../../../../tools/plate.ts';
import { buildTemplate, match } from './match.ts';
const names = ['muzzle01','muzzle02','muzzle03','muzzle04','muzzle05','muzzle-glow','muzzle-ring'];
for (const f of [2,3,4]) {
  const fr = readPlate(`bench/reference/spineboy/ess/shoot/f000${f}.png`);
  // flare bbox by the brief's own predicate
  let x0=1e9,y0=1e9,x1=-1,y1=-1,n=0;
  for (let y=0;y<fr.height;y++) for (let x=0;x<fr.width;x++){const i=(y*fr.width+x)*4;const r=fr.data[i],g=fr.data[i+1],b=fr.data[i+2];
    if (Math.abs(r-232)>8||Math.abs(g-232)>8||Math.abs(b-232)>8) { if (r>200&&b>140&&g<Math.min(r,b)-30){n++;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;} }}
  console.log(`f${f}: flare ${n}px box (${x0},${y0})-(${x1},${y1})`);
  for (const nm of names) {
    const t = buildTemplate(`examples/spineboy/images/${nm}.png`, nm);
    const m = match(t, fr, [x0-25,y0-25,x1+25,y1+25]);
    console.log('   ', nm.padEnd(13), `(${m.x.toFixed(1)},${m.y.toFixed(1)})`.padEnd(16), `deg ${m.deg.toFixed(1)}`.padEnd(11), `res ${m.residual.toFixed(0)}`.padEnd(11), `vis ${(m.vis*100).toFixed(0)}%`);
  }
}
