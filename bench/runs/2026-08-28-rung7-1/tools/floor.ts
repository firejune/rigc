/**
 * Rung 7 — the floor a candidate built from the loose PNGs cannot go below.
 *
 * examples/7-anticipation/export/7-anticipation.atlas carries `scale: 0.5`, so the
 * reference frames were drawn from a HALF-resolution texture and this candidate is
 * drawn from the full-resolution PNGs rigc packs itself. AUTHORING.md §9.2: the
 * pixels are the same shape in the same place, they are filtered from a different
 * source, the difference lands on the outline of every part in every frame, and no
 * key can move it.
 *
 * The rest pose is where that floor is measurable, because there the answer is known
 * independently: the brief measures the standing sack at 87-88 x 153-154 px, and the
 * art's own opaque box at the frames' scale is 87.3 x 153.6 — so the setup pose IS
 * the art at scale 1, and any residual there is the floor rather than a wrong key.
 */
import { Plate, readPlate } from '../../../../tools/plate.ts';
import { applyPose, classify, framesBox, makeRig, objective, renderInto, windowViewport, drawnCount } from './pose.ts';

const ROOT = 'bench/reference-local/7-anticipation';
const ref = framesBox(ROOT);
const view = windowViewport(ref, 0, 0, ref.width, ref.height, 1);

const dir = process.argv[2] ?? 'bench/runs/2026-08-28-rung7-1/spine';
const atlasDir = process.argv[3] ?? null;
const rig = makeRig(dir);
applyPose(rig, [], []);
const mine = new Plate(ref.width, ref.height);
renderInto(rig, mine, view);

const ms = new Uint8Array(ref.width * ref.height);
const mc = new Uint8Array(ref.width * ref.height);
const myCounts = classify(mine, ms, mc);

const iou = (a: Uint8Array, b: Uint8Array): [number, number, number] => {
  let i = 0;
  let u = 0;
  let d = 0;
  for (let k = 0; k < a.length; k++) {
    if (a[k] && b[k]) i++;
    if (a[k] || b[k]) u++;
    if (a[k] !== b[k]) d++;
  }
  return [u ? i / u : 1, d, u];
};

console.log(`candidate: ${dir}${atlasDir ? `  (atlas ${atlasDir})` : ''}`);
console.log('the setup pose against the three frames the brief calls the same standing pose\n');
console.log('  frame                        sack IoU   cape IoU   sackΔ  capeΔ   my sack  ref sack   my cape  ref cape   MAE/ref-px');
for (const f of ['hello/f0000', 'fall-in/f0020', 'cape-follow-example/f0000']) {
  const rp = readPlate(`${ROOT}/${f}.png`);
  const rs = new Uint8Array(ref.width * ref.height);
  const rc = new Uint8Array(ref.width * ref.height);
  const rCounts = classify(rp, rs, rc);
  const [si, sd] = iou(ms, rs);
  const [ci, cd] = iou(mc, rc);
  console.log(
    `  ${f.padEnd(28)} ${si.toFixed(4)}     ${ci.toFixed(4)}   ${String(sd).padStart(5)}  ${String(cd).padStart(5)}   ` +
      `${String(myCounts.sackN).padStart(6)} ${String(rCounts.sackN).padStart(6)}    ${String(myCounts.capeN).padStart(6)} ${String(rCounts.capeN).padStart(6)}     ` +
      `${objective(mine, rp, drawnCount(rp)).toFixed(3)}`,
  );
}
