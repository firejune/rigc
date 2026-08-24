/**
 * Bone chains — the unit an author actually repairs.
 *
 * ## Why a figure needs more than one number per shot
 *
 * `check` reports a shot's MAE and its worst slot. On a ball that is the whole
 * story. On a figure with a dozen joints it is a verdict with nowhere to put it:
 * spineboy's second attempt read "structure ✅, motion ✗" across sixteen sets, and
 * the fix that verdict implies is *"animate it again"*. What an author repairs is
 * a **limb** — the gun arm, the front leg — so the report has to be able to say
 * which limb the error is in, and how much of it (issue #123).
 *
 * The decomposition is **candidate-side**, and that is not an implementation
 * detail. `docs/LADDER.md`'s honesty rule says the reference is pixels; a chain
 * derived from the reference skeleton would be `check` reading the answer. So the
 * chains here come from the candidate's own bone tree — its own idea of what its
 * parts are — and the reference stays a picture that gets carved up by where the
 * candidate drew.
 *
 * ## The rule
 *
 * **Cut the bone tree at every branch point.** A chain starts at a root bone or
 * at a child of a bone with more than one child, and runs down while each bone it
 * reaches has exactly one child. On a biped that is exactly the set of parts an
 * author names: `front-thigh → front-shin → front-foot`, `rear-upper-arm →
 * rear-bracer → gun → muzzle`, `neck → head`. On a serial figure with no branch
 * at all — rung 8's pendulum, seven bones in a line — it is one chain, which is
 * the honest answer: a pendulum *has* one chain, and the per-slot table below it
 * still names which link drifted.
 *
 * **A single-bone chain that is itself a branch point folds into its parent
 * chain.** Without this, spineboy's `torso` — one bone with three children — is a
 * chain of its own carrying one slot, and the trunk above it (`root`, `hip`) is a
 * chain carrying none: two rows that between them say what one row says. With it
 * the trunk reads `root, hip, torso` and the figure decomposes into six chains
 * that each own a limb.
 *
 * ⚠️ **Only when it is a branch point.** A single-bone chain that is a *leaf* is a
 * real part — a one-bone arm, or rung 3's two independent bones under one root —
 * and folding those would collapse the whole fixture into a single chain and
 * attribute nothing. The rule keys on "does this bone branch", not on length.
 *
 * A chain is **named after the first bone in it that carries a slot**, root-ward
 * first, falling back to its first bone when none does. Membership never depends
 * on the name: it is a label, chosen so the roster reads `torso` rather than
 * `root`. Bone names are unique in a skeleton, so chain names are too.
 */

/** One bone, as much of it as a chain cares about. */
export interface BoneNode {
  name: string;
  /** The parent's name, or `null` for a root bone. */
  parent: string | null;
}

/** One slot, as much of it as a chain cares about. */
export interface SlotNode {
  name: string;
  /** The bone it hangs from. */
  bone: string;
}

/** A run of bones cut out of the tree at its branch points, and what it draws. */
export interface BoneChain {
  /** The first bone in it that carries a slot, else its first bone. */
  name: string;
  /** Its bones, root-ward first. */
  bones: string[];
  /** The slots those bones carry, in the skeleton's own slot order. */
  slots: string[];
}

interface Building {
  bones: string[];
  slots: string[];
  /** Set when this chain was folded away into another. */
  foldedInto: number | null;
}

/**
 * Cut a bone tree into chains — see the rule at the top of this file.
 *
 * Deterministic in the order the bones arrive: chains come back in the order
 * their first bone appears, and a bone that folds is appended to its parent
 * chain's list. Both matter, because the roster is printed and a report that
 * reorders itself between runs is a report nobody can diff.
 */
export function chainsOf(bones: BoneNode[], slots: SlotNode[]): BoneChain[] {
  const order = new Map<string, number>();
  for (const bone of bones) if (!order.has(bone.name)) order.set(bone.name, order.size);

  const children = new Map<string, string[]>();
  for (const bone of bones) {
    if (bone.parent === null || !order.has(bone.parent)) continue;
    const list = children.get(bone.parent);
    if (list) list.push(bone.name);
    else children.set(bone.parent, [bone.name]);
  }
  const childrenOf = (name: string): string[] => children.get(name) ?? [];

  // A chain starts at a root, or wherever the tree forked above it.
  const starts = bones.filter((b) => b.parent === null || !order.has(b.parent) || childrenOf(b.parent).length > 1);

  const built: Building[] = [];
  const chainOfBone = new Map<string, number>();
  for (const start of starts) {
    const run = [start.name];
    let at = start.name;
    for (;;) {
      const next = childrenOf(at);
      if (next.length !== 1) break;
      at = next[0];
      run.push(at);
    }
    const index = built.length;
    built.push({ bones: run, slots: [], foldedInto: null });
    for (const bone of run) chainOfBone.set(bone, index);
  }

  // Fold the hubs. Root-ward first, so a chain's parent is already final when it
  // is asked for — and through `resolve`, so a hub whose own parent folded lands
  // in the chain that absorbed it rather than in one that no longer exists.
  const resolve = (index: number): number => {
    let at = index;
    while (built[at].foldedInto !== null) at = built[at].foldedInto as number;
    return at;
  };
  const byDepth = built
    .map((chain, index) => ({ index, at: order.get(chain.bones[0]) as number }))
    .sort((a, b) => a.at - b.at);
  for (const { index } of byDepth) {
    const chain = built[index];
    if (chain.bones.length !== 1) continue;
    const only = chain.bones[0];
    // A leaf that stands alone is a part in its own right; a hub is not.
    if (childrenOf(only).length === 0) continue;
    const parent = bones.find((b) => b.name === only)?.parent ?? null;
    if (parent === null || !chainOfBone.has(parent)) continue;
    const target = resolve(chainOfBone.get(parent) as number);
    if (target === index) continue;
    built[target].bones.push(only);
    chain.foldedInto = target;
    chainOfBone.set(only, target);
  }

  for (const slot of slots) {
    const owner = chainOfBone.get(slot.bone);
    if (owner === undefined) continue;
    built[resolve(owner)].slots.push(slot.name);
  }

  return built
    .filter((chain) => chain.foldedInto === null)
    .map((chain) => ({
      name: chain.bones.find((bone) => chain.slots.some((slot) => slotBone(slots, slot) === bone)) ?? chain.bones[0],
      bones: chain.bones,
      slots: chain.slots,
    }));
}

function slotBone(slots: SlotNode[], name: string): string | null {
  return slots.find((slot) => slot.name === name)?.bone ?? null;
}

/** The chain each slot belongs to, keyed by slot name. */
export function chainBySlot(chains: BoneChain[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const chain of chains) for (const slot of chain.slots) out.set(slot, chain.name);
  return out;
}
