# CLAUDE.md

Guidance for AI-assisted sessions working on this repository.

## What this is

rigc compiles a **rig spec** plus a motion spec — and, for a cut with measured art
behind it, a cut manifest — into Spine 4.3 skeleton data and a one-part-per-page
atlas, then round-trips the result through `@esotericsoftware/spine-core` and 41
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
  emitted artifacts without the round-trip having run. **Correctness is the whole
  of the reason, and it is sufficient by itself:** the round trip through the
  official parser is the only thing that makes the output trustworthy; a bypass
  turns rigc back into a program that prints plausible JSON. Do not accept a
  "just for testing" bypass.

  A second reason stood here until 2026-09-05, when issue #398 retired it: that a
  build path not linking the runtime would be a Spine-format emitter with no
  runtime dependency, and that rigc therefore "must remain structurally incapable
  of being used as a substitute for" the editor. Declaring a format-agnostic core
  with its own format and player (issue #380) makes that a promise the roadmap
  already contradicts, and an unkeepable promise is worth less than none — so it
  is retired rather than reworded. What that does not touch: rigc links
  `spine-core`, so the Spine Runtimes License covers running it. That is a fact
  about what the code links, [NOTICE.md](NOTICE.md) states it, and it stands
  whether or not the clause does.

  ⚠️ **None of that authorises an emit path with no oracle behind it.** What the
  invariant requires is that everything written to disk was read back by a parser
  rigc did not write, and spine-core is what supplies that today. A backend
  emitting rigc's own format has no such parser, so it needs its own: issue
  #380's cross-backend oracle is the prerequisite for shipping one, not a nicety
  attached to it.
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
- **rigc compiles an object. The scene belongs to the consumer.** What the rig
  can *do* is ours — its angles, its jiggle, its expression axes, the sockets
  something attaches to, and the guarantee that its animations meet cleanly at
  their rest poses. *When* it does any of that is not: the order animations play
  in, what else is on screen, where the camera is, how two characters relate.
  The line is not a modesty; crossing it makes the claims contradict each other,
  because the code already refuses what the prose would be promising.

  ⭐ **It is a name for a choice already made, which is why it holds.**
  `gallery/look` deliberately makes a face angle *a value rather than a time* —
  the object offers a dial and does not decide when it turns. A39 poses a
  slider-applied animation at the slider's own mapping for the same reason
  (issue #407): posing it as if a track were playing it invents a moment the
  object never claimed.

  ⚠️ The failure mode is vocabulary, not code. `films/three-scene` states the
  boundary exactly right in its own text — *"that is a property of the rig
  rather than of the assembler"*, measured at 0 differing pixels across the
  hand-offs — and then the README caption over it calls the same thing "scene
  direction". Prefer the honest claim, which is also the stronger one and the
  only measurable one: **rigc makes an object that can be directed. It
  guarantees the seams; the consumer does the composing.**

  🎬 **A demo is the one place a scene belongs, because there we are the
  consumer.** Showing what an object can do means putting it in time, and
  someone has to compose that take — so `films/three-scene` is a scene, made
  deliberately, and its name is honest. What is not honest is presenting that
  composition as a rigc capability. The film may stage; the caption may not
  claim. Read a "scene" in this tree as a question of *who is speaking*: the
  demo says "we composed this with the tool", the product may only say "here is
  what the object gives you to compose with".

- **The same doctrine governs how the repository is worked, and for a while it
  did not.** Everything above says an agent is the author and the messages are
  its only interface — and then the working habit was to carry decisions to the
  owner for a ruling. Those two contradict, in the same file. A tool built on
  the premise that the work happens without a person watching cannot be *built*
  by asking a person to watch.

  ⇒ **The fix is a change of lens, not a transfer of authority.** Most questions
  worth carrying to a person are artifacts of looking at the work through a human
  organisation, where conventions have owners and "which would you prefer" is a
  real question. Under the lens this tool is built for they dissolve, because the
  criterion is never preference: *which reading is derivable*, *which claim is
  measurable*, *does a gate already cover this*. Each of those answers itself,
  and each was asked of a person here at least once.

  What survives the lens is short and none of it is a convention: direction,
  licence posture, what the spend is worth, and any text that speaks as the
  owner. Everything else is decided by stating the argument, because **stating a
  decisive argument *is* the decision** — taking it to a human afterwards is a
  round trip wearing a review's clothes.

  🔒 **And a question that survives because the tree cannot answer it is a card
  or a check, never a question.** This is the doctrine's own first move applied
  one level up: the answer to "an agent cannot see it" was never "ask someone",
  it was "convert the silence into a named failure". So "I cannot tell" is not a
  reason to escalate — it is the exact condition this tool exists to remove, and
  meeting it means the instrument is missing.

  🚨 **This is not a licence to be more confident.** A reviewer was doing real
  work — forcing the argument to be said out loud — and removing one without
  replacing it makes the tree worse, not faster. The replacement is adversarial
  structure *below*: a task that says **measure it yourself rather than trusting
  this brief, and report what you rejected** comes back having contradicted its
  own instructions where they were wrong, which is the outcome to design for.
  Two claims in a task brief were corrected that way on the day this was written,
  and neither would have been caught by reading the brief again.

  📖 **The reader to write for is an agent with no memory of the conversation
  that produced the work.** So a thing settled in a chat and not written into
  the tree did not happen. What convinces such a reader is exactly what the
  gates already produce — **a claim with its measurement beside it, and the
  alternative that was rejected with the reason** — which is why commit messages
  and pull requests here carry the argument rather than a summary of the diff.
  That is not ceremony; it is the only channel that survives the session.

## Conventions

- Bun + TypeScript, ESM, `.ts` extensions in relative imports.
- `src/` is pure: no clock, no randomness, no network. **Three** files link
  spine-core and they are named here, because an unnamed exception is how a rule
  erodes: `src/validate.ts` owns the round trip, `src/render.ts` poses a
  skeleton in order to draw it, and `src/deformmeasure.ts` poses one in order to
  measure what a deform key did to it. All three are the same justification —
  posing *is* running the runtime, and there is no honest way to read a posed
  vertex without it. What the rule protects has not moved: `src/compile.ts` must
  stay independent of the runtime so the compiler and the gate are not checking
  each other's assumptions.

  ⚠️ This sentence said **Two** for two weeks after the third file arrived
  (issue #379) — the rule eroded in exactly the way its own clause predicts,
  because nothing read it. `CUR07` in `selftest.ts` now derives the list from
  the tree and compares, and its sharpest clause is the negative one: nothing
  had ever asserted that `src/compile.ts` does *not* link the runtime.
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
  *nothing* substantive executed exits 2 rather than printing green. Since issue
  #439 that floor is one **per suite** rather than one on their sum, and it is
  counted off the case lines each suite prints rather than restated beside the
  call: any suite that reports it ran and then measures nothing exits 2 by name,
  even when the total grew around it. The summary's own figures are read from the
  same count, so adding a control to a wrapped suite needs no edit to it.
- **A suite's figure counts every case it prints, its own positive control
  included** (issue #451). The tree answered this both ways — four suites counted
  their control and two did not — so no single derivation reproduced the summary
  and the last four figures had to stay literals. The rule is chosen for one
  reason: the tally can only count printed lines, so a convention that subtracts
  something the run printed cannot be derived at all and needs a hand-kept
  exception table beside it, which is the "✅ applied" antipattern this repository
  already has a judgment about. ⚠️ The run's *total* count of positive controls
  was **deleted** rather than derived, because "positive control" is a role and
  not a token on the line: `M16` and `M19` carry the word only because a **control
  bone** is a rig concept, while `T04` and `PS25` are positive controls whose names
  say nothing at all. Six, seventeen and twenty-nine were each a reading of it and
  none of them was the number. Whether every suite *has* one is an invariant rather
  than a figure, and nothing enforces it yet.

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
