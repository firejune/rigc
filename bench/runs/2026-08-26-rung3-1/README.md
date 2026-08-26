# Rung 3, attempt 1 of 2026-08-26 — `3-timing-and-spacing`

- date:      2026-08-26
- agent:     Claude Opus 5 (1M context), Claude Code / Agent SDK
- brief:     [`3-timing-and-spacing.md`](../../briefs/3-timing-and-spacing.md)
             **revision 2**, third-party verified 2026-08-26 — the first attempt at
             this rung authored from a verified brief
- reference: **not read.** `examples/3-timing-and-spacing/export/*.json` was never
             opened. The example `.atlas` (allowed list item 4) was opened once,
             after the last spec edit, as a diagnostic — see *The atlas floor*
- guide:     AUTHORING.md §10 in hand
- profile:   spine
- loop:      13 builds · 14 `check` runs · `bench` twice, the first void
             ([`LOOP.md`](LOOP.md) *Result*)
- clean run: yes — every spec edit was made against `build`'s report and `check`'s
             table. `bench` was reached once with a decision behind it, and nothing
             was edited after it

## Why this attempt exists

The candidate stored for this rung fails gate v1/v2's **frame-change** clause: its
adjacent-pair changes disagree with the reference's. This is a fresh authoring pass at
the same rung from the corrected brief, aimed at every clause rather than that one.

**This run cannot report a clause-by-clause gate verdict.** Gate v2's clauses live in
`docs/LADDER.md` *Operating rules*, which the protocol's forbidden table seals from an
authoring run, so it was not opened ([`LOOP.md`](LOOP.md) §1). What is below is the
measures; the adjudication is a reader's.

## The inputs

| | |
| --- | --- |
| brief | `bench/briefs/3-timing-and-spacing.md` rev 2 |
| frames | `bench/reference/3-timing-and-spacing/` — `heavy` 65, `light` 21, both at 12 fps, both `contact.png`, `frames.json` |
| art | `examples/3-timing-and-spacing/images/` — `pendulum.png` 745×212, `square.png` 159×159 |
| atlas | **not needed for authoring.** rigc emits its own one-part-per-page atlas from the two PNGs. Read once as a diagnostic, late |
| guide | `docs/AUTHORING.md` in full |
| source | `src/render.ts`, `src/check.ts`, `src/compile.ts`, `tools/plate.ts` as format and instrument documentation |

## What was built

Three bones, two slots, two animations, no constraints and no events.

```
root                                        (0, 0)
  pendulum   len 583   (204.46, 707.88)     slot pendulum   region pendulum  745×212 at (−316.5, 0)
  square     len 159   (381.32,  78.46)     slot square     region square    159×159
```

- **The pendulum's bone sits on the pivot**, which is the small ball's own centre, and
  the plate hangs off it at −316.5 units — the offset from the image centre to that
  ball, measured off the PNG. So `rotate` is the only timeline the bar needs, and its
  setup value is 0 because the art is drawn with the bar exactly horizontal.
- **Names are the art's names**, carried straight through PNG basename → slot →
  attachment → the bone that moves it (§10.1). §10.1's own ⚠️ says this shot's names
  carry nothing a rig could inherit, and the measures below bear that out: `slots`
  reads 1.000 on names and `bones` 0.500, from the same convention.
- **Draw order: `pendulum` first, `square` in front.** *The frames do not decide
  this* — see *What the frames could not decide*.
- **Both animations declare `loop: false`** and neither returns to its first pose,
  which is what the frames show.

Timelines: `pendulum.rotate`, `square.translate`, `square.rotate` in each animation —
118 keys over eight named easings, planned under §10.4's two-pass rule (pass A fits
free handles to discover the shapes, they are clustered, pass B re-plans every
timeline under the table it will actually write).

## The measures — `bench 3`, verbatim

```
  ── summary ──
  validate   green  (profile spine)
  ess        bones=0.729  slots=0.929  attachments=1.000  constraints=1.000  animations=0.823  events=1.000
             bones 0.729 (name-matched) · 1.000 (name-agnostic)   slots 0.929 (name-matched) · 1.000 (name-agnostic)
  framing    one per set (2); one shared box leaves x0.999634, rms 0.10px
  heavy      MAE mean=6.13 worst=7.51 ref=6.13  over 65 frame(s)  worst slot drift 0.7px, attributed in 65, pendulum carries 79%
  light      MAE mean=6.01 worst=7.56 ref=6.01  over 21 frame(s)  worst slot drift 0.5px, attributed in 21, pendulum carries 78%
```

Section detail, from the same report:

```
  bones                 mean 0.729   count 3/3 · names 2/4 · parent_by_name 2/3 · order 2/3
                                     length_present 1/3 · inherit_present 2/3
  bones (name-agnostic) mean 1.000   count · depth_histogram · degree_sequence · shape_histogram · order_shape all 3/3
  slots                 mean 0.929   count 2/2 · names 2/2 · order 2/2 · bone 1/2 · attachment 2/2
                                     blend 2/2 · color_present 2/2
  slots (name-agnostic) mean 1.000   all four 2/2
  attachments           mean 1.000   skins 1/1 · count 2/2 · names 2/2 · type_counts 2/2 · region_size 2/2
  constraints           mean 1.000   0/0 throughout — neither side has any
  animations            mean 0.823   count 2/2 · names 2/2 · duration 2/2 · timeline_kinds 4/8
                                     key_counts 43/118 · curve_kinds 64/118 · draw_order 2/2 · deform 2/2
  events                mean 1.000   0/0 both
```

And the frame comparison, both sets:

```
  heavy   framed to frames.json's own box — the candidate measured into it
          content candidate 234.7x95.3px at (11.2, 11.6)  reference 234.7x95.3px at (11.2, 11.7)
          fit x0.999660  offset +0.05, +0.06 px  rms 0.10 px over 260 edge(s)
          union residual -0.09 x +0.03 px  aspect -0.07%   (declared, 1 pass, settled)
          MAE-refined pass: searched ±2 px over 65 frames and the identity won
          MAE mean 6.13  worst 7.51 at f0021        slot drift worst 0.7 px "pendulum" at f0017
          per-frame ALL 64 adjacent pair(s) change by as much as the reference's own frames do

  light   framed to frames.json's own box — the candidate measured into it
          content candidate 123.9x95.4px at (11.3, 11.6)  reference 123.9x95.1px at (11.2, 11.9)
          fit x0.999122  offset +0.08, +0.11 px  rms 0.10 px over 84 edge(s)
          union residual -0.15 x +0.19 px  aspect -0.32%   (declared, 1 pass, coincident)
          MAE mean 6.01  worst 7.56 at f0005        slot drift worst 0.5 px "pendulum" at f0003
          per-frame ALL 20 adjacent pair(s) change by as much as the reference's own frames do
```

## The reading

**The framing is the frames' own box, on both sets.** `check` measured the candidate
into the box `frames.json` records and found its pixels landing on the reference's to
within 0.10 px rms, so neither set is measured in an estimate. The `±2 px` MAE
refinement searched and the identity won, which says no part of either figure is a
constant offset — the shot is in the reference's own coordinates and its own units
(`in units` ×1.0003 and ×1.0013).

**The frame-change clause is clear, in full, on both sets.** 64 of 64 and 20 of 20
adjacent pairs agree. That includes the four pairs no other measure in this toolchain
can see: `heavy` f61→f62, f62→f63, f63→f64 and `light` f18→f19, f19→f20 are pixel-
identical on both sides, and `heavy` f60→f61 — a pair the reference moves **one pixel**
on — is answered by a candidate that is still moving there and stops afterwards. How
that was found is [`LOOP.md`](LOOP.md) §3; the short version is that a hundredth of a
degree is two orders below any pose fit's resolution and only the adjacent-pair column
knows it is there.

**The shape of the skeleton is exact and the vocabulary is not.** `bones` and `slots`
both read **1.000 name-agnostic** on every measure — the same count, the same depth
histogram, the same degree sequence, the same depth-and-child shapes, the same
declaration order, the same attachment kinds at the same draw-order positions. Every
figure the name-matched columns lose is a naming figure: `names` 2/4 on bones,
`parent_by_name` 2/3, `order` 2/3, and `slots.bone` 1/2. §10.1's ⚠️ predicted exactly
this for this shot — *"on a shot whose two PNGs are called things like `square` and
`pendulum`, the names carry nothing a rig could inherit"* — and the split between the
two sections is the evidence: the slot names, which the art does supply, read **2/2**,
and the bone names, which it does not, read **2/4**.

**`attachments`, `constraints` and `events` are 1.000 across every measure**,
`region_size` included: both regions are the PNGs' own sizes, measured by rigc from
the files (R5).

**`animations` splits cleanly into "right" and "unknowable".** `count`, `names`,
`duration` and both presence measures are 1.000 — the durations agree to inside a
1/60 s frame, which is the tightest either side can be asked for. What is short is
`timeline_kinds` 4/8, `key_counts` 43/118 and `curve_kinds` 64/118, and the three are
one fact: **this candidate carries more timelines and more keys than the reference
does.** §10.6 forbids guessing a key density and §10.3's arithmetic says why this shot
cannot be sparse — the median second difference of the fitted rotation series is
1.07 px, so skipping a single sample costs more than any tolerance worth declaring, and
the density is a fact about the subject. The trade was measured and a point picked
deliberately (0.30 px → 109 keys → 6.53/6.31; **0.15 px → 118 → 6.13/6.01**;
0.08 px → 128 → 6.05/5.94).

**The drift is at the floor.** 0.7 px worst on a 24.7 px ball across 65 frames, 0.2 px
on the block; means of 0.3 and 0.1 px. Every slot was attributed by `component` on
every frame of both sets — the two parts never merge, which is also why the drift is
readable at all.

## The atlas floor — two thirds of the MAE is not the animation

`check` cannot attribute this and it moves every MAE in the report, so it is here
rather than in a footnote.

The reference frames are rendered through **the example's own packed atlas**, and
`3-timing-and-spacing.atlas` declares `scale: 0.5` with the pendulum packed at
373×106. rigc has no packer (B3), so this candidate's atlas is the two loose PNGs at
full resolution — a texture at twice the reference's, resampled differently at every
edge. On the **identical skeleton**, with nothing else changed:

| atlas the candidate samples | heavy MAE | light MAE |
| --- | ---: | ---: |
| its own, full-resolution (the graded artifact) | 6.13 | 6.01 |
| the supplied packed atlas, `--atlas …/export/*.atlas` | **2.25** | **2.30** |

⇒ **about 3.9 MAE of each figure is texture resolution and about 2.2 is the rig.** The
first row is the one that belongs in the ladder — it is the artifact `bench` validates
and the atlas it ships with — and the second is the diagnostic that says where the
first one's error lives. Two notes on reading it:

- the diagnostic run is *not* better in every column: at half resolution the one-pixel
  pair at `heavy` f60→f61 stops being visible at all, so that run reports it as a
  disagreement. The sub-pixel move is real and the coarser texture cannot show it.
- this floor is not specific to this run. It applies to every rung whose example ships
  a scaled atlas, and it is why the run's PR adds it to `docs/AUTHORING.md` §9.

## What the frames could not decide

**Draw order.** Rendered both ways and scored over the pixels the two builds differ
on, per §8: the two parts **never overlap on any frame of either shot**, so the
deciding-pixel set is *empty* — 0 pixels, not a small margin. §8's null-result rule
applies, and this is shipped on reasoning and said so here: the editor creates a slot
per image as it is dragged in and appends it to the draw order
([Images](http://esotericsoftware.com/spine-images), §10.1), so the part a shot is
about goes in first and the object it strikes on top. `slots.order` reads 2/2, which
is a coin landing the right way up and not a measurement.

**Bone `length` and `inherit`.** §9.3: frames do not carry them. Lengths are stated on
both non-root bones from the art's own geometry (583 = the distance between the two
ball centres, 159 = the block's side) because a bone dragged out in the editor has
one; `inherit` is left off everywhere. `length_present` reads 1/3 and `inherit_present`
2/3, so one of those two guesses went the wrong way and the frames could not have told
either way.

**The easings table size.** 4/8/12/16 entries measured 6.14/6.13/6.22/6.12 on `heavy`
and 6.05/6.01/6.05/6.03 on `light` — 0.10 MAE across the whole sweep, inside the
objective's own scatter. §8's rule: that is *no answer*, not a weak one. 8 shipped on
reasoning (§10.4's own worked figure).

**Paired versus separate translate axes**, on the other hand, the frames *did* decide,
against the thing that looked physically right: the block flies an arc whose axes want
different curves, and `translatex`/`translatey` measured **6.25/6.01** against
**6.13/6.01** paired, for two extra timelines and 15 extra keys. §10.3's editor
default kept, because it measured better.

## Known wrong, or not checked

- **`timeline_kinds` 4/8, `key_counts` 43/118, `curve_kinds` 64/118** — this candidate
  is denser than the reference. Whether the reference is sparser *in the same places*
  is not something the frames or this report can say.
- **`bones.names` 2/4, `parent_by_name` 2/3, `order` 2/3, `slots.bone` 1/2** — one of
  the three bone names does not match and the reference hangs at least one bone
  somewhere this rig does not. Name-agnostic is 1.000, so it is vocabulary and
  attachment, not shape.
- **`length_present` 1/3** — see above.
- **Nothing below the render scale was checked.** At 0.117 px/unit a key four units
  out moves no pixel (§9.3), so every figure in this rig is authored to the frames'
  precision and no finer.
- **No `sheet` figure exists for this rung, and that is not an omission.** Both sets
  commit every sampled frame as its own file, so `checkAgainstSheet` declines by
  design — *"the sheet is the same pictures again, smaller, and measuring them twice
  would just report the resampling"* (`src/check.ts`). The per-frame table covers all
  86 frames instead, which is strictly more than a sheet line would carry. A gate
  clause that reads a sheet has nothing to read here.

## What the guide should have said

Both are folded into `docs/AUTHORING.md` by this run's PR.

1. **§9 — the atlas floor.** The reference frames come through the example's packed
   atlas, which may be scaled; a candidate built from the loose PNGs cannot match its
   resampling, and on this rung that is two thirds of the MAE. Measured above.
2. **§10.3 — a key reducer needs a relative floor.** An absolute pixel tolerance is
   the wrong shape for `check`'s adjacent-pair column, which compares *changes*: this
   run's planner legally spanned a pair the reference moves 0.109 px across, deviating
   0.098 px inside a 0.30 px tolerance, and the column read **259 px against 40**. The
   fix is one line — a span may not deviate by more than the smallest single-frame move
   inside it — and the general statement is the companion to §10.3's existing "a
   tolerance is not a hold": a tolerance is not a slow span either.

## Files

```
timing-and-spacing.rig.json      the rig spec
timing-and-spacing.motion.json   the motion spec — 8 easings, 118 keys
spine/                           the compiled candidate: skeleton.json + skeleton.atlas
bench.json                       the final `bench 3 --json` report (no gate string)
bench_stdout.txt                 the same run's console output, which carries the gate line
tools/                           the measuring and authoring scripts, in the order LOOP.md uses them:
                                   fit.ts        the rasteriser harness, in frames.json's own viewport
                                   fitall.ts     one part's quads, the glyph estimator, the refiner
                                   run_fit2.ts   globals and per-frame poses, alternated
                                   clean.ts      unwrap the block's rotation, pin the holds, re-refine
                                   gfit.ts       the global cross-check that freed the attachment offsets
                                   dcheck.ts     the adjacent-pair test and its allowed band
                                   tail_opt.ts   the tail, optimised against error plus the bands
                                   plan.ts       key planning: forced indices, spans, handle fitting, clustering
                                   author2.ts    passes A and B, the frame-closed reduction, and the emit
                                   clean.json / poses.json / gfit.json / tweak.json   their data
```

`tools/author2.ts` regenerates both specs byte-identically from `clean.json` and
`tweak.json`; `bun tools/author2.ts` from this directory does it.

## After this run

Two things this run deliberately did **not** do, both because they need a session that
may read what an authoring run may not:

- **the `docs/LADDER.md` entry** — its per-rung sections and *Operating rules* are on
  the forbidden list, so the bench summary above is not pasted there by this run;
- **the gate-v2 verdict** — clause by clause, against the section that defines the
  clauses.
