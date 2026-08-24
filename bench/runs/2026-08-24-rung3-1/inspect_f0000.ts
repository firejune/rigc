import { readPlate } from '../../../tools/plate.ts';

const ref0 = readPlate('bench/reference/3-timing-and-spacing/heavy/f0000.png');
console.log('f0000 dimensions:', ref0.width, 'x', ref0.height);

// Let's print an ASCII map of non-background pixels in f0000 (256x116 scaled down to say 64x29)
const downW = 64;
const downH = 29;
const scaleX = ref0.width / downW;
const scaleY = ref0.height / downH;

const map: string[] = [];
for (let y = 0; y < downH; y++) {
  let row = '';
  for (let x = 0; x < downW; x++) {
    const srcX = Math.floor(x * scaleX);
    const srcY = Math.floor(y * scaleY);
    const p = ref0.get(srcX, srcY);
    if (p[0] === 232 && p[1] === 232 && p[2] === 232) {
      row += '.';
    } else {
      row += '#';
    }
  }
  map.push(row);
}
console.log(map.join('\n'));

// Let's find the exact bounding boxes of the two connected components in ref0
const visited = new Uint8Array(ref0.width * ref0.height);
const components: { minX: number; maxX: number; minY: number; maxY: number; count: number; cx: number; cy: number }[] = [];

for (let y = 0; y < ref0.height; y++) {
  for (let x = 0; x < ref0.width; x++) {
    const idx = y * ref0.width + x;
    if (visited[idx]) continue;
    const p = ref0.get(x, y);
    if (p[0] === 232 && p[1] === 232 && p[2] === 232) {
      visited[idx] = 1;
      continue;
    }
    // BFS component
    let minX = x, maxX = x, minY = y, maxY = y, count = 0, sumX = 0, sumY = 0;
    const queue = [[x, y]];
    visited[idx] = 1;

    while (queue.length > 0) {
      const [cx, cy] = queue.pop()!;
      count++;
      sumX += cx;
      sumY += cy;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;

      const neighbors = [
        [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]
      ];
      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < ref0.width && ny >= 0 && ny < ref0.height) {
          const nidx = ny * ref0.width + nx;
          if (!visited[nidx]) {
            visited[nidx] = 1;
            const np = ref0.get(nx, ny);
            if (np[0] !== 232 || np[1] !== 232 || np[2] !== 232) {
              queue.push([nx, ny]);
            }
          }
        }
      }
    }
    components.push({
      minX, maxX, minY, maxY, count,
      cx: sumX / count,
      cy: sumY / count,
    });
  }
}

console.log('Connected components in f0000:');
for (const c of components) {
  console.log(`Component (${c.count} px): pixel box x=[${c.minX}..${c.maxX}], y=[${c.minY}..${c.maxY}], center=(${c.cx.toFixed(1)}, ${c.cy.toFixed(1)})`);
}
