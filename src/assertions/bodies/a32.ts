/**
 * A32, the body (issue #1025, cut 4c-4 of #380): an event key that sets
 * `volume` or `balance` fires an event that declares an audio path — and the
 * clauses that stay with the round trip, printed where they always printed.
 *
 * Split per clause (`../facts/event_keys.ts`). The rig's clause moved here: a
 * readable document can state a key's `volume` on an event with no `audio`,
 * and the file the emitter writes from it is the file this clause refuses. The
 * other four — no string `name`, an undeclared event, a time that is not a
 * finite number, a time before the key before it — are states the model
 * document's reader refuses by name, so no readable document reaches them;
 * `validate()` runs them over the skeleton JSON and hands their findings in
 * (`kept`), and this body prints them at their place, in their order, before
 * the moved clause and instead of it where one ended the key's reading. The
 * three failure modes and why the rule reads the raw JSON stay above the
 * `check` call in `validate()`.
 */
import type { Verdicts } from '../harness.ts';
import type { EventKeyFacts } from '../facts/event_keys.ts';

/** Where a key is, as every A32 line names it — the kept clauses in `src/validate.ts` name it this way too. */
export function eventKeyAt(animation: string, index: number): string {
  return `animation "${animation}" event key ${index}`;
}

export function a32EventKeysResolve({ fail, skip }: Verdicts, facts: EventKeyFacts): void {
  if (!facts.parsed) return skip('A32_EVENT_KEYS_RESOLVE', 'the skeleton JSON did not parse (A00 owns that failure)');
  if (!facts.animations) return skip('A32_EVENT_KEYS_RESOLVE', 'the skeleton declares no animations');
  for (const key of facts.keys) {
    for (const finding of key.kept) fail('A32_EVENT_KEYS_RESOLVE', finding);
    if (key.stopped) continue;
    const at = eventKeyAt(key.animation, key.index);
    for (const field of ['volume', 'balance'] as const) {
      if (key.sets[field] && !key.audio) {
        fail(
          'A32_EVENT_KEYS_RESOLVE',
          `${at}: "${key.name}" sets ${field}, but the event declares no audio path — the parser reads ` +
            `${field} only for an event that has one, so it is dropped in silence`,
        );
      }
    }
  }
  if (facts.timelines === 0) return skip('A32_EVENT_KEYS_RESOLVE', 'no animation carries an event timeline');
}
