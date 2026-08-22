# Authoring a rig with rigc

**Read this before you write a spec.** It is written for an agent that has never
seen this repository and cannot see what it is authoring. Together with the
validator's messages it *is* the interface: there is no editor viewport here, so
the only way to know a rig is right is to compile it and read what comes back.

Two input files, one CLI loop, and a list of named failures. Everything below is
checked against the code that implements it.

🚨 **The gate cannot see a wrong animation, and it will not tell you so.** `build`
is green when the file is *valid* — parseable, steppable, nothing degenerate in it.
Whether the animation is the one you were asked for is a question it does not ask
and has no way to answer. This is not a caveat: rung 1's first honest run shipped a
build with **every easing in the file reversed** and the gate passed it green. If you were given pictures, `check` (**§9**) is the half of the loop
that can see that, and a run that skips it has verified nothing about the motion.

- Formats and CLI reference: [README.md](../README.md)
- The rig spec's own source-level documentation: [`src/rig.ts`](../src/rig.ts)
- The motion spec and emitted shapes: [`src/types.ts`](../src/types.ts)
- What the format holds and rigc covers: [SPEC_COVERAGE.md](SPEC_COVERAGE.md)
- Reproducing a shot you were given as pictures: **§8**, and read it *before* you
  start measuring rather than after; then **§9** for the loop that closes it
- The conventions an editor user follows without being told — one image per
  attachment, keying practice, curve kind, draw order — sourced from Spine's own
  public documentation: **§10**

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

bun cli.ts check \
  --candidate path/to/spine \
  --frames    path/to/reference/frames

# read the table → fix the spec → build again → check again
```

`build` compiles, round-trips the result through `@esotericsoftware/spine-core`,
runs the named assertions, and **writes only if every one of them is green.** A red
run leaves nothing on disk, so there is no half-written artifact to mistake for a
result. There is no `--no-validate`, and there will not be one.

`check` is the second half, and it is only skippable if nobody gave you pictures.
Green from `build` means the file is valid; it says nothing at all about whether
the animation is the one in the frames, and there is no assertion that could — see
§9. The two run in that order because `check` needs artifacts on disk and `build`
only writes them when the gate is green.

What the flags mean:

| Flag | Meaning |
| --- | --- |
| `--rig` | the rig spec — skeleton structure |
| `--motion` | the motion spec — time |
| `--out` | directory for `skeleton.json` + `skeleton.atlas`; atlas page paths are written relative to it |
| `--images` | where the rig spec's `image` names resolve (overrides the rig's own `images` field, and is relative to your working directory) |
| `--manifest` | a cut manifest. Only for a rig with **measured art** behind it; a foreign skeleton has none |
| `--profile` | `spine` = the 18 validity rules · `spine-html` = all 32 (**the default**) |

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
bun cli.ts check    --candidate path/to/spine --frames path/to/frames
bun cli.ts bench    3 --candidate path/to/spine [--frames path/to/frames]
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
- **`check`** renders your candidate into the reference frames' own pixel grid and
  compares pixels — the only thing here that can see a wrong animation. **§9.**
- **`bench <rung>`** runs one rung of [the benchmark ladder](LADDER.md): validate
  under `--profile spine`, then diff against that rung's reference export, and with
  `--frames` the `check` table as well. Unlike the three above it is a **finish
  line, not a loop**: it opens the reference export, so a run that consults it and
  then edits is no longer an authoring run. `check` carries no such restriction —
  see §9.

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
animations at all — a **static rig**, a skeleton that exists to be posed. That is
a real deliverable and not a stepping stone: the ladder's first rung ships one.
`A09_ANIMATION_DURATION_MATCHES_SPEC` then reports **SKIP**, because there is no
duration on either side to compare; it is not a pass, and the report says so.

An animation that declares `"tracks": []` is a different thing — a *named* empty
animation, `duration: 0`, which is what the editor writes for a placeholder. That
one A09 does compare.

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

**R4 — The slots array *is* the setup draw order.** There is no separate
draw-order field in the skeleton's structure. Index 0 is drawn first (furthest
back). One animation *can* reorder them over time — that is the `drawOrder`
timeline of §4.7, and its offsets are counted against this array.

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
either authored geometry (`uvs` + `triangles` + geometry, plus `hull`, `edges`,
`width`, `height`) **or** a `generator`, never both.

Geometry comes in one of two fields:

| Field | Meaning |
| --- | --- |
| `vertices` | **unweighted**: one `x, y` per uv pair, so `vertices.length === uvs.length`. Nothing here names a bone |
| `weights` | **weighted, by name**: one entry per vertex, each a list of `{ "bone": …, "x": …, "y": …, "weight": … }`. This is the form to use |

```json
"weights": [
  [{ "bone": "tail3", "x": 184.91, "y": -2.83, "weight": 0.006 },
   { "bone": "tail4", "x": 92.72,  "y": -2.83, "weight": 0.994 }],
  [{ "bone": "tail4", "x": 84.66,  "y": -8.47, "weight": 1 }]
]
```

⭐ **Weights bind bones by NAME, like everything else in a rig spec.** A bone's
`parent`, a slot's `bone`, an ik constraint's `bones` and `target` and a draw-order
key's `slot` all resolve by name and refuse a miss by name, and mesh weights now do
too: an unknown name is a `CompileError` that says which vertex and which name, and
the compiler resolves the names to indices on emit. So inserting a bone renumbers
the emitted array and rebinds nothing.

🚨 **The index form is still reachable and it still costs silence.** Spine's own
encoding is a flat run — `boneCount, (boneIndex, bindX, bindY, weight) × n, …` —
where `boneIndex` is a position in the **emitted** bone array, a list the rig spec
never writes and cannot see. Put one bone ahead of the meshes and every vertex
rebinds: the file still loads, every index is still in range, every vertex's weights
still sum to 1, and `A04`, `A20` and `diff` are all quiet, because an index has no
name to be wrong. (Measured, on the rung 6 transcription: union MAE 3.30 → 15.09,
worst mesh-slot drift 0.09 px → 9.8 px, with a green gate throughout. Issue #45.)
rigc therefore refuses a weighted `vertices` run unless the attachment says
`"boneIndexing": "raw"` out loud — an opt-in, because what is being opted into is
the silence.

⚠️ `vertices` carries **no encoding flag** of its own, which is why the length rule
above is load-bearing: if `vertices.length` equals `uvs.length` the parser reads
unweighted x/y pairs, otherwise it reads the weighted run. A coincidental length
match reads weight data as coordinates, silently — that is `A04`.

⚠️ **Authored geometry is not a rigc generator, and the gate says so.** rigc built
neither its rim nor its rows, so it gets to assume nothing about its topology:
`A21_MESH_RIM_PINNED` and `A28_RIBBON_ROWS_SHARE_WEIGHTS` **SKIP** on an authored
mesh with that as the reason, and `A20`'s two generator-policy branches (a mesh here
is weighted; a generated mesh binds only bones that move it) do not apply to one.
`A20`'s coherence rules — weights present, in range, summing to 1 — still do. Issue
#44; before it was fixed, `A21` reported 40 failures on a correct 40-vertex editor
mesh because an absent `meshKinds` entry read as `ring`.

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

Optional, and only meaningful for rigc's own formations: `meshSlots` and
`meshTriangles` (the two halves of the mesh budget `A13` measures against),
`axisBone`, `massBone`, `detached`. Nothing in skeleton JSON records that a
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
| `drawOrder` | the draw-order timeline — §4.7. Not a track: it names no target |

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
  Seconds, not frames: nothing requires a key to land on any frame grid, and a
  reference rendered at some rate says nothing about where its keys are. Put keys
  where the motion changes.
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

### 4.7 `drawOrder` — reordering the slots over time

The one timeline that names no target, so it sits on the animation rather than in
`tracks` — which is exactly where 4.3 writes it (`animations.<a>.drawOrder`,
beside `bones` and `slots`).

```json
"animations": {
  "duck": {
    "duration": 2,
    "loop": false,
    "drawOrder": [
      { "t": 0.5, "offsets": [{ "slot": "arm", "offset": 2 }] },
      { "t": 1.5 }
    ],
    "tracks": []
  }
}
```

- `offset` is **how many places later** that slot is drawn; negative moves it
  earlier. Counted against the **setup** order (§3.3's array), never against
  wherever the previous key left it — each key is a complete statement of the
  change, because the parser rebuilds the whole permutation from setup every time.
- A key with **no `offsets`** restores the setup order. That is the format's own
  encoding for it, and it is how you put a swap back.
- Only slots that move need an entry.
- Draw-order keys are **stepped by nature** and carry no `ease` or `curve`.
- Its last key counts towards the declared duration like any other (R7).

rigc refuses four things here, all of which the parser would take:

| You wrote | You get |
| --- | --- |
| a slot this rig does not emit | `slot "X" is not one this rig emits` |
| the same slot twice in one key | `slot "X" is offset twice in one key` |
| an offset that lands outside the slots array | `slot "X" is at index 0 and offset 4 puts it at 4, outside the 2 emitted slots` |
| offsets in any order | nothing — rigc **sorts** them into slot order for you |

The last one is not a courtesy. `readDrawOrder` walks a forward-only cursor over
the setup array, so a file whose offsets descend does not load *wrong* — it does
not load at all, and the loader spins until the process dies. The array order in
the emitted file is the parser's requirement rather than a decision of yours, so
you state the set of moves and rigc writes them in the order the parser needs.
`A31_DRAW_ORDER_OFFSETS_RESOLVE` checks all four from the other side.

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
| `drawOrder at t=…: slot "X" is not one this rig emits` / `is offset twice in one key` / `puts it at N, outside the … emitted slots` | §4.7 |
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
| `A09_ANIMATION_DURATION_MATCHES_SPEC` | both | the loaded duration ≠ the declared one, or the two sides disagree about which animations exist (R7). **SKIP** when neither side has an animation at all — a static rig has no duration |
| `A10_NO_NAN_AFTER_STEPPING` | both | stepping the animation produced a `NaN` pose. Look for a degenerate curve or a zero scale |
| `A11_NO_CLIPPING_ATTACHMENTS` | renderer | a clipping attachment; the target renderer skips them silently |
| `A12_NO_DARK_COLOR` | renderer | a slot `dark` colour or an `rgba2`/`rgb2` timeline; parsed, then ignored |
| `A13_MESH_BUDGET` | renderer | more mesh slots than the rig's `invariants.meshSlots`, or a mesh over its `invariants.meshTriangles`. Thin the mesh, or raise the budget in the rig spec. **SKIP** when the rig declares neither |
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
| `A31_DRAW_ORDER_OFFSETS_RESOLVE` | both | a draw-order key names a slot the skeleton does not have, offsets one slot twice, puts a slot outside the slots array, or lists its offsets out of slot order (§4.7). The only assertion that runs **before** `A00` — the last of those shapes makes the loader spin rather than return, so the round trip is refused instead of attempted |

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
- **Sequences, `drawOrderFolder`, event timelines and deform timelines** are walked
  by the validator but are not motion-spec properties: the track table in §4.4 is
  the complete list of what a *track* can key, and §4.7's `drawOrder` is the only
  timeline outside it.

---

## 7. Before you call it done

1. `build --profile <the one you meant>` exits 0 and the report has **no FAIL**.
2. Read the `SKIP` lines. Each one is a check that did *not* run — make sure none of
   them is a check you were relying on.
   ⚠️ Under `--profile spine` a foreign skeleton usually produces **no SKIP lines
   at all**, and that is not a clean bill of health. The archetype assertions are
   excluded by the profile before the missing `invariants` block could make them
   skip, so they come back `PROF` instead. Do not go looking for a SKIP that the
   profile already accounted for; read step 3 instead.
3. Read the `PROF` lines. A green under `spine` has not been held to the renderer
   policy, and a green under `spine-html` has.
4. Run `explain` and read the slots table: every slot you declared should be there
   (§3.3), in the order you meant, showing the setup attachment you meant.
5. If you were given **frames**, run `check` and read the table (§9). Steps 1–4 are
   all about validity and structure; none of them can tell you the animation is
   wrong, and this is the step that can. Do it before step 6, not after — `bench`
   is a finish line.
6. If you are reproducing a reference, run `diff` or `bench` and read **every**
   measure. There is no single score, and a `0/0` measure compared nothing.

Then read **§10** against what you wrote. Steps 1–6 ask whether the rig is valid and
whether it looks right; §10 asks whether it is built the way the editor builds one,
which is a question none of them can reach and which the measures in `bench` do see.

---

## 8. Reading reference frames

Only if you are reproducing a shot you were given as **rendered frames** — the
benchmark ladder works that way, and so does any brief that hands you pictures
instead of numbers. Skip this section if you are authoring from a manifest.

The frames are the whole of what you know, so every number you author comes out of
measuring them, and **a measurement artefact is indistinguishable from a fact about
the animation** until something contradicts it. The three below are not
hypothetical: all three were made, believed, and only then caught, on the first
run of ladder rung 3. Each one had a tidy story attached, which is what made it
survive.

**Two things that touch become one thing.** An estimator that fits a shape to the
whole silhouette — a PCA, a bounding box, a centroid — silently changes meaning on
the frames where two parts overlap, because their pixels label as one blob and the
mass of the second drags the fit. On rung 3 that put the swinging bar 11° off on
exactly the frame where it struck the block, which read as a sharp deceleration *at
contact*: an obvious energy transfer, and a key worth authoring. It was not there.
Measured on a region that excludes the other part, the deceleration is smooth and
has **no corner at contact at all**. ⇒ Measure each part on pixels that can only be
that part — a connected component, an annulus, a colour key — and be most
suspicious of your result on precisely the frames where the interesting event
happens, because those are the frames where the parts are touching.

**A symmetric shape hides a sign error.** The same run masked the block out of the
bar's estimator by subtracting its rotated footprint, and rotated the test box the
wrong way. A square is symmetric under 90°, so the error is `2θ mod 90`: invisible
while the block is upright, and only leaking pixels once it has turned ~25°. One of
the two shots stayed correct and the other quietly produced a **negative** render
scale from the same script. ⇒ Run the same estimator over two shots and cross-check
a quantity that must agree between them — the pixels-per-unit scale, a fixed
pivot's position, the size of something that never changes. A single shot cannot
tell you your estimator is wrong.

**Draw order is read from what stays visible, not from what looks cut.** Where two
parts overlap, the one in front usually looks like it is *clipping* the one behind —
and a light seam along the edge makes that reading stronger. That seam is often a
rendering artefact: a PNG with a fully transparent border whose RGB is white bleeds
a halo under bilinear filtering, so the join is background-coloured rather than
either part's colour, which reads as a hole. ⇒ Decide draw order by finding a frame
where one part's **interior detail** — a marking, a highlight, anything not on its
outline — lies inside the other part's area, and see which survives. Then write the
slots in that order (R4), because there is no other place in the file to say it.

And the general form of all three: **when a reading implies a key, look for a second
way to get the same number before you author it.** A wrong measurement costs one
spurious key; a wrong measurement you believed costs the shape of the whole shot.

**A value is easier to get right than a curve.** The three traps above are all
about measuring a *value*, and both ladder runs so far found that the values came
out right early: rung 1's key values were exact at every keyframe on the second
build. What was wrong was the *shape between* them — every accelerating segment
had the decelerating curve and vice versa, from one inverted comparison. Nothing
in a static reading of the file can find that, because both candidates for the
shape are legal and the file reads fine either way, and a symmetric pair of easings
looks the same in every listing. Curves are where the error lives; §9 is how you
find it.

---

## 9. Checking against the frames — `rigc check`

```bash
bun cli.ts check --candidate path/to/spine --frames path/to/reference/frames
```

`--frames` takes either a **skeleton root** (the directory holding `frames.json`,
which checks every animation of that shot) or **one animation directory** inside
it. Everything else is optional: `--atlas` when the candidate's atlas is not beside
its skeleton, `--as <name>` when your animation is called something the frame
directory is not, `--all-frames` to list every frame instead of the worst by MAE,
`--json <out>` for the whole per-frame, per-slot report.

⚠️ **A frame set may be contact-sheets-only.** `check` only reads `fNNNN.png`
files — a committed reference set that ships a contact sheet plus a couple of
stills (rung 2's does: `f0000.png` and `f0310.png` per animation, the rest folded
into `contact.png` so a 311-frame shot does not commit 311 near-duplicate PNGs)
reports `frames 2 on disk, candidate samples 311, 2 compared` and means it: `check`
compared exactly the committed stills, not the shot. That is not a defect to author
around — the frame count line says so rather than pretending a fuller comparison
happened — but it does mean a clean `check` table on a contact-sheet-only set says
nothing about the frames between the stills. Whole-shot fidelity against a contact
sheet needs a tile-wise comparison against the sheet's own grid, which `check` does
not do yet (issue #36);
[`bench/runs/2026-08-23-rung2-2/sheetcheck.ts`](../bench/runs/2026-08-23-rung2-2/sheetcheck.ts)
is a working prototype, built in-run for exactly this gap.

`--fps <n>` exists for frame sets that have no `frames.json` beside them, which are
sets rendered before the sidecar existed: it gives the rate those frames were
sampled at, and without it the 12 fps protocol rate is assumed and the report says
so rather than letting the assumption look like a measurement. Passing `--fps` with
a value the sidecar contradicts is an error, not an override.

`--viewport <x>,<y>,<width>,<height>` pins your candidate's world box instead of
fitting it. Three uses:

- the derivation cannot work — a candidate deliberately missing a part has a
  different content box by construction, and pinning lets the rest of the shot
  still be measured;
- you already know your candidate's world coordinates match the reference's own —
  declared in `frames.json`, or measured directly against it, the way rung 5's
  authoring scripts did. There is nothing for a fit to correct in that case, so
  pinning skips one and reports the box you already know is right;
- you want the framing **held still** between builds. The framing line is still
  measured and printed when the box is pinned, so a pinned run separates "my keys
  moved" from "my framing moved" without either hiding the other. On a shot whose
  MAE moves by more than a point for a fraction of a pixel, that separation is
  worth more than the absolute number.

Pinning to paper over a **real** framing difference — rather than one of the three
cases above — is the dishonest use: it makes a genuine mismatch between your
candidate and the reference disappear from the report instead of showing up as
`content`/`rms`/`union residual`. That used to be easy to do by accident, because
the old quad-corner framing could be wrong by more than a pixel for reasons that had
nothing to do with either side's motion — two honest ladder runs measured it costing
30+ points of MAE with no key changed, which is why framing is now fitted to drawn
pixels rather than quad corners (issue #34, closed by #39; see §9.2). Pin to a box
you can name a reason for, and read the unpinned framing line first when you are not
sure whether you have one.

⚠️ **The framing is over the frames you compare.** `--frames <root>` fits one
framing across every set under it; `--frames <root>/<one-set>` fits one to that set
alone. Both are right and they are not the same number, so compare like with like
across builds.

### 9.1 Why this exists

The validator has no way to know whether an animation is the right animation. It
parses the skeleton, steps every timeline, and refuses what is degenerate — a
`NaN` pose, a curve of the wrong length, a duration that disagrees with the last
key. A rig whose motion is backwards is none of those things. **`diff` cannot see
it either**: reversing every easing leaves the timeline count, the key count, the
curve kinds and the duration exactly where they were, so every measure it reports
is unmoved. The two tools together can tell you a file is valid Spine that closely
matches a reference's structure, while it plays a different shot.

So `check` compares pictures. It renders your candidate with the same rasteriser
that drew the reference frames, onto the same pixel grid, and reports what differs.

🔒 **It never opens the reference skeleton — only the frames.** That matters for
you specifically: it means **you may run `check` as often as you like** without
your run ceasing to be an honest authoring run. It is a loop, in the way `build` is
a loop. `bench` and `diff` against a rung's export are not — they read the answer,
and [the ladder's honesty rule](LADDER.md) makes them a finish line you reach once.

### 9.2 Reading the table

```
  framed to  256x116px  0.116677 px/unit  world x[-782.1 .. 1412.0] y[-794.7 .. 199.5]  (fitted to the candidate's own drawn pixels)
  reference  256x116px  0.117628 px/unit  world x[-573.3 .. 1603.0] y[-81.2 .. 908.9]  (frames.json)
  content    candidate 234.6x95.5px at (11.3, 11.5)   reference 234.7x95.3px at (11.2, 11.7)   (union over 86 frame(s))
             ⤷ fit x0.999256  offset +0.05, -0.02 px   rms 0.42 px over 344 edge(s)   union residual -0.27 x +0.17 px   aspect -0.30%  (applied, 4 pass(es))
  in units   candidate 1995.3 x 809.7   reference 1995.3 x 809.9   x0.9999

  ── heavy — candidate animation "heavy", 12 fps ──
     frames     65 on disk, candidate samples 65, 65 compared
     MAE        mean 23.10  worst 43.36 at f0029   (0..255 over the union alpha; …)
     slot drift worst 2.1 px  "pendulum" at f0029

     the 8 worst frames by MAE, in index order
       frame      MAE   union px   worst slot            drift   how       slots   note
       f0029    43.36       1409   pendulum               2.1   component  2/2
```

**Read the framing block first.** Everything below it is computed on the grid it
chose, so an error there arrives disguised as motion — which is exactly what
happened to two honest ladder runs before this was fixed (issue #34).

Your candidate is framed **by its own drawn pixels**. `check` renders it at the
frames' own rate and grid, takes the content box of what it actually draws, takes
the reference's content box off the PNGs with the same rule, and fits the
similarity transform — one uniform scale plus a translation, least squares over
**every edge of every frame** — that carries one onto the other. Then it renders
through that transform and measures again, until the correction is the identity.

That procedure is blind to the two things it must be blind to. **An invisible
margin cannot move it**: a region's quad runs past its own artwork wherever the art
is transparent, and that used to set the scale; now nothing outside the drawing is
looked at (the selftest proves art padded by 20 px on two sides reports numbers
identical to the last decimal). **A choice of units cannot move it either**: a rig
scaled by 2 % renders to the same pixels and reads the same MAE.

The lines, in order:

- `framed to` / `reference` — the two world boxes and their scales. They are
  **different coordinate systems and do not compare term by term**; the reference's
  is printed for orientation and for turning a pixel measurement into units.
- `content` — the two boxes in **frame pixels**, which do compare, and the fit that
  put one on the other. `fit x1.000000` with a small `offset` means the two shots
  are the same size in the same place.
- `rms` — what the fit could not explain, across every edge of every frame. Under a
  pixel is the method's own noise. Over a pixel means no single scale and offset
  puts these two shots on each other: they are different shapes, not the same shape
  misframed.
- `union residual` and `aspect` — the extent your shot covers that the reference's
  does not, after the fit. This is the number that says *"something reaches
  somewhere nothing in the frames does, or is a different size"*, and a warning
  spells it out past a pixel.
- `in units` — the same two boxes in world units. The framing absorbs a pure scale
  on purpose, so this is the only place one shows; it compares only if you measured
  the shot in the frames' own units.

⚠️ **The framing is fitted to extent, and extent is not the same as alignment.**
When your silhouette genuinely differs somewhere — a limb that overreaches, a part
that is a little large — the best fit of the two extents is not quite the best
alignment of the two pictures, and the fit spends a fraction of a pixel absorbing
a difference that would have been cheaper to leave alone. Measured floor: about a
third of a pixel on the ladder's shots. On most that is invisible; on a small
high-contrast frame it is worth a point or two of MAE. The `union residual` and
`rms` lines are how you tell that it is happening, and `--viewport` is how you stop
it when you know your own coordinates.

**MAE** is the mean absolute RGB difference, 0..255, over the pixels either side
covers — the *union alpha*. It is not scored against a threshold, any more than a
`diff` measure is. What it is good for is comparison: between two builds of your
own rig, and between frames of one build. A shot whose MAE is flat across the set
and a shot with two spikes are different diagnoses — the first is usually framing
or art, the second is timing at those moments. The whole-frame figure printed
beside it is the same difference averaged over the background as well; it is there
because an ad-hoc re-render check naturally computes that one, and on every set
measured so far it comes out ten to twenty-five times smaller and correspondingly
blunter.

**Slot drift** is what you act on. For each of your slots, `check` measures where
it landed and how far that is from where the reference put it. That names the part,
the frame and the distance, so "the beach ball is 4.7 px low at f0005" is a
sentence you can take straight back to a key.

There are two matchers and the `how` column says which one answered:

- `component` — your slot sits on a connected component of the reference frame that
  is its own size. The drift is the distance between the two centroids, and it is
  the strongest answer available.
- `tmpl 0.62` — the reference merged your slot into a neighbour (they touch, or one
  is drawn over the other), so the fallback rendered **your slot on its own** and
  correlated it against the reference around where you drew it. The number is the
  confidence: how much better the winning position was than the best rival inside
  the search window. This is what gives a shot like a chain of touching links any
  drift at all — under connected components alone, every frame of it is ambiguous.

⚠️ **Both matchers are capped, and a blank is a real answer.** A part can be
displaced by about its own size and still be that part in the picture; past that,
a match is another object, not this one moved. So `check` searches that far and no
further, and reports **no match** rather than a number — a 4 px ball cannot report
the 47 px course as its drift. The bar rises with the distance being claimed: a
peak sitting where you already drew the slot only has to confirm it, a peak
claiming the part moved most of a radius has to be distinctive to be believed.

The `slots` column is how many of the slots you drew got an answer at all, and the
summary line carries the same denominator. `N reference component(s) no slot
reaches` means the reference frame contains something none of your slots overlaps:
a part you have not authored, or one you have put somewhere else entirely.

### 9.3 What it still cannot see

- **Anything a frame does not contain.** Bone `length`, the setup `inherit` mode,
  a slot's name, a bone's parentage. Frames carry appearance, and these are not it.
- **A difference smaller than the render scale.** At rung 3's 0.117 px per unit, a
  key 4 units out moves nothing. Author to the frames' precision and record that
  the rest was not checkable.
- **Whether a mesh is deformed or merely posed.** Since #27 the rasteriser draws
  meshes — weighted, deformed, both — so a rung with meshes is measurable. What it
  still cannot tell you is *how* a silhouette got its shape: a hull moved by a
  bone chain and the same hull moved by deform keys render to the same pixels, and
  the frames cannot separate them. Choose on what the rig has to do next, not on
  what the frames appear to say.
- **Which of two explanations is right.** A slot 3 px low every frame and a slot
  3 px low at one frame have the same drift and opposite causes. The table gives
  you the frame index; §8's rule still applies — look for a second way to get the
  number before you author the key.

---

## 10. What the editor does by default

Every reference in this repository was made in the Spine editor by a person, and a
rig authored here is measured against one. rigc's own defaults are deliberately
*absent* rather than opinionated (R1: a field is emitted exactly when you declare
it), so nothing in the compiler will push you toward the shape an editor rig has.
This section is that push, and it comes from **Spine's public documentation only** —
what the editor does when nobody tells it otherwise, and what its user guide
recommends.

**Nothing here is the answer to any shot.** These are defaults to adopt *unless the
shot says otherwise*, and each is overridable by something you can see in the
frames. Every line is marked with where it comes from:

- 📗 **stated** — quoted or paraphrased from the page linked in the line.
- 🧩 **inferred** — this guide's reading of those pages. Spine does not say it.

### 10.1 Structure

📗 **One image, one attachment, one slot.** Dragging an image into the viewport makes
the editor *"create a slot and a region attachment under the root bone for the
image"*, and *"each part of the skeleton that will move independently needs to be a
separate image file"* — [Images](http://esotericsoftware.com/spine-images). A shared
slot is opt-in on the PSD path too: the `[slot]` tag is what places layers into one
— [Import PSD](http://esotericsoftware.com/spine-import-psd). ⇒ in rigc: one entry
in `slots` per image, one placeholder per slot in the `default` skin (§3.3, §3.4).

📗 **A shared slot is for alternatives, not for economy.** *"Slots group attachments
of the same type. For example, a weapon slot may have a knife, sword, axe, etc."*,
and *"only one attachment (or none) can be visible at any given time"* —
[Slots](http://esotericsoftware.com/spine-slots). So two parts that are ever on
screen together **cannot** share a slot; two that never coexist may.

🧩 **⇒ If nothing in the shot swaps between them, give them a slot each.** Folding
parts into one slot with attachment keys to keep the slot list short is a decision
the shot has to earn. It changes the emitted slots array, and §4.7's offsets are
counted against that array.

📗 **The attachment name is the image name.** Spine finds an image by *"taking the
path specified under the Images node and appending the attachment name"*, and *"if
an attachment has a Path set, the path is used to find the image file instead of the
attachment name"* — [Images](http://esotericsoftware.com/spine-images). ⇒ in rigc:
keep the placeholder equal to the PNG's basename and no `path` is written (R5). A
`path` in the emitted file means the two disagreed.

📗 **Housekeeping the format fixes for you.** The default skin *"always has the name
`default`"* and *"bones are ordered so that the parent always comes before a child
bone"* — [JSON format](http://esotericsoftware.com/spine-json-format). §3.4.

### 10.2 Draw order

📗 **An overlap change is a draw-order key.** The draw order *"can be keyed"*, and
slots *"decouple bones from the draw order, allowing attachments on the same bone to
be drawn above and below an attachment on a different bone"* —
[Slots](http://esotericsoftware.com/spine-slots); its key button sits on the Draw
Order node — [Keys](http://esotericsoftware.com/spine-keys).

🧩 **⇒ There is no other way to say it.** The Keys page's list of keyable properties
runs bone transforms, transform inheritance, slot attachment, slot colour, draw
order, events, sequence, deform and the constraint families — **a bone's parent and
a slot's bone are not on it.** An editor rig therefore cannot express *"this passes
in front now"* by re-parenting or by reassigning a slot's bone; it has exactly one
expression, and it is the timeline of §4.7. If you are reaching for a structural
change to fix an overlap, you have left the editor's vocabulary.

📗 **Offsets count from setup, and an empty key restores it.** Offsets are *"the
number of draw order entries to shift the specified slot relative to its setup pose
draw order index"*, and *"if `offsets` is omitted, the keyframe will set the draw
order to the setup pose draw order"* —
[JSON format](http://esotericsoftware.com/spine-json-format). That is §4.7 exactly.

📗 **Hide with an attachment key, not with alpha.** *"Setting the alpha to zero to
make an attachment invisible is not an efficient way to hide the attachment … It is
better to hide an attachment by setting a slot attachment key. To avoid an abrupt
disappearance, the slot color can be used to fade to transparent before hiding"* —
[Slots](http://esotericsoftware.com/spine-slots). ⇒ in rigc: an `attachment` track
keyed to `null`, with an `rgba` track ahead of it when the part has to fade first.

### 10.3 Keys

📗 **Both axes on one key.** *"By default, each translate, scale, and shear key for a
bone sets both X and Y. This is sufficient for many animations and reduces the
number of timelines … For animations that need it, X and Y can be keyed separately
by checking the Separate checkbox"*; slot colour is the same — *"each color key for
a slot sets both color (RGB) and alpha (A)"* —
[Keys](http://esotericsoftware.com/spine-keys). ⇒ in rigc: `translate` / `scale` /
`shear` / `rgba` are the default forms. §4.4's single-axis timelines **are** that
Separate checkbox — for a bone whose axes need different times or different curves,
not for one that merely happens to move on one axis.

📗 **Times are seconds; frames are a convenience.** *"Frames exist only for
convenience"*, the timeline defaults to *"30 frames per second"*, and keys may sit
between them — *"a bone could have a translate key on frame 15, then another key on
frame 15.01"* — [Keys](http://esotericsoftware.com/spine-keys). This is why §4.5
takes `t` in seconds and pins nothing to a grid.

📗 **The editor's habit is to key liberally, then delete the redundant ones.** Auto
Key sets a key *"any time a change is made … it is common to have auto key enabled
all the time"*, and Clean Up *"deletes all unnecessary keys … keying the same value
multiple times in a row, keying the same values as the setup pose"*, because *"often
it is convenient to set keys liberally when designing an animation, then use Clean
Up afterward"* — [Keys](http://esotericsoftware.com/spine-keys). ⇒ a shipped export
is dense, but it does not repeat a value.

📗 **Add a key when a curve cannot carry the shape.** *"If a curve is not smooth
enough, it is easily remedied by adding another key"*, and the **Bounce** handle
preset exists for *"changing directions abruptly, such as when a ball bounces"* —
[Graph](http://esotericsoftware.com/spine-graph).

🧩 **⇒ Key every change of direction, not only the extremes.** Two keys and a curve
describe a transition; they cannot describe a path that turns. So an editor rig
carries a key wherever the motion changes direction, wherever a hold begins and
ends, and wherever one Bezier span could not hold the shape — more keys than a
minimal one-key-per-pose spec produces.

🚫 **No public page gives a keys-per-second figure, and this guide does not invent
one.** Reaching for a target density is guessing. The frames are the only thing that
can say where the motion turns; §8 is how to read them.

### 10.4 Curves

📗 **Linear is what a *new* key gets, and it does not survive contact with a curve.**
*"Normally new keys are assigned a linear curve type. However, if a key is placed
between keys that are using Bezier or stepped, then the new key is assigned a Bezier
or stepped curve type instead"* — [Graph](http://esotericsoftware.com/spine-graph).
The editor has also carried a **default curve type** setting since 4.1.13-beta, with
a *Last chosen* mode added in 4.3 —
[Changelog](http://esotericsoftware.com/spine-changelog). ⇒ *"the editor defaults to
linear"* is true only of the first key of an untouched curve.

📗 **The guide's own advice is against constant speed.** *"Curves allow the animator
to adjust the speed of a transition between keys. When all the parts of a skeleton
are moving at a constant speed, the movement tends to be robotic and lifeless"* —
[Animating](http://esotericsoftware.com/spine-animating).

🧩 **⇒ Bezier is the default to adopt; linear is the exception you argue for.** Use
linear where constant speed is the intent — a machine, a slide, a continuous drift —
and stepped where a value must not tween at all. Anything that starts, stops,
accelerates, settles or falls gets a curve.

📗 **Automatic handles first, adjust after.** *"The angle of the handles is adjusted
automatically based on the values of the keys before and after the key … Automatic
handles often provide good results. It can be useful to first apply automatic
handles, then adjust them manually only if necessary."* The named presets are
**Flat**, **Bounce**, **Ease out** (*"the value changes more slowly near the key"*)
and **Ease in** (*"the value changes more slowly near the next key"*) —
[Graph](http://esotericsoftware.com/spine-graph).

🧩 **⇒ That is what `easings` is for.** A handful of named shapes, reused by name
across the file, is how an editor rig reads. Raw `curve` is R6's escape hatch — one
key needing a shape no other key has — not the normal way to write a curve.

📗 **Handles are normalised, and that is the shape an `easings` entry takes.** For a
Bezier key, *"the X axis is from 0 to 1 and represents the percent of time between
the two keyframes. The Y axis is from 0 to 1 and represents the percent of the
difference between the keyframe's values"* —
[JSON format](http://esotericsoftware.com/spine-json-format). Those four numbers are
exactly an `easings` entry (§4.1), and rigc converts them per key into the absolute
control points the emitted file holds. Writing them into a raw `curve` instead is
the silent failure §4.1 warns about.

📗 **Some keys have no curve at all.** No line is drawn between keys when *"the type
of key does not have a transition, such as slot attachment or event keys"* —
[Dopesheet](http://esotericsoftware.com/spine-dopesheet). This is why rigc refuses
`ease` and `curve` on attachment keys (§4.4) and on draw-order keys (§4.7).

### 10.5 What the export leaves out

📗 **Nonessential data is off unless someone checked the box.** *"Data marked
'nonessential' is only output when the Nonessential data export setting is checked"*
— [JSON format](http://esotericsoftware.com/spine-json-format); the setting adds
*"additional data … that is not usually needed at runtime"* —
[Export](http://esotericsoftware.com/spine-export). What that page marks
nonessential: the skeleton's `fps`, `images` and `audio`; a mesh's and a linked
mesh's `width` and `height`; a mesh's `edges`; and the editor colours of bounding
box, path, point and clipping attachments. ⇒ a mesh in an export made without that
box carries **no** `width`/`height`. rigc's `image` supplies them from the PNG (R5),
so you never write them by hand.

⚠️ **A region's `width`/`height` are not on that list.** They are documented with no
*"assume … if omitted"* default — the same fact R5 states from the parser's side:
omit them in raw JSON and every UV collapses, in silence. Name an `image`.

⚠️ **Do not imitate the exporter's omissions.** Spine's exporter drops fields equal
to their default, which is why the format page is a long list of *"assume 0 if
omitted"* — and **rigc deliberately does the opposite** (R1, §2). Writing `x: 0` is
legitimate here. The habit worth carrying over is not *omit defaults*, it is
*declare only what the shot needs*.

### 10.6 What this section does not claim

Conventions that are visible in reference exports but that **no public Spine page
states** are deliberately absent. A guide that asserted them would be handing you an
answer read off the exports:

- any figure for keys per second, or for how key density scales with frame rate;
- which curve type any particular example project or studio actually shipped;
- whether a given export was made with Nonessential data checked;
- how many bones, slots or timelines a rig of a given size ought to have;
- whether a shipped rig prefers automatic Bezier handles or hand-placed ones.

If one of those turns out to matter, it belongs in the run's `log.md` as something
the frames had to teach you — not here.
