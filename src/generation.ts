/**
 * Which Spine data generation a skeleton's own version string names.
 *
 * ## Why this is one function and not a regex per caller
 *
 * Spine data is locked to the generation that exported it, and a mismatch fails
 * **silently**: 4.3 takes constraints from the top-level `constraints` array
 * alone, so a 4.0–4.2 file parses clean with none of them — measured across
 * 1,302 shipped skeletons that loaded 0 of 8,672 constraints
 * ([#706](https://github.com/firejune/rigc/issues/706) row 1). rigc is where
 * that knowledge lives for the tools around it (#706 *Ownership*), and living
 * in one place means one reader of `skeleton.spine`:
 * `A16_SKELETON_VERSION_4_3` asks this function for its verdict, and `ingest`
 * asks it before it reads a field of the file.
 *
 * ## What is here, and what is deliberately not
 *
 * This is #706's item **1**, and nothing else. Item **2** — the per-generation
 * table of key renames, array shapes and `getValue(map, key, default)` defaults,
 * extracted by machine from each runtime branch's `SkeletonJson` — is not here,
 * and neither is item **4**'s conversion utility. So this module reads a string
 * and names a generation. It does not read a file, apply another generation's
 * defaults, or convert anything, and a caller that meets data from another
 * generation has to say so out loud rather than read it anyway.
 *
 * ## The grammar, and the two rules in it
 *
 * A version string is `MAJOR.MINOR`, an optional chain of `-from-MAJOR.MINOR`,
 * then an optional `.PATCH` and an optional `-SUFFIX` after that. The shipped
 * strings #706 lists are `3.8.99`, `4.0.33`, `4.0-from-4.1.24`,
 * `4.0-from-4.1-from-4.2.29`, `4.1-from-4.2.33`, `4.2.09-beta`, `4.2.43`,
 * `4.3.26` and `4.3.75-beta`.
 *
 * 1. **The leading token is the generation.** `4.0-from-4.1.24` is 4.0 data
 *    written by a 4.1 editor — a *down-export* — and all 418 such-or-plain 4.0
 *    files and 101 4.1 files in #706's corpus load and render on the 4.0 / 4.1
 *    runtimes with 0 failures. Reading the trailing token would hand them the
 *    wrong runtime, which is row 7's defect with extra steps.
 * 2. **Every token has to be a generation this module knows, and the chain has
 *    to ascend.** A down-export comes *from* a newer editor, so `4.0-from-4.1`
 *    is a down-export and `4.3-from-4.2` is not a version string this reader
 *    can account for. Both rules answer `null`, which is rule 3.
 * 3. **Unknown is `null`, never the nearest.** A catalog builder gave 19
 *    skeletons labelled `3.8.99` the nearest runtime it had; they loaded, and
 *    posed 238 of 248 bones as NaN (#706 row 7). `null` is what a caller has to
 *    act on, and it is why this returns a union rather than a number to compare.
 *
 * ⭐ Rules 2 and 3 together are also what keeps `A16`'s accepted set **exactly**
 * what its own regex accepted before this module existed: 4.3 is the highest
 * generation here, nothing can ascend above it, so no `-from-` string is ever
 * read as 4.3 and `A16` still accepts `4.3`, `4.3.<patch>` and
 * `4.3.<patch>-<suffix>` and those alone. The cost is stated rather than hidden:
 * a future editor down-exporting as `4.3-from-4.4.1` reads as `null` here and is
 * refused by name until that generation is added — which is #706 policy 1's own
 * answer ("an unknown generation gets no runtime") rather than a gap in this one.
 *
 * ## Purity
 *
 * No clock, no randomness, no filesystem, no network, no `spine-core`. It reads
 * strings and small plain objects and nothing else.
 */

/** A generation of Spine data — the `MAJOR.MINOR` pair a runtime is locked to. */
export type SpineGeneration = '3.8' | '4.0' | '4.1' | '4.2' | '4.3';

/**
 * Every generation this module knows, oldest first.
 *
 * The order is load-bearing twice: a down-export chain has to ascend through it,
 * and a caller listing "the generations rigc knows" reads it here rather than
 * typing five strings next to a sixth.
 */
export const SPINE_GENERATIONS: readonly SpineGeneration[] = ['3.8', '4.0', '4.1', '4.2', '4.3'];

/**
 * `MAJOR.MINOR`, then the `-from-` chain, then the patch and its suffix.
 *
 * Anchored at both ends on purpose: `4.30` and `4.3.1.2` are not version strings
 * and a partial match would read them as 4.3. The suffix shape is the one the
 * editor writes for a pre-release (`4.3.75-beta`, which every one of the twelve
 * official example exports declares) and is the same one `A16`'s own regex
 * carried, character for character, before this module took it over.
 */
const VERSION_STRING = /^(\d+\.\d+)((?:-from-\d+\.\d+)*)(?:\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.+-]*)?)?$/;

/**
 * The generation a `skeleton.spine` string names, or `null` for one this module
 * cannot account for.
 *
 * `null` is never the nearest generation and never a guess — see rule 3 above.
 */
export function spineGeneration(version: string): SpineGeneration | null {
  const match = VERSION_STRING.exec(version);
  if (match === null) return null;
  const chain = match[2] === '' ? [] : match[2].split('-from-').slice(1);
  const known = SPINE_GENERATIONS as readonly string[];
  const steps = [match[1], ...chain].map((token) => known.indexOf(token));
  if (steps.some((at) => at < 0)) return null;
  for (let i = 1; i < steps.length; i++) if (steps[i] <= steps[i - 1]) return null;
  return SPINE_GENERATIONS[steps[0]];
}

/**
 * The constraint kinds a skeleton can carry as a **top-level array**, which 4.3
 * folded into one `constraints` array with a `type` on each entry.
 *
 * 4.3 reads `constraints` and nothing else, so an array under any of these names
 * loads without an error and the constraints in it are simply not there — #706
 * row 1, and what `A01_NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS` refuses in emitted
 * data. `slider` never had a top-level form (sliders are 4.3's own), and it is
 * on this list for the same reason as the other four: a constraint parked
 * outside `constraints` vanishes whatever its kind, and a list with a hole in it
 * is a rule with a hole in it.
 */
export const TOPLEVEL_CONSTRAINT_ARRAYS: readonly string[] = ['ik', 'transform', 'path', 'physics', 'slider'];

/**
 * The bone key 4.2 spelled `transform` and 4.3 spells `inherit`.
 *
 * The old key does not throw and does not warn — it is an unknown field, so the
 * bone falls back to Normal inheritance (#706 row 6, and
 * `A02_NO_BONE_TRANSFORM_KEY`).
 */
export const LEGACY_BONE_INHERIT_KEY = 'transform';

/**
 * The physics-constraint fields whose **omitted default** is not the same number
 * in 4.2 as in 4.3.
 *
 * JSON omits a field equal to the parser's default, so the same file means two
 * different constraints under two readers: `inertia` and `damping` both default
 * to 1 in 4.2's `SkeletonJson` and to 0.5 and 0.85 in 4.3's (#706 row 4, which
 * also counts 111 shipped constraints omitting `inertia`). The numbers are not
 * repeated here deliberately — a hand-copied table is what #706 policy 3 exists
 * to refuse, and item 2's generated table is where they belong. What a caller
 * needs from this list is which fields to *count*, and that is what it is.
 */
export const PHYSICS_FIELDS_WHOSE_DEFAULT_MOVED: readonly string[] = ['inertia', 'damping'];
