# CLAUDE.md

Guidance for AI-assisted sessions working on this repository.

## What this is

rigc compiles a **rig spec** plus a motion spec — and, for a cut with measured art
behind it, a cut manifest — into Spine 4.3 skeleton data and a one-part-per-page
atlas, then round-trips the result through `@esotericsoftware/spine-core` and 31
named assertions before anything is written. Read [README.md](README.md) for the
formats, the CLI and the assertion list; [`src/rig.ts`](src/rig.ts) is the rig
spec's own documentation.

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

## Conventions

- Bun + TypeScript, ESM, `.ts` extensions in relative imports.
- `src/` is pure: no clock, no randomness, no network, no spine-core (the round
  trip belongs to `src/validate.ts` alone, and `src/compile.ts` must stay
  independent of it so the two are not checking each other's assumptions).
- Coordinate contract: manifests are in **crop pixels, y down, origin top-left**;
  Spine world is **y up, origin at the bottom-left of the crop**. The whole
  conversion lives in `src/transform.ts` (`cropToSpineY`, `toBoneLocal`,
  `screenToSpineDegrees`). Do not open-code it anywhere else.
- Conventional Commits, English subject and body. Commit each finished unit.
- Pushing, tagging and publishing are the owner's call.

## Where the cited plan documents live

The comments throughout `src/`, `tools/` and `selftest.ts` cite design documents as
`plan 01 …` through `plan 05 …` (roughly 95 citations). Those documents are **not in
this repository** — they are in the blosharper repo at
`sandbox/dlc/spine_pipeline/plan/`, where this code was developed before the split.
They are the record of *why* each assertion exists, and most of them were written
after a failure that the assertion now catches.

`spine_builder.py:49`, cited in `src/validate.ts`, `selftest.ts` and (since the
archetype tables became data) that repo's `rigs/joint_closeup_v1.rig.json`, is
likewise a file in that repo's `sandbox/dlc/spine_pipeline/_scaffold/` — the
superseded generator whose two structural bugs became assertions `A24` and `A25`.

---

## PUBLIC GATE

This repository is a **snapshot** taken from a game project's sandbox on
2026-08-22, and the split moved the *cut-specific files* out but deliberately did
**not** sanitise the code. Everything below is a game-specific or cut-specific
identifier that is still hardcoded and **must move from code to data before this
repository goes public.** The list is an inventory, not a task order — it is here so
that a session that opens this repo cannot mistake the current state for a clean one.

### 1. ~~`src/archetype.ts` — the archetype tables are code~~ ✅ RESOLVED 2026-08-22

`src/archetype.ts` is **gone**. The three formations are rig spec files
(`spec: "rigc-rig/1"`, [`src/rig.ts`](src/rig.ts)) in the owning project at
`sandbox/dlc/spine_pipeline/rigs/`, and a cuts.json entry names one with a `rig`
path. `face_overlay_v1` got no file: it and v2 were one formation and a mesh-tier
flag, and that flag is `invariants.meshSlots` now. The acceptance test was
byte-identity, and all four of that project's cuts still emit the same
`skeleton.json` and `skeleton.atlas`.

⚠️ **What that removed and what it did not.** The cut-specific *names* — `axis`,
`piston`, `lip`, `fluid_src`, `rim_grip_a`…`d`, `body_soft`, `fluid_pool`, `near`,
`grade` — left this repository with the tables. They are still all over `src/`,
`tools/` and `selftest.ts` as examples, comments and mutant targets, and items 2, 4
and 5 below are unchanged. The headline item is closed; the inventory is not.

### 2. `src/validate.ts` — assertions whose meaning is that cut's anatomy

The assertions read the rig spec's `invariants` block rather than the names
directly, so they are mechanically general — but their doc comments, and their
reason for existing, are that one formation:

- `A24_AXIS_SPACE_STROKE` — "the stroke", "the axis bone", the ~40° sibling-variant
  measurement.
- `A25_DETACHED_BONE_PARENTAGE` — `fluid_src` must not be parented under `piston`.
- `A26_SLOT_DRAW_ORDER` — `lip` must be drawn after `piston`, described in terms of
  what that adjacency depicts.
- `A28_RIBBON_ROWS_SHARE_WEIGHTS` — "the drip", "the sag".
- `A29_STROKE_WITHIN_CONTACT_DEPTH` / `A30_STROKE_WITHIN_CAP_CONTAINMENT` — both are
  stated as anatomical rules, and `A29` carries a dated owner quotation.
- `A11` / `A12` / `A14` / `A15` are stated in terms of one specific renderer's
  behaviour (`spine-html`, named at `src/validate.ts:249`). True of that renderer;
  presented as though it were the only consumer.
- `A13_MESH_BUDGET` hardcodes **4 mesh slots** and **80 triangles** — a budget from
  the owning project's frame time, not a property of Spine. Should be configurable.

### 3. `src/compile.ts`, `src/types.ts`, `src/png.ts`

- `src/compile.ts:293` — Korean quotation.
- `src/compile.ts:329` — comment cites `hide: ['lip']`, a probe belonging to the
  owning project.
- `src/types.ts:136` — cites `rigc/tools/contact.ts`, a path that only made sense
  before the split.
- `src/png.ts:7` — "no NODE_PATH into the game repo", plus a Korean quotation.

⚠️ Line numbers in this section go stale on every edit to those files. Grep for the
quoted text, not for the number.

### 4. `selftest.ts` — fixture-bound, and the fixtures are that game's art

This is the largest item, and it grew: the suite is now 4 positive controls, 44
artifact mutants and 7 rig-spec refusals, and all of them are hand-aimed at the same
fixtures. The rig-spec suite added a dependency of its own — it reads the `rig` path
out of the cuts table and edits that file, so it needs the rig specs as well as the
art.

The mutants are hand-aimed:

- **Cut ids** it requires a `cuts.json` to supply: `face_trial`, `joint_dev`,
  `seam_trial`.
- **Attachment / bone / animation names** it edits by hand: `eye_l`, `eye_r`,
  `eye_l_closed`, `eye_r_closed`, `mouth`, `mouth_wide_open`, `mouth_aperture`,
  `face_base`, `blink_once`, `blink_auto`, `talk`, `idle`, `piston`, `piston_slow`,
  `piston_fast`, `axis`, `lip`, `occluder`, `base`, `fluid_src`, `fluid_pool`,
  `00_base_body`, `03_fluid_overflow`, `05_fluid_pool`.
- **Literal values from those artifacts**: `size: 277, 191`, `bounds: 0, 0, 136, 107`,
  `../parts/eye_r_closed.png`, `pma: false`, and the deliberately minimal numeric
  edits (+10px, +43px) calculated against a shipped rig's own margins (75.733 against
  a ceiling of 118).
- A dated owner quotation on `M32`.

⇒ **A fresh clone cannot run `bun run selftest`.** It needs a `cuts.json` naming
those three cuts, and the art they point at is not public. Until the suite is
re-based on public fixtures — the official Spine examples are the obvious candidate,
see README, *The yardstick* — this repository ships a gate it cannot demonstrate.

### 5. `tools/`

- `tools/contact.ts:4-5` — a dated owner quotation in Korean, plus `04_body_soft`
  and `lip` named as the parts being measured.
- `tools/measure_contact_depth.ts:40` — argument defaults `massSlot = 'body_soft'`,
  `againstSlot = 'lip'`.
- `tools/measure_joint_anchors.ts` — written for `joint_closeup_v1` specifically
  (it derives that rig's 17 non-root anchors).

### 6. Everything cited but absent

~95 `plan 0X section Y` citations and 3 `spine_builder.py:49` citations point into
the blosharper repo (see *Where the cited plan documents live* above). Before going
public these need to either resolve to something a reader can open, or be rewritten
to state the invariant without the citation.

### 7. The rig-spec paths in `bench/transcriptions/` are not a substitute

`bench/transcriptions/3-timing-and-spacing/` proves the rig spec can express a
public skeleton, and it is public-domain data (that example's `license.txt` releases
the project file). It is **not** a fixture the selftest can run on: a transcription
exercises the compiler, not the 31 assertions, and item 4 still stands. Re-basing
the suite on public fixtures remains open.
