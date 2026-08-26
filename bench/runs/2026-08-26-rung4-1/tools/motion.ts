/**
 * Write the rig and motion specs from the fitted series.
 *
 * Two passes over the easings, per AUTHORING.md §10.4's 🚨: pass A fits every
 * span's handles freely and exists only to DISCOVER which shapes the shot uses;
 * those are clustered into the table; pass B re-plans every timeline under the
 * table it will actually write. Fitting free handles and substituting the
 * nearest named shape afterwards buys a key count at one tolerance and ships it
 * at another.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { loadSeries, tidy, snapHolds, planTimeline, tolFor, TOL_PX, planResidual, type Series } from './emit.ts';
import { HX1, HX2, isLinear, type Span } from './plan.ts';

const RUN = 'bench/runs/2026-08-26-rung4-1';
const SETS = [
  { dir: 'ball-catch', anim: 'ball-catch', loop: false, ball: true },
  { dir: 'wave-by-hand', anim: 'wave-by-hand', loop: true, ball: false },
  { dir: 'wave-offset', anim: 'wave-offset', loop: true, ball: false },
];

interface Plan { channels: string[]; spans: Span[]; series: number[][] }

function timelinesOf(s: Series, ball: boolean, table: [number, number][], setup: Setup, n: number): Record<string, Plan> {
  const out: Record<string, Plan> = {};
  const add = (id: string, channels: string[]) => {
    const p = planTimeline(s, channels, TOL_PX, table);
    out[id] = { channels, ...p };
  };
  // the platform's y is the setup y through both short shots, so those get a
  // single-axis timeline rather than a paired one whose other channel is flat
  const flat = (c: string, v: number) => s[c].every((x) => Math.abs(x - v) <= tolFor(c, TOL_PX));
  if (flat('py', setup.platY)) add('platform|translatex', ['px']);
  else add('platform|translate', ['px', 'py']);
  if (!flat('prot', 0)) add('platform|rotate', ['prot']);
  for (const [bone, ch] of [['chain-1', 'c1'], ['chain-2', 'c2'], ['chain-3', 'c3'], ['chain-4', 'c4']] as const) {
    add(`${bone}|rotate`, [ch]);
  }
  if (ball) {
    add('basket-lambertian|translate', ['bx', 'by']);
    if (!flat('brot', 0)) add('basket-lambertian|rotate', ['brot']);
    if (!(flat('bsx', 1) && flat('bsy', 1))) add('basket-lambertian|scale', ['bsx', 'bsy']);
    add('basket-ball|rotate', ['srot']);
    if (!flat('balpha', 1)) add('basket-ball|rgba', ['balpha']);
  }
  void n;
  return out;
}

// ---------------------------------------------------------------------------

interface Setup { platX: number; platY: number; ballX: number; ballY: number; lalpha: number }

function median(v: number[]): number { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }

function kmeans(pts: [number, number][], k: number): [number, number][] {
  if (pts.length === 0) return [[0, 1]];
  const uniq = [...new Map(pts.map((p) => [`${p[0].toFixed(2)},${p[1].toFixed(2)}`, p])).values()];
  if (uniq.length <= k) return uniq;
  // seed on a spread: sort by (hy1 + hy2) and take k evenly spaced
  const sorted = [...uniq].sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  let c: [number, number][] = Array.from({ length: k }, (_, i) => sorted[Math.floor((i + 0.5) * sorted.length / k)]);
  for (let it = 0; it < 40; it++) {
    const sum = c.map(() => [0, 0, 0]);
    for (const p of pts) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < c.length; i++) { const d = (p[0] - c[i][0]) ** 2 + (p[1] - c[i][1]) ** 2; if (d < bd) { bd = d; bi = i; } }
      sum[bi][0] += p[0]; sum[bi][1] += p[1]; sum[bi][2]++;
    }
    const next = c.map((old, i) => (sum[i][2] === 0 ? old : [sum[i][0] / sum[i][2], sum[i][1] / sum[i][2]] as [number, number]));
    c = next;
  }
  return c;
}

function nameFor(hy1: number, hy2: number, used: Set<string>): string {
  const slowIn = hy1 < HX1 - 0.05, fastIn = hy1 > HX1 + 0.05;
  const slowOut = hy2 > HX2 + 0.05, fastOut = hy2 < HX2 - 0.05;
  let base = 'even';
  if (Math.abs(hy1 - HX1) < 1e-6 && Math.abs(hy2 - HX2) < 1e-6) base = 'linear';
  else if (hy2 > 1.06 || hy1 < -0.09) base = 'overshoot';
  else if (slowIn && slowOut) base = 'flat';
  else if (slowIn) base = 'start-slow';
  else if (slowOut) base = 'stop-slow';
  else if (fastIn && fastOut) base = 'snap';
  else if (fastIn) base = 'start-fast';
  else if (fastOut) base = 'stop-fast';
  let name = base, i = 2;
  while (used.has(name)) name = `${base}-${i++}`;
  used.add(name);
  return name;
}

if (import.meta.main) {
  const K = Number(process.argv.includes('--easings') ? process.argv[process.argv.indexOf('--easings') + 1] : 8);
  const all: Record<string, { s: Series; fps: number; n: number; loop: boolean; ball: boolean; anim: string }> = {};
  for (const set of SETS) {
    const { s, fps, n } = loadSeries(set.dir);
    tidy(s);
    if (set.loop) {
      // both short shots loop exactly — the last frame IS the first (the brief's
      // ✅, and the reference frames are bit-identical). Author the seam.
      for (const k of Object.keys(s)) s[k][n - 1] = s[k][0];
      // The saucer SLIDES in these two shots and does not tip: it occupies the
      // same rows and keeps the same width across all 17 frames, and the fit
      // agrees to within 0.26° over both. That is under what a 60x9 px shape can
      // show, so the residual wander is the estimator and not the shot — pin it,
      // rather than let it become a timeline.
      s.prot.fill(0);
    }
    snapHolds(s, TOL_PX);
    all[set.dir] = { s, fps, n, loop: set.loop, ball: set.ball, anim: set.anim };
  }
  const bc = all['ball-catch'];
  const wb = all['wave-by-hand'], wo = all['wave-offset'];
  const setup: Setup = {
    platX: Number(median([...wb.s.px, ...wo.s.px]).toFixed(2)),
    platY: Number(median([...wb.s.py, ...wo.s.py]).toFixed(2)),
    ballX: 0, ballY: 0,
    // basket-lambertian's alpha is a SETUP value, not a timeline: it is the same
    // 0.73 in every frame of every shot (solved off the art, swept with the rest
    // of the setup geometry). It lives in the rig spec's slot colour, and the rig
    // spec is where it stays — writing it from a per-frame median here made the
    // fit and the emitted animation disagree about the ball's own colour.
    lalpha: Number(readFileSync(`${RUN}/fit/globals.json`, 'utf8').match(/"lalpha":\s*([0-9.]+)/)![1]),
  };
  setup.ballX = setup.platX;
  setup.ballY = Number((setup.platY + 53 + 103).toFixed(2));

  // pass A — free handles, to discover the shapes
  const free: [number, number][] = [];
  for (const set of SETS) {
    const a = all[set.dir];
    const plans = timelinesOf(a.s, a.ball, [], setup, a.n);
    for (const p of Object.values(plans)) for (const sp of p.spans) if (sp.j - sp.i >= 2) free.push([sp.hy1, sp.hy2]);
  }
  const table = kmeans(free, K).map(([a, b]) => [Number(a.toFixed(4)), Number(b.toFixed(4))] as [number, number]);
  // linear is a positive claim, but it has to be reachable when the shot is one
  if (!table.some(([a, b]) => isLinear(a, b))) table.push([HX1, HX2]);
  const used = new Set<string>();
  const names = table.map(([a, b]) => nameFor(a, b, used));
  console.log(`pass A: ${free.length} span(s) with interior samples -> ${table.length} easing(s)`);
  table.forEach(([a, b], i) => console.log(`  ${names[i].padEnd(14)} [${HX1.toFixed(4)}, ${a.toFixed(4)}, ${HX2.toFixed(4)}, ${b.toFixed(4)}]`));

  // pass B — re-plan everything under that table
  const easings: Record<string, number[]> = {};
  table.forEach(([a, b], i) => { easings[names[i]] = [Number(HX1.toFixed(6)), a, Number(HX2.toFixed(6)), b]; });
  const animations: Record<string, unknown> = {};
  let totalKeys = 0;
  for (const set of SETS) {
    const a = all[set.dir];
    const plans = timelinesOf(a.s, a.ball, table, setup, a.n);
    const tracks: unknown[] = [];
    for (const [id, p] of Object.entries(plans)) {
      const [target, property] = id.split('|');
      const keys: unknown[] = [];
      const value = (idx: number): number[] => p.channels.map((c, ci) => {
        const raw = p.series[ci][idx];
        if (c === 'px') return raw - setup.platX;
        if (c === 'py') return raw - setup.platY;
        if (c === 'bx') return raw - setup.ballX;
        if (c === 'by') return raw - setup.ballY;
        if (c === 'c1') return raw + 90;
        return raw;
      });
      const emit = (idx: number, ease?: string) => {
        let v = value(idx).map((x) => Number(x.toFixed(3)));
        if (property === 'rgba') v = [1, 1, 1, Number(p.series[0][idx].toFixed(3))];
        keys.push(ease === undefined ? { t: idx / a.fps, v } : { t: idx / a.fps, v, ease });
      };
      for (const sp of p.spans) {
        const idx = table.findIndex(([x, y]) => Math.abs(x - sp.hy1) < 1e-9 && Math.abs(y - sp.hy2) < 1e-9);
        emit(sp.i, idx >= 0 ? names[idx] : names[0]);
      }
      emit(p.spans[p.spans.length - 1].j);
      totalKeys += keys.length;
      tracks.push({ [target.startsWith('basket-ball') && property === 'rgba' ? 'slot' : 'bone']: target, property, keys });
      const res = planResidual(p.spans, p.series, p.channels);
      console.log(`  ${set.anim.padEnd(13)} ${id.padEnd(30)} ${String(keys.length).padStart(4)} keys  residual ${res.toFixed(3)} px`);
    }
    if (!set.ball) {
      // nothing but the whip is in the frame, so the ball is hidden — with an
      // attachment key, which is Spine's own way to hide (§10.2)
      tracks.push({ slot: 'basket-ball', property: 'attachment', keys: [{ t: 0, v: null }] });
      tracks.push({ slot: 'basket-lambertian', property: 'attachment', keys: [{ t: 0, v: null }] });
      totalKeys += 2;
    }
    animations[set.anim] = { duration: (a.n - 1) / a.fps, loop: set.loop, tracks };
  }
  const motion = {
    spec: 'rigc-motion/1',
    archetype: '4-wave-principle',
    cut: '4-wave-principle',
    easings,
    animations,
  };
  writeFileSync(`${RUN}/4-wave-principle.motion.json`, JSON.stringify(motion, null, 1));
  writeFileSync(`${RUN}/fit/setup.json`, JSON.stringify(setup, null, 1));
  console.log(`total ${totalKeys} keys; setup ${JSON.stringify(setup)}`);

  // the rig spec carries the setup pose, so keep it in step
  const rigPath = `${RUN}/4-wave-principle.rig.json`;
  const rig = JSON.parse(readFileSync(rigPath, 'utf8')) as {
    bones: { name: string; x?: number; y?: number }[];
    slots: { name: string; color?: string }[];
  };
  const bone = (n: string) => rig.bones.find((b) => b.name === n)!;
  bone('platform').x = setup.platX;
  bone('platform').y = setup.platY;
  bone('basket-lambertian').x = setup.ballX;
  bone('basket-lambertian').y = setup.ballY;
  writeFileSync(rigPath, JSON.stringify(rig, null, 2));
}
