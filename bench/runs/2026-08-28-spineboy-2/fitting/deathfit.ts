/**
 * death's staged tail (after fitshot death --frames 0-13):
 *  f14-f17  feet settle — only legs/feet refine, seeded from the previous frame
 *  f18-f26  dead hold — f17's pose verbatim (the measure reads 0,0,0,0,0,1,0,0,0;
 *           the 1 px blip at f22->f23 is authored at emission, not fitted)
 *  f27-f59  the near-arm wave — front arm chain only, everything else frozen at f17
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { refFrames, RUN, inkBox } from './lib.ts';
import { loadCandidate, type PoseVec } from './pose.ts';
import { evalPose, refCrop, refine, scan, localTriple, type EvalCtx, type KnobDef, type Window } from './fitcore.ts';
import { chainSeeds, toWorld, FRONT_ARM } from './armseed.ts';
import { makeTemplate, type Template } from './match.ts';
import { art } from './lib.ts';

const { posable, skeleton } = loadCandidate();
const frames = refFrames('death');
const poseFile = join(RUN, 'fitting/poses/death.json');
const store = JSON.parse(readFileSync(poseFile, 'utf8'));

const R = (key: string, lo: number, hi: number, coarse: number): KnobDef => ({ key, lo, hi, coarse });
const FEET: KnobDef[] = [
  R('front-thigh.rot', -150, 150, 6),
  R('rear-thigh.rot', -150, 150, 6),
  R('front-shin.rot', -150, 150, 6),
  R('rear-shin.rot', -150, 150, 6),
  R('front-foot.rot', -90, 90, 6),
  R('rear-foot.rot', -90, 90, 6),
];
const WAVE: KnobDef[] = [
  R('front-upper-arm.rot', -170, 170, 10),
  R('front-bracer.rot', -170, 170, 10),
  R('front-fist.rot', -110, 110, 10),
];

function ctxFor(i: number): EvalCtx {
  const ref = frames[i];
  const box = inkBox(ref)!;
  const M = 26;
  const win: Window = {
    px0: Math.max(0, box.minX - M), py0: Math.max(0, box.minY - M),
    px1: Math.min(ref.width - 1, box.maxX + M), py1: Math.min(ref.height - 1, box.maxY + M),
  };
  const crops = new Map([[3, refCrop(ref, win, 3)], [1, refCrop(ref, win, 1)]]);
  return { posable, skeleton, win, crops, attachments: store.attachments };
}

// f14-f17: feet settle
for (let i = 14; i <= 17; i++) {
  const ctx = ctxFor(i);
  const pose: PoseVec = { ...store.frames[i - 1].pose };
  refine(ctx, pose, FEET, 1, [8, 3, 1, 0.4]);
  const e = evalPose(ctx, pose, 1);
  if (e < (store.frames[i].err ?? Infinity) || process.argv.includes('--force')) store.frames[i] = { pose, err: e };
  console.log(`death f${i}: ${store.frames[i].err.toFixed(4)}`);
}

// f18-f26: hold f17 verbatim
for (let i = 18; i <= 26; i++) {
  const pose = { ...store.frames[17].pose };
  const e = evalPose(ctxFor(i), pose, 1);
  store.frames[i] = { pose, err: e };
}
console.log('death f18-f26: held at f17 pose, errs',
  store.frames.slice(18, 27).map((f: { err: number }) => f.err.toFixed(3)).join(' '));

// fist template matcher (open fist is the visible end of the waving arm)
const fistArt = art('front-fist-open');
const fistTemplates = new Map<number, Template>();
function fistMatch(ref: ReturnType<typeof refFrames>[number], win: { x0: number; y0: number; x1: number; y1: number }):
  { x: number; y: number; phi: number; score: number }[] {
  const all: { x: number; y: number; phi: number; score: number }[] = [];
  for (let phi = -180; phi < 180; phi += 15) {
    let t = fistTemplates.get(phi);
    if (!t) { t = makeTemplate(fistArt, phi); fistTemplates.set(phi, t); }
    for (let cy = win.y0; cy <= win.y1; cy += 2) {
      for (let cx = win.x0; cx <= win.x1; cx += 2) {
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
        const s = sum / n / 3;
        all.push({ x: cx, y: cy, phi, score: s });
      }
    }
  }
  // keep the best few at DISTINCT positions (>= 14 px apart)
  all.sort((a, b) => a.score - b.score);
  const picks: typeof all = [];
  for (const m of all) {
    if (picks.length >= 4) break;
    if (picks.every((p) => Math.hypot(p.x - m.x, p.y - m.y) >= 14)) picks.push(m);
  }
  return picks;
}

// f27-f59: near-arm wave, everything else = f17 pose (frozen)
for (let i = 27; i <= 59; i++) {
  const ctx = ctxFor(i);
  const ref = frames[i];
  const prev = i === 27 ? store.frames[17].pose : store.frames[i - 1].pose;
  const frozen: PoseVec = { ...store.frames[17].pose };
  const pose: PoseVec = { ...frozen };
  for (const k of WAVE) if (prev[k.key] !== undefined) pose[k.key] = prev[k.key];
  // fist seeds: several distinct template peaks; the objective picks
  const fms = fistMatch(ref, { x0: 25, y0: 230, x1: 135, y1: 330 });
  {
    let cur = evalPose(ctx, pose, 1);
    for (const fm of fms) {
      for (const s of chainSeeds(skeleton, pose, FRONT_ARM, toWorld(fm.x, fm.y), [fm.phi - 10, fm.phi, fm.phi + 10])) {
        const e = evalPose(ctx, s, 1);
        if (e < cur) { cur = e; Object.assign(pose, s); }
      }
    }
  }
  for (const k of WAVE) scan(ctx, pose, k, 3);
  localTriple(ctx, pose, WAVE[0], WAVE[1], WAVE[2], 1, 12, 4);
  refine(ctx, pose, WAVE, 1, [4, 1.5, 0.5]);
  const e = evalPose(ctx, pose, 1);
  store.frames[i] = { pose, err: e };
  console.log(`death f${i}: ${e.toFixed(4)}${fms.length ? ` (fist ${fms[0].x},${fms[0].y}@${fms[0].phi})` : ''}`);
}

writeFileSync(poseFile, JSON.stringify(store, null, 1));
console.log('saved');
