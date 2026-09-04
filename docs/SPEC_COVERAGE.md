# Spine 4.3 export-format surface vs. rigc coverage vs. the example ladder

Research note, 2026-08-22. A survey, not a plan: it establishes what the 4.3 export format can hold,
what rigc emits today, and what the official example projects actually use — so the gap list is
ordered by what the benchmark ladder needs rather than by the spec's alphabet.

Reproduce the measurements with `bun run fetch-examples && bun run bench:usage`
([`bench/count_features.ts`](https://github.com/firejune/rigc/blob/main/bench/count_features.ts) → [`feature_matrix.csv`](https://github.com/firejune/rigc/blob/main/docs/feature_matrix.csv),
[`feature_matrix.json`](https://github.com/firejune/rigc/blob/main/docs/feature_matrix.json)).

> 🔼 **This note is dated and does not move; the measurements below are the corpus as it
> stood on 2026-08-22 and stay as written. Its statements about what rigc *does* have gone
> stale in six places, and the live ledger is [LADDER.md](https://github.com/firejune/rigc/blob/main/docs/LADDER.md):**
>
> - **B2 is fixed** — A16 accepts `4.3`, `4.3.N` and `4.3.N-<suffix>`, so all twelve example
>   exports pass it.
> - **The profile split exists** — `--profile spine | spine-html`, **default `spine` since
>   2026-08-29** (issue #221; it was `spine-html` when this survey was written), so the nine
>   renderer-policy assertions of §2.2 no longer apply to foreign data, and no longer apply
>   unasked. That closes the validator half of B3; **the emitter half closed on 2026-09-03
>   (issue #4)** — `build --pack` arranges the parts onto shared power-of-two pages written into
>   `--out`, and `build --atlas-in <file.atlas>` resolves every part against the regions of a
>   pack somebody else made. Both are opt-in and both are narrow: no trimming, no rotation
>   (`rotate: 0` on every region rigc writes), no scaling, and a packed atlas is refused under
>   `--profile spine-html`, whose A06 clause **is** the one-part-per-page convention. So §3-2's
>   atlas table, §4-0's B3 row and its "no packer *and* no importer" both describe a state that
>   no longer exists; what remains true of them is the DEFAULT, which is still one part per page.
>   Limits and flag shapes: [AUTHORING §0.1–§0.2](https://github.com/firejune/rigc/blob/main/docs/AUTHORING.md).
> - **Part 4-2's ❌ rows for `path`, `slider` and per-skin members are gone (issues #2, #7)** —
>   rigc emits path attachments and path constraints, sliders in both of their models, per-skin
>   `bones` and constraint lists, and the `path` / `slider` timeline groups. Three assertions came
>   with them (A36, A37, A38). The **corpus** measurements in part 3 are untouched and still true:
>   none of these features appears in any of the twelve example files, which is why they were
>   off the ladder and why nothing in it moved.
> - **`walkTimelines` reaches all eleven groups** — §2.3 item 1 and §4.3 item 4 are done, so
>   A05 is no longer blind to `ik` / `transform` / `path` / `slider` / `drawOrder` /
>   `drawOrderFolder` / `events`.
> - **B1 is closed (2026-08-22)** — the bone tree is no longer code. `src/archetype.ts` is gone
>   and the skeleton is a **rig spec** (`spec: "rigc-rig/1"`, `src/rig.ts`): bones, slots, skins,
>   attachments, the 4.3 typed constraint array and the invariants, all as data. So §2.4's
>   "the bone tree is code, not data", §4.0's B1 row and executive-summary item 7 describe a
>   state that no longer exists. Rung 3 transcribed into that format scores 1.000 on every
>   measure of every section — figures in [LADDER.md](https://github.com/firejune/rigc/blob/main/docs/LADDER.md).
> - Since that change rigc also emits **ik and transform constraints**, the **single-axis bone
>   timelines** (`translatex`/`translatey`/`scalex`/`scaley`/`shear`/`shearx`/`sheary`), bone
>   `length`/`scale`/`shear`/`inherit`/`skin`/`color` setup fields, slot `dark`/`blend`, region
>   `path`/`scaleX`/`scaleY`/`color`, mesh `path`/`edges`/`color`, and the header's `fps` /
>   `referenceScale` / `images`. Part 2's coverage tables predate all of it.
>
> **The measurements of the CORPUS (Part 3) have not moved and stay as written.**
>
> 🔒 **Redacted for publication (2026-08-23), and nothing but names.** The note was written
> inside the sandbox of the project rigc was split out of, and it enumerated that project's
> archetype names, bone tree and slot table. Those are the consumer's, not this
> repository's, so they are replaced by the SHAPE they stood for — counts, parentage,
> structure — which is what every argument here actually rests on: §2.4's point is that
> eighteen bones were hard-coded and *no example fits them*, and that survives the names
> going. Where a number was measured it is still the measured number.

---

## Executive summary (10 lines)

1. **The de facto 4.3 spec is `SkeletonJson.ts`, and it has no schema** — every field passes through
   `getValue(map, key, default)` (`SkeletonJson.ts:1404-1406`), so anything unknown is ignored and
   anything missing silently becomes a default. There is no version gate in the JSON path.
2. **The official JSON doc is still 3.8.24** (verified today, one version token on the page) and it
   documents a format shape that 4.3 *no longer reads*: top-level `"ik"`/`"transform"`/`"path"`
   arrays, bone `"transform"`, `"draworder"` all-lowercase. Where doc and parser disagree, **the
   parser wins**; writing to the doc produces a file that loads clean and is wrong.
3. **The atlas and binary docs, by contrast, are current 4.x** — the atlas page documents
   `bounds:`/`offsets:`/`pma:`, which is the compact form the 4.3 reader prefers.
4. **4.3 is the biggest format break of the 4.x line**, and I verified the transition points against
   the 4.0/4.1/4.2 parsers: 4.1 added `sequence`, 4.2 added `physics` + `referenceScale` and renamed
   bone `transform`→`inherit`, 4.3 collapsed all constraints into one `constraints[]` array with a
   `type` discriminator, added the `slider` constraint, `drawOrderFolder`, bone icons, and rebuilt
   the transform constraint around `source` + `properties`.
5. The full 4.3 JSON surface is **7 attachment types, 5 constraint types, 37 timeline kinds,
   3 curve encodings** — enumerated with line numbers in Part 1.
6. **rigc emits a narrow slice of it**: 2 of 7 attachment types (region, weighted mesh), 1 of 5
   constraint types (physics), and **7 of 37 timeline kinds** (`rotate`/`translate`/`scale` on bones,
   `attachment`/`rgba` on slots, `mix`/`reset` on physics). One skin, named `default`. No IK, no
   transform constraint, no path, no slider, no deform, no drawOrder, no events, no sequences.
7. rigc's **input model is narrower than its emitter**: the bone tree is *code*
   (`src/archetype.ts`, three hard-coded archetypes), not data. That is the single largest blocker
   for the example ladder — **no example project fits any of the three.**
8. rigc's 31 assertions split into two kinds that must be separated before the ladder:
   **Spine-validity rules** (A00–A05, A08, A17, A27 — these catch real silent corruption) and
   **renderer/canvas-profile rules for spine-html** (A06 no-rotate/no-PMA, A11 no clipping, A12 no
   dark colour, A13 ≤4 mesh slots ≤80 tris, A14 no full-frame mesh, A19 alpha, A20 meshes must be
   weighted). The second group is a *policy*, not a spec, and must become a switch.
9. The validator is **structurally blind** to whole timeline groups: `walkTimelines`
   (`src/validate.ts:1159-1199`) only descends `bones`/`slots`/`physics`/`attachments`. An `ik`,
   `transform`, `path`, `slider`, `drawOrder`, or `events` block would pass A05 unexamined.
10. **The ladder uses far less of the format than the format holds** (12 skeleton files measured,
    all `"4.3.75-beta"`, all flat-`constraints` shape): **no example uses a non-default skin**, path
    constraint, slider, sequence, linked mesh, or dark colour. First appearances that matter:
    drawOrder at rung 5, transform constraints + weighted meshes at rung 6, physics + deform at
    rung 7, IK + clipping + events + bounding box + unweighted meshes only at spineboy. Three
    blockers precede rung 1 — the bone tree being code, `A16`'s regex rejecting `4.3.75-beta`, and
    the one-part-per-page atlas model against nine packed atlases. **Nothing was implemented *at the
    time of writing*; see the banner above for what has been since.**

**Prior work this document extends, not repeats:** an earlier round of design notes covering parse
coverage (including the finding that the official JSON documentation is still 3.8), the round-trip
probe and the **six silent-failure cases** it measured — referred to below as cases 6a–6h — and a
coverage matrix of what one editor export actually contained. Those notes are design records held
by the project rigc was split out of, not files in this repository; every finding this document
leans on is restated here rather than cited. The wider question they did not ask is the one below:
what can the format hold at all, and what does the public benchmark corpus actually use.

---

## Sources

| # | Source | Lines | Version |
| --- | --- | ---: | --- |
| S1 | [`spine-core/src/SkeletonJson.ts`](https://github.com/EsotericSoftware/spine-runtimes/blob/4.3/spine-ts/spine-core/src/SkeletonJson.ts) | 1406 | matches the pinned `@esotericsoftware/spine-core@4.3.13` (case-label diff: identical) |
| S2 | [`spine-core/src/SkeletonBinary.ts`](https://github.com/EsotericSoftware/spine-runtimes/blob/4.3/spine-ts/spine-core/src/SkeletonBinary.ts) | 1455 | idem |
| S3 | [`spine-core/src/TextureAtlas.ts`](https://github.com/EsotericSoftware/spine-runtimes/blob/4.3/spine-ts/spine-core/src/TextureAtlas.ts) | 274 | idem |
| S4 | [`spine-core/src/Animation.ts`](https://github.com/EsotericSoftware/spine-runtimes/blob/4.3/spine-ts/spine-core/src/Animation.ts) | 2560 | idem |
| S5 | `spine-core/src/` — `BoneData.ts`, `SlotData.ts`, `ConstraintData.ts`, `PathConstraintData.ts`, `attachments/Sequence.ts`, `Skin.ts`, `SkeletonData.ts`, `Utils.ts` | — | idem |
| S6 | `SkeletonJson.ts` on branches `4.0`, `4.1`, `4.2` | — | for the format-diff table below |
| S7 | https://esotericsoftware.com/spine-json-format | — | **3.8.24** |
| S8 | https://esotericsoftware.com/spine-binary-format | — | no version token on page |
| S9 | https://esotericsoftware.com/spine-atlas-format | — | no version token; content is 4.x |
| S10 | https://esotericsoftware.com/spine-loading-skeleton-data | — | — |
| S11 | [`spine-runtimes/CHANGELOG.md`](https://github.com/EsotericSoftware/spine-runtimes/blob/4.3/CHANGELOG.md) | 3164 | — |
| S12 | [`spine-runtimes/README.md`](https://github.com/EsotericSoftware/spine-runtimes/blob/4.3/README.md) | — | — |
| S13 | this repository | — | v0.1.0; `src/*.ts`, `cli.ts`, `selftest.ts`, `README.md`, `NOTICE.md` |
| S14 | the nine example projects under `examples/` (`bun run fetch-examples`) | — | all export `"spine": "4.3.75-beta"` |

**Citation convention.** Bare `:NNN` line numbers are into the branch-`4.3` TypeScript sources above,
which are also what `node_modules/@esotericsoftware/spine-core/src/<File>.ts` would hold —
⚠️ the published npm package ships **`dist/` only**, so the local copy to read is
`node_modules/@esotericsoftware/spine-core/dist/<File>.js`, whose line numbers differ. The two were
reconciled before publication: the parser's full `case` label set is identical in both.

**Marker convention used in Part 1:** 📘 = the field is described on an official Esoteric docs page.
🔍 = source-only; the parser reads it but no public doc page describes it.

### Verified doc-status findings

- **The JSON format page documents 3.8.24.** The only version token anywhere in the page body is
  `"spine" : "3.8.24"` inside its skeleton example (S7). Plan 04 §1-0 recorded this on 2026-08-21;
  **it is still true on 2026-08-22.** The page also still shows the 3.8-shaped
  `"ik" : [ { "name" : "left leg" …` top-level array and a `"draworder" : { … }` key spelled
  all-lowercase — the 4.3 parser reads `map.drawOrder`, camel-cased (`SkeletonJson.ts:1209`).
- **The binary page carries no version token at all** and is otherwise structured like the JSON page.
- **The atlas page is current.** It documents `bounds:` / `offsets:` (the 4.x compact form), `pma:`,
  `index:`, `split:`, `pad:`, and `rotate:` as "`true` … or a number representing degrees from 0 to
  360" — which is exactly what `TextureAtlas.ts:91-97` implements. **One gap:** the atlas doc does not
  mention the page-level `scale:` line, yet every one of the nine official example atlases emits it
  (Part 3) and the spine-ts reader silently discards it. Docs and parser are both incomplete here;
  the *packer* is the only authority.
- **The CHANGELOG is not a format ledger for 4.x.** It records per-runtime API churn. The 4.0→4.3
  JSON shape changes are not enumerated anywhere public; I derived them from the four parsers (S6),
  table below.

### On third-party tools writing these formats

Esoteric's own documentation **invites** third-party tools to write these formats, in
three places:

- JSON format page (S7): *"Also, Spine can import data in this format, allowing interoperability with
  other tools."* — https://esotericsoftware.com/spine-json-format
- Loading guide (S10): *"Other tools can also be used to pack a texture atlas in the Spine atlas
  format, such as Texture Packer Pro using the "libgdx" atlas format."* —
  https://esotericsoftware.com/spine-loading-skeleton-data
- Esoteric's own `spine-scripts` repo README: *"In addition to exporting images, some scripts also
  write JSON data which can be imported into Spine."* —
  https://github.com/EsotericSoftware/spine-scripts

What *is* stated as policy is a **version-lockstep expectation**, not a format restriction —
`spine-runtimes/README.md` §Versioning (S12): *"It is highly suggested to freeze the Spine editor
version to match the Spine Runtimes source being used and to update them in lock step."* Note the
spine-ts **JSON** path does **not** enforce this: `SkeletonJson` stores `skeletonData.version` and
never compares it (`SkeletonJson.ts:78`). Some other-language runtimes do gate on it (CHANGELOG
line 1678: *"Parsing skeleton .JSON and .skel files will report an error if the skeleton version does
not match the runtime version"*), so a wrong `skeleton.spine` string is portable-fragile even though
spine-ts tolerates it. rigc's A16 already pins it to `4.3.x`.

Separately, the licence chain matters for the ladder, and rigc's `NOTICE.md` states it as a
four-point chain rather than leaving it to be inferred: rigc's output **is** Spine skeleton data,
playing that data in a product needs **a Spine Runtime**, the Spine Runtimes License Agreement
requires **each user of such a product to hold a Spine Editor licence**, and rigc **links
spine-core** itself — so the same obligation covers running rigc at all. rigc therefore carries that
obligation forward rather than routing around it, and the interoperability the pages above invite is
taken on those terms. Reproducing the example projects does not change any of it; see the
per-example licence findings in Part 3.

---

## Format-change timeline, verified from the four parsers (S1, S6)

| Change | 4.0 | 4.1 | 4.2 | 4.3 |
| --- | --- | --- | --- | --- |
| Constraints location | `root.ik` / `root.transform` / `root.path` arrays | same | same **+ `root.physics`** | **single `root.constraints[]`, `type` discriminator** |
| Bone inheritance field | `"transform"` | `"transform"` | **`"inherit"`** | `"inherit"` |
| `sequence` on region/mesh | ✗ | **✓** | ✓ | ✓ |
| `skeleton.referenceScale` | ✗ | ✗ | **✓** | ✓ |
| `physics` constraint + timelines | ✗ | ✗ | **✓** | ✓ |
| `slider` constraint + timelines | ✗ | ✗ | ✗ | **✓** |
| `drawOrderFolder` timeline | ✗ | ✗ | ✗ | **✓** |
| Bone `icon`/`iconSize`/`iconRotation` (JSON) | ✗ | ✗ | ✗ | **✓** |
| Transform constraint model | `target` + `local`/`relative` + `offsetRotation` + mix\* | same | same | **`source` + `properties{from→to}` + `localSource`/`localTarget`/`additive`/`clamp`** |
| IK `uniform` bool | ✓ | ✓ | ✓ | **replaced by `scaleY` (`ScaleYMode`)** |

Evidence: `root.ik` present in 4.0/4.1/4.2 and absent in 4.3; `root.constraints` absent in
4.0/4.1/4.2 and present in 4.3; `uniform` at `4.2 SkeletonJson.ts:161`, gone in 4.3; `target` at
`4.2:182,222` vs `source` at `4.3:188`.

⇒ **This is why case 6a matters so much for the ladder.** Any example project exported by a
pre-4.3 editor carries the *legacy* shape, and the 4.3 parser drops those constraints on the floor
with no error. Part 3 measures which shape each example actually ships.

---

## Part 1 — the full 4.3 JSON surface

All line numbers refer to **S1**, `SkeletonJson.ts` (branch `4.3`, 1406 lines), unless prefixed.
Everything reaches the parser through `getValue(map, property, defaultValue)` at `:1404-1406`, so
**"required" below means "the parser dereferences it unconditionally and produces `NaN`/`undefined`
if absent"** — never "the parser complains".

### 1.1 Skeleton header — `root.skeleton` (`:75-87`)

| Field | Default | Notes | Doc |
| --- | --- | --- | --- |
| `hash` | `undefined` | opaque; tools use it for change detection | 📘 |
| `spine` | `undefined` | stored as `skeletonData.version`, **never compared** in spine-ts JSON | 📘 |
| `x`, `y`, `width`, `height` | `undefined` | the setup-pose bounding box | 📘 |
| `referenceScale` | `100` (× `scale`) | **4.2+**; drives runtime physics/scale reference | 🔍 |
| `fps` | `undefined` → `SkeletonData.fps` stays `30` | nonessential | 📘 |
| `images` | `null` | nonessential | 📘 |
| `audio` | `null` | nonessential | 📘 |

The whole `skeleton` block is optional (`if (skeletonMap)` at `:76`).

### 1.2 Bones — `root.bones[]` (`:90-118`)

| Field | Default | Notes | Doc |
| --- | --- | --- | --- |
| `name` | — | required in practice (`new BoneData(…, boneMap.name, …)`, `:97`) | 📘 |
| `parent` | `null` | resolved by name; **must be declared earlier in the array** | 📘 |
| `length` | `0` (× scale) | | 📘 |
| `x`, `y` | `0` (× scale) | local to parent | 📘 |
| `rotation` | `0` | degrees, CCW, y-up | 📘 |
| `scaleX`, `scaleY` | `1` | | 📘 |
| `shearX`, `shearY` | `0` | | 📘 |
| `inherit` | `"Normal"` | enum `Normal \| OnlyTranslation \| NoRotationOrReflection \| NoScale \| NoScaleOrReflection` (`BoneData.ts:80`). Resolved by `Utils.enumValue` which upper-cases the first letter (`Utils.ts:392-394`), so `"noScale"` and `"NoScale"` both work. **4.2+ name; 4.0/4.1 called it `transform`** | 🔍 |
| `skin` | `false` | → `data.skinRequired` | 📘 (as "skin") |
| `color` | none | hex string `rrggbbaa`, nonessential | 📘 |
| `icon` | `undefined` | **4.3, editor-only affordance** | 🔍 |
| `iconSize` | `1` | 4.3 | 🔍 |
| `iconRotation` | `0` | 4.3 | 🔍 |
| ~~`visible`~~ | — | **NOT read from JSON.** `SkeletonBinary.ts:126` reads it (nonessential); the JSON parser has no equivalent. See §1.10. | 🔍 |

### 1.3 Slots — `root.slots[]` (`:121-141`)

| Field | Default | Notes | Doc |
| --- | --- | --- | --- |
| `name` | — | required | 📘 |
| `bone` | — | **required**; a miss throws `Couldn't find bone … for slot …` (`:127`) | 📘 |
| `color` | white | `rrggbbaa` | 📘 |
| `dark` | none | two-colour tint; only set when present, and `darkColor` stays `null` otherwise (`:133-134`) | 📘 |
| `attachment` | `null` | setup-pose attachment name | 📘 |
| `blend` | `"normal"` | enum `Normal \| Additive \| Multiply \| Screen` (`SlotData.ts:64`) | 📘 |
| `visible` | `true` | 4.3, nonessential-ish; **JSON reads this one** (`:138`) | 🔍 |

**Draw order is the array order of `slots`.** There is no separate setup draw-order field.

### 1.4 Constraints — `root.constraints[]` (`:144-369`) — **4.3 shape**

Common to every entry: `name`, `type`, `skin` (default `false` → `skinRequired`, `:147`).
`type` is read with `getValue(constraintMap, "type", false)`, so **an entry with no `type` matches
no case and is silently dropped** (`:148-367`, no `default:` branch).

**`type: "ik"`** (`:149-176`) 📘 (3.8 shape only)

| Field | Default |
| --- | --- |
| `bones[]` | required, ≥1, resolved by name (throws on miss) |
| `target` | required (throws on miss) |
| `scaleY` | absent → `ScaleYMode.None`; enum `None \| Uniform \| Volume` (`ConstraintData.ts:50`). **4.3 replacement for 4.2's `uniform: bool`** |
| `mix` | `1` |
| `softness` | `0` (× scale) |
| `bendPositive` | `true` → `bendDirection = ±1` |
| `compress` | `false` |
| `stretch` | `false` |

**`type: "transform"`** (`:177-268`) 🔍 — completely rebuilt in 4.3

| Field | Default |
| --- | --- |
| `bones[]` | required |
| `source` | required (4.2 called this `target`) |
| `localSource`, `localTarget`, `additive`, `clamp` | `false` |
| `properties` | `{}` — a map `fromName → { offset, to: { toName → { offset, max, scale } } }`. `fromName`/`toName` ∈ `rotate \| x \| y \| scaleX \| scaleY \| shearY`; anything else **throws** (`:241`, `:521`). `x`/`y` offsets are scaled (`propertyScale`, `:526-532`) |
| `rotation`, `x`, `y`, `scaleX`, `scaleY`, `shearY` | `0` — the constraint's offsets array |
| `mixRotate`, `mixX`, `mixScaleX`, `mixShearY` | `1`; `mixY` defaults to `mixX`, `mixScaleY` to `mixScaleX`. **Each mix is only read if the matching `to` property was declared** (`:259-264`) |

**`type: "path"`** (`:269-300`) 📘 (3.8 shape)

| Field | Default |
| --- | --- |
| `bones[]`, `slot` | required |
| `positionMode` | `"Percent"` — `Fixed \| Percent` (`PathConstraintData.ts:77`) |
| `spacingMode` | `"Length"` — `Length \| Fixed \| Percent \| Proportional` (`:82`) |
| `rotateMode` | `"Tangent"` — `Tangent \| Chain \| ChainScale` (`:87`) |
| `rotation` | `0` → `offsetRotation` |
| `position` | `0`; × scale iff `positionMode == Fixed` |
| `spacing` | `0`; × scale iff `spacingMode ∈ {Length, Fixed}` |
| `mixRotate`, `mixX` | `1`; `mixY` defaults to `mixX` |

**`type: "physics"`** (`:301-339`) 🔍 — 4.2+

| Field | Default |
| --- | --- |
| `bone` | required (throws) |
| `x`, `y`, `rotate`, `scaleX`, `shearX` | `0` — **the components. All zero = a constraint that parses and does nothing** |
| `scaleY` | absent → `ScaleYMode.None` (4.3) |
| `limit` | `5000` (× scale) |
| `fps` | `60` → `step = 1/fps` |
| `inertia` | `0.5` |
| `strength` | `100` |
| `damping` | `0.85` |
| `mass` | `1` → stored as `massInverse = 1/mass` |
| `wind`, `gravity` | `0` |
| `mix` | `1` |
| `inertiaGlobal`, `strengthGlobal`, `dampingGlobal`, `massGlobal`, `windGlobal`, `gravityGlobal`, `mixGlobal` | `false` |

**`type: "slider"`** (`:340-366`) 🔍 — **new in 4.3, undocumented anywhere public**

| Field | Default |
| --- | --- |
| `additive`, `loop` | `false` |
| `mix` | `1` |
| `bone` | optional. **Presence switches the whole model**: with a bone it is a property-driven slider, without one it is a time slider (`time`, default `0`, `:361`) |
| `property` | required when `bone` is set; same six `from` names as the transform constraint |
| `from` | `0` (× propertyScale) → `data.property.offset` |
| `to` | `0` → `data.offset` |
| `scale` | `1` ÷ propertyScale |
| `max` | `0` |
| `local` | `false` |
| `animation` | resolved in a **second pass over `root.constraints`** after animations are read (`:495-507`); a miss throws `Slider animation not found` |

### 1.5 Skins — `root.skins[]` (`:372-443`)

| Field | Default | Notes |
| --- | --- | --- |
| `name` | — | the skin named `"default"` becomes `skeletonData.defaultSkin` (`:441`) |
| `bones[]` | none | bone names this skin activates (`:377-384`) |
| `ik[]`, `transform[]`, `path[]`, `physics[]`, `slider[]` | none | **constraint names, still split per type inside a skin** even though the top-level array was unified (`:386-429`) |
| `attachments` | `{}` | `slotName → { placeholderName → attachmentMap }` (`:431-439`) |
| ~~`color`~~ | — | **not read from JSON.** `Skin.color` exists with a default of `fe9e4fff` (`Skin.ts:71-72`) and only `SkeletonBinary.ts:448` sets it. |

The **placeholder** (the key) and the attachment's own `name` are different things: `name` defaults
to the placeholder (`:537`), and `path` defaults to `name` (`:541`, `:570`). Three-level indirection:
placeholder → name → path → atlas region.

### 1.6 Attachments (`readAttachment`, `:535-654`) — `type` defaults to `"region"` (`:539`)

| Type | Fields (default) | Line | Doc |
| --- | --- | --- | --- |
| `region` | `path`(=name), `sequence`(null), `x`(0×s), `y`(0×s), `scaleX`(1), `scaleY`(1), `rotation`(0), **`width`/`height` (no default — `map.width * scale`, `undefined` → `NaN`)**, `color` | `:540-559` | 📘 |
| `boundingbox` | `vertexCount` (no default), `vertices`, `color` | `:560-567` | 📘 |
| `mesh` | `path`(=name), `sequence`, `color`, `width`(0), `height`(0), `uvs` (no default — **its length defines `worldVerticesLength`**), `triangles` (no default — `undefined` if missing), `vertices`, `edges`(null), `hull`(0, **stored ×2** as `hullLength`) | `:568-605` | 📘 |
| `linkedmesh` | same head, then `source` (required to make it linked), `slot`(null), `skin`(null), `timelines`(true). **A map with `type:"mesh"` and a `source` key is also a linked mesh** — the two cases share one branch (`:568-569`) and the `source` check at `:582` is what decides | `:568-605` | 📘 |
| `path` | `closed`(false), `constantSpeed`(true), `vertexCount` (no default), `vertices`, `lengths` (no default — `map.lengths.length` is dereferenced), `color` | `:606-623` | 📘 |
| `point` | `x`(0×s), `y`(0×s), `rotation`(0), `color` | `:624-634` | 📘 |
| `clipping` | `end`(null → slot name), `convex`(false, **4.3**), `inverse`(false, **4.3**), `vertexCount`, `vertices`, `color` | `:635-651` | 📘 (convex/inverse 🔍) |

**Any other `type` string returns `null`** (`:653`) — the attachment vanishes with no error.

**`sequence`** (`readSequence`, `:656-663`) 🔍 — region and mesh only:
`count` (0), `start` (1), `digits` (0), `setup` (0). Absent → `new Sequence(1, false)`.

**Vertex encoding** (`readVertices`, `:666-693`) — **the highest-risk field in the format.**
There is no flag. If `vertices.length === verticesLength` (i.e. `uvs.length`, or `vertexCount<<1`)
it is read as **unweighted** x/y pairs; otherwise as the **weighted** run-length encoding
`boneCount, (boneIndex, bindX, bindY, weight) × boneCount, …`. A coincidental length match reads
weight data as coordinates. Plan 04 §1-3 already recorded this; it is restated here because the
example corpus contains both encodings.

🚨 The second risk in the same field is `boneIndex`: it is a position in the emitted bone array,
so the run means something different the moment the bone list changes, and nothing in the file
records what it used to mean. A rig spec therefore writes `weights` — the same data with the bones
**named** — and rigc encodes this run on emit. The raw form stays reachable behind
`"boneIndexing": "raw"` for transcribing an export verbatim. Issue #45.

### 1.7 Events — `root.events` (object, not array) (`:469-484`)

`eventName → { int (0), float (0), string (""), audio (null), volume, balance }`.
**`volume` and `balance` are only read when `audio` is set** (`:478-481`) — otherwise the setup values
stand. 📘

### 1.8 Animation timelines — `root.animations[animName]` (`readAnimation`, `:696-1272`)

Top-level groups inside one animation: `slots`, `bones`, `ik`, `transform`, `path`, `physics`,
`slider`, `attachments`, `drawOrder`, `drawOrderFolder`, `events`, plus a nonessential `color`
(`:1268-1269`). Anything else is ignored.

| Group | Timeline | Value fields per key | Curve channels | Line | Doc |
| --- | --- | --- | --- | --- | --- |
| `slots.<slot>` | `attachment` | `name` (nullable) | **none** | `:713-721` | 📘 |
| | `rgba` | `color` (`rrggbbaa`) | 4 | `:722-751` | 📘 |
| | `rgb` | `color` (`rrggbb`) | 3 | `:752-780` | 🔍 |
| | `alpha` | `value` | 1 | `:781-784` | 🔍 |
| | `rgba2` | `light`, `dark` | 7 | `:785-821` | 🔍 |
| | `rgb2` | `light`, `dark` | 6 | `:822-857` | 🔍 |
| | *anything else* | — | — | **throws** `Invalid timeline type for a slot` (`:858-859`) | |
| `bones.<bone>` | `rotate` | `value` | 1 | `:878` | 📘 |
| | `translate` | `x`, `y` | 2 | `:879` | 📘 |
| | `translatex` / `translatey` | `value` | 1 | `:880-881` | 🔍 |
| | `scale` | `x`, `y` | 2 | `:882` | 📘 |
| | `scalex` / `scaley` | `value` | 1 | `:883-884` | 🔍 |
| | `shear` | `x`, `y` | 2 | `:885` | 📘 |
| | `shearx` / `sheary` | `value` | 1 | `:886-887` | 🔍 |
| | `inherit` | `inherit` (enum string) | **none** | `:888-896` | 🔍 |
| | *anything else* | — | — | **throws** `Invalid timeline type for a bone` (`:897-898`) | |
| `ik.<constraint>` | (one array, no sub-name) | `mix`(1), `softness`(0×s), `bendPositive`(true), `compress`(false), `stretch`(false) | 2 (mix, softness) | `:906-945` | 📘 |
| `transform.<constraint>` | (one array) | `mixRotate`(1), `mixX`(1), `mixY`(=mixX), `mixScaleX`(1), `mixScaleY`(1), `mixShearY`(1) | 6 | `:948-999` | 📘 |
| `path.<constraint>` | `position` | `value` | 1 | `:1015-1019` | 📘 |
| | `spacing` | `value` | 1 | `:1020-1024` | 📘 |
| | `mix` | `mixRotate`, `mixX`, `mixY` | 3 | `:1025-1056` | 📘 |
| `physics.<constraint>` | `inertia`/`strength`/`damping`/`mass`/`wind`/`gravity` | `value` (default 0) | 1 each | `:1088-1093` | 🔍 |
| | `mix` | `value` (default **1**) | 1 | `:1094-1098` | 🔍 |
| | `reset` | *no value* — time only | **none** | `:1080-1086` | 🔍 |
| | *anything else* | — | — | silently `continue`d (`:1099`) — **no throw** | |
| `slider.<constraint>` | `time` | `value` (default 1) | 1 | `:1121` | 🔍 |
| | `mix` | `value` (default 1) | 1 | `:1122` | 🔍 |
| `attachments.<skin>.<slot>.<attachment>` | `deform` | `offset`(0), `vertices[]` | 1 | `:1149-1187` | 📘 |
| | `sequence` | `time`, `mode`(`"hold"`), `index`(0), `delay`(inherits previous) | **none** | `:1188-1201` | 🔍 |
| | *anything else* | — | — | silently ignored | |
| `drawOrder` | (array of keys) | `time`, `offsets[]` of `{slot, offset}`. **No `offsets` = reset to setup order** (`:1352-1353`) | **none** | `:1209-1217` | 📘 (spelled `draworder`) |
| `drawOrderFolder` | (array of folders) | `slots[]` (slot names in the folder), `keys[]` of the same `{time, offsets}` shape, resolved *within the folder* | **none** | `:1220-1239` | 🔍 **4.3 only** |
| `events` | (array) | `name` (required, throws on miss), `time`(0), `int`/`float`/`string` (default = event's setup), `volume`/`balance` **only when the event has an audio path** | **none** | `:1242-1261` | 📘 |

Important asymmetries worth writing down:

- **The physics group's constraint name may be the empty string** (`:1067`), which yields `index = -1`
  and applies to *all* physics constraints. There is no documentation of this.
- **A `deform` key with no `vertices`** resets to the setup mesh (weighted → zeros, unweighted → the
  base vertices) — `:1158-1160`.
- **`drawOrder` produces exactly one timeline for the whole animation**; `drawOrderFolder` produces
  one per folder entry.
- **Empty timeline arrays**: bones `continue` on `frames === 0` (`:875`); ik/transform/path/physics/
  slider `continue` when `[0]` is missing; **slots do not** — an empty `rgba` array reaches
  `timelineMap[0]` and dereferences `keyMap.color` → `TypeError`.

### 1.9 Curve encoding (`readCurve`, `:1388-1401`; `readTimeline1/2`, `:1296-1346`)

Three encodings, on the **key that starts the interval** (`keyMap.curve`, never the destination key):

| Encoding | JSON | Meaning |
| --- | --- | --- |
| linear | `curve` absent | straight interpolation |
| stepped | `"curve": "stepped"` | `timeline.setStepped(frame)` (`:1391`) |
| bezier | `"curve": [ … ]` | array of **exactly 4 numbers per value channel**, concatenated in channel order |

Layout, exactly: for channel index `value`, `i = value << 2` and the four numbers are
`[cx1, cy1, cx2, cy2]` (`:1394-1398`). These are **absolute (time, value) control points**, not
normalised graph-view handles — `cy1`/`cy2` are multiplied by the timeline's `scale` factor, `cx1`/`cx2`
are not. So the array length per timeline is `4 × channels` from the table in §1.8:
rotate 4, translate 8, scale 8, shear 8, rgb 12, rgba 16, rgb2 24, rgba2 28, ik 8, transform 24,
path mix 12, alpha/scalex/deform/physics/slider 4.

**A short array is the format's nastiest silent failure**: `curve[i+3]` is `undefined`, the product
is `NaN`, and nothing throws (case 6g). Timelines with no curve at all (`attachment`,
`inherit`, `sequence`, `drawOrder`, `events`, `physics reset`) ignore a `curve` key entirely.

The X axis is **seconds** in 4.x. It was frames in 3.8 — one more reason the 3.8 doc is actively
dangerous as a spec.

### 1.10 Atlas text format (`TextureAtlas.ts`, S3)

Reader rules (`:194-227`): entries are `key: v1, v2, v3, v4` with **at most four values**
(`:224`); a line with no colon terminates the current block (`:214`). A **blank line closes a page
block** (`:119-121`). Page names are `line.trim()` (`:123`) but **region names are the raw line**
(`:131`) — leading whitespace becomes part of the name. Both traps were measured in the probe.

**Header entries before the first page are read and silently discarded** (`:106-111` — the comment
says so literally).

| Page field | Parsed into | Doc |
| --- | --- | --- |
| `size: w, h` | `page.width/height` (`:43-46`) — **used to compute every UV**, so a wrong value collapses all of them | 📘 |
| `format: …` | **parsed and thrown away** (`:47-49`, "we don't need format in WebGL") | 📘 |
| `filter: min, mag` | `minFilter`/`magFilter` (`:50-53`) | 📘 |
| `repeat: x\|y\|xy\|none` | `uWrap`/`vWrap` (`:54-57`) | 📘 |
| `pma: true\|false` | `page.pma` (`:58-60`) | 📘 |
| `scale: n` | 🚨 **emitted by the Spine texture packer, documented nowhere, and silently discarded by the reader.** There is no `pageFields.scale`, so `if (field) field(page)` at `:126-127` is a no-op. **All nine example atlases carry it** (`scale: 0.5` in eight, `scale: 0.4` in `2-the-12-principles`) — see Part 3. It records the export-time downscale factor; the runtime is expected to compensate via `SkeletonJson.scale` or `referenceScale`, not to read this line. | ❌ undocumented |

| Region field | Parsed into | Doc |
| --- | --- | --- |
| `bounds: x, y, w, h` | 4.x compact form (`:71-76`) | 📘 |
| `offsets: ox, oy, ow, oh` | 4.x compact form (`:85-90`) | 📘 |
| `xy: x, y` | **deprecated** alias (`:63-66`) | 📘 |
| `size: w, h` | **deprecated** alias (`:67-70`) | 📘 |
| `offset: ox, oy` | **deprecated** (`:77-80`) | 📘 |
| `orig: w, h` | **deprecated** (`:81-84`) | 📘 |
| `rotate: true \| false \| <degrees>` | `true` → 90; `false` → 0; anything else `parseInt` (`:91-97`). **90 swaps width/height in the UV computation** (`:161-167`) | 📘 |
| `index: n` | frame index for sequential regions (`:98-100`) | 📘 |
| `split: l, r, t, b` | **no dedicated field.** Falls through to the generic bucket → `region.names`/`region.values` (`:139-147`) | 📘 |
| `pad: l, r, t, b` | same generic bucket | 📘 |
| *any other key* | same generic bucket, `parseInt`-ed | 🔍 |

If `orig`/`offsets` never set an original size, it falls back to the packed size (`:149-152`).

### 1.11 What the binary `.skel` adds or drops relative to JSON (S2)

Same feature set — same five constraint types (`SkeletonBinary.ts:1427-1431`), same attachment types,
same timeline catalogue (it imports the identical list, `:30`). Differences that matter to a JSON-only
emitter:

| Aspect | JSON | Binary |
| --- | --- | --- |
| Strings | inline | string table, index-referenced (`:93-100`) |
| Hash | string field | two int32s, joined as hex (`:76-78`) |
| Nonessential gate | per-field presence | **one boolean** (`:86`), then `fps`/`images`/`audio` (`:87-90`) |
| Bone `color`/`icon`/`iconSize`/`iconRotation` | JSON reads all four | nonessential block (`:121-126`) |
| **Bone `visible`** | ❌ **not readable from JSON** | `:126` |
| **Skin `color`** | ❌ **not readable from JSON** | `:448` |
| Slot `visible` | `:138` ✓ | `:145` |
| Animation `color` | `:1268` ✓ | `:1211` |
| Attachment colours | always read when present | only when nonessential (`:513`, `:600`, `:617`, `:630`) |

⇒ **Two things are JSON-inexpressible in 4.3 spine-ts: `bone.visible` and `skin.color`.** Both are
editor-affordance data with zero rendering effect, so this costs the ladder nothing — but it is the
honest answer to Part 4(d): there is no *rendering-relevant* feature that binary can express and JSON
cannot.

---

## Part 2 — what rigc emits today

rigc v0.1.0, pinned to `@esotericsoftware/spine-core@4.3.13`. Line references in this Part are into
this repository (`src/`, `cli.ts`, `selftest.ts`) and were taken at commit `795e6f9`.

Legend: ✅ emits · 🟡 partial · ❌ not emitted · 🚫 deliberately excluded by a named assertion.

### 2.1 Coverage against Part 1

> 🔄 **Re-synced 2026-08-23** against `src/compile.ts`/`src/rig.ts` on `main`. Only the rows below
> were touched; the rest of this table was not re-verified in this pass.

**Header** (`compile.ts:634-646`)

| Part-1 row | rigc | Note |
| --- | --- | --- |
| `spine` | ✅ | constant `SPINE_VERSION = '4.3.13'` (`compile.ts:41`); A16 re-checks it is `4.3.x` |
| `x`, `y` | ✅ | always literal `0, 0` |
| `width`, `height` | ✅ | from `manifest.crop.w/h` |
| `hash` | ❌ | never emitted (harmless; the parser stores it and nothing reads it) |
| `fps`, `images`, `referenceScale` | ✅ | copied from `rig.skeleton` when the rig spec gives them, omitted when it does not (`compile.ts:810-812`, landed in `c5eda3b`) |
| `audio` | ❌ | |

**Bones** (`compile.ts:367-456`; type at `types.ts:285-292`)

| Part-1 row | rigc |
| --- | --- |
| `name`, `parent`, `x`, `y` | ✅ |
| `rotation` | ✅ — emitted only when non-zero; comes from `manifest.axis.deg` or a per-anchor facing angle, screen→Spine converted (`transform.ts`) |
| `length`, `scaleX`, `scaleY`, `shearX`, `shearY`, `inherit`, `skin`, `color` | ✅ — copied from the rig spec when it gives them, omitted when it does not |
| `icon` | ✅ — copied verbatim, unchecked; it is the editor's vocabulary, not rigc's (issue #47) |
| `iconSize`, `iconRotation` | ❌ |
| bone `visible` | ❌ (JSON-inexpressible anyway, §1.10) |

**Slots** (`compile.ts:466-524`; type at `types.ts:294-299`)

| Part-1 row | rigc |
| --- | --- |
| `name`, `bone` | ✅ |
| `attachment` | ✅ — only when the motion spec's `setup` block names one; `null` means "show nothing" and the key is omitted |
| `color` | ✅ — from `setup.color`, hex-encoded (`compile.ts:63-66`) |
| `dark` | 🚫 **A12_NO_DARK_COLOR** (`validate.ts:250-262`) |
| `blend` | ✅ — copied from the rig spec's slot when it gives one (`compile.ts:600`, landed in `c5eda3b`) |
| `visible` | ❌ |
| draw order = slots array order | ✅, and **A26_SLOT_DRAW_ORDER** pins it to the archetype's `slotOrder` table |

**Skins** — ✅ named skins, each `{ name, bones?, ik?, transform?, path?, physics?, slider?, attachments }`
in the parser's own reading order; `default` is always emitted even when empty. ✅ per-skin `bones` and
per-type constraint lists (issue #7), which a rig spec writes in a skin entry's long form and rigc pairs
with the member's own `skin: true` — either half alone is refused, because `Skeleton.updateCache` starts a
`skinRequired` object inactive and activates only what the applied skin names (**A38_SKIN_MEMBERS_ARE_SKIN_REQUIRED**).
❌ `color` (JSON-inexpressible).

**Attachments**

| Part-1 type | rigc | Detail |
| --- | --- | --- |
| `region` | 🟡 | emits `width`, `height` (always, from PNG measurement — the fix for case 6c), `x`, `y` (only when non-zero), `rotation` (only when non-zero, cancelling the bone's world rotation), `scaleX`/`scaleY` (`compile.ts:1238-1239`), `color`, and `path` — taken from the rig spec, else derived from the image basename and omitted when that basename *is* the attachment name (the region name == attachment name == PNG basename convention **A08** + **A27** enforce). ❌ `sequence` |
| `mesh` | 🟡 | emits `type`, `uvs`, `triangles`, `vertices` (**weighted encoding only**), `hull`, `width`, `height`, `edges` (`compile.ts:1343`, and part 4's rung-6 entry measures it byte-identical to the reference), `path`, `color`. ❌ `sequence`. Unweighted meshes are 🚫 **A20_MESH_WEIGHTS_COHERENT** (`validate.ts:430-433`) |
| `linkedmesh` | ❌ | deliberately deferred — never appears in the corpus (part 3-1) |
| `boundingbox` | ✅ | `vertexCount` (required and cross-checked), `vertices` **or** by-name `weights`, `color`. **A33_VERTEX_ATTACHMENT_GEOMETRY** |
| `path` | ✅ | `vertexCount` (required, and checked as a multiple of 3 — the parser's own `vertexCount / 3` takes a fractional size in silence), `vertices` **or** by-name `weights`, `closed`, `constantSpeed`, `color`, and a **measured** `lengths`: the cumulative setup arc length of each curve, taken through each influence's own bone, refused if authored. **A33_VERTEX_ATTACHMENT_GEOMETRY** re-checks the structure and the array's monotonicity. ❌ a `deform` timeline on one |
| `point` | ❌ | deliberately deferred — never appears in the corpus (part 3-1) |
| `clipping` | ✅ under `--profile spine` · 🚫 under `spine-html` | `end` (refused when it names no slot), `convex`, `inverse`, `vertexCount`, geometry, `color`. **A33**, and **A11_NO_CLIPPING_ATTACHMENTS** is the renderer-profile refusal |
| `sequence` block | ❌ | |

Mesh geometry is generated by exactly three procedural generators (`mesh.ts`): `buildRingMesh`
(three concentric rings + hub, outer two pinned), `buildRibbonMesh` (a two-wide strip along a bone
chain) and `buildContourMesh` (marching-squares trace of the part's own alpha → Douglas-Peucker →
mitred outset → ear clipping, every vertex pinned to the slot bone). The triangulator takes a
**simple** polygon only: holes are enclosed rather than cut out, and a self-intersecting or
diagonally pinched silhouette is refused by name (AUTHORING §3.4). There is still no importer for
editor-made meshes — those arrive as authored `uvs`/`triangles`/`weights`.

**Constraints** (`compile.ts:526-568`)

| Part-1 type | rigc |
| --- | --- |
| `physics` | ✅ — full field set: `bone`, the five components `x`/`y`/`rotate`/`scaleX`/`shearX`, `scaleY` (ScaleYMode), `inertia`/`strength`/`damping`/`mass`/`wind`/`gravity`/`mix`/`fps`/`limit`, the seven `*Global` flags and `skin` (`compile.ts:1522-1548`). A field the rig spec does not give is **omitted**, never guessed (`compile.ts:1463-1468`), so the parser's own default stands. The motion spec's `physics` tuning table is the second path into this same array and is narrower: no `scaleY`, no `*Global`, no `skin`, and it drops a value that equals the parser default even when the table gives it (`compile.ts:758-761`) |
| `ik` | ✅ — `bones`, `target`, `scaleY`/`mix`/`softness`/`bendPositive`/`compress`/`stretch`/`skin` (`compile.ts:1425-1430`, landed in `c5eda3b`) |
| `transform` | ✅ — `bones`, `source`, the 4.3 `properties{from→to}` model, and the full field set (`compile.ts:1431-1462`, landed in `c5eda3b`) |
| `path` | ✅ — `bones`, `slot`, `positionMode`/`spacingMode`/`rotateMode` (checked against the enum names `Utils.enumValue` can resolve, where only the first letter's case is free), `rotation`, `position`, `spacing`, `mixRotate`/`mixX`/`mixY`, `skin`. The slot must carry a path attachment in some skin: `PathConstraint.update` returns on its first line otherwise, so the constraint loads and moves nothing (**A36_PATH_CONSTRAINT_EFFECTIVE**) |
| `slider` | ✅ — `animation` (an animation the MOTION spec declares; the parser resolves it in a second pass and throws on a miss), `mix`, `additive`, `loop`, and one of the two models `bone` switches between: `bone` + `property`/`from`/`to`/`scale`/`max`/`local`, or the bone-less `time`. The losing model's fields are refused rather than emitted, because the parser reads each set only inside its own branch (**A37_SLIDER_CONSTRAINT_EFFECTIVE** covers the rest) |
| flat `constraints[]` shape | ✅ — and **A01_NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS** actively rejects the 4.1/4.2 shape (`validate.ts:225-235`), which is the machine form of case 6a |

**Timelines** (`compile.ts:570-631`, `:877-936`, `:981-1041`)

| Part-1 group | rigc |
| --- | --- |
| `bones.rotate` / `translate` / `scale` | ✅ (`BONE_TRACKS`, `compile.ts:75-79`) |
| `bones.translatex/y`, `scalex/y`, `shear`, `shearx/y`, `inherit` | ❌ emitted (🟡 the **validator** knows their channel counts, `validate.ts:83-95`, so a hand-written file with them would pass A05) |
| `slots.attachment` | ✅ — value `name`, nullable; easing is refused |
| `slots.rgba` | ✅ |
| `slots.rgb`, `alpha` | ❌ emitted (validator knows the channel counts) |
| `slots.rgba2`, `rgb2` | 🚫 **A12_NO_DARK_COLOR** (`validate.ts:257-261`) |
| `physics.mix`, `physics.reset` | ✅ (`PHYSICS_TRACKS`, `compile.ts:87-90`) |
| `physics.inertia/strength/damping/mass/wind/gravity` | ❌ |
| `ik`, `transform` | ✅ — one unnamed timeline per constraint, keyed by the motion spec's `ik` / `transform` arrays |
| `path.position/spacing/mix`, `slider.time/mix` | ✅ (`PATH_TRACKS` / `SLIDER_TRACKS`) — authored as `tracks` entries naming `path` or `slider`, the same shape as `physics`, since both groups put named timelines under a constraint name. `path.mix` is one timeline of three channels |
| `attachments.<skin>.…deform` | ❌ (validator knows it: 1 channel, `validate.ts:104-107`) |
| `attachments.…sequence` | ❌ |
| `drawOrder` | ✅ — the motion spec's per-animation `drawOrder` array of `{ t, offsets: [{ slot, offset }] }` (`compile.ts:823`, `:850`, `compileDrawOrder` `:1918-1970`). A key with no `offsets`, and a key with an empty one, both emit the parser's reset-to-setup encoding, so two spellings cannot make two files. An unknown slot, a slot offset twice in one key, a non-whole offset and a landing outside the emitted slots are each refused by name, and **A31_DRAW_ORDER_OFFSETS_RESOLVE** re-checks the emitted file |
| `drawOrderFolder` | ❌ — editor bookkeeping, 4.3-only |
| `events` (+ the `root.events` block) | ✅ — the rig spec declares the names (`rig.ts` `RigEvent`), the motion spec's per-animation `events` array fires them, and **A32_EVENT_KEYS_RESOLVE** checks the three ways the timeline goes wrong quietly. `int`/`float`/`string` overrides and `audio`/`volume`/`balance` all round-trip |
| animation `color` | ❌ |

**Curves** — ✅ all three encodings. Linear = no `curve` key; `"stepped"` passes through as the string
(`compile.ts:917-918`); bezier is computed from **named easings** (`motion.easings`, four normalised
handles) into **absolute (time, value) control points**, `bezierForChannel` (`compile.ts:121-135`),
emitted 4 numbers × channel count in field order. This is the correct transform — writing the
normalised handles straight in is the silent bug that costs an authoring loop.

**Atlas** (`compile.ts:346-365`) — one part per page, no packer.

| Part-1 field | rigc |
| --- | --- |
| page name | ✅ (PNG path relative to the atlas file) |
| `size: w, h` | ✅ from PNG measurement (`png.ts`), re-checked against the file by **A06** |
| `filter: Linear, Linear` | ✅ hard-coded |
| `pma: false` | ✅ hard-coded; a `true` is 🚫 **A06** |
| `format:`, `repeat:` | ❌ (both optional; `format` is discarded by the reader anyway) |
| region `bounds: 0,0,w,h` + `offsets: 0,0,w,h` | ✅ — the 4.x compact form |
| region `rotate: 0` | ✅ always zero; anything else is 🚫 **A06** ("there is no packer, so nothing can be") |
| region `index:`, `split:`, `pad:` | ❌ |
| multi-region pages | ❌ by construction; **A06** requires each region's UVs to be exactly (0,0)-(1,1) |

**Binary `.skel`** — ❌ not emitted, and out of scope: rigc's whole validation strategy is a JSON
round-trip through spine-core.

### 2.2 The assertions, classified

This is the split Part 4(c) needs. **Spine-validity** = the file is wrong for any consumer.
**Renderer-profile** = the file is valid Spine but violates a spine-html / canvas-budget policy.
**Archetype** = a structural rule about *our* rigs that no Spine consumer would care about.

| Assertion | Kind | What it forbids |
| --- | --- | --- |
| `A00_ROUNDTRIP_PARSE` | validity | JSON or atlas that spine-core refuses (cases 6d, 6e) |
| `A01_NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS` | validity | `ik`/`transform`/`path`/`physics` at top level (case 6a) |
| `A02_NO_BONE_TRANSFORM_KEY` | validity | bone `transform` instead of `inherit` (case 6b) |
| `A03_REGION_WIDTH_HEIGHT_FINITE` | validity | `NaN`/non-positive region size (case 6c) |
| `A04_MESH_TRIANGLES_AND_ENCODING` | validity | missing/misaligned `triangles`, out-of-range indices, incoherent vertex run (case 6f) |
| `A05_CURVE_ARRAY_LENGTH` | validity | short/non-finite bezier arrays, curves on curve-less timelines (case 6g) |
| `A07_ATLAS_TEXT_SHAPE` | validity | blank line inside a page block, indented region name (the two `TextureAtlas` traps) |
| `A08_REGION_NAMES_MATCH_ATTACHMENTS` | validity + policy | attachment→region miss is validity; **"v0 requires them identical"** is policy |
| `A09_ANIMATION_DURATION_MATCHES_SPEC` | spec-fidelity | compiled last-key time ≠ declared duration |
| `A10_NO_NAN_AFTER_STEPPING` | validity | NaN world transforms / colours after stepping every animation (120 frames) |
| `A16_SKELETON_VERSION_4_3` | validity (portability) | a `spine` string outside `4.3.x` |
| `A17_ATLAS_PAGE_FILES_EXIST` | validity | a page PNG not on disk |
| `A18_DETERMINISTIC_EMIT` | tool contract | recompiling differs byte-for-byte |
| `A06_ATLAS_PAGE_SIZE_MATCHES_PNG` | **mixed** | size≠PNG is **validity** (case 6h); `pma:true`, region rotation, and "region covers the whole page" are **renderer-profile** |
| `A11_NO_CLIPPING_ATTACHMENTS` | **renderer-profile** | clipping attachments — "the renderer skips them silently" |
| `A12_NO_DARK_COLOR` | **renderer-profile** | slot `dark`, `rgba2`/`rgb2` timelines — "parsed, then ignored" |
| `A13_MESH_BUDGET` | **renderer-profile** | >4 mesh slots, >80 triangles per mesh |
| `A14_NO_FULL_FRAME_MESH` | **renderer-profile** | a mesh spanning the whole stage |
| `A19_OVERLAY_PNGS_HAVE_ALPHA` | **renderer-profile** | an overlay page that can never be transparent — no alpha channel and no `tRNS` chunk |
| `A20_MESH_WEIGHTS_COHERENT` | **renderer-profile / archetype** | **unweighted meshes**, weights not summing to 1, out-of-range bone indices |
| `A21_MESH_RIM_PINNED` | archetype | ring/ribbon/contour rim not pinned |
| `A22_MESH_UVS_IN_UNIT_RANGE` | validity-ish | UVs outside 0..1 |
| `A15_IDLE_NO_MESH_BONE_KEYS` | archetype | `idle` keying a mesh-driving bone |
| `A23_PHYSICS_CONSTRAINT_EFFECTIVE` | validity-ish | a physics constraint that parses and does nothing |
| `A24_AXIS_SPACE_STROKE` | archetype | screen-space stroke keys |
| `A25_DETACHED_BONE_PARENTAGE` | archetype | a bone the rig declares detached, parented under the bone it must stay clear of |
| `A26_SLOT_DRAW_ORDER` | archetype | draw order ≠ the archetype's slot table |
| `A32_EVENT_KEYS_RESOLVE` | validity | an event key firing an undeclared name (parser throws), key times going backwards (silent — frames are filled in array order), `volume`/`balance` on an event with no `audio` (silent) |
| `A33_VERTEX_ATTACHMENT_GEOMETRY` | validity | a bounding box or clipping polygon with a missing or disagreeing `vertexCount` (`undefined << 1` = 0, so the coordinates are decoded as a weight run), a weighted run of the wrong length, an out-of-range bone index, or a clipping `end` naming no slot (`findSlot` returns null and the null is assigned) |
| `A27_REGION_NAME_MATCHES_PAGE_FILENAME` | policy | region name ≠ PNG basename |
| `A28_RIBBON_ROWS_SHARE_WEIGHTS` | archetype | ribbon rows with divergent weights |
| `A29_STROKE_WITHIN_CONTACT_DEPTH` | archetype | stroke past the measured contact depth |
| `A30_STROKE_WITHIN_CAP_CONTAINMENT` | archetype | stroke past the measured containment ceiling |

**Nine assertions are renderer-profile or profile-mixed** (A06 partly, A11, A12, A13, A14, A19, A20,
plus A08/A27's "identical names" policy). Every one of them would fire on real Spine example data.
They are correct for spine-html; they are wrong as *spec* gates, and they must become a
profile switch (`--profile spine-html` vs `--profile spine`) before rung 1.

**Twelve are archetype assertions** (A15, A21, A24–A26, A28–A30, plus the parts of A20/A21 that
encode ring/ribbon geometry). They are already gated on `input.rig` being present and **SKIP**
when validating a bare directory (`validate.ts:47-55`, `:808`), which is the right shape — nothing
needs to change there, they simply will not run on example data.

### 2.3 What the round-trip checks — and what it lets through

**Checked**: the artifact is parsed by the real `TextureAtlas` and `SkeletonJson` (A00), then every
animation is stepped 120 frames through a real `Skeleton` + `AnimationState` looking for non-finite
world transforms and colours (A10, `validate.ts:703-733`), then the compiler is re-run and the two
emits compared byte-for-byte (A18).

**Let through silently** — the honest list:

1. **Whole timeline groups the walker never visits.** `walkTimelines` (`validate.ts:1159-1199`)
   descends only `animations.<a>.bones`, `.slots`, `.physics`, and `.attachments`. An `ik`,
   `transform`, `path`, `slider`, `drawOrder`, `drawOrderFolder`, or `events` block is **not visited
   at all**, so A05 never sees its curves. Adding those emitters without extending the walker
   silently disables the format's most dangerous check.
2. **Unknown top-level and per-map keys.** Nothing enumerates what the parser reads, so a typo'd
   key (`"inherits"`, `"tringles"`) is invisible to both parser and validator.
3. **Semantics the parser cannot see.** A wrong-but-parseable `inherit` value, a `blend` mode, a
   slot `visible: false`, a linked mesh pointing at the wrong source — none are checked.
4. **`skin` / `skinRequired` interactions** — rigc emits one skin, so nothing is exercised.
5. **A05's own escape hatch is a fail, not a pass** (`validate.ts:275-278`): an unrecognised timeline
   name inside a *visited* group fails with `unchecked <kind> timeline "<name>" — extend the
   validator`. That is good design, and it means new bone/slot/physics timelines cannot be added
   without touching the channel tables. It does **not** apply to the groups in item 1.

`selftest.ts` runs 35 named mutants (M01–M35) across three fixtures, each mutant asserting that a
specific assertion fires. The mutant set mirrors the assertion set, so the same blind spots apply:
there is no mutant for an IK or draw-order timeline because there is no emitter and no walker for
one.

> 🔼 Both halves of that paragraph are now stale. The walker reaches all eleven groups and the
> mutants that prove it exist; the suite runs on fixtures it **generates**, so it needs no
> project's art. Current shape: [CLAUDE.md](https://github.com/firejune/rigc/blob/main/CLAUDE.md), *The selftest and its fixtures*.

### 2.4 The input model — where the rig actually comes from

Two data files in, per `types.ts:1-13`:

- **cut manifest** (`FaceManifest`) — owns *geometry*: `crop`, per-part `offset`/`size`,
  `polygon`, `state_machine`, `anchors` (bone positions in crop pixels), `axis`, `stroke`.
- **motion spec** (`MotionSpec`, `spec: 'rigc-motion/1'`) — owns *time*: `easings`, `groups`,
  `setup` (per-slot setup pose), `physics` constraint table, `animations{ tracks[] }`, `mix`.

**The bone tree is code, not data.** `src/archetype.ts` hard-codes three archetypes:

| Archetype | Bone tree | Mesh budget | Slots |
| --- | --- | --- | --- |
| overlay, tier 1 (`:65-71`) | a two-bone root chain, then **one bone per slot**, auto-named after the slot and pinned at the part-window centre | 0 | derived from the manifest's parts |
| overlay, tier 2 (`:84-88`) | identical | 3 | identical |
| articulated (`:109-161`) | **18 explicitly named bones**: a camera handle, a base, a mass with two soft-body controls, an axis bone carrying four subtrees (a travelling part and its tip, a rim with four grips, a detached emitter with a three-link chain) | 3 | a fixed `slotBone` map of **9 slots** with a fixed `slotOrder` |

The manifest supplies *positions* for those bones (`anchors`), never their *names*, *parentage*, or
*count*. Consequences, stated plainly:

- A slot not in the archetype's `slotBone` table is a **hard compile error**
  (`compile.ts:412-417`: *"extend its slot table rather than inventing one"*).
- A control bone not in the archetype tree is a hard error (`compile.ts:420-426`).
- Therefore **no example project can be compiled by rigc today at any rung** — not because a feature
  is missing, but because there is no way to *state* a skeleton whose bone tree is not one of these
  three. This is the single largest item in Part 4(b) and it gates everything else.


---

## Part 3 — what the example ladder actually uses

Corpus: the nine official example projects on branch `4.3`, fetched by
[`scripts/fetch-examples.sh`](https://github.com/firejune/rigc/blob/main/scripts/fetch-examples.sh) into the gitignored `examples/<name>/`
(**12 skeleton JSON files** — some examples ship more than one — **10 `.atlas` files**, 8 `license.txt`).
Counted by [`bench/count_features.ts`](https://github.com/firejune/rigc/blob/main/bench/count_features.ts); full output in
[`feature_matrix.json`](https://github.com/firejune/rigc/blob/main/docs/feature_matrix.json) and [`feature_matrix.csv`](https://github.com/firejune/rigc/blob/main/docs/feature_matrix.csv)
(12 rows × 135 columns), both regenerated by `bun run bench:usage`.

> ⚠️ **Verification note.** The timeline columns below were re-derived independently from the raw JSON
> and reconciled against the CSV before publication. Where a prose summary and the machine output
> disagreed, the machine output won. Everything in these tables is from the CSV.

### 3.0 Corpus-wide facts

- **Every one of the 12 files reports `"spine": "4.3.75-beta"`.** No legacy exports in the corpus.
- **Every file with constraints uses the flat 4.3 `constraints[]` shape**; all four transform-constraint
  users use the 4.3 `source` + `properties` model. **The legacy 4.0–4.2 array shape never appears**, so
  this corpus does *not* exercise case 6a — do not treat "the ladder is green" as evidence
  that a legacy-shape importer works.
- **Every atlas uses the 4.x compact `bounds:` / `offsets:` region form.** The deprecated
  `xy:`/`size:`/`orig:`/`offset:` region form never appears.
- **Zero unknown keys anywhere** — every top-level, bone, slot, and attachment key in all 12 files is
  one the 4.3 parser reads. The corpus is a clean specimen of exactly the surface Part 1 enumerates.
- **No file uses:** named skins (every file has one skin, `default`), linked meshes, path constraints,
  slider constraints, sequences, slot `dark` colour, `drawOrderFolder`, bone `visible`, or path/point
  attachments.
- **Nine of ten atlases carry a page `scale:` line** that spine-ts ignores (§1.10).

### 3.1 Structure and attachments

| File | bones | slots | skins | region | mesh | bbox | clip | mesh W/U | mesh verts | mesh tris | max verts in one |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `1-weight-and-mass-balls-ess` | 9 | 8 | 1 | 8 | 0 | 0 | 0 | – | – | – | – |
| `1-weight-and-mass-drop-ess` | 4 | 5 | 1 | 5 | 0 | 0 | 0 | – | – | – | – |
| `2-the-12-principles-ess` | 12 | 17 | 1 | 17 | 0 | 0 | 0 | – | – | – | – |
| `3-timing-and-spacing-ess` | 3 | 2 | 1 | 2 | 0 | 0 | 0 | – | – | – | – |
| `4-wave-principle-ess` | 9 | 9 | 1 | 9 | 0 | 0 | 0 | – | – | – | – |
| `5-squash-and-stretch-ess` | 16 | 13 | 1 | 29 | 0 | 0 | 0 | – | – | – | – |
| `6-arcs-pro` | 14 | 4 | 1 | 2 | 2 | 0 | 0 | **2 / 0** | 44 | 40 | 40 |
| `7-anticipation / sack-pro` | 31 | 3 | 1 | 0 | 3 | 0 | 0 | **3 / 0** | 193 | 230 | 96 |
| `8-follow-through-pro-ball` | 12 | 2 | 1 | 0 | 2 | 0 | 0 | **2 / 0** | 34 | 30 | 30 |
| `8-follow-through-pro-pendulum` | 7 | 6 | 1 | 6 | 0 | 0 | 0 | – | – | – | – |
| `spineboy-ess` | 18 | 20 | 1 | 26 | 0 | **1** | 0 | – | – | – | – |
| `spineboy-pro` | **67** | **52** | 1 | 66 | **12** | **1** | **1** | **10 / 2** | 322 | 430 | 74 |

All meshes in the corpus carry both `edges` and `hull`.

### 3.2 Timelines actually keyed (verified twice)

| File | bone timelines | slot timelines | constraint / other |
| --- | --- | --- | --- |
| `1-w&m-balls-ess` | translate, translatex, translatey, scale, shear | **rgba** | — |
| `1-w&m-drop-ess` | *(none — a static skeleton)* | — | — |
| `2-the-12-principles-ess` | rotate, translate, translatex, translatey, scale, shear | attachment, **rgba** | — |
| `3-timing-and-spacing-ess` | rotate, translatex, translatey | — | — |
| `4-wave-principle-ess` | rotate, translatex, translatey, scale | attachment | — |
| `5-squash-and-stretch-ess` | rotate, translate, translatex, translatey, scale | attachment, **rgba** | **drawOrder** (2 keys) |
| `6-arcs-pro` | rotate, translate, translatex, translatey, scale | attachment | *(4 transform constraints, but **no** transform timeline — they are static)* |
| `7-anticipation / sack-pro` | rotate, translate, translatex, translatey, scale | — | **transform** (11 keys), **physics**: inertia, strength, damping, mass, wind, mix, **deform** (1 key) |
| `8-follow-through-pro-ball` | rotate, translate, translatex, translatey | — | *(4 transform constraints, no transform timeline)* |
| `8-follow-through-pro-pendulum` | rotate, translatex, translatey | — | — |
| `spineboy-ess` | rotate, translate, scale | attachment, **rgba** | **drawOrder** (1 key), **events** (5 keys) |
| `spineboy-pro` | rotate, translate, scale, shear | attachment, **rgba** | **ik** (29 keys), **transform** (6 keys), **deform** (9 keys), **events** (5 keys) |

Notable absences across the whole corpus: `inherit`, `scalex`/`scaley`, `shearx`/`sheary`,
`rgb`, `alpha`, `rgba2`, `rgb2`, `sequence`, `drawOrderFolder`, `path.*`, `slider.*`,
`physics.gravity`, `physics.reset`.

### 3.3 Constraints, curves, events, blend, inheritance

| File | ik | transform | path | physics | slider | curve linear / stepped / bezier | bezier array lengths | slot blend ≠ normal | bone inherit ≠ Normal | events defined |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | ---: |
| `1-w&m-balls-ess` | 0 | 0 | 0 | 0 | 0 | 206 / 1 / 44 | 4 | 0 | 0 | 0 |
| `1-w&m-drop-ess` | 0 | 0 | 0 | 0 | 0 | 0 / 0 / 0 | — | 0 | 0 | 0 |
| `2-the-12-principles-ess` | 0 | 0 | 0 | 0 | 0 | 150 / 127 / **1010** | 4, 8 | **8** (4 additive, 4 multiply) | 4 × `noRotationOrReflection` | 0 |
| `3-timing-and-spacing-ess` | 0 | 0 | 0 | 0 | 0 | 2 / 1 / 58 | 4 | 0 | 0 | 0 |
| `4-wave-principle-ess` | 0 | 0 | 0 | 0 | 0 | 36 / 8 / 470 | 4 | **2** (1 additive, 1 multiply) | 1 × `noRotationOrReflection` | 0 |
| `5-squash-and-stretch-ess` | 0 | 0 | 0 | 0 | 0 | 162 / 82 / **1665** | 4, 8 | 0 | **8 × `onlyTranslation`** | 0 |
| `6-arcs-pro` | 0 | **4** | 0 | 0 | 0 | 18 / 7 / 498 | 4, 8 | 0 | 0 | 0 |
| `7-anticipation / sack-pro` | 0 | **4** | 0 | **20** | 0 | 171 / 62 / 757 | 4, 8 | 0 | 3 × `noScale` | 0 |
| `8-follow-through-pro-ball` | 0 | **4** | 0 | 0 | 0 | 22 / 5 / 328 | 4, 8 | 0 | 0 | 0 |
| `8-follow-through-pro-pendulum` | 0 | 0 | 0 | 0 | 0 | 1 / 0 / 156 | 4 | 0 | 0 | 0 |
| `spineboy-ess` | 0 | 0 | 0 | 0 | 0 | 43 / 8 / 526 | 4, 8 | 1 additive | 0 | **1** (5 keys) |
| `spineboy-pro` | **7** (2 multi-bone) | **7** | 0 | 0 | 0 | 90 / 88 / **1136** | 4, 8, **16** | **25 additive** | 4 × `noRotationOrReflection` | **1** (5 keys) |

Bezier array length is `4 × channels` (§1.9). Observed lengths **4** (1-channel: rotate, translatex/y),
**8** (2-channel: translate, scale) and **16** (4-channel: rgba, spineboy-pro only). Never 12/24 —
so no example ever puts a bezier on a `transform`, `path mix`, or `rgb` timeline.

Nonessential data is present throughout: `hash` and `images` in all 12; bone `color` in 9 files
(up to 42 bones in spineboy-pro); bone `icon` in 8 files.

### 3.4 Atlases

| Atlas | pages | regions | region form | `scale:` | `pma:` | rotated regions | index / split / pad |
| --- | ---: | ---: | --- | --- | --- | --- | --- |
| `1-weight-and-mass.atlas` | 1 | 13 | compact | `0.5` | absent | **1** (`rotate: 90`, `ground-bg`) | — |
| `2-the-12-principles.atlas` | 1 | 15 | compact | `0.4` | absent | 0 | — |
| `3-timing-and-spacing.atlas` | 1 | 2 | compact | `0.5` | absent | 0 | — |
| `4-wave-principle.atlas` | 1 | 8 | compact | `0.5` | absent | 0 | — |
| `5-squash-and-stretch.atlas` | 1 | 29 | compact | `0.5` | absent | **1** (`rotate: 90`) | — |
| `6-arcs.atlas` | 1 | 4 | compact | `0.5` | absent | 0 | — |
| `7-anticipation.atlas` | 1 | 3 | compact | `0.5` | absent | **1** (`rotate: 270`, `cape-back`) | — |
| `8-follow-through.atlas` | 1 | 8 | compact | `0.5` | absent | 0 | — |
| `spineboy.atlas` | 1 | 50 | compact | `0.5` | absent | 0 | — |
| `spineboy-run.atlas` | 1 | 10 | compact | absent | **`true`** | 0 | **`index: 8`** on all 10 |

Two things worth flagging:

- **`rotate: 270` exists in the wild** (`7-anticipation`), so a reader that treats `rotate` as a
  boolean is wrong on real data — matching `TextureAtlas.ts:91-97`'s three-way branch.
- **`spineboy-run.atlas` is a degenerate file**: ten region entries, all named `spineboy-pro-run`,
  all with `index: 8` and identical `bounds`. Byte length matches upstream (869 B), so this is what
  the repository ships, not a fetch artefact. It is not referenced by either spineboy skeleton
  (both use `spineboy.atlas`) and it is the **only** `pma: true` page in the corpus. Treat it as an
  outlier, not as a ladder target.

### 3.5 Licences — **not uniform, and one example has none**

Eight of nine examples ship `license.txt`; **`7-anticipation` has none** (verified: 404 for both
`license.txt` and `LICENSE.txt`, and no licence file in that example's directory listing). The eight
present files fall into **five byte-distinct variants that differ only in the copyright line**:

| Variant | Examples | Copyright line |
| --- | --- | --- |
| A | `1-weight-and-mass`, `2-the-12-principles`, `4-wave-principle` | `Copyright (c) 2021-2025, Esoteric Software LLC` |
| B | `3-timing-and-spacing`, `5-squash-and-stretch` | `Copyright (c) 2021-2025, Esoteric Software` |
| C | `6-arcs` | `Copyright (c) 2022-2025, Esoteric Software` |
| D | `8-follow-through` | `Copyright (c) 2024-2025, Esoteric Software` |
| E | `spineboy` | `Copyright (c) 2013, Esoteric Software LLC` |

The body is identical in all five:

> The images in this project may be redistributed as long as they are accompanied by this license
> file. The images may not be used for commercial use of any kind.
>
> The project file is released into the public domain. It may be used as the basis for derivative work.

**What this means for the ladder**, stated as a chain and not as legal advice:

1. **Images** — redistributable *only* alongside the licence file, and **not for commercial use**.
   A benchmark that ships the example PNGs is fine as a non-commercial research artefact; shipping
   them inside a commercial product is not.
2. **Project files / exports** — public domain. So the `.json`/`.atlas` we are trying to *reproduce*
   carry no restriction, and a rigc-generated look-alike inherits nothing.
3. **`7-anticipation` has no grant on file at all.** Its images and `sack-pro.json` are governed only
   by the repository-level Spine Runtimes License. It is the one rung where "we redistributed the
   images" is not covered by an explicit permission — **use it for measurement, do not vendor its
   images**. Since it is also the physics rung, this is worth deciding before rung 7.
4. Independent of any of this, rigc links spine-core, so its own `NOTICE.md` chain (each user needs a
   Spine Editor licence) applies regardless of which example is being reproduced.


---

## Part 4 — the gap list, ordered by the ladder

Crossing Part 2 with Part 3. Categories, as requested:
**(a) emitter** — new attachment / constraint / timeline / atlas kinds ·
**(b) input model** — what the spec files must be able to *say* ·
**(c) validator** — assertions that must become a profile switch or be widened ·
**(d) JSON-inexpressible** — things the format genuinely cannot hold.

**Nothing below was implemented when this was written. This is a survey.** Three of its items
have been built since — see the banner at the top of this document and [LADDER.md](https://github.com/firejune/rigc/blob/main/docs/LADDER.md) for
which; the requirement text itself is left exactly as surveyed.

### 4.0 Three blockers that precede rung 1

These are not per-rung; they gate the whole ladder and should be settled before rung 1 is attempted.

| # | Blocker | Category | Detail |
| --- | --- | --- | --- |
| **B1** | **The bone tree is code** | (b) | `archetype.ts` hard-codes all three archetypes. A slot outside the archetype's `slotBone` table is a compile error (`compile.ts:412-417`); a control bone outside its tree likewise (`:420-426`). **No example fits any of the three.** rigc needs a "skeleton-as-data" input — bones with explicit names/parents/transforms — before any rung is reachable. |
| **B2** | **A16 rejects every example** | (c) | `A16_SKELETON_VERSION_4_3` tests `/^4\.3(\.\d+)?$/` (`validate.ts:216`). All twelve example files declare `"4.3.75-beta"`, which **fails**. One-line fix, but it fails on rung 1 file 1. |
| **B3** | **The atlas model is one-part-per-page** | (a)+(c) | rigc emits `bounds: 0,0,w,h` per page and **A06** demands every region's UVs be exactly (0,0)-(1,1). Every example ships a **packed** atlas (13, 15, 29, 50 regions on one page). rigc has no packer *and* no importer for a pre-packed atlas. Reproducing a rung means either accepting a hand-supplied atlas or writing a packer. |

### 4.1 Cumulative per-rung requirements

Each row lists only what is **new at that rung**. Read cumulatively: to stand on rung N you need
rows 1..N plus §4.0.

#### Rung 1 — `1-weight-and-mass` (2 skeletons: `balls-ess`, `drop-ess`)

| Cat | Requirement |
| --- | --- |
| (a) | Bone timelines **`translatex`**, **`translatey`**, **`shear`** — rigc emits only `translate`/`scale`/`rotate` |
| (a) | Bone setup **`length`** (3 bones in `drop-ess`) — cosmetic in a renderer, but part of a faithful reproduction |
| (a) | Region attachment **`rotation`** on 3 attachments *(rigc emits `rotation` already, as a bone-cancel term — it would need to become an authorable value)* |
| (a) | Atlas: **multi-region packed page**, per-region `bounds`/`offsets`, **`rotate: 90`**, page `scale:` line |
| (b) | Bone tree as data (B1); a skeleton with **zero animations** (`drop-ess`) — today `A09` compares every declared duration and `compile.ts:622` refuses a mismatch, and the motion-spec schema has no "static rig" mode |
| (c) | **A06** — "region covers the whole page" and "no rotated region" must move behind the profile switch |
| (c) | **A16** (B2), **A26** (`slotOrder` is an archetype table; example slot order comes from the file), **A08/A27** (region-name == PNG-basename is meaningless for a packed atlas) |
| (d) | none |

#### Rung 2 — `2-the-12-principles`

| Cat | Requirement |
| --- | --- |
| (a) | **Slot `blend`** — first appearance: 4 additive + 4 multiply slots |
| (a) | **Bone `inherit`** — first appearance: 4 × `noRotationOrReflection` |
| (b) | The manifest must be able to declare per-slot blend and per-bone inherit |
| (c) | A05 already knows the channel counts for every bone timeline; no change needed for this rung's curves (4- and 8-length beziers) |
| (d) | none |

#### Rung 3 — `3-timing-and-spacing`

Nothing new. **This is the smallest skeleton in the corpus (3 bones, 2 slots, 2 animations) and is
the natural *first* rung** despite its number — it needs only B1–B3 plus `translatex`/`translatey`.

#### Rung 4 — `4-wave-principle`

Nothing structurally new (attachment timeline, blend, inherit all arrived by rung 2). It is a
**volume** test: 9 bones, 9 slots, 3 animations, 470 bezier keys.

#### Rung 5 — `5-squash-and-stretch`

| Cat | Requirement |
| --- | --- |
| (a) | **`drawOrder` timeline** — 🔴 first appearance (2 keys). rigc emits none, and the *validator does not walk the group at all* (`validate.ts:1166-1170`) |
| (a) | **Bone `inherit: onlyTranslation`** (8 bones); non-unit setup `scaleX`/`scaleY` (3 bones) |
| (b) | A draw-order track type in the motion spec (a list of slot offsets over time) |
| (c) | Extend `walkTimelines` to visit `drawOrder`, and give A05 a "no curve here" entry for it |
| (d) | none |

#### Rung 6 — `6-arcs`

> ✅ **Measured, 2026-08-23.** The rows below were written as predictions; the
> transcription in [`bench/transcriptions/6-arcs/`](https://github.com/firejune/rigc/tree/main/bench/transcriptions/6-arcs/)
> settled them. It compiles green under `--profile spine` and `bench 6` reports
> **1.000 on all 44 measures in all six sections**, so the rig spec expresses this
> skeleton — weighted meshes, `edges` and the 4.3 transform constraints alike. A
> field-by-field comparison against the reference export leaves 49 differences and
> every one is benign: 39 are defaults rigc writes explicitly where the editor
> omits them, 3 are editor bookkeeping (`hash`, `images`, `audio`), 1 is the runtime
> version string, and **6 are bone `icon`** — an editor decoration the rig spec had
> no field for and the only thing here it could not say. `RigBone.icon` carries it
> since issue #47; the transcription itself has not been re-cut. What did not
> survive contact is noted per row.

| Cat | Requirement |
| --- | --- |
| (a) | **Transform constraints** — 🔴 first appearance (4). Full 4.3 `source` + `properties{from→to}` model (§1.4), which is the least-documented constraint in the format. ✅ Expressible and round-trips exactly; `RigTransformConstraint` already carried the 4.3 shape |
| (a) | **Weighted meshes from authored geometry** — 🔴 first appearance. ~~rigc can emit weighted meshes, but only from `buildRingMesh`/`buildRibbonMesh`. An arbitrary 40-vertex/38-triangle mesh cannot be expressed~~ ⚠️ **This was wrong.** `RigMeshAttachment` takes authored `uvs`/`triangles`/`vertices`/`hull`, and `buildRigMesh` copies them verbatim. Both of 6-arcs' meshes round-trip to 1e-5 |
| (a) | Mesh **`edges`** key ~~(rigc emits `hull` but not `edges`)~~ ✅ emitted from `RigMeshAttachment.edges` and byte-identical to the reference. 🚨 But **nothing measures it** — deleting `edges` from the rig still scores 1.000 on all nine attachment measures, so this rung's own gating feature is invisible to `bench` (issue #46) |
| (b) | Mesh geometry as data — vertices, triangles, uvs, per-vertex bone weights — instead of a generator name plus a polygon. ✅ Present. ~~🚨 But the weights bind bones by **index into the emitted bone array**, not by name — inserting a bone rebinds every vertex with the gate still green (issue #45)~~ ✅ **Fixed.** Weights bind **by name** (`weights: [[{ bone, x, y, weight }, …], …]`) and the compiler resolves them at emit; an unknown name is a `CompileError` (selftest `R08`). Spine's index run survives behind an explicit `"boneIndexing": "raw"`, whose cost — silence — `MR07` still measures |
| (c) | **A20** (unweighted forbidden) is satisfied here. ~~Under `--profile spine-html` its extra clause fires 11 times instead — the editor writes zero-weight bindings and that profile forbids them~~ ✅ **Fixed with #44**: both of A20's policy clauses are statements about what a rigc *generator* produces, so neither applies to authored geometry. Its coherence clauses — present, in range, summing to 1 — still do, in every profile |
| (c) | **A21_MESH_RIM_PINNED** and **A28** encode ring/ribbon topology and will fire on an arbitrary mesh. ~~✅ **Confirmed**: A21 fires 40 times on the `tail` mesh under the default profile, because `meshKinds` has no entry for an authored mesh and the lookup falls back to `'ring'`~~ ✅ **Fixed** (issue #44): `meshKinds` has a third state, `authored`, and both assertions SKIP on one with that as the reason. The whole transcription is green under the default profile; selftest `MR08` holds it |
| (c) | A13's mesh budget (≤4 slots, ≤80 tris) is **satisfied** at this rung (2 slots, max 38 tris) |
| (d) | none |

#### Rung 7 — `7-anticipation` (`sack-pro`)

| Cat | Requirement |
| --- | --- |
| (a) | **Physics timelines** `inertia`, `strength`, `damping`, `mass`, `wind` — rigc emits only `mix` and `reset` |
| (a) | **`transform` constraint timeline** — 🔴 first appearance as a *keyed* timeline (11 keys); rung 6's transform constraints were static |
| (a) | **`deform` timeline** — 🔴 first appearance (1 key). Also needs the `animations.<a>.attachments.<skin>.<slot>.<att>` container, which rigc never writes |
| (a) | 20 physics constraints on a 31-bone tree; bone `inherit: noScale` |
| (b) | Per-vertex deform keys in the motion spec |
| (c) | 🚨 **A13_MESH_BUDGET fails**: the `sack` mesh has **116 triangles** against a budget of 80. Renderer-profile — must become a switch |
| (c) | A24/A29/A30 (axis-space stroke, contact depth, containment ceiling) are archetype assertions and will correctly **SKIP** — no change needed |
| (⚖️) | **Licence**: this is the one example with **no `license.txt`** (§3.5). Measure against it; do not vendor its images |
| (d) | none |

#### Rung 8 — `8-follow-through` (2 skeletons: `pro-ball`, `pro-pendulum`)

Nothing new — transform constraints (static, 4) and weighted meshes (2, max 28 tris) both arrived at
rung 6. `pro-pendulum` is region-only and is effectively a rung-3-class file.

#### Top rung — `spineboy` (2 skeletons: `ess`, `pro`)

| Cat | Requirement |
| --- | --- |
| (a) | **IK constraints** — 🔴 first appearance: 7, of which 2 are multi-bone (two-bone IK) |
| (a) | **IK timelines** — 29 keys, 2-channel curves (mix, softness) |
| (a) | **Events** — 🔴 first appearance: the skeleton-level `events` block *and* the `events` timeline (5 keys) |
| (a) | **Bounding-box attachments** — 🔴 first appearance (1, in both `ess` and `pro`) |
| (a) | **Clipping attachment** — 🔴 first appearance (1, `pro` only) |
| (a) | **Unweighted meshes** — 🔴 first appearance (2 of 12 in `pro`) |
| (a) | Multi-page atlas handling; 4-channel (`rgba`, length-16) bezier curves — rigc already emits these correctly |
| (a) | Scale: 67 bones, 52 slots, 11 animations, 80 attachments |
| (b) | Event definitions and event tracks in the motion spec; bounding-box and clipping attachment declarations |
| (c) | 🚫 **A11_NO_CLIPPING_ATTACHMENTS** fails — renderer-profile |
| (c) | 🚫 **A20_MESH_WEIGHTS_COHERENT** fails on the 2 unweighted meshes — renderer-profile |
| (c) | 🚨 **A13_MESH_BUDGET** fails twice over: 9 mesh slots (budget 4) and two meshes at 95 / 101 triangles (budget 80) |
| (c) | Extend `walkTimelines` to visit `ik`, `transform`, and `events` — otherwise A05 silently stops guarding this rung's curves |
| (d) | none |

### 4.2 First appearance of each named feature

| Feature | First rung | Where |
| --- | --- | --- |
| Packed / rotated atlas | **1** | `1-weight-and-mass` (`rotate: 90`) |
| Slot blend modes | **2** | `2-the-12-principles` (additive + multiply) |
| Bone `inherit` ≠ Normal | **2** | `2-the-12-principles` (`noRotationOrReflection`) |
| **drawOrder** | **5** | `5-squash-and-stretch` (2 keys) |
| **Transform constraints** | **6** | `6-arcs` (4, static) |
| **Weighted meshes** | **6** | `6-arcs` (2 meshes, 44 verts) |
| **Physics** | **7** | `7-anticipation` (20 constraints + 6 timeline kinds) |
| **Deform** | **7** | `7-anticipation` (1 key) |
| Keyed transform timeline | **7** | `7-anticipation` (11 keys) |
| **IK** | **spineboy** | `spineboy-pro` (7, incl. 2 multi-bone) |
| **Clipping** | **spineboy** | `spineboy-pro` (1) |
| Bounding box | **spineboy** | `spineboy-ess` and `-pro` (1 each) |
| Events | **spineboy** | both spineboy files (1 def, 5 keys) |
| Unweighted meshes | **spineboy** | `spineboy-pro` (2) |
| **Skins** | **never** | 🔵 **no example in the ladder uses a non-default skin.** Every one of the 12 files has exactly one skin, named `default`. Named skins, per-skin bones, and per-skin constraint lists are **not on this ladder at all** and were scheduled by some other justification: they landed with issues #2 and #7, off the ladder, and no rung's status depends on them. |
| Path constraints, sliders, sequences, linked meshes, dark colour, `drawOrderFolder` | **never** | absent from the entire corpus |

### 4.3 (c) The validator changes, consolidated

The single structural change: **split the assertion set into profiles.** Concretely —

1. **`--profile spine`** (spec-only): A00–A05, A07, A09, A10, A16 (widened to accept
   `4.3.75-beta`-style suffixes), A17, A18, A22, A23. These stay on for every rung.
2. **`--profile spine-html`** (today's behaviour = spec + renderer policy): adds A06's PMA/rotation/
   full-page clauses, A08/A27's name-identity policy, A11, A12, A13, A14, A19, A20.
3. **Archetype assertions** (A15, A21, A24–A26, A28–A30) already SKIP without `RigInfo`
   (`validate.ts:47-55`, `:808`) — no change; they simply never run on example data.
4. **Widen `walkTimelines`** (`validate.ts:1159-1199`) to `ik`, `transform`, `path`, `slider`,
   `drawOrder`, `drawOrderFolder`, `events`, with channel tables for each (§1.8 has the numbers).
   Do this **before** the corresponding emitters land, not after — an unwalked group is a check that
   silently reports green.
5. Keep A05's "unchecked timeline — extend the validator" fail-closed behaviour. It is the reason
   this document could enumerate the gap at all.

### 4.4 (d) What JSON cannot express

Only two things, both editor-affordance data with **zero rendering effect** (§1.11):

- **`bone.visible`** — read by `SkeletonBinary.ts:126`, not by `SkeletonJson`.
- **`skin.color`** — read by `SkeletonBinary.ts:448`, not by `SkeletonJson`.

Neither appears in the ladder corpus (§3.0) and neither affects a rendered frame. **There is no
rendering-relevant feature that the binary format can express and JSON cannot**, so "we only emit
JSON" costs the benchmark nothing.

One near-miss worth naming: the atlas page **`scale:`** line is emitted by the Spine packer and read
by *nobody* in spine-ts (§1.10). Reproducing it byte-for-byte is possible; reproducing its *effect*
is not, because there is no effect to reproduce in this runtime.

---

## Things I could not verify

1. **PNG-level facts.** `count_features.ts` reads only `.json` and `.atlas`, so
   `A19_OVERLAY_PNGS_HAVE_ALPHA` and `A06`'s "declared `size:` matches the file" were not evaluated
   against the corpus. `fetch-examples` does download the pages, and `src/png.ts` already measures
   PNG headers, so this is cheap to add.
2. **`A14_NO_FULL_FRAME_MESH`** — needs `skeleton.width/height` compared against each mesh's
   `width`/`height`; not computed per file.
3. **Binary `.skel` behaviour** was read from source only; I did not parse an actual `.skel`.
4. **`spineboy-run.atlas`'s ten identical regions** — the file matches upstream byte length, so it is
   genuinely what the repo ships, but *why* it is shaped that way (a broken sequence export?) is
   unexplained. It is unreferenced by both spineboy skeletons.
5. **Whether the Spine editor itself would round-trip a rigc file.** Esoteric documents JSON import
   (§"On third-party tools"), but nothing here tested it; the round-trip proof in this project is
   spine-core-only.
6. **Collection ran against a rate-limited GitHub REST API**, so some directory listings came from an
   HTML fallback rather than the contents API. File contents came from `raw.githubusercontent.com`
   and byte lengths were spot-checked against upstream `Content-Length`. `fetch-examples.sh` uses the
   contents API and honours `GITHUB_TOKEN`; export one if a re-run hits the 60/hour limit.
7. **Numbers here are a snapshot of branch `4.3`.** Re-run `bun run bench:usage` after a
   `fetch-examples` to confirm the corpus has not moved before relying on a count.
