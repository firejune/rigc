/**
 * A07, restated over the emitted text (issue #1060): the clause
 * `validate()` runs in `src/validate.ts`, word for word, over the atlas text — the
 * text rigc wrote, read by rigc's own reader rather than by spine-core's. The
 * round trip's copy is unchanged and runs in `cli.ts build`; this one runs in
 * the gate of the entry that links none of the runtime
 * (`../emitted/index.ts`), and the selftest's `RC28` holds the two to the
 * same lines on every recipe and on this assertion's mutants.
 */
import type { Verdicts } from '../harness.ts';
import { SKIP_NO_ATLAS_PAGE } from '../reasons.ts';

export function a07AtlasTextShape({ fail, skip }: Verdicts, atlasText: string): void {
  const atlasLines = atlasText.replace(/\n$/, '').split('\n');
  const atlasPageLines = atlasLines.filter((line) => line.trim().length > 0).length;
  if (atlasPageLines === 0) {
    // One of the exported reason constants, not a sentence of its own: the
    // static-rig suite's arithmetic (S50, #580) counts a rule as skipped
    // for want of a SUBJECT only when its reason is one of those constants.
    return skip('A07_ATLAS_TEXT_SHAPE', SKIP_NO_ATLAS_PAGE);
  }
  // A blank line at either END of the file is named as that end (issues #803,
  // #810), and a run of them is one finding stating its length. They are taken
  // off both ends before the walk below, so the walk sees the page blocks and
  // the blank lines between them and nothing else: a blank line after the last
  // region is not a page block, and "consecutive blank lines" and "the last
  // page block declares no region" are about blocks. `TextureAtlas` reads a
  // blank at either end as nothing (`TextureAtlas.js:98-100` skips the leading
  // run, `:116-118` ends a page block on each blank line), and rigc writes
  // neither (`writeAtlasText`, and `--atlas-in` through `canonicalAtlasShape`),
  // so a file that has one was written by something else and is refused.
  let leading = 0;
  while (leading < atlasLines.length && atlasLines[leading].trim().length === 0) leading++;
  if (leading > 0) {
    fail('A07_ATLAS_TEXT_SHAPE', `line 1: the file begins with ${leading === 1 ? 'a blank line' : `${leading} blank lines`}`);
  }
  let trailing = 0;
  while (trailing < atlasLines.length - leading && atlasLines[atlasLines.length - 1 - trailing].trim().length === 0) trailing++;
  const blockEnd = atlasLines.length - trailing;
  let expectPage = true;
  let sawRegionForPage = false;
  for (let i = leading; i < blockEnd; i++) {
    const line = atlasLines[i];
    if (line.trim().length === 0) {
      if (expectPage) fail('A07_ATLAS_TEXT_SHAPE', `line ${i + 1}: consecutive blank lines`);
      else if (!sawRegionForPage) {
        fail('A07_ATLAS_TEXT_SHAPE', `line ${i + 1}: blank line before this page had any region`);
      }
      expectPage = true;
      sawRegionForPage = false;
      continue;
    }
    if (expectPage) {
      expectPage = false;
      continue; // page name line
    }
    if (line.includes(':')) continue; // key: value line
    // A bare non-key line is a region name, and it is used untrimmed.
    if (line !== line.trim()) {
      fail('A07_ATLAS_TEXT_SHAPE', `line ${i + 1}: region name has stray whitespace: ${JSON.stringify(line)}`);
    }
    sawRegionForPage = true;
  }
  if (!sawRegionForPage) fail('A07_ATLAS_TEXT_SHAPE', 'the last page block declares no region');
  if (trailing > 0) {
    fail('A07_ATLAS_TEXT_SHAPE', `line ${blockEnd + 1}: the file ends with ${trailing === 1 ? 'a blank line' : `${trailing} blank lines`}`);
  }
}
