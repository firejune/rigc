/**
 * Measure a looping animation's seam: is its last rendered frame the pose it
 * started from?
 *
 *     bun gallery/loop_seam.ts <a frame directory rigc render wrote> [--duration <seconds>]
 *
 * ⭐ **Why this is here and not in rigc.** A loop seam is a defect *between two
 * frames*: every frame on its own is correct, so nothing that scores a frame can
 * see it. AUTHORING §0 says as much — `check`'s per-frame column is the only
 * thing in the toolchain that can see a hold, a seam or a one-frame event — but
 * `check` needs reference frames, and an authored motion with no reference has
 * none. A gallery example is exactly that case, so this is the stopgap: it
 * compares a render against **itself**, which needs no reference at all.
 *
 * 📐 **Why the comparison is valid, and the condition it holds under.**
 * `rigc render` samples `i = 0..round(d · fps)` *inclusive* at `1 / fps`, so its
 * last frame sits at `round(d · fps) / fps` — which is `d` itself **exactly when
 * `d · fps` is an integer**, and up to half a sampling interval either side of it
 * when it is not. A cycle that closes has the same pose at `t = 0` and
 * `t = duration`, and therefore the same pixels; so the first-to-last comparison
 * is a seam measurement only on a set whose last frame landed on `d`.
 *
 * 🚨 **The condition is not a formality, and omitting a flag is what breaks it**
 * (issue [#337](https://github.com/firejune/rigc/issues/337)). `portrait`'s
 * `idle` is 3.2 s and does close; rendered at the default rate — `--fps 12`, so
 * `3.2 × 12 = 38.4` — its last frame sits at 3.1667 s, and this tool read
 * **14 276 pixels differing, worst channel 206/255** on it. That is the size of a
 * real hitch, not an obviously broken number. So pass `--duration <seconds>` —
 * the animation's own length, out of the motion spec — and the reading is
 * **refused** rather than reported when the last frame is not at it. Without the
 * flag the numbers still print, and the verdict says they are unverified.
 *
 * ⚠️ **What a nonzero reading does and does not mean.** It is the size of the
 * jump a player makes when it wraps, and nothing else. It does not say the loop
 * is wrong: an animation may legitimately end somewhere else (this is not a
 * pass bar, and the number is not compared against one here). It also cannot see
 * a *velocity* discontinuity — a cycle whose value matches at the seam but whose
 * slope does not still reads as a hitch, and every pixel in this measurement is
 * identical when that happens.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { readPlate } from '../tools/plate.ts';

/**
 * Seconds either side of a stated duration this tool calls the same time.
 *
 * Well under the smallest gap the defect it guards against can produce — half a
 * sampling interval, which is 1/480 s even at 240 fps — and well over the noise
 * of accumulating `1 / fps` eighty times in a double, which is the number the
 * sidecar records.
 */
export const TIME_EPSILON = 1e-6;

export interface SeamReading {
  first: string;
  last: string;
  frames: number;
  width: number;
  height: number;
  /** Largest absolute difference of any single channel, 0..255. */
  maxChannel: number;
  /** Mean absolute channel difference over every channel of every pixel. */
  meanChannel: number;
  /** How many pixels differ in any channel. */
  pixelsDiffering: number;
  /** Where the worst pixel is, or null when the frames are identical. */
  worstAt: { x: number; y: number } | null;
}

/**
 * What the frame set's own `frames.json` records about how it was sampled.
 *
 * Read off the sidecar rather than counted off the directory because the rate is
 * the half that cannot be counted: `f0038.png` is the 39th frame at every rate,
 * and only the sidecar says which one it was written at.
 */
export interface SamplingRecord {
  /** Where the sidecar was found, for the message that quotes it. */
  sidecar: string;
  fps: number;
  /** Frames the animation sampled to at this rate. */
  sampled: number;
  /** The last sampled frame's time in seconds — the sidecar's own `duration`. */
  lastTime: number;
}

/** A decimal literal as an exact fraction in lowest terms. */
export interface ExactDecimal {
  numerator: number;
  denominator: number;
}

function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

/**
 * `--duration`'s text as an exact fraction, so *"is `d · fps` an integer"* is
 * decided by arithmetic rather than by a tolerance.
 *
 * The text and not the parsed double: `3.2` is not representable, so
 * `3.2 * 15 === 48` is a fact about IEEE rounding rather than about the
 * animation. In lowest terms `d = n / q` makes the answer structural — the rates
 * that land on `d` are exactly the multiples of `q` — which is what lets the
 * refusal below name them instead of searching for one.
 */
export function exactDecimal(text: string): ExactDecimal | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!m) return null;
  const fraction = m[2] ?? '';
  const numerator = Number(m[1] + fraction);
  if (!Number.isSafeInteger(numerator) || numerator === 0) return null;
  const denominator = 10 ** fraction.length;
  const g = gcd(numerator, denominator);
  return { numerator: numerator / g, denominator: denominator / g };
}

/**
 * Where a render's last frame lands for a duration `d` sampled at `fps`, and
 * whether that is `d`.
 *
 * The one place this tool restates `src/render.ts`'s `sampleAnimation`. It is a
 * restatement and not a call because the two run on different inputs — one has
 * a skeleton, the other has a number a reader typed — and the arithmetic is one
 * line either way.
 */
export function samplingOf(duration: number, fps: number): { count: number; lastTime: number; lands: boolean } {
  const count = Math.round(duration * fps);
  const lastTime = count / fps;
  return { count, lastTime, lands: Math.abs(lastTime - duration) <= TIME_EPSILON };
}

/**
 * The integer rates that put a frame exactly on `d`, as the multiples of one
 * number, plus the first of them at or above `fps`.
 *
 * `null` when the duration is not a decimal literal this can reduce, which is
 * the only case where the tool has to fall back to reporting the product.
 */
export function landingRates(durationText: string, fps: number): { every: number; nextAtOrAbove: number } | null {
  const exact = exactDecimal(durationText);
  if (!exact) return null;
  const every = exact.denominator;
  return { every, nextAtOrAbove: Math.max(1, Math.ceil(fps / every)) * every };
}

/** Frame files `rigc render` writes, in sample order. */
function frameFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => /^f\d+\.png$/.test(f))
    .sort();
}

/**
 * The sidecar's record for this frame directory, or `null` when there is none.
 *
 * `frames.json` sits at the **skeleton root** — one level above a set's own
 * directory — and `rigc check` looks in both places, so this does too. Matched
 * on the sidecar's `sets[].dir`, which is the field that carries the truth about
 * the directory name (the protocol rate writes `idle`, every other rate writes
 * `idle@Nfps`, and a caller that builds the path by hand has to know that rule —
 * reading the sidecar is immune to it).
 */
export function readSampling(dir: string): SamplingRecord | null {
  const abs = resolve(dir);
  for (const root of [abs, dirname(abs)]) {
    const path = join(root, 'frames.json');
    if (!existsSync(path)) continue;
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    const sets = (parsed as { sets?: unknown }).sets;
    if (!Array.isArray(sets)) continue;
    const set = sets.find((s) => (s as { dir?: unknown }).dir === basename(abs));
    if (!set) continue;
    const { fps, sampled, duration } = set as { fps?: unknown; sampled?: unknown; duration?: unknown };
    if (typeof fps !== 'number' || typeof sampled !== 'number' || typeof duration !== 'number') continue;
    return { sidecar: path, fps, sampled, lastTime: duration };
  }
  return null;
}

export function measureLoopSeam(dir: string): SeamReading {
  const files = frameFiles(dir);
  if (files.length < 2) {
    throw new Error(
      `${dir} holds ${files.length} frame(s) named fNNNN.png; a seam is a comparison between two, so there is nothing to measure`,
    );
  }
  const first = readPlate(join(dir, files[0]));
  const last = readPlate(join(dir, files[files.length - 1]));
  if (first.width !== last.width || first.height !== last.height) {
    throw new Error(
      `${files[0]} is ${first.width}x${first.height} and ${files[files.length - 1]} is ${last.width}x${last.height}; ` +
        'a render writes one viewport for the whole set, so these did not come from one run',
    );
  }
  let maxChannel = 0;
  let total = 0;
  let pixelsDiffering = 0;
  let worstAt: { x: number; y: number } | null = null;
  for (let y = 0; y < first.height; y++) {
    for (let x = 0; x < first.width; x++) {
      const i = (y * first.width + x) * 4;
      let pixelWorst = 0;
      for (let c = 0; c < 4; c++) {
        const d = Math.abs(first.data[i + c] - last.data[i + c]);
        total += d;
        if (d > pixelWorst) pixelWorst = d;
      }
      if (pixelWorst > 0) pixelsDiffering++;
      if (pixelWorst > maxChannel) {
        maxChannel = pixelWorst;
        worstAt = { x, y };
      }
    }
  }
  return {
    first: files[0],
    last: files[files.length - 1],
    frames: files.length,
    width: first.width,
    height: first.height,
    maxChannel,
    meanChannel: total / (first.width * first.height * 4),
    pixelsDiffering,
    worstAt,
  };
}

/**
 * The refusal a set whose last frame is not at the stated duration gets, or
 * `null` when the reading is one this tool is entitled to make.
 *
 * A refusal and not a warning, because the number the comparison produces is
 * *plausible* — 14 276 pixels at 206/255 is what a real hitch looks like — and a
 * plausible wrong number printed beside a caveat gets quoted without it.
 */
export function refuseSampling(dir: string, durationText: string, record: SamplingRecord | null): string | null {
  const declared = Number(durationText);
  if (!Number.isFinite(declared) || declared <= 0) {
    return `--duration ${durationText} is not a positive number of seconds`;
  }
  if (!record) {
    return (
      `--duration ${durationText} was given, but there is no frames.json in ${dir} or beside it that names a set ` +
      `for "${basename(resolve(dir))}" — so neither the rate these frames were written at nor the time the last ` +
      'one sits at is on record, and the duration cannot be checked against anything. Re-render the set with ' +
      '`rigc render`, which writes the sidecar, or drop --duration to take the reading unverified'
    );
  }
  if (Math.abs(record.lastTime - declared) <= TIME_EPSILON) return null;
  const off = record.lastTime - declared;
  const frames = Math.abs(off) * record.fps;
  const exact = exactDecimal(durationText);
  const rates = landingRates(durationText, record.fps);
  // Through the fraction, so the line quotes 38.4 rather than the double
  // `3.2 * 12` happens to produce (38.400000000000006), which reads as noise in
  // a message whose whole point is that the product is not a whole number.
  const product = exact ? (exact.numerator * record.fps) / exact.denominator : declared * record.fps;
  return (
    `this is not a seam measurement: ${basename(resolve(dir))}'s last frame is not at the duration.\n` +
    `  last sampled frame   t = ${record.lastTime.toFixed(6)}s   (${record.sampled} frames at ${record.fps} fps, ` +
    `per ${record.sidecar})\n` +
    `  --duration says      t = ${declared.toFixed(6)}s\n` +
    `  it lands             ${off > 0 ? 'PAST the end' : 'SHORT of the end'} by ${Math.abs(off).toFixed(6)}s = ` +
    `${frames.toFixed(3)} of a frame at ${record.fps} fps   (tolerance ${TIME_EPSILON}s)\n` +
    `  why                  render samples i = 0..round(d x fps) at 1/fps, so the last frame is at d exactly when ` +
    `d x fps is an integer. ${durationText} x ${record.fps} = ${product} is not.\n` +
    (rates
      ? `  rates that do land   every multiple of ${rates.every} fps` +
        (rates.every === 1 ? ' (i.e. every integer rate)' : `; the first at or above ${record.fps} is ${rates.nextAtOrAbove}`)
      : `  rates that do land   any fps for which ${durationText} x fps is a whole number`) +
    `\n  ⇒ re-render the set at such a rate and measure that one. The comparison this directory supports is ` +
    'between t = 0 and a time that is not the wrap point, which is not a seam.'
  );
}

/** The reading as the lines a run should paste into its notes. */
export function seamLines(dir: string, r: SeamReading, record?: SamplingRecord | null, durationText?: string): string[] {
  const pct = ((100 * r.pixelsDiffering) / (r.width * r.height)).toFixed(3);
  // Reached only after `refuseSampling` returned null, so a stated duration here
  // is one the record agrees with.
  const verified = durationText !== undefined && record !== null && record !== undefined;
  const sampling: string[] = record
    ? [
        `  sampled at               ${record.fps} fps, last frame at t = ${record.lastTime.toFixed(6)}s` +
          (verified ? ` = the ${durationText}s duration given` : ''),
      ]
    : [`  sampled at               no frames.json beside these frames, so the rate is not on record`];
  if (!verified) {
    sampling.push(
      '  ⚠️ UNVERIFIED             this is the SEAM only if that last frame is at the animation\'s own duration.',
      '                           render samples i = 0..round(d x fps), which lands on d exactly when d x fps is',
      '                           an integer and up to half a frame off when it is not (issue #337). Pass',
      '                           --duration <seconds> and this tool will check it instead of assuming it.',
    );
  }
  return [
    `loop seam  ${basename(dir)}`,
    `  ${r.first} vs ${r.last}   ${r.frames} frames at ${r.width}x${r.height}`,
    ...sampling,
    `  max channel difference   ${r.maxChannel} / 255`,
    `  mean channel difference  ${r.meanChannel.toFixed(4)}`,
    `  pixels differing         ${r.pixelsDiffering} of ${r.width * r.height} (${pct}%)` +
      (r.worstAt ? `, worst at (${r.worstAt.x},${r.worstAt.y})` : ''),
    r.maxChannel === 0
      ? verified
        ? '  ⇒ the cycle CLOSES: the frame at the duration is the frame at t = 0, to the byte'
        : '  ⇒ the last frame IS the first frame, to the byte — a seam of 0 if the sampling line above holds'
      : verified
        ? '  ⇒ the cycle does not close on its opening pose; the numbers above are the size of the jump'
        : '  ⇒ the last frame differs from the first; whether that difference is the SEAM depends on the sampling line above',
  ];
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const positional: string[] = [];
  let durationText: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--duration') {
      durationText = argv[++i];
      if (durationText === undefined) {
        console.error('--duration needs a number of seconds — the animation\'s own duration, out of the motion spec');
        process.exit(2);
      }
    } else if (argv[i].startsWith('--duration=')) {
      durationText = argv[i].slice('--duration='.length);
    } else {
      positional.push(argv[i]);
    }
  }
  const dir = positional[0];
  if (!dir || positional.length > 1) {
    console.error('usage: bun gallery/loop_seam.ts <frame directory rigc render wrote> [--duration <seconds>]');
    process.exit(2);
  }
  const record = readSampling(dir);
  if (durationText !== undefined) {
    const refusal = refuseSampling(dir, durationText, record);
    if (refusal) {
      console.error(`loop_seam: ${refusal}`);
      process.exit(2);
    }
  }
  for (const line of seamLines(dir, measureLoopSeam(dir), record, durationText)) console.log(line);
}
