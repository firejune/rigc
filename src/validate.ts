/**
 * rigc validate — the other half of the tool.
 *
 * The parser is forgiving, and that is the danger: there are at least six ways
 * to write a wrong skeleton that loads with no error at all. So this stage has
 * two layers:
 *
 *   A. Round-trip through the REAL spine-core. If TextureAtlas or SkeletonJson
 *      throws, the artifact is dead on arrival — those are the two failures the
 *      parser does report.
 *   B. Assertions we make ourselves, because the parser will not. Every silent
 *      failure becomes one named machine check here.
 *
 * A failure is a named assertion, and a named assertion is a nonzero exit.
 */
import { existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import {
  AnimationState,
  AnimationStateData,
  AtlasAttachmentLoader,
  BoundingBoxAttachment,
  ClippingAttachment,
  MeshAttachment,
  Physics,
  PhysicsConstraintData,
  RegionAttachment,
  Skeleton,
  SkeletonJson,
  TextureAtlas,
} from '@esotericsoftware/spine-core';
import { colourTypeName, readPngInfo } from './png.ts';
import { CHANNELS_BY_KIND, KEY_TIME_EPSILON, walkTimelines } from './timelines.ts';
import type { RigInfo } from './types.ts';

export interface Failure {
  assertion: string;
  detail: string;
}

/**
 * Which body of rules to hold the artifact to.
 *
 * ⭐ The distinction this draws is the difference between "wrong" and "not how we
 * do it here", and conflating the two is how a validator stops being usable on
 * anybody else's data. Fourteen of the 36 assertions are policy — seven for one
 * renderer (`spine-html`) and one project's canvas budget, seven for rigc's own
 * formations — and every one of them fires
 * on real, correct, editor-produced Spine data — the official example projects
 * carry clipping attachments, unweighted meshes, 116-triangle meshes and packed
 * atlases, all of which are perfectly valid and none of which spine-html likes.
 *
 * - `spine`      — is this valid Spine 4.3 that any runtime will play correctly?
 * - `spine-html` — the above, plus this project's renderer and archetype policy.
 *
 * ⚠️ `validate()` has NO default profile — `ValidateInput.profile` is required,
 * and that is deliberate. A silent default here can only be wrong in one of two
 * directions: loosen it and a caller who did not ask gets a weaker gate than the
 * one they think they ran; tighten it and foreign data is refused by a policy the
 * caller has no stake in. Issue #221 flipped the CLI to `spine` while several
 * internal callers still wanted `spine-html`, at which point one constant could
 * no longer honestly serve both — so the choice is made at every call site now,
 * by the caller who knows which question they are asking.
 */
export type ValidateProfile = 'spine' | 'spine-html';

export const VALIDATE_PROFILES: readonly ValidateProfile[] = ['spine', 'spine-html'];

/**
 * What the CLI uses when `--profile` is absent — and ONLY the CLI. This is not
 * `validate()`'s default; that function has none (above).
 *
 * `spine` since issue #221. The published package's pitch is "the output imports
 * into the Spine editor", which is exactly the question `spine` asks, and a
 * stranger's first build was being judged instead against one renderer's policy
 * and one project's canvas budget — 14 rules they have no stake in, with the
 * escape hatch documented only in prose. Defaults beat prose. `spine-html` is
 * still one flag away, and every report names the profile that judged it.
 */
export const CLI_DEFAULT_PROFILE: ValidateProfile = 'spine';

/**
 * What kind of rule each assertion is. Every assertion has an entry, and
 * `check()` throws on a name that has none — a new assertion must state its kind
 * rather than defaulting into one, because the default would decide, silently,
 * whether it runs on foreign data.
 *
 *   validity  — the file is wrong for any consumer. Runs under every profile.
 *   renderer  — valid Spine that this project's renderer or frame budget refuses.
 *   archetype — a structural rule about rigc's own formations, meaningless to a
 *               skeleton rigc did not compile.
 *
 * Three assertions are MIXED and are marked `validity` here because their
 * validity half must never stop running; their policy clauses are gated inside
 * the assertion body against `profile`, and each such clause says so where it
 * lives. They are A06 (size-vs-PNG is validity; pma / rotation / full-page
 * coverage are policy), A08 (the attachment→region join is validity; requiring
 * the two names to be identical is policy) and A20 (weight coherence is
 * validity; requiring a mesh to be weighted at all is policy).
 */
const ASSERTION_KIND: Record<string, 'validity' | 'renderer' | 'archetype'> = {
  A00_ROUNDTRIP_PARSE: 'validity',
  A01_NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS: 'validity',
  A02_NO_BONE_TRANSFORM_KEY: 'validity',
  A03_REGION_WIDTH_HEIGHT_FINITE: 'validity',
  A04_MESH_TRIANGLES_AND_ENCODING: 'validity',
  A05_CURVE_ARRAY_LENGTH: 'validity',
  A06_ATLAS_PAGE_SIZE_MATCHES_PNG: 'validity', // mixed — see above
  A07_ATLAS_TEXT_SHAPE: 'validity',
  A08_REGION_NAMES_MATCH_ATTACHMENTS: 'validity', // mixed — see above
  A09_ANIMATION_DURATION_MATCHES_SPEC: 'validity',
  A10_NO_NAN_AFTER_STEPPING: 'validity',
  A11_NO_CLIPPING_ATTACHMENTS: 'renderer',
  A12_NO_DARK_COLOR: 'renderer',
  A13_MESH_BUDGET: 'renderer',
  A14_NO_FULL_FRAME_MESH: 'renderer',
  A15_IDLE_NO_MESH_BONE_KEYS: 'renderer',
  A16_SKELETON_VERSION_4_3: 'validity',
  A17_ATLAS_PAGE_FILES_EXIST: 'validity',
  A18_DETERMINISTIC_EMIT: 'validity',
  A19_OVERLAY_PNGS_HAVE_ALPHA: 'renderer',
  A20_MESH_WEIGHTS_COHERENT: 'validity', // mixed — see above
  A21_MESH_RIM_PINNED: 'archetype',
  A22_MESH_UVS_IN_UNIT_RANGE: 'validity',
  A23_PHYSICS_CONSTRAINT_EFFECTIVE: 'validity',
  A24_AXIS_SPACE_STROKE: 'archetype',
  A25_DETACHED_BONE_PARENTAGE: 'archetype',
  A26_SLOT_DRAW_ORDER: 'archetype',
  A27_REGION_NAME_MATCHES_PAGE_FILENAME: 'renderer',
  A28_RIBBON_ROWS_SHARE_WEIGHTS: 'archetype',
  A29_STROKE_WITHIN_CONTACT_DEPTH: 'archetype',
  A30_STROKE_WITHIN_CAP_CONTAINMENT: 'archetype',
  A31_DRAW_ORDER_OFFSETS_RESOLVE: 'validity',
  A32_EVENT_KEYS_RESOLVE: 'validity',
  A33_VERTEX_ATTACHMENT_GEOMETRY: 'validity',
  A34_CONSTRAINT_TIMELINE_TARGETS: 'validity',
  A35_DEFORM_KEYS_FIT_THE_ATTACHMENT: 'validity',
};

export interface ValidateInput {
  skeletonText: string;
  atlasText: string;
  /** Directory the atlas lives in; page names resolve against it. */
  atlasDir: string;
  /** Declared durations from the motion spec. */
  declaredDurations?: Record<string, number>;
  /** Re-emitted artifacts, for the determinism check. */
  reEmit?: { skeletonText: string; atlasText: string };
  /**
   * Structural expectations the artifact cannot state about itself: which mesh is
   * a ribbon, which bone carries the axis, which parentage is forbidden, what the
   * canonical draw order is. Absent when `validate <dir>` is pointed at a bare
   * directory, and the assertions that need it then SKIP rather than guess — the
   * stats line says `rig=absent` so a green run cannot be mistaken for a full one.
   */
  rig?: RigInfo;
  /**
   * Which body of rules to apply. Required, and deliberately so — there is no
   * default to fall into. See ValidateProfile.
   */
  profile: ValidateProfile;
}

export interface ValidateReport {
  failures: Failure[];
  /** Assertions that ran and passed, in order. */
  passed: string[];
  /**
   * Assertions that had no data to run against, with the reason.
   *
   * ⚠️ Not cosmetic. An assertion whose subject is a per-cut MEASUREMENT (a
   * contact depth, a containment ceiling) is vacuous on a cut that never measured
   * one, and reporting that as PASS is this project's favourite false green: a
   * gate that says it checked something it never looked at. So the report says
   * SKIP and why, and `passed` does not count it.
   */
  skipped: Array<{ assertion: string; reason: string }>;
  /** Which body of rules ran. */
  profile: ValidateProfile;
  /**
   * Assertions this profile does not apply, with their kind.
   *
   * Kept separate from `skipped` on purpose: a SKIP means "there was nothing to
   * look at", a profile skip means "this rule was deliberately out of scope".
   * Reading a `--profile spine` green as though the renderer policy had passed
   * is exactly the misreading the two lists exist to prevent.
   */
  profileSkipped: Array<{ assertion: string; kind: 'renderer' | 'archetype' }>;
  stats: Record<string, number | string>;
}

const FRAME = 1 / 60;
const STEP_FRAMES = 120;

/**
 * One step of the **float32** grid at `t`, which is the grid a loaded key time
 * actually sits on: `spine-core` reads every timeline's frames into a
 * `Float32Array`, so a time the compiler wrote as `32.366667` comes back as
 * `32.366668701171875`.
 *
 * A09 needs this and the compiler does not, and that asymmetry is the reason it
 * is a function rather than a constant. `KEY_TIME_EPSILON` is fixed because the
 * compiler's own grid is fixed — `r6` puts every key time on 1e-6 s at any
 * magnitude. A float32 step is not: 4.8e-7 s at 5 s, 3.8e-6 s at 32 s. Adding a
 * flat epsilon to a comparison against a value that has been through float32
 * would fail correct data for being long — 971 frames at 30 fps keyed exactly on
 * its own declared duration arrives 2.0e-6 s late, twice the whole epsilon.
 *
 * The spacing of a normal float is 2^(exponent − 23), and `Math.log2` recovers
 * the exponent. Zero takes the guard — a named empty animation declares
 * `duration: 0` and A09 does compare it — and the magnitude is taken first, so a
 * sign never reaches `log2`.
 */
function float32Step(t: number): number {
  const magnitude = Math.abs(t);
  if (!Number.isFinite(magnitude) || magnitude === 0) return 0;
  return 2 ** (Math.floor(Math.log2(magnitude)) - 23);
}

/**
 * `4.3`, `4.3.<patch>`, or `4.3.<patch>-<suffix>` — the last of which is what the
 * Spine editor writes for a pre-release (`"4.3.75-beta"` in all twelve official
 * example exports). The major/minor pair is the load-bearing part; see A16.
 */
const SPINE_4_3_VERSION = /^4\.3(\.\d+(-[0-9A-Za-z][0-9A-Za-z.+-]*)?)?$/;

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * How long the array a deform key edits is, read off one raw attachment — or
 * `null` when the file does not say.
 *
 * The rule is `readVertices`' own: the attachment's `vertices` is coordinates
 * when its length equals `worldVerticesLength`, and a weight run otherwise. A
 * deform array is therefore one `x, y` pair per **vertex** in the first case and
 * one per **bone influence** (`vertices.length / 3`) in the second — the same
 * count with two different meanings, which is exactly why this measures rather
 * than assumes.
 *
 * `null` for the two shapes that cannot be measured from this object alone: a
 * type with no vertices at all (nothing to deform, and the parser throws on it),
 * and a `linkedmesh`, whose geometry belongs to another attachment.
 */
function deformArrayLength(att: Json): number | null {
  const type = typeof att.type === 'string' ? att.type : 'region';
  let worldVerticesLength: number;
  if (type === 'mesh') {
    if (!Array.isArray(att.uvs)) return null;
    worldVerticesLength = att.uvs.length;
  } else if (type === 'boundingbox' || type === 'clipping' || type === 'path') {
    if (typeof att.vertexCount !== 'number') return null;
    worldVerticesLength = att.vertexCount * 2;
  } else {
    return null;
  }
  if (!Array.isArray(att.vertices)) return null;
  const vertices = att.vertices as unknown[];
  return vertices.length === worldVerticesLength ? worldVerticesLength : (vertices.length / 3) * 2;
}

export function validate(input: ValidateInput): ValidateReport {
  const failures: Failure[] = [];
  const passed: string[] = [];
  const skipped: ValidateReport['skipped'] = [];
  const profileSkipped: ValidateReport['profileSkipped'] = [];
  const stats: Record<string, number | string> = {};
  const profile = input.profile;
  /** True when this profile's rulebook includes the policy layer. */
  const policy = profile === 'spine-html';

  const fail = (assertion: string, detail: string) => failures.push({ assertion, detail });
  /** Declare that an assertion had nothing to check, and why. */
  const skip = (assertion: string, reason: string) => skipped.push({ assertion, reason });
  /**
   * Run one assertion; record it as passed only if it neither failed nor skipped,
   * and do not run it at all when the profile does not carry that kind of rule.
   *
   * The unknown-assertion throw is deliberate: an assertion with no entry in
   * ASSERTION_KIND would otherwise pick a profile by accident, and picking wrong
   * means either a rule that never runs or a rule that fires on everybody's data.
   *
   * The body's return value is handed back — `undefined` when the assertion did
   * not run or threw. Only A00 uses it, and it uses it so that the loaded atlas
   * and skeleton can be `const`: assigning them from inside this callback leaves
   * the type checker unable to see that they were ever set, and every later read
   * of `atlas.pages` or `data.bones` becomes a property of `never`.
   */
  const check = <T>(assertion: string, body: () => T): T | undefined => {
    const kind = ASSERTION_KIND[assertion];
    if (!kind) throw new Error(`validate: assertion "${assertion}" has no ASSERTION_KIND entry`);
    if (kind !== 'validity' && !policy) {
      profileSkipped.push({ assertion, kind });
      return undefined;
    }
    const before = failures.length;
    const skippedBefore = skipped.length;
    let result: T | undefined;
    try {
      result = body();
    } catch (err) {
      fail(assertion, `threw: ${(err as Error).message}`);
    }
    if (failures.length === before && skipped.length === skippedBefore) passed.push(assertion);
    return result;
  };

  // -------------------------------------------------------------------------
  // Raw text / raw JSON assertions (they must run even if the parser is happy)
  // -------------------------------------------------------------------------

  let raw: Json | null = null;
  try {
    raw = JSON.parse(input.skeletonText) as Json;
  } catch (err) {
    fail('A00_ROUNDTRIP_PARSE', `skeleton JSON is not parseable: ${(err as Error).message}`);
  }

  // --- A07: atlas text shape ------------------------------------------------
  // Two traps, both measured: a region name is the RAW
  // line (only the page name is trimmed), and a blank line closes the page
  // block, so a blank line between a page header and its regions turns the
  // regions into pages.
  const atlasLines = input.atlasText.replace(/\n$/, '').split('\n');
  check('A07_ATLAS_TEXT_SHAPE', () => {
    let expectPage = true;
    let sawRegionForPage = false;
    for (let i = 0; i < atlasLines.length; i++) {
      const line = atlasLines[i];
      if (line.trim().length === 0) {
        if (expectPage) fail('A07_ATLAS_TEXT_SHAPE', `line ${i + 1}: consecutive blank lines`);
        else if (!sawRegionForPage) {
          fail('A07_ATLAS_TEXT_SHAPE', `line ${i + 1}: blank line before this page had any region`);
        }
        expectPage = true;
        sawRegionForPage = false;
        continue;
      }
      if (expectPage) {
        expectPage = false;
        continue; // page name line
      }
      if (line.includes(':')) continue; // key: value line
      // A bare non-key line is a region name, and it is used untrimmed.
      if (line !== line.trim()) {
        fail('A07_ATLAS_TEXT_SHAPE', `line ${i + 1}: region name has stray whitespace: ${JSON.stringify(line)}`);
      }
      sawRegionForPage = true;
    }
    if (!sawRegionForPage && atlasLines.length) {
      fail('A07_ATLAS_TEXT_SHAPE', 'the last page block declares no region');
    }
  });

  // --- A31: every draw-order offset lands on a real place -------------------
  //
  // 🚨 This one runs BEFORE the round trip, and it is the only assertion that
  // does so for a reason other than "the parser is happy about it". A draw-order
  // key whose offsets are not in ascending slot order does not load wrong — it
  // does not load at all. `readDrawOrder` (SkeletonJson.ts:1336-1374) walks a
  // forward-only cursor:
  //
  //   while (originalIndex !== index) unchanged[unchangedIndex++] = originalIndex++;
  //
  // and an entry naming an EARLIER slot than the one before it makes that
  // condition unreachable, so the loader spins and grows an array until the
  // process dies. So the check has to happen first, and when it finds that shape
  // the round trip is not attempted at all — reported as such, not as a pass.
  //
  // The other two shapes are the format's usual silence. An offset that puts a
  // slot outside the array writes past the end, leaves a −1 hole in the
  // permutation, and the fill loop reads `unchanged[-1]` — `undefined` where a
  // slot index belongs, with nothing thrown. Two entries for one slot write
  // twice at one cursor position and the first move is simply lost.
  let drawOrderIsUnparseable: string | null = null;
  check('A31_DRAW_ORDER_OFFSETS_RESOLVE', () => {
    if (!raw) return skip('A31_DRAW_ORDER_OFFSETS_RESOLVE', 'the skeleton JSON did not parse (A00 owns that failure)');
    if (!Array.isArray(raw.slots) || !isObj(raw.animations)) {
      return skip('A31_DRAW_ORDER_OFFSETS_RESOLVE', 'the skeleton declares no slots or no animations');
    }
    const slotIndex = new Map<string, number>();
    (raw.slots as unknown[]).forEach((slot, i) => {
      if (isObj(slot) && typeof slot.name === 'string') slotIndex.set(slot.name, i);
    });
    const slotCount = (raw.slots as unknown[]).length;
    let sawATimeline = false;
    for (const [animName, anim] of Object.entries(raw.animations as Json)) {
      if (!isObj(anim) || !Array.isArray(anim.drawOrder)) continue;
      sawATimeline = true;
      (anim.drawOrder as unknown[]).forEach((key, k) => {
        const at = `animation "${animName}" drawOrder key ${k}`;
        if (!isObj(key) || !Array.isArray(key.offsets)) return; // no offsets = setup order
        let previous = -1;
        for (const entry of key.offsets as unknown[]) {
          if (!isObj(entry) || typeof entry.slot !== 'string' || typeof entry.offset !== 'number') {
            fail('A31_DRAW_ORDER_OFFSETS_RESOLVE', `${at}: an offset is not { slot: string, offset: number }`);
            continue;
          }
          const index = slotIndex.get(entry.slot);
          if (index === undefined) {
            fail('A31_DRAW_ORDER_OFFSETS_RESOLVE', `${at}: slot "${entry.slot}" is not in the skeleton`);
            continue;
          }
          if (index <= previous) {
            const detail =
              `${at}: slot "${entry.slot}" is at index ${index}, after an entry at index ${previous} — ` +
              'offsets must be in ascending slot order or the loader never finishes reading them';
            fail('A31_DRAW_ORDER_OFFSETS_RESOLVE', detail);
            drawOrderIsUnparseable ??= detail;
            continue;
          }
          previous = index;
          const landing = index + entry.offset;
          if (!Number.isInteger(entry.offset) || landing < 0 || landing >= slotCount) {
            fail(
              'A31_DRAW_ORDER_OFFSETS_RESOLVE',
              `${at}: slot "${entry.slot}" is at index ${index} and offset ${entry.offset} puts it at ${landing}, ` +
                `outside the ${slotCount} slots`,
            );
          }
        }
      });
    }
    if (!sawATimeline) return skip('A31_DRAW_ORDER_OFFSETS_RESOLVE', 'no animation carries a drawOrder timeline');
  });

  // --- A32: every event key fires a declared event, in order ----------------
  //
  // The event timeline's three failure modes, and only the first is loud:
  //
  //   1. **An undeclared name.** `findEvent` returns null and `readAnimation`
  //      throws `Event not found` (SkeletonJson.ts:1244). A00 would catch it, but
  //      as a parser message about a name with no context; this one says which
  //      animation, which key, and what the skeleton does declare.
  //   2. **Times out of order.** `readAnimation` writes frame `i` from key `i` in
  //      ARRAY order and never sorts, so a decreasing time builds an
  //      `EventTimeline` whose frames run backwards. It loads clean, and the
  //      firings behind the fold simply never come out. Equal times are fine —
  //      two events on one frame is ordinary — so this is non-decreasing.
  //   3. **`volume`/`balance` on a silent event.** `:1254-1257` reads them only
  //      inside `if (event.data.audioPath)`, so on an event with no `audio` they
  //      are two numbers in the file that no runtime will ever read.
  //
  // It runs on the raw JSON rather than on the loaded data because the loaded
  // `Event` no longer remembers which fields the file wrote: an override that was
  // dropped and an override that matched the default are the same object.
  check('A32_EVENT_KEYS_RESOLVE', () => {
    if (!raw) return skip('A32_EVENT_KEYS_RESOLVE', 'the skeleton JSON did not parse (A00 owns that failure)');
    if (!isObj(raw.animations)) return skip('A32_EVENT_KEYS_RESOLVE', 'the skeleton declares no animations');
    const declared = isObj(raw.events) ? (raw.events as Json) : {};
    const known = Object.keys(declared);
    let sawATimeline = false;
    for (const [animName, anim] of Object.entries(raw.animations as Json)) {
      if (!isObj(anim) || !Array.isArray(anim.events)) continue;
      sawATimeline = true;
      let previous = -Infinity;
      (anim.events as unknown[]).forEach((key, k) => {
        const at = `animation "${animName}" event key ${k}`;
        if (!isObj(key) || typeof key.name !== 'string') {
          fail('A32_EVENT_KEYS_RESOLVE', `${at}: an event key needs a string "name"`);
          return;
        }
        const definition = declared[key.name];
        if (definition === undefined) {
          fail(
            'A32_EVENT_KEYS_RESOLVE',
            `${at}: fires "${key.name}", which the skeleton's events block does not declare` +
              (known.length ? ` (declared: ${known.join(', ')})` : ' (that block is empty or absent)'),
          );
          return;
        }
        // `time` defaults to 0 when absent (`:1247`), which is what the editor
        // writes for a firing on frame 0.
        const time = key.time === undefined ? 0 : key.time;
        if (typeof time !== 'number' || !Number.isFinite(time)) {
          fail('A32_EVENT_KEYS_RESOLVE', `${at}: time is ${JSON.stringify(key.time)}, not a finite number`);
          return;
        }
        if (time < previous) {
          fail(
            'A32_EVENT_KEYS_RESOLVE',
            `${at}: "${key.name}" is at t=${time}, after a key at t=${previous} — the parser fills frames in ` +
              'array order and never sorts them, so the earlier firing is unreachable',
          );
        }
        previous = Math.max(previous, time);
        const hasAudio = isObj(definition) && typeof definition.audio === 'string';
        for (const field of ['volume', 'balance'] as const) {
          if (key[field] !== undefined && !hasAudio) {
            fail(
              'A32_EVENT_KEYS_RESOLVE',
              `${at}: "${key.name}" sets ${field}, but the event declares no audio path — the parser reads ` +
                `${field} only for an event that has one, so it is dropped in silence`,
            );
          }
        }
      });
    }
    if (!sawATimeline) return skip('A32_EVENT_KEYS_RESOLVE', 'no animation carries an event timeline');
  });

  // --- A34: ik / transform timelines aim at a constraint of that type -------
  //
  // These two groups are one unnamed timeline per constraint
  // (`animations.<a>.ik.<name>`), and the parser resolves the name AND the type:
  // `findConstraint(name, IkConstraintData)` returns null for a transform
  // constraint that happens to share the name, and `readAnimation` then throws
  // `IK Constraint not found`. That one is loud — A00 reports it, as a parser
  // message about a name with no context — so this assertion exists for the
  // second failure, which is silent:
  //
  //   **An empty key array.** `let keyMap = constraintMap[0]; if (!keyMap)
  //   continue;` — the group is read, the timeline is skipped, and nothing is
  //   said. `"ik": { "leg-ik": [] }` is a timeline that does not exist, written
  //   by a generator that thought it wrote one.
  //
  // Reporting both from here also means a candidate with a misspelled constraint
  // gets told which constraints it does have, rather than being handed the
  // loader's own sentence.
  check('A34_CONSTRAINT_TIMELINE_TARGETS', () => {
    if (!raw) return skip('A34_CONSTRAINT_TIMELINE_TARGETS', 'the skeleton JSON did not parse (A00 owns that failure)');
    if (!isObj(raw.animations)) return skip('A34_CONSTRAINT_TIMELINE_TARGETS', 'the skeleton declares no animations');
    const typeOf = new Map<string, string>();
    for (const entry of Array.isArray(raw.constraints) ? (raw.constraints as unknown[]) : []) {
      if (isObj(entry) && typeof entry.name === 'string') typeOf.set(entry.name, String(entry.type));
    }
    let sawATimeline = false;
    for (const [animName, anim] of Object.entries(raw.animations as Json)) {
      if (!isObj(anim)) continue;
      for (const group of ['ik', 'transform'] as const) {
        if (!isObj(anim[group])) continue;
        for (const [name, keys] of Object.entries(anim[group] as Json)) {
          sawATimeline = true;
          const at = `animation "${animName}" ${group} timeline "${name}"`;
          const declared = typeOf.get(name);
          if (declared === undefined) {
            const known = [...typeOf.entries()].filter(([, t]) => t === group).map(([n]) => n);
            fail(
              'A34_CONSTRAINT_TIMELINE_TARGETS',
              `${at}: the skeleton's constraints array has no "${name}"` +
                (known.length ? ` (${group} constraints: ${known.join(', ')})` : `, and no ${group} constraint at all`),
            );
            continue;
          }
          if (declared !== group) {
            fail(
              'A34_CONSTRAINT_TIMELINE_TARGETS',
              `${at}: "${name}" is declared as a "${declared}" constraint, so the ${group} lookup misses it and the loader throws`,
            );
            continue;
          }
          if (!Array.isArray(keys) || keys.length === 0) {
            fail(
              'A34_CONSTRAINT_TIMELINE_TARGETS',
              `${at}: the key array is ${Array.isArray(keys) ? 'empty' : JSON.stringify(keys)}; the parser reads ` +
                'key 0, finds nothing and skips the whole timeline without a word',
            );
          }
        }
      }
    }
    if (!sawATimeline) {
      return skip('A34_CONSTRAINT_TIMELINE_TARGETS', 'no animation carries an ik or transform constraint timeline');
    }
  });

  // --- A35: a deform key's run lands inside the attachment it edits ---------
  //
  // 🚨 The nastiest silent failure in the animation half of this format. A deform
  // key is a sparse edit of a vertex array whose length comes from the attachment,
  // and the parser applies it with
  //
  //   Utils.arrayCopy(verticesValue, 0, deform, start, verticesValue.length)
  //
  // into a `Float32Array`. Writing past the end of a typed array in JavaScript is
  // a **no-op** — no throw, no warning, no NaN — so a run one pair too long, or a
  // run aimed at an attachment with fewer vertices than the author thought, loses
  // its tail and deforms the rest correctly. The result looks nearly right, which
  // is worse than looking wrong.
  //
  // Two more shapes, both of them equally quiet:
  //
  //   * an **odd `offset`** puts every x of the run on a y and every y on the
  //     next x — the array is pairs, and nothing in the format says so;
  //   * a **non-finite value** in `vertices` reaches `computeWorldVertices` and
  //     turns the vertex into NaN, which A10 would only catch if the deformed
  //     slot's BONE went non-finite, and it does not.
  //
  // The length depends on the encoding and the two are the same split
  // `readVertices` makes: unweighted is one pair per vertex, weighted is one pair
  // per bone influence (`vertices.length / 3 * 2`). Deriving it here rather than
  // assuming either is the whole point — assuming would produce a confident,
  // wrong bound on half the meshes in the world.
  check('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', () => {
    if (!raw) return skip('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', 'the skeleton JSON did not parse (A00 owns that failure)');
    if (!isObj(raw.animations)) return skip('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', 'the skeleton declares no animations');
    /** skin name -> slot -> attachment, straight off the raw JSON. */
    const skins = new Map<string, Json>();
    for (const skin of Array.isArray(raw.skins) ? (raw.skins as unknown[]) : []) {
      if (isObj(skin) && typeof skin.name === 'string' && isObj(skin.attachments)) {
        skins.set(skin.name, skin.attachments as Json);
      }
    }
    let sawATimeline = false;
    let measured = 0;
    for (const [animName, anim] of Object.entries(raw.animations as Json)) {
      if (!isObj(anim) || !isObj(anim.attachments)) continue;
      for (const [skinName, slotMap] of Object.entries(anim.attachments as Json)) {
        if (!isObj(slotMap)) continue;
        for (const [slotName, attMap] of Object.entries(slotMap)) {
          if (!isObj(attMap)) continue;
          for (const [attName, timelines] of Object.entries(attMap)) {
            if (!isObj(timelines) || !Array.isArray(timelines.deform)) continue;
            sawATimeline = true;
            const at = `animation "${animName}" deform ${skinName}/${slotName}/${attName}`;
            const attachment = isObj(skins.get(skinName)?.[slotName])
              ? ((skins.get(skinName)![slotName] as Json)[attName] as unknown)
              : undefined;
            if (!isObj(attachment)) {
              fail(
                'A35_DEFORM_KEYS_FIT_THE_ATTACHMENT',
                `${at}: skin "${skinName}" has no attachment "${attName}" on slot "${slotName}"; the parser throws ` +
                  '`Timeline attachment not found`',
              );
              continue;
            }
            const length = deformArrayLength(attachment);
            if (length === null) {
              // A linked mesh takes its geometry from another attachment, so the
              // raw file cannot state this one's length. Saying nothing beats
              // inventing a bound: an assertion with a default is how "nothing to
              // measure" becomes a measurement of the wrong thing.
              continue;
            }
            measured++;
            const keys = timelines.deform as unknown[];
            if (keys.length === 0) {
              fail('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', `${at}: the key array is empty; the parser skips the timeline in silence`);
              continue;
            }
            keys.forEach((key, k) => {
              if (!isObj(key)) {
                fail('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', `${at} key ${k}: not an object`);
                return;
              }
              const vertices = key.vertices;
              if (vertices === undefined || vertices === null) return; // "back to setup" — nothing to fit
              if (!Array.isArray(vertices)) {
                fail('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', `${at} key ${k}: vertices is ${JSON.stringify(vertices)}, not an array`);
                return;
              }
              const offset = key.offset === undefined ? 0 : key.offset;
              if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
                fail('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', `${at} key ${k}: offset is ${JSON.stringify(key.offset)}`);
                return;
              }
              if (offset % 2 !== 0) {
                fail(
                  'A35_DEFORM_KEYS_FIT_THE_ATTACHMENT',
                  `${at} key ${k}: offset ${offset} is odd, so the run's x values land on y slots and back again`,
                );
              }
              if (vertices.length % 2 !== 0) {
                fail(
                  'A35_DEFORM_KEYS_FIT_THE_ATTACHMENT',
                  `${at} key ${k}: the run holds ${vertices.length} numbers and the deform array is x, y pairs`,
                );
              }
              if (offset + vertices.length > length) {
                fail(
                  'A35_DEFORM_KEYS_FIT_THE_ATTACHMENT',
                  `${at} key ${k}: the run covers ${offset}..${offset + vertices.length} of a ${length}-long deform ` +
                    'array; everything past the end is copied into a Float32Array and dropped without a word',
                );
              }
              for (const n of vertices as unknown[]) {
                if (typeof n !== 'number' || !Number.isFinite(n)) {
                  fail('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', `${at} key ${k}: the run holds a non-finite value ${JSON.stringify(n)}`);
                  break;
                }
              }
            });
          }
        }
      }
    }
    if (!sawATimeline) return skip('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', 'no animation carries a deform timeline');
    if (measured === 0) {
      return skip(
        'A35_DEFORM_KEYS_FIT_THE_ATTACHMENT',
        'every deform timeline here keys an attachment whose vertex count the raw file does not state (a linked mesh)',
      );
    }
  });

  // --- A: the round trip ----------------------------------------------------
  // The two loaded objects come back OUT of the assertion rather than being
  // assigned into it. Everything below reads them, and a `let` written inside a
  // callback is a value the type checker cannot see being set: it narrows to
  // `null` at the first guard and to `never` inside it, so `atlas.pages` stops
  // type-checking while working perfectly at runtime.
  const roundTrip = check('A00_ROUNDTRIP_PARSE', () => {
    if (drawOrderIsUnparseable !== null) {
      throw new Error(`not attempted — the loader would not return: ${drawOrderIsUnparseable}`);
    }
    const parsedAtlas = new TextureAtlas(input.atlasText);
    const json = new SkeletonJson(new AtlasAttachmentLoader(parsedAtlas));
    return { atlas: parsedAtlas, data: json.readSkeletonData(JSON.parse(input.skeletonText)) };
  });
  const atlas: TextureAtlas | null = roundTrip?.atlas ?? null;
  const skeletonData: ReturnType<SkeletonJson['readSkeletonData']> | null = roundTrip?.data ?? null;

  if (atlas) {
    stats.pages = atlas.pages.length;
    stats.regions = atlas.regions.length;
  }
  if (skeletonData) {
    stats.bones = skeletonData.bones.length;
    stats.slots = skeletonData.slots.length;
    stats.animations = skeletonData.animations.length;
    stats.version = skeletonData.version ?? '(none)';
  }

  // --- A16: version label ---------------------------------------------------
  //
  // The label must be on the 4.3 line, and the line includes its pre-releases:
  // every one of the nine official example exports declares "4.3.75-beta", which
  // the original `/^4\.3(\.\d+)?$/` rejected. That made the first file of the
  // benchmark ladder fail on a cosmetic string. What the assertion is actually
  // for is the MAJOR.MINOR pair — a 4.2 or 5.x label is portable-fragile because
  // some runtimes refuse a version mismatch outright (spine-runtimes CHANGELOG
  // line 1678), while spine-ts stores the string and never compares it. So the
  // patch component and any pre-release suffix after it are free, and 4.2/5.x
  // stay rejected.
  check('A16_SKELETON_VERSION_4_3', () => {
    const declared = isObj(raw?.skeleton) ? (raw.skeleton as Json).spine : undefined;
    if (typeof declared !== 'string' || !SPINE_4_3_VERSION.test(declared)) {
      fail(
        'A16_SKELETON_VERSION_4_3',
        `skeleton.spine is ${JSON.stringify(declared)}, expected 4.3, 4.3.<patch> or 4.3.<patch>-<suffix>`,
      );
    }
  });

  // --- A01: no legacy top-level constraint arrays ---------------------------
  // 4.3 folds every constraint into one `constraints` array with a `type`.
  // A 4.1/4.2-shaped `physics` array loads clean and the constraint just
  // vanishes.
  check('A01_NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS', () => {
    for (const key of ['ik', 'transform', 'path', 'physics', 'slider']) {
      if (raw && key in raw) {
        fail(
          'A01_NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS',
          `top-level "${key}" array present; 4.3 wants it inside "constraints" with type:"${key}"`,
        );
      }
    }
  });

  // --- A02: no bone.transform key ------------------------------------------
  // 4.3 renamed it to `inherit`; the old key loads and silently falls back to
  // Normal inheritance (case 6b).
  check('A02_NO_BONE_TRANSFORM_KEY', () => {
    const bones = Array.isArray(raw?.bones) ? (raw.bones as unknown[]) : [];
    for (const bone of bones) {
      if (isObj(bone) && 'transform' in bone) {
        fail('A02_NO_BONE_TRANSFORM_KEY', `bone "${String(bone.name)}" uses 4.2's "transform"; 4.3 wants "inherit"`);
      }
    }
  });

  // --- A12: no dark / two-colour tint --------------------------------------
  // Parsed, then silently ignored by spine-html.
  check('A12_NO_DARK_COLOR', () => {
    const slots = Array.isArray(raw?.slots) ? (raw.slots as unknown[]) : [];
    for (const slot of slots) {
      if (isObj(slot) && 'dark' in slot) {
        fail('A12_NO_DARK_COLOR', `slot "${String(slot.name)}" declares a dark colour; the renderer ignores it`);
      }
    }
    walkTimelines(raw, (path, kind, name) => {
      if (kind === 'slot' && (name === 'rgba2' || name === 'rgb2')) {
        fail('A12_NO_DARK_COLOR', `${path}: two-colour timeline "${name}" is silently ignored by the renderer`);
      }
    });
  });

  // --- A05: curve arrays are 4 numbers per value channel --------------------
  check('A05_CURVE_ARRAY_LENGTH', () => {
    walkTimelines(raw, (path, kind, name, keys) => {
      const table = CHANNELS_BY_KIND[kind];
      if (!(name in table)) {
        fail('A05_CURVE_ARRAY_LENGTH', `${path}: unchecked ${kind} timeline "${name}" — extend the validator`);
        return;
      }
      const channels = table[name];
      for (const key of keys) {
        if (!isObj(key) || !('curve' in key)) continue;
        const curve = key.curve;
        if (channels === null) {
          fail('A05_CURVE_ARRAY_LENGTH', `${path}: timeline "${name}" cannot carry a curve`);
          continue;
        }
        if (curve === 'stepped') continue;
        if (!Array.isArray(curve)) {
          fail('A05_CURVE_ARRAY_LENGTH', `${path}: curve is ${JSON.stringify(curve)}, expected "stepped" or an array`);
          continue;
        }
        if (curve.length !== channels * 4) {
          fail(
            'A05_CURVE_ARRAY_LENGTH',
            `${path} (t=${String(key.time ?? 0)}): curve has ${curve.length} numbers, "${name}" needs ${channels} channels x 4 = ${channels * 4}`,
          );
        }
        for (const n of curve) {
          if (typeof n !== 'number' || !Number.isFinite(n)) {
            fail('A05_CURVE_ARRAY_LENGTH', `${path}: curve holds a non-finite value ${JSON.stringify(n)}`);
          }
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // Loaded-data assertions
  // -------------------------------------------------------------------------

  const regionAttachments: RegionAttachment[] = [];
  const meshAttachments: MeshAttachment[] = [];
  let clippingCount = 0;
  const meshSlots = new Set<number>();

  if (skeletonData) {
    const data = skeletonData as NonNullable<typeof skeletonData>;
    for (const skin of data.skins) {
      for (const entry of skin.getAttachments()) {
        const att = entry.attachment;
        if (att instanceof RegionAttachment) regionAttachments.push(att);
        else if (att instanceof MeshAttachment) {
          meshAttachments.push(att);
          meshSlots.add(entry.slotIndex);
        } else if (att instanceof ClippingAttachment) clippingCount++;
      }
    }
    stats.regionAttachments = regionAttachments.length;
    stats.meshAttachments = meshAttachments.length;

    // --- A03: every region has finite width/height (case 6c) ---------------
    check('A03_REGION_WIDTH_HEIGHT_FINITE', () => {
      for (const att of regionAttachments) {
        if (!Number.isFinite(att.width) || !Number.isFinite(att.height)) {
          fail('A03_REGION_WIDTH_HEIGHT_FINITE', `region "${att.name}" loaded w=${att.width} h=${att.height}`);
        }
        if (att.width <= 0 || att.height <= 0) {
          fail('A03_REGION_WIDTH_HEIGHT_FINITE', `region "${att.name}" has a non-positive size`);
        }
      }
    });

    // --- A04: mesh triangles + encoding coherence (case 6f) ----------------
    check('A04_MESH_TRIANGLES_AND_ENCODING', () => {
      for (const mesh of meshAttachments) {
        if (!mesh.triangles || mesh.triangles.length === 0) {
          fail('A04_MESH_TRIANGLES_AND_ENCODING', `mesh "${mesh.name}" has no triangles`);
          continue;
        }
        if (mesh.triangles.length % 3 !== 0) {
          fail('A04_MESH_TRIANGLES_AND_ENCODING', `mesh "${mesh.name}" triangle count is not a multiple of 3`);
        }
        const vertexCount = mesh.worldVerticesLength / 2;
        for (const idx of mesh.triangles) {
          if (idx < 0 || idx >= vertexCount) {
            fail('A04_MESH_TRIANGLES_AND_ENCODING', `mesh "${mesh.name}" index ${idx} is outside 0..${vertexCount - 1}`);
            break;
          }
        }
        // Weighted vs unweighted is decided by a length comparison alone — a
        // coincidental match reads weight data as coordinates.
        const weighted = !!mesh.bones;
        if (weighted && mesh.vertices.length % 3 !== 0) {
          fail('A04_MESH_TRIANGLES_AND_ENCODING', `mesh "${mesh.name}" weighted vertex run is not a multiple of 3`);
        }
        if (!weighted && mesh.vertices.length !== mesh.worldVerticesLength) {
          fail('A04_MESH_TRIANGLES_AND_ENCODING', `mesh "${mesh.name}" unweighted vertices disagree with uvs`);
        }
      }
    });

    // --- A33: bounding boxes and clipping polygons hold a real polygon -------
    //
    // These two types are the same shape — a polygon and nothing else — and they
    // fail the same three ways, all three silent:
    //
    //   1. **A missing or wrong `vertexCount`.** The parser reads
    //      `map.vertexCount << 1` and hands it to `readVertices` as the length to
    //      expect (`:552`, `:632`). `undefined << 1` is 0, so an omission makes
    //      the coordinate array read as a WEIGHTED run: it decodes numbers as
    //      bone counts and weights, and the attachment ends up with no vertices
    //      at all. Nothing throws, and neither type draws a pixel, so nothing
    //      downstream notices either.
    //   2. **A weighted run that does not decode to that many vertices.** Same
    //      trap as a mesh's (A04), minus the uvs that would have caught it.
    //   3. **A clipping `end` naming a slot that is not there.**
    //      `skeletonData.findSlot` returns null on a miss and `:626-627` assigns
    //      the null, so the clip does not end where it was told to — it runs to
    //      the bottom of the draw order and takes every slot below it with it.
    //      Checked on the raw JSON, because a null `endSlot` and an `end` that
    //      was never written are the same loaded object.
    check('A33_VERTEX_ATTACHMENT_GEOMETRY', () => {
      const polygons: Array<{ what: string; att: BoundingBoxAttachment | ClippingAttachment }> = [];
      for (const skin of data.skins) {
        for (const entry of skin.getAttachments()) {
          const att = entry.attachment;
          if (att instanceof BoundingBoxAttachment) polygons.push({ what: `bounding box "${att.name}"`, att });
          else if (att instanceof ClippingAttachment) polygons.push({ what: `clipping attachment "${att.name}"`, att });
        }
      }
      const slotNames = new Set(data.slots.map((s) => s.name));
      let endsChecked = 0;
      if (raw && Array.isArray(raw.skins)) {
        for (const skin of raw.skins as unknown[]) {
          if (!isObj(skin) || !isObj(skin.attachments)) continue;
          for (const [slotName, perSlot] of Object.entries(skin.attachments as Json)) {
            if (!isObj(perSlot)) continue;
            for (const [placeholder, att] of Object.entries(perSlot)) {
              if (!isObj(att) || att.type !== 'clipping' || att.end === undefined) continue;
              endsChecked++;
              if (typeof att.end !== 'string' || !slotNames.has(att.end)) {
                fail(
                  'A33_VERTEX_ATTACHMENT_GEOMETRY',
                  `clipping attachment "${placeholder}" on slot "${slotName}" ends at ${JSON.stringify(att.end)}, ` +
                    'which is not a slot of this skeleton — the clip would run to the bottom of the draw order',
                );
              }
            }
          }
        }
      }
      if (polygons.length === 0 && endsChecked === 0) {
        return skip('A33_VERTEX_ATTACHMENT_GEOMETRY', 'the skeleton carries no bounding box and no clipping attachment');
      }
      for (const { what, att } of polygons) {
        const length = att.worldVerticesLength;
        if (!Number.isInteger(length) || length < 6 || length % 2 !== 0) {
          fail(
            'A33_VERTEX_ATTACHMENT_GEOMETRY',
            `${what} loaded worldVerticesLength ${length}; a polygon is an even count of at least 6 (3 vertices). ` +
              'A missing "vertexCount" reads as 0 and takes the polygon with it',
          );
          continue;
        }
        const vertexCount = length / 2;
        if (!att.bones) {
          if (att.vertices.length !== length) {
            fail(
              'A33_VERTEX_ATTACHMENT_GEOMETRY',
              `${what} declares ${vertexCount} vertices but holds ${att.vertices.length} unweighted numbers ` +
                `(expected ${length}); the parser reads that mismatch as a weighted run`,
            );
          }
          continue;
        }
        // Weighted: `bones` is boneCount, (index × boneCount), repeated, and
        // `vertices` holds x, y, weight per binding.
        let decoded = 0;
        let bindings = 0;
        let ok = true;
        for (let i = 0; i < att.bones.length; decoded++) {
          const count = att.bones[i++];
          if (!Number.isInteger(count) || count < 1 || i + count > att.bones.length) {
            fail('A33_VERTEX_ATTACHMENT_GEOMETRY', `${what} vertex ${decoded} claims ${count} bone(s); the run is malformed`);
            ok = false;
            break;
          }
          for (let k = 0; k < count; k++, i++) {
            const index = att.bones[i];
            if (index < 0 || index >= data.bones.length) {
              fail('A33_VERTEX_ATTACHMENT_GEOMETRY', `${what} vertex ${decoded} references bone index ${index}`);
              ok = false;
            }
          }
          bindings += count;
        }
        if (!ok) continue;
        if (decoded !== vertexCount) {
          fail(
            'A33_VERTEX_ATTACHMENT_GEOMETRY',
            `${what} declares ${vertexCount} vertices and its weighted run decodes to ${decoded}`,
          );
        }
        if (att.vertices.length !== bindings * 3) {
          fail(
            'A33_VERTEX_ATTACHMENT_GEOMETRY',
            `${what} has ${bindings} binding(s) and ${att.vertices.length} weight numbers (expected ${bindings * 3})`,
          );
        }
      }
    });

    // --- A11 / A13 / A14: renderer + canvas budgets ----
    check('A11_NO_CLIPPING_ATTACHMENTS', () => {
      if (clippingCount > 0) {
        fail('A11_NO_CLIPPING_ATTACHMENTS', `${clippingCount} clipping attachment(s); the renderer skips them silently`);
      }
    });
    // 📐 The two numbers come from the rig spec's `invariants`, never from here.
    // A mesh budget is one consumer's frame time written down — the editor's own
    // example projects ship meshes many times denser and they are valid — so a
    // constant in the validator would fail correct foreign data in the name of
    // somebody else's canvas. A rig that declares no budget has nothing to be
    // measured against, and the assertion says so instead of inventing a wall.
    check('A13_MESH_BUDGET', () => {
      const slotBudget = input.rig?.meshSlotBudget ?? null;
      const triangleBudget = input.rig?.meshTriangleBudget ?? null;
      if (slotBudget === null && triangleBudget === null) {
        return skip(
          'A13_MESH_BUDGET',
          input.rig
            ? `the rig "${input.rig.archetype}" declares no \`invariants.meshSlots\` or \`invariants.meshTriangles\` budget`
            : 'no rig info (validating a bare directory), so no budget is declared',
        );
      }
      if (slotBudget !== null && meshSlots.size > slotBudget) {
        fail('A13_MESH_BUDGET', `${meshSlots.size} mesh slots, the rig budgets ${slotBudget}`);
      }
      if (triangleBudget === null) return;
      for (const mesh of meshAttachments) {
        const tris = (mesh.triangles?.length ?? 0) / 3;
        if (tris > triangleBudget) {
          fail('A13_MESH_BUDGET', `mesh "${mesh.name}" has ${tris} triangles, the rig budgets ${triangleBudget}`);
        }
      }
    });
    check('A14_NO_FULL_FRAME_MESH', () => {
      const stageW = data.width || 0;
      const stageH = data.height || 0;
      for (const mesh of meshAttachments) {
        if (stageW && stageH && mesh.width >= stageW && mesh.height >= stageH) {
          fail('A14_NO_FULL_FRAME_MESH', `mesh "${mesh.name}" spans the whole ${stageW}x${stageH} stage`);
        }
      }
    });

    // --- A15: idle must not key a mesh-driving bone (dirty-skip lever) -----
    check('A15_IDLE_NO_MESH_BONE_KEYS', () => {
      const meshBoneNames = new Set<string>();
      for (const slotIndex of meshSlots) meshBoneNames.add(data.slots[slotIndex].boneData.name);
      // The slot's own bone is not the whole story once weights exist: a ring
      // mesh is driven by its CONTROL bone, which is a different bone entirely.
      // Checking only the slot bone would let `idle` key the one bone that
      // actually dirties the canvas every frame.
      for (const mesh of meshAttachments) {
        if (!mesh.bones) continue;
        for (let i = 0; i < mesh.bones.length; ) {
          const boneCount = mesh.bones[i++];
          for (let n = 0; n < boneCount; n++, i++) {
            const bone = data.bones[mesh.bones[i]];
            if (bone) meshBoneNames.add(bone.name);
          }
        }
      }
      const idle = isObj(raw?.animations) ? (raw.animations as Json).idle : undefined;
      if (!isObj(idle) || !isObj(idle.bones)) return;
      for (const boneName of Object.keys(idle.bones as Json)) {
        if (meshBoneNames.has(boneName)) {
          fail('A15_IDLE_NO_MESH_BONE_KEYS', `idle keys bone "${boneName}", which drives a mesh — meshes never idle-skip`);
        }
      }
    });

    // --- A20/A21/A22: the mesh checks the parser will never make ------------
    //
    // A mesh is the one attachment type where every mistake is silent. Bad
    // weights do not throw, they skew; a uv outside the region samples the
    // wrong pixels; and an unpinned rim moves the seam, which is the single
    // thing the whole generated-parts approach depends on not happening.
    const meshWeights = meshWeightsOf;

    /** The slot a skin attachment belongs to; several assertions need it. */
    const slotOfAttachment = (target: MeshAttachment): string | null => {
      for (const skin of data.skins) {
        for (const entry of skin.getAttachments()) {
          if (entry.attachment === target) return data.slots[entry.slotIndex].name;
        }
      }
      return null;
    };
    /**
     * What built this mesh. ring unless the rig says otherwise; absent rig info
     * reads as ring (legacy).
     *
     * 🚨 `authored` is not a third topology, it is the ABSENCE of one rigc may
     * assume. Geometry that came in through the rig spec was drawn by somebody
     * with an editor, and its rim, its row pairing and its entry edge are
     * whatever that person made them. The `||` fallback below used to hand such
     * a mesh the string `ring`, and A21 then checked ring topology on a shape
     * that was never a ring — 40 failures on correct data (issue #44).
     */
    const kindOf = (target: MeshAttachment): 'ring' | 'ribbon' | 'authored' => {
      const slot = slotOfAttachment(target);
      return (slot && input.rig?.meshKinds[slot]) || 'ring';
    };
    /** Meshes rigc did not build, by name — the reason string several skips need. */
    const authoredMeshNames = (list: MeshAttachment[]): string[] =>
      list.filter((m) => kindOf(m) === 'authored').map((m) => `"${m.name}"`);

    check('A20_MESH_WEIGHTS_COHERENT', () => {
      for (const mesh of meshAttachments) {
        // 🚨 Authored geometry is not rigc's to have opinions about. The two
        // policy branches in this assertion are both statements about what a
        // rigc GENERATOR is supposed to produce — "a mesh here is weighted",
        // "a generated mesh binds only bones that move it" — and neither is a
        // fact about Spine or about somebody else's mesh. Applying them to
        // authored geometry failed correct data (issue #44). The coherence
        // rules below the branch are unconditional and still apply.
        const generated = kindOf(mesh) !== 'authored';
        if (!mesh.bones) {
          // 📐 PROFILE. An unweighted mesh is perfectly valid Spine — spineboy
          // ships two — and the runtime poses it from the slot bone. What is
          // NOT valid, in any profile, is a weighted mesh whose weights do not
          // cohere, which is everything below this branch. So the requirement
          // that a mesh be weighted at all is the policy half, and it is the
          // only half gated here.
          if (policy && generated) {
            fail('A20_MESH_WEIGHTS_COHERENT', `mesh "${mesh.name}" is unweighted; the ring tier drives meshes by bones`);
          }
          continue;
        }
        const perVertex = meshWeights(mesh);
        const expected = mesh.worldVerticesLength / 2;
        if (perVertex.length !== expected) {
          fail(
            'A20_MESH_WEIGHTS_COHERENT',
            `mesh "${mesh.name}" has weights for ${perVertex.length} vertices but ${expected} uv pairs`,
          );
          continue;
        }
        perVertex.forEach((vertex, i) => {
          if (!vertex.length) fail('A20_MESH_WEIGHTS_COHERENT', `mesh "${mesh.name}" vertex ${i} has no bones`);
          let sum = 0;
          for (const { bone, weight } of vertex) {
            if (!Number.isFinite(weight) || weight < 0) {
              fail('A20_MESH_WEIGHTS_COHERENT', `mesh "${mesh.name}" vertex ${i} has weight ${weight}`);
            }
            // 📐 PROFILE. A weight of exactly 0 is legal, harmless Spine: the
            // runtime accumulates `(…) * weight` (Attachment.js:131), so the
            // binding contributes nothing. The Spine editor writes them — the
            // auto-weighted meshes in 6-arcs, 7-anticipation and 8-follow-through
            // carry dozens, and their vertex weights still sum to 1. Treating one
            // as corruption failed three rungs of the ladder on correct data.
            // In a rigc-GENERATED ring or ribbon it is still a defect: the
            // generator bound a bone that does nothing, which is a bug in the
            // generator and dead work in the runtime's inner loop. So it stays a
            // failure under spine-html and is not one under spine.
            else if (policy && generated && weight === 0) {
              fail(
                'A20_MESH_WEIGHTS_COHERENT',
                `mesh "${mesh.name}" vertex ${i} is bound to bone index ${bone} at weight 0; a generated mesh binds only bones that move it`,
              );
            }
            if (!(bone >= 0 && bone < data.bones.length)) {
              fail('A20_MESH_WEIGHTS_COHERENT', `mesh "${mesh.name}" vertex ${i} references bone index ${bone}`);
            }
            sum += weight;
          }
          if (Math.abs(sum - 1) > 1e-3) {
            fail('A20_MESH_WEIGHTS_COHERENT', `mesh "${mesh.name}" vertex ${i} weights sum to ${sum.toFixed(4)}`);
          }
        });
      }
    });

    check('A21_MESH_RIM_PINNED', () => {
      // Without the rig, ring and ribbon cannot be told apart — and the two kinds
      // pin OPPOSITE edges, so guessing one would either check the wrong edge or
      // check nothing while reporting a pass.
      if (!input.rig) {
        return skip('A21_MESH_RIM_PINNED', 'no rig info (validating a bare directory), so ring and ribbon cannot be told apart');
      }
      if (!meshAttachments.some((m) => m.bones)) {
        return skip('A21_MESH_RIM_PINNED', 'the skeleton has no weighted mesh attachment, so there is no rim to find unpinned');
      }
      // An authored mesh has no rim rigc drew and no entry row rigc placed, so
      // there is nothing here to measure against. Nothing to measure is a SKIP —
      // never a pass, and never a failure on somebody else's correct geometry.
      const measurable = meshAttachments.filter((m) => m.bones && kindOf(m) !== 'authored');
      if (measurable.length === 0) {
        const authored = authoredMeshNames(meshAttachments.filter((m) => m.bones));
        return skip(
          'A21_MESH_RIM_PINNED',
          `every weighted mesh here is authored geometry (${authored.join(', ')}), not a rigc ring or ribbon — ` +
            'rigc did not place its rim, so it has no rim of its own to find unpinned',
        );
      }
      for (const mesh of measurable) {
        if (!mesh.bones) continue;
        const perVertexAll = meshWeights(mesh);
        const slotBoneOf = (() => {
          for (const skin of data.skins) {
            for (const entry of skin.getAttachments()) {
              if (entry.attachment === mesh) return data.slots[entry.slotIndex].boneData;
            }
          }
          return null;
        })();
        // A ribbon's outer boundary is SUPPOSED to move — that is the whole point
        // of a strip that changes length. So the rule splits by mesh kind rather
        // than being relaxed: for a ribbon the invariant is that the ENTRY row
        // cannot move, because that row is where the strip joins the part it
        // comes out of. Both rules protect the same thing (the mesh's join to the
        // plate underneath); they just live at different edges of the mesh.
        if (kindOf(mesh) === 'ribbon') {
          const uvs = mesh.regionUVs ?? [];
          let entryRow = 0;
          for (let v = 0; v < perVertexAll.length; v++) {
            if (Math.abs(uvs[v * 2 + 1]) > 1e-6) continue; // not on the entry edge
            entryRow++;
            const vertex = perVertexAll[v];
            if (vertex.length !== 1 || Math.abs(vertex[0].weight - 1) > 1e-6) {
              fail(
                'A21_MESH_RIM_PINNED',
                `ribbon "${mesh.name}" entry vertex ${v} is not pinned (${vertex.map((w) => w.weight.toFixed(3)).join('+')})`,
              );
              continue;
            }
            if (slotBoneOf && data.bones[vertex[0].bone]?.name !== slotBoneOf.name) {
              fail(
                'A21_MESH_RIM_PINNED',
                `ribbon "${mesh.name}" entry vertex ${v} is pinned to "${data.bones[vertex[0].bone]?.name}", not the anchor bone "${slotBoneOf.name}"`,
              );
            }
          }
          if (entryRow < 2) {
            fail('A21_MESH_RIM_PINNED', `ribbon "${mesh.name}" has ${entryRow} vertices on its entry edge; a strip needs two`);
          }
          continue;
        }
        const hullVertices = mesh.hullLength / 2;
        if (!Number.isInteger(hullVertices) || hullVertices < 3) {
          fail('A21_MESH_RIM_PINNED', `mesh "${mesh.name}" declares hull ${mesh.hullLength / 2}; the rim must be a real ring`);
          continue;
        }
        const perVertex = meshWeights(mesh);
        if (hullVertices > perVertex.length) {
          fail('A21_MESH_RIM_PINNED', `mesh "${mesh.name}" hull is ${hullVertices} of ${perVertex.length} vertices`);
          continue;
        }
        // The rim is the alpha contour where generated pixels meet untouched
        // base. One bone at weight 1, and that bone must be the slot's own —
        // anything else and the seam can move.
        const slotBone = (() => {
          for (const skin of data.skins) {
            for (const entry of skin.getAttachments()) {
              if (entry.attachment === mesh) return data.slots[entry.slotIndex].boneData;
            }
          }
          return null;
        })();
        for (let i = 0; i < hullVertices; i++) {
          const vertex = perVertex[i];
          if (vertex.length !== 1 || Math.abs(vertex[0].weight - 1) > 1e-6) {
            fail(
              'A21_MESH_RIM_PINNED',
              `mesh "${mesh.name}" rim vertex ${i} is not pinned (${vertex.map((v) => v.weight.toFixed(3)).join('+')})`,
            );
            continue;
          }
          if (slotBone && data.bones[vertex[0].bone]?.name !== slotBone.name) {
            fail(
              'A21_MESH_RIM_PINNED',
              `mesh "${mesh.name}" rim vertex ${i} is pinned to "${data.bones[vertex[0].bone]?.name}", not the slot bone "${slotBone.name}"`,
            );
          }
        }
        // Independent of the ring ORDER: whatever sits on the region border is
        // the outline, and the outline moving means the part's own edge moving.
        // Without this, reordering the rings would move the pinned prefix off
        // the outline and A21 would still pass on the count alone.
        const uvs = mesh.regionUVs ?? [];
        for (let v = 0; v < perVertex.length; v++) {
          const u = uvs[v * 2];
          const t = uvs[v * 2 + 1];
          const onBorder = [u, t].some((c) => Math.abs(c) < 1e-6 || Math.abs(c - 1) < 1e-6);
          if (!onBorder) continue;
          const vertex = perVertex[v];
          if (vertex.length !== 1 || Math.abs(vertex[0].weight - 1) > 1e-6) {
            fail('A21_MESH_RIM_PINNED', `mesh "${mesh.name}" vertex ${v} is on the region border but not pinned`);
            break;
          }
        }
      }
    });

    check('A22_MESH_UVS_IN_UNIT_RANGE', () => {
      for (const mesh of meshAttachments) {
        // `regionUVs` is what the JSON authored; `uvs` is the page-space result
        // and stays EMPTY until a renderer calls computeUVs, so asserting on it
        // here would be asserting on the wrong array (measured: length 0 after
        // a clean load). With one part per page the two are equal anyway —
        // computeUVs reduces to `u + regionUV * width` with u=0, width=1
        // (MeshAttachment.js:173-174), which is the claim this assertion rests
        // on and this is where it is checked.
        const uvs = mesh.regionUVs;
        if (!uvs || uvs.length !== mesh.worldVerticesLength) {
          fail(
            'A22_MESH_UVS_IN_UNIT_RANGE',
            `mesh "${mesh.name}" has ${uvs?.length ?? 0} authored uv values for ${mesh.worldVerticesLength}`,
          );
          continue;
        }
        for (let i = 0; i < uvs.length; i++) {
          if (!Number.isFinite(uvs[i]) || uvs[i] < -1e-6 || uvs[i] > 1 + 1e-6) {
            fail('A22_MESH_UVS_IN_UNIT_RANGE', `mesh "${mesh.name}" uv[${i}] is ${uvs[i]}`);
            break;
          }
        }
      }
    });

    // --- A23: a physics constraint that does nothing, quietly ---------------
    //
    // Every failure mode here is silent. The five component fields default to
    // 0, so a constraint can drive nothing at all; `mix` 0 mutes it; `mass` 0
    // becomes an infinite massInverse; and `damping` >= 1 never settles, which
    // on a mesh-driving bone means the canvas re-rasterises forever.
    check('A23_PHYSICS_CONSTRAINT_EFFECTIVE', () => {
      const meshBoneNames = new Set<string>();
      for (const slotIndex of meshSlots) meshBoneNames.add(data.slots[slotIndex].boneData.name);
      for (const mesh of meshAttachments) {
        if (!mesh.bones) continue;
        for (let i = 0; i < mesh.bones.length; ) {
          const boneCount = mesh.bones[i++];
          for (let n = 0; n < boneCount; n++, i++) {
            const bone = data.bones[mesh.bones[i]];
            if (bone) meshBoneNames.add(bone.name);
          }
        }
      }
      for (const constraint of data.constraints) {
        if (!(constraint instanceof PhysicsConstraintData)) continue;
        const where = `physics "${constraint.name}"`;
        const components = (['x', 'y', 'rotate', 'scaleX', 'shearX'] as const).filter((k) => constraint[k] > 0);
        if (!components.length) {
          fail('A23_PHYSICS_CONSTRAINT_EFFECTIVE', `${where} drives no component; it parses and does nothing`);
        }
        const pose = constraint.setupPose;
        if (!(pose.mix > 0)) fail('A23_PHYSICS_CONSTRAINT_EFFECTIVE', `${where} has mix ${pose.mix}; it is muted`);
        if (!Number.isFinite(pose.massInverse) || pose.massInverse <= 0) {
          fail('A23_PHYSICS_CONSTRAINT_EFFECTIVE', `${where} has massInverse ${pose.massInverse} (mass must be > 0)`);
        }
        if (!(pose.strength > 0)) {
          fail('A23_PHYSICS_CONSTRAINT_EFFECTIVE', `${where} has strength ${pose.strength}; nothing pulls it back`);
        }
        if (!(pose.damping > 0 && pose.damping < 1)) {
          fail(
            'A23_PHYSICS_CONSTRAINT_EFFECTIVE',
            `${where} has damping ${pose.damping}; outside (0,1) it never settles` +
              (meshBoneNames.has(constraint.bone.name) ? ' — and this bone drives a mesh, so the canvas never rests' : ''),
          );
        }
        if (constraint.step <= 0 || !Number.isFinite(constraint.step)) {
          fail('A23_PHYSICS_CONSTRAINT_EFFECTIVE', `${where} has step ${constraint.step} (fps must be > 0)`);
        }
      }
      stats.physicsConstraints = data.constraints.filter((c) => c instanceof PhysicsConstraintData).length;
    });

    // --- A08: region names exact-match attachment names --------------------
    check('A08_REGION_NAMES_MATCH_ATTACHMENTS', () => {
      const regionNames = new Set(atlas!.regions.map((r) => r.name));
      for (const skin of data.skins) {
        for (const entry of skin.getAttachments()) {
          const att = entry.attachment;
          const lookup = att instanceof RegionAttachment || att instanceof MeshAttachment ? att.path || att.name : null;
          if (lookup === null) continue;
          if (lookup !== lookup.trim()) {
            fail('A08_REGION_NAMES_MATCH_ATTACHMENTS', `attachment path ${JSON.stringify(lookup)} has stray whitespace`);
          }
          if (!regionNames.has(lookup)) {
            fail('A08_REGION_NAMES_MATCH_ATTACHMENTS', `attachment "${entry.placeholder}" wants region "${lookup}", which the atlas does not have`);
          }
          // 📐 PROFILE. That the join RESOLVES is validity — an attachment
          // pointing at a region the atlas does not have is a hole in the rig
          // whoever loads it. That the two names are IDENTICAL is rigc's v0
          // policy: it holds because there is no packer, and a real packer
          // renames regions by design (spineboy's `path` differs from its
          // placeholder in 26 attachments).
          if (policy && entry.placeholder !== lookup) {
            fail('A08_REGION_NAMES_MATCH_ATTACHMENTS', `attachment "${entry.placeholder}" resolves to region "${lookup}"; v0 requires them identical`);
          }
        }
      }
      for (const region of atlas!.regions) {
        if (region.name !== region.name.trim()) {
          fail('A08_REGION_NAMES_MATCH_ATTACHMENTS', `atlas region ${JSON.stringify(region.name)} has stray whitespace`);
        }
      }
    });

    // --- A09: compiled duration == declared duration (rule 4) --------------
    check('A09_ANIMATION_DURATION_MATCHES_SPEC', () => {
      // Without the spec there is no declared duration to compare the compiled
      // one against, and returning here used to count as a PASS — a gate saying
      // it checked something it never looked at.
      if (!input.declaredDurations) {
        return skip('A09_ANIMATION_DURATION_MATCHES_SPEC', 'no motion spec supplied, so no declared duration to compare against');
      }
      // Same trap one level down. A **static rig** — a skeleton that exists to
      // be posed and carries no animation at all, which is what
      // `1-weight-and-mass`'s second export is — declares nothing and loads
      // nothing, so both loops below iterate zero times and the assertion
      // reported PASS. That is the vacuous green this report is built to refuse:
      // there is no duration here, and saying so is the honest answer.
      if (Object.keys(input.declaredDurations).length === 0 && data.animations.length === 0) {
        return skip(
          'A09_ANIMATION_DURATION_MATCHES_SPEC',
          'the motion spec declares no animations and the skeleton has none — a static rig has no duration to compare',
        );
      }
      for (const [name, declared] of Object.entries(input.declaredDurations)) {
        const anim = data.findAnimation(name);
        if (!anim) {
          fail('A09_ANIMATION_DURATION_MATCHES_SPEC', `spec declares animation "${name}" but the skeleton has none`);
          continue;
        }
        // Two arms, and the asymmetry is the point.
        //
        // UNDERSHOOT is R7's question — is the declared duration wrong? An
        // animation may hold its final pose, so a last key a little before the
        // end is ordinary and a frame of that is slack.
        //
        // OVERSHOOT is a different question with a different tolerance.
        // `anim.duration` IS the largest key time (`SkeletonJson.ts:1261` takes
        // the max over every timeline's own duration), so a loaded duration past
        // the declared one means a KEY is past it — and nothing that plays the
        // animation for the duration it declares will ever reach that key. Rung
        // 6 lost a one-frame attachment reveal to a key 3.4e-5 s past the end,
        // 1/500 of FRAME, which this comparison read as agreement (issue #54).
        // `compile.ts` refuses that per timeline now; this is the same rule held
        // against a skeleton the compiler never saw.
        const slack = KEY_TIME_EPSILON + float32Step(declared);
        const past = anim.duration - declared;
        if (past > slack) {
          const late = anim.timelines.filter((t) => t.getDuration() - declared > slack).length;
          fail(
            'A09_ANIMATION_DURATION_MATCHES_SPEC',
            `animation "${name}" has ${late} timeline(s) keyed past the declared duration ${declared}s — ` +
              `the last key is at ${anim.duration}s, ${past.toFixed(6)}s late, so nothing ever samples it`,
          );
        } else if (declared - anim.duration > FRAME) {
          fail(
            'A09_ANIMATION_DURATION_MATCHES_SPEC',
            `animation "${name}" loaded duration ${anim.duration}s, spec declares ${declared}s`,
          );
        }
      }
      for (const anim of data.animations) {
        if (!(anim.name in input.declaredDurations)) {
          fail('A09_ANIMATION_DURATION_MATCHES_SPEC', `skeleton has animation "${anim.name}" with no spec entry`);
        }
      }
    });

    // --- A10: step every animation and look for NaN ------------------------
    check('A10_NO_NAN_AFTER_STEPPING', () => {
      for (const anim of data.animations) {
        const skeleton = new Skeleton(data);
        const state = new AnimationState(new AnimationStateData(data));
        state.setAnimation(0, anim.name, true);
        skeleton.setupPose();
        skeleton.update(0);
        skeleton.updateWorldTransform(Physics.reset);
        const step = Math.max(anim.duration, 1) / STEP_FRAMES;
        for (let i = 0; i < STEP_FRAMES; i++) {
          state.update(step);
          state.apply(skeleton);
          skeleton.update(step);
          skeleton.updateWorldTransform(Physics.update);
          for (const bone of skeleton.bones) {
            const pose = bone.appliedPose;
            if (!Number.isFinite(pose.worldX) || !Number.isFinite(pose.worldY)) {
              fail('A10_NO_NAN_AFTER_STEPPING', `${anim.name}: bone "${bone.data.name}" world is (${pose.worldX}, ${pose.worldY})`);
              return;
            }
          }
          for (const slot of skeleton.slots) {
            const c = slot.appliedPose.color;
            if (![c.r, c.g, c.b, c.a].every(Number.isFinite)) {
              fail('A10_NO_NAN_AFTER_STEPPING', `${anim.name}: slot "${slot.data.name}" colour is non-finite`);
              return;
            }
          }
        }
      }
    });
  }

  // --- A06 / A17 / A19: the atlas against the PNGs on disk ------------------
  // Case 6h: a `size:` that disagrees with the file loads fine and collapses
  // every UV — rigid stays correct, meshes sample a corner scrap.
  check('A17_ATLAS_PAGE_FILES_EXIST', () => {
    if (!atlas) return;
    for (const page of atlas.pages) {
      const abs = resolve(input.atlasDir, page.name);
      if (!existsSync(abs)) fail('A17_ATLAS_PAGE_FILES_EXIST', `page "${page.name}" is not on disk at ${abs}`);
    }
  });
  check('A06_ATLAS_PAGE_SIZE_MATCHES_PNG', () => {
    if (!atlas) return;
    for (const page of atlas.pages) {
      const abs = resolve(input.atlasDir, page.name);
      if (!existsSync(abs)) continue; // A17 owns this
      const info = readPngInfo(abs);
      if (page.width !== info.width || page.height !== info.height) {
        fail(
          'A06_ATLAS_PAGE_SIZE_MATCHES_PNG',
          `page "${page.name}" declares ${page.width}x${page.height} but the PNG is ${info.width}x${info.height}`,
        );
      }
      // 📐 PROFILE, from here down. `pma: false`, one region per page and no
      // rotation are rigc's atlas CONVENTION, not the atlas format's rules — a
      // packed page with `rotate: 90` is what the Spine packer produces and
      // every official example ships one. The convention is what makes the
      // attachment -> region -> file chain checkable exactly (A27), so it stays
      // on for spine-html; under `spine` an atlas is judged only on whether its
      // declared size matches the file it names.
      if (policy && page.pma) {
        fail('A06_ATLAS_PAGE_SIZE_MATCHES_PNG', `page "${page.name}" claims premultiplied alpha; parts are straight alpha`);
      }
    }
    if (!policy) return;
    for (const region of atlas.regions) {
      if (region.u !== 0 || region.v !== 0 || region.u2 !== 1 || region.v2 !== 1) {
        fail(
          'A06_ATLAS_PAGE_SIZE_MATCHES_PNG',
          `region "${region.name}" has UVs (${region.u},${region.v})-(${region.u2},${region.v2}); one part per page must cover the page exactly`,
        );
      }
      if (region.degrees !== 0) {
        fail('A06_ATLAS_PAGE_SIZE_MATCHES_PNG', `region "${region.name}" is rotated; there is no packer, so nothing can be`);
      }
    }
  });
  // An overlay part must be able to draw a transparent pixel or it cannot be an
  // overlay: it would paint a solid rectangle over the untouched base, and an
  // overlay formation's whole claim is that the still frame has no seam. The base
  // plate itself is the one page allowed to be opaque, and it identifies
  // itself structurally — it is the region that covers the whole stage.
  //
  // ⭐ Transparency is not the same thing as an alpha CHANNEL, and this assertion
  // used to conflate them (#215). Colour types 4 and 6 store alpha per pixel;
  // types 0, 2 and 3 store it in a `tRNS` chunk instead, and indexed+tRNS is the
  // ordinary output of ImageMagick, Photoshop's PNG-8 export, GIMP's indexed
  // mode, aseprite and pngquant. Judging on the colour type alone refused art
  // that was never broken — seven of one author's nine hand-drawn parts, on their
  // first build — and told them, untruthfully, that the file held no transparency
  // at all. That audit is also why the CLI's default is now `spine`, which does
  // not run this rule at all (#221): a stranger reaches this refusal only by
  // asking for `spine-html`. It still has to be both TRUE and actionable when it
  // fires, and it now has to name the profile it belongs to as well as the one
  // that does not ask — the reader opted in, and the message is where they find
  // out what they opted into.
  check('A19_OVERLAY_PNGS_HAVE_ALPHA', () => {
    if (!atlas) return;
    const stageW = skeletonData?.width ?? 0;
    const stageH = skeletonData?.height ?? 0;
    const basePages = new Set<string>();
    for (const att of regionAttachments) {
      if (stageW && stageH && att.width >= stageW && att.height >= stageH) {
        const region = atlas.findRegion(att.path || att.name);
        if (region) basePages.add(region.page.name);
      }
    }
    // The escape hatch is only worth naming when it is reachable: with no stage
    // size to measure against, `basePages` is empty and no image can qualify, so
    // pointing at it would send the reader after a door that is not there.
    const exemption =
      stageW && stageH
        ? `Only the one image big enough to cover the whole stage (${stageW}x${stageH}) may be opaque.`
        : 'The one image that covers the whole stage may be opaque, but this skeleton declares no stage size, so ' +
          'nothing here qualifies.';
    for (const page of atlas.pages) {
      const abs = resolve(input.atlasDir, page.name);
      if (!existsSync(abs)) continue;
      const info = readPngInfo(abs);
      if (info.hasTransparency) continue;
      if (basePages.has(page.name)) continue; // full-stage base plate: opaque is correct
      fail(
        'A19_OVERLAY_PNGS_HAVE_ALPHA',
        `part image "${page.name}" cannot be transparent anywhere: it is colour type ${info.colourType} ` +
          `(${colourTypeName(info.colourType)}) with no tRNS chunk, so it would paint a solid rectangle over ` +
          'whatever is drawn behind it. Re-export it with transparency — as RGBA, or as an indexed or greyscale ' +
          `PNG that keeps its tRNS chunk. ${exemption} This is renderer policy, and it belongs to --profile ` +
          'spine-html: the default --profile spine does not run this check.',
      );
    }
  });

  // -------------------------------------------------------------------------
  // Archetype assertions — the invariants the RIG declares about itself.
  //
  // These need `input.rig`, because skeleton JSON does not record which bone
  // carries the axis, which parentage is forbidden, what the canonical draw
  // order is, or which mesh is a ribbon. Every one of them reads the rig spec's
  // `invariants` block ([`src/rig.ts`](rig.ts)) and every one of them SKIPs when
  // the field it needs is absent — a rig that declares nothing is not thereby
  // certified, it is unmeasured, and the two must never print the same.
  // -------------------------------------------------------------------------
  stats.rig = input.rig ? input.rig.archetype : 'absent';
  stats.profile = profile;

  // --- A24: motion under the axis bone stays in AXIS space -----------------
  //
  // ⭐ The keystone of an articulated cut, and it exists because of a real bug:
  // a generator wrote its travel as screen-space x/y pairs (`x: 30, y: 8` ->
  // `x: -45, y: -12`), so every key had to be re-recorded for a cut framed at a
  // different camera angle — and sibling variants of ONE cut can differ by tens
  // of degrees. Put the direction in the axis bone's setup rotation instead and
  // the keys become translateX along it, reusable across every variant. A
  // screen-space y component on any bone in that subtree therefore means
  // somebody has put the direction back into the keys.
  //
  // The axis bone itself must carry no keys at all: `invariants.axisBone` names
  // a per-cut SETUP value, and animating it swings the whole formation.
  check('A24_AXIS_SPACE_STROKE', () => {
    const rig = input.rig;
    if (!rig) return skip('A24_AXIS_SPACE_STROKE', 'no rig info (validating a bare directory)');
    if (!rig.axisBone) {
      return skip(
        'A24_AXIS_SPACE_STROKE',
        `the rig "${rig.archetype}" declares no axis bone, so there is no axis space for a stroke to leave`,
      );
    }
    const subtree = new Set(rig.axisSubtree);
    const anims = isObj(raw?.animations) ? (raw.animations as Json) : {};
    for (const [animName, anim] of Object.entries(anims)) {
      if (!isObj(anim) || !isObj(anim.bones)) continue;
      for (const [boneName, timelines] of Object.entries(anim.bones as Json)) {
        if (boneName === rig.axisBone) {
          fail(
            'A24_AXIS_SPACE_STROKE',
            `"${animName}" keys the axis bone "${boneName}"; the axis angle is a per-cut SETUP value, not animation`,
          );
          continue;
        }
        if (!subtree.has(boneName) || !isObj(timelines)) continue;
        if ('translatey' in timelines) {
          fail(
            'A24_AXIS_SPACE_STROKE',
            `"${animName}" gives "${boneName}" a translatey timeline; a bone under "${rig.axisBone}" moves along the axis only`,
          );
        }
        const keys = (timelines as Json).translate;
        if (!Array.isArray(keys)) continue;
        for (const key of keys) {
          if (!isObj(key)) continue;
          const y = Number(key.y ?? 0);
          if (Number.isFinite(y) && Math.abs(y) > 1e-6) {
            fail(
              'A24_AXIS_SPACE_STROKE',
              `"${animName}" keys "${boneName}" translate y=${y} at t=${String(key.time ?? 0)}; the axis bone carries the direction, so keys are translateX only`,
            );
          }
        }
      }
    }
  });

  // --- A25: parentage that must never happen -------------------------------
  //
  // ⚠️ Some bones are detached ON PURPOSE. An emitter that releases something
  // into the world must not ride the part that released it, or what it emits
  // gets dragged along with every stroke instead of staying where it left and
  // taking gravity. The rig states each such pair in `invariants.detached`, with
  // the reason it is tempting, because the wrong parentage still loads and still
  // animates — it just lies. That is exactly the class of invariant that belongs
  // in a machine guard rather than in prose.
  check('A25_DETACHED_BONE_PARENTAGE', () => {
    const rig = input.rig;
    if (!rig) return skip('A25_DETACHED_BONE_PARENTAGE', 'no rig info (validating a bare directory)');
    if (!rig.detached.length) {
      return skip('A25_DETACHED_BONE_PARENTAGE', `the rig "${rig.archetype}" declares no forbidden parentage`);
    }
    const parentOf = new Map<string, string | null>();
    for (const bone of Array.isArray(raw?.bones) ? (raw.bones as unknown[]) : []) {
      if (isObj(bone) && typeof bone.name === 'string') {
        parentOf.set(bone.name, typeof bone.parent === 'string' ? bone.parent : null);
      }
    }
    for (const [child, forbidden] of rig.detached) {
      if (!parentOf.has(child)) {
        fail('A25_DETACHED_BONE_PARENTAGE', `the rig declares "${child}" detached from "${forbidden}" but has no such bone`);
        continue;
      }
      const seen = new Set<string>();
      for (let cursor = parentOf.get(child) ?? null; cursor; cursor = parentOf.get(cursor) ?? null) {
        if (seen.has(cursor)) break; // a cycle; the loader would have thrown first
        seen.add(cursor);
        if (cursor !== forbidden) continue;
        fail(
          'A25_DETACHED_BONE_PARENTAGE',
          `"${child}" is a descendant of "${forbidden}"; it must not be dragged by that bone's motion`,
        );
        break;
      }
    }
  });

  // --- A26: draw order matches the rig's slot table ------------------------
  //
  // The slots array IS the draw order (z-index = array index), so a formation
  // whose illusion depends on one part occluding another depends on one
  // adjacency in that array — and nothing in the file objects to the wrong
  // order. On a still frame it can even look plausible. The rig's own slot list
  // is the canonical table; a cut that fills only some of those slots emits a
  // SUBSEQUENCE of it, which is what this checks.
  check('A26_SLOT_DRAW_ORDER', () => {
    if (!input.rig) return skip('A26_SLOT_DRAW_ORDER', 'no rig info (validating a bare directory)');
    const order = input.rig.slotOrder;
    if (!order) {
      return skip(
        'A26_SLOT_DRAW_ORDER',
        `the rig "${input.rig.archetype}" declares no canonical slot order, so the emitted order has nothing to disagree with`,
      );
    }
    const names = (Array.isArray(raw?.slots) ? (raw.slots as unknown[]) : [])
      .filter(isObj)
      .map((s) => String(s.name));
    let at = 0;
    for (const name of names) {
      const found = order.indexOf(name, at);
      if (found < 0) {
        const known = order.indexOf(name);
        fail(
          'A26_SLOT_DRAW_ORDER',
          known < 0
            ? `slot "${name}" is not in the archetype's slot table`
            : `slot "${name}" is drawn out of order (table position ${known}, after a slot at ${at})`,
        );
        return;
      }
      at = found + 1;
    }
  });

  // --- A27: region name == the PNG's basename ------------------------------
  //
  // The join key is a chain of three names — attachment -> atlas region -> file —
  // and A08 only holds the first link. The second was held by convention alone:
  // an atlas could declare page `../plates/02_overlay.png` with a region
  // called anything at all, every attachment could agree with it, and the rig
  // would load with the wrong pixels under the right name. One part per page (A06
  // forces it) makes the check exact.
  check('A27_REGION_NAME_MATCHES_PAGE_FILENAME', () => {
    if (!atlas) return;
    const perPage = new Map<string, number>();
    for (const region of atlas.regions) perPage.set(region.page.name, (perPage.get(region.page.name) ?? 0) + 1);
    for (const region of atlas.regions) {
      // A real packer puts many regions on one page and the names stop matching
      // filenames by design. Then this check has nothing to say, so it says
      // nothing rather than something wrong.
      if ((perPage.get(region.page.name) ?? 0) !== 1) continue;
      const expected = basename(region.page.name).replace(/\.png$/i, '');
      if (region.name !== expected) {
        fail(
          'A27_REGION_NAME_MATCHES_PAGE_FILENAME',
          `region "${region.name}" is the only region on page "${region.page.name}", whose basename is "${expected}"`,
        );
      }
    }
  });

  // --- A28: a ribbon's rows share their weights ----------------------------
  //
  // This is what makes "length without width" a property of the file rather than
  // a hope. Both vertices of a row carry the same bones at the same weights, so
  // whatever the chain does to one it does to the other and their separation can
  // only rotate — the strip curves and stretches, and never gets fatter. Give one
  // side a different weight and the strip develops a taper that grows with its
  // travel, which is the sort of thing that reads as bad art rather than as a bug.
  check('A28_RIBBON_ROWS_SHARE_WEIGHTS', () => {
    if (!skeletonData) return skip('A28_RIBBON_ROWS_SHARE_WEIGHTS', 'the skeleton did not load (A00 owns that failure)');
    if (!input.rig) return skip('A28_RIBBON_ROWS_SHARE_WEIGHTS', 'no rig info (validating a bare directory), so no mesh is known to be a ribbon');
    const kinds = input.rig.meshKinds;
    if (!Object.values(kinds).includes('ribbon')) {
      // Say WHICH kind of "no ribbon" this is. "declares no ribbon" is true of a
      // cut with no mesh at all and of one whose meshes are authored geometry,
      // and only the second is a case where a reader should know that a mesh
      // went unmeasured on purpose.
      const authored = Object.entries(kinds)
        .filter(([, kind]) => kind === 'authored')
        .map(([slot]) => `"${slot}"`);
      return skip(
        'A28_RIBBON_ROWS_SHARE_WEIGHTS',
        authored.length
          ? `the rig "${input.rig.archetype}" declares no ribbon mesh on this cut — its mesh slot(s) ${authored.join(', ')} carry authored geometry, whose rows rigc did not pair`
          : `the rig "${input.rig.archetype}" declares no ribbon mesh on this cut`,
      );
    }
    const data = skeletonData as NonNullable<typeof skeletonData>;
    for (const skin of data.skins) {
      for (const entry of skin.getAttachments()) {
        const mesh = entry.attachment;
        if (!(mesh instanceof MeshAttachment) || !mesh.bones) continue;
        if (input.rig.meshKinds[data.slots[entry.slotIndex].name] !== 'ribbon') continue;
        const perVertex = meshWeightsOf(mesh);
        if (perVertex.length % 2 !== 0) {
          fail('A28_RIBBON_ROWS_SHARE_WEIGHTS', `ribbon "${mesh.name}" has ${perVertex.length} vertices; a strip has an even count`);
          continue;
        }
        // Perimeter order: left row i is index i, right row i is its mirror.
        const rows = perVertex.length / 2;
        for (let i = 0; i < rows; i++) {
          const left = perVertex[i];
          const right = perVertex[perVertex.length - 1 - i];
          const shape = (v: typeof left) => v.map((w) => `${w.bone}:${w.weight.toFixed(6)}`).join(',');
          if (shape(left) !== shape(right)) {
            fail(
              'A28_RIBBON_ROWS_SHARE_WEIGHTS',
              `ribbon "${mesh.name}" row ${i} has [${shape(left)}] on one side and [${shape(right)}] on the other; its width would change with the chain`,
            );
          }
        }
      }
    }
  });

  // --- A29: inward travel stops where the two masses meet ------------------
  //
  // 🎯 The rule: inward travel goes at most as far as the point where the moving
  // mass touches the part that occludes it. That distance is MEASURED off the two
  // plates (`tools/measure_contact_depth.ts`) and recorded in the manifest as
  // `stroke.contact_depth`, so the ceiling is a fact about the art rather than a
  // number somebody picked. Drive past it and the frame renders two bodies
  // interpenetrating — and NOTHING in skeleton JSON objects: the animation loads,
  // plays, and is simply wrong. Exactly the shape of silent wrongness this
  // validator exists for.
  //
  // Two things spend the same clearance and so are added together:
  //   * the travel itself, a translateX on a bone in the axis subtree (A24
  //     guarantees there is no hidden screen-space component to miss); and
  //   * the mass bone's own inward keys. `invariants.massBone` typically hangs
  //     outside the axis subtree, so its keys are screen-space by design — they
  //     get projected onto the axis rather than read as axis coordinates.
  //     Ignoring them would let a rig pass while a recoil key closed the last few
  //     pixels of the gap.
  check('A29_STROKE_WITHIN_CONTACT_DEPTH', () => {
    const rig = input.rig;
    if (!rig) return skip('A29_STROKE_WITHIN_CONTACT_DEPTH', 'no rig info (validating a bare directory)');
    if (!rig.contactDepth) {
      return skip(
        'A29_STROKE_WITHIN_CONTACT_DEPTH',
        'the manifest declares no `stroke.contact_depth`, so this cut has no measured contact ceiling to hold the stroke to',
      );
    }
    const deep = deepestInwardAdvance(raw, rig);
    stats.contactDepth = rig.contactDepth;
    stats.deepestAdvance = Math.round(deep.total * 1000) / 1000;
    if (deep.total > rig.contactDepth + 1e-6) {
      fail(
        'A29_STROKE_WITHIN_CONTACT_DEPTH',
        `${deep.describe()} but the masses meet at ${rig.contactDepth}px — the two plates would interpenetrate`,
      );
    }
  });

  // --- A30: inward travel stops where the drawn cover runs out -------------
  //
  // 🎯 The second ceiling, and it is NOT a restatement of A29. Contact asks when
  // two masses collide; containment asks when the moving part's leading contour
  // stops being covered by the occluder's opaque footprint. Past that point the
  // part is drawn in a place the art says is hidden — and like every failure in
  // this family it is completely silent: the animation loads, plays, and shows
  // one plate passing through another.
  //
  // A cut can have either ceiling without the other, which is why they are two
  // manifest fields and two assertions. Two plates cut from ONE piece of art are
  // adjacent at rest and never "meet", so that cut has no contact ceiling at all
  // and only a containment one.
  //
  // ⚠️ Second half, and it is what keeps the first half true: the ceiling is
  // measured on the UNDEFORMED contour, by translating the plate along the axis.
  // A scale key on any bone in the axis subtree changes the contour itself, so the
  // measured number stops describing the rig — quietly, because the file still
  // validates. Rather than assert a number that no longer means anything, refuse
  // the deformation. A cut that wants squash under a declared ceiling has to
  // re-measure containment for the scaled contour and say so.
  check('A30_STROKE_WITHIN_CAP_CONTAINMENT', () => {
    const rig = input.rig;
    if (!rig) return skip('A30_STROKE_WITHIN_CAP_CONTAINMENT', 'no rig info (validating a bare directory)');
    if (!rig.capContainmentCeiling) {
      return skip(
        'A30_STROKE_WITHIN_CAP_CONTAINMENT',
        'the manifest declares no `stroke.cap_containment_ceiling`, so this cut has no measured containment ceiling',
      );
    }
    const deep = deepestInwardAdvance(raw, rig);
    stats.capCeiling = rig.capContainmentCeiling;
    stats.deepestAdvance = Math.round(deep.total * 1000) / 1000;
    if (deep.total > rig.capContainmentCeiling + 1e-6) {
      fail(
        'A30_STROKE_WITHIN_CAP_CONTAINMENT',
        `${deep.describe()} but the leading contour leaves the occluder's opaque footprint at ` +
          `${rig.capContainmentCeiling}px — the part would be drawn where it should be covered`,
      );
    }
    const subtree = new Set(rig.axisSubtree);
    const anims = isObj(raw?.animations) ? (raw.animations as Json) : {};
    for (const [animName, anim] of Object.entries(anims)) {
      if (!isObj(anim) || !isObj(anim.bones)) continue;
      for (const [boneName, timelines] of Object.entries(anim.bones as Json)) {
        if (!subtree.has(boneName) || !isObj(timelines)) continue;
        for (const name of Object.keys(timelines)) {
          if (name !== 'scale' && name !== 'scalex' && name !== 'scaley') continue;
          fail(
            'A30_STROKE_WITHIN_CAP_CONTAINMENT',
            `"${animName}" gives "${boneName}" a ${name} timeline while a cap-containment ceiling is declared; ` +
              'the ceiling was measured on the undeformed contour, so a scaled plate is outside its evidence',
          );
        }
      }
    }
  });

  // --- A18: determinism ----------------------------------------------------
  check('A18_DETERMINISTIC_EMIT', () => {
    // Same vacuous-pass trap as A09: re-gating artifacts already on disk hands
    // this assertion no second compile, and there is nothing determinate about
    // a comparison that never ran.
    if (!input.reEmit) {
      return skip('A18_DETERMINISTIC_EMIT', 'no second compile to compare against (re-gating artifacts on disk)');
    }
    if (input.reEmit.skeletonText !== input.skeletonText) {
      fail('A18_DETERMINISTIC_EMIT', 'recompiling produced a different skeleton.json');
    }
    if (input.reEmit.atlasText !== input.atlasText) {
      fail('A18_DETERMINISTIC_EMIT', 'recompiling produced a different skeleton.atlas');
    }
  });

  return { failures, passed, skipped, profileSkipped, profile, stats };
}

/**
 * Deepest inward advance the animation data asks for, in axis pixels.
 *
 * Shared by A29 and A30 because they bound the SAME quantity against two
 * different measured facts. Two things spend the same clearance and so are added:
 *
 *   * the stroke — a translateX on a bone in the axis subtree. A24 guarantees
 *     there is no hidden screen-space component to miss.
 *   * the mass bone's own inward keys. It typically hangs outside the axis
 *     subtree, so its keys are screen-space by design and get PROJECTED onto the
 *     axis rather than read as axis coordinates. Ignoring them would let a rig
 *     pass while a recoil key closed the last few pixels.
 */
function deepestInwardAdvance(
  raw: Json | null,
  rig: NonNullable<ValidateInput['rig']>,
): { total: number; describe: () => string } {
  const anims = isObj(raw?.animations) ? (raw.animations as Json) : {};
  const subtree = new Set(rig.axisSubtree);
  let strokeMax = 0;
  let strokeWhere = '';
  let massMax = 0;
  let massWhere = '';
  for (const [animName, anim] of Object.entries(anims)) {
    if (!isObj(anim) || !isObj(anim.bones)) continue;
    for (const [boneName, timelines] of Object.entries(anim.bones as Json)) {
      if (!isObj(timelines)) continue;
      const keys = (timelines as Json).translate;
      if (!Array.isArray(keys)) continue;
      for (const key of keys) {
        if (!isObj(key)) continue;
        if (subtree.has(boneName)) {
          // +x is inward along the axis; a retracted key is negative and spends
          // no clearance, so only the inward extreme matters.
          const x = Number(key.x ?? 0);
          if (Number.isFinite(x) && x > strokeMax) {
            strokeMax = x;
            strokeWhere = `${animName}.${boneName} t=${String(key.time ?? 0)}`;
          }
        } else if (boneName === rig.massBone && rig.inwardUnit) {
          const inward = Number(key.x ?? 0) * rig.inwardUnit[0] + Number(key.y ?? 0) * rig.inwardUnit[1];
          if (Number.isFinite(inward) && inward > massMax) {
            massMax = inward;
            massWhere = `${animName}.${boneName} t=${String(key.time ?? 0)}`;
          }
        }
      }
    }
  }
  return {
    total: strokeMax + massMax,
    describe: () =>
      `deepest inward advance is ${(strokeMax + massMax).toFixed(3)}px (stroke ${strokeMax.toFixed(3)} at ${strokeWhere}` +
      `${massMax > 0 ? ` + mass ${massMax.toFixed(3)} at ${massWhere}` : ''})`,
  };
}

/**
 * Decode a weighted mesh's `vertices` run into per-vertex (boneIndex, weight).
 *
 * The encoding carries no marker at all — weighted versus unweighted is decided
 * by a length comparison — so every assertion that talks
 * about weights has to walk the run itself.
 */
function meshWeightsOf(mesh: MeshAttachment): Array<Array<{ bone: number; weight: number }>> {
  const out: Array<Array<{ bone: number; weight: number }>> = [];
  if (!mesh.bones) return out;
  let bi = 0;
  let vi = 0;
  while (bi < mesh.bones.length) {
    const boneCount = mesh.bones[bi++];
    const vertex: Array<{ bone: number; weight: number }> = [];
    for (let n = 0; n < boneCount; n++, bi++, vi += 3) {
      vertex.push({ bone: mesh.bones[bi], weight: mesh.vertices[vi + 2] });
    }
    out.push(vertex);
  }
  return out;
}

export function reportLines(report: ValidateReport): string[] {
  const lines: string[] = [];
  // The profile goes FIRST and names what it left out. A report that says
  // "green" without saying which rulebook produced it is the one thing this
  // switch could make worse than no switch: `--profile spine` green means
  // "valid Spine", never "passes the renderer policy".
  const renderer = report.profileSkipped.filter((p) => p.kind === 'renderer').length;
  const archetype = report.profileSkipped.filter((p) => p.kind === 'archetype').length;
  lines.push(
    report.profileSkipped.length === 0
      ? `  ..    profile ${report.profile} — every assertion applies`
      : `  ..    profile ${report.profile} — ${renderer} renderer-policy and ${archetype} archetype assertion(s) do not apply`,
  );
  for (const name of report.passed) lines.push(`  PASS  ${name}`);
  for (const s of report.skipped) lines.push(`  SKIP  ${s.assertion}: ${s.reason}`);
  for (const p of report.profileSkipped) lines.push(`  PROF  ${p.assertion}: ${p.kind} rule, not in profile "${report.profile}"`);
  for (const f of report.failures) lines.push(`  FAIL  ${f.assertion}: ${f.detail}`);
  return lines;
}

export function atlasDirOf(atlasPath: string): string {
  return dirname(resolve(atlasPath));
}
