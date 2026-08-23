/**
 * rigc diff — structural comparison of two skeletons, section by section.
 *
 * The benchmark ladder needs a yardstick, and a yardstick that reports one
 * number is not one. A single "87% match" cannot distinguish a rig with the
 * right skeleton and the wrong timing from a rig with the right timing and the
 * wrong skeleton, and those are opposite diagnoses. So this reports a ratio per
 * MEASURE, grouped into sections, and refuses to combine them: the section
 * ratios are means of their own measures and are labelled as such, and there is
 * no report-wide score at all.
 *
 * Three properties the measures are built to have:
 *
 * 1. **`diff X X` is 1.000 everywhere.** Every measure is a comparison of two
 *    derived quantities, never a judgement, so a file against itself has
 *    nothing to differ on. The CLI has a `--self-check` for exactly this, and
 *    the selftest runs it: a comparison tool that cannot recognise identity is
 *    reporting noise, and noise looks like a small honest gap.
 * 2. **A difference moves as few measures as possible.** Reordering slots must
 *    not disturb the slot-to-bone binding figure, so bindings are compared by
 *    name and order is a separate measure. This is what makes the report
 *    diagnostic rather than merely quantitative.
 * 3. **Name-agnostic figures sit beside name-matched ones.** A candidate that
 *    builds the right tree with its own names scores zero on `parent_by_name`
 *    and full marks on `depth_histogram` / `degree_sequence`. Reporting only
 *    the first would call a correct rig a total failure; reporting only the
 *    second would call any 14-bone tree a match. Both, separately, or neither
 *    is honest.
 *
 *    ⭐ That held at the MEASURE level and not at the SECTION level, which is
 *    where a reader actually looks (issue #21). `bones` rolled eight measures
 *    into one mean, five of them gated on the same one-name-in-common
 *    condition — the naming figure counted five times, not five findings — so
 *    a rig with a structurally identical tree and its own vocabulary read
 *    `bones=0.567` and a reader who did not open the table under it read "the
 *    skeleton is wrong" when the skeleton was right. So `bones` and `slots`
 *    now carry a SECOND, independent comparison in `nameAgnostic`: the same
 *    two skeletons compared with names thrown away entirely.
 *
 *    The two are not a partition of one mean. They are two comparisons of one
 *    section, with their own measure sets, and neither is a subset of the
 *    other — `section.ratio` is unchanged, to the digit, from what it has
 *    always been, so every `bench.json` already on disk stays comparable.
 *    Read them as a pair: name-agnostic 1.000 with name-matched low says the
 *    shape is right and the vocabulary differs; both low says the rig is
 *    wrong; name-agnostic low alone is impossible, since a wrong shape cannot
 *    have right names.
 *
 * Pure JSON reading — no spine-core, no filesystem. Validity is `validate.ts`'s
 * job and this file assumes nothing about it. In particular the name-agnostic
 * measures resolve nothing through the atlas: see `attachments.region_size`.
 */
import { walkTimelines } from './timelines.ts';

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function objs(v: unknown): Json[] {
  return arr(v).filter(isObj);
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** One comparable quantity. `total` 0 means neither side had anything to compare. */
export interface DiffMeasure {
  /** Stable dotted id, e.g. `bones.parent_by_name`. Tests name these. */
  id: string;
  matched: number;
  total: number;
  ratio: number;
  /** What the measure is, in one line, for the human table. */
  what: string;
  /** Set when the measure is vacuous or otherwise needs a caveat. */
  note?: string;
}

/**
 * A second comparison of one section, made without consulting a name anywhere.
 *
 * Its `ratio` is an unweighted mean of its OWN measures and is not comparable,
 * term for term, with the section's — the two sets overlap but neither contains
 * the other. `count` / `depth_histogram` / `degree_sequence` appear in both,
 * once under their section id and once under `<section>.agnostic.*`, so that
 * each report reads on its own without the other open beside it.
 */
export interface DiffAgnostic {
  /** Unweighted mean of the measures below. NOT a quality score either. */
  ratio: number;
  measures: DiffMeasure[];
}

export interface DiffSection {
  name: string;
  /** Unweighted mean of this section's measures. NOT a quality score. */
  ratio: number;
  measures: DiffMeasure[];
  /**
   * The same section compared with names thrown away — `bones` and `slots`
   * only, because they are the two sections whose measures are dominated by
   * name-keyed ones (#21). Absent elsewhere rather than empty: a section with
   * no name-agnostic comparison defined should say so by having none.
   */
  nameAgnostic?: DiffAgnostic;
}

export interface DiffReport {
  sections: DiffSection[];
  /** Raw counts either side, for orientation. Never combined into anything. */
  candidate: Record<string, number>;
  reference: Record<string, number>;
}

// ---------------------------------------------------------------------------
// measure primitives
// ---------------------------------------------------------------------------

const FRAME = 1 / 60;

function ratioOf(matched: number, total: number): number {
  return total === 0 ? 1 : matched / total;
}

function measure(id: string, what: string, matched: number, total: number, note?: string): DiffMeasure {
  return {
    id,
    what,
    matched,
    total,
    ratio: ratioOf(matched, total),
    ...(total === 0 ? { note: note ?? 'neither side has any' } : note ? { note } : {}),
  };
}

/** |A ∩ B| over |A ∪ B| — the set measure. */
function jaccard(id: string, what: string, a: Set<string>, b: Set<string>): DiffMeasure {
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  return measure(id, what, shared, a.size + b.size - shared);
}

/**
 * Histogram intersection: sum of the per-bucket minima over the larger total.
 * Used for every name-agnostic comparison, because it degrades smoothly — one
 * bone in the wrong bucket costs one bone, not the whole measure.
 */
function histogram(id: string, what: string, a: Map<string, number>, b: Map<string, number>): DiffMeasure {
  let shared = 0;
  for (const [k, v] of a) shared += Math.min(v, b.get(k) ?? 0);
  const sum = (m: Map<string, number>) => [...m.values()].reduce((x, y) => x + y, 0);
  return measure(id, what, shared, Math.max(sum(a), sum(b)));
}

/** Longest common subsequence length — order agreement that survives an insert. */
function lcs(a: string[], b: string[]): number {
  const rows: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = a[i - 1] === b[j - 1] ? rows[i - 1][j - 1] + 1 : Math.max(rows[i - 1][j], rows[i][j - 1]);
    }
  }
  return rows[a.length][b.length];
}

function counted(values: Iterable<string>): Map<string, number> {
  const out = new Map<string, number>();
  for (const v of values) out.set(v, (out.get(v) ?? 0) + 1);
  return out;
}

/**
 * Agreement over the names both sides have, scored against the larger roster.
 *
 * ⚠️ The denominator is deliberately `max(candidate, reference)` rather than the
 * shared count. Scoring only the shared names would let a candidate with two of
 * twenty bones report 1.000 for "parents agree", which is the shape of a
 * measurement that flatters whatever is missing.
 */
function agreement<T>(
  id: string,
  what: string,
  a: Map<string, T>,
  b: Map<string, T>,
  same: (x: T, y: T) => boolean,
): DiffMeasure {
  let agree = 0;
  for (const [k, v] of a) {
    const other = b.get(k);
    if (other !== undefined && same(v, other)) agree++;
  }
  return measure(id, what, agree, Math.max(a.size, b.size));
}

function meanRatio(measures: DiffMeasure[]): number {
  return measures.length === 0 ? 1 : measures.reduce((s, m) => s + m.ratio, 0) / measures.length;
}

function sectionOf(name: string, measures: DiffMeasure[], nameAgnostic?: DiffMeasure[]): DiffSection {
  return {
    name,
    ratio: meanRatio(measures),
    measures,
    ...(nameAgnostic === undefined ? {} : { nameAgnostic: { ratio: meanRatio(nameAgnostic), measures: nameAgnostic } }),
  };
}

/**
 * Order agreement over a sequence of SHAPES rather than names — the
 * name-agnostic half of an `order` measure.
 *
 * LCS over the signatures, against the larger roster, exactly as the
 * name-matched `order` measures do it, so the two read on the same scale. Two
 * elements with the same signature are interchangeable here and swapping them
 * is correctly invisible: name-agnostically they ARE the same element. The
 * name-matched `order` measure is what catches that swap.
 */
function orderShape(id: string, what: string, a: string[], b: string[]): DiffMeasure {
  return measure(id, what, lcs(a, b), Math.max(a.length, b.length));
}

// ---------------------------------------------------------------------------
// per-section extraction
// ---------------------------------------------------------------------------

interface BoneFacts {
  order: string[];
  parent: Map<string, string | null>;
  hasLength: Map<string, boolean>;
  hasInherit: Map<string, boolean>;
  depths: Map<string, number>;
  children: Map<string, number>;
}

function boneFacts(root: Json): BoneFacts {
  const bones = objs(root.bones);
  const order: string[] = [];
  const parent = new Map<string, string | null>();
  const hasLength = new Map<string, boolean>();
  const hasInherit = new Map<string, boolean>();
  const children = new Map<string, number>();
  for (const b of bones) {
    const name = str(b.name);
    if (name === null) continue;
    order.push(name);
    parent.set(name, str(b.parent));
    hasLength.set(name, 'length' in b);
    hasInherit.set(name, 'inherit' in b);
    children.set(name, children.get(name) ?? 0);
  }
  for (const [, p] of parent) {
    if (p !== null) children.set(p, (children.get(p) ?? 0) + 1);
  }
  // Depth by walking to the root. A parent declared after its child is invalid
  // Spine, so the walk terminates on any file the parser would accept; the
  // `seen` guard is there so a malformed candidate cannot hang the comparison.
  const depths = new Map<string, number>();
  for (const name of order) {
    let depth = 0;
    const seen = new Set<string>([name]);
    for (let at = parent.get(name) ?? null; at !== null; at = parent.get(at) ?? null) {
      depth++;
      if (seen.has(at)) break;
      seen.add(at);
    }
    depths.set(name, depth);
  }
  return { order, parent, hasLength, hasInherit, depths, children };
}

/**
 * The shape of a bone nothing declares — a slot bound to a name no bone
 * carries. A real answer rather than a gap: it says "this hangs off nothing".
 */
const UNDECLARED = '?';

/**
 * A bone's place in the tree, written without its name: how far it sits from a
 * root, and how many children hang off it. `d1c3` is "one hop down, three
 * children".
 *
 * Nothing else in a bone's declaration is name-free AND structural. `x`, `y`,
 * `rotation`, `scale` are the setup pose, which this section does not compare
 * on either side of the split; `length` and `inherit` are compared by name
 * above and have no name-free counterpart, because there is no way to say
 * WHICH bone is missing its length without naming one.
 */
function boneShape(facts: BoneFacts, name: string): string {
  if (!facts.parent.has(name)) return UNDECLARED;
  return `d${facts.depths.get(name) ?? 0}c${facts.children.get(name) ?? 0}`;
}

function boneShapes(facts: BoneFacts): string[] {
  return facts.order.map((n) => boneShape(facts, n));
}

function diffBones(c: Json, r: Json): DiffSection {
  const a = boneFacts(c);
  const b = boneFacts(r);
  const shared = a.order.filter((n) => b.parent.has(n));
  const max = Math.max(a.order.length, b.order.length);
  const aShapes = boneShapes(a);
  const bShapes = boneShapes(b);
  return sectionOf(
    'bones',
    [
      measure('bones.count', 'how many bones', Math.min(a.order.length, b.order.length), max),
      jaccard('bones.names', 'the bone names themselves', new Set(a.order), new Set(b.order)),
      agreement('bones.parent_by_name', 'each bone hangs off the same parent', a.parent, b.parent, (x, y) => x === y),
      measure(
        'bones.order',
        'the bones are declared in the same order',
        lcs(shared, b.order.filter((n) => a.parent.has(n))),
        max,
      ),
      agreement('bones.length_present', 'a setup `length` is present or absent alike', a.hasLength, b.hasLength, (x, y) => x === y),
      agreement('bones.inherit_present', 'a setup `inherit` is present or absent alike', a.hasInherit, b.hasInherit, (x, y) => x === y),
      histogram(
        'bones.depth_histogram',
        'NAME-AGNOSTIC: as many bones at each depth',
        counted([...a.depths.values()].map(String)),
        counted([...b.depths.values()].map(String)),
      ),
      histogram(
        'bones.degree_sequence',
        'NAME-AGNOSTIC: as many bones with each child count',
        counted([...a.children.values()].map(String)),
        counted([...b.children.values()].map(String)),
      ),
    ],
    // The tree compared as a tree — no name is consulted anywhere below.
    [
      measure('bones.agnostic.count', 'how many bones', Math.min(a.order.length, b.order.length), max),
      histogram(
        'bones.agnostic.depth_histogram',
        'as many bones at each depth',
        counted([...a.depths.values()].map(String)),
        counted([...b.depths.values()].map(String)),
      ),
      histogram(
        'bones.agnostic.degree_sequence',
        'as many bones with each child count',
        counted([...a.children.values()].map(String)),
        counted([...b.children.values()].map(String)),
      ),
      // Strictly stronger than the two above it, and it earns its place for
      // that reason: two trees can hold the same depths and the same child
      // counts while pairing them up differently — a deep leaf and a shallow
      // fork against a shallow leaf and a deep fork. This asks for the pair.
      histogram(
        'bones.agnostic.shape_histogram',
        'as many bones of each depth-and-child-count shape (`d1c3` = one hop down, three children)',
        counted(aShapes),
        counted(bShapes),
      ),
      orderShape(
        'bones.agnostic.order_shape',
        'the bones are declared in the same order of shapes',
        aShapes,
        bShapes,
      ),
    ],
  );
}

interface SlotFacts {
  order: string[];
  bone: Map<string, string | null>;
  attachment: Map<string, string | null>;
  blend: Map<string, string>;
  hasColor: Map<string, boolean>;
  /**
   * `<slot>` -> the TYPE of what it shows in setup: `region`, `mesh`, and so
   * on; `none` when the slot shows nothing; `absent` when it names an
   * attachment no skin carries. The type is name-free — it is *what kind of
   * thing is drawn here*, which survives every rename — while the attachment's
   * own name is compared by `slots.attachment` above.
   */
  setupType: Map<string, string>;
}

/** `<slot>/<attachment>` -> type, over every skin. */
function attachmentTypes(root: Json): Map<string, string> {
  const out = new Map<string, string>();
  for (const skin of objs(root.skins)) {
    if (!isObj(skin.attachments)) continue;
    for (const [slotName, slotMap] of Object.entries(skin.attachments)) {
      if (!isObj(slotMap)) continue;
      for (const [attName, att] of Object.entries(slotMap)) {
        if (!isObj(att)) continue;
        // First skin wins. Every skeleton on the ladder has exactly one skin
        // (`default`), and a per-skin type comparison would need a skin
        // correspondence, which is a naming question by another route.
        if (!out.has(`${slotName}/${attName}`)) out.set(`${slotName}/${attName}`, str(att.type) ?? 'region');
      }
    }
  }
  return out;
}

function slotFacts(root: Json): SlotFacts {
  const order: string[] = [];
  const bone = new Map<string, string | null>();
  const attachment = new Map<string, string | null>();
  const blend = new Map<string, string>();
  const hasColor = new Map<string, boolean>();
  const setupType = new Map<string, string>();
  const types = attachmentTypes(root);
  for (const s of objs(root.slots)) {
    const name = str(s.name);
    if (name === null) continue;
    const setup = str(s.attachment);
    order.push(name);
    bone.set(name, str(s.bone));
    attachment.set(name, setup);
    blend.set(name, str(s.blend) ?? 'normal');
    hasColor.set(name, 'color' in s);
    setupType.set(name, setup === null ? 'none' : (types.get(`${name}/${setup}`) ?? 'absent'));
  }
  return { order, bone, attachment, blend, hasColor, setupType };
}

/** What a slot is, written without a name: what it draws, on what shape of bone. */
function slotShapes(facts: SlotFacts, bones: BoneFacts): string[] {
  return facts.order.map((n) => `${facts.setupType.get(n) ?? 'none'}@${boneShape(bones, facts.bone.get(n) ?? '')}`);
}

function diffSlots(c: Json, r: Json): DiffSection {
  const a = slotFacts(c);
  const b = slotFacts(r);
  const ab = boneFacts(c);
  const bb = boneFacts(r);
  const max = Math.max(a.order.length, b.order.length);
  const aShapes = slotShapes(a, ab);
  const bShapes = slotShapes(b, bb);
  const byPosition = (f: SlotFacts): Map<string, number> =>
    counted(f.order.map((n, i) => `${i}:${f.setupType.get(n) ?? 'none'}`));
  const boundTo = (f: SlotFacts, bones: BoneFacts): Map<string, number> =>
    counted(f.order.map((n) => boneShape(bones, f.bone.get(n) ?? '')));
  return sectionOf(
    'slots',
    [
      measure('slots.count', 'how many slots', Math.min(a.order.length, b.order.length), max),
      jaccard('slots.names', 'the slot names themselves', new Set(a.order), new Set(b.order)),
      measure(
        'slots.order',
        'the slots array IS the draw order, so its order is data',
        lcs(
          a.order.filter((n) => b.bone.has(n)),
          b.order.filter((n) => a.bone.has(n)),
        ),
        max,
      ),
      agreement('slots.bone', 'each slot is bound to the same bone', a.bone, b.bone, (x, y) => x === y),
      agreement('slots.attachment', 'each slot shows the same setup attachment', a.attachment, b.attachment, (x, y) => x === y),
      agreement('slots.blend', 'each slot uses the same blend mode', a.blend, b.blend, (x, y) => x === y),
      agreement('slots.color_present', 'a tint is present or absent alike', a.hasColor, b.hasColor, (x, y) => x === y),
    ],
    [
      measure('slots.agnostic.count', 'how many slots', Math.min(a.order.length, b.order.length), max),
      // Positional on purpose, and paired with the LCS measure below for the
      // same reason `slots.order` is paired with `slots.names`: this one says
      // "position 3 draws a mesh on both sides", the LCS one degrades smoothly
      // when a slot is inserted rather than counting every later slot wrong.
      histogram(
        'slots.agnostic.attachment_types_by_position',
        'the same kind of attachment sits at each position in the draw order',
        byPosition(a),
        byPosition(b),
      ),
      histogram(
        'slots.agnostic.bone_binding_shape',
        'as many slots hang off a bone of each shape (`?` = no such bone is declared)',
        boundTo(a, ab),
        boundTo(b, bb),
      ),
      orderShape(
        'slots.agnostic.order_shape',
        'the draw order is the same order of `<attachment type>@<bone shape>`',
        aShapes,
        bShapes,
      ),
    ],
  );
}

interface AttachmentFact {
  type: string;
  /** uv pairs, i.e. the real vertex count of a mesh. */
  vertices: number | null;
  triangles: number | null;
  weighted: boolean | null;
  hull: number | null;
  /** `<width>x<height>` as stated, or `unstated` — see `attachments.region_size`. */
  size: string;
}

function attachmentFacts(root: Json): { skins: Set<string>; byKey: Map<string, AttachmentFact> } {
  const skins = new Set<string>();
  const byKey = new Map<string, AttachmentFact>();
  for (const skin of objs(root.skins)) {
    const skinName = str(skin.name) ?? 'default';
    skins.add(skinName);
    if (!isObj(skin.attachments)) continue;
    for (const [slotName, slotMap] of Object.entries(skin.attachments)) {
      if (!isObj(slotMap)) continue;
      for (const [attName, att] of Object.entries(slotMap)) {
        if (!isObj(att)) continue;
        const type = str(att.type) ?? 'region';
        const uvs = arr(att.uvs);
        const verticesRun = arr(att.vertices);
        const vertexCount = uvs.length > 0 ? uvs.length / 2 : num(att.vertexCount);
        // Weighted versus unweighted carries no marker: the run is longer than
        // 2 numbers per vertex exactly when it holds bone/weight triples.
        const weighted =
          vertexCount === null || verticesRun.length === 0 ? null : verticesRun.length !== vertexCount * 2;
        byKey.set(`${skinName}/${slotName}/${attName}`, {
          type,
          vertices: type === 'mesh' ? vertexCount : null,
          triangles: type === 'mesh' ? arr(att.triangles).length / 3 : null,
          weighted: type === 'mesh' ? weighted : null,
          hull: type === 'mesh' ? num(att.hull) : null,
          size: num(att.width) !== null && num(att.height) !== null ? `${num(att.width)}x${num(att.height)}` : 'unstated',
        });
      }
    }
  }
  return { skins, byKey };
}

function diffAttachments(c: Json, r: Json): DiffSection {
  const a = attachmentFacts(c);
  const b = attachmentFacts(r);
  const meshes = (m: Map<string, AttachmentFact>) => new Map([...m].filter(([, f]) => f.type === 'mesh'));
  const regions = (m: Map<string, AttachmentFact>) => new Map([...m].filter(([, f]) => f.type === 'region'));
  const am = meshes(a.byKey);
  const bm = meshes(b.byKey);
  const ar = regions(a.byKey);
  const br = regions(b.byKey);
  return sectionOf('attachments', [
    jaccard('attachments.skins', 'the skin names', a.skins, b.skins),
    measure(
      'attachments.count',
      'how many attachments',
      Math.min(a.byKey.size, b.byKey.size),
      Math.max(a.byKey.size, b.byKey.size),
    ),
    jaccard('attachments.names', 'skin/slot/attachment keys', new Set(a.byKey.keys()), new Set(b.byKey.keys())),
    histogram(
      'attachments.type_counts',
      'as many of each attachment type',
      counted([...a.byKey.values()].map((f) => f.type)),
      counted([...b.byKey.values()].map((f) => f.type)),
    ),
    agreement('attachments.mesh_vertices', 'each mesh has the same vertex count', am, bm, (x, y) => x.vertices === y.vertices),
    agreement('attachments.mesh_triangles', 'each mesh has the same triangle count', am, bm, (x, y) => x.triangles === y.triangles),
    agreement('attachments.mesh_weighted', 'each mesh is weighted, or is not, alike', am, bm, (x, y) => x.weighted === y.weighted),
    agreement('attachments.mesh_hull', 'each mesh declares the same hull length', am, bm, (x, y) => x.hull === y.hull),
    // Replaces `attachments.region_size_present` (issue #28), which asked
    // whether each region STATED a size and read near zero on every honest run.
    //
    // The issue's diagnosis was that Spine's exporter omits `width`/`height`
    // when they match the atlas region, so a rigc rig — which always states
    // them (AUTHORING R1/R5) — could never agree. That is not what the corpus
    // says: all twelve reference exports state a size on every one of their 168
    // regions, so there is nothing for an atlas lookup to resolve and the
    // `--atlas` plumbing the issue proposed would be dead code against every
    // rung on the ladder.
    //
    // What the measure actually reported was the naming gap, a third time. It
    // was keyed by `skin/slot/attachment`, so it could never exceed the name
    // overlap: rung 1 read `0/8` where `attachments.names` read `0/16`, and
    // `3/5` where three names matched. That is #21's defect in this section.
    //
    // So it is name-agnostic and numeric instead: do the two rigs agree about
    // how big their regions are? A rig that states a size a differently-named
    // rig also states now agrees, which is what a structural diff is for.
    histogram(
      'attachments.region_size',
      'NAME-AGNOSTIC: as many regions of each stated size (`unstated` is its own size)',
      counted([...ar.values()].map((f) => f.size)),
      counted([...br.values()].map((f) => f.size)),
    ),
  ]);
}

interface ConstraintFact {
  type: string;
  /** Every bone or slot the constraint names, sorted — its wiring. */
  refs: string;
}

function constraintFacts(root: Json): Map<string, ConstraintFact> {
  const out = new Map<string, ConstraintFact>();
  for (const con of objs(root.constraints)) {
    const name = str(con.name);
    if (name === null) continue;
    const refs = new Set<string>();
    for (const b of arr(con.bones)) {
      const s = str(b);
      if (s !== null) refs.add(`bone:${s}`);
    }
    for (const key of ['bone', 'target', 'source', 'slot'] as const) {
      const s = str(con[key]);
      if (s !== null) refs.add(`${key}:${s}`);
    }
    out.set(name, { type: str(con.type) ?? '(none)', refs: [...refs].sort().join(' ') });
  }
  return out;
}

function diffConstraints(c: Json, r: Json): DiffSection {
  const a = constraintFacts(c);
  const b = constraintFacts(r);
  return sectionOf('constraints', [
    measure('constraints.count', 'how many constraints', Math.min(a.size, b.size), Math.max(a.size, b.size)),
    jaccard('constraints.names', 'the constraint names', new Set(a.keys()), new Set(b.keys())),
    histogram(
      'constraints.type_counts',
      'as many of each constraint type',
      counted([...a.values()].map((f) => f.type)),
      counted([...b.values()].map((f) => f.type)),
    ),
    agreement('constraints.type_by_name', 'each constraint is the same type', a, b, (x, y) => x.type === y.type),
    agreement('constraints.refs', 'each constraint names the same bones and slots', a, b, (x, y) => x.refs === y.refs),
  ]);
}

interface AnimationFacts {
  names: string[];
  /** `<anim>` -> last key time. Skeleton JSON has no duration field. */
  duration: Map<string, number>;
  /** `<anim>|<path>` -> 1, one entry per timeline that exists. */
  kinds: Map<string, number>;
  /** `<anim>|<kind>` -> number of keys. */
  keys: Map<string, number>;
  /** `<anim>|linear|stepped|bezier` -> number of keys with that curve. */
  curves: Map<string, number>;
  events: Map<string, number>;
  hasDrawOrder: Map<string, boolean>;
  hasDeform: Map<string, boolean>;
}

function animationFacts(root: Json): AnimationFacts {
  const facts: AnimationFacts = {
    names: [],
    duration: new Map(),
    kinds: new Map(),
    keys: new Map(),
    curves: new Map(),
    events: new Map(),
    hasDrawOrder: new Map(),
    hasDeform: new Map(),
  };
  if (!isObj(root.animations)) return facts;
  for (const name of Object.keys(root.animations)) {
    facts.names.push(name);
    facts.duration.set(name, 0);
    facts.events.set(name, 0);
    facts.hasDrawOrder.set(name, false);
    facts.hasDeform.set(name, false);
  }
  const bump = (m: Map<string, number>, k: string, by = 1) => m.set(k, (m.get(k) ?? 0) + by);
  walkTimelines(root, (path, kind, name, keys) => {
    const anim = path.slice(0, path.indexOf('.'));
    // The path carries the target's name (bone `face`, constraint `probe_ik`),
    // which is compared under bones/constraints already. Here only the SHAPE
    // matters, so the target is dropped and the kind kept.
    bump(facts.kinds, `${anim}|${kind}.${name}`);
    bump(facts.keys, `${anim}|${kind}.${name}`, keys.length);
    if (kind === 'drawOrder' || kind === 'drawOrderFolder') facts.hasDrawOrder.set(anim, true);
    if (kind === 'attachment' && name === 'deform') facts.hasDeform.set(anim, true);
    if (kind === 'event') facts.events.set(anim, (facts.events.get(anim) ?? 0) + keys.length);
    for (const key of keys) {
      if (!isObj(key)) continue;
      const time = num(key.time) ?? 0;
      if (time > (facts.duration.get(anim) ?? 0)) facts.duration.set(anim, time);
      const curve = key.curve;
      const shape = curve === undefined ? 'linear' : curve === 'stepped' ? 'stepped' : Array.isArray(curve) ? 'bezier' : 'other';
      bump(facts.curves, `${anim}|${shape}`);
    }
  });
  return facts;
}

function diffAnimations(c: Json, r: Json): DiffSection {
  const a = animationFacts(c);
  const b = animationFacts(r);
  return sectionOf('animations', [
    measure('animations.count', 'how many animations', Math.min(a.names.length, b.names.length), Math.max(a.names.length, b.names.length)),
    jaccard('animations.names', 'the animation names', new Set(a.names), new Set(b.names)),
    agreement(
      'animations.duration',
      'each animation runs as long (last key time, within one frame)',
      a.duration,
      b.duration,
      (x, y) => Math.abs(x - y) <= FRAME,
    ),
    histogram('animations.timeline_kinds', 'the same timelines exist', a.kinds, b.kinds),
    histogram('animations.key_counts', 'those timelines carry as many keys', a.keys, b.keys),
    histogram('animations.curve_kinds', 'as many linear / stepped / bezier keys', a.curves, b.curves),
    histogram('animations.event_keys', 'as many event firings', a.events, b.events),
    agreement('animations.draw_order', 'a draw-order timeline is present or absent alike', a.hasDrawOrder, b.hasDrawOrder, (x, y) => x === y),
    agreement('animations.deform', 'a deform timeline is present or absent alike', a.hasDeform, b.hasDeform, (x, y) => x === y),
  ]);
}

function eventFacts(root: Json): Map<string, string> {
  const out = new Map<string, string>();
  if (!isObj(root.events)) return out;
  for (const [name, def] of Object.entries(root.events)) {
    const d = isObj(def) ? def : {};
    // The typed payload, in the parser's own defaults (`:469-484`), so that a
    // field written explicitly at its default reads the same as one omitted.
    out.set(
      name,
      JSON.stringify({
        int: num(d.int) ?? 0,
        float: num(d.float) ?? 0,
        string: str(d.string) ?? '',
        audio: str(d.audio) ?? '',
        volume: num(d.volume) ?? 1,
        balance: num(d.balance) ?? 0,
      }),
    );
  }
  return out;
}

function diffEvents(c: Json, r: Json): DiffSection {
  const a = eventFacts(c);
  const b = eventFacts(r);
  return sectionOf('events', [
    jaccard('events.names', 'the event names', new Set(a.keys()), new Set(b.keys())),
    agreement('events.payloads', 'each event carries the same typed payload', a, b, (x, y) => x === y),
  ]);
}

// ---------------------------------------------------------------------------
// the report
// ---------------------------------------------------------------------------

function orientation(root: Json): Record<string, number> {
  const attachments = attachmentFacts(root);
  return {
    bones: objs(root.bones).length,
    slots: objs(root.slots).length,
    skins: objs(root.skins).length,
    attachments: attachments.byKey.size,
    constraints: objs(root.constraints).length,
    animations: isObj(root.animations) ? Object.keys(root.animations).length : 0,
    events: isObj(root.events) ? Object.keys(root.events).length : 0,
  };
}

export function diffSkeletons(candidate: unknown, reference: unknown): DiffReport {
  const c = isObj(candidate) ? candidate : {};
  const r = isObj(reference) ? reference : {};
  return {
    sections: [diffBones(c, r), diffSlots(c, r), diffAttachments(c, r), diffConstraints(c, r), diffAnimations(c, r), diffEvents(c, r)],
    candidate: orientation(c),
    reference: orientation(r),
  };
}

/**
 * Every NAME-MATCHED measure that is not a perfect match, by id. What a test
 * asserts on.
 *
 * The name-agnostic reports are deliberately not folded in here. They are a
 * separate comparison with its own measure set, and a single flattened list
 * would make one edit's footprint depend on how many measures the other report
 * happens to define — which is the opposite of what these assertions are for.
 * `movedAgnosticMeasures` is the other half, and a case pins both.
 */
export function movedMeasures(report: DiffReport): string[] {
  return report.sections.flatMap((s) => s.measures.filter((m) => m.ratio < 1).map((m) => m.id));
}

/** The same, over the name-agnostic reports. Empty when every shape agrees. */
export function movedAgnosticMeasures(report: DiffReport): string[] {
  return report.sections.flatMap((s) => (s.nameAgnostic?.measures ?? []).filter((m) => m.ratio < 1).map((m) => m.id));
}

const fmt = (n: number): string => n.toFixed(3);

/** `bones 0.567 (name-matched) · 1.000 (name-agnostic)`, or just the one figure. */
export function sectionFigures(section: DiffSection): string {
  const matched = `${fmt(section.ratio)} (name-matched)`;
  return section.nameAgnostic === undefined
    ? `${section.name} ${matched}`
    : `${section.name} ${matched} · ${fmt(section.nameAgnostic.ratio)} (name-agnostic)`;
}

function measureLines(measures: DiffMeasure[], strip: number): string[] {
  return measures.map((m) => {
    const counts = `${m.matched}/${m.total}`;
    return `      ${fmt(m.ratio)}  ${m.id.slice(strip).padEnd(28)} ${counts.padEnd(11)} ${m.what}${m.note ? `  — ${m.note}` : ''}`;
  });
}

export function diffLines(report: DiffReport, labels: { candidate: string; reference: string }): string[] {
  const lines: string[] = [];
  lines.push(`  candidate  ${labels.candidate}`);
  lines.push(`  reference  ${labels.reference}`);
  const keys = Object.keys(report.reference);
  lines.push(`  ..         ${keys.map((k) => `${k}=${report.candidate[k]}/${report.reference[k]}`).join('  ')}   (candidate/reference)`);
  lines.push('');
  // Wide enough for `<longest section> (name-agnostic)`, so that a section's two
  // headings line their figures up under each other and read as a pair.
  const head = (label: string, ratio: number, n: number): string =>
    `  ${label.padEnd(21)} mean ${fmt(ratio)}  over ${n} measures`;
  for (const section of report.sections) {
    lines.push(head(section.name, section.ratio, section.measures.length));
    lines.push(...measureLines(section.measures, section.name.length + 1));
    const agnostic = section.nameAgnostic;
    if (agnostic) {
      lines.push('');
      lines.push(
        `${head(`${section.name} (name-agnostic)`, agnostic.ratio, agnostic.measures.length)}` +
          '  — the same two skeletons compared with names thrown away',
      );
      lines.push(...measureLines(agnostic.measures, section.name.length + '.agnostic.'.length));
    }
    lines.push('');
  }
  lines.push('  There is no overall score, on purpose: a section mean is an average of the');
  lines.push('  measures printed under it, and averaging those together would hide which');
  lines.push('  half of a rig is wrong. Read the measures.');
  lines.push('');
  lines.push('  `bones` and `slots` carry two figures because most of their measures are');
  lines.push('  keyed on names, and a candidate is entitled to its own. They are two');
  lines.push('  comparisons, not two halves of one: name-agnostic 1.000 beside a low');
  lines.push('  name-matched figure means the shape is right and the vocabulary differs.');
  return lines;
}
