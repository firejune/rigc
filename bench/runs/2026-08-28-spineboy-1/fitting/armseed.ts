/**
 * Generalised 2-link chain seeding: place a chain's end-piece centre on a world
 * target at a set of candidate end angles, solving the two links analytically.
 * Used for rear-arm+gun (teal target), front-arm+fist (template target), and
 * legs+boots (red-component targets).
 */
import { Skeleton } from '@esotericsoftware/spine-core';
import { sidecar } from './lib.ts';
import { applyPose, type PoseVec } from './pose.ts';

const vw = sidecar().viewport;
export const toWorld = (px: number, py: number): [number, number] => [vw.x + px / vw.scale, vw.y + (vw.pixelHeight - py) / vw.scale];
const D = Math.PI / 180;

function worldRotOf(bone: { appliedPose: { a: number; c: number } }): number {
  return Math.atan2(bone.appliedPose.c, bone.appliedPose.a) / D;
}
function norm(a: number): number {
  while (a > 180) a -= 360;
  while (a <= -180) a += 360;
  return a;
}

export interface ChainDef {
  parentOfChain: string; // e.g. 'torso' or 'hip'
  link1: string; // upper-arm / thigh
  link2: string; // bracer / shin
  end: string; // gun / front-fist / front-foot
  slot: string; // slot whose attachment centre is targeted
}

export const REAR_ARM: ChainDef = { parentOfChain: 'torso', link1: 'rear-upper-arm', link2: 'rear-bracer', end: 'gun', slot: 'gun' };
export const FRONT_ARM: ChainDef = { parentOfChain: 'torso', link1: 'front-upper-arm', link2: 'front-bracer', end: 'front-fist', slot: 'front-fist' };
export const FRONT_LEG: ChainDef = { parentOfChain: 'hip', link1: 'front-thigh', link2: 'front-shin', end: 'front-foot', slot: 'front-foot' };
export const REAR_LEG: ChainDef = { parentOfChain: 'hip', link1: 'rear-thigh', link2: 'rear-shin', end: 'rear-foot', slot: 'rear-foot' };

/**
 * Seeds: pose variants with {link1,link2,end}.rot set so the end slot's art
 * centre lands on targetWorld with the end bone's ART at each candidate world
 * angle (degrees). Both elbow solutions per angle.
 */
export function chainSeeds(
  skeleton: Skeleton, pose: PoseVec, chain: ChainDef, targetWorld: [number, number], endArtAngles: number[],
): PoseVec[] {
  const base: PoseVec = { ...pose };
  delete base[`${chain.link1}.rot`]; delete base[`${chain.link2}.rot`]; delete base[`${chain.end}.rot`];
  applyPose(skeleton, base);
  const b1 = skeleton.findBone(chain.link1)!;
  const b2 = skeleton.findBone(chain.link2)!;
  const be = skeleton.findBone(chain.end)!;
  const parentWorld = worldRotOf(skeleton.findBone(chain.parentOfChain)!);
  const S: [number, number] = [b1.appliedPose.worldX, b1.appliedPose.worldY];
  const E: [number, number] = [b2.appliedPose.worldX, b2.appliedPose.worldY];
  const EP: [number, number] = [be.appliedPose.worldX, be.appliedPose.worldY];
  const L1 = Math.hypot(E[0] - S[0], E[1] - S[1]);
  const L2 = Math.hypot(EP[0] - E[0], EP[1] - E[1]);

  const slot = skeleton.findSlot(chain.slot)!;
  const att = slot.appliedPose.attachment as {
    computeWorldVertices: (s: unknown, o: unknown, w: number[], off: number, stride: number) => void;
    getOffsets: (p: unknown) => unknown;
  } | null;
  if (!att) return [];
  const world = new Array<number>(8).fill(0);
  att.computeWorldVertices(slot, att.getOffsets(slot.appliedPose), world, 0, 2);
  const centreW: [number, number] = [(world[0] + world[2] + world[4] + world[6]) / 4, (world[1] + world[3] + world[5] + world[7]) / 4];
  const endWorld = worldRotOf(be);
  const dx = centreW[0] - EP[0], dy = centreW[1] - EP[1];
  const cofX = dx * Math.cos(-endWorld * D) - dy * Math.sin(-endWorld * D);
  const cofY = dx * Math.sin(-endWorld * D) + dy * Math.cos(-endWorld * D);
  const cofLen = Math.hypot(cofX, cofY);
  const cofAng = Math.atan2(cofY, cofX) / D;
  // art angle relative to end bone: constant; artWorld(at base) − endWorld(at base)
  const artQuadAngle = (() => {
    const ex = world[2] - world[0], ey = world[3] - world[1];
    return Math.atan2(ey, ex) / D; // one edge direction; constant offset cancels below
  })();

  const s1 = b1.data.setupPose.rotation;
  const s2 = b2.data.setupPose.rotation;
  const se = be.data.setupPose.rotation;

  const seeds: PoseVec[] = [];
  for (const artAng of endArtAngles) {
    const endBoneTarget = endWorld + norm(artAng - artQuadAngle);
    const epT: [number, number] = [
      targetWorld[0] - cofLen * Math.cos((endBoneTarget + cofAng) * D),
      targetWorld[1] - cofLen * Math.sin((endBoneTarget + cofAng) * D),
    ];
    const dd = Math.hypot(epT[0] - S[0], epT[1] - S[1]);
    const d = Math.min(Math.max(dd, Math.abs(L1 - L2) + 1), L1 + L2 - 1);
    const cosA = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
    const A = Math.acos(Math.min(1, Math.max(-1, cosA))) / D;
    const phi = Math.atan2(epT[1] - S[1], epT[0] - S[0]) / D;
    for (const sgn of [1, -1]) {
      const th1 = phi + sgn * A;
      const Ex = S[0] + L1 * Math.cos(th1 * D), Ey = S[1] + L1 * Math.sin(th1 * D);
      const th2 = Math.atan2(epT[1] - Ey, epT[0] - Ex) / D;
      seeds.push({
        ...pose,
        [`${chain.link1}.rot`]: norm(th1 - parentWorld - s1),
        [`${chain.link2}.rot`]: norm(th2 - th1 - s2),
        [`${chain.end}.rot`]: norm(endBoneTarget - th2 - se),
      });
    }
  }
  return seeds;
}

/** red components (boots/pads): r>150, g<95, b<95, size >= minPx, centroid below rowCut */
export function redComponents(
  frame: { width: number; height: number; data: Uint8Array }, box: { minX: number; minY: number; maxX: number; maxY: number },
  minPx: number, rowCut: number,
): { cx: number; cy: number; n: number; axisDeg: number }[] {
  const w = frame.width, h = frame.height;
  const mask = new Uint8Array(w * h);
  for (let y = Math.max(0, box.minY - 4); y <= Math.min(h - 1, box.maxY + 4); y++) {
    for (let x = Math.max(0, box.minX - 4); x <= Math.min(w - 1, box.maxX + 4); x++) {
      const i = (y * w + x) * 4;
      if (frame.data[i] > 150 && frame.data[i + 1] < 95 && frame.data[i + 2] < 95) mask[y * w + x] = 1;
    }
  }
  const label = new Int32Array(w * h).fill(-1);
  const out: { cx: number; cy: number; n: number; axisDeg: number }[] = [];
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || label[i] >= 0) continue;
    const px: number[] = [];
    stack.push(i); label[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      px.push(j);
      const jy = Math.floor(j / w), jx = j % w;
      for (let dy = -1; dy <= 1; dy++) for (let dx2 = -1; dx2 <= 1; dx2++) {
        const ny = jy + dy, nx = jx + dx2;
        if (ny < 0 || nx < 0 || ny >= h || nx >= w) continue;
        const n = ny * w + nx;
        if (mask[n] && label[n] < 0) { label[n] = 1; stack.push(n); }
      }
    }
    if (px.length < minPx) continue;
    let sx = 0, sy = 0;
    for (const j of px) { sx += j % w; sy += Math.floor(j / w); }
    const cx = sx / px.length, cy = sy / px.length;
    if (cy < rowCut) continue;
    let sxx = 0, sxy = 0, syy = 0;
    for (const j of px) {
      const ddx = (j % w) - cx, ddy = Math.floor(j / w) - cy;
      sxx += ddx * ddx; sxy += ddx * ddy; syy += ddy * ddy;
    }
    const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    out.push({ cx, cy, n: px.length, axisDeg: (-theta * 180) / Math.PI });
  }
  return out.sort((a, b) => b.n - a.n);
}
