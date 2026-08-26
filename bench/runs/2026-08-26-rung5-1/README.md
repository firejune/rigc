# Rung 5 — attempt of 2026-08-26

- date:      2026-08-26
- agent:     Claude Opus 5 (1M context), Claude Code / Agent SDK
- brief:     [`5-squash-and-stretch.md`](../../briefs/5-squash-and-stretch.md) **revision 3**
             (third-party verified, 2026-08-26) — this is the first attempt at this rung
             authored from the corrected text
- inputs:    the brief; [AUTHORING.md](../../../docs/AUTHORING.md) in full, §8, §9 and §10
             included; `examples/5-squash-and-stretch/images/`;
             `bench/reference/5-squash-and-stretch/` frames, contact sheets and
             `frames.json`; that example's `.atlas`; this repository's `src/` and `tools/`
             as documentation of the formats and of the rasteriser
- reference: **not read**
- guide:     AUTHORING.md §10 in hand
- profile:   spine
- builds:    10
- bench:     run **once**, at the end, after the last edit — this is a clean run, not
             bench-assisted

The previous attempt at this rung was authored from revision 2. Revision 3 moved the
girder from above the right-hand block to above the right-hand spike bed, added the
route's last leg, corrected the set's pixel count and the stretched height, and said
outright that `ball-ready-to-animate` is not "nothing keyed". Three of those five
decide geometry this run had to place, so its figures are not comparable with that
attempt's and no comparison with it is drawn here — its README and its spec were not
opened, per *What a run may read*.

## Honesty-rule record

The prompt that started this run named **`docs/LADDER.md`'s *Operating rules*** and
**issue #18**, both of which the protocol's forbidden table seals — the first because
it is where gate v2's thresholds live and it derives them by quoting previous runs'
measures, the second because it is one of the per-rung issues. The prompt's own first
ground rule said the repository outranks it, so neither was opened: `docs/LADDER.md`
was read only across *How a rung is scored* and *The honesty rule*, and issue #18 was
never viewed (the result comment was posted with `gh issue comment`, which does not
read the thread). **This run therefore does not know gate v2's clause list or any of
its numbers.** `LOOP.md` §1 records what did reach it and from where.

`bench`'s console prints the rung's gate string by design (issue #137 took it out of
`bench.json` and left it on the console for the reader). It appeared at the finish
line, after the last edit; nothing was changed afterwards, and **it is not quoted in
any file this run commits**, which is the whole point of that fix.

## What was built

One skeleton, three animations, from 29 loose PNGs and no supplied atlas.

- **14 bones.** `root`; `course` and `ball` under it; `torso` as the character's hip,
  also under root; `head`, `belt-ends`, `left-hand`, `right-hand`, `left-foot`,
  `right-foot` under `torso`; `hair-1`, `hair-2`, `hood-end1`, `hood-end2` under `head`.
  Bones sit at joints and carry their art out on an attachment offset, so a rotation
  is observable rather than a gauge (§10.3).
- **13 slots, 29 attachments.** One attachment per PNG. Nine slots hold one drawing;
  four are the swap sets the brief points at — `hood-end1` and `hood-end2` with six
  drawings each, `left-foot` and `right-foot` with four — folded into one slot apiece
  per §10.1's *"a shared slot is for alternatives, not for economy"*. The two hair files
  got **a slot each**: two colours read as two tufts on screen together rather than as
  alternates of one, and §10.1's default is a slot per image absent evidence of a swap.
  The brief says the frames cannot settle it and this run did not pretend otherwise.
- **Draw order** puts `course` last — the set in front of everything. Decided by
  measurement, not by the brief alone; see *Draw order* below.
- **The course is one region at attachment scale 2**, on a bone at (0, 821). Everything
  else is at scale 1.
- **Authored in the frames' own coordinates.** `frames.json` publishes the viewport, so
  the rig was written in those world units from the start. All six sets consequently
  took `frames.json`'s own box rather than a fitted one, which is exact where a fit is
  an estimate.

Animations, all three sharing the one skeleton:

| animation | duration | tracks | keys | what it does |
| --- | --- | --- | --- | --- |
| `ball` | 6.5 s | 13 | 156 | the ball's `translate` (76) and `scale` (69); 11 attachment keys hide the character |
| `speedy` | 6.5 s | 17 | 870 | `torso` translate (77) and 11 bone `rotate` tracks (57–71 each); 4 attachment tracks swap the hood tips and feet (18/23/9/23); 1 hides the ball |
| `ball-ready-to-animate` | 0 s | 11 | 11 | the 11 attachment keys that take the character off screen |

The setup pose carries the whole rig — course, ball and character — and each animation
keys what it needs off it. That is what revision 3's *"`ball-ready-to-animate` is not
'nothing keyed'"* asks for: the frames cannot see a setup pose, so the brief is the only
evidence about it, and it says an empty animation will not produce that frame from a
skeleton that has to carry the character for `speedy`.

## The measures

`bun cli.ts bench 5 --candidate … --json bench.json`, verbatim:

```
validate   green  (profile spine)
ess        bones=0.402  slots=0.356  attachments=0.897  constraints=1.000  animations=0.763  events=1.000
           bones 0.402 (name-matched) · 0.563 (name-agnostic)   slots 0.356 (name-matched) · 0.692 (name-agnostic)
```

The measures underneath, for the sections that moved:

```
attachments  count 29/29 · type_counts 29/29 · region_size 29/29 · skins 1/1 · names 4/54
animations   count 3/3 · names 3/3 · duration 3/3 · deform 3/3 · event_keys 0/0
             timeline_kinds 38/67 · key_counts 880/2038 · curve_kinds 414/2038 · draw_order 2/3
slots        count 13/13 (and name-agnostic attachment_types_by_position 13/13)
constraints  1.000 across all five — neither side has any
events       1.000 across both — neither side has any
```

`bun cli.ts check --candidate … --frames bench/reference/5-squash-and-stretch`. Every
set was measured in **`frames.json`'s own box** (`rms` 0.14–0.23 px, and the MAE-refined
pass found the identity on all six, so no part of any set's figure is a constant offset):

| set | MAE mean / worst | worst slot drift | per-frame change | sheet mean / worst |
| --- | --- | --- | --- | --- |
| `ball` | **4.30** / 4.42 f0056 | 1.3 px `course` f0000 | **all 78 pairs agree** | — |
| `ball-ready-to-animate` | 4.29 / 4.29 | 1.3 px `course` | n/a — 1 frame | — |
| `ball-ready-to-animate@24fps` | 4.29 / 4.29 | 1.3 px `course` | n/a — 1 frame | — |
| `ball@24fps` | 4.29 / 4.29 | 1.3 px `course` | n/a — stills | **5.80** / 6.27 f0125 |
| `speedy` | **5.52** / 6.02 f0041 | **5.1 px** `hood-end1` f0023 | **all 78 pairs agree** | — |
| `speedy@24fps` | 5.48 / 5.63 | 2.2 px `head` f0156 | n/a — stills | **7.38** / 8.71 f0021 |

The chain rollup across every set:

```
course      1.3 px "course"      in ball/f0000       mean 0.9 px   MAE in it  4.32   share 89.3%
torso       2.2 px "torso"       in speedy/f0016     mean 0.6 px              53.49         4.3%
right-hand  3.5 px "right-hand"  in speedy/f0015     mean 1.2 px              63.55         0.9%
right-foot  4.1 px "right-foot"  in speedy/f0066     mean 1.4 px              55.27         0.8%
belt-ends   3.9 px "belt-ends"   in speedy/f0022     mean 1.2 px              82.61         0.7%
left-hand   1.3 px "left-hand"   in speedy/f0009     mean 0.4 px              80.01         0.7%
hair-1      3.1 px "hair-1"      in speedy/f0063     mean 0.7 px              65.32         0.7%
hood-end2   4.4 px "hood-end2"   in speedy/f0014     mean 1.4 px              82.93         0.7%
left-foot   3.0 px "left-foot"   in speedy/f0010     mean 0.7 px              62.57         0.6%
hair-2      3.2 px "hair-2"      in speedy/f0033     mean 1.4 px              92.09         0.5%
hood-end1   5.1 px "hood-end1"   in speedy/f0023     mean 1.5 px              68.20         0.4%
ball        0.7 px "ball"        in ball/f0056       mean 0.1 px               6.24         0.2%
```

## The reading

**The frame-change measure is clean on both shots that can carry it: 78 of 78 pairs on
`ball`, 78 of 78 on `speedy`.** That is the row this attempt was built to hold, and it
was held by treating the reference's own `Δ` series as a *constraint on the fit* rather
than as something to inspect afterwards — the six pairs where `ball` is bit-identical
have their pose **copied**, not fitted to be close, and every other frame is required
to render differently from its predecessor. Measuring the reference's series at
`check`'s own tolerance was load-bearing: at exact equality the holds read one frame
short at both ends, and a run that "corrected" the brief on that reading would have
authored the wrong shot and been unable to see it (`LOOP.md` §2).

**The course residual is a floor, and it is most of the MAE.** ~1,100 static pixels
disagree because the reference frames were drawn from the example's packed atlas, which
declares `scale: 0.5`, while a candidate built from the loose PNGs samples the art at
full resolution. Two bilinear point-samples at different source resolutions do not
agree. It costs MAE (the course carries 89.3 % of the difference at 4.32 per pixel — the
lowest figure per pixel in the table) and it costs the change measure nothing, because a
static difference cannot move `Δpx`. The 4.30 on `ball` is very nearly all of it.

**Squash and stretch came out of measurement, not assumption.** Strongest stretches at
f10 (0.575 x 1.400), f50 (0.675 x 1.375) and f25 (0.675 x 1.250); strongest squashes at
f26 (1.375 x 0.650) and f49 (1.300 x 0.625); products 0.80–0.89, so near volume-
preserving. It is **axis-aligned rather than along travel** — f57 moves up-left at 45°
and its silhouette reads 4x5, not diagonal — which is what let the whole shot run on
`scale` keys with no rotation on the ball at all.

**The character's weakest number is `hood-end1` at 5.1 px, and it is a limit of the
evidence rather than an unattacked defect.** The figure is 16 px tall (26 stretched) with
~90 px of ink over eleven parts, and the trailing hood tips have the longest lever arms,
so they are the parts a composite objective constrains least. The fit already carries a
distance-transform penalty that keeps every posed part's centre within 2 px of reference
character ink — that alone took the worst drift from 6.2 px to 5.1 px. A further variant
that tightened the penalty on the five trailing parts moved MAE by 0.01 and moved drift
the **wrong** way (5.1 → 5.6 px, and 2.2 → 4.4 px on `speedy@24fps`); two builds pointing
opposite ways on different rows is §8's null result, so it was dropped and the earlier
variant reproduced to the digit.

**Both sheets are flat, with the spikes where the physics is.** `ball@24fps` reads
5.80 mean against a 6.27 worst (1.08x) and `speedy@24fps` 7.38 against 8.71 (1.18x).
The worst `ball` tile is f0125, which is the 24 fps sample between 12 fps frames 62 and
63 — the turn at the bottom of the girder, i.e. the one moment in the shot where a
half-frame of linear-in-between is least like the real path. Nothing is keyed at 24 fps
here: the committed 24 fps material is a half-scale sheet plus two stills, so the
in-betweens are the interpolation the 12 fps keys imply, and a spike at a direction
reversal is what that costs.

**Key density is a fact about this subject.** §10.3's arithmetic was done before the
tolerance was declared: the ball's fitted `y` series has a median frame-to-frame second
difference of ≈40 world units, so skipping one sample deviates ≈1.1 px — larger than any
tolerance worth declaring. So the ball keys at nearly every sample and no tolerance below
1.1 px would change that. `key_counts` reads 880/2038, so **the reference is denser
still**, roughly 2.3x; `curve_kinds` at 414/2038 says the same thing about shapes. The
8-entry `easings` table was built the way §10.4 requires — pass A discovers, the table
clusters, pass B re-plans every timeline under the table it will actually write — but a
table that small over a shot this dense is a coarse instrument, and this is where it
shows.

### Draw order

The brief says the set is in front and offers ≤6 pixels a frame as the evidence, so it
was tested as §8 prescribes: render both orders, score **only the pixels where the two
renders differ**, and read the per-frame tally beside the total. Both orders came off the
same built candidate by reordering the piece list, so nothing but the edge changed.

```
speedy: 34 deciding pixels over 79 frames    set behind 5637   set in front 1561
                                             per-frame: in front 16, behind 1, tie 0
ball:    5 deciding pixels over 79 frames    set behind  428   set in front  357
                                             per-frame: in front 1, behind 1, tie 0
```

**The character's edge is decided** — 3.6x on the deciding pixels with a 16-to-1 tally is
not inside anybody's scatter — and it confirms the brief. **The ball's edge is not**: five
pixels in the whole shot and a 1-1 tally is §8's *no answer*. The ball is behind the
course on the reasoning that one backdrop is in front of everything or of nothing. That
is an argument and it is recorded as one.

## Known-wrong, and what was not checkable

- **`hood-end1` reads 5.1 px of drift at `speedy`/f0023.** Named above; the frames did
  not give a way to attack it.
- **`speedy@24fps` cannot attribute `hair-1`, `hood-end1` or `hood-end2`** at its two
  committed stills — the reference merges them into the body there. A blank is the
  loudest row in a chain table (§8.1) and these are read as unattributable rather than
  as clean.
- **The character's internal hierarchy is not measurable at this scale** and is not
  claimed to be right. Eleven parts over ~90 px of ink cannot decide a bone tree; what
  was fitted is each part's placement and spin, and the tree is the one §10.1's naming
  rule implies.
- **`bones` and `slots` name-matched read 0.402 and 0.356, and `attachments.names`
  4/54.** The art here *is* named after the parts, so §10.1's largest lever was applied
  deliberately — PNG basename to slot to attachment to the bone that moves it — and the
  reference evidently uses its own vocabulary anyway. The name-agnostic figures (0.563
  and 0.692) are the ones that say anything about the build.
- **`animations.draw_order` reads 2/3**, so exactly one animation disagrees about
  whether a draw-order timeline exists; this candidate has none in any animation.
  Observed at the finish line, after the last edit, and deliberately not acted on.
- **`bones.length_present` is a coin flip taken deliberately**: the eleven character
  bones state a `length` and `root`, `course` and `ball` do not, on the reading that an
  editor-drawn skeleton has lengths and a bone created by dragging an image in does not.
  Nothing in the frames can check it.
- **The three holds and the four near-still pairs are the only timing this run can
  claim to the frame.** What happens between two committed 12 fps frames is checked only
  by a half-scale sheet.

## What the guide should have said

Five items, in `LOOP.md`'s *Notes*. The one worth lifting here:

🚨 **A stepped key on a sample time that is already on the 1e-6 grid can be missed
entirely.** §4.5 explains why rigc quantises key times *downwards*, and that rule
protects a key at `2/12`. It does nothing for `0.25`, `0.5`, … `6.5`: the key is already
on the grid, so it is left where it is, while `sampleAnimation` reaches sample *i* by
accumulating `1/12` *i* times and can land a few ULPs **below** it. For an interpolated
timeline that is a few ULPs of value; for a **stepped** one — and an attachment timeline
always is — it is a whole frame late, or at the last sample never. Enumerated over this
shot, **13 of the 78 sample times are affected** (f6, f15, f18, f21, f24, f27, f60, f63,
f66, f69, f72, f75, f78 — every `i/12` landing on a multiple of 0.25 s). It cost this run
three builds chasing a frame-change disagreement that the pose series had already fixed.
The fix is one line: for a stepped timeline write `T(i) − 1e-6`. One grid step early
cannot reach the previous sample, 83,333 µs away; one ULP late loses the frame.
