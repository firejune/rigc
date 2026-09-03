# rigc's example gallery

Complete rigs you can run. Each directory is one **rig spec + motion spec + the
art they name**, small enough to read in one sitting, and each one stars a single
feature of the format so that "how do I do X" has a working answer rather than a
field table.

Everything here is drawn for this repository and licence-clean: no traced
reference, no example asset, nothing lifted out of the benchmark corpus. The
character is **Rigby**, the project's mascot, and the gallery shares one drawing
of him ([`rigby.ts`](rigby.ts)) so that four of the examples look like four shots
of one character rather than four characters.

The other two bring their own cast, and each one's `make_parts.ts` defends the
decision in its header. `portrait` needed a face that sells gaze and a head turn,
and those read off a brow, an iris and a cheek-to-jaw silhouette that a muzzle
does not have — so **Vela** is drawn in
[`portrait/make_parts.ts`](portrait/make_parts.ts). `nod` needed features stacked
up a face at different **depths** and a long soft appendage a regular strip mesh
fits, and neither Rigby nor Vela has either — so **Lepus** is drawn in
[`nod/make_parts.ts`](nod/make_parts.ts). Both are in Rigby's own palette and
outline weight: the rule they bend is *one character*, and the rule they keep is
*one art language*.

| Example | Stars | What it is |
| --- | --- | --- |
| [`ride/`](ride/) | `path` attachments + **path constraints** (AUTHORING §3.4, §3.5.1) | Rigby coasts down a drawn rail in a trolley and rolls back. A `position` timeline drives the traversal; `groups` + `stagger` key the wheels and the ears |
| [`flex/`](flex/) | **`contour` meshes** (AUTHORING §3.4) | A swallow-tailed banner and a serrated leaf — four meshes traced off their own alpha, waved by bone timelines and rippled by a `deform` |
| [`walk/`](walk/) | `ik` constraints + **`ik` timelines** (AUTHORING §3.5, §4.9) | Rigby walks on the spot. Two two-bone leg chains solved to foot targets under a `ground` bone, with the planted leg nailed down and the swinging one let go at the top of its lift |
| [`squash/`](squash/) | **`deform` timelines** (AUTHORING §4.11) | Rigby's ball bounces. A 9-vertex mesh squashed about its contact point and stretched along its travel, from two affine transforms written out in the README |
| [`portrait/`](portrait/) | **`deform` as a projection** (AUTHORING §4.11) + **per-member group values** (§4.5.1) | Vela breathes, blinks, shifts her gaze and turns her head 12° off axis. Two grid meshes and per-part parallax, and both halves of it **state their model** — the mesh keys a `yaw` transform, the feature bones a `yaw` with a depth per member. The measured experiment for [#285](https://github.com/firejune/rigc/issues/285) — see its [FINDINGS.md](portrait/FINDINGS.md) |
| [`nod/`](nod/) | the **`pitch`** and **`wave`** transform kinds (AUTHORING §4.11.1, §4.5.1) | Lepus bows her head and her lop ears ripple. Three meshes, each laid out for the one closed form that moves it — and the two halves of *a deform model is only as good as the triangulation under it*: a fold angle the row table solves for, and a shear no amplitude can fold |

The root [README.md](../README.md) indexes these under *The gallery*, and
[AUTHORING.md](../docs/AUTHORING.md) points at each one from the section that
documents the feature it stars.

---

## Running one

Three commands, from the repository root:

```bash
bun install                                   # once

bun cli.ts build   --rig gallery/<name>/rig.json \
                   --motion gallery/<name>/motion.json \
                   --out gallery/<name>/build
bun cli.ts render  --candidate gallery/<name>/build --out gallery/<name>/render
```

`render` writes PNG frames and a contact sheet. `bun cli.ts preview --candidate
gallery/<name>/build --out gallery/<name>/preview.html` writes one HTML file that
plays the same artifact in the **official Spine Web Player**, which is also the
interop proof. Each example's own README gives the frame rate it was authored at
and the frame worth looking at.

`make_parts.ts` is not a step you have to run — the PNGs are committed. It is
there so you can check that they are the ones the script draws, and so that
changing the art is editing code rather than editing pixels. It is the one thing
in the gallery with a prerequisite: `rsvg-convert` (librsvg), and it says so by
name if it is missing.

---

## The layout, and the decisions behind it

```
gallery/
  README.md              this index
  rigby.ts               the mascot: one part table, one closed palette, one
                         rasteriser. Not an example — no rig.json, so the
                         selftest's gallery suite skips it
  loop_seam.ts           measures whether a cycle closes on its opening pose, and
                         refuses the reading on a set whose last frame is not at
                         the duration it was given
  stage.ts               reads a rig spec and answers where its bones are
  <name>/
    README.md            what it shows, the feature it stars, the commands, and
                         what the authoring cost
    FINDINGS.md          (portrait only) the measurement half, where an example
                         is also an experiment somebody booked and the numbers
                         would swamp its README
    make_parts.ts        draws parts/ — deterministic
    parts/*.png          committed. Every PNG the rig names, and nothing else
    rig.json             the skeleton
    motion.json          the time
    curve.ts             (ride only) geometry two files both need
```

**`rig.json` and `motion.json` are hand-authored, not generated.** They are the
thing being taught. A script that emitted them would hide the format behind a
second one, and a reader would have to learn the generator before the spec.

**`build/`, `render/` and `preview.html` are generated on demand and
gitignored.** The specs and the art are the source; the artifacts are a function
of them, and committing both makes two things that can disagree. The preview is
the clearest case: `rigc preview` embeds every atlas page as a base64 data URI —
about 130 KiB per example of binary that changes whenever the art does — for a
file whose only purpose is to be opened once. Each README carries the command
instead.

**The parts are committed *and* reproducible.** Committed, because a reader
cloning this repository should be able to build an example without drawing
anything, and because the atlas page sizes in the skeleton are measured off these
exact files. Reproducible, because a committed PNG with no script behind it is art
nobody can change.

**Only the parts a rig names are in `parts/`.** A PNG nothing references is an
atlas page nobody loads and a reader's false lead about what the rig is made of,
so an example that swaps a part out — `walk` replaces the one-piece legs with a
segmented pair — filters it from the list rather than shipping both.

**The gallery ships in git and not in the npm package.** It is not in
`package.json`'s `files`, so the published tarball stays lean (`npm pack
--dry-run` lists nothing under `gallery/`). That means links *into* the gallery
from a file that IS published have to be absolute GitHub URLs; links *within* the
gallery are relative, because the gallery is only ever read from a checkout or
from GitHub.

**The character's art scale is per-example and stated.** `rigby.ts` draws at a
nominal size that its outline weight was chosen for, and `rasterise`'s `scale`
re-renders rather than resampling. `ride` and `flex` ask for half of nominal
against their wider stages; `walk`, `squash`, `portrait` and `nod` ask for all of
it, and their bone tables are stated in the same unit. Each `make_parts.ts` names its `ART_SCALE`
in one place.

---

## Adding one

The bar, and it is the bar the six examples above were held to:

- **One starred feature**, named in the first paragraph of its README. A second
  feature is a second example.
- **Charming, and in the mascot's palette.** Draw new parts through
  [`rigby.ts`](rigby.ts) rather than beside it — two hues plus ink for the
  character, one outline weight — and iterate on contact sheets at least twice.
  The bar is the demo GIF in the root README.
- **Motion authored to [MOTION.md](../docs/MOTION.md)'s recipe**, and the README
  says which parts of it were used: the key plan, the easing table, the
  follow-through offsets as fractions of the duration.
- **`rigc build` green on the default `spine` profile**, `rigc render` frames you
  have actually looked at, `rigc preview` booting, and — where the motion loops —
  a **measured** seam:

  ```bash
  bun gallery/loop_seam.ts gallery/<name>/render/<animation> --duration <seconds>        # the default 12 fps
  bun gallery/loop_seam.ts gallery/<name>/render/<animation>@25fps --duration <seconds>  # any other rate
  ```

  It compares a render's first and last frame, which needs no reference at all:
  `rigc render` samples `i = 0..round(d × fps)` inclusive, so a cycle that closes
  has the same pixels at both ends. Every animation in the gallery that declares
  `loop: true` reads **0 / 255** — `ride`, `wave`, `walk`, `bounce` and `idle` —
  and the two one-shots beside them (`coast`, `gust`) read what a one-shot
  should: they end somewhere else. Point it only at a loop, and own the number in
  the README. `portrait` is the case in between and worth knowing about: its
  `gaze` and `turn` are one-shots that return to rest exactly, so they read
  **0 / 255** too — a one-shot ending somewhere else is a choice, not a law, and
  `nod`'s `bow` is the same case.

  🚨 **`--duration` is the animation's own length, and it is not optional in
  practice** ([#337](https://github.com/firejune/rigc/issues/337)). `round(d ×
  fps)` puts the last frame *at* `d` only when `d × fps` is a whole number, and
  up to half a sampling interval either side of it when it is not — so on such a
  set the comparison is between `t = 0` and a time that is not the wrap point,
  and it is not a seam reading at all. Given the duration the tool **refuses**
  that set and names a rate that lands; without it, it prints the numbers under
  an `⚠️ UNVERIFIED` verdict. Two of the readings above needed a rate other than
  their example's own to be taken at all: `wave` is 2.4 s, so 12 fps gives 28.8
  and it is measured at **15 fps**; `portrait`'s `gaze` is 1.5 s, so 25 fps gives
  37.5 and it is measured at **20 fps**; and `nod`'s `bow` is 1.8 s, so 12 fps
  gives 21.6 and it is measured at **15 fps**.

  📏 **A seam figure is a reading at one `--max`, and the README says which**
  ([#336](https://github.com/firejune/rigc/issues/336)). A curve sampled into
  segments need not return its endpoint key to the last bit, and a residual below
  the art's own quantisation is invisible at one frame size and lands on a pixel
  boundary at another: `portrait`'s `idle` reads **0 px** at the `--max 640` its
  example renders and **1 974 px at 57/255** at `--max 1782`, with three
  intermediate scales at 1/255 in between. So `loop_seam.ts` prints the `--max` it
  measured and the scale in px/unit, and says outright that the figures are
  readings at that size. The residual is bounded rather than open: with a
  **constant** final segment the frames at the end of a cycle are byte-identical
  to `t = 0` even at the amplifying scale.

  ⚠️ What it cannot see is a **velocity** discontinuity. A cycle whose value
  matches at the seam but whose slope does not still reads as a hitch, and every
  pixel in this measurement is identical when that happens.
- **The README records what the authoring cost.** Every bug, every surprise,
  every default that turned out to be wrong. Writing the first four examples
  found **four** genuine tool defects
  ([#273](https://github.com/firejune/rigc/issues/273),
  [#274](https://github.com/firejune/rigc/issues/274),
  [#275](https://github.com/firejune/rigc/issues/275),
  [#277](https://github.com/firejune/rigc/issues/277)), and `portrait` found
  **five** more — two defects
  ([#292](https://github.com/firejune/rigc/issues/292),
  [#293](https://github.com/firejune/rigc/issues/293)) and three instrument gaps
  ([#294](https://github.com/firejune/rigc/issues/294),
  [#295](https://github.com/firejune/rigc/issues/295),
  [#296](https://github.com/firejune/rigc/issues/296)); `nod` found **three**
  more — one unrefused degenerate model
  ([#350](https://github.com/firejune/rigc/issues/350)) and two docs stating
  something that is no longer, or never was, true
  ([#351](https://github.com/firejune/rigc/issues/351),
  [#352](https://github.com/firejune/rigc/issues/352)). That is what a gallery
  is *for*, besides being read. If a tool behaves wrongly or a doc misleads you,
  file it with the reproduction and work around it in the open.
- **`bun run selftest` covers it automatically.** Its gallery suite compiles
  every `gallery/*/rig.json` + `motion.json` and gates the result, so a new
  directory needs no wiring — and a change to a field name, a default or a
  refusal reds the run instead of quietly turning these examples into
  documentation of a format rigc no longer accepts.
