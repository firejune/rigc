/**
 * The benchmark ladder: which official Spine example is which rung, and which
 * file in it is the reference.
 *
 * ⚠️ This is a table and not a naming rule, because there is no naming rule.
 * The obvious one — `examples/<name>/export/<name>-ess.json` — is wrong on four
 * of the nine examples: `6-arcs` ships only a `-pro` export, `7-anticipation`'s
 * skeleton is called `sack-pro` after its subject rather than its directory,
 * and `1-weight-and-mass` and `8-follow-through` ship two skeletons each. A
 * rule that is right five times out of nine is worse than a table, because the
 * four failures look like missing files rather than like a wrong assumption.
 *
 * The rung ORDER is not the numeric order of the directories: rung 3 is the
 * smallest skeleton in the corpus (3 bones, 2 slots, 2 animations) and is the
 * first one attempted. `docs/LADDER.md` carries the order, the per-rung gating
 * features and the status; this file carries only what `bench` has to resolve.
 */

/** `rung` counts towards the rung; `stretch` is reported and does not. */
export type RungRole = 'rung' | 'stretch';

export interface RungSkeleton {
  /** Short label for the report, unique within the rung. */
  label: string;
  /** File name inside the example's `export/` directory. */
  file: string;
  /** Atlas file name inside the same directory. */
  atlas: string;
  role: RungRole;
}

export interface Rung {
  /** What `bench <rung>` is spelled as. */
  id: string;
  /** Directory under `examples/`. */
  example: string;
  /** One line on what this rung is testing, from SPEC_COVERAGE part 4-1. */
  gates: string;
  skeletons: RungSkeleton[];
}

export const LADDER: readonly Rung[] = [
  {
    id: '1',
    example: '1-weight-and-mass',
    gates: 'translatex/translatey/shear bone timelines; bone setup length; a skeleton with zero animations (drop)',
    skeletons: [
      { label: 'balls', file: '1-weight-and-mass-balls-ess.json', atlas: '1-weight-and-mass.atlas', role: 'rung' },
      { label: 'drop', file: '1-weight-and-mass-drop-ess.json', atlas: '1-weight-and-mass.atlas', role: 'rung' },
    ],
  },
  {
    id: '2',
    example: '2-the-12-principles',
    gates: 'slot blend modes (4 additive + 4 multiply); bone inherit ≠ Normal',
    skeletons: [
      { label: 'ess', file: '2-the-12-principles-ess.json', atlas: '2-the-12-principles.atlas', role: 'rung' },
    ],
  },
  {
    id: '3',
    example: '3-timing-and-spacing',
    gates: 'nothing new — the smallest skeleton in the corpus, and the first rung to attempt',
    skeletons: [
      { label: 'ess', file: '3-timing-and-spacing-ess.json', atlas: '3-timing-and-spacing.atlas', role: 'rung' },
    ],
  },
  {
    id: '4',
    example: '4-wave-principle',
    gates: 'nothing structurally new — a volume test (9 bones, 9 slots, 3 animations, 470 bezier keys)',
    skeletons: [{ label: 'ess', file: '4-wave-principle-ess.json', atlas: '4-wave-principle.atlas', role: 'rung' }],
  },
  {
    id: '5',
    example: '5-squash-and-stretch',
    gates: 'drawOrder timeline (first appearance); inherit: onlyTranslation; non-unit setup scale',
    skeletons: [
      { label: 'ess', file: '5-squash-and-stretch-ess.json', atlas: '5-squash-and-stretch.atlas', role: 'rung' },
    ],
  },
  {
    id: '6',
    example: '6-arcs',
    gates: 'transform constraints (first appearance, static); weighted meshes from authored geometry; mesh edges',
    skeletons: [{ label: 'pro', file: '6-arcs-pro.json', atlas: '6-arcs.atlas', role: 'rung' }],
  },
  {
    id: '7',
    example: '7-anticipation',
    gates: 'physics timelines; a KEYED transform timeline; deform (first appearance); 20 physics constraints',
    skeletons: [{ label: 'sack-pro', file: 'sack-pro.json', atlas: '7-anticipation.atlas', role: 'rung' }],
  },
  {
    id: '8',
    example: '8-follow-through',
    gates: 'nothing new — transform constraints and weighted meshes both arrived at rung 6',
    skeletons: [
      { label: 'ball', file: '8-follow-through-pro-ball.json', atlas: '8-follow-through.atlas', role: 'rung' },
      { label: 'pendulum', file: '8-follow-through-pro-pendulum.json', atlas: '8-follow-through.atlas', role: 'rung' },
    ],
  },
  {
    id: 'spineboy',
    example: 'spineboy',
    gates: 'IK, events, bounding box, clipping, unweighted meshes — and scale: ess 18 bones/20 slots/8 animations, pro 67 bones/52 slots/11 animations',
    skeletons: [
      { label: 'ess', file: 'spineboy-ess.json', atlas: 'spineboy.atlas', role: 'rung' },
      // `-pro` is reported and does not count. It is a harder rig than the
      // graduation exam itself, and folding it in would make the exam
      // unpassable for a reason that has nothing to do with passing it.
      { label: 'pro', file: 'spineboy-pro.json', atlas: 'spineboy.atlas', role: 'stretch' },
    ],
  },
];

export function findRung(id: string): Rung | undefined {
  return LADDER.find((r) => r.id === id);
}

export const RUNG_IDS: readonly string[] = LADDER.map((r) => r.id);
