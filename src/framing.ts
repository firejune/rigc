/**
 * Framing — putting the candidate's pixels onto the reference's pixels.
 *
 * ## Why this is its own module
 *
 * Everything `check` reports sits downstream of one decision: which world box the
 * candidate is rendered into. Get it wrong and every pixel below it is shifted or
 * rescaled, and the error arrives disguised as MAE — as motion, which is the one
 * thing `check` exists to measure. Two independent honest authoring runs measured
 * exactly that (issue #34): rung 4's `wave-by-hand` read 49.45 framed and 22.96
 * with the box pinned, on identical keys, and rung 5's first correct build read
 * 39.00 instead of 4.35 because its content box came out 0.93 % narrow.
 *
 * ## The rule: both sides are measured the same way, on pixels
 *
 * The old procedure framed the candidate by the union of its **posed quad
 * corners**. A region attachment's quad extends past its own artwork wherever the
 * art is transparent, so a corner can sit where no pixel is — and since the
 * mapping used `minX`, `maxY` and the long side only, one such corner in one frame
 * of one animation set the scale for the whole comparison.
 *
 * So the box is taken from **drawn pixels** instead, on both sides, with the same
 * predicate: a pixel is content when it differs from the frames' background by
 * more than `BACKGROUND_TOLERANCE` on any channel. The candidate's box is the
 * union over the frames it will be compared on, the reference's is the union over
 * the frames on disk, and a similarity transform (uniform scale + translation)
 * carries one onto the other.
 *
 * ⭐ The property that buys: **when the candidate is right, the framing is exact.**
 * A faithful candidate renders to the same pixels as the reference, so its content
 * box IS the reference's content box, the fit is the identity, and every
 * measurement error in this file cancels. What is left is a procedure whose noise
 * shrinks as the candidate improves, which is the only shape of noise an authoring
 * loop can work against.
 *
 * ## And one pass after that, on the MAE itself
 *
 * The extent fit has a floor it cannot see past, because the best fit of two
 * extents is not the best alignment of two pictures. On a hard shot that floor is
 * a **constant** pixel worth a tenth of the headline figure (issue #146), which a
 * loop reads as motion. So a fitted box gets one final pass — `OffsetScan` — that
 * searches whole-pixel translations in a ±`REFINE_RADIUS` window for the lowest
 * *reference-denominator MAE* and moves the box when the gain clears
 * `REFINE_MIN_GAIN`. It optimises the reported figure directly rather than a proxy
 * for it, which is what separates it from the extent refinement measured and
 * rejected in `frameByDeclaredBox`: that one walked off the answer because the
 * answer was not what it was minimising.
 */
import { Plate, type RGBA } from '../tools/plate.ts';
import {
  fill,
  pageFor,
  projector,
  rasterisePiece,
  viewportOfSize,
  type Frame,
  type Viewport,
} from './render.ts';

/** How far a channel must move for a pixel to count as "not background". */
export const BACKGROUND_TOLERANCE = 8;

/**
 * How far a pixel is from the background, as the largest channel difference.
 *
 * Used two ways, and they have to be the same function or the two uses disagree
 * about where an edge is: as a threshold (`isContent`) and as a weight (the
 * sub-pixel edge estimate below).
 */
export function backgroundDistance(plate: Plate, x: number, y: number, background: RGBA): number {
  const [r, g, b] = plate.get(x, y);
  return Math.max(
    Math.abs(r - background[0]),
    Math.abs(g - background[1]),
    Math.abs(b - background[2]),
  );
}

export function isContent(plate: Plate, x: number, y: number, background: RGBA): boolean {
  return backgroundDistance(plate, x, y, background) > BACKGROUND_TOLERANCE;
}

/**
 * Where a shape stops, as opposed to where it is faintly visible.
 *
 * ## Why the content box does not use `BACKGROUND_TOLERANCE`
 *
 * `BACKGROUND_TOLERANCE` answers "is there anything here at all", at about 3 % of
 * a channel, and that is the right question for the union alpha and for
 * connected components. It is the wrong question for an *edge*, because the two
 * sides of this comparison do not render edges the same way: the reference frames
 * are drawn from the example's packed atlas, which for several rungs ships at
 * `scale: 0.5`, while the candidate is compiled from the loose full-size PNGs.
 * Same geometry, softer ramp — and at a 3 % threshold the softer ramp reaches
 * further out.
 *
 * Measured on rung 3's mechanical transcription, where the two sides are the same
 * skeleton and the true answer is "identical": at tolerance 8 the left edges
 * disagreed by **0.36 px**, which is enough to double the reported MAE.
 *
 * A blurred step crosses **half** its own contrast at the position of the
 * original step, whatever the blur — so the box is taken at half of a robust
 * estimate of a solid pixel's contrast, and the same disagreement drops to
 * **0.01 px**. The level is derived from the reference frames and used on both
 * sides, so it is one number rather than two that can drift apart.
 */
export const EDGE_FRACTION = 0.5;
/** Which quantile of the content's contrast counts as "a solid pixel". */
export const CONTENT_QUANTILE = 0.75;

/** Pooled contrast of everything that is not background, as a 0..255 histogram. */
export class ContrastHistogram {
  private readonly bins = new Uint32Array(256);
  private counted = 0;

  add(plate: Plate, background: RGBA): void {
    for (let y = 0; y < plate.height; y++) {
      for (let x = 0; x < plate.width; x++) {
        const d = backgroundDistance(plate, x, y, background);
        if (d <= BACKGROUND_TOLERANCE) continue;
        this.bins[Math.min(255, Math.round(d))]++;
        this.counted++;
      }
    }
  }

  /** The half-maximum level, or the bare tolerance when nothing was counted. */
  level(): number {
    if (this.counted === 0) return BACKGROUND_TOLERANCE;
    const target = this.counted * CONTENT_QUANTILE;
    let seen = 0;
    for (let d = 0; d < 256; d++) {
      seen += this.bins[d];
      if (seen >= target) return Math.max(BACKGROUND_TOLERANCE, d * EDGE_FRACTION);
    }
    return BACKGROUND_TOLERANCE;
  }
}

/**
 * A content box in frame pixels, with **real** edges rather than pixel indices.
 *
 * The convention is the one a rasteriser uses: pixel `i` covers `[i, i+1)`, so a
 * box `{ left: 3, right: 7 }` is four whole pixels wide and `{ left: 3.5 }` says
 * the edge runs down the middle of pixel 3.
 */
export interface ContentBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const boxWidth = (b: ContentBox): number => b.right - b.left;
export const boxHeight = (b: ContentBox): number => b.bottom - b.top;

export function unionBoxes(a: ContentBox | null, b: ContentBox | null): ContentBox | null {
  if (!a) return b;
  if (!b) return a;
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  };
}

/** An integer scan window, half-open on the far edges. */
export interface ScanWindow {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Where a rendered plate's content stops, to a fraction of a pixel.
 *
 * ## The sub-pixel part, and why it is worth the paragraph
 *
 * A box read off integer pixel indices is quantised to ±0.5 px per edge, and rung
 * 5 measured this shot's MAE moving 1.35 for a **0.065 px** viewport offset. Half
 * a pixel of framing noise would therefore be louder than most of what an author
 * is trying to hear.
 *
 * So each edge is refined by the mass in its outermost row or column. Anti-aliased
 * coverage scales `backgroundDistance` roughly linearly, so if the first column
 * holding content carries half the mass of the column behind it, the true edge
 * runs about half a pixel in. That model is crude for a wedge — a shape that
 * genuinely narrows towards its edge reads as partial coverage — but it is applied
 * **identically to both sides**, so on similar silhouettes the bias is common-mode
 * and on an exact candidate it cancels outright.
 *
 * `level` is the edge threshold — see `EDGE_FRACTION` for why it is not the bare
 * background tolerance. `within` bounds the scan; it must contain every pixel that
 * could be content, and the caller has that for free from the rasteriser's own
 * destination bounds.
 */
export function contentBoxOfPlate(
  plate: Plate,
  background: RGBA,
  level: number,
  within?: ScanWindow,
): ContentBox | null {
  const x0 = Math.max(0, within?.minX ?? 0);
  const y0 = Math.max(0, within?.minY ?? 0);
  const x1 = Math.min(plate.width, within?.maxX ?? plate.width);
  const y1 = Math.min(plate.height, within?.maxY ?? plate.height);
  if (x1 <= x0 || y1 <= y0) return null;

  const columns = new Float64Array(plate.width);
  const rows = new Float64Array(plate.height);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const d = backgroundDistance(plate, x, y, background);
      if (d <= level) continue;
      columns[x] += d;
      rows[y] += d;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return {
    left: minX + inset(columns, minX, 1),
    right: maxX + 1 - inset(columns, maxX, -1),
    top: minY + inset(rows, minY, 1),
    bottom: maxY + 1 - inset(rows, maxY, -1),
  };
}

/**
 * How far inside its own pixel an edge sits, from the mass either side of it.
 *
 * `towards` points into the shape. A full outer line (as much mass as the line
 * behind it) insets nothing; an outer line with none of it insets a whole pixel,
 * which is the limit rather than a case that happens — a line with no mass is not
 * the edge.
 */
function inset(mass: Float64Array, edge: number, towards: 1 | -1): number {
  const inner = mass[edge + towards];
  if (!inner || inner <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - mass[edge] / inner));
}

/** Every pixel a frame's pieces could touch, as an integer scan window. */
function pieceWindow(frame: Frame, viewport: Viewport): ScanWindow | null {
  const project = projector(viewport);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const piece of frame.pieces) {
    for (let i = 0; i < piece.world.length; i += 2) {
      const [px, py] = project(piece.world[i], piece.world[i + 1]);
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return {
    minX: Math.floor(minX) - 1,
    minY: Math.floor(minY) - 1,
    maxX: Math.ceil(maxX) + 2,
    maxY: Math.ceil(maxY) + 2,
  };
}

/**
 * The content box of one candidate frame, drawn into `viewport`.
 *
 * Composited rather than measured piece by piece: two nearly-transparent parts
 * overlapping at an extreme edge are content together and neither alone, and the
 * reference side is a composite, so this one has to be too.
 */
export function frameContentBox(
  frame: Frame,
  pages: Map<string, Plate>,
  viewport: Viewport,
  background: RGBA,
  level: number,
): ContentBox | null {
  const window = pieceWindow(frame, viewport);
  if (!window) return null;
  const plate = new Plate(viewport.width, viewport.height);
  fill(plate, background);
  const project = projector(viewport);
  for (const piece of frame.pieces) {
    rasterisePiece(pageFor(pages, piece), piece, project, viewport, (px, py, r, g, b, a) => {
      plate.blend(px, py, [r, g, b, a]);
    });
  }
  return contentBoxOfPlate(plate, background, level, window);
}

// ---------------------------------------------------------------------------
// the fit
// ---------------------------------------------------------------------------

/** One frame's two content boxes: what the candidate drew, and what is on disk. */
export interface BoxPair {
  candidate: ContentBox;
  reference: ContentBox;
}

/** What framing the candidate cost, and what it could not absorb. */
export interface FramingFit {
  /** The candidate's content box, unioned over every frame compared. */
  candidate: ContentBox;
  /** The reference frames' content box, over the same frames. */
  reference: ContentBox;
  /** How many frames the fit was made from. */
  frames: number;
  /**
   * Uniform scale carrying candidate pixels onto reference pixels.
   *
   * `> 1` means the candidate's content is SMALLER than the reference's and was
   * scaled up to meet it; `1` means the two agree.
   */
  scale: number;
  /** Translation in frame pixels, applied after the scale. */
  dx: number;
  dy: number;
  /** RMS of what the fit left over, across every edge of every frame, in pixels. */
  rms: number;
  /** What one uniform scale could not absorb on the union box: `scale·w − W`. */
  residualWidth: number;
  residualHeight: number;
  /** Candidate aspect ÷ reference aspect − 1, on the union box. */
  aspectError: number;
}

/**
 * The similarity transform mapping the candidate's content onto the reference's,
 * by least squares over **every edge of every frame**.
 *
 * ## Why every frame, and not the union box
 *
 * The first version of this fitted one union box to the other, and that is still
 * an extreme-value statistic — it just moved the fragility from an invisible quad
 * corner to a visible pixel. Rung 5 demonstrates it: that candidate's runner has
 * rigid limbs where the reference's fly off the body, so on a handful of frames it
 * reaches about 1.5 px further left than anything in the reference does. Framing on
 * the union let those few frames rescale all 322 of them, and the reported MAE went
 * **4.35 → 19.7** against a viewport that is known to be right.
 *
 * Fitting over every frame gives each frame's four edges one vote out of `4N`, so
 * a pose that overreaches on three frames moves the framing by about `3/N` of what
 * it used to. What that overreach *should* do — and now does — is show up in the
 * residual, where it reads as "your shot covers more ground than the reference's".
 *
 * ## The derivation
 *
 * With `T(p) = s·p + t` the optimal `t` always centres the two clouds, so with `x`
 * the candidate's edge positions and `X` the reference's,
 *
 *   s = [Σ(x−x̄)(X−X̄) + Σ(y−ȳ)(Y−Ȳ)] / [Σ(x−x̄)² + Σ(y−ȳ)²]
 *
 * x and y pooled into one sum because the scale is uniform, with their own means
 * because the translation is not. The single-box case is this with `N = 1`.
 *
 * ## What it deliberately does NOT do: throw outliers away
 *
 * Four robust variants were written and measured against the five ladder
 * candidates and the selftest fixture — sigma trimming, Tukey IRLS, a median
 * estimator, and dropping whichever of the four edge kinds disagrees with the
 * other three. None of them beat plain least squares across the set, and two were
 * clearly worse on the one shot where a correct viewport is known (rung 5, whose
 * author matched the reference's world box by hand): 8.60 trimmed and 13.4 IRLS
 * against 12.5 plain, where the correct framing scores 4.35. The simplest
 * estimator that no single frame can move is the one that ships.
 *
 * ## The floor, stated plainly
 *
 * This registers two shots by their **extent**, and when the candidate's
 * silhouette genuinely differs the best fit of the extents is not the best
 * alignment of the pictures. Measured on rung 5: at the viewport known to be
 * right, the candidate's top edge sits 0.2 px inside the reference's, and the fit
 * spends 0.1 % of scale and a quarter-pixel of offset absorbing it — which costs
 * more than leaving it. That shot moves 1.35 MAE per 0.065 px of viewport, so a
 * framing good to a third of a pixel is worth several MAE there and nothing at all
 * on rung 4. The residual line says when this is happening (`union residual`
 * larger than a pixel, or `rms` above one) and `--viewport` pins the box when an
 * author knows better.
 *
 * ⚠️ What least squares cannot do is make two different shapes agree. If the
 * candidate covers a different extent the fit splits the difference, and the
 * leftover is reported as `residualWidth`/`residualHeight` and `rms` — computed
 * over **every** edge, trimmed ones included — rather than being silently spent.
 * That residual is the number that says "something is a different size, or is in
 * one shot and not the other", which used to arrive disguised as MAE.
 */
export function fitFraming(pairs: BoxPair[]): FramingFit {
  if (pairs.length === 0) throw new Error('fitFraming needs at least one frame to fit');
  const xs: Array<[number, number]> = [];
  const ys: Array<[number, number]> = [];
  let candidate: ContentBox | null = null;
  let reference: ContentBox | null = null;
  for (const pair of pairs) {
    xs.push([pair.candidate.left, pair.reference.left], [pair.candidate.right, pair.reference.right]);
    ys.push([pair.candidate.top, pair.reference.top], [pair.candidate.bottom, pair.reference.bottom]);
    candidate = unionBoxes(candidate, pair.candidate);
    reference = unionBoxes(reference, pair.reference);
  }
  const mean = (v: Array<[number, number]>, i: 0 | 1): number => v.reduce((a, p) => a + p[i], 0) / v.length;
  const xBar = mean(xs, 0);
  const XBar = mean(xs, 1);
  const yBar = mean(ys, 0);
  const YBar = mean(ys, 1);
  let numerator = 0;
  let denominator = 0;
  for (const [x, X] of xs) {
    numerator += (x - xBar) * (X - XBar);
    denominator += (x - xBar) ** 2;
  }
  for (const [y, Y] of ys) {
    numerator += (y - yBar) * (Y - YBar);
    denominator += (y - yBar) ** 2;
  }
  const scale = denominator > 0 ? numerator / denominator : 1;
  const dx = XBar - scale * xBar;
  const dy = YBar - scale * yBar;
  let squared = 0;
  for (const [x, X] of xs) squared += (scale * x + dx - X) ** 2;
  for (const [y, Y] of ys) squared += (scale * y + dy - Y) ** 2;

  const c = candidate as ContentBox;
  const r = reference as ContentBox;
  const candidateAspect = boxHeight(c) > 0 ? boxWidth(c) / boxHeight(c) : 0;
  const referenceAspect = boxHeight(r) > 0 ? boxWidth(r) / boxHeight(r) : 0;
  return {
    candidate: c,
    reference: r,
    frames: pairs.length,
    scale,
    dx,
    dy,
    rms: Math.sqrt(squared / (xs.length + ys.length)),
    residualWidth: scale * boxWidth(c) - boxWidth(r),
    residualHeight: scale * boxHeight(c) - boxHeight(r),
    aspectError: referenceAspect > 0 ? candidateAspect / referenceAspect - 1 : 0,
  };
}

/**
 * How far from the identity a fit may be and still be called settled, in pixels.
 *
 * A tenth of a pixel, because that is roughly the floor of the method: a content
 * box read off a rendered grid is quantised, and the sub-pixel edge estimate
 * recovers a fraction of that rather than all of it. Chasing below this is
 * chasing the measurement, and the loop starts jittering instead of converging.
 */
export const SETTLED_PIXELS = 0.1;

/** Is this fit close enough to the identity that another pass would only add noise? */
export function fitIsSettled(fit: FramingFit): boolean {
  return fitDistance(fit) < SETTLED_PIXELS;
}

/**
 * How far applying this fit would move the content, in pixels: the worst of its
 * four box corners.
 *
 * Not `|scale − 1|` and not `|t|` — either alone is misleading, because the
 * translation is chosen to centre the boxes and therefore *cancels* part of the
 * scale. What an author cares about, and what the loop should stop on, is how far
 * anything actually moves.
 */
export function fitDistance(fit: FramingFit): number {
  return cornerSpread(fit.candidate, (x, y) => [fit.scale * x + fit.dx - x, fit.scale * y + fit.dy - y]);
}

/**
 * How far apart two passes' corrections are, in pixels — the same corner measure
 * as `fitDistance`, applied to the difference between the two transforms.
 *
 * This is what tells a framing loop that it is **cycling** rather than
 * converging. The loop's passes are not independent samples: each one is measured
 * on the render the previous one produced, so when the fit has no fixed point the
 * sequence falls into a repeating orbit instead of wandering. Rung 6 does exactly
 * that with period 4 — passes 4–7 repeat as 8–11 and again as 12–15, agreeing to
 * within 0.02 px — and a loop that cannot tell that apart from slow convergence
 * spends every remaining pass re-measuring states it has already seen.
 *
 * The boxes come from `a`, because the two fits are measured against the same
 * reference frames and it is the candidate's own extent that the correction moves.
 */
export function fitSeparation(a: FramingFit, b: FramingFit): number {
  return cornerSpread(a.candidate, (x, y) => [
    a.scale * x + a.dx - (b.scale * x + b.dx),
    a.scale * y + a.dy - (b.scale * y + b.dy),
  ]);
}

/** The worst displacement a transform applies over a box's four corners. */
function cornerSpread(box: ContentBox, displace: (x: number, y: number) => [number, number]): number {
  const { left, top, right, bottom } = box;
  let worst = 0;
  for (const [x, y] of [
    [left, top],
    [right, top],
    [left, bottom],
    [right, bottom],
  ]) {
    const [dx, dy] = displace(x, y);
    worst = Math.max(worst, Math.hypot(dx, dy));
  }
  return worst;
}

/**
 * How far two passes' corrections may differ and still be called the same state.
 *
 * Half of `SETTLED_PIXELS`, and the gap it has to live in was measured rather than
 * picked: on rung 6 two passes one period apart differ by **0.018 px** while two
 * adjacent passes of the same orbit differ by **0.110 px**. A detector at 0.05 px
 * separates those by a factor of three either way. Loose enough to fire late, and
 * a late cycle report costs a pass; tight enough that it never fires on a loop
 * that is still moving, and a false one would stop a converging fit short.
 */
export const CYCLE_PIXELS = SETTLED_PIXELS / 2;

// ---------------------------------------------------------------------------
// the MAE-refined final pass
// ---------------------------------------------------------------------------

/**
 * How far the MAE-refined pass may move a fitted box, in frame pixels.
 *
 * Two, because what it is there to recover is *one* pixel. The extent fit lands
 * within a fraction of a pixel of its own optimum and its optimum is the wrong
 * one by about that much (`fitFraming`, "the floor, stated plainly"), so the
 * distance between "where the extents agree" and "where the pictures agree" is a
 * pixel or two and never more — measured across the committed corpus, every
 * offset the pass applies is `(0, ±1)`, `(±1, 0)`, `(±1, ±1)`, `(−1, 2)` or
 * `(−2, ≤1)`, and none of the 86 sets wants a corner of the window. A wider
 * window would start being able to absorb a real displacement, which is the one
 * thing the framing must not do.
 */
export const REFINE_RADIUS = 2;

/**
 * How much of the figure a shift must buy before it is allowed to move the box,
 * as a fraction of the set's own reference-denominator MAE...
 *
 * ...and `REFINE_MIN_GAIN_MAE` beside it, absolutely, because a ratio alone means
 * nothing on a shot whose MAE is already 3.
 *
 * ## What the corpus says, and what the threshold is therefore for
 *
 * Measured over the 86 compared sets of the committed runs: the best offset in
 * ±2 px is the **exact identity** on 52 of them — every set framed by
 * `frames.json`'s own box among them, which is the `idle`-class control issue #146
 * asked for — and on the other 34 the gain runs **0.9 % … 30.9 %** (0.40 … 14.34
 * MAE), clustering at 3 % and above with two lone readings at 1.0 % and 0.9 %.
 *
 * ⚠️ So this is **not** a threshold separating two measured populations, and it
 * must not be quoted as one: it is a floor under a continuum. What makes a low
 * floor the right shape here is that the pass minimises the reported figure
 * *itself*, so the cost of applying a marginal offset is bounded by the threshold
 * — a hundredth of the figure — while the cost of refusing one is a constant pixel
 * left inside a number an author reads as motion. Erring towards applying is the
 * cheap direction, and the report prints what was applied and what it was worth
 * either way.
 */
export const REFINE_MIN_GAIN = 0.01;
/** ...and how much of the figure that is, in MAE points, whatever the ratio says. */
export const REFINE_MIN_GAIN_MAE = 0.1;

/** What the best whole-pixel offset in a window is worth, over a set's frames. */
export interface OffsetGain {
  dx: number;
  dy: number;
  /** Mean reference-denominator MAE at the identity — the figure as it stands. */
  identity: number;
  /** ...and at `dx, dy`, which is the same figure with one constant taken out. */
  best: number;
  /** How far the search looked, and how many frames it pooled. */
  radius: number;
  frames: number;
}

/**
 * The set's reference-denominator MAE at every whole-pixel offset in a window,
 * accumulated one frame at a time.
 *
 * ## What this is for: the constant pixel a settled fit still leaves
 *
 * `fitFraming` registers two shots by their **extent**, and a shot whose
 * silhouette genuinely differs has its best extent fit about a third of a pixel
 * from its best alignment. Measured on the spineboy candidates (issue #146), that
 * floor is not a rounding detail: a **constant** translation of one or two pixels
 * is worth 12 % of `death`'s headline MAE and up to 30 % of a fitted set's,
 * while the genuinely per-frame remainder is a tenth of it. A loop reading those
 * numbers as motion is reading a framing offset.
 *
 * ## Why the objective is the reference denominator
 *
 * Because it is the figure the report tells an author to optimise against
 * (`FrameCheck.maeReference`), and because it is the one the candidate cannot
 * grow: minimising the union MAE would let a shift that drags more cheap pixels
 * into the denominator win, which is issue #119 arriving by another door.
 *
 * ## Why whole pixels, and why a plate shift rather than a re-render
 *
 * The projector is `px = (wx − minX)·k`, so moving the box by exactly `dx/k`
 * moves every sample point by exactly one pixel and samples the same texels —
 * the render at the shifted box **is** the render shifted, but for content
 * outside the old frame. That makes a 25-offset search cost one render per frame
 * instead of 25, and it is why the window is whole pixels: a sub-pixel offset
 * changes the resampling, so nothing could be searched without re-rendering it.
 * The offset that wins is then applied to the viewport and everything the report
 * prints is measured on a real render at a real box.
 */
export class OffsetScan {
  readonly radius: number;
  private readonly span: number;
  /** Σ over frames of the per-frame reference-denominator MAE, per offset. */
  private readonly sums: Float64Array;
  private counted = 0;

  constructor(radius: number = REFINE_RADIUS) {
    this.radius = Math.max(0, Math.round(radius));
    this.span = this.radius * 2 + 1;
    this.sums = new Float64Array(this.span * this.span);
  }

  /**
   * One frame: the candidate as it was rendered, its own coverage mask, and the
   * reference as it is on disk.
   *
   * ⭐ The figure accumulated here is `FrameCheck.maeReference` **exactly** —
   * the difference summed over the pixels either side covers, over the count of
   * the ones the *reference* covers — because the line the report prints and the
   * line this pass minimises have to be the same line. Taking the numerator over
   * the reference's pixels alone would be a near neighbour of it and a different
   * number, and a "54.31 → 48.47" that did not match the MAE line under it would
   * be two measurements wearing one name.
   *
   * A frame the reference drew nothing in counts as zero rather than being
   * skipped, which is again what `checkOneFrame` does with it: an empty
   * denominator is not a measurement, and dropping the frame instead would divide
   * this pass's mean by a different frame count than the report's.
   */
  add(candidate: Plate, coverage: Uint8Array, reference: Plate, background: RGBA): void {
    const { width, height } = reference;
    this.counted++;
    // The reference's own drawn pixels, by the predicate `checkOneFrame` uses.
    const drawn = new Uint8Array(width * height);
    const drawnAt: number[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!isContent(reference, x, y, background)) continue;
        const at = y * width + x;
        drawn[at] = 1;
        drawnAt.push(at);
      }
    }
    if (drawnAt.length === 0) return;
    // ...and the candidate's, which move with the offset. Held as a list because
    // the second sum below walks them in candidate coordinates.
    const inkAt: number[] = [];
    for (let at = 0; at < coverage.length; at++) if (coverage[at] === 1) inkAt.push(at);

    const a = candidate.data;
    const b = reference.data;
    const bg = background;
    /** |candidate at `from` − reference at `to`|, mean over RGB, either off-grid. */
    const delta = (from: number, to: number): number => {
      const j = to * 4;
      const i = from * 4;
      const ar = from < 0 ? bg[0] : a[i];
      const ag = from < 0 ? bg[1] : a[i + 1];
      const ab = from < 0 ? bg[2] : a[i + 2];
      const br = to < 0 ? bg[0] : b[j];
      const bgc = to < 0 ? bg[1] : b[j + 1];
      const bb = to < 0 ? bg[2] : b[j + 2];
      return (Math.abs(ar - br) + Math.abs(ag - bgc) + Math.abs(ab - bb)) / 3;
    };
    for (let dy = -this.radius; dy <= this.radius; dy++) {
      for (let dx = -this.radius; dx <= this.radius; dx++) {
        let sum = 0;
        // Every reference-drawn pixel, against whatever the shifted candidate puts
        // there — background where the shift pulls it off its own grid, which is
        // what the render at the shifted box would draw.
        for (let i = 0; i < drawnAt.length; i++) {
          const at = drawnAt[i];
          const x = at % width;
          const y = (at - x) / width;
          const sx = x - dx;
          const sy = y - dy;
          sum += delta(sx < 0 || sy < 0 || sx >= width || sy >= height ? -1 : sy * width + sx, at);
        }
        // ...and every pixel the candidate covers that the reference does not,
        // which is the other half of the union. A pixel the shift carries out of
        // the frame is clipped there, so it leaves the sum entirely.
        for (let i = 0; i < inkAt.length; i++) {
          const at = inkAt[i];
          const x = at % width;
          const y = (at - x) / width;
          const tx = x + dx;
          const ty = y + dy;
          if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
          const to = ty * width + tx;
          if (drawn[to] === 1) continue;
          sum += delta(at, to);
        }
        this.sums[this.index(dx, dy)] += sum / drawnAt.length;
      }
    }
  }

  /**
   * The offset with the lowest figure, or `null` when no frame carried reference
   * ink.
   *
   * Ties go to the smaller displacement and then to the lower `dy`, `dx`, so the
   * answer is a function of the pixels and not of the iteration order —
   * `A18_DETERMINISTIC_EMIT`'s discipline applied to a measurement. The identity
   * therefore wins any tie it is in, which is what makes "no constant offset
   * here" a reachable answer rather than an arbitrary one.
   */
  best(): OffsetGain | null {
    if (this.counted === 0) return null;
    let bestDx = 0;
    let bestDy = 0;
    let bestSum = this.sums[this.index(0, 0)];
    for (let dy = -this.radius; dy <= this.radius; dy++) {
      for (let dx = -this.radius; dx <= this.radius; dx++) {
        const sum = this.sums[this.index(dx, dy)];
        if (sum > bestSum) continue;
        if (sum === bestSum && !closerToHome(dx, dy, bestDx, bestDy)) continue;
        bestSum = sum;
        bestDx = dx;
        bestDy = dy;
      }
    }
    return {
      dx: bestDx,
      dy: bestDy,
      identity: this.sums[this.index(0, 0)] / this.counted,
      best: bestSum / this.counted,
      radius: this.radius,
      frames: this.counted,
    };
  }

  private index(dx: number, dy: number): number {
    return (dy + this.radius) * this.span + (dx + this.radius);
  }
}

/** Is `(dx, dy)` the smaller displacement, ties broken by `dy` then `dx`? */
function closerToHome(dx: number, dy: number, atX: number, atY: number): boolean {
  const mine = dx * dx + dy * dy;
  const theirs = atX * atX + atY * atY;
  if (mine !== theirs) return mine < theirs;
  if (dy !== atY) return dy < atY;
  return dx < atX;
}

/** Is this offset worth moving a box for? See `REFINE_MIN_GAIN`. */
export function offsetIsWorthApplying(gain: OffsetGain): boolean {
  if (gain.dx === 0 && gain.dy === 0) return false;
  const won = gain.identity - gain.best;
  return won >= REFINE_MIN_GAIN_MAE && gain.identity > 0 && won / gain.identity >= REFINE_MIN_GAIN;
}

/**
 * The same box moved by whole frame pixels, at the same scale.
 *
 * `applyFit` with a scale of exactly 1, written out rather than routed through
 * it, because the refined pass changes no scale at all and a fit-shaped argument
 * with `scale: 1` in it would invite one.
 */
export function shiftViewport(
  viewport: Viewport,
  dx: number,
  dy: number,
  pixelWidth: number,
  pixelHeight: number,
): Viewport {
  const minX = viewport.minX - dx / viewport.scale;
  const maxY = viewport.maxY + dy / viewport.scale;
  const width = pixelWidth / viewport.scale;
  const height = pixelHeight / viewport.scale;
  return viewportOfSize(minX, maxY - height, width, height, viewport.scale, pixelWidth, pixelHeight);
}

/**
 * The viewport that renders the candidate where the fit says it belongs.
 *
 * `projector` is `px = (wx − minX)·k`, `py = (maxY − wy)·k`, so asking for
 * `px' = s·px + dx` is asking for `k' = s·k` and an origin moved by `dx/k'`. The
 * pixel size is the frames' own and is never re-derived from the box — rounding it
 * a second time would shift every measurement by up to half a pixel, which on
 * these shots is louder than most of what is being measured.
 */
export function applyFit(
  viewport: Viewport,
  fit: FramingFit,
  pixelWidth: number,
  pixelHeight: number,
): Viewport {
  const scale = viewport.scale * fit.scale;
  const minX = viewport.minX - fit.dx / scale;
  const maxY = viewport.maxY + fit.dy / scale;
  const width = pixelWidth / scale;
  const height = pixelHeight / scale;
  return viewportOfSize(minX, maxY - height, width, height, scale, pixelWidth, pixelHeight);
}
