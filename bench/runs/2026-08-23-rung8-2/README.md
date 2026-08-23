# Rung 8 — attempt 2, the `ball` skeleton

- date:        2026-08-23 (finished 2026-08-24)
- agent:       Claude Opus 5 (1M context), Claude Code / Agent SDK
- inputs:      `bench/briefs/8-follow-through.md` (revision 2, third-party verified),
               `bench/reference/8-follow-through/ball/` (45 frames @ 12 fps, 88 @ 24 fps,
               both contact sheets, `frames.json`), `examples/8-follow-through/images/`,
               `docs/AUTHORING.md` in full, `bench/runs/README.md`, this repository's `src/`
- reference:   **not read.** No `examples/*/export/*.json`, no `bench/transcriptions/`, no
               `docs/LADDER.md` status table or per-rung section, no `docs/SPEC_COVERAGE.md`,
               no `src/ladder.ts` gate strings, no `bench/render_reference.ts`, no git history,
               and **not** `bench/runs/2026-08-23-rung8-1/`. One leak arrived through a document
               this run was required to read — see *Honesty* below and `LOOP.md` §1.
- guide:       AUTHORING.md §10 in hand (this run is after 2026-08-23)
- profile:     spine
- iterations:  9 build turns, ~40 `check`-equivalent render comparisons in the loop
- clean:       **yes** — `bench` was run once, at the end, and nothing was edited after it
- atlas:       not used; rigc emits its own one-part-per-page atlas from the loose PNGs

⚠️ **This attempt is the `ball` candidate only.** The rung ships two skeletons and
`bench 8` prints a line for each whichever candidate it is given, so **the `pendulum`
line in `bench.json` is noise** — it is what a comet rig scores against a pendulum
export — and it is not quoted anywhere in this record. `pendulum` was cleared on
attempt 1 and is not re-authored here.

## The measures — the `ball` line, verbatim

```
  ── summary ──
  validate   green  (profile spine)
  ball       bones=0.448  slots=0.929  attachments=0.667  constraints=0.000  animations=0.876  events=1.000
             bones 0.448 (name-matched) · 0.517 (name-agnostic)   slots 0.929 (name-matched) · 0.750 (name-agnostic)
```

Section detail, from `bench.json`:

| section | measure | ratio | |
| --- | --- | ---: | --- |
| bones | count | 0.667 | 8 against 12 |
| | names · parent_by_name · order | 0.333 · 0.250 · 0.417 | 5 names in common |
| | depth_histogram · degree_sequence | 0.583 · 0.583 | |
| slots | count · names · order · attachment · blend · color_present | **1.000** each | |
| | bone | 0.500 | one slot hangs off a bone whose name differs |
| attachments | skins · count · names · type_counts · **mesh_weighted** | **1.000** each | both parts are weighted meshes on both sides |
| | mesh_vertices · mesh_triangles · mesh_hull | 0.000 | my topology is my own |
| constraints | all five | 0.000 | the reference carries **4**; this rig authors none |
| animations | count · names · duration · draw_order · deform | **1.000** each | |
| | timeline_kinds | 0.600 | 6 of the reference's 10 |
| | key_counts | 0.589 | 307 of 521 |
| | curve_kinds | 0.691 | 360 of 521 |

`check`, run in the loop and again on the shipped build (`ball/check.txt`), against
both frame sets of `bench/reference/8-follow-through/ball`:

| set | frames | framing | MAE mean | MAE worst | worst slot drift | per-frame |
| --- | ---: | --- | ---: | --- | ---: | --- |
| `follow-through` | 45 @ 12 fps | `frames.json`'s own box | **17.26** | 35.25 at f0015 | 4.2 px (`ball`, f0042) | all 44 pairs agree |
| `follow-through@24fps` | 88 @ 24 fps | `frames.json`'s own box | **18.00** | 40.64 at f0031 | 4.2 px (`ball`, f0077) | all 87 pairs agree |

Both sets took the frames' **own** world box rather than a fit, because the rig is
authored in the coordinates `frames.json` records — so those MAE figures carry none of
the fit's own floor (§9.2).

## What was built

Eight bones, two slots, two weighted meshes, no constraints, one animation.

```
root
└ comet          the travelling body: translate only, no art
  ├ ball         rotate + scale; carries the ball mesh
  └ tail1..tail5 rotate only; carry the trail mesh between them
```

- **`ball.png` is a 4 × 4 grid mesh, weighted 1.0 to the `ball` bone.** The squash is
  a pure affine of the whole disc, so a bone scale does all of it and no vertex needs
  to move on its own. **The frames cannot decide mesh against region here** — a scaled
  region draws the same pixels (§9.3) — and this run did not decide it from the frames:
  `docs/AUTHORING.md` §9.3 states outright that the rung-8 reference builds this
  silhouette as a mesh, and that is where the choice came from. Recorded as a leak,
  not as a measurement. (`bench` says both sides are weighted meshes: 1.000.)
- **`tail.png` is a two-wide strip across 5 chain bones**, 11 cross rows, both vertices
  of a row carrying identical weights so the strip can only rotate and never changes
  width. The frames **do** decide this one: the trail curls right over the ball on
  f0026–f0027 and a rigid region cannot do that at any rotation.
- **The trail is the art at its own size, 1 world unit per art pixel, both ways** —
  measured, not assumed: its two silver bands land at 13.0 / 20.5 / 27.0 px from the
  sharp tip along its own centre line on all 88 frames, and dividing by the art's own
  band fractions gives 55 ± 1.5 px against the 54.24 px `tail.png` renders unscaled.
  A width sweep agrees (1.0 best, 0.95 and 1.05 both worse).
- **The trail's blunt end sits 48 units *inside* the ball** (6.9 px, about ⅔ of the
  ball's radius), so the chain pivots at the ball's centre while the art starts behind
  its rim. That offset is the single largest fidelity lever found in the run: sweeping
  it alone, with everything else fixed, reads 0 → 2.70, −31 → 2.14, **−48 → 1.86**,
  −55 → 2.00, −77 → 2.97, −99 → 4.11 in mean window residual, and frame 0 alone went
  4.96 → 1.35.
- **The ball's bone stays roughly upright and the squash is carried by its scale.**
  The pixels decide this, because `ball.png` has a pale cap that is not rotationally
  symmetric: on every frame with a decisive aspect, the representation with |rotation|
  ≤ 45° beat the one rotated to the ellipse's own axis (f23 4.68 against 6.14, f30 4.59
  against 6.35, f49 2.36 against 3.65), and on the two frames whose ellipse is already
  near-level the as-measured one won (f26 1.47 against 2.99, f40 1.68 against 3.30).
- **Draw order: trail behind ball, and the frames do not decide it.** Rendered
  like-for-like (§8), trail-behind reads 2.4626 and ball-behind 2.4862 over the same
  eight frames — 1 %, inside the objective's own scatter, which is *no answer*. Shipped
  on reasoning: the head of a comet reads as its front. The brief says the same thing.
- **No constraints.** Nothing in the frames can see one, so none is authored. `bench`
  reports the reference carries four; that gap is real and it is not something these
  pixels could have taught. See *Known-wrong*.

## Timing and keys

Duration **3.6333 s** (109 frames at 30 fps) — the brief's own reading of the only
value on a project grid inside the 3.625 ≤ d < 3.646 s window the two frame sets pin.
The last key sits at 87/24 s; `A09` and `animations.duration` both accept that.

Key times are on the 24 fps sample grid, written as exact fractions and left for the
compiler to quantise (§4.5). One tolerance, **0.3 px measured at each bone's own lever
arm**, converted per bone (§10.3): 1 unit of translation is 0.1428 px, a degree on
`ball` is 0.194 px at its rim, a degree on `tail1` is 1.066 px at the trail's tip and
on `tail5` 0.213 px. That gives 521 keys over 8 timelines; the residual it buys is
0.283–0.299 px on every timeline, i.e. the tolerance is the binding constraint
everywhere.

The trade, measured end to end rather than argued:

| tolerance | keys | MAE 12 fps | MAE 24 fps |
| ---: | ---: | ---: | ---: |
| 0.6 px | 439 | 18.22 | 19.19 |
| 0.45 px | 482 | 17.54 | 18.38 |
| **0.3 px** | **521** | **17.26** | **18.00** |

⚠️ **This shot cannot be keyed sparsely at 24 fps and the reason is arithmetic, not
taste.** The median frame-to-frame *acceleration* of the ball is 6.4 px, so a linear
span across a single skipped sample already deviates by about 1.6 px — five times the
tolerance. Any tolerance under about 1.5 px keys nearly every frame.

**Paired `translate`/`scale`, not the separate axes.** §10.3's default is both axes on
one key and this shot does not overturn it: planning `translatex`/`translatey` and
`scalex`/`scaley` separately produced **more** keys, not fewer (486 against 439 at
0.6 px; 616 against 521 at 0.3 px), because each axis then pays for its own key
wherever the other one turns.

**Curves: an eight-shape `easings` table, in hand while the keys were chosen.** Pass A
plans every timeline against a 401-shape library purely to discover which shapes the
shot uses; those are clustered into eight named entries; pass B re-plans **every**
timeline under that table (§10.4 — never fit free handles and snap afterwards). 460 of
521 keys are bezier, 61 linear, 0 stepped. Where a span is a single frame the samples
cannot constrain its shape at all, so those keys take **Spine's own automatic handles**
— the tangents implied by the keys either side — snapped to the nearest table entry,
rather than the straight line a "no information" default would have written. That
choice moves nothing at the samples (MAE 17.34 → 17.26) and everything in
`curve_kinds`.

## Frame-fidelity self-check

Beyond `check`: every pose in this rig was *fitted by rendering the candidate itself*
into the reference frames' own pixel grid with the same rasteriser that drew them, and
the shipped animation was rendered back and compared to those fitted poses. Keying costs
**+0.052** of mean window residual out of 1.76 — 3 % — so what remains is the rig and
the fit, not the key reduction.

Two independent estimators agree where they can both speak. The ball's centre and axes,
measured off the frames with a neck cut chosen by ellipse fill, reproduce the brief's
third-party figures without either side seeing the other: x = 83.3–83.5 on f0–f3
(brief: 83), (273.2, 254.9) at f18 (brief: y = 254.9), (332.1, 384.4) / (332.3, 385.1) /
(332.1, 385.0) on f26–f28 (brief: inside 0.5 px of (332.7, 384.8)), y = 33.2 at f45
(brief: 33), aspect 2.92 / 3.19 / 2.99 on f26–f28 (brief: 2.7 / 3.0 / 2.9, under-read
above 2.1 by its own control), aspect 2.75 at +3.3° on f40 (brief: 2.6 at +3°).

`check`'s per-frame column reports **all 44 and all 87 adjacent pairs changing by as
much as the reference's own frames do** — no held pose that is not held, no one-frame
event that never fires.

## Known-wrong

1. **No constraints, and the reference has four.** Nothing in a rendered frame can show
   a constraint — a physics chain and a hand-keyed chain draw identical pixels — so this
   rig authors none and says so rather than guessing a family, a target and five tuning
   numbers. It costs the whole `constraints` section (0.000). If the trail is driven by
   physics in the reference, then so is a large part of what this run spent its time
   fitting frame by frame.
2. **Eight bones against twelve.** Five names are shared. The four missing are most
   likely the other end of finding 1.
3. **Mesh topology is invented** (`mesh_vertices`, `mesh_triangles`, `mesh_hull` all
   0.000). A 4 × 4 grid over the ball and a 2 × 11 strip over the trail are one
   reasonable way to mesh those two images; the frames cannot see any of it.
4. **MAE 17–18 is the structural floor of this rig, not the fit's noise.** The residual
   concentrates on the trail's cross-section: on the strongly bent frames the reference's
   trail reads about 12 px wide where `tail.png` at its own scale renders 9, and the
   width profiles diverge in the same place on every such frame. Something about how the
   reference's mesh maps the art along its length differs from a uniform strip; this run
   could not resolve what, and left the strip uniform rather than tuning a profile it
   could not justify.
5. **`f0030` and `f0023` carry poses the frames cannot verify.** The brief says both
   frames have no neck and so no ball to measure; this run's estimator agrees it is
   unreliable there, and those two poses come from the pixel fit alone with no second
   opinion. f0031 is the worst frame in the shot at MAE 40.64.
6. **Nothing between the 24 fps samples is authored from evidence.** Key times sit on
   that grid because it is the finest thing the frames show; the true export may key
   between them.

## Notes for the guide

- **§9.3's rung-8 bullet leaks the answer it is warning about.** It names this rung's
  reference structure (mesh, not region), the previous attempt's outcome and which
  section it cost. A run is required to read AUTHORING.md in full, so that fact cannot
  be avoided. The bullet's *argument* — write down which way you went and why, at the
  moment you decide it — survives without the example; the example should be de-named
  the way §3.6's was after the spineboy run.
- **§10.3's "one tolerance in pixels at the lever arm" needs a companion sentence about
  what the shot's own speed does to it.** The rule is right and this run used it, but on
  a subject whose median frame-to-frame acceleration is 6.4 px, *every* tolerance under
  about 1.5 px produces near-every-frame keying, and the resulting density is a fact
  about the shot rather than a choice by the author. A guide that says "the editor's key
  density is the target" and gives no way to reach it leaves the author with a knob that
  is pinned by arithmetic. Worth stating: compute what a skipped sample costs before
  choosing the tolerance.
- **§10.4 needs the one-frame-span case spelled out.** When keys are adjacent, no shape
  is constrained by the samples, and a planner that has nothing to fit will write linear
  — which is exactly the shape §10.4 says to argue for rather than default to. The
  editor's own answer is on the same page (automatic handles from the neighbouring
  keys); saying so would have saved this run a rebuild and is worth a line, because the
  effect on `curve_kinds` is large and the effect on the rendered frames is nil.
- **§8's "render your own candidate both ways" deserves its own paragraph on the null
  result.** It has one, and it was load-bearing here: three separate structural sweeps
  in this run (trail scale, trail width, draw order) produced spreads inside their own
  scatter, and reading any of them as a winner would have shipped a wrong number with a
  measurement's authority. The sentence that saved it — *"a difference that small is not
  a quiet vote for the winner"* — could be promoted out of the paragraph it is buried in.
- **A note on estimators that the brief has and the guide does not.** The brief's
  acceptance test for its ball/trail split — keep the cut whose ball piece best fills
  its own ellipse — is what made a geometric seed possible here, and it is a general
  trick (score a segmentation by how well each piece matches the shape it claims to be)
  that §8 could carry beside its three traps.
