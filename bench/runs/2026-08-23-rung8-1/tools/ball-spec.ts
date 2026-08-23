/**
 * The `ball` rig and motion specs — a comet whose trail bends and whose ball
 * changes shape.
 *
 * Two structural decisions, both taken off the frames:
 *
 * · **the ball does not turn.** Its pale cap points within 82°–102° of straight
 *   up on every frame whose split holds, and the art's own cap is at −1.0, −41.4
 *   image px from its centre — straight up. So the ball's bone is screen-aligned
 *   and carries `scale` only, which puts the squash axes on the screen axes; the
 *   flattened landing frames read a major axis of about 0° and agree.
 * · **the trail is a weighted mesh on a bone chain.** A rigid region can point
 *   the trail and cannot bow it, and the trail is past a straight spindle's own
 *   sagitta floor on three quarters of the frames.
 *
 * The trail chain hangs off the comet rather than off the ball, so squashing the
 * ball does not squash the trail.
 */
import type { RigSpec, RigMeshBinding } from '../../../../src/rig.ts';
import type { MotionSpec, MotionTrack, EasingHandles } from '../../../../src/types.ts';

/** `tail.png` is 380 x 111; its blunt end is x = 378 and its silver point x = 1. */
const TAIL_W = 380;
const TAIL_H = 111;
const TAIL_ENTRY = 378;
const TAIL_MID = 55.5;
/** `ball.png` is 156 x 156 with a 1 px transparent border, so its art centres on 77.5. */
const BALL_SIZE = 156;
const BALL_CENTRE = 77.5;

export interface BallStructure {
  /** the comet's setup position, world units. */
  comet: [number, number];
  /** bones down the trail. */
  segments: number;
  /** the trail art's scale. */
  artScale: number;
  /** the ball art's scale. */
  ballScale: number;
  /**
   * How far the trail's blunt end sits in front of `tail0`'s origin, along the
   * trail, in units. Positive puts it on the ball's side.
   */
  lead: number;
  /** true draws the ball first, so the trail is in front of it. Default false. */
  ballBehind?: boolean;
  box: { x: number; y: number; width: number; height: number };
}

/**
 * Hat weights over the bone origins, clamped so the last segment is rigid.
 *
 * ⭐ Both vertices of a row get the **same** weights, so the strip can bend and
 * cannot change width — the guarantee a generated ribbon carries structurally
 * and an authored mesh has to keep by hand (`A28` correctly SKIPs on one).
 */
function weightsAt(d: number, seg: number, n: number): { k: number; w: number }[] {
  const u = Math.min(Math.max(d / seg, 0), n - 1);
  const out: { k: number; w: number }[] = [];
  for (let i = 0; i < n; i++) {
    const w = Math.max(0, 1 - Math.abs(u - i));
    if (w > 1e-9) out.push({ k: i, w });
  }
  const total = out.reduce((s, v) => s + v.w, 0);
  return out.map((v) => ({ k: v.k, w: v.w / total }));
}

export function ballRig(s: BallStructure): RigSpec {
  const n = s.segments;
  const seg = (TAIL_ENTRY * s.artScale) / n;
  const rows = 2 * n + 1;
  // Vertices are emitted hull-first, as a ring: every top edge in order, then
  // every bottom edge back again. On a two-wide strip every vertex is on the
  // hull, so `hull` is the whole array and the claim is true rather than a
  // number picked to fill the field.
  const uvs: number[] = new Array(rows * 4).fill(0);
  const weights: RigMeshBinding[][] = new Array(rows * 2);
  const triangles: number[] = [];
  const top = (j: number): number => j;
  const bottom = (j: number): number => 2 * rows - 1 - j;
  for (let j = 0; j < rows; j++) {
    const d = (j * seg) / 2;
    const artX = TAIL_ENTRY - d / s.artScale;
    const bind = weightsAt(d, seg, n);
    const bindingsFor = (artY: number): RigMeshBinding[] =>
      bind.map(({ k, w }) => ({
        bone: `tail${k}`,
        // in bone k's own setup space: the chain is straight in setup, so a
        // point at chain distance d sits at (d - k*seg) along that bone's +x.
        x: d - k * seg - s.lead,
        y: (artY - TAIL_MID) * s.artScale,
        weight: w,
      }));
    uvs[top(j) * 2] = artX / TAIL_W;
    uvs[top(j) * 2 + 1] = 0;
    weights[top(j)] = bindingsFor(0);
    uvs[bottom(j) * 2] = artX / TAIL_W;
    uvs[bottom(j) * 2 + 1] = 1;
    weights[bottom(j)] = bindingsFor(TAIL_H);
    if (j > 0) {
      triangles.push(top(j - 1), bottom(j - 1), bottom(j), top(j - 1), bottom(j), top(j));
    }
  }

  const bones: RigSpec['bones'] = [
    { name: 'root' },
    { name: 'comet', parent: 'root', x: s.comet[0], y: s.comet[1], rotation: 0, length: 154 },
    { name: 'ball', parent: 'comet', x: 0, y: 0, rotation: 0, length: 154 },
    { name: 'tail0', parent: 'comet', x: 0, y: 0, rotation: 180, length: seg },
  ];
  for (let k = 1; k < n; k++) {
    bones.push({ name: `tail${k}`, parent: `tail${k - 1}`, x: seg, y: 0, rotation: 0, length: seg });
  }

  return {
    spec: 'rigc-rig/1',
    name: 'ball',
    images: 'images',
    skeleton: s.box,
    bones,
    // R4: the trail is drawn first. The brief calls this undecidable — the two
    // parts meet inside the ball's own silhouette — but on the landing frames the
    // trail curls right over where the ball is, and that IS decidable
    // like-for-like: both orders were built and rendered back. See LOOP.md §11.
    slots: s.ballBehind
      ? [
          { name: 'ball', bone: 'ball', attachment: 'ball' },
          { name: 'tail', bone: 'tail0', attachment: 'tail' },
        ]
      : [
          { name: 'tail', bone: 'tail0', attachment: 'tail' },
          { name: 'ball', bone: 'ball', attachment: 'ball' },
        ],
    skins: {
      default: {
        tail: {
          tail: {
            type: 'mesh',
            image: 'tail.png',
            uvs,
            triangles,
            weights,
            hull: rows * 2,
          },
        },
        ball: {
          ball: {
            image: 'ball.png',
            x: (BALL_SIZE / 2 - BALL_CENTRE) * s.ballScale,
            y: -(BALL_SIZE / 2 - BALL_CENTRE) * s.ballScale,
            rotation: 0,
            scaleX: s.ballScale,
            scaleY: s.ballScale,
          },
        },
      },
    },
  };
}

export function ballMotion(
  duration: number,
  tracks: MotionTrack[],
  easings: Record<string, EasingHandles>,
): MotionSpec {
  return {
    spec: 'rigc-motion/1',
    archetype: 'ball',
    cut: 'follow-through',
    easings,
    animations: { 'follow-through': { duration, loop: false, tracks } },
  };
}

export function ballStatic(): MotionSpec {
  return { spec: 'rigc-motion/1', archetype: 'ball', cut: 'follow-through', easings: {}, animations: {} };
}
