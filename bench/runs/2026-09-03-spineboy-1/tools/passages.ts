/**
 * `death`'s passages, built as passages rather than as 60 independent frames.
 *
 * ⭐ This is AUTHORING §8's *temporal dilution* with the brief's own answer to it.
 * §8: *"where a passage's motion is a small part moving against a large, nearly
 * still body, the moving part is a tiny share of the ink, so a whole-figure score
 * is dominated by the still majority — every frame then reports a good number
 * individually, the fit converges, and the passage comes out static"*. Here it
 * came out the other way round: the fit moved the whole body a little on every
 * frame of the quiet passages, and §10.3's change column caught it —
 * 11 of `death`'s 59 pairs out of band, 4,000-5,900 px against the reference's
 * 830-1,270.
 *
 * Contracting the neighbours (`tools/close.ts`) would buy the band at a cost of
 * 300-930 degrees summed per pair, which is not a trade worth taking. The brief
 * states the constraint instead, and calls it *"the strongest constraint in the
 * shot"*: after f27 every difference box lies inside x 23-131, the head-and-chest
 * end, and **the boots at x 145-175 never move again**. So the passage is authored
 * as what it is — a held body with one arm moving — and only the free channels are
 * refitted, under §8's change-weighted objective, which is what makes a passage
 * like this trackable at all.
 *
 * The hold is authored the same way: `tools/refchange.ts` reads f17->f22 and
 * f23->f26 as **exactly dead** at `CHANGE_TOLERANCE`, so those poses are copied
 * rather than fitted, and f22->f23 is left as the one pair that moves — the brief's
 * *"a rig that does not move at all for nine frames, and one pixel's worth of the
 * head-and-chest end that does, once"*.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readViewport } from './geom.ts';
import { applyPose, BG, changeWeights, loadPosable, refLevels, score, type PoseVec, type RefLevel } from './fitlib.ts';
import { KNOBS } from './fit.ts';
import { Plate } from '../../../../tools/plate.ts';
import { piecesOf, projector, rasterisePiece, viewportOfSize } from '../../../../src/render.ts';
import { CHANGE_TOLERANCE } from '../../../../src/check.ts';

const ROOT = 'bench/runs/2026-09-03-spineboy-1';
const REF = 'bench/reference/spineboy/ess';

const NEAR_ARM = ['front-upper-arm.rotate', 'front-bracer.rotate', 'front-fist.rotate'];
const FAR_ARM = ['rear-upper-arm.rotate', 'rear-bracer.rotate', 'gun.rotate'];
const HEAD = ['neck.rotate', 'head.rotate'];
const FEET = ['front-foot.rotate', 'rear-foot.rotate', 'front-shin.rotate', 'rear-shin.rotate'];

interface Passage {
  from: number;
  to: number;
  /** Copy every other channel from this frame. */
  base: number;
  free: string[];
  why: string;
}

const PASSAGES: Passage[] = [
  {
    from: 14,
    to: 17,
    base: 13,
    free: FEET,
    why: 'the feet come to rest after the body has — the difference box walks right onto the boots',
  },
  { from: 18, to: 22, base: 17, free: [], why: 'dead hold, measured exactly 0 px at 8/255 on every pair' },
  { from: 23, to: 26, base: 23, free: [], why: 'dead hold after the one pixel that moves at f22->f23' },
  {
    from: 27,
    to: 59,
    base: 26,
    free: [...NEAR_ARM, ...FAR_ARM, ...HEAD],
    why: 'a hand comes up: everything right of x 140 is held, the boots never move again',
  },
];

/** Changed pixels between two of this shot's poses, at the measure's own tolerance. */
function renderedChange(i: number, j: number): number {
  const shot = (k: number): Plate => {
    applyPose(p, poses[name(k)]);
    const plate = new Plate(vpSize.width, vpSize.height);
    for (let q = 0; q < plate.data.length; q += 4) {
      plate.data[q] = BG[0];
      plate.data[q + 1] = BG[1];
      plate.data[q + 2] = BG[2];
      plate.data[q + 3] = 255;
    }
    for (const piece of piecesOf(p.skeleton)) {
      const page = p.pages.get(piece.page);
      if (!page) continue;
      rasterisePiece(page, piece, project, plate, (px, py, r, g, b, a) => plate.blend(px, py, [r, g, b, a]));
    }
    return plate;
  };
  const a = shot(i);
  const b = shot(j);
  let n = 0;
  for (let q = 0; q < a.data.length; q += 4) {
    if (
      Math.abs(a.data[q] - b.data[q]) > CHANGE_TOLERANCE ||
      Math.abs(a.data[q + 1] - b.data[q + 1]) > CHANGE_TOLERANCE ||
      Math.abs(a.data[q + 2] - b.data[q + 2]) > CHANGE_TOLERANCE
    ) {
      n++;
    }
  }
  return n;
}
const p = loadPosable(join(ROOT, 'spine'));
const vp = readViewport(join(REF, 'frames.json'));
const vpSize = vp;
const project = projector(
  viewportOfSize(vp.minX, vp.minY, vp.maxX - vp.minX, vp.maxY - vp.minY, vp.scale, vp.width, vp.height),
);
const file = join(ROOT, 'fit/poses/death.json');
const poses: Record<string, PoseVec> = JSON.parse(readFileSync(file, 'utf8'));
const name = (i: number): string => `f${String(i).padStart(4, '0')}`;

const levelsFor = (i: number): RefLevel[] => {
  const levels = refLevels(join(REF, 'death', `${name(i)}.png`), vp);
  const neighbours = [i - 1, i + 1]
    .filter((j) => j >= 0 && j <= 59)
    .map((j) => join(REF, 'death', `${name(j)}.png`));
  changeWeights(levels, neighbours, 0.2, 8);
  return levels;
};

/**
 * ⚠️ `--holds-only` re-asserts the copy relations without refitting, and it exists
 * because a repair upstream of a hold silently breaks it: `tools/close.ts`
 * contracted f16->f17 by a degree, f18..f22 were not re-derived from the new f17,
 * and the hold's far end then differed from f23 by exactly that contraction —
 * which read as 253 changed pixels on the one pair that is allowed to move by one.
 * So the relations are re-asserted after every repair, not once.
 */
const holdsOnly = process.argv.includes('--holds-only');

for (const passage of PASSAGES) {
  const base = poses[name(passage.base)];
  const frozen = KNOBS.map((k) => k.key).filter((key) => !passage.free.includes(key));
  for (let i = passage.from; i <= passage.to; i++) {
    const pose = poses[name(i)];
    if (!pose || !base) continue;
    for (const key of frozen) pose[key] = base[key];
    if (passage.free.length === 0) {
      for (const k of KNOBS) pose[k.key] = base[k.key];
      continue;
    }
    if (holdsOnly) continue;
    const levels = levelsFor(i);
    // seed from the previous frame's solution, then refine locally: the passage is
    // continuous and the free channels are the only thing that moves in it.
    const prev = poses[name(i - 1)];
    if (prev && i > passage.from) for (const key of passage.free) pose[key] = prev[key];
    for (const level of [1, 2, 3]) {
      for (let round = 0; round < 2; round++) {
        for (const key of passage.free) {
          const k = KNOBS.find((q) => q.key === key)!;
          applyPose(p, pose);
          let best = score(p, levels[level]).value;
          let bestV = pose[key];
          const radius = level === 1 ? 45 : level === 2 ? 12 : 4;
          for (let s = -6; s <= 6; s++) {
            if (s === 0) continue;
            pose[key] = Math.max(k.min, Math.min(k.max, bestV + (s * radius) / 6));
            applyPose(p, pose);
            const v = score(p, levels[level]).value;
            if (v < best) {
              best = v;
              bestV = pose[key];
            }
          }
          pose[key] = bestV;
        }
      }
    }
  }
  console.log(
    `f${passage.from}-f${passage.to}: ${passage.free.length} free channel(s) ` +
      `(${passage.free.join(', ') || 'none — held'}), base f${passage.base} — ${passage.why}`,
  );
}

// f22 -> f23 is the one pair the reference moves across, and it moves across it by
// ONE pixel. `check` reads stillness categorically in both directions, so this pair
// has to move — and by little enough that `mine <= 4*theirs + CHANGE_EXCESS` still
// holds against theirs = 1, i.e. under about 25 changed pixels. The magnitude is
// therefore calibrated against the render rather than picked: 0.6 deg of head
// rotation measured 806 px.
const f22 = poses[name(22)];
const f23 = poses[name(23)];
if (f22 && f23) {
  for (const k of KNOBS) f23[k.key] = f22[k.key];
  let lo = 0;
  let hi = 0.6;
  let chosen = 0;
  for (let it = 0; it < 12; it++) {
    const mid = (lo + hi) / 2;
    f23['head.rotate'] = f22['head.rotate'] + mid;
    const n = renderedChange(22, 23);
    if (n >= 1 && n <= 18) {
      chosen = mid;
      break;
    }
    if (n > 18) hi = mid;
    else lo = mid;
    chosen = mid;
  }
  f23['head.rotate'] = f22['head.rotate'] + chosen;
  console.log(
    `f22->f23: head.rotate nudged by ${chosen.toFixed(4)} deg, calibrated to ${renderedChange(22, 23)} changed pixel(s)`,
  );
}
for (let i = 24; i <= 26; i++) {
  const pose = poses[name(i)];
  if (pose && f23) for (const k of KNOBS) pose[k.key] = f23[k.key];
}

writeFileSync(file, JSON.stringify(poses, null, 1));
console.log(`-> ${file}`);
