import { quads, type Glob, type Pose } from './fitall.ts';
import { render, refFrame } from './fit.ts';
import type { Plate } from '../../../../tools/plate.ts';
export const TOL = 8, RATIO = 4, EXCESS = 24;
export function dpx(a: Plate, b: Plate): number {
  let px=0; const A=a.data,B=b.data,n=a.width*a.height;
  for (let i=0;i<n*4;i+=4){ if (Math.abs(A[i]-B[i])>TOL||Math.abs(A[i+1]-B[i+1])>TOL||Math.abs(A[i+2]-B[i+2])>TOL) px++; }
  return px;
}
export function disagrees(mine:number, theirs:number) {
  if (mine===0) return false; if (theirs===0) return true;
  return mine > theirs*RATIO && mine - theirs > EXCESS;
}
/** allowed band for my Δpx given the reference's */
export function band(ref:number): [number,number] {
  let lo=0, hi=1e9;
  for (let m=0;m<=4000;m++) if (!disagrees(m,ref) && !disagrees(ref,m)) { lo=m; break; }
  for (let m=4000;m>=0;m--) if (!disagrees(m,ref) && !disagrees(ref,m)) { hi=m; break; }
  return [lo,hi];
}
export function report(g: Glob, poses: Record<string,Pose[]>, sets: [string,number][]) {
  let bad = 0;
  for (const [s,n] of sets) {
    const mine: Plate[] = [], theirs: Plate[] = [];
    for (let i=0;i<n;i++) { mine.push(render(quads(g, poses[s][i]))); theirs.push(refFrame(s,i)); }
    const lines: string[] = [];
    for (let i=1;i<n;i++) {
      const m = dpx(mine[i-1], mine[i]), t = dpx(theirs[i-1], theirs[i]);
      const v = disagrees(m,t) ? 'MOVES' : disagrees(t,m) ? 'HOLDS' : '';
      if (v) bad++;
      const [lo,hi] = band(t);
      lines.push(`${String(i).padStart(2)}: mine=${String(m).padStart(4)} ref=${String(t).padStart(4)} ok=[${lo}..${hi===1e9?'inf':hi}] ${v}`);
    }
    console.log(`=== ${s} ===`);
    for (const l of lines) console.log((/MOVES|HOLDS/.test(l)?'  ! ':'    ')+l);
    console.log(`  ${lines.filter(l=>!/MOVES|HOLDS/.test(l)).length}/${n-1} pairs agree`);
  }
  return bad;
}
