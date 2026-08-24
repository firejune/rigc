import {
  Skeleton,
  SkeletonJson,
  TextureAtlas,
  AtlasAttachmentLoader,
} from '@esotericsoftware/spine-core';
import { readPlate, Plate } from '../../../tools/plate.ts';
import {
  fill,
  type Viewport,
  viewportOfSize,
  projector,
  BACKGROUND,
  piecesOf,
  blitPiece,
  pageFor,
} from '../../../src/render.ts';
import { readFileSync } from 'node:fs';

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

const pages = new Map<string, Plate>();
pages.set('pendulum.png', pendulumPlate);
pages.set('square.png', squarePlate);

const ref0 = readPlate('bench/reference/3-timing-and-spacing/heavy/f0000.png');

const atlasText = `
pendulum.png
size: ${pendulumPlate.width},${pendulumPlate.height}
format: RGBA8888
filter: Linear,Linear
repeat: none
pendulum
  rotate: false
  xy: 0, 0
  size: ${pendulumPlate.width}, ${pendulumPlate.height}
  orig: ${pendulumPlate.width}, ${pendulumPlate.height}
  offset: 0, 0
  index: -1

square.png
size: ${squarePlate.width},${squarePlate.height}
format: RGBA8888
filter: Linear,Linear
repeat: none
square
  rotate: false
  xy: 0, 0
  size: ${squarePlate.width}, ${squarePlate.height}
  orig: ${squarePlate.width}, ${squarePlate.height}
  offset: 0, 0
  index: -1
`;

const atlas = new TextureAtlas(atlasText);
const loader = new AtlasAttachmentLoader(atlas);

function renderSinglePiece(slotName: 'pendulum' | 'square', x: number, y: number, rot: number): Plate {
  const json: any = {
    skeleton: { spine: '4.3.00', width: 2000, height: 1000 },
    bones: [
      { name: 'root' },
      { name: slotName, parent: 'root', x, y, rotation: rot },
    ],
    slots: [
      { name: slotName, bone: slotName, attachment: slotName },
    ],
    skins: [
      {
        name: 'default',
        attachments: {
          [slotName]: {
            [slotName]: {
              width: slotName === 'pendulum' ? pendulumPlate.width : squarePlate.width,
              height: slotName === 'pendulum' ? pendulumPlate.height : squarePlate.height,
            },
          },
        },
      },
    ],
    animations: {},
  };
  const data = new SkeletonJson(loader).readSkeletonData(json);
  const skeleton = new Skeleton(data);
  skeleton.setupPose();
  skeleton.updateWorldTransform(0);

  const out = new Plate(vp.width, vp.height);
  fill(out, BACKGROUND);
  const pieces = piecesOf(skeleton);
  for (const piece of pieces) {
    blitPiece(out, pageFor(pages, piece), piece, proj);
  }
  return out;
}

function computeMAE(plateA: Plate, plateB: Plate): number {
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
  return count > 0 ? sum / count : 0;
}

// 1. Search pendulum center around wx=-202.3, wy=712.7, rot=0
let bestPX = -202.3, bestPY = 712.7, bestPRot = 0;
let minPMAE = Infinity;

for (let dx = -20; dx <= 20; dx += 1) {
  for (let dy = -20; dy <= 20; dy += 1) {
    for (let r = -2; r <= 2; r += 0.2) {
      const rend = renderSinglePiece('pendulum', -202.3 + dx, 712.7 + dy, r);
      const mae = computeMAE(rend, ref0);
      if (mae < minPMAE) {
        minPMAE = mae;
        bestPX = -202.3 + dx;
        bestPY = 712.7 + dy;
        bestPRot = r;
      }
    }
  }
}
console.log(`Fine pendulum: x=${bestPX}, y=${bestPY}, rot=${bestPRot}, MAE=${minPMAE.toFixed(4)}`);

// Ultra fine pendulum
for (let dx = -1; dx <= 1; dx += 0.05) {
  for (let dy = -1; dy <= 1; dy += 0.05) {
    for (let r = -0.2; r <= 0.2; r += 0.02) {
      const rend = renderSinglePiece('pendulum', bestPX + dx, bestPY + dy, bestPRot + r);
      const mae = computeMAE(rend, ref0);
      if (mae < minPMAE) {
        minPMAE = mae;
        bestPX = bestPX + dx;
        bestPY = bestPY + dy;
        bestPRot = bestPRot + r;
      }
    }
  }
}
console.log(`Ultra-fine pendulum: x=${bestPX.toFixed(4)}, y=${bestPY.toFixed(4)}, rot=${bestPRot.toFixed(4)}, MAE=${minPMAE.toFixed(4)}`);

// 2. Search square center around wx=378.8, wy=84.3, rot=0
let bestSX = 378.8, bestSY = 84.3, bestSRot = 0;
let minSMAE = Infinity;

for (let dx = -20; dx <= 20; dx += 1) {
  for (let dy = -20; dy <= 20; dy += 1) {
    for (let r = -2; r <= 2; r += 0.2) {
      const rend = renderSinglePiece('square', 378.8 + dx, 84.3 + dy, r);
      const mae = computeMAE(rend, ref0);
      if (mae < minSMAE) {
        minSMAE = mae;
        bestSX = 378.8 + dx;
        bestSY = 84.3 + dy;
        bestSRot = r;
      }
    }
  }
}
console.log(`Fine square: x=${bestSX}, y=${bestSY}, rot=${bestSRot}, MAE=${minSMAE.toFixed(4)}`);

// Ultra fine square
for (let dx = -1; dx <= 1; dx += 0.05) {
  for (let dy = -1; dy <= 1; dy += 0.05) {
    for (let r = -0.2; r <= 0.2; r += 0.02) {
      const rend = renderSinglePiece('square', bestSX + dx, bestSY + dy, bestSRot + r);
      const mae = computeMAE(rend, ref0);
      if (mae < minSMAE) {
        minSMAE = mae;
        bestSX = bestSX + dx;
        bestSY = bestSY + dy;
        bestSRot = bestSRot + r;
      }
    }
  }
}
console.log(`Ultra-fine square: x=${bestSX.toFixed(4)}, y=${bestSY.toFixed(4)}, rot=${bestSRot.toFixed(4)}, MAE=${minSMAE.toFixed(4)}`);
