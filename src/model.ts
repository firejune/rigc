/**
 * The compiled model — what `compile` knows about a rig once every name is
 * resolved and every number is on the grid the runtime will read, held apart
 * from the shape any one output format gives it (issue #915, step 1b of #380).
 *
 * ## What it is
 *
 * The record a posing core of rigc's own would read: bones with their inherit
 * modes, and in later cuts slots, attachments, constraints, events and
 * animations. It is the neutral side of the census in `docs/COMPILED_MODEL.md`:
 * a value belongs here when any backend posing this rig would need it, and a
 * spelling, a key order or an omission at a parser default belongs to the
 * emitter that writes one format. The Spine emitter (`src/emit_spine.ts`) is its
 * first consumer, and the one that owns every Spine 4.3 byte; the model owns
 * none.
 *
 * ⚠️ **Numbers are already on the float32 grid** (`f32` in `compile.ts`). That is
 * model content and not formatting: which decimal a float32 is spelled with is
 * the double spine-core's JSON reader keeps, so it moves the pose (census §4,
 * 19 of 19 builds). The model therefore holds exactly the numbers the file
 * holds, and the emitter copies them without touching one.
 *
 * ## What this cut fills
 *
 * `bones` and `setupWorld`, and nothing else is constructed here yet. Every other
 * field is `CompileResult`'s own, carried by reference under the same name
 * (`CarriedFromCompileResult`) until its own cut gives it a model-side form; the
 * skeleton object, its text and the atlas text are emitted artifacts and are not
 * part of the model at all.
 *
 * Nothing here is serialised yet: `setupWorld` is a `Map`, and making the model
 * a document (`rigc-compiled/1`) is a later cut of step 1.
 */
import type { BoneTransform } from './transform.ts';
import type { CompileResult } from './types.ts';

/**
 * One bone, as `buildBone` computes it — a field is present exactly when the rig
 * spec declared it (or, for `x`/`y`/`rotation`, when `from` supplied it), and
 * every number is already `f32`'d.
 */
export interface ModelBone {
  name: string;
  parent?: string;
  length?: number;
  /** Local to the parent, y up. Solved from the manifest when the spec says `from`. */
  x?: number;
  y?: number;
  /** Degrees, CCW, y up. */
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  shearX?: number;
  shearY?: number;
  /**
   * The inherit MODE, as the spec states it (the rig parse admits the runtime's
   * first-letter fold, so `noScale` and `NoScale` both reach here). What key the
   * mode is written under is the emitter's: Spine 4.3 spells it `inherit`.
   */
  inheritMode?: string;
  /** The bone is inactive unless the applied skin names it. Spine 4.3 spells it `skin`. */
  skinRequired?: boolean;
  /** Editor affordances: no pose reads them. */
  editor?: { color?: string; icon?: string };
}

/**
 * The fields of `CompileResult` the model carries as they are today, by
 * reference. A later cut replaces one of these with a model-side form by moving
 * it out of this list.
 */
export type CarriedFromCompileResult = Pick<
  CompileResult,
  | 'images'
  | 'pageGrids'
  | 'droppedStates'
  | 'absentParts'
  | 'declaredDurations'
  | 'meshBones'
  | 'meshes'
  | 'physics'
  | 'deformTransforms'
  | 'trackDerivations'
  | 'rig'
>;

export interface CompiledModel extends CarriedFromCompileResult {
  /** Every bone, in the rig's declaration order — parents first, as the runtime requires. */
  bones: ModelBone[];
  /** The setup world transform of every bone, computed from `bones`. Never emitted. */
  setupWorld: Map<string, BoneTransform>;
}
