/**
 * How far one bone turns against another over an animation — the reading behind
 * `rigc render --angle-range <bone>:<relative-to>[,…]` (issue #1414).
 *
 * ⭐ **A reading, not a gate**, as `--folds` and `--pass-through` are. A physics
 * value has no scale an author can see: §4.6 lists `inertia`, `strength` and the
 * rest with their bounds, and nothing said what `inertia` 0.5 does to a 54-unit
 * chain under a hip swing — the first try on a real rig was four times too big.
 * The answer is a number the pose already holds: how far the link turned against
 * the bone it hangs from. So this reads it off the frames `render` draws and
 * decides nothing.
 *
 * ## What the range is
 *
 * At each frame the bones are posed by whichever poser draws the frames, and each
 * bone's **world direction** is that poser's own `rotationX` — the direction its x
 * axis points, degrees counter-clockwise, y up (`BoneSnapshot`), never a second
 * opinion recomputed from the matrix here. The relative angle is
 *
 *     rotationX(bone) − rotationX(relative-to)
 *
 * taken into (−180, 180] on the first frame read, and then **followed**: each
 * later frame's difference is moved by whole turns to within half a turn of the
 * frame before it. So a link that sweeps 200° reads 200°, not −160°, and one that
 * sways through ±180° does not read a jump of a whole turn. Following assumes no
 * two consecutive frames are half a turn or more apart, which a frame grid that
 * coarse could not show anyway.
 *
 * ⚠️ It is the angle **drawn**, not the bone's local `rotation`. The two agree for
 * a child of the other bone when the parent carries no non-uniform scale or shear;
 * otherwise they differ, and the drawn one is what a viewer sees.
 *
 * The range is over the frames on the render's own grid — `--fps`, from t = 0 to
 * the animation's last frame — so a peak between two frames is not read. A bone
 * the posed skin leaves unposed, or one scaled to nothing, has no direction: its
 * world matrix is zero, and the reading is refused naming the bone and the frame
 * rather than read as 0°.
 *
 * Pure: no clock, no randomness, no runtime. The bone snapshots are handed in by
 * whichever poser drew the frames.
 */
import type { BoneSnapshot } from './render_shared.ts';

/** One pair as the flag names it: the bone whose angle is read, and the bone it is read against. */
export interface BonePair {
  bone: string;
  relativeTo: string;
}

/** A malformed `--angle-range` value, or a pose the reading has no angle for — said by name. */
export class AngleRangeError extends Error {}

/**
 * `--angle-range`'s value — `<bone>:<relative-to>[,<bone>:<relative-to>…]` —
 * read against the skeleton's bones, or refused naming the entry: an empty
 * entry, one without exactly one `:`, an empty name, a bone the skeleton does not
 * have (with the bones it does), a bone read against itself (always 0°), and a
 * pair named twice.
 */
export function readBonePairs(raw: string, bones: readonly string[]): BonePair[] {
  const form = '<bone>:<relative-to>[,<bone>:<relative-to>…]';
  const pairs: BonePair[] = [];
  const entries = raw.split(',');
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i].trim();
    if (entry === '') throw new AngleRangeError(`--angle-range ${JSON.stringify(raw)}: entry ${i} is empty — it takes ${form}`);
    const parts = entry.split(':');
    if (parts.length !== 2) {
      throw new AngleRangeError(`--angle-range: entry ${i} ${JSON.stringify(entry)} has ${parts.length - 1} ":" — it takes ${form}, one ":" per pair`);
    }
    const [bone, relativeTo] = parts.map((p) => p.trim());
    for (const [role, name] of [['bone', bone], ['relative-to bone', relativeTo]] as const) {
      if (name === '') throw new AngleRangeError(`--angle-range: entry ${i} ${JSON.stringify(entry)} names no ${role} — it takes ${form}`);
      if (!bones.includes(name)) {
        throw new AngleRangeError(`--angle-range: entry ${i} names ${role} ${JSON.stringify(name)}, which this skeleton does not have; its bones are [${bones.join(', ')}]`);
      }
    }
    if (bone === relativeTo) {
      throw new AngleRangeError(`--angle-range: entry ${i} reads bone ${JSON.stringify(bone)} against itself, which is 0° on every frame — name a second bone`);
    }
    const again = pairs.findIndex((p) => p.bone === bone && p.relativeTo === relativeTo);
    if (again >= 0) throw new AngleRangeError(`--angle-range: entry ${i} names "${bone}:${relativeTo}" again — entry ${again} already reads it`);
    pairs.push({ bone, relativeTo });
  }
  return pairs;
}

/** One sampled frame: its index, its time, and every bone's world transform. */
export interface AngleFrame {
  index: number;
  time: number;
  bones: readonly BoneSnapshot[];
}

/** One extreme of a range: the angle, degrees, and the frame that reached it first. */
export interface AngleExtreme {
  degrees: number;
  index: number;
  time: number;
}

/** One pair's reading over one set. */
export interface AngleRangeReading {
  bone: string;
  relativeTo: string;
  /** Frames read — every frame of the set. */
  frames: number;
  low: AngleExtreme;
  high: AngleExtreme;
}

/**
 * Wrong readings the suite plants to see its controls go red (issue #1414):
 * `worldAngle` reads the bone's own world direction and ignores the bone it is
 * read against; `noFollow` leaves each frame's difference in (−180, 180] rather
 * than following it from the frame before.
 */
export interface AnglePlant {
  worldAngle?: true;
  noFollow?: true;
}

/** `d` taken into (−180, 180]. */
function wrapped(d: number): number {
  let r = d % 360;
  if (r <= -180) r += 360;
  if (r > 180) r -= 360;
  return r;
}

/** A world matrix with no direction — every entry zero: an unposed bone, or one scaled to nothing. */
function directionless(b: BoneSnapshot): boolean {
  return b.a === 0 && b.b === 0 && b.c === 0 && b.d === 0;
}

/**
 * Each pair's range over `frames`, in the pairs' order — refused by
 * `AngleRangeError`, naming the bone and the frame, where a bone has no
 * direction (`directionless`), and naming the bone where a frame carries no
 * snapshot of it at all (frames sampled without `{ bones: true }`).
 */
export function angleRangesOf(pairs: readonly BonePair[], frames: readonly AngleFrame[], where: string, plant: AnglePlant = {}): AngleRangeReading[] {
  return pairs.map(({ bone, relativeTo }) => {
    let previous: number | null = null;
    let low: AngleExtreme | null = null;
    let high: AngleExtreme | null = null;
    for (const frame of frames) {
      const at = (name: string): BoneSnapshot => {
        const found = frame.bones.find((b) => b.name === name);
        if (found === undefined) throw new AngleRangeError(`--angle-range, ${where} frame ${frame.index}: no world transform for bone ${JSON.stringify(name)} was sampled`);
        if (directionless(found)) {
          throw new AngleRangeError(
            `--angle-range, ${where} frame ${frame.index} (t=${frame.time.toFixed(4)}s): bone ${JSON.stringify(name)} has no direction — its world matrix is zero ` +
              '(a bone the posed skin leaves unposed, or one scaled to nothing), so it has no angle to read',
          );
        }
        return found;
      };
      const a = at(bone);
      const b = at(relativeTo);
      const difference = plant.worldAngle === true ? a.rotationX : a.rotationX - b.rotationX;
      let angle = wrapped(difference);
      if (previous !== null && plant.noFollow !== true) angle += 360 * Math.round((previous - angle) / 360);
      previous = angle;
      if (low === null || angle < low.degrees) low = { degrees: angle, index: frame.index, time: frame.time };
      if (high === null || angle > high.degrees) high = { degrees: angle, index: frame.index, time: frame.time };
    }
    if (low === null || high === null) throw new AngleRangeError(`--angle-range, ${where}: no frame was sampled`);
    return { bone, relativeTo, frames: frames.length, low, high };
  });
}

/** Degrees to four places, with a rounding to zero printed as `0.0000` rather than `-0.0000`. */
export function degreesText(d: number): string {
  const text = d.toFixed(4);
  return text === '-0.0000' ? '0.0000' : text;
}

/**
 * The printed line: the set, the pair, the low and the high with the frame each
 * was first reached on, the span, and the grid it was read on.
 */
export function angleRangeLine(animation: string | null, fps: number, r: AngleRangeReading): string {
  const where = animation === null ? 'the setup pose' : JSON.stringify(animation);
  return (
    `${where}: bone ${JSON.stringify(r.bone)} against ${JSON.stringify(r.relativeTo)} ranges ${degreesText(r.low.degrees)}° to ${degreesText(r.high.degrees)}° ` +
    `(a span of ${degreesText(r.high.degrees - r.low.degrees)}°) over ${r.frames} frame(s) at ${fps} fps; ` +
    `lowest at frame ${r.low.index} (t=${r.low.time.toFixed(4)}s), highest at frame ${r.high.index} (t=${r.high.time.toFixed(4)}s)`
  );
}
