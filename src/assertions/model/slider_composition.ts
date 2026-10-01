/**
 * The model side's supply of `SliderCompositionFacts` (issue #1025, cut 4c-5
 * of step 4c of #380): the document's sliders in its `constraints` order, the
 * timelines of each animation they apply in the order the runtime builds
 * them, and what each does when applied additively, as the core computes it.
 *
 * - **A slider's fields** are the core's record (`readSliderRecord`): `mix`,
 *   `additive` and `skin` read at the parser's value where the document
 *   leaves them out. The skins naming it are the document's skins in the
 *   file's order (`fileSkinOrder`), each whose `slider` list names it.
 * - **The timelines, in the runtime's order** (`../facts/slider_composition.ts`'
 *   ⭐): the slot and bone timelines as the file states them (`fileSlotTimelines`,
 *   `fileBoneTimelines` — the emitter's own passes over the document's
 *   order), the constraint timelines in the order the runtime builds them
 *   (`modelConstraintTimelineSources`), the attachments' deform and sequence
 *   timelines at their three levels in the order the file keys them
 *   (`keyedOrder` over the document's order, deform before sequence —
 *   `emitAttachmentTimelines`' order), then the draw order and the events.
 * - **The words.** Each timeline's class name and properties are the core's
 *   table (`ADDITIVE_APPLY`, `src/core/additive.ts`), the one value here that
 *   is not the document's, measured off the loaded timelines; an id's index is
 *   the target's position in the document's bones, slots or constraints —
 *   which the emitter writes in that order — `-1` for a physics timeline
 *   naming none; a deform's attachment is named as the runtime names it, the
 *   record's `name`, else its placeholder.
 * - **The behaviour** is the core's probe over the document under no skin set
 *   (`noSkinView`, which refuses by name a document whose skins it was not
 *   measured over) and under each skin (`underSkin`): `additiveCells`, and the
 *   class `additiveBehaviour` reads off them. The core suite's `CO27` holds
 *   both to the runtime's probe; the selftest asks this supplier every
 *   question the body asks the runtime's (`VF14`).
 *
 * Links nothing from the runtime.
 */
import { fileSkinOrder, keyedOrder } from '../../compile.ts';
import { ADDITIVE_APPLY, additiveBehaviour, additiveCells, additiveSpelling, type AdditiveTimeline, type AdditiveView } from '../../core/additive.ts';
import { EVERY_GLOBAL_PHYSICS, type PhysicsTimelineKind } from '../../core/constraints_physics.ts';
import { underSkin, type CompiledDocument } from '../../core/index.ts';
import type { BoneTimelineKind, SlotTimelineKind } from '../../core/animation.ts';
import { noSkinView } from '../../render_core.ts';
import { entryAddress } from '../facts/sequences.ts';
import type { SliderCompositionFacts, SliderFact, SliderTimelineFact } from '../facts/slider_composition.ts';
import { modelConstraintTimelineSources } from './constraints.ts';
import { fileBoneTimelines } from './bone_timelines.ts';
import { fileSlotTimelines } from './slot_colour.ts';
import type { ReadDocument } from './parse.ts';
import { isObj } from '../values.ts';

/** One timeline of an animation: the facts' reading of it and the core's. */
export interface ModelSliderTimeline {
  fact: SliderTimelineFact;
  core: AdditiveTimeline;
}

/** Names in the order each first appears, put in the order a JSON object keyed by them lists them (`keyedOrder`). */
const keyedFirsts = (names: readonly string[]): string[] => keyedOrder(names.filter((name, i) => names.indexOf(name) === i));

/** The words of one timeline: the table's class and properties, each id addressed by `index` (and `attachment`), and the sentence's naming. */
function factOf(doc: CompiledDocument, core: AdditiveTimeline): SliderTimelineFact {
  const row = ADDITIVE_APPLY[additiveSpelling(core)];
  if (row === undefined) throw new Error(`internal: "${additiveSpelling(core)}" is no row of the additive table`);
  const property = (p: string, index: number | null, attachment: string | null, names: string) => ({
    id: [p, ...(index === null ? [] : [String(index)]), ...(attachment === null ? [] : [attachment])].join('|'),
    property: p,
    names,
  });
  const slotIndex = (name: string): number => doc.slots.findIndex((s) => s.name === name);
  let properties: SliderTimelineFact['properties'];
  switch (core.group) {
    case 'bone': {
      const index = doc.bones.findIndex((b) => b.name === core.bone);
      properties = row.properties.map((p) => property(p, index, null, `bone "${core.bone}" ${p}`));
      break;
    }
    case 'slot':
      properties = row.properties.map((p) => property(p, slotIndex(core.slot), null, `slot "${core.slot}" ${p}`));
      break;
    case 'attachment': {
      const record = doc.skins.find((k) => k.name === core.skin)?.attachments[core.slot]?.[core.attachment];
      const shown = record?.name ?? core.attachment;
      const address = entryAddress(core.skin, core.slot, core.attachment);
      properties = row.properties.map((p) => property(p, slotIndex(core.slot), address, core.word === 'deform' ? `slot "${core.slot}" deform of "${shown}"` : `slot "${core.slot}" ${p}`));
      break;
    }
    case 'drawOrder':
    case 'events':
      properties = row.properties.map((p) => property(p, null, null, `the skeleton's ${p}`));
      break;
    default: {
      const index = core.group === 'physics' && core.constraint === EVERY_GLOBAL_PHYSICS ? -1 : doc.constraints.findIndex((c) => c.kind === core.group && c.name === core.constraint);
      properties = row.properties.map((p) => property(p, row.address === 'none' ? null : index, null, index >= 0 ? `constraint "${core.constraint}" ${p}` : `the skeleton's ${p}`));
    }
  }
  return { runtimeClass: row.runtimeClass, properties };
}

/** Every timeline of animation `name`, in the order the runtime builds them (the header). */
export function modelAnimationTimelines(read: ReadDocument, name: string): ModelSliderTimeline[] {
  const { doc } = read;
  const anim = doc.animations.find((a) => a.name === name);
  if (anim === undefined) return [];
  const t = anim.timelines;
  const out: AdditiveTimeline[] = [];
  for (const { slot, timelines } of fileSlotTimelines(read).filter((s) => s.animation === name)) {
    const target = t.slots.find((s) => s.name === slot);
    for (const word of Object.keys(timelines)) {
      const keys = target?.timelines.find((x) => x.kind === word)?.keys;
      if (keys !== undefined) out.push({ group: 'slot', word: word as SlotTimelineKind, slot, keys });
    }
  }
  for (const { bone, timelines } of fileBoneTimelines(read).filter((b) => b.animation === name)) {
    const target = t.bones.find((b) => b.name === bone);
    for (const word of isObj(timelines) ? Object.keys(timelines) : []) {
      const keys = target?.timelines.find((x) => x.kind === word)?.keys;
      if (keys !== undefined) out.push({ group: 'bone', word: word as BoneTimelineKind, bone, keys });
    }
  }
  for (const source of modelConstraintTimelineSources(read).filter((s) => s.animation === name)) {
    switch (source.kind) {
      case 'ik': {
        const keys = anim.constraints.ik.find((x) => x.name === source.name)?.keys;
        if (keys !== undefined) out.push({ group: 'ik', word: 'ik', constraint: source.name, keys });
        break;
      }
      case 'transform':
        out.push({ group: 'transform', word: 'transform', constraint: source.name, keys: source.keys });
        break;
      case 'path':
        out.push({ group: 'path', word: source.word as 'position' | 'spacing' | 'mix', constraint: source.name, keys: source.keys });
        break;
      case 'physics':
        out.push({ group: 'physics', word: source.word as PhysicsTimelineKind, constraint: source.name, keys: source.keys });
        break;
      case 'slider':
        out.push({ group: 'slider', word: source.word as 'time' | 'mix', constraint: source.name, keys: source.keys });
        break;
    }
  }
  const attachments = t.attachments;
  for (const skin of keyedFirsts(attachments.map((a) => a.skin))) {
    const inSkin = attachments.filter((a) => a.skin === skin);
    for (const slot of keyedFirsts(inSkin.map((a) => a.slot))) {
      const inSlot = inSkin.filter((a) => a.slot === slot);
      for (const attachment of keyedFirsts(inSlot.map((a) => a.attachment))) {
        for (const a of inSlot.filter((x) => x.attachment === attachment)) {
          if (a.deform !== null) out.push({ group: 'attachment', word: 'deform', skin, slot, attachment, keys: a.deform });
          if (a.sequence !== null) out.push({ group: 'attachment', word: 'sequence', skin, slot, attachment, keys: a.sequence });
        }
      }
    }
  }
  if (t.drawOrder.length > 0) out.push({ group: 'drawOrder', word: 'drawOrder', keys: t.drawOrder });
  if (t.events.length > 0) out.push({ group: 'events', word: 'events', times: t.events.map((k) => k.time) });
  return out.map((core) => ({ fact: factOf(doc, core), core }));
}

/** The views the probe poses under: no skin set, then every skin in the file's order. */
export function additiveViews(doc: CompiledDocument): AdditiveView[] {
  return [{ name: '(none)', doc: noSkinView(doc) }, ...fileSkinOrder(doc).map((skin) => ({ name: skin.name, doc: underSkin(doc, skin.name) }))];
}

export function modelSliderComposition(read: ReadDocument): SliderCompositionFacts {
  const { doc } = read;
  const skinOrder = fileSkinOrder(doc).map((skin) => skin.name);
  const walked = new Map<string, ModelSliderTimeline[]>();
  const timelinesOf = (name: string): ModelSliderTimeline[] => {
    const held = walked.get(name);
    if (held !== undefined) return held;
    const fresh = modelAnimationTimelines(read, name);
    walked.set(name, fresh);
    return fresh;
  };
  const sliders: SliderFact[] = [];
  doc.constraints.forEach((c, index) => {
    const r = c.record;
    if (r?.kind !== 'slider') return;
    const animation = doc.animations.some((a) => a.name === r.animation) ? { name: r.animation, timelines: timelinesOf(r.animation).map((x) => x.fact) } : null;
    const skins = skinOrder.filter((name) => doc.skins.some((k) => k.name === name && k.constraints.slider.includes(r.name)));
    sliders.push({ name: r.name, index, mix: r.mix, additive: r.additive, skinRequired: r.skin, skins, animation });
  });
  let views: AdditiveView[] | null = null;
  return {
    sliders,
    behaviour: (animation, at) => {
      const timeline = timelinesOf(animation)[at];
      if (timeline === undefined) throw new Error(`internal: animation "${animation}" has no timeline ${at}`);
      views ??= additiveViews(doc);
      return additiveBehaviour(additiveCells(views, timeline.core));
    },
  };
}
