/**
 * Author's refit — nudge one bone's keys until its own slot lands on the frame.
 *
 * The objective is the quantity `check`'s template matcher scores and nothing
 * else derived from it: the mean absolute RGB difference between the slot drawn
 * ALONE over the backdrop and the reference frame, over the slot's own drawn
 * pixels, at zero offset. That is `src/slots.ts`'s `best` when the placement is
 * already right, so driving it down is a placement fit against the frames and
 * not a fit against a score — a part whose own pixels agree with the picture is
 * a part that is where the picture puts it. The frame's union MAE is carried
 * beside it as a guard: a "fix" that lowers one and raises the other is not one.
 *
 * Per frame, coordinate descent over the key that frame samples, on
 * (x, y, rotate, scaleX, scaleY), with a shrinking step. Keys are one per
 * sampled frame in the inherited spec, so a key mostly owns its own frame; the
 * `--sweeps` passes are what settles the overlap with its neighbours.
 *
 * usage:
 *   bun tools/refit.ts --rig <r> --motion <m> --images <dir> --out <spineDir>
 *     --frames <dir> --set <dir> --slot <name> --bone <name>
 *     [--from <i>] [--to <i>] [--sweeps 2] [--write <motion.json>]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { AtlasAttachmentLoader, SkeletonJson, TextureAtlas } from '@esotericsoftware/spine-core';

import { compile } from '../../../../src/compile.ts';
import { isContent } from '../../../../src/framing.ts';
import { pageFor, projector, rasterisePiece, sampleAnimation, type Frame, type Viewport } from '../../../../src/render.ts';
import { Plate, readPlate, type RGBA } from '../../../../tools/plate.ts';

const CHANNELS = ['x', 'y', 'rotate', 'scaleX', 'scaleY'] as const;
type Channel = (typeof CHANNELS)[number];

interface Key {
  t: number;
  v: number[];
  ease?: string;
}
interface Track {
  bone: string;
  property: 'translate' | 'rotate' | 'scale';
  keys: Key[];
}

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? undefined : process.argv[at + 1];
}

/** Which (track, key, slot-in-value) a channel is, for one bone at one time. */
function locate(tracks: Track[], bone: string, channel: Channel, t: number): { key: Key; at: number } | null {
  const property = channel === 'rotate' ? 'rotate' : channel === 'x' || channel === 'y' ? 'translate' : 'scale';
  const track = tracks.find((k) => k.bone === bone && k.property === property);
  if (!track) return null;
  let best: Key | null = null;
  let bestGap = Infinity;
  for (const key of track.keys) {
    const gap = Math.abs(key.t - t);
    if (gap < bestGap) {
      bestGap = gap;
      best = key;
    }
  }
  if (!best || bestGap > 1 / 24) return null;
  const at = channel === 'x' || channel === 'scaleX' ? 0 : channel === 'y' || channel === 'scaleY' ? 1 : 0;
  return { key: best, at };
}

function main(): void {
  const rigPath = resolve(flag('rig') as string);
  const motionPath = resolve(flag('motion') as string);
  const imagesDir = resolve(flag('images') as string);
  const outDir = resolve(flag('out') as string);
  const framesRoot = resolve(flag('frames') as string);
  const setDir = flag('set') as string;
  const slot = flag('slot') as string;
  const bone = flag('bone') as string;
  const sweeps = Number(flag('sweeps') ?? 2);
  const write = flag('write');

  const sidecar = JSON.parse(readFileSync(join(framesRoot, 'frames.json'), 'utf8'));
  const background = sidecar.background as RGBA;
  const v = sidecar.viewport;
  const viewport: Viewport = {
    minX: v.x,
    minY: v.y,
    maxX: v.x + v.width,
    maxY: v.y + v.height,
    scale: v.scale,
    width: v.pixelWidth,
    height: v.pixelHeight,
  };
  const set = (sidecar.sets as Array<{ dir: string; animation: string; fps: number }>).find((s) => s.dir === setDir);
  if (!set) throw new Error(`no set ${setDir}`);

  const motion = JSON.parse(readFileSync(motionPath, 'utf8'));
  const tracks = motion.animations[set.animation].tracks as Track[];
  const scratch = join(tmpdir(), 'refit.motion.json');

  const references = new Map<number, Plate>();
  const referenceFor = (i: number): Plate => {
    const seen = references.get(i);
    if (seen) return seen;
    const p = readPlate(join(framesRoot, setDir, `f${String(i).padStart(4, '0')}.png`));
    references.set(i, p);
    return p;
  };

  // The atlas never changes across a refit — only the motion does — so its pages
  // are decoded once. Re-decoding three PNGs per trial was the whole cost.
  let pages = new Map<string, Plate>();
  const posed = (): Frame[] => {
    writeFileSync(scratch, JSON.stringify(motion));
    const result = compile({ rigPath, motionPath: scratch, outDir, imagesDir });
    const atlas = new TextureAtlas(result.atlasText);
    if (pages.size === 0) for (const page of atlas.pages) pages.set(page.name, readPlate(join(outDir, page.name)));
    const data = new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(JSON.parse(result.skeletonText));
    return sampleAnimation(data, set.animation, set.fps);
  };

  /** The slot alone over the backdrop, scored against the frame at zero offset. */
  const slotResidual = (
    frame: Frame,
    reference: Plate,
  ): { residual: number; sum: number; own: number; backdrop: number } => {
    const project = projector(viewport);
    let sum = 0;
    let own = 0;
    let backdrop = 0;
    const seen = new Set<number>();
    const patch = new Map<number, RGBA>();
    for (const piece of frame.pieces) {
      if (piece.slot !== slot) continue;
      rasterisePiece(pageFor(pages, piece), piece, project, viewport, (px, py, r, g, b, a) => {
        const at = py * viewport.width + px;
        const under = patch.get(at) ?? background;
        const sa = a / 255;
        patch.set(at, [
          Math.round(r * sa + under[0] * (1 - sa)),
          Math.round(g * sa + under[1] * (1 - sa)),
          Math.round(b * sa + under[2] * (1 - sa)),
          255,
        ]);
        seen.add(at);
      });
    }
    for (const at of seen) {
      const x = at % viewport.width;
      const y = (at - x) / viewport.width;
      const a = patch.get(at) as RGBA;
      const b = reference.get(x, y);
      sum += (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;
      own++;
      if (!isContent(reference, x, y, background)) backdrop++;
    }
    return { residual: own === 0 ? 0 : sum / own, sum, own, backdrop };
  };

  /**
   * `check`'s own figure of record for a frame: the absolute difference over
   * every pixel either side covers, divided by the pixels the REFERENCE drew.
   *
   * ⭐ The denominator is the shrink guard. A mean over the slot's own pixels
   * falls when the slot shrinks onto a patch that happens to agree — issue
   * #119's failure, and the first version of this tool walked the collar down to
   * 60 % of its area doing exactly that. A denominator nothing the candidate
   * draws can move charges it for the reference pixels it stops covering.
   */
  /**
   * ...optionally restricted to a FIXED window, which is what makes it usable on
   * one part.
   *
   * ⚠️ Whole-frame, this objective cannot see the collar: it is ~870 px of an
   * ~11,500 px denominator, so relocating it moves the figure by about 0.1 and
   * the sack's own error drowns the signal (measured — a three-sweep refit of
   * `hello`'s end pose moved the objective 34.17 → 34.05 and changed nothing).
   * The window is the baseline slot's own box dilated by `--window` px, frozen
   * before the search starts, so the denominator stays a constant the candidate
   * cannot shrink and the shrink guard above survives.
   */
  let window: { x0: number; y0: number; x1: number; y1: number } | null = null;
  const maeReference = (frame: Frame, reference: Plate): number => {
    const box = window ?? { x0: 0, y0: 0, x1: viewport.width - 1, y1: viewport.height - 1 };
    const w = box.x1 - box.x0 + 1;
    const h = box.y1 - box.y0 + 1;
    const mine = new Plate(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mine.set(x, y, background);
    const project = projector(viewport);
    const shifted = (wx: number, wy: number): [number, number] => {
      const [px, py] = project(wx, wy);
      return [px - box.x0, py - box.y0];
    };
    const drawn = new Uint8Array(w * h);
    for (const piece of frame.pieces) {
      rasterisePiece(pageFor(pages, piece), piece, shifted, { width: w, height: h }, (px, py, r, g, b, a) => {
        mine.blend(px, py, [r, g, b, a]);
        drawn[py * w + px] = 1;
      });
    }
    let sum = 0;
    let n = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const inRef = isContent(reference, box.x0 + x, box.y0 + y, background);
        if (inRef) n++;
        if (!drawn[y * w + x] && !inRef) continue;
        const a = mine.get(x, y);
        const b = reference.get(box.x0 + x, box.y0 + y);
        sum += (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;
      }
    }
    return n === 0 ? 0 : sum / n;
  };

  let frames = posed();
  const from = Number(flag('from') ?? 0);
  const to = Number(flag('to') ?? frames.length - 1);

  /**
   * The search's own objective: the slot's own error against the frame, over a
   * denominator FROZEN at the baseline, with the two degenerate directions shut.
   *
   * ⚠️ Three objectives were tried before this one and the first two were
   * escapable, both times by making the part stop being measured rather than by
   * placing it:
   *
   * 1. **the mean over the slot's current pixels** — shrinks onto whatever patch
   *    agrees. It walked the collar down to 63 % of its area for 6 points of
   *    residual (issue #119's shape, on a part instead of a whole rig);
   * 2. **the frame's own MAE, whole-frame** — cannot see one part: the collar is
   *    ~870 px of an ~11,500 px denominator, so relocating it moves the figure by
   *    0.1 and the sack's error drowns it. Measured: a three-sweep refit of
   *    `hello`'s end pose moved it 34.17 → 34.05 and changed nothing;
   * 3. **the frame's MAE inside a frozen window round the part** — escapable by
   *    translating the part OUT of the window, which improves the window and is
   *    the same removal by another route. Measured: the collar left the figure
   *    entirely (891 of 891 of its own pixels on the frame's backdrop) and the
   *    window's figure "improved" 19.60 → 17.22.
   *
   * The fixed denominator answers (1), scoring the part's own pixels answers (2),
   * and (3) cannot happen because a part on the backdrop scores ~154 per pixel —
   * leaving the picture is the worst move available, not the best. The area guard
   * stays as a belt: a trial covering under 0.7x or over 1.4x the baseline area is
   * refused, so a refit is a relocation and never a deletion.
   */
  const area = new Map<number, number>();
  /**
   * `--objective slot` (default) or `frame`, and which one to use is decided by
   * the part's share of the picture rather than by taste:
   *
   * - a **small** part needs `slot`. The collar is ~870 px of an ~11,500 px
   *   denominator and the frame objective cannot see it move;
   * - a **large** part needs `frame`. The `slot` objective counts only the pixels
   *   the part still draws, so for a part that carries most of the error the
   *   cheapest move is to stop drawing — measured, on the sack at `walk/f0000`:
   *   the slot objective fell to 11.77 while the sack shrank 8,359 → 5,959 px and
   *   the frame's own figure went 15.00 → **36.58**. The frame objective charges
   *   for every reference pixel left uncovered, which is exactly the brake that
   *   case needs, and the sack carries 72–80 % of the error share so the signal
   *   is there.
   */
  const objective = flag('objective') ?? 'slot';
  // `--area-guard low,high`. The default 0.7,1.4 lets a part be re-shaped; a
  // narrow band turns the search into a pure relocation, which is what a part
  // already near its optimum wants.
  const [guardLow, guardHigh] = (flag('area-guard') ?? '0.7,1.4').split(',').map(Number);
  const objectiveAt = (i: number): number => {
    const s = slotResidual(frames[i], referenceFor(i));
    const baseline = area.get(i);
    if (baseline !== undefined && (s.own < guardLow * baseline || s.own > guardHigh * baseline)) return Infinity;
    if (objective === 'frame') return maeReference(frames[i], referenceFor(i));
    return baseline === undefined ? s.residual : s.sum / baseline;
  };
  /** The reported figures: the objective, plus the slot's own agreement beside it. */
  const score = (i: number): { residual: number; union: number; own: number; backdrop: number } => {
    const reference = referenceFor(i);
    const s = slotResidual(frames[i], reference);
    return { residual: s.residual, union: maeReference(frames[i], reference), own: s.own, backdrop: s.backdrop };
  };

  // Freeze the window before anything is measured, so every figure below shares
  // one denominator. Reference-drawn pixels in the same box are included in it.
  const dilate = Number(flag('window') ?? 0);
  if (dilate > 0) {
    let x0 = viewport.width;
    let y0 = viewport.height;
    let x1 = -1;
    let y1 = -1;
    const project = projector(viewport);
    for (let i = from; i <= to; i++) {
      for (const piece of frames[i].pieces) {
        if (piece.slot !== slot) continue;
        rasterisePiece(pageFor(pages, piece), piece, project, viewport, (px, py) => {
          if (px < x0) x0 = px;
          if (px > x1) x1 = px;
          if (py < y0) y0 = py;
          if (py > y1) y1 = py;
        });
      }
    }
    window = {
      x0: Math.max(0, x0 - dilate),
      y0: Math.max(0, y0 - dilate),
      x1: Math.min(viewport.width - 1, x1 + dilate),
      y1: Math.min(viewport.height - 1, y1 + dilate),
    };
    console.log(`  window ${window.x0},${window.y0} .. ${window.x1},${window.y1} (slot box dilated ${dilate} px)`);
  }

  const before = new Map<number, ReturnType<typeof score>>();
  for (let i = from; i <= to; i++) {
    const s = score(i);
    before.set(i, s);
    area.set(i, s.own);
  }

  /**
   * An optional restart, because coordinate descent will not cross a ridge.
   *
   * ⚠️ Measured, on the defect this run was built to find: `walk/f0000`'s collar
   * is ~80 px low and getting it to the neck needs y, rotate and both scales to
   * move together — every single-axis step from where it sits makes the frame
   * worse first, so the descent shrinks the part instead and stops. Seeding the
   * keys from a pose that is already right, then descending, moved that frame's
   * own figure 21.47 → 15.00 where the unseeded descent reached 20.45.
   */
  const seedTranslate = flag('seed-translate');
  const seedRotate = flag('seed-rotate');
  const seedScale = flag('seed-scale');
  if (seedTranslate || seedRotate || seedScale) {
    for (let i = from; i <= to; i++) {
      const t = i / set.fps;
      const put = (channel: Channel, value: number): void => {
        const found = locate(tracks, bone, channel, t);
        if (found) found.key.v[found.at] = value;
      };
      if (seedTranslate) {
        const [x, y] = seedTranslate.split(',').map(Number);
        put('x', x);
        put('y', y);
      }
      if (seedRotate) put('rotate', Number(seedRotate));
      if (seedScale) {
        const [sx, sy] = seedScale.split(',').map(Number);
        put('scaleX', sx);
        put('scaleY', sy);
      }
    }
    frames = posed();
    // ⚠️ The area guard is re-based on the SEEDED state, not the state before it.
    // A seed is a deliberate re-placement and legitimately changes the part's
    // drawn area; leaving the guard on the pre-seed area made the seeded state
    // itself read as out-of-bounds (Infinity), at which point every trial looked
    // like an improvement and the descent walked the collar clean off the figure —
    // measured, `hello/f0000`, objective 217 with all 855 of its pixels on the
    // backdrop, from a seed that was in exactly the right place.
    for (let i = from; i <= to; i++) area.set(i, slotResidual(frames[i], referenceFor(i)).own);
    console.log(`  seeded frames ${from}..${to} of ${bone}`);
  }

  // ⚠️ Translation keys are in WORLD UNITS, not frame pixels: at this shot's
  // 0.189871 px per unit a 100 px error is 527 units, so a step ladder written in
  // pixels never leaves the local minimum. The first run of this tool had one and
  // moved the collar 12 px when it needed 100.
  const steps: Record<Channel, number[]> = {
    x: [512, 256, 128, 64, 32, 16, 8],
    y: [512, 256, 128, 64, 32, 16, 8],
    rotate: [16, 8, 4, 2, 1],
    scaleX: [0.16, 0.08, 0.04, 0.02],
    scaleY: [0.16, 0.08, 0.04, 0.02],
  };
  const wanted = (flag('channels') ?? CHANNELS.join(',')).split(',') as Channel[];

  for (let sweep = 0; sweep < sweeps; sweep++) {
    for (let i = from; i <= to; i++) {
      const t = i / set.fps;
      for (const channel of wanted) {
        const found = locate(tracks, bone, channel, t);
        if (!found) continue;
        for (const step of steps[channel]) {
          for (let tries = 0; tries < 6; tries++) {
            const base = found.key.v[found.at];
            const now = objectiveAt(i);
            // ⭐ The frame's own figure is a VETO, not a second objective.
            // Measured, on a broad collar pass over all 102 frames: the slot
            // objective fell on every frame while the frame's own figure ROSE on
            // nine of them (`hello/f0033` 34.56 -> 37.30, its collar shrinking
            // 1,048 -> 746 px). The slot objective is blind to the reference
            // pixels a shrinking part stops covering; `maeReference` is not. So a
            // trial has to improve the part AND not cost the picture.
            const frameNow = maeReference(frames[i], referenceFor(i));
            let bestDelta = 0;
            let bestValue = now;
            for (const delta of [step, -step]) {
              found.key.v[found.at] = base + delta;
              frames = posed();
              const trial = objectiveAt(i);
              if (trial >= bestValue - 1e-6) continue;
              if (maeReference(frames[i], referenceFor(i)) > frameNow + 1e-9) continue;
              bestValue = trial;
              bestDelta = delta;
            }
            found.key.v[found.at] = base + bestDelta;
            frames = posed();
            if (bestDelta === 0) break;
          }
        }
      }
      const now = score(i);
      const was = before.get(i) as ReturnType<typeof score>;
      console.log(
        `  sweep ${sweep} f${String(i).padStart(4, '0')}  objective ${objectiveAt(i).toFixed(2)}  residual ${was.residual.toFixed(1)} -> ${now.residual.toFixed(1)}` +
          `   union MAE ${was.union.toFixed(2)} -> ${now.union.toFixed(2)}` +
          `   on backdrop ${was.backdrop}/${was.own} -> ${now.backdrop}/${now.own}`,
      );
    }
  }

  if (write) {
    writeFileSync(resolve(write), `${JSON.stringify(motion, null, 1)}\n`);
    console.log(`wrote ${resolve(write)}`);
  }
}

main();
