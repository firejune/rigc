import { refine, score, type Glob, type Pose } from './fitall.ts';
import { refFrame } from './fit.ts';
import { readFileSync, writeFileSync } from 'node:fs';
const { g, poses } = JSON.parse(readFileSync('./poses.json','utf8')) as { g: Glob, poses: Record<string,Pose[]> };
const SETS: [string,number][] = [['heavy',65],['light',21]];
// plateaus, from the reference's own Δpx == 0 runs and the red-centroid stillness
const HOLD = {
  heavy: { block: [[0,8],[29,64]], rho: [[61,64]] },
  light: { block: [[0,3],[6,20]],  rho: [[18,20]] },
} as Record<string, { block:number[][], rho:number[][] }>;
// unwrap phi into a continuous series
for (const [s,n] of SETS) {
  for (let i=1;i<n;i++) {
    const p = poses[s][i], q = poses[s][i-1];
    while (p.phi - q.phi > 180) p.phi -= 360;
    while (p.phi - q.phi < -180) p.phi += 360;
  }
}
// setup pose is shared: force both sets' f0 to one value, and hold the plateaus
const setup: Pose = { rho: 0, Bx: 381.32, By: 78.46, phi: 0 };
for (const [s,n] of SETS) {
  for (const [a,b] of HOLD[s].block) {
    const src = a === 0 ? setup : poses[s][b];
    for (let i=a;i<=b;i++) { poses[s][i].Bx = src.Bx; poses[s][i].By = src.By; poses[s][i].phi = a===0 ? 0 : src.phi; }
  }
  for (const [a,b] of HOLD[s].rho) { const v = poses[s][b].rho; for (let i=a;i<=b;i++) poses[s][i].rho = v; }
  poses[s][0].rho = 0;
}
// re-refine the frames that are not inside a hold, with the holds pinned
const FINE = [[0.4,1.2,1.2,0.4],[0.12,0.4,0.4,0.12],[0.04,0.12,0.12,0.04],[0.012,0.04,0.04,0.012],[0.004,0.012,0.012,0.004]];
let tot=0,cnt=0;
for (const [s,n] of SETS) for (let i=0;i<n;i++) {
  const inBlockHold = HOLD[s].block.some(([a,b])=>i>=a&&i<=b);
  const inRhoHold = HOLD[s].rho.some(([a,b])=>i>=a&&i<=b) || i===0;
  const st = FINE.map(v=>[inRhoHold?0:v[0], inBlockHold?0:v[1], inBlockHold?0:v[2], inBlockHold?0:v[3]]);
  const r = refine(g, poses[s][i], refFrame(s,i), st);
  poses[s][i] = r.p; tot += r.e; cnt++;
}
console.log('mean err after cleaning', (tot/cnt).toFixed(4));
// re-unwrap after refine, then re-pin holds
for (const [s,n] of SETS) {
  for (let i=1;i<n;i++) { const p=poses[s][i], q=poses[s][i-1];
    while (p.phi-q.phi>180) p.phi-=360; while (p.phi-q.phi<-180) p.phi+=360; }
  for (const [a,b] of HOLD[s].block) { const src = a===0 ? setup : poses[s][b];
    for (let i=a;i<=b;i++) { poses[s][i].Bx=src.Bx; poses[s][i].By=src.By; poses[s][i].phi=src.phi; } }
  for (const [a,b] of HOLD[s].rho) { const v=poses[s][b].rho; for (let i=a;i<=b;i++) poses[s][i].rho=v; }
}
writeFileSync('./clean.json', JSON.stringify({ g, poses, setup }, null, 1));
for (const [s,n] of SETS) {
  console.log(`=== ${s} ===`);
  for (let i=0;i<n;i++){ const p=poses[s][i];
    console.log(` f${String(i).padStart(2,'0')} rho=${p.rho.toFixed(3)} dB=(${(p.Bx-setup.Bx).toFixed(2)},${(p.By-setup.By).toFixed(2)}) phi=${p.phi.toFixed(2)}`); }
}
