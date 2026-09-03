/**
 * Emits the three motion specs this film needs, from the two key poses.
 *
 *   poses.motion.json    two stills — the pictures the user is holding
 *   cheer-a.motion.json  candidate A: every part arrives together, one curve
 *   cheer-b.motion.json  candidate B: MOTION.md §3's defaults, applied
 *
 * The rig is NOT emitted: `rigby.rig.json` is the first film's, unchanged, and
 * a character that already passed somebody's eye is not a thing to regenerate.
 *
 * ── the request, normalised against MOTION.md §1 ──────────────────────────
 *   parts directory   given — art/parts (⛔ no default; rigc measures the PNGs)
 *   pose frames       TWO, ordered → L1. poseA = rest, poseB = the ta-da
 *   target duration   ABSENT → §3.3 puts "a movement the figure does" in the
 *                     0.3–0.8 s band; propose its middle, 0.55 s, and say so
 *   loop              ABSENT, and the two pictures are different poses → §1
 *                     reads that as NOT a loop. Both candidates are loop:false;
 *                     the film's own looping is the film's business
 *   intent adjectives "cheer", "ta-da" → it is a movement the figure DOES, it
 *                     ends fast, so §3.6's anticipation and §3.8's overshoot are
 *                     both live. Written down here BEFORE any measurement, which
 *                     is what §1's ⚠️ asks for
 *   animation name    `cheer` — the intent's own verb, one word, lower case.
 *                     Both candidates use it, because `rigc vote` refuses to put
 *                     two different animations in two panes
 *   frame rate        ⛔ not adopted. `render --fps` samples; specs carry seconds
 */
import { mkdirSync } from 'node:fs';
import { POSE_A, POSE_B, POSED_BONES, val, type Delta } from './poses';

const HERE = new URL('./', import.meta.url).pathname;
mkdirSync(HERE, { recursive: true });

/** §3.3, proposed: the middle of the 0.3–0.8 s band for a movement figures do. */
const D = 0.55;

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

interface Key {
  t: number;
  v: number[];
  ease?: string;
}
interface Track {
  bone: string;
  property: string;
  keys: Key[];
}

/** A delta channel and the track property that carries it (AUTHORING §4.4). */
const PROPERTY: Record<string, string> = { tx: 'translatex', ty: 'translatey', rot: 'rotate' };
const CHANNELS: (keyof Delta)[] = ['tx', 'ty', 'rot'];

/**
 * Does this channel need a track at all?
 *
 * §3.7's ⛔ is "a part the pictures show unchanged gets no timeline", and
 * unchanged there means *at the setup value* — a channel that holds the same
 * NON-zero value in both poses still needs stating, or the part sits at setup
 * for the whole animation instead of where both pictures put it.
 */
const needsTrack = (ch: keyof Delta, bone: string) =>
  Math.abs(val(POSE_B, bone, ch) - val(POSE_A, bone, ch)) > 1e-9 ||
  Math.abs(val(POSE_A, bone, ch)) > 1e-9;

const moves = (ch: keyof Delta, bone: string) =>
  Math.abs(val(POSE_B, bone, ch) - val(POSE_A, bone, ch)) > 1e-9;

// ---------------------------------------------------------------------------
// the two stills
// ---------------------------------------------------------------------------

/**
 * A still has no duration; the format needs one, so it gets a short hold.
 *
 * ⭐ Two keys with the SAME value is not padding — §3.3 lists "both ends of any
 * run of equal values" as one of the three kinds of key that are forced, and it
 * is the only way an interpolated timeline can say *nothing moves here*.
 */
const STILL = 0.5;

function stillTracks(pose: Record<string, Delta>): Track[] {
  const out: Track[] = [];
  for (const bone of POSED_BONES) {
    for (const ch of CHANNELS) {
      const v = val(pose, bone, ch);
      if (Math.abs(v) < 1e-9) continue;
      out.push({
        bone,
        property: PROPERTY[ch],
        keys: [
          { t: 0, v: [r3(v)] },
          { t: STILL, v: [r3(v)] },
        ],
      });
    }
  }
  return out;
}

await Bun.write(
  `${HERE}poses.motion.json`,
  `${JSON.stringify(
    {
      spec: 'rigc-motion/1',
      archetype: 'rigby',
      cut: 'keypose-stills',
      easings: { hold: [0.5, 0, 0.5, 1] },
      animations: {
        poseA: {
          duration: STILL,
          loop: false,
          note: 'key pose 0 — at rest. A still: two keys per channel, one value',
          tracks: stillTracks(POSE_A),
        },
        poseB: {
          duration: STILL,
          loop: false,
          note: 'key pose 1 — the ta-da. A still: two keys per channel, one value',
          tracks: stillTracks(POSE_B),
        },
      },
    },
    null,
    2,
  )}\n`,
);

// ---------------------------------------------------------------------------
// candidate A — one reading: the whole figure arrives at once
// ---------------------------------------------------------------------------

/**
 * §3.4 wants the easing table picked FIRST and every key written against it.
 * Candidate A's table is one shape, deliberately: this is the reading in which
 * the figure is one rigid piece, and a second curve would already be the other
 * candidate's answer creeping in.
 */
const EASINGS_A = { drive: [0.3, 0, 0.5, 1] };

const tracksA: Track[] = [];
for (const bone of POSED_BONES) {
  for (const ch of CHANNELS) {
    if (!needsTrack(ch, bone)) continue;
    const a = val(POSE_A, bone, ch);
    const b = val(POSE_B, bone, ch);
    tracksA.push({
      bone,
      property: PROPERTY[ch],
      keys: [
        { t: 0, v: [r3(a)], ease: 'drive' },
        { t: D, v: [r3(b)] },
      ],
    });
  }
}

// ---------------------------------------------------------------------------
// candidate B — the other reading: §3's defaults, applied
// ---------------------------------------------------------------------------

/** §3.4: three named shapes carry one authored move. Same table as film one. */
const EASINGS_B = {
  gather: [0.42, 0, 0.8, 0.36],
  charge: [0.1, 0.72, 0.34, 1],
  settle: [0.28, 0, 0.36, 1],
};

/**
 * §3.7's overlap table, as fractions of the whole movement.
 *
 * The intent is about the arms, but the thing that DRIVES them is the body's
 * lift — so `hip`/`torso`/`chest` are the driver, the arms and the head are the
 * next link out, the hand and the ears are the link after that, and the scarf
 * tail is the loose light thing that arrives last and crosses once.
 *
 * ⚠️ The numbers are the table's own fractions, compounded down the chain
 * exactly as §3.7 says they compound: driver 0.56, next link +0.10–0.12, the
 * link after +0.18–0.20, the loose part +0.28. Which means only the DRIVER sits
 * inside §3.8's 55–70 % window for an overshoot key — the trailing parts are
 * later than that by construction, because §3.7's whole mechanism is being later
 * than your driver. Nothing gets past 0.84, which keeps every part inside the
 * "one event, not two" limit §3.7 puts at about 35 % of stagger.
 */
const TIER: Record<string, { extreme: number; loose?: boolean }> = {
  hip: { extreme: 0.56 },
  torso: { extreme: 0.56 },
  chest: { extreme: 0.58 },
  arm_b: { extreme: 0.66 },
  arm_f: { extreme: 0.68 },
  head: { extreme: 0.68 },
  knot: { extreme: 0.68 },
  ear_l: { extreme: 0.74 },
  hand_f: { extreme: 0.76 },
  ear_r: { extreme: 0.76 },
  tail: { extreme: 0.84, loose: true },
};

/** §3.6: 5–10 % of the excursion, at 10–15 % of the duration — taken at the top
 * of the band, because a spread on Part timing is only worth a ballot if a person
 * can see it (§5's `unsure` verdict is the failure mode). */
const ANTICIPATE = 0.1;
const ANTICIPATE_AT = 0.13;
/** §3.8: 8–12 % past the end value, the final value still exact. Top of band. */
const OVERSHOOT = 0.12;

/**
 * ...both capped in absolute units, which §3 does not ask for.
 *
 * The arms swing about 150°, so a literal 10 % overshoot is a 15° lurch past
 * the pose — past the point where it reads as a landing. The first film hit the
 * same wall from the other side (a 700 px plate crossing, whose 10 % put a quad
 * off the stage) and its note is the precedent: keep the fraction as the rule,
 * clamp it where the read breaks. Both numbers are choices, in the channel's
 * own units.
 */
const CAP = { deg: { anti: 14, over: 13 }, px: { anti: 10, over: 12 } };

function keysB(bone: string, ch: keyof Delta): Key[] {
  const a = val(POSE_A, bone, ch);
  const b = val(POSE_B, bone, ch);
  const tier = TIER[bone];
  if (tier === undefined) throw new Error(`bone "${bone}" is posed but not in §3.7's table`);
  // A channel both pictures agree on: state it, hold it, nothing else. §3.3 ⭐.
  if (!moves(ch, bone)) {
    return [
      { t: 0, v: [r3(a)] },
      { t: D, v: [r3(a)] },
    ];
  }
  const exc = b - a;
  const sign = Math.sign(exc);
  const cap = ch === 'rot' ? CAP.deg : CAP.px;
  // §3.6: the counter-move goes AFTER t:0, never before it — t:0 is a given
  // condition and moving it would overwrite an input with an invention.
  const anti = a - sign * Math.min(Math.abs(exc) * ANTICIPATE, cap.anti);
  // §3.8: the overshoot is an INTERIOR key; the last key still carries pose B.
  const over = b + sign * Math.min(Math.abs(exc) * OVERSHOOT, cap.over);
  const keys: Key[] = [
    { t: 0, v: [r3(a)], ease: 'gather' },
    { t: r6(ANTICIPATE_AT * D), v: [r3(anti)], ease: 'charge' },
    { t: r6(tier.extreme * D), v: [r3(over)], ease: 'settle' },
  ];
  if (tier.loose === true) {
    // §3.7's "one crossing" for something loose and light: it comes back past
    // its own end value once before settling on it.
    keys.push({
      t: r6((tier.extreme + (1 - tier.extreme) * 0.45) * D),
      v: [r3(b - sign * Math.abs(exc) * 0.05)],
      ease: 'settle',
    });
  }
  keys.push({ t: D, v: [r3(b)] });
  return keys;
}

const tracksB: Track[] = [];
for (const bone of POSED_BONES) {
  for (const ch of CHANNELS) {
    if (!needsTrack(ch, bone)) continue;
    tracksB.push({ bone, property: PROPERTY[ch], keys: keysB(bone, ch) });
  }
}

// ---------------------------------------------------------------------------
// the two things about this pair that have to be true, checked rather than said
// ---------------------------------------------------------------------------

/**
 * 1. Both candidates state BOTH given poses exactly.
 *
 * MOTION.md §0's 🚨: at L1 the end poses are inputs, not targets. If a
 * candidate's first or last key drifts off them, the ballot stops being about
 * the movement and starts being about which candidate got the pose right.
 */
for (const [label, tracks] of [
  ['A', tracksA],
  ['B', tracksB],
] as const) {
  for (const t of tracks) {
    const ch = (Object.entries(PROPERTY).find(([, p]) => p === t.property) as [keyof Delta, string])[0];
    const first = t.keys[0];
    const last = t.keys[t.keys.length - 1];
    const wantA = r3(val(POSE_A, t.bone, ch));
    const wantB = r3(val(POSE_B, t.bone, ch));
    if (first.t !== 0 || first.v[0] !== wantA)
      throw new Error(`${label} ${t.bone}.${t.property}: t:0 is ${first.v[0]}, pose A is ${wantA}`);
    if (last.t !== D || last.v[0] !== wantB)
      throw new Error(
        `${label} ${t.bone}.${t.property}: last key is t:${last.t}=${last.v[0]}, pose B is t:${D}=${wantB}`,
      );
  }
}

/**
 * 2. The two candidates differ in INTERPRETATION, not in strength.
 *
 * §4's ⛔ is that the same easing at three strengths is a wasted ballot. The
 * mechanical form of "differs in interpretation" for this spread is: the
 * candidates' extremes do not land at the same time as each other, and A's all
 * land together while B's do not.
 */
const extremesA = new Set(tracksA.map((t) => t.keys.length));
const spreadB = new Set(Object.values(TIER).map((t) => t.extreme));
if (extremesA.size !== 1) throw new Error('candidate A is not one uniform shape');
if (spreadB.size < 4) throw new Error(`candidate B's stagger has only ${spreadB.size} distinct arrivals`);

const common = { spec: 'rigc-motion/1', archetype: 'rigby', cut: 'keypose' } as const;

await Bun.write(
  `${HERE}cheer-a.motion.json`,
  `${JSON.stringify(
    {
      ...common,
      easings: EASINGS_A,
      animations: {
        cheer: {
          duration: D,
          loop: false,
          note: 'candidate A — every part reaches its extreme together, one curve, two keys per track',
          tracks: tracksA,
        },
      },
    },
    null,
    2,
  )}\n`,
);

await Bun.write(
  `${HERE}cheer-b.motion.json`,
  `${JSON.stringify(
    {
      ...common,
      easings: EASINGS_B,
      animations: {
        cheer: {
          duration: D,
          loop: false,
          note: 'candidate B — MOTION.md §3.7 stagger, §3.6 anticipation, §3.8 overshoot',
          tracks: tracksB,
        },
      },
    },
    null,
    2,
  )}\n`,
);

const keyCount = (ts: Track[]) => ts.reduce((n, t) => n + t.keys.length, 0);
console.log(`duration   ${D}s  (§3.3, proposed — the user named none)`);
console.log(`poses      ${POSED_BONES.length} bones posed: ${POSED_BONES.join(' ')}`);
console.log(`stills     poseA ${stillTracks(POSE_A).length} tracks · poseB ${stillTracks(POSE_B).length} tracks`);
console.log(`cand A     ${tracksA.length} tracks, ${keyCount(tracksA)} keys — all extremes at t=${D}`);
console.log(
  `cand B     ${tracksB.length} tracks, ${keyCount(tracksB)} keys — ${spreadB.size} distinct arrivals: ` +
    [...spreadB].sort((x, y) => x - y).map((f) => `${(f * 100).toFixed(0)}%`).join(' '),
);
console.log('✅ both candidates state pose A at t:0 and pose B at t:duration, exactly');
