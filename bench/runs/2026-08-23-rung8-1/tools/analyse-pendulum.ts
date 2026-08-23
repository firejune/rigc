/**
 * What the pendulum's six numbers per frame say about its structure.
 *
 * Three questions the rig has to answer before a key is written:
 *   1. is the first bead rigid in the discus's own frame? (⇒ the chain hangs off
 *      the discus at a fixed local offset, and the discus is its driver)
 *   2. are the four bead-to-bead spacings constant? (⇒ nothing deforms)
 *   3. does the eyelet turn on a joint of its own, or ride the last link?
 *
 * `bun bench/runs/2026-08-23-rung8-1/tools/analyse-pendulum.ts [12|24]`
 */
import { measurePendulum, type PendulumFrame } from './measure-pendulum.ts';

const D = 180 / Math.PI;

function stats(v: number[]): string {
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
  return `mean ${mean.toFixed(2)}  sd ${sd.toFixed(2)}  range ${Math.min(...v).toFixed(2)}–${Math.max(...v).toFixed(2)}`;
}

function wrap(deg: number): number {
  let d = deg;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

export function linkAngles(f: PendulumFrame): number[] {
  // Screen-space direction of each link, in degrees, y up (so the numbers read
  // like a rig's rotations rather than like image coordinates).
  const out: number[] = [];
  for (let i = 0; i < f.beads.length - 1; i++) {
    const dx = f.beads[i + 1].cx - f.beads[i].cx;
    const dy = -(f.beads[i + 1].cy - f.beads[i].cy);
    out.push(Math.atan2(dy, dx) * D);
  }
  return out;
}

if (import.meta.main) {
  const fps = process.argv[2] === '24' ? 24 : 12;
  const frames = measurePendulum(fps === 24 ? 'follow-through@24fps' : 'follow-through');

  // 1 — the first bead in the discus's local frame.
  const localX: number[] = [];
  const localY: number[] = [];
  for (const f of frames) {
    const dx = f.beads[0].cx - f.cx;
    const dy = f.beads[0].cy - f.cy;
    const t = (-f.angle * Math.PI) / 180; // undo the discus's screen rotation
    localX.push(dx * Math.cos(t) - dy * Math.sin(t));
    localY.push(dx * Math.sin(t) + dy * Math.cos(t));
  }
  console.log(`bead 1 in the discus's frame:  x ${stats(localX)}`);
  console.log(`                               y ${stats(localY)}`);

  // 2 — the spacings, again, plus the turn at each joint.
  const dirs = frames.map(linkAngles);
  for (let i = 0; i < 4; i++) {
    console.log(`link ${i + 1} direction  ${stats(dirs.map((d) => d[i]))}`);
  }
  console.log('');
  for (let i = 0; i < 3; i++) {
    const turn = dirs.map((d) => wrap(d[i + 1] - d[i]));
    console.log(`turn at joint ${i + 2} (link ${i + 1}→${i + 2})  ${stats(turn)}`);
  }
  const totalBend = frames.map((_, k) => {
    const d = dirs[k];
    return Math.abs(wrap(d[1] - d[0])) + Math.abs(wrap(d[2] - d[1])) + Math.abs(wrap(d[3] - d[2]));
  });
  console.log(`\ntotal bend  ${stats(totalBend)}`);
  console.log(
    `  f0 ${totalBend[0].toFixed(1)}°  peak ${Math.max(...totalBend).toFixed(1)}° at f${totalBend.indexOf(Math.max(...totalBend))}`,
  );

  // 3 — the discus's own turn relative to link 1, and link 4's to the eyelet.
  const hang = frames.map((f, k) => wrap(dirs[k][0] - -f.angle));
  console.log(`\ndiscus→link1 relative angle  ${stats(hang)}`);

  // 4 — the lag, per axis, on velocities.
  const vx = (get: (f: PendulumFrame) => number): number[] =>
    frames.slice(1).map((f, i) => get(f) - get(frames[i]));
  const dxC = vx((f) => f.cx);
  const dyC = vx((f) => f.cy);
  const dxE = vx((f) => f.beads[4].cx);
  const dyE = vx((f) => f.beads[4].cy);
  const corr = (a: number[], b: number[], lag: number): number => {
    const n = Math.min(a.length, b.length - lag);
    let sa = 0;
    let sb = 0;
    for (let i = 0; i < n; i++) {
      sa += a[i];
      sb += b[i + lag];
    }
    sa /= n;
    sb /= n;
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < n; i++) {
      const u = a[i] - sa;
      const v = b[i + lag] - sb;
      num += u * v;
      da += u * u;
      db += v * v;
    }
    return num / Math.sqrt(da * db);
  };
  const maxLag = fps === 24 ? 12 : 6;
  console.log('\nlag  (discus velocity vs eyelet velocity, per axis)');
  for (let l = 0; l <= maxLag; l++) {
    console.log(`  lag ${String(l).padStart(2)}   x r=${corr(dxC, dxE, l).toFixed(3)}   y r=${corr(dyC, dyE, l).toFixed(3)}`);
  }
}
