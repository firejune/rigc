/**
 * The linked meshes the file declares, as `A44` reads them (issue #1025, step
 * 4c of #380): the census's F10, the subject half.
 *
 * ⭐ **The subject is the file's links, not the loaded ones** (A44's own ⚠️):
 * a link whose region is missing loads as nothing and is in no skin, so the
 * walk is over what the file declares — the skins in the file's order, each
 * skin's slot keys as the file keys them, each slot's entries in table order.
 * The model side walks the document's `linkedmesh` records in that order, by
 * calling the emitter's own orders (`editorSkinOrder`, `editorSlotKeyOrder`).
 *
 * 🔒 **Everything A44 refuses is the encoding's.** A linked mesh's record
 * holds no geometry field at all — `uvs`, `triangles`, `vertices`, `hull` and
 * `edges` written on a link exist only in the Spine text, which is the
 * card's census row for A44 ("a link record has no geometry field"). So the
 * clause that refuses them stays in `src/validate.ts`, which hands its finding
 * about each link here; the model side, which cannot spell such a link, hands
 * none. What moved is the roster — which links there are, so a rig with none
 * SKIPs on both sides and a rig with some is measured on both.
 *
 * Links nothing from the runtime.
 */

/** One link the file declares. */
export interface LinkEntry {
  readonly skin: string;
  readonly slot: string;
  readonly placeholder: string;
  /** The placeholder of the mesh it draws. */
  readonly source: string;
  /** The kept clause's finding about this link — the geometry keys it states — in order; never on the model side. */
  readonly encoding: readonly string[];
}

/** What A44 reads. */
export interface LinkFacts {
  readonly links: readonly LinkEntry[];
}
