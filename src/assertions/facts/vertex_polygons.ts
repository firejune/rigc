/**
 * The polygons — bounding boxes, clipping attachments and paths — and the
 * slot a clip ends at, as `A33` reads them (issue #1025, step 4c of #380):
 * the census's F07 and F09.
 *
 * ⭐ **Two orders, each the one its walk always had.** The polygons are in
 * the loaded skins' order (`./skin_entries.ts`'s ⭐), which is the order A33
 * walked spine-core's `getAttachments()`. The clip ends are in the order the
 * FILE spells them — the skins in the file's order, each skin's slot keys as
 * the file keys them, each slot's entries in table order — because A33 read
 * them off the skeleton JSON: a `null` end and an `end` never written are the
 * same loaded object. The model side produces both by calling the emitter's
 * own orders (`editorSkinOrder`, `editorSlotKeyOrder`).
 *
 * 🔒 **`encoding` is the round trip's**, as in `./mesh_attachments.ts`: the
 * weighted run's decode — a vertex claiming no bone, a binding indexing past
 * the roster, a run decoding to another vertex count, a weight array of the
 * wrong length — and an unweighted array of the wrong length have no subject
 * in a document that states the weighted form outright and names bones.
 * `src/validate.ts` keeps those clauses and hands their findings here, in the
 * order the body printed them; the model side supplies none.
 *
 * Links nothing from the runtime.
 */

/** One polygon: how A33 names it, the vertex count it loaded, and a path's own fields. */
export interface PolygonEntry {
  /** `bounding box "x"`, `clipping attachment "x"` or `path "x"` — the attachment's own name. */
  readonly what: string;
  /** `worldVerticesLength`: two numbers per vertex. */
  readonly worldVerticesLength: number;
  /** A path's `closed` and cumulative curve `lengths`, as the runtime holds them; `null` for the other two kinds. */
  readonly path: { readonly closed: boolean; readonly lengths: readonly number[] } | null;
  /** The kept clauses' findings about this polygon's vertex run, in order; never on the model side. */
  readonly encoding: readonly string[];
}

/** One clipping attachment that states an `end`, as the file states it. */
export interface ClipEnd {
  readonly placeholder: string;
  readonly slot: string;
  readonly end: unknown;
}

/** What A33 reads. */
export interface PolygonFacts {
  /** Every bounding box, clipping attachment and path of every skin, in the loaded walk's order. */
  readonly polygons: readonly PolygonEntry[];
  /** Every clipping attachment that states an `end`, in the file's order. */
  readonly clipEnds: readonly ClipEnd[];
  /** The skeleton's slot names. */
  readonly slots: readonly string[];
}
