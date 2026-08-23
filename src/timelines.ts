/**
 * The 4.3 animation timeline catalogue, as data plus one walker.
 *
 * This lives on its own because two very different consumers need the same
 * enumeration and neither may drift from the other: `validate.ts` walks it to
 * check curve arrays (A05) and two-colour timelines (A12), and `diff.ts` walks
 * it to count what a rig actually keys. When it was inlined in the validator,
 * "which groups exist" was stated in one place and the comparison tool would
 * have had to restate it — and a second copy of a catalogue is a second copy
 * that goes stale silently.
 *
 * Pure JSON reading. No spine-core, no filesystem. The line numbers cited are
 * into `SkeletonJson.ts` on branch 4.3; the field-by-field survey is in
 * `docs/SPEC_COVERAGE.md` part 1-8.
 */

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * How many value channels each timeline carries. A curve array holds exactly
 * four numbers PER channel; anything shorter
 * multiplies `undefined` into the cubic and produces a NaN curve with no error
 * (case 6g). `null` means "this timeline takes no curve at all".
 */
const BONE_CHANNELS: Record<string, number | null> = {
  rotate: 1,
  translate: 2,
  translatex: 1,
  translatey: 1,
  scale: 2,
  scalex: 1,
  scaley: 1,
  shear: 2,
  shearx: 1,
  sheary: 1,
  inherit: null,
};
const SLOT_CHANNELS: Record<string, number | null> = {
  attachment: null,
  rgba: 4,
  rgb: 3,
  alpha: 1,
  rgba2: 7,
  rgb2: 6,
};
const ATTACHMENT_CHANNELS: Record<string, number | null> = {
  deform: 1,
  sequence: null,
};
const PHYSICS_CHANNELS: Record<string, number | null> = {
  inertia: 1,
  strength: 1,
  damping: 1,
  mass: 1,
  wind: 1,
  gravity: 1,
  mix: 1,
  reset: null,
};
const PATH_CHANNELS: Record<string, number | null> = {
  position: 1,
  spacing: 1,
  mix: 3,
};
const SLIDER_CHANNELS: Record<string, number | null> = {
  time: 1,
  mix: 1,
};
/**
 * `ik` and `transform` are ONE timeline per constraint with no sub-name — the
 * group maps a constraint name straight to a key array. There is no name in the
 * file to look up, so the walker passes the group's own name and these tables
 * hold that single entry.
 */
const IK_CHANNELS: Record<string, number | null> = { ik: 2 };
const TRANSFORM_CHANNELS: Record<string, number | null> = { transform: 6 };
/** Whole-animation timelines. None of the three can carry a curve at all. */
const DRAW_ORDER_CHANNELS: Record<string, number | null> = { drawOrder: null };
const DRAW_ORDER_FOLDER_CHANNELS: Record<string, number | null> = { drawOrderFolder: null };
const EVENT_CHANNELS: Record<string, number | null> = { events: null };

/**
 * How far past an animation's declared `duration` a key time may land: one step
 * of the grid every key time is rounded onto.
 *
 * The compiler quantises key times onto that grid with `keyTime`, which rounds
 * DOWN (issue #99), so 1e-6 s is the finest distinction a key can make and a
 * *correct* key now misses its target only on the early side: a key the author put
 * exactly ON a duration of 68/12 s emits as 5.666666 rather than past it. What
 * still needs the tolerance is the other side of the same rule — `validate` re-runs
 * it on an emitted file read back through a **Float32Array**, whose steps are
 * coarser than this one and round both ways, and on artifacts no rigc compile ever
 * touched. Anything a whole step past a declared duration was authored there, not
 * rounded onto it.
 *
 * ⚠️ `FRAME` (1/60 s) is the wrong tolerance for this, which is why the constant
 * is separate rather than reused: 1/60 s answers "is the DECLARED DURATION
 * wrong?", it is 16,667 times wider than this, and it hid the defect that put
 * this here. Rung 6 rounded key times to 4 dp in its authoring tooling, so a
 * one-frame attachment reveal landed 3.4e-5 s past a 68/12 s duration — 34 steps
 * past this line but 1/500 of FRAME, with another track already sitting on the
 * declared duration, so the compiler's Rule 4 and the validator's A09 both
 * compared the animation's max key time and agreed. The reveal never fired
 * (issue #54).
 *
 * It lives here, beside the timeline catalogue, for the reason the catalogue
 * does: `compile.ts` refuses on it and `validate.ts` re-checks the emitted file
 * against it, and a second copy of the number is a second copy that drifts.
 */
export const KEY_TIME_EPSILON = 1e-6;

/**
 * Every timeline group `readAnimation` reads (SPEC_COVERAGE part 1-8), keyed by
 * the walker's `kind`. A05 selects its channel table from here, so a group that
 * is missing from this map is a group whose curves nobody checks.
 */
export const CHANNELS_BY_KIND: Record<TimelineKind, Record<string, number | null>> = {
  bone: BONE_CHANNELS,
  slot: SLOT_CHANNELS,
  ik: IK_CHANNELS,
  transform: TRANSFORM_CHANNELS,
  path: PATH_CHANNELS,
  physics: PHYSICS_CHANNELS,
  slider: SLIDER_CHANNELS,
  attachment: ATTACHMENT_CHANNELS,
  drawOrder: DRAW_ORDER_CHANNELS,
  drawOrderFolder: DRAW_ORDER_FOLDER_CHANNELS,
  event: EVENT_CHANNELS,
};

/** The eleven timeline groups one animation can hold in 4.3. */
export type TimelineKind =
  | 'bone'
  | 'slot'
  | 'ik'
  | 'transform'
  | 'path'
  | 'physics'
  | 'slider'
  | 'attachment'
  | 'drawOrder'
  | 'drawOrderFolder'
  | 'event';


/**
 * Walks every timeline group `readAnimation` reads and hands each timeline to
 * the visitor.
 *
 * ⚠️ This function is the reach of A05 and A12, so a group it does not descend
 * is a group whose curve arrays nobody checks — and a short curve array is the
 * format's nastiest silent failure (`curve[i+3]` is
 * `undefined`, the cubic yields NaN, nothing throws). It used to descend
 * `bones`, `slots`, `physics` and `attachments` only, which left `ik`,
 * `transform`, `path`, `slider`, `drawOrder`, `drawOrderFolder` and `events`
 * completely unexamined. The comment that stood here claimed drawOrder and
 * events were "skipped by design" because they carry no curves — but "carries
 * no curve" is precisely a rule that has to be CHECKED, and the parser ignores
 * a stray `curve` key on those timelines rather than rejecting it.
 *
 * The groups come in four shapes, and the shape is the whole reason this is not
 * one loop (SPEC_COVERAGE part 1-8):
 *
 *   group.<target>.<timeline> = keys[]   bones, slots, path, physics, slider
 *   group.<target>            = keys[]   ik, transform — one unnamed timeline
 *   group                     = keys[]   drawOrder, events — one per animation
 *   group                     = folders[] with .keys[]   drawOrderFolder
 *
 * plus `attachments.<skin>.<slot>.<attachment>.<timeline>`. For the shapes with
 * no timeline name in the file, the walker passes the group's own name so that
 * A05's table lookup and its "unchecked timeline" fail-closed branch both keep
 * working unchanged.
 */
export function walkTimelines(
  raw: Json | null,
  visit: (path: string, kind: TimelineKind, name: string, keys: unknown[]) => void,
): void {
  if (!raw || !isObj(raw.animations)) return;
  for (const [animName, anim] of Object.entries(raw.animations as Json)) {
    if (!isObj(anim)) continue;

    // group.<target>.<timeline> = keys[]
    for (const [group, kind] of [
      ['bones', 'bone'],
      ['slots', 'slot'],
      ['path', 'path'],
      ['physics', 'physics'],
      ['slider', 'slider'],
    ] as const) {
      if (!isObj(anim[group])) continue;
      for (const [targetName, timelines] of Object.entries(anim[group] as Json)) {
        if (!isObj(timelines)) continue;
        for (const [timelineName, keys] of Object.entries(timelines)) {
          if (!Array.isArray(keys)) continue;
          visit(`${animName}.${group}.${targetName}.${timelineName}`, kind, timelineName, keys);
        }
      }
    }

    // group.<constraint> = keys[] — the constraint IS the timeline
    for (const [group, kind] of [
      ['ik', 'ik'],
      ['transform', 'transform'],
    ] as const) {
      if (!isObj(anim[group])) continue;
      for (const [targetName, keys] of Object.entries(anim[group] as Json)) {
        if (!Array.isArray(keys)) continue;
        visit(`${animName}.${group}.${targetName}`, kind, group, keys);
      }
    }

    // group = keys[] — one timeline for the whole animation
    for (const [group, kind] of [
      ['drawOrder', 'drawOrder'],
      ['events', 'event'],
    ] as const) {
      const keys = anim[group];
      if (!Array.isArray(keys)) continue;
      visit(`${animName}.${group}`, kind, group, keys);
    }

    // drawOrderFolder = [ { slots: [...], keys: [...] } ] — one timeline per folder
    if (Array.isArray(anim.drawOrderFolder)) {
      (anim.drawOrderFolder as unknown[]).forEach((folder, i) => {
        if (!isObj(folder) || !Array.isArray(folder.keys)) return;
        visit(`${animName}.drawOrderFolder[${i}]`, 'drawOrderFolder', 'drawOrderFolder', folder.keys);
      });
    }

    // attachments.<skin>.<slot>.<attachment>.<timeline>
    if (isObj(anim.attachments)) {
      for (const [skinName, skinMap] of Object.entries(anim.attachments as Json)) {
        if (!isObj(skinMap)) continue;
        for (const [slotName, slotMap] of Object.entries(skinMap)) {
          if (!isObj(slotMap)) continue;
          for (const [attName, attMap] of Object.entries(slotMap)) {
            if (!isObj(attMap)) continue;
            for (const [timelineName, keys] of Object.entries(attMap)) {
              if (!Array.isArray(keys)) continue;
              visit(
                `${animName}.attachments.${skinName}.${slotName}.${attName}.${timelineName}`,
                'attachment',
                timelineName,
                keys,
              );
            }
          }
        }
      }
    }
  }
}

