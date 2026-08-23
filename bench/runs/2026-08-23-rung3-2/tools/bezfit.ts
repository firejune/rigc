// cubic bezier value: P0=(0,0) P1=(x1,y1) P2=(x2,y2) P3=(1,1); given u in [0,1] find v
export function bez(u:number,x1:number,y1:number,x2:number,y2:number){
  if(u<=0)return 0; if(u>=1)return 1;
  let lo=0,hi=1,t=u;
  for(let i=0;i<40;i++){
    const mt=1-t;
    const x=3*mt*mt*t*x1+3*mt*t*t*x2+t*t*t;
    if(x<u)lo=t;else hi=t;
    t=(lo+hi)/2;
  }
  const mt=1-t;
  return 3*mt*mt*t*y1+3*mt*t*t*y2+t*t*t;
}
export interface Seg{t0:number;t1:number;v0:number;v1:number;samples:{t:number;v:number;w?:number}[]}
export function fitSeg(s:Seg){
  const dv=s.v1-s.v0, dt=s.t1-s.t0;
  if(Math.abs(dv)<1e-9||s.samples.length===0) return {h:[0.25,0,0.75,1] as number[],rms:0,n:s.samples.length};
  const pts=s.samples.map(p=>({u:(p.t-s.t0)/dt, v:(p.v-s.v0)/dv, w:p.w??1}));
  let best=[0.25,0,0.75,1], bestE=1e18;
  const err=(h:number[])=>{let e=0,W=0;for(const p of pts){const d=bez(p.u,h[0],h[1],h[2],h[3])-p.v;e+=p.w*d*d;W+=p.w;}return e/W;};
  // coarse grid then refine
  for(let a=0;a<=20;a++)for(let b=-6;b<=16;b++)for(let c=0;c<=20;c++)for(let d=-6;d<=16;d++){
    const h=[a/20,b/10,c/20,d/10]; const e=err(h); if(e<bestE){bestE=e;best=h;}
  }
  let step=0.05;
  for(let it=0;it<300;it++){
    let improved=false;
    for(let k=0;k<4;k++)for(const s2 of [-step,step]){
      const h=[...best]; h[k]+=s2;
      if(k===0||k===2){ if(h[k]<0||h[k]>1) continue; }
      else if(h[k]<-1.5||h[k]>2.5) continue;
      const e=err(h); if(e<bestE-1e-15){bestE=e;best=h;improved=true;}
    }
    if(!improved){ step/=2; if(step<1e-5)break; }
  }
  return {h:best.map(v=>+v.toFixed(4)), rms:Math.sqrt(bestE)*Math.abs(dv), n:pts.length};
}
export function fitTrack(keys:{t:number;v:number}[], samples:{t:number;v:number;w?:number}[]){
  const out:{t0:number;t1:number;h:number[];rms:number;n:number}[]=[];
  for(let i=0;i<keys.length-1;i++){
    const t0=keys[i].t,t1=keys[i+1].t;
    const inside=samples.filter(p=>p.t>t0+1e-9&&p.t<t1-1e-9);
    const r=fitSeg({t0,t1,v0:keys[i].v,v1:keys[i+1].v,samples:inside});
    out.push({t0,t1,h:r.h,rms:r.rms,n:r.n});
  }
  return out;
}
export function evalTrack(keys:{t:number;v:number}[], hs:number[][], t:number){
  if(t<=keys[0].t)return keys[0].v;
  if(t>=keys[keys.length-1].t)return keys[keys.length-1].v;
  for(let i=0;i<keys.length-1;i++){
    if(t>=keys[i].t&&t<=keys[i+1].t){
      const u=(t-keys[i].t)/(keys[i+1].t-keys[i].t);
      const h=hs[i];
      return keys[i].v+(keys[i+1].v-keys[i].v)*bez(u,h[0],h[1],h[2],h[3]);
    }
  }
  return keys[keys.length-1].v;
}
