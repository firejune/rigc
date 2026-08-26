import { quad, render, err, refFrame, VP } from './fit.ts';
import type { Plate } from '../../../../tools/plate.ts';
export const PW=745, PH=212, SW=159, SH=159, AX=-316.5;
export const RED_OFF = [0.35, 13.71]; // local, y-up, from block centre to red centroid
export type Glob = { Px:number, Py:number, sp:number, sb:number, blockFront:boolean };
export type Pose = { rho:number, Bx:number, By:number, phi:number };

export function quads(g: Glob, p: Pose) {
  const pend = quad('pendulum', g.Px, g.Py, p.rho, AX*g.sp, 0, PW*g.sp, PH*g.sp);
  const blk  = quad('square', p.Bx, p.By, p.phi, 0, 0, SW*g.sb, SH*g.sb);
  return g.blockFront ? [pend, blk] : [blk, pend];
}
export function score(g: Glob, p: Pose, ref: Plate) { return err(render(quads(g,p)), ref); }

export function redCentroid(p: Plate): [number,number]|null {
  let n=0,sx=0,sy=0;
  for (let y=0;y<p.height;y++) for (let x=0;x<p.width;x++){ const i=(y*p.width+x)*4;
    if (p.data[i] > p.data[i+2]+20) { n++; sx+=x; sy+=y; } }
  if (!n) return null;
  return [(sx/n+0.5)/VP.scale+VP.minX, VP.maxY-(sy/n+0.5)/VP.scale];
}
export function blockFromRed(red:[number,number], phi:number, sb:number): [number,number] {
  const r=phi*Math.PI/180, c=Math.cos(r), s=Math.sin(r);
  const ox = RED_OFF[0]*sb, oy = RED_OFF[1]*sb;
  return [red[0] - (ox*c - oy*s), red[1] - (ox*s + oy*c)];
}
export function refine(g: Glob, p: Pose, ref: Plate, steps: number[][]): {p:Pose,e:number} {
  let best = score(g,p,ref); let cur = {...p};
  const keys: (keyof Pose)[] = ['rho','Bx','By','phi'];
  for (const st of steps) for (let it=0; it<60; it++) {
    let improved=false;
    for (let k=0;k<4;k++) for (const s of [st[k], -st[k]]) {
      if (s===0) continue;
      const q = {...cur}; (q[keys[k]] as number) += s;
      const e = score(g,q,ref);
      if (e < best - 1e-9) { best=e; cur=q; improved=true; }
    }
    if (!improved) break;
  }
  return { p: cur, e: best };
}
const STEPS = [[8,20,20,8],[3,8,8,3],[1,3,3,1],[0.3,1,1,0.3],[0.1,0.35,0.35,0.1],[0.03,0.12,0.12,0.03],[0.01,0.04,0.04,0.01]];

export function fitFrame(g: Glob, ref: Plate, seeds: Pose[]): {p:Pose,e:number} {
  const red = redCentroid(ref);
  const starts: Pose[] = [...seeds];
  // coarse: scan phi with block from red, and rho full circle
  const phis: number[] = []; for (let a=0;a<360;a+=6) phis.push(a);
  const rhos: number[] = []; for (let a=-10;a<370;a+=3) rhos.push(a);
  let bestCoarse: Pose|null = null, bestE = Infinity;
  const baseRho = seeds.length ? seeds[0].rho : 0;
  for (const phi of phis) {
    const [Bx,By] = red ? blockFromRed(red, phi, g.sb) : [seeds[0].Bx, seeds[0].By];
    const p = { rho: baseRho, Bx, By, phi };
    const e = score(g,p,ref);
    if (e < bestE) { bestE = e; bestCoarse = p; }
  }
  if (bestCoarse) starts.push(bestCoarse);
  // rho scan against the best block guess
  let bestR: Pose|null = null; bestE = Infinity;
  for (const rho of rhos) {
    const p = { ...(bestCoarse ?? starts[0]), rho };
    const e = score(g,p,ref);
    if (e < bestE) { bestE = e; bestR = p; }
  }
  if (bestR) starts.push(bestR);
  let out: {p:Pose,e:number}|null = null;
  for (const s of starts) {
    const r = refine(g, s, ref, STEPS);
    if (!out || r.e < out.e) out = r;
  }
  return out!;
}
