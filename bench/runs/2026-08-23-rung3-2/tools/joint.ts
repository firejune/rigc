import { bez } from "./bezfit.ts";
export interface Track{name:string;keys:{t:number;v:number;ease?:string}[];samples:{t:number;v:number;w?:number}[];unit:number}
export function evalT(tr:Track,E:Record<string,number[]>,t:number){
  const k=tr.keys;
  if(t<=k[0].t)return k[0].v;
  if(t>=k[k.length-1].t)return k[k.length-1].v;
  for(let i=0;i<k.length-1;i++) if(t>=k[i].t&&t<=k[i+1].t){
    const u=(t-k[i].t)/(k[i+1].t-k[i].t);
    const e=k[i].ease; if(!e) return k[i].v+(k[i+1].v-k[i].v)*u;
    const h=E[e]; return k[i].v+(k[i+1].v-k[i].v)*bez(u,h[0],h[1],h[2],h[3]);
  }
  return k[k.length-1].v;
}
export function cost(tracks:Track[],E:Record<string,number[]>){
  let s=0,n=0;
  for(const tr of tracks) for(const p of tr.samples){
    const d=(evalT(tr,E,p.t)-p.v)*tr.unit; const w=p.w??1; s+=w*d*d; n+=w;
  }
  return Math.sqrt(s/n);
}
export function optimise(tracks:Track[],E:Record<string,number[]>,names:string[]){
  let best=cost(tracks,E); let step=0.2;
  for(let it=0;it<4000;it++){
    let improved=false;
    for(const nm of names) for(let k=0;k<4;k++) for(const d of [-step,step]){
      const save=E[nm][k]; const nv=save+d;
      if((k===0||k===2)&&(nv<0||nv>1))continue;
      if((k===1||k===3)&&(nv<-1.5||nv>2.5))continue;
      E[nm][k]=nv; const c=cost(tracks,E);
      if(c<best-1e-12){best=c;improved=true;} else E[nm][k]=save;
    }
    if(!improved){step/=2; if(step<1e-5)break;}
  }
  return best;
}
export function perTrack(tracks:Track[],E:Record<string,number[]>){
  for(const tr of tracks){
    let s=0,n=0,w=0,wf=0;
    for(const p of tr.samples){const d=(evalT(tr,E,p.t)-p.v)*tr.unit;s+=d*d;n++;if(Math.abs(d)>w){w=Math.abs(d);wf=p.t*12;}}
    console.log(`  ${tr.name.padEnd(28)} rms ${(Math.sqrt(s/n)).toFixed(3)} px  worst ${w.toFixed(3)} px at f${wf.toFixed(0)}`);
  }
}
