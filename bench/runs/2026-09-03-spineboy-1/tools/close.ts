/**
 * Close the loop on the frames — §10.3's last instruction, and the only part of
 * key planning that is verified rather than argued.
 *
 * *"Sample your own planned curves at the frames' own rate, render them, compare
 * every adjacent pair against the reference's own change, force the offending
 * frames as keys, and re-plan — repeating until no pair is out of band."*
 *
 * Two things this file is careful about, both stated in §10.3:
 *
 * - 🚨 **The contraction is applied where the MEASUREMENT is taken.** The change
 *   column reads the compiled animation sampled at the frames' rate, and between
 *   the pose series and that lie the key reduction and the curves. So this samples
 *   the artifact through `sampleAnimation` — the same stepper `check` and the
 *   reference frames used — rather than the series, and the frames it repairs are
 *   forced as keys so that moving the series moves the sample.
 * - **The diagnosis comes before the fix**, because the two directions want
 *   opposite repairs: a pair where the reference holds and the candidate does not
 *   is a plan that slopes through a plateau (force both ends, equal), while a pair
 *   where both move and the candidate moves several times more is two ordinary
 *   per-frame residuals adding (contract the neighbours toward each other, and
 *   record it as a trade). Forcing keys on the second one pins the excess in place.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHANGE_EXCESS, CHANGE_RATIO, CHANGE_TOLERANCE } from '../../../../src/check.ts';
import { piecesOf, posableFromText, projector, rasterisePiece, sampleAnimation, viewportOfSize } from '../../../../src/render.ts';
import { Plate } from '../../../../tools/plate.ts';
import { readViewport } from './geom.ts';
import { BG } from './fitlib.ts';
import { KNOBS, setsOf } from './fit.ts';
import type { PoseVec } from './fitlib.ts';

const ROOT = 'bench/runs/2026-09-03-spineboy-1';
const REF = 'bench/reference/spineboy/ess';

const vp = readViewport(join(REF, 'frames.json'));
const viewport = viewportOfSize(vp.minX, vp.minY, vp.maxX - vp.minX, vp.maxY - vp.minY, vp.scale, vp.width, vp.height);
const project = projector(viewport);

const skeletonText = readFileSync(join(ROOT, 'spine/skeleton.json'), 'utf8');
const atlasText = readFileSync(join(ROOT, 'spine/skeleton.atlas'), 'utf8');
const { data, pages } = posableFromText(skeletonText, atlasText, join(ROOT, 'spine'));

function renderInto(pieces: ReturnType<typeof piecesOf>): Plate {
  const plate = new Plate(vp.width, vp.height);
  for (let y = 0; y < vp.height; y++) {
    for (let x = 0; x < vp.width; x++) {
      const i = (y * vp.width + x) * 4;
      plate.data[i] = BG[0];
      plate.data[i + 1] = BG[1];
      plate.data[i + 2] = BG[2];
      plate.data[i + 3] = 255;
    }
  }
  for (const piece of pieces) {
    const page = pages.get(piece.page);
    if (!page) continue;
    rasterisePiece(page, piece, project, plate, (px, py, r, g, b, a) => plate.blend(px, py, [r, g, b, a]));
  }
  return plate;
}

function changed(a: Plate, b: Plate): number {
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      Math.abs(a.data[i] - b.data[i]) > CHANGE_TOLERANCE ||
      Math.abs(a.data[i + 1] - b.data[i + 1]) > CHANGE_TOLERANCE ||
      Math.abs(a.data[i + 2] - b.data[i + 2]) > CHANGE_TOLERANCE
    ) {
      n++;
    }
  }
  return n;
}

function disagrees(mine: number, theirs: number): boolean {
  if (mine === 0) return false;
  if (theirs === 0) return true;
  return mine > theirs * CHANGE_RATIO && mine - theirs > CHANGE_EXCESS;
}

const refChange: Record<string, number[]> = JSON.parse(readFileSync(join(ROOT, 'fit/refchange.json'), 'utf8'));
const contract = Number(process.argv[2] ?? 0.45);
const report: string[] = [];
let repaired = 0;

for (const set of setsOf()) {
  const fps = set.dir.endsWith('@30fps') ? 30 : 12;
  if (set.frames.length < 2 || fps === 30) continue;
  const animation = set.dir;
  const theirs = refChange[animation];
  if (!theirs) continue;
  const frames = sampleAnimation(data, animation, fps);
  const plates = frames.slice(0, set.frames.length).map((f) => renderInto(f.pieces));
  const mine: number[] = [];
  for (let i = 1; i < plates.length; i++) mine.push(changed(plates[i - 1], plates[i]));

  const file = join(ROOT, `fit/poses/${animation.replace('@', '_at_')}.json`);
  if (!existsSync(file)) continue;
  const poses: Record<string, PoseVec> = JSON.parse(readFileSync(file, 'utf8'));
  const names = set.frames.map((f) => f.replace('.png', ''));
  let touched = false;

  for (let i = 0; i < Math.min(mine.length, theirs.length); i++) {
    const bad = disagrees(mine[i], theirs[i]) || disagrees(theirs[i], mine[i]);
    if (!bad) continue;
    const a = poses[names[i]];
    const b = poses[names[i + 1]];
    if (!a || !b) continue;
    if (theirs[i] === 0) {
      // the reference holds and we do not: snap, both ends forced by the planner
      for (const k of KNOBS) b[k.key] = a[k.key];
      report.push(`${animation} f${i}->f${i + 1}: reference holds (0 px), ours moved ${mine[i]} — snapped equal`);
    } else if (theirs[i] > mine[i]) {
      // §10.3's THIRD direction, and the one a contraction makes worse: the
      // reference is busy and the candidate reproduces a fraction of it. *"Under-
      // change means the poses themselves barely differ, so no key plan recovers
      // it — the fit has to find more motion before the planner sees any."*
      report.push(
        `${animation} f${i}->f${i + 1}: reference moved ${theirs[i]} px and ours ${mine[i]} — UNDER-change, ` +
          `not a key-plan defect and NOT repaired here; the poses need more motion`,
      );
      continue;
    } else {
      // two per-frame residuals adding: draw the neighbours toward each other
      let cost = 0;
      for (const k of KNOBS) {
        const mid = (a[k.key] + b[k.key]) / 2;
        cost += Math.abs(a[k.key] - mid) * contract + Math.abs(b[k.key] - mid) * contract;
        a[k.key] = a[k.key] + (mid - a[k.key]) * contract;
        b[k.key] = b[k.key] + (mid - b[k.key]) * contract;
      }
      report.push(
        `${animation} f${i}->f${i + 1}: ours ${mine[i]} px against ${theirs[i]} — contracted by ` +
          `${(contract * 100).toFixed(0)} %, cost ${cost.toFixed(1)} deg summed over 17 channels`,
      );
    }
    touched = true;
    repaired++;
  }
  if (touched) writeFileSync(file, JSON.stringify(poses, null, 1));
  const worst = mine.map((v, i) => [v, theirs[i] ?? 0, i] as const).sort((x, y) => y[0] / (y[1] + 1) - x[0] / (x[1] + 1))[0];
  console.log(
    `${animation.padEnd(8)} ${mine.length} pair(s), ${mine.filter((v, i) => disagrees(v, theirs[i]) || disagrees(theirs[i], v)).length} out of band` +
      (worst ? `   worst ratio f${worst[2]}: ours ${worst[0]} vs ${worst[1]}` : ''),
  );
}
for (const line of report) console.log(`  ${line}`);
console.log(`${repaired} pair(s) repaired`);
