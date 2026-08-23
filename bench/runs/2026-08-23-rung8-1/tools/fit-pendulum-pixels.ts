/**
 * The pendulum, checked and then polished against the pixels.
 *
 * Stage 1 sweeps the one structural number the beads cannot give — how far
 * `chain-1`'s own bead sits below the point the chain hangs from, which the
 * discus covers on every frame — by rendering the whole shot at each candidate
 * and reading the mean absolute difference against the reference frames.
 *
 * Stage 2 polishes the eight pose numbers of each frame by local search from the
 * geometric solution, which is where any bias in the bead estimator gets paid
 * back: the same rasteriser draws both sides, so only the difference is read.
 *
 * `bun bench/runs/2026-08-23-rung8-1/tools/fit-pendulum-pixels.ts sweep|polish [--out file]`
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Plate } from '../../../../tools/plate.ts';
import { loadSet, sidecar } from './frames.ts';
import { measurePendulum } from './measure-pendulum.ts';
import { observe, fitAll, type Structure, type Pose } from './fit-pendulum-chain.ts';
import { pendulumRig, pendulumStatic, type PendulumStructure } from './pendulum-spec.ts';
import { backgroundOf, compile, mae, poser, viewportOf, windowOf } from './harness.ts';

const FPS = 24;
const DIR = 'follow-through@24fps';

export interface FrameFit {
  index: number;
  /** discus translation from setup, world units */
  dx: number;
  dy: number;
  /** discus rotation, degrees */
  rot: number;
  /** local rotations of chain1..4 and the eyelet, degrees off setup */
  link: number[];
  mae: number;
}

function structureOf(fit: Structure, discus: [number, number], h1: number): PendulumStructure {
  return {
    pivot: [fit.pivotX, fit.pivotY],
    L: fit.L,
    h1,
    discus,
    // Comfortably contains the setup pose: the plate is 687 wide and the chain
    // is a little under 1,000 units long below the hang point.
    box: { x: -400, y: -1100, width: 800, height: 1200 },
  };
}

function wrap(deg: number): number {
  let d = deg;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

/** The geometric solution, expressed as the rig's own local rotations. */
export function localsOf(poses: Pose[]): { rot: number; link: number[] }[] {
  return poses.map((p) => ({
    rot: p.rotation,
    link: [
      wrap(p.dir[0] - p.rotation + 90),
      wrap(p.dir[1] - p.dir[0]),
      wrap(p.dir[2] - p.dir[1]),
      wrap(p.dir[3] - p.dir[2]),
      0,
    ],
  }));
}

const BONES = ['chain1', 'chain2', 'chain3', 'chain4', 'eyelet'];

/** discus x, discus y, discus rotation, and the four link rotations. The eyelet's is not one of them. */
const PARAMS = 7;

function renderAll(
  data: ReturnType<typeof compile>,
  view: ReturnType<typeof viewportOf>,
  bg: ReturnType<typeof backgroundOf>,
  setup: { x: number; y: number },
  fits: FrameFit[],
): Plate[] {
  const p = poser(data.posable.data, view, data.posable.pages, bg);
  return fits.map((f) => {
    p.reset();
    p.set('discus', 'x', setup.x + f.dx);
    p.set('discus', 'y', setup.y + f.dy);
    p.set('discus', 'rotation', f.rot);
    BONES.forEach((b, i) => p.set(b, 'rotation', (b === 'chain1' ? -90 : 0) + f.link[i]));
    return p.render();
  });
}

if (import.meta.main) {
  const mode = process.argv[2] ?? 'sweep';
  const side = sidecar('pendulum');
  const view = viewportOf(side);
  const bg = backgroundOf('pendulum');
  const reference = loadSet('pendulum', DIR);
  const measured = measurePendulum(DIR);
  const obs = observe(measured, side);
  const chain = fitAll(obs, { pivotX: 0, pivotY: 0, L: [305, 238, 209, 210], h: [0, 0, 0, 0] });
  const locals = localsOf(chain.poses);
  const setupWorld: [number, number] = [obs[0].cx, obs[0].cy];

  const seed: FrameFit[] = obs.map((o, i) => ({
    index: o.index,
    dx: o.cx - setupWorld[0],
    dy: o.cy - setupWorld[1],
    rot: locals[i].rot,
    link: locals[i].link.slice(),
    mae: 0,
  }));

  const tmp = mkdtempSync(join(tmpdir(), 'rung8-pend-'));
  const windows = reference.map((r) =>
    windowOf([r], bg, 12, side.viewport.pixelWidth, side.viewport.pixelHeight),
  );

  const evaluate = (h1: number, fits: FrameFit[]): number => {
    const built = compile(
      join(tmp, `h${Math.round(h1 * 10)}`),
      pendulumRig(structureOf(chain.structure, setupWorld, h1)),
      pendulumStatic(),
    );
    const mine = renderAll(built, view, bg, { x: setupWorld[0], y: setupWorld[1] }, fits);
    let total = 0;
    mine.forEach((m, i) => {
      const v = mae(m, reference[i], windows[i]).mae;
      fits[i].mae = v;
      total += v;
    });
    return total / mine.length;
  };

  if (mode === 'sweep') {
    console.log(`# chain-1's anchor, swept against ${reference.length} frames at ${FPS} fps`);
    console.log(`  (the geometric fit gives the rest: pivot ${chain.structure.pivotX.toFixed(1)}, ` +
      `${chain.structure.pivotY.toFixed(1)}; L ${chain.structure.L.map((v) => v.toFixed(1)).join(', ')})`);
    for (const h1 of [26, 28, 30, 32, 34]) {
      const fits = seed.map((s) => ({ ...s, link: s.link.slice() }));
      const m = evaluate(h1, fits);
      const worst = fits.slice().sort((a, b) => b.mae - a.mae).slice(0, 8);
      console.log(
        `  h1 = ${String(h1).padStart(3)} units (${(h1 * side.viewport.scale).toFixed(2)} px)   ` +
          `MAE ${m.toFixed(3)}  median ${fits.map((f) => f.mae).sort((a, b) => a - b)[Math.floor(fits.length / 2)].toFixed(2)}  ` +
          `worst ${worst.map((f) => `f${f.index}:${f.mae.toFixed(1)}`).join(' ')}`,
      );
    }
  } else {
    const h1 = Number(process.argv[process.argv.indexOf('--h1') + 1] || 18);
    const built = compile(
      join(tmp, 'polish'),
      pendulumRig(structureOf(chain.structure, setupWorld, h1)),
      pendulumStatic(),
    );
    const p = poser(built.posable.data, view, built.posable.pages, bg);
    const scratch = new Plate(side.viewport.pixelWidth, side.viewport.pixelHeight);
    const fits = seed.map((s) => ({ ...s, link: s.link.slice() }));
    const cost = (f: FrameFit, i: number): number => {
      p.reset();
      p.set('discus', 'x', setupWorld[0] + f.dx);
      p.set('discus', 'y', setupWorld[1] + f.dy);
      p.set('discus', 'rotation', f.rot);
      BONES.forEach((b, k) => p.set(b, 'rotation', (b === 'chain1' ? -90 : 0) + f.link[k]));
      p.renderInto(scratch, windows[i]);
      return mae(scratch, reference[i], windows[i]).mae;
    };
    let before = 0;
    let after = 0;
    for (let i = 0; i < fits.length; i++) {
      const f = fits[i];
      let best = cost(f, i);
      before += best;
      // translation in units, rotations in degrees. ⚠️ The eyelet's own rotation
      // is NOT fitted: run free it wandered −25°..+52° frame to frame with no
      // trend at all, which is what an unobservable parameter looks like when an
      // optimiser is allowed to spend it. A round disc in a ring cannot show its
      // own rotation, so it is left unauthored — see PARAMS below.
      let steps = [12, 12, 1.5, 1.5, 1.5, 1.5, 1.5];
      const get = (k: number): number => (k === 0 ? f.dx : k === 1 ? f.dy : k === 2 ? f.rot : f.link[k - 3]);
      const put = (k: number, v: number): void => {
        if (k === 0) f.dx = v;
        else if (k === 1) f.dy = v;
        else if (k === 2) f.rot = v;
        else f.link[k - 3] = v;
      };
      for (let round = 0; round < 40; round++) {
        let improved = false;
        for (let k = 0; k < PARAMS; k++) {
          for (const sign of [1, -1]) {
            const old = get(k);
            put(k, old + sign * steps[k]);
            const c = cost(f, i);
            if (c < best - 1e-6) {
              best = c;
              improved = true;
              break;
            }
            put(k, old);
          }
        }
        if (!improved) {
          steps = steps.map((s) => s / 2);
          if (steps[2] < 0.02) break;
        }
      }
      f.mae = best;
      after += best;
      if (i % 10 === 0) process.stderr.write(`  f${i} ${best.toFixed(2)}\n`);
    }
    console.log(`polish: mean MAE ${(before / fits.length).toFixed(3)} → ${(after / fits.length).toFixed(3)}`);
    const outAt = process.argv.indexOf('--out');
    if (outAt >= 0) {
      writeFileSync(
        process.argv[outAt + 1],
        JSON.stringify({ structure: chain.structure, h1, setupWorld, fits }, null, 1),
      );
    }
  }
}
