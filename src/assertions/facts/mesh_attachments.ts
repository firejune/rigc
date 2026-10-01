/**
 * The mesh attachments, as every body that reads a mesh sees them (issue
 * #1025, step 4c of #380) — the census's F03, F05, F07 (vertex data), F08
 * (mesh geometry) and F10 (the linked-mesh join), for A04, A13, A14, A15, A20,
 * A21, A22, A28 and the mesh half of A23.
 *
 * ⭐ **One family** (issue #1054). Cut 4c-1 stated the meshes for A13, A14,
 * A15 and A22 as a family of their own (`SkinMeshFacts`) and cut 4c-2 stated
 * them again here; the two walked the same entries in the same order and
 * agreed on every field they shared, and two families of one fact are two
 * places for a supplier to disagree with itself. The size the budget and
 * canvas rules read joined this one, and the bones a mesh's weights name are
 * derived from `weights` (`weightBonesOf`) rather than stated beside them.
 *
 * ⭐ **The order is the file's**, as `./skin_entries.ts` states it: every
 * skin in the file's order, and within a skin the entries slot by slot in the
 * skeleton's slot order — the walk spine-core's `getAttachments()` makes and
 * the model side reproduces by calling the emitter's own order.
 *
 * 🔸 **What a vertex's binding names is the bone's INDEX in the roster**,
 * because two bodies print it (`A20`'s weight-0 clause and `A28`'s row
 * shapes) and the index is what the file holds. The model document names a
 * binding's bone by name; its supplier turns the name into the index the
 * emitter writes (`boneIndexOf` in `src/emit_spine.ts`), called, and a weight
 * into the float32 the runtime stores it as (`Math.fround`).
 *
 * 🔒 **`encoding` is the round trip's, and only the round trip's.** A clause
 * whose subject is the Spine encoding — the flat vertex run's own coherence,
 * a binding's index into the bone array — has no model-side subject: the
 * document names bones and states the weighted form outright, and the run is
 * written by the emitter (the card's point 2). Those clauses stay in
 * `src/validate.ts`, which hands their findings to the body here, at the
 * place in the walk the body used to print them, so the moved body and the
 * kept clause print the lines the one body printed, in the same order. The
 * model side supplies none, because it has no encoding to be wrong.
 *
 * Links nothing from the runtime: the shapes are plain values.
 */

/** One influence of a weighted vertex: the bone's index in the roster and the weight the runtime holds. */
export interface MeshBinding {
  readonly bone: number;
  readonly weight: number;
  /** The kept clause's finding about this binding's index (`A20`'s range rule), where it has one; never on the model side. */
  readonly encoding?: string;
}

/** One mesh attachment of one skin, a linked mesh included (it loads as a mesh drawing its source's geometry). */
export interface MeshEntry {
  /** The attachment's own name: the entry's `name`, else its placeholder. */
  readonly name: string;
  readonly skin: string;
  /** The slot it is filed under, and that slot's bone. */
  readonly slot: string;
  readonly slotBone: string;
  readonly placeholder: string;
  /** The file's link, when this entry takes its geometry from another mesh, or `null`. */
  readonly link: { readonly source: string } | null;
  /** The triangles it draws, as indices into its vertices — a link's are its source's. */
  readonly triangles: readonly number[];
  /** `worldVerticesLength`: two numbers per vertex. */
  readonly worldVerticesLength: number;
  /** Its `uvs`, as the runtime reads them (doubles). */
  readonly regionUVs: readonly number[];
  /** `hullLength`: two numbers per hull vertex. */
  readonly hullLength: number;
  /** Its `width` and `height` — a link's are its source's, which the runtime's `setSourceMesh` writes over the link's own. */
  readonly width: number;
  readonly height: number;
  /** Per vertex its influences, in order — or `null` for an unweighted mesh. */
  readonly weights: ReadonlyArray<readonly MeshBinding[]> | null;
  /** The kept clauses' findings about this mesh's vertex run (`A04`'s encoding rules), in order; never on the model side. */
  readonly encoding: readonly string[];
}

/** What A04, A20, A21, A28 and A23 read of the meshes. */
export interface MeshFacts {
  /** The bone roster's names, by index. */
  readonly bones: readonly string[];
  /** Every mesh attachment of every skin, in the file's walk order. */
  readonly meshes: readonly MeshEntry[];
}

/**
 * Every bone a mesh's weights name, in the weight run's order (repeats kept),
 * by name — empty for an unweighted mesh. A binding whose index the roster
 * does not hold names nothing here: that index is the encoding's fault, which
 * `A20`'s kept clause names (`MeshBinding.encoding`), and no bone drives the
 * mesh through it.
 */
export function weightBonesOf(facts: Pick<MeshFacts, 'bones'>, mesh: Pick<MeshEntry, 'weights'>): string[] {
  const names: string[] = [];
  for (const vertex of mesh.weights ?? []) {
    for (const binding of vertex) {
      const name = facts.bones[binding.bone];
      if (name !== undefined) names.push(name);
    }
  }
  return names;
}
