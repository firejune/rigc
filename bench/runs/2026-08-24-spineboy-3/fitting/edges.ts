/**
 * Edge-guided refinement: fit the pose against the picture AND against the
 * reference frame's own drawn box.
 *
 * Why this and not more of the same objective. `check` decides the framing PER
 * SET, and a set whose own pixels land in frames.json's box is measured in that
 * box exactly, where a set that misses it is measured in one shared fitted box
 * (§9.2, and the guide's own figures put the gap at 15-25 MAE). Four sets of
 * this shot miss it - death, hit, run, shoot - and work/probe-extent.ts says
 * why in one line: the lying and planted poses reach 4-13 px BELOW the
 * reference's lowest drawn row, and death's boots stop up to 12 px short of the
 * reference's rightmost column. A pose can be a good picture and still put a
 * limb outside the shot's extent, because a few pixels of overshoot on a large
 * silhouette are cheap in a mean.
 *
 * The reference's own per-frame box is a measurement of the committed frames,
 * so it is an input a run may use. It is added as a penalty rather than a
 * constraint: §9.2's warning that extent is not alignment cuts here too, and a
 * weight is a way of saying "worth about this much" rather than "at any cost".
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { Fitter, refFrame, cropPlate, knobsFor, type Pose } from './fit.ts';
import { ink } from './harness.ts';
import { SETS, MUZZLE, FIST } from './fitrun.ts';
import type { Plate } from '../tools/plate.ts';

const BG = 232;
function boxOf(p: Plate): [number, number, number, number] | null {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
    const i = (y * p.width + x) * 4;
    if (Math.abs(p.data[i] - BG) > 8 || Math.abs(p.data[i+1] - BG) > 8 || Math.abs(p.data[i+2] - BG) > 8) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}

export function edgeFit(anim: string, W: number, only?: Set<number>): { before: number; after: number; box: number[] } {
  const n = SETS[anim];
  const file = `work/placements-${anim}.json`;
  const store = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<number, Pose>>;
  const poses = store[anim];
  const f = new Fitter();
  const frames: Plate[] = [];
  let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
  for (let i = 0; i < n; i++) {
    const p = refFrame(anim, i); frames.push(p);
    const b = boxOf(p)!;
    bx0 = Math.min(bx0, b[0]); by0 = Math.min(by0, b[1]); bx1 = Math.max(bx1, b[2]); by1 = Math.max(by1, b[3]);
  }
  const PAD = 26;
  const X = Math.max(0, bx0 - PAD), Y = Math.max(0, by0 - PAD);
  const W2 = Math.min(384, bx1 + PAD) - X, H = Math.min(367, by1 + PAD) - Y;
  const view = f.window(X, Y, W2, H);
  const crops = frames.map((p) => cropPlate(p, X, Y, W2, H));
  const refBox = crops.map((c) => boxOf(c)!);
  const refInk = crops.map((c) => ink(c));
  f.rig.setAttachment('front-fist', FIST[anim] ?? 'front-fist-open');
  let armed = -2;
  const arm = (i: number) => { const w = anim === 'shoot' ? (MUZZLE[i] ?? null) : null; if (armed !== i) { f.rig.setAttachment('muzzle', w); armed = i; } };
  const plain = (pose: Pose, i: number) => { arm(i); return f.costGuarded(pose, view, crops[i], 1, refInk[i]); };
  const total = (pose: Pose, i: number) => {
    const c = plain(pose, i);
    f.rig.apply(pose);
    const b = boxOf(f.rig.render(view));
    if (!b) return c + 40;
    const r = refBox[i];
    return c + W * (Math.abs(b[0] - r[0]) + Math.abs(b[1] - r[1]) + Math.abs(b[2] - r[2]) + Math.abs(b[3] - r[3]));
  };

  const before = Array.from({ length: n }, (_, i) => plain(poses[i], i)).reduce((a, b) => a + b, 0) / n;
  for (let i = 0; i < n; i++) {
    if (only && !only.has(i)) continue;
    const pose = poses[i];
    let cur = total(pose, i);
    for (const st of [8, 4, 2, 1, 0.5, 0.25]) {
      for (const kn of knobsFor(pose, false)) {
        const slot = (pose[kn.bone] ??= {});
        const c0 = slot[kn.prop] ?? 0;
        let bestV = c0;
        for (const v of [c0 - st, c0 + st, c0 - st / 2, c0 + st / 2]) {
          slot[kn.prop] = v; const c = total(pose, i);
          if (c < cur - 1e-9) { cur = c; bestV = v; }
        }
        slot[kn.prop] = bestV;
      }
    }
  }
  const after = Array.from({ length: n }, (_, i) => plain(poses[i], i)).reduce((a, b) => a + b, 0) / n;
  let e = 0;
  for (let i = 0; i < n; i++) {
    plain(poses[i], i); f.rig.apply(poses[i]);
    const b = boxOf(f.rig.render(view))!, r = refBox[i];
    e += Math.abs(b[0]-r[0]) + Math.abs(b[1]-r[1]) + Math.abs(b[2]-r[2]) + Math.abs(b[3]-r[3]);
  }
  store[anim] = poses;
  writeFileSync(file, JSON.stringify(store));
  return { before, after, box: [e / n] };
}

if (import.meta.main) {
  const W = Number(process.env.W ?? 0.05);
  for (const anim of process.argv.slice(2)) {
    const r = edgeFit(anim, W);
    console.log(`${anim.padEnd(6)} W=${W}  picture cost ${r.before.toFixed(3)} -> ${r.after.toFixed(3)}   mean box error ${r.box[0].toFixed(2)} px over 4 edges`);
  }
}
