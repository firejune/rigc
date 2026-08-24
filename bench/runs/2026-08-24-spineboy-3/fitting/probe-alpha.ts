import { readPlate } from '../../../../tools/plate.ts';
for (const n of ['muzzle01','muzzle02','muzzle03','muzzle04','muzzle05','muzzle-glow','muzzle-ring','goggles','head']) {
  const p = readPlate(`examples/spineboy/images/${n}.png`);
  let solid=0, semi=0, none=0; let maxA=0;
  for (let i=3;i<p.data.length;i+=4){const a=p.data[i]; if(a>200)solid++; else if(a>10)semi++; else none++; if(a>maxA)maxA=a;}
  console.log(n.padEnd(13), `${p.width}x${p.height}`.padEnd(9), `solid ${solid}`.padEnd(12), `semi ${semi}`.padEnd(12), `maxA ${maxA}`);
}
