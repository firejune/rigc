/**
 * A17, the body (issue #1025, step 4c of #380): every page the atlas names is
 * a file on disk, resolved against the directory the atlas sits in.
 *
 * Moved out of `src/validate.ts` unchanged but for what it reads: the pages are
 * a fact (`../facts/atlas_pages.ts`), and the directory is the caller's. Why
 * the guard is a SKIP and never a bare `return` (issues #568, #608) is argued
 * above the `check` call in `validate()`, which stays there with A06 and A19.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Verdicts } from '../harness.ts';
import type { AtlasPageFacts } from '../facts/atlas_pages.ts';
import { SKIP_NO_ATLAS, SKIP_NO_ATLAS_PAGE } from '../reasons.ts';

export function a17AtlasPageFilesExist({ fail, skip }: Verdicts, { atlas }: AtlasPageFacts, input: { atlasDir: string }): void {
  if (!atlas) return skip('A17_ATLAS_PAGE_FILES_EXIST', SKIP_NO_ATLAS);
  // The other absence, one ring in (#580): the atlas LOADED and declares no
  // page, so there is no file to find missing. `!atlas` and "zero pages" print
  // different reasons because they are different facts about the artifact.
  if (atlas.pages.length === 0) return skip('A17_ATLAS_PAGE_FILES_EXIST', SKIP_NO_ATLAS_PAGE);
  for (const page of atlas.pages) {
    const abs = resolve(input.atlasDir, page.name);
    if (!existsSync(abs)) fail('A17_ATLAS_PAGE_FILES_EXIST', `page "${page.name}" is not on disk at ${abs}`);
  }
}
