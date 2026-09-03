/**
 * Read every committed frame through `rigc chainfit` and collect what it says.
 *
 * This is the instrument this run exists to price, so the tool records three
 * different things and keeps them apart:
 *
 *  1. **A pose vector per frame**, from `hingeDeg` — which §12.3 states is
 *     "the value a `rotate` key would carry", in Spine degrees about the bone's
 *     setup rotation. That is the same convention `tools/fitlib.ts` poses in, so
 *     it drops straight in as a search start and as a second opinion.
 *  2. **A visibility census per part**, from `visibleShare` — "the share of the
 *     part's own alpha weight the residual was computed on". Over every frame of
 *     every set this is a MEASURED ceiling on how much of a part the frames put
 *     on screen at all, which is the quantity `docs/GATE.md`'s G2 read-down asks
 *     for on a slot the frames cannot make attributable.
 *  3. **A refusal census** — `occluded`, `no-anchor`, `no-match`,
 *     `no-part-image`, `unsupported-geometry`, and how often each fired. A
 *     refusal is recorded rather than worked around.
 *
 * The pipeline per frame is `pose` (pinned scale) -> `tools/anchor.ts` ->
 * `chainfit --anchor`. `pose` is cached on disk because it is 40x the cost of
 * the `chainfit` call it feeds.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { framePath, sidecarOf } from './geom';
import { DEFAULT_ANCHORS } from './anchor';

const REF = process.env.REF ?? 'bench/reference/spineboy/ess';
const CAND = process.env.CAND ?? '/tmp/sb2/probe';
const PARTS = process.env.PARTS ?? '/tmp/sb2/ess-parts';
const POSE_DIR = process.env.POSE_DIR ?? '/tmp/sb2/pose/all';
const WORK = process.env.WORK ?? '/tmp/sb2/chainfit';
const SCALE = process.env.SCALE ?? '0.2215,0.2245';
const MIN_VISIBLE = process.env.MIN_VISIBLE ?? '0.05';
const out = process.argv[2] ?? 'bench/runs/2026-09-03-spineboy-2/fit/chainfit.json';
const only = process.argv.slice(3);

const sidecar = sidecarOf(REF);
mkdirSync(POSE_DIR, { recursive: true });
mkdirSync(WORK, { recursive: true });

/** slot -> bone, read out of the candidate itself so nothing is assumed. */
const skeleton = JSON.parse(readFileSync(join(CAND, 'skeleton.json'), 'utf8'));
const boneOfSlot = new Map<string, string>();
for (const slot of skeleton.slots ?? []) boneOfSlot.set(slot.name, slot.bone);

interface PartRead {
  part: string;
  role: string;
  bone: string | null;
  hingeDeg: number | null;
  localRotationDeg: number | null;
  stretch: number | null;
  residual: number | null;
  visibleShare: number | null;
  visibleShareAtFit: number | null;
  scoredPixels: number | null;
  ambiguous: boolean;
  refusal: string | null;
  anchorEligible: boolean | null;
  pivotDisagreementPx: number | null;
  carriedBones: string[];
}

interface FrameRead {
  set: string;
  index: number;
  trusted: number;
  read: number;
  bought: number;
  parts: PartRead[];
  pose: Record<string, number>;
}

const frames: FrameRead[] = [];

for (const s of sidecar.sets) {
  if (only.length && !only.includes(s.dir)) continue;
  const indices: number[] = s.written === s.sampled ? [...Array(s.written).keys()] : [0, s.sampled - 1];
  for (const i of indices) {
    const frame = framePath(REF, s.dir, i);
    if (!existsSync(frame)) continue;
    const tag = `${s.dir.replace('@', '-at-')}-f${String(i).padStart(4, '0')}`;
    const posePath = join(POSE_DIR, `${tag}.json`);
    if (!existsSync(posePath)) {
      const r = spawnSync('bun', ['cli.ts', 'pose', '--images', PARTS, '--frame', frame, '--scale', SCALE, '--out', posePath], {
        encoding: 'utf8',
      });
      if (r.status !== 0) throw new Error(`pose failed on ${tag}: ${r.stderr}`);
    }
    const anchorPath = join(WORK, `${tag}.anchor.json`);
    const report = JSON.parse(readFileSync(posePath, 'utf8'));
    const keep = new Set((process.env.ANCHORS ?? DEFAULT_ANCHORS.join(',')).split(','));
    for (const part of report.parts) {
      const name = String(part.part).replace(/\.png$/, '');
      if (keep.has(name)) continue;
      part.refusal = { reason: 'no-match', detail: "suppressed by the run's declared anchor set" };
      part.ambiguous = true;
    }
    writeFileSync(anchorPath, `${JSON.stringify(report)}\n`);

    const cfPath = join(WORK, `${tag}.chainfit.json`);
    const r = spawnSync(
      'bun',
      [
        'cli.ts',
        'chainfit',
        '--candidate',
        CAND,
        '--images',
        PARTS,
        '--frame',
        frame,
        '--anchor',
        anchorPath,
        '--min-visible',
        MIN_VISIBLE,
        '--out',
        cfPath,
      ],
      { encoding: 'utf8' },
    );
    if (r.status !== 0) throw new Error(`chainfit failed on ${tag}: ${r.stderr}`);
    const cf = JSON.parse(readFileSync(cfPath, 'utf8'));

    const parts: PartRead[] = [];
    const pose: Record<string, number> = {};
    for (const p of cf.parts ?? []) {
      const name = String(p.part).replace(/\.png$/, '');
      const placement = p.placement ?? null;
      const bone = p.bone?.name ?? boneOfSlot.get(name) ?? null;
      const hinge = placement?.hingeDeg ?? null;
      parts.push({
        part: name,
        role: p.role ?? 'unplaced',
        bone,
        hingeDeg: hinge,
        localRotationDeg: placement?.localRotationDeg ?? null,
        stretch: placement?.stretch ?? null,
        residual: placement?.residual ?? null,
        visibleShare: placement?.visibleShare ?? null,
        visibleShareAtFit: placement?.visibleShareAtFit ?? null,
        scoredPixels: placement?.scoredPixels ?? null,
        ambiguous: !!p.ambiguous,
        refusal: p.refusal?.reason ?? null,
        anchorEligible: p.anchorVerdict?.eligible ?? null,
        pivotDisagreementPx: p.bone?.pivotDisagreementPx ?? null,
        carriedBones: p.bone?.carriedBones ?? [],
      });
      // Only a placement the instrument did not refuse becomes a start.
      if (bone && hinge !== null && !p.refusal && p.role === 'chain') pose[`${bone}.rotate`] = hinge;
    }
    frames.push({
      set: s.dir,
      index: i,
      trusted: cf.anchor?.trusted ?? 0,
      read: parts.filter((p) => p.refusal === null).length,
      bought: parts.filter((p) => p.refusal === null && p.anchorEligible === false).length,
      parts,
      pose,
    });
  }
  process.stderr.write(`${s.dir.padEnd(14)} ${indices.length} frame(s) read\n`);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ candidate: CAND, minVisible: Number(MIN_VISIBLE), frames })}\n`);
process.stderr.write(`wrote ${out} — ${frames.length} frame(s)\n`);
