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
import { readFileSync, writeFileSync } from 'node:fs';

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
const SQ_SETUP_Y = 78.6;

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

function fitFrame(ref: Plate, initPRot: number, initSX: number, initSY: number, initSRot: number, squareCanMove: boolean): FramePose {
  let bestPRot = initPRot;
  let bestSX = initSX;
  let bestSY = initSY;
  let bestSRot = initSRot;
  let bestMAE = computeMAE(renderPose(bestPRot, bestSX, bestSY, bestSRot), ref);

  // 1. Broad pendulum scan in [ -20 .. 180 ]
  for (let rot = -20; rot <= 180; rot += 2) {
    const mae = computeMAE(renderPose(rot, bestSX, bestSY, bestSRot), ref);
    if (mae < bestMAE) {
      bestMAE = mae;
      bestPRot = rot;
    }
  }

  // Refine pendulum (0.5 deg)
  for (let drot = -4; drot <= 4; drot += 0.5) {
    const rot = bestPRot + drot;
    const mae = computeMAE(renderPose(rot, bestSX, bestSY, bestSRot), ref);
    if (mae < bestMAE) {
      bestMAE = mae;
      bestPRot = rot;
    }
  }

  if (squareCanMove) {
    // 2. Scan square position in world coords
    // World x ranges from 350 to 1500, y ranges from 50 to 400
    const xMin = Math.max(350, bestSX - 150);
    const xMax = Math.min(1500, bestSX + 150);
    const yMin = Math.max(50, bestSY - 100);
    const yMax = Math.min(400, bestSY + 100);

    for (let sx = xMin; sx <= xMax; sx += 15) {
      for (let sy = yMin; sy <= yMax; sy += 15) {
        for (let srot = -360; srot <= 360; srot += 30) {
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

    // Refine square position and rotation
    for (let dsx = -20; dsx <= 20; dsx += 2) {
      for (let dsy = -20; dsy <= 20; dsy += 2) {
        for (let dsrot = -35; dsrot <= 35; dsrot += 5) {
          const sx = bestSX + dsx;
          const sy = bestSY + dsy;
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
  }

  // Ultra-fine joint polish
  for (let dprot = -1; dprot <= 1; dprot += 0.1) {
    const prot = bestPRot + dprot;
    if (squareCanMove) {
      for (let dsx = -4; dsx <= 4; dsx += 0.5) {
        for (let dsy = -4; dsy <= 4; dsy += 0.5) {
          for (let dsrot = -6; dsrot <= 6; dsrot += 0.5) {
            const sx = bestSX + dsx;
            const sy = bestSY + dsy;
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
    } else {
      const mae = computeMAE(renderPose(prot, bestSX, bestSY, bestSRot), ref);
      if (mae < bestMAE) {
        bestMAE = mae;
        bestPRot = prot;
      }
    }
  }

  return {
    frame: 0,
    time: 0,
    pRot: Number(bestPRot.toFixed(2)),
    sX: Number(bestSX.toFixed(2)),
    sY: Number(bestSY.toFixed(2)),
    sRot: Number(bestSRot.toFixed(2)),
    mae: Number(bestMAE.toFixed(4)),
  };
}

function fitAnimation(name: string, frameCount: number, fps: number, impactFrame: number, restFrame: number): FramePose[] {
  console.log(`\n================ Fitting ${name} (${frameCount} frames) ================`);
  const poses: FramePose[] = [];

  let lastPRot = 0;
  let lastSX = SQ_SETUP_X;
  let lastSY = SQ_SETUP_Y;
  let lastSRot = 0;

  for (let f = 0; f < frameCount; f++) {
    const padF = f.toString().padStart(4, '0');
    const ref = readPlate(`bench/reference/3-timing-and-spacing/${name}/f${padF}.png`);
    const time = f / fps;

    const squareCanMove = f >= impactFrame && f <= restFrame + 2;
    const res = fitFrame(ref, lastPRot, lastSX, lastSY, lastSRot, squareCanMove);
    res.frame = f;
    res.time = time;

    lastPRot = res.pRot;
    lastSX = res.sX;
    lastSY = res.sY;
    lastSRot = res.sRot;

    poses.push(res);
    console.log(
      `f${padF} (t=${time.toFixed(3)}s): pendulum rot=${res.pRot}°, ` +
      `square=(${res.sX}, ${res.sY}, rot=${res.sRot}°), MAE=${res.mae}`
    );
  }

  return poses;
}

const heavyPoses = fitAnimation('heavy', 65, 12, 9, 32);
writeFileSync('bench/runs/2026-08-24-rung3-1/heavy_poses.json', JSON.stringify(heavyPoses, null, 2));

const lightPoses = fitAnimation('light', 21, 12, 4, 8);
writeFileSync('bench/runs/2026-08-24-rung3-1/light_poses.json', JSON.stringify(lightPoses, null, 2));

console.log('All fitting complete!');
