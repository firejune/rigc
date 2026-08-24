import { readPlate } from '../../../tools/plate.ts';

const p = readPlate('examples/3-timing-and-spacing/images/pendulum.png');
const s = readPlate('examples/3-timing-and-spacing/images/square.png');

console.log('Pendulum plate:', p.width, 'x', p.height);
console.log('Square plate:', s.width, 'x', s.height);

// Find bounding box and centroid of pendulum
let pMinX = p.width, pMaxX = 0, pMinY = p.height, pMaxY = 0;
let pSumX = 0, pSumY = 0, pCount = 0;

for (let y = 0; y < p.height; y++) {
  for (let x = 0; x < p.width; x++) {
    const a = p.get(x, y)[3];
    if (a > 10) {
      if (x < pMinX) pMinX = x;
      if (x > pMaxX) pMaxX = x;
      if (y < pMinY) pMinY = y;
      if (y > pMaxY) pMaxY = y;
      pSumX += x;
      pSumY += y;
      pCount++;
    }
  }
}

console.log(`Pendulum ink bbox: x=[${pMinX}..${pMaxX}] (w=${pMaxX - pMinX + 1}), y=[${pMinY}..${pMaxY}] (h=${pMaxY - pMinY + 1})`);
console.log(`Pendulum centroid: (${(pSumX / pCount).toFixed(2)}, ${(pSumY / pCount).toFixed(2)})`);

// In pendulum image, y is 0 at top, height-1 at bottom in plate coords.
// Let's analyze the right circular end (small ball) and left circular end (large ball)
// Small ball on right: find the circle fit on the right side (say x > 600)
let rightSumX = 0, rightSumY = 0, rightCount = 0;
let leftSumX = 0, leftSumY = 0, leftCount = 0;

for (let y = 0; y < p.height; y++) {
  for (let x = 0; x < p.width; x++) {
    const a = p.get(x, y)[3];
    if (a > 128) {
      if (x > 600) {
        rightSumX += x;
        rightSumY += y;
        rightCount++;
      }
      if (x < 200) {
        leftSumX += x;
        leftSumY += y;
        leftCount++;
      }
    }
  }
}

console.log(`Right ball centroid in image: (${(rightSumX / rightCount).toFixed(2)}, ${(rightSumY / rightCount).toFixed(2)})`);
console.log(`Left ball centroid in image: (${(leftSumX / leftCount).toFixed(2)}, ${(leftSumY / leftCount).toFixed(2)})`);

// Square bbox and centroid
let sMinX = s.width, sMaxX = 0, sMinY = s.height, sMaxY = 0;
let sSumX = 0, sSumY = 0, sCount = 0;

for (let y = 0; y < s.height; y++) {
  for (let x = 0; x < s.width; x++) {
    const a = s.get(x, y)[3];
    if (a > 10) {
      if (x < sMinX) sMinX = x;
      if (x > sMaxX) sMaxX = x;
      if (y < sMinY) sMinY = y;
      if (y > sMaxY) sMaxY = y;
      sSumX += x;
      sSumY += y;
      sCount++;
    }
  }
}
console.log(`Square ink bbox: x=[${sMinX}..${sMaxX}] (w=${sMaxX - sMinX + 1}), y=[${sMinY}..${sMaxY}] (h=${sMaxY - sMinY + 1})`);
console.log(`Square centroid: (${(sSumX / sCount).toFixed(2)}, ${(sSumY / sCount).toFixed(2)})`);
