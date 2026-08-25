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
- What the format holds and rigc covers: `docs/SPEC_COVERAGE.md` — 🚫 **not an
  authoring input, and deliberately unlinked**: it inventories the benchmark corpus
  skeleton by skeleton, so it is on the ladder run's forbidden list. Named here for a
  maintainer, not offered to a run
- Reproducing a shot you were given as pictures: **§8**, and read it *before* you
  start measuring rather than after; **§8.1** if the figure has more joints than you
  can measure one at a time; then **§9** for the loop that closes it
- The conventions an editor user follows without being told — one image per
  attachment, keying practice, curve kind, draw order — sourced from Spine's own
  public documentation: **§10**

🔒 **A ladder run reads this guide in full and does not follow its references out of
it.** The guide is allowed reading; not everything it cites is. Citations here are
provenance for a reader of record — the loop that hit a trap, the issue that closed it —
and following one can arrive at a stored candidate's own spec, at the corpus inventory,
or at the gate a verdict is read against, none of which a run may open. So: read the
document, take its numbered sections as the input, and leave its footprints to whoever
is maintaining it. The rule this states is that an **allowed-reading surface has to be
closed under reading**; the criterion behind it is under *The honesty rule* in
[LADDER.md](LADDER.md), and the enumerated allowed and forbidden lists are in
`bench/runs/README.md`, *What a run may read* — the prompt that starts a run quotes them
outright, which is the copy that binds.

If you were given no brief and no frames — you are rigging somebody's own art rather
than reproducing a measured shot — none of this applies to you. It is the ladder's
protocol, not a property of the tool.

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
#   ↳ read its per-frame column before its MAE — §9.2
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

🚨 **Read `check`'s per-frame column before its MAE.** The table's headline figures
are the MAE and the slot drift, and a reader who came for those will skip the
`per-frame` line printed under them — but that line is the only thing in this
toolchain that can see a **hold**, a **loop seam** or a **one-frame event**. Those
defects are cheap in every single frame and wrong only in the relation between two,
so an aggregate MAE, `diff` and the gate are all silent on them: a candidate can
slope a line through a frame pair the reference holds perfectly still across, or
end a cycle on a pose that is not the pose it began on, without moving a decimal
anywhere else in the loop. **§9.2** documents the column. It is named here because
§0 is where the loop is learned, and a run that opens a report for its chain table
can come away with the column unread.

What the flags mean:

| Flag | Meaning |
| --- | --- |
| `--rig` | the rig spec — skeleton structure |
| `--motion` | the motion spec — time |
| `--out` | directory for `skeleton.json` + `skeleton.atlas`; atlas page paths are written relative to it |
| `--images` | where the rig spec's `image` names resolve (overrides the rig's own `images` field, and is relative to your working directory) |
| `--manifest` | a cut manifest. Only for a rig with **measured art** behind it; a foreign skeleton has none |
| `--profile` | `spine` = the 20 validity rules · `spine-html` = all 34 (**the default**) |

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

**R7 — `duration` is declared, and checked, twice over.** Skeleton JSON carries no
duration field — the loader takes the largest key time. So you state the duration
you meant and rigc compares it against the compiled result; a mismatch larger than
one frame (1/60 s) is a compile error, and assertion `A09` re-checks it against the
*loaded* skeleton afterwards.

That frame of slack is for a duration declared *longer* than the motion — an
animation may hold its final pose. In the other direction there is no slack to give:
**no key may land past the declared duration**, and this is checked per timeline
rather than per animation, within 1e-6 s. Both halves matter, and the second is not
the first with a smaller number — see §4.5.

**R8 — `from` needs a cut manifest.** `from.anchor` / `from.slotWindow` /
`from.meshCenter` / `from.rotation` read measured art out of a manifest. Without
`--manifest` they are a compile error naming the bone. A rig with no measured art
behind it writes literal `x`/`y` instead.

**R9 — Nothing is written until every assertion is green.**

---

## 3. The rig spec, field by field

`spec` must be exactly `"rigc-rig/1"`. `name` must be a non-empty string. `bones`
must be non-empty. `slots` must be present (it may be empty).

🚫 **Every example value below is invented.** Names, coordinates, vertex lists and
payloads in this guide are written to illustrate a field, never copied out of a
reference export — an example lifted from one would be handing an authoring agent an
answer to the rung it is standing on, which is the rule §10.6 states and the honesty
rule in [LADDER.md](LADDER.md) turns on. If a snippet here matches a reference file,
that is a defect in this guide: report it. (It has happened — 2026-08-23; the incident
is recorded in `bench/runs/README.md`, *What a run may read*.)

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
| `icon` | the editor's icon for this bone, e.g. `arrowsB`; editor affordance, no rendering effect. Copied through verbatim — no assertion checks the name, because the icon vocabulary is the editor's and an unknown one is not an error | — |
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
  [{ "bone": "link_a", "x": 40, "y": 0,  "weight": 0.25 },
   { "bone": "link_b", "x": -20, "y": 0, "weight": 0.75 }],
  [{ "bone": "link_b", "x": -60, "y": 12, "weight": 1 }]
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

**Bounding box** ([Spine: bounding boxes](http://esotericsoftware.com/spine-bounding-boxes))
and **clipping** ([Spine: clipping](http://esotericsoftware.com/spine-clipping))
attachments — a polygon, and nothing else.

**When you need one:** a *bounding box* is a shape the game hit-tests against — a
hurt box, a pick region, a trigger volume — that follows the skeleton and draws
nothing. A *clipping* attachment is a **mask**: everything drawn from the slot
carrying it up to and including `end` is clipped to the polygon, so a window, a
portal or a wipe is one attachment rather than a second set of art.

```json
"hitbox_a": { "hitbox_a": { "type": "boundingbox", "vertexCount": 4,
                            "vertices": [-30, -10, 30, -10, 30, 50, -30, 50] } },
"mask_a": { "mask_a": { "type": "clipping", "end": "box", "vertexCount": 3,
                        "vertices": [0, 0, 200, 0, 0, 160],
                        "color": "ff00ffff" } }
```

Both polygons above are invented — an axis-aligned rectangle and a right triangle,
in round numbers, so that nothing here can be mistaken for a shape measured off a
reference. A real one is measured off your own art (§8) or drawn to the volume the
game needs.

| Field | Meaning |
| --- | --- |
| `vertexCount` | **required.** How many vertices the polygon has, stated outright — see the warning below |
| `vertices` / `weights` | the same two encodings a mesh's geometry uses, with the same by-name default and the same `"boneIndexing": "raw"` opt-in |
| `color` | `rrggbbaa`; the colour the editor draws the outline in |
| `end` | clipping only. The **last** slot the clip applies to, by name |
| `convex`, `inverse` | clipping only, 4.3, both default false |

🚨 **`vertexCount` has no parser default and rigc will not infer one.** A mesh gets
its count from `uvs.length`; a polygon has no uvs, and the parser reads
`map.vertexCount << 1` as the number of coordinates to expect. With the field
absent that is `undefined << 1` = **0**, so the coordinate array is decoded as a
*weighted* run — bone counts and weights read out of your x/y pairs — and the
attachment ends up holding nothing. It loads. Neither type draws a pixel, so
nothing downstream notices. rigc requires the count and cross-checks it against
whichever encoding you used; `A33_VERTEX_ATTACHMENT_GEOMETRY` checks it again on
the artifact.

⚠️ **A clipping `end` that names nothing is not an error to Spine.**
`skeletonData.findSlot` returns `null` on a miss and the parser assigns that null
without a word, so the clip never ends — it runs to the bottom of the draw order
and takes every slot below it out of the frame. rigc refuses a name the rig does
not declare. Omitting `end` entirely is the format's own way of saying "clip
everything after this one", and is left alone.

🚫 Under the default `spine-html` profile a clipping attachment is refused by
`A11_NO_CLIPPING_ATTACHMENTS` — that renderer skips them silently, so a mask that
was supposed to hide something would not. It is valid Spine and `--profile spine`
accepts it; the refusal is policy, not validity.

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

### 3.6 `events` — names the animation can fire

**When you need one:** something outside the skeleton has to happen on a
particular frame — a footstep sound, a spawn, a hit window opening. Spine
[events](http://esotericsoftware.com/spine-events) carry no rendering effect at
all; they are a named signal the game listens for, with an optional payload.

The **declaration** lives here, in the rig spec, because the name is structure.
The **firings** live in the motion spec (§4.8), because when they happen is time.

```json
"events": {
  "cue_a": {},
  "cue_b": { "audio": "cue_b.ogg", "volume": 0.8, "string": "line-01" }
}
```

An object keyed by event name — the one top-level collection in the format that
is not an array. Every field is optional and each is the payload a firing
**inherits** when it does not override it: `int` (0), `float` (0), `string`
(`""`), `audio` (none), `volume` and `balance`.

- **An empty object is the normal case, not a stub.** Most events carry no payload:
  the name *is* the signal, and the declaration exists so the firings in §4.8 have
  something to resolve against. Write `{}` and move on.
- ⚠️ `volume` and `balance` are read **only when `audio` is set**. Without an
  audio path the parser drops them without a word, so rigc refuses that pairing
  rather than emitting two numbers no runtime will read.
- An event that nothing fires is legitimate: a skeleton may declare the vocabulary
  its game listens for and key only some of it in any one animation.

### 3.7 `invariants` — what the artifact cannot say about itself

Optional, and only meaningful for rigc's own formations: `meshSlots` and
`meshTriangles` (the two halves of the mesh budget `A13` measures against),
`axisBone`, `massBone`, `detached`. Nothing in skeleton JSON records that a
bone carries a cut's axis or that a parentage is forbidden, so the rig spec says it
and the validator's archetype assertions read it. **An assertion whose field is
absent reports SKIP, never a pass.** If you are reproducing a foreign skeleton,
leave this out entirely and run `--profile spine` — and expect `PROF` rather than
that SKIP, because the profile excludes an archetype assertion before its body
could notice the missing field (§5.2).

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
| `events` | the event timeline — §4.8. Not a track, for the same reason |

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
- **Key times are quantised onto a 1e-6 s grid by rounding DOWN, never to
  nearest.** A key time is a position against the sample grid a player will step,
  and the two directions of a half-step error are not the same size. `2/12 s` and
  `5/30 s` are both 0.16666666…; `0.166667` is *larger* than either, so a key
  emitted there is applied at sample **3** of a 12 fps playback and not sample 2 —
  a whole frame late, with nothing raised. On a **stepped** timeline (an attachment
  timeline always is) that is the wrong picture rather than a slightly wrong value:
  the spineboy run's muzzle flare fired a frame late for exactly this until the
  run's own frame check caught it (issue #99). Rounding down cannot do that; the
  worst it can do is put a key a millionth of a second early, on the sample it was
  written for. ⚠️ What this does **not** protect you from is rounding your own
  times before you write them — write `2/12`, not `0.1667`, and let the compiler
  do the quantising.
- **No key may land past the animation's `duration`.** Nothing that plays the
  animation for the duration it declares ever reaches such a key, so it is a
  compile error — checked on **every timeline**, not just on the latest key in the
  animation. The tolerance is 1e-6 s, which is one step of the grid rigc rounds key
  times onto, so a key you put exactly *on* a duration that is not a round number
  of microseconds is fine. R7's frame of slack does not apply in this direction and
  would not see this: rung 6 rounded its key times to 4 dp somewhere upstream, its
  one-frame reveal landed 0.000034 s past a 68/12 s duration, another track was
  already sitting on the declared duration so the animation's *longest* key time
  looked right — and the reveal never appeared. If you want a key on the last
  sample, write the duration's own value; if you want the animation to run longer,
  say so in `duration`.
- `ease` names an entry of `easings`, or the literal `"stepped"`. Absent = linear —
  and that is **rigc's** default, not the editor's habit. A new key in the editor is
  linear, but one placed between Bezier keys is not, and §10.4's rule from Spine's own
  pages is that Bezier is the shape to adopt and linear the one you argue for. So
  leaving `ease` off is a positive claim of constant speed, not a way of declining to
  decide; §8 has what that bet cost on the ladder.
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

### 4.8 `events` — firing a declared event

The second timeline that names no target, and it sits on the animation for the
same reason `drawOrder` does: 4.3 writes it as `animations.<a>.events`, beside
`bones` and `slots`.

```json
"animations": {
  "walk": {
    "duration": 1.0666666,
    "loop": true,
    "events": [
      { "t": 0, "name": "cue_a" },
      { "t": 0.5333333, "name": "cue_a", "int": 2 }
    ],
    "tracks": []
  }
}
```

- `name` must be a key of the rig spec's `events` block (§3.6). A miss is a
  compile error here; in raw JSON the parser **throws** `Event not found` in the
  consumer's process, which is late.
- `int`, `float` and `string` override the declaration's payload **for this firing
  only**. Omit them and the firing inherits the declared defaults, which is what
  the editor writes.
- `volume` and `balance` are accepted only on an event that declares `audio`, for
  the same reason as §3.6.
- Event keys are **instantaneous** and carry no `ease` or `curve`.
- Its last key counts towards the declared duration like any other (R7).

rigc refuses three things here, and only the first is loud in the parser:

| You wrote | You get |
| --- | --- |
| a name the rig spec does not declare | `event "X" is not declared in the rig spec's "events" block; declared: …` |
| a key time earlier than the key before it | `key times must not go backwards (at t=0.25, after t=0.5)` |
| `volume`/`balance` on an event with no `audio` | `volume is set but event "X" declares no "audio"` |

The ordering rule is **non-decreasing**, not strictly increasing: two different
events on one frame is an ordinary thing to want, and unlike a value track there
is no contradiction in it. What is refused is going *backwards* —
`readAnimation` fills frame `i` from key `i` in array order and never sorts, so a
decreasing time builds an `EventTimeline` whose earlier firing is simply
unreachable, with a perfectly clean load.
`A32_EVENT_KEYS_RESOLVE` checks all three from the other side.

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
| `animation "A" slot "X" attachment: key at Ns is Ms past the declared duration Ds` | §4.5 — the key is past the end of the animation and nothing will sample it. Move the key onto `duration`, or raise `duration` |
| `animation "A" keys unknown bone "X"` | the track's `bone` is not in the rig |
| `animation "A" bone "X" translatex: key value must be an array of 1 number(s)` | the value shape must match the property (§4.4) |
| `a key carries both a named easing and a raw curve; pick one` | R6 |
| `last key carries an easing but has nothing to ease to` | drop `ease`/`curve` from the final key |
| `key times must strictly increase (at t=…)` | including after `lag` and `stagger` |
| `animation "A" has two tracks on X.property; merge them into one track` | one timeline per target property |
| `no stage size: give the rig spec a \`skeleton.width\`/\`skeleton.height\`` | §3.1 |
| `drawOrder at t=…: slot "X" is not one this rig emits` / `is offset twice in one key` / `puts it at N, outside the … emitted slots` | §4.7 |
| `events at t=…: event "X" is not declared in the rig spec's "events" block` | declare it in the rig spec (§3.6), or fix the name |
| `events: key times must not go backwards` | put the firings in time order (§4.8) |
| `events at t=…: volume is set but event "X" declares no "audio"` | drop `volume`/`balance`, or give the event an audio path |
| `vertexCount is undefined; a polygon needs at least 3 vertices, stated outright` | give the bounding box or clipping attachment a `vertexCount` (§3.4) |
| `vertexCount N wants M unweighted numbers and "vertices" holds K` | fix the count or the array; they decide the encoding between them |
| `end names slot "X", which this rig does not declare` | fix the clipping attachment's `end`, or add the slot |
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
- **PROF** — the profile you chose does not carry that kind of rule. Two kinds sit
  outside `spine`, not one: the renderer rules **and** the archetype rules. The
  exclusion is checked before the assertion's body runs, so an archetype rule with
  no `invariants` field to measure reports `PROF` here, never its own SKIP. A
  `--profile spine` green means *valid Spine*, never *passes the renderer policy*
  and never *holds to the archetype rules*.
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
| `A09_ANIMATION_DURATION_MATCHES_SPEC` | both | the loaded duration ≠ the declared one, or the two sides disagree about which animations exist (R7). Asymmetric by design: a frame of slack for an animation that ends early, and none worth the name for a key *past* the declared end, which is the same rule §4.5 states at compile time — held here against a skeleton the compiler never saw. **SKIP** when neither side has an animation at all — a static rig has no duration |
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
| `A32_EVENT_KEYS_RESOLVE` | both | an event key fires a name the skeleton's `events` block does not declare, sits earlier in time than the key before it, or sets `volume`/`balance` on an event with no `audio` (§4.8). **SKIP** when no animation carries an event timeline |
| `A33_VERTEX_ATTACHMENT_GEOMETRY` | both | a bounding box or clipping polygon whose `vertexCount` is missing or disagrees with its vertex array, a weighted run that decodes to the wrong number of vertices or an out-of-range bone index, or a clipping `end` naming a slot the skeleton does not have (§3.4). **SKIP** when the skeleton carries neither type |

`both ◑` marks a mixed assertion: its validity half always runs and its policy
clauses are gated by profile.

---

## 6. What rigc will refuse — do not spend a loop on these

These are in the Spine 4.3 format, and the emitter does not write them. Each one is
a **`NotImplementedError` naming the field**, because the parser's own behaviour is
worse: an unknown attachment `type` returns `null` and the attachment disappears,
and a constraint entry with an unrecognised `type` matches no case and vanishes.

Each is deferred for a stated reason, and the reason is the same one in every row:
**not one of these types appears anywhere in the benchmark corpus** (SPEC_COVERAGE
parts 3-1 and 4-2), so none of them is on the ladder's critical path. The message
says so, because a deferral without its reason is a wall rather than a work item.

| You wrote | You get |
| --- | --- |
| attachment `type` of `point`, `path`, `linkedmesh` | `attachment type "X" is in the Spine 4.3 format and rigc does not emit it yet. Implemented: region, mesh, boundingbox, clipping. point, path and linkedmesh are deliberately deferred: not one of them appears anywhere in the benchmark corpus …` |
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
3. Read the `PROF` lines. They are where "was this rig held to that rule at all"
   gets answered for everything the profile left out — the renderer policy *and*
   the archetype rules. A green under `spine` has been held to neither; a green
   under `spine-html` has been held to both.
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

**That reads the reference only, so it settles the edges the reference happens to
show an interior detail on, and no more. There is a second test, and it decides more
of them: render your own candidate both ways and measure the same feature on both
sides.** Build the pair, render each back at the frames' own scale, and compare
like with like. A part whose unoccluded size you can compute is a ruler — composite
it alone, then read how much of it survives in the reference and how much survives
in each build. If a part that measures 110 px on its own reads 100 px in the
reference, the build that also reads 100 px is covering it the way the reference
does and the build that reads 108 px is not, and that is the order. It costs two
builds and it reaches edges the frames never show a marking on: on the ladder a brief
has settled a single edge of a chain from interior detail and said outright that the
frames did not show the rest, and rendering like-for-like settled three more of them
— worth a measurable drop in window MAE, a convention the gate cannot see and the
measures can.

**Score that comparison over the pixels where the two builds differ. A whole-shot
figure is the wrong feature.** Two builds that differ only in slot order are
**bit-identical everywhere the two slots do not overlap**, so a whole-shot MAE
divides the evidence by the whole figure and by every frame that carries none of
it. What survives that division sits inside the objective's own scatter — real
hypotheses and a deliberately reversed control alike land in there, pointing
whichever way the noise does, and what has been condemned is the statistic and not
the edge. ⇒ Take the pixels where the two renders differ **at all** and score both
builds over exactly that set. Nothing outside it can contribute, so the dilution is
gone by construction, and the reading needs no knowledge of which parts are involved
— it is the same mechanical test on any structural pair. Read a frame-by-frame tally
beside the figure too, because an edge the frames really decide wins shot after shot
rather than on a couple of them.

**Calibrate the band with a control on an edge the brief has already settled by
measurement.** Run the same test on that edge, read how far apart the two builds
come out over the pixels that decide it, and treat that separation as the scale a
real answer is measured against. On the deciding pixels a settled edge separates by
a wide margin where the whole-shot figure had it inside its own noise — which is
what lets an edge the frames show no interior detail on stop being unanswerable and
start being an edge the null-result rule below has no business firing on.

⚠️ **A control that fails may be a wrong control — read the per-frame rows before
you condemn the hypothesis.** A control is a **build**, and a build differs from
base in everything the change implies, not only in the thing you meant to change:
send one part behind another and it goes behind everything drawn between them too,
so what you actually ran is one reversed edge plus several asserted ones. The
aggregate will not say so, and it can favour the variant while the per-frame rows
give base *every one* of the frames that carry most of the deciding pixels. That
split — an aggregate one way, a consistent per-frame tally the other — is the
signature of a control that asserts more than one thing, and reading the aggregate
alone condemns an edge the brief settles by measurement. The rule the run protocol
carries from the other side is the same one: a control that returns an impossible
number has told you something, so read the number rather than the pass or fail.

⚠️ **A render-back sweep whose spread is inside the objective's own scatter is
*no answer*, not a weak one.** Rendering candidates back and keeping the best
number is not a draw-order trick — it is how any structural choice the frames
might decide gets decided, a scale, an offset, an attachment kind, an order — and
every one of those sweeps can come back null. **Estimate the objective's own
scatter first, or the sweep is not readable at all** — a spread smaller than that
is noise wearing a decimal point. Two orders on one ladder shot came out **0.8 %
apart over the whole shot and pointing opposite ways**, and a later run swept
**three** structural choices and landed inside that scatter on every one of them.
A difference that small is not a quiet vote for the winner; it means the frames do
not decide this, and there are two honest ways on:

- **find a second, independent way to get the number** — often by measuring the
  *art* instead of the render, which needs no build at all. Two of those three
  sweeps were settled that way.
- **or ship it on reasoning, and say in the log that is what you did.** The third
  one was. What makes that honest is the record — a number that arrived as an
  argument must not later be read as a measurement.

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

**But linear is not the neutral option.** The frames genuinely underdetermine a
curve: at rung 6's 12 fps, with keys landing every one to three frames, there is
almost nothing left for a handle shape to be constrained by, and **there is no
principled way to estimate one from frame spacing alone — rigc does not offer one and
this guide does not invent one.** `diff`'s `curve_kinds` counts how many keys are
linear, stepped or bezier and never compares two handle shapes; `check` measures the
rendered result, so it can tell you a curve is *wrong* without telling you what it
should have been. What does not follow is that omitting `ease` abstains. It authors
constant speed on every span — the one shape a hand-animated reference almost never
has (§10.4) — and the ladder has measured both sides of that bet. A run that keyed
everything linear for exactly the reasoning above scored under a **sixteenth** of its
`curve_kinds` measure, and that was its single largest structural gap. A second
attempt at another rung — same brief, same frames, same model as its own first, with
§10.4's rule added and nothing else — lifted `curve_kinds` by a fifth, with
`key_counts` rising beside it and every other section figure unchanged. ⇒ Take the
curve *kind* from what the motion does — starts, stops, accelerates, settles,
falls — rather than from how far apart the keys are; take its
shape from §10.4's automatic-handle advice and a small reused `easings` table; and
leave `check` to catch the one thing no static reading can, an easing applied the
wrong way round.

### 8.1 Getting a pose for a figure with a dozen joints

Everything above measures a *part*, and §9 checks a pose you already have. Between
them sits the question neither answers — where do a dozen bones go on this frame —
and on a character that gap is most of the run. What follows is not Spine's and no
public page has an opinion about it, but it decides whether the search converges at
all, so it sits here rather than being rediscovered once per figure.

**Fit the rendered composite, never a part on its own.** The first trap above tells
you to measure each part on pixels that can only be that part. On a figure with limbs
there are no such pixels: an arm crosses a torso, one leg crosses the other, a held
prop is drawn over both, and **every frame is a frame where parts are touching** — the
trap with no way out of it. So the objective is the whole picture. Render your
candidate through the same rasteriser that drew the reference, into the frames' own
viewport, and minimise the difference over the bones' local transforms; that is §8's
*"look for a second way to get the same number"* applied to a whole pose at once, and
it is the render loop **§9.1** sends you into. Read §9.1's warning about where a
bone's local transform lives *before* you write the first sweep — a fitter that is
posing nothing reports a flat number and looks like a bad objective.

⚠️ **Fitting one part at a time in sequence is the same mistake wearing a
schedule.** A near arm solved against the composite while the far arm is still
wrong is being scored on a picture the other arm is spoiling, and the minimum it
walks to is not its own. The knobs come down together, coarse first — the next two
rules are how.

**Compare at a reduced resolution first. At full resolution the objective is flat
over the range a joint has to travel.** Sweep one bone alone across the width of the
figure against a single frame and watch the number: at full resolution it can wander
inside a few percent for the whole sweep with no slope anywhere in it, because a
limb fifty pixels from where it belongs overlaps the reference no better than one a
hundred pixels away — both are *no overlap*, and the difference between them is
aliasing. A coordinate search sees noise, reports no improvement, and leaves the frame
at a pose that shares almost nothing with the picture. ⇒ **Box-average both sides
before comparing them and run the search coarse to fine.** The coarsest level places
the body, the next the limbs, the last two the pixels. The same sweep at the coarse
level has a slope on it, because at that block size the two figures still overlap and
the number knows which way to go.

⚠️ **The coarsest level is for the body and nothing else.** A block big enough to
give the whole figure a gradient is a block a shin is one cell of, and one cell
cannot say which way a shin points. Place the root and the torso there, then decide
each limb at a level whose cells are smaller than the part that level is moving.

**Scan each knob's whole plausible range. Do not line-search out from where it sits.**
A search that steps out from the current value cannot bring an arm 60° round, because
the first step overlaps the reference no better than standing still did — so it
reports no improvement and stops, correctly, on the objective it was given. A figure
whose legs have folded under it is that failure with a picture attached: a real local
minimum, sat in for as long as you care to iterate. ⇒ For each knob, evaluate the
whole range that bone can plausibly take — a few dozen samples across it, which is
nothing beside the frames you are fitting — take the best, and refine only after
that. The cost is linear in the number of knobs, and it is the difference between a
fit that converges and a fit that reports success on a folded figure.

⚠️ **Some knobs only decide together.** A part hanging three rotations below a
shoulder is placed by none of them alone: each single-knob scan finds its own best
while the part is still nowhere near, because every value of that knob is wrong given
the other two. Where a chain ends in something whose position you can actually see —
a hand, a foot, a held prop — scan the two links above it as a **pair**, over the
grid. That is the product of two ranges on a handful of chains, not on every bone.

⚠️ **Two whole chains can share a minimum, and no paired scan reaches that one.**
The case above is two knobs in one chain. The harder one is two *chains* sitting in
the same pixels: an arm and the prop it holds lying across the part of the frame the
reference fills with the legs. Every leg knob that would carry a leg there finds the
pixels already inked and reports no improvement — correctly, on the objective it was
given — and the frame keeps its limbs in a **different configuration** rather than a
slightly wrong one. Pairing cannot help here, because the two knobs are in different
chains and pairing every chain with every other is the whole product.

**What reaches it is cheap: more than one start, screened coarsely.** Assemble a
handful of candidate poses for the frame — the incumbent, the two neighbouring
frames' solutions, a few poses spread across the shot, the setup pose — run all of
them through the **coarse levels only**, and take the best two through the full
schedule. **Keep the incumbent among the candidates**, so a frame can only improve
on what it already had. The cost is a multiple of the coarse pass rather than of the
fit, and the neighbour seed below is one start out of that set rather than a rule of
its own. ⚠️ It also measures how far from converged a single-start fit can be while
reporting success: repeat the *identical* search on one frame from different starts
and the numbers walk down, step after step. That is not a tolerance being tightened,
it is a different basin each time — so a search that stopped improving is evidence
about the start it was given and about nothing else.

**Cross-shot starts, for a configuration a shot cannot reach from its own frames.**
Where every pose in one shot holds the prop low and the reference holds it out
level, every start drawn from that shot's own frames is on the wrong side of the
same two-chain minimum, and multi-start inside the shot barely moves the number.
These shots are states of one character, so a configuration this shot never visits
may be sitting in another one — take the start from there. ⇒ Borrow **only the bones
of the chain in question**, never a whole foreign pose: a foreign pose puts the legs
where this shot never goes, and the rest of the search then spends itself fighting
what the borrow brought with it.

**Re-fit the setup pose against frames drawn from every shot, not against one.** Every
animation is measured from the setup pose, so an error in it is an error in all of
them — and it is exactly the error one frame cannot show you. Fit an attachment's
offset against a single frame and that frame's own rotations absorb whatever you got
wrong: the picture comes out right, the offset is wrong, and every other shot pays
for it. Across a spread it cannot hide, because a wrong offset would have to be
absorbed by a *different* rotation in each frame and no one value of the offset does
that. ⇒ Fit the setup pose against one clear frame to get near, then re-fit it
against a handful of frames drawn from **every** animation at once, and hold it fixed
while the per-frame poses are fitted. It is the spread that identifies it — a
sequence of single-frame fits, one per shot, is not the same thing.

**Seed each frame's search from its neighbour's solution — as one start among the
full-range scans, never instead of them.** Adjacent frames are adjacent poses, so the
answer next door is a better first guess than the middle of any range, and it costs one
extra evaluation per knob to try it. What it must not do is *replace* the scans: the
neighbouring frame's pose is precisely where a line search would have started, and a
limb 60° out in one frame stays 60° out in the next for the reason the rule above
gives — stepping away from it overlaps no better, so the whole series inherits one
frame's local minimum and looks stable while it does. ⇒ Scan the whole range, add the
neighbour's value to the starts, take the best of them. Fit outward from a frame you
trust in both directions rather than only forward, so a bad frame seeds its neighbour
and not every frame behind it.

⚠️ **Then measure the adjacency drift, because a fit that lost a limb teleports.**
Fitted frame by frame with nothing tying the frames together, a leg has two answers
wherever the other leg is near it, and no single frame's number prefers the right one:
some frames land on the wrong leg, every one of them cheap, and the series jumps back
and forth between the two. That defect is invisible in any per-frame figure and loud in
the relation between two — the reading §9.2's `Δpx` and `ref Δ` columns already make
for the whole figure, and the chain table localises: a chain whose worst slot drift on
one frame runs many times its own mean across the set did not travel that far, it was
lost and refound somewhere else. **A limb that moves much further between two adjacent
frames than the reference's own frame-to-frame change is a fit that lost it, not a limb
that moved.** Read it per chain rather than per figure — one leg swapped for its twin
is a small share of a whole-frame delta and vanishes into it.

**Two near-identical parts need one calibrated separator, decided once and pinned.** A
front limb and a rear one are often the same drawing twice, differing by a tint or by
nothing at all; a search scoring a whole composite cannot tell which of the two it just
placed, because exchanging them costs almost nothing on the frames where they overlap.
Left to the per-frame fit, that assignment is re-decided on every frame — the teleport
above, arriving by a second route. ⇒ Settle it the way §8 settles a draw-order edge:
build both hypotheses, render each at the frames' own scale, and compare like with like
— but calibrate on the frames where the two parts are *unambiguous*, the ones where
they are far apart or only one of them is drawn, and read the separation there, where
it is a real gap rather than a rounding difference. Then **pin the assignment for the
run** and let no per-frame search reopen it. ⚠️ The same test knows when to stay silent
here too: two hypotheses that come out inside the objective's own scatter mean the
frames do not decide this, and you ship it on reasoning and say in the log that is what
you did.

**Spend each iteration on the worst chain, and stop re-fitting the ones already at the
floor.** §9.2's chain table is this loop's work queue: it gives every limb a worst slot
drift, an error per pixel, and a share of the set's error. ⇒ Take the next iteration to
the worst **per-pixel** chain rather than the largest share — the share confounds
*wrong* with *big*, as §9.2 says beside the table, and the chain holding most of a
run's error is routinely the one that simply covers most of the figure. Then freeze the
chains that have converged. Re-fitting them spends the budget the broken chain needed,
and it is not merely wasteful: chains share parents, so a search free to move a
converged limb's ancestors will walk it back off the floor to buy a fraction of a point
somewhere else. ⚠️ **A blank where a drift should be is the loudest row in the table,
not a quiet one.** The matcher refuses to name a distance past the part's own size
(§9.2), so a limb far enough out reports no match rather than a large number — read
that beside a high figure per pixel as the strongest signal the table has.

**What comes out is a pose per frame, and a pose per frame is not a key.** Two things
decide what survives the reduction, and **§10.3** states both: declare one tolerance
in pixels at the end of what each bone swings rather than a figure in degrees, and
deal with the gauges — the directions the pixels cannot see — *before* the series
becomes keys, because a fitter will have wandered along every one of them; fold the
exact ones out and penalise the rest. Then close
the loop with **§9**: the fit's own number says how near this pose is to this frame,
and only `check` says whether the shot is the shot. **§9.3** is the list of what even
that cannot see.

---

## 9. Checking against the frames — `rigc check`

```bash
bun cli.ts check --candidate path/to/spine --frames path/to/reference/frames
```

`--frames` takes either a **skeleton root** (the directory holding `frames.json`,
which checks every animation of that shot, framed per set — see the scope note
below) or **one animation directory** inside it. Everything else is optional:
`--atlas` when the candidate's atlas is not beside its skeleton, `--as <name>` when
your animation is called something the frame directory is not, `--framing shared`
to fit one framing across every set instead of one each, `--all-frames` to list
every frame instead of the worst by MAE, `--json <out>` for the whole per-frame,
per-slot report.

⭐ **A frame set may ship a contact sheet instead of every frame, and the sheet is
compared too.** A long shot does not commit 311 near-duplicate PNGs: rung 2's sets
ship `f0000.png` and `f0310.png` plus a `contact.png` holding all 311 sampled
frames, and spineboy's `@30fps` sets do the same. The frame table still says
`frames 2 on disk, candidate samples 311, 2 compared` — those are the files — and a
**`sheet` line under it** carries the other 309: your candidate sampled at the set's
own rate, rendered into the same box the frames above were at the sheet's own scale,
and compared tile by tile (issue #36 — the gap a rung-2 run had already prototyped a
comparator for, in its own working directory, because the tool could not see its shot).

⚠️ **Read it as a series, not as one number** — §9.2. And note what it does not
carry: MAE only. The `Δpx` / `ref Δ` thresholds are calibrated at frame scale and a
tile has a fraction of a frame's pixels, so the per-frame change measure stays on
the committed stills, where it reports `no two compared frames are adjacent` and
means it.

`--fps <n>` exists for frame sets that have no `frames.json` beside them, which are
sets rendered before the sidecar existed: it gives the rate those frames were
sampled at, and without it the 12 fps protocol rate is assumed and the report says
so rather than letting the assumption look like a measurement. Passing `--fps` with
a value the sidecar contradicts is an error, not an override.

`--viewport <x>,<y>,<width>,<height>` pins your candidate's world box instead of
fitting it. Two uses:

- the derivation cannot work — a candidate deliberately missing a part has a
  different content box by construction, and pinning lets the rest of the shot
  still be measured;
- you want the framing **held still** between builds. The framing line is still
  measured and printed when the box is pinned, so a pinned run separates "my keys
  moved" from "my framing moved" without either hiding the other. On a shot whose
  MAE moves by more than a point for a fraction of a pixel, that separation is
  worth more than the absolute number.

There used to be a third — *"you already know your candidate's world coordinates
match the reference's own, declared in `frames.json`"* — and **`check` now does
that one for you** (issue #52). Before fitting anything it renders your candidate
into the box `frames.json` records and measures where your pixels land. If they
land on the reference's to within a pixel, that box is yours too, and it is used:
it is not an *estimate* of where the frames were drawn, it is where they were
drawn, and the framing line says `frames.json's own box — the candidate measured
into it`. If they do not, the box is refused and your candidate is framed by its
own pixels exactly as before — which is the ordinary case, because the reference's
origin is in a file you are not allowed to open.

That is worth a paragraph rather than a line because of what it costs when it is
missing. The fit is registered on **extent**, and extent is not alignment (see the
⚠️ in §9.2), so on a shot whose silhouette differs anywhere it lands a fraction of
a percent away from the framing the frames were drawn at — and a fraction of a
percent of scale is worth several MAE. Measured on rung 6: **8.73 fitted against
3.50 in the frames' own box**, with every content box, residual and rms already
under the method's noise. Rung 5 measured the same gap, 12.49 against 4.35. Neither
author could tell that from a wrong animation without running the pin by hand.

Pinning to paper over a **real** framing difference — rather than one of the two
cases above — is the dishonest use: it makes a genuine mismatch between your
candidate and the reference disappear from the report instead of showing up as
`content`/`rms`/`union residual`. That used to be easy to do by accident, because
the old quad-corner framing could be wrong by more than a pixel for reasons that had
nothing to do with either side's motion — two honest ladder runs measured it costing
30+ points of MAE with no key changed, which is why framing is now fitted to drawn
pixels rather than quad corners (issue #34, closed by #39; see §9.2). Pin to a box
you can name a reason for, and read the unpinned framing line first when you are not
sure whether you have one.

⚠️ **The framing is over the frames you compare, and `check` decides it PER SET.**
Point it at a skeleton root and each animation directory under it is asked its own
question first: *do this set's own drawn pixels land in the box `frames.json`
records?* The sets that do are measured in that box, which is exact — it is not an
estimate of where the frames were drawn, it is where they were drawn — and nothing
another set does can move them. The sets that do not are measured in **one shared
framing** fitted across every set, printed as the header's `shared box` line, plus
their own whole-pixel MAE refinement off it (§9.2) — the fit is shared because more
frames condition it better; the constant offset it still leaves is per set, and
measured per set. Each set says which it got on its own `framed to` line.

Why the split falls there, both halves measured on an 8-shot character (147 frames):

- **Deciding the declared box per set is worth 15–25 MAE.** Over the union, one shot
  that is not in the frames' coordinates puts the pooled correction over the
  one-pixel threshold and the *whole root* falls back to a fit. Per set, the shots
  that qualify read what pinning by hand reads: `idle` **18.77** where a whole-root
  run read 41.59, with not one key different (issue #100).
- **Fitting per set is worse, so `check` does not.** `fitFraming` registers extent,
  and extent is not alignment (see the ⚠️ in §9.2), so on a shot whose silhouette
  genuinely differs one shot's frames do not constrain the fit enough: `hit` reads
  **92.36** fitted on its own against 60.59 in the shared fit, and a two-frame stills
  set reads 101.94 against 42.98. More frames is a better-conditioned fit, so the
  fallback is deliberately the shared one.

`--framing shared` measures **every** set in the shared framing, which is what a
whole-root run used to do. It answers one question and it is a good one — *does a
single box serve every set?* — and it is the wrong number to read as one shot's
fidelity.

⚠️ The two are different measurements and their absolute numbers are not comparable.
The `scope` line at the top of the report says which one you got. `--viewport` pins
one box for the whole run whichever scope you ask for, because a pin is a claim
about your candidate's own coordinates and those do not change between shots.

⚠️ **`--frames <root>/<one-set>` is a third number for a set that cannot take the
declared box**, and it is the least constrained of the three: the fit has only that
set's frames to work from, where a root run's shared fit has every frame in the
skeleton. Measured on the same character, `hit` reads 60.50 at the root and 92.41
pointed at its own directory. A set that DOES take the declared box reads the same
either way — that box is not fitted to anything — so pointing at one directory is
exact for a shot you authored in the frames' coordinates and a rough estimate for
one you did not.

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

📌 **That is also why the MAE figures quoted through this section stay.** Every one of
them is a candidate's own reading against rendered frames — the exam question, not the
answer key — so none of them narrows a reference-side measure, and a guide that censored
them would be teaching less for no gain in honesty. The criterion is under *The honesty
rule* in [LADDER.md](LADDER.md) (issue #158); what it *does* seal is a score written
over a reference's own count, and no such figure appears here.

🚨 **If you drive the runtime yourself, a bone's local transform lives on
`bone.pose`.** A shot whose poses have to be *fitted* rather than read sends you
past `check` and into your own render loop over
`@esotericsoftware/spine-core` — that is §8's *"look for a second way to get the
same number"* applied to a whole pose, and it is a legitimate thing to build — §8.1
is how that search is set up so it converges. The
first thing it hits is not a subtlety. **spine-core 4.3 keeps a bone's local
transform on `bone.pose`, not on the bone**, so `bone.rotation = …` — or `.x`,
`.y`, `.scaleX` — is neither an error nor a rotation: it adds a property nothing
reads, and every frame renders as the setup pose. Write `bone.pose.rotation`.
Rung 8 lost a loop to it at a flat 17.3; driven through `bone.pose`, the same
poses measured **2.76**.

🚨 **That trap has a twin one level up: the *setup* transform lives on
`bone.data.setupPose`, not on `bone.data`.** `BoneData` extends `PosedData`,
which carries the whole setup transform on a `setupPose` object, so
`bone.data.rotation` — or `.x`, `.y`, `.scaleX` — is `undefined`, and
`bone.data.rotation + delta` is `NaN`. Read and write it as
`bone.data.setupPose.rotation`. This one is worse to spot than the `bone.pose`
trap, because nothing on the path raises: `undefined` propagates to `NaN`, and
`NaN` serialises to `null`, so a fit writes `"px": null` into its own placements
file, the next build reads those as zero, `validate` is green and `check` runs.
⇒ **A `null` in your own placements dump is the signature of having read
`bone.data` directly** — nothing in this format is ever legitimately null. On
spineboy it cost the candidate MAE 13.0 → 114.6 with a green gate throughout
(measured in a spineboy attempt's own loop log, §4.1). Note that the two names are not
the same thing: `bone.data.setupPose` is
the setup transform, while `bone.setupPose()` on a `Bone` is the method that
resets `bone.pose` back to it.

🚨 **A region attachment's own offsets are cached.** `attachment.x`, `.y`,
`.rotation`, `.scaleX/.scaleY` are inputs to a quad spine-core computes once and
stores; what gets drawn is that stored quad — `computeWorldVertices` reads
`getOffsets(pose)`, never the fields — so writing them is, again, neither an
error nor a move. **Call `attachment.updateSequence()` after every write**, or
every frame renders the quad it was loaded with. A setup fit on spineboy ran
4,500 renders and reported the same number for all of them before this surfaced
(the same loop log, §4.2).

⇒ **An MAE that is identical across every pose, and that does not move for any
parameter you sweep — a bone's local transform, an attachment's offsets — is one
of these inert writes and not a wrong animation.** The parameter you swept was
never read; a wrong rig moves the number, a write to a field nothing reads
cannot.

### 9.2 Reading the table

```
  framed to  256x116px  0.116677 px/unit  world x[-782.1 .. 1412.0] y[-794.7 .. 199.5]  (fitted to the candidate's own drawn pixels)
  reference  256x116px  0.117628 px/unit  world x[-573.3 .. 1603.0] y[-81.2 .. 908.9]  (frames.json)
  content    candidate 234.6x95.5px at (11.3, 11.5)   reference 234.7x95.3px at (11.2, 11.7)   (union over 86 frame(s))
             ⤷ fit x0.999256  offset +0.05, -0.02 px   rms 0.42 px over 344 edge(s)   union residual -0.27 x +0.17 px   aspect -0.30%  (derived, 4 pass(es), settled)
             ⭐ MAE-refined by -1, +1 px: 54.31 → 48.47 over the reference's own pixels (10.7% of the figure). …
  in units   candidate 1995.3 x 809.7   reference 1995.3 x 809.9   x0.9999

  ── heavy — candidate animation "heavy", 12 fps ──
     frames     65 on disk, candidate samples 65, 65 compared
     MAE        mean 23.10  worst 43.36 at f0029   (0..255 over the union alpha; …)
                ⤷ over the REFERENCE's own drawn pixels, mean 23.90 — the union figure compares two builds …
     slot drift worst 2.1 px  "pendulum" at f0029
     per-frame 1 of 64 adjacent pair(s) change by a different amount than the reference does; worst
               f0018, yours moved 0 px where the reference moved 374
     sheet      311 of 311 tile(s) of contact.png at 64x57px in 8 column(s)   MAE mean 4.30  worst 4.76 at f0047
                ⤷ worst 8: f0047=4.8  f0048=4.7  f0045=4.7  f0039=4.7  f0149=4.7  f0044=4.6  f0046=4.6  f0043=4.6

     the 9 frames worth reading — worst by MAE, plus every frame whose own change disagrees, in index order
       frame      MAE   union px     Δpx  ref Δ   worst slot            drift   how       slots   note
       f0018     9.12       1402       0    374   pendulum               0.4   component  2/2   the reference moves here and yours holds still
       f0029    43.36       1409     288    301   pendulum               2.1   component  2/2
```

**Read the framing block first.** Everything below it is computed on the grid it
chose, so an error there arrives disguised as motion — which is exactly what
happened to two honest ladder runs before this was fixed (issue #34).

Unless the frames' own box already fits you (above), your candidate is framed **by
its own drawn pixels**. `check` renders it at the frames' own rate and grid, takes
the content box of what it actually draws, takes the reference's content box off
the PNGs with the same rule, and fits the similarity transform — one uniform scale
plus a translation, least squares over **every edge of every frame** — that carries
one onto the other. Then it renders through that transform and measures again,
until the correction is the identity.

The parenthesis at the end of the `⤷ fit` line says which of those happened and how
it ended: `derived` for the fit and `declared` for the frames' own box, then the
pass count, then one of

- `settled` — the correction converged to the identity. Nothing further to read.
- `coincident` — the frames' own box was kept because your pixels landed in it.
  The fit beside it is what a fit would still ask for, and on a shot whose
  silhouette differs anywhere that is not zero; it is the fit's floor, not your
  keys.
- `cycling` — the correction fell into a repeating orbit instead of converging.
  **More passes cannot help**: the fit has no fixed point here. Read the `⚠️` line
  under it, which says whether the two content boxes agree anyway (the fit's own
  floor, and the numbers below are usable) or do not (a real shape difference, and
  that is the finding).
- `unsettled` — it ran out of passes without either. Same two readings as
  `cycling`, and the `⚠️` line tells you which.

That procedure is blind to the two things it must be blind to. **An invisible
margin cannot move it**: a region's quad runs past its own artwork wherever the art
is transparent, and that used to set the scale; now nothing outside the drawing is
looked at (the selftest proves art padded by 20 px on two sides reports numbers
identical to the last decimal). **A choice of units cannot move it either**: a rig
scaled by 2 % renders to the same pixels and reads the same MAE.

The lines, in order:

- `framed to` / `reference` — the two world boxes and their scales. They are
  **different coordinate systems and do not compare term by term**; the reference's
  is printed for orientation and for turning a pixel measurement into units. Unless
  `framed to` says `frames.json's own box`, in which case they are one box and one
  coordinate system, because your candidate was measured into it.
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
- the **MAE-refined** line, which is the last thing that happens to the box and the
  paragraph below is what it is for. On a **fitted** framing it says what constant
  whole-pixel offset was taken out and what that was worth (`⭐`), or that the
  search ran and the identity won. On a box that is not an estimate — the frames'
  own, or one you pinned — it never moves anything, and if it finds a constant there
  it says so as a **finding about your rig** rather than about the framing.
- `in units` — the same two boxes in world units. The framing absorbs a pure scale
  on purpose, so this is the only place one shows; it compares only if you measured
  the shot in the frames' own units.

⚠️ **The framing is fitted to extent, and extent is not the same as alignment.**
When your silhouette genuinely differs somewhere — a limb that overreaches, a part
that is a little large — the best fit of the two extents is not quite the best
alignment of the two pictures, and the fit spends a fraction of a pixel absorbing
a difference that would have been cheaper to leave alone. Measured floor: about a
third of a pixel on the ladder's shots. On most that is invisible; on a small
high-contrast frame it is worth a point or two of MAE — rung 6 measured five, and
on the spineboy sets a **constant** one or two pixels was worth 10–30 % of the
figure (issue #146). This is the floor the frames' own box has no share in, which is
why `check` prefers that box whenever your pixels are measured to land in it;
`--viewport` is how you stop it in the cases that box does not cover.

⭐ **What a fitted framing now does about it: one final whole-pixel pass.** After
the fit settles (or cycles), `check` searches every whole-pixel offset within ±2 px
for the lowest MAE over the reference's own drawn pixels and moves the box to the
best one, when that is worth at least 1 % of the figure. So a fitted set's numbers
are what is left **after** the best constant offset has been removed, rather than a
constant offset read as motion — and the line says which offset and what it bought,
in both directions, so nothing is quietly absorbed.

Two things to know when you read it:

- ⚠️ **A large refinement on a set whose drift is also large is not necessarily
  framing.** The pass removes the best *constant*, and when one part carries much of
  the shot's ink a constant can absorb part of that part's own displacement. Read
  the offset beside the chain table: a big offset with a flat drift table is the
  fit's floor; a big offset with one limb far out is that limb.
- On a box that is not an estimate the pass declines and says why. `frames.json`'s
  own box is where the frames were drawn, so a constant pixel *there* is your
  figure sitting a pixel off inside the right box — a thing to fix, and the report
  refuses to frame it away. A pinned box is your claim, and nothing overrules it.

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

⚠️ **Half of that denominator is yours, so do not optimise against it.** The union
is the pixels *either* side drew, and a large, mostly transparent sprite adds many
cheap pixels to it — so the *mean falls* on a candidate that got worse. That is not
hypothetical: spineboy-2's muzzle flare walked its own scale to 13x under a fitting
loop doing exactly this, and cost every set in that run its framing (issue #119).
So the line under the MAE divides the same difference by the pixels the
**reference** drew, a denominator nothing you do can grow. Read the union figure to
compare two builds of your own rig, where both sides cover about the same ground,
and the reference-denominator figure when you are deciding whether a change made
the shot better; it is not bounded by 255. A set that draws more than half again as
much ink as the reference does gets `⚠️ overdraw` beside those two numbers, with
both pixel counts, because at that point the first figure is cheap for a reason
that has nothing to do with your keys.

**`Δpx` and `ref Δ`** are the two columns that do **not** compare you against the
reference. They compare each side against **itself one frame earlier**: how many
pixels of your own frame moved since your own previous frame, and the same for the
reference. Then the `per-frame` summary compares those two numbers.

That is a different question from everything else in the report, and it catches a
class of defect nothing else here can — because the defect is cheap in every single
frame and wrong only in the relation between two:

- **A held pose that is not held.** Rung 6's reference is pixel-identical across
  f64–f67. A greedy key reduction had sloped a line through that plateau, legal
  under its own per-key tolerance, and the candidate moved **91 px across f67→f68
  where the reference moves 3**. The gate was green, `diff` was unmoved, and the
  aggregate MAE did not shift by a tenth of a point. The column says `the reference
  holds still here and yours does not`.
- **A one-frame event that never fires.** The same run's tracker reveal landed a
  fraction of a millisecond past the animation's last sample. `diff` read the
  structure as matching. The column says `the reference moves here and yours holds
  still`.

Both of those were found by that run writing its own render-diff by hand. Read this
line whenever the MAE is flat and something still looks wrong: a flat MAE says the
framing and the art agree, and it says nothing at all about whether your shot holds
and blinks where the reference does.

⚠️ Only between **adjacent** frames. A set that ships stills rather than every frame
— rung 2's contact-sheet sets — reports `no two compared frames are adjacent`, and
means it: the difference between two frames 310 apart is not a frame-to-frame delta.
A disagreement needs one side to hold *exactly* still while the other moves, or one
side to move four times the other and at least two dozen pixels more; below that the
two rasterisations differ by their own last bit and the column says nothing. Such a
set gets the `sheet` line instead, which is MAE over every sampled frame and not a
change measure — the two thresholds above are pixel counts at frame scale, and a
tile has a fraction of a frame's pixels.

**The `sheet` line is the whole shot**, on the sets that commit a couple of stills
and fold every sampled frame into one `contact.png`. It says how many tiles were
compared out of how many the sheet holds, the grid it measured off the sheet itself,
the mean and worst tile, and the worst eight by MAE. Read the **series** rather than
the mean, exactly as with the frame table: flat across the shot is framing or art,
a spike is timing at that moment — rung 2's four shots read 4.30–4.41 flat over
1,244 tiles, which is what says their trajectories, ring rates and attachment swaps
land where and when they should. Two things to know:

- it is measured in the **same box** the frame table was, at the sheet's scale. For
  a stills-plus-sheet set that box was decided on the stills, so a set whose framing
  is a fit carries that fit into these numbers as well;
- a sheet whose dimensions are not a grid of this set's frame count at these frames'
  aspect is **refused by name** rather than read wrong — the note names the file, and
  the answer is to re-render the set.

**Slot drift** is what you act on. For each of your slots, `check` measures where
it landed and how far that is from where the reference put it. That names the part,
the frame and the distance, so "the beach ball is 4.7 px low at f0005" is a
sentence you can take straight back to a key.

There are two matchers and the `how` column says which one answered:

- `component` — your slot sits on a connected component of the reference frame that
  is its own size **and holds nothing else you drew**. The drift is the distance
  between the two centroids, and it is the strongest answer available. All three
  conditions are checked: a blob may not be much bigger than the slot, may not be
  much wider than its box, and may not contain another of your parts' ink. The last
  is the one a dominant part slips through otherwise — rung 2's course is 81 % of a
  blob that also holds the water, the panel and both rings, so the blob is only
  1.24x its ink and no wider than its box, and the reported *"course drift 11.2 px"*
  was the distance to a five-part centroid (issue #37). It now falls to the matcher
  below and reads 0.0 px.
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

**The `chains` block is the same two measures on the unit you actually repair.**

```
     chains     6 from the candidate's own bone tree — the roster is at the foot of the report
       chain                 slots   worst slot drift                     mean   MAE in it   share
       crest                   5/5   3.0 px "lantern" f0006              2.4 px       28.40    31.5%
       prop-arm                6/6   2.0 px "prop" f0002                 1.5 px       44.90    33.0%
       near-strut              3/3   15.0 px "strut-tip" f0004           7.0 px       51.30     8.5%
```

`check` cuts **your own** bone tree at every branch point — a chain runs from a
root or a fork down to the next fork; a single-bone chain that is itself a fork
folds into its parent, so a `hub` that branches three ways joins the trunk rather
than becoming a row of its own; and each chain is named after the first bone in it
that carries a slot. On a biped that lands on the parts you would name (`crest`,
`near-strut` and `prop-arm` above); on a serial figure with no fork it is one chain,
and the slot rows under it still say which link moved. Which bones and slots went
where is printed as a roster at the foot of the report, so it is never a guess. `MAE
share` divides the difference over the **reference's** own drawn pixels — the
denominator from the line above, which nothing you draw can grow — and splits it by
giving each of those pixels to the chain whose ink is nearest, so the shares
partition the set and no chain can look better by drawing more: growing its ink
only pulls more of the reference's pixels, and their error, into it. Read `MAE in
it` beside the share, because the share alone confounds *wrong* with *big* — a head
and its features cover a lot of a figure and can carry a third of the error at a
below-average figure per pixel. Reference ink further from your ink than the part's
own size is left `(unattributed)` rather than charged to a neighbour, and a chain
reading 0 % on `0/3` slots drawn is missing, not clean. The rollup at the foot gives
each chain one line across every set — the sentence a run's README quotes instead of
a per-shot list. **§8.1** is how to act on it: the next iteration goes to the worst
chain by error per pixel, and a chain already at the floor is frozen rather than
re-fitted.

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
  what the frames appear to say. ⚠️ **But `bench` does see it.** Take a disc that
  squashes as it travels: a region on a bone that scales, and a grid mesh weighted
  1.0 to that same bone, draw the same pixels on every frame — and they are
  different files. One has a region and one bone; the other has a hull, a
  triangulation and a weight per vertex, and a rig that meshes one part usually
  meshes its neighbour and carries the bones to drive them. `attachments.type_counts`,
  `attachments.mesh_weighted`, `attachments.region_size` and the bone count that
  comes with the choice all move on that decision, while `animations.deform` moves
  for neither, because neither one deforms with keys — the whole difference is which
  machinery renders identical pixels. That is not an argument for guessing: the
  frames cannot choose, and this guide will not tell you which way any reference
  went. It is an argument for **writing down which way you went and why at the
  moment you decide it**, rather than meeting the decision again in the measures
  after the run is over.
- **Which of two explanations is right.** A slot 3 px low every frame and a slot
  3 px low at one frame have the same drift and opposite causes. The table gives
  you the frame index; §8's rule still applies — look for a second way to get the
  number before you author the key.
- **What happens between two committed frames.** `Δpx` compares adjacent frames and
  a set that ships stills has none, so a shot that is right at every committed frame
  and wrong between them reads clean. That is the same gap `--frames` on a
  contact-sheet set already has, and it is why the frame-count line is printed.

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

🧩 **⇒ When the art is named after the parts, the art's names are the rig's names —
and this is the largest lever §10 has.** *One image → one slot → one attachment,
named after the image* reads as a structural rule. It is also, and mostly, a
**naming** rule, and naming is what whole sections of the measures are made of:
five of `bones`'s eight name-matched measures (`names`, `parent_by_name`, `order`,
`length_present`, `inherit_present`) and every `slots` measure but the count are
scored over the names the two sides **share** ([`src/diff.ts`](../src/diff.ts)), so
a rig whose names miss reads near zero on all of them however well it is built. ⇒
carry each part's own name straight through — PNG basename → slot → attachment, and
the bone that moves it — instead of inventing a scheme of your own.

**Both directions are measured.** The one run whose art shipped a separate PNG per
body part, each named for the part, applied this deliberately and posted `names`
measures **an order of magnitude** above anything on the ladder before it — without
either side seeing the other. Every honest run before it read near zero on the same
measures. It is the largest single thing any run has got out of a convention.

⚠️ **And the other half, which matters just as much: when the art is *not* named
after the parts, no naming strategy beats any other and the measure is noise.** On a
shot whose two PNGs are called things like `square` and `pendulum`, the names carry
nothing a rig could inherit, every candidate name is as good as every other, and the
name measures are reporting the honesty rule's own price rather than a defect in
your rig. Do not spend a loop hunting for better names there, and do not read the
low figure as a miss — say in the log that the art did not carry them.

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
is dense, and what it does not carry is a key its own neighbours already imply.

🧩 **⇒ A hold still needs a key at both ends, and two equal values are not a
repeat.** Clean Up's *"keying the same value multiple times in a row"* is about
**three or more** — a run of keys whose interior ones their neighbours imply. Two
keys of equal value imply nothing: they are the only way to say *nothing moves here*
on an interpolated timeline, and deleting either one ramps the value through the
hold. Stillness is a thing a shot does, sometimes for a twelfth of a second and
sometimes for nine, and it is authored, not omitted. ⇒ Key the start of a hold and
key its end, at the same value; drop the ones in between. This is §9.2's *"held pose
that is not held"* from the other side, and the same place catches it — a sloped
hold shows up in `check`'s per-frame column and nowhere else, because it is cheap in
every single frame and wrong only in the relation between two.

⚠️ **The key reducer has to key the plateau, because a plateau is neither an end nor
a turn.** A planner that forces the series ends and every change of direction —
which is exactly what the rule above asks for — will still author a slope straight
through a run of still frames: not one sample in the middle of a hold is an end or
a turning point, and a greedy span stays inside its own per-bone tolerance the whole
way across. **A tolerance is not a hold.** Slow motion inside the tolerance is a
tolerance question; stillness is a thing the shot *does*, and it survives the
reduction only if the reduction is told to keep it. ⇒ Force **both ends of every run
of equal values** as keys in their own right — a third kind of forced index beside
the series ends and the turning points — and test on **exact** equality, so that a
merely near-still span is deliberately not swept up with it. This is worth doing
before you have any evidence you need it: a run whose *poses* are all right can fail
this and see nothing wrong anywhere else, because `validate` has no opinion on it,
`diff` never looks at a rendered frame, and an aggregate MAE is cheap in every
single frame and wrong only in the relation between two.

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

⚠️ **Two rules for a run that *fits* a pose series rather than reading it off the
frames.** Neither is Spine's — no public page has an opinion about a fitter — but
both decide where the keys above actually land, so they sit beside them. Both were
paid for on the ladder. (**§8.1** is how the series gets fitted in the first place.)

**A key tolerance on a rotation is not a number of degrees.** The same angular error
costs a different number of pixels at every level of a hierarchy, because everything
below the bone comes with it. Measured on rung 8's four-link chain: **a quarter of a
degree on the last link moves the chain's end 0.15 px, and the same quarter degree
on the plate the chain hangs from moves it 0.69 px.** One figure in degrees applied
per property therefore keys the far end of the chain roughly four times too loosely
while over-keying the near end — it is not one tolerance at all. ⇒ Declare **one**
tolerance, **in pixels at the end of what the bone swings**, and convert it per bone
by that bone's lever arm. With that, the whole trade reads as one curve and you can
pick a point on it deliberately: that shot measured 0.6 px → 259 keys → 1.619 window
MAE, 0.3 px → 300 → 1.402, 0.15 px → 377 → 1.305.

⚠️ **Compute what a skipped sample costs before you declare that tolerance — on a
fast subject the shot's own speed has already pinned it.** Skipping one sample means
spanning it linearly, and the chord through its two neighbours sits at their mean, so
the deviation at the sample skipped is **half** the series' second difference there:
`|f(n−1) − 2·f(n) + f(n+1)| / 2`. That is an identity, not an approximation — check
it on `f(n) = n²`, whose second difference is 2: the chord reads `n² + 1` where the
curve reads `n²`, and the deviation is 1. So second-difference the fitted series,
halve it, and read that number against the tolerance you were about to declare. If it
is the larger of the two, the fitter keys nearly every frame, and no tolerance below
it changes that — the key density is then a fact about the subject, not a choice you
made. One ladder run is that case: its subject's median frame-to-frame second
difference measured 6.4 px, so a span that skips one sample deviates about 3.2 px,
ten times the 0.3 px tolerance the run declared, and the tolerance would have to be
loosened past that 3.2 px before a span could afford to skip anything at all. What
the trade bought there was accuracy and never sparsity — 0.6 px → 439 keys → 18.22
MAE at 12 fps, 0.45 px → 482 → 17.54, 0.3 px → 521 → 17.26. ⇒ Do the arithmetic
first. It tells you which of the two situations you are in: picking a point on the
curve above, or discovering the point the shot has already put you on — and the
second one is not a failure to reach the density this section asks for, it is what
that density is here.

**A rig's parameters are not identified by its pixels — remove the gauges before you
key.** A bone that carries no attachment is an exact gauge: turn it by δ, turn its
children back by δ, and **not one pixel changes**. Anything optimising against pixels
is free to wander along that direction, and it does. On the spineboy run the figure's
topmost body bone carries no art and every moving bone sits under it, and a
coordinate descent walked it to **+181°** against its child's **−184°** — a pose
whose picture is right on every frame and whose key series spins the whole figure
through a full turn between two of them. The rendered result is correct and the
authored rig is nonsense, and no amount of further fitting finds it, because every
point on the gauge orbit has identical error. ⇒ Fold each gauge out *before* the
series becomes keys — for a rotation gauge, take the median of the values along the
chain and fold it back. The same shape exists wherever a transform is unobservable: a
bone with no art, a slot-less parent chain, a uniform scale split across two bones.

⚠️ **That fold is exact only when the gauge bone's children sit at its own origin** —
and a character's body bone almost never has them there, which is the very shape the
paragraph above was written from. Turn the parent by δ and a child *at the origin*
back by δ and the child is where it was; a child sitting 10 units off swings through
an arc of that radius first, and the counter-turn only spins it on the spot. The fold
moves art, so it **changes the picture**. Measured on the second spineboy run, whose
`hip` carries no attachment and has three children 9–13 units off it: the fold cost
**3 MAE on every `idle` frame** — mean 23.0 with it against 19.9 without, same search
— and it was removed. ⇒ Read the children's offsets before you fold. At the origin,
fold: it is exact and it is cheap. Off the origin the degeneracy is still there but
it is **soft**, not exact, and a soft degeneracy is *regularised, not folded* — leave
the values alone and add a penalty on the gauge direction to the objective instead.
That run used **2e-5 per squared degree** of hip rotation: invisible at animator-sized
angles, and still decisive against the +181° against −184° above.

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

🚨 **The table is a constraint on where the keys go, not a formatting step applied
afterwards — it has to exist while the keys are chosen.** A run that plans its keys
by fitting each span's **own** handles, and then writes the nearest entry of a named
table, has bought a key count at one tolerance and shipped it at another. Nothing in
the loop can see that: the timeline count, the key count, the curve kinds and the
duration are all unmoved, so `diff` does not shift and the gate stays green, while
the rendered result changes by a multiple. Rung 8's first version did exactly this
and went from **1.07 to 4.65 MAE** — four times its own fit's floor. ⇒ Two passes.
Pass A fits freely and exists only to *discover* which shapes the shot uses; those
are clustered into the table; pass B re-plans **every** timeline under the table it
will actually write. Never fit free handles and substitute the nearest named shape
after the fact. (The table's size then trades against the key count at a fixed
tolerance — that shot ran 4 easings/368 keys, 8/314, 12/300, 16/284 — because a
richer table holds more spans.) This is rung 6's clamp defect in another suit:
**a constraint that is not enforced where the value is written is not a
constraint.**

🧩 **⇒ A span with no interior sample takes the automatic handles, not linear.** Two
keys on adjacent samples leave pass B nothing to fit — the samples cannot constrain
that span's shape at all — and a planner with nothing to fit leaves `ease` off, which
is linear (§4.5): the one shape this section says to argue for rather than default to.
"No information" is not an argument for constant speed. Take instead the tangents the
keys either side imply — the editor's own **automatic handles**, quoted above — and
snap *those* to the nearest table entry, exactly as you would a fitted span. Rung 8's
second version did this for its adjacent pairs and the samples barely moved (**17.34 →
17.26 MAE**) while `curve_kinds` changed wholesale: nil in the frames, large in the
structure, which is the signature of a convention rather than a fidelity fix — and
this section's whole subject.

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
