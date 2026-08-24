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
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
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

// Setup parameters
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

export interface FramePose {
  frame: number;
  time: number;
  pRot: number;
  sX: number;
  sY: number;
  sRot: number;
  mae: number;
}

function fitSequence(dirName: string, frameCount: number, fps: number): FramePose[] {
  console.log(`\n================ Fitting ${dirName} (${frameCount} frames @ ${fps} fps) ================`);
  const poses: FramePose[] = [];

  let curPRot = 0;
  let curSX = SQ_SETUP_X;
  let curSY = SQ_SETUP_Y;
  let curSRot = 0;

  for (let f = 0; f < frameCount; f++) {
    const padF = f.toString().padStart(4, '0');
    const refPath = `bench/reference/3-timing-and-spacing/${dirName}/f${padF}.png`;
    const ref = readPlate(refPath);
    const time = f / fps;

    let bestPRot = curPRot;
    let bestSX = curSX;
    let bestSY = curSY;
    let bestSRot = curSRot;
    let bestMAE = computeMAE(renderPose(bestPRot, bestSX, bestSY, bestSRot), ref);

    // 1. Scan pendulum rotation around curPRot (-120 .. +30)
    for (let rot = -140; rot <= 30; rot += 2) {
      const mae = computeMAE(renderPose(rot, bestSX, bestSY, bestSRot), ref);
      if (mae < bestMAE) {
        bestMAE = mae;
        bestPRot = rot;
      }
    }

    // Refine pendulum rotation (0.2 deg)
    for (let drot = -4; drot <= 4; drot += 0.2) {
      const rot = bestPRot + drot;
      const mae = computeMAE(renderPose(rot, bestSX, bestSY, bestSRot), ref);
      if (mae < bestMAE) {
        bestMAE = mae;
        bestPRot = rot;
      }
    }

    // 2. Scan square position & rotation if moved or nearby
    // Coarse scan for square:
    const sScanRadiusX = f > 0 ? 80 : 10;
    const sScanRadiusY = f > 0 ? 80 : 10;

    for (let dx = -sScanRadiusX; dx <= sScanRadiusX; dx += 10) {
      for (let dy = -sScanRadiusY; dy <= sScanRadiusY; dy += 10) {
        for (let srot = -180; srot <= 180; srot += 30) {
          const mae = computeMAE(renderPose(bestPRot, curSX + dx, curSY + dy, srot), ref);
          if (mae < bestMAE) {
            bestMAE = mae;
            bestSX = curSX + dx;
            bestSY = curSY + dy;
            bestSRot = srot;
          }
        }
      }
    }

    // Fine square scan
    for (let dx = -15; dx <= 15; dx += 2) {
      for (let dy = -15; dy <= 15; dy += 2) {
        for (let dsrot = -30; dsrot <= 30; dsrot += 3) {
          const sx = bestSX + dx;
          const sy = bestSY + dy;
          const srot = bestSRot + dsrot;
          const mae = computeMAE(renderPose(bestPRot, sx, sy, srot), ref);
          if (mae < bestMAE) {
            bestMAE = mae;
            bestSX = sx;
            bestSY = sy;
            bestSRot = srot;
          }
        }
      }
    }

    // Ultra fine simultaneous scan
    for (let dprot = -1; dprot <= 1; dprot += 0.1) {
      for (let dx = -3; dx <= 3; dx += 0.5) {
        for (let dy = -3; dy <= 3; dy += 0.5) {
          for (let dsrot = -4; dsrot <= 4; dsrot += 0.5) {
            const prot = bestPRot + dprot;
            const sx = bestSX + dx;
            const sy = bestSY + dy;
            const srot = bestSRot + dsrot;
            const mae = computeMAE(renderPose(prot, sx, sy, srot), ref);
            if (mae < bestMAE) {
              bestMAE = mae;
              bestPRot = prot;
              bestSX = sx;
              bestSY = sy;
              bestSRot = srot;
            }
          }
        }
      }
    }

    curPRot = bestPRot;
    curSX = bestSX;
    curSY = bestSY;
    curSRot = bestSRot;

    const pose: FramePose = {
      frame: f,
      time,
      pRot: Number(bestPRot.toFixed(2)),
      sX: Number(bestSX.toFixed(2)),
      sY: Number(bestSY.toFixed(2)),
      sRot: Number(bestSRot.toFixed(2)),
      mae: Number(bestMAE.toFixed(4)),
    };
    poses.push(pose);

    console.log(
      `f${padF} (t=${time.toFixed(3)}s): pendulum rot=${pose.pRot}°, ` +
      `square=(${pose.sX}, ${pose.sY}, rot=${pose.sRot}°), MAE=${pose.mae}`
    );
  }

  return poses;
}

const heavyPoses = fitSequence('heavy', 65, 12);
writeFileSync('bench/runs/2026-08-24-rung3-1/placements_heavy.json', JSON.stringify(heavyPoses, null, 2));

const lightPoses = fitSequence('light', 21, 12);
writeFileSync('bench/runs/2026-08-24-rung3-1/placements_light.json', JSON.stringify(lightPoses, null, 2));

console.log('\nAll frame poses fitted and saved successfully!');
