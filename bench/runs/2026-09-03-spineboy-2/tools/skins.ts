/**
 * Which attachment each multi-attachment slot shows, per frame — decided
 * against the frames, not chosen.
 *
 * Three slots in this rig hold alternatives (§10.1: "Slots group attachments of
 * the same type ... only one attachment (or none) can be visible at any given
 * time"), and the frames say different amounts about each:
 *
 *  - **`muzzle`**, five numbered flare plates plus a glow and a ring. The brief
 *    states outright that the frames "cannot tell you how they are divided
 *    between parts or which flare is on which frame" — but WHICH PLATE is on a
 *    given frame is a question about pixels, and the five plates are different
 *    shapes at different sizes, so it is decidable by rendering each and
 *    reading the frame. That is what this does, and the margin it wins by is
 *    recorded so a thin one can be read as thin.
 *  - **`front-fist`**, closed or open. The brief settles that the hand the
 *    `death` wave raises is an OPEN fist, on the art's own evidence (only the
 *    near arm ships a fist). The window is swept rather than assumed.
 *  - **`eye`** and **`mouth`** are NOT swept. The brief measures the goggles
 *    covering the eyes on every frame of both skeletons, and the mouth at 6-8
 *    frame pixels; a sweep there would be reading the rasteriser's last bit.
 *    The setup choices are recorded as priors in `tools/skeleton.ts`.
 *
 * The flare WINDOW comes first and from the frames: the brief's own pink
 * detector (r > 200, b > 140, g < min(r,b) − 30), recomputed here.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Plate } from '../../../../tools/plate';
import { declaredViewport, framePath, isInk, loadFrame, sidecarOf } from './geom';
import {
  keyOf,
  levelsFor,
  loadCandidate,
  objectiveFor,
  targetFor,
  weightFromChange,
  type Pose,
  type Skin,
} from './fitlib';
import { KNOBS, LEVEL_PLAN, PAIR_SAMPLES, PAIRS, SAMPLES } from './plan';
import { fitFrame } from './fitlib';
import { cut, flarePerTile } from './sheet';
import { join } from 'node:path';

const REF = process.env.REF ?? 'bench/reference/spineboy/ess';
const CAND = process.env.CAND ?? '/tmp/sb2/probe';
const POSES = process.env.POSES ?? 'bench/runs/2026-09-03-spineboy-2/fit/poses.json';
const out = process.argv[2] ?? 'bench/runs/2026-09-03-spineboy-2/fit/skins.json';
const report = process.argv[3] ?? 'bench/runs/2026-09-03-spineboy-2/evidence/skins.txt';

const sidecar = sidecarOf(REF);
const view = declaredViewport(sidecar);
const levels = levelsFor(view, LEVEL_PLAN);
const c = loadCandidate(CAND);
const stored: Record<string, Record<string, { pose: Pose; score: number }>> = JSON.parse(readFileSync(POSES, 'utf8'));

/** The brief's own muzzle-flash predicate, recomputed off the frames. */
function flarePixels(plate: Plate): number {
  const d = plate.data;
  let n = 0;
  for (let y = 0; y < plate.height; y++) {
    for (let x = 0; x < plate.width; x++) {
      if (!isInk(plate, x, y)) continue;
      const i = (y * plate.width + x) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      if (r > 200 && b > 140 && g < Math.min(r, b) - 30) n++;
    }
  }
  return n;
}

const MUZZLE_PLATES = ['muzzle01', 'muzzle02', 'muzzle03', 'muzzle04', 'muzzle05'];
const FLARE_SLOTS = ['muzzle', 'muzzle-glow', 'muzzle-ring'] as const;

const skins: Record<string, Record<string, Skin>> = {};
/** animation -> slot -> stepped keys, in seconds. What `keys.ts` emits. */
const timeline: Record<string, Record<string, { t: number; attachment: string | null }[]>> = {};
const lines: string[] = [];

// --- the flare window, from the frames --------------------------------------
const flareByFrame = new Map<string, Map<number, number>>();
for (const s of sidecar.sets) {
  const indices = s.written === s.sampled ? [...Array(s.written).keys()] : [0, s.sampled - 1];
  const per = new Map<number, number>();
  for (const i of indices) {
    try {
      per.set(i, flarePixels(loadFrame(framePath(REF, s.dir, i))));
    } catch {
      /* missing still */
    }
  }
  flareByFrame.set(s.dir, per);
}
lines.push("flare census (the brief's own pink predicate, over every committed frame):");
for (const [set, per] of flareByFrame) {
  const hits = [...per.entries()].filter(([, n]) => n > 0);
  lines.push(`  ${set.padEnd(14)} ${hits.length === 0 ? 'none' : hits.map(([i, n]) => `f${i}=${n}px`).join('  ')}`);
}

/**
 * The flare's WINDOW comes off the 30 fps sheet, not off the 12 fps frames.
 *
 * An attachment timeline is stepped, and §4.5's 🚨 says a stepped key is either
 * on the sample that was meant to see it or a whole frame out. The 12 fps set
 * brackets the flare's end between 0.3333 s and 0.4167 s — a whole twelfth of
 * uncertainty on a three-frame event — while the sheet puts it inside a
 * thirtieth. `tools/sheet.ts` cuts the tiles with the geometry the BRIEF states
 * and refuses a sheet whose size that geometry does not reconstruct.
 */
lines.push('', 'flare window off the 30 fps sheets (tools/sheet.ts, the brief\'s stated tile layout):');
const flareWindow = new Map<string, { first: number; last: number; brightest: number }>();
for (const s of sidecar.sets) {
  if (!s.dir.endsWith('@30fps')) continue;
  let tiles;
  try {
    tiles = cut(join(REF, s.dir), s.sampled, sidecar.viewport.pixelWidth, sidecar.viewport.pixelHeight);
  } catch (e) {
    lines.push(`  ${s.dir.padEnd(14)} ${(e as Error).message}`);
    continue;
  }
  const per = flarePerTile(tiles);
  const hits = per.map((n, i) => [i, n] as const).filter(([, n]) => n > 0);
  if (hits.length === 0) {
    lines.push(`  ${s.dir.padEnd(14)} none  [layout control: ${tiles.sheet.width}x${tiles.sheet.height} reconstructed exactly]`);
    continue;
  }
  const brightest = hits.reduce((a, b) => (b[1] > a[1] ? b : a));
  flareWindow.set(s.animation, { first: hits[0][0], last: hits[hits.length - 1][0], brightest: brightest[0] });
  lines.push(
    `  ${s.dir.padEnd(14)} tiles ${hits[0][0]}..${hits[hits.length - 1][0]}, brightest ${brightest[0]} (${brightest[1]} px)  ` +
      `${hits.map(([i, n]) => `t${i}=${n}`).join(' ')}`,
  );
  lines.push(
    `  ${''.padEnd(14)} ⇒ show at ${(hits[0][0] / 30).toFixed(6)} s, hide at ${((hits[hits.length - 1][0] + 1) / 30).toFixed(6)} s  ` +
      `[layout control: ${tiles.sheet.width}x${tiles.sheet.height} reconstructed exactly]`,
  );
}

// --- the sweeps -------------------------------------------------------------
const ARM_KNOBS = ['rear-upper-arm.rotate', 'rear-bracer.rotate', 'gun.rotate', 'muzzle.rotate'];

lines.push('', 'muzzle plate sweep (the fitted arm re-solved under each option; lower is better):');
for (const [set, per] of flareByFrame) {
  const flareFrames = [...per.entries()].filter(([, n]) => n > 0).map(([i]) => i);
  const setStore = stored[set];
  if (!setStore) continue;
  skins[set] ??= {};
  for (const i of Object.keys(setStore).map(Number)) {
    if (!flareFrames.includes(i)) {
      skins[set][String(i)] = { muzzle: null, 'muzzle-glow': null, 'muzzle-ring': null };
    }
  }
  if (flareFrames.length === 0) continue;

  const plate0 = loadFrame(framePath(REF, set, flareFrames[0]));
  void plate0;
  for (const i of flareFrames) {
    const plate = loadFrame(framePath(REF, set, i));
    const neighbours: Plate[] = [];
    for (const j of [i - 1, i + 1]) {
      try {
        neighbours.push(loadFrame(framePath(REF, set, j)));
      } catch {
        /* edge */
      }
    }
    const target = targetFor(plate, levels, neighbours.length ? weightFromChange(plate, neighbours, 4) : null);
    const base = setStore[String(i)]?.pose ?? {};
    const options: { skin: Skin; label: string }[] = [];
    for (const plateName of MUZZLE_PLATES) {
      for (const glow of [true, false]) {
        for (const ring of [true, false]) {
          options.push({
            skin: {
              muzzle: plateName,
              'muzzle-glow': glow ? 'muzzle-glow' : null,
              'muzzle-ring': ring ? 'muzzle-ring' : null,
            },
            label: `${plateName}${glow ? '+glow' : ''}${ring ? '+ring' : ''}`,
          });
        }
      }
    }
    const scored: { label: string; score: number; pose: Pose; skin: Skin }[] = [];
    for (const option of options) {
      const obj = objectiveFor(c, target, option.skin);
      const fit = fitFrame(
        obj,
        {
          knobs: KNOBS,
          pairs: PAIRS,
          levels,
          samples: SAMPLES,
          pairSamples: PAIR_SAMPLES,
          sweeps: 2,
          frozen: new Set(KNOBS.map(keyOf).filter((k) => !ARM_KNOBS.includes(k))),
        },
        [base],
        1,
      );
      scored.push({ label: option.label, score: fit.score, pose: fit.pose, skin: option.skin });
    }
    scored.sort((a, b) => a.score - b.score);
    skins[set][String(i)] = scored[0].skin;
    setStore[String(i)] = { pose: scored[0].pose, score: scored[0].score };
    const margin = scored[1].score - scored[0].score;
    lines.push(
      `  ${set}/f${i}  winner ${scored[0].label.padEnd(24)} ${scored[0].score.toFixed(4)}   ` +
        `runner-up ${scored[1].label.padEnd(24)} ${scored[1].score.toFixed(4)}   margin ${margin.toFixed(4)}` +
        `${margin < 0.02 ? '   ⚠️ THIN — read as undecided' : ''}`,
    );
  }
}

// --- the fist ---------------------------------------------------------------
lines.push('', 'front-fist sweep (closed vs open, at the fitted pose):');
for (const [set, setStore] of Object.entries(stored)) {
  skins[set] ??= {};
  const runs: { from: number; to: number; pick: string }[] = [];
  for (const i of Object.keys(setStore).map(Number).sort((a, b) => a - b)) {
    const plate = loadFrame(framePath(REF, set, i));
    const target = targetFor(plate, levels, null);
    const pose = setStore[String(i)].pose;
    let best = { name: 'front-fist-closed', score: Infinity };
    for (const name of ['front-fist-closed', 'front-fist-open']) {
      const obj = objectiveFor(c, target, { ...(skins[set][String(i)] ?? {}), 'front-fist': name });
      const s = obj(pose, levels[levels.length - 1]);
      if (s < best.score) best = { name, score: s };
    }
    skins[set][String(i)] = { ...(skins[set][String(i)] ?? {}), 'front-fist': best.name };
    const last = runs[runs.length - 1];
    if (last && last.pick === best.name && last.to === i - 1) last.to = i;
    else runs.push({ from: i, to: i, pick: best.name });
  }
  lines.push(`  ${set.padEnd(14)} ${runs.map((r) => `f${r.from}${r.to > r.from ? `-f${r.to}` : ''}=${r.pick.replace('front-fist-', '')}`).join('  ')}`);
}

// --- the stepped timelines --------------------------------------------------
// The flare: one show key and one hide key per shot, at the sheet's own tiles,
// with the PLATE chosen by the sweep above on the frame the sheet says is
// brightest — the shot swaps between five alternatives and this run authors the
// swap it can measure rather than a five-key sequence it cannot.
for (const s of sidecar.sets) {
  if (s.fps !== 12) continue;
  const window = flareWindow.get(s.animation);
  if (!window) continue;
  const per = flareByFrame.get(s.dir);
  const flareFrames = [...(per ?? new Map()).entries()].filter(([, n]) => n > 0).map(([i]) => i);
  const chosen = flareFrames
    .map((i) => skins[s.dir]?.[String(i)])
    .find((skin) => skin && skin.muzzle);
  if (!chosen) continue;
  timeline[s.animation] ??= {};
  for (const slot of FLARE_SLOTS) {
    const on = chosen[slot];
    if (on === undefined || on === null) continue;
    timeline[s.animation][slot] = [
      { t: window.first / 30, attachment: on },
      { t: (window.last + 1) / 30, attachment: null },
    ];
  }
}

// The fist: the runs the per-frame sweep found, at 12 fps, against the slot's
// own setup attachment.
const FIST_SETUP = 'front-fist-closed';
for (const [set, setStore] of Object.entries(stored)) {
  const s = sidecar.sets.find((x) => x.dir === set);
  if (!s || s.fps !== 12) continue;
  const indices = Object.keys(setStore).map(Number).sort((a, b) => a - b);
  let previous = FIST_SETUP;
  const keys: { t: number; attachment: string | null }[] = [];
  for (const i of indices) {
    const pick = skins[set]?.[String(i)]?.['front-fist'] ?? FIST_SETUP;
    if (pick !== previous) {
      keys.push({ t: i / s.fps, attachment: pick });
      previous = pick;
    }
  }
  if (keys.length) {
    timeline[s.animation] ??= {};
    timeline[s.animation]['front-fist'] = keys;
  }
}

lines.push('', 'stepped attachment timelines authored:');
for (const [animation, slots] of Object.entries(timeline)) {
  for (const [slot, keys] of Object.entries(slots)) {
    lines.push(`  ${animation}/${slot.padEnd(14)} ${keys.map((k) => `${k.t.toFixed(4)}s=${k.attachment ?? 'null'}`).join('  ')}`);
  }
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ perFrame: skins, timeline })}\n`);
mkdirSync(dirname(report), { recursive: true });
writeFileSync(report, `${lines.join('\n')}\n`);
// The flare sweep re-solved the arm, so the pose store is written back too.
writeFileSync(POSES, `${JSON.stringify(stored)}\n`);
process.stderr.write(`wrote ${out}\nwrote ${report}\nupdated ${POSES} (arm re-solved on the flare frames)\n`);
