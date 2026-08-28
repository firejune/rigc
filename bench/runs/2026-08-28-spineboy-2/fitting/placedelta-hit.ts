/**
 * Attempt-5 diagnostic: where does the CANDIDATE put torso/head art vs where the
 * template match puts each, per frame. Frames + art + candidate only.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RegionAttachment } from '@esotericsoftware/spine-core';
import { refFrames, RUN, sidecar } from './lib.ts';
import { loadCandidate, applyPose, type PoseVec } from './pose.ts';
import { matchPart } from './match.ts';

const vw = sidecar().viewport;
const D = Math.PI / 180;
const { skeleton } = loadCandidate();

const TARGETS: [string, number][] = [['hit',0],['hit',1],['hit',3],['hit',4]];

function attFramePose(slotName: string, attName: string, pose: PoseVec): { cx: number; cy: number; artPhi: number } {
  applyPose(skeleton, pose);
  const slot = skeleton.findSlot(slotName)!;
  const att = skeleton.getAttachment(slot.data.index, attName) as RegionAttachment;
  const wv = new Array<number>(8).fill(0);
  att.computeWorldVertices(slot, att.getOffsets(slot.appliedPose), wv, 0, 2);
  const cxw = (wv[0] + wv[2] + wv[4] + wv[6]) / 4;
  const cyw = (wv[1] + wv[3] + wv[5] + wv[7]) / 4;
  const edge = Math.atan2(wv[3] - wv[1], wv[2] - wv[0]) / D;
  return {
    cx: (cxw - vw.x) * vw.scale,
    cy: vw.pixelHeight - (cyw - vw.y) * vw.scale,
    artPhi: edge - 90, // measured edge-vs-artrot offset is +90 for both parts
  };
}
function norm(a: number): number { while (a > 180) a -= 360; while (a <= -180) a += 360; return a; }

const cache = new Map<string, ReturnType<typeof refFrames>>();
for (const [anim, fi] of TARGETS) {
  if (!cache.has(anim)) cache.set(anim, refFrames(anim));
  const ref = cache.get(anim)![fi];
  const store = JSON.parse(readFileSync(join(RUN, `fitting/poses/${anim}.json`), 'utf8'));
  const pose: PoseVec = store.frames[fi].pose;
  const parts: [string, string][] = [['torso', 'torso'], ['head', 'head']];
  const line: string[] = [`${anim} f${fi}:`];
  for (const [slot, att] of parts) {
    const e = attFramePose(slot, att, pose);
    const phis: number[] = [];
    for (let d = -20; d <= 20; d += 2) phis.push(norm(e.artPhi + d));
    const m = matchPart(att, ref, { x0: e.cx - 18, y0: e.cy - 18, x1: e.cx + 18, y1: e.cy + 18 }, phis);
    line.push(`${slot} cand(${e.cx.toFixed(1)},${e.cy.toFixed(1)})@${e.artPhi.toFixed(1)} match(${m.x},${m.y})@${m.phi.toFixed(1)} res${m.score.toFixed(0)} d=(${(m.x - e.cx).toFixed(1)},${(m.y - e.cy).toFixed(1)}) |d|=${Math.hypot(m.x - e.cx, m.y - e.cy).toFixed(1)}px dphi=${norm(m.phi - e.artPhi).toFixed(1)}`);
  }
  console.log(line.join('\n   '));
}
