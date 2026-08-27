# Rung 7 brief — `7-anticipation`

> ## ✅ Revision 3 — 2026-08-28. **Two claims promoted out of the hedges. Attempt 2 may fire.**
>
> Same third-party verifier as revision 2, after the rung's first authored run and its
> adjudication. **Nothing here comes from the run's record or from the adjudication** —
> both findings below were re-derived from frames rendered locally at this brief's own
> flags, and the reference export was not opened. The run's own figures, the
> adjudication's, and anything reference-side stay where they belong, on
> [#14](https://github.com/firejune/rigc/issues/14).
>
> **1. The panel's draw-order edge is now measured, not hedged.** Revision 2 called it
> *"the weaker of the two readings"* on the grounds that *"a panel in front that happens
> never to overlap would look the same"*. **The overlap is on every frame in the
> corpus.** Scanning rows for *crimson, beige, crimson* inside one unbroken drawn span
> finds it on **all 102 frames** — 5,696 rows, 287,244 flanked beige pixels — and
> restricted to flanked runs **60 px or wider**, still **149,583 px on 1,945 rows and
> still all 102 frames** — and on **71** of those the flanked rows span more vertically
> than the collar art's entire 38.5 px height, so the collar cannot be what flanks them.
> Put beside revision 2's verified converse (crimson crosses the beige outline by **84
> px** in the whole corpus), the panel lies across the sack constantly and the beige wins
> everywhere they meet. ⇒ **build it behind**, stated as a measurement under the fifth
> reading of the answer-derivability test: what a viewer of the committed frames could
> count for themselves. The one alternative the pixels do not formally exclude is written
> down beside the claim, together with the build-side test that does exclude it and uses
> the already-settled collar edge as its control.
>
> **2. The sack needs a deforming attachment, and that is also frames-forced.** A Spine
> bone's local transform is a general affine, so *"is each frame's sack silhouette an
> affine image of the art's?"* is exactly *"could one bone placing one region draw
> this?"* — and **not one of the 102 frames reads below a deliberate-20 %-bend control**,
> against a pure-affine floor four to six times lower. Revision 2 listed this under
> *What this does not settle*; it was too conservative rather than wrong, and the reason
> is that revision 1's estimator had been discarded over a control failure that turns out
> to be one line deep. Full estimator, both controls, the grid sweep and a **second**
> control failure found while repairing it are stated in place.
>
> **What did NOT move, deliberately.** The cape's mechanism stays in *What the frames
> cannot tell you*, and that entry is now sharper rather than weaker: the affine test
> needs a silhouette belonging to one part, and the two cape images are both crimson with
> `g == b` on every pixel, so nothing separates the collar from the panel. **The sack's
> verdict does not read across to the cape in either direction**, and the brief now says
> so, because that is the inference most available to a run that has just read finding 2.
>
> **Added for attempt 2, from the frames only.** `cape-follow-example` f7 → f13 is where
> the cloth is hardest to place: the visible crimson falls monotonically to the **least
> crimson anywhere in the corpus**, filling only **4.7–5.0 %** of its own bounding box
> against 12.1 % at rest — nearly edge-on, so the silhouette is dominated by angle rather
> than extent. Then f13 → f14 throws it open **+132 % in one frame**.
>
> **Seal check: clean.** Both promotions are observable-by-construction facts measured off
> the frames and the art, and both are stated as what the pictures force rather than as
> what the reference contains. No count of bones, slots, attachments, constraints,
> vertices or timelines appears; no key time, curve or setup-pose value appears; and no
> figure from the run or the adjudication appears. Finding 2 says a region cannot draw the
> sack — it does not say what the reference built instead, and *"how much deformation, and
> how"* is left open in place.

> ## ✅ Revision 2 — 2026-08-27. **Verified. The rung is runnable.**
>
> Third-party verification pass, by a **different** agent than the one that wrote
> revision 1 (Claude Opus 5 (1M context), Claude Code / Agent SDK), under
> [`bench/runs/README.md`](../runs/README.md)'s *Before a rung is attempted*. The
> frames were fetched and rendered from scratch at the exact flags in *The reference
> frames* below, every claim re-measured against them, and no frame was committed —
> `git ls-files bench/reference-local` reports 0. The verdict is on
> [#14](https://github.com/firejune/rigc/issues/14).
>
> **The method held up, which is why so much of this reproduced.** The `g − b` split,
> the 8/255 subject mask and the three-rate duration argument were reproduced
> independently and every art-side control came back to the digit: `sack.png`'s opaque
> box **460 × 809**, its **250,792** opaque pixels of which **40** read as cape, its
> area **9,041 px** and diameter **164.7 px** at the frames' scale, and **100.0 %** of
> both cape images on the cape side — with *opaque* meaning **alpha ≥ 128**, which the
> brief did not say and which every one of those five figures depends on. The render
> is byte-for-byte deterministic: two independent renders of the 12 fps set have
> identical digests.
>
> **Every quantitative and behavioural claim below was re-measured, and the fourteen
> items in the next list are all that moved.** These reproduced *to the digit*: all
> four frame counts at all three rates and all four duration windows; the empty-stage
> figures (**181,132** pixels drawn on at least one frame, **0** on 90 % or more of
> them); one connected component on every one of the 102 frames; the beige-piece census
> **75 / 24 / 3**; the three rest-pose silhouette distances **9, 22, 31**; `walk`'s
> nine widths, both loop figures (**198** px of ~7,940; cape **496** against 806 and
> 1,106) and its two fast-frame counts; `fall-in`'s four centroid drops, its five base
> rows and its four rebound boxes; `hello`'s sixteen base rows f19 → f34 in order and
> its 803.7 px / 34× travel; `cape-follow-example`'s ten monotone cape areas f27 → f36
> in order and its two cape-vs-body walks; every diameter in the rigid-pose table and
> every one of its crimson and visible-area figures; the caliper ratio range
> **0.370 – 0.784** and the art's **0.514**; the three corpus extremes; and five of the
> six drag correlations (the sixth is out by 0.01, item 12).
>
> **Corrected.** Fourteen items, in the order they appear below.
>
> 1. **Three spans started a frame late.** `hello`'s anticipation is **f13 → f17**
>    (148.5 is f13's centroid, f14's is 143.2), `cape-follow-example`'s wind-up is
>    **f3 → f11** (148.2 is f3, f4 is 144.5) and its leap is **f11 → f21** (112.4 is
>    f11, f12 is 116.0). Every figure attached to those spans — 23.3 px, 35.8 px,
>    238.0 px, the durations, and the shape boxes — is right for the corrected range,
>    which is what identified it.
> 2. **`hello` f4 → f13: the body's centroid walks 4.0 px, not 0.6 px** (net 3.8).
>    0.6 px is the **f7 → f13** hold. The sentence's point stands either way — 4 px of
>    body against 22.9 px of cape crossing — and both figures are now in it.
> 3. **The velocity convention was missing, and every drag figure needs it.** All the
>    "faster than 3 px/frame" counts and all six correlations reproduce only under a
>    **central difference**. Under forward differences `hello`'s vertical correlation
>    reads **+0.24** instead of −0.03 and `walk`'s counts read 2 and 5 instead of 1
>    and 2 — so re-measuring the obvious way would have "corrected" the brief wrongly.
> 4. **At the 256 px default the subject is 38 px tall, not 15.** Rendered at the
>    default it is 24 × 38 px in a 256 × 200 frame. The case for `--max 1024` is
>    unaffected.
> 5. **The discarded `r − g` split moves the crimson areas by 2.2 – 7.1 %**, not
>    "no area figure by 1 %" — `walk/f0`'s 806 becomes 749. The sack areas move up to
>    1.05 % on the quoted frames and 1.48 % at `fall-in/f2`.
> 6. **Its 40 px diameter shift needs the undenoised mask.** It reproduces there
>    (**41.7 px** worst, `hello/f29`, 151.6 → 193.3) and collapses to **1.5 px** with
>    the denoise step the bullet above it mandates.
> 7. **A half-blended cape pixel cannot read `r − g` = 3.** `cape-back.png`'s minimum
>    source `r − g` is **17**, so half blend floors it near 8. The triple
>    (212, 209, 209) does occur — 4 pixels in the 102 frames — at about **18 %**
>    coverage. The mechanism and the conclusion are right; the illustration was not.
> 8. **The rigid-pose table's area columns are denoised too**, which the method
>    bullets did not say. The conclusion survives on raw areas: `f0014` would then
>    need 12,599 px and show 9,058.
> 9. **`fall-in` starts 558 px higher up, not 500** — the warning above it already
>    said 560.
> 10. **The cape's +31.9 px at `hello/f15` is the extreme on that side**, not of its
>     whole travel; the largest excursion in the shot is −48.3 px at f21.
> 11. **Two "longest step" figures are 2-D**, in paragraphs about horizontal travel.
>     The longest *horizontal* steps are 85.2 px (`hello` f27 → f28) and 43.0 px
>     (`cape-follow-example` f13 → f14).
> 12. **`cape-follow-example`'s vertical correlation is −0.31** (−0.3147), not −0.32.
> 13. **Digits and bands.** `hello` f3's centroid is 688.2 (688.3 is f2's); `walk`'s
>     centroid **spans** 6.3 px, 145.1 … 151.5, rather than staying inside 6.4 px of
>     x = 145 (max |x − 145| is 6.45); `cape-follow-example`'s x is ±0.1 of 345.3 from
>     **f27**, and ±0.15 of 345.2 from f25; the rest pose is 99 × **153–154** because
>     `cape-follow-example/f0` is a pixel shorter.
> 14. **Four stillness and "never" claims had no tolerance**, which is the failure
>     rungs 5 and 3 both shipped. `fall-in` f19/f20's silhouettes are identical **at
>     the 8/255 mask threshold** and differ by 3 pixels at exact equality; the
>     "differ in colour" counts are **exact-equality** counts (39 and 75 at 8/255);
>     the crimson that "never crosses the beige outline" crosses it by **84 pixels
>     over the 102 frames**, worst 51 at `hello/f18`; and "all of them interior
>     shading" is 1,076 of 1,083 inside the drawn region, 135 of those on its edge.
>
> **Nothing was moved into *What the frames cannot tell you*, and nothing went the
> other way.** Both draw-order readings survive as the brief stated them — the collar
> in front is proven by the beige-piece census, and the panel behind was, **as of this
> pass**, still the weaker reading the frames were thought not to force. (Revision 3
> overturned that half: the overlap is on every frame, and the edge is measured.)
>
> **Seal check: clean.** No reference-side value of a scored measure appears below.
> The cast, the four animation names, the four durations and the one skeleton are the
> granted or licensed cases — the fifth reading of the answer-derivability test for
> the cast, *The honesty rule* outright for names and durations, `frames.json` for
> the skeleton and the viewport. Everything else is measured off the frames, the art
> or `frames.json`. Every sealed item is refused by name where it would otherwise be
> tempting: the panel's piece count, the cloth's mechanism, the sack's joint count,
> and whether the shape change needs a mesh.

> ## Revision 1 — 2026-08-26. Written from the frames, before any verification.
>
> Written by the agent that rendered the frames (Claude Opus 5 (1M context), Claude
> Code / Agent SDK), and unchecked until revision 2 above.
>
> **This is the first brief on the ladder written from frames that are not in this
> repository and never will be.** `7-anticipation` ships no upstream `license.txt`,
> so its images carry no redistribution grant and a rendered frame of them cannot be
> committed ([#3](https://github.com/firejune/rigc/issues/3), and *Licence, per rung*
> in [docs/LADDER.md](../../docs/LADDER.md)). The owner's ruling of **2026-08-26**
> opened the one path that leaves the rung attemptable: the frames may be rendered
> **locally, to a path git ignores**, by whoever needs them. So *The reference frames*
> below is a command rather than a directory listing, and the verifying agent runs
> that command first. Byte-for-byte reproducibility is what makes the figures here
> checkable at all, so **do not change the command's flags**.
>
> **How every number below was obtained**, so that the verifying pass can attack the
> method and not only the digits:
>
> - **Subject mask** — a pixel counts as drawn when it differs from the backdrop
>   (232, 232, 232) by more than **8/255 on some channel**. Every area, box,
>   centroid and connectivity figure below uses that threshold. Frame-to-frame
>   *silhouette* figures compare drawn-or-not and nothing else, so they are immune
>   to shading; where a plain pixel-difference count is quoted it is labelled as one,
>   and **every "differ in colour" count below is at exact equality** rather than at
>   the 8/255 threshold. The two answers are far apart — `fall-in`'s last pair differs
>   by 1,083 pixels exactly and 39 at 8/255 — so a stillness figure here always names
>   which one it is.
> - **Opaque, on the art side, means `alpha ≥ 128`.** Every figure taken off the three
>   PNGs uses that: the opaque boxes, the areas, the diameter and the colour controls
>   all move if you use `alpha > 0` instead (`sack.png` reads 253,628 pixels and a
>   463 × 811 box that way).
> - **Sack vs cape** is split on **`g − b`**: cape ⇔ `g − b ≤ 8`. Controlled against
>   the art: **40 of 250,792** opaque pixels of `sack.png` read as cape (0.02 %), and
>   **100.0 %** of both cape images do. ⚠️ **The obvious split fails this control and
>   fails it invisibly.** An `r − g > 40` test — crimson is redder than beige — files
>   the cape's thinly-covered anti-aliased edge as sack: at the rest pose **159**
>   crimson pixels flip class that way, **146** of them touching the backdrop and 94 of
>   them within 40/255 of it, with a median `r − g` of 7. A crimson pixel drawn at about
>   **18 %** coverage over the backdrop reads (212, 209, 209), whose `r − g` is 3, and
>   4 pixels in the 102 frames read exactly that. (Half coverage is not enough to do
>   it — `cape-back.png`'s lowest source `r − g` is 17, so half blend floors the
>   composite near 8.) The damage is concentrated in the maxima and in the crimson
>   totals: it moved the sack's measured **width at rest from 87 px to 99 px** and its
>   measured **diameter by up to 41.7 px** (`hello/f29`, 151.6 → 193.3, on the
>   undenoised mask — with the denoise step below the worst diameter shift is 1.5 px),
>   while moving the **crimson** areas quoted below by **2.2 – 7.1 %** (`walk/f0`'s 806
>   becomes 749) and the sack areas by up to 1.05 % on those frames and 1.48 % at
>   `fall-in/f2`. Every part-split figure below was recomputed after the fix. The cape
>   art is crimson with `g == b` on every pixel, so `g − b` survives blending and
>   `r − g` does not.
> - **Part masks are denoised** before any diameter or caliper figure, **and before
>   the two area columns of the rigid-pose table**: a pixel with fewer than four
>   same-class neighbours in its 3 × 3 is dropped. This *shrinks*
>   thin features, so it makes the rigid-pose test below **conservative** — it can
>   lose a positive, not invent one. (Raw areas would not change its verdict:
>   `cape-follow-example/f0014` would need 12,599 px and show 9,058.)
> - **Velocity is a central difference** — `v` at frame `i` is
>   `(p[i + 1] − p[i − 1]) / 2`, so the first and last frame of a shot carry none.
>   ⚠️ **Every drag figure below depends on that choice.** With forward differences
>   `hello`'s vertical correlation reads **+0.24** instead of −0.03, and `walk`'s
>   "faster than 3 px/frame" counts read 2 and 5 instead of 1 and 2.
> - **Durations** are pinned by frame counts at three rates, not by the 12 fps set's
>   last sample time. `sampleAnimation` takes `round(duration × fps) + 1` frames, so
>   `n` frames put the duration in `[(n − 1.5)/fps, (n − 0.5)/fps)`; three rates
>   intersect to a window of about 0.02–0.03 s. The commands are below.
> - ⚠️ **One estimator was written, failed its control, and its numbers are not in
>   this brief.** To ask whether the sack merely rotates and scales, silhouettes were
>   whitened — centred, rotated onto their principal axes, scaled to unit variance —
>   and compared by IoU. On the control the rest silhouette *rotated by 90°* and the
>   same silhouette *scaled 1.6 × 1* both scored **0.707**, because whitening swaps
>   which axis is which when the aspect ratio crosses 1. Every "shape change" that
>   estimator reported was therefore indistinguishable from a rotation. It is replaced
>   below by a bound that needs no alignment at all.
>   - ✅ **Revision 3 recovered it, and the fix is one line of method**: search the
>     rotation and both reflections exhaustively instead of trusting whitening's axis
>     order. The same 90° control that scored 0.707 then reads **0.023–0.032** — correctly
>     "this is affine" — and the repaired estimator is what settles the sack's deformation
>     in *The sack changes shape*. ⚠️ It came with a **second** control failure of its own,
>     recorded there: a control at the art's own resolution measures point density rather
>     than shape when the subject is 30× sparser.

> ## The leakage rule this brief was written under
>
> ⭐ **Everything below is something a client watching the finished animation could
> tell you.** Nothing below was copied out of the reference `skeleton.json`, and this
> author did not open it.
>
> This brief names the image files, names the four animations, states each one's
> length, describes in plain words what a viewer sees, and points at frames. It
> states **what is drawn** — the cast of the shot — under the fifth reading of the
> answer-derivability test, ruled 2026-08-26: *an observable-by-construction
> structural fact is the exam question, not a leak.* What a viewer counts on screen is
> in the frames whether this file says it or not.
>
> It deliberately does **not** carry bone names, bone counts, the hierarchy, key
> times, key values, curve handles, timeline kinds, slot names, constraint counts, the
> setup pose, or any other fact that only reading the reference JSON could supply.
> How many bones, slots or attachments it takes to build this is yours to decide, and
> it is one of the things being measured.
>
> ⚠️ **One disclosure.** While implementing the licence exception that made this
> render possible, this author necessarily read parts of `docs/LADDER.md` that a run
> may not — its status table among them. Nothing from those parts is asserted below:
> every claim here was derived from the frames and the art, and where the frames
> could not decide something it is in *What the frames cannot tell you* rather than
> filled in from elsewhere. **An authoring run must not read those sections**, and a
> run authored by this session would not be recordable.
>
> **If you have the reference export in context, stop — this run cannot be recorded.**

## The job

Author a rig spec and a motion spec that reproduce this shot — one skeleton, **four
animations** — compile them with rigc, and get a green gate.

```bash
bun cli.ts build \
  --rig    <your>.rig.json \
  --motion <your>.motion.json \
  --images examples/7-anticipation/images \
  --out    <your-out-dir> \
  --profile spine

# in the loop, as often as you like — it never opens the reference skeleton
bun cli.ts check --candidate <your-out-dir> --frames bench/reference-local/7-anticipation

# once, at the end
bun cli.ts bench 7 --candidate <your-out-dir> --frames bench/reference-local/7-anticipation --json report.json
```

Notes on the shape of the deliverable:

- **You do not need an atlas.** The art is loose PNGs and rigc emits its own
  one-part-per-page atlas from them. Point `--images` at the images directory.
- rigc requires a `skeleton.width`/`skeleton.height` when there is no cut manifest.
  Nothing in the scoring reads the skeleton header — pick something that comfortably
  contains the shot and move on.
- Names are yours. `diff` reports name-matched and name-agnostic figures side by
  side, precisely so that a rig built correctly under its own names is not called a
  total failure.
- ⭐ **Declare the durations from the table below, not from the frame counts.** Three
  of the four agree with `(frames − 1) / 12`; `hello` does not, and `build`'s
  `A09_ANIMATION_DURATION_MATCHES_SPEC` will hold you to whatever you declare.

## The reference frames — you render them, they are never committed

🚫 **This example ships no `license.txt` upstream**, so its images carry no
redistribution grant and rendered frames of them must never be committed, published
or shipped. Under the owner's ruling of 2026-08-26
([#3](https://github.com/firejune/rigc/issues/3)) they may be rendered **locally, to
a path this repository ignores**, and `bench/render_reference.ts` refuses any other
destination:

```bash
bun run fetch-examples                                   # once; examples/ is gitignored

# the 12 fps set every figure in this brief was measured on
bun bench/render_reference.ts --rung 7 --max 1024 --tile 256

# the sheets that pin the durations (first and last still of each, plus a sheet)
bun bench/render_reference.ts --rung 7 --max 1024 --tile 256 --fps 24 --stride 999
bun bench/render_reference.ts --rung 7 --max 1024 --tile 256 --fps 30 --stride 999
```

They land in `bench/reference-local/7-anticipation/`, which `.gitignore` covers, with
a `LOCAL-ONLY.txt` beside them saying what may not be done with them. The render is
deterministic — it reposes from the setup pose every time — so the three commands
reproduce byte for byte, which is what makes every figure below checkable.

**One skeleton, four animations, 102 frames at 12 fps, frame size 1024 × 798 px, one
shared viewport at 0.189871 px per unit.** `frames.json` beside them carries that box
and that scale, so a distance measured here converts into the units a rig is authored
in.

| Animation | 12 fps | 24 fps | 30 fps | duration is inside | **declare** |
| --- | --- | --- | --- | --- | --- |
| `fall-in` | 21 frames | 41 | 51 | [1.6500, 1.6833) | **1.6667** s = 50/30 |
| `hello` | 35 frames | 70 | 87 | [2.8542, 2.8750) | **2.8667** s = 86/30 |
| `walk` | 9 frames | 17 | 21 | [0.6500, 0.6833) | **0.6667** s = 20/30 |
| `cape-follow-example` | 37 frames | 73 | 91 | [2.9833, 3.0167) | **3.0000** s = 90/30 |

Every one of those windows contains exactly one multiple of **1/30 s** and the
right-hand column is it, so the shot is authored on a 30 fps grid — the Spine
editor's default project rate. `hello`'s window contains no multiple of 1/24 at all,
which is the same conclusion from the other side.

⚠️ **The viewport is the union of all four shots and the subject is small in it.**
Standing, the whole thing is **99 × 154 px** in a 1024 × 798 frame — under 2 % of its
area — because one shot drops in from the top of the box and another crosses almost
its whole width. 1024 px is what makes a 154 px subject measurable; at the 256 px
default the frame is 256 × 200 and the whole subject is **24 × 38 px**, on which
nothing below can be checked. **Do not render at
another `--max`**: every pixel figure in this brief is at this one, and `frames.json`
would be rewritten at a scale that describes none of them.

⚠️ **The fall in `fall-in` is four frames long at 12 fps.** The subject's centroid
drops about **140 px per frame** there — most of a body length — so that shot's first
third is sampled, not resolved. Nothing below quotes a shape figure inside it that
needs a fifth frame; if you want one, render a higher rate yourself with the same
`--max 1024` and say which rate you measured on.

## The art

`examples/7-anticipation/images/` — fetched by `bun run fetch-examples`, and **not**
redistributed in this repository under any circumstances. Three files.

| File | Size | Opaque box | What it is |
| --- | --- | --- | --- |
| `sack.png` | 465 × 813 | 460 × 809 | a plump burlap sack, drawn in pale beige with woven shading, two knotted corners standing up like ears at the top and two small stubby feet at the bottom |
| `cape-back.png` | 519 × 519 | 514 × 515 | a broad dark-crimson cloth panel with satin highlights, roughly square |
| `cape-front.png` | 400 × 207 | 395 × 203 | a crimson band with a tied bow and two short loose ends — a collar seen from the front |

At the frames' 0.189871 px per unit those opaque boxes come out **87.3 × 153.6**,
**97.6 × 97.8** and **75.0 × 38.5** px, and the sack's opaque area is **9,041 px**.
Those three numbers do most of the work below: standing, the sack measures **87–88 ×
153–154 px** on screen, so at rest it is drawn at its own art size to within a pixel.

## What the shot is

The principle is **anticipation**: before a body moves, it moves the other way
first — and the cloth on it never arrives on time, at either end.

### The cast, and the empty stage

- **Nothing is drawn but the character.** There is no set, no ground, no shadow: of
  the 1024 × 798 pixels, **0** are drawn on 90 % or more of the 102 frames, and
  181,132 are drawn on at least one. Every non-background pixel in every frame
  belongs to the subject.
- **The subject is one connected shape on every one of the 102 frames** — a single
  component under 8-connectivity, with no second blob anywhere at any time.
- **A crimson band runs across the sack, in front of it.** Splitting each frame by
  colour, the beige part alone is **two separate pieces on 75 of the 102 frames**
  (head above the band, body below it), three to five on 24 more, and a single piece
  on only **3** — the frames where the crimson has swung entirely clear. A part that
  cuts another part's silhouette in two is drawn in front of it, so **at least one
  crimson piece is in front of the sack**, and it is the collar and bow.
- ⭐ **The panel is behind the sack, and the frames force it.** Two measurements, and
  the second is the one that closes it:
  - **The crimson essentially never crosses the beige outline.** Of the ~190,000
    crimson pixels across the 102 frames, **84** are strictly enclosed by beige, on
    **19** frames, worst **51** at `hello/f18` — a twelve-row cluster beside the band,
    two-thirds of it touching beige, which is the blend boundary the colour split
    cannot help producing. So wherever the two meet, the beige wins.
  - **And they do meet, on every frame.** Scanning each row for the sequence *crimson,
    beige, crimson* inside one **unbroken drawn span** — no backdrop pixel anywhere
    between the two crimson runs, so the drawn material is continuous across the
    sack — finds it on **all 102 frames**: **5,696 rows** and **287,244** flanked beige
    pixels. Restricted to flanked beige runs **60 px or wider** it is still **149,583**
    pixels on **1,945** rows and still **all 102 frames**, reaching **82 px** wide on the
    standing frames — about the full width of an 87 px sack.
  - **The collar cannot be what is doing the flanking**, on most of the corpus. On **71
    of the 102** frames those wide flanked rows span more than **38.5 px** vertically,
    which is the collar art's *entire* height at this scale (75.0 × 38.5 px), so a collar
    drawn at its own size cannot reach them at all — the widest spans run to 101–123 px
    in `cape-follow-example`.
  - ⇒ crimson shows on both sides of the sack at the same height, with the drawn material
    unbroken between, on every frame in the corpus, and the beige is frontmost wherever
    they meet. **Build the panel behind.**
  - 🔍 **What the pixels leave open, stated exactly**, because it is what revision 2 was
    right to worry about and wrong about the size of: continuity of *drawn* material does
    not by itself prove one cloth spans the gap. The surviving alternative is two crimson
    regions that terminate **exactly** on the sack's outline, on 1,945 rows, across all
    102 frames, while the panel — 97.6 × 97.8 px of art, demonstrably on screen — never
    once produces the pattern itself. That is not a reading the frames support; it is one
    they do not formally exclude, and the build-side test below excludes it. Revision 2's
    *"a panel in front that happens never to overlap would look the same"* failed on the
    premise rather than the logic: **the overlap is constant, not absent.**
  - 🔍 **Convention**: classes are this brief's own — drawn at 8/255, cape ⇔
    `g − b ≤ 8` — on **raw** masks with no denoise, and a beige run counts as flanked
    only when its immediate neighbours inside the span are both crimson. Denoising
    shrinks thin features and would only remove flanked rows, never add them.
  - 🧪 **Once you have a build you can confirm it a second way, and the collar gives you
    the control for free**: render your candidate twice, swapping one adjacent pair of
    slots each time, and score both renders against the frames **over the pixels where
    the two renders differ at all** — a whole-frame figure divides the evidence by the
    whole frame. The panel edge separates several times harder than the collar edge,
    which is an edge you already know the answer to. The size of the separation depends
    on your rig, so read the collar's number as your own scale rather than chasing one.
- Standing, the whole subject is **99 × 153–154 px** and **10,244–10,249 px** are
  drawn, of which **1,843–1,846** are crimson.

### The rest pose is shared, and three of the four shots use it

`fall-in`'s last frame, `hello`'s first and `cape-follow-example`'s first are the same
standing pose to within a rounding error: their **silhouettes differ by 9, 22 and 31
pixels** out of ~10,245 drawn, at the 8/255 mask threshold (in that order:
`fall-in/f0020` against `hello/f0000`, `hello/f0000` against
`cape-follow-example/f0000`, and `fall-in/f0020` against
`cape-follow-example/f0000`). They are not bit-identical — **993 to 1,745 pixels
differ in colour at exact equality**, 70 to 145 of them at the 8/255 threshold, and
only 15 to 41 of them fall outside the drawn region — so read it as *"the same pose,
arrived at from different directions"* rather than as one frame copied about.

⚠️ **`walk` does not start there.** Its first frame differs from that pose by **2,396
silhouette pixels**: it opens mid-stride, leaning, with the sack 104 px wide instead
of 87.

### `fall-in` — 21 frames at 12 fps, duration **1.667 s** (50/30)

The sack drops in from above, lands, squashes, and rebounds into the standing pose.

- **The fall is four frames and it is not accelerating.** The body's centroid drops
  **139.5, 139.9, 139.9 and 157.9 px** across f0 → f4 — three steps inside half a
  pixel of each other, then a longer one. The sack's own base row goes 191, 333, 477,
  620, 737. Read it as constant speed over what the 12 fps set can see, and see the
  warning above before building a curve into it.
- **It stretches on the way down and squashes on the hit.** The sack's silhouette
  measures **87 × 154** at f0, then 82 × 161, 79 × 172 and **79 × 181** at f3 — 27 px
  taller and 8 px narrower than at rest. At f4 it is **161 × 125**: the widest the
  sack ever is anywhere in the corpus. (It gets shorter than 125 px elsewhere —
  106 px at `hello/f0029` — but never wider.)
- **The cape flies wider than the body.** At f0 the crimson spans the full width of
  the frame's subject box — x = 56 to x = 238, **183 px** — while the sack inside it
  is 87 px wide, and 2,907 crimson pixels are visible against 1,843 at rest. It
  streams out on both sides and *above*: its centroid sits **30 to 36 px above** the body's
  through the fall, which is the cape lagging on the axis the body is moving on
  (correlation between the cape's vertical offset and the body's vertical velocity is
  **−0.66**; on the 7 frames moving faster than 3 px/frame the cape is on the trailing
  side on 5).
- **The rebound is f5 → f8.** The sack goes 98 × 122, 90 × 131, 88 × 151 and back to
  87 × 146, and its base row settles onto **749** at f8 and never leaves it.
- **The body stops long before the shot does.** From **f9 to f20** — twelve frames,
  eleven sampling intervals, 0.917 s — the body's centroid walks **1.2 px in total**
  while the cape's centroid walks **16.0 px** (net 15.1). Nothing else on screen moves.
  The last two frames have **silhouettes identical at the 8/255 mask threshold** — they
  differ by 3 pixels at exact equality, so a verifier testing bit equality will not
  reproduce the word "identical" — and they are still not the same frame: **1,083
  pixels differ in colour at exact equality** (39 at 8/255), 1,076 of them inside the
  drawn region and 135 of those on its edge.
- It does not return: first frame to last, 16,807 pixels of the sack's silhouette
  differ, which is most of it — the sack starts **558 px** higher up.

### `hello` — 35 frames at 12 fps, duration **2.867 s** (86/30)

⚠️ **The duration is 2.867 s and the 12 fps frame count says 2.833.** 35 frames at
12 fps only bound it to `[2.7917, 2.8750)`; the 24 and 30 fps counts (70 and 87) cut
that to **`[2.8542, 2.8750)`**, and the one thirtieth of a second inside that window
is **86/30 = 2.8667**. No multiple of 1/24 fits at all — this shot is on a 30 fps
grid and not a 24 fps one. If you declare 2.833 you will be a frame short and every
timing measure will carry it.

The sack settles, draws itself up to full height, **leans away from where it is about
to go**, and then leaves across the shot to the right.

- **f0 → f3 — it dips.** The centroid drops 11 px (677.2 → 688.2, with the low point
  688.3 at f2) and the sack goes from 87 × 154 to **95 × 144** — a small squash, in
  place.
- **f4 → f13 — it rises and holds.** The sack's height climbs 149 → **161** and sits at
  160–161 for seven frames, f7 → f13 — the tallest settled pose in the corpus (the only
  taller sack with its feet near the ground is `cape-follow-example/f0020`, stretched
  mid-landing). The body's centroid walks **4.0 px** over those ten frames and only
  **0.6 px** over the f7 → f13 hold — and in the same ten frames the cape's
  centroid crosses **from 14.2 px left of the body to 8.7 px right of it**, one
  direction, no reversal. The body has all but stopped and the cloth has not.
- ⭐ **f13 → f17 — the anticipation.** The body's centroid moves **23.3 px to the
  left** (148.5 → 125.2) over four sampling intervals, 0.333 s. It crouches as it goes:
  the sack shortens 161 → **135** and widens 90 → **98**. The cape swings the *other*
  way, to +31.9 px right of the body at f15 — the extreme of its travel to that side in
  this shot (the largest excursion either way is −48.3 px at f21).
- ⭐ **f17 → f34 — and then it goes right, 803.7 px.** The centroid runs 125.2 →
  **928.9**, over 17 sampling intervals (1.417 s), which is **34 times the wind-up that
  preceded it**. Its longest single step is **128.7 px** of centroid travel, f30 → f31;
  the longest purely **horizontal** step is 85.2 px, f27 → f28.
- **It travels in three arcs.** The sack's base row over f19 → f34 reads 736, 702,
  693, 721, 737, 722, 662, 675, 714, 740, 740, 737, 622, 565, 578, 670: down onto
  ~740 twice, and three climbs, the last of them the highest (565 — 184 px above the
  standing base line).
- **The cape trails it the whole way.** Its horizontal offset flips negative at f20
  and stays between **−33 and −48 px** for every remaining frame. Correlation between
  the cape's horizontal offset and the body's horizontal velocity is **−0.81** at lag
  0 and **−0.86** at one frame of lag; on the 20 frames moving faster than 3 px/frame
  it is on the trailing side on **17**.
- ⚠️ **The drag is horizontal. It is not a 2-D lag.** On the vertical axis the same
  correlation is **−0.03**, and the cape is on the trailing side on 11 of 20 — a coin
  toss. A lag fitted to the speed instead of to each axis returns a third number that
  is true of neither. (This is rung 8's finding, and this shot reproduces it.)
- **It ends off to the right and in the air**: base row 670 against the 749 it started
  from, 783 px right of where it began.

### `walk` — 9 frames at 12 fps, duration **0.667 s** (20/30)

A cycle **on the spot**. The body's centroid spans **6.3 px** over the whole shot —
145.1 … 151.5, starting and ending at 145.2 — and its base row stays inside 737–741.
Nothing travels.

- **It rocks rather than steps.** The sack's silhouette width runs 104, 130, 114, 83,
  **73, 72, 73**, 85, 104 while its height stays 137–149: it leans hard one way,
  comes through narrow and upright in the middle, and leans back.
- ⭐ **The body loops and the cape does not.** First frame against last: the sack's
  silhouette differs by **198 px** of ~7,940 — **2.5 %**, a cycle that closes — while
  the cape's differs by **496 px** against its own 806 and 1,106 visible pixels, and
  it ends **37 % larger** than it started. Whatever drives the cloth is still
  unwinding when the body is back where it began. **This is the cleanest single
  statement of the rung in the corpus**, and it is the one shot where you can read it
  off two frames.
- ⚠️ **No drag figure for this shot.** Only one frame moves faster than 3 px/frame
  horizontally and two vertically (central differences, as everywhere below), so a
  correlation over nine frames here is noise.
  The numbers a lag estimator returns on `walk` are not evidence of anything; do not
  quote them, and do not read their disagreement with `hello` as a difference between
  the shots.

### `cape-follow-example` — 37 frames at 12 fps, duration **3.000 s** (90/30)

The same anticipation, larger, and then a full second of nothing moving but cloth.

- **f0 → f3 — the body is still and the cape is not.** The centroid moves 2.2 px; the
  cape's offset slides −1.6 → −9.1 px. The shot opens on a cape that has not finished
  from somewhere else.
- ⭐ **f3 → f11 — the wind-up, 35.8 px to the left** (148.2 → 112.4) over eight
  sampling intervals, 0.667 s. It sinks 9 px and spreads as it goes: the sack runs
  90 × 152 (f3) → 113 × 127 (f5) → **150 × 143** (f11), so it is crouching and leaning,
  not stepping.
- ⭐ **f7 → f13 — the cloth furls, and this is the hardest placement in the corpus.**
  The visible crimson falls monotonically over seven frames — **1,551, 1,414, 1,183,
  1,007, 920, 876, 782 px** — reaching at f13 the **least crimson anywhere in the 102
  frames** (against 1,846 at rest and 3,193 at `hello/f0034`). It is not shrinking so
  much as turning edge-on: across **f10 → f13** the crimson fills only **4.7–5.0 % of
  its own bounding box**, the thinnest in the corpus, against **12.1 %** at rest — at
  f12 that is **876 px spread through a 138 × 133 box**. A cloth this close to edge-on
  is a narrow band strung across a wide box, so its silhouette is dominated by the
  *angle* rather than the extent, and a couple of degrees moves it several pixels. Its
  centroid meanwhile crosses from **+2.5 px right of the body at f9 to −15.9 at f12**
  while sitting **26–28 px above** it. ⇒ **f11–f13 is where a cape placement drifts, and
  where to look first if yours does.**
- ⭐ **f11 → f21 — the leap, 238.0 px to the right** and 170 px up. The centroid runs
  112.4 → **350.4**; the apex is **f17**, where the sack's base row is **579** against
  the 749 it left. Its longest step is 97.7 px of centroid travel, f19 → f20; the
  longest purely **horizontal** step is 43.0 px, f13 → f14.
- **f13 → f14 throws the cloth open again**, 782 → **1,816 px**, +132 % in one frame —
  the sharpest opening in this shot, and the frame after the furl. (The corpus's largest
  single-frame crimson change is `hello` f19 → f20, 951 → 2,306, +1,355 px.)
- **It stretches into the leap and flattens out of it.** The sack measures **84 × 208**
  at f14 — the tallest it is anywhere in the corpus — and **112 × 204** at f20, and
  then **152 × 108** at f21, the landing frame. It is a plain teardrop in the air and a pancake on the ground.
- **The cape opens out above it.** At f20 the crimson covers 3,022 px, the most in this
  shot, and reaches **above** the sack's own top (its box starts at y = 527, the
  sack's at y = 535).
- ⭐ **f27 → f36 — the body has stopped and the cape has 0.75 s left to run.** The
  centroid is pinned at **345.3 ± 0.1** from f27 to the end, and at 345.2 ± 0.15 if you
  start at f25 (f25 itself reads 345.06). Over f27 → f36 the body's
  centroid walks **0.4 px in total** while the cape's walks **33.0 px** (net 31.6),
  and the cape's visible area falls **monotonically**: 2,003, 1,794, 1,643, 1,533,
  1,443, 1,365, 1,264, 1,186, 1,110, **1,055 px**. Ten frames, one direction, no
  overshoot — it furls and settles.
- **The cape trails on every moving frame.** On all **15** frames moving faster than
  3 px/frame horizontally, the cape sits on the far side of the body from its
  direction of travel — 15 of 15. The correlation is **−0.76**. Vertically, again,
  −0.31 and 7 of 16: **horizontal only**.
- It does not return: 199 px right of where it started, and 17,229 pixels of the
  sack's silhouette differ between the first frame and the last.

### The sack changes shape, and not by rotating

⭐ **This is the other half of the rung**, and it is provable off the frames without
any alignment or fitting.

A rigid drawing that is rotated and uniformly scaled by `s` obeys two things at once:
its silhouette's **diameter** — the farthest apart two of its pixels — is exactly `s`
times the art's, and its **area** is exactly `s²` times the art's. `sack.png` at the
frames' scale has a diameter of **164.7 px** and an area of **9,041 px**. And the only
thing that can hide part of the sack is the cape, because nothing else is drawn — so
the sack's *visible* area can fall below `9,041 s²` by at most the number of crimson
pixels on that frame, and no further.

**Seven frames break that budget**, by margins far past the few hundred pixels of
slack an edge threshold buys:

| Frame | sack diameter | ⇒ `s` | a rigid pose covers | crimson could hide | so ≥ this is visible | actually visible |
| --- | --- | --- | --- | --- | --- | --- |
| `cape-follow-example/f0014` | 208.0 px | 1.263 | 14,424 px | 1,750 px | **12,674 px** | **9,040 px** |
| `cape-follow-example/f0020` | 210.1 | 1.276 | 14,716 | 2,937 | 11,779 | 10,702 |
| `hello/f0027` | 189.4 | 1.151 | 11,968 | 2,039 | 9,929 | 8,113 |
| `hello/f0020` | 183.4 | 1.114 | 11,219 | 2,246 | 8,973 | 7,583 |
| `hello/f0021` | 183.1 | 1.112 | 11,175 | 2,385 | 8,790 | 7,478 |
| `fall-in/f0003` | 180.1 | 1.094 | 10,814 | 1,923 | 8,891 | 7,311 |
| `hello/f0019` | 167.4 | 1.017 | 9,344 | 866 | 8,478 | 7,937 |

The largest gap is 3,634 px — 40 % of what is on screen. ⇒ **the sack is not a rigid
image being posed.** At minimum it is stretched along one axis, and the frames the
table names are the ones to check a build against.

The test above rules out rotation with uniform scale, and a similarity invariant says
the same thing and no more: min-caliper-width ÷ diameter is **0.514** for the art and
runs **0.370–0.784** across the frames, so the shape is not a similarity copy of its
art — and a stretch is not a similarity either.

⭐ **And no affine placement reproduces it either, on any frame — so the sack needs a
deforming attachment.** This is worth stating exactly, because a Spine bone's local
transform *is* a general affine: translate, rotate, scale each axis, shear. So "is each
frame's sack silhouette an affine image of `sack.png`'s own?" is the same question as
"could one bone placing one region draw this?", and the answer the frames give is no.

- **Estimator.** Whiten both silhouettes — centre them, then normalise the
  second-moment matrix to identity — which quotients out every affine *except* rotation
  and reflection, then search those exhaustively (2° steps, both reflections) and keep
  the best IoU. Residual = 1 − that IoU.
- **Controls, through the identical code.** A pure affine must read as the floor and
  does: the art at a non-uniform scale 1.6 × 1 reads **0.017–0.020**, and the art
  rotated 90° reads **0.023–0.032**. A *real* deformation must read clearly above it and
  does: the art with its top third slid 20 % of its width reads **0.078–0.080**.
- **The frames.** Best **0.095–0.122**, mean **0.17–0.19**, worst **0.29–0.31**
  (`fall-in/f0004`). **Not one of the 102 frames reads below the bend control** — the
  most affine-like frame in the corpus is still further from affine than a deliberate
  20 % bend, and four to six times the pure-affine floor.
- 🔍 **Convention, and why the ranges are ranges.** The figures are quoted across grid
  resolutions **48, 64 and 96**, and the spread above is that sweep rather than
  measurement noise; the verdict is identical at all three. ⚠️ **The control has to match
  the subject's point density or it measures point count instead of shape** — warping the
  art at *art* resolution (~250,000 pixels) and comparing it against frame masks of
  ~8,400 left the controls flat while the frames' residuals more than doubled from grid
  96 to 192. The art is resampled to the frames' own scale first, so every mask compared
  here carries ~8,400–9,000 points.

⚠️ **What this still does not settle is how much deformation, or how.** Ruling out one
affine does not tell you how many bones, how many vertices, or where the weights go, and
those are yours. Say in the log which you built.

### The comparison, in one line

A caped sack that drops in, waddles, and twice winds up in the wrong direction before
throwing itself across the shot — with a cloth that is always a beat behind it and
still moving after it has stopped.

## What the frames cannot tell you

Stated so that the verifying pass does not have to rediscover it, and so that a run
does not spend a turn on it.

- **Whether the cloth is simulated, driven, or keyed by hand.** All the frames show is
  that it lags on entry, trails horizontally while the body travels, overshoots
  nothing on the way out, and settles monotonically over up to 0.75 s after the body
  has stopped. Every one of those is a behaviour, not a mechanism.
- ⚠️ **Whether either cape part deforms at all** — and unlike the sack, this one the
  frames genuinely cannot reach. The affine test that settles the sack needs a
  silhouette belonging to **one** part, and the two cape images are both crimson with
  `g == b` on every pixel, so no colour split separates the collar from the panel and
  the crimson silhouette is a union of two things. A region that translates, turns and
  scales and a mesh that deforms can also draw the same pixels. **Do not read the sack's
  verdict across to the cape**, in either direction: it is not evidence that the cape
  deforms, and it is not evidence that it does not.
- **Whether the cape's panel is one piece or several.** Its visible crimson breaks
  into dozens of fragments under a colour split, and every one of those breaks is at
  a boundary where crimson blends into beige — an artefact of the split, not a seam.
  Nothing here supports a count.
- **Draw order beyond the two edges above.** Both are now settled by measurement — the
  collar in front of the sack, the panel behind it — and neither is a guess. What the
  frames say nothing about is any *further* ordering: if you build the panel as more
  than one piece, how those pieces sit relative to each other is yours.
- **The sack's own internal structure.** Its knots and feet move relative to its body,
  which is visible; how many joints that takes is not.
- **Anything inside the first 0.25 s of `fall-in`.** Four samples over 560 px.
- **Where the ground is.** Nothing is drawn there. The base row the sack rests on is
  **749** in three shots and 737–741 in `walk`, which is the only evidence a ground
  plane exists at all.

## How the result is read

`bench 7` does two things and does not merge them:

1. **Validity** — `validate --profile spine` on your candidate. This is the only
   pass/fail. A candidate that is not valid Spine 4.3 has not cleared anything.
2. **Structural diff** — a ratio per measure against the reference export, in six
   sections. **There is no rung score**, on purpose: a rig with the right skeleton and
   the wrong timing and a rig with the right timing and the wrong skeleton call for
   opposite fixes. A person reads the measures and records the judgement in
   [docs/LADDER.md](../../docs/LADDER.md).

So do not tune toward a number. Author the shot, get the gate green, and let the
measures say where it landed.

`check` **does** work on this rung — the rasteriser draws parts that change shape —
but you must hand it the frames explicitly, `--frames bench/reference-local/7-anticipation`,
because they are not where every other rung's are. It never opens the reference
skeleton, so run it in the loop as often as you like.

## Deliverables

See [`bench/runs/README.md`](../runs/README.md) for the run protocol — where the
output goes, what has to be recorded, and what you must not read. Read
[docs/AUTHORING.md](../../docs/AUTHORING.md) first, **including §8**, which is about
measuring reference frames and was written from the mistakes the first ladder run made
doing exactly that. Two of this brief's own estimators are fresh instances of §8's
rule — one shipped only after its control caught a 12 px error in the sack's width,
and one was thrown away because its control could not tell a rotation from a squash.
**Score your estimator against a shape you built out of the art itself, and against a
transform whose answer you already know, before you believe a number it gives you.**
