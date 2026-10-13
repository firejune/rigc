/**
 * The world a render's physics answers, in time — `rigc render --environment`
 * (issue #1416, part C).
 *
 * A rig's physics constraints state how much each one answers wind and
 * gravity (their own `wind` and `gravity`, AUTHORING §4.6). The world they
 * answer is the consumer's: the two direction vectors spine-core keeps on its
 * `Skeleton` (`windX, windY`, `gravityX, gravityY`), which a live track sets
 * with `setEnvironment` (`./core/track.ts`). A render has no consumer, so this
 * file is one: a list of steps in time, each changing the world from its `t`
 * until the next, which both render posers set before the step that poses each
 * frame (`src/render_core.ts`, `src/render.ts`).
 *
 * ⭐ It inspects what the rig offers; it does not compose a scene. Which gust
 * blows when is the consumer's, and a schedule here is a probe of the response
 * — the same probe on both posers, so the export's answer to it is held to the
 * core's (the render-environment suite).
 *
 * The coordinates are the runtime's own and the live track's: x to the right,
 * **y down** (a positive y pulls toward the bottom of the screen, as the
 * runtime's initial gravity `[0, 1]` does). Until the first step the world is
 * the runtime's initial one, wind `[1, 0]` and gravity `[0, 1]`, which is what a
 * render without the flag answers — so a calm start has to be stated.
 *
 * Nothing here links spine-core, and nothing here reads a clock: the schedule
 * is resolved onto a frame grid by arithmetic on the frame index alone.
 */
import type { PhysicsEnvironment } from './core/constraints_physics.ts';

/** The tag a schedule file states, refused by name when it states another. */
export const ENVIRONMENT_SPEC = 'rigc-environment/1';

/** One pose's change to the world: either half, the other kept as it stands. */
export type EnvironmentChange = Partial<PhysicsEnvironment>;

/** One step of a schedule: from `t` seconds on, until the next step, the world is changed by `wind` and/or `gravity`. */
export interface EnvironmentStep {
  t: number;
  wind?: [number, number];
  gravity?: [number, number];
}

/** A schedule refused — by entry index, field, the value found and what is required. */
export class EnvironmentError extends Error {}

const TOP_KEYS = ['spec', 'steps'] as const;
const STEP_KEYS = ['t', 'wind', 'gravity'] as const;
const PAIR = 'a pair of finite numbers [x, y] (x to the right, y down)';

/** A value as a refusal shows it: JSON, except that a number that is not finite is written as itself rather than as `null`. */
function shown(value: unknown): string {
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `[${value.map(shown).join(', ')}]`;
  if (value === undefined) return 'nothing';
  return JSON.stringify(value);
}

/** What a value is, for the refusal of a file or an entry that is not an object. */
function kindOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return `${typeof value === 'object' ? 'an' : 'a'} ${typeof value} ${typeof value === 'object' ? '' : shown(value)}`.trimEnd();
}

/**
 * A schedule file's text read, or refused by name before anything is posed.
 * `where` is how the refusal names the file. Every step is returned with its
 * keys in one order — `t`, `wind`, `gravity` — whatever order the file wrote
 * them in, so what a render records of it does not depend on the spelling.
 */
export function readEnvironmentSchedule(text: string, where: string): EnvironmentStep[] {
  const refuse = (what: string): EnvironmentError => new EnvironmentError(`--environment ${where}: ${what}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw refuse(`not JSON — ${(err as Error).message}`);
  }
  const shape = `{ "spec": "${ENVIRONMENT_SPEC}", "steps": [{ "t": <seconds>, "wind"?: [x, y], "gravity"?: [x, y] }, …] }`;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw refuse(`the file holds ${kindOf(parsed)}, not an object ${shape}`);
  const top = parsed as Record<string, unknown>;
  for (const key of Object.keys(top)) {
    if (!(TOP_KEYS as readonly string[]).includes(key)) throw refuse(`the file names "${key}", which is not one of [${TOP_KEYS.join(', ')}]`);
  }
  if (top.spec !== ENVIRONMENT_SPEC) throw refuse(`"spec" is ${shown(top.spec)}; render reads "${ENVIRONMENT_SPEC}"`);
  const steps = top.steps;
  if (!Array.isArray(steps) || steps.length === 0) throw refuse(`"steps" is ${shown(steps)}, not a non-empty array of { "t": <seconds>, "wind"?: [x, y], "gravity"?: [x, y] }`);
  const out: EnvironmentStep[] = [];
  steps.forEach((entry: unknown, i) => {
    const at = `entry ${i} of "steps"`;
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) throw refuse(`${at} is ${kindOf(entry)}, not an object { "t": <seconds>, "wind"?: [x, y], "gravity"?: [x, y] }`);
    const given = entry as Record<string, unknown>;
    for (const key of Object.keys(given)) {
      if (!(STEP_KEYS as readonly string[]).includes(key)) throw refuse(`${at} names "${key}", which is not one of [${STEP_KEYS.join(', ')}]`);
    }
    const t = given.t;
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) throw refuse(`${at}'s "t" is ${shown(t)}, not a finite time in seconds at or above 0`);
    const previous = out[i - 1];
    if (previous !== undefined && !(t > previous.t)) {
      throw refuse(`${at}'s "t" is ${shown(t)}, not after entry ${i - 1}'s ${shown(previous.t)} — steps are listed in ascending time, each holding until the next`);
    }
    const pair = (key: 'wind' | 'gravity'): [number, number] | undefined => {
      const v = given[key];
      if (v === undefined) return undefined;
      if (!Array.isArray(v) || v.length !== 2 || v.some((n) => typeof n !== 'number' || !Number.isFinite(n))) throw refuse(`${at}'s "${key}" is ${shown(v)}, not ${PAIR}`);
      return [v[0] as number, v[1] as number];
    };
    const wind = pair('wind');
    const gravity = pair('gravity');
    if (wind === undefined && gravity === undefined) throw refuse(`${at} (t ${shown(t)}) states neither "wind" nor "gravity", so it changes nothing`);
    out.push({ t, ...(wind === undefined ? {} : { wind }), ...(gravity === undefined ? {} : { gravity }) });
  });
  return out;
}

/**
 * The frame a step at `t` seconds is first posed on at `fps`: the first frame
 * `i` whose time `i / fps` is at or after `t`. Its change is set before the
 * step that poses that frame, so the physics integrates the new world over the
 * frame's whole interval. Exact for the predicate as written: `i / fps` is the
 * division correctly rounded, so a `t` that names a frame's time lands on it.
 */
export function environmentFrame(t: number, fps: number): number {
  let i = Math.max(0, Math.ceil(t * fps));
  while (i > 0 && (i - 1) / fps >= t) i--;
  while (i / fps < t) i++;
  return i;
}

/**
 * A schedule on the frame grid of `fps`: each frame's change, or `undefined`.
 * Steps landing on one frame are merged in order, a later half over an
 * earlier — which only the framing meets (`FRAMING_FPS`), since `render`
 * refuses a schedule two of whose steps share a frame of its own grid
 * (`environmentCollisions`).
 */
export function environmentAt(steps: readonly EnvironmentStep[], fps: number): (index: number) => EnvironmentChange | undefined {
  const byFrame = new Map<number, EnvironmentChange>();
  for (const step of steps) {
    const frame = environmentFrame(step.t, fps);
    const before = byFrame.get(frame) ?? {};
    byFrame.set(frame, { ...before, ...(step.wind === undefined ? {} : { wind: step.wind }), ...(step.gravity === undefined ? {} : { gravity: step.gravity }) });
  }
  return (index) => byFrame.get(index);
}

/** The steps that share a frame of the `fps` grid, by frame — each group's first step would never be posed. */
export function environmentCollisions(steps: readonly EnvironmentStep[], fps: number): Array<{ frame: number; entries: number[] }> {
  const groups = new Map<number, number[]>();
  steps.forEach((step, i) => {
    const frame = environmentFrame(step.t, fps);
    groups.set(frame, [...(groups.get(frame) ?? []), i]);
  });
  return [...groups].filter(([, entries]) => entries.length > 1).map(([frame, entries]) => ({ frame, entries }));
}

/**
 * Which physics constraints of a Spine 4.3 skeleton answer each half of the
 * world: `declared` every physics constraint by name; `wind` and `gravity` the
 * ones stating a non-zero `wind` or `gravity` (the runtime reads an absent one
 * as 0) and, as `"<constraint>" keyed by "<animation>"`, every physics
 * timeline keying that field (`""` keys every constraint). Read off the
 * skeleton's JSON as plain JSON, the same text both posers pose.
 */
export interface EnvironmentResponse {
  declared: string[];
  wind: string[];
  gravity: string[];
}

function objectOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function environmentResponse(skeletonText: string): EnvironmentResponse {
  const root = objectOf(JSON.parse(skeletonText));
  const constraints = Array.isArray(root.constraints) ? root.constraints.map(objectOf).filter((c) => c.type === 'physics') : [];
  const declared = constraints.map((c) => String(c.name));
  const out: EnvironmentResponse = { declared, wind: [], gravity: [] };
  for (const half of ['wind', 'gravity'] as const) {
    for (const c of constraints) {
      const v = c[half];
      if (typeof v === 'number' && v !== 0) out[half].push(`"${String(c.name)}" (${half} ${v})`);
    }
    for (const [animation, body] of Object.entries(objectOf(root.animations))) {
      for (const [target, timelines] of Object.entries(objectOf(objectOf(body).physics))) {
        const keys = objectOf(timelines)[half];
        if (Array.isArray(keys) && keys.length > 0) out[half].push(`${target === '' ? 'every constraint' : `"${target}"`} keyed by "${animation}"`);
      }
    }
  }
  return out;
}
