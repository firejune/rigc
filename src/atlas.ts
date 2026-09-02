/**
 * The atlas as a data structure: read one, pack one, write one.
 *
 * Until issue #4 rigc had exactly one atlas shape — one part, one page, region
 * covers the page — and one function that wrote it (`buildAtlasText` in
 * [`src/compile.ts`](compile.ts)). That is why the npm keyword `atlas` set an
 * expectation the tool did not meet: nine loose PNGs compiled to `pages=9
 * regions=9`, which is correct, valid, and not what anybody means by an atlas.
 *
 * This module holds the three pieces that were missing, and nothing else:
 *
 *   * `parseAtlasText` — the format read back in, so an atlas somebody else
 *     packed can be an INPUT (`build --atlas-in`);
 *   * `packAtlas` — loose part PNGs arranged onto shared pages (`build --pack`);
 *   * `writeAtlasText` — the one emitter for both shapes, so the unpacked
 *     default and a packed page are written by the same code.
 *
 * ## 🚨 Two invariants this file exists to keep
 *
 * **Packing is an OUTPUT arrangement, never an input contract.** Sizes are still
 * measured from the loose PNGs by `readPngInfo` before anything here runs, the
 * skeleton is compiled from those measurements, and `--pack` changes only where
 * the bytes sit on a page. A packed build's `skeleton.json` is byte-identical to
 * the unpacked one's — that is a property of this split, and the selftest
 * asserts it rather than trusting it.
 *
 * **A packed region is a lossless copy.** Nothing here resamples, scales, trims
 * or rotates: a region's pixels are written to the page unchanged, and the
 * selftest lifts every region back off its page and compares it byte for byte
 * against the loose PNG (`PK02`). See `extrudeCell` for the one thing that has to
 * be ADDED to the page for the render to agree as well, and `PACK_NO_ROTATE` for
 * the field this deliberately does not use.
 *
 * ⚠️ **The rendered pictures are equal to within one least significant bit, not
 * bit-for-bit, and the difference is arithmetic rather than texels.** A packed
 * region's UVs are `x / pageWidth` rather than `0..1`, so the sampling coordinate
 * carries one more rounding step (`fl(regionX + fl(s * width))` cannot be exact
 * once `regionX > 0`); the interpolation weight can then differ in its last bit
 * and a `Math.round` sitting exactly on a `.5` boundary lands the other way.
 * Measured: 0 to 480 channel samples of 7 to 21 million on the three public
 * fixtures, worst difference **1**, against 22,000 to 60,000 samples and a worst
 * difference of **77** when the gutter is removed — and byte-identical on eleven
 * of the repository's thirteen rigs across 1,101 frames. Making it exact would mean
 * sampling in region-local coordinates and adding the integer page offset to the
 * tap indices, which is a change to `src/render.ts` that would move every
 * committed reference frame by the same one bit; that is a decision for whoever
 * owns those records, not a side effect of adding a packer.
 *
 * ## Why a second parser for a format `spine-core` already parses
 *
 * `src/compile.ts` must stay independent of the runtime — that is what keeps the
 * compiler and the gate from checking each other's assumptions — so the importer
 * cannot reach for `TextureAtlas`. The reader below is therefore written straight
 * off `TextureAtlas`'s own field table (`dist/TextureAtlas.js`, the
 * `pageFields` / `regionFields` maps and the loop under them), including the
 * parts that look like mistakes and are not: the page name is trimmed and a
 * region name is the RAW line, a blank line closes a page block, `readEntry`
 * stops at four values, and `originalWidth/Height` fall back to `width/height`
 * only when BOTH are zero.
 *
 * A second opinion about a format is a liability, so it is measured rather than
 * asserted: the selftest parses every `.atlas` in the example corpus with both
 * this reader and `spine-core`'s and compares every field of every region. If
 * they ever disagree, that control goes red and this file is wrong.
 */
import { CompileError } from './errors.ts';
import { Plate, readPlate } from '../tools/plate.ts';

// ---------------------------------------------------------------------------
// reading
// ---------------------------------------------------------------------------

/** One region of a parsed atlas, in `TextureAtlasRegion`'s own field names. */
export interface AtlasRegion {
  /**
   * The region's name, exactly as `TextureAtlas` takes it: the raw line,
   * UNTRIMMED. Every consumer that joins on a name has to trim it itself, and
   * `regionKey` in [`src/render.ts`](render.ts) is the precedent — a file
   * written with CRLF would otherwise name different regions from the same text.
   */
  name: string;
  /** Page-space left edge of the packed rectangle, x right from the page's left. */
  x: number;
  /** Page-space top edge, y DOWN from the page's top. */
  y: number;
  /**
   * The kept rectangle's width, in the DRAWING's orientation.
   *
   * ⚠️ Not the page footprint. At `rotate: 90` / `270` the rectangle on the page
   * is `height x width`; `TextureAtlas` transposes for `u2/v2` at 90 and not at
   * 270, which is a bug in the runtime and the reason `windowOf` in
   * [`src/render.ts`](render.ts) derives the rectangle rather than reading those
   * two numbers. This field is the atlas's own meaning of `bounds`, untouched.
   */
  width: number;
  height: number;
  /** Trim offset from the drawing's LEFT edge. */
  offsetX: number;
  /** Trim offset from the drawing's BOTTOM edge — art space runs the other way. */
  offsetY: number;
  /** The untrimmed drawing's size: what an attachment's width/height means. */
  originalWidth: number;
  originalHeight: number;
  /** 0, 90, 180 or 270. A `rotate: true` line reads as 90, which is the format's older spelling. */
  degrees: number;
  /** Sequence index, or 0 for a region that is not part of one. */
  index: number;
}

/** One page of a parsed atlas, with the regions that sit on it. */
export interface AtlasPage {
  /** The page name, trimmed — the image path as seen from the atlas file. */
  name: string;
  /** Index into the text's line array of the line the name was read from. */
  nameLine: number;
  width: number;
  height: number;
  pma: boolean;
  /**
   * The page's `scale:` line — how much SMALLER these texels are than the
   * drawings they were packed from — or `1` when the page declares none.
   *
   * ⚠️ The second field on this interface that `TextureAtlas` does not have, and
   * for the same kind of reason as `nameLine`: the runtime drops `scale:` because
   * an attachment's size comes out of the skeleton JSON (`region.width =
   * map.width * scale` in `SkeletonJson`, no atlas involved), so a player never
   * needs it. An IMPORTER does. `--atlas-in` derives an attachment's size from
   * the region when the rig spec declares none, and the region's
   * `originalWidth/Height` are in the page's own texels — at `scale: 0.5` they
   * are half the drawing. Reading the line here is what lets the importer state
   * the drawing's size instead of the pack's (issue #267); dropping it is what
   * made an imported `scale: 0.5` pack halve every attachment in silence.
   *
   * `atlasScales` in [`src/render.ts`](render.ts) reads the same field off the
   * raw text for the MAE report, and the selftest holds the two readers to the
   * same answer on every corpus atlas.
   */
  scale: number;
  regions: AtlasRegion[];
}

export interface ParsedAtlas {
  pages: AtlasPage[];
  /** Every region on every page, in file order — `TextureAtlas.regions`'s order. */
  regions: AtlasRegion[];
  /** The text split the way `TextureAtlas` splits it, for `rewritePageNames`. */
  lines: string[];
}

/**
 * `TextureAtlasReader.readEntry`, to the value.
 *
 * Returns the number of values, 0 when the line is blank or carries no colon —
 * which is the signal the caller uses to decide "this is a name line, not a
 * field". Four values maximum, because that is where the runtime stops (`if (i
 * === 4) return 4`) and a fifth would silently mean something here that it does
 * not mean there.
 */
function readEntry(line: string | null): { key: string; values: string[] } | null {
  if (line === null) return null;
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  const colon = trimmed.indexOf(':');
  if (colon === -1) return null;
  const key = trimmed.slice(0, colon).trim();
  const values: string[] = [];
  let lastMatch = colon + 1;
  for (;;) {
    const comma = trimmed.indexOf(',', lastMatch);
    if (comma === -1) {
      values.push(trimmed.slice(lastMatch).trim());
      break;
    }
    values.push(trimmed.slice(lastMatch, comma).trim());
    lastMatch = comma + 1;
    if (values.length === 4) break;
  }
  return { key, values };
}

/** `parseInt` with the runtime's own tolerance: a bad number reads as NaN there too. */
function int(text: string | undefined): number {
  return parseInt(text ?? '', 10);
}

/**
 * Read an atlas file's text into pages and regions.
 *
 * A transcription of `TextureAtlas`'s constructor, and deliberately a dull one —
 * every branch below is there because the runtime has it. Two additions, both of
 * them fields a PLAYER has no use for and an IMPORTER does: `nameLine`, which
 * `rewritePageNames` needs, and the page's `scale:`, which is what turns a
 * region's texels back into the drawing's own size (`AtlasPage.scale`).
 */
export function parseAtlasText(text: string): ParsedAtlas {
  const lines = text.split(/\r\n|\r|\n/);
  let at = 0;
  const readLine = (): string | null => (at >= lines.length ? null : lines[at++]);

  const pages: AtlasPage[] = [];
  const regions: AtlasRegion[] = [];

  let line = readLine();
  // Ignore empty lines before the first entry.
  while (line !== null && line.trim().length === 0) line = readLine();
  // Header entries, which the runtime silently ignores. A first line with no
  // colon IS the first page name and ends this loop without being consumed.
  while (line !== null && line.trim().length > 0 && readEntry(line) !== null) line = readLine();

  let page: AtlasPage | null = null;
  for (;;) {
    if (line === null) break;
    if (line.trim().length === 0) {
      page = null;
      line = readLine();
      continue;
    }
    if (!page) {
      page = { name: line.trim(), nameLine: at - 1, width: 0, height: 0, pma: false, scale: 1, regions: [] };
      for (;;) {
        line = readLine();
        const entry = readEntry(line);
        if (entry === null) break;
        if (entry.key === 'size') {
          page.width = int(entry.values[0]);
          page.height = int(entry.values[1]);
        } else if (entry.key === 'pma') {
          page.pma = entry.values[0] === 'true';
        } else if (entry.key === 'scale') {
          // The one key this reader takes that the runtime's `pageFields` does
          // not — see `AtlasPage.scale`. A value that is not a positive finite
          // number leaves the default of 1 rather than poisoning every size
          // derived from it: `scale: 0` would divide the pack into infinity, and
          // a page whose own scale line is unreadable is a page whose texels are
          // the only measurement left.
          const value = Number(entry.values[0]);
          if (Number.isFinite(value) && value > 0) page.scale = value;
        }
        // `format`, `filter` and `repeat` are read by the runtime into fields no
        // consumer here has; they pass through `rewritePageNames` untouched.
      }
      pages.push(page);
      continue;
    }
    const region: AtlasRegion = {
      name: line,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      offsetX: 0,
      offsetY: 0,
      originalWidth: 0,
      originalHeight: 0,
      degrees: 0,
      index: 0,
    };
    for (;;) {
      line = readLine();
      const entry = readEntry(line);
      if (entry === null) break;
      switch (entry.key) {
        case 'xy':
          region.x = int(entry.values[0]);
          region.y = int(entry.values[1]);
          break;
        case 'size':
          region.width = int(entry.values[0]);
          region.height = int(entry.values[1]);
          break;
        case 'bounds':
          region.x = int(entry.values[0]);
          region.y = int(entry.values[1]);
          region.width = int(entry.values[2]);
          region.height = int(entry.values[3]);
          break;
        case 'offset':
          region.offsetX = int(entry.values[0]);
          region.offsetY = int(entry.values[1]);
          break;
        case 'orig':
          region.originalWidth = int(entry.values[0]);
          region.originalHeight = int(entry.values[1]);
          break;
        case 'offsets':
          region.offsetX = int(entry.values[0]);
          region.offsetY = int(entry.values[1]);
          region.originalWidth = int(entry.values[2]);
          region.originalHeight = int(entry.values[3]);
          break;
        case 'rotate':
          if (entry.values[0] === 'true') region.degrees = 90;
          else if (entry.values[0] !== 'false') region.degrees = int(entry.values[0]);
          break;
        case 'index':
          region.index = int(entry.values[0]);
          break;
        default:
          break; // an unknown field becomes names/values in the runtime; nothing here reads them
      }
    }
    // BOTH zero, not either: a region 40 wide and 0 tall keeps its declared zero.
    if (region.originalWidth === 0 && region.originalHeight === 0) {
      region.originalWidth = region.width;
      region.originalHeight = region.height;
    }
    page.regions.push(region);
    regions.push(region);
  }

  return { pages, regions, lines };
}

/**
 * The same atlas text with every page's name line replaced.
 *
 * This is how `--atlas-in` emits: the imported atlas passes through verbatim —
 * every field, every region, every page, in its own order and its own whitespace
 * — and only the page NAMES move, because they are paths and the file has been
 * re-anchored to a new directory. Rewriting by line index rather than by
 * re-serialising is the point: a re-serialiser would have to understand every
 * field it re-emits, and the ones it did not understand would quietly vanish
 * (`scale:` is the expensive example — [`atlasScales`](render.ts) reports it, and
 * a pack that is coarser than its drawings would stop saying so).
 */
export function rewritePageNames(parsed: ParsedAtlas, rename: (name: string) => string): string {
  const out = parsed.lines.slice();
  for (const page of parsed.pages) out[page.nameLine] = rename(page.name);
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// writing
// ---------------------------------------------------------------------------

/** A region as the emitter states it: everything `writeAtlasText` puts on the page. */
export interface EmitRegion {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  originalWidth: number;
  originalHeight: number;
}

export interface EmitPage {
  name: string;
  width: number;
  height: number;
  regions: EmitRegion[];
}

/**
 * ⛔ The packer never rotates, so `rotate: 0` is a fact rather than a field.
 *
 * The format supports `rotate: 90` and the Spine packer uses it — every official
 * example that has a tall thin part ships one. rigc's does not, for reasons that
 * are about honesty rather than difficulty:
 *
 *   * `artUvsOf` ([`src/render.ts`](render.ts)) already refuses a rotated region,
 *     because `RegionAttachment.computeUVs` assigns a different corner order at
 *     90° and `TextureAtlas` transposes `u2/v2` at 90 and not at 270. A packer
 *     that emitted rotation would be writing atlases its own `--atlas`
 *     substitution cannot read;
 *   * the whole feature is gated on how closely the packed render matches the
 *     unpacked one, and a transposed region is sampled through a different
 *     mapping — the gate would then be measuring the mapping rather than the pack.
 *
 * Rotation buys page area on a set of parts whose aspect ratios differ a lot. It
 * is not free and it is not implemented; a page that runs out of room spills to a
 * second page instead.
 */
export const PACK_NO_ROTATE = 0;

/**
 * The atlas text for these pages — the ONE emitter, for both atlas shapes.
 *
 * Two text-shape traps are load-bearing (A07 checks both): a region name is the
 * RAW line, so it carries no indentation, and a blank line closes a page block,
 * so there is none between a page header and its regions. Exactly one blank line
 * sits BETWEEN pages and none trails the last.
 *
 * The unpacked default goes through here too (`buildAtlasText` builds one page
 * per image and calls this), which is what makes "the defaults change nothing" a
 * property of one function instead of a promise made by two.
 */
export function writeAtlasText(pages: EmitPage[]): string {
  const lines: string[] = [];
  pages.forEach((page, i) => {
    if (i > 0) lines.push(''); // exactly one blank line BETWEEN pages
    lines.push(page.name);
    lines.push(`size: ${page.width}, ${page.height}`);
    lines.push('filter: Linear, Linear');
    lines.push('pma: false');
    for (const region of page.regions) {
      lines.push(region.name);
      lines.push(`bounds: ${region.x}, ${region.y}, ${region.width}, ${region.height}`);
      lines.push(`offsets: ${region.offsetX}, ${region.offsetY}, ${region.originalWidth}, ${region.originalHeight}`);
      lines.push(`rotate: ${PACK_NO_ROTATE}`);
    }
  });
  return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// packing
// ---------------------------------------------------------------------------

/**
 * What `--page-size` defaults to: the largest edge a page may have.
 *
 * 2048 rather than the Spine packer's 1024, and the corpus is the reason. A
 * ceiling of 1024 refuses four of the thirteen rigs in this repository whose art
 * is on disk — `1-weight-and-mass`'s `ground-bg` is 1251x394 and `6-arcs`'s
 * `platform` is 1064x396, because the shipped examples pack at `scale: 0.5` and
 * the loose sources are twice the packed size. A default that cannot pack the
 * project's own examples is the wrong default.
 *
 * It costs nothing on small rigs: this is a CEILING, and `packAtlas` writes the
 * smallest power-of-two page the set actually fits (a two-part rig gets 1024x256,
 * not 2048x2048). 2048 is also inside every GL implementation's guaranteed
 * maximum texture size that any consumer of a Spine atlas runs on.
 */
export const DEFAULT_PAGE_SIZE = 2048;
/** What `--padding` defaults to. See `extrudeCell` for why it is not 0 and not 1. */
export const DEFAULT_PADDING = 2;

/** The part a page is packed from: its region name and its pixels. */
export interface PackInput {
  region: string;
  /** Absolute path, for the message that names a part the pack could not fit. */
  absPath: string;
  width: number;
  height: number;
}

export interface PackOptions {
  /** Largest page edge. The page actually written is the smallest power of two that holds the pack. */
  pageSize?: number;
  /** Gutter each region reserves on every side. */
  padding?: number;
  /** Page filenames are `<stem>.png`, `<stem>2.png`, … — libgdx's own numbering. */
  pageStem?: string;
}

/** Where one region landed. `x`/`y` are the REGION's own corner, not its cell's. */
export interface Placement {
  region: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PackedPage {
  /** The page's filename, which is also its name in the atlas text. */
  name: string;
  width: number;
  height: number;
  /** The page's pixels, ready to `writePng`. */
  plate: Plate;
  /** Fraction of the page area the regions themselves cover, 0..1. */
  occupancy: number;
}

export interface PackResult {
  pages: PackedPage[];
  /** Every placement, in the packer's own (sorted) order. */
  placements: Placement[];
  /** The atlas text for the packed pages. */
  atlasText: string;
  padding: number;
}

/** A free rectangle in the MaxRects free list. */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The largest power of two that is at most `n`.
 *
 * `--page-size 1000` therefore means 512, not 1024: the flag is a ceiling the
 * page may not exceed, and page edges are powers of two (see `packAtlas`). A
 * value that is already a power of two passes through unchanged, which is every
 * value anybody types.
 */
function floorPowerOfTwo(n: number): number {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

/**
 * MaxRects with Best Short Side Fit, no rotation.
 *
 * The free list starts as the whole page and every placement splits every free
 * rectangle it overlaps into up to four new ones, after which rectangles wholly
 * contained in another are pruned. It is the standard formulation (Jylänki 2010)
 * and it is here rather than in a dependency because rigc has one dependency and
 * a bin packer is 90 lines.
 *
 * 🔒 **Determinism.** BSSF's score can tie, and a tie broken by "whichever came
 * first in the free list" makes the output depend on the order splits happened
 * to be pushed. So the tie-break is spelled out and total — smallest long-side
 * leftover, then topmost, then leftmost — and the caller sorts its input before
 * calling. Same inputs, byte-identical page.
 */
function packOnePage(cells: Array<{ w: number; h: number }>, pageW: number, pageH: number): Array<Rect | null> {
  const free: Rect[] = [{ x: 0, y: 0, w: pageW, h: pageH }];
  const placed: Array<Rect | null> = [];

  for (const cell of cells) {
    let best: Rect | null = null;
    let bestShort = Infinity;
    let bestLong = Infinity;
    for (const fr of free) {
      if (fr.w < cell.w || fr.h < cell.h) continue;
      const leftoverW = fr.w - cell.w;
      const leftoverH = fr.h - cell.h;
      const short = Math.min(leftoverW, leftoverH);
      const long = Math.max(leftoverW, leftoverH);
      if (best !== null) {
        if (short > bestShort) continue;
        if (short === bestShort) {
          if (long > bestLong) continue;
          if (long === bestLong) {
            if (fr.y > best.y) continue;
            if (fr.y === best.y && fr.x >= best.x) continue;
          }
        }
      }
      best = fr;
      bestShort = short;
      bestLong = long;
    }
    if (best === null) {
      placed.push(null);
      continue;
    }
    const put: Rect = { x: best.x, y: best.y, w: cell.w, h: cell.h };
    placed.push(put);

    // Split every free rectangle the placement overlaps, then prune.
    const next: Rect[] = [];
    for (const fr of free) {
      const overlaps = put.x < fr.x + fr.w && put.x + put.w > fr.x && put.y < fr.y + fr.h && put.y + put.h > fr.y;
      if (!overlaps) {
        next.push(fr);
        continue;
      }
      if (put.x > fr.x) next.push({ x: fr.x, y: fr.y, w: put.x - fr.x, h: fr.h });
      if (put.x + put.w < fr.x + fr.w) {
        next.push({ x: put.x + put.w, y: fr.y, w: fr.x + fr.w - (put.x + put.w), h: fr.h });
      }
      if (put.y > fr.y) next.push({ x: fr.x, y: fr.y, w: fr.w, h: put.y - fr.y });
      if (put.y + put.h < fr.y + fr.h) {
        next.push({ x: fr.x, y: put.y + put.h, w: fr.w, h: fr.y + fr.h - (put.y + put.h) });
      }
    }
    const contains = (a: Rect, b: Rect): boolean =>
      b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
    free.length = 0;
    for (let i = 0; i < next.length; i++) {
      if (next[i].w <= 0 || next[i].h <= 0) continue;
      let contained = false;
      for (let j = 0; j < next.length && !contained; j++) {
        if (i === j || next[j].w <= 0 || next[j].h <= 0) continue;
        // On a mutual containment (two identical rectangles) the later index
        // loses, so exactly one survives and it is always the same one.
        if (contains(next[j], next[i]) && (j < i || !contains(next[i], next[j]))) contained = true;
      }
      if (!contained) free.push(next[i]);
    }
  }
  return placed;
}

/**
 * The packing order, and it is stated rather than inherited.
 *
 * Descending by long side then by area is what makes a shelf packer behave; the
 * name is the final tie-break so that two parts of identical size always pack in
 * the same order. Region names are unique within a compile (a region name IS the
 * PNG basename, and `addImage` refuses a duplicate), so this is a TOTAL order —
 * which is the property `sort` needs for its result not to depend on the order
 * it was handed. `Bun.Glob` and `readdirSync` are both unsorted; nothing here
 * relies on the caller having sorted anything.
 */
function packOrder(a: PackInput, b: PackInput): number {
  const longA = Math.max(a.width, a.height);
  const longB = Math.max(b.width, b.height);
  if (longA !== longB) return longB - longA;
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  if (areaA !== areaB) return areaB - areaA;
  return a.region < b.region ? -1 : a.region > b.region ? 1 : 0;
}

/**
 * Copy one region's pixels onto a page, and fill its gutter by extending its
 * edges outwards.
 *
 * ⭐ **This is what makes the packed render agree with the unpacked one, and it is
 * not an optimisation.**
 * The rasteriser samples a page bilinearly and `bilinear` CLAMPS its taps to the
 * page's bounds ([`src/render.ts`](render.ts)) — so on an unpacked page, where
 * the region IS the page, a sample at the region's outer edge reads that edge
 * twice. Pack the same region into the middle of a bigger page and the clamp
 * stops happening: the second tap is now whatever is next door. Transparent
 * gutter is not a fix, it is a different wrong answer — the edge would fade.
 *
 * Extending the edge outwards reproduces the clamp exactly, because it makes the
 * neighbouring texel equal to the edge texel, which is what the clamp returned.
 * One pixel is all bilinear can reach; the gutter is `padding` pixels because a
 * consumer that mipmaps the page averages 2x2 blocks and 2 keeps that average
 * inside the region's own colours one level down. Hence `DEFAULT_PADDING = 2`:
 * 1 is the correctness floor, 2 is the floor plus one level of headroom, and 0
 * would put two unrelated drawings in adjacent texels.
 */
function extrudeCell(page: Plate, source: Plate, cellX: number, cellY: number, padding: number): void {
  const w = source.width;
  const h = source.height;
  // Straight into the two buffers: a 1024x1024 page is a million pixels and
  // `Plate.get` allocates a tuple per read.
  const dst = page.data;
  const src = source.data;
  for (let cy = 0; cy < h + 2 * padding; cy++) {
    const sy = Math.max(0, Math.min(h - 1, cy - padding));
    const srcRow = sy * w * 4;
    const dstRow = (cellY + cy) * page.width * 4;
    for (let cx = 0; cx < w + 2 * padding; cx++) {
      const sx = Math.max(0, Math.min(w - 1, cx - padding));
      const s = srcRow + sx * 4;
      const d = dstRow + (cellX + cx) * 4;
      dst[d] = src[s];
      dst[d + 1] = src[s + 1];
      dst[d + 2] = src[s + 2];
      dst[d + 3] = src[s + 3];
    }
  }
}

/**
 * Pack these parts onto shared pages.
 *
 * ## Page size
 *
 * `pageSize` is a MAXIMUM, not the size written. Both page edges are powers of
 * two and the pack is tried at every power-of-two pair up to that maximum, in
 * order of increasing area, so a four-part rig gets a 128x64 page rather than a
 * megabyte of transparency. Powers of two are not decoration: `region.x /
 * page.width` is the sampling coordinate every texel is read through, and a
 * power-of-two denominator makes that division exact in binary floating point —
 * which is what keeps a packed region's samples on the same grid as the unpacked
 * page's. With a non-power-of-two page the region origin itself would round, and
 * the one-bit residual described in this file's header would be two roundings
 * deep instead of one.
 *
 * Only when the whole set will not fit one page at the maximum does it spill,
 * and then every page is `pageSize x pageSize`. A single part whose cell is
 * bigger than that is refused by name — silently splitting one drawing across
 * two pages is not a thing the format can express.
 */
export function packAtlas(inputs: PackInput[], opts: PackOptions = {}): PackResult {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const padding = opts.padding ?? DEFAULT_PADDING;
  const stem = opts.pageStem ?? 'skeleton';
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new CompileError(`--page-size must be a positive integer, got ${String(opts.pageSize)}`);
  }
  if (!Number.isInteger(padding) || padding < 0) {
    throw new CompileError(`--padding must be a non-negative integer, got ${String(opts.padding)}`);
  }
  if (inputs.length === 0) throw new CompileError('nothing to pack: this compile emitted no images');

  const maxEdge = floorPowerOfTwo(pageSize);

  const sorted = inputs.slice().sort(packOrder);
  const cells = sorted.map((input) => ({ w: input.width + 2 * padding, h: input.height + 2 * padding }));

  for (let i = 0; i < sorted.length; i++) {
    if (cells[i].w <= maxEdge && cells[i].h <= maxEdge) continue;
    throw new CompileError(
      `"${sorted[i].region}" is ${sorted[i].width}x${sorted[i].height} and with --padding ${padding} needs a ` +
        `${cells[i].w}x${cells[i].h} cell, which does not fit a ${maxEdge}x${maxEdge} page ` +
        `(${sorted[i].absPath}). Raise --page-size, lower --padding, or leave this build unpacked — a packer ` +
        'cannot split one drawing across two pages.',
    );
  }

  // The smallest power-of-two page that holds the whole set, by area then width.
  const edges: number[] = [];
  for (let e = 1; e <= maxEdge; e *= 2) edges.push(e);
  const candidates: Array<{ w: number; h: number }> = [];
  for (const w of edges) for (const h of edges) candidates.push({ w, h });
  candidates.sort((a, b) => a.w * a.h - b.w * b.h || a.w - b.w);

  let pageW = maxEdge;
  let pageH = maxEdge;
  let single: Array<Rect | null> | null = null;
  for (const candidate of candidates) {
    const attempt = packOnePage(cells, candidate.w, candidate.h);
    if (attempt.some((r) => r === null)) continue;
    pageW = candidate.w;
    pageH = candidate.h;
    single = attempt;
    break;
  }

  /** page index -> the placements on it, in packing order. */
  const perPage: Placement[][] = [];
  const placements: Placement[] = [];
  if (single !== null) {
    perPage.push([]);
    single.forEach((rect, i) => {
      const place: Placement = {
        region: sorted[i].region,
        page: 0,
        x: rect!.x + padding,
        y: rect!.y + padding,
        width: sorted[i].width,
        height: sorted[i].height,
      };
      perPage[0].push(place);
      placements.push(place);
    });
  } else {
    // Spill. Every page is the maximum size; parts are taken in packing order
    // and whatever will not fit the current page opens the next one.
    let remaining = sorted.map((input, i) => ({ input, cell: cells[i] }));
    while (remaining.length > 0) {
      const pageIndex = perPage.length;
      const attempt = packOnePage(
        remaining.map((r) => r.cell),
        pageW,
        pageH,
      );
      const onThisPage: Placement[] = [];
      const leftOver: typeof remaining = [];
      attempt.forEach((rect, i) => {
        if (rect === null) {
          leftOver.push(remaining[i]);
          return;
        }
        const place: Placement = {
          region: remaining[i].input.region,
          page: pageIndex,
          x: rect.x + padding,
          y: rect.y + padding,
          width: remaining[i].input.width,
          height: remaining[i].input.height,
        };
        onThisPage.push(place);
        placements.push(place);
      });
      if (onThisPage.length === 0) {
        // Unreachable: every cell was proven to fit an empty page above. Kept as
        // a named stop rather than an infinite loop if that ever stops holding.
        throw new CompileError(
          `packing stalled with ${remaining.length} region(s) left and an empty ${pageW}x${pageH} page`,
        );
      }
      perPage.push(onThisPage);
      remaining = leftOver;
    }
  }

  // Draw. Reading each source once, in packing order, keeps the decode count at
  // one per part whatever the page layout turned out to be.
  const byRegion = new Map(sorted.map((input) => [input.region, input]));
  const pages: PackedPage[] = [];
  const emitPages: EmitPage[] = [];
  perPage.forEach((onPage, index) => {
    const plate = new Plate(pageW, pageH);
    let covered = 0;
    for (const place of onPage) {
      const input = byRegion.get(place.region)!;
      const source = readPlate(input.absPath);
      if (source.width !== input.width || source.height !== input.height) {
        // The size in the atlas came from the PNG's IHDR (`readPngInfo`); this is
        // the decoded image. They disagreeing means the file changed between the
        // two reads, or one of the two readers is wrong about it.
        throw new CompileError(
          `"${place.region}" measured ${input.width}x${input.height} from its PNG header and decodes to ` +
            `${source.width}x${source.height} (${input.absPath})`,
        );
      }
      extrudeCell(plate, source, place.x - padding, place.y - padding, padding);
      covered += place.width * place.height;
    }
    const name = index === 0 ? `${stem}.png` : `${stem}${index + 1}.png`;
    pages.push({ name, width: pageW, height: pageH, plate, occupancy: covered / (pageW * pageH) });
    emitPages.push({
      name,
      width: pageW,
      height: pageH,
      // Within a page, regions are listed by name. Placement order is equally
      // deterministic; a name order makes two packs of the same set diffable
      // even when a part changed size and moved.
      regions: onPage
        .slice()
        .sort((a, b) => (a.region < b.region ? -1 : a.region > b.region ? 1 : 0))
        .map((place) => ({
          name: place.region,
          x: place.x,
          y: place.y,
          width: place.width,
          height: place.height,
          // No trim: `offsets` states the drawing's full size and a zero inset,
          // which is what makes a region's own width/height the attachment's.
          offsetX: 0,
          offsetY: 0,
          originalWidth: place.width,
          originalHeight: place.height,
        })),
    });
  });

  return { pages, placements, atlasText: writeAtlasText(emitPages), padding };
}

// ---------------------------------------------------------------------------
// reading one region back out of a page
// ---------------------------------------------------------------------------

/**
 * One region's drawing, lifted off its page.
 *
 * Two callers, and they are the reason this is a function rather than two loops:
 * the compiler needs a part's own pixel grid when a generator measures the art
 * (a contour mesh traces its alpha), and the selftest needs it to assert that a
 * packed region is a LOSSLESS copy of the loose PNG it came from. One extractor
 * means the proof and the use cannot drift.
 *
 * The result is `originalWidth x originalHeight` — the untrimmed drawing — with
 * the kept rectangle placed at its trim offset and the rest left transparent.
 * `offsetY` is measured from the drawing's BOTTOM (the format's convention) and
 * a plate's rows run downwards, so the kept rectangle's top row is
 * `originalHeight - offsetY - height`.
 *
 * ⛔ A rotated region is refused rather than guessed. `TextureAtlas` transposes
 * `u2/v2` at 90 and not at 270, and `RegionAttachment.computeUVs` assigns a
 * different corner order at 90 — there are already three opinions in the runtime
 * about that mapping and this file is not going to be a fourth. rigc's own packer
 * never rotates (`PACK_NO_ROTATE`), so only a foreign atlas can reach this.
 */
export function extractRegion(page: Plate, region: AtlasRegion): Plate {
  if (region.degrees !== 0) {
    throw new CompileError(
      `region "${region.name.trim()}" is packed rotate: ${region.degrees}; reading a drawing back off a rotated ` +
        'region is not implemented — rigc\'s own packer never rotates, so this is a foreign pack. Supply the loose ' +
        'PNG instead of --atlas-in for the part that needs measuring.',
    );
  }
  const out = new Plate(region.originalWidth, region.originalHeight);
  const top = region.originalHeight - region.offsetY - region.height;
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      out.set(region.offsetX + x, top + y, page.get(region.x + x, region.y + y));
    }
  }
  return out;
}
