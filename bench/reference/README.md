# Reference renders

PNG frames of the official Spine example exports — what a rung's animation
**looks like**, and the only view of the reference an authoring agent is allowed.

## Why these exist

[docs/LADDER.md](../../docs/LADDER.md)'s honesty rule keeps the reference
`skeleton.json` away from the agent authoring a rung: an agent that has seen the
answer is being measured on transcription, and the resulting number would be
worthless in exactly the way that is hardest to notice afterwards.

Withholding *the shot itself* measures something else again — whether the agent can
guess. A human animator would be shown the animation. Frames are the honest middle:
they are what a client watching the finished shot could see, and they carry no bone
name, no key time, no curve handle and no timeline listing.

## How they are made

```bash
bun bench/render_reference.ts --rung 3 [--fps 12] [--max 256] [--tile 128] [--stride 1]
```

`--tile` sets the contact sheet's tile size and `--stride` writes only every Nth
frame — the sheet still shows all of them. The exact command each rung here was
rendered with is in the table below, and re-running it reproduces the directory
byte for byte — **on the checkout these frames were rendered by**. That qualifier is
load-bearing and the next section says why: the render is deterministic, but the
rasteriser it runs is code that changes. Measured 2026-09-03 both ways: the eight
committed examples reproduce **1,293 of 1,293 PNGs and 11 of 11 `frames.json`** byte for
byte under the sampler they were rendered with, and **1,293 of 1,293 PNGs differ** under
the other one.

[`bench/render_reference.ts`](../render_reference.ts) loads the example's own
`export/` — the skeleton JSON, its atlas and its atlas page — poses it with
`@esotericsoftware/spine-core`, and blits each posed attachment with an affine
map. No browser and no GPU: a bone transform is a plain affine map, and
`tools/plate.ts` already reads and writes PNGs.

**Region and mesh attachments.** A region is one quad; a mesh is a triangle list
whose world vertices come from `MeshAttachment.computeWorldVertices` — the
runtime's own routine, so weighted vertices resolve through their bones and a
`deform` timeline's offsets are applied — filled with barycentric UV
interpolation and a top-left fill rule so two triangles sharing an edge draw it
exactly once. Until #27 a mesh was refused by name and the frame-fidelity lane stopped
at rung 5.

## What cancels out of `check`'s numbers, and what does not

Sampling is bilinear on both paths and the rasteriser is the same file for both — the
reference here and the candidate `check` draws beside it both go through
[`src/render.ts`](../../src/render.ts). ⭐ **So the sampler's own filter cancels — on one
condition, and the condition is not automatic: the frames on disk have to have been
rendered by the same checkout as the `check` that reads them.** Two things follow.

- 🚫 **A frame set outlives the renderer that made it.** These PNGs are a committed
  fixture and `src/render.ts` is code; a sampler repair changes the second and not the
  first, and from then on every number `check` prints carries the difference between two
  renderers on top of the difference between two rigs. That is not hypothetical:
  [#301](https://github.com/firejune/rigc/pull/301) made `bilinear` interpolate in
  premultiplied space so a region edge draws no dark rim, and for two days this directory
  held frames from before it. **The frames here are on the post-#301 sampler**, adopted as
  the standing basis by **gate v2.4** on 2026-09-03; the ladder's own record of what that
  cost is [docs/LADDER.md](../../docs/LADDER.md), *The gate-v2.4 re-inspection*.
  ⇒ **A sampler change means re-rendering this directory in the same pass, or knowing
  exactly which figures you have stopped being able to compare.**
- ⚠️ **What never cancelled, and still does not: the texture.** The reference is drawn
  from the example's own **packed atlas**, which for several rungs ships at `scale: 0.5`,
  while a candidate compiles from the loose full-size PNGs. Same geometry, softer ramp.
  That is a real floor under every MAE here, it is *not* a rig error, and `check
  --texture-from <the example's atlas>` is what measures how much of a figure it explains
  — never `--atlas`, which re-seats region geometry on the foreign packing as well.
  [`src/framing.ts`](../../src/framing.ts) carries the measurement that made the content
  box stop using the background tolerance for exactly this reason.

⇒ 📌 **The honest short version**: the filter cancels, the atlas scale does not, and the
first of those is a property of *this directory being in step with the code* rather than a
property of the code alone.

Per rung: `<example>/<animation>/f0000.png…` at a fixed frame rate, plus a
`contact.png` contact sheet of every frame in that animation, row major, each tile
labelled with its frame index. Every animation of one skeleton shares one viewport
— framing each to its own extent would rescale the motion between them, and the
relationship between two animations is the whole subject of some rungs.

Beside them sits one **`frames.json`** per skeleton: the world box the frames show,
the scale in pixels per unit, the background colour, and one entry per frame
directory with its rate, its frame count and its stride. Three things need it.

- An author measuring a distance in pixels can turn it into units without first
  finding something of a known size in the shot.
- `rigc check` reads the rate and the pixel grid from it, so a candidate is drawn
  onto the same grid as the reference rather than onto one it invented.
- A second render at another rate lands beside the first, and the sidecar records
  both. If a run's framing differs from the one already on disk — a different
  `--max`, say — the file is replaced outright and names the sets it dropped,
  because those frames are at a scale it can no longer describe.

⚠️ It deliberately does **not** list which frame indices are on disk. The directory
is the only author of that fact, and a second copy of it could only ever be the
stale one.

A **static rig** — a skeleton with no animation at all, which rung 1's second
export is — writes its setup pose as one frame in a directory called `setup/`.
Anything that renders to a single frame gets no contact sheet: a sheet of one tile
is that frame again, with a border and a `0` on it.

## What is here

12 fps is the protocol every brief is written against. A second rate lands beside
the first under `<animation>@<fps>fps/`, and where the whole second set was not
worth its weight only its contact sheet is kept — the sheets are far cheaper per
frame than separate files, because one file lets deflate find the static set again
in the next tile.

| Rung | Example | Animations | Rendered with | Frame size | On disk |
| --- | --- | --- | --- | --- | --- |
| 3 | `3-timing-and-spacing` | `heavy` 65, `light` 21 | `--fps 12` | 256×116 | 465 KB |
| 1 | `1-weight-and-mass` | `balls/animation` 40, `drop/ready-to-animate` 1 | `--fps 12`, then `--fps 24` | 256×239 / 256×191 | 1.6 MB |
| 2 | `2-the-12-principles` | 4 × 311 | `--fps 12 --stride 999 --tile 64` | 256×228 | 1.4 MB |
| 4 | `4-wave-principle` | `ball-catch` 121, `wave-by-hand` 17, `wave-offset` 17 | `--fps 12 --max 768 --tile 256`, then the same at `--fps 24 --stride 999` | 768×634 | 1.4 MB |
| 5 | `5-squash-and-stretch` | `ball` 79, `speedy` 79, `ball-ready-to-animate` 1 | `--fps 12 --max 192`, then `--fps 24 --stride 999 --tile 96` | 192×124 | 2.8 MB |
| 6 | `6-arcs` | `arcs` 69 | `--fps 12 --max 512 --tile 171`, then the same at `--fps 24 --stride 999` | 512×137 | 1.2 MB |
| 8 | `8-follow-through` | `ball/follow-through` 45, `pendulum/follow-through` 45 | `--fps 12 --max 512 --tile 171`, then the same at `--fps 24` | 512×413 / 512×381 | 2.9 MB |
| spineboy | `spineboy` | `ess` 8 animations / 132 frames, `pro` 11 / 190 | `--fps 12 --max 384 --tile 128`, then the same at `--fps 30 --stride 999` | 384×367 / 384×358 | 7.7 MB |

Six of those settings are not defaults, and each is a trade worth knowing:

- **rung 2 keeps only the sheets.** 1,244 frames of a static obstacle course is
  over sixty megabytes as separate files and about a seventeenth of that as four
  contact sheets. The sheets hold every frame; `--stride 999` keeps the first and
  last of each animation at full size for detail.
- **rung 4 is rendered large.** Its three animations share one viewport (they must
  — see above) and one of them throws a ball right across it, so the subject sits
  in an eighth of the frame. 768 px is what makes that eighth legible; the sheet
  tile is raised to match.
- **rung 5 is rendered small.** Its set is wide and its subject is a 23-unit ball,
  so at any size that fits a byte budget the ball is a few pixels. 192 px keeps the
  whole rung under three megabytes and still resolves the ball's proportions, which
  is what that rung is about.
- **rung 6 is rendered wide.** Its world box is nearly four times as wide as it is
  tall, so the long side buys height slowly: 512 px gives a 137 px-tall frame in
  which the ball is 12–13 px across — enough to measure the shape changes the rung
  is about. 640 px was measured at 1.7 MB, over budget; 384 px puts the ball at
  9 px and loses them.
- **rung 8 keeps both rates in full** — no `--stride`, 88 written frames per
  skeleton at 24 fps as well as 45 at 12. Two reasons, and the second is the more
  important. ⓐ Its `ball` shot is the fastest on the ladder: the comet moves up to
  **155 px between two consecutive 12 fps frames**, and its hardest event — a launch
  covering 122 px in one 24 fps frame — falls between two 12 fps samples entirely,
  so at 12 fps alone that shot cannot be read. ⓑ Rung 6's revision 2 shipped a set
  of 24 fps figures measured on frames that were rendered at the time and never
  committed, so nothing downstream could check them; committing the whole set is
  what makes a 24 fps claim verifiable. 512 px puts the comet's ball at ~22 px and
  the pendulum's discus at ~110 px, and the whole rung at 2.9 MB.
- **spineboy is the one set that overruns the three-megabyte shape of the others,
  and its second rate is 30 fps rather than 24.** Three trades, in the order they
  were decided.
  ⓐ **Size.** Every animation of one skeleton shares a viewport, and this skeleton's
  is the union of a shot that throws the figure to the left edge and one whose muzzle
  flash reaches the right, so a standing figure sits in about a ninth of the frame —
  rung 4's problem, and the same answer. 256 px was measured at 3.8 MB with the
  figure 66 × 98, small enough to lose a foot; 512 px at 10 MB; **384 px puts him at
  100 × 146** — about the size rung 8's discus was — and the rung at 7.7 MB.
  ⓑ **Why that is affordable.** 7.7 MB buys **19 shots across two skeletons**, or
  410 KB each, against rung 8's 1.45 MB per shot; and `bench/reference/` is not in
  the package's `files` list, so it is clone weight and not install weight. It is the
  last rung and the largest thing on the ladder by an order of magnitude.
  ⓒ **30 fps, not 24.** `sampleAnimation` takes `Math.round(duration × fps) + 1`
  frames, so a frame count brackets the duration in a window of width `1/fps`, and a
  30 fps window contains **exactly one** multiple of 1/30 — the Spine editor's default
  project rate. At 24 fps two of spineboy's durations still have three candidates
  each; at 30 every one is pinned, and two that the 12 fps set reads wrong on its own
  (`pro/idle-turn`, `pro/shoot`) come out right. The 30 fps sets ship `--stride 999`,
  so a sheet plus the first and last frame: 2.0 MB of the 7.7, and the brief measures
  distances only on the committed 12 fps frames.

⚠️ **Rung 6 is the first set whose subject deforms**, and it exists because
`src/render.ts` learned to rasterise mesh attachments (#27). Before that the
renderer refused this rung by name and the frame-fidelity lane stopped at rung 5.

A rung with more than one skeleton nests them: `1-weight-and-mass/balls/…` and
`1-weight-and-mass/drop/…`, `8-follow-through/ball/…` and
`8-follow-through/pendulum/…`, `spineboy/ess/…` and `spineboy/pro/…`. They are two
shots that share an atlas, they are framed independently, and pooling their frames in
one directory would suggest otherwise. The `license.txt` sits at the example root,
above the skeleton directories, because the grant is the example's and not either
shot's.

⚠️ **Nesting says nothing about which skeleton counts.** spineboy's two are not
peers — `ess` is the rung and `pro` is a stretch figure `bench` reports and does not
score ([`src/ladder.ts`](../../src/ladder.ts) carries the roles). They are also at
different scales here, 0.222973 against 0.186285 px/unit, so a pixel figure measured
in one is not a pixel figure in the other.

## Licence — read before adding a rung

The examples are Esoteric Software's. Their `license.txt` releases the **project
file and its exports into the public domain**, but the **images** are granted only
under two conditions: redistribution "as long as they are accompanied by this
license file", and **no commercial use of any kind**.

A rendered frame contains those images' pixels, so committing one *is*
redistribution. That is why each rung directory here carries a verbatim copy of its
example's own `license.txt`, and why `render_reference.ts` copies it rather than
leaving it to somebody's memory.

🚫 **`7-anticipation` ships no `license.txt` upstream at all**, so the grant its
siblings carry does not exist for it. Its frames must never be committed, published
or shipped, and they are not in this directory or anywhere else in this repository.

They may be **rendered locally**, and only there. The owner ruled on **2026-08-26**
([#3](https://github.com/firejune/rigc/issues/3)) that #3's rule — *"never vendor,
commit, publish or ship"* — does not forbid a render that stays on one disk, which is
what left rung 7 attemptable: with no frames obtainable there was no honest input for
either writing or verifying its brief ([#14](https://github.com/firejune/rigc/issues/14)).
So `render_reference.ts` takes one deliberate, narrow exception for that example: it
writes to `bench/reference-local/7-anticipation/` by default, it **refuses any `--out`
inside this repository that `git check-ignore` does not accept**, it fails closed if
git cannot answer, and it drops a `LOCAL-ONLY.txt` beside the frames in place of the
`license.txt` that does not exist. Every other missing licence keeps the unconditional
refusal. The commands, and the frame figures measured from them, are in
[`bench/briefs/7-anticipation.md`](../briefs/7-anticipation.md).

See [NOTICE.md](../../NOTICE.md) for the per-example table and
[docs/LADDER.md](../../docs/LADDER.md) §*Licence, per rung*.
