# Spine 4.3 export-format surface

This page is the Spine 4.3 skeleton JSON and atlas text surface, read off the `spine-core`
this package pins (`@esotericsoftware/spine-core@4.3.13`): every field the parser reads, what it
defaults to, and the parser line each row cites. rigc's refusals point at its rows by part
number — `part 1-6` is §1.6. It is not a statement of what rigc emits; that is
[AUTHORING.md](AUTHORING.md).

**Sources.** S1 is [`spine-core/src/SkeletonJson.ts`](https://github.com/EsotericSoftware/spine-runtimes/blob/4.3/spine-ts/spine-core/src/SkeletonJson.ts),
S2 [`SkeletonBinary.ts`](https://github.com/EsotericSoftware/spine-runtimes/blob/4.3/spine-ts/spine-core/src/SkeletonBinary.ts)
and S3 [`TextureAtlas.ts`](https://github.com/EsotericSoftware/spine-runtimes/blob/4.3/spine-ts/spine-core/src/TextureAtlas.ts),
all on branch `4.3`; S6 is `SkeletonJson.ts` on branches `4.0`, `4.1` and `4.2`, for the
timeline below. Bare `:NNN` line numbers are into those TypeScript sources — ⚠️ the published npm
package ships **`dist/` only**, so the local copy to read is
`node_modules/@esotericsoftware/spine-core/dist/<File>.js`, whose line numbers differ; the
parser's full `case` label set is identical in both. 📘 = the field is described on an official
Esoteric docs page. 🔍 = source-only; the parser reads it but no public doc page describes it.

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

⇒ **A file exported by a pre-4.3 editor carries the *legacy* shape, and the 4.3 parser drops
those constraints on the floor with no error.**

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
| ~~`visible`~~ | — | **NOT read from JSON.** `SkeletonBinary.ts:126` reads it (nonessential); the JSON parser has no equivalent. See §1.11. | 🔍 |

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
weight data as coordinates. Editor exports carry both encodings.

🚨 The second risk in the same field is `boneIndex`: it is a position in the emitted bone array,
so the run means something different the moment the bone list changes, and nothing in the file
records what it used to mean. A rig spec therefore writes `weights` — the same data with the bones
**named** — and rigc encodes this run on emit. The raw form stays reachable behind
`"boneIndexing": "raw"` for transcribing an export verbatim.

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
is `NaN`, and nothing throws. Timelines with no curve at all (`attachment`,
`inherit`, `sequence`, `drawOrder`, `events`, `physics reset`) ignore a `curve` key entirely.

The X axis is **seconds** in 4.x. It was frames in 3.8 — one more reason the 3.8 doc is actively
dangerous as a spec.

### 1.10 Atlas text format (`TextureAtlas.ts`, S3)

Reader rules (`:194-227`): entries are `key: v1, v2, v3, v4` with **at most four values**
(`:224`); a line with no colon terminates the current block (`:214`). A **blank line closes a page
block** (`:119-121`). Page names are `line.trim()` (`:123`) but **region names are the raw line**
(`:131`) — leading whitespace becomes part of the name.

**Header entries before the first page are read and silently discarded** (`:106-111` — the comment
says so literally).

| Page field | Parsed into | Doc |
| --- | --- | --- |
| `size: w, h` | `page.width/height` (`:43-46`) — **used to compute every UV**, so a wrong value collapses all of them | 📘 |
| `format: …` | **parsed and thrown away** (`:47-49`, "we don't need format in WebGL") | 📘 |
| `filter: min, mag` | `minFilter`/`magFilter` (`:50-53`) | 📘 |
| `repeat: x\|y\|xy\|none` | `uWrap`/`vWrap` (`:54-57`) | 📘 |
| `pma: true\|false` | `page.pma` (`:58-60`) | 📘 |
| `scale: n` | 🚨 **emitted by the Spine texture packer, documented nowhere, and silently discarded by the reader.** There is no `pageFields.scale`, so `if (field) field(page)` at `:126-127` is a no-op. It records the export-time downscale factor; the runtime is expected to compensate via `SkeletonJson.scale` or `referenceScale`, not to read this line. | ❌ undocumented |

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
editor-affordance data with zero rendering effect: there is no *rendering-relevant* feature that
binary can express and JSON cannot.

