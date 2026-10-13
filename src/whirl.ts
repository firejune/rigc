/**
 * How far each physics constraint's bone turns in one step — the whirl
 * reading `rigc explain` prints under its physics block (issue #1423) — and,
 * on the same walk, the lever reading below it (issue #1427, *the lever
 * reading* at the foot of this file).
 *
 * ⭐ **A reading, not a gate.** An `inertia` above 1 is kept by the editor and
 * posed as written: the Spine 4.3.26 editor imports 2, 3 and 10 and exports
 * them unchanged, the export posing identically to the build, and the user
 * guide describes the field without a cap (issue #1423's measurement). So
 * there is no source a refusal could cite, and what is left is to make the
 * motion visible: a link that turns half a turn between two frames draws a
 * direction the eye cannot follow, on a build that passes every assertion.
 * Whether that is wanted is the author's. This names the bone, the animation,
 * the degrees and the step, and decides nothing.
 *
 * ## The walk
 *
 * Each animation is walked as a player that starts it plays it: a fresh
 * skeleton with no skin set, at the setup pose with every physics state reset
 * there (pose 0), then the animation applied in steps of `1 / WHIRL_HZ`
 * seconds until the track time reaches the duration (at least one step) —
 * the raw entry's walk under `reset: 'setup'`, the physics clock moved by the
 * step itself, which is spine-core's `update(1/60)` on a skeleton stepped at
 * that rate (the recipe `CO56` holds the core to, bit for bit).
 *
 * ⚠️ **Why from the setup pose, and not render's walk.** `render` resets the
 * physics at the animation's first pose, so a bone the first key moves away
 * from the setup pose is already there when the physics starts. A player does
 * not do that: its skeleton starts at the setup pose, and the first step moves
 * every keyed bone from there at once. The constrained bone's inertia answers
 * that step — and it is where the largest turns were measured: on issue
 * #1422's probe (a 1-link rotate drive under a parent keyed ±15°), inertia 10
 * turns its bone 153.38° in step 1 from the setup pose, and walked from the
 * animation's first pose at most 4.10°, 3.82° and 13.68° at `fps` 15, 30 and
 * 60. A reading over render's walk would print the second and miss the motion
 * the card is about — `WH03` plants it.
 *
 * ## The turn
 *
 * The turn of a bone from one pose to the next is the signed angle between
 * its world x axis at the two poses — `atan2(a₀c₁ − c₀a₁, a₀a₁ + c₀c₁)` over
 * the two matrices' first columns, in degrees, in (−180, 180] — so it is the
 * change of the direction the bone is drawn along, whatever moved it: its own
 * physics offset, its parent, a key, a mirrored scale. The figure is the
 * largest magnitude over every step of the walk, at the earliest step on a
 * tie. A turn near 180° in one step is a direction the drawing cannot tell
 * from its opposite.
 *
 * Every physics constraint gets a line, whichever components it drives: the
 * turn is a property of the posed bone, and the drives that do not rotate it
 * still turn it when they move a parent's scale through zero or when a parent
 * swings it. A skin-required constraint does not step on a skeleton with no
 * skin set, so its line says it was not read rather than printing the turn of
 * a bone its physics never moved. An animation a slider applies is a table
 * posed at a value the consumer holds, not a span of time (`A39`'s reading,
 * issue #407), so it is named and not walked — the animation that moves the
 * slider's value is walked, and the slider is applied on each of its steps.
 *
 * Pure: no clock, no randomness, no runtime. Posed by rigc's core.
 */
import { posedBones } from './core/animation.ts';
import { stepPhysics, type PhysicsStepper } from './core/constraints_physics.ts';
import { type CompiledDocument, CoreInputError, underNoSkin } from './core/index.ts';
import { poseRawAnimationEach, type RawBone, type RawReset } from './core/raw.ts';
import { indexRuns } from './folds.ts';

/** The walk's rate: steps per second. The runtime's own physics default, and the rate a player steps a skeleton at. */
export const WHIRL_HZ = 60;

/**
 * The reading's plants — the readings the card's measurement rejects, each a
 * control's (`WH03`) and never a caller's:
 * - `frame: 'parent'` reads the turn in the parent bone's frame — the bone's
 *   world turn less its parent's — which is a reading that ignores the
 *   parent's motion;
 * - `reset: 'animation'` walks as `render` does, the physics reset at the
 *   animation's first pose, so the step from the setup pose is never taken.
 */
export interface WhirlPlant {
  frame?: 'parent';
  reset?: RawReset;
}

/** One physics constraint's largest turn over one animation's walk. */
export interface WhirlTurn {
  constraint: string;
  bone: string;
  /** The largest |turn| in one step, degrees; `null` when not read (`why`). */
  degrees: number | null;
  /** The step it happens at — the turn from pose `step − 1` to pose `step` — and that pose's track time, seconds. */
  step: number;
  time: number;
  /** Why the constraint was not read; `null` when it was. */
  why: string | null;
}

/** One animation's walk and its constraints' turns. */
export interface WhirlAnimation {
  animation: string;
  /** How many steps of `1 / WHIRL_HZ` the walk took. */
  steps: number;
  turns: WhirlTurn[];
  /** The core's refusal, when it would not pose the walk; then every turn is unread. */
  refused: string | null;
}

/** The physics constraints of a document, in declaration order: name, bone, and whether a skeleton with no skin set steps it. */
export function physicsBones(doc: CompiledDocument): Array<{ name: string; bone: string; steps: boolean }> {
  const out: Array<{ name: string; bone: string; steps: boolean }> = [];
  for (const c of doc.constraints) {
    const r = c.record;
    if (r?.kind !== 'physics') continue;
    out.push({ name: r.name, bone: r.bone, steps: !r.skin || r.listedBySkin });
  }
  return out;
}

/** The signed turn of a bone's world x axis from `from` to `to`, degrees in (−180, 180]. */
export function axisTurn(from: Pick<RawBone, 'a' | 'c'>, to: Pick<RawBone, 'a' | 'c'>): number {
  return (Math.atan2(from.a * to.c - from.c * to.a, from.a * to.a + from.c * to.c) * 180) / Math.PI;
}

/** `axisTurn` less the parent's own, wrapped to (−180, 180] — the `frame: 'parent'` plant. */
function parentFrameTurn(from: Pick<RawBone, 'a' | 'c'>, to: Pick<RawBone, 'a' | 'c'>, parentFrom: Pick<RawBone, 'a' | 'c'>, parentTo: Pick<RawBone, 'a' | 'c'>): number {
  const d = axisTurn(from, to) - axisTurn(parentFrom, parentTo);
  return d > 180 ? d - 360 : d <= -180 ? d + 360 : d;
}

/**
 * One constraint's running figure over a walk: the largest |turn| so far, its
 * step and time (step 0 before any), and the first step whose turn is not a
 * number. The core passes a bone's matrix on as posed, NaN included, and
 * `turn > largest` is false for NaN — so without `lost` a bone that overflowed
 * would print the finite figure it reached before, which is the silence this
 * reading exists to remove (`WH04`).
 */
export interface TurnRecord {
  degrees: number;
  step: number;
  time: number;
  lost: { step: number; time: number } | null;
}

/** A record no step has reached. */
export function freshTurnRecord(): TurnRecord {
  return { degrees: 0, step: 0, time: 0, lost: null };
}

/** `turn` (signed, degrees) taken at `step`, `time` — kept when its magnitude is the largest so far, the earliest on a tie. */
export function recordTurn(record: TurnRecord, turn: number, step: number, time: number): void {
  const size = Math.abs(turn);
  if (!Number.isFinite(size)) record.lost ??= { step, time };
  else if (size > record.degrees) {
    record.degrees = size;
    record.step = step;
    record.time = time;
  }
}

/** How many steps of `1 / WHIRL_HZ` an animation of `duration` seconds is walked for: to the duration, at least one. */
export function whirlSteps(duration: number): number {
  return Math.max(1, Math.ceil(duration * WHIRL_HZ));
}

/**
 * Every animation of `doc` walked from the setup pose (the header's *The
 * walk*), and each physics constraint's largest turn in one step. A document
 * with no physics constraint reads nothing and returns no animation.
 */
export function whirlReading(doc: CompiledDocument, plant: WhirlPlant = {}): WhirlAnimation[] {
  const view = underNoSkin(doc);
  const constraints = physicsBones(view);
  if (constraints.length === 0) return [];
  const out: WhirlAnimation[] = [];
  for (const animation of view.animations) {
    const steps = whirlSteps(animation.timelines.duration);
    // A slider's table is posed at a value the consumer holds, not played in time (A39's reading, issue #407): a step
    // through it is a moment the object never claimed, so it is named and not walked. Whatever moves the slider's
    // value is an animation of its own, and that one is walked.
    const sliders = view.constraints.filter((c) => c.kind === 'slider' && c.animation === animation.name).map((c) => `"${c.name}"`);
    if (sliders.length > 0) {
      const why = `slider ${sliders.join(', ')} applies it at a value, not in time, so there is no step to read — the animation that moves the slider's value is walked instead`;
      out.push({ animation: animation.name, steps: 0, refused: null, turns: constraints.map((c) => ({ constraint: c.name, bone: c.bone, degrees: null, step: 0, time: 0, why })) });
      continue;
    }
    const best = constraints.map(() => freshTurnRecord());
    let prev: Map<string, RawBone> | null = null;
    let refused: string | null = null;
    try {
      poseRawAnimationEach(view, animation.name, new Array<number>(steps).fill(1 / WHIRL_HZ), {}, plant.reset ?? 'setup', (pose, index) => {
        const bones = new Map(pose.bones.map((b) => [b.name, b] as const));
        if (prev !== null) {
          for (let i = 0; i < constraints.length; i++) {
            const name = constraints[i].bone;
            const from = prev.get(name);
            const to = bones.get(name);
            if (from === undefined || to === undefined) continue;
            const parent = to.parent === null ? undefined : bones.get(to.parent);
            const parentFrom = to.parent === null ? undefined : prev.get(to.parent);
            const turn = plant.frame === 'parent' && parent !== undefined && parentFrom !== undefined ? parentFrameTurn(from, to, parentFrom, parent) : axisTurn(from, to);
            recordTurn(best[i], turn, index, pose.trackTime);
          }
        }
        prev = bones;
      });
    } catch (err) {
      if (!(err instanceof CoreInputError)) throw err;
      refused = err.message;
    }
    out.push({
      animation: animation.name,
      steps,
      refused,
      turns: constraints.map((c, i) => {
        const gone = best[i].lost;
        const why =
          refused !== null
            ? `the core refused to pose the walk — ${refused}`
            : !c.steps
              ? 'skin-required, and a skeleton with no skin set does not step it'
              : gone !== null
                ? `its bone's world direction is not a number from step ${gone.step} (t=${gone.time.toFixed(4)}s)`
                : null;
        return { constraint: c.name, bone: c.bone, degrees: why === null ? best[i].degrees : null, step: best[i].step, time: best[i].time, why };
      }),
    });
  }
  return out;
}

/** The header line `explain` prints above the reading: what was walked and how, and that it decides nothing. */
export const WHIRL_HEADER =
  `turn per step  (a reading, never a gate: each animation walked by rigc's core as a player starts it — from the setup pose, ` +
  `physics reset there, no skin set — in steps of 1/${WHIRL_HZ} s to its duration; the largest change of each physics bone's world ` +
  'direction from one step to the next)';

/** One printed line per constraint per animation. */
export function whirlLines(reading: readonly WhirlAnimation[]): string[] {
  const lines: string[] = [];
  for (const a of reading) {
    for (const t of a.turns) {
      const head = `${JSON.stringify(a.animation)}: physics "${t.constraint}" (bone "${t.bone}")`;
      lines.push(
        t.degrees === null
          ? `${head} not read — ${t.why}`
          : t.step === 0
            ? `${head} does not turn in any of ${a.steps} step(s)`
            : `${head} turns at most ${t.degrees.toFixed(2)}° in one step — step ${t.step} of ${a.steps} (t=${t.time.toFixed(4)}s)`,
      );
    }
  }
  return lines;
}

// ---------------------------------------------------------------------------
// the lever reading (issue #1427)
// ---------------------------------------------------------------------------

/**
 * Where a scaleX drive's inertia lever divides by a collapsed length — the
 * second reading `rigc explain` prints under its physics block, when asked
 * for with `--lever-fold <fraction>` (issue #1427).
 *
 * ## The mechanism it reads
 *
 * A physics constraint that drives `scaleX` kicks its scale offset by its
 * bone's motion over a length: `scaleOffset += (dx·cos + dy·sin) · inertia /
 * rr` (`./core/constraints_physics.ts`, *The step*; spine-core 4.3.13's
 * `update` divides by the same `r`). `limit` caps `dx` and `dy`; nothing caps
 * the division, and the kick is skipped only when `rr` is not above 0. What
 * `rr` is depends on the drive:
 *
 * - with `rotate` or `shearX` driven too, `rr = length · |world x axis|` — the
 *   bone's world x-axis length (`√(a² + c²)` of the world matrix the step is
 *   handed, before the constraint moves it) times its length;
 * - with `scaleX` alone, `rr = length · |world x axis| − scaleLag · shown`
 *   — the same product less the last integration's move of the offset,
 *   weighted by how much of it was shown.
 *
 * ⚠️ **The divisor, not the world length alone, and this is measured, not
 * argued.** Issue #1422 traced a 5-link scaleX-only chain (inertia 10, `fps`
 * 15, 0.95 of the step bound) whose link 3 jumped its offset 24.3 → 349 in one
 * step, and read the cause as the bone's world length near 0. Walked here,
 * that step's lever reads link 3's world x axis at 0.5636 of its setup length
 * — and divides by 0.0588 of its setup divisor, because `scaleLag · shown`
 * (25.24 × 1) takes almost all of `length · |world x axis|` (28.18) away. A
 * reading of the world length alone misses that step at any fraction below
 * 0.5636 and names steps where the kick is skipped altogether (the same link
 * three steps earlier reads 0.481 of its setup length while `rr` is −8.47, so
 * nothing is divided); `LV04` plants it. On a drive that rotates too the two
 * are the same number, so nothing the card meant is lost.
 *
 * Whether a chain gets there depends on how far an offset swings, which no
 * authored number states (#1422's ruling), so this is a reading and not a
 * refusal.
 *
 * ## What it names
 *
 * Per animation, for every constraint that drives `scaleX`:
 *
 * - **the collapsed divisions** — the steps where the constraint's lever
 *   divides (`rr` above 0) by less than `fraction` × the divisor it would take
 *   at the setup pose, `length · |world x axis|` there (no lag has been
 *   integrated yet). A lever divides on a step where the constraint is not
 *   pending (the first update after a reset takes the bone where it is and
 *   integrates nothing), its `mix` is not 0 and its `inertia` is not 0 — with
 *   `inertia` 0 the quotient is multiplied by 0. Each line gives the least
 *   divisor, as that fraction, with the world x-axis length the lever read on
 *   that step beside it. `fraction` is the caller's, stated: there is no
 *   default, because what counts as collapsed is not a number the rig carries.
 * - **the jumps** — the steps where the scale factor the constraint applies,
 *   `1 + scaleOffset · mix · scaleX`, moves by more than 1 from one step to
 *   the next: by more than the bone's own setup scale, since the factor is 1
 *   at the setup pose and multiplies whatever scale the bone already has.
 *   That threshold is the card's, and it is the setup scale — not a choice.
 *
 * The walk is the whirl's (*The walk*, above): the setup pose with every
 * physics state reset, then steps of `1 / WHIRL_HZ` to the duration, posed by
 * rigc's core — the walk #1422 traced on spine-core (CO56's recipe), so the
 * steps named are the steps a player draws. The reading hooks the core's
 * per-constraint step, reads the state the step is about to divide with, and
 * calls `stepPhysics` itself, unchanged, so what it reads is what poses.
 *
 * ⚠️ **The world matrix, not the parent's local scale.** Physics moves the
 * world matrix and never a bone's local transform, so a parent's local
 * `scaleX` stays at its setup value through every collapse this card is
 * about, and a reading of it names nothing on #1422's chain (`LV03` plants
 * it).
 *
 * A reading, not a gate: it decides nothing, and `explain`'s exit is the same
 * whatever it prints.
 */
export interface LeverPlant {
  /**
   * `LV03`'s and `LV04`'s plants, a control's and never a caller's:
   * - `'parent-local-scale'` — the constrained bone's parent's local
   *   `scaleX` (setup and keys) in place of the lever's divisor;
   * - `'world-length'` — `length · |world x axis|` alone, the scaleX-only
   *   drive's `scaleLag · shown` left out, which is the card's own wording.
   */
  measure?: 'parent-local-scale' | 'world-length';
}

/** One constraint's lever over one animation's walk. */
export interface LeverRead {
  constraint: string;
  bone: string;
  /** The divisor the lever would take at the setup pose — `length · |world x axis|` there; `null` when not read (`why`). */
  setup: number | null;
  /** Every step whose lever divided by less than `fraction` × `setup`, ascending: the least divisor on it, and the world x-axis length the lever read there as a share of the setup pose's. */
  folds: LeverCollapse[];
  /** The least of those divisors — the earliest on a tie; `null` when there is none. */
  least: LeverCollapse | null;
  /** Every step whose applied scale factor moved by more than 1, ascending: the offset before and after, and the factor's move. */
  jumps: LeverJump[];
  /** The largest of those moves — the earliest on a tie; `null` when there is none. */
  largest: LeverJump | null;
  /** Why the constraint was not read; `null` when it was. */
  why: string | null;
}

/** One step a lever divided by a collapsed divisor: the step, its time, the divisor and the world x axis as a share of the setup pose's. */
export interface LeverCollapse {
  step: number;
  time: number;
  divisor: number;
  world: number;
}

/** One step a scale factor moved by more than its setup scale: the step, its time, the offset before and after, and the factor's move. */
export interface LeverJump {
  step: number;
  time: number;
  from: number;
  to: number;
  size: number;
}

/** One animation's walk and its scaleX constraints' levers. */
export interface LeverAnimation {
  animation: string;
  steps: number;
  reads: LeverRead[];
  refused: string | null;
}

/** The whole reading: the fraction it was taken at, the constraints with nothing to read, and each animation's walk. */
export interface LeverReading {
  fraction: number;
  /** Physics constraints that drive no `scaleX`, in declaration order — no lever of theirs divides by a length. */
  unread: string[];
  animations: LeverAnimation[];
}

/** What the reading's hook saw of one constraint on one pose. */
interface LeverSeen {
  /** The least divisor a lever divided by on the pose, with the world x-axis length it read there; `null` when none divided. */
  divided: { divisor: number; world: number } | null;
  /** `length · |world x axis|` as the pose's first step was handed it — the setup pose's is the reference. */
  handed: number;
  /** The world x-axis length the pose's first step was handed. */
  world: number;
  /** The scale offset after the pose's last step. */
  offset: number;
  /** `mix · scaleX` as posed: what one unit of offset moves the applied factor by. */
  weight: number;
}

/** A fraction `--lever-fold` can state — finite, above 0 and at most 1 — or the sentence refusing it. */
export function leverFractionWhy(value: number): string | null {
  return Number.isFinite(value) && value > 0 && value <= 1 ? null : `${String(value)} is not a fraction above 0 and at most 1`;
}

/**
 * Every animation of `doc` walked as the whirl walks it, and each scaleX
 * constraint's collapsed divisions and jumps (the header above). `fraction`
 * is the caller's stated threshold; a value `leverFractionWhy` refuses is
 * refused here too, by name.
 */
export function leverReading(doc: CompiledDocument, fraction: number, plant: LeverPlant = {}): LeverReading {
  const bad = leverFractionWhy(fraction);
  if (bad !== null) throw new CoreInputError(`the lever reading's fraction: ${bad}`);
  const view = underNoSkin(doc);
  const all = physicsBones(view);
  const drivesScale = new Set<string>();
  for (const c of view.constraints) if (c.record?.kind === 'physics' && c.record.scaleX > 0) drivesScale.add(c.record.name);
  const constraints = all.filter((c) => drivesScale.has(c.name));
  const out: LeverReading = { fraction, unread: all.filter((c) => !drivesScale.has(c.name)).map((c) => c.name), animations: [] };
  if (constraints.length === 0) return out;
  const bones = new Map(view.bones.map((b) => [b.name, b] as const));
  for (const animation of view.animations) {
    const steps = whirlSteps(animation.timelines.duration);
    const fresh = (why: string | null): LeverRead[] => constraints.map((c) => ({ constraint: c.name, bone: c.bone, setup: null, folds: [], least: null, jumps: [], largest: null, why }));
    // A slider's table is posed at a value, not in time — the whirl's rule, for the same reason.
    const sliders = view.constraints.filter((c) => c.kind === 'slider' && c.animation === animation.name).map((c) => `"${c.name}"`);
    if (sliders.length > 0) {
      out.animations.push({ animation: animation.name, steps: 0, refused: null, reads: fresh(`slider ${sliders.join(', ')} applies it at a value, not in time, so there is no step to read — the animation that moves the slider's value is walked instead`) });
      continue;
    }
    // The plant's figure, set per pose as it is visited: the parent's local |scaleX| as the animation poses it then.
    let locals: Map<string, number> | null = null;
    const local = (bone: string): number => {
      const parent = bones.get(bone)?.parent;
      return parent === undefined || locals === null ? Number.NaN : (locals.get(parent) ?? Number.NaN);
    };
    // What the hook saw on the pose being made, by constraint; emptied as each pose is visited.
    let seen = new Map<string, LeverSeen>();
    const hook: PhysicsStepper = (r, w, length, ctx) => {
      const s = ctx.states.get(r.name);
      const world = Math.sqrt(w.a * w.a + w.c * w.c);
      const product = length * world;
      // `rr` as the step is about to form it (the header's *The mechanism*): read off the state before the step moves it.
      const lagged = r.rotate > 0 || r.shearX > 0 || plant.measure === 'world-length' || s === undefined ? 0 : s.scaleLag * Math.max(0, 1 - s.remaining / r.step);
      const divides = ctx.phase !== 'reset' && s !== undefined && !s.pending && r.mix !== 0 && r.inertia !== 0;
      const divisor = plant.measure === 'parent-local-scale' ? length * local(r.bone) : product - lagged;
      const moved = stepPhysics(r, w, length, ctx);
      const before = seen.get(r.name);
      const earlier = before?.divided ?? null;
      const divided = !divides || !(divisor > 0) ? earlier : earlier === null || divisor < earlier.divisor ? { divisor, world } : earlier;
      const handed = plant.measure === 'parent-local-scale' ? length * local(r.bone) : product;
      seen.set(r.name, { divided, handed: before?.handed ?? handed, world: before?.world ?? world, offset: ctx.states.get(r.name)?.scaleOffset ?? 0, weight: r.mix * r.scaleX });
      return moved;
    };
    const reads = fresh(null);
    const setupWorld = constraints.map((): number => Number.NaN);
    const last = constraints.map((): number | null => null);
    const lost = constraints.map((): { step: number; time: number } | null => null);
    const localsAt = (time: number): Map<string, number> => new Map(posedBones(view, animation.timelines, time).map((b) => [b.name, Math.abs(b.scaleX ?? 1)] as const));
    if (plant.measure === 'parent-local-scale') locals = localsAt(0);
    let refused: string | null = null;
    try {
      poseRawAnimationEach(view, animation.name, new Array<number>(steps).fill(1 / WHIRL_HZ), { physicsStep: hook }, 'setup', (pose, index) => {
        for (let i = 0; i < constraints.length; i++) {
          const s = seen.get(constraints[i].name);
          if (s === undefined || lost[i] !== null) continue;
          const r = reads[i];
          if (index === 0) {
            r.setup = s.handed;
            setupWorld[i] = s.world;
            last[i] = s.offset;
            continue;
          }
          if ((s.divided !== null && !Number.isFinite(s.divided.divisor)) || !Number.isFinite(s.world) || !Number.isFinite(s.offset)) {
            lost[i] = { step: index, time: pose.trackTime };
            continue;
          }
          if (s.divided !== null && r.setup !== null && s.divided.divisor < fraction * r.setup) {
            const collapse = { step: index, time: pose.trackTime, divisor: s.divided.divisor, world: s.divided.world / setupWorld[i] };
            r.folds.push(collapse);
            if (r.least === null || collapse.divisor < r.least.divisor) r.least = collapse;
          }
          const from = last[i];
          if (from !== null) {
            const size = Math.abs(s.offset - from) * s.weight;
            if (size > 1) {
              const jump = { step: index, time: pose.trackTime, from, to: s.offset, size };
              r.jumps.push(jump);
              if (r.largest === null || size > r.largest.size) r.largest = jump;
            }
          }
          last[i] = s.offset;
        }
        seen = new Map();
        // The next pose's steps read the parent's local scale at the time that pose is applied at.
        if (plant.measure === 'parent-local-scale') locals = localsAt(Math.min(pose.trackTime + 1 / WHIRL_HZ, animation.timelines.duration));
      });
    } catch (err) {
      if (!(err instanceof CoreInputError)) throw err;
      refused = err.message;
    }
    for (let i = 0; i < constraints.length; i++) {
      const r = reads[i];
      const gone = lost[i];
      const why =
        refused !== null
          ? `the core refused to pose the walk — ${refused}`
          : !constraints[i].steps
            ? 'skin-required, and a skeleton with no skin set does not step it'
            : r.setup === null
              ? 'its constraint was not stepped at the setup pose, so there is no setup divisor to compare with'
              : !(r.setup > 0 && Number.isFinite(r.setup))
                ? `its setup divisor (length × world x axis) is ${String(r.setup)}, so no fraction of it is a divisor a step can fall below`
                : gone !== null
                  ? `its lever's divisor, its world x axis or its scale offset is not a number from step ${gone.step} (t=${gone.time.toFixed(4)}s)`
                  : null;
      // A reading that stopped is not read at all, rather than the steps it reached before it stopped (the whirl's `WH04`, for the same silence).
      if (why !== null) Object.assign(r, { folds: [], least: null, jumps: [], largest: null, why });
    }
    out.animations.push({ animation: animation.name, steps, refused, reads });
  }
  return out;
}

/** The header line `explain` prints above the lever reading, with the fraction it was taken at. */
export function leverHeader(fraction: number): string {
  return (
    `lever under ${String(fraction)}× setup  (a reading, never a gate: the turn lines' walk; for each physics constraint that drives scaleX, ` +
    `the steps its inertia lever divides by less than ${String(fraction)}× the divisor it takes at the setup pose — length × world x axis, ` +
    "less scaleLag × shown on a drive that does not rotate — and the steps the scale factor it applies moves by more than the bone's setup scale)"
  );
}

/** A figure as the lines print it: four significant figures. */
const fig = (v: number): string => v.toPrecision(4);

/** The printed lines: the constraints with nothing to read, then per animation and scaleX constraint one line, or two when it both collapses and jumps. */
export function leverLines(reading: LeverReading): string[] {
  const lines: string[] = [];
  if (reading.unread.length > 0) {
    const one = reading.unread.length === 1;
    lines.push(`physics ${reading.unread.map((n) => `"${n}"`).join(', ')} drive${one ? 's' : ''} no scaleX, so no inertia lever of ${one ? 'its' : 'theirs'} divides by a length — not read`);
  }
  for (const a of reading.animations) {
    for (const r of a.reads) {
      const head = `${JSON.stringify(a.animation)}: physics "${r.constraint}" (bone "${r.bone}")`;
      if (r.why !== null || r.setup === null) {
        lines.push(`${head} not read — ${r.why ?? 'no setup divisor'}`);
        continue;
      }
      if (r.least === null && r.largest === null) {
        lines.push(`${head} reads nothing in ${a.steps} step(s): no lever divides by less than ${String(reading.fraction)}× its setup divisor ${fig(r.setup)}, and no step moves its scale factor by its setup scale`);
        continue;
      }
      if (r.least !== null) {
        lines.push(
          `${head} lever divides by less than ${String(reading.fraction)}× its setup divisor ${fig(r.setup)} on ${r.folds.length} of ${a.steps} step(s) [${indexRuns(r.folds.map((f) => f.step))}] — ` +
            `least ${fig(r.least.divisor)} (${fig(r.least.divisor / r.setup)}× setup; world x axis ${fig(r.least.world)}× setup) at step ${r.least.step} (t=${r.least.time.toFixed(4)}s)`,
        );
      }
      if (r.largest !== null) {
        lines.push(
          `${head} scale factor moves by more than its setup scale in one step on ${r.jumps.length} of ${a.steps} step(s) [${indexRuns(r.jumps.map((j) => j.step))}] — ` +
            `largest ${fig(r.largest.size)}, scale offset ${fig(r.largest.from)} → ${fig(r.largest.to)} at step ${r.largest.step} (t=${r.largest.time.toFixed(4)}s)`,
        );
      }
    }
  }
  return lines;
}
