/**
 * The `pendulum` shot, measured off its rendered frames only.
 *
 * Six orange components per frame — the discus's rim, the bead at the top of each
 * of the four links, and the eyelet's disc. The rim's two farthest-apart pixels
 * give the discus its centre and its angle; the five bead centroids give the
 * chain its shape. Nothing here needs an optimiser, because nothing in this shot
 * deforms: every pose in it is six numbers.
 *
 * `bun bench/runs/2026-08-23-rung8-1/tools/measure-pendulum.ts [12|24] [--json out]`
 */
import { writeFileSync } from 'node:fs';
import type { Plate, RGBA } from '../../../../tools/plate.ts';
import { loadSet, sidecar, orangeMask, components, mask, boxOf } from './frames.ts';

export interface BeadReading {
  cx: number;
  cy: number;
  px: number;
}

export interface PendulumFrame {
  index: number;
  /** Rim tips, left then right, in frame pixels. */
  tipL: [number, number];
  tipR: [number, number];
  /** Discus centre: the tips' midpoint. */
  cx: number;
  cy: number;
  /** Degrees, positive when the right tip is higher (screen y is down). */
  angle: number;
  /** Tip-to-tip length in frame pixels. */
  rim: number;
  /** Bead centroids, discus end first, eyelet last. */
  beads: BeadReading[];
  /** Drawn area of the whole subject. */
  area: number;
}

function farthestPair(points: [number, number][]): [[number, number], [number, number]] {
  // The rim is a thin arc of at most a few thousand pixels; the hull would be
  // faster and this is exact.
  let best = -1;
  let a: [number, number] = points[0];
  let b: [number, number] = points[0];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[i][0] - points[j][0];
      const dy = points[i][1] - points[j][1];
      const d = dx * dx + dy * dy;
      if (d > best) {
        best = d;
        a = points[i];
        b = points[j];
      }
    }
  }
  return [a, b];
}

export function measurePendulumPlate(plate: Plate, background: RGBA, index = 0): PendulumFrame {
  {
    const w = plate.width;
    const om = orangeMask(plate);
    const comps = components(om, w, plate.height).filter((c) => c.length >= 12);
    if (comps.length !== 6) throw new Error(`frame ${index}: ${comps.length} orange components, expected 6`);
    const info = comps.map((c) => {
      let cx = 0;
      let cy = 0;
      let minX = Infinity;
      let maxX = -Infinity;
      for (const p of c) {
        const x = p % w;
        const y = Math.floor(p / w);
        cx += x;
        cy += y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
      return { comp: c, cx: cx / c.length, cy: cy / c.length, width: maxX - minX + 1, px: c.length };
    });
    // The rim is the widest thing in the frame by a factor of five.
    info.sort((a, b) => b.width - a.width);
    const rim = info[0];
    const beadsRaw = info.slice(1);
    const pts: [number, number][] = rim.comp.map((p) => [p % w, Math.floor(p / w)]);
    const [p1, p2] = farthestPair(pts);
    const [tipL, tipR] = p1[0] <= p2[0] ? [p1, p2] : [p2, p1];
    const cx = (tipL[0] + tipR[0]) / 2;
    const cy = (tipL[1] + tipR[1]) / 2;
    // Screen y runs down, so a right tip that is higher has a smaller y.
    const angle = (Math.atan2(tipL[1] - tipR[1], tipR[0] - tipL[0]) * 180) / Math.PI;
    const rimLen = Math.hypot(tipR[0] - tipL[0], tipR[1] - tipL[1]);

    // Chain order: start at the bead nearest the discus centre, then walk to the
    // nearest bead not yet taken. A distance-from-discus sort gets f26 wrong,
    // where the chain curls back under the disc.
    const remaining = beadsRaw.slice();
    const beads: BeadReading[] = [];
    let from: [number, number] = [cx, cy];
    while (remaining.length) {
      let bi = 0;
      let bd = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = Math.hypot(remaining[i].cx - from[0], remaining[i].cy - from[1]);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      const taken = remaining.splice(bi, 1)[0];
      beads.push({ cx: taken.cx, cy: taken.cy, px: taken.px });
      from = [taken.cx, taken.cy];
    }

    const subject = mask(plate, background, 8);
    const box = boxOf(subject, w, plate.height);
    return {
      index,
      tipL: [tipL[0], tipL[1]],
      tipR: [tipR[0], tipR[1]],
      cx,
      cy,
      angle,
      rim: rimLen,
      beads,
      area: box ? box.count : 0,
    };
  }
}

export function measurePendulum(dir: string): PendulumFrame[] {
  const side = sidecar('pendulum');
  const bg: RGBA = [side.background[0], side.background[1], side.background[2], side.background[3]];
  const plates = loadSet('pendulum', dir);
  return plates.map((plate, index) => measurePendulumPlate(plate, bg, index));
}

if (import.meta.main) {
  const fps = process.argv[2] === '24' ? 24 : 12;
  const dir = fps === 24 ? 'follow-through@24fps' : 'follow-through';
  const frames = measurePendulum(dir);
  const jsonAt = process.argv.indexOf('--json');
  if (jsonAt >= 0) writeFileSync(process.argv[jsonAt + 1], JSON.stringify(frames, null, 1));
  console.log(`# pendulum ${dir} — ${frames.length} frames`);
  console.log('idx  centre            angle    rim    area   beads (x,y)');
  for (const f of frames) {
    console.log(
      `${String(f.index).padStart(3)}  (${f.cx.toFixed(1).padStart(6)},${f.cy.toFixed(1).padStart(6)})  ` +
        `${f.angle.toFixed(1).padStart(6)}  ${f.rim.toFixed(1)}  ${String(f.area).padStart(5)}  ` +
        f.beads.map((b) => `(${b.cx.toFixed(0)},${b.cy.toFixed(0)})`).join(' '),
    );
  }
  const rims = frames.map((f) => f.rim);
  const areas = frames.map((f) => f.area);
  const spac: number[][] = [[], [], [], []];
  for (const f of frames) {
    for (let i = 0; i < 4; i++) {
      spac[i].push(Math.hypot(f.beads[i + 1].cx - f.beads[i].cx, f.beads[i + 1].cy - f.beads[i].cy));
    }
  }
  console.log(`\nrim  ${Math.min(...rims).toFixed(1)}–${Math.max(...rims).toFixed(1)} px`);
  console.log(`area ${Math.min(...areas)}–${Math.max(...areas)} px`);
  spac.forEach((s, i) => {
    const mean = s.reduce((a, b) => a + b, 0) / s.length;
    console.log(
      `joint ${i + 1}→${i + 2}  mean ${mean.toFixed(2)} px  range ${Math.min(...s).toFixed(2)}–${Math.max(...s).toFixed(2)}`,
    );
  });
  const angles = frames.map((f) => f.angle);
  console.log(`tilt ${Math.min(...angles).toFixed(1)}° … ${Math.max(...angles).toFixed(1)}°`);
}
