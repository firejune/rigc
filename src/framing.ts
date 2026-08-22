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
 */
import { Plate, type RGBA } from '../tools/plate.ts';
import {
  fill,
  pageFor,
  projector,
  rasteriseQuad,
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

/** Every pixel a frame's quads could touch, as an integer scan window. */
function quadWindow(frame: Frame, viewport: Viewport): ScanWindow | null {
  const project = projector(viewport);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const quad of frame.quads) {
    for (let i = 0; i < 8; i += 2) {
      const [px, py] = project(quad.world[i], quad.world[i + 1]);
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
 * Composited rather than measured quad by quad: two nearly-transparent parts
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
  const window = quadWindow(frame, viewport);
  if (!window) return null;
  const plate = new Plate(viewport.width, viewport.height);
  fill(plate, background);
  const project = projector(viewport);
  for (const quad of frame.quads) {
    rasteriseQuad(pageFor(pages, quad), quad, project, viewport, (px, py, r, g, b, a) => {
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
  const { left, top, right, bottom } = fit.candidate;
  let worst = 0;
  for (const [x, y] of [
    [left, top],
    [right, top],
    [left, bottom],
    [right, bottom],
  ]) {
    worst = Math.max(worst, Math.hypot(fit.scale * x + fit.dx - x, fit.scale * y + fit.dy - y));
  }
  return worst;
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
