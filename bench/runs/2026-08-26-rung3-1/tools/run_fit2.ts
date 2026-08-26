import { fitFrame, refine, quads, score, type Glob, type Pose } from './fitall.ts';
import { refFrame } from './fit.ts';
import type { Plate } from '../../../../tools/plate.ts';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
const SETS: [string,number][] = [['heavy',65],['light',21]];
let g: Glob = { Px: 204.75, Py: 707.40, sp: 1, sb: 1, blockFront: process.argv[2] !== 'pendfront' };
const refs: Record<string, Plate[]> = {};
for (const [s,n] of SETS) { refs[s]=[]; for (let i=0;i<n;i++) refs[s].push(refFrame(s,i)); }
let poses: Record<string, Pose[]> = { heavy: [], light: [] };
const seedFile = './poses.json';
if (existsSync(seedFile) && process.argv.includes('--seed')) poses = JSON.parse(readFileSync(seedFile,'utf8')).poses;

const FINE = [[1,3,3,1],[0.3,1,1,0.3],[0.1,0.3,0.3,0.1],[0.03,0.1,0.1,0.03],[0.01,0.03,0.03,0.01],[0.003,0.01,0.01,0.003]];
function totalErr() { let t=0,c=0; for (const [s,n] of SETS) for (let i=0;i<n;i++){ t+=score(g,poses[s][i],refs[s][i]); c++; } return t/c; }

// pass 0: coarse per-frame
for (const [s,n] of SETS) {
  const out: Pose[] = [];
  let prev: Pose = { rho: 0, Bx: 381.15, By: 79.30, phi: 0 };
  for (let i=0;i<n;i++) {
    const seeds: Pose[] = [prev];
    if (poses[s][i]) seeds.push(poses[s][i]);
    if (i>=2) seeds.push({ rho: 2*out[i-1].rho-out[i-2].rho, Bx: 2*out[i-1].Bx-out[i-2].Bx, By: 2*out[i-1].By-out[i-2].By, phi: 2*out[i-1].phi-out[i-2].phi });
    const r = fitFrame(g, refs[s][i], seeds);
    out.push(r.p); prev = r.p;
  }
  poses[s] = out;
}
console.log('after coarse', totalErr().toFixed(4));

for (let round=0; round<4; round++) {
  // globals: coordinate descent on Px,Py over a spread
  const spread: [string,number][] = [];
  for (const [s,n] of SETS) for (let i=0;i<n;i+=3) spread.push([s,i]);
  const gErr = () => { let t=0; for (const [s,i] of spread) t+=score(g,poses[s][i],refs[s][i]); return t/spread.length; };
  let gb = gErr();
  for (const st of [2, 0.7, 0.25, 0.08, 0.03]) for (let it=0; it<30; it++) {
    let imp=false;
    for (const k of ['Px','Py'] as const) for (const d of [st,-st]) {
      const old = g[k]; g[k] = old + d; const e = gErr();
      if (e < gb - 1e-10) { gb = e; imp = true; } else g[k] = old;
    }
    if (!imp) break;
  }
  // per-frame refine with neighbour + own seeds
  for (const [s,n] of SETS) for (let i=0;i<n;i++) {
    const cands: Pose[] = [poses[s][i]];
    if (i>0) cands.push(poses[s][i-1]);
    if (i<n-1) cands.push(poses[s][i+1]);
    let best: {p:Pose,e:number}|null = null;
    for (const c of cands) { const r = refine(g, c, refs[s][i], FINE); if (!best || r.e < best.e) best = r; }
    poses[s][i] = best!.p;
  }
  console.log(`round ${round}: pivot (${g.Px.toFixed(2)}, ${g.Py.toFixed(2)})  mean err ${totalErr().toFixed(4)}`);
}
writeFileSync('./poses.json', JSON.stringify({ g, poses }, null, 1));
for (const [s,n] of SETS) {
  console.log(`=== ${s} ===`);
  for (let i=0;i<n;i++) { const p=poses[s][i];
    console.log(` f${String(i).padStart(2,'0')} e=${score(g,p,refs[s][i]).toFixed(3)} rho=${p.rho.toFixed(3)} B=(${p.Bx.toFixed(2)},${p.By.toFixed(2)}) phi=${p.phi.toFixed(2)}`); }
}
