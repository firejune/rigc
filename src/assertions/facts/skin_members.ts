/**
 * What a skin activates, and what asks to be activated (issue #1025, step 4c
 * of #380) — the census's F01, F04 and F12 as A38 reads them: every bone with
 * its parent and its `skinRequired` flag, every constraint in update order with
 * its flag, and each skin's own `bones` and constraint lists.
 *
 * 🔑 **A constraint is an object, not a name.** A skin lists constraint
 * OBJECTS, and two constraints of one name under two kinds are two objects a
 * skin may list separately (issue #692) — so a skin's `constraints` hold the
 * very entries `constraints` holds, and a body asks whether one is listed by
 * identity. A bone's `parent` is the bone entry itself, so the ancestor chain is
 * walked by reference too.
 *
 * ⭐ **The order is the file's.** A38 prints one line per offending member:
 * skins in the file's order (the emitter's, `editorSkinOrder`), a skin's bones
 * as it lists them and its constraints kind by kind in the order the file keys
 * them (`ik`, `transform`, `path`, `physics`, `slider` — `RIG_SKIN_CONSTRAINT_KEYS`,
 * the emitter's), then the bones in the skeleton's order and the constraints in
 * update order.
 *
 * Links nothing from the runtime: spine-core's loaded `SkeletonData` satisfies
 * the shape structurally, which is how `validate()` supplies it, and the model
 * side builds it from the document (`../model/skin_members.ts`).
 */

/** One bone: its name, whether it is skin-required, and its parent entry. */
export interface MemberBone {
  readonly name: string;
  readonly skinRequired: boolean;
  readonly parent: MemberBone | null;
}

/** One constraint: its name and whether it is skin-required. */
export interface MemberConstraint {
  readonly name: string;
  readonly skinRequired: boolean;
}

/** One skin: its name and the bones and constraint entries it lists. */
export interface MemberSkin {
  readonly name: string;
  readonly bones: readonly MemberBone[];
  readonly constraints: readonly MemberConstraint[];
}

/** What A38 reads. */
export interface SkinMemberFacts {
  readonly skins: readonly MemberSkin[];
  /** Every bone, in the skeleton's order. */
  readonly bones: readonly MemberBone[];
  /** Every constraint, in update order. */
  readonly constraints: readonly MemberConstraint[];
}
