/**
 * The study's tables, folded out of `vsprobe.ts`'s raw store.
 *
 * Every figure the study README and the landing comment quote is printed by this
 * file, so a reader checks a number by running one command rather than by trusting
 * a transcription. Nothing is computed twice: the raw store holds one row per
 * (frame, basis, rung, replicate, part) and this only folds it.
 *
 *   bun bench/studies/2026-09-03-visibleshare/tools/vsreport.ts <work-dir> <out-dir>
 *
 * Writes `band.txt`, `sensitivity.txt`, `distribution.txt`, `controls.txt` and
 * `census.json` into `<out-dir>`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The bands `docs/LADDER.md`'s run-2 agreement table assigns readings to. */
const LADDER_BANDS: { label: string; lo: number; hi: number }[] = [
  { label: '<10%', lo: 0, hi: 0.1 },
  { label: '10-25%', lo: 0.1, hi: 0.25 },
  { label: '25-50%', lo: 0.25, hi: 0.5 },
  { label: '50-75%', lo: 0.5, hi: 0.75 },
  { label: '>=75%', lo: 0.75, hi: Infinity },
];

function bandOf(share: number): string {
  for (const b of LADDER_BANDS) if (share >= b.lo && share < b.hi) return b.label;
  return LADDER_BANDS[LADDER_BANDS.length - 1].label;
}

/**
 * What counts as "the part itself moved".
 *
 * The two are not one threshold on one quantity: `MOVED_PX` is a whole frame pixel
 * on a 384x367 picture of a figure about 100 px tall, so it is a visible
 * relocation rather than a numerical wobble; `MOVED_DEG` is `AMBIGUITY_HINGE_DEG`,
 * the angle `chainfit` itself calls two answers rather than one. `STILL_PX` and
 * `STILL_DEG` are the other side of the same question and deliberately leave a gap
 * in between, which the tables report as its own class rather than assigning.
 */
const MOVED_PX = 1;
const MOVED_DEG = 5;
const STILL_PX = 0.25;
const STILL_DEG = 1;

/** The swing a cell has to show before the attribution table looks at it. */
const BIG_SWING = 0.1;

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
  worstAnchorResidualDelta: number;
  meanAnchorResidualDelta: number;
  maxAnchorDisplacementPx: number;
  eligibilityFlips: string[];
  anchorSetChanged: boolean;
  readings: Reading[];
}

interface BasisResult {
  basis: string;
  base: Reading[];
  baseAnchored: string[];
  replicates: Replicate[];
}

interface FrameResult {
  set: string;
  index: number;
  bases: BasisResult[];
}

interface Rung {
  name: string;
  px: number;
  deg: number;
  scale: number;
  basis: string;
}

interface Raw {
  corpus: { root: string; frames: number; declaredScale: number };
  candidate: string;
  bases: string[];
  anchors: string[];
  minVisible: number;
  seed: number;
  reps: number;
  rungs: Rung[];
  objectiveCopyControl: { worst: number; worstPart: string };
  results: FrameResult[];
}

interface BandRow {
  set: string;
  index: number;
  part: string;
  axis: 'x' | 'rot' | 'scale';
  magnitude: number;
  delta: number;
}

interface BandRaw {
  px: number[];
  deg: number[];
  scale: number[];
  rows: BandRow[];
}

// ---------------------------------------------------------------------------
// small statistics, spelled out
// ---------------------------------------------------------------------------

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const at = q * (sorted.length - 1);
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

const median = (values: number[]): number => quantile([...values].sort((a, b) => a - b), 0.5);

const f = (n: number, places = 4): string => (Number.isFinite(n) ? n.toFixed(places) : '—');

const pct = (n: number, d: number, places = 2): string => `${((n / Math.max(1, d)) * 100).toFixed(places)}%`;

function table(header: string[], rows: string[][]): string[] {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const line = (cells: string[]): string =>
    cells.map((c, i) => (i > 0 ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join('  ');
  return [line(header), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(line)];
}

const basisOf = (frame: FrameResult, basis: string): BasisResult | undefined =>
  frame.bases.find((b) => b.basis === basis);

const normDeg = (deg: number): number => {
  let d = ((deg + 180) % 360 + 360) % 360 - 180;
  if (d === -180) d = 180;
  return Math.abs(d);
};

// ---------------------------------------------------------------------------
// band.txt — what a displacement costs the objective
// ---------------------------------------------------------------------------

function bandReport(band: BandRaw): string[] {
  const out: string[] = [
    'visibleShare study — the perturbation band, priced in residual',
    '',
    "One axis at a time off each declared anchor's own reported placement, both signs, the objective",
    "re-measured with pose's own arithmetic. `delta` is the mean |Δresidual| over the two signs.",
    '',
    'The two bands this study perturbs inside of, and where they came from:',
    '  polish floor   0.05 px / 0.1° / 0.1% scale  — src/pose.ts level-0 polish `floor`, the step at which',
    '                                                the pattern search stops halving and returns',
    '  readback floor 0.16 px / 0.27° / 3.1% scale — PS01/PS02 worst known-answer readback, #306 re-baseline',
    '',
    "For scale: PR #322's accidental objective change moved rear-bracer's anchor residual by 0.0008.",
    '',
  ];
  for (const axis of ['x', 'rot', 'scale'] as const) {
    const mags = [...new Set(band.rows.filter((r) => r.axis === axis).map((r) => r.magnitude))].sort((a, b) => a - b);
    const rows: string[][] = mags.map((m) => {
      const sorted = band.rows
        .filter((r) => r.axis === axis && r.magnitude === m)
        .map((r) => r.delta)
        .sort((a, b) => a - b);
      const note =
        (axis === 'x' && m === 0.05) || (axis === 'rot' && m === 0.1) || (axis === 'scale' && m === 0.001)
          ? '<- polish floor'
          : (axis === 'x' && m === 0.16) || (axis === 'rot' && m === 0.27) || (axis === 'scale' && m === 0.031)
            ? '<- readback floor'
            : '';
      return [
        axis === 'scale' ? `${(m * 100).toFixed(2)}%` : String(m),
        String(sorted.length),
        f(quantile(sorted, 0.5), 6),
        f(quantile(sorted, 0.9), 6),
        f(sorted[sorted.length - 1], 6),
        note,
      ];
    });
    const unit = axis === 'x' ? 'px' : axis === 'rot' ? 'deg' : 'scale ratio';
    out.push(`## displacement on ${axis} (${unit})`, '');
    out.push(...table(['magnitude', 'probes', 'median dRes', 'p90 dRes', 'max dRes', ''], rows));
    out.push('');
  }
  return out;
}

// ---------------------------------------------------------------------------
// pairing
// ---------------------------------------------------------------------------

interface Paired {
  set: string;
  index: number;
  part: string;
  role: string;
  baseShare: number;
  repShare: number;
  baseShareAtFit: number | null;
  repShareAtFit: number | null;
  dRes: number;
  ownMovePx: number;
  ownRotDeg: number;
  hingeMovedDeg: number;
  maxOtherMovePx: number;
  refusalMoved: boolean;
}

/** Every (frame, part, replicate) of one basis and rung whose share exists in both. */
function pairsFor(raw: Raw, basis: string, rung: string): { paired: Paired[]; vanished: number; appeared: number } {
  const paired: Paired[] = [];
  let vanished = 0;
  let appeared = 0;
  for (const frame of raw.results) {
    const held = basisOf(frame, basis);
    if (held === undefined) continue;
    const base = new Map(held.base.map((r) => [r.part, r]));
    for (const rep of held.replicates) {
      if (rep.rung !== rung) continue;
      // How far the frame's OTHER parts travelled under this same draw — the
      // difference between "its own mask changed because an occluder relocated"
      // and "nothing on this frame relocated and the number moved anyway".
      const moves = new Map<string, number>();
      for (const reading of rep.readings) {
        const b = base.get(reading.part);
        if (b === undefined || b.x === null || b.y === null || reading.x === null || reading.y === null) continue;
        moves.set(reading.part, Math.hypot(reading.x - b.x, reading.y - b.y));
      }
      for (const reading of rep.readings) {
        const b = base.get(reading.part);
        if (b === undefined) continue;
        if (b.share === null && reading.share === null) continue;
        if (b.share === null) {
          appeared++;
          continue;
        }
        if (reading.share === null) {
          vanished++;
          continue;
        }
        const ownMove =
          b.x === null || b.y === null || reading.x === null || reading.y === null
            ? 0
            : Math.hypot(reading.x - b.x, reading.y - b.y);
        const ownRot =
          b.rotationDeg === null || reading.rotationDeg === null ? 0 : normDeg(reading.rotationDeg - b.rotationDeg);
        const hinge = b.hingeDeg === null || reading.hingeDeg === null ? 0 : normDeg(reading.hingeDeg - b.hingeDeg);
        let maxOther = 0;
        for (const [name, move] of moves) {
          if (name === reading.part) continue;
          if (move > maxOther) maxOther = move;
        }
        paired.push({
          set: frame.set,
          index: frame.index,
          part: reading.part,
          role: reading.role,
          baseShare: b.share,
          repShare: reading.share,
          baseShareAtFit: b.shareAtFit,
          repShareAtFit: reading.shareAtFit,
          dRes: rep.worstAnchorResidualDelta,
          ownMovePx: ownMove,
          ownRotDeg: ownRot,
          hingeMovedDeg: hinge,
          maxOtherMovePx: maxOther,
          refusalMoved: (b.refusal ?? '') !== (reading.refusal ?? ''),
        });
      }
    }
  }
  return { paired, vanished, appeared };
}

// ---------------------------------------------------------------------------
// sensitivity.txt — the headline
// ---------------------------------------------------------------------------

function sensitivityReport(raw: Raw): string[] {
  const out: string[] = [
    'visibleShare study — sensitivity to a fit perturbation, by basis and rung',
    '',
    `corpus ${raw.corpus.frames} frames (${raw.corpus.root}) · candidate ${raw.candidate}`,
    `--min-visible ${raw.minVisible} · ${raw.reps} replicates/rung · seed ${raw.seed}`,
    `bases: declared = ${raw.anchors.join(',')} (the basis the quoted medians are on) · pose-criterion = pose's own §12.2 test (the basis #322's observation is on)`,
    '',
    '`dRes` is the largest |Dresidual| the jitter induced on any part THIS basis anchors on, re-measured',
    "with pose's own objective. `|Dshare|` is per (frame, part, replicate) against the unperturbed fit.",
    'The slope column is a ratio of medians, not a median of ratios: dividing each replicate by its own',
    'denominator — a residual difference of order 1e-4 — turns a rounding difference into an unbounded',
    'number.',
    '',
  ];
  const rows: string[][] = [];
  for (const basis of raw.bases) {
    for (const rung of raw.rungs) {
      const { paired, vanished, appeared } = pairsFor(raw, basis, rung.name);
      const medDres = median([...new Set(paired.map((p) => p.dRes))]);
      const abs = paired.map((p) => Math.abs(p.repShare - p.baseShare)).sort((a, b) => a - b);
      rows.push([
        basis,
        rung.name,
        `${rung.px}px/${rung.deg}deg/${(rung.scale * 100).toFixed(1)}%`,
        f(medDres, 6),
        String(abs.length),
        f(quantile(abs, 0.5)),
        f(quantile(abs, 0.9)),
        f(quantile(abs, 0.99)),
        f(abs[abs.length - 1] ?? NaN),
        f((quantile(abs, 0.5) / medDres) * 0.001),
        f((quantile(abs, 0.99) / medDres) * 0.001),
        String(vanished),
        String(appeared),
      ]);
    }
  }
  out.push(
    ...table(
      [
        'basis',
        'rung',
        'jitter bound',
        'median dRes',
        'paired',
        'med |dShare|',
        'p90',
        'p99',
        'max',
        'med dShare/0.001res',
        'p99 dShare/0.001res',
        'vanished',
        'appeared',
      ],
      rows,
    ),
  );

  out.push('', '## how often the swing is large — share of paired readings over a threshold', '');
  const thresholdRows: string[][] = [];
  for (const basis of raw.bases) {
    for (const rung of raw.rungs) {
      const abs = pairsFor(raw, basis, rung.name).paired.map((p) => Math.abs(p.repShare - p.baseShare));
      thresholdRows.push([
        basis,
        rung.name,
        String(abs.length),
        pct(abs.filter((v) => v > 0.01).length, abs.length),
        pct(abs.filter((v) => v > 0.05).length, abs.length),
        pct(abs.filter((v) => v > 0.1).length, abs.length),
        pct(abs.filter((v) => v > 0.25).length, abs.length),
        pct(abs.filter((v) => v > 0.5).length, abs.length),
      ]);
    }
  }
  out.push(...table(['basis', 'rung', 'paired', '>0.01', '>0.05', '>0.10', '>0.25', '>0.50'], thresholdRows));

  out.push('', '## the discrete channels — what a sub-band move can flip outright', '');
  const discreteRows: string[][] = [];
  for (const basis of raw.bases) {
    for (const rung of raw.rungs) {
      let reps = 0;
      let anchorSet = 0;
      let elig = 0;
      let refusalMoved = 0;
      let refusalTotal = 0;
      for (const frame of raw.results) {
        const held = basisOf(frame, basis);
        if (held === undefined) continue;
        const base = new Map(held.base.map((r) => [r.part, r]));
        for (const rep of held.replicates) {
          if (rep.rung !== rung.name) continue;
          reps++;
          if (rep.anchorSetChanged) anchorSet++;
          if (rep.eligibilityFlips.length > 0) elig++;
          for (const reading of rep.readings) {
            const b = base.get(reading.part);
            if (b === undefined) continue;
            refusalTotal++;
            if ((b.refusal ?? '') !== (reading.refusal ?? '')) refusalMoved++;
          }
        }
      }
      discreteRows.push([
        basis,
        rung.name,
        String(reps),
        `${anchorSet} (${pct(anchorSet, reps, 1)})`,
        `${elig} (${pct(elig, reps, 1)})`,
        `${refusalMoved}/${refusalTotal} (${pct(refusalMoved, refusalTotal)})`,
      ]);
    }
  }
  out.push(
    ...table(
      ['basis', 'rung', 'replicates', 'anchor set changed', 'anchor eligibility flipped', 'refusal reason moved'],
      discreteRows,
    ),
  );

  out.push(
    '',
    '## the two share fields, side by side',
    '',
    '`visibleShare` is measured on the set frozen at each bone\'s SEED placement; `visibleShareAtFit` is the',
    'same share recomputed where the answer landed, in one reverse-draw-order sweep over the final',
    'placements. If the frozen field is the unstable one, the instrument already carries a steadier',
    'quantity and the repair is which field gets quoted. `base drift` is |atFit - share| on the',
    'unperturbed fit: the instrument\'s own flag that the two disagree.',
    '',
  );
  const fieldRows: string[][] = [];
  for (const basis of raw.bases) {
    for (const rung of raw.rungs) {
      const { paired } = pairsFor(raw, basis, rung.name);
      const share = paired.map((p) => Math.abs(p.repShare - p.baseShare)).sort((a, b) => a - b);
      const atFit = paired
        .filter((p) => p.baseShareAtFit !== null && p.repShareAtFit !== null)
        .map((p) => Math.abs((p.repShareAtFit as number) - (p.baseShareAtFit as number)))
        .sort((a, b) => a - b);
      const drift = paired
        .filter((p) => p.baseShareAtFit !== null)
        .map((p) => Math.abs((p.baseShareAtFit as number) - p.baseShare))
        .sort((a, b) => a - b);
      fieldRows.push([
        basis,
        rung.name,
        f(quantile(share, 0.5)),
        f(quantile(share, 0.99)),
        f(share[share.length - 1] ?? NaN),
        f(quantile(atFit, 0.5)),
        f(quantile(atFit, 0.99)),
        f(atFit[atFit.length - 1] ?? NaN),
        f(quantile(drift, 0.5)),
        f(quantile(drift, 0.99)),
      ]);
    }
  }
  out.push(
    ...table(
      [
        'basis',
        'rung',
        'share med',
        'share p99',
        'share max',
        'atFit med',
        'atFit p99',
        'atFit max',
        'base drift med',
        'base drift p99',
      ],
      fieldRows,
    ),
  );

  out.push(
    '',
    `## attribution — of the cells that swing by more than ${BIG_SWING}, what moved`,
    '',
    `\`fit moved\`   the part's own placement travelled >${MOVED_PX} px or turned >${MOVED_DEG} deg (chainfit's own`,
    '              AMBIGUITY_HINGE_DEG): the share is faithfully reporting a limb that landed elsewhere.',
    `\`mask only\`   the part stayed within ${STILL_PX} px and ${STILL_DEG} deg of where it was, so the share moved`,
    '              without the part moving. Split by whether anything ELSE on the frame relocated.',
    '`between`     neither test — reported rather than assigned.',
    '',
    'The class that would make this a DEFINITIONAL problem is `mask only, nothing else moved`: a share',
    'that changes while every placement on the frame stands still is a statement about the mask and not',
    'about the fit.',
    '',
  );
  const attrRows: string[][] = [];
  for (const basis of raw.bases) {
    for (const rung of raw.rungs) {
      const big = pairsFor(raw, basis, rung.name).paired.filter((p) => Math.abs(p.repShare - p.baseShare) > BIG_SWING);
      const fitMoved = big.filter((p) => p.ownMovePx > MOVED_PX || p.ownRotDeg > MOVED_DEG || p.hingeMovedDeg > MOVED_DEG);
      const maskOnly = big.filter((p) => p.ownMovePx <= STILL_PX && p.ownRotDeg <= STILL_DEG && p.hingeMovedDeg <= STILL_DEG);
      const maskAlone = maskOnly.filter((p) => p.maxOtherMovePx <= MOVED_PX);
      attrRows.push([
        basis,
        rung.name,
        String(big.length),
        `${fitMoved.length} (${pct(fitMoved.length, big.length, 1)})`,
        `${maskOnly.length} (${pct(maskOnly.length, big.length, 1)})`,
        `${maskAlone.length} (${pct(maskAlone.length, big.length, 1)})`,
        String(big.length - fitMoved.length - maskOnly.length),
        f(median(maskOnly.map((p) => p.maxOtherMovePx)), 2),
      ]);
    }
  }
  out.push(
    ...table(
      [
        'basis',
        'rung',
        `cells >${BIG_SWING}`,
        'fit moved',
        'mask only',
        '  of which nothing else moved',
        'between',
        'median max other move px',
      ],
      attrRows,
    ),
  );
  out.push('');
  return out;
}

// ---------------------------------------------------------------------------
// distribution.txt — the shape, and whether a median of it is a number
// ---------------------------------------------------------------------------

function distributionReport(raw: Raw, basis: string, headline: string): string[] {
  const out: string[] = [
    `visibleShare study — the distribution on basis \`${basis}\` at rung \`${headline}\``,
    '',
    'Per (frame, part): `swing` is max-min of visibleShare over the replicates of this rung, so it is the',
    'width of the answer the same fit could have given inside the band. A cell is dropped where either the',
    'base or fewer than two replicates produced a placement.',
    '',
  ];

  const byPart = new Map<string, { swings: number[]; baseShares: number[]; role: string; depth: number }>();
  for (const frame of raw.results) {
    const held = basisOf(frame, basis);
    if (held === undefined) continue;
    const reps = held.replicates.filter((r) => r.rung === headline);
    for (const b of held.base) {
      if (b.share === null) continue;
      const shares: number[] = [];
      for (const rep of reps) {
        const r = rep.readings.find((x) => x.part === b.part);
        if (r === undefined || r.share === null) continue;
        shares.push(r.share);
      }
      if (shares.length < 2) continue;
      const entry = byPart.get(b.part) ?? { swings: [], baseShares: [], role: b.role, depth: b.depth };
      entry.swings.push(Math.max(...shares) - Math.min(...shares));
      entry.baseShares.push(b.share);
      byPart.set(b.part, entry);
    }
  }
  const partRows: string[][] = [...byPart.entries()]
    .sort((a, b) => median(b[1].swings) - median(a[1].swings))
    .map(([part, e]) => {
      const sorted = [...e.swings].sort((x, y) => x - y);
      return [
        part.replace(/\.png$/, ''),
        e.role,
        String(e.depth),
        String(e.swings.length),
        f(median(e.baseShares)),
        f(quantile(sorted, 0.5)),
        f(quantile(sorted, 0.9)),
        f(sorted[sorted.length - 1]),
      ];
    });
  out.push('## per part — the width of the answer, over the frames it has one on', '');
  out.push(
    ...table(['part', 'role', 'depth', 'frames', 'median base share', 'median swing', 'p90 swing', 'max swing'], partRows),
  );

  out.push('', '## by where the base share sits — a sliver and a mostly-visible part are not the same case', '');
  const bandRows: string[][] = LADDER_BANDS.map((band) => {
    const swings: number[] = [];
    for (const [, e] of byPart) {
      for (const [i, base] of e.baseShares.entries()) {
        if (base >= band.lo && base < band.hi) swings.push(e.swings[i]);
      }
    }
    const sorted = [...swings].sort((a, b) => a - b);
    return [
      band.label,
      String(swings.length),
      f(quantile(sorted, 0.5)),
      f(quantile(sorted, 0.9)),
      f(sorted[sorted.length - 1] ?? NaN),
    ];
  });
  out.push(...table(['base share band', 'cells', 'median swing', 'p90 swing', 'max swing'], bandRows));

  out.push(
    '',
    "## band migration — how often a reading changes the band LADDER's agreement table would file it under",
    '',
    'Bands as that table draws them. A reading that migrates was counted in one column of it and could',
    'equally have been counted in another, at a fit the instrument cannot tell from the one it used.',
    '',
  );
  const migrationRows: string[][] = [];
  for (const b of raw.bases) {
    for (const rung of raw.rungs) {
      const { paired } = pairsFor(raw, b, rung.name);
      let moved = 0;
      const perBand = new Map<string, { n: number; moved: number }>();
      for (const p of paired) {
        const from = bandOf(p.baseShare);
        const entry = perBand.get(from) ?? { n: 0, moved: 0 };
        entry.n++;
        if (from !== bandOf(p.repShare)) {
          entry.moved++;
          moved++;
        }
        perBand.set(from, entry);
      }
      migrationRows.push([
        b,
        rung.name,
        String(paired.length),
        pct(moved, paired.length),
        ...LADDER_BANDS.map((band) => {
          const e = perBand.get(band.label);
          return e === undefined || e.n === 0 ? '—' : pct(e.moved, e.n, 1);
        }),
      ]);
    }
  }
  out.push(
    ...table(['basis', 'rung', 'paired', 'any band change', ...LADDER_BANDS.map((b) => `from ${b.label}`)], migrationRows),
  );

  out.push(
    '',
    '## is a median of it a number? — the corpus median per part, recomputed on each replicate',
    '',
    'Each replicate index gives one whole-corpus reading of the instrument at a fit inside the band. The',
    "median over frames is what issue #284's landing table and LADDER quote; this is how far that median",
    'itself moves when the fit moves inside the band.',
    '',
  );
  const stabilityRows: string[][] = [];
  for (const part of byPart.keys()) {
    const perRep: number[] = [];
    for (let rep = 0; rep < raw.reps; rep++) {
      const shares: number[] = [];
      for (const frame of raw.results) {
        const held = basisOf(frame, basis);
        if (held === undefined) continue;
        const r = held.replicates.find((x) => x.rung === headline && x.rep === rep);
        if (r === undefined) continue;
        const reading = r.readings.find((x) => x.part === part);
        if (reading === undefined || reading.share === null) continue;
        shares.push(reading.share);
      }
      if (shares.length > 0) perRep.push(median(shares));
    }
    const baseShares: number[] = [];
    for (const frame of raw.results) {
      const held = basisOf(frame, basis);
      if (held === undefined) continue;
      const b = held.base.find((x) => x.part === part);
      if (b !== undefined && b.share !== null) baseShares.push(b.share);
    }
    if (perRep.length === 0 || baseShares.length === 0) continue;
    stabilityRows.push([
      part.replace(/\.png$/, ''),
      String(baseShares.length),
      f(median(baseShares)),
      f(Math.min(...perRep)),
      f(Math.max(...perRep)),
      f(Math.max(...perRep) - Math.min(...perRep)),
    ]);
  }
  stabilityRows.sort((a, b) => Number(b[5]) - Number(a[5]));
  out.push(...table(['part', 'frames', 'base median', 'min over replicates', 'max', 'spread'], stabilityRows));
  out.push('');
  return out;
}

// ---------------------------------------------------------------------------
// passes.txt — does converging the frozen set onto the fit cure it?
// ---------------------------------------------------------------------------

interface PassesRaw {
  rung: string;
  ladder: number[];
  reps: number;
  seed: number;
  frames: number;
  base: { set: string; index: number; basis: string; passes: number; readings: Reading[] }[];
  rows: { set: string; index: number; basis: string; passes: number; rep: number; readings: Reading[] }[];
}

function passesReport(sweep: PassesRaw): string[] {
  const out: string[] = [
    `visibleShare study — the same perturbation at --passes ${sweep.ladder.join(', ')}`,
    '',
    `rung ${sweep.rung} · ${sweep.frames} frames · ${sweep.reps} replicates · seed ${sweep.seed}`,
    '',
    "`visibleShare` is measured on the set frozen at each bone's seed, and pass n+1 seeds on pass n's own",
    'answer. So if the swing is an artifact of measuring the set somewhere the answer is not, more passes',
    'converge the two and it shrinks. A swing that is FLAT in `--passes` is the fit moving, and no mask',
    'definition reaches it.',
    '',
  ];
  const key = (r: { set: string; index: number; basis: string; passes: number }): string =>
    `${r.set}#${r.index}#${r.basis}#${r.passes}`;
  const bases = new Map<string, Map<string, Reading>>();
  for (const b of sweep.base) bases.set(key(b), new Map(b.readings.map((r) => [r.part, r])));

  const rows: string[][] = [];
  for (const basis of [...new Set(sweep.rows.map((r) => r.basis))]) {
    for (const passes of sweep.ladder) {
      const share: number[] = [];
      const atFit: number[] = [];
      const drift: number[] = [];
      let vanished = 0;
      for (const row of sweep.rows) {
        if (row.basis !== basis || row.passes !== passes) continue;
        const base = bases.get(key(row));
        if (base === undefined) continue;
        for (const reading of row.readings) {
          const b = base.get(reading.part);
          if (b === undefined || b.share === null) continue;
          if (reading.share === null) {
            vanished++;
            continue;
          }
          share.push(Math.abs(reading.share - b.share));
          if (b.shareAtFit !== null && reading.shareAtFit !== null) atFit.push(Math.abs(reading.shareAtFit - b.shareAtFit));
          if (b.shareAtFit !== null) drift.push(Math.abs(b.shareAtFit - b.share));
        }
      }
      share.sort((a, b) => a - b);
      atFit.sort((a, b) => a - b);
      drift.sort((a, b) => a - b);
      rows.push([
        basis,
        String(passes),
        String(share.length),
        f(quantile(share, 0.5)),
        f(quantile(share, 0.9)),
        f(quantile(share, 0.99)),
        f(share[share.length - 1] ?? NaN),
        pct(share.filter((v) => v > 0.1).length, share.length),
        f(quantile(atFit, 0.99)),
        f(quantile(drift, 0.5)),
        String(vanished),
      ]);
    }
  }
  out.push(
    ...table(
      [
        'basis',
        'passes',
        'paired',
        'med |dShare|',
        'p90',
        'p99',
        'max',
        '>0.10',
        'atFit p99',
        'base drift med',
        'vanished',
      ],
      rows,
    ),
  );
  out.push('');
  return out;
}

// ---------------------------------------------------------------------------
// ceiling.txt — the clause-adjacent statistic
// ---------------------------------------------------------------------------

interface CeilingRaw {
  rung: string;
  minVisible: number;
  blankEverywhere: string[];
  frames: number;
  reps: number;
  seed: number;
  rows: { rep: number; set: string; index: number; slot: string; share: number }[];
}

function ceilingReport(raw: CeilingRaw): string[] {
  const out: string[] = [
    'visibleShare study — the kind-5 ceiling and its bar, recomputed on each replicate',
    '',
    `rung ${raw.rung} · ${raw.frames} frames · ${raw.reps} replicates · seed ${raw.seed} · --min-visible ${raw.minVisible}`,
    '',
    "Gate v2.4's kind-5 visibility ceiling has exactly one implementation: the 2026-09-03 run 2's",
    "`tools/readdown.ts`, which states its convention as *chainfit's visibleShare, taken as the MAXIMUM",
    'over all 147 committed frames*, mapped part -> slot through the skins. Its BAR is *the smallest',
    'ceiling among the slots check DOES attribute* — a minimum over slots of a maximum over frames.',
    '',
    'Both are extreme-order statistics of the quantity this study measures. This table recomputes them',
    'per replicate. The attribution half is TAKEN from that run\'s frozen evidence/g2-read-down.txt and not',
    're-derived: the slots blank everywhere in that corpus are',
    `  ${raw.blankEverywhere.join(', ')}`,
    'so exactly one of the clause\'s two inputs moves here and the other is held at the record\'s value.',
    '',
    '⚠️ The ABSOLUTE numbers are not a re-derivation of that record. It read a probe candidate through its',
    "own pipeline; this reads the committed spine/skeleton.json under this study's declared anchor basis.",
    'What transfers is the SPREAD.',
    '',
  ];

  const reps = [...new Set(raw.rows.map((r) => r.rep))].sort((a, b) => a - b);
  const slots = [...new Set(raw.rows.map((r) => r.slot))].sort();
  /** ceiling[rep][slot] = max over frames. */
  const ceiling = new Map<number, Map<string, number>>();
  for (const row of raw.rows) {
    const per = ceiling.get(row.rep) ?? new Map<string, number>();
    per.set(row.slot, Math.max(per.get(row.slot) ?? 0, row.share));
    ceiling.set(row.rep, per);
  }
  const barOf = (rep: number): { value: number; slot: string } => {
    const per = ceiling.get(rep);
    if (per === undefined) return { value: NaN, slot: '?' };
    let best = { value: Infinity, slot: '?' };
    for (const [slot, value] of per) {
      // The bar is the smallest ceiling among the slots `check` DOES attribute, so
      // the blank-everywhere set is exactly what does not set it.
      if (raw.blankEverywhere.includes(slot)) continue;
      if (value < best.value) best = { value, slot };
    }
    return best;
  };

  out.push('## the ceiling per slot — max visibleShare over the corpus, per replicate', '');
  const rows: string[][] = slots.map((slot) => {
    const values = reps
      .map((rep) => ceiling.get(rep)?.get(slot))
      .filter((v): v is number => v !== undefined);
    const perturbed = reps
      .filter((r) => r >= 0)
      .map((rep) => ceiling.get(rep)?.get(slot))
      .filter((v): v is number => v !== undefined);
    const base = ceiling.get(-1)?.get(slot);
    return [
      slot,
      raw.blankEverywhere.includes(slot) ? 'blank' : 'attributed',
      base === undefined ? '—' : f(base * 100, 1),
      perturbed.length === 0 ? '—' : f(Math.min(...perturbed) * 100, 1),
      perturbed.length === 0 ? '—' : f(Math.max(...perturbed) * 100, 1),
      values.length === 0 ? '—' : f((Math.max(...values) - Math.min(...values)) * 100, 1),
    ];
  });
  out.push(
    ...table(['slot', 'clause side', 'base ceiling %', 'min over reps %', 'max %', 'spread pts'], rows),
  );

  out.push('', '## the bar, and which blank slots clear it', '');
  const barRows: string[][] = reps.map((rep) => {
    const bar = barOf(rep);
    const per = ceiling.get(rep);
    const below = raw.blankEverywhere
      .filter((slot) => {
        const value = per?.get(slot);
        return value !== undefined && value < bar.value;
      })
      .sort();
    return [
      rep < 0 ? 'base' : `rep ${rep}`,
      f(bar.value * 100, 1),
      bar.slot,
      String(below.length),
      below.join(',') || '—',
    ];
  });
  out.push(...table(['fit', 'bar %', 'bar set by', 'blank slots below the bar', 'which'], barRows));
  out.push('');
  return out;
}

// ---------------------------------------------------------------------------
// controls.txt
// ---------------------------------------------------------------------------

function controlsReport(raw: Raw): string[] {
  const perFrame = raw.results[0]?.bases.reduce((n, b) => n + b.replicates.length, 0) ?? 0;
  return [
    'visibleShare study — the controls, and what regenerates the store',
    '',
    `frames                     ${raw.corpus.frames}`,
    `declared scale (pinned)    ${raw.corpus.declaredScale}`,
    `candidate                  ${raw.candidate}`,
    `bases                      ${raw.bases.join(', ')}`,
    `declared anchor set        ${raw.anchors.join(', ')}`,
    `--min-visible              ${raw.minVisible}`,
    `replicates per rung        ${raw.reps}`,
    `rungs                      ${raw.rungs.map((r) => r.name).join(', ')}`,
    `chainfit runs in the store ${raw.corpus.frames * (perFrame + raw.bases.length)}`,
    `seed                       ${raw.seed}`,
    '',
    '## where each rungs bounds come from',
    '',
    ...raw.rungs.map((r) => `  ${r.name.padEnd(16)} ${String(r.px).padStart(5)} px / ${String(r.deg).padStart(4)} deg / ${(r.scale * 100).toFixed(2)}%  — ${r.basis}`),
    '',
    '## the objective hand copy, verified rather than trusted',
    '',
    "vsprobe.ts re-measures a moved placement with a hand copy of `src/pose.ts`'s own `measure`, which is",
    'not exported. The copy is checked on every placed part of every frame by re-measuring the UNPERTURBED',
    'reported placement and comparing against the residual the report itself carries:',
    '',
    `  worst |mine - reported|  ${raw.objectiveCopyControl.worst.toExponential(3)}  on ${raw.objectiveCopyControl.worstPart}`,
    '',
    'A report rounds x and y to 3 dp and residual to 5 dp, so a disagreement of this order is the rounding',
    'and not a second implementation. The perturbed residual is written back as the DELTA the move induced',
    "rather than as the copy's absolute, so the copy's own offset cannot reach an eligibility test.",
    '',
    '## regenerate',
    '',
    '  bash scripts/fetch-examples.sh',
    `  bun bench/studies/2026-09-03-visibleshare/tools/vsprobe.ts <work> --pose-only`,
    `  bun bench/studies/2026-09-03-visibleshare/tools/vsprobe.ts <work> --reps ${raw.reps} --seed ${raw.seed}`,
    '  bun bench/studies/2026-09-03-visibleshare/tools/vsprobe.ts <work> --band',
    `  bun bench/studies/2026-09-03-visibleshare/tools/vsprobe.ts <work> --passes-sweep --reps 6 --seed ${raw.seed}`,
    `  bun bench/studies/2026-09-03-visibleshare/tools/vsprobe.ts <work> --ceiling --reps ${raw.reps} --seed ${raw.seed}`,
    '  bun bench/studies/2026-09-03-visibleshare/tools/vsreport.ts <work> bench/studies/2026-09-03-visibleshare/evidence',
    '',
  ];
}

// ---------------------------------------------------------------------------

if (import.meta.main) {
  const workDir = process.argv[2];
  const outDir = process.argv[3];
  if (workDir === undefined || outDir === undefined) {
    process.stderr.write('usage: vsreport.ts <work-dir> <out-dir>\n');
    process.exit(2);
  }
  const raw = JSON.parse(readFileSync(join(workDir, 'raw.json'), 'utf8')) as Raw;
  // The headline is read on the basis the quoted medians are on, and at the rung
  // that is the fitter's own convergence band rather than a wider one.
  const headlineBasis = 'declared';
  const headlineRung = 'polish-floor';

  writeFileSync(join(outDir, 'sensitivity.txt'), `${sensitivityReport(raw).join('\n')}\n`);
  writeFileSync(
    join(outDir, 'distribution.txt'),
    `${distributionReport(raw, headlineBasis, headlineRung).join('\n')}\n`,
  );
  writeFileSync(join(outDir, 'controls.txt'), `${controlsReport(raw).join('\n')}\n`);

  const bandPath = join(workDir, 'band.json');
  if (existsSync(bandPath)) {
    const band = JSON.parse(readFileSync(bandPath, 'utf8')) as BandRaw;
    writeFileSync(join(outDir, 'band.txt'), `${bandReport(band).join('\n')}\n`);
  }
  const passesPath = join(workDir, 'passes.json');
  if (existsSync(passesPath)) {
    const sweep = JSON.parse(readFileSync(passesPath, 'utf8')) as PassesRaw;
    writeFileSync(join(outDir, 'passes.txt'), `${passesReport(sweep).join('\n')}\n`);
  }
  const ceilingPath = join(workDir, 'ceiling.json');
  if (existsSync(ceilingPath)) {
    const ceiling = JSON.parse(readFileSync(ceilingPath, 'utf8')) as CeilingRaw;
    writeFileSync(join(outDir, 'ceiling.txt'), `${ceilingReport(ceiling).join('\n')}\n`);
  }

  // The compact census: one row per (basis, rung, part), which is what the tables
  // above are folded from, and small enough to commit beside them.
  const census: Record<string, Record<string, Record<string, { cells: number; medianSwing: number; p90Swing: number; maxSwing: number }>>> = {};
  for (const basis of raw.bases) {
    census[basis] = {};
    for (const rung of raw.rungs) {
      const perPart = new Map<string, number[]>();
      for (const frame of raw.results) {
        const held = basisOf(frame, basis);
        if (held === undefined) continue;
        const reps = held.replicates.filter((r) => r.rung === rung.name);
        for (const b of held.base) {
          if (b.share === null) continue;
          const shares = reps
            .map((rep) => rep.readings.find((x) => x.part === b.part))
            .filter((r): r is Reading => r !== undefined && r.share !== null)
            .map((r) => r.share as number);
          if (shares.length < 2) continue;
          const list = perPart.get(b.part) ?? [];
          list.push(Math.max(...shares) - Math.min(...shares));
          perPart.set(b.part, list);
        }
      }
      census[basis][rung.name] = {};
      for (const [part, swings] of perPart) {
        const sorted = [...swings].sort((a, b) => a - b);
        census[basis][rung.name][part] = {
          cells: swings.length,
          medianSwing: Number(quantile(sorted, 0.5).toFixed(5)),
          p90Swing: Number(quantile(sorted, 0.9).toFixed(5)),
          maxSwing: Number(sorted[sorted.length - 1].toFixed(5)),
        };
      }
    }
  }
  writeFileSync(
    join(outDir, 'census.json'),
    `${JSON.stringify(
      {
        corpus: raw.corpus,
        candidate: raw.candidate,
        seed: raw.seed,
        reps: raw.reps,
        rungs: raw.rungs,
        headline: { basis: headlineBasis, rung: headlineRung },
        census,
      },
      null,
      1,
    )}\n`,
  );
  process.stderr.write(`wrote band/sensitivity/distribution/controls + census.json into ${outDir}\n`);
}
