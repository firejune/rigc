import { readPng, type Img } from "./png.ts";
const BG=[232,232,232];
function covMask(img:Img){ const c=new Float64Array(img.w*img.h);
  for(let i=0;i<img.w*img.h;i++){const r=img.data[i*4],g=img.data[i*4+1],b=img.data[i*4+2];
    const d=(Math.abs(r-BG[0])+Math.abs(g-BG[1])+Math.abs(b-BG[2]))/3; c[i]=Math.min(1,d/165);} return c; }
function comps(m:Uint8Array,w:number,h:number){const lab=new Int32Array(w*h).fill(-1);const out:number[][]=[];
  for(let i=0;i<w*h;i++){if(!m[i]||lab[i]>=0)continue;const id=out.length;const px:number[]=[];const st=[i];lab[i]=id;
    while(st.length){const c=st.pop()!;px.push(c);const cx=c%w,cy=(c/w)|0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=cx+dx,ny=cy+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;const n=ny*w+nx;if(m[n]&&lab[n]<0){lab[n]=id;st.push(n);}}}
    out.push(px);}return out;}

export function pendCentroid(path:string){
  const img=readPng(path); const w=img.w,h=img.h; const c=covMask(img);
  const m=new Uint8Array(w*h); for(let i=0;i<w*h;i++) m[i]=c[i]>0.03?1:0;
  const parts=comps(m,w,h).filter(p=>p.length>=8);
  const isRed=(p:number)=>{const r=img.data[p*4],g=img.data[p*4+1],b=img.data[p*4+2];return r-Math.max(g,b)>20;};
  const noRed=parts.filter(p=>p.filter(isRed).length<5);
  if(noRed.length!==1) return null;   // merged frame -> skip
  let sx=0,sy=0,sw=0; for(const p of noRed[0]){const x=p%w,y=(p/w)|0;const ww=c[p];sx+=x*ww;sy+=y*ww;sw+=ww;}
  return {x:sx/sw,y:sy/sw,mass:sw};
}
// Kasa circle fit
export function circleFit(pts:{x:number;y:number}[]){
  let sx=0,sy=0,sxx=0,syy=0,sxy=0,sxz=0,syz=0,sz=0;const n=pts.length;
  for(const p of pts){const z=p.x*p.x+p.y*p.y;sx+=p.x;sy+=p.y;sxx+=p.x*p.x;syy+=p.y*p.y;sxy+=p.x*p.y;sxz+=p.x*z;syz+=p.y*z;sz+=z;}
  const A=[[sxx,sxy,sx],[sxy,syy,sy],[sx,sy,n]]; const b=[sxz,syz,sz];
  // solve 3x3
  for(let i=0;i<3;i++){let p=i;for(let k=i+1;k<3;k++)if(Math.abs(A[k][i])>Math.abs(A[p][i]))p=k;
    [A[i],A[p]]=[A[p],A[i]];[b[i],b[p]]=[b[p],b[i]];
    for(let k=i+1;k<3;k++){const f=A[k][i]/A[i][i];for(let j=i;j<3;j++)A[k][j]-=f*A[i][j];b[k]-=f*b[i];}}
  const s=[0,0,0];for(let i=2;i>=0;i--){let t=b[i];for(let j=i+1;j<3;j++)t-=A[i][j]*s[j];s[i]=t/A[i][i];}
  const cx=s[0]/2,cy=s[1]/2,r=Math.sqrt(s[2]+cx*cx+cy*cy);
  return {cx,cy,r};
}
