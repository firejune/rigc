/**
 * The model side's supply of `SequenceFacts` (issue #1025, cut 4c-3 of step
 * 4c of #380).
 *
 * - **The skin entries**, in the file's order: the skins and each skin's slot
 *   keys as `fileSkinOrder` gives them (`src/compile.ts`, issue #1034 — a
 *   `rigc-compiled/3` document's stated `editorOrder`, else the emitter's
 *   rule; the walk `./region_joins.ts` makes for A08, which walks the same
 *   keys), and a slot's records in its table's order. A record of a kind that draws a
 *   region (`CORE_REGION_KINDS`) is an entry; its `name` and `path` are the
 *   record's own, which the emitter writes unchanged, and its `sequence` is
 *   spelled as the file spells it — written by the emitter's own
 *   `emitSequenceBlock` (the document's block also carries each frame's atlas
 *   rectangle, which the file does not) and passed through
 *   `withoutParserDefaults`, which leaves out `start: 1` and `setup: 0`. A
 *   document the reader and the region rule accepted loads every record, so
 *   every entry is `loaded`.
 * - **The sequence timelines**: the animations in `fileAnimationOrder`'s order,
 *   and each animation's `attachments` group at its three levels (skin, slot,
 *   attachment) in the order the file keys them — `keyedOrder` over the
 *   document's order, which is the model's, as `src/deformstructure.ts` walks
 *   the same group (issue #1034) — passed through
 *   `withoutParserDefaults` and `inEditorKeyOrder` (`src/keyorder.ts`), so a
 *   key's `delay` the parser would read off the key before it is left out
 *   here exactly where the file leaves it out, and A46 prints what it prints
 *   over the file.
 * - **A slot at a pose**: the core's raw entry (`poseRawAnimation`,
 *   `src/core/raw.ts`) taking one step of the time on a fresh track, under the
 *   view the core poses with no skin set (`noSkinView`) — A45's posed colour
 *   and A43's posed tint are taken the same way. The entry the slot shows is
 *   the pose's shown record; the entry whose timelines it plays is the core's
 *   own rule for a linked mesh that plays its source's (`timelineIdentity`,
 *   whose condition is the record's `timelines`); and the region its series resolves to is `drawnRegions`
 *   (`src/core/uvs.ts`), which refuses by name the one case whose reading was
 *   not measured — a linked mesh with a series of its own, stepped over its
 *   source's frame count. No gate samples the times A46 asks for (mid-frame,
 *   and each `hold` key's own time), so the selftest compares these values
 *   with spine-core's at every time the body asks, on every call with a model
 *   in hand (`VF12`).
 *
 * Links nothing from the runtime.
 */
import { fileAnimationOrder, fileSkinOrder, keyedOrder, skinsInFileOrder } from '../../compile.ts';
import { CORE_REGION_KINDS, CoreInputError, type CompiledDocument } from '../../core/index.ts';
import { poseRawAnimation } from '../../core/raw.ts';
import { documentPageLookup, drawnRegions, readUvSequences } from '../../core/uvs.ts';
import { inEditorKeyOrder, withoutParserDefaults } from '../../keyorder.ts';
import { emitSequenceBlock } from '../../emit_spine.ts';
import type { ModelSequence, SkinTableEntry } from '../../model.ts';
import { noSkinView } from '../../render_core.ts';
import { entryAddress, type SequenceFacts, type SequenceSkinEntry, type SequenceTimeline } from '../facts/sequences.ts';
import { isObj, type Json } from '../values.ts';
import type { ReadDocument } from './parse.ts';

const list = (v: unknown): Json[] => (Array.isArray(v) ? v.filter(isObj) : []);

/** The skin entries that draw a region, in the file's order, each `sequence` spelled as the file spells it. */
function fileEntries(read: ReadDocument): SequenceSkinEntry[] {
  const stated = list(read.json.skins).filter((skin): skin is Json & { name: string } => typeof skin.name === 'string');
  const picked: Array<{ skin: string; slot: string; placeholder: string; record: Json }> = [];
  const shell: Json[] = [];
  for (const { skin, slots } of skinsInFileOrder(stated, fileSkinOrder(read.doc))) {
    if (!isObj(skin.attachments)) continue;
    const attachments: Json = {};
    for (const slot of slots) {
      const table = skin.attachments[slot];
      if (!isObj(table)) continue;
      const placeholders: Json = {};
      for (const [placeholder, record] of Object.entries(table)) {
        if (!isObj(record) || !CORE_REGION_KINDS.has(record.kind as SkinTableEntry['kind'])) continue;
        picked.push({ skin: skin.name, slot, placeholder, record });
        // Only what the omission pass reads to spell the series: the attachment's type, then the block as the emitter writes it
        // (`emitSequenceBlock`: the four fields the file carries, never the document's per-frame `atlas`, in a fresh object — the pass edits in place).
        placeholders[placeholder] = { ...(record.kind === 'region' ? {} : { type: record.kind }), ...(isObj(record.sequence) ? { sequence: emitSequenceBlock(record.sequence as unknown as ModelSequence) } : {}) };
      }
      attachments[slot] = placeholders;
    }
    shell.push({ name: skin.name, attachments });
  }
  withoutParserDefaults({ skins: shell });
  return picked.map(({ skin, slot, placeholder, record }) => {
    const spelled = (((shell.find((s) => s.name === skin) as Json).attachments as Json)[slot] as Json)[placeholder] as Json;
    return { skin, slot, placeholder, name: record.name, path: record.path, sequence: spelled.sequence, loaded: true };
  });
}

/** Names in the order each first appears, put in the order a JSON object keyed by them lists them (`keyedOrder`). */
const keyedFirsts = (names: readonly string[]): string[] => keyedOrder(names.filter((name, i) => names.indexOf(name) === i));

/** Every animation's sequence timelines in the file's order and spelling: `animations.<name>.attachments.<skin>.<slot>.<placeholder>.sequence = keys`. */
function fileSequenceTimelines(read: ReadDocument): SequenceTimeline[] {
  const byName = new Map<string, Json>();
  for (const anim of list(read.json.animations)) if (typeof anim.name === 'string') byName.set(anim.name, anim);
  type Level = { name: string; json: Json };
  const named = (v: unknown): Level[] => list(v).flatMap((json) => (typeof json.name === 'string' ? [{ name: json.name, json }] : []));
  /** One level of the group in the order the file keys it: `keyedOrder` over the document's order, each name's entries together. */
  const inFileOrder = (levels: Level[]): Array<[string, Json[]]> => keyedFirsts(levels.map((l) => l.name)).map((name) => [name, levels.filter((l) => l.name === name).map((l) => l.json)]);
  const order = fileAnimationOrder(read.doc);
  const walk: Array<{ animation: string; skin: string; slot: string; placeholder: string }> = [];
  const animations: Json = {};
  for (const name of order) {
    const anim = byName.get(name);
    if (anim === undefined) continue;
    const bySkin: Json = {};
    for (const [skin, skinEntries] of inFileOrder(named(anim.attachments))) {
      const bySlot: Json = {};
      for (const [slot, slotEntries] of inFileOrder(skinEntries.flatMap((e) => named(e.slots)))) {
        const byAttachment: Json = {};
        for (const [placeholder, attachments] of inFileOrder(slotEntries.flatMap((e) => named(e.attachments)))) {
          const timelines: Json = {};
          // `deform` then `sequence`, each only where the document holds it — `emitAttachmentTimelines`' order.
          for (const attachment of attachments) {
            for (const word of ['deform', 'sequence'] as const) if (Array.isArray(attachment[word])) timelines[word] = list(attachment[word]).map((key) => ({ ...key }));
          }
          byAttachment[placeholder] = timelines;
          if (Array.isArray(timelines.sequence)) walk.push({ animation: name, skin, slot, placeholder });
        }
        bySlot[slot] = byAttachment;
      }
      bySkin[skin] = bySlot;
    }
    animations[name] = Object.keys(bySkin).length > 0 ? { attachments: bySkin } : {};
  }
  // The emitter's own passes over the keys (`withoutParserDefaults`, `inEditorKeyOrder`), then the walk read back in the order built above.
  const file = inEditorKeyOrder(withoutParserDefaults({ animations }));
  return walk.map(({ animation, skin, slot, placeholder }) => {
    const timelines = ((((file.animations[animation] as Json).attachments as Json)[skin] as Json)[slot] as Json)[placeholder] as Json;
    return { animation, skin, slot, placeholder, keys: timelines.sequence as unknown[] };
  });
}

export function modelSequences(read: ReadDocument): SequenceFacts {
  let view: CompiledDocument | null = null;
  return {
    entries: fileEntries(read),
    timelines: fileSequenceTimelines(read),
    hasSlot: (slot) => read.doc.slots.some((s) => s.name === slot),
    duration: (animation) => read.doc.animations.find((a) => a.name === animation)?.timelines.duration ?? null,
    posedFrame: (animation, slot, time) => {
      view ??= noSkinView(read.doc);
      const pose = poseRawAnimation(view, animation, [time], {}, 'animation')[1];
      const shown = pose.shown.find((s) => s.slot === slot);
      if (shown === undefined) return null;
      const at = entryAddress(shown.skin, slot, shown.placeholder);
      const g = shown.geometry;
      const record = view.skins.find((k) => k.name === shown.skin)?.attachments[slot]?.[shown.placeholder];
      // A linked mesh that plays its source's timelines plays them as its source (`timelineIdentity` in `src/core/deform.ts`, the
      // runtime's `timelineAttachment`); every other entry plays its own.
      const playsAs = g.kind === 'linkedmesh' && record?.timelines === true ? entryAddress(g.skin, g.slot, g.source) : at;
      if (g.kind !== 'region' && g.kind !== 'mesh' && g.kind !== 'linkedmesh') return { shown: at, playsAs, region: null };
      if (read.doc.pages === null) throw new CoreInputError('the document states no pages, so no region a series resolves to can be named');
      const resolved = drawnRegions(view, pose.shown, [slot], { sequences: readUvSequences(read.json), lookup: documentPageLookup(read.doc.pages) });
      if (resolved.drawn === null) throw new CoreInputError(`the core does not name the region slot "${slot}" shows at t=${time}: ${resolved.why}`);
      return { shown: at, playsAs, region: resolved.drawn[0]?.region ?? null };
    },
  };
}
