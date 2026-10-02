/**
 * The seam the Spine side registers into (issue #1052, step 4e of #380).
 *
 * ⭐ Everything rigc does without spine-core lives in modules that link
 * nothing of it — the posing seam and its samplers, the candidate and its
 * poser choice, the framing and the rasteriser (`./render_shared.ts`), the
 * deform survey's choice of reader (`./deformbuild.ts`). Where one of those
 * reaches an input only the runtime can read — a Spine export, `--poser
 * spine`, a fallback the poser line names, a skeleton spine-core already
 * parsed — it asks this registry for the Spine side instead of importing it.
 * The modules that link the runtime fill it when they are loaded:
 * `./render.ts` registers the posing side (spine-core's poser, the export's
 * loader, its atlas reader), `./deformmeasure.ts` the survey's spine-core
 * reader and poser. So a program that imports either of them — `cli.ts`, the
 * tools, the selftest — behaves exactly as it did before the registry
 * existed, and an entry that imports neither links nothing of the runtime and
 * refuses such an input by name (`SpineRuntimeError`, the sentence below).
 *
 * 🔒 Nothing here is a fallback or a default. With nothing registered, the
 * question "what would spine-core say about this input" has no answer, and
 * the refusal says which input asked it and why it needed the runtime.
 */
import type { DeformSurvey } from './deformsurvey.ts';
import type { DeformSurveyInput } from './deformbuild.ts';
import type { Poser, SkeletonFacts, SkinRoster, SubstituteRegion } from './render_shared.ts';

/**
 * A skeleton spine-core parsed, as the side of the seam that does not link
 * the runtime holds it: opaque. Only the module that registered the posing
 * side reads it (`SkeletonData` in `./render.ts`), so nothing here names the
 * runtime's type.
 */
export type SpineSkeletonData = object;

/**
 * Posing an input through spine-core when the runtime cannot be reached —
 * refused naming the input and why it needs the runtime (issue #1014).
 *
 * A Spine export, `--poser spine` and a fallback the poser line names are what
 * spine-core is loaded for; a rigc build the core poses reads nothing through
 * it. So the one run that can meet a runtime it cannot use is one of those
 * three, and it says so rather than surfacing whatever the first access threw.
 *
 * Since issue #1052 it is also the refusal of an entry that registered no
 * Spine side (`SPINE_SIDE_ABSENT`): the same three inputs, the same sentence,
 * and the reason is that the runtime is not linked at all.
 */
export class SpineRuntimeError extends Error {}

/** What `render` and `check` say after the reason, naming what the runtime is for. */
export const POSING_RUNTIME_TAIL =
  'spine-core is what poses a Spine export, --poser spine and a fallback the poser line names; ' +
  'a rigc build the core poses reads nothing through it';

/** What `explain`'s deform survey says after the reason. */
export const SURVEY_RUNTIME_TAIL =
  'spine-core is what reads and poses a Spine export, --poser spine and a fallback the survey names; ' +
  'a rigc build the core poses reads nothing through it';

/**
 * The reason an entry that registered no Spine side gives — in the place the
 * runtime's own error stands when it is linked and cannot be used.
 */
export const SPINE_SIDE_ABSENT = 'the runtime side is not installed in this entry, which links nothing of spine-core';

/**
 * What an entry that registered no Spine side adds after the tail: where the
 * runtime is (issue #1079). On an install `bin/rigc.cjs` runs this entry
 * wherever `@esotericsoftware/spine-core` does not resolve, so "the runtime is
 * not linked" there means "it is not installed" — and a clone runs it as
 * `bun cli_core.ts`, so both routes are named, each for its reader.
 *
 * ⚠️ Only the absent side says it. A runtime that is linked and fails to load
 * (`./render.ts`, `./deformmeasure.ts`) is installed already, and "install it
 * beside the package" would be the wrong sentence there.
 */
export const SPINE_SIDE_ROUTE =
  'the entry that links it runs them — installed, the same `rigc` once @esotericsoftware/spine-core is installed beside the package; ' +
  'from a source checkout, `bun cli.ts`';

/** The one sentence a run that needs the runtime and cannot use it is refused in — `tail` says what the runtime is for. */
export function spineRuntimeSentence(label: string, why: string, reason: string, tail: string): string {
  return `${label} is posed through spine-core (${why}), and the runtime could not be used: ${reason}. ${tail}`;
}

/** What `./render.ts` registers: spine-core's poser, the export's loader and its atlas reader. */
export interface SpinePosingSide {
  /** Touch the runtime once and refuse by name when it cannot be used (`SpineRuntimeError`). */
  requireRuntime(label: string, why: string): void;
  /** A skeleton parsed against its atlas; a pair the runtime cannot load is `refuse`'s refusal, given the runtime's message. */
  skeletonData(skeletonText: string, atlasText: string, refuse: (runtime: string) => Error): SpineSkeletonData;
  /** What `render` and `check` read off a skeleton spine-core parsed, `atlasText` the atlas it was parsed through. */
  facts(data: SpineSkeletonData, atlasText: string | null): SkeletonFacts;
  /** spine-core's implementation of the posing seam over a parsed skeleton. */
  poser(data: SpineSkeletonData): Poser;
  /** The skin roster of a parsed skeleton, as the runtime flags its bones under each skin. */
  skinRoster(data: SpineSkeletonData): SkinRoster;
  /** The page names an atlas declares, in its order, as the runtime's atlas reader reads them. */
  atlasPageNames(atlasText: string): string[];
  /** An atlas's pages and regions as the runtime reads them, for a texture substitution. */
  substitution(atlasText: string): { pages: string[]; regions: Map<string, SubstituteRegion> };
}

/** What `./deformmeasure.ts` registers: the deform survey read and posed through spine-core. */
export interface SpineSurveySide {
  /** The survey of `input`'s Spine skeleton through the runtime; `why` the reason the survey names (`null`: `--poser spine`). */
  throughSpine(label: string, why: string | null, input: DeformSurveyInput, exempt: ReadonlySet<string>): DeformSurvey;
}

let posing: SpinePosingSide | null = null;
let survey: SpineSurveySide | null = null;

/** Called by `./render.ts` when it is loaded. */
export function registerSpinePosing(side: SpinePosingSide): void {
  posing = side;
}

/** Called by `./deformmeasure.ts` when it is loaded. */
export function registerSpineSurvey(side: SpineSurveySide): void {
  survey = side;
}

/** The posing side, or a refusal of `label` (needed for `why`) naming the runtime as absent. */
export function spinePosingFor(label: string, why: string): SpinePosingSide {
  if (posing === null) throw new SpineRuntimeError(spineRuntimeSentence(label, why, SPINE_SIDE_ABSENT, `${POSING_RUNTIME_TAIL}; ${SPINE_SIDE_ROUTE}`));
  return posing;
}

/** The survey side, or a refusal of `label` (needed for `why`) naming the runtime as absent. */
export function spineSurveyFor(label: string, why: string): SpineSurveySide {
  if (survey === null) throw new SpineRuntimeError(spineRuntimeSentence(label, why, SPINE_SIDE_ABSENT, `${SURVEY_RUNTIME_TAIL}; ${SPINE_SIDE_ROUTE}`));
  return survey;
}

/** Which sides are registered in this process — what an entry's own report of itself reads. */
export function registeredSpineSides(): { posing: boolean; survey: boolean } {
  return { posing: posing !== null, survey: survey !== null };
}
