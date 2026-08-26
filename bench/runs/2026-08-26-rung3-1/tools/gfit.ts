import { quad, render, err, refFrame } from './fit.ts';
import type { Plate } from '../../../../tools/plate.ts';
import type { Pose } from './fitall.ts';
import { readFileSync, writeFileSync } from 'node:fs';
const { g, poses, setup } = JSON.parse(readFileSync('./clean.json','utf8'));
const PW=745, PH=212, SW=159, SH=159;
type G = { Px:number,Py:number,ax:number,ay:number,arot:number,sp:number, bax:number,bay:number,brot:number,sb:number };
let G0: G = { Px:g.Px, Py:g.Py, ax:-316.5, ay:0, arot:0, sp:1, bax:0, bay:0, brot:0, sb:1 };
const SETS: [string,number][] = [['heavy',65],['light',21]];
const spread: [string,number][] = [];
for (const [s,n] of SETS) for (let i=0;i<n;i+=2) spread.push([s,i]);
const refs = new Map<string,Plate>(); for (const [s,i] of spread) refs.set(`${s}${i}`, refFrame(s,i));
const P: Record<string, Pose[]> = {
  heavy: (poses.heavy as Pose[]).map((p) => ({ ...p })),
  light: (poses.light as Pose[]).map((p) => ({ ...p })),
};
function mk(G: G, p: Pose) {
  const pend = quad('pendulum', G.Px, G.Py, p.rho + G.arot, G.ax*G.sp, G.ay*G.sp, PW*G.sp, PH*G.sp);
  const blk = quad('square', p.Bx, p.By, p.phi + G.brot, G.bax*G.sb, G.bay*G.sb, SW*G.sb, SH*G.sb);
  return [pend, blk];
}
const cost = (G: G) => { let t=0; for (const [s,i] of spread) t += err(render(mk(G, P[s][i])), refs.get(`${s}${i}`)!); return t/spread.length; };
const keys: (keyof G)[] = ['Px','Py','ax','ay','arot','sp','bax','bay','brot','sb'];
const scale: Record<string, number> = { Px:1, Py:1, ax:1, ay:1, arot:0.05, sp:0.0005, bax:1, bay:1, brot:0.05, sb:0.0005 };
let best = cost(G0);
console.log('start', best.toFixed(4));
for (const mul of [4, 1.5, 0.6, 0.25, 0.1, 0.04]) for (let it=0;it<60;it++) {
  let imp=false;
  for (const k of keys) for (const d of [scale[k]*mul, -scale[k]*mul]) {
    const q = {...G0}; (q[k] as number) += d; const c = cost(q);
    if (c < best - 1e-9) { best=c; G0=q; imp=true; }
  }
  if (!imp) break;
}
console.log('after global', best.toFixed(4));
console.log(JSON.stringify(G0, (k,v)=> typeof v==='number'? Math.round(v*10000)/10000 : v));
writeFileSync('./gfit.json', JSON.stringify(G0, null, 1));
