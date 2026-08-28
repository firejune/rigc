/**
 * Attempt-5 triangulation: the shoulder/chest joint, measured through the lying
 * poses. Template-matches torso.png and head.png per frame (72-rotation matcher,
 * refined ±4° at 1°), then solves the point fixed in BOTH art frames:
 *   c_t^f + R(phi_t^f)·p = c_h^f + R(phi_h^f)·q   for all frames f
 * (p in torso-art coords, q in head-art coords, y-up about each art centre).
 * Prints the current rig's own (p,q) for comparison. Reads frames + art + the
 * candidate skeleton only.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RegionAttachment } from '@esotericsoftware/spine-core';
import { refFrames, RUN, inkBox, sidecar } from './lib.ts';
import { loadCandidate, applyPose, type PoseVec } from './pose.ts';
import { matchPart, type Match } from './match.ts';

const vw = sidecar().viewport;
const D = Math.PI / 180;

// frames with a wide spread of head-vs-torso relative angle (lying poses included)
const TARGETS: [string, number][] = [
  ['idle', 0], ['idle', 10], ['walk', 3], ['walk', 6], ['aim', 0], ['shoot', 3],
  ['jump', 5], ['jump', 9],
  ['hit', 0], ['hit', 1], ['hit', 3], ['hit', 4],
  ['death', 5], ['death', 10], ['death', 12], ['death', 17], ['death', 30], ['death', 45],
];

const { skeleton } = loadCandidate();

/** world quad -> art-frame pose (centre px in frame coords + art world rotation) of a region attachment under a pose */
function attFramePose(slotName: string, attName: string | null, pose: PoseVec): { cx: number; cy: number; phi: number } {
  applyPose(skeleton, pose);
  const slot = skeleton.findSlot(slotName)!;
  const att = (attName
    ? skeleton.getAttachment(slot.data.index, attName)
    : slot.appliedPose.attachment) as RegionAttachment;
  const wv = new Array<number>(8).fill(0);
  att.computeWorldVertices(slot, att.getOffsets(slot.appliedPose), wv, 0, 2);
  // vertex order per spine-core: offsets[BLX..] — derive centre + rotation from two corners
  const cxw = (wv[0] + wv[2] + wv[4] + wv[6]) / 4;
  const cyw = (wv[1] + wv[3] + wv[5] + wv[7]) / 4;
  // wv[0..1] and wv[2..3] are adjacent corners along one art edge
  const edge = Math.atan2(wv[3] - wv[1], wv[2] - wv[0]) / D;
  return {
    cx: (cxw - vw.x) * vw.scale,
    cy: vw.pixelHeight - (cyw - vw.y) * vw.scale,
    phi: edge, // calibrated against a known-rotation render below
  };
}

/** frame px of a world point */
const toPx = (wx: number, wy: number): [number, number] => [(wx - vw.x) * vw.scale, vw.pixelHeight - (wy - vw.y) * vw.scale];

// ---- current rig's own p (neck joint in torso-art coords) and q (in head-art coords) ----
function currentJointInArtCoords(): { p: [number, number]; q: [number, number] } {
  applyPose(skeleton, {});
  const neck = skeleton.findBone('neck')!;
  const jw: [number, number] = [neck.appliedPose.worldX, neck.appliedPose.worldY];
  const out: [number, number][] = [];
  for (const [slotName, attName] of [['torso', 'torso'], ['head', 'head']] as const) {
    const slot = skeleton.findSlot(slotName)!;
    const att = skeleton.getAttachment(slot.data.index, attName) as RegionAttachment;
    const wv = new Array<number>(8).fill(0);
    att.computeWorldVertices(slot, att.getOffsets(slot.appliedPose), wv, 0, 2);
    const c: [number, number] = [(wv[0] + wv[2] + wv[4] + wv[6]) / 4, (wv[1] + wv[3] + wv[5] + wv[7]) / 4];
    const edge = Math.atan2(wv[3] - wv[1], wv[2] - wv[0]); // radians, art x-axis direction + pi? calibrated below
    // art frame: x along (edge), y = 90° CCW from it (world y-up)
    const dx = jw[0] - c[0], dy = jw[1] - c[1];
    const ax = Math.cos(edge) * dx + Math.sin(edge) * dy;
    const ay = -Math.sin(edge) * dx + Math.cos(edge) * dy;
    out.push([ax, ay]);
  }
  return { p: out[0], q: out[1] };
}

// Calibrate the quad-edge convention against the attachment's known rotation:
// render setup, compare edge angle with the attachment's world rotation.
function edgeOffset(slotName: string, attName: string): number {
  applyPose(skeleton, {});
  const slot = skeleton.findSlot(slotName)!;
  const att = skeleton.getAttachment(slot.data.index, attName) as RegionAttachment;
  const wv = new Array<number>(8).fill(0);
  att.computeWorldVertices(slot, att.getOffsets(slot.appliedPose), wv, 0, 2);
  const edge = Math.atan2(wv[3] - wv[1], wv[2] - wv[0]) / D;
  // world rotation of the attachment = bone world rot + att.rotation
  const bone = slot.bone;
  const boneWorld = Math.atan2(bone.appliedPose.c, bone.appliedPose.a) / D;
  const attWorld = boneWorld + att.rotation;
  return norm(edge - attWorld);
}
function norm(a: number): number { while (a > 180) a -= 360; while (a <= -180) a += 360; return a; }

const offT = edgeOffset('torso', 'torso');
const offH = edgeOffset('head', 'head');
console.log('edge-vs-artrot offsets: torso', offT.toFixed(1), 'head', offH.toFixed(1));

// ---- per-frame matches ----
interface Row { anim: string; fi: number; t: Match; h: Match }
const rows: Row[] = [];
const frameCache = new Map<string, ReturnType<typeof refFrames>>();

for (const [anim, fi] of TARGETS) {
  if (!frameCache.has(anim)) frameCache.set(anim, refFrames(anim));
  const ref = frameCache.get(anim)![fi];
  const store = JSON.parse(readFileSync(join(RUN, `fitting/poses/${anim}.json`), 'utf8'));
  const pose: PoseVec = store.frames[fi].pose;

  // expected art poses under the current fit (search window seeds)
  const et = attFramePose('torso', 'torso', pose);
  const eh = attFramePose('head', 'head', pose);
  const phisAround = (phi: number) => {
    const out: number[] = [];
    for (let d = -30; d <= 30; d += 2.5) out.push(norm(phi + d));
    return out;
  };
  const t = matchPart('torso', ref, { x0: et.cx - 22, y0: et.cy - 22, x1: et.cx + 22, y1: et.cy + 22 }, phisAround(norm(et.phi - offT)));
  const h = matchPart('head', ref, { x0: eh.cx - 22, y0: eh.cy - 22, x1: eh.cx + 22, y1: eh.cy + 22 }, phisAround(norm(eh.phi - offH)));
  rows.push({ anim, fi, t, h });
  console.log(
    `${anim} f${fi}: torso (${t.x},${t.y}) phi ${t.phi.toFixed(1)} res ${t.score.toFixed(0)} vis ${(t.vis * 100).toFixed(0)}%  |  ` +
    `head (${h.x},${h.y}) phi ${h.phi.toFixed(1)} res ${h.score.toFixed(0)} vis ${(h.vis * 100).toFixed(0)}%  |  rel ${(norm(h.phi - t.phi)).toFixed(1)}`,
  );
}

// ---- triangulate: solve p (torso-art) and q (head-art), frame-px y-DOWN math ----
// c_t + R(-phi_t)*S? Careful: art coords y-up, frame px y-down. Work in a y-up frame:
// X = px, Y = -py. Rotation phi (CCW world) then acts standardly.
function solve(rowsIn: Row[]): { p: [number, number]; q: [number, number]; res: number[] } {
  // unknown z = [px, py, qx, qy]; equations: R(phi_t) p - R(phi_h) q = c_h - c_t  (y-up)
  const A: number[][] = [];
  const b: number[] = [];
  for (const r of rowsIn) {
    const ct = [r.t.x, -r.t.y], ch = [r.h.x, -r.h.y];
    const st = Math.sin(r.t.phi * D), ctt = Math.cos(r.t.phi * D);
    const sh = Math.sin(r.h.phi * D), chh = Math.cos(r.h.phi * D);
    // scale art->frame px
    const s = vw.scale;
    A.push([s * ctt, -s * st, -s * chh, s * sh]); b.push(ch[0] - ct[0]);
    A.push([s * st, s * ctt, -s * sh, -s * chh]); b.push(ch[1] - ct[1]);
  }
  // normal equations
  const n = 4;
  const M = Array.from({ length: n }, () => new Array(n).fill(0));
  const v = new Array(n).fill(0);
  for (let r = 0; r < A.length; r++) {
    for (let i = 0; i < n; i++) {
      v[i] += A[r][i] * b[r];
      for (let j = 0; j < n; j++) M[i][j] += A[r][i] * A[r][j];
    }
  }
  // gaussian elim
  for (let i = 0; i < n; i++) {
    let piv = i;
    for (let r2 = i + 1; r2 < n; r2++) if (Math.abs(M[r2][i]) > Math.abs(M[piv][i])) piv = r2;
    [M[i], M[piv]] = [M[piv], M[i]]; [v[i], v[piv]] = [v[piv], v[i]];
    for (let r2 = i + 1; r2 < n; r2++) {
      const f = M[r2][i] / M[i][i];
      for (let j2 = i; j2 < n; j2++) M[r2][j2] -= f * M[i][j2];
      v[r2] -= f * v[i];
    }
  }
  const z = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s2 = v[i];
    for (let j2 = i + 1; j2 < n; j2++) s2 -= M[i][j2] * z[j2];
    z[i] = s2 / M[i][i];
  }
  const res: number[] = [];
  for (const r of rowsIn) {
    const s = vw.scale;
    const jt = [r.t.x + s * (z[0] * Math.cos(r.t.phi * D) - z[1] * Math.sin(r.t.phi * D)),
                -(-r.t.y + s * (z[0] * Math.sin(r.t.phi * D) + z[1] * Math.cos(r.t.phi * D)))];
    const jh = [r.h.x + s * (z[2] * Math.cos(r.h.phi * D) - z[3] * Math.sin(r.h.phi * D)),
                -(-r.h.y + s * (z[2] * Math.sin(r.h.phi * D) + z[3] * Math.cos(r.h.phi * D)))];
    res.push(Math.hypot(jt[0] - jh[0], jt[1] - jh[1]));
  }
  return { p: [z[0], z[1]], q: [z[2], z[3]], res };
}

const good = rows.filter((r) => r.t.score < 4200 && r.h.score < 4200);
console.log(`\nusing ${good.length}/${rows.length} rows (residual filter)`);
const sol = solve(good);
console.log('measured p (torso-art units):', sol.p.map((x) => x.toFixed(1)).join(', '));
console.log('measured q (head-art units): ', sol.q.map((x) => x.toFixed(1)).join(', '));
console.log('per-frame joint residuals (px):', sol.res.map((x) => x.toFixed(1)).join(' '));
const cur = currentJointInArtCoords();
console.log('current  p:', cur.p.map((x) => x.toFixed(1)).join(', '), '  q:', cur.q.map((x) => x.toFixed(1)).join(', '));
console.log('delta p (art units):', (sol.p[0] - cur.p[0]).toFixed(1), (sol.p[1] - cur.p[1]).toFixed(1));
console.log('delta q (art units):', (sol.q[0] - cur.q[0]).toFixed(1), (sol.q[1] - cur.q[1]).toFixed(1));

// upright-only vs with-lying comparison (what re-triangulating through the lying poses changes)
const upright = good.filter((r) => ['idle', 'walk', 'aim', 'shoot', 'jump'].includes(r.anim));
if (upright.length >= 3) {
  const solU = solve(upright);
  console.log('\nupright-only p:', solU.p.map((x) => x.toFixed(1)).join(', '), ' q:', solU.q.map((x) => x.toFixed(1)).join(', '));
  console.log('upright-only residuals:', solU.res.map((x) => x.toFixed(1)).join(' '));
}
