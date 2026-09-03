/**
 * Where `check`'s own per-slot matcher and this run's composite objective
 * disagree about ONE part's place, take the frame-derived instrument's answer —
 * `chainfit`'s hinge — and record the composite cost as a trade.
 *
 * AUTHORING §9.1, on *sacrificial cover*: "⭐ **prefer the frame-derived
 * instruments when they disagree with the composite about a single part's
 * place**: the composite is one number over everything, while a template match
 * on that part's own art is a measurement of the thing in question." And, two
 * paragraphs earlier: "Read a per-part residual beside the composite, never only
 * the composite. Score each part against its own template match as well, and
 * flag any frame where the composite improves while a part's own residual
 * worsens."
 *
 * ⚖️ And the guide's own prediction about the repair: "Expect the corrected pose
 * to score *worse* on the composite, and record that as a trade. A few percent
 * worse on your own objective while decisively better on every frame-derived
 * placement instrument is the **expected** shape of this repair, not a
 * regression — the composite's preference was the defect. Declare an accept
 * threshold before you need it, say how often you used it, and name the frames."
 *
 * ⇒ The accept threshold is declared here as `MAX_COST`, in this run's own
 * objective units, and a swap that costs more than that is REFUSED and recorded.
 *
 * usage: prefer.ts <out-poses.json> <check.json> <poses.json> <chainfit.json> [report]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { Plate } from '../../../../tools/plate';
import { declaredViewport, framePath, loadFrame, sidecarOf } from './geom';
import {
  levelsFor,
  loadCandidate,
  objectiveFor,
  targetFor,
  weightFromChange,
  type Pose,
  type Skin,
} from './fitlib';
import { LEVEL_PLAN } from './plan';

const REF = process.env.REF ?? 'bench/reference/spineboy/ess';
const CAND = process.env.CAND ?? '/tmp/sb2/cand';
const SKINS = process.env.SKINS ?? 'bench/runs/2026-09-03-spineboy-2/fit/skins.json';
/** The drift, in frame pixels, above which a slot's place is re-opened. */
const DRIFT_BAR = Number(process.env.DRIFT_BAR ?? 6);
/** The declared accept threshold, in this run's own objective units. */
const MAX_COST = Number(process.env.MAX_COST ?? 1.0);

const [out, checkPath, posesPath, chainfitPath, reportPath] = process.argv.slice(2);

const sidecar = sidecarOf(REF);
const view = declaredViewport(sidecar);
const levels = levelsFor(view, LEVEL_PLAN);
const c = loadCandidate(CAND);
const check = JSON.parse(readFileSync(checkPath, 'utf8')) as {
  animations: { dir: string; frames?: { index: number; slots?: { slot: string; drift: number | null; method: string }[] }[] }[];
};
const poses = JSON.parse(readFileSync(posesPath, 'utf8')) as Record<string, Record<string, { pose: Pose; score: number; start?: string }>>;
const chain = JSON.parse(readFileSync(chainfitPath, 'utf8')) as {
  frames: { set: string; index: number; parts: { part: string; bone: string | null; hingeDeg: number | null; refusal: string | null; visibleShare: number | null; residual: number | null }[] }[];
};
let skins: Record<string, Record<string, Skin>> = {};
try {
  skins = JSON.parse(readFileSync(SKINS, 'utf8')).perFrame ?? {};
} catch {
  skins = {};
}

/** slot -> bone, from the candidate itself. */
const skeleton = JSON.parse(readFileSync(`${CAND}/skeleton.json`, 'utf8')) as { slots?: { name: string; bone: string }[] };
const boneOfSlot = new Map<string, string>();
for (const slot of skeleton.slots ?? []) boneOfSlot.set(slot.name, slot.bone);

const chainAt = new Map<string, Map<string, { hinge: number; visible: number | null; residual: number | null }>>();
for (const f of chain.frames) {
  const per = new Map<string, { hinge: number; visible: number | null; residual: number | null }>();
  for (const p of f.parts) {
    if (p.refusal || p.hingeDeg === null || !p.bone) continue;
    per.set(p.bone, { hinge: p.hingeDeg, visible: p.visibleShare, residual: p.residual });
  }
  chainAt.set(`${f.set}|${f.index}`, per);
}

interface Row {
  set: string;
  index: number;
  slot: string;
  bone: string;
  drift: number;
  was: number;
  now: number;
  cost: number;
  taken: boolean;
  why: string;
}
const rows: Row[] = [];

for (const a of check.animations) {
  for (const f of a.frames ?? []) {
    const offenders = (f.slots ?? []).filter((s) => s.drift !== null && s.drift > DRIFT_BAR);
    if (offenders.length === 0) continue;
    const entry = poses[a.dir]?.[String(f.index)];
    if (!entry) continue;
    const per = chainAt.get(`${a.dir}|${f.index}`);
    const plate = loadFrame(framePath(REF, a.dir, f.index));
    const neighbours: Plate[] = [];
    for (const j of [f.index - 1, f.index + 1]) {
      try {
        neighbours.push(loadFrame(framePath(REF, a.dir, j)));
      } catch {
        /* set edge */
      }
    }
    const target = targetFor(plate, levels, neighbours.length ? weightFromChange(plate, neighbours, 4) : null);
    const obj = objectiveFor(c, target, skins[a.dir]?.[String(f.index)] ?? {});
    const fine = levels[levels.length - 1];
    const before = obj(entry.pose, fine);
    for (const offender of offenders) {
      const bone = boneOfSlot.get(offender.slot);
      const reading = bone ? per?.get(bone) : undefined;
      if (!bone || !reading) {
        rows.push({
          set: a.dir,
          index: f.index,
          slot: offender.slot,
          bone: bone ?? '?',
          drift: offender.drift as number,
          was: bone ? (entry.pose[`${bone}.rotate`] ?? 0) : Number.NaN,
          now: Number.NaN,
          cost: Number.NaN,
          taken: false,
          why: 'chainfit produced no unrefused hinge for this bone on this frame',
        });
        continue;
      }
      const key = `${bone}.rotate`;
      const was = entry.pose[key] ?? 0;
      const candidatePose = { ...entry.pose, [key]: reading.hinge };
      const after = obj(candidatePose, fine);
      const cost = after - before;
      const taken = cost <= MAX_COST;
      if (taken) entry.pose = candidatePose;
      rows.push({
        set: a.dir,
        index: f.index,
        slot: offender.slot,
        bone,
        drift: offender.drift as number,
        was,
        now: reading.hinge,
        cost,
        taken,
        why: taken
          ? `adopted; visible share ${reading.visible === null ? 'n/a' : (100 * reading.visible).toFixed(1) + '%'}`
          : `REFUSED: costs ${cost.toFixed(3)} against the declared ${MAX_COST} threshold`,
      });
    }
    if (rows.some((r) => r.set === a.dir && r.index === f.index && r.taken)) {
      entry.score = obj(entry.pose, fine);
      entry.start = 'chainfit-preferred';
    }
  }
}

writeFileSync(out, `${JSON.stringify(poses)}\n`);
const lines = [
  `preferring chainfit's hinge over the composite where check's own matcher reports > ${DRIFT_BAR} px of drift`,
  `declared accept threshold: ${MAX_COST} in this run's objective units`,
  '',
  'set          frame  slot            bone              check drift   mine ->  chainfit    cost   verdict',
  '-'.repeat(120),
  ...rows.map(
    (r) =>
      `${r.set.padEnd(12)} ${String(r.index).padStart(5)}  ${r.slot.padEnd(15)} ${r.bone.padEnd(17)} ` +
      `${r.drift.toFixed(2).padStart(11)}   ${Number.isNaN(r.was) ? '   n/a' : r.was.toFixed(1).padStart(6)} -> ` +
      `${Number.isNaN(r.now) ? '   n/a' : r.now.toFixed(1).padStart(8)}  ${Number.isNaN(r.cost) ? '  n/a' : (r.cost >= 0 ? '+' : '') + r.cost.toFixed(3)}   ${r.why}`,
  ),
  '',
  `${rows.filter((r) => r.taken).length} of ${rows.length} adopted`,
];
if (reportPath) writeFileSync(reportPath, `${lines.join('\n')}\n`);
process.stdout.write(`${lines.join('\n')}\n`);
