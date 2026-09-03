/**
 * Did `rigc pose` actually read the picture?
 *
 * This is the one number in this whole build that is a real verification rather
 * than a look. `poses.ts` knows where every part is, by forward kinematics from
 * the bone table. `rigc pose` was handed the flat PNG and knows nothing at all.
 * If the two agree, the instrument read the picture; if they do not, one of them
 * is wrong and the disagreement says which parts.
 *
 * 🚨 It is NOT a grade of the movement, and MOTION.md §7 is explicit that
 * nothing in the toolchain can give one. It is also not a grade of `pose`: §2.2
 * says residuals are a trust signal and are not comparable across parts. What
 * this measures is one thing only — the round trip from a pose the rig states,
 * through rendered pixels, back to numbers.
 *
 * ── the frame↔world conversion, derived once ───────────────────────────────
 * The picture is `rigc render`'s frame cropped to the plate, so with the
 * sidecar's own viewport (x −51.2, height 966.4, scale 0.9375) and the crop the
 * assembler computes (+48+48):
 *
 *     picture_x = (wx − vp.x)·s − 48         = wx·s        (because 51.2·s = 48)
 *     picture_y = (vp.y + vp.h − wy)·s − 48  = (864 − wy)·s
 *
 * which is MOTION.md §2.2's `cropToSpineY` run backwards, applied ONCE, plus
 * `screenToSpineDegrees(d) = −d` for the rotation.
 */
import { POSE_A, POSE_B, partPlacements } from './poses';
import { PLATE_H } from '../art/layout';

const ROOT = new URL('../', import.meta.url).pathname;

interface Report {
  frame: { path: string; width: number; height: number };
  search: unknown;
  parts: {
    part: string;
    refusal: string | null;
    placement: { x: number; y: number; rotationDeg: number; scale: number; residual: number } | null;
        alternates?: { x: number; y: number; rotationDeg: number; scale: number; residual: number }[];
    ambiguous?: boolean;
  }[];
}

/** rigc's own render scale for a 1280-wide plate at `--max 1296`. */
const S = 0.9374999853155208;

const POSES = { poseA: POSE_A, poseB: POSE_B };

/**
 * ⚠️ `refusal` is read BEFORE `placement`, per MOTION.md §2.2: a `no-match`
 * refusal still fills the placement in on purpose, so code that reads the
 * placement first and treats a non-null value as an answer adopts a refused one.
 */
for (const [name, pose] of Object.entries(POSES)) {
  const file = Bun.file(`${ROOT}pose/${name}.json`);
  if (!(await file.exists())) {
    console.log(`(no ${name}.json yet — run rigc pose first)`);
    continue;
  }
  const report: Report = await file.json();
  const want = new Map(partPlacements(pose).map((p) => [p.image, p]));

  console.log(`\n${name}.json  ·  ${report.frame.width}x${report.frame.height}`);
  console.log(
    '  part              read x,y        expected x,y     Δpx    read rot   expected   Δ°     scale   pick',
  );

  const errs: { image: string; d: number; da: number }[] = [];
  for (const part of report.parts) {
    if (part.part === 'plate.png' || part.part === 'eyes_shut.png') continue;
    const w = want.get(part.part);
    if (w === undefined) continue;
    const ex = w.fx * S;
    const ey = w.fy * S;

    // Symmetric parts come back as an unordered set (§2.2's 🔀), and so do the
    // eyes against their own shut copy. Score against the CLOSEST of the
    // reported placement and its alternates — which is the honest reading of
    // "the instrument has run out and ordering them is your job", and it is
    // also what makes the number a statement about geometry rather than about
    // which of two identical legs rigc happened to name first.
    const options = [part.placement, ...(part.alternates ?? [])].filter(
      (p): p is NonNullable<typeof p> => p != null,
    );
    if (options.length === 0) {
      console.log(`  ${part.part.padEnd(16)} REFUSED (${part.refusal}) — no placement to compare`);
      continue;
    }
    let best = options[0];
    let bestD = Infinity;
    let bestI = 0;
    for (const [i, o] of options.entries()) {
      const d = Math.hypot(o.x - ex, o.y - ey);
      if (d < bestD) {
        bestD = d;
        best = o;
        bestI = i;
      }
    }
    const norm = (a: number) => ((((a % 360) + 540) % 360) - 180);
    const da = Math.abs(norm(best.rotationDeg - w.screenRot));
    errs.push({ image: part.part, d: bestD, da });
    const f = (n: number, w2 = 7) => n.toFixed(1).padStart(w2);
    console.log(
      `  ${part.part.padEnd(16)}${f(best.x)},${f(best.y, 6)}  ${f(ex)},${f(ey, 6)} ${f(bestD, 6)}  ${f(best.rotationDeg)}°  ${f(w.screenRot)}° ${f(da, 5)}   ${best.scale.toFixed(3)}   ${bestI === 0 ? 'primary' : `alt ${bestI + 1}`}${part.refusal === null ? '' : `  ⚠️ ${part.refusal}`}`,
    );
  }

  errs.sort((a, b) => b.d - a.d);
  const mean = errs.reduce((s, e) => s + e.d, 0) / errs.length;
  const meanA = errs.reduce((s, e) => s + e.da, 0) / errs.length;
  console.log(
    `  ⇒ ${errs.length} parts: centre Δ mean ${mean.toFixed(2)} px, worst ${errs[0].d.toFixed(2)} px (${errs[0].image});  ` +
      `rotation Δ mean ${meanA.toFixed(2)}°`,
  );
  console.log(
    `  ⇒ the picture was rendered at scale ${S.toFixed(4)}; the parts rigc placed cleanly read ` +
      `${report.parts
        .filter((p) => p.refusal === null && p.ambiguous !== true && p.placement != null)
        .map((p) => p.placement!.scale.toFixed(3))
        .join(' ')}`,
  );
}

void PLATE_H;
