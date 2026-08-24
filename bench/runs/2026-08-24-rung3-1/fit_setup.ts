import { readPlate, Plate, type RGBA } from '../../../tools/plate.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  fill,
  rasteriseQuad,
  type Quad,
  type Viewport,
  viewportOfSize,
  projector,
  BACKGROUND,
} from '../../../src/render.ts';

const framesJson = JSON.parse(readFileSync('bench/reference/3-timing-and-spacing/frames.json', 'utf-8'));
const vpDef = framesJson.viewport;

const vp: Viewport = viewportOfSize(
  vpDef.x,
  vpDef.y,
  vpDef.width,
  vpDef.height,
  vpDef.scale,
  vpDef.pixelWidth,
  vpDef.pixelHeight,
);

const proj = projector(vp);

const pendulumPlate = readPlate('examples/3-timing-and-spacing/images/pendulum.png');
const squarePlate = readPlate('examples/3-timing-and-spacing/images/square.png');

function renderPieces(quads: { page: Plate; quad: Quad }[]): Plate {
  const out = new Plate(vp.width, vp.height);
  fill(out, BACKGROUND);
  for (const item of quads) {
    rasteriseQuad(
      item.page,
      item.quad,
      proj,
      { width: vp.width, height: vp.height },
      (px, py, r, g, b, a) => {
        out.blend(px, py, [r, g, b, a]);
      }
    );
  }
  return out;
}

// Compute MAE over union of non-background pixels
function computeUnionMAE(plateA: Plate, plateB: Plate): { mae: number; count: number } {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < plateA.data.length; i += 4) {
    const rA = plateA.data[i], gA = plateA.data[i + 1], bA = plateA.data[i + 2];
    const rB = plateB.data[i], gB = plateB.data[i + 1], bB = plateB.data[i + 2];
    const isA = rA !== 232 || gA !== 232 || bA !== 232;
    const isB = rB !== 232 || gB !== 232 || bB !== 232;
    if (isA || isB) {
      sum += (Math.abs(rA - rB) + Math.abs(gA - gB) + Math.abs(bA - bB)) / 3;
      count++;
    }
  }
  return { mae: count > 0 ? sum / count : 0, count };
}

function makeQuad(cx: number, cy: number, w: number, h: number, rotDeg: number, slotName: string): Quad {
  const rad = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = w / 2;
  const hh = h / 2;

  const blX = cx + (-hw * cos - -hh * sin);
  const blY = cy + (-hw * sin + -hh * cos);
  const brX = cx + (hw * cos - -hh * sin);
  const brY = cy + (hw * sin + -hh * cos);
  const ulX = cx + (-hw * cos - hh * sin);
  const ulY = cy + (-hw * sin + hh * cos);
  const urX = cx + (hw * cos - hh * sin);
  const urY = cy + (hw * sin + hh * cos);

  return {
    kind: 'region',
    world: [brX, brY, blX, blY, ulX, ulY, urX, urY],
    uvs: [1, 1, 0, 1, 0, 0, 1, 0],
    tint: [1, 1, 1, 1],
    slot: slotName,
    page: slotName + '.png',
  };
}

const ref0 = readPlate('bench/reference/3-timing-and-spacing/heavy/f0000.png');

console.log('Testing f0000 grid search...');

// In f0000:
// Ref0 pixel bounds: x=[10..121], y=[11..106] -> world x=[-488.3..455.3], y=[7.8..815.4]
// Pendulum: width=745, height=212.
// Square: width=159, height=159.
// In f0000, pendulum is horizontal across top-left:
// Large ball at left: around x = -488 + 103.5 = -384.5
// Small ball (pivot) at right: around x = -384.5 + 576.5 = +192
// Center of pendulum: cx = 192 - 307.5 = -115.5
// Top y = 815.4, height = 212 -> cy = 815.4 - 106 = 709.4

let bestPCx = -115.5;
let bestPCy = 709.4;
let bestPRot = 0;
let bestMAE = Infinity;

for (let dcx = -50; dcx <= 50; dcx += 5) {
  for (let dcy = -50; dcy <= 50; dcy += 5) {
    for (let rot = -5; rot <= 5; rot += 0.5) {
      const qP = makeQuad(bestPCx + dcx, bestPCy + dcy, pendulumPlate.width, pendulumPlate.height, rot, 'pendulum');
      const rendered = renderPieces([{ page: pendulumPlate, quad: qP }]);
      const { mae } = computeUnionMAE(rendered, ref0);
      if (mae < bestMAE) {
        bestMAE = mae;
        bestPCx = -115.5 + dcx;
        bestPCy = 709.4 + dcy;
        bestPRot = rot;
      }
    }
  }
}

console.log(`Coarse pendulum: cx=${bestPCx}, cy=${bestPCy}, rot=${bestPRot}, MAE=${bestMAE.toFixed(4)}`);

// Refine pendulum
for (let dcx = -6; dcx <= 6; dcx += 0.5) {
  for (let dcy = -6; dcy <= 6; dcy += 0.5) {
    for (let rot = -1; rot <= 1; rot += 0.05) {
      const qP = makeQuad(bestPCx + dcx, bestPCy + dcy, pendulumPlate.width, pendulumPlate.height, bestPRot + rot, 'pendulum');
      const rendered = renderPieces([{ page: pendulumPlate, quad: qP }]);
      const { mae } = computeUnionMAE(rendered, ref0);
      if (mae < bestMAE) {
        bestMAE = mae;
        bestPCx = bestPCx + dcx;
        bestPCy = bestPCy + dcy;
        bestPRot = bestPRot + rot;
      }
    }
  }
}
console.log(`Refined pendulum: cx=${bestPCx.toFixed(2)}, cy=${bestPCy.toFixed(2)}, rot=${bestPRot.toFixed(2)}, MAE=${bestMAE.toFixed(4)}`);

// Now find square in f0000
let bestSCx = 350;
let bestSCy = 300;
let bestSRot = 0;
let bestBothMAE = Infinity;

for (let dcx = -150; dcx <= 150; dcx += 10) {
  for (let dcy = -150; dcy <= 150; dcy += 10) {
    for (let rot = -10; rot <= 10; rot += 2) {
      const qP = makeQuad(bestPCx, bestPCy, pendulumPlate.width, pendulumPlate.height, bestPRot, 'pendulum');
      const qS = makeQuad(bestSCx + dcx, bestSCy + dcy, squarePlate.width, squarePlate.height, rot, 'square');
      const rendered = renderPieces([
        { page: squarePlate, quad: qS },
        { page: pendulumPlate, quad: qP },
      ]);
      const { mae } = computeUnionMAE(rendered, ref0);
      if (mae < bestBothMAE) {
        bestBothMAE = mae;
        bestSCx = bestSCx + dcx;
        bestSCy = bestSCy + dcy;
        bestSRot = rot;
      }
    }
  }
}

console.log(`Coarse square: cx=${bestSCx}, cy=${bestSCy}, rot=${bestSRot}, MAE=${bestBothMAE.toFixed(4)}`);

// Fine refine both
for (let dscx = -12; dscx <= 12; dscx += 0.5) {
  for (let dscy = -12; dscy <= 12; dscy += 0.5) {
    for (let srot = -2; srot <= 2; srot += 0.1) {
      const qP = makeQuad(bestPCx, bestPCy, pendulumPlate.width, pendulumPlate.height, bestPRot, 'pendulum');
      const qS = makeQuad(bestSCx + dscx, bestSCy + dscy, squarePlate.width, squarePlate.height, bestSRot + srot, 'square');
      const rendered = renderPieces([
        { page: squarePlate, quad: qS },
        { page: pendulumPlate, quad: qP },
      ]);
      const { mae } = computeUnionMAE(rendered, ref0);
      if (mae < bestBothMAE) {
        bestBothMAE = mae;
        bestSCx = bestSCx + dscx;
        bestSCy = bestSCy + dscy;
        bestSRot = bestSRot + srot;
      }
    }
  }
}

console.log(`Final f0000 setup:`);
console.log(`Pendulum: cx=${bestPCx.toFixed(2)}, cy=${bestPCy.toFixed(2)}, rot=${bestPRot.toFixed(2)}`);
console.log(`Square: cx=${bestSCx.toFixed(2)}, cy=${bestSCy.toFixed(2)}, rot=${bestSRot.toFixed(2)}`);
console.log(`MAE=${bestBothMAE.toFixed(4)}`);
