/**
 * The stage box a rig asked for and what the skeleton holds there (issue
 * #1168) — what `A50_STAGE_BOX_IS_THE_STAGE` reads.
 *
 * ⭐ **The question is asked by the model document and answered by the
 * skeleton.** The document states which slot and attachment carry the stage
 * (`stage.box`, `ModelStage.box`) and the stage they were written from; a Spine
 * file carries no such statement, so an export, a bare directory and a
 * document that states no box all ask nothing and the body SKIPs, naming which.
 * What answers is read off the skeleton: through spine-core's loaded
 * `SkeletonData` and a skeleton posed at setup (`spineStageBox` in
 * `../../validate.ts`), or through the document's records and rigc's core
 * poser (`../model/stage_box.ts`).
 *
 * Links nothing from the runtime.
 */

/** The box the document says the rig asked for, and the stage it was written from. */
export interface StageBoxAsked {
  readonly slot: string;
  readonly attachment: string;
  readonly stage: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

/** The attachment the slot carries under the asked name, in the `default` skin. */
export interface StageBoxHeld {
  /**
   * The attachment's type in the format's words — `boundingbox`, `region`,
   * `mesh`, `clipping`, `path`, `point` — as the runtime loads it: a linked
   * mesh loads as a `mesh`, so both suppliers spell it so.
   */
  readonly type: string;
  /** Whether its vertices are bound to bones (a weighted run) rather than stated in the slot bone's space. */
  readonly weighted: boolean;
  /** The vertex numbers it holds as loaded — `x, y` per vertex for an unweighted box. Empty for a type that holds none. */
  readonly stored: readonly number[];
  /**
   * Its world vertices at the setup pose — constraints applied, no physics,
   * no skin set — `x, y` per vertex; or why there are none (its bone is
   * inactive, the setup pose cannot be posed).
   */
  readonly world: readonly number[] | string;
}

/** What A50 reads. */
export interface StageBoxFacts {
  /** The box the rig asked for, or `null` where nothing asks — and then `why` says what asked nothing. */
  readonly asked: StageBoxAsked | null;
  /** The SKIP's reason where `asked` is `null`; empty otherwise. */
  readonly why: string;
  /** Whether the skeleton has a slot of the asked name. */
  readonly slot: boolean;
  /** The `default` skin's attachment of the asked name on that slot, or `null` for none (no default skin, nothing under that name). */
  readonly held: StageBoxHeld | null;
}

/**
 * The SKIP wherever nothing asks: a `/3` document whose stage states no box, a
 * document that declares no stage, a `/2` or `/1` document, or none at all (an
 * export, a bare directory). One sentence for all of them, because the rule
 * reads one fact — that no box was asked for — and two suppliers that differ
 * only in whether a caller handed the document over must print one line.
 */
export const SKIP_NO_STAGE_BOX =
  'nothing asks for a stage box: no rigc-compiled/3 model document beside this skeleton states one (stage.box, from the rig spec\'s skeleton.stageBox) — a rig that does not ask, or an export, carries no stage in its Spine files to measure';
