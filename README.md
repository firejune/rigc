# rigc

**Rig compiler for Spine.** Declarative rig specs in, Spine 4.3 skeleton data out,
verified by a `spine-core` round-trip. Built so AI agents can author rigs and check
their own work.

## What rigc is, and what it is not

rigc emits **Spine's own skeleton data format**. That is the whole positioning, and
it cuts both ways:

- The output loads in any Spine runtime, and it **imports into the Spine editor**.
  A compiled rig is a starting point on a timeline, not a finished shot — **an AI
  drafts, a human refines in the editor**. rigc is complementary to the editor. It
  is not a replacement for it, and it is not a way around one.
- rigc **links `@esotericsoftware/spine-core`** to validate what it emits — the
  round-trip through the official parser is the only reason its output can be
  trusted at all. So the [Spine Runtimes License Agreement](https://esotericsoftware.com/spine-runtimes-license)
  applies to rigc exactly as it applies to any other runtime integration.

### Licensing, stated plainly

rigc's own code is MIT (see [LICENSE](LICENSE)). That says nothing about Spine, and
the following is a restatement of Esoteric Software's terms, not a term of ours:

1. rigc's output **is Spine skeleton data**.
2. Playing Spine skeleton data in a product requires **a Spine Runtime**.
3. The Spine Runtimes License requires **each user of such a product to own a Spine
   editor licence**.
4. rigc **links `spine-core`** itself, so the same obligation covers running rigc.

> **Using rigc, or shipping rigc's output in a product, requires a Spine editor
> licence.** rigc does not change that requirement in either direction — it neither
> adds one nor removes one. If you were going to need an editor licence to ship a
> Spine animation, you still do; rigc is not a route around it.

See [NOTICE.md](NOTICE.md) for the full notice.

The problem rigc is aimed at is narrow. An agent asked to author a rig has no way
to tell whether it succeeded: Spine's JSON parser accepts a great deal of nonsense
without a murmur — a constraint in the 4.2 shape simply vanishes, a `size:` that
disagrees with the PNG collapses every UV, a four-number curve array yields NaN,
a mesh whose vertex count happens to equal its UV count silently loses its bone
weights. Every one of those loads clean, plays, and is wrong. rigc's answer is to
make the failure legible: compile from a spec, round-trip through the real parser,
run a list of named assertions, and **write nothing unless all of them are green.**

## The yardstick

The measure of whether this works is **Spine's own official example projects** —
the `1-weight-and-mass` … `8-follow-through` series as a difficulty ladder (one
animation principle per rig, in roughly ascending order), and **spineboy as the
graduation exam**. The question is structural and per-frame: given the same source
art and a spec, does a compiled rig match the official export in bone hierarchy,
timeline shape, mesh topology and posed vertex positions?

`scripts/fetch-examples.sh` downloads those projects into a gitignored `examples/`
directory (they are not redistributed here — see [NOTICE.md](NOTICE.md) for the
per-example licence terms).

### Comparing a rig against a reference — `rigc diff`

```bash
bun cli.ts diff candidate.json reference.json [--json report.json]
```

`diff` reads two skeletons and reports a ratio per **measure**, grouped into six
sections — bones, slots, attachments, constraints, animations, events — and it
does **not** combine them into a score. A single "87% match" cannot tell a rig
with the right skeleton and the wrong timing apart from a rig with the right
timing and the wrong skeleton, and those are opposite diagnoses.

Three properties the measures are built to have:

- **`diff X X` is 1.000 on every measure.** A comparison tool that cannot
  recognise identity is reporting noise, and noise looks like a small honest gap.
  The selftest asserts it.
- **A difference moves as few measures as possible.** Reordering two slots moves
  `slots.order` and nothing else — not the slot-to-bone bindings, not the setup
  attachments — so the report says *where* a rig is wrong, not just *how much*.
  Each selftest case names the exact set of measures its edit may disturb.
- **Name-agnostic figures sit beside name-matched ones.** A candidate that builds
  the right tree under its own bone names scores 0 on `bones.parent_by_name` and
  1.000 on `bones.depth_histogram` and `bones.degree_sequence`. Reporting only the
  first calls a correct rig a total failure; reporting only the second calls any
  14-bone tree a match.

An assertion or measure with nothing to compare reports its `total` as 0 and says
so, exactly as the validator's SKIP does — a vacuous 1.000 that looks earned is
the same false green in a different costume.

### Checking a rig against the pictures — `rigc check`

```bash
bun cli.ts check --candidate path/to/spine --frames bench/reference/3-timing-and-spacing
```

⭐ **Neither the gate nor `diff` can see a wrong animation.** The gate checks
validity: it parses the skeleton, steps every animation and refuses anything
degenerate, and it has no opinion about whether the animation is the one that was
asked for. `diff` checks structure: a reversed easing is the same timeline, the
same key count and the same curve kind. Three honest ladder runs have now produced
**zero** validator FAILs between them, and one of them shipped a build in which
every easing in the file was reversed — green, and sincerely reported as done.

`check` is the instrument for that. It renders the candidate with the same
rasteriser that drew the reference frames, onto the same pixel grid, and reports
per animation and per frame:

- **MAE over the union alpha** — the mean absolute RGB difference over the pixels
  either side covers, 0..255. The whole-frame figure is printed beside it and never
  instead of it: most of a frame is background on both sides, so that number is
  small for every candidate and the gap between a good one and a bad one smaller
  still.
- **Per-slot drift** — where each of the candidate's own slots landed against the
  connected component of the reference frame nearest it, in pixels. MAE says *how
  wrong*; a slot's drift says *which part, which way, how far*. Where the reference
  merged two parts into one blob — the trap [AUTHORING §8](docs/AUTHORING.md) opens
  with — the match is reported as **ambiguous** rather than guessed at, because a
  drift printed there is not a measurement of that slot.

🔒 **It never reads the reference skeleton.** It opens the candidate and PNG
frames, and nothing else: every reference-side read goes through one guard that
refuses a path which is not a `.png` or the frame set's `frames.json`, and the
selftest makes that guard fire. That is what lets `check` sit *inside* an
authoring loop where `bench` cannot — running it as often as you like does not
stop a run being an authoring run.

The candidate is framed **by its own content**, not by the reference's world box.
A candidate is authored in its own coordinate system and under the ladder's
honesty rule could not be authored in any other, so the framing procedure — the
union of the posed quads over every animation, padded, scaled to the reference's
long side — is applied to each side separately. It is deterministic and
content-derived, so two skeletons depicting the same shot land on the same pixels
whatever coordinates they were authored in.

There is no pass mark, for the same reason `diff` has none.

### Benchmark ladder — the rungs, and where they stand

**[docs/LADDER.md](docs/LADDER.md) is the live ledger**: the rung order the owner
fixed (blockers → rung 3 first → 1 · 2 · 4 · 5 → 6 → 8 → 7 → spineboy), what each
rung gates on, how a rung is scored, the honesty rule that keeps the reference
export away from the authoring agent, and a status table. Run one with:

```bash
bun cli.ts bench 3 --candidate path/to/candidate/spine
```

`bench` validates the candidate under `--profile spine`, diffs it against that
rung's reference export, and prints both. It exits non-zero only when validation
fails: the diff has no threshold, because there is no rung score. Add
`--frames <dir>` and it folds in the `check` table below, so a ladder row carries
fidelity as well as structure.

#### What the rungs need

[docs/SPEC_COVERAGE.md](docs/SPEC_COVERAGE.md) surveys the full Spine 4.3 export surface against what
rigc emits and against what the nine examples measurably use (`bun run bench:usage` regenerates the
counts). Three blockers sat *before* rung 1: **B1**, the bone tree was code in `archetype.ts` rather
than data, so no example could be expressed at all; **B2**, `A16`'s regex rejected the `"4.3.75-beta"`
that every example declares; and **B3**, every example ships a **packed** atlas (13–50 regions per
page) against rigc's one-part-per-page model, which `A06` enforced unconditionally. **B1 and B2 are
closed**; B3's validator half is (the packed-atlas clauses live behind `--profile`, above) and its
emitter half — no packer, no atlas importer — is not. Ordered gap list in Part 4 of that document;
live status, and B1's proof, in [docs/LADDER.md](docs/LADDER.md).

## What exists today

**Inputs — three files, one domain each.** Only the middle one is required.

- A **cut manifest** (`FaceManifest` in [`src/types.ts`](src/types.ts)) owns
  **measured art**. Crop rectangle, the base plate, one entry per part with its
  offset and size, mask polygons, the state machine, bone anchors, and — for a
  joint cut — the entry point, the insertion axis (`deg` in screen degrees plus a
  `unit` vector, cross-checked against each other), stroke amplitudes and any
  measured ceilings. The compiler **never re-measures art**: every number here is
  produced by a measuring tool or by the pipeline that cut the plates, and rigc
  only reads it. **Optional** — a skeleton with no measured art behind it (any of
  the benchmark examples) has none.
- A **rig spec** (`RigSpec` in [`src/rig.ts`](src/rig.ts), `spec: "rigc-rig/1"`)
  owns **skeleton structure**: bones, slots, skins and their attachments, the 4.3
  typed `constraints` array, and the invariants the emitted JSON cannot state
  about itself. Its vocabulary is deliberately **Spine's own** — same concepts,
  same field names, same defaults, cited to `SkeletonJson.ts` line numbers — so an
  agent that has read Spine's documentation can author one without learning a
  second vocabulary. rigc's additions sit on top and are namespaced: `from` on a
  bone takes its position from the manifest instead of a literal that would drift
  away from the art; `image` on an attachment names a PNG and rigc measures it;
  `generator` on a mesh invokes a builder from `src/mesh.ts`; `invariants` carries
  the axis bone, the forbidden parentage, the mesh budget.
- A **motion spec** (`MotionSpec`, `spec: "rigc-motion/1"`) owns **time**: the rig
  it was authored against, named easing handles, setup overrides, a physics tuning
  table, and the animations — each with a declared duration, a loop flag, its
  tracks, and optionally a `drawOrder` timeline (the one timeline that names no
  target, so it sits on the animation rather than in `tracks`).

**Outputs — two files per cut**, written to the cut's `out` directory:

- `skeleton.json` — Spine **4.3** skeleton data. Bones, slots in draw order, one
  skin, animations, and constraints in the 4.3 single `constraints` array.
- `skeleton.atlas` — a **one-part-per-page** atlas: every region covers its whole
  page, `pma: false`. That convention is what makes the region/attachment/filename
  join key checkable exactly rather than by convention.

**Where the three meet.** A manifest part joins a rig slot by its `rig_slot` field
(falling back to `slot`), and that slot's position in the rig's `slots` array **is**
the draw order — a manifest whose `draw_order` numbers disagree is a compile error
rather than a silent overrule. A slot filled by both a manifest part and a rig skin
is likewise refused, as is a setup pose declared in both the rig and the motion
spec: one fact, one author. A missing anchor is a compile error by design, so that
copying another cut's numbers is not the path of least resistance.

Two things are code and stay code, because neither is a table of numbers: the
**mesh generators** in [`src/mesh.ts`](src/mesh.ts), which encode a deformation
model (what is pinned, what may move, how authority falls off), and the
**coordinate contract** in [`src/transform.ts`](src/transform.ts).

### The validator

[`src/validate.ts`](src/validate.ts) parses the emitted artifacts with `spine-core`
and then runs 32 named assertions over the loaded skeleton. Each one exists because
the failure it catches is **silent**: the file loads, animates, and lies.

Assertions whose data is absent are reported as **SKIP**, never folded into the pass
count — an assertion with nothing to check has not checked anything.

#### Profiles — "wrong" versus "not how we do it here"

Not all 32 rules are about Spine. Some are about **spine-html**, the renderer this
compiler was built to feed, and about one project's frame budget; they fire on real,
correct, editor-produced Spine data, because the official example projects carry
clipping attachments, unweighted meshes, 116-triangle meshes and packed atlases —
all valid, none of them things spine-html will draw. Others are about **rigc's own
rigs** and mean nothing at all on a skeleton rigc did not compile — they read the
rig spec's `invariants` block, and they **SKIP** when it is absent rather than
counting as passes.

So `validate` and `build` take a `--profile`:

| Profile | Runs | For |
| --- | --- | --- |
| `spine-html` | all 32 | **the default.** Is this a rig this project can ship? |
| `spine` | the 18 validity rules | Is this valid Spine 4.3 that any runtime plays correctly? |

The **Profile** column below says which is which — `both` = validity, `renderer` and
`archetype` = `spine-html` only, and **`both ◑`** = a mixed assertion whose validity
half always runs while its policy clauses are gated (A06's `pma`/rotation/full-page
clauses, A08's "the two names must be identical", A20's "a mesh must be weighted at
all"). A report always names the profile it ran and lists what that profile left
out, on `PROF` lines: a `--profile spine` green means *valid Spine*, never *passes
the renderer policy*.

| Assertion | Profile | Holds that |
| --- | --- | --- |
| `A00_ROUNDTRIP_PARSE` | both | `spine-core` parses the skeleton and the atlas without throwing |
| `A01_NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS` | both | no 4.1/4.2-shaped `physics`/`ik`/… array — 4.3 folds them into one typed `constraints` array, and the old shape loads clean while the constraint vanishes |
| `A02_NO_BONE_TRANSFORM_KEY` | both | no bone uses 4.2's `transform`; 4.3 renamed it `inherit`, and the old key silently falls back to Normal inheritance |
| `A03_REGION_WIDTH_HEIGHT_FINITE` | both | every region attachment loaded a finite, positive width and height (a missing field loads as NaN, with no error) |
| `A04_MESH_TRIANGLES_AND_ENCODING` | both | triangles are a multiple of 3, indices are in range, and the vertex array's encoding agrees with the UV count |
| `A05_CURVE_ARRAY_LENGTH` | both | curve arrays carry 4 numbers per value channel and hold no non-finite value; timelines that cannot take a curve do not carry one. Covers all eleven 4.3 timeline groups — bone, slot, ik, transform, path, physics, slider, deform, drawOrder, drawOrderFolder, events |
| `A06_ATLAS_PAGE_SIZE_MATCHES_PNG` | both ◑ | each page's declared `size:` matches the PNG on disk, and its region covers the whole page |
| `A07_ATLAS_TEXT_SHAPE` | both | the atlas text obeys the parser's whitespace rules — no stray indentation on region names, no blank line splitting a page block |
| `A08_REGION_NAMES_MATCH_ATTACHMENTS` | both ◑ | every attachment name resolves to a region of exactly that name |
| `A09_ANIMATION_DURATION_MATCHES_SPEC` | both | the compiled duration equals the duration the spec declared (skeleton JSON has no duration field — the last key *is* the duration). SKIPs without a motion spec |
| `A10_NO_NAN_AFTER_STEPPING` | both | stepping every animation frame by frame produces no NaN anywhere in the pose |
| `A11_NO_CLIPPING_ATTACHMENTS` | renderer | no clipping attachments (the renderer skips them silently) |
| `A12_NO_DARK_COLOR` | renderer | no dark / two-colour tint on slots or timelines — parsed, then ignored |
| `A13_MESH_BUDGET` | renderer | at most 4 mesh slots, at most 80 triangles per mesh |
| `A14_NO_FULL_FRAME_MESH` | renderer | no mesh spans the whole stage (a full-frame mesh is a full-frame canvas that can never dirty-skip) |
| `A15_IDLE_NO_MESH_BONE_KEYS` | renderer | `idle` keys no bone that drives a mesh, directly or as its control bone |
| `A16_SKELETON_VERSION_4_3` | both | the `skeleton.spine` version label is on the 4.3 line (the parser never checks it) |
| `A17_ATLAS_PAGE_FILES_EXIST` | both | every page the atlas declares is a file on disk |
| `A18_DETERMINISTIC_EMIT` | both | a second, independent compile of the same inputs is byte-identical. SKIPs when re-gating artifacts already on disk |
| `A19_OVERLAY_PNGS_HAVE_ALPHA` | renderer | every overlay page carries an alpha channel; only the base plate — identified structurally as the region covering the stage — may be opaque |
| `A20_MESH_WEIGHTS_COHERENT` | both ◑ | every weighted vertex has at least one bone, no negative weight, bone indices in range, and each vertex's weights sum to 1. `spine-html` also requires that a mesh be weighted at all and that no binding sit at weight 0 |
| `A21_MESH_RIM_PINNED` | archetype | a ring mesh's rim vertices are pinned to the anchor bone and its hull is a real ring; a ribbon's entry row stays put |
| `A22_MESH_UVS_IN_UNIT_RANGE` | both | every UV lies inside its region |
| `A23_PHYSICS_CONSTRAINT_EFFECTIVE` | both | each physics constraint actually drives a component, is not muted by `mix: 0`, has non-zero mass, and has `damping < 1` so it settles |
| `A24_AXIS_SPACE_STROKE` | archetype | the stroke is authored in **axis space** — no screen-space Y component anywhere in the axis subtree, and no keys at all on the axis bone (its rotation is the one per-cut setup value) |
| `A25_DETACHED_BONE_PARENTAGE` | archetype | bones that must stay detached are not parented under a moving part |
| `A26_SLOT_DRAW_ORDER` | archetype | the slots array — which *is* the draw order — matches the rig spec's slot table |
| `A27_REGION_NAME_MATCHES_PAGE_FILENAME` | renderer | each region's name equals its page's basename, closing the second link of the attachment → region → file chain |
| `A28_RIBBON_ROWS_SHARE_WEIGHTS` | archetype | both vertices of a ribbon row carry the same bones at the same weights, so the strip can lengthen and curve but never widen |
| `A29_STROKE_WITHIN_CONTACT_DEPTH` | archetype | the stroke plus any inward keys stays within the cut's measured contact depth (skipped when the manifest declares none) |
| `A30_STROKE_WITHIN_CAP_CONTAINMENT` | archetype | the stroke stays within the cut's measured containment ceiling, and nothing in the axis subtree scales — a scale key changes the contour the ceiling was measured on (skipped when the manifest declares none) |
| `A31_DRAW_ORDER_OFFSETS_RESOLVE` | both | every draw-order key resolves to a real permutation: known slots, one entry per slot, each landing inside the slots array, offsets in ascending slot order. The **only assertion that runs before `A00`** — descending offsets make `readDrawOrder`'s forward-only cursor spin rather than return, so the round trip is refused by name instead of attempted |

## Usage

📘 **Writing a spec? Read [docs/AUTHORING.md](docs/AUTHORING.md) first.** It is the
guide an agent rigs from: both input files with a complete minimal example each,
every field with its Spine meaning, the rules that decide what is emitted, the
build → read the report → fix → repeat loop, the map from every named failure to
the file that has to change, and the list of format features rigc refuses by name
so you do not spend a loop discovering them.

```bash
bun install
```

Compile by spelling out the paths. `--manifest` is optional; `--images <dir>` says
where a rig spec's `image` references live (it overrides the rig's own `images`
field):

```bash
bun cli.ts build \
  --rig      path/to/my_rig.rig.json \
  --motion   path/to/my.motion.json \
  --out      path/to/spine \
  [--manifest path/to/manifest.json] [--images path/to/images]
```

…or register cuts in a `cuts.json` and build them by name. Every path in the table
resolves **relative to the `cuts.json` file itself**, so the table lives with the
project that owns the art:

```json
{
  "my_cut": {
    "rig": "rigs/my_rig.rig.json",
    "manifest": "output/my_cut/manifest.json",
    "motion": "specs/my_cut.motion.json",
    "out": "output/my_cut/spine"
  }
}
```

```bash
bun cli.ts build --cut my_cut --cuts path/to/cuts.json
```

`build` compiles, then validates, and **writes only if the gate is green**. Other
commands:

```bash
bun cli.ts explain  --cut my_cut --cuts path/to/cuts.json   # the compiled rig as a table
bun cli.ts validate path/to/spine                           # re-gate artifacts already on disk
bun cli.ts validate --profile spine path/to/any/skeleton    # spec rules only (see Profiles)
bun cli.ts diff candidate.json reference.json               # structural comparison
bun cli.ts check --candidate path/to/spine \
                 --frames bench/reference/3-timing-and-spacing   # against pictures
bun cli.ts bench 3 --candidate path/to/spine                # one rung of the ladder
```

`validate` on a bare directory checks what it can see. Adding `--cut`/`--cuts` lets
it re-derive the declared durations and the structural expectations too, and the
report says which it had. `build` and `validate` both take `--profile spine` to drop
the renderer and archetype policy; the default stays `spine-html`.

## Checks

```bash
bun run typecheck    # bunx tsc --noEmit over cli.ts, selftest.ts, src/, bench/, tools/
bun run lint         # one rule: @typescript-eslint/no-explicit-any, as an error
```

Bun runs the sources directly, so neither is on the path of anything — they exist
because a convention nothing checks is a convention. `tsconfig.json` is
`strict: false` with `strictNullChecks: true` and says in place why the rest is
not on yet; `eslint.config.js` says why it carries exactly one rule.

## Selftest

```bash
bun run selftest --cuts path/to/cuts.json
```

A gate nobody has seen fail is not a gate. The selftest takes real compiled
artifacts, breaks them one way at a time — 46 deliberate breaks, each modelled on a
mistake that was actually made or actually measured — and asserts that the **named**
assertion fires for each. Two of the breaks are *tolerance* controls, edits the gate
must let through, because a widened assertion can fail by firing too often as
easily as by firing too rarely.

A fifth suite breaks an **input** instead of an artifact: seven malformed rig specs
that the compiler must refuse by name — a forward parent reference, a duplicate bone
name, a slot naming a missing bone, an ik target that does not exist, an attachment
image that is not on disk, a wrong `spec` field, and a constraint type the emitter
cannot write. Each of those produces a file Spine's own parser would accept while
quietly meaning something else.

There is a positive control per suite as well: the pristine artifacts must come back
with zero failures, because a validator that failed everything would otherwise look
like a validator that worked.

`rigc check` gets the same treatment, and its pair is deliberately the same rig
twice: the rung 3 transcription against rung 3's frames, and then that transcription
with every key time reversed. Reversing leaves the structure untouched — same
timelines, same key count, same duration, and the gate stays green, which the
control asserts — and changes only what the shot looks like. Faithful reads 0.67 px
of slot drift; reversed reads 66.8 px. A third control makes the frames-only read
guard refuse a reference skeleton, because an honesty invariant nobody has seen
refuse anything is not an invariant.

> ⚠️ The selftest is currently **fixture-bound**: its mutants name specific
> attachments, bones and animations, so it needs a `cuts.json` supplying the three
> cuts it was written against. Those fixtures are not in this repository. See
> [CLAUDE.md](CLAUDE.md), *PUBLIC GATE*.

## Layout

```
tsconfig.json   type-check config (noEmit); eslint.config.js — the no-any gate
cli.ts          build / validate / explain / diff / check / bench
selftest.ts     the validator's own negative controls, and diff's and check's
src/
  compile.ts    rig + motion spec (+ manifest) -> skeleton JSON + atlas text (pure data assembly)
  rig.ts        the rig spec — `spec: "rigc-rig/1"`, the skeleton as data
  validate.ts   spine-core round trip + the 32 assertions
  diff.ts       structural comparison of two skeletons, one ratio per measure
  render.ts     the region rasteriser, shared by the reference renderer and check
  check.ts      a candidate against rendered frames — pixels and per-slot drift,
                and it never opens the reference skeleton
  ladder.ts     which example is which rung, and which file in it is the reference
  timelines.ts  the 4.3 timeline catalogue and its walker (shared, pure JSON)
  mesh.ts       ring and ribbon mesh builders, weighted-vertex encoding
  transform.ts  crop pixels (y down) <-> Spine world (y up), world transforms
  png.ts        PNG header reader (size and colour type, no decode)
  errors.ts     CompileError, and NotImplementedError for what the format holds
                and the emitter does not write
  types.ts      manifest, motion spec, and emitted-JSON shapes
tools/          measurement and plate helpers (see below)
scripts/        fetch-examples.sh
bench/          count_features.ts — what the example corpus actually uses
                render_reference.ts — a rung's official export as PNG frames
                briefs/ — what an authoring agent is told about a rung
                reference/ — those frames, with the licence they travel under
                runs/ — one directory per attempt, and the run protocol
                transcriptions/ — rung specs transcribed from a reference export,
                which measure expressiveness and NOT authoring (see LADDER.md)
docs/           AUTHORING.md (how to author a rig), LADDER.md (live rung status),
                SPEC_COVERAGE.md (format survey),
                feature_matrix.{csv,json}
```

`tools/` are standalone utilities, each taking its paths as arguments:

| Tool | Does |
| --- | --- |
| `measure_contact_depth.ts` | measures a cut's contact depth from its plates, with the two-sided proof it has to satisfy |
| `measure_joint_anchors.ts` | derives a joint cut's bone anchors from its own plates; prints, never writes |
| `make_stroke_strip.ts` | composes a 1:1 contact sheet from frames a render probe captured (composition only — it cannot invent pixels) |
| `plate.ts` / `png_probe.mjs` | minimal PNG read/write and decode |
| `contact.ts` | plate-vs-plate overlap measurement |
| `font5x7.ts` | bitmap labels for the diagnostic images |

## Licence

MIT — see [LICENSE](LICENSE). Third-party terms, including the Spine editor licence
requirement that this project inherits, are in [NOTICE.md](NOTICE.md).
