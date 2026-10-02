/**
 * The facts cut 4c-2's bodies read, compared fact by fact between the two
 * suppliers, and each derivation the model side makes measured against the
 * runtime's value (issue #1025, step 4c of #380).
 *
 * A verdict line hides most of what a supplier could get wrong: a weight one
 * float32 step off still sums to 1 at four decimals, a Bézier sample above 0
 * on a constraint that rests live changes nothing, a reach that names one
 * constraint too many is invisible on a rig no line fails. So beside the lines
 * (`tools/verdict_gate.ts`, the selftest's `VF02`), the facts themselves are
 * spelled — every value a body reads, and no value it does not — and compared
 * whole, per family (`rigFactsSpelling`). Two things are left out of the
 * spelling, each because no body reads it:
 *
 * - `encoding`, the kept clauses' findings, which only the runtime side has by
 *   design (`src/assertions/facts/mesh_attachments.ts`' 🔒);
 * - a bone-less slider's `scale`, read by A37 only behind `bone`. It is where
 *   the one known disagreement lives — spine-core leaves it at 0 and the
 *   document states 1 (#1027) — and it is counted rather than hidden
 *   (`rigFactsDerivations`' last row).
 *
 * `rigFactsDerivations` then takes each derivation the model side makes — a
 * float32 of a stated number, a link's geometry being its source's, a parser
 * default, `1 / mass`, `1 / fps`, a key's pose field, a property's word, the
 * reach of a timeline naming none — and counts, over the values it produced,
 * how many equal the runtime's at tolerance 0 and how many the document's
 * stated number alone would have matched: the measurement that says each
 * derivation is needed and is the runtime's.
 *
 * Read by the selftest (`VF10`) on every build it validates with a model in
 * hand, and by `tools/verdict_gate.ts` on every recipe — the families through
 * the one walk (`compareFactFamilies`, issue #1054), the derivations here.
 */
import { readModel, sourceOfDoc } from '../src/core/index.ts';
import { runtimeRigFacts } from '../src/validate.ts';
import type { ConstraintEntry, ConstraintFacts, ConstraintTimeline } from '../src/assertions/facts/constraints.ts';
import type { LinkFacts } from '../src/assertions/facts/linked_meshes.ts';
import type { MeshFacts } from '../src/assertions/facts/mesh_attachments.ts';
import type { PolygonFacts } from '../src/assertions/facts/vertex_polygons.ts';
import { modelConstraintFacts, modelConstraintTimelineSources } from '../src/assertions/model/constraints.ts';
import { modelLinkFacts } from '../src/assertions/model/linked_meshes.ts';
import { modelMeshFacts } from '../src/assertions/model/mesh_attachments.ts';
import { modelPolygonFacts } from '../src/assertions/model/vertex_polygons.ts';
import { fileOrderedEntries } from '../src/assertions/model/skin_entries.ts';
import type { ReadDocument } from '../src/assertions/model/parse.ts';
import { isObj, type Json } from '../src/assertions/values.ts';
import type { ModelVertices } from '../src/model.ts';

/** The four families cut 4c-2 added, as one supplier hands them over. */
export interface RigFacts {
  meshes: MeshFacts;
  polygons: PolygonFacts;
  links: LinkFacts;
  constraints: ConstraintFacts;
}

/** The families the spelling compares, each by its own name, so a difference names the family. */
export const RIG_FACT_FAMILIES = ['meshes', 'polygons', 'links', 'constraints', 'timelines'] as const;
export type RigFactFamily = (typeof RIG_FACT_FAMILIES)[number];

/** The model side's facts over a document's text, or `null` where the reader refuses it. */
export function modelRigFacts(modelText: string): { read: ReadDocument; facts: RigFacts } | null {
  let read: ReadDocument;
  try {
    read = { doc: readModel(modelText), json: JSON.parse(modelText) as Json };
  } catch {
    return null;
  }
  return { read, facts: { meshes: modelMeshFacts(read), polygons: modelPolygonFacts(read), links: modelLinkFacts(read), constraints: modelConstraintFacts(read) } };
}

/** The runtime side's facts over a pair, or `null` where spine-core refuses it. */
export function spineRigFacts(skeletonText: string, atlasText: string): RigFacts | null {
  return runtimeRigFacts(skeletonText, atlasText);
}

/** A number as JSON cannot lose it: NaN, the infinities and −0 spelled out. */
const exact = (_key: string, value: unknown): unknown => {
  if (typeof value !== 'number') return value;
  if (Number.isNaN(value)) return 'NaN';
  if (Object.is(value, -0)) return '-0';
  return Number.isFinite(value) ? value : String(value);
};

/**
 * How many leading channels of a constraint timeline a body reads: the six
 * mixes of a transform frame, the three of a path `mix` frame, none of a
 * `reset`, and the first of every other (an ik frame's `mix`, the one value
 * of the rest) — `switchedOn`'s `channels` at each of its callers.
 */
export function channelsRead(t: ConstraintTimeline): number {
  if (t.word === 'reset') return 0;
  if (t.kind === 'transform') return 6;
  if (t.kind === 'path' && t.word === 'mix') return 3;
  return 1;
}

/** One constraint as the spelling holds it: a bone-less slider's `scale` left out (the header). */
function constraintSpelled(c: ConstraintEntry): unknown {
  if (c.slider === undefined || c.slider.bone !== null) return c;
  return { ...c, slider: { ...c.slider, scale: '(not read: no bone)' } };
}

/** Every value a body reads of each family, as one string per family. */
export function rigFactsSpelling(f: RigFacts): Record<RigFactFamily, string> {
  const spell = (value: unknown): string => JSON.stringify(value, exact);
  return {
    meshes: spell({
      bones: f.meshes.bones,
      // The size A14 reads joined this family with issue #1054 (cut 4c-1's `SkinMeshFacts` stated it apart); the bones A15 reads are the weights' (`weightBonesOf`), spelled with them.
      meshes: f.meshes.meshes.map((m) => [m.name, m.skin, m.slot, m.slotBone, m.placeholder, m.link?.source ?? null, [...m.triangles], m.worldVerticesLength, [...m.regionUVs], m.hullLength, m.width, m.height, m.weights?.map((v) => v.map((b) => [b.bone, b.weight])) ?? null]),
    }),
    polygons: spell({
      polygons: f.polygons.polygons.map((p) => [p.what, p.worldVerticesLength, p.path === null ? null : [p.path.closed, [...p.path.lengths]]]),
      clipEnds: f.polygons.clipEnds.map((c) => [c.placeholder, c.slot, c.end]),
      slots: f.polygons.slots,
    }),
    links: spell(f.links.links.map((l) => [l.skin, l.slot, l.placeholder, l.source])),
    constraints: spell({ animations: f.constraints.animations, constraints: f.constraints.constraints.map(constraintSpelled), pathSlots: f.constraints.pathSlots }),
    timelines: spell(
      f.constraints.timelines.map((t) => [
        t.animation,
        t.kind,
        t.word,
        t.constraint,
        t.reach,
        t.frames.map((fr) => [fr.time, fr.value]),
        Array.from({ length: channelsRead(t) }, (_, c) => t.channelValues(c)),
        t.posed === undefined ? null : t.frames.map((fr) => (t.posed as (v: number) => number)(fr.value)),
      ]),
    ),
  };
}

/** One derivation's count: how many values it produced, how many equal the runtime's, and how many the stated number alone would have matched (`null` where the document states none). */
export interface DerivationTally {
  derivation: string;
  values: number;
  equal: number;
  statedAlone: number | null;
}

/** Tallies of one name, summed. */
export function sumTallies(into: Map<string, DerivationTally>, more: readonly DerivationTally[]): void {
  for (const t of more) {
    const held = into.get(t.derivation) ?? { derivation: t.derivation, values: 0, equal: 0, statedAlone: t.statedAlone === null ? null : 0 };
    held.values += t.values;
    held.equal += t.equal;
    if (held.statedAlone !== null && t.statedAlone !== null) held.statedAlone += t.statedAlone;
    into.set(t.derivation, held);
  }
}

/** The physics fields a body reads that a record may leave to the parser, and where each lands in the facts. */
const PHYSICS_READ: ReadonlyArray<[string, (p: NonNullable<ConstraintEntry['physics']>) => number]> = [
  ['x', (p) => p.components.x],
  ['y', (p) => p.components.y],
  ['rotate', (p) => p.components.rotate],
  ['scaleX', (p) => p.components.scaleX],
  ['shearX', (p) => p.components.shearX],
  ['mix', (p) => p.setup.mix],
  ['strength', (p) => p.setup.strength],
  ['damping', (p) => p.setup.damping],
];

/**
 * Each derivation the model side makes, counted over one build: `read` is the
 * document, `runtime` and `model` the two sides' facts. Values are aligned by
 * position, which holds where the spelling of the family agrees (a family
 * that does not is the spelling's fault to name, and its tallies here are not
 * meaningful).
 */
export function rigFactsDerivations(read: ReadDocument, runtime: RigFacts, model: RigFacts): DerivationTally[] {
  const out: DerivationTally[] = [];
  const tally = (derivation: string, statedKnown: boolean): DerivationTally => {
    const t = { derivation, values: 0, equal: 0, statedAlone: statedKnown ? 0 : null };
    out.push(t);
    return t;
  };
  const same = (a: unknown, b: unknown): boolean => JSON.stringify(a, exact) === JSON.stringify(b, exact);

  // --- the meshes ------------------------------------------------------------
  const weight = tally('a binding\'s weight: Math.fround of the stated number', true);
  const bone = tally('a binding\'s bone: the index the emitter writes for its name (boneIndexOf)', false);
  const link = tally('a link\'s geometry: its source\'s (sourceOfDoc, meshOf)', true);
  const vertexLength = tally('worldVerticesLength: uvs.length of a mesh, twice vertexCount of a polygon', false);
  const hull = tally('hullLength: twice the stated hull', true);
  const source = sourceOfDoc(read.doc);
  const entries = fileOrderedEntries(read).filter((e) => e.record.geometry?.kind === 'mesh' || e.record.geometry?.kind === 'linkedmesh');
  entries.forEach((entry, i) => {
    const r = runtime.meshes.meshes[i];
    const m = model.meshes.meshes[i];
    const g = entry.record.geometry;
    if (r === undefined || m === undefined || g === undefined) return;
    let stated: ModelVertices | string | undefined;
    if (g.kind === 'mesh') stated = g.vertices;
    else if (g.kind === 'linkedmesh') stated = source(g.skin, g.slot, g.source);
    if (g.kind === 'linkedmesh') {
      link.values++;
      if (same([m.triangles, m.worldVerticesLength, m.regionUVs, m.weights?.map((v) => v.map((b) => [b.bone, b.weight]))], [r.triangles, r.worldVerticesLength, r.regionUVs, r.weights?.map((v) => v.map((b) => [b.bone, b.weight]))])) link.equal++;
    }
    vertexLength.values++;
    if (m.worldVerticesLength === r.worldVerticesLength) vertexLength.equal++;
    if (g.kind === 'mesh') {
      hull.values++;
      if (m.hullLength === r.hullLength) hull.equal++;
      if ((g.hull ?? Number.NaN) === r.hullLength) (hull.statedAlone as number)++;
    }
    if (typeof stated === 'object' && stated.weighted && m.weights !== null && r.weights !== null) {
      stated.bindings.forEach((influences, v) => {
        influences.forEach((b, k) => {
          const rb = r.weights?.[v]?.[k];
          const mb = m.weights?.[v]?.[k];
          if (rb === undefined || mb === undefined) return;
          weight.values++;
          bone.values++;
          if (Object.is(mb.weight, rb.weight)) weight.equal++;
          if (Object.is(b.weight, rb.weight)) (weight.statedAlone as number)++;
          if (mb.bone === rb.bone) bone.equal++;
        });
      });
    }
  });
  runtime.polygons.polygons.forEach((r, i) => {
    const m = model.polygons.polygons[i];
    if (m === undefined) return;
    vertexLength.values++;
    if (Object.is(m.worldVerticesLength, r.worldVerticesLength)) vertexLength.equal++;
  });

  // --- the constraints -------------------------------------------------------
  const massInverse = tally('a physics constraint\'s massInverse: 1 / mass (the core\'s record reader)', true);
  const step = tally('a physics constraint\'s step: 1 / fps (the core\'s record reader)', true);
  const unstated = tally('a field the record leaves out: the parser\'s value (the core\'s record readers)', true);
  const runtimeClass = tally('a constraint\'s runtime class: the model side\'s table', false);
  const sliderAnimation = tally('a slider\'s animation: its timeline count and float32 duration (the core\'s reading)', false);
  const sliderScale = tally('a bone-less slider\'s scale, which no body reads (#1027\'s disagreement)', true);
  const jsonConstraints = Array.isArray(read.json.constraints) ? read.json.constraints.filter(isObj) : [];
  runtime.constraints.constraints.forEach((r, i) => {
    const m = model.constraints.constraints[i];
    const stated = jsonConstraints[i] as Json | undefined;
    if (m === undefined || stated === undefined) return;
    runtimeClass.values++;
    if (m.runtimeClass === r.runtimeClass) runtimeClass.equal++;
    if (r.physics !== undefined && m.physics !== undefined) {
      massInverse.values++;
      if (Object.is(m.physics.setup.massInverse, r.physics.setup.massInverse)) massInverse.equal++;
      if (Object.is(stated.mass, r.physics.setup.massInverse)) (massInverse.statedAlone as number)++;
      step.values++;
      if (Object.is(m.physics.step, r.physics.step)) step.equal++;
      if (Object.is(stated.fps, r.physics.step)) (step.statedAlone as number)++;
      for (const [field, of] of PHYSICS_READ) {
        if (stated[field] !== undefined) continue;
        unstated.values++;
        if (Object.is(of(m.physics), of(r.physics))) unstated.equal++;
      }
      for (const [field, pick] of [['mass', (p: typeof r.physics) => p.setup.massInverse], ['fps', (p: typeof r.physics) => p.step]] as const) {
        if (stated[field] !== undefined) continue;
        unstated.values++;
        if (Object.is(pick(m.physics), pick(r.physics))) unstated.equal++;
      }
    }
    if (r.path !== undefined && m.path !== undefined) {
      for (const field of ['mixRotate', 'mixX', 'mixY'] as const) {
        if (stated[field] !== undefined) continue;
        unstated.values++;
        if (Object.is(m.path.setup[field], r.path.setup[field])) unstated.equal++;
      }
    }
    if (r.ik !== undefined && m.ik !== undefined && stated.mix === undefined) {
      unstated.values++;
      if (Object.is(m.ik.mix, r.ik.mix)) unstated.equal++;
    }
    if (r.transform !== undefined && m.transform !== undefined) {
      r.transform.mixes.forEach((rm, c) => {
        const mm = m.transform?.mixes[c];
        if (rm === null || mm === null || mm === undefined || stated[rm.field] !== undefined) return;
        unstated.values++;
        if (Object.is(mm.setup, rm.setup)) unstated.equal++;
      });
    }
    if (r.slider !== undefined && m.slider !== undefined) {
      for (const field of ['loop', 'mix'] as const) {
        if (stated[field] !== undefined) continue;
        unstated.values++;
        if (Object.is(m.slider[field], r.slider[field])) unstated.equal++;
      }
      if (r.slider.bone !== null && stated.scale === undefined) {
        unstated.values++;
        if (Object.is(m.slider.scale, r.slider.scale)) unstated.equal++;
      }
      if (r.slider.bone === null) {
        sliderScale.values++;
        if (Object.is(m.slider.scale, r.slider.scale)) sliderScale.equal++;
        if (Object.is(stated.scale ?? Number.NaN, r.slider.scale)) (sliderScale.statedAlone as number)++;
      }
      sliderAnimation.values++;
      if (same(m.slider.animation, r.slider.animation)) sliderAnimation.equal++;
    }
  });

  // --- the timelines ---------------------------------------------------------
  const frame = tally('a key\'s time and value: Math.fround of the stated numbers (the core\'s timeline readers)', true);
  const bezier = tally('a channel\'s values with a Bézier segment: the keys and bezierPolyline\'s samples', true);
  const reach = tally('the reach of a physics timeline naming none: posedPhysics, asked', false);
  const posed = tally('a physics key\'s pose field: the rule\'s toPose (R1), against the runtime\'s set', true);
  const word = tally('what a timeline keys: the document\'s word, against the runtime\'s Property name', false);
  const sources = modelConstraintTimelineSources(read);
  runtime.constraints.timelines.forEach((r, i) => {
    const m = model.constraints.timelines[i];
    const keys = sources[i]?.keys;
    if (m === undefined || keys === undefined) return;
    word.values++;
    if (m.kind === r.kind && m.word === r.word) word.equal++;
    if (r.constraint < 0) {
      reach.values++;
      if (same(m.reach, r.reach)) reach.equal++;
    }
    r.frames.forEach((rf, k) => {
      const mf = m.frames[k];
      const key = keys[k];
      if (mf === undefined || key === undefined) return;
      frame.values += 2;
      if (Object.is(mf.time, rf.time)) frame.equal++;
      if (Object.is(mf.value, rf.value)) frame.equal++;
      if (Object.is(key.stated.time, rf.time)) (frame.statedAlone as number)++;
      if (Object.is(key.stated.values[0], rf.value)) (frame.statedAlone as number)++;
      if (r.posed !== undefined && m.posed !== undefined) {
        posed.values++;
        if (Object.is(m.posed(mf.value), r.posed(rf.value))) posed.equal++;
        if (Object.is(rf.value, r.posed(rf.value))) (posed.statedAlone as number)++;
      }
    });
    for (let c = 0; c < channelsRead(r); c++) {
      if (!keys.some((key, k) => Array.isArray(key.curve) && k < keys.length - 1)) continue;
      bezier.values++;
      const rv = r.channelValues(c);
      if (same(m.channelValues(c), rv)) bezier.equal++;
      if (same(keys.map((key) => key.values[c]), rv)) (bezier.statedAlone as number)++;
    }
  });
  return out;
}

/**
 * Each derivation's tally over one build (`rigFactsDerivations`), the two
 * sides' facts read here — `null` where spine-core refuses the pair or the
 * reader refuses the document. The families themselves are compared on the
 * one walk (`compareFactFamilies` in `tools/verdict_gate.ts`, issue #1054),
 * which asks every family the moved bodies read the same way; this is the
 * measurement beside it that says each derivation is the runtime's.
 */
export function rigFactsDerivationsOf(skeletonText: string, atlasText: string, modelText: string): DerivationTally[] | null {
  const runtime = spineRigFacts(skeletonText, atlasText);
  const model = modelRigFacts(modelText);
  if (runtime === null || model === null) return null;
  return rigFactsDerivations(model.read, runtime, model.facts);
}
