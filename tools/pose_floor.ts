/**
 * pose_floor — how small and how plain a part can be before `rigc pose` stops
 * placing it, measured on real art with known truth (issue #857).
 *
 *   bun tools/pose_floor.ts [--sizes 24,32,48,64,96,128,192] [--textures native,blur1,blur2,flat]
 *                           [--json out.json] | --from a.json,b.json
 *
 * ⭐ The truth set is built so that the truth is not an estimate. For every
 * trial the example corpus's `spineboy` is posed (its setup pose, and one frame
 * of `walk`) and rendered TWICE with one viewport: the whole figure on the
 * renderer's ground — the pose frame — and one slot alone on transparency — the
 * part. The part is that second render cropped to its own alpha, so where it
 * sits in the frame is the crop's own offset, at rotation 0 and scale 1, by
 * construction. Nothing about the answer is fitted.
 *
 * 📏 Size is set by the viewport: each slot is rendered at the scale that makes
 * its material's longest side the grid's size in frame pixels. Texture is set on
 * the ATLAS PAGE the slot samples — a copy of the page with that one region
 * blurred or flattened — so the part and the frame carry the same plainer art,
 * which is the case a plain sleeve is: plain in the picture as well as in the
 * cut. What the report calls `texture` is measured on each part as cut, and the
 * table prints its mean per cell, so the levels are named by the figure the
 * report prints rather than by the recipe that produced them.
 *
 * ⚠️ What this material is and is not. Every part here is the frame's own
 * pixels, so a residual at the truth is near zero and every failure is the
 * search's — ambiguity or a wrong optimum — never a part that disagrees with its
 * picture. A generated cut disagrees with its picture as well, which makes the
 * floor measured here a LOWER bound on the floor for such a cut, not the floor.
 *
 * 🔍 Every trial also carries the residual AT the truth, and a failure is marked
 * `missed` when the truth scores better than what was reported and nothing
 * reported is on it. That split is what diagnosed issue #865: of the failures,
 * only a miss is the search's to fix — the rest are the objective preferring
 * another placement, or the truth reported and tied with one. `--from` prints
 * the misses per cell under the table.
 *
 * 🔒 Not a selftest control: a full grid is hundreds of `pose` runs. `selftest.ts`
 * runs three cells of it through `floorCell` below and holds them to the table
 * `src/pose.ts` states, so the table cannot drift away from this tool silently.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { errBilinear, estimatePose, levelOf, materialPlate, type PoseLegibility, type PoseTrace, readBackground } from '../src/pose.ts';
import {
  BACKGROUND,
  blitPiece,
  fill,
  loadPosable,
  pageFor,
  type Piece,
  type Posable,
  projector,
  sampleAnimation,
  sampleSetupPose,
  unionBounds,
  viewportOfSize,
} from '../src/render.ts';
import { Plate } from './plate.ts';

export const FLOOR_EXAMPLE = 'spineboy';
export const FLOOR_SIZES = [24, 32, 48, 64, 96, 128, 192];
export const FLOOR_TEXTURES = ['native', 'blur1', 'blur2', 'flat'] as const;
export type FloorTexture = (typeof FLOOR_TEXTURES)[number];
/** Within this many frame pixels of the truth, a placement counts as found. The issue's own bar. */
export const FLOOR_WITHIN_PX = 2;

/** Blur radius as a share of the region's longest side, per level. */
const BLUR_SHARE: Record<FloorTexture, number> = { native: 0, blur1: 0.03, blur2: 0.1, flat: 0 };

/**
 * The slots a trial is taken from: every drawn slot whose material the rest of
 * the figure leaves at least this share visible. A part mostly hidden behind
 * another is an occlusion question, which `pose` documents separately, and
 * letting it in would put a failure in every cell whatever its size.
 */
const MIN_VISIBLE = 0.75;

export type FloorOutcome = 'found' | 'wrong' | 'ambiguous' | 'refused';

export interface FloorTrial {
  frame: string;
  slot: string;
  size: number;
  texture: FloorTexture;
  outcome: FloorOutcome;
  /** Distance from the truth, frame pixels; null when nothing was placed. */
  error: number | null;
  /** `null` only when the part was not searched, which on this material means a defect in this tool. */
  legibility: PoseLegibility | null;
  /**
   * The residual `pose` would report AT the truth — scale 1, rotation 0, the
   * crop's own offset — over every part pixel, with the objective `pose` uses.
   */
  truthResidual: number;
  /**
   * The search's own miss, as opposed to the objective's or the verdict's: not
   * found, the truth scores below the best residual reported, and no reported
   * placement (best or alternate) is within `FLOOR_WITHIN_PX` of it. A failure
   * that is not a miss is one the search could not have fixed — the objective
   * prefers something else there, or the truth was reported and tied (#865).
   */
  missed: boolean;
  /**
   * Where the refinement left the truth, level by level, coarsest first (issue
   * #877). Per level: the rank, among the candidates that level handed on, of
   * the one nearest the truth, how far off it was, whether the next level took
   * it, and that level's own objective at the truth beside its best. `truth <
   * best` on a level is the level preferring the truth over everything it kept.
   */
  search: FloorLevel[];
  /**
   * The full-resolution polish of the seed nearest the truth: how many moves it
   * accepted, how many of them were scale escapes, whether a window held one,
   * where it ended and what the same objective says at the truth. `truth < end`
   * is a polish that stopped on a point its own objective scores worse than the
   * truth — the class issue #877 was about.
   */
  polish: FloorPolish | null;
}

export interface FloorLevel {
  level: number;
  reduction: number;
  /** Rank of the candidate nearest the truth, 0 = the level's best. */
  rank: number;
  /** Frame pixels between that candidate and the truth. */
  distance: number;
  /** Whether the next level polished it; `true` on the last level, which hands on to the report. */
  carried: boolean;
  /** The level's objective at the truth, and at its own best. */
  truth: number;
  best: number;
}

export interface FloorPolish {
  steps: number;
  escapes: number;
  clamped: boolean;
  end: number;
  truth: number;
}

interface Scene {
  name: string;
  pieces: Piece[];
}

function corpusPaths(root: string): { skeleton: string; atlas: string; dir: string } {
  const dir = join(root, FLOOR_EXAMPLE, 'export');
  return { skeleton: join(dir, 'spineboy-pro.json'), atlas: join(dir, 'spineboy.atlas'), dir };
}

export function floorCorpusPresent(root: string): boolean {
  const p = corpusPaths(root);
  return existsSync(p.skeleton) && existsSync(p.atlas);
}

export function loadFloorScenes(root: string): { posable: Posable; scenes: Scene[] } {
  const p = corpusPaths(root);
  const posable = loadPosable(p.skeleton, p.atlas, p.dir);
  const setup = sampleSetupPose(posable.data)[0];
  const walk = sampleAnimation(posable.data, 'walk', 30);
  const mid = walk[Math.floor(walk.length / 3)];
  return {
    posable,
    scenes: [
      { name: 'setup', pieces: setup.pieces },
      { name: 'walk@1/3', pieces: mid.pieces },
    ],
  };
}

/** A copy of `page` with the rectangle `rect` blurred (box, alpha-weighted) or flattened to one colour. */
function retexture(page: Plate, rect: { x0: number; y0: number; x1: number; y1: number }, texture: FloorTexture): Plate {
  const out = new Plate(page.width, page.height);
  out.data.set(page.data);
  if (texture === 'native') return out;
  const { x0, y0, x1, y1 } = rect;
  if (texture === 'flat') {
    let w = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * page.width + x) * 4;
        const a = page.data[i + 3];
        w += a;
        r += page.data[i] * a;
        g += page.data[i + 1] * a;
        b += page.data[i + 2] * a;
      }
    }
    if (w === 0) return out;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * page.width + x) * 4;
        out.data[i] = Math.round(r / w);
        out.data[i + 1] = Math.round(g / w);
        out.data[i + 2] = Math.round(b / w);
      }
    }
    return out;
  }
  const radius = Math.max(1, Math.round(BLUR_SHARE[texture] * Math.max(x1 - x0, y1 - y0)));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      let w = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const sy = y + dy;
        if (sy < y0 || sy >= y1) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const sx = x + dx;
          if (sx < x0 || sx >= x1) continue;
          const i = (sy * page.width + sx) * 4;
          const a = page.data[i + 3];
          w += a;
          r += page.data[i] * a;
          g += page.data[i + 1] * a;
          b += page.data[i + 2] * a;
        }
      }
      if (w === 0) continue;
      const o = (y * page.width + x) * 4;
      out.data[o] = Math.round(r / w);
      out.data[o + 1] = Math.round(g / w);
      out.data[o + 2] = Math.round(b / w);
    }
  }
  return out;
}

function uvRect(piece: Piece, page: Plate): { x0: number; y0: number; x1: number; y1: number } {
  let u0 = Infinity;
  let v0 = Infinity;
  let u1 = -Infinity;
  let v1 = -Infinity;
  for (let i = 0; i < piece.uvs.length; i += 2) {
    u0 = Math.min(u0, piece.uvs[i]);
    u1 = Math.max(u1, piece.uvs[i]);
    v0 = Math.min(v0, piece.uvs[i + 1]);
    v1 = Math.max(v1, piece.uvs[i + 1]);
  }
  return {
    x0: Math.max(0, Math.floor(u0 * page.width)),
    y0: Math.max(0, Math.floor(v0 * page.height)),
    x1: Math.min(page.width, Math.ceil(u1 * page.width)),
    y1: Math.min(page.height, Math.ceil(v1 * page.height)),
  };
}

function alphaBox(plate: Plate): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < plate.height; y++) {
    for (let x = 0; x < plate.width; x++) {
      if (plate.data[(y * plate.width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return minX === Infinity ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** The slots of one scene a trial may be taken from, in draw order. */
export function floorSlots(posable: Posable, scene: Scene): string[] {
  const bounds = unionBounds([[{ index: 0, time: 0, pieces: scene.pieces }]]);
  const scale = 1;
  const pad = 4;
  const w = Math.ceil((bounds.maxX - bounds.minX) * scale) + pad * 2;
  const h = Math.ceil((bounds.maxY - bounds.minY) * scale) + pad * 2;
  const viewport = viewportOfSize(bounds.minX - pad, bounds.minY - pad, w / scale, h / scale, scale, w, h);
  const project = projector(viewport);
  const out: string[] = [];
  scene.pieces.forEach((piece, index) => {
    const alone = new Plate(w, h);
    blitPiece(alone, pageFor(posable.pages, piece), piece, project);
    const over = new Plate(w, h);
    for (const later of scene.pieces.slice(index + 1)) blitPiece(over, pageFor(posable.pages, later), later, project);
    let own = 0;
    let seen = 0;
    for (let i = 3; i < alone.data.length; i += 4) {
      const a = alone.data[i] / 255;
      own += a;
      seen += a * (1 - over.data[i] / 255);
    }
    const box = alphaBox(alone);
    if (own > 0 && box !== null && Math.max(box.w, box.h) >= 16 && seen / own >= MIN_VISIBLE) out.push(piece.slot);
  });
  return out;
}

/**
 * One trial: `slot` of `scene` at `size` frame pixels and `texture`, placed by
 * `pose`, scored against the crop's own offset.
 */
export function floorTrial(
  posable: Posable,
  scene: Scene,
  slot: string,
  size: number,
  texture: FloorTexture,
  workDir: string,
  trace?: PoseTrace,
): FloorTrial {
  const index = scene.pieces.findIndex((p) => p.slot === slot);
  if (index < 0) throw new Error(`internal: scene ${scene.name} draws no slot "${slot}"`);
  const target = scene.pieces[index];
  const basePage = pageFor(posable.pages, target);
  const page = retexture(basePage, uvRect(target, basePage), texture);
  const pageOf = (piece: Piece, i: number): Plate => (i === index ? page : pageFor(posable.pages, piece));

  // The slot's own material span at unit scale, so the viewport can be chosen
  // to put it at `size` frame pixels.
  const bounds = unionBounds([[{ index: 0, time: 0, pieces: scene.pieces }]]);
  const unit = (scale: number, pad: number): { w: number; h: number; project: (x: number, y: number) => [number, number] } => {
    const w = Math.ceil((bounds.maxX - bounds.minX) * scale) + pad * 2;
    const h = Math.ceil((bounds.maxY - bounds.minY) * scale) + pad * 2;
    const viewport = viewportOfSize(bounds.minX - pad / scale, bounds.minY - pad / scale, w / scale, h / scale, scale, w, h);
    return { w, h, project: projector(viewport) };
  };
  const probe = unit(1, 4);
  const probePlate = new Plate(probe.w, probe.h);
  blitPiece(probePlate, page, target, probe.project);
  const probeBox = alphaBox(probePlate);
  if (probeBox === null) throw new Error(`internal: slot "${slot}" draws nothing`);
  const scale = size / Math.max(probeBox.w, probeBox.h);

  const view = unit(scale, 12);
  const frame = new Plate(view.w, view.h);
  fill(frame, BACKGROUND);
  scene.pieces.forEach((piece, i) => blitPiece(frame, pageOf(piece, i), piece, view.project));
  const alone = new Plate(view.w, view.h);
  blitPiece(alone, page, target, view.project);
  const box = alphaBox(alone);
  if (box === null) throw new Error(`internal: slot "${slot}" draws nothing at scale ${scale}`);
  const part = new Plate(box.w, box.h);
  for (let y = 0; y < box.h; y++) {
    const from = ((box.y + y) * alone.width + box.x) * 4;
    part.data.set(alone.data.subarray(from, from + box.w * 4), y * box.w * 4);
  }
  const truth = { x: box.x + box.w / 2, y: box.y + box.h / 2 };

  const partsDir = join(workDir, 'parts');
  mkdirSync(partsDir, { recursive: true });
  const partPath = join(partsDir, `${slot}.png`);
  const framePath = join(workDir, 'frame.png');
  part.writePng(partPath);
  frame.writePng(framePath);
  const log: PoseTrace = trace ?? { levels: [], measured: [] };
  log.probe = { x: truth.x, y: truth.y, rotationDeg: 0, scale: 1 };
  const report = estimatePose({
    imagesDir: partsDir,
    framePath,
    parts: [partPath],
    trace: log,
  });
  const got = report.parts[0];
  const error = got.placement === null ? null : Math.hypot(got.placement.x - truth.x, got.placement.y - truth.y);
  const outcome: FloorOutcome =
    got.refusal !== null ? 'refused' : got.ambiguous ? 'ambiguous' : error !== null && error <= FLOOR_WITHIN_PX ? 'found' : 'wrong';
  const truthResidual = residualAtTruth(frame, part, box);
  const reported = got.placement === null ? [] : [got.placement, ...got.alternates];
  const missed =
    outcome !== 'found' &&
    got.placement !== null &&
    truthResidual < got.placement.residual &&
    !reported.some((p) => Math.hypot(p.x - truth.x, p.y - truth.y) <= FLOOR_WITHIN_PX);
  const { search, polish } = searchColumns(log, truth);
  return { frame: scene.name, slot, size, texture, outcome, error, legibility: got.legibility, truthResidual, missed, search, polish };
}

/** `FloorTrial.search` and `.polish`, read off the trace `pose` kept for one part. */
function searchColumns(log: PoseTrace, truth: { x: number; y: number }): { search: FloorLevel[]; polish: FloorPolish | null } {
  const off = (c: { x: number; y: number }): number => Math.hypot(c.x - truth.x, c.y - truth.y);
  const nearest = (cs: { x: number; y: number }[]): number => cs.reduce((bi, c, i) => (off(c) < off(cs[bi]) ? i : bi), 0);
  const round = (n: number): number => Math.round(n * 1e5) / 1e5;
  const search = log.levels.map((level, i): FloorLevel => {
    const rank = level.out.length === 0 ? -1 : nearest(level.out);
    const next = log.levels[i + 1];
    return {
      level: level.level,
      reduction: level.reduction,
      rank,
      distance: rank < 0 ? -1 : round(off(level.out[rank])),
      carried: next === undefined || rank < next.keep,
      truth: round(level.probeResidual ?? -1),
      best: level.out.length === 0 ? -1 : round(level.out[0].residual),
    };
  });
  const last = log.levels[log.levels.length - 1];
  if (last === undefined || last.seeds.length === 0) return { search, polish: null };
  const seed = nearest(last.seeds);
  const path = last.paths[seed];
  return {
    search,
    polish: {
      steps: path.length,
      escapes: path.filter((step) => step.escape).length,
      clamped: path.some((step) => step.clamped),
      end: round(last.polished[seed].residual),
      truth: round(last.probeResidual ?? -1),
    },
  };
}

/**
 * `pose`'s objective at the truth placement: every part pixel at its own offset
 * in the frame, scale 1, rotation 0, scored on the frame's material plate with
 * `pose`'s own tap — the same arithmetic its `measure` step reports a residual
 * with, so the two are comparable to the last decimal that matters here.
 */
function residualAtTruth(frame: Plate, part: Plate, box: { x: number; y: number }): number {
  const material = materialPlate(frame, readBackground(frame)).plate;
  const level = levelOf(material, 1);
  let weight = 0;
  let acc = 0;
  for (let y = 0; y < part.height; y++) {
    for (let x = 0; x < part.width; x++) {
      const i = (y * part.width + x) * 4;
      const a = part.data[i + 3];
      if (a === 0) continue;
      const w = a / 255;
      weight += w;
      acc += w * errBilinear(level, material, box.x + x + 0.5, box.y + y + 0.5, part.data[i], part.data[i + 1], part.data[i + 2]);
    }
  }
  return weight === 0 ? 1 : acc / weight;
}

export interface FloorCell {
  size: number;
  texture: FloorTexture;
  trials: FloorTrial[];
  found: number;
  wrong: number;
  ambiguous: number;
  refused: number;
  /** Trials the search itself missed — see `FloorTrial.missed`. */
  missed: number;
  /** Mean `legibility.texture` over the cell's parts. */
  meanTexture: number;
}

export function floorCell(
  posable: Posable,
  scenes: Scene[],
  slots: Map<string, string[]>,
  size: number,
  texture: FloorTexture,
  workDir: string,
): FloorCell {
  const trials: FloorTrial[] = [];
  for (const scene of scenes) {
    for (const slot of slots.get(scene.name) ?? []) {
      const dir = join(workDir, `${scene.name.replace(/[^a-z0-9]/gi, '_')}-${slot}-${size}-${texture}`);
      trials.push(floorTrial(posable, scene, slot, size, texture, dir));
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const count = (o: FloorOutcome): number => trials.filter((t) => t.outcome === o).length;
  return {
    size,
    texture,
    trials,
    found: count('found'),
    wrong: count('wrong'),
    ambiguous: count('ambiguous'),
    refused: count('refused'),
    missed: trials.filter((t) => t.missed).length,
    meanTexture:
      trials.reduce((s, t) => s + (t.legibility?.texture ?? 0), 0) / Math.max(1, trials.filter((t) => t.legibility !== null).length),
  };
}

/**
 * What the floor is a floor OF: the detail under which `pose` placed at most
 * this share of the grid's trials, stated on at least `FLOOR_MIN_TRIALS`.
 *
 * ⚠️ Not the brief's "smallest cell that places reliably", and the grid is why.
 * When this was chosen no cell placed 0.9 of its trials — the best placed 13
 * of 15 — and no detail threshold on thirty or more trials reached even 0.8:
 * above any rung, the same few parts failed at every size and texture (a thin
 * gun, a lens pair) because the coarse pass never sent their true basin down.
 * What the grid DOES support is the other edge — a detail under which `pose`
 * almost never places anything — and that is the question the issue asked: is
 * this part too plain for `pose`, or is it wrong?
 *
 * 🔸 Issue #865 moved the other half without moving this one. With the coarse
 * grid at an eighth of the part, four native cells place 14 or 15 of 15 and the
 * trials at detail 3 and over place 62 of 66 — but `goggles` still places 10 of
 * 42, and a reliability line read off two dozen parts of one figure would be a
 * claim about spineboy. The edge stays the one thing stated. Issue #877's
 * polish took those figures to five cells, 64 of 66 and 12 of 42, which changes
 * nothing about that argument.
 */
export const FLOOR_FAIL_RATE = 0.1;
export const FLOOR_MIN_TRIALS = 30;

/** The candidate detail thresholds, smallest first — a fixed ladder, so the derivation cannot be tuned to the data. */
export const FLOOR_DETAIL_LADDER = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

/** A trial's `detail`: its texture times the material box's longest side, part pixels. What `src/pose.ts` reports. */
export function trialDetail(t: FloorTrial): number {
  return t.legibility === null ? 0 : t.legibility.texture * Math.max(t.legibility.width, t.legibility.height);
}

export interface DerivedFloor {
  /** The smallest size the grid measured. Not a threshold found in the data — see `POSE_FLOOR`. */
  span: number;
  /** The largest ladder rung under which at most `FLOOR_FAIL_RATE` of the trials were found. */
  detail: number;
  /** Found share under the rung, and over it, with their trial counts. */
  rateBelow: number;
  under: number;
  rateAbove: number;
  over: number;
}

/**
 * The floor, read off a grid's TRIALS: the LARGEST rung of `FLOOR_DETAIL_LADDER`
 * such that the trials under it were found at most `FLOOR_FAIL_RATE` of the
 * time, over at least `FLOOR_MIN_TRIALS` of them. `null` when no rung does.
 */
export function deriveFloor(cells: FloorCell[]): DerivedFloor | null {
  const trials = cells.flatMap((c) => c.trials);
  const span = Math.min(...cells.map((c) => c.size));
  const share = (ts: FloorTrial[]): number => ts.filter((t) => t.outcome === 'found').length / Math.max(1, ts.length);
  const round = (n: number): number => Math.round(n * 1000) / 1000;
  let best: DerivedFloor | null = null;
  for (const detail of FLOOR_DETAIL_LADDER) {
    const under = trials.filter((t) => trialDetail(t) < detail);
    const over = trials.filter((t) => trialDetail(t) >= detail);
    if (under.length < FLOOR_MIN_TRIALS || share(under) > FLOOR_FAIL_RATE) continue;
    best = { span, detail, rateBelow: round(share(under)), under: under.length, rateAbove: round(share(over)), over: over.length };
  }
  return best;
}

/** Found / total per band of `detail`, the table §11.5 derives the floor from. */
export function detailBands(cells: FloorCell[]): string[] {
  const trials = cells.flatMap((c) => c.trials);
  const edges = [0, ...FLOOR_DETAIL_LADDER, Infinity];
  const lines = ['| detail | found | ambiguous | wrong | refused |', '| --- | --- | --- | --- | --- |'];
  for (let i = 0; i < edges.length - 1; i++) {
    const band = trials.filter((t) => trialDetail(t) >= edges[i] && trialDetail(t) < edges[i + 1]);
    if (band.length === 0) continue;
    const n = (o: FloorOutcome): number => band.filter((t) => t.outcome === o).length;
    const label = i === 0 ? `under ${edges[1]}` : edges[i + 1] === Infinity ? `${edges[i]} and over` : `${edges[i]}–${edges[i + 1]}`;
    lines.push(`| ${label} | ${n('found')}/${band.length} | ${n('ambiguous')} | ${n('wrong')} | ${n('refused')} |`);
  }
  return lines;
}

/** The grid as a markdown table, one row per texture level — what AUTHORING §11.5 carries. */
export function floorTable(cells: FloorCell[]): string[] {
  const sizes = [...new Set(cells.map((c) => c.size))].sort((a, b) => a - b);
  const lines = [
    `| texture level (mean) | ${sizes.map((s) => `${s} px`).join(' | ')} |`,
    `| --- | ${sizes.map(() => '---').join(' | ')} |`,
  ];
  for (const texture of FLOOR_TEXTURES) {
    const level = cells.filter((c) => c.texture === texture);
    if (level.length === 0) continue;
    const details = level.flatMap((c) => c.trials.map(trialDetail));
    const range = `detail ${(details.reduce((a, b) => a + b, 0) / Math.max(1, details.length)).toFixed(2)}`;
    const cellText = (size: number): string => {
      const c = level.find((x) => x.size === size);
      if (c === undefined) return '—';
      const n = c.trials.length;
      const tail = [c.ambiguous ? `${c.ambiguous} amb` : '', c.refused ? `${c.refused} ref` : '', c.wrong ? `${c.wrong} wrong` : '']
        .filter((x) => x !== '')
        .join(', ');
      const text = `${c.found}/${n}${tail === '' ? '' : ` (${tail})`}`;
      return text;
    };
    lines.push(`| \`${texture}\` (${range}) | ${sizes.map(cellText).join(' | ')} |`);
  }
  return lines;
}

/** One trial's refinement on one line: per level the truth's rank (`x` = not carried), its offset, and whether the level preferred it. */
export function searchLine(t: FloorTrial): string {
  const levels = t.search.map(
    (l) => `L${l.level} #${l.rank}${l.carried ? '' : 'x'} ${l.distance.toFixed(1)}px ${l.truth < l.best ? 'truth<best' : 'truth>=best'}`,
  );
  const p = t.polish;
  const tail =
    p === null
      ? 'no polish'
      : `polish ${p.steps} step(s), ${p.escapes} escape(s)${p.clamped ? ', clamped' : ''}, end ${p.end} vs truth ${p.truth}`;
  return `${levels.join(' · ')} · ${tail}`;
}

function main(argv: string[]): void {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) flags.set(argv[i].replace(/^--/, ''), argv[i + 1] ?? '');
  // `--from a.json,b.json` re-reads grids this tool wrote — one run per texture
  // level is how it is parallelised — and prints the table and the floor.
  const from = flags.get('from');
  if (from !== undefined) {
    const cells = from.split(',').flatMap((path) => (JSON.parse(readFileSync(path, 'utf8')) as { cells: FloorCell[] }).cells);
    for (const line of floorTable(cells)) console.log(line);
    console.log('');
    for (const line of detailBands(cells)) console.log(line);
    console.log('');
    console.log(`floor: ${JSON.stringify(deriveFloor(cells))}`);
    // A grid written before the column existed has no `missed`, and saying 0
    // for it would be a measurement nobody took.
    if (cells.every((c) => typeof c.missed === 'number')) {
      const failed = cells.reduce((n, c) => n + c.trials.length - c.found, 0);
      console.log(`missed by the search: ${cells.reduce((n, c) => n + c.missed, 0)} of ${failed} failed trials`);
      for (const c of cells) if (c.missed > 0) console.log(`  ${c.texture} ${c.size}px: ${c.trials.filter((t) => t.missed).map((t) => `${t.frame} ${t.slot}`).join(', ')}`);
      // The trace columns arrived with issue #877; a grid written before them
      // has no refinement to show, and inventing one would be the same fault.
      for (const c of cells) {
        for (const t of c.trials) if (t.missed && Array.isArray(t.search)) console.log(`    ${c.texture} ${c.size}px ${t.frame} ${t.slot}: ${searchLine(t)}`);
      }
    }
    return;
  }
  const root = resolve(flags.get('examples') ?? 'examples');
  if (!floorCorpusPresent(root)) {
    console.error(`pose_floor: no ${FLOOR_EXAMPLE} export under ${root} — run \`bun run fetch-examples\``);
    process.exit(2);
  }
  const sizes = (flags.get('sizes') ?? FLOOR_SIZES.join(',')).split(',').map(Number);
  const textures = (flags.get('textures') ?? FLOOR_TEXTURES.join(',')).split(',') as FloorTexture[];
  for (const t of textures) if (!FLOOR_TEXTURES.includes(t)) throw new Error(`--textures: unknown level "${t}"`);
  const { posable, scenes } = loadFloorScenes(root);
  const slots = new Map(scenes.map((s) => [s.name, floorSlots(posable, s)]));
  for (const s of scenes) console.log(`  ..    ${s.name}: ${slots.get(s.name)?.join(', ')}`);
  const work = mkdtempSync(join(tmpdir(), 'rigc-pose-floor-'));
  const cells: FloorCell[] = [];
  try {
    for (const texture of textures) {
      for (const size of sizes) {
        const cell = floorCell(posable, scenes, slots, size, texture, work);
        cells.push(cell);
        const n = cell.trials.length;
        console.log(
          `  ${texture.padEnd(6)} ${String(size).padStart(4)}px  texture ${cell.meanTexture.toFixed(4)}  ` +
            `found ${cell.found}/${n}  wrong ${cell.wrong}  ambiguous ${cell.ambiguous}  refused ${cell.refused}  missed ${cell.missed}`,
        );
        for (const t of cell.trials) {
          if (t.outcome === 'found') continue;
          const l = t.legibility;
          if (l === null) {
            console.log(`           ${t.outcome.padEnd(9)} ${t.frame} ${t.slot}: nothing inside the window`);
            continue;
          }
          console.log(
            `           ${t.outcome.padEnd(9)} ${t.frame} ${t.slot}: off ${t.error === null ? 'n/a' : t.error.toFixed(1)}px, ` +
              `${l.width}x${l.height} texture ${l.texture} opaque ${l.opaqueShare}, ${l.candidates} candidate(s), ` +
              `best ${l.best} next ${l.next ?? 'none'}, truth ${t.truthResidual.toFixed(5)}${t.missed ? ' — MISSED by the search' : ''}`,
          );
          console.log(`             search: ${searchLine(t)}`);
        }
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  const out = flags.get('json');
  if (out !== undefined) writeFileSync(out, `${JSON.stringify({ sizes, textures, cells }, null, 2)}\n`);
}

if (import.meta.main) main(process.argv.slice(2));
