/**
 * Slot attachment timelines.
 *
 * `front-fist`: which fist the near hand shows. `idle` (open) and `walk`
 * (closed) are the brief's own measurements; the rest are settled by the
 * like-for-like test in work/probe-choice.ts.
 *
 * `muzzle`: the flare sequence. f2 -> muzzle01 and f3 -> muzzle03 are decisive
 * (the like-for-like test separates them by 132 % and 15 %); f4's own test is
 * 1.2 % apart, which is no answer, and muzzle04 is taken from the art's own
 * numbering plus the shape. muzzle02 and muzzle05 are declared and placed
 * between them but are never resolvable at 12 fps - see the run's README.
 */
/**
 * The near hand's fist, per shot.
 *
 * 🚨 This was fitted and never emitted. work/fist.json decides which fist each
 * shot shows and the pose fit honours it, but the rig's SETUP attachment is
 * `front-fist-open` and no animation carried an attachment key — so six of the
 * eight shots were fitted against the closed fist and built showing the open
 * one. Nothing in the loop looks at this: the gate does not know which
 * attachment a slot ought to show, and the difference is a few dozen pixels at
 * the end of an arm, well under a whole-frame mean.
 *
 * §10.1 is why a slot holds both: *"Slots group attachments of the same type...
 * only one attachment (or none) can be visible at any given time"*, which is
 * exactly a hand that opens. §10.2 is why the swap is a key rather than
 * anything else, and §10.3's Clean Up is why the shots that show the setup
 * attachment carry no key at all.
 */
const SETUP_FIST = 'front-fist-open';
const FIST_BY_SHOT: Record<string, string> = {
  idle: 'front-fist-open', death: 'front-fist-open',
  walk: 'front-fist-closed', run: 'front-fist-closed', jump: 'front-fist-closed',
  shoot: 'front-fist-closed', hit: 'front-fist-closed', aim: 'front-fist-closed',
};
export function fistTracks(anim: string): unknown[] {
  const want = FIST_BY_SHOT[anim];
  if (!want || want === SETUP_FIST) return [];
  return [{ slot: 'front-fist', property: 'attachment', keys: [{ t: 0, v: want }] }];
}

export const ATTACHMENTS: Record<string, unknown[]> = {
  shoot: [
    {
      slot: 'muzzle',
      property: 'attachment',
      keys: [
        { t: 0, v: null },
        { t: 5 / 30, v: 'muzzle01' },
        { t: 6 / 30, v: 'muzzle02' },
        { t: 7 / 30, v: 'muzzle03' },
        { t: 10 / 30, v: 'muzzle04' },
        { t: 11 / 30, v: 'muzzle05' },
        { t: 12 / 30, v: null },
      ],
    },
  ],
};
