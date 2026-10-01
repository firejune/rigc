/**
 * The region names one skin entry will make a loader look up (issue #1025,
 * step 4c of #380) — moved here from `src/validate.ts` unchanged, because A08's
 * body now runs on both sides and the model side links nothing from the
 * runtime. `src/validate.ts` re-exports both names, so nothing that imported
 * them from there moves.
 */
import { frameRegionName } from '../core/uvs.ts';
import { isObj } from './values.ts';

/**
 * The atlas region names one raw skin entry will make the loader look up — or
 * `null` when the file states a sequence this walk cannot predict.
 *
 * ⚠️ Measured against the loader rather than reasoned out, because a join that
 * merely looks right is the thing A08 exists to refuse. `readSequence`
 * (`dist/SkeletonJson.js:641-649`) turns an absent or null `sequence` into
 * `new Sequence(1, false)` — one lookup, at the bare path — and a present one
 * into `new Sequence(count ?? 0, true)`, so a sequence map with no `count`
 * looks up nothing at all. Each frame's name is the core's `frameRegionName`
 * (`src/core/uvs.ts`): `start + i`, left-padded with zeros to `digits`, after
 * the path (issue #1015). `PS127` records what the loader asks for and compares,
 * and the core suite holds the frame names to `Sequence.getPath` over 7,680
 * cases.
 *
 * Nothing in `examples/` carries a `sequence` (measured: 0 occurrences across
 * all twelve editor exports), so without this the assertion would have read a
 * sequence's base path as a region name and refused correct foreign data —
 * `A21_MESH_RIM_PINNED`'s old `|| 'ring'` default, one file over.
 */
export function attachmentRegionLookups(sequence: unknown, path: string): string[] | null {
  if (sequence === undefined || sequence === null) return [path];
  if (!isObj(sequence)) return null;
  const whole = (value: unknown, fallback: number): number | null => {
    if (value === undefined) return fallback;
    return typeof value === 'number' && Number.isInteger(value) ? value : null;
  };
  const count = whole(sequence.count, 0);
  const start = whole(sequence.start, 1);
  const digits = whole(sequence.digits, 0);
  if (count === null || start === null || digits === null || count < 0) return null;
  const series = { count, start, digits, setup: 0 };
  const lookups: string[] = [];
  for (let i = 0; i < count; i++) lookups.push(frameRegionName(path, series, i));
  return lookups;
}

/** One skin entry's join onto the atlas, as the loader will perform it. */
export interface AttachmentRegionJoin {
  skin: string;
  slot: string;
  placeholder: string;
  /** The attachment's own name — the entry's `name` when it states one, else the placeholder. */
  name: string;
  /**
   * Every atlas region name the loader will ask this atlas for, in the order it
   * asks. Empty for a `sequence` with no `count`, and `null` for a sequence map
   * this walk will not guess at.
   */
  lookups: string[] | null;
}
