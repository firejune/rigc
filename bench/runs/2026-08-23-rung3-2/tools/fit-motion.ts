import { Track, cost, perTrack, evalT } from "./joint.ts";
const F=(f:number)=>f/12;
const U=8.501385683954807;
const RPX=Math.PI/180*68.8, SPX=Math.PI/180*13.2, TPX=1/U;
const B=0.210; // ball-estimator art bias, removed from every reading
const heavyBall=[0.353,0.323,1.477,4.598,9.221,16.926,28.52,46.815,74.106,107.249,123.859,129.441,130.331,128.661,124.992,116.619,101.84,88.103,77.049,69.822,65.373,63.155,62.919,64.457,68.392,74.589,82.191,90.412,98.564,104.449,106.421,105.317,102.034,96.726,90.479,85.04,81.661,80.947,82.538,85.852,89.827,92.995,94.22,93.122,90.94,88.901,87.762,87.814,88.774,90.135,91.134,90.947,89.887,89.446,89.903,90.518,90.61,90.192,89.883,90.078,90.009,89.999,90.004,90.008,90.01];
const lightBall=[0.353,5.283,24.305,72.826,98.056,95.801,89.172,84.735,84.169,87.854,91.917,91.79,89.325,88.266,89.7,90.437,89.521,89.652,90.349,90.349,90.349];
// template-fit block: continuous frame px + screen rotation
const hb:[number,number,number][]=[[112.5,97.5,0],[112.5,97.5,0],[112.5,97.5,0],[112.5,97.5,0],[112.5,97.5,0],[112.5,97.5,0],[112.5,97.5,0],[112.5,97.5,0],[112.5,97.5,0],
 [134.602,91.573,12.825],[157.745,82.752,21.150],[167.117,78.103,28.775],[175.260,77.073,37.755],[182.792,80.237,48.445],[189.897,87.127,61.125],
 [196.665,93.770,77.770],[202.895,90.080,95.040],[208.817,90.153,112.175],[214.177,91.835,129.675],[218.927,93.220,148.405],[223.177,93.150,162.640],
 [226.737,94.218,170.815],[229.602,96.205,178.180],[231.590,96.950,183.855],[232.752,96.560,187.380],[233.762,96.308,188.455],[234.685,96.287,188.365],
 [235.410,96.377,187.755],[236.117,96.755,184.845],[236.462,97.460,179.725]];
const lb:[number,number,number][]=[[112.5,97.5,0],[112.5,97.5,0],[112.5,97.5,0],[112.5,97.5,0],
 [123.213,95.825,8.450],[125.367,95.593,10.985],[124.543,97.495,-0.025]];
const wx=(a:[number,number,number][])=>a.map((p,f)=>({t:F(f),v:(p[0]-112.5)*U,w:1}));
const wy=(a:[number,number,number][])=>a.map((p,f)=>({t:F(f),v:(97.5-p[1])*U,w:1}));
const wr=(a:[number,number,number][])=>a.map((p,f)=>({t:F(f),v:-p[2],w:1}));
const E:Record<string,number[]>={
  swing:[0.3994,0.0113,0.6844,1.0], swingl:[0.3994,0.0113,0.6844,1.0], drop:[0.6525,-0.0263,0.83,0.4387], catch:[0.1487,0.435,0.2975,1.015],
  leave:[0.67,0.07,0.64,0.455], land:[0.11,0.2913,0.42,1.0862], snap:[0.75,0.075,0.3912,0.5212],
  fling:[0.745,0.5687,0.3587,0.9038], slide:[0.0187,0.1625,1,1.025], stop:[0.0738,0.0912,0.2762,1.0225],
  toss:[0.4175,0.24,0.4237,0.9363], arc:[0.4725,-0.075,0.8062,1.37],
  spin:[0.67,0.5225,0.4712,0.9387], whip:[0.4,0.35,0.55,0.9], rock:[0.2812,0.5387,0.3712,-0.1512],
};
const T:Track[]=[
 { name:"heavy pendulum rotate", unit:RPX, samples:heavyBall.map((v,f)=>({t:F(f),v:v-B,w:f===9?0.5:1})),
   keys:[{t:F(0),v:0.143,ease:"drop"},{t:F(8.490),v:90.427,ease:"catch"},{t:F(11.848),v:130.220,ease:"leave"},
    {t:F(16.836),v:90.121,ease:"land"},{t:F(21.87),v:62.859,ease:"swing"},{t:F(30.09),v:106.167,ease:"swing"},
    {t:F(36.62),v:80.598,ease:"swing"},{t:F(41.89),v:93.852,ease:"swing"},{t:F(46.13),v:87.391,ease:"swing"},
    {t:F(50.48),v:90.972,ease:"swing"},{t:F(52.70),v:89.214,ease:"swing"},{t:F(55.59),v:90.451,ease:"swing"},
    {t:F(57.75),v:89.773,ease:"swing"},{t:F(64),v:89.806}]},
 { name:"light pendulum rotate", unit:RPX, samples:lightBall.map((v,f)=>({t:F(f),v:v-B,w:f===4?0.5:1})),
   keys:[{t:F(0),v:0.143,ease:"snap"},{t:F(4.0),v:97.824,ease:"swingl"},{t:F(7.44),v:83.486,ease:"swingl"},
    {t:F(10.44),v:92.125,ease:"swingl"},{t:F(12.75),v:87.980,ease:"swingl"},{t:F(14.75),v:90.285,ease:"swingl"},
    {t:F(16.37),v:89.153,ease:"swingl"},{t:F(18),v:90.139,ease:"swingl"},{t:F(20),v:90.139}]},
 { name:"heavy block translatex", unit:TPX, samples:wx(hb),
   keys:[{t:F(8),v:0,ease:"fling"},{t:F(10.27),v:390,ease:"slide"},{t:F(16.48),v:768.5,ease:"slide"},{t:F(22),v:995.6,ease:"stop"},{t:F(29),v:1053.88}]},
 { name:"heavy block translatey", unit:TPX, samples:wy(hb),
   keys:[{t:F(8),v:0,ease:"toss"},{t:F(11.746),v:174.81,ease:"arc"},{t:F(15.143),v:30.81,ease:"arc"},
    {t:F(16.481),v:66.77,ease:"arc"},{t:F(19.452),v:35.13,ease:"arc"},{t:F(23.157),v:4.56,ease:"arc"},
    {t:F(25.692),v:10.36,ease:"arc"},{t:F(29),v:0.34}]},
 { name:"heavy block rotate", unit:SPX, samples:wr(hb),
   keys:[{t:F(8),v:0,ease:"whip"},{t:F(11),v:-28.775,ease:"spin"},{t:F(25.423),v:-188.56,ease:"rock"},{t:F(29),v:-179.725}]},
 { name:"light block translatex", unit:TPX, samples:wx(lb),
   keys:[{t:F(3),v:0,ease:"fling"},{t:F(5.223),v:110.02,ease:"stop"},{t:F(6),v:102.38}]},
 { name:"light block translatey", unit:TPX, samples:wy(lb),
   keys:[{t:F(3),v:0,ease:"toss"},{t:F(4.609),v:17.60,ease:"arc"},{t:F(6),v:0.04}]},
 { name:"light block rotate", unit:SPX, samples:wr(lb),
   keys:[{t:F(3),v:0,ease:"spin"},{t:F(4.687),v:-11.65,ease:"rock"},{t:F(6),v:0.025}]},
];
const pinV=new Set(["heavy pendulum rotate:0","light pendulum rotate:0","heavy block translatex:0","heavy block translatey:0",
 "heavy block rotate:0","light block translatex:0","light block translatey:0","light block rotate:0"]);
const pinT=new Set(["heavy pendulum rotate:0","heavy pendulum rotate:13","light pendulum rotate:0","light pendulum rotate:7","light pendulum rotate:8",
 "heavy block translatex:0","heavy block translatey:0","heavy block rotate:0","light block translatex:0","light block translatey:0","light block rotate:0"]);
function opt(){
  let best=cost(T,E); let step=1;
  for(let round=0;round<300;round++){
    let improved=false; const s=step;
    for(const nm of Object.keys(E)) for(let k=0;k<4;k++) for(const d of [-0.02*s,0.02*s]){
      const save=E[nm][k]; const nv=save+d;
      if((k===0||k===2)&&(nv<0||nv>1))continue;
      if((k===1||k===3)&&(nv<-1.5||nv>2.5))continue;
      E[nm][k]=nv; const c=cost(T,E); if(c<best-1e-12){best=c;improved=true;} else E[nm][k]=save;
    }
    for(const tr of T) for(let i=0;i<tr.keys.length;i++){
      const id=`${tr.name}:${i}`;
      if(!pinV.has(id)) for(const d of [-0.05*s*(tr.unit>1?1:20),0.05*s*(tr.unit>1?1:20)]){
        const sv=tr.keys[i].v; tr.keys[i].v=sv+d; const c=cost(T,E);
        if(c<best-1e-12){best=c;improved=true;} else tr.keys[i].v=sv; }
      if(!pinT.has(id)&&i>0&&i<tr.keys.length-1) for(const d of [-0.004*s,0.004*s]){
        const sv=tr.keys[i].t, nt=sv+d;
        if(nt<=tr.keys[i-1].t+0.004||nt>=tr.keys[i+1].t-0.004)continue;
        tr.keys[i].t=nt; const c=cost(T,E); if(c<best-1e-12){best=c;improved=true;} else tr.keys[i].t=sv; }
    }
    if(!improved){step/=2; if(step<0.01)break;}
  }
  return best;
}
console.log("start:",cost(T,E).toFixed(4),"  optimised:",opt().toFixed(4),"px rms");
console.log("\neasings:"); for(const [k,v] of Object.entries(E)) console.log(`  "${k}": [${v.map(x=>+x.toFixed(4)).join(", ")}],`);
perTrack(T,E);
console.log("\nkeys:");
for(const tr of T){ console.log(` ${tr.name}`); for(const k of tr.keys) console.log(`   {"t": ${+k.t.toFixed(6)}, "v": [${+k.v.toFixed(3)}]${k.ease?`, "ease": "${k.ease}"`:""}},   // f${(k.t*12).toFixed(2)}`); }
