/**
 * What a SKIP says, by what the assertion was denied (issues #568, #580, #608).
 *
 * Moved here from `src/validate.ts` by issue #1025 (step 4c of #380), words
 * unchanged: an assertion body now lives in a module that links nothing from
 * the runtime (`./bodies/`), and the bodies print these sentences on both
 * sides — over what spine-core loaded and over the model document. A sentence
 * kept in the file that links spine-core could not be read by the second.
 * `src/validate.ts` re-exports every one, so nothing that imported them from
 * there moves.
 */

/**
 * What a SKIP says when `A00_ROUNDTRIP_PARSE` handed an assertion nothing to
 * look at.
 *
 * Two of them rather than one, because what an assertion was denied is the whole
 * content of its SKIP: `A20` wanted the loaded skeleton and `A06` wanted the
 * loaded atlas, and a reader who is told which can tell a rule that is waiting
 * on the parse from one that is waiting on the art. Both point at A00 instead of
 * restating its detail, which the FAIL row prints in full.
 *
 * Exported so a control compares against them rather than quoting them — the
 * same reason `ASSERTION_NAMES` is exported.
 */
export const SKIP_NO_SKELETON = 'the round trip did not produce a skeleton to measure (A00 owns that failure)';
export const SKIP_NO_ATLAS = 'the round trip did not produce an atlas to measure (A00 owns that failure)';
/**
 * The third of them, and it is NOT waiting on A00 (issue #608): the atlas parsed
 * and it has no pages, which is what a compile that measured no art writes. The
 * four rules whose only subject is a page — A06, A17, A19, A27 — have nothing to
 * look at, and an empty loop walking out of `check()` is reported as a PASS.
 */
/*
 * **An empty subject list: SKIP or PASS, and which one is derived (issue #580).**
 *
 * `check()` records a pass when a body runs to its end without a `fail()` or a
 * `skip()`, so a body whose main construct is a loop over a list that is EMPTY
 * passes having measured nothing — the vacuous green one ring out from the bare
 * `return` guards issue #568 converted. Two different things can be true of such
 * a loop, and the criterion decides between them by reading the rule's own name
 * and its `fail()` sentences rather than by preference:
 *
 *   * A name of the form ⟨subject⟩_⟨property⟩ — `REGION_WIDTH_HEIGHT_FINITE`,
 *     `MESH_TRIANGLES_AND_ENCODING`, `PHYSICS_CONSTRAINT_EFFECTIVE`,
 *     `ATLAS_PAGE_SIZE_MATCHES_PNG` — quantifies over the subject it names, and
 *     its `fail()` names a member of that subject, the value found and the value
 *     required. With no member, nothing was measured: it **SKIPs**, and the
 *     reason names the subject that was absent.
 *   * A name of the form NO_⟨construct⟩ — `NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS`,
 *     `NO_BONE_TRANSFORM_KEY`, `NO_CLIPPING_ATTACHMENTS`, `NO_DARK_COLOR`,
 *     `NO_FULL_FRAME_MESH` — quantifies over occurrences of something a correct
 *     artifact has NONE of, and its `fail()` reports that the construct is
 *     present rather than measuring a value on it. Zero occurrences IS the
 *     measurement, so it **PASSes**: the loop is a search of the artifact, and
 *     the artifact is what it measured.
 *   * A name carrying both halves takes each at its word.
 *     `A15_IDLE_NO_MESH_BONE_KEYS` is the pattern and already reads this way: no
 *     `idle` animation, or an `idle` with no bone timeline, is the named subject
 *     absent and SKIPs; no mesh-driving bone among the bones `idle` does key is
 *     the construct absent and passes. `A10_NO_NAN_AFTER_STEPPING` was the same
 *     shape until issue #902, and is the next bullet's now: #882 gave it a
 *     setup-pose clause whose subject is the bones, beside the stepping clause
 *     whose subject is the animations.
 *   * An assertion with more than one clause SKIPs only when EVERY clause had
 *     nothing to measure, which is the shape `A09`, `A33` and `A38` already
 *     carry (`polygons.length === 0 && endsChecked === 0`), and `A10` since #902.
 *     `A13_MESH_BUDGET` is why the clause is stated: a declared slot budget is
 *     measured against a count of mesh slots, and zero is a count, so that half
 *     passes on a rig with no mesh — while a rig that declares only a TRIANGLE
 *     budget has nothing left to measure and skips.
 *
 * ⚠️ What the criterion is not allowed to become is a table of assertions with
 * their verdicts written beside them. Every row above is decided by reading the
 * name and the sentences the assertion already prints, so a rule added tomorrow
 * is decided by the same reading and nobody re-opens this question.
 */

/**
 * What a SKIP says when the artifact carries no member of the subject a rule
 * quantifies over (issue #580), by subject.
 *
 * One constant per SUBJECT rather than one per assertion, for the reason the two
 * above are two: what the rule was denied is the whole content of its SKIP, and
 * three rules denied the same thing should say so in the same words. Exported so
 * a control compares against them rather than quoting them.
 */
export const SKIP_NO_REGION_ATTACHMENT = 'the skeleton carries no region attachment';
export const SKIP_NO_MESH_ATTACHMENT = 'the skeleton carries no mesh attachment';
export const SKIP_NO_ANIMATION = 'the skeleton carries no animation';
/**
 * A10's (issue #902): its setup clause reads the bones and its stepping clause
 * the animations, so it skips only when the skeleton carries neither — and the
 * sentence is `SKIP_NO_ANIMATION`'s with the second subject added, so the two
 * cannot drift into different words for the same absence.
 */
export const SKIP_NO_POSE = `${SKIP_NO_ANIMATION} and no bone, so there is no setup pose to read and nothing to step`;
export const SKIP_NO_TIMELINE = 'no animation here carries a timeline';
export const SKIP_NO_PHYSICS_CONSTRAINT = 'the skeleton declares no physics constraint';
export const SKIP_NO_ATLAS_PAGE = 'the atlas declares no page';
export const SKIP_NO_ATLAS_REGION = 'the atlas declares no region';
/** A49's (issue #1099): the subject is a pair of regions on one page, and an atlas of one-region pages carries none. */
export const SKIP_NO_ATLAS_REGION_PAIR = 'no page of the atlas carries two regions, so there is no pair of footprints to hold apart';
export const SKIP_NO_ATTACHMENT_REGION_JOIN =
  'no attachment names a region and the atlas declares none, so there is no attachment-to-region join to hold';
export const SKIP_NO_TWO_COLOR_TINT =
  'no slot declares a "dark" colour and no animation keys an "rgba2" or "rgb2" timeline, so there is no two-colour tint to read back';
export const SKIP_NO_SEPARABLE_COLOR =
  'no animation keys an "rgb" or "alpha" timeline, so there is no separable slot colour to read back';
export const SKIP_NO_LINKED_MESH = 'no attachment in this skeleton takes its geometry from another one';
export const SKIP_NO_SEQUENCE =
  'no attachment carries a "sequence" block and no animation keys a "sequence" timeline, so there is no numbered series to read back';
/**
 * A09's, which predates this list and joins it rather than being rewritten: it
 * is the same fact about the same subject, and a control that compares against
 * eight constants and quotes the ninth is a control with a hand-kept exception
 * in it.
 */
export const SKIP_NO_DECLARED_DURATION =
  'the motion spec declares no animations and the skeleton has none — a static rig has no duration to compare';

/**
 * The model side's `SKIP_NO_SKELETON` (issue #1025): the reader refused the
 * document, or the document names a region its pages lack, so a body that
 * reads the model has nothing to read. It names the two model-side parse
 * rules rather than A00, because on this side there is no round trip — the
 * reader and the region rule are what stand in its place (`./model/parse.ts`).
 */
export const SKIP_NO_MODEL = 'the model side read no document to measure (A00_MODEL_READ or A00_MODEL_REGIONS_ON_PAGES owns that failure)';
