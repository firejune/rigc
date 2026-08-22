/**
 * Slot tracking — which part landed where, and when that cannot be said.
 *
 * ## Two matchers, in order, and a cap on both
 *
 * The cheap matcher labels the reference frame's connected components and asks
 * which one each of the candidate's slots landed on. It is right whenever the
 * parts of a shot are separate blobs, and it has two failure modes that two
 * honest ladder runs hit head-on (issue #34):
 *
 * - **Parts that touch label as one component.** Rung 4 is a disc with five chain
 *   links hanging off it; they touch in every frame of every animation, so every
 *   slot came back "ambiguous" and the run produced **no drift table at all**.
 * - **Nearest-centroid has no notion of "too far to be the same thing".** Rung 5's
 *   4 px ball, on the frames where it rests against the course and has no component
 *   of its own, matched the floating girder 47 px away — and the summary line
 *   reported **48.3 px of drift for a 4 px ball**, unflagged.
 *
 * So: components first, and when a component cannot be attributed to one slot, the
 * slot's own rendered quad is **template-matched** against the reference in a
 * window around where the candidate drew it. Touching parts stop being fatal —
 * a link that overlaps its neighbour still correlates against its own pixels.
 *
 * ⛔ And both matchers are capped by `searchRadius`: a part may be displaced by
 * about its own size and still be the same part in the picture, and past that the
 * honest report is **no match**. A number that is not a measurement of the slot it
 * is printed beside is worse than a blank, because it is actionable and wrong.
 */
import { Plate, type RGBA } from '../tools/plate.ts';
import { backgroundDistance, isContent } from './framing.ts';
import { pageFor, projector, rasterisePiece, type Frame, type Footprint, type Viewport } from './render.ts';

/** Components smaller than this are antialiasing crumbs, not parts. */
const MIN_COMPONENT_PIXELS = 4;
/** A second component this close to the nearest makes a component match a guess. */
const AMBIGUITY_RATIO = 1.25;
/**
 * How much bigger than the slot a component may be and still be *that slot's*.
 *
 * Above it, the slot is inside something larger — the reference merged it with a
 * neighbour, or drew it behind one — and the component's centroid is the merged
 * blob's, not the part's.
 *
 * ⚠️ Pixel count alone is not enough, and rung 3's transcription is the proof: at
 * `heavy/f0009` the pendulum touches the block, the two label as one 1227 px blob,
 * and the pendulum's own 836 px makes that only 1.47x — under any ratio loose
 * enough to tolerate antialiasing. The blob's **bounding box** gives it away (60 px
 * wide against the slot's 39), so both tests have to pass. Erring towards "merged"
 * is the safe direction: a slot wrongly called merged still gets a drift from the
 * template matcher, where a merged blob wrongly called the slot's own reports the
 * blob's centroid as the part's position.
 */
const MERGE_RATIO = 1.6;
/** How much wider or taller than the slot a component may be, as a fraction. */
const MERGE_MARGIN = 0.1;
/** ...and never less than this, so antialiasing alone cannot trip it. */
const MERGE_MARGIN_PIXELS = 2;
/** Displacement bounds, in frame pixels: never search less, never search more. */
const MIN_SEARCH_RADIUS = 4;
const MAX_SEARCH_RADIUS = 32;
/** Search radius as a fraction of the slot's own long side. */
const SEARCH_SPAN = 0.75;
/** How many template pixels a correlation samples, at most. */
const MAX_SAMPLES = 256;
/** A rival peak must be at least this far from the winner to count as a rival. */
const RIVAL_GAP = 3;
/**
 * How distinctive a correlation peak must be before its offset is reported.
 *
 * ⭐ It rises with the displacement being claimed, and that is the whole point. A
 * peak sitting where the candidate already drew the slot is only confirming a
 * position, so a weak peak is enough; a peak claiming the part is most of a search
 * radius away is claiming something big, and the bar for it is correspondingly
 * high. Rung 4 is the case that fixed the constant: `chain1` — a 9x27 sliver in a
 * chain of near-identical links — correlated 26 px away at confidence 0.16, and
 * that number went straight into the summary line as the run's worst drift. Under
 * this rule it needs 0.60 and comes back as **no match**, which is the honest
 * answer for a repetitive structure.
 */
const MIN_CONFIDENCE = 0.15;
/** How much more distinctive a peak must be at a full radius out than at zero. */
const CONFIDENCE_SLOPE = 0.45;
/** The residual must be under this fraction of the slot's own contrast. */
const MAX_RESIDUAL_FRACTION = 0.5;

export interface Component {
  pixels: number;
  cx: number;
  cy: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Connected components of "not the background colour", 8-connected.
 *
 * 8-connected rather than 4: a thin diagonal — a bar, a stick, a shadow's edge —
 * breaks into a dotted line under 4-connectivity, and then one part reads as
 * twenty and every match is ambiguous for a reason that is about the labeller.
 */
export function componentsOf(plate: Plate, background: RGBA): Component[] {
  const { width, height } = plate;
  const label = new Int32Array(width * height).fill(-1);
  const out: Component[] = [];
  const stack: number[] = [];
  for (let y0 = 0; y0 < height; y0++) {
    for (let x0 = 0; x0 < width; x0++) {
      const seed = y0 * width + x0;
      if (label[seed] !== -1 || !isContent(plate, x0, y0, background)) continue;
      const id = out.length;
      label[seed] = id;
      stack.push(seed);
      let pixels = 0;
      let sx = 0;
      let sy = 0;
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;
      while (stack.length > 0) {
        const at = stack.pop() as number;
        const x = at % width;
        const y = (at - x) / width;
        pixels++;
        sx += x + 0.5;
        sy += y + 0.5;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const n = ny * width + nx;
            if (label[n] !== -1 || !isContent(plate, nx, ny, background)) continue;
            label[n] = id;
            stack.push(n);
          }
        }
      }
      out.push({ pixels, cx: sx / pixels, cy: sy / pixels, minX, minY, maxX: maxX + 1, maxY: maxY + 1 });
    }
  }
  return out.filter((c) => c.pixels >= MIN_COMPONENT_PIXELS).sort((a, b) => b.pixels - a.pixels);
}

/** How the drift beside a slot was arrived at. `none` means it could not be. */
export type MatchMethod = 'component' | 'template' | 'none';

export interface SlotTrack {
  slot: string;
  candidate: { cx: number; cy: number; width: number; height: number; pixels: number } | null;
  method: MatchMethod;
  /** The reference component this slot was matched to — component matches only. */
  reference: { cx: number; cy: number; width: number; height: number; pixels: number } | null;
  /** Centroid distance in frame pixels, or the correlation offset's length. */
  drift: number | null;
  /** The same displacement with its direction, reference minus candidate. */
  driftX: number | null;
  driftY: number | null;
  /** Bounding-box differences — component matches only, where a bbox is known. */
  widthDrift: number | null;
  heightDrift: number | null;
  /** 0..1 for a template match: how much better the winner is than its best rival. */
  confidence: number | null;
  /** How far the match was allowed to look, in frame pixels. */
  searchRadius: number | null;
  /** Set when the drift is not a measurement of this slot, saying why. */
  ambiguity: string | null;
}

/**
 * How far this slot may be displaced and still be the same thing in the picture.
 *
 * Tied to the slot's own size, because that is what makes the bound mean
 * something: past about its own long side a part no longer overlaps where it was,
 * and a correlation peak out there is another object, not this one moved.
 */
export function searchRadius(width: number, height: number): number {
  const span = Math.round(Math.max(width, height) * SEARCH_SPAN);
  return Math.max(MIN_SEARCH_RADIUS, Math.min(MAX_SEARCH_RADIUS, span));
}

/** What the template matcher needs to draw one slot on its own. */
export interface SlotSource {
  frame: Frame;
  pages: Map<string, Plate>;
  viewport: Viewport;
  background: RGBA;
  reference: Plate;
}

// ---------------------------------------------------------------------------
// the component pass
// ---------------------------------------------------------------------------

interface Pending {
  track: SlotTrack;
  foot: Footprint;
  claimed: Component | null;
}

/**
 * Match each drawn slot to a reference component, then template-match the rest.
 *
 * Returns the tracks in slot-name order, plus how many reference components the
 * candidate accounted for — a component nothing overlaps is something in the shot
 * the candidate has not drawn.
 */
export function matchSlots(
  footprints: Map<string, Footprint>,
  components: Component[],
  source: SlotSource | null,
): { tracks: SlotTrack[]; matchedComponents: number } {
  const pending: Pending[] = [];
  const takenBy = new Map<Component, string[]>();

  for (const [slot, foot] of [...footprints].sort((a, b) => a[0].localeCompare(b[0]))) {
    const track = blankTrack(slot);
    if (foot.pixels === 0) {
      track.ambiguity = 'the candidate draws nothing here — the slot is empty or entirely outside the frame';
      pending.push({ track, foot, claimed: null });
      continue;
    }
    track.candidate = {
      cx: foot.cx,
      cy: foot.cy,
      width: foot.maxX - foot.minX,
      height: foot.maxY - foot.minY,
      pixels: Math.round(foot.pixels),
    };
    const radius = searchRadius(track.candidate.width, track.candidate.height);
    track.searchRadius = radius;
    if (components.length === 0) {
      track.ambiguity = 'the reference frame is empty — nothing to match against';
      pending.push({ track, foot, claimed: null });
      continue;
    }

    // A component whose box holds this slot's centroid and is not much bigger than
    // the slot is that slot's own blob. One much bigger than the slot is a merge:
    // its centroid is the merged shape's and says nothing about this part.
    const covering = components.filter(
      (c) => foot.cx >= c.minX - 1 && foot.cx <= c.maxX + 1 && foot.cy >= c.minY - 1 && foot.cy <= c.maxY + 1,
    );
    const width = track.candidate.width;
    const height = track.candidate.height;
    const margin = Math.max(MERGE_MARGIN_PIXELS, MERGE_MARGIN * Math.max(width, height));
    const own = covering
      .filter(
        (c) =>
          c.pixels <= foot.pixels * MERGE_RATIO &&
          c.maxX - c.minX <= width + margin &&
          c.maxY - c.minY <= height + margin,
      )
      .sort((a, b) => Math.abs(a.pixels - foot.pixels) - Math.abs(b.pixels - foot.pixels))[0];

    // Containment plus a compatible size is a far stronger claim than nearest
    // centroid, so it is taken at face value and the runner-up test below — which
    // exists to catch a *guess* — does not apply to it.
    if (own) {
      fillComponentMatch(track, foot, own);
      claim(takenBy, own, slot);
      pending.push({ track, foot, claimed: own });
      continue;
    }

    if (covering.length > 0) {
      const biggest = covering.sort((a, b) => b.pixels - a.pixels)[0];
      track.ambiguity =
        `this slot is inside a reference component ${(biggest.pixels / Math.max(1, foot.pixels)).toFixed(1)}x its ` +
        `size and ${biggest.maxX - biggest.minX}x${biggest.maxY - biggest.minY} px against its ${width}x${height} — ` +
        'the reference merged it with something it touches or is drawn behind';
      pending.push({ track, foot, claimed: null });
      continue;
    }

    // Nothing contains it: the slot landed in open background. Nearest centroid is
    // a guess, so it is bounded by what this slot could plausibly have moved, and
    // a rival about as near makes it a guess between two things.
    const ranked = components
      .map((c) => ({ c, d: Math.hypot(c.cx - foot.cx, c.cy - foot.cy) }))
      .sort((a, b) => a.d - b.d);
    const nearest = ranked[0];
    if (nearest.d > radius) {
      track.ambiguity =
        `the nearest reference component is ${nearest.d.toFixed(1)} px away, past the ${radius} px this ` +
        `${Math.round(Math.max(track.candidate.width, track.candidate.height))} px slot could have moved and still ` +
        'be itself';
      pending.push({ track, foot, claimed: null });
      continue;
    }
    if (ranked[1] && ranked[1].d <= nearest.d * AMBIGUITY_RATIO) {
      track.ambiguity =
        `two reference components are about equally near (${nearest.d.toFixed(1)} px and ${ranked[1].d.toFixed(1)} px)`;
      pending.push({ track, foot, claimed: null });
      continue;
    }
    fillComponentMatch(track, foot, nearest.c);
    claim(takenBy, nearest.c, slot);
    pending.push({ track, foot, claimed: nearest.c });
  }

  // A component two slots both claim is one blob the reference merged. Neither
  // claim is a measurement of its slot, so both drop to the template matcher.
  for (const [component, claimants] of takenBy) {
    if (claimants.length < 2) continue;
    for (const entry of pending) {
      if (!claimants.includes(entry.track.slot)) continue;
      const others = claimants.filter((s) => s !== entry.track.slot);
      entry.track.ambiguity =
        `shares one reference component with ${others.map((s) => JSON.stringify(s)).join(', ')} — they touch or ` +
        'overlap in this frame';
      entry.claimed = component;
      clearMatch(entry.track);
    }
  }

  // The fallback: anything the components could not attribute, correlated against
  // its own rendered pixels.
  if (source) {
    for (const entry of pending) {
      if (entry.track.ambiguity === null || entry.track.candidate === null || entry.foot.pixels === 0) continue;
      applyTemplateMatch(entry.track, entry.foot, source);
    }
  }

  const tracks = pending.map((p) => p.track);
  return { tracks, matchedComponents: countExplained(footprints, components) };
}

function claim(takenBy: Map<Component, string[]>, component: Component, slot: string): void {
  const claimants = takenBy.get(component) ?? [];
  claimants.push(slot);
  takenBy.set(component, claimants);
}

function blankTrack(slot: string): SlotTrack {
  return {
    slot,
    candidate: null,
    method: 'none',
    reference: null,
    drift: null,
    driftX: null,
    driftY: null,
    widthDrift: null,
    heightDrift: null,
    confidence: null,
    searchRadius: null,
    ambiguity: null,
  };
}

function fillComponentMatch(track: SlotTrack, foot: Footprint, component: Component): void {
  track.method = 'component';
  track.reference = {
    cx: component.cx,
    cy: component.cy,
    width: component.maxX - component.minX,
    height: component.maxY - component.minY,
    pixels: component.pixels,
  };
  track.driftX = component.cx - foot.cx;
  track.driftY = component.cy - foot.cy;
  track.drift = Math.hypot(track.driftX, track.driftY);
  track.widthDrift = foot.maxX - foot.minX - track.reference.width;
  track.heightDrift = foot.maxY - foot.minY - track.reference.height;
}

function clearMatch(track: SlotTrack): void {
  track.method = 'none';
  track.reference = null;
  track.drift = null;
  track.driftX = null;
  track.driftY = null;
  track.widthDrift = null;
  track.heightDrift = null;
}

/**
 * How many reference components the candidate accounts for.
 *
 * Overlap rather than the drift match, and deliberately so: a slot whose drift
 * could not be measured has still *drawn* over that blob, and counting it as
 * unaccounted would report "something in the shot you have not drawn" about a part
 * that is right there. What this number is for is the opposite case — a component
 * no slot reaches at all.
 */
function countExplained(footprints: Map<string, Footprint>, components: Component[]): number {
  let explained = 0;
  for (const component of components) {
    for (const foot of footprints.values()) {
      if (foot.pixels === 0) continue;
      if (foot.minX >= component.maxX || component.minX >= foot.maxX) continue;
      if (foot.minY >= component.maxY || component.minY >= foot.maxY) continue;
      explained++;
      break;
    }
  }
  return explained;
}

// ---------------------------------------------------------------------------
// the template pass
// ---------------------------------------------------------------------------

interface Template {
  /** Patch origin in frame pixels. */
  ox: number;
  oy: number;
  width: number;
  height: number;
  /** The slot alone, composited over the background. */
  patch: Plate;
  /** Offsets into the patch that carry the slot's own pixels. */
  samples: Int32Array;
  /** Mean distance from the background over those samples: how visible it is. */
  contrast: number;
}

/**
 * The slot on its own, over the background, at the size it drew.
 *
 * Its own pieces and nothing else — the point of the fallback is that the
 * reference merged this part with its neighbours, so the thing being looked for
 * has to be the part rather than the blob.
 */
function templateFor(slot: string, foot: Footprint, source: SlotSource): Template | null {
  const ox = Math.floor(foot.minX);
  const oy = Math.floor(foot.minY);
  const width = Math.ceil(foot.maxX) - ox;
  const height = Math.ceil(foot.maxY) - oy;
  if (width <= 0 || height <= 0) return null;
  const patch = new Plate(width, height);
  const bg = source.background;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) patch.set(x, y, bg);
  const project = projector(source.viewport);
  const shifted = (wx: number, wy: number): [number, number] => {
    const [px, py] = project(wx, wy);
    return [px - ox, py - oy];
  };
  let drew = false;
  for (const piece of source.frame.pieces) {
    if (piece.slot !== slot) continue;
    rasterisePiece(pageFor(source.pages, piece), piece, shifted, { width, height }, (px, py, r, g, b, a) => {
      patch.blend(px, py, [r, g, b, a]);
      drew = true;
    });
  }
  if (!drew) return null;

  const hits: number[] = [];
  let sum = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = backgroundDistance(patch, x, y, bg);
      if (d <= 0) continue;
      hits.push(y * width + x);
      sum += d;
    }
  }
  if (hits.length === 0) return null;
  const stride = Math.max(1, Math.ceil(hits.length / MAX_SAMPLES));
  const samples: number[] = [];
  for (let i = 0; i < hits.length; i += stride) samples.push(hits[i]);
  return {
    ox,
    oy,
    width,
    height,
    patch,
    samples: Int32Array.from(samples),
    contrast: sum / hits.length,
  };
}

/** Mean absolute RGB difference between the template and the reference at an offset. */
function scoreAt(template: Template, source: SlotSource, dx: number, dy: number): number {
  const { patch, samples, width, ox, oy } = template;
  const reference = source.reference;
  const bg = source.background;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const at = samples[i];
    const x = at % width;
    const y = (at - x) / width;
    const a = patch.get(x, y);
    const rx = ox + x + dx;
    const ry = oy + y + dy;
    const b =
      rx < 0 || ry < 0 || rx >= reference.width || ry >= reference.height ? bg : reference.get(rx, ry);
    sum += (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;
  }
  return sum / samples.length;
}

/**
 * Correlate one slot against the reference inside its own search radius.
 *
 * Multi-resolution: a full sweep at a coarse stride, then halving steps around the
 * winner, then a parabolic refinement for the sub-pixel part. That keeps the cost
 * near-constant in the radius — a big part gets a big window without paying its
 * square — and the coarse sweep doubles as the rival field the confidence is read
 * from.
 */
function applyTemplateMatch(track: SlotTrack, foot: Footprint, source: SlotSource): void {
  if (!track.candidate || track.searchRadius === null) return;
  const template = templateFor(track.slot, foot, source);
  if (!template || template.contrast <= 0) return;
  const radius = track.searchRadius;
  const cache = new Map<number, number>();
  const score = (dx: number, dy: number): number => {
    const key = (dy + MAX_SEARCH_RADIUS * 2) * 1024 + (dx + MAX_SEARCH_RADIUS * 2);
    const seen = cache.get(key);
    if (seen !== undefined) return seen;
    const value = scoreAt(template, source, dx, dy);
    cache.set(key, value);
    return value;
  };

  const coarse = Math.max(1, Math.round(radius / 8));
  let bestX = 0;
  let bestY = 0;
  let best = Infinity;
  const sweep: Array<{ dx: number; dy: number; s: number }> = [];
  for (let dy = -radius; dy <= radius; dy += coarse) {
    for (let dx = -radius; dx <= radius; dx += coarse) {
      const s = score(dx, dy);
      sweep.push({ dx, dy, s });
      if (s < best) {
        best = s;
        bestX = dx;
        bestY = dy;
      }
    }
  }
  for (let step = coarse; step > 1; ) {
    step = Math.max(1, Math.floor(step / 2));
    for (let dy = bestY - step; dy <= bestY + step; dy += step) {
      for (let dx = bestX - step; dx <= bestX + step; dx += step) {
        if (Math.abs(dx) > radius || Math.abs(dy) > radius) continue;
        const s = score(dx, dy);
        if (s < best) {
          best = s;
          bestX = dx;
          bestY = dy;
        }
      }
    }
  }

  // A winner nobody else came close to is a located part. A winner its neighbours
  // match just as well is a featureless blob, and no offset is evidence.
  const gap = Math.max(RIVAL_GAP, coarse);
  let rival = Infinity;
  for (const { dx, dy, s } of sweep) {
    if (Math.hypot(dx - bestX, dy - bestY) < gap) continue;
    if (s < rival) rival = s;
  }
  const confidence = Number.isFinite(rival) && rival > 0 ? Math.max(0, Math.min(1, 1 - best / rival)) : 0;

  const reach = Math.min(1, Math.hypot(bestX, bestY) / radius);
  const required = MIN_CONFIDENCE + reach * CONFIDENCE_SLOPE;
  if (best > template.contrast * MAX_RESIDUAL_FRACTION || confidence < required) {
    track.method = 'none';
    track.confidence = Number.isFinite(confidence) ? confidence : 0;
    track.ambiguity =
      `${track.ambiguity ?? 'no component of its own'}; correlating the slot's own pixels found no match within ` +
      `${radius} px either (best residual ${best.toFixed(1)} against its own ${template.contrast.toFixed(1)} of ` +
      `contrast; confidence ${(Number.isFinite(confidence) ? confidence : 0).toFixed(2)} where ` +
      `${required.toFixed(2)} is needed ${Math.hypot(bestX, bestY).toFixed(1)} px out)`;
    return;
  }

  const dx = bestX + parabolic(score(bestX - 1, bestY), best, score(bestX + 1, bestY));
  const dy = bestY + parabolic(score(bestX, bestY - 1), best, score(bestX, bestY + 1));
  track.method = 'template';
  track.reference = null;
  track.driftX = dx;
  track.driftY = dy;
  track.drift = Math.hypot(dx, dy);
  track.widthDrift = null;
  track.heightDrift = null;
  track.confidence = confidence;
  track.ambiguity = null;
}

/** Sub-pixel minimum of the parabola through three samples one pixel apart. */
function parabolic(before: number, at: number, after: number): number {
  const denominator = before - 2 * at + after;
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-9) return 0;
  return Math.max(-0.5, Math.min(0.5, (before - after) / (2 * denominator)));
}

/** Is this track's drift a measurement of this slot? */
export function isAttributable(track: SlotTrack): boolean {
  return track.drift !== null && track.ambiguity === null;
}
