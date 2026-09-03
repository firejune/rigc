/**
 * The G2 v2.3 read-down's two measurements, and which is which.
 *
 * docs/GATE.md, G2, v2.3, half 1: "a measured ceiling on its attributability,
 * below the bar attribution requires. The ceiling is an instrument-side
 * geometric fact about the slot's **visible footprint** — the share of a
 * covering placement of it that the frames put on screen at all — measured on
 * **every frame of every set** rather than argued from one, and computed from
 * stated conventions. The bar is **calibrated on the slots of the same corpus
 * that the instrument does attribute**. ⇒ **Both measurements are quoted, and
 * the verdict says which is which.**"
 *
 * The convention, stated: the ceiling is `chainfit`'s `visibleShare` — "the
 * share of the part's own alpha weight the residual was computed on" (§12.3) —
 * taken as the MAXIMUM over all 147 committed frames, because a ceiling is what
 * the best frame allows and not what the median one does. The calibration is
 * the same quantity over the slots `check`'s own matcher does attribute at least
 * once, and the bar is the smallest of those maxima.
 *
 * ⚠️ The share is the CANDIDATE's own occlusion (§12.5), so it is a statement
 * about this rig's draw order as much as about the frames.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const check = JSON.parse(readFileSync('bench/runs/2026-09-03-spineboy-2/check.json', 'utf8')) as {
  animations: { dir: string; frames?: { index: number; slots?: { slot: string; drift: number | null; candidate?: { pixels: number } | null }[] }[] }[];
};
const chain = JSON.parse(readFileSync('bench/runs/2026-09-03-spineboy-2/fit/chainfit.json', 'utf8')) as {
  frames: { set: string; index: number; parts: { part: string; visibleShare: number | null }[] }[];
};
const skeleton = JSON.parse(readFileSync('bench/runs/2026-09-03-spineboy-2/spine/skeleton.json', 'utf8')) as {
  skins?: { name: string; attachments?: Record<string, Record<string, unknown>> }[];
};

/** slot -> its attachments, so a part name maps back to the slot it sits in. */
const slotOfPart = new Map<string, string>();
for (const skin of skeleton.skins ?? []) {
  for (const [slot, attachments] of Object.entries(skin.attachments ?? {})) {
    for (const part of Object.keys(attachments)) slotOfPart.set(part, slot);
  }
}

const ceiling = new Map<string, number>();
for (const f of chain.frames) {
  for (const p of f.parts) {
    if (p.visibleShare === null) continue;
    const slot = slotOfPart.get(p.part) ?? p.part;
    ceiling.set(slot, Math.max(ceiling.get(slot) ?? 0, p.visibleShare));
  }
}

const attributedSomewhere = new Set<string>();
const drawsSomewhere = new Set<string>();
/**
 * ⚠️ The clause fires PER SET, not per corpus: "a slot that **draws** in a
 * measured set and is attributable in **no frame** of that set is read down
 * explicitly in the verdict". So the burden is counted per (set, slot) pair, and
 * a slot attributed in one set still owes a read-down for every set it is blank
 * in.
 */
const perSetDraws = new Map<string, Set<string>>();
const perSetAttributed = new Map<string, Set<string>>();
for (const a of check.animations) {
  const draws = new Set<string>();
  const attributed = new Set<string>();
  for (const f of a.frames ?? []) {
    for (const s of f.slots ?? []) {
      if ((s.candidate?.pixels ?? 0) > 0) {
        drawsSomewhere.add(s.slot);
        draws.add(s.slot);
      }
      if (s.drift !== null) {
        attributedSomewhere.add(s.slot);
        attributed.add(s.slot);
      }
    }
  }
  perSetDraws.set(a.dir, draws);
  perSetAttributed.set(a.dir, attributed);
}
const blanks: { set: string; slot: string }[] = [];
for (const [set, draws] of perSetDraws) {
  for (const slot of draws) if (!perSetAttributed.get(set)?.has(slot)) blanks.push({ set, slot });
}
const blanksBySlot = new Map<string, string[]>();
for (const b of blanks) {
  const at = blanksBySlot.get(b.slot) ?? [];
  at.push(b.set);
  blanksBySlot.set(b.slot, at);
}

const rows = [...drawsSomewhere].map((slot) => ({
  slot,
  attributed: attributedSomewhere.has(slot),
  ceiling: ceiling.get(slot) ?? Number.NaN,
}));
const attributedCeilings = rows.filter((r) => r.attributed && !Number.isNaN(r.ceiling)).map((r) => r.ceiling);
const bar = Math.min(...attributedCeilings);
const barSlot = rows.find((r) => r.attributed && r.ceiling === bar)?.slot ?? '?';

const lines = [
  'G2 v2.3 read-down — the two measurements, and which is which',
  '',
  'THE CEILING (half 1, first measurement): chainfit visibleShare, MAXIMUM over all 147',
  'committed frames of all 16 sets. Convention: the share of the part\'s own alpha weight the',
  'residual was computed on, through THIS candidate\'s own draw order.',
  '',
  'slot              draws   check attributes it   visible-footprint ceiling',
  '-'.repeat(74),
  ...rows
    .sort((a, b) => (Number.isNaN(a.ceiling) ? 1 : Number.isNaN(b.ceiling) ? -1 : a.ceiling - b.ceiling))
    .map(
      (r) =>
        `${r.slot.padEnd(17)} yes     ${(r.attributed ? 'yes' : 'NO').padEnd(19)} ` +
        `${Number.isNaN(r.ceiling) ? '   n/a' : `${(100 * r.ceiling).toFixed(1).padStart(6)}%`}`,
    ),
  '',
  'THE CALIBRATION (half 1, second measurement): the smallest ceiling among the slots check',
  `DOES attribute somewhere in this corpus is ${(100 * bar).toFixed(1)}% (\`${barSlot}\`). That is the bar this`,
  'run reads the ceiling against, and it is calibrated on the same corpus rather than declared.',
  '',
  `slots that draw and are attributed nowhere IN THE WHOLE CORPUS: ${rows.filter((r) => !r.attributed).map((r) => r.slot).join(', ') || 'none'}`,
  '',
  'THE ACTUAL BURDEN — the clause fires per SET, so this is the count that matters:',
  `${blanks.length} (set, slot) pair(s) draw and are attributable in no frame of that set, out of`,
  `${[...perSetDraws.values()].reduce((n, d) => n + d.size, 0)} (set, slot) pairs that draw at all.`,
  '',
  'slot              sets it is blank in                                        ceiling',
  '-'.repeat(96),
  ...[...blanksBySlot.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([slot, sets]) => {
      const c = ceiling.get(slot);
      return (
        `${slot.padEnd(17)} ${String(sets.length).padStart(2)}/16  ${sets.slice(0, 5).join(' ')}${sets.length > 5 ? ' …' : ''}`.padEnd(80) +
        `${c === undefined || Number.isNaN(c) ? 'NO CEILING MEASURED' : `${(100 * c).toFixed(1)}%`}`
      );
    }),
];
writeFileSync('bench/runs/2026-09-03-spineboy-2/evidence/g2-read-down.txt', `${lines.join('\n')}\n`);
process.stdout.write(`${lines.join('\n')}\n`);
