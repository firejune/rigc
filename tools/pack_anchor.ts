/**
 * pack_anchor — where a `polygon` pack's candidates may put a cell, measured
 * over a corpus: how many cells have an owned box inset from their cell's
 * corner, how many candidates the owned box's anchor refuses for that reason
 * alone, and what the pack finds under each footprint rule alone
 * (`FOOTPRINT_ANCHORS`: `box`, `box-or-cell`, `box-else-cell`, `best-of`) and
 * as `polygon` packs — the whole pack of least Σ page area among `rect` and
 * `POLYGON_CANDIDATE_RULES` (issue #1104).
 *
 *   bun tools/pack_anchor.ts [--recipes <recipes.json>] [--root <dir>] [--regions <set.json>]…
 *                            [--seeds <n,n,…>] [--padding <n>] [--page-size <n>] [--work <dir>] [--json <out.json>]
 *
 * With no source flag, the tree's own: `fixtures/polypack_shapes.ts`'s two
 * seeds (`POLYPACK_SEED`, `POLYPACK_GAIN_SEED`) and `tools/emit_hashes.ts`'s
 * `treeRecipes` (every gallery rig, and every fetched editor export when
 * `examples/` is there). The sources a flag names replace that default:
 *
 *   * `--recipes` takes an `emit-hashes-recipes/1` or `emit-hashes/1` document
 *     and `--root` resolves its stages, the way `hull_ceiling` and
 *     `verdict_gate` take them — a private corpus keeps its recipes with it and
 *     only the table leaves it, which names recipes and nothing else;
 *   * `--regions` (repeatable) takes a region set as a JSON array, or an object
 *     whose `regions` is one: each entry `width` (or `w`), `height` (or `h`) and
 *     `hull` — a flat `[x0, y0, x1, y1, …]` loop in the region's own texels, x
 *     right and y down — and optionally `region` (or `name`). Each region is
 *     written as a plate opaque inside its hull, as `writePolypackInputs`
 *     writes the generated sets, and packed by that hull;
 *   * `--seeds` takes generator seeds for `polypackShapes`.
 *
 * ## What a built recipe is packed as
 *
 * Every region the build's atlas states, once by name (a later region of the
 * same name is counted, not packed), lifted off its page at its drawing's size
 * (`originalWidth x originalHeight`, `extractRegion`) — the loose part a
 * `--pack` build of that drawing would pack — with the footprint
 * `packFootprints` reads off the build's `skeleton.json`, as `build --pack
 * --pack-shape polygon` reads it. A recipe built `--atlas-in` therefore packs
 * the parts of the pack it was handed, the editor's whitespace strip undone.
 *
 * ## The row
 *
 *   * **cells**, **mesh cells** (an owned set that is not the whole cell) and
 *     **inset** — cells whose owned box does not start at the cell's corner,
 *     with the distribution of the inset `(dx, dy)` in cell texels;
 *   * **first pass**: one footprint pass of every cell on an empty
 *     `page-size x page-size` page, first anchor only, run to its end
 *     (`footprintPass`) — the candidates it refused only because the cell
 *     would leave the page (`PassTally.boxAnchorRefused`) and the cells it
 *     missed although a free rectangle held their box (`missedByAnchor`);
 *   * **pages** under `--page-edges free` and `pot`: `rect`, every rule alone and
 *     `polygon` (with the candidate it kept), each as page sizes and Σ area, a
 *     page marked `>box` where it is larger than the owned box's anchor alone
 *     and `>rect` where it is larger than `rect`'s;
 *   * **cost** (`free`): free-list splits over every search the pack ran, the
 *     spill's assignment pass included (`PackOptions.tally`) — `PK93`'s unit;
 *     `polygon`'s is its three candidate packs together;
 *   * **deterministic**: every column's pack made twice, and once more with its
 *     parts handed over reversed, byte-identical — atlas text and every page's
 *     pixels — under both edge modes.
 *
 * Exit codes: 0 every set measured; 1 a recipe refused or unreadable (named in
 * the table and on stderr); 2 a bad input by name. The wall time is printed on
 * stderr only, so two runs print the same table.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_PADDING,
  emptyTally,
  extractRegion,
  FOOTPRINT_ANCHORS,
  footprintCell,
  footprintPass,
  packAtlas,
  packFootprints,
  parseAtlasText,
  type FootprintAnchors,
  type PackCandidate,
  type PackInput,
  type PackResult,
  type PageEdges,
  type PassTally,
} from '../src/atlas.ts';
import { readPlate } from './plate.ts';
import { HashesInputError, readRecipes, treeRecipes, TREE_ROOT, type Recipe } from './emit_hashes.ts';
import { buildRecipes } from './core_gate.ts';
import { POLYPACK_GAIN_SEED, POLYPACK_SEED, polypackShapes, writePolypackInputs, type PolypackShape } from '../fixtures/polypack_shapes.ts';

export const PACK_ANCHOR_SPEC = 'pack-anchor/1';

/** A refusal about an input — the command exits 2 on it. */
export class AnchorInputError extends Error {}

/** One pack's pages. */
export interface PageSet {
  pages: string;
  area: number;
}

/**
 * A column of the table: one footprint rule alone (`footprintAnchors` set), or
 * `polygon` as it packs — the whole pack of least Σ area among `rect` and
 * `POLYGON_CANDIDATE_RULES` (`packAtlas`).
 */
export type AnchorColumn = FootprintAnchors | 'polygon';
export const ANCHOR_COLUMNS: readonly AnchorColumn[] = [...FOOTPRINT_ANCHORS, 'polygon'];

/** What one edge mode's packs found: `rect`, and every column. */
export interface EdgeRow {
  rect: PageSet;
  polygon: Record<AnchorColumn, PageSet>;
  /** Which whole pack `polygon` kept. */
  kept: PackCandidate;
}

/** Free-list splits over every search a pack ran (`PackOptions.tally`), and what its footprint passes counted. */
export interface SearchCost {
  splits: number;
  tally: PassTally;
}

export interface AnchorRow {
  name: string;
  refused: string | null;
  cells: number;
  meshCells: number;
  /** Cells whose owned box is inset from the cell's corner, in packing order: `[dx, dy]`. */
  insets: Array<[number, number]>;
  /** Regions of the atlas skipped as a later region of a name already packed. */
  duplicates: number;
  firstPass: { refused: number; missed: number; placed: number };
  free: EdgeRow | null;
  pot: EdgeRow | null;
  cost: { rect: SearchCost; polygon: Record<AnchorColumn, SearchCost> } | null;
  deterministic: boolean | null;
}

/** The packer's own order (`packOrder` in src/atlas.ts): longest side, then area, then name. */
function inPackOrder(parts: readonly PackInput[]): PackInput[] {
  return parts
    .slice()
    .sort((a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height) || b.width * b.height - a.width * a.height || (a.region < b.region ? -1 : a.region > b.region ? 1 : 0));
}

function pageSet(pack: PackResult): PageSet {
  return { pages: pack.pages.map((p) => `${p.width}x${p.height}`).join('+'), area: pack.pages.reduce((n, p) => n + p.width * p.height, 0) };
}

function samePack(a: PackResult, b: PackResult): boolean {
  if (a.atlasText !== b.atlasText || a.pages.length !== b.pages.length) return false;
  return a.pages.every((p, i) => p.plate.data.length === b.pages[i].plate.data.length && p.plate.data.every((v, k) => v === b.pages[i].plate.data[k]));
}

function costOfTally(tally: PassTally): SearchCost {
  return { splits: tally.rectPlaced + tally.bandSplits, tally };
}

/** The row for one set of pack inputs. */
export function anchorRow(name: string, inputs: readonly PackInput[], padding: number, pageSize: number, duplicates = 0): AnchorRow {
  const sorted = inPackOrder(inputs);
  const shapes = sorted.map((p) => footprintCell(p.width, p.height, padding, p.footprint));
  const insets: Array<[number, number]> = [];
  for (const s of shapes) if (s.bbox.x !== 0 || s.bbox.y !== 0) insets.push([s.bbox.x, s.bbox.y]);
  const first = footprintPass(shapes, pageSize, pageSize, 'box');
  let deterministic = true;
  const costs = { rect: emptyTally(), polygon: {} as Record<AnchorColumn, PassTally> };
  const edgeRow = (pageEdges: PageEdges): EdgeRow => {
    const base = { pageEdges, padding, pageSize };
    const counted = pageEdges === 'free';
    const rect = packAtlas(inputs.slice(), { ...base, ...(counted ? { tally: costs.rect } : {}) });
    const sets = {} as Record<AnchorColumn, PageSet>;
    let kept: PackCandidate = 'rect';
    for (const column of ANCHOR_COLUMNS) {
      const opts = { ...base, shape: 'polygon' as const, ...(column === 'polygon' ? {} : { footprintAnchors: column }) };
      const tally = emptyTally();
      const pack = packAtlas(inputs.slice(), { ...opts, ...(counted ? { tally } : {}) });
      if (counted) costs.polygon[column] = tally;
      if (!samePack(pack, packAtlas(inputs.slice(), opts)) || !samePack(pack, packAtlas(inputs.slice().reverse(), opts))) deterministic = false;
      sets[column] = pageSet(pack);
      if (column === 'polygon') kept = pack.candidate;
    }
    return { rect: pageSet(rect), polygon: sets, kept };
  };
  const free = edgeRow('free');
  const pot = edgeRow('pot');
  const polygonCost = {} as Record<AnchorColumn, SearchCost>;
  for (const column of ANCHOR_COLUMNS) polygonCost[column] = costOfTally(costs.polygon[column]);
  return {
    name,
    refused: null,
    cells: shapes.length,
    meshCells: shapes.filter((s) => !s.whole).length,
    insets,
    duplicates,
    firstPass: { refused: first.tally.boxAnchorRefused, missed: first.tally.missedByAnchor, placed: first.rects.filter((r) => r !== null).length },
    free,
    pot,
    cost: { rect: costOfTally(costs.rect), polygon: polygonCost },
    deterministic,
  };
}

function refusedRow(name: string, why: string): AnchorRow {
  return { name, refused: why, cells: 0, meshCells: 0, insets: [], duplicates: 0, firstPass: { refused: 0, missed: 0, placed: 0 }, free: null, pot: null, cost: null, deterministic: null };
}

/** A built recipe's atlas regions, lifted to loose parts with the footprints its skeleton states. */
export function inputsOfBuild(out: string, liftDir: string): { inputs: PackInput[]; duplicates: number } {
  const atlasPath = join(out, 'skeleton.atlas');
  const skeletonPath = join(out, 'skeleton.json');
  if (!existsSync(atlasPath)) throw new AnchorInputError('the build wrote no skeleton.atlas');
  if (!existsSync(skeletonPath)) throw new AnchorInputError('the build wrote no skeleton.json');
  const atlas = parseAtlasText(readFileSync(atlasPath, 'utf8'));
  mkdirSync(liftDir, { recursive: true });
  const seen = new Set<string>();
  const lifted: Array<{ region: string; absPath: string; width: number; height: number }> = [];
  let duplicates = 0;
  for (const page of atlas.pages) {
    const pagePath = join(out, page.name);
    if (!existsSync(pagePath)) throw new AnchorInputError(`the atlas names page ${JSON.stringify(page.name)} and the build wrote no such file`);
    const plate = readPlate(pagePath);
    for (const region of page.regions) {
      const name = region.name.trim();
      if (seen.has(name)) {
        duplicates++;
        continue;
      }
      seen.add(name);
      const absPath = join(liftDir, `${String(lifted.length).padStart(4, '0')}.png`);
      extractRegion(plate, region).writePng(absPath);
      lifted.push({ region: name, absPath, width: region.originalWidth, height: region.originalHeight });
    }
  }
  if (lifted.length === 0) throw new AnchorInputError('the atlas states no region');
  const sizes = new Map(lifted.map((p) => [p.region, { width: p.width, height: p.height }]));
  const footprints = packFootprints(readFileSync(skeletonPath, 'utf8'), (region) => sizes.get(region));
  const inputs = lifted.map((p): PackInput => {
    const footprint = footprints.get(p.region) ?? undefined;
    return footprint === undefined ? p : { ...p, footprint };
  });
  return { inputs, duplicates };
}

/** A `--regions` document as generated-set shapes, refused by name where an entry is not one. */
export function readRegionSet(path: string): PolypackShape[] {
  if (!existsSync(path)) throw new AnchorInputError(`no such region set ${path}`);
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new AnchorInputError(`${path}: not JSON — ${(err as Error).message}`);
  }
  const list = Array.isArray(value) ? value : typeof value === 'object' && value !== null && Array.isArray((value as Record<string, unknown>).regions) ? ((value as Record<string, unknown>).regions as unknown[]) : null;
  if (list === null) throw new AnchorInputError(`${path}: neither an array of regions nor an object whose "regions" is one`);
  if (list.length === 0) throw new AnchorInputError(`${path}: no regions`);
  return list.map((entry, i): PolypackShape => {
    const e = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
    const width = e.width ?? e.w;
    const height = e.height ?? e.h;
    const hull = e.hull;
    const named = e.region ?? e.name;
    if (!Number.isInteger(width) || (width as number) < 1) throw new AnchorInputError(`${path}: regions[${i}] has no positive integer "width" (or "w"), got ${JSON.stringify(width)}`);
    if (!Number.isInteger(height) || (height as number) < 1) throw new AnchorInputError(`${path}: regions[${i}] has no positive integer "height" (or "h"), got ${JSON.stringify(height)}`);
    if (!Array.isArray(hull) || hull.length < 6 || hull.length % 2 !== 0 || !hull.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      throw new AnchorInputError(`${path}: regions[${i}] "hull" is not a flat loop of at least three [x, y] pairs of finite numbers`);
    }
    return { region: typeof named === 'string' && named !== '' ? named : `region_${String(i).padStart(3, '0')}`, width: width as number, height: height as number, hull: hull as number[] };
  });
}

// ---------------------------------------------------------------------------
// the table
// ---------------------------------------------------------------------------

function count(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** `min / median / max` of a list of whole numbers, or `—`. */
function spread(values: readonly number[]): string {
  if (values.length === 0) return '—';
  const s = values.slice().sort((a, b) => a - b);
  return `${s[0]} / ${s[Math.floor((s.length - 1) / 2)]} / ${s[s.length - 1]}`;
}

function ratio(n: number, d: number): string {
  return d > 0 ? `${(n / d).toFixed(2)}x` : '—';
}

/** The table as markdown lines: the census, then the pages and the cost. */
export function anchorTable(rows: readonly AnchorRow[]): string[] {
  const out: string[] = [];
  out.push('| set | cells | mesh cells | inset | dx min / median / max | dy min / median / max | first pass: refused by the page edge | first pass: cells missed | duplicates |');
  out.push('| --- | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: |');
  for (const r of rows) {
    if (r.refused !== null) {
      out.push(`| ${r.name} | REFUSED: ${r.refused} | | | | | | | |`);
      continue;
    }
    out.push(`| ${r.name} | ${r.cells} | ${r.meshCells} | ${r.insets.length} | ${spread(r.insets.map(([dx]) => dx))} | ${spread(r.insets.map(([, dy]) => dy))} | ${count(r.firstPass.refused)} | ${r.firstPass.missed} | ${r.duplicates} |`);
  }
  out.push('');
  out.push(`| set | edges | rect | ${ANCHOR_COLUMNS.map((a) => (a === 'polygon' ? 'polygon (kept)' : `${a} alone`)).join(' | ')} |`);
  out.push(`| --- | --- | --- | ${ANCHOR_COLUMNS.map(() => '---').join(' | ')} |`);
  const sums: Record<'free' | 'pot', { rect: number; polygon: Record<string, number> }> = { free: { rect: 0, polygon: {} }, pot: { rect: 0, polygon: {} } };
  for (const r of rows) {
    for (const edges of ['free', 'pot'] as const) {
      const e = r[edges];
      if (e === null) continue;
      sums[edges].rect += e.rect.area;
      const cells = ANCHOR_COLUMNS.map((a) => {
        const p = e.polygon[a];
        sums[edges].polygon[a] = (sums[edges].polygon[a] ?? 0) + p.area;
        const marks = [...(p.area > e.polygon.box.area ? ['>box'] : []), ...(p.area > e.rect.area ? ['>rect'] : [])];
        return `${p.pages} = ${count(p.area)}${marks.length === 0 ? '' : ` **${marks.join(' ')}**`}${a === 'polygon' ? ` (${e.kept})` : ''}`;
      });
      out.push(`| ${r.name} | ${edges} | ${e.rect.pages} = ${count(e.rect.area)} | ${cells.join(' | ')} |`);
    }
  }
  for (const edges of ['free', 'pot'] as const) out.push(`| **Σ** | ${edges} | ${count(sums[edges].rect)} | ${ANCHOR_COLUMNS.map((a) => count(sums[edges].polygon[a] ?? 0)).join(' | ')} |`);
  out.push('');
  out.push(`| set | rect splits | ${ANCHOR_COLUMNS.map((a) => `${a === 'polygon' ? 'polygon (every candidate)' : a} splits (x rect)`).join(' | ')} | deterministic |`);
  out.push(`| --- | ---: | ${ANCHOR_COLUMNS.map(() => '---:').join(' | ')} | --- |`);
  for (const r of rows) {
    if (r.cost === null) continue;
    const c = r.cost;
    out.push(`| ${r.name} | ${count(c.rect.splits)} | ${ANCHOR_COLUMNS.map((a) => `${count(c.polygon[a].splits)} (${ratio(c.polygon[a].splits, c.rect.splits)})`).join(' | ')} | ${r.deterministic === true ? 'yes' : 'NO'} |`);
  }
  return out;
}

/** The JSON document: the rows, key order fixed. */
export function anchorText(rows: readonly AnchorRow[]): string {
  return `${JSON.stringify({ spec: PACK_ANCHOR_SPEC, sets: rows }, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// the command
// ---------------------------------------------------------------------------

function parseFlags(args: readonly string[], known: readonly string[], repeatable: readonly string[]): Map<string, string[]> {
  const flags = new Map<string, string[]>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!known.includes(arg)) throw new AnchorInputError(`unknown argument ${arg}; this command takes ${known.join(', ')}`);
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) throw new AnchorInputError(`${arg} needs a value`);
    if (flags.has(arg) && !repeatable.includes(arg)) throw new AnchorInputError(`${arg} given twice`);
    flags.set(arg, [...(flags.get(arg) ?? []), value]);
    i++;
  }
  return flags;
}

function positiveInt(flag: string, value: string | undefined, fallback: number, min: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) throw new AnchorInputError(`${flag} must be an integer of at least ${min}, got ${JSON.stringify(value)}`);
  return n;
}

/** Every recipe built into `work` and measured, in name order. */
export function recipeRows(recipes: readonly Recipe[], work: string, root: string, padding: number, pageSize: number, progress: (line: string) => void = () => {}): AnchorRow[] {
  const built = buildRecipes(recipes, join(work, 'build'), root, progress);
  return built.map((b, i) => {
    if (b.exits.some((e) => e !== 0)) return refusedRow(b.name, `the build chain exited ${JSON.stringify(b.exits)}`);
    try {
      const { inputs, duplicates } = inputsOfBuild(b.out, join(work, 'lift', String(i).padStart(3, '0')));
      return anchorRow(b.name, inputs, padding, pageSize, duplicates);
    } catch (err) {
      if (err instanceof AnchorInputError) return refusedRow(b.name, err.message);
      throw err;
    }
  });
}

/** The command; returns the exit code. */
export function anchorMain(argv: readonly string[], print: (line: string) => void = console.log, warn: (line: string) => void = console.error): number {
  try {
    const flags = parseFlags(argv, ['--recipes', '--root', '--regions', '--seeds', '--padding', '--page-size', '--work', '--json'], ['--regions']);
    const one = (flag: string): string | undefined => flags.get(flag)?.[0];
    const root = resolve(one('--root') ?? TREE_ROOT);
    if (!existsSync(root) || !statSync(root).isDirectory()) throw new AnchorInputError(`--root ${root} is not a directory`);
    const padding = positiveInt('--padding', one('--padding'), DEFAULT_PADDING, 0);
    const pageSize = positiveInt('--page-size', one('--page-size'), DEFAULT_PAGE_SIZE, 1);
    const named = one('--recipes');
    const regionSets = flags.get('--regions') ?? [];
    const seedText = one('--seeds');
    const seeds =
      seedText === undefined
        ? named === undefined && regionSets.length === 0
          ? [POLYPACK_SEED, POLYPACK_GAIN_SEED]
          : []
        : seedText.split(',').map((t) => {
            const n = Number(t.trim());
            if (!Number.isInteger(n)) throw new AnchorInputError(`--seeds takes whole numbers separated by commas, got ${JSON.stringify(t)}`);
            return n;
          });
    const recipes: Recipe[] = named !== undefined ? readRecipes(named) : regionSets.length === 0 && seedText === undefined ? treeRecipes(root, warn) : [];
    const sets = regionSets.map((path) => ({ path, shapes: readRegionSet(path) }));
    const workFlag = one('--work');
    let work: string;
    if (workFlag === undefined) work = mkdtempSync(join(tmpdir(), 'rigc-pack-anchor-'));
    else {
      work = resolve(workFlag);
      if (existsSync(work) && readdirSync(work).length > 0) throw new AnchorInputError(`--work ${work} is not empty; every set runs in a fresh directory`);
      mkdirSync(work, { recursive: true });
    }
    warn(`pack_anchor: ${seeds.length} seed(s), ${sets.length} region set(s), ${recipes.length} recipe(s), padding ${padding}, page size ${pageSize}, work directory ${work}`);
    const started = performance.now();
    const rows: AnchorRow[] = [];
    for (const seed of seeds) rows.push(anchorRow(`seed ${seed}`, writePolypackInputs(join(work, 'seeds', String(seed)), polypackShapes(seed)), padding, pageSize));
    sets.forEach(({ path, shapes }, i) => rows.push(anchorRow(`regions ${i + 1} (${shapes.length} regions)`, writePolypackInputs(join(work, 'regions', String(i)), shapes), padding, pageSize)));
    if (recipes.length > 0) rows.push(...recipeRows(recipes, work, root, padding, pageSize, warn));
    for (const line of anchorTable(rows)) print(line);
    const json = one('--json');
    if (json !== undefined) writeFileSync(json, anchorText(rows));
    const refused = rows.filter((r) => r.refused !== null);
    for (const r of refused) warn(`pack_anchor: ${r.name} REFUSED — ${r.refused}`);
    warn(`pack_anchor: wall time ${((performance.now() - started) / 1000).toFixed(1)} s`);
    return refused.length > 0 ? 1 : 0;
  } catch (err) {
    if (err instanceof AnchorInputError || err instanceof HashesInputError) {
      warn(`pack_anchor: ${err.message}`);
      return 2;
    }
    throw err;
  }
}

if (import.meta.main) process.exit(anchorMain(process.argv.slice(2)));
