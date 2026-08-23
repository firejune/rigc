import { readPng, type Img } from "./png.ts";
import { circleFit } from "./measure-frames.ts";
const BG=[232,232,232];
const P0={x:91.042,y:22.956};
function cov(img:Img){const c=new Float64Array(img.w*img.h);
  for(let i=0;i<img.w*img.h;i++){const r=img.data[i*4],g=img.data[i*4+1],b=img.data[i*4+2];
    const d=(Math.abs(r-BG[0])+Math.abs(g-BG[1])+Math.abs(b-BG[2]))/3;c[i]=Math.min(1,d/165);}return c;}
function compsOf(m:Uint8Array,w:number,h:number){const lab=new Int32Array(w*h).fill(-1);const out:number[][]=[];
  for(let i=0;i<w*h;i++){if(!m[i]||lab[i]>=0)continue;const id=out.length;const px:number[]=[];const st=[i];lab[i]=id;
    while(st.length){const c=st.pop()!;px.push(c);const cx=c%w,cy=(c/w)|0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=cx+dx,ny=cy+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;const n=ny*w+nx;if(m[n]&&lab[n]<0){lab[n]=id;st.push(n);}}}
    out.push(px);}return out;}
export function ballOnly(path:string){
  const img=readPng(path);const w=img.w,h=img.h;const c=cov(img);
  const m=new Uint8Array(w*h);for(let i=0;i<w*h;i++)m[i]=c[i]>0.03?1:0;
  const parts=compsOf(m,w,h).filter(p=>p.length>=8);
  const isRed=(p:number)=>{const r=img.data[p*4],g=img.data[p*4+1],b=img.data[p*4+2];return r-Math.max(g,b)>20;};
  const pend=parts.filter(p=>p.filter(isRed).length<5).sort((a,b)=>b.length-a.length)[0];
  if(!pend) return null;
  let sx=0,sy=0,sw=0;
  for(const p of pend){const x=p%w,y=(p/w)|0;const r=Math.hypot(x-P0.x,y-P0.y);if(r<57)continue;const ww=c[p];sx+=x*ww;sy+=y*ww;sw+=ww;}
  return sw>50?{x:sx/sw,y:sy/sw,mass:sw}:null;
}
const sets=[["heavy",65],["light",21]] as const;
const balls:{set:string;f:number;x:number;y:number}[]=[];
for(const [d,n] of sets) for(let f=0;f<n;f++){
  const b=ballOnly(`bench/reference/3-timing-and-spacing/${d}/f${String(f).padStart(4,"0")}.png`);
  if(b) balls.push({set:d,f,x:b.x,y:b.y});
}
const uniq:typeof balls=[];for(const p of balls) if(!uniq.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<0.35)) uniq.push(p);
for(const [label,pts] of [["all",balls],["uniq",uniq],["heavy",balls.filter(b=>b.set==="heavy")],["light",balls.filter(b=>b.set==="light")]] as const){
  const f=circleFit(pts as {x:number;y:number}[]);
  let ss=0,mx=0;for(const p of pts){const r=Math.hypot(p.x-f.cx,p.y-f.cy);const e=Math.abs(r-f.r);ss+=e*e;if(e>mx)mx=e;}
  console.log(label.padEnd(6),`pivot=(${f.cx.toFixed(3)}, ${f.cy.toFixed(3)}) R=${f.r.toFixed(3)} rms=${Math.sqrt(ss/pts.length).toFixed(4)} max=${mx.toFixed(3)} n=${pts.length}`);
}
const fit=circleFit(uniq as {x:number;y:number}[]);
const R=(ts:number)=>{let r=-ts-180;while(r<-180)r+=360;while(r>=360)r-=360;return r;};
console.log("\nangles from ball-only (pivot from uniq fit):");
for(const s of ["heavy","light"] as const){
  let prev:number|null=null; const arr:number[]=[];
  for(const b of balls.filter(x=>x.set===s)){
    let r=R(Math.atan2(b.y-fit.cy,b.x-fit.cx)*180/Math.PI);
    if(prev!==null){while(r-prev>180)r-=360;while(r-prev<-180)r+=360;}
    arr.push(+r.toFixed(3)); prev=r;
  }
  console.log(s, JSON.stringify(arr));
}
