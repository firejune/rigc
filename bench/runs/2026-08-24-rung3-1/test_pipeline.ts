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

function makeSkeletonJson(
  pBoneX: number, pBoneY: number, pRot: number,
  pAttX: number, pAttY: number, pAttRot: number,
  sBoneX: number, sBoneY: number, sRot: number,
  sAttX: number, sAttY: number, sAttRot: number,
): any {
  return {
    skeleton: { spine: '4.3.00', width: 2000, height: 1000 },
    bones: [
      { name: 'root' },
      { name: 'pendulum', parent: 'root', x: pBoneX, y: pBoneY, rotation: pRot },
      { name: 'square', parent: 'root', x: sBoneX, y: sBoneY, rotation: sRot },
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
            square: { x: sAttX, y: sAttY, rotation: sAttRot, width: squarePlate.width, height: squarePlate.height },
          },
          pendulum: {
            pendulum: { x: pAttX, y: pAttY, rotation: pAttRot, width: pendulumPlate.width, height: pendulumPlate.height },
          },
        },
      },
    ],
    animations: {},
  };
}

function renderFromParams(
  pBoneX: number, pBoneY: number, pRot: number,
  pAttX: number, pAttY: number, pAttRot: number,
  sBoneX: number, sBoneY: number, sRot: number,
  sAttX: number, sAttY: number, sAttRot: number,
): Plate {
  const json = makeSkeletonJson(pBoneX, pBoneY, pRot, pAttX, pAttY, pAttRot, sBoneX, sBoneY, sRot, sAttX, sAttY, sAttRot);
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

console.log('Testing SkeletonJson pipeline...');
const rend = renderFromParams(
  0, 0, 0,
  -107.5, 707.4, 0,
  0, 0, 0,
  350, 300, 0
);
const mae = computeMAE(rend, ref0);
console.log('Rendered SkeletonJson MAE:', mae.toFixed(4));
