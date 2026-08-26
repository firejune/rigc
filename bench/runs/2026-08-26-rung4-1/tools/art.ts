// art.ts <png...> — alpha bbox, and orange-blob centroids inside the art
import { readPlate } from '../../../../tools/plate.ts';
for (const f of process.argv.slice(2)) {
  const p = readPlate(f);
  let x0=1e9,y0=1e9,x1=-1,y1=-1,n=0;
  // orange = r much greater than b
  let ox0=1e9,oy0=1e9,ox1=-1,oy1=-1,osx=0,osy=0,on=0;
  for (let y=0;y<p.height;y++) for (let x=0;x<p.width;x++){
    const i=(y*p.width+x)*4; const a=p.data[i+3];
    if (a>16){ n++; if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y;
      const r=p.data[i],g=p.data[i+1],b=p.data[i+2];
      if (r>140 && r-b>60){ on++; osx+=x; osy+=y; if(x<ox0)ox0=x; if(x>ox1)ox1=x; if(y<oy0)oy0=y; if(y>oy1)oy1=y; }
    }
  }
  console.log(`${f.split('/').pop()} ${p.width}x${p.height} alpha bbox x[${x0}..${x1}] y[${y0}..${y1}] ink=${n}`);
  if (on) console.log(`   orange n=${on} bbox x[${ox0}..${ox1}] y[${oy0}..${oy1}] centroid (${(osx/on).toFixed(1)}, ${(osy/on).toFixed(1)})`);
}
