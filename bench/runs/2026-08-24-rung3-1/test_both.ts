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

function renderBothPieces(pX: number, pY: number, pRot: number, sX: number, sY: number, sRot: number): Plate {
  const json: any = {
    skeleton: { spine: '4.3.00', width: 2000, height: 1000 },
    bones: [
      { name: 'root' },
      { name: 'square', parent: 'root', x: sX, y: sY, rotation: sRot },
      { name: 'pendulum', parent: 'root', x: pX, y: pY, rotation: pRot },
    ],
    slots: [
      { name: 'square', bone: 'square', attachment: 'square' },
      { name: 'pendulum', bone: 'pendulum', attachment: 'pendulum' },
    ],
    skins: [
      {
        name: 'default',
        attachments: {
          square: {
            square: { width: squarePlate.width, height: squarePlate.height },
          },
          pendulum: {
            pendulum: { width: pendulumPlate.width, height: pendulumPlate.height },
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

console.log('Testing combined rendering...');
let pX = -106, pY = 703, pRot = 0;
let sX = 381.35, sY = 79.1, sRot = 0;

let bestMAE = computeMAE(renderBothPieces(pX, pY, pRot, sX, sY, sRot), ref0);
console.log(`Initial both MAE: ${bestMAE.toFixed(4)}`);

// Joint fine search
for (let dpx = -5; dpx <= 5; dpx += 0.5) {
  for (let dpy = -5; dpy <= 5; dpy += 0.5) {
    for (let dsx = -5; dsx <= 5; dsx += 0.5) {
      for (let dsy = -5; dsy <= 5; dsy += 0.5) {
        const rend = renderBothPieces(pX + dpx, pY + dpy, pRot, sX + dsx, sY + dsy, sRot);
        const mae = computeMAE(rend, ref0);
        if (mae < bestMAE) {
          bestMAE = mae;
          pX += dpx;
          pY += dpy;
          sX += dsx;
          sY += dsy;
        }
      }
    }
  }
}

console.log(`After translation search:`);
console.log(`Pendulum: (${pX.toFixed(3)}, ${pY.toFixed(3)}), Square: (${sX.toFixed(3)}, ${sY.toFixed(3)})`);
console.log(`MAE: ${bestMAE.toFixed(4)}`);
