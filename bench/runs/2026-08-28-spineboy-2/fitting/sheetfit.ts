/**
 * Fit in-between poses at 30fps instants against the contact-sheet tiles
 * (the only picture of the samples between committed frames — §9.3).
 * Usage: bun sheetfit.ts <anim> <tile,tile,...>
 * Writes fitting/poses/<anim>-extra.json  [{t, pose, err}]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPlate, Plate } from '../../../../tools/plate.ts';
import { REF, RUN, BG, TOL, sidecar } from './lib.ts';
import { loadCandidate, applyPose, setAttachment, type PoseVec } from './pose.ts';
import { refine, localPair, type KnobDef } from './fitcore.ts';
import { piecesOf, renderFrame, type Viewport } from '../../../../src/render.ts';
import { Physics } from '@esotericsoftware/spine-core';

const anim = process.argv[2];
const tiles = process.argv[3].split(',').map(Number);
const { posable, skeleton } = loadCandidate();
const store = JSON.parse(readFileSync(join(RUN, `fitting/poses/${anim}.json`), 'utf8'));
const vw = sidecar().viewport;

// sheet geometry: 8 columns, 1px rules, tile size from the sheet's own dimensions
const sheet = readPlate(join(REF, `${anim}@30fps/contact.png`));
const COLS = 8, GAP = 1;
const tileW = Math.floor((sheet.width - GAP * (COLS + 1)) / COLS);
const set = sidecar().sets.find((s) => s.dir === `${anim}@30fps`)!;
const rows = Math.ceil(set.sampled / COLS);
const tileH = Math.floor((sheet.height - GAP * (rows + 1)) / rows);
console.log(`sheet ${sheet.width}x${sheet.height}, tiles ${tileW}x${tileH}, ${set.sampled} samples`);

function tilePlate(k: number): Plate {
  const col = k % COLS, row = Math.floor(k / COLS);
  const x0 = GAP + col * (tileW + GAP), y0 = GAP + row * (tileH + GAP);
  const p = new Plate(tileW, tileH);
  for (let y = 0; y < tileH; y++)
    for (let x = 0; x < tileW; x++) {
      const si = ((y0 + y) * sheet.width + x0 + x) * 4;
      p.data.set(sheet.data.subarray(si, si + 4), (y * tileW + x) * 4);
    }
  return p;
}

// tile viewport: the full frame at tile scale
const tileVp: Viewport = {
  minX: vw.x, minY: vw.y, maxX: vw.x + vw.width, maxY: vw.y + vw.height,
  scale: vw.scale * (tileW / vw.pixelWidth),
  width: tileW, height: tileH,
};

function tileErr(pose: PoseVec, tile: Plate, label: { x0: number; y0: number; x1: number; y1: number }): number {
  applyPose(skeleton, pose);
  for (const [slot, a] of Object.entries(store.attachments as Record<string, string | null>)) setAttachment(skeleton, slot, a);
  skeleton.update(0);
  skeleton.updateWorldTransform(Physics.reset);
  const cand = renderFrame({ index: 0, time: 0, pieces: piecesOf(skeleton) }, posable.pages, tileVp, [BG[0], BG[1], BG[2], 255]);
  let sum = 0, n = 0;
  for (let y = 0; y < tileH; y++) for (let x = 0; x < tileW; x++) {
    if (x >= label.x0 && x <= label.x1 && y >= label.y0 && y <= label.y1) continue; // burnt-in label
    const i = (y * tileW + x) * 4;
    const rInk = Math.abs(tile.data[i] - BG[0]) > TOL || Math.abs(tile.data[i + 1] - BG[1]) > TOL || Math.abs(tile.data[i + 2] - BG[2]) > TOL;
    const cInk = Math.abs(cand.data[i] - BG[0]) > TOL || Math.abs(cand.data[i + 1] - BG[1]) > TOL || Math.abs(cand.data[i + 2] - BG[2]) > TOL;
    if (rInk || cInk) {
      const dr = cand.data[i] - tile.data[i], dg = cand.data[i + 1] - tile.data[i + 1], db = cand.data[i + 2] - tile.data[i + 2];
      sum += dr * dr + dg * dg + db * db;
      n++;
    }
  }
  return n ? sum / n / (255 * 255) : 1;
}

const R = (key: string, lo: number, hi: number, coarse: number): KnobDef => ({ key, lo, hi, coarse });
const KNOBS: KnobDef[] = [
  R('hip.x', -480, 80, 8), R('hip.y', -90, 790, 8), R('hip.rot', -120, 170, 6),
  R('torso.rot', -150, 150, 6), R('torso.x', -35, 35, 6), R('torso.y', -35, 35, 6),
  R('neck.rot', -40, 40, 6), R('head.rot', -150, 150, 6),
  R('front-upper-arm.rot', -170, 170, 8), R('front-bracer.rot', -170, 170, 8), R('front-fist.rot', -110, 110, 8),
  R('rear-upper-arm.rot', -170, 170, 8), R('rear-bracer.rot', -170, 170, 8), R('gun.rot', -110, 110, 8),
  R('front-thigh.rot', -150, 150, 8), R('front-shin.rot', -150, 150, 8), R('front-foot.rot', -90, 90, 8),
  R('rear-thigh.rot', -150, 150, 8), R('rear-shin.rot', -150, 150, 8), R('rear-foot.rot', -90, 90, 8),
];

// initial pose: linear interpolation of the two bracketing 12fps fitted poses
function interpPose(t: number): PoseVec {
  const f = t * 12;
  const a = Math.min(store.frames.length - 1, Math.floor(f));
  const b = Math.min(store.frames.length - 1, a + 1);
  const w = f - a;
  const keys = new Set([...Object.keys(store.frames[a].pose), ...Object.keys(store.frames[b].pose)]);
  const out: PoseVec = {};
  for (const k of keys) out[k] = (store.frames[a].pose[k] ?? 0) * (1 - w) + (store.frames[b].pose[k] ?? 0) * w;
  return out;
}

const extraFile = join(RUN, `fitting/poses/${anim}-extra.json`);
const extras: { t: number; pose: PoseVec; err: number }[] = existsSync(extraFile) ? JSON.parse(readFileSync(extraFile, 'utf8')) : [];

// label corner: render_reference burns the index at the tile's top-left
const label = { x0: 0, y0: 0, x1: 18, y1: 10 };
for (const k of tiles) {
  const tile = tilePlate(k);
  const t = k / 30;
  const pose = interpPose(t);
  const e0 = tileErr(pose, tile, label);
  const pairs: [string, string][] = [
    ['front-thigh.rot', 'front-shin.rot'], ['rear-thigh.rot', 'rear-shin.rot'],
    ['rear-upper-arm.rot', 'rear-bracer.rot'], ['front-upper-arm.rot', 'front-bracer.rot'],
    ['hip.rot', 'torso.rot'],
  ];
  const K = Object.fromEntries(KNOBS.map((kk) => [kk.key, kk]));
  // localized search around the interpolant (the true pose left the interval, but not far)
  let err = e0;
  const ctxRefine = (steps: number[]) => {
    // simple local coordinate descent on the tile objective
    for (const st of steps) {
      let improved = true, guard = 0;
      while (improved && guard++ < 4) {
        improved = false;
        for (const kb of KNOBS) {
          const cur = pose[kb.key] ?? 0;
          for (const v of [cur - st, cur + st]) {
            if (v < kb.lo || v > kb.hi) continue;
            const p2 = { ...pose, [kb.key]: v };
            const e = tileErr(p2, tile, label);
            if (e < err - 1e-7) { err = e; pose[kb.key] = v; improved = true; }
          }
        }
      }
    }
  };
  ctxRefine([6, 2.5, 1]);
  extras.push({ t, pose, err });
  console.log(`${anim} tile ${k} (t=${t.toFixed(3)}): ${e0.toFixed(4)} -> ${err.toFixed(4)}`);
}
extras.sort((a, b) => a.t - b.t);
writeFileSync(extraFile, JSON.stringify(extras, null, 1));
console.log('saved', extraFile);
