/**
 * What the deform survey reads of a skeleton's STRUCTURE — as opposed to what
 * it reads off a posed one — behind one interface, and the model document's
 * implementation of it (issue #1019, step 4b of issue #380).
 *
 * ## Why there are two readers
 *
 * The survey (`src/deformmeasure.ts`) poses a skeleton and measures what each
 * deform key does to it, and its posing has run through rigc's own core since
 * issue #969. Everything else it read was still spine-core's: the animations
 * and their deform timelines, each key's time and expanded vertex array, the
 * runtime's curve storage, which slot a timeline names and which other slots it
 * reaches, which skin holds the mesh, and each slider's settings — so `explain`
 * on a rigc build parsed the pair through the runtime to learn what the model
 * document it carries already states. This module states those reads once
 * (`SurveyStructure`), and gives the model document's reading of them
 * (`modelStructure`). The runtime's reading stays in `src/deformmeasure.ts`,
 * which links spine-core; the survey's body is written once, against the
 * interface, and the survey's record names which pair it ran through.
 *
 * ## What the model states, and what is derived from it — each rule measured
 *
 * Every read below was compared with spine-core's, value for value at
 * tolerance 0 (`tools/survey_hashes.ts structure` over the nineteen recipes
 * `tools/emit_hashes.ts` generates; the deform-core suite's `DM12` over the
 * gallery's builds and 80 hand-written rigs — sliders, second skins and linked
 * meshes in slots of their own among them). Where the model holds the
 * runtime's value as it is, the reader passes it on; where it holds the value
 * the runtime COMPUTED from, the computation is one rigc already runs — the
 * core's, measured against the runtime for posing, or the emitter's own order —
 * and not a second copy. Each derivation, with how often the stated value alone
 * would have been the runtime's on the nineteen:
 *
 * - **A key's time** is the float32 of the stated time (`CoreDeformKey.time`,
 *   which the core's reader stores) — the runtime's `frames` are a
 *   `Float32Array`. The stated double was the runtime's on 43 of 88 keys.
 * - **A key's vertex array** is what the runtime holds for the key, not the
 *   run the document states: positions unweighted (each the float32 sum of the
 *   setup coordinate and the offset), offsets weighted (each float32), the run
 *   placed at its `offset` into the attachment's whole array and zeros (setup
 *   positions, unweighted) around it — `heldArray` in `./core/deform.ts`. The
 *   stated run was the runtime's array on 0 of 88.
 * - **A Bézier segment's polyline** is the nine points the runtime samples into
 *   its curve storage: the cubic through the key's four handles, from the key's
 *   stated time at fraction 0 to the next key's at a far end of `0.99999999` —
 *   `bezierPolyline` with `DEFORM_CURVE_END`, the core's deform curve. The four
 *   handles are, of course, never the eighteen numbers (0 of 23).
 * - **The animations' order** is the Spine file's, which is not the model's:
 *   the emitter keys `animations` in the editor's order over the model's names
 *   (`editorAnimationOrder` in `src/compile.ts`, the one call `emitAnimations`
 *   is handed), and the survey iterates the file's order. The model's own order
 *   was the file's on 14 of 19 rows. Since issue #1026 a `rigc-compiled/3`
 *   document states that order (`editorOrder.animations`, computed by the
 *   same function at compile time) and the survey reads it; a `/2` or `/1`
 *   document's is derived by that function (`fileAnimationOrder`), which
 *   since issue #1034 returns the file's order — integer-like names first, as
 *   an object keys them, where the comparator alone put `-a` before `5`.
 * - **An animation's deform timelines** are in the order the file keys them:
 *   the model's, with each of the three levels (skin, slot, attachment) put
 *   through `keyedOrder` (`attachmentTimelinesInFileOrder`, issue #1034) —
 *   the model's own order on every name that is not integer-like. The sliders
 *   the file keeps from the model.
 * - **The skins** are in the file's order (`fileSkinOrder`, issue #1034): the
 *   order a `/3` document states, else the emitter's `editorSkinOrder`. This
 *   said, until #1034, that the file keeps a skin's order from the model; the
 *   emitter sorts the skins (`default` first, the rest by the editor's
 *   comparator), and a probe declaring `default, 5, 10, -a, 2b, 01` read
 *   `default, -a, 01, 2b, 5, 10` off spine-core and the declared order off the
 *   model — no row had carried a set the comparator moves.
 * - **A slider's duration** is the runtime's (`CoreAnimationTimelines.duration`:
 *   the last key time of every timeline, float32), not the document's declared
 *   one, which was the runtime's on 1 of 2.
 * - **The slots a deform reaches besides its own** (`timelineSlots`) are the
 *   slots of every linked mesh whose source is the deformed record and which
 *   plays its timelines (`timelines: true`) — the rule `./core/deform.ts`'s
 *   *Which slot a deform timeline moves* measured. The survey reads them as a
 *   set: whether any of them draws the mesh, and their slot timelines' key
 *   times. No corpus row has one; `DM12`'s linked rigs do, on 20 of 20.
 *
 * ⛔ Nothing here defaults a value the document does not state: a record the
 * timeline names that the document does not hold, or an order the editor's
 * comparator cannot settle, is a `CoreInputError` naming it — and the survey's
 * seam then falls back to spine-core naming why, as the posing does.
 *
 * ## Purity
 *
 * Nothing from the Spine runtime package: what the runtime reader needs to
 * carry beside these handles (the parsed objects themselves) is kept by that
 * reader, in `src/deformmeasure.ts`.
 */
import { CompileError } from './errors.ts';
import { fileAnimationOrder, fileSkinOrder, keyedOrder, skinsInFileOrder } from './compile.ts';
import { bezierPolyline } from './core/animation.ts';
import { DEFORM_CURVE_END, heldArray, type CoreAttachmentTimeline, type CoreDeformKey } from './core/deform.ts';
import type { DialBoneField } from './core/hooks.ts';
import { CoreInputError, type CompiledDocument, type CoreAnimation, type CoreAttachment } from './core/index.ts';

/** The record a mesh is in the model document — the identity a deform timeline keys and the core poses by. */
export interface SurveyRecord {
  skin: string;
  slot: string;
  placeholder: string;
}

/** A skin, as the survey wears it. One handle per skin: the survey keys its caches on the handle. */
export interface SurveySkin {
  readonly name: string;
}

/** A mesh a deform timeline moves, as far as the survey reads it. */
export interface SurveyMesh {
  /** The attachment's name — the record's stated `name`, else its placeholder. */
  readonly name: string;
  readonly triangles: ArrayLike<number>;
  /** Two numbers per vertex. */
  readonly worldVerticesLength: number;
  /** Whether its vertices are bound to bones (`MeshAttachment.bones !== null`). */
  readonly weighted: boolean;
  /** The other slots the deform reaches (`Attachment.timelineSlots`), read as a set. */
  readonly timelineSlots: readonly number[];
  /** The model record it is, or `null` when no skin holds it — the core then refuses to pose it, by name. */
  readonly record: SurveyRecord | null;
}

/** How the runtime gets from one key's geometry to the next. */
export type SurveyCurve = { kind: 'linear' } | { kind: 'stepped' } | { kind: 'bezier'; points: ArrayLike<number> };

/** One deform timeline of one animation. */
export interface SurveyDeformTimeline {
  /** The slot it is filed under, by index into `SurveyStructure.slotName`. */
  readonly slotIndex: number;
  /** The mesh it moves, or `null` when the attachment has a vertex array and no triangles (a bounding box, a clipping polygon, a path). */
  readonly mesh: SurveyMesh | null;
  /** Each key's time, as the runtime stores it. */
  readonly frames: ArrayLike<number>;
  /** Key `frame`'s vertex array, as the runtime holds it. */
  vertices(frame: number): ArrayLike<number> | undefined;
  /** The curve from key `frame` to key `frame + 1`. */
  curve(frame: number): SurveyCurve;
  /** The skin that holds the mesh, by name and handle (`null` when none does), and the placeholder the timeline names. */
  placement(): { skin: string; holder: SurveySkin | null; placeholder: string };
}

/** One animation, as far as the survey reads it. */
export interface SurveyAnimation {
  readonly name: string;
  /** Its deform timelines, in the runtime's order. */
  readonly deforms: readonly SurveyDeformTimeline[];
  /** Every key time of every timeline filed under one of `slots` — the times a slot's visibility can change at. */
  slotKeyTimes(slots: ReadonlySet<number>): number[];
}

/**
 * One slider constraint, as far as the survey reads it.
 *
 * ⚠️ `stated`, `reader`, `from`, `to` and `scale` are the dial's mapping and are
 * read only for a slider with a `bone`: a bone-less one's dial is its time. The
 * two readers part there and nothing reads the difference — spine-core sets no
 * property on a bone-less slider and leaves its `scale` at 0, where the model
 * document states the parser's 1 (measured, `tools/survey_hashes.ts structure`).
 */
export interface SurveySlider {
  readonly name: string;
  /** Its mix at setup. */
  readonly mix: number;
  /** The animation it applies, by name. */
  readonly animation: string;
  /** That animation's duration, as the runtime computes it. */
  readonly duration: number;
  /** Its driving bone, or `null` on the bone-less form. */
  readonly bone: string | null;
  readonly local: boolean;
  /** The bone field its property reads — `null` on a reader this file does not know. */
  readonly stated: DialBoneField | null;
  /** What that reader is called, for a report that has to name an unknown one. */
  readonly reader: string;
  /** `from` — the property value at which the animation's time is `to`. */
  readonly from: number;
  /** `to`. */
  readonly to: number;
  readonly scale: number;
  readonly loop: boolean;
}

/** Everything the survey reads of a skeleton's structure. */
export interface SurveyStructure {
  /** Every skin, one handle each, in the skeleton's order — not read by the survey, which wears the skin a timeline names; the instruments walk it. */
  readonly skins: readonly SurveySkin[];
  /** In the runtime's order. */
  readonly animations: readonly SurveyAnimation[];
  /** In the skeleton's constraint order. */
  readonly sliders: readonly SurveySlider[];
  /** A slot's name, or `#<index>` for an index that is not a slot. */
  slotName(index: number): string;
  /** How many skins carry this name — the core wears a skin by its name, so two of one name cannot be posed. */
  skinsNamed(name: string): number;
}

/** The bone field each rig-spec property reads. */
const PROPERTY_FIELD: Record<string, DialBoneField> = { rotate: 'rotation', x: 'x', y: 'y', scaleX: 'scaleX', scaleY: 'scaleY', shearY: 'shearY' };

/** The model document's reading of the survey's structure (the header). */
export function modelStructure(doc: CompiledDocument): SurveyStructure {
  const slotIndex = new Map(doc.slots.map((s, i) => [s.name, i] as const));
  const skinHandles = new Map<string, SurveySkin>();
  const skinOf = (name: string): SurveySkin | null => {
    if (!doc.skins.some((k) => k.name === name)) return null;
    let handle = skinHandles.get(name);
    if (handle === undefined) {
      handle = { name };
      skinHandles.set(name, handle);
    }
    return handle;
  };
  const recordAt = (skin: string, slot: string, placeholder: string): CoreAttachment | undefined => doc.skins.find((k) => k.name === skin)?.attachments[slot]?.[placeholder];
  /** The slots of every linked mesh that plays this record's timelines (the header's last rule). */
  const linkedSlots = (record: SurveyRecord): number[] => {
    const out: number[] = [];
    for (const skin of doc.skins) {
      for (const [slot, table] of Object.entries(skin.attachments)) {
        for (const entry of Object.values(table)) {
          const g = entry.geometry;
          if (g?.kind !== 'linkedmesh' || entry.timelines !== true) continue;
          if (g.skin !== record.skin || g.slot !== record.slot || g.source !== record.placeholder) continue;
          const at = slotIndex.get(slot);
          if (at !== undefined && !out.includes(at)) out.push(at);
        }
      }
    }
    return out;
  };
  const meshes = new Map<string, SurveyMesh>();
  const meshOf = (t: CoreAttachmentTimeline): SurveyMesh | null => {
    const key = `${t.skin}/${t.slot}/${t.attachment}`;
    const already = meshes.get(key);
    if (already !== undefined) return already;
    const entry = recordAt(t.skin, t.slot, t.attachment);
    if (entry === undefined) throw new CoreInputError(`the deform timeline ${key} names no record of the model document`);
    const g = entry.geometry;
    if (g?.kind !== 'mesh') return null;
    const record = { skin: t.skin, slot: t.slot, placeholder: t.attachment };
    const mesh: SurveyMesh = {
      name: entry.name ?? t.attachment,
      triangles: g.triangles,
      worldVerticesLength: g.vertices.weighted ? 2 * g.vertices.bindings.length : g.vertices.xy.length,
      weighted: g.vertices.weighted,
      timelineSlots: linkedSlots(record),
      record,
    };
    meshes.set(key, mesh);
    return mesh;
  };
  const deformOf = (t: CoreAttachmentTimeline, keys: readonly CoreDeformKey[]): SurveyDeformTimeline => {
    const at = slotIndex.get(t.slot);
    if (at === undefined) throw new CoreInputError(`the deform timeline ${t.skin}/${t.slot}/${t.attachment} names slot "${t.slot}", which is not a slot of the model document`);
    const mesh = meshOf(t);
    const entry = recordAt(t.skin, t.slot, t.attachment);
    const g = entry?.geometry;
    const vertices = g !== undefined && g.kind !== 'region' && g.kind !== 'linkedmesh' ? g.vertices : null;
    const held = new Map<number, number[]>();
    return {
      slotIndex: at,
      mesh,
      frames: keys.map((k) => k.time),
      vertices: (frame) => {
        const key = keys[frame];
        if (key === undefined || vertices === null) return undefined;
        let array = held.get(frame);
        if (array === undefined) {
          array = heldArray(vertices, key);
          held.set(frame, array);
        }
        return array;
      },
      curve: (frame) => {
        const a = keys[frame];
        const b = keys[frame + 1];
        if (a === undefined || b === undefined) throw new CoreInputError(`the deform timeline ${t.skin}/${t.slot}/${t.attachment} has no segment after key ${frame}`);
        if (a.curve === 'linear') return { kind: 'linear' };
        if (a.curve === 'stepped') return { kind: 'stepped' };
        const c = a.curve;
        return { kind: 'bezier', points: bezierPolyline(a.stated, 0, c[0], c[1], c[2], c[3], b.stated, DEFORM_CURVE_END) };
      },
      placement: () => ({ skin: t.skin, holder: skinOf(t.skin), placeholder: t.attachment }),
    };
  };
  const animationOf = (a: CoreAnimation): SurveyAnimation => {
    const deforms: SurveyDeformTimeline[] = [];
    for (const t of attachmentTimelinesInFileOrder(a.timelines.attachments)) if (t.deform !== null) deforms.push(deformOf(t, t.deform));
    return {
      name: a.name,
      deforms,
      slotKeyTimes: (slots) => {
        const times: number[] = [];
        for (const target of a.timelines.slots) {
          const at = slotIndex.get(target.name);
          if (at === undefined || !slots.has(at)) continue;
          for (const tl of target.timelines) for (const k of tl.keys) times.push(k.time);
        }
        for (const t of a.timelines.attachments) {
          const at = slotIndex.get(t.slot);
          if (at === undefined || !slots.has(at)) continue;
          for (const k of [...(t.deform ?? []), ...(t.sequence ?? [])]) times.push(k.time);
        }
        return times;
      },
    };
  };
  // The order the Spine file lists the animations in (`fileAnimationOrder`,
  // issue #1034): stated by a `rigc-compiled/3` document (`editorOrder`, issue
  // #1026), and derived for a `/2` or `/1` one, which does not state it, by the
  // emitter's own rule — integer-like names first, as the file keys them.
  let order: readonly string[];
  try {
    order = fileAnimationOrder(doc);
  } catch (err) {
    if (!(err instanceof CompileError)) throw err;
    throw new CoreInputError(`the animations' order in the Spine file is not settled by the model's names — ${err.message}`);
  }
  const animations = order.map((name) => {
    const a = doc.animations.find((x) => x.name === name);
    if (a === undefined) throw new CoreInputError(`the editor's order named animation "${name}", which is not in the model document`);
    return animationOf(a);
  });
  const sliders: SurveySlider[] = [];
  for (const c of doc.constraints) {
    const r = c.record;
    if (c.kind !== 'slider' || r?.kind !== 'slider') continue;
    sliders.push({
      name: r.name,
      mix: r.mix,
      animation: r.animation,
      duration: r.timelines.duration,
      bone: r.bone,
      local: r.local,
      stated: PROPERTY_FIELD[r.property] ?? null,
      reader: r.property,
      from: r.from,
      to: r.to,
      scale: r.scale,
      loop: r.loop,
    });
  }
  // The skins in the order the Spine file lists them (`fileSkinOrder`, issue #1034), as the runtime's structure lists its skins:
  // stated by a `/3` document, derived for a `/2` or `/1` one by the emitter's rule, which a comparator-moved name set shows.
  let skins: CompiledDocument['skins'];
  try {
    skins = skinsInFileOrder(doc.skins, fileSkinOrder(doc)).map((walk) => walk.skin);
  } catch (err) {
    if (!(err instanceof CompileError)) throw err;
    throw new CoreInputError(`the skins' order in the Spine file is not settled by the model's names — ${err.message}`);
  }
  return {
    skins: skins.flatMap((k) => {
      const handle = skinOf(k.name);
      return handle === null || skins.find((x) => x.name === k.name) !== k ? [] : [handle];
    }),
    animations,
    sliders,
    slotName: (index) => doc.slots[index]?.name ?? `#${index}`,
    skinsNamed: (name) => doc.skins.filter((k) => k.name === name).length,
  };
}

/**
 * An animation's attachment timelines in the order the Spine file keys them
 * (issue #1034): the emitter writes `attachments` as three nested objects —
 * skin, slot, attachment — each filled in the model's order, and an object
 * lists an integer-like key first (`keyedOrder`). So the model's list is
 * grouped skin by skin and slot by slot in the order each first appears, and
 * each level put through `keyedOrder`. Measured on a build whose deform
 * timelines are filed under slots `10`, `5`, `-a` in the model: the file and
 * spine-core list `5, 10, -a`.
 */
function attachmentTimelinesInFileOrder(timelines: readonly CoreAttachmentTimeline[]): CoreAttachmentTimeline[] {
  const firsts = (names: readonly string[]): string[] => keyedOrder(names.filter((name, i) => names.indexOf(name) === i));
  const out: CoreAttachmentTimeline[] = [];
  for (const skin of firsts(timelines.map((t) => t.skin))) {
    const inSkin = timelines.filter((t) => t.skin === skin);
    for (const slot of firsts(inSkin.map((t) => t.slot))) {
      const inSlot = inSkin.filter((t) => t.slot === slot);
      for (const attachment of firsts(inSlot.map((t) => t.attachment))) out.push(...inSlot.filter((t) => t.attachment === attachment));
    }
  }
  return out;
}
