/**
 * rigc compile — rig spec + motion spec (+ an optional cut manifest) -> Spine 4.3
 * skeleton JSON and a one-part-per-page atlas. Pure data assembly: no spine-core
 * here (that is the validator's job), no clock, no randomness.
 *
 * Three inputs, one domain each — [`src/rig.ts`](rig.ts) states the split in
 * full. In one line: the **manifest** owns measured art, the **rig spec** owns
 * skeleton structure, the **motion spec** owns time.
 *
 * ⭐ The rig spec is what this file used to hard-code. Until it existed the bone
 * tree and the slot table were three tables in `src/archetype.ts`, a slot outside
 * them was a compile error, and no skeleton anybody else owns could be stated at
 * all (blocker B1). The two things that were genuinely code and stayed code are
 * the **mesh generators** (`src/mesh.ts` — they encode a deformation model, not a
 * table of numbers) and the **coordinate contract** (`src/transform.ts`).
 *
 * Determinism is a contract, not a habit: `validate` re-runs this and compares
 * the two emits byte for byte (assertion A18).
 */
import { basename, dirname, join, relative, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { readPngInfo } from './png.ts';
import {
  DEPTH_TONE_IDENTITY,
  DepthError,
  checkTone,
  checkZScale,
  depthDigest,
  sampleLevel,
  toneLevel,
  turnCeiling,
  type DepthMap,
  type DepthNear,
  type DepthTone,
} from './depth.ts';
import { CompileError, NotImplementedError } from './errors.ts';
import { parseJsonWithPosition } from './json-position.ts';
// The "did you mean" list on a missing atlas region, from the one implementation
// of it — the same search serves `refuseUnknownKeys`, and a second copy here with
// a threshold edited is how such a pair drifts apart.
import { nearMisses } from './keys.ts';
import { parseMotionSpec } from './motion.ts';
import {
  constraintAt,
  declaresNoStage,
  parseRigSpec,
  RIG_FROM_PROPERTIES,
  RIG_PATH_POSITION_MODES,
  RIG_PATH_ROTATE_MODES,
  RIG_PATH_SPACING_MODES,
  RIG_SCALE_Y_MODES,
  RIG_SKIN_CONSTRAINT_KEYS,
  splitRigSkin,
  type RigAttachment,
  type RigBone,
  type RigBoundingBoxAttachment,
  type RigClippingAttachment,
  type RigEvent,
  type RigLinkedMeshAttachment,
  type RigMeshAttachment,
  type RigMeshBinding,
  type RigPathAttachment,
  type RigRegionAttachment,
  type RigSkinParts,
  type RigSpec,
  type RigVertexGeometry,
  type RigDepthMap,
  type RigSoftRegion,
} from './rig.ts';
import {
  buildContourMesh,
  buildGridMesh,
  buildRibbonMesh,
  buildRingMesh,
  checkHullOrder,
  encodeWeightedVertices,
  formatWalk,
  measureAuthoredMeshFit,
  meshEdges,
  MeshError,
  ringControlAngles,
  traceOutline,
  type MeshBoneRef,
  type MeshFitReport,
  type MeshGeometry,
  type MeshVertexWeight,
} from './mesh.ts';
import { Plate, readPlate } from '../tools/plate.ts';
import {
  extractRegion,
  pageFootprint,
  parseAtlasText,
  rewritePageNames,
  writeAtlasText,
  type AtlasRegion,
  type ParsedAtlas,
} from './atlas.ts';
import { KEY_TIME_EPSILON, physicsKeyRefusal, physicsRuleFor, type PhysicsPoseRule } from './timelines.ts';
import { evaluateDeformTransform } from './deformgen.ts';
import { evaluateTrackDerive, TRACK_DERIVE_PROJECTIONS, type TrackDeriveMember } from './trackgen.ts';
import {
  computeWorldTransforms,
  cropToSpineY,
  normaliseDegrees,
  screenToSpineDegrees,
  toBoneLocal,
  toBoneLocalVector,
  toWorld,
  TransformError,
  type BoneTransform,
} from './transform.ts';
import type {
  CompileResult,
  CompiledImage,
  DroppedState,
  EasingHandles,
  FaceManifest,
  FaceManifestPart,
  MotionDeformTrack,
  MotionDrawOrderKey,
  MotionEventKey,
  MotionIkTrack,
  MotionMemberValues,
  MotionSpec,
  MotionTrack,
  MotionTransformTrack,
  MotionValueKey,
  MotionValueTrack,
  RigInfo,
  SpineAttachment,
  SpineBone,
  SpineBoundingBoxAttachment,
  SpineClippingAttachment,
  SpineConstraint,
  SpineEvent,
  SpineLinkedMeshAttachment,
  SpineMeshAttachment,
  SpinePathAttachment,
  SpineRegionAttachment,
  SpineSkeletonJson,
  SpineSlot,
  SpineTimelineKey,
} from './types.ts';

export { CompileError, NotImplementedError };

/** The spine-core line the validator round-trips through. */
export const SPINE_VERSION = '4.3.13';

const FRAME = 1 / 60;

/**
 * The order the emitted `animations` object is keyed in: **the Spine editor's own
 * comparator, as far as anybody has measured it** — natural and case-insensitive
 * (#539) — with every name set refused on which one of that comparator's four
 * UNMEASURED choices could decide a pair.
 *
 * ⚠️ This emitted **codepoint** order until issue #543, and the refusal was the
 * thing that made codepoint agree with the editor: every pair the two could order
 * differently was a `CompileError`. That is sound and it over-refuses by
 * construction, because codepoint is not a member of the family it is being
 * defended against — it is neither natural nor case-insensitive — so `Turn`
 * against `sweep` and `turn10` against `turn2`, **the two pairs the editor was
 * directly measured on**, were refused rather than emitted in the order the
 * editor was measured returning. Sorting by a member of the measured family
 * instead moves the refusal onto what is actually unmeasured, and moves no byte:
 * on every set the codepoint rule accepted, the two orders are the same (that is
 * what the rule guaranteed), which is why this change is invisible to every rig
 * in the tree.
 *
 * ## Why the emitter has an opinion about this at all
 *
 * A `slider` constraint names the animation it applies, and in JSON that is a
 * name on both sides. The **binary** format is where the same reference is an
 * ordinal — `SkeletonBinary.js`: `constraint.animation = animations[readInt()]`
 * — and an editor whose own model holds that ordinal reads the name at import
 * and writes back whatever now stands at that position. Round-tripped through a
 * licensed editor (data version 4.3.26), `gallery/look` went in as
 * `turn, tilt, sweep` with `yaw -> "turn"` and came back as `sweep, tilt, turn`
 * with **`yaw -> "sweep"`** (issue #535). Nothing in the returned file says so;
 * it parses, it validates, and it applies the wrong animation.
 *
 * ⭐ The second slider is the control that names the mechanism rather than a
 * second victim: `tilt` survived because it sat at index 1 in *both* orderings
 * and index 1 is called `tilt` in both.
 *
 * ⇒ Emitting in the editor's own order makes its re-sort a no-op, so no index
 * moves and no reference is repointed. Measured on the same rig through the
 * same editor: mean absolute error over the re-rendered frames fell from
 * 10.4655 / 8.4961 / 8.7140 to 0.3035 / 0.0769 / 0.0588, and `yaw -> "turn"`
 * came back intact.
 *
 * ## What the editor's comparator is, and which parts of it are known
 *
 * ⚠️ This comment used to say that codepoint order "is what every editor-authored
 * file on hand is in", and that sentence was false when it was written. The
 * counterexample ships with the tests: `examples/spineboy/export/spineboy-pro.json`
 * keys `portal-flare9` **before** `portal-flare10` — in its default skin's
 * attachment map and in two of `portal`'s timeline maps — and no codepoint sort
 * produces that.
 *
 * 🔢 The survey behind that, stated so it can be re-taken rather than believed:
 * over the 12 skeletons in `examples/`, take **every object the format keys by a
 * NAME that carries more than one key** — `animations` and `events`; each skin's
 * `attachments` map and each per-slot map inside it; each animation's `bones`,
 * `slots`, `ik`, `transform`, `path`, `physics`, `events`, and its deform
 * `attachments` at **all three** of its levels (skin, then slot, then attachment
 * name). Arrays are excluded because the editor leaves them alone. That is
 * **105** collections, of which **102** are consistent with a codepoint sort and
 * **3** are not; all 12 natural comparators and all 8 `Intl.Collator`
 * configurations tried reproduce every one of the 105.
 *
 * ⚠️ The deform clause is the whole of what makes it 105 rather than 104, and it
 * is one collection: `animations.hoverboard.attachments.default` in
 * `spineboy-pro.json`, whose four keys are slot names. Counting the skin level
 * of a deform block and stopping there needs an exception the sentence above
 * cannot state — every level of it is keyed by a name, and the editor re-keys
 * each one — so the rule is "every level", and that collection is in.
 *
 * The editor was then measured directly (issue #539). Two rigs, each varying one
 * axis: `Turn, sweep, wave` came back `sweep, Turn, wave`, and
 * `turn10, turn2, zoom` came back `turn2, turn10, zoom`. The intersection leaves
 * one hypothesis — **natural order, case-insensitive**.
 *
 * ⚠️ "Natural, case-insensitive" is a **family** of comparators rather than one.
 * Leading zeros (`turn01` against `turn1`), a pure case tie (`Turn` against
 * `turn`), whether a digit run sorts before a word, and what a separator is worth
 * are each a free choice, and **the editor's answers to them are not measured**.
 * Writing a comparator that sorts every name set means choosing all four, and a
 * chosen-but-unmeasured comparator is exactly how #537 landed.
 *
 * ⇒ 🔑 **So the family is never asked to sort a pair one of those four decides.**
 * `measuredOrder` returns a verdict only where every member of the family must
 * agree, and `refuseNamesTheEditorCouldKeyDifferently` stops the build on any pair
 * where it cannot — which means the four choices below are **unobservable in the
 * output**, and the claim the emit makes is the one #542 established, widened:
 * *on this name set, every comparator consistent with what has been measured
 * produces this order.* Checkable inside rigc, with no editor and no oracle.
 *
 * 🔒 The emitted key order is still the one claim in the emitter no gate can see.
 * spine-core reads back everything else rigc writes; it does not sort. What
 * replaces an oracle is the quantifier: the order is not *a* comparator's answer,
 * it is the answer they all give.
 *
 * ⭐ The two-sided result is on editor-written data. Sorting each of the 105
 * collections above by `measuredOrder` reproduces **105 of 105** — including the
 * three no codepoint sort can — and refuses **none** of them. The codepoint rule
 * reproduced 102 and refused those same 3.
 *
 * The family is hand-rolled and locale-independent, which `A18` requires:
 * `localeCompare` would make the emitted bytes a property of the machine.
 */
function editorAnimationOrder<T>(animations: Record<string, T>): Record<string, T> {
  const names = Object.keys(animations);
  // ⭐ The sort is the check's own OUTPUT rather than a second reading of the same
  // names: the refusal walks every pair and hands back the verdict it certified
  // for each, so "the order rigc emits" and "the order rigc checked" cannot drift
  // into two readings the way a shared comparator still can.
  const verdicts = refuseNamesTheEditorCouldKeyDifferently(names, ANIMATION_ORDER);
  // Nested rather than keyed on a joined string: any character this could join
  // on is one an animation name is allowed to contain, and two pairs that
  // collided would silently share one verdict.
  names.sort((a, b) => verdicts.get(a)?.get(b) ?? 0);
  const ordered: Record<string, T> = {};
  for (const name of names) ordered[name] = animations[name];
  return ordered;
}

/** The skin the editor keeps at index 0 whatever its name sorts as. */
const DEFAULT_SKIN = 'default';

/**
 * The order the emitted `skins` array is written in: **`default` first, then the
 * rest in the order the editor was measured returning them** — with every pair
 * refused on which a comparator consistent with that measurement could disagree.
 *
 * ## Why the emitter has an opinion about this at all
 *
 * The same reason it has one about `animations` (#535), in the collection nobody
 * had checked. `SkeletonBinary` addresses skins by ORDINAL — `skins[readInt()]`
 * for an attachment timeline, `skins[linkedMesh.skinIndex]` for a linked mesh —
 * so an editor that writes this array in another order repoints every such
 * reference, silently, in a file that still parses.
 *
 * ⚠️ `src/types.ts` said for two releases that `skins` was one of the arrays an
 * editor leaves alone, and #544 softened that to *unmeasured* rather than
 * retracting it. Issue #541 measured it: a rig built `default, zulu, mike,
 * alpha` exported `default, alpha, mike, zulu`. Three arrays — `bones` (30),
 * `slots` (24), `constraints` (3) — had come back element for element, and the
 * belief was a generalisation off those three.
 *
 * ## What is measured, and it is two separate facts
 *
 * - **`default` is pinned, not sorted.** `alpha` sorts before `default` under
 *   every candidate comparator and came back *after* it. That is the whole
 *   evidence, and it is decisive: the runtime's own `defaultSkin` is index 0.
 * - **The rest came back `alpha, mike, zulu`.** ⚠️ Which separates nothing.
 *   Those three names are lower-case ASCII with no digits and no separators, so
 *   codepoint, case-folded, natural, and every collator agree on them. The
 *   editor's skin comparator is **not established**, and a rig with `Zulu`,
 *   `mike10`, `mike2` in it is what would establish it.
 *
 * 🔑 So this deliberately does NOT reuse `measuredOrder` alone. #539 measured
 * the editor's comparator for `animations` and `events` — natural, and
 * case-insensitive — and #543 narrowed the animation refusal onto what is left
 * unmeasured *inside that family*. None of that is a measurement about skins:
 * it is one program, and the inference that one program sorts two collections
 * the same way is exactly the shape of the inference that put `skins` on the
 * safe side of the list in the first place. `measuredSkinOrder` therefore
 * certifies a pair only where the natural case-insensitive family **and plain
 * codepoint** agree, which is the pre-#543 rule — correct here for the reason
 * it was too strong there: for animations, codepoint had been *refuted*; for
 * skins, nothing has refuted anything.
 *
 * ⇒ Every skin name in this tree is lower-case ASCII without digits, so no
 * emitted byte moves and no rig is refused. What moves is the claim.
 */
function editorSkinOrder<T extends { name: string }>(skins: readonly T[]): T[] {
  const pinned = skins.filter((skin) => skin.name === DEFAULT_SKIN);
  const rest = skins.filter((skin) => skin.name !== DEFAULT_SKIN);
  const verdicts = refuseNamesTheEditorCouldKeyDifferently(
    rest.map((skin) => skin.name),
    SKIN_ORDER,
  );
  rest.sort((a, b) => verdicts.get(a.name)?.get(b.name) ?? 0);
  return [...pinned, ...rest];
}

/**
 * The characters whose relative order every member of the measured family agrees
 * on: the digits and, once case is folded, the lower-case ASCII letters.
 * Everything else — `-`, `_`, a space, an accented letter — is worth something
 * different to a collator that ignores punctuation than to one that does not, so
 * a pair those decide is not settled.
 */
const SETTLED_CHARS = /[0-9a-z]/;

/** Maximal runs of digits and of non-digits, which is what "natural" compares. */
const runsOf = (name: string): string[] => name.match(/\d+|\D+/g) ?? [];

const codepoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** What made a pair's order a matter of opinion, and what the author has to do. */
interface Ambiguity {
  kind: 'case' | 'number' | 'separator';
  because: string;
  repair: string;
}

/**
 * How the editor's comparator orders these two names — or, when one of its four
 * unmeasured choices is what decides them, what that choice is and what the
 * author has to do about it.
 *
 * ## It is a certificate, not a hazard list
 *
 * Issue #539 proposed checking for "two names differing only in case, or sharing
 * a prefix followed by digit runs of unequal length". **That list misses the rig
 * that produced the measurement**: `Turn` and `sweep` differ in much more than
 * case and carry no digits, and they are the pair the editor reordered. A list of
 * hazards is open-ended — one was missing the day it was written — so what is
 * implemented is the other direction: a verdict is returned only where the
 * position that decides the pair is one **every** comparator consistent with the
 * measurement must read the same way, and everything else stops the build.
 *
 * ## The four choices this returns an `Ambiguity` for, and why each is free
 *
 * - **case** (`Turn` against `turn`) — the two fold together, so only a tie-break
 *   separates them and nobody has measured which way it breaks.
 * - **number**, one number written twice (`turn01` against `turn1`) — the runs are
 *   numerically equal, so again only a tie-break separates them: shorter-first,
 *   longer-first and lexicographic are all real implementations.
 * - **number**, a digit run against a word (`1turn` against `turn`) — comparators
 *   differ on whether a number sorts before a word.
 * - **separator** — the deciding character is neither a letter nor a digit. This
 *   one covers two adversaries at once: a collator that treats `-` or a space as
 *   ignorable, and the plain fact that `_` sits *between* `Z` and `a`, so
 *   `x.toUpperCase()` and `x.toLowerCase()` order `wave_x` against `wavea`
 *   oppositely. Neither name needs a capital in it for that to bite.
 *
 * ⚠️ There used to be a fifth and a sixth, and both were artefacts of emitting
 * codepoint rather than facts about the editor (issue #543). A pair folding the
 * other way (`Turn` against `sweep`) and two digit runs of unequal width
 * (`turn10` against `turn2`) are exactly the two pairs the editor **was**
 * measured on, and every comparator in the family orders them the same way — so
 * they are now emitted in that order rather than refused. `flare1` against
 * `flare10`, the over-refusal #542 named and accepted, goes with them.
 *
 * ## What it was tested against
 *
 * 22 comparators — 12 hand-rolled naturals (fold up/down × three leading-zero
 * tie-breaks × digits-before/after words), 2 plain case-insensitive ones, and 8
 * `Intl.Collator`s (`numeric: true`, four sensitivities × `ignorePunctuation`) —
 * over every pair of names up to 4 characters from `{a B 0 1 2 - _ space}`:
 * **10,948,860 pairs**. Three figures come off that bank and each is load-bearing:
 *
 * - **0 escapes**, where an escape is a pair some comparator orders differently
 *   from the verdict returned here. Measured over the **20 natural** members —
 *   the 12 hand-rolled and the 8 collators, all of which read a digit run as a
 *   number. The 2 plain case-insensitive comparators do dissent (291,684 pairs),
 *   and they are the two #539's own measurement refutes: a comparator that reads
 *   `turn10` as text cannot return `turn2, turn10`.
 * - **0 pairs move.** On every pair the codepoint rule accepted, this returns the
 *   codepoint order — which is why no emitted byte in the tree changes.
 * - the refusal covers **9,140,115** pairs where the codepoint rule covered
 *   10,218,136: 1,078,021 pairs are now built instead of renamed.
 *
 * ⭐ And the two-sided result is on real data: across the 105 editor-written
 * collections the survey above defines, sorting by this reproduces all 105 and
 * refuses none. No false positive, no false negative, against names the editor
 * itself wrote.
 */
function measuredOrder(a: string, b: string): number | Ambiguity {
  const caseRepair = 'rename one of them so they differ by more than letter case';
  const zerosRepair = 'write the number one way — rename so the digit run has a single spelling, with leading zeros or without';
  const wordRepair = 'rename so a run of digits never has to be compared against a word';
  const separatorRepair = 'rename so the first character that differs is a letter or a digit';
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la === lb) {
    return {
      kind: 'case',
      because: `they are one name in two cases, and which of them the editor puts first is not measured`,
      repair: caseRepair,
    };
  }
  let i = 0;
  while (i < la.length && i < lb.length && la[i] === lb[i]) i++;
  if (i === la.length || i === lb.length) {
    const longer = la.length > lb.length ? a : b;
    const rest = (la.length > lb.length ? la : lb).slice(i);
    if (!SETTLED_CHARS.test(rest)) {
      return {
        kind: 'separator',
        because:
          `"${longer}" is the other name followed by ${JSON.stringify(rest)}, which a comparator that ignores ` +
          'punctuation reads as the same name',
        repair: separatorRepair,
      };
    }
  } else if (!SETTLED_CHARS.test(la[i]) || !SETTLED_CHARS.test(lb[i])) {
    const deciding = SETTLED_CHARS.test(la[i]) ? lb[i] : la[i];
    return {
      kind: 'separator',
      because:
        `the first character that differs is ${JSON.stringify(deciding)}, which is neither a letter nor a digit, ` +
        'and what that is worth is a property of the comparator',
      repair: separatorRepair,
    };
  }
  const ra = runsOf(la);
  const rb = runsOf(lb);
  for (let k = 0; k < Math.min(ra.length, rb.length); k++) {
    const x = ra[k];
    const y = rb[k];
    if (x === y) continue;
    const xIsDigits = /^\d/.test(x);
    const yIsDigits = /^\d/.test(y);
    if (xIsDigits && yIsDigits) {
      const nx = BigInt(x);
      const ny = BigInt(y);
      if (nx === ny) {
        return {
          kind: 'number',
          because: `"${x}" and "${y}" are the same number written two ways, so only a tie-break separates them`,
          repair: zerosRepair,
        };
      }
      return nx < ny ? -1 : 1;
    }
    if (xIsDigits !== yIsDigits) {
      return {
        kind: 'number',
        because:
          `one has the digits "${xIsDigits ? x : y}" where the other has "${xIsDigits ? y : x}", and comparators ` +
          'differ on whether a number sorts before a word',
        repair: wordRepair,
      };
    }
    return codepoint(x, y);
  }
  // One name's runs are a prefix of the other's — `wave` against `wave1`. Every
  // comparator puts the shorter first; `la === lb` above already took the case
  // where neither is longer.
  return ra.length < rb.length ? -1 : 1;
}

/**
 * How the editor orders two SKIN names — or what makes the pair a matter of
 * opinion, under a family wider than `measuredOrder`'s by exactly one member.
 *
 * ## The extra member is plain codepoint, and it is here because nothing ruled
 * it out
 *
 * #539 put two name sets through the editor and read them back, and what those
 * two sets refute is that the editor sorts ANIMATIONS by codepoint: `Turn`
 * before `sweep` and `turn10` before `turn2` are the codepoint answers, and the
 * editor gave the other one both times. #543 is built on that refutation — it
 * sorts by the natural, case-insensitive family and refuses only that family's
 * four unmeasured choices.
 *
 * ⚠️ **The skins measurement refutes nothing.** `alpha, mike, zulu` is the
 * answer every candidate gives, so codepoint is still standing for this
 * collection. Carrying #543's narrowing over would be assuming that one editor
 * sorts two collections by one comparator — plausible, unmeasured, and the same
 * move that made `skins` "an array the editor leaves alone" for two releases.
 *
 * ⇒ A verdict is returned only where `measuredOrder` certifies the pair **and**
 * codepoint agrees with it. On the pairs where they differ, the disagreement is
 * itself the explanation: either folding the two reverses them, or reading a
 * digit run as a number does, and the editor's choice between those readings is
 * measured for animation names and not for skin names.
 *
 * 🔒 It is deliberately a *narrowing of `measuredOrder`* rather than a second
 * comparator: one certificate, one place a family member is decided, and no way
 * for the two to come to disagree about what "settled" means.
 */
function measuredSkinOrder(a: string, b: string): number | Ambiguity {
  const verdict = measuredOrder(a, b);
  if (typeof verdict !== 'number' || codepoint(a, b) === verdict) return verdict;
  // `measuredOrder` and codepoint can only part company where folding or a digit
  // run decides the pair — everything else it already refuses. Which of the two
  // it is, is what the author has to read.
  const foldingDecides = codepoint(a.toLowerCase(), b.toLowerCase()) !== codepoint(a, b);
  return foldingDecides
    ? {
        kind: 'case',
        because:
          `folded to one case "${a}" and "${b}" order the other way round, so whether the editor folds SKIN ` +
          'names decides this pair — and only its ANIMATION and EVENT names have been measured folded (#539)',
        repair: 'rename one of them so their order does not turn on letter case',
      }
    : {
        kind: 'number',
        because:
          `read as numbers the digit runs in "${a}" and "${b}" order the other way round from the same runs read ` +
          'as text, so whether the editor sorts SKIN names naturally decides this pair — and only its ANIMATION ' +
          'and EVENT names have been measured sorted naturally (#539)',
        repair: 'pad the digit runs to the same width, or rename so no number decides the order',
      };
}

/** How many pairs a refusal spells out before it starts counting them instead. */
const PAIRS_SPELLED_OUT = 8;

/**
 * What one collection's order refusal has to say that the others' do not: what
 * it is counting pairs of, which comparator family it certified them against,
 * and what an order rigc got wrong would cost.
 *
 * Two collections share the walk below because they share the defect — a
 * name-keyed collection whose ORDINAL is a reference in the format's binary half
 * — and they must not share the sentence, because the family and the stakes are
 * different and a reader acts on both.
 */
interface OrderedCollection {
  /** Plural, for "N pair(s) of …": `animation names`, `skin names`. */
  noun: string;
  /** The certificate. A number is an order; an `Ambiguity` stops the build. */
  order: (a: string, b: string) => number | Ambiguity;
  /** Why rigc has an opinion, and what the family leaves open. Ends on a space. */
  why: string;
}

const ANIMATION_ORDER: OrderedCollection = {
  noun: 'animation names',
  order: measuredOrder,
  why:
    'rigc keys the emitted "animations" object in ' +
    "the Spine editor's own comparator, which is natural and case-insensitive (#539) — but four of that " +
    "comparator's choices have never been measured (a pure case tie, one number written two ways, a run of " +
    'digits against a word, and what a separator is worth), and each pair below is decided by one of them. A ' +
    "slider's animation is an ORDINAL in the format's binary half, and an editor that keys these differently " +
    'repoints every slider whose animation moves index — silently, in a file that still parses (#535). ',
};

const SKIN_ORDER: OrderedCollection = {
  noun: 'skin names',
  order: measuredSkinOrder,
  why:
    'rigc writes the emitted "skins" array with "default" first and the rest in the order the editor was ' +
    'measured returning them (#541) — but that measurement was taken on `alpha, mike, zulu`, which every ' +
    "candidate comparator orders the same way, so the editor's skin comparator is not established and each " +
    'pair below is one the candidates disagree about. A skin is an ORDINAL in the format\'s binary half — ' +
    '`skins[readInt()]` for an attachment timeline, `skins[skinIndex]` for a linked mesh — so an editor that ' +
    'writes them in another order repoints every such reference, silently, in a file that still parses. ',
};

/**
 * Refuse a set of names the editor could write in an order rigc did not emit,
 * and hand back the verdict for every pair that survived — the check that lets
 * `editorAnimationOrder` and `editorSkinOrder` sort by a measured family without
 * choosing a member of it.
 *
 * It is deliberately **not** conditional on anything: not on the rig declaring a
 * slider, and not on the rig declaring the editor as a consumer. A slider is what
 * makes the difference bite today and `invariants.editorRoundTrip` is how a rig
 * says the editor is downstream, but the emitted order is a claim about the
 * editor either way, and a check that only ran for some rigs would make the claim
 * hold for some and not others with nothing in the file saying which — adding the
 * slider, or the declaration, would then be the edit that refuses a rig that built
 * yesterday. What issue #543 changed is the size of what is claimed, not who it is
 * claimed for.
 *
 * ⚠️ `what` is a parameter and not a second copy of this walk because issue #541
 * found the same defect in a second collection, and a copied loop is how the two
 * come to check different things. What may NOT be shared is the family: `skins`
 * and `animations` have been measured to different depths, and
 * `OrderedCollection.order` is where each says which.
 */
function refuseNamesTheEditorCouldKeyDifferently(
  names: readonly string[],
  what: OrderedCollection,
): Map<string, Map<string, number>> {
  const verdicts = new Map<string, Map<string, number>>();
  const put = (x: string, y: string, v: number): void => {
    const row = verdicts.get(x) ?? new Map<string, number>();
    row.set(y, v);
    verdicts.set(x, row);
  };
  const found: string[] = [];
  for (let i = 0; i < names.length; i++) {
    put(names[i], names[i], 0);
    for (let j = i + 1; j < names.length; j++) {
      const verdict = what.order(names[i], names[j]);
      if (typeof verdict === 'number') {
        put(names[i], names[j], verdict);
        put(names[j], names[i], -verdict);
      } else {
        found.push(`"${names[i]}" / "${names[j]}" (${verdict.kind}) — ${verdict.because}; ${verdict.repair}`);
      }
    }
  }
  if (!found.length) return verdicts;
  const spelled = found.slice(0, PAIRS_SPELLED_OUT);
  throw new CompileError(
    `${found.length} pair(s) of ${what.noun} have no one order: ${what.why}` +
      `${spelled.join('. ')}` +
      (found.length > spelled.length ? `. …and ${found.length - spelled.length} more pair(s)` : ''),
  );
}

// ---------------------------------------------------------------------------
// number formatting — deterministic, and free of "-0"
// ---------------------------------------------------------------------------

function r6(n: number): number {
  const v = Math.round(n * 1e6) / 1e6;
  return v === 0 ? 0 : v;
}

/**
 * A **key time** on that same 1e-6 s grid — rounded DOWN rather than to nearest.
 *
 * ## Why key times get their own quantiser
 *
 * Every other emitted number is a quantity, and for a quantity nearest is the
 * least wrong answer. A key time is not a quantity: it is a **position against a
 * sample grid a player will step**, and the two directions of a half-step error
 * are not equally wrong. Rounded down, a key fires on the sample it was written
 * for, half a millionth of a second early, and nothing can see it. Rounded up, it
 * fires on the NEXT sample — a whole frame late — and on a stepped timeline that
 * is the wrong picture rather than a slightly wrong value.
 *
 * The arithmetic is not exotic, it is the common case: `2/12 s` and `5/30 s` are
 * both 0.16666666…, `r6` emits 0.166667, and 0.166667 is larger than either. The
 * spineboy run's muzzle flare fired one 12 fps frame late for exactly that, with
 * no error and no warning, until the run's own frame self-check caught it (issue
 * #99). ⚠️ An attachment timeline is inherently stepped, so it is where this
 * surfaces first — but a rotate key rounded up is a frame late too; it just hides
 * inside the interpolation.
 *
 * ## Why this is not `Math.floor(n * 1e6)`
 *
 * `n * 1e6` is itself a rounded double: `0.7 * 1e6` is 699999.9999999999, and
 * flooring it would move a time the grid represents **exactly** a whole step down.
 * So the value is rounded to nearest first and stepped back only when the result
 * genuinely overshoots the time it came from. A time already on the grid is
 * therefore emitted unchanged, which is what keeps `A18_DETERMINISTIC_EMIT` and
 * every committed artifact where they were.
 *
 * ## What it means for `KEY_TIME_EPSILON`
 *
 * The tolerance's job narrows rather than moves: an authored key can no longer
 * land past its own `duration` by the compiler's own rounding, so `checkKeyTime`
 * only refuses a key the author really did put past the end. The epsilon stays,
 * because A09 re-checks the same rule on an emitted file read back through a
 * Float32Array — where the grid is coarser and rounds both ways — and because a
 * `duration` is not required to be on the grid either.
 */
function keyTime(n: number): number {
  let units = Math.round(n * 1e6);
  if (units / 1e6 > n) units -= 1;
  const v = units / 1e6;
  return v === 0 ? 0 : v;
}

/**
 * Rule 4, per timeline: no key may land past the animation's declared duration.
 *
 * Rule 4 itself compares one number per animation — the largest key time across
 * every track — so a single track sitting on the declared duration answers for
 * all of them, and a key past the end on some *other* track is invisible to it.
 * That is exactly how rung 6 lost a one-frame attachment reveal; the tolerance
 * story is in `KEY_TIME_EPSILON`.
 *
 * ⚠️ It compares the **emitted** time, not the authored one, and since `keyTime`
 * rounds down that can only be more forgiving than comparing the author's number
 * — by less than one step of the grid. That is the honest side to err on: the
 * emitted time is the one a player samples, and refusing a key that will in fact
 * be reached would be refusing a correct animation.
 *
 * This is a refusal rather than an assertion because the key is the thing to
 * change and the motion spec is the file it lives in: the message has to name
 * the track and the key, and by gate time both are gone — the emitted skeleton
 * carries no declared duration at all, which is why Rule 4 exists.
 */
function checkKeyTime(where: string, time: number, authored: number, duration: number): void {
  const past = time - duration;
  if (past <= KEY_TIME_EPSILON) return;
  const at = time === authored ? `${time}s` : `t=${authored}, ${time}s after lag/stagger`;
  throw new CompileError(
    `${where}: key at ${at} is ${r6(past)}s past the declared duration ${duration}s — nothing that plays this ` +
      `animation for the duration it declares ever reaches it. Move the key to ${duration}, or declare the ` +
      `duration you meant.`,
  );
}

function channelHex(v: number): string {
  const clamped = Math.max(0, Math.min(1, v));
  return Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
}

function rgbaHex(v: number[]): string {
  if (v.length !== 4) throw new CompileError(`rgba value needs 4 channels, got ${v.length}`);
  return v.map(channelHex).join('');
}

/**
 * A two-colour key's seven channels, as the pair of hex strings the format
 * carries: `light` is `rrggbbaa`, `dark` is `rrggbb`.
 *
 * ⚠️ **Seven and not eight**, and the asymmetry is the format's rather than a
 * simplification here. `RGBA2Timeline.setFrame(frame, time, r, g, b, a, r2, g2,
 * b2)` stores three dark channels and no fourth, and `SkeletonJson`'s `rgba2`
 * branch reads `Color.fromString(keyMap.dark)` into a colour whose alpha it then
 * never passes on. `Color.setFromString` does fill one — `a = hex.length !== 8 ?
 * 1 : …` — so a `dark` written with eight digits loads without complaint and the
 * eighth pair is dropped one line later. Emitting six is emitting what is read.
 *
 * The channel ORDER is the format's too, and it is what a curve array indexes
 * by: `readCurve(…, 0..3, light r/g/b/a)` then `readCurve(…, 4..6, dark r/g/b)`.
 */
function rgba2Hex(v: number[]): { light: string; dark: string } {
  if (v.length !== 7) throw new CompileError(`rgba2 value needs 7 channels, got ${v.length}`);
  return { light: v.slice(0, 4).map(channelHex).join(''), dark: v.slice(4, 7).map(channelHex).join('') };
}

/**
 * One timeline a `MotionValueTrack` can name: the JSON fields a key carries, the
 * per-key default the parser uses for each, and — where the runtime has one — the
 * bound each field is held to.
 *
 * ⚠️ `bounds` is parallel to `fields`, not keyed by name, because a shape's
 * channels are positional everywhere else in this file (a curve array indexes by
 * channel) and a second addressing scheme for one table is how the two go out of
 * step. `null` in a slot is "the runtime bounds this field nowhere", which is the
 * value for every field of every shape but four of `PHYSICS_TRACKS`'.
 *
 * This is the `compileValueTrack` equivalent of `ConstraintTimelineShape.range`,
 * and the reason it took a change rather than a table entry is that the
 * ik/transform pair never shared this type: they carry named fields per key and
 * go through `compileConstraintTrack`, where `range` already lived (issue #610).
 */
interface ValueTrackShape {
  fields: string[];
  identity: number[];
  bounds?: Array<PhysicsPoseRule | null>;
}

/**
 * Bone timeline shapes: which JSON fields a key carries, and their defaults.
 *
 * The defaults matter more than they look: Spine omits a field that equals the
 * setup value, and `scale` defaults to 1 while `translate` defaults to 0. Emit
 * `x: 0` on a scale key and the bone collapses to nothing, silently.
 *
 * ⭐ **The table IS the dispatch**, the same way `SLOT_TRACKS` is: `resolveTargets`
 * asks `property in BONE_TRACKS` to decide the family, `compileValueTrack` writes
 * a key out of the shape it finds here, and the refusal for a property that is not
 * in it prints `Object.keys` of the same object — so the ten an author is handed
 * cannot disagree with the ten the emitter has, because there is only one list.
 *
 * 🚨 It printed nothing until issue #656. The dispatch was already this table, but
 * a bone track whose property missed it was refused as *"bone X cannot take slot
 * property Y"* — the wrong family for a spelling that usually belongs to none, and
 * the one target family whose refusal offered no way forward. That is also why the
 * selftest's spelling census had to STATE these ten (`PS143`, `PS144`): four
 * families printed their own vocabulary in their refusals and the bone family
 * printed nothing, so there was nothing to read it off.
 */
const BONE_TRACKS: Record<string, ValueTrackShape> = {
  translate: { fields: ['x', 'y'], identity: [0, 0] },
  translatex: { fields: ['value'], identity: [0] },
  translatey: { fields: ['value'], identity: [0] },
  scale: { fields: ['x', 'y'], identity: [1, 1] },
  scalex: { fields: ['value'], identity: [1] },
  scaley: { fields: ['value'], identity: [1] },
  shear: { fields: ['x', 'y'], identity: [0, 0] },
  shearx: { fields: ['value'], identity: [0] },
  sheary: { fields: ['value'], identity: [0] },
  rotate: { fields: ['value'], identity: [0] },
};

/**
 * Physics timelines — the eight `SkeletonJson`'s physics branch reads
 * (`SkeletonJson.js:1063-1094`), in the order it reads them. `mix` is the
 * constraint's authority; `reset` is an event with no value — one key at the
 * entry frame stops the constraint from flying in from whatever pose the
 * previous animation left — solved in DATA rather than in caller glue.
 *
 * 🚨 **`identity` here is the PER-KEY default, and for six of the eight it is
 * not the constraint's own default.** The parser sets `defaultValue = 0` at
 * `:1062` and only `mix` reassigns it (`:1090`), so an `inertia` key that omits
 * `value` reads **0** — not the 0.5 that `:306` gives a constraint that states
 * no `inertia`. Two different tables of defaults sit forty lines apart in one
 * file (`PHYSICS_PARAMS` above holds the other one), and reading the setup
 * column into this one would emit a `damping` timeline whose omitted keys mean
 * 0.85 to the author and 0 to the runtime. Nothing here depends on the number,
 * because `compileValueTrack` writes every field explicitly — it is recorded
 * because a reader checking rigc against the parser will trip over it.
 *
 * ⚠️ `mass` is the one whose keyed value is not what the runtime stores:
 * `PhysicsConstraintMassTimeline.set` is `pose.massInverse = 1 / value`
 * (`Animation.js:2132-2145`, "The timeline values are not inverted"), so the
 * key states a mass and the pose holds its reciprocal. A `mass` key of 0 is an
 * infinite `massInverse`, and `bounds` below is what refuses it here.
 *
 * ⭐ **`bounds` is not a second opinion about the same numbers.** Each entry is
 * a `PHYSICS_POSE_RULES` row — the one table `A23` judges a setup pose with —
 * and the rule is applied to the POSE FIELD the key becomes rather than to the
 * key, so `mass` is judged as `1 / value` on both sides of the tool. Four of the
 * seven have a rule and three deliberately do not: the runtime bounds `inertia`,
 * `wind` and `gravity` nowhere, and inventing one would refuse correct data
 * (issue #610 — the corpus keys `wind` negative on all 48 of its wind keys).
 */
const PHYSICS_TRACKS: Record<string, ValueTrackShape> = {
  inertia: { fields: ['value'], identity: [0], bounds: [physicsRuleFor('inertia') ?? null] },
  strength: { fields: ['value'], identity: [0], bounds: [physicsRuleFor('strength') ?? null] },
  damping: { fields: ['value'], identity: [0], bounds: [physicsRuleFor('damping') ?? null] },
  mass: { fields: ['value'], identity: [0], bounds: [physicsRuleFor('mass') ?? null] },
  wind: { fields: ['value'], identity: [0], bounds: [physicsRuleFor('wind') ?? null] },
  gravity: { fields: ['value'], identity: [0], bounds: [physicsRuleFor('gravity') ?? null] },
  mix: { fields: ['value'], identity: [1], bounds: [physicsRuleFor('mix') ?? null] },
  reset: { fields: [], identity: [] },
};

/**
 * Path constraint timelines (`animations.<a>.path.<constraint>.<timeline>`).
 *
 * ⭐ Same shape as the physics group — a constraint name, a timeline name under
 * it — which is why they share `compileValueTrack` and a `MotionTrack` rather
 * than getting the `ik`/`transform` treatment: those two are ONE unnamed
 * timeline per constraint and needed a key type of their own, and these are not.
 *
 * `mix` is the exception inside the group: one timeline, three values in a key,
 * three curve channels, in the order the parser reads them (`:1027-1029`). ⚠️ Its
 * `mixY` defaults to the same key's `mixX` in the file, so rigc writes all three
 * out — `compileValueTrack` never omits a field, which is what keeps "the author
 * wrote mixY" and "mixY happened to equal mixX" from emitting the same file.
 */
const PATH_TRACKS: Record<string, ValueTrackShape> = {
  position: { fields: ['value'], identity: [0] },
  spacing: { fields: ['value'], identity: [0] },
  mix: { fields: ['mixRotate', 'mixX', 'mixY'], identity: [1, 1, 1] },
};

/**
 * Slider timelines (`animations.<a>.slider.<constraint>.<timeline>`).
 *
 * ⚠️ `time`'s per-key default is **1**, not 0 (`:1121` passes `defaultValue` 1
 * to `readTimeline1` for both timelines). Nothing here depends on that, because
 * `compileValueTrack` writes every field explicitly — it is recorded because it
 * is the one timeline in the format whose default is neither its own identity nor
 * a copy of a neighbour, and a reader checking rigc against the parser will trip
 * over it.
 */
const SLIDER_TRACKS: Record<string, ValueTrackShape> = {
  time: { fields: ['value'], identity: [1] },
  mix: { fields: ['value'], identity: [1] },
};

/**
 * Slot timelines (`animations.<a>.slots.<slot>.<timeline>`): the two
 * `compileTrack` writes, and which key shape each one is written with.
 *
 * ⭐ **The table IS the dispatch.** `compileTrack` reads the shape out of here
 * to pick its branch, and the refusal for a property that is not in it prints
 * `Object.keys` of the same object — so the list an author is given cannot
 * disagree with the list the emitter has, because there is only one.
 *
 * 🚨 It exists because the dispatch used to be one `if` on `attachment` and a
 * fall-through to rgba, which made **every** other property name a legal
 * spelling of an rgba timeline: `{"slot": "x", "property": "sequence", "v": [0,
 * 0, 0, 0]}` compiled and wrote `slots.x.sequence` with rgba-shaped keys. The
 * gate caught the file (`A00_ROUNDTRIP_PARSE: threw: Invalid timeline type for
 * a slot`, and `A05_CURVE_ARRAY_LENGTH`) and the one-channel spelling of the
 * same mistake was refused at compile as *"rgba value needs 4 channels, got
 * 1"* — a message about a key nobody wrote. It is the shape `A21`'s
 * `meshKinds[slot] || 'ring'` had (issue #44): a default that turns "nothing to
 * emit" into an emission of the wrong thing (issue #650).
 *
 * ⚠️ The KEY is the timeline name as the file carries it, and the VALUE names
 * the branch below that writes its keys — so an entry added here without a
 * branch to write it is an entry emitted in some other timeline's shape, which
 * is the defect this table closed rather than a new affordance. The format has
 * three more (`rgb`, `alpha`, `rgb2`) and rigc emits none of them.
 *
 * 🎨 `rgba2` joined in issue #690, and what it adds is the half of the two-colour
 * tint that moves: a slot's `dark` has been an emitted setup field all along
 * (`RigSlot.dark`, step 4 below), with no way to key it. 🚫 Both halves are still
 * refused by `A12_NO_DARK_COLOR`, and that is not a contradiction — A12 is filed
 * `renderer` in `ASSERTION_KIND`, so it states what ONE renderer ignores rather
 * than what is wrong. The `spine` profile `build` runs reports it `PROF` and
 * never applies it; `--profile spine-html` is where it fires. Emitting a
 * construct one consumer drops is exactly what a profile is for.
 */
export const SLOT_TRACKS: Record<string, 'attachment' | 'rgba' | 'rgba2'> = {
  attachment: 'attachment',
  rgba: 'rgba',
  rgba2: 'rgba2',
};

/**
 * The three constraint families a `MotionTrack` can target, and the table of
 * timelines each one accepts.
 *
 * 🚨 The key here is the field a track names its target with, NOT the property.
 * All three families have a timeline called `mix`, so dispatching on `property`
 * — which is what this file did while `physics` was the only such family — would
 * send a path constraint's mix keys into the physics group, where the parser
 * would look for a physics constraint of that name and throw.
 */
const CONSTRAINT_TRACK_FAMILIES = {
  physics: { tracks: PHYSICS_TRACKS, label: 'physics constraint' },
  path: { tracks: PATH_TRACKS, label: 'path constraint' },
  slider: { tracks: SLIDER_TRACKS, label: 'slider' },
} as const;

type ConstraintTrackFamily = keyof typeof CONSTRAINT_TRACK_FAMILIES;

const CONSTRAINT_TRACK_TARGETS = Object.keys(CONSTRAINT_TRACK_FAMILIES) as ConstraintTrackFamily[];

/**
 * Which family a track belongs to, from the target it names — or null for the
 * slot and bone tracks that name none.
 *
 * The `group` form is physics-only and stays that way: a group of physics
 * constraints is how the ring's four grips are tuned in one track, and no path
 * constraint or slider in this format is ever authored in bulk. A `group` track
 * whose property is one of theirs is refused below rather than silently read as
 * a slot track.
 */
function constraintFamilyOf(track: MotionTrack): ConstraintTrackFamily | null {
  for (const family of CONSTRAINT_TRACK_TARGETS) {
    if (track[family] !== undefined) return family;
  }
  if (track.group !== undefined && track.property in PHYSICS_TRACKS) return 'physics';
  return null;
}

/**
 * One numeric channel of a constraint timeline: the JSON field, the value the
 * parser uses when a key omits it, and — for `mixY` alone — the field it takes
 * that default FROM.
 *
 * Channel order is load-bearing twice over. `readCurve` indexes a curve array by
 * channel (`curve[value << 2]`), so the order here is the order four-number
 * groups concatenate in; and the parser reads the fields in this order, so
 * emitting them in it keeps the file readable against an editor export.
 */
interface ConstraintChannel {
  field: string;
  dflt: number;
  /** `mixY` defaults to the SAME key's `mixX`, not to 1 (`:988`). */
  inheritsFrom?: string;
}

/** A stepped-by-nature boolean on a constraint key. Never a curve channel. */
interface ConstraintFlag {
  field: string;
  dflt: boolean;
}

interface ConstraintTimelineShape {
  channels: ConstraintChannel[];
  flags: ConstraintFlag[];
  /** Per-field bounds, where the runtime documents one. */
  range: Record<string, [number, number]>;
}

/**
 * The two constraint groups that are ONE unnamed timeline per constraint
 * (`animations.<a>.ik.<name>`, `animations.<a>.transform.<name>`).
 *
 * ⚠️ Every field is optional in the file and every one has a per-key default, so
 * omitting a field on one key of a track does not carry the previous key's value
 * forward — it snaps to the default. `compileConstraintTrack` refuses a track
 * whose keys disagree about which fields they name, because that is the shape
 * that loads clean and plays something nobody wrote.
 *
 * The bounds: `IkConstraintPose.mix` is documented as a percentage 0-1 and
 * `softness` as a distance, while every transform mix is documented **unbounded**
 * — so only the IK pair carries a range, and refusing a transform mix above 1
 * would refuse correct data (an over-mix is a real editor idiom).
 */
const CONSTRAINT_TIMELINES: Record<'ik' | 'transform', ConstraintTimelineShape> = {
  ik: {
    channels: [
      { field: 'mix', dflt: 1 },
      { field: 'softness', dflt: 0 },
    ],
    flags: [
      { field: 'bendPositive', dflt: true },
      { field: 'compress', dflt: false },
      { field: 'stretch', dflt: false },
    ],
    range: { mix: [0, 1], softness: [0, Infinity] },
  },
  transform: {
    channels: [
      { field: 'mixRotate', dflt: 1 },
      { field: 'mixX', dflt: 1 },
      { field: 'mixY', dflt: 1, inheritsFrom: 'mixX' },
      { field: 'mixScaleX', dflt: 1 },
      { field: 'mixScaleY', dflt: 1 },
      { field: 'mixShearY', dflt: 1 },
    ],
    flags: [],
    range: {},
  },
};

/** Physics constraint fields and their parser defaults (SkeletonJson.js:295-319). */
const PHYSICS_COMPONENTS = ['x', 'y', 'rotate', 'scaleX', 'shearX'] as const;
const PHYSICS_PARAMS: Array<[string, number]> = [
  ['inertia', 0.5],
  ['strength', 100],
  ['damping', 0.85],
  ['mass', 1],
  ['wind', 0],
  ['gravity', 0],
  ['mix', 1],
  ['fps', 60],
  ['limit', 5000],
];

// ---------------------------------------------------------------------------
// curves
// ---------------------------------------------------------------------------

/**
 * Graph-view handles -> ABSOLUTE (time, value) control points.
 *
 * `Animation.setBezier` samples the cubic in the (time, value) plane, so the
 * normalised handles an editor shows are NOT what the JSON holds. Writing the
 * handles straight into the file loads without error and produces a different
 * curve.
 *
 * Four numbers PER VALUE CHANNEL, concatenated in channel order. A short array
 * multiplies `undefined` and yields a NaN curve, silently (case 6g).
 */
export function bezierForChannel(
  handles: EasingHandles,
  t1: number,
  t2: number,
  v1: number,
  v2: number,
): [number, number, number, number] {
  const [hx1, hy1, hx2, hy2] = handles;
  return [
    r6(t1 + (t2 - t1) * hx1),
    r6(v1 + (v2 - v1) * hy1),
    r6(t1 + (t2 - t1) * hx2),
    r6(v1 + (v2 - v1) * hy2),
  ];
}

/**
 * True when a key's value channels, AS EMITTED, equal the next key's — a hold.
 *
 * The comparison is on the six-decimal values the file will hold (`r6`), not on
 * the authored numbers: two values that round to the same figure are one value
 * in the file, and the file is what the runtime interpolates and what the editor
 * compares. A multi-channel key holds only when EVERY channel does — a `translate`
 * whose x moves and whose y does not is a moving key.
 */
function isHold(from: number[], to: number[]): boolean {
  return from.length === to.length && from.every((v, c) => r6(v) === r6(to[c]));
}

/**
 * The curve a NAMED easing emits between a key and the next: the bezier its
 * handles describe, or `stepped` when the segment is a hold.
 *
 * A curve over a flat segment draws nothing — the cubic runs from a value to the
 * same value — so the two encodings are one animation, and the editor writes the
 * second: its export rewrites a bezier on a hold as `"curve": "stepped"` (issue
 * #369; 14 keys on the nod example alone, every rendered frame byte-identical
 * either way). Emitting what the editor writes keeps `diff`'s
 * `animations.curve_kinds` from reporting a difference where the animation has
 * none — the same "one meaning, one file" rule under which an authored
 * `offset: 0` on a deform key and an absent one emit the same bytes.
 *
 * ⚠️ Only a NAMED easing takes this path; `rawCurve` does not. A raw `curve` is
 * the escape hatch that states the file's own numbers verbatim, and the editor's
 * own exports DO carry beziers over holds (18 keys across the reference corpus —
 * spineboy-pro, sack-pro, squash-and-stretch), so a transcription has to be able
 * to write one back. Rewriting those would make rigc unable to state what the
 * format holds, which is the blocker `rawCurve` exists to remove. An easing names
 * a SHAPE, and on a hold the editor's encoding of that shape is `stepped`.
 *
 * `hold` is a parameter because "as emitted" is not always `r6` of a number: an
 * rgba key emits a hex string and a deform key emits a run, and each site says
 * what its file value is.
 */
function easingCurve(
  handles: EasingHandles,
  t1: number,
  t2: number,
  from: number[],
  to: number[],
  hold: boolean = isHold(from, to),
): number[] | 'stepped' {
  if (hold) return 'stepped';
  const curve: number[] = [];
  for (let c = 0; c < from.length; c++) curve.push(...bezierForChannel(handles, t1, t2, from[c], to[c]));
  return curve;
}

// ---------------------------------------------------------------------------
// inputs
// ---------------------------------------------------------------------------

function readJson<T>(path: string): T {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    throw new CompileError(`cannot read ${path}: ${(err as Error).message}`);
  }
  try {
    // A parse failure gets a line/column appended to the runtime's own
    // message — see `parseJsonWithPosition` for why `JSON.parse` alone
    // cannot say where.
    return parseJsonWithPosition(text) as T;
  } catch (err) {
    throw new CompileError(`cannot read ${path}: ${(err as Error).message}`);
  }
}

function partWindow(part: FaceManifestPart, manifest: FaceManifest): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const [x, y] = part.offset;
  const size = part.size ?? [manifest.crop.w, manifest.crop.h];
  return { x, y, w: size[0], h: size[1] };
}

/**
 * The base plate is the part whose window IS the crop, and that is a structural
 * fact rather than a naming convention.
 *
 * It matters twice. A full-frame mesh is a full-frame canvas that can never
 * dirty-skip, so the base must never be
 * a mesh — and the validator recognises the same shape from the other side, which
 * is why assertion A14 already covers this without a new check. And a full-frame
 * region is the one page allowed to be opaque (A19).
 */
function isBasePlate(part: FaceManifestPart, manifest: FaceManifest): boolean {
  const win = partWindow(part, manifest);
  return win.x === 0 && win.y === 0 && win.w === manifest.crop.w && win.h === manifest.crop.h;
}

/** The rig slot a manifest part joins on. See the `parts` mapping below. */
function rigSlotOf(part: FaceManifestPart): string {
  return part.rig_slot ?? part.slot;
}

/** The control bones a mesh part drives, in declaration order. */
function meshControlBones(part: FaceManifestPart): string[] {
  const spec = part.mesh;
  if (!spec) return [];
  const kind = spec.kind ?? 'ring';
  if (kind === 'ribbon') return spec.chain ?? [];
  if (spec.control_bones?.length) return spec.control_bones;
  return spec.control_bone ? [spec.control_bone] : [];
}

// ---------------------------------------------------------------------------
// compile
// ---------------------------------------------------------------------------

export interface CompileOptions {
  /** The rig spec. Required: it is the skeleton's structure. */
  rigPath: string;
  motionPath: string;
  /** Directory the atlas + skeleton will be written to (page names are relative to it). */
  outDir: string;
  /** The cut manifest. Absent for a skeleton with no measured art behind it. */
  manifestPath?: string;
  /** Overrides the rig spec's own `images` directory (CLI `--images <dir>`). */
  imagesDir?: string;
  /**
   * A pre-packed atlas to resolve `image` entries against, instead of loose PNGs
   * (CLI `--atlas-in <file>`). Every region a part names is looked up in this
   * file and its geometry read from it; the emitted atlas is this one, re-anchored
   * to `outDir`. See `resolveFromAtlas`.
   */
  atlasInPath?: string;
  /**
   * `build --copy-images` is copying every page PNG into `outDir` (`src/emit.ts`),
   * so the header's `images` path names `outDir` itself — the parts will sit
   * beside the skeleton file, wherever the rig's own images directory is. The copy
   * itself stays in `cli.ts`; this only tells `skeletonImagesPath` where the parts
   * will be.
   */
  copyImages?: boolean;
}

/**
 * `skeleton.images` — where the editor's import looks for the part images, as a
 * path from the skeleton file (issue #370).
 *
 * The editor reads a build with this field absent, shows every attachment
 * missing, and prints `Images path not found` on the way out, because nothing
 * told it where the parts are — and under `--copy-images` they are RIGHT BESIDE
 * `skeleton.json`, one PNG per part, named as the attachments are. So the field
 * states a fact about the build's own layout, the same fact the atlas's page
 * names already state, and it is derived the same way they are (`relative` from
 * `outDir`, POSIX separators — so two checkouts of one tree emit one file and
 * A18 holds). In precedence order:
 *
 *   1. `--copy-images` → the output directory itself, spelled from the skeleton's
 *      own point of view as `../<its basename>/`. The flag moved the pages next to
 *      the skeleton, and a declared path would be a claim about a layout the flag
 *      replaced — exactly as the flag rewrites the atlas's page names.
 *   2. A declared `skeleton.images` → verbatim. R1: a field the author wrote is
 *      emitted as written.
 *   3. Otherwise the relative path from `outDir` to the ONE directory the spec
 *      names every part PNG in — the rig's images directory, or the manifest's
 *      plates. `partDirs` is that set: read from the spec's own paths, so a
 *      `--atlas-in` build names the same directory its loose twin does (the pack
 *      changed the pixel source, not the rig) and the two skeletons stay
 *      byte-identical. Parts spread over more than one directory have no single
 *      path that is true of all of them, and a rig with no parts has nothing to
 *      point at: neither writes the field. An absence is a fact; a guess is not.
 *
 * ⚠️ Why `../build/` and never `./` for "this very directory": the editor was
 * measured (Spine 4.3.23, CLI import then export, issue #370). It resolves
 * `images` against the skeleton file's directory and re-anchors it to the project
 * on export — `./images` and `../parts/` both come back as a path to the same
 * directory with every part found — but it collapses `./` and `.` to no path at
 * all, after which the parts are found only if the project happens to be saved
 * beside the skeleton. Naming the directory says the same thing in the one
 * spelling the editor keeps.
 *
 * A trailing `/` throughout, as the format page's own example (`"./images/"`)
 * spells it, so `../build/` and `../parts/` read alike.
 */
function skeletonImagesPath(
  declared: string | undefined,
  opts: CompileOptions,
  outDir: string,
  partDirs: Set<string>,
): string | undefined {
  // `outDir` named from inside itself. The filesystem root has no basename to
  // name it by; `./` is the only spelling left there, and nobody builds into `/`.
  const self = basename(outDir) === '' ? './' : `../${basename(outDir)}/`;
  if (opts.copyImages) return self;
  if (declared !== undefined) return declared;
  if (partDirs.size !== 1) return undefined;
  const [partsDir] = partDirs;
  const spelled = relativeImagesPath(outDir, partsDir);
  // `./` is the one spelling the editor collapses to nothing (see above), so
  // "the parts are in this very directory" is said the way the editor keeps.
  // That substitution is the ONLY thing this path does that a rig spec's own
  // `images` does not, which is why the rest of the spelling is one function.
  return spelled === './' ? self : spelled;
}

/**
 * An images directory spelled as a path from the directory of the file that
 * names it — the one convention this repository has for saying where the parts
 * are, in one function rather than in each of its callers (issue #595).
 *
 * Three rules, and each is load-bearing: POSIX separators, so two checkouts of
 * one tree emit one file and `A18` holds; a trailing `/`, as the format page's
 * own example (`"./images/"`) spells it; and `./` on a descendant, so the value
 * reads as a relative path rather than as a bare name.
 *
 * ⚠️ `./` for "the very directory the file is in" is returned rather than
 * decided here, because who reads the field differs. `skeletonImagesPath`
 * replaces it — the editor was measured collapsing a literal `./` to no path at
 * all (issue #370) — while a rig spec's own `images` is read by rigc, which
 * resolves `./` against the spec's own directory and finds the parts.
 *
 * Both callers pass two ABSOLUTE directories, and `relative` reads neither of
 * them off disk — which is what lets `cli.ts` spell a rig spec's `images` for
 * `ingest` here, rather than `src/ingest.ts` growing a notion of an output
 * directory it otherwise has none of.
 */
export function relativeImagesPath(from: string, to: string): string {
  const rel = relative(from, to).split('\\').join('/');
  if (rel === '') return './';
  return rel.startsWith('..') ? `${rel}/` : `./${rel}/`;
}

/**
 * One part = one page. No packer in this shape, so no PMA trap, no rotation, no
 * strip offsets. Region covers the page exactly => u2=v2=1.
 *
 * ⭐ The BODY of the emit moved to [`src/atlas.ts`](atlas.ts) in issue #4, and
 * that is the whole point of the move: `--pack` writes a different arrangement
 * through the same `writeAtlasText`, so "the defaults change nothing" is a
 * property of one function rather than a promise made by two that look alike.
 * The two text-shape traps A07 checks (a region name is the RAW line; a blank
 * line closes a page block) live there now.
 *
 * Exported (rather than inlined into `compile`) so `--copy-images` can call it a
 * second time with `page` rewritten to the copies' filenames, after the copy
 * itself has happened — see [`src/emit.ts`](emit.ts). Everything else about an
 * image (`region`, `width`, `height`) is unchanged by that rewrite; only where the
 * bytes live moved.
 */
export function buildAtlasText(images: CompiledImage[]): string {
  return writeAtlasText(
    images.map((img) => ({
      name: img.page,
      width: img.width,
      height: img.height,
      regions: [
        {
          name: img.region,
          x: 0,
          y: 0,
          width: img.width,
          height: img.height,
          offsetX: 0,
          offsetY: 0,
          originalWidth: img.width,
          originalHeight: img.height,
        },
      ],
    })),
  );
}

// ---------------------------------------------------------------------------
// where a part's pixels come from: a loose PNG, or a region of a packed atlas
// ---------------------------------------------------------------------------

/** One part resolved out of a loose PNG on disk — the default, and unchanged. */
function fromLoosePng(
  relPath: string,
  absPath: string,
  region: string,
  isBase: boolean,
  outDir: string,
): CompiledImage {
  if (!existsSync(absPath)) {
    // Left to `readFileSync` this arrives as a raw ENOENT with a stack, which
    // is the tool telling an agent about its own internals instead of about
    // the rig. The validator's messages are the UI, and so are these.
    throw new CompileError(`image "${relPath}" is not on disk at ${absPath}`);
  }
  const info = readPngInfo(absPath);
  // Page name is the PNG path *relative to the atlas file*, so the viewer
  // resolves it the way every Spine consumer does: against the atlas URL.
  // The PNGs are not copied: they pass through untouched, and the atlas points
  // at wherever they already live.
  const page = relative(outDir, absPath).split('\\').join('/');
  return { region, page, absPath, width: info.width, height: info.height, hasAlpha: info.hasAlpha, isBase };
}

/** A pre-packed atlas plus where it was read from, so messages can name it. */
interface AtlasSource {
  path: string;
  dir: string;
  parsed: ParsedAtlas;
  /** Trimmed region name -> the region, first occurrence wins (as `findRegion` does). */
  byName: Map<string, { region: AtlasRegion; page: ParsedAtlas['pages'][number] }>;
}

function readAtlasIn(path: string): AtlasSource {
  if (!existsSync(path)) throw new CompileError(`--atlas-in names ${path}, which is not on disk`);
  const parsed = parseAtlasText(readFileSync(path, 'utf8'));
  const byName = new Map<string, { region: AtlasRegion; page: ParsedAtlas['pages'][number] }>();
  for (const page of parsed.pages) {
    for (const region of page.regions) {
      const key = region.name.trim();
      // `TextureAtlas.findRegion` returns the FIRST match, so a sequence's later
      // indices are not separately addressable by name. Mirrored rather than
      // improved on: the runtime is what will resolve these at load time.
      if (!byName.has(key)) byName.set(key, { region, page });
    }
  }
  if (byName.size === 0) throw new CompileError(`--atlas-in ${path} declares no regions`);
  return { path, dir: dirname(path), parsed, byName };
}

/**
 * One part resolved out of a region of a pre-packed atlas — CLI `--atlas-in`.
 *
 * ## What comes from where
 *
 * The join key is the region NAME, which rigc already equates with the PNG
 * basename everywhere else (`addImage`), so a rig spec written against loose
 * parts resolves against a pack of the same parts with no edit. The geometry —
 * `x`/`y`/`width`/`height`/`offsets`/`rotate` — is the atlas's, read rather than
 * invented, and `width`/`height` on the resulting image are the region's
 * `originalWidth`/`originalHeight` **divided by the page's `scale:`**: the
 * UNTRIMMED drawing at its own size, which is what an attachment's width and
 * height mean and therefore what every downstream measurement in this file
 * already expects.
 *
 * ## 🚨 Why the `scale:` divide is not a refinement (issue #267)
 *
 * A region's `originalWidth/Height` are in the PAGE's texels, and a page that
 * declares `scale: 0.5` holds texels half the size of the drawings it was packed
 * from — the field says so in as many words, and `atlasScales`
 * ([`src/render.ts`](render.ts)) already reported it. An attachment's `width` is
 * in world units, and `SkeletonJson` reads it straight out of the JSON
 * (`region.width = map.width * scale`) with the atlas nowhere in the expression,
 * so nothing downstream of rigc will ever undo a scale rigc failed to apply.
 * Taking the texel count as the world size therefore produced a valid skeleton
 * drawn at half size, green, with nothing in the report saying so — and NINE of
 * the ten atlases in the example corpus declare a `scale:`, because an editor
 * pack is routinely coarser than its art.
 *
 * ⚠️ **The divide recovers the drawing to within the pack's own quantisation, not
 * exactly.** The packer wrote `round(drawing x scale)`, so a region 373 texels
 * wide at `scale: 0.5` is consistent with a 745- and a 746-pixel drawing and the
 * pack does not say which. `originalWidth / scale` is the midpoint of that
 * interval — the unbiased estimate — and it is off by at most `0.5 / scale`
 * source pixels (one pixel at `scale: 0.5`). That residual is information the
 * pack destroyed; the only way to be exact is to be handed the loose art, which
 * is the default route. What the divide removes is the factor-of-two error.
 *
 * ## Three refusals, and why none of them can be a warning
 *
 *   * a name the atlas does not carry — the attachment would resolve to no
 *     region, `AtlasAttachmentLoader` returns null and the part silently does
 *     not draw. Refused with the near misses, because the commonest cause is one
 *     character;
 *   * a page the atlas names and the disk does not have — the same silence, one
 *     step further along;
 *   * a rectangle that runs off its page — `region.x + width > page.width` makes
 *     `u2 > 1`, which samples whatever the wrap mode does and is never what the
 *     pack meant. A16-style validity, caught at the point the number is read.
 */
function resolveFromAtlas(
  relPath: string,
  region: string,
  isBase: boolean,
  outDir: string,
  atlas: AtlasSource,
): CompiledImage {
  const found = atlas.byName.get(region);
  if (!found) {
    const near = nearMisses(region, atlas.byName.keys());
    const known = [...atlas.byName.keys()].sort();
    throw new CompileError(
      `image "${relPath}" resolves to region "${region}", which the atlas at ${atlas.path} does not have. ` +
        (near.length ? `Did you mean ${near.map((n) => JSON.stringify(n)).join(', ')}? ` : '') +
        `The atlas declares ${known.length} region(s): ${known.join(', ')}`,
    );
  }
  const absPath = resolve(atlas.dir, found.page.name);
  if (!existsSync(absPath)) {
    throw new CompileError(
      `region "${region}" sits on page "${found.page.name}" of ${atlas.path}, which is not on disk at ${absPath}`,
    );
  }
  // The rectangle ON THE PAGE, which at a quarter turn is not the one `bounds:`
  // states — `pageFootprint` owns that derivation for every reader of it.
  const { width: rectW, height: rectH } = pageFootprint(found.region);
  if (
    found.region.x < 0 ||
    found.region.y < 0 ||
    found.region.x + rectW > found.page.width ||
    found.region.y + rectH > found.page.height
  ) {
    throw new CompileError(
      `region "${region}" is at ${found.region.x},${found.region.y} sized ${rectW}x${rectH} on a ` +
        `${found.page.width}x${found.page.height} page in ${atlas.path}; the rectangle runs off the page, so its ` +
        'UVs would leave the texture',
    );
  }
  const info = readPngInfo(absPath);
  const page = relative(outDir, absPath).split('\\').join('/');
  const scale = found.page.scale;
  return {
    region,
    page,
    absPath,
    // `r6` for the same reason every other emitted number takes it: 55 / 0.4 is
    // 137.49999999999997 in binary floating point, and a size is a number the
    // artifact states rather than one it accumulates.
    width: r6(found.region.originalWidth / scale),
    height: r6(found.region.originalHeight / scale),
    hasAlpha: info.hasAlpha,
    isBase,
    atlas: found.region,
    ...(scale === 1 ? {} : { atlasScale: scale }),
  };
}

/**
 * A part's own pixel grid, wherever its bytes live.
 *
 * The only reader of pixels in the compiler is the contour generator, which
 * traces a part's alpha — and a part imported from a pack has no file of its
 * own, only a rectangle of somebody's page. `extractRegion` lifts the drawing
 * back out, so the generator sees the same grid either way and its output does
 * not depend on how the art was delivered.
 *
 * ⭐ *Either way* was not true for a pack that turns a region until issue #570:
 * `extractRegion` refused a `rotate: 90`, so how the art was delivered decided
 * whether a measurement could be taken at all — on a foreign pack, where turning
 * is the norm rather than the exception. It now transcribes the runtime's own
 * mapping for all four rotations, which is what makes the sentence above a
 * description rather than an aspiration.
 */
function partPlate(img: CompiledImage): Plate {
  const page = readPlate(img.absPath);
  return img.atlas === undefined ? page : extractRegion(page, img.atlas);
}

/**
 * A part's alpha channel on its own grid — where the drawing is, and where it
 * is not.
 *
 * Two readers want exactly this and they used to be one inline loop and one
 * absence: the contour generator traces it, and `sampleMeshDepth` counts the
 * vertices whose depth came from outside it (issue #449). One function so the
 * two cannot come to mean different things by "the part draws here".
 */
function plateAlpha(plate: Plate): Uint8Array {
  const alpha = new Uint8Array(plate.width * plate.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = plate.data[i * 4 + 3];
  return alpha;
}

/**
 * What a dropped state says was consulted and came up empty.
 *
 * ⭐ One renderer, because two printers and a refusal all say this same fact and
 * they used to be three separate expressions. The `--atlas-in` half is the
 * reason it matters: a build that resolved parts against a pack opened no PNG,
 * so "no PNG at parts/x.png" would be a false statement about it and would send
 * the reader to a directory instead of to the pack that is short a region.
 */
export function droppedStateReason(dropped: DroppedState): string {
  return dropped.why ?? `no PNG at ${dropped.path}`;
}

/**
 * Compile a rig spec and a motion spec into Spine 4.3 skeleton data.
 *
 * The body is `compileInto`; this wrapper exists for one reason, and it is the
 * whole of issue #671's second half: the states a manifest listed and the art
 * was missing for are reported from the compile RESULT, which a throw never
 * returns. So the run whose refusal was CAUSED by a missing file was the one
 * run that never named the file. Annotating whatever was thrown — rather than
 * re-wrapping it, which would cost a `NotImplementedError` its class — carries
 * those facts out of every refusal raised after the drop was recorded, not only
 * out of the one that consults them.
 */
export function compile(opts: CompileOptions): CompileResult {
  const droppedStates: DroppedState[] = [];
  try {
    return compileInto(opts, droppedStates);
  } catch (err) {
    if (err instanceof CompileError && droppedStates.length > 0) err.droppedStates = [...droppedStates];
    throw err;
  }
}

function compileInto(opts: CompileOptions, droppedStates: DroppedState[]): CompileResult {
  const rigPath = resolve(opts.rigPath);
  const motionPath = resolve(opts.motionPath);
  const outDir = resolve(opts.outDir);
  const manifestPath = opts.manifestPath === undefined ? null : resolve(opts.manifestPath);
  const manifestDir = manifestPath === null ? null : dirname(manifestPath);

  const rig = parseRigSpec(readJson<unknown>(rigPath), rigPath);
  // Parsed, not cast, since issue #307 — `src/motion.ts` states what it proves
  // and which refusals it deliberately leaves in this file.
  const motion = parseMotionSpec(readJson<unknown>(motionPath), motionPath);
  const manifest = manifestPath === null ? null : readJson<FaceManifest>(manifestPath);

  // The rig spec names its own path in every message `parseRigSpec` throws (its
  // `where` argument, above). The motion spec gets no such treatment below —
  // every "animation … bone … property" refusal is built from data alone — so a
  // reader with two input files and one error has no way to tell which one is at
  // fault. This wraps the motion-only regions (the version/archetype check right
  // below, the physics table and the animation loop further down) and prefixes
  // the motion path onto any `CompileError` that escapes them, unless the
  // message already names it.
  const withMotionSource = <T>(fn: () => T): T => {
    try {
      return fn();
    } catch (err) {
      if (err instanceof CompileError && !err.message.includes(motionPath)) {
        throw new CompileError(`${motionPath}: ${err.message}`);
      }
      throw err;
    }
  };

  withMotionSource(() => {
    // The version tag is `parseMotionSpec`'s, and so is every shape under it.
    // What is left in this block is the one question the motion file cannot
    // answer on its own.
    // The motion spec was authored against one formation. Pairing it with another
    // rig would aim its keys at bones whose names happen to match and whose meaning
    // does not — the class of wrongness that loads, plays and lies.
    if (motion.archetype !== rig.name) {
      throw new CompileError(
        `motion spec names archetype "${motion.archetype}" but the rig spec at ${rigPath} is called "${rig.name}"`,
      );
    }
  });

  // The stage. The rig may state it outright (a foreign skeleton has no crop);
  // otherwise the manifest's crop is it. With neither there is nothing to
  // measure a full-frame mesh against, so the compile stops rather than guess.
  //
  // ⭐ The third state is the rig saying there is no stage at all — `width` and
  // `height` stated `null` (issue #578). That is a claim rather than a silence,
  // so it beats the manifest's crop the way a stated number already does, and
  // the header below emits none of the four fields. Omitting them is still the
  // refusal underneath: a transcriber who has no stage to copy can now say so,
  // and one who simply has not looked still cannot.
  const noStage = declaresNoStage(rig.skeleton);
  const stageWidth = noStage ? undefined : (rig.skeleton?.width ?? manifest?.crop.w);
  const stageHeight = noStage ? undefined : (rig.skeleton?.height ?? manifest?.crop.h);
  if (!noStage && (stageWidth === undefined || stageHeight === undefined)) {
    throw new CompileError(
      'no stage size: give the rig spec a `skeleton.width`/`skeleton.height`, or compile against a cut manifest whose `crop` states them, ' +
        'or state `"width": null, "height": null` for a skeleton that declares no stage',
    );
  }
  /**
   * Crop height, for the y-down -> y-up flip. Only manifest data uses it, and
   * `cropPointOf` refuses every bone that asks for manifest data when there is
   * no manifest — so the two states that can be read here both have one, or a
   * stage.
   *
   * ⚠️ `NaN` for the third, unreachable state (no manifest and a rig that
   * declares no stage) rather than 0. A plausible number is the failure this
   * compiler exists to refuse; if the guard above it ever moved, a NaN
   * coordinate is a named failure and an origin-flipped bone is not.
   */
  const cropH = manifest?.crop.h ?? stageHeight ?? Number.NaN;
  const imagesDir = opts.imagesDir !== undefined ? resolve(opts.imagesDir) : resolve(dirname(rigPath), rig.images ?? '.');

  // -- 1. gather images ------------------------------------------------------
  // Region name = attachment name = PNG basename.
  const images: CompiledImage[] = [];
  // `droppedStates` is the caller's array rather than a local one, so a refusal
  // raised further down still leaves the drops somewhere `compile` can read.
  const seenRegions = new Set<string>();
  /**
   * Region name -> the absolute path of the file whose pixels that region holds.
   *
   * ⭐ A region is named by its PNG's **basename**, so two files in two
   * directories can want one name, and the loser draws the winner's art with
   * nothing said (issue #555). `seenRegions` answers "is this name taken"; this
   * answers "by what", which is the half a refusal has to name — and it is the
   * same record that lets one PNG legitimately serve two skins.
   */
  const regionSource = new Map<string, string>();
  /**
   * Every directory the spec names a part PNG in — `skeletonImagesPath` reads it.
   * Recorded from the spec's own path whether or not the pixels came from there:
   * `--atlas-in` changes the pixel source, not where the rig says its parts are,
   * and the skeleton has to stay byte-identical between the two (PK11).
   */
  const partDirs = new Set<string>();

  /** The pre-packed atlas `--atlas-in` named, parsed once, or null. */
  const atlasIn = opts.atlasInPath === undefined ? null : readAtlasIn(resolve(opts.atlasInPath));

  const addImage = (relPath: string, baseDir: string, isBase: boolean): CompiledImage => {
    const region = basename(relPath, '.png');
    if (seenRegions.has(region)) {
      throw new CompileError(`duplicate region name "${region}" (${relPath})`);
    }
    const loosePath = resolve(baseDir, relPath);
    const img =
      atlasIn === null
        ? fromLoosePng(relPath, loosePath, region, isBase, outDir)
        : resolveFromAtlas(relPath, region, isBase, outDir, atlasIn);
    seenRegions.add(region);
    regionSource.set(region, loosePath);
    partDirs.add(dirname(loosePath));
    images.push(img);
    return img;
  };

  /**
   * Measure and atlas the art ONE skin attachment names — once per file, not
   * once per placeholder (issue #555).
   *
   * 🚨 The defect this replaces. The gather loop below deduplicated the slot's
   * attachment NAMES, and the call to `addImage` stood behind that `continue`,
   * so a placeholder two skins fill reached the atlas with the FIRST skin's art
   * and every later skin's PNG was never opened. Measured on a two-skin rig
   * before the repair: without stated sizes the compile refused with *a region
   * needs width and height — give them, or give an "image" and rigc will measure
   * the PNG*, which is the message telling the author to give the image they
   * gave; with sizes stated it built and `A00_ROUNDTRIP_PARSE` refused the
   * skeleton with *Region not found in atlas: patch_b*. Neither names the cause,
   * and both are the doctrine's own second bullet inverted — a miss refused
   * under somebody else's name.
   *
   * ⚠️ Two skins may legitimately share one PNG, which is why this is not simply
   * `addImage` unguarded: `addImage` refuses any repeat of a region name, and a
   * placeholder both skins point at the SAME file is one region on purpose. The
   * distinction is the FILE, so that is what is compared — and two different
   * files whose basenames collide are refused here by name rather than aliased,
   * because the loser silently draws the winner's pixels at the winner's size
   * and the whole gate stays green (measured: 15 assertions passed on exactly
   * that rig).
   */
  const addSkinImage = (relPath: string, where: string): void => {
    const region = basename(relPath, '.png');
    const already = regionSource.get(region);
    if (already === undefined) {
      addImage(relPath, imagesDir, false);
      return;
    }
    const wanted = resolve(imagesDir, relPath);
    if (already === wanted) return; // one file, two attachments: one region, deliberately
    throw new CompileError(
      `${where}: "${relPath}" and the art already atlased as region "${region}" are two different files — ` +
        `${wanted} and ${already}. An atlas region is named by its PNG's basename, so only one of the two can ` +
        'hold that name and this attachment would draw the other file\'s pixels. Rename one of the PNGs.',
    );
  };

  // A manifest may name a part the cut does not carry. A formation can declare
  // more slots than any one cut fills, and a cut that shares a sprite with the
  // scene around it has no plate of its own to point at — the manifest then
  // records the part as `image: null` with no window at all. That entry is a
  // documented ABSENCE, not a part — and it used to crash the compiler on its
  // missing `offset` rather than being tolerated, so "the optional slots are
  // optional" needed this line to actually be true.
  const absentParts: CompileResult['absentParts'] = [];
  const declaredParts = (manifest?.parts ?? []).filter((part) => {
    if (part.image === null && !part.states) {
      absentParts.push({ slot: rigSlotOf(part), why: 'manifest declares `image: null` and no states' });
      return false;
    }
    return true;
  });
  // ⚠️ `rig_slot` is the join key, not `slot`. A cut manifest that doubles as the
  // art pipeline's record carries slot names of its own and that pipeline's
  // scripts select on them; the rig's slot table is what the runtime, the tooling
  // and the viewer join on. So the mapping is manifest data, and the rig's table
  // stays single-valued — one name per slot, which is the only way A26 and a
  // "hide this slot" probe can mean the same thing on every cut.
  const parts = declaredParts
    .map((part) => (part.rig_slot && part.rig_slot !== part.slot ? { ...part, slot: part.rig_slot } : part))
    .sort((a, b) => a.draw_order - b.draw_order);

  const rigSlotIndex = new Map(rig.slots.map((slot, i) => [slot.name, i]));
  for (const part of parts) {
    if (!rigSlotIndex.has(part.slot)) {
      throw new CompileError(
        `the manifest binds a part to slot "${part.slot}" (via rig_slot), which the rig "${rig.name}" does not declare — add the slot to the rig rather than inventing one here`,
      );
    }
  }
  // 🔑 Two files now state a draw order — the manifest's `draw_order` numbers and
  // the rig's slot array — and two sources for one fact is how they come to
  // disagree. The rig's array wins (it IS the emitted order, which is Spine's own
  // semantics), and a manifest that orders its parts differently is refused here
  // rather than silently overruled.
  let orderCursor = -1;
  for (const part of parts) {
    const at = rigSlotIndex.get(part.slot)!;
    if (at < orderCursor) {
      throw new CompileError(
        `the manifest draws "${part.slot}" (draw_order ${part.draw_order}) out of the rig's slot order; the rig's slots array IS the draw order`,
      );
    }
    orderCursor = at;
  }

  /** slot -> [attachment names], in the order the manifest lists the states. */
  const slotAttachments = new Map<string, string[]>();

  // Mesh parts, checked against the rig's budget before any geometry runs.
  const meshBudget = rig.invariants?.meshSlots ?? 0;
  const meshParts = parts.filter((part) => part.mesh);
  if (meshParts.length > meshBudget) {
    throw new CompileError(
      `${meshParts.length} mesh slot(s) declared but the rig "${rig.name}" allows ${meshBudget}` +
        ' — raise `invariants.meshSlots` in the rig spec if that budget is the thing being changed',
    );
  }
  for (const part of meshParts) {
    if (isBasePlate(part, manifest!)) {
      // A base plate mesh is a full-frame canvas every frame.
      throw new CompileError(`slot "${part.slot}" is the base plate; it must never be a mesh`);
    }
    const spec = part.mesh!;
    const kind = spec.kind ?? 'ring';
    if (kind === 'ring') {
      if (!part.polygon?.length) {
        throw new CompileError(`slot "${part.slot}" declares a ring mesh but has no polygon to use as its rim`);
      }
      if (spec.hull !== 'polygon') {
        throw new CompileError(`slot "${part.slot}": mesh.hull must be "polygon", got ${JSON.stringify(spec.hull)}`);
      }
      if (!spec.center || spec.inner === undefined) {
        throw new CompileError(`slot "${part.slot}": a ring mesh needs mesh.center and mesh.inner`);
      }
    } else {
      if (!spec.rows || !spec.chain?.length) {
        throw new CompileError(`slot "${part.slot}": a ribbon mesh needs mesh.rows and a mesh.chain`);
      }
    }
    if (!meshControlBones(part).length) {
      throw new CompileError(`slot "${part.slot}": a mesh with no control bone deforms nothing`);
    }
  }

  /**
   * How to name the thing whose size disagreed with the spec.
   *
   * ⭐ The message has to say which of the two it MEASURED, because the remedy is
   * different: a loose PNG is re-exported, an atlas region is repacked or the
   * spec is wrong about which region it wanted. Reading "torso.png is 40x80 but
   * the window is 40x81" while no torso.png was ever opened is the sort of
   * message that sends an author to the wrong file.
   */
  const measuredFrom = (img: CompiledImage, relPath: string): string =>
    img.atlas === undefined
      ? relPath
      : `region "${img.region}" of ${opts.atlasInPath!} (declared ${img.atlas.originalWidth}x${img.atlas.originalHeight} ` +
        `by its offsets${img.atlasScale === undefined ? '' : `, at scale: ${img.atlasScale}`})`;

  for (const part of parts) {
    const win = partWindow(part, manifest!);
    if (part.image) {
      // One unconditional attachment: the base plate, and every joint part.
      const img = addImage(part.image, manifestDir!, isBasePlate(part, manifest!));
      if (img.width !== win.w || img.height !== win.h) {
        throw new CompileError(
          `${measuredFrom(img, part.image)} is ${img.width}x${img.height} but the manifest window for "${part.slot}" is ${win.w}x${win.h}`,
        );
      }
      slotAttachments.set(part.slot, [img.region]);
      continue;
    }
    const names: string[] = [];
    for (const [state, relPath] of Object.entries(part.states ?? {})) {
      if (relPath === null) continue; // base pixels show through; nothing to emit
      // A manifest can outlive a state whose art was dropped. It still lists
      // it, so the compiler reports the gap rather than pretending either way —
      // and under `--atlas-in` the same question is asked of the atlas, because
      // there the pack IS where the art either is or is not. An OPTIONAL state
      // absent from the pack is that same documented gap; the unconditional
      // `part.image` above is the one that refuses by name (`resolveFromAtlas`).
      const absPath = resolve(manifestDir!, relPath);
      const present = atlasIn === null ? existsSync(absPath) : atlasIn.byName.has(basename(relPath, '.png'));
      if (!present) {
        droppedStates.push({
          slot: part.slot,
          state,
          path: relPath,
          // The DROP line has to name what was CONSULTED. "no PNG at
          // parts/iris_open.png" is a lie about an `--atlas-in` build, which
          // opened no such file, and it sends the reader to a directory instead
          // of to the pack that is missing the region.
          ...(atlasIn === null
            ? {}
            : { why: `no region "${basename(relPath, '.png')}" in ${atlasIn.path}` }),
        });
        continue;
      }
      const img = addImage(relPath, manifestDir!, false);
      if (img.width !== win.w || img.height !== win.h) {
        throw new CompileError(
          `${measuredFrom(img, relPath)} is ${img.width}x${img.height} but slot "${part.slot}" declares ${win.w}x${win.h}`,
        );
      }
      names.push(img.region);
    }
    slotAttachments.set(part.slot, names);
  }

  // Attachments the RIG declares. A cut with a manifest leaves `skins` empty and
  // gets its attachments from the parts above; a foreign skeleton has no manifest
  // and states them here. A slot filled from both is a compile error, because the
  // two would then be two records of one thing.
  const skinNames = Object.keys(rig.skins ?? {});
  // The two spellings of a skin entry, normalised once — every reader below takes
  // its attachments and its member lists from here rather than re-deciding which
  // form the spec used.
  const skinParts = new Map(
    skinNames.map((skinName) => [skinName, splitRigSkin(rig.skins![skinName], `rig skin "${skinName}"`)] as const),
  );
  const rigAttachmentNames = new Map<string, string[]>();
  for (const skinName of skinNames) {
    for (const [slotName, placeholders] of Object.entries(skinParts.get(skinName)!.attachments)) {
      if (!rigSlotIndex.has(slotName)) {
        throw new CompileError(`rig skin "${skinName}" gives attachments to slot "${slotName}", which the rig does not declare`);
      }
      if (slotAttachments.has(slotName)) {
        throw new CompileError(
          `slot "${slotName}" is filled by a manifest part AND by rig skin "${skinName}"; one slot, one source of attachments`,
        );
      }
      const names = rigAttachmentNames.get(slotName) ?? [];
      for (const [placeholder, att] of Object.entries(placeholders)) {
        // Two concerns, two conditions. The list is the slot's PLACEHOLDER list
        // and a placeholder several skins fill belongs in it once; the art is
        // per ATTACHMENT, and there are as many of those as there are skins
        // filling it. Standing behind one `continue`, the second was the first's
        // arithmetic (issue #555).
        if (!names.includes(placeholder)) names.push(placeholder);
        const image = (att as RigRegionAttachment).image;
        if (typeof image === 'string') {
          addSkinImage(image, `skin "${skinName}" slot "${slotName}" attachment "${placeholder}"`);
        }
      }
      rigAttachmentNames.set(slotName, names);
    }
  }
  // Which (slot, placeholder) pairs more than one skin fills — the pairs whose
  // entries have to carry an attachment `name` of their own. Computed here, off
  // the normalised skin table, so the slot loop below reads a decision rather
  // than re-deriving one per attachment.
  const contested = contestedPlaceholders(skinNames, skinParts);

  // -- 2. atlas --------------------------------------------------------------
  //
  // Two shapes. The default builds one page per part out of what was measured.
  // `--atlas-in` emits the imported atlas itself, verbatim except for its page
  // NAMES, which are paths and have to be re-anchored to `outDir`. Re-serialising
  // it from the parse would silently drop every field this compiler has no reader
  // for — `scale:` most expensively — so the text passes through by line and only
  // the name lines are replaced (`rewritePageNames`).
  //
  // ⚠️ Regions the rig does not use stay in the emitted atlas. They are not a
  // defect: a real pack is shared between cuts, an unused region costs a consumer
  // nothing, and dropping them would make `--out` disagree with the pack it was
  // built from — which is the one thing an importer must not do.
  const atlasText =
    atlasIn === null
      ? buildAtlasText(images)
      : rewritePageNames(atlasIn.parsed, (name) =>
          relative(outDir, resolve(atlasIn.dir, name)).split('\\').join('/'),
        );

  // -- 3. bones --------------------------------------------------------------
  //
  // One path for every rig, because the two the archetype tables used to have
  // (an explicit tree placed by manifest anchors, and one bone per slot at the
  // part window's centre) are the same operation over a different crop point.
  // What the rig spec chooses is WHERE the point comes from; the flip into Spine
  // world and the inverse into the parent's local space are the same either way.
  if (manifest) checkAxisSelfConsistency(manifest);
  const axisSpineDeg = manifest?.axis ? screenToSpineDegrees(manifest.axis.deg) : null;
  const partBySlot = new Map(parts.map((part) => [part.slot, part]));

  const bones: SpineBone[] = [];
  for (const spec of rig.bones) {
    bones.push(buildBone(spec, bones, { rig, manifest, cropH, axisSpineDeg, partBySlot }));
  }
  const boneNames = new Set(bones.map((b) => b.name));
  let transforms: Map<string, BoneTransform>;
  try {
    transforms = computeWorldTransforms(bones);
  } catch (err) {
    if (err instanceof TransformError) throw new CompileError(err.message);
    throw err;
  }

  for (const part of parts) {
    for (const name of meshControlBones(part)) {
      if (!boneNames.has(name)) {
        throw new CompileError(
          `slot "${part.slot}" drives control bone "${name}", which the rig "${rig.name}" does not declare`,
        );
      }
    }
  }

  // -- 4. slots + skins ------------------------------------------------------
  // Draw order IS the slots array order. No separate field,
  // and the rig's array is that order.
  const slots: SpineSlot[] = [];
  const skinTables = new Map<string, Record<string, Record<string, SpineAttachment>>>();
  const tableFor = (skinName: string): Record<string, Record<string, SpineAttachment>> => {
    let table = skinTables.get(skinName);
    if (!table) {
      table = {};
      skinTables.set(skinName, table);
    }
    return table;
  };
  /** Linked meshes to resolve once every skin exists — see `resolveLinkedMeshes`. */
  const pendingLinks: PendingLink[] = [];
  tableFor('default'); // rigc always emits a default skin, even when it is empty
  // ...and every skin the rig declares, for the same reason: a skin can now carry
  // `bones`/constraint lists with no attachments at all, and a skin that only
  // switches bones on would otherwise never reach the emitted array.
  for (const skinName of skinNames) tableFor(skinName);
  const meshBones = new Set<string>();
  const meshes: CompileResult['meshes'] = [];
  // `skin/slot/attachment` -> per-vertex z, for the attachments that named a
  // depth map. Read at deform-key time; never emitted. See `AttachmentContext`.
  const attachmentDepths = new Map<string, number[]>();

  for (const rigSlot of rig.slots) {
    const part = partBySlot.get(rigSlot.name);
    const names = slotAttachments.get(rigSlot.name) ?? rigAttachmentNames.get(rigSlot.name) ?? [];
    // 🔑 A slot nothing fills is EMITTED, empty — it is not dropped (issue #575).
    // A `continue` stood here instead, and what it bought was the format's own
    // silence: the emitted array came back a slot short with no line saying
    // which, and every slot after it moved down one. That index is what a
    // `drawOrder` key's offsets are counted against and what an index-keyed
    // consumer splits on, so the drop is not a smaller file, it is a different
    // rig. Two production exports declaring 53 and 61 slots built green at 51
    // and 57 and read 0.962 / 0.934 against the file they were transcribed from.
    //
    // The shape emitted here is the editor's own: `SkeletonJson`'s slot reader
    // takes `attachment` with a `null` default, so a slot with no `attachment`
    // key is a slot that shows nothing — 34 of the 52 slots in the official
    // `spineboy-pro` export omit the key.
    const empty = names.length === 0;

    const setup = motion.setup?.[rigSlot.name];
    // ⚠️ The entry's SHAPE is `parseMotionSpec`'s now (issue #307), and it had to
    // move: this loop used to `continue` past a slot with no attachments before
    // reaching here, so the #293 shapes — `"lid_l": null` and, far worse,
    // `"lid_l": "plate"`, which reads `.attachment` off a string as `undefined`
    // and hides the slot in silence — stayed GREEN for exactly the slots a
    // reader is most likely to be halfway through wiring up. Everything from
    // here down is the half that needs the rig in front of it.
    if (setup !== undefined && rigSlot.attachment !== undefined) {
      throw new CompileError(
        `slot "${rigSlot.name}" has a setup attachment in the rig spec AND in the motion spec; the setup pose has one author`,
      );
    }
    let setupAttachment: string | null;
    if (setup !== undefined) setupAttachment = setup.attachment ?? null;
    else if (rigSlot.attachment !== undefined) setupAttachment = rigSlot.attachment;
    // Nothing fills the slot, so there is nothing to choose between and nothing
    // to guess: the setup pose of an empty slot is "show nothing", which is the
    // one value the format can express for it. The refusal below stays exactly
    // where it was for a slot that HAS attachments and states no setup pose.
    else if (empty) setupAttachment = null;
    else {
      throw new CompileError(
        `no setup pose for slot "${rigSlot.name}": give the motion spec a \`setup\` entry or the rig slot an \`attachment\` — the compiler will not guess one`,
      );
    }
    if (setupAttachment !== null && !names.includes(setupAttachment)) {
      // 🚨 The slot can be empty for two different reasons and the sentence
      // below used to state only one of them (issue #671). "no skin and no
      // manifest part fills it" is FALSE when a manifest part does fill it and
      // its art was not found: every art-bearing state of that part was
      // dropped, which is why `names` came back empty, and the drop record is
      // the only place the path lives. An author handed the old sentence
      // applied its remedy — setup pose `null` — and shipped a rig with the
      // part missing, green, because the compiler had described the wrong
      // object. `empty` with no drops keeps that sentence: there the claim is
      // true.
      const dropped = droppedStates.filter((d) => d.slot === rigSlot.name);
      let message: string;
      if (!empty) {
        message = `setup attachment "${setupAttachment}" for slot "${rigSlot.name}" is not one of [${names.join(', ')}]`;
      } else if (dropped.length === 0) {
        message =
          `the setup pose shows attachment "${setupAttachment}" on slot "${rigSlot.name}", which no skin and no ` +
          'manifest part fills — the slot is emitted empty, so there is no such attachment to show. Give the ' +
          'slot an attachment, or state the setup pose as null';
      } else {
        // Every state listed here has no art AND the slot is empty, which is
        // not a coincidence: a state whose art WAS found puts a region in
        // `names`, so a slot reaching this branch has had all of them dropped.
        // That is what lets the sentence quantify rather than hedge.
        const many = dropped.length > 1;
        const found = dropped.map((d) => `"${d.state}" (${droppedStateReason(d)})`).join(', ');
        // ⚠️ The remedy is read off the DELIVERY, not off the shape of the
        // message: an `--atlas-in` build opened no file, so "restore the file"
        // would be advice about a directory nobody consulted — the same wrong
        // subject one step further on. It is `atlasIn` that decides, because
        // `atlasIn` is also what decided the `why` above.
        const supply =
          atlasIn === null
            ? many
              ? 'restore the files'
              : 'restore the file'
            : many
              ? 'add the regions to the pack'
              : 'add the region to the pack';
        message =
          `the setup pose shows attachment "${setupAttachment}" on slot "${rigSlot.name}", and the slot is emitted ` +
          `empty because ${many ? `all ${dropped.length} manifest states that fill it have` : 'the one manifest state that fills it has'} ` +
          `no art: ${found} — ${supply}, ${many ? 'fix the paths' : 'fix the path'} in the manifest, or state the ` +
          'setup pose as null';
      }
      throw new CompileError(message);
    }
    if (setup?.color && rigSlot.color !== undefined) {
      throw new CompileError(`slot "${rigSlot.name}" has a setup colour in the rig spec AND in the motion spec`);
    }
    const slot: SpineSlot = { name: rigSlot.name, bone: rigSlot.bone };
    if (setupAttachment !== null) slot.attachment = setupAttachment;
    if (setup?.color) slot.color = rgbaHex(setup.color);
    else if (rigSlot.color !== undefined) slot.color = rigSlot.color;
    if (rigSlot.dark !== undefined) slot.dark = rigSlot.dark;
    if (rigSlot.blend !== undefined) slot.blend = rigSlot.blend;
    slots.push(slot);
    // ...and nothing below this line has anything to build. An empty entry in a
    // skin's attachment table would be rigc writing a key the editor does not,
    // so the skins array is left exactly as it was before #575 for every slot
    // that IS filled, and gains nothing for one that is not.
    if (empty) continue;

    if (part) {
      const perSlot: Record<string, SpineAttachment> = {};
      const mesh = part.mesh ? buildMesh(part, manifest!, bones, transforms, rigSlot.bone) : null;
      for (const name of names) {
        const img = images.find((im) => im.region === name);
        if (!img) throw new CompileError(`internal: no image for attachment ${name}`);
        if (mesh) {
          // Every state of a mesh slot gets the SAME geometry. That is what makes
          // an attachment swap mid-deform safe: the control bone's pose means the
          // same thing under all of them, so the swap and the deform do not fight.
          perSlot[name] = { ...mesh.attachment };
          continue;
        }
        perSlot[name] = placeRegion(part, manifest!, transforms.get(rigSlot.bone)!, img);
      }
      if (mesh) {
        const controls = meshControlBones(part);
        meshBones.add(rigSlot.bone);
        for (const name of controls) meshBones.add(name);
        meshes.push({
          slot: rigSlot.name,
          kind: mesh.kind,
          attachments: names,
          vertices: mesh.attachment.uvs.length / 2,
          triangles: mesh.attachment.triangles.length / 3,
          bones: [rigSlot.bone, ...controls],
        });
      }
      tableFor('default')[rigSlot.name] = perSlot;
      continue;
    }

    for (const skinName of skinNames) {
      const placeholders = skinParts.get(skinName)!.attachments[rigSlot.name];
      if (!placeholders) continue;
      const perSlot: Record<string, SpineAttachment> = {};
      const shared = contested.get(rigSlot.name);
      for (const [placeholder, att] of Object.entries(placeholders)) {
        const where = `skin "${skinName}" slot "${rigSlot.name}" attachment "${placeholder}"`;
        const built = buildRigAttachment(att, placeholder, where, {
          images,
          bones,
          transforms,
          meshBones,
          meshes,
          slotName: rigSlot.name,
          anchorBone: rigSlot.bone,
          skinName,
          imagesDir,
          depths: attachmentDepths,
          slotNames: new Set(rig.slots.map((s) => s.name)),
          links: pendingLinks,
        });
        // The name is put on AFTER the builder rather than inside it: five
        // builders write five shapes, the rule is one rule, and a rule that has
        // to be remembered in five places is a rule that will be kept in four.
        // `null` is an entry that carries no `name` field, which is every
        // uncontested placeholder. A contested one the DEFAULT skin fills never
        // reaches here: it is refused above (issue #567), because the editor
        // holds no such shape in either spelling.
        const composed = composeSkinAttachmentName(skinName, placeholder, shared?.has(placeholder) === true);
        perSlot[placeholder] = composed === null ? built : nameSkinAttachment(built, composed, placeholder);
      }
      tableFor(skinName)[rigSlot.name] = perSlot;
    }
  }
  // Every skin is built, so every `source` can now be looked up — and until this
  // line a linked mesh is the one construct in a rig spec whose name has not been
  // resolved yet.
  resolveLinkedMeshes(pendingLinks, skinTables);
  // 📐 The implicit budget of 0 is a statement about rigc's own GENERATORS:
  // geometry rigc built is geometry rigc will not ship unmeasured, and
  // `A13_MESH_BUDGET` has nothing to measure a generated mesh against until the
  // rig states a budget out loud. It is not a statement about geometry somebody
  // else drew — `RigInvariants.meshTriangles` says the same thing in words:
  // a number baked in here would be one project's frame time masquerading as a
  // property of the format. So authored meshes count against a budget the rig
  // states out loud, and against nothing when it states none: rigc did not draw
  // them, so leaving them unmeasured is the author's call (issue #44's rule).
  // #277's coverage report splits the same way and lands on the other side of it:
  // both kinds are MEASURED, and only rigc's own output gets a wall.
  //
  // ⚠️ The message has to name the field, because the three doc places a reader
  // checks all read as "you do not need this" and one of them is §3.4's own
  // worked example (issue #274).
  const budgeted = rig.invariants?.meshSlots === undefined ? meshes.filter((m) => m.kind !== 'authored') : meshes;
  if (budgeted.length > meshBudget) {
    throw new CompileError(
      `${budgeted.length} mesh slot(s) emitted but the rig "${rig.name}" allows ${meshBudget}` +
        (rig.invariants?.meshSlots === undefined
          ? ' — a mesh rigc GENERATED counts against `invariants.meshSlots`, and this rig declares none, which is a ' +
            'budget of 0. Add `"invariants": { "meshSlots": ' +
            `${budgeted.length}, "meshTriangles": <triangles one mesh may carry> }\` to the rig spec: geometry rigc ` +
            'built is geometry it will not ship unmeasured, and `A13_MESH_BUDGET` has nothing to measure against ' +
            'until that budget is stated. (Authored geometry is exempt — rigc did not draw it.)'
          : ' — raise `invariants.meshSlots` in the rig spec if that budget is the thing being changed'),
    );
  }

  // -- 4b. constraints -------------------------------------------------------
  // One top-level `constraints` array, `type` per entry. Rig-declared first
  // (structure), then the motion spec's physics table (tuning). A name in both is
  // refused: `mix` timelines resolve by name, and two constraints answering to
  // one name is a timeline driving something nobody chose.
  const constraints: SpineConstraint[] = [];
  const physicsReport: CompileResult['physics'] = [];
  // Deform keys that stated a model instead of a run (issue #294). Declared here
  // rather than inside the animation loop because `explain` reports it across
  // every animation, and appended in emit order so the report reads in the order
  // the file does.
  const deformTransforms: CompileResult['deformTransforms'] = [];
  /** Group-track keys whose per-member values were stated or derived (issue #295). */
  const trackDerivations: CompileResult['trackDerivations'] = [];
  // `ik` and `transform` timelines resolve their target by name AND by type —
  // `findConstraint(name, IkConstraintData)` returns null for a transform
  // constraint of the same name and the parser then throws. So the table this
  // compiler resolves against is keyed by BOTH (issue #692): a name alone is not
  // a constraint in this format, and a rig may declare `leg` once per kind.
  /** `<kind> constraint "<name>"` -> declared. The key is the format's namespace. */
  const constraintDeclared = new Set<string>();
  /** name -> the kinds that declare it, for the refusal that has to say which. */
  const constraintKinds = new Map<string, string[]>();
  /** kind -> the names it declares, for the "the rig declares: …" half of one. */
  const constraintNamesOfKind = new Map<string, string[]>();
  const declareConstraint = (name: string, type: string): void => {
    constraintDeclared.add(constraintAt(type, name));
    constraintKinds.set(name, [...(constraintKinds.get(name) ?? []), type]);
    constraintNamesOfKind.set(type, [...(constraintNamesOfKind.get(type) ?? []), name]);
  };
  /**
   * ik constraint -> the booleans it declares that the timeline format would
   * otherwise take away from it. Issue #273.
   *
   * 🚨 `SkeletonJson` reads `bendPositive`, `compress` and `stretch` in TWO
   * places with the same defaults: once on the constraint (`:155`) and once on
   * **every timeline key** (`:912`). A key that omits one does not inherit the
   * constraint's value — it asserts the parser's default. So a rig that declares
   * `bendPositive: false` and an `ik` timeline that keys only `mix` produce a
   * constraint that bends the other way for the whole animation, with the field
   * still in the file and inert: four builds differing only in these flags posed
   * one pose. What goes in this map is only the values that DIFFER from the
   * per-key default, because a rig that says nothing and a key that says nothing
   * already agree and there is nothing to carry.
   */
  const ikRigFlags = new Map<string, Record<string, boolean>>();
  // Which slots can actually show a path, for the path constraint's own check.
  // Read off the emitted skin tables rather than the spec, so it answers the
  // question the runtime asks: is there an attachment of that type on that slot?
  const pathSlots = new Map<string, string[]>();
  for (const [skinName, table] of skinTables) {
    for (const [slotName, perSlot] of Object.entries(table)) {
      for (const att of Object.values(perSlot)) {
        if ((att as { type?: string }).type !== 'path') continue;
        pathSlots.set(slotName, [...(pathSlots.get(slotName) ?? []), skinName]);
        break;
      }
    }
  }
  const constraintCtx: ConstraintContext = {
    boneNames,
    slotNames: new Set(rig.slots.map((s) => s.name)),
    pathSlots,
    animationNames: new Set(Object.keys(motion.animations ?? {})),
    animationDurations: new Map(Object.entries(motion.animations ?? {}).map(([name, anim]) => [name, anim.duration])),
  };
  // Read as the raw records they are on disk: `buildRigConstraint` checks every
  // field itself, because a spec that came off a file has whatever the author
  // wrote in it and the union above is a claim about a correct one.
  for (const spec of (rig.constraints ?? []) as unknown as RigConstraintInput[]) {
    constraints.push(buildRigConstraint(spec, constraintCtx));
    declareConstraint(spec.name, spec.type);
    if (spec.type === 'ik') {
      const carried: Record<string, boolean> = {};
      for (const flag of CONSTRAINT_TIMELINES.ik.flags) {
        const declared = spec[flag.field];
        if (typeof declared === 'boolean' && declared !== flag.dflt) carried[flag.field] = declared;
      }
      if (Object.keys(carried).length) ikRigFlags.set(spec.name, carried);
    }
  }
  withMotionSource(() => {
    for (const [name, spec] of Object.entries(motion.physics ?? {})) {
      // Per kind, like everything else about a constraint name: a rig-declared
      // `ik` and a tuned `physics` constraint of one name are two objects, and
      // two PHYSICS constraints of one name are the pair no timeline can tell
      // apart.
      if (constraintDeclared.has(constraintAt('physics', name))) {
        throw new CompileError(
          `physics constraint "${name}" is declared in both the rig spec and the motion spec's physics table`,
        );
      }
      declareConstraint(name, 'physics');
      if (!boneNames.has(spec.bone)) {
        throw new CompileError(`physics constraint "${name}" targets unknown bone "${spec.bone}"`);
      }
      const entry: SpineConstraint = {
        name,
        type: 'physics',
        bone: spec.bone,
      };
      const components: string[] = [];
      for (const comp of PHYSICS_COMPONENTS) {
        const v = spec[comp];
        if (v === undefined || v === 0) continue;
        entry[comp] = r6(v);
        components.push(comp);
      }
      if (!components.length) {
        // The parser is happy with this and the constraint does nothing at all.
        // A23 catches it too; refusing here means it never reaches the gate.
        throw new CompileError(
          `physics constraint "${name}" drives no component — set at least one of ${PHYSICS_COMPONENTS.join('/')}`,
        );
      }
      for (const [param, dflt] of PHYSICS_PARAMS) {
        const v = spec[param as keyof typeof spec] as number | undefined;
        if (v === undefined || v === dflt) continue;
        entry[param] = r6(v);
      }
      constraints.push(entry);
      physicsReport.push({
        name,
        bone: spec.bone,
        components,
        mix: spec.mix ?? 1,
        drivesMesh: meshBones.has(spec.bone),
      });
    }
  });

  // -- 5. animations ---------------------------------------------------------
  //
  // 🔑 What an attachment key is allowed to name, per slot: the UNION of every
  // emitted skin's placeholders for it. An attachment timeline is not keyed on a
  // skin — the format gives it a slot and a name, and `Skeleton.getAttachment`
  // resolves that name through the skin the skeleton is WEARING and then through
  // `defaultSkin` (spine-core 4.3.13 `Skeleton.js:335-346`). So the set a key can
  // legally draw from is every skin's, and which of them is showing is the
  // consumer's to decide by dressing the skeleton.
  //
  // ⚠️ A name some skins hold and others do not is therefore ACCEPTED, and that
  // is the format's own semantics rather than a gap in the check: under a skin
  // that lacks it the slot shows nothing, which is the same thing a `null` key
  // says and a thing a rig may well mean.
  //
  // Derived from `skinTables` rather than re-read off the rig spec, because what
  // a key can resolve to at runtime is what was EMITTED — a manifest state whose
  // art was dropped is in the spec and in no skin, and a key naming it has to
  // stay refused (issue #695).
  const attachmentsBySlot = new Map<string, Set<string>>();
  for (const table of skinTables.values()) {
    for (const [slotName, perSlot] of Object.entries(table)) {
      let known = attachmentsBySlot.get(slotName);
      if (!known) attachmentsBySlot.set(slotName, (known = new Set<string>()));
      for (const placeholder of Object.keys(perSlot)) known.add(placeholder);
    }
  }
  // `default` first, then the rig's own order — `skinTables`' insertion order,
  // which is the order the tables were made in (`:1990` and `:1994`). It is what
  // the refusal below reports as the skins it looked in, so it is read from the
  // map rather than restated.
  const attachmentIndex: SlotAttachmentIndex = { bySlot: attachmentsBySlot, searched: [...skinTables.keys()] };
  const animations: SpineSkeletonJson['animations'] = {};
  const declaredDurations: Record<string, number> = {};
  const slotNames = new Set(slots.map((s) => s.name));
  // Which slots an `rgba2` timeline may be keyed on: the ones the EMITTED file
  // gives a `dark`, for the same reason `attachmentIndex` is built off the
  // emitted skins — what the runtime does with a timeline depends on the file,
  // not on the spec that produced it. A slot whose `dark` never reached the
  // artifact is a slot the runtime allocates no dark colour for (issue #690).
  const darkSlots = new Set(slots.filter((s) => s.dark !== undefined).map((s) => s.name));

  withMotionSource(() => {
    checkMotionGroups(motion);
    for (const [animName, anim] of Object.entries(motion.animations)) {
      declaredDurations[animName] = anim.duration;
      const slotTimelines: Record<string, Record<string, SpineTimelineKey[]>> = {};
      const boneTimelines: Record<string, Record<string, SpineTimelineKey[]>> = {};
      /** One table per constraint family, keyed the way the file is. */
      const familyTimelines: Record<ConstraintTrackFamily, Record<string, Record<string, SpineTimelineKey[]>>> = {
        physics: {},
        path: {},
        slider: {},
      };
      const claimed = new Set<string>();
      let compiledDuration = 0;

      for (const track of anim.tracks) {
        const family = constraintFamilyOf(track);
        const isBoneTrack = family === null && track.property in BONE_TRACKS;
        const targets = resolveTargets(track, motion, animName);
        // Per-member values are one statement about every member, so they are
        // resolved for the whole track before any target is compiled — and the
        // resolved keys are what everything below sees, which is why `v` means
        // one thing from here down (`MotionValueTrack`).
        const perMember = resolveMemberTrack(track, animName, targets, bones, trackDerivations);
        targets.forEach((target, index) => {
          const resolved = perMember.get(target)!;
          if (family !== null) {
            const label = CONSTRAINT_TRACK_FAMILIES[family].label;
            // Resolved by name AND by type in the parser
            // (`findConstraint(name, PathConstraintData)`), which returns null on
            // a type mismatch and makes `readAnimation` throw in the consumer's
            // process. Named here instead, where the motion file can be named too
            // — and looked up the same way, so a rig that declares `leg` under two
            // kinds sends each track to its own constraint.
            if (!constraintDeclared.has(constraintAt(family, target))) {
              const kinds = constraintKinds.get(target) ?? [];
              if (kinds.length > 0) {
                throw new CompileError(
                  `animation "${animName}" keys "${target}" as a ${label}, but the rig declares it as a "${kinds.join('"/"')}" ` +
                    'constraint — a timeline group resolves its target by name AND type, misses, and the loader throws',
                );
              }
              const known = constraintNamesOfKind.get(family) ?? [];
              throw new CompileError(
                `animation "${animName}" keys unknown ${label} "${target}"` +
                  (known.length ? ` (the rig declares: ${known.join(', ')})` : `, and the rig declares no ${family} constraint at all`),
              );
            }
          } else if (isBoneTrack) {
            if (!boneNames.has(target)) {
              throw new CompileError(`animation "${animName}" keys unknown bone "${target}"`);
            }
          } else if (!slotNames.has(target)) {
            throw new CompileError(`animation "${animName}" targets unknown slot "${target}"`);
          }
          // A timeline is a kind, a name and a property — `physics.leg.mix` and
          // `path.leg.mix` are two timelines on two constraints, so the claim
          // carries the family the target was resolved in (issue #692). The
          // sentence still names the pair the author wrote.
          const claim = `${family ?? (isBoneTrack ? 'bone' : 'slot')} ${target}.${track.property}`;
          if (claimed.has(claim)) {
            throw new CompileError(
              `animation "${animName}" has two tracks on ${target}.${track.property}; merge them into one track`,
            );
          }
          claimed.add(claim);

          const shift = (track.lag ?? 0) + (track.stagger ?? 0) * index;
          const keys =
            family !== null
              ? compileValueTrack(
                  resolved,
                  motion,
                  animName,
                  anim.duration,
                  target,
                  shift,
                  CONSTRAINT_TRACK_FAMILIES[family].tracks,
                  CONSTRAINT_TRACK_FAMILIES[family].label,
                )
              : isBoneTrack
                ? compileValueTrack(resolved, motion, animName, anim.duration, target, shift, BONE_TRACKS, 'bone')
                : compileTrack(resolved, motion, animName, anim.duration, target, shift, attachmentIndex, darkSlots);
          for (const key of keys) compiledDuration = Math.max(compiledDuration, key.time as number);
          if (family !== null) (familyTimelines[family][target] ??= {})[track.property] = keys;
          else if (isBoneTrack) (boneTimelines[target] ??= {})[track.property] = keys;
          else (slotTimelines[target] ??= {})[track.property] = keys;
        });
      }

      // -- constraint timelines: one unnamed timeline per constraint ---------
      //
      // `ik` and `transform` sit beside `tracks` rather than in it because their
      // keys carry named fields instead of one `v` — see `MotionAnimation.ik`.
      // The target is resolved by name AND by type: `findConstraint(name,
      // IkConstraintData)` misses a transform constraint of the same name and the
      // parser throws in the consumer's process, so the mismatch is named here.
      const constraintTimelines: Record<'ik' | 'transform', Record<string, SpineTimelineKey[]>> = {
        ik: {},
        transform: {},
      };
      for (const group of ['ik', 'transform'] as const) {
        // The array, the entries and their `constraint` names are shapes, so
        // they are `parseMotionSpec`'s; what is left here needs the rig's
        // constraint table.
        const tracks: Array<MotionIkTrack | MotionTransformTrack> = anim[group] ?? [];
        for (const track of tracks) {
          const name = track.constraint;
          if (!constraintDeclared.has(constraintAt(group, name))) {
            const kinds = constraintKinds.get(name) ?? [];
            if (kinds.length > 0) {
              throw new CompileError(
                `animation "${animName}" keys "${name}" as ${group === 'ik' ? 'an' : 'a'} ${group} constraint, but the rig declares it as a ` +
                  `"${kinds.join('"/"')}" constraint — the parser looks a timeline's target up by name AND type, misses, and throws`,
              );
            }
            const known = constraintNamesOfKind.get(group) ?? [];
            throw new CompileError(
              `animation "${animName}" keys unknown ${group} constraint "${name}"; ` +
                (known.length
                  ? `the rig declares ${group} constraint(s): ${known.join(', ')}`
                  : `the rig declares no ${group} constraint at all`),
            );
          }
          if (constraintTimelines[group][name]) {
            throw new CompileError(
              `animation "${animName}" has two ${group} timelines on constraint "${name}"; ` +
                'the group holds one timeline per constraint, so merge them into one',
            );
          }
          const keys = compileConstraintTrack(
            group,
            track,
            motion,
            animName,
            anim.duration,
            // The ik table, asked only by the ik group: `leg` may also be a
            // transform constraint, and a transform key set carries no flag for
            // the rig's booleans to be stamped onto (issue #692).
            group === 'ik' ? (ikRigFlags.get(name) ?? {}) : {},
          );
          for (const key of keys) compiledDuration = Math.max(compiledDuration, key.time as number);
          constraintTimelines[group][name] = keys;
        }
      }

      // -- deform timelines: keyed on a skin/slot/attachment triple ----------
      // Four deep, because the format is: skin -> slot -> attachment -> timeline
      // name -> keys. `deform` is one of two timeline names an attachment can
      // carry (the other is `sequence`), which is why the level exists at all.
      const deformTimelines: Record<string, Record<string, Record<string, Record<string, SpineTimelineKey[]>>>> = {};
      const deformTracks: MotionDeformTrack[] = anim.deform ?? [];
      for (const track of deformTracks) {
        const skinName = track.skin ?? 'default';
        const at = `animation "${animName}" deform ${skinName}/${String(track.slot)}/${String(track.attachment)}`;
        const table = skinTables.get(skinName);
        if (!table) {
          throw new CompileError(
            `${at}: this rig emits no skin called "${skinName}" (it emits: ${[...skinTables.keys()].join(', ')})`,
          );
        }
        const perSlot = table[track.slot];
        if (!perSlot) {
          throw new CompileError(
            `${at}: skin "${skinName}" gives slot "${String(track.slot)}" no attachments` +
              (slotNames.has(track.slot) ? '' : ', and this rig does not declare that slot at all'),
          );
        }
        const attachment = perSlot[track.attachment];
        if (!attachment) {
          throw new CompileError(
            `${at}: slot "${track.slot}" in skin "${skinName}" has no attachment "${String(track.attachment)}" ` +
              `(it has: ${Object.keys(perSlot).join(', ')})`,
          );
        }
        if (deformTimelines[skinName]?.[track.slot]?.[track.attachment]) {
          throw new CompileError(`${at}: two deform timelines on one attachment; merge them into one`);
        }
        const keys = compileDeformTrack(
          track,
          motion,
          animName,
          anim.duration,
          {
            ...deformGeometryOf(attachment, at, bones, transforms),
            depth: attachmentDepths.get(`${skinName}/${track.slot}/${track.attachment}`) ?? null,
          },
          deformTransforms,
        );
        for (const key of keys) compiledDuration = Math.max(compiledDuration, key.time as number);
        ((deformTimelines[skinName] ??= {})[track.slot] ??= {})[track.attachment] = { deform: keys };
      }

      const drawOrder = anim.drawOrder ? compileDrawOrder(anim.drawOrder, animName, anim.duration, slots) : null;
      if (drawOrder) for (const key of drawOrder) compiledDuration = Math.max(compiledDuration, key.time as number);

      const eventKeys = anim.events ? compileEvents(anim.events, animName, anim.duration, rig.events ?? {}) : null;
      // An event timeline counts towards the animation's length the same as any
      // other: `readAnimation` takes the duration from the longest timeline it
      // built, and `EventTimeline.getDuration()` is its last frame like the rest.
      if (eventKeys) for (const key of eventKeys) compiledDuration = Math.max(compiledDuration, key.time as number);

      // Rule 4: the declared duration is verified, because skeleton JSON does not
      // carry one — the loader takes the max key time.
      //
      // This arm is about the DECLARED DURATION being wrong, so it compares one
      // number per animation and tolerates a frame of it. The other arm —
      // `checkKeyTime`, above, per key — is about a key landing past the end, and
      // a frame is 16,667 times too coarse to see one. Both are needed: this one
      // catches an animation that stops a second early, and only that one catches
      // a key on a track whose neighbour already sits on the declared duration.
      if (Math.abs(compiledDuration - anim.duration) > FRAME) {
        throw new CompileError(
          `animation "${animName}" declares duration ${anim.duration}s but its last key is at ${compiledDuration}s`,
        );
      }
      // Group order is `readAnimation`'s own reading order, so an emitted file
      // diffs cleanly against an editor export. Each line is conditional, which
      // is what keeps a spec that uses none of the new groups byte-identical.
      animations[animName] = {};
      if (Object.keys(slotTimelines).length) animations[animName].slots = slotTimelines;
      if (Object.keys(boneTimelines).length) animations[animName].bones = boneTimelines;
      if (Object.keys(constraintTimelines.ik).length) animations[animName].ik = constraintTimelines.ik;
      if (Object.keys(constraintTimelines.transform).length) {
        animations[animName].transform = constraintTimelines.transform;
      }
      if (Object.keys(familyTimelines.path).length) animations[animName].path = familyTimelines.path;
      if (Object.keys(familyTimelines.physics).length) animations[animName].physics = familyTimelines.physics;
      if (Object.keys(familyTimelines.slider).length) animations[animName].slider = familyTimelines.slider;
      if (Object.keys(deformTimelines).length) animations[animName].attachments = deformTimelines;
      if (drawOrder) animations[animName].drawOrder = drawOrder;
      if (eventKeys) animations[animName].events = eventKeys;
    }
  });

  // -- 6. assemble -----------------------------------------------------------
  //
  // The stage is four fields or none of them. `x`/`y` are the origin of the box
  // `width`/`height` give an extent to, so a header carrying an origin for a box
  // it does not declare would be a shape no export has — and the key ORDER here
  // is the editor's own, which is what keeps a staged build byte-identical to
  // what it emitted before the stage could be declared absent (issue #578).
  const header: SpineSkeletonJson['skeleton'] = { spine: SPINE_VERSION };
  if (stageWidth !== undefined && stageHeight !== undefined) {
    header.x = rig.skeleton?.x ?? 0;
    header.y = rig.skeleton?.y ?? 0;
    header.width = stageWidth;
    header.height = stageHeight;
  }
  if (rig.skeleton?.fps !== undefined) header.fps = rig.skeleton.fps;
  if (rig.skeleton?.referenceScale !== undefined) header.referenceScale = rig.skeleton.referenceScale;
  const imagesPath = skeletonImagesPath(rig.skeleton?.images, opts, outDir, partDirs);
  if (imagesPath !== undefined) header.images = imagesPath;

  // Event definitions. Emitted in the order the rig spec declares them — object
  // key order is the spec's, not a set's, so A18 stays a contract.
  const events: Record<string, SpineEvent> = {};
  for (const [name, def] of Object.entries(rig.events ?? {})) {
    const entry: SpineEvent = {};
    if (def.int !== undefined) entry.int = def.int;
    if (def.float !== undefined) entry.float = r6(def.float);
    if (def.string !== undefined) entry.string = def.string;
    if (def.audio !== undefined) entry.audio = def.audio;
    if (def.volume !== undefined) entry.volume = r6(def.volume);
    if (def.balance !== undefined) entry.balance = r6(def.balance);
    events[name] = entry;
  }

  const skeleton: SpineSkeletonJson = {
    skeleton: header,
    bones,
    slots,
    // A skin entry is `name`, then whatever it activates, then `attachments` —
    // `readSkeletonData`'s own order (`:372-443`). Every member list is a
    // conditional spread, so a rig that declares none emits the two-key entry it
    // always did, byte for byte.
    //
    // Ordered the way `animations` is and for the same reason — the editor
    // rewrites this array and the binary half addresses it by ordinal — with the
    // sort applied HERE rather than to `skinTables`, so everything upstream (the
    // path-slot table, every refusal that lists skins) still reads the order the
    // rig spec declared. See `editorSkinOrder`.
    skins: editorSkinOrder(
      [...skinTables.entries()].map(([name, attachments]) => {
        const parts = skinParts.get(name);
        return {
          name,
          ...(parts?.bones.length ? { bones: parts.bones } : {}),
          ...Object.fromEntries(
            RIG_SKIN_CONSTRAINT_KEYS.filter((key) => parts?.constraints[key].length).map((key) => [
              key,
              parts!.constraints[key],
            ]),
          ),
          attachments,
        };
      }),
    ),
    // Between `skins` and `animations`, which is where the editor writes it. A
    // conditional spread rather than an assignment after the literal, so the key
    // lands in that position instead of at the end.
    ...(Object.keys(events).length ? { events } : {}),
    // Keyed in the editor's own order rather than the motion spec's, because a
    // slider's reference to an animation is an ordinal in the format and the
    // editor re-sorts this object — see `editorAnimationOrder`. The sort is
    // applied HERE and not to the loop above, so what the compiler reads, the
    // order it reports durations in, and which animation a CompileError names
    // first are all still the spec's own; only the emitted key order moves.
    animations: editorAnimationOrder(animations),
  };
  if (constraints.length) skeleton.constraints = constraints;

  for (const slot of slots) {
    if (!boneNames.has(slot.bone)) throw new CompileError(`slot "${slot.name}" has no bone`);
  }

  return {
    skeleton,
    skeletonText: `${JSON.stringify(skeleton, null, 2)}\n`,
    atlasText,
    images,
    droppedStates,
    absentParts,
    declaredDurations,
    meshBones: [...meshBones],
    meshes,
    physics: physicsReport,
    deformTransforms,
    trackDerivations,
    rig: buildRigInfo(rig, bones, meshes, manifest),
  };
}

// ---------------------------------------------------------------------------
// bones
// ---------------------------------------------------------------------------

interface BoneContext {
  rig: RigSpec;
  manifest: FaceManifest | null;
  cropH: number;
  axisSpineDeg: number | null;
  partBySlot: Map<string, FaceManifestPart>;
}

/**
 * One rig bone -> one emitted bone.
 *
 * 🔑 A field is emitted exactly when the spec declared it. That is not Spine's
 * own exporter convention (it omits anything equal to the default) and the
 * difference is deliberate: a formation may need to say `x: 0` out loud, and
 * deciding emission from the arithmetic rather than from the author's text makes
 * the file depend on a rounding.
 */
function buildBone(spec: RigBone, soFar: SpineBone[], ctx: BoneContext): SpineBone {
  const bone: SpineBone = { name: spec.name };
  if (spec.parent !== undefined) bone.parent = spec.parent;
  if (spec.length !== undefined) bone.length = r6(spec.length);

  const crop = cropPointOf(spec, ctx);
  if (crop) {
    // Crop pixels (y down) -> Spine world (y up) -> the parent's local space. The
    // inverse is the same one the mesh binder uses, so a rotated parent (the axis
    // bone, a grip) is handled once rather than per call site.
    const world: [number, number] = [crop[0], cropToSpineY(crop[1], ctx.cropH)];
    if (spec.parent === undefined) {
      bone.x = r6(world[0]);
      bone.y = r6(world[1]);
    } else {
      const parent = computeWorldTransforms(soFar).get(spec.parent);
      if (!parent) throw new CompileError(`bone "${spec.name}" names parent "${spec.parent}", which is declared after it`);
      const [lx, ly] = toBoneLocal(parent, world[0], world[1]);
      bone.x = lx;
      bone.y = ly;
    }
  } else {
    if (spec.x !== undefined) bone.x = r6(spec.x);
    if (spec.y !== undefined) bone.y = r6(spec.y);
  }

  const rotation = rotationOf(spec, ctx);
  if (rotation !== null) bone.rotation = r6(rotation);
  if (spec.scaleX !== undefined) bone.scaleX = r6(spec.scaleX);
  if (spec.scaleY !== undefined) bone.scaleY = r6(spec.scaleY);
  if (spec.shearX !== undefined) bone.shearX = r6(spec.shearX);
  if (spec.shearY !== undefined) bone.shearY = r6(spec.shearY);
  if (spec.inherit !== undefined) bone.inherit = spec.inherit;
  if (spec.skin !== undefined) bone.skin = spec.skin;
  if (spec.color !== undefined) bone.color = spec.color;
  if (spec.icon !== undefined) bone.icon = spec.icon;
  return bone;
}

/** The crop-pixel point a bone's `from` names, or null when it declares none. */
function cropPointOf(spec: RigBone, ctx: BoneContext): [number, number] | null {
  const from = spec.from;
  if (!from) return null;
  const needManifest = (what: string): FaceManifest => {
    if (!ctx.manifest) {
      throw new CompileError(`bone "${spec.name}" takes its position from ${what}, which needs a cut manifest`);
    }
    return ctx.manifest;
  };
  if (from.anchor !== undefined) {
    const manifest = needManifest(`the manifest anchor "${from.anchor}"`);
    const anchor = manifest.anchors?.[from.anchor];
    if (!anchor || anchor.length < 2) {
      throw new CompileError(
        `manifest anchors has no [x, y] for "${from.anchor}" (bone "${spec.name}" of rig "${ctx.rig.name}")`,
      );
    }
    return [anchor[0], anchor[1]];
  }
  if (from.slotWindow !== undefined) {
    const manifest = needManifest(`the window of slot "${from.slotWindow}"`);
    const part = ctx.partBySlot.get(from.slotWindow);
    if (!part) {
      throw new CompileError(
        `bone "${spec.name}" sits at the centre of slot "${from.slotWindow}", which this cut's manifest carries no part for`,
      );
    }
    const win = partWindow(part, manifest);
    return [win.x + win.w / 2, win.y + win.h / 2];
  }
  if (from.meshCenter !== undefined) {
    needManifest(`the mesh centre of slot "${from.meshCenter}"`);
    const centre = ctx.partBySlot.get(from.meshCenter)?.mesh?.center;
    if (!centre) {
      throw new CompileError(
        `bone "${spec.name}" sits on the mesh centre of slot "${from.meshCenter}", which declares no mesh.center`,
      );
    }
    return [centre[0], centre[1]];
  }
  return null;
}

/** The setup rotation a bone declares, in Spine degrees, or null for none. */
function rotationOf(spec: RigBone, ctx: BoneContext): number | null {
  const source = spec.from?.rotation;
  if (source === 'axis') {
    if (ctx.axisSpineDeg === null) {
      throw new CompileError(`bone "${spec.name}" takes its rotation from the cut axis, which the manifest does not declare`);
    }
    return ctx.axisSpineDeg;
  }
  if (source === 'anchor') {
    const key = spec.from!.anchor!;
    const anchor = ctx.manifest?.anchors?.[key];
    if (!anchor || anchor.length < 3) {
      throw new CompileError(
        `bone "${spec.name}" takes its rotation from anchor "${key}", which has no third element (a screen-space facing angle)`,
      );
    }
    return screenToSpineDegrees(anchor[2]);
  }
  return spec.rotation ?? null;
}

// ---------------------------------------------------------------------------
// attachment names, where one placeholder holds several attachments
// ---------------------------------------------------------------------------

/**
 * What separates a skin's name from a placeholder's inside an attachment name.
 *
 * ⚠️ A separator is the one part of this that could collide with a name somebody
 * wrote, so it is measured rather than picked: across the **160** distinct
 * placeholder names and **159** distinct atlas region names in `examples/` and
 * `gallery/` — every editor-authored name this repository has — `/` occurs in
 * **0**, while `-` occurs in 85 / 86 and `_` in 37 / 37. It is also the character
 * the format already has a structure for, since an attachment's name doubles as
 * its texture path and a path is what `/` separates.
 *
 * 🔒 And the choice is not load-bearing anyway, which is the point of stating it
 * this way: `contestedPlaceholders` refuses the build if the name it composes is
 * one some other placeholder in the same slot already answers to. A separator
 * nobody uses makes that refusal rare; the refusal is what makes it safe.
 */
const SKIN_ATTACHMENT_SEPARATOR = '/';

function skinAttachmentName(skinName: string, placeholder: string): string {
  return `${skinName}${SKIN_ATTACHMENT_SEPARATOR}${placeholder}`;
}

/**
 * The `name` one skin's entry for a placeholder is emitted with, or `null` for
 * the entries that carry no `name` field at all.
 *
 * Stated once, and called by both the emit and `contestedPlaceholders`'
 * collision walk, because two readings of one rule is how issue #567 happened.
 * By the time either caller runs, a contested placeholder the **default** skin
 * fills has already been refused — see `refuseDefaultSkinContest` — so every
 * entry this composes for is a named skin's.
 */
function composeSkinAttachmentName(skinName: string, placeholder: string, contested: boolean): string | null {
  return contested ? skinAttachmentName(skinName, placeholder) : null;
}

/**
 * Refuse a placeholder that the **default** skin and a named skin both fill.
 *
 * 🚨 This is issue #567 and it is not a naming problem, which took two editor
 * round trips to establish because each of them looked like one.
 *
 * ## What the editor's model is, bracketed by two trips
 *
 * Both on Spine **4.3.26**, on a rig whose three skins fill one placeholder
 * `patch` from three PNGs of three sizes, with a second slot `block` that one
 * skin fills as the fixed point.
 *
 * **Trip 7 — the default skin's attachment given a name of its own**
 * (`"name": "default/patch"`, as issue #552 emitted it). The editor IMPORTS it,
 * and exports the default skin's entry re-keyed by that name:
 *
 *     built     "default": { "patch": { "patch":         { "name": "default/patch", … } } }
 *     exported  "default": { "patch": { "default/patch": {                          … } } }
 *
 * The editor's default skin holds no skin placeholders — an attachment there
 * hangs on the slot and is known by its name alone — so the name becomes the
 * key. The slot's setup `attachment: "patch"` then resolves in no default-skin
 * key and the default skin draws NOTHING: `check` read mean MAE 98.52 with
 * `drewSlots: 0` on the `patch` chain while `validate --profile spine` stayed
 * green, because the file is well-formed and only the editor's model says what
 * a key means.
 *
 * **Trip 8 — the default skin's attachment left as its placeholder** (no `name`,
 * the obvious repair). The editor REFUSES the import:
 *
 *     ERROR: Unable to import skeleton.
 *     Cause: [error] Error reading attachment: mike/patch (nSX)
 *     Cause: [error] Multiple attachments have the same name:
 *     patch
 *     patch
 *
 * The default skin's attachment `patch` hangs on the slot; the named skins'
 * placeholder `patch` is that slot's other child. **In one slot, a default-skin
 * attachment name and a named skin's placeholder name are the same namespace.**
 *
 * ⇒ The two trips close the case: name it and the setup attachment resolves
 * nowhere, do not name it and the import is refused. **The editor has no
 * representation for a placeholder the default skin and a named skin both
 * fill** — its own convention is shared art in the default skin, per-skin art in
 * placeholders, and a slot's one setup `attachment` string naming one or the
 * other. There is no third spelling to find, so this is a `CompileError` and not
 * a scheme, in the shape issue #543 used: refuse by name and say what to do.
 *
 * ⚠️ What this does NOT touch, and the trips measured that half too: a
 * placeholder that two or more NAMED skins fill keeps #552's composition
 * exactly. Trip 8's second rig — two named skins filling `patch`, the default
 * skin holding `block` only — imported, exported and measured **0.0000 mean
 * MAE**, names and paths intact. The remedy this refusal states is that rig:
 * move the default skin's entry into a named skin.
 */
function refuseDefaultSkinContest(slotName: string, placeholder: string, skins: readonly string[]): never {
  const named = skins.filter((skin) => skin !== DEFAULT_SKIN);
  throw new CompileError(
    `slot "${slotName}": placeholder "${placeholder}" is filled by the "${DEFAULT_SKIN}" skin AND by ` +
      `${named.length === 1 ? 'skin' : 'skins'} ${named.map((skin) => `"${skin}"`).join(', ')}, and the Spine ` +
      'editor has no way to hold that. Measured on 4.3.26 in both spellings: give the default skin\'s attachment a ' +
      `name of its own ("${DEFAULT_SKIN}${SKIN_ATTACHMENT_SEPARATOR}${placeholder}") and the editor re-keys it by ` +
      `that name on export, so the slot's setup attachment "${placeholder}" resolves in no default-skin key and the ` +
      'default skin draws nothing; leave it as the placeholder and the import is refused outright with ' +
      `"Multiple attachments have the same name: ${placeholder} ${placeholder}", because a default-skin attachment ` +
      "hangs on the slot beside the named skins' placeholder of that name. Move the default skin's entry for this " +
      `slot into a named skin — call it "base" — so every skin filling "${placeholder}" is a named one. Two or more ` +
      'named skins sharing a placeholder is the shape the editor does hold, and rigc composes their names for them ' +
      '(#541, #552).',
  );
}

/**
 * Which `(slot, placeholder)` pairs more than one skin fills — and, on the way,
 * the refusal that keeps the composed names from colliding with authored ones.
 *
 * ## The defect this exists for
 *
 * Two skins putting different art under one placeholder is what a skin IS, and
 * until issue #541 rigc emitted both entries with no `name`, which makes the
 * placeholder the name of both (`SkeletonJson.ts:526`). spine-core is happy —
 * its skin table is keyed by placeholder, so the two never meet. The Spine
 * editor refuses the whole import, and says exactly why:
 *
 *     ERROR: Unable to import skeleton.
 *     [error] Error reading skeleton: skins
 *     Cause: [error] Error reading attachment: patch (MOw)
 *     Cause: [error] Multiple attachments have the same name: patch patch
 *
 * Bisected on the emitted file: four skins REFUSED, deform timelines removed
 * REFUSED, `default` + one skin REFUSED, `default` alone IMPORTS, the second skin
 * given a distinct placeholder IMPORTS, and the same placeholder with **each
 * entry given its own `name`** IMPORTS — all four skins. So it is neither the
 * skin count nor the timelines; it is one name over several attachments.
 *
 * ## Only the contested pairs are named, and the default skin may not contest
 *
 * A placeholder one skin fills keeps the emitted shape it has always had: no
 * `name`, no `path` it did not already carry. Every rig in this tree declares
 * exactly one skin, so **no emitted byte in the tree moves** — and a
 * multi-skin rig whose skins use distinct placeholders does not move either,
 * because nothing there is ambiguous to begin with.
 *
 * ⚠️ A contested placeholder the **default** skin fills is refused before any
 * of this runs — `refuseDefaultSkinContest`, issue #567 — because two editor
 * round trips showed the editor holds no such shape in either spelling. So
 * every entry the walk below composes for belongs to a named skin, and the
 * emitted name comes off `composeSkinAttachmentName`, which this function calls
 * rather than restates: the emit and the refusal disagreeing about one name is
 * the defect both of them exist to prevent.
 *
 * ⚠️ The scope of the editor's uniqueness rule is **not** skeleton-wide, and the
 * corpus proves it rather than a hypothesis doing so: `spineboy-pro.json`, which
 * the editor wrote, gives the name `head` to a region in slot `head` and to a
 * bounding box in slot `head-bb`, and names one `hoverglow-small` across eight
 * slots. What #541 refused was one slot. Composing from the skin makes the names
 * unique within the slot, which satisfies that scope and every narrower one;
 * nothing here claims to know which of them the editor actually applies, and an
 * assertion that policed the emitted artifact would have to.
 *
 * ## Why a composed name is not the compiler inventing a value
 *
 * rigc has always decided this attachment's name — it decided it was the
 * placeholder, silently, and that decision is the defect. What changes is the
 * derivation, not who makes it, and the new one is a function of two names the
 * spec wrote. Nothing is read off the art, and `path` — the field that says
 * which texture to draw — stays exactly what the spec stated or what the
 * attachment already resolved to.
 */
function contestedPlaceholders(
  skinNames: readonly string[],
  skinParts: Map<string, RigSkinParts>,
): Map<string, Set<string>> {
  /** slot -> placeholder -> the skins that fill it, in declaration order. */
  const fillers = new Map<string, Map<string, string[]>>();
  for (const skinName of skinNames) {
    for (const [slotName, placeholders] of Object.entries(skinParts.get(skinName)!.attachments)) {
      const perSlot = fillers.get(slotName) ?? new Map<string, string[]>();
      for (const placeholder of Object.keys(placeholders)) {
        perSlot.set(placeholder, [...(perSlot.get(placeholder) ?? []), skinName]);
      }
      fillers.set(slotName, perSlot);
    }
  }
  const contested = new Map<string, Set<string>>();
  const collisions: string[] = [];
  for (const [slotName, perSlot] of fillers) {
    const shared = new Set([...perSlot].filter(([, skins]) => skins.length > 1).map(([placeholder]) => placeholder));
    // 🚨 Before anything is composed: a contested placeholder the DEFAULT skin
    // fills has no representation in the editor at all, in either spelling
    // (issue #567, round trips 7 and 8). It is refused here rather than emitted,
    // and the refusal comes first because renaming cannot repair it — the
    // remedy is a different rig, not a different string.
    for (const placeholder of shared) {
      const skins = perSlot.get(placeholder)!;
      if (skins.includes(DEFAULT_SKIN)) refuseDefaultSkinContest(slotName, placeholder, skins);
    }
    if (shared.size) contested.set(slotName, shared);
    /** Emitted attachment name -> the first entry that claimed it. */
    const claimed = new Map<string, string>();
    for (const [placeholder, skins] of perSlot) {
      for (const skinName of skins) {
        // The emitted name, read off the one function that decides it — so the
        // refusal and the emit cannot drift into two readings. An UNCONTESTED
        // entry is claimed under its bare placeholder, the default skin's
        // included: a named skin whose composed name equals it is a collision,
        // and one this walk sees for the same reason it sees every other.
        const name = composeSkinAttachmentName(skinName, placeholder, shared.has(placeholder)) ?? placeholder;
        const site = `skin "${skinName}" placeholder "${placeholder}"`;
        const taken = claimed.get(name);
        if (taken === undefined) claimed.set(name, site);
        else collisions.push(`slot "${slotName}": ${taken} and ${site} would both be named "${name}"`);
      }
    }
  }
  if (collisions.length) {
    throw new CompileError(
      `${collisions.length} attachment name collision(s): a placeholder that more than one skin fills is emitted ` +
        `with the name "<skin>${SKIN_ATTACHMENT_SEPARATOR}<placeholder>", because the Spine editor refuses an import ` +
        'in which one slot holds two attachments of one name (#541) — and here that composed name is one another ' +
        'entry in the same slot already answers to. Rename the placeholder or the skin so the two differ. ' +
        `${collisions.join('. ')}`,
    );
  }
  return contested;
}

/**
 * Give one attachment its own `name`, and pin the texture `path` that name would
 * otherwise have taken with it.
 *
 * 🚨 The second half is the whole hazard. `readAttachment` reads
 * `const name = getValue(map, "name", placeholder)` and then
 * `const path = getValue(map, "path", name)` (`SkeletonJson.ts:526-529`, and
 * again at `:559` for a mesh) — so `path` defaults to the NAME, not to the
 * placeholder. Writing a name and leaving `path` alone silently repoints the
 * attachment's texture lookup at a region no atlas has. Restating `path` at what
 * the attachment already resolved to makes the name change invisible to
 * everything but the editor's own uniqueness rule, which is the only thing it is
 * for.
 *
 * ⚠️ `region` and `mesh` are exactly the two types that read `path`; the polygon
 * types (`boundingbox`, `clipping`, `path`) have no texture and get the name
 * alone. The list is the parser's own two `getValue(map, "path", …)` sites
 * rather than a judgement about which attachments "have art".
 */
function nameSkinAttachment(att: SpineAttachment, name: string, placeholder: string): SpineAttachment {
  const kind = (att as { type?: string }).type ?? 'region';
  // Key order is the parser's reading order — `name`, then `path`, then the rest
  // as the builder wrote it — for the same reason every other emitted object
  // follows it: the file is read by people and diffed against references.
  //
  // ⚠️ The three kinds here are the three the parser gives a texture `path` to,
  // and `linkedmesh` is one of them (`SkeletonJson.ts:541`, `:570` — the mesh
  // branch is shared). Leaving it out would write a `name` and no `path`, and
  // `path` defaults to `name`, so a contested link would resolve the region
  // "<skin>/<placeholder>", which no atlas holds.
  if (kind !== 'region' && kind !== 'mesh' && kind !== 'linkedmesh') return { name, ...att };
  const { path, ...rest } = att as SpineRegionAttachment | SpineMeshAttachment | SpineLinkedMeshAttachment;
  return { name, path: path ?? placeholder, ...rest } as SpineAttachment;
}

// ---------------------------------------------------------------------------
// rig-declared attachments
// ---------------------------------------------------------------------------

interface AttachmentContext {
  images: CompiledImage[];
  bones: SpineBone[];
  transforms: Map<string, BoneTransform>;
  meshBones: Set<string>;
  meshes: CompileResult['meshes'];
  slotName: string;
  anchorBone: string;
  /** Which skin this attachment is being built for — half of a `depths` key. */
  skinName: string;
  /**
   * Where a file the spec names is resolved from. A depth map is read from here
   * and never packed, so it is the one input path that does not go through
   * `images`.
   */
  imagesDir: string;
  /**
   * Per-vertex `z` for the attachments that named a depth map, keyed by
   * `skin/slot/attachment`.
   *
   * ⭐ It rides beside the emitted attachment rather than on it. A `z` written
   * into the mesh would be a field the Spine format has no room for — the
   * parser drops what it does not know, so it would survive exactly until the
   * round trip and then vanish — and the whole point of this table is to be
   * read by `evaluateDeformTransform` at key time and never emitted at all.
   */
  depths: Map<string, number[]>;
  /** Every slot the rig declares — a clipping attachment's `end` resolves here. */
  slotNames: Set<string>;
  /**
   * Linked meshes whose `source` is still unresolved — `resolveLinkedMeshes`
   * empties it once every skin has been built.
   *
   * ⭐ Deferred for the reason spine-core defers its own (`this.linkedMeshes`,
   * `SkeletonJson.js:56` filled at `:581` and drained at `:427-449`): a link may
   * name a source in a skin or a slot this loop has not reached yet, so resolving
   * it in place would refuse a correct rig on nothing but declaration order.
   */
  links: PendingLink[];
}

/** One linked mesh, with everything a refusal has to name once the skins exist. */
interface PendingLink {
  where: string;
  /** What it asked for, the parser's defaults already applied. */
  skin: string;
  slot: string;
  source: string;
  /**
   * Whether the author wrote `skin`/`slot` or is taking the parser's default —
   * which is the half of the refusal that says where a name came from, and the
   * one an author who wrote neither key needs most.
   */
  skinStated: boolean;
  slotStated: boolean;
}

/**
 * The seven `type` values `readAttachment` has a branch for (`:540-651`), and
 * the six rigc emits.
 *
 * ⚠️ The lists are separate because the refusals are separate. A `point` is a
 * name the format HAS and rigc has not built; `sequence` is not a type at all —
 * it is a key on a region or a mesh (SPEC_COVERAGE part 1-6) — and telling an
 * author that it "is in the Spine 4.3 format and rigc does not emit it yet"
 * promises work that will never be done, on a spelling that is simply wrong.
 * One message said exactly that about every string it did not recognise.
 */
const SPINE_ATTACHMENT_TYPES = ['region', 'mesh', 'linkedmesh', 'boundingbox', 'path', 'point', 'clipping'] as const;
const EMITTED_ATTACHMENT_TYPES = ['region', 'mesh', 'linkedmesh', 'boundingbox', 'clipping', 'path'] as const;

/**
 * What each deferred type is and what it would carry — `docs/SPEC_COVERAGE.md`
 * part 1-6's row, restated where the refusal can print it.
 *
 * ⭐ The construct, not just its name. "attachment type X is in the Spine 4.3
 * format and rigc does not emit it yet" tells an author who already knows what a
 * point is that rigc will not do it, and tells an author who does not know
 * nothing at all — and the second is the reader this repository writes for.
 *
 * ⚠️ `linkedmesh` was the other entry until issue #691 emitted it. The sentence
 * below no longer says *"neither a point nor a linked mesh appears anywhere in
 * the benchmark corpus"*, because half of that is now a statement about a type
 * rigc writes, and a refusal that argues from a construct it has since built is
 * a refusal nobody can act on.
 */
const DEFERRED_ATTACHMENTS: Record<string, string> = {
  point:
    'a position and an angle with no geometry at all — "x", "y", "rotation" and "color", posed by its bone and ' +
    'drawn by nothing; what reads it is game code asking where a muzzle or a hand is',
};

/**
 * Build one attachment a rig spec authored, as opposed to one a manifest part
 * produced.
 *
 * The types this refuses are refused BY NAME. The parser's own behaviour on an
 * attachment type it does not know is to return null and drop it
 * (`SkeletonJson.ts:653`), so passing an unimplemented type through would produce
 * a skeleton missing an attachment nobody was told about.
 *
 * 🚨 **`?? 'region'` is not the parser's default, and that gap was the one real
 * fall-through here** (issue #577). `getValue(map, "type", "region")` returns the
 * default only when the key is **missing** (`SkeletonJson.ts:527`, `getValue` at
 * `:1390`), so `"type": null` is a type the parser HAS and matches no case: the
 * switch falls off the end, `readAttachment` returns null, and the attachment
 * disappears. `att.type ?? 'region'` read that same map as a region and compiled
 * one, which is the compiler inventing a value the spec did not state. Measured
 * before the repair: `{"type": null, "image": "marker.png"}` compiled and gated
 * green; `{"type": null}` was refused as *a region needs width and height*, which
 * is the message the card for this issue quoted and the reason it read as a
 * `linkedmesh` fault. `"type": "linkedmesh"` itself was always refused by name.
 */
function buildRigAttachment(
  att: RigAttachment,
  placeholder: string,
  where: string,
  ctx: AttachmentContext,
): SpineAttachment {
  const stated = (att as { type?: unknown }).type;
  if (stated !== undefined && typeof stated !== 'string') {
    throw new CompileError(
      `${where}: "type" is ${JSON.stringify(stated) ?? String(stated)}, which is not a name. An attachment's type ` +
        `is one of ${SPINE_ATTACHMENT_TYPES.join(', ')}, or the key is absent and reads as "region". ` +
        'PRESENT-and-null is not absent: `getValue(map, "type", "region")` takes the default only when the key is ' +
        'missing (`SkeletonJson.ts:527`), so this map matches no case, `readAttachment` returns null (`:653`), and ' +
        'the attachment is dropped from the skeleton without a word. Remove the key, or name a type.',
    );
  }
  const type = stated ?? 'region';
  // A linked mesh in the format's OTHER spelling. `type: "mesh"` and `type:
  // "linkedmesh"` share one branch and the `source` key is what decides between
  // them (`:568-569`, `:582`; SPEC_COVERAGE part 1-6) — so a mesh carrying
  // `source` is a linked mesh whatever its `type` says, and refusing it as "two
  // keys this compiler does not read: source, skin" sent the author to delete
  // the one key that made it linked. Both spellings reach one builder for the
  // same reason they reach one parser branch.
  if (type === 'linkedmesh' || (type === 'mesh' && (att as { source?: unknown }).source !== undefined)) {
    return buildRigLinkedMesh(att as RigLinkedMeshAttachment, placeholder, where, ctx);
  }
  if (type === 'region') return buildRigRegion(att as RigRegionAttachment, placeholder, where, ctx);
  if (type === 'mesh') return buildRigMesh(att as RigMeshAttachment, placeholder, where, ctx);
  if (type === 'boundingbox') return buildRigBoundingBox(att as RigBoundingBoxAttachment, where, ctx);
  if (type === 'clipping') return buildRigClipping(att as RigClippingAttachment, where, ctx);
  if (type === 'path') return buildRigPath(att as RigPathAttachment, where, ctx);
  if (DEFERRED_ATTACHMENTS[type] !== undefined) throw new NotImplementedError(deferredAttachmentRefusal(type, where, ''));
  const near = nearMisses(type, SPINE_ATTACHMENT_TYPES);
  throw new CompileError(
    `${where}: attachment type "${type}" is not one of the ${SPINE_ATTACHMENT_TYPES.length} the Spine 4.3 format ` +
      `defines (${SPINE_ATTACHMENT_TYPES.join(', ')}). ` +
      (near.length ? `Did you mean ${near.map((n) => JSON.stringify(n)).join(' or ')}? ` : '') +
      'The parser matches no case for it, `readAttachment` returns null (`SkeletonJson.ts:653`), and the ' +
      'attachment is dropped from the skeleton without a word.' +
      // The one near-miss worth naming outright, because it is a real word in
      // this format standing one level up from where it was written.
      (type === 'sequence'
        ? ' "sequence" is a KEY on a region or a mesh rather than a type of its own (docs/SPEC_COVERAGE.md part 1-6).'
        : ''),
  );
}

/** The refusal for a type the format has and rigc has not built. */
function deferredAttachmentRefusal(type: string, where: string, how: string): string {
  return (
    `${where}: this attachment is a "${type}"${how} — ${DEFERRED_ATTACHMENTS[type]}. ` +
    `rigc does not emit it yet, deliberately: it emits ${EMITTED_ATTACHMENT_TYPES.join(', ')}, and a point ` +
    'appears nowhere in the benchmark corpus (docs/SPEC_COVERAGE.md parts 3-1 and 4-2), so it is not on the ' +
    "ladder's critical path. docs/SPEC_COVERAGE.md part 1-6 is the row this sentence reads " +
    'from, and it is what an implementation would have to carry.'
  );
}

/**
 * Encode the polygon a bounding box or a clipping attachment carries.
 *
 * 🚨 `vertexCount` is required, and everything else here is a cross-check of it.
 * The parser reads `map.vertexCount << 1` and hands that to `readVertices` as the
 * length to expect (`:552`, `:632`) — so with the field absent it expects 0,
 * takes the weighted branch, decodes the coordinate list as
 * `boneCount, (index, x, y, weight) × n`, and returns an attachment holding
 * whatever that garbage produced. It loads. It draws nothing (a bounding box
 * never did) and clips nothing, or clips the wrong shape, in complete silence.
 *
 * The two encodings are the mesh's — `encodeNamedWeights` is the same function —
 * because they are the same field with the same trap: `readVertices` decides
 * weighted vs unweighted by a length comparison alone, and a coincidental match
 * reads weight data as coordinates.
 */
function buildVertexGeometry(att: RigVertexGeometry, where: string, ctx: AttachmentContext): number[] {
  const count = att.vertexCount;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 3) {
    throw new CompileError(
      `${where}: vertexCount is ${JSON.stringify(count)}; a polygon needs at least 3 vertices, stated outright — ` +
        'the field has no parser default, and an absent one reads as 0 and takes the polygon with it',
    );
  }
  if (att.vertices && att.weights) {
    throw new CompileError(
      `${where}: geometry comes as "vertices" or as "weights", never both — "weights" is the by-name form of the same data`,
    );
  }
  if (att.weights) {
    if (att.boneIndexing === 'raw') {
      throw new CompileError(`${where}: "boneIndexing": "raw" describes a "vertices" run; "weights" always binds by name`);
    }
    if (att.weights.length !== count) {
      throw new CompileError(`${where}: weights cover ${att.weights.length} vertices but vertexCount is ${count}`);
    }
    return encodeNamedWeights(att.weights, where, ctx);
  }
  const raw = att.vertices;
  if (!raw || raw.length === 0) {
    throw new CompileError(`${where}: needs geometry — "vertices" (x, y per vertex) or "weights" (bound by name)`);
  }
  const unweighted = raw.length === count * 2;
  if (!unweighted) {
    if (att.boneIndexing !== 'raw') {
      throw new CompileError(
        `${where}: vertexCount ${count} wants ${count * 2} unweighted numbers and "vertices" holds ${raw.length}. ` +
          'The parser reads that as a WEIGHTED run, whose bone INDEXES point into the emitted bone array — a list ' +
          'the spec never writes, so inserting a bone rebinds every vertex in silence. ' +
          'Give the bindings by name as "weights": [[{ "bone": …, "x": …, "y": …, "weight": … }, …], …], ' +
          'fix vertexCount, or say "boneIndexing": "raw" on this attachment to keep the index form deliberately.',
      );
    }
    // A raw run still has to decode to exactly `vertexCount` vertices, or the
    // count and the polygon disagree and the parser believes the count.
    let decoded = 0;
    for (let i = 0; i < raw.length; decoded++) {
      const bones = raw[i++];
      if (!Number.isInteger(bones) || bones < 1) {
        throw new CompileError(`${where}: the raw weighted run has a bone count of ${String(bones)} at index ${i - 1}`);
      }
      i += bones * 4;
      if (i > raw.length) {
        throw new CompileError(
          `${where}: the raw weighted run is truncated — vertex ${decoded} claims ${bones} bone(s) and the array ends first`,
        );
      }
    }
    if (decoded !== count) {
      throw new CompileError(`${where}: the raw weighted run decodes to ${decoded} vertices but vertexCount is ${count}`);
    }
    // Register the bones it binds so the mesh-bone reports stay complete.
    for (let i = 0; i < raw.length; ) {
      const bones = raw[i++];
      for (let k = 0; k < bones; k++, i += 4) {
        const bone = ctx.bones[raw[i]];
        if (bone) ctx.meshBones.add(bone.name);
      }
    }
  }
  for (const n of raw) {
    if (!Number.isFinite(n)) throw new CompileError(`${where}: the vertex array holds a non-finite value ${String(n)}`);
  }
  return raw.map(r6);
}

function buildRigBoundingBox(
  att: RigBoundingBoxAttachment,
  where: string,
  ctx: AttachmentContext,
): SpineBoundingBoxAttachment {
  const out: SpineBoundingBoxAttachment = {
    type: 'boundingbox',
    vertexCount: att.vertexCount,
    vertices: buildVertexGeometry(att, where, ctx),
  };
  if (att.color !== undefined) out.color = att.color;
  return out;
}

function buildRigClipping(
  att: RigClippingAttachment,
  where: string,
  ctx: AttachmentContext,
): SpineClippingAttachment {
  if (att.end !== undefined) {
    // `skeletonData.findSlot` returns null on a miss and the parser assigns that
    // null (`:626-627`), so a typo does not fail — the clip simply never ends and
    // takes every slot below it out of the frame.
    if (typeof att.end !== 'string' || !ctx.slotNames.has(att.end)) {
      throw new CompileError(
        `${where}: end names slot ${JSON.stringify(att.end)}, which this rig does not declare; ` +
          'a miss loads as null and the clip then runs to the bottom of the draw order',
      );
    }
  }
  // Field order is the editor's here — `end`, `convex`, `inverse` before the
  // geometry — via conditional spreads, because a key assigned after the literal
  // lands at the end instead. Order carries no meaning in JSON; it is read by
  // people, and this file's diff against a reference is read a lot.
  const out: SpineClippingAttachment = {
    type: 'clipping',
    ...(att.end !== undefined ? { end: att.end } : {}),
    ...(att.convex !== undefined ? { convex: att.convex } : {}),
    ...(att.inverse !== undefined ? { inverse: att.inverse } : {}),
    vertexCount: att.vertexCount,
    vertices: buildVertexGeometry(att, where, ctx),
  };
  if (att.color !== undefined) out.color = att.color;
  return out;
}

/**
 * Setup-pose world position of every vertex of an emitted vertex run.
 *
 * The two encodings again, and the same split `readVertices` makes: an unweighted
 * run is one `x, y` in the SLOT BONE's space; a weighted one is
 * `boneCount, (boneIndex, bindX, bindY, weight) × n` per vertex, and the vertex
 * is the weighted sum of each influence's bind point taken to world through its
 * own bone. This is `VertexAttachment.computeWorldVertices` at setup, restated in
 * the compiler because the compiler must not link the runtime.
 */
function setupWorldVertices(
  vertices: number[],
  vertexCount: number,
  anchor: BoneTransform,
  bones: SpineBone[],
  transforms: Map<string, BoneTransform>,
  where: string,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (vertices.length === vertexCount * 2) {
    for (let i = 0; i < vertices.length; i += 2) out.push(toWorld(anchor, vertices[i], vertices[i + 1]));
    return out;
  }
  for (let i = 0; i < vertices.length; ) {
    const count = vertices[i++];
    let x = 0;
    let y = 0;
    for (let n = 0; n < count; n++, i += 4) {
      const bone = bones[vertices[i]];
      const m = bone === undefined ? undefined : transforms.get(bone.name);
      if (!m) throw new CompileError(`${where}: vertex ${out.length} binds bone index ${vertices[i]}, which is not in the bone list`);
      const [wx, wy] = toWorld(m, vertices[i + 1], vertices[i + 2]);
      const weight = vertices[i + 3];
      x += wx * weight;
      y += wy * weight;
    }
    out.push([x, y]);
  }
  return out;
}

/**
 * The knot-and-handle chain a path attachment's vertices actually form, in the
 * runtime's own order (`PathConstraint.computeWorldPositions`).
 *
 * ⭐ This is the part of the format a reader guesses wrong. The vertices are NOT
 * `3K + 1` Bezier points: the parser hands them to `readVertices` untouched, and
 * the constraint then **drops the first and last** on an open path (it computes
 * world vertices from offset 2 for `verticesLength - 4` numbers) because those
 * two are the outer control handles of the end knots, which no curve uses. A
 * closed path instead rotates by one and repeats the first knot at the end.
 * Either way what comes out is a `3K + 1` chain: knot, handle, handle, knot, …
 */
function pathChain(points: Array<[number, number]>, closed: boolean): Array<[number, number]> {
  if (!closed) return points.slice(1, points.length - 1);
  return [...points.slice(1), points[0], points[1]];
}

/**
 * Cumulative arc length at the end of each curve of the chain, in world units —
 * **the runtime's own measurement, restated line for line**.
 *
 * One entry per curve, which is what `lengths[curve]` indexes: the parser walks
 * curves with `if (p > lengths[curve]) continue`, and reads `lengths[curveCount]`
 * — where `curveCount` is the LAST curve's index — as the total path length.
 *
 * ⭐ **What this is not: an approximation of the arc length.** `lengths` is not a
 * fact about the Bezier, it is the number the consumer of the field computes for
 * itself when it is not given one. `PathConstraint.computeWorldPositions`
 * (`PathConstraint.js:289-324` in `@esotericsoftware/spine-core` 4.3.13) measures
 * a `constantSpeed` path with a cubic **forward difference** taken at `t = 1/4`
 * — `0.1875 = 3t²`, `0.09375 = 6t³`, `0.75 = 3t`, `0.16666667` standing in for
 * 1/6 — accumulating four `Math.sqrt` terms per curve into a running
 * `pathLength`, and writing the running value into `curves[i]` at each curve's
 * end. The Spine editor's exported `lengths` are that same computation: measured
 * against two editor exports, one open path from 4.3.23 and one closed path from
 * 4.3.26, this reproduces every digit the editor printed. So the loop below is a
 * transcription, not a sampler that happens to agree — and the two are not the
 * same thing, which is the reason the transcription is here.
 *
 * ⚠️ rigc measured this with a 64-chord sum until issue #560, and the comment
 * that stood here argued the difference was inside anything's tolerance. It was
 * not: 0.70 % high, uniformly, worth **4.96 px mean MAE** on the round trip of a
 * rig whose path constraint reads the field. A 4-chord sum is *also* not the
 * repair — it agrees with the forward difference only to about nine significant
 * digits, which is below what float32 can hold (so no editor export can tell the
 * two apart) and above rigc's own six-decimal rounding (so the emitted file can):
 * on both measured rigs the two spellings differ in `r6` on the LAST curve, where
 * the accumulated difference is largest. `PS67`–`PS69` in `selftest.ts` compare
 * this against `PathConstraint`'s own `curves` array read off a posed skeleton,
 * which is the only oracle that can see that gap.
 *
 * 🔒 The transcription is deliberate down to the spelling: `Math.sqrt(dx * dx +
 * dy * dy)` rather than `Math.hypot`, `0.16666667` rather than `1 / 6`, and the
 * running total carried across curves rather than restarted. Each of those is a
 * place where a more accurate line would emit a different file.
 */
function pathCurveLengths(chain: Array<[number, number]>): number[] {
  const out: number[] = [];
  let total = 0;
  for (let c = 0; c + 3 < chain.length; c += 3) {
    const [x1, y1] = chain[c];
    const [cx1, cy1] = chain[c + 1];
    const [cx2, cy2] = chain[c + 2];
    const [x2, y2] = chain[c + 3];
    const tmpx = (x1 - cx1 * 2 + cx2) * 0.1875;
    const tmpy = (y1 - cy1 * 2 + cy2) * 0.1875;
    const dddfx = ((cx1 - cx2) * 3 - x1 + x2) * 0.09375;
    const dddfy = ((cy1 - cy2) * 3 - y1 + y2) * 0.09375;
    let ddfx = tmpx * 2 + dddfx;
    let ddfy = tmpy * 2 + dddfy;
    let dfx = (cx1 - x1) * 0.75 + tmpx + dddfx * 0.16666667;
    let dfy = (cy1 - y1) * 0.75 + tmpy + dddfy * 0.16666667;
    total += Math.sqrt(dfx * dfx + dfy * dfy);
    dfx += ddfx;
    dfy += ddfy;
    ddfx += dddfx;
    ddfy += dddfy;
    total += Math.sqrt(dfx * dfx + dfy * dfy);
    dfx += ddfx;
    dfy += ddfy;
    total += Math.sqrt(dfx * dfx + dfy * dfy);
    dfx += ddfx + dddfx;
    dfy += ddfy + dddfy;
    total += Math.sqrt(dfx * dfx + dfy * dfy);
    out.push(total);
  }
  return out;
}

/**
 * `type: "path"` — the curve a path constraint slides bones along.
 *
 * Three things happen here that the parser will not do:
 *
 *   1. **`vertexCount` is checked against the group-of-three structure.** A count
 *      that is not a multiple of 3 does not throw anywhere:
 *      `Utils.newArray(vertexCount / 3, 0)` takes a fractional size happily, the
 *      groups of six then straddle the knots, and bones slide along a curve
 *      nobody drew. Too few points is the same failure with fewer symptoms — an
 *      open path needs 6 for one curve, a closed one 3.
 *   2. **`lengths` is measured, not copied.** See `RigPathAttachment`: it is the
 *      setup arc length of the geometry two fields above it, and a restated
 *      number that disagrees is only visible under `constantSpeed: false`, where
 *      it silently rescales the whole traversal.
 *   3. **An authored `lengths` is refused**, for that reason.
 */
function buildRigPath(att: RigPathAttachment, where: string, ctx: AttachmentContext): SpinePathAttachment {
  if (att.lengths !== undefined) {
    throw new CompileError(
      `${where}: "lengths" is not authored — rigc measures the setup arc length of each curve off the geometry, the ` +
        'same way it measures a region\'s size off its PNG. A restated length that disagrees with the vertices is ' +
        'invisible until `constantSpeed` is false, and then it rescales the whole traversal in silence.',
    );
  }
  const vertices = buildVertexGeometry(att, where, ctx);
  const count = att.vertexCount;
  const closed = att.closed === true;
  if (count % 3 !== 0) {
    throw new CompileError(
      `${where}: vertexCount is ${count}, which is not a multiple of 3. A path's vertices are knots AND their ` +
        'Bezier handles, read in groups of three; the parser sizes its lengths array with `vertexCount / 3` and ' +
        'accepts a fractional size without a word, so the curves would straddle the knots.',
    );
  }
  const minimum = closed ? 3 : 6;
  if (count < minimum) {
    throw new CompileError(
      `${where}: vertexCount is ${count} and ${closed ? 'a closed' : 'an open'} path needs at least ${minimum} — ` +
        `${closed ? 'a closed path of K curves carries 3K points' : 'an open one carries 3(K + 1), the first and last being the end knots\' outer handles'}`,
    );
  }
  const anchor = ctx.transforms.get(ctx.anchorBone);
  if (!anchor) throw new CompileError(`${where}: slot bone "${ctx.anchorBone}" has no setup transform`);
  const points = setupWorldVertices(vertices, count, anchor, ctx.bones, ctx.transforms, where);
  const lengths = pathCurveLengths(pathChain(points, closed));
  if (!lengths.length || !lengths.every((n) => Number.isFinite(n)) || lengths[lengths.length - 1] <= 0) {
    throw new CompileError(
      `${where}: the geometry measures ${lengths.length} curve(s) of total length ${String(lengths[lengths.length - 1])}; ` +
        'a path of zero length divides by zero the first time a bone is placed on it',
    );
  }
  // Field order is the parser's reading order (`:606-623`), and each optional key
  // is present exactly when the spec declared it — the rule the whole rig spec
  // follows, so Spine's own defaults stand for the rest.
  return {
    type: 'path',
    ...(att.closed !== undefined ? { closed: att.closed } : {}),
    ...(att.constantSpeed !== undefined ? { constantSpeed: att.constantSpeed } : {}),
    vertexCount: count,
    vertices,
    lengths: lengths.map(r6),
    ...(att.color !== undefined ? { color: att.color } : {}),
  };
}

/**
 * The compiled image an attachment's `image` names — or a refusal that names the
 * file and says what is actually wrong with it.
 *
 * 🚨 This exists because of what the four call sites used to do instead, which
 * was nothing (issue #555). `ctx.images.find(...)` returning `undefined` fell
 * through to the size branch, so an attachment that named a PNG rigc had not
 * atlased was refused with *a region needs width and height — give them, or give
 * an "image" and rigc will measure the PNG*: the remedy sentence handed to the
 * one author who had already done both halves of it. The two mesh generators
 * said `no compiled image for "x.png"`, which names the file and not the fault.
 *
 * ⭐ What the message may not do is guess at the spec. Every image a skin
 * attachment names is measured and atlased, one per file, so an attachment
 * standing in front of a region that does not exist is rigc having skipped a
 * measurement — the author cannot repair it by writing anything. Saying so is
 * the whole difference between a message that ends a session and one that starts
 * a bug report, and it is why this refusal reads as an invariant rather than as
 * advice. The near-miss list is `resolveFromAtlas`'s, for the case where the
 * spec did misspell a name in a way something upstream let through.
 */
function atlasedImage(image: string, where: string, ctx: AttachmentContext): CompiledImage {
  const region = basename(image, '.png');
  const img = ctx.images.find((im) => im.region === region);
  if (img) return img;
  const near = nearMisses(region, ctx.images.map((im) => im.region));
  const built = ctx.images.map((im) => im.region).sort();
  throw new CompileError(
    `${where}: the image "${image}" was never added to the atlas, so there is no region "${region}" for this ` +
      'attachment to draw and no measurement of it to take a size from. Every image an attachment names is ' +
      'measured and atlased — one per file, whichever skin names it (issue #555) — so reaching this means rigc ' +
      'skipped one, not that the spec left anything out. ' +
      (near.length ? `The nearest region(s) built are ${near.map((n) => JSON.stringify(n)).join(', ')}. ` : '') +
      `The atlas holds ${built.length} region(s): ${built.join(', ')}`,
  );
}

/**
 * The atlas region this attachment resolves its art from — **one rule for every
 * attachment kind that has art**, which is region and mesh (the parser's own two
 * `getValue(map, "path", name)` sites, `:541` and `:570`).
 *
 * `path` defaults to the attachment's NAME, not to the placeholder, so a
 * placeholder called anything other than its PNG's basename resolves a region no
 * atlas has. Stating it is therefore not decoration: without it the loader
 * throws `Region not found in atlas`, which `A00_ROUNDTRIP_PARSE` reports in the
 * parser's own words.
 *
 * 🚨 The tree answered this in three different ways until issue #577, and
 * `docs/AUTHORING.md` §3.4 documented only one of them — *"rigc sets it for you
 * when the PNG basename differs from the placeholder"*. A region derived it, the
 * `contour` and `grid` generators derived it (one of them with a comment reading
 * "Same rule a region attachment follows"), and an authored mesh and the
 * `ring`/`ribbon` generators wrote `path` only when the spec stated one.
 * Measured on the probe rig: a region with `image: hair_short.png` under
 * placeholder `hair` gated green with `"path": "hair_short"`; the same image on
 * an authored mesh emitted no `path` and failed `A00_ROUNDTRIP_PARSE: threw:
 * Region not found in atlas: hair (attachment: hair)`. The asymmetry had already
 * been paid for by hand — `selftest.ts`'s own `TIMELINE_RIG` restates
 * `path: "block"` and `path: "marker"` on two authored meshes for no other
 * reason.
 *
 * ⭐ Deriving is the reading that was already written down, in the doc and in
 * two of the five emit sites. The alternative — document the asymmetry and
 * refuse a mesh whose basename differs without a `path` — was rejected because
 * it makes a hand-kept exception out of a rule the format applies to both kinds
 * through one line of parser, and it would have had to contradict §3.4 rather
 * than satisfy it.
 */
function attachmentPath(att: { path?: string; image?: string }, placeholder: string): string | undefined {
  if (att.path !== undefined) return att.path;
  if (att.image === undefined) return undefined;
  const region = basename(att.image, '.png');
  return region === placeholder ? undefined : region;
}

function buildRigRegion(
  att: RigRegionAttachment,
  placeholder: string,
  where: string,
  ctx: AttachmentContext,
): SpineRegionAttachment {
  const img = att.image === undefined ? null : atlasedImage(att.image, where, ctx);
  // ⭐ An IMPORTED region's size is not a default the spec may override. On the
  // loose path `att.width` and the PNG's width are two legitimate numbers — "draw
  // this drawing at this size" is a scale, and the region covers its page either
  // way. A packed region's rectangle is already fixed in the atlas, so a spec that
  // states a different size is stating a disagreement with the file it is being
  // resolved against, and the two would produce a quad the pack cannot fill.
  if (img?.atlas !== undefined) {
    for (const [field, stated, measured] of [
      ['width', att.width, img.width],
      ['height', att.height, img.height],
    ] as const) {
      if (stated !== undefined && stated !== measured) {
        throw new CompileError(
          `${where}: the spec says ${field} ${stated} and region "${img.region}" of the imported atlas is ` +
            `${measured} (bounds ${img.atlas.width}x${img.atlas.height}, offsets state a ` +
            `${img.atlas.originalWidth}x${img.atlas.originalHeight} drawing` +
            // The descaled number is in neither file, so the message says how it
            // was reached — otherwise "the spec says 745 and the region is 746"
            // reads as an off-by-one in the spec rather than as the pack's own
            // rounding, and the remedy is the opposite one.
            (img.atlasScale === undefined
              ? ''
              : ` in the page's texels, which its scale: ${img.atlasScale} makes a ` +
                `${img.width}x${img.height} drawing (+/- ${r6(0.5 / img.atlasScale)}px, the pack's rounding)`) +
            ')',
        );
      }
    }
  }
  const width = att.width ?? img?.width;
  const height = att.height ?? img?.height;
  if (width === undefined || height === undefined) {
    // No parser default: an omission loads as NaN and every UV collapses, with
    // no error at all. So it is this or nothing.
    throw new CompileError(
      `${where}: a region needs width and height — give them, or give an "image" and rigc will measure the PNG`,
    );
  }
  const out: SpineRegionAttachment = { width: r6(width), height: r6(height) };
  const path = attachmentPath(att, placeholder);
  if (path !== undefined) out.path = path;
  if (att.x !== undefined) out.x = r6(att.x);
  if (att.y !== undefined) out.y = r6(att.y);
  if (att.rotation !== undefined) out.rotation = r6(att.rotation);
  if (att.scaleX !== undefined) out.scaleX = r6(att.scaleX);
  if (att.scaleY !== undefined) out.scaleY = r6(att.scaleY);
  if (att.color !== undefined) out.color = att.color;
  return out;
}

/**
 * Resolve an authored mesh's by-name weights into Spine's index run.
 *
 * 🚨 This is the whole point of the `weights` form. The run is
 * `boneCount, (boneIndex, bindX, bindY, weight) x n` per vertex and those
 * indices are positions in the emitted bone array — a thing the rig spec never
 * writes. Resolving them here, from names, is what makes "insert a bone" a
 * renumbering rather than a rebinding: the names still point at the same bones,
 * so the emitted indices move and the mesh does not.
 *
 * An unknown name is a `CompileError`, the same as a bone's `parent`, a slot's
 * `bone` or a constraint's `target`. The alternative — the raw form — cannot
 * refuse anything, because an index has no name to be wrong.
 */
function encodeNamedWeights(weights: RigMeshBinding[][], where: string, ctx: AttachmentContext): number[] {
  const out: number[] = [];
  weights.forEach((vertex, i) => {
    if (!Array.isArray(vertex) || vertex.length === 0) {
      throw new CompileError(`${where}: vertex ${i} has no bone bindings; a weighted vertex names at least one bone`);
    }
    out.push(vertex.length);
    for (const binding of vertex) {
      const index = ctx.bones.findIndex((b) => b.name === binding.bone);
      if (index < 0) {
        throw new CompileError(
          `${where}: vertex ${i} binds bone ${JSON.stringify(binding.bone)}, which the rig does not declare as a bone`,
        );
      }
      out.push(index, r6(binding.x), r6(binding.y), r6(binding.weight));
    }
  });
  return out;
}

/**
 * Measure an authored mesh against the art it names, or report nothing.
 *
 * 🚨 A measurement, never a refusal — and that asymmetry with `contour` is the
 * whole decision (issue #277). A contour mesh is refused under 99.5% because rigc
 * GENERATED that geometry as a claim about the art: below the bar, rigc's own
 * arithmetic clipped the drawing. Authored geometry is the author's intent, and a
 * mesh that sits inside its art is a legitimate thing to draw — a soft feather, a
 * deliberately trimmed hull, a mesh meant to bend a core while its edges stretch.
 * Refusing those would be #44's mistake in a new place. So the figure is printed
 * and the decision stays with the author.
 *
 * Nothing is reported in the two cases where there is nothing to compare:
 * an attachment with no `image` (there is no PNG the mesh is a claim about), and
 * a part with no art at all (0 of 0 pixels is not a percentage). Neither is an
 * error here — a mesh with no image is ordinary data, and an all-transparent part
 * is somebody else's assertion to make.
 *
 * 🚨 The asymmetry was a promise this function could not keep, and nothing here
 * said so (issue #570). `partPlate` three frames down called `extractRegion`,
 * which refused a region a foreign pack had turned — so an authored mesh naming
 * an `image` under `--atlas-in` ENDED the build, by a refusal raised inside a
 * measurement, on 36 of 42 atlases of the pack the card was filed from. The
 * repair was to make the refusal unnecessary rather than to catch it: reading a
 * turned region is a transcription of `MeshAttachment.computeUVs` and is now
 * what `extractRegion` does, so there is no unmeasurable case left for this
 * function to report and no catch here to keep reachable.
 */
function measureAuthoredFit(att: RigMeshAttachment, ctx: AttachmentContext): MeshFitReport | null {
  if (att.image === undefined || att.uvs === undefined || att.triangles === undefined) return null;
  const region = basename(att.image, '.png');
  const img = ctx.images.find((im) => im.region === region);
  if (!img) return null;
  const plate = partPlate(img);
  const alpha = new Uint8Array(plate.width * plate.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = plate.data[i * 4 + 3];
  // uvs are the part window in 0..1 — the same normalisation `buildContourMesh`
  // emits — so the pixel grid they land on is the PLATE's, which is the grid the
  // alpha was read off. On an imported page that declares a `scale:` the
  // drawing's size and the plate's differ, and it is the plate that has pixels.
  const points = [] as Array<[number, number]>;
  for (let i = 0; i + 1 < att.uvs.length; i += 2) {
    points.push([att.uvs[i] * plate.width, att.uvs[i + 1] * plate.height]);
  }
  const fit = measureAuthoredMeshFit({ width: plate.width, height: plate.height, alpha }, 1, points, att.triangles);
  return fit.artPixels === 0 ? null : fit;
}

/**
 * The `hull` and `edges` an authored mesh's triangles state (issue #368).
 *
 * `hull` is derived, never defaulted: the outline is the set of edges used by
 * exactly one triangle, and Spine needs its vertices first in the list and in
 * order, so a list that is not arranged that way is refused with the walk to
 * renumber along — writing 0 instead would hand the editor a mesh it rebuilds
 * the outline of on import (every vertex, in list order, with a WARNING). A
 * stated `hull` is checked against the same derivation, because the binary
 * reader turns a wrong one into a wrong triangle count. Stated `edges` are the
 * author's (an export carries only the edges somebody drew) and pass through;
 * absent ones are every triangle edge, which is what "internal edges lost" is
 * about.
 */
function authoredHullAndEdges(
  att: Pick<RigMeshAttachment, 'hull' | 'edges'>,
  vertexCount: number,
  triangles: number[],
  where: string,
): { hull: number; edges: number[] } {
  try {
    const outline = traceOutline(vertexCount, triangles);
    if (att.hull !== undefined && att.hull !== outline.hull) {
      throw new MeshError(
        `hull ${att.hull} disagrees with the triangles, whose outline has ${outline.hull} vertices ` +
          `(${formatWalk(outline.walk)}). Delete "hull" and rigc derives it, or state ${outline.hull}`,
      );
    }
    checkHullOrder(outline, vertexCount);
    return { hull: outline.hull, edges: att.edges ?? meshEdges(vertexCount, triangles, outline.hull) };
  } catch (err) {
    if (err instanceof MeshError) throw new CompileError(`${where}: ${err.message}`);
    throw err;
  }
}

/**
 * The same two fields for geometry rigc built. The generators already put the
 * outline first and in order — a contour is all outline, a ring's outer ring
 * comes first, a ribbon runs in perimeter order — so this is a self-check on
 * that promise rather than a rule the author can break, and the message says so.
 */
function generatedHullAndEdges(geometry: MeshGeometry, where: string): { hull: number; edges: number[] } {
  const vertexCount = geometry.uvs.length / 2;
  try {
    const outline = traceOutline(vertexCount, geometry.triangles);
    if (outline.hull !== geometry.hullVertices) {
      throw new MeshError(`it declares hull ${geometry.hullVertices} and its triangles outline ${outline.hull} vertices`);
    }
    checkHullOrder(outline, vertexCount);
  } catch (err) {
    if (err instanceof MeshError) {
      throw new CompileError(`${where}: internal: the ${geometry.kind} generator built an inconsistent mesh — ${err.message}`);
    }
    throw err;
  }
  return { hull: geometry.hullVertices, edges: meshEdges(vertexCount, geometry.triangles, geometry.hullVertices) };
}

function buildRigMesh(
  att: RigMeshAttachment,
  placeholder: string,
  where: string,
  ctx: AttachmentContext,
): SpineMeshAttachment {
  const authored =
    att.uvs !== undefined || att.triangles !== undefined || att.vertices !== undefined || att.weights !== undefined;
  if (authored && att.generator) {
    throw new CompileError(`${where}: a mesh is either authored geometry or a generator, never both`);
  }
  if (att.generator) return buildGeneratedMesh(att, att.generator, placeholder, where, ctx);
  if (att.vertices && att.weights) {
    throw new CompileError(
      `${where}: a mesh gives geometry as "vertices" or as "weights", never both — "weights" is the by-name form of the same data`,
    );
  }
  if (!att.uvs || !att.triangles || !(att.vertices || att.weights)) {
    throw new CompileError(`${where}: an authored mesh needs uvs, triangles and vertices or weights (or a "generator")`);
  }
  const uvCount = att.uvs.length;
  let vertices: number[];
  let boundBones: string[] = [];
  if (att.weights) {
    if (att.boneIndexing === 'raw') {
      throw new CompileError(`${where}: "boneIndexing": "raw" describes a "vertices" run; "weights" always binds by name`);
    }
    if (att.weights.length !== uvCount / 2) {
      throw new CompileError(
        `${where}: weights cover ${att.weights.length} vertices but there are ${uvCount / 2} uv pairs`,
      );
    }
    vertices = encodeNamedWeights(att.weights, where, ctx);
    boundBones = [...new Set(att.weights.flat().map((b) => b.bone))];
  } else {
    const raw = att.vertices!;
    // An unweighted mesh is one x,y per uv pair. It names no bone, so there is
    // nothing here to rebind and nothing to opt into.
    const weighted = raw.length !== uvCount;
    if (weighted && att.boneIndexing !== 'raw') {
      throw new CompileError(
        `${where}: this mesh's "vertices" is a weighted run, whose bone INDEXES point into the emitted bone array — ` +
          'a list the spec never writes, so inserting a bone rebinds every vertex in silence. ' +
          'Give the bindings by name as "weights": [[{ "bone": …, "x": …, "y": …, "weight": … }, …], …], ' +
          'or say "boneIndexing": "raw" on this attachment to keep the index form deliberately.',
      );
    }
    vertices = raw.map(r6);
    if (weighted) {
      const names = new Set<string>();
      for (let i = 0; i < raw.length; ) {
        const n = raw[i++];
        for (let k = 0; k < n; k++, i += 4) {
          const bone = ctx.bones[raw[i]];
          if (bone) names.add(bone.name);
        }
      }
      boundBones = [...names];
    }
  }
  const { hull, edges } = authoredHullAndEdges(att, uvCount / 2, att.triangles, where);
  // `width`/`height` are the size of the image the mesh is drawn on. Stated
  // wins; otherwise the PNG the attachment names, already measured for the
  // atlas — the same `CompiledImage.width` a region reads, so a page with a
  // `scale:` yields the drawing's size and not its texels. With neither stated
  // nor measurable it is a refusal, as it is for a region: 0 is not a size the
  // spec stated, and the editor shows whatever is written here as the image's
  // dimensions (it showed 32x32, its missing-image placeholder, for a 0x0 mesh).
  const img = att.image === undefined ? undefined : atlasedImage(att.image, where, ctx);
  const width = att.width ?? img?.width;
  const height = att.height ?? img?.height;
  if (width === undefined || height === undefined) {
    throw new CompileError(
      `${where}: a mesh needs width and height — give them, or give an "image" and rigc will measure the PNG`,
    );
  }
  const out: SpineMeshAttachment = {
    type: 'mesh',
    uvs: att.uvs.map(r6),
    triangles: att.triangles,
    vertices,
    hull,
    edges,
    width: r6(width),
    height: r6(height),
  };
  const path = attachmentPath(att, placeholder);
  if (path !== undefined) out.path = path;
  if (att.color !== undefined) out.color = att.color;
  // Register it as `authored`: geometry rigc did not build and whose topology it
  // therefore gets to assume nothing about. The generator-topology assertions
  // read this and skip rather than measuring a ring that was never a ring.
  ctx.meshBones.add(ctx.anchorBone);
  for (const name of boundBones) ctx.meshBones.add(name);
  const fit = measureAuthoredFit(att, ctx);
  ctx.meshes.push({
    slot: ctx.slotName,
    kind: 'authored',
    attachments: [ctx.slotName],
    vertices: uvCount / 2,
    triangles: att.triangles.length / 3,
    bones: boundBones.length ? boundBones : [ctx.anchorBone],
    coverage: fit === null ? undefined : r6(fit.coverage),
    overshoot: fit?.overshoot,
  });
  return out;
}

/**
 * A mesh that borrows another mesh's geometry. `type: "linkedmesh"`, or
 * `type: "mesh"` carrying `source` — one parser branch, one builder.
 *
 * 🚨 **Everything this refuses, the parser reads in silence**, which is the whole
 * reason the refusals exist. Measured on forged skeletons through spine-core
 * 4.3.13:
 *
 *   - Geometry beside `source`: the branch returns at `:586`, BEFORE
 *     `readVertices`. A link declaring 5 uvs, 3 triangles, `hull: 5` and
 *     `edges: [0, 2]` beside a 4-vertex source loaded with the source's 8-long
 *     `worldVerticesLength`, 6 triangles, `hullLength` 8 and 10 edges. Nothing
 *     the author wrote was read and nothing said so.
 *   - A chain — a link whose source is itself a link — resolves in the order
 *     `linkedMeshes` was FILLED, which is the order the skins' JSON keys are
 *     iterated in. Source-first, the chained link loaded the full geometry; with
 *     the two keys swapped in the same file it loaded `worldVerticesLength` 0,
 *     0 triangles, 0 bones and a 0x0 size, silently. A construct whose meaning
 *     depends on key order is a construct rigc will not write.
 *   - A link to itself is that chain at length one, and loads the same nothing.
 *
 * What is NOT refused here is `source` naming something in a skin or a slot this
 * builder has not reached yet: that is `resolveLinkedMeshes`' job, and doing it
 * here would refuse a correct rig on declaration order — the very thing the
 * chain measurement above condemns.
 */
function buildRigLinkedMesh(
  att: RigLinkedMeshAttachment,
  placeholder: string,
  where: string,
  ctx: AttachmentContext,
): SpineLinkedMeshAttachment {
  // The mesh keys the parser does not reach on this branch. Named one by one,
  // because "remove what does not belong" is not an instruction an author can
  // act on and the remedy for each of these is the same single sentence.
  const geometry = (['uvs', 'triangles', 'vertices', 'weights', 'boneIndexing', 'hull', 'edges', 'generator'] as const)
    .filter((key) => att[key] !== undefined);
  if (geometry.length > 0) {
    throw new CompileError(
      `${where}: a linked mesh states ${geometry.map((k) => JSON.stringify(k)).join(', ')}, and a linked mesh has ` +
        'no geometry of its own — it draws the geometry of the attachment "source" names. The parser returns from ' +
        'the `source` branch before `readVertices` (`SkeletonJson.ts:582-586`), so these keys are read by nothing ' +
        "at all: a link declaring 5 uvs beside a 4-vertex source loads the SOURCE's 4 vertices and says nothing. " +
        `Remove ${geometry.length === 1 ? 'it' : 'them'}, or remove "source" and author this as a mesh of its own.`,
    );
  }
  const source = att.source;
  if (typeof source !== 'string' || source.length === 0) {
    throw new CompileError(
      `${where}: a linked mesh needs "source" — the PLACEHOLDER of the mesh whose geometry it draws (the key that ` +
        `attachment is filed under in its skin, not its "name"), and this one states ${JSON.stringify(source) ?? String(source)}. ` +
        '"source" is what MAKES a mesh linked: `getValue(map, "source", null)` is falsy-tested ' +
        '(`SkeletonJson.ts:582`), so an absent or empty one is read as an ordinary mesh, whose `uvs` this ' +
        'attachment does not have — the parser dereferences `map.uvs.length` and throws.',
    );
  }
  if (att.slot !== undefined && !ctx.slotNames.has(att.slot)) {
    throw new CompileError(
      `${where}: "slot" is ${JSON.stringify(att.slot)}, which the rig does not declare as a slot. It names where ` +
        'the source lives and is resolved through `skeletonData.findSlot` (`SkeletonJson.ts:575`), which throws ' +
        `\`Source mesh slot not found\` on a miss. The rig's slots are ${[...ctx.slotNames].sort().map((s) => JSON.stringify(s)).join(', ')}. ` +
        "Leave it out and the source is looked for in this attachment's own slot, which is the parser's default.",
    );
  }
  ctx.links.push({
    where,
    skin: att.skin ?? 'default',
    slot: att.slot ?? ctx.slotName,
    source,
    skinStated: att.skin !== undefined,
    slotStated: att.slot !== undefined,
  });
  // The art side is a mesh's, unchanged: a link draws its OWN region, which is
  // the reason the type exists — one triangulation, one outfit's pixels each.
  const img = att.image === undefined ? undefined : atlasedImage(att.image, where, ctx);
  const width = att.width ?? img?.width;
  const height = att.height ?? img?.height;
  if (width === undefined || height === undefined) {
    throw new CompileError(
      `${where}: a linked mesh needs width and height — give them, or give an "image" and rigc will measure the PNG`,
    );
  }
  const out: SpineLinkedMeshAttachment = { type: 'linkedmesh', source, width: r6(width), height: r6(height) };
  const path = attachmentPath(att, placeholder);
  if (path !== undefined) out.path = path;
  // Only where they differ from the parser's own defaults. Writing `timelines:
  // true`, or a `skin` of "default", would be a byte the editor's own export
  // does not carry.
  if (att.slot !== undefined && att.slot !== ctx.slotName) out.slot = att.slot;
  if (att.skin !== undefined && att.skin !== 'default') out.skin = att.skin;
  if (att.timelines === false) out.timelines = false;
  if (att.color !== undefined) out.color = att.color;
  // 🚫 NOT registered in `ctx.meshes`, and that is a decision rather than an
  // omission. `meshKinds` is keyed by SLOT and the commonest linked mesh shares
  // its source's slot from another skin, so an entry here would overwrite the
  // source's own `ring`/`ribbon`/`contour` kind and silence `A21_MESH_RIM_PINNED`
  // on the mesh rigc actually built — a gate turned off by a feature, which is
  // the failure mode issue #44 is about, pointed the other way. The validator
  // tells a link apart from the ARTIFACT instead — off the file's own `source`
  // keys, joined to the loaded attachment by (skin, slot, placeholder) — which
  // is the archetype rule's own words: an assertion reads the rig, never a name.
  return out;
}

/**
 * Resolve every `source` against the skins that were built, and refuse a miss by
 * name.
 *
 * Three of the four refusals are one per throw the runtime would have made
 * (`SkeletonJson.js:427-436`) — `Skin not found`, `Source mesh slot not found`,
 * `Source mesh not found`. Those are thrown `Error`s, so left to the round trip
 * they arrive as `A00_ROUNDTRIP_PARSE`'s report of the runtime's sentence, which
 * names neither the attachment that asked nor the skin and slot it searched. The
 * fourth has no runtime throw behind it at all: a source that is not a mesh is
 * read field by field off whatever was found, and `undefined` is not an error.
 */
function resolveLinkedMeshes(
  links: readonly PendingLink[],
  tables: Map<string, Record<string, Record<string, SpineAttachment>>>,
): void {
  const skinNames = [...tables.keys()];
  for (const link of links) {
    // ⚠️ Only a STATED `skin` can miss here, and it is worth saying why rather
    // than leaving the other half to look like a branch nothing reaches: rigc
    // always emits a `default` skin, empty if it has to (`tableFor('default')`),
    // so the parser's own default always resolves to a table. An omitted `skin`
    // therefore fails one line down, at the source, and the sentence there is
    // what names the trap.
    const table = tables.get(link.skin);
    if (table === undefined) {
      throw new CompileError(
        `${link.where}: "skin" is ${JSON.stringify(link.skin)}, and the rig declares no such skin. The rig's skins ` +
          `are ${skinNames.map((s) => JSON.stringify(s)).join(', ')}. ` +
          "Left to the round trip this is the runtime's `Skin not found`, which names neither this attachment nor " +
          'where it was looking.',
      );
    }
    const slot = table[link.slot];
    const held = slot === undefined ? [] : Object.keys(slot).sort();
    const found = slot?.[link.source];
    if (found === undefined) {
      throw new CompileError(
        `${link.where}: "source" is ${JSON.stringify(link.source)}, and skin ${JSON.stringify(link.skin)}` +
          `${link.skinStated ? '' : ' (the default skin, because no "skin" was stated — never the skin this attachment is written in)'}` +
          ` slot ${JSON.stringify(link.slot)}${link.slotStated ? '' : ' (this attachment\'s own slot, because no "slot" was stated)'} ` +
          `holds ${held.length === 0 ? 'no attachment at all' : `${held.length}: ${held.map((k) => JSON.stringify(k)).join(', ')}`}. ` +
          '"source" is the PLACEHOLDER the source is filed under — `skin.getAttachment(slotIndex, source)` ' +
          "(`SkeletonJson.ts:433`), whose table is keyed by the JSON key, not by the attachment's `name`. " +
          "Left to the round trip this is the runtime's `Source mesh not found`.",
      );
    }
    const type = (found as { type?: string }).type ?? 'region';
    if (type === 'linkedmesh') {
      throw new CompileError(
        `${link.where}: "source" is ${JSON.stringify(link.source)}, which is itself a linked mesh, and a chain of ` +
          'them is refused. Measured through spine-core: the runtime resolves links in the order they were read, ' +
          "so a link whose source is a link loads the source's geometry when the source comes first in the file " +
          'and loads NOTHING — `worldVerticesLength` 0, 0 triangles, a 0x0 size — when the two are swapped, in ' +
          'silence either way. Point "source" at the mesh itself.',
      );
    }
    if (type !== 'mesh') {
      throw new CompileError(
        `${link.where}: "source" is ${JSON.stringify(link.source)}, which is a ${JSON.stringify(type)} attachment ` +
          "and not a mesh. A linked mesh takes another MESH's `uvs`, `triangles`, `vertices`, `hull` and `edges` " +
          '(`MeshAttachment.setSourceMesh`); the runtime casts whatever it finds and reads those fields off it, ' +
          'which on any other type is `undefined` and no error.',
      );
    }
  }
}

/**
 * Invoke a `src/mesh.ts` builder from rig-spec data.
 *
 * ⚠️ This is the path a skeleton with NO cut manifest takes. A cut that has one
 * invokes the same builders through the manifest's `mesh` block instead, because
 * everything the builders need — the mask contour, the aperture centre, the part
 * window — is measured art, and measured art has exactly one home.
 */
function buildGeneratedMesh(
  att: RigMeshAttachment,
  generator: NonNullable<RigMeshAttachment['generator']>,
  placeholder: string,
  where: string,
  ctx: AttachmentContext,
): SpineMeshAttachment {
  if (generator.kind === 'contour') return buildContourAttachment(att, generator, placeholder, where, ctx);
  if (generator.kind === 'grid') return buildGridAttachment(att, generator, placeholder, where, ctx);
  const controls = generator.kind === 'ring' ? generator.controls : generator.chain;
  // Resolving the bone list and the setup transform is one step with two named
  // refusals, because the ring's control angles need the transform and the encode
  // needs the index — and the two must refuse a bone the rig lacks in the same
  // words whichever of them asks for it first.
  const resolve = (name: string): { index: number; transform: BoneTransform } => {
    const index = ctx.bones.findIndex((b) => b.name === name);
    if (index < 0) throw new CompileError(`${where}: mesh bone "${name}" is not in the rig's bone list`);
    const transform = ctx.transforms.get(name);
    if (!transform) throw new CompileError(`${where}: no setup transform for mesh bone "${name}"`);
    return { index, transform };
  };
  const refFor = (name: string): MeshBoneRef => {
    const { index, transform } = resolve(name);
    return { index, toBind: (wx, wy) => toBoneLocal(transform, wx, wy) };
  };
  // The generator works in part-local pixels, y down. Without a manifest there is
  // no crop to flip against, so the part window is centred on its own slot bone.
  // `place` is that placement and `toPartLocal` is its inverse — which is the
  // conversion a control bone's own position has to come back through before its
  // angle about the aperture means anything (issue #684).
  const [w, h] = generator.size;
  const anchor = ctx.transforms.get(ctx.anchorBone);
  if (!anchor) throw new CompileError(`${where}: slot bone "${ctx.anchorBone}" has no setup transform`);
  const place = (px: number, py: number): [number, number] => [anchor.worldX + px - w / 2, anchor.worldY + h / 2 - py];
  const toPartLocal = (wx: number, wy: number): [number, number] => [wx - anchor.worldX + w / 2, anchor.worldY + h / 2 - wy];
  let geometry;
  try {
    geometry =
      generator.kind === 'ribbon'
        ? buildRibbonMesh({ size: generator.size, rows: generator.rows, chainCount: generator.chain.length })
        : buildRingMesh({
            hull: generator.hull,
            center: generator.center,
            inner: generator.inner,
            size: generator.size,
            bias: generator.bias,
            controlAngles: ringControlAngles(controls, generator.center, (name) => {
              const { transform } = resolve(name);
              return toPartLocal(transform.worldX, transform.worldY);
            }),
          });
  } catch (err) {
    if (err instanceof MeshError) throw new CompileError(`${where}: ${err.message}`);
    throw err;
  }
  const vertices = encodeWeightedVertices(
    geometry,
    (px, py) => {
      const [wx, wy] = place(px, py);
      return [r6(wx), r6(wy)];
    },
    { anchor: refFor(ctx.anchorBone), controls: controls.map(refFor) },
  );
  ctx.meshBones.add(ctx.anchorBone);
  for (const name of controls) ctx.meshBones.add(name);
  ctx.meshes.push({
    slot: ctx.slotName,
    kind: geometry.kind,
    attachments: [ctx.slotName],
    vertices: geometry.uvs.length / 2,
    triangles: geometry.triangles.length / 3,
    bones: [ctx.anchorBone, ...controls],
  });
  const out: SpineMeshAttachment = {
    type: 'mesh',
    uvs: geometry.uvs,
    triangles: geometry.triangles,
    vertices,
    ...generatedHullAndEdges(geometry, where),
    width: r6(w),
    height: r6(h),
  };
  const path = attachmentPath(att, placeholder);
  if (path !== undefined) out.path = path;
  if (att.color !== undefined) out.color = att.color;
  return out;
}

/**
 * Read a depth map, check it against the part it claims to describe, and put a
 * `z` on every vertex.
 *
 * ## The three refusals, and why each one is a refusal
 *
 * **A size that is not the part's.** The map is sampled in part-local pixels,
 * so a sheet of a different size is a different coordinate system; sampling it
 * anyway would read the right shape from the wrong place and produce a turn
 * that is subtly, plausibly wrong everywhere.
 *
 * **A colour image.** A depth map is one channel. Silently taking red from an
 * RGB file works right up until somebody hands over a normal map or a tinted
 * preview, and then the part turns by whatever the red channel happened to say.
 *
 * **A vertex the map does not cover.** This is the one that is easy to miss and
 * ruins the result. A `contour` mesh's vertices are ALL on the silhouette, and
 * the outline is pushed `margin` pixels OUTSIDE it — while a depth sheet is
 * usually cut to the art's own alpha. Sample naively and every vertex reads the
 * sheet's transparent background, the whole rim takes the background depth, and
 * the silhouette folds away from the turn. Nothing about that is detectable
 * downstream: the arithmetic is correct and the numbers are plausible. So a
 * sheet that carries an alpha channel is held to it, and the fix — dilate the
 * sheet past the mesh margin — is named in the message.
 *
 * ## The count beside the third refusal, and why it is a count (issue #449)
 *
 * A sheet with no transparent texel anywhere covers its whole grid by
 * construction, so the third refusal has nothing to hold it to and skips. That
 * is the encoding a monocular depth estimator produces — a full-frame opaque
 * render with the background in it — and it is a legitimate statement, so
 * skipping the refusal is right. What was wrong is that nothing took its place:
 * measured on one cell and one depth field, the same 54 %-background mesh is a
 * named refusal when the sheet's alpha is cut to the art and a green build when
 * it is 255 everywhere.
 *
 * ⚠️ **`range` is not where that shows up**, and this header said it was until
 * #449 measured it. On the build above `range` reads `[0, 223.97]` of a stated
 * 224 — full, healthy — because the background is a legitimate depth value and
 * a map that is half background has exactly as full a range as one that is all
 * subject. "Covers its whole grid" is true and about the wrong grid: the
 * question was never coverage of the *sheet*, it was whether the mesh is
 * sampling **art**.
 *
 * ⇒ what shows it is `undrawn`: how many of the mesh's vertices take their
 * depth from a texel **the part image does not draw**, over the same four
 * bilinear taps the refusal walks. That is a measurement, not a guess, so it is
 * reported and never refused — a full-frame sheet is a statement rigc has no
 * authority to guess away.
 *
 * 🔸 It is a raw count with no reach subtracted from it, which is why a
 * `contour` mesh reports most or all of its vertices: its outline is pushed
 * `margin` pixels outside the silhouette by design, and out there the part
 * draws nothing. That is the true reading of that geometry rather than a defect
 * in the count — the rim's depth really did come from off the art, which is
 * benign on a sheet dilated past the margin and is the whole failure on a
 * full-frame estimate. Discounting the margin would be borrowing a number
 * authored for the trace to mean "close enough" for the sheet, and rigc does
 * not invent tolerances.
 */
function sampleMeshDepth(
  spec: NonNullable<Extract<NonNullable<RigMeshAttachment['generator']>, { kind: 'contour' }>['depth']>,
  kind: 'contour' | 'grid',
  points: ReadonlyArray<readonly [number, number]>,
  /** The mesh's own triangle list, for the turn ceiling. */
  triangles: ReadonlyArray<number>,
  /**
   * A part-local pixel to the BIND space this mesh's vertices are emitted in —
   * the same composition `encodeWeightedVertices` applies, handed in rather than
   * rebuilt so the two cannot diverge.
   *
   * 🚨 The ceiling has to be taken in bind space and in no other. A deform
   * offset is authored there, so a rotated slot bone MIXES the two axes: a
   * ceiling measured in part-aligned pixels would report the yaw limit of a
   * turn nobody is taking. It is also scale-sensitive — a ratio of an area to
   * an area with a depth substituted into it — so part pixels have to reach the
   * units `z` is already in before it is taken.
   */
  toBind: (px: number, py: number) => readonly [number, number],
  /**
   * The PART's own alpha channel, in the same grid the sheet is sampled in —
   * what the drawing actually covers, as against what the sheet covers.
   *
   * The two are different questions and the header says why. This one has no
   * refusal behind it: it is counted, reported, and left to the author.
   */
  partAlpha: Uint8Array,
  partWidth: number,
  partHeight: number,
  where: string,
  ctx: AttachmentContext,
): {
  z: number[];
  /** The tone-curved 0..1 nearness per vertex, which `bind` thresholds. */
  nearness: number[];
  summary: NonNullable<CompileResult['meshes'][number]['depth']>;
} {
  if (typeof spec.image !== 'string' || spec.image.length === 0) {
    throw new CompileError(`${where}: the depth block has no "image"; it is the sheet to sample, relative to the rig's images directory`);
  }
  if (spec.near !== 'white' && spec.near !== 'black') {
    throw new CompileError(
      `${where}: the depth block says "near": ${JSON.stringify(spec.near)}; it is "white" or "black". Both ` +
        'conventions are in use, and a sheet read with the wrong one turns the part inside out with every gate green.',
    );
  }
  const tone: DepthTone = {
    gamma: spec.gamma ?? DEPTH_TONE_IDENTITY.gamma,
    contrast: spec.contrast ?? DEPTH_TONE_IDENTITY.contrast,
    bias: spec.bias ?? DEPTH_TONE_IDENTITY.bias,
  };
  try {
    checkTone(tone, where);
    checkZScale(spec.zScale, where);
  } catch (err) {
    if (err instanceof DepthError) throw new CompileError(err.message);
    throw err;
  }

  const { map, cover, opaqueEverywhere } = readGreySheet(spec.image, 'depth', partWidth, partHeight, where, ctx);

  // Every texel a bilinear tap touches has to be covered, not just the nearest
  // one: a vertex half a pixel outside the sheet blends real depth with the
  // background and lands somewhere neither states.
  //
  // 🔒 One walk, one footprint, two readings. `cover` is the SHEET's alpha and
  // decides a refusal; `partAlpha` is the PART's and decides a count. They are
  // deliberately the same four taps and the same clamp — the second is the
  // first's instinct applied to the other input (issue #449), and writing it as
  // a second loop is how the two would come to disagree about which texels a
  // vertex reads.
  const cx = (i: number): number => (i < 0 ? 0 : i > partWidth - 1 ? partWidth - 1 : i);
  const cy = (j: number): number => (j < 0 ? 0 : j > partHeight - 1 ? partHeight - 1 : j);
  const uncovered: number[] = [];
  let undrawn = 0;
  for (let v = 0; v < points.length; v++) {
    const x0 = Math.floor(points[v][0] - 0.5);
    const y0 = Math.floor(points[v][1] - 0.5);
    let covered = true;
    let drawn = true;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      const at = cy(y0 + dy) * partWidth + cx(x0 + dx);
      if (cover[at] !== 255) covered = false;
      // Zero, not a threshold: "the part image draws nothing here" is a fact
      // about the file, and any other cut-off would be rigc deciding how faint
      // a texel has to be before it stops counting as art.
      if (partAlpha[at] === 0) drawn = false;
    }
    if (!opaqueEverywhere && !covered) uncovered.push(v);
    if (!drawn) undrawn++;
  }
  if (uncovered.length > 0) {
    const first = uncovered[0];
    // The two topologies run out of sheet for different reasons, and a message
    // that explains the wrong one sends the author to the wrong fix.
    const why =
      kind === 'contour'
        ? 'A contour mesh puts every vertex ON the silhouette and pushes it out by the margin, so a sheet cut to ' +
          'the art stops short of every one of them. Dilate the sheet past the mesh margin, or lower the margin.'
        : 'A grid spans the whole part window, corners included, while a sheet is usually cut to the art — so the ' +
          'lattice reaches past it wherever the art does not fill the window. Dilate the sheet to the window, or ' +
          'state "us"/"vs" that keep the lattice inside the art.';
    throw new CompileError(
      `${where}: the depth map "${spec.image}" does not cover ${uncovered.length} of the mesh's ${points.length} ` +
        `vertices — the first is vertex ${first} at (${points[first][0]}, ${points[first][1]}). ${why} ` +
        'Sampling anyway would give those vertices the sheet\'s background depth and fold them away from the turn.',
    );
  }

  const z: number[] = [];
  const nearness: number[] = [];
  let lo = Infinity;
  let hi = -Infinity;
  for (const [x, y] of points) {
    const n = toneLevel(sampleLevel(map, x, y), spec.near as DepthNear, tone);
    const d = n * spec.zScale;
    nearness.push(n);
    z.push(d);
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  return {
    z,
    nearness,
    summary: {
      image: spec.image,
      digest: depthDigest(map),
      near: spec.near,
      zScale: spec.zScale,
      tone,
      range: [r6(lo), r6(hi)],
      undrawn,
      ceiling: turnCeiling(
        points.map(([px, py]) => toBind(px, py)),
        z,
        triangles,
      ),
    },
  };
}

/** One bone of the rig as `encodeWeightedVertices` wants it. */
function meshBoneRef(name: string, where: string, ctx: AttachmentContext): MeshBoneRef {
  const transform = ctx.transforms.get(name);
  if (!transform) throw new CompileError(`${where}: bone "${name}" has no setup transform`);
  const index = ctx.bones.findIndex((b) => b.name === name);
  if (index < 0) throw new CompileError(`${where}: bone "${name}" is not in the rig's bone list`);
  return { index, toBind: (wx, wy) => toBoneLocal(transform, wx, wy) };
}

/**
 * Read a one-channel sheet in a part's own pixel grid.
 *
 * Two callers want the same three refusals — the depth map and the soft-region
 * mask — and both are a greyscale image that has to line up with the art. What
 * they do with the levels differs; that a colour file or a mismatched size is a
 * refusal by name does not.
 *
 * `purpose` only spells the messages. It is not a mode: the checks are the same
 * either way, and a reader has to be told which of their inputs is at fault.
 */
function readGreySheet(
  image: string,
  purpose: 'depth' | 'soft',
  partWidth: number,
  partHeight: number,
  where: string,
  ctx: AttachmentContext,
): { map: DepthMap; cover: Uint8Array; opaqueEverywhere: boolean } {
  const noun = purpose === 'depth' ? 'depth map' : 'soft mask';
  if (typeof image !== 'string' || image.length === 0) {
    throw new CompileError(`${where}: the "${purpose}" block has no image to read`);
  }
  const path = join(ctx.imagesDir, image);
  if (!existsSync(path)) {
    throw new CompileError(`${where}: the ${noun} "${image}" is not at ${relative(process.cwd(), path)}`);
  }
  const sheet = readPlate(path);
  if (sheet.width !== partWidth || sheet.height !== partHeight) {
    throw new CompileError(
      `${where}: the ${noun} "${image}" is ${sheet.width}x${sheet.height} and the part is ` +
        `${partWidth}x${partHeight}. It is sampled in the part's own pixel grid, so the two are the same size — ` +
        'resample the sheet, or point at the one that was made for this part.',
    );
  }
  // One channel, proved rather than assumed.
  const level = new Uint8Array(partWidth * partHeight);
  const cover = new Uint8Array(partWidth * partHeight);
  let opaqueEverywhere = true;
  for (let i = 0; i < level.length; i++) {
    const r = sheet.data[i * 4];
    const g = sheet.data[i * 4 + 1];
    const b = sheet.data[i * 4 + 2];
    if (r !== g || g !== b) {
      throw new CompileError(
        `${where}: the ${noun} "${image}" is not greyscale — pixel (${i % partWidth}, ${Math.floor(i / partWidth)}) ` +
          `is rgb(${r}, ${g}, ${b}). It is one channel; reading red out of a colour file would use whatever that ` +
          'channel happened to hold.',
      );
    }
    level[i] = r;
    const a = sheet.data[i * 4 + 3];
    cover[i] = a;
    if (a !== 255) opaqueEverywhere = false;
  }
  return { map: { width: partWidth, height: partHeight, level }, cover, opaqueEverywhere };
}

/**
 * Read a soft-region mask and turn it into mesh weights on a second bone.
 *
 * ⭐ The level IS the weight — black still, white carried — sampled at each
 * vertex with the same bilinear the depth map uses, so a painted falloff
 * reaches the mesh as a painted falloff. The remainder always stays on the slot
 * bone, so every vertex closes at 1 by construction rather than by A20 catching
 * it later.
 *
 * 🚨 This was a DEPTH THRESHOLD for one day and that was wrong: softness and
 * prominence are different properties, the most prominent thing on a face is
 * the nose, and a nose does not wobble. See `RigSoftRegion` for the whole of
 * that correction.
 */
function softRegionWeights(
  spec: RigSoftRegion,
  points: ReadonlyArray<readonly [number, number]>,
  partWidth: number,
  partHeight: number,
  where: string,
  ctx: AttachmentContext,
): { weights: MeshVertexWeight[][]; bone: string; mask: string; digest: string; carried: number; ramped: number } {
  const { bone } = spec;
  if (typeof bone !== 'string' || bone.length === 0) {
    throw new CompileError(`${where}: the "soft" block has no "bone"; it is the bone the soft region is carried by`);
  }
  if (!ctx.bones.some((b) => b.name === bone)) {
    throw new CompileError(
      `${where}: "soft" names bone "${bone}", which this rig does not declare. rigc binds a region to a bone that ` +
        'already exists rather than creating one — a bone a physics constraint has to target is part of the ' +
        'skeleton, not a side effect of a mesh.',
    );
  }
  if (bone === ctx.anchorBone) {
    throw new CompileError(
      `${where}: "soft" names "${bone}", which is this slot's own bone. Carrying the region with the bone the rest ` +
        'of the mesh is already pinned to moves nothing — a soft region needs a bone that can move independently, ' +
        'which is what a physics constraint is put on.',
    );
  }
  const { map: sheet } = readGreySheet(spec.mask, 'soft', partWidth, partHeight, where, ctx);
  let carried = 0;
  let ramped = 0;
  const weights = points.map(([x, y]) => {
    const w = sampleLevel(sheet, x, y) / 255;
    if (w >= 1) carried++;
    else if (w > 0) ramped++;
    if (w <= 0) return [{ bone: 'anchor', weight: 1 }] as MeshVertexWeight[];
    if (w >= 1) return [{ bone: 'control', control: 0, weight: 1 }] as MeshVertexWeight[];
    return [
      { bone: 'anchor', weight: 1 - w },
      { bone: 'control', control: 0, weight: w },
    ] as MeshVertexWeight[];
  });
  if (carried === 0 && ramped === 0) {
    throw new CompileError(
      `${where}: the soft mask "${spec.mask}" carries no vertex of this mesh — every one of its ${points.length} ` +
        'vertices samples black. A region that moves nothing is a physics constraint with nothing on the end of it; ' +
        'check that the mask is painted where the mesh actually is, and that it is white where the art is soft.',
    );
  }
  return { weights, bone, mask: spec.mask, digest: depthDigest(sheet), carried, ramped };
}

/**
 * Build a `grid` mesh: a lattice over the part window, at stated positions.
 *
 * It shares `contour`'s placement and weighting exactly — the window is the
 * PNG's own size, the mesh is centred on its slot bone, and every vertex is
 * pinned to that bone at weight 1 — and differs only in where the vertices go.
 * The two are kept as separate functions rather than one with a branch because
 * what they measure is different: a contour asks the art where its edge is and
 * reports how well it covered it, and a grid asks nothing of the art at all.
 *
 * ⭐ Why this exists at all: the lattice was being written BY HAND. The worked
 * portrait shipped 25 vertex pairs, 32 triangles and a perimeter numbered in
 * the one order the loader accepts — all of it a person's arithmetic, on the
 * one topology whose correctness is least visible. A hand-numbered hull that
 * lists an interior vertex first loads, draws and deforms wrong.
 */
function buildGridAttachment(
  att: RigMeshAttachment,
  generator: Extract<NonNullable<RigMeshAttachment['generator']>, { kind: 'grid' }>,
  placeholder: string,
  where: string,
  ctx: AttachmentContext,
): SpineMeshAttachment {
  if (att.image === undefined) {
    throw new CompileError(
      `${where}: a "grid" generator lays its lattice over the part's own window, so the attachment needs an ` +
        '"image" — there is nothing else here that says how big that window is',
    );
  }
  const stated = generator.us !== undefined || generator.vs !== undefined;
  const even = generator.cols !== undefined || generator.rows !== undefined;
  if (stated && even) {
    throw new CompileError(
      `${where}: the "grid" generator states both positions ("us"/"vs") and a count ("cols"/"rows"). They are two ` +
        'answers to where the columns go, and a spec carrying both leaves a reader unable to say which one built ' +
        'the mesh. Drop one — positions are the more precise of the two.',
    );
  }
  if (!stated && !even) {
    throw new CompileError(
      `${where}: the "grid" generator says neither where its columns go ("us"/"vs", fractions of the window) nor ` +
        'how many there are ("cols"/"rows"). A lattice is not a default.',
    );
  }
  const spread = (n: unknown, name: string): number[] => {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 2) {
      throw new CompileError(`${where}: "${name}" is ${JSON.stringify(n)}; it is a whole number of at least 2`);
    }
    // An even division spans the whole window. A lattice that should sit inside
    // it states its own positions — which is what `us`/`vs` are for.
    return Array.from({ length: n }, (_, i) => i / (n - 1));
  };
  const us = stated ? generator.us : spread(generator.cols, 'cols');
  const vs = stated ? generator.vs : spread(generator.rows, 'rows');
  if (us === undefined || vs === undefined) {
    throw new CompileError(
      `${where}: the "grid" generator states ${us === undefined ? '"vs"' : '"us"'} and not ` +
        `${us === undefined ? '"us"' : '"vs"'}; a lattice needs both axes`,
    );
  }

  const img = atlasedImage(att.image, where, ctx);
  const plate = partPlate(img);

  let geometry;
  try {
    geometry = buildGridMesh({ size: [plate.width, plate.height], us, vs });
  } catch (err) {
    if (err instanceof MeshError) throw new CompileError(`${where}: ${err.message}`);
    throw err;
  }

  const w = img.width;
  const h = img.height;
  const toArt = w / plate.width;
  if (att.width !== undefined && att.width !== w) {
    throw new CompileError(`${where}: the spec says width ${att.width} and "${att.image}" measures ${w}`);
  }
  if (att.height !== undefined && att.height !== h) {
    throw new CompileError(`${where}: the spec says height ${att.height} and "${att.image}" measures ${h}`);
  }
  const anchor = ctx.transforms.get(ctx.anchorBone);
  if (!anchor) throw new CompileError(`${where}: slot bone "${ctx.anchorBone}" has no setup transform`);
  const index = ctx.bones.findIndex((b) => b.name === ctx.anchorBone);
  if (index < 0) throw new CompileError(`${where}: slot bone "${ctx.anchorBone}" is not in the rig's bone list`);
  // Sampled BEFORE the encode, because `bind` rewrites the weights the encode
  // then writes out.
  const depth =
    generator.depth === undefined
      ? undefined
      :
        sampleMeshDepth(
          generator.depth,
          'grid',
          geometry.points,
          geometry.triangles,
          (px, py) => toBoneLocal(anchor, anchor.worldX + px * toArt - w / 2, anchor.worldY + h / 2 - py * toArt),
          plateAlpha(plate),
          plate.width,
          plate.height,
          where,
          ctx,
        );
  const bound =
    generator.soft === undefined
      ? undefined
      : softRegionWeights(generator.soft, geometry.points, plate.width, plate.height, where, ctx);
  if (bound) geometry = { ...geometry, weights: bound.weights };
  const vertices = encodeWeightedVertices(
    geometry,
    (px, py) => [r6(anchor.worldX + px * toArt - w / 2), r6(anchor.worldY + h / 2 - py * toArt)],
    {
      anchor: { index, toBind: (wx, wy) => toBoneLocal(anchor, wx, wy) },
      controls: bound ? [meshBoneRef(bound.bone, where, ctx)] : [],
    },
  );
  ctx.meshBones.add(ctx.anchorBone);
  if (bound) ctx.meshBones.add(bound.bone);
  if (depth !== undefined) ctx.depths.set(`${ctx.skinName}/${ctx.slotName}/${placeholder}`, depth.z);
  ctx.meshes.push({
    slot: ctx.slotName,
    kind: 'grid',
    attachments: [placeholder],
    vertices: geometry.uvs.length / 2,
    triangles: geometry.triangles.length / 3,
    bones: bound ? [ctx.anchorBone, bound.bone] : [ctx.anchorBone],
    depth: depth?.summary,
    soft:
      bound === undefined
        ? undefined
        : { mask: bound.mask, digest: bound.digest, bone: bound.bone, carried: bound.carried, ramped: bound.ramped },
  });
  const out: SpineMeshAttachment = {
    type: 'mesh',
    uvs: geometry.uvs,
    triangles: geometry.triangles,
    vertices,
    ...generatedHullAndEdges(geometry, where),
    width: r6(w),
    height: r6(h),
  };
  const path = attachmentPath(att, placeholder);
  if (path !== undefined) out.path = path;
  if (att.color !== undefined) out.color = att.color;
  return out;
}

/** Defaults for the `contour` generator's optional parameters, stated once. */
const CONTOUR_DEFAULTS = { margin: 1, maxVertices: 64, alpha: 1 } as const;

/**
 * Build a `contour` mesh: measure the attachment's own PNG, trace it, mesh it.
 *
 * ## Why this branch does not share the one above
 *
 * A `ring` or a `ribbon` takes its window size from the spec and its authority
 * from control bones. A contour takes both from the art: the size is the PNG's
 * own (so there is no number to disagree with the pixels), and there are no
 * control bones at all, because every vertex is pinned to the slot bone —
 * `buildContourMesh`'s header says why that is the whole weighting model.
 *
 * ⚠️ It reads PIXELS, which nothing else in this compiler does. `src/png.ts`
 * deliberately stops at the header, so the decode comes from
 * [`tools/plate.ts`](../tools/plate.ts) — the same codec `render` and `check`
 * already sample pages with, so "what alpha does this file have" has one answer
 * in this repository rather than two.
 *
 * The placement is the one the generator path documents: no manifest means no
 * crop to flip against, so the part window is centred on its own slot bone —
 * which is also what puts an undeformed contour mesh exactly where the plain
 * region attachment would have drawn it.
 */
function buildContourAttachment(
  att: RigMeshAttachment,
  generator: Extract<NonNullable<RigMeshAttachment['generator']>, { kind: 'contour' }>,
  placeholder: string,
  where: string,
  ctx: AttachmentContext,
): SpineMeshAttachment {
  if (att.image === undefined) {
    throw new CompileError(
      `${where}: a "contour" generator traces the part's own alpha, so the attachment needs an "image" — ` +
        'there is nothing else here that says which pixels to measure',
    );
  }
  const img = atlasedImage(att.image, where, ctx);
  // ⚠️ Nothing here reads the PNG's colour type. `hasAlpha` answers "where does
  // this file keep its alpha", not "is any pixel of it transparent" — a tRNS
  // chunk is real transparency (issue #215) and an all-255 alpha channel is
  // none — so "this part has no silhouette to trace" is a question about pixels,
  // and `buildContourMesh` refuses it by counting them.
  const plate = partPlate(img);
  const alpha = plateAlpha(plate);

  const margin = generator.margin ?? CONTOUR_DEFAULTS.margin;
  const maxVertices = generator.maxVertices ?? CONTOUR_DEFAULTS.maxVertices;
  const threshold = generator.alpha ?? CONTOUR_DEFAULTS.alpha;
  let geometry;
  try {
    geometry = buildContourMesh({
      mask: { width: plate.width, height: plate.height, alpha },
      threshold,
      tolerance: generator.tolerance,
      margin,
      maxVertices,
    });
  } catch (err) {
    if (err instanceof MeshError) throw new CompileError(`${where}: ${err.message}`);
    throw err;
  }

  // Two grids, and they are the same one except on an imported page that
  // declares a `scale:`. The trace happens on the pixels that exist — the
  // plate's — and the mapping into world units below is the DRAWING's, which is
  // what `img.width/height` are (`resolveFromAtlas`). Keeping them apart is what
  // stops a contour mesh and a plain region attachment of the same imported art
  // from landing in different units (#267); on the loose path and on any pack at
  // `scale: 1` the two are equal and `toArt` is 1, so nothing moves.
  const w = img.width;
  const h = img.height;
  const toArt = w / plate.width;
  if (att.width !== undefined && att.width !== w) {
    throw new CompileError(`${where}: the spec says width ${att.width} and "${att.image}" measures ${w}`);
  }
  if (att.height !== undefined && att.height !== h) {
    throw new CompileError(`${where}: the spec says height ${att.height} and "${att.image}" measures ${h}`);
  }
  const anchor = ctx.transforms.get(ctx.anchorBone);
  if (!anchor) throw new CompileError(`${where}: slot bone "${ctx.anchorBone}" has no setup transform`);
  const index = ctx.bones.findIndex((b) => b.name === ctx.anchorBone);
  if (index < 0) throw new CompileError(`${where}: slot bone "${ctx.anchorBone}" is not in the rig's bone list`);
  const vertices = encodeWeightedVertices(
    geometry,
    (px, py) => [r6(anchor.worldX + px * toArt - w / 2), r6(anchor.worldY + h / 2 - py * toArt)],
    { anchor: { index, toBind: (wx, wy) => toBoneLocal(anchor, wx, wy) }, controls: [] },
  );
  ctx.meshBones.add(ctx.anchorBone);
  // The depth map is sampled on the TRACED grid — the plate's — because that is
  // the grid the vertices are in. `toArt` scales positions into world units
  // afterwards and does not touch `z`, which carries its own stated scale.
  const depth =
    generator.depth === undefined
      ? undefined
      :
        sampleMeshDepth(
          generator.depth,
          'contour',
          geometry.points,
          geometry.triangles,
          (px, py) => toBoneLocal(anchor, anchor.worldX + px * toArt - w / 2, anchor.worldY + h / 2 - py * toArt),
          alpha,
          plate.width,
          plate.height,
          where,
          ctx,
        );
  if (depth !== undefined) ctx.depths.set(`${ctx.skinName}/${ctx.slotName}/${placeholder}`, depth.z);
  ctx.meshes.push({
    slot: ctx.slotName,
    kind: 'contour',
    attachments: [placeholder],
    vertices: geometry.uvs.length / 2,
    triangles: geometry.triangles.length / 3,
    bones: [ctx.anchorBone],
    coverage: geometry.contour?.coverage,
    overshoot: geometry.contour?.overshoot,
    holePixels: geometry.contour?.holePixels,
    depth: depth?.summary,
  });
  const out: SpineMeshAttachment = {
    type: 'mesh',
    uvs: geometry.uvs,
    triangles: geometry.triangles,
    vertices,
    ...generatedHullAndEdges(geometry, where),
    width: r6(w),
    height: r6(h),
  };
  // Same rule a region attachment follows: the atlas region is the PNG's
  // basename, so a placeholder named anything else needs `path` written down or
  // the loader resolves nothing. Stated once in `attachmentPath` since #577 —
  // this comment used to be the rule's only statement, beside four emit sites
  // that disagreed with it.
  const path = attachmentPath(att, placeholder);
  if (path !== undefined) out.path = path;
  if (att.color !== undefined) out.color = att.color;
  return out;
}

// ---------------------------------------------------------------------------
// rig-declared constraints
// ---------------------------------------------------------------------------

/** The rig-constraint shape as this file consumes it: a name, a type, and fields. */
type RigConstraintInput = { name: string; type: string } & Record<string, unknown>;

/** The six property names a transform constraint may map between (`:241`, `:521`). */
const TRANSFORM_PROPERTIES = ['rotate', 'x', 'y', 'scaleX', 'scaleY', 'shearY'];

/**
 * How far past a boundary an end of a `rotate` slider's driving range may sit
 * before the refusal below fires, in degrees.
 *
 * ⭐ **Outward at both ends**, which is the whole reason it is named: 0° and 360°
 * are the two values an author of a face axis or a full-circle dial actually aims
 * at, and `from − to / scale` is three authored numbers and a division, so an
 * intended 0° can arrive as `-1e-13` and an intended 360° as `360.0000000001`.
 * The slack exists so arithmetic noise around either aim is not a refusal.
 *
 * Nothing is tuned. The failure it separates from is gross: a wrapped reading
 * moves the applied time by `360 · scale`.
 */
const SLIDER_WRAP_SLACK = 1e-6;

/** What a constraint's names resolve against. */
interface ConstraintContext {
  boneNames: Set<string>;
  slotNames: Set<string>;
  /** slot -> the skins whose table gives that slot a path attachment. */
  pathSlots: Map<string, string[]>;
  /** Animations the motion spec declares — a slider names one of them. */
  animationNames: Set<string>;
  /**
   * The duration each of those declares, which is what turns a slider's
   * `from`/`to`/`scale` into the range of driving values that can reach a frame.
   * Only the slider's 360° refusal reads it.
   */
  animationDurations: Map<string, number>;
}

/**
 * 4.3 puts every constraint in one array and branches on `type`. An entry whose
 * type matches no case is dropped with no error and no `default:` branch, so an
 * unimplemented type is refused here by name rather than emitted and lost.
 */
function buildRigConstraint(spec: RigConstraintInput, ctx: ConstraintContext): SpineConstraint {
  const where = `rig constraint "${spec.name}"`;
  const boneNames = ctx.boneNames;
  const needBone = (name: unknown, field: string): string => {
    if (typeof name !== 'string' || !boneNames.has(name)) {
      throw new CompileError(`${where}: ${field} names ${JSON.stringify(name)}, which the rig does not declare as a bone`);
    }
    return name;
  };
  /**
   * One of the enum names the parser's `Utils.enumValue` can resolve.
   *
   * The rule is exactly `enumValue`'s own: only the first letter's case is free,
   * because that is the single character it normalises. Anything else resolves to
   * `undefined` and is assigned without a word, and the constraint then runs a
   * mode nobody chose — see `RIG_PATH_POSITION_MODES`.
   */
  const needEnum = (value: unknown, field: string, allowed: readonly string[]): string => {
    if (typeof value !== 'string' || !allowed.includes(value.charAt(0).toUpperCase() + value.slice(1))) {
      throw new CompileError(
        `${where}: ${field} is ${JSON.stringify(value)}; known: ${allowed.join(', ')} (only the first letter's case is ` +
          "free — the parser's enumValue uppercases that one character and nothing else, and an unresolved name " +
          'becomes undefined without an error)',
      );
    }
    return value;
  };
  const needNumber = (value: unknown, field: string): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new CompileError(`${where}: ${field} is ${JSON.stringify(value)}, which is not a finite number`);
    }
    return value;
  };
  const out: SpineConstraint = { name: spec.name, type: spec.type };
  const copy = (fields: readonly string[]) => {
    for (const field of fields) {
      const v = spec[field];
      if (v !== undefined) out[field] = typeof v === 'number' ? r6(v) : v;
    }
  };
  const boneList = (): string[] => {
    const list = spec.bones;
    if (!Array.isArray(list) || list.length === 0) {
      throw new CompileError(`${where}: a ${spec.type} constraint needs a non-empty "bones" array`);
    }
    return list.map((name, i) => needBone(name, `bones[${i}]`));
  };

  if (spec.type === 'ik') {
    out.bones = boneList();
    out.target = needBone(spec.target, 'target');
    // `scaleY` is the `ScaleYMode` enum, not a number or a flag: the parser runs
    // it through `Utils.enumValue` (`:150`), which resolves an unknown name to
    // `undefined` and assigns it without a word. Out of `copy` for that reason —
    // see `RIG_SCALE_Y_MODES`.
    if (spec.scaleY !== undefined) out.scaleY = needEnum(spec.scaleY, 'scaleY', RIG_SCALE_Y_MODES);
    copy(['mix', 'softness', 'bendPositive', 'compress', 'stretch', 'skin']);
    return out;
  }
  if (spec.type === 'transform') {
    out.bones = boneList();
    out.source = needBone(spec.source, 'source');
    const properties = spec.properties as Record<string, { to?: Record<string, unknown> }> | undefined;
    for (const [from, entry] of Object.entries(properties ?? {})) {
      // The parser THROWS on a name outside the six, which is one of the few
      // places in this format that does not fail silently — but it throws at load
      // time, in the consumer's process, and that is late.
      if (!TRANSFORM_PROPERTIES.includes(from)) {
        throw new CompileError(`${where}: properties has "${from}"; known: ${TRANSFORM_PROPERTIES.join(', ')}`);
      }
      for (const to of Object.keys(entry?.to ?? {})) {
        if (!TRANSFORM_PROPERTIES.includes(to)) {
          throw new CompileError(`${where}: properties.${from}.to has "${to}"; known: ${TRANSFORM_PROPERTIES.join(', ')}`);
        }
      }
    }
    if (properties !== undefined) out.properties = properties;
    copy([
      'localSource',
      'localTarget',
      'additive',
      'clamp',
      'rotation',
      'x',
      'y',
      'scaleX',
      'scaleY',
      'shearY',
      'mixRotate',
      'mixX',
      'mixY',
      'mixScaleX',
      'mixScaleY',
      'mixShearY',
      'skin',
    ]);
    return out;
  }
  if (spec.type === 'path') {
    out.bones = boneList();
    // The parser throws `Couldn't find slot X for path constraint Y` on a miss —
    // loud, but in the consumer's process. The silent half is the one below it.
    const slot = spec.slot;
    if (typeof slot !== 'string' || !ctx.slotNames.has(slot)) {
      throw new CompileError(`${where}: slot names ${JSON.stringify(slot)}, which the rig does not declare as a slot`);
    }
    if (!ctx.pathSlots.has(slot)) {
      // `PathConstraint.update` opens with
      // `if (!(attachment instanceof PathAttachment)) return`, so a constraint
      // aimed at a slot that never shows a path does nothing whatsoever — no
      // error, no warning, and every mix in the file still says it is on.
      throw new CompileError(
        `${where}: slot "${slot}" has no path attachment in any skin, so the constraint has no curve to follow — ` +
          'PathConstraint.update returns immediately unless the slot\'s attachment is a path, which means this ' +
          'constraint would load, report every mix it was given, and move nothing. ' +
          'Give that slot an attachment with "type": "path".',
      );
    }
    out.slot = slot;
    for (const [field, allowed] of [
      ['positionMode', RIG_PATH_POSITION_MODES],
      ['spacingMode', RIG_PATH_SPACING_MODES],
      ['rotateMode', RIG_PATH_ROTATE_MODES],
    ] as const) {
      if (spec[field] !== undefined) out[field] = needEnum(spec[field], field, allowed);
    }
    for (const field of ['rotation', 'position', 'spacing', 'mixRotate', 'mixX', 'mixY'] as const) {
      if (spec[field] !== undefined) out[field] = r6(needNumber(spec[field], field));
    }
    copy(['skin']);
    return out;
  }
  if (spec.type === 'slider') {
    // ⭐ The one field in a rig spec that points at the MOTION spec. It is
    // resolved in a second pass over the constraints array once the animations
    // are read (`:495-507`) and a miss throws `Slider animation not found`, so
    // the refusal here is what turns that into a message naming both files.
    const animation = spec.animation;
    if (typeof animation !== 'string' || animation.length === 0) {
      throw new CompileError(
        `${where}: a slider needs an "animation" — the animation it applies. Without one the parser's second pass ` +
          'over the constraints array throws `Slider animation not found`.',
      );
    }
    if (!ctx.animationNames.has(animation)) {
      const known = [...ctx.animationNames];
      throw new CompileError(
        `${where}: applies animation "${animation}", which the motion spec does not declare` +
          (known.length ? ` (it declares: ${known.join(', ')})` : ' (it declares none at all)'),
      );
    }
    out.animation = animation;
    for (const field of ['additive', 'loop'] as const) {
      if (spec[field] !== undefined) out[field] = spec[field];
    }
    if (spec.mix !== undefined) out.mix = r6(needNumber(spec.mix, 'mix'));
    // `bone` is the switch between the two models, so the fields of the model
    // that was NOT chosen are refused rather than emitted: the parser reads
    // `time` only in the `else` branch and the property fields only in the `if`,
    // so the losing half is data no runtime will ever look at.
    const timeSide = ['time'] as const;
    const boneSide = ['property', 'from', 'to', 'scale', 'max', 'local'] as const;
    if (spec.bone !== undefined) {
      out.bone = needBone(spec.bone, 'bone');
      const property = spec.property;
      if (typeof property !== 'string' || !RIG_FROM_PROPERTIES.includes(property as (typeof RIG_FROM_PROPERTIES)[number])) {
        throw new CompileError(
          `${where}: drives off bone "${String(spec.bone)}" but its property is ${JSON.stringify(property)}; ` +
            `known: ${RIG_FROM_PROPERTIES.join(', ')} (the parser throws on anything else)`,
        );
      }
      out.property = property;
      for (const field of ['from', 'to', 'scale', 'max'] as const) {
        if (spec[field] !== undefined) out[field] = r6(needNumber(spec[field], field));
      }
      if (spec.local !== undefined) out.local = spec.local;
      if (spec.scale !== undefined && spec.scale === 0) {
        // time = to + (value - from) * 0, so the slider holds one frame forever.
        throw new CompileError(`${where}: scale is 0, so the bone's property cannot move the slider's time at all`);
      }
      // The window of driving values that can reach a frame at all, and the two
      // functions every figure in the two reader clauses below comes off.
      //
      // ⭐ **One copy, read by both readers** (issue #657). The circle owned
      // this arithmetic while it was the only reader with a bound; the world
      // `scale` readers have a floor at 0 and the same mapping carries them
      // there, so the second clause reads these numbers instead of computing its
      // own. That is the rule this clause has already paid for twice — #417
      // tested one end because its fixture only left the circle at that end, and
      // #431 wrapped by one subtraction because every fixture sat within a turn
      // — and a second copy with a sign edited is exactly the shape both took.
      const fromValue = spec.from === undefined ? 0 : needNumber(spec.from, 'from');
      const toTime = spec.to === undefined ? 0 : needNumber(spec.to, 'to');
      const perUnit = spec.scale === undefined ? 1 : needNumber(spec.scale, 'scale');
      const duration = ctx.animationDurations.get(animation) ?? 0;
      /** The driving value that maps to the animation's first frame, and to its last. */
      const atStart = fromValue - toTime / perUnit;
      const atEnd = fromValue + (duration - toTime) / perUnit;
      const lowest = Math.min(atStart, atEnd);
      const highest = Math.max(atStart, atEnd);
      /**
       * The time this mapping puts a driving value at, before the runtime
       * touches it — the one arithmetic every figure below comes off.
       *
       * ⚠️ **Computed, not asserted** (issue #423). The circle's clause used to
       * end *"— outside the animation's Ds. With `loop`: false that is
       * `Math.max(0, time)` holding the last frame; with `loop`: true it wraps
       * to some other frame"*, which states a consequence rather than measuring
       * one — and is flatly false for a range spanning a full turn, where the
       * wrapped reading lands INSIDE the animation. It also printed both loop
       * modes and left the reader to pick. A message that hedges is a message
       * that has not measured.
       */
      const timeAt = (value: number): number => toTime + (value - fromValue) * perUnit;
      /** That time clamped into the animation — the frame a pose actually holds. */
      const intoFrame = (time: number): number => Math.min(Math.max(time, 0), duration);
      // ⚠️ `local: false` reads the bone's WORLD rotation, and `FromRotate.value`
      // (`TransformConstraintData.js`) ends
      //
      //   let value = Math.atan2(source.c / sy, source.a / sx) * radDeg + …;
      //   if (value < 0) value += 360;
      //
      // `Math.atan2` returns `(-180, 180]` and the `offsets` a slider hands that
      // reader are `Slider.offsets`, a private all-zero array — so **`[0, 360)`
      // is the whole of what it can ever produce**. A driving value outside that
      // is one the runtime never returns: it arrives 360° away, and
      // `time = to + (value - from) * scale` then lands far outside the
      // animation. A yaw axis with its neutral at 0° — the natural way to author
      // a face — therefore has its entire negative half pinned to one frame, and
      // nothing anywhere says so (issue #402).
      //
      // ⭐ Refused here rather than documented, and rather than left to the gate,
      // for three reasons. The failure is invisible AND total, so a note in a
      // guide is read after the loss rather than before it. The fix is one field
      // in the rig spec, which is the file this message can name — an artifact
      // -side assertion would have to name the emitted `local`/`offset` fields the
      // author never typed. And the arithmetic that proves it needs the
      // animation's declared DURATION, which is a motion-spec fact the compiler
      // has in front of it: the range of driving values that can reach a frame is
      // exactly `[to, to + duration]` mapped back through `scale`.
      //
      // ⚠️ **Both ends, out of one piece of arithmetic** (issue #417). As #405
      // landed it, `highest` was computed and never tested, so a range running
      // PAST 360° — `"from": 300, "scale": 0.005` over a 1 s animation asks for
      // 300°..500° — compiled clean with everything above 360° just as dead: turn
      // the bone to 500° and its world rotation is 140°, read as 140°, mapped to
      // a time nowhere near the one the author meant. A copy-pasted second branch
      // with a sign edited is how such a pair drifts apart, so the two ends share
      // `dead` below and every number in the message comes off it.
      //
      // ⭐ **And the line is PAST 360°, not at it** — measured before it was
      // written, because the two are one degree of arc apart and only one of them
      // costs an author anything. A range ending exactly on 360° misses exactly
      // one value, its own supremum, and that value is not a dial position: a
      // bone at 360° IS a bone at 0°, reads within 5.3e-6° of it and poses the
      // skeleton identically. Swept through spine-core over 0°..360° at 0.1°, a
      // `from: 0, scale: 0.0025` dial on a 0.9 s animation lands every reading
      // within **1.7e-8 s** of the time the mapping asks for, and on `loop: true`
      // the endpoint is not even distinct — the circle closes on 0.900000 s
      // exactly. Above 360° the dead set has width instead: 300°..500° reaches
      // only 0.000 s..0.2995 s of its own 1 s animation, and the dial positions
      // an author would set for the top 140° of it are read as something else and
      // land on a wrong frame. That silent wrong answer is the hazard, and it
      // starts strictly above 360.
      //
      // The refusal is deliberately narrow: `rotate` only, because `FromRotate` is
      // the one property whose reader wraps, and only when the range actually
      // runs outside `[0, 360]`, because a dial inside that circle — 20°..340°,
      // or the whole turn 0°..360° — is how you write this axis under
      // `local: false` and it works.
      if (property === 'rotate' && spec.local !== true) {
        // Which end of the circle the range leaves. One record, so the end, its
        // reading, the time it lands on and the two clauses that name the side
        // are derived once rather than twice.
        //
        // The two tests ARE each other's mirror, and that is deliberate: each
        // gives its own boundary — 0° and 360°, the two values an author aims at
        // — the same outward slack, so only a range that genuinely leaves the
        // closed circle `[0, 360]` is refused.
        const dead =
          lowest < -SLIDER_WRAP_SLACK
            ? {
                end: lowest,
                side: 'below 0°',
                repair: 'move the range so it does not cross 0°',
              }
            : highest > 360 + SLIDER_WRAP_SLACK
              ? {
                  end: highest,
                  side: 'past 360°',
                  repair: 'move the range so it does not run past 360°',
                }
              : null;
        if (dead !== null) {
          /**
           * What `FromRotate.value` actually returns for a bone at that end: a
           * MODULO, not one subtraction (issue #431).
           *
           * 🚨 `lowest + 360` / `highest - 360` is right only while the range
           * stays within one turn of the circle, which every fixture in this
           * tree happened to be. Further out it printed a number the reader
           * cannot return, inside a refusal whose entire subject is which
           * readings the reader CAN return: `from: -500, scale: 0.005` over a
           * 1 s animation said *"the bone at -500.000° is read as -140.000° and
           * maps to time 1.800s"*, and -140° is not in `[0, 360)` at all. Both
           * figures in that sentence were wrong. Measured through spine-core,
           * a bone parked at -500° drives `Slider.appliedPose.time` to
           * 3.600000s — the same six decimals a bone parked at 220° drives it
           * to — so the reading is 220° and the time is 3.600s.
           *
           * ⭐ Derived off `dead.end` rather than inside the two branches, so
           * the wrap is written ONCE. That is what #424 collapsed the two ends
           * into one record for, and a second copy of `% 360` with a sign
           * edited is how the pair drifts apart again.
           *
           * ⚠️ The consequence clause below does NOT go through here and does
           * not need to: `reachLo`/`reachHi` intersect the driving window with
           * `[0, 360)` directly, which is the same set however many turns out
           * the window sits. Swept through spine-core at 0.1° over the whole
           * circle on both a beyond-a-turn low range (-500°..-300°) and a
           * beyond-`+720°` high one (100°..900°), the held fraction and the
           * frame the held arc pins to are the ones this clause names — 100.0%
           * at 1.000s and 27.8% at 0.000s — and the runtime's own applied time
           * tracks the closed form to 3.3e-8s.
           */
          const readAs = ((dead.end % 360) + 360) % 360;
          const lands = timeAt(readAs);
          // `[0, 360)` is the whole of what `FromRotate.value` returns (issue
          // #417), so the readings that reach the animation at all are that
          // circle met with the driving window `lowest`..`highest` the range
          // clause above already prints. A second derivation beside these two
          // numbers is exactly how a pair drifts, which is why #417 collapsed
          // the two ends into one `dead` record in the first place.
          const reachLo = Math.max(0, lowest);
          const reachHi = Math.min(360, highest);
          const reaches = reachLo <= reachHi;
          const reachA = intoFrame(timeAt(reachLo));
          const reachB = intoFrame(timeAt(reachHi));
          const span = `${Math.min(reachA, reachB).toFixed(3)}s..${Math.max(reachA, reachB).toFixed(3)}s`;
          // ⭐ Exactly ONE arc of the circle is ever left over, and that is what
          // lets the message name one bound and one frame instead of a set: the
          // refusal means `[lowest, highest]` already runs off one end of
          // `[0, 360)`, so the part of the circle outside it is a single run.
          // (Both ends outside means the whole circle reaches — `dead` is 0° wide
          // — and neither end outside is not a refusal at all.)
          const dark = reaches ? 360 - (reachHi - reachLo) : 360;
          const heldAt = intoFrame(timeAt(reachLo > 0 ? 0 : 360));
          const arc = !reaches
            ? 'every reading'
            : reachLo > 0
              ? `every reading below ${reachLo.toFixed(3)}°`
              : `every reading above ${reachHi.toFixed(3)}°`;
          /**
           * How much of the range is a bone position no reader ever returns:
           * the WIDTH of `[lowest, highest]` lying outside `[0, 360]` (issue
           * #434).
           *
           * 🚨 `-lowest` / `highest - 360` is the distance from the boundary to
           * the FAR end, and that equals the dead width only while the range
           * STRADDLES the boundary. A range lying wholly outside had the gap
           * between the boundary and its NEAR end counted too: `400°..500°` —
           * inside one turn and reachable today — was told `140.000°` of it is
           * dead, wider than the 100° range itself, and `-500°..-300°` was told
           * `500.000°` against a true 200°. Clamping the near end to the
           * boundary is the whole of the fix, and it moves ONLY the ranges that
           * lie wholly outside: measured, a range straddling either boundary, a
           * range ending exactly on one, and a range hanging off both at once
           * all print what they printed before. `PS45` is the two that move and
           * `PS46` is the four that must not.
           *
           * ⭐ **Third instance of one shape in this clause.** #417 tested one
           * end of the range because its fixture only ever left the circle at
           * that end; #431 wrapped by a single subtraction because every
           * fixture sat within one turn; this measured to the far end because
           * `PS42` — the only control that reads this string — straddles 360°,
           * where the two arithmetics agree to the bit. Every time, a
           * computation right about the case its fixture happened to be and
           * silent about the case beside it, with no second fixture standing
           * anywhere else to say so.
           *
           * ⭐ Why it read as a measurement rather than as a bug: the wrong
           * figure is always a number ALREADY IN THE SENTENCE. Past 360°,
           * `highest - 360` reproduces `readAs` — `400°..500°` printed the same
           * `140.000°` twice, once as the reading and once as a width. Below 0°,
           * `-lowest` reproduces `dead.end` with its sign dropped.
           *
           * ⚠️ Each term stays BEHIND the test that says its side is the one
           * that crossed, and those guards are load-bearing rather than tidy —
           * measured, not argued. Drop `lowest < 0` and the low term on
           * `400°..500°` is `Math.min(0, 500) - 400 = -400`, a negative
           * contribution to a width: the refusal prints `-300.000°`, and
           * `300°..500°` and `100°..900°` move to `-160.000°` and `440.000°`.
           * Drop `highest > 360` and `-340°..-305°` prints `-630.000°`. Neither
           * is a width, and a width is what the sentence says it is.
           */
          const outside =
            (lowest < 0 ? Math.min(0, highest) - lowest : 0) + (highest > 360 ? highest - Math.max(360, lowest) : 0);
          // ⚠️ WHICH consequence the runtime produces is the slider's own `loop`,
          // read rather than guessed: `Slider.js:63-66` is
          // `p.time = duration + (p.time % duration)` when it is true and
          // `Math.max(0, p.time)` when it is false, so a reading held on one
          // frame under the second is replayed from elsewhere under the first and
          // nothing is dead in time at all. Swept through spine-core at 0.1° over
          // the whole circle before this was written, both ways.
          const consequence =
            spec.loop === true
              ? `Nothing is held: "loop": true wraps the time as \`duration + (time % duration)\`, so the ` +
                `${outside.toFixed(3)}° of the range ${dead.side} selects nothing a reading inside the circle does ` +
                'not already select.'
              : !reaches
                ? `This dial reaches none of the animation's ${duration}s — the whole circle is held on the frame at ` +
                  `${heldAt.toFixed(3)}s.`
                : dark === 0
                  ? `This dial reaches only ${span} of the animation's ${duration}s, and no reading of the circle ` +
                    'reaches the rest of it.'
                  : `This dial reaches only ${span} of the animation's ${duration}s, and ` +
                    `${((dark / 360) * 100).toFixed(1)}% of the circle — ${arc} — is held on the frame at ` +
                    `${heldAt.toFixed(3)}s.`;
          throw new CompileError(
            `${where}: drives off bone "${String(spec.bone)}" rotate with "local": false, and the driving values ` +
              `that reach animation "${animation}" (0s..${duration}s) run from ${lowest.toFixed(3)}° to ${highest.toFixed(3)}°. ` +
              'A world rotation is read through `FromRotate.value`, which ends `if (value < 0) value += 360`, so the bone ' +
              `at ${dead.end.toFixed(3)}° is read as ${readAs.toFixed(3)}° and maps to time ${lands.toFixed(3)}s. ` +
              `${consequence} The whole part of the range ${dead.side} is dead and ` +
              'nothing at runtime reports it. Add `"local": true` to read the bone\'s own rotation signed and unwrapped — ' +
              `that is the form a face axis wants — or ${dead.repair}.`,
          );
        }
      }
      // ⚠️ `local: false` reads the bone's WORLD scale, and `FromScaleX.value`
      // / `FromScaleY.value` (`TransformConstraintData.js`) are
      //
      //   const a = source.a / skeleton.scaleX, c = source.c / skeleton.scaleY;
      //   return Math.sqrt(a * a + c * c) + offsets[TransformConstraintData.SCALEX];
      //
      // — a MAGNITUDE. The driven field is in both terms, so the reading is
      // `|value|` and `[0, ∞)` is the whole of what that reader can return. The
      // floor is REACHED rather than approached (a bone whose own scale, or
      // whose parent's, is 0 reads exactly 0), which is why a range whose bottom
      // is exactly 0 stays legal and only one that dips below it is refused.
      //
      // 🚨 **Below the floor the axis does not go dead, it FOLDS** (issue #657),
      // and that is why this is a second clause rather than the circle with
      // another property name in it. A reading the range cannot reach is one
      // frame pinned; a reading it reaches TWICE is two dial positions posing
      // the same face, so the message has to name the mirror rather than a dead
      // arc. Measured through spine-core on `from: 0, to: 0.5, scale: 0.25` over
      // a 1 s animation — driving window −2..+2 — the applied time at −2.000,
      // −1.500, −1.000 and −0.500 is 1.000000s, 0.875000s, 0.750000s and
      // 0.625000s: the same six decimals the dial at +2.000, +1.500, +1.000 and
      // +0.500 applies, with the posed bone matching to the digit. The same rig
      // read `local: true` sweeps −2 → +2 monotonically from 0.000000s, which is
      // what makes that repair worth naming.
      //
      // ⭐ **No loop branch, and that is measured rather than economised.** The
      // circle's consequence turns on `Slider.loop` because a held frame is held
      // only under `Math.max(0, time)`; a fold is not a clamp, so `loop: true`
      // cannot undo it — the same ±1.500 pair applies 1.875000s either way.
      if ((property === 'scaleX' || property === 'scaleY') && spec.local !== true && lowest < -SLIDER_WRAP_SLACK) {
        /** What the reader returns for a bone parked at the bottom of the range: the magnitude. */
        const readAs = Math.abs(lowest);
        const lands = timeAt(readAs);
        // The readings that reach the animation are `[0, ∞)` met with the
        // driving window — the circle's `reachLo`/`reachHi` with the ceiling
        // taken out, off the same two numbers the message has already printed.
        const reaches = highest >= 0;
        /**
         * How much of the range lies below the floor: the WIDTH of
         * `[lowest, highest]` under 0, not the distance to its far end.
         *
         * 🚨 `-lowest` is that distance, and the two are equal only while the
         * range STRADDLES the floor — the same trap issue #434 paid for one
         * reader over, where a range lying wholly outside was told a width wider
         * than itself. A `-6..-2` window is 4.000 below the floor and `-lowest`
         * would print 6.000, which is `readAs` again with a different name on it.
         */
        const below = Math.min(0, highest) - lowest;
        // The arc an author writes twice: the part of the range above 0 that the
        // part below 0 mirrors onto. Both ends are inside `[lowest, highest]` —
        // 0 because the range straddles it and this is the `reaches` branch, the
        // top because it is `highest` or less — so both map INTO the animation
        // and neither needs clamping.
        const mirrorTop = Math.min(highest, -lowest);
        const mirrorA = timeAt(0);
        const mirrorB = timeAt(mirrorTop);
        const consequence = reaches
          ? `${below.toFixed(3)} of the range below 0 repeats 0.000..${mirrorTop.toFixed(3)}, which is ` +
            `${Math.min(mirrorA, mirrorB).toFixed(3)}s..${Math.max(mirrorA, mirrorB).toFixed(3)}s of the animation, in reverse.`
          : `the whole ${below.toFixed(3)} of this range is below 0, so it reaches none of the animation's ${duration}s — ` +
            `every value the reader can return maps past it and the pose holds the frame at ${intoFrame(timeAt(0)).toFixed(3)}s.`;
        throw new CompileError(
          `${where}: drives off bone "${String(spec.bone)}" ${property} with "local": false, and the driving values ` +
            `that reach animation "${animation}" (0s..${duration}s) run from ${lowest.toFixed(3)} to ${highest.toFixed(3)}. ` +
            `A world scale is read through \`From${property === 'scaleX' ? 'ScaleX' : 'ScaleY'}.value\` as ` +
            `\`Math.sqrt(${property === 'scaleX' ? 'a² + c²' : 'b² + d²'})\`, a magnitude, so the bone at ` +
            `${lowest.toFixed(3)} is read as ${readAs.toFixed(3)} and maps to time ${lands.toFixed(3)}s — the time the ` +
            `bone at ${readAs.toFixed(3)} maps to. Positions below 0 read as the mirror of positions above it: ` +
            `${consequence} Nothing at runtime reports it. Add \`"local": true\` to read the bone's own scale signed and ` +
            'unfolded — that is the form a squash axis wants — or move the range so it does not dip below 0.',
        );
      }
      for (const field of timeSide) {
        if (spec[field] !== undefined) {
          throw new CompileError(
            `${where}: declares both a "bone" and "${field}". A slider with a bone takes its time from that bone's ` +
              `property; "${field}" is read only by the bone-less form (\`:361\`), so it would be dropped in silence.`,
          );
        }
      }
    } else {
      if (spec.time !== undefined) out.time = r6(needNumber(spec.time, 'time'));
      for (const field of boneSide) {
        if (spec[field] !== undefined) {
          throw new CompileError(
            `${where}: declares "${field}" but no "bone". Every one of ${boneSide.join('/')} is read only inside the ` +
              "parser's `if (boneName)` branch (`:350-360`), so it would be dropped in silence. Name the driving bone, " +
              'or key `slider.<name>.time` in the motion spec instead.',
          );
        }
      }
    }
    copy(['skin']);
    return out;
  }
  if (spec.type === 'physics') {
    out.bone = needBone(spec.bone, 'bone');
    // The same `ScaleYMode` enum an ik constraint carries, under the same key
    // and through the same silent `Utils.enumValue` (`:301`).
    if (spec.scaleY !== undefined) out.scaleY = needEnum(spec.scaleY, 'scaleY', RIG_SCALE_Y_MODES);
    copy([
      'x',
      'y',
      'rotate',
      'scaleX',
      'shearX',
      'limit',
      'fps',
      'inertia',
      'strength',
      'damping',
      'mass',
      'wind',
      'gravity',
      'mix',
      'inertiaGlobal',
      'strengthGlobal',
      'dampingGlobal',
      'massGlobal',
      'windGlobal',
      'gravityGlobal',
      'mixGlobal',
      'skin',
    ]);
    return out;
  }
  // Every type 4.3 has is implemented, so this is now only reachable from a typo
  // — and a typo is exactly what the parser drops in silence (no `default:`
  // branch, `:148-367`), which is why the refusal stays.
  throw new NotImplementedError(
    `${where}: constraint type ${JSON.stringify(spec.type)} is not one Spine 4.3 knows. ` +
      'The five are: ik, transform, path, physics, slider. An unrecognised type matches no case in the parser and ' +
      'the constraint is dropped without a word.',
  );
}

/**
 * Collect what the artifact cannot say about itself.
 *
 * Nothing in skeleton JSON records that a mesh is a ribbon, that a bone's
 * subtree is authored in axis space, or that one parentage is forbidden. Those
 * are rig facts, so the compiler hands them to the validator instead of letting
 * it guess — and a mutant stays honest because it edits the artifact while this
 * block keeps saying what the rig was supposed to be.
 */
function buildRigInfo(
  rig: RigSpec,
  bones: SpineBone[],
  meshes: CompileResult['meshes'],
  manifest: FaceManifest | null,
): RigInfo {
  const axisBone = rig.invariants?.axisBone ?? null;
  if (axisBone !== null && !bones.some((b) => b.name === axisBone)) {
    throw new CompileError(`rig "${rig.name}" names "${axisBone}" as its axis bone, which it does not declare`);
  }
  const axisSubtree: string[] = [];
  if (axisBone) {
    const parentOf = new Map(bones.map((b) => [b.name, b.parent ?? null]));
    for (const bone of bones) {
      for (let cursor: string | null = bone.name; cursor; cursor = parentOf.get(cursor) ?? null) {
        if (cursor !== axisBone) continue;
        axisSubtree.push(bone.name);
        break;
      }
    }
  }
  const meshKinds: RigInfo['meshKinds'] = {};
  for (const mesh of meshes) meshKinds[mesh.slot] = mesh.kind;
  const meshDeclaredBones: RigInfo['meshDeclaredBones'] = {};
  for (const mesh of meshes) meshDeclaredBones[mesh.slot] = mesh.bones;
  const meshSoftBones: RigInfo['meshSoftBones'] = {};
  for (const mesh of meshes) if (mesh.soft !== undefined) meshSoftBones[mesh.slot] = mesh.soft.bone;
  // A fold exemption on a slot that carries no mesh cannot exempt anything —
  // A39 reads triangles, and only a mesh has them. `parseRigSpec` already
  // refused a name that is not a SLOT; this is the second half, and it needs
  // the compiled meshes so it lives here rather than there.
  const deformMayFold = (rig.invariants?.deformMayFold ?? []).map((e) => e.slot);
  for (const slot of deformMayFold) {
    if (meshKinds[slot] === undefined) {
      throw new CompileError(
        `rig "${rig.name}" exempts slot "${slot}" from A39_DEFORM_KEEPS_TRIANGLE_WINDING, but that slot carries no ` +
          'mesh — winding is a property of triangles, so there is nothing there to exempt',
      );
    }
  }
  // Inward, in Spine world. Off-axis keys (the mass bone usually hangs outside
  // the axis subtree) have to be projected onto it before they can be compared
  // with travel along the axis.
  const spineDeg = manifest?.axis ? screenToSpineDegrees(manifest.axis.deg) : null;
  const inwardUnit: [number, number] | null =
    spineDeg === null ? null : [r6(Math.cos((spineDeg * Math.PI) / 180)), r6(Math.sin((spineDeg * Math.PI) / 180))];
  const contactDepth = manifest?.stroke?.contact_depth ?? null;
  if (contactDepth !== null && !(contactDepth > 0)) {
    throw new CompileError(`manifest stroke.contact_depth is ${contactDepth}; it must be a positive number of axis pixels`);
  }
  const capCeiling = manifest?.stroke?.cap_containment_ceiling ?? null;
  if (capCeiling !== null && !(capCeiling > 0)) {
    throw new CompileError(
      `manifest stroke.cap_containment_ceiling is ${capCeiling}; it must be a positive number of axis pixels (use null for "not measurable on this cut")`,
    );
  }
  return {
    archetype: rig.name,
    axisBone,
    axisSubtree,
    detached: (rig.invariants?.detached ?? []).map((d) => [d.bone, d.notUnder] as [string, string]),
    slotOrder: rig.slots.length ? rig.slots.map((s) => s.name) : null,
    meshKinds,
    meshDeclaredBones,
    meshSoftBones,
    deformMayFold,
    editorRoundTrip: rig.invariants?.editorRoundTrip === true,
    meshSlotBudget: rig.invariants?.meshSlots ?? null,
    meshTriangleBudget: rig.invariants?.meshTriangles ?? null,
    contactDepth,
    capContainmentCeiling: capCeiling,
    massBone: rig.invariants?.massBone ?? null,
    inwardUnit,
  };
}

/**
 * A manifest that disagrees with itself is the cheapest bug to catch and the
 * worst to debug three files later, so the axis unit vector is checked against
 * the axis angle before anything is built from either.
 */
function checkAxisSelfConsistency(manifest: FaceManifest): void {
  if (!manifest.axis) return;
  const { deg, unit } = manifest.axis;
  if (!Array.isArray(unit) || unit.length !== 2) {
    throw new CompileError(`manifest axis.unit must be [x, y], got ${JSON.stringify(unit)}`);
  }
  const ex = Math.cos((deg * Math.PI) / 180);
  const ey = Math.sin((deg * Math.PI) / 180);
  if (Math.hypot(unit[0] - ex, unit[1] - ey) > 1e-3) {
    throw new CompileError(
      `manifest axis.unit [${unit[0]}, ${unit[1]}] does not match axis.deg ${deg} (expected [${r6(ex)}, ${r6(ey)}])`,
    );
  }
}

/**
 * Place a rigid region on its bone.
 *
 * Two offsets are folded in here. The attachment is centred on the part window
 * rather than on the bone, because several slots may share one bone — a part and
 * its motion-blur variant, an occluder and what pools against it — while their
 * windows sit in different places. And the attachment's own `rotation` cancels
 * the bone's world rotation, because a plate is authored in screen space:
 * without it every slot hanging off a rotated axis bone would render tilted by
 * the cut's axis angle.
 *
 * On an unrotated bone sitting at its window centre both terms are zero and the
 * fields are omitted, which is why a formation with no axis emits the same
 * bytes it always did.
 */
function placeRegion(
  part: FaceManifestPart,
  manifest: FaceManifest,
  bone: BoneTransform,
  img: CompiledImage,
): SpineRegionAttachment {
  const win = partWindow(part, manifest);
  // width/height are NOT optional: omitting them loads as NaN with no error.
  // The compiler fills them from the PNG.
  const att: SpineRegionAttachment = { width: img.width, height: img.height };
  const [ax, ay] = toBoneLocal(bone, win.x + win.w / 2, cropToSpineY(win.y + win.h / 2, manifest.crop.h));
  if (ax !== 0) att.x = ax;
  if (ay !== 0) att.y = ay;
  const rotation = normaliseDegrees(-bone.worldRotation);
  if (rotation !== 0) att.rotation = rotation;
  return att;
}

/**
 * Build one mesh for a manifest part and encode its weighted vertices.
 *
 * Two generators, one call site. A `ring` pins its two outer rings and moves only
 * the aperture; a `ribbon` pins its entry row and lets the chain stretch the rest.
 * Which one a part gets is manifest data, not a guess — the compiler will not
 * infer a deformation model from a polygon's shape.
 */
function buildMesh(
  part: FaceManifestPart,
  manifest: FaceManifest,
  bones: SpineBone[],
  transforms: Map<string, BoneTransform>,
  anchorName: string,
): { attachment: SpineMeshAttachment; kind: 'ring' | 'ribbon' } {
  const spec = part.mesh!;
  const kind = spec.kind ?? 'ring';
  const win = partWindow(part, manifest);
  const cropH = manifest.crop.h;
  const controls = meshControlBones(part);

  const refFor = (name: string): MeshBoneRef => {
    const index = bones.findIndex((b) => b.name === name);
    if (index < 0) throw new CompileError(`internal: mesh bone "${name}" is not in the bone list`);
    const m = transforms.get(name);
    if (!m) throw new CompileError(`internal: no setup transform for mesh bone "${name}"`);
    return { index, toBind: (wx, wy) => toBoneLocal(m, wx, wy) };
  };

  let geometry;
  try {
    if (kind === 'ribbon') {
      geometry = buildRibbonMesh({ size: [win.w, win.h], rows: spec.rows!, chainCount: controls.length });
    } else {
      const centre: [number, number] = [spec.center![0] - win.x, spec.center![1] - win.y];
      // Control bones enter the ring builder as ANGLES about the aperture, taken
      // from where the rig actually put them. The alternative — a per-bone angle
      // in the manifest — would let the declared angle drift away from the
      // declared position, and then the ring would deform toward a bone that is
      // somewhere else.
      //
      // The angle itself is `ringControlAngles`, shared with the rig-spec route
      // (issue #684). What stays here is this route's own conversion: a manifest
      // measures in crop pixels, y down, and Spine world is that crop flipped, so
      // `cropH - worldY` is the whole of it. `spec.center` is in the same crop
      // pixels, which is why the centre passed here is not the window-local
      // `centre` two lines up.
      const controlAngles = ringControlAngles(controls, spec.center!, (name) => {
        const m = transforms.get(name);
        if (!m) throw new CompileError(`internal: no setup transform for control bone "${name}"`);
        return [m.worldX, cropH - m.worldY];
      });
      geometry = buildRingMesh({
        hull: (part.polygon ?? []).map(([x, y]) => [x - win.x, y - win.y] as [number, number]),
        center: centre,
        inner: spec.inner!,
        size: [win.w, win.h],
        bias: spec.bias ? { axis_deg: spec.bias.axis_deg, ramp: spec.bias.ramp } : undefined,
        controlAngles,
      });
    }
  } catch (err) {
    if (err instanceof MeshError) throw new CompileError(`slot "${part.slot}" mesh: ${err.message}`);
    throw err;
  }

  const vertices = encodeWeightedVertices(
    geometry,
    (px, py) => [r6(win.x + px), r6(cropToSpineY(win.y + py, cropH))],
    { anchor: refFor(anchorName), controls: controls.map(refFor) },
  );

  return {
    kind: geometry.kind,
    attachment: {
      type: 'mesh',
      uvs: geometry.uvs,
      triangles: geometry.triangles,
      vertices,
      ...generatedHullAndEdges(geometry, `slot "${part.slot}" mesh`),
      width: win.w,
      height: win.h,
    },
  };
}

/**
 * The raw-curve escape hatch: absolute (time, value) control points, verbatim.
 *
 * ⭐ Named easings stay the recommended path: a handle set with
 * a name is reusable, reviewable and retargetable, and it is what makes a motion
 * spec readable as intent rather than as numbers. But a named easing can only say
 * "the same shape, everywhere", and an editor export says a different shape per
 * key per channel — rung 3 of the benchmark ladder carries 54 bezier keys and no
 * two of them share handles. Refusing to express that would not make rigc's
 * output better; it would make rigc unable to state what Spine's format holds,
 * which is the same blocker as the bone tree being code, one layer down.
 *
 * So this is the escape hatch, and it is shaped like one: the numbers are the
 * file's own, checked for length and finiteness and passed through. What it is
 * NOT is a second way to write an easing — a key may carry `ease` or `curve`,
 * never both.
 *
 * ⚠️ These are ABSOLUTE (time, value) points, not the normalised graph-view
 * handles an editor shows. Writing the handles here would load without error and
 * produce a different curve, which is exactly the
 * trap `bezierForChannel` exists to keep authors out of.
 */
function rawCurve(curve: number[] | 'stepped', channels: number, where: string, at: string): number[] | 'stepped' {
  if (curve === 'stepped') return 'stepped';
  if (!Array.isArray(curve)) throw new CompileError(`${where} (t=${at}): curve must be an array or "stepped"`);
  if (curve.length !== channels * 4) {
    // A short array multiplies `undefined` into the cubic and yields NaN with no
    // error at all — case 6g, and the reason A05 exists.
    throw new CompileError(
      `${where} (t=${at}): raw curve has ${curve.length} numbers, this timeline needs ${channels} channel(s) x 4 = ${channels * 4}`,
    );
  }
  for (const n of curve) {
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      throw new CompileError(`${where} (t=${at}): raw curve holds a non-finite value ${JSON.stringify(n)}`);
    }
  }
  return curve.map(r6);
}

/**
 * Bone timelines. Same curve rule as the slot tracks — four numbers per value
 * channel, in field order — but the identity value differs per property, so a
 * key that matches setup is still emitted explicitly rather than omitted. An
 * omitted field is not "no change"; it is "the setup value", which is the same
 * thing only by accident.
 */
function compileValueTrack(
  track: MotionValueTrack,
  motion: MotionSpec,
  animName: string,
  duration: number,
  target: string,
  shift: number,
  shapes: Record<string, ValueTrackShape>,
  kind: string,
): SpineTimelineKey[] {
  const shape = shapes[track.property];
  if (!shape) throw new CompileError(`animation "${animName}": ${kind} "${target}" has no property "${track.property}"`);
  const where = `animation "${animName}" ${kind} "${target}" ${track.property}`;
  if (!track.keys.length) throw new CompileError(`${where}: no keys`);

  const out: SpineTimelineKey[] = [];
  for (let i = 0; i < track.keys.length; i++) {
    const key = track.keys[i];
    const next = track.keys[i + 1];
    const time = keyTime(key.t + shift);
    if (i > 0 && time <= (out[i - 1].time as number)) {
      throw new CompileError(`${where}: key times must strictly increase (at t=${key.t})`);
    }
    checkKeyTime(where, time, key.t, duration);
    // A no-field timeline (`reset`) is an event: the key IS the value, so it
    // carries none. Anything else must match the field count exactly.
    if (shape.fields.length === 0) {
      if (key.v !== null) throw new CompileError(`${where}: this timeline takes no value; use null`);
      if (key.ease) throw new CompileError(`${where}: an event timeline cannot carry an easing`);
      out.push({ time });
      continue;
    }
    if (!Array.isArray(key.v) || key.v.length !== shape.fields.length) {
      throw new CompileError(`${where}: key value must be an array of ${shape.fields.length} number(s)`);
    }
    const entry: SpineTimelineKey = { time };
    shape.fields.forEach((field, c) => {
      const v = key.v as number[];
      if (!Number.isFinite(v[c])) throw new CompileError(`${where}: non-finite value ${String(v[c])}`);
      // The bound, where the runtime has one. Refused here rather than left to
      // `A23` because this is a spec somebody wrote and the key is the thing to
      // change — the same division `compileConstraintTrack`'s `range` makes for
      // an ik mix, and the same criterion `A23` applies to a file rigc did not
      // write (issue #610). Note the value is judged BEFORE `r6`: a number
      // rounding onto a bound would be refused for the rounding rather than for
      // what the author wrote.
      const bound = shape.bounds?.[c];
      if (bound) {
        const refusal = physicsKeyRefusal(bound, v[c]);
        // `where` already ends in the property, so the JSON field is named only
        // on a shape that has more than one of them — otherwise the message
        // reads "… mass: value is 0", which says the property twice and the
        // second time under the wrong name.
        const at = shape.fields.length > 1 ? `${field} at t=${key.t}` : `key at t=${key.t}`;
        if (refusal !== null) throw new CompileError(`${where} ${at} is ${refusal}`);
      }
      entry[field] = r6(v[c]);
    });
    if (key.ease !== undefined && key.curve !== undefined) {
      throw new CompileError(`${where}: a key carries both a named easing and a raw curve; pick one`);
    }
    if (key.curve !== undefined) {
      if (!next) throw new CompileError(`${where}: last key carries a curve but has nothing to ease to`);
      entry.curve = rawCurve(key.curve, shape.fields.length, where, String(key.t));
    } else if (key.ease && next) {
      if (key.ease === 'stepped') {
        entry.curve = 'stepped';
      } else {
        const handles = motion.easings?.[key.ease];
        if (!handles) throw new CompileError(`${where}: unknown easing "${key.ease}"`);
        if (!Array.isArray(next.v)) throw new CompileError(`${where}: next key value must be an array`);
        const t2 = keyTime(next.t + shift);
        entry.curve = easingCurve(handles, time, t2, key.v as number[], next.v as number[]);
      }
    } else if (key.ease && !next) {
      throw new CompileError(`${where}: last key carries an easing but has nothing to ease to`);
    }
    out.push(entry);
  }
  return out;
}

/**
 * The whole-animation draw-order timeline (`animations.<a>.drawOrder`).
 *
 * ⭐ Four refusals here, and three of them exist because `readDrawOrder`
 * (SkeletonJson.ts:1336-1374) rebuilds the permutation with a **forward-only**
 * cursor over the setup order:
 *
 * ```
 * while (originalIndex !== index) unchanged[unchangedIndex++] = originalIndex++;
 * drawOrder[originalIndex + offsetMap.offset] = originalIndex++;
 * ```
 *
 *   1. **Offsets are emitted in slot order.** An entry whose slot sits EARLIER
 *      than the previous entry's can never make `originalIndex` equal `index`
 *      again, so that loop runs away — an artifact that hangs the loader rather
 *      than loading wrong. The author states a set of moves; the array order in
 *      the file is the parser's requirement and not a decision, so rigc sorts
 *      rather than making every caller remember. Deterministic: the key is the
 *      emitted slot index.
 *   2. **One slot per key.** Two entries for the same slot means two writes at
 *      one cursor position; the second silently wins and the first slot's place
 *      is left to the unchanged-fill.
 *   3. **The destination must be inside the array.** `originalIndex + offset`
 *      out of range writes past the end (or at −1), leaves a −1 hole behind, and
 *      the fill loop then reads `unchanged[-1]` = `undefined`. Nothing throws:
 *      the animation simply draws a slot that is not a slot.
 *   4. A slot the skeleton does not have IS caught by the parser (`Draw order
 *      slot not found`) — but in the consumer's process, which is late, so it is
 *      refused here too.
 *
 * `A31_DRAW_ORDER_OFFSETS_RESOLVE` checks the same four properties from the
 * other side, on the emitted file, because a hand-written or foreign skeleton
 * never passed through this function.
 */
function compileDrawOrder(
  keys: MotionDrawOrderKey[],
  animName: string,
  duration: number,
  slots: SpineSlot[],
): SpineTimelineKey[] {
  const where = `animation "${animName}" drawOrder`;
  if (!keys.length) throw new CompileError(`${where}: no keys`);
  const indexOf = new Map(slots.map((s, i) => [s.name, i]));

  const out: SpineTimelineKey[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const time = keyTime(key.t);
    if (i > 0 && time <= (out[i - 1].time as number)) {
      throw new CompileError(`${where}: key times must strictly increase (at t=${key.t})`);
    }
    checkKeyTime(where, time, key.t, duration);
    // No offsets = "back to the setup draw order", which is the parser's own
    // encoding for it. An empty array means the same thing and is written the
    // same way, so that two spellings cannot emit two different files.
    if (!key.offsets?.length) {
      out.push({ time });
      continue;
    }
    const seen = new Set<string>();
    const entries: Array<{ slot: string; offset: number; index: number }> = [];
    for (const off of key.offsets) {
      const index = indexOf.get(off.slot);
      if (index === undefined) {
        throw new CompileError(`${where} at t=${key.t}: slot "${off.slot}" is not one this rig emits`);
      }
      if (seen.has(off.slot)) {
        throw new CompileError(`${where} at t=${key.t}: slot "${off.slot}" is offset twice in one key`);
      }
      if (!Number.isInteger(off.offset)) {
        throw new CompileError(`${where} at t=${key.t}: slot "${off.slot}" offset ${off.offset} is not a whole number`);
      }
      const landing = index + off.offset;
      if (landing < 0 || landing >= slots.length) {
        throw new CompileError(
          `${where} at t=${key.t}: slot "${off.slot}" is at index ${index} and offset ${off.offset} puts it at ` +
            `${landing}, outside the ${slots.length} emitted slots`,
        );
      }
      seen.add(off.slot);
      entries.push({ slot: off.slot, offset: off.offset, index });
    }
    entries.sort((a, b) => a.index - b.index);
    out.push({ time, offsets: entries.map((e) => ({ slot: e.slot, offset: e.offset })) });
  }
  return out;
}

/**
 * The whole-animation event timeline (`animations.<a>.events`).
 *
 * Four refusals, and the reason each one is here is a different failure mode of
 * `readAnimation`'s event branch (SkeletonJson.ts:1238-1261):
 *
 *   1. **The name must be declared.** `skeletonData.findEvent` returns null and
 *      the parser throws `Event not found` — one of the format's few loud
 *      failures, but it throws in the CONSUMER's process, which is late. Refused
 *      here so the message can name the rig spec's `events` block instead.
 *   2. **Key times must not go backwards.** The loop writes frame `i` from key
 *      `i` in ARRAY order and never sorts, so a time that decreases produces an
 *      `EventTimeline` whose frames are out of order. Nothing throws; the
 *      timeline's search simply stops finding the firings behind the fold. Equal
 *      times are legal and deliberate — two different events on the same frame is
 *      an ordinary thing to want — so this is non-decreasing, not the strictly
 *      increasing rule a value track lives under (a value track has one value per
 *      time and two keys at one time is a contradiction; two firings are not).
 *   3. **`volume`/`balance` need the event to carry `audio`.** `:1254-1257` reads
 *      them only inside `if (event.data.audioPath)`, so on a silent event they
 *      are dropped without a word.
 *   4. **A key past the declared duration.** The same `checkKeyTime` every other
 *      timeline goes through: a firing after the end never fires (issue #54 was
 *      exactly this shape on an attachment reveal).
 */
function compileEvents(
  keys: MotionEventKey[],
  animName: string,
  duration: number,
  events: Record<string, RigEvent>,
): SpineTimelineKey[] {
  const where = `animation "${animName}" events`;
  if (!keys.length) throw new CompileError(`${where}: no keys`);

  const out: SpineTimelineKey[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (typeof key.name !== 'string' || key.name.length === 0) {
      throw new CompileError(`${where}: key ${i} has no "name"; an event key fires an event by name`);
    }
    const declared = events[key.name];
    if (declared === undefined) {
      const known = Object.keys(events);
      throw new CompileError(
        `${where} at t=${key.t}: event "${key.name}" is not declared in the rig spec's "events" block; ` +
          (known.length ? `declared: ${known.join(', ')}` : 'that block is empty or absent'),
      );
    }
    const time = keyTime(key.t);
    if (i > 0 && time < (out[i - 1].time as number)) {
      throw new CompileError(
        `${where}: key times must not go backwards (at t=${key.t}, after t=${String(out[i - 1].time)}) — ` +
          'the parser writes frames in array order and never sorts them',
      );
    }
    checkKeyTime(where, time, key.t, duration);

    const entry: SpineTimelineKey = { time, name: key.name };
    if (key.int !== undefined) {
      if (!Number.isInteger(key.int)) {
        throw new CompileError(`${where} at t=${key.t}: int ${String(key.int)} is not an integer`);
      }
      entry.int = key.int;
    }
    if (key.float !== undefined) {
      if (!Number.isFinite(key.float)) {
        throw new CompileError(`${where} at t=${key.t}: float ${String(key.float)} is not finite`);
      }
      entry.float = r6(key.float);
    }
    if (key.string !== undefined) {
      if (typeof key.string !== 'string') {
        throw new CompileError(`${where} at t=${key.t}: string ${JSON.stringify(key.string)} is not a string`);
      }
      entry.string = key.string;
    }
    for (const field of ['volume', 'balance'] as const) {
      const v = key[field];
      if (v === undefined) continue;
      if (declared.audio === undefined) {
        throw new CompileError(
          `${where} at t=${key.t}: ${field} is set but event "${key.name}" declares no "audio"; ` +
            `the parser reads ${field} only for an event with an audio path, so it would be dropped in silence`,
        );
      }
      if (!Number.isFinite(v)) throw new CompileError(`${where} at t=${key.t}: ${field} ${String(v)} is not finite`);
      entry[field] = r6(v);
    }
    out.push(entry);
  }
  return out;
}

/**
 * An IK or transform constraint keyed over time — `animations.<a>.<group>.<name>`.
 *
 * One function for both because the two differ only in their field table: the
 * group is one unnamed timeline per constraint, every field is optional with a
 * per-key default, and the curve concatenates four numbers per channel in field
 * order. `CONSTRAINT_TIMELINES` holds what differs.
 *
 * 🚨 The refusal that is not obvious is the **uniform field set**. In this format
 * a key does not inherit anything from the key before it: `getValue(keyMap,
 * "softness", 0)` is read fresh per key, so a track written as
 *
 * ```
 * { "t": 0, "mix": 1, "softness": 20 },  { "t": 1, "mix": 0 }
 * ```
 *
 * does not hold softness at 20 and fade the mix out — it snaps softness to 0 at
 * t=1 and interpolates from 20 down to 0 on the way, which is a thing the author
 * did not write and cannot see. It loads, it plays, and it is wrong. So every key
 * of a track has to name the same fields; stating the default explicitly is the
 * way to opt in.
 *
 * ⚠️ The values a curve is built between are the **effective** ones — the
 * author's number where there is one, the parser's default where there is not.
 * That is reading the format, not inventing a value: it is exactly what the
 * runtime will interpolate, and a bezier built against anything else would
 * describe a curve the player does not play.
 *
 * 🚨 `rigFlags` is the same reading applied one level up, for the three ik
 * booleans (issue #273). The parser reads them per KEY as well as on the
 * constraint, with the same defaults in both places, so an ik timeline whose keys
 * omit `bendPositive` does not inherit the rig's — it asserts `true`, and a rig
 * that declared `false` bends the other way for the whole animation with the
 * field still sitting in the file. Every key therefore carries the EFFECTIVE
 * direction: the motion's where the motion states one, and the rig's where it
 * does not.
 *
 * **A motion key may still override.** The format keys these per key on purpose
 * — they are stepped by nature, and a bend that flips partway through an
 * animation is a real thing to write — so a track that states a flag on every key
 * is honoured as written, whatever the rig says. That is also what the editor's
 * own export does: spineboy-pro declares `bendPositive: false` on both leg chains
 * and restates it on every key of all six ik timelines that touch them. What
 * changes here is only the silent case.
 */
function compileConstraintTrack(
  group: 'ik' | 'transform',
  track: MotionIkTrack | MotionTransformTrack,
  motion: MotionSpec,
  animName: string,
  duration: number,
  /** Non-default ik booleans the rig declared, by field. Empty for `transform`. */
  rigFlags: Record<string, boolean>,
): SpineTimelineKey[] {
  const shape = CONSTRAINT_TIMELINES[group];
  const article = group === 'ik' ? 'an' : 'a';
  const where = `animation "${animName}" ${group} constraint "${track.constraint}"`;
  const keys = track.keys;
  // An array by the time this runs (`parseMotionSpec`); an EMPTY one is a
  // format rule rather than a shape — the parser reads key 0, finds nothing and
  // skips the timeline, which is assertion A34's silent case.
  if (keys.length === 0) throw new CompileError(`${where}: no keys`);

  const read = (key: MotionIkTrack['keys'][number] | MotionTransformTrack['keys'][number], field: string): unknown =>
    (key as unknown as Record<string, unknown>)[field];
  const named = (key: MotionIkTrack['keys'][number] | MotionTransformTrack['keys'][number]): string[] =>
    [...shape.channels, ...shape.flags].map((c) => c.field).filter((field) => read(key, field) !== undefined);

  // The uniform-field-set rule, checked against key 0 so the message can name the
  // key that differs rather than "some key".
  const first = named(keys[0]);
  const firstSet = new Set(first);
  keys.forEach((key, i) => {
    if (i === 0) return;
    const here = named(key);
    for (const field of here) {
      if (firstSet.has(field)) continue;
      throw new CompileError(
        `${where}: key ${i} (t=${key.t}) names "${field}" and key 0 does not. Every key of ${article} ${group} timeline ` +
          'is read with its own default, so a field stated on some keys and not others snaps to the default on ' +
          'the rest — state it on every key or on none.',
      );
    }
    for (const field of first) {
      if (here.includes(field)) continue;
      throw new CompileError(
        `${where}: key 0 names "${field}" and key ${i} (t=${key.t}) does not. Every key of ${article} ${group} timeline ` +
          `is read with its own default, so "${field}" would snap to ` +
          `${JSON.stringify(defaultOf(shape, field))} at t=${key.t} — state it on every key or on none.`,
      );
    }
  });

  /** The value the runtime will see for `field` on this key: authored, or default. */
  const effective = (key: MotionIkTrack['keys'][number] | MotionTransformTrack['keys'][number], channel: ConstraintChannel): number => {
    const v = read(key, channel.field);
    if (v !== undefined) return v as number;
    if (channel.inheritsFrom === undefined) return channel.dflt;
    const inherited = read(key, channel.inheritsFrom);
    return inherited === undefined ? channel.dflt : (inherited as number);
  };

  const out: SpineTimelineKey[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const next = keys[i + 1];
    const time = keyTime(key.t);
    if (i > 0 && time <= (out[i - 1].time as number)) {
      throw new CompileError(`${where}: key times must strictly increase (at t=${key.t})`);
    }
    checkKeyTime(where, time, key.t, duration);

    const entry: SpineTimelineKey = { time };
    for (const channel of shape.channels) {
      const v = read(key, channel.field);
      if (v === undefined) continue;
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new CompileError(`${where} (t=${key.t}): ${channel.field} is ${JSON.stringify(v)}, not a finite number`);
      }
      const bounds = shape.range[channel.field];
      if (bounds && (v < bounds[0] || v > bounds[1])) {
        throw new CompileError(
          `${where} (t=${key.t}): ${channel.field} is ${v}, outside ${bounds[0]}..${
            bounds[1] === Infinity ? '∞' : bounds[1]
          } — the runtime documents it as ${channel.field === 'mix' ? 'a percentage 0-1' : 'a distance'}`,
        );
      }
      entry[channel.field] = r6(v);
    }
    for (const flag of shape.flags) {
      const v = read(key, flag.field);
      if (v === undefined) {
        // The rig's value, stamped on this key because nothing else will carry
        // it there. Absent from `rigFlags` means the rig's value IS the per-key
        // default, so omitting the field says the same thing and the emitted
        // bytes do not move.
        const carried = rigFlags[flag.field];
        if (carried !== undefined) entry[flag.field] = carried;
        continue;
      }
      if (typeof v !== 'boolean') {
        throw new CompileError(`${where} (t=${key.t}): ${flag.field} is ${JSON.stringify(v)}, not true or false`);
      }
      entry[flag.field] = v;
    }

    if (key.ease !== undefined && key.curve !== undefined) {
      throw new CompileError(`${where}: a key carries both a named easing and a raw curve; pick one`);
    }
    if (key.curve !== undefined) {
      if (!next) throw new CompileError(`${where}: last key carries a curve but has nothing to ease to`);
      entry.curve = rawCurve(key.curve, shape.channels.length, where, String(key.t));
    } else if (key.ease !== undefined && next) {
      if (key.ease === 'stepped') {
        entry.curve = 'stepped';
      } else {
        const handles = motion.easings?.[key.ease];
        if (!handles) throw new CompileError(`${where}: unknown easing "${key.ease}"`);
        const t2 = keyTime(next.t);
        entry.curve = easingCurve(
          handles,
          time,
          t2,
          shape.channels.map((channel) => effective(key, channel)),
          shape.channels.map((channel) => effective(next, channel)),
        );
      }
    } else if (key.ease !== undefined && !next) {
      throw new CompileError(`${where}: last key carries an easing but has nothing to ease to`);
    }
    out.push(entry);
  }
  return out;
}

/** The parser default for one field of a constraint timeline, for a message. */
function defaultOf(shape: ConstraintTimelineShape, field: string): number | boolean {
  const channel = shape.channels.find((c) => c.field === field);
  if (channel) return channel.dflt;
  return shape.flags.find((f) => f.field === field)?.dflt ?? 0;
}

/**
 * What a deform key is editing: the array the parser builds for one attachment.
 *
 * The two encodings are the reason this is derived rather than assumed, and they
 * are the same split `readVertices` makes when it decides whether a `vertices`
 * array is coordinates or a weight run:
 *
 *   unweighted — `deformLength = vertices.length`, one `x, y` pair per vertex;
 *   weighted   — `deformLength = vertices.length / 3 * 2`, one pair per bone
 *                INFLUENCE, because the loaded `vertices` is `x, y, weight` per
 *                influence.
 *
 * Same shape, two meanings, and picking the wrong one writes a run that silently
 * lands on the wrong vertices.
 */
interface DeformGeometry {
  weighted: boolean;
  /** How long the array the key edits is. */
  deformLength: number;
  vertexCount: number;
  /** Bone influences per vertex, in vertex order. Null on an unweighted attachment. */
  boneCounts: number[] | null;
  /**
   * Setup `x, y` per vertex, for a `transform` key to evaluate a model over
   * (issue #294).
   *
   * ⚠️ **Two spaces, and `influenceBones` is which.** Where every vertex of
   * the attachment occupies exactly one pair of one bone's bind space — an
   * unweighted run, or a weighted one whose every vertex is a single influence
   * of a single bone — this is that space, the model's output IS the deform
   * array, and `influenceBones` is null. Where it is not, this is the
   * vertex's setup **world** position, `Σ wᵢ · Mᵢ · bindᵢ`, which is defined for
   * any weighting; the model's output is then a world displacement that the
   * caller pushes into each influence through `influenceBones`.
   *
   * That seam is deliberate and it is the reason the field is documented rather
   * than named: keeping the first case in its own space is what makes the
   * change to the second byte-for-byte invisible to every rig that already
   * compiles (issue #389's own gate). It does mean a `radius` or an `about` is
   * read in world units the moment a second bone touches any vertex, so the
   * report says which space it evaluated in whenever it is not the first one.
   *
   * Null only in the one case that has no identity behind it: weights that do
   * not close at 1. `setupWhy` then says so.
   */
  setup: number[] | null;
  /**
   * The setup world transform of the bone behind each influence, in the deform
   * array's **own order** — one entry per pair — or null when `setup` is
   * already the space the array is in.
   *
   * Non-null is the multi-influence path: a vertex's world displacement `D`
   * becomes `Mᵢ⁻¹ · D` in every one of its influences (`toBoneLocalVector`), so
   * the runtime's `Σ wᵢ · Mᵢ · Mᵢ⁻¹ · D` collapses to `D · Σ wᵢ = D` at setup,
   * and to the same blend that carries the vertex once a bone moves.
   */
  influenceBones: BoneTransform[] | null;
  /** Why `setup` is null, phrased for the refusal. Null when it is not. */
  setupWhy: string | null;
  /**
   * Per-vertex `z`, when this attachment's generator named a depth map.
   *
   * Not measured from the emitted attachment like everything else here — there
   * is nowhere in the format to measure it FROM, which is the whole reason the
   * sampler keeps it beside the skeleton instead of in it. Filled in by the
   * caller, which is where the skin, slot and attachment names live.
   */
  depth: readonly number[] | null;
}

/**
 * Measure one emitted attachment's deform array.
 *
 * A region attachment is refused rather than measured: it has no `vertices` at
 * all, so `attachment.vertices.length` throws inside the parser — one of the very
 * few places this format fails loudly, and it fails in the consumer's process.
 */
function deformGeometryOf(
  att: SpineAttachment,
  where: string,
  /** The emitted bone array, which a weight run's `boneIndex` indexes into. */
  rigBones: SpineBone[],
  /** Their setup world transforms, by name. */
  transforms: Map<string, BoneTransform>,
): DeformGeometry {
  const type = (att as { type?: string }).type ?? 'region';
  let worldVerticesLength: number;
  if (type === 'mesh') {
    worldVerticesLength = (att as SpineMeshAttachment).uvs.length;
  } else if (type === 'boundingbox' || type === 'clipping' || type === 'path') {
    // ⭐ A `path` reaches this line as of issue #696, and it is the SAME line the
    // other two vertex-and-no-triangles types take: the array the parser sizes
    // is `vertexCount * 2`, the two encodings below are the mesh's own, and a
    // path's vertices are its control points.
    //
    // ⚠️ What stood here was a `NotImplementedError` — *a path attachment does
    // have a vertex array, and rigc does not key it yet* — whose stated reason
    // was that a deformed path invalidates the `lengths` the attachment carries.
    // The reason is measured and it does not belong to rigc:
    //
    //   - `lengths` is a field of the ATTACHMENT. The format has nowhere to put
    //     a per-key length, so no export of any tool carries a re-measured one;
    //     the editor's own is the setup measurement, which is what
    //     `pathCurveLengths` reproduces digit for digit.
    //   - `PathConstraint.computeWorldPositions` reads that field only under
    //     `constantSpeed: false` (`PathConstraint.js:205`). Under the parser's
    //     default, `true`, it re-measures the curve from the posed world
    //     vertices every frame — and those come through
    //     `VertexAttachment.computeWorldVertices`, which uses
    //     `slot.appliedPose.deform` when the array is non-empty
    //     (`attachments/Attachment.js:97-115`). So the constraint follows the
    //     DEFORMED spline, and the stale field is not read at all.
    //
    // ⇒ refusing it was refusing correct data for behaviour the format has and
    // every runtime shares — the shape issues #44 and #262 already cost this
    // file twice. `docs/AUTHORING.md` §4.11 states the `constantSpeed: false`
    // reading instead, which is the honest home for it: a fact about the format
    // the author is choosing, not a fault rigc can measure.
    worldVerticesLength = (att as SpineBoundingBoxAttachment | SpinePathAttachment).vertexCount * 2;
  } else {
    throw new CompileError(
      `${where}: a deform timeline keys the vertices of an attachment, and this one is a "${type}" — ` +
        'it has no vertex array to deform. Deformable types: mesh, boundingbox, clipping, path.',
    );
  }
  const vertices = (att as SpineMeshAttachment).vertices ?? [];
  const weighted = vertices.length !== worldVerticesLength;
  if (!weighted) {
    return {
      weighted,
      deformLength: worldVerticesLength,
      vertexCount: worldVerticesLength / 2,
      boneCounts: null,
      // An unweighted attachment IS its own space: the array is one `x, y` per
      // vertex in the slot bone's space, which is the space the offsets are in.
      setup: vertices.slice(),
      influenceBones: null,
      setupWhy: null,
      // Filled in by the caller; `deformGeometryOf` reads the emitted
      // attachment, and the depth is deliberately not in it.
      depth: null,
    };
  }
  // Walk the weight run for the per-vertex influence counts. The run's own shape
  // is already assured by the attachment builders and by A33/A04; this only
  // counts, and a malformed run stops rather than producing a plausible number.
  const boneCounts: number[] = [];
  const bindSpace: number[] = [];
  const bones = new Set<number>();
  /** `boneIndex, bindX, bindY, weight` per influence, in deform-array order. */
  const influenceRun: number[] = [];
  for (let i = 0; i < vertices.length; ) {
    const n = vertices[i++];
    if (!Number.isInteger(n) || n < 1) {
      throw new CompileError(`${where}: the attachment's weighted vertex run has a bone count of ${String(n)} at index ${i - 1}`);
    }
    if (n === 1) {
      bones.add(vertices[i]);
      bindSpace.push(vertices[i + 1], vertices[i + 2]);
    }
    const from = i;
    i += n * 4;
    if (i > vertices.length) {
      throw new CompileError(`${where}: the attachment's weighted vertex run is truncated at vertex ${boneCounts.length}`);
    }
    for (let k = from; k < i; k++) influenceRun.push(vertices[k]);
    boneCounts.push(n);
  }
  // ⚠️ The influence count is the SUM of the per-vertex counts, not a division
  // of the JSON array's length. The emitted array is `boneCount` followed by
  // `boneIndex, x, y, weight` per influence — five numbers for a single-bone
  // vertex, not three — so `vertices.length / 3` overstated the deform array by
  // two thirds on a one-bone-per-vertex mesh (`gallery/flex`'s 77-vertex leaf
  // measured 256.667 against its true 154) and made A35's own overrun bar too
  // wide by that much. `readVertices` stores three numbers per influence in the
  // LOADED attachment, which is where the `/3*2` in the parser comes from.
  let influences = 0;
  for (const n of boneCounts) influences += n;
  const common = { weighted, deformLength: influences * 2, vertexCount: boneCounts.length, boneCounts, depth: null };
  // -- one bind space, unchanged -------------------------------------------
  //
  // Every vertex a single influence of a single bone: the run IS that bone's
  // bind space, a model evaluated over it lands straight in the deform array,
  // and not one byte of this path moved for issue #389. Keeping it separate is
  // what makes that provable — the alternative, folding it into the world path
  // below, would re-evaluate every existing `transform` key at world
  // coordinates and emit a different file for a spec nobody edited.
  if (boneCounts.every((n) => n === 1) && bones.size === 1) {
    return { ...common, setup: bindSpace, influenceBones: null, setupWhy: null };
  }
  // -- several influences, evaluated in world (issue #389) -------------------
  //
  // The refusal that used to stand here was right about the ARRAY and wrong
  // about the MODEL. There is no single space the array lives in, true; but the
  // vertex has one setup world position whatever its weighting —
  // `Σ wᵢ · Mᵢ · bindᵢ` — and a world displacement `D` written into influence
  // `i` as `Mᵢ⁻¹ · D` moves it by `D · Σ wᵢ`. So the model is evaluated once, in
  // world, and pushed into each bind space rather than guessed at in one of
  // them.
  //
  // ⭐ The one case with no identity behind it is a vertex whose weights do not
  // close at 1, because that is the `Σ wᵢ` the arithmetic cancels against.
  // `A20_MESH_WEIGHTS_COHERENT` is the assertion that requires it and 1e-3 is
  // the tolerance it uses, quoted here rather than chosen again.
  const setupWorld: number[] = [];
  const influenceBones: BoneTransform[] = [];
  let openWeights: string | null = null;
  for (let v = 0, k = 0; v < boneCounts.length; v++) {
    let wx = 0;
    let wy = 0;
    let sum = 0;
    for (let n = 0; n < boneCounts[v]; n++, k++) {
      const index = influenceRun[4 * k];
      const bone = rigBones[index];
      const m = bone === undefined ? undefined : transforms.get(bone.name);
      if (!m) throw new CompileError(`${where}: vertex ${v} binds bone index ${index}, which is not in the bone list`);
      const weight = influenceRun[4 * k + 3];
      const [x, y] = toWorld(m, influenceRun[4 * k + 1], influenceRun[4 * k + 2]);
      wx += x * weight;
      wy += y * weight;
      sum += weight;
      influenceBones.push(m);
    }
    setupWorld.push(wx, wy);
    if (openWeights === null && Math.abs(sum - 1) > 1e-3) {
      openWeights =
        `vertex ${v}'s ${boneCounts[v]} weights sum to ${sum.toFixed(4)} rather than 1. A stated model becomes a deform ` +
        'run by writing each vertex\'s world displacement D into every influence as Mᵢ⁻¹·D, which moves the vertex by ' +
        'D·Σwᵢ — so a sum that is not 1 has no displacement that lands it where the model says. ' +
        'A20_MESH_WEIGHTS_COHERENT is the assertion that requires that sum, at the same 1e-3';
    }
  }
  return {
    ...common,
    setup: openWeights === null ? setupWorld : null,
    influenceBones: openWeights === null ? influenceBones : null,
    setupWhy: openWeights,
  };
}

/**
 * One attachment's geometry keyed over time —
 * `animations.<a>.attachments.<skin>.<slot>.<attachment>.deform`.
 *
 * ⭐ Every refusal below is a silent failure of the parser's own deform branch,
 * and the first is the one that matters most:
 *
 *   1. **A run that does not fit.** The parser copies with
 *      `Utils.arrayCopy(vertices, 0, deform, start, vertices.length)` into a
 *      `Float32Array` sized from the attachment. Writing past the end of a typed
 *      array is a **no-op in JavaScript** — no throw, no warning — so a run one
 *      pair too long, or aimed at the wrong attachment, loses its tail and
 *      deforms part of the mesh correctly. That is the worst possible failure
 *      shape: it looks almost right.
 *   2. **`fromVertex` where a vertex is not one pair.** See below.
 *   3. **A key that carries both a run and no room for one**, or a non-finite
 *      offset — a NaN in the deform array propagates into world vertices.
 *
 * ⛔ What is **not** refused, and was until issue #576: an odd `offset` or an odd
 * run length. Both are raw copies at raw indices in both readers, both are what a
 * trimmed editor delta looks like, and neither has a second spelling — see the
 * clause in the loop below and the one in `deformStart`.
 *
 * `fromVertex` is rigc's own field and the reason it exists is issue #89's
 * observation: a deform key is the only key in the format whose meaning depends
 * on the attachment it is attached to, and an author reasons in vertices while
 * the array is indexed in influences. On an **unweighted** attachment the two
 * coincide, so the translation is exact. On a **weighted** one it is exact only
 * where each vertex the run covers has exactly ONE bone on it; with two bones a
 * vertex occupies two pairs and "move vertex 3 by (dx, dy)" is not a statement
 * the array can hold — the world offset would be
 * `Σ weightᵦ · Mᵦ · (dx, dy)`, which equals `(dx, dy)` only if every influencing
 * bone happens to share one world matrix. So that case is refused by name and
 * `offset` stays available for an author who really is writing bind-space
 * offsets per influence.
 *
 * ⭐ **A `transform` key is not in that bind, and since issue #389 it is not
 * refused for it.** The difference is where the numbers come from: `fromVertex`
 * hands rigc a pair the AUTHOR wrote, in a space only the author knows, and
 * rigc will not guess which. A model states a displacement rigc evaluates
 * itself, so it can put that displacement in world and push it into each
 * influence through that bone's own inverse — `Σ wᵢ · Mᵢ · Mᵢ⁻¹ · D = D`, with
 * nothing guessed. What survives is the one case the identity does not cover: a
 * vertex whose weights do not close at 1.
 */
function compileDeformTrack(
  track: MotionDeformTrack,
  motion: MotionSpec,
  animName: string,
  duration: number,
  geometry: DeformGeometry,
  generated: CompileResult['deformTransforms'],
): SpineTimelineKey[] {
  const skin = track.skin ?? 'default';
  const where = `animation "${animName}" deform ${skin}/${track.slot}/${track.attachment}`;
  const keys = track.keys;
  // An array by the time this runs (`parseMotionSpec`); an EMPTY one is a
  // format rule rather than a shape — the parser reads key 0, finds nothing and
  // skips the timeline, which is assertion A34's silent case.
  if (keys.length === 0) throw new CompileError(`${where}: no keys`);

  const out: SpineTimelineKey[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const time = keyTime(key.t);
    if (i > 0 && time <= (out[i - 1].time as number)) {
      throw new CompileError(`${where}: key times must strictly increase (at t=${key.t})`);
    }
    checkKeyTime(where, time, key.t, duration);
    // -- a key that states a MODEL rather than a run (issue #294) ------------
    //
    // Handled before everything below, because a transform key carries no
    // `vertices` and would otherwise be read as the format's "back to the setup
    // pose". The three refusals are the bounds the issue drew: a key states one
    // or the other, never both; a model covers every vertex, so a start index
    // has nothing to mean; and a model has to land each vertex somewhere
    // definite, which the arithmetic does for any weighting that closes at 1 and
    // for no weighting that does not (issue #389).
    if (key.transform !== undefined) {
      if (key.vertices !== undefined && key.vertices !== null) {
        throw new CompileError(
          `${where} (t=${key.t}): the key carries both a "transform" and a "vertices" run, and they are two answers to ` +
            'one question. Authored offsets and a stated model do not combine, for the same reason a mesh cannot carry ' +
            'both a "generator" and authored geometry — drop one.',
        );
      }
      if (key.offset !== undefined || key.fromVertex !== undefined) {
        throw new CompileError(
          `${where} (t=${key.t}): the key states a "transform" and a start index. A transform is a model of the whole ` +
            `attachment and is evaluated over all ${geometry.vertexCount} of its vertices, so it always starts at deform ` +
            'index 0. A model applied to part of a run leaves a step at the run\'s edge — write the partial run by hand ' +
            'if that is what you mean.',
        );
      }
      if (geometry.setup === null) {
        throw new CompileError(
          `${where} (t=${key.t}): a "transform" states where every vertex of this attachment goes, and this one has a ` +
            `vertex the arithmetic cannot place — ${geometry.setupWhy}. Fix the weights, or write the bind-space pairs ` +
            'yourself and start the run with "offset".',
        );
      }
      const report = evaluateDeformTransform(key.transform, geometry.setup, r6, `${where} (t=${key.t})`, geometry.depth);
      if (report.offsets.length !== geometry.vertexCount * 2) {
        // Unreachable while `setup` is one pair per vertex, which is the whole
        // reason both are derived from the same walk. Stated rather than
        // assumed: a silent mismatch here is the overrun A35 exists for.
        throw new CompileError(
          `${where} (t=${key.t}): the transform produced ${report.offsets.length} numbers for ` +
            `${geometry.vertexCount} vertices`,
        );
      }
      // -- one displacement per vertex -> one pair per influence (issue #389) -
      //
      // On a single-space attachment the two are the same array and this is a
      // no-op by construction. On a multi-influence one the model's output is a
      // WORLD displacement, and it reaches the deform array through each
      // influencing bone's own inverse: `Σ wᵢ · Mᵢ · Mᵢ⁻¹ · D = D`. The
      // displacement it expands is the ROUNDED one the report prints, so a
      // reader can reproduce every emitted pair from the audit rather than from
      // a second evaluation.
      const run = expandDeformToInfluences(report.offsets, geometry);
      if (run.length !== geometry.deformLength) {
        throw new CompileError(
          `${where} (t=${key.t}): the transform expanded to ${run.length} numbers and this attachment's deform ` +
            `array is ${geometry.deformLength} long`,
        );
      }
      generated.push({
        animation: animName,
        skin,
        slot: track.slot,
        attachment: track.attachment,
        time,
        ...report,
        // ⚠️ Which space the model was read in is not a detail: `radius`,
        // `about`, `from` and `to` all mean something different in world
        // coordinates, and a reader comparing two keys on two attachments has no
        // other way to know they were not evaluated alike. Said only on the path
        // where it is not the attachment's own space, so every existing report
        // prints exactly the lines it printed before.
        ...(geometry.influenceBones === null
          ? {}
          : {
              expanded: run,
              derived: [
                ...report.derived,
                `evaluated at setup WORLD positions, because ${geometry.vertexCount} vertices carry ` +
                  `${geometry.deformLength / 2} influences; each displacement D is written into every influence as ` +
                  'Mᵢ⁻¹·D, so the runtime composes Σwᵢ·Mᵢ·Mᵢ⁻¹·D = D',
              ],
            }),
      });
      out.push({ time, vertices: run });
      continue;
    }
    if (key.offset !== undefined && key.fromVertex !== undefined) {
      throw new CompileError(
        `${where} (t=${key.t}): a key gives its start as "offset" (an index into the deform array) or as ` +
          '"fromVertex" (a vertex index rigc translates), never both',
      );
    }
    const run = key.vertices ?? null;
    if (run === null) {
      // The parser's own encoding for "no edit": with no `vertices` the deform is
      // the setup pose. `offset`/`fromVertex` would be pointing into nothing, and
      // two spellings of one key must not emit two different files.
      if (key.offset !== undefined || key.fromVertex !== undefined) {
        throw new CompileError(
          `${where} (t=${key.t}): the key has no "vertices", which is the format's way of saying "back to the ` +
            'setup pose" — so there is nothing for a start index to point at. Drop the offset, or give it a run.',
        );
      }
      out.push({ time });
      continue;
    }
    if (!Array.isArray(run) || run.length === 0) {
      throw new CompileError(
        `${where} (t=${key.t}): "vertices" is ${JSON.stringify(key.vertices)}; give an array of x, y offsets, ` +
          'or omit it entirely for "back to the setup pose"',
      );
    }
    // ⛔ No parity clause here, and its absence is the rule (issue #576).
    //
    // A run is copied, not decoded. `SkeletonJson`'s deform branch does
    // `Utils.arrayCopy(verticesValue, 0, deform, start, verticesValue.length)`
    // with `start` the key's own `offset`, and `SkeletonBinary` reads a count and
    // a start and fills `for (let v = start; v < end; v++) deform[v] = ...`.
    // Neither has any pair arithmetic to be misaligned against, so an ODD run is
    // legal, deterministic data: it writes the x and y of one vertex and the x of
    // the next, and that next y stays at its setup value.
    //
    // 🔒 The reason this cannot be "refused in THIS spec anyway" is that there is
    // no other spelling of it. Padding a `0` to make the run even is a different
    // animation wherever the setup y it lands on is non-zero, so a spec that
    // refuses an odd run is a spec no transcription of such a file can be written
    // in — and one is in this repository's own example corpus (`spineboy-pro`,
    // `hoverboard` / `hoverboard-board`: `offset: 1` and 147 numbers into a
    // 148-long array, the whole delta minus the leading zero the editor trimmed).
    //
    // What replaces it is the bound the runtime really has, below: the run has to
    // FIT. That one is the quiet defect — a copy past the end of a `Float32Array`
    // is a no-op in JavaScript — and it is unaffected by where a run starts or
    // how long it is. `A35_DEFORM_KEYS_FIT_THE_ATTACHMENT` measures the same
    // bound on the emitted file and has had no parity clause since issue #262;
    // until this was removed the two halves of rigc disagreed about what the
    // format holds, and the half that refused was the authoring half.
    for (const n of run) {
      if (typeof n !== 'number' || !Number.isFinite(n)) {
        throw new CompileError(`${where} (t=${key.t}): "vertices" holds a non-finite value ${JSON.stringify(n)}`);
      }
    }
    const start = deformStart(key, run.length, geometry, where);
    if (start + run.length > geometry.deformLength) {
      throw new CompileError(
        `${where} (t=${key.t}): the run starts at deform index ${start} and is ${run.length} long, which ends at ` +
          `${start + run.length}; this attachment's deform array is ${geometry.deformLength} long ` +
          `(${geometry.weighted ? `${geometry.deformLength / 2} bone influences` : `${geometry.vertexCount} vertices`}). ` +
          'The parser copies into a Float32Array, so everything past the end is dropped without a word.',
      );
    }
    const entry: SpineTimelineKey = { time };
    // `offset` defaults to 0 in the parser and the editor omits it there, so an
    // authored 0, an authored `fromVertex: 0` and an absent start all emit the
    // same bytes — one meaning, one file.
    if (start !== 0) entry.offset = start;
    entry.vertices = run.map(r6);
    out.push(entry);
  }
  // Curves go on in a second pass because a key's curve depends on the NEXT key's
  // emitted geometry — a named easing over a hold is `stepped` — and that
  // geometry is only known once the next key has been through the checks above.
  for (let i = 0; i < out.length; i++) deformKeyCurve(out[i], keys[i], keys, i, motion, where, out[i + 1]);
  return out;
}

/**
 * A stated model's per-vertex displacement, as the deform array holds it.
 *
 * Two encodings once more, and the caller does not choose between them —
 * `influenceBones` does, because it is null exactly when `setup` was already the
 * array's own space:
 *
 *   one space  — the displacements ARE the array, returned untouched. This is
 *                every `transform` key that compiled before issue #389, and
 *                returning the same array object is what makes that visibly
 *                true rather than arithmetically true.
 *   several    — `D` is in world, and influence `i` of a vertex gets
 *                `Mᵢ⁻¹ · D` (rotation and scale, no translation), which the
 *                runtime sums back to `D · Σ wᵢ = D`.
 *
 * ⚠️ `toBoneLocalVector` and not `toBoneLocal`: a displacement has no origin to
 * subtract, and subtracting one would move the vertex by the bone's own
 * position. The coordinate contract lives in `src/transform.ts` and this reads
 * it rather than restating it.
 */
function expandDeformToInfluences(displacements: number[], geometry: DeformGeometry): number[] {
  const perInfluence = geometry.influenceBones;
  if (perInfluence === null) return displacements;
  const counts = geometry.boneCounts ?? [];
  const out: number[] = [];
  for (let v = 0, k = 0; v < counts.length; v++) {
    const dx = displacements[2 * v];
    const dy = displacements[2 * v + 1];
    for (let n = 0; n < counts[v]; n++, k++) {
      const [bx, by] = toBoneLocalVector(perInfluence[k], dx, dy);
      out.push(r6(bx), r6(by));
    }
  }
  return out;
}

/**
 * Where in the deform array this key's run begins.
 *
 * `offset` is that index outright — any index the array holds, odd ones included
 * (issue #576). `fromVertex` is a vertex index, and turning one into the other is
 * exact only where a vertex occupies exactly one pair — which is every vertex of
 * an unweighted attachment and only the single-bone vertices of a weighted one.
 */
function deformStart(
  key: MotionDeformTrack['keys'][number],
  runLength: number,
  geometry: DeformGeometry,
  where: string,
): number {
  if (key.offset !== undefined) {
    if (!Number.isInteger(key.offset) || key.offset < 0) {
      throw new CompileError(
        `${where} (t=${key.t}): offset is ${JSON.stringify(key.offset)}; it is an index into the deform array, so a whole number ≥ 0`,
      );
    }
    // ⛔ An odd `offset` is not refused either, and it went the same way as the
    // run's own length (issue #576). The refusal that stood here read an odd
    // start as a `fromVertex` typed into the wrong field — a real mistake, but
    // this caught exactly the half of it whose index happens to be odd:
    // `offset: 4` meant as vertex 4 is the same mistake, lands on vertex 2, and
    // was always accepted. What it did refuse was every faithful transcription of
    // a trimmed editor run, one of which ships in `examples/` — `spineboy-pro`'s
    // `hoverboard-board` starts at 1. A rule that filters one parity of a
    // confusion it cannot see, at the price of a construct the format holds, is
    // the wrong instrument; `A35` dropped the same clause in issue #262.
    return key.offset;
  }
  if (key.fromVertex === undefined) return 0;
  const from = key.fromVertex;
  if (!Number.isInteger(from) || from < 0) {
    throw new CompileError(`${where} (t=${key.t}): fromVertex is ${JSON.stringify(from)}; it is a vertex index, so a whole number ≥ 0`);
  }
  // ⌈⌉ rather than ÷, because an odd run REACHES a last vertex without covering
  // it: its final number is that vertex's x and the y beside it stays at setup
  // (issue #576). The bound below is about which vertices the run reaches, so the
  // half-reached one counts — and on a weighted attachment its influence count is
  // checked with the rest.
  const covered = Math.ceil(runLength / 2);
  if (from + covered > geometry.vertexCount) {
    throw new CompileError(
      `${where} (t=${key.t}): fromVertex ${from} plus ${covered} vertex offset(s) runs to vertex ${from + covered}, ` +
        `and the attachment has ${geometry.vertexCount}`,
    );
  }
  if (!geometry.weighted) return from * 2;
  const counts = geometry.boneCounts!;
  for (let v = from; v < from + covered; v++) {
    if (counts[v] === 1) continue;
    throw new CompileError(
      `${where} (t=${key.t}): "fromVertex" counts VERTICES, and this attachment is weighted — its deform array ` +
        `holds one x, y pair per bone INFLUENCE, and vertex ${v} has ${counts[v]} of them. One offset per vertex ` +
        'is not a thing that array can hold: the world offset of a multi-bone vertex is the weighted sum of a ' +
        'per-bone offset in each bone\'s own bind space, so rigc will not guess one for you. Either key the ' +
        'control bone instead, or write the bind-space pairs yourself and start the run with "offset" ' +
        `(vertex ${from} starts at deform index ${2 * counts.slice(0, from).reduce((a, b) => a + b, 0)}).`,
    );
  }
  let start = 0;
  for (let v = 0; v < from; v++) start += counts[v];
  return start * 2;
}

/**
 * A deform key's curve.
 *
 * One channel, and it is not any value in `vertices`: `readCurve(curve, timeline,
 * bezier, frame, 0, time, time2, 0, 1, 1)` builds the cubic between **0 and 1**,
 * the fraction of the way from this key's geometry to the next one's. So a named
 * easing here is the same shape it would be anywhere, applied to the blend rather
 * than to a coordinate, and a raw curve is four numbers whose value axis is 0..1.
 */
function deformKeyCurve(
  entry: SpineTimelineKey,
  key: MotionDeformTrack['keys'][number],
  keys: MotionDeformTrack['keys'],
  index: number,
  motion: MotionSpec,
  where: string,
  /** The next key AS EMITTED, or undefined on the last key. */
  next: SpineTimelineKey | undefined,
): SpineTimelineKey {
  if (key.ease !== undefined && key.curve !== undefined) {
    throw new CompileError(`${where}: a key carries both a named easing and a raw curve; pick one`);
  }
  if (key.curve !== undefined) {
    if (next === undefined) throw new CompileError(`${where}: last key carries a curve but has nothing to ease to`);
    entry.curve = rawCurve(key.curve, 1, where, String(key.t));
    return entry;
  }
  if (key.ease === undefined) return entry;
  if (next === undefined) throw new CompileError(`${where}: last key carries an easing but has nothing to ease to`);
  if (key.ease === 'stepped') {
    entry.curve = 'stepped';
    return entry;
  }
  const handles = motion.easings?.[key.ease];
  if (!handles) throw new CompileError(`${where}: unknown easing "${key.ease}"`);
  // The one channel runs 0 -> 1; the VALUE being held is the geometry, so the
  // hold test compares the two keys' runs rather than those two constants.
  entry.curve = easingCurve(handles, entry.time as number, keyTime(keys[index + 1].t), [0], [1], sameDeform(entry, next));
  return entry;
}

/**
 * True when two deform keys, AS EMITTED, describe one geometry.
 *
 * A deform key's value is its run — `vertices` starting at `offset` — and the
 * parser reads everything outside the run, and a key with no `vertices` at all,
 * as zero offset from the setup pose. So a run of zeros, a shorter run and no run
 * are three spellings of one geometry, and the comparison expands both keys onto
 * the same index range before reading them. The runs are already `r6`'d.
 */
function sameDeform(a: SpineTimelineKey, b: SpineTimelineKey): boolean {
  const runOf = (k: SpineTimelineKey): { start: number; run: number[] } => ({
    start: typeof k.offset === 'number' ? k.offset : 0,
    run: Array.isArray(k.vertices) ? (k.vertices as number[]) : [],
  });
  const at = (r: { start: number; run: number[] }, i: number): number =>
    i >= r.start && i < r.start + r.run.length ? r.run[i - r.start] : 0;
  const ra = runOf(a);
  const rb = runOf(b);
  const end = Math.max(ra.start + ra.run.length, rb.start + rb.run.length);
  for (let i = 0; i < end; i++) if (at(ra, i) !== at(rb, i)) return false;
  return true;
}

function resolveTargets(track: MotionTrack, motion: MotionSpec, animName: string): string[] {
  const targetFields = ['slot', 'group', 'bone', ...CONSTRAINT_TRACK_TARGETS] as const;
  const named = targetFields.filter((field) => track[field] !== undefined);
  if (named.length > 1) {
    throw new CompileError(
      `animation "${animName}": a track names more than one target (${named.join(', ')}); the list is ` +
        `${targetFields.join('/')} and a track names exactly one`,
    );
  }
  const family = constraintFamilyOf(track);
  if (family) {
    const { tracks, label } = CONSTRAINT_TRACK_FAMILIES[family];
    const direct = track[family];
    const who = direct === undefined ? `group "${String(track.group)}"` : `${label} "${direct}"`;
    if (!(track.property in tracks)) {
      throw new CompileError(
        `animation "${animName}": ${who} has no timeline "${track.property}" (it has: ${Object.keys(tracks).join(', ')})`,
      );
    }
    if (direct !== undefined) return [direct];
    const members = motion.groups?.[String(track.group)];
    if (!members) throw new CompileError(`animation "${animName}": unknown group "${String(track.group)}"`);
    return members;
  }
  // A constraint timeline with no constraint named. Worth its own refusal: the
  // property names a family, so the message can say which field would carry it
  // rather than leaving the track to be read as a slot track and refused for
  // targeting a slot nobody declared.
  const owning = CONSTRAINT_TRACK_TARGETS.filter((f) => track.property in CONSTRAINT_TRACK_FAMILIES[f].tracks);
  if (owning.length) {
    throw new CompileError(
      `animation "${animName}": "${track.property}" is a ${owning.map((f) => CONSTRAINT_TRACK_FAMILIES[f].label).join(' / ')} ` +
        `timeline, and this track names no constraint — put the name in "${owning.join('" or "')}"`,
    );
  }
  const isBoneTrack = track.property in BONE_TRACKS;
  if (isBoneTrack && !track.bone && !track.group) {
    throw new CompileError(`animation "${animName}": "${track.property}" is a bone track but no bone is named`);
  }
  if (!isBoneTrack && track.bone) {
    // The bone family's sibling of `compileTrack`'s slot refusal, raised here for
    // the same reason it is raised there: before any key is shaped, and printed
    // from the dispatch table itself. What it replaces named the SLOT family for
    // a property that is usually in no family at all, and enumerated nothing
    // (issue #656). The tail clause is the one case where the old sentence was
    // true — `rgba` and `attachment` really are slot timelines — so the redirect
    // survives as a clause instead of as the whole message, and it is read off
    // `SLOT_TRACKS` rather than spelled again. A constraint property never
    // reaches here: `owning` above refuses it with the field that carries it.
    throw new CompileError(
      `animation "${animName}" bone "${track.bone}" has no timeline "${track.property}" ` +
        `(it has: ${Object.keys(BONE_TRACKS).join(', ')})` +
        (track.property in SLOT_TRACKS ? `. "${track.property}" is a slot timeline — put the name in "slot"` : ''),
    );
  }
  if (track.bone) return [track.bone];
  if (track.slot) return [track.slot];
  if (track.group) {
    // A group's members are bones, slots or physics constraints depending on the
    // property, which is what lets `stagger` express a lag across them: four
    // members, one track, a few frames apart — the difference between a ring
    // following the part and two objects moving together, which reads as a
    // composite.
    const members = motion.groups?.[track.group];
    if (!members) throw new CompileError(`animation "${animName}": unknown group "${track.group}"`);
    // 🚨 The group is the one target shape whose FAMILY is decided by the
    // property, and three tables decide it: `constraintFamilyOf` asks
    // `property in PHYSICS_TRACKS`, this function asks `property in BONE_TRACKS`,
    // and what neither claims falls through to the slot branch. So a property in
    // no table left the dispatch with no family at all and the track was read as
    // a slot track — the first member was then refused for not being a slot
    // (`animation "A" targets unknown slot "rim_grip_a"` on a group of bones and
    // a misspelled bone property), or, when the members really were slots, with
    // the slot table alone on a family nothing had determined (issue #661).
    //
    // Raised AFTER the group's own existence check, because "group G has no
    // timeline P" would otherwise assert a group the file does not declare, and
    // BEFORE the members are resolved against the rig or any key is shaped: the
    // property is what the dispatch reads first, so it is what the refusal is
    // about. All three lists come from the objects the dispatch reads, so none
    // of them can drift from the emitter that owns it. A property that IS in
    // `PHYSICS_TRACKS` never reaches this line — `constraintFamilyOf` returns
    // `physics` for a group track that names one, and the family branch above
    // has already returned — and a path or slider property is refused further up
    // with the field its constraint's name goes in.
    if (!(track.property in BONE_TRACKS) && !(track.property in SLOT_TRACKS)) {
      throw new CompileError(
        `animation "${animName}" group "${track.group}" has no timeline "${track.property}" ` +
          `(a bone group has: ${Object.keys(BONE_TRACKS).join(', ')}; ` +
          `a slot group has: ${Object.keys(SLOT_TRACKS).join(', ')}; ` +
          `a ${CONSTRAINT_TRACK_FAMILIES.physics.label} group has: ${Object.keys(PHYSICS_TRACKS).join(', ')})`,
      );
    }
    return members;
  }
  throw new CompileError(`animation "${animName}": a track targets neither slot nor group`);
}

/**
 * The `groups` table itself, checked once before any animation reads it.
 *
 * ⭐ **A member named twice is refused here and nowhere else.** JSON collapses a
 * repeated object key silently, so a repeat inside a `v` map or a `depth` map is
 * unreachable by the time `JSON.parse` is done with it — the group declaration
 * is the one place a repeated member survives into the data, and it is also the
 * place that decides `stagger`'s member order. A duplicate there used to reach
 * the per-target loop and come back as *"animation X has two tracks on
 * eye_l.translatex; merge them"* — true of nothing the author wrote, and it
 * names the wrong file.
 *
 * An **empty** group is refused for the reason a vacuous assertion is: a track
 * naming one compiles no timeline at all, reports nothing, and gates green.
 */
function checkMotionGroups(motion: MotionSpec): void {
  for (const [name, members] of Object.entries(motion.groups ?? {})) {
    if (!Array.isArray(members)) {
      throw new CompileError(`group "${name}" is ${JSON.stringify(members)}; it is an array of member names`);
    }
    if (members.length === 0) {
      throw new CompileError(
        `group "${name}" declares no members, so every track naming it would compile no timeline and gate green`,
      );
    }
    const seen = new Set<string>();
    members.forEach((member, i) => {
      if (typeof member !== 'string' || member.length === 0) {
        throw new CompileError(`group "${name}" member ${i} is ${JSON.stringify(member)}; it is a bone or slot name`);
      }
      if (seen.has(member)) {
        throw new CompileError(
          `group "${name}" names member "${member}" twice (at index ${members.indexOf(member)} and ${i}). ` +
            'Member order is what `stagger` counts and what a per-member value map is read against, so a repeat is ' +
            'two different delays and two different values for one bone.',
        );
      }
      seen.add(member);
    });
  }
}

/** Is this `v` the per-member map rather than one value? */
function isMemberValues(v: unknown): v is MotionMemberValues {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Resolve a track's values **per target**: a plain `v` unchanged, a stated `v`
 * map split up, or a `derive` model evaluated — plus the report `explain` prints
 * (issue #295).
 *
 * Every track goes through here, and a track with no per-member value in it
 * comes out holding exactly the keys it went in with. That is deliberate: it
 * makes "`v` means one thing below this line" a property of the type
 * (`MotionValueTrack`) rather than of a branch somebody has to remember.
 *
 * ## Why the whole track is resolved at once
 *
 * Because a model is **one statement about all the members**, and the report has
 * to be able to print them side by side. Evaluating per target would run the
 * closed form once per member, produce N reports of one row each, and lose the
 * only arrangement in which a wrong sign is visible.
 */
function resolveMemberTrack(
  track: MotionTrack,
  animName: string,
  targets: readonly string[],
  bones: readonly SpineBone[],
  derivations: CompileResult['trackDerivations'],
): Map<string, MotionValueTrack> {
  const carriesMap = track.keys.some((key) => isMemberValues(key.v));
  const carriesModel = track.keys.some((key) => key.derive !== undefined);

  const targetKind: 'group' | 'bone' = track.group === undefined ? 'bone' : 'group';
  const target = track.group ?? track.bone ?? String(targets[0]);
  const at = `animation "${animName}" ${targetKind} "${target}" ${track.property}`;
  if ((carriesMap || carriesModel) && track.group === undefined && track.bone === undefined) {
    throw new CompileError(
      `${at}: per-member values need a target whose members are named — put them on a track that names a "group", or ` +
        'a "bone" for the one-member case',
    );
  }
  if (carriesMap && targetKind === 'bone') {
    throw new CompileError(
      `${at}: a per-member "v" map names members, and a bone track has one target rather than members. Write the ` +
        'value directly, or move the track onto a group.',
    );
  }

  // The setup coordinate a `derive` kind reads, and the parent it is measured in.
  // Resolved here rather than in `src/trackgen.ts` because the rig is the
  // compiler's to read: the model gets numbers that already mean one thing.
  const boneOf = new Map(bones.map((b) => [b.name, b]));
  const perTarget = new Map<string, MotionValueKey[]>();
  for (const name of targets) perTarget.set(name, []);

  for (const key of track.keys) {
    const where = `${at} (t=${key.t})`;
    if (key.derive !== undefined && isMemberValues(key.v)) {
      throw new CompileError(
        `${where}: this key carries both a "derive" model and a per-member "v" map — two answers to one question. ` +
          'The model states the arithmetic and the depths that produced the numbers; the map states the numbers. ' +
          'Pick one.',
      );
    }
    if (key.derive === undefined) {
      // Either a plain value (every member gets it, as today) or a stated map.
      if (!isMemberValues(key.v)) {
        for (const name of targets) perTarget.get(name)!.push({ ...key, v: key.v as number[] | string | null });
        continue;
      }
      const table = key.v;
      const known = new Set(targets);
      for (const named of Object.keys(table)) {
        if (!known.has(named)) {
          throw new CompileError(
            `${where}: the value map names "${named}", which group "${target}" does not declare ` +
              `(its members are: ${targets.join(', ')})`,
          );
        }
      }
      const row: Array<{ member: string; value: number[] | string | null }> = [];
      for (const name of targets) {
        if (!(name in table)) {
          throw new CompileError(
            `${where}: the value map states no value for member "${name}" ` +
              `(it states: ${Object.keys(table).join(', ') || 'nothing'}). ` +
              'A member is refused rather than defaulted: an absent value is exactly the thing a map of six is ' +
              'written to make visible, and defaulting it to the identity would key that one bone with a different ' +
              'motion in silence.',
          );
        }
        const value = table[name];
        perTarget.get(name)!.push({ ...key, v: value });
        row.push({ member: name, value });
      }
      derivations.push({
        animation: animName,
        target,
        targetKind,
        property: track.property,
        time: keyTime(key.t + (track.lag ?? 0)),
        authoredTime: key.t,
        model: null,
        members: row,
      });
      continue;
    }

    // A stated model. The members' setup coordinates come off the rig, and the
    // one thing that makes them comparable is that they are measured in the SAME
    // space — see the refusal below.
    const kind = (key.derive as { kind?: unknown }).kind;
    const coordinate =
      typeof kind === 'string' && kind in TRACK_DERIVE_PROJECTIONS
        ? TRACK_DERIVE_PROJECTIONS[kind as keyof typeof TRACK_DERIVE_PROJECTIONS].coordinate
        : 'x';
    const members: TrackDeriveMember[] = [];
    const parents = new Set<string>();
    for (const name of targets) {
      const bone = boneOf.get(name);
      if (!bone) {
        throw new CompileError(
          `${where}: derive reads member "${name}"'s setup position, and this rig declares no such bone. ` +
            'A model over a group of slots or constraints has no coordinate to be evaluated at — state the values ' +
            'as a "v" map.',
        );
      }
      parents.add(bone.parent ?? '(root)');
      members.push({ name, at: coordinate === 'x' ? (bone.x ?? 0) : (bone.y ?? 0) });
    }
    if (parents.size > 1) {
      throw new CompileError(
        `${where}: derive measures every member's "${coordinate}" from its parent's origin and "about" says where the ` +
          `axis crosses it, so one space is what makes the members comparable. These members sit under ` +
          `${parents.size} different parents (${[...parents].join(', ')}), and their coordinates are therefore ` +
          'measured from different origins. Split the track by parent, or state the values as a "v" map.',
      );
    }
    const report = evaluateTrackDerive(key.derive, track.property, members, r6, where);
    const row: Array<{ member: string; value: number[] | string | null }> = [];
    report.members.forEach((m, i) => {
      perTarget.get(members[i].name)!.push({ ...key, v: [m.value] });
      row.push({ member: m.member, value: [m.value] });
    });
    derivations.push({
      animation: animName,
      target,
      targetKind,
      property: track.property,
      time: keyTime(key.t + (track.lag ?? 0)),
      authoredTime: key.t,
      model: report,
      members: row,
    });
  }

  const out = new Map<string, MotionValueTrack>();
  for (const name of targets) out.set(name, { ...track, keys: perTarget.get(name)! });
  return out;
}

/**
 * What an attachment key may name, per slot, and where the compiler looked.
 *
 * An attachment timeline names a slot and a placeholder and no skin — the skin
 * is the consumer's, applied at run time — so the names a key may draw from are
 * every emitted skin's placeholders for that slot, `default` included. Built in
 * `compileInto` off `skinTables`, under the `-- 5. animations` banner; see the
 * comment there for why it is the emitted tables rather than the spec that decides.
 */
interface SlotAttachmentIndex {
  /** slot -> every placeholder any emitted skin fills it with. */
  bySlot: Map<string, Set<string>>;
  /** The skins consulted, in emit order (`default` first), for the refusal to name. */
  searched: string[];
}

function compileTrack(
  track: MotionValueTrack,
  motion: MotionSpec,
  animName: string,
  duration: number,
  target: string,
  shift: number,
  attachments: SlotAttachmentIndex,
  darkSlots: ReadonlySet<string>,
): SpineTimelineKey[] {
  const where = `animation "${animName}" slot "${target}" ${track.property}`;
  // Before any key is shaped, and before the empty-track refusal: a property
  // the emitter has no branch for is the fault, and a track that names one has
  // no shape to be missing keys from (issue #650).
  const shape = SLOT_TRACKS[track.property];
  if (shape === undefined) {
    throw new CompileError(
      `animation "${animName}" slot "${target}" has no timeline "${track.property}" ` +
        `(it has: ${Object.keys(SLOT_TRACKS).join(', ')})`,
    );
  }
  // 🚨 Raised here, with the target and before the keys, for the same reason as
  // the refusal above: the fault is in the pairing of timeline and slot, not in
  // any key. A two-colour timeline poses `SlotPose.darkColor`, and the runtime
  // creates that object only for a slot whose setup pose HAS one — `Slot`'s
  // constructor reads `if (data.setupPose.darkColor != null)` before allocating
  // it. Measured on the emitted file with the refusal removed: `SkeletonJson`
  // loads it in silence, `SlotData.setupPose.darkColor` is `null`, and the first
  // `state.apply` throws `TypeError: null is not an object (evaluating 'dark.r =
  // …')` inside `RGBA2Timeline.apply1`. That is a crash in the consumer's
  // process, from a file every parser accepts — the exact silence this compiler
  // exists to convert into a name (issue #690).
  if (shape === 'rgba2' && !darkSlots.has(target)) {
    throw new CompileError(
      `${where}: slot "${target}" declares no setup "dark", and an "rgba2" timeline poses a slot's dark colour — ` +
        'the runtime allocates one only for a slot whose setup pose has it, so applying this animation throws ' +
        `instead of tinting. Give slot "${target}" a \`dark\` in the rig spec (the colour it holds at rest), or ` +
        'key "rgba" if only the light colour moves',
    );
  }
  if (!track.keys.length) throw new CompileError(`${where}: no keys`);

  const out: SpineTimelineKey[] = [];
  for (let i = 0; i < track.keys.length; i++) {
    const key = track.keys[i];
    const next = track.keys[i + 1];
    const time = keyTime(key.t + shift);
    if (i > 0 && time <= (out[i - 1].time as number)) {
      throw new CompileError(`${where}: key times must strictly increase (at t=${key.t})`);
    }
    checkKeyTime(where, time, key.t, duration);

    if (shape === 'attachment') {
      if (key.v !== null && typeof key.v !== 'string') {
        throw new CompileError(`${where}: attachment key value must be a string or null`);
      }
      // Resolved against every skin, not just `default` — see `SlotAttachmentIndex`.
      const known = attachments.bySlot.get(target);
      if (key.v !== null && !(known?.has(key.v) === true)) {
        // Both halves are the message's work. "searched" answers *where did you
        // look*, which is the question a four-skin rig's author actually has and
        // the one a bare "is not in slot" left them guessing at; the list of
        // placeholders is the value REQUIRED, which the doctrine asks of every
        // failure detail and which the deform refusal above already prints.
        throw new CompileError(
          `${where}: attachment "${key.v}" is not in slot "${target}" under any skin ` +
            `(searched: ${attachments.searched.join(', ')}) — ` +
            (known === undefined || known.size === 0
              ? 'the slot has no attachments at all'
              : `the slot has: ${[...known].join(', ')}`),
        );
      }
      if (key.ease) throw new CompileError(`${where}: attachment keys cannot carry an easing`);
      // Attachment timelines are inherently stepped — exactly what lip-sync wants.
      out.push({ time, name: key.v });
      continue;
    }

    // rgba / rgba2 — the two colour shapes `SLOT_TRACKS` names, and between them
    // the only ways left to reach here: `attachment` returned above and a
    // property the table does not carry was refused before any key was shaped.
    //
    // ⚠️ The two differ in three places and nowhere else, so they are read out of
    // `shape` rather than forked into two loops: how many channels a `v` carries,
    // which FIELDS the emitted key spells them as (`color`, or `light` + `dark`),
    // and therefore how long a raw curve array is. Everything else — the
    // ease/curve exclusivity, the stepped case, the hold test, the last-key
    // refusals — is one rule, and a second copy of it is a second thing to keep
    // in step.
    const spelling = shape === 'rgba2' ? '[lr,lg,lb,la,dr,dg,db]' : '[r,g,b,a]';
    const channels = shape === 'rgba2' ? 7 : 4;
    const colourOf = (v: number[]): Record<string, string> => (shape === 'rgba2' ? rgba2Hex(v) : { color: rgbaHex(v) });
    if (!Array.isArray(key.v)) throw new CompileError(`${where}: ${shape} key value must be ${spelling}`);
    const entry: SpineTimelineKey = { time, ...colourOf(key.v) };
    if (key.ease !== undefined && key.curve !== undefined) {
      throw new CompileError(`${where}: a key carries both a named easing and a raw curve; pick one`);
    }
    if (key.curve !== undefined) {
      if (!next) throw new CompileError(`${where}: last key carries a curve but has nothing to ease to`);
      entry.curve = rawCurve(key.curve, channels, where, String(key.t));
      out.push(entry);
      continue;
    }
    if (key.ease && next) {
      if (key.ease === 'stepped') {
        entry.curve = 'stepped';
      } else {
        const handles = motion.easings?.[key.ease];
        if (!handles) throw new CompileError(`${where}: unknown easing "${key.ease}"`);
        if (!Array.isArray(next.v)) {
          throw new CompileError(`${where}: ${shape} key value must be ${spelling}`);
        }
        const t2 = keyTime(next.t + shift);
        // 4 numbers per channel, in the format's own channel order — 16 for
        // `rgba` (r g b a), 28 for `rgba2` (light r g b a, then dark r g b, which
        // is the order `readCurve` indexes them in). Short arrays become NaN
        // curves with no error. The hold test reads the emitted hex rather than
        // the authored floats: two colours that quantise to one byte are one
        // colour in the file, and for `rgba2` that has to be true of BOTH — a key
        // whose light holds while its dark moves is not a hold.
        const held = JSON.stringify(colourOf(key.v)) === JSON.stringify(colourOf(next.v));
        entry.curve = easingCurve(handles, time, t2, key.v, next.v, held);
      }
    } else if (key.ease && !next) {
      throw new CompileError(`${where}: last key carries an easing but has nothing to ease to`);
    }
    out.push(entry);
  }
  return out;
}
