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

> **The benchmark harness does not exist yet.** Fetching the examples is all that
> is wired up today; there is no comparison runner, no scoring, no reported
> numbers. This section describes the intended measure, not a result.

### Benchmark ladder — what the rungs need

[docs/SPEC_COVERAGE.md](docs/SPEC_COVERAGE.md) surveys the full Spine 4.3 export surface against what
rigc emits and against what the nine examples measurably use (`bun run bench:usage` regenerates the
counts). Three blockers sat *before* rung 1: **B1**, the bone tree is code in `archetype.ts` rather than data,
so no example can be expressed at all; **B2**, `A16`'s regex rejected the `"4.3.75-beta"` that every
example declares; and **B3**, every example ships a **packed** atlas (13–50 regions per page) against
rigc's one-part-per-page model, which `A06` enforced unconditionally. B2 is fixed and B3's validator
half is: the packed-atlas clauses now live behind `--profile` (above). B1 is open. Ordered gap list in
Part 4 of that document.

## What exists today

**Inputs — two files per cut.**

- A **cut manifest** (`FaceManifest` in [`src/types.ts`](src/types.ts)): the
  measured facts about the art. Crop rectangle, the base plate, one entry per part
  with its offset and size, and — for the joint archetype — the entry point, the
  insertion axis (`deg` in screen degrees plus a `unit` vector, cross-checked
  against each other), stroke amplitudes, and any measured ceilings. The compiler
  **never re-measures art**: every number here is produced by a measuring tool or
  by the pipeline that cut the plates, and rigc only reads it.
- A **motion spec** (`MotionSpec`, `spec: "rigc-motion/1"`): the archetype to build,
  named easing handles, setup overrides, physics constraints by name, and the
  animations — each with a declared duration, a loop flag, and its tracks.

**Outputs — two files per cut**, written to the cut's `out` directory:

- `skeleton.json` — Spine **4.3** skeleton data. Bones, slots in draw order, one
  skin, animations, and constraints in the 4.3 single `constraints` array.
- `skeleton.atlas` — a **one-part-per-page** atlas: every region covers its whole
  page, `pma: false`. That convention is what makes the region/attachment/filename
  join key checkable exactly rather than by convention.

**Archetypes** ([`src/archetype.ts`](src/archetype.ts)) are the named bone/slot
formations a spec can ask for: `face_overlay_v1`, `face_overlay_v2`,
`joint_closeup_v1`. An archetype fixes the skeleton's shape and the draw order; the
manifest supplies that cut's numbers. A missing anchor is a compile error by
design — so that copying another cut's numbers is not the path of least resistance.

### The validator

[`src/validate.ts`](src/validate.ts) parses the emitted artifacts with `spine-core`
and then runs 31 named assertions over the loaded skeleton. Each one exists because
the failure it catches is **silent**: the file loads, animates, and lies.

Assertions whose data is absent are reported as **SKIP**, never folded into the pass
count — an assertion with nothing to check has not checked anything.

#### Profiles — "wrong" versus "not how we do it here"

Not all 31 rules are about Spine. Some are about **spine-html**, the renderer this
compiler was built to feed, and about one project's frame budget; they fire on real,
correct, editor-produced Spine data, because the official example projects carry
clipping attachments, unweighted meshes, 116-triangle meshes and packed atlases —
all valid, none of them things spine-html will draw. Others are about **rigc's own
archetypes** and mean nothing at all on a skeleton rigc did not compile.

So `validate` and `build` take a `--profile`:

| Profile | Runs | For |
| --- | --- | --- |
| `spine-html` | all 31 | **the default.** Is this a rig this project can ship? |
| `spine` | the 17 validity rules | Is this valid Spine 4.3 that any runtime plays correctly? |

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
| `A26_SLOT_DRAW_ORDER` | archetype | the slots array — which *is* the draw order — matches the archetype's slot table |
| `A27_REGION_NAME_MATCHES_PAGE_FILENAME` | renderer | each region's name equals its page's basename, closing the second link of the attachment → region → file chain |
| `A28_RIBBON_ROWS_SHARE_WEIGHTS` | archetype | both vertices of a ribbon row carry the same bones at the same weights, so the strip can lengthen and curve but never widen |
| `A29_STROKE_WITHIN_CONTACT_DEPTH` | archetype | the stroke plus any inward keys stays within the cut's measured contact depth (skipped when the manifest declares none) |
| `A30_STROKE_WITHIN_CAP_CONTAINMENT` | archetype | the stroke stays within the cut's measured containment ceiling, and nothing in the axis subtree scales — a scale key changes the contour the ceiling was measured on (skipped when the manifest declares none) |

## Usage

```bash
bun install
```

Compile a cut by spelling out its three paths:

```bash
bun cli.ts build \
  --manifest path/to/manifest.json \
  --motion   path/to/my.motion.json \
  --out      path/to/spine
```

…or register cuts in a `cuts.json` and build them by name. Every path in the table
resolves **relative to the `cuts.json` file itself**, so the table lives with the
project that owns the art:

```json
{
  "my_cut": {
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
```

`validate` on a bare directory checks what it can see. Adding `--cut`/`--cuts` lets
it re-derive the declared durations and the structural expectations too, and the
report says which it had. `build` and `validate` both take `--profile spine` to drop
the renderer and archetype policy; the default stays `spine-html`.

## Selftest

```bash
bun run selftest --cuts path/to/cuts.json
```

A gate nobody has seen fail is not a gate. The selftest takes real compiled
artifacts, breaks them one way at a time — 35 deliberate breaks, each modelled on a
mistake that was actually made or actually measured — and asserts that the **named**
assertion fires for each. There is a positive control per suite as well: the
pristine artifacts must come back with zero failures, because a validator that
failed everything would otherwise look like a validator that worked.

> ⚠️ The selftest is currently **fixture-bound**: its mutants name specific
> attachments, bones and animations, so it needs a `cuts.json` supplying the three
> cuts it was written against. Those fixtures are not in this repository. See
> [CLAUDE.md](CLAUDE.md), *PUBLIC GATE*.

## Layout

```
cli.ts          build / validate / explain
selftest.ts     the validator's own negative controls
src/
  compile.ts    manifest + motion spec -> skeleton JSON + atlas text (pure data assembly)
  validate.ts   spine-core round trip + the 31 assertions
  archetype.ts  the named bone/slot formations
  mesh.ts       ring and ribbon mesh builders, weighted-vertex encoding
  transform.ts  crop pixels (y down) <-> Spine world (y up), world transforms
  png.ts        PNG header reader (size and colour type, no decode)
  types.ts      manifest, motion spec, and emitted-JSON shapes
tools/          measurement and plate helpers (see below)
scripts/        fetch-examples.sh
bench/          count_features.ts — what the example corpus actually uses
docs/           SPEC_COVERAGE.md (format survey), feature_matrix.{csv,json}
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
