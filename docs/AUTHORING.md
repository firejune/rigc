# Authoring a rig with rigc

**Read this before you write a spec.** It is written for an agent that has never
seen this repository and cannot see what it is authoring. Together with the
validator's messages it *is* the interface: there is no editor viewport here, so
the only way to know a rig is right is to compile it and read what comes back.

Two input files, one CLI loop, and a list of named failures. Everything below is
checked against the code that implements it.

- Formats and CLI reference: [README.md](../README.md)
- The rig spec's own source-level documentation: [`src/rig.ts`](../src/rig.ts)
- The motion spec and emitted shapes: [`src/types.ts`](../src/types.ts)
- What the format holds and rigc covers: [SPEC_COVERAGE.md](SPEC_COVERAGE.md)

## The vocabulary is Spine's

Wherever rigc has no better abstraction it uses **Spine 4.3's own concept, its own
field name and its own default**, so that what you know about the Spine User Guide
transfers: *bones*, *slots*, *draw order*, *skins*, *setup pose*, *region
attachments*, *meshes*, *animations* and *timelines*, and the constraint families
(*IK*, *transform*, *path*, *physics*). The emitted file is
[Spine's JSON format](http://esotericsoftware.com/spine-json-format) — nothing else.

rigc's own additions sit on top and are few: `from` on a bone, `image` on an
attachment, `generator` on a mesh, and an `invariants` block. They are named so you
can see where Spine stops.

---

## 0. The loop

```bash
bun install                                   # once

bun cli.ts build \
  --rig    path/to/my.rig.json \
  --motion path/to/my.motion.json \
  --images path/to/images \
  --out    path/to/spine \
  --profile spine

# read the report → fix the spec → run it again
```

`build` compiles, round-trips the result through `@esotericsoftware/spine-core`,
runs the named assertions, and **writes only if every one of them is green.** A red
run leaves nothing on disk, so there is no half-written artifact to mistake for a
result. There is no `--no-validate`, and there will not be one.

What the flags mean:

| Flag | Meaning |
| --- | --- |
| `--rig` | the rig spec — skeleton structure |
| `--motion` | the motion spec — time |
| `--out` | directory for `skeleton.json` + `skeleton.atlas`; atlas page paths are written relative to it |
| `--images` | where the rig spec's `image` names resolve (overrides the rig's own `images` field, and is relative to your working directory) |
| `--manifest` | a cut manifest. Only for a rig with **measured art** behind it; a foreign skeleton has none |
| `--profile` | `spine` = the 17 validity rules · `spine-html` = all 31 (**the default**) |

Pick the profile deliberately. `spine-html` adds one renderer's policy and one
project's canvas budget, and those rules fire on perfectly correct Spine data
(clipping attachments, unweighted meshes, packed atlases). If what you are
authoring is "valid Spine 4.3 that any runtime plays correctly", use
`--profile spine`. A report always prints which profile ran and lists what that
profile left out, on `PROF` lines.

The other commands:

```bash
bun cli.ts explain  --rig … --motion … --out …   # the compiled rig as a table
bun cli.ts validate path/to/spine                # re-gate artifacts already on disk
bun cli.ts diff     candidate.json reference.json
bun cli.ts bench    3 --candidate path/to/spine
```

- **`explain`** is the one to reach for when a rig compiles but looks wrong. It
  prints the stage, every bone with its resolved parent and position, the slots in
  draw order with their setup attachment, and every animation's timelines key by
  key with the curve kind. It does not write anything.
- **`diff`** compares two skeletons and reports **a ratio per measure** in six
  sections (bones, slots, attachments, constraints, animations, events). It
  deliberately does not combine them into a score: a rig with the right skeleton
  and the wrong timing and a rig with the right timing and the wrong skeleton call
  for opposite fixes. A measure with nothing to compare says `0/0` and says so.
- **`bench <rung>`** runs one rung of [the benchmark ladder](LADDER.md): validate
  under `--profile spine`, then diff against that rung's reference export.

---

## 1. The two files

### 1.1 A complete minimal rig spec

Every field below is required for this to compile; nothing has been trimmed for
brevity. `images/box.png` is a real PNG beside the spec.

```json
{
  "spec": "rigc-rig/1",
  "name": "hello",
  "images": "images",
  "skeleton": { "width": 400, "height": 300 },
  "bones": [
    { "name": "root" },
    { "name": "box", "parent": "root", "x": 0, "y": 120 }
  ],
  "slots": [
    { "name": "box", "bone": "box", "attachment": "box" }
  ],
  "skins": {
    "default": {
      "box": { "box": { "image": "box.png" } }
    }
  }
}
```

That compiles to a two-bone skeleton with one slot showing a region attachment
whose `width`/`height` were **measured from the PNG**, plus a one-page atlas.

### 1.2 A complete minimal motion spec

```json
{
  "spec": "rigc-motion/1",
  "archetype": "hello",
  "cut": "hello",
  "easings": { "smooth": [0.25, 0, 0.75, 1] },
  "animations": {
    "bob": {
      "duration": 1,
      "loop": true,
      "tracks": [
        {
          "bone": "box",
          "property": "translate",
          "keys": [
            { "t": 0,   "v": [0, 0],  "ease": "smooth" },
            { "t": 0.5, "v": [0, 40], "ease": "smooth" },
            { "t": 1,   "v": [0, 0] }
          ]
        }
      ]
    }
  }
}
```

`archetype` must equal the rig spec's `name` — a motion spec was authored against
one skeleton, and pairing it with another aims its keys at bones whose names happen
to match and whose meaning does not.

A motion spec with `"animations": {}` is legal and emits a skeleton with no
animations at all.

---

## 2. The rules that decide what lands in the file

**R1 — A field is emitted exactly when you declare it.** Not "when it differs from
the default". Spine's own exporter omits anything equal to a default; rigc cannot,
because a rig may need to say `x: 0` out loud and because deciding emission from
the *value* would make the file depend on arithmetic rather than on what you wrote.
Omit a field and Spine's default stands; write it and it is in the file.

**R2 — The compiler never invents a value.** No defaults guessed from the art, no
re-measured plates, no reasonable fallbacks. A missing number is a `CompileError`
naming the field.

**R3 — One fact, one author.** A setup pose comes from the rig slot's `attachment`
**or** from the motion spec's `setup` block, never both. A slot's attachments come
from a manifest part **or** from a rig skin, never both. A constraint is declared in
the rig **or** in the motion spec's `physics` table, never both. Each of those is a
compile error rather than a silent precedence rule.

**R4 — The slots array *is* the draw order.** There is no separate draw-order field
anywhere in the format. Index 0 is drawn first (furthest back).

**R5 — `image` means "measure this PNG".** `width`/`height` have **no parser
default** in Spine: omit them in raw JSON and they load as `NaN`, every UV
collapses, and nothing reports an error. Name an `image` instead and rigc reads the
PNG header, fills both in, and emits that same file as the atlas page — so the size
in the skeleton and the size in the atlas cannot drift apart. The **region name is the
PNG's basename**; when your placeholder name differs from it, rigc writes a `path`
so the attachment still joins to the region.

**R6 — A key carries `ease` or `curve`, never both.** A named easing says "this
shape, wherever it is used" and is the recommended path. `curve` is the escape
hatch: the absolute `(time, value)` control points, verbatim, for when every key
needs a different shape.

**R7 — `duration` is declared, and checked.** Skeleton JSON carries no duration
field — the loader takes the largest key time. So you state the duration you meant
and rigc compares it against the compiled result; a mismatch larger than one frame
(1/60 s) is a compile error, and assertion `A09` re-checks it against the *loaded*
skeleton afterwards.

**R8 — `from` needs a cut manifest.** `from.anchor` / `from.slotWindow` /
`from.meshCenter` / `from.rotation` read measured art out of a manifest. Without
`--manifest` they are a compile error naming the bone. A rig with no measured art
behind it writes literal `x`/`y` instead.

**R9 — Nothing is written until every assertion is green.**

---

## 3. The rig spec, field by field

`spec` must be exactly `"rigc-rig/1"`. `name` must be a non-empty string. `bones`
must be non-empty. `slots` must be present (it may be empty).

### 3.1 `skeleton` — the header

| Field | Spine meaning | Default |
| --- | --- | --- |
| `x`, `y` | setup-pose bounding box origin | `0` |
| `width`, `height` | setup-pose bounding box size | falls back to the manifest's crop; **with neither, the compile fails** |
| `fps` | nonessential editor hint | `SkeletonData.fps` stays 30 |
| `referenceScale` | 4.2+ physics/scale reference | parser default 100 |
| `images` | nonessential path hint the editor writes | carried through verbatim |

`spine` and `hash` are not yours to write: rigc emits its own version label
(`A16` re-checks it is on the 4.3 line) and inventing a hash would claim an export
this file did not come from.

`width`/`height` are what `A14` and `A19` measure against, so a guessed stage is a
gate measuring against a number nobody wrote down.

### 3.2 `bones` — Spine's bone list

`parent` is resolved **by name against bones already declared**, exactly as the
parser does. A forward reference is not a rigc restriction: in the loaded skeleton
it would simply be a second root.

| Field | Spine meaning | Default |
| --- | --- | --- |
| `name` | required, unique — the join key for slots, meshes and timelines | — |
| `parent` | omitted only by the root bone | none |
| `length` | bone length; cosmetic in a renderer, part of a faithful reproduction | `0` |
| `x`, `y` | position **local to the parent** | `0` |
| `rotation` | degrees, counter-clockwise, y **up** | `0` |
| `scaleX`, `scaleY` | | `1` |
| `shearX`, `shearY` | | `0` |
| `inherit` | `normal` · `onlyTranslation` · `noRotationOrReflection` · `noScale` · `noScaleOrReflection` | `normal` |
| `skin` | `BoneData.skinRequired` | `false` |
| `color` | `rrggbbaa`, editor affordance | — |
| `from` | **rigc extension** — take `x`/`y` (and optionally `rotation`) from a cut manifest | — |

⚠️ Spine 4.0/4.1 called `inherit` **`transform`**. That old key still *loads* in 4.3
and the inheritance silently falls back to Normal — assertion `A02` refuses it.

### 3.3 `slots` — Spine's slot list, in draw order

| Field | Spine meaning | Default |
| --- | --- | --- |
| `name` | required, unique | — |
| `bone` | required; must be a bone this rig declares | — |
| `attachment` | the **setup pose** attachment name, or `null` for "show nothing" | must come from here or from `motion.setup` (R3) |
| `color` | `rrggbbaa` tint | opaque white |
| `dark` | two-colour tint, `rrggbb` | — (🚫 `A12` under `spine-html`) |
| `blend` | `normal` · `additive` · `multiply` · `screen` | `normal` |

⚠️ **A slot with no attachments is not emitted.** If nothing fills it — no skin
entry, no manifest part — it is dropped from the skeleton without an error, and the
emitted slots array is a *subsequence* of the rig's. That is deliberate: the rig's
slot list is the canonical table and declaring a slot no cut fills is legitimate,
because it fixes where that slot will sit when one does. It also means a typo in a
skin's slot key can cost you a slot quietly, so check `explain`'s slot table.

### 3.4 `skins` — placeholder → attachment maps

`skins` is `skinName → slotName → placeholderName → attachment`. Give at least
`default`; it becomes the skeleton's default skin. (No rung of the benchmark ladder
uses a named skin — all twelve official example skeletons have exactly one skin,
called `default`.)

**Region attachment** ([Spine: region attachments](http://esotericsoftware.com/spine-regions)),
the default `type`:

| Field | Meaning |
| --- | --- |
| `type` | `"region"`, or omit |
| `image` | **rigc extension.** A PNG relative to the rig's `images` directory; rigc measures it (R5) |
| `width`, `height` | required by the format — give them, or give an `image` |
| `path` | the atlas region to resolve; defaults to the attachment's own name. rigc sets it for you when the PNG basename differs from the placeholder |
| `x`, `y` | offset from the bone, in the bone's local space |
| `rotation` | degrees; cancels a rotated bone for a plate authored screen-upright |
| `scaleX`, `scaleY`, `color` | as Spine |

**Mesh attachment** ([Spine: meshes](http://esotericsoftware.com/spine-meshes)) —
either authored geometry (`uvs` + `triangles` + `vertices`, plus `hull`, `edges`,
`width`, `height`) **or** a `generator`, never both.

⚠️ `vertices` carries **no encoding flag**. If its length equals `uvs.length` the
parser reads unweighted x/y pairs; otherwise it reads the weighted run
`boneCount, (boneIndex, bindX, bindY, weight) × n, …`. A coincidental length match
reads weight data as coordinates, silently — that is `A04`.

The two generators are `ring` and `ribbon` (see [`src/mesh.ts`](../src/mesh.ts));
they encode a deformation model rather than a table of numbers, which is why they
are code invoked by data. A generator is for a skeleton with **no** manifest; a cut
that has one invokes the same builders through the manifest's `mesh` block.

### 3.5 `constraints` — 4.3's single typed array

Spine 4.3 folds every constraint into one `constraints` array with a `type`
discriminator. The 4.1/4.2 shape (top-level `ik`/`transform`/`path`/`physics`
arrays) still loads clean and **the constraints simply vanish** — that is `A01`.

rigc emits `ik` ([IK constraints](http://esotericsoftware.com/spine-ik-constraints)),
`transform` ([transform constraints](http://esotericsoftware.com/spine-transform-constraints))
and `physics` ([physics constraints](http://esotericsoftware.com/spine-physics-constraints)).
Field lists are in [`src/rig.ts`](../src/rig.ts); three traps worth carrying here:

- A transform constraint's `properties` names come from a fixed six — `rotate`,
  `x`, `y`, `scaleX`, `scaleY`, `shearY`. rigc refuses anything else by name; in
  raw JSON the parser throws.
- Each transform mix is read **only if the matching `to` property was declared**, so
  a `mixRotate` without a `rotate` entry is dead data.
- A physics constraint's five components all default to 0, so one that names none of
  them parses cleanly and does nothing at all. rigc refuses it up front, and `A23`
  catches it from the other side.

### 3.6 `invariants` — what the artifact cannot say about itself

Optional, and only meaningful for rigc's own formations: `meshSlots` (the mesh
budget), `axisBone`, `massBone`, `detached`. Nothing in skeleton JSON records that a
bone carries a cut's axis or that a parentage is forbidden, so the rig spec says it
and the validator's archetype assertions read it. **An assertion whose field is
absent reports SKIP, never a pass.** If you are reproducing a foreign skeleton,
leave this out entirely and run `--profile spine`.

---

## 4. The motion spec, field by field

`spec` must be `"rigc-motion/1"`; `archetype` must equal the rig's `name`; `cut` is
a label for the shot. Always include an `easings` object — an empty one is fine.

### 4.1 `easings` — named handles

`name → [hx1, hy1, hx2, hy2]`, the **normalised graph-view handles** an editor
shows. rigc converts them per key into the absolute `(time, value)` control points
the JSON actually holds. Writing normalised handles into a raw `curve` instead loads
without error and plays a different curve.

### 4.2 `setup` — the setup pose, per slot

`slotName → { attachment?: string | null, color?: [r, g, b, a] }`, with the colour
channels in 0..1. Declaring a slot's setup pose here **and** on the rig slot is a
compile error (R3). Use whichever file owns the decision: a rig that is purely
structure puts it on the slot; a cut whose overlay mechanism is a decision about
time puts it here.

### 4.3 `animations` — name → animation

| Field | Meaning |
| --- | --- |
| `duration` | seconds, declared and checked (R7) |
| `loop` | a **player hint only** — skeleton JSON has no loop field, so this is not emitted and no assertion or diff measure reads it |
| `note` | free text |
| `tracks` | the timelines |

`groups` (`name → [member, …]`) lets one track target several bones or slots at
once; `lag` shifts every key of a track, and `stagger` adds a per-member delay in
member order.

### 4.4 `tracks` — one target, one property

A track names **exactly one** of `bone`, `slot`, `group`, `physics`. Two tracks on
the same `target.property` is a compile error: merge them.

| Target | `property` | Key `v` |
| --- | --- | --- |
| `bone` | `translate`, `scale`, `shear` | `[x, y]` |
| `bone` | `translatex`, `translatey`, `scalex`, `scaley`, `shearx`, `sheary`, `rotate` | `[value]` |
| `slot` | `rgba` | `[r, g, b, a]` in 0..1 |
| `slot` | `attachment` | the attachment name, or `null` for "show nothing" |
| `physics` | `mix` | `[mix]`, 0..1 — the constraint's authority |
| `physics` | `reset` | `null` — the key *is* the event |

Translate values are **relative to the bone's setup position**; scale values are
multipliers where `1` is setup; rotation is in degrees.

**Single-axis timelines are not sugar.** Spine keys `translatex` and `translatey` as
separate timelines, so an animation that moves along one axis only is *not*
reproduced by a `translate` whose other channel happens to be flat: the timeline
count differs, the key count differs, and so does what a runtime blends against.
Use the paired form when a bone moves on both axes together; use the single-axis
form when only one axis is keyed, or when the two axes need different key times or
different curves. The same applies to `scale`/`scalex`/`scaley` and
`shear`/`shearx`/`sheary`.

An `attachment` key carries no easing — attachment timelines are inherently
stepped.

### 4.5 `keys` — times, values, curves

- `t` is in seconds and **must strictly increase** after `lag`/`stagger` are added.
- `ease` names an entry of `easings`, or the literal `"stepped"`. Absent = linear.
- `curve` is the raw form: **four numbers per value channel**, concatenated in field
  order, as absolute `(time, value)` control points. A short array multiplies
  `undefined` into the cubic and yields `NaN` with no error, so rigc length- and
  finiteness-checks it on the way in (`A05` checks it again in the emitted file).
- A key may carry `ease` **or** `curve`, never both (R6).
- The **last** key of a track can carry neither: there is nothing to ease to, and
  saying otherwise is a compile error.

### 4.6 `physics` — the tuning table

`name → { bone, x?, y?, rotate?, scaleX?, shearX?, inertia?, strength?, damping?,
mass?, wind?, gravity?, mix?, fps?, limit? }`. These are emitted into the 4.3
`constraints` array. `mass: 0` becomes an infinite inverse mass and `damping ≥ 1`
never settles — both are `A23`.

`mix` is a player-side `AnimationStateData` config and is **not** emitted into
skeleton JSON.

---

## 5. Reading a failure

Failures arrive in two layers, and they read differently.

### 5.1 Compile errors — before the gate

A `CompileError` names the object and the field, and nothing is written. These are
the frequent ones, verbatim:

| Message | What to change |
| --- | --- |
| `bone "X" names parent "Y", which is not declared before it` | move `Y` earlier in `bones` |
| `two bones are called "X"` | bone names are the join key; rename one |
| `slot "X" names bone "Y", which this rig does not declare` | add the bone, or fix the slot's `bone` |
| `no setup pose for slot "X": give the motion spec a \`setup\` entry or the rig slot an \`attachment\`` | R3 — pick one file and declare it there |
| `a region needs width and height — give them, or give an "image" and rigc will measure the PNG` | add `image`, or both sizes |
| `image "X.png" is not on disk at …` | fix the name, or point `--images` at the right directory |
| `duplicate region name "X"` | two PNGs share a basename; one part, one page, one name |
| `motion spec names archetype "A" but the rig spec at … is called "B"` | make `archetype` equal the rig's `name` |
| `animation "A" declares duration Ns but its last key is at Ms` | R7 — fix whichever of the two you meant |
| `animation "A" keys unknown bone "X"` | the track's `bone` is not in the rig |
| `animation "A" bone "X" translatex: key value must be an array of 1 number(s)` | the value shape must match the property (§4.4) |
| `a key carries both a named easing and a raw curve; pick one` | R6 |
| `last key carries an easing but has nothing to ease to` | drop `ease`/`curve` from the final key |
| `key times must strictly increase (at t=…)` | including after `lag` and `stagger` |
| `animation "A" has two tracks on X.property; merge them into one track` | one timeline per target property |
| `no stage size: give the rig spec a \`skeleton.width\`/\`skeleton.height\`` | §3.1 |
| `bone "X" takes its position from …, which needs a cut manifest` | R8 — pass `--manifest`, or write literal `x`/`y` |

### 5.2 Assertions — the gate

The report prints one line per assertion:

```
  PASS  A08_REGION_NAMES_MATCH_ATTACHMENTS
  SKIP  A21_MESH_RIM_PINNED: the skeleton has no weighted mesh attachment, …
  PROF  A11_NO_CLIPPING_ATTACHMENTS: renderer rule, not in profile "spine"
  FAIL  A20_MESH_WEIGHTS_COHERENT: mesh "x" vertex 12 weights sum to 0.9000
```

- **PASS** — it ran and held.
- **SKIP** — it had *nothing to look at*, and the reason says what was missing. A
  skip is never folded into the pass count.
- **PROF** — the profile you chose does not carry that kind of rule. A
  `--profile spine` green means *valid Spine*, never *passes the renderer policy*.
- **FAIL** — the detail names the object, the value found and the value required.
  That detail is the instruction; the table below says which file to change.

| Assertion | Profile | What tripped it, and where to fix it |
| --- | --- | --- |
| `A00_ROUNDTRIP_PARSE` | both | `spine-core` could not parse the skeleton or the atlas. Everything else in the report is downstream of this one — fix it first |
| `A01_NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS` | both | a 4.1/4.2-shaped `ik`/`transform`/`path`/`physics`/`slider` array. rigc emits the 4.3 `constraints` array, so this normally means hand-edited JSON |
| `A02_NO_BONE_TRANSFORM_KEY` | both | a bone uses 4.2's `transform`; rename it `inherit` in the rig spec |
| `A03_REGION_WIDTH_HEIGHT_FINITE` | both | a region loaded `NaN` or a non-positive size — the attachment has no `image` and no `width`/`height` |
| `A04_MESH_TRIANGLES_AND_ENCODING` | both | authored mesh geometry: triangle count not a multiple of 3, an index out of range, or a `vertices` length that disagrees with `uvs` (the weighted/unweighted trap) |
| `A05_CURVE_ARRAY_LENGTH` | both | a raw `curve` with the wrong number of values, a non-finite number in one, or a curve on a timeline that cannot take one. Four numbers **per value channel** |
| `A06_ATLAS_PAGE_SIZE_MATCHES_PNG` | both ◑ | the atlas `size:` disagrees with the PNG on disk. Under `spine-html` also: `pma`, rotation, and a region that does not cover its page |
| `A07_ATLAS_TEXT_SHAPE` | both | atlas text: a region name with stray whitespace, or a blank line splitting a page block. rigc writes the atlas, so this means a hand-edited file |
| `A08_REGION_NAMES_MATCH_ATTACHMENTS` | both ◑ | an attachment resolves to a region the atlas does not have — usually a `path`/`image` basename mismatch. Under `spine-html` the placeholder and the region name must also be *identical* |
| `A09_ANIMATION_DURATION_MATCHES_SPEC` | both | the loaded duration ≠ the declared one, or the two sides disagree about which animations exist (R7) |
| `A10_NO_NAN_AFTER_STEPPING` | both | stepping the animation produced a `NaN` pose. Look for a degenerate curve or a zero scale |
| `A11_NO_CLIPPING_ATTACHMENTS` | renderer | a clipping attachment; the target renderer skips them silently |
| `A12_NO_DARK_COLOR` | renderer | a slot `dark` colour or an `rgba2`/`rgb2` timeline; parsed, then ignored |
| `A13_MESH_BUDGET` | renderer | more than 4 mesh slots, or a mesh over 80 triangles |
| `A14_NO_FULL_FRAME_MESH` | renderer | a mesh spans the whole stage — a full-frame canvas that can never dirty-skip |
| `A15_IDLE_NO_MESH_BONE_KEYS` | renderer | the `idle` animation keys a bone that drives a mesh, directly or as a control bone |
| `A16_SKELETON_VERSION_4_3` | both | the `skeleton.spine` label is not on the 4.3 line (`4.3`, `4.3.N`, `4.3.N-suffix`) |
| `A17_ATLAS_PAGE_FILES_EXIST` | both | a page the atlas declares is not a file. Check `--images` and `--out` |
| `A18_DETERMINISTIC_EMIT` | both | a second compile of the same inputs differed. That is a compiler bug, not a spec bug — report it |
| `A19_OVERLAY_PNGS_HAVE_ALPHA` | renderer | an overlay page has a colour type with no alpha channel. Only the full-stage base plate may be opaque |
| `A20_MESH_WEIGHTS_COHERENT` | both ◑ | a weighted vertex with no bone, a negative weight, a bone index out of range, or weights that do not sum to 1. Under `spine-html` also: an unweighted mesh, or a binding at weight 0 |
| `A21_MESH_RIM_PINNED` | archetype | a generated ring's rim, or a ribbon's entry row, is not pinned to its anchor bone at weight 1 |
| `A22_MESH_UVS_IN_UNIT_RANGE` | both | a mesh UV outside its region, or a UV array that disagrees with the vertex count |
| `A23_PHYSICS_CONSTRAINT_EFFECTIVE` | both | a physics constraint that drives no component, is muted by `mix: 0`, has `mass: 0`, has `strength: 0`, or has `damping` outside `(0, 1)` so it never settles |
| `A24_AXIS_SPACE_STROKE` | archetype | a bone under the rig's `axisBone` was keyed with a screen-space Y component, or the axis bone itself was keyed |
| `A25_DETACHED_BONE_PARENTAGE` | archetype | a bone the rig declares `detached` is a descendant of the bone it must never hang under |
| `A26_SLOT_DRAW_ORDER` | archetype | the emitted slots are not a subsequence of the rig's slot table — a slot is out of order, or is not in the table at all |
| `A27_REGION_NAME_MATCHES_PAGE_FILENAME` | renderer | a single-region page whose region name is not the PNG's basename |
| `A28_RIBBON_ROWS_SHARE_WEIGHTS` | archetype | the two vertices of a ribbon row carry different weights, so the strip would change width |
| `A29_STROKE_WITHIN_CONTACT_DEPTH` | archetype | the animation drives deeper than the manifest's measured contact depth |
| `A30_STROKE_WITHIN_CAP_CONTAINMENT` | archetype | the animation drives past the measured containment ceiling, or scales a bone in the axis subtree |

`both ◑` marks a mixed assertion: its validity half always runs and its policy
clauses are gated by profile.

---

## 6. What rigc will refuse — do not spend a loop on these

These are in the Spine 4.3 format, and the emitter does not write them. Each one is
a **`NotImplementedError` naming the field**, because the parser's own behaviour is
worse: an unknown attachment `type` returns `null` and the attachment disappears,
and a constraint entry with an unrecognised `type` matches no case and vanishes.

| You wrote | You get |
| --- | --- |
| attachment `type` of `boundingbox`, `point`, `clipping`, `path`, `linkedmesh` | `attachment type "X" is in the Spine 4.3 format and rigc does not emit it yet. Implemented: region, mesh.` |
| constraint `type` of `path` or `slider` | `constraint type "X" … Implemented: ik, transform, physics.` |
| mesh `generator.kind` of `contour` | `the "contour" generator would triangulate a part's own alpha mask, and src/mesh.ts has no triangulator` |

Two more limits that are not errors but will shape what you can attempt:

- **No atlas packer and no atlas importer.** rigc emits **one part per page**: every
  region covers its whole page, `pma: false`. To reproduce a skeleton whose art
  ships as a packed atlas you either supply loose PNGs and let rigc build its own
  atlas, or hand the packed atlas to `validate`/`bench` alongside the candidate.
- **Sequences, `drawOrder` timelines, `drawOrderFolder`, event timelines and deform
  timelines** are walked by the validator but are not motion-spec properties: the
  track table in §4.4 is the complete list of what you can key.

---

## 7. Before you call it done

1. `build --profile <the one you meant>` exits 0 and the report has **no FAIL**.
2. Read the `SKIP` lines. Each one is a check that did *not* run — make sure none of
   them is a check you were relying on.
3. Read the `PROF` lines. A green under `spine` has not been held to the renderer
   policy, and a green under `spine-html` has.
4. Run `explain` and read the slots table: every slot you declared should be there
   (§3.3), in the order you meant, showing the setup attachment you meant.
5. If you are reproducing a reference, run `diff` or `bench` and read **every**
   measure. There is no single score, and a `0/0` measure compared nothing.
