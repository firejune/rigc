/**
 * Wave refit with a wave-window objective: the moving region (x 20-140) is a small
 * share of the lying body's ink, so the whole-figure objective under-weights the
 * arm. Score only the window the brief's difference boxes live in.
 * Also: feet-settle re-fit f13-f17 in a boots window (x 100-190).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { refFrames, RUN } from './lib.ts';
import { loadCandidate, type PoseVec } from './pose.ts';
import { evalPose, refCrop, refine, scan, localTriple, localPair, type EvalCtx, type KnobDef, type Window } from './fitcore.ts';
import { chainSeeds, toWorld, FRONT_ARM } from './armseed.ts';
import { makeTemplate, type Template } from './match.ts';
import { art } from './lib.ts';

const { posable, skeleton } = loadCandidate();
const frames = refFrames('death');
const poseFile = join(RUN, 'fitting/poses/death.json');
const store = JSON.parse(readFileSync(poseFile, 'utf8'));

const R = (key: string, lo: number, hi: number, coarse: number): KnobDef => ({ key, lo, hi, coarse });
const WAVE: KnobDef[] = [
  R('front-upper-arm.rot', -170, 170, 8),
  R('front-bracer.rot', -170, 170, 8),
  R('front-fist.rot', -110, 110, 8),
];
const HEADK: KnobDef[] = [R('head.rot', -60, 60, 5), R('neck.rot', -40, 40, 5), R('torso.rot', -150, 150, 5)];
const FEET: KnobDef[] = [
  R('front-shin.rot', -150, 150, 4),
  R('rear-shin.rot', -150, 150, 4),
  R('front-foot.rot', -90, 90, 3),
  R('rear-foot.rot', -90, 90, 3),
];

function ctxWin(i: number, win: Window): EvalCtx {
  const crops = new Map([[3, refCrop(frames[i], win, 3)], [1, refCrop(frames[i], win, 1)]]);
  return { posable, skeleton, win, crops, attachments: store.attachments };
}

/** weight map: pixels that change in ref (i-1->i) or (i->i+1), dilated, weighted W */
function changeWeights(i: number, win: Window, k: number, W = 20): Float32Array {
  const w = Math.max(1, Math.round((win.px1 + 1 - win.px0) / k));
  const h = Math.max(1, Math.round((win.py1 + 1 - win.py0) / k));
  const out = new Float32Array(w * h).fill(1);
  const mark = (a: typeof frames[number], b: typeof frames[number]) => {
    for (let py = win.py0; py <= win.py1; py++) {
      for (let px = win.px0; px <= win.px1; px++) {
        const idx = (py * a.width + px) * 4;
        if (
          Math.abs(a.data[idx] - b.data[idx]) > 8 ||
          Math.abs(a.data[idx + 1] - b.data[idx + 1]) > 8 ||
          Math.abs(a.data[idx + 2] - b.data[idx + 2]) > 8
        ) {
          const bx = Math.min(w - 1, Math.floor((px - win.px0) / k));
          const by = Math.min(h - 1, Math.floor((py - win.py0) / k));
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = bx + dx, ny = by + dy;
            if (nx >= 0 && ny >= 0 && nx < w && ny < h) out[ny * w + nx] = W;
          }
        }
      }
    }
  };
  if (i > 0) mark(frames[i - 1], frames[i]);
  if (i < frames.length - 1) mark(frames[i], frames[i + 1]);
  return out;
}

const waveWin: Window = { px0: 18, py0: 225, px1: 190, py1: 331 };
const bootWin: Window = { px0: 100, py0: 270, px1: 190, py1: 345 };

// ---- feet settle f13-f17: refit in the boots window, seeded from neighbours ----
for (let i = 13; i <= 17; i++) {
  const ctx = ctxWin(i, bootWin);
  const pose: PoseVec = { ...store.frames[i].pose };
  const e0 = evalPose(ctx, pose, 1);
  localPair(ctx, pose, FEET[0], FEET[2], 1, 6, 1.5);
  localPair(ctx, pose, FEET[1], FEET[3], 1, 6, 1.5);
  const e = refine(ctx, pose, FEET, 1, [2, 0.8, 0.3, 0.1]);
  store.frames[i].pose = pose;
  console.log(`feet f${i}: ${e0.toFixed(4)} -> ${e.toFixed(4)}`);
}
// re-pin the hold to the new f17
for (let i = 18; i <= 26; i++) store.frames[i] = { pose: { ...store.frames[17].pose }, err: store.frames[i].err };

// ---- fist matcher (multi-peak) ----
const fistArt = art('front-fist-open');
const tcache = new Map<number, Template>();
function fistPeaks(ref: ReturnType<typeof refFrames>[number]): { x: number; y: number; phi: number; s: number }[] {
  const all: { x: number; y: number; phi: number; s: number }[] = [];
  for (let phi = -180; phi < 180; phi += 15) {
    let t = tcache.get(phi);
    if (!t) { t = makeTemplate(fistArt, phi); tcache.set(phi, t); }
    for (let cy = 235; cy <= 330; cy += 2) for (let cx = 25; cx <= 135; cx += 2) {
      let sum = 0, n = 0;
      for (let py = 0; py < t.h; py += 2) {
        const fy = Math.round(cy - t.cy) + py;
        if (fy < 0 || fy >= ref.height) continue;
        for (let px = 0; px < t.w; px += 2) {
          const o = py * t.w + px;
          if (!t.solid[o]) continue;
          const fx = Math.round(cx - t.cx) + px;
          if (fx < 0 || fx >= ref.width) continue;
          const fi = (fy * ref.width + fx) * 4;
          const dr = t.rgb[o * 3] - ref.data[fi], dg = t.rgb[o * 3 + 1] - ref.data[fi + 1], db = t.rgb[o * 3 + 2] - ref.data[fi + 2];
          sum += dr * dr + dg * dg + db * db; n++;
        }
      }
      if (n < 12) continue;
      all.push({ x: cx, y: cy, phi, s: sum / n / 3 });
    }
  }
  all.sort((a, b) => a.s - b.s);
  const picks: typeof all = [];
  for (const m of all) {
    if (picks.length >= 5) break;
    if (picks.every((p) => Math.hypot(p.x - m.x, p.y - m.y) >= 12)) picks.push(m);
  }
  return picks;
}

// ---- wave f27-f59 (+ the 30fps end still handled by deathend afterwards) ----
for (let i = Number(process.env.WAVE_FROM ?? 27); i <= 59; i++) {
  const ctx = ctxWin(i, waveWin);
  ctx.weights = new Map([[1, changeWeights(i, waveWin, 1)], [3, changeWeights(i, waveWin, 3)]]);
  ctx.outPenalty = 3e-4; // a waving hand may not sink below the ground line
  const prev = i === 27 ? store.frames[17].pose : store.frames[i - 1].pose;
  const frozen: PoseVec = { ...store.frames[17].pose };
  const pose: PoseVec = { ...frozen };
  for (const k of [...WAVE, ...HEADK]) if (prev[k.key] !== undefined) pose[k.key] = prev[k.key];
  let best = evalPose(ctx, pose, 1);
  // seeds from all fist peaks x elbow solutions
  for (const fm of fistPeaks(frames[i])) {
    for (const s of chainSeeds(skeleton, pose, FRONT_ARM, toWorld(fm.x, fm.y), [fm.phi - 12, fm.phi, fm.phi + 12])) {
      const e = evalPose(ctx, s, 1);
      if (e < best) { best = e; Object.assign(pose, s); }
    }
  }
  for (const k of WAVE) scan(ctx, pose, k, 3);
  localTriple(ctx, pose, WAVE[0], WAVE[1], WAVE[2], 1, 10, 3.3);
  localPair(ctx, pose, HEADK[0], HEADK[1], 1, 8, 2);
  const e = refine(ctx, pose, [...WAVE, ...HEADK], 1, [3, 1, 0.4, 0.15, 0.06]);
  store.frames[i] = { pose, err: e };
  console.log(`wave f${i}: ${e.toFixed(4)}`);
}

writeFileSync(poseFile, JSON.stringify(store, null, 1));
console.log('saved');
