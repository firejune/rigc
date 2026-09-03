/**
 * A throwaway: six readings of the ta-da, side by side, so the choice is made
 * on a contact sheet rather than in my head.
 *
 * Two things the first render got wrong and neither is a number I could have
 * reasoned my way to:
 *
 *  1. `arm_b` is 216 px long and the slots array draws it BEHIND the torso and
 *     the head (R4, and film one's own note explains why it has to be). Swung
 *     to −152° its near half is occluded and only the far end clears the head —
 *     so a correctly attached arm reads as a floating stick. The fix is an
 *     angle, not a slot: bring it down until the part that emerges emerges from
 *     beside the TORSO.
 *  2. The scarf tail extends to −x, so a POSITIVE (counter-clockwise) rotation
 *     swings it DOWN. Raising it wants a negative one. Nothing catches a sign
 *     error like this except looking.
 */
import { mkdirSync } from 'node:fs';
import { POSE_B, POSED_BONES, val, type Delta } from './poses';

const HERE = new URL('./', import.meta.url).pathname;
mkdirSync(HERE, { recursive: true });

const VARIANTS: Record<string, Partial<Record<string, Delta>>> = {
  w0: { arm_b: { rot: -70 }, tail: { rot: -26 } },
  w1: { arm_b: { rot: -80 }, tail: { rot: -26 } },
  w2: { arm_b: { rot: -96 }, tail: { rot: -26 } },
  w3: { arm_b: { rot: -70 }, tail: { rot: -38 } },
  w4: { arm_b: { rot: -84 }, tail: { rot: -38 } },
  w5: { arm_b: { rot: -100 }, tail: { rot: -38 } },
};

const STILL = 0.5;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const PROPERTY: Record<string, string> = { tx: 'translatex', ty: 'translatey', rot: 'rotate' };

const animations: Record<string, unknown> = {};
for (const [name, patch] of Object.entries(VARIANTS)) {
  const pose: Record<string, Delta> = {};
  for (const b of POSED_BONES) pose[b] = { ...POSE_B[b], ...(patch[b] ?? {}) };
  const tracks: unknown[] = [];
  for (const bone of POSED_BONES) {
    for (const ch of ['tx', 'ty', 'rot'] as (keyof Delta)[]) {
      const v = val(pose, bone, ch);
      if (Math.abs(v) < 1e-9) continue;
      tracks.push({
        bone,
        property: PROPERTY[ch],
        keys: [
          { t: 0, v: [r3(v)] },
          { t: STILL, v: [r3(v)] },
        ],
      });
    }
  }
  animations[name] = { duration: STILL, loop: false, tracks };
}

await Bun.write(
  `${HERE}tune.motion.json`,
  `${JSON.stringify(
    { spec: 'rigc-motion/1', archetype: 'rigby', cut: 'tune', easings: { hold: [0.5, 0, 0.5, 1] }, animations },
    null,
    2,
  )}\n`,
);
console.log(`${Object.keys(VARIANTS).length} variants -> spec/tune.motion.json`);
