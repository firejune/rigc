/**
 * How far each physics constraint's bone turns in one step — the whirl
 * reading `rigc explain` prints under its physics block (issue #1423).
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
import { type CompiledDocument, CoreInputError, underNoSkin } from './core/index.ts';
import { poseRawAnimationEach, type RawBone, type RawReset } from './core/raw.ts';

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
