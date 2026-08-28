/**
 * Candidate posing + rendering for the fitter.
 * Drives bone.pose (spine-core 4.3 — never bone.rotation) and renders through
 * the repository's own rasteriser into the frames' declared viewport.
 */
import { Physics, Skeleton } from '@esotericsoftware/spine-core';
import { join } from 'node:path';
import { Plate } from '../../../../tools/plate.ts';
import {
  loadPosable, piecesOf, renderFrame, type Posable, type Viewport,
} from '../../../../src/render.ts';
import { RUN, sidecar, BG, TOL } from './lib.ts';

export const SPINE_DIR = join(RUN, 'ess/spine');

export function loadCandidate(): { posable: Posable; skeleton: Skeleton } {
  const posable = loadPosable(join(SPINE_DIR, 'skeleton.json'), join(SPINE_DIR, 'skeleton.atlas'), SPINE_DIR);
  const skeleton = new Skeleton(posable.data);
  skeleton.setupPose();
  return { posable, skeleton };
}

const sc = sidecar();
export function viewportAt(k = 1): Viewport {
  const v = sc.viewport;
  return {
    minX: v.x, minY: v.y, maxX: v.x + v.width, maxY: v.y + v.height,
    scale: v.scale / k,
    width: Math.ceil(v.pixelWidth / k), height: Math.ceil(v.pixelHeight / k),
  };
}

/** Pose vector: named bone-local channels. */
export type PoseVec = Record<string, number>; // e.g. "hip.x", "hip.y", "hip.rot", "torso.rot"

/** Apply a pose vector on top of the setup pose. Channels are DELTAS from setup. */
export function applyPose(skeleton: Skeleton, pose: PoseVec): void {
  skeleton.setupPose();
  for (const [key, val] of Object.entries(pose)) {
    const dot = key.lastIndexOf('.');
    const name = key.slice(0, dot), ch = key.slice(dot + 1);
    const bone = skeleton.findBone(name);
    if (!bone) throw new Error(`no bone ${name}`);
    const setup = bone.data.setupPose;
    if (ch === 'rot') bone.pose.rotation = setup.rotation + val;
    else if (ch === 'x') bone.pose.x = setup.x + val;
    else if (ch === 'y') bone.pose.y = setup.y + val;
    else if (ch === 'sx') bone.pose.scaleX = setup.scaleX * val;
    else if (ch === 'sy') bone.pose.scaleY = setup.scaleY * val;
    else throw new Error(`bad channel ${ch}`);
  }
  skeleton.update(0);
  skeleton.updateWorldTransform(Physics.reset);
}

/** Set a slot's attachment by name (or null). */
export function setAttachment(skeleton: Skeleton, slot: string, name: string | null): void {
  const s = skeleton.findSlot(slot);
  if (!s) throw new Error(`no slot ${slot}`);
  s.appliedPose.attachment = name ? skeleton.getAttachment(s.data.index, name) : null;
}

export function renderPose(
  posable: Posable, skeleton: Skeleton, pose: PoseVec, k = 1,
  attachments?: Record<string, string | null>,
): Plate {
  applyPose(skeleton, pose);
  if (attachments) for (const [slot, a] of Object.entries(attachments)) setAttachment(skeleton, slot, a);
  if (attachments) { skeleton.update(0); skeleton.updateWorldTransform(Physics.reset); }
  const frame = { index: 0, time: 0, pieces: piecesOf(skeleton) };
  return renderFrame(frame, posable.pages, viewportAt(k), [BG[0], BG[1], BG[2], 255]);
}

/** SSD over union-of-ink pixels, normalised by reference ink count. Both directions charged. */
export function objective(cand: Plate, ref: Plate, tol = TOL): { err: number; candInk: number; refInk: number } {
  const n = ref.width * ref.height;
  let sum = 0, refInk = 0, candInk = 0;
  const cd = cand.data, rd = ref.data;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const rInk = Math.abs(rd[o] - BG[0]) > tol || Math.abs(rd[o + 1] - BG[1]) > tol || Math.abs(rd[o + 2] - BG[2]) > tol;
    const cInk = Math.abs(cd[o] - BG[0]) > tol || Math.abs(cd[o + 1] - BG[1]) > tol || Math.abs(cd[o + 2] - BG[2]) > tol;
    if (rInk) refInk++;
    if (cInk) candInk++;
    if (rInk || cInk) {
      const dr = cd[o] - rd[o], dg = cd[o + 1] - rd[o + 1], db = cd[o + 2] - rd[o + 2];
      sum += dr * dr + dg * dg + db * db;
    }
  }
  // normalise so that "draw nothing" ~ reference ink charged once at full contrast
  return { err: sum / (255 * 255) / Math.max(refInk, 1), candInk, refInk };
}
