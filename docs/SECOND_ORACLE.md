# The second oracle — rigc's own core, admitted construct by construct against spine-core

**Status: started 2026-09-29 by the owner's call** (issue #380, the start gate of its
2026-09-17 comment); steps 0a–3 landed by 2026-10-01 and shipped in 1.6.1 (1.6.0 was
tagged and never served, #1003); step 4 is the owner's and has not started (§6). This
page is the design. #380 carries the history of the argument,
including the two shapes it rejected on 2026-09-04, which stay rejected;
[ROADMAP.md](../ROADMAP.md) *What changes the frame* is the frame — *the milestone is
not the second backend, it is the second oracle.*

---

## 1. The sentence

A posing core of rigc's own — `src/core/`, pure, importing nothing from
`@esotericsoftware/spine-core` — that reads rigc's own **compiled model** and poses it.
That model exists since 2026-09-29: step 0a measured that `compile.ts` built the Spine
objects directly — 14 `Spine*` types, 111 references, the 4.3 spellings applied in the
constructors, and 24 sites that read those objects back
([COMPILED_MODEL.md](COMPILED_MODEL.md), §1.4 and *The finding*) — and step 1 changed
how `compile` builds, in six cuts, each landing under byte identity of every Spine file
on every corpus (§6). `build` now writes `skeleton.model.json` (`rigc-compiled/1`)
beside the Spine pair, the Spine emitter (`src/emit_spine.ts`) is the one writer of
Spine data, and `compile.ts` names no Spine shape, held by `MD02`/`MD03`. The core
poses that document — since step 2 a description of `src/core/` rather than a target,
shipped in 1.6.1 (§5, §6): bones with their inherit modes, slots and colours, every attachment kind's
world vertices, deform, draw order, clipping, events, and the five constraint kinds; such
that for **every spec in every corpus**, the pose our core produces from the compiled
model equals the pose spine-core produces from the Spine backend's emission of the same
spec, at the oracle's reading of *identical* (§4). The Spine backend does not change.
spine-core stays the oracle it is today, and becomes in addition the yardstick our core
is measured against.

## 2. Two readings of "our own core", and the one taken

| | reads | what it is |
| --- | --- | --- |
| **R1** | Spine 4.3 skeleton data | a runtime for Spine data written by someone other than Esoteric Software |
| **R2** | rigc's compiled model | a runtime for rigc's own format; Spine data reaches it through `ingest` and the compiler |

**R2 is taken.** The reasons, in order of weight:

1. It is the shape #380 settled on 2026-09-04 (*two backends, one core; the licence sits
   on exactly one of them*), with the rejected shapes written down. Nothing measured
   since has contradicted it.
2. It needs no position on third-party playback of Spine data. Whether such a player is
   something this project should be is a licence-posture question; the tree cannot
   answer it and the owner has not taken it. R2 never asks it: the only thing that plays
   Spine data here is spine-core.
3. The instrument is the same either way (§4), so nothing built under R2 is lost if R1 is
   ever wanted.
4. R1 remains reachable from R2 through `ingest`: the 1.0 exam measured `ingest → build`
   pose-identical to the editor's own export on production rigs
   ([ROADMAP.md](../ROADMAP.md), *1.0 — claimed*), so a Spine file our core needs to
   pose is a spec first.

What R2 costs, stated: a corpus row enters through `ingest`, so an ingest `BLOCK` or
`LOSS` on that row is a **HOLE** for the constructs it would have exercised, named per row,
never a pass.

## 3. What the core must not be

**Not a port of spine-core.** The licence shipped with the package this repository pins
says, in its first paragraph, that *"creating derivative works of the Spine Runtimes"* is
permitted on the condition that *"each user of the Products must obtain their own Spine
Editor license"* (`node_modules/@esotericsoftware/spine-core/LICENSE`, dated April 5,
2025). A port is a derivative work, so a ported core would move nothing: it would carry
the same licence as the link it replaced, and a copy of an oracle is not a second oracle.

The working rule, until the owner states another: the core is written from the compiled
model's own semantics and from **measured behaviour**. A squad writing it may run
spine-core and read what it outputs, may read the public format and runtime
documentation, and may read this repository's own [SPEC_COVERAGE.md](SPEC_COVERAGE.md);
it does not open spine-core's source to write from. The brief says so, and the landing
review greps the new code for spine-core's identifiers and comment text the way `TY04`
greps for names that may not appear.

The mathematics of a 2D bone hierarchy, a Bézier curve, an IK solver or a path follower
belongs to nobody; what the rule protects is that the *text* is ours.

One place in the tree already sits on this line, and the owner reads it before the rule
is applied to new code: `src/transform.ts`'s world-transform function says of itself
that *"the five `inherit` cases are the runtime's, transcribed"* (`inheritedMatrix`, 63
lines, measured 2026-09-29). It is the compiler's own reading of a bone's inherit mode,
written before this page; whether it stays as it is, is rewritten from the format's
documentation and measurement under this page's rule, or is what this page's rule
should say is fine, is the owner's call and is recorded on #380 when made.

Since 2026-09-29 (#929): the part of this question the core depended on was closed by
measurement — posed with `transform.ts`'s evaluator, the core read 1 of the 12
unconstrained recipes identical to spine-core, so `src/core/` poses with an evaluator of
its own, written from measurement, and imports nothing from `transform.ts` (`CO04`
refuses it). #929 left `transform.ts` untouched, its comment included; whether that
comment and the transcription it describes stay is still the owner's call.

## 4. The oracle — the equivalence gate

The instrument began as a prototype — the 1.0 exam's pose oracle in private scratch,
which read **IDENTICAL** on 14 of 14 graded production rigs after #803 and #804 — and
step 0b (#911) promoted it into `tools/pose_oracle.ts` with what its *Not yet* list
named. That file holds both dumpers (`dump` through `spine-core` 4.3.13, `dump --core`
through `src/core/`) and `compare`; `tools/core_gate.ts` runs the pair over a corpus,
judges each block of each row on its own, and prints a census of what the corpus
reaches.

**Definition.** For a spec S, let B be the Spine backend's build of S and M the compiled
model of S.

- P_spine(B): spine-core's pose dump of B — the setup pose and N samples per animation
  in the oracle's phases (`grid`, `off`, `irr`, `dense`): every bone's world
  `x y a b c d`, active flag and parent; every slot's attachment name, colour and region
  path; **and, added at promotion and since:** the slot's blend mode (#947), every drawn
  attachment's world vertices, the draw order, the clipping polygons and the triangles
  drawn under them (#971), each drawn attachment's atlas page and page UVs (#974),
  events fired, and physics stepped from `Physics.reset` at a fixed `dt` on rigs that
  have it.
- P_ours(M): the same dump, same JSON shape, from our core on M.

**The gate: P_ours(M) ≡ P_spine(B).** Rosters and names exact, and the numbers read
two ways. **On the grid**, equal at the oracle's rounding (six decimals): the reading
every construct of step 2 was admitted under (§5). **Under `--raw`** (#976), full
doubles at tolerance 0 with the worst difference printed in ulps: the reading step 3
switched the consumers under, because they read full doubles; it reads GREEN on every
row of both corpora since #981, and the core suite holds it on every built row
(`CR06`). The renders: `tools/render_hashes.ts` (#972) measured two runs on one machine
byte-identical (19 rows, 2,827 files), and Linux CI's encoder wrote other PNG bytes for
the same frames, so its tracked base holds decoded pixels and `RH05` holds those across
platforms; posed through the core against through spine-core, the 19 rows read
IDENTICAL on all 2,827 files, bytes and pixels (#980). A sample where a bone's
|det| < ε in either runtime is ill-conditioned — reported, not compared, with its
descendants (the rule the exam's calibration derived).

**A row is judged only on constructs already admitted** (§5). A row that uses a construct
not yet admitted prints `SKIP` with the construct named, and counts as not run. A
construct no row in any corpus uses prints a `HOLE` — the gate has nothing to hold it
to, and that is the finding.

**Positive control.** Every admitted construct has a planted difference in our core
(one wrong sign, one swapped mode) that must turn the gate red on the rows using it. A
gate nobody has seen fail is not a gate.

**Three classes the definition did not foresee**, each added when a measurement met it:

- **Per skin** (#973). `--skin all` is the instrument's view, not a state a runtime is
  ever in, so a row declaring several skins is also judged once per skin, both dumpers
  under `--skin <name>`. No public row declares several (`core_gate` prints a
  `per skin` HOLE); on the private corpus it is 48 skin runs over five rigs.
- **History** (#983). Where a constraint writes into a bone the posed skin leaves
  inactive, the runtime reads values its previous pass left, and its sequential and
  fresh-skeleton readings disagree. `pose_oracle unposed` classes such a bone-sample
  HISTORY by measurement — never IDENTICAL, never DIFF — and where such a value reaches a
  posed bone the core refuses the pose by name (`CC15`) and `render` poses through
  spine-core instead. 0 of 19 public rows are refused; one private rig carries HISTORY
  rows on 18 of its 19 skins, and no refusal fires on any private skin.
- **Unposed bones** (#980, #983). A bone the posed skin leaves unposed — inactive, or
  below an inactive bone, which the runtime may still flag active — holds no pose in
  either runtime: its zero matrix is ill-conditioned, so `compare` never reads it (and
  JSON spells `-0` as `0`, which is why `unposed` exists), and the render seam snapshots
  it as zero in both posers (`RC07`).

**Populations**, every one read by machine and none by eye:

| corpus | rows | how it enters |
| --- | --- | --- |
| the selftest's core suite | hand-written probe documents and seeded random rigs, every population read `--raw` since #1001; not the four rigs `fixtures/public.ts` generates | directly |
| the public example corpus (`examples/`, spine-runtimes branch `4.3`) | 12 exports | `ingest` |
| this repository's gallery | 7 rigs (with the 12 exports, the 19 rows `core_gate` runs); the ladder's bench candidates are not among them | directly |
| a private production corpus | 14 production rigs, 48 per-skin runs; steps 1, 2 and 3 were each read on it | `ingest`, under `core_gate --recipes`; figures only, no content |

The larger private population this page first named — the 1.0 exam's 67 rigs' 4.3
exports and the 42 byte-round-trip rigs — has not been run through the gate; it remains
the intent, not a reading.

## 5. Admission, construct by construct

The construct list is not written here by hand: it is the Spine 4.3 parser surface
[SPEC_COVERAGE.md](SPEC_COVERAGE.md) documents, intersected with what the compiler emits
([AUTHORING.md](AUTHORING.md)). The order below is the runtime's own update order,
because a construct can only be measured once everything it depends on is admitted:

1. bones and the five inherit modes; the world-transform composition
2. slots, colours (`rgba`, `rgb`, `alpha`, two-colour tint), blend modes, attachment
   swaps, skins and skin-required members
3. attachments and their world vertices: region, mesh (unweighted, weighted), linked
   mesh, sequence, bounding box, path, point, clipping
4. timelines and curves: bone (rotate, translate and its split axes, scale and its
   split axes, shear and its split axes, inherit), slot (attachment, the colour
   families), deform, draw order, events; linear, stepped and Bézier curves; the mixing
   `render` and `check` actually call — anything beyond that is a named absence, not
   an implementation
5. constraints in the file's declaration order — no sort; this item said "update-cache
   order" until #951 measured that the runtime sorts nothing on these documents — ik,
   transform, path, slider, and physics as two constructs: under `Physics.none` a
   physics constraint applies nothing (#953), and the fixed-`dt` step from `reset` is
   its own (#963) — and their timelines
6. clipping applied to the draw

A construct is **admitted** when all three hold: its planted difference turns the gate
red; the gate reads identical on every corpus row that uses it; and at least one row
uses it. Until every construct a consumer needs is admitted, that consumer keeps posing
through spine-core (§6, step 3).

**Where admission stands.** Every construct listed is admitted, and the core's own list
of what it leaves out (`NOT_ADMITTED` in `src/core/index.ts`) is empty:

| construct | PR | what decided it, as the PR states it |
| --- | --- | --- |
| 1 bones, five inherit modes | #929 | an evaluator of the core's own: exact on 12 of 12 unconstrained recipes; either measured difference alone, 0 of 12 |
| 2 slots, colours, skins | #934, #947 (blend), #973 (per skin) | 18 of 19 rows, 1 SKIP by construct (#934); 36 corpus slots stating a blend (#947); 48 of 48 private skin runs (#973) |
| 3 attachments' world vertices | #945 (on #939's atlas rectangle) | the region rule exact on 6,000 of 6,000 hand-written regions |
| 4 timelines and curves | #943, #962 | the Bézier as a ten-piece recurrence, 0 misses on 18,430 corpus samples (#943); deform, sequence, draw order and events, the deform curve's far end fixed over 1,134 curve points (#962) |
| 5 constraints | #951, #954, #953, #963 | the declaration order (#951); path, 32 hand-written and 400 random orders (#954); physics unstepped, 400 of 400, 462 of 462 and 240 of 240 (#953); stepped, 400 of 400 random rigs (#963) |
| 6 clipping applied to the draw | #971, #982 | strictly convex clips, 2,641 of 2,641 (#971); concave and inverse clips through the core's own decomposition, 0 differing pixels on every probe (#982) |

Two kinds in item 3 have no world-vertex reading: a bounding box, whose vertices the
oracle's dump does not write, and a point, which rigc does not emit (#934).

**What no public row reaches.** `bun tools/core_gate.ts` over the 19 public rows prints
a HOLE for each of these (2026-10-01; the tool's own lines are the current list, each
saying what holds it instead, where anything does). Some are reached by the private
corpus — a trimmed region, a linked mesh, rotate 180 and 270, several pages (#974):

| family | HOLEs |
| --- | --- |
| bones | inherit `noScaleOrReflection`; `shearX`, `shearY`, `skinRequired`, `negativeScale`, `rotation360`, `reflectingParent` |
| slots | `secondSkin`, `multiFilled`, `conflicting`, `unfilled`, `colour6`, `dark`, `dark8`, `blendNormal`, `blendScreen`, `nameDiffers`, `pathDiffers`, `linkedmesh`, `boundingbox`, `clipping`, `inactiveBone` |
| attachments | `skewedBinding`, `linkedMesh`, `trimmedRegion`, `mirroredRegion`, `sequenceRegion`, `nullAtlas`, `clipping`, `clipEnd`, `boundingbox`, `path` |
| uvs | `linkedmesh`, `rotate180`, `rotateOther`, `trimmed`, `sequence`, `pathDiffers` |
| animations | `bone.shearx`, `bone.sheary`, `bone.inherit`, `slot.rgb`, `slot.alpha`, `slot.rgba2`, `slot.rgb2`, `slot.stepped`, `overlappingBoneChannels`, `deformPath`, `deformClipping`, `deformLinked`, `sequence`, `sequenceRegion`, `sequenceSlider`, `drawOrderEmpty`, `drawOrderSlider`, `eventPayload` |
| constraints | `ik.mixPartial`, `ik.softness`, `ik.compress`, `ik.stretch`, `ik.scaleYUniform`, `ik.scaleYVolume`, `ik.nonNormal`, `ik.nonUniformParent`, `ik.timelineFlags`; `transform.crossMapping`, `transform.additive`, `transform.clamp`, `transform.fromOffset`, `transform.toOffset`, `transform.toScale`, `transform.timelineBezier`; `skin`; `slider.boneWorld`, `slider.boneless`, `slider.mixPartial`, `slider.loop`, `slider.timeline` |
| paths | `severalBones`, `positionFixed`, `spacingLength`, `spacingFixed`, `spacingProportional`, `spacingNegative`, `chain`, `chainScale`, `offsetRotation`, `mixPartial`, `mixZero`, `closed`, `statedLengths`, `weighted`, `beyondEnds`, `slotBoneEarlier`, `slotBonePrevious`, `noPathShown`, `afterConstraint`, `timelineSpacing`, `timelineMix` |
| stepped physics | `sameBone`, `skin`, `scaleX`, `shearX`, `componentNegative`, `mass`, `wind`, `gravity`, `mix`, `limit`, `fps`, `timeline.gravity`, `timeline.reset`, `timeline.global` |
| per skin | no row declares several skins |

## 6. Steps, and what gates each

| step | what | gate | tier | landed |
| --- | --- | --- | --- | --- |
| **0a** | a census of `src/compile.ts` (8,770 lines, measured 2026-09-29): every emission site classified *neutral* (a bone, a key, a mesh) or *Spine-shape* (a 4.3 spelling, a key order, an omitted default), and the compiled model's fields listed from the types that exist (`CompileResult`, `CompiledImage`, the contexts) | a table, and a draft of the model's type; nothing moves | squad | #912 |
| **0b** | the oracle promoted from scratch into `tools/pose_oracle.ts`: dump, compare, phases, the ill-conditioned rule, and the *Not yet* list (mesh world vertices, deform, draw order, events, physics stepping, per-skin posing); the JSON shape written so a second dumper can produce it | the exam's 14/14 IDENTICAL reproduced on the public examples' rigc rebuilds; three rows held by the selftest the way `pose_floor` is; its own mutant | squad | #911 — 12 of 12 public exports IDENTICAL (`POR08`); the PR notes their rebuilds are value-identical to the exports, so that population cannot fail it |
| **1** | the split: `compile` builds the compiled model — a serialisable, deterministic document (`rigc-compiled/1`, fixed key order) written beside the Spine files — and the Spine emitter becomes its first consumer. 0a's census is the map: 144 neutral rows are the model's (the `f32`/`keyTime` quantisation included — spelling a fraction as its full double moved the pose on 19 of 19 builds, so which decimal is named is a value), 72 Spine-shape rows are the emitter's, and every one of the 24 read-back sites needs a model-side source, eleven of them a by-name form of the weighted run that nothing keeps today | **byte identity**: every build in every corpus emits the same bytes before and after — `A18`'s discipline applied across the refactor. #379's invariant becomes checkable: `compile.ts` names no Spine shape | judgement-heavy: the coupling is measured, not hidden, but the model-side source of each read-back site is a design choice per site; the commander briefs it from the census | #916 #918 #920 #923 #924 #927, + #939 (the atlas rectangle each region record carries) |
| **2** | the core, one construct at a time in §5's order, each its own card and squad | §5's three conditions | squad per construct | the construct PRs in §5's table: #929 #934 #945 #943 #962 #951 #954 #953 #963 #971 #982, with #947 and #973 extending the oracle |
| **3** | consumers switch: `render.ts` and `deformmeasure.ts` pose through our core once every construct they use is admitted. `validate.ts`'s round trip stays on spine-core | the same renders, bit-identical, on every corpus; the three link points in CLAUDE.md become two — they stayed three, as `CUR07` reads the tree: both consumers pose a rigc build through the core and keep spine-core for what is not one — a Spine export, a skeleton whose bytes no longer match its model's `spine.sha256` (#980), `validate`'s own A39 survey (#978) — and `render.ts` also links it for the atlas pages and texture substitution (CLAUDE.md *Conventions*) | squad | #972 #976 #974 #980 #978 #987, + #977 #981 #982 #983 #985 #986 #988 #992 #995 #1001 |
| **4** | the owner's three, in this order: whether the shipped package's round trip stays per-file (spine-core in the package, as today) or becomes population-proven (spine-core a dev dependency; the 🔒 invariant amended, and its per-file guarantee replaced by §4's per-population one — a weaker guarantee about any one file, stated as such); the packaging and the name if the licence line splits the package; the web player, which is a renderer over the core and lives where renderers live | — | owner | not started |

Estimates, carried from #380's 2026-09-04 text: a posing core of 5–8k lines; the split
1–2 squad-days; 0a was to refine both. Measured instead, after step 3: `src/core/` is
9,523 lines over 16 modules, 10,105 with the render's adapter `src/render_core.ts`
(`wc -l`, 2026-10-01); the split took six cuts in one day (below).

### Step 1, cut by the census

0a measured the split as a model to be *constructed* (24 read-back sites, eleven of
them a weighted vertex naming its bone by index in the emitted array), so step 1 is
not one change. It is the sequence below, each cut landing on its own under the same
gate — byte identity of every build in every corpus, held by the instrument of 1a —
and each cut's diff boundary is a set of rows in [COMPILED_MODEL.md](COMPILED_MODEL.md):

| cut | what moves | the census rows it closes |
| --- | --- | --- |
| **1a** | the instrument: every build in every corpus hashed across two commits (`tools/emit_hashes.ts`), before any line of `compile.ts` moves | — |
| **1b** | bones by name: the model's `bones` built first, the emitter producing `SpineBone[]` from them; world transforms, the rig info walk, segments and derived group values read the model | §1.4 rows 1, 2, 12, 21, 24 |
| **1c** | the weighted run by name: the four vertex-attachment kinds (mesh, path, bounding box, clipping) as model records whose bindings name their bone, encoded to indexes only at emission; deform geometry, path lengths and the mesh-bone reads decoded from the model | §1.4 rows 8, 13–23, 14, 17; §2.1's first bullet |
| **1d** | slots, skins, the remaining attachment kinds (region, point, linked mesh), constraints, events as model records; the emitter owns the `type` discriminators, the inline omissions and the sequence frame spelling | §1.4 rows 3–7, 9–11, 16; §3 *Omission* and *Spellings* |
| **1e** | animations: keys as the model holds them, the emitter restating every constructor insertion order the key-order table does not list | §3 *Layout and order*'s ⚠️ |
| **1f** | the model written beside the Spine files (`rigc-compiled/1`, fixed key order), `A18` extended to it, and #379's rule made a control: `compile.ts` names no Spine shape | — |

The `f32`/`keyTime` quantisation stays on the model side throughout (0a's first
correction), and the two `open` rows (`filter`, `pma`) are decided at 1d. Every cut landed on 2026-09-29 — 1a #916, 1b #918, 1c #920, 1d #923, 1e #924, 1f #927 —
each byte-identical on the tree's 19 recipes and on a private corpus of 14 production
rigs, each on the first run after its refactor, each briefed to an Opus squad from the
census rows; what each cut found that the brief or the census had wrong is in its PR.
The 19 recipes proved blind to most of the keys the later cuts moved (a second skin,
linked meshes, event payloads, most constraint fields, slider and sequence timelines),
so each cut also holds those with probe rigs; a probe corpus that reaches every key is
a card of its own.

## 7. What this page does not change

- **The Spine backend.** Spine data is emitted only through the spine-core round trip.
  The 🔒 invariant in [CLAUDE.md](../CLAUDE.md) — what it requires is that everything
  written to disk was read back by a parser rigc did not write, and spine-core is what
  supplies that today — is not touched by this page; step 4 is where the owner decides
  whether it is amended, and with what.
- **The licence posture** in [README.md](../README.md), *Licensing, stated plainly*.
- **The generation policy** ([GENERATIONS.md](GENERATIONS.md)): our core reads our
  model at 4.3 semantics; data from another generation reaches it the way it reaches
  rigc today.
- **The rejected shapes on #380**: a Spine emitter with no runtime dependency, and a new
  format plus a new runtime built without an oracle.

## 8. Rejected on this page, with the reason

- **Porting spine-core.** A derivative work carries the same licence as the link it
  replaces, and a copy is not a second oracle (§3).
- **Replacing `validate.ts`'s round trip first.** It would give up a per-file guarantee
  before the per-population one exists.
- **Starting the web player before the core is admitted.** A player over a core with
  no oracle is output nobody can check — the ROADMAP's own sentence.
- **glTF as the second backend.** Rejected on #380 on 2026-09-04: a container for
  contents it cannot carry (live constraints, skins, draw order, two-colour tint,
  clipping), each a silent drop or a named absence; stays rejected.
- **Reading R1 into the owner's words.** The owner asked for the spine-core oracle to be
  *replaced*; the shape on the card since 2026-09-04 is R2, and this page keeps it. If
  the owner meant R1, the correction is one line on #380 and §2 is rewritten; nothing in
  steps 0a–0b depends on the reading.
