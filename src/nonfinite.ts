/**
 * The one sentence for a pose number that is not finite (issue #882, #873) —
 * moved here from `src/render.ts` by issue #1025 (cut 4c-5a of step 4c of
 * #380), unchanged, because it now has a reader that may not link the
 * runtime: `A10_NO_NAN_AFTER_STEPPING`'s body (`./assertions/bodies/a10.ts`),
 * which reads it over the poses spine-core gives and over the poses rigc's
 * core gives. `render` refuses on the same sentence, so the gate and the
 * renderer still hold one definition of "not finite" — the six terms of a
 * bone's world transform, then the vertices computed from them.
 *
 * Pure: no import at all.
 */

/** The bone fields a world transform is made of — what `firstNonFinite` reads off a bone. */
export interface WorldTransform {
  readonly name: string;
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly worldX: number;
  readonly worldY: number;
}

/** The fields of an attachment entry `firstNonFinite` reads — a frame's posed attachment or a rest entry. */
export interface PosedVertices {
  readonly slot: string;
  readonly attachment: string;
  readonly vertices: readonly number[];
}

/**
 * The sentence for the first number at `where` that is not finite — bones before
 * vertices, since a bone that overflowed is the cause and its vertices the
 * symptom — or `null` when every number there is finite.
 */
export function firstNonFinite(where: string, entries: readonly PosedVertices[], bones: readonly WorldTransform[]): string | null {
  for (const bone of bones) {
    for (const field of ['a', 'b', 'c', 'd', 'worldX', 'worldY'] as const) {
      if (!Number.isFinite(bone[field])) {
        return `${where}: bone ${JSON.stringify(bone.name)} has ${field} ${String(bone[field])}; a world transform is finite`;
      }
    }
  }
  for (const entry of entries) {
    const bad = entry.vertices.findIndex((value) => !Number.isFinite(value));
    if (bad === -1) continue;
    return (
      `${where}: slot ${JSON.stringify(entry.slot)} attachment ${JSON.stringify(entry.attachment)} vertex ` +
      `${Math.floor(bad / 2)} has ${bad % 2 === 0 ? 'x' : 'y'} ${String(entry.vertices[bad])}; a posed vertex is finite`
    );
  }
  return null;
}
