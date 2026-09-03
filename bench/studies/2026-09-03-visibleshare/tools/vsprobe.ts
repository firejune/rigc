/**
 * `visibleShare` against the fit it was measured at — the measurement harness.
 *
 * ## What it perturbs, and why that is the right knob
 *
 * `chainfit`'s `visibleShare` is `frozen.weight / frozen.total`: the share of a
 * part's own alpha weight that survives the parts drawn over it, at the placement
 * its visible set was frozen at. Both halves of that fraction are downstream of
 * the fit — the numerator because the occluders are stamped from wherever the
 * later-drawn parts CURRENTLY sit, the denominator only in that the part's own
 * placement decides which of its pixels land on the canvas at all. So the
 * quantity is fit-relative by construction, and the question this harness asks is
 * how much of it is fit-relative in practice.
 *
 * The knob is the **anchor report**. `chainfit` is handed a `rigc pose` report and
 * hangs every chain off the placements in it; an objective change moves those
 * placements and nothing else, which is exactly the perturbation
 * [PR #322](https://github.com/firejune/rigc/pull/322) performed by accident when
 * it saw `rear-bracer`'s share move 0.36 → 0.89 on a 0.0008 residual change.
 * Perturbing the anchor reproduces that channel rather than simulating it.
 *
 * ⭐ **A perturbed anchor report is kept self-consistent.** The jitter moves a
 * placement, and then this harness RE-MEASURES that placement's residual and
 * `unexplained` with `pose`'s own objective and writes the moved numbers back into
 * the report. Without that, two things the instrument does downstream would be
 * frozen artificially: `anchorEntries`' eligibility test (residual ≤ 0.16,
 * unexplained ≤ 0.45) and the per-bone tie-break, which picks the anchor with the
 * LOWEST reported residual among the parts on one bone. Both are live channels
 * under a real objective change, so both are live here.
 *
 * ## The band the jitter is drawn from is measured, not assumed
 *
 * Four rungs, and each one names where its numbers come from:
 *
 *  - `polish-floor` — ±0.05 px, ±0.1°, ±0.1 % scale. This is `src/pose.ts`'s own
 *    level-0 polish floor verbatim (`floor = { translate: 0.05, rotate: 0.1,
 *    scale: 0.001 }`): the step size at which the pattern search stops halving and
 *    returns. Below it the fitter does not look, so it cannot distinguish its
 *    answer from any placement inside this box. **This is the convergence band
 *    proper**, and the headline figure is read at this rung.
 *  - `polish-floor-2x` — twice that, because a pattern search that terminates at
 *    step `d` has only established that no probe at `d` improved; the answer sits
 *    within about one step of the local optimum rather than on it.
 *  - `readback-floor` — ±0.16 px, ±0.27°, ±3.1 % scale: the worst known-answer
 *    readback error the `PS01`/`PS02` controls measure, as re-baselined in
 *    [#306](https://github.com/firejune/rigc/issues/306). Wider than the
 *    convergence band and a different quantity — accuracy against a constructed
 *    truth rather than the fitter's own resolution — and reported as the band
 *    within which `pose`'s answer is measurably indistinguishable from correct.
 *  - `control-1px` — ±1.0 px, ±1.0°, ±1 % scale, deliberately OUTSIDE both bands.
 *    It is the positive control: a flat result at the band rungs means nothing
 *    unless a larger perturbation demonstrably moves the quantity.
 *
 * Every rung reports the residual change it actually induced, so the response can
 * be read per unit of residual — which is the form #323 asks the figure in, and
 * the form that compares against #322's 0.0008.
 *
 * ## The corpus and the basis
 *
 * All 147 committed `ess` frames of `bench/reference/spineboy`, the same corpus
 * the quoted medians are on. The candidate is the 2026-09-03 run 2's own committed
 * `spine/skeleton.json`; the part subset and the declared anchor set are that
 * run's (`tools/parts.sh`, `tools/anchor.ts`) — restated here rather than imported
 * because a landed run's tooling is a frozen record and this study must not reach
 * into one. `--min-visible 0` so every part reports a share instead of being
 * refused, which is both what a distribution of the quantity needs and the setting
 * #306's four-frame spot check used.
 *
 * ## Usage
 *
 *   bun bench/studies/2026-09-03-visibleshare/tools/vsprobe.ts <work-dir> [--frames N] [--reps N] [--seed N]
 *
 * Writes `<work-dir>/raw.json`. Nothing under the repository is written: the raw
 * store is regenerated from the seed, and `vsreport.ts` folds it into the
 * committed evidence.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { Plate, readPlate } from '../../../../tools/plate.ts';
import { estimateChainFit } from '../../../../src/chainfit.ts';
import {
  UNEXPLAINED_TOLERANCE,
  errBilinear,
  estimatePose,
  levelOf,
  materialPlate,
  readBackground,
  type PoseReport,
} from '../../../../src/pose.ts';

const ROOT = resolve(import.meta.dir, '../../../..');
const FRAMES_ROOT = join(ROOT, 'bench/reference/spineboy/ess');
const CANDIDATE = join(ROOT, 'bench/runs/2026-09-03-spineboy-2/spine');
const IMAGES_SRC = join(ROOT, 'examples/spineboy/images');

/**
 * The frames' own declared scale, from `bench/reference/spineboy/ess/frames.json`
 * — read from the file rather than typed in, so it cannot drift from the corpus.
 */
function declaredScale(): number {
  const parsed: unknown = JSON.parse(readFileSync(join(FRAMES_ROOT, 'frames.json'), 'utf8'));
  const viewport = (parsed as { viewport?: { scale?: unknown } }).viewport;
  const scale = viewport?.scale;
  if (typeof scale !== 'number' || !(scale > 0)) throw new Error('frames.json carries no positive viewport.scale');
  return scale;
}

/**
 * The `ess` part subset — the 29 PNGs any `ess` shot can show.
 *
 * Restated from `bench/runs/2026-09-03-spineboy-2/tools/parts.sh`. The Hoverboard
 * and Portal groups and the crosshair appear only in shots `pro` has, so they are
 * not in this rig and `pose` is not asked to place them.
 */
const ESS_PARTS = [
  'eye-indifferent.png',
  'eye-surprised.png',
  'front-bracer.png',
  'front-fist-closed.png',
  'front-fist-open.png',
  'front-foot.png',
  'front-shin.png',
  'front-thigh.png',
  'front-upper-arm.png',
  'goggles.png',
  'gun.png',
  'head.png',
  'mouth-grind.png',
  'mouth-oooo.png',
  'mouth-smile.png',
  'muzzle-glow.png',
  'muzzle-ring.png',
  'muzzle01.png',
  'muzzle02.png',
  'muzzle03.png',
  'muzzle04.png',
  'muzzle05.png',
  'neck.png',
  'rear-bracer.png',
  'rear-foot.png',
  'rear-shin.png',
  'rear-thigh.png',
  'rear-upper-arm.png',
  'torso.png',
];

/**
 * The anchor set the run declared, from
 * `bench/runs/2026-09-03-spineboy-2/tools/anchor.ts`'s `DEFAULT_ANCHORS`.
 *
 * ⚠️ Restated, not imported: that file is a landed run's committed record. Its
 * reason is the run's own first finding about the tool — `pose` clears the anchor
 * criterion on the far-side limbs while placing them on top of the near-side ones,
 * because the two are the same drawing at two sizes, so a taken anchor set leaves
 * the chain with nothing to buy.
 */
const DECLARED_ANCHORS = new Set(['torso', 'head', 'goggles', 'mouth-smile', 'mouth-grind', 'mouth-oooo']);

/** One rung of the perturbation ladder. Bounds are half-widths of a uniform draw. */
interface Rung {
  name: string;
  /** Frame pixels on each of x and y. */
  px: number;
  /** Screen degrees. */
  deg: number;
  /** Fractional scale ratio: the draw multiplies scale by `1 + U(-scale, scale)`. */
  scale: number;
  /** Where these three numbers come from — printed with every table. */
  basis: string;
}

const RUNGS: Rung[] = [
  {
    name: 'polish-floor',
    px: 0.05,
    deg: 0.1,
    scale: 0.001,
    basis: "src/pose.ts's level-0 polish floor — the step at which the pattern search stops halving and returns",
  },
  {
    name: 'polish-floor-2x',
    px: 0.1,
    deg: 0.2,
    scale: 0.002,
    basis: 'twice the polish floor — a pattern search that terminated at step d sits within about one step of its optimum',
  },
  {
    name: 'pr322-scale',
    px: 0.2,
    deg: 0.4,
    scale: 0.004,
    basis:
      "sized from the band sweep so the induced anchor-residual change brackets #322's own 0.0008 — outside the " +
      'convergence band, and there so the comparison against the observed 0.36 → 0.89 is direct rather than extrapolated',
  },
  {
    name: 'readback-floor',
    px: 0.16,
    deg: 0.27,
    scale: 0.031,
    basis: "PS01/PS02's worst known-answer readback error, re-baselined in #306 (0.16 px / 0.27° / 3.1% scale)",
  },
  {
    name: 'control-1px',
    px: 1,
    deg: 1,
    scale: 0.01,
    basis: 'outside every band, on purpose — the positive control that the quantity moves at all under this knob',
  },
];

// ---------------------------------------------------------------------------
// the objective, re-measured at a moved placement
// ---------------------------------------------------------------------------

/**
 * `pose`'s reported residual and `unexplained` for one part at one placement.
 *
 * ⚠️ This is a hand copy of `src/pose.ts`'s own `measure`, which is not exported —
 * so it is VERIFIED rather than trusted: `probeFrame` reproduces every anchor's
 * reported residual at its reported placement and the worst disagreement across
 * the corpus is a committed control (`evidence/controls.txt`). The copy reads the
 * material plate at full resolution over every part pixel through the exported
 * `errBilinear`, so the premultiplied colour term of #306 is the shipped one and
 * not a second implementation of it.
 *
 * The origin is the part image's own centre rather than its material box's, which
 * is the origin a report's `(x, y)` is stated in. The two give the same sums: the
 * loop only ever forms `(pixel − origin)` against a placement expressed in the
 * same origin.
 */
function measureAt(
  level: ReturnType<typeof levelOf>,
  plate: Plate,
  part: Plate,
  cx: number,
  cy: number,
  rotDeg: number,
  scale: number,
): { residual: number; unexplained: number } {
  const DEG = Math.PI / 180;
  const cos = Math.cos(rotDeg * DEG) * scale;
  const sin = Math.sin(rotDeg * DEG) * scale;
  let weight = 0;
  let acc = 0;
  let unexplained = 0;
  for (let y = 0; y < part.height; y++) {
    for (let x = 0; x < part.width; x++) {
      const i = (y * part.width + x) * 4;
      const a = part.data[i + 3];
      if (a === 0) continue;
      const w = a / 255;
      const u = x + 0.5 - part.width / 2;
      const v = y + 0.5 - part.height / 2;
      const fx = cx + u * cos - v * sin;
      const fy = cy + u * sin + v * cos;
      weight += w;
      const err = errBilinear(level, plate, fx, fy, part.data[i], part.data[i + 1], part.data[i + 2]);
      acc += w * err;
      if (err > UNEXPLAINED_TOLERANCE) unexplained += w;
    }
  }
  if (weight === 0) return { residual: 1, unexplained: 1 };
  return { residual: acc / weight, unexplained: unexplained / weight };
}

// ---------------------------------------------------------------------------
// the corpus
// ---------------------------------------------------------------------------

interface FrameRef {
  set: string;
  index: number;
  path: string;
}

/**
 * Every committed `f####.png` of every set the corpus declares, in the declaration
 * order — 147 of them, which the caller asserts rather than assumes.
 *
 * `contact.png` is deliberately excluded: it is a composite the reference renderer
 * writes beside the frames and not one of the sampled frames.
 */
function corpus(): FrameRef[] {
  const parsed: unknown = JSON.parse(readFileSync(join(FRAMES_ROOT, 'frames.json'), 'utf8'));
  const sets = (parsed as { sets?: { dir?: unknown }[] }).sets;
  if (!Array.isArray(sets)) throw new Error('frames.json carries no sets array');
  const out: FrameRef[] = [];
  for (const set of sets) {
    const dir = set.dir;
    if (typeof dir !== 'string') throw new Error('a set in frames.json carries no dir');
    const names = readdirSync(join(FRAMES_ROOT, dir))
      .filter((n) => /^f\d+\.png$/.test(n))
      .sort();
    for (const name of names) {
      out.push({ set: dir, index: Number(name.slice(1, -4)), path: join(FRAMES_ROOT, dir, name) });
    }
  }
  return out;
}

/** The part subset, materialised once into the work directory. */
function buildParts(workDir: string): string {
  const dir = join(workDir, 'parts');
  mkdirSync(dir, { recursive: true });
  for (const name of ESS_PARTS) {
    const dest = join(dir, name);
    if (existsSync(dest)) continue;
    writeFileSync(dest, readFileSync(join(IMAGES_SRC, name)));
  }
  return dir;
}

// ---------------------------------------------------------------------------
// the perturbation
// ---------------------------------------------------------------------------

/** mulberry32 — a named, reproducible generator, so `--seed` regenerates the store. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One part's reading out of one `chainfit` run.
 *
 * ⭐ The PLACEMENT is carried as well as the share, and that is what lets the
 * report attribute a swing rather than only measure it: a share that moved while
 * the part stayed put is a statement about the mask, and a share that moved
 * because the part moved is a statement about the fit. Those are #323's two
 * branches, and without the placement the store cannot tell them apart.
 */
interface Reading {
  part: string;
  role: string;
  refusal: string | null;
  share: number | null;
  shareAtFit: number | null;
  residual: number | null;
  hingeDeg: number | null;
  x: number | null;
  y: number | null;
  rotationDeg: number | null;
  scale: number | null;
  ambiguous: boolean;
  alternates: number;
  bone: string;
  depth: number;
  anchoredTo: string | null;
}

interface Replicate {
  rung: string;
  rep: number;
  /** Largest |Δresidual| the jitter induced on any anchor part, re-measured. */
  worstAnchorResidualDelta: number;
  /** Mean |Δresidual| over the anchor parts that were eligible in the base report. */
  meanAnchorResidualDelta: number;
  /** Largest centre displacement the jitter applied to any anchor part, frame px. */
  maxAnchorDisplacementPx: number;
  /** Anchor parts whose eligibility flipped, and bones whose anchor part changed. */
  eligibilityFlips: string[];
  anchorSetChanged: boolean;
  readings: Reading[];
}

/**
 * The two anchor bases the study covers, because the figures at stake are not all
 * on one of them.
 *
 *  - `declared` — the 2026-09-03 run 2's declared anchor set. **This is the basis
 *    the quoted medians are on**: issue #284's landing table and `LADDER.md`'s
 *    agreement bands both come out of that run's pipeline.
 *  - `pose-criterion` — the raw `pose` report, so `chainfit` anchors on whatever
 *    clears its own §12.2 criterion. **This is the basis #322's observation is
 *    on**: that spot check ran with the internal anchor pass, which is why
 *    `rear-bracer` was an ANCHOR there and is a chain part under the declared set.
 *
 * Running both is what keeps the study answerable to both consumers instead of
 * measuring one and quoting it at the other.
 */
type BasisName = 'declared' | 'pose-criterion';

const BASES: BasisName[] = ['declared', 'pose-criterion'];

interface BasisResult {
  basis: BasisName;
  base: Reading[];
  baseAnchored: string[];
  replicates: Replicate[];
}

interface FrameResult {
  set: string;
  index: number;
  bases: BasisResult[];
}

function readingsOf(report: ReturnType<typeof estimateChainFit>): Reading[] {
  return report.parts.map((p) => ({
    part: basename(p.part),
    role: p.role,
    refusal: p.refusal === null ? null : p.refusal.reason,
    share: p.placement === null ? null : p.placement.visibleShare,
    shareAtFit: p.placement === null ? null : p.placement.visibleShareAtFit,
    residual: p.placement === null ? null : p.placement.residual,
    hingeDeg: p.placement === null ? null : p.placement.hingeDeg,
    x: p.placement === null ? null : p.placement.x,
    y: p.placement === null ? null : p.placement.y,
    rotationDeg: p.placement === null ? null : p.placement.rotationDeg,
    scale: p.placement === null ? null : p.placement.scale,
    ambiguous: p.ambiguous,
    alternates: p.alternates.length,
    bone: p.bone.name,
    depth: p.bone.depth,
    anchoredTo: p.bone.anchoredTo,
  }));
}

/**
 * One basis's anchor report, off a `pose` report.
 *
 * `declared` suppresses everything outside the declared set the way the run's
 * `tools/anchor.ts` does — a `no-match` refusal with the placement still printed,
 * which is the report's own way of saying "do not trust this one".
 * `pose-criterion` returns the report untouched, which is exactly what `chainfit`
 * does for itself when no `--anchor` is given.
 */
function anchorReportFor(report: PoseReport, basis: BasisName): PoseReport {
  const copy = JSON.parse(JSON.stringify(report)) as PoseReport;
  if (basis === 'pose-criterion') return copy;
  for (const part of copy.parts) {
    const name = basename(part.part).replace(/\.png$/, '');
    if (DECLARED_ANCHORS.has(name)) continue;
    part.refusal = {
      reason: 'no-match',
      detail: `suppressed by the study's declared anchor set (2026-09-03 run 2's own): \`pose\` cannot be trusted to tell ${name} from its near/far twin on this figure`,
    };
    part.ambiguous = true;
  }
  return copy;
}

const ANCHOR_MAX_RESIDUAL = 0.16;
const ANCHOR_MAX_UNEXPLAINED = 0.45;

function eligible(residual: number, unexplained: number, ambiguous: boolean, refused: boolean): boolean {
  return !refused && !ambiguous && residual <= ANCHOR_MAX_RESIDUAL && unexplained <= ANCHOR_MAX_UNEXPLAINED;
}

/**
 * Which parts actually anchored a bone, taken from `chainfit`'s own report.
 *
 * ⭐ Read off the instrument rather than re-derived. The tie-break is per BONE and
 * a `pose` report does not carry bones: `anchorForBone` gives a bone to the
 * eligible part on it with the LOWEST reported residual, so with the face slots
 * riding one bone a sub-band residual move can change WHICH part anchors the head
 * — and `report.anchor.anchored` is the field that says which one did.
 */
function anchoredBy(report: ReturnType<typeof estimateChainFit>): string {
  return [...report.anchor.anchored].sort().join(',');
}

// ---------------------------------------------------------------------------
// one frame
// ---------------------------------------------------------------------------

function probeFrame(
  frame: FrameRef,
  partsDir: string,
  scale: number,
  reps: number,
  seed: number,
  poseCacheDir: string,
  workDir: string,
  control: { worst: number; worstPart: string },
): FrameResult {
  // The `pose` pass is the expensive half and it is the same for every replicate,
  // so it is cached on disk: the store is regenerable, and a rerun with a new
  // `--reps` does not pay for it twice.
  const cachePath = join(poseCacheDir, `${frame.set.replace(/[^\w@-]/g, '_')}-f${String(frame.index).padStart(4, '0')}.json`);
  let posed: PoseReport;
  if (existsSync(cachePath)) {
    posed = JSON.parse(readFileSync(cachePath, 'utf8')) as PoseReport;
  } else {
    posed = estimatePose({ imagesDir: partsDir, framePath: frame.path, scale: { min: scale, max: scale } });
    writeFileSync(cachePath, `${JSON.stringify(posed)}\n`);
  }

  const framePlate = readPlate(frame.path);
  const background = readBackground(framePlate);
  const material = materialPlate(framePlate, background);
  const level = levelOf(material.plate, 1);

  // ⭐ EVERY part with a placement is jittered, not only the ones a basis will
  // anchor on. That is what an objective change does — it moves the whole report —
  // and it is what lets one jittered report serve both bases, so the two are
  // compared at the same perturbation rather than at two draws of one.
  const movable: { name: string; plate: Plate; base: { residual: number; unexplained: number } }[] = [];
  for (const part of posed.parts) {
    const name = basename(part.part);
    const p = part.placement;
    if (p === null) continue;
    const plate = readPlate(join(partsDir, name));
    const mine = measureAt(level, material.plate, plate, p.x, p.y, p.rotationDeg, p.scale);
    const gap = Math.abs(mine.residual - p.residual);
    if (gap > control.worst) {
      control.worst = gap;
      control.worstPart = `${frame.set}/f${String(frame.index).padStart(4, '0')} ${name}`;
    }
    movable.push({ name, plate, base: mine });
  }
  const originals = new Map(posed.parts.map((p) => [basename(p.part), p.placement]));

  const out: FrameResult = { set: frame.set, index: frame.index, bases: [] };
  const perBasis = new Map<BasisName, { anchored: string; eligible: Map<string, boolean>; result: BasisResult }>();

  for (const basis of BASES) {
    const anchorReport = anchorReportFor(posed, basis);
    const path = join(workDir, `anchor-${basis}.json`);
    writeFileSync(path, `${JSON.stringify(anchorReport)}\n`);
    const report = estimateChainFit({
      candidatePath: CANDIDATE,
      imagesDir: partsDir,
      framePath: frame.path,
      anchorPath: path,
      minVisible: 0,
    });
    const eligibleNow = new Map<string, boolean>();
    for (const part of anchorReport.parts) {
      const p = part.placement;
      eligibleNow.set(
        basename(part.part),
        p !== null && eligible(p.residual, p.unexplained, part.ambiguous, part.refusal !== null),
      );
    }
    const result: BasisResult = {
      basis,
      base: readingsOf(report),
      baseAnchored: report.anchor.anchored,
      replicates: [],
    };
    out.bases.push(result);
    perBasis.set(basis, { anchored: anchoredBy(report), eligible: eligibleNow, result });
  }

  for (const rung of RUNGS) {
    for (let rep = 0; rep < reps; rep++) {
      // Seeded per (frame, rung, replicate) so one frame can be re-probed on its
      // own and produce the same draws it produced in a whole-corpus run.
      const draw = rng(seed + frame.index * 7919 + rung.name.length * 104729 + rep * 15485863 + frame.set.length * 31);
      const jittered = JSON.parse(JSON.stringify(posed)) as PoseReport;
      for (const part of jittered.parts) {
        const name = basename(part.part);
        const moveable = movable.find((a) => a.name === name);
        if (moveable === undefined) continue;
        const p = part.placement;
        if (p === null) continue;
        p.x += (draw() * 2 - 1) * rung.px;
        p.y += (draw() * 2 - 1) * rung.px;
        p.rotationDeg += (draw() * 2 - 1) * rung.deg;
        p.scale *= 1 + (draw() * 2 - 1) * rung.scale;
        // Re-measured, and written back as the DELTA the move induced rather than
        // as the absolute the copy reports: the base numbers stay the shipped
        // instrument's own, so the hand copy's absolute offset cannot leak into
        // an eligibility test or a tie-break.
        const moved = measureAt(level, material.plate, moveable.plate, p.x, p.y, p.rotationDeg, p.scale);
        p.residual += moved.residual - moveable.base.residual;
        p.unexplained += moved.unexplained - moveable.base.unexplained;
      }

      for (const basis of BASES) {
        const held = perBasis.get(basis);
        if (held === undefined) continue;
        const anchorReport = anchorReportFor(jittered, basis);
        // ⚠️ Δresidual is measured over the parts THIS basis actually anchors on.
        // Averaged over every part it would be a statistic about the jitter rather
        // than about the input the instrument consumed.
        let worst = 0;
        let sum = 0;
        let n = 0;
        let maxMove = 0;
        const flips: string[] = [];
        for (const part of anchorReport.parts) {
          const name = basename(part.part);
          const p = part.placement;
          const original = originals.get(name);
          if (p === null || original === undefined || original === null) continue;
          const wasEligible = held.eligible.get(name) ?? false;
          const nowEligible = eligible(p.residual, p.unexplained, part.ambiguous, part.refusal !== null);
          if (nowEligible !== wasEligible) flips.push(name);
          if (!wasEligible && !nowEligible) continue;
          const delta = Math.abs(p.residual - original.residual);
          if (delta > worst) worst = delta;
          sum += delta;
          n++;
          const move = Math.hypot(p.x - original.x, p.y - original.y);
          if (move > maxMove) maxMove = move;
        }
        const path = join(workDir, `anchor-jitter-${basis}.json`);
        writeFileSync(path, `${JSON.stringify(anchorReport)}\n`);
        const report = estimateChainFit({
          candidatePath: CANDIDATE,
          imagesDir: partsDir,
          framePath: frame.path,
          anchorPath: path,
          minVisible: 0,
        });
        held.result.replicates.push({
          rung: rung.name,
          rep,
          worstAnchorResidualDelta: worst,
          meanAnchorResidualDelta: n > 0 ? sum / n : 0,
          maxAnchorDisplacementPx: maxMove,
          eligibilityFlips: flips,
          anchorSetChanged: anchoredBy(report) !== held.anchored,
          readings: readingsOf(report),
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// the ceiling — the clause-adjacent statistic, and the only one implemented
// ---------------------------------------------------------------------------

/**
 * The order statistic gate v2.4's kind-5 visibility ceiling is actually read off.
 *
 * ⭐ This is why #323 calls the stake clause-adjacent, and it is sharper than
 * "adjacent". The clause's **only** implementation to date —
 * `bench/runs/2026-09-03-spineboy-2/tools/readdown.ts`, which produced that run's
 * `evidence/g2-read-down.txt` — states its convention in as many words: *"the
 * ceiling is `chainfit`'s `visibleShare` … taken as the MAXIMUM over all 147
 * committed frames"*, mapped part → slot through the candidate's own skins. The
 * BAR is then *"the smallest ceiling among the slots check DOES attribute"* — a
 * minimum over slots of a maximum over frames.
 *
 * Two extreme-order statistics of the quantity this study is measuring. A maximum
 * over 147 frames is the statistic an upward outlier moves most, and this mode
 * measures how far both of them travel when the fit moves inside the band.
 *
 * ⚠️ **The absolute numbers here are NOT a re-derivation of that record's.** That
 * run read a probe candidate (`fit/chainfit.json` names `/tmp/sb2/probe`) through
 * its own pipeline at `--min-visible 0.05`; this reads the committed
 * `spine/skeleton.json` under this study's declared anchor basis. What transfers is
 * the SPREAD of the statistic, which is a fact about the quantity rather than
 * about either candidate. The run's flag is matched (`--min-visible 0.05`) because
 * that flag is not inert: it gates the unmasked relocation look, so it changes the
 * fit and not only which rows get refused.
 */
const CEILING_MIN_VISIBLE = 0.05;

/**
 * The slots that run's `check` attributed somewhere in the corpus, taken from its
 * frozen `evidence/g2-read-down.txt` rather than re-derived.
 *
 * ⭐ Deliberately taken: the attribution half of the clause is `check`'s and this
 * study is not re-running it. Only the ceiling statistic is re-measured, so the
 * table below moves exactly one of the two inputs and the other is held at the
 * record's own value.
 */
const BLANK_EVERYWHERE = new Set(['eye', 'rear-upper-arm', 'front-thigh', 'gun', 'muzzle', 'muzzle-glow', 'muzzle-ring']);

/** part image name -> the slot it sits in, exactly as `readdown.ts` builds it. */
function slotOfPart(): Map<string, string> {
  const parsed: unknown = JSON.parse(readFileSync(join(CANDIDATE, 'skeleton.json'), 'utf8'));
  const skins = (parsed as { skins?: { attachments?: Record<string, Record<string, unknown>> }[] }).skins ?? [];
  const out = new Map<string, string>();
  for (const skin of skins) {
    for (const [slot, attachments] of Object.entries(skin.attachments ?? {})) {
      for (const part of Object.keys(attachments)) out.set(part, slot);
    }
  }
  return out;
}

interface CeilingRow {
  /** `-1` is the unperturbed fit. */
  rep: number;
  set: string;
  index: number;
  slot: string;
  share: number;
}

// ---------------------------------------------------------------------------
// the passes sweep — does converging the frozen set onto the fit cure it?
// ---------------------------------------------------------------------------

/**
 * The same perturbation at `--passes` 1, 2 and 4.
 *
 * ⭐ This is the mechanism question, and it is what #323's step 2 needs answered
 * before it can choose a branch. `visibleShare` is measured on the visible set
 * FROZEN at each bone's seed placement, which on pass 2 is pass 1's answer — so if
 * the instability is an artifact of the set being frozen somewhere the answer is
 * not, more passes converge the two and the swing shrinks. If the swing is flat in
 * `--passes`, the set and the answer already agree and what is moving is the fit
 * itself, which no mask definition can quieten.
 *
 * Read at the headline rung only, on both bases: the point is the trend in
 * `passes`, and paying for it at four other rungs buys nothing.
 */
const PASSES_LADDER = [1, 2, 4];

interface PassesRow {
  set: string;
  index: number;
  basis: BasisName;
  passes: number;
  rep: number;
  readings: Reading[];
}

interface PassesResult {
  base: { set: string; index: number; basis: BasisName; passes: number; readings: Reading[] }[];
  rows: PassesRow[];
}

function probePasses(
  frame: FrameRef,
  partsDir: string,
  reps: number,
  seed: number,
  rung: Rung,
  poseCacheDir: string,
  workDir: string,
): PassesResult {
  const cachePath = join(poseCacheDir, `${frame.set.replace(/[^\w@-]/g, '_')}-f${String(frame.index).padStart(4, '0')}.json`);
  const posed = JSON.parse(readFileSync(cachePath, 'utf8')) as PoseReport;
  const framePlate = readPlate(frame.path);
  const background = readBackground(framePlate);
  const material = materialPlate(framePlate, background);
  const level = levelOf(material.plate, 1);
  const movable = new Map<string, { plate: Plate; base: { residual: number; unexplained: number } }>();
  for (const part of posed.parts) {
    const p = part.placement;
    if (p === null) continue;
    const plate = readPlate(join(partsDir, basename(part.part)));
    movable.set(basename(part.part), {
      plate,
      base: measureAt(level, material.plate, plate, p.x, p.y, p.rotationDeg, p.scale),
    });
  }

  const out: PassesResult = { base: [], rows: [] };
  for (const basis of BASES) {
    for (const passes of PASSES_LADDER) {
      const path = join(workDir, `passes-base-${basis}.json`);
      writeFileSync(path, `${JSON.stringify(anchorReportFor(posed, basis))}\n`);
      out.base.push({
        set: frame.set,
        index: frame.index,
        basis,
        passes,
        readings: readingsOf(
          estimateChainFit({
            candidatePath: CANDIDATE,
            imagesDir: partsDir,
            framePath: frame.path,
            anchorPath: path,
            minVisible: 0,
            passes,
          }),
        ),
      });
    }
  }

  for (let rep = 0; rep < reps; rep++) {
    // ⚠️ The SAME draw stream as the ladder's, so a row here is the same
    // perturbation the sensitivity table reports — only the pass count differs.
    const draw = rng(seed + frame.index * 7919 + rung.name.length * 104729 + rep * 15485863 + frame.set.length * 31);
    const jittered = JSON.parse(JSON.stringify(posed)) as PoseReport;
    for (const part of jittered.parts) {
      const held = movable.get(basename(part.part));
      const p = part.placement;
      if (held === undefined || p === null) continue;
      p.x += (draw() * 2 - 1) * rung.px;
      p.y += (draw() * 2 - 1) * rung.px;
      p.rotationDeg += (draw() * 2 - 1) * rung.deg;
      p.scale *= 1 + (draw() * 2 - 1) * rung.scale;
      const moved = measureAt(level, material.plate, held.plate, p.x, p.y, p.rotationDeg, p.scale);
      p.residual += moved.residual - held.base.residual;
      p.unexplained += moved.unexplained - held.base.unexplained;
    }
    for (const basis of BASES) {
      const path = join(workDir, `passes-jitter-${basis}.json`);
      writeFileSync(path, `${JSON.stringify(anchorReportFor(jittered, basis))}\n`);
      for (const passes of PASSES_LADDER) {
        out.rows.push({
          set: frame.set,
          index: frame.index,
          basis,
          passes,
          rep,
          readings: readingsOf(
            estimateChainFit({
              candidatePath: CANDIDATE,
              imagesDir: partsDir,
              framePath: frame.path,
              anchorPath: path,
              minVisible: 0,
              passes,
            }),
          ),
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// the band sweep — what a displacement costs the objective
// ---------------------------------------------------------------------------

/**
 * How much of the objective one axis of displacement buys, per anchor part.
 *
 * This is the measurement the perturbation band is defended from. `pose`'s polish
 * stops probing at 0.05 px / 0.1° / 0.1 % scale, so the fitter cannot distinguish
 * placements inside that box **whatever** the objective does there — but "inside
 * the band" and "a residual change of #322's size" are two different statements,
 * and this sweep is what connects them: it prices the box in residual, so the
 * ladder above can be read against #322's own 0.0008 rather than beside it.
 *
 * One axis at a time, both signs, over a magnitude ladder. Cheap: no `chainfit`
 * runs, only the objective.
 */
const BAND_PX = [0.0005, 0.005, 0.05, 0.1, 0.2, 0.5, 1, 2];
const BAND_DEG = [0.01, 0.1, 0.2, 0.4, 0.27, 1, 2];
const BAND_SCALE = [0.0001, 0.001, 0.002, 0.004, 0.01, 0.031, 0.1];

interface BandRow {
  set: string;
  index: number;
  part: string;
  axis: 'x' | 'rot' | 'scale';
  magnitude: number;
  /** Mean |Δresidual| over the two signs — the objective is not symmetric off an optimum. */
  delta: number;
}

function bandSweep(frame: FrameRef, partsDir: string, poseCacheDir: string): BandRow[] {
  const cachePath = join(poseCacheDir, `${frame.set.replace(/[^\w@-]/g, '_')}-f${String(frame.index).padStart(4, '0')}.json`);
  if (!existsSync(cachePath)) throw new Error(`no cached pose report for ${frame.set}/f${frame.index} — run the ladder first`);
  const posed = JSON.parse(readFileSync(cachePath, 'utf8')) as PoseReport;
  const framePlate = readPlate(frame.path);
  const background = readBackground(framePlate);
  const material = materialPlate(framePlate, background);
  const level = levelOf(material.plate, 1);
  const rows: BandRow[] = [];
  for (const part of posed.parts) {
    const name = basename(part.part);
    if (!DECLARED_ANCHORS.has(name.replace(/\.png$/, ''))) continue;
    const p = part.placement;
    if (p === null) continue;
    const plate = readPlate(join(partsDir, name));
    const at = (cx: number, cy: number, rot: number, sc: number): number =>
      measureAt(level, material.plate, plate, cx, cy, rot, sc).residual;
    const base = at(p.x, p.y, p.rotationDeg, p.scale);
    for (const m of BAND_PX) {
      rows.push({
        set: frame.set,
        index: frame.index,
        part: name,
        axis: 'x',
        magnitude: m,
        delta: (Math.abs(at(p.x + m, p.y, p.rotationDeg, p.scale) - base) + Math.abs(at(p.x - m, p.y, p.rotationDeg, p.scale) - base)) / 2,
      });
    }
    for (const m of BAND_DEG) {
      rows.push({
        set: frame.set,
        index: frame.index,
        part: name,
        axis: 'rot',
        magnitude: m,
        delta:
          (Math.abs(at(p.x, p.y, p.rotationDeg + m, p.scale) - base) + Math.abs(at(p.x, p.y, p.rotationDeg - m, p.scale) - base)) / 2,
      });
    }
    for (const m of BAND_SCALE) {
      rows.push({
        set: frame.set,
        index: frame.index,
        part: name,
        axis: 'scale',
        magnitude: m,
        delta:
          (Math.abs(at(p.x, p.y, p.rotationDeg, p.scale * (1 + m)) - base) + Math.abs(at(p.x, p.y, p.rotationDeg, p.scale * (1 - m)) - base)) / 2,
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// the run
// ---------------------------------------------------------------------------

if (import.meta.main) {
  const args = process.argv.slice(2);
  const workDir = args[0];
  if (workDir === undefined) {
    process.stderr.write('usage: vsprobe.ts <work-dir> [--frames N] [--reps N] [--seed N]\n');
    process.exit(2);
  }
  const flag = (name: string, fallback: number): number => {
    const at = args.indexOf(`--${name}`);
    if (at < 0) return fallback;
    const value = Number(args[at + 1]);
    if (!Number.isFinite(value)) throw new Error(`--${name} takes a number`);
    return value;
  };
  const reps = flag('reps', 8);
  const seed = flag('seed', 20260903);
  const limit = flag('frames', 0);

  mkdirSync(workDir, { recursive: true });
  const poseCacheDir = join(workDir, 'pose');
  mkdirSync(poseCacheDir, { recursive: true });
  const partsDir = buildParts(workDir);
  const scale = declaredScale();
  let frames = corpus();
  if (limit > 0) {
    // A stride rather than a prefix: `death` alone is 60 of the 147 frames, so the
    // first N of the declaration order is one animation and not a sample of the
    // corpus.
    const stride = Math.max(1, Math.floor(frames.length / limit));
    frames = frames.filter((_, i) => i % stride === 0).slice(0, limit);
  }

  // `pose` is the expensive half and the same for every replicate and both bases,
  // so it is cached on disk and can be warmed on its own.
  if (args.includes('--pose-only')) {
    for (const [i, frame] of frames.entries()) {
      const cachePath = join(
        poseCacheDir,
        `${frame.set.replace(/[^\w@-]/g, '_')}-f${String(frame.index).padStart(4, '0')}.json`,
      );
      if (!existsSync(cachePath)) {
        const posed = estimatePose({ imagesDir: partsDir, framePath: frame.path, scale: { min: scale, max: scale } });
        writeFileSync(cachePath, `${JSON.stringify(posed)}\n`);
      }
      process.stderr.write(`\rpose ${i + 1}/${frames.length}          `);
    }
    process.stderr.write('\n');
    process.exit(0);
  }

  if (args.includes('--ceiling')) {
    const rung = RUNGS.find((r) => r.name === 'polish-floor');
    if (rung === undefined) throw new Error('no polish-floor rung to read the ceiling at');
    const slots = slotOfPart();
    const rows: CeilingRow[] = [];
    const started = Date.now();
    for (const [i, frame] of frames.entries()) {
      const cachePath = join(
        poseCacheDir,
        `${frame.set.replace(/[^\w@-]/g, '_')}-f${String(frame.index).padStart(4, '0')}.json`,
      );
      const posed = JSON.parse(readFileSync(cachePath, 'utf8')) as PoseReport;
      const framePlate = readPlate(frame.path);
      const background = readBackground(framePlate);
      const material = materialPlate(framePlate, background);
      const level = levelOf(material.plate, 1);
      const movable = new Map<string, { plate: Plate; base: { residual: number; unexplained: number } }>();
      for (const part of posed.parts) {
        const p = part.placement;
        if (p === null) continue;
        const plate = readPlate(join(partsDir, basename(part.part)));
        movable.set(basename(part.part), {
          plate,
          base: measureAt(level, material.plate, plate, p.x, p.y, p.rotationDeg, p.scale),
        });
      }
      const record = (rep: number, report: PoseReport): void => {
        const path = join(workDir, 'ceiling-anchor.json');
        writeFileSync(path, `${JSON.stringify(anchorReportFor(report, 'declared'))}\n`);
        const fit = estimateChainFit({
          candidatePath: CANDIDATE,
          imagesDir: partsDir,
          framePath: frame.path,
          anchorPath: path,
          minVisible: CEILING_MIN_VISIBLE,
        });
        for (const part of fit.parts) {
          if (part.placement === null) continue;
          const name = basename(part.part);
          rows.push({
            rep,
            set: frame.set,
            index: frame.index,
            slot: slots.get(name.replace(/\.png$/, '')) ?? name.replace(/\.png$/, ''),
            share: part.placement.visibleShare,
          });
        }
      };
      record(-1, posed);
      for (let rep = 0; rep < reps; rep++) {
        const draw = rng(seed + frame.index * 7919 + rung.name.length * 104729 + rep * 15485863 + frame.set.length * 31);
        const jittered = JSON.parse(JSON.stringify(posed)) as PoseReport;
        for (const part of jittered.parts) {
          const held = movable.get(basename(part.part));
          const p = part.placement;
          if (held === undefined || p === null) continue;
          p.x += (draw() * 2 - 1) * rung.px;
          p.y += (draw() * 2 - 1) * rung.px;
          p.rotationDeg += (draw() * 2 - 1) * rung.deg;
          p.scale *= 1 + (draw() * 2 - 1) * rung.scale;
          const moved = measureAt(level, material.plate, held.plate, p.x, p.y, p.rotationDeg, p.scale);
          p.residual += moved.residual - held.base.residual;
          p.unexplained += moved.unexplained - held.base.unexplained;
        }
        record(rep, jittered);
      }
      process.stderr.write(`\rceiling ${i + 1}/${frames.length} (${((Date.now() - started) / 1000).toFixed(0)}s)      `);
    }
    process.stderr.write('\n');
    writeFileSync(
      join(workDir, 'ceiling.json'),
      `${JSON.stringify({
        rung: rung.name,
        minVisible: CEILING_MIN_VISIBLE,
        blankEverywhere: [...BLANK_EVERYWHERE],
        frames: frames.length,
        reps,
        seed,
        rows,
      })}\n`,
    );
    process.stderr.write(`wrote ${join(workDir, 'ceiling.json')}\n`);
    process.exit(0);
  }

  if (args.includes('--passes-sweep')) {
    const rung = RUNGS.find((r) => r.name === 'polish-floor');
    if (rung === undefined) throw new Error('no polish-floor rung to sweep passes at');
    const base: PassesResult['base'] = [];
    const rows: PassesRow[] = [];
    const started = Date.now();
    for (const [i, frame] of frames.entries()) {
      const got = probePasses(frame, partsDir, reps, seed, rung, poseCacheDir, workDir);
      base.push(...got.base);
      rows.push(...got.rows);
      process.stderr.write(`\rpasses ${i + 1}/${frames.length} (${((Date.now() - started) / 1000).toFixed(0)}s)      `);
    }
    process.stderr.write('\n');
    writeFileSync(
      join(workDir, 'passes.json'),
      `${JSON.stringify({ rung: rung.name, ladder: PASSES_LADDER, reps, seed, frames: frames.length, base, rows })}\n`,
    );
    process.stderr.write(`wrote ${join(workDir, 'passes.json')}\n`);
    process.exit(0);
  }

  // The band sweep runs off the cached `pose` reports the ladder wrote, so it is a
  // second pass over the same corpus rather than a second measurement of it.
  if (args.includes('--band')) {
    const rows: BandRow[] = [];
    for (const frame of frames) rows.push(...bandSweep(frame, partsDir, poseCacheDir));
    writeFileSync(join(workDir, 'band.json'), `${JSON.stringify({ px: BAND_PX, deg: BAND_DEG, scale: BAND_SCALE, rows })}\n`);
    process.stderr.write(`wrote ${join(workDir, 'band.json')} — ${rows.length} row(s)\n`);
    process.exit(0);
  }

  const control = { worst: 0, worstPart: '' };
  const results: FrameResult[] = [];
  const started = Date.now();
  for (const [i, frame] of frames.entries()) {
    results.push(probeFrame(frame, partsDir, scale, reps, seed, poseCacheDir, workDir, control));
    const done = i + 1;
    process.stderr.write(
      `\r${done}/${frames.length} ${frame.set}/f${String(frame.index).padStart(4, '0')} ` +
        `(${((Date.now() - started) / 1000).toFixed(0)}s)          `,
    );
  }
  process.stderr.write('\n');

  writeFileSync(
    join(workDir, 'raw.json'),
    `${JSON.stringify({
      corpus: { root: 'bench/reference/spineboy/ess', frames: frames.length, declaredScale: scale },
      candidate: 'bench/runs/2026-09-03-spineboy-2/spine',
      bases: BASES,
      anchors: [...DECLARED_ANCHORS].sort(),
      minVisible: 0,
      seed,
      reps,
      rungs: RUNGS,
      objectiveCopyControl: control,
      results,
    })}\n`,
  );
  process.stderr.write(`wrote ${join(workDir, 'raw.json')}\n`);
  process.stderr.write(`objective copy control: worst |mine - reported| = ${control.worst.toExponential(3)} on ${control.worstPart}\n`);
}
