/**
 * Build the `--anchor` report `chainfit` should hang its chains off, by keeping
 * only the parts THIS corpus makes `pose` trustworthy on and refusing the rest.
 *
 * ## Why this is necessary, and it is the run's first finding about the tool
 *
 * `chainfit` takes its anchors from a `pose` report, and a part becomes an
 * anchor when `pose` came back unambiguous with residual ≤ 0.16 and
 * unexplained ≤ 0.45 (§12.2). On this figure `pose` clears that bar on the
 * FAR-side limbs — measured on `aim/f0000`, `rear-thigh` at residual 0.0751
 * and `rear-foot` at 0.1534 — while placing them on top of the NEAR-side ones,
 * because the two are the same drawing at two sizes (§8.1's "two near-identical
 * parts"). The anchor pass cannot know that: it scores over the part's whole
 * footprint and is "blind to what covers it".
 *
 * The consequence is not a wrong number, it is a MISSING one. An anchored part
 * is "taken from the anchor pass, not re-fitted" (§12.3's `role`), so every
 * far-side limb comes back `occluded` at a 0–2 % visible share and no `hingeDeg`
 * is produced for it — the chain never runs on the parts the chain exists for.
 * `chainfit` says so itself, in the row §12.3 calls the most useful in the
 * table: *"it is an ANCHOR, accepted by the anchor pass on its own criterion
 * ... so every placement hung off it inherits this doubt."*
 *
 * ⇒ So the anchor set is DECLARED here rather than taken. `torso` is the one
 * part `pose` places confidently on nearly every frame of this corpus and it is
 * this rig's trunk; the face slots ride the same bone as `head`. Everything
 * else is left for the chain to buy.
 *
 * `refusal` is what suppresses a part: §12.2's criterion needs an unambiguous
 * placement, so a `no-match` refusal with the placement still printed is the
 * report's own way of saying "do not trust this one", and it is what `pose`
 * writes for a part it will not vouch for.
 */
import { readFileSync, writeFileSync } from 'node:fs';

export const DEFAULT_ANCHORS = ['torso', 'head', 'goggles', 'mouth-smile', 'mouth-grind', 'mouth-oooo'];

if (import.meta.main) {
  const inPath = process.argv[2];
  const outPath = process.argv[3];
  const keep = new Set((process.env.ANCHORS ?? DEFAULT_ANCHORS.join(',')).split(','));

  const report = JSON.parse(readFileSync(inPath, 'utf8'));
  let kept = 0;
  let suppressed = 0;
  for (const part of report.parts) {
    const name = String(part.part).replace(/\.png$/, '');
    if (keep.has(name)) {
      kept++;
      continue;
    }
    suppressed++;
    part.refusal = {
      reason: 'no-match',
      detail: `suppressed by the run's declared anchor set: \`pose\` cannot be trusted to tell ${name} from its near/far twin on this figure`,
    };
    part.ambiguous = true;
  }
  writeFileSync(outPath, `${JSON.stringify(report)}\n`);
  process.stderr.write(`${outPath}: ${kept} anchor(s) kept, ${suppressed} suppressed\n`);
}
