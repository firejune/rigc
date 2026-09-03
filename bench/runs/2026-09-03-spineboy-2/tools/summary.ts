/**
 * Turn `check --json` into the tables the record quotes, so every figure in the
 * prose reproduces from a stored file by construction rather than by hand.
 *
 * bench/runs/README.md, *After a run* step 4: "Every figure in a run's prose
 * reproduces from the run's own stored evidence, or carries its scope."
 *
 * usage: summary.ts <check.json> [out.md]
 */
import { readFileSync, writeFileSync } from 'node:fs';

interface ChainRow {
  chain: string;
  slots?: number;
  drewSlots?: number;
  worstDrift?: number | null;
  worstDriftSlot?: string | null;
  worstDriftFrame?: number | null;
  meanDrift?: number | null;
  driftSamples?: number;
  mae?: number | null;
  maeShare?: number | null;
}

interface SetRow {
  dir: string;
  animation: string;
  fps: number;
  referenceFrames: number;
  candidateFrames: number;
  compared: number;
  meanMae: number;
  meanMaeReference: number;
  drawnRatio: number;
  worstMae: number;
  worstMaeFrame: number;
  worstDrift: number | null;
  worstDriftFrame: number | null;
  worstDriftSlot: string | null;
  framesWithoutDrift: number;
  changePairs: number;
  changeDisagreements: number;
  worstChangeFrame: number | null;
  framing: string;
  chains?: ChainRow[];
  sheet?: {
    tiles?: number;
    tilesTotal?: number;
    meanMae?: number;
    worstMae?: number;
    worstTile?: number | string;
    columns?: number;
    refused?: string;
  } | null;
  textureFloor?: { floor?: number; aboveFloor?: number; floorReference?: number; aboveFloorReference?: number } | null;
}

const src = process.argv[2] ?? '/tmp/sb2/final.check.json';
const out = process.argv[3] ?? 'bench/runs/2026-09-03-spineboy-2/evidence/check-summary.md';
const r = JSON.parse(readFileSync(src, 'utf8')) as {
  animations: SetRow[];
  declaredBox?: { taken?: boolean; clause?: string; distance?: number; rms?: number; reach?: number };
  chains?: ChainRow[];
  textureFrom?: string | null;
};

const n = (v: number | null | undefined, digits = 2): string => (v === null || v === undefined ? '—' : v.toFixed(digits));

const lines: string[] = [];
lines.push('### `check` against the frames — every committed set', '');
lines.push(
  '| set | frames | framing | MAE (union) | MAE (ref px) | drawnRatio | worst attributable drift | slot | frame | blank-drift frames | change pairs | disagreements |',
);
lines.push('| --- | ---: | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |');
let worstDrift = { set: '', px: -1, slot: '', frame: -1 };
let disagreements = 0;
let overdraw: string[] = [];
for (const s of r.animations) {
  if (s.worstDriftSlot && s.worstDrift !== null && s.worstDrift !== undefined && s.worstDrift > worstDrift.px) {
    worstDrift = { set: s.dir, px: s.worstDrift, slot: s.worstDriftSlot ?? '', frame: s.worstDriftFrame ?? -1 };
  }
  disagreements += s.changeDisagreements;
  if (s.drawnRatio > 1.5) overdraw.push(s.dir);
  lines.push(
    `| \`${s.dir}\` | ${s.compared}/${s.referenceFrames} | ${s.framing} | ${n(s.meanMae)} | ${n(s.meanMaeReference)} | ` +
      `${n(s.drawnRatio, 3)} | ${n(s.worstDrift)} | ${s.worstDriftSlot ?? '—'} | ` +
      `${s.worstDriftFrame ?? '—'} | ${s.framesWithoutDrift}/${s.compared} | ${s.changePairs} | ${s.changeDisagreements} |`,
  );
}
lines.push('');
lines.push('### The sheets — G7 reads a ratio inside one sheet', '');
lines.push('| set | tiles | sheet MAE mean | worst tile | worst / mean |');
lines.push('| --- | ---: | ---: | ---: | ---: |');
for (const s of r.animations) {
  if (!s.sheet) continue;
  const mean = s.sheet.meanMae;
  const worst = s.sheet.worstMae;
  const ratio = mean && worst ? worst / mean : null;
  lines.push(
    `| \`${s.dir}\` | ${s.sheet.tiles ?? '—'}/${s.sheet.tilesTotal ?? '—'} | ${n(mean)} | ${n(worst)} (${s.sheet.worstTile ?? '—'}) | ` +
      `${ratio === null ? '—' : `**${ratio.toFixed(3)}**`} |`,
  );
}
lines.push('');
// The per-set chain rows, pooled into one line per chain — the rollup a run's
// README quotes instead of a per-shot list (§9.2).
const pooled = new Map<
  string,
  { slots: number; drew: number; worst: number; worstSlot: string; worstSet: string; worstFrame: number; drift: number[]; error: number; refPixels: number; driftFrames: number; frames: number }
>();
for (const s of r.animations) {
  for (const ch of s.chains ?? []) {
    const at =
      pooled.get(ch.chain) ??
      { slots: ch.slots ?? 0, drew: 0, worst: -1, worstSlot: '', worstSet: '', worstFrame: -1, drift: [] as number[], error: 0, refPixels: 0, driftFrames: 0, frames: 0 };
    at.drew = Math.max(at.drew, ch.drewSlots ?? 0);
    // A chain with no attributable frame reports worstDrift 0 and no slot; that
    // is a BLANK, not a zero, and §9.2 calls a blank the loudest row.
    if (ch.worstDriftSlot && ch.worstDrift !== null && ch.worstDrift !== undefined && ch.worstDrift > at.worst) {
      at.worst = ch.worstDrift;
      at.worstSlot = ch.worstDriftSlot ?? '';
      at.worstSet = s.dir;
      at.worstFrame = ch.worstDriftFrame ?? -1;
    }
    if (ch.worstDriftSlot && ch.meanDrift !== null && ch.meanDrift !== undefined) at.drift.push(ch.meanDrift);
    at.driftFrames += (ch as unknown as { driftFrames?: number }).driftFrames ?? 0;
    at.frames++;
    at.error += (ch as unknown as { error?: number }).error ?? 0;
    at.refPixels += (ch as unknown as { referencePixels?: number }).referencePixels ?? 0;
    pooled.set(ch.chain, at);
  }
}
if (pooled.size) {
  lines.push('### The chain rollup — one line per chain, pooled across every set', '');
  lines.push('| chain | slots drawn | worst slot drift | mean drift | MAE in it | ref px | sets with any attribution |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const [name, at] of pooled) {
    lines.push(
      `| \`${name}\` | ${at.drew}/${at.slots} | ` +
        `${at.worst < 0 ? '—' : `${n(at.worst)} px \`${at.worstSlot}\` (${at.worstSet} f${at.worstFrame})`} | ` +
        `${at.drift.length === 0 ? '—' : `${n(at.drift.reduce((a, b) => a + b, 0) / at.drift.length)} px`} | ` +
        `${at.refPixels === 0 ? '—' : n(at.error / at.refPixels / 3)} | ${at.refPixels} | ${at.drift.length}/${at.frames} |`,
    );
  }
  lines.push('');
}
lines.push('### The headline', '');
lines.push(
  `- **worst attributable slot drift, over every measured set: ${n(worstDrift.px)} px** ` +
    `(\`${worstDrift.slot}\` in \`${worstDrift.set}\` at f${worstDrift.frame})`,
  `- **\`changeDisagreements\`, summed over every set: ${disagreements}**`,
  `- **\`⚠️ overdraw\`: ${overdraw.length === 0 ? 'no set' : overdraw.map((s) => `\`${s}\``).join(', ')}** ` +
    `(the bar is \`drawnRatio\` > 1.5)`,
  `- sets whose drift table is entirely blank (G2's 🕳️ HOLE): ` +
    `${r.animations.filter((s) => s.framesWithoutDrift === s.compared).map((s) => `\`${s.dir}\``).join(', ') || 'none'}`,
  `- \`frames.json\`'s own box: ${r.declaredBox?.taken ? 'TAKEN' : 'REFUSED'}` +
    `${r.declaredBox?.clause ? `, ${r.declaredBox.clause}` : ''}` +
    `${r.declaredBox?.distance === undefined ? '' : ` — a fit there asks for ${n(r.declaredBox.distance)} px against the ${n(r.declaredBox.reach)} px the extent-spread tolerance reaches`}`,
);
if (r.textureFrom) {
  lines.push('', '### The texture floor — `--texture-from`, a named diagnostic and not the record', '');
  lines.push('| set | MAE | texture floor | above it | share of the figure |');
  lines.push('| --- | ---: | ---: | ---: | ---: |');
  for (const s of r.animations) {
    if (!s.textureFloor) continue;
    const explained = s.meanMae - (s.textureFloor.aboveFloor ?? 0);
    lines.push(
      `| \`${s.dir}\` | ${n(s.meanMae)} | ${n(s.textureFloor.floor)} | ${n(s.textureFloor.aboveFloor)} | ` +
        `${s.meanMae === 0 ? '—' : `${((100 * explained) / s.meanMae).toFixed(1)}%`} |`,
    );
  }
}

writeFileSync(out, `${lines.join('\n')}\n`);
process.stdout.write(`${lines.join('\n')}\n`);
