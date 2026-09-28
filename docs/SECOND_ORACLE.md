# The second oracle — rigc's own core, admitted construct by construct against spine-core

**Status: started 2026-09-29 by the owner's call** (issue #380, the start gate of its
2026-09-17 comment). This page is the design. #380 carries the history of the argument,
including the two shapes it rejected on 2026-09-04, which stay rejected;
[ROADMAP.md](../ROADMAP.md) *What changes the frame* is the frame — *the milestone is
not the second backend, it is the second oracle.*

---

## 1. The sentence

A posing core of rigc's own — `src/core/`, pure, importing nothing from
`@esotericsoftware/spine-core` — that reads rigc's own **compiled model** (the neutral
model `compile` already builds before the Spine emitter shapes it, made serialisable)
and poses it: bones with their inherit modes, slots and colours, every attachment kind's
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

## 4. The oracle — the equivalence gate

The instrument exists in prototype: the 1.0 exam's pose oracle (private scratch,
`pose43.mjs` 33 lines, `compare4.py` 134 lines, measured 2026-09-29), which posed
rigc's builds and the editor's exports under `spine-core` 4.3.13 and read **IDENTICAL**
on 14 of 14 graded production rigs after #803 and #804 landed. It is promoted into
`tools/` as step 0b (§6) and extended with what its own README lists under *Not yet*.

**Definition.** For a spec S, let B be the Spine backend's build of S and M the compiled
model of S.

- P_spine(B): spine-core's pose dump of B — the setup pose and N samples per animation
  in the oracle's phases (`grid`, `off`, `irr`, `dense`): every bone's world
  `x y a b c d`, active flag and parent; every slot's attachment name, colour and region
  path; **and, new:** every drawn attachment's world vertices, the draw order, clipping
  output, events fired, and physics stepped from `Physics.reset` at a fixed `dt` on rigs
  that have it.
- P_ours(M): the same dump, same JSON shape, from our core on M.

**The gate: P_ours(M) ≡ P_spine(B).** Rosters and names exact; numbers equal at the
oracle's rounding (six decimals); and the two renders through rigc's own rasteriser
bit-identical, any differing pixel named by slot and frame. A sample where a bone's
|det| < ε in either runtime is ill-conditioned — reported, not compared, with its
descendants (the rule the exam's calibration derived).

**A row is judged only on constructs already admitted** (§5). A row that uses a construct
not yet admitted prints `SKIP` with the construct named, and counts as not run. A
construct no row in any corpus uses prints a `HOLE` — the gate has nothing to hold it
to, and that is the finding.

**Positive control.** Every admitted construct has a planted difference in our core
(one wrong sign, one swapped mode) that must turn the gate red on the rows using it. A
gate nobody has seen fail is not a gate.

**Populations**, every one read by machine and none by eye:

| corpus | rows | how it enters |
| --- | --- | --- |
| the selftest's own fixtures | every spec the controls build | directly |
| the public example corpus (`examples/`, spine-runtimes branch `4.3`) | 12 exports | `ingest` |
| this repository's gallery and bench builds | every build | directly |
| a private production corpus | the 1.0 exam's 67 rigs' 4.3 exports and the 42 byte-round-trip rigs | `ingest`, under `--corpus`; figures only, no content, as the exam already runs |

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
5. constraints in update-cache order — ik, transform, path, physics (with `reset` and
   the fixed-`dt` step), slider — and their timelines
6. clipping applied to the draw

A construct is **admitted** when all three hold: its planted difference turns the gate
red; the gate reads identical on every corpus row that uses it; and at least one row
uses it. Until every construct a consumer needs is admitted, that consumer keeps posing
through spine-core (§6, step 3).

## 6. Steps, and what gates each

| step | what | gate | tier |
| --- | --- | --- | --- |
| **0a** | a census of `src/compile.ts` (8,770 lines, measured 2026-09-29): every emission site classified *neutral* (a bone, a key, a mesh) or *Spine-shape* (a 4.3 spelling, a key order, an omitted default), and the compiled model's fields listed from the types that exist (`CompileResult`, `CompiledImage`, the contexts) | a table, and a draft of the model's type; nothing moves | squad |
| **0b** | the oracle promoted from scratch into `tools/pose_oracle.ts`: dump, compare, phases, the ill-conditioned rule, and the *Not yet* list (mesh world vertices, deform, draw order, events, physics stepping, per-skin posing); the JSON shape written so a second dumper can produce it | the exam's 14/14 IDENTICAL reproduced on the public examples' rigc rebuilds; three rows held by the selftest the way `pose_floor` is; its own mutant | squad |
| **1** | the split: `compile` produces the compiled model as a serialisable, deterministic document (`rigc-compiled/1`, fixed key order) written beside the Spine files, and the Spine emitter becomes its first consumer | **byte identity**: every build in every corpus emits the same bytes before and after — `A18`'s discipline applied across the refactor. #379's invariant becomes checkable: `compile.ts` names no Spine shape | the commander decides after 0a; the coupling is hidden, so this is the judgement-heavy step |
| **2** | the core, one construct at a time in §5's order, each its own card and squad | §5's three conditions | squad per construct |
| **3** | consumers switch: `render.ts` and `deformmeasure.ts` pose through our core once every construct they use is admitted. `validate.ts`'s round trip stays on spine-core | the same renders, bit-identical, on every corpus; the three link points in CLAUDE.md become two | squad |
| **4** | the owner's three, in this order: whether the shipped package's round trip stays per-file (spine-core in the package, as today) or becomes population-proven (spine-core a dev dependency; the 🔒 invariant amended, and its per-file guarantee replaced by §4's per-population one — a weaker guarantee about any one file, stated as such); the packaging and the name if the licence line splits the package; the web player, which is a renderer over the core and lives where renderers live | — | owner |

Estimates, carried from #380's 2026-09-04 text and not re-measured: a posing core of
5–8k lines; the split 1–2 squad-days. 0a refines both.

## 7. What this page does not change

- **The Spine backend.** Spine data is emitted only through the spine-core round trip.
  The 🔒 invariant in [CLAUDE.md](../CLAUDE.md) is not touched by this page; step 4 is
  where the owner decides whether it is amended, and with what.
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
