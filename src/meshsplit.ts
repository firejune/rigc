/**
 * Splitting an authored mesh into its pieces (issue #1414, item 2).
 *
 * One mesh is one outline: `hull` is read off the triangles, and a triangle list
 * whose outline is not one closed loop is refused at compile (`traceOutline`). So
 * an author who deletes the triangles that bridged two islands — two legs joined
 * by transparent cells, say — is left with a mesh no build accepts, and the only
 * way forward is one mesh per island: its UVs, its weights, its triangles and
 * every deform key that moved it, renumbered. This module writes that proposal
 * from the two spec files, and nothing else.
 *
 * ⭐ **A piece is a set of triangles connected through shared vertices**, and
 * nothing else decides it: no distance, no art, no threshold. Two triangles that
 * touch at one vertex are one piece (and that piece is then refused for its pinch
 * by the outline rule, exactly as the compiler would refuse it); two that share
 * nothing are two. A vertex no triangle names draws nothing in either rig, so it
 * belongs to no piece and is dropped, by name.
 *
 * 🔒 **Nothing in the proposal is a value the spec did not state.** Every piece's
 * vertices carry the original's `uvs` and `weights` (or `vertices`) entries
 * unchanged; its triangles are the original's, renumbered; its deform runs are the
 * original's numbers at their new indices, with a `0` wherever the new array has
 * a slot the original run did not cover — which is what the original array held
 * there, because the parser fills everything outside a run with zero (AUTHORING
 * §4.11: a key is a sparse edit, and both encodings are offsets from setup). So a
 * piece poses exactly as its vertices did inside the original mesh; the selftest
 * holds that at tolerance 0, frame by frame, on both posers.
 *
 * Where the pieces go, and why there:
 *
 *   - **The first piece stays in the original slot, under the original
 *     placeholder.** Everything that names the slot — its setup attachment, its
 *     colour and attachment timelines, a clip's range, a stage box — keeps
 *     meaning what it meant, so the proposal edits the fewest lines it can.
 *   - **Piece k (k ≥ 2) gets a new slot `<slot>_<k>`** (`pieceSlotName`), on the
 *     same bone with the same colour, dark colour and blend, placed directly after
 *     the original in the slot list — which is the draw order — and filled under
 *     the SAME placeholder, so the attachment's `name`, `path` and `image` resolve
 *     exactly as before. A derived name that is already a slot is refused by name;
 *     the compiler would refuse the duplicate, and a different spelling would be a
 *     name this module made up.
 *   - **Pieces are numbered by their first triangle in the list**, which is the
 *     order the original drew them in: Spine draws a mesh's triangles in list
 *     order, so piece 1 is under piece 2 wherever they overlap. When the pieces'
 *     triangles interleave in the list that is not the whole truth, and the
 *     proposal says so rather than staying silent about it.
 *
 * A piece's vertices keep their original relative order when that order already
 * lists the piece's outline first and in order; otherwise they are renumbered the
 * way the hull refusal asks — the outline walk first, then the interior in
 * original order — so every piece builds without a second hand edit.
 *
 * ⛔ What the proposal refuses rather than guesses, each by name: a generated
 * mesh (its generator builds one outline by construction), a `sequence`, a raw
 * `boneIndexing` run, a deform key stated as a `transform` model (it is evaluated
 * over the attachment's whole geometry, and splitting changes the geometry it
 * reads), the slot filled in another skin, a linked mesh borrowing this one, a
 * clip whose range ends at this slot, a draw-order key or a slot-property group
 * track naming the slot, and a sequence timeline on the attachment. Each would
 * need a decision the spec does not state.
 *
 * Pure: no clock, no randomness, no file system. The CLI (`rigc split`) reads and
 * writes the files; this module maps one pair of parsed specs to another.
 */
import { checkHullOrder, formatWalk, MeshError, traceOutline } from './mesh.ts';
import { splitRigSkin, type RigAttachment, type RigMeshAttachment, type RigMeshBinding, type RigSlot, type RigSpec } from './rig.ts';
import type { MotionDeformKey, MotionDeformTrack, MotionSetupSlot, MotionSpec, MotionTrack } from './types.ts';

/** A split refused: `status` 2 when the invocation names something the specs do not have, 1 when the specs hold something the split cannot carry. */
export class SplitError extends Error {
  constructor(
    message: string,
    readonly status: 1 | 2,
  ) {
    super(message);
  }
}

/** The record `rigc split` writes beside the two proposed specs. */
export const SPLIT_SPEC = 'rigc-split/1';

/** The slot piece `k` (1-based) of a split of `slot` is filed under. Piece 1 keeps the slot itself. */
export function pieceSlotName(slot: string, k: number): string {
  return k === 1 ? slot : `${slot}_${k}`;
}

/** The properties a track keys on a slot, as opposed to a bone or a constraint. */
const SLOT_PROPERTIES = new Set<string>(['rgba', 'rgb', 'alpha', 'rgba2', 'rgb2', 'attachment']);

/**
 * The connected pieces of a triangulation: triangles that share a vertex are one
 * piece. Each piece lists its triangles (indices into the triangle list, in list
 * order) and its vertices (ascending); pieces are ordered by their first
 * triangle. `orphans` are the vertices no triangle names, ascending.
 */
export interface MeshPieces {
  pieces: Array<{ triangles: number[]; vertices: number[] }>;
  orphans: number[];
}

/** Read the pieces off a triangle list over `vertexCount` vertices. Indices are assumed in range (the caller checks). */
export function meshPieces(vertexCount: number, triangles: readonly number[]): MeshPieces {
  const parent = Array.from({ length: vertexCount }, (_v, i) => i);
  const find = (v: number): number => {
    let root = v;
    while (parent[root] !== root) root = parent[root];
    while (parent[v] !== root) {
      const next = parent[v];
      parent[v] = root;
      v = next;
    }
    return root;
  };
  const used = new Array<boolean>(vertexCount).fill(false);
  for (let i = 0; i + 2 < triangles.length; i += 3) {
    const [a, b, c] = [triangles[i], triangles[i + 1], triangles[i + 2]];
    used[a] = used[b] = used[c] = true;
    // Union toward the smaller root, so the root is a deterministic function of the list.
    for (const [p, q] of [[a, b], [b, c]]) {
      const rp = find(p);
      const rq = find(q);
      if (rp !== rq) parent[Math.max(rp, rq)] = Math.min(rp, rq);
    }
  }
  const byRoot = new Map<number, { triangles: number[]; vertices: number[] }>();
  for (let t = 0; 3 * t + 2 < triangles.length; t++) {
    const root = find(triangles[3 * t]);
    let piece = byRoot.get(root);
    if (piece === undefined) {
      piece = { triangles: [], vertices: [] };
      byRoot.set(root, piece);
    }
    piece.triangles.push(t);
  }
  for (let v = 0; v < vertexCount; v++) if (used[v]) byRoot.get(find(v))?.vertices.push(v);
  // Map insertion order is first-triangle order, because triangles were visited in list order.
  return { pieces: [...byRoot.values()], orphans: [...Array(vertexCount).keys()].filter((v) => !used[v]) };
}

/** What the caller asks to split. */
export interface SplitRequest {
  rig: RigSpec;
  motion: MotionSpec;
  slot: string;
  /** The placeholder; absent, the slot's one authored mesh in the skin. */
  attachment?: string;
  /** The skin the attachment is filed under. Absent: `default`. */
  skin?: string;
  /** The rig spec's `images` as the proposal must state it (it is written somewhere else); absent, the field is left as it is. */
  images?: string;
}

/**
 * Two plausible wrong renumberings, planted by the selftest's controls and by
 * nothing else: the vertex data placed one position along from where the record
 * says it is, and every deform key copied to every piece as it stood — its start
 * and its numbers unmoved, cut where the piece's shorter array ends, which is
 * what a hand split that copied the keys and trimmed them until the build
 * passed would hold (untrimmed, the compiler refuses the overrun first, and the
 * pose reading this plant exists to test never runs).
 */
export interface SplitPlant {
  offByOne?: boolean;
  deformUnrenumbered?: boolean;
}

/** One proposed piece, as the record states it. */
export interface SplitPieceRecord {
  slot: string;
  attachment: string;
  /** The original vertex index of each of this piece's vertices, in the piece's order: piece vertex `j` is original vertex `vertices[j]`. */
  vertices: number[];
  /** The original triangle index of each of this piece's triangles, in the piece's order. */
  triangles: number[];
  /** The piece's outline vertex count — the `hull` its build derives. */
  hull: number;
  /** Whether the piece's vertices had to be renumbered outline first, rather than kept in original order. */
  renumbered: boolean;
}

/** `split.json`: what was split and where each original vertex and triangle went. */
export interface SplitRecord {
  spec: typeof SPLIT_SPEC;
  skin: string;
  slot: string;
  attachment: string;
  vertices: number;
  triangles: number;
  pieces: SplitPieceRecord[];
  /** Original vertices no triangle names: in no piece, and drawn by neither rig. */
  dropped: number[];
}

/** The answer: a proposal, or the statement that the mesh is one piece. */
export type SplitResult =
  | { kind: 'split'; rig: RigSpec; motion: MotionSpec; record: SplitRecord; lines: string[] }
  | { kind: 'whole'; line: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function quoteList(names: readonly string[]): string {
  return names.length === 0 ? 'none' : names.map((n) => `"${n}"`).join(', ');
}

/** `[0, 1, 2, …, 9]` with the tail elided past `max` entries — a vertex list as a line prints it. */
function shortList(values: readonly number[], max = 12): string {
  return values.length <= max ? `[${values.join(', ')}]` : `[${values.slice(0, max).join(', ')}, … ${values.length - max} more]`;
}

/** Rebuild `record` with `entries` inserted directly after `after`'s key, preserving every other key's order. */
function insertAfter<T>(record: Record<string, T>, after: string, entries: ReadonlyArray<[string, T]>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = value;
    if (key === after) for (const [k, v] of entries) out[k] = v;
  }
  return out;
}

/**
 * Propose the split of one authored mesh into its pieces.
 *
 * The specs are not edited: the proposal is built on copies. A mesh of one piece
 * answers `whole` with the line that says so; anything the split cannot carry
 * throws `SplitError` naming it.
 */
export function splitMesh(request: SplitRequest, plant: SplitPlant = {}): SplitResult {
  const rig = structuredClone(request.rig);
  const motion = structuredClone(request.motion);
  const skinName = request.skin ?? 'default';
  const slotName = request.slot;
  const where = (placeholder: string): string => `skin "${skinName}" slot "${slotName}" attachment "${placeholder}"`;

  // --- what the invocation names ----------------------------------------------------------------------------
  const slotNames = rig.slots.map((s) => s.name);
  const slotIndex = slotNames.indexOf(slotName);
  if (slotIndex < 0) throw new SplitError(`the rig spec declares no slot "${slotName}"; it declares ${quoteList(slotNames)}`, 2);
  const skins = rig.skins ?? {};
  const skin = skins[skinName];
  if (skin === undefined) throw new SplitError(`the rig spec declares no skin "${skinName}"; it declares ${quoteList(Object.keys(skins))}`, 2);
  const attachments = splitRigSkin(skin, `skin "${skinName}"`).attachments;
  const filled = attachments[slotName];
  if (filled === undefined) {
    const fillers = Object.keys(skins).filter((name) => splitRigSkin(skins[name], `skin "${name}"`).attachments[slotName] !== undefined);
    throw new SplitError(`skin "${skinName}" fills nothing in slot "${slotName}"; the skins that fill it: ${quoteList(fillers)}`, 2);
  }
  // Any mesh, generated ones included, so that the one mesh a slot holds is named — and refused for its generator by
  // name below — rather than reported missing.
  const isMesh = (att: unknown): boolean => isRecord(att) && att.type === 'mesh';
  let placeholder = request.attachment;
  if (placeholder === undefined) {
    const meshes = Object.keys(filled).filter((p) => isMesh(filled[p]));
    if (meshes.length !== 1) {
      throw new SplitError(
        `slot "${slotName}" in skin "${skinName}" holds ${meshes.length} mesh(es) (${quoteList(meshes)}) among ${quoteList(Object.keys(filled))}; name the one to split with --attachment`,
        2,
      );
    }
    placeholder = meshes[0];
  }
  const original = filled[placeholder];
  if (original === undefined) {
    throw new SplitError(`slot "${slotName}" in skin "${skinName}" has no attachment "${placeholder}"; it has ${quoteList(Object.keys(filled))}`, 2);
  }

  // --- what the attachment is --------------------------------------------------------------------------------
  const at = where(placeholder);
  const fields: unknown = original;
  const type = isRecord(fields) && typeof fields.type === 'string' ? fields.type : 'region';
  if (type !== 'mesh') throw new SplitError(`${at} is a "${type}" attachment; only a mesh has triangles to split`, 1);
  const mesh = original as RigMeshAttachment;
  if (mesh.generator !== undefined) {
    throw new SplitError(`${at} is built by a "${mesh.generator.kind}" generator, which builds one outline by construction; there are no authored triangles to split`, 1);
  }
  if (mesh.sequence !== undefined) {
    throw new SplitError(`${at} carries a "sequence"; a numbered series over one triangulation would have to become one per piece, and which frames each piece shows is not something the spec states`, 1);
  }
  if (mesh.boneIndexing === 'raw') {
    throw new SplitError(`${at} states its weights as a raw index run ("boneIndexing": "raw"); write them as "weights", by name, and split that`, 1);
  }
  if (mesh.uvs === undefined || mesh.triangles === undefined || (mesh.vertices === undefined) === (mesh.weights === undefined)) {
    throw new SplitError(`${at} needs uvs, triangles and exactly one of vertices or weights to be split`, 1);
  }
  const uvs = mesh.uvs;
  const triangles = mesh.triangles;
  if (uvs.length % 2 !== 0) throw new SplitError(`${at} has ${uvs.length} uv numbers, which is not a whole number of pairs`, 1);
  const vertexCount = uvs.length / 2;
  if (triangles.length % 3 !== 0) throw new SplitError(`${at} has ${triangles.length} triangle indices, which is not a whole number of triangles`, 1);
  for (let i = 0; i < triangles.length; i++) {
    const v = triangles[i];
    if (!Number.isInteger(v) || v < 0 || v >= vertexCount) {
      throw new SplitError(`${at}: triangle ${Math.floor(i / 3)} names vertex ${v}, and the mesh has vertices 0..${vertexCount - 1}`, 1);
    }
  }
  const weights = mesh.weights;
  const unweighted = mesh.vertices;
  if (weights !== undefined && weights.length !== vertexCount) {
    throw new SplitError(`${at}: weights cover ${weights.length} vertices but there are ${vertexCount} uv pairs`, 1);
  }
  if (unweighted !== undefined && unweighted.length !== uvs.length) {
    throw new SplitError(`${at}: "vertices" is ${unweighted.length} numbers and the ${vertexCount} uv pairs need ${uvs.length}; a weighted run is written as "weights"`, 1);
  }

  // --- the pieces ------------------------------------------------------------------------------------------
  const { pieces, orphans } = meshPieces(vertexCount, triangles);
  if (pieces.length === 0) throw new SplitError(`${at} has no triangles`, 1);
  if (pieces.length === 1) {
    return {
      kind: 'whole',
      line:
        `${at} is one piece — its ${triangles.length / 3} triangle(s) over ${vertexCount - orphans.length} vertices each reach every other through shared vertices` +
        `${orphans.length === 0 ? '' : ` (and ${orphans.length} vertex(es) no triangle names: ${shortList(orphans)})`}; nothing to split, and nothing written`,
    };
  }
  const names = pieces.map((_p, i) => pieceSlotName(slotName, i + 1));
  for (const name of names.slice(1)) {
    if (slotNames.includes(name)) {
      throw new SplitError(`${at} is ${pieces.length} pieces, and piece ${names.indexOf(name) + 1}'s slot would be "${name}", which the rig spec already declares; rename that slot and split again`, 1);
    }
  }

  // --- what the rest of the two specs says about the slot ---------------------------------------------------
  const refusals: string[] = [];
  for (const [name, other] of Object.entries(skins)) {
    if (name === skinName) continue;
    if (splitRigSkin(other, `skin "${name}"`).attachments[slotName] !== undefined) {
      refusals.push(`skin "${name}" also fills slot "${slotName}", so the new slots would show this skin's pieces under that skin too`);
    }
  }
  for (const [name, other] of Object.entries(skins)) {
    for (const [ownSlot, map] of Object.entries(splitRigSkin(other, `skin "${name}"`).attachments)) {
      for (const [ph, entry] of Object.entries(map)) {
        const att: unknown = entry;
        if (!isRecord(att)) continue;
        if (att.type === 'linkedmesh' && att.source === placeholder && (att.slot ?? ownSlot) === slotName && (att.skin ?? 'default') === skinName) {
          refusals.push(`skin "${name}" slot "${ownSlot}" attachment "${ph}" is a linked mesh borrowing this mesh's geometry`);
        }
        if (att.type === 'clipping' && att.end === slotName) {
          refusals.push(`skin "${name}" slot "${ownSlot}" attachment "${ph}" is a clip whose range ends at slot "${slotName}", and the new slots would fall outside it`);
        }
      }
    }
  }
  const groups = motion.groups ?? {};
  for (const [animation, anim] of Object.entries(motion.animations)) {
    for (const track of anim.tracks) {
      if (track.group !== undefined && SLOT_PROPERTIES.has(track.property) && (groups[track.group] ?? []).includes(slotName)) {
        refusals.push(`animation "${animation}" keys "${track.property}" on group "${track.group}", which holds slot "${slotName}"; the new slots are in no group`);
      }
    }
    for (const key of anim.drawOrder ?? []) {
      if ((key.offsets ?? []).some((o) => o.slot === slotName)) {
        refusals.push(`animation "${animation}" moves slot "${slotName}" in its draw order at t=${key.t}; where the new slots go then is not stated`);
        break;
      }
    }
    for (const track of anim.sequence ?? []) {
      if ((track.skin ?? 'default') === skinName && track.slot === slotName && track.attachment === placeholder) {
        refusals.push(`animation "${animation}" keys a sequence on ${at}`);
      }
    }
    for (const track of anim.deform ?? []) {
      if ((track.skin ?? 'default') !== skinName || track.slot !== slotName || track.attachment !== placeholder) continue;
      track.keys.forEach((key, i) => {
        if (key.transform !== undefined) {
          refusals.push(`animation "${animation}" deform key ${i} (t=${key.t}) states a "${key.transform.kind}" transform, which is evaluated over the whole attachment's geometry; state it as a "vertices" run to split it`);
        }
      });
    }
  }
  if (refusals.length > 0) throw new SplitError(`${at} is ${pieces.length} pieces, and the split cannot carry what else names it: ${refusals.join('; ')}`, 1);

  // --- each piece's vertex order ------------------------------------------------------------------------------
  const orders: number[][] = [];
  const hulls: number[] = [];
  const renumbered: boolean[] = [];
  pieces.forEach((piece, p) => {
    const ascending = piece.vertices;
    const localOf = new Map(ascending.map((v, j) => [v, j]));
    const local = piece.triangles.flatMap((t) => [triangles[3 * t], triangles[3 * t + 1], triangles[3 * t + 2]].map((v) => localOf.get(v) as number));
    let outline;
    try {
      outline = traceOutline(ascending.length, local);
    } catch (err) {
      if (err instanceof MeshError) {
        throw new SplitError(`${at}: piece ${p + 1} (vertices ${shortList(ascending)}) is not one mesh either: ${err.message}`, 1);
      }
      throw err;
    }
    let order = ascending;
    let moved = false;
    try {
      checkHullOrder(outline, ascending.length);
    } catch (err) {
      if (!(err instanceof MeshError)) throw err;
      const onOutline = new Set(outline.walk);
      order = [...outline.walk.map((j) => ascending[j]), ...ascending.filter((_v, j) => !onOutline.has(j))];
      moved = true;
    }
    orders.push(order);
    hulls.push(outline.hull);
    renumbered.push(moved);
  });

  // --- the deform array's layout: influences per vertex, and where each vertex starts --------------------------
  const influences = (v: number): number => (weights === undefined ? 1 : weights[v].length);
  const base: number[] = [];
  let length = 0;
  for (let v = 0; v < vertexCount; v++) {
    base.push(length);
    length += 2 * influences(v);
  }
  const pieceOf = new Array<number>(vertexCount).fill(-1);
  const positionOf = new Array<number>(vertexCount).fill(-1);
  const pieceBase: number[][] = [];
  const pieceLength: number[] = [];
  orders.forEach((order, p) => {
    let at2 = 0;
    const bases: number[] = [];
    order.forEach((v, j) => {
      pieceOf[v] = p;
      positionOf[v] = j;
      bases.push(at2);
      at2 += 2 * influences(v);
    });
    pieceBase.push(bases);
    pieceLength.push(at2);
  });
  /** The vertex that owns original deform index `x`. */
  const ownerOf: number[] = [];
  for (let v = 0; v < vertexCount; v++) for (let k = 0; k < 2 * influences(v); k++) ownerOf.push(v);

  // --- the pieces' attachments ---------------------------------------------------------------------------------
  const pieceAttachments: RigMeshAttachment[] = orders.map((order, p) => {
    // The plant: the data one position along from where the record says it is.
    const source = plant.offByOne === true ? order.map((_v, j) => order[(j + 1) % order.length]) : order;
    const local = new Map(order.map((v, j) => [v, j]));
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(mesh)) {
      if (key === 'hull') continue;
      if (key === 'uvs') out.uvs = source.flatMap((v) => [uvs[2 * v], uvs[2 * v + 1]]);
      else if (key === 'triangles') out.triangles = pieces[p].triangles.flatMap((t) => [0, 1, 2].map((c) => local.get(triangles[3 * t + c]) as number));
      else if (key === 'weights' && weights !== undefined) out.weights = source.map((v) => weights[v].map((b: RigMeshBinding) => ({ ...b })));
      else if (key === 'vertices' && unweighted !== undefined) out.vertices = source.flatMap((v) => [unweighted[2 * v], unweighted[2 * v + 1]]);
      else if (key === 'edges' && Array.isArray(value)) {
        const edges: number[] = [];
        for (let i = 0; i + 1 < value.length; i += 2) {
          const [a, b] = [value[i] / 2, value[i + 1] / 2];
          if (pieceOf[a] !== pieceOf[b]) throw new SplitError(`${at}: stated edge ${i / 2} joins vertex ${a} (piece ${pieceOf[a] + 1}) to vertex ${b} (piece ${pieceOf[b] + 1}); delete it, or delete "edges" and rigc derives them`, 1);
          if (pieceOf[a] === p) edges.push(2 * (local.get(a) as number), 2 * (local.get(b) as number));
        }
        out.edges = edges;
      } else out[key] = structuredClone(value);
    }
    return out as unknown as RigMeshAttachment;
  });

  // --- the deform keys -----------------------------------------------------------------------------------------
  const splitKey = (key: MotionDeformKey, animation: string, i: number): MotionDeformKey[] => {
    const timing = (k: MotionDeformKey): MotionDeformKey => ({ t: k.t, ...(k.ease === undefined ? {} : { ease: k.ease }), ...(k.curve === undefined ? {} : { curve: k.curve }) });
    if (plant.deformUnrenumbered === true) {
      return pieces.map((_piece, p) => {
        const copy = structuredClone(key);
        if (copy.vertices === undefined || copy.vertices === null || copy.fromVertex !== undefined) return copy;
        const from = copy.offset ?? 0;
        if (from >= pieceLength[p]) return timing(key);
        copy.vertices = copy.vertices.slice(0, pieceLength[p] - from);
        return copy;
      });
    }
    const run = key.vertices;
    if (run === undefined || run === null) return pieces.map(() => timing(key));
    let start = key.offset ?? 0;
    if (key.fromVertex !== undefined) {
      const fv = key.fromVertex;
      if (!Number.isInteger(fv) || fv < 0 || fv >= vertexCount) throw new SplitError(`animation "${animation}" deform key ${i} (t=${key.t}): "fromVertex" ${fv} is not a vertex of ${at} (0..${vertexCount - 1})`, 1);
      start = base[fv];
      if (weights !== undefined) {
        for (let x = start; x < start + run.length && x < length; x++) {
          if (influences(ownerOf[x]) > 1) {
            throw new SplitError(
              `animation "${animation}" deform key ${i} (t=${key.t}): "fromVertex" counts VERTICES, and this attachment is weighted — vertex ${ownerOf[x]} has ${influences(ownerOf[x])} of them; the compiler refuses this key, so the split does too`,
              1,
            );
          }
        }
      }
    }
    if (start < 0 || start + run.length > length) {
      throw new SplitError(`animation "${animation}" deform key ${i} (t=${key.t}): the run starts at deform index ${start} and is ${run.length} long, which ends at ${start + run.length}; ${at}'s deform array is ${length} long`, 1);
    }
    const runs = pieces.map(() => new Map<number, number>());
    run.forEach((value, k) => {
      const x = start + k;
      const v = ownerOf[x];
      const p = pieceOf[v];
      if (p < 0) return; // a dropped vertex: no triangle draws it in either rig
      runs[p].set(pieceBase[p][positionOf[v]] + (x - base[v]), value);
    });
    return runs.map((entries) => {
      if (entries.size === 0) return timing(key);
      const indices = [...entries.keys()];
      const lo = Math.min(...indices);
      const hi = Math.max(...indices);
      // A gap is an index the original run did not cover, and the parser left it at zero there too.
      const vertices = Array.from({ length: hi - lo + 1 }, (_v, k) => entries.get(lo + k) ?? 0);
      return { t: key.t, offset: lo, vertices, ...(key.ease === undefined ? {} : { ease: key.ease }), ...(key.curve === undefined ? {} : { curve: key.curve }) };
    });
  };
  const deformLines: string[] = [];
  for (const [animation, anim] of Object.entries(motion.animations)) {
    if (anim.deform === undefined) continue;
    const next: MotionDeformTrack[] = [];
    for (const track of anim.deform) {
      if ((track.skin ?? 'default') !== skinName || track.slot !== slotName || track.attachment !== placeholder) {
        next.push(track);
        continue;
      }
      const perKey = track.keys.map((key, i) => splitKey(key, animation, i));
      names.forEach((name, p) => next.push({ ...track, slot: name, keys: perKey.map((keys) => keys[p]) }));
      const moving = names.map((_n, p) => perKey.filter((keys) => keys[p].vertices !== undefined).length);
      deformLines.push(`deform   animation "${animation}": ${track.keys.length} key(s) re-sliced into ${names.length} timelines — ${names.map((n, p) => `"${n}" ${moving[p]} with a run`).join(', ')}`);
    }
    anim.deform = next;
  }

  // --- the slot tracks the new slots copy --------------------------------------------------------------------
  const trackLines: string[] = [];
  for (const [animation, anim] of Object.entries(motion.animations)) {
    const next: MotionTrack[] = [];
    for (const track of anim.tracks) {
      next.push(track);
      if (track.slot !== slotName || !SLOT_PROPERTIES.has(track.property)) continue;
      for (const name of names.slice(1)) {
        const copy = structuredClone(track);
        copy.slot = name;
        if (track.property === 'attachment') copy.keys = copy.keys.map((key) => ({ ...key, v: key.v === placeholder ? placeholder : null }));
        next.push(copy);
      }
      trackLines.push(
        `track    animation "${animation}": slot "${slotName}" "${track.property}" copied to ${quoteList(names.slice(1))}` +
          (track.property === 'attachment' ? ` — a key showing "${placeholder}" shows its piece there, any other key shows nothing there` : ''),
      );
    }
    anim.tracks = next;
  }

  // --- the rig spec ------------------------------------------------------------------------------------------
  const slotS = rig.slots[slotIndex];
  const newSlots: RigSlot[] = names.slice(1).map((name) => {
    const copy: RigSlot = { ...structuredClone(slotS), name };
    if (slotS.attachment !== undefined) copy.attachment = slotS.attachment === placeholder ? placeholder : null;
    return copy;
  });
  rig.slots.splice(slotIndex + 1, 0, ...newSlots);
  // The skin, short or long form: `splitRigSkin` hands back the live table inside this copy.
  const liveSkin = rig.skins?.[skinName];
  if (liveSkin === undefined) throw new Error('internal: the skin vanished from the copy');
  const table = splitRigSkin(liveSkin, `skin "${skinName}"`).attachments;
  table[slotName] = { ...table[slotName], [placeholder]: pieceAttachments[0] };
  const rebuilt = insertAfter<Record<string, RigAttachment>>(table, slotName, names.slice(1).map((name, i): [string, Record<string, RigAttachment>] => [name, { [placeholder]: pieceAttachments[i + 1] }]));
  for (const key of Object.keys(table)) delete table[key];
  Object.assign(table, rebuilt);
  const folds = rig.invariants?.deformMayFold;
  if (folds !== undefined && rig.invariants !== undefined) {
    rig.invariants.deformMayFold = folds.flatMap((entry) => (entry.slot === slotName ? [entry, ...names.slice(1).map((name) => ({ ...structuredClone(entry), slot: name }))] : [entry]));
  }
  if (request.images !== undefined) rig.images = request.images;

  // --- the motion spec's setup ------------------------------------------------------------------------------
  const setup = motion.setup;
  const setupS = setup?.[slotName];
  if (setup !== undefined && setupS !== undefined) {
    const entries = names.slice(1).map((name): [string, MotionSetupSlot] => {
      const copy: MotionSetupSlot = structuredClone(setupS);
      if (setupS.attachment !== undefined) copy.attachment = setupS.attachment === placeholder ? placeholder : null;
      return [name, copy];
    });
    motion.setup = insertAfter(setup, slotName, entries);
  }

  // --- the record and the lines --------------------------------------------------------------------------------
  const record: SplitRecord = {
    spec: SPLIT_SPEC,
    skin: skinName,
    slot: slotName,
    attachment: placeholder,
    vertices: vertexCount,
    triangles: triangles.length / 3,
    pieces: pieces.map((piece, p) => ({
      slot: names[p],
      attachment: placeholder,
      vertices: orders[p],
      triangles: piece.triangles,
      hull: hulls[p],
      renumbered: renumbered[p],
    })),
    dropped: orphans,
  };
  const lines: string[] = [
    `mesh     ${at}: ${vertexCount} vertices, ${triangles.length / 3} triangles, ${pieces.length} pieces (triangles that share a vertex are one piece)`,
    ...pieces.map((piece, p) =>
      `piece ${p + 1}  slot "${names[p]}"${p === 0 ? ' (the original slot)' : ` (new, drawn after "${names[p - 1]}")`}: ${orders[p].length} vertices, ${piece.triangles.length} triangles, hull ${hulls[p]} — ` +
        (renumbered[p]
          ? `renumbered outline first, as the hull rule needs: piece vertex 0.. is original ${formatWalk(orders[p].slice(0, hulls[p]))}, then the interior ${shortList(orders[p].slice(hulls[p]))}`
          : `original order kept: ${shortList(orders[p])}`),
    ),
  ];
  // Interleaving: a later piece's triangle listed before an earlier piece's last one.
  for (let p = 1; p < pieces.length; p++) {
    const earlierLast = Math.max(...pieces.slice(0, p).map((q) => q.triangles[q.triangles.length - 1]));
    const first = pieces[p].triangles[0];
    if (first < earlierLast) {
      lines.push(
        `order    piece ${p + 1}'s triangle ${first} is listed before triangle ${earlierLast} of an earlier piece: the original drew their triangles interleaved, and the split draws each piece whole, after the one before it — where they overlap on screen, the stacking can differ`,
      );
      break;
    }
  }
  if (orphans.length > 0) lines.push(`dropped  ${orphans.length} vertex(es) no triangle names, ${shortList(orphans)}: no piece holds them and neither rig draws them`);
  lines.push(...deformLines, ...trackLines);
  if (folds?.some((entry) => entry.slot === slotName)) lines.push(`invariant invariants.deformMayFold names slot "${slotName}"; its entry is copied to ${quoteList(names.slice(1))}`);
  if (rig.invariants?.meshSlots !== undefined) {
    lines.push(`invariant invariants.meshSlots states ${rig.invariants.meshSlots}; the split adds ${names.length - 1} mesh slot(s) and leaves the budget as the spec states it`);
  }
  return { kind: 'split', rig, motion, record, lines };
}
