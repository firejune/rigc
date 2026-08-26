import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { planKeys, forcedIndices, fitHandles, autoHandles, clusterHandles, spanDev, bezY, type Handles, type Key } from './plan.ts';
import { quads, type Glob, type Pose } from './fitall.ts';
import { render, refFrame } from './fit.ts';
import type { Plate } from '../../../../tools/plate.ts';
import { dpx, band } from './dcheck.ts';

const { g, poses, setup } = JSON.parse(readFileSync('./clean.json','utf8')) as { g: Glob, poses: Record<string,Pose[]>, setup: Pose };
const TWEAK = JSON.parse(readFileSync('./tweak.json','utf8'));
const SCALE = 0.11762789374256415;
const PEND_LEN = 583, BLK_HALFDIAG = 111;
const PX_DEG_PEND = PEND_LEN*Math.PI/180*SCALE, PX_DEG_BLK = BLK_HALFDIAG*Math.PI/180*SCALE;
const FPS = 12, TOL = TWEAK.tolPx as number;
const SETS: [string, number][] = [['heavy',65],['light',21]];
for (const [s] of SETS) for (const [k,v] of Object.entries((TWEAK[s] ?? {}) as Record<string,number>)) poses[s][+k].rho = v;

type Chan = { key: string, target: string, property: string, chans: number[][], weight: number[] };
const channels = (s: string): Chan[] => { const P = poses[s];
  const rot = { key:'pendRot', target:'pendulum', property:'rotate', chans:[P.map(p=>p.rho)], weight:[PX_DEG_PEND] };
  const brot = { key:'blkRot', target:'square', property:'rotate', chans:[P.map(p=>p.phi)], weight:[PX_DEG_BLK] };
  if (TWEAK.sepAxes) return [rot,
    { key:'blkX', target:'square', property:'translatex', chans:[P.map(p=>p.Bx-setup.Bx)], weight:[SCALE] },
    { key:'blkY', target:'square', property:'translatey', chans:[P.map(p=>p.By-setup.By)], weight:[SCALE] }, brot];
  return [rot,
    { key:'blkTrans', target:'square', property:'translate', chans:[P.map(p=>p.Bx-setup.Bx), P.map(p=>p.By-setup.By)], weight:[SCALE,SCALE] }, brot];
};
const times = (n:number) => [...Array(n).keys()].map(k=>k/FPS);

// ---- pass A: discover the shapes, freely ----
const free: Handles[] = [];
for (const [s,n] of SETS) for (const c of channels(s)) {
  const t = times(n), forced = forcedIndices(c.chans);
  let i = 0;
  while (i < n-1) {
    let bestJ = i+1, bestH = autoHandles(t, c.chans[0], i, i+1);
    for (let j=i+2;j<n;j++) {
      if (forced.has(j-1)) break;
      const h = fitHandles(t, c.chans, i, j, c.weight);
      if (spanDev(t, c.chans, i, j, h, c.weight) > TOL) break;
      bestJ = j; bestH = h;
    }
    free.push(bestH); i = bestJ;
  }
}
const r4 = (x:number)=>Math.round(x*10000)/10000;
const easings: Record<string, Handles> = {};
clusterHandles(free, TWEAK.easings).forEach((h,i)=>{ easings[`e${i+1}`] = h.map(r4) as Handles; });

// ---- pass B, with the frames closing the loop on the reduction ----
const refD: Record<string, number[]> = {};
for (const [s,n] of SETS) { refD[s] = []; const r: Plate[] = [];
  for (let i=0;i<n;i++) r.push(refFrame(s,i));
  for (let i=1;i<n;i++) refD[s][i] = dpx(r[i-1], r[i]); }

function sampleKeys(keys: Key[], t: number[], chans: number[][], n: number): number[][] {
  const out = chans.map(()=>new Array(n).fill(0));
  for (let ki=0; ki<keys.length-1; ki++) {
    const a = keys[ki].i, b = keys[ki+1].i;
    const h = keys[ki].ease ? easings[keys[ki].ease!] : null;
    for (let k=a;k<b;k++) {
      const x = (t[k]-t[a])/(t[b]-t[a]);
      const y = h ? bezY(h, x) : x;
      chans.forEach((ch,c)=>{ out[c][k] = ch[a] + (ch[b]-ch[a])*y; });
    }
  }
  chans.forEach((ch,c)=>{ out[c][n-1] = ch[n-1]; });
  return out;
}

const plans: Record<string, Record<string, Key[]>> = {};
let rounds = 0;
for (const [s,n] of SETS) {
  const t = times(n);
  const cs = channels(s);
  const extra = new Set<number>();
  let plan: Record<string, Key[]> = {};
  for (let round=0; round<14; round++) {
    rounds = Math.max(rounds, round+1);
    plan = {};
    const sampled: Record<string, number[][]> = {};
    for (const c of cs) {
      const forced = forcedIndices(c.chans);
      for (const e of extra) forced.add(e);
      plan[c.key] = planKeys(t, c.chans, TOL, forced, easings, c.weight, TWEAK.rel ?? 1);
      sampled[c.key] = sampleKeys(plan[c.key], t, c.chans, n);
    }
    // render the sampled series and test every adjacent pair against the frames' own change
    const pl: Plate[] = [];
    for (let i=0;i<n;i++) pl.push(render(quads(g, {
      rho: sampled.pendRot[0][i],
      Bx: setup.Bx + (TWEAK.sepAxes ? sampled.blkX[0][i] : sampled.blkTrans[0][i]),
      By: setup.By + (TWEAK.sepAxes ? sampled.blkY[0][i] : sampled.blkTrans[1][i]),
      phi: sampled.blkRot[0][i] })));
    const bad: number[] = [];
    for (let i=1;i<n;i++) { const [lo,hi]=band(refD[s][i]); const m=dpx(pl[i-1],pl[i]);
      if (m<lo||m>hi) bad.push(i); }
    if (!bad.length) { console.log(`${s}: reduction agrees with the frames after ${round+1} round(s)`); break; }
    console.log(`${s}: round ${round+1} — pairs out of band: ${bad.join(',')}`);
    for (const i of bad) { extra.add(i-1); extra.add(i); }
  }
  plans[s] = plan;
}

// ---- emit ----
type EmitKey = { t: number; v: number[]; ease?: string };
type EmitTrack = { bone: string; property: string; keys: EmitKey[] };
const animations: Record<string, { duration: number; loop: boolean; tracks: EmitTrack[] }> = {};
let keyTotal = 0;
for (const [s,n] of SETS) {
  const tracks: EmitTrack[] = [];
  for (const c of channels(s)) {
    const keys = plans[s][c.key]; keyTotal += keys.length;
    tracks.push({ bone: c.target, property: c.property, keys: keys.map((k,idx)=>{
      const out: EmitKey = { t: k.i/FPS, v: c.chans.map(ch=>r4(ch[k.i])) };
      if (idx < keys.length-1 && k.ease) out.ease = k.ease;
      return out; }) });
    console.log(`  ${s}.${c.key}: ${keys.length} keys of ${n}`);
  }
  animations[s] = { duration: (n-1)/FPS, loop: false, tracks };
}
console.log(`easings ${Object.keys(easings).length}, keys ${keyTotal}`);
const NAME = 'timing-and-spacing';
const rig = {
  spec: 'rigc-rig/1', name: NAME, images: 'images',
  skeleton: { x: -485, y: -2, width: 946, height: 816 },
  bones: [
    { name: 'root' },
    { name: 'pendulum', parent: 'root', x: Math.round(g.Px*100)/100, y: Math.round(g.Py*100)/100, length: PEND_LEN },
    { name: 'square', parent: 'root', x: Math.round(setup.Bx*100)/100, y: Math.round(setup.By*100)/100, length: 159 },
  ],
  slots: [
    { name: 'pendulum', bone: 'pendulum', attachment: 'pendulum' },
    { name: 'square', bone: 'square', attachment: 'square' },
  ],
  skins: { default: {
    pendulum: { pendulum: { image: 'pendulum.png', x: -316.5, y: 0 } },
    square: { square: { image: 'square.png' } } } },
};
mkdirSync('./cand', { recursive: true });
writeFileSync('../timing-and-spacing.rig.json', JSON.stringify(rig, null, 2) + '\n');
writeFileSync('../timing-and-spacing.motion.json',
  JSON.stringify({ spec: 'rigc-motion/1', archetype: NAME, cut: NAME, easings, animations }, null, 2) + '\n');
console.log('wrote ./cand/*.json');
