# spineboy — attempt 1

The graduation exam, attempted on **`ess`** alone. `pro` was not built: rigc's motion
spec has no `ik`, `transform` or `deform` timelines yet (issues #87–#89), so a `pro`
candidate could not be complete, and the rung does not clear on it (issue #16).

- **date** — 2026-08-23
- **model** — Claude Opus 5 (1M context), running as a Claude Code / Agent SDK agent
  in a fresh session, in its own `git worktree`
- **profile** — `spine`
- **guide** — [`docs/AUTHORING.md`](../../../docs/AUTHORING.md) in full, **§10 in
  hand**: this run is after the 2026-08-23 boundary, so its convention measures are
  not comparable with a run authored before it
- **clean or bench-assisted** — **clean.** `bench spineboy` was run exactly once, at
  the end, and nothing was edited afterwards.
- **honesty-rule incidents** — **two leaks inside standard inputs, and they are
  named rather than hidden.** `docs/AUTHORING.md` §3.6 states the reference's
  `events` block outright; §3.4's bounding-box example is very probably lifted from
  an example export. A third, milder one is in this run's own instructions:
  `docs/LADDER.md`'s spineboy row publishes the bone and slot counts the brief
  deliberately withholds. What was done about each is [`LOOP.md` §1](LOOP.md).
  Nothing under `examples/*/export/` or `bench/transcriptions/` was opened.
- **iterations** — the gate was green on the **first** compile of both the rig and
  the motion spec, and stayed green for every later build; no compile error was hit
  all run. The loop was `build` + `check` + render-back plus about **500** fitting
  runs of the candidate against the frames.

## Inputs

| input | note |
| --- | --- |
| [`bench/briefs/spineboy.md`](../../briefs/spineboy.md) | **revision 2** — third-party verified, 2026-08-23 |
| [`docs/AUTHORING.md`](../../../docs/AUTHORING.md) | the whole guide, §8, §9 and §10 included |
| [`bench/runs/README.md`](../README.md) | the run protocol |
| [`docs/LADDER.md`](../../../docs/LADDER.md) | *How a rung is scored*, *The honesty rule*, the status table and the spineboy row |
| `examples/spineboy/images/` | the 40 loose PNGs |
| `bench/reference/spineboy/ess/` | 8 sets, 132 frames at 12 fps, sheets + 2 stills at 30 fps, `frames.json` |
| this repository's source | `src/render.ts`, `src/rig.ts`, `src/types.ts`, `src/diff.ts`, `src/framing.ts`, `tools/plate.ts`, `tools/font5x7.ts` |
| two earlier runs, for process only | [`2026-08-23-rung8-1/`](../2026-08-23-rung8-1/) README + LOOP, [`2026-08-23-rung3-2/README.md`](../2026-08-23-rung3-2/README.md) |

Nothing under `examples/spineboy/export/` was opened — not the JSON and not the
`.atlas`, which was not needed because rigc emits its own atlas from the loose PNGs.
No `bench/transcriptions/`, no other run's rig or motion spec, no
`bench/render_reference.ts`, no git history, no web search.

## Files

```
ess/   spineboy-ess.rig.json   the rig spec
       spineboy-ess.motion.json  the motion spec
       spine/                  the compiled candidate — skeleton.json + skeleton.atlas
       check.txt               `check` against the frames, pinned to frames.json's box
       check-unpinned.txt      the same run with the framing fitted over all 147 frames
       selfcheck.txt           the shot's own quantities, both sides, same estimator
       bench.json              the one `bench` run
tools/ every script every number in this directory came out of
LOOP.md  every turn of the loop, and the leaks
```

`spine/` carries `skeleton.json` and `skeleton.atlas` only. Its 27 atlas pages are
the example's own PNGs, which this repository does not redistribute — re-run `build`
to put them back, as the earlier runs' directories also do.

## What was built

```
root
└── hip                                    translate + rotate — the body's own place
    ├── torso            torso.png
    │   ├── neck         neck.png
    │   │   └── head     head.png · goggles · eye · mouth · head-bb
    │   ├── front-upper-arm  front-upper-arm.png
    │   │   └── front-bracer front-bracer.png
    │   │       └── front-fist  front-fist-open | front-fist-closed
    │   └── rear-upper-arm   rear-upper-arm.png
    │       └── rear-bracer  rear-bracer.png
    │           └── gun      gun.png          — the gun is on the FAR arm (LOOP §3)
    │               └── muzzle  muzzle01…05, at 4× (LOOP §7)
    ├── front-thigh → front-shin → front-foot
    └── rear-thigh  → rear-shin  → rear-foot
```

**18 bones, 20 slots, 28 attachments (27 regions + 1 bounding box), 1 skin, 8
animations, 2 events, no constraints, no mesh, no `drawOrder` timeline.**

Setup draw order, back to front: `rear-upper-arm`, `rear-bracer`, `muzzle`, `gun`,
`rear-thigh`, `rear-foot`, `rear-shin`, `torso`, `neck`, `head`, `eye`, `goggles`,
`mouth`, `front-thigh`, `front-foot`, `front-shin`, `front-upper-arm`,
`front-bracer`, `front-fist`, `head-bb`.

### The three build choices that moved the most

1. **The gun is on the far arm, and the brief says otherwise twice.** `gun.png` has a
   fist painted into it; the art ships a separate fist only for the front arm; the
   hand hanging free in `idle` is that fist; and swapping the two arms' art and
   refitting costs 5 % of the objective. The brief's own `death` paragraph reaches
   the same conclusion from the same evidence while its `idle` and `walk` paragraphs
   say the opposite. [`LOOP.md` §3](LOOP.md).
2. **Joints are solved, not guessed.** Each joint is the point two neighbouring parts
   hold in common across all 132 frames — a linear least-squares fixed point of
   `R(θp)a + tp = R(θc)b + tc`, reweighted twice to drop the frames where a part was
   covered up. The first estimate (the centroid of the two parts' overlap in the
   setup pose) is what that replaced. [`LOOP.md` §8](LOOP.md).
3. **Every pose is fitted as a composite through the reference's own rasteriser**,
   never per part. On a character every frame is a frame where parts touch, which is
   §8's first trap, and per-part matching produced an upside-down far arm and a fist
   on a thigh before anything was built. [`LOOP.md` §4](LOOP.md).

Three smaller ones the frames decided and the brief lists as undecidable: the boot is
drawn **behind** its shin on both legs (§6); the mouth is `mouth-smile` and the eye
`eye-indifferent` (§5); the near fist is **closed** in `walk`, `run` and `aim` and
open in `idle` (§9).

## The measures

### `ess` — the matching line, verbatim

```
  ── summary ──
  validate   green  (profile spine)
  ess        bones=0.869  slots=0.929  attachments=0.976  constraints=1.000  animations=0.821  events=0.500
             bones 0.869 (name-matched) · 0.922 (name-agnostic)   slots 0.929 (name-matched) · 0.887 (name-agnostic)
  pro        bones=0.237  slots=0.363  attachments=0.253  constraints=0.000  animations=0.573  events=0.500   [stretch]
             bones 0.237 (name-matched) · 0.206 (name-agnostic)   slots 0.363 (name-matched) · 0.149 (name-agnostic)
  check      not run — pass --frames <dir> to compare against the rendered reference frames.
             Without it this report says nothing about whether the ANIMATION is right.
```

⚠️ **The `pro` line above is this `ess` candidate diffed against the *other*
skeleton, and it measures nothing.** It is printed because `bench spineboy` takes one
candidate and diffs it against every reference skeleton of the rung; it is reproduced
here only because the block is verbatim. **The rung's line is the `ess` one.** Quoting
the `pro` figures as though they said anything about a `pro` attempt is the failure
mode the protocol names at a two-skeleton rung, and it is worse here because one of
the two lines does not count.

`bench` was run **once**, with the brief's own command line (no `--frames`), so its
summary carries no `check` table — the animation half is below, measured by `check`
before `bench` ran.

## Reading

**The skeleton is the reference's skeleton.** `bones.count` **18/18**, and every
name-agnostic bone measure that describes the tree itself is **1.000** —
`depth_histogram`, `degree_sequence` and `shape_histogram` all 18/18. A rig built
from the art and the frames came to the same 18 bones at the same depths with the
same children, which is the strongest thing in this report.

**And the vocabulary is the reference's too, which was not the plan and is the run's
biggest surprise.** `slots.names` **20/20**. `bones.names` **17/19**.
`attachments.names` **26/29**. Names are the measure every honest run so far has read
near zero — rung 3's second attempt scored `bones.names` 1/5 and `attachments.names`
1/3 — and the reason this one does not is a single convention applied on purpose:
§10.1 says the editor makes *"a slot and a region attachment under the root bone for
the image"* when you drag art in, and the art here ships as `front-shin.png`,
`rear-bracer.png`, `goggles.png`. If the slot is the image's name and the bone is the
part's name, an author and the reference converge without either seeing the other. It
is not a coincidence and it is not a leak: the art table is a supplied input.

**Three decisions not to author turn out to have been right, and `bench` is where
that shows.** `constraints` is **1.000 at 0/0** — `ess` has no constraints at all, so
`docs/LADDER.md`'s *"IK"* on the spineboy row is `pro`'s. All four `mesh_*` measures
are **1.000 at 0/0** — `ess` has no meshes either, so the row's *"unweighted meshes"*
is also `pro`'s, and the region-only rig this run chose (§9.3 says the frames cannot
separate the two) matches. `animations.deform` is 8/8. Rung 8's guide note 4 asked a
run to record the mesh-or-bone choice as a **choice**; recorded, and this time it won.

**`attachments` 0.976 is the highest section on the ladder to date.** `count` 27/28,
`type_counts` 27/28 and `region_size` 26/27 all miss by exactly one attachment. This
rig has 28 (27 regions + 1 bounding box) against the reference's 28-ish; the one that
does not line up is most likely a flare plate or the bounding box's own placeholder.

**`animations` 0.821 splits cleanly into what the brief gave and what it did not.**
`count` 8/8, `names` 8/8 and `duration` 8/8 are the brief's own duration table used
as written, on a 30 fps grid. What is short is everything about the *inside* of an
animation: `timeline_kinds` 112/153, `key_counts` **639/1414**, `curve_kinds`
702/1414. Those three are one finding, not three — see *Known-wrong* §1.

**`animations.draw_order` 7/8 names a defect this run can point at but not place.**
One of the eight animations in the reference carries a `drawOrder` timeline and none
of mine does. The brief's own search for a draw-order *change* came up empty over both
skeletons — *"no pair of parts was caught visibly on one side of each other in one
frame and the other side in another"* — and so did this run's sweeps. It is there; the
frames do not show it. `death`, where the figure rolls onto his back, is the obvious
suspect and *obvious suspect* is all this report can honestly call it.

**`events` 0.500 is the price of authoring from the brief with the answer in the
room.** `docs/AUTHORING.md` §3.6 states the reference's events block outright
([`LOOP.md` §1](LOOP.md)); this rig declares two events because the brief pins four
cues to the frame and an animator would. `animations.event_keys` is 5/6, so the
firings themselves are nearly right — it is the second *name* that costs both halves
of the section. Using the leak would have read 1.000 and measured nothing.

**`bones.order` 9/18 and `slots.order` 14/20 are the same fact twice.** My draw order
and declaration order are built back-to-front from the art; the reference's differ in
about a third of their positions. `slots.agnostic.order_shape` 14/20 says the same
thing without names. Draw order is data (R4) and six of my twenty slots sit in the
wrong place in it.

### Against the frames — `check`, run before `bench` and in the loop

`bench` was run **without `--frames`**, exactly as the brief's own command line shows,
so its summary carries no `check` table. The table below is `rigc check` against
`bench/reference/spineboy/ess`, run on this same artifact **before** `bench` and
several dozen times during the loop. It is not a `bench` measure.

⚠️ **Two framings, and the difference is 15–25 MAE.** Pointed at one animation, `check`
takes `frames.json`'s own box and says so — *"rendering it into that box put its own
drawn pixels on the reference's to within 0.66 px rms"* on `idle` — because this rig is
authored in the frames' own world coordinates. Pointed at the whole **root**, it fits
one framing across the union of all 147 frames, and `hit`'s silhouette (the worst shot
here) drags that fit about 1.5 px. Both are printed; `check.txt` is the pinned run and
`check-unpinned.txt` is the fitted one.

| shot | MAE 12 fps (pinned) | MAE 30 fps stills | unpinned 12 fps | worst slot drift |
| --- | ---: | ---: | ---: | --- |
| `idle` | **18.77** | 10.53 | 41.59 | 2.8 px `front-foot` |
| `shoot` | 24.27 | 26.09 | — | 5.9 px `rear-shin` |
| `aim` | 26.17 | 26.17 | 43.59 | 5.0 px `rear-shin` |
| `walk` | 32.00 | 25.66 | — | 6.3 px `front-shin` |
| `death` | 32.26 | 27.04 | 44.12 | 7.8 px `torso` |
| `jump` | 38.99 | 41.61 | 51.25 | 4.4 px `mouth` |
| `run` | 42.30 | 40.36 | — | 4.1 px `front-upper-arm` |
| `hit` | **52.09** | 49.31 | 60.59 | **18.2 px** `front-shin` |

`per-frame` reports **all** adjacent pairs changing by as much as the reference's own
on `idle`, `hit`, `jump`, `run`, `shoot` and `walk` — nothing holds where the reference
moves and nothing moves where it holds. `death` reports 4 of 59, all inside the
stillness at f18–f26 and all under a pixel of drift ([`LOOP.md` §10](LOOP.md)).

## The frame-fidelity self-check

Before `bench`, the candidate was rendered back and measured with **the same
estimator over both sides**, in the brief's own terms — its 8/255 subject mask, its
floor row from `frames.json`, its ground-contact band, its teal predicate, its flare
predicate ([`tools/selfcheck.ts`](tools/selfcheck.ts); full output in
[`ess/selfcheck.txt`](ess/selfcheck.txt)). The control is that the reference column
reproduces the brief's own figures.

| quantity | candidate | reference |
| --- | --- | --- |
| `idle` box, 21 frames | 98–101 × 145–146 px | 100–101 × 143–146 px |
| `idle` centroid sway | 183.5 → 185.3 → 183.5 | 183.5 → 185.5 → 183.6 |
| `idle` ground-contact groups | **2 on all 21** | 2 on all 21 |
| `idle` lowest drawn row | 336–338 | **336 on all 21** |
| `idle` gun teal, lower share | 289–316 px | 299–325 px |
| `run` frames with zero ground contact | **f2, f6** | f2, f6 |
| `run` lowest row at those frames | 323, 321 | 323, 323 |
| `jump` rise, f0 → f9 | 341 295 256 227 206 190 178 174 167 **167** | 335 302 260 232 212 196 184 176 171 **169** |
| `jump` landing frame | f15 (row 338 → 336) | f15 (row 330 → 336) |
| `shoot` flare, f2 / f3 / f4 | **160 / 1441 / 634 px** | 166 / 1659 / 717 px |
| `shoot` box width, f2 / f3 / f4 | 189 / 200 / 214 px | 189 / 202 / 218 px |
| `death` still passage f18–f26, box move | **0 px** | ≤ 1 px |
| `death` centroid x at rest | 80.0 | 82.8 |
| `hit` box, 5 frames | 141 137 97 82 73 wide | 148 149 138 116 103 wide |

The gaits, the flight phases, the hang at the top of the jump, the flare's three
frames and the stillness in `death` all reproduce. `hit` does not, and `death`'s
figure comes to rest about 3 px short of where the reference's does.

## Known-wrong, in order

1. **`hit` is the shot this rig gets wrong, and it is a fit failure rather than a
   model one.** 52.09 MAE against `idle`'s 18.77, and 18.2 px of drift on
   `front-shin` — the reference's five frames go 148 → 103 px wide and mine go
   141 → 73, so my figure curls up where the reference stays laid out. `hit` opens on
   an extreme the setup pose is nowhere near (a horizontal figure, 148 × 80 against
   100 × 146 standing) and the descent reaches a pose whose head and hair are
   pixel-close while the body is not. Letting the fitted parts off the hierarchy
   recovers `hit` only from 54.7 to 47.7, so the joints are not the cause either; the
   descent is. See §2 below for what that costs everywhere.
2. **Every shot but `idle` sits above what a free fit of the same parts reaches.**
   The free figures come from the round-1 relax (`LOOP.md` §8.2), so they are a bound
   rather than a like-for-like: `walk` 31.9 hierarchical against 27.3 free, `run` 42.9
   against 42.5, `shoot` 26.9 against 20.2, `aim` 26.6 against 14.2, `idle` 16.4
   against 12.4. That
   gap is the run's headline limitation — a coordinate descent over 19 numbers per
   frame converges to a local minimum that is visibly the right pose in outline and
   several pixels off in the limbs, and neither more passes nor a finer step schedule
   moved it. What did move it was better *starts* ([`LOOP.md` §8.3](LOOP.md)), and the
   next thing to try is more of them, not more descent.
3. **`key_counts` 639/1414 and `curve_kinds` 702/1414.** This rig writes ~1390 keys
   over 8 animations and the reference's histogram maxes at 1414, so the totals are
   the same order — this is not rung 8's 2× over-key. What differs is *where* they
   sit: `timeline_kinds` 112/153 says the reference has timelines this rig does not,
   and a key in a timeline I never wrote counts against both measures. The most
   likely candidates are §10.3's Separate checkbox (`translatex`/`translatey` where I
   wrote paired `translate`) and translate timelines on bones I only rotate. The
   tolerance dial was swept and recorded rather than picked:

   | tolerance | timelines | keys | mean MAE over all 132 frames | worst |
   | ---: | ---: | ---: | ---: | ---: |
   | 0.4 px | 140 | 1386 | **32.18** | 63.2 |
   | 0.8 px | 140 | 1198 | 34.87 | 71.2 |
   | 1.5 px | 140 | 1036 | 37.30 | 72.8 |
   | 2.5 px | 140 | 908 | 39.34 | 72.8 |

   0.4 px was chosen: it is the only setting whose reduction costs under a point of
   MAE against the poses it is reducing, and §10.3's editor habit is dense keying with
   the redundant ones deleted rather than a sparse spec.
4. **One draw-order timeline missing** (`animations.draw_order` 7/8) and **six slots
   in the wrong place in the setup order** (`slots.order` 14/20). Neither is visible
   in the frames; the first is stated in the brief's own silence list, the second was
   swept as far as the pixels could decide it (§6) and then guessed.
5. **The second event.** `events` 0.500 — authored from the brief with the answer
   sitting in a standard input. Recorded as the run's most deliberate cost.
6. **`death` comes to rest 3 px left of where the reference's does** (centroid x 80.0
   against 82.8) and its box is 143 px wide against 151. The fall, the tumble, the
   slide and the stillness are all in the right frames; the figure that lands is a
   little too compact.
7. **`muzzle03` and `muzzle05` are placed by interpolation, not measurement.** The
   12 fps set never shows either — the flare's three visible frames are `muzzle01`,
   `02` and `04` — so their offsets are read off the line the other three make.
8. **The bounding box is a claim, not a measurement.** `head-bb` is the head art's own
   silhouette sampled at eight angles, on the head bone. §3 and the brief both say the
   frames can neither confirm nor deny that the reference has one; `attachments.count`
   27/28 says something is one short either way, and this is the likeliest candidate.

## What was left unauthored, and why

- **Constraints.** `docs/LADDER.md`'s spineboy row says the reference carries **IK**,
  and this rig carries none. Frames cannot show a constraint (§9.3): an IK-driven leg
  and a rotation-keyed leg render to the same pixels. Authoring two leg IKs to match
  a row in a table is guessing at the answer, and the instruction this run was given
  says not to. `constraints` will read **0.000** and that is the price, paid in
  public — the same trade rung 8's `ball` made and lost.
- **Meshes.** Every attachment here is a region. §9.3 says outright that a hull moved
  by bones and the same hull moved by deform keys render identically, and the ladder
  row names *unweighted meshes* without saying where. Rung 8's guide note 4 asks a run
  to record this as a **choice** rather than discover it in the measures, so: it is a
  choice, and if the reference meshes anything, `attachments.type_counts` and
  `bones` will both say so.
- **A `drawOrder` timeline.** The brief's search for a draw-order *change* came up
  empty over both skeletons, and this run's own sweeps found no frame where a swap
  paid. The order is stated once, in the slots array (R4).
- **Clipping.** Nothing in `ess` is masked. The ladder row's *clipping* is almost
  certainly `pro/portal`, which this candidate does not attempt.
- **`pro`.** Not attempted — see the header.

## Notes for the guide

1. 🚨 **§3.6 tells the authoring agent the answer to the `events` section of the very
   rung the guide is for.** *"The editor's own spineboy export declares exactly
   `{"footstep": {}}`"* is a fact read off `examples/spineboy/export/spineboy-ess.json`,
   in a document `bench/runs/README.md` requires a run to read **in full**, and §10.6
   of the same document says conventions visible in reference exports but stated by no
   public page are *"deliberately absent … a guide that asserted them would be handing
   you an answer read off the exports"*. The sentence needs to lose its second half:
   the point it makes — that an empty payload object is the normal case — stands
   without naming the export. §3.4's bounding-box example deserves the same look; six
   vertices spanning a head-sized polygon under a placeholder called `head-bb` reads
   like an export rather than an illustration.
2. ⚠️ **`docs/LADDER.md`'s feature table publishes what the brief withholds.** The
   spineboy row carries *"`ess`: 18 bones, 20 slots, 8 animations"* while the brief
   says in as many words that it *"deliberately does not carry … bone counts"*. A run
   told to read the row (this one was) has the size of the answer. Either the counts
   move out of the row, or the protocol says out loud that the row is a standard input
   and runs record it — but the two documents should not disagree about whether a
   number is secret.
3. ⭐ **§10.1's naming convention is worth far more than §10 currently suggests, and
   this run is the evidence.** Applying *"one image → one slot → one attachment, named
   after the image"* to a rig whose art ships as `front-shin.png` and `rear-bracer.png`
   produced `slots.names` **20/20**, `bones.names` 17/19 and `attachments.names` 26/29
   — against 1/5 and 1/3 on rung 3, where the two parts were called `square` and
   `pendulum` and any name was as good as any other. The rule §10 could add: **when the
   art is named after the parts, the art's names are the rig's names, and that decides
   five of `bones`'s eight measures and three of `slots`'s seven.** It costs nothing
   and it is not a leak — the art table is a supplied input.
4. 🚨 **A key time rounded to six decimals can land after the frame it is for.**
   `2/12 s` and `5/30 s` are both 0.16666666…, and `0.166667` is larger than either,
   so an attachment key written that way is not applied on the frame that should show
   it. This run's flare fired one 12 fps frame late until the self-check caught it —
   §4.5 already warns about a key landing past a *duration*; the same arithmetic bites
   inside an animation, where nothing errors and a **stepped** timeline cannot smooth
   the miss over. The rule is one line: **round key times down, never to nearest.**
5. ⚠️ **`check --frames <root>` on a multi-shot character is not the same measurement
   as `check --frames <root>/<one-shot>`, and on this rung the difference is 15–25
   MAE.** §9.2 says the framing is over the frames you compare and that both are right.
   True — but at eight shots and 147 frames, one badly-fitted shot's silhouette moves
   the shared framing by ~1.5 px and every *other* shot's MAE roughly doubles. `idle`
   reads 18.77 pinned and 41.59 fitted, with not one key different. A character rung
   wants the per-shot numbers, and §9 could say so rather than leaving a run to
   discover that its best shot looks like its worst.
6. 🧩 **A hold needs a key at both ends, and §10.3's "does not repeat a value" reads
   as though it forbids one.** `shoot` opens on a twelfth of a second of stillness and
   `death` lies still for nine frames; both need two keys of equal value, and Clean
   Up's *"keying the same value multiple times in a row"* is about three or more, not
   two. `check`'s per-frame column is what found both here. §10.3 could carve the
   exception out explicitly — it is the same defect §9.2 already documents from the
   other side.
7. 🧩 **A tree with a bone that carries no attachment has an exact gauge, and a
   coordinate descent will find it.** `hip` here has no art and every moving bone under
   it, so turning it by δ and turning its children back by δ changes no pixel — and the
   descent walked that to hip **+181°** against torso **−184°**, a pose whose picture
   is right and whose key series spins the figure through a whole turn between two
   frames. The fix is exact and cheap (the median of the four values), and it belongs
   beside rung 8's note 2 about tolerances: **before keying a fitted series, remove the
   gauges — a rig's parameters are not identified by its pixels.**
8. 📎 **The protocol's own output template is stale.** [`bench/runs/README.md`](../README.md)
   §*The output* still shows a single `log.md`, while every run since rung 3's second
   attempt ships `README.md` (figures and reading) plus `LOOP.md` (the turns), which
   is the shape this run was told to produce. The template is the first thing a new
   run copies; it should describe what the directory next to it actually looks like.
