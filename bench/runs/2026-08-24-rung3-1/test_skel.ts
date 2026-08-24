import {
  Skeleton,
  SkeletonData,
  BoneData,
  SlotData,
  RegionAttachment,
  TextureAtlas,
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

// Create mock Spine TextureAtlas with 2 pages
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
const regP = atlas.findRegion('pendulum')!;
const regS = atlas.findRegion('square')!;

function createTestSkeleton(
  pBoneX: number, pBoneY: number, pRot: number,
  pAttX: number, pAttY: number, pAttRot: number,
  sBoneX: number, sBoneY: number, sRot: number,
  sAttX: number, sAttY: number, sAttRot: number,
): Skeleton {
  const data = new SkeletonData();
  data.name = 'test';

  const root = new BoneData(0, 'root', null);
  data.bones.push(root);

  const pBone = new BoneData(1, 'pendulum', root);
  pBone.setupPose.x = pBoneX;
  pBone.setupPose.y = pBoneY;
  pBone.setupPose.rotation = pRot;
  data.bones.push(pBone);

  const sBone = new BoneData(2, 'square', root);
  sBone.setupPose.x = sBoneX;
  sBone.setupPose.y = sBoneY;
  sBone.setupPose.rotation = sRot;
  data.bones.push(sBone);

  // Slots in draw order: square, then pendulum
  const slotS = new SlotData(0, 'square', sBone);
  slotS.attachmentName = 'square';
  data.slots.push(slotS);

  const slotP = new SlotData(1, 'pendulum', pBone);
  slotP.attachmentName = 'pendulum';
  data.slots.push(slotP);

  // Create region attachments
  const attP = new RegionAttachment('pendulum');
  attP.region = regP;
  attP.width = pendulumPlate.width;
  attP.height = pendulumPlate.height;
  attP.x = pAttX;
  attP.y = pAttY;
  attP.rotation = pAttRot;
  attP.updateRegion();

  const attS = new RegionAttachment('square');
  attS.region = regS;
  attS.width = squarePlate.width;
  attS.height = squarePlate.height;
  attS.x = sAttX;
  attS.y = sAttY;
  attS.rotation = sAttRot;
  attS.updateRegion();

  const skeleton = new Skeleton(data);
  skeleton.slots[0].setAttachment(attS);
  skeleton.slots[1].setAttachment(attP);
  skeleton.updateWorldTransform(0);

  return skeleton;
}

function renderSkeleton(skeleton: Skeleton): Plate {
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

console.log('Testing skeleton rendering with spine-core...');
const skel = createTestSkeleton(
  200, 709, 0,
  -307.5, 0, 0,
  350, 300, 0,
  0, 0, 0
);
const rend = renderSkeleton(skel);
const mae = computeMAE(rend, ref0);
console.log('Initial Spine render MAE:', mae);
