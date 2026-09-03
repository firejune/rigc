# CLAUDE.md

Guidance for AI-assisted sessions working on this repository.

## What this is

rigc compiles a **rig spec** plus a motion spec — and, for a cut with measured art
behind it, a cut manifest — into Spine 4.3 skeleton data and a one-part-per-page
atlas, then round-trips the result through `@esotericsoftware/spine-core` and 40
named assertions before anything is written. Read [README.md](README.md) for the
formats, the CLI and the assertion list; [`src/rig.ts`](src/rig.ts) is the rig
spec's own documentation.

[docs/AUTHORING.md](docs/AUTHORING.md) is the guide an agent authors *from* — the
two input files field by field, the emission rules, the CLI loop, and the map from
each named failure to the file that has to change. It is a first-class deliverable,
not a summary of this file: the guide and the validator's messages together are the
only interface an agent that cannot see the rig actually has. **Anything that
changes an input format, an error message or an assertion changes that guide too.**

## The doctrine: a tool for AI, not for people

Everything below follows from one observation. An agent authoring a rig cannot see
it. Spine's parser accepts a great deal of wrongness in silence — the constraint
that vanishes, the NaN curve, the mesh that quietly loses its bone weights — so an
agent with only a parser for feedback will report success on a broken rig and be
sincere about it. rigc exists to convert that silence into a named failure.

- **The validator's messages are the UI.** They are what the agent reads and what
  it acts on, so a failure detail must name the object, the value found and the
  value required. `A20_MESH_WEIGHTS_COHERENT: mesh "x" vertex 12 weights sum to
  0.9000` is the product. "invalid mesh" is not.
- **Everything in a rig spec resolves by name, and a miss is refused by name.**
  A bone's `parent`, a slot's `bone`, a constraint's `bones` and `target`, a
  draw-order key's `slot`, and an authored mesh's vertex `weights`. The last of
  those used to be the exception — weights carried raw indices into the *emitted*
  bone array, so inserting a bone rebound every vertex of every mesh below it with
  a green gate and an unmoved `diff` (issue #45, the third example in the
  paragraph above, reproduced rather than caught). Spine's index encoding is still
  reachable behind `"boneIndexing": "raw"`, because what it buys is exactly the
  silence, and that has to be asked for.
- **The compiler never invents a value that is not in the spec.** No defaults
  guessed from the art, no re-measuring of plates, no "reasonable" fallbacks. If a
  number is missing, that is a `CompileError` naming the field. A compiler that
  fills in gaps produces rigs nobody can reason about — and it makes the manifest
  stop being the record of what was measured.
- **Emit only after green.** `build` compiles, validates, and writes *only* if
  every assertion passes. Never reorder that. A wrong file on disk outlives the
  console output that warned about it.
- 🔒 **Validation through spine-core is not optional — this is a structural
  invariant, not a default.** There must never be a `--no-validate` or
  `--emit-anyway` flag, an environment escape, or an exported API that hands back
  emitted artifacts without the round-trip having run. Two reasons, and either one
  alone is sufficient:
  1. **Correctness.** The round trip through the official parser is the only thing
     that makes the output trustworthy; a bypass turns rigc back into a program
     that prints plausible JSON.
  2. **Licensing.** rigc links `spine-core`, so the Spine Runtimes License covers
     running it — see [NOTICE.md](NOTICE.md). A build path that does not link the
     runtime would be a Spine-format emitter with no runtime dependency, i.e.
     exactly the shape of a tool for working around the editor licence. rigc is
     complementary to the Spine editor and must remain structurally incapable of
     being used as a substitute for it. Do not accept a "just for testing" bypass.
- **Determinism is a contract, not a habit.** `A18_DETERMINISTIC_EMIT` compares a
  second, independent compile byte for byte. Anything non-deterministic —
  iteration over an unordered set, a timestamp, a locale-sensitive format, floating
  noise — breaks it, and that is the point.
- **A gate nobody has seen fail is not a gate.** Every assertion needs a mutant in
  `selftest.ts` that makes it fire, and every suite needs a positive control. An
  assertion whose data is absent reports **SKIP**, never a pass — folding vacuous
  checks into the pass count is how a gate comes to look kept while checking
  nothing.
- **No `any`, no `as any`, in `src/` or `cli.ts`.** `selftest.ts` is the one
  exception and it is scoped: the mutants deliberately forge malformed skeleton
  JSON, so they turn the rule off around the mutant tables and back on after.
  Since 2026-08-22 `bun run lint` enforces this rather than a reader, which is
  also what makes the scope of that exemption checkable — the file's
  `eslint-disable` comments now have to actually bracket every `any` in it.

## Conventions

- Bun + TypeScript, ESM, `.ts` extensions in relative imports.
- `src/` is pure: no clock, no randomness, no network. **Two** files link
  spine-core and they are named here, because an unnamed exception is how a rule
  erodes: `src/validate.ts` owns the round trip, and `src/render.ts` poses a
  skeleton in order to draw it (posing *is* running the runtime; there is no
  honest way to render one without it). What the rule protects has not moved —
  `src/compile.ts` must stay independent of the runtime so the compiler and the
  gate are not checking each other's assumptions.
- **A new runtime import that crosses a directory has to be added to `files` in
  `package.json`.** The published package is an allowlist, not the repository:
  `cli.ts`, `src/`, and the only two modules `src/` reaches outside itself
  (`tools/plate.ts`, `tools/font5x7.ts`). Nothing in the tree fails if a third is
  added and not listed — the repository still runs — but the installed package
  throws `Cannot find module` on the command that needs it. `npm pack --dry-run`
  lists what would ship; RELEASING.md says what belongs there and why.
- Coordinate contract: manifests are in **crop pixels, y down, origin top-left**;
  Spine world is **y up, origin at the bottom-left of the crop**. The whole
  conversion lives in `src/transform.ts` (`cropToSpineY`, `toBoneLocal`,
  `screenToSpineDegrees`). Do not open-code it anywhere else.
- Conventional Commits, English subject and body. Commit each finished unit.
- Pushing, tagging and publishing are the owner's call.

## Verification — run these before you call a unit finished

| Command | Checks |
| --- | --- |
| `bun run typecheck` | `bunx tsc --noEmit` over `cli.ts`, `selftest.ts`, `src/`, `bench/`, `tools/`, `fixtures/`. `strict: false` with `strictNullChecks: true` — see the comment in `tsconfig.json` before raising it |
| `bun run lint` | one rule: `@typescript-eslint/no-explicit-any` as an **error**. `eslint.config.js` says why it is only one |
| `bun run selftest` | the validator's own negative controls, on fixtures it generates. Add `--cuts <cuts.json>` to gate a project's real cuts as well — see *The selftest and its fixtures* |
| `bun cli.ts bench 3 --candidate <dir>` | the ladder still reproduces its rung. `docs/LADDER.md` carries the B1 proof to compare against |
| `bun cli.ts check --candidate <dir> --frames <dir>` | the candidate still *looks* like the reference. The gate cannot see a wrong animation — it passed a build with every easing reversed — so a change to timelines, curves or the rasteriser is not verified until this has run |

Neither of the first two existed before 2026-08-22, and both found real defects on
their first run — a `let` assigned inside a callback that made 30 later reads
type-check against `never`, and a spread that quietly overwrote the file paths in
`diff --json`'s and `bench --json`'s own reports. Assume the same of the next rule
anybody adds: turn it on, read what it says, fix it, and only then commit it.

Anything touching an input format, an error message or an assertion also changes
[docs/AUTHORING.md](docs/AUTHORING.md).

## The selftest and its fixtures

`bun run selftest` is **self-contained**. It needs no arguments, no art and no
private repository — a fresh clone can run it, and CI does.

Where its fixtures come from, in three tiers:

| Tier | Built by | What it carries |
| --- | --- | --- |
| **generated rigs** | [`fixtures/public.ts`](fixtures/public.ts), into a temp dir per run | `overlay_probe`, `articulated_probe`, `contained_probe` — between them: region attachments, attachment swaps, rgba fades, a ring mesh on a control bone, a ribbon on a bone chain, an axis bone, a detached emitter, physics constraints, and both measured ceilings |
| **inline probes** | `selftest.ts` itself | the two-slot rig the static-rig and draw-order suites break |
| **the example corpus** | `bun run fetch-examples` | the rung-3 and rung-6 transcriptions and their rendered reference frames, which the `diff`, `check` and mesh suites measure against |

Three rules hold that together and none of them is optional:

- **The plates are checkerboards with `PLACEHOLDER` burned into them.** They exist
  to be structurally real — a true size, a true alpha channel, in the place the
  manifest says — so the compiler measures something and the atlas points
  somewhere. No claim about seams, blending or appearance can come from any of
  them, and none is made.
- **No mutant hardcodes a measured number.** Vertex offsets are found by walking
  the weight run (`weightRuns`, `firstBlendedRun`), atlas edits target the first
  page or region structurally, and the two ceiling mutants state the *smallest*
  whole-pixel edit that crosses the line — which is checkable only because
  `fixtures/public.ts` chose the gap. Reintroducing a literal here is how the
  suite became unrunnable outside one repository the first time.
- **An absent corpus is a HOLE, not a pass.** When `examples/` is missing the
  `diff` and `check` suites say so loudly, the summary repeats it, and a run where
  *nothing* substantive executed exits 2 rather than printing green.

`--cuts <cuts.json>` (or `RIGC_CUTS=<path>`) adds an **extra suite**: every cut in
that table is compiled, gated and compiled again for `A18`. It is a positive
control and deliberately nothing else — hand-aiming a second set of mutants at
somebody's real art is what made this file unrunnable before. What real art adds
is the geometry: measured offsets, a measured axis, a measured ceiling, a mesh
built over a contour nobody drew by hand. So the question it asks is the one only
those cuts can answer — *does the whole gate still come back green on them?*

⚠️ A cuts path that is **named and missing** exits 2. Treating a typo as "no cuts
file" would mean the one caller who asked for the extra suite is the one caller
who silently does not get it. A path that is not named at all is a normal run.

## Going public

The repository was a snapshot of a game project's sandbox, and the split moved the
cut-specific *files* out without sanitising the *code*. That inventory is closed;
what follows is what keeps it closed.

- **Cut-specific knowledge lives with the consumer, not here.** Slot names,
  anatomy, plan documents, per-project budgets. If a comment, a default or an
  assertion can only be understood by someone who has seen one particular set of
  art, it is in the wrong repository.
- **An archetype assertion reads the rig, never a name.** A24–A30 and A39 take
  everything they know from the rig spec's `invariants` block, and
  `A13_MESH_BUDGET` takes
  its two numbers from `invariants.meshSlots` / `invariants.meshTriangles`. A
  budget baked in here would be one consumer's frame time failing correct foreign
  data — the editor's own example projects ship meshes many times denser.
- **An assertion with nothing to measure reports SKIP.** Never a pass. A rig that
  declares no invariant is unmeasured, not certified, and the two must not print
  the same. ⚠️ The failure mode is subtler than forgetting to write the SKIP: an
  assertion can have a *default* that quietly turns "nothing to measure" into a
  measurement of the wrong thing. `A21_MESH_RIM_PINNED` resolved a mesh's kind as
  `meshKinds[slot] || 'ring'`, so authored geometry — which has no entry, because
  rigc did not build it — was checked as a ring and reported 40 failures on a
  correct 40-vertex editor mesh. `meshKinds` now has a third state, `authored`,
  and the generator-topology rules skip on it (issue #44).
- **Design notes live with the consumer.** Comments state their invariant outright
  rather than citing a document a reader cannot open.

Two tools moved out with the cuts they only made sense for
(`measure_joint_anchors.ts`, `make_stroke_strip.ts`); they import rigc's generic
helpers back through the owning project's symlink. The generic measuring tools
stayed, minus their per-cut defaults — `tools/measure_contact_depth.ts` now
requires both slot names, because a default would measure the wrong pair on the
next cut and still print a plausible number.
