/**
 * The per-part chainfit usage trail — the thing this run exists to produce.
 *
 * Issue #291: "Where chainfit's readings were used in authoring, say so per
 * part — that per-part trail is the price tag."
 *
 * Four independent columns per part, because they answer four different
 * questions and only the last one is about the tool BUYING anything:
 *
 *  1. `read` — on how many committed frames the instrument produced a
 *     `hingeDeg` it did not refuse. This is availability, not usefulness.
 *  2. `won` — on how many frames the pose the fitter shipped came out of a
 *     start SEEDED by chainfit. `tools/fit.ts` labels every start and records
 *     which one the frame's answer descended from, so this is bookkeeping
 *     rather than inference.
 *  3. `agree` — on how many frames the shipped value and chainfit's hinge land
 *     within one key tolerance of each other, converted through that bone's own
 *     lever arm so the comparison is in FRAME PIXELS and not degrees (§10.3's
 *     rule about a rotation tolerance).
 *  4. `moved` — the median absolute difference between the two, in frame
 *     pixels at the end of what that bone swings. A part with a high `read` and
 *     a `moved` under the tolerance is a part the instrument CONFIRMED; a part
 *     with a high `won` is one it FOUND.
 *
 * ⚠️ `won` and `agree` are not substitutes. A frame whose answer came from the
 * incumbent can still agree with chainfit to a tenth of a pixel — the two
 * instruments simply landed in the same basin — and a frame chainfit won can
 * still end far from its hinge, because the seed is a START and the search
 * carries on from it. Reporting one without the other would overstate the tool
 * in one direction or the other.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { piecesOf } from '../../../../src/render';
import { declaredViewport, sidecarOf } from './geom';
import { applyPose, loadCandidate, type Pose } from './fitlib';
import { KNOBS } from './plan';

const REF = process.env.REF ?? 'bench/reference/spineboy/ess';
const CAND = process.env.CAND ?? '/tmp/sb2/probe';
const POSES = process.env.POSES ?? 'bench/runs/2026-09-03-spineboy-2/fit/poses.json';
const CHAINFIT = process.env.CHAINFIT ?? 'bench/runs/2026-09-03-spineboy-2/fit/chainfit.json';
const TOLERANCE_PX = Number(process.env.TOLERANCE_PX ?? 0.35);
const out = process.argv[2] ?? 'bench/runs/2026-09-03-spineboy-2/evidence/chainfit-trail.txt';

const view = declaredViewport(sidecarOf(REF));
const c = loadCandidate(CAND);
const poses = JSON.parse(readFileSync(POSES, 'utf8')) as Record<string, Record<string, { pose: Pose; score: number; start?: string }>>;
const chain = JSON.parse(readFileSync(CHAINFIT, 'utf8')) as {
  frames: { set: string; index: number; parts: { part: string; bone: string | null; hingeDeg: number | null; refusal: string | null; visibleShare: number | null }[] }[];
};

// Lever arms, measured the same way the key planner measures them.
const centres = (pose: Pose): Map<string, [number, number]> => {
  applyPose(c.skeleton, pose);
  const at = new Map<string, [number, number]>();
  for (const piece of piecesOf(c.skeleton)) {
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < piece.world.length; i += 2) {
      sx += piece.world[i];
      sy += piece.world[i + 1];
    }
    at.set(piece.slot, [(sx * 2) / piece.world.length, (sy * 2) / piece.world.length]);
  }
  return at;
};
const base = centres({});
const arms: Record<string, number> = {};
for (const knob of KNOBS) {
  if (knob.kind !== 'rotate') continue;
  const moved = centres({ [`${knob.bone}.rotate`]: 1 });
  let worst = 0;
  for (const [name, p] of moved) {
    const was = base.get(name);
    if (was) worst = Math.max(worst, Math.hypot(p[0] - was[0], p[1] - was[1]));
  }
  arms[knob.bone] = Math.max(1e-6, worst * view.scale);
}

interface Row {
  part: string;
  bone: string;
  frames: number;
  read: number;
  won: number;
  agree: number;
  deltas: number[];
  refused: Map<string, number>;
}
const rows = new Map<string, Row>();

for (const frame of chain.frames) {
  const shipped = poses[frame.set]?.[String(frame.index)];
  if (!shipped) continue;
  const wonByChain = (shipped.start ?? '').startsWith('chainfit');
  for (const p of frame.parts) {
    if (!p.bone) continue;
    const arm = arms[p.bone];
    if (arm === undefined) continue; // a bone this rig never rotates
    const row: Row =
      rows.get(p.part) ??
      { part: p.part, bone: p.bone, frames: 0, read: 0, won: 0, agree: 0, deltas: [] as number[], refused: new Map<string, number>() };
    row.frames++;
    if (p.refusal) row.refused.set(p.refusal, (row.refused.get(p.refusal) ?? 0) + 1);
    if (p.hingeDeg !== null && p.refusal === null) {
      row.read++;
      if (wonByChain) row.won++;
      const mine = shipped.pose[`${p.bone}.rotate`] ?? 0;
      const deltaPx = Math.abs(mine - p.hingeDeg) * arm;
      row.deltas.push(deltaPx);
      if (deltaPx <= TOLERANCE_PX) row.agree++;
    }
    rows.set(p.part, row);
  }
}

const median = (list: number[]): number => {
  if (list.length === 0) return Number.NaN;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const lines: string[] = [
  'chainfit usage trail, per part',
  `key tolerance ${TOLERANCE_PX} frame px at the end of what each bone swings`,
  '',
  'part                    bone                  frames  read   won  agree   |mine-hinge| med / max (frame px)   refusals',
  '-'.repeat(126),
];
for (const row of [...rows.values()].sort((a, b) => b.read - a.read)) {
  lines.push(
    `${row.part.padEnd(22)} ${row.bone.padEnd(20)} ${String(row.frames).padStart(6)} ${String(row.read).padStart(5)} ` +
      `${String(row.won).padStart(5)} ${String(row.agree).padStart(6)}   ` +
      `${Number.isNaN(median(row.deltas)) ? '   n/a' : median(row.deltas).toFixed(2).padStart(6)} / ` +
      `${row.deltas.length === 0 ? ' n/a' : Math.max(...row.deltas).toFixed(2).padStart(6)}              ` +
      `${[...row.refused.entries()].map(([r, n]) => `${r}x${n}`).join(' ') || '-'}`,
  );
}

// Whole-run start census, so `won` above is readable against its denominator.
const startCensus = new Map<string, number>();
let totalFrames = 0;
for (const [, set] of Object.entries(poses)) {
  for (const [, at] of Object.entries(set)) {
    totalFrames++;
    startCensus.set(at.start ?? 'unknown', (startCensus.get(at.start ?? 'unknown') ?? 0) + 1);
  }
}
lines.push(
  '',
  `which START each of the ${totalFrames} fitted frames' answer descended from:`,
  ...[...startCensus.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `  ${k.padEnd(24)} ${String(n).padStart(4)}  (${((100 * n) / totalFrames).toFixed(1)}%)`),
);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${lines.join('\n')}\n`);
process.stdout.write(`${lines.join('\n')}\n`);
