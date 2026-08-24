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
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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

// Fixed Pivot setup
// Small ball pivot at: (199.0, 707.0)
// Attachment offset: (-307.5, 0)
// Square setup: (381.35, 79.1)
const PIVOT_X = 199.0;
const PIVOT_Y = 707.0;
const ATT_X = -307.5;
const ATT_Y = 0;

const SQ_SETUP_X = 381.35;
const SQ_SETUP_Y = 79.1;

function makeSkeletonJson(): any {
  return {
    skeleton: { spine: '4.3.00', width: 2000, height: 1000 },
    bones: [
      { name: 'root' },
      { name: 'square', parent: 'root', x: SQ_SETUP_X, y: SQ_SETUP_Y },
      { name: 'pendulum', parent: 'root', x: PIVOT_X, y: PIVOT_Y },
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
            pendulum: { x: ATT_X, y: ATT_Y, width: pendulumPlate.width, height: pendulumPlate.height },
          },
        },
      },
    ],
    animations: {},
  };
}

const baseSkeletonData = new SkeletonJson(loader).readSkeletonData(makeSkeletonJson());

function renderPose(pRot: number, sX: number, sY: number, sRot: number): Plate {
  const skeleton = new Skeleton(baseSkeletonData);
  skeleton.setupPose();

  const pBone = skeleton.findBone('pendulum')!;
  pBone.pose.rotation = pRot;

  const sBone = skeleton.findBone('square')!;
  sBone.pose.x = sX;
  sBone.pose.y = sY;
  sBone.pose.rotation = sRot;

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

// First, let's optimize the setup pose parameters (PIVOT_X, PIVOT_Y, ATT_X, SQ_SETUP_X, SQ_SETUP_Y) on f0000
const ref0 = readPlate('bench/reference/3-timing-and-spacing/heavy/f0000.png');
console.log('Optimizing setup pose on f0000...');

function fitSetupPose(): { pivotX: number; pivotY: number; attX: number; sqX: number; sqY: number; mae: number } {
  let best = { pivotX: 199.0, pivotY: 707.0, attX: -307.5, sqX: 381.35, sqY: 79.1, mae: Infinity };
  
  for (let pRot = -1; pRot <= 1; pRot += 0.2) {
    for (let sRot = -1; sRot <= 1; sRot += 0.2) {
      for (let dpx = -3; dpx <= 3; dpx += 0.5) {
        for (let dpy = -3; dpy <= 3; dpy += 0.5) {
          for (let dsx = -3; dsx <= 3; dsx += 0.5) {
            for (let dsy = -3; dsy <= 3; dsy += 0.5) {
              const curPX = 199.0 + dpx;
              const curPY = 707.0 + dpy;
              const curSX = 381.35 + dsx;
              const curSY = 79.1 + dsy;
              const rend = renderPose(pRot, curSX, curSY, sRot);
              const mae = computeMAE(rend, ref0);
              if (mae < best.mae) {
                best = { pivotX: curPX, pivotY: curPY, attX: -307.5, sqX: curSX, sqY: curSY, mae };
              }
            }
          }
        }
      }
    }
  }
  return best;
}

const setupResult = fitSetupPose();
console.log('Best setup fit:', setupResult);
