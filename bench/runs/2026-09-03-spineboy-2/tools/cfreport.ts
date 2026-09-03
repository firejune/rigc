/**
 * The per-part census of what `rigc chainfit` said across the whole corpus.
 *
 * Three separate readings, kept apart on purpose:
 *
 *  - **coverage** — on how many of the 147 committed frames the instrument
 *    produced a `hingeDeg` at all, and on how many it refused, by reason. A
 *    refusal is recorded, never worked around.
 *  - **the visible-share census** — min / median / max of `visibleShare` over
 *    every frame of every set, which is a MEASURED ceiling on how much of the
 *    part the frames put on screen through this candidate's own draw order.
 *    `docs/GATE.md`'s G2 read-down (v2.3, half 1) asks for exactly this shape of
 *    quantity on a slot the frames cannot make attributable, and it says the
 *    ceiling must be "measured on every frame of every set rather than argued
 *    from one".
 *  - **`pivotDisagreementPx`** — §12.3 calls it "the one direct measurement of
 *    your rig against the picture". It is reported for anchored bones only, so
 *    on this run's declared anchor set it exists for the trunk and the head and
 *    nowhere else; that is stated rather than left as a blank.
 *
 * ⚠️ The visible share is the CANDIDATE's own occlusion (§12.5), so it is a
 * statement about this rig's draw order as much as about the frames. Read it as
 * a ceiling under this rig, not as a fact about the reference.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const src = process.argv[2] ?? 'bench/runs/2026-09-03-spineboy-2/fit/chainfit.json';
const out = process.argv[3] ?? 'bench/runs/2026-09-03-spineboy-2/evidence/chainfit-census.txt';

interface PartRead {
  part: string;
  role: string;
  bone: string | null;
  hingeDeg: number | null;
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
const store = JSON.parse(readFileSync(src, 'utf8')) as {
  candidate: string;
  minVisible: number;
  frames: { set: string; index: number; trusted: number; parts: PartRead[] }[];
};

const stats = new Map<
  string,
  {
    frames: number;
    hinges: number;
    bought: number;
    ambiguous: number;
    refusals: Map<string, number>;
    visible: number[];
    visibleAtFit: number[];
    residuals: number[];
    pivot: number[];
    roles: Map<string, number>;
    carried: Set<string>;
  }
>();

for (const frame of store.frames) {
  for (const p of frame.parts) {
    const at =
      stats.get(p.part) ??
      {
        frames: 0,
        hinges: 0,
        bought: 0,
        ambiguous: 0,
        refusals: new Map<string, number>(),
        visible: [] as number[],
        visibleAtFit: [] as number[],
        residuals: [] as number[],
        pivot: [] as number[],
        roles: new Map<string, number>(),
        carried: new Set<string>(),
      };
    at.frames++;
    at.roles.set(p.role, (at.roles.get(p.role) ?? 0) + 1);
    if (p.hingeDeg !== null && p.refusal === null) at.hinges++;
    if (p.refusal === null && p.anchorEligible === false) at.bought++;
    if (p.ambiguous) at.ambiguous++;
    if (p.refusal) at.refusals.set(p.refusal, (at.refusals.get(p.refusal) ?? 0) + 1);
    if (p.visibleShare !== null) at.visible.push(p.visibleShare);
    if (p.visibleShareAtFit !== null) at.visibleAtFit.push(p.visibleShareAtFit);
    if (p.residual !== null) at.residuals.push(p.residual);
    if (p.pivotDisagreementPx !== null) at.pivot.push(p.pivotDisagreementPx);
    for (const b of p.carriedBones) at.carried.add(b);
    stats.set(p.part, at);
  }
}

const q = (list: number[], f: number): number => {
  if (list.length === 0) return Number.NaN;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(f * s.length))];
};
const pct = (v: number): string => (Number.isNaN(v) ? '   n/a' : `${(v * 100).toFixed(1).padStart(5)}%`);

const lines: string[] = [
  `rigc chainfit over ${store.frames.length} committed frame(s) of \`ess\``,
  `candidate ${store.candidate} · --min-visible ${store.minVisible}`,
  '',
  'part                    frames  hinge  bought  ambig   visibleShare min/med/max    residual med   refusals',
  '-'.repeat(118),
];
const names = [...stats.keys()].sort();
for (const name of names) {
  const s = stats.get(name);
  if (!s) continue;
  lines.push(
    `${name.padEnd(22)} ${String(s.frames).padStart(6)} ${String(s.hinges).padStart(6)} ${String(s.bought).padStart(7)} ` +
      `${String(s.ambiguous).padStart(6)}   ${pct(q(s.visible, 0))} ${pct(q(s.visible, 0.5))} ${pct(q(s.visible, 0.999))}   ` +
      `${Number.isNaN(q(s.residuals, 0.5)) ? '  n/a' : q(s.residuals, 0.5).toFixed(4)}        ` +
      `${[...s.refusals.entries()].map(([r, n]) => `${r}x${n}`).join(' ') || '-'}`,
  );
}

lines.push('', 'pivotDisagreementPx — §12.3\'s "one direct measurement of your rig against the picture":');
let anyPivot = false;
for (const name of names) {
  const s = stats.get(name);
  if (!s || s.pivot.length === 0) continue;
  anyPivot = true;
  lines.push(
    `  ${name.padEnd(22)} ${s.pivot.length} frame(s)  min ${Math.min(...s.pivot).toFixed(2)}  ` +
      `median ${q(s.pivot, 0.5).toFixed(2)}  max ${Math.max(...s.pivot).toFixed(2)} px`,
  );
}
if (!anyPivot) {
  lines.push(
    '  none. The field is reported for ANCHORED bones only, and this run declares its own',
    '  anchor set (tools/anchor.ts) rather than letting `pose` pick one — so the only anchored',
    '  bones are the trunk, which has no parent prediction to disagree with, and `head`, whose',
    '  own placement IS the anchor. ⇒ On this rig the field measures nothing, and the joint',
    '  table was settled by triangulation and by a structural sweep instead.',
  );
}

const carried = new Set<string>();
for (const s of stats.values()) for (const b of s.carried) carried.add(b);
lines.push(
  '',
  `carriedBones (bones between an anchor and a read part that carry nothing scoreable): ${carried.size === 0 ? 'none' : [...carried].join(', ')}`,
);

const zeroVisible = names.filter((n) => {
  const s = stats.get(n);
  return s && s.visible.length > 0 && q(s.visible, 0.999) < 0.02;
});
lines.push(
  '',
  'Slots whose measured visible share never reaches 2% on any committed frame — the G2',
  'read-down candidates, with the ceiling measured on every frame of every set:',
  ...(zeroVisible.length === 0 ? ['  none'] : zeroVisible.map((n) => {
    const s = stats.get(n);
    return `  ${n.padEnd(22)} max ${pct(q(s?.visible ?? [], 0.999))} over ${s?.visible.length ?? 0} frame(s)`;
  })),
);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${lines.join('\n')}\n`);
process.stdout.write(`${lines.join('\n')}\n`);
