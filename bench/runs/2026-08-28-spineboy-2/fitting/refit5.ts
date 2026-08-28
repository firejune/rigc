/**
 * Attempt-5 refit: after surgery5's one geometric edit (the chest joint), refit
 * ONLY the channels the edit invalidates — torso.x/y/rot, neck.rot, head.rot,
 * and the arm chains that hang off the chest. hip.* and both legs stay frozen,
 * so every leg figure (run's 5.5 px rear-shin margin included) is untouched by
 * construction. Refits the 12fps pose stores in place, the *-extra tile poses
 * in place, and re-evaluates errs under the new skeleton.
 * Usage: bun refit5.ts [anim ...]   (default: all 8)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Physics } from '@esotericsoftware/spine-core';
import { readPlate, Plate } from '../../../../tools/plate.ts';
import { refFrames, RUN, REF, BG, TOL, inkBox, sidecar } from './lib.ts';
import { loadCandidate, applyPose, setAttachment, type PoseVec } from './pose.ts';
import { evalPose, refCrop, refine, localPair, localTriple, scan, type EvalCtx, type KnobDef, type Window } from './fitcore.ts';
import { piecesOf, renderFrame, type Viewport } from '../../../../src/render.ts';

const anims = process.argv.length > 2 ? process.argv.slice(2) : ['hit', 'death', 'jump', 'shoot', 'aim', 'idle', 'walk', 'run'];
const { posable, skeleton } = loadCandidate();
const vw = sidecar().viewport;
const R = (key: string, lo: number, hi: number, coarse: number): KnobDef => ({ key, lo, hi, coarse });

function coupledKnobs(pose: PoseVec): KnobDef[] {
  const around = (key: string, span: number, lo: number, hi: number, coarse: number): KnobDef => {
    const c = pose[key] ?? 0;
    return R(key, Math.max(lo, c - span), Math.min(hi, c + span), coarse);
  };
  return [
    R('torso.x', -60, 60, 7), R('torso.y', -60, 60, 7),
    around('torso.rot', 25, -160, 160, 5),
    R('neck.rot', -45, 45, 6),
    around('head.rot', 40, -170, 170, 6),
    around('front-upper-arm.rot', 30, -210, 210, 6), around('front-bracer.rot', 30, -210, 210, 6), around('front-fist.rot', 30, -110, 110, 6),
    around('rear-upper-arm.rot', 30, -210, 210, 6), around('rear-bracer.rot', 30, -210, 210, 6), around('gun.rot', 30, -110, 110, 6),
  ];
}

for (const anim of anims) {
  const poseFile = join(RUN, `fitting/poses/${anim}.json`);
  const store = JSON.parse(readFileSync(poseFile, 'utf8')) as {
    frames: { pose: PoseVec; err: number | null }[]; attachments: Record<string, string | null>;
  };
  const frames = refFrames(anim);
  for (let i = 0; i < frames.length; i++) {
    const ref = frames[i];
    const pose: PoseVec = { ...store.frames[i].pose };
    const box = inkBox(ref)!;
    const M = 26;
    const win: Window = {
      px0: Math.max(0, box.minX - M), py0: Math.max(0, box.minY - M),
      px1: Math.min(ref.width - 1, box.maxX + M), py1: Math.min(ref.height - 1, box.maxY + M),
    };
    const crops = new Map([[3, refCrop(ref, win, 3)], [1, refCrop(ref, win, 1)]]);
    const ctx: EvalCtx = { posable, skeleton, win, crops, attachments: store.attachments };
    const before = evalPose(ctx, pose, 1); // stored pose under NEW geometry
    const knobs = coupledKnobs(pose);
    const K = Object.fromEntries(knobs.map((k) => [k.key, k]));
    localPair(ctx, pose, K['torso.x'], K['torso.y'], 3, 21, 7);
    scan(ctx, pose, K['torso.rot'], 3, 5);
    localPair(ctx, pose, K['neck.rot'], K['head.rot'], 3, 18, 6);
    localPair(ctx, pose, K['front-upper-arm.rot'], K['front-bracer.rot'], 3, 15, 5);
    localPair(ctx, pose, K['rear-upper-arm.rot'], K['rear-bracer.rot'], 3, 15, 5);
    localPair(ctx, pose, K['torso.x'], K['torso.y'], 1, 6, 1.5);
    refine(ctx, pose, knobs, 1, [4, 1.5, 0.5]);
    localTriple(ctx, pose, K['rear-upper-arm.rot'], K['rear-bracer.rot'], K['gun.rot'], 1, 6, 3);
    localTriple(ctx, pose, K['front-upper-arm.rot'], K['front-bracer.rot'], K['front-fist.rot'], 1, 6, 3);
    const after = refine(ctx, pose, knobs, 1, [1, 0.4]);
    store.frames[i] = { pose, err: +after.toFixed(4) };
    console.log(`${anim} f${i}: ${before.toFixed(4)} -> ${after.toFixed(4)}`);
  }
  writeFileSync(poseFile, JSON.stringify(store, null, 1));
  console.log('saved', poseFile);

  // ---- extras: refit in place against their own tiles ----
  const extraFile = join(RUN, `fitting/poses/${anim}-extra.json`);
  if (!existsSync(extraFile)) continue;
  const extras = JSON.parse(readFileSync(extraFile, 'utf8')) as { t: number; pose: PoseVec; err: number }[];
  const sheetPath = join(REF, `${anim}@30fps/contact.png`);
  const sheet = readPlate(sheetPath);
  const set = sidecar().sets.find((s) => s.dir === `${anim}@30fps`)!;
  const COLS = 8, GAP = 1;
  const tileW = Math.floor((sheet.width - GAP * (COLS + 1)) / COLS);
  const rows = Math.ceil(set.sampled / COLS);
  const tileH = Math.floor((sheet.height - GAP * (rows + 1)) / rows);
  const tileVp: Viewport = {
    minX: vw.x, minY: vw.y, maxX: vw.x + vw.width, maxY: vw.y + vw.height,
    scale: vw.scale * (tileW / vw.pixelWidth), width: tileW, height: tileH,
  };
  const label = { x0: 0, y0: 0, x1: 18, y1: 10 };
  const tilePlate = (k: number): Plate => {
    const col = k % COLS, row = Math.floor(k / COLS);
    const x0 = GAP + col * (tileW + GAP), y0 = GAP + row * (tileH + GAP);
    const p = new Plate(tileW, tileH);
    for (let y = 0; y < tileH; y++)
      for (let x = 0; x < tileW; x++) {
        const si = ((y0 + y) * sheet.width + x0 + x) * 4;
        p.data.set(sheet.data.subarray(si, si + 4), (y * tileW + x) * 4);
      }
    return p;
  };
  const tileErr = (pose: PoseVec, tile: Plate): number => {
    applyPose(skeleton, pose);
    for (const [slot, a] of Object.entries(store.attachments)) setAttachment(skeleton, slot, a);
    skeleton.update(0);
    skeleton.updateWorldTransform(Physics.reset);
    const cand = renderFrame({ index: 0, time: 0, pieces: piecesOf(skeleton) }, posable.pages, tileVp, [BG[0], BG[1], BG[2], 255]);
    let sum = 0, n = 0;
    for (let y = 0; y < tileH; y++) for (let x = 0; x < tileW; x++) {
      if (x >= label.x0 && x <= label.x1 && y >= label.y0 && y <= label.y1) continue;
      const i = (y * tileW + x) * 4;
      const rInk = Math.abs(tile.data[i] - BG[0]) > TOL || Math.abs(tile.data[i + 1] - BG[1]) > TOL || Math.abs(tile.data[i + 2] - BG[2]) > TOL;
      const cInk = Math.abs(cand.data[i] - BG[0]) > TOL || Math.abs(cand.data[i + 1] - BG[1]) > TOL || Math.abs(cand.data[i + 2] - BG[2]) > TOL;
      if (rInk || cInk) {
        const dr = cand.data[i] - tile.data[i], dg = cand.data[i + 1] - tile.data[i + 1], db = cand.data[i + 2] - tile.data[i + 2];
        sum += dr * dr + dg * dg + db * db; n++;
      }
    }
    return n ? sum / n / (255 * 255) : 1;
  };
  const COUPLED = ['torso.x', 'torso.y', 'torso.rot', 'neck.rot', 'head.rot',
    'front-upper-arm.rot', 'front-bracer.rot', 'front-fist.rot',
    'rear-upper-arm.rot', 'rear-bracer.rot', 'gun.rot'];
  for (const ex of extras) {
    const k = Math.round(ex.t * 30);
    const tile = tilePlate(k);
    let err = tileErr(ex.pose, tile);
    const before = err;
    for (const st of [4, 1.5]) {
      let improved = true, guard = 0;
      while (improved && guard++ < 4) {
        improved = false;
        for (const ch of COUPLED) {
          const cur = ex.pose[ch] ?? 0;
          for (const v of [cur - st, cur + st]) {
            const p2 = { ...ex.pose, [ch]: v };
            const e = tileErr(p2, tile);
            if (e < err - 1e-7) { err = e; ex.pose[ch] = v; improved = true; }
          }
        }
      }
    }
    ex.err = +err.toFixed(4);
    console.log(`${anim} extra t=${ex.t.toFixed(3)}: ${before.toFixed(4)} -> ${err.toFixed(4)}`);
  }
  writeFileSync(extraFile, JSON.stringify(extras, null, 1));
  console.log('saved', extraFile);
}
