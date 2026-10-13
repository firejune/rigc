/**
 * A52 (issue #1407): every weighted vertex attachment lists its bones in one
 * order — the order the Spine editor needs and spine-core does not. Run over
 * the skeleton JSON by both entries: `validate()` in `src/validate.ts` over
 * the text it hands spine-core, and the entry that links none of the runtime
 * over the text rigc wrote (`../emitted/index.ts`), so the selftest's `RC28`
 * holds the two to the same lines on every recipe and on this assertion's
 * mutant.
 *
 * ⭐ **The rule is a cycle, measured, and not "ascending".** With Spine 4.3.26
 * Professional (`tools/editor_roundtrip.ts`), the import refuses an attachment
 * when one vertex lists bones `a, b` and another `b, a`, when three vertices
 * list `a, b` · `b, c` · `c, a` with no pair reversed, and when one vertex
 * lists a bone twice — `Error reading attachment: <name>` · `Index -2 out of
 * bounds` — on a mesh, a bounding box, a clipping polygon and a path alike.
 * The same rig with every vertex in DESCENDING index order imports, exports,
 * validates and checks; and four of the twelve editor exports in the example
 * corpus list bones out of ascending order, each in one order per attachment.
 * So "strictly ascending" would refuse Esoteric's own files, and this refuses
 * exactly the shape the editor refuses. spine-core reads every one of these
 * without a word, which is why it is an assertion: the round trip passes it.
 *
 * Re-derived from the emitted indices on purpose, with nothing shared with
 * `compile.ts`, which makes the build's order hold this — the gate does not
 * check the compiler with the compiler's code.
 *
 * Links nothing from the runtime.
 */
import type { Verdicts } from '../harness.ts';
import { isObj, type Json } from '../values.ts';

const CODE = 'A52_WEIGHTED_VERTICES_SHARE_ONE_BONE_ORDER';

/** The four attachment types a weighted vertex run can belong to. */
const VERTEX_TYPES = new Set(['mesh', 'boundingbox', 'clipping', 'path']);

/** One vertex's bone indices, in the order the run lists them. */
type Listed = { vertex: number; bones: number[] };

/**
 * A weighted run's vertices, each with the bone indices it lists — or `null`
 * when the attachment is unweighted or its run does not decode (A04, A20 and
 * A33 own that shape; this measures order, not encoding).
 */
function weightedVertices(att: Json): Listed[] | null {
  const type = typeof att.type === 'string' ? att.type : 'region';
  if (!VERTEX_TYPES.has(type) || !Array.isArray(att.vertices)) return null;
  const length = type === 'mesh' ? (Array.isArray(att.uvs) ? att.uvs.length : null) : typeof att.vertexCount === 'number' ? att.vertexCount * 2 : null;
  const run = att.vertices as unknown[];
  if (length === null || run.length === length) return null;
  const out: Listed[] = [];
  for (let i = 0; i < run.length; ) {
    const n = run[i++];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || i + n * 4 > run.length) return null;
    const bones: number[] = [];
    for (let k = 0; k < n; k++) {
      const bone = run[i + k * 4];
      if (typeof bone !== 'number') return null;
      bones.push(bone);
    }
    out.push({ vertex: out.length, bones });
    i += n * 4;
  }
  return out;
}

/** `vertex 3 lists bone 18 before 11 (its bones: 18, 11)`. */
function step(listed: Listed, from: number, to: number): string {
  return `vertex ${listed.vertex} lists bone ${from} before ${to} (its bones: ${listed.bones.join(', ')})`;
}

/**
 * Why no one order fits these vertices, in the vertices' own words — or
 * `null` when one does. A vertex naming a bone twice is its own reason; a
 * cycle is found by a depth-first walk over "listed directly before", in
 * the order the run first lists each bone, and every edge of it is named by
 * the first vertex that lists it.
 */
function noOneOrder(vertices: Listed[]): string | null {
  for (const listed of vertices) {
    const twice = listed.bones.find((bone, k) => listed.bones.indexOf(bone) !== k);
    if (twice !== undefined) return `vertex ${listed.vertex} lists bone ${twice} twice (its bones: ${listed.bones.join(', ')})`;
  }
  /** bone -> the bones listed directly after it, each with the first vertex that does. */
  const after = new Map<number, Map<number, Listed>>();
  for (const listed of vertices) {
    for (let k = 1; k < listed.bones.length; k++) {
      const from = listed.bones[k - 1];
      if (!after.has(from)) after.set(from, new Map());
      const next = after.get(from)!;
      if (!next.has(listed.bones[k])) next.set(listed.bones[k], listed);
    }
  }
  const state = new Map<number, 'open' | 'done'>();
  const path: number[] = [];
  const walk = (bone: number): number[] | null => {
    state.set(bone, 'open');
    path.push(bone);
    for (const next of after.get(bone)?.keys() ?? []) {
      if (state.get(next) === 'open') return [...path.slice(path.indexOf(next)), next];
      if (!state.has(next)) {
        const cycle = walk(next);
        if (cycle !== null) return cycle;
      }
    }
    path.pop();
    state.set(bone, 'done');
    return null;
  };
  for (const bone of after.keys()) {
    if (state.has(bone)) continue;
    const cycle = walk(bone);
    if (cycle === null) continue;
    const steps: string[] = [];
    for (let k = 1; k < cycle.length; k++) steps.push(step(after.get(cycle[k - 1])!.get(cycle[k])!, cycle[k - 1], cycle[k]));
    return steps.join(', ');
  }
  return null;
}

export function a52WeightedVerticesShareOneBoneOrder({ fail, skip }: Verdicts, raw: Json | null): void {
  if (!raw) return skip(CODE, 'the skeleton JSON did not parse (A00 owns that failure)');
  let measured = 0;
  for (const skin of Array.isArray(raw.skins) ? (raw.skins as unknown[]) : []) {
    if (!isObj(skin) || !isObj(skin.attachments)) continue;
    const skinName = typeof skin.name === 'string' ? skin.name : '(unnamed)';
    for (const [slot, perSlot] of Object.entries(skin.attachments)) {
      if (!isObj(perSlot)) continue;
      for (const [name, att] of Object.entries(perSlot)) {
        if (!isObj(att)) continue;
        const vertices = weightedVertices(att);
        if (vertices === null) continue;
        measured++;
        const why = noOneOrder(vertices);
        if (why === null) continue;
        fail(
          CODE,
          `${String(att.type)} "${skinName}/${slot}/${name}": no one bone order fits its vertices — ${why}. ` +
            'spine-core reads it; the Spine editor refuses the import ("Index -2 out of bounds"). ' +
            'List every vertex\'s bones in one order — ascending bone index is one, and the order `rigc build` writes',
        );
      }
    }
  }
  if (measured === 0) return skip(CODE, 'no weighted vertex attachment to measure');
}
