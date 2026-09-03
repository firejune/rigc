/**
 * Emits `rigby.rig.json` and `rigby.motion.json`.
 *
 * The rig is the assembled figure — the setup pose IS the finished character,
 * which is what makes `assemble` authorable at all: its last keys are just
 * "every delta back to zero", and MOTION.md §3.6/§3.8's rule that the final key
 * carries the given end pose exactly falls out for free.
 *
 * Everything timing-shaped in here comes from MOTION.md §3 and is marked with
 * the section it came from. Nothing measures whether it worked — §0 of that
 * document is explicit that only an eye can (and there is a human at the end of
 * this task who is the one doing the judging).
 */
import { mkdirSync } from 'node:fs';
import { PLATE_W, PLATE_H, BAND_H } from '../art/layout';
import { BONES, SLOTS, solve, rot, type Delta, type Placement } from './skeleton';

const HERE = new URL('./', import.meta.url).pathname;
mkdirSync(HERE, { recursive: true });

const NAME = 'rigby';

// ---------------------------------------------------------------------------
// the rig spec
// ---------------------------------------------------------------------------

const skins: Record<string, Record<string, Record<string, unknown>>> = { default: {} };
for (const s of SLOTS) {
  const entry: Record<string, unknown> = { image: s.image };
  if (s.x !== undefined) entry.x = s.x;
  if (s.y !== undefined) entry.y = s.y;
  const placeholders: Record<string, unknown> = { [s.slot]: entry };
  for (const extra of s.also ?? []) {
    const e: Record<string, unknown> = { image: extra.image };
    if (extra.x !== undefined) e.x = extra.x;
    if (extra.y !== undefined) e.y = extra.y;
    placeholders[extra.name] = e;
  }
  skins.default[s.slot] = placeholders as Record<string, Record<string, unknown>>;
}

const rig = {
  spec: 'rigc-rig/1',
  name: NAME,
  images: 'parts',
  skeleton: { x: 0, y: 0, width: PLATE_W, height: PLATE_H },
  bones: BONES,
  // R4: this array IS the setup draw order, back to front.
  slots: SLOTS.map((s) => ({ name: s.slot, bone: s.bone, attachment: s.slot })),
  skins,
};

await Bun.write(`${HERE}${NAME}.rig.json`, `${JSON.stringify(rig, null, 2)}\n`);

// ---------------------------------------------------------------------------
// easings — MOTION.md §3.4: pick the table FIRST, then write every key against
// it. Four shapes: one that gathers, one that arrives slowly, one that stops
// dead, and one symmetric shape for the breath.
// ---------------------------------------------------------------------------

const EASINGS = {
  gather: [0.42, 0, 0.8, 0.36],
  charge: [0.1, 0.72, 0.34, 1],
  settle: [0.28, 0, 0.36, 1],
  breathe: [0.45, 0, 0.55, 1],
};

// ---------------------------------------------------------------------------
// the scatter pose — where each loose PNG lies before anything assembles
// ---------------------------------------------------------------------------

/** Where a part's IMAGE CENTRE lies on the stage, and how it is turned. */
interface Scatter {
  slot: string;
  cx: number;
  cy: number;
  rotation: number;
}

/**
 * Composed rather than randomised: the parts ring the space the figure will
 * occupy, the two biggest plates (head, torso) anchor the left, and the
 * bottom-left stays clear for the caption band the GIF draws there.
 */
const SCATTER: Scatter[] = [
  { slot: 'head', cx: 202, cy: 540, rotation: -13 },
  { slot: 'torso', cx: 390, cy: 330, rotation: 15 },
  { slot: 'eyes', cx: 620, cy: 730, rotation: 7 },
  { slot: 'ear_l', cx: 830, cy: 764, rotation: -30 },
  { slot: 'ear_r', cx: 1178, cy: 640, rotation: 36 },
  { slot: 'scarf_knot', cx: 1138, cy: 400, rotation: -17 },
  { slot: 'scarf_tail', cx: 900, cy: 280, rotation: 11 },
  { slot: 'arm_b', cx: 660, cy: 500, rotation: 84 },
  { slot: 'arm_f', cx: 790, cy: 610, rotation: -62 },
  { slot: 'hand_f', cx: 380, cy: 750, rotation: 24 },
  { slot: 'leg_l', cx: 300, cy: 250, rotation: -32 },
  { slot: 'leg_r', cx: 500, cy: 300, rotation: 48 },
];

/** slot → the bone its attachment rides, and that attachment's offset. */
const attach = new Map(SLOTS.map((s) => [s.slot, s]));

/**
 * The scatter pose, as a per-bone delta against setup.
 *
 * Solved root-to-leaf, because a bone's local offset is expressed in its
 * PARENT's axes and the parent is scattered too. `hip`, `torso`'s spine chain
 * and `root` carry no scatter of their own, so their scattered world is just
 * forward kinematics from an unmoved parent — which is exactly what `solve`
 * does when a delta is absent.
 */
function solveScatter(): { deltas: Record<string, Delta>; world: Record<string, Placement> } {
  const want = new Map<string, Placement>();
  for (const s of SCATTER) {
    const a = attach.get(s.slot);
    if (a === undefined) throw new Error(`scatter names no slot "${s.slot}"`);
    // The bone sits where the image centre is, minus the attachment offset
    // turned into the bone's own (rotated) axes.
    const [ox, oy] = rot(a.x ?? 0, a.y ?? 0, s.rotation);
    want.set(a.bone, { x: s.cx - ox, y: s.cy - oy, rotation: s.rotation });
  }

  const deltas: Record<string, Delta> = {};
  const world: Record<string, Placement> = {};
  const byName = new Map(BONES.map((b) => [b.name, b]));
  for (const bone of BONES) {
    const target = want.get(bone.name);
    if (bone.parent === undefined) {
      world[bone.name] = { x: bone.x ?? 0, y: bone.y ?? 0, rotation: bone.rotation ?? 0 };
      continue;
    }
    const p = world[bone.parent];
    if (target === undefined) {
      const [dx, dy] = rot(bone.x ?? 0, bone.y ?? 0, p.rotation);
      world[bone.name] = {
        x: p.x + dx,
        y: p.y + dy,
        rotation: p.rotation + (bone.rotation ?? 0),
      };
      continue;
    }
    const [lx, ly] = rot(target.x - p.x, target.y - p.y, -p.rotation);
    const def = byName.get(bone.name)!;
    deltas[bone.name] = {
      tx: lx - (def.x ?? 0),
      ty: ly - (def.y ?? 0),
      rot: target.rotation - p.rotation - (def.rotation ?? 0),
    };
    world[bone.name] = target;
  }
  return { deltas, world };
}

const scatter = solveScatter();

// ---------------------------------------------------------------------------
// `assemble` — MOTION.md §3, applied
// ---------------------------------------------------------------------------

/** Proposed, per §3.3: twelve staggered arrivals do not fit a single-move band. */
const ASSEMBLE = 1.9;

/**
 * The overlap table, as fractions of the whole movement (§3.7).
 *
 * `hold` is when a part gives up lying still; `land` is when it reaches its
 * extreme; `settle` is derived from the two.
 *
 * 🚨 The ORDER here is forced by the hierarchy, and getting it backwards is a
 * real defect I shipped once and looked at. A track's `translate` value is
 * local to the parent, so a part still holding a large local offset while its
 * PARENT flies across the stage is carried by the parent — the first cut had
 * the torso lead, and `ear_r`, holding an 800 px local offset, was flung 460 px
 * off the plate and dragged rigc's framing box with it (viewport 1878 world
 * units wide against a 1280 plate; the contact sheet showed parts outside the
 * stage). The rule that fixes it: **a part's own arrival finishes before its
 * parent starts moving.**
 *
 * Which is also the better film. Leaves first means the figure builds in
 * sub-assemblies — the head gains its ears and face where it lies, the arms and
 * the collar gather onto the torso where IT lies, and only then does the whole
 * upper body come down onto the hip. That is what a rig hierarchy is, so the
 * animation ends up showing the thing rigc actually gives you.
 */
const STAGGER: Record<string, { hold: number; land: number; loose?: boolean }> = {
  // tier A — the leaves, onto parents that have not moved yet
  ear_l: { hold: 0.0, land: 0.18, loose: true },
  hand_f: { hold: 0.03, land: 0.21 },
  face: { hold: 0.02, land: 0.2 },
  ear_r: { hold: 0.04, land: 0.22, loose: true },
  tail: { hold: 0.06, land: 0.24, loose: true },
  // tier B — the sub-assemblies, onto a torso that has not moved yet
  arm_b: { hold: 0.28, land: 0.5 },
  arm_f: { hold: 0.3, land: 0.52 },
  head: { hold: 0.32, land: 0.54 },
  knot: { hold: 0.33, land: 0.55 },
  // tier C — the figure onto its hip; the legs plant just before the body lands
  leg_l: { hold: 0.62, land: 0.82 },
  leg_r: { hold: 0.64, land: 0.84 },
  torso: { hold: 0.66, land: 0.9 },
};

/** Every bone's parent among the bones that MOVE, for the ordering check. */
const MOVING_PARENT: Record<string, string> = {
  ear_l: 'head',
  ear_r: 'head',
  face: 'head',
  tail: 'knot',
  hand_f: 'arm_f',
  head: 'torso',
  knot: 'torso',
  arm_b: 'torso',
  arm_f: 'torso',
};

/** §3.6: the counter-move is 5–10 % of the excursion, at 10–15 % of the span. */
const ANTICIPATE = 0.06;
const ANTICIPATE_AT = 0.13;
/** §3.8: 8–12 % past the end value, with the final value still exact. */
const OVERSHOOT = 0.1;

/**
 * ...but both are CAPPED in absolute units, which §3 does not say to do and
 * this shot needs.
 *
 * §3.6 and §3.8 give their sizes as fractions of the excursion, and the
 * excursions here are not a limb's — a plate crossing the stage travels 700+
 * art pixels, so a "10 % overshoot" is a 75 px lurch past the target. Two
 * things go wrong with that. It reads as a throw rather than a landing, and it
 * is what actually broke the framing: the collar's overshoot, carrying a scarf
 * tail that had already seated onto it, put the tail's quad corner 18 units off
 * the left edge of the plate and rigc framed to that (`check_framing.ts`).
 *
 * ⇒ Keep the fraction as the rule and clamp it at the size a landing reads as.
 * Both numbers are stated in the channel's own units and both are choices.
 */
const ANTICIPATE_CAP_PX = 22;
const OVERSHOOT_CAP_PX = 26;
const ANTICIPATE_CAP_DEG = 4;
const OVERSHOOT_CAP_DEG = 6;

interface Key {
  t: number;
  v: number[] | string | null;
  ease?: string;
}
interface Track {
  bone?: string;
  slot?: string;
  group?: string;
  property: string;
  lag?: number;
  stagger?: number;
  keys: Key[];
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * One part's arrival, as the key list for one channel.
 *
 * `from` is the scattered value and 0 is the setup value, so the shape is
 * always: hold at `from`, drift a little further out, cross the target, come
 * back to exactly 0. The last key is the setup value by construction, which is
 * §3.8's rule about the overshoot being interior.
 */
/** Where a part stops moving: §3.7's "settles after the driver". */
const settleOf = (hold: number, land: number) => Math.min(1, land + (land - hold) * 0.45);

function arrival(
  from: number,
  hold: number,
  land: number,
  loose: boolean,
  antiCap: number,
  overCap: number,
): Key[] {
  if (Math.abs(from) < 1e-9) return [];
  const span = land - hold;
  const sign = Math.sign(from);
  const anti = from + sign * Math.min(Math.abs(from) * ANTICIPATE, antiCap);
  const over = -sign * Math.min(Math.abs(from) * OVERSHOOT, overCap);
  const keys: Key[] = [];
  if (hold > 0) {
    // §3.3 ⭐: a hold is authored, with a key at BOTH ends of the equal run.
    keys.push({ t: 0, v: [r3(from)] });
    keys.push({ t: r6(hold * ASSEMBLE), v: [r3(from)], ease: 'gather' });
  } else {
    keys.push({ t: 0, v: [r3(from)], ease: 'gather' });
  }
  keys.push({
    t: r6((hold + span * ANTICIPATE_AT) * ASSEMBLE),
    v: [r3(anti)],
    ease: 'charge',
  });
  keys.push({ t: r6(land * ASSEMBLE), v: [r3(over)], ease: 'settle' });
  if (loose) {
    // §3.7's "one crossing" for something loose: it comes back past its own end
    // value before settling. Timed against the part's OWN span, not against the
    // end of the animation — a crossing that lingers is a residual delta, and a
    // residual delta is what the parent carries.
    keys.push({
      t: r6((land + span * 0.3) * ASSEMBLE),
      v: [r3(-over * 0.5)],
      ease: 'settle',
    });
  }
  // ⛔ Not a key at the animation's end: a track that holds its final value for
  // half the animation is §3.7's false lead, and the long ease into it is what
  // leaves a delta alive while the parent moves.
  keys.push({ t: r6(settleOf(hold, land) * ASSEMBLE), v: [0] });
  return keys;
}

const assembleTracks: Track[] = [];
for (const [bone, s] of Object.entries(STAGGER)) {
  const d = scatter.deltas[bone];
  if (d === undefined) continue;
  const loose = s.loose === true;
  const tx = arrival(d.tx ?? 0, s.hold, s.land, loose, ANTICIPATE_CAP_PX, OVERSHOOT_CAP_PX);
  const ty = arrival(d.ty ?? 0, s.hold, s.land, loose, ANTICIPATE_CAP_PX, OVERSHOOT_CAP_PX);
  // §4.4: the paired form when a bone moves on both axes together, which every
  // flying part does.
  if (tx.length > 0 && ty.length > 0) {
    assembleTracks.push({
      bone,
      property: 'translate',
      keys: tx.map((k, i) => ({
        t: k.t,
        v: [(k.v as number[])[0], (ty[i].v as number[])[0]],
        ...(k.ease === undefined ? {} : { ease: k.ease }),
      })),
    });
  }
  const rk = arrival(d.rot ?? 0, s.hold, s.land, loose, ANTICIPATE_CAP_DEG, OVERSHOOT_CAP_DEG);
  if (rk.length > 0) assembleTracks.push({ bone, property: 'rotate', keys: rk });
}

// The ordering rule STAGGER's comment states, checked rather than trusted: a
// part that is still carrying a delta when its parent starts moving is carried
// by it, and that is the defect the first cut had.
for (const [child, parent] of Object.entries(MOVING_PARENT)) {
  const c = STAGGER[child];
  const p = STAGGER[parent];
  if (c === undefined || p === undefined) continue;
  const done = settleOf(c.hold, c.land);
  if (done > p.hold + 1e-9) {
    throw new Error(
      `stagger: "${child}" still moving at ${done.toFixed(3)} when its parent ` +
        `"${parent}" starts at ${p.hold.toFixed(3)} — the parent will carry it`,
    );
  }
}

// The whole figure taking its own weight once every part is home: §3.8's
// overshoot at the scale of the body rather than of a part. This is the one
// track that reaches the declared duration, which is what R7 measures against.
assembleTracks.push({
  bone: 'hip',
  property: 'translatey',
  keys: [
    { t: 0, v: [0] },
    { t: r6(0.9 * ASSEMBLE), v: [0], ease: 'charge' },
    { t: r6(0.955 * ASSEMBLE), v: [-18], ease: 'settle' },
    { t: ASSEMBLE, v: [0] },
  ],
});

// The eyes: legible as a loose plate while they lie on the stage, shut as they
// seat onto the head, and open again on the settle — the beat that turns a pile
// of plates into somebody. An attachment timeline is stepped, so AUTHORING §4.5
// says write `T − 1e-6` rather than `T`: one grid step early is always seen by
// the sample it was written for, one ULP late loses the frame.
const step = (f: number) => r6(f * ASSEMBLE - 1e-6);
assembleTracks.push({
  slot: 'eyes',
  property: 'attachment',
  keys: [
    { t: 0, v: 'eyes' },
    { t: step(settleOf(STAGGER.face.hold, STAGGER.face.land)), v: 'eyes_shut' },
    { t: step(0.955), v: 'eyes' },
  ],
});

// ---------------------------------------------------------------------------
// `idle` — the A=B case of §0's normal form: a loop
// ---------------------------------------------------------------------------

/** §3.3's idle band is 1.5–3 s; proposed at 2.6 s to fit a wave beside a breath. */
const IDLE = 2.6;
const at = (f: number) => r6(f * IDLE);
/** The ears' per-member delay, and the window their own keys have to fit in. */
const EAR_STAGGER = 0.09;
const eat = (f: number) => r6(f * (IDLE - EAR_STAGGER));

/**
 * A loop's seam is a real defect (§3.3 point 3), so every track below writes
 * its first value again as its last, literally, rather than trusting itself to
 * have come back.
 */
const idleTracks: Track[] = [
  // the breath itself: the chest lifts and falls. One axis only, so §4.4's
  // single-axis timeline is the honest channel.
  {
    bone: 'chest',
    property: 'translatey',
    keys: [
      { t: 0, v: [0], ease: 'breathe' },
      { t: at(0.34), v: [13], ease: 'breathe' },
      { t: at(0.66), v: [0], ease: 'breathe' },
      { t: at(0.86), v: [-3], ease: 'breathe' },
      { t: IDLE, v: [0] },
    ],
  },
  // the weight settling under it, out of phase with the chest by design
  {
    bone: 'hip',
    property: 'translatey',
    keys: [
      { t: 0, v: [0], ease: 'breathe' },
      { t: at(0.4), v: [-4], ease: 'breathe' },
      { t: at(0.78), v: [1], ease: 'breathe' },
      { t: IDLE, v: [0] },
    ],
  },
  { bone: 'torso', property: 'rotate', keys: [
      { t: 0, v: [0], ease: 'breathe' },
      { t: at(0.36), v: [-1.4], ease: 'breathe' },
      { t: at(0.72), v: [0.6], ease: 'breathe' },
      { t: IDLE, v: [0] },
    ] },
  // §3.7: the next link out reaches its extreme 8–15 % later than its driver.
  // The chest's extreme is at 0.34; the head's is at 0.46.
  { bone: 'head', property: 'rotate', keys: [
      { t: 0, v: [0], ease: 'breathe' },
      { t: at(0.46), v: [2.4], ease: 'breathe' },
      { t: at(0.8), v: [-0.7], ease: 'breathe' },
      { t: IDLE, v: [0] },
    ] },
  // the ears: one track, two bones, and `stagger` is the overlap table's own
  // mechanism — the second ear repeats the first EAR_STAGGER later (AUTHORING
  // §4.3). ⚠️ The delay is added to every key, so the written times have to fit
  // inside `duration − stagger` or the last one lands past the duration and R7
  // refuses the build. It did, first time.
  {
    group: 'ears',
    property: 'rotate',
    stagger: EAR_STAGGER,
    keys: [
      { t: 0, v: [0], ease: 'breathe' },
      { t: eat(0.24), v: [-2.2], ease: 'settle' },
      { t: eat(0.56), v: [3.4], ease: 'breathe' },
      { t: eat(0.84), v: [-1.2], ease: 'settle' },
      { t: eat(1), v: [0] },
    ],
  },
  { bone: 'knot', property: 'rotate', keys: [
      { t: 0, v: [0], ease: 'breathe' },
      { t: at(0.5), v: [1.5], ease: 'breathe' },
      { t: IDLE, v: [0] },
    ] },
  // the scarf tail is the loose part of §3.7's table: latest extreme of
  // anything on the figure, and it crosses its own rest value on the way back.
  { bone: 'tail', property: 'rotate', keys: [
      { t: 0, v: [0], ease: 'breathe' },
      { t: at(0.3), v: [-4.5], ease: 'breathe' },
      { t: at(0.64), v: [5.5], ease: 'breathe' },
      { t: at(0.88), v: [-2], ease: 'settle' },
      { t: IDLE, v: [0] },
    ] },
  { bone: 'tail', property: 'translatey', keys: [
      { t: 0, v: [0], ease: 'breathe' },
      { t: at(0.36), v: [5], ease: 'breathe' },
      { t: at(0.74), v: [-3], ease: 'breathe' },
      { t: IDLE, v: [0] },
    ] },
  // the arms only breathe here. §3.10: a secondary action is a decision about
  // character, and folding one into the breath makes a loop that has to
  // re-perform it every 2.6 s. It gets its own animation instead — `wave`.
  { bone: 'arm_f', property: 'rotate', keys: [
      { t: 0, v: [0], ease: 'breathe' },
      { t: at(0.42), v: [2.6], ease: 'breathe' },
      { t: at(0.78), v: [-1], ease: 'breathe' },
      { t: IDLE, v: [0] },
    ] },
  { bone: 'hand_f', property: 'rotate', keys: [
      { t: 0, v: [0], ease: 'breathe' },
      { t: at(0.5), v: [4.2], ease: 'breathe' },
      { t: at(0.84), v: [-1.6], ease: 'settle' },
      { t: IDLE, v: [0] },
    ] },
  { bone: 'arm_b', property: 'rotate', keys: [
      { t: 0, v: [0], ease: 'breathe' },
      { t: at(0.44), v: [-2.4], ease: 'breathe' },
      { t: at(0.8), v: [1], ease: 'breathe' },
      { t: IDLE, v: [0] },
    ] },
  // the blink. Stepped, so both keys are written one grid step early.
  {
    slot: 'eyes',
    property: 'attachment',
    keys: [
      { t: 0, v: 'eyes' },
      { t: r6(at(0.3) - 1e-6), v: 'eyes_shut' },
      { t: r6(at(0.35) - 1e-6), v: 'eyes' },
    ],
  },
];

// ---------------------------------------------------------------------------
// `wave` — one beat, spliced between two turns of the loop
// ---------------------------------------------------------------------------

/**
 * A movement the figure DOES, so §3.3's 0.3–0.8 s band applies per beat; three
 * beats (raise, two flicks, lower) get 1.4 s.
 *
 * ⭐ Every track starts AND ends at zero, which is what lets this be spliced
 * between two turns of `idle` with no seam: `idle`'s own t=0 is the rest pose,
 * so a shot that leaves the rest pose and comes back to it can be cut in
 * anywhere the loop is at t=0.
 *
 * 📐 The arm hangs down, so raising it is a large POSITIVE rotation: the tip of
 * a bone pointing at −y goes to (L·sin θ, −L·cos θ), which only reaches up and
 * outward past θ ≈ 90°. The first cut used −26° and got an arm folded across
 * the chest — a sign error that no assertion can see and the contact sheet can.
 */
const WAVE = 1.4;
const wat = (f: number) => r6(f * WAVE);

const waveTracks: Track[] = [
  // the breath does not stop for the wave
  { bone: 'chest', property: 'translatey', keys: [
      { t: 0, v: [0], ease: 'breathe' },
      { t: wat(0.4), v: [11], ease: 'breathe' },
      { t: wat(0.8), v: [2], ease: 'breathe' },
      { t: WAVE, v: [0] },
    ] },
  { bone: 'torso', property: 'rotate', keys: [
      { t: 0, v: [0], ease: 'gather' },
      { t: wat(0.42), v: [-2.6], ease: 'breathe' },
      { t: wat(0.86), v: [0.8], ease: 'settle' },
      { t: WAVE, v: [0] },
    ] },
  // the head tips toward the raised arm, a touch after the torso (§3.7)
  { bone: 'head', property: 'rotate', keys: [
      { t: 0, v: [0], ease: 'gather' },
      { t: wat(0.52), v: [-4.5], ease: 'breathe' },
      { t: wat(0.9), v: [1.2], ease: 'settle' },
      { t: WAVE, v: [0] },
    ] },
  // the raise itself. §3.6's anticipation first — the arm drops a little before
  // it comes up — then the hold, then down with a settle.
  { bone: 'arm_f', property: 'rotate', keys: [
      { t: 0, v: [0], ease: 'gather' },
      { t: wat(0.09), v: [-9], ease: 'charge' },
      { t: wat(0.34), v: [149], ease: 'settle' },
      { t: wat(0.42), v: [140], ease: 'breathe' },
      { t: wat(0.66), v: [144], ease: 'gather' },
      { t: wat(0.9), v: [-6], ease: 'settle' },
      { t: WAVE, v: [0] },
    ] },
  // the wrist: §3.7 puts the link after the driver 15–25 % later, and this one
  // keeps going after the elbow has arrived — which is the wave.
  { bone: 'hand_f', property: 'rotate', keys: [
      { t: 0, v: [0], ease: 'gather' },
      { t: wat(0.12), v: [6], ease: 'charge' },
      { t: wat(0.4), v: [-26], ease: 'settle' },
      { t: wat(0.5), v: [24], ease: 'settle' },
      { t: wat(0.6), v: [-24], ease: 'settle' },
      { t: wat(0.7), v: [22], ease: 'settle' },
      { t: wat(0.82), v: [-8], ease: 'settle' },
      { t: wat(0.94), v: [5], ease: 'settle' },
      { t: WAVE, v: [0] },
    ] },
  // the far arm counterweights, and the scarf reacts last of all
  { bone: 'arm_b', property: 'rotate', keys: [
      { t: 0, v: [0], ease: 'breathe' },
      { t: wat(0.44), v: [-7], ease: 'breathe' },
      { t: wat(0.86), v: [2], ease: 'settle' },
      { t: WAVE, v: [0] },
    ] },
  { bone: 'tail', property: 'rotate', keys: [
      { t: 0, v: [0], ease: 'gather' },
      { t: wat(0.46), v: [-9], ease: 'breathe' },
      { t: wat(0.76), v: [7], ease: 'breathe' },
      { t: wat(0.92), v: [-2.5], ease: 'settle' },
      { t: WAVE, v: [0] },
    ] },
  {
    group: 'ears',
    property: 'rotate',
    stagger: EAR_STAGGER,
    keys: [
      { t: 0, v: [0], ease: 'gather' },
      { t: r6(0.3 * (WAVE - EAR_STAGGER)), v: [-5], ease: 'settle' },
      { t: r6(0.62 * (WAVE - EAR_STAGGER)), v: [4], ease: 'settle' },
      { t: r6(WAVE - EAR_STAGGER), v: [0] },
    ],
  },
];

const motion = {
  spec: 'rigc-motion/1',
  archetype: NAME,
  cut: 'gif-demo',
  easings: EASINGS,
  groups: { ears: ['ear_l', 'ear_r'] },
  animations: {
    assemble: {
      duration: ASSEMBLE,
      loop: false,
      note: 'twelve loose plates converge on the setup pose; stagger per MOTION.md §3.7',
      tracks: assembleTracks,
    },
    idle: {
      duration: IDLE,
      loop: true,
      note: 'breath and one blink; the first and last key of every track are the same value',
      tracks: idleTracks,
    },
    wave: {
      duration: WAVE,
      loop: false,
      note: 'one beat that leaves the rest pose and returns to it, so it splices into idle',
      tracks: waveTracks,
    },
  },
};

await Bun.write(`${HERE}${NAME}.motion.json`, `${JSON.stringify(motion, null, 2)}\n`);

// ---------------------------------------------------------------------------
// what the two poses actually occupy, so the plate can be checked to hold them
// ---------------------------------------------------------------------------

async function bboxOf(world: Record<string, Placement>): Promise<[number, number, number, number]> {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const s of SLOTS) {
    if (s.slot === 'plate') continue;
    const b = world[s.bone];
    const [ox, oy] = rot(s.x ?? 0, s.y ?? 0, b.rotation);
    const cx = b.x + ox;
    const cy = b.y + oy;
    // the rotated quad of the whole PNG, which is what rigc frames against
    const file = Bun.file(`${HERE}../art/parts/${s.image}`);
    const buf = new Uint8Array(await file.arrayBuffer());
    const w = (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19];
    const h = (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23];
    for (const [sx, sy] of [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [-w / 2, h / 2],
      [w / 2, h / 2],
    ]) {
      const [qx, qy] = rot(sx, sy, b.rotation);
      minX = Math.min(minX, cx + qx);
      maxX = Math.max(maxX, cx + qx);
      minY = Math.min(minY, cy + qy);
      maxY = Math.max(maxY, cy + qy);
    }
  }
  return [minX, minY, maxX, maxY];
}

/**
 * Every delta pushed out by its own anticipation, capped the way `arrival`
 * caps it, so this agrees with what the spec actually emits.
 *
 * ⚠️ This is an APPROXIMATION and `check_framing.ts` is the authority. It puts
 * every part at its anticipation at once, and the real animation never does:
 * the widest moment is one tier-B part at its extreme carrying children that
 * have already seated. Use this for a fast "did I put a plate off the stage",
 * and the sampler for the verdict.
 */
function anticipated(): Record<string, Delta> {
  const push = (v: number, cap: number) =>
    v + Math.sign(v) * Math.min(Math.abs(v) * ANTICIPATE, cap);
  const out: Record<string, Delta> = {};
  for (const [name, d] of Object.entries(scatter.deltas)) {
    out[name] = {
      tx: push(d.tx ?? 0, ANTICIPATE_CAP_PX),
      ty: push(d.ty ?? 0, ANTICIPATE_CAP_PX),
      rot: push(d.rot ?? 0, ANTICIPATE_CAP_DEG),
    };
  }
  return out;
}

const setupBox = await bboxOf(solve());
const scatterBox = await bboxOf(scatter.world);
// §3.6's counter-move drifts every part a little FURTHER out before it flies
// in, so the widest moment of the animation is not the scatter pose itself.
const extremeBox = await bboxOf(solve(anticipated()));
const fmt = (b: number[]) =>
  `x ${b[0].toFixed(0)}..${b[2].toFixed(0)}  y ${b[1].toFixed(0)}..${b[3].toFixed(0)}`;
console.log(`plate      0..${PLATE_W}  0..${PLATE_H}`);
console.log(`setup      ${fmt(setupBox)}`);
console.log(`scatter    ${fmt(scatterBox)}`);
console.log(`anticip.   ${fmt(extremeBox)}`);
const MARGIN = 12;
// Nothing may reach into the caption band: the GIF writes type there.
const intoBand = [setupBox, scatterBox, extremeBox].some((b) => b[1] < BAND_H);
console.log(
  intoBand
    ? `⚠️  something reaches below y=${BAND_H}, where the caption band goes`
    : `✅ nothing reaches into the ${BAND_H}px caption band`,
);
const out =
  extremeBox[0] < MARGIN ||
  extremeBox[1] < MARGIN ||
  extremeBox[2] > PLATE_W - MARGIN ||
  extremeBox[3] > PLATE_H - MARGIN;
console.log(
  out
    ? '⚠️  a part leaves the plate here; run check_framing.ts for the verdict'
    : '✅ scatter and anticipation sit inside the plate (check_framing.ts is the verdict)',
);
console.log(`assemble tracks ${assembleTracks.length}  idle tracks ${idleTracks.length}`);
