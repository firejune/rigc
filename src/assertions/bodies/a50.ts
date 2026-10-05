/**
 * A50, the body (issue #1168): the stage box a rig asked for is the stage —
 * in the Spine files a consumer ships, read back the way that consumer reads
 * it.
 *
 * Since issue #907 the Spine header carries the setup-pose bounding box and the
 * stage is stated only in `skeleton.model.json`, which a consumer does not ship.
 * A rig that asks (`skeleton.stageBox`) carries the stage as a bounding-box
 * attachment, whose numbers `compile` writes from the stage. This rule holds
 * that box to the stage the document states, on both readings a consumer has:
 *
 *   1. **The data.** The slot carries, in the `default` skin under the asked
 *      name, an unweighted bounding box of four vertices, and its stored
 *      vertices are the stage's corners — `(x, y)`, `(x + w, y)`,
 *      `(x + w, y + h)`, `(x, y + h)` — each exactly, as the float32 the
 *      runtime loads. That is what a reader of the attachment gets without
 *      posing anything.
 *   2. **The setup pose.** Its world vertices at the setup pose — constraints
 *      applied, no physics, no skin set — are those corners as the runtime
 *      poses them on an unrotated root: through the frame the core computes
 *      for a root that states no transform (`worldTransforms` in
 *      `../../core/world.ts`, whose unrotated `b` is cos 90° at the runtime's
 *      pi, −2.3e-8, not 0), compared on the header's grid
 *      (`headerBoxNumber` in `../../compile.ts`) — the tolerance the header's
 *      own box is held at. A constraint that moves the box's bone at setup
 *      is caught here and nowhere else: `compile` poses no constraint.
 *
 * **SKIP** where nothing asks: an export or a directory with no `/3` document,
 * and a document that states a stage and no box — a rig that does not ask is
 * unmeasured, never certified.
 *
 * Links nothing from the runtime.
 */
import type { Verdicts } from '../harness.ts';
import type { StageBoxFacts } from '../facts/stage_box.ts';
import { worldTransforms } from '../../core/world.ts';
import { headerBoxNumber } from '../../compile.ts';

const CODE = 'A50_STAGE_BOX_IS_THE_STAGE';

/** The stage's four corners in Spine world, bottom-left first and counter-clockwise — the order `compile` writes. */
export function stageCorners(stage: { x: number; y: number; width: number; height: number }): number[] {
  const right = stage.x + stage.width;
  const top = stage.y + stage.height;
  return [stage.x, stage.y, right, stage.y, right, top, stage.x, top];
}

export function a50StageBoxIsTheStage({ fail, skip }: Verdicts, facts: StageBoxFacts): void {
  const { asked } = facts;
  if (asked === null) return skip(CODE, facts.why);
  const where = `the stage box (slot "${asked.slot}", attachment "${asked.attachment}")`;
  const { x, y, width, height } = asked.stage;
  const required = `the stage ${x},${y} ${width}x${height}`;
  if (!facts.slot) return fail(CODE, `${where}: the skeleton has no slot "${asked.slot}", so a consumer finds no stage — ${required} — in it`);
  const held = facts.held;
  if (held === null) {
    return fail(CODE, `${where}: the default skin holds no attachment "${asked.attachment}" on slot "${asked.slot}", so a consumer finds no stage — ${required} — in it`);
  }
  if (held.type !== 'boundingbox') {
    return fail(CODE, `${where}: the attachment is a ${held.type}, not a bounding box — ${required} travels as a boundingbox attachment, which every runtime returns by slot and name`);
  }
  if (held.weighted) {
    return fail(CODE, `${where}: the box's vertices are bound to bones, and the stage is four unweighted corners in the root's space — ${required}`);
  }
  const corners = stageCorners(asked.stage);
  if (held.stored.length !== corners.length) {
    return fail(CODE, `${where}: the box holds ${held.stored.length / 2} vertices, and the stage is 4 corners — ${required}`);
  }
  let faults = 0;
  for (let i = 0; i < corners.length; i += 2) {
    const want = [Math.fround(corners[i]), Math.fround(corners[i + 1])];
    const found = [held.stored[i], held.stored[i + 1]];
    if (found[0] !== want[0] || found[1] !== want[1]) {
      faults++;
      fail(CODE, `${where}: vertex ${i / 2} is stored as (${found[0]}, ${found[1]}) and the stage's corner is (${want[0]}, ${want[1]}) — ${required}, bottom-left first and counter-clockwise`);
    }
  }
  if (faults > 0) return;
  if (typeof held.world === 'string') return fail(CODE, `${where}: its setup pose cannot be read — ${held.world}`);
  // The runtime's frame of a root that states no transform, as the core computes it.
  const frame = worldTransforms([{ name: 'root' }]).get('root');
  if (frame === undefined) throw new Error('internal: the core posed no frame for an unrotated root');
  for (let i = 0; i < corners.length; i += 2) {
    const cx = Math.fround(corners[i]);
    const cy = Math.fround(corners[i + 1]);
    const want = [headerBoxNumber(cx * frame.a + cy * frame.b + frame.worldX), headerBoxNumber(cx * frame.c + cy * frame.d + frame.worldY)];
    const found = [headerBoxNumber(held.world[i]), headerBoxNumber(held.world[i + 1])];
    if (found[0] !== want[0] || found[1] !== want[1]) {
      fail(
        CODE,
        `${where}: vertex ${i / 2} poses at (${found[0]}, ${found[1]}) at the setup pose and the stage's corner poses at ` +
          `(${want[0]}, ${want[1]}) on an unrotated root, on the header's grid — something moves the box's bone at setup ` +
          '(a constraint, or a pose the root does not state), so the box a consumer reads is not the stage',
      );
    }
  }
}
