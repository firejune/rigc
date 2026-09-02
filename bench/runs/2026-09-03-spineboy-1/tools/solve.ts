/**
 * Solve the rig from the placements — structure and poses in one linear system.
 *
 * With every bone's setup rotation 0 and no bone scale, a bone's world rotation
 * is the sum of the local rotations above it, so a part's own measured screen
 * angle IS its bone's world rotation. Once those are read off the placements the
 * positions are **linear** in the geometry:
 *
 *     P_j(f) = T_f + Σ_{k ∈ chain(b)\{torso}} R(Θ_parent(k)(f))·v_k + R(Θ_b(f))·a_j
 *
 * — `v_k` a bone's local offset (its pivot), `a_j` a placeholder's own offset from
 * its bone, `T_f` the torso's world position on that frame, and the rotations
 * known. So the setup pose and every frame's translate come out of one least
 * squares over every (frame, part) a placement could measure, which is AUTHORING
 * §8.1's *"re-fit the setup pose against frames drawn from every shot"* taken to
 * its limit — the spread is all 147 — and the pivots are identified by the
 * variation in `Θ_parent` rather than by a per-frame descent that, as §8.1 says,
 * cannot move them at all.
 *
 * ⚠️ **Only the bones a placement can actually measure are freed here.** The
 * upper arms are never placed cleanly (`pose`: 0 and 10 unambiguous frames of
 * 145) and neither is the neck's *rotation*, so their pivots stay at their
 * art-read seeds and are refined by `tools/refine.ts`, which re-solves poses
 * inside every evaluation. Freeing a pivot whose parent's rotation is a guess is
 * how a solve of this shape produces confident nonsense.
 *
 * Robustness is IRLS plus two chain-consistency filters, because `pose` places
 * each part independently and the near/far pairs are the same drawing twice
 * (§8.1's *two near-identical parts need one calibrated separator*).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEG, readViewport, toWorld, wrap180 } from './geom.ts';
import { BONES, PARENT_OF, chainOf, type Setup } from './rig.ts';
import { TORSO_SETUP } from './setup.ts';
import { setsOf, KNOBS } from './fit.ts';
import type { PoseVec } from './fitlib.ts';
import type { Table } from './collect.ts';
import type { PlaceResult } from './place.ts';

const ROOT = 'bench/runs/2026-09-03-spineboy-1';
const REF = 'bench/reference/spineboy/ess';

/** part -> bone. A rider (`goggles`) shares the bone of the part it sits on. */
const ALL_PARTS: [string, string][] = [
  ['torso', 'torso'],
  ['neck', 'neck'],
  ['head', 'head'],
  ['goggles', 'head'],
  ['rear-upper-arm', 'rear-upper-arm'],
  ['rear-bracer', 'rear-bracer'],
  ['gun', 'gun'],
  ['front-upper-arm', 'front-upper-arm'],
  ['front-bracer', 'front-bracer'],
  ['front-fist-closed', 'front-fist'],
  ['rear-thigh', 'rear-thigh'],
  ['rear-shin', 'rear-shin'],
  ['rear-foot', 'rear-foot'],
  ['front-thigh', 'front-thigh'],
  ['front-shin', 'front-shin'],
  ['front-foot', 'front-foot'],
];

/**
 * Which parts this solve reads.
 *
 * The default is the trunk alone, for the reason `FREE_V` states. `RIGC_RUN_PARTS=all`
 * widens it to the whole figure, which is only sound once the placements come from
 * `tools/place.ts` — where the occluders are masked out and the seed is the
 * candidate's own limb, so the near/far pairs are no longer decided per frame by a
 * single-frame template match.
 */
export const SOLVE_PARTS: [string, string][] =
  process.env.RIGC_RUN_PARTS === 'all' ? ALL_PARTS : ALL_PARTS.slice(0, 4);

/**
 * Bones whose local offset the placements can identify.
 *
 * ⚠️ **The legs are deliberately not here, and the measurement is why.** With the
 * legs in, this solve read a per-part rms of 19.9 frame px on `rear-shin` and
 * 20–26 px on the thighs, worst 78 px, against 0.9–2.7 px on the trunk — and 78 px
 * is not noise on a figure whose two legs sit about 30 px apart, it is `pose`
 * matching one leg's art onto the other. Filtering the frames where the pair is
 * within 22 px removed half the leg observations and moved the rms by 2 px. So the
 * leg and arm geometry comes from the composite refinement instead
 * (`tools/refine.ts`), where the draw order decides which limb is which and no
 * per-part identity is needed; the trunk comes from here, at 0.9–2.7 px.
 */
export const FREE_V =
  process.env.RIGC_RUN_PARTS === 'all'
    ? [
        'head',
        'rear-upper-arm',
        'rear-bracer',
        'gun',
        'front-upper-arm',
        'front-bracer',
        'front-fist',
        'rear-thigh',
        'rear-shin',
        'rear-foot',
        'front-thigh',
        'front-shin',
        'front-foot',
      ]
    : ['head'];

/** Bones whose world rotation a placement measures. */
const MEASURED_ROT = new Set(
  process.env.RIGC_RUN_PARTS === 'all'
    ? [
        'torso',
        'head',
        'rear-upper-arm',
        'rear-bracer',
        'gun',
        'front-upper-arm',
        'front-bracer',
        'front-fist',
        'rear-thigh',
        'rear-shin',
        'rear-foot',
        'front-thigh',
        'front-shin',
        'front-foot',
      ]
    : ['torso', 'head'],
);

const BONE_OF_PART = new Map(SOLVE_PARTS);

interface Obs {
  frame: number;
  part: string;
  px: number;
  py: number;
  theta: Map<string, number>;
  weight: number;
}

export interface Solved {
  bones: Record<string, [number, number]>;
  attach: Record<string, [number, number]>;
  tx: Float64Array;
  ty: Float64Array;
  rms: number;
  used: number;
  perPart: Map<string, { n: number; sum: number; worst: number }>;
}

function gaussSolve(m: Float64Array, b: Float64Array, n: number): Float64Array<ArrayBufferLike> {
  const x = new Float64Array(n);
  const idx = (r: number, c: number): number => r * n + c;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[idx(r, c)]) > Math.abs(m[idx(piv, c)])) piv = r;
    if (piv !== c) {
      for (let k = 0; k < n; k++) {
        const t = m[idx(c, k)];
        m[idx(c, k)] = m[idx(piv, k)];
        m[idx(piv, k)] = t;
      }
      const t = b[c];
      b[c] = b[piv];
      b[piv] = t;
    }
    const p = m[idx(c, c)];
    if (Math.abs(p) < 1e-10) continue;
    for (let r = c + 1; r < n; r++) {
      const fr = m[idx(r, c)] / p;
      if (fr === 0) continue;
      for (let k = c; k < n; k++) m[idx(r, k)] -= fr * m[idx(c, k)];
      b[r] -= fr * b[c];
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let acc = b[r];
    for (let k = r + 1; k < n; k++) acc -= m[idx(r, k)] * x[k];
    x[r] = Math.abs(m[idx(r, r)]) < 1e-10 ? 0 : acc / m[idx(r, r)];
  }
  return x;
}

export function solveRig(obs: Obs[], frameCount: number, seed: Setup): Solved {
  const partList = SOLVE_PARTS.map(([p]) => p).filter((p) => p !== 'torso');
  const vIndex = new Map(FREE_V.map((b, i) => [b, i * 2]));
  const aBase = FREE_V.length * 2;
  const aIndex = new Map(partList.map((p, i) => [p, aBase + i * 2]));
  const tBase = aBase + partList.length * 2;
  const n = tBase + frameCount * 2;

  let weights = obs.map((o) => o.weight);
  let x: Float64Array<ArrayBufferLike> = new Float64Array(n);
  let rms = 0;
  let used = 0;
  const rot = (o: Obs, bone: string): number => (o.theta.get(bone) ?? 0) * DEG;

  /** What the bones held at their seeds contribute to this part's position. */
  const fixedOffset = (o: Obs): [number, number] => {
    let fx = 0;
    let fy = 0;
    for (const b of chainOf(BONE_OF_PART.get(o.part)!)) {
      if (b === 'root' || b === 'torso' || vIndex.has(b)) continue;
      const th = rot(o, PARENT_OF.get(b) ?? 'root');
      const [vx, vy] = seed.bones[b];
      fx += Math.cos(th) * vx - Math.sin(th) * vy;
      fy += Math.sin(th) * vx + Math.cos(th) * vy;
    }
    if (!aIndex.has(o.part)) {
      // The torso's own offset is pinned: `(a_torso, v_children, T_f)` is an exact
      // gauge (shift one, compensate the others, and not a pixel moves), so it is
      // fixed at the art-read pelvis rather than left to drift.
      const thb = rot(o, BONE_OF_PART.get(o.part)!);
      const [ax, ay] = seed.attach[o.part];
      fx += Math.cos(thb) * ax - Math.sin(thb) * ay;
      fy += Math.sin(thb) * ax + Math.cos(thb) * ay;
    }
    return [fx, fy];
  };

  const predict = (o: Obs, sol: Float64Array<ArrayBufferLike>): [number, number] => {
    const [fx, fy] = fixedOffset(o);
    let ex = sol[tBase + o.frame * 2] + fx;
    let ey = sol[tBase + o.frame * 2 + 1] + fy;
    for (const b of chainOf(BONE_OF_PART.get(o.part)!)) {
      if (!vIndex.has(b)) continue;
      const th = rot(o, PARENT_OF.get(b) ?? 'root');
      const i = vIndex.get(b)!;
      ex += Math.cos(th) * sol[i] - Math.sin(th) * sol[i + 1];
      ey += Math.sin(th) * sol[i] + Math.cos(th) * sol[i + 1];
    }
    const ai = aIndex.get(o.part);
    if (ai !== undefined) {
      const thb = rot(o, BONE_OF_PART.get(o.part)!);
      ex += Math.cos(thb) * sol[ai] - Math.sin(thb) * sol[ai + 1];
      ey += Math.sin(thb) * sol[ai] + Math.cos(thb) * sol[ai + 1];
    }
    return [ex, ey];
  };

  for (let iter = 0; iter < 5; iter++) {
    const ata = new Float64Array(n * n);
    const atb = new Float64Array(n);
    const add = (cols: [number, number][], rhs: number, w: number): void => {
      for (const [i, ci] of cols) {
        atb[i] += w * ci * rhs;
        for (const [j, cj] of cols) ata[i * n + j] += w * ci * cj;
      }
    };
    used = 0;
    for (let k = 0; k < obs.length; k++) {
      const o = obs[k];
      const w = weights[k];
      if (w <= 1e-6) continue;
      used++;
      const bone = BONE_OF_PART.get(o.part)!;
      const colsX: [number, number][] = [[tBase + o.frame * 2, 1]];
      const colsY: [number, number][] = [[tBase + o.frame * 2 + 1, 1]];
      for (const b of chainOf(bone)) {
        if (!vIndex.has(b)) continue;
        const th = rot(o, PARENT_OF.get(b) ?? 'root');
        const i = vIndex.get(b)!;
        colsX.push([i, Math.cos(th)], [i + 1, -Math.sin(th)]);
        colsY.push([i, Math.sin(th)], [i + 1, Math.cos(th)]);
      }
      const thb = rot(o, bone);
      const ai = aIndex.get(o.part);
      if (ai !== undefined) {
        colsX.push([ai, Math.cos(thb)], [ai + 1, -Math.sin(thb)]);
        colsY.push([ai, Math.sin(thb)], [ai + 1, Math.cos(thb)]);
      }
      const [fx, fy] = fixedOffset(o);
      add(colsX, o.px - fx, w);
      add(colsY, o.py - fy, w);
    }
    for (let i = 0; i < n; i++) ata[i * n + i] += 1e-3;
    x = gaussSolve(ata, atb, n);

    const res = obs.map((o) => {
      const [ex, ey] = predict(o, x);
      return Math.hypot(ex - o.px, ey - o.py);
    });
    const sorted = [...res].sort((p, q) => p - q);
    const median = sorted[Math.floor(sorted.length / 2)] || 1;
    const cut = Math.max(8, 2.0 * median);
    weights = obs.map((o, k) => o.weight * Math.min(1, cut / Math.max(1e-6, res[k])) ** 2);
    const kept = res.filter((_, k) => weights[k] > 1e-6);
    rms = Math.sqrt(kept.reduce((a, b) => a + b * b, 0) / Math.max(1, kept.length));
  }

  const bones: Record<string, [number, number]> = {};
  for (const [b, p] of BONES) {
    if (p === null) continue;
    bones[b] = vIndex.has(b) ? [x[vIndex.get(b)!], x[vIndex.get(b)! + 1]] : [...seed.bones[b]];
  }
  bones['torso'] = [...TORSO_SETUP];
  const attach: Record<string, [number, number]> = {};
  for (const [k, v] of Object.entries(seed.attach)) attach[k] = [...v];
  for (const p of partList) {
    const i = aIndex.get(p)!;
    attach[p] = [x[i], x[i + 1]];
  }
  const tx = new Float64Array(frameCount);
  const ty = new Float64Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    tx[f] = x[tBase + f * 2];
    ty[f] = x[tBase + f * 2 + 1];
  }
  const perPart = new Map<string, { n: number; sum: number; worst: number }>();
  for (const o of obs) {
    const [ex, ey] = predict(o, x);
    const d = Math.hypot(ex - o.px, ey - o.py);
    const e = perPart.get(o.part) ?? { n: 0, sum: 0, worst: 0 };
    e.n++;
    e.sum += d * d;
    e.worst = Math.max(e.worst, d);
    perPart.set(o.part, e);
  }
  return { bones, attach, tx, ty, rms, used, perPart };
}

// ---------------------------------------------------------------------------
// the driver
// ---------------------------------------------------------------------------

type Reading = { x: number; y: number; rot: number; res: number; unexp?: number; vis?: number };
type Row = Record<string, Reading>;

/** Read either a `pose` table (residual 0..1) or this run's own placements (0..255). */
function readRows(source: 'pose' | 'place'): Map<string, Row> {
  const out = new Map<string, Row>();
  if (source === 'pose') {
    const table: Table = JSON.parse(readFileSync(join(ROOT, 'fit/placements.json'), 'utf8'));
    for (const [key, row] of Object.entries(table)) {
      const conv: Row = {};
      for (const [part, p] of Object.entries(row)) {
        conv[part] = { x: p.x, y: p.y, rot: p.rot, res: p.res * 255, unexp: p.unexp };
      }
      out.set(key, conv);
    }
    return out;
  }
  for (const set of setsOf()) {
    const file = join(ROOT, `fit/place/${set.dir.replace('@', '_at_')}.json`);
    if (!existsSync(file)) continue;
    const table: Record<string, Record<string, PlaceResult>> = JSON.parse(readFileSync(file, 'utf8'));
    for (const [frame, row] of Object.entries(table)) {
      const conv: Row = {};
      for (const [part, p] of Object.entries(row)) {
        if (!Number.isFinite(p.res)) continue;
        conv[part] = { x: p.x, y: p.y, rot: p.rot, res: p.res, vis: p.vis };
      }
      out.set(`${set.dir}/${frame}`, conv);
    }
  }
  return out;
}

if (import.meta.main) {
  const source = (process.argv[2] ?? 'pose') as 'pose' | 'place';
  const resGate = Number(process.argv[3] ?? 42);
  const vp = readViewport(join(REF, 'frames.json'));
  const seed: Setup = JSON.parse(readFileSync(join(ROOT, 'fit/setup.json'), 'utf8'));
  const rowsByKey = readRows(source);

  const frameKeys: string[] = [];
  for (const set of setsOf()) {
    for (const f of set.frames) {
      const key = `${set.dir}/${f.replace('.png', '')}`;
      if (rowsByKey.has(key)) frameKeys.push(key);
    }
  }

  const priorPoses = new Map<string, PoseVec>();
  for (const set of setsOf()) {
    const file = join(ROOT, `fit/poses/${set.dir.replace('@', '_at_')}.json`);
    if (!existsSync(file)) continue;
    const t = JSON.parse(readFileSync(file, 'utf8'));
    for (const [frame, pose] of Object.entries(t)) priorPoses.set(`${set.dir}/${frame}`, pose as PoseVec);
  }

  const usable = (p: Reading | undefined): boolean => {
    if (!p) return false;
    if (p.res > resGate) return false;
    if (p.unexp !== undefined && p.unexp > 0.5) return false;
    if (p.vis !== undefined && p.vis < 0.3) return false;
    return true;
  };

  const theta = new Map<string, Map<string, number>>();
  for (const key of frameKeys) {
    const row = rowsByKey.get(key)!;
    const prev = priorPoses.get(key);
    const th = new Map<string, number>([['root', 0]]);
    for (const [bone, parent] of BONES) {
      if (parent === null || bone === 'muzzle') continue;
      const inherited = th.get(parent) ?? 0;
      const p = row[bone === 'front-fist' ? 'front-fist-closed' : bone];
      if (MEASURED_ROT.has(bone) && usable(p)) th.set(bone, -p.rot);
      else if (prev && prev[`${bone}.rotate`] !== undefined) th.set(bone, inherited + prev[`${bone}.rotate`]);
      else th.set(bone, inherited);
    }
    // The neck's own rotation is not measurable — its art is near-symmetric under
    // rotation and `pose` flags it ambiguous on all 145 frames — so it is held at
    // the torso's angle rather than guessed, and never keyed.
    th.set('neck', th.get('torso') ?? 0);
    theta.set(key, th);
  }

  const dropped = { pair: 0, chain: 0 };
  const obs: Obs[] = [];
  frameKeys.forEach((key, f) => {
    const row = rowsByKey.get(key)!;
    const th = theta.get(key)!;
    const gap = (a: string, b: string): number => {
      const p = row[a];
      const q = row[b];
      return p && q ? Math.hypot(p.x - q.x, p.y - q.y) : Infinity;
    };
    const CLASH = 22;
    const thighClash = gap('front-thigh', 'rear-thigh') < CLASH;
    const footClash = gap('front-foot', 'rear-foot') < CLASH;
    const shinClash = gap('front-shin', 'rear-shin') < CLASH;
    for (const [part] of SOLVE_PARTS) {
      const p = row[part];
      if (!usable(p)) continue;
      if (
        (part.endsWith('-thigh') && thighClash) ||
        (part.endsWith('-foot') && footClash) ||
        (part.endsWith('-shin') && shinClash)
      ) {
        dropped.pair++;
        continue;
      }
      if (part.endsWith('-thigh') || part.endsWith('-foot')) {
        const shin = row[`${part.startsWith('front') ? 'front' : 'rear'}-shin`];
        if (shin && Math.hypot(p.x - shin.x, p.y - shin.y) > 62) {
          dropped.chain++;
          continue;
        }
      }
      const [wx, wy] = toWorld(vp, p.x, p.y);
      obs.push({
        frame: f,
        part,
        px: wx,
        py: wy,
        theta: th,
        weight: Math.min(1, p.vis ?? 1) * Math.min(1, 26 / Math.max(10, p.res)),
      });
    }
  });

  const seen = new Set(obs.map((o) => o.frame));
  const out = solveRig(obs, frameKeys.length, seed);
  console.log(
    `source=${source} gate=${resGate}: ${obs.length} observations ` +
      `(dropped ${dropped.pair} on a near-identical clash, ${dropped.chain} off their own chain), ` +
      `${out.used} kept by IRLS over ${frameKeys.length} frames, rms ${out.rms.toFixed(2)} units ` +
      `= ${(out.rms * vp.scale).toFixed(2)} frame px`,
  );

  for (const [part, e] of [...out.perPart].sort((a, b) => b[1].sum / b[1].n - a[1].sum / a[1].n)) {
    console.log(
      `  ${part.padEnd(14)} n=${String(e.n).padStart(3)}  rms ${Math.sqrt(e.sum / e.n).toFixed(1)}u ` +
        `(${(Math.sqrt(e.sum / e.n) * vp.scale).toFixed(2)}px)  worst ${(e.worst * vp.scale).toFixed(1)}px`,
    );
  }

  // `--report-only` re-runs the measurement without touching anything, so the
  // figures this run quotes reproduce from the committed inputs (bench/runs/README.md,
  // *After a run* step 4) without re-deriving the geometry that was built on them.
  if (process.argv.includes('--report-only')) process.exit(0);

  writeFileSync(join(ROOT, 'fit/setup.json'), JSON.stringify({ bones: out.bones, attach: out.attach }, null, 2));

  const byDir = new Map<string, Record<string, PoseVec>>();
  frameKeys.forEach((key, f) => {
    const cut = key.lastIndexOf('/');
    const dir = key.slice(0, cut);
    const frame = key.slice(cut + 1);
    const th = theta.get(key)!;
    const pose: PoseVec = { ...(priorPoses.get(key) ?? {}) };
    for (const k of KNOBS) {
      if (!k.key.endsWith('.rotate')) continue;
      const bone = k.key.slice(0, -7);
      if (!MEASURED_ROT.has(bone) && bone !== 'neck') continue;
      const parent = PARENT_OF.get(bone) ?? 'root';
      pose[k.key] = wrap180((th.get(bone) ?? 0) - (th.get(parent) ?? 0));
    }
    // 🚨 A frame with no observation has no translate — the normal equations leave
    // it at the ridge's zero, which is not "the origin", it is "unmeasured". Writing
    // it would move that frame's whole figure 215 units down under a frozen trunk,
    // and nothing downstream could recover it (this happened: LOOP §4.6).
    if (seen.has(f)) {
      pose['torso.x'] = out.tx[f] - TORSO_SETUP[0];
      pose['torso.y'] = out.ty[f] - TORSO_SETUP[1];
    }
    const table = byDir.get(dir) ?? {};
    table[frame] = pose;
    byDir.set(dir, table);
  });
  for (const [dir, table] of byDir) {
    const file = join(ROOT, `fit/poses/${dir.replace('@', '_at_')}.json`);
    const existing = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    writeFileSync(file, JSON.stringify({ ...existing, ...table }, null, 1));
  }
}
