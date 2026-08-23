/**
 * Fit the rig — as a hierarchy — to every frame of one animation.
 *
 * The free parameters are exactly what the motion spec can hold: one translate
 * on `hip` and one local rotation delta per bone. That is deliberate. A free
 * per-part fit has three times as many handles and no skeleton, and on this
 * character it comes apart (see LOOP §5): the gun points down, the far arm
 * floats off the body, and every one of those frames still scores better than
 * the pose that is actually there. A hierarchy cannot make that mistake,
 * because a limb has nowhere to go that is not on the end of its parent.
 *
 *   bun … tools/fitanim.ts <setup.json> <set> <frames> <out.json> [seed.json] [seedIndex]
 */
import { writeFileSync } from 'node:fs';
import { build, pose, emptyPose, type Pose, type Skeleton } from './skel.ts';
import { TREE, DRAW_ORDER, loadSetup } from './model.ts';
import { renderPlacements, refFrame, sad, subject, viewportOf, cropViewport, cropPlate } from './lib.ts';

const POS_PRIOR = 6; // objective units per world unit of drift from the previous frame
const ROT_PRIOR = 25; // per degree — a tie-breaker only, an order under a real improvement
/**
 * ⭐ A minimum-motion prior, and it is not cosmetic.
 *
 * `hip` and `torso` share a joint, so turning one and counter-turning the other
 * is nearly free: the descent walked `walk/f3` to hip **+181°** against torso
 * **−184°**, a pair whose *picture* is right and whose numbers are nonsense —
 * and a key series that swings 180° between two frames does not interpolate, it
 * spins. An L1 cost on every delta pins those directions, and it is also what a
 * rig means: do not move what the shot does not move.
 */
const ABS_PRIOR = 45; // per degree of local rotation away from the setup pose

export const MOVERS = [
  'hip',
  'torso',
  'neck',
  'head',
  'front-upper-arm',
  'front-bracer',
  'front-fist',
  'rear-upper-arm',
  'rear-bracer',
  'gun',
  'front-thigh',
  'front-shin',
  'front-foot',
  'rear-thigh',
  'rear-shin',
  'rear-foot',
];

/**
 * Collapse the one exact gauge this tree has.
 *
 * `hip` carries no attachment and every bone that moves hangs under it, so
 * "turn the hip by δ and turn each of its children back by δ" changes **no
 * pixel**. A coordinate descent walks that direction for free — it zig-zags up
 * a curved valley one coordinate at a time — and this run watched it reach
 * hip **+181°** against torso **−184°** on `walk/f3`. The picture was right and
 * the numbers were unusable: a rotate series that swings 180° between two keys
 * does not interpolate, it spins the figure.
 *
 * The fix is exact rather than a penalty. Minimising |hip+δ| + Σ|childᶜ−δ| is a
 * one-dimensional L1 problem whose optimum is the median of the four values, so
 * the gauge is removed outright, at every level of the descent, with the pose
 * unchanged.
 */
export function gauge(p: Pose, kids: string[]): void {
  const xs = [-(p.rot.hip ?? 0), ...kids.map((k) => p.rot[k] ?? 0)].sort((a, b) => a - b);
  const d = (xs[(xs.length - 1) >> 1] + xs[xs.length >> 1]) / 2;
  p.rot.hip = (p.rot.hip ?? 0) + d;
  for (const k of kids) p.rot[k] = (p.rot[k] ?? 0) - d;
}

export function fitFrame(
  s: Skeleton,
  start: Pose,
  ref: ReturnType<typeof refFrame>,
  levels = 7,
  moveBones: string[] = ['hip'],
): { pose: Pose; sad: number; evals: number } {
  const full = viewportOf('ess');
  const mv: Record<string, [number, number]> = {};
  for (const b of moveBones) mv[b] = [...(start.move[b] ?? [0, 0])] as [number, number];
  const cur: Pose = { rot: { ...start.rot }, move: mv, images: start.images };
  const refBox = subject(ref);
  const c0 = subject(renderPlacements(pose(s, cur), full));
  const x0 = Math.max(0, Math.min(refBox.minX, c0.minX) - 30);
  const y0 = Math.max(0, Math.min(refBox.minY, c0.minY) - 30);
  const x1 = Math.min(full.width - 1, Math.max(refBox.maxX, c0.maxX) + 30);
  const y1 = Math.min(full.height - 1, Math.max(refBox.maxY, c0.maxY) + 30);
  const vp = cropViewport(full, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  const target = cropPlate(ref, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  const priorMove: Record<string, [number, number]> = {};
  for (const b of moveBones) priorMove[b] = [...(start.move[b] ?? [0, 0])] as [number, number];
  const prior: Pose = { rot: { ...start.rot }, move: priorMove };

  let evals = 0;
  const cost = (): number => {
    evals++;
    let c = sad(renderPlacements(pose(s, cur), vp), target);
    for (const b of MOVERS) {
      c += ROT_PRIOR * Math.abs((cur.rot[b] ?? 0) - (prior.rot[b] ?? 0));
      c += ABS_PRIOR * Math.abs(cur.rot[b] ?? 0);
    }
    for (const b of moveBones) {
      const m = cur.move[b]!;
      const pm = prior.move[b]!;
      c += POS_PRIOR * (Math.abs(m[0] - pm[0]) + Math.abs(m[1] - pm[1]));
    }
    return c;
  };

  const children = new Map<string, string[]>();
  for (const b of s.bones) if (b.parent) children.set(b.parent, [...(children.get(b.parent) ?? []), b.name]);

  const hipKids = s.bones.filter((b) => b.parent === 'hip').map((b) => b.name);
  let best = cost();
  const posSteps = [40, 16, 6, 2.5, 1, 0.4, 0.15];
  const rotSteps = [12, 5, 2, 0.8, 0.3, 0.12, 0.05];
  for (let level = 0; level < levels; level++) {
    gauge(cur, hipKids);
    best = cost();
    for (let pass = 0; pass < 8; pass++) {
      let moved = false;
      for (const b of moveBones) {
        for (let axis = 0; axis < 2; axis++) {
          for (const dir of [1, -1]) {
            let any = false;
            for (;;) {
              const before = cur.move[b]![axis];
              cur.move[b]![axis] = before + dir * posSteps[level];
              const c = cost();
              if (c < best - 1e-9) {
                best = c;
                moved = true;
                any = true;
              } else {
                cur.move[b]![axis] = before;
                break;
              }
            }
            if (any) break;
          }
        }
      }
      // Two bases, and the second is what makes the descent work on a chain.
      // Turning a bone alone swings everything below it, so the move that would
      // help — "swing this joint but leave the hand pointing where it points" —
      // is not reachable one coordinate at a time. `kids` supplies it: add to a
      // bone and take the same amount off each of its children, which moves the
      // joint and holds the subtree's world orientation.
      for (const b of MOVERS) {
        for (const withKids of [false, true]) {
          const kids = withKids ? (children.get(b) ?? []) : [];
          if (withKids && kids.length === 0) continue;
          for (const dir of [1, -1]) {
            let any = false;
            for (;;) {
              const before = cur.rot[b] ?? 0;
              const d = dir * rotSteps[level];
              cur.rot[b] = before + d;
              for (const k of kids) cur.rot[k] = (cur.rot[k] ?? 0) - d;
              const c = cost();
              if (c < best - 1e-9) {
                best = c;
                moved = true;
                any = true;
              } else {
                cur.rot[b] = before;
                for (const k of kids) cur.rot[k] = (cur.rot[k] ?? 0) + d;
                break;
              }
            }
            if (any) break;
          }
        }
      }
      if (!moved) break;
    }
  }
  gauge(cur, hipKids);
  const plain = sad(renderPlacements(pose(s, cur), vp), target);
  return { pose: cur, sad: plain, evals };
}

if (import.meta.main) {
  const [setupFile, set, nArg, out, seedFile, seedIdx] = process.argv.slice(2);
  const setup = await loadSetup(setupFile);
  const s = build(TREE, setup, DRAW_ORDER.filter((d) => setup.some((p) => p.part === d)));
  let cur = emptyPose(s);
  if (seedFile) {
    const doc = JSON.parse(await Bun.file(seedFile).text());
    const f = doc.frames.find((q: { index: number }) => q.index === Number(seedIdx ?? 0));
    cur = { rot: { ...f.pose.rot }, move: Object.fromEntries(Object.entries(f.pose.move as Record<string, [number, number]>).map(([k, v]) => [k, [...v] as [number, number]])) };
  }
  const frames: { index: number; sad: number; pose: Pose }[] = [];
  for (let i = 0; i < Number(nArg); i++) {
    const r = fitFrame(s, cur, refFrame('ess', set, i));
    cur = r.pose;
    frames.push({
      index: i,
      sad: r.sad,
      pose: {
        rot: Object.fromEntries(Object.entries(r.pose.rot).map(([k, v]) => [k, +v.toFixed(4)])),
        move: Object.fromEntries(Object.entries(r.pose.move).map(([k, v]) => [k, v.map((q) => +q.toFixed(4)) as [number, number]])),
      },
    });
    console.log(`${set} f${i}: sad ${r.sad.toFixed(0)}  evals ${r.evals}`);
  }
  writeFileSync(out, JSON.stringify({ set, frames }, null, 1));
  console.log(`wrote ${out}`);
}
