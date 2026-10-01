/**
 * The model side's supply of `EventKeyFacts` (issue #1025, cut 4c-4 of #380):
 * every event key of the document, with the declaration it fires.
 *
 * - **The order is the file's.** The animations by `editorAnimationOrder`
 *   (`src/compile.ts`, the function the emitter is handed), and an animation's
 *   keys in the document's order, which is the order `emitAnimation` writes
 *   the model's list in; an animation with no event key writes no `events`
 *   group, so it carries no event timeline here either.
 * - **The moved clause's inputs.** Which of `volume` and `balance` the key
 *   states — the document's key carries the fields the file's does, and the
 *   parser-default pass leaves an event key's audio fields alone (its row is
 *   `time` only) — and whether the declaration names an audio path, the
 *   `audio` the document's `events` section states for that name.
 * - **No `kept` finding, ever.** The four clauses that stay with the round
 *   trip are states `readModel` refuses (`readEventKeys`), so on a document
 *   this side has read none of them can hold.
 *
 * Links nothing from the runtime.
 */
import { editorAnimationOrder } from '../../compile.ts';
import type { EventKeyEntry, EventKeyFacts } from '../facts/event_keys.ts';
import { isObj, type Json } from '../values.ts';
import type { ReadDocument } from './parse.ts';

const list = (v: unknown): Json[] => (Array.isArray(v) ? v.filter(isObj) : []);

export function modelEventKeys(read: ReadDocument): EventKeyFacts {
  const audio = new Map<string, boolean>();
  for (const def of list(read.json.events)) if (typeof def.name === 'string') audio.set(def.name, typeof def.audio === 'string');
  const byName = new Map<string, Json>();
  for (const anim of list(read.json.animations)) if (typeof anim.name === 'string') byName.set(anim.name, anim);
  const keys: EventKeyEntry[] = [];
  let timelines = 0;
  for (const animation of editorAnimationOrder([...byName.keys()])) {
    const events = list((byName.get(animation) as Json).events);
    if (events.length === 0) continue;
    timelines++;
    events.forEach((key, index) => {
      const name = String(key.name);
      keys.push({ animation, index, kept: [], stopped: false, name, sets: { volume: key.volume !== undefined, balance: key.balance !== undefined }, audio: audio.get(name) ?? false });
    });
  }
  return { parsed: true, animations: true, timelines, keys };
}
