/**
 * A46, the body (issue #1025, cut 4c-3 of step 4c of #380): a numbered series
 * shows the frame the file states.
 *
 * Moved out of `src/validate.ts` unchanged but for what it reads, which is
 * `SequenceFacts` (`../facts/sequences.ts`) where it read the skeleton JSON and
 * the loaded skeleton — and for one change of key: what it knew about an
 * attachment it used to file under the loaded attachment OBJECT, and now files
 * under the entry's address (skin, slot, placeholder), the one key both sides
 * hold. The runtime's side loads one object per address, so every map below
 * holds what it held. The argument for the rule is above its `check` call,
 * which stays in `validate()`.
 */
import type { Verdicts } from '../harness.ts';
import { entryAddress, type EntryAddress, type SequenceFacts } from '../facts/sequences.ts';
import { attachmentRegionLookups } from '../region_lookups.ts';
import { SKIP_NO_SEQUENCE } from '../reasons.ts';
import { atStoredKey, isObj } from '../values.ts';
import { SEQUENCE_MODES } from '../../timelines.ts';

export function a46SequenceAttachmentsShowTheFrameTheFileStates({ fail, skip, stats }: Verdicts, facts: SequenceFacts): void {
  const NAME = 'A46_SEQUENCE_ATTACHMENTS_SHOW_THE_FRAME_THE_FILE_STATES';
  type Series = { where: string; lookups: string[] | null; count: number; setup: number };
  /** The loaded attachment's address -> what the FILE says its series is. */
  const series = new Map<EntryAddress, Series>();
  /** The addresses the runtime loaded an attachment at, for the timelines to find. */
  const loadedAt = new Set<EntryAddress>();
  /** Attachments whose block was already refused above — their timelines say nothing more. */
  const refused = new Set<EntryAddress>();
  const whole = (v: unknown, fallback: number): number | null =>
    v === undefined ? fallback : typeof v === 'number' && Number.isInteger(v) ? v : null;
  let blocks = 0;
  for (const entry of facts.entries) {
    const at = entryAddress(entry.skin, entry.slot, entry.placeholder);
    const loaded = entry.loaded;
    const where = `skin ${JSON.stringify(entry.skin)} slot ${JSON.stringify(entry.slot)} attachment ${JSON.stringify(entry.placeholder)}`;
    if (loaded) loadedAt.add(at);
    if (entry.sequence === undefined || entry.sequence === null) continue;
    blocks++;
    const seq = entry.sequence;
    const name = typeof entry.name === 'string' ? entry.name : entry.placeholder;
    const path = typeof entry.path === 'string' ? entry.path : name;
    const count = isObj(seq) ? whole(seq.count, 0) : null;
    const setup = isObj(seq) ? whole(seq.setup, 0) : null;
    if ((count === null || setup === null || count < 1) && loaded) refused.add(at);
    if (count === null || setup === null || count < 1) {
      fail(
        NAME,
        `${where}: the sequence states ${JSON.stringify(seq)}` +
          (isObj(seq) && seq.count === undefined
            ? ' and no "count" — `readSequence` reads 0 (`SkeletonJson.js:644`), so the attachment loads holding no region and draws nothing'
            : ' — "count" is a whole number of at least 1 and "setup" a whole number, or the series the parser builds is not the one written'),
      );
      continue;
    }
    if ((setup < 0 || setup >= count) && loaded) refused.add(at);
    if (setup < 0 || setup >= count) {
      fail(
        NAME,
        `${where}: the sequence's setup frame is ${setup} of a ${count}-frame series (frames 0 to ${count - 1}); ` +
          '`Sequence.resolveIndex` clamps it, so the setup pose shows ' +
          `${setup < 0 ? 'no frame at all' : `frame ${count - 1}, which the file does not name`}`,
      );
      continue;
    }
    if (!loaded) continue; // A00/A08 own an attachment that did not load
    series.set(at, { where, lookups: attachmentRegionLookups(seq, path), count, setup });
  }

  /**
   * The frame the file's statement gives for one key at one elapsed time —
   * A46's prediction, not a call into the runtime. What holds it is the
   * comparison it feeds: every sample sets it against the frame the posed
   * slot shows, so a reading that disagreed with the runtime would fail A46
   * on a correct file. A46 passing with samples posed on the selftest's
   * series probes is that measurement for the modes they key; `M73` is its
   * red half.
   */
  const frameOf = (mode: string, index: number, elapsed: number, delay: number, count: number): number => {
    if (mode === 'hold') return index;
    let i = index + Math.trunc(elapsed / delay + 0.00001);
    const n = count * 2 - 2;
    switch (mode) {
      case 'once':
        return Math.min(count - 1, i);
      case 'loop':
        return i % count;
      case 'pingpong':
        i = n === 0 ? 0 : i % n;
        return i >= count ? n - i : i;
      case 'onceReverse':
        return Math.max(count - 1 - i, 0);
      case 'loopReverse':
        return count - 1 - (i % count);
      default: // pingpongReverse
        i = n === 0 ? 0 : (i + count - 1) % n;
        return i >= count ? n - i : i;
    }
  };

  let timelines = 0;
  let compared = 0;
  let unshown = 0;
  for (const { animation: animName, skin: skinName, slot: slotName, placeholder, keys } of facts.timelines) {
    if (keys.length === 0) continue; // `readAnimation` skips it; A34 owns an empty timeline
    timelines++;
    const where = `animation ${JSON.stringify(animName)} ${skinName}/${slotName}/${placeholder} sequence`;
    const keyed = entryAddress(skinName, slotName, placeholder);
    if (!loadedAt.has(keyed)) continue; // the parser throws on a missing target: A00's
    if (refused.has(keyed)) continue; // its block is already named above
    const own = series.get(keyed);
    if (own === undefined) {
      fail(
        NAME,
        `${where}: the timeline steps an attachment that carries no "sequence" block. The parser gives it a ` +
          'series of ONE region (`readSequence(null)` is `new Sequence(1, false)`), so every mode shows that ' +
          'region at every time — measured: a "loop" key on a plain region showed it throughout',
      );
      continue;
    }
    // -- the keys, as the file states them --------------------------
    type Key = { time: number; mode: string; index: number; delay: number };
    const read: Key[] = [];
    let carried = 0;
    let malformed = false;
    keys.forEach((rawKey, k) => {
      const key = isObj(rawKey) ? rawKey : {};
      const at = `${where} key ${k}`;
      const time = typeof key.time === 'number' ? key.time : 0;
      const mode = key.mode === undefined ? 'hold' : key.mode;
      const index = key.index === undefined ? 0 : key.index;
      if (key.delay !== undefined) carried = typeof key.delay === 'number' ? key.delay : Number.NaN;
      if (typeof mode !== 'string' || !(SEQUENCE_MODES as readonly string[]).includes(mode)) {
        malformed = true;
        fail(
          NAME,
          `${at} (t=${time}): mode ${JSON.stringify(key.mode)} is not one of the ${SEQUENCE_MODES.length} the ` +
            `format has (${SEQUENCE_MODES.join(', ')}); the parser reads \`SequenceMode[mode]\`, which is ` +
            'undefined, stores mode bits 0, and the key plays as "hold"',
        );
        return;
      }
      if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= own.count) {
        malformed = true;
        fail(
          NAME,
          `${at} (t=${time}): index ${JSON.stringify(key.index)} is not a frame of the ${own.count}-frame series ` +
            `(0 to ${own.count - 1}); the runtime stores \`index << 4\`, truncating a fraction, and ` +
            '`Sequence.resolveIndex` clamps a frame past the end to the last one',
        );
        return;
      }
      if (mode !== 'hold' && !(carried > 0)) {
        malformed = true;
        fail(
          NAME,
          `${at} (t=${time}): "${mode}" at a delay of ${String(carried)}${key.delay === undefined ? ' (carried from the key before, 0 on the first)' : ''} — ` +
            'the frame advances by `(time - keyTime) / delay`, and at 0 that is Infinity, `Infinity | 0` is 0, ' +
            'and the key shows its first frame throughout: "hold" spelt as another mode',
        );
        return;
      }
      read.push({ time, mode, index, delay: carried });
    });
    if (malformed) continue;

    // -- the pose, sampled ------------------------------------------
    const end = facts.duration(animName);
    if (end === null || !facts.hasSlot(slotName)) continue; // A00's
    /** `key` is the index into `read`, or -1 before the first key (the setup frame). */
    const samples: Array<{ time: number; key: number; steps: number }> = [];
    if (read[0].time > 0) samples.push({ time: read[0].time / 2, key: -1, steps: 0 });
    read.forEach((key, k) => {
      const until = k + 1 < read.length ? read[k + 1].time : end;
      if (key.mode === 'hold') {
        samples.push({ time: key.time, key: k, steps: 0 });
        return;
      }
      // Mid-frame, and enough steps to wrap every mode at least once.
      for (let step = 0; step < own.count * 2 + 2; step++) {
        const time = key.time + (step + 0.5) * key.delay;
        if (time >= until || time > end) break;
        samples.push({ time, key: k, steps: step + 0.5 });
      }
    });
    let shownHere = 0;
    for (const sample of samples) {
      // A `hold` sample is AT its key, so it is posed at the key as
      // the runtime stores it (`atStoredKey`); a mid-frame sample is
      // half a delay from any key and is posed where it is.
      const pose = facts.posedFrame(animName, slotName, sample.key >= 0 && sample.steps === 0 ? atStoredKey(sample.time) : sample.time);
      // The slot must show the keyed attachment or one playing its
      // timelines — the only case `applyToSlot` writes.
      if (pose === null || (pose.shown !== keyed && pose.playsAs !== keyed)) continue;
      const drawn = series.get(pose.shown);
      if (drawn === undefined || drawn.lookups === null) continue;
      shownHere++;
      compared++;
      // The frame count the runtime folds by is the SHOWN attachment's:
      // a link with a series of its own steps it by its source's keys.
      const key = sample.key < 0 ? null : read[sample.key];
      const want = key === null ? drawn.setup : frameOf(key.mode, key.index, sample.time - key.time, key.delay, drawn.count);
      const region = pose.region;
      if (region !== drawn.lookups[want]) {
        fail(
          NAME,
          `${where} (t=${Number(sample.time.toFixed(4))}): the slot shows region ${JSON.stringify(region)}, and ` +
            `the file states frame ${want} of ${drawn.count} — ${JSON.stringify(drawn.lookups[want])} — ` +
            (key === null
              ? 'the setup frame, before the first key'
              : `key ${sample.key} plays "${key.mode}" from frame ${key.index} every ${key.delay}s, ` +
                `${sample.steps} delay(s) in`),
        );
        break;
      }
    }
    if (shownHere === 0) unshown++;
  }
  if (blocks === 0 && timelines === 0) return skip(NAME, SKIP_NO_SEQUENCE);
  stats.sequenceBlocks = blocks;
  stats.sequenceTimelines = timelines;
  stats.sequenceSamples = compared;
  if (unshown > 0) stats.sequenceSamplesUnshown = unshown;
}
