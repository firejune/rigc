/**
 * §8's second draw-order test, like-for-like, on MY OWN build: render the
 * candidate under two slot orders and measure the same feature on both sides,
 * against the reference's reading of it.
 *
 * The ruler is the brief's own: the gun's teal, taken as the LOWER share of the
 * teal split at 45% of the subject's box height (the figure's hair is the same
 * colour, so a whole-frame teal count is gun + head and decides nothing).
 *
 * Control first, per the protocol: the estimator must reproduce a reading whose
 * answer is already known — the gun unoccluded on `idle`, where the brief and
 * both earlier passes agree it reads 322-338 px on all 21 frames.
 */
import { loadPosable, sampleAnimation, renderFrame, type Posable } from '../src/render.ts';
import { readPlate, type Plate } from '../tools/plate.ts';
import { fullViewport, BG } from './harness.ts';
import { REF } from './fit.ts';

const view = fullViewport(`${REF}/frames.json`);

/** the brief's gun predicate: teal. Satisfied by the gun AND by the hair. */
function isTeal(r: number, g: number, b: number): boolean {
  return g > 100 && g > r + 30 && b > r + 15 && b < g + 40;
}
function drawn(p: Plate, i: number): boolean {
  return Math.abs(p.data[i] - BG[0]) > 8 || Math.abs(p.data[i + 1] - BG[1]) > 8 || Math.abs(p.data[i + 2] - BG[2]) > 8;
}
/** lower share of the teal, split at 45% of the drawn box height = the gun. */
function gunTeal(p: Plate): { gun: number; head: number } {
  let y0 = 1e9, y1 = -1;
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
    if (drawn(p, (y * p.width + x) * 4)) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (y1 < 0) return { gun: 0, head: 0 };
  const split = y0 + 0.45 * (y1 - y0);
  let gun = 0, head = 0;
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
    const i = (y * p.width + x) * 4;
    if (!drawn(p, i)) continue;
    if (!isTeal(p.data[i], p.data[i + 1], p.data[i + 2])) continue;
    if (y >= split) gun++; else head++;
  }
  return { gun, head };
}

const dirs = process.argv.slice(2);
const loaded: [string, Posable][] = dirs.map((d) => [d, loadPosable(`${d}/skeleton.json`, `${d}/skeleton.atlas`, d)]);

console.log('=== CONTROL: the gun unoccluded on idle (known answer 322-338 px on all 21 frames) ===');
{
  const g: number[] = [], h: number[] = [];
  for (let i = 0; i < 21; i++) {
    const r = gunTeal(readPlate(`${REF}/idle/f${String(i).padStart(4, '0')}.png`));
    g.push(r.gun); h.push(r.head);
  }
  console.log(`  reference idle gun share  ${Math.min(...g)}-${Math.max(...g)} px   head share ${Math.min(...h)}-${Math.max(...h)} px`);
  const ok = Math.min(...g) >= 315 && Math.max(...g) <= 345;
  console.log(`  ⇒ estimator ${ok ? 'REPRODUCES' : 'DOES NOT reproduce'} the known reading — ${ok ? 'believe what follows' : 'STOP, fix the estimator'}`);
}

console.log('\n=== EDGE 1: the near leg vs the gun — walk f6 and f9 ===');
console.log('   reference reads 36 px at f6 and 47 px at f9 (about one eighth of unoccluded)');
for (const f of [6, 9]) {
  const r = gunTeal(readPlate(`${REF}/walk/f${String(f).padStart(4, '0')}.png`));
  console.log(`  reference  walk/f000${f}  gun ${r.gun} px  head ${r.head} px`);
  for (const [d, p] of loaded) {
    const frames = sampleAnimation(p.data, 'walk', 12);
    const m = gunTeal(renderFrame(frames[f], p.pages, view, BG));
    console.log(`  ${d.padEnd(52)} gun ${String(m.gun).padStart(4)} px  head ${String(m.head).padStart(4)} px`);
  }
}

console.log('\n=== EDGE 2: the near leg vs the far leg — walk f3, f4, f10 ===');
console.log('   the two shins superimpose; what survives the superposition is drawn in front.');
console.log('   measured per-frame MAE over the reference\'s own drawn pixels, legs region only');
for (const f of [3, 4, 10]) {
  const ref = readPlate(`${REF}/walk/f${String(f).padStart(4, '0')}.png`);
  const out: string[] = [];
  for (const [d, p] of loaded) {
    const frames = sampleAnimation(p.data, 'walk', 12);
    const mine = renderFrame(frames[f], p.pages, view, BG);
    // legs only: rows below 60% of the reference's own drawn box
    let y0 = 1e9, y1 = -1;
    for (let y = 0; y < ref.height; y++) for (let x = 0; x < ref.width; x++) if (drawn(ref, (y * ref.width + x) * 4)) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const from = Math.round(y0 + 0.6 * (y1 - y0));
    let acc = 0, n = 0;
    for (let y = from; y <= y1; y++) for (let x = 0; x < ref.width; x++) {
      const i = (y * ref.width + x) * 4;
      if (!drawn(ref, i)) continue;
      acc += Math.abs(mine.data[i] - ref.data[i]) + Math.abs(mine.data[i + 1] - ref.data[i + 1]) + Math.abs(mine.data[i + 2] - ref.data[i + 2]);
      n += 3;
    }
    out.push(`${d.split('/').pop()} ${(acc / n).toFixed(2)}`);
  }
  console.log(`  walk/f00${String(f).padStart(2, '0')}  ${out.join('   ')}`);
}
