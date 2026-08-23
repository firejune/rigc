import { readPng, type Img } from "./png.ts";
const BG=[232,232,232];
function dark(img:Img,x:number,y:number){
  if(x<0||y<0||x>=img.w||y>=img.h) return 0;
  const i=(y*img.w+x)*4;
  return (Math.abs(img.data[i]-BG[0])+Math.abs(img.data[i+1]-BG[1])+Math.abs(img.data[i+2]-BG[2]))/3;
}
function bil(img:Img,x:number,y:number){
  const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0;
  return dark(img,x0,y0)*(1-fx)*(1-fy)+dark(img,x0+1,y0)*fx*(1-fy)+dark(img,x0,y0+1)*(1-fx)*fy+dark(img,x0+1,y0+1)*fx*fy;
}
const P="bench/reference/3-timing-and-spacing";
const TPL=readPng(`${P}/heavy/f0000.png`);
const TC:[number,number]=[112.5,97.5];   // block centre at f0, continuous px
const R=13.5;
// SSD of the f0 block rotated by rot and placed at c in img; mask = pixels to ignore (pendulum)
function ssd(img:Img,c:[number,number],rot:number,maskC:[number,number]|null,maskR:number){
  const th=rot*Math.PI/180, ct=Math.cos(th), st=Math.sin(th);
  let e=0,n=0;
  for(let v=-R;v<=R;v+=0.5)for(let u=-R;u<=R;u+=0.5){
    if(maskC){ const mx=c[0]+u-maskC[0], my=c[1]+v-maskC[1]; if(mx*mx+my*my<maskR*maskR) continue; }
    const au=u*ct+v*st, av=-u*st+v*ct;      // inverse rotation into template space
    const a=bil(TPL,TC[0]+au-0.5,TC[1]+av-0.5);
    const b=bil(img,c[0]+u-0.5,c[1]+v-0.5);
    e+=(a-b)*(a-b); n++;
  }
  return e/n;
}
export function fitBlock(img:Img,c0:[number,number],rot0:number,maskC:[number,number]|null=null,maskR=0){
  let best:[number,number,number]=[c0[0],c0[1],rot0], bestE=1e18;
  for(let scale of [1,0.25,0.06]){
    const dR=(scale===1?3:scale===0.25?0.8:0.2), dP=(scale===1?2:scale===0.25?0.5:0.12);
    const stepR=dR/8, stepP=dP/8;
    const base:[number,number,number]=[...best];
    for(let r=base[2]-dR;r<=base[2]+dR+1e-9;r+=stepR)
      for(let y=base[1]-dP;y<=base[1]+dP+1e-9;y+=stepP)
        for(let x=base[0]-dP;x<=base[0]+dP+1e-9;x+=stepP){
          const e=ssd(img,[x,y],r,maskC,maskR); if(e<bestE){bestE=e;best=[x,y,r];}
        }
  }
  return {x:best[0],y:best[1],rot:best[2],rms:Math.sqrt(bestE)};
}
const guessH:[number,number,number][]=[
 ...Array.from({length:9},()=>[112.5,97.5,0] as [number,number,number]),
 [134.4,91.9,13],[157.37,82.91,21.80],[166.68,78.15,29.05],[174.87,77.04,37.88],[182.37,80.19,48.37],
 [189.57,86.97,60.95],[196.29,93.52,77.47],[202.77,89.72,95.19],[208.74,89.73,111.80],[214.13,91.46,129.80],
 [219.10,92.83,149.03],[223.35,92.76,162.89],[227.02,93.89,170.54],[229.90,95.72,176.63],[231.84,96.84,184.08],
 [233.08,96.31,187.13],[234.17,96.09,188.13],[235.06,96.10,188.74],[235.80,96.19,187.13],[236.40,96.49,184.77],[236.51,97.32,180.00]];
const guessL:[number,number,number][]=[
 [112.5,97.5,0],[112.5,97.5,0],[112.5,97.5,0],[112.5,97.5,0],[122.9,95.17,9.5],[125.07,95.78,11.31],[124.48,97.51,0]];
console.log("=== heavy block (template fit) ===");
for(let f=0;f<30;f++){
  const img=readPng(`${P}/heavy/f${String(f).padStart(4,"0")}.png`);
  const mask:[number,number,number]|null = f===9?[111.35,88.64,13.6]:null;
  const g=guessH[f];
  const r=fitBlock(img,[g[0],g[1]],g[2],mask?[mask[0],mask[1]]:null,mask?mask[2]:0);
  console.log(`f${String(f).padStart(2)} c=(${r.x.toFixed(3)}, ${r.y.toFixed(3)}) rot=${r.rot.toFixed(3)} rms=${r.rms.toFixed(2)}`);
}
console.log("=== light block (template fit) ===");
for(let f=0;f<7;f++){
  const img=readPng(`${P}/light/f${String(f).padStart(4,"0")}.png`);
  const mask:[number,number,number]|null = f===4?[100.03,91.15,13.6]:null;
  const g=guessL[f];
  const r=fitBlock(img,[g[0],g[1]],g[2],mask?[mask[0],mask[1]]:null,mask?mask[2]:0);
  console.log(`f${String(f).padStart(2)} c=(${r.x.toFixed(3)}, ${r.y.toFixed(3)}) rot=${r.rot.toFixed(3)} rms=${r.rms.toFixed(2)}`);
}
