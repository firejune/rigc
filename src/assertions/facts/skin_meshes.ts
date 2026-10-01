/**
 * The skins' mesh entries, as the budget and canvas rules read them (issue
 * #1025, step 4c of #380) — the census's F03, F05 and F08 for A13, A14, A15 and
 * A22: every mesh a skin holds, linked meshes included, with where it sits
 * (its slot and that slot's bone), how big it is (its size, its triangle list,
 * its authored UVs and how many coordinates its vertices make) and which bones
 * its weights name.
 *
 * ⭐ **A linked mesh is the geometry it draws.** The runtime loads a link as a
 * mesh whose triangles, UVs, vertices, weights, width and height are its
 * source's (`setSourceMesh` overwrites the link's own `width` and `height`),
 * so an entry for a link carries its source's — the model side reads them
 * through the core's own join, `sourceOfDoc`, never a copy of the rule.
 *
 * ⭐ **The order is the file's**, as `./skin_entries.ts` states it: skins in
 * the emitter's order, a skin's entries slot by slot in the skeleton's slot
 * order, each slot's in its table's order. A13 and A22 print one line per
 * offending mesh in this order.
 *
 * Links nothing from the runtime: `validate()` reads each entry off
 * spine-core's loaded `MeshAttachment`, and the model side off the document
 * (`../model/skin_meshes.ts`).
 */

/** One mesh entry of one skin. */
export interface MeshEntry {
  /** The name it loaded under: its `name`, else its placeholder. */
  readonly name: string;
  /** The slot whose table holds it. */
  readonly slot: string;
  /** That slot's bone. */
  readonly slotBone: string;
  /** Its triangle list, three vertex indices per triangle. */
  readonly triangles: readonly number[];
  readonly width: number;
  readonly height: number;
  /** The UVs the file authored, two per vertex — the runtime's `regionUVs`, not the page-space `uvs` a renderer computes. */
  readonly regionUVs: ArrayLike<number>;
  /** Two per vertex, whatever the vertex encoding — the count the runtime recomputes. */
  readonly worldVerticesLength: number;
  /** Every bone its weights name, in the weight run's order (repeats kept); empty for an unweighted mesh. */
  readonly weightBones: readonly string[];
}

/** What A13, A14, A15 and A22 read of the skins. */
export interface SkinMeshFacts {
  /** Every mesh entry of every skin, in the file's walk order. */
  readonly meshes: readonly MeshEntry[];
}
