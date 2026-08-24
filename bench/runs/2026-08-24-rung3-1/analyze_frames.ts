import { readPlate } from '../../../tools/plate.ts';

function analyzeFrames(dir: string, count: number) {
  console.log(`\n=== Analyzing ${dir} ===`);
  for (let f = 0; f < count; f += 2) {
    const padF = f.toString().padStart(4, '0');
    const plate = readPlate(`bench/reference/3-timing-and-spacing/${dir}/f${padF}.png`);
    
    // Connected components / Bounding box
    let minX = plate.width, maxX = 0, minY = plate.height, maxY = 0;
    let sumX = 0, sumY = 0, total = 0;
    for (let y = 0; y < plate.height; y++) {
      for (let x = 0; x < plate.width; x++) {
        const p = plate.get(x, y);
        if (p[0] !== 232 || p[1] !== 232 || p[2] !== 232) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          sumX += x;
          sumY += y;
          total++;
        }
      }
    }
    console.log(`f${padF}: total ${total} ink px, bbox x=[${minX}..${maxX}], y=[${minY}..${maxY}], center=(${(sumX/total).toFixed(1)}, ${(sumY/total).toFixed(1)})`);
  }
}

analyzeFrames('heavy', 30);
analyzeFrames('light', 21);
