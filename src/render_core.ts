/**
 * The render's second poser (issue #968, step 3d of issue #380): the posing
 * seam of `src/render.ts` (`Poser` / `Posed`) implemented over rigc's own
 * core — the compiled model document (`skeleton.model.json`) posed by
 * `src/core/`, and the atlas the render samples read by rigc's own reader
 * (`src/atlas.ts`). Nothing here links spine-core, and nothing here is reached
 * from `src/core/`: the core stays pure, and this module is the adapter from
 * its raw entry to the renderer's shapes.
 *
 * ⭐ Why a module of its own rather than a second block in `src/render.ts`.
 * `render.ts` links spine-core (the atlas pages, texture substitution and
 * `spinePoser`), so a core poser written there would share an import list
 * with the runtime it replaces — and "the core poser imports nothing from
 * spine-core" could then only be said, not read off the file. Here it can be:
 * the value imports below are the core, the atlas reader and nothing else, and
 * the one thing taken from `render.ts` is its types (erased at run time). The
 * modules that link spine-core stay three (`CUR07`).
 *
 * ## What each part of a pose is read from
 *
 * - **The walk** is `poseRawAnimation` (`src/core/raw.ts`, issue #966) with
 *   `count` steps of `1/fps` and the reset taken at the animation
 *   (`'animation'`): pose `i` is the running sum of `i` steps, applied at
 *   `min(sum, duration)`, physics reset at pose 0 and stepped by `1/fps` after
 *   — the recipe `spinePoser` runs, measured bit-exact against it on every
 *   frame of the nineteen tree rows by the core suite's `CR03`. The setup pose
 *   is `poseRawSetup`.
 * - **Vertices, triangles, bones, slot colours, draw order** are the raw
 *   pose's, unchanged: the same doubles `computeWorldVertices`,
 *   `getWorldRotationX` and the slot pose hold (`CR03`).
 * - **The page and page UVs** are `./core/uvs.ts`'s (issue #967): which
 *   region a drawn attachment samples (`drawnRegions` over the pose's `shown`
 *   records and draw order), a region's four UVs (`regionPageUvs`) and a
 *   mesh's (`meshPageUvs`), each held to `sequence.getUVs(index)` at
 *   tolerance 0 on every corpus by `core_gate`'s `uvs` blocks.
 * - **The tint** is the slot's light colour times the attachment's colour,
 *   channel by channel, as `src/render.ts`'s `tintOf` forms it; the dark
 *   colour is the slot's, absent where the slot carries none.
 * - **The clip.** Which slot a clip covers is the core's walk
 *   (`./core/clipping.ts`, issue #964), whose rows the raw pose carries with
 *   the attachment's LOCAL UVs. The render samples PAGE UVs, so each clipped
 *   row is cut again with `clipThrough` over the page UVs — the UV rule is
 *   linear in the corner UVs, and the vertices and triangles depend on
 *   positions alone, so the second cut must return the core's vertices,
 *   triangles and verdict to the bit, and a disagreement is thrown as a
 *   defect here rather than drawn. The polygon is the clip slot's world
 *   polygon from the pose's `clips` rows, and the walk that pairs a slot with
 *   the clip over it is the core's rule restated: a clip whose bone is active
 *   starts when none is active, and ends after its end slot is walked.
 * - **A concave or inverse clip** is cut through the core's own convex
 *   decomposition (`clipThrough`, issue #964), and each drawn triangle carries
 *   its source triangle (`clipSourceOf`, `Mesh.source`): the rasteriser
 *   samples it at the source triangle's affine UV, so the pixels are the
 *   spine-core render's whatever pieces either clipper cut (`RC08`). A clip
 *   that is not simple is refused by the raw entry, naming the slot
 *   (`CoreInputError`); the render then falls back to `spinePoser` for that
 *   input and says so (`throughPoser` in `src/render.ts`).
 *
 * ## The skin
 *
 * `--skin <name>` poses `underSkin(doc, name)` — the named skin's record,
 * else the default skin's; the named skin's bones and constraints —
 * measured against spine-core's `setSkin(name)` by the per-skin gate
 * (issue #932). No `--skin` is spine-core's "no skin set", which resolves
 * every slot through the default skin alone: posed as `underSkin(doc,
 * 'default')`, the reading `CR03` measured bit-exact against it on every tree
 * row. ⚠️ That equivalence is measured only where the default skin names no
 * skin-required bone and no constraint — which of the two readings activates
 * such a bone with no skin set was not measured — so a document whose default
 * skin names one is REFUSED by the core poser, by name, and renders through
 * spine-core; so is a document with skins and no default one.
 */
import type {
  AttachmentPose,
  AttachmentRest,
  BoneSnapshot,
  DrawOptions,
  Piece,
  PieceTexture,
  PoseOptions,
  Posed,
  Poser,
  SlotSubset,
} from './render.ts';
import { atlasRegionLookup, parseAtlasText, type AtlasRegion } from './atlas.ts';
import { spineFileSha256 } from './model.ts';
import { clipThrough, type ClipShape, type ShapeClipper } from './core/clipping.ts';
import { CoreInputError, readModel, sourceOfDoc, underSkin, type CompiledDocument, type CoreSlotRow } from './core/index.ts';
import { poseRawAnimation, poseRawSetup, type RawDrawn, type RawPose } from './core/raw.ts';
import { CORE_ALL_SKINS, CORE_DEFAULT_SKIN, lookupSkins } from './core/skins.ts';
import { drawnRegions, meshPageUvs, readUvSequences, regionPageUvs, type DrawnRegion, type UvSource } from './core/uvs.ts';
import { regionCorners, worldVertices } from './core/vertices.ts';
import type { CoreWorld } from './core/world.ts';

// ---------------------------------------------------------------------------
// the slot subset, spelled once for both posers
// ---------------------------------------------------------------------------

/**
 * Why a slot subset cannot be drawn — a `--slot`/`--hide` naming no slot, a slot
 * whose art only another skin carries, or both flags at once (issue #835).
 *
 * A class of its own so `cli.ts` can turn it into a usage refusal (exit 2,
 * nothing written) without reading a message to decide what kind it is. It
 * lives here, and `src/render.ts` re-exports it, so both posers throw the one
 * class.
 */
export class SlotSubsetError extends Error {}

/** The flag spelling each half of a subset is refused under — the UI's, since that is who reads it. */
const SUBSET_FLAG = { slots: '--slot', hidden: '--hide' } as const;

/** What `subsetOver` reads off a skeleton: its slots in draw order, which skins carry a slot's art, and its default skin. */
export interface SubsetRoster {
  /** Every declared slot, in the setup draw order. */
  declared: readonly string[];
  /** The skins, in the skeleton's order, holding at least one attachment for `slot`. */
  carriers(slot: string): string[];
  /** The default skin's name, or `null` when there is none. */
  defaultSkin: string | null;
}

/**
 * `slotSubsetOf`'s rule over a roster rather than a parsed Spine skeleton, so
 * the spine-core poser and the core poser refuse a subset in the same words —
 * see `slotSubsetOf` in `src/render.ts` for the rule and its three refusals.
 */
export function subsetOver(
  roster: SubsetRoster,
  opts: Pick<PoseOptions, 'slots' | 'hidden'> | undefined,
  skin: string | undefined,
): SlotSubset | undefined {
  if (opts?.slots !== undefined && opts.hidden !== undefined) {
    throw new SlotSubsetError(
      '--slot and --hide are one statement two ways; name the slots to draw or the slots to hide, not both',
    );
  }
  const mode = opts?.slots !== undefined ? 'slots' : opts?.hidden !== undefined ? 'hidden' : undefined;
  if (mode === undefined) return undefined;
  const asked = (mode === 'slots' ? opts?.slots : opts?.hidden) ?? [];
  const flag = SUBSET_FLAG[mode];
  const declared = [...roster.declared];

  const unknown = asked.filter((name) => !declared.includes(name));
  if (unknown.length > 0 || asked.length === 0) {
    const named =
      unknown.length === 0
        ? 'was given no slot name'
        : `${unknown.map((name) => JSON.stringify(name)).join(', ')} ${unknown.length === 1 ? 'names' : 'name'} no slot`;
    throw new SlotSubsetError(
      `${flag} ${named}; this skeleton declares, in draw order: ${declared.join(', ') || 'none'} (${declared.length})`,
    );
  }

  const resolving = new Set([skin ?? null, roster.defaultSkin]);
  const underThisPose =
    skin === undefined ? 'under no skin (the default skin alone)' : `under skin ${JSON.stringify(skin)}`;
  for (const name of asked) {
    const carriers = roster.carriers(name);
    if (carriers.length === 0 || carriers.some((s) => resolving.has(s))) continue;
    const skins = carriers.map((s) => JSON.stringify(s));
    throw new SlotSubsetError(
      `${flag} ${JSON.stringify(name)} draws nothing ${underThisPose}: its attachments are declared only under ` +
        `${skins.length === 1 ? 'skin' : 'skins'} ${skins.join(', ')} — pass --skin ${
          skins.length === 1 ? skins[0] : 'with one of them'
        }`,
    );
  }
  const chosen = new Set(asked);
  return { mode, names: declared.filter((name) => chosen.has(name)) };
}

// ---------------------------------------------------------------------------
// a bone the posed skin leaves inactive, spelled once for both posers
// ---------------------------------------------------------------------------

/**
 * The snapshot of a bone the posed skin leaves UNPOSED — inactive itself (a
 * skin-required bone the skin does not name) or below an inactive bone: the
 * zero transform, every number `0` (issue #968).
 *
 * ⚠️ "Below an inactive bone" is the half the runtime's flag does not say. A
 * bone that is not skin-required reads `active` true under an inactive parent
 * (measured: `arm` skin-required and unnamed, its child `hand` not
 * skin-required — spine-core reads `arm=false hand=true`), yet its matrix is
 * never computed: it stays the zero matrix over every frame unless a
 * constraint writes into it. So the predicate is the bone's own flag and every
 * ancestor's (`unposedBones`).
 *
 * ⭐ Why the seam defines it rather than relaying either runtime. An inactive
 * bone is not posed: neither poser computes its world transform, so its
 * matrix holds whatever a constraint listing it happened to write into a zero
 * matrix. Measured on hand-written rigs under no skin (a skin-required `arm`
 * and its child `hand`, both inactive): a one-bone ik on `hand` left
 * spine-core's matrix at zeros and the core's at NaN; a two-bone ik on `arm,
 * hand` left spine-core's `b` and `d` at `-0` — so `getWorldRotationY` read
 * −179.99999734 (`atan2(−0, …)` at the runtime's pi) — and the core's at `+0`,
 * reading 0; a world transform constraint wrote `worldX` 19.99999979 and a
 * `-0` into both alike. The private corpus met the second case on two rigs:
 * 508 rotation readings of 179.99999734 against 0, every pixel identical. None
 * of those numbers is a pose — a rotation of ±180 is the sign of a zero, and
 * the core's NaN the same degenerate arithmetic taken another way — so the
 * snapshot says what is true of the bone, that it is not posed, in both
 * posers alike. The drawn pieces are untouched: they are posed vertices, not
 * snapshots.
 */
export function inactiveBoneSnapshot(name: string): BoneSnapshot {
  return { name, worldX: 0, worldY: 0, a: 0, b: 0, c: 0, d: 0, rotationX: 0, rotationY: 0, scaleX: 0, scaleY: 0 };
}

/** The bones the posed skin leaves unposed — inactive, or below an inactive bone — from each bone's parent and flag, parents first. */
export function unposedBones(bones: ReadonlyArray<{ name: string; parent: string | null; active: boolean }>): Set<string> {
  const out = new Set<string>();
  for (const b of bones) if (!b.active || (b.parent !== null && out.has(b.parent))) out.add(b.name);
  return out;
}

// ---------------------------------------------------------------------------
// a clipped piece's source triangles, spelled once for both posers
// ---------------------------------------------------------------------------

/**
 * `Mesh.source` of a clipped piece (issue #964): for each drawn triangle, in
 * order, its source triangle's world corners and page UVs — and, with
 * `artUvs`, their original-art UVs — six numbers each, read off the UNCLIPPED
 * piece's own arrays. `sources[i]` is the source triangle of drawn triangle `i`
 * (an index into `triangles` by threes). The rasteriser samples a drawn
 * triangle at that source triangle's affine map, so the pixels do not depend on
 * which convex pieces a clipper cut.
 */
export function clipSourceOf(
  world: ArrayLike<number>,
  uvs: ArrayLike<number>,
  triangles: ArrayLike<number>,
  sources: readonly number[],
  artUvs?: ArrayLike<number>,
): { world: number[]; uvs: number[]; artUvs: number[] | undefined } {
  const w: number[] = [];
  const u: number[] = [];
  const a: number[] | undefined = artUvs === undefined ? undefined : [];
  for (const t of sources) {
    for (let k = 0; k < 3; k++) {
      const i = triangles[3 * t + k];
      w.push(world[2 * i], world[2 * i + 1]);
      u.push(uvs[2 * i], uvs[2 * i + 1]);
      if (a !== undefined && artUvs !== undefined) a.push(artUvs[2 * i], artUvs[2 * i + 1]);
    }
  }
  return { world: w, uvs: u, artUvs: a };
}

// ---------------------------------------------------------------------------
// the core poser
// ---------------------------------------------------------------------------

/** The runtime's own triangulation of a region's quad — `src/render.ts`'s `QUAD_TRIANGLES`. */
const QUAD_TRIANGLES: readonly number[] = [0, 1, 2, 2, 3, 0];

/** Everything a core pose reads besides the pose: the document under one skin, and the atlas. */
interface CoreInput {
  doc: CompiledDocument;
  source: UvSource;
  /** The atlas region a name draws, as rigc's reader holds it — what an original-art UV reads its trim from. */
  region: (name: string) => AtlasRegion | null;
}

/**
 * The document posed with no skin set — spine-core's initial state, every slot
 * resolved through the default skin alone — or refused by name where that
 * equivalence was not measured (the header's *The skin*).
 */
function noSkinView(doc: CompiledDocument): CompiledDocument {
  if (doc.skins.length === 0) return underSkin(doc, CORE_ALL_SKINS);
  const fallback = doc.skins.find((k) => k.name === CORE_DEFAULT_SKIN);
  if (fallback === undefined) {
    throw new CoreInputError(
      `no skin was set, and this document declares skins [${doc.skins.map((k) => k.name).join(', ')}] and no "${CORE_DEFAULT_SKIN}" one — ` +
        'what spine-core shows with no skin set over such a document was not measured',
    );
  }
  const constraints = Object.entries(fallback.constraints).flatMap(([kind, names]) => names.map((n) => `${kind} "${n}"`));
  if (fallback.bones.length > 0 || constraints.length > 0) {
    throw new CoreInputError(
      `no skin was set, and the "${CORE_DEFAULT_SKIN}" skin names ${[...fallback.bones.map((b) => `bone "${b}"`), ...constraints].join(', ')} — ` +
        'whether spine-core activates what the default skin names when no skin is set was not measured, so the core does not pose it',
    );
  }
  return underSkin(doc, CORE_DEFAULT_SKIN);
}

/** A slot row's number, which the raw entry writes as a double — `null` only for a value that is not finite. */
function channel(value: number | null, slot: string): number {
  if (value === null) throw new CoreInputError(`slot "${slot}": the raw pose computed a colour channel that is not finite`);
  return value;
}

/** The world transforms of a raw pose's bones, by name — what the rest table poses through. */
function worldOf(pose: RawPose): Map<string, CoreWorld> {
  return new Map(pose.bones.map((b) => [b.name, { a: b.a, b: b.b, c: b.c, d: b.d, worldX: b.worldX, worldY: b.worldY }]));
}

/** `regionKey` in `src/render.ts`: the trimmed name and the sequence index — the key a substitution matches on. */
function regionKey(region: AtlasRegion): string {
  return `${region.name.trim()}#${region.index}`;
}

/** `artUvsOf` in `src/render.ts`, over rigc's atlas reader: a mesh's own UVs, a region's kept rectangle in the drawing's space. */
function artUvsOf(drawn: RawDrawn, region: AtlasRegion): PieceTexture | undefined {
  if (drawn.kind === 'mesh') return { region: regionKey(region), artUvs: [...drawn.uvs] };
  if (region.degrees !== 0) return undefined;
  const ow = region.originalWidth;
  const oh = region.originalHeight;
  if (!(ow > 0) || !(oh > 0)) return undefined;
  const s0 = region.offsetX / ow;
  const s1 = (region.offsetX + region.width) / ow;
  const tBottom = 1 - region.offsetY / oh;
  const tTop = 1 - (region.offsetY + region.height) / oh;
  return { region: regionKey(region), artUvs: [s0, tBottom, s0, tTop, s1, tTop, s1, tBottom] };
}

/**
 * The clip polygon over each slot of the draw order, where a clip covers it —
 * the core's walk (`poseClipped` in `./core/clipping.ts`) restated to pair a
 * slot with its polygon; `clippedPieces` holds its answer to the core's own
 * rows.
 */
function clipCover(pose: RawPose, active: ReadonlySet<string>): Map<string, ClipShape> {
  const polygons = new Map(pose.clips.map((c) => [c[0], { end: c[2], polygon: c[3] }]));
  const kinds = new Map(pose.shown.map((s) => [s.slot, s]));
  const cover = new Map<string, ClipShape>();
  let current: { end: string | null; shape: ClipShape } | null = null;
  for (const slot of pose.drawOrder) {
    const shown = kinds.get(slot);
    const g = shown?.geometry;
    const clip = g?.kind === 'clipping' ? polygons.get(slot) : undefined;
    if (shown !== undefined && g?.kind === 'clipping' && clip !== undefined) {
      if (current !== null && current.end === slot) current = null;
      if (active.has(shown.bone) && current === null) current = { end: clip.end, shape: { polygon: clip.polygon, inverse: g.inverse, convex: g.convex } };
      continue;
    }
    if (current !== null) cover.set(slot, current.shape);
    if (current !== null && current.end === slot) current = null;
  }
  return cover;
}

/** One posed moment of the core, read through the seam's `Posed`. */
function corePosed(input: CoreInput, pose: RawPose, through: ShapeClipper): Posed {
  const slotRows = new Map<string, CoreSlotRow>(pose.slots.map((row) => [row[0], row]));
  let regions: Map<string, DrawnRegion> | null = null;
  const regionsOf = (): Map<string, DrawnRegion> => {
    if (regions !== null) return regions;
    const { drawn, why } = drawnRegions(input.doc, pose.shown, pose.drawOrder, input.source);
    if (drawn === null) throw new CoreInputError(`the page UVs are not posed: ${why}`);
    regions = new Map(drawn.map((d) => [d.slot, d]));
    return regions;
  };
  const tintOf = (d: RawDrawn): [number, number, number, number] => {
    const row = slotRows.get(d.slot);
    if (row === undefined) throw new CoreInputError(`slot "${d.slot}" drew and has no slot row`);
    return [
      channel(row[2], d.slot) * d.colour[0],
      channel(row[3], d.slot) * d.colour[1],
      channel(row[4], d.slot) * d.colour[2],
      channel(row[5], d.slot) * d.colour[3],
    ];
  };
  const darkOf = (d: RawDrawn): [number, number, number] | undefined => {
    const dark = slotRows.get(d.slot)?.[6] ?? null;
    return dark === null ? undefined : [channel(dark[0], d.slot), channel(dark[1], d.slot), channel(dark[2], d.slot)];
  };
  return {
    pieces: (draw: DrawOptions): Piece[] => pieces(input, pose, draw, regionsOf(), tintOf, darkOf, through),
    bones: (): BoneSnapshot[] => {
      const unposed = unposedBones(pose.bones);
      return pose.bones.map((b) => !unposed.has(b.name) ? ({
        name: b.name,
        worldX: b.worldX,
        worldY: b.worldY,
        a: b.a,
        b: b.b,
        c: b.c,
        d: b.d,
        rotationX: b.rotationX,
        rotationY: b.rotationY,
        scaleX: b.scaleX,
        scaleY: b.scaleY,
      }) : inactiveBoneSnapshot(b.name));
    },
    attachments: (): AttachmentPose[] =>
      pose.drawn.map((d) => ({ slot: d.slot, attachment: d.attachment, vertices: [...d.vertices], color: tintOf(d) })),
  };
}

/** The drawables of one core pose, in draw order — `drawPieces` in `src/render.ts`, read off the raw pose. */
function pieces(
  input: CoreInput,
  pose: RawPose,
  draw: DrawOptions,
  regions: Map<string, DrawnRegion>,
  tintOf: (d: RawDrawn) => [number, number, number, number],
  darkOf: (d: RawDrawn) => [number, number, number] | undefined,
  through: ShapeClipper,
): Piece[] {
  const named = draw.subset === undefined ? undefined : new Set(draw.subset.names);
  const cover = draw.unclipped ? new Map<string, ClipShape>() : clipCover(pose, new Set(pose.bones.filter((b) => b.active).map((b) => b.name)));
  const rows = new Map(pose.clipped.map((row) => [row[0], row]));
  if (!draw.unclipped) {
    const walked = [...cover.keys()].filter((slot) => pose.drawn.some((d) => d.slot === slot)).join();
    const cored = pose.clipped.map((row) => row[0]).join();
    if (walked !== cored) throw new Error(`the clip cover [${walked}] is not the core's clipped roster [${cored}] — the two walks disagree`);
  }
  const out: Piece[] = [];
  for (const d of pose.drawn) {
    const drawn = draw.subset === undefined || named === undefined || named.has(d.slot) === (draw.subset.mode === 'slots');
    if (!drawn) continue;
    const found = regions.get(d.slot);
    if (found === undefined) throw new CoreInputError(`slot "${d.slot}" drew "${d.attachment}", and no atlas region was resolved for it`);
    const uvs = found.art === null ? regionPageUvs(found.found.region, found.found.page) : meshPageUvs(found.found.region, found.found.page, found.art);
    const atlasRegion = draw.texture ? input.region(found.region) : null;
    if (draw.texture && atlasRegion === null) throw new CoreInputError(`slot "${d.slot}": atlas region "${found.region}" is not in the atlas`);
    const texture = atlasRegion === null ? undefined : artUvsOf(d, atlasRegion);
    const common = { tint: tintOf(d), dark: darkOf(d), slot: d.slot, page: found.found.page.name };
    const world = [...d.vertices];
    const piece: Piece =
      d.kind === 'mesh'
        ? { kind: 'mesh', ...common, texture, world, uvs, triangles: [...d.triangles] }
        : { kind: 'region', ...common, texture, world, uvs };
    const shape = cover.get(d.slot);
    out.push(shape === undefined ? piece : clippedPiece(piece, d, shape, uvs, rows.get(d.slot), through));
  }
  return out;
}

/**
 * `piece` cut by the clip over it, over the page UVs (the header's *The clip*),
 * or `piece` itself when the clipper cut nothing — `clippedPiece` in
 * `src/render.ts`. The cut's vertices, triangles and verdict are held to the
 * core's own row for the slot.
 */
function clippedPiece(piece: Piece, d: RawDrawn, shape: ClipShape, uvs: number[], row: RawPose['clipped'][number] | undefined, through: ShapeClipper): Piece {
  const cut = through(shape, d.vertices, d.triangles, uvs);
  if (cut === null) throw new Error(`slot "${d.slot}": the clip over it is one the core does not draw, and the raw pose carried it — a defect in src/render_core.ts`);
  if (row === undefined || (row[2] === 1) !== cut.clipped || row[3].join() !== cut.vertices.join() || row[5].join() !== cut.triangles.join()) {
    throw new Error(`slot "${d.slot}": the clip over the page UVs cut other geometry than the core's clipped row — a defect in src/render_core.ts`);
  }
  if (!cut.clipped) return piece;
  let texture = piece.texture;
  const source = clipSourceOf(d.vertices, uvs, d.triangles, cut.sources, texture?.artUvs);
  if (texture !== undefined) {
    const art = through(shape, d.vertices, d.triangles, texture.artUvs);
    if (art === null || art.uvs.length !== cut.uvs.length) {
      throw new Error(
        `slot "${piece.slot}": the clip cut ${cut.uvs.length / 2} vertices for the page UVs and ` +
          `${(art?.uvs.length ?? 0) / 2} for the original-art UVs over the same geometry`,
      );
    }
    texture = { region: texture.region, artUvs: art.uvs, sourceArtUvs: source.artUvs };
  }
  const { tint, dark, slot, page } = piece;
  return { kind: 'mesh', tint, dark, slot, page, texture, world: cut.vertices, uvs: cut.uvs, triangles: cut.triangles, source: { world: source.world, uvs: source.uvs } };
}

/**
 * The rest table (`restOf` in `src/render.ts`): every (slot, attachment) the
 * frames show, in order of first appearance, posed on the setup bones with no
 * deform — the attachment looked up by that name as a placeholder in the
 * posed skin, then the default skin, as `Skeleton.getAttachment` does.
 */
function restOf(view: CompiledDocument, setup: RawPose, shown: readonly AttachmentPose[][]): AttachmentRest[] {
  const world = worldOf(setup);
  const bones = new Map(view.slots.map((s) => [s.name, s.bone]));
  const sourceOf = sourceOfDoc(view);
  const seen = new Map<string, Set<string>>();
  const out: AttachmentRest[] = [];
  for (const entries of shown) {
    for (const entry of entries) {
      const names = seen.get(entry.slot) ?? new Set<string>();
      if (names.has(entry.attachment)) continue;
      names.add(entry.attachment);
      seen.set(entry.slot, names);
      const skin = lookupSkins(view).find((k) => k.attachments[entry.slot]?.[entry.attachment] !== undefined);
      const record = skin?.attachments[entry.slot]?.[entry.attachment];
      const g = record?.geometry;
      const boneName = bones.get(entry.slot);
      const bone = boneName === undefined ? undefined : world.get(boneName);
      if (skin === undefined || g === undefined || bone === undefined || (g.kind !== 'region' && g.kind !== 'mesh' && g.kind !== 'linkedmesh')) {
        throw new Error(
          `slot ${JSON.stringify(entry.slot)} showed attachment ${JSON.stringify(entry.attachment)} in a frame, and ` +
            'the setup skeleton resolves no region or mesh of that name there',
        );
      }
      if (g.kind === 'region') {
        const rect = g.region.atlas;
        if (rect === null) throw new CoreInputError(`slot "${entry.slot}" region "${entry.attachment}": the model states the build had no atlas rectangle for it`);
        out.push({ slot: entry.slot, attachment: entry.attachment, kind: 'region', vertices: regionCorners({ ...g.region, atlas: rect }, bone), triangles: [...QUAD_TRIANGLES] });
        continue;
      }
      const mesh = g.kind === 'mesh' ? g : view.skins.find((k) => k.name === g.skin)?.attachments[g.slot]?.[g.source]?.geometry;
      const vertices = g.kind === 'mesh' ? g.vertices : sourceOf(g.skin, g.slot, g.source);
      if (mesh === undefined || mesh.kind !== 'mesh' || typeof vertices === 'string') throw new CoreInputError(`slot "${entry.slot}": the linked mesh "${entry.attachment}" resolves no source mesh`);
      if (mesh.hull === undefined) throw new CoreInputError(`slot "${entry.slot}" mesh "${entry.attachment}": the model states no hull`);
      out.push({
        slot: entry.slot,
        attachment: entry.attachment,
        kind: 'mesh',
        vertices: worldVertices(vertices, bone, world),
        triangles: [...mesh.triangles],
        hull: mesh.hull,
        uvs: [...mesh.uvs],
      });
    }
  }
  return out;
}

/**
 * `Poser` over rigc's own core: `modelText` a `rigc-compiled/1` document
 * (`skeleton.model.json`), `atlasText` the atlas the render samples — the one
 * `build` wrote beside it. With `skeleton`, the Spine file beside the document
 * is held to the digest the document records (`spine.sha256`, issue #968) and
 * refused, naming both digests, when it is not that build's. Refused by
 * `CoreInputError`, naming why, where the document or the atlas cannot be read; a pose the core leaves a block of out
 * is refused the same way when it is asked for (the header).
 */
export function corePoser(modelText: string, atlasText: string, where = 'skeleton.model.json', skeleton?: { path: string; bytes: Uint8Array }, through: ShapeClipper = clipThrough): Poser {
  const doc = readModel(modelText, where);
  // The document poses the rig it was built with; the Spine file beside it must be that build's (issue #968).
  if (skeleton !== undefined) {
    const found = spineFileSha256(skeleton.bytes);
    if (found !== doc.spine.sha256) {
      throw new CoreInputError(
        `${skeleton.path} is not the skeleton.json ${where} was written beside: its sha256 is ${found}, the document records ${doc.spine.sha256} — ` +
          'the Spine file was edited or replaced after the build, and the core would draw the build\'s rig instead of it',
      );
    }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(modelText);
  } catch (err) {
    throw new CoreInputError(`${where}: not JSON — ${(err as Error).message}`);
  }
  const sequences = readUvSequences(parsed);
  const atlas = parseAtlasText(atlasText);
  const lookup = atlasRegionLookup(atlas);
  const views = new Map<string, CompiledDocument>();
  const inputOf = (skin: string | undefined): CoreInput => {
    const key = skin === undefined ? '' : `=${skin}`;
    let view = views.get(key);
    if (view === undefined) {
      view = skin === undefined ? noSkinView(doc) : underSkin(doc, skin);
      views.set(key, view);
    }
    return { doc: view, source: { lookup, sequences }, region: (name) => lookup(name)?.region ?? null };
  };
  const roster: SubsetRoster = {
    declared: doc.slots.map((s) => s.name),
    carriers: (slot) => doc.skins.filter((k) => Object.keys(k.attachments[slot] ?? {}).length > 0).map((k) => k.name),
    defaultSkin: doc.skins.some((k) => k.name === CORE_DEFAULT_SKIN) ? CORE_DEFAULT_SKIN : null,
  };
  return {
    animations: doc.animations.map((a) => ({ name: a.name, duration: a.timelines.duration })),
    bones: doc.bones.map((b) => ({ name: b.name, parent: b.parent ?? null })),
    slots: doc.slots.map((s) => ({ name: s.name, bone: s.bone })),
    subset: (opts, skin) => subsetOver(roster, opts, skin),
    setup: (skin) => {
      const input = inputOf(skin);
      return corePosed(input, poseRawSetup(input.doc, { through }), through);
    },
    animation: (name, skin, fps, count, visit) => {
      const input = inputOf(skin);
      const step = 1 / fps;
      const poses = poseRawAnimation(input.doc, name, new Array<number>(count).fill(step), { through }, 'animation');
      poses.forEach((pose, i) => visit(i, corePosed(input, pose, through)));
    },
    rest: (skin, shown) => {
      const input = inputOf(skin);
      return restOf(input.doc, poseRawSetup(input.doc), shown);
    },
  };
}
