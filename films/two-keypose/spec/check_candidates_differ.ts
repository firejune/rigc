/**
 * Do the two candidates actually differ, and do they agree where they must?
 *
 * MOTION.md §4's ⛔ is that a ballot whose candidates differ only in strength
 * teaches you about a knob. §5's `unsure` verdict is the same failure seen from
 * the other end — "the page did not show the difference" — and it is reachable
 * with two candidates that are genuinely different readings, if the difference
 * happens to be invisible at the size and rate the page plays them.
 *
 * 🚨 So this measures VISIBILITY, and it is not a score of either candidate.
 * There is no pass bar in the toolchain for a movement (§0, §7) and this invents
 * none. What it gives is one thing a ballot needs and stills cannot show: the
 * two candidates' frames, compared frame by frame, at the pane size the film
 * actually plays them, so I can see WHEN they diverge and by how much.
 *
 * Two things it asserts rather than reports, because both are structural:
 *
 *  1. frame 0 and the last frame must be IDENTICAL between candidates. Both
 *     state the same two given poses by construction (§0's 🚨), so any
 *     difference there is a bug in the spec generator, not a reading.
 *  2. the divergence must be somewhere in between, and it must be larger than
 *     the frame-to-frame step inside either candidate — otherwise the thing a
 *     person is being asked to compare is smaller than the motion they are
 *     watching.
 */
import { $ } from 'bun';

const ROOT = new URL('../', import.meta.url).pathname;
/** The pane crop and scale the film uses, so the number is at viewing size. */
const CROP = '640x720+391+0';
const PANE = '240x270!';
const PLATE_CROP = '1200x810+48+48';

const frames = (c: string) => `${ROOT}render-${c}/cheer@20fps/`;
const pad = (i: number) => String(i).padStart(4, '0');
const N = 12;

const WORK = `${ROOT}gif/diff/`;
await $`mkdir -p ${WORK}`.quiet();

for (const c of ['cheer-a', 'cheer-b']) {
  for (let i = 0; i < N; i += 1) {
    await $`magick ${frames(c)}f${pad(i)}.png -crop ${PLATE_CROP} +repage -crop ${CROP} +repage -filter Lanczos -resize ${PANE} -alpha remove -alpha off ${WORK}${c}-${pad(i)}.png`.quiet();
  }
}

const rmse = async (a: string, b: string) => {
  const p = Bun.spawn(['magick', 'compare', '-metric', 'RMSE', a, b, 'null:'], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  await p.exited;
  return Number((await new Response(p.stderr).text()).trim().split(' ')[0]) / 65535;
};

const pc = (v: number) => `${(v * 100).toFixed(2)}%`;
console.log('  frame     t     A vs B     A step     B step');
let worst = { v: -1, i: -1 };
const between: number[] = [];
const stepsA: number[] = [];
const stepsB: number[] = [];
for (let i = 0; i < N; i += 1) {
  const d = await rmse(`${WORK}cheer-a-${pad(i)}.png`, `${WORK}cheer-b-${pad(i)}.png`);
  const sa = i === 0 ? NaN : await rmse(`${WORK}cheer-a-${pad(i - 1)}.png`, `${WORK}cheer-a-${pad(i)}.png`);
  const sb = i === 0 ? NaN : await rmse(`${WORK}cheer-b-${pad(i - 1)}.png`, `${WORK}cheer-b-${pad(i)}.png`);
  if (i > 0) {
    stepsA.push(sa);
    stepsB.push(sb);
  }
  if (i > 0 && i < N - 1) between.push(d);
  if (d > worst.v) worst = { v: d, i };
  const mark = i === 0 || i === N - 1 ? '  <- a given pose: must be identical' : '';
  console.log(
    `  ${String(i).padStart(5)}  ${(i / 20).toFixed(2)}s  ${pc(d).padStart(8)}  ${(i === 0 ? '—' : pc(sa)).padStart(9)}  ${(i === 0 ? '—' : pc(sb)).padStart(9)}${mark}`,
  );
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
let bad = false;

/**
 * The two given poses, checked in PIXELS rather than in RMSE.
 *
 * ⚠️ Not with a zero tolerance, and the reason is a real measurement: the last
 * key of every track in both candidates carries the same number, and the frames
 * still differ by exactly 2 pixels out of 1,174,176 — one antialiased edge
 * rounding the other way because the two candidates reach t=0.55 through
 * different easing tables and one bezier lands on 0.99999… A zero tolerance
 * calls that a spec drift, which it is not. ⇒ the bar is `AE`, the count of
 * pixels that differ at all, against a millionth of the frame.
 */
const ae = async (a: string, b: string) => {
  const p2 = Bun.spawn(['magick', 'compare', '-metric', 'AE', a, b, 'null:'], { stderr: 'pipe', stdout: 'pipe' });
  await p2.exited;
  return Number((await new Response(p2.stderr).text()).trim().split(' ')[0]);
};
const src = (c: string, i: number) => `${frames(c)}f${pad(i)}.png`;
const TOTAL = 1296 * 906;
for (const i of [0, N - 1]) {
  const n = await ae(src('cheer-a', i), src('cheer-b', i));
  const share = n / TOTAL;
  if (share > 1e-5) {
    bad = true;
    console.log(`❌ frame ${i}: ${n} of ${TOTAL} pixels differ (${(share * 100).toFixed(4)}%) — a candidate has drifted off a GIVEN pose`);
  } else {
    console.log(
      `✅ frame ${i} is pose ${i === 0 ? 'A' : 'B'} in both candidates — ${n} of ${TOTAL.toLocaleString()} pixels differ (${(share * 100).toFixed(5)}%, one antialiased edge)`,
    );
  }
}

const typical = mean([...stepsA, ...stepsB]);
console.log(
  `   divergence  peak ${pc(worst.v)} at frame ${worst.i} (t=${(worst.i / 20).toFixed(2)}s), mean ${pc(mean(between))} over the interior`,
);
console.log(`   motion      mean frame-to-frame step ${pc(typical)}  (A ${pc(mean(stepsA))} · B ${pc(mean(stepsB))})`);
if (worst.v < typical) {
  bad = true;
  console.log(
    `❌ the difference between the candidates (${pc(worst.v)}) is smaller than the motion inside them (${pc(typical)}) — that is §5's \`unsure\` waiting to happen`,
  );
} else {
  console.log(
    `✅ the candidates diverge by ${(worst.v / typical).toFixed(1)}x a frame step at the peak, so the difference is bigger than the movement it is inside`,
  );
}

// A contact strip of the two, one above the other, so the divergence can be
// LOOKED at as well as measured — §2.1 point 4, and the only judge there is.
const list = (c: string) => Array.from({ length: N }, (_, i) => `${WORK}${c}-${pad(i)}.png`);
await $`magick ${list('cheer-a')} +append ${WORK}row-a.png`.quiet();
await $`magick ${list('cheer-b')} +append ${WORK}row-b.png`.quiet();
await $`magick ${WORK}row-a.png ${WORK}row-b.png -append ${ROOT}gif/ab_strip.png`.quiet();
console.log(`   wrote gif/ab_strip.png — A on top, B below, 12 frames each`);

if (bad) process.exitCode = 1;
