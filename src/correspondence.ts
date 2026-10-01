/**
 * The two spellings of a bone correspondence — what `rigc bonedist --bones`
 * and `rigc bench --bones` take — moved here unchanged from `./bonedist.ts`
 * (issue #1052), which re-exports both.
 *
 * Their own module because the CLI's help states them (`--bones`'s flag row)
 * and an entry that links nothing of the runtime prints that help, while
 * `./bonedist.ts` poses both skeletons through spine-core by design.
 */

/** The sidecar spec a correspondence file declares, and the report's own. */
export const BONEDIST_SPEC = 'rigc-bonedist/1';

/** What `--bones identity` is spelled as, where a file path would go. */
export const IDENTITY_CORRESPONDENCE = 'identity';
