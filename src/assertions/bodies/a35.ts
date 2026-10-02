/**
 * A35, restated over the emitted text (issue #1060): the clause
 * `validate()` runs in `src/validate.ts`, word for word, over the skeleton JSON — the
 * text rigc wrote, read by rigc's own reader rather than by spine-core's. The
 * round trip's copy is unchanged and runs in `cli.ts build`; this one runs in
 * the gate of the entry that links none of the runtime
 * (`../emitted/index.ts`), and the selftest's `RC28` holds the two to the
 * same lines on every recipe and on this assertion's mutants.
 */
import type { Verdicts } from '../harness.ts';
import { isObj, type Json } from '../values.ts';

/**
 * How long the array a deform key edits is, read off one raw attachment — or
 * `null` when the file does not say.
 *
 * The rule is `readVertices`' own: the attachment's `vertices` is coordinates
 * when its length equals `worldVerticesLength`, and a weight run otherwise. A
 * deform array is therefore one `x, y` pair per **vertex** in the first case and
 * one per **bone influence** (`vertices.length / 3`) in the second — the same
 * count with two different meanings, which is exactly why this measures rather
 * than assumes.
 *
 * `null` for the two shapes that cannot be measured from this object alone: a
 * type with no vertices at all (nothing to deform, and the parser throws on it),
 * and a `linkedmesh`, whose geometry belongs to another attachment.
 */
function deformArrayLength(att: Json): number | null {
  const type = typeof att.type === 'string' ? att.type : 'region';
  let worldVerticesLength: number;
  if (type === 'mesh') {
    if (!Array.isArray(att.uvs)) return null;
    worldVerticesLength = att.uvs.length;
  } else if (type === 'boundingbox' || type === 'clipping' || type === 'path') {
    if (typeof att.vertexCount !== 'number') return null;
    worldVerticesLength = att.vertexCount * 2;
  } else {
    return null;
  }
  if (!Array.isArray(att.vertices)) return null;
  const vertices = att.vertices as unknown[];
  if (vertices.length === worldVerticesLength) return worldVerticesLength;
  // ⚠️ Weighted, and the length is the INFLUENCE COUNT — which is the sum of the
  // per-vertex bone counts, not a division of this array's length. The file
  // holds `boneCount` followed by `boneIndex, x, y, weight` per influence, so a
  // one-bone vertex is FIVE numbers; `readVertices` unpacks that into three
  // numbers per influence, which is where the parser's own `/3*2` comes from and
  // exactly why it cannot be applied to the raw form. Applied here it measured
  // `gallery/flex`'s 77-vertex leaf at 256.667 against its true 154 and put
  // A35's bar two thirds too wide on every weighted mesh — the silence A35
  // exists to break, arriving inside A35.
  //
  // Derived here rather than shared with `src/compile.ts`'s own walk on purpose:
  // the gate re-derives from the emitted file so that it is not checking the
  // compiler's assumptions with the compiler's code. Both had this wrong, which
  // is an argument for a control on each and not for one implementation.
  let influences = 0;
  for (let i = 0; i < vertices.length; ) {
    const n = vertices[i++];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) return null;
    influences += n;
    i += n * 4;
    if (i > vertices.length) return null;
  }
  return influences * 2;
}

export function a35DeformKeysFitTheAttachment({ fail, skip }: Verdicts, raw: Json | null): void {
  if (!raw) return skip('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', 'the skeleton JSON did not parse (A00 owns that failure)');
  if (!isObj(raw.animations)) return skip('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', 'the skeleton declares no animations');
  /** skin name -> slot -> attachment, straight off the raw JSON. */
  const skins = new Map<string, Json>();
  for (const skin of Array.isArray(raw.skins) ? (raw.skins as unknown[]) : []) {
    if (isObj(skin) && typeof skin.name === 'string' && isObj(skin.attachments)) {
      skins.set(skin.name, skin.attachments as Json);
    }
  }
  let sawATimeline = false;
  let measured = 0;
  for (const [animName, anim] of Object.entries(raw.animations as Json)) {
    if (!isObj(anim) || !isObj(anim.attachments)) continue;
    for (const [skinName, slotMap] of Object.entries(anim.attachments as Json)) {
      if (!isObj(slotMap)) continue;
      for (const [slotName, attMap] of Object.entries(slotMap)) {
        if (!isObj(attMap)) continue;
        for (const [attName, timelines] of Object.entries(attMap)) {
          if (!isObj(timelines) || !Array.isArray(timelines.deform)) continue;
          sawATimeline = true;
          const at = `animation "${animName}" deform ${skinName}/${slotName}/${attName}`;
          const attachment = isObj(skins.get(skinName)?.[slotName])
            ? ((skins.get(skinName)![slotName] as Json)[attName] as unknown)
            : undefined;
          if (!isObj(attachment)) {
            fail(
              'A35_DEFORM_KEYS_FIT_THE_ATTACHMENT',
              `${at}: skin "${skinName}" has no attachment "${attName}" on slot "${slotName}"; the parser throws ` +
                '`Timeline attachment not found`',
            );
            continue;
          }
          const length = deformArrayLength(attachment);
          if (length === null) {
            // A linked mesh takes its geometry from another attachment, so the
            // raw file cannot state this one's length. Saying nothing beats
            // inventing a bound: an assertion with a default is how "nothing to
            // measure" becomes a measurement of the wrong thing.
            continue;
          }
          measured++;
          const keys = timelines.deform as unknown[];
          if (keys.length === 0) {
            fail('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', `${at}: the key array is empty; the parser skips the timeline in silence`);
            continue;
          }
          keys.forEach((key, k) => {
            if (!isObj(key)) {
              fail('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', `${at} key ${k}: not an object`);
              return;
            }
            const vertices = key.vertices;
            if (vertices === undefined || vertices === null) return; // "back to setup" — nothing to fit
            if (!Array.isArray(vertices)) {
              fail('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', `${at} key ${k}: vertices is ${JSON.stringify(vertices)}, not an array`);
              return;
            }
            const offset = key.offset === undefined ? 0 : key.offset;
            if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
              fail('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', `${at} key ${k}: offset is ${JSON.stringify(key.offset)}`);
              return;
            }
            // ⛔ No parity clause here, and the header says why: an odd `offset`
            // and an odd-length run are both what a trimmed editor export looks
            // like, and the parser has no pair arithmetic to be misaligned
            // against (#262).
            if (offset + vertices.length > length) {
              fail(
                'A35_DEFORM_KEYS_FIT_THE_ATTACHMENT',
                `${at} key ${k}: the run covers ${offset}..${offset + vertices.length} of a ${length}-long deform ` +
                  'array; everything past the end is copied into a Float32Array and dropped without a word',
              );
            }
            for (const n of vertices as unknown[]) {
              if (typeof n !== 'number' || !Number.isFinite(n)) {
                fail('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', `${at} key ${k}: the run holds a non-finite value ${JSON.stringify(n)}`);
                break;
              }
            }
          });
        }
      }
    }
  }
  if (!sawATimeline) return skip('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', 'no animation carries a deform timeline');
  if (measured === 0) {
    return skip(
      'A35_DEFORM_KEYS_FIT_THE_ATTACHMENT',
      'every deform timeline here keys an attachment whose vertex count the raw file does not state (a linked mesh)',
    );
  }
}
