/**
 * The two KEY POSES, and the stills build that turns them into two pictures.
 *
 * This is the L1 scenario of MOTION.md §0 seen from the other side: a user
 * arrives with two pictures, and the recipe reads them with `rigc pose`. To
 * *have* two pictures at all, somebody has to have drawn the poses — so they
 * are authored here, in the rig's own coordinates, and rendered flat.
 *
 * ⚠️ Which makes one thing worth saying out loud, because the film is also a
 * proof: `rigc pose` is then run on those flat pixels for real, and it knows
 * nothing about this file. `check_pose_reading.ts` is what closes the loop —
 * it compares what `pose` measured against the placements THIS file implies,
 * and prints the disagreement in pixels. That number is a real verification of
 * the instrument; it is not a grade of the movement, which MOTION.md §0 says
 * nothing in the toolchain can give.
 *
 * The rig itself is untouched — `rigby.rig.json` is the one the first film
 * shipped, byte for byte. Poses and motions are the only new authoring.
 */
import { BONES, SLOTS, solve, rot, type Delta, type Placement } from './skeleton';
import { PLATE_W, PLATE_H } from '../art/layout';

/**
 * Pose A — at rest.
 *
 * Not the setup pose: the setup pose is the drawing the parts were cut in, and
 * a figure standing in it reads as a chart rather than as somebody waiting.
 * A few degrees of settle — weight down, chest dropped, scarf hanging — is what
 * makes A→B a movement between two *poses* rather than out of a datum.
 */
export const POSE_A: Record<string, Delta> = {
  hip: { ty: -6 },
  torso: { rot: -1.5 },
  chest: { ty: -5 },
  head: { rot: 2 },
  arm_b: { rot: -3 },
  arm_f: { rot: 4 },
  hand_f: { rot: 5 },
  knot: { rot: -1 },
  tail: { rot: -5 },
  ear_l: { rot: -4 },
  ear_r: { rot: 3 },
};

/**
 * Pose B — the ta-da. Both arms up in a V, chest open, ears and scarf flung.
 *
 * 📐 The arms hang down, so raising one is a LARGE rotation, and the two signs
 * are opposite: a bone pointing at −y puts its tip at (L·sin θ, −L·cos θ), so
 * the near arm reaches up-and-right at θ ≈ +150° and the far arm up-and-left at
 * θ ≈ −150°. The first film's own note records getting this sign wrong once and
 * getting an arm folded across the chest — nothing asserts it, the contact sheet
 * shows it.
 *
 * ⛔ The legs carry no pose delta, in either pose. They are the planted part of
 * MOTION.md §3.7's table, and a planted part gets no timeline in either
 * candidate — which is also why the plate's contact shadow keeps meaning
 * something.
 *
 * ── two numbers that came off a contact sheet, not out of a head ───────────
 *
 * ⭐ `arm_b: -76`, and it is a SLOT problem wearing an angle's clothes. The far
 * arm is 216 px long and R4 draws it behind the torso and the head — which film
 * one's own slot note says it has to be, or the near arm stops reading as a
 * shoulder. So at the mirror of the near arm (−152°) its attached half is
 * occluded and only the far end clears the head: a correctly attached arm that
 * reads as a floating stick. Swept the range and the scarf is the constraint —
 * the tail plate owns the horizontal band at neck height, so −96° (out and
 * level) disappears INTO it. The arm has to pass below that band or above the
 * head, and below is the one that reads. ⇒ one arm up, one arm out. Asymmetric
 * on purpose, and a better ta-da than the mirror would have been.
 *
 * ⭐ The TRAILING excursions are large on purpose, and that decision belongs to
 * the pose rather than to either candidate. §3.7's stagger is a timing offset,
 * so what it moves is a part's own excursion — with 15° of ear and 29° of scarf
 * the lag was worth a couple of pixels and the two candidates measured 1.5 %
 * apart at their widest, which is §5's `unsure` verdict waiting to happen ("the
 * page did not show the difference"). Flinging the ears, the scarf and the paw
 * further gives the offsets something to be visible ON, and it costs the
 * comparison nothing: BOTH candidates state this same pose B.
 *
 * ⭐ `tail: -52`, NEGATIVE. The tail plate extends toward −x, so a positive
 * (counter-clockwise) rotation swings it DOWN — the first cut raised the scarf
 * by +30 and dropped it 30°. A sign error with no assertion that can see it.
 */
export const POSE_B: Record<string, Delta> = {
  hip: { ty: 16 },
  torso: { rot: 1.5 },
  chest: { ty: 26 },
  head: { rot: -6, ty: 12 },
  arm_b: { rot: -76 },
  arm_f: { rot: 148 },
  hand_f: { rot: -12 },
  knot: { rot: 5 },
  tail: { rot: -52 },
  ear_l: { rot: 26 },
  ear_r: { rot: -24 },
};

/** Every bone either pose moves, in the bone table's own parent-first order. */
export const POSED_BONES = BONES.map((b) => b.name).filter(
  (n) => POSE_A[n] !== undefined || POSE_B[n] !== undefined,
);

/** A pose's value for one channel, with an absent delta reading as 0. */
export const val = (pose: Record<string, Delta>, bone: string, ch: keyof Delta): number =>
  pose[bone]?.[ch] ?? 0;

// ---------------------------------------------------------------------------
// where each part's IMAGE CENTRE lands in a pose — the quantity `rigc pose`
// reports, so the two are directly comparable
// ---------------------------------------------------------------------------

/** `(cx, cy)` in Spine world (y up) and the part's screen rotation, per slot. */
export interface PartPlacement {
  slot: string;
  image: string;
  /** Spine world, y up. */
  wx: number;
  wy: number;
  /** Frame pixels, y DOWN, origin top-left — `rigc pose`'s own space. */
  fx: number;
  fy: number;
  /** Screen degrees, clockwise — `rigc pose`'s own convention. */
  screenRot: number;
}

/**
 * Forward-kinematic placement of every part's image centre for one pose.
 *
 * The two conversions at the end are MOTION.md §2.2's, run backwards:
 * `cropToSpineY(y, H) = H − y` and `screenToSpineDegrees(d) = −d`, so world →
 * frame is `y ↦ H − y` and `rotation ↦ −rotation`. Applied ONCE, which is the
 * warning that section attaches to them.
 */
export function partPlacements(pose: Record<string, Delta>): PartPlacement[] {
  const world: Record<string, Placement> = solve(pose);
  const out: PartPlacement[] = [];
  for (const s of SLOTS) {
    const b = world[s.bone];
    const [ox, oy] = rot(s.x ?? 0, s.y ?? 0, b.rotation);
    const wx = b.x + ox;
    const wy = b.y + oy;
    out.push({
      slot: s.slot,
      image: s.image,
      wx,
      wy,
      fx: wx,
      fy: PLATE_H - wy,
      screenRot: -b.rotation,
    });
  }
  return out;
}

void PLATE_W;
