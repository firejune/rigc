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
- What the motion spec's own parser proves, and which refusals it deliberately
  leaves to compile time: [`src/motion.ts`](../src/motion.ts)
- What the format holds and rigc covers: `docs/SPEC_COVERAGE.md` — 🚫 **not an
  authoring input, and deliberately unlinked**: it inventories the benchmark corpus
  skeleton by skeleton, so it is on the ladder run's forbidden list. Named here for a
  maintainer, not offered to a run
- Working with a skeleton **somebody else authored** — what the CLI will and will not
  do with a foreign `skeleton.json`, transcribing one into specs, re-pivoting and
  renaming it: `docs/INGEST.md`. 🚫 **Not an authoring input, and deliberately
  unlinked** for the same reason as the line above: it cites `SPEC_COVERAGE.md` and
  the stored transcriptions, both of which are on the ladder run's forbidden list. Its
  reader was handed a compiled skeleton rather than art and a brief
- Deciding the **hierarchy** itself — how many bones, where each pivot goes, what
  hangs off what, what a chain can reach, and which of those the frames can check:
  `docs/RIGGING.md`. 🚫 **Not an authoring input, and deliberately unlinked** for
  the same reason as the two lines below: it is a mining of the recorded runs, so it
  cites their `LOOP.md` files, and following a citation out of an allowed surface is
  a leak by another route. Its rules are the ones **§8.1**, **§10.3** and
  **MOTION §3.9** already state, which are allowed reading; what that page adds is
  provenance and worked demonstrations, for a maintainer
- Reproducing a shot you were given as pictures: **§8**, and read it *before* you
  start measuring rather than after; **§8.1** if the figure has more joints than you
  can measure one at a time; then **§9** for the loop that closes it
- The conventions an editor user follows without being told — one image per
  attachment, keying practice, curve kind, draw order — sourced from Spine's own
  public documentation: **§10**

If you were given no brief and no reference frames, this section does not apply to
you — skip to **§0**. You are rigging somebody's own art rather than reproducing a
measured shot, so none of what follows applies: it is the ladder's protocol, not a
property of the tool.

🔒 **A ladder run reads this guide in full and does not follow its references out of
it.** The guide is allowed reading; not everything it cites is. Citations here are
provenance for a reader of record — the loop that hit a trap, the issue that closed it —
and following one can arrive at a stored candidate's own spec, at the corpus inventory,
or at the **derivation** of the gate a verdict is read against, none of which a run may
open. ⭐ The gate's **clause statements** are a different matter and a run may read them:
they are in
[GATE.md](https://github.com/firejune/rigc/blob/main/docs/GATE.md), which is
repository material and not in the published package — item 11 of the allowed list (owner ruling 2026-08-29) — the
measure, the comparator, the number and the SKIP semantics, with no recorded figure in it.
So: read the
document, take its numbered sections as the input, and leave its footprints to whoever
is maintaining it. The rule this states is that an **allowed-reading surface has to be
closed under reading**; the criterion behind it is under *The honesty rule* in
[LADDER.md](https://github.com/firejune/rigc/blob/main/docs/LADDER.md), and the enumerated allowed and forbidden lists are in
[bench/runs/README.md](https://github.com/firejune/rigc/blob/main/bench/runs/README.md),
which is also repository material and not in the published package,
*What a run may read* — the prompt that starts a run quotes them
outright, which is the copy that binds.

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

# …but if what you were HANDED is a picture of the pose rather than numbers, read
# the numbers out of it first. This one runs BEFORE the loop, not inside it:
bun cli.ts pose --images path/to/parts --frame path/to/poseA.png --out poseA.json
#   ↳ one entry per part PNG: where it sits, how confident that is, and where two
#     answers are equally good — §11
#
# …and once a candidate EXISTS, the half of that picture pose refuses — the parts
# another part is drawn over — is readable through the rig's own draw order and
# hierarchy. This one runs after a first build, not before it:
bun cli.ts chainfit --candidate path/to/spine --images path/to/parts \
                    --frame path/to/poseA.png --out chainfitA.json
#   ↳ one entry per drawn slot: where it sits, over how much of it that was
#     measured, and the `rotate` key value it implies — §12

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

# …and if nobody gave you frames, LOOK at it instead — neither needs a reference:
bun cli.ts render  --candidate path/to/spine    # PNG frames + a contact sheet grid
bun cli.ts preview --candidate path/to/spine    # one .html that plays it in Spine's own player

# …and where you have several green candidates and no instrument that separates
# them, ask a human — the one loop step this toolchain cannot run for you:
bun cli.ts vote --candidate path/to/spine-a --candidate path/to/spine-b   # -> ballot.html
bun cli.ts vote --record vote-<id>.json                                   # -> votes.jsonl
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
| `--out` | directory for `skeleton.json` + `skeleton.atlas`; atlas page paths and `skeleton.images` are written relative to it |
| `--copy-images` | `build` only: also copies every page **the emitted atlas names** into `--out` and rewrites the atlas to the copies, so the directory is self-contained enough to zip or commit on its own, and points `skeleton.images` at `--out` itself so the editor's import finds the parts beside the skeleton (issue #370; §3.1 says why it is spelled `../<out>/` and not `./`). Under `--atlas-in` those pages are the pack's, not one per part (issue #693 — **§0.2**). Default is unchanged — page paths still point at the source art (issue #217) |
| `--pack` | `build` only: arrange every part onto **shared** atlas page(s), written into `--out` as real PNGs, instead of one page per part. Lossless — nothing is resampled, trimmed or rotated. Default is unchanged (issue #4) — **§0.1** |
| `--page-size` | `build --pack` only: the largest page edge (default `2048`). A ceiling, not the size: page edges are powers of two and the one written is the smallest that holds the pack — **§0.1** |
| `--padding` | `build --pack` only: the gutter each region reserves on every side (default `2`), filled by extending the region's own edge pixels outwards. `0` is not a legal-but-tight choice, it is bleed — **§0.1** |
| `--atlas-in` | `build` and `explain`: resolve every part against the **regions of a pre-packed `.atlas`** instead of against loose PNGs. Region geometry is read from the file and sizes are descaled by the page's `scale:`; `build` re-emits the atlas into `--out`, re-anchored, and `explain` writes nothing and poses through it — **§0.2**. On `explain` it is the flag that makes a **size-only** spec readable at all (`ingest --art none`), because posing resolves every attachment against an atlas; without it that pair is refused by name rather than thrown through ([#697](https://github.com/firejune/rigc/issues/697), §5.1) |
| `--images` | where the rig spec's `image` names resolve (overrides the rig's own `images` field, and is relative to your working directory). For `pose` it is the directory of **loose part PNGs to place** — every `.png` in it is a part, in name order. For `chainfit` it is only where each attachment's image name **resolves**: the candidate decides what the parts are, so extra PNGs are unused and a missing name is refused by name (§12.3) |
| `--manifest` | a cut manifest. Only for a rig with **measured art** behind it; a foreign skeleton has none |
| `--cut` | `build`, `explain` and `validate`: look up a named cut in `--cuts <cuts.json>`, **instead of** `--rig`/`--motion`/`--out` — the two spellings are one build stated two ways and are refused together. A `cuts.json` is `{ "<name>": { "rig": …, "motion": …, "out": …, "manifest"?: … } }`, every path in it relative to the table's own file, so the table lives with the project that owns the art |
| `--cuts` | the `cuts.json` `--cut` names. Required beside it — `--cut` alone is refused, with no guess at where the table lives |
| `--profile` | `spine` = the 34 validity rules (**the default**) · `spine-html` = all 49, opt-in |
| `--candidate` | `check`, `bench`, `render`, `preview`, `chainfit` and `vote` only: a **compiled** artifact — the directory `build --out` wrote, or a `skeleton.json` path. `--atlas <path>` names the atlas when it does not sit beside the skeleton. **`vote` is the one command that takes it more than once** — repeat it 2–4 times, one per pane, labelled A, B, C, D in the order given; everywhere else a repeat is a typo and is refused |
| `--animation` | `render`, `preview` and `vote` only: which animation to show. The default is **every** one for `render`, the **first** for `preview`, and for `vote` the first of candidate A. A name the skeleton does not have is refused, with the ones it does have listed — and for `vote`, so is a name that only *some* candidates have |
| `--record` | `vote` only: a saved vote to check against its ballot and append to the ledger, instead of writing a ballot. This is the command's second mode; it takes no `--candidate` |
| `--ballot` | `vote --record` only: the ballot the vote answers (default `ballot.html`). Its embedded manifest is what the vote is checked against, so the ballot file is the record of the question |
| `--ledger` | `vote --record` only: the append-only JSONL the vote lands in (default `votes.jsonl`), one vote per line |
| `--again` | `vote --record` only: record a second vote on a ballot the ledger already has. Without it a repeat is refused by name rather than doubled |
| `--frame` | `pose` and `chainfit`: one pose frame — the picture to read part placements out of. One frame per call; several key poses are several calls, and correlating them is yours (§11) |
| `--scale` | the scale window to search, as **frame pixels per part pixel**, `<min>,<max>` (default `0.5,2`). The report states what it searched, and a window that does not contain the truth does not reliably refuse — §11. For `chainfit` it sizes the **internal anchor pass** and is refused beside `--anchor` — §12.4 |
| `--rotation` | the rotation window to search, in screen degrees, `<min>,<max>` (default `-180,180`, a full turn). Narrow it when you know the art is upright — a window narrower than the coarse step is divided rather than refused, and `search` states the step that division produced (§11.3). For `chainfit`, again the internal anchor pass — the chains' own window is `--hinge` |
| `--max-residual` | `pose` and `chainfit`: above this residual a placement is **refused by name** instead of reported flat (default `0.25`). A reporting threshold, not a pass bar — the placement is still in the JSON |
| `--anchor` | `chainfit` only: a `rigc pose` report for **this** frame, whose confident placements become the anchors the chains hang off. Without it that pass runs internally — §12.2 |
| `--hinge` | `chainfit` only: the window each child bone's local rotation is searched over, in **Spine** degrees about its setup value, `<min>,<max>` (default `-180,180`) — §12.4 |
| `--stretch` | `chainfit` only: also search a uniform bone scale, this ratio either way. Without it, stretch is free only where the candidate's own animations key a `scale` timeline — §12.4 |
| `--min-visible` | `chainfit` only: below this share of a part surviving the parts drawn over it, the placement is refused `occluded` instead of reported flat (default `0.25`) — §12.4 |
| `--passes` | `chainfit` only: how many times the occluder masks are rebuilt from the answers and the fit rerun (default `2`) — §12.4 |
| `--anchor-residual` | `chainfit` only: the residual a `pose` placement must be within to anchor a chain (default `0.16`) — §12.2 |

`render` also takes `--fps <n>` (the rate it samples at, default 12 — the same
protocol rate the reference frames use) and `--max <px>` (the long side of a
frame, default 256). Three commands take `--out`: a directory for `render`
(default `render/`), the `.html` file for `preview` (default `preview.html`) and
for `vote` (default `ballot.html`).

Pick the profile deliberately, and know which one you got by saying nothing. The
default is `spine`: "is this valid Spine 4.3 that any runtime plays correctly",
which is the question a rig authored anywhere is asking. `--profile spine-html`
adds one renderer's policy and one project's canvas budget on top, and those
extra rules fire on perfectly correct Spine data (clipping attachments,
unweighted meshes, packed atlases) — reach for it when you are shipping into
*that* project, not to be thorough. A report always prints which profile ran and
lists what that profile left out, on `PROF` lines.

🆕 *Packed atlases* used to be in that list twice over: `--pack --profile
spine-html` was **refused by name**, because `A06`'s coverage clause said "one
part per page" flat and rigc's own pack could not satisfy it. Since
[#266](https://github.com/firejune/rigc/issues/266) that clause is **one part per
page OR a tiling page**, so the combination is an ordinary build — and it is the
only one that puts the renderer's own rulebook over shared-page sampling. What a
*tiling* page has to satisfy under that profile is stated where the clause is,
§5.2's `A06` row: no two regions on one page overlapping. Rotation is still
refused, and that is a separate clause about rigc's packer never turning a region.

⚠️ The other half of that sentence — every region wholly inside the page it names
— left this profile in [#694](https://github.com/firejune/rigc/issues/694). It is
**validity**, so no profile switches it off: a rectangle outside its page is
broken for every consumer, while two regions over the same texels is something
correct, editor-exported data does.

### 0.1 Packing the parts onto shared pages — `--pack`

By default rigc emits **one part, one page**: nine loose PNGs compile to
`pages=9 regions=9`, which is correct, valid, and not what anybody means by an
atlas. `--pack` is the other arrangement.

```bash
bun cli.ts build --rig … --motion … --out spine --pack
#   ..    pack: skeleton.png 512x1024, 26 region(s), 67.9% covered, padding 2
#   ..    validate (packed atlas, pages on disk)
```

**What it does.** Every part goes onto a shared page, written into `--out` as a
real PNG (`skeleton.png`, then `skeleton2.png`, … — libgdx's own numbering, which
is what the Spine packer uses). The atlas carries `bounds:`/`offsets:` per region
instead of a page each. `--out` is therefore **self-contained**: that is what
packing means here, so `--pack` and `--copy-images` are refused together — the
copy flag copies the loose PNGs, which a packed atlas does not reference.

**What it deliberately does NOT do**, and each of these is a promise rather than
a gap:

- **no resampling, no scaling.** A region's pixels are the loose PNG's pixels.
  rigc writes no `scale:` line, so a pack cannot be coarser than its drawings the
  way the shipped examples' packs are — what a `scale:` costs on the way back in
  is §0.2.
- **no trimming.** `offsets:` always states a zero inset and the drawing's full
  size. Stripping transparent border would shrink pages, and it would also make
  every region attachment's quad depend on the packer — measure it yourself if you
  want it, do not assume rigc did.
- **no rotation.** `rotate: 0` on every region, and it is a fact rather than a
  field: the runtime transposes `u2/v2` at 90 and not at 270, and
  `RegionAttachment.computeUVs` assigns a different corner order at 90, so a
  rotated pack is one rigc's own `--atlas` substitution cannot read (issue #199).
  Rotation buys page area; a page that runs out of room spills to a second page
  instead.
- **no re-ordering of anything the skeleton says.** `skeleton.json` from a packed
  build is **byte-identical** to the unpacked one, because sizes are still
  measured from the loose PNGs and packing is an output arrangement.

**Sizes and gutters.** `--page-size` is a ceiling (default `2048`). Page edges are
powers of two — `region.x / page.width` is the coordinate every texel is sampled
through, and a power-of-two denominator makes that division exact in binary
floating point — and the page written is the **smallest** power-of-two pair that
holds the pack, so a two-part rig gets `1024x256` rather than a megabyte of
transparency. A part whose padded cell will not fit the biggest allowed page is
**refused by name**: the format cannot split one drawing across two pages, so the
alternatives are a bigger page or no pack, and the message says both.

`--padding` (default `2`) is the gutter each region reserves on **every** side, so
two neighbours end up at least twice that apart. The gutter is not empty: it is
filled by extending the region's own edge pixels outwards, and that is what makes
the packed render match the unpacked one. The rasteriser samples bilinearly and
clamps its taps at the page's edge, so on an unpacked page a sample at the outer
edge reads that edge twice; in the middle of a shared page the clamp stops
happening and the second tap is whatever is next door. Measured on this
repository's fixtures: with the gutter, 0 to 480 channel samples of 7 to 21
million differ and the worst difference is **1**; with `--padding 0` it is 22,000
to 60,000 samples and a worst difference of **77**.

⚠️ **That residual `1` is arithmetic, not resampling, and it is worth knowing
where it comes from.** A packed region's UVs are `x / pageWidth` rather than
`0..1`, which is one more rounding step in the sampling coordinate, so the
interpolation weight can differ in its last bit and a `Math.round` sitting exactly
on a `.5` boundary can then land the other way. It is bounded at one least
significant bit of one channel and it never reads a different texel. On real art
it usually does not appear at all: eleven of the thirteen rigs in this repository
render **byte-identically** packed and unpacked across 1,101 frames, and the two
that do not are the two with meshes, at 1 and 146 samples of 6 and 60 million.

### 0.2 Building against a pack somebody else made — `--atlas-in`

The other direction. `--atlas-in <file.atlas>` resolves every part against the
**regions** of an existing pack instead of against loose PNGs.

```bash
bun cli.ts build --rig … --motion … --out spine --atlas-in art/hero.atlas
#   ..    atlas-in /abs/path/art/hero.atlas
#   ..      torso   98x180  <- ../art/hero.png @ 363,209
```

The join key is the region **name**, which rigc already equates with the PNG
basename everywhere else — so a rig written against loose parts resolves against
a pack of the same parts with no edit. Geometry (`bounds`/`offsets`/`rotate`)
comes off the file, and a part's width and height are the region's
`originalWidth`/`originalHeight` **divided by the page's `scale:`**: the untrimmed
drawing at its own size, which is what an attachment's size means.

⚠️ **That division is load-bearing, and it is not exact.** A page declaring
`scale: 0.5` holds texels half the size of the drawings it was packed from — the
line says so, and an attachment's `width` is in world units, which the runtime
reads straight out of the skeleton JSON with the atlas nowhere in the expression.
So the scale has to be undone here or never (issue #267). But the packer wrote
`round(drawing × scale)`, so a 373-texel region at `scale: 0.5` is consistent with
a 745- and a 746-pixel drawing and the file does not say which: an imported size
is right to within `0.5 / scale` source pixels, and the build report prints the
texel count beside it so both numbers are visible:

```bash
#   ..      pendulum   746x212  <- ../export/atlas.png @ 2,2 scale 0.5 (373x106 texels)
```

⇒ **If the size has to be exact, supply the loose art** — the default route
measures the PNG. Reach for `--atlas-in` when the pack is what you were handed, or
when drawing through the pack's own texels is the point.

📐 **What you make beside the art stays at the art's size**
([#762](https://github.com/firejune/rigc/issues/762)). A depth sheet or a soft
mask is read in the drawing's pixels on a `scale:` page as on loose parts — each
vertex's texel position over the stated scale — and a mesh fit's overshoot is
printed in them, with the texel it was measured on named beside it. So are a
`contour`'s `margin` and `tolerance`
([#779](https://github.com/firejune/rigc/issues/779)): the trace runs on the
texels there are, and the two distances are applied on them as `value × scale`
texels — the scale the header states, never a measured one (below). What stays
in texels is only what is counted off them: a contour's hole count.

🚨 **A page that declares a size it does not have is a different thing, and it is
refused** ([#715](https://github.com/firejune/rigc/issues/715)). The common shape
is a pack whose `4096x4096` pages ship as `2048x2048` PNGs with the atlas
untouched — every region still stated in 4096-space — and that is **not** what a
`scale:` line says. A runtime draws it anyway: `TextureAtlas` computes every
region's UVs as a fraction of the **declared** size (`region.u = region.x /
page.width`) and nothing in the region mapping opens the file, so the same
fraction of the picture is addressed whatever size the PNG is. What a page grid
that disagrees with its file breaks is every reader that addresses the page in
**texels** — `A19`'s alpha scan, the region lift a mesh generator traces, and a
canvas renderer that cuts each part out by source rectangle. So `A06` refuses it
under **both** profiles, names the ratio it measured on each axis, and prints the
header that states the same art truthfully:

```bash
#   FAIL  A06_ATLAS_PAGE_SIZE_MATCHES_PNG: page "hero.png" declares 4096x4096 and its PNG is 2048x2048 —
#         0.5000 of the declared width and 0.5000 of the declared height. … The format states coarser texels
#         with the `scale:` header and rigc builds that: declare `size: 2048, 2048` with `scale: 0.5000` and
#         multiply every `bounds`/`offsets` on this page by 0.5000, and every part keeps the size it has now.
```

⇒ **Carry that out and the build is green with the attachment sizes it already
had**, because the division cancels (`originalWidth / scale`, above) — which is
the measurement that settles where this clause belongs: the format already has a
line for coarser texels and rigc already reads it, so the refusal hands over a
repair rather than a preference. Two limits, and the message names whichever one
it hits instead of leaving it to be discovered:

- a region whose `bounds`/`offsets` do not land on a whole texel of the file
  cannot be re-declared at all, and the refusal names the first number that does
  not divide;
- a page whose two axes differ — `4096x4096` declared over a `2048x3072` PNG —
  has no honest header either, because `scale:` carries **one** ratio. The message
  says so rather than offering one, and the repair is to re-export the page at the
  size the atlas declares, or repack.

📐 **`explain` does not refuse such a page — it withholds what it would have
measured off it** ([#750](https://github.com/firejune/rigc/issues/750)). It never
gates, a runtime draws the page, and most of its report — bones, slots, timelines
— reads no texel at all, so the pack still compiles and the report still prints.
What it no longer prints is a figure taken at the coordinates the atlas states,
because on such a file those are another part of the picture: measured on a pack
at half resolution, an authored mesh that covers 100.00% of its art and reaches
16.00px past it printed **68.49%** and **76.24px**, and a `grid` whose depth sheet
reads 10 of its 12 vertices on undrawn texels printed **12 of 12**. The page is
named once where the report starts, with the ratio `A06` refuses it by, and every
withheld figure says so where it would have stood:

```bash
#   ..    page "hero.png" declares 4096x4096 and its PNG is 2048x2048 — 0.5000 of the declared width and 0.5000
#         of the declared height: every figure below taken off this page's texels is withheld, and says so where
#         it would have stood. …
#   fan          authored 9 vertices / 8 triangles  (budget 64)  bones=[fan]  fit not measured: page "hero.png" …
#         the count of vertices on undrawn texels is not measured: page "hero.png" …
```

`build`'s `MESH` lines withhold the same figures in the same words and print no
page line of their own, because `A06` is `build`'s statement of that fact and a
second one would be two refusals of one page. A **`contour`** is the one reading
that cannot be withheld, because its outline *is* its geometry: it is refused as a
compile error carrying `A06`'s whole sentence — ratio and repair — on `explain`
and on `build` alike, where on `build` it arrives before the gate would have said
it. Carry out the repair and every figure comes back. ⚠️ They come back measured
on the **coarser** texels the page really has, so a figure that depends on the
grid need not equal the one the pack the page was halved from reads — and a
contour's outline is one of them, below.

📐 **A fit's overshoot is stated in the drawing's pixels on every page**
([#762](https://github.com/firejune/rigc/issues/762)). It is a distance, and on a
page that declares a `scale:` it is taken on the page's texels — so it used to be
printed in them, under the same `px`: one mesh over one drawing read 16.00px on
the declared-size page, **8.00px** on its `scale: 0.5` restatement and **32.00px**
on a `scale: 2` one. It is now the texel distance over the scale the atlas states,
which is the unit an attachment's `width` is in and the one you drew in, and the
line says which grid it was taken on — a texel of a `scale: 0.5` page is 2.00px of
the drawing, so that is the step the figure moves in:

```bash
#   fan          authored 9 vertices / 8 triangles  (budget 200)  bones=[fan]  covers 100.00% of the art, reaching 16.00px
#         past it (the drawing's pixels, measured on the page's texels at scale: 0.5 — a texel is 2.00px of the drawing)
```

All three pages read the fan at 16.00px, because its rim lands on whole texels of
each. A figure that does not is exact only to that step — a contour at
`tolerance: 3`, `margin: 4` reads 6.00px on the `scale: 0.5` page (3.00 texels)
against the full page's 5.39px, a different outline measured on a coarser grid,
and the line's clause is what says so. On a loose part and a page at scale 1 the
texels are the drawing, and the line is the one it always was. A `contour`'s hole
count is a count of those cells and says `texel(s)` on such a page.

📐 **A `contour`'s `margin` and `tolerance` are the drawing's pixels on every
page** ([#779](https://github.com/firejune/rigc/issues/779)). They are your
statement, in the unit every other size in the spec is in, so on a `scale:` page
the trace applies them as `margin × scale` and `tolerance × scale` texels, and
`maxVertices` is judged on the outline that asks for. They used to be applied in
texels unconverted, which asked each page a different question. Measured on
`halvedMeshPacks`, one spec — `tolerance: 1.5`, `margin: 2`, `maxVertices: 48`:

| page | applied in texels (before) | applied as the drawing's pixels (now) |
| --- | --- | --- |
| declared size | 15 vertices | **15** vertices, the same mesh |
| `scale: 2` | refused: `simplified to 66 vertices at tolerance 1.5, past the 48` | **15** vertices, the declared outline to 0.00px |
| `scale: 0.5` | 11 vertices, 4.20px from the declared outline | refused: the outline crosses itself after a margin of 2px, applied as 1 texel |

A **finer** page resolves everything the declared one does, so it traces the
declared outline, vertex for vertex. A **coarser** one holds less: its silhouette
is a staircase of texels 2px of the drawing apart, and a tolerance under one texel
keeps the steps — which is what the declared page does too at a tolerance under
one of *its* pixels (at `tolerance: 0.75` it keeps 66 vertices, and given the
budget for them it is refused by the same crossing). So
on a coarser page, ask for a tolerance of at least a texel, or supply the loose
art; the spec above at twice its figures traces 11 vertices there against the
declared page's 10, 3.69px apart. Every refusal a trace raises on a `scale:` page
names the figure the spec states, the texels it was applied as and the scale:

```bash
# rigc compile error: skin "default" slot "blob" attachment "blob": the outline crosses itself: edge 8 meets edge 10
#   after a margin of 2px (the drawing's pixels — applied as 1 texel(s) of this page, whose scale: 0.5 makes a texel
#   2.00px of the drawing) was pushed out of a silhouette narrower than that — lower the margin, or the art has a
#   neck too thin to mesh
```

🚨 **A page that is not a PNG is refused by name, before anything is compiled
against it** ([#732](https://github.com/firejune/rigc/issues/732)). rigc reads PNG
and nothing else — the size `A06` judges, the alpha `A19` judges, the renderer and
the region lift all decode PNG, and rigc links no decoder for any other format —
and a file's name is not evidence: a production pack shipped WebP pages called
`*.png`. What a page is comes off its first bytes. The refusal says what it found
there — a WebP, JPEG, GIF, KTX or KTX2 file by its signature, or no format rigc
recognises, with the first bytes in hex either way — and a file that begins as a
PNG and runs out before its `IEND` chunk is called **truncated**, wherever it was
cut. `build --atlas-in` and `explain --atlas-in` say so where they open the pack,
every such page in one sentence and before the compile; a loose part that is not a
PNG is refused as the image it is; and `rigc validate` on a directory holding such
a page fails `A06` with the same sentence:

```bash
#   FAIL  A06_ATLAS_PAGE_SIZE_MATCHES_PNG: page "hero.png" declares 2048x2048 and its file cannot be read as PNG, so
#         the size was not measured: /abs/art/hero.png is a WebP image (a RIFF/WEBP container whose first chunk is
#         "VP8L"), not a PNG: … rigc reads PNG and nothing else — its page-size and alpha readers, its renderer and
#         its region lift all decode PNG, and it links no decoder for any other format — so nothing in this file was
#         measured. Re-export it as PNG
```

⇒ **Re-export the page as PNG under the name the atlas gives it**, and the next run
measures it like any other. ⚠️ `A06` deliberately does not read the width and
height a WebP header carries in a fixed field. Doing so would print a size that no
reader in this tree can check — the parse would agree only with the forgery it was
written against — about a page that is refused either way; and the variant that
let a size-matching WebP page pass was measured building green under the default
profile and writing a directory whose next `render` refused the page.

**What `--out` holds afterwards:** `skeleton.json` and a `skeleton.atlas` that is
the pack, page paths pointing back at the pack's own PNGs — so `rigc validate
<that directory>` reads it green with no flags, exactly as it reads a loose
build's. Add `--copy-images` and the pack's page PNGs are copied in beside the
skeleton and the page names become their basenames, which is the same directory
with nothing outside it left to resolve. ⚠️ Until
[#693](https://github.com/firejune/rigc/issues/693) that flag rebuilt the atlas
from the parts the rig declared instead of from the pack, and a rebuild through
`ingest --art none` declares none: the file written was **zero bytes**, on a build
that printed `PASS` for all four atlas assertions.

The emitted `skeleton.atlas` **is** the imported one, verbatim except for its page
name lines, which are paths and have to be re-anchored to `--out`. Fields rigc
does not re-serialise (`format:`, `repeat:`, and `scale:` itself) survive the trip
because the text passes through by line; regions the rig does not use stay in the
file, because a real pack is shared between cuts and an importer that quietly
dropped half of one would make `--out` disagree with the pack it was built from.

Five things are refused rather than warned about, because each of them otherwise
**loads clean and draws wrong** — or, the last, cannot be read back at all:

| What | Why it cannot be a warning |
| --- | --- |
| a region name the atlas does not have | `AtlasAttachmentLoader` returns null and the part silently does not draw. The refusal lists the near misses — the usual cause is one character |
| a size the spec disagrees with | the same silence `A06` exists for, one link earlier: a quad sized against a region of another size collapses |
| a page the atlas names and the disk lacks | nothing to sample; caught on the way in, so the message names the atlas rather than the artifact rigc wrote from it |
| a rectangle that runs off its page | `x + width` past the page width makes `u2 > 1`, which samples whatever the wrap mode does. The gate names the same rectangle, under every profile, for a pack that reaches it without passing through here — `A06`, §5.2 ([#694](https://github.com/firejune/rigc/issues/694)) |
| a page file that is not a PNG | nothing in rigc can read it — not the gate, not `render`, not a mesh generator — so a green build over it would certify pixels nobody opened. Named by what its first bytes are, every such page of the pack in one sentence; the gate says the same for a directory that reaches it another way — `A06`, §5.2 ([#732](https://github.com/firejune/rigc/issues/732)) |

One limit, stated rather than discovered:

- an **optional state** (a manifest `states:` entry) whose region is not in the
  pack is a `DROP`, not a refusal — the same documented absence a missing PNG has
  always been, and the line names the atlas rather than a file nobody opened.

⭐ **The missing PNG it is the same rule as, spelled out**, because it was left
implicit here and the two halves are read together. A `states:` entry whose PNG is
not on disk is a `DROP` too, and the line names the file rather than the pack:

```bash
# --atlas-in:  DROP  lens_l/shut: no region "lens_l_shut" in export/atlas.atlas (state not emitted)
# loose PNGs:  DROP  lens_l/shut: no PNG at parts/lens_l_shut.png (state not emitted)
```

Either way the slot is emitted **empty** and the build is green — which is right
while nothing poses that state, and wrong the moment something does. So when the
setup pose names it, the build is refused, and the refusal names the state and
what was consulted for it rather than the slot alone (§5.1). ⚠️ Its remedy is
**not** the `null` the neighbouring message offers: posing `null` builds a rig
with that part missing, at exit 0 and a green gate. Restore the art, or fix the
path the manifest states.

🔑 **A refused build prints its `DROP` lines too**, under the refusal on stderr,
and did not before [#671](https://github.com/firejune/rigc/issues/671): they were
reported from the compile result and a refusal returns none, so the one output
naming the file was missing from exactly the run that failed over it.

A **turned** region is not one of them, and used to be (issue #570). A pack made
by somebody else routinely rotates a region to save space — `rotate: 90`,
`rotate: 180`, `rotate: 270`, or the format's older `rotate: true` — and rigc
reads all of them: anything that measures a part's pixels sees the same grid it
would have seen from the loose PNG, so a `contour` mesh traces the same
silhouette and an authored mesh's fit figure is the same number. The one thing
that does not change is what rigc **writes**: its own packer never turns a
region.

🔑 **That is a claim about rigc's instruments, and you may be holding only the
pack.** An author who has to cut a part out of the page by hand — to measure it
against a rendered frame, or to look at it at all — needs what the `rotate:` line
means for the numbers beside it, and the pack states none of this:

- `bounds: x, y, w, h` gives `w x h` in the **drawing's** orientation, so it is
  the part's size **unturned**: the same two numbers the same drawing carries at
  `rotate: 0`;
- the rectangle on the **page** is therefore `h x w` at `x, y` — the transpose —
  at `rotate: 90` and at `rotate: 270` alike, while `w x h` is what a region
  occupies at `rotate: 0` and at `rotate: 180`;
- cut that rectangle out of the page and turn it **clockwise** to recover the
  drawing at `rotate: 90`, and **counter-clockwise** at `rotate: 270`; a half
  turn has no direction to name.

Each direction there is **measured** rather than reasoned about: it comes off
`MeshAttachment.computeUVs` in the linked runtime, the one routine there that
says where a region's texels are for all four values, and the selftest derives
the words in that list from the same routine instead of reading them. ⚠️ Do not
take the turn from `TextureAtlas`'s own `u2`/`v2` — those transpose at a quarter
turn one way and not at the other, so one of the two pairs describes a rectangle
the page does not have ([#579](https://github.com/firejune/rigc/issues/579)).

`build` now prints the page rectangle on the line for a turned region, so the
report carries the rectangle to cut instead of leaving it to be derived
([#718](https://github.com/firejune/rigc/issues/718)):

```bash
#   ..      pendulum   105x139  <- ../export/atlas.png @ 710,16 rotate 90, occupies 139x105
```

⚠️ Two limits here are real and neither is about rotation:

- `--atlas-in` cannot recover what a `scale:` quantised away (above), turned or not;
- the **renderer** profile still refuses a turned region outright
  (`A06`, `--profile spine-html`), because that profile is about artifacts rigc
  itself emits and it never packs one turned. Reading a foreign pack and gating
  one under somebody else's renderer policy are different questions.

`--pack` and `--atlas-in` are opposite directions through the same door and are
refused together.

### 0.3 Starting from a skeleton somebody else made — `ingest`

Everything above starts from two spec files you wrote. `rigc ingest` starts from a
**Spine 4.3 `skeleton.json` you were handed** and writes those two files for you, so
an existing rig is a starting point instead of 250 KB of arrays to retype.

```bash
bun cli.ts ingest hero.json --out specs/ --images parts/
#   ..    out  /abs/path/specs
#   ..    art  loose
#   ..    images ../parts/  (the rig spec's own, from /abs/path/specs)
#   JUDGE DURATION: animation "idle" — skeleton JSON carries no duration; the largest key time (2.667) is used …
#   LOSS  PATH_LENGTHS: skin "default" slot "track" attachment "track" — the source states `lengths`; rigc RE-MEASURES it …
# rigc: wrote /abs/path/specs/rig.json
# rigc: wrote /abs/path/specs/motion.json
# rigc: wrote /abs/path/specs/findings.json
# rigc: build it with  rigc build --rig /abs/path/specs/rig.json --motion /abs/path/specs/motion.json --out <dir>

bun cli.ts build --rig specs/rig.json --motion specs/motion.json --out spine
bun cli.ts diff spine/skeleton.json hero.json      # 1.000 on every measure
```

**The loop it belongs in is the one above, with a different first step.** `ingest`
writes the specs; you *edit* them the way you would edit specs you wrote; `build`
gates; `explain`, `render`, `preview` and `check` read the result. Nothing
downstream knows or cares that the file started somewhere else — which is the point,
and also the hazard the `note` below exists for.

**The contract is an equality, not a rulebook.** `build(ingest(x))` is `x`: the
rebuilt `skeleton.json` is byte for byte the file `ingest` read, and the rebuilt
atlas holds the same **region blocks** — as a multiset, because the order the pages
come out in is in no field of the skeleton and a decompiled spec cannot know it.
That is a gate rather than a claim: `bun run selftest` round-trips every rig this
repository builds on every run.

**The flags are for what a skeleton does not encode**, and nothing else is a flag.

| flag | what it decides |
| --- | --- |
| `--art loose` (default) | name an `image` per attachment — `<path or placeholder>.png` — so the rebuild resolves loose PNGs and rigc measures them |
| `--art none` | state `width`/`height` only, so the rebuild is `build --atlas-in <pack.atlas>` and every part resolves out of the pack |
| `--images <dir>` | **write** the rig spec's own `images` directory, spelled relative to `--out`, so the rebuild is a plain `build --rig … --motion … --out …`. Without it the field is left out and every `image` resolves against `--out` itself, which holds the specs and no art — so every rebuild has to repeat `build --images <dir>`. Refused together with `--art none`, which writes no `image` for it to be the base of |
| `--stage x,y,w,h` | a setup bounding box to **add** to a skeleton that declares none — without it the absence is carried as `"width": null, "height": null` ([#714](https://github.com/firejune/rigc/issues/714)). An editor export *may* be such a file; every export under `examples/` carries a box and `ingest` reads it straight through — so passing the flag at one of them is **refused**, naming both boxes, rather than silently doing nothing ([#626](https://github.com/firejune/rigc/issues/626)) |
| `--name <n>` | the rig spec's `name`, which the motion spec's `archetype` must equal (default: the file's basename) |

⚠️ **`ingest --images` and `build --images` point opposite ways.** `build --images`
*overrides* the rig spec's own directory for one invocation; `ingest --images`
*writes* it, once, so no invocation needs the override. They share a name because
they name the same field — and `ingest` spells the value with the same function
`build` spells `skeleton.images` with, so a spec and the skeleton it came from say
where the parts are in one convention.

🚨 **The stage is one of the two values `ingest` will not guess.** A skeleton JSON
*need not* carry `skeleton.width`/`height`, and when it does not rigc cannot derive
one — posing the rig gives the *animated* extent, which is a different number from the
editor's setup box. So a file that declares none is **carried as declaring none**: the
spec states `"width": null, "height": null` (§3.1), the rebuild emits no box, and
nothing is recorded, because the rebuild is the file that was read
([#714](https://github.com/firejune/rigc/issues/714)). `--stage x,y,w,h` *adds* a box —
supply it from the project the file came from, or from the editor's own canvas — and
is recorded as a `NO_STAGE` judgement. A header stating **half** a stage (an origin
with no extent) is a `NO_STAGE` blocker: the spec holds a stage as four fields or none.

⛔ **The flag is refused beside a box the file states.** Two sources for one value, and
the file is the one that was measured — so `ingest` names both boxes and stops rather
than writing one of them and saying nothing. Drop the flag, or correct `skeleton` in the
source if its box is wrong ([#626](https://github.com/firejune/rigc/issues/626)). What
it does **not** do is refuse an *omitted origin*: inside a declared extent an omitted
`x`/`y` is `0` — the reading `build` emits and `diff` compares
([#620](https://github.com/firejune/rigc/issues/620)) — so the written spec states it
and a `LOSS HEADER_ORIGIN` line says the source omitted it and that the rebuild will
spell it ([#622](https://github.com/firejune/rigc/issues/622)).

⚠️ **This said an editor export "never" carries one until
[#594](https://github.com/firejune/rigc/issues/594) measured the corpus.** All twelve
exports under `examples/` declare `x`, `y`, `width` and `height`, `ingest` takes the
early return on every one of them, and not one needs the flag. What an editor export
*may* do is carry none: a rigc build that declares no stage
([#578](https://github.com/firejune/rigc/issues/578)) came back from a Spine 4.3.26
round trip with a header of `hash`, `spine`, `images`, `audio` and **no box at all** —
the editor preserves the absence rather than inventing a stage
([#616](https://github.com/firejune/rigc/issues/616)). So `--stage` is for a file that
really has none, and this repository's corpus holds no example of one; a production
corpus measured for [#714](https://github.com/firejune/rigc/issues/714) holds 48 of 48. It is still the
value that costs least to get wrong: `diff` reports the box as `stage_present` and
`stage_box` ([#578](https://github.com/firejune/rigc/issues/578)) and both are
`(reported)`, so nothing on the ladder consults them.

⚠️ **The duration is a convention, and it is recorded as one.** Skeleton JSON has no
duration field. The largest key time is the only derivable answer and it is what a
runtime plays to — but it is wrong for an animation that holds its last pose past its
last key, and nothing in the file can tell the two apart. `ingest` writes the largest
key time, states the convention in the motion spec's `note`, and records a finding per
animation. If you know the real number, edit it: the declared duration is checked
against the compiled keys, so an honest one costs you nothing.

**Read the findings; they are the product.** Three kinds, and the exit code turns on
the first:

| gutter | meaning |
| --- | --- |
| `BLOCK` | the spec format cannot say it, so the rebuild will **not** be the file that was read — `point`, a `sequence` block the parser would read as some other series, an unknown field on a bone, slot or constraint, a timeline family the motion spec has no track for. The command exits non-zero **and still writes both specs**, because a spec plus a list of what is missing from it beats no spec |
| `JUDGE` | the skeleton cannot answer and somebody has to: the stage, and each animation's duration |
| `LOSS` | the skeleton's spelling and rigc's differ, on purpose, and the line says how. A path attachment's `lengths` is the one that matters — it is `PathConstraint`'s own four-sample measurement rather than an arc length (#560), so a transcribed one would freeze whatever produced the source. The header ones are cheaper: `HEADER_BOOKKEEPING` for a field the spec has no home for, `HEADER_REDERIVED` for the version string, `HEADER_ORIGIN` for an origin the source left to the format and the rebuild writes out (#622) |

⛔ **It reads one generation of the format, and a file from another one ends loud.**
Spine data is locked to the generation that exported it and a mismatch does not
throw: 4.3 takes constraints from the top-level `constraints` array alone, so a
4.0–4.2 file's `ik`/`transform`/`path`/`physics` arrays load as nothing at all — 1,302
shipped skeletons parsed on a 4.3 runtime and loaded 0 of 8,672 constraints
([#706](https://github.com/firejune/rigc/issues/706) row 1). So `ingest` reads
`skeleton.spine` before it reads a field of the file. A file from another generation is
a `BLOCK GENERATION_UNSUPPORTED` naming the generation, the string it was read from,
and what a 4.3 reader loses **on that file**: the constraints parked in those arrays
counted by kind, the bones carrying 4.2's `transform` where 4.3 spells `inherit`, and
the physics constraints omitting `inertia`/`damping`, whose default is not the same
number in the two. A label naming no generation rigc knows — or a header stating none —
is a `BLOCK GENERATION_UNKNOWN`, never rounded to the nearest: a catalog that rounded
handed 19 skeletons labelled `3.8.99` a 4.2 runtime and every one of them posed as NaN
(row 7). Reading a file with *that generation's own* defaults is #706's item 2 and is
not in this tool — re-export as 4.3, or transcribe by hand ([INGEST.md](INGEST.md) §2).

📝 **Do not delete the `note`.** Both written specs carry one saying the file is
decompiled and naming the skeleton it came from. A decompiled spec is
indistinguishable from an authored one by inspection, every gate here calls it green —
because it *is* green — and no gate can catch the note's absence. It carries no
timestamp, deliberately: `A18_DETERMINISTIC_EMIT` compares two independent compiles
byte for byte, and a dated note would break the first rebuild from the spec.

⛔ **It reads skeleton JSON and nothing else** — not a `.spine` project, not a binary
`.skel`, not the atlas, not the art. A path that is not a `.json` is refused by name.
[INGEST.md](INGEST.md) is the whole page on working from a file you were handed.

The other commands:

```bash
bun cli.ts explain  --rig … --motion … --out …   # the compiled rig as a table
bun cli.ts validate path/to/spine                # re-gate artifacts already on disk
bun cli.ts diff     candidate.json reference.json [--as <candidate>=<reference>]…
bun cli.ts check    --candidate path/to/spine --frames path/to/frames [--skin …]
bun cli.ts bench    3 --candidate path/to/spine [--frames path/to/frames]
bun cli.ts render   --candidate path/to/spine [--animation …] [--skin …] [--fps 12] [--max 256]
bun cli.ts preview  --candidate path/to/spine [--animation …] [--out preview.html]
bun cli.ts vote     --candidate path/to/a --candidate path/to/b [--out ballot.html]
bun cli.ts vote     --record vote-<id>.json [--ballot ballot.html] [--ledger votes.jsonl]
bun cli.ts pose     --images path/to/parts --frame poseA.png [--out pose.json]
```

- **`explain`** is the one to reach for when a rig compiles but looks wrong. It
  prints the stage, every bone with its resolved parent and position, the slots in
  draw order with their setup attachment, and every animation's timelines key by
  key with the curve kind. A rig with a `deform` timeline also gets the **`DEFORM`
  block** — per key, what that key did to the geometry: the area and stretch
  extremes, how far each vertex moved and whether the winding survived
  (**§4.11.2**). It takes no `--profile`, it never gates, and it does not write
  anything — so the figures are readable on a build the gate is refusing.

  ⭐ **It reads what `ingest` writes, given the pack** — `--atlas-in <pack.atlas>`,
  with `build`'s meaning (§0.2). That matters more here than it looks: printing the
  `DEFORM` block means **posing** the rig, a pose resolves *every* attachment
  against the atlas whether or not anything deforms it, and a spec written by
  `ingest --art none` states sizes and names no image. So the size-only pair
  `build --atlas-in` gates green is readable here through the same flag, and
  without it the pair is refused by name at exit 2 rather than posed
  ([#697](https://github.com/firejune/rigc/issues/697), §5.1). ⚠️ `--profile`,
  `--pack`, `--page-size`, `--padding` and `--copy-images` are `build`'s and are
  not here: four of them decide what is *written*, and this command writes nothing.

  📐 **What it will not measure: the texels of a page that is not its declared
  size** ([#750](https://github.com/firejune/rigc/issues/750)). Under
  `--atlas-in`, a page whose PNG is not the `size:` its atlas states is named once
  at the top of the report, and the figures that would have been read off it — an
  authored mesh's `covers …% of the art, reaching …px past it`, a depth sheet's
  count of vertices on undrawn texels — are replaced by `fit not measured: …` and
  `… is not measured: …` naming the page and the ratio. A `contour` on such a page
  is refused, since its outline is read off those texels. Why, the quoted lines,
  and the repair: §0.2. On a page that **does** declare a `scale:`, the overshoot
  in that line is the drawing's pixels and the line names the texel it was taken
  on (`… measured on the page's texels at scale: 0.5 — a texel is 2.00px of the
  drawing`, [#762](https://github.com/firejune/rigc/issues/762)).
- **`diff`** compares two skeletons and reports **a ratio per measure** in six
  sections (bones, slots, attachments, constraints, animations, events). It
  deliberately does not combine them into a score: a rig with the right skeleton
  and the wrong timing and a rig with the right timing and the wrong skeleton call
  for opposite fixes. A measure with nothing to compare says `0/0` and says so.

  ⭐ **If your animation is not called what the reference's is, say so with
  `--as <candidate>=<reference>`** (repeatable, one pair each) — or let it pair by
  position, which happens with no flag when each side carries exactly one
  animation. Without a pairing every animation measure but `count` is keyed on the
  name, so a rig whose shot is right down to the key counts reads **0.000** across
  the section. The pairing gets `animations` the same two figures `bones` and
  `slots` carry, and reading them as a pair — name-agnostic 1.000 beside `names`
  0.000 — is what says the shot is right and the name is yours. The measures, the
  refusals and what makes the block absent instead of guessed:
  [INGEST.md](INGEST.md) §1.3.1, and *The measure inventory* in
  [BENCHMARK.md](https://github.com/firejune/rigc/blob/main/docs/BENCHMARK.md),
  which is repository material rather than part of this package.
- **`check`** renders your candidate into the reference frames' own pixel grid and
  compares pixels — the only thing here that can see a wrong animation. **§9.**
  🚨 What it certifies is the **default skin** unless you pass `--skin <name>`:
  on a rig with named skins, a run with no skin draws none of their art on either
  side and reports a perfect `0.0000` about it (**§9**).
- **`bench <rung>`** runs one rung of [the benchmark ladder](https://github.com/firejune/rigc/blob/main/docs/LADDER.md): validate
  under `--profile spine`, then diff against that rung's reference export, and with
  `--frames` the `check` table as well. Unlike the three above it is a **finish
  line, not a loop**: it opens the reference export, so a run that consults it and
  then edits is no longer an authoring run. `check` carries no such restriction —
  see §9.
- 🚨 **`render` and `preview` are how you LOOK at what you built**, and they are
  the two that need no reference at all. Reach for them the moment a rig compiles
  green, because green says nothing about the picture: a head that sits visibly
  off its torso passes every assertion, loads in `spine-core` and steps
  numerically clean — the offsets are the ones you asked for, and nothing in the
  gate can know you did not mean them. `render` writes
  `render/<animation>/f0000.png…` with a `contact.png` grid of **every** frame
  beside them (open that one first — spacing is a comparison across frames) and a
  `frames.json` sidecar naming the world box they are pictures of. `preview`
  writes one self-contained `.html`: your skeleton, atlas and page PNGs are
  embedded in it as data URIs and played by the official **Spine Web Player**, so
  double-clicking it is also the interop proof — what plays there was played by
  Esoteric Software's runtime, not by rigc's. The player is loaded from a CDN
  rather than copied into the file, so the first open needs a network.
- 📐 **`pose` is the only command here that reads an INPUT rather than a result.**
  Everything else takes a spec or a build and tells you something about it; `pose`
  takes a picture the user already has — a key pose — and reports where each loose
  part PNG sits in it, so you can write those coordinates into a rig and a motion
  **by construction**. Nothing about it grades anything: at that point the pose is
  a given condition, not a target, and the residual it reports is how far to trust
  a placement rather than how good the placement is. Reach for it the moment a
  request arrives as *"make it go from this picture to this one"*. **§11.**
- 🧩 **`chainfit` is that same reading of an input, through a rig you already
  have.** `pose` is handed nothing but the parts and the picture, so on a dense
  figure it refuses the half another part is drawn over — the residual it would
  report there is measuring the occluder. Give the same frame a **candidate** and
  two things become available that `pose` structurally cannot have: a draw order,
  so the pixels a later part covers are taken OUT of the objective instead of
  charged to it, and a hierarchy, so a child of a placed bone is searched over one
  hinge about its own pivot rather than over four degrees of freedom. It reports the
  `rotate` key value each answer implies, and the share of the part that answer was
  actually measured on. Reach for it after a first build, when the frame still has
  parts in it you cannot read. **§12.**
- 🗳️ **`vote` is `preview` with more than one candidate in it and an answer
  coming back**, and it is the one step of this loop you cannot run yourself.
  Reach for it where the instruments have run out: two builds that `check` and
  `diff` cannot separate, a pose fit with two local optima, a key density that is
  a matter of taste, a first draft with no reference at all. **The intended loop
  is: you compile 2–4 candidates that every one of them passes the gate → `rigc
  vote` writes one `ballot.html` → a human opens it, watches the panes loop, and
  picks a winner or declares a tie → they save the small JSON result the page
  hands them → `rigc vote --record <that file>` checks it against the ballot and
  appends one line to `votes.jsonl` → you read the ledger and proceed.**
  Compile first, vote last: never put a candidate on a ballot that did not build
  green, and never ask the human to read JSON, a diff or a spec — the page holds
  playable pixels and nothing else. The panes are labelled `A`/`B`/`C`/`D` and
  carry no paths, so do not describe the candidates to the voter either. What
  comes back is machine-checkable rather than prose: each line names the winner
  by content **digest** (a label means nothing outside one ballot), carries the
  `coverage` set so you can compute what is still unreviewed, and carries a
  reason code from a closed enumeration. A **tie is a recorded answer**, and
  `both-unacceptable` is the one that means *propose again* rather than *adopt
  either* — check for it before you treat a ballot as settled.

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

**R1 — A field is emitted when you declare it, and left out where the parser would
read the same value without it.** Omit a field and Spine's default stands; write it
and it reaches the file — unless what you wrote **is** that default, in which case
the emitter leaves it out, the way the editor's own exporter does (issue
[#716](https://github.com/firejune/rigc/issues/716)). Writing `x: 0` is still
legitimate, and your spec still says it: the spec is the record of what you wrote,
and the file is what the runtime reads. The two cannot disagree about a value,
because a key is left out only where the 4.3 parser loads the same `SkeletonData`
without it — exact equality with the float the file would hold, so `x: 1e-45` is
written — and the selftest loads every build both ways to hold that (§10.6c).

⚠️ This rule said *"not 'when it differs from the default'"* until #716, on two
grounds: that a rig may need to say `x: 0` out loud, and that deciding emission from
the value would make the file depend on arithmetic. Neither survived being measured.
What reads the file is the 4.3 parser, which reads the absent key as the same number,
and the editor, whose own export leaves the same key out — so there is nobody to say
it out loud *to*; and the decision is an exact comparison with the parser's fallback,
which is not arithmetic in any sense a reader has to redo. What the
old rule cost was concrete: a rebuild of an editor export restated **2,338** keys the
export leaves to the parser, so `ingest → build` could never give an editor's file
back.

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

**Every** attachment that names an `image` is measured, whichever skin it sits in.
The atlas holds **one region per file**, so two skins filling one placeholder from
two files put two regions in it and each attachment draws its own (§3.4.2), while
two attachments naming the same file share the one region that file made. What
cannot be reconciled is two *different* files whose basenames collide — only one of
them can be region `patch` — so rigc refuses the build and names both paths rather
than letting one of them silently draw the other's pixels
([#555](https://github.com/firejune/rigc/issues/555)).

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
rather than per animation, within one float32 step of the duration. Both halves matter, and the second is not
the first with a smaller number — see §4.5.

**R8 — `from` needs a cut manifest.** `from.anchor` / `from.slotWindow` /
`from.meshCenter` / `from.rotation` read measured art out of a manifest. Without
`--manifest` they are a compile error naming the bone. A rig with no measured art
behind it writes literal `x`/`y` instead.

**R9 — Nothing is written until every assertion is green.**

**R10 — The `animations` object is keyed in the editor's order, not in yours, and
names that have no one order are refused.** Declare animations in whatever order
reads best; the emit keys them the way the Spine editor does. This is the one place rigc
reorders anything you wrote, and it is not cosmetic: a `slider`'s animation is a
**name** in JSON and an **ordinal** in the format's binary half, so an editor that
re-sorts the object repoints every slider whose animation moved index — silently,
in a file that still parses and still gates green (§3.5.2,
[#535](https://github.com/firejune/rigc/issues/535)). Nothing else moves: each
animation's own body is byte-identical either way, and every other collection is
emitted in the order you gave it.

⚠️ **What that comparator is, measured rather than inferred.** Five name lists
went through a licensed 4.3.26 editor as JSON and came back as JSON, and the ten
answers are in the repository as
`fixtures/editor-order/probe{1..5}.{in,out}.json`
([#728](https://github.com/firejune/rigc/issues/728)). Every row below is a clause
of the rule with the pair from those files that shows it — nothing here is a
guess, and the selftest re-derives each row from the files rather than from this
page:

| The editor | Shown by |
| --- | --- |
| folds case **upward**, per character, and leaves a character with no single upper case where it is | `z` before `_x` (`_` is 0x5F, above `Z` and below `a`); `z` before `ß`, which a whole-string upper case would write `SS` and sort among the `S`s |
| reads a **run of digits as a number** — at any position, after any script | `x2` before `x10`; `中2` before `中10` |
| **defers** two runs that are one number written twice, and settles them at the end with the leading zeros later | `a01` before `a1b`, so the walk did not stop at the equal runs; `a1` before `a01`, which is how it ends |
| **skips a space**, and gives that tie to the name with fewer of them — after the leading-zero tie-break, not before it | `bc` before `b c`; `a 1` before `a01` |
| otherwise orders by **code point after folding**, and does not treat punctuation as ignorable | `a-1` before `a1`; `a1b` before `a_1` |
| leaves a remaining **tie in the order your file declares it** | `turn` before `Turn`; `Mango` before `mango` — each given in that order and returned in it |
| writes **leaves then folders at the root**, and **sub-folders then leaves inside a folder** | `h` before `f/sub1/deep/q`; `f/sub1/x` before `f/leafA` |

🔸 **One clause of the rule is not from those files.** Before comparing, the
comparator reads U+3000 IDEOGRAPHIC SPACE as a space and the full-width digits
U+FF10–U+FF19 as `0`–`9`. No probe carried either; the fold was measured on a
production skin's slot keys ([#791](https://github.com/firejune/rigc/issues/791),
§10.6b says what was measured and why it is those two classes and not NFKC), and
it applies here because R10, R11 and a skin's slot keys are one comparator. So
`shot２` sorts before `shot10`, and a pair an ideographic space decides is
ordered rather than refused as `separator`.

⭐ **A tie is not an ambiguity, and that is what retired most of this rule's
refusals.** Two names the comparator cannot separate come back in the order the
file gave them, so the order rigc emits for such a pair is **your own declaration
order** and the editor keeps it. Nothing moves index, so there is nothing to
refuse: `Turn` beside `turn`, `turn01` beside `turn1`, `1turn` beside `turn`,
`wave_x` beside `wavea` all build, and each is keyed the way the round trips say.

So what is left refused is short, and each row is a pair two readings of the
**same** measurement order differently:

| Refused | Because | Instead |
| --- | --- | --- |
| `number` — two or more digit runs that are each one number written twice, pointing opposite ways (`x01y1` against `x1y01`) | the round trips measured one deferred run; keeping the first such difference and keeping the last are both consistent with that | write each number one way, with leading zeros or without |
| `separator` — a whitespace character that is not a space (a tab, a no-break space) | the space is measured skipped and nothing else is, so a rule that skips all whitespace and one that skips only the space disagree here | rename so the only whitespace in either name is a space |
| `folder` — two sibling **folders** the comparator cannot separate (`Fx/a` against `fx/b`) | a tie between two leaves is file order, but the editor holds a folder as an object and keeps its entries together, and no round trip carried two folders one fold apart | rename one of the folders so they differ by more than letter case, spacing or a leading zero |

⭐ **Capitals and numbered series are not what is refused.**
`Sweep, Turn, Wave, Zoom02, Zoom10` builds, and so does `shot1 … shot12`: a
numbered series that crosses 9 → 10 is keyed **1, 2, … 9, 10, 11, 12**, which is
what the editor does with it — and is not what a codepoint sort does.

✅ **This rule was a quantifier over comparators until #728, and that is what
changed.** rigc keyed `animations` codepoint-ascending until
[#543](https://github.com/firejune/rigc/issues/543) and then emitted a member of
the "natural, case-insensitive" family, refusing every pair the family could
disagree about. Both refusals were sound and both over-refused by construction,
because a quantifier stands in for a measurement: a name with a capital, an
accent, a space or a folder in it was refused rather than emitted in the order the
editor returns. Measuring the comparator moves no byte on any set the old rule
accepted; it stops refusing the ones it did.

**R11 — The `skins` array is written with `default` first and the rest in exactly
the order R10 describes.** A skin is a **name** in the JSON half of the format and
an **ordinal** in the binary half — `skins[readInt()]` for an attachment timeline,
`skins[skinIndex]` for a linked mesh — so an editor that writes the array in
another order repoints every such reference, silently, in a file that still
parses. Measured: a rig built `default, zulu, mike, alpha` exported
`default, alpha, mike, zulu`
([#541](https://github.com/firejune/rigc/issues/541)).

⚠️ **It is one comparator, and that is measured too.** Two of the five round
trips carried one name list as **both** collections and both came back in one
order, which is what retired the wider skin refusal #541 shipped: until #728,
`Zulu` beside `mike` and `mike10` beside `mike2` built as animation names and were
refused as skin names. Both build now. `default` is pinned rather than sorted, on
names the same comparator puts ahead of it — `default` before `2`, `default`
before `A` — so renaming a skin away from `default` makes it an ordinary name that
sorts like one.

**R12 — An attachment's `name` is written exactly when the spec states it, and
the `default` skin may not share a placeholder with a named skin.** rigc derives
no name. A placeholder several skins fill is emitted under that placeholder in
each skin, carrying the `name` each entry states and none where it states none —
which is the shape the editor itself exports (§3.4.2). Until
[#796](https://github.com/firejune/rigc/issues/796) rigc composed
`"<skin>/<placeholder>"` there, which renamed every such attachment at runtime.
What you *do* author is where the shared art lives: a
placeholder the `default` skin shares with a named skin is a **compile error**,
because the Spine editor has no representation for it in either spelling (#567,
measured on 4.3.26 — named, the export re-keys it and the default skin draws
nothing; unnamed, the import is refused). Put the shared entry in a named skin —
`base` — and every filler is a named skin. A placeholder only one skin fills is
emitted exactly as before, in the default skin or anywhere else.

---

## 3. The rig spec, field by field

`spec` must be exactly `"rigc-rig/1"`. `name` must be a non-empty string. `bones`
must be non-empty. `slots` must be present (it may be empty).

🚫 **Every example value below is invented.** Names, coordinates, vertex lists and
payloads in this guide are written to illustrate a field, never copied out of a
reference export — an example lifted from one would be handing an authoring agent an
answer to the rung it is standing on, which is the rule §10.6 states and the honesty
rule in [LADDER.md](https://github.com/firejune/rigc/blob/main/docs/LADDER.md) turns on. If a snippet here matches a reference file,
that is a defect in this guide: report it. (It has happened — 2026-08-23; the incident
is recorded in `bench/runs/README.md`, *What a run may read*.)

### 3.1 `skeleton` — the header

| Field | Spine meaning | Default |
| --- | --- | --- |
| `x`, `y` | setup-pose bounding box origin | `0` — and refused outright beside a stated absence, below |
| `width`, `height` | setup-pose bounding box size, **or both `null` for "this skeleton declares no stage"** | falls back to the manifest's crop; **with neither the number nor the `null`, the compile fails** |
| `fps` | nonessential editor hint | `SkeletonData.fps` stays 30 |
| `referenceScale` | 4.2+ physics/scale reference | parser default 100 |
| `images` | where the editor's import looks for the part PNGs, as a path from the skeleton file | **written for you**: under `--copy-images` the `--out` directory itself, spelled `../<its basename>/` (a literal `./` is dropped by the editor on import; a named directory is kept and every part is found — measured on 4.3.23); otherwise the relative path from `--out` to the one directory the spec names every part PNG in (the rig's images directory, or the manifest's plates). A declared value is carried through verbatim — and overridden by `--copy-images`, which moved the parts. Parts spread over several directories have no single true path, so nothing is written (issue #370) |
| `audio` | nonessential: where the editor looks for the skeleton's audio files, as a path from the skeleton file — a string, or `null` for none | **not written unless you state it.** rigc has no audio to point at, so this is a value a spec states or does not; stated, it is carried verbatim, `null` included, because `null` is what an editor export writes when no audio folder is set (all twelve under `examples/` do) and `ingest` carries it from there ([#716](https://github.com/firejune/rigc/issues/716)). Anything but a string or `null` is a compile error naming the value |

`spine` and `hash` are not yours to write: rigc emits its own version label
(`A16` re-checks it is on the 4.3 line) and inventing a hash would claim an export
this file did not come from. The editor's import then warns `Data version 4.3.13
does not match Spine version 4.3.23. The Spine version should match the version
that exported the data file.` and imports anyway — the label is the runtime rigc
links, not the editor that will open the file, and the warning is harmless
(issue #370).

`width`/`height` are what `A14` and `A19` measure against, so a guessed stage is a
gate measuring against a number nobody wrote down.

⭐ **A skeleton may declare no stage, and saying so is not the same as saying
nothing** (issue #578). Write the pair as `null`:

```json
"skeleton": { "width": null, "height": null }
```

and the emitted header carries **none** of `x`/`y`/`width`/`height` — which is
what an export of a skeleton whose stage was never set looks like, and the shape a
transcriber of one now has something to write. `null` is this spec's spelling for
a stated absence wherever it has one (`slots[].attachment` is `null` for "show
nothing"), so nothing new is introduced here but a third value of a field that
already existed.

Three readings stay apart, and the middle one is the point of the other two:

| What the spec says | What happens |
| --- | --- |
| a number for each | the stage, as before; a manifest `crop` is the fallback |
| `"width": null, "height": null` | builds, and emits a header with no stage at all — and this **beats** a manifest's `crop`, because a rig spec is where a claim about the skeleton is made |
| neither | **refused**, exactly as before: `no stage size: …` |
| one `null`, one number | refused — a stage has both extents or neither, and which half was meant is not derivable |
| the pair `null` **and** an `x` or `y` | refused — an origin for a box that is not there |

What each tool does without one — every reader of the stage in the tree, measured
for [#714](https://github.com/firejune/rigc/issues/714), and not one of them puts a
number where the box would be:

| Reader | With a stage | Without one |
| --- | --- | --- |
| `build` | emits `x`/`y`/`width`/`height` | emits none of them |
| `A14_NO_FULL_FRAME_MESH` | fails a mesh as big as the stage | **SKIP**, by name |
| `A19_OVERLAY_PNGS_HAVE_ALPHA` | exempts the base plate a cut manifest names — the part whose window is the crop — and, on a build that names none, the one image that covers the stage | a manifest build exempts the plate it names, exactly as with one ([#770](https://github.com/firejune/rigc/issues/770)). A rig-spec build names no base plate, so an opaque part is refused with *"this skeleton declares no stage size to measure one against, and the build names no base plate"* and the two ways to decide it: a `skeleton` stage the plate covers, or *"build from a cut manifest, whose base plate is the part whose window is the crop"* |
| `diff` | `stage_present` and `stage_box` | `stage_present` 1/1 when neither side declares one (agreement), `stage_box` 0/0 |
| `explain` | `stage  W x H` | `stage  none declared` |
| `render` | frames the posed extent of every animation | the same frames, plus a line saying the viewport is the posed extent and no stage |
| `preview` | the Spine Web Player frames the posed extent of the animation it plays | the same, plus the same line |
| `check` | fits the candidate's world box from what it draws | the same figures, plus a note saying so |
| `build --pack` | never reads it | the same pages and atlas |
| `ingest` | reads it straight through | writes `"width": null, "height": null`; `--stage` adds one |

⚠️ A stage-less skeleton is **unmeasured, not certified**: `A14_NO_FULL_FRAME_MESH`
reports **SKIP** on one, because there is no full frame for a mesh to span. And
`rigc diff` reports it — `skeleton.stage_present` and `skeleton.stage_box`, in the
header block at the top of the report — so a stage somebody invented now reads
below 1.000 against a source that has none.

⭐ **A stage at `0,0` is not a stage-less one, and an editor export spells it by
saying nothing.** The editor omits a header field that is at its default, so a
skeleton whose box sits at the origin exports as a `width` and a `height` with no
`x`/`y`; `stage_box` reads that omission as the `0` it means, and its line says so
— *the extent as stated, an omitted origin as the 0 it means*. So `4/4` on a build
of yours against an export of that same build is the right answer rather than a
tolerance, and an origin that really did move still reads below 1.000. The extent
is the half that is read exactly as stated: omit a `width` and you have declared no
stage, which `stage_present` is the measure of. Both are reported and gate nothing, for
the reason every reported measure is: no reading of the rendered frames could have
decided a setup-pose bounding box. The measure inventory that says so lives in
[BENCHMARK.md](https://github.com/firejune/rigc/blob/main/docs/BENCHMARK.md), which
is repository material and not in the published package.

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
| `inherit` | `normal` · `onlyTranslation` · `noRotationOrReflection` · `noScale` · `noScaleOrReflection`. The first letter's case is free (`NoScale` loads) and the rest is exact: the runtime folds that one letter and nothing else, so `NOSCALE` is refused — it used to compile and load as **no mode at all** ([#733](https://github.com/firejune/rigc/issues/733)). An animation can change it over time: the `inherit` track (§4.4) | `normal` |
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
| `attachment` | the **setup pose** attachment name, or `null` for "show nothing" | must come from here or from `motion.setup` (R3) — **except** on a slot nothing fills, where it can only be `null` and may be left out |
| `color` | `rrggbbaa` tint | opaque white |
| `dark` | two-colour tint, `rrggbb`. The **setup** half; §4.4's `rgba2` and `rgb2` tracks key it over time and require it | — (🚫 `A12` under `spine-html`) |
| `blend` | `normal` · `additive` · `multiply` · `screen` | `normal` |

✅ **Every slot you declare is emitted, in this order.** A slot nothing fills — no
skin entry, no manifest part — is emitted **empty**: `name` and `bone`, and no
`attachment` key at all, which is how the format spells "shows nothing"
(`SkeletonJson`'s slot reader takes `attachment` with a `null` default; 34 of the 52 slots of the
official `spineboy-pro` export omit the key, though those are slots a skin fills
whose setup pose shows nothing). So the emitted slots array
**is** the rig's slot table, and `A26_SLOT_DRAW_ORDER` checks it in both directions:
nothing out of order, and nothing missing.

Declaring a slot no cut fills is therefore normal — it fixes where that slot sits
whether or not this cut has art for it — and transcribing a foreign skeleton that
carries an empty slot reproduces it exactly.

⚠️ **This changed with issue #575.** Such a slot used to be *dropped*, with no message, and
the gate allowed the emitted array to be any subsequence of the rig's. What it cost
is the index: every slot below the dropped one moved up one place, which is what a
`drawOrder` key's offsets are counted against and what an index-keyed consumer
splits on. Two production exports declaring 53 and 61 slots built green at 51 and 57
and read 0.962 and 0.934 under `diff` against the file they were transcribed from.
If you have a rig that leaned on the drop, the emitted array simply grows; nothing
else about it moves.

🚫 **Naming an attachment on a slot nothing fills is refused by name**: `the setup
pose shows attachment "x" on slot "y", which no skin and no manifest part fills`.
That is the half-finished wiring-up the old silence hid — the slot is emitted empty
and the name resolves to nothing, so either give the slot an attachment or state the
setup pose as `null`.

### 3.4 `skins` — placeholder → attachment maps

`skins` is `skinName → slotName → placeholderName → attachment`. Give at least
`default`; it becomes the skeleton's default skin. (No rung of the benchmark ladder
uses a named skin — all twelve official example skeletons have exactly one skin,
called `default`.)

A skin can also say which bones and constraints it **switches on**, and that needs
one more level, so a skin entry has a second spelling — see §3.4.1. The short one
above is unchanged and is what almost every rig wants.

🔸 **`default` is a name, not a requirement.** A rig may put every attachment in
named skins and declare no `default` at all, which is what an editor export of a
multi-skin character gives back; rigc still emits a `default` skin, empty, because
it always does. An animation keying such a slot resolves its attachment names
against every skin there is — §4.4 states that rule and §5.1 the one refusal left.

🔸 **A skin may fill no slot with anything that needs art, and that build is
green.** The atlas is built out of what the skins reference, so a rig whose skins
name no `image` — an empty `default`, or one carrying only a `boundingbox`, a
`clipping` polygon or a `path`, none of which has a page — compiles to an atlas
with **no pages**, and rigc writes `skeleton.atlas` as an **empty file** (zero
bytes). Four rules then report SKIP by name rather than a pass, because a page is
their whole subject: `A07_ATLAS_TEXT_SHAPE`, `A06_ATLAS_PAGE_SIZE_MATCHES_PNG`,
`A17_ATLAS_PAGE_FILES_EXIST` and — under `spine-html` —
`A19_OVERLAY_PNGS_HAVE_ALPHA` and `A27_REGION_NAME_MATCHES_PAGE_FILENAME`. Until
[#608](https://github.com/firejune/rigc/issues/608) the same compile wrote one
newline instead and `A07` refused it with two findings, so a hit-box skeleton — a
correct rig, whose geometry `A33_VERTEX_ATTACHMENT_GEOMETRY` passes — could not be
built at all.

⚠️ **This is not the case where an attachment WANTS a region.** A region or mesh
attachment that states `width`/`height` and names no `image` still resolves a
region by `path`, and with no atlas to supply it that is
`A08_REGION_NAMES_MATCH_ATTACHMENTS` naming the skin, the slot, the placeholder
and the path — which is what a spec written by `ingest --art none` does when it is
built without `--atlas-in` (§0.2, §0.3). The empty atlas is legal; an attachment
pointing into it is not.

⚠️ **`rigc render` still refuses such a build**, by name and before it draws
anything: `… posed no drawable attachment in any animation or in its setup pose —
there is nothing to draw`. That is the honest division — the rig is valid Spine
data, and there is no picture of it. `rigc check` says the same thing one step
on, since it has no frames to compare; `tools/editor_roundtrip.ts` quotes both
renderers and reports its step 5 as a **SKIP** naming that, and the round trip
comes back green on the strength of `validate` and `diff`
([#621](https://github.com/firejune/rigc/issues/621)). A skin only **one** side
can draw is the other case entirely, and stays red.

**Region attachment** ([Spine: region attachments](http://esotericsoftware.com/spine-regions)),
the default `type`:

| Field | Meaning |
| --- | --- |
| `type` | `"region"`, or omit |
| `name` | the attachment's **own name**, when it is not the placeholder: what the runtime calls it (`Attachment.name`, which is what `slot.attachment.name` returns) and what `path` defaults to. Optional — absent, the runtime names the attachment by its placeholder. Written **verbatim**, as the attachment's first key, exactly when you state it; rigc never makes one up (R12, §3.4.2). Nothing resolves an attachment *by* it: a slot's setup `attachment`, every timeline and a linked mesh's `source` use the placeholder. Every type takes it. Not a string is refused — `"name" is 7, which is not a string` |
| `image` | **rigc extension.** A PNG relative to the rig's `images` directory; rigc measures it (R5) |
| `width`, `height` | required by the format — give them, or give an `image` |
| `path` | the atlas region to resolve; defaults to the attachment's name — its `name`, else the placeholder. rigc sets it for you when the PNG basename differs from that name. **One rule, both kinds** — see the note under *Mesh attachment* |
| `x`, `y` | offset from the bone, in the bone's local space |
| `rotation` | degrees; cancels a rotated bone for a plate authored screen-upright |
| `scaleX`, `scaleY`, `color` | as Spine |
| `sequence` | a **numbered image series** instead of one region: `{ "count", "start"?, "digits"?, "setup"? }`, and `path` (or, with none, the `name`, or the placeholder) is the series' stem. No `image` beside it — the frames are the images. §3.4.3 |

**Mesh attachment** ([Spine: meshes](http://esotericsoftware.com/spine-meshes)) —
either authored geometry (`uvs` + `triangles` + geometry) **or** a `generator`,
never both. `hull`, `edges`, `width` and `height` may be stated; whichever is
omitted, rigc derives — `hull` and `edges` from the triangles, the size from the
PNG — and the rules are a few paragraphs down. `type`, `name`, `image`, `path`,
`color` and `sequence` mean exactly what they mean on a region (a sequence mesh takes authored
geometry, never a `generator` — §3.4.3).

🔑 **`path` is one rule for both kinds.** A mesh derives it from `image` the way a
region does: stated wins, otherwise the PNG's basename when that differs from the
attachment's name — its `name`, else the placeholder — otherwise nothing. The parser reads `path` off both with the same line
(`getValue(map, "path", name)`, `SkeletonJson.ts:541` and `:570`), and `path`
defaults to the attachment's **name** rather than to the placeholder — so a mesh
with `image: hair_short.png` under a placeholder called `hair` resolves the region
`hair`, which no atlas has. Until
[#577](https://github.com/firejune/rigc/issues/577) a region derived it and an
authored mesh did not, so that rig **built** and then failed
`A00_ROUNDTRIP_PARSE: threw: Region not found in atlas: hair` — which is the
loader's sentence and all the report had. Since
[#589](https://github.com/firejune/rigc/issues/589) the same miss is named by
`A08_REGION_NAMES_MATCH_ATTACHMENTS`, with the skin, the slot, the placeholder
and the attachment's own name beside the path.

Where each vertex sits on the **art**:

| Field | Meaning |
| --- | --- |
| `uvs` | one `u, v` per vertex, in the order the geometry below uses. Both are fractions of the region rather than pixels, and the array's length is what fixes the vertex count — a mesh states no `vertexCount`. **`(0, 0)` is the region's top-left pixel and `(1, 1)` its bottom-right**, so `u` grows toward the right edge and `v` grows *downward* toward the bottom edge: the crop-pixel convention §11.2 states for a manifest, and not Spine's y-up world. What a **turned** region (`rotate: 90`, in a pack somebody else made) does to that is §0.2's subject |

⭐ **Measured, because an assumption about a corner is invisible in a build that
went green.** On a 64×48 plate whose four quadrants are four flat colours,
`rigc render` drew a quad given `uvs` running `0 → 0.5` on both axes as 3,120 px
of the **top-left** quadrant's colour and not one pixel of any other, and the same
quad given `0.5 → 1` as 3,120 px of the **bottom-right**. Beside it, the runtime's own
`MeshAttachment.computeUVs`, handed the emitted atlas region, put `(0, 0)` at page
pixel `(0.00, 0.00)` and `(1, 1)` at `(64.00, 48.00)` — the region's own two
corners, in the page's y-down pixels. `CUR44` in the selftest holds the sentence
above against that second measurement.

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

⭐ **`hull` is derived from the triangles, and the vertex order has to let it be.**
Spine's `hull` is the number of vertices that make up the outline polygon, and the
format's one rule about it is that *the hull vertices are always first in the
vertices list* — first, and **in order**: the editor draws the outline by joining
hull vertex `i` to `i + 1` and constrains its triangulation to those segments, and
the binary format does not even store a triangle count — it reads
`2·vertices − hull − 2` triangles, Euler's count for a hole-free triangulation. The
triangles already fix the outline (an edge used by exactly one triangle is on it),
so an omitted `hull` is read off them and a stated one is checked against the same
derivation. What cannot be described that way is refused by name, and every one of
these messages prints the outline walk, because the walk is the fix:

| Refused | Message |
| --- | --- |
| a stated `hull` that disagrees | `hull 25 disagrees with the triangles, whose outline has 16 vertices (0 → 1 → 2 → …). Delete "hull" and rigc derives it, or state 16` |
| outline vertices that are not the first `hull` of the list | `hull vertices must come first; vertex 19 is on the boundary and vertex 6 is not. The triangles' outline runs 0 → 1 → 2 → 3 → 4 → 9 → 14 → 19 → 24 → 23 → 22 → 21 → 20 → 15 → 10 → 5: list those 16 vertices first, in that order, then the 9 interior vertices` |
| outline vertices that are first but zigzag | `hull vertices must trace the outline in order; the triangles' outline runs 0 → 1 → 3 → 5 → … → 4 → 2, so vertex 3 has to follow vertex 1 in the list, and vertex 2 does. Renumber the vertices along that walk` |
| triangles with no single outline | `the triangles do not tile the outline: 25 vertices with a 16-vertex outline tile as 32 triangles and there are 33` — an unused vertex or a doubled interior triangle; or `the triangles' outline is not one closed loop: vertex 4 has 4 boundary edges` — a pinch, a hole, or a doubled triangle on the perimeter |

🚨 **A row-major grid is the case this catches**, and until
[#368](https://github.com/firejune/rigc/issues/368) it was `gallery/portrait`'s: a
5×5 grid's perimeter is 16 of its 25 vertices, interleaved with the interior, so
no `hull` can describe that list — and `hull: 0`, which rigc used to write there,
is what the editor repairs on import by making **every** vertex a hull vertex in
list order and saying so in a WARNING. A two-column strip is the same trap with
every vertex on the outline: the list zigzags across, the outline runs down one
side and up the other, and the hull it would declare self-intersects. The fix is
the order the editor itself writes: the perimeter first, walked around, then the
interior — [FACE.md §4.3](FACE.md) has the recipe, and both gallery grids ship
that way. Nothing about a render depends on it; what depends on it is the mesh
as the editor shows it to the person refining the draft.

`edges` is **always written**, in the encoding the editor's own exports use:
vertex index pairs with each index **times two** — `[0, 2, 2, 4, …]`, the offset
into the flat `x, y` array, the same doubling the loader applies to `hull`. rigc
writes the outline loop first and then every interior triangle edge, so the
editor's constrained triangulation reproduces these exact triangles instead of
reporting *mesh internal edges lost*. A stated `edges` — a transcription of an
export carries the edges somebody drew — passes through verbatim.

`width`/`height` are the size of the image the mesh is drawn on. Stated wins;
omitted, they are the named PNG's measured size (R5), the same number a region
reads. With neither a size nor an `image`: `a mesh needs width and height — give
them, or give an "image" and rigc will measure the PNG`. They were written as 0
before #368 — a size no spec stated.

⚠️ **Authored geometry is not a rigc generator, and the gate says so.** rigc built
neither its rim nor its rows, so it gets to assume nothing about its topology:
`A21_MESH_RIM_PINNED` and `A28_RIBBON_ROWS_SHARE_WEIGHTS` **SKIP** on an authored
mesh with that as the reason, and `A20`'s two generator-policy branches (a mesh here
is weighted; a generated mesh binds only bones that move it) do not apply to one.
`A20`'s coherence rules — weights present, in range, summing to 1 — still do. Issue
#44; before it was fixed, `A21` reported 40 failures on a correct 40-vertex editor
mesh because an absent `meshKinds` entry read as `ring`.

⭐ **Coverage is the exception, and it is reported for an authored mesh too.** Those
rules are about a mesh's **structure** — where its rim is, how its rows pair —
which rigc cannot know about geometry it did not build. Coverage is a measurement
between two things it has in front of it: the emitted triangles, and the PNG the
attachment names with `image`. So any mesh that names one gets the figure on its
`MESH` line, authored or generated:

```bash
bun cli.ts build --rig gallery/squash/rig.json \
                 --motion gallery/squash/motion.json --out /tmp/squash
```

```
  MESH  ball         authored 9 vertices / 8 triangles  (budget 8)  bones=[ball]  attachments=[ball]  covers 100.00% of the art, reaching 15.00px past it
```

**A number, not a bar.** A `contour` under 99.5% is *refused* because rigc
generated that geometry as a claim about the art; an authored mesh that sits inside
its art is a legitimate thing to draw — a soft feather, a trimmed hull, a mesh
meant to bend a core while its edges stretch — so the figure informs and the
decision stays with the author. A mesh with no `image` reports nothing, because
there is nothing to measure it against.

**The silence was worth closing, and that example is where it was found.** The
ball is a centre vertex plus 8 rim vertices, and the first version placed them
*on* the silhouette — but an octagon's sides pass `R · cos(π/8)` from its centre,
so its whole ink outline between the spokes was not going to be drawn, and every
assertion passed (issue #277). That is why the command above prints 100.00%
rather than the figure it was filed over:
[`gallery/squash`](https://github.com/firejune/rigc/tree/main/gallery/squash)'s
README carries the inradius arithmetic, both coverage readings, and the rim move
that settled it.

**Linked mesh** ([Spine: linked meshes](http://esotericsoftware.com/spine-meshes)) —
a mesh that draws **another mesh's geometry** with **its own art**. It is the type
a skin variant uses: one triangulation and one set of weights, several outfits over
it. Say `type: "linkedmesh"`, or put `source` on a `type: "mesh"` — the format has
both spellings, they share one parser branch, and `source` is what decides between
them (`SkeletonJson.ts:568-569`, `:582`), so rigc reads them the same way.

| Field | Meaning |
| --- | --- |
| `source` | **required.** The **placeholder** of the mesh whose geometry this one draws — the key it is filed under in its skin, not its `name`. A miss is refused naming the skin, the slot and what that slot holds; a `source` that spells the source's `name` instead is that miss, because the runtime looks the source up by skin, slot and key and never by name — measured, it throws `Source mesh not found` |
| `slot` | the slot the source lives in. Default: **this attachment's own slot**. Resolved by name against the rig's slots |
| `skin` | the skin the source lives in. Default: **`default`** — the default skin, *not* the skin this link is written in. Resolved by name |
| `timelines` | default **`true`**: the link plays the source's `deform` keys. `false` makes it its own timeline target, so only keys written against the link move it |
| `name`, `image`, `path`, `width`, `height`, `color` | exactly as on a mesh — the link resolves **its own** region, which is the point of the type |

```json
"skins": {
  "base": { "cloak": { "cloak": { "type": "mesh", "image": "cloak_red.png", "uvs": [], "triangles": [], "weights": [] } } },
  "winter": { "cloak": { "cloak": { "type": "linkedmesh", "image": "cloak_blue.png", "source": "cloak", "skin": "base" } } }
}
```

🚨 **A linked mesh states no geometry of its own, and every geometry key on one is
refused by name.** `uvs`, `triangles`, `vertices`, `weights`, `boneIndexing`,
`hull`, `edges` and `generator` are read by **nothing**: the parser returns from
the `source` branch before `readVertices` (`SkeletonJson.ts:582-586`). Measured on
a forged skeleton — a link declaring 5 uvs, 3 triangles, `hull: 5` and
`edges: [0, 2]` beside a 4-vertex source loaded with the **source's** 8-long
`worldVerticesLength`, 6 triangles, `hullLength` 8 and 10 edges. Nothing the author
wrote reached anything and nothing said so. ⇒ The same fact is held against a
skeleton rigc did **not** write, where the compiler never sees the spec:
`A44_LINKED_MESH_STATES_NO_GEOMETRY_OF_ITS_OWN` (§5.2) names the attachment, the
keys and whose geometry is drawn instead, and `ingest` reports one as
`ATTACHMENT_LINK_GEOMETRY` before dropping it
([INGEST §2.0](INGEST.md)) — [#710](https://github.com/firejune/rigc/issues/710).

🚫 **A chain is refused, and so is a link to itself.** A `source` that names
another linked mesh resolves in the order the file was read: measured through
spine-core, the chained link loaded the full geometry with the source declared
first, and `worldVerticesLength` **0**, 0 triangles and a 0x0 size with the two
keys swapped in the same file — silently, both ways. A construct whose meaning
depends on JSON key order is one rigc will not write. Point `source` at the mesh.

⚠️ **`width`/`height` are emitted and the gate cannot see them.** The runtime
overwrites both with the source's when it resolves the link
(`MeshAttachment.setSourceMesh`; measured: a link stating `99x77` beside a 32x32
source loads as 32x32). They are written because the editor reads them off the
file and because the spec stated them — R1 — and no assertion can check them.

🔸 **`A21_MESH_RIM_PINNED` and `A28_RIBBON_ROWS_SHARE_WEIGHTS` leave a link out**,
for the same reason they leave authored geometry out: the rim and the rows it draws
are its source's and are measured there. `A21` drops it from the set it measures and
**SKIPs by name** — naming the link and its source — when that leaves nothing;
`A28` passes over it. `A04`, `A20` and `A22` read a link exactly as they read any
other mesh, because after the round trip it **is** the source's triangles, weights
and uvs. `A13_MESH_BUDGET` counts it as a mesh of its own: the runtime draws it as
one, so a link in a second slot is a second mesh slot against
`invariants.meshSlots`.

**The three types that carry geometry and no art** — a bounding box, a clipping
polygon and a path. None of them resolves an atlas region, so none of them has an
`image`, a `path` key, a `width`/`height` or uvs, and a skin holding only these
builds an atlas with **no pages** (above). What they do share is one geometry
shape, and it is the mesh's with one field added:

- 🚨 **`vertexCount` is required and has no parser default.** A mesh takes its
  count from `uvs.length`; these have no uvs, so the parser reads
  `map.vertexCount << 1` as the length to expect — and with the field absent that
  is `undefined << 1` = **0**, which sends `readVertices` down the WEIGHTED branch,
  decodes the coordinate list as a weight run, and hands back an attachment with no
  vertices at all. Nothing throws, and none of the three draws a pixel, so nothing
  downstream notices. rigc refuses it by name: `vertexCount is undefined; a polygon
  needs at least 3 vertices, stated outright`.
- **The two encodings are the mesh's own**, traps included: `weights` binds bones
  by NAME and is the form to use; `vertices` is an unweighted `x, y` run when
  `vertices.length === vertexCount * 2` and Spine's index-encoded weighted run
  otherwise, and the second of those needs `"boneIndexing": "raw"` said out loud.
  `A33_VERTEX_ATTACHMENT_GEOMETRY` (§5.2) gates all three types and accepts either
  encoding on each — measured by building both on each of the three.
- 📐 **Which space the numbers are in.** An unweighted `x, y` is in the **slot's
  bone's** local space; a `weights` binding's `x`/`y` is in **that binding's own
  bone's** local space, and the slot's bone plays no part in it. Measured through
  spine-core on a rig where the two are different bones: `(0, 0)`, `(30, 0)`,
  `(30, 20)` written unweighted on a slot whose bone sits at `(-60, 25)` turned
  −21° posed at `(-60.0000, 25.0000)`, `(-31.9926, 14.2490)` and
  `(-24.8252, 32.9206)`, which is that bone's own transform of them; the same three
  points bound by name to a bone at `(110, 70)` turned 37° and scaled `1.3, 0.8`,
  in the very same slot, posed at `(110.0000, 70.0000)`, `(141.1468, 93.4708)` and
  `(131.5177, 106.2490)` — the BOUND bone's transform, to four decimals.
- **A `deform` timeline reaches all three** (§4.11); none of them is drawn, so a
  render can show you nothing about any of them.

**Bounding box** ([Spine: bounding boxes](http://esotericsoftware.com/spine-bounding-boxes)) —
`"type": "boundingbox"`. A polygon the game hit-tests against — a hurt box, a pick
region, a trigger volume — that moves with the skeleton and draws nothing.

| Field | Meaning |
| --- | --- |
| `type` | `"boundingbox"`. **Required**: an omitted `type` is `"region"`, and a region has nowhere to put these keys — measured, the refusal reads `attachment "mask" (region) has 2 keys this compiler does not read: "vertexCount", "vertices"` |
| `name` | as on a region: the runtime's name for the attachment, written only when stated. A polygon resolves no region, so here it is the name and nothing else |
| `vertexCount` | **required**, 3 or more. No default — the paragraph above is why |
| `vertices` | the unweighted `x, y` run, in the slot bone's local space; or the index-encoded weighted run, behind `boneIndexing` |
| `weights` | the by-name form: one entry per vertex, each a list of `{ "bone": …, "x": …, "y": …, "weight": … }`, each pair in that bone's local space. Never beside `vertices` |
| `boneIndexing` | `"name"` (the default) or `"raw"`, which opts a weighted `vertices` run into Spine's index encoding. `"raw"` beside `weights` is refused: `weights` always binds by name |
| `color` | `rrggbbaa`. **No default in the file** — omitted, the parser never calls `setFromString` and the attachment keeps the runtime's own colour. It is an editor affordance, the colour the polygon is drawn in there; rigc emits it verbatim when stated and leaves the key out when not |

**Clipping polygon** ([Spine: clipping](http://esotericsoftware.com/spine-clipping)) —
`"type": "clipping"`. A mask: the polygon clips every slot drawn from the one
carrying it up to and including `end`, so a window, a portal or a wipe is one
attachment rather than a second set of art.

| Field | Meaning |
| --- | --- |
| `type` | `"clipping"`. **Required** |
| `name`, `vertexCount`, `vertices`, `weights`, `boneIndexing`, `color` | exactly as on a bounding box |
| `end` | the last slot the clip applies to, **by name**. Absent is the parser's own encoding for *clip everything after this one*, which is why a typo cannot be told from an omission once the file is loaded: `findSlot` returns null on a miss and the parser assigns that null without a word, so the clip runs to the bottom of the draw order and takes every slot below it with it. rigc refuses a name the rig does not declare — `end names slot "X", which this rig does not declare` — and `A33` refuses it again on a skeleton rigc did not write |
| `convex` | default **false**. True tells the runtime the polygon is convex so it can clip without triangulating it, and a polygon that deforms concave is clipped by its convex hull instead (`ClippingAttachment.convex`). Nothing here checks that the polygon is in fact convex |
| `inverse` | default **false**. True makes everything **outside** the polygon visible instead of everything inside, and inverse clipping is always treated as convex (`ClippingAttachment.inverse`) |

⚠️ **A clipping attachment is refused by the renderer profile and by nothing
else.** `A11_NO_CLIPPING_ATTACHMENTS` (§5.2) fires under `--profile spine-html`
because that renderer skips clipping silently; it is one renderer's policy rather
than anything about the data, and the default `spine` profile builds one.

**Path** ([Spine: paths](http://esotericsoftware.com/spine-paths)) —
`"type": "path"`. The composite cubic Bezier a path **constraint** (§3.5.1) slides
bones along. No runtime draws it, and it deforms with the slot's bone like any
other vertex attachment.

| Field | Meaning |
| --- | --- |
| `type` | `"path"`. **Required** |
| `name`, `vertexCount`, `vertices`, `weights`, `boneIndexing`, `color` | as on a bounding box — except that these vertices are knots **and** their handles, which the count rule below is about |
| `closed` | default **false**. True joins the last knot back to the first |
| `constantSpeed` | default **true** — note the direction. Leaving it out asks for the expensive-and-correct traversal, in which the runtime re-measures the path every frame and `lengths` is never read. `false` makes the runtime trust the emitted `lengths` instead: cheaper, exact only while the path holds its setup shape, and the reason a deformed path wants the default |
| `lengths` | 🚫 **refused by name.** rigc measures the setup length of each curve off the geometry and emits it, the way it measures a region's size off its PNG: `"lengths" is not authored — rigc measures the setup arc length of each curve…`. The field is declared only so the refusal can say that rather than report a misspelt key. What the numbers are — and why *arc length* is the wrong name for them — is §10.6 |

🚨 **`vertexCount` counts knots AND handles, and it has to be a multiple of 3.**
The parser hands `vertexCount << 1` to `readVertices` and then walks the result in
groups of six: the first and last points are the outer control handles of the end
knots and are dropped, leaving a `3K + 1` chain. So an OPEN path of K curves states
`vertexCount = 3(K + 1)`, minimum **6**, and a CLOSED one states `3K`, minimum
**3**. A count that is not a multiple of 3 does not throw —
`Utils.newArray(vertexCount / 3, 0)` accepts a fractional size, the groups of six
then straddle the knots, and the constraint slides bones along a curve nobody drew
— so rigc refuses both shapes: `vertexCount is N, which is not a multiple of 3`
and `vertexCount is N and an open path needs at least 6`.

```json
"track": { "track": { "type": "path", "vertexCount": 9,
  "vertices": [-30, 0, 0, 0, 30, 0, 60, 0, 90, 0, 120, 0, 150, 0, 180, 0, 210, 0] } }
```

Nine points are two curves. The outer handles at `x = -30` and `x = 210` are
dropped, so the chain runs from `x = 0` to `x = 180` and rigc emits
`"lengths": [90, 180]` beside it — measured, not stated. That is the path
§3.5.1's constraint example rides: with `position: 0.25` its `cart` bone poses at
`worldX = 45.000000`.

The generators are `ring`, `ribbon`, `contour` and `grid` (see
[`src/mesh.ts`](../src/mesh.ts)); the first two encode a deformation model rather
than a table of numbers, which is why they are code invoked by data. The last two
are geometry: they pin every vertex to the slot bone and exist to give a
`deform` timeline (§4.12) somewhere to push. A generator
is for a skeleton with **no** manifest; a cut that has one invokes the same
builders through the manifest's `mesh` block.

🚨 **A rig that invokes a generator must declare `invariants.meshSlots` (§3.7).**
Geometry rigc built is geometry rigc will not ship **unmeasured**: a generated
mesh counts against that budget, a rig that declares none has a budget of
**zero**, and the build is refused before the gate —
`1 mesh slot(s) emitted but the rig "hello" allows 0`. Declare `meshTriangles`
beside it: without it `A13_MESH_BUDGET` has nothing to measure against and SKIPs,
and the `MESH` report line has no budget to print. Authored geometry is exempt in
the other direction and for the same reason — rigc did not draw it, so leaving it
unmeasured is the author's call (issue #274).

⭐ **The no-manifest path centres the part window on its own slot bone.** There is
no crop to flip against, so `size` (or, for a contour, the PNG's own size) is
placed with its centre on the bone the slot names — which is also exactly where a
plain region attachment with no `x`/`y` would have drawn it. Measured on a ring, a
ribbon and a moved bone by `CT05` in the selftest (issue #1).

#### `ring` — an aperture that opens inside a pinned seam

**When you need one:** a part with a hole in it that a bone opens and closes — an
eye, a mouth, an iris. The silhouette stays exactly where the art put it and only
the inside moves, which is the one thing a `contour` cannot do and authored
`weights` can only do a vertex at a time.

Three rings and a hub, and every one of them is geometry rigc builds: the part
window edge and the seam contour are pinned to the slot bone at weight 1, and the
inner ring is shared with the control bone by a smoothstep falloff — flat at both
ends, so the deformation dies into the pinned rim instead of creasing against it
([`src/mesh.ts`](../src/mesh.ts)).

```json
"generator": {
  "kind": "ring",
  "hull": [[24, 8], [40, 8], [56, 24], [56, 40], [40, 56], [24, 56], [8, 40], [8, 24]],
  "center": [32, 32],
  "inner": 0.45,
  "size": [64, 64],
  "controls": ["iris_aperture"]
}
```

| Field | Meaning |
| --- | --- |
| `hull` | **required.** The seam contour, in part-local pixels, y down — the closed outline the aperture sits inside. At least 6 points, every one inside the window, and star-shaped about `center` |
| `center` | **required.** The aperture centre, part-local pixels, y down |
| `inner` | **required.** Where the moving ring sits between the centre (`0`) and the hull (`1`), strictly inside that interval. No default: a ring with no number here is refused, not centred |
| `size` | **required.** The part window, `[w, h]` in pixels, which the UVs and the emitted `width`/`height` are taken from |
| `bias` | optional; absent means authority is radial only. `{ "axis_deg": <screen degrees, y down>, "ramp": [d0, d1] }` — a line through `center` at that angle, with control authority 0 on its negative side and 1 on its positive side, smoothstepped across the signed distances `d0 < d1`. It is what lets a mouth open downward with the upper lip left pinned |
| `controls` | **required.** The control bones, by name, at least one. Each must be a bone the rig declares. **More than one splits the ring by angle**, and the angle of each is measured from where the rig put that bone relative to `center` — so the split is a consequence of the skeleton and never a number you write here |

⚠️ **`size` is stated here, not measured.** A `contour` and a `grid` take the
window off the attachment's own `image`; a `ring` and a `ribbon` are built from
the numbers in this block and rigc compares neither to the PNG. The emitted
`width`/`height` are this `size`, so a `size` that is not the art's own scales the
drawing — measured: a 240x240 part declared `"size": [64, 64]` builds green under
`--profile spine-html`. That is R1 rather than a gap: the compiler emits the
number the spec states and does not re-measure a plate to overrule it.

⭐ **Several grips split the ring by where the rig put them, on this route as on
the manifest one.** Each control bone's angle about `center` is measured from its
own rest position — the window is centred on the slot bone (the ⭐ above), so a
bone sitting below the aperture owns the arc below it — and authority is
smoothstepped between the two bones either side of a vertex, so no grip creases
against the next. Measured on a two-control ring whose grips sit 12px above and
below the centre: 25 vertices, both grips bound, and of the 8 shared vertices off
the centre line all 8 take more weight from the grip on their own side. Splitting
**moves** authority rather than adding it: every vertex gives its controls the
same total with one grip, two or three.

⚠️ **This route used to bind only the first name**
([#684](https://github.com/firejune/rigc/issues/684)). It passed no angles at all,
so the split collapsed onto `controls[0]` and the rest of the names reached the
`MESH` line, the bone list and nothing else — and the gate was green, because a
bone no vertex binds is in no weight, no sum and no index. `A20_MESH_WEIGHTS_COHERENT`
now names it, so a ring that declares a grip and does not use it is a failure
rather than a quiet stiffness.

**Stated limits, each a named refusal rather than a mesh that loads wrong:**

| The input | What you get |
| --- | --- |
| fewer than 6 hull points | `hull needs at least 6 points, got 4` |
| `inner` at either end | `inner must be in (0,1), got 1` — at the hull it is the seam, at the centre it is a point |
| a hull point outside the window | `hull point (99,8) is outside the 64x64 part window` |
| a hull the centre cannot see all of | `hull is not star-shaped about the aperture centre; the inner ring would fold` — the inner ring is the hull scaled toward `center`, so an edge hidden from it crosses the rim and renders as folded meat |
| a `bias` ramp that does not increase | `bias ramp must increase, got [16, 4]` |
| a control bone the rig does not declare | `mesh bone "nobody" is not in the rig's bone list` |
| two or more `controls`, one of them ON `center` | `control bone "iris_aperture" sits on the aperture centre, so it has no radial direction` — the position a lone control is supposed to occupy is the one position a split cannot use. With a single control it is never asked, so this refusal cannot fire on one |
| two `controls` at the same angle about `center` | `two control bones share the angle 90 degrees about the aperture centre` — further out is not elsewhere: the arc between them is empty and one of them would bind nothing |

#### `ribbon` — a strip of cross rows riding a bone chain

**When you need one:** a part that hangs and swings off a chain — a tail, a
strap, a lock of hair, a drip. The strip spans the part window and each cross row
blends linearly between the two chain knots it falls between, so the whole part
follows the chain with no weight written by hand.

The entry row is pinned to the slot bone at weight 1, which is what keeps the
strip's origin where it was authored while the rest of it falls; that is the
branch `A21_MESH_RIM_PINNED` measures on a ribbon, and
`A28_RIBBON_ROWS_SHARE_WEIGHTS` is what holds both vertices of a row to the same
blend.

```json
"generator": { "kind": "ribbon", "size": [24, 180], "rows": 7, "chain": ["strap_a", "strap_b", "strap_c"] }
```

| Field | Meaning |
| --- | --- |
| `size` | **required.** The part window, `[w, h]` in pixels; the strip spans it, entry row at the top. Stated rather than measured, exactly as a `ring`'s is |
| `rows` | **required.** How many cross rows, entry row first. A whole number, at least 3; the strip is `2 * (rows - 1)` triangles and `2 * rows` vertices, all of them on the outline |
| `chain` | **required.** The bone chain the strip rides, **root first**, at least one name. The knots sit evenly along the strip, so the chain's order is the order the part falls in |

**Stated limits:**

| The input | What you get |
| --- | --- |
| fewer than 3 rows | `ribbon needs at least 3 rows, got 2` — two rows is one quad and has nothing to bend |
| an empty `chain` | `ribbon needs at least one chain bone, got 0` |
| a chain bone the rig does not declare | `mesh bone "nobody" is not in the rig's bone list` |

#### `contour` — the mesh is the art's own silhouette

**When you need one:** the part's outline is the interesting thing and a
rectangle of region is the wrong shape — a leaf, a cape, a splash, anything whose
quad is mostly transparent pixels the renderer still blends. Or you want real
vertices to push with a `deform` timeline (§4.11) at the places the silhouette
actually is, instead of at four corners.

It takes **no geometry and no size**: the shape is traced off the attachment's own
`image`, so there is no number here that can disagree with the pixels. The rig
header still budgets for it, which is the `invariants` block below and not a
detail of the attachment.

```json
"invariants": { "meshSlots": 1, "meshTriangles": 64 },
"skins": {
  "default": {
    "cape": {
      "cape": {
        "type": "mesh",
        "image": "cape.png",
        "generator": { "kind": "contour", "tolerance": 1.5, "margin": 2, "maxVertices": 48 }
      }
    }
  }
}
```

⭐ **Both keys are the fragment.** Drop the two of them into §1.1's minimal rig in
place of its `skins`, rename its `box` bone and slot to `cape`, put a
transparent-margined `cape.png` in `images/`, and it compiles — `invariants`
included, because without it the generator is refused (issue #274). The
`meshTriangles` figure is invented; pick the one your renderer can afford.

| Field | Meaning |
| --- | --- |
| `tolerance` | **required.** Douglas-Peucker tolerance, in the drawing's pixels — on a packed page that declares a `scale:`, applied as `tolerance × scale` of its texels (§0.2, [#779](https://github.com/firejune/rigc/issues/779)). Bigger spends fewer vertices and cuts more corners |
| `margin` | how far the outline is pushed out past the traced silhouette, in the drawing's pixels (`margin × scale` texels on a `scale:` page). Default `1` |
| `maxVertices` | refuse rather than emit more outline vertices than this — judged on the outline the two distances above ask for, so a finer `scale:` page of the same art needs no bigger budget. Default `64` |
| `alpha` | the alpha at or above which a pixel counts as art, `1`..`255`. Default `1` — any pixel that is not fully transparent |

The numbers above are invented, and the pair that matters is `tolerance` and
`margin`: simplification may bite **`tolerance` pixels into the art**, and the
margin is what pays that back, so **`margin >= tolerance`** is the setting that
survives the coverage check below. `alpha` is the lever for art with a long soft
feather — raise it and the outline hugs the solid core instead of the last
almost-invisible pixel.

**What it does, in order:** trace the alpha mask on the pixel-corner lattice (so
the raw outline encloses every art pixel *whole*), simplify it, push it out by
`margin`, clamp it to the part window, ear-clip it, and then **measure the result
against the mask it came from**. `build` and `explain` print what it measured:

```
  MESH  cape         contour  15 vertices / 13 triangles  (budget 64)  bones=[cape]  attachments=[cape]  covers 100.00% of the art, reaching 3.16px past it
```

The budget in that line is the rig's `invariants.meshTriangles` — `(no budget
declared)` when it declares none, which is the same distinction `A13` SKIPs on. It
used to be the literal `80` whatever the rig said, so the line an author reads and
the assertion that measures could print two different numbers (issue #275). A part
whose outline encloses a hole says so too, because nothing else in the output
moves when one appears:

```
  MESH  flag_b       contour  48 vertices / 46 triangles  (budget 96)  bones=[flag_b]  attachments=[flag_b]  covers 100.00% of the art, reaching 2.00px past it, enclosing 848px of hole
```

🚨 **It is geometry, not a deformation model.** Every vertex is pinned to the slot
bone at weight 1, so a contour mesh at rest draws what the region drew and **no
bone can bend it**. What you gain over a region is a real outline, real triangles
and a `hull` other tools can read; what you do not gain is bone-driven motion —
that is what `ring` is for, or authored `weights` (§3.4) if you have an editor's
auto-weighting to transcribe. `A21_MESH_RIM_PINNED` therefore reads over the whole
mesh rather than a rim prefix, and `A28_RIBBON_ROWS_SHARE_WEIGHTS` **SKIPs** with
"a contour is one silhouette loop" as the reason.

**Stated limits, each a named refusal rather than a mesh that loads wrong:**

| The art | What you get |
| --- | --- |
| every pixel opaque | `every pixel of the 96x64 part reaches alpha 1, so its silhouette IS the part window and a contour mesh of it is a region attachment with extra vertices` |
| two or more islands | `the art is 2 separate islands and one outline can only enclose the largest (529 of 989 px, 53.49%)` — one outline encloses one region; give each island its own slot |
| a **hole** (a donut) | **accepted, and the hole is inside the mesh.** Ear clipping has no bridging step, so the outline is the art's *outer* boundary; those pixels draw nothing (their alpha is still 0) and the extra triangles are the whole cost. `build` and `explain` print the hole in pixels, because `coverage` and `overshoot` are both measured against the FILLED silhouette and neither of them moves when a part gains one |
| a **diagonal pinch** — two parts of the art meeting at one pixel corner | `the alpha silhouette pinches to a single point at pixel corner (2,2) … one outline cannot pass through one point twice` |
| a neck narrower than `margin` | `the outline crosses itself: edge 0 meets edge 3 after a margin of 3px was pushed out of a silhouette narrower than that` |
| more outline than `maxVertices` | `the silhouette simplified to 15 vertices at tolerance 1.5, past the 4 this mesh allows` — refused, never silently decimated |
| a `margin` too small for the `tolerance` | `the mesh covers 91.81% of the art (2936 of 3198 px), under the 99.5% a contour mesh guarantees` |
| any of the three above, on a packed page that declares a `scale:` | `…after a margin of 2px (the drawing's pixels — applied as 1 texel(s) of this page, whose scale: 0.5 makes a texel 2.00px of the drawing) was pushed out…` — the spec's figure, the texels the trace ran it at, and the scale that converted it; a count of the part's cells says `texels` there. A tolerance under one texel of a coarser page keeps its stair steps, as one under a pixel does on the declared page (§0.2) |

That last one is the guarantee: **the emitted triangles cover at least 99.5% of
the art**, measured by rasterising them back over the mask, and a build that would
clip the art is refused rather than shipped. It is not 100% because a
simplification that could never cut a corner would not be one — the figure a
given part actually measures is in the `build`/`explain` line above, and the
selftest's fixture measures 100.000%.

Self-intersection is refused; **holes are not cut out**; and nothing here does
interior/Steiner points, so a contour mesh bends only where its outline has
vertices.

#### `grid` — a lattice over the part window

**When you need one:** the part is a plate whose *surface* moves — a face that
turns, a cloth that ripples — and a `deform` model (§4.12) needs interior
vertices to push. A `contour` gives you the silhouette and nothing inside it;
this gives you columns and rows.

It takes **no geometry and no size**: like a `contour`, the window is the
attachment's own `image`, and every vertex is pinned to the slot bone at weight
1, so an undeformed grid draws exactly what the region drew.

```json
"generator": { "kind": "grid", "us": [0.0235, 0.1471, 0.5, 0.8529, 0.9765],
                               "vs": [0.0263, 0.2632, 0.5, 0.7368, 0.9737] }
```

| Field | Meaning |
| --- | --- |
| `us` / `vs` | column and row positions across the window, `0..1`, ascending, at least two each. **Positions, not a count** |
| `cols` / `rows` | an even division of the whole window instead. Refused beside `us`/`vs` |
| `depth` | a depth map, below — this is the generator it was built for |

⭐ **Positions, because [FACE §4.1](FACE.md) places columns where the drawing
needs them.** The five above are `gallery/portrait`'s own — dense at the
silhouette, sparse across the middle, and not reaching the window edge. A
generator that could only divide evenly would be a step backwards from the table
it replaces, and it does replace it: the selftest builds that exact mesh from
those five numbers and requires it to come out identical to the 25 vertex pairs
and 32 triangles the example shipped by hand.

🚨 **The reason to generate this at all is the hull.** Spine's `hull` is a
**count** — the first `hull` entries of the vertex list are the outline — so the
perimeter must be listed first and in walk order (top row, right column, bottom
row, left column), interior after. A hand-numbered grid written a row at a time
puts interior vertices in the hull, and the mesh loads, draws and deforms wrong
with nothing anywhere to say so. The generator satisfies that by construction
rather than being checked afterwards.

| The input | What you get |
| --- | --- |
| positions **and** a count | `states both positions ("us"/"vs") and a count ("cols"/"rows") … Drop one` |
| neither | `A lattice is not a default` |
| one axis only | `a lattice needs both axes` |
| positions that do not ascend | `"us" is not ascending: [1]=0.6 and [2]=0.6` — equal neighbours put two vertices in one place and collapse a row of triangles to zero area |
| a position outside `0..1` | `positions are fractions of the part window, 0..1` |
| `cols` or `rows` under 2 | `it is a whole number of at least 2` |

#### `depth` — give every vertex its own z, instead of one cylinder radius

**On a `contour` or a `grid`.** A grid is the one it was built for: a turn
needs interior vertices to move, and a contour has none of its own.

A `yaw` or `pitch` key (§4.12) turns a part by treating it as painted on a
cylinder: a vertex `u` off the axis gets `z = √(radius² − u²)`. That is the right
model for a fringe or a plate that really does bend like a barrel, and the wrong
one for a face — a nose is not on the skull's cylinder and an ear is behind it,
and no single radius puts both where they are.

Name a **depth map** on the generator and every vertex gets its own `z`, sampled
off a greyscale sheet in the part's own pixel grid:

```json
"generator": {
  "kind": "contour", "tolerance": 1.5, "margin": 2,
  "depth": { "image": "face_depth.png", "near": "white", "zScale": 40 }
}
```

| Field | Meaning |
| --- | --- |
| `image` | **required.** The sheet, relative to the rig's `images` directory, and the **same pixel size as this attachment's `image`**. It is not packed into the atlas — it is a measurement rigc reads at compile time, not art anything draws. Under `--atlas-in` that is still the drawing's size, on a page that declares a `scale:` too: the sheet is read at each vertex's texel position over the scale the atlas states, so one sheet serves the loose parts and every pack of them ([#762](https://github.com/firejune/rigc/issues/762)) |
| `near` | **required.** `"white"` or `"black"` — which end of the range is closest to the viewer. Stated rather than defaulted: both conventions are in use, and a sheet read with the wrong one turns the part inside out with every gate still green |
| `zScale` | **required.** How many world units the map's full range spans, in the attachment's own units — the number `radius` used to carry. 8 bits of level say nothing about scale, so this is authored, never measured |
| `gamma`, `contrast`, `bias` | the tone curve applied to the nearness, defaults `1` / `1` / `0`. State them when a consumer's own renderer curves the same sheet, so the mesh and that renderer describe one surface |

The order is fixed and it matters, because every step is a place two
implementations can silently disagree: **bilinear sample of the raw level** (at
pixel centres, which is what a GPU's linear filter does), then `near`, then the
curve clamped back into 0..1, then `zScale`. Naming a map changes no emitted byte
on its own — a `yaw` or `pitch` key has to ask for it with `"depth": true`.

`build` and `explain` report the sheet's digest (over the levels, so a re-encode
of the same map reads the same) and the `z` range actually sampled, which is the
number that says whether the map covers the part or a corner of it.

⭐ **And the TURN CEILING — the angle to write on the key, before you write it.**

```
  MESH  face   grid  1089 vertices / 2048 triangles  (budget 3000)  bones=[face]
        depth "face_depth.png" f552a2f50d21 near=white zScale=60 z=[0, 60]
        turn ceiling  yaw +31.41° / -32.01°   pitch +32.01° / -31.41°
          1st pct     yaw +31.55° x1.004 of 1004 / -32.10° x1.003 of 1044   pitch +32.10° x1.003 of 1044 / -31.55° x1.004 of 1004
                      first to fold: yaw + at 31.41°, triangle 960 [113,112,593], the sheet steps 12.52 level(s) across it, which is 0.049 of the range this mesh sampled
```

Past that angle a triangle turns inside out and `A39` refuses the build by name.
The loop this replaces is *pick an angle, build, read the refusal, guess again*.

#### Is the ceiling describing the form, or the sheet's grain?

The lines under the ceiling answer that, and they are **reports only** — nothing
in them refuses a build or moves a ceiling
([#412](https://github.com/firejune/rigc/issues/412),
[#448](https://github.com/firejune/rigc/issues/448)).

The ceiling is the **minimum** of the per-triangle fold angles, and a minimum
cannot say whether it is the floor of a band or one bad pixel. Measured: a clean
8-bit sheet at 4,225 vertices reports **64.58°**; move **one texel of 160,000**
by 245 levels and the same sheet reports **6.08°** — and `A39` refuses at both,
to 0°. The number is not lying. 99 % of that mesh still turns to 64.80° and one
triangle does not, and nothing on the first line says so.

| the figure | how to read it |
| --- | --- |
| `x1.003` — the **1st percentile over the ceiling** | near 1 means a *band* of the mesh reaches the limit together, and near 10 means **one triangle** does, which is what a bad texel looks like. The clean and stray sheets above read `x1.003` and `x10.652`. ⚠️ A band is **not** sufficient evidence of a form, which is the third case: **an outline is a band**. A depth sheet estimated over cut-out art has a cliff along the whole silhouette, so its ceiling is a band too and this figure reads 1.02–2.17 — healthy — on a mesh whose angle means nothing. The row below is what tells those two apart |
| `of 1004` — the **population** that percentile came out of | it is the nearest rank, so below **51** folding triangles there is no percentile to take and the line says `unranked of 36` instead of printing the minimum twice. Just over 51 it is the *second*-smallest angle, and a limit two triangles share is not yet a band |
| `12.52 level(s)` — the **depth step across the triangle that folds first** | how much of the sheet's 0–255 range that triangle actually read. **Below about 3 the ceiling is quantisation rather than form**, and at exactly 1 it is `atan(255·h / zScale)` for cell size `h` — arithmetic about the encoding, with no form left in it at any density |
| `which is 0.049 of the range this mesh sampled` — the **same step, over the range this mesh sampled** | how much of everything the sheet said across the whole part it said across that one triangle. A form's slope is bounded, so this **halves every time you double the lattice** while the angle settles. Near 1 it is a **cliff**: a step with no slope in it, whose angle halves with the lattice instead and describes nothing at any density. Measured: `gallery/look` reads 0.112 and 0.468, a synthetic raised cosine 0.394 falling to 0.027 under refinement, the same cosine with one planted cliff a flat 0.50, and estimated depth sheets over cut-out art **0.92–0.99** |
| `+none` | on the ceiling line, nothing folds on that side at all, at any angle. On the percentile line it is the same statement — there is no population, because there is nothing to take a percentile of |

A real one rather than the illustration above — `gallery/look`, whose two meshes
happen to print two of the three spellings:

```bash
bun cli.ts build --rig gallery/look/rig.json \
                 --motion gallery/look/motion.json \
                 --images gallery/look/parts --out /tmp/look
```

```
  MESH  head         grid     189 vertices / 320 triangles  (budget 320)  bones=[head]  attachments=[head]
        depth "face_depth.png" bf156ea0cfc970a3 near=white zScale=194 z=[0, 194]
        80 of 189 vertices sample a texel the part image does not draw — their z is the sheet's reading of somewhere the part is not
        turn ceiling  yaw +19.32° / -19.32°   pitch +22.92° / -26.94°
          1st pct     yaw +19.32° x1.000 of 80 / -19.32° x1.000 of 80   pitch +22.92° x1.000 of 102 / -26.94° x1.000 of 130
                      first to fold: yaw + at 19.32°, triangle 174 [119,138,139], the sheet steps 28.50 level(s) across it, which is 0.112 of the range this mesh sampled
  MESH  hair_lock_l  grid     39 vertices / 48 triangles  (budget 320)  bones=[lock_l]  attachments=[hair_lock_l]
        depth "lock_l_depth.png" 0c4eaeb36b7c5cac near=white zScale=64 z=[22.086275, 63.87451]
        32 of 39 vertices sample a texel the part image does not draw — their z is the sheet's reading of somewhere the part is not
        turn ceiling  yaw +17.04° / -45.80°   pitch +none / -none
          1st pct     yaw +unranked of 12 / -unranked of 36   pitch +none / -none
                      first to fold: yaw + at 17.04°, triangle 2 [1,28,29], the sheet steps 78.00 level(s) across it, which is 0.468 of the range this mesh sampled
```

⭐ Both of those sheets are **form**, and the figures say so from opposite ends:
the head's 320 triangles put the percentile exactly on the ceiling, and the
lock's 48 are too few to rank at all — but at 28.50 and 78.00 levels across the
folding triangle, neither ceiling is anywhere near the encoding, and at 0.112
and 0.468 of their own range neither step is a cliff.

🔸 The line under each `depth "…"` is the other question, and it is not about
the ceiling. A `grid` spans the whole part window and a head is not a rectangle, so
some of the lattice lands where `head.png` draws nothing and takes its depth
from the sheet out there. That is a **count and not a complaint** — read it
against the mesh: 80 of 189 is the border of a lattice over a cut-out and the
ceiling is still a form, while a count approaching the whole mesh with a step
share near 1 beside it is a mesh reading background.

⇒ **A small ceiling with a ratio near 1, a step well above 3 and a step share
well under 1 is a steep surface: flatten the map.** A small ceiling with a large
ratio, or with a step near 1, is a *sheet* problem: the grain, the 8-bit
rounding, or a stray pixel. A small ceiling with a step share **near 1** is
neither — it is a **discontinuity**, and no angle is the right one to quote for
it. [`docs/FACE.md` §2.2](FACE.md) has the amplitudes, what each one costs, and
why flattening does not apply to the third case.

🚨 **How to tell a discontinuity from a steep surface in one move: refine the
lattice and build again.** A form's ceiling settles and its step share halves; a
cliff's ceiling **halves** and its step share does not move. Measured on a
synthetic raised cosine against the same cosine with one column of cliff planted
in it, over three doublings: the form goes 0.358 → 0.195 → 0.100 while its
ceiling moves 41.99° → 39.59° → 38.84°, and the cliff goes 0.460 → 0.489 → 0.497
while its ceiling goes 37.07° → 18.59° → 9.24°. The second one is not converging
on anything.

⛔ **rigc will not filter the sheet for you, and you should not want it to.** A
smoothed measurement would describe a surface the deform key is not built from:
the mesh still samples the raw sheet, `A39` still refuses at the raw angle, and
the report and the gate would part company. The compiler never invents a value
that is not in the spec — the fix is an edit to the map.

⭐ **Three ways to live with the ceiling**, and the third is the one a face
actually uses: flatten the depth map, stay inside the angle, or **take the part
off the screen before it gets there** — fade the slot to alpha 0 (`rgba`, §4.4) or
swap the attachment away, as the far cheek or ear does while the head turns. That
third one is measured rather than declared: a deform key whose slot draws no
pixels at that key's own time is passed over by name, with the reason on the
stats line and in the `DEFORM` block
([#401](https://github.com/firejune/rigc/issues/401)). **Alpha exactly 0** — a
part faded halfway is still refused, and the alpha is in the message.

🚨 **Land the alpha-0 key *before* the folding key, not on it.** The gate measures
**keys**, and the geometry between two keys is interpolated: on the turn probe,
with the fade ending exactly on a 40° key, 8 triangles are already reversed at
`t=0.4` where the slot is still drawing at **alpha 0.20** — and no key is
measured there, so nothing says so. Fade out over the run *up to* the angle you
cannot take, and the keys that fold are the ones that draw nothing.

The arithmetic is exact and worth knowing, because it tells you what to change.
A `yaw` sends each vertex to `x' = u·cos t − z·sin t`, so a triangle's area is
`A₀·cos t − A_yaw·sin t` where `A_yaw` is the same area with **z substituted for
u** — and it reaches zero at `tan t = A₀/A_yaw`. Three consequences:

- ⚠️ **The ceiling is a property of the SHEET, not of the mesh.** Over a smooth
  map the limit approaches `1 / max|dz/du|`, the reciprocal of its steepest
  slope, with no mesh term in it. Refining the lattice does not lower the angle
  — it finds slopes that were always there. So a ceiling you cannot live with is
  fixed by editing the depth map, not by meshing differently:
  [`docs/FACE.md` §2.2](FACE.md) has the measured ladder and the rule.
- **The four numbers are four different answers**, each from its own triangle.
  A part that turns 30° left and 18° right is ordinary, not an anomaly.
- **`none` means no gradient on that axis**, and is a different statement from a
  large number. A sheet varying linearly along one axis cannot fold the other at
  *any* angle — `A_pitch` is then identically zero — so a linear ramp reports a
  yaw ceiling and `pitch +none / -none`.

⛔ It is a **report and never a refusal**. `A39` owns the refusal, from the
artifact and through the runtime; a second wall here would be the compiler
inventing a policy out of a measurement. What holds the two together is a
control: `TC01` requires this number to be the angle `A39` actually fires at, on
the triangle `A39` actually names, to 0.01°.

🚨 **The one that will catch you: the sheet has to cover the mesh, and usually
it does not.** A contour mesh puts every vertex *on* the silhouette and pushes it
`margin` pixels outside; a grid spans the whole window, corners included. A depth
sheet is usually cut to the art's own alpha, so both reach past it — and a naive
sample gives those vertices the background depth and folds them away from the
turn, with correct arithmetic and plausible numbers all the way down. rigc
refuses it instead:

| The input | What you get |
| --- | --- |
| a sheet cut to the art's alpha, on a **contour** | `does not cover 12 of the mesh's 12 vertices … A contour mesh puts every vertex ON the silhouette and pushes it out by the margin … Dilate the sheet past the mesh margin, or lower the margin.` |
| a sheet cut to the art's alpha, on a **grid** | `does not cover 36 of the mesh's 81 vertices … A grid spans the whole part window, corners included … Dilate the sheet to the window, or state "us"/"vs" that keep the lattice inside the art.` — the two topologies run out of sheet for different reasons, and the message says which |
| a sheet that is not the part's size | `the depth map … is 32x32 and the part is 64x64. A depth map is sampled in the part's own pixel grid` |
| a sheet at the page's texel size, on a page that declares a `scale:` | `the depth map "lattice_texels.png" is 48x32 and the part is a 96x64 drawing — 48x32 texels on a page that declares scale: 0.5, which makes a texel 2px of the drawing. … so the sheet is 96x64, the size of the loose art, whatever the page holds.` — the part's own pixel grid is the drawing's on every route, and the message names the ratio and all three sizes, because the drawing's is in neither file |
| a sheet cut to the art, on a `scale:` page | the coverage refusal above, with the vertex's position in the page's texels **and** `pixel (x, y) of the drawing-sized sheet` — the pixel of the file you made |
| a colour sheet | `the depth map … is not greyscale — pixel (0, 0) is rgb(10, 200, 10)` |
| `zScale` at or below 0 | `it is how many units the map's full range spans, so a positive number. To put the near end at the back, say "near": "black"` |
| `gamma` or `contrast` at or below 0 | `collapses the range onto the midpoint … so the map would describe a flat part` |
| a `near` that is neither | `it is "white" or "black"` |

A sheet that is **opaque everywhere** — a full-frame render with the background
in it, which is what monocular depth estimation produces — covers its whole grid
by construction, so the coverage refusal has nothing to hold it to and skips.
That is right: a full-frame sheet is a legitimate statement and rigc has no
authority to guess an input away. But the defect the refusal exists to catch is
still reachable in that encoding, so the report counts it instead
([#449](https://github.com/firejune/rigc/issues/449)):

```
        80 of 189 vertices sample a texel the part image does not draw — their z is the sheet's reading of somewhere the part is not
```

⚠️ **The reported range is NOT where this shows up**, and this guide said it was
until it was measured. A background level is a legitimate depth value, so a map
half of which is background reports exactly as full a range as one that is all
subject: on the measured build, `z=[0, 223.97]` of a stated 224 — healthy — with
54 % of the mesh reading background. "Covers its whole grid" is true and about
the wrong grid; the question was never coverage of the *sheet*, it was whether
the mesh is sampling **art**.

| The input | What you get |
| --- | --- |
| a sheet cut to the art's alpha, over a mesh that reaches past it | **refused** — `does not cover N of the mesh's V vertices`, with the fix for your topology named |
| the same field stored opaque everywhere, over the same mesh | **compiled**, with `N of V vertices sample a texel the part image does not draw` in the report. The same N |
| a mesh every one of whose vertices sits on drawn art | nothing — no line, and no refusal |

🔸 It is a raw count with **no reach subtracted from it**, so a `contour` mesh
reports most or all of its vertices: its outline is pushed `margin` pixels
outside the silhouette by design, and out there the part draws nothing.
Discounting the margin would mean borrowing a number authored for the trace to
mean "close enough" for the sheet, and rigc does not invent tolerances.

⭐ **So the line says why instead**, because rigc built that outline and knows
what it is:

```
        15 of 15 vertices sample a texel the part image does not draw — a contour's vertices are all traced outline, pushed out by the margin, so this is the topology and not the sheet
```

The attribution is on a `contour` and **nowhere else**. A `grid`'s border is
where your `us`/`vs` put it, not where a margin did, so the same sentence there
would be a lie and the count stands alone. What that leaves true either way: the
rim's depth really did come from off the art, which is harmless on a sheet
dilated past the margin and is the whole failure on a full-frame estimate.

##### `soft` — which part is soft, and which bone carries it

A mesh can say **which vertices are soft**, so a `physics` constraint (§3.5) on
their bone answers an impact over exactly that region — a chest, a cheek, a
hanging sleeve.

```json
"generator": {
  "kind": "grid", "cols": 9, "rows": 9,
  "depth": { "image": "face_depth.png", "near": "white", "zScale": 40 },
  "soft":  { "bone": "cheek_wobble", "mask": "cheek_soft.png" }
}
```

| Field | Meaning |
| --- | --- |
| `bone` | **required.** The bone the region is carried by. It has to already exist — a bone a physics constraint targets is part of the skeleton, not a side effect of a mesh |
| `mask` | **required.** A greyscale sheet in the part's own pixel grid: the level IS the weight, black still and white fully carried, sampled at each vertex. Alpha is not read — a transparent pixel is black. The grid is the drawing's, as for a depth map: on a `scale:` page the mask is still the art's size ([#762](https://github.com/firejune/rigc/issues/762)) |

The remainder always stays on the slot bone, so every vertex closes at 1 by
construction rather than by `A20` catching it later. `build` and `explain` report
the mask's digest, how many vertices were carried outright and how many landed in
the painted falloff.

🚨 **Why a painted mask and not a depth threshold.** rigc tried the threshold —
"the near part wobbles" — for exactly one day. It is wrong, and instructively so:
**softness and prominence are different properties of a drawing.** The most
prominent thing on a face is the nose, and a nose does not wobble. A threshold
produced a region that was plausible, gated green and carried the wrong pixels.
It also claimed something untrue — "no mask painted" — while the renderer this
was modelled on had a hand-painted spring mask all along. rigc does not get to
delete an input by guessing it.

⭐ The falloff is painted for the same reason. A `feather` parameter would be
rigc guessing the shape of something you can simply draw.

**`A21_MESH_RIM_PINNED` splits on this rather than being relaxed.** A wobbling
silhouette is *supposed* to move; the invariant is that nothing else does. Every
vertex must be pinned to the slot bone or shared between it and the one declared
bone, must close at 1, and at least one must actually be carried.

| The input | What you get |
| --- | --- |
| a bone the rig does not declare | `names bone "x", which this rig does not declare … a bone a physics constraint has to target is part of the skeleton` |
| the slot's own bone | `moves nothing — a soft region needs a bone that can move independently` |
| a mask that is black everywhere | `carries no vertex of this mesh — every one of its 49 vertices samples black` |
| a colour mask | `is not greyscale — pixel (0, 0) is rgb(10, 200, 10)` |
| a mask that is not the part's size | `is 48x32 and the part is 96x64` — on a `scale:` page, `and the part is a 96x64 drawing — 48x32 texels on a page that declares scale: 0.5` |
| a mask that is not on disk | `the soft mask "x.png" is not at …` |

⭐ **One depth pass buys both, on one part.** A carried mesh has two bones on the
vertices in the mask's falloff, and a `transform` key (§4.12) used to be refused
on any attachment that did — so the **angle** a raised surface turns through and
the **impact** a soft one answers had to sit on separate slots. Since
[#389](https://github.com/firejune/rigc/issues/389) they do not: the model is
evaluated at each vertex's setup world position and pushed into every influence
through that bone's own inverse. `SF03` is the case that measures the
combination. ⚠️ Read §4.11.1 before you add a mask to a part that already turns:
past one bone the model's own coordinates are **world** ones, so `radius` and
`about` change units.
#### 3.4.1 A skin that switches bones and constraints on

**When you need one:** a skin that is more than a change of art — a variant with an
extra bone (a pauldron, a tail, a hat with its own physics), or one where a
constraint should only run while that skin is applied.

A skin entry has two spellings. The short one is `slotName → placeholder →
attachment`, above. The long one puts that table under `attachments` and adds the
lists:

```json
"skins": {
  "default": {
    "attachments": {
      "torso": { "torso": { "image": "torso.png" } }
    }
  },
  "armoured": {
    "attachments": {
      "torso": { "torso_armoured": { "image": "torso_armoured.png" } }
    },
    "bones": ["pauldron"],
    "ik": ["pauldron-ik"]
  }
}
```

| Field | Meaning |
| --- | --- |
| `attachments` | the short form's whole table, moved one level down |
| `bones` | bone names this skin activates |
| `ik`, `transform`, `path`, `physics`, `slider` | constraint names this skin activates, **still split per type** even though the top-level `constraints` array is unified |

⭐ **The list is half a switch, and the other half is `skin: true` on the member.**
A bone's `skin: true` and a constraint's `skin: true` set `skinRequired`, and
`Skeleton.updateCache` starts every `skinRequired` object **inactive**, turning it
on only for the skin that names it (a listed bone activates its whole ancestor
chain with it). So the two fields only mean anything together, and either one alone
is dead data in silence:

- listed **without** `skin: true` — the bone poses under every skin, the constraint
  runs under every skin, and the list changes nothing at all;
- `skin: true` **listed nowhere** — the bone never poses and the constraint never
  runs, under any skin there is.

rigc refuses both halves by name, and `A38_SKIN_MEMBERS_ARE_SKIN_REQUIRED` checks
the artifact for them.

⭐ **A bone or a constraint may be listed by more than one skin**, and each list
is emitted as written: two mutually exclusive variants of one body region both
activating the bone they switch on is the ordinary case. At runtime it is active
while **the skin being worn** lists it — `Skeleton.updateCache` walks that skin's
`bones` and turns each one on, along with its whole ancestor chain — so a bone two
skins name poses under either of them and under neither of the rest. A consumer
that combines the two with `Skin.addSkin` gets it once; the runtime deduplicates
by object identity.

⚠️ **The worn skin, and only the worn skin — including `default`.** The
default-skin fallback is about *art*: `getAttachment` looks in the current skin
and then in `SkeletonData.defaultSkin`, and `updateCache` does no such thing. So a
`skin: true` bone that only the `default` skin lists is **inactive under every
other skin** and inactive with no skin set. Listing it there to mean "always on"
gets the opposite; leave the flag off instead, which is what "active under every
skin" is spelled as.

⚠️ **The two spellings are told apart by these seven keys** — `attachments`,
`bones`, `ik`, `transform`, `path`, `physics`, `slider` — so a skin that uses any of
them is the long form and every one of its keys must be one of them. A slot left
beside them is refused rather than ignored (an ignored slot is an attachment that
vanishes), and a rig with a *slot* of one of those names is refused too, because
there the two forms are genuinely ambiguous. Rename the slot.

#### 3.4.2 Two skins, one placeholder — and the `name` you may state

Two skins putting different art under one placeholder is what a skin is *for*. Each
entry is its own attachment, filed under that placeholder in its own skin, and with
no `name` field the runtime names every one of them by the placeholder
(`getValue(map, "name", placeholder)`, `SkeletonJson.js:526`). That is legal Spine
data, and it is the shape the editor exports: rigc emits it exactly as you wrote it.

```json
"skins": {
  "default": { "block": { "block": { "image": "block.png" } } },
  "base":    { "patch": { "patch": { "image": "patch_a.png" } } },
  "zulu":    { "patch": { "patch": { "image": "patch_b.png", "x": 4 } } }
}
```

emits two `patch` attachments in slot `patch`, one per skin, each with the `path` its
image gives it (`patch_a`, `patch_b`) and **no `name`** — both answer to `patch` at
runtime, and each is the one its skin shows.

🔑 **State a `name` when the attachment's own name is not its placeholder.** A
transcription of an export that carries one — `ingest` writes it for you — or any
rig whose consumer reads `slot.attachment.name`. It is written verbatim, and `path`
defaults to it, so an image named after it needs no `path`:

```json
"base": { "patch": { "patch": { "name": "patch-base", "image": "patch-base.png" } } }
```

emits `"name": "patch-base"` first and no `path`, and the runtime draws region
`patch-base` for an attachment it calls `patch-base`, filed under `patch`.

🔬 **Until [#796](https://github.com/firejune/rigc/issues/796) rigc composed a name
here, and the reason it did was measured wrong.**
[#541](https://github.com/firejune/rigc/issues/541) read the editor's refusal of a
four-skin rig — `Multiple attachments have the same name: patch patch` — as "one
name over several attachments, because a linked mesh resolves its parent by name",
and [#552](https://github.com/firejune/rigc/issues/552) wrote
`"<skin>/<placeholder>"` on every contested entry. Both halves fail a measurement:

- **A linked mesh finds its source by skin, slot and KEY.** Through spine-core
  4.3.13, two skins each fill `C` with a different mesh and no `name`, both load
  named `C`, and a link with `source: "C"` binds the mesh of the skin its own
  `skin` names. A `source` that spells a source's `name` instead throws
  `Source mesh not found` — which rigc refuses by name before that (§3.4, *Linked
  mesh*).
- **The editor imports the uncomposed shape.** A production rig whose placeholders
  are each filled by two named skins, meshes and linked meshes among them, imported
  through Spine 4.3.26 with every composed name stripped. It is the file that editor
  exported.

What #541 had bisected was a rig whose **default** skin filled the contested
placeholder beside the named ones — its smallest refusing variant was `default` plus
one named skin — and that shape is refused on measurements of its own, below. The
composition renamed every contested attachment of every multi-skin export at
runtime, which `slot.attachment.name` shows a consumer and no gate could see; `diff`
now reads it as `attachments.runtime_name`.

🚨 **Every skin that shares a placeholder has to be a named one — the default
skin may not be among them, and rigc refuses the rig if it is.** That is not a
style rule; it is the editor's model, and two round trips through Spine
**4.3.26** established it by ruling out both of the only two spellings there are
([#567](https://github.com/firejune/rigc/issues/567)):

- **Give the default skin's entry a name of its own** (`"name": "default/patch"`)
  and the import succeeds — then the export comes back with that name as the
  JSON **key** (`"default/patch": { … }`, the `name` field gone), because the
  editor's default skin holds no skin placeholders: an attachment there hangs on
  the slot and is known by its name alone. The slot's setup `attachment: "patch"`
  now names a key the default skin does not have, so the default skin **draws
  nothing** — `diff` read `attachments.names 3/5`, `check` read 98.52 mean MAE
  with `drewSlots: 0` on that chain, and `validate --profile spine` stayed green
  throughout.
- **Leave it as its placeholder** (no `name`, which is the obvious repair) and
  the editor **refuses the import**:

  ```
  ERROR: Unable to import skeleton.
  Cause: [error] Error reading attachment: mike/patch (nSX)
  Cause: [error] Multiple attachments have the same name:
  patch
  patch
  ```

  In one slot, a default-skin attachment name and a named skin's placeholder name
  are the same namespace, and both are `patch`.

⇒ **The rule: move the shared art into a named skin.** Call it `base`. Every
filler of that placeholder is then a named skin, which is the shape the editor
holds. Stating a `name` on the default skin's entry does not lift the refusal: that
is the first of the two spellings above.

What to know about it, and nothing to author:

- **The renderer accepts this shape too, and that is measured rather than
  assumed.** `spine-html@0.4.1` resolves a part in two steps and neither one
  reads a placeholder or an attachment name: `DomTexture.js:78,102` builds its
  image map with `put(atlasRegion.name, …)` over every region of the atlas, and
  `SpineHtmlRenderer.js:172` reads it back as
  `const regionImage = region && this.regionImages.get(region.name)`, where
  `region` came off the attachment — which `AtlasAttachmentLoader` resolved
  through `path`. Every published version of that renderer keys the same way.
  ⚠️ `A08` used to carry a `--profile spine-html` clause requiring a
  placeholder to be spelled exactly like the region it resolves to, which made
  this shape and a green `spine-html` **mutually exclusive** from
  [#567](https://github.com/firejune/rigc/issues/567) onwards; the first
  production rig with named skins hit it three times. That clause is retired —
  restated as the join the renderer actually performs it was a tautology over
  the resolve check beside it
  ([#574](https://github.com/firejune/rigc/issues/574)).
- **A stated `name` with no `path` resolves the region the name spells.** `path`
  defaults to the attachment's **name**, not to its placeholder, so an entry naming
  `patch-base` and drawing `patch_a.png` needs a `path` — and gets one, because the
  image basename differs from the name. `A08_REGION_NAMES_MATCH_ATTACHMENTS` names
  the skin, the slot, the placeholder and the path if the region is not there
  ([#589](https://github.com/firejune/rigc/issues/589)).
- **Each skin's art is measured and atlased on its own.** The example above points
  the two skins at two PNGs, so there are two regions, each attachment's `path`
  resolving to the file that attachment named and its `width`/`height` measured off
  that file. Until [#555](https://github.com/firejune/rigc/issues/555) only the
  first skin's PNG was ever opened, and the second skin's art reached neither the
  atlas nor the measurement — so name the two files **distinctly**, because the
  region name is the basename and `a/patch.png` beside `b/patch.png` is refused
  (R5).

⚠️ **Nothing measured says the editor wants names unique within a slot.**
`spineboy-pro.json`, which the editor wrote, gives the name `head` to a region in
slot `head` and to a bounding box in slot `head-bb`, and reuses `hoverglow-small`
across eight slots; the production rig above holds same-named attachments in one
slot across its named skins. The one refusal the editor was measured making is the
default-skin share, and that is the rule rigc enforces.

🚨 **Once a rig has named skins, no instrument here can see them until you say
which one** ([#571](https://github.com/firejune/rigc/issues/571)). `render` and
`check` set no skin unless told to, so every slot resolves through the *default*
skin alone and the art you just moved into `base`, `zulu` and `mike` draws
nothing at all. `check` then compares blank against blank and reports a perfect
`0.0000` — about the very placeholder this subsection is about. Pass
`--skin <name>` to both, once per skin (**§9**); `tools/editor_roundtrip.ts`
loops over every skin the build declares for the same reason.

#### 3.4.3 `sequence` — a numbered image series on one attachment

A region, a mesh or a linked mesh can draw one of a **series** of atlas regions
instead of one: a flame, a blink, a spinning coin. The attachment says how many
frames there are and how they are named, and a `sequence` timeline (§4.13) says
which one shows. The format's own block, spelled as the file spells it
(`readSequence`, `SkeletonJson.js:641-649`):

| Field | Meaning |
| --- | --- |
| `count` | how many frames. **Required** — the parser's default is 0, and a series of no frames loads holding no region and draws nothing, without an error |
| `start` | the number the first frame's name carries. Parser default 1 |
| `digits` | zero-pad the frame number to at least this many digits. Parser default 0 (no padding) |
| `setup` | the frame the setup pose shows, 0-based. Parser default 0. ⚠️ Spelled `setup`, as the file spells it — `setupIndex` is the runtime's field name and is refused as a key this compiler does not read |

```json
"glint": { "glint": { "path": "glint_", "sequence": { "count": 4, "start": 1, "digits": 4 } } }
```

Frame `i` is the atlas region **`<stem><start + i>`**, the number left-padded with
zeros to `digits` (`Sequence.getPath`) — so the four frames above are `glint_0001`
to `glint_0004`. The stem is `path`, or the placeholder when no `path` is stated
(`path` defaults to the attachment's name, exactly as for one region). Each frame is
resolved **by name**: on the loose route it is the PNG `<images>/<frame>.png`, and
under `--atlas-in` it is the pack's region of that name. A region name may carry a
folder — an editor's `fx/flame_0001` is `images/fx/flame_0001.png` — and it is the
full name that is looked up.

🚫 **A missing frame is refused by name, with its number and the name looked for** —
the compiler never draws one frame in place of another:

```
skin "default" slot "glint" attachment "glint": sequence frame 4 of 5 (number 5) is the region "glint_0005", and there is no PNG for it at …/glint_0005.png
```

The loader's own miss would be `Region not found in atlas: glint_0005 (attachment:
glint)`, which says neither that the region was a frame nor of which series.

⚠️ **The rest of what is refused**, each a series the parser would load as something
other than what was written (measured on spine-core 4.3.13,
[#729](https://github.com/firejune/rigc/issues/729)):

- a `setup` at or past `count` — `Sequence.resolveIndex` clamps it to the last frame
  (`setup: 7` on four frames showed frame 4);
- a fractional `count`, `start`, `digits` or `setup` — `start: 1.5` would ask the
  atlas for `glint_1.5`;
- an `image` beside `sequence` — one file names one region, and the series names
  `count` of them;
- a `generator` beside it on a mesh — a generator traces one plate, and which frame
  it should trace is not something the spec says. Author the geometry; every frame
  shares it;
- a `sequence` on a `boundingbox`, `clipping` or `path` — the parser reads the key
  only on the three kinds that draw a region, so it would be dropped in silence. The
  refusal names region, mesh and linkedmesh.

`width` and `height` are the attachment's one size, every frame drawn into it. The
frames **may differ in size**: the runtime scales each frame's region into the
attachment's size (`RegionAttachment.computeUVs`, `width / region.originalWidth`), so a
stated size is emitted as stated and compared with no frame, on the loose route and
under `--atlas-in` alike. That is what an editor exports for a series that mixes image
sizes — the setup frame's size, the other frames as they are
([#795](https://github.com/firejune/rigc/issues/795)). Omit them and rigc takes the
frames' size — **only when every frame measures the same**; frames of different sizes
are refused until you state the size, because picking one of them would be the
compiler choosing a value. ⚠️ One region is different: its `width` is its image's size
in every editor export, so under `--atlas-in` a stated size that disagrees with its
packed region is still refused.
`A46_SEQUENCE_ATTACHMENTS_SHOW_THE_FRAME_THE_FILE_STATES` (§5.2) holds the block and
every frame the timelines show against the file.

### 3.5 `constraints` — 4.3's single typed array

Spine 4.3 folds every constraint into one `constraints` array with a `type`
discriminator. The 4.1/4.2 shape (top-level `ik`/`transform`/`path`/`physics`
arrays) still loads clean and **the constraints simply vanish** — that is `A01`.

rigc emits all five: `ik`
([IK constraints](http://esotericsoftware.com/spine-ik-constraints)), `transform`
([transform constraints](http://esotericsoftware.com/spine-transform-constraints)),
`path` ([path constraints](http://esotericsoftware.com/spine-path-constraints)),
`physics` ([physics constraints](http://esotericsoftware.com/spine-physics-constraints))
and `slider`. Field lists are in [`src/rig.ts`](../src/rig.ts); the traps worth
carrying here:

- 🔑 **A constraint name is unique per KIND, not across the array.** Spine
  resolves one with `SkeletonData.findConstraint(name, type)`, which tests
  `constraint instanceof type` **before** it compares the name, and every
  resolution in the format goes through it: a timeline group, a skin's member
  list (§3.4.1), a slider's animation. So an `ik` constraint and a `transform`
  constraint may both be called `leg` — the editor exports both, the runtime
  finds each from its own group, and a motion spec's `ik` block, `transform`
  block and `path`/`physics`/`slider` tracks each name the kind they mean and
  resolve the same way (§4.9, §4.12). Two constraints **of one kind** sharing a
  name are refused (§5.1), because no timeline could say which was meant. Until
  [#692](https://github.com/firejune/rigc/issues/692) the rig spec kept one
  namespace over the whole array, so a rig the editor exports and the runtime
  plays — an IK chain and the transform constraint that follows it, both carrying
  the chain's name — could not be written down at all.
- A transform constraint's `properties` names come from a fixed six — `rotate`,
  `x`, `y`, `scaleX`, `scaleY`, `shearY`. rigc refuses anything else by name; in
  raw JSON the parser throws.
- Each transform mix is read **only if the matching `to` property was declared**, so
  a `mixRotate` without a `rotate` entry is dead data.
- A physics constraint's five components all default to 0, so one that names none of
  them parses cleanly and does nothing at all. rigc refuses it up front, and `A23`
  catches it from the other side.
- An **ik** and a **physics** constraint both carry `ScaleYMode` under the key
  `scaleY`, spelled `"none"`, `"uniform"` or `"volume"`. It is an enum resolved by
  `Utils.enumValue`, so only the first letter's case is free and an unrecognised
  name is assigned as `undefined` with no error; rigc checks it, like the three
  path modes below.
- A physics constraint carries seven **`*Global`** booleans —
  `inertiaGlobal`, `strengthGlobal`, `dampingGlobal`, `massGlobal`, `windGlobal`,
  `gravityGlobal` and `mixGlobal` — and "global" is not a scale or a space. Spine
  4.3 lets a physics timeline name **no** constraint (`animations.<a>.physics[""]`,
  which the parser reads as constraint index `-1`, `SkeletonJson.js:1048-1053`);
  such a timeline drives every active physics constraint whose matching flag is
  `true` and leaves the rest alone (`Animation.js:2066-2072`). So the flag is one
  constraint's **opt-in to being driven in bulk**, per tuning value, and it does
  nothing on its own. The parser's default for all seven is `false`.
  The motion spec keys that timeline as **`"physics": "*"`** (§4.4,
  [#726](https://github.com/firejune/rigc/issues/726)), and rigc writes it under
  the empty name. Until then rigc emitted the flags and could not emit the
  timeline that reads them: every physics track named its constraint and the
  empty name was refused as `keys unknown physics constraint ""`. What rigc does
  with the flags is **pass them through**, `false` included: measured, a
  constraint stating none emits none, and one stating `"windGlobal": false` emits
  `"windGlobal": false` rather than dropping it the way the motion spec's
  `physics` table drops a default (§4.6). ⚠️ That table has **no** `…Global`
  field, so a constraint a `"*"` track is meant to reach is declared here, in the
  rig spec's `constraints`.
- `"*"` is **reserved** as a physics constraint's name, in the rig spec and in
  §4.6's table alike: a track naming it could mean either. `compile` refuses one
  by name.
- ⚠️ `src/rig.ts` called the physics `ScaleYMode` key **`scaleYMode`** until
  issue #545 — the runtime's field name rather than the format's key — and nothing
  read it, so a spec that wrote `scaleYMode` set no mode and said nothing. A rig
  that still writes it is now refused by name, with `scaleY` beside it.

Every constraint may also carry `skin: true`, which makes it run only under the skin
that lists it — see §3.4.1, and note that the flag alone does nothing.

🎛️ **An ik or transform whose mix a game sets from code has no field here**, and
that is deliberate. Every key on a constraint object is a Spine field the emitter
writes; a statement to the gate about who turns the dial is what the artifact cannot
say about itself, so it lives in `invariants.consumerDrivenMix` (§3.7), beside
`deformMayFold` — the one other exemption from a named rule, which names its subject
the same way ([#784](https://github.com/firejune/rigc/issues/784)).

#### 3.5.1 `path` — bones that travel along a curve

**When you need one:** anything that moves *along* something rather than around a
joint — a cart on a track, a fish in a current, a chain of links wrapping a pulley.
One `position` key moves the whole train, and the shape of the motion lives in the
curve instead of in the keys.

```json
{ "name": "ride", "type": "path", "bones": ["cart"], "slot": "track",
  "positionMode": "percent", "spacingMode": "percent", "rotateMode": "tangent",
  "position": 0.25 }
```

| Field | Meaning |
| --- | --- |
| `bones` | at least one, in the order they ride the path |
| `slot` | **required.** The slot whose path attachment they follow (§3.4) |
| `positionMode` | default `"Percent"`: `position` is a fraction of the measured `lengths` total — **not** of the arc, see §10.6. `"Fixed"` makes it world units, which is the mode a wrong total is visible in |
| `spacingMode` | default `"Length"` — `Length`, `Fixed`, `Percent` or `Proportional` |
| `rotateMode` | default `"Tangent"`: each bone turns to the curve's tangent where it sits. `"Chain"`, `"ChainScale"` |
| `rotation` | default 0. Degrees added after the path's own rotation |
| `position` | default 0. Where the first bone sits |
| `spacing` | default 0. The gap between bones, in the unit `spacingMode` chose |
| `mixRotate`, `mixX` | default 1. `mixY` defaults to the same entry's `mixX` |

With the nine-point path of §3.4 — 180 units long — that constraint puts `cart` at
exactly `x = 45`, and a `position` timeline walking 0 → 0.5 walks it 0 → 90.

🚨 **The slot has to be able to show a path.** `PathConstraint.update` opens with
`if (!(attachment instanceof PathAttachment)) return`, so a constraint aimed at a
slot that never shows one loads perfectly, reports every mix it was given, and moves
nothing at all — there is no error anywhere in that. rigc refuses a slot with no
path attachment in any skin, and `A36_PATH_CONSTRAINT_EFFECTIVE` refuses it again on
the artifact.

⚠️ **The three mode names are checked, and only the first letter's case is free.**
The parser resolves them with `type[name[0].toUpperCase() + name.slice(1)]`, so
`"percent"` and `"Percent"` both work and `"PERCENT"` resolves to **`undefined`** —
which is then assigned without a word, and the constraint runs some *other* mode. An
unresolved `spacingMode` fails the `=== Length` test and spaces bones as though
`Fixed` had been asked for; an unresolved `rotateMode` is neither `Tangent` nor
`ChainScale`, so bones follow the curve and never turn along it.

🖼️ **Worked example: [`gallery/ride`](https://github.com/firejune/rigc/tree/main/gallery/ride)** — a trolley on a drawn rail, moved
by a `position` timeline, with `groups` + `stagger` keying the wheels.

#### 3.5.2 `slider` — a value that drives an animation

**When you need one:** a pose that has to be driven by a value instead of by time —
a dial that opens a door, a blend shape on a face, a suspension that compresses as
the wheel rises. A slider is the only constraint that applies an **animation**: the
animation is under its control while it is on, and `mix` is how much of it lands.

It comes in two shapes, and `bone` is the switch.

**Property-driven** — a bone's transform property maps to a time:

```json
{ "name": "knob", "type": "slider", "animation": "gate-swing",
  "bone": "dial", "property": "rotate", "from": 0, "to": 0, "scale": 0.011111 }
```

`time = to + (value - from) * scale`, so at `scale: 0.011111` (≈ 1/90) a dial turned
90° applies `gate-swing` at one second — which is the whole mechanism: turn the
dial, the gate swings.

**Time-driven** — no bone, and the time is the slider's own pose value, keyed by an
`animations.<a>.slider.<name>.time` timeline (§4.12):

```json
{ "name": "reveal", "type": "slider", "animation": "curtain", "time": 0 }
```

⚠️ **This branch takes neither of the repairs the bone branch takes.**
`Slider.update` applies `Math.max(0, time)` and the `loop` wrap *inside* its
`if (bone !== null)`, so a bone-less slider's time is used exactly as the
timeline left it: a negative time is not clamped to the first frame, it is a time
before the animation starts, where `Animation.apply` leaves the pose it found
untouched. That is the same picture as the first frame only when the first frame
*is* the rest pose. [measured] `PS140` in `selftest.ts`.

| Field | Meaning |
| --- | --- |
| `animation` | **required.** An animation the **motion spec** declares |
| `mix` | default 1. The slider's authority over what its animation keys |
| `additive` | default false. Add to the current pose instead of overwriting it |
| `loop` | default false. Repeat past the duration instead of holding the last frame |
| `bone` | the driving bone. Its presence switches the model |
| `property` | required with a bone: one of `rotate`, `x`, `y`, `scaleX`, `scaleY`, `shearY` |
| `from`, `to`, `scale` | the mapping above. Defaults 0, 0, 1 |
| `max` | default 0. Nonessential: the top of the editor's slider range |
| `local` | default false. Read the bone's local transform instead of its world one |
| `time` | the bone-less form's setup time |

⭐ **`animation` is the one field in a rig spec that points at the motion spec.** It
is the mirror of `events`, where the rig declares a name the motion spec fires. The
parser resolves it in a **second pass** over the constraints array, after the
animations are read, and a miss throws `Slider animation not found`; rigc refuses it
where the message can name both files.

🔒 **And it is the one field an editor round trip can repoint under you, which is
why R10 exists.** In JSON the reference is a name on both sides. In the format's
binary half it is an **ordinal** — `constraint.animation = animations[readInt()]`
(`SkeletonBinary`) — so an editor holding that ordinal writes back whichever
animation now stands at the position. `gallery/look` went into a licensed editor
(data version 4.3.26) as `turn, tilt, sweep` with `yaw -> "turn"` and came back
`sweep, tilt, turn` with **`yaw -> "sweep"`**: a file that parses, gates green and
applies the wrong animation. ⭐ Its second slider is what named the mechanism
rather than a second casualty — `tilt` survived because it sat at index 1 in both
orderings. rigc now emits animations in the editor's own order so its re-sort
moves no index ([#535](https://github.com/firejune/rigc/issues/535)); on the same
rig through the same editor that restored `yaw -> "turn"` and took the
re-rendered mean absolute error from 10.4655 / 8.4961 / 8.7140 down to
0.3035 / 0.0769 / 0.0588. (`look`'s three names are ones a codepoint sort orders
identically, which is what rigc emitted when that trip was measured.)

⚠️ The editor's comparator is natural and case-insensitive
([#539](https://github.com/firejune/rigc/issues/539)) and is now measured in full
off five stored round trips
([#728](https://github.com/firejune/rigc/issues/728)) — so the emit is the
editor's own order, and only what those files leave open is a compile error.
**R10** has the rule and the three shapes to avoid.

✅ **What that repair does not reach is a compile error now, not a hazard.** This
paragraph used to say that names a codepoint sort and a friendlier one disagree
about — `Turn` / `turn`, `turn2` / `turn10` — were where *the hazard returns*, and
that nobody had round-tripped such a pair. Somebody has: `Turn, sweep, wave` came
back `sweep, Turn, wave` and `turn10, turn2, zoom` came back `turn2, turn10, zoom`
([#539](https://github.com/firejune/rigc/issues/539)). ⇒ rigc no longer leaves
that to naming discipline — and since
[#543](https://github.com/firejune/rigc/issues/543) it does better than refusing
those two, because they are the two sets the editor's answer is **known** for:
both are emitted in the order it returned. What is still a compile error is the
set whose order turns on one of the three things the round trips of
[#728](https://github.com/firejune/rigc/issues/728) leave open, printed with both
names, which of them decides it, and the rename that settles it. What changed is
the price of forgetting: a build that stops, rather than a slider that silently
applies the wrong animation.

⚠️ **The fields of the model you did not choose are refused, not ignored.** The
parser reads `time` only in the bone-less branch and `property`/`from`/`to`/`scale`/
`max`/`local` only in the other, so the losing half would be data no runtime ever
looks at. Two more shapes `A37_SLIDER_CONSTRAINT_EFFECTIVE` catches from the
artifact side: an animation with no timelines (the slider runs and the skeleton
never changes), and `loop: true` on a zero-length animation — looping computes
`duration + (time % duration)`, so the animation is applied at **NaN**.

🚨 **`additive` defaults to `false`, and that default is wrong the moment two
sliders meet.** A slider applies its animation with `MixFrom.current` and that
flag, so at `mix: 1` a non-additive apply **writes the value outright** instead of
adding to the pose it found. Two sliders whose animations key the same bone
therefore do not compose: the one **later in the `constraints` array** wins and
the earlier one contributes nothing at all. [measured] two dials on one bone,
contributing 7.50° and 18.75°:

| the two sliders | the bone poses |
| --- | ---: |
| both at the default | **18.75°** — the later one alone |
| the same two, array order swapped | **7.50°** — the other one alone |
| both `"additive": true` | **26.25°** — the sum |
| an additive one *under* a non-additive one | 18.75° — the later one still wins |

So a two- or three-axis face wants `"additive": true` on **every** slider that
shares a target. The first entry could keep the default — nothing runs before it —
but do not: a non-additive slider also erases the **playing animation** on the
bones its own animation keys, even sitting at its neutral where it looks switched
off ([measured] an idle keying that bone to 4.00° reads 0.00° under a non-additive
slider and 4.00° + the slider's own value under an additive one), and writing the
flag on all of them is also what survives a reorder.

`A40_SLIDERS_COMPOSE_ON_A_SHARED_TARGET` refuses the rest — it names the bone or
slot, the property, every slider keying it in array order with its flag, and which
one wins today. ⛔ rigc does **not** set the flag for you. The compiler never
invents a value that is not in the spec, and a rig whose composition was chosen by
the tool is one nobody can reason about.

⚠️ **And below full authority it is a weighting rather than a quieter erasure**
([#399](https://github.com/firejune/rigc/issues/399)). An additive slider scales
its whole contribution by its own `mix`, so two of them at any pair of mixes are
still the sum — which is why `A40` skipping below full authority is right: what
happens there is a weighting, not the erasure it refuses. A **non-additive**
slider at `mix` α applies `current + (value + setup − current) × α`, a lerp *from
the pose it found*, so the earlier slider is not erased — it is attenuated by
`1 − α`. `mix × contribution` is not the arithmetic there, so a later dial turned
part of the way down takes that share of every earlier slider on the target with
it, on every frame, with the gate green — the second reason to write
`"additive": true` on **every** slider that shares a target and not only on the
later one. `PS130` in `selftest.ts` poses both models rather than quoting the
runtime, and [`docs/FACE.md`](FACE.md) §8 is the same rule on a face's two axes.

⚠️ **And `"additive": true` is not always available.** What composes is bone,
deform, transform-constraint, path `position` and path `mix`, physics
`wind`/`gravity`, and a slider's own `mix` and `time`. The rest ignore the flag —
a slot colour, an attachment swap, a draw order and a sequence, and also an **ik
constraint's mix**, a path's `spacing`, and every physics timeline except those
two — so two sliders sharing one of those overwrite each other whatever you
write. ⚠️ The four spelled out here used to read as the whole of the complement
and they are examples of it; `A40` was never reading a list, which is why it
refuses the ik case this sentence did not name.

🚨 **That list is not `Timeline.additive`, and this is what it cost to learn.**
The runtime's own flag says a class "supports being applied additively", and on
two classes it is not what the class does: `PathConstraintMixTimeline` and
`SliderTimeline` declare themselves non-additive and their `apply` passes the
`add` argument straight through anyway — every other non-additive timeline either
hardcodes `false` in the call, zeroes `add` first, or never reads it. So two
additive sliders keying one path constraint's `mix`, or one slider's `time`,
**do** compose, as the same sum as everything else above, and `A40` refused both
by name with a message saying `"additive": true` would not compose them. ✅ **It
no longer reads the flag: it poses each shared timeline twice with `add` set and
reads whether the second application accumulated**
([#655](https://github.com/firejune/rigc/issues/655)), so the two rigs above pass
and the message names what the class was measured to do. [measured] `PS143` in
`selftest.ts` poses all thirty spellings of the motion vocabulary under two
additive sliders and prints the flag beside the behaviour; `PS145` holds the
probe's verdict to that same pose on every one of them; `PS140` holds the `time`
case to a grid.

⭐ **The same measurement retired a refusal nothing could have distinguished.**
Two sliders whose animations both fire **events** were refused as sharing a
property — and a slider fires no event at all: it applies its animation with
`firedEvents` null, and `EventTimeline.apply` returns on that. The probe's third
answer is *this timeline moved no pose at all*, so an events pair, and a physics
`reset` pair with it, are simply not findings. Nothing else changed: a shared
slot colour, attachment, draw order, ik mix, path `spacing` or physics property
is refused exactly as before.

⇒ **And the `constraints` array decides twice, for two different reasons.**
*Overwriting* has a direction: the slider **later in the array** puts its own
animation's value there and the earlier one contributes nothing at all, at every
reading of either dial, with both flags set to `true`. And the array is also the
**update order**, for **every kind of constraint** — `Skeleton.updateCache` walks
it and each constraint's `sort` pushes itself as it is reached — so a property a
slider keys is read by the constraint that owns it only if the slider comes
**first**. A dial that drives the authority of an earlier slider, the mix of an
earlier ik constraint, the `position` of an earlier path constraint or the `wind`
of an earlier physics constraint writes a value nothing reads again, and what
that constraint drives is dead at every position of the dial.

✅ **That second one is a refusal by name since
[#658](https://github.com/firejune/rigc/issues/658), and it covers every
constraint kind since [#665](https://github.com/firejune/rigc/issues/665).**
`A42_DRIVEN_CONSTRAINTS_UPDATE_AFTER_THEIR_DRIVER` names the driving slider, the
driven constraint and its kind, the property, both `constraints` indices, the
runtime class whose `update` does the reading and the animation the key sits in,
and its repair is the reorder. It is a rule of its own rather than a clause of
`A40` because `A40`'s population is the sliders whose `mix` nothing keys — the
exclusion *is* the shape of the hole — and not a clause of `A37`, which asks
whether some animation keys the `mix` above 0 and never which one.
⭐ **The runtime repairs this for bones and not for constraints**, which is why an
author cannot reason it out from the bone case: `Slider.sort` clears `sorted` on
every bone its animation keys so those bones re-sort *after* the slider, while
for a constraint it calls `skeleton.constrained(...)`, which swaps the pose the
constraint is read through and moves nothing in the update cache. 🔒 The same
refusal covers a slider keying its **own** `mix` or `time` — the two indices
equal. `Slider.update` reads both off the applied pose before it applies the
animation, so a slider muted at setup whose own animation keys its `mix` up never
runs at all and `A37` reports green over it.

⚠️ **The constraint's own pose holds the number either way, which is why nothing
found this by reading a value back.** In both array orders the keyed property
reads back exactly as written — [measured] an ik mix `0.000000..1.000000`, a path
`position` `0.000000..0.900000`, a physics `wind` `0.000000..400.000000`, each
identical in the two orders — and what changes is what the constraint *drives*:
`0.000e+0` of travel against `1.662e+1`, `1.620e+2` and `4.256e+2` the other way
round. 🔸 **One spelling is outside the rule and a reorder does not repair it**:
a `physics` `reset` key. It writes no pose and fires only when a frame time is
crossed, and a slider applies its animation at a single instant — so the key
never fires in either order, and the SKIP says so rather than advising a move
that would change nothing. [measured] `PS139`, `PS140`, `PS156`, `PS157`,
`PS158`, `PS159` and `PS160` in `selftest.ts`.

Swap the two array entries and the answer swaps with them — it is the
array that decides, not the flags and not which animation the file names first
(`PS135` in `selftest.ts` poses four such targets both ways; `PS136` poses the
three that do compose, and they are the same sum §3.5.2 states, over each target's
own setup value). A40 names this case separately, because the fix is different:
key such a property from one slider only, or move both edits into the single
animation one slider applies.

#### 3.5.2.1 What each `property` can actually be read AS

**A `property` under `local: false` is read through the world transform, and four
of those readings are bounded.** A range that names values the reader cannot
return is dead there: the dial moves, the reading does not follow, and nothing at
runtime says so. [measured] against `spine-core` 4.3.13, one reader at a time —
`bench/studies/2026-09-06-readers`:

| `property` | `"local"` | Reads | Producible floor | Producible ceiling |
| --- | --- | --- | --- | --- |
| `rotate` | `false` | `FromRotate`, world | `0`, reached | `360`, reached |
| `rotate` | `true` | `FromRotate`, local | none | none |
| `x` | `false` | `FromX`, world | none | none |
| `x` | `true` | `FromX`, local | none | none |
| `y` | `false` | `FromY`, world | none | none |
| `y` | `true` | `FromY`, local | none | none |
| `scaleX` | `false` | `FromScaleX`, world | `0`, reached | none |
| `scaleX` | `true` | `FromScaleX`, local | none | none |
| `scaleY` | `false` | `FromScaleY`, world | `0`, reached | none |
| `scaleY` | `true` | `FromScaleY`, local | none | none |
| `shearY` | `false` | `FromShearY`, world | `-449.99999468`, reached | `269.99999468`, reached |
| `shearY` | `true` | `FromShearY`, local | none | none |

- **`none` is not "very large"** — those readers are `source.<field> + offset` and
  the field is whatever the animation wrote, so there is nothing there to bound.
- **Every world row assumes the offsets are zero**, and a slider cannot make them
  anything else: `Slider.offsets` is a private all-zero array. The same six
  classes serve a transform constraint, which passes its own — there the scale
  floors move to the offset and the `shearY` window slides by it.
- **`scaleX` / `scaleY` under `local: false` lose the sign.** The reader is
  `Math.sqrt(a² + c²)`, so a bone at `scaleX: −1` reads **`+1`**, not `−1`: a
  squash axis driven through negative scale gets the mirror of the dial you wrote.
  The floor `0` is *reached*, not approached — a bone whose own scale or whose
  parent's is 0 reads exactly 0 — so a range whose bottom is exactly 0 is fine.
  🚨 One that dips below it is not *dead*, it **folds**: −2 and +2 read the same
  number, select the same frame and pose the same face, so the axis doubles back
  on itself about the point it should have passed through. Such a range is
  **refused at compile** (§3.5.2.2, beside the `rotate` circle). [measured]
  `PS138` sweeps both halves and poses them; `PS151` poses the fold on a dial the
  refusal leaves standing — a legal `0`..`4` window turned below 0 by a consumer
  applies the same time at −2 and +2 to the bit, while the same mapping read
  `local: true` is on its own signed mapping at every cell.
- **`shearY` under `local: false` wraps like `rotate` does, and worse.** It is a
  difference of two `atan2` calls, so at any one bone orientation the readable
  window is 360° wide — `(−270 − θx, 90 − θx]`, where `θx` is the bone's world
  x-axis angle. The bound in the table is the union over every orientation. ⇒ the
  seam is **not at a fixed value of the driven field**; it is wherever the bone is
  pointing. Prefer `local: true` for a shear axis.
  ⚠️ **Nothing refuses a `shearY` range, and that is deliberate.** The reader
  keeps its sign — it does not fold the way the two `scale` readers do — and what
  it does instead is not a fact a rig spec holds: [measured] `PS155` sweeps three
  orientations across their own seams and each wraps by exactly one turn at
  `90° − θx` (90°, 45° and 150° for a dial bone at 0°, 45° and −60°), which any
  animation a consumer writes can move. A range rule here would have to name a
  seam the compiler cannot know, and would pass the case that actually breaks.
- **The bounds are not round numbers because `MathUtils.PI` is `3.1415927`** — the
  float32 π of the reference runtime. Every degree in spine-core passes through
  `180 / 3.1415927`, so a full turn converts as `359.99999468178214` and a bone at
  360° reads 5.3e-6° rather than 0°. `shearY`'s two ends are `±2π · radDeg − 90`.
- 🔸 A negative `skeleton.scaleX` / `scaleY` — how a consumer mirrors a character —
  changes **nothing**: every world reader divides the same factor back out, and
  [measured] the readings are identical to the digit at (1,1), (−1,1), (1,−1),
  (−1,−1), (2,0.5) and (−0.5,3). A `skeleton` scale of **zero** makes every world
  reader `NaN`, and `Math.max(0, NaN)` is NaN — but nothing in skeleton data sets
  that field, so it is the consumer's to avoid.

⚠️ **`local: true` reads the number you authored only on a bone nothing else
drives.** `Slider.update` calls `bone.appliedPose.validateLocalTransform` first,
and on a bone a constraint moved that recomputes the local pose *from the world
matrix* — `atan2Deg` for the angles and `Math.sqrt` for `scaleX`. [measured] on
one rig, the same slider: a free bone at `rotation: −500` reads `−500` and the
same bone inside a transform constraint's `bones` reads `−140.000006`; at
`scaleX: −2` the free bone reads `−2` and the constrained one reads `+2`. The
producible *set* is unbounded either way — the free case is in it — but if
`local: true` is your repair for a world reader's floor, check that the driving
bone is not itself constrained.

#### 3.5.2.2 The circle a `rotate` world dial has to stay inside

🚨 **A `rotate`-driven slider with `local: false` has to stay inside the circle
`[0, 360]`.** `local: false` reads the bone's **world** rotation through
`FromRotate.value`, which is a `Math.atan2` — so `(−180, 180]` — with
`if (value < 0) value += 360` on the end, and the `offsets` a slider hands it are
all zero. `[0, 360]` is therefore the whole set of values that reader can ever
return, and a range leaving it on either side is a wall:

- **Below 0°.** A yaw axis authored the natural way — neutral at 0°, range
  −15°..+15° — never sees a negative value: the bone at −15° arrives as 345°, and
  `time = to + (value − from) * scale` lands far past the animation. [measured]
  with `from: 0, to: 0.5, scale: 0.033333` over a 1 s animation the dial at −15°
  applies time **12.000 s**, so with `loop: false` the entire negative half of the
  axis holds the last frame — 15° of face jumping between −0.001° and 0°.
- **Past 360°.** There is nothing above 360 to wrap *from*, so the value arrives
  360 **lower** instead. [measured] with `from: 300, to: 0, scale: 0.005` over a
  1 s animation the range is 300°..500°; the bone turned to 500° has a world
  rotation of 140°, is read as 140°, and applies time **−0.800 s** —
  `Math.max(0, time)` under `loop: false`. Swept through spine-core, that rig
  reaches only **0.000 s..0.2995 s of its own 1 s animation**: the top 140° of the
  dial does not merely fail to arrive, it arrives somewhere else.

Both are refused at compile, each with its own arithmetic in the message and its
own repair — *"move the range so it does not cross 0°"* and *"move the range so it
does not run past 360°"*.

⭐ **The reading in that message is a modulo, not one turn** — the wrap the bone's
matrix has already applied by the time `atan2` reads it, so a range that leaves
the circle by *more* than 360° is folded all the way back into `[0, 360)`. The two
examples above each sit within one turn, where a single ±360 gives the same
answer; past that only the modulo does. [measured] through spine-core, a bone
parked at **−500°** drives the slider to **3.600000 s**, which is exactly where a
bone parked at **220°** drives it — so the reading is 220°, not −140°, and a
refusal naming −140° would be naming a value that reader cannot return at all
(issue [#431](https://github.com/firejune/rigc/issues/431)). The same on the other
side: **900°** drives it to **0.200000 s**, the time a bone at **180°** selects.

📐 **The consequence in that message is computed, not described.** Both refusals
end on two numbers read off `[0, 360]` met with the driving values that reach the
animation — the same two the message has already printed:

```
reachable = { to + (v − from) × scale : v ∈ [0, 360] } ∩ [0, duration]
held      = { v ∈ [0, 360] : the mapped time falls outside [0, duration] }
```

so the 300°..500° dial above is refused with *"This dial reaches only
0.000s..0.300s of the animation's 1s, and 83.3% of the circle — every reading
below 300.000° — is held on the frame at 0.000s"*, and the −15°..15° one with
*"…only 0.500s..1.000s of the animation's 1s, and 95.8% of the circle — every
reading above 15.000° — is held on the frame at 1.000s"*. [measured] the first of
those reproduces a 0.1° sweep of the rig through `spine-core` to **3.2e-8 s**,
which is the reader's own `atan2` noise.

⚠️ **`loop: true` gets a different sentence, because it is a different runtime.**
`Slider.js:63-66` is `p.time = duration + (p.time % duration)` when the slider
loops and `Math.max(0, p.time)` when it does not, so nothing is held on a looping
slider — [measured] the same 300°..500° rig pins 5⁄6 of the circle to frame 0 at
the default and pins *nothing* under `loop: true`. The refusal says so: *"Nothing
is held: `"loop": true` wraps the time as `duration + (time % duration)`, so the
140.000° of the range past 360° selects nothing a reading inside the circle does
not already select."* The range is still refused either way — a bone cannot be
read at 500°, whatever happens to the time afterwards.

⭐ **The degrees in that sentence are a *width*** — how much of `lowest..highest`
lies outside `[0, 360]` — and not the reach from the boundary to the far end. The
two are the same number for a range that *straddles* a boundary, as `300°..500°`
does. A range lying **wholly** outside is told its own width instead: `400°..500°`
reads *"the 100.000° of the range past 360°"*, and `-500°..-300°` *"the 200.000°
of the range below 0°"* (issue
[#434](https://github.com/firejune/rigc/issues/434) — both used to print the
reach, which on the first of those was 140.000°, wider than the 100°-wide range
it was describing).

⭐ **A range ending exactly on 360° is legal**, and that is the whole turn: a
wheel, a turntable, a head that goes all the way round, written `from: 0` with a
`scale` that puts 360° on the last frame. It misses **nothing**: [measured] the
wrap `value += 360` on a reading a hair below zero *rounds*, and bisecting the
runtime's own `v + 360 === 360` puts the threshold at exactly half an ulp of 360 —
so every reading in `[-2.842170943040401e-14°, 0°)` is read as exactly `360`, and
the top of that range is reached rather than approached. Nor is 360 a separate
dial position: a bone at 360° *is* a bone at 0°, and [measured] it poses the
skeleton to within **4e-7°** of it, an `atan2` artefact rather than a frame. (The
other half of that same `atan2` leaves a 5.3e-6°-wide hole at 180°, between
`179.99999734…` and `180.00000265…` — measured, reported for completeness, and
narrower than any dial anybody writes.) Swept at 0.1° over the circle, `from: 0,
scale: 0.0025` on a 0.9 s animation lands every reading within **1.7e-8 s** of the
time the mapping asks for; on `loop: true` the endpoint is not even distinct,
closing on **0.900000 s** exactly. Use `loop: true` for a dial that really does go
round, so the seam at 0°/360° is the wrap it is meant to be.

⇒ **`local: true` is the form a face axis wants**, and it is the first repair both
messages name. It reads `source.rotation` signed and unwrapped, which for a dial
bone is the number you authored — 500° included — because `FromRotate`'s wrap is
not on that path at all. The alternative each refusal leaves open is to move the
range inside the circle (a neutral at 180°, say), which is the only form
`local: false` can express.

🚨 **The two world `scale` dials have a floor at 0, and a range dipping below it
is refused too — for a different reason than the circle's.** `FromScaleX.value`
is `Math.sqrt(a² + c²)` and `FromScaleY.value` is `Math.sqrt(b² + d²)`, a
**magnitude** with the driven field in both terms, so the positions below 0 are
not unreachable, they are *already taken*: [measured] with `from: 0, to: 0.5,
scale: 0.25` over a 1 s animation the window is −2..+2, and the dial at −2.000,
−1.500, −1.000 and −0.500 applies **1.000000 s, 0.875000 s, 0.750000 s and
0.625000 s** — the same six decimals +2.000, +1.500, +1.000 and +0.500 apply, and
the same posed face. The refusal names the arc that is written twice:

> Positions below 0 read as the mirror of positions above it: 2.000 of the range below 0 repeats 0.000..2.000, which is 0.500s..1.000s of the animation, in reverse.

- **A bottom of exactly 0 is legal**, because that floor is *reached*: a 0..4
  window builds, gates green and sweeps the whole animation. A window a
  thousandth of a unit below it is refused.
- **A range lying wholly below 0 gets its own sentence** — *"the whole 4.000 of
  this range is below 0, so it reaches none of the animation's 1s"* — and that
  figure is the width **under** the floor, not the reach to the far end, the same
  distinction [#434](https://github.com/firejune/rigc/issues/434) drew for the
  circle.
- **`loop: true` changes nothing here**, unlike the circle: a fold is not a
  clamp, so there is no loop branch in the message. [measured] the same ±1.500
  pair applies 1.875000 s either way.
- **The repairs** are `"local": true`, which reads `source.scaleX` signed so the
  negative half drives the *first* half of the animation ([measured] −2 →
  0.000 s, +2 → 1.000 s), or moving the range so it does not dip below 0.

[measured] `PS151`–`PS154` in `selftest.ts`. `shearY` has no such rule and
§3.5.2.1 says why: that reader keeps its sign and wraps at a seam the bone's own
orientation places, which a rig spec does not hold.

⚠️ **An artifact can still carry a dead range** — one exported from the editor,
hand-edited, or built by an older rigc. `A39` reports that from the artifact side
as a key at a time no dial selects (§4.11.4); the compile refusal above is what
stops a rig spec in this repository from producing one.

📌 **A slider's animation is measured in the slider's own frame** — `A39` inverts
the mapping above and drives the bone to the value it names, rather than playing
the animation on a track while the slider sits at its neutral. §4.11.4 is what
that changes and why it matters at `mix: 1`.

🔸 **`scale` is emitted as its float32**, like every other number rigc writes, so
`1/60` ships as `0.016666668` — 8e-8 relative (it was `0.016667`, 2e-5, on the
six-decimal grid before issue #716). Invisible in the middle of the range; it
shows at the top of it, where a 60° turn then applies at 1.00000008 s rather than
1 s. With `loop: false` that is the last frame and harmless, with
`loop: true` it wraps to the start. When the range comes from a *measured* ceiling
— the turn ceiling `build` reports for a depth mesh (§3.4, `depth`) is the natural
one — pick `to`/`scale` so the endpoint lands **inside** the duration rather than
exactly on it.

🖼️ **Worked example: [`gallery/look`](https://github.com/firejune/rigc/tree/main/gallery/look)** — a face
whose yaw and pitch are two sliders sharing one bone, both `local: true` and both
`additive: true`, with each range derived from the turn ceiling `build` reports
for that mesh (§3.4) rather than chosen. [`docs/FACE.md`](FACE.md) §8's *The turn
as a value rather than a time* states that derivation as a rule, and its §7 is
what a slider does to a face's channel allocation.

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

Optional with one exception, and only meaningful for rigc's own formations:
`meshSlots` and `meshTriangles` (the two halves of the mesh budget `A13` measures
against), `axisBone`, `massBone`, `detached`, `deformMayFold`, `editorRoundTrip`,
`consumerDrivenMix`.
Nothing in skeleton
JSON records that a
bone carries a cut's axis or that a parentage is forbidden, so the rig spec says it
and the validator's archetype assertions read it. **An assertion whose field is
absent reports SKIP, never a pass.** If you are reproducing a foreign skeleton,
leave this out entirely and run `--profile spine` — and expect `PROF` rather than
that SKIP, because the profile excludes an archetype assertion before its body
could notice the missing field (§5.2). The one field `ingest` writes is
`consumerDrivenMix`, and only for a constraint the file rests muted and never keys
up, each with a `CONSUMER_DRIVEN_MIX` finding ([INGEST.md](INGEST.md) §2.0) — see
the last block of this section.

🚨 **The exception: `meshSlots` is required by a rig that invokes a mesh
generator** (`ring`, `ribbon`, `contour`, `grid` — §3.4), and it is a **compile-time**
refusal rather than an assertion. Undeclared means a budget of zero, so the build
stops before the gate with `N mesh slot(s) emitted but the rig "X" allows 0`.
Geometry rigc built is geometry rigc will not ship unmeasured; geometry the author
drew is exempt, because rigc did not draw it. So `A13`'s **SKIP** means *this rig
is unmeasured*, not *this budget is inert* — those are two code paths with one
name, and reading the SKIP as the whole story is what issue #274 was.

🔗 **`detached` is a list of forbidden parentages**, and its shape is
`[{ "bone": …, "notUnder": …, "why"?: … }]`. `A25_DETACHED_BONE_PARENTAGE` walks
`bone`'s parent chain and fails if `notUnder` is anywhere on it — an **ancestor**
rule, not a direct-parent one, because a bone dragged by its grandparent is
dragged just the same. A `bone` the rig does not declare is its own failure
(`the rig declares "X" detached from "Y" but has no such bone`), so a rename that
leaves this block behind is loud rather than quietly vacuous. `why` is optional
here — unlike `deformMayFold`'s, which is required, and the difference is what
each field does: this one turns a check ON for a pair, so an empty reason costs
nothing but a reader's time. What it is for is a bone whose wrong parentage still
loads and still animates and merely lies — something released into the world that
must not ride the part that released it. [RIGGING.md](RIGGING.md) §10.3 has a
worked one.

🚨 **`deformMayFold` is one of the two fields here that turn a check OFF**
(`consumerDrivenMix`, below, is the other), so it is held to a shape that is
refused rather than skipped. It is
`[{ "slot": …, "why": … }]`, it exempts that slot from
`A39_DEFORM_KEEPS_TRIANGLE_WINDING`, and three shapes are compile errors: a slot
the rig does not declare, a slot that carries no mesh, and a missing or blank
`why`. The first two would exempt nothing while reading exactly like the
exemption worked; the third is how a defect ships as a decision. ⚠️ The default
is **gated** — an author who has not thought about folding gets the check, which
is the whole value of it. What the field is for is art that folds on purpose: a
page turning over, a cloth creasing back on itself, where the reversed winding
*is* the drawing.

📌 **Nothing in this repository uses it.** `gallery/flex` did, for one leaf whose
`why` named the issue tracking the defect rather than claiming intent; that
tracked defect is repaired ([#313](https://github.com/firejune/rigc/issues/313))
and the entry is gone. ⇒ An exemption whose `why` reads *"known defect, see
#N"* is a legitimate use of the field and an honest one, but it is a loan
against a fix, not a fix — and the thing that made it repayable was A39
measuring the ceiling the art could actually take.

🎬 **`editorRoundTrip` is the one field here that names a CONSUMER rather than a
shape.** Write `"editorRoundTrip": true` when this rig is authored to come back
out of the Spine editor — imported, hand-edited, exported — and
`A41_PHYSICS_SURVIVES_EDITOR_ROUND_TRIP` refuses a physics constraint driving a
component that editor cannot hold. `true` is the only accepted value; a `false`
would be a key nothing reads ([#545](https://github.com/firejune/rigc/issues/545)).

⚠️ **Leaving it out is not a weaker gate, and this is the part worth reading.**
rigc's output is not wrong here: a physics constraint driving `rotate` is valid
Spine 4.3 that every runtime plays — a cowlick, a tail, an ear — so refusing it by
default would be refusing correct data on behalf of a pipeline nobody declared.
What a rig that says nothing gets instead is the **SKIP**, and the SKIP names the
constraint and the component:

```
  SKIP  A41_PHYSICS_SURVIVES_EDITOR_ROUND_TRIP: the rig "look" does not declare `invariants.editorRoundTrip`, so nothing here is gated against the Spine editor. What is here: physics "whip" drives rotate, and the editor's physics model holds x and y only, so a round trip returns that constraint driving nothing at all (issue #540)
```

📏 **Measured, not inferred** ([#540](https://github.com/firejune/rigc/issues/540)):
three rigs, twelve constraints, predictions written before the round trip. A lone
`y` came back and `x` + `y` together came back — the rule is membership, not arity
— while a lone `rotate`, a lone `scaleX` and a lone `shearX` each came back driving
**no component at all**, and neither `scaleY` mode rescues `scaleX`. So the fix for
a refusal is to drive the constraint in `x`/`y`, or to drop the declaration if this
rig never goes near the editor. ⇒ `A23_PHYSICS_CONSTRAINT_EFFECTIVE` is the same
loss seen from the far side: it is what fires on the file the editor hands **back**.

🚫 **Do not reach for it to cover a part you have faded out.** A key whose slot
draws no pixels at that key's own time is already passed over — `A39` measures
that and says so (§4.11, and the `skipped` line in the `DEFORM` block). Declaring
the slot instead would turn the check off at every angle where the part is fully
visible too, which is trading a false positive for a blind spot on the same slot
([#401](https://github.com/firejune/rigc/issues/401)). ⚠️ And land that alpha-0
key **before** the folding key rather than on it — the frames in between are
drawn and are gated (§4.11.3); this used to be a rule you had to follow and is
now one the gate keeps
([#403](https://github.com/firejune/rigc/issues/403)).

🎛️ **`consumerDrivenMix` names the ik and transform constraints whose mix the
CONSUMER sets** — from code, at runtime — rather than any animation in this file
([#784](https://github.com/firejune/rigc/issues/784)). It is
`[{ "constraint": …, "type": "ik" | "transform", "why": … }]`, and it exempts that
constraint from `A47_IK_CONSTRAINT_NOT_MUTED_THROUGHOUT` or
`A48_TRANSFORM_CONSTRAINT_NOT_MUTED_THROUGHOUT` (§4.12). A constraint resting muted
that nothing keys up is either a leftover or a dial a game turns, the two export as
the same bytes, and the gate refuses the shape because nothing *in the file* ever
moves it — this is the statement that something outside it does, the rig-side
spelling of `gallery/look`'s rule that a face angle is a value rather than a time.

- `type` is required because a constraint's name is unique **per kind** — an ik and
  a transform may share one — so a name alone could exempt two constraints.
- Five shapes are compile errors, each by name: a constraint the rig does not
  declare under that `type`, a `type` other than `ik` or `transform` (a physics,
  path or slider constraint has its own muted-at-rest rule — `A23`, `A36`, `A37` —
  and none of them reads this declaration, so the entry would exempt nothing), the
  same constraint twice, a missing or blank `why`, and a key the entry does not have.
- ⛔ A declared constraint the file **also** switches on — resting live, or keyed
  above 0 — is refused at the gate: the declaration exempts nothing there.
- What it buys is a **SKIP by name, never a pass** (§4.12 has the line). The
  declaration is a statement to the gate and changes no emitted byte.

---

## 4. The motion spec, field by field

`spec` must be `"rigc-motion/1"`; `archetype` must equal the rig's `name`; `cut` is
a label for the shot. Always include an `easings` object — an empty one is fine.

⭐ **The file is PARSED, not cast** ([`src/motion.ts`](../src/motion.ts), issue
#307), so a field of the wrong type is refused before any of it is compiled. Every
one of those refusals names the file, the key path, what the value actually is and
the spelling that works — `path/to/motion.json: \`easings."soft"\` is an array of
3; a named easing is FOUR finite numbers …`. The split with the compile-time
refusals in §5.1 is **shape versus meaning**: whether a value is a number, a
string, an array or an object is answerable from this file alone and lives in the
parser; whether a name resolves against the rig, whether a bone is in that group,
whether a key's value has the right number of channels for its property needs
something this file does not contain, and stays where it can say so.

⚠️ **An unknown key is still ignored**, exactly as it is in a rig spec — a
misspelled `"easing"` for `"ease"` plays linear and says nothing. The two formats
are deliberately consistent here rather than each surprising in its own way.

### 4.1 `easings` — named handles

`name → [hx1, hy1, hx2, hy2]`, the **normalised graph-view handles** an editor
shows. rigc converts them per key into the absolute `(time, value)` control points
the JSON actually holds. Writing normalised handles into a raw `curve` instead loads
without error and plays a different curve.

**Four finite numbers, refused by name if they are not** (#307). `bezierForChannel`
destructures four handles with no guard of its own, so `[0.42, 0, 0.58]` used to
emit `"curve": [0.42, 0, 0.58, null]` — a curve with a hole in it, which loads,
plays, and is not the shape the spec named. A non-numeric handle was the same
silence one character further in.

### 4.2 `setup` — the setup pose, per slot

`slotName → { attachment?: string | null, color?: [r, g, b, a] }`, with the colour
channels in 0..1. Both halves are refused by name: an entry that is not that object
— `"lid_l": null`, or `"lid_l": "plate"` with the attachment name where its wrapper
belongs — and a colour channel that is not a finite number in 0..1. The second
spelling is the one worth knowing about, because `.attachment` on a string is
`undefined`: it used to compile GREEN and **hide the slot**, which is the opposite
of what was asked (#293). The guard is in the parser rather than the emit path, so
it also covers a slot the rig declares without attachments and a slot name that
matches nothing at all — the two corners where the emit-path version stayed silent
(#307). Declaring a slot's setup pose here **and** on the rig slot is a
compile error (R3). Use whichever file owns the decision: a rig that is purely
structure puts it on the slot; a cut whose overlay mechanism is a decision about
time puts it here.

### 4.3 `animations` — name → animation

| Field | Meaning |
| --- | --- |
| `duration` | seconds, declared and checked (R7) |
| `loop` | a **player hint only** — skeleton JSON has no loop field, so this is not emitted and no assertion or diff measure reads it. **Optional**, and 20 of the motion specs in this repository omit it |
| `note` | free text |
| `tracks` | the timelines |
| `drawOrder` | the draw-order timeline — §4.7. Not a track: it names no target |
| `events` | the event timeline — §4.8. Not a track, for the same reason |
| `ik` | IK constraint timelines — §4.9. Not a track: its keys carry named fields, not one `v` |
| `transform` | transform constraint timelines — §4.10. Same reason |
| `deform` | deform timelines — §4.11. Same reason |
| `sequence` | which frame of an attachment's numbered series shows — §4.13. Same reason |

`groups` (`name → [member, …]`) lets one track target several bones, slots or
physics constraints at once; `lag` shifts every key of a track, and `stagger`
adds a per-member delay in member order. **Member order is load-bearing** — it is
what `stagger` counts and what a per-member value map is read against — so a
group that names a member twice is a compile error, and so is one that names none.

⭐ **Which of the three a group's members are is decided by the `property`, not
by the group.** A group declares names and nothing else; the compiler reads the
property first — a physics timeline makes the members physics constraints, one of
a bone's eleven makes them bones, and `attachment`/`rgba` makes them slots — and then
resolves every member against the rig as that. So a `group` is the one target
where the property picks the family rather than the other way round (§4.4's ⭐ is
about the three **constraint** families, which are picked by the field), and a
property that is in none of the three tables is refused naming the group and all
three vocabularies rather than being read as any of them
([#661](https://github.com/firejune/rigc/issues/661); §4.4). A group whose members
are not all of one family is not refused as such: the first member that is not
what the property made it is the one named.

A group track's keys need not give every member the same value: `v` may be a map
keyed by member name, or a `derive` model the compiler evaluates per member.
§4.5.1 is that construct.

### 4.4 `tracks` — one target, one property

A track names **exactly one** of `bone`, `slot`, `group`, `physics`, `path`,
`slider`. Two tracks on the same `target.property` is a compile error: merge them.

⭐ **The target field picks the family, not the property.** All three constraint
families have a timeline called `mix`, so `{ "physics": "hair", "property": "mix" }`
and `{ "path": "ride", "property": "mix" }` are different timelines with the same
property name — which is why the constraint's name goes in a field named after its
type rather than in a shared `constraint` key.

⚠️ **`group` is the one exception, and the reason it is one is that it names no
family:** a group is a list of member names, so the property is all there is to
read — it decides whether those members are bones, slots or physics constraints
(§4.3), and a property in none of those three tables is refused with all three
lists rather than resolved as any of them.

Three families are **not** tracks and sit beside `tracks` instead — `ik` (§4.9),
`transform` (§4.10) and `deform` (§4.11). The reason is the key rather than the
target: a track's key carries one `v`, and those three carry named fields each
(two for an IK constraint, six for a transform constraint, a sparse vertex run for
a deform). Folding them in would make `v` mean four different things depending on
`property`. 4.3 also writes them as their own groups beside `bones` and `slots`.

| Target | `property` | Key `v` |
| --- | --- | --- |
| `bone` | `translate`, `scale`, `shear` | `[x, y]` |
| `bone` | `translatex`, `translatey`, `scalex`, `scaley`, `shearx`, `sheary`, `rotate` | `[value]` |
| `bone` | `inherit` | a mode name, not an array: `normal` · `onlyTranslation` · `noRotationOrReflection` · `noScale` · `noScaleOrReflection` — the five a bone's setup `inherit` takes (§3.2), read by the same rule. **Stepped by the format**: the mode changes AT the key and holds until the next one, and before the first key the bone is in its setup mode. So a key carries no `ease` and no `curve`. What it changes is how much of the parent's world transform the bone takes: `normal` all of it, `onlyTranslation` the position alone, `noRotationOrReflection` everything but the rotation, `noScale` / `noScaleOrReflection` everything but the scale |
| `slot` | `rgba` | `[r, g, b, a]` in 0..1 |
| `slot` | `rgb` | `[r, g, b]` in 0..1 — the light colour **without** its alpha, which stays wherever the setup pose or an `alpha` track puts it. Emitted as `{ time, color: "rrggbb" }` |
| `slot` | `alpha` | `[a]`, **0 to 1** — the light colour's alpha alone; the rgb is left where it is. Emitted as `{ time, value }`, a number rather than a byte |
| `slot` | `rgba2` | `[lr, lg, lb, la, dr, dg, db]` in 0..1 — the two-colour tint, light then dark, **seven** channels. The slot must declare a setup `dark` (§3.3) |
| `slot` | `rgb2` | `[lr, lg, lb, dr, dg, db]` in 0..1 — the two-colour tint **without** the light alpha, six channels. The slot must declare a setup `dark` (§3.3) |
| `slot` | `attachment` | the attachment name, or `null` for "show nothing" |
| `physics` | `inertia`, `strength`, `damping`, `mass`, `wind`, `gravity` | `[value]` — the constraint's own tuning, keyed over time |
| `physics` | `mix` | `[mix]`, **0 or more** — the constraint's authority |
| `physics` | `reset` | `null` — the key *is* the event |
| `physics: "*"` | any of the eight above | as above — the timeline that names **no** constraint. The value timelines write every physics constraint whose rig-spec entry declares that property global (`"strengthGlobal": true` for `strength`; §3.5) and leave every other one alone; `reset` resets every physics constraint and asks no flag |
| `path` | `position`, `spacing` | `[value]` — see §4.12 |
| `path` | `mix` | `[mixRotate, mixX, mixY]` — one timeline, three channels |
| `slider` | `time` | `[seconds]` — where in its animation the slider sits |
| `slider` | `mix` | `[mix]` — the slider's authority |

Translate values are **relative to the bone's setup position**; scale values are
multipliers where `1` is setup; rotation is in degrees.

⚠️ **A `bone` track's `property` is one of the eleven above, and anything else is a
compile error** — `animation "A" bone "B" has no timeline "P" (it has: translate,
translatex, translatey, scale, scalex, scaley, shear, shearx, sheary, rotate,
inherit)`, §5.1's row. The eleven are the three rows above read as one list, in the order the
message prints them, and they are the emitter's own dispatch table (`BONE_TRACKS`
in `src/compile.ts`): `resolveTargets` asks that table which family a track
belongs to, `compileValueTrack` writes a key out of the shape it finds there, and
the refusal prints `Object.keys` of the same object — so what you are told a bone
accepts is what it accepts.

- Until [#656](https://github.com/firejune/rigc/issues/656) it printed no list at
  all: the refusal read `bone "B" cannot take slot property "P"`, which named the
  **slot** family for whatever you had written — `wobble`, `translateX`, `rgb` —
  and told you nothing about what a bone does take. Nothing wrong reached disk
  then either, because the dispatch was already this table; what was missing was
  the way forward.
- `rgba` and `attachment` are the only two names that sentence was ever right
  about, and for those the redirect survives as a clause beside the list:
  `. "rgba" is a slot timeline — put the name in "slot"`. It is read off
  `SLOT_TRACKS`, so the two halves of the message cannot drift apart. A
  **constraint** property written on a bone track (`mix`, `inertia`, `position`,
  …) never reaches this refusal at all — it is refused first, by the row that
  names the field its constraint's name belongs in (§4.12).
- **Nothing derives this page's copy of the eleven from the table.** What keeps the
  two in step is the control that quotes the message — `RF26` in `selftest.ts` —
  which goes red if the list ever widens without this page moving with it, and
  `RF27` holds the slot clause the same way. The selftest's spelling census
  (`PS144`) reads the eleven off the same message and compares them against the
  eleven it actually poses, both ways, which is what makes the list checkable at
  all: it was stated there too until the refusal had something to state. It was
  ten until [#733](https://github.com/firejune/rigc/issues/733) added `inherit`,
  and that landing is what moved `RF26`, this page and the census together.

⚠️ **A `slot` track's `property` is one of the six above, and anything else is a
compile error** — `animation "A" slot "X" has no timeline "P" (it has:
attachment, rgba, rgb, alpha, rgba2, rgb2)`, §5.1's row. Until
[#650](https://github.com/firejune/rigc/issues/650) it was not: the emitter had a
branch for `attachment` and wrote **everything else** as an rgba timeline under
the name you gave it, so a track spelled `sequence` compiled, emitted
`slots.X.sequence` with rgba keys, and was refused one stage later by the gate
(`A00_ROUNDTRIP_PARSE: threw: Invalid timeline type for a slot`) — while the
one-channel spelling of the same mistake was refused at compile as `rgba value
needs 4 channels, got 1`, a message about a key you had not written.

- The six are the emitter's own dispatch table (`SLOT_TRACKS` in
  `src/compile.ts`), in the order `SkeletonJson.readAnimation` switches on
  them — which makes it the format's whole slot switch: `compileTrack` reads it
  to pick its branch, and the refusal prints `Object.keys` of the same object,
  so what you are told a slot accepts is what it accepts.
- **Nothing derives this page's copy of that list from the table**, and it is
  six names long: no `DQ*`/`RD*`/`CUR*` control reads §4.4 (the only gated
  table on this page is §3.5.2.1's, held by `RD01`–`RD06`). What keeps the two
  in step is the control that quotes the message — `RF23` in `selftest.ts` —
  which goes red if the accepted list ever widens without this page moving with
  it. It did, on the day `rgba2` was added
  ([#690](https://github.com/firejune/rigc/issues/690)) and again when `rgb`,
  `alpha` and `rgb2` were ([#730](https://github.com/firejune/rigc/issues/730)),
  which is the mechanism working rather than a hole in it.
- 🎨 **`rgb`, `alpha` and `rgb2` are the SEPARABLE colour timelines, and they
  are not spellings of `rgba`.** Each poses part of the slot's colour and leaves
  the rest exactly where it was: `rgb` writes the light colour's r g b and never
  its alpha, `alpha` writes the alpha and never the r g b, and `rgb2` writes the
  light r g b and the dark colour and never the light alpha. So an `rgb` track
  and an `alpha` track on one slot, each on its own key times, is a fade and a
  tint that move independently — the shape an editor export carries when the
  two were keyed apart. Written as one `rgba` instead, every key would have to
  state the other channel at a time nobody keyed it, and a lone fade has no
  `rgba` spelling at all: an `rgba` key poses the r g b too, pinning whatever
  else tints the slot.
  - An `alpha` key is `[a]` like every other one-channel track, and it is the
    one colour key stored as a **number** rather than a byte (`{ time, value }`),
    so it is not rounded onto 1/255 the way the hex shapes are. It has to be
    **from 0 to 1**: the runtime clamps the posed alpha to that range only after
    interpolating the stored value, so a key of 1.5 would reach full opacity at a
    different time from a key of 1 — a curve nobody keyed. The compiler refuses
    it rather than clamping it (§5.1).
  - `rgb2`, like `rgba2`, needs the slot to declare a setup `dark` (§3.3) — for
    the same reason, measured the same way: without one the file loads and the
    first `state.apply` throws `TypeError: null is not an object` inside
    `RGB2Timeline.apply1`. The refusal names `rgb` as the way out.
  - ⚠️ **Two tracks of one slot that pose the same channel are a compile
    error**, even though they are two properties and the one-track-per-target
    rule above cannot see them: `rgba` beside `alpha` (both pose the alpha),
    `rgba` beside `rgb`, `rgba2` beside `rgb2`, and so on. A colour timeline
    poses its channels at **every** time — the setup value before its first key
    included — so the one the file states later overwrites the other everywhere
    and the first one's keys are read by nothing. `rgb` beside `alpha`, and
    `rgb2` beside `alpha`, share no channel and are the pairs to write.
    `A45_SEPARABLE_COLOR_TIMELINES_OWN_THEIR_CHANNELS_AND_POSE_AS_WRITTEN`
    (§5.2) names the same pair in a file rigc did not write.
- 🎨 **`rgba2` keys the two-colour tint, and the slot has to own one first.** A
  track `{ "slot": "X", "property": "rgba2" }` on a slot whose rig spec declares
  no `dark` (§3.3) is a compile error with the slot named, and it is not a
  formality: the runtime allocates a slot's dark colour only when its setup pose
  has one, so a file keying it without one parses cleanly and then throws in the
  player the first time the animation is applied. `A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN`
  (§5.2) holds the same pairing on a skeleton rigc did not write. 🚫 Both halves
  of the two-colour tint are refused under `--profile spine-html`, whose renderer
  ignores them; the default `spine` profile that `build` runs reports `A12` as
  `PROF` and never applies it.
- The six are every slot timeline the format has; anything else is refused
  here, and would be refused by the runtime's own reader too (`Invalid timeline
  type for a slot`). `A12_NO_DARK_COLOR` refuses `rgb2` — and `rgba2`, and the
  slot field — in a file under the `spine-html` profile (SPEC_COVERAGE §2.1).
  `sequence` is a timeline on an **attachment**, not on a slot — it is the
  family beside `deform`, §4.13.

⚠️ **A `group` track's `property` is one of those two lists or the physics one,
and anything else is a compile error** — `animation "A" group "G" has no timeline
"P" (a bone group has: …; a slot group has: …; a physics constraint group has:
…)`, §5.1's row. It is the only refusal on this page that prints **three** lists,
and the reason is §4.3's: a group's family is decided by the property, so a
property no table claims leaves the compiler with no family to answer for. All
three come from the objects the dispatch reads — `BONE_TRACKS`, `SLOT_TRACKS` and
`PHYSICS_TRACKS` in `src/compile.ts` — and the refusal is raised in
`resolveTargets`, after the group's own existence check and before any member is
resolved against the rig.

- Until [#661](https://github.com/firejune/rigc/issues/661) a group of **bones**
  with a misspelled bone property read `animation "A" targets unknown slot "M"`:
  with no table claiming the property the track fell through to the slot branch,
  and what you were told was that the first member is not a slot — on a file that
  named neither a slot nor that member. A group of **slots** got §4.4's slot row
  instead (`slot "M" has no timeline "P" (it has: attachment, rgba, rgba2)`), which is
  true of the member and names one family out of three on a track whose family
  nothing had determined.
- **A constraint property never reaches it.** `position`, `spacing` and `time` are
  refused first with the field their constraint's name goes in (§4.12), and a
  physics timeline spelled correctly is not an error at all — a group of physics
  constraints is how several are tuned in one track.
- `RF30`–`RF34` in `selftest.ts` quote this message; the three lists are typed
  there rather than read off the tables, so widening any of the three without
  moving this page turns them red.

**A physics constraint's six tuning timelines override §4.6's table for the
length of an animation.** `{ "physics": "hair", "property": "wind", "keys": […] }`
is a wind that rises and falls; `damping` is how fast the jiggle settles,
`strength` how hard it is pulled back, `inertia` how much of the bone's motion it
carries, `mass` the weight it swings with, `gravity` the constant pull. They are
the same field names §4.6 uses at rest, and one key states the whole value — not
a delta from the constraint's own setting.

- ⚠️ **The per-key default is 0 on all six, and 1 on `mix` — not the
  constraint's default.** The parser opens every physics key at 0 and only
  `mix` reassigns it, so a key that omits its number reads 0 for `damping`, not
  the 0.85 §4.6 gives a constraint that states none. rigc never omits a channel,
  so this bites only when you compare an emitted file against an editor export,
  or when you read an export by hand: a `damping` key with no `value` in
  somebody else's file means **0**.
- ⚠️ `mass` is the one whose keyed number is not what the runtime stores. The
  key states a mass and the pose holds `1 / mass`, so a `mass` key of `0` is an
  infinite inverse mass — the constraint stops moving.
- **Four of the seven are bounded, and a key outside its bound is a compile
  error** ([#610](https://github.com/firejune/rigc/issues/610)). `mass` must be
  `> 0`, `damping` must be inside the closed `[0, 1]`, and `mix` and `strength`
  must be `0` or more. `A23_PHYSICS_CONSTRAINT_EFFECTIVE` applies the same four to
  a file rigc did not write, naming the animation, the constraint, the key time
  and the value — so the compiler is where a spec you wrote is refused, and the
  assertion is where an import is.
- ⚠️ **`damping`'s bound depends on the constraint's `fps`, and a rig played at
  60 fps hides it** ([#748](https://github.com/firejune/rigc/issues/748)). The
  decay is `damping ** (60 * step)` with `step` = `1 / fps`, so the exponent is
  exactly 1 at 60 fps, where a negative damping only flips the velocity's sign
  each step and can look like a jiggle settling. Wherever `60 / fps` is not a
  whole number the same negative is raised to a fractional power, which is NaN.
  [measured] one planted `damping` key of −0.5 on the generated physics fixture
  stays finite at 60 fps and at 30 (exponent 2), and is NaN within three steps of
  the key at 45 and at 120. Above `1` every velocity grows on every step and
  diverges at every rate. The refusal names the exponent and the rate for this
  reason, and `T101` holds it to the two-rate measurement.
- ✅ **Both ends of `damping` are inside the bound**
  ([#794](https://github.com/firejune/rigc/issues/794)). `1 ** x` is 1 and
  `0 ** x` is 0 for every positive exponent, so neither depends on `fps`: at `1`
  the velocity never decays and the jiggle holds for as long as it runs, and at
  `0` every velocity is zeroed on every step, so the offset follows the bone with
  no overshoot. Both are finite, at rest and keyed — [measured] 120 steps from
  `Physics.reset` at 60, 45 and 30 fps on the generated physics fixture, which
  `T109`–`T111` hold. ⚠️ `1` is also what a 4.2 file means by saying nothing:
  4.2's parser reads an omitted `damping` as `1` where 4.3's reads `0.85`
  (§4.6), so a rig migrated from 4.2 that keys "the default" keys `1`.
- 🚫 **`inertia`, `wind` and `gravity` are bounded nowhere, and neither is the top
  of `mix`.** The runtime documents no range for the first three, and
  `PhysicsConstraintPose` documents `mix` as "a percentage (0+)" — so a negative
  wind is the other direction and a `mix` of `1.5` is an over-mix. Both are real
  and both compile.
- ⚠️ **A `mix` or `strength` key of exactly `0` is legal where a setup value of
  `0` is not**, and the difference is not an inconsistency: a setup pose says what
  the constraint IS and a key says what it is doing for a stretch. For `mix`,
  `PhysicsConstraint.update` opens with `if (mix === 0) return;`, so muting a
  constraint for part of an animation is what a mix timeline is for. For
  `strength`, 0 takes the restoring term out of the velocity update and leaves
  `damping` and `inertia` applied — the offset is not pulled back *while the key
  holds*, which is "physics released" for that span, and the next key pulls it
  back ([#727](https://github.com/firejune/rigc/issues/727)). At rest the two
  part ways: a `strength` of 0 is a constraint nothing pulls back, which `A23`
  refuses, and a `mix` of 0 is a constraint muted until an animation keys it
  above 0 — the next bullet. A **negative** setup `strength` is refused too, with
  a different sentence, because it is a different rig: the restoring term is
  added to the offset instead of taken out, so the offset is **pushed away** and
  grows — [measured] resting at −100 on the generated physics fixture it grew
  28.35× over 0.5 s with no sign change, where resting at 100 it swung back
  through 0. `A23` reads which sentence to print off the `strength` row of
  `PHYSICS_POSE_RULES` (its `outside` arms), and the key's refusal quotes the
  negative arm from the same row, so the two cannot say different things about
  one number ([#748](https://github.com/firejune/rigc/issues/748)).
- ⚠️ **A setup `mix` of `0` is legal when some animation keys it above 0** ([#743](https://github.com/firejune/rigc/issues/743)).
  A constraint muted *at rest* is a rig whose physics is off until an animation
  switches it on, which is a design rather than the silence `A23` was built for.
  What `A23` refuses is the constraint nothing rescues: muted at setup and keyed
  **nowhere**, or keyed **to 0 only**. [measured] the three are not a matter of
  taste — muted-and-keyed-to-1 poses its bone exactly where the same rig resting
  at 1 does, and keyed-to-0 poses it exactly where one with no timeline at all
  does. The unnamed global timeline counts as a key for every constraint whose
  own `mixGlobal` is set (§3.5), and so does an animation only a slider applies.
  "Keyed above 0" means **any value the timeline poses**, which includes a
  Bezier between two keys of 0 whose handles lie above 0: the runtime
  interpolates through the curve's samples, not between the keys, and such a
  pair moves the bone ([#752](https://github.com/firejune/rigc/issues/752)). The
  same reading is `A36`'s and `A37`'s (§4.12).
- 📏 **What a `strength` key of `0` costs, measured through spine-core** on the
  generated overlay fixture, stepping at 60 fps from `Physics.reset` (#727). With
  no wind or gravity the offset coasts to a limit rather than running away — a
  0.5 s release and a 2.0 s release end **0.95 %** apart — and the restoring key
  takes it from 5.5063 back under 0.01 in **54 steps**. With `gravity -40` pulling,
  the offset travels at terminal velocity for as long as the key holds (178 units
  over 0.5 s, 843 over 2.0 s) and the restoring key still returns it to the
  never-released run's own equilibrium, **39.999969 against 40.000000**, in 13
  steps. No NaN in any of it. ⚠️ The neighbour that does NOT come back is the
  reason `mass` keeps the narrow bound on a key: a keyed `mass` of `0` is NaN from
  the first sub-step and **still NaN after the restoring key**, and a keyed
  `damping` of `2` was still 6.9e4 two seconds later.

**`"physics": "*"` is the physics timeline that names no constraint**
([#726](https://github.com/firejune/rigc/issues/726)). The skeleton file writes it
under the empty name — `animations.<a>.physics[""]`, which `SkeletonJson` loads as
constraint index `-1` without looking anything up — and the runtime then applies it
to every active physics constraint whose own data declares the keyed property
global (`Animation.js:2067-2075`). So what it drives is decided in the **rig spec**,
by the seven `…Global` flags of §3.5, one per value timeline; `reset` is the
exception and resets every physics constraint. [measured] over three constraints of
which two declare `strengthGlobal`, a `"*"` `strength` track keyed to 35 poses those
two at 35 and leaves the third at its setup 100.

- ⚠️ **A `"*"` track that reaches no constraint is a compile error**, naming the flag
  and the constraints that do not declare it: the runtime would walk every
  constraint, skip each, and the file would parse and do nothing. Set the flag on
  the constraints the track is for, or key one by name.
- 🚫 **`"physics": ""` is refused**, and deliberately: the empty string is the
  likeliest shape of a target somebody forgot to fill in, and a forgotten target
  that quietly meant "every global constraint" is the silence this format exists to
  name. The refusal points at `"*"`.
- ⚠️ `"*"` is a track's `physics` field and nothing else — a `group` that lists it
  is refused, and so is a constraint called `"*"` (§3.5).

On a track that names a `group`, one key's `v` may instead be a **map keyed by
member name**, whose entries are each exactly the `v` above — or a `derive`
model the compiler evaluates per member. §4.5.1.

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

🔑 **An attachment key resolves against every skin, not against `default` alone.**
A slot's `attachment` timeline carries a name and **no skin** — the format has no
field for one — so the names a key may use are the union of every skin's
placeholders for that slot, the default skin's included.
`Skeleton.getAttachment` resolves the keyed name at run time through the skin the
skeleton is **wearing** and, failing that, through `defaultSkin` (spine-core
4.3.13 `Skeleton.js:335-346`), so which skin's art a key lands on is the
consumer's, decided by dressing the skeleton rather than by the animation.

- **A name some skins fill and others do not is accepted, and that is the
  format's own semantics** rather than a hole in the check: under a skin that
  lacks it the slot shows nothing, which is exactly what a `null` key says and a
  thing a rig may well mean. What is refused is a name **no** skin holds, and the
  refusal says which skins were searched and what the slot does have (§5.1).
- A rig with **no `default` skin at all** — every attachment in named skins,
  which is the shape an editor export of a multi-skin character gives back — is
  therefore a rig whose attachment keys work. Until
  [#695](https://github.com/firejune/rigc/issues/695) it was not: keys were
  checked against the default skin alone, so a named-skin name was refused as
  unknown, and a rig with no default skin had **every** attachment key refused,
  including ones whose art is in the first named skin. The setup pose resolved
  across skins the whole time (§4.2), so the two halves of one slot disagreed —
  `slots[].attachment: "plain"` was accepted and a key naming `plain` on that
  same slot was not.
- ⚠️ **A `deform` track is the other way round and names its skin outright**
  (§4.11.5), because the format keys a deform timeline on a `skin/slot/attachment`
  triple and a deform run is geometry for one attachment object. An attachment
  timeline has no such field, which is why this one is a union and that one is a
  lookup.

### 4.5 `keys` — times, values, curves

- `t` is in seconds and **must strictly increase** after `lag`/`stagger` are added.
  Seconds, not frames: nothing requires a key to land on any frame grid, and a
  reference rendered at some rate says nothing about where its keys are. Put keys
  where the motion changes.
- **Key times are emitted as float32s like every other number, and never stored
  LATER than you wrote them.** Every emitted number is the shortest decimal naming
  its float32 — the text the editor writes, and the precision the runtime keeps,
  because `spine-core` reads a timeline's frames into a `Float32Array` (issue #716).
  A time that already names a float — `0.5`, `0.2`, the editor's `1.4333333` — is
  written as you wrote it. A time that does not — `2/12` computed in doubles, a key
  moved by `lag` or `stagger` — steps to the **largest float not above it**, never
  to nearest. A key time is a position against the sample grid a player will step,
  and the two directions of a half-step error are not the same size. `2/12 s` and
  `5/30 s` are both 0.16666666…, and the nearest float to that, 0.1666666716…, is
  *larger* than either, so a key stored there is applied at sample **3** of a 12 fps
  playback and not sample 2 — a whole frame late, with nothing raised. On a
  **stepped** timeline (an attachment timeline always is) that is the wrong picture
  rather than a slightly wrong value: the spineboy run's muzzle flare fired a frame
  late for exactly this, on the six-decimal grid rigc emitted until #716, until the
  run's own frame check caught it (issue #99). Stepping down cannot do that; the
  worst it can do is store a key one float early — 1.5e-8 s at 1/6 s — on the sample
  it was written for. ⚠️ What this does **not** protect you from is rounding your
  own times before you write them — write `2/12`, not `0.1667`, and let the compiler
  do the quantising.
- 🚨 **Nor does it protect a stepped key whose time ALREADY names a float.**
  Such a time is written exactly as you wrote it, and the sampler does not arrive
  there: a player — and `sampleAnimation`, and therefore `check` — reaches sample *i*
  by accumulating `1/fps` *i* times, which for many *i* lands a few ULPs **below**
  `i/fps`. `2/12` is saved by the rule above precisely because it is *not* a float;
  `0.25`, `0.5`, `0.75`, `1` and every other multiple of `0.25 s` is one exactly,
  and a stepped key there sits above the sample that was meant to see it. On an
  interpolated timeline that costs a few ULPs of value and nothing else. On a
  **stepped** one it is the whole frame — and on the last sample it is the whole
  event, because there is no later sample to catch it. Measured on rung 5's 6.5 s
  shot at 12 fps: **13 of its 78 sample times are affected** (f6, f15, f18, f21, f24,
  f27, f60, f63, f66, f69, f72, f75, f78), and an attachment key written at the
  declared duration `6.5` never fired at all against an accumulated
  `6.499999999999994` — which read as a frame-change disagreement the pose series had
  already fixed, and cost that run three builds
  ([`2026-08-26-rung5-1`](https://github.com/firejune/rigc/blob/main/bench/runs/2026-08-26-rung5-1/LOOP.md), §8). ⇒ **For a
  stepped timeline, write a time a little below `T` — `T − 1e-6` still works, at
  any magnitude — rather than `T`.** What makes it work is not the size of the step:
  any time below `T` is stored on a float below `T`, because a time that names a
  float is stored at that float and one that does not steps down, and the float
  below `T` is below the accumulated sample too (one float step is 3.0e-8 s at
  0.5 s and 4.8e-7 s at 6.5 s, against the few-ULP shortfall of the sampler). What
  bounds it from the other side is the frame: `T − 1e-6` cannot reach the previous
  sample, 83,333 µs away at 12 fps. One ULP late loses the frame. This is the same
  asymmetry the rule above turns on, one float further in.
- **No key may land past the animation's `duration`.** Nothing that plays the
  animation for the duration it declares ever reaches such a key, so it is a
  compile error — checked on **every timeline**, not just on the latest key in the
  animation, against the float the key is stored at. The tolerance is one float32
  step at the duration — 4.8e-7 s at 5 s, 3.8e-6 s at 32 s — which is the most a
  key you put exactly *on* a duration the float cannot hold is stored past it, so
  such a key is fine. R7's frame of slack does not apply in this direction and
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
- **A named easing on a hold is emitted `stepped`.** When every value channel of a
  key equals the next key's *as emitted* — a `translate` whose x moves and whose y
  does not is **not** a hold — the curve would run from a value to the same value and
  draw nothing, and the editor writes that segment as `"curve": "stepped"`. So rigc
  does too (§10.4, issue #369): the frames are byte-identical either way, and a build
  stops differing from its own editor export on `diff`'s `animations.curve_kinds`. A
  raw `curve` is **not** rewritten — it states the file's own numbers verbatim, and
  the editor's own exports do carry beziers over holds, so a transcription has to be
  able to write one back.
- `curve` is the raw form: **four numbers per value channel**, concatenated in field
  order, as absolute `(time, value)` control points. A short array multiplies
  `undefined` into the cubic and yields `NaN` with no error, so rigc length- and
  finiteness-checks it on the way in (`A05` checks it again in the emitted file).
- A key may carry `ease` **or** `curve`, never both (R6).
- The **last** key of a track can carry neither: there is nothing to ease to, and
  saying otherwise is a compile error.

### 4.5.1 A group track's per-member values — a map, or a model

⭐ **`groups` keys several bones identically, and on a face the whole content of
the motion is that each part gets a *different* number.** That is the complaint
[#295](https://github.com/firejune/rigc/issues/295) filed. `gallery/portrait`'s
held 12° yaw was **20 tracks**, sixteen of them the same two properties on six
sibling bones — identical times, identical easings, identical key counts, six
different values — and exactly **one** of the twenty was a `groups` entry, the
pair that happened to share `cos t`.

Two spellings land, and **which one is right depends on whether the numbers are
decisions or arithmetic.**

**1. `v` may be a map keyed by member name.** Each entry is exactly what `v`
would be for that one member, so nothing about the value shapes in §4.4 changes:

```json
{ "group": "features", "property": "translatex", "keys": [
    { "t": 0,    "v": [0], "ease": "rise" },
    { "t": 0.62, "v": { "eye_l": [5.513], "eye_r": [2.803], "brow_l": [3.85],
                        "brow_r": [1.14], "nose": [-4.574], "mouth": [0.832] }, "ease": "swell" },
    { "t": 2.2,  "v": [0] } ] }
```

A non-map `v` keeps meaning what it always meant — every member gets it — so no
existing spec changes, and the emitted file is **byte for byte** the one the six
separate tracks produced. Reach for this when the six numbers are six
**judgements**: hand-picked swings on a row of hanging locks, a decided offset
per part.

**2. `derive` states the model instead, and the compiler states the numbers.**
Same move as §4.11.1 on the bone half of the same turn:

```json
{ "group": "features", "property": "translatex", "keys": [
    { "t": 0,    "v": [0], "ease": "rise" },
    { "t": 0.62, "derive": { "kind": "yaw", "degrees": 12, "carried": 170,
                             "depth": { "eye_l": 150, "eye_r": 150, "brow_l": 158,
                                        "brow_r": 158, "nose": 192, "mouth": 166 } },
      "ease": "swell" },
    { "t": 2.2,  "v": [0] } ] }
```

⭐ **The depth table is the reason this is worth more than the map, and it is not
the line count.** FACE §2's sharp edge is that **`x` is in the file and `z` is
not** — `grep -c '"z"'` over the worked example's two specs returned `0` and `0`,
and every depth that produced every number lived only in a README beside them. A
`derive` key puts them in the file that uses them, and FACE §3's whole argument
is that a **depth** is the decision while a **residual** is not.

**The two kinds, and the property picks the projection:**

| `kind` | Reads | `translatex` / `translatey` | `scalex` / `scaley` | Worked case |
| --- | --- | --- | --- | --- |
| `yaw` | each member's setup `x` | `d = (x−about)·(cos t − 1) − (depth − carried)·sin t` — FACE §3 | `cos(α − t)/cos α`, `α = atan2(x−about, depth)` — FACE §5 | `gallery/portrait` |
| `pitch` | each member's setup `y` | the same expression with `y` for `x` — a nod | the same | `gallery/nod` |

⭐ **The `property` says which half of the turn a key is.** A turn does two
things to a rigid part on a curved surface: it moves it, and it narrows it. Those
are two Spine timelines rather than two models, and the author has already said
which one the track is — so a `derive` on a property its kind has no projection
onto is refused by name rather than quietly driven by the wrong half.

**The parameters.** `degrees` and `depth` are required; `depth` is
`{ "member": z, … }` on a group track and one number on a bone track.

⚠️ **`z` runs toward the viewer (FACE §1), so a larger depth is nearer.** A nose
in front of the skull surface takes a **bigger** number than the socket beside
it, and a **negative** depth is behind the axis — which is what makes the back of
a head swing the other way (FACE §2). That sign is the one parameter here no
assertion can check, so the closed form is the arbiter: a part with
`depth > carried` gets a **negative** residual, and FACE §3 makes exactly that
the nose diagnostic — *if the nose's residual is not negative, the depths are
wrong*. ([#351](https://github.com/firejune/rigc/issues/351) was this sentence
missing here and stated backwards in the field reference.)

`carried`
(default 0) is **the depth whose shift a parent bone already applies** — FACE
§3's shared-shift split, stated: put a bone at the plate's own origin, key
`−carried·sin t` there, and each member then keys only its residual. That split
is an **auditing** decision before it is a rigging one: a residual is 1–6 units
where a total is 30–40, and nobody can eyeball a wrong sign in the second.
`about` (default 0) is where the axis crosses the driving coordinate, in the
members' shared parent's space.

Six things the construct is bounded by, and each one is a refusal:

**It does no timing.** `stagger` already adds a per-member delay in member order
(§4.3), and MOTION §3.7 is the table it implements. So nothing here takes a
phase, an index or a delay — two mechanisms for one lag would mean two places to
look for it. The two are orthogonal and stay that way: `stagger` moves the times,
`derive` sets the values, and a track can carry both.

**A member the group names twice is refused, at the group.** JSON collapses a
repeated object key in silence, so a repeat inside a `v` map or a `depth` map
never survives `JSON.parse` — the group declaration is the one place it does, and
it is also what decides `stagger`'s member order. A repeat there is two delays
and two values for one bone. An **empty** group is refused for a vacuous
assertion's reason: a track naming one compiles no timeline and gates green.

**A member the map or the depth table omits is refused, never defaulted.** An
absent value is exactly the thing a column of six is written to make visible, and
defaulting it to the identity would key that one bone with a different motion in
silence. A member the group does **not** declare is refused too, naming both.

**A model and a map on one key are two answers to one question** — the same
refusal §4.11.1 has against a `transform` beside a `vertices` run.

**It needs one coordinate space.** Every member's coordinate is read from its
parent's origin and `about` says where the axis crosses it, so members under
different parents have coordinates measured from different origins and the model
would average them. Refused by name, naming the parents. In the worked example
that is what splits `features` (under `faceshift`) from `hair` (under `head`) —
and that split is the shared-shift split itself, so the refusal falls exactly
where the geometry already wanted a seam.

**It is not a way past the arithmetic's consequences.** A foreshortening needs a
positive depth — at or behind the axis there is no front surface to narrow — and
a member turned edge-on, where `cos(α − t) ≤ 0`, would get a scale that *mirrors*
the drawing. Both are refused naming the member. A `carried` on a foreshortening
track is refused too: the closed form never reads it, and a parameter that
changes nothing is a reader's false lead about which model produced the numbers.

📌 **Not everything per-member is a model, and the worked example says so.** Its
iris counter-scale is `1/scaleX` of the socket, and it stays two ordinary
`groups` entries with one shared value each — because a counter-scale belongs to
the **socket**, not to the part: `spark_l` at local `x = −11` takes the same
number as `iris_l` at `0`. A shared value on a group is the correct statement of
that, and forcing it into a per-member model would have been a worse spec that
happened to use the new field.

🔭 **Deliberately not built:** a per-member `v` on a track that names no group (a
value map needs members to name); per-member **easings** or key **times** (the
shared ones are what make a group a group — a member that needs its own timing is
`stagger`, or its own track); and any kind whose parameters are an expression
rather than a name.

### 4.5.2 The `MEMBER` block — the members' values side by side

⭐ **`explain` prints one block per key, a row per member.** The spec states the
rule and the report prints the evaluated numbers — the same division §4.11.2's
`DEFORM` block holds to, and for the same reason: the arrangement the audit needs
is not the arrangement the format has. Spine keys one bone per timeline, so the
six numbers of a head turn are eighty lines apart in the artifact and nobody can
see a wrong sign in them.

**No run reproduces this:** the legend and one group's record lifted out of one `explain` run, which prints the two `bone "faceshift"` records between them
```
group members  (the per-member values of one track, side by side — issue #295)
  ..    a row per member and a block per key, because a wrong sign is visible in a column of six and
  ..    invisible in six tracks. Values are the EMITTED ones, so this and the artifact cannot disagree
  ..    a group whose members all share one value is not here: there is one number and the timelines
  ..    above already carry it. `stagger` is not here either — the shifted key times are on those timelines
  MEMBER  turn  group "features".translatex  t=0.620000  6 member(s)  derive yaw  degrees=12 carried=170  -> the displacement
          dx = (x−about)·(cos t − 1) − (depth − carried)·sin t
            t = 0.20944 rad
            cos t − 1 = -0.021852
            sin t = 0.207912
            shift the parent carries = −carried·sin t = -35.344986
            eye_l       5.513083  <- -62 at depth 150
            eye_r       2.803385  <-  62 at depth 150
            brow_l      3.849789  <- -62 at depth 158
            brow_r      1.140092  <-  62 at depth 158
            nose       -4.574057  <-  0 at depth 192
            mouth       0.831647  <-  0 at depth 166
```

| Row | What it is |
| --- | --- |
| the `MEMBER` line | `animation`, the target (`group` or `bone`) and property, the key's emitted time, the member count, and either `derive <kind>` with the parameters the spec stated and which projection it is, or `stated per member` |
| the formula, then the scalars | the closed form written out, then what the stated parameters got out of it — the two lines that let somebody re-derive a row by hand |
| a row per member | the **emitted** value, then the setup coordinate read off the rig and the depth the spec stated. `5.513` alone is a number a reader takes on trust; `−62` and `150` beside it are a claim they can check |

⭐ **The nose is the row to read first.** It is the only **negative** residual on
that face, because it is the only feature in front of the skull surface — and
FACE §3 makes it the diagnostic: *if the nose's residual is not negative, the
depths are wrong.* That check is arithmetic rather than a render, and this block
is where it is now legible.

**It quotes; it does not re-derive.** Every value is the one the compiler
emitted, so the block and the artifact cannot disagree — a report that evaluated
the model a second time could agree with itself while the file said otherwise.

**What it deliberately does not print.** A group whose members all **share** one
value: there is one number there and the timelines above already show it on every
member, so a table of six identical rows would be a tautology wearing a
measurement's clothes — the worked example's two iris counter-scale groups are
exactly that case and are right to be absent. And `stagger`, whose per-member
offset is visible where it belongs: on each member's own timeline, in the shifted
key times. One lag, one place.

### 4.6 `physics` — the tuning table

`name → { bone, x?, y?, rotate?, scaleX?, shearX?, inertia?, strength?, damping?,
mass?, wind?, gravity?, mix?, fps?, limit? }`. These are emitted into the 4.3
`constraints` array. Seven of them — the six tuning numbers and `mix` — can also
be **keyed over time** as `tracks` entries naming this constraint (§4.4); this
table is the value at rest, and a timeline overrides it while it plays. `mass: 0` becomes an infinite inverse mass and a `damping` above 1
never settles — both are `A23`, here and on every timeline key that states them
([#610](https://github.com/firejune/rigc/issues/610)); a `damping` below 0
is refused as well, and whether it is NaN depends on `fps` — §4.4
([#748](https://github.com/firejune/rigc/issues/748)). `damping` is `[0, 1]`
with both ends in: `1` never decays and `0` zeroes the velocity on every step,
both finite at every rate ([#794](https://github.com/firejune/rigc/issues/794)).
⚠️ An omitted `damping` is `0.85` to 4.3's parser (`SkeletonJson.js:308` in
4.3.13) and `1` to 4.2's (`SkeletonJson.js:242` in 4.2.120), so a constraint
migrated from 4.2 that stated nothing may arrive stating `1` — which builds. ⚠️ `strength: 0` is `A23` **here and not on a key**:
at rest it is a constraint nothing pulls back, and on a key it is a release somebody
asked for, which §4.4 states with the measurement behind it
([#727](https://github.com/firejune/rigc/issues/727)). A negative `strength` is
`A23` here and on a key, and here its sentence is its own: the offset is pushed
away and grows ([#748](https://github.com/firejune/rigc/issues/748)). `mix: 0` is the one value
here an animation can answer for: it rests the constraint **muted**, which is
legal, and `A23` names it only when no timeline in any animation keys that `mix`
above 0 — on a key it is the mute for a span (§4.4, [#743](https://github.com/firejune/rigc/issues/743)). None of the
three is a compile error — a setup value this table states reaches the gate, where the whole
file can be read; it is a **key** outside its bound that `build` refuses (§4.4). Every field but `bone` and `note` must be a finite
number: a non-number is rounded to `NaN` and emitted as `null`, which the runtime
reads as **zero**, so `"mass": "heavy"` used to ship a constraint that never
settles with no word from anybody (#307).

`mix` is a player-side `AnimationStateData` config and is **not** emitted into
skeleton JSON — which is why nothing looked at it until the parser did: it is
`{ "default": <seconds>, "pairs"?: [["<from>", "<to>", <seconds>], …] }`, and a
`default` that is not a number passed the compiler, the gate and the round trip
before becoming a `NaN` mix duration in the player.

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

### 4.9 `ik` — mixing an IK constraint in over time

The rig spec declares the constraint (§3.5); this keys it. 4.3 writes the group as
`animations.<a>.ik.<constraint>` — **one unnamed timeline per constraint**, so the
constraint name is the only target there is, and there is no timeline name between
the two the way a bone has `rotate` and `translate`.

```json
"animations": {
  "walk": {
    "duration": 0.8666666,
    "loop": true,
    "tracks": [],
    "ik": [
      {
        "constraint": "rear-leg-ik",
        "keys": [
          { "t": 0,         "mix": 1, "softness": 0 },
          { "t": 0.2666666, "mix": 1, "softness": 14, "ease": "settle" },
          { "t": 0.5333333, "mix": 0, "softness": 0 },
          { "t": 0.8666666, "mix": 1, "softness": 0 }
        ]
      }
    ]
  }
}
```

⚠️ **Every number above is invented.** They are shaped like a walk cycle — the leg
under load is solved to the ground and the leg in flight is let go — and nothing
here was measured off a real rig. Copy the shape, not the values.

| Field | Meaning | Absent means |
| --- | --- | --- |
| `mix` | 0..1, how much of the solved rotation is applied | `1` |
| `softness` | distance from full reach at which the bones stop straightening | `0` |
| `bendPositive` | two-bone bend direction | **the rig's** (`true` if the rig says nothing) |
| `compress` | one-bone IK scales the bone down to reach a close target | **the rig's** (`false` if the rig says nothing) |
| `stretch` | scales the bone up to reach a far target | **the rig's** (`false` if the rig says nothing) |

- **`mix` and `softness` are the two curve channels, in that order.** A raw
  `curve` is therefore 8 numbers, and the three booleans are stepped by nature —
  nothing interpolates a bend direction.
- 🚨 **The three booleans are the one place a key's absent value is the RIG's and
  not the format's.** The parser reads them twice with the same defaults — once on
  the constraint (`SkeletonJson:155`) and once on **every timeline key**
  (`:912`) — so a key that omits `bendPositive` does not inherit the constraint's
  value, it asserts `true`. A rig declaring `bendPositive: false` under a timeline
  that keys only `mix` therefore bent the *other* way for the whole animation,
  with the field still in the file and inert: four builds differing only in those
  values posed one pose, and the gate was green throughout (issue #273). rigc now
  stamps the rig's value onto every emitted key, so the declaration reaches the
  runtime. **Stating a flag on every key still overrides the rig** — the format
  keys them per key on purpose, a bend that flips partway through is a real thing
  to write, and it is what the editor's own export does.
- 🔁 **A spec that came out of `ingest` (§0.3) states all three on every key, and
  that is not noise.** The stamping above reads a silent key as *"the rig's
  value"*, which is right for a spec somebody wrote; in a **decompiled** spec a
  silent key means *"the parser's default"*, because that is what the export the
  spec came from actually plays. The two readings differ exactly when the rig
  declares a non-default flag and the export's keys omit it — measured: an ik
  timeline keying only `mix` under a constraint declaring `bendPositive: false`
  rebuilds with `bendPositive: false` on every key if the flag is left silent,
  and with `true` — what the source plays — when `ingest` writes it out. So
  `ingest` restates every field any key of a track names, at the parser's default
  where the source omits one — in the **spec**. The emitter then leaves each such
  value out of the file again wherever it is the one the parser reads without it
  (§10.6c), so the rebuild is the source's own text, and `CONSTRAINT_KEY_RESTATED`
  is printed only for a value the file would still carry. On rigc's own output the
  two agree and the round trip is byte-identical.
- `mix` outside `0..1` is a compile error: `IkConstraintPose.mix` is documented as
  a percentage. A **transform** mix is documented *unbounded*, which is why §4.10
  has no such rule — the asymmetry is the runtime's, not ours.
- 🚨 **A field stated on one key and not the next is a compile error.** This is the
  refusal worth reading twice, because the format's shape invites the mistake: the
  parser reads every field **fresh per key** with its own default, so a key that
  omits `softness` does not hold the previous key's 14 — it snaps to 0, and
  interpolates down to it on the way. It loads. It plays. It is not what you
  wrote. So state a field on every key of a track or on none of them; writing the
  default out loud is how you opt in.
- Its last key counts towards the declared duration like any other (R7).

rigc refuses four things here:

| You wrote | You get |
| --- | --- |
| a constraint the rig does not declare | `keys unknown ik constraint "X"; the rig declares ik constraint(s): …` |
| a `transform` constraint's name | `keys "X" as an ik constraint, but the rig declares it as a "transform" constraint` |
| `softness` on the first key only | `key 0 names "softness" and key 1 (t=…) does not … it would snap to 0` |
| `mix: 1.5` | `mix is 1.5, outside 0..1 — the runtime documents it as a percentage 0-1` |

🎛️ **A constraint this section never keys** — resting at `mix` 0 with no `ik` track
in any animation lifting it — is refused by `A47` with three doors: rest it above 0,
key it here, or declare that the consumer drives its mix in the rig spec's
`invariants.consumerDrivenMix` (§3.7), for an ik a game turns on from code. The
third is a statement about the object, not a way past the gate: what it buys is a
SKIP by name (§4.12).

The type check matters because the parser resolves a timeline's target by name
**and** type: `findConstraint(name, IkConstraintData)` misses a transform
constraint of the same name, returns null, and `readAnimation` throws — in the
consumer's process, which is late. `A34_CONSTRAINT_TIMELINE_TARGETS` checks the
same two from the other side, plus one thing the compiler cannot produce and a
hand-edited file can: an **empty key array**, which the parser skips in silence.

🖼️ **Worked example: [`gallery/walk`](https://github.com/firejune/rigc/tree/main/gallery/walk)** — two mirrored two-bone leg chains
whose `mix`, `softness` and `bendPositive` are keyed through a stance and a swing,
with the README's table of what each key is for.

### 4.10 `transform` — turning a muted transform constraint on

Same shape as §4.9 and the same absent-means-default rule; six mixes instead of
two. The idiom this exists for is an aim rig: the constraints are declared with
`mixRotate: 0` in the rig spec — muted at setup, so the figure is posed by its own
bones — and the animation that needs them mixes them in.

```json
"animations": {
  "aim": {
    "duration": 0.3333333,
    "loop": false,
    "tracks": [],
    "transform": [
      { "constraint": "aim-head-transform",      "keys": [{ "t": 0, "mixRotate": 1 }] },
      { "constraint": "aim-torso-transform",     "keys": [{ "t": 0, "mixRotate": 0.6 }] },
      { "constraint": "aim-front-arm-transform", "keys": [{ "t": 0, "mixRotate": 1 }] }
    ]
  }
}
```

⚠️ **Every number above is invented**, including the 0.6 — a torso that follows the
aim less than the head is a plausible rig and not a measured one.

A single key at `t: 0` is the whole timeline here, and that is not a degenerate
case: it says "while this animation is playing, this constraint is on", which is
exactly what a mix that was 0 at setup needs said.

| Field | Absent means |
| --- | --- |
| `mixRotate` | `1` |
| `mixX` | `1` |
| `mixY` | **this key's own `mixX`** — not `1` |
| `mixScaleX` | `1` |
| `mixScaleY` | `1` |
| `mixShearY` | `1` |

- **Six curve channels, in the order above.** A raw `curve` is 24 numbers.
- No range check: every one of these is documented **unbounded**, and an over-mix
  above 1 is a real editor idiom rather than a mistake.
- ⚠️ A mix is only read by the runtime if the constraint declares the matching
  `properties` mapping (§3.5). Keying `mixScaleY` on a constraint that maps
  rotation only is dead data — legal, loaded, and it moves nothing. ⚠️ So is every
  mix a key **omits**, and that one looks like a rescue: the parser reads an
  omitted mix as 1, so a key of `mixRotate: 0` alone on a rotate-only constraint
  carries five mixes of 1 that nothing reads. `A48` judges only the mixes of the
  properties the constraint drives (§4.12).
- The refusals are §4.9's, with `transform` in place of `ik` — and so is the third
  door: a transform resting muted on every mix it reads that no key here lifts is
  refused by `A48` with *rest it above 0, key it, or declare that the consumer drives
  its mix* in `invariants.consumerDrivenMix` (§3.7, §4.12).

### 4.11 `deform` — moving an attachment's vertices

The one timeline whose keys mean something different depending on what they are
attached to, and the only one keyed on a **skin / slot / attachment** triple:
`animations.<a>.attachments.<skin>.<slot>.<attachment>.deform`.

```json
"animations": {
  "hoverboard": {
    "duration": 1.6666666,
    "loop": true,
    "tracks": [],
    "deform": [
      {
        "slot": "board",
        "attachment": "board",
        "keys": [
          { "t": 0 },
          { "t": 0.5,       "fromVertex": 4, "vertices": [0, -7, 0, -7], "ease": "settle" },
          { "t": 1.1666666, "fromVertex": 4, "vertices": [0, 4, 0, 4],  "ease": "settle" },
          { "t": 1.6666666 }
        ]
      }
    ]
  }
}
```

⚠️ **Every number above is invented** — the vertex indices, the offsets and the
times alike. A real deform's numbers come from the geometry it is bending, and
there is no way to guess which vertices of somebody's board are its middle.

| Field | Meaning |
| --- | --- |
| `skin` | which skin the attachment lives in. Absent = `"default"` |
| `slot` | the slot |
| `attachment` | the attachment's **placeholder** name inside that skin and slot |

Per key:

| Field | Meaning |
| --- | --- |
| `vertices` | the run: consecutive numbers copied into the deform array from the start index on, `x, y` per vertex or influence — an **odd** count is legal and ends on a lone x (§ the 📌 below). **Absent** = back to the setup pose |
| `transform` | the run stated as a **model** instead, evaluated over the attachment's own geometry — §4.11.1. Never with `vertices`, `fromVertex` or `offset` |
| `fromVertex` | which VERTEX the run starts at — rigc translates it |
| `offset` | the same start as a raw index into the deform array. Never with `fromVertex` |
| `ease` / `curve` | one channel, and it eases the **blend**, not a coordinate |

**The target is any attachment that has a vertex array** — a mesh, a bounding
box, a clipping polygon, or a **path**. The array a key edits is that
attachment's own, so everything below about runs, start indices and the two
encodings reads the same whichever it is. A region attachment has no vertex array
and is refused by name.

⭐ **A path's vertices are its control points** — knots and their Bezier handles
alike, in the order §3.5.1 lists them — so a run covers them in that order and a
`fromVertex` counts them the same way. Its deform array is `vertexCount * 2` long
unweighted, and one pair per influence weighted, exactly as a mesh's is. What is
and is not measured on one:

- `A35_DEFORM_KEYS_FIT_THE_ATTACHMENT` measures the run against that length, as
  it does for every other target.
- `A39_DEFORM_KEEPS_TRIANGLE_WINDING` reports **SKIP**, naming the slot and
  saying the attachment has no triangles. A path is knots and handles; there is
  no winding to keep, and reporting a pass for a measurement that did not happen
  is the one thing an assertion here may not do.
- **`lengths` is not re-measured, and cannot be.** It is a field of the
  attachment (§3.5.1) and the format has nowhere to put a per-key one, so the
  array every exporter writes — rigc's included — is the **setup** measurement.
  `PathConstraint.computeWorldPositions` reads it only when `constantSpeed` is
  `false`; under the parser's default, `true`, it re-measures the curve from the
  posed vertices every frame. So a path constraint follows the deformed curve as
  written, and under `constantSpeed: false` it traverses the deformed curve at
  the **setup** spacing. That is the format's behaviour rather than rigc's
  choice, which is why it is stated here instead of refused: an editor export of
  the same rig does the same thing.

Four things are worth having straight before you write one.

**A key is a sparse edit, and a key with no `vertices` is the setup pose.** The
parser builds an array as long as the attachment's own, copies your run into it at
`offset`, and leaves the rest at zero. So a run only has to cover the vertices that
move, and the `{ "t": 0 }` and `{ "t": 1.6666666 }` keys above are how a looping
deform starts and ends undeformed. That is the format's own encoding for it, not a
convention — which is why rigc refuses a start index on such a key: there would be
nothing for it to point at.

**Offsets, not positions.** The numbers are relative to the setup geometry in both
encodings. On an unweighted attachment the parser literally adds the setup vertex
back on load; on a weighted one zero *is* "unmoved".

**The array is indexed by vertex on an unweighted attachment and by bone influence
on a weighted one.** Its length is `vertices.length` in the first case and
`vertices.length / 3 * 2` in the second, because a weighted attachment stores
`x, y, weight` per influence. A vertex with three bones on it therefore occupies
**three** pairs, each in that bone's own bind space. This is the whole reason
`fromVertex` exists and the whole reason it is sometimes refused:

- on an **unweighted** attachment `fromVertex` always works — vertex *v* is array
  index `2v`, exactly;
- on a **weighted** one it works while every vertex the run covers has exactly one
  bone on it, and rigc computes the true start index for you (which is *not*
  `2v` — earlier multi-bone vertices push it along);
- on a **multi-bone** vertex it is a compile error, and deliberately so. One
  `x, y` for such a vertex is not a thing the array can hold: its world offset is
  `Σ weightᵦ · Mᵦ · offsetᵦ` over its bones, so a single pair only means what you
  meant if every influencing bone happens to share one world matrix. rigc will not
  guess. Either key the control bone instead — which is what a rigc-generated ring
  or ribbon mesh is *for* — or write the bind-space pairs yourself and start the
  run with `offset`. The refusal tells you the index that vertex starts at.
  ⭐ A **`transform` key** (§4.11.1) is the exception, and for a reason that does
  not extend here: rigc evaluates that model itself, so it can state the
  displacement in world and push it into every influence through that bone's own
  inverse. `fromVertex` hands it a number you wrote in a space it cannot know.

**The curve eases the blend.** A deform timeline has exactly one channel and
`readCurve` builds it between **0 and 1** — the fraction of the way from this key's
geometry to the next one's. So a named `ease` behaves as it does anywhere, and a
raw `curve` is 4 numbers whose value axis runs 0..1, not the range of your vertex
offsets.

rigc refuses these, and the first is the quietest defect in the whole animation
half of the format:

| You wrote | You get |
| --- | --- |
| a run that ends past the array | `the run starts at deform index 4 and is 6 long, which ends at 10; this attachment's deform array is 8 long (4 vertices)` |
| `fromVertex` on a multi-bone vertex | `"fromVertex" counts VERTICES, and this attachment is weighted … vertex 2 has 2 of them` |
| an attachment that is not there | `slot "flat" in skin "default" has no attachment "flatt" (it has: flat)` |
| a deform on a region attachment | `a deform timeline keys the vertices of an attachment, and this one is a "region"` |
| a run past a path's control points | `this attachment's deform array is 18 long (9 vertices)` — the same bound as any other target, counted in the control points §3.5.1 declares |
| `transform` beside a `vertices` run | `the key carries both a "transform" and a "vertices" run, and they are two answers to one question` |
| `transform` with `fromVertex` or `offset` | `A transform is a model of the whole attachment and is evaluated over all 25 of its vertices, so it always starts at deform index 0` |
| a `transform` on an attachment whose weights do not close at 1 | `this one has a vertex the arithmetic cannot place — vertex 1's 2 weights sum to 0.9000 rather than 1` |

The overrun is the one to fear. `readAnimation` copies with
`Utils.arrayCopy(vertices, 0, deform, offset, vertices.length)` into a
`Float32Array`, and writing past the end of a typed array is a **no-op in
JavaScript** — no throw, no warning, no `NaN`. A run one pair too long loses its
tail and deforms the rest of the mesh correctly, which looks nearly right, and
"nearly right" is the hardest kind of wrong to find.
`A35_DEFORM_KEYS_FIT_THE_ATTACHMENT` checks the overrun from the other side, on the
emitted file, measuring the array's length from the attachment rather than assuming
an encoding.

📌 **A run is not required to be an even number of numbers, and it is not required
to start on an even index.** Two rows stood here saying otherwise until issue
#576. Nothing in either reader aligns a run to a pair: `SkeletonJson` does
`Utils.arrayCopy(vertices, 0, deform, offset, vertices.length)` — a raw copy, at
the raw index the key gives — and `SkeletonBinary` reads a count and a start and
fills `for (let v = start; v < end; v++)`. So a run may begin and end mid-pair,
which is exactly what an editor's trimmed delta run looks like: `spineboy-pro`'s
`hoverboard-board` key starts at 1 and carries 147 numbers of a 148-long array,
the whole delta minus one leading zero.

⭐ **An odd run's last number is an x with no y beside it, and that is a
statement, not an accident.** It moves that vertex in x and leaves its y at the
setup value, because the parser copies your numbers and touches nothing else. It
is also the reason the rule could not stay as an authoring convenience: padding a
`0` to make the run even *changes what plays* wherever that setup y is non-zero,
so there is no second spelling of such a key — refusing it would mean no
transcription of that file can be written in this spec at all. `A35` reached the
same conclusion from the other side in issue #262, and between that fix and this
one the two halves of rigc disagreed about what the format holds.

⚠️ What you lose with those rows is a typo filter: `offset: 3` written where
`fromVertex: 3` was meant now compiles. It always half-did — `offset: 4` meant as
vertex 4 lands on vertex 2 and was never refused — so read the field name twice.
`offset` is an index into the deform array; `fromVertex` is a vertex.

🖼️ **Worked examples, and they use a deform for four different things** — all
four are repository material rather than part of the published package, so the
links go to GitHub.
[`gallery/squash`](https://github.com/firejune/rigc/tree/main/gallery/squash) — a 9-vertex ball squashed about its contact point,
from the two affine transforms its keys now **state**.
[`gallery/portrait`](https://github.com/firejune/rigc/tree/main/gallery/portrait) — a 2.5D head turn, where the keys are the
**projection of a yaw** rather than a squash: two grid meshes whose columns are
placed to sample a cosine, and a measured account of the angle past which the
mesh folds. [`gallery/flex`](https://github.com/firejune/rigc/tree/main/gallery/flex) — a leaf whose blade bends on a
`contour` mesh no bone can bend, and the measurement that picked the model.
[`gallery/nod`](https://github.com/firejune/rigc/tree/main/gallery/nod) — the
projection on the **other** axis (a `pitch`, §4.11.1), and a **travelling wave**
whose only moving parameter is `phase`: each of its three meshes is laid out for
the model that bends it, so the rows are the argument rather than the vertex
count.

📘 **[FACE.md](FACE.md) is the recipe for that second case**, and it is where the
grid questions this section leaves to its reader are answered: where to put the
columns, why the perimeter has to come first in the vertex list (`hull` is read
off the triangles, §3.4), the closed form for
the angle at which any column pair folds — and the fact that a folded key passes
`A35` and every other assertion, so the arithmetic has to be checked before the
build.

---

### 4.11.1 `transform` — a deform key that states the model instead of the table

⭐ **A table of numbers is the wrong way to say a deformation model, and `generator`
(§3.4) already says so about geometry.** This is the same move on the animation
half: the key names a transform, the compiler evaluates it over the attachment's
own setup geometry, and the emitted file carries the numbers.

The case that filed it ([#294](https://github.com/firejune/rigc/issues/294)):
`gallery/portrait`'s held 12° head yaw was **160 hand-written vertex offsets
across 8 keys**, and not one of them was a judgement — every one is
`x·(cos t − 1) − z·sin t` at a different column (FACE §1). A second angle was a
second full table, which is why that example's own angle sweep needed a
throwaway script that never made it into the repository. It is now four lines:

```json
"deform": [
  { "slot": "head", "attachment": "head", "keys": [
      { "t": 0 },
      { "t": 0.62, "transform": { "kind": "yaw", "radius": 170, "degrees": 12 }, "ease": "swell" },
      { "t": 1.5,  "transform": { "kind": "yaw", "radius": 170, "degrees": 12 }, "ease": "settle" },
      { "t": 2.2 } ] }
]
```

⚠️ **`radius` above is a real number off that example's depth table, and the rest
of this section's parameters are invented.** A radius, an amplitude and a point a
scale is about are all measurements of a shape the drawing only implies — the
compiler evaluates what you state and states nothing itself.

**The five kinds.** Each is one closed form, and each ships because a worked
example needed it:

| `kind` | Parameters | What it evaluates | Worked case |
| --- | --- | --- | --- |
| `yaw` | `radius` **or** `depth`, `degrees`, `about` | `dx = (x−about)·(cos t − 1) − z·sin t`, with `z = √(radius² − (x−about)²)` from a cylinder or `z` read per vertex off a depth map — the 2.5D turn (FACE §1) | `gallery/portrait` |
| `pitch` | the same | the same expression with `y` for `x` — a nod rather than a turn | `gallery/nod` |
| `affine` | `scale`, `about` | `dx = (sx−1)·(x−ax)`, `dy = (sy−1)·(y−ay)` — a scale about a fixed point | `gallery/squash` |
| `wave` | `amplitude`, `wavelength`, `phase`, `along`, `axis` | `d = amplitude · sin(2π·along/wavelength + phase)` | `gallery/nod` |
| `bend` | `amount`, `from`, `to`, `power`, `along`, `axis` | `d = amount · u^power`, `u = (along − from)/(to − from)` | `gallery/flex` |

`along` names the coordinate a wave or a bend reads and `axis` the one it
displaces; they cannot be the same coordinate, because reading and displacing one
axis is a stretch and `affine` states that. `power: 1` is an affine shear and
`power: 2` is a cantilever — flat at `from`, so a part held at one end bends
instead of tilting. `about` defaults to 0 (or `[0, 0]`), `phase` to 0 and `power`
to 2; nothing else has a default.

Six things this construct is bounded by, and each one is a refusal rather than a
convention:

**It covers every vertex, always.** A transform is a model of the attachment, not
an edit of part of it, so it starts at deform index 0 and runs to the end — which
is why `fromVertex` and `offset` are refused beside it. A model applied to part
of a run leaves a **step at the run's edge**, and that is one half of the defect
[#313](https://github.com/firejune/rigc/issues/313) records. If you want a
partial run, write it.

**There is no `parallax` kind, and the reason is worth stating.** A pure depth
slide — `d = z · offset`, no angle — is this form with a term dropped: subtract
them and the whole remainder is `u·(cos t − 1)`, independent of the depth, so
the slide *is* a turn at a small angle (at 16° the gap is 2.32px, at 1°
0.0091px, quartering with each halving). 🚨 And what it is for is not rigc's to
state: a depth slide is a **camera** move, driven by a pointer rather than by a
clock, and this spec is a timeline. What rigc states about a raised surface is
the **angle** it may turn through, and — for a soft one — how it answers an
**impact**. The camera belongs to whatever draws the result.

**A turn projects off one surface, stated one way.** `"depth": true` reads each
vertex's `z` off the map its attachment's generator names (§3.4) instead of
deriving it from a `radius`; the closed form does not change, only where `z`
comes from. Saying both is refused — they are two answers to how far forward a
vertex sits, and a key carrying both leaves a reader unable to say which one the
output came from. So is `"depth": true` on an attachment that named no map,
rather than a silent fall back to a cylinder.

**It is not a `rigc tween`.** MOTION §7 refuses a command that generates
in-betweens and this is not one: the transform is evaluated **at one key**, from
parameters that key states, and what happens between two keys is still the
timeline's own single 0..1 blend channel. Sweeping an angle is editing one number
per key.

**It works on a weighted attachment, and reads world coordinates there**
([#389](https://github.com/firejune/rigc/issues/389)). On an unweighted
attachment the deform array is one `x, y` per vertex in the slot bone's space,
and the model is evaluated in that space. The same is true of a weighted
attachment while every vertex has exactly one bone and they all share it — the
array is that bone's bind space. **Past that, the model is evaluated at each
vertex's setup *world* position instead**, and the displacement it produces is
written into every influence as `Mᵢ⁻¹ · D`, where `Mᵢ` is that bone's setup world
rotation. The runtime then composes `Σ wᵢ · Mᵢ · Mᵢ⁻¹ · D`, which is `D` because
the weights close at 1; and once a bone moves, the displacement is carried by the
same blend that carries the vertex. Nothing is guessed and nothing is
approximated.

⚠️ **So `radius`, `about`, `from` and `to` change units the moment a second bone
touches any vertex** — they are read in the attachment's own space in the first
case and in world coordinates in the second. `explain`'s `DEFORM` block says
which, on a `derived` line that only appears on the world path; if you add a
`soft` region (§3.4) to a part that already carries a turn key, read that line
and check the numbers still mean what they meant. A `radius` smaller than the
world coordinates it now spans is refused by name rather than clamped, which is
the loud version of the same event.

The one weighting this cannot cover is a vertex whose weights do **not** sum to
1: `D · Σ wᵢ` is the whole identity, so there is no run that lands such a vertex
where the model says. That is refused by name, at
`A20_MESH_WEIGHTS_COHERENT`'s own 1e-3.

`fromVertex` on a multi-bone vertex is still refused (§4.11), and the difference
is worth stating because the two look alike: `fromVertex` hands rigc a pair
**you** wrote, in a space only you know, so rigc would have to guess. A model is
a displacement rigc evaluates itself, so it can put it in world and push it
through each bone.

**It is gated like any other key.** `A35_DEFORM_KEYS_FIT_THE_ATTACHMENT` and
`A39_DEFORM_KEEPS_TRIANGLE_WINDING` see the emitted numbers and know nothing
about where they came from. A `yaw` past its fold angle folds the mesh and A39
says so — the construct removes the transcription, not the arithmetic's
consequences. One kind is the exception and it is an exception with a proof:
`affine` refuses a determinant at or below zero, and above zero a positive
determinant means no triangle **can** reverse.

**A model that evaluates to nothing is refused too**
([#350](https://github.com/firejune/rigc/issues/350)). Every parameter can be
individually legal and the model still come out as a **run of zeros** — a `wave`
whose wavelength puts every vertex on a zero crossing, a `bend` over a span the
part barely enters. The key then claims a deformation, emits the identity and
gates green: `A35` is right that the run fits and `A39` is right that no triangle
moved, so the compiler is the only place it can be said. ⭐ **What distinguishes
it is where the identity is stated.** A key that *means* the setup pose says so
in its own parameters — `degrees: 0` (or any whole revolution), `amplitude: 0`,
`amount: 0`, `scale: [1, 1]` — or carries no run at all, and those compile. The
refused pair is parameters that state a deformation beside an evaluation that is
the identity. The message names the vertex count, the largest value the closed
form reached before quantising, and the measured fact behind the usual cause: for
a wave, the closest two distinct coordinates it read and the ratio the wavelength
makes against them.

**It is auditable.** `explain` prints the model, the scalars the closed form
derived from it, and every offset it produced — the emitted ones, not a second
evaluation. This is the `t=0.62` key of the spec above, whole:

```bash
bun cli.ts explain --rig gallery/portrait/rig.json \
                   --motion gallery/portrait/motion.json --out /tmp/explain
```

```
      t=0.62    deform[0..50]  25 pair(s)                      stepped
               transform yaw  radius=170 degrees=12
               dx = (x−about)·(cos t − 1) − z·sin t,   z = √(radius² − (x−about)²)
                 t = 0.20944 rad
                 cos t − 1 = -0.021852
                 sin t = 0.207912
                 centre shift = −radius·sin t = -35.344986
               25 vertices, largest offset 35.344986px at vertex 2
                 v  0 (-7.17493, 0)  v  1 (-22.413595, 0)  v  2 (-35.344986, 0)  v  3 (-27.65817, 0)
                 v  4 (-14.255108, 0)  v  5 (-14.255108, 0)  v  6 (-14.255108, 0)  v  7 (-14.255108, 0)
                 v  8 (-14.255108, 0)  v  9 (-27.65817, 0)  v 10 (-35.344986, 0)  v 11 (-22.413595, 0)
                 v 12 (-7.17493, 0)  v 13 (-7.17493, 0)  v 14 (-7.17493, 0)  v 15 (-7.17493, 0)
                 v 16 (-22.413595, 0)  v 17 (-35.344986, 0)  v 18 (-27.65817, 0)  v 19 (-22.413595, 0)
                 v 20 (-35.344986, 0)  v 21 (-27.65817, 0)  v 22 (-22.413595, 0)  v 23 (-35.344986, 0)
                 v 24 (-27.65817, 0)
```

The curve reads `stepped` where the spec says `"ease": "swell"`, and that is
§4.5's hold rule rather than a discrepancy: the next key emits these same 25
offsets, so the segment between them would draw nothing and is written the way
the editor writes it.

📌 **Float behaviour, stated.** The closed forms are evaluated in float64,
quantised onto the model's own 1e-6 grid and emitted as that value's float32 name
like every other number, so the same spec emits the same bytes and
`A18_DETERMINISTIC_EMIT` proves it on a second compile. The grid is absolute on
purpose: a model's identities — a wave sampled on its zero crossings, a whole
revolution — are exact zeros float64 misses by ~1e-16, and the refusal of a key
that states a deformation and evaluates to nothing is decided on it (issue #350);
a float32 alone is relative and has no zero to land on. The runtime then loads
the numbers into a `Float32Array`, which is equally true of a hand-written table —
the difference the generator makes is that the numbers now agree with a stated
model instead of with a transcription.

🔭 **Both adjacent asks have since landed.**
[#295](https://github.com/firejune/rigc/issues/295) was the same complaint about
a different table — the **bone** tracks of the same turn, where the missing
number is a depth rather than a vertex — and **§4.5.1** is that construct: a
`derive` kind on a group track, under the same rules as this one. The per-key
`DEFORM` report block ([#316](https://github.com/firejune/rigc/issues/316))
quotes the model above rather than re-evaluating it — **§4.11.2**.

---

### 4.11.2 The `DEFORM` block — what a key does to the geometry

⭐ **`explain` prints one block per deform key, and a rollup per animation.** The
block above says what a key *claims*; this one says what it *did* to the
triangles. It is a report and it never gates: `explain` takes no `--profile` and
exits 0 on a rig `build` would refuse, so the figures are readable on the build
that is failing.

**No run reproduces this:** abridged — the `WORST` rollup follows key 1 here, where the run prints `head/head`'s other two keys and all four of `hair_bang/hair_bang` between them
```
deform  (what each key does to the geometry — figures with names, never a bar; issue #316)
  ..    every key measured at its OWN time against the same pose with the deform CLEARED, so the
  ..    denominator is 1.000 by definition and a NEGATIVE area ratio IS a reversed triangle
  ..    the FRAME is on each key line: on a track, or the slider that applies the animation with the
  ..    dial value its mapping was inverted to — a slider picks the time, so the key's time IS it
  ..    stretch is the two singular values of the map from the cleared triangle to the deformed one —
  ..    the worst stretch and the worst squash the drawing takes there; their product is |area ratio|
  ..    coverage is NOT here: it is rasterised from the uvs, which no deform moves, so the figure on
  ..    the `meshes` line below is already the deformed one
  DEFORM  turn  default/head/head  key 0  t=0.000000  authored table
          frame      played on a track
          moved      0 of 25 vertices — this key IS the setup pose, so every figure is the identity (32 triangles, all kept)
  DEFORM  turn  default/head/head  key 1  t=0.620000  transform yaw  radius=170 degrees=12
          frame      played on a track
          moved      25 of 25 vertices, worst 35.3450px at v2
          area       min x0.637174 tri 17   max x1.319122 tri 31   (32 triangles, 0 with no area at the cleared pose, band 0.146694px²)
          stretch    max x1.319121 tri 22   min x0.637175 tri 8
          winding    32 of 32 kept, 0 collapsed
  WORST   turn  area x0.637174 (head/head key 1 tri 17)  stretch x1.319121 (head/head key 1 tri 22)  squash x0.637175 (head/head key 1 tri 8)
  ..            reversed 0, collapsed 0, over 8 key(s) and 192 triangle sample(s)  <- A39 reads the same two counts
  ..            6 span(s) between consecutive keys scanned for a fold no key lands on: none folds (the closed form flagged nothing, so no span cost a posed measurement)  <- A39 reads the same scan
```

**The rows, and what each one is for:**

| Row | What it is |
| --- | --- |
| the `DEFORM` line | `animation`, the `skin/slot/attachment` triple the timeline is keyed on, the key's index — **the same index `A39`'s message names** — its time, and its model: the `transform` kind and parameters the spec stated (§4.11.1), or `authored table` |
| `frame` | how the animation was reached, which is the pose everything below was measured in: `played on a track`, or the slider that applies it, the property that slider reads off its bone **as the emitted skeleton names it**, and the dial value its mapping inverts this time to (§4.11.4). Under `local: false` a further clause appears when the field that measurably moves the reading is not the one the skeleton names, or when two fields move it equally — reported, never resolved out of sight. On a key at a time no dial selects, an `unreachable` line follows it and the figures below belong to the frame the runtime landed on instead |
| `moved` | how many vertices this key moves at all, and the largest **world** displacement with the vertex carrying it. Not the same number as §4.11.1's `largest offset`: that one is the offset the spec stated, this one is where the vertex ended up after the bones |
| `area` | signed area **after ÷ before**, its smallest and largest over the triangles, each with the triangle. `x0.637` is a band compressed to 64%; **a negative ratio is a triangle turned inside out** |
| `stretch` | the two singular values of the map from the cleared triangle to the deformed one — the worst stretch and the worst squash the **drawing** takes. `σ₁·σ₂ = \|area ratio\|`, so the two rows are two readings of one map and cannot disagree |
| `winding` | triangles whose winding survived, and how many the key pinched onto zero area. A fold says so and points at `A39` |
| the `BETWEEN` line | a fold at a time **no key lands on** (§4.11.3): the two keys it lies between, the time, the segment's curve kind, and how far along the interpolation it is. Present only where one was found |
| `WORST` | per animation **and per frame**: the worst key by each quantity, then the reversal and collapse totals over every key, then how many spans between keys were scanned and what the scan found. Each further line ends with a breadcrumb naming the `A39` reading that counts it — keys that draw no pixels (`deformKeysNotDrawn`, below), keys at a time no dial selects (`deformKeysUnreachable`, §4.11.4), and a dial the skeleton and the probe disagree about (`deformDialsDisagreed`, §4.11.4) |

📌 **The frame is the posed one, and the denominator is 1.000 by definition.**
Both sides of every comparison are taken at the key's own time with the animation
applied — the deformed mesh against **the same posed bones with the deform
cleared**. Setup bones were tried and are wrong in principle: a weighted mesh's
offsets are authored in bone space against the pose they land in. So every ratio
is *the deform's own contribution*, and a `(setup 1.000)` column beside it would
be printing the definition. It is also what makes a **mirrored** slot bone a
non-event — a negative determinant flips both sides and cancels.

**A key that moves nothing gets one line.** `{ "t": 2.2 }` with no run is the
format's own way of writing "back to the setup pose" (§4.11), and its geometry is
bit-identical to the pose it would be measured against. It is still counted in
the `WORST` rollup, because `A39` measures it too — which is why the sample
counts there are the ones on `A39`'s own stats line.

**It quotes; it does not re-derive.** The reversal and collapse counts are
`A39_DEFORM_KEEPS_TRIANGLE_WINDING`'s own — one survey, two readers, so the block
and the gate cannot disagree about a fold. A key's model is the compiler's
`transform` report. And the **fold angle** is not here at all: it is derived at
run time from the grid (FACE §4.2), and a second copy of it printed beside a
ratio would go stale the moment somebody moved a column.

⚠️ **An exempt slot still gets figures.** `invariants.deformMayFold` (§3.7) turns
`A39` off for a slot, and the block then prints the same numbers with a line
saying nothing there is gated. An author who has declared a fold is the one
person with no other way to see how far it goes.

⚠️ **A key that draws no pixels says so, on a `skipped` line.** When the slot has
faded to alpha exactly 0 at that key's own time, or shows another attachment,
`A39` reads no winding off it — and the block prints the reason in the same words
the gate counted it under, keeps the key's own figures where there are any, and
leaves it out of the `WORST` rollup's counts, because that line ends by claiming
`A39` reads the same two. The rollup then carries a second line naming how many
keys were passed over and how many reversed triangles nothing gated:

```
  DEFORM  turn  default/head/head  key 1  t=0.500000  transform yaw  radius=170 degrees=40
          skipped    A39 reads no winding off this key: the slot's alpha is exactly 0 at this
                     time (slot 0.0000 x attachment 1.0000), so this key draws no pixels — a
                     triangle that draws no pixels cannot draw them backwards
          ...
          winding    24 of 32 kept, 0 collapsed  <- a fold, and nothing gates it: this key draws no pixels (see above)
  ..            1 key(s) draw no pixels at their own time and are read for no winding, carrying
                8 reversed triangle(s) nothing gates  <- A39 counts them as deformKeysNotDrawn
```

⭐ **On the "shows another attachment" half, that sentence also names the skin the
pose was taken in** — `the slot shows attachment "away" at this time, with skin
"suit" worn, not this mesh …` — because what a slot shows is resolved through the
worn skin first and `defaultSkin` second, so the reading is only meaningful beside
the dress it was taken in (§4.11.5). The alpha half carries no such clause: an
alpha is read off the pose and no skin is in it.

🚫 **What it does not print, and why — `coverage`.** A deform **cannot move
coverage.** That figure is rasterised from the attachment's **uvs** against the
part's alpha, and a deform moves positions and never uvs, so it is identical at
every key by construction — measured, and on a mesh turned inside out at that: a
12° build of the turn probe and a 40° folded one report the same
`coverage=0.902786 overshoot=0.000000` to six decimals. A `coverage 100.00% of
the art (setup 100.00%)` line would be a tautology wearing a measurement's
clothes. The quantity that does move — how much art each drawn pixel now carries
— is the `stretch` row.

📘 **[FACE.md](FACE.md) §9.2** is this block on real art, as three builds of
`gallery/portrait`: the good one, one with a band inverted, and one folded. The
inverted build is the case worth reading — `A39` passes it (correctly: nothing
reverses), and the block is what says `x1.362834` on the band the model's own key
reports as `x0.637174`, with no reference render anywhere. ⭐ The comparison is
per **triangle** and that is what makes it a reading: the block names one beside
every ratio, so the two blocks can be lined up band against band instead of worst
against worst — which on this build would have paired the inverted band with an
untouched one and called the difference mild.

📘 **[`gallery/nod`](https://github.com/firejune/rigc/tree/main/gallery/nod)'s
README is a second reading of the same block** (repository material, hence the
GitHub link), and it is the one where the figures are checked from two directions
at once. Its `pitch` band ratios are *derived* from the mesh's own row table and
*measured* off the posed vertices, and the two agree to six decimals. Its `wave`
keys then report an area ratio of `1.000000 ± 1e-6` at **every** amplitude — not
a measurement but a **proof** showing up as one, because a wave that reads `y`
and displaces `x` over row-major quads preserves every signed area exactly.

---

### 4.11.3 The times no key lands on — `A39` between two keys

🚨 **Your keys are not where the runtime is.** It interpolates between them, so a
deform that is inside its fold angle at *every* key can be past it in between —
and until issue
[#403](https://github.com/firejune/rigc/issues/403) nothing looked there. The
reachable version of that was the fade above: land the alpha-0 key **on** the
folding key and every key is honest — that one really does draw nothing — while
the frames just before it are drawn, nearly folded, and land on no key at all. On
the turn probe that is **8 reversed triangles at alpha 0.20, gating green**.

⇒ `A39` now scans every interval between two consecutive deform keys as well, and
refuses one with its own sentence. No spec this repository ships produces one — the
rig it was written from is a probe `selftest.ts` generates and nothing else can
invoke — so the sentence is described here rather than transcribed.

**What it carries**, in the order it says it: `BETWEEN key <i> (t=…s) and key <j>
(t=…s)` where a key refusal puts one index; the time the closed form solved for, and
how far along the segment that is — or `(a stepped segment)` instead, which
interpolates nothing and holds the earlier key's geometry across the span; the
reversed count out of the triangle total, with the first four named and each one's
vertex ids and its signed area before and after; `NO KEY LANDS THERE` in those words,
then whether the runtime interpolates across the span or holds it; the alpha read at
that same instant, present only where it is not 1; and the ways out — for an
interpolating span the four the table below gives, the fade one among them only
where the alpha is not 1, and for a stepped one the key it holds instead, with
`invariants.deformMayFold` the last resort either way.
[`src/validate.ts`](../src/validate.ts) builds it, beside the key sentence §4.11.2
quotes.

**What to change when you see it**, in the order worth trying:

| | |
| --- | --- |
| the fade landed **on** the fold | move the alpha-0 key **before** the folding key, so every frame that folds is a frame that draws nothing. This is the case the message calls out by name |
| two keys are simply too far apart | add a key inside the span, so the geometry the runtime passes through is geometry you wrote rather than geometry it inferred |
| the two keys' models disagree | move their offsets closer together — a projection past its fold angle is the usual cause, and [FACE.md §4.2](FACE.md) has the closed form |
| the fold is the drawing | `invariants.deformMayFold` (§3.7), as for a key |

**Three things the scan is, and one it is not:**

- **Solved, not sampled.** A deform interpolated between two keys travels a
  straight line through offset space, so a triangle's signed area is a
  **quadratic in the interpolation fraction** and the fold is a root of it. There
  is no subdivision count and so no sample spacing to argue about.
- **Measured before it refuses.** The closed form only decides *where to look*;
  the time it names is then posed and measured by exactly the code that measures
  a key. So a `BETWEEN` refusal is the same measurement as a key refusal, taken
  at a time no key holds.
- **Alpha-aware at that same time.** The fade interpolates too, so the alpha is
  read at the moment the geometry is — otherwise this would refuse the very
  frames a correct fade is hiding. A fold that lands only where nothing is drawn
  is reported and not gated, exactly as a key's is.
- ⚠️ **Not a claim about the bones.** The closed form holds them still. On an
  *unweighted* attachment that costs nothing — one bone matrix multiplies every
  vertex and its determinant cancels out of the comparison — but on a **weighted**
  mesh whose bones move across the span it is an approximation, and a prediction
  no measurement reproduced is reported as `deformSpansUnconfirmed` rather than
  refused. Nothing on this surface can see a fold caused by the bones alone;
  `rigc check` against a trusted render is what can.

📌 **A stepped segment holds rather than interpolates**, so it introduces no
geometry the keys do not already have — but it is still scanned, because what it
holds that geometry across is a stretch of time whose *alpha* is the next key's
business. A key that folds at alpha 0 and is held, stepped, while the slot fades
back in is refused, and the message says the segment interpolates nothing.

📌 **Silence is not a pass here either.** `deformSpansScanned` is on the stats
line of every build `A39` runs on, and the `WORST` rollup names it too, because
"the scan ran and found nothing" and "the scan never ran" must not print the
same. `deformSpanProbes` beside it is what the scan cost: 0 on a rig nothing was
predicted in, one posed measurement per predicted window otherwise.

---

### 4.11.4 Which frame a deform key is measured in — a slider changes it

Everything above says *at the key's own time*, and on an ordinary animation that
means one thing: played on track 0. **An animation a `slider` applies (§3.5.2) is
never played that way** — spine-core says so in `SkeletonData.findSliderAnimations`
— and posing it as though it were is a frame no playthrough contains. The dial
picks the time, so **the key's time and the applied time are the same number by
construction**; measuring them independently was issue
[#407](https://github.com/firejune/rigc/issues/407), and it refused a correct rig.

⇒ For every deform key of an animation some slider applies, `A39` **inverts that
slider's own mapping** and drives its bone until the runtime selects this key's
time, then measures there:

```
time  = to + (value − from) × scale        the slider's mapping (§3.5.2)
value = from + (time − to) / scale         what A39 sets the dial to
```

🔒 **The `DEFORM` block prints the frame on every key**, because the derivation
changed and a block that went on printing the same figures under a changed meaning
would be worse than the red it replaced. `gallery/look`'s `turn` is the animation
a slider applies, and this is one of its keys:

```bash
bun cli.ts explain --rig gallery/look/rig.json \
                   --motion gallery/look/motion.json --out /tmp/explain-look
```

```
  DEFORM  turn  default/head/head  key 6  t=1.900000  transform yaw  depth=true degrees=19
          frame      applied by slider "yaw" off yaw_dial.rotate (local), dial 19.000000 -> t=1.900000
```

`A39`'s stats line carries `deformFrames` on any build where a slider chose one,
and its refusals name the slider — `animation "turn" (applied by slider "yaw", not
played on a track) deform …` — because the same key can be refused through one
dial and not reached at all through another.

**Three consequences worth knowing before you build a rig like this:**

- ⭐ **A slider at `mix: 1` in setup no longer forces the older idiom.** Muting at
  setup and keying `slider.<name>.mix` from a playing animation (§4.12) is still
  legitimate, but it is no longer the only way to keep `A39` honest about a slot
  the animation itself fades — and it costs `A40_SLIDERS_COMPOSE_ON_A_SHARED_TARGET`,
  which excludes a slider below full authority. A slider muted at setup is **not**
  a way in: `Slider.update` returns before it reads the bone, so its animation
  keeps the track frame.
- **Two sliders applying one animation are two frames**, and both are measured.
  A fold only one dial can reach is still a fold.
- ⚠️ **A key at a time no dial can select is named, not passed.** The cause is
  [#405](https://github.com/firejune/rigc/issues/405)'s wrap: `FromRotate.value`
  under `local: false` is an `atan2` ending `if (value < 0) value += 360`, so
  **`[0, 360]` is the whole of its range** and a mapping needing anything outside
  it selects nothing. 🚨 A **rig spec** can no longer ask for one — the compiler
  refuses both ends of that circle (§3.5.2), the low one since #405 and the high
  one since [#417](https://github.com/firejune/rigc/issues/417) — but an
  **artifact** can, because it may have come from the editor, from a hand edit or
  from an older rigc, and this is the surface that reads what actually shipped.
  `A39` measures the frame the runtime *does* land on, leaves the key out of
  `deformKeysMeasured`, and names it:

```
deformKeysUnreachable=2 deformUnreachable=turn/head/head#0@10.800000,turn/head/head#1@11.300000
deformSpansNotScanned=2
```

  — the `@` is the time the runtime lands on instead — with the `DEFORM` block
  giving the whole sentence and the spans those keys bound left unscanned rather
  than scanned over two poses of some other time.
- 🚨 **A dial past `±16777216` is named, not printed.** The drive is a number you
  are meant to act on — *set `knob.scaleX` to this* — and past 2²⁴ a float32 no
  longer separates consecutive integers, so a figure up there is not one anybody
  can set and read back. `A39` leaves the bone at its setup value instead, counts
  the key as unreachable, and says so with both numbers:

```
unreachable A39 gates nothing here: the dial for t=1s is out of bounds: slider "dial" maps
that time back to 17000000.000000, which needs knob.rotate at 1.7000e+7 — past the ±16777216
this solve will drive a bone field to. …
```

  The usual cause is a `from` or a `scale` that puts the animation's own range out
  of reach; check the two against `value = from + (time − to) / scale` above.

#### Which property the `frame` line names

The name on the `frame` line — `off yaw_dial.rotate (local)` — is read off the
**emitted skeleton**: it is whichever `FromProperty` the parser built out of your
`property` field, so it is the word you wrote. rigc *also* probes all six local
fields of the driving bone to find which one moves the reading, because under
`local: false` the reader goes through the world transform and only a measurement
can say what drives it there. **The two answers must agree, and when they do not
the line says so rather than picking one silently.**

- Under `local: true` they always agree and the line carries nothing extra.
- Under `local: false` they can legitimately differ, because the reading is a
  *world* one. A bone whose parent is turned 90° has a world x that its own local
  `x` does not move at all and its local `y` moves entirely, so the line reads
  `off knob.x (world), driven through knob.y — the probe moves the reading by
  knob.y 1.000e+0 while the skeleton says the reader is knob.x, which moves it by
  2.321e-8. The two disagree and both are reported…`, and the `bone local` figure
  beside the dial names its field (`bone local y 398.999991`).
- At 45° the two fields move it *equally*, which no ranking can separate; the line
  says the probe did not settle it and that the skeleton's own reader broke the
  tie. ⛔ Neither case is a refusal and neither is guessed past — an ambiguous
  discovery is a thing to report.

**And a `build` says it too, on `A39`'s stats line**
([#427](https://github.com/firejune/rigc/issues/427)) — because `explain` is not
the loop you run, and until this the whole finding lived on a line only `explain`
prints. Nothing appears on a rig where the two answers agreed, which is every
`local: true` slider and every gallery example:

```
deformDialsTied=1 deformDialTied=dial|artifact:knob.x@7.071e-1|tied:knob.y@7.071e-1
deformDialsDisagreed=1 deformDialDisagreed=dial|artifact:knob.x@2.321e-8|reaches:0.000000..0.003893s|probe:knob.y@1.000e+0|reaches:0.000000..1.000000s|outside:0.500000s+1.000000s
```

- `artifact:` is the field the **skeleton** names and what one unit of it moves the
  reading by; `probe:` is the field that **measurably** moves it and by how much.
- `reaches:` is the part of that animation's own `0..duration` each of them can
  select. It is bounded by the same `±16777216` the dial figure is: a field that
  barely moves the reading needs an unsettable value to move it a whole second.
- `outside:` is the key times this survey posed through `probe:` that **no
  settable value of the field the skeleton names reaches**. Each one is posed
  through that field and the runtime is asked where it landed, so the list is a
  measurement. ⭐ `outside:none` is a reading, not an absence — it says both
  answers select every frame that was measured, so the disagreement changed
  nothing about what `A39` looked at.
- A **tie** never carries `probe:`, `reaches:` or `outside:`, and never counts as a
  disagreement. There is one belief there, not two.

**And `explain`'s rollup carries it too, with the breadcrumb its neighbours have**
([#440](https://github.com/firejune/rigc/issues/440)). The per-key `frame` lines
say it once each; the rollup says it once per animation, and ends by naming the
two readings a `build` prints it under — because they differ by one letter, and a
breadcrumb naming only one would send a reader to grep for the other:

```
  ..                     1 dial(s) the skeleton and the probe disagree about: the skeleton reads knob.x and the probe drives knob.y, 2 key time(s) outside what the skeleton's own field reaches  <- A39 counts them as deformDialsDisagreed and spells them out as deformDialDisagreed
```

The count after `outside` is the length of the stats line's own `outside:` list,
and `deformDialsDisagreed` / `deformDialDisagreed` are checked against the keys
`A39` really printed rather than restated — `DW34`. An agreed dial adds no line
(`DW35`) and a **tie** is never rolled up as a disagreement (`DW36`).

⛔ **None of it refuses a build**, and the reason is measured rather than chosen.
The field the survey drives is the largest response the probe found, so its reach
always *contains* the artifact's: a disagreement cannot make `A39` miss a frame the
runtime reaches. And every frame it does pose is checked against `SliderPose.time`
by spine-core itself, so it cannot make `A39` pose one that never happens either.
What is left is a rig naming a property no settable value of turns far enough —
which the line above tells you, and which no edit rigc could demand would fix,
because the rig may be perfectly correct and driven through the other field.

None of this needs anything from you unless a `frame` line or one of those stats
readings appears. If one does, it is telling you the dial bone's parent transform
is doing something you may not have intended — and if `outside:` names times, it is
telling you the dial cannot be turned to them through the property your rig spec
declares.

⚠️ **What the artifact cannot say, and rigc therefore does not:** whether a
slider's animation is *also* played on a track somewhere. Nothing in skeleton data
records that, so a slider-applied animation is measured in its slider frames only.

---

### 4.11.5 Which skin a deform key is measured in — the one it is keyed on

§4.11 opens on the triple: a deform timeline is the only one keyed on
**skin / slot / attachment**. So the skin is not context around the key, it is a
third of the key's own address — and every pose `A39` and the `DEFORM` block take
is now taken with **that skin worn**
([#583](https://github.com/firejune/rigc/issues/583)). You do not ask for it and
there is no flag: the skin comes out of the timeline.

🚨 **It used to wear nothing at all**, which is `spine-core`'s own initial state
and the same one `check` reports as `no skin set (the default skin alone)`
(§9) — every slot resolved through `SkeletonData.defaultSkin` and nothing else.
Move a deformed mesh into a named skin, which the format not only allows but keys
the timeline on, and the slot showed **no attachment**. This is what
`gallery/squash`'s ball printed with its one mesh moved into a skin `suit`, on
every one of its five keys, before #583:

```
  DEFORM  bounce  suit/ball/ball  key 1  t=0.340000  transform affine  scale=[0.88, 1.16]
          skipped    A39 reads no winding off this key: the slot shows no attachment at all at this
                     time, not this mesh, so the runtime applies no deform to it here and draws
                     none of it — a triangle that draws no pixels cannot draw them backwards
```

— `A39` went **PASS → SKIP** on a rig whose only edit was which skin one mesh sat
in, in a sentence that reads as a verdict on that rig. Worn, the same build
reports every figure the default-skin one does, to the last digit, and `A39` gates
it: the two `DEFORM` blocks differ in the skin of the triple and in nothing else.

**Two things follow, and one of them is not about art:**

- ⚠️ **A "nothing is drawn" sentence now names the skin it was measured in** —
  `the slot shows attachment "away" at this time, with skin "suit" worn, not this
  mesh …`. It is on the *shows-something-else* branch only, because that is the
  branch a skin decides; an alpha is read off the pose and has no skin in it. The
  clause is what separates "this slot is empty" from "this slot is empty in the
  dress this mesh lives in", and only the second is a measurement.
- ⭐ **A `skin: true` bone or constraint (§3.4.1) is switched on too.**
  `Skeleton.setSkin` calls `updateCache`, which leaves a `skinRequired` bone
  inactive and a `skinRequired` constraint out of the update cache under any skin
  that does not list it. So a **slider** dressed into the same skin as the mesh
  it drives used to be measured with itself switched off, and failed in two ways
  depending on its `local` flag: a world-read property never moved, so the frame
  was reported as *"played on a track"* — an animation a slider is the only way
  into (§4.11.4) — while a local-read one kept its mapping but never left
  `SliderPose.time` 0, so every key came back as *"at a time no dial selects"*.
  Both now reach their own key times.

⛔ **What it does not do is try every skin.** `Attachment.timelineSlots` lets one
deform reach a second slot — a linked mesh with `inheritTimelines` — and that copy
may live in a skin of its own; `setSkin` dresses the whole skeleton at once, so
under the timeline's own skin that copy resolves to nothing and is reported as
drawing nothing, which is exactly what the runtime does with that same skin on.
Posing the key again under some other skin would be rigc choosing which dress the
character is wearing, and which skin is worn is yours. What it owes you instead is
the skin in the sentence, so the reading is never mistaken for a verdict.

📌 **`check` is the other half of the same question and it is not automatic**:
a rig whose art lives in named skins is rendered and checked **once per skin**,
with `--skin` on both sides (§9). The difference is where the name comes from —
a deform timeline carries its own skin and a frame set does not.

---

### 4.12 `path` and `slider` timelines — tracks, not their own groups

Unlike `ik` and `transform`, these two are ordinary `tracks` entries: the format
writes them as `animations.<a>.path.<constraint>.<timeline>` — a constraint name,
then a timeline name under it — which is the same shape as `physics`, and a key that
carries one `v` fits it.

```json
"tracks": [
  { "path": "ride", "property": "position", "keys": [
      { "t": 0, "v": [0], "ease": "smooth" }, { "t": 2, "v": [1] } ] },
  { "path": "ride", "property": "mix", "keys": [
      { "t": 0, "v": [0, 0, 0] }, { "t": 0.4, "v": [1, 1, 1] } ] },
  { "slider": "knob", "property": "mix", "keys": [
      { "t": 0, "v": [0] }, { "t": 0.5, "v": [1] } ] }
]
```

Those numbers are invented, and the first track is the one to read: `position` 0 → 1
under `positionMode: "percent"` walks the constrained bones from one end of the
curve to the other over two seconds. On the 180-long path of §3.4 the bone passes
through exactly `x = 90` at the halfway point of a linear key pair, which is how you
tell a working traversal from a plausible one.

| Group | `property` | Channels | Note |
| --- | --- | --- | --- |
| `path` | `position` | 1 | a fraction of the measured `lengths` total (§10.6 — not the arc), or world units under `positionMode: "fixed"` |
| `path` | `spacing` | 1 | in the unit `spacingMode` chose |
| `path` | `mix` | **3** | `[mixRotate, mixX, mixY]` in one key, so a raw `curve` is 12 numbers |
| `slider` | `time` | 1 | the bone-less slider's own time. A slider WITH a bone takes its time from the bone and this timeline is not what drives it |
| `slider` | `mix` | 1 | mix 0 makes `update()` return, so this is the on/off switch. It is also what decides the frame a deform key of that slider's animation is measured in — §4.11.4 |

⚠️ **A `path.mix` key states all three mixes.** In the file `mixY` defaults to the
same key's `mixX`, and every field has a per-key default rather than carrying the
previous key's value forward — the same trap as §4.9's. rigc writes all three out,
so `v` is three numbers and not one.

⚠️ **A muted constraint with no timeline is a finding, not an idiom.** Turning a
constraint on from an animation is the idiom (§4.10), so `A36`/`A37` only object to
all-zero mixes when **no** animation keys that constraint's `mix` **above 0**. If
you mute one at setup, key it up somewhere. `A23` asks the same question of a
physics constraint ([#743](https://github.com/firejune/rigc/issues/743)), and the
three share one reading ([#752](https://github.com/firejune/rigc/issues/752)): the
key **values** the loaded timeline poses, so a `mix` timeline keying 0 only is not a
rescue, and a Bezier between two keys of 0 whose handles lie above 0 is. A path
constraint is switched on by a key posing **any one** of its three mixes above 0,
because `PathConstraint.update` returns only when all three are 0. [measured] on
generated fixtures, a path constraint and a slider muted at rest and keyed to 0
only pose every bone exactly where the same rig with no mix timeline does, and until
#752 both passed. `A23` alone also counts the unnamed global timeline for every
constraint declaring `mixGlobal`, since only the physics family has one. The refusal
says both halves — `path constraint "P" has mixRotate 0, mixX 0 and mixY 0 at setup
and none of the 2 animations keys its mix above 0; …` — and names both repairs.

⚠️ **The same question of an `ik` and a `transform` constraint is `A47` and `A48`**
([#765](https://github.com/firejune/rigc/issues/765)); until then no assertion asked
it, and a rig resting either kind muted with nothing keying it gated green with 0
failures. [measured] on generated fixtures, an ik at `mix` 0 and a transform at
every mix 0, each with nothing keying it and each keyed to 0 only, pose every bone
exactly where the same rig with no constraint does. They read the timelines through
the same helper as `A23`/`A36`/`A37`, so a lifted Bezier between two keys of 0 is a
rescue and a 0-only timeline is not, with two differences that are the runtime's:

- **Live is `!== 0`, not `> 0`.** `IkConstraint.update` returns on `mix === 0`, and
  a transform applies a property only when its own mix `!== 0`, so a negative mix
  runs the constraint inverted. [measured] five transform constraints across four of
  the editor's example exports (`6-arcs-pro`, `8-follow-through-pro-ball`,
  `sack-pro` twice, `spineboy-pro`) rest at `mixX` = `mixY` = −1 with nothing keying
  them, each moves its bones against the same constraint at every mix 0, and a
  `> 0` reading refuses all five. `A36`/`A37` still read `> 0`.
- **A transform is judged on the mixes of the properties it drives.**
  `TransformConstraint.update` returns early only when all six mixes are 0, but a
  property is applied by its own mix, and a key omitting a mix reads it as 1
  (§4.10). [measured] a rotate-only transform keyed to `mixRotate: 0` alone — five
  mixes of 1 on the loaded timeline — and one keyed to `mixX: 1` both pose exactly
  where no constraint does, and both are refused. A transform whose `properties`
  name no `to` at all is refused with its own sentence: no mix it carries is read.

`ik constraint "reach" has mix 0 at setup and none of the 1 animation keys its mix
above 0; update() returns on mix 0, so "upper" never reaches for "goal" — rest it
above 0, or key its mix above 0 in an animation, or declare that the consumer drives
its mix, in the rig spec as invariants.consumerDrivenMix: [{ "constraint": "reach",
"type": "ik", "why": … }]`. A rig resting at 0 and keyed up by the animation that
needs it — spineboy's aim — is refused by neither.

🎛️ **The third door is for a dial the file cannot show turning**
([#784](https://github.com/firejune/rigc/issues/784)). A constraint resting muted
that nothing keys up is either a leftover or a mix a game sets from code, and the two
export as the same bytes — a production skeleton's rebuild was refused for exactly
that, over an ik its game switches on at runtime. `invariants.consumerDrivenMix`
(§3.7) is the statement the file cannot make, and what it buys is a **SKIP by name,
never a pass**: the file still shows nothing moving the constraint.

```
  SKIP  A47_IK_CONSTRAINT_NOT_MUTED_THROUGHOUT: every ik constraint here is declared in the rig spec as invariants.consumerDrivenMix, so its mix is the consumer's to set and nothing in this file shows it moving — "reach" (why: a game turns it on from code): it rests muted and none of the 1 animation keys its mix above 0
```

- **Beside a live constraint of the same kind** the live one is still measured, so
  the rule PASSes and the build's stats line names the declared one
  (`ikConsumerDriven=reach`, `transformConsumerDriven=…`) — `A39`'s shape for
  `deformMayFold`. A SKIP there would print "nothing measured" over a rule that
  measured one.
- ⛔ **A declared constraint the file also switches on is refused** — resting live,
  or keyed above 0 by any animation — because the declaration exempts nothing
  there: the gate passes it without one. [measured] an ik keyed at mix 0.5 with code
  writing 1: written before `state.apply` it is overwritten (applied 0.5), written
  after it wins (1.0). Which of the two authors holds a frame is the order of the
  consumer's own loop, which is the scene's, not the object's.
- `validate <dir>` has no rig spec and so no declaration: a muted constraint there
  is refused with all three doors.

### 4.13 `sequence` — which frame of a numbered series shows

The other attachment timeline, beside `deform` and for the same reason: its key is
three named fields rather than one `v`, and it is aimed at an attachment rather than
a slot, so it is a family of its own
(`animations.<a>.attachments.<skin>.<slot>.<attachment>.sequence` in the file):

```json
"sequence": [
  { "slot": "glint", "attachment": "glint", "keys": [
      { "t": 0, "mode": "loop", "delay": 0.1 },
      { "t": 0.5, "mode": "pingpong", "index": 1, "delay": 0.1 } ] }
]
```

| Field | Meaning |
| --- | --- |
| `skin` | the skin the attachment lives in; absent means `"default"` |
| `slot`, `attachment` | the slot and the attachment's placeholder — the attachment must carry a `sequence` block (§3.4.3) |
| `keys[].t` | seconds |
| `keys[].mode` | one of `hold`, `once`, `loop`, `pingpong`, `onceReverse`, `loopReverse`, `pingpongReverse`. Parser default `hold` — **per key**, not carried |
| `keys[].index` | the frame the key starts on, 0-based. Parser default 0 |
| `keys[].delay` | seconds per frame. Parser default: **the previous key's** `delay`, 0 on the first |

From the key's time on, the frame shown is `index` advanced by one every `delay`
seconds and folded back into the series by `mode` — `SequenceTimeline.applyToSlot`,
with `i = index + floor((time - keyTime) / delay + 0.00001)` and `n = 2 * count - 2`:

| `mode` | frame shown |
| --- | --- |
| `hold` | `index`, never advancing |
| `once` | `min(count - 1, i)` — stops on the last frame |
| `loop` | `i % count` |
| `pingpong` | `i % n`, then `n - that` once it reaches `count` — bounces off both ends |
| `onceReverse` | `max(count - 1 - i, 0)` |
| `loopReverse` | `count - 1 - (i % count)` |
| `pingpongReverse` | `(i + count - 1) % n`, then folded as `pingpong` |

Measured on four frames at `delay: 0.1` from t = 0 (frames numbered 0–3):
`loop` shows 0, 1, 2, 3, 0, 1 at t = 0.05, 0.15 … 0.55; `pingpong` 0, 1, 2, 3, 2, 1, 0;
`onceReverse` 3, 2, 1, 0, 0. Before the first key the frame is the block's `setup`.

⚠️ **A sequence timeline does not lengthen an animation.** A loop keyed once at t=0
in an animation nothing else extends has a duration of 0, and a player that does
not loop the animation shows frame `index` forever (measured). The animation's
`duration` is its last key, as everywhere (R7), so key something to the length you
mean.

🚫 Refused by name, each measured to load without a word: a `mode` outside the seven
(it loads as `hold`); an `index` that is fractional, negative, or at or past the
series' `count` (truncated, clamped); an advancing mode at an **effective** delay of
0 — stated, or carried from the key before — where `(time - keyTime) / 0` is
Infinity, `Infinity | 0` is 0, and the key shows its first frame throughout; a track
on an attachment with no `sequence` block (the parser gives every region a series of
one, so every mode shows it); and a track on a **linked mesh that plays its source's
timelines** (`timelines` absent or true), whose `timelineAttachment` is the source,
so a key aimed at the link is applied to nothing — key the source instead, and the
link steps its own series by it, or set `"timelines": false`. Only the fields the
key states are emitted: the compiler writes no `mode`, `index` or `delay` for you.

---

## 5. Reading a failure

Failures arrive in two layers, and they read differently.

📥 **A third surface is `ingest`'s, and it is not a failure at all.** What a skeleton
holds and the spec format cannot say is **recorded** rather than refused — one coded
line per finding, and a non-zero exit only when one of them is a blocker (§0.3's gutter
table is the three kinds); both specs are written either way. So there is no file to
change for one of those, there is a decision to make. (`ingest` does refuse one thing,
and it is not about the file's contents: an *option* that contradicts the file, such as
`--stage` beside a box the skeleton declares.)
Every code it can print, with its gutter, whether it changes the exit code, what it
means and what to do, is the finding-code table in `docs/INGEST.md` §2.0. (Spelled
rather than linked, like the references at the top of this page: that page cites the
corpus inventory, and a ladder run reads this guide without following its references
out of it.)

### 5.1 Compile errors — before the gate

A `CompileError` names the object and the field, and nothing is written.

They arrive in two waves, and the wave tells you what kind of mistake it is. The
first is a **shape** refusal from a spec parser — `parseRigSpec`
([`src/rig.ts`](../src/rig.ts)) and `parseMotionSpec`
([`src/motion.ts`](../src/motion.ts)) — which run at load, before anything is
compiled, and ask only what the one file in front of them can answer. Every
`parseMotionSpec` refusal reads `<file>: \`<key path>\` is <what it actually is>;
<the spelling that works>`, so its whole wave is **one row per FIELD** rather than
one per message. (The rig spec's parser predates the convention and its messages
are prose, so they sit in the second table with everything else.)

🚨 **A key neither format has is refused by name, in both files.** Not a row in
the table below, because it is not about one field: every object in a rig spec and
in a motion spec is checked against the keys its shape actually owns, and a key
outside that set stops the build. Issue #545 is why — before it, such a key was
never looked at, never mentioned and never emitted, and the build exited 0 with
every assertion green. Four keys planted into one physics constraint all vanished,
and no line of output named any of them.

```
rigc compile error: rig.json: constraint "ctl" (physics) has 4 keys this compiler
does not read: "scaleYMode" (did you mean "scaleY", "scaleX"?), "scale" (did you
mean "scaleX", "scaleY"?), "wobble", "ROTATE" (did you mean "rotate"?). Nothing
reads such a key, so it would be dropped from the emitted skeleton in silence —
fix the spelling or remove it. Known here: bone, damping, dampingGlobal, fps, …
```

Read it as a **repair**, not a rule: every stray key on that object is named at
once, the closest known spellings come with it (the search is case-insensitive, so
a real key in the wrong case leads the list), and the shape's whole key set is
printed after. What it will *not* do is guess — a key four edits from anything gets
no suggestion, only the set.

⭐ **The scan runs before the required keys are asked for, in both files**, and
that is what decides which message a *misspelled* required key gets. Misspelling
one is the commonest way to lose it, so it is refused as the typo it is rather than
as the thing it lost:

```
rigc compile error: rig.json: this rig spec has a key this compiler does not read:
"slot" (did you mean "slots"?). Nothing reads such a key, so it would be dropped
from the emitted skeleton in silence — fix the spelling or remove it. Known here:
bones, constraints, events, images, invariants, name, note, skeleton, skins, slots,
spec.
```

A key that is **genuinely** absent has no near miss to name, so the scan finds
nothing and the required-key message below it is what arrives — `a rig spec needs a
"slots" array (it may be empty; its ORDER is the draw order)` here, and
`` `animations` is absent; … `` in a motion spec. Read the two apart by that:
**"does not read"** means the key *is* in your file, spelt some other way, and
**"needs a …"** / **"is absent"** means it is not in the file at all. Where both
are true at once — a typo beside a key that really is missing — the typo is named
first, because it is the one you can fix without re-reading the file. Until
[#672](https://github.com/firejune/rigc/issues/672) the rig spec's required-key
checks ran *above* its scan, so `"slot"` for `"slots"` printed the sentence asking
for an array the file already had, one character off, and never named the stray
key; the motion spec has always had this order.

⚠️ One check stays above the scan in both parsers: the `spec` version tag. The
version is what decides *which* key set applies, so a file declaring a version this
compiler does not know is refused as that — `unknown rig spec version "rigc-rig/2",
expected "rigc-rig/1"` — rather than key by key against a set it never claimed. The
price is paid by one spelling: a misspelt `spec` key itself reads as `unknown rig
spec version undefined, expected "rigc-rig/1"`, which is true and one line short of
naming the typo.

⚠️ There is **no forward-compatibility escape**, and no `note` field except where
one is listed: a rig spec's root, a motion spec's root, an animation, and a
`physics` tuning entry. Prose anywhere else has to go in a document, because a key
the compiler tolerates is a key it cannot distinguish from one you meant it to
read. (The **cut manifest** is deliberately outside this: it is the record of the
pipeline that produced the art as much as an input, it carries fields the compiler
states outright that it does not read — `roi` — and the fixtures in this repository
already give it `note` and `archetype`. It has no shape parse at all, which is the
same hole issue #307 closed for the motion spec.)

| Key | Refused when it is not | Why the shape matters |
| --- | --- | --- |
| the file itself | a JSON object | the version row below would otherwise report a missing `spec` tag in a file that has no fields at all |
| `spec` | `"rigc-motion/1"` | §4 |
| `archetype`, `cut` | a non-empty string | `cut` was read by nothing, so a spec that omitted it compiled green and could not say what it was authored for |
| `note` (at any level) | a string | — |
| `easings` | an object | it is declared required and nothing asserted it, so an absent table failed at the first key that named an easing instead of at the table |
| `easings."<name>"` | **four finite numbers** | `bezierForChannel` destructures four handles with no guard: `[0.42, 0, 0.58]` emitted `"curve": [0.42, 0, 0.58, null]` (§4.1) |
| `groups` | an object keyed by group name | an array compiled green with no group defined. Each group's member LIST stays a compile-time refusal — see the rows further down |
| `setup` | an object keyed by slot name | every `setup?.[slot]` lookup on an array is `undefined`, so the whole table was silently absent |
| `setup."<slot>"` | an object of `{ attachment?, color? }` | §4.2 — `"<slot>": "plate"` reads `.attachment` off a string as `undefined` and **hides the slot** (#293) |
| `setup."<slot>".attachment` | a string or `null` | whether a string RESOLVES is still the compile-time row below; whether it is a string is this one |
| `setup."<slot>".color[i]` | a finite number in 0..1 | `channelHex` clamps with `Math.min`/`Math.max`, which pass `NaN` through, and `NaN.toString(16)` is the text `"NaN"` |
| `physics` | an object keyed by constraint name | as `setup` |
| `physics."<name>".bone` | a non-empty string | — |
| `physics."<name>".<tuning field>` | a finite number | rounded to `NaN` and emitted as `null`, which the runtime reads as zero (§4.6) |
| `mix`, `mix.default`, `mix.pairs[i]` | an object / a number / a `["<from>", "<to>", <seconds>]` triple | not emitted into skeleton JSON, so nothing else ever looks at it (§4.6) |
| `animations` | an object keyed by animation name | an absent one crashed with a raw `TypeError` that named neither input file; an array compiled green with no animations |
| `animations."<a>"` | an object | crashed with a raw `TypeError` on `anim.tracks` |
| `animations."<a>".duration` | a finite number ≥ 0 | R7's check is `Math.abs(compiled − declared) > FRAME`, and a comparison against `NaN` is **false** — so the one guard on the field passed hardest exactly when the field was missing |
| `animations."<a>".loop` | `true` or `false` | optional; absent means the player decides (§4.3) |
| `animations."<a>".tracks` | an array | an animation whose timelines are all in the families beside `tracks` still writes `"tracks": []` |
| `…tracks[i]` | an object | — |
| `…tracks[i].property` | a non-empty string | which properties exist is the compile-time row below (§4.4) |
| `…tracks[i].slot`/`.group`/`.bone`/`.physics`/`.path`/`.slider` | a string | whether exactly one is named, and what it resolves to, are compile-time rows below |
| `…tracks[i].lag`, `.stagger` | a finite number | a string is CONCATENATED onto each key time and a boolean adds 1s, and the resulting refusal blamed the key and the duration for a fault in neither |
| `…keys[j]` | an object | — |
| `…keys[j].t` | a finite number | **every** key family, including the three that never had this guard: value tracks, slot tracks and `drawOrder` |
| `…keys[j].ease` | a string | — |
| `…drawOrder`, `…events`, `…ik`, `…transform`, `…deform` | an array | an object was refused as `no keys`, which is what an EMPTY array says |
| `…drawOrder[i].offsets` | an array | a key with no offsets is the format's own "back to the setup draw order", and the test for it was true for `{}` — a complete statement of the draw order, made by accident |
| `…drawOrder[i].offsets[j]` | `{ slot: string, offset: number }` | whether the slot is emitted, and whether the offset is whole and lands inside the array, are compile-time rows below |
| `…ik[i]`, `…transform[i]`, `…deform[i]` | an object | `null` in one of these lists crashed with a raw `TypeError` on `track.constraint` / `track.skin` |
| `…ik[i].constraint`, `…transform[i].constraint` | a non-empty string | 4.3 writes the group as `ik.<constraint>`, so the name is the only target there is |
| `…deform[i].slot`, `.attachment`, `.skin` | a string (`skin` optional) | — |
| `…sequence` | an array | §4.13 — one entry per skin/slot/attachment triple |
| `…sequence[i].slot`, `.attachment`, `.skin` | a string (`skin` optional) | — |
| `…sequence[i].keys[j].mode` | one of the seven — `hold`, `once`, `loop`, `pingpong`, `onceReverse`, `loopReverse`, `pingpongReverse` | `SequenceMode[mode]` is `undefined` for anything else and the mode bits store 0: the key loads without a word and plays as `hold` |
| `…sequence[i].keys[j].index` | a whole number ≥ 0 | stored as `index << 4`, which truncates a fraction (1.5 showed frame 1). Whether it is inside the series' `count` is the compile-time row below |
| `…sequence[i].keys[j].delay` | a finite number ≥ 0 — and **above 0 wherever the mode advances**, counting a delay carried from the key before | `(time - keyTime) / 0` is Infinity and `Infinity \| 0` is 0, so a `loop` at delay 0 shows its first frame throughout. The message reads `` `…keys[j]` plays "loop" at a delay of 0 … which is "hold" spelt as "loop" `` |

The second wave is everything that needed the **other** file, the property table
or the key's position in its own track. These are the frequent ones, verbatim:

| Message | What to change |
| --- | --- |
| `a rig spec needs a "name" — a motion spec names it to pick this rig` | §3 — name the rig, and make the motion spec's `archetype` equal it |
| `a rig spec needs a non-empty "bones" array` | §3.2 — a rig with no bones has nothing to hang a slot on; every one has at least a root |
| `a rig spec needs a "slots" array (it may be empty; its ORDER is the draw order)` | §3.3 — write `[]` for a rig that draws nothing. ⚠️ These three arrive only when the key is really absent: **misspelt**, it is the unknown-key refusal above, naming what you wrote |
| `bone "X" names parent "Y", which is not declared before it` | move `Y` earlier in `bones` |
| `two bones are called "X"` | bone names are the join key; rename one |
| `two ik constraints are called "X" — a constraint resolves by name AND type (\`SkeletonData.findConstraint\`), so names are unique PER KIND: an ik and a transform constraint may share one, two of a kind may not` | §3.5 — rename one of the two. The kind in the sentence is the pair's own, so `two transform constraints are called "X"` is the same refusal on another kind; a name shared **across** kinds is not this error and never was one to fix |
| `physics constraint "X" is declared in both the rig spec and the motion spec's physics table` | §4.6 — the rig spec declares a physics constraint's structure and the motion spec's `physics` table declares one outright; pick the file it belongs in. Per kind, like every other constraint name: an `ik` "X" in the rig spec beside a `physics` "X" here is two constraints and is not this error |
| `skin "S" lists "X" under "transform", but the rig declares it as a "ik" constraint — a skin looks its constraints up by name AND type, so this one is a miss and the loader throws` | §3.4.1 — move the name to the list named after the constraint's own kind. A name the rig declares under **no** kind is the other miss and says so (`skin "S" activates ik constraint "X", which this rig does not declare`). ⚠️ A name listed by **several skins** is not an error and no longer was one as of [#725](https://github.com/firejune/rigc/issues/725): the lists are per-skin sets and a bone or constraint in two of them is active under either |
| `slot "X" names bone "Y", which this rig does not declare` | add the bone, or fix the slot's `bone` |
| `no setup pose for slot "X": give the motion spec a \`setup\` entry or the rig slot an \`attachment\`` | R3 — pick one file and declare it there. A slot **nothing** fills is exempt: its setup pose can only be "show nothing" and is not asked for |
| `the setup pose shows attachment "A" on slot "X", which no skin and no manifest part fills` | §3.3 — the slot is emitted empty and nothing was ever going to fill it, so `A` resolves to nothing. Give the slot an attachment (a skin entry or a manifest part), or state the setup pose as `null` |
| `the setup pose shows attachment "A" on slot "X", and the slot is emitted empty because the one manifest state that fills it has no art: "s" (no PNG at p)` | §0.2 — a **different** fault with a similar shape: a manifest part does fill this slot and its art was not where the manifest pointed, so every state of it was dropped. **Restore the file or fix the path** — posing `null` compiles, but it ships the rig with that part missing and the gate green. The path printed is the one rigc tried, which is what tells a deleted file from a misspelt `states:` entry; `all N manifest states that fill it have no art` is the same message where the part has more than one. Under `--atlas-in` the same sentence reads `no region "R" in <atlas>` and asks you to add the region to the pack — no file was opened ([#671](https://github.com/firejune/rigc/issues/671)) |
| `a region needs width and height — give them, or give an "image" and rigc will measure the PNG` | add `image`, or both sizes |
| `a mesh needs width and height — give them, or give an "image" and rigc will measure the PNG` | §3.4 — the same rule for a mesh |
| `"type" is null, which is not a name. An attachment's type is one of region, mesh, linkedmesh, … or the key is absent and reads as "region"` | §6 — **remove the key**. Absent is the format's own default; present-and-null matches no parser case and the attachment is dropped in silence |
| `attachment type "X" is not one of the 7 the Spine 4.3 format defines (…)` | §6 — a name the format does not have. Not a deferral, and not something rigc will grow: fix the spelling (`sequence` is a key on a region or a mesh, not a type) |
| `this attachment is a "point" … rigc does not emit it yet` | §6 — a construct the format has and rigc does not write. The message says what it would carry; SPEC_COVERAGE part 1-6 is the row it reads from |
| `a linked mesh needs "source" — the PLACEHOLDER of the mesh whose geometry it draws …` | §3.4 — `source` is what MAKES a mesh linked, and the parser falsy-tests it, so an absent or empty one is read as an ordinary mesh and throws on the `uvs` a link has not got |
| `a linked mesh states "uvs", "triangles", …, and a linked mesh has no geometry of its own` | §3.4 — remove them, or remove `source` and author this as a mesh. The parser returns before `readVertices`, so those keys are read by nothing at all |
| `"source" is "X", and skin "S" … slot "L" … holds 2: "a", "b"` | §3.4 — `source` is the PLACEHOLDER the source is filed under, not its `name`. A clause after the skin and after the slot says whether each was stated or taken from the parser's default — **the default skin** and **this attachment's own slot**, which is the pair that surprises |
| `"slot" is "X", which the rig does not declare as a slot` / `"skin" is "X", … the rig declares no such skin` | §3.4 — a link resolves both by name. Left to the round trip these are the runtime's `Source mesh slot not found` and `Skin not found`, which name neither the attachment nor where it looked |
| `"source" is "X", which is itself a linked mesh, and a chain of them is refused` | §3.4 — point `source` at the mesh. A chain resolves in file order and loads nothing at all in one of the two orders, silently |
| `"source" is "X", which is a "region" attachment and not a mesh` | §3.4 — a link takes another MESH's geometry; off any other type the runtime reads `undefined` and says nothing |
| `… is a boundingbox and states a "sequence". A sequence is a numbered series of atlas regions, and only the 3 kinds that draw a region carry one — region, mesh, linkedmesh …` | §3.4.3 — put the series on a region or a mesh, or remove it |
| `… "sequence" states no "count" …` / `… "sequence".setup is N, and a C-frame series has frames 0 to C-1 …` / `… "sequence".F is V; it is a whole number …` | §3.4.3 — the parser reads an omitted count as 0 frames and clamps a setup past the end; state the count, and a 0-based `setup` inside it |
| `… states "image" beside "sequence" …` / `… states "generator" beside "sequence" …` | §3.4.3 — the frames are the images; remove `image`. A sequence mesh takes authored geometry |
| `… sequence frame I of C (number N) is the region "R", and there is no PNG for it at P …` (or `… which the atlas at A does not have …` under `--atlas-in`) | §3.4.3 — add the frame, or state the `count` the series really has. The compiler draws no frame in place of another |
| `… the N frames of this sequence measure W1, W2 in width … State "width"` | §3.4.3 — frames of different sizes; state the attachment's size |
| `animation "A" sequence S/X/P: attachment "P" carries no "sequence" block, so there is no series to step …` | §4.13 — give the attachment a `sequence`, or remove the track |
| `animation "A" sequence S/X/P (t=T): index I is past the end of a C-frame series …` | §4.13 — `index` is 0-based |
| `animation "A" sequence S/X/P: attachment "P" is a linked mesh that plays its source's timelines …` | §4.13 — key the source (the link steps its own series by it), or set `"timelines": false` on the link |
| `a linked mesh needs width and height — give them, or give an "image" and rigc will measure the PNG` | §3.4 — the mesh rule, on a link. Its art is its own |
| `hull N disagrees with the triangles, whose outline has K vertices (0 → …)` | §3.4 — delete `hull`, or state K |
| `hull vertices must come first; vertex i is on the boundary and vertex j is not. The triangles' outline runs …: list those K vertices first, in that order, then the M interior vertices` | §3.4 — renumber the vertices: the printed walk first, then the interior |
| `hull vertices must trace the outline in order; the triangles' outline runs …, so vertex a has to follow vertex b in the list, and vertex c does` | §3.4 — renumber along the printed walk |
| `the triangles do not tile the outline: …` / `the triangles' outline is not one closed loop: …` | §3.4 — a doubled triangle, an unused vertex, a pinch or a hole in `triangles` |
| `vertex N binds bone "X", which the rig does not declare as a bone` | §3.4 — an authored mesh's `weights` bind by NAME, like everything else in a rig spec. Fix the spelling, or declare the bone. The message names the skin, the slot, the placeholder and the vertex, because an index would name none of them |
| `image "X.png" is not on disk at …` | fix the name, or point `--images` at the right directory |
| `image "X.png": /…/X.png is a WebP image (…), not a PNG: its first 12 byte(s) are …` | the file is there and is not a PNG — the name ends in `.png` and the bytes decide. Re-export it as PNG; the same sentence says **truncated** for a PNG that runs out before its `IEND`, and then the repair is a whole copy (§0.2, [#732](https://github.com/firejune/rigc/issues/732)) |
| `a "contour" generator traces the part's own alpha, and "X.png" is lifted off a packed page at the coordinates the atlas states, which on this file are not where its texels are — so there is no silhouette here to trace, only another part of the page. page "p.png" declares …` | the page's PNG is not the size its atlas declares, and the rest of the message is `A06`'s sentence for it: re-declare the page with the `scale:` header it names, or re-export the page at its declared size (§0.2, [#750](https://github.com/firejune/rigc/issues/750)) |
| `--atlas-in <pack>.atlas: N of its M page(s) cannot be read as PNG, and nothing was compiled against the pack — page "p.png": …` | the same, for every page of the pack at once, before the compile: re-export each named page as PNG under the name the atlas gives it (§0.2) |
| `parts/iris_open.png is 96x64 but slot "iris" declares 96x60` | R5 — a manifest `states:` entry whose art is not the window the part declares. Re-export the PNG, or fix the part's `size`; a quad sized against art of another size is the silence `A06` exists for, and the window is what the quad is built from |
| `plates/00_stage.png is 256x256 but the manifest window for "stage" is 250x256` | R5 — the same check on the part's unconditional `image`, against the window the crop gives it |
| `region "00_stage" of <pack>.atlas (declared 256x256 by its offsets) is 256x256 but the manifest window for "stage" is 250x256` | R5 — the row above under `--atlas-in`, and the prefix is the whole point: it says which of the two rigc **measured**, because the remedy differs. A bare path is a loose PNG it opened and you re-export; a `region … of <pack>` was read out of the pack, and you repack or aim the part at another region. This is the size row of §0.2's four, with the message it actually prints |
| `duplicate region name "X"` | two PNGs share a basename; one part, one page, one name |
| `"b/X.png" and the art already atlased as region "X" are two different files — … Rename one of the PNGs.` | R5 — the region name is the basename, so only one of the two can hold it. Rename a file (not a placeholder: the placeholder is free to repeat) |
| `the image "X.png" was never added to the atlas, so there is no region "X" …` | nothing in the spec — every image an attachment names is measured and atlased, one per file whichever skin names it, so this says rigc skipped one. Report it on [the tracker](https://github.com/firejune/rigc/issues). The `#555` the message itself cites is the change that made one-per-file an invariant, not a place to file against |
| `motion spec names archetype "A" but the rig spec at … is called "B"` | make `archetype` equal the rig's `name` |
| `animation "A" declares duration Ns but its last key is at Ms` | R7 — fix whichever of the two you meant |
| `animation "A" slot "X" attachment: key at Ns is Ms past the declared duration Ds` | §4.5 — the key is past the end of the animation and nothing will sample it. Move the key onto `duration`, or raise `duration` |
| `animation "A" slot "X" attachment: attachment "N" is not in slot "X" under any skin (searched: default, alt) — the slot has: plain, trim` | §4.4 — the keyed name is in **no** skin, and the two clauses say where the compiler looked and what it would have taken. Fix the spelling, or give some skin a placeholder called `N`. A name only a NAMED skin fills is not this error and never was one to fix — it compiles, and the slot shows nothing under the skins that lack it. Before [#695](https://github.com/firejune/rigc/issues/695) the message read `attachment "N" is not in slot "X"` and was raised against the **default skin alone**, so it fired on correct rigs: any key into named-skin art, and every key in a rig with no default skin. `the slot has no attachments at all` is the same message where nothing fills the slot |
| `animation "A" keys unknown bone "X"` | the track's `bone` is not in the rig |
| `animation "A" keys physics "*" P, the timeline that names no constraint and drives every physics constraint declaring "PGlobal": true, and none of "C", … does — it would parse and move nothing` | §4.4 — set `"PGlobal": true` on the constraints the track is for (§3.5), or key one by name. For `reset` it reads *every physics constraint the rig has*, and fires only on a rig with none |
| `` `animations."A".tracks[i].physics` is the string ""; the empty name is how a skeleton file spells a physics timeline that names no constraint, and a motion spec spells that "*" … `` | §4.4 — name one constraint, or write `"*"` |
| `physics constraint "*": the name is reserved — …` / `` `physics."*"` names a physics constraint "*", and that name is reserved … `` | §3.5 — `"*"` is the target of the timeline that names no constraint; rename the constraint |
| `animation "A": group "G" lists "*", which is not a constraint but the target that names none …` | §4.4 — write `"*"` as the track's `physics` field |
| `animation "A" bone "X" translatex: key value must be an array of 1 number(s)` | the value shape must match the property (§4.4) |
| `animation "A" physics constraint "C" mass key at t=… is 0 (massInverse Infinity); must be > 0 — …` | §4.4 — a keyed physics value the runtime cannot use. The message names the bound and the `PhysicsConstraint.js` lines that make it one: `mass` is `> 0`, `damping` is inside `[0, 1]`, both ends included ([#794](https://github.com/firejune/rigc/issues/794)), `mix` and `strength` are `0` or more, and `inertia`/`wind`/`gravity` are bounded nowhere ([#610](https://github.com/firejune/rigc/issues/610)). ⚠️ Those are the bounds a **key** is held to. A setup `strength` of `0` is refused too, but by `A23` rather than here, and with its own sentence — `physics "C" has strength 0; nothing pulls it back` ([#727](https://github.com/firejune/rigc/issues/727)); a setup `strength` below 0 says the offset is pushed away and grows, the same arm this message quotes for a negative key ([#748](https://github.com/firejune/rigc/issues/748)). A `damping` key's sentence names the exponent `60 * step` and why a negative is NaN at any `fps` where `60 / fps` is not whole (§4.4) |
| `a key carries both a named easing and a raw curve; pick one` | R6 |
| `last key carries an easing but has nothing to ease to` | drop `ease`/`curve` from the final key |
| `key times must strictly increase (at t=…)` | including after `lag` and `stagger` |
| `animation "A" has two tracks on X.property; merge them into one track` | one timeline per target property |
| `group "G" names member "M" twice (at index i and j)` | §4.5.1 — member order is what `stagger` counts and what a value map is read against, so a repeat is two delays and two values for one bone |
| `group "G" declares no members` | §4.5.1 — a track naming it would compile no timeline and gate green |
| `animation "A" group "G" P (t=…): the value map names "M", which group "G" does not declare` | §4.5.1 — fix the name, or add the member to the group |
| `animation "A" group "G" P (t=…): the value map states no value for member "M"` | §4.5.1 — a member is refused rather than defaulted; state every one |
| `animation "A" group "G" P (t=…): derive <kind> states no depth for member "M"` | §4.5.1 — same rule for the depth table: a member silently at depth 0 would be keyed with a different model from the ones beside it |
| `animation "A" group "G" P (t=…): this key carries both a "derive" model and a per-member "v" map` | §4.5.1 — two answers to one question; drop one |
| `animation "A" bone "B" P: a per-member "v" map names members, and a bone track has one target` | §4.5.1 — write the value directly, or move the track onto a group |
| `animation "A" group "G" P (t=…): derive <kind> has no projection onto "P"` | §4.5.1 — the kind drives one displacement axis and one scale axis; state the axis, or write a `v` map |
| `animation "A" group "G" P (t=…): derive … These members sit under N different parents` | §4.5.1 — coordinates measured from different origins; split the track by parent |
| `animation "A" group "G" P (t=…): derive <kind> projects onto "scaleX" and member "M" states depth −z` | §4.5.1 — a foreshortening needs the part in front of the axis; a part behind it takes the displacement projection |
| `animation "A" group "G" P (t=…): derive <kind> states carried=… on a "scalex" track` | §4.5.1 — the foreshortening reads no depth difference, so `carried` belongs on the displacement track |
| `animation "A" group "G" P (t=…): derive <kind> turns member "M" … past its own edge` | §4.5.1 — `cos(α − t) ≤ 0` would mirror the drawing; the turn is past what this construction carries (FACE §8) |
| `no stage size: give the rig spec a \`skeleton.width\`/\`skeleton.height\`` | §3.1 — or state `"width": null, "height": null` if the skeleton you are transcribing declares no stage |
| `"skeleton" states width: null and a height of N` / `states height: null and a width of N` | §3.1 — a stage has both extents or neither |
| `"skeleton" declares no stage (width: null, height: null) and still states x` | §3.1 — an origin for a box that is not there |
| `N mesh slot(s) emitted but the rig "X" allows 0 — a mesh rigc GENERATED counts against \`invariants.meshSlots\`…` | §3.4 / §3.7 — a rig that invokes a mesh generator declares the budget; undeclared is zero. Add `"invariants": { "meshSlots": N, "meshTriangles": M }` |
| `drawOrder at t=…: slot "X" is not one this rig emits` / `is offset twice in one key` / `puts it at N, outside the … emitted slots` | §4.7 |
| `events at t=…: event "X" is not declared in the rig spec's "events" block` | declare it in the rig spec (§3.6), or fix the name |
| `events: key times must not go backwards` | put the firings in time order (§4.8) |
| `events at t=…: volume is set but event "X" declares no "audio"` | drop `volume`/`balance`, or give the event an audio path |
| `vertexCount is undefined; a polygon needs at least 3 vertices, stated outright` | give the bounding box or clipping attachment a `vertexCount` (§3.4) |
| `vertexCount N wants M unweighted numbers and "vertices" holds K` | fix the count or the array; they decide the encoding between them |
| `end names slot "X", which this rig does not declare` | fix the clipping attachment's `end`, or add the slot |
| `bone "X" takes its position from …, which needs a cut manifest` | R8 — pass `--manifest`, or write literal `x`/`y` |
| `animation "A" keys unknown ik constraint "X"; the rig declares ik constraint(s): …` | §4.9 — fix the name, or declare the constraint in the rig spec |
| `animation "A" keys "X" as an ik constraint, but the rig declares it as a "transform" constraint` | §4.9 — a timeline's target resolves by name AND type; put the entry under the right group |
| `ik constraint "X": key 0 names "softness" and key 1 (t=…) does not` | §4.9 — every key is read with its own default, so state the field on every key or on none |
| `ik constraint "X" (t=…): mix is 1.5, outside 0..1` | §4.9 — an IK mix is a percentage; a transform mix is unbounded |
| `deform …: the run starts at deform index 4 and is 6 long, which ends at 10; this attachment's deform array is 8 long (4 vertices)` | §4.11 — shorten the run or move its start; the parser would drop the tail in silence. The count in brackets is the **target's own**: a mesh's or a path's vertices, or a weighted attachment's bone influences |
| `deform …: "fromVertex" counts VERTICES, and this attachment is weighted … vertex 2 has 2 of them` | §4.11 — key the control bone, or write bind-space pairs and start with `offset` |
| `deform …: slot "X" in skin "default" has no attachment "Y" (it has: …)` | §4.11 — fix the placeholder name |
| `deform … (t=…): the key carries both a "transform" and a "vertices" run` | §4.11.1 — a model and a table are two answers to one question; drop one |
| `deform … (t=…): the key states a "transform" and a start index` | §4.11.1 — a model covers every vertex, so drop the index or write the partial run by hand |
| `deform … (t=…): … has a vertex the arithmetic cannot place — vertex v's N weights sum to …` | §4.11.1 — a model lands a vertex by `D · Σ wᵢ`, so the weights have to close at 1; fix them, or write the pairs with `offset` |
| `deform … (t=…): transform yaw has radius R, and vertex v sits at x=… past it` | §4.11.1 — the cylinder has no surface there; raise the radius to where the part sits |
| `deform … (t=…): transform affine has scale […], whose determinant is …` | §4.11.1 — at or below zero the map reverses every triangle |
| `deform … (t=…): transform <kind> states …, and every one of this attachment's N vertices evaluates to an offset of 0` | §4.11.1 — the parameters state a deformation and the geometry sampled it to nothing; the message names the measured cause. A key that means the setup pose states the identity in its parameters, or carries no run |
| `vertexCount is N, which is not a multiple of 3` | §3.4 — a path's vertices are knots and handles read in groups of three: `3(K + 1)` open, `3K` closed |
| `vertexCount is N and an open path needs at least 6` | §3.4 — an open path drops its first and last point, so it needs six for one curve |
| `"lengths" is not authored — rigc measures the setup arc length of each curve` | §3.4 — delete the array; it is a measurement of the vertices above it |
| `rig constraint "X": slot "Y" has no path attachment in any skin` | §3.5.1 — give that slot a `"type": "path"` attachment, or aim the constraint at the slot that has one |
| `rig constraint "X": rotateMode is "CHAINSCALE"; known: Tangent, Chain, ChainScale` | §3.5.1 — only the first letter's case is free; anything else resolves to `undefined` in the parser |
| `rig constraint "X": applies animation "Y", which the motion spec does not declare (it declares: …)` | §3.5.2 — fix the slider's `animation`, or add it to the motion spec |
| `rig constraint "X": declares both a "bone" and "time"` | §3.5.2 — `bone` picks the model and `time` belongs to the other one |
| `rig constraint "X": declares "property" but no "bone"` | §3.5.2 — name the driving bone, or key `slider.<name>.time` instead |
| `rig constraint "X": drives off bone "Y" rotate with "local": false, and the driving values that reach animation "A" (0s..Ds) run from −15.000° to 15.000° … the whole part of the range below 0° is dead` | §3.5.2 — add `"local": true`, which reads the bone's own rotation signed and unwrapped, or move the range so it does not cross 0°. A world rotation is wrapped into `[0, 360]` before the slider maps it, so the negative half of the range is unreachable and pins to one frame |
| `… run from 300.000° to 500.000° … the whole part of the range past 360° is dead` | §3.5.2 — the same wall at the other end, and the same first repair: `"local": true`, or move the range so it does not run past 360°. `[0, 360]` is the whole of what that reader returns, so a bone turned to 500° is read as 140° and selects a time far from the one the range asked for. Ending *exactly* on 360° is fine — that is the full turn, and it misses nothing: the wrap rounds, so a bone a hair below 0° is read as exactly 360 |
| `rig constraint "X": drives off bone "Y" scaleX with "local": false, … run from -2.000 to 2.000 … Positions below 0 read as the mirror of positions above it: 2.000 of the range below 0 repeats 0.000..2.000` | §3.5.2 — a world scale reading is `Math.sqrt(a² + c²)`, a magnitude, so the half of the range below 0 is the half above it played backwards. Add `"local": true`, which reads `source.scaleX` signed, or move the range so it does not dip below 0. A bottom of exactly 0 is fine — that floor is reached, not approached |
| `… run from -6.000 to -2.000 … the whole 4.000 of this range is below 0, so it reaches none of the animation's 1s` | §3.5.2 — the same floor with the range wholly under it: every value the reader can return maps past the animation, so the dial holds one frame at every position. The figure is the width below 0, not the reach to the far end |
| `skin "S" activates bone "B", but that bone does not declare \`"skin": true\`` | §3.4.1 — the list and the flag are one switch; add the flag or drop the list |
| `bone "B" declares \`"skin": true\` but no skin activates it` | §3.4.1 — the other half: list it in the skin it belongs to, or drop the flag |
| `skin "S": uses the long form … and also has a key "X"` | §3.4.1 — move the slot inside `attachments` |
| `animation "A" keys "X" as a path constraint, but the rig declares it as a "slider"` | §4.12 — a timeline group resolves by name AND type; use the field named after the constraint's own type |
| `animation "A": "position" is a path constraint timeline, and this track names no constraint` | §4.12 — put the name in `"path"` |
| `rgba value needs 4 channels, got 3` | §4.4 — an `rgba` key is `[r, g, b, a]`. It names no animation, slot or key time, and the only input that reaches it is a slot `rgba` key: the setup pose's `color` is refused earlier, by its own row, with the slot named |
| `rgba2 value needs 7 channels, got 6` | §4.4 — an `rgba2` key is `[lr, lg, lb, la, dr, dg, db]`: the light colour with its alpha, then the dark colour **without** one. Six is the commonest way to get it wrong, because the dark half looks like it should take an alpha too — the format has no channel for it, and neither does the runtime's `setFrame`. Like the row above it names no animation or key time; the only input that reaches it is a slot `rgba2` key |
| `rgb value needs 3 channels, got 4` · `alpha value needs 1 channel, got 2` · `rgb2 value needs 6 channels, got 7` | §4.4 — the separable shapes, refused in the words the two above use: an `rgb` key is `[r, g, b]`, an `alpha` key is `[a]`, an `rgb2` key is `[lr, lg, lb, dr, dg, db]`. Four channels on an `rgb` track is the likeliest way to get it wrong — the `rgba` spelling on the timeline that exists to leave the alpha alone — and seven on `rgb2` is the `rgba2` spelling. [#730](https://github.com/firejune/rigc/issues/730) |
| `animation "A" slot "X" alpha: alpha key value must be [a]` | §4.4 — an alpha key's `v` is a one-element array like every other one-channel track, even though the file writes it bare (`{ time, value }`). The same row exists for each colour shape with its own spelling (`rgb key value must be [r,g,b]`, …) |
| `animation "A" slot "X" alpha: key at t=T is V; an alpha is a number from 0 to 1 …` | §4.4 — the one colour key stored as a number, so the one nothing clamps on the way out. The runtime clamps the posed alpha only after interpolating, so a key outside 0..1 bends the curve toward a value no pose holds; state the value you mean. 0 and 1 themselves are taken |
| `animation "A" slot "X": tracks "P" and "Q" both key the slot's alpha — a colour timeline poses its channels at every time …` | §4.4 — two colour tracks of one slot that pose a shared channel (`rgba` + `alpha`, `rgba` + `rgb`, `rgba2` + `rgb2`, …). Each poses its channels at every time, its setup value before its first key included, so the later in the file overwrites the other everywhere and one of them is read by nothing. Key each channel once: `rgb` and `alpha` for two halves on their own key times, `rgba` for both together. The channel named is whichever the two share — `light rgb`, `alpha`, `dark colour` |
| `animation "A" bone "B" has no timeline "P" (it has: translate, translatex, translatey, scale, scalex, scaley, shear, shearx, sheary, rotate, inherit)` | §4.4 — a bone has exactly eleven timelines and `P` is none of them. Fix the spelling — the single-axis ones are lower-case (`translatex`, not `translateX`). A **constraint** property is refused first, by its own row, naming the field its constraint's name goes in. When `P` is a slot timeline the message says so and where to put the name: `. "rgba" is a slot timeline — put the name in "slot"`. Before [#656](https://github.com/firejune/rigc/issues/656) all of them read `bone "B" cannot take slot property "P"`, which named the slot family whatever you had written and listed nothing |
| `animation "A" bone "B" inherit key at t=T carries an easing ("E"), and this timeline is stepped by the format — its reader builds no curve, so the mode changes AT the key and holds until the next one. Remove it` (and `… carries a curve, …` for a raw `curve`) | §4.4 — an `inherit` key is a mode, not a value between two others: the parser's `inherit` branch reads `time` and `inherit` and nothing else, so an easing would be written into a key nobody reads (`A05_CURVE_ARRAY_LENGTH` refuses the same `curve` on a file rigc did not write). `"stepped"` is refused too, for the same reason — the timeline already is. Delete the `ease` or `curve` ([#733](https://github.com/firejune/rigc/issues/733)) |
| `animation "A" bone "B" inherit key at t=T names mode "M"; known: normal, onlyTranslation, noRotationOrReflection, noScale, noScaleOrReflection — the runtime folds the case of the first letter and of nothing else` | §4.4 — `M` is not one of the five. The list and the rule are the setup field's (§3.2) — one resolver reads both — so `NoScale` compiles (and is written `noScale`, the editor's spelling) while `NOSCALE` and `noscale` do not: the runtime would load either as **no mode**, and the bone would keep whatever world transform it had ([#733](https://github.com/firejune/rigc/issues/733)) |
| `bone "B" has inherit "M"; known: normal, onlyTranslation, noRotationOrReflection, noScale, noScaleOrReflection — the runtime folds the case of the first letter and of nothing else` | §3.2 — the setup half of the row above, and the same list. Before [#733](https://github.com/firejune/rigc/issues/733) this check was case-insensitive, which is wider than the runtime: `"NOSCALE"` compiled, gated green, and loaded as no mode, so the bone's world rotation, scale and shear were never computed — every attachment on it collapsed to a point. Fix the spelling |
| `animation "A" group "G" has no timeline "P" (a bone group has: translate, translatex, translatey, scale, scalex, scaley, shear, shearx, sheary, rotate, inherit; a slot group has: attachment, rgba, rgb, alpha, rgba2, rgb2; a physics constraint group has: inertia, strength, damping, mass, wind, gravity, mix, reset)` | §4.3, §4.4 — a group's family is decided by the property, and `P` is in none of the three tables, so there is no family to resolve the members as. Fix the spelling and the group becomes whichever family the property names. The group is refused before its members are looked up, so a member the rig does not declare is a **later** message; an unknown group NAME is an earlier one. Before [#661](https://github.com/firejune/rigc/issues/661) a group of bones read `animation "A" targets unknown slot "M"` and a group of slots got the slot row below, naming one family out of three |
| `animation "A" slot "X" has no timeline "P" (it has: attachment, rgba, rgb, alpha, rgba2, rgb2)` | §4.4 — a slot has exactly six timelines — every one the format has — and `P` is none of them. Fix the spelling; a bone or constraint property written on a slot track is refused by its own row instead. Before [#650](https://github.com/firejune/rigc/issues/650) every other name compiled as an **rgba** timeline called `P`, and what you saw was `A00_ROUNDTRIP_PARSE` on the emitted file — or, for the one-channel spelling, `rgba value needs 4 channels, got 1` |
| `animation "A" slot "X" rgba2: slot "X" declares no setup "dark", and an "rgba2" timeline poses a slot's dark colour …` — and the same with `rgb2` | §3.3, §4.4 — the two-colour tint has a setup half and a keyed half, and the keyed half cannot exist without the other. `Slot`'s constructor allocates a dark colour only for a slot whose setup pose declares one, and `RGBA2Timeline` writes it unconditionally — so without the `dark` the file loads, and the first `state.apply` throws `TypeError: null is not an object` in the consumer's process. Give the slot the `dark` it holds at rest, or key `rgba` (for `rgb2`, `rgb`) if only the light colour moves. `RGB2Timeline` was measured to throw the same way before `rgb2` joined the refusal ([#730](https://github.com/firejune/rigc/issues/730)). Raised before the keys are read, with the slot named, for the same reason the row above is |
| `N pair(s) of animation names have no one order: … "Fx/a" / "fx/b" (folder) — "Fx/a" and "fx/b" sit in the sibling folders "Fx" and "fx", which the comparator leaves in one place …; rename one of the two folders so they differ by more than letter case, spacing or a leading zero` | **R10** — rename until no pair is left. The kind in brackets says which of the three things the five stored round trips leave open decides the pair: `number` (two digit runs that are each one number written twice, pointing opposite ways), `separator` (a whitespace character that is not a space) or `folder` (two sibling folders the comparator cannot separate). rigc keys `animations` in the editor's own comparator, read off `fixtures/editor-order/probe{1..5}.{in,out}.json` ([#728](https://github.com/firejune/rigc/issues/728)) — so a pair those files settle is emitted rather than refused, **including a pair that differs only in case**, whose order is then the one your spec declared. On the three that are left, the editor's re-key repoints every slider whose animation moves index ([#535](https://github.com/firejune/rigc/issues/535)) |
| `N pair(s) of skin names have no one order: … "Fx/a" / "fx/b" (folder) — …` | **R11** — rename until no pair is left. The same shape and the same three kinds as the row above, because it is the same comparator: two of the five round trips carried one name list as both collections and both came back in one order ([#728](https://github.com/firejune/rigc/issues/728)). ⚠️ This row was **wider** than R10's until then — `Zulu`/`mike` and `mike10`/`mike2` built as animation names and were refused as skin names ([#541](https://github.com/firejune/rigc/issues/541)) — and both build now |
| `slot "patch": placeholder "patch" is filled by the "default" skin AND by skins "zulu", "mike", and the Spine editor has no way to hold that … Move the default skin's entry for this slot into a named skin — call it "base"` | **R12** — do what it says: move that entry out of `default` into a named skin. The editor has no representation for a placeholder the default skin shares with a named one, in either spelling, and §3.4.2 has both measurements. Renaming the placeholder does not help; the shape is what is refused |
| `skin "S" slot "X" attachment "P": "name" is V, which is not a string. An attachment's name is the runtime's `Attachment.name` …` | §3.4 — write the name as a string, or leave the key out and the attachment is named by its placeholder. It is written verbatim and `path` defaults to it, so a number there would reach the atlas as a region name nobody spelled |

⚠️ **One refusal in this section is not a `CompileError`, and it is `explain`'s.**
`explain` prints the `DEFORM` block by **posing** the rig, and a pose resolves every
attachment against the atlas — so it needs the art `build` needs, reached the same
two ways (§0.2). A pair whose art it cannot resolve is refused **before a line of
the report**, at **exit 2**, in rigc's own sentence:

```
rigc explain: skin "default" slot "lamp" placeholder "shade": attachment "shade"
wants region "shade", which this build's atlas does not have (it declares no region
at all). `explain` poses the rig to measure its deform keys and a pose resolves
every attachment against the atlas, so there is nothing to pose it against. Art
reaches a compile two ways and this run took neither: `--atlas-in <pack.atlas>`
resolves the parts against a pack somebody already made, and an "image" per
attachment resolves them as loose PNGs under `--images <dir>` — a spec that states
a size and names no image is what `ingest --art none` writes, and `--atlas-in` is
what reads it. 1 of 1 attachment lookup(s) here resolve to no region.
```

Both halves of it are measured rather than fixed text: the count is this pair's, and
where the atlas has a **near miss** the sentence prints that too, in `A08`'s own
clause and `A08`'s own words. When `--atlas-in` **was** given and the region is still
absent, the second half names the pack instead and asks you to fix the spec's region
name or point the flag at the pack that has it. Until
[#697](https://github.com/firejune/rigc/issues/697) there was no rigc sentence at
all: the report printed in full and the run then died inside `AtlasAttachmentLoader`
with `Region not found in atlas: shade (attachment: shade)` and a spine-core stack
trace, at exit 1 — the runtime's message about rigc's internals standing in for
rigc's message about your two files.

### 5.2 Assertions — the gate

The report prints one line per assertion:

**No run reproduces this:** assembled — one line of each verdict kind; the `PASS` and the `PROF` are verbatim from a `build` this page states, the `SKIP` is cut at the ellipsis and only `--profile spine-html` prints it, and the `FAIL` is invented, because a green build prints none
```
  PASS  A08_REGION_NAMES_MATCH_ATTACHMENTS
  SKIP  A21_MESH_RIM_PINNED: the skeleton has no weighted mesh attachment, …
  PROF  A11_NO_CLIPPING_ATTACHMENTS: renderer rule, not in profile "spine"
  FAIL  A20_MESH_WEIGHTS_COHERENT: mesh "x" vertex 12 weights sum to 0.9000
```

- **PASS** — it ran and held.
- **SKIP** — it had *nothing to look at*, and the reason says what was missing. A
  skip is never folded into the pass count.
  🚨 **"Nothing to look at" includes a subject the skeleton does not carry**
  ([#580](https://github.com/firejune/rigc/issues/580)). A rule named
  ⟨subject⟩_⟨property⟩ — `A03_REGION_WIDTH_HEIGHT_FINITE`,
  `A04_MESH_TRIANGLES_AND_ENCODING`, `A23_PHYSICS_CONSTRAINT_EFFECTIVE` — walks
  that subject and measures each member, so a skeleton with no region, no mesh or
  no physics constraint gives it nothing and it **SKIPs**, naming the subject. A
  rule named NO_⟨construct⟩ — `A01_NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS`,
  `A02_NO_BONE_TRANSFORM_KEY`, `A11_NO_CLIPPING_ATTACHMENTS`,
  `A12_NO_DARK_COLOR`, `A14_NO_FULL_FRAME_MESH` — asks how many of a thing the
  artifact carries, and **zero is the answer**, so it **PASSes**. ⇒ On a foreign
  export the SKIP list is a free inventory of what the skeleton does not contain,
  and the PASS list never contains a rule that looked at nothing.
- **PROF** — the profile you chose does not carry that kind of rule. Two kinds sit
  outside `spine`, not one: the renderer rules **and** the archetype rules. The
  exclusion is checked before the assertion's body runs, so an archetype rule with
  no `invariants` field to measure reports `PROF` here, never its own SKIP. A
  `--profile spine` green means *valid Spine*, never *passes the renderer policy*
  and never *holds to the archetype rules*.
- **FAIL** — the detail names the object, the value found and the value required.
  That detail is the instruction; the table below says which file to change.

**Every assertion leaves exactly one row, on every run.** The four kinds partition
the registry, so the rows you can see are the whole of what was asked — there is
no fifth state in which a rule quietly did not come up. The last line of the
report states that partition, and every figure in it is a count of *assertions*
you can reproduce by counting rows:

```
  ..    <N> assertions: <M> measured (<P> passed, <F> failed), <S> skipped, <X> not in profile "<profile>"
```

`<M>` is `<P> + <F>`, and `<N>` is all four added together. ⚠️ `<F>` counts
assertions and not `FAIL` lines: one assertion that finds six wrong vertices
prints six rows and is one failure here.

🚨 **When `A00_ROUNDTRIP_PARSE` fails, read the report as a report about A00 and
nothing else.** Most of the rules read the skeleton or the atlas that A00 loads,
and with no parse there is nothing for them to look at — so they report `SKIP`
naming that, *the round trip did not produce a skeleton to measure* or *…an atlas
to measure*, and the summary's `<S>` goes up while `<M>` collapses. A run in that
state is not a rig that nearly passed; it is a rig that was measured on one rule.
Fix A00 and run it again ([#568](https://github.com/firejune/rigc/issues/568)).

| Assertion | Profile | What tripped it, and where to fix it |
| --- | --- | --- |
| `A00_ROUNDTRIP_PARSE` | both | `spine-core` could not parse the skeleton or the atlas. Almost everything else in the report is downstream of this one — fix it first. When it fails, every rule that reads the loaded skeleton or the loaded atlas reports **SKIP** saying so by name, so the row count stays at the full registry and the summary's *measured* figure tells you how little was actually asked ([#568](https://github.com/firejune/rigc/issues/568)). ⚠️ **Two rules run before it and can be upstream of it**: `A31_DRAW_ORDER_OFFSETS_RESOLVE`, because a bad draw-order key makes the loader spin rather than return, and `A08_REGION_NAMES_MATCH_ATTACHMENTS`, because a `path` naming no region makes it throw. The round trip is still attempted either way; when the loader refuses a path A08 has already refused, this row **defers** to A08 by name instead of restating the miss in the parser's poorer words ([#589](https://github.com/firejune/rigc/issues/589)) |
| `A01_NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS` | both | a 4.1/4.2-shaped `ik`/`transform`/`path`/`physics`/`slider` array. rigc emits the 4.3 `constraints` array, so this normally means hand-edited JSON |
| `A02_NO_BONE_TRANSFORM_KEY` | both | a bone uses 4.2's `transform`; rename it `inherit` in the rig spec |
| `A03_REGION_WIDTH_HEIGHT_FINITE` | both | a region loaded `NaN` or a non-positive size — the attachment has no `image` and no `width`/`height`. **SKIP** when the skeleton carries no region attachment ([#580](https://github.com/firejune/rigc/issues/580)) |
| `A04_MESH_TRIANGLES_AND_ENCODING` | both | authored mesh geometry: triangle count not a multiple of 3, an index out of range, or a `vertices` length that disagrees with `uvs` (the weighted/unweighted trap) **SKIP** when the skeleton carries no mesh attachment ([#580](https://github.com/firejune/rigc/issues/580)) |
| `A05_CURVE_ARRAY_LENGTH` | both | a raw `curve` with the wrong number of values, a non-finite number in one, or a curve on a timeline that cannot take one. Four numbers **per value channel**. **SKIP** when no animation carries a timeline at all ([#580](https://github.com/firejune/rigc/issues/580)). Timelines with no `curve` on any key still PASS: every timeline name is checked against the channel table whether or not a curve sits on one |
| `A06_ATLAS_PAGE_SIZE_MATCHES_PNG` | both ◑ | the atlas `size:` disagrees with the PNG on disk — the message names the ratio it measured on **each** axis and the header that states the same art truthfully, and §0.2 has the whole of it ([#715](https://github.com/firejune/rigc/issues/715)): a runtime maps a region as a fraction of the DECLARED size and never reads the texture's own, so such a page draws, and what it breaks is every reader that addresses the page in texels. A uniform ratio is a `size:`/`scale:` pair away from honest and the message prints it; two ratios are not, because `scale:` carries one number, and the message says so rather than offering a header that would not work. **Or** a region's rectangle is not inside the page it names — rotation honoured, so a region at `rotate: 90` or `270` occupies `height x width` of the page and a region that fits only because it is turned is inside it. The message names the region, the rectangle it occupies, the page and the page's size. That clause is **validity** and runs under both profiles ([#694](https://github.com/firejune/rigc/issues/694)): a rectangle outside its page makes `u2 > 1` and samples whatever the wrap mode returns, and `--atlas-in` already refuses the same rectangle at compile time (§0.2). Under `spine-html` also: `pma`, rotation, and two regions on one page over the same texels — a packed page must be **one part covering it exactly** (the unpacked convention) or a **tiling** ([#266](https://github.com/firejune/rigc/issues/266)), and what that message names is the pair that shares texels. **Or** the page file is not a PNG at all, and then nothing about its size is measured: the message carries the page's path and the size the atlas declares, and names what the file is by its first bytes — one of WebP, JPEG, GIF, KTX, KTX2 by its signature, or no image format rigc recognises, the bytes in hex either way — or calls it **truncated** when it begins as a PNG and runs out before its `IEND` (§0.2, [#732](https://github.com/firejune/rigc/issues/732)). That clause is validity too: nothing in rigc can read such a page back. **SKIP** when the atlas declares no page ([#580](https://github.com/firejune/rigc/issues/580)) |
| `A07_ATLAS_TEXT_SHAPE` | both | atlas text: a region name with stray whitespace, or a blank line splitting a page block. rigc writes the atlas, so this means a hand-edited file. ⚠️ An atlas with **no page block at all** — no non-blank line — is not one of those: its subject is absent, so this reports **SKIP** naming the byte count it read, and so do the four rules below whose subject is a page ([#608](https://github.com/firejune/rigc/issues/608)). A rig whose skins need no art writes exactly that file (§3.4), and before #608 this row refused it with two findings naming a page block that was not there. What an empty atlas does **not** excuse is an attachment that wants a region out of it — that is `A08` |
| `A08_REGION_NAMES_MATCH_ATTACHMENTS` | both | three things, and the message says which: an attachment whose `path` names **no region** of this atlas; a `path` carrying **stray whitespace**, printed quoted so you can see it; an **atlas region name** carrying stray whitespace (`A07` names that same line with its line number). The first two are read off the raw file **before** the loader is asked, so the miss is named here with the skin, the slot, the placeholder and the attachment's own name — the four things `AtlasAttachmentLoader`'s own `Region not found in atlas: <path> (attachment: <name>)` does not carry. Until [#589](https://github.com/firejune/rigc/issues/589) they were unreachable: the loader threw first and the miss arrived as `A00_ROUNDTRIP_PARSE`. There is no `spine-html` clause here any more — a placeholder is free to differ from the region its `path` names ([#574](https://github.com/firejune/rigc/issues/574)) **SKIP** when no attachment names a region *and* the atlas declares none — both of its subjects at once ([#580](https://github.com/firejune/rigc/issues/580)) |
| `A09_ANIMATION_DURATION_MATCHES_SPEC` | both | the loaded duration ≠ the declared one, or the two sides disagree about which animations exist (R7). Asymmetric by design: a frame of slack for an animation that ends early, and none worth the name for a key *past* the declared end, which is the same rule §4.5 states at compile time — held here against a skeleton the compiler never saw. **SKIP** when neither side has an animation at all — a static rig has no duration |
| `A10_NO_NAN_AFTER_STEPPING` | both | stepping the animation produced a `NaN` pose. Look for a degenerate curve or a zero scale. 🦴 **It also poses every bone `inherit` key at its own time** ([#733](https://github.com/firejune/rigc/issues/733)): the runtime resolves a mode by folding the case of its first letter and nothing else, and a spelling that misses is stored as **NaN** — the world position stays finite, `updateWorldTransform` matches no mode, and the bone keeps the rotation, scale and shear it had. The detail names the animation, the bone, the key's time and its spelling, beside the five. A bone whose *setup* spelling misses poses no mode at all, and is named the same way from the stepping loop. Neither is reachable from a rig spec — `build` refuses both spellings by name (§5.1) — so on a green build this clause is about files rigc did not write. Which mode a correct spelling poses is not judged here, because the lookup that resolved it is the one that would be checked **SKIP** when the skeleton carries no animation ([#580](https://github.com/firejune/rigc/issues/580)): the NaN is produced by stepping, and a static rig is never stepped — the same subject `A09` skips on |
| `A11_NO_CLIPPING_ATTACHMENTS` | renderer | a clipping attachment; the target renderer skips them silently |
| `A12_NO_DARK_COLOR` | renderer | a slot `dark` colour or an `rgba2`/`rgb2` timeline; parsed, then ignored |
| `A13_MESH_BUDGET` | renderer | more mesh slots than the rig's `invariants.meshSlots`, or a mesh over its `invariants.meshTriangles`. Thin the mesh, or raise the budget in the rig spec. **SKIP** when the rig declares neither — which means *unmeasured*, not that the budget is inert: the same `meshSlots` is a **compile-time** refusal for rigc's own generators, before the gate (§3.7, issue #274) **SKIP** also when the rig budgets **only** triangles and the skeleton carries no mesh ([#580](https://github.com/firejune/rigc/issues/580)). A declared slot budget still PASSes there, because zero mesh slots is a count measured against a ceiling |
| `A14_NO_FULL_FRAME_MESH` | renderer | a mesh spans the whole stage — a full-frame canvas that can never dirty-skip. **SKIP** when the skeleton declares no stage (§3.1): there is no full frame to span, and *unmeasured* must not print the same green as *measured and clear* |
| `A15_IDLE_NO_MESH_BONE_KEYS` | renderer | the `idle` animation keys a bone that drives a mesh, directly or as a control bone. **SKIP** when there is no `idle` animation, or when the one there is carries no bone timeline — a rule whose subject does not exist is unmeasured and not satisfied ([#568](https://github.com/firejune/rigc/issues/568)) |
| `A16_SKELETON_VERSION_4_3` | both | the `skeleton.spine` label is not on the 4.3 line (`4.3`, `4.3.N`, `4.3.N-suffix`) |
| `A17_ATLAS_PAGE_FILES_EXIST` | both | a page the atlas declares is not a file. Check `--images` and `--out`. **SKIP** when the atlas declares no page ([#580](https://github.com/firejune/rigc/issues/580)) — as it is for `A06`, `A19` and `A27`; see `A07` ([#608](https://github.com/firejune/rigc/issues/608)) |
| `A18_DETERMINISTIC_EMIT` | both | a second compile of the same inputs differed. That is a compiler bug, not a spec bug — report it |
| `A19_OVERLAY_PNGS_HAVE_ALPHA` | renderer | an overlay part cannot draw a transparent pixel, so it would paint a solid rectangle over what is behind it. **The texels decide, on both routes** ([#777](https://github.com/firejune/rigc/issues/777)); the file header is only the fast negative. A file with no alpha channel (colour type 4 or 6) and no `tRNS` chunk has nowhere to keep a clear texel and is refused without being opened, by a sentence that names its colour type — so re-export it as RGBA, or as an indexed / greyscale PNG that keeps its `tRNS`. A file whose header says it **could** be transparent is opened and read until its first texel below full alpha; one clear texel passes, and none is refused in the words the packed route uses for a region, naming the file and what it can hold — `is opaque in every one of its 200x80 texels` … `its file can hold transparency — colour type 6 (truecolour + alpha) carries an alpha channel — and no texel uses it`. Saving as RGBA is not the repair: the runtime draws the texels, not the declaration. Until #777 the loose route stopped at the header, so the same fully opaque RGBA part passed a loose build and was refused by `--pack` of the same rig. On a loose page the file is the part, so the whole decoded image is the rectangle and no atlas coordinate is read. Only the base plate may be opaque, and which image that is is decided once for both routes ([#770](https://github.com/firejune/rigc/issues/770)): the plate the build names — on a cut manifest, the part whose window is the crop — and, only when it names none, an image at least the stage's size. The rig's statement comes first because the two can disagree: a stage stated small enough for an overlay to cover would otherwise exempt that overlay. A rig spec cannot name a base plate, so a stageless rig-spec build, and `validate <dir>` on a stageless skeleton, has nothing to decide it; an opaque part there is refused with *"nothing here decides which image that is: this skeleton declares no stage size to measure one against"* and the two ways to decide it — a `skeleton` stage the plate covers, or a cut manifest (for `validate`, the specs it was built from: `--rig`, `--motion` and the `--manifest`). Indexed-with-`tRNS` — the usual output of ImageMagick, "Export as PNG-8", GIMP's indexed mode, aseprite and pngquant — **passes**: it is transparent art. On a **shared** page the question is asked per REGION over the decoded page rather than per file, because a packed page's own file all but always declares transparency — its gutter is transparent — and the file-level question would then be answered by the packing rather than by the art ([#266](https://github.com/firejune/rigc/issues/266)). ⚠️ **That scan states its verdict over the texels it READ, and never over texels that are not on the page** ([#705](https://github.com/firejune/rigc/issues/705)): a rectangle partly on its page is judged over the part that is on it, and the message carries both counts — `opaque in every one of the 77 texels of its 12x8 rectangle at -1,-1 … the other 19 of the 96 it declares are not on the page and are not measured here`. A rectangle with **no** texel on the page is reported **not measured** by name — the region, its rectangle, the page image's size, and the pointer to `A06`, which is the rule that judges a region's rectangle — and no verdict about opacity is printed at all. ⚠️ **A page whose IMAGE is not the size the atlas declares for it is the same non-measurement for every region on it** ([#715](https://github.com/firejune/rigc/issues/715)), and #705's clause does not cover that case: a page rescaled after packing leaves most rectangles partly on it, at coordinates that address a different part of the picture, so the scan came back with a confident verdict over texels nobody had located — on a two-region pack at a uniform 0.5 an opaque part's failure **disappeared**, the scan having found a transparent texel 32 texels away from it. The row names the page's two sizes and points at `A06`, which judges the page grid and prints the header that repairs it (§0.2). It stays a failure rather than becoming a SKIP because a SKIP is per ASSERTION: it would delete the verdicts on every other part of the same page, and an assertion cannot be skipped and failed at once without the report counting it twice. Before #705 the walk was silent about its own reach, so a part nobody could read printed *opaque in every one of its 12x8 texels* over zero of them, which is a refusal pointing at the wrong file: the art it names may be transparent, and the repair is the rectangle in `A06`'s row above. ⚠️ **A page file that cannot be read as PNG at all is the same non-measurement for every part on it** ([#732](https://github.com/firejune/rigc/issues/732)): one row per page naming its parts and pointing at `A06`, which names what the file is — where it used to print `threw: cannot decode PNG …: unexpected end of file`, an inflate error about a file that was never a PNG. **SKIP** when the atlas declares no page ([#580](https://github.com/firejune/rigc/issues/580)) |
| `A20_MESH_WEIGHTS_COHERENT` | both ◑ | a weighted vertex with no bone, a negative weight, a bone index out of range, or weights that do not sum to 1. Under `spine-html` also: an unweighted mesh, a binding at weight 0, or **a bone the mesh declares that no vertex binds** — `mesh "x" declares bone "grip_b" and none of its 25 vertices binds it; the weights reference "box", "grip_a"`. Those three are one sentence about rigc's own generators: the bone set a generated mesh declares is the bone set its weights reference, so a `controls` or `chain` name that moves nothing is a defect where a foreign mesh's is not ([#684](https://github.com/firejune/rigc/issues/684)). Fix the rig spec's `controls`/`chain`, or the manifest's `control_bones`. **SKIP** when the skeleton carries no mesh attachment ([#580](https://github.com/firejune/rigc/issues/580)) |
| `A21_MESH_RIM_PINNED` | archetype | a generated ring's rim, a ribbon's entry row, or a contour's outline (which is all of it) is not pinned to its anchor bone at weight 1 |
| `A22_MESH_UVS_IN_UNIT_RANGE` | both | a mesh UV outside its region, or a UV array that disagrees with the vertex count. **SKIP** when the skeleton carries no mesh attachment ([#580](https://github.com/firejune/rigc/issues/580)) |
| `A23_PHYSICS_CONSTRAINT_EFFECTIVE` | both | a physics constraint that drives no component, rests at `mix: 0` with **no timeline in any animation keying that `mix` above 0**, has `mass: 0`, has `strength` at or below 0 — `0` says `nothing pulls it back`, below 0 says the offset `is pushed away and grows with every step`, both read off the row's `outside` arms, which the key's refusal quotes too ([#748](https://github.com/firejune/rigc/issues/748)) — or has `damping` outside `[0, 1]`, which says `physics "C" has damping 1.5; must be inside [0, 1] — above 1 every velocity grows on every step, and below 0 it is NaN at any fps where 60 / fps is not whole`, the bound read off the row the key's refusal reads; `1` and `0` are inside, since both are finite at every rate ([#794](https://github.com/firejune/rigc/issues/794)) — **at rest, and on every physics timeline key** ([#610](https://github.com/firejune/rigc/issues/610), [#743](https://github.com/firejune/rigc/issues/743)). The timeline arm reads each key through the runtime's own `PhysicsConstraint*Timeline.set`, so a keyed `mass` is judged as the `massInverse` it becomes, and the detail names the animation, the constraint, the key time, the value and the bound. Two differences between the two arms, and the runtime is the reason for both: a **key** of `mix: 0` is accepted, because `update` opens with `if (mix === 0) return;` and muting a constraint for a stretch is what a mix timeline is for — the editor's own `sack-pro` example keys it there on 24 of its 36 mix keys — and a **key** of `strength: 0` is accepted, because it releases the constraint for the span with `damping` and `inertia` still applied and the next key pulls the offset back, measured through spine-core at no NaN, a coast to a limit and a return in 54 steps ([#727](https://github.com/firejune/rigc/issues/727)). As a **setup** value `strength: 0` is still refused by the arm above, and `mix: 0` is refused only when nothing keys it above 0. The `mix` branch above is why `mix` is the one setup value a key can answer for: at rest the constraint is **inert** rather than broken, so a rig that rests muted and is keyed above 0 is refused by nothing, while a rig resting at `mass: 0` is `massInverse` Infinity before anything plays and no key reaches back into that. The detail of the refusal says both halves and how many animations were searched: `physics "C" has mix 0 and none of the 3 animations keys its mix above 0; it is muted — rest it above 0, or key its mix above 0 in an animation`. The search counts the unnamed global timeline for every constraint whose own `mixGlobal` is set, reads each key through the runtime's accessor, counts every sample of a Bezier between two keys as a value the timeline poses — so two keys of 0 joined by a curve lifted above 0 are a rescue, measured to move the bone — and takes an animation a slider applies like any other. It is the one reading `A36` and `A37` use as well ([#752](https://github.com/firejune/rigc/issues/752)). `inertia`, `wind`, `gravity` and the top of `mix` are bounded nowhere, at rest or keyed. `ingest` does not carry a constraint that drives no component into the spec it writes: it omits it with its timelines and reports `PHYSICS_DRIVES_NOTHING` ([INGEST §2.0](INGEST.md), [#731](https://github.com/firejune/rigc/issues/731)), so this sentence is met on a file, never on a decompiled rebuild. **SKIP** when the skeleton declares no physics constraint ([#580](https://github.com/firejune/rigc/issues/580)) — the same sentence `A36` and `A37` have always printed for their own constraint types |
| `A24_AXIS_SPACE_STROKE` | archetype | a bone under the rig's `axisBone` was keyed with a screen-space Y component, or the axis bone itself was keyed. **SKIP** when the rig declares no axis bone, and also when no animation keys that bone or anything under it ([#580](https://github.com/firejune/rigc/issues/580)) |
| `A25_DETACHED_BONE_PARENTAGE` | archetype | a bone the rig declares `detached` is a descendant of the bone it must never hang under |
| `A26_SLOT_DRAW_ORDER` | archetype | the emitted slots are not the rig's slot table — a slot is out of order, is not in the table at all, or is in the table and missing from the skeleton (§3.3). **SKIP** when the rig declares no canonical slot order. ⚠️ A skeleton with **no** slot beside a rig that declares some is **not** a skip, and it is the one rule in this family where an empty loop is not a vacuous pass ([#580](https://github.com/firejune/rigc/issues/580)): the completeness clause reads it as every declared slot lost and names them, which is the maximal case of what [#575](https://github.com/firejune/rigc/issues/575) filed |
| `A27_REGION_NAME_MATCHES_PAGE_FILENAME` | renderer | a single-region page whose region name is not the PNG's basename. **SKIP** when the atlas declares no region ([#580](https://github.com/firejune/rigc/issues/580)) |
| `A28_RIBBON_ROWS_SHARE_WEIGHTS` | archetype | the two vertices of a ribbon row carry different weights, so the strip would change width. **SKIPs** on authored geometry and on a contour mesh — neither has rows rigc paired |
| `A29_STROKE_WITHIN_CONTACT_DEPTH` | archetype | the animation drives deeper than the manifest's measured contact depth |
| `A30_STROKE_WITHIN_CAP_CONTAINMENT` | archetype | the animation drives past the measured containment ceiling, or scales a bone in the axis subtree |
| `A31_DRAW_ORDER_OFFSETS_RESOLVE` | both | a draw-order key names a slot the skeleton does not have, offsets one slot twice, puts a slot outside the slots array, or lists its offsets out of slot order (§4.7). The only assertion that runs **before** `A00` — the last of those shapes makes the loader spin rather than return, so the round trip is refused instead of attempted |
| `A32_EVENT_KEYS_RESOLVE` | both | an event key fires a name the skeleton's `events` block does not declare, sits earlier in time than the key before it, or sets `volume`/`balance` on an event with no `audio` (§4.8). **SKIP** when no animation carries an event timeline |
| `A33_VERTEX_ATTACHMENT_GEOMETRY` | both | a bounding box, clipping polygon or path whose `vertexCount` is missing or disagrees with its vertex array, a weighted run that decodes to the wrong number of vertices or an out-of-range bone index, a clipping `end` naming a slot the skeleton does not have, a path whose vertex count is not a multiple of 3, or a path `lengths` array that does not strictly increase (§3.4). **SKIP** when the skeleton carries none of the three |
| `A34_CONSTRAINT_TIMELINE_TARGETS` | both | an `ik`, `transform`, `path`, `physics` or `slider` timeline names a constraint the skeleton does not declare, names one of another type, or carries no keys at all (§4.4, §4.9, §4.10, §4.12). The last is silent: the parser reads key 0, finds nothing, and skips the timeline. The **empty** name under `physics` is not a miss — it is the timeline that names no constraint (§4.4's `"*"`), and it is refused only when it reaches none: `animation "A" physics constraint "" timeline "P": a physics group that names no constraint writes every physics constraint declaring "PGlobal": true, and none of "C", … does — the parser loads it, the runtime walks every constraint, and no constraint takes the key` ([#726](https://github.com/firejune/rigc/issues/726)). Who it reaches is asked of the runtime's own `PhysicsConstraintTimeline.global` on the file's constraints — the reading `A23` and `A42` share. **SKIP** when no animation carries one |
| `A35_DEFORM_KEYS_FIT_THE_ATTACHMENT` | both | a deform key's run runs past the end of the attachment's deform array, holds a non-finite number, has an empty key array, or names a skin/slot/attachment triple that does not resolve (§4.11). The overrun is the quiet one — the parser copies into a `Float32Array` and drops the tail. ⛔ It does **not** require pair alignment: the runtime has no such rule and a trimmed editor run legitimately starts and ends mid-pair (§4.11, issue #262). **SKIP** when no animation carries a deform timeline |
| `A36_PATH_CONSTRAINT_EFFECTIVE` | both | a path constraint whose slot has no path attachment in any skin, one that constrains no bone, or one whose three mixes are all 0 at setup with no animation keying any of them **above 0** (§3.5.1, §4.12). The first is the quiet one: `update()` returns on its first line and the constraint reports mixes it never applies. The third reads the values the loaded timeline poses — keys and Bezier samples alike — the way `A23` reads a physics `mix`, so a `mix` timeline keying 0 only is not a rescue: [measured] it poses every bone exactly where no timeline does, and before [#752](https://github.com/firejune/rigc/issues/752) it passed. The detail says both halves: `path constraint "P" has mixRotate 0, mixX 0 and mixY 0 at setup and none of the 2 animations keys its mix above 0; update() returns on all-zero mixes, so nothing ever puts a bone on the path — rest one of the three above 0, or key its mix above 0 in an animation`. **SKIP** when the skeleton declares no path constraint |
| `A37_SLIDER_CONSTRAINT_EFFECTIVE` | both | a slider whose animation carries no timeline, one that loops a zero-length animation (the applied time is NaN), one driving off a bone at `scale: 0`, or one muted at setup with no animation keying its `mix` **above 0** (§3.5.2, §4.12) — the same reading as `A36`'s, so a `mix` timeline keying 0 only is no rescue ([#752](https://github.com/firejune/rigc/issues/752)): `slider "S" has mix 0 at setup and none of the 2 animations keys its mix above 0; update() returns on mix 0 — rest it above 0, or key its mix above 0 in an animation`. **SKIP** when the skeleton declares no slider |
| `A38_SKIN_MEMBERS_ARE_SKIN_REQUIRED` | both | a bone or constraint a skin activates that is not `skinRequired` (the list changes nothing), or one that is `skinRequired` and no skin activates (it is never active). Two keys in two places, and only together do they mean "this belongs to that skin" (§3.4.1). **SKIP** when no skin activates anything and nothing is `skinRequired` |
| `A39_DEFORM_KEEPS_TRIANGLE_WINDING` | archetype | a `deform` key reverses a triangle's winding, so the mesh has locally turned inside out and draws its texture backwards there (§4.11). The detail names the animation, the slot, the attachment, the key index and time, and each reversed triangle with its vertex triple and its signed area before and after. Measured at the key's **own** time, deformed against the same posed bones undeformed, so a mirrored slot bone cancels and a wrong *projection* with intact winding is correctly silent. A projection past its fold angle is the usual cause — [FACE.md §4.2](FACE.md) has the closed form. Legitimate art does fold, so declare `invariants.deformMayFold` (§3.7) for a slot that folds on purpose. ⚠️ A key whose slot **draws no pixels at that key's own time** — faded to alpha exactly 0, or showing another attachment — is measured and then passed over, because "draws its texture backwards" is false when nothing of it is drawn; the key is named on the stats line (`deformKeysNotDrawn`) and in the `DEFORM` block, never silently. The bar is **exactly 0**: at alpha 0.5 the fold is still refused and the alpha is in the message. It is per key and per time, so the same slot folding at full alpha in another animation is refused as before. ⚠️ And the **spans between** consecutive keys are scanned too (§4.11.3, issue #403): the runtime interpolates, so a deform inside its fold angle at every key can be past it in between. That refusal is its own sentence — `BETWEEN key 0 (t=0s) and key 1 (t=0.5s), at t=…` — with the time solved for in closed form and then posed and measured like any key, alpha read at that same moment. `deformSpansScanned` says on every green build that the scan ran. ⚠️ And the **frame** it poses in is the one the animation is reached in (§4.11.4, issue #407): on a track when nothing applies it, and otherwise once per **slider**, with that slider's mapping inverted and its bone driven until the runtime selects the key's own time — because a slider picks the time, so the two are one number and posing them independently is a frame that never occurs. The frame is on every `DEFORM` line, on the stats line as `deformFrames`, and in the refusal itself when it is not the track. A key at a time **no dial value selects** is measured in the frame the runtime does land on, left out of `deformKeysMeasured` and named as `deformKeysUnreachable`/`deformUnreachable` — never refused and never silent. ⚠️ And the **skin** it poses in is the one the timeline is keyed on (§4.11.5, issue #583), since a deform's address is a `skin / slot / attachment` triple: the pose wears that skin, which also switches on any `skin: true` bone or constraint it activates, and the "nothing is drawn" sentence names the skin it was read under. **SKIP** when no animation carries a deform timeline, when nothing keyed has triangles, when every mesh keyed is exempt, when every key measured draws no pixels or is unreachable *and no span between them folds where anything is drawn*, or when there is no rig info at all |
| `A40_SLIDERS_COMPOSE_ON_A_SHARED_TARGET` | both | two or more sliders whose animations key the same timeline, where a later one is not `additive` — it writes that property outright at `mix: 1` and every earlier slider on it is dead (§3.5.2). Also fires when the shared timeline **cannot** be applied additively (a slot colour, an attachment swap, a draw order, an ik mix, a path's `spacing`, most physics properties), where `"additive": true` is not the fix and one of the two has to go. ⭐ Which of the two it is, is **posed rather than read off `Timeline.additive`**: the shared timeline is applied twice with `add` set and the detail says what it did ([#655](https://github.com/firejune/rigc/issues/655) — two classes declare that flag falsely about themselves, so a path constraint's `mix` and a slider's `time` were refused although they compose). The detail names the bone or slot and the property, every slider keying it in `constraints` order with its flag, which one wins today, and the class that was posed. Four shapes are deliberately not findings: a slider below `mix: 1` or with its `mix` keyed (the apply is then a lerp from the current pose, not an overwrite), two `skinRequired` sliders no skin activates together, two sliders on different properties, and a shared timeline that writes **nothing a pose holds** — an `events` timeline fires no event under a slider (`firedEvents` is null), so neither slider has anything there for the other to erase. **SKIP** when fewer than two sliders are at full authority; a PASS means two were compared |
| `A41_PHYSICS_SURVIVES_EDITOR_ROUND_TRIP` | both | a physics constraint driving a component the **Spine editor** cannot hold, on a rig that declared `invariants.editorRoundTrip` (§3.7). The editor's physics model holds `x` and `y` only, with no cap on how many at once, so a constraint driving `rotate`, `scaleX` or `shearX` is imported, exported and handed back driving **nothing** — measured over three rigs and twelve constraints with the predictions written first ([#540](https://github.com/firejune/rigc/issues/540)). The detail names the constraint and each component. ⚠️ rigc's own output is correct — every runtime plays a rotation jiggle — so this is opt-in and the default is *not* silence: on a rig that declares nothing it **SKIPs**, and the SKIP names the constraint and the component anyway, so an author learns without having asked. Fix by driving the constraint in `x`/`y`, or by dropping the declaration if the rig never goes near the editor. Disjoint from `A23_PHYSICS_CONSTRAINT_EFFECTIVE` by construction: A23 refuses an **empty** driven set, which is what comes back from the editor, and this refuses a non-empty one that will not survive going in. **SKIP** also when the rig declares the editor and carries no physics constraint at all |
| `A42_DRIVEN_CONSTRAINTS_UPDATE_AFTER_THEIR_DRIVER` | both | a slider whose animation keys a property of a constraint **at or before it** in `constraints` (§3.5.2) — a slider's `mix` or `time`, an ik or transform mix, a path `position`, `spacing` or `mix`, any physics value. That array is the update order for every kind, and each constraint reads its own applied pose when its turn comes — `Slider.update` takes `mix` as the alpha it applies with and `time` as the time it applies at, `PhysicsConstraint.update` returns on `mix` 0 before reading the rest — so the key lands after the only read of it and `Posed.resetConstrained` discards it before the next frame: what the driven constraint drives is dead at every position of the driving dial, although its pose still holds the number ([#658](https://github.com/firejune/rigc/issues/658), [#665](https://github.com/firejune/rigc/issues/665)). The detail names the slider, the driven constraint with its kind, both array indices, the property, the runtime class whose `update` reads it, and the animation the key sits in. Fix by moving the driver earlier, or by keying that property from a slider that already is. **The two indices equal is the same failure**: a slider cannot key its own `mix` or `time`, and one muted at setup that keys its own `mix` up never applies anything at all — `A37` is silent there, because it asks whether *an* animation keys the mix and not which one. **Two shapes it deliberately leaves out**, both measured: a `physics` `reset` key, which fires on a crossed frame time and so never fires from a slider at all, in either order — the reorder would repair nothing; and a physics timeline naming no constraint, which is every physics constraint declaring that property global and IS refused for the ones already run. Disjoint from `A40` by construction: `A40` asks who writes a shared property last and excludes every slider whose `mix` is keyed, this asks whether anything reads what was written. **SKIP** when the skeleton declares no slider, and when no slider's animation keys a constraint property — that SKIP names any `reset` keys it found — a pass means a driver and a driven were compared |
| `A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN` | both | a slot's `dark` (§3.3) or an `rgba2` / `rgb2` timeline (§4.4) that the runtime does not hold as the file states it. Three shapes, all of which parse in silence: a `dark` the slot reader **drops** — it takes the field through a truthiness test, so `""` is discarded without a word and the slot renders with one colour; a `dark` that is **not six hex digits** — `Color.setFromString` slices fixed offsets and stores whatever `parseInt` gives back, so `"4020"` loads a channel of `NaN`; and an `rgba2` or `rgb2` timeline on a slot with **no `dark` at all**, where the runtime allocates no dark colour and the first `state.apply` throws in the consumer's process. The keyed half is read by posing: the animation is stepped to each key's own time — at the key **as the runtime stores it**: spine-core keeps key times as 32-bit floats, so a key at `0.2` is posed at `0.20000000298…`, the later of the two, and not one float step before it, where a first key still shows the setup value and a stepped key the one before (a correct file was refused that way until [#771](https://github.com/firejune/rigc/issues/771)), and the posed `color` and `darkColor` are compared against the hex the key states, to half a quantisation step (`1/510`). The detail names the slot, the value found and the value required. ⚠️ The required value is parsed **here** and not through `Color.fromString`, because a check that read it out of the parser it is checking would agree with that parser whatever it did. `compile.ts` refuses the third shape outright in a rig rigc builds; this is the same fact held against a skeleton it did not write. An `rgb2` key's light colour is compared over its three channels only: the light alpha is not its to state, and that it is left where it was is measured in the selftest (`S85`). **SKIP** when no slot declares a `dark` and no animation keys an `rgba2` or `rgb2` — there is then no two-colour tint to read back |
| `A44_LINKED_MESH_STATES_NO_GEOMETRY_OF_ITS_OWN` | both | a **linked mesh** (§3.4) — `type: "linkedmesh"`, or a `type: "mesh"` carrying `source` — that also states `uvs`, `triangles`, `vertices`, `hull` or `edges`. The parser returns from the `source` branch before `readVertices` (`SkeletonJson.ts:582-586`), so those keys are read by **nothing at all** and `setSourceMesh` fills the attachment with the source's arrays instead: the file says one mesh and every runtime draws another, in silence. The detail names the attachment by skin, slot and placeholder, every key it states, the `source` and where the parser looks for it — the two defaults spelled out, because an omitted `skin` is the **default** skin rather than the one the link is written in — and the shape the keys describe beside the shape the attachment loaded. ⚠️ **`width`/`height` are not part of this.** `setSourceMesh` overwrites both with the source's, so they are as dead at runtime — but the parser reads them (`:569-570`), the format carries them on a link and rigc emits them, so refusing them would refuse every link rigc writes (§3.4). `compile.ts` refuses the same shape outright in a rig rigc builds (§5.1); this is that fact held against a skeleton it did not write, and `ingest` reports it as `ATTACHMENT_LINK_GEOMETRY` ([INGEST §2.0](INGEST.md)). **SKIP** when no attachment in the skeleton takes its geometry from another — which is almost every skeleton, so a pass here means a link was read ([#710](https://github.com/firejune/rigc/issues/710)) |
| `A45_SEPARABLE_COLOR_TIMELINES_OWN_THEIR_CHANNELS_AND_POSE_AS_WRITTEN` | both | an `rgb` or `alpha` timeline (§4.4) the runtime does not hold as the file states it, in one of two shapes that both parse in silence. **A channel keyed twice**: another colour timeline of the same slot in the same animation poses a channel this one poses — `rgba` beside `alpha` is the shape a converter leaves when it writes a separable `rgb` back as `rgba` next to the `alpha` it kept. Every colour timeline poses its channels at every time, the setup value before its first key included, so the one the file states later overwrites the other everywhere; the detail names both timelines, the channel, and which one survives. **A key not posed as written**: the animation is stepped to each key's own time — at the key **as the runtime stores it**: spine-core keeps key times as 32-bit floats, so a key at `0.2` is posed at `0.20000000298…`, the later of the two, and not one float step before it, where a first key still shows the setup value and a stepped key the one before (a correct file was refused that way until [#771](https://github.com/firejune/rigc/issues/771)), and the posed r g b (for `rgb`, against the hex, to half a quantisation step) or alpha (for `alpha`, against `value`, whose absence the parser reads as 0) is compared — a colour that is not six hex digits loads as NaN, and a key whose time another key repeats is read by nothing. ⚠️ An `rgb` alone written as an `rgba` holding the setup alpha is **not** caught and cannot be from the file: it is a correct `rgba`, and the difference shows only under another track that moves the alpha. The loaded timeline class and the channels a separable timeline leaves alone are measured in the selftest (`S83`–`S85`) rather than here, because against the linked parser neither can come out wrong. The channel table is `SLOT_COLOR_CHANNELS` in `src/timelines.ts`, shared with the compiler's refusal and held to the runtime's own property ids (`S89`). **SKIP** when no animation keys an `rgb` or `alpha` — there is then no separable slot colour to read back |
| `A46_SEQUENCE_ATTACHMENTS_SHOW_THE_FRAME_THE_FILE_STATES` | both | a **numbered series** (§3.4.3, §4.13) that the runtime does not show as the file states it. Every shape below loads without a word, measured on spine-core 4.3.13 ([#729](https://github.com/firejune/rigc/issues/729)). **The block**: a `sequence` with no `count` (`readSequence` reads 0, and the attachment holds no region) or a `setup` at or past `count` (`Sequence.resolveIndex` clamps it to the last frame). **The keys**: a `mode` outside the seven — `hold`, `once`, `loop`, `pingpong`, `onceReverse`, `loopReverse`, `pingpongReverse` — loads as `hold`; an `index` that is fractional (`index << 4` truncates it) or past the end (clamped); an advancing mode at an effective delay of 0 (the parser carries a key's `delay` from the key before; `(time - keyTime) / 0` is Infinity and `Infinity \| 0` is 0, so it never advances); a timeline on an attachment that carries no block (the parser gives every region a one-region series, so every mode shows it). **The pose**: every key is stepped to mid-frame sample times — enough to wrap every mode, and a `hold` key to its own time as the runtime stores it, a 32-bit float ([#771](https://github.com/firejune/rigc/issues/771)) — and the region the slot shows is held to the frame the file's own statement gives, the arithmetic of `SequenceTimeline.applyToSlot` and the names of `Sequence.getPath` transcribed rather than read off the loaded timeline, so the check is not the runtime agreeing with itself. Before the first key the frame is `setup`. ⚠️ A sample where the slot shows another attachment is not compared, because the runtime writes nothing there; a timeline with no comparable sample is counted in `stats.sequenceSamplesUnshown`. `compile.ts` refuses every one of these shapes in a spec (§5.1); this is them held against a skeleton it did not write. **SKIP** when no attachment carries a `sequence` block and no animation keys a `sequence` timeline |
| `A47_IK_CONSTRAINT_NOT_MUTED_THROUGHOUT` | both | an ik constraint resting at `mix` 0 that no animation keys **away from 0** (§4.9, §4.12). `IkConstraint.update` returns on `mix === 0`, so it sits in the update cache and moves nothing. The keys are read the way `A23`/`A36`/`A37` read theirs — every value the loaded timeline poses on its `mix` channel, Bezier samples included — so a timeline keying 0 only is no rescue: [measured] it poses every bone exactly where the same rig with no constraint does, and before [#765](https://github.com/firejune/rigc/issues/765) it passed. Live is the runtime's `!== 0`, so a negative mix is not refused. `ik constraint "C" has mix 0 at setup and none of the 1 animation keys its mix above 0; update() returns on mix 0, so "upper" never reaches for "goal" — rest it above 0, or key its mix above 0 in an animation, or declare that the consumer drives its mix, in the rig spec as invariants.consumerDrivenMix: [{ "constraint": "C", "type": "ik", "why": … }]`. A constraint the rig spec declares in `invariants.consumerDrivenMix` (§3.7) is not measured, and one the file also switches on is refused: `ik constraint "C" is declared in the rig spec as invariants.consumerDrivenMix, and the file already switches it on — … — so the declaration exempts nothing; drop the entry` ([#784](https://github.com/firejune/rigc/issues/784)). **SKIP** when the skeleton declares no ik constraint, and **SKIP by name** when every ik constraint it declares is declared consumer-driven: `every ik constraint here is declared in the rig spec as invariants.consumerDrivenMix, so its mix is the consumer's to set and nothing in this file shows it moving — "C" (why: …): it rests muted and none of the 1 animation keys its mix above 0`. With a live one beside it the rule measures that one and the stats line names the declared (`ikConsumerDriven`) |
| `A48_TRANSFORM_CONSTRAINT_NOT_MUTED_THROUGHOUT` | both | a transform constraint none of whose mixes **for a property it drives** is away from 0 at setup or on any value an animation poses (§4.10, §4.12), or one whose `properties` name no `to` at all. A property is applied only when its own mix `!== 0`, and a key that omits a mix reads it as 1, so the six-mix early return of `TransformConstraint.update` would take a key of `mixRotate: 0` alone as a rescue — [measured] that key, and one keying `mixX` 1 on a rotate-only constraint, pose every bone exactly where no constraint does ([#765](https://github.com/firejune/rigc/issues/765)). A negative mix runs, and five transforms in the editor's example exports rest at −1. `transform constraint "C" drives rotate and has mixRotate 0 at setup, and none of the 1 animation keys its mix above 0; a mix is read only for a property the constraint drives, and update() skips each one at 0, so nothing ever moves "follower" — rest mixRotate above 0, or key its mix above 0 in an animation, or declare that the consumer drives its mix, in the rig spec as invariants.consumerDrivenMix: [{ "constraint": "C", "type": "transform", "why": … }]`. A constraint the rig spec declares in `invariants.consumerDrivenMix` (§3.7) is not measured, and one the file also switches on is refused as `A47`'s is; one that drives no property is refused with its own sentence declared or not, since no mix it carries is read by anybody ([#784](https://github.com/firejune/rigc/issues/784)). **SKIP** when the skeleton declares no transform constraint, and **SKIP by name** when every transform constraint it declares is declared consumer-driven: `every transform constraint here is declared in the rig spec as invariants.consumerDrivenMix, so its mix is the consumer's to set and nothing in this file shows it moving — "C" (why: …): it rests muted and none of the 1 animation keys its mix above 0`. With a live one beside it the stats line names the declared (`transformConsumerDriven`) |

`both ◑` marks a mixed assertion: its validity half always runs and its policy
clauses are gated by profile.

---

## 6. What rigc will refuse — do not spend a loop on these

Most of these are in the Spine 4.3 format and the emitter does not write them. Each
of *those* is a **`NotImplementedError` naming the construct**, because the parser's
own behaviour is worse: an unknown attachment `type` returns `null` and the
attachment disappears, and a constraint entry with an unrecognised `type` matches no
case and vanishes.

A deferral carries its reason, and there is one deferred attachment type left:
**`point` appears nowhere in the benchmark corpus** (SPEC_COVERAGE parts 3-1 and
4-2), so it is not on the ladder's critical path. The message says so, because a
deferral without its reason is a wall rather than a work item. `linkedmesh` stood
beside it until [#691](https://github.com/firejune/rigc/issues/691) and is now
emitted — §3.4 has its fields.

⚠️ **A spelling the format does not have is a different refusal and says so.**
`sequence` is not an attachment type, and a `"type"` that is `null` is not an absent
one — telling either author that "rigc does not emit it yet" promises work that will
never be done, on a map the parser would have dropped in silence. Those rows below
are `CompileError`s, and they name what the format actually defines
([#577](https://github.com/firejune/rigc/issues/577)).

| You wrote | You get |
| --- | --- |
| attachment `type` of `point` | `this attachment is a "point" — a position and an angle with no geometry at all — "x", "y", "rotation" and "color" …. rigc does not emit it yet, deliberately: it emits region, mesh, linkedmesh, boundingbox, clipping, path, and a point appears nowhere in the benchmark corpus …` — the message names the **construct**, not just its type string, and part 1-6 is where the sentence comes from |
| a mesh carrying `source` (`type: "mesh"` **or** `type: "linkedmesh"`) | **not a refusal any more** — both spellings compile to a linked mesh (§3.4, [#691](https://github.com/firejune/rigc/issues/691)). They share one parser branch and `source` is what decides between them (SPEC_COVERAGE part 1-6), so `source` on a mesh is a linked mesh whatever `type` says. It was once refused as *2 keys this compiler does not read: "source", "skin" … fix the spelling or remove it*, whose remedy destroys the construct ([#577](https://github.com/firejune/rigc/issues/577)) |
| attachment `type` of anything else — `sequence`, a typo | `attachment type "X" is not one of the 7 the Spine 4.3 format defines (region, mesh, linkedmesh, boundingbox, path, point, clipping). … the attachment is dropped from the skeleton without a word` — a **`CompileError`**, not a deferral: rigc is not going to implement a name the format does not have. (`sequence` is a key on a region or a mesh, not a type of its own.) |
| `"type": null` | `"type" is null, which is not a name. … PRESENT-and-null is not absent: getValue(map, "type", "region") takes the default only when the key is missing, so this map matches no case, readAttachment returns null, and the attachment is dropped from the skeleton without a word. Remove the key, or name a type.` Leaving the key **out** is legal and reads as `region`; writing it as `null` is not the same thing ([#577](https://github.com/firejune/rigc/issues/577)) |
| constraint `type` of anything else | `constraint type "X" is not one Spine 4.3 knows. The five are: ik, transform, path, physics, slider.` — all five are emitted, so this is a typo, and a typo is what the parser drops in silence |
| a path attachment's `lengths` | `"lengths" is not authored — rigc measures the setup arc length of each curve off the geometry` (§3.4). Not a deferral: a second copy of a number the vertices already fix |
| any key neither format has, anywhere in either file | `<object> has a key this compiler does not read: "x" (did you mean "y"?) … Known here: …` (§5.1). Not a deferral either: a key nothing reads is a value you wrote and the emitted skeleton does not contain |

Two more limits that are not errors but will shape what you can attempt:

- **The atlas packer and importer exist and are narrow** (issue #4). `--pack`
  arranges the parts onto shared pages and `--atlas-in` resolves them against a
  pack somebody else made — **§0.1** and **§0.2** state what each does and, more
  usefully, what neither does: no trimming, no rotation, no scaling, and no
  `--profile spine-html` over a packed atlas. The default is still **one part per
  page** with `pma: false` and every region covering its whole page, and nothing
  about a build changes unless one of those flags is given.
- **`drawOrderFolder`** is walked by the validator (so `A05` checks its curves and
  `diff` counts its keys) and cannot be *written*: there is no motion-spec property
  for it. Everything a motion spec **can** key is §4.4's track table — which now
  includes the `path` and `slider` groups (§4.12) — plus the six families that sit
  beside `tracks`: `drawOrder` (§4.7), `events` (§4.8), `ik` (§4.9), `transform`
  (§4.10), `deform` (§4.11) and `sequence` (§4.13). `sequence` stood beside
  `drawOrderFolder` in this sentence until
  [#729](https://github.com/firejune/rigc/issues/729) made it writable.

---

## 7. Before you call it done

1. `build --profile <the one you meant>` exits 0 and the report has **no FAIL**.
   Saying nothing means `spine`, so "the one you meant" is a decision either way —
   the report's first line names the profile that judged it.
   📎 The two profiles judge attachment **naming** identically since
   [#574](https://github.com/firejune/rigc/issues/574): `spine-html` adds the
   renderer and archetype rules and has no opinion about how an attachment is
   spelled, so a rig whose named skins share a placeholder (§3.4.2) is green
   under either. Before that it was green under exactly one of them, and which
   one was not a property of the rig.
2. Read the `SKIP` lines. Each one is a check that did *not* run — make sure none of
   them is a check you were relying on. The summary's *measured* figure is the
   shortest version of this step: it is how many of the rules actually looked at
   anything, and it is the number to quote when you say a rig gated green.
   ⚠️ Under `--profile spine` a foreign skeleton usually produces **no SKIP lines
   at all**, and that is not a clean bill of health. The archetype assertions are
   excluded by the profile before the missing `invariants` block could make them
   skip, so they come back `PROF` instead. Do not go looking for a SKIP that the
   profile already accounted for; read step 3 instead.
   ⚠️ And a **red** report is where this step matters most, which is the opposite
   of how it reads: if `A00` failed, most of the SKIP lines say the round trip
   denied them a result, and the handful of `PASS` rows beside them were measured
   on the raw text alone. Step 1 already sent you back; do not take anything from
   the rest of that report on the way ([#568](https://github.com/firejune/rigc/issues/568)).
3. Read the `PROF` lines. They are where "was this rig held to that rule at all"
   gets answered for everything the profile left out — the renderer policy *and*
   the archetype rules. A green under `spine` has been held to neither; a green
   under `spine-html` has been held to both.
4. Run `explain` and read the slots table: every slot you declared **is** there
   (§3.3 — `A26_SLOT_DRAW_ORDER` holds that, and a slot nothing fills reads
   `setup=null attachments=[]`), so what this step is for is the two things the
   gate cannot check — that the order is the one you meant, and that each slot
   shows the setup attachment you meant.
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

⭐ **That dilution has a *temporal* cousin, and it bites inside a single shot's own
per-frame fit.** The paragraph above is about two builds and a whole-shot figure; this is
about one build and a whole-*figure* objective. Where a passage's motion is **a small
part moving against a large, nearly still body** — a hand, a head, a prop, while
everything else holds — the moving part is a tiny share of the ink, so a whole-figure
score is dominated by the still majority. Every frame then reports a good number
*individually*, the fit converges, and the passage comes out **static**: the mover was
never worth enough of the objective to pull the search toward it.

⚠️ **Nothing else in the loop catches this.** The MAE is fine, the drift is fine on every
part that is not moving, and `validate` and `diff` never look at a rendered frame. What
does see it is §10.3's change column, in its **under-change** direction — and by the time
it tells you, the poses are already wrong, because a key plan cannot add motion the poses
do not have.

⇒ **Weight the objective by the reference's own frame-to-frame change.** Build a mask
from where the reference *changes* between the two frames bracketing the one you are
fitting, and weight the score by it — so the pixels that carry the passage's motion carry
the passage's objective. It costs one extra difference per frame, needs nothing but the
frames, and it turns an untrackable passage into an ordinary one.

📌 **Read the mask itself before you trust the fit, because it also tells you what is
actually moving** — which is frequently not what the shot looks like it is about. A
passage that reads as one limb waving can turn out to carry most of its change somewhere
else entirely (a body-wide micro-rocking, a shadow, a trailing part), and a fitter aimed
at the limb would have been chasing the minority of the evidence. The mask is the cheap
way to find that out first.

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

⚠️ **A part that grows about a pivot that is not its own centre reads as a part
that moves.** Fit a scale about the region centre when the reference scales it about
somewhere else, and the residual stays *plausible* while the fitted centre walks
along with the fitted scale — so the series looks like a translate you measured
rather than a pivot you did not model. The tell is that shape and nothing else: **a
per-frame centre that moves monotonically with the fitted scale is an unmodelled
pivot.** Read it as motion and you author a translate timeline the reference does
not have; read it as a pivot and it is an attachment offset (§3.4's `x`/`y`) with
the bone's own scale carrying both the size and the centre drift — *one* keyed
property, which is also what an editor rig has. Recover the offset by sweeping it
against the frames where the part is unoccluded and taking the minimum; the minimum
is sharp, and it is a structural constant rather than a per-frame value, so a
handful of frames settle it. Measured on a shot with four such parts: MAE **3.13 →
1.95** with not one key value re-measured, and those parts' chains from 10–13
`MAE in it` down to 1.3–8.8. What made it believable rather than a lucky fit is the
second trap's own cross-check — the four offsets came out the same **fraction of each
part's own height**, from four independent fits, which is the quantity that had to
agree between them and did.

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

🚨 **Before you fit a chain at all, check that it can *reach* the extremes the shot
visits — a reach deficit is invisible to every per-frame fit.** This is the precondition
the borrow rule assumes and the loop does not check. If a chain's segment lengths are
short — read off a pose where the chain is **folded**, which is the easiest reading to
take and the one most likely to be wrong — then every frame where the chain is folded
fits beautifully, and the fitter *silently absorbs* the deficit on every other frame by
rotating the parts it does have. Nothing reports a failure. The number is merely a little
worse everywhere, which reads like an ordinary residual, until a passage needs the full
extension and then no start converges anywhere near it — and multi-start does not help,
because the pose being searched for is **outside the chain's reachable set**.

⇒ **The check is arithmetic and needs no fit.** Take the chain's total reach from your own
rig; take the longest excursion the shot's own frames show that chain's end travelling —
a pendulum's full swing, a limb's extreme, a prop's sweep — and compare. If the shot asks
for markedly more than the chain has, the rig is wrong and no amount of searching will say
so. ⭐ **A frames-side reading beats a rig-side one here**: the shot's own extremes are a
measurement, while segment lengths taken off a folded pose are an estimate — so when they
disagree, suspect the estimate. And do this **per chain, before its first fit**, because
the surgery to fix it invalidates every pose already fitted with the short chain.

⚠️ **The paragraph above is written for a chain that is too *short*, and the check bites
in both directions.** A chain that is too *long* fails differently — the fits converge,
every residual is ordinary, and the figure splays to absorb the excess — which is why
reading only this direction has twice sent a run looking for the wrong defect.
[RIGGING.md](RIGGING.md) §6.2 carries the too-long case with its record and its cheap
detector, and §6.3 carries the refusal that goes with it: an excess names a
disagreement between a chain and a shot, and it does not say which of the two is wrong.

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

🚨 **That rule is not sufficient for a *joint*, and the difference is not a matter of
degree.** An attachment offset is identified by a spread of *rotations*; a **pivot** — the
point one bone turns about relative to its parent — is identified only by frames whose
**relative rotation across that joint actually differs**. So a spread can draw frames from
every single shot, satisfy the paragraph above to the letter, and still be
**ill-conditioned**: if every shot holds that joint at much the same relative angle, the
pivot is barely constrained, and a wrong one re-solves far away *at equal residuals*. Equal
residuals is the trap — nothing in the fit reports a problem, because there genuinely is no
better answer within the data you gave it.

🚫 **And a structural descent that holds the fitted poses fixed cannot recover a
mis-triangulated pivot at all.** This is the part worth internalising, because it looks
like the obvious repair and it is inert: the per-frame poses were *fitted against the wrong
pivot*, so they have already absorbed its error. Move the pivot with those poses held and
every frame gets worse; hold the pivot and refit the poses and they re-absorb it. **The
gradient at fixed poses points nowhere**, so the descent reports convergence on the wrong
geometry — and multi-start does not help either, because the defect is not a basin you
failed to reach, it is a parameter the objective is no longer a function of.

⇒ **Triangulate a joint from part template matches across *configurations*, not from the
whole-figure objective.** Match the two parts the joint connects — each is its own art file
and its own reading — on frames that put the joint in **genuinely different relative
angles**, and solve for the one point that is fixed in both parts' own coordinates. Then
refit the poses against the corrected pivot. Two practical notes:

- ⭐ **"Different configurations" means what the shot list looks like, not how many frames
  you took.** A figure standing, walking and running may hold one joint at nearly the same
  angle throughout; a figure **lying down**, or inverted, or reaching across itself, is what
  makes that joint observable. Pick frames for *angular diversity across the joint*, and if
  the shot list has only one configuration, say in the log that the pivot is a prior.
- 📌 **Check the conditioning rather than trusting the fit**: re-solve the joint from a
  subset that excludes the diverse configurations and see how far the answer moves. If it
  moves a long way at comparable residuals, the diverse frames were carrying the whole
  identification — which is exactly the state in which an earlier triangulation goes wrong
  silently.
- ⚠️ **Sequence matters, because the surgery invalidates work.** Correcting a pivot
  invalidates every pose fitted under the old one, so do it **before** the per-frame fitting
  budget is spent, not after. When it has to be done late, expect to re-settle every channel
  hung off that joint — and freeze the ones that are not, so the two effects stay separable
  in the record.

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

⚠️ **Excess adjacency change has a second diagnosis, and the rule above assumes the
first.** *A limb has left its place* is one cause — a fit that teleported, which is what
a blank drift and a high figure per pixel together point at. The other is **two
independent per-frame residuals adding**: every pose inside its own accuracy, nothing
lost, and the *difference* between two neighbours nonetheless several times the
reference's. The fixes are opposite — the first wants the search bounded or restarted,
the second wants the neighbouring poses drawn toward each other (§10.3's own note on
this) — so guessing costs a round either way.

⇒ **Separate them by asking how much freedom the neighbour-mean step actually had.**
Measure, over every neighbouring pair in the shot, how many of those steps your own
constraints left **free** to move: if the answer is a percent or two of them, then the
search was not free to teleport anything, and the excess is residuals adding rather than
a lost limb. It is one count over data the
fit already produced, and it is worth more than an afternoon of restarts aimed at the
wrong cause.

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
to fit one framing across every set instead of one each,
`--texture-from <atlas>` to attribute how much of the MAE is texture resampling
rather than the rig (**§9.2**'s atlas floor — and note that it is *not* `--atlas`,
which re-seats your geometry on that atlas's packing), `--skin <name>` to pose
your candidate under one of its skins (below), `--all-frames` to list
every frame instead of the worst by MAE, `--json <out>` for the whole per-frame,
per-slot report.

🚨 **What `check` certifies is the DEFAULT skin, unless you pass `--skin`**
(issue #571). With no `--skin` no skin is set at all, which is `spine-core`'s own
initial state: every slot resolves through `SkeletonData.defaultSkin` alone, and a
slot whose art lives only in a named skin draws **nothing** — on both sides, since
the reference frames came out of the same renderer. A multi-skin rig checked that
way compares blank against blank and reports `MAE mean 0.00`, which reads like the
best possible answer and is a measurement of no art at all. On a single-skin rig
this is the whole rig and there is nothing to pass.

So a multi-skin rig is checked **once per skin**, and both sides are rendered
under the same one:

```bash
bun cli.ts render --candidate path/to/spine --skin patch --out frames/patch
bun cli.ts check  --candidate path/to/spine --frames frames/patch --skin patch
```

Three things keep that honest, and none of them is a convention you have to
remember:

- `render --skin` writes the name into `frames.json`, so a frame set says which
  picture of the rig it is. A set rendered with **no** `--skin` records nothing,
  because "no skin was set" and "this file predates the field" are the same bytes
  on disk and neither is a claim.
- `check` reads that back. A candidate posed under a **different** skin from the
  one the frames record — or under none, where the frames name one — is
  **refused by name** rather than scored, because the number would be about the
  difference between two skins. Frames that record nothing cannot be checked, and
  the report says so in a `⚠️` note instead of implying agreement.
- The report header names the skin on both sides on every run, `--skin` or not:
  `skin  candidate patch   frames patch`, or `candidate no skin set (the default
  skin alone)`. `check.json` carries the same two under `skin` and
  `referenceSkin`.

A skin name the candidate does not declare is refused with the ones it does —
`the candidate declares no skin "path"; it declares [default, patch, torn]`.

📌 **Deform measurement needs no such flag, because the timeline carries the
name.** `A39` and the `DEFORM` block pose each key with the skin that key is keyed
on — a deform timeline's address is a `skin / slot / attachment` triple — so a
mesh in a named skin is measured in that skin without anything being passed on the
command line (§4.11.5, issue #583). The difference is where the name comes from,
not which command cares: `check` compares two picture sets and neither of them
records a skin unless you say so, while a deform key knows its own.

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

⭐ **Do not treat such a set's two stills as bookends. They are full-resolution frames
at their own rate, and one of them is routinely a pose no other set on disk carries.**
The temptation is to read a strided set as *a sheet, plus two files that fix the
framing* — the sheet is where the shot is, so the stills look like plumbing. But the
last still is the animation's **own last sample at that rate**, and a finer rate lands
on a different instant: a shot whose length is not a multiple of the coarse interval
ends *between* two coarse samples, so the coarse set's last frame is not the end of the
shot and the finer set's is. If the shot is still moving there — and an end pose usually
is the part that moves most — that pose exists in exactly one file, at full resolution,
and it is worth fitting like any other frame.

⇒ **Two consequences for a run.** ① **Fit every committed still**, at every rate, and
do not let a "sheets are for timing" habit skip them; a pose you never fitted is a pose
you guessed, and a hold written across the gap because nothing on disk contradicted it
is a **fabrication** rather than a simplification. ② This is the same fact a brief
states from the timing side when it warns you against declaring the coarse set's
rounded length: the rounding and the missing pose are one arithmetic, seen twice. If
your shot's length is not a whole number of coarse intervals, expect **both** — a
duration the coarse sidecar understates, and a terminal pose only the finer set shows
you.

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
and [the ladder's honesty rule](https://github.com/firejune/rigc/blob/main/docs/LADDER.md) makes them a finish line you reach once.

📌 **That is also why the MAE figures quoted through this section stay.** Every one of
them is a candidate's own reading against rendered frames — the exam question, not the
answer key — so none of them narrows a reference-side measure, and a guide that censored
them would be teaching less for no gain in honesty. The criterion is under *The honesty
rule* in [LADDER.md](https://github.com/firejune/rigc/blob/main/docs/LADDER.md) (issue #158); what it *does* seal is a score written
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

🚨 **And the mirror image of all three: an objective that *improves by removing the
subject*.** The traps above are each *"the number will not move"*, and they train you
to distrust a still figure. The twin is a figure that moves, in the right direction,
for the wrong reason — and it is the more dangerous one, because progress is what it
looks like.

The shape is arithmetic, not a bug. **Any symmetric error over two silhouettes charges
a mismatch in both directions**, so it charges your ink that the reference has none
under *and* the reference's ink you leave bare. Give it a candidate that draws
**nothing** and only the second term survives: the score is the reference's own ink,
once, and it is a *finite, respectable-looking number*. A part that is present but
badly posed pays both terms and can score **worse than absence**. ⇒ A search with a
free enough range finds the cliff and walks off it, and every step of the walk reports
as an improvement. Synthetic illustration of the whole failure in three rows — one
part, one objective, nothing else changed:

| what the candidate does | part error |
| --- | --- |
| posed roughly right | 2.15 |
| posed badly — overlapping the wrong reference ink | 2.48 |
| **translated clean off the frame** | **1.00** |

The search reports **1.00 against 2.15** and calls it a 53 % gain. What it found was
the absence of a subject. ⚠️ **1.00 is not a coincidence in that table, it is the
construction**: absence pays the reference's ink exactly once, so on any objective
normalised by that ink, *"draw nothing"* sits at 1.0 by arithmetic — which is why it is
worth evaluating deliberately rather than discovering.

⇒ **Four defences, and the first is the cheap one.**

- **Bound the search to the frame.** A part cannot legitimately leave the picture on a
  shot whose frames all draw it, so a translation range wide enough to exit the
  viewport is a range that contains a false optimum. Bound each parameter by what the
  frames can *show*, not by what the format permits.
  - ⚠️ **And its converse, which is the easier half to get wrong: a bound has to
    *reach* what the frames show, not merely stop where they stop.** The two failures
    look nothing alike — a bound that is too wide loses a fit to the cliff, a bound
    that is too narrow loses one to a wall it never reports hitting. Bounding a
    vertical channel to the range the *rest* pose occupies is the classic case: a shot
    that drops its subject in from hundreds of pixels above the standing pose puts its
    own entry outside the search entirely, and the fitter returns the best pose *it was
    allowed*, which is the top of the box, silently. ⇒ **Take each channel's range from
    the brief and the frames — the extremes the shot actually visits — and then check
    afterwards how many converged values are sitting on a bound.** A knob resting
    exactly on its limit is the signature, and it costs one line to print.
- **Assert the part is drawn, every iteration.** Count your own ink for that part and
  reject any candidate whose count is zero or a small fraction of the reference's. This
  is one comparison and it makes the cliff unreachable rather than merely unattractive.
  - ⚠️ **Write it at the resolution the level is actually being evaluated at.** On a
    coarse-to-fine pyramid, a threshold expressed in full-resolution pixel counts
    refuses **every** coarse pose — and a rejection that fires on everything is
    indistinguishable from an objective with no gradient. You get `Infinity`, or a
    figure far worse than the same search reaches with the assert switched off, and
    nothing in either says *"your guard is the problem"*. ⇒ Express the count as a
    **fraction of the reference's ink at that same level**, so the test means the same
    thing at every rung of the pyramid.
- **Charge ink that leaves the window, because the cliff has a second entrance.** If
  your objective is computed inside a window around the reference's own drawn box —
  and it usually is, since that is what makes it cheap — then ink outside the window
  costs **nothing**, and the three defences above do not reach that: the part is still
  drawn, its count is still healthy, and the score still falls. The fitter hangs a part
  a few hundred pixels below the frame and reports progress every step. ⇒ **Count your
  own ink further than a small margin outside the reference's drawn box and charge it.**
  One line, in the same place as the ink count, and it closes the entrance the bound
  closes only when the bound happens to be tight enough.
- **Read the objective's floor before you trust its direction.** Evaluate *"draw
  nothing"* once, deliberately, and keep the figure. Any score at or below it is the
  cliff, whatever the search says — and if your best honest pose is *above* that floor,
  the objective is ranking absence over effort and needs an asymmetry (charge bare
  reference ink more than stray candidate ink) before it is safe to optimise against.

📌 **`check` itself is not exposed to this** — its `MAE in it` and `share` columns
divide over the **reference's** own drawn pixels and a chain that draws nothing reads
0 % on 0 slots, which §9.2 says is the loudest row in the table and not the quietest.
The trap lives in the objectives **you** write inside a fit, where the denominator is
yours to choose.

🚨 **The cliff's nearest cousin, and the one that survives all four defences:
*sacrificial cover*.** Every defence above protects a part from being **removed**. None
protects a part from being **moved somewhere wrong on purpose**. A whole-figure objective
scores one number over every pixel, so when part A is mis-placed and leaves reference ink
bare, the cheapest available improvement is frequently to drag **part B off its own correct
place to cover that ink**. Both parts are drawn, both counts are healthy, nothing leaves
the window — and the score genuinely falls, because covering bare ink is worth more to a
blunt objective than B's own displacement costs it.

⚠️ **What makes it expensive is that the objective is not lying.** The pose it prefers
really is better *by that measure*. So the loop offers no signal at all: the fit converges,
the number improves, and what you have is one part visibly out of place standing in for
another. It surfaces later as a **drift** on the sacrificed part — a slot several pixels
from where the frames put it inside a pose whose overall figure looks fine — which is the
one measure that reads parts individually.

⇒ **Two ways to catch it, and the first is nearly free.**

- **Read a per-part residual beside the composite, never only the composite.** Score each
  part against its own template match as well, and flag any frame where the composite
  improves while a part's own residual worsens. That divergence *is* the signature; the
  composite alone cannot express it.
- **Seed the parts analytically from their own measured features, then refine jointly with
  the sacrificed part pinned.** If a part's place is independently measurable — a colour
  feature, a template peak, a contact row the brief gives you — put it there first rather
  than letting the composite negotiate it, and hold the part that was being abused fixed
  while the rest re-settles.

⚖️ **Expect the corrected pose to score *worse* on the composite, and record that as a
trade.** A few percent worse on your own objective while decisively better on every
frame-derived placement instrument is the **expected** shape of this repair, not a
regression — the composite's preference was the defect. Declare an accept threshold before
you need it, say how often you used it, and name the frames. ⭐ **And prefer the
frame-derived instruments when they disagree with the composite about a single part's
place**: the composite is one number over everything, while a template match on that part's
own art is a measurement of the thing in question.

🚨 **One more inert-write trap, and it is on the way *out* of the fit rather than
inside it: your compiled animation is not your pose series.** Everything above is about
a search that reads the wrong thing; this is about a search that was right and an
emission that was not. The formats differ in a way that is easy to miss — **a translate
key is an offset from the setup pose, while a fitter almost always drives the absolute
local position** — so writing the fitted numbers straight into keys applies the setup
offset a second time and displaces the whole figure by it.

⚠️ **What makes it expensive is how it presents.** `build` is green: the numbers are
finite, the durations agree, nothing is degenerate. And `check` does not say *"your keys
are offset"* — it says the union box is a fifth larger than the reference's, the MAE is
several times anything a wrong pose produces, and no slot is attributable anywhere.
That reads like a **wrong rig**, so the hours go into the rig.

⇒ **Before reading a single measure, sample your own compiled animation and diff it
against the pose series the fitter produced.** `sampleAnimation` in
[`src/render.ts`](../src/render.ts) is the same stepper the frames were made with, so
this is a handful of lines and it is exact: for every frame, for every bone, the local
transform the file plays back against the local transform you fitted. A constant offset
per channel is this bug; a constant *factor* is a unit or lever mistake; zeros
everywhere are §9.1's `bone.pose` trap one level earlier. ⭐ **The general rule: a
pipeline with a fit at one end and a file at the other needs one check that the file
plays what the fit found**, and it belongs before the measures rather than after a day
of them.

### 9.2 Reading the table

```
  framed to  256x116px  0.116677 px/unit  world x[-782.1 .. 1412.0] y[-794.7 .. 199.5]  (fitted to the candidate's own drawn pixels)
  reference  256x116px  0.117628 px/unit  world x[-573.3 .. 1603.0] y[-81.2 .. 908.9]  (frames.json)
  content    candidate 234.6x95.5px at (11.3, 11.5)   reference 234.7x95.3px at (11.2, 11.7)   (union over 86 frame(s))
             ⤷ fit x0.999256  offset +0.05, -0.02 px   rms 0.42 px over 344 edge(s)   union residual -0.27 x +0.17 px   aspect -0.30%  (derived, 4 pass(es), settled)
             ⭐ MAE-refined by -1, +1 px: 54.31 → 48.47 over the reference's own pixels (10.7% of the figure). …
  in units   candidate 1995.3 x 809.7   reference 1995.3 x 809.9   x0.9999
  declared   frames.json's own box: REFUSED, coordinates — a fit there asks for … px, past the … px the
             extent-spread tolerance reaches — a different origin or a different unit, over 86 frame(s).

  ── heavy — candidate animation "heavy", 12 fps ──
     frames     65 on disk, candidate samples 65, 65 compared
     MAE        mean 23.10  worst 43.36 at f0029   (0..255 over the union alpha; …)
                ⤷ over the REFERENCE's own drawn pixels, mean 23.90 — the union figure compares two builds …
                (a ⭐ texture floor line joins these two when --texture-from is given — see below)
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
- `extent-spread` — the frames' own box was kept even though your pixels did *not*
  land in it to within a pixel, because the correction a fit asks for is small
  relative to the shot and the fit admits it cannot explain it (see the `declared`
  line and the ⚖️ below). What is left over is a **silhouette** difference at the
  extremes and is a finding about your own outline, not about the box.
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
- `declared` — whether `frames.json`'s own box was taken for this set and on which
  clause, with the correction a fit there asks for and what that fit could not
  explain. It is printed whether the box was taken or refused, because *"refused,
  and by this much, on this ground"* is the part an author has to act on. The ⚖️
  passage below is what the three answers mean.

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

🚨 **Part of your MAE is the texture, not the animation.** The reference frames are
rendered through the example's **own packed atlas**, and a packed atlas may carry a
`scale:` line — the ladder has one at `scale: 0.5`, whose 745x212 part is packed at
373x106. A candidate samples the art at its own resolution and resamples every edge
differently. That is equally true of a `--pack`ed candidate (**§0.1**): rigc's packer
is lossless and writes no `scale:` line, so packing rearranges texels without
resampling one and does not move this constant either way. The pixels are
the same shape in the same place; they are filtered from a different source, and the
difference lands on the outline of every part in every frame. It is a constant, it is
invisible to `content`, `rms` and the `±2 px` refinement — a resampling difference is
not an offset — and **no key you write can move it**.

⇒ **`check` attributes it when you tell it where the frames' own atlas is.** Pass
`--texture-from <the example's own .atlas>` (its `.atlas` is an allowed input in its
own right — `bench/runs/README.md`, *What a run may read*, item 4) and two figures
appear under the MAE:

```
     MAE        mean 6.13  worst 7.51 at f0021   (0..255 over the union alpha; …)
                ⤷ over the REFERENCE's own drawn pixels, mean 6.13 — …
                ⭐ texture floor 5.84  above it 1.68   (over the reference's own pixels, 5.83 and 1.67)
                   ⤷ … the texture accounts for 4.45 of this set's MAE (72.6% of the figure above) and
                     cannot account for more than 5.84 — |MAE − above| ≤ floor …
```

- `texture floor` is your **own geometry through their texels** measured against your
  own render: same pose, same quads, same rasteriser, so there is no rig content in it
  at all.
- `above it` is the MAE with that difference taken out.
- ⭐ **They bound rather than subtract.** Absolute errors do not add, so
  `MAE = floor + above` is false; what is true, per pixel and therefore of the means,
  is `|MAE − above| ≤ floor`. So `MAE − above` is what the texture explained on these
  frames and `floor` is the most it could ever explain. **A floor near zero is a proof
  that the texture is not your problem** — which is a finding worth having before a
  day of key-hunting, and one the old recipe could not give.

Measured on rung 3: **6.13 / 6.01** with the candidate's own full-resolution atlas,
of which **4.45 and 4.10 is texture** — about **70 %** — leaving **1.68 / 1.91** that
is the rig. A run that did not know that would have spent its whole budget hunting a
rig that was already right.

⚠️ Two things about it. It is a **diagnostic and not a better number**: the artifact
`bench` validates ships its own atlas, so the MAE is the figure that belongs in a run's
record and the floor is the account of where part of it went. And the coarser texture
**loses** resolution the finer one has — on rung 3 a pair the reference moves *one
pixel* across stopped being visible at half scale, so a substituted run can report a
frame-change disagreement the graded run does not have. Read it for the floor, never as
the verdict.

🚨 **Do not run this with `--atlas`, which is what the recipe used to say and which
substitutes region *geometry* along with the texture.** `--atlas` names **your own**
atlas for the case where it is not beside your skeleton; point it at a foreign one and
the skeleton is re-loaded against that atlas. An atlas entry is not only a page and a
rectangle — it carries **`rotate:`** and the trim offsets that say where the opaque part
sits inside the original image, and a region attachment's quad is derived from those, so
your attachments are re-seated and the quads change. Worse, `spine-core` implements a
region's rotated corner assignment for `rotate: 90` and for nothing else, so a
270-packed region is sampled from the wrong part of the page outright.

⇒ **The tell was unmistakable and it is the reason this is now a flag of its own: the
number went the wrong way.** A texture floor can only *explain* error, so a diagnostic
that sends the MAE **up** on every set has substituted geometry rather than pixels.
Rung 7 is that case — its pack is `rotate: 270` — and under `--atlas` it read
24.93 → 28.84 and 19.17 → 27.75, which had to be recorded as **inconclusive**. Under
`--texture-from` the same rung measures a floor of **1.7 MAE** on every set, about 2 %
of each figure: there *is* a floor, it is small, and the rig is the story after all.

⇒ **You no longer have to inspect the atlas for `rotate` or trim before running it.**
`--texture-from` keeps every world vertex where your own atlas put it and remaps only
the texture coordinates, through the drawing's own coordinate space, so a rotated or
trimmed pack lands the same artwork in the same place. If a region of yours is missing
from the substituting atlas the report names it and says the floor is a mixture.

🚨 **The precondition the advice above does not state: a floor measured with another
part misplaced is not a floor.** Measuring at the rest pose is right — it is the one
pose you can often *prove*, because the setup pose is the art at its own scale and the
frames state the standing dimensions — but "the pose is provably right" is a claim
about **one part**, and the floor you read is a whole-figure number. Any other part
that can occlude the one you are measuring is inside that number too, and a part
sitting tens of units off its place occludes the **wrong** pixels: the ones it hides
count as yours-and-not-theirs, the ones it should have hidden count as
theirs-and-not-yours, and both land on the part you thought you were isolating.

The damage is that you then hold a *plausible* floor and calibrate against it. A
synthetic case with the same shape — one part measured three ways, nothing about that
part changed between the rows:

| what else is placed | silhouette IoU read for the measured part |
| --- | --- |
| a neighbour still tens of units out of place | 0.74 |
| that neighbour placed | **0.95** |
| (the difference) | 0.21, all of it the neighbour |

A fifth of an IoU is larger than most of what a fit is trying to buy, so two or three
experiments get read against the wrong baseline before anything exposes it — and what
usually exposes it is the setup fit finishing, which is *after* you needed the number.

⇒ **Before believing a floor, check that every part which can occlude the one you are
measuring is already placed** — and prefer a frame where the parts are **far apart or
only one is drawn** to one where they overlap, which is §8.1's rule for calibrating a
two-part assignment applied to a floor. If no such frame exists, say in the log that
the floor is an upper bound on the error rather than a floor under it. ⚠️ This is the
same failure as capturing a guard's expected value from a screen that is already
broken: the baseline records the defect, and then the *repair* is what looks wrong.

⚖️ **`frames.json`'s own box, and the `declared` line that says whether you got it.**
Every set now prints one, taken or refused, with the numbers that decided:

```
     declared   frames.json's own box: TAKEN, coincident — a fit there asks for 0.08 px, under
                the 1 px that separates a candidate in the frames' coordinates from one in its
                own, over 65 frame(s).
```

Two clauses take the box. **`coincident`** is the plain one: rendering into that box
put your pixels on the reference's, so you are authored in the frames' own
coordinates — measured, not assumed. **`extent-spread`** is the tolerance for the case
below, and when it engages the report names it and gives both of its numbers. A
**`coordinates`** refusal means one scale and one offset account for the whole
correction, which is what a different origin or a different unit looks like, and
`check` frames you by a fit instead — where it is blind to your units by design.

⚠️ **The test is on extent, and extent is not the same claim as coordinates.** A
candidate authored in the frames' own world units — one whose setup box lands on the
reference's to the pixel — used to fail it whenever its union content box differed by
a few per cent at the extremes, because `fitFraming` registers extent and a box 6 %
narrower reads as 6 % of scale, which is arithmetically what a units error reads as.
Rung 7 was refused on **all twelve** of its sets that way, and the fitted framing it
fell back to cost every one of them 0.28–2.01 MAE against the declared box. That cost
was real and it was **not** a sign the coordinates were wrong.

⇒ **`check` now separates the two by asking whether one similarity can explain the
disagreement at all.** A difference of units or of origin *is* a similarity, so the fit
absorbs it exactly and leaves a residual near zero — a rig at 2 % different units leaves
0.27 px rms. A silhouette differing at the extremes is not a similarity, so the residual
stays the size of the disagreement — rung 7 leaves 3.32–16.85 px. So the box is taken
when the correction reaches no further than **5 % of the reference's own content box**
*and* the fit leaves **more than a pixel rms** it cannot explain. Both halves matter:
the residual test on its own also takes a rig 300 units away, whose content box is
truncated by the box it is being probed in and whose fit is therefore meaningless.

⇒ **When the box is still refused, report both figures and label which is which.** Run
`check` unaided — that is the figure the artifact produces on its own and the one that
belongs in a run's record — then run it once more with `--viewport` on the declared box
and keep that output as a **named diagnostic file** beside the first. The gap between
them is the framing; what is left is the keys, which is the only reason to want the
second number. 🚫 **The pinned run is never the record.** `--viewport` is a claim about
your own coordinates and `check` says so above every figure it prints under one:
*nothing checks it*. And do not chase a refusal by shrinking a part to fit the box —
that trades a framing cost for a wrong silhouette, which is worse in every column that
matters. Read the `content` line's own advice instead: it names how much wider and
shorter you cover, and **which part reaches too far is a drift question**, not a
framing one.

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

⭐ **And read it when the MAE is loud, because it is what says *which kind* of loud.**
It is the only column that separates a wrong curve from a key moved in time — the two
builds under *The floor every figure here is read against* are that pair, and the
drift column reports 31.1 px and 32.1 px for them.

⚠️ **Each set is compared against ITSELF, so on a shot committed at two rates a hold
can exist in one set and not the other.** The coarse set samples every other frame of
the fine one, so a pair the coarse set holds across is a constraint between samples
**2k and 2k+2** of the fine series — and 2k+1 between them is free to move, and does.
One ladder shot has a pair whose whole-frame change at the coarse rate is **exactly
0** while both fine-rate pairs inside that same span change by 48 px: the subject
shifts under three world units and comes back, so the two coarse samples land on the
same pose either side of it. So §10.3's *key both ends of the hold* has to be applied
**at each committed rate separately**, and equal values are not enough — the two
samples have to be **keys**, or a planner reduces through one of them and an
interpolant inside its own tolerance is not equality. That cost two builds on that
run, the second of them for exactly that reason. ⇒ Measure the frames' own
frame-to-frame change **once per committed rate**, and where a rate holds, pin both
ends as keys whenever a finer rate moves between them.

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
  ⭐ **Only the pixels of it your own composite lets show are correlated**: a
  template pixel you draw something over cannot match the reference wherever the
  slot really is, so it adds the same residual at every offset — and, because
  sliding the template moves those samples onto other pixels, their gradient
  decides the winner wherever the visible basin is shallow. That is not a
  hypothetical: it is what made four of the seven examples in this repository
  report 0.8–2.2 px against frames rendered from themselves (issue #698).

⚠️ **Both matchers are capped, and a blank is a real answer.** A part can be
displaced by about its own size and still be that part in the picture; past that,
a match is another object, not this one moved. So `check` searches that far and no
further, and reports **no match** rather than a number — a 4 px ball cannot report
the 47 px course as its drift. The bar rises with the distance being claimed: a
peak sitting where you already drew the slot only has to confirm it, a peak
claiming the part moved most of a radius has to be distinctive to be believed.

⚠️ **And a slot you cover completely has no drift to report at all.** If every
pixel a slot draws is painted over by something later in your own draw order,
none of its ink reaches the picture, so there is nothing to correlate — `check`
says so by name and counts it out, rather than correlating hidden pixels against
whatever is on top of them:

```
its drift is not measurable — every one of the 2116 px this 48x54 px slot draws is
covered by something the candidate draws over it, so none of its own ink reaches the
picture to be correlated against
```

That is a fact about the shot and not an error: a part behind another part is
still where the rig put it, and the answer to *where did it land* is that this
run cannot say. Read it beside the `slots` column, which counts it as
unattributed.

The `slots` column is how many of the slots you drew got an answer at all, and the
summary line carries the same denominator. `N reference component(s) no slot
reaches` means the reference frame contains something none of your slots overlaps:
a part you have not authored, or one you have put somewhere else entirely.

🚩 **The floor every figure here is read against, and how to measure it.** `check`
grades nothing — `rigc check --help` says so, and the exit code is 0 on any run that
could be made — so a figure means something only beside one you took yourself. The
cheapest one to take is the **identity run**: a build compared against frames
rendered from that same build. It is what this instrument says when the true answer
is *nothing moved*.

```bash
bun cli.ts build  --rig gallery/squash/rig.json --motion gallery/squash/motion.json --out <build>
bun cli.ts render --candidate <build> --animation bounce --fps 12 --out <frames>
bun cli.ts check  --candidate <build> --frames <frames>
```

```
  ── bounce — candidate animation "bounce", 12 fps ──
     frames     11 on disk, candidate samples 11, 11 compared
     MAE        mean 0.00  worst 0.00 (exact: none of the 11 compared frame(s) differs from the reference)   (0..255 over the union alpha; over the whole frame, mean 0.00)
                ⤷ over the REFERENCE's own drawn pixels, mean 0.00 — the union figure compares two builds of the same rig; this one is the one to optimise against, because the union is yours to grow.
     slot drift worst 0.5 px  "plate" at f0004
                ⤷ bounded by 0.71 px — the correlation put this slot where the candidate drew it, so the whole figure is the sub-pixel step, clamped to 0.5 px on each axis
     per-frame all 10 adjacent pair(s) change by as much as the reference's own frames do
```

⚠️ **The MAE floor is zero and the slot-drift floor is not**, and the second half of
that is the instrument's own arithmetic rather than anything about your rig. Both
sides are the same pixels, so every frame's MAE is exactly 0 — which is why the line
says `(exact)` instead of naming a frame. The drift is a **correlation**: it finds
the whole-pixel offset that matches best and then fits a parabola through three
whole-pixel residuals for the fraction, clamped to half a pixel on each axis.

🔑 **So the bound has two halves, and the run states both of them for you.** The
`⤷ bounded by` line is not a constant off this page: it is `hypot(|dx| + 0.5,
|dy| + 0.5)` for that match's own whole-pixel winner `(dx, dy)`. A winner at the
offset you drew — which is the answer on every frame of a correct rig — bounds the
whole figure at `hypot(0.5, 0.5) = 0.71 px`, and the line says the figure is the
sub-pixel step and nothing else. A winner one pixel out bounds it at 1.58 px and
says the correlation moved the part. ⇒ **Read a drift against the line under it,
never against a number from a page about another rig.** A component match prints
the other sentence — two centroids have no such bound, only the search radius.

🚨 **The clamp bounds the figure only while the whole-pixel winner is the
identity, and for a while nothing checked that second half.** Issue #698: four of
the seven examples in this repository read **0.81, 1.11, 2.13 and 2.21 px** against
frames rendered from themselves, because the template carried the pixels the
candidate draws *over itself*. Those match nothing wherever the slot really is, so
they add a residual at every offset — and sliding the template moves them onto
other pixels, so their gradient walks the winner off the origin wherever the
visible basin is shallow. The exhaustive whole-pixel field for `flex`'s backdrop
had its minimum at `(2, 0)` scoring 7.75 against the identity offset's 8.76.
Correlating only what shows put all seven back on `(0, 0)`, and `C25`–`C30` of
the repository's own selftest gate that over every example it ships — so the next
one is gated by arriving.

🔸 The same page said `3.7 px` before issue #678, for an unrelated reason worth
keeping: the coarse sweep started at `−radius` and stepped by its stride, so the
identity offset was on the lattice only when the stride divided the radius, and
the `±1` refinement around a winner two pixels out could not reach back to it.

**A second example, and the one the repair was measured on.** `gallery/flex` draws
a banner and a leaf over a full-stage backdrop, so almost every slot of it reaches
the template matcher:

```bash
bun cli.ts build  --rig gallery/flex/rig.json --motion gallery/flex/motion.json --out <build>
bun cli.ts render --candidate <build> --animation wave --fps 12 --out <frames>
bun cli.ts check  --candidate <build> --frames <frames>
```

```
  ── wave — candidate animation "wave", 12 fps ──
     frames     30 on disk, candidate samples 30, 30 compared
     MAE        mean 0.00  worst 0.00 (exact: none of the 30 compared frame(s) differs from the reference)   (0..255 over the union alpha; over the whole frame, mean 0.00)
                ⤷ over the REFERENCE's own drawn pixels, mean 0.00 — the union figure compares two builds of the same rig; this one is the one to optimise against, because the union is yours to grow.
     slot drift worst 0.2 px  "plate" at f0009
                ⤷ bounded by 0.71 px — the correlation put this slot where the candidate drew it, so the whole figure is the sub-pixel step, clamped to 0.5 px on each axis
     per-frame all 29 adjacent pair(s) change by as much as the reference's own frames do
```

That figure was **2.21 px** on the same command before #698, on the same slot.

⭐ **And the same frames plus two deliberately wrong builds are what say which column
answers which question.** Each differs from the build above in exactly one way —
every easing reversed `(x1,y1,x2,y2) → (1−x2,1−y2,1−x1,1−y1)`, and the ball's bottom
key moved from 0.4 s to 0.62 s — and each is checked against the same identity
frames. Both gate green and both exit 0.

**No run reproduces this:** the candidate is `gallery/squash` with the three curves in its `easings` block reflected through the diagonal, which is an edit to a spec this repository does not carry a second copy of

```
  ── bounce — candidate animation "bounce", 12 fps ──
     frames     11 on disk, candidate samples 11, 11 compared
     MAE        mean 6.69  worst 11.71 at f0007   (0..255 over the union alpha; over the whole frame, mean 5.74)
                ⤷ over the REFERENCE's own drawn pixels, mean 6.69 — the union figure compares two builds of the same rig; this one is the one to optimise against, because the union is yours to grow.
     slot drift worst 31.1 px  "ball" at f0006
     per-frame 1 of 10 adjacent pair(s) change by a different amount than the reference does; worst f0010, yours moved 4152 px where the reference moved 912
```

**No run reproduces this:** the candidate is `gallery/squash` with the ball's `translatey` key at 0.4 s moved to 0.62 s, which is an edit to a spec this repository does not carry a second copy of

```
  ── bounce — candidate animation "bounce", 12 fps ──
     frames     11 on disk, candidate samples 11, 11 compared
     MAE        mean 2.15  worst 6.38 at f0007   (0..255 over the union alpha; over the whole frame, mean 1.84)
                ⤷ over the REFERENCE's own drawn pixels, mean 2.15 — the union figure compares two builds of the same rig; this one is the one to optimise against, because the union is yours to grow.
     slot drift worst 32.1 px  "ball" at f0007
     per-frame all 10 adjacent pair(s) change by as much as the reference's own frames do
```

⇒ **`per-frame` is the column that separates a wrong curve from a moved key, and it
is the only one of the three that does.** The `MAE` says both are wrong and says it
threefold louder for the curve (6.69 against 2.15). `slot drift` cannot tell them
apart at all — 31.1 px against 32.1 px, the same part, a frame either side — because
both put the ball somewhere it is not at the moment being compared. `per-frame` fires
on the reversed easings alone, and it is measuring the one thing the two defects do
not share: how far each side moved **since its own previous frame**. A key moved in
time changes *when* the poses arrive and not how fast the shot travels between two
samples, so the column is correctly silent on it. ⇒ Read the pair together: a loud
MAE with `per-frame` silent is a pose in the wrong place or at the wrong moment; a
loud MAE with `per-frame` firing is a **speed**, which is a curve.

🔸 Neither block above reprints its own `⤷ bounded by` line, for the same reason
both carry the declaration: the spec edits are not in the tree, so those two lines
would be hand-written rather than taken. What the gate measures on them is stated
instead — the worst match of each sits at whole-pixel `(0, −31)` and `(0, −32)`,
which bounds them at **31.50 px** and **32.50 px**. That is the contrast worth
carrying away: a correct rig's drift is bounded by the clamp because its winner is
the identity, and these two are bounded by nothing of the kind because a part
really moved.

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

⚠️ **One exception to "0 % is the loudest row", and on a mesh rig it is the common
case: a chain whose roster reads `(draws nothing)` rather than `0/n`.** Those are two
different states and the table prints them differently. `0 %` on `0/3` **slots drawn**
means three slots exist on that chain and none of them put ink on the frame — that is
the loud row, and it is a missing part. `(draws nothing)` in the **bones** roster means
the chain carries **no slot at all**, and a mesh's control bones are exactly that: the
mesh attachment lives on the slot of the bone the mesh hangs from, so the bones that
*deform* it own nothing to draw. ⇒ **On a mesh rig that row is normal and quiet.** Read
the roster at the foot of the report before reacting to a chain's share: if the chain's
slots column is a parenthesis rather than a fraction, the deformation it carries is
already being scored inside the chain that owns the slot, and the row is telling you
about your bone tree rather than about a hole in your figure.

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
- **What happens between two committed frames** — *unless the set ships a sheet.*
  `Δpx` compares adjacent frames and a set that ships stills has none, so a shot
  that is right at every committed frame and wrong between them reads clean in that
  column. That is the same gap `--frames` on a contact-sheet set already has, and it
  is why the frame-count line is printed. ⭐ What closes it is the **`sheet` line**:
  on a set rendered at a higher rate than the frames on disk, every sampled frame is
  compared, so the samples between two committed ones are measured there and
  nowhere else.
  🚨 **And when you go looking for one of them, do not assume it lies between its
  neighbours.** A half-frame is not an interpolation — it is where the shot actually
  was, and the interesting ones are interesting because it left the interval. Rung
  4's ball makes contact entirely inside one twelfth of a second: the sheet puts it
  **40 px below both 12 fps frames that bracket it**, while its x sits within their
  own range. A search whose reach was scaled from those two frames' own step
  therefore looked ±9 px for something 40 px away and reported the interpolation
  back, twice, before the tile was read rather than inferred.

---

## 10. What the editor does by default

Every reference in this repository was made in the Spine editor by a person, and a
rig authored here is measured against one. rigc's own defaults are deliberately
*absent* rather than opinionated (R1: a field reaches the file when you declare it,
and nothing you did not declare is supplied), so nothing in the compiler will push you
toward the shape an editor rig has.
This section is that push, and it comes from **Spine's public documentation only** —
what the editor does when nobody tells it otherwise, and what its user guide
recommends.

**Nothing here is the answer to any shot.** These are defaults to adopt *unless the
shot says otherwise*, and each is overridable by something you can see in the
frames. Every line is marked with where it comes from:

- 📗 **stated** — quoted or paraphrased from the page linked in the line.
- 🧩 **inferred** — this guide's reading of those pages. Spine does not say it.
- 🔬 **observed** — read off the editor's own export of a rigc build, not from a
  page. Two round trips stand behind these: [issue
  #285](https://github.com/firejune/rigc/issues/285) (Spine 4.3.23) and the
  eight-rig trip of 2026-09-16 (Spine **4.3.26**), whose findings are collected in
  §10.6. ⚠️ This legend said *"used only where rigc now emits the same thing"*,
  which was true while every observation had already been adopted; §10.6 then
  carried one that had **not** been — the path `lengths` disagreement — so an
  observation is now marked by where it was read, and each says for itself
  whether rigc agrees with it. ⭐ That outstanding one has since been adopted
  ([#560](https://github.com/firejune/rigc/issues/560)) and the legend is kept in
  this shape anyway: the reason to mark an observation by its source rather than
  by whether rigc follows it is that the second fact goes stale and the first
  does not.

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

🔬 **The editor re-keys every name-keyed OBJECT, and leaves `bones`, `slots` and
`constraints` alone.** Read off its export of a rigc build (Spine 4.3.26,
`gallery/look`): the `animations` object, a skin's 24 `attachments` slot keys and
two animations' 16 and 2 bone-timeline keys all came back sorted, while the 30
`bones`, 24 `slots` and 3 `constraints` — arrays — came back in the build's own
order, element for element, and each slider kept its place among them.

🚨 **Not every array: `skins` it re-sorts.** That sentence read *"leaves every
ARRAY alone"* for two releases, on those three arrays and nothing else, and
`skins` is the one it was wrong about — see the paragraph at the end of this
section.

⚠️ **The order it sorts them into is natural and case-insensitive, not
codepoint.** This paragraph said codepoint until
[#539](https://github.com/firejune/rigc/issues/539) measured it: `Turn, sweep,
wave` came back `sweep, Turn, wave` and `turn10, turn2, zoom` came back
`turn2, turn10, zoom`. The corpus says the same thing and always did — of its 105
name-keyed collections, 102 are consistent with a codepoint sort and **3 are
not**: `spineboy-pro.json` keys `portal-flare9` *before* `portal-flare10`, which
no codepoint sort produces. Every natural comparator reproduces all 105. (The
population is every object the format keys by a name and that carries more than
one key, deform blocks counted at each of their three levels;
[`src/compile.ts`](../src/compile.ts) states it in full beside
`editorAnimationOrder`, so the count can be re-taken rather than trusted.)
⇒ in rigc: `animations` is emitted sorted (R10), because it is the one
object measured here whose ORDER is also an index space — every reference into
the re-sorted *other* objects is by name on both sides, so nothing moves when
they are re-keyed. ⚠️ Since [#716](https://github.com/firejune/rigc/issues/716)
a skin's `attachments` slot keys are emitted sorted too, for the **text** and
for no reference: a rebuild of an editor export is the export only if it is the
same text (§10.6b), and 11 of the twelve under `examples/` keyed a skin in draw
order where the export sorts it. Nothing is refused on that map — a pair the
comparator leaves open, or a slot name with a `/` in it, keeps the whole map in
rigc's order instead. rigc emits **that comparator's own order**, which
[#728](https://github.com/firejune/rigc/issues/728) then measured in full off five
stored round trips (R10) rather than quantifying over a family. Sorting the
105 collections that way reproduces **105 of 105**, the three codepoint cannot
included, and refuses none of them; the codepoint rule that stood until
[#543](https://github.com/firejune/rigc/issues/543) reproduced 102 and refused
those same 3.

✅ **`events` is re-keyed too, and the references into it survive it.** The same
session measured it: `zebra, mike, alpha` came back `alpha, mike, zebra`, and the
firings still resolved **by name** — `0.3 -> mike`, `0.6 -> alpha`, payloads
intact (#539). So the editor treats `events` and `animations` differently, and
rigc emits events in the order you declare them.

🚨 **`skins` is re-sorted, with `default` pinned first — measured, and it is the
first array measured to move.** A four-skin rig built `default, zulu, mike, alpha`
exported `default, alpha, mike, zulu`
([#541](https://github.com/firejune/rigc/issues/541)), and the deform timelines
came back keyed `mike, zulu` rather than `zulu, mike` with it. Note `alpha` sorts
before `default` under every candidate comparator and still came back second: the
default skin is **pinned**, not sorted. It matters for the same reason `animations`
does — `skins` carries ordinals in the binary half, `skins[readInt()]` for an
attachment timeline and `skins[skinIndex]` for a linked mesh — so this is the
`animations` defect (#535) in the collection nobody had checked. ⇒ in rigc: R11.

✅ **Which comparator it is was the open half of that, and #728 closed it.**
`alpha, mike, zulu` is the order codepoint, case-folding and natural order all
produce, so #541's rig refuted nothing and rigc refused any skin-name pair the
candidates could disagree about. Two of the five round trips carried one name list
as **both** collections and both came back in one order, so `skins` and
`animations` share one comparator — measured, not inferred — and the wider skin
refusal is gone (R11).

✅ **The two readings this replaces.** A pull request once called `skins` *measured
preserved*, on the strength of a one-skin rig where a one-element array comes back
in order whatever the editor does to it;
[#544](https://github.com/firejune/rigc/issues/544) corrected that to *unmeasured*,
and added that it could not be measured because the editor refused a four-skin rig
on import without printing a word. Both readings were the same generalisation — *an
editor does not move arrays* — off the three arrays that were measured, and the
"without a word" was rigc's own harness discarding the editor's stderr, which had
named the cause all along (§3.4.2).

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

⚠️ **And a tolerance is not a *slow span* either — a key tolerance needs a relative
floor beside its absolute one.** The rule above rescues exact stillness by forcing it,
and deliberately leaves near-stillness to the tolerance. But **§9.2's per-frame column
compares *changes*, not positions**, so on a span the shot barely moves across, an
error well inside an absolute tolerance is most of the motion. Measured, on rung 3: the
reference moves **0.109 px** between two frames; a greedy span deviated **0.098 px**
there, legal under a 0.30 px tolerance and legal again under 0.15 px — and the column
read **259 px against the reference's 40**, a six-fold disagreement authored by a span
that was, at every keyframe, exactly right. The same tolerance that is generous on the
fast part of the shot is a 90 % error on the slow part, because one figure in pixels
cannot be both.

⇒ Cap each span's deviation at **the smaller of the absolute tolerance and the
smallest single-frame move inside that span**. It is one line in the planner, it costs
a handful of keys, and it is the difference between a reduction that is accurate and
one that is accurate *in proportion to what is happening*.

⚠️ **The opposite defect exists and forcing keys makes it worse.** Everything above is
one direction — *my curve slopes through a plateau the reference holds* — and its fix is
to force both ends as keys. The other direction is *my candidate moves several times
what the reference does on a pair the reference barely moves across*, and if you reach
for the same fix you will pin the excess in place instead of removing it. **The cause is
different**: there the key plan was smoothing away motion the shot has; here the key
plan is faithful and what disagrees is the **per-frame residual** — two neighbouring
poses each a little off, in opposite directions, so the *difference* between them is
several times either error. Forcing both as keys asks the planner to reproduce exactly
the two poses whose disagreement is the problem.

⭐ **Diagnose it before you fix it, with one comparison.** Take the two frames the column
flags and ask whether your **poses** at those two frames are each inside your own fitting
accuracy. If they are — and the pair still disagrees — the defect is the residual and not
the plan. Synthetic case, one pair:

| | reference moves | candidate moves | each pose's own error |
| --- | --- | --- | --- |
| a quiet pair | 0.8 px | 4.1 px | 1.6 px and 1.7 px, opposite signs |

Both poses are ordinary; the pair is a five-fold disagreement built out of them.

⇒ **The fix has the same shape as the relative floor above: make the smoothing slack
relative to the reference's own local change.** Where the reference barely moves,
contract your neighbouring poses toward each other until your own frame-to-frame change
is inside the band — accepting a small, *bounded* loss of fidelity on those frames in
exchange for the one measure that can see a hold. ⚠️ **That is a trade and it is recorded
as a trade**: name the frames, name the cost per frame, and say in the log that you took
it. A contraction reported as a fit is the same dishonesty as a hold reported as a
measurement, and the cost is real — the frames you contracted are slightly less faithful
than they were.

🚨 **Contract the *planned curves*, not the pose series — the report never sees the pose
series.** This is one sentence and it is worth two builds: the change column measures
your **compiled animation sampled at the frames' own rate**, and between your poses and
that lie the key reduction and the curves. Contract before the reduction and you have
adjusted a series nothing downstream reads — the planner then re-fits its spans through
the adjusted poses, the interpolants land where the tolerance allows, and the pair you
were aiming at comes back out of band having *moved*. ⇒ **Apply the contraction where
the measurement is taken**: plan the keys, sample the planned curves, find the offending
pairs, and contract *those samples* by forcing or moving the keys that produce them —
then re-plan and re-sample. That is the closing loop below, and its subject is the curve
series throughout.

⚠️ **And aim *inside* the band, not at it.** `check`'s thresholds are exact and stated in
[`src/check.ts`](../src/check.ts), so it is tempting to converge until every pair is
just inside. But a run measuring its own change renders in **its own framing**, and the
report renders in the one `check` chose — and a fraction of a percent of scale is worth
a few percent of a pixel count. A pair you cleared by a hair in your loop can sit the
wrong side of the same threshold in the report, on a difference that is entirely
framing. ⇒ Converge to a **margin** — clear the band by enough that a percent of scale
cannot cross it — and re-read the real report before believing the column.

🚨 **There is a third direction, and on a busy shot it is the binding one: your candidate
moving too *little*.** The two cases above are both *you moved when you should not have*
— a hold that is not held, and excess change on a quiet pair. But `check`'s rule is
**two-sided**: it faults a pair when **either** side moves several times the other by
more than its pixel floor. So the mirror case is a reference that is genuinely busy and
a candidate that reproduces a fraction of it, and nothing in the two paragraphs above
names it.

⭐ **The practical form is a floor rather than a ceiling: on every pair the reference
moves, yours has to move at least about a quarter as much.** Read the exact multiple and
the pixel floor out of [`src/check.ts`](../src/check.ts) rather than trusting the
approximation — but plan against the floor, because it behaves quite differently from
the ceiling:

- **It is not fixed by keys.** Over-change is a planning artefact you can force or
  contract away. Under-change means the *poses themselves* barely differ, so no key plan
  recovers it — the fit has to find more motion before the planner sees any.
- **It is where a whole-figure objective fails hardest**, which is why the item below
  belongs beside it: a passage whose motion is a small part against a large still body
  contributes almost nothing to a whole-shot score, so a fitter converges happily on a
  near-static series and every pose looks fine on its own.
- ⚠️ **And the band will accept a shot that is visibly underplayed.** Clearing the floor
  at a quarter is not reproducing the motion; it is not *failing* it. A run whose busy
  passage sits near the floor should say so in the log as a known-weak passage rather than
  quote the column as if it were a fidelity result — the column is a **band**, and a band
  is the widest thing that passes, not the thing you were aiming at.

⭐ **Then stop trusting the floor and close the loop on the frames, because a floor is
a heuristic and the column is a measurement.** The floor above cut rung 3's
disagreements from three to one and could not reach the last: **sample your own planned
curves at the frames' own rate, render them, compare every adjacent pair against the
reference's own change, force the offending frames as keys, and re-plan** — repeating
until no pair is out of band. It terminates quickly (that shot needed one extra round
on one animation and none on the other), it needs no build, and it is the only part of
key planning that is verified rather than argued. ⚠️ The band is worth reading before
you aim at it: `check` calls a pair a disagreement when one side is **exactly** still
and the other is not, or when one side moves **four times** the other **and** at least
**24 px** more (`src/check.ts`). So the wide middle of a shot is nearly free and the
whole difficulty is the pairs where the reference barely moves — including, on that
rung, one pair it moves a single pixel across, which no MAE and no drift figure in this
toolchain can see.

🚨 **But check that the shot holds at all first, because applying this to one that
never does manufactures the defect it prevents.** The rule is about a *shot*, and a
snap-to-still step in a planner does not cost nothing when there is nothing to snap:
it will find some run of samples inside the fitter's own resolution and flatten it.
Rung 4's shot has **no** still span — not one adjacent pair of its 155 reference
frames is pixel-identical, and even its last two differ, because the chain is still
settling at the final frame — and the snap duly flattened the tail and put a
*"yours moved 0 px where the reference moved 28"* into the per-frame column: §9.2's
held-pose defect arriving from the opposite direction. ⇒ Difference every adjacent
pair of frames once, before the planner runs. It is one pass over the set, and it
tells you whether this paragraph applies to you at all.

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

🚨 **There is a third situation, and it is the one where nothing in the loop can
help you: a tolerance under the accuracy of whatever produced the series.** The
arithmetic above is about the *subject*; this is about the *estimator*. A fitted
series is only as good as its objective's basin, and a tolerance below that width
buys keys that encode the fitter's wander — and **`check` cannot see that it
happened**, because two candidates that are both inside tolerance render the same
pixels. `diff`'s `key_counts` sees it and `diff` is the finish line, so a run gets
one shot at the number. Rung 4's is the recorded case: it declared 0.28 px, and its
own objective's basin on the shortest lever in the chain measured **±1.5°**, which
is ±0.5 px there — so the declared figure was under the noise, and it shipped about
three times the reference's key count (`key_counts` 421/1339) with every other
animation measure at or near 1.000. ⇒ **Measure the basin before you declare the
tolerance**, which costs nothing and needs no reference: scan each knob around its
converged value and read how far it moves before the objective does. Then declare a
tolerance at or above the widest of them, and record both numbers.

⚖️ **Read that last sentence with the rule two paragraphs up, because taken literally
the two pull apart — and the resolution is that the basin is a *per-channel floor*,
not a second global declaration.** The tension is real: *declare one tolerance* asks
for a single figure in one unit so the density trade reads as one curve, while
*declare at or above the widest basin* points at the worst-identified knob in the rig.
Those can differ by **an order of magnitude** — a well-levered channel the objective
pins to a fraction of a pixel sitting in the same rig as a part the objective barely
sees at all, whose basin is several pixels wide. Take the widest and every good channel
is keyed to the worst one's ignorance; take the declared figure alone and the bad
channel ships the fitter's wander as data.

⭐ **What decides it: a basin belongs to the estimator that wrote the channel, and a
run that fits poses has more than one.** The two rules are answering different
questions. *One tolerance* is about the **unit and comparability** of the figure you
declare — that survives untouched. *The basin* is about the **noise under a particular
series**, and noise is a property of the estimator on that channel, not of the rig. So:

> **Declare one tolerance, in pixels at the end of what each bone swings. Then floor it
> per channel at that channel's own basin, capped.** Effective tolerance for a channel
> = `max(declared, min(that channel's basin, cap))`.

- **Why per channel** — the thing the floor protects against is encoding wander, and
  wander is per channel. A global maximum spends keys nowhere they were needed and
  removes them nowhere they were wrong.
- **Why a cap, and this is the part worth understanding.** The basin bounds **what you
  know**; the tolerance also bounds **what you render**, and the rendered series is read
  by `check`'s change column at *zero* slack (§9.2). So an uncapped floor lets a
  badly-identified channel buy a reduction error large enough to show up as motion the
  reference does not have — trading a measure nothing reads for one read at zero
  tolerance, which is the wrong direction. A cap of a pixel or two, declared and
  recorded, bounds the reduction error whatever the identifiability.
- ⇒ **And a channel whose basin exceeds the cap is telling you it is not identified,
  which is a different problem with a different fix.** The answer there is a **prior** —
  regularise the channel toward a smooth trend and say in the log that you did — not a
  tolerance wide enough to key it three times and call the result a measurement. ⚠️ Such
  a channel is *partly a prior rather than a measurement*, and a run that does this
  records which channels and over which passages, exactly as it records a contraction
  trade below.

📌 **Record all three numbers**: the declared tolerance, each floored channel's basin,
and the cap. `diff`'s `key_counts` is the finish line and a run gets one shot at it, so
the arithmetic that produced the density is the only thing that makes the figure
readable afterwards.

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

🔬 **A Bezier on a hold is written `stepped`.** Import a build, export it again, and
every key that carried a curve into a segment whose next key holds the same value on
every channel comes back as `"curve": "stepped"` — 14 keys on the gallery's `nod`
alone, with every rendered frame byte-identical, because a curve over a flat segment
draws nothing. rigc emits the same for a **named** easing (§4.5, issue #369), so
`diff`'s `animations.curve_kinds` reads 1.000 between a build and its own export
rather than charging the hold rewrites against the timing. A raw `curve` stays as
written: it is the file's own numbers, and the reference corpus has the editor itself
shipping beziers over holds in 18 keys, so the format legitimately holds both. ⚠️ The
editor also turned some *linear* holds into `stepped` on one example and none on two
others; a rule that cannot be stated is not adopted, so those still show in `diff`.

### 10.5 What the export leaves out

📗 **Nonessential data is off unless someone checked the box.** *"Data marked
'nonessential' is only output when the Nonessential data export setting is checked"*
— [JSON format](http://esotericsoftware.com/spine-json-format); the setting adds
*"additional data … that is not usually needed at runtime"* —
[Export](http://esotericsoftware.com/spine-export). What that page marks
nonessential: the skeleton's `fps`, `images` and `audio`; a mesh's and a linked
mesh's `width` and `height`; a mesh's `edges`; and the editor colours of bounding
box, path, point and clipping attachments. ⇒ a mesh in an export made without that
box carries **no** `width`/`height` and no `edges`. rigc's `image` supplies the
sizes from the PNG (R5) and the triangles supply `edges` and `hull` (§3.4), so you
never write any of them by hand — and rigc's own output always carries all
three, because the editor's *import* treats their absence as an export made
without the box and rebuilds the hull on its own.

🔬 🚨 **And the CLI's default export has that box ON, so for anything driven from
the command line the ⇒ above is the exception rather than the case.** The
sentence is still true of an export made without the box; what is measured is
that `-e json` with no export-settings file does not make one. Every field on the
nonessential list came back present, unchanged and not zero on round trip 6
(2026-09-16, Spine 4.3.26): the header's `fps` (24 on `fields`, the one rig that
declares it) and `images`; a mesh's `width`/`height` (64/48) and `edges`
(16 entries, identical); the editor colours of a **bounding box** (`3cff6bff`), a
**clipping** polygon (`ff3c6bff`) and a **path** (`ff6b3cff`); and a bone's
`icon` (`circle`) with its `color`. All eight exports also carry
`"audio": "./audio"` — a field rigc never wrote and none of those rigs has any
use for — which is the list's own last member arriving unasked. The runtime says
the same thing from the other side: `PathAttachment.js`'s doc comment on `color`
reads *"Available only when nonessential data was exported"*, and the colour is
there.

📗 The CLI page documents the form but not the setting: *"If `json` or `binary` is
specified instead of a path to an export settings JSON file, then a JSON or
binary export is performed using default settings"* —
[Command line interface](https://esotericsoftware.com/spine-command-line-interface).
❓ **Neither that page nor the Export page states whether nonessential is on in
those defaults**, so the answer above is measured here and documented nowhere.
⇒ In practice: do not plan around fields being dropped. An export you did not
personally make without the box is an export that has them, and the round trip is
therefore **richer** than the build rather than poorer — which is why #368's
hull-and-edges degradation does not return on a second trip (no import warning in
any of the eight `roundtrip.log`s, and a five-vertex mesh's `hull: 4` came back
`4` rather than recomputed to `5`). A nonessential-**off** trip would need an
export-settings JSON, and ❓ the key name inside that file is not documented
either.

⚠️ **A region's `width`/`height` are not on that list.** They are documented with no
*"assume … if omitted"* default — the same fact R5 states from the parser's side:
omit them in raw JSON and every UV collapses, in silence. Name an `image`.

✅ **You need not imitate the exporter's omissions — the emitter does it for you.**
Spine's exporter drops fields equal to their default, which is why the format page is
a long list of *"assume 0 if omitted"*, and since
[#716](https://github.com/firejune/rigc/issues/716) rigc's emitter drops the same
ones (R1, §2; the table is §10.6c). So an author may still state a default — `x: 0`
in a rig spec is legitimate and stays in the spec — and the file leaves it out.
⚠️ This paragraph said *"do not imitate the exporter's omissions … rigc deliberately
does the opposite"* until then. The advice was re-derived rather than kept: **the
round trip is the reason.** A rebuild of an editor export that writes back every
default the export left out is a different file from the export in 2,338 places over
the twelve under `examples/`, and one that leaves them out is the export's own text
apart from the header's `hash` and `spine` (`IG83`, and [INGEST §2.3](INGEST.md)).
The habit worth carrying over is still not *omit defaults* — it is *declare only what
the shot needs*; what changed is that stating a default costs nothing in the file.

### 10.6 What a round trip gives back

Everything above is what the editor **does**. This is what it **returns** — which
matters to you for one reason: a construct nobody has carried through the editor
is a construct that might vanish there, and an agent cannot see that it did.

🔬 The source is one run: eight discriminator rigs, each built to isolate a group
of fields, compiled by rigc **0.21.0** (emitting 4.3.13), imported into a licensed
Spine **4.3.26** through the documented CLI and exported back on 2026-09-16, with
the predictions written down before anything was opened. **Seven of the eight came
back differing from their build in three header fields and nothing else** —
`hash` and `audio`, which the editor adds, and `spine`, which it stamps with its
own version. The eighth is the path rig, and it is the last bullet here.

⚠️ *"Nothing else"* is under two normalisations, both of which are the exporter
being ordinary rather than the editor changing anything: **float spelling** (`48`
comes back `48.0`) and **omitted defaults** — the export drops any field equal to
its parser default, so the header loses `x: 0` and `y: 0`, a bone loses `x: 0`, and
a key at t=0 loses its `"time": 0`. Every name-keyed object is also re-sorted, per
§10.1. None of those is a loss of information, and each is worth knowing before
you read a `diff`. 🔁 Since [#716](https://github.com/firejune/rigc/issues/716) the
bone's `x: 0` and the key's `"time": 0` are left out by rigc as well (§10.6c); the
header's origin is not, because the 4.3 JSON reader has no default for it
(`skeletonData.x = skeletonMap.x`, `SkeletonJson.js:70`), so an absent origin loads
as `undefined` where a written one loads as `0` — writing it is exact for both
readers, and leaving it out would move a loaded value.

⚠️ Read every line below as *this construct survived*, never as *this construct is
recommended*. §10.1–§10.5 are the recommendations; this subsection is only the
evidence that the format will carry what you write.

- 🔬 **A transform constraint survives whole.** 4.3's `source` plus its
  `properties` map — including a nested `to` with `offset`, `max` and `scale` —
  came back field for field, with `localSource`, `localTarget`, `additive`,
  `clamp`, `mixRotate` and `mixY` beside it.
- 🔬 **The `transform` timeline survives** — the group shape that maps a
  constraint name straight to a key array (§4.10), with its per-key mixes and
  curves intact.
- 🔬 **`shear`, `shearx` and `sheary` bone timelines survive**, paired and
  single-axis, with both channels of a paired key and all their curve control
  points.
- 🔬 **A bone's setup `scaleX`, `scaleY`, `shearX`, `shearY` and `inherit`
  survive**, a non-default `inherit` included — `noScale`, `onlyTranslation` and
  `noRotationOrReflection` were all carried on one rig.
- 🔬 ⭐ **A bone's `color` and `icon` survive** — 4.3's bone icons round-trip
  (`circle`, `ff7f00ff`). They are nonessential data, so this is also a reading of
  §10.5's caveat.
- 🔬 **The `drawOrder` timeline survives, offsets and all — including the empty
  key.** A key with no `offsets` restores the setup order (§4.7), and it came back
  **empty** rather than spelled out as an identity permutation, which is the
  spelling that would have made every later diff read as a change.
- 🔬 **Slot `color`, `dark` and `blend` survive**, `blend: multiply` and
  `blend: additive` included.
- 🔬 **A path constraint's non-default modes survive**: `positionMode: fixed`,
  `spacingMode: proportional`, `rotateMode: chainScale`.
- 🔬 **A path attachment's `closed: true` and `constantSpeed: false` survive**, and
  so do its `position`, `spacing` and three-channel `mix` timelines — all three
  channels of every `mix` key, and all twelve curve numbers on each key that
  carries a curve. ⚠️ Its `lengths` did **not**, which is the last bullet — and
  since [#560](https://github.com/firejune/rigc/issues/560) they do, because rigc
  now emits the numbers the editor recomputes rather than numbers near them.
- 🔬 **`physics.mix` and `physics.reset` timelines survive**, the `reset` key
  included — a key that carries a time and no value at all — and so does the
  physics constraint's setup `mix`.
- 🔬 **A time-driven slider survives** — one with no `bone`, carrying `loop`, a
  setup `time` and a setup `mix`, with both its `time` and `mix` timelines.
- 🔬 **`boundingbox` and `clipping` attachments survive whole**: `vertexCount`,
  `vertices`, the clipping `end` slot, `convex`, and both editor colours.
- 🔬 **An unweighted mesh survives and its `hull` is kept, not recomputed** — a
  five-vertex mesh declaring `hull: 4` came back `4`, with its `edges`, `color`,
  `uvs` and `triangles` unchanged. Beside it, on the same rig: the header's
  `referenceScale`, a region's `rotation` / `scaleX` / `scaleY` / `color`, and an
  attachment whose `path` differs from its placeholder (the mechanism of
  [#552](https://github.com/firejune/rigc/issues/552)) all survive. A `--pack`
  build round-trips too.

🚨 **The one thing that did not come back is a path attachment's `lengths`, and it
moved the drawing.** The editor recomputes them at export from the geometry —
the imported project holds the numbers it was given — and it measures each curve
with the **runtime's own four-sample forward difference**, not with an arbitrarily
fine one. `PathConstraint`'s `constantSpeed` re-measure is that same computation:
its constants are `0.1875 = 3t²`, `0.09375 = 6t³` and `(cx1 − x1) · 0.75 = 3t` at
**t = 1/4**, four `Math.sqrt` terms per curve. A 4-sample chord sum over the same
control points reproduces the editor to every digit it prints, on a closed path
under 4.3.26 (`[152.7006, 305.4012, 458.1019, 610.8025]`) and on an open one under
4.3.23 (`[430.8389, 838.0142, 1127.736, …]`).

⚠️ **That last reading settles the model and cannot settle the spelling.** A
4-sample chord sum agrees with the runtime's forward difference to about **nine
significant digits** — *below* what float32 can hold, which is why both spellings
reproduce both exports exactly, and since issue #716 below what rigc's own file
holds too, because rigc now writes each number as its float32. Under the six fixed
decimals it wrote until then the file could tell them apart: on both rigs above
they rounded apart on the **last** curve, where the running total has accumulated
most — `610.802519` against `610.802520`, `1127.735817` against `1127.735818`. So
the editor is the evidence for *what* is computed, and only `PathConstraint`
itself is evidence for *how* — `PS67`/`PS68` compare the transcription with it at
double precision.

⭐ **rigc emits the forward difference itself** since
[#560](https://github.com/firejune/rigc/issues/560) — `pathCurveLengths` in
[`src/compile.ts`](../src/compile.ts) is those runtime lines transcribed, down to
`Math.sqrt(dx * dx + dy * dy)` rather than `Math.hypot` and `0.16666667` rather
than `1 / 6`, both of which change the emitted file. All seven entries of the two
exports above now come back at the precision the editor prints them, so a path rig
built here and one authored in the editor parameterise identically. ⚠️ The
consequence for you is a vocabulary one: `lengths` is **not** an arc length. It
sits about 0.5 % below the arc by construction, so a physical quantity — how far a
wheel rolls, how long a ribbon is — has to be measured off the curve and not read
out of the artifact.

🔬 **And the editor always writes `vertexCount / 3` entries, computing the
wrap-around curve even on an open path** — that open path's fourth entry,
`2136.228`, is the closed-chain cumulative. ⚠️ Neither array is wrong: the parser
allocates `vertexCount / 3` and copies whatever is there, and `PathConstraint`
reads at most `lengths[curveCount]`, so the trailing entry is never read.

⇒ **What this means for you.** `lengths` is the one number in a path rig you
cannot check by looking: `diff` does not compare it, and `A33` asks only that it
strictly increase, which any plausible array does. A total that is a fraction of a
percent out was measured at **4.9612 mean MAE** on the one rig of that run with a
path constraint, against **0.0000** on the other seven. If you are comparing a
path rig against an editor reference and everything structural agrees while the
picture does not, this is the first place to look.

⚠️ **What decides whether it moves a pixel is the POSITION mode**, and an earlier
reading of this paragraph put it on `spacingMode: proportional`, which is the one
mode it cannot be: proportional spacing scales *with* the total, and that is
exactly what cancels. The rig that drifted is `positionMode: fixed`, where an
absolute `position` is compared against a total that moved. Under
`positionMode: percent` the position scales with the total too, so a uniform
change cancels out of both — measured across #560, `gallery/ride` is
percent/percent and every one of its 74 rendered frames came back **byte
identical** on an emitted array all three of whose numbers moved. ⇒ Read a
`lengths` disagreement as *certainly wrong data, and visible only under
`positionMode: fixed`*.

### 10.6b The order it writes keys in

🔬 **The editor writes every object's keys in one fixed order per kind of
object**, and since [#716](https://github.com/firejune/rigc/issues/716) rigc
writes the same. Read off the twelve exports under `examples/`: for each kind,
every object's key sequence is a subsequence of one order, no two exports
contradict each other on any kind, and the table below is that order. It lives
in one place, [`src/keyorder.ts`](../src/keyorder.ts)'s `EDITOR_KEY_ORDER`, and
the compiler applies it once to the finished skeleton — `CUR83` holds this table
to that one, and `IG77` holds that one to the exports on every run with a
corpus.

| Kind | Keys, in the order the editor writes them |
| --- | --- |
| `top level` | `skeleton`, `bones`, `slots`, `constraints`, `skins`, `events`, `animations` |
| `header` | `hash`, `spine`, `x`, `y`, `width`, `height`, `images`, `audio` |
| `bone` | `name`, `parent`, `length`, `rotation`, `x`, `y`, `scaleX`, `scaleY`, `inherit`, `color`, `icon` |
| `slot` | `name`, `bone`, `color`, `attachment`, `blend` |
| `ik constraint` | `type`, `name`, `target`, `bones`, `mix`, `bendPositive` |
| `transform constraint` | `type`, `name`, `source`, `bones`, `rotation`, `x`, `y`, `properties`, `localSource`, `localTarget`, `mixRotate`, `mixX`, `mixY`, `mixScaleX`, `mixShearY` |
| `physics constraint` | `type`, `name`, `bone`, `x`, `y`, `rotate`, `damping` |
| `skin` | `name`, `attachments` |
| `region attachment` | `x`, `y`, `scaleX`, `scaleY`, `rotation`, `width`, `height` |
| `mesh attachment` | `type`, `uvs`, `triangles`, `vertices`, `hull`, `edges`, `width`, `height` |
| `boundingbox attachment` | `type`, `vertexCount`, `vertices` |
| `clipping attachment` | `type`, `end`, `vertexCount`, `vertices`, `color` |
| `animation` | `slots`, `bones`, `ik`, `transform`, `physics`, `attachments`, `drawOrder`, `events` |
| `bone rotate key` | `time`, `value`, `curve` |
| `bone translate key` | `time`, `x`, `y`, `curve` |
| `bone translatex key` | `time`, `value`, `curve` |
| `bone translatey key` | `time`, `value`, `curve` |
| `bone scale key` | `time`, `x`, `y`, `curve` |
| `bone shear key` | `time`, `x`, `y`, `curve` |
| `slot attachment key` | `time`, `name` |
| `slot rgba key` | `time`, `color`, `curve` |
| `ik key` | `time`, `mix`, `softness`, `bendPositive`, `curve` |
| `transform key` | `time`, `mixRotate`, `mixX`, `mixY`, `curve` |
| `physics damping key` | `time`, `value` |
| `physics inertia key` | `time`, `value` |
| `physics mass key` | `time`, `value` |
| `physics mix key` | `time`, `value`, `curve` |
| `physics wind key` | `time`, `value` |
| `attachment deform key` | `time`, `offset`, `vertices`, `curve` |
| `drawOrder key` | `time`, `offsets` |
| `drawOrder offset` | `slot`, `offset` |
| `event key` | `time`, `name` |

⚠️ **Three things about that table are rigc's rather than the editor's, and it
says which.**

- **A pair no export carries together has no measured order**, and the row
  places it the way rigc already emitted it — a transform constraint's
  `rotation` before `x`, an ik key's `time` before `mix`, a physics
  constraint's `x`/`y` before `rotate`. `src/keyorder.ts` lists every such pair.
  Such a pair did not move, and nothing here says the editor agrees.
- **A kind with no row keeps rigc's order whole**: a linked mesh, a path or
  point attachment, a sequence, the path and slider constraints, an event
  definition, and the keys of every timeline the twelve do not key with two
  fields (`scalex`, `rgb`, `alpha`, `rgba2`, `sequence`, the path and slider
  timelines, …). Unmeasured is not certified.
- **A key a row does not list stays where its constructor put it** — a bone's
  `shearX`, a region's `name` and `path`, a header's `fps`. The row's keys are
  permuted among the places they hold. Sending such a key to the end instead was
  rejected on a measured case: the corpus's physics `strength` keys are all at
  t=0, so the editor wrote them `value` alone, and that rule would have moved
  `time` — first in every other key kind the editor writes — behind `value`.

🔬 **Two positions and one fold are measured on a production set, not on
`examples/`** ([#791](https://github.com/firejune/rigc/issues/791)). The twelve
exports carry no mesh `path` or `color` and no slot name outside ASCII — `IG84`
and `IG85` count both on every run with a corpus — so the table cannot learn
either, and what rigc writes for them was read off 42 production exports
instead:

- **A mesh attachment writes `path` and `color` right after `type`, `path` before `color` — measured on a production set (#791), not on `examples/`.**
  18 meshes whose `path` differs from their name wrote it second, and 1 with a
  `color` wrote that second; no mesh carried both. The row does not list them,
  so the position is the constructor's — `meshTextureKeys` in
  [`src/compile.ts`](../src/compile.ts), which every mesh route spreads right
  after `type` (`S104`). A region's `path` and a linked mesh's keys stay where
  they were: neither was in the set, and an analogy is not a measurement.
- **A skin's slot keys are compared after `foldBeforeComparing`, which reads U+3000 as U+0020 and U+FF10–U+FF19 as U+0030–U+0039** —
  the ideographic space as a space, the full-width digits as `0`–`9`
  (`EDITOR_NAME_FOLD`). One map of 95 slot keys, 7 of them carrying those
  characters, came back in an order this reproduces 95 of 95 and neither a
  codepoint sort nor the comparator without the fold does (`S105`). It is **not**
  `normalize('NFKC')`, though NFKC folds both the same way: NFKC, a classifier
  that reads every Unicode digit as a digit and every space separator as a space,
  and a width fold alone all reproduce that map and disagree past it (on `ﬁ`,
  `²`, `٣`, `Ａ`, a no-break space), and what all three agree on is exactly
  these two classes. The comparator is R10's, so animation and skin names are
  compared after the fold too. A pair the fold does not close — a tab, a
  no-break space — still keeps the map in rigc's order, whole (`S106`).

🔸 **An object keyed by NAMES is not a field order**, and the table does not
touch one. A bone's or a slot's timelines, and a transform constraint's
`properties` and each `to` inside them, are read into the runtime's arrays in the
order they are keyed — for timelines, the order they are applied in — so their
order is more than a key's position, and rigc already emits the export's own on
all twelve. A skin's `attachments` slot keys are the one name-keyed map this
changed: sorted by the editor's comparator (§10.1). The per-slot maps inside are
the rig's own order.

⇒ **What this means for you: nothing to write.** No input format changed and no
key order is yours to state — a rig spec is read by name, and its field order
still means nothing. What changed is that a canonical-form comparison of an
export's rebuild against the export no longer finds an object whose keys sit
elsewhere (`IG76`). What it found next was the defaults the export leaves out
and rigc wrote, `"name": null`, and the three header keys (`IG78`) — and since
§10.6c it finds the header's `hash` and `spine` and nothing else (`IG83`).

### 10.6c The keys it leaves out

The editor writes a key only where its value is not the one the parser reads in its
absence, and since [#716](https://github.com/firejune/rigc/issues/716) rigc's emitter
does the same, in one pass over the finished skeleton (`withoutParserDefaults` in
`src/keyorder.ts`, run just before §10.6b's). A key is left out when its value is
**exactly** the one below — the float the file would hold, not a value near it — so a
rotation of `1e-45` is written and a rotation of `0` is not. The table is
`PARSER_DEFAULTS`, and every row is the linked `spine-core` parser's own fallback
(`getValue(map, key, default)` in `SkeletonJson.js`); the selftest loads an object of
each kind with the key at that value and without it, and requires the two to be the
same `SkeletonData` (`S103` on the in-tree builds, `IG82` on the corpus), and deletes
every key of every in-tree build in turn to find one the table is missing (`S101`):

| Kind | Left out when it is |
| --- | --- |
| `header` | `referenceScale` 100 |
| `bone` | `length` 0 · `rotation` 0 · `x` 0 · `y` 0 · `scaleX` 1 · `scaleY` 1 · `shearX` 0 · `shearY` 0 · `inherit` "normal" · `skin` false · `iconSize` 1 · `iconRotation` 0 |
| `slot` | `color` "ffffffff" · `attachment` null · `blend` "normal" · `visible` true |
| `ik constraint` | `skin` false · `mix` 1 · `softness` 0 · `bendPositive` true · `compress` false · `stretch` false |
| `transform constraint` | `skin` false · `localSource` false · `localTarget` false · `additive` false · `clamp` false · `rotation` 0 · `x` 0 · `y` 0 · `scaleX` 0 · `scaleY` 0 · `shearY` 0 · `mixRotate` 1 · `mixX` 1 · `mixScaleX` 1 · `mixShearY` 1 |
| `path constraint` | `skin` false · `positionMode` "percent" · `spacingMode` "length" · `rotateMode` "tangent" · `rotation` 0 · `position` 0 · `spacing` 0 · `mixRotate` 1 · `mixX` 1 · `mixY` `mixX`'s, only at 1 |
| `physics constraint` | `skin` false · `x` 0 · `y` 0 · `rotate` 0 · `scaleX` 0 · `shearX` 0 · `limit` 5000 · `fps` 60 · `inertia` 0.5 · `strength` 100 · `damping` 0.85 · `mass` 1 · `wind` 0 · `gravity` 0 · `mix` 1 · `inertiaGlobal` false · `strengthGlobal` false · `dampingGlobal` false · `massGlobal` false · `windGlobal` false · `gravityGlobal` false · `mixGlobal` false |
| `slider constraint` | `skin` false · `additive` false · `loop` false · `mix` 1 · `from` 0 · `to` 0 · `scale` 1 · `max` 0 · `local` false |
| `region attachment` | `x` 0 · `y` 0 · `scaleX` 1 · `scaleY` 1 · `rotation` 0 · `color` "ffffffff" |
| `mesh attachment` | `color` "ffffffff" · `hull` 0 · `width` 0 · `height` 0 |
| `path attachment` | `closed` false · `constantSpeed` true |
| `clipping attachment` | `convex` false · `inverse` false |
| `sequence` | `start` 1 · `setup` 0 |
| `event` | `int` 0 · `float` 0 · `string` "" · `audio` null |
| `bone rotate key` | `time` 0 · `value` 0 |
| `bone translate key` | `time` 0 · `x` 0 · `y` 0 |
| `bone translatex key` | `time` 0 · `value` 0 |
| `bone translatey key` | `time` 0 · `value` 0 |
| `bone scale key` | `time` 0 · `x` 1 · `y` 1 |
| `bone scalex key` | `time` 0 · `value` 1 |
| `bone scaley key` | `time` 0 · `value` 1 |
| `bone shear key` | `time` 0 · `x` 0 · `y` 0 |
| `slot attachment key` | `time` 0 · `name` null |
| `slot rgba key` | `time` 0 |
| `ik key` | `time` 0 · `mix` 1 · `softness` 0 · `bendPositive` true · `compress` false · `stretch` false |
| `transform key` | `time` 0 · `mixRotate` 1 · `mixX` 1 · `mixY` `mixX`'s, only at 1 · `mixScaleX` 1 · `mixScaleY` 1 · `mixShearY` 1 |
| `path position key` | `time` 0 · `value` 0 |
| `physics damping key` | `time` 0 · `value` 0 |
| `physics inertia key` | `time` 0 · `value` 0 |
| `physics mass key` | `time` 0 · `value` 0 |
| `physics strength key` | `time` 0 · `value` 0 |
| `physics wind key` | `time` 0 · `value` 0 |
| `physics mix key` | `time` 0 · `value` 1 |
| `attachment deform key` | `time` 0 · `offset` 0 |
| `attachment sequence key` | `time` 0 · `index` 0 · `mode` "hold" · `delay` the key before's, 0 on key 0 |
| `drawOrder key` | `time` 0 |
| `event key` | `time` 0 |

Read a row as *"left out when it is"*: `x` 0 is a key left out at `0`; `mixY` `mixX`'s
is a key left out where it equals the same object's `mixX` as the parser reads it,
and *only at 1* narrows that to the one value the editor leaves it out at — measured:
`sack-pro` writes `"mixX": 0, "mixY": 0` on six transform keys, where the parser would
read an absent `mixY` as that same `0`. *The key before's* is a sequence key's
`delay`, which the parser carries from the previous key (`lastDelay`).

⚠️ **What is not a row, and why.**

- **The header's `x`, `y` and `fps`.** The 4.3 JSON reader assigns them raw
  (`skeletonData.x = skeletonMap.x`, `SkeletonJson.js:70`), so an absent origin loads
  as `undefined` and a written `0` as `0`: there is no fallback for them to equal, and
  rigc keeps writing the origin of a declared stage. The editor leaves it out
  (§10.6's round trip 6), so a rebuild of an export whose stage sits at `0,0` spells
  two fields the export does not — `LOSS HEADER_ORIGIN` says so on `ingest`.
- **A transform constraint's `mixY` and `mixScaleY`.** Their fallback is the
  constraint's `mixX` / `mixScaleX` — but the parser reads those only for a property
  the constraint drives, so on one that drives `y` alone the fallback is the pose's
  initial `0`, not `1`. A row there was tried and measured wrong: it left out
  `8-follow-through-pro-ball`'s `"mixY": 1` on two such constraints, they loaded at
  `0`, and `A48_TRANSFORM_CONSTRAINT_NOT_MUTED_THROUGHOUT` refused the rebuild.
- **A region's `path`, an attachment's `name`, an event key's payload.** Their
  fallbacks are another value — the attachment's own name, its placeholder, the event
  definition's — which rigc writes only where it differs.
- **A slider's `time` and a sequence's `digits`.** The parser has a fallback for
  both, and nothing here can load it: `time` is read only on a slider with no `bone`,
  which no build or export carries, and `digits` renames every frame of the series,
  so no atlas a build resolves against loads it either way. Both are written as
  stated.
- **Every kind with no row** — the keys of a `shearx`, `sheary`, `inherit`, `alpha`,
  `rgb`, `rgb2`, `rgba2`, path `spacing`/`mix`, physics `gravity`/`reset` or slider
  timeline, a linked mesh, a point attachment. No build the selftest loads and no
  export carries an object of those kinds, and a row nothing loads is a claim about
  the parser nobody has checked — where a missing row only costs a key the parser
  reads the same either way. `S101` names such a key the day a build emits one.

⚠️ **Why 4.3's defaults, when #706 row 4 says they are not every generation's.**
An omitted physics `inertia` is 0.5 to the 4.3 parser and 1 to the 4.2 one, and that
is exactly why a key is left out only against the parser rigc links: the file states
`"spine": "4.3.13"`, and the parser it is gated against is that one. Writing the
default out would not make the file safe for a 4.2 reader: that reader applies its
own defaults to every *other* key the file leaves out as well — every one the editor's
own 4.3 export leaves out, too — and #706 rows 1, 2 and 6 measure what reading one
generation's data on another generation's runtime does, none of it repaired by one
key written out. That misread is refused where it can be seen, on the reading side
(`GENERATION_UNSUPPORTED` in `ingest`), rather than written for on the emitting one.

⇒ **What this means for you: nothing to write, and nothing to stop writing.** A
default you state stays in your spec and leaves the file; `explain` prints a bone
key's channels as the parser reads them, so a key that left the file still shows its
value there.

### 10.7 What this section does not claim

Conventions that are visible in reference exports but that **no public Spine page
states** are deliberately absent. A guide that asserted them would be handing you an
answer read off the exports:

- any figure for keys per second, or for how key density scales with frame rate;
- which curve type any particular example project or studio actually shipped;
- whether a **corpus** export — one somebody else made, out of the editor's own
  dialog — was made with Nonessential data checked. ⚠️ §10.5 now answers this for
  the **CLI's** `-e json`, where it is measured; that measurement says nothing
  about an export you were handed, and the two must not be read as one;
- how many bones, slots or timelines a rig of a given size ought to have;
- whether a shipped rig prefers automatic Bezier handles or hand-placed ones.

If one of those turns out to matter, it belongs in the run's `log.md` as something
the frames had to teach you — not here.

---

## 11. Reading a pose you were given — `rigc pose`

```bash
bun cli.ts pose --images path/to/parts --frame path/to/poseA.png [--out pose.json]
```

Every other command in this guide takes something you wrote and tells you about
it. This one runs the other way: it takes a **picture the user already has** and
reports, for each loose part PNG, where that part sits in it — `x`, `y`,
`rotationDeg`, `scale` — plus a residual saying how well the placed part explains
the frame's pixels underneath it.

Reach for it when a request arrives as *"make it go from this picture to this
one"*. Read both frames, write the two key poses into the rig and the motion from
the numbers it gives you, and spend your loops on the part no instrument can
measure: the movement between them.

📘 **The recipe that consumes this report is [MOTION.md](MOTION.md)** — how these
placements become a rig and a motion, what goes between two key poses when nothing
was given for the in-betweens, and how to spread candidates so a `vote` ballot
informs.

📏 **Instrument re-baseline, 2026-09-03 — [#306](https://github.com/firejune/rigc/issues/306),
and it applies to §12 as well.** The objective behind every `residual` in both
commands now interpolates the frame in **premultiplied** space: a tap that
straddles a silhouette weights each texel's colour by how much material is there,
so a part is no longer charged for disagreeing with the ground it is drawn
against. Nothing about the fields, the coordinate contract or the refusals
changed, and no threshold moved — `--max-residual`, `--min-visible` and
`--anchor-residual` are the numbers they were. ⚠️ **What did move is the residuals
themselves**, downward and by small amounts, most on the parts whose edges are in
the frame. ⇒ A residual measured before that date and one measured after are not
the same measurement; re-read a frame rather than comparing across it. The worked
figures live in [MOTION.md](MOTION.md) §6 and
[BENCHMARK.md](https://github.com/firejune/rigc/blob/main/docs/BENCHMARK.md) —
repository material, not shipped in the package — each with its own re-baseline
note.

### 11.1 It measures an input, so nothing here is a score

🚨 **No number in this report has a pass bar, and none of them is a grade.** The
distinction is not modesty, it decides how to read the output. `check` and `bench`
compare a build against a reference, so their numbers mean *how close*. A pose
frame is not a reference — it is a **given condition**, and once the spec states
those coordinates there is nothing left to be close to. The residual exists so you
know **how far to trust each placement** and **where two answers are equally
good**.

That is why the command's output is shaped as help rather than as a verdict:

- a placement that matches nowhere is **refused by name** and its best guess is
  still printed, because a refusal tells you not to trust a number rather than
  hiding it;
- two near-equal optima are reported as **both**, flagged `ambiguous`, never
  silently resolved;
- a part whose rotation genuinely does not matter is reported as having a **free
  degree of freedom**, not as a failure.

### 11.2 The coordinate contract

Placements are in the **frame's own pixels: y down, origin top-left** — the same
convention a cut manifest uses, and the `space` field of every report repeats it.

- `x`, `y` — where the part image's own centre, `(width / 2, height / 2)`, lands.
- `rotationDeg` — **screen** degrees, positive turning **clockwise** on screen.
- `scale` — uniform, as **frame pixels per part pixel**.

Reconstruct a part pixel `p` as `centre + scale · R(rotationDeg) · (p − (width/2,
height/2))`. To get to Spine's y-up, counter-clockwise world, use the two
conversions that already exist and open-code neither:
`screenToSpineDegrees(rotationDeg)` and `cropToSpineY(y, frameHeight)`
([`src/transform.ts`](../src/transform.ts)).

### 11.3 The fields, and what each one is for

Per part:

| Field | Meaning |
| --- | --- |
| `part`, `path`, `width`, `height` | the PNG, by the name every message uses |
| `placement` | the best placement found — `null` **only** for `empty-part` and `larger-than-canvas`, where nothing was searched |
| `walls` | the walls of the search window `placement` stands **on**, whatever the verdict: `[]` when it settled inside, otherwise one `{ axis, edge, window }` per axis — `axis` is `scale` or `rotation`, `edge` is `floor` or `ceiling`, `window` is the flag's own `min,max`. A value on a wall is where the search was held, not where it came to rest — see §11.4 |
| `alternates` | other optima worth reporting, best first. Non-empty means the answer was not unique |
| `ambiguous` | at least one alternate is inside the ambiguity margin. **Choose with something this instrument cannot see** — anatomy, the other frame, or `rigc vote` |
| `rotationFree` | the part is self-similar under rotation, so `rotationDeg` is a placeholder and the value is yours |
| `rotationSelfSimilarity` | the number `rotationFree` is a threshold on. A part just over the line is worth a look |
| `refusal` | `{ reason, detail }` or `null`. Reasons: `no-match`, `larger-than-canvas`, `empty-part`. A `no-match` whose best placement stopped **on a wall of the search window** names the wall in its detail — see §11.4 |
| `coarse` | the grid this part was actually searched on. A handful of cells means the part is small relative to the frame and the first pass had little to go on |
| `notes` | the same facts in prose, in the order they were found |

Per placement:

| Field | Meaning |
| --- | --- |
| `residual` | alpha-weighted mean absolute colour error over the part's own footprint, `0..1`. **Lower is better explained** — that is all it means |
| `unexplained` | the share of the part's material that disagrees with the frame at this placement. **Read this next to the residual** — see §11.4 |
| `offCanvas` | the share of the part's material that falls outside the frame at this placement |
| `footprint` | frame pixels of material the placement accounts for; the tie-break between two equal residuals |
| `bbox` | the axis-aligned box the placed part occupies, in frame pixels |

The report also carries `frame.background` (how the picture's empty space was
identified — a flat colour, transparency, or `unknown`), `search` (every window
and threshold that was applied), and `caveats`.

🔒 **`search` states what ran, not what was asked for.** `search.rotation` carries
`degrees`, the ladder the coarse pass actually walked, and its `stepDeg` is read
off that ladder rather than off the constant the ladder was capped at. The coarse
step `15°` is a **ceiling** on the step, not the step: a narrower window is
divided into whole steps no coarser than it, so
`--rotation -5,5` prints `rotation -5°–5° in 2 step(s) of 10°` and walks those two
angles and no others. Nothing reported leaves the window either — the refinement
and the quarter-turn probes are held inside it, and a window spanning a full turn
holds nothing because it already contains every angle.

### 11.4 What it cannot see — read this before using the numbers

- ⚠️ **Residuals degrade under occlusion, and there is no depth solver here.** A
  part drawn *behind* another has the occluder's pixels where its own should be, so
  its residual rises **at the correct placement**. `unexplained` separates the two
  readings: a middling residual with a high `unexplained` usually means *right
  place, seen through something else*, not *wrong place*. The only robustness in
  the objective is that it is measured on the part's **own alpha footprint** — a
  part is never charged for pixels of the picture it does not claim. Weigh
  accordingly; do not treat either number as a verdict.
- ⚠️ **A search window that does not contain the truth does not reliably refuse.**
  A part shrunk inside the region it came from still explains those pixels, so the
  answer is the best placement available *inside* `--scale` / `--rotation` and its
  residual can look reasonable. This is why the window is a reported field: if the
  numbers surprise you, check `search` before you trust them.
- 🔒 **A refusal that stopped on a wall of the window says which wall.** When a
  `no-match`'s best placement sits on the floor or the ceiling of `--scale`, or on
  an edge of a `--rotation` window narrower than a full turn, the detail names it:
  `best placement at scale 0.500, the floor of --scale 0.5,2 — the truth may lie below the window`.
  That is the case where the window is the first thing to move rather than the
  frame or the threshold — eleven parts of one frame came back refused at
  `scale=0.500` against art rendered at `0.311` per part pixel, and the message
  said only that the residual was above `--max-residual`. The sentence — with its
  *"may lie below"* — is printed on a refusal only.
- 🔒 **An accepted placement that stopped on a wall says which wall too**, beside
  the value it holds on the console line and in `walls`:
  `PLACE  head.png     x=   45.5  y=   37.5  rot=    0.0°  scale=2.000 (the ceiling of --scale 0.5,2)  residual=0.0394  unexplained= 10%`
  is a part drawn at twice the scale of a frame rendered at 1.15 px/unit, whose
  truth is **2.30** — outside the window — and whose residual at the ceiling still
  cleared `--max-residual`. *On* a wall is not *near* one: the refinement is clamped
  to the window, so a value the window held **is** the bound, while a correct
  placement a window brackets closely settles strictly inside it and carries no
  mark. A window with no interior (`min === max`) marks nothing — being at its only
  value says nothing about the answer. ⚠️ The mark names the wall and not the side
  the truth is on: over the rendered example corpus, a floor held both truths below
  the window and parts shrunk into their own region whose truth was inside it. An
  empty `walls` is not evidence either way — a window that excludes the truth can
  still settle inside on another optimum, which is the caveat two bullets up.
- ⚠️ **A frame whose border has no dominant colour reports `background.unknown`.**
  Every pixel then counts as material, the silhouette signal is gone, and the
  residual is colour agreement alone. The report says so rather than being quietly
  weaker.
- **An `ambiguous` part is genuinely ambiguous.** Two identical limbs, a part that
  fits its own silhouette at more than one angle, and a shape whose interior is one
  flat colour all look like this. The instrument has run out; that is what
  `rigc vote` is for.
- **One frame per call.** Several key poses are several calls, and correlating A
  with B — which placement of a repeated part belongs to which limb, across two
  frames — is the authoring job, not this tool's.

## 12. Reading the half of that picture `pose` refuses — `rigc chainfit`

```bash
bun cli.ts chainfit --candidate path/to/spine --images path/to/parts \
                    --frame path/to/poseA.png [--anchor poseA.json] [--out chainfit.json]
```

§11 ends on a limitation it is honest about and cannot fix: *"a part drawn behind
another has the occluder's pixels where its own should be, so its residual rises
**at the correct placement**"*. On a ball that costs nothing. On a figure it costs
half the figure — the far arm behind the torso, both thighs behind the torso and
each other, the feet, the fists, whatever the hands hold.

This is the same question with **one more input: your candidate rig**. That input
is what makes the difference measurable rather than a caveat, and it buys exactly
two things.

- **Draw order**, so occlusion can be taken out of the arithmetic instead of
  apologised for. The parts drawn after a part are what covers it, and the pixels
  they cover are **excluded** from that part's objective rather than charged to it.
  Every residual here is over the part's **visible** pixels, and every one comes
  with the `visibleShare` it was computed on. ⚠️ **`visibleShare` is a per-frame
  diagnostic and not a summary statistic** — it is measured through the fitted
  placements, so a median or a mean of it is not comparable across fits. §12.3 says
  what that costs and [the 2026-09-03 study](https://github.com/firejune/rigc/blob/main/bench/studies/2026-09-03-visibleshare/README.md)
  measures it — repository material, not shipped in the package.
- **Hierarchy and attachment geometry**, so the search collapses. A child bone
  whose parent is already placed does not have four degrees of freedom: the rig
  fixes its pivot, so what is left is **one hinge** about that pivot — plus a
  stretch, and only where your own timelines say the rig leaves scale free. One
  degree of freedom is also what removes the ambiguity §11 has to report: two
  identical limbs stop being two equal answers once each of them hangs off a
  different placed shoulder.

### 12.1 Which one to reach for

| The question | The command |
| --- | --- |
| *"Where does each of these loose PNGs sit in this picture?"* — you have parts and a picture and nothing else | **`pose`** (§11) |
| *"Where does this rig's own `rear-upper-arm` sit in this picture?"* — you already have a compiled candidate | **`chainfit`** |
| A part that is big, distinctive and **unoccluded** | either; they agree, and `pose` needs no rig |
| A part another part is drawn over | **`chainfit`** — this is the whole reason it exists |
| A part that appears **twice** (two arms, two shins) | **`chainfit`**, if the two hang off different bones. `pose` is right to call it ambiguous and cannot do better |
| You have **no rig yet** | **`pose`**. There is nothing to chain from, and inventing one would be a rig you then have to un-invent |
| Your rig's joint offsets are **guesses** | **`pose` first.** Every hinge here turns about a pivot your rig declares; a wrong joint moves every answer below it. `pivotDisagreementPx` is what says so |

The normal order is **`pose` → author → `chainfit`**: read what you can with no
rig, write a first rig from it, then read the rest of the frame through that rig.
And `chainfit` runs `pose` for you unless you hand it one — see `--anchor`.

### 12.2 The anchor, and why the walk only goes outward

A chain needs a trunk. `chainfit` takes its anchors from a **`rigc pose` report
for the same frame** — `--anchor poseA.json` — and without one it runs that pass
internally, over exactly the parts your candidate draws. A part becomes an anchor
when `pose` came back **unambiguous** with `residual ≤ 0.16` and
`unexplained ≤ 0.45`; those two numbers are `--anchor-residual` and a reported
field, and they are the 2026-09-03 measurement run's own *clean frame* criterion
rather than a line invented here.

An anchored part fixes its **whole bone** — four numbers read off the picture for
the four a similarity has — and every descendant then follows from the rig. A bone
**above** an anchor does not: recovering it would need to know what the link
between them did, and that is precisely the unknown the anchor does not carry.

⚠️ **So a limb with no trusted part on it or above it is refused**, not guessed at
from a cousin. If a whole side of your figure comes back that way, the repair is
upstream: give `pose` a better frame, pin its `--scale`, or loosen
`--anchor-residual` deliberately and read the consequences.

### 12.2b The inward step — two anchors bracket the bone between them

⬆️ There is **one exception** to the paragraph above, and it is one shape.

One anchored descendant says nothing about the link above it — that is the
sentence you just read, and it is still true. **Two** of them say something else
entirely. A bone's world placement is four numbers, and a descendant's **pivot**
depends on that bone and on your rig's own offsets and **not** on the
descendant's own hinge. So each anchored descendant contributes two equations,
two of them make four, and four equations fix four numbers. That is the whole
geometry; there is no search and no window.

Such a bone comes back with **`role: "inward"`** and a `bone.inward` block, and
the outward walk then **resumes from it** — so a subtree that was refused a moment
ago is fitted normally, one hinge per link, with `bone.anchoredToRole` on every
one of those placements reading `"inward"` to say what it rests on.

⚠️ **Which means the inward step reaches exactly the bones that BRANCH.** A bone
whose children form a single sub-chain can never be determined, however good the
anchor below it is: two equations, four unknowns. That is `no-bracket`, and it is
a fact about your rig's topology rather than about the frame. On the 2026-09-03
spineboy candidate `torso` is the only bone in the whole rig that branches — and
it is the bone that recorded 30 `no-anchor` frames, which is why this exists.

| Field on `bone.inward` | Meaning |
| --- | --- |
| `form` | `descendants` — the only form there is. Named so a future one is readable beside it |
| `determinants[]` | the anchored bones the four numbers were read from: each one's `bone`, the `part` its anchor came from, its `leverPx` from the determined bone, its `offsetPx`, and the art-less bones `carried` through to reach it |
| `redundancy` | equations beyond the four a similarity needs, `2 × determinants − 4`. **Read `disagreementPx` next to this and never without it** |
| `leverPx` | the widest frame-pixel span between two determinant pivots — what the rotation was read *across*. A short lever turns a half-pixel anchor error into several degrees |
| `minLeverPx` | the floor that span had to clear (`--inward-lever`, default `8`) |
| `disagreementPx` | the worst `offsetPx`: **the over-determination residual**, in frame pixels. `null` at `redundancy 0` |
| `rejected[]` | anchored descendants that could **not** be used, each with the reason — named rather than silently dropped |

🚨 **At `redundancy 0`, `disagreementPx` is `null` rather than `0`, and the
difference is the whole point.** Two determinants supply exactly four numbers, so
the solve fits its own two points exactly *whether or not your rig is right*. A
zero there would be a measurement of nothing. One more anchored descendant on a
third sub-chain is what makes a determination checkable at all — and that is the
same philosophy as `pivotDisagreementPx`: the residual is not an error bar, it is
your rig's joint offsets and the frame disagreeing by that much.

🚨 **And `disagreementPx` says the determination disagrees with itself. It does
NOT say which determinant is wrong.** The solve is least squares, so a
displacement on one anchor spreads across every determinant near it. Measured on
the chain-fit fixture, a deliberate 4 px error on one child came back as **1.95 px
on a different child** and 1.74 px on the one that was moved, because those two
sit 5 bone units apart while the third is 24 away — nothing in the arithmetic can
tell a tight pair apart. Read the per-determinant `offsetPx` list as a *pattern*,
and attribute with a second frame or with `pivotDisagreementPx` on the anchors
themselves.

**What the step cannot see, stated as refusals it makes by name.**

- **`no-bracket`, one determinant.** Four numbers need four equations. The detail
  names the one it found.
- **`no-bracket`, an unusable path.** A bone strictly between the two carries art
  (its hinge is a searched unknown), or your rig leaves its **scale** free (the
  *distance* across it is unknown), or its geometry is not a similarity at all.
  Each is named with the bone. ⚠️ `--stretch` frees every bone's scale, so it can
  turn a working bracket into a refused one — that is the flag telling the truth
  about what it made unknown.
- **`no-bracket`, below the lever floor.** Two coincident pivots fix no direction.
  Nothing is printed here, unlike `occluded`: a rotation with no baseline is not a
  worse placement, it is not a placement.
- **`no-anchor` still means what it meant** — nothing trusted on this limb, above
  it *or below it*. The split matters because the repair does: `no-bracket` wants
  one more anchor on a different sub-chain, `no-anchor` wants a better anchor pass.
- **Determinants are ANCHORED bones and nothing else** (`inward.criterion.determinantsMustBeAnchored`).
  A bone the outward walk placed is sitting at whatever hinge your setup declares
  until it is fitted, and reading that as evidence would compound a guess into a
  placement.
- **An anchored bone is never determined inward**, and a fitted hinge is never
  replaced by a geometric one. The step only reaches bones the outward walk left
  unplaced.

🚫 **An `inward` placement is not a measurement of the bone it places.** Its
evidence lives on the anchors below it. The bone's own `residual` and
`visibleShare` say how much of the answer *the frame can independently confirm* —
and **the visibility floor still refuses it** when the answer is one nothing in
the picture can check. That is deliberate, and it is the second time this call has
been made in `chainfit`: exempting a placement nothing searched was tried for
anchors and reverted, because it prints a part nobody can see as READ. The floor
is about what the picture can confirm, not about how the number was arrived at.

### 12.3 What the report adds to a `pose` report

The coordinate contract is **identical** to §11.2 — frame pixels, y down, origin
top-left, `(x, y)` where the part image's own centre lands, `rotationDeg` in screen
degrees — so the two reports are readable side by side. On top of that, per
placement:

| Field | Meaning |
| --- | --- |
| `residual` | the same objective as §11, over the part's **visible** pixels only: covered pixels are dropped from both sums rather than charged. **Not the same number as `pose`'s on an occluded part**, and never to be read without the next field |
| `visibleShare` | the share of the part's own alpha weight the residual was computed on. A low residual on a `0.08` share is a confident statement about a sliver. ⚠️ **Per frame, not per corpus** — see the caution below the table |
| `scoredPixels` | how many part pixels that share actually is |
| `visibleShareAtFit` | the share recomputed **where the answer landed**, rather than where the visible set was frozen. Far from `visibleShare` means the fit moved out of its own measurement; `--passes` is the repair. ⚠️ Not the steadier of the two — measured, below |
| `hingeDeg` | ⭐ the searched degree of freedom, in **Spine** degrees relative to the bone's setup rotation — **the value a `rotate` key would carry**. `null` on an anchor whose own parent is unplaced, where the quantity does not exist |
| `localRotationDeg` | the bone's local rotation this implies, Spine degrees. The other half of the same answer |
| `stretch` | the uniform scale on the bone; `1` where that DOF was not free |
| `unexplained`, `offCanvas`, `footprint`, `bbox` | as §11.3, with `residual` and `unexplained` over the visible set and `offCanvas` over the whole part |

🚨 **`visibleShare` is a per-frame diagnostic. Do not take a median or a mean of it
across frames without naming the fit.** Both halves of the fraction are downstream
of the fit — the numerator because the occluders are stamped from wherever the
later-drawn parts *currently sit* — so the quantity is fit-relative by
construction, and measurably so. Measured over all 147 committed `ess` frames of
`bench/reference/spineboy`, perturbing the anchor placements **inside `pose`'s own
convergence band** (`src/pose.ts`'s level-0 polish `floor`: 0.05 px, 0.1°, 0.1 %
scale — below which the fitter stops looking, so it cannot tell the two fits apart):

| | |
| --- | ---: |
| median \|Δ`visibleShare`\| | 0.0005 |
| **p99** | **0.5592** |
| max | 0.9401 |
| readings that move by more than 0.10 | **5.71 %** |
| the **corpus median** of one part's share, worst case | **0.3055 ↔ 0.5228** (`rear-foot`) |

⚠️ **The distribution is bimodal, so the median of the swing is not a summary of
it.** A reading is either exact to four decimals or somewhere else entirely, and
which of the two a part is in **cannot be told by looking at the row**:
`front-bracer` sits at a comfortable 0.73 and its corpus median moves 17 points,
while `rear-bracer` sits at a 0.015 sliver and moves 0.0005.

📌 **It is not a definitional edge, and `visibleShareAtFit` is not a way out.** Of the
cells that swing by more than 0.10, **63 %** are the part's own placement having
travelled more than a pixel or turned more than `AMBIGUITY_HINGE_DEG`, **32 %** are
an occluder having relocated (median 42.6 px), and **0.5 %** are the mask changing
while everything on the frame stood still. `visibleShareAtFit` is measured where
the answer landed and is *less* steady, not more (p99 0.6588 against 0.5592). ⇒
**The field is reporting a bistable fit faithfully.** What is safe: reading it beside
its own residual, on its own frame — which is what it exists for. What is safe as a
corpus statistic: a **maximum**, which saturates. Full method and evidence:
[`bench/studies/2026-09-03-visibleshare`](https://github.com/firejune/rigc/blob/main/bench/studies/2026-09-03-visibleshare/README.md)
([#323](https://github.com/firejune/rigc/issues/323)).

And per part:

| Field | Meaning |
| --- | --- |
| `role` | `anchor` (taken from the anchor pass, not re-fitted), `chain` (fitted through the rig), `inward` (**determined** from two or more anchored descendants, with nothing searched — §12.2b), `unplaced` |
| — | ⭐ **A refused ANCHOR is not a contradiction, and it is the most useful row in the table.** The anchor pass judged that placement over the part's *whole* footprint — all `pose` can see, and blind to what covers it — while this instrument has just measured how much of the part is visible at all. Both readings are true. A refused anchor means *the placement may well be right and the confirmation is missing*, and every part whose `anchoredTo` names that bone rests on it. Measured on the 2026-09-03 corpus, `rear-bracer` clears `pose`'s criterion on 81 of 147 frames at a median visible share of **0.1%** — suppressing the refusal there was tried and prints that as READ. ⚠️ **That pair of numbers is on the pre-[#306](https://github.com/firejune/rigc/issues/306) objective** and has not been re-derived: the study is the 2026-09-03 run's own, over its own candidate, and re-running it is a run-scale job rather than a docs edit. A four-frame spot check under #306 (`--min-visible 0`, committed `ess` frames `idle/f0000`, `run/f0002`, `walk/f0004`, `aim/f0000`) moved `rear-bracer`'s anchor residual *down* on all four — 0.1564→0.1555, 0.1519→0.1513, 0.1493→0.1488, 0.1537→0.1534 — and flipped its eligibility on none, while `visibleShare` moved materially on one of the four (0.36→0.89). ⇒ Read the **shape** of the row, not those two digits. 🚨 **And that median in particular is one of the ones the 2026-09-03 study found unsafe**: `rear-bracer`'s share swings by **0.87** on `idle/f0001` inside `pose`'s own convergence band when the chain anchors on `pose`'s criterion — the basis this figure was taken on. The count and the shape are the reading; the 0.1 % is not a number |
| — | The **other** parts on an anchored bone are refused on their own numbers too, and there they mean something different again: their placement is the **rig's** prediction from that anchor, so their residual is a measurement of the rig (a goggle plate that will not sit on the head it is parented to shows up exactly here) |
| `bone` | the bone this hangs off: its `parent`, its `setupRotationDeg`, its `depth` in links from the anchor, `anchoredTo`, the `dof` searched, the `window` taken, the other parts `sharedWith` it on that bone, and `carriedBones` |
| `bone.dof.pivotFree` | your candidate keys a `translate` timeline on this bone, so the arc this answer sits on has a centre the rig itself moves. The placement is still read off pixels; `localRotationDeg` alone will not reproduce it |
| `bone.carriedBones` | bones between the anchor and here that carry nothing scoreable. Their hinge could not be fitted, their setup rotation was carried through, and every number below them inherits that |
| `bone.pivotDisagreementPx` | anchored bones only: how far the chain's own prediction of this bone's pivot is from where the anchor put it. **This is the one direct measurement of your rig against the picture** — a large value says the joint offset you declared is not the joint the frame shows |
| `anchorVerdict` | what the anchor pass made of this same part: `residual`, `unexplained`, `ambiguous`, `eligible`. ⭐ `eligible: false` beside a `chain` placement is **a part the chain bought** |
| `bone.anchoredToRole` | whether the trunk this hangs off was `anchor` (read off the picture) or `inward` (determined from two anchors below it). ⭐ **The field to check before quoting anything hung off an inward trunk** — that subtree inherits the determination's own uncertainty, and `bone.inward.disagreementPx` on the trunk bone is where it is priced |
| `bone.inward` | non-`null` only on a bone determined inward, and then it is the whole account of that determination — see §12.2b |
| `refusal` | `{ reason, detail }` or `null`. Reasons: `occluded`, `no-match`, `no-anchor`, `no-bracket` (§12.2b), `empty-part`, `no-part-image`, `unsupported-geometry` |

`⚠️ --images is not a part list here.` For `pose` every `.png` in the directory is
a part; for `chainfit` **the candidate decides what the parts are** and the
directory is only where each attachment's image name resolves. Extra PNGs in it are
simply unused; a name the directory lacks is refused `no-part-image` by name.

### 12.4 The flags that steer it

| Flag | What it does |
| --- | --- |
| `--anchor <pose.json>` | use this `rigc pose` report instead of running one. Refused together with `--scale` / `--rotation`, which size the internal pass that then does not happen |
| `--atlas` | **refused by name.** Every other `--candidate` command takes it, so trying it here is reasonable — but the part art comes from `--images` and the skeleton is all this needs of the candidate, so a flag that silently did nothing would be worse than one that says why |
| `--hinge <min,max>` | the window each child's local rotation is searched over, in Spine degrees about its setup value. Default `-180,180` — **a full turn, on purpose**: one degree of freedom is cheap enough to sweep exhaustively, and §11.4's warning about a window that does not contain the truth applies here too. The hinge step `3°` is a **ceiling** on the step, not the step: a window it does not divide is divided into whole steps no coarser than it, and `search` states the step that division produced, so `--hinge -20,20` prints `hinge -20°–20° step 2.857° (15 rungs)` and each chain part's note says it was searched `in 2.857° steps`. The full turn divides it exactly, so the default walks the same rungs it always did |
| `--stretch <ratio>` | also search a uniform bone scale, this ratio either way. Without it, stretch is searched **only where your own animations key a `scale` timeline on that bone** — a rig that never scales a bone is a rig saying that bone does not stretch |
| `--min-visible <0..1>` | below this visible share a placement is refused `occluded` instead of reported flat (default `0.25`). A reporting threshold, not a pass bar; the placement is still in the JSON. ⚠️ **It is not inert, though**: a bone whose frozen share is under this floor gets one *unmasked* look before its visible set is fixed, so the flag also changes **where parts land** and not only which rows are refused. Two runs at different `--min-visible` are two fits, and their shares are not one column |
| `--max-residual <0..1>` | as §11, over the visible pixels (default `0.25`) |
| `--passes <n>` | how many times the masks are rebuilt from the answers and the fit rerun (default `2`). ⚠️ **It buys convergence of the mask onto the answer, and it costs determinacy.** Each pass re-seeds the hinge search on the previous pass's answer, so two nearby inputs that fell into different basins on pass 1 are *further* apart after pass 2. Measured over the 147 committed `ess` frames, the share of readings whose `visibleShare` moves by more than 0.10 under a perturbation inside `pose`'s convergence band runs **0.78 % → 5.45 % → 15.17 %** at `--passes` 1 → 2 → 4. Raise it to settle a `visibleShareAtFit` drift on one frame; do not raise it expecting steadier numbers across runs |
| `--anchor-residual <0..1>` | the residual a `pose` placement must be within to anchor (default `0.16`) |
| `--inward-lever <px>` | how far apart two anchored descendants must sit before the rotation they determine is printed (default `8`). Derived, not picked: a pivot error of ε px across a lever of L px is an angle error of about ε/L radians, so half a pixel inside 3° needs 9.5 px. Below it, `no-bracket` names the measured lever |
| `--scale`, `--rotation` | passed to the **internal anchor pass**, meaning exactly what they mean to `pose` |

### 12.5 What it cannot see — read this before using the numbers

- 🚨 **The occlusion is your candidate's, and so is the geometry.** A wrong draw
  order masks the wrong pixels. A joint offset the rig gets wrong moves the pivot
  every hinge below it turns about. An answer here is only as good as the structure
  it was read through, and that is a different failure mode from anything in §11 —
  `pose` can be wrong about a part, `chainfit` can be wrong about a *limb*, in a
  way that looks internally consistent. `pivotDisagreementPx` and
  `bone.carriedBones` are the two fields that expose it.
- ⚠️ **`residual` here and `residual` in a `pose` report are not the same
  measurement on an occluded part**, by construction: one drops the covered pixels
  and the other charges them. Do not put them in one column. What *is* comparable
  is each against its own `visibleShare` / `unexplained`.
- 🚨 **`visibleShare` cannot be averaged across frames or across fits.** It is
  measured through the fitted placements of the parts drawn over this one, so two
  fits `pose` itself cannot tell apart give it different values — measured: p99
  0.56 and a worst corpus-median move of 22 points inside `pose`'s own polish
  floor. Read it per frame beside its own residual. If a corpus statistic is
  needed, a **maximum** is the one that survives (it saturates), and it should be
  quoted with its spread. §12.3 carries the figures;
  [`bench/studies/2026-09-03-visibleshare`](https://github.com/firejune/rigc/blob/main/bench/studies/2026-09-03-visibleshare/README.md)
  carries the method.
- ⚠️ **Setup draw order, on one frame.** A `drawOrder` timeline reorders your slots
  at runtime and this cannot know the time, so a candidate that has one is masked in
  the order its setup pose declares. The report says so in `caveats` when it finds
  one.
- ⚠️ **The hinge is searched; the pivot is not.** Nothing here searches a bone's
  translation, so a bone you key `translate` on is reported `pivotFree` rather than
  solved.
- ⬆️ **The inward step determines a bone; it does not measure one.** §12.2b is the
  whole account. The two things it structurally cannot do: attribute a
  disagreement to one determinant, and reach a bone that does not branch.
- **A constraint moves bones after their local transforms compose.** With IK,
  transform, path or physics constraints in the candidate, a fitted
  `localRotationDeg` is still a placement but not necessarily a value you can key
  and reproduce. The report lists the constraints it found.
- **Shear, a non-uniform scale and any `inherit` but `normal`** are refused
  `unsupported-geometry` by bone, and a non-region attachment by attachment.
  Composing through them would put a plausible number on geometry this instrument
  does not model — the same shape of wrongness as a search window that excludes the
  truth.
- **Nothing here grades anything either.** Same phase as §11, same reason: the pose
  is a given condition and once your spec states it there is nothing left to be
  close to. Every threshold in the report is a reporting threshold. There is no pass
  bar and `caveats` says so in the file.
