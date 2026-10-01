/**
 * Every event key, in the file's order, with the declaration it fires (issue
 * #1025, cut 4c-4 of #380) — what A32 reads.
 *
 * ⭐ **Split per clause, and the split is in this interface.** A32 has five
 * clauses. Four of them — a key with no string `name`, a key firing an event
 * the skeleton does not declare, a key whose time is not a finite number, and
 * a key earlier than the one before it — are states `readModel` refuses by
 * name (`readEventKeys` in `src/core/events.ts`, measured on forged documents:
 * each one is refused at the key's address), so no readable document reaches
 * them and they stay with the round trip: `validate()` runs them over the
 * skeleton JSON and hands their findings in as `kept`, in the order they
 * print, with `stopped` where the clause ended the key's reading. The fifth —
 * `volume` or `balance` on a key whose event declares no audio — is the rig's:
 * the document holds the key's fields and the declaration's `audio`, and a
 * readable document can carry it. That clause is the body's
 * (`../bodies/a32.ts`), and the model side supplies `kept` empty.
 *
 * The order is the file's: animations in the order the file keys them (the
 * emitter's `editorAnimationOrder`), and an animation's keys in the order the
 * document lists them, which is the order the emitter writes them
 * (`emitAnimation`'s `events`). `timelines` counts the animations carrying an
 * event timeline at all, which is what A32 SKIPs on when it is zero.
 *
 * Links nothing from the runtime.
 */

/** One event key: where it is, what the kept clauses found, and what the moved clause reads. */
export interface EventKeyEntry {
  readonly animation: string;
  /** The key's index in its animation's event timeline. */
  readonly index: number;
  /** The findings of the clauses that stay with the round trip, in the order they print — always empty on the model side. */
  readonly kept: readonly string[];
  /** Whether a kept clause ended the key's reading, so the moved clause does not run on it. */
  readonly stopped: boolean;
  /** The event the key fires. */
  readonly name: string;
  /** Which of the two audio fields the key states. */
  readonly sets: { readonly volume: boolean; readonly balance: boolean };
  /** Whether the event the key fires declares an audio path (a string). */
  readonly audio: boolean;
}

/** What A32 reads. */
export interface EventKeyFacts {
  /** Whether the skeleton JSON parsed — always true on the model side, whose parse is the reader's. */
  readonly parsed: boolean;
  /** Whether the skeleton declares an `animations` object at all. */
  readonly animations: boolean;
  /** How many animations carry an event timeline. */
  readonly timelines: number;
  /** Every event key, in the file's order. */
  readonly keys: readonly EventKeyEntry[];
}
