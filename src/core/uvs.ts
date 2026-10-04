/**
 * The draw's last input the core lacked (issue #967, step 3c of issue #380):
 * each drawn attachment's atlas PAGE and its PAGE UVs — the oracle's `uvs`
 * block, what `src/render.ts`'s `pieceOf` reads off `sequence.regions[index]`
 * and `sequence.getUVs(index)` — and `MeshAttachment.computeUVs`'s job, the
 * mapping texture substitution calls, as pure functions.
 *
 * The page layout is not a model record (`ModelAtlasRect`'s 🔸 in
 * `src/model.ts`: the page, `x`, `y` and `rotate` are the packer's
 * arrangement, not the drawing). It reaches these rules as a lookup
 * (`UvLookup`), so nothing here links the runtime or opens a file: since
 * issue #1016 from the document's own `pages` section, which `build` spells
 * from the atlas it writes (`documentPageLookup` below); for a
 * `rigc-compiled/1` document, which has none, from the atlas beside it, read
 * by rigc's own reader (`parseAtlasText` and `atlasRegionLookup` in
 * `src/atlas.ts`).
 *
 * ## How every rule below was fixed
 *
 * By loading hand-written atlases and skeletons through spine-core 4.3.13
 * (`TextureAtlas`, `AtlasAttachmentLoader`, `SkeletonJson`) and reading what
 * the loaded attachments hold — `sequence.getUVs(i)`, `sequence.regions[i]`,
 * `region.page.name` — and what `MeshAttachment.computeUVs` writes, then
 * comparing a formula over the atlas's own numbers, bit for bit (not on the
 * oracle's grid). The runtime's source was not read. Regions were random:
 * pages of power-of-two and other sizes, one to three pages, `bounds` anywhere
 * on the page, 70% trimmed (`offsets` other than `0, 0, width, height`), and
 * `rotate` spelled `0`, `90`, `180`, `270`, `true`, `false` and, for the
 * branch rules, `45`, `-90`, `360` and `450`; mesh and art UVs spelled with
 * five non-float32 decimals, some outside `[0, 1]`.
 *
 * ### The region's own numbers
 *
 * With `W, H` the page's `size`, the region's `u = x/W`, `v = y/H`, and its far
 * corner `u2 = (x + width)/W`, `v2 = (y + height)/H` — with `width` and
 * `height` exchanged at `rotate: 90` (and `true`) ONLY. 1,500 of 1,500
 * regions, as doubles; exchanged at 270 as well missed 262, never exchanged
 * 484. (That 270 is not exchanged is the runtime's, and the reason
 * `pageFootprint` in `src/atlas.ts` derives the page rectangle rather than
 * reading these two numbers.)
 *
 * ### A region attachment's four UVs
 *
 * In the corner order of its world vertices (bottom-left, upper-left,
 * upper-right, bottom-right — `./vertices.ts`): at `degrees === 90`
 * `(u2, v2) (u, v2) (u, v) (u2, v)`, at every other value — 0, 180, 270 and
 * the odd spellings alike — `(u, v2) (u, v) (u2, v) (u2, v2)`; each held as
 * float32. 1,500 of 1,500 through `Math.fround`; as doubles, 575 missed. The
 * readings rejected, on the same 1,500:
 *
 * | reading | misses |
 * | --- | ---: |
 * | 270 turned as 90 over a transposed rectangle | 262 |
 * | 90's corners the other way round, `(u, v) (u2, v) (u2, v2) (u, v2)` | 487 |
 * | 180 turned, `(u2, v) (u2, v2) (u, v2) (u, v)` | 260 |
 * | the trim inset into the UVs | 724 |
 *
 * The trim does not enter a region's UVs: it enters its corners
 * (`regionCorners` in `./vertices.ts`, through `ModelAtlasRect`).
 *
 * ### A mesh's page UVs — `MeshAttachment.computeUVs`
 *
 * From the attachment's own UVs `(s, t)` — art space, over the untrimmed
 * drawing — per `degrees`, in doubles, starting from `u = x/W`, `v = y/H`:
 *
 * | degrees | `u −=` | `v −=` | span `w, h` | `(u′, v′)` |
 * | --- | --- | --- | --- | --- |
 * | 90 | `(oh − oy − height)/W` | `(ow − ox − width)/H` | `oh/W, ow/H` | `u + t·w, v + (1 − s)·h` |
 * | 180 | `(ow − ox − width)/W` | `oy/H` | `ow/W, oh/H` | `u + (1 − s)·w, v + (1 − t)·h` |
 * | 270 | `oy/W` | `ox/H` | `oh/W, ow/H` | `u + (1 − t)·w, v + s·h` |
 * | any other | `ox/W` | `(oh − oy − height)/H` | `ow/W, oh/H` | `u + s·w, v + t·h` |
 *
 * (`ox, oy, ow, oh` the region's `offsetX, offsetY, originalWidth,
 * originalHeight`; `width, height` its `bounds` size.) The subtraction is its
 * own step: called into a plain array, the rule read 6,000 of 6,000 calls bit
 * for bit in doubles, while one fraction `(x − ox)/W` missed 936 and texels
 * first, `(x − ox + s·ow)/W`, 2,227. Into a plain array the function writes
 * these doubles — 4,000 of 4,000 calls wrote a value that is not a float32 —
 * and what an attachment HOLDS is each through `Math.fround`, because its
 * array is a `Float32Array`: 1,500 of 1,500 meshes, and `computeUVs` over the
 * attachment's region and own UVs reproduced the held array on all 1,500. The
 * rule through `Math.fround` held on 4,000 direct calls into a `Float32Array`,
 * 400 per spelling, the odd spellings taking the last row.
 *
 * ⚠️ **The mesh's own UVs are read as the doubles the text spells, not as
 * float32.** Reading them through `Math.fround` first missed 311 of 1,500
 * meshes (worst 4.8e-7, one float32 step of a UV near 1); every intermediate
 * in float32 missed 844. So `computeUvs` takes the model's `uvs` as they are.
 *
 * ### Which region, on which page
 *
 * - A region or mesh draws the atlas region named by its `path`, else its
 *   name — the oracle's `path` cell (`shownRow` in `./index.ts`). The first
 *   region of that name in the file wins (two regions named alike, the first
 *   drawn), and the name is compared as the atlas line spells it: a region
 *   line `art ` is not found as `art`, while CRLF line ends are not part of a
 *   name (`parseAtlasText` splits on them).
 * - A **sequence**'s frame `i` draws `path + (start + i)`, the number padded
 *   with zeros to `digits` (`padStart`): `start` 1 and `digits` 0 when
 *   unstated — a three-frame `x` drew `x1, x2, x3`; `start 8, digits 0` drew
 *   `x8, x9, x10`; `start 99, digits 1` `x99, x100`; `start 5, digits 4`
 *   `x0005, x0006`. The atlas's own `index:` field is not how a frame is
 *   found: regions named `seq` with `index: 1` and `2` loaded as `Region not
 *   found in atlas: seq1`. Each frame draws on its own region's page: a
 *   four-frame series over two pages drew frames 0–1 on the first and 2–3 on
 *   the second, a mesh's frames alike.
 * - The frame drawn is the one the pose shows (`./deform.ts`'s sequence rule,
 *   measured there through a region's corners), or the sequence's `setup` (0
 *   unstated) where no timeline set one.
 * - A **linked mesh** draws its OWN `path`'s region (and its own sequence's
 *   frames — a link stating one drew `l1, l2, l3` from setup frame 2 whatever
 *   its source stated; a link stating none drew its own path) over its
 *   SOURCE's UVs: a link on page `a.png` whose source sat on `b.png` drew
 *   `a.png`, and its uvs were `computeUVs` of its own region over the
 *   source's `regionUVs`.
 * - The page cell is the page's name as `parseAtlasText` trims it — the
 *   runtime's `page.name` for a page line ` p.png ` read `p.png`.
 *
 * ## What is posed, and what is left out
 *
 * Rows in the pose's draw order, one per slot showing a region, a mesh or a
 * linked mesh — the slots the `attachments` block lists, whatever their bone
 * or alpha. Which record a slot shows and the frame its series is at are the
 * ones `./deform.ts`'s `attachmentStates` computes for the same pose, from the
 * placeholders the sample's own timelines leave (`posedSlots`) and the
 * sliders' applications (`posedBoneWorld`); at setup, from the setup
 * placeholders and the sliders applied to the setup pose. That repeats the
 * walk `poseSetup` and `poseAnimations` make, because neither returns the
 * frame (issue #966 retains it in the raw entry); the gate holds the two
 * walks to one answer by comparing both against the runtime.
 *
 * A region the atlas does not have is refused by name (`CoreInputError`):
 * spine-core refuses to load the same pair. The block is left out, with the
 * reason, where what a slot shows is not posed — the slots or the draw order
 * absent — and where a linked mesh stating its own sequence is stepped by a
 * sequence timeline counted over its source's frames, a case never measured.
 *
 * ## Purity
 *
 * As the rest of the core: nothing from the Spine runtime package, nothing
 * from `src/transform.ts`, no clock, no randomness, no I/O.
 */
import { activeBones, constraintRecords, CoreInputError, shownAttachment, type CompiledDocument, type CoreAnimation } from './index.ts';
import { posedBoneWorld, posedSlots } from './animation.ts';
import { applyConstraints } from './constraints.ts';
import type { SliderApplication } from './constraints_slider.ts';
import { attachmentStates } from './deform.ts';
import type { ShownGeometry } from './vertices.ts';
import type { ModelPage, ModelPageRegion } from '../model.ts';
import { worldTransforms } from './world.ts';

/** A region as these rules read it — `AtlasRegion` in `src/atlas.ts` is one, and so is spine-core's `TextureAtlasRegion`. */
export interface UvRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  originalWidth: number;
  originalHeight: number;
  degrees: number;
}

/** A page as these rules read it: its trimmed name and its `size`. */
export interface UvPage {
  name: string;
  width: number;
  height: number;
}

/** The region an atlas draws under a name, and its page — the first of that name, as the header states; `null` when there is none. */
export type UvLookup = (name: string) => { page: UvPage; region: UvRegion } | null;

/**
 * The lookup over a document's `pages` section (issue #1016): the first region
 * of a name in file order, pages in order and regions in each page's order —
 * the order `pagesOfAtlas` in `src/model.ts` copies from the atlas, so this is
 * `atlasRegionLookup` over the same text, with no atlas read. The name is
 * compared as stored, untrimmed, as the header's *Which region* states.
 */
export function documentPageLookup(pages: readonly ModelPage[]): (name: string) => { page: UvPage; region: ModelPageRegion } | null {
  const first = new Map<string, { page: UvPage; region: ModelPageRegion }>();
  for (const page of pages) {
    const at: UvPage = { name: page.name, width: page.width, height: page.height };
    for (const region of page.regions) if (!first.has(region.name)) first.set(region.name, { page: at, region });
  }
  return (name) => first.get(name) ?? null;
}

/**
 * The readings the header's tables rejected, each a switch — what the core
 * suite's `CU` plants pass to show the gate names it. The functions below with
 * none set are the rules measured; nothing but a plant sets one.
 */
export interface UvReading {
  /** A region at 90 in the other corner order, `(u, v) (u2, v) (u2, v2) (u, v2)` — the rotation flipped. */
  rotationFlipped?: boolean;
  /** A region at 270 turned as one at 90, over a transposed rectangle; a mesh at 270 mapped by 90's `(u + t·w, v + (1 − s)·h)`. */
  turned270?: boolean;
  /** A mesh's page UVs with the trim offsets dropped (`ox = oy = 0`, the original size the kept one). */
  trimDropped?: boolean;
  /** A mesh's own UVs read through `Math.fround` first. */
  artAsFloat32?: boolean;
}

/** A region attachment's four page UVs as the runtime holds them — the header's rule, in the world corners' order. */
export function regionPageUvs(region: UvRegion, page: UvPage, reading: UvReading = {}): number[] {
  const turned = region.degrees === 90 || (reading.turned270 === true && region.degrees === 270);
  const u = region.x / page.width;
  const v = region.y / page.height;
  const u2 = (region.x + (turned ? region.height : region.width)) / page.width;
  const v2 = (region.y + (turned ? region.width : region.height)) / page.height;
  let out: number[];
  if (turned) out = reading.rotationFlipped === true ? [u, v, u2, v, u2, v2, u, v2] : [u2, v2, u, v2, u, v, u2, v];
  else out = [u, v2, u, v, u2, v, u2, v2];
  return out.map(Math.fround);
}

/**
 * `MeshAttachment.computeUVs`: art-space UVs over the untrimmed drawing mapped
 * onto `region` of `page`, in doubles — the header's table. What texture
 * substitution writes into its plain array; an attachment holds each value
 * through `Math.fround` (`meshPageUvs`).
 */
export function computeUvs(region: UvRegion, page: UvPage, art: readonly number[], reading: UvReading = {}): number[] {
  const dropped = reading.trimDropped === true;
  const ox = dropped ? 0 : region.offsetX;
  const oy = dropped ? 0 : region.offsetY;
  const ow = dropped ? region.width : region.originalWidth;
  const oh = dropped ? region.height : region.originalHeight;
  const W = page.width;
  const H = page.height;
  const s = reading.artAsFloat32 === true ? art.map(Math.fround) : art;
  let u = region.x / W;
  let v = region.y / H;
  const out: number[] = [];
  switch (region.degrees) {
    case 90: {
      u -= (oh - oy - region.height) / W;
      v -= (ow - ox - region.width) / H;
      const w = oh / W;
      const h = ow / H;
      for (let i = 0; i + 1 < s.length; i += 2) out.push(u + s[i + 1] * w, v + (1 - s[i]) * h);
      return out;
    }
    case 180: {
      u -= (ow - ox - region.width) / W;
      v -= oy / H;
      const w = ow / W;
      const h = oh / H;
      for (let i = 0; i + 1 < s.length; i += 2) out.push(u + (1 - s[i]) * w, v + (1 - s[i + 1]) * h);
      return out;
    }
    case 270: {
      u -= oy / W;
      v -= ox / H;
      const w = oh / W;
      const h = ow / H;
      if (reading.turned270 === true) for (let i = 0; i + 1 < s.length; i += 2) out.push(u + s[i + 1] * w, v + (1 - s[i]) * h);
      else for (let i = 0; i + 1 < s.length; i += 2) out.push(u + (1 - s[i + 1]) * w, v + s[i] * h);
      return out;
    }
    default: {
      u -= ox / W;
      v -= (oh - oy - region.height) / H;
      const w = ow / W;
      const h = oh / H;
      for (let i = 0; i + 1 < s.length; i += 2) out.push(u + s[i] * w, v + s[i + 1] * h);
      return out;
    }
  }
}

/** A mesh's page UVs as the attachment holds them: `computeUvs`, each through `Math.fround`. */
export function meshPageUvs(region: UvRegion, page: UvPage, art: readonly number[], reading: UvReading = {}): number[] {
  return computeUvs(region, page, art, reading).map(Math.fround);
}

/** A record's series, as the parser reads the four fields: `start` 1, `digits` 0 and `setup` 0 when unstated. */
export interface UvSequence {
  count: number;
  start: number;
  digits: number;
  setup: number;
}

/** Every record's series, by `skin/slot/placeholder` — `readUvSequences`. */
export type UvSequences = ReadonlyMap<string, UvSequence>;

/** The region a series' frame draws: `path + (start + frame)`, padded with zeros to `digits` — the header's rule. */
export function frameRegionName(path: string, sequence: UvSequence, frame: number): string {
  return path + String(sequence.start + frame).padStart(sequence.digits, '0');
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const whole = (v: unknown, min: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min;

/**
 * Every record's `sequence` in a `rigc-compiled/1` document, as the parser
 * reads it — `readModel` keeps a series' count and nothing else of it, and a
 * frame's region name needs `start` and `digits`. Refuses, naming the path, a
 * field that is not a whole number (`count` of at least 1, the others of at
 * least 0) or a `setup` that is not one of the frames.
 */
export function readUvSequences(document: unknown): UvSequences {
  const out = new Map<string, UvSequence>();
  const problems: string[] = [];
  const skins = isRecord(document) && Array.isArray(document.skins) ? document.skins : [];
  skins.forEach((skin: unknown, k: number) => {
    if (!isRecord(skin) || typeof skin.name !== 'string' || !isRecord(skin.attachments)) return;
    for (const [slot, table] of Object.entries(skin.attachments)) {
      if (!isRecord(table)) continue;
      for (const [placeholder, record] of Object.entries(table)) {
        if (!isRecord(record) || record.sequence === undefined) continue;
        const where = `skins[${k}] "${skin.name}".attachments["${slot}"]["${placeholder}"].sequence`;
        const seq = record.sequence;
        if (!isRecord(seq)) {
          problems.push(`${where} is not an object`);
          continue;
        }
        const before = problems.length;
        if (!whole(seq.count, 1)) problems.push(`${where}: count is ${JSON.stringify(seq.count) ?? 'absent'}, not a whole number of at least 1`);
        for (const key of ['start', 'digits', 'setup'] as const) if (seq[key] !== undefined && !whole(seq[key], 0)) problems.push(`${where}: ${key} is ${JSON.stringify(seq[key])}, not a whole number of at least 0`);
        if (problems.length !== before) continue;
        const count = seq.count as number;
        const setup = (seq.setup as number | undefined) ?? 0;
        if (setup >= count) {
          problems.push(`${where}: setup is ${setup}, and a ${count}-frame series has frames 0 to ${count - 1}`);
          continue;
        }
        out.set(`${skin.name}/${slot}/${placeholder}`, { count, start: (seq.start as number | undefined) ?? 1, digits: (seq.digits as number | undefined) ?? 0, setup });
      }
    }
  });
  if (problems.length > 0) throw new CoreInputError(`the model document's sequences: ${problems.join('; ')}`);
  return out;
}

/** What `poseUvs` reads besides the pose: the atlas lookup, the document's series, and a plant's reading. */
export interface UvSource {
  lookup: UvLookup;
  sequences: UvSequences;
  reading?: UvReading;
}

/** One row of `uvs`: `[slot, attachment, page, uvs]`, the oracle's row. */
export type CoreUvRow = [string, string, string, Array<number | null>];

/**
 * Each slot's shown record and its series' frame at the setup pose — what
 * `poseSetup` hands `poseGeometry`: the setup placeholders, and the sliders
 * applied to the setup bones (`applyConstraints`), each slider's attachment,
 * deform and sequence keys applied in order by `attachmentStates`.
 */
export function shownAtSetup(doc: CompiledDocument): { shown: ShownGeometry[]; why: string[] } {
  const active = activeBones(doc);
  const applied: SliderApplication[] = [];
  applyConstraints(doc.bones, worldTransforms(doc.bones, active), active, constraintRecords(doc), null, applied);
  const placeholders = new Map(doc.slots.map((s) => [s.name, s.setup]));
  return attachmentStates(doc, shownAttachment, placeholders, null, applied);
}

/**
 * Each slot's shown record and its series' frame at time `t` of `anim` — what
 * `poseAnimations` hands `poseGeometry` under `--physics none`: the sliders
 * `posedBoneWorld` applies at `t`, the placeholders the sample's own
 * timelines leave (`posedSlots`), then `attachmentStates`.
 */
export function shownAtSample(doc: CompiledDocument, anim: CoreAnimation, t: number): { shown: ShownGeometry[]; why: string[] } {
  const sliders: SliderApplication[] = [];
  // The bones are posed for what the sliders apply, and only a slider constraint applies one (`applySlider`): with none, the list stays empty and the pose would be read for nothing (issue #1134).
  if (doc.constraints.some((c) => c.kind === 'slider')) posedBoneWorld(doc, anim.timelines, t, {}, anim.constraints, sliders);
  const placeholders = new Map<string, string | null>();
  posedSlots(doc, anim.timelines, t, {}, sliders, placeholders);
  return attachmentStates(doc, shownAttachment, placeholders, { timelines: anim.timelines, t }, sliders);
}

/** One drawn attachment resolved to its atlas region: what `poseUvs` maps, and what a census reads. */
export interface DrawnRegion {
  slot: string;
  /** The attachment's name — the row's second cell. */
  name: string;
  kind: 'region' | 'mesh' | 'linkedmesh';
  /** The region name drawn: the path, with the frame's number for a series. */
  region: string;
  /** The series' frame drawn, or `null` for a record with no series. */
  frame: number | null;
  found: { page: UvPage; region: UvRegion };
  /** The attachment's own UVs for a mesh — a linked mesh's source's — or `null` for a region. */
  art: readonly number[] | null;
}

/**
 * Every slot of `order` showing a region, a mesh or a linked mesh, resolved to
 * the atlas region it draws — the header's *Which region, on which page* — or
 * why the pose is not posed. A region the atlas lacks is refused by name.
 */
export function drawnRegions(doc: CompiledDocument, shown: readonly ShownGeometry[], order: readonly string[], source: UvSource): { drawn: DrawnRegion[] | null; why: string | null } {
  const bySlot = new Map(shown.map((s) => [s.slot, s]));
  const drawn: DrawnRegion[] = [];
  const unmeasured: string[] = [];
  for (const slot of order) {
    const s = bySlot.get(slot);
    if (s === undefined) continue;
    const g = s.geometry;
    if (g.kind !== 'region' && g.kind !== 'mesh' && g.kind !== 'linkedmesh') continue;
    const record = doc.skins.find((k) => k.name === s.skin)?.attachments[s.slot]?.[s.placeholder];
    if (record === undefined) throw new CoreInputError(`slot "${s.slot}": skin "${s.skin}" files no record under placeholder "${s.placeholder}" (readModel refuses it first)`);
    const path = record.path ?? s.name;
    const sequence = source.sequences.get(`${s.skin}/${s.slot}/${s.placeholder}`);
    if (g.kind === 'linkedmesh' && sequence !== undefined && s.frame !== undefined) {
      const sourceCount = doc.skins.find((k) => k.name === g.skin)?.attachments[g.slot]?.[g.source]?.sequenceCount;
      if (sourceCount !== sequence.count) {
        unmeasured.push(`slot "${s.slot}" shows linked mesh "${s.name}", whose own ${sequence.count}-frame series a sequence timeline steps over its source's ${sourceCount ?? 'unstated'} frame(s)`);
        continue;
      }
    }
    const frame = sequence === undefined ? null : (s.frame ?? sequence.setup);
    const name = sequence === undefined || frame === null ? path : frameRegionName(path, sequence, frame);
    const found = source.lookup(name);
    if (found === null) {
      throw new CoreInputError(
        `slot "${s.slot}" shows "${s.name}", which draws atlas region "${name}"${frame === null ? '' : ` (frame ${frame} of its series over "${path}")`}, and the atlas has no region of that name — spine-core refuses to load the pair ("Region not found in atlas")`,
      );
    }
    let art: readonly number[] | null = null;
    if (g.kind === 'mesh') art = g.uvs;
    else if (g.kind === 'linkedmesh') {
      // A linked mesh draws its source's UVs over its own region (the header's *Which region*).
      const from = doc.skins.find((k) => k.name === g.skin)?.attachments[g.slot]?.[g.source]?.geometry;
      if (from?.kind !== 'mesh') throw new CoreInputError(`slot "${s.slot}": the linked mesh's source "${g.source}" carries no uvs (readModel refuses it first)`);
      art = from.uvs;
    }
    drawn.push({ slot: s.slot, name: s.name, kind: g.kind, region: name, frame, found, art });
  }
  if (unmeasured.length > 0) return { drawn: null, why: `${unmeasured.join('; ')} — which of the two counts the runtime steps it over was not measured` };
  return { drawn, why: null };
}

/**
 * The `uvs` rows of one pose: `shown` (from `shownAtSetup`/`shownAtSample`) in
 * `order`, the pose's draw order, every number through `round` (the oracle's,
 * `gridRound`) — or why the block is left out. A region the atlas lacks is
 * refused by name.
 */
export function poseUvs(doc: CompiledDocument, shown: readonly ShownGeometry[], order: readonly string[], source: UvSource, round: (v: number) => number | null): { rows: CoreUvRow[] | null; why: string | null } {
  const reading = source.reading ?? {};
  const { drawn, why } = drawnRegions(doc, shown, order, source);
  if (drawn === null) return { rows: null, why };
  const rows = drawn.map((d): CoreUvRow => {
    const uvs = d.art === null ? regionPageUvs(d.found.region, d.found.page, reading) : meshPageUvs(d.found.region, d.found.page, d.art, reading);
    return [d.slot, d.name, d.found.page.name, uvs.map(round)];
  });
  return { rows, why: null };
}

/** Why a document's `uvs` blocks are not posed under the stepped phase, or null: a slider keying a slot's attachment or a series — its time is read off bones the step moves, and this walk poses them unstepped. */
export function steppedUvsWhy(doc: CompiledDocument): string | null {
  const keyed = doc.constraints.flatMap((c) => {
    if (c.kind !== 'slider') return [];
    const anim = doc.animations.find((a) => a.name === c.animation);
    if (anim === undefined) return [];
    const switches = anim.timelines.slots.some((sl) => sl.timelines.some((tl) => tl.kind === 'attachment'));
    const frames = anim.timelines.attachments.some((a) => a.sequence !== null);
    return switches || frames ? [`slider "${c.name}" applies animation "${c.animation}", which keys ${switches ? 'a slot\'s attachment' : 'a sequence'}`] : [];
  });
  return keyed.length === 0 ? null : `${keyed.join('; ')} — under --physics step its time is read off stepped bones, and the uvs walk poses the sliders unstepped`;
}
