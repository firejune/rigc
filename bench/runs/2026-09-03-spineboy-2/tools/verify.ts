/**
 * The control on the whole pipeline: does the COMPILED animation, stepped by
 * `spine-core`'s own state machine, land on the poses this run fitted?
 *
 * Everything upstream of the build works in this run's own pose vectors, and a
 * pose vector becomes a `rotate` value on the assumption that Spine's rotate
 * timeline is an OFFSET from the setup rotation and its translate timeline an
 * offset from the setup position. If that assumption is wrong the rendered
 * result is wrong everywhere at once and no single measure names the cause —
 * §8's "a measurement artefact is indistinguishable from a fact about the
 * animation until something contradicts it".
 *
 * So this compares two renders of the same instant: `applyPose` on the pose
 * store, and `sampleAnimation` on the built artifact. Where the key plan kept a
 * frame exactly, the two should agree to the rasteriser's own last bit; where
 * the plan spanned it, they differ by the reduction and no more.
 *
 * usage: verify.ts <built-dir> [poses.json]
 */
import { readFileSync } from 'node:fs';
import { sampleAnimation, renderFrame } from '../../../../src/render';
import { BACKGROUND, changedPixels, declaredViewport, sidecarOf } from './geom';
import { applyPose, applySkin, loadCandidate, renderPose, type Pose, type Skin } from './fitlib';

const REF = process.env.REF ?? 'bench/reference/spineboy/ess';
const POSES = process.argv[3] ?? 'bench/runs/2026-09-03-spineboy-2/fit/poses.json';
const SKINS = process.env.SKINS ?? 'bench/runs/2026-09-03-spineboy-2/fit/skins.json';
const built = process.argv[2] ?? '/tmp/sb2/cand';

const sidecar = sidecarOf(REF);
const view = declaredViewport(sidecar);
const c = loadCandidate(built);
const stored = JSON.parse(readFileSync(POSES, 'utf8')) as Record<string, Record<string, { pose: Pose }>>;
let skins: Record<string, Record<string, Skin>> = {};
try {
  skins = JSON.parse(readFileSync(SKINS, 'utf8'));
} catch {
  skins = {};
}

let worst = { set: '', index: -1, px: -1 };
const perSet: { set: string; frames: number; identical: number; worst: number; mean: number }[] = [];

for (const s of sidecar.sets) {
  const got = stored[s.dir];
  if (!got) continue;
  const frames = sampleAnimation(c.data, s.animation, s.fps);
  let identical = 0;
  let sum = 0;
  let setWorst = 0;
  let n = 0;
  for (const key of Object.keys(got)) {
    const i = Number(key);
    const compiled = frames[i];
    if (!compiled) continue;
    const a = renderFrame(compiled, c.pages, view, BACKGROUND);
    applyPose(c.skeleton, got[key].pose);
    const skin = skins[s.dir]?.[key];
    if (skin) applySkin(c.skeleton, skin);
    const b = renderPose(c, view);
    const px = changedPixels(a, b, 8);
    n++;
    sum += px;
    setWorst = Math.max(setWorst, px);
    if (px === 0) identical++;
    if (px > worst.px) worst = { set: s.dir, index: i, px };
  }
  perSet.push({ set: s.dir, frames: n, identical, worst: setWorst, mean: n === 0 ? 0 : sum / n });
}

process.stdout.write(
  'compiled animation vs the fitted pose store, per set (pixels differing at 8/255 over the declared box):\n',
);
for (const row of perSet) {
  process.stdout.write(
    `  ${row.set.padEnd(14)} ${String(row.frames).padStart(3)} frame(s)  identical ${String(row.identical).padStart(3)}  ` +
      `mean ${row.mean.toFixed(1).padStart(7)} px  worst ${String(row.worst).padStart(5)} px\n`,
  );
}
process.stdout.write(`\nworst overall: ${worst.set}/f${worst.index} at ${worst.px} px\n`);
process.stdout.write(
  'A frame the key plan kept exactly should read 0; a frame it spanned reads the reduction error\n' +
    'and nothing else. A whole SET reading thousands of pixels is a convention error, not a reduction.\n',
);
