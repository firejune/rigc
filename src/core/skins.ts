/**
 * The skin a document is posed under (issue #932): every skin merged — the
 * oracle's `--skin all` — or one skin by name, `--skin <name>`. Each rule
 * below was measured by posing hand-written skeletons through
 * `tools/pose_oracle.ts dump --skin <name>` (spine-core 4.3.13) and reading
 * the rows it printed; the core suite's `CN` controls hold the same
 * skeletons against the core at tolerance 0.
 *
 * - **What a slot shows under a named skin**: the named skin's record for
 *   the placeholder, else the default skin's, else nothing. Three skins
 *   `default`, `s1`, `s2` over five slots — a placeholder the default and
 *   `s1` and `s2` fill, one the default alone fills, one `s1` alone, one no
 *   skin, one `s1` and the default — dumped under `default`, `s1` and `s2`
 *   in two file orders (`default, s1, s2` and `s2, s1, default`): `s1`
 *   showed `s1`'s record where it filled the placeholder and the default's
 *   where only the default did; `s2` showed `s2`'s, then the default's, and
 *   nothing for the placeholder only `s1` fills; a placeholder no skin fills
 *   showed nothing under every skin; the two file orders read the same row
 *   under every named skin. An attachment key switching the slot at a
 *   sample resolves the same way. So a named skin has no order question:
 *   nothing a placeholder shows depends on the file's skin order, which the
 *   model does not hold (the slots' ⚠️ in `./index.ts`).
 * - **The bones a named skin activates**: a skin-required bone is active
 *   exactly when the NAMED skin names it or a bone below it — the default
 *   skin's `bones` list does not count. Measured on the same probe: a
 *   skin-required bone only the default names read active under `default`
 *   and inactive under `s1` and `s2`; one `s1` names, and its skin-required
 *   parent, active under `s1` only; a bone that is not skin-required under
 *   an inactive one stayed active under every skin.
 * - **The constraints a named skin applies**: a skin-required constraint of
 *   any kind is applied exactly when the named skin's list for its kind names
 *   it — the default skin's list does not count either (`./constraints.ts`'s
 *   header, the nine readings per kind).
 *
 * - **A slot on an inactive bone is not animated** (the commander's private
 *   finding on this issue: a 19-skin rig read DIFF on 18 of its 19 skin
 *   runs). A slot whose bone the applied skin leaves inactive keeps its
 *   setup colour, dark colour and attachment under every slot timeline —
 *   `rgba`, `rgb`, `alpha`, `rgba2`, `rgb2` and `attachment` — whether an
 *   animation plays it or a slider applies it, and a deform timeline on its
 *   attachment does not apply either (a mesh weighted to an ACTIVE bone, so
 *   the deform would show: moved by 5 under `all` and `s1`, unmoved under
 *   `default`, which leaves the slot's bone inactive). Measured on
 *   hand-written skeletons under `--skin all`, `s1` (naming the bone) and
 *   `default` (not): each timeline moved the slot under the first two and
 *   not under the third, and the setup row read the setup under all three
 *   (a slider's key included). A slot on an ACTIVE bone that shows nothing
 *   (no skin holds its placeholder) IS animated: every colour key applied,
 *   and an attachment key switched it. A draw-order key moves a slot on an
 *   inactive bone like any other. A sequence timeline is held by the same
 *   gate; its effect on such a slot is not observable in the dump — a
 *   region's corners on an inactive bone are all zeros whatever the frame.
 *   So the predicate is the slot bone's activity (`slotTimelinesApply`),
 *   not what the slot shows; under `all` every bone some skin names is
 *   active, so a one-skin rig is unchanged.
 *
 * Under `all` every skin is applied at once: `bones` and the constraint
 * lists of every skin count, and a placeholder several skins fill shows the
 * LAST of them in the Spine file's order — the case `./index.ts` leaves out
 * by name, and the one the per-skin dumps exist to judge.
 */
import type { ModelSlot } from '../model.ts';
import type { CompiledDocument, CoreSkin } from './index.ts';

/** The skin option that merges every skin — the oracle's `--skin all`. */
export const CORE_ALL_SKINS = 'all';

/** The skin a document names its default skin with — Spine's `SkeletonData.defaultSkin` is the skin of this name. */
export const CORE_DEFAULT_SKIN = 'default';

/** The skins whose `bones` and constraint lists are applied: every skin under `all`, the named skin alone otherwise (the header's measurement). */
export function appliedSkins(doc: CompiledDocument): CoreSkin[] {
  return doc.skin === CORE_ALL_SKINS ? doc.skins : doc.skins.filter((k) => k.name === doc.skin);
}

/** Under a named skin, the skins a placeholder is looked up in, in precedence order: the named skin, then the default skin (the header's measurement). */
export function lookupSkins(doc: CompiledDocument): CoreSkin[] {
  if (doc.skin === CORE_ALL_SKINS) return doc.skins;
  const named = doc.skins.find((k) => k.name === doc.skin);
  const fallback = doc.skin === CORE_DEFAULT_SKIN ? undefined : doc.skins.find((k) => k.name === CORE_DEFAULT_SKIN);
  return [named, fallback].filter((k): k is CoreSkin => k !== undefined);
}

/**
 * The skins that could show a slot's placeholder: under `all` every skin
 * filling it — several is the file-order question — and under a named skin
 * the one it resolves to, or none.
 */
export function fillingSkins(doc: CompiledDocument, slot: string, placeholder: string): string[] {
  if (doc.skin === CORE_ALL_SKINS) return doc.skins.filter((k) => k.attachments[slot]?.[placeholder] !== undefined).map((k) => k.name);
  const first = lookupSkins(doc).find((k) => k.attachments[slot]?.[placeholder] !== undefined);
  return first === undefined ? [] : [first.name];
}

/** Whether a slot's timelines — its colour and attachment timelines, and the deform and sequence timelines on what it shows — apply: `slotTimelinesApply` unless a plant passes another. */
export type SlotTimelineGate = (doc: CompiledDocument, slot: ModelSlot, active: ReadonlySet<string>) => boolean;

/** A slot's timelines apply exactly when its bone is active under the skin posed (the header's measurement). */
export const slotTimelinesApply: SlotTimelineGate = (_doc, slot, active) => active.has(slot.bone);

/** Whether an applied skin's list for `kind` names the constraint — what applies a skin-required one (`./constraints.ts`'s header). */
export function listedByAppliedSkin(doc: CompiledDocument, kind: keyof CoreSkin['constraints'], name: string): boolean {
  return appliedSkins(doc).some((k) => k.constraints[kind].includes(name));
}
