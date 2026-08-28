/**
 * Fit one animation's 12fps frames. Usage:
 *   bun fitshot.ts <anim> [--frames a,b,c | a-b] [--order fwd|bwd|<startIdx>]
 * Writes/updates fitting/poses/<anim>.json  { frames: [{pose, err}], attachments }
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { refFrames, RUN, inkBox } from './lib.ts';
import { loadCandidate, type PoseVec } from './pose.ts';
import { evalPose, refCrop, refine, pairScan, scan, localPair, localTriple, type EvalCtx, type KnobDef, type Window } from './fitcore.ts';
import { gunTeal } from './gunseed.ts';
import { chainSeeds, redComponents, toWorld, REAR_ARM, FRONT_ARM, FRONT_LEG, REAR_LEG } from './armseed.ts';
import { makeTemplate, type Template } from './match.ts';
import { art } from './lib.ts';

const anim = process.argv[2];
const args = process.argv.slice(3).join(' ');

const R = (key: string, lo: number, hi: number, coarse: number): KnobDef => ({ key, lo, hi, coarse });

// per-shot knob ranges (degrees; hip.x/y world units) and shot attachments
interface ShotCfg { knobs: KnobDef[]; attachments: Record<string, string | null>; pairs: [string, string][] }
const LIMBS_TIGHT = 30, LIMBS_MED = 80, LIMBS_WIDE = 150;
function knobset(hipX: [number, number], hipY: [number, number], hipR: [number, number], limbs: number, coarse: number): KnobDef[] {
  return [
    R('hip.x', hipX[0], hipX[1], Math.max(8, (hipX[1] - hipX[0]) / 24)),
    R('hip.y', hipY[0], hipY[1], Math.max(8, (hipY[1] - hipY[0]) / 24)),
    R('hip.rot', hipR[0], hipR[1], Math.max(6, (hipR[1] - hipR[0]) / 20)),
    R('torso.rot', -limbs, limbs, coarse),
    R('torso.x', -35, 35, 10),
    R('torso.y', -35, 35, 10),
    R('neck.rot', -40, 40, 10),
    R('head.rot', -limbs, limbs, coarse),
    R('front-upper-arm.rot', -Math.max(limbs, 100), Math.max(limbs, 100), coarse),
    R('front-bracer.rot', -Math.max(limbs, 100), Math.max(limbs, 100), coarse),
    R('front-fist.rot', -90, 90, coarse),
    R('rear-upper-arm.rot', -Math.max(limbs, 100), Math.max(limbs, 100), coarse),
    R('rear-bracer.rot', -Math.max(limbs, 100), Math.max(limbs, 100), coarse),
    R('gun.rot', -110, 110, coarse),
    R('front-thigh.rot', -limbs, limbs, coarse),
    R('front-shin.rot', -limbs, limbs, coarse),
    R('front-foot.rot', -70, 70, coarse),
    R('rear-thigh.rot', -limbs, limbs, coarse),
    R('rear-shin.rot', -limbs, limbs, coarse),
    R('rear-foot.rot', -70, 70, coarse),
  ];
}
const PAIRS: [string, string][] = [
  ['front-thigh.rot', 'front-shin.rot'],
  ['rear-thigh.rot', 'rear-shin.rot'],
  ['front-upper-arm.rot', 'front-bracer.rot'],
  ['rear-upper-arm.rot', 'rear-bracer.rot'],
];

const cfg: Record<string, ShotCfg> = {
  idle: { knobs: knobset([-40, 40], [-40, 40], [-15, 15], LIMBS_TIGHT, 6), attachments: { 'front-fist': 'front-fist-open' }, pairs: PAIRS },
  walk: { knobs: knobset([-60, 60], [-60, 40], [-25, 25], 95, 8), attachments: { 'front-fist': 'front-fist-closed' }, pairs: PAIRS },
  run: { knobs: knobset([-60, 80], [-40, 90], [-30, 30], 120, 8), attachments: { 'front-fist': 'front-fist-closed' }, pairs: PAIRS },
  jump: { knobs: knobset([-120, 80], [-40, 790], [-45, 45], 120, 8), attachments: { 'front-fist': 'front-fist-closed' }, pairs: PAIRS },
  shoot: { knobs: knobset([-40, 40], [-40, 40], [-20, 20], LIMBS_MED, 6), attachments: { 'front-fist': 'front-fist-closed' }, pairs: PAIRS },
  hit: { knobs: knobset([-320, 60], [-100, 60], [-60, 160], LIMBS_WIDE, 10), attachments: { 'front-fist': 'front-fist-closed' }, pairs: PAIRS },
  death: { knobs: knobset([-480, 60], [-90, 400], [-80, 170], LIMBS_WIDE, 10), attachments: { 'front-fist': 'front-fist-open' }, pairs: PAIRS },
  aim: { knobs: knobset([-40, 40], [-40, 40], [-20, 20], LIMBS_MED, 6), attachments: { 'front-fist': 'front-fist-closed' }, pairs: PAIRS },
};

if (!cfg[anim]) throw new Error(`unknown anim ${anim}`);
const frames = refFrames(anim);
const { posable, skeleton } = loadCandidate();

const posesDir = join(RUN, 'fitting/poses');
mkdirSync(posesDir, { recursive: true });
const poseFile = join(posesDir, `${anim}.json`);
interface Store { frames: { pose: PoseVec; err: number }[]; attachments: Record<string, string | null> }
const store: Store = existsSync(poseFile)
  ? JSON.parse(readFileSync(poseFile, 'utf8'))
  : { frames: frames.map(() => ({ pose: {}, err: Infinity })), attachments: cfg[anim].attachments };
for (const f of store.frames) if (f.err === null || f.err === undefined) f.err = Infinity; // JSON drops Infinity
if (args.includes('--fresh')) for (const f of store.frames) f.err = Infinity; // skeleton changed: stored errs are stale

// which frames to fit
let indices = frames.map((_, i) => i);
const fm = args.match(/--frames (\S+)/);
if (fm) {
  indices = fm[1].includes('-')
    ? (() => { const [a, b] = fm[1].split('-').map(Number); return Array.from({ length: b - a + 1 }, (_, i) => a + i); })()
    : fm[1].split(',').map(Number);
}
const om = args.match(/--order (\S+)/);
if (om?.[1] === 'bwd') indices = [...indices].reverse();

const fistTemplates = new Map<string, Template>();
function bestFistMatch(ref: ReturnType<typeof refFrames>[number], fistName: string, pose: PoseVec):
  { x: number; y: number; artAngle: number; score: number } | null {
  // search window: around the current torso world position
  const tb = skeleton.findBone('torso')!;
  // torso world pos under current pose
  // (applyPose already ran inside evalPose; ensure fresh)
  const a = art(fistName);
  let best: { x: number; y: number; artAngle: number; score: number } | null = null;
  for (let phi = -180; phi < 180; phi += 15) {
    const key = fistName + ':' + phi;
    let t = fistTemplates.get(key);
    if (!t) { t = makeTemplate(a, phi); fistTemplates.set(key, t); }
    // slide over a box around the figure's ink box middle
    const bx = fistWindow;
    for (let cy = bx.y0; cy <= bx.y1; cy += 2) {
      for (let cx = bx.x0; cx <= bx.x1; cx += 2) {
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
        if (n < 10) continue;
        const score = sum / n / 3;
        if (!best || score < best.score) best = { x: cx, y: cy, artAngle: phi, score };
      }
    }
  }
  return best;
}
let fistWindow = { x0: 0, y0: 0, x1: 0, y1: 0 };

const gogglesTemplates = new Map<number, Template>();
function headSeed(ctx2: EvalCtx, pose: PoseVec, ref2: ReturnType<typeof refFrames>[number], box2: { minX: number; minY: number; maxX: number; maxY: number }, K2: Record<string, KnobDef>): void {
  // match goggles around the current head position, then set head.rot so the
  // goggles' world angle equals the match; neck/head pair-refined after.
  const { applyPose } = require('./pose.ts') as typeof import('./pose.ts');
  applyPose(skeleton, pose);
  const slot = skeleton.findSlot('goggles')!;
  const att = slot.appliedPose.attachment as {
    computeWorldVertices: (s: unknown, o: unknown, w: number[], off: number, stride: number) => void;
    getOffsets: (p: unknown) => unknown;
  } | null;
  if (!att) return;
  const wv = new Array<number>(8).fill(0);
  att.computeWorldVertices(slot, att.getOffsets(slot.appliedPose), wv, 0, 2);
  const sc = (require('./lib.ts') as typeof import('./lib.ts')).sidecar().viewport;
  const cgx = ((wv[0] + wv[2] + wv[4] + wv[6]) / 4 - sc.x) * sc.scale;
  const cgy = sc.pixelHeight - ((wv[1] + wv[3] + wv[5] + wv[7]) / 4 - sc.y) * sc.scale;
  const curAngle = Math.atan2(wv[3] - wv[1], wv[2] - wv[0]) * 180 / Math.PI; // br->bl edge angle
  const a = art('goggles');
  let best: { x: number; y: number; phi: number; score: number } | null = null;
  for (let phi = -180; phi < 180; phi += 10) {
    let t = gogglesTemplates.get(phi);
    if (!t) { t = makeTemplate(a, phi); gogglesTemplates.set(phi, t); }
    for (let cy = Math.max(box2.minY, cgy - 30); cy <= Math.min(box2.maxY, cgy + 30); cy += 3) {
      for (let cx = Math.max(box2.minX, cgx - 30); cx <= Math.min(box2.maxX, cgx + 30); cx += 3) {
        let sum = 0, n = 0;
        for (let py = 0; py < t.h; py += 2) {
          const fy = Math.round(cy - t.cy) + py;
          if (fy < 0 || fy >= ref2.height) continue;
          for (let px = 0; px < t.w; px += 2) {
            const o = py * t.w + px;
            if (!t.solid[o]) continue;
            const fx = Math.round(cx - t.cx) + px;
            if (fx < 0 || fx >= ref2.width) continue;
            const fi = (fy * ref2.width + fx) * 4;
            const dr = t.rgb[o * 3] - ref2.data[fi], dg = t.rgb[o * 3 + 1] - ref2.data[fi + 1], db = t.rgb[o * 3 + 2] - ref2.data[fi + 2];
            sum += dr * dr + dg * dg + db * db; n++;
          }
        }
        if (n < 30) continue;
        const s = sum / n / 3;
        if (!best || s < best.score) best = { x: cx, y: cy, phi, score: s };
      }
    }
  }
  if (!best || best.score > 6500) return;
  // goggles template phi is the ART's world rotation; current art world rotation:
  // approximate delta from the quad edge angle difference
  const target = { ...pose, 'head.rot': (pose['head.rot'] ?? 0) + norm2(best.phi - artPhiOf(curAngle)) };
  const e0 = evalPose(ctx2, pose, 3);
  const e1 = evalPose(ctx2, target, 3);
  if (e1 < e0) Object.assign(pose, target);
  localPair(ctx2, pose, K2['neck.rot'], K2['head.rot'], 3, 15, 5);
  function artPhiOf(edgeAngle: number): number {
    // the goggles quad br->bl edge at art rotation phi runs at (phi + 180) in world;
    // so art phi = edgeAngle - 180
    return edgeAngle - 180;
  }
  function norm2(x: number): number { while (x > 180) x -= 360; while (x <= -180) x += 360; return x; }
}

const gauge = (pose: PoseVec) => 2e-6 * (pose['hip.rot'] ?? 0) ** 2 + 1e-5 * (pose['neck.rot'] ?? 0) ** 2;

function fitFrame(i: number, jitter = false): void {
  const t0 = Date.now();
  const ref = frames[i];
  const box = inkBox(ref)!;
  const M = 26;
  const win: Window = {
    px0: Math.max(0, box.minX - M), py0: Math.max(0, box.minY - M),
    px1: Math.min(ref.width - 1, box.maxX + M), py1: Math.min(ref.height - 1, box.maxY + M),
  };
  const crops = new Map([[6, refCrop(ref, win, 6)], [3, refCrop(ref, win, 3)], [1, refCrop(ref, win, 1)]]);
  fistWindow = { x0: box.minX, y0: box.minY + Math.round(0.3 * (box.maxY - box.minY)), x1: box.maxX, y1: box.maxY };
  const ctx: EvalCtx = { posable, skeleton, win, crops, attachments: store.attachments, prior: gauge };
  const knobs = cfg[anim].knobs;
  const K = Object.fromEntries(knobs.map((k) => [k.key, k]));

  // ---- starts ----
  const starts: PoseVec[] = [];
  if (store.frames[i].err < Infinity && Object.keys(store.frames[i].pose).length) starts.push({ ...store.frames[i].pose });
  if (jitter && starts.length) {
    // jittered restart around the incumbent (proven escape on stuck frames)
    const j: PoseVec = { ...starts[0] };
    for (const kb of cfg[anim].knobs) {
      const sigma = kb.key.startsWith('hip.') && !kb.key.endsWith('rot') ? 12 : 9;
      j[kb.key] = Math.min(kb.hi, Math.max(kb.lo, (j[kb.key] ?? 0) + (Math.random() * 2 - 1) * sigma));
    }
    starts.unshift(j);
  }
  if (i > 0 && store.frames[i - 1].err < Infinity) starts.push({ ...store.frames[i - 1].pose });
  if (i < frames.length - 1 && store.frames[i + 1].err < Infinity) starts.push({ ...store.frames[i + 1].pose });
  starts.push({}); // setup pose
  // spread: any already-fitted frames of this shot
  for (const j of [Math.floor(frames.length / 2), frames.length - 1]) {
    if (j !== i && store.frames[j]?.err < Infinity && Object.keys(store.frames[j].pose).length) starts.push({ ...store.frames[j].pose });
  }
  // screen at k=6
  const screened = starts
    .map((p) => ({ p, e: evalPose(ctx, p, 6) }))
    .sort((a, b) => a.e - b.e)
    .slice(0, 2);

  let best: { p: PoseVec; e: number } | null = null;
  let k3best = Infinity;
  for (const { p } of screened) {
    const pose: PoseVec = { ...p };
    // k=6: place the body — position pair, then whole-body orientation pair
    pairScan(ctx, pose, K['hip.x'], K['hip.y'], 6);
    pairScan(ctx, pose, K['hip.rot'], K['torso.rot'], 6);
    pairScan(ctx, pose, K['hip.x'], K['hip.y'], 6);
    // k=3: limbs, pairs on chains that end in something visible
    scan(ctx, pose, K['hip.rot'], 3);
    scan(ctx, pose, K['torso.rot'], 3);
    for (const [a, b] of cfg[anim].pairs) pairScan(ctx, pose, K[a], K[b], 3, Math.max(14, K[a].coarse), Math.max(14, K[b].coarse));
    // analytic gun seeds off the measured teal (§8.1 cross-start for the two-chain minimum)
    const headPx = (() => {
      // head ART centre under the current body pose, projected to frame px
      const { applyPose } = require('./pose.ts') as typeof import('./pose.ts');
      applyPose(skeleton, pose);
      const slot = skeleton.findSlot('head')!;
      const att = slot.appliedPose.attachment as unknown as {
        computeWorldVertices: (s: unknown, o: unknown, w: number[], off: number, stride: number) => void;
        getOffsets: (p: unknown) => unknown;
      };
      const wv = new Array<number>(8).fill(0);
      att.computeWorldVertices(slot, att.getOffsets(slot.appliedPose), wv, 0, 2);
      const cxw = (wv[0] + wv[2] + wv[4] + wv[6]) / 4, cyw = (wv[1] + wv[3] + wv[5] + wv[7]) / 4;
      const sc = (require('./lib.ts') as typeof import('./lib.ts')).sidecar().viewport;
      return { x: (cxw - sc.x) * sc.scale, y: sc.pixelHeight - (cyw - sc.y) * sc.scale, r: 42 };
    })();
    const gt = gunTeal(ref, box, headPx);
    if (gt && gt.count >= 25) {
      let cur = evalPose(ctx, pose, 3);
      const T = toWorld(gt.cx, gt.cy);
      // gun art edge angle vs PCA axis differ by a constant; try 4 axis hypotheses x both elbows
      for (const s of chainSeeds(skeleton, pose, REAR_ARM, T, [gt.axisDeg - 36, gt.axisDeg + 144, gt.axisDeg - 16, gt.axisDeg + 164])) {
        const e = evalPose(ctx, s, 3);
        if (e < cur) { cur = e; Object.assign(pose, s); }
      }
      localPair(ctx, pose, K['rear-upper-arm.rot'], K['rear-bracer.rot'], 3, 12, 4);
      scan(ctx, pose, K['gun.rot'], 3, 5);
    }
    // fist seeds off a template match around the torso
    const fistName = store.attachments['front-fist'];
    if (fistName) {
      const tw = skeleton.findBone('torso')!;
      const fm2 = bestFistMatch(ref, fistName, pose);
      if (fm2 && fm2.score < 5200) {
        let cur = evalPose(ctx, pose, 3);
        for (const s of chainSeeds(skeleton, pose, FRONT_ARM, toWorld(fm2.x, fm2.y), [fm2.artAngle])) {
          const e = evalPose(ctx, s, 3);
          if (e < cur) { cur = e; Object.assign(pose, s); }
        }
        localPair(ctx, pose, K['front-upper-arm.rot'], K['front-bracer.rot'], 3, 12, 4);
        scan(ctx, pose, K['front-fist.rot'], 3, 6);
      }
    }
    headSeed(ctx, pose, ref, box, K);
    // leg seeds off red boot components: try both assignments
    {
      const rowCut = box.minY + 0.55 * (box.maxY - box.minY);
      const reds = redComponents(ref, box, 45, rowCut).slice(0, 3);
      if (reds.length >= 2) {
        let cur = evalPose(ctx, pose, 3);
        let bestP: PoseVec | null = null;
        for (let ai = 0; ai < reds.length; ai++) for (let bi = 0; bi < reds.length; bi++) {
          if (ai === bi) continue;
          const A = reds[ai], B = reds[bi];
          for (const sF of chainSeeds(skeleton, pose, FRONT_LEG, toWorld(A.cx, A.cy), [A.axisDeg, A.axisDeg + 180])) {
            for (const sR of chainSeeds(skeleton, sF, REAR_LEG, toWorld(B.cx, B.cy), [B.axisDeg, B.axisDeg + 180])) {
              const e = evalPose(ctx, sR, 3);
              if (e < cur) { cur = e; bestP = sR; }
            }
          }
        }
        if (bestP) Object.assign(pose, bestP);
        localPair(ctx, pose, K['front-thigh.rot'], K['front-shin.rot'], 3, 12, 4);
        localPair(ctx, pose, K['rear-thigh.rot'], K['rear-shin.rot'], 3, 12, 4);
      }
    }
    for (const k of ['front-foot.rot', 'rear-foot.rot', 'gun.rot', 'front-fist.rot', 'head.rot', 'neck.rot']) scan(ctx, pose, K[k], 3);
    const k3e = evalPose(ctx, pose, 3);
    if (k3e > 1.6 * k3best) continue; // clearly lost at coarse level; do not spend k=1 on it
    k3best = Math.min(k3best, k3e);
    // k=1: refine everything
    refine(ctx, pose, knobs, 1, [6, 2]);
    for (const [a, b] of cfg[anim].pairs) localPair(ctx, pose, K[a], K[b], 1, 8, 2.5);
    localTriple(ctx, pose, K['rear-upper-arm.rot'], K['rear-bracer.rot'], K['gun.rot'], 1, 7, 3.5);
    localTriple(ctx, pose, K['front-upper-arm.rot'], K['front-bracer.rot'], K['front-fist.rot'], 1, 7, 3.5);
    const e = refine(ctx, pose, knobs, 1, [2, 0.7, 0.25]);
    if (!best || e < best.e) best = { p: pose, e };
  }
  if (best && best.e < store.frames[i].err) {
    store.frames[i] = { pose: best.p, err: best.e };
  }
  console.log(`${anim} f${i}: err ${store.frames[i].err.toFixed(4)}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

const rm = args.match(/--restarts (\d+)/);
const restarts = rm ? Number(rm[1]) : 0;
for (const i of indices) {
  fitFrame(i);
  for (let r = 0; r < restarts; r++) fitFrame(i, true);
}
writeFileSync(poseFile, JSON.stringify(store, null, 1));
console.log('saved', poseFile);
