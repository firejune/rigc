/**
 * A33, the body (issue #1025, step 4c of #380): bounding boxes, clipping
 * polygons and paths hold a real polygon, a path's curve lengths strictly
 * increase, and a clip ends at a slot of the skeleton.
 *
 * These types are the same shape — a polygon and nothing else — and they
 * fail the same ways, all silent:
 *
 *   1. **A missing or wrong `vertexCount`.** The parser reads
 *      `map.vertexCount << 1` and hands it to `readVertices` as the length to
 *      expect (`:552`, `:632`). `undefined << 1` is 0, so an omission makes
 *      the coordinate array read as a WEIGHTED run: it decodes numbers as
 *      bone counts and weights, and the attachment ends up with no vertices
 *      at all. Nothing throws, and neither type draws a pixel, so nothing
 *      downstream notices either.
 *   2. **A weighted run that does not decode to that many vertices.** Same
 *      trap as a mesh's (A04), minus the uvs that would have caught it.
 *   3. **A clipping `end` naming a slot that is not there.**
 *      `skeletonData.findSlot` returns null on a miss and `:626-627` assigns
 *      the null, so the clip does not end where it was told to — it runs to
 *      the bottom of the draw order and takes every slot below it with it.
 *      Checked on what the file states, because a null `endSlot` and an `end`
 *      that was never written are the same loaded object.
 *
 * Moved out of `src/validate.ts` clause by clause. The path clauses, the
 * clip's end and a polygon's vertex count are about the rig — a document's
 * polygon states its count and its vertices, a path its `closed` and
 * `lengths`, a clip its `end` — and moved. The decode of a weighted run and
 * the length of an unweighted array (the second failure above) are about the
 * encoding: the document states the weighted form outright and names bones.
 * They stay with the round trip, which hands their findings in as each
 * polygon's `encoding`, printed where the body always printed them.
 */
import type { Verdicts } from '../harness.ts';
import type { PolygonFacts } from '../facts/vertex_polygons.ts';

export function a33VertexAttachmentGeometry({ fail, skip }: Verdicts, { polygons, clipEnds, slots }: PolygonFacts): void {
  const paths = polygons.filter((p) => p.path !== null);
  for (const path of paths) {
    const what = path.what;
    const vertexCount = path.worldVerticesLength / 2;
    if (vertexCount % 3 !== 0) {
      fail(
        'A33_VERTEX_ATTACHMENT_GEOMETRY',
        `${what} has ${vertexCount} vertices, which is not a multiple of 3 — a path is knots and Bezier ` +
          'handles read in groups of three, and `Utils.newArray(vertexCount / 3, 0)` accepts the fractional ' +
          'size without a word, so the curves straddle the knots',
      );
      continue;
    }
    // Curves: 3K + 1 chain points. An open path drops the first and last
    // vertex (the end knots' outer handles), a closed one repeats the first.
    const curves = path.path?.closed ? vertexCount / 3 : vertexCount / 3 - 1;
    if (curves < 1) {
      fail('A33_VERTEX_ATTACHMENT_GEOMETRY', `${what} has ${vertexCount} vertices, which is not one whole curve`);
      continue;
    }
    // `lengths` is what a `constantSpeed: false` traversal measures with:
    // `lengths[curve]` bounds each curve and the last entry IS the path
    // length. The parser sizes the array from `vertexCount / 3` and copies
    // whatever the file gave, so a short array leaves trailing zeros — and a
    // zero-length curve makes the parser divide the position by it.
    const lengths = path.path?.lengths ?? [];
    let previous = 0;
    for (let c = 0; c < curves; c++) {
      const value = lengths[c];
      if (!Number.isFinite(value) || value <= previous) {
        fail(
          'A33_VERTEX_ATTACHMENT_GEOMETRY',
          `${what} lengths[${c}] is ${String(value)}, and the entry before it was ${previous}. The array is the ` +
            'CUMULATIVE arc length at the end of each of the ' +
            `${curves} curve(s), so it strictly increases; a value that does not means either a zero-length ` +
            'curve (the position is divided by it) or an array shorter than the geometry (the tail reads as 0)',
        );
        break;
      }
      previous = value;
    }
  }
  const slotNames = new Set(slots);
  let endsChecked = 0;
  for (const { placeholder, slot: slotName, end } of clipEnds) {
    endsChecked++;
    if (typeof end !== 'string' || !slotNames.has(end)) {
      fail(
        'A33_VERTEX_ATTACHMENT_GEOMETRY',
        `clipping attachment "${placeholder}" on slot "${slotName}" ends at ${JSON.stringify(end)}, ` +
          'which is not a slot of this skeleton — the clip would run to the bottom of the draw order',
      );
    }
  }
  if (polygons.length === 0 && endsChecked === 0) {
    return skip(
      'A33_VERTEX_ATTACHMENT_GEOMETRY',
      'the skeleton carries no bounding box, clipping attachment or path',
    );
  }
  for (const { what, worldVerticesLength: length, encoding } of polygons) {
    if (!Number.isInteger(length) || length < 6 || length % 2 !== 0) {
      fail(
        'A33_VERTEX_ATTACHMENT_GEOMETRY',
        `${what} loaded worldVerticesLength ${length}; a polygon is an even count of at least 6 (3 vertices). ` +
          'A missing "vertexCount" reads as 0 and takes the polygon with it',
      );
      continue;
    }
    // The vertex run's own coherence is the encoding's, kept with the round trip (the header).
    for (const detail of encoding) fail('A33_VERTEX_ATTACHMENT_GEOMETRY', detail);
  }
}
