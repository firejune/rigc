/**
 * The core's raw entry (issue #966, step 3b of issue #380): one pose, or one
 * animation walked at the caller's own steps, returned as the doubles the
 * core computed — no grid — with everything a renderer or a deform measurer
 * reads past the oracle's rows: each bone's world rotation and scale
 * readings, each drawn attachment's local UVs, triangles, hull, sequence
 * frame and colour, the clip polygons, the triangles drawn under a clip, and
 * the events fired.
 *
 * The oracle's document (`tools/pose_oracle.ts`) samples an animation on a
 * phase grid, re-applying it from the setup pose at every sample; the two
 * consumers step instead. `src/render.ts` resets a track at 0 and then takes
 * exactly one step of `1/fps` per frame; `src/deformmeasure.ts` resets and
 * takes one step of `time`. So the entry takes a list of steps rather than a
 * list of times, and this header states what one step is, as measured.
 *
 * ## One step — the walk, measured
 *
 * Measured against spine-core 4.3.13 running `src/render.ts`'s recipe
 * (`AnimationState` with one non-looping track: frame 0 `apply`,
 * `Skeleton.update(0)`, `updateWorldTransform(Physics.reset)`; every later
 * frame `AnimationState.update(dt)`, `apply`, `Skeleton.update(dt)`,
 * `updateWorldTransform(Physics.update)`), read off `TrackEntry.trackTime`,
 * `TrackEntry.getAnimationTime()` and every bone's `appliedPose` in full
 * doubles (the PR of issue #966 carries the table):
 *
 * - **The track time is the running sum of the steps**, `T += dt` in double,
 *   not `i·dt`, and the animation is applied at the sum. Over every
 *   animation of the nineteen tree rows `TrackEntry.trackTime` equalled the
 *   running sum on 2,612 of 2,612 frames at 12 fps (12,850 of 12,850 at 60,
 *   5,173 of 5,173 at 24) and `i·dt` on only 662 (1,168; 810): at 12 fps
 *   frame 6 reads `0.49999999999999994`, not `0.5`, and frame 10
 *   `0.8333333333333334`, not `0.8333333333333333`. `src/render.ts` files a
 *   frame under `i·dt`, which is its label and not the time posed.
 * - **A non-looping track holds at its duration**: the animation time is
 *   `min(T, duration)`, where `duration` is the runtime's (the last key of
 *   every timeline, as float32 — `CoreAnimationTimelines.duration`). With
 *   `round(duration·fps)` frames the last one overshoots on 20 animation
 *   frames of the 2,612 at 12 fps (19 at 60, 25 at 24), and
 *   `getAnimationTime()` read the duration on every one of them.
 * - **The physics clock moves by the step itself**, `time += dt` (the
 *   skeleton's `update`), and a physics constraint integrates the time it
 *   moved (`./constraints_physics.ts`). Pose 0 is the reset, every physics
 *   state reset there (where, below).
 * - **Events fire over `(previous animation time, animation time]`**, the
 *   first step's interval opening at −1 — so held past the duration, a step
 *   fires nothing. Measured against `AnimationState`'s event listener on
 *   every frame above.
 * - **Where the reset is taken is the caller's** (`RawReset`): render's
 *   frame 0 applies the animation at 0 and resets there (`animation`);
 *   deformmeasure's `poseAt` resets at the setup pose and then applies the
 *   animation in its one step (`setup`). On a physics rig the two differ by
 *   whole units, not bits: of the 162 one-jump poses (three per animation),
 *   12 read off under `animation` — six on `7-anticipation`'s physics rig (a
 *   cape bone 1.7° off at 0.617 s) and six on `gallery/look`'s — and none
 *   under `setup`.
 *
 * Every step poses the animation from the setup pose at its animation time
 * (the setup blend at alpha 1), as the oracle's stepped dump does, applied
 * from the animation time of the step before (−1 before the first): a
 * physics `reset` key fires on the step that crosses it, once. Until issue
 * #960 this walk fired such a key at every step from it on (the oracle's
 * reading then), and against the recipe above a probe with a key at 0.5
 * read 32 of 61 frames bit-exact at 60 fps, the rest off by up to 53 units;
 * with the key crossed once, 61 of 61 at 60 fps and 13 of 13 at 12. None of
 * the nineteen tree rows keys a `reset`, which is why the raw gate never
 * saw it. The one difference from `--physics step` is where the steps fall,
 * which is the caller's.
 *
 * ## What a pose carries
 *
 * - `bones` — the world matrix and origin, and the four readings the
 *   runtime's getters give: `rotationX = atan2(c, a)·DEG`, `rotationY =
 *   atan2(d, b)·DEG`, `scaleX = √(a² + c²)`, `scaleY = √(b² + d²)`, with
 *   `DEG = 180 / π` at the runtime's π (`RUNTIME_DEG` in `./world.ts`) —
 *   measured bit-exact against `BonePose.getWorldRotationX/Y` and
 *   `getWorldScaleX/Y` on every bone of 2,793 poses of the nineteen tree
 *   rows (the setup, every 12 fps frame, three jumps per animation).
 * - `slots` — the oracle's slot row as doubles (`posedSlots`).
 * - `drawn` — every region and mesh a slot shows, in draw order: its world
 *   vertices (the oracle's `attachments` row as doubles), its LOCAL UVs as the
 *   runtime holds them (a region's unit corners `0 1, 0 0, 1 0, 1 1` in the
 *   corner order; a mesh's `uvs` — a linked mesh's source's — as the
 *   document spells them: `MeshAttachment.regionUVs` read the doubles, not
 *   their float32, on every mesh of the nineteen rows — `6-arcs`'
 *   `2.554152e-7` where `Math.fround` gives `2.5541518766658555e-7`), its
 *   triangles (a region's `0 1 2 2
 *   3 0`), its hull (a mesh's; `null` for a region), its sequence frame (the
 *   frame a sequence timeline set, else the series' setup frame, else 0 —
 *   the runtime gives every region and mesh a series, one frame long when
 *   the record states none, and `Sequence.resolveIndex` read 0 on every such
 *   attachment of the nineteen rows) and its own colour (the record's `color`, white
 *   unstated) — so the caller forms the tint, slot colour times attachment
 *   colour, itself. Where a region sits on a page is not the model's
 *   (`ModelAtlasRect`'s 🔸); the page UVs are issue #967's.
 * - `clips`, `clipped` — the oracle's rows as doubles; `clipped` is what the
 *   core DRAWS, which is the oracle's block wherever the core poses it and,
 *   under a clip that is not strictly convex or is inverse (a block the core
 *   leaves out), the core's own convex decomposition (`clipThrough` in
 *   `./clipping.ts`, issue #964), held to spine-core by the render's pixels.
 * - `events` — the oracle's event rows as doubles.
 *
 * 🔁 **A second walk shares this one** (issue #1025, cut 4c-5a): A10's
 * LOOPING walk, which keeps a non-finite value rather than refusing it, is
 * `./walk.ts`; both are `walkIn` below in a `WalkMode`, and every difference
 * is a branch on the mode — so this entry's walk is the one it was, and the
 * raw gate's lines did not move.
 *
 * ⛔ **Nothing is posed that the core would leave out.** Where the oracle's
 * core dump names a block absent — a constraint the core cannot pose
 * exactly, skins disagreeing over a placeholder under the merged view, a
 * region with no atlas rectangle — the raw entry refuses the whole call,
 * naming why (`CoreInputError`): a renderer handed a pose with a block
 * missing would draw a different picture in silence.
 */
import { activeBones, CoreInputError, drawWalkOf, poseSetup, rawNumber, readColour, shownAttachment, sourceOfDoc, type CompiledDocument, type CorePlant, type CoreSlotRow } from './index.ts';
import { posedBoneWorld, posedSlots, type TimelinePlant } from './animation.ts';
import { constraintsAbsentWhy, pathAnimationsWhy } from './constraints.ts';
import { freshStepContext, steppedPreviousPassWhy } from './constraints_physics.ts';
import { attachmentStates } from './deform.ts';
import { drawOrderAt } from './draw_order.ts';
import { eventsFired } from './events.ts';
import { REGION_TRIANGLES, REGION_UVS } from './clipping.ts';
import { poseGeometry, type ShownGeometry } from './vertices.ts';
import { RUNTIME_DEG, type CoreWorld } from './world.ts';
import type { SliderApplication } from './constraints_slider.ts';

/** One bone, posed: the world transform and the runtime getters' four readings (the header's `bones`). */
export interface RawBone {
  name: string;
  parent: string | null;
  active: boolean;
  a: number;
  b: number;
  c: number;
  d: number;
  worldX: number;
  worldY: number;
  rotationX: number;
  rotationY: number;
  scaleX: number;
  scaleY: number;
}

/** One region or mesh drawn, in draw order (the header's `drawn`). */
export interface RawDrawn {
  slot: string;
  attachment: string;
  kind: 'region' | 'mesh';
  vertices: number[];
  uvs: number[];
  triangles: number[];
  hull: number | null;
  sequenceIndex: number;
  colour: [number, number, number, number];
}

/** One clip polygon: `[slot, attachment, end, polygon]` as doubles. */
export type RawClip = [string, string, string | null, number[]];
/** One attachment drawn under a clip: `[slot, attachment, clipped, vertices, uvs, triangles]` as the clipper returns them. */
export type RawClipped = [string, string, 0 | 1, number[], number[], number[]];
/** One event fired: `[name, time, int, float, string]`. */
export type RawEvent = [string, number, number, number, string | null];

/**
 * Where a walk's physics is reset (the header's *One step*): `animation` —
 * the animation applied at 0 and the reset taken there (`src/render.ts`'s
 * frame 0); `setup` — the reset taken at the setup pose before the animation
 * is applied (`src/deformmeasure.ts`'s `poseAt`), pose 0 then the setup pose.
 */
export type RawReset = 'animation' | 'setup';

/** One pose — the setup's, or one step of an animation's walk. */
export interface RawPose {
  /** The track time (the running sum of the steps), 0 for the setup pose. */
  trackTime: number;
  /** The time the animation was applied at: the track time held at the duration. */
  animationTime: number;
  bones: RawBone[];
  slots: CoreSlotRow[];
  drawOrder: string[];
  drawn: RawDrawn[];
  clips: RawClip[];
  clipped: RawClipped[];
  events: RawEvent[];
  // --- #968 render: begin ---
  /**
   * What each slot shows, in draw order — the records `drawn` was posed from
   * (skin, placeholder, series frame, deform). `src/render_core.ts` resolves
   * each drawn attachment's atlas region and page UVs through it, with
   * `./uvs.ts`'s `drawnRegions` (issue #967's gated rule), rather than walking
   * which record a slot shows a second time.
   */
  shown: ShownGeometry[];
  // --- #968 render: end ---
}

// --- #968 render: begin ---
/** The shown records in `order`, the pose's draw order (a pose's `shown`). */
function drawOrderOf(shown: readonly ShownGeometry[], order: readonly string[]): ShownGeometry[] {
  const rank = new Map(order.map((n, r) => [n, r]));
  return [...shown].sort((a, b) => (rank.get(a.slot) ?? 0) - (rank.get(b.slot) ?? 0));
}
// --- #968 render: end ---

/** A double the entry computed: never `null`, since a non-finite pose is refused rather than passed on. */
function finite(v: number | null, what: string): number {
  if (v === null) throw new CoreInputError(`the raw pose computed a non-finite ${what}`);
  return v;
}

/**
 * How a walk treats the two things the raw entry and the looping walk
 * (`./walk.ts`, issue #1025) read differently: whether the track loops, and
 * whether a value that is not finite is kept in the pose or refuses the call.
 * The raw entry is `{ loop: false, keep: false }`, and that is its contract.
 */
export interface WalkMode {
  loop: boolean;
  keep: boolean;
  /** A plant only (the core suite's `CO26`): the animation time a looping step applies at, from its track time, the duration and the track time before it — `loopedTime` unless given. */
  time?: (trackTime: number, duration: number, before: number) => number;
  /** A plant only (`CO26`): what the physics clock moves by, from the step and how far the animation time moved — the step itself unless given. */
  clock?: (dt: number, moved: number) => number;
  /** A plant only (`CO26`): `false` fires no `reset` key across the wrap — the reading the walk was measured against and rejected. */
  wrapResets?: boolean;
}

/** The raw entry's mode: a track that holds at its duration, and a non-finite value refused. */
const RAW_MODE: WalkMode = { loop: false, keep: false };

/** What a kept walk writes a number as: the double itself, finite or not — so a NaN and an Infinity stay what they are. */
const keptNumber = (v: number): number => v;

/** The plant a walk in `mode` poses with: the raw entry's unrounded double, or under `keep` the number whatever it is. */
const roundPlant = (mode: WalkMode): CorePlant => ({ round: mode.keep ? keptNumber : rawNumber });

/** A double a kept walk computed, as it is; a raw walk's, refused when it is not finite (`finite`). */
function numberOf(v: number | null, what: string, mode: WalkMode): number {
  return mode.keep ? (v === null ? Number.NaN : v) : finite(v, what);
}

/** The bones of a pose from the world transforms (the header's `bones`). */
function rawBones(doc: CompiledDocument, world: ReadonlyMap<string, CoreWorld>): RawBone[] {
  const active = activeBones(doc);
  return doc.bones.map((b): RawBone => {
    const w = world.get(b.name);
    if (w === undefined) throw new CoreInputError(`bone "${b.name}" has no world transform`);
    return {
      name: b.name,
      parent: b.parent ?? null,
      active: active.has(b.name),
      a: w.a,
      b: w.b,
      c: w.c,
      d: w.d,
      worldX: w.worldX,
      worldY: w.worldY,
      rotationX: Math.atan2(w.c, w.a) * RUNTIME_DEG,
      rotationY: Math.atan2(w.d, w.b) * RUNTIME_DEG,
      scaleX: Math.sqrt(w.a * w.a + w.c * w.c),
      scaleY: Math.sqrt(w.b * w.b + w.d * w.d),
    };
  });
}

/** Every region and mesh the shown records draw, with what the renderer reads past the vertices (the header's `drawn`). */
function rawDrawn(doc: CompiledDocument, shown: readonly ShownGeometry[], world: ReadonlyMap<string, CoreWorld>, order: readonly string[], plant: CorePlant, mode: WalkMode = RAW_MODE): { drawn: RawDrawn[]; clips: RawClip[]; clipped: RawClipped[] } {
  const geometry = poseGeometry(shown, world, sourceOfDoc(doc), mode.keep ? keptNumber : rawNumber, { region: plant.region, vertices: plant.vertices }, drawWalkOf(doc, order, plant));
  if (geometry.attachments === null) throw new CoreInputError(`the raw pose leaves the attachments out: ${geometry.attachmentsWhy}`);
  // The drawn rows (issue #964): the oracle's `clipped` rows where it is posed, and a concave or inverse clip cut through the core's own decomposition.
  if (geometry.drawnClipped === null) throw new CoreInputError(`the raw pose leaves the clipped triangles out: ${geometry.drawnClippedWhy}`);
  // Under a concave or inverse clip the oracle's `clipped` block is absent (the runtime's own triangle list); what the core draws is `drawnClipped`,
  // its own decomposition, and the render samples each drawn triangle at its source triangle's affine UV, so the pixels are the decomposition's
  // coverage alone (issue #964, `Mesh.source` in src/render.ts).
  const rows = geometry.attachments;
  const drawn: RawDrawn[] = [];
  let k = 0;
  for (const s of shown) {
    const g = s.geometry;
    if (g.kind !== 'region' && g.kind !== 'mesh' && g.kind !== 'linkedmesh') continue;
    const row = rows[k++];
    if (row === undefined || row[0] !== s.slot) throw new CoreInputError(`slot "${s.slot}": the attachment rows are not in the shown records' order`);
    const record = doc.skins.find((x) => x.name === s.skin)?.attachments[s.slot]?.[s.placeholder];
    const colour = record?.color === undefined ? ([1, 1, 1, 1] as [number, number, number, number]) : readColour(record.color);
    let uvs: number[];
    let triangles: number[];
    let hull: number | null = null;
    if (g.kind === 'region') {
      uvs = [...REGION_UVS];
      triangles = [...REGION_TRIANGLES];
    } else {
      const source = g.kind === 'mesh' ? g : doc.skins.find((x) => x.name === g.skin)?.attachments[g.slot]?.[g.source]?.geometry;
      if (source === undefined || source.kind !== 'mesh') throw new CoreInputError(`slot "${s.slot}": the linked mesh's source carries no mesh`);
      uvs = [...source.uvs];
      triangles = [...source.triangles];
      hull = source.hull ?? null;
    }
    const sequenceIndex = s.frame ?? record?.sequenceSetup ?? 0;
    drawn.push({ slot: s.slot, attachment: row[1], kind: row[2], vertices: row[3].map((v) => numberOf(v, `vertex of slot "${s.slot}"`, mode)), uvs, triangles, hull, sequenceIndex, colour });
  }
  const clips = geometry.clips.map((c): RawClip => [c[0], c[1], c[2], c[3].map((v) => numberOf(v, `clip vertex of slot "${c[0]}"`, mode))]);
  const clipped = geometry.drawnClipped.map((c): RawClipped => [c[0], c[1], c[2], c[3].map((v) => numberOf(v, `clipped vertex of slot "${c[0]}"`, mode)), c[4].map((v) => numberOf(v, `clipped uv of slot "${c[0]}"`, mode)), c[5]]);
  return { drawn, clips, clipped };
}

/**
 * The setup pose as the renderer poses a skeleton with no animation — the
 * setup pose, every physics state reset — in full doubles. Refused by name
 * where the core leaves a block of it out.
 */
export function poseRawSetup(doc: CompiledDocument, plant: CorePlant = {}): RawPose {
  return setupPoseIn(doc, plant, RAW_MODE);
}

/** `poseRawSetup` in `mode` — under `keep`, a value that is not finite stays in the pose (`./walk.ts`). */
export function setupPoseIn(doc: CompiledDocument, plant: CorePlant, mode: WalkMode): RawPose {
  const posed = poseSetup(doc, { ...plant, ...roundPlant(mode) }, freshStepContext(plant.physicsStep));
  // `setup.clipped` is the oracle's block, left out under a concave or inverse clip whose triangle list is the runtime's own; what the core draws there is `rawDrawn`'s to refuse or pose (issue #964).
  const absent = posed.absent.filter(([block]) => block !== 'setup.clipped');
  if (absent.length > 0) throw new CoreInputError(`the raw setup pose leaves ${absent.map(([b, why]) => `${b} out (${why})`).join('; ')}`);
  const { setup, world, shown } = posed;
  if (world === null || shown === null || setup.slots === null || setup.drawOrder === null) throw new CoreInputError('the raw setup pose was not posed');
  const drawn = rawDrawn(doc, shown, world, setup.drawOrder, plant, mode);
  return { trackTime: 0, animationTime: 0, bones: rawBones(doc, world), slots: setup.slots, drawOrder: setup.drawOrder, ...drawn, events: [], shown: drawOrderOf(shown, setup.drawOrder) };
}

/**
 * One animation walked at the caller's steps (the header's *One step*): the
 * reset pose at 0, then one pose per step of `steps` — `steps.length + 1`
 * poses in all. `src/render.ts`'s walk is `count` steps of `1/fps`;
 * `src/deformmeasure.ts`'s is one step of `time`. A step must be a finite
 * time at or above 0; the animation must be the document's; a construct the
 * core would leave out refuses the call by name. `reset` is where the
 * physics is reset (`RawReset`): `animation` for render's walk, `setup` for
 * deformmeasure's one jump.
 */
export function poseRawAnimation(doc: CompiledDocument, animation: string, steps: readonly number[], plant: TimelinePlant = {}, reset: RawReset = 'animation'): RawPose[] {
  return walkIn(doc, animation, steps, plant, reset, RAW_MODE);
}

/**
 * The animation time a looping track applies its animation at (`./walk.ts`,
 * *The time*): the track time wrapped by the duration, and 0 over a duration
 * of 0.
 */
export function loopedTime(trackTime: number, duration: number): number {
  return duration === 0 ? 0 : trackTime % duration;
}

/**
 * `poseRawAnimation` in `mode`: the raw entry's walk, or the looping walk
 * `./walk.ts` documents — the animation time the track time wrapped by the
 * duration, every value kept whatever it is. Each difference is a branch on
 * `mode` here, so the raw entry's walk is the one it was.
 */
export function walkIn(doc: CompiledDocument, animation: string, steps: readonly number[], plant: TimelinePlant, reset: RawReset, mode: WalkMode): RawPose[] {
  const anim = doc.animations.find((a) => a.name === animation);
  if (anim === undefined) throw new CoreInputError(`animation "${animation}" is not one of this document's [${doc.animations.map((a) => a.name).join(', ')}]`);
  const bad = steps.findIndex((s) => !Number.isFinite(s) || s < 0);
  if (bad >= 0) throw new CoreInputError(`step ${bad} is ${steps[bad]}, not a finite time at or above 0`);
  const why = constraintsAbsentWhy(doc) ?? pathAnimationsWhy(doc) ?? steppedPreviousPassWhy(doc);
  if (why !== null) throw new CoreInputError(`the raw walk leaves the bones out: ${why}`);
  const raw: TimelinePlant = { ...plant, ...roundPlant(mode) };
  const resolve = plant.shown ?? shownAttachment;
  const duration = anim.timelines.duration;
  const ctx = freshStepContext(plant.physicsStep);
  if (mode.loop && mode.wrapResets !== false) ctx.loop = true;
  const poses: RawPose[] = [];
  let trackTime = 0;
  let last = -1;
  if (reset === 'setup') {
    // The reset taken at the setup pose, before the animation is applied (`src/deformmeasure.ts`'s `poseAt`): pose 0 is the setup pose.
    const setup = poseSetup(doc, { ...plant, ...roundPlant(mode) }, ctx);
    const absent = setup.absent.filter(([block]) => block !== 'setup.clipped');
    if (absent.length > 0) throw new CoreInputError(`the raw walk's reset pose leaves ${absent.map(([b, w]) => `${b} out (${w})`).join('; ')}`);
    if (setup.world === null || setup.shown === null || setup.setup.slots === null || setup.setup.drawOrder === null) throw new CoreInputError('the raw walk\'s reset pose was not posed');
    ctx.phase = 'update';
    poses.push({ trackTime: 0, animationTime: 0, bones: rawBones(doc, setup.world), slots: setup.setup.slots, drawOrder: setup.setup.drawOrder, ...rawDrawn(doc, setup.shown, setup.world, setup.setup.drawOrder, plant, mode), events: [], shown: drawOrderOf(setup.shown, setup.setup.drawOrder) });
  }
  for (let i = reset === 'setup' ? 1 : 0; i <= steps.length; i++) {
    const dt = i === 0 ? 0 : steps[i - 1];
    trackTime += dt;
    const t = mode.loop ? (mode.time ?? loopedTime)(trackTime, duration, trackTime - dt) : trackTime < duration ? trackTime : duration;
    const before = ctx.time;
    ctx.time += mode.clock === undefined ? dt : mode.clock(dt, t - (i === 0 ? 0 : Math.max(last, 0)));
    const sliders: SliderApplication[] = [];
    const posed = posedBoneWorld(doc, anim.timelines, t, raw, anim.constraints, sliders, { ctx, before });
    if (i === 0) ctx.phase = 'update';
    const placeholders = new Map<string, string | null>();
    const slots = posedSlots(doc, anim.timelines, t, raw, sliders, placeholders);
    if (slots.conflicts.length > 0) throw new CoreInputError(`the raw walk leaves the slots out: ${slots.conflicts.join('; ')}`);
    const evalOrder = plant.drawOrder ?? drawOrderAt;
    let order = evalOrder(doc.slots.length, anim.timelines.drawOrder, t) ?? doc.slots.map((_s, k) => k);
    for (const app of sliders) order = evalOrder(doc.slots.length, app.timelines.drawOrder, app.at) ?? order;
    const drawOrder = order.map((k) => doc.slots[k].name);
    const states = attachmentStates(doc, resolve, placeholders, { timelines: anim.timelines, t }, sliders, plant);
    if (states.why.length > 0) throw new CoreInputError(`the raw walk leaves the attachments out: ${states.why.join('; ')}`);
    const rank = new Map(drawOrder.map((n, r) => [n, r]));
    const shown = [...states.shown].sort((a, b) => (rank.get(a.slot) ?? 0) - (rank.get(b.slot) ?? 0));
    const drawn = rawDrawn(doc, shown, posed.world, drawOrder, plant, mode);
    // A looping walk fires no event here: what fires across the wrap was not measured, and the walk's one reader (A10) reads none.
    const events = mode.loop ? [] : (plant.events ?? eventsFired)(anim.timelines.events, last, t, rawNumber).map((e): RawEvent => [e[0], finite(e[1], 'event time'), e[2], finite(e[3], 'event float'), e[4]]);
    last = t;
    poses.push({ trackTime, animationTime: t, bones: rawBones(doc, posed.world), slots: slots.rows, drawOrder, ...drawn, events, shown });
  }
  return poses;
}
