/**
 * The half-frames — the samples the 12 fps set cannot show.
 *
 * `check` compares a stills-plus-sheet set tile by tile, so the `@24fps` sheets
 * are the only place a candidate's curves are measured BETWEEN two 12 fps frames.
 * The fast parts of `ball-catch` happen entirely in there: the saucer stands
 * upright and comes back twice inside half a second, and read at 12 fps alone a
 * modest tilt looks the same as a full turn.
 *
 * So each odd 24 fps sample starts from a smooth (Catmull-Rom) interpolation of
 * its 12 fps neighbours — the prior a curve would give it — and is then fitted
 * against that sample's own tile. A tile is a third of a frame's scale, so the
 * fit is only accepted when it beats the prior by more than the tile's own noise;
 * otherwise the smooth prior stands and no zigzag is invented.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { sidecar, refFrame, sheetTiles, Scratch, scoreKnobs, type Knobs, type RefFrame } from './fitlib.ts';
import { loadRig } from './fitrun.ts';
import { viewportOfSize, type Viewport } from '../../../../src/render.ts';

const RUN = 'bench/runs/2026-08-26-rung4-1';
const U = 11.507375;
const KEYS: (keyof Knobs)[] = ['px', 'py', 'prot', 'c1', 'c2', 'c3', 'c4', 'bx', 'by', 'brot', 'bsx', 'bsy', 'srot', 'balpha', 'lalpha'];

/** Catmull-Rom at the midpoint of p1..p2 — the smooth prior for an odd sample. */
const mid = (p0: number, p1: number, p2: number, p3: number): number =>
  (-p0 + 9 * p1 + 9 * p2 - p3) / 16;

export function tileViewport(k = 3): Viewport {
  const s = sidecar();
  const v = s.viewport;
  const tw = Math.round(v.pixelWidth / k) - 0; // 768/3 = 256, the sheet's own tile width
  const th = 211;
  return viewportOfSize(v.x, v.y, v.width, v.height, v.scale / k, tw, th);
}

if (import.meta.main) {
  const setName = process.argv[2];
  const s = sidecar();
  const set = s.sets.find((x) => x.dir === `${setName}@24fps`)!;
  const base = JSON.parse(readFileSync(`${RUN}/fit/${setName}.poses.json`, 'utf8')) as { poses: Knobs[] };
  // An angle has no branch, and a Catmull-Rom prior through a series that jumps
  // 360° reads that jump as a violent move. Unwrap before interpolating.
  for (const key of ['prot', 'c1', 'c2', 'c3', 'c4', 'brot', 'srot'] as (keyof Knobs)[]) {
    for (let i = 1; i < base.poses.length; i++) {
      let v = base.poses[i][key] as number;
      const prev = base.poses[i - 1][key] as number;
      while (v - prev > 180) v -= 360;
      while (v - prev < -180) v += 360;
      (base.poses[i][key] as number) = v;
    }
  }
  const n12 = base.poses.length;
  const n24 = set.sampled;
  if (n24 !== 2 * n12 - 1) throw new Error(`${n24} tiles against ${n12} frames`);
  const ball = setName === 'ball-catch';

  const poses: Knobs[] = [];
  for (let i = 0; i < n24; i++) {
    if (i % 2 === 0) { poses.push({ ...base.poses[i / 2] }); continue; }
    const a = (i - 1) / 2;
    const p1 = base.poses[a], p2 = base.poses[a + 1];
    // both short shots loop exactly (f0 is bit-identical to f16), so the prior at
    // either end reads round the seam rather than clamping against it
    const loops = setName !== 'ball-catch';
    const at = (q: number) => base.poses[loops ? ((q % (n12 - 1)) + (n12 - 1)) % (n12 - 1) : Math.max(0, Math.min(n12 - 1, q))];
    const p0 = at(a - 1), p3 = at(a + 2);
    const k = { ...p1 } as Knobs;
    for (const key of KEYS) (k[key] as number) = mid(p0[key] as number, p1[key] as number, p2[key] as number, p3[key] as number);
    k.ball = ball;
    poses.push(k);
  }

  const tiles: RefFrame[] = sheetTiles(`bench/reference/4-wave-principle/${setName}@24fps/contact.png`, n24, 8, 0, 0);
  const v = tileViewport(3);
  if (v.width !== tiles[0].width || v.height !== tiles[0].height) {
    throw new Error(`tile ${tiles[0].width}x${tiles[0].height} against viewport ${v.width}x${v.height}`);
  }
  const scratch = new Scratch(v.width, v.height);
  const rig = loadRig();

  // The committed first and last stills are full frames: check measures those at
  // frame scale, and they are already in the 12 fps fit.
  let moved = 0;
  const report: string[] = [];
  for (let i = 1; i < n24; i += 2) {
    const ref = tiles[i];
    if (ref.inkCount === 0) continue;
    let best = { ...poses[i] };
    let bestScore = scoreKnobs(scratch, rig, v, ref, best);
    const prior = bestScore;
    // 🚨 **A half-frame is NOT between its neighbours, and that is the whole
    // point of the sheet.** The reach was first tied to each channel's own local
    // 12 fps step, which is exactly wrong at a bounce: between `ball-catch`
    // frames 84 and 85 the ball's y moves 5.6 px, so a step-scaled reach searched
    // ±9 px — while the truth, the CONTACT itself, sits 40 px below both
    // neighbours. The sheet's tile 169 reads the ball at (597.8, 480.7) where
    // both 12 fps frames have it near y 440: the ball comes down, hits and leaves,
    // entirely inside one twelfth of a second. That is the passage the brief says
    // to read off the sheet, and a reach derived from the frames either side
    // cannot see it by construction. So the floor is generous and the adaptive
    // term only widens it. (§10.3 quotes Spine's own Bounce preset for exactly
    // this shape.)
    const a2 = (i - 1) / 2;
    const step12 = (key: keyof Knobs) => Math.abs((base.poses[a2 + 1][key] as number) - (base.poses[a2][key] as number));
    const reach = (key: keyof Knobs, floor: number) => Math.max(floor, 0.9 * step12(key));
    const steps: { name: keyof Knobs; span: number; step: number }[] = [
      { name: 'px', span: reach('px', 26 * U), step: 0 }, { name: 'py', span: reach('py', 26 * U), step: 0 },
      { name: 'prot', span: reach('prot', 40), step: 0 },
      { name: 'c1', span: reach('c1', 30), step: 0 }, { name: 'c2', span: reach('c2', 30), step: 0 },
      { name: 'c3', span: reach('c3', 32), step: 0 }, { name: 'c4', span: reach('c4', 36), step: 0 },
    ];
    if (ball) {
      steps.push({ name: 'bx', span: reach('bx', 45 * U), step: 0 }, { name: 'by', span: reach('by', 45 * U), step: 0 });
      steps.push({ name: 'bsx', span: reach('bsx', 0.35), step: 0 }, { name: 'bsy', span: reach('bsy', 0.35), step: 0 });
      steps.push({ name: 'brot', span: reach('brot', 45), step: 0 }, { name: 'srot', span: reach('srot', 45), step: 0 });
    }
    for (const st of steps) st.step = st.span / 7;
    for (let round = 0; round < 4; round++) {
      const shrink = Math.pow(0.42, round);
      for (const st of steps) {
        const centre = best[st.name] as number;
        const span = st.span * shrink, step = st.step * shrink;
        const cnt = Math.round(span / step);
        for (let q = -cnt; q <= cnt; q++) {
          if (q === 0) continue;
          const trial = { ...best, [st.name]: centre + q * step } as Knobs;
          const sc = scoreKnobs(scratch, rig, v, ref, trial);
          if (sc < bestScore) { bestScore = sc; best = trial; }
        }
      }
    }
    // a tile is a third of a frame's scale, so only a gain past the tile's own
    // noise is a finding rather than a fit chasing resampling
    const gain = (prior - bestScore) / ref.inkCost;
    if (gain > 0.025) { poses[i] = best; moved++; report.push(`f${String(i).padStart(4, '0')} gain ${(gain * 100).toFixed(1)}%`); }
  }
  writeFileSync(`${RUN}/fit/${setName}.half.json`, JSON.stringify({ set: setName, fps: 24, poses }, null, 1));
  console.log(`${setName}: ${moved} of ${Math.floor(n24 / 2)} half-frames moved off the smooth prior`);
  console.log(report.slice(0, 40).join('  '));
}
