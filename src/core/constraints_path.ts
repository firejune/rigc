/**
 * Construct 5 of the core, second cut (issue #938, step 2e-ii of issue #380):
 * the path constraint, at the setup pose and at a sample time, with its
 * timelines. `./constraints.ts` runs it in the update order the first cut
 * measured; this module reads its record, walks its curve and moves its
 * bones.
 *
 * Every rule below was measured by posing hand-written skeletons through
 * `tools/pose_oracle.ts dump` (spine-core 4.3.13, `--skin all`,
 * `--physics none`) and comparing the core's rows at tolerance 0, most with
 * amplifier bones ten thousand units out along each axis of a constrained
 * bone, so that 1e-10 in its matrix reads as a grid step. Nothing here was
 * written from the runtime's source. Where a rule is not the obvious
 * reading, the reading that missed is stated beside it with its count. The
 * populations it names: the **grid** — one bone on two and three curves,
 * open and closed, at constant speed and not, percent and fixed, 61
 * positions each (976 probes); the **population** — 2,000 random probes of
 * every mode, setting, mix and curve (the core suite's `CP03` draws 600
 * like them); the **stated population** — 1,000 probes off stated lengths
 * spelled with non-float32 decimals. The core suite's `CP` controls hold the
 * probes; `tools/core_gate.ts` holds the corpus.
 *
 * ## The curve
 *
 * The constraint walks what its slot shows (`shownAttachment` at the setup
 * pose; the slot's attachment and deform timelines are not admitted, and an
 * animation keying either on a walked path leaves the samples' bones out by
 * name). A slot showing no path makes the constraint do nothing. The path's
 * world points are `./vertices.ts`'s `worldVertices`: every vertex number
 * through `Math.fround`, an unweighted path through its slot bone, a weighted
 * one through its bound bones — the doubles missed 1,946 of the population's
 * 2,000. Its `lengths` are read as the doubles the text spells: through
 * `Math.fround` they missed 697 of the stated population's 1,000. The points
 * form the chain `src/compile.ts`'s `pathChain` states — an open path drops
 * its first and last point (the end knots' outer handles), a closed one is
 * turned by one and repeats its first knot and handle — knot, handle,
 * handle, knot, …
 *
 * ## The walk: where a length along the curve is
 *
 * Every bone is placed at a length along the path: the `position`, then
 * each space after it (below). **At constant speed** (the default) the
 * runtime measures the curve itself, every pose:
 *
 * 1. **A table of the curves' lengths**, each curve four forward-difference
 *    steps (`0.1875`, `0.09375`, `0.75` and `0.16666667`, the running total
 *    carried across curves) — `pathCurveLengths` in `src/compile.ts`, the
 *    same arithmetic. A ten-step table missed 460 of the grid's 976. The
 *    last entry is the path's length; `percent` multiplies the position by
 *    it. The stated `lengths` are not read: the stated total in their place
 *    missed 680 of 1,000.
 * 2. **The curve** holding the length is searched for in the table from the
 *    curve the previous space ended on, forward — on an open path it is not
 *    restarted, so a space that walks backwards across a curve (a negative
 *    spacing) stays on the later curve with a negative fraction; restarting
 *    from the first curve missed 36 of the population's 2,000. A closed
 *    path takes the length modulo its total (plus the total below 0) and
 *    searches from the first curve every time. The fraction of the curve is
 *    `(p − previous) / (entry − previous)`.
 * 3. **A table of ten segments** of that curve, ten forward-difference steps
 *    of 1/10 (`0.3`, `0.03`, `0.006`, `0.16666667`), built when the curve
 *    changes. The fraction times the ten-step total is searched for from the
 *    segment the previous space ended on while the curve is the same, and
 *    the curve's parameter is `(segment + fraction of the segment) / 10` —
 *    so the parameter is linear in length within a segment, not along the
 *    whole curve: the fraction of the curve used as the parameter missed 380
 *    of the grid, the parameter at the exact arc length (a 2,000-piece
 *    polyline) 380, and the point on the ten-segment polyline instead of the
 *    curve 392.
 * 4. **The point is the cubic at that parameter**, evaluated for any
 *    parameter: a negative one extrapolates the curve backwards. Only a
 *    parameter that is not a number (a curve of length 0) takes the curve's
 *    first knot and the direction of its first handle. Clamping every
 *    parameter below 0.00001 to the start missed 11 of the population.
 *
 * **Off constant speed** (`constantSpeed: false`) the stated `lengths` are
 * the table: its entry for the last curve is the total (`vertexCount / 3`
 * less 2 on an open path, less 1 on a closed one), the curve is found as in
 * 2, and the fraction of the curve IS the cubic's parameter — the stated
 * numbers decide where bones stand even where they disagree with the
 * geometry (issue #804): measured off the geometry instead, 711 of the
 * stated population's 1,000 missed.
 *
 * **Past the ends** of an open path a bone stands on the straight line
 * through the first knot and its handle (before the start) or through the
 * last handle and the last knot (past the end), the overshoot along it.
 *
 * ## Spaces: `spacingMode`
 *
 * A `tangent` constraint places one point per bone; `chain` and
 * `chainScale` one more, the last bone's tip. The first space is 0. Each
 * next space, for the bone before it, with `L` its `length` and `W` the
 * length of `L` times its world x column:
 *
 * - `length`: `max(0, L + spacing) · W / L` — the clamp at 0 is measured:
 *   without it 16 of the population missed;
 * - `fixed`: `spacing · W / L`;
 * - a bone whose `L` is below 0.00001, in either: `spacing` as stated;
 * - `percent`: `spacing`, and every space is multiplied by the path's
 *   total;
 * - `proportional`: `W` (or `spacing` for a bone below 0.00001), all of them
 *   then scaled by `count · spacing / their sum` when the sum is above 0,
 *   and multiplied by the total over the count of spaces — the whole total
 *   missed 260 of the population.
 *
 * ## Moving the bones: `rotateMode`, `offsetRotation`, the mixes
 *
 * Nothing moves when all three mixes are 0. Each bone in turn: its world
 * origin moves toward its point by `mixX` and `mixY` (the two axes on their
 * own); with `chainScale`, a bone longer than 0.00001 has its world x column
 * scaled by `(distance to the next point / W − 1) · mixRotate + 1`. Then,
 * when `mixRotate` is above 0 (a negative one turns nothing: reading it
 * as "not 0" missed 58 of the population), the bone turns by
 * `mixRotate` times the change from its x axis's angle to:
 *
 * - `tangent`: the curve's direction at its point — the derivative there,
 *   or below a parameter of 0.001 (negative ones included; 7 of 2,000
 *   tangent probes missed with 0.001 as a floor above 0) its first handle's
 *   direction;
 * - `chain`, `chainScale`: the direction to the next point — ⚠️ but when the
 *   next space is exactly 0, the next point's tangent. That is exact
 *   equality: a space of ±1e-7 turns to the (rounding-level) direction,
 *   and an ε test missed 157 of the population.
 * - `chain` with no offset: the next bone starts at this bone's tip, the
 *   bone's `length` along its turned axis (the runtime's "tip"); not
 *   carrying the tip missed 191 of the population.
 * - Otherwise `offsetRotation` degrees (the model's `rotation`) are added,
 *   in the runtime's π, NEGATED when the slot bone's world matrix does not
 *   have a positive determinant — never flipping missed 241 of the
 *   population. Which slot bone's world that is, is the next section.
 *
 * The change is brought once into [−π, π] with the runtime's π
 * (3.1415927), which `Math.PI` there missed 881 of 2,000 by. The bones are
 * then moved in world space and read back into local values at once, as the
 * first cut's world-space transform is (`./constraints.ts`, `localFromWorld`).
 *
 * ## Which slot bone the offset reads
 *
 * The runtime brings bones up to date in an order it builds before it
 * poses: each constraint in turn brings up to date the bones it reads and
 * the bones it moves (a bone after its parents, and once only until a
 * constraint moves a bone above it), and every bone left over follows at
 * the end. A path constraint reads its slot bone only for the offset's
 * sign, and it asks the order for its slot bone only when the slot holds an
 * UNWEIGHTED path in some skin — a weighted one asks for its bound bones
 * instead. So a weighted path's slot bone can be read before the pose has
 * set it (`slotBonePlan` emulates the order):
 *
 * - set by an earlier constraint's ordering — its world as it was brought
 *   up to date then, before that constraint ran; or as that constraint left
 *   it when it moved the bone itself;
 * - set by nothing yet — the previous pose's world: on a new skeleton all
 *   zeros, which is not positive, so the oracle's setup pose turns the
 *   offset the other way; at a sample, the sample before's.
 *
 * Measured on eight hand-written cases, each exact at the setup pose and at
 * nine samples, of which reading the slot bone fresh missed three, and on
 * random update orders of path, ik and transform constraints, 783 of 783
 * exact, fresh 774 (`CP06`, `CP07`).
 *
 * A physics constraint orders its one bone as a one-bone constraint does
 * (its parents first, what hangs below it reset, the bone done), though
 * under `Physics.none` it moves nothing. A slider sets no bone in the order —
 * neither its dial nor the bones its animation keys — and resets each bone
 * its animation keys and what hangs below it, so a later constraint that
 * orders one of them sets it again. Measured on eighteen hand-written orders
 * around a weighted path with an offset (`CP13`), each exact at the setup
 * pose and three samples, where the readings rejected each miss one or two:
 * physics ordering nothing, a slider ordering its dial, a slider ordering
 * the bones it keys, a slider resetting nothing, a slider resetting only
 * below the bones it keys; and on 400 random orders of one to five physics,
 * slider, ik and transform constraints around such a path, 400 exact
 * (physics ordering nothing 388, a slider ordering its dial and keyed bones
 * 379). The previous sample is the oracle's
 * order of animations, which the model does not hold: the core poses a
 * sample with the setup pose's reading, which is the runtime's exactly
 * when the slot bone's reflection is the setup's at every sample, and
 * leaves the samples' bones out by name when it is not.
 *
 * ## Which constraints run
 *
 * One with `skin: true` does not under `--skin all`; one whose slot bone is
 * inactive does not. One whose constrained bone is inactive still runs
 * (measured: its other bones move; the inactive one's matrix is collapsed
 * and the oracle's ill-conditioned rule excludes it). A weight bound to an
 * inactive bone reads its world of zeros.
 *
 * ## The record and its timelines
 *
 * The dump's `paths` block is the runtime's reading of each field, and the
 * core writes the same block (`pathRows`): `positionMode` absent reads
 * `percent`, `spacingMode` `length`, `rotateMode` `tangent`, `rotation`,
 * `position` and `spacing` 0, `mixRotate` and `mixX` 1 and `mixY` the
 * resolved `mixX`; a mode's first letter is read in either case. A path
 * attachment's `closed` absent reads false and `constantSpeed` true (the
 * `pathAttachments` block, `pathAttachmentRows`). The three timelines —
 * `position` and `spacing` one channel each, `mix` three — are evaluated by
 * construct 4's `keyIndexAt` and `channelAt`, float32 key times and values,
 * before the first key the constraint's own; a key stating no value reads
 * 0, one stating no mix 1 and no `mixY` its own `mixX` (`CP08`, 24 keyed
 * skeletons at 200 dense samples).
 *
 * ## Purity
 *
 * As the rest of the core: nothing from the Spine runtime package, nothing
 * from `src/transform.ts`, no clock, no randomness, no I/O.
 */
import type { ModelBone, ModelVertices } from '../model.ts';
import { RUNTIME_PI, type CoreWorld } from './world.ts';
import { EXACT_COORDS, worldVertices } from './vertices.ts';
import type { CoreCurve, CoreKey } from './animation.ts';
import type { CoreConstraintRecord } from './constraints.ts';

const RAD = RUNTIME_PI / 180;
const EPSILON = 0.00001;

/** The three modes a path constraint names, each as the model spells it once its first letter is lower-cased. */
export const PATH_POSITION_MODES = ['fixed', 'percent'] as const;
export const PATH_SPACING_MODES = ['length', 'fixed', 'percent', 'proportional'] as const;
export const PATH_ROTATE_MODES = ['tangent', 'chain', 'chainScale'] as const;
export type PathPositionMode = (typeof PATH_POSITION_MODES)[number];
export type PathSpacingMode = (typeof PATH_SPACING_MODES)[number];
export type PathRotateMode = (typeof PATH_ROTATE_MODES)[number];

/** The fields a path record may carry after `kind`, `name`, `declaredIn` (`buildRigConstraint` in `src/compile.ts`). */
export const PATH_FIELDS = ['bones', 'slot', 'positionMode', 'spacingMode', 'rotateMode', 'rotation', 'position', 'spacing', 'mixRotate', 'mixX', 'mixY', 'skin'] as const;

/** The curve a path constraint walks: the path attachment its slot shows, as the record states it. */
export interface CorePathGeometry {
  vertices: ModelVertices;
  closed: boolean;
  constantSpeed: boolean;
  lengths: number[];
  /** Set when a deform timeline replaced the vertices at a sample (`./deform.ts`): their coordinates are read as they are, not through `Math.fround`. */
  exact?: boolean;
}

/** The values a path constraint's timelines key. */
export interface PathPose {
  position: number;
  spacing: number;
  mixRotate: number;
  mixX: number;
  mixY: number;
}

export interface CorePathRecord extends PathPose {
  kind: 'path';
  name: string;
  bones: string[];
  slot: string;
  /** The slot's bone — the frame an unweighted path's vertices are in. */
  slotBone: string;
  positionMode: PathPositionMode;
  spacingMode: PathSpacingMode;
  rotateMode: PathRotateMode;
  offsetRotation: number;
  skin: boolean;
  /** What the slot shows at setup: its path, `null` when it shows no path (the constraint then does nothing). Set once the skins are read. */
  path: CorePathGeometry | null;
  /** Why what the slot shows cannot be told — skins that disagree over its placeholder — or null. */
  unresolved: string | null;
  /**
   * The bones the runtime brings up to date for this constraint's slot before
   * it runs, off every path attachment any skin files under the slot: a
   * weighted one's bound bones, an unweighted one's slot bone (the header's
   * *Which slot bone*). Set once the skins are read.
   */
  slotDeps: string[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function fold<T extends string>(raw: Record<string, unknown>, key: string, modes: readonly T[], dflt: T, where: string, problems: string[]): T {
  const v = raw[key];
  if (v === undefined) return dflt;
  const folded = typeof v === 'string' && v.length > 0 ? v[0].toLowerCase() + v.slice(1) : '';
  const mode = modes.find((m) => m === folded);
  if (mode === undefined) {
    problems.push(`${where}: ${key} is ${JSON.stringify(v)}, none of ${modes.join(', ')} (first letter in either case)`);
    return dflt;
  }
  return mode;
}

function num(raw: Record<string, unknown>, key: string, dflt: number, where: string, problems: string[]): number {
  const v = raw[key];
  if (v === undefined) return dflt;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    problems.push(`${where}: ${key} is ${JSON.stringify(v)}, not a finite number`);
    return dflt;
  }
  return v;
}

/**
 * A path constraint's record, read field by field, or `undefined` with the
 * problems named. `bones` and `slots` are the document's names and each
 * slot's bone.
 */
export function readPathRecord(raw: Record<string, unknown>, name: string, where: string, bones: ReadonlySet<string>, slots: ReadonlyMap<string, string>, problems: string[]): CorePathRecord | undefined {
  const before = problems.length;
  for (const key of Object.keys(raw)) {
    if (key === 'kind' || key === 'name' || key === 'declaredIn') continue;
    if (!(PATH_FIELDS as readonly string[]).includes(key)) problems.push(`${where}: field "${key}" is not one this reader knows; it reads [${PATH_FIELDS.join(', ')}]`);
  }
  const list: string[] = [];
  if (!Array.isArray(raw.bones) || raw.bones.length === 0) problems.push(`${where}: bones is ${JSON.stringify(raw.bones)}, not a non-empty list of bone names`);
  else raw.bones.forEach((b, i) => (typeof b === 'string' && bones.has(b) ? list.push(b) : problems.push(`${where}: bones[${i}] ${JSON.stringify(b)} is not a bone of this document`)));
  const slot = typeof raw.slot === 'string' ? raw.slot : '';
  const slotBone = slots.get(slot);
  if (slotBone === undefined) problems.push(`${where}: slot is ${JSON.stringify(raw.slot)}, not a slot of this document`);
  if (raw.skin !== undefined && typeof raw.skin !== 'boolean') problems.push(`${where}: skin is ${JSON.stringify(raw.skin)}, not a boolean`);
  const mixX = num(raw, 'mixX', 1, where, problems);
  const record: CorePathRecord = {
    kind: 'path', name, bones: list, slot, slotBone: slotBone ?? '',
    positionMode: fold(raw, 'positionMode', PATH_POSITION_MODES, 'percent', where, problems),
    spacingMode: fold(raw, 'spacingMode', PATH_SPACING_MODES, 'length', where, problems),
    rotateMode: fold(raw, 'rotateMode', PATH_ROTATE_MODES, 'tangent', where, problems),
    offsetRotation: num(raw, 'rotation', 0, where, problems),
    position: num(raw, 'position', 0, where, problems),
    spacing: num(raw, 'spacing', 0, where, problems),
    mixRotate: num(raw, 'mixRotate', 1, where, problems),
    mixX,
    mixY: num(raw, 'mixY', mixX, where, problems),
    skin: raw.skin === true,
    path: null,
    unresolved: null,
    slotDeps: [],
  };
  return problems.length === before ? record : undefined;
}

// ---------------------------------------------------------------------------
// timelines
// ---------------------------------------------------------------------------

/** A path constraint's three timelines, by the name the model gives them, and the channels each keys. */
export const PATH_TIMELINES = { position: ['value'], spacing: ['value'], mix: ['mixRotate', 'mixX', 'mixY'] } as const;
export type PathTimelineName = keyof typeof PATH_TIMELINES;

/** One animation's timelines of one path constraint. */
export interface CorePathTimelines {
  name: string;
  position?: CoreKey[];
  spacing?: CoreKey[];
  mix?: CoreKey[];
}

function keyCurve(raw: Record<string, unknown>, channels: number, last: boolean, at: string, problems: string[]): CoreCurve {
  const curve = raw.curve;
  if (curve === undefined) return 'linear';
  if (last) {
    problems.push(`${at}: the last key carries a curve, which eases to no key — the writer refuses it`);
    return 'linear';
  }
  if (curve === 'stepped') return 'stepped';
  if (!Array.isArray(curve) || curve.length !== channels * 4 || !curve.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    problems.push(`${at}: curve is ${JSON.stringify(curve)}, not "stepped" nor ${channels * 4} finite numbers (four per channel)`);
    return 'linear';
  }
  return curve as number[];
}

/**
 * The path timelines of one animation record's `constraints.path`, read: each
 * names a declared path constraint, each timeline is `position`, `spacing` or
 * `mix`, keys strictly increase in time, each key carries only its channels,
 * `time` and `curve`. An absent channel reads the parser's value, measured:
 * a position or spacing 0, a mix 1, a `mixY` the key's own `mixX` (the header).
 */
export function readPathTimelines(value: unknown, label: string, declared: ReadonlySet<string>, problems: string[]): CorePathTimelines[] {
  const out: CorePathTimelines[] = [];
  if (!Array.isArray(value)) return out;
  value.forEach((entry, i) => {
    const at = `${label}.constraints.path[${i}]`;
    if (!isRecord(entry) || typeof entry.name !== 'string') {
      problems.push(`${at} names no constraint`);
      return;
    }
    if (!declared.has(entry.name)) problems.push(`${at}: "${entry.name}" is not a path constraint of this document`);
    const tls: CorePathTimelines = { name: entry.name };
    if (!Array.isArray(entry.timelines)) {
      problems.push(`${at}: timelines is not a list`);
      return;
    }
    entry.timelines.forEach((tl: unknown, j: number) => {
      const tat = `${at}.timelines[${j}]`;
      if (!isRecord(tl) || typeof tl.name !== 'string' || !(tl.name in PATH_TIMELINES)) {
        problems.push(`${tat}: ${isRecord(tl) ? JSON.stringify(tl.name) : 'it'} is not a path timeline; they are ${Object.keys(PATH_TIMELINES).join(', ')}`);
        return;
      }
      const kind = tl.name as PathTimelineName;
      if (tls[kind] !== undefined) problems.push(`${tat}: "${kind}" is keyed twice on path constraint "${entry.name}"`);
      const channels: readonly string[] = PATH_TIMELINES[kind];
      const rawKeys = tl.keys;
      if (!Array.isArray(rawKeys) || rawKeys.length === 0) {
        problems.push(`${tat}: keys is not a non-empty list`);
        return;
      }
      let last = -Infinity;
      const keys: CoreKey[] = [];
      rawKeys.forEach((k: unknown, n: number) => {
        const kat = `${tat}.keys[${n}]`;
        if (!isRecord(k)) {
          problems.push(`${kat} is not an object`);
          return;
        }
        for (const f of Object.keys(k)) if (f !== 'time' && f !== 'curve' && !channels.includes(f)) problems.push(`${kat}: field "${f}" is not one this reader knows; it reads [time, ${channels.join(', ')}, curve]`);
        const time = k.time;
        if (typeof time !== 'number' || !Number.isFinite(time) || time < 0) {
          problems.push(`${kat}: time is ${JSON.stringify(time)}, not a finite time at or after 0`);
          return;
        }
        if (time <= last) problems.push(`${kat}: time ${time} is not after the key before it — the writer refuses key times that do not strictly increase`);
        last = Math.max(last, time);
        const stated = channels.map((c) => {
          if (c === 'mixY' && k.mixY === undefined) return num(k, 'mixX', 1, kat, problems);
          return num(k, c, kind === 'mix' ? 1 : 0, kat, problems);
        });
        keys.push({ time: Math.fround(time), values: stated.map(Math.fround), stated: { time, values: stated }, curve: keyCurve(k, channels.length, n === rawKeys.length - 1, kat, problems) });
      });
      tls[kind] = keys;
    });
    out.push(tls);
  });
  return out;
}

// ---------------------------------------------------------------------------
// solving
// ---------------------------------------------------------------------------

/** What the path solver reads and writes: the bones' local values, their world transforms, which are active. */
export interface PathSolverState {
  bones: ModelBone[];
  index: Map<string, number>;
  world: Map<string, CoreWorld>;
  active: ReadonlySet<string>;
}

/** The slot's path vertices in world units, as the constraint reads them at the moment it runs. */
function pathWorld(state: PathSolverState, c: CorePathRecord, g: CorePathGeometry): number[] {
  return worldVertices(g.vertices, state.world.get(c.slotBone) as CoreWorld, state.world, g.exact === true ? EXACT_COORDS : Math.fround);
}

function onLineBefore(p: number, x1: number, y1: number, x2: number, y2: number, out: number[], o: number): void {
  const r = Math.atan2(y2 - y1, x2 - x1);
  out[o] = x1 + p * Math.cos(r);
  out[o + 1] = y1 + p * Math.sin(r);
  out[o + 2] = r;
}

function onLinePast(p: number, x0: number, y0: number, x1: number, y1: number, out: number[], o: number): void {
  const r = Math.atan2(y1 - y0, x1 - x0);
  out[o] = x1 + p * Math.cos(r);
  out[o + 1] = y1 + p * Math.sin(r);
  out[o + 2] = r;
}

function onCurve(p: number, x1: number, y1: number, cx1: number, cy1: number, cx2: number, cy2: number, x2: number, y2: number, out: number[], o: number, wantsTangent: boolean): void {
  if (Number.isNaN(p)) {
    out[o] = x1;
    out[o + 1] = y1;
    out[o + 2] = Math.atan2(cy1 - y1, cx1 - x1);
    return;
  }
  const t2 = p * p;
  const t3 = t2 * p;
  const u = 1 - p;
  const u2 = u * u;
  const u3 = u2 * u;
  const ut = u * p;
  const ut3x = ut * 3;
  const w1 = u * ut3x;
  const w2 = ut3x * p;
  const x = x1 * u3 + cx1 * w1 + cx2 * w2 + x2 * t3;
  const y = y1 * u3 + cy1 * w1 + cy2 * w2 + y2 * t3;
  out[o] = x;
  out[o + 1] = y;
  if (wantsTangent) {
    if (p < 0.001) out[o + 2] = Math.atan2(cy1 - y1, cx1 - x1);
    else out[o + 2] = Math.atan2(y - (y1 * u2 + cy1 * ut * 2 + cy2 * t2), x - (x1 * u2 + cx1 * ut * 2 + cx2 * t2));
  }
}

/** The world position and angle of each space along the path. */
function positionsOf(state: PathSolverState, c: CorePathRecord, g: CorePathGeometry, spaces: number[], wantsTangent: boolean): number[] {
  const spaceCount = spaces.length;
  const pts = pathWorld(state, c, g);
  const n = pts.length / 2;
  const P = (k: number): [number, number] => [pts[2 * k], pts[2 * k + 1]];
  const out: number[] = new Array(spaceCount * 3 + 2).fill(0);
  const closed = g.closed;
  let position = c.position;
  if (!g.constantSpeed) {
    const lengths = g.lengths;
    const curveCount = n / 3 - (closed ? 1 : 2);
    const total = lengths[curveCount];
    if (c.positionMode === 'percent') position *= total;
    const spaceScale = c.spacingMode === 'percent' ? total : c.spacingMode === 'proportional' ? total / spaceCount : 1;
    let curve = 0;
    for (let i = 0, o = 0; i < spaceCount; i++, o += 3) {
      const space = spaces[i] * spaceScale;
      position += space;
      let p = position;
      if (closed) {
        p %= total;
        if (p < 0) p += total;
        curve = 0;
      } else if (p < 0) {
        const [x1, y1] = P(1);
        const [x2, y2] = P(2);
        onLineBefore(p, x1, y1, x2, y2, out, o);
        continue;
      } else if (p > total) {
        const [x0, y0] = P(n - 3);
        const [x1, y1] = P(n - 2);
        onLinePast(p - total, x0, y0, x1, y1, out, o);
        continue;
      }
      for (;; curve++) {
        const length = lengths[curve];
        if (p > length) continue;
        if (curve === 0) p /= length;
        else {
          const prev = lengths[curve - 1];
          p = (p - prev) / (length - prev);
        }
        break;
      }
      const k = 3 * curve + 1;
      const q = (m: number): [number, number] => P((k + m) % n);
      const [x1, y1] = q(0);
      const [cx1, cy1] = q(1);
      const [cx2, cy2] = q(2);
      const [x2, y2] = q(3);
      onCurve(p, x1, y1, cx1, cy1, cx2, cy2, x2, y2, out, o, wantsTangent || (i > 0 && space === 0));
    }
    return out;
  }
  // constant speed: the chain, knot handle handle knot …
  const chain: number[] = [];
  if (closed) {
    for (let k = 1; k < n; k++) chain.push(...P(k));
    chain.push(...P(0), ...P(1));
  } else for (let k = 1; k < n - 1; k++) chain.push(...P(k));
  const curveCount = closed ? n / 3 : n / 3 - 1;
  const curveEnds: number[] = [];
  let total = 0;
  let x1 = chain[0];
  let y1 = chain[1];
  for (let i = 0, w = 2; i < curveCount; i++, w += 6) {
    const cx1 = chain[w];
    const cy1 = chain[w + 1];
    const cx2 = chain[w + 2];
    const cy2 = chain[w + 3];
    const x2 = chain[w + 4];
    const y2 = chain[w + 5];
    const h2x = (x1 - cx1 * 2 + cx2) * 0.1875;
    const h2y = (y1 - cy1 * 2 + cy2) * 0.1875;
    const d3x = ((cx1 - cx2) * 3 - x1 + x2) * 0.09375;
    const d3y = ((cy1 - cy2) * 3 - y1 + y2) * 0.09375;
    let d2x = h2x * 2 + d3x;
    let d2y = h2y * 2 + d3y;
    let d1x = (cx1 - x1) * 0.75 + h2x + d3x * 0.16666667;
    let d1y = (cy1 - y1) * 0.75 + h2y + d3y * 0.16666667;
    total += Math.sqrt(d1x * d1x + d1y * d1y);
    d1x += d2x;
    d1y += d2y;
    d2x += d3x;
    d2y += d3y;
    total += Math.sqrt(d1x * d1x + d1y * d1y);
    d1x += d2x;
    d1y += d2y;
    total += Math.sqrt(d1x * d1x + d1y * d1y);
    d1x += d2x + d3x;
    d1y += d2y + d3y;
    total += Math.sqrt(d1x * d1x + d1y * d1y);
    curveEnds.push(total);
    x1 = x2;
    y1 = y2;
  }
  if (c.positionMode === 'percent') position *= total;
  const spaceScale = c.spacingMode === 'percent' ? total : c.spacingMode === 'proportional' ? total / spaceCount : 1;
  const segmentEnds: number[] = new Array(10).fill(0);
  let curveTotal = 0;
  let lastCurve = -1;
  let cx1 = 0, cy1 = 0, cx2 = 0, cy2 = 0, x2 = 0, y2 = 0;
  for (let i = 0, o = 0, curve = 0, segment = 0; i < spaceCount; i++, o += 3) {
    const space = spaces[i] * spaceScale;
    position += space;
    let p = position;
    if (closed) {
      p %= total;
      if (p < 0) p += total;
      curve = 0;
      segment = 0;
    } else if (p < 0) {
      onLineBefore(p, chain[0], chain[1], chain[2], chain[3], out, o);
      continue;
    } else if (p > total) {
      const e = chain.length;
      onLinePast(p - total, chain[e - 4], chain[e - 3], chain[e - 2], chain[e - 1], out, o);
      continue;
    }
    for (;; curve++) {
      const length = curveEnds[curve];
      if (p > length) continue;
      if (curve === 0) p /= length;
      else {
        const prev = curveEnds[curve - 1];
        p = (p - prev) / (length - prev);
      }
      break;
    }
    if (curve !== lastCurve) {
      lastCurve = curve;
      const ii = curve * 6;
      x1 = chain[ii];
      y1 = chain[ii + 1];
      cx1 = chain[ii + 2];
      cy1 = chain[ii + 3];
      cx2 = chain[ii + 4];
      cy2 = chain[ii + 5];
      x2 = chain[ii + 6];
      y2 = chain[ii + 7];
      const h2x = (x1 - cx1 * 2 + cx2) * 0.03;
      const h2y = (y1 - cy1 * 2 + cy2) * 0.03;
      const d3x = ((cx1 - cx2) * 3 - x1 + x2) * 0.006;
      const d3y = ((cy1 - cy2) * 3 - y1 + y2) * 0.006;
      let d2x = h2x * 2 + d3x;
      let d2y = h2y * 2 + d3y;
      let d1x = (cx1 - x1) * 0.3 + h2x + d3x * 0.16666667;
      let d1y = (cy1 - y1) * 0.3 + h2y + d3y * 0.16666667;
      curveTotal = Math.sqrt(d1x * d1x + d1y * d1y);
      segmentEnds[0] = curveTotal;
      for (let s = 1; s < 8; s++) {
        d1x += d2x;
        d1y += d2y;
        d2x += d3x;
        d2y += d3y;
        curveTotal += Math.sqrt(d1x * d1x + d1y * d1y);
        segmentEnds[s] = curveTotal;
      }
      d1x += d2x;
      d1y += d2y;
      curveTotal += Math.sqrt(d1x * d1x + d1y * d1y);
      segmentEnds[8] = curveTotal;
      d1x += d2x + d3x;
      d1y += d2y + d3y;
      curveTotal += Math.sqrt(d1x * d1x + d1y * d1y);
      segmentEnds[9] = curveTotal;
      segment = 0;
    }
    p *= curveTotal;
    for (;; segment++) {
      const length = segmentEnds[segment];
      if (p > length) continue;
      if (segment === 0) p /= length;
      else {
        const prev = segmentEnds[segment - 1];
        p = segment + (p - prev) / (length - prev);
      }
      break;
    }
    onCurve(p * 0.1, x1, y1, cx1, cy1, cx2, cy2, x2, y2, out, o, wantsTangent || (i > 0 && space === 0));
  }
  return out;
}

/** A path constraint (the header): returns the bones it moved, every one in world space. */
export function solvePath(state: PathSolverState, c: CorePathRecord, slotWorld: CoreWorld): { changed: string[]; inWorld: string[] } {
  const g = c.path;
  const none = { changed: [], inWorld: [] };
  if (g === null) return none;
  const { mixRotate, mixX, mixY } = c;
  if (mixRotate === 0 && mixX === 0 && mixY === 0) return none;
  const wantsTangent = c.rotateMode === 'tangent';
  const scale = c.rotateMode === 'chainScale';
  const bones = c.bones.map((n) => state.bones[state.index.get(n) as number]);
  const boneCount = bones.length;
  const spaceCount = wantsTangent ? boneCount : boneCount + 1;
  const spaces: number[] = new Array(spaceCount).fill(0);
  const lengths: number[] = scale ? new Array(boneCount).fill(0) : [];
  const spacing = c.spacing;
  const worldOf = (b: ModelBone): CoreWorld => state.world.get(b.name) as CoreWorld;
  if (c.spacingMode === 'percent') {
    if (scale) {
      for (let i = 0; i < spaceCount - 1; i++) {
        const b = bones[i];
        const boneLength = b.length ?? 0;
        const w = worldOf(b);
        const x = boneLength * w.a;
        const y = boneLength * w.c;
        lengths[i] = Math.sqrt(x * x + y * y);
      }
    }
    for (let i = 1; i < spaceCount; i++) spaces[i] = spacing;
  } else if (c.spacingMode === 'proportional') {
    let sum = 0;
    for (let i = 0, n = spaceCount - 1; i < n; ) {
      const b = bones[i];
      const boneLength = b.length ?? 0;
      if (boneLength < EPSILON) {
        if (scale) lengths[i] = 0;
        spaces[++i] = spacing;
      } else {
        const w = worldOf(b);
        const x = boneLength * w.a;
        const y = boneLength * w.c;
        const length = Math.sqrt(x * x + y * y);
        if (scale) lengths[i] = length;
        spaces[++i] = length;
        sum += length;
      }
    }
    if (sum > 0) {
      sum = (spaceCount / sum) * spacing;
      for (let i = 1; i < spaceCount; i++) spaces[i] *= sum;
    }
  } else {
    const addsLength = c.spacingMode === 'length';
    for (let i = 0, n = spaceCount - 1; i < n; ) {
      const b = bones[i];
      const boneLength = b.length ?? 0;
      if (boneLength < EPSILON) {
        if (scale) lengths[i] = 0;
        spaces[++i] = spacing;
      } else {
        const w = worldOf(b);
        const x = boneLength * w.a;
        const y = boneLength * w.c;
        const length = Math.sqrt(x * x + y * y);
        if (scale) lengths[i] = length;
        spaces[++i] = ((addsLength ? Math.max(0, boneLength + spacing) : spacing) * length) / boneLength;
      }
    }
  }
  const positions = positionsOf(state, c, g, spaces, wantsTangent);
  let atX = positions[0];
  let atY = positions[1];
  let offsetRotation = c.offsetRotation;
  let fromTip: boolean;
  if (offsetRotation === 0) fromTip = c.rotateMode === 'chain';
  else {
    fromTip = false;
    const p = slotWorld;
    offsetRotation *= p.a * p.d - p.b * p.c > 0 ? RAD : -RAD;
  }
  const changed: string[] = [];
  for (let i = 0, p = 3; i < boneCount; i++, p += 3) {
    const b = bones[i];
    const w = { ...worldOf(b) };
    w.worldX += (atX - w.worldX) * mixX;
    w.worldY += (atY - w.worldY) * mixY;
    const x = positions[p];
    const y = positions[p + 1];
    const dx = x - atX;
    const dy = y - atY;
    if (scale) {
      const length = lengths[i];
      if (length >= EPSILON) {
        const s = (Math.sqrt(dx * dx + dy * dy) / length - 1) * mixRotate + 1;
        w.a *= s;
        w.c *= s;
      }
    }
    atX = x;
    atY = y;
    if (mixRotate > 0) {
      const { a, b: bb, c: cc, d } = w;
      let r: number;
      if (wantsTangent) r = positions[p - 1];
      else if (spaces[i + 1] === 0) r = positions[p + 2];
      else r = Math.atan2(dy, dx);
      r -= Math.atan2(cc, a);
      if (fromTip) {
        const cos = Math.cos(r);
        const sin = Math.sin(r);
        const length = b.length ?? 0;
        atX += (length * (cos * a - sin * cc) - dx) * mixRotate;
        atY += (length * (sin * a + cos * cc) - dy) * mixRotate;
      } else r += offsetRotation;
      if (r > RUNTIME_PI) r -= RUNTIME_PI * 2;
      else if (r < -RUNTIME_PI) r += RUNTIME_PI * 2;
      r *= mixRotate;
      const cos = Math.cos(r);
      const sin = Math.sin(r);
      w.a = cos * a - sin * cc;
      w.b = cos * bb - sin * d;
      w.c = sin * a + cos * cc;
      w.d = sin * bb + cos * d;
    }
    state.world.set(b.name, w);
    changed.push(b.name);
  }
  return { changed, inWorld: [...changed] };
}

// ---------------------------------------------------------------------------
// the dump's two path blocks
// ---------------------------------------------------------------------------

/** A mode as the runtime's enum names it: the first letter upper-cased (`chainScale` → `ChainScale`). */
const enumName = (mode: string): string => mode[0].toUpperCase() + mode.slice(1);

/** One `paths` row, the oracle's shape (`OraclePathRow` in `tools/pose_oracle.ts`). */
export interface CorePathRow {
  name: string;
  slot: string;
  bones: string[];
  positionMode: string;
  spacingMode: string;
  rotateMode: string;
  offsetRotation: number | null;
  position: number | null;
  spacing: number | null;
  mixRotate: number | null;
  mixX: number | null;
  mixY: number | null;
}

/** One `pathAttachments` row, the oracle's shape. */
export interface CorePathAttachmentRow {
  skin: string;
  slot: string;
  placeholder: string;
  closed: boolean;
  constantSpeed: boolean;
  lengths: Array<number | null>;
}

/** The `paths` block: every path record in the document's order, its modes as the runtime names them, its numbers through `round`. */
export function pathRows(records: readonly CorePathRecord[], round: (v: number) => number | null): CorePathRow[] {
  return records.map((r) => ({
    name: r.name, slot: r.slot, bones: [...r.bones],
    positionMode: enumName(r.positionMode), spacingMode: enumName(r.spacingMode), rotateMode: enumName(r.rotateMode),
    offsetRotation: round(r.offsetRotation), position: round(r.position), spacing: round(r.spacing), mixRotate: round(r.mixRotate), mixX: round(r.mixX), mixY: round(r.mixY),
  }));
}

/** The `pathAttachments` block: every path attachment of every skin, its two flags as read and its `lengths` through `round`. */
export function pathAttachmentRows(skins: ReadonlyArray<{ name: string; attachments: Record<string, Record<string, { geometry?: { kind: string } & Partial<CorePathGeometry> }>> }>, round: (v: number) => number | null): CorePathAttachmentRow[] {
  const out: CorePathAttachmentRow[] = [];
  for (const skin of skins) {
    for (const [slot, table] of Object.entries(skin.attachments)) {
      for (const [placeholder, record] of Object.entries(table)) {
        const g = record.geometry;
        if (g?.kind !== 'path') continue;
        out.push({ skin: skin.name, slot, placeholder, closed: g.closed === true, constantSpeed: g.constantSpeed !== false, lengths: (g.lengths ?? []).map(round) });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// which slot bone the offset's sign reads
// ---------------------------------------------------------------------------

/**
 * When the runtime last set a path constraint's slot bone's world before the
 * constraint runs (the header's *Which slot bone*): during the ordering of
 * constraint `at` — brought up to date from its parent just `before` that
 * constraint runs, or moved by it and so as it left the bone, `after` it.
 */
export interface SlotBoneEvent {
  at: number;
  when: 'before' | 'after';
}

/**
 * For each path constraint, by its index in `records`, the last event that
 * set its slot bone's world before it runs — `null` when nothing has in this
 * pass, and the bone holds the previous pass's world. The runtime orders its
 * update before it poses: each constraint in turn brings the bones it reads
 * and moves up to date (a bone, its parents first, once until something
 * below which it hangs moves), and every bone left over follows at the end.
 * `skipped` names the constraints the runtime does not apply, which it does
 * not order either.
 */
export function slotBonePlan(bones: readonly ModelBone[], active: ReadonlySet<string>, records: readonly CoreConstraintRecord[], skipped: ReadonlySet<number>): Map<number, SlotBoneEvent | null> {
  const parent = new Map(bones.map((b) => [b.name, b.parent]));
  const children = new Map<string, string[]>();
  for (const b of bones) if (b.parent !== undefined) children.set(b.parent, [...(children.get(b.parent) ?? []), b.name]);
  const ordered = new Map(bones.map((b) => [b.name, !active.has(b.name)]));
  const last = new Map<string, SlotBoneEvent>();
  const orderBone = (name: string, m: number): void => {
    if (ordered.get(name)) return;
    const p = parent.get(name);
    if (p !== undefined) orderBone(p, m);
    ordered.set(name, true);
    last.set(name, { at: m, when: 'before' });
  };
  const unorder = (names: readonly string[]): void => {
    for (const n of names) {
      if (!active.has(n)) continue;
      if (ordered.get(n)) unorder(children.get(n) ?? []);
      ordered.set(n, false);
    }
  };
  const plan = new Map<number, SlotBoneEvent | null>();
  records.forEach((c, m) => {
    if (skipped.has(m)) return;
    let moved: readonly string[];
    // A slider sets no bone in the order; it resets each bone its animation keys, and what hangs below it (the header's *Which slot bone*).
    if (c.kind === 'slider') {
      unorder(c.timelines.bones.map((t) => t.name));
      return;
    }
    if (c.kind === 'ik') {
      moved = c.bones;
      orderBone(c.target, m);
      orderBone(c.bones[0], m);
      if (c.bones.length > 1) orderBone(c.bones[c.bones.length - 1], m);
      unorder(children.get(c.bones[0]) ?? []);
      if (c.bones.length > 1) ordered.set(c.bones[c.bones.length - 1], true);
    } else {
      // A physics constraint orders its one bone as a one-bone constraint does (the header's *Which slot bone*).
      moved = c.kind === 'physics' ? [c.bone] : c.bones;
      if (c.kind === 'transform') orderBone(c.source, m);
      else if (c.kind === 'path') for (const d of c.slotDeps) orderBone(d, m);
      for (const b of moved) orderBone(b, m);
      if (c.kind === 'path') plan.set(m, last.get(c.slotBone) ?? null);
      for (const b of moved) unorder(children.get(b) ?? []);
      for (const b of moved) ordered.set(b, true);
    }
    for (const b of moved) last.set(b, { at: m, when: 'after' });
  });
  return plan;
}
