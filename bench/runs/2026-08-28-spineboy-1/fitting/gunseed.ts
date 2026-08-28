/**
 * Analytic seed for the gun chain: measure the gun's own teal on a reference
 * frame (hair excluded by connected components), then 2-link IK the rear arm so
 * the gun centre lands on the measured centroid, at a handful of gun angles.
 */
import { Skeleton } from '@esotericsoftware/spine-core';
import { Plate } from '../../../../tools/plate.ts';
import { sidecar, type Box } from './lib.ts';
import { applyPose, type PoseVec } from './pose.ts';

const vw = sidecar().viewport;
const toWorld = (px: number, py: number): [number, number] => [vw.x + px / vw.scale, vw.y + (vw.pixelHeight - py) / vw.scale];

function isTeal(d: Uint8Array, i: number): boolean {
  const r = d[i], g = d[i + 1], b = d[i + 2];
  return g > 100 && g > r + 30 && b > r + 15 && b < g + 40;
}

/** gun teal centroid + axis on a frame; hair = highest component when nothing sits below the 45% cut */
export function gunTeal(
  frame: Plate, subjectBox: Box, headPx?: { x: number; y: number; r: number },
): { cx: number; cy: number; axisDeg: number; count: number } | null {
  const w = frame.width, h = frame.height;
  const mask = new Uint8Array(w * h);
  for (let y = Math.max(0, subjectBox.minY - 5); y <= Math.min(h - 1, subjectBox.maxY + 5); y++) {
    for (let x = Math.max(0, subjectBox.minX - 30); x <= Math.min(w - 1, subjectBox.maxX + 30); x++) {
      if (isTeal(frame.data, (y * w + x) * 4)) mask[y * w + x] = 1;
    }
  }
  const label = new Int32Array(w * h).fill(-1);
  const comps: { px: number[]; cx: number; cy: number }[] = [];
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || label[i] >= 0) continue;
    const id = comps.length;
    const px: number[] = [];
    stack.push(i); label[i] = id;
    while (stack.length) {
      const j = stack.pop()!;
      px.push(j);
      const jy = Math.floor(j / w), jx = j % w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const ny = jy + dy, nx = jx + dx;
        if (ny < 0 || nx < 0 || ny >= h || nx >= w) continue;
        const n = ny * w + nx;
        if (mask[n] && label[n] < 0) { label[n] = id; stack.push(n); }
      }
    }
    let sx = 0, sy = 0;
    for (const j of px) { sx += j % w; sy += Math.floor(j / w); }
    comps.push({ px, cx: sx / px.length, cy: sy / px.length });
  }
  const big = comps.filter((c) => c.px.length >= 15);
  if (!big.length) return null;
  let gun: typeof big;
  if (headPx) {
    // hair/goggle teal = components near the (already-placed) head; the rest is the gun
    gun = big.filter((c) => Math.hypot(c.cx - headPx.x, c.cy - headPx.y) > headPx.r);
    if (!gun.length) return null;
  } else {
    const cut = subjectBox.minY + 0.45 * (subjectBox.maxY - subjectBox.minY);
    const below = big.filter((c) => c.cy > cut);
    if (below.length) gun = below;
    else {
      const sorted = [...big].sort((a, b) => a.cy - b.cy);
      gun = sorted.slice(1);
      if (!gun.length) return null;
    }
  }
  let n = 0, sx = 0, sy = 0;
  for (const c of gun) { n += c.px.length; sx += c.cx * c.px.length; sy += c.cy * c.px.length; }
  const cx = sx / n, cy = sy / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const c of gun) for (const j of c.px) {
    const dx = (j % w) - cx, dy = Math.floor(j / w) - cy;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { cx, cy, axisDeg: (-theta * 180) / Math.PI, count: n };
}

const D = Math.PI / 180;
function worldRotOf(bone: { appliedPose: { a: number; c: number } }): number {
  return Math.atan2(bone.appliedPose.c, bone.appliedPose.a) / D;
}

/**
 * Build arm-pose seeds that put the gun's art centre on `tealPx` (image px).
 * Returns pose variants (full copies of `pose` with the three arm deltas set).
 */
export function gunSeeds(skeleton: Skeleton, pose: PoseVec, tealPx: { cx: number; cy: number; axisDeg: number }): PoseVec[] {
  const base: PoseVec = { ...pose };
  delete base['rear-upper-arm.rot']; delete base['rear-bracer.rot']; delete base['gun.rot'];
  applyPose(skeleton, base);
  const upper = skeleton.findBone('rear-upper-arm')!;
  const bracer = skeleton.findBone('rear-bracer')!;
  const gun = skeleton.findBone('gun')!;
  const torsoWorld = worldRotOf(skeleton.findBone('torso')!);
  const S: [number, number] = [upper.appliedPose.worldX, upper.appliedPose.worldY];
  const E: [number, number] = [bracer.appliedPose.worldX, bracer.appliedPose.worldY];
  const GP: [number, number] = [gun.appliedPose.worldX, gun.appliedPose.worldY];
  const L1 = Math.hypot(E[0] - S[0], E[1] - S[1]);
  const L2 = Math.hypot(GP[0] - E[0], GP[1] - E[1]);

  // gun attachment centre in world at the base pose, from the posed quad corners
  const slot = skeleton.findSlot('gun')!;
  const att = slot.appliedPose.attachment as { computeWorldVertices?: unknown } | null;
  if (!att) return [];
  const world = new Array<number>(8).fill(0);
  (att as { computeWorldVertices: (s: unknown, o: unknown, w: number[], off: number, stride: number) => void; getOffsets: (p: unknown) => unknown })
    .computeWorldVertices(slot, (att as { getOffsets: (p: unknown) => unknown }).getOffsets(slot.appliedPose), world, 0, 2);
  const centreW: [number, number] = [(world[0] + world[2] + world[4] + world[6]) / 4, (world[1] + world[3] + world[5] + world[7]) / 4];
  const gunBoneWorld = worldRotOf(gun);
  // centre offset in gun-bone frame
  const dx = centreW[0] - GP[0], dy = centreW[1] - GP[1];
  const cofX = dx * Math.cos(-gunBoneWorld * D) - dy * Math.sin(-gunBoneWorld * D);
  const cofY = dx * Math.sin(-gunBoneWorld * D) + dy * Math.cos(-gunBoneWorld * D);
  const cofLen = Math.hypot(cofX, cofY);
  const cofAng = Math.atan2(cofY, cofX) / D;

  // barrel axis at base pose (world): art major axis direction relative to gun bone
  // measured constant: axis relative to gun bone from the setup geometry
  const T = toWorld(tealPx.cx, tealPx.cy);

  const seeds: PoseVec[] = [];
  const setupUpperLocal = upper.data.setupPose.rotation;
  const setupBracerLocal = bracer.data.setupPose.rotation;
  const setupGunLocal = gun.data.setupPose.rotation;
  const baseGunWorld = gunBoneWorld;

  for (const flip of [0, 180]) {
    for (const jit of [-20, 0, 20]) {
      // desired gun ART axis (world) — convert to gun BONE world rotation via the constant
      // (axis relative to bone) = (baseArtAxis - baseBoneWorld); use PCA axis mod 180
      const artAxisAtBase = tealAxisAtBase(); // computed below once
      const gunBoneTarget = tealPx.axisDeg + flip + jit - (artAxisAtBase - baseGunWorld);
      // gun origin target
      const gpT: [number, number] = [
        T[0] - cofLen * Math.cos((gunBoneTarget + cofAng) * D),
        T[1] - cofLen * Math.sin((gunBoneTarget + cofAng) * D),
      ];
      const dd = Math.hypot(gpT[0] - S[0], gpT[1] - S[1]);
      const d = Math.min(Math.max(dd, Math.abs(L1 - L2) + 1), L1 + L2 - 1);
      const cosA = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
      const A = Math.acos(Math.min(1, Math.max(-1, cosA))) / D;
      const phi = Math.atan2(gpT[1] - S[1], gpT[0] - S[0]) / D;
      for (const sgn of [1, -1]) {
        const th1 = phi + sgn * A;
        const Ex = S[0] + L1 * Math.cos(th1 * D), Ey = S[1] + L1 * Math.sin(th1 * D);
        const th2 = Math.atan2(gpT[1] - Ey, gpT[0] - Ex) / D;
        const upDelta = norm(th1 - torsoWorld - setupUpperLocal);
        const brDelta = norm(th2 - th1 - setupBracerLocal);
        const gunDelta = norm(gunBoneTarget - th2 - setupGunLocal);
        seeds.push({ ...pose, 'rear-upper-arm.rot': upDelta, 'rear-bracer.rot': brDelta, 'gun.rot': gunDelta });
      }
    }
  }
  return seeds;

  function tealAxisAtBase(): number {
    // barrel axis in world at the base pose = angle of (muzzle - pivot) direction;
    // approximate with the art's long diagonal: constant relative to bone, so read it
    // from the attachment's world quad: long edge direction
    const ex = world[2] - world[0], ey = world[3] - world[1]; // br->bl edge
    const fx = world[4] - world[2], fy = world[5] - world[3]; // bl->ul edge
    const e = Math.hypot(ex, ey) > Math.hypot(fx, fy) ? [ex, ey] : [fx, fy];
    let a = Math.atan2(e[1], e[0]) / D;
    // normalise to mod 180 like the PCA axis
    while (a <= -90) a += 180;
    while (a > 90) a -= 180;
    return a;
  }
}

function norm(a: number): number {
  while (a > 180) a -= 360;
  while (a <= -180) a += 360;
  return a;
}
