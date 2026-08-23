# The benchmark ladder

**Live status document.** The rung order, what each rung gates on, how a rung is
scored, and where each one stands today. The survey behind it is
[SPEC_COVERAGE.md](SPEC_COVERAGE.md) — that document is a dated research note and
does not move; this one does.

The corpus is Spine's own official example projects, fetched by
`bun run fetch-examples` into a gitignored `examples/`. They are not
redistributed here; see [NOTICE.md](../NOTICE.md) and §*Licence, per rung* below.

---

## The order

The rungs are **not** attempted in the order their directories are numbered. The
order below is the one the owner fixed:

> **B1 – B3 → rung 3 → 1 · 2 · 4 · 5 → 6 → 8 → 7 → spineboy**

Three things follow from that ordering and each is a reason, not a preference:

- **Rung 3 first.** `3-timing-and-spacing` is the smallest skeleton in the whole
  corpus — 3 bones, 2 slots, 2 animations, no constraints, no meshes — and it
  needs nothing that rungs 1 and 2 do not also need. It is the rung on which
  "can rigc express a foreign skeleton at all" is answered with the least noise
  around the answer.
- **8 before 7.** Rung 8 introduces nothing that rung 6 did not (transform
  constraints, weighted meshes). Rung 7 introduces physics timelines, a keyed
  transform timeline and deform all at once — it is the hardest rung below
  spineboy, and it is also the one with the licence problem below.
- **spineboy last, as the graduation exam.** It is the only rung with IK, events,
  bounding boxes, clipping and unweighted meshes, and it is an order of magnitude
  larger than anything under it.

### Blockers, before rung 1

| # | Blocker | State |
| --- | --- | --- |
| **B1** | **The bone tree is code.** `src/archetype.ts` hard-coded three archetypes; a slot outside the archetype's table was a compile error, and no example fitted any of them. | ✅ **closed 2026-08-22** — the skeleton is a **rig spec** (`spec: "rigc-rig/1"`, [`src/rig.ts`](../src/rig.ts)): bones, slots, skins, attachments, constraints and invariants as data. `src/archetype.ts` is gone. Proof below |
| **B2** | **A16 rejected every example.** `/^4\.3(\.\d+)?$/` failed on the `"4.3.75-beta"` that all twelve example exports declare. | ✅ fixed — A16 accepts `4.3`, `4.3.N` and `4.3.N-<suffix>`; 4.2.x and 5.x still rejected, with a control for each direction |
| **B3** | **The atlas model is one-part-per-page.** rigc emits `bounds: 0,0,w,h` per page and A06 demanded every region cover its page exactly; every example ships a packed atlas (13–50 regions on one page, some rotated). | 🟨 **half done** — the validator half is fixed: A06's full-page/rotation/pma clauses, A08's name-identity clause and A27 now live behind `--profile`, so a packed atlas passes `--profile spine`. The emitter half is untouched: rigc still has **no packer and no importer** for a pre-packed atlas, so reproducing a rung means supplying the example's own atlas alongside the candidate |

---

## How a rung is scored

**Stage 1 — validity.** `bench` runs `validate --profile spine` on the candidate.
This is the only part with a pass/fail: a candidate that is not valid Spine 4.3
has not cleared anything. The `spine-html` profile is deliberately *not* used —
the thing being reproduced is an editor export, and this project's renderer
policy would fail rungs for reasons the rung is not about.

**Stage 2 — structural diff.** `bench` then runs `rigc diff` against the rung's
reference export and prints a ratio per measure across six sections: bones,
slots, attachments, constraints, animations, events.

There is **no rung score.** Section figures are unweighted means of the measures
printed beneath them and are labelled as such; nothing combines the sections. A
single number cannot distinguish a rig with the right skeleton and the wrong
timing from a rig with the right timing and the wrong skeleton, and those call
for opposite fixes. **A rung is marked cleared by a person reading the measures,
and this file is where that judgement is written down.**

#### `bones` and `slots` carry two figures

⭐ **A candidate is entitled to its own names, so those two sections are reported
twice** — once name-matched, once name-agnostic (issue #21, 2026-08-23):

```
ess        bones=0.567  slots=0.476  attachments=0.926  constraints=1.000  animations=0.936  events=1.000
           bones 0.567 (name-matched) · 1.000 (name-agnostic)   slots 0.476 (name-matched) · 1.000 (name-agnostic)
```

The reason is arithmetic. Five of `bones`'s eight measures — `names`,
`parent_by_name`, `order`, `length_present`, `inherit_present` — are gated on the
same one-name-in-common condition. They are the naming figure counted five times,
not five findings, and they pull the section mean down far enough that a reader who
does not open the table underneath reads *"the skeleton is wrong"* about a
skeleton that is right. The name-agnostic figure is that same comparison made
with names thrown away entirely.

**They are two comparisons, not two halves of one.** The name-matched figure is
unchanged, to the digit, from what it has always been — every `bench.json`
already on disk stays comparable — and the name-agnostic figure has its own
measure set, listed in the JSON under `sections[].nameAgnostic`:

| section | name-agnostic measures |
| --- | --- |
| `bones` | `count`; `depth_histogram` (as many bones at each depth); `degree_sequence` (as many with each child count); `shape_histogram` (as many of each *depth-and-child-count* shape — stronger than the two before it, which can agree while pairing depths and degrees up differently); `order_shape` (the declaration order compared as a sequence of shapes) |
| `slots` | `count`; `attachment_types_by_position` (the same kind of attachment at each position in the draw order); `bone_binding_shape` (as many slots hanging off a bone of each shape); `order_shape` (the draw order as a sequence of `<attachment type>@<bone shape>`) |

A bone's *shape* is `d<depth>c<children>` — `d1c3` is one hop below a root with
three children — and `?` is a bone that is not declared at all, which is a real
answer rather than a gap: it says a slot hangs off nothing.

**How to read the pair.** Name-agnostic 1.000 beside a low name-matched figure
means the shape is right and the vocabulary differs. Both low means the rig is
wrong. Name-agnostic low on its own cannot happen, because a wrong shape cannot
have right names. And the pair is not a licence: two elements with the same shape
are interchangeable name-agnostically, so swapping two same-shaped slots is
correctly invisible there — the name-matched `slots.order` is the measure that
catches it, and that is why both are printed.

#### Measure changes, and what they do to a recorded figure

A run's `bench.json` is that run's own record and is never rewritten. When a
measure changes, the figures recorded before it stop being comparable with the
ones after, and the change is recorded here with the recomputed figure for every
run on this page, so that nothing above is silently stale.

**2026-08-23 — `attachments.region_size_present` → `attachments.region_size`**
(issue #28). The old measure asked whether each region *stated* a width and
height. It was keyed by `skin/slot/attachment`, so it could never exceed the name
overlap and reported the naming gap a third time: rung 1 read `0/8` where
`attachments.names` read `0/16`. (The issue's own diagnosis — that Spine's
exporter omits the fields when they match the atlas region, making the measure
unwinnable — turned out not to hold: all twelve reference exports state a size on
every one of their 168 regions.) It now asks, name-agnostically, whether the two
rigs agree about **how big** their regions are. `attachments` moves as follows,
and no other section is affected:

| run | `attachments` as recorded | recomputed | the measure itself |
| --- | ---: | ---: | --- |
| rung 1 `balls` | 0.778 | **0.889** | `0/8` → `8/8` |
| rung 1 `drop` | 0.856 | **0.878** | `3/5` → `4/5` |
| rung 2 attempt 1 | 0.805 | **0.870** | `5/17` → `15/17` |
| rung 2 attempt 2 | 0.762 | **0.853** | `1/17` → `15/17` |
| rung 3 attempt 1 | 0.870 | **0.926** | `1/2` → `2/2` |
| rung 3 attempt 2 | 0.870 | **0.926** | `1/2` → `2/2` |
| rung 4 | 0.772 | **0.859** | `1/9` → `8/9` |
| rung 5 | 0.801 | **0.897** | `4/29` → `29/29` |
| rung 6 | 0.321 | **0.396** | `0/3` → `2/3` |

Where the new measure still reads short it is naming a real disagreement about a
size — four rigs out of nine — which is what the old one never could.

**Stage 3 — per-frame pose distance. Named, not built.** The structural diff
compares what the file *says*; it cannot see that two structurally identical rigs
pose differently. The measure for that is **per-frame bone world-transform
distance**: step both skeletons through the same animation at a fixed rate and
compare each bone's world position, rotation and scale frame by frame. It needs a
bone correspondence (a candidate is free to use its own names, so the mapping is
an input, not a derivation) and a distance normalised by skeleton size. **None of
it exists.** Do not report a per-frame figure until it does.

### The honesty rule

⭐ **The authoring agent gets `images/`, a text brief and rendered reference
frames. It does not get the reference JSON.**

The reference export is read by `bench` and by
[`bench/render_reference.ts`](../bench/render_reference.ts), and by nothing else.
An agent that has seen the answer is not being measured on authoring a rig; it is
being measured on transcription, and the resulting number would be worthless in
exactly the way that is hardest to notice afterwards. This applies to the
reference's derived facts too — bone names, key times, curve handles — however
they reach the agent.

The line the rule draws is **what a client watching the finished animation could
tell you**. A human animator is shown the shot; withholding it does not measure
authoring, it measures guessing.

Practically:

- The brief may describe the shot in the terms a human animator would be given:
  what moves, roughly when, what the principle being demonstrated is.
- The agent may look at **rendered frames of the reference**
  ([`bench/reference/`](../bench/reference/), see its README): pixels of the shot
  carry no bone name, key time or curve handle.
- The brief may state each animation's **duration**, and whether the last frame
  returns to the first. Both used to be listed as off limits, and durations
  cannot be: the frames are rendered at a fixed rate over each animation's own
  length, so the frame count states the duration exactly, and rigc requires a
  declared duration anyway. Withholding the number while shipping the frames
  would be theatre.
- The brief may state the atlas, because rigc has no packer (B3) and the atlas is
  a supplied input rather than something the agent authors.
- The brief may **not** carry bone counts, hierarchy, timeline listings, key
  counts, key values, curve data, slot names or the setup pose taken from the
  reference.
- **`bench` is the finish line, not a rung of the authoring loop.** Its measures
  are derived from the reference, so editing a spec in response to them is tuning
  against the answer; a run that does it is labelled *bench-assisted*.
- A rung attempted with the reference in context is recorded as such, or not
  recorded at all.

**The two lists, and the prompt must quote them.** The enumerated form lives in
[`bench/runs/README.md`](../bench/runs/README.md), *What a run may read* — one copy,
because a reading list in two places drifts and then neither is the rule. In one line
each:

- ✅ **Allowed** — the rung's brief; `bench/reference/<example>/` frames, sheets and
  `frames.json`; `examples/<example>/images/`; that example's `.atlas`;
  [AUTHORING.md](AUTHORING.md) in full; Spine's public documentation; this
  repository's source and README as format documentation; the CLI (`bench` once, at
  the end); and earlier runs' `README.md`/`LOOP.md` for **process** only.
- 🚫 **Forbidden** — `examples/*/export/*.json`; `bench/transcriptions/`; **this
  document's status table and its per-rung sections**; [SPEC_COVERAGE.md](SPEC_COVERAGE.md);
  [`src/ladder.ts`](../src/ladder.ts)'s `gates:` strings; issue bodies carrying counts
  or measures; `bench/render_reference.ts`; git history; and any derived form of any
  of them.

⚠️ **Two of those forbidden entries are this document.** The status table's *New at
this rung* column publishes bone, slot and animation counts per skeleton — the
briefs withhold exactly those, on purpose — and the per-rung sections below publish
every run's measures. **They stay.** They are the ladder's bookkeeping and a reader
of the ladder needs them; what changes is that an authoring run does not read this
file except for *How a rung is scored* and *The honesty rule* above.
[SPEC_COVERAGE.md](SPEC_COVERAGE.md) is on the list for the same reason and more
directly: its parts 3 and 4 inventory every example skeleton's bones, slots,
constraints, attachment kinds and timelines, rung by rung.

📌 **The spineboy run of 2026-08-23 read two of these, and said so.** It used this
table's `ess` row as a **sizing check** (it had been told to read the row) and it
read an AUTHORING.md §3.6 example that stated the reference's `events` block
outright. Recorded, not hidden — the run's README and `LOOP.md` §1 name both — and
**its name-matched figures carry that caveat**. Both leaks are sealed as of
2026-08-23; the rung is re-attempted before clearing is discussed.

The written form of all this, per rung and per run:
[`bench/briefs/`](../bench/briefs/) and [`bench/runs/README.md`](../bench/runs/README.md).

---

## Status

⬜ not attempted · 🟨 attempted, not cleared · ✅ cleared

| Order | Rung | Example | Skeletons | New at this rung | Status |
| ---: | --- | --- | --- | --- | :---: |
| — | **B1** | — | — | skeleton-as-data input model | ✅ |
| — | **B2** | — | — | A16 accepts pre-release labels | ✅ |
| — | **B3** | — | — | packed-atlas handling (validator half done) | 🟨 |
| 1 | **3** | `3-timing-and-spacing` | `ess` | nothing — smallest skeleton in the corpus | ✅ |
| 2 | **1** | `1-weight-and-mass` | `balls`, `drop` | `translatex`/`translatey`/`shear`; bone setup `length`; a skeleton with **zero** animations (`drop`) | ⬜ *attempted* |
| 3 | **2** | `2-the-12-principles` | `ess` | slot `blend` (4 additive + 4 multiply); bone `inherit` ≠ Normal | ⬜ *attempted* |
| 4 | **4** | `4-wave-principle` | `ess` | nothing structural — a volume test (9 bones, 9 slots, 3 animations, 470 bezier keys) | ⬜ *attempted* |
| 5 | **5** | `5-squash-and-stretch` | `ess` | **`drawOrder` timeline**; `inherit: onlyTranslation`; non-unit setup scale | ⬜ *attempted* |
| 6 | **6** | `6-arcs` | `pro` | **transform constraints** (static); **weighted meshes from authored geometry**; mesh `edges` | ⬜ *attempted* |
| 7 | **8** | `8-follow-through` | `ball`, `pendulum` | nothing — both features arrived at rung 6 | 🟨 `pendulum` ✅ · `ball` ⬜ *attempted* |
| 8 | **7** | `7-anticipation` | `sack-pro` | **physics timelines**; a **keyed** transform timeline; **deform**; 20 physics constraints | ⬜ |
| 9 | **spineboy** | `spineboy` | `ess` (+ `pro`, stretch) | **IK**, **events**, **bounding box**, **clipping**, **unweighted meshes**, and scale (`ess`: 18 bones, 20 slots, 8 animations · `pro`: 67 bones, 52 slots, 11 animations) | 🟨 `ess` *attempted, leak-caveated* · `pro` ⬜ |

⬜ **but attempted.** Eight runs across rungs 1, 2, 4/5, 6, 8 and spineboy were made
on 2026-08-23, and none of them cleared a rung —
[`bench/runs/2026-08-23-rung1-1/`](../bench/runs/2026-08-23-rung1-1/),
[`bench/runs/2026-08-23-rung2-1/`](../bench/runs/2026-08-23-rung2-1/),
[`bench/runs/2026-08-23-rung4-1/`](../bench/runs/2026-08-23-rung4-1/),
[`bench/runs/2026-08-23-rung5-1/`](../bench/runs/2026-08-23-rung5-1/), on the
corrected brief, [`bench/runs/2026-08-23-rung2-2/`](../bench/runs/2026-08-23-rung2-2/),
[`bench/runs/2026-08-23-rung6-1/`](../bench/runs/2026-08-23-rung6-1/),
[`bench/runs/2026-08-23-rung8-1/`](../bench/runs/2026-08-23-rung8-1/), and
[`bench/runs/2026-08-23-spineboy-1/`](../bench/runs/2026-08-23-spineboy-1/). **Two
rows are 🟨 rather than ⬜, for different reasons.** Rung 8 came nearest: **its
`pendulum` candidate is cleared and its `ball` candidate is not**, and a rung with two
skeletons clears when both do — rung 1's precedent. spineboy is 🟨 because its `ess`
candidate posted the highest structural figures on the ladder while two of this
repository's own documents were leaking parts of the answer into it; those figures
stand as recorded and carry the caveat, and the rung is re-attempted after the seal
before clearing is discussed. The figures and the commander's reading of each are
below, under *Rung 1* through *spineboy*.

**What the nine runs say so far.** Nine, not eight: the eight above plus rung 3's
second attempt ([`bench/runs/2026-08-23-rung3-2/`](../bench/runs/2026-08-23-rung3-2/)),
which did not change a rung's status but was the first run authored with
[AUTHORING.md §10](AUTHORING.md) in hand. (Rung 3's first attempt is read in its own
section and is not counted here.) `validate` caught **0 FAILs** across all nine —
roughly 165 builds and `check` cycles combined for the first eight, and a ninth whose
gate was green on the first compile of both specs and never went red; rung 8's single
red was a compile error before the gate, not an assertion — and that is the guide
designing invalid states out before a build is attempted, not a sign the rigs were right;
validity was never the open question here. `check` is the instrument that carries
the weight `validate` cannot, and every run used it in the loop rather than once at
the end. What it keeps finding, on a volume test (rung 4), a squash-and-stretch rig
(rung 5) and two independent attempts at a twelve-principles rig (rung 2), is the
same structural gap in two shapes every time — the author's own **slot strategy**
(how many slots a shape gets folded into, and by what rule) and **key density**
(denser than the reference in rungs 4 and 8, sparser in rung 5 and rung 2) — never a
validity defect. Rung 6 adds two more to the list: **curve kind** (keyed linear
against a reference a 4.3 editor exports bezier by default, `curve_kinds` 34/539)
and **static-plateau fidelity** (greedy key reduction sloped a line through a run
of frames the reference holds pixel-identical). And the briefs keep turning out to
be measurement artefacts rather than finished shot descriptions: three of the six
runs found a brief claim wrong that a client watching the shot could have caught,
and the fix each time was to re-measure the pixels, not to trust the prose.

**Writing the conventions down measurably moves the curve and key measures.** That is
the seventh run's finding, and it is the first evidence on the ladder that a guide
changes a figure rather than a habit. Rung 3's second attempt is the same rung, the
same brief, the same frames and the same model as its first, with §10 added and
nothing else: `curve_kinds` went 41/69 → 49/69 (bezier everywhere, 15 named easings,
0 raw `curve` entries) and `key_counts` 42/69 → 49/69, lifting `animations` 0.911 →
0.936, while every other section figure held exactly. That closes the *curve kind*
gap rung 6 named. It does **not** close *key density* — §10.6 says outright that no
public page gives one, and the 20 keys still missing are keys a Bezier span already
explains, which is the one line of §10 no convention read off a public page can
write. The measures §10 cannot reach did not move either, and could not have: names
(granted to the author by the brief) and the two facts a frame does not carry
(`bones.length_present`, `bones.inherit_present`, 1/3 in both attempts). Two
runs' authors went further than `check` on their own initiative: rung 2's second
attempt built a whole-shot contact-sheet comparator because `check` only reads
`fNNNN.png` files and that rung's committed reference set is contact sheets, and
rung 6's author rendered its own candidate back and diffed it frame by frame,
catching a dropped one-frame event, a sloped static plateau and a squash clamp
that never bound — three defects neither `validate` nor `check` had surfaced.

Two facts the table does not repeat, both from SPEC_COVERAGE part 3:

- **No rung uses a named skin.** All twelve example skeletons have exactly one
  skin, called `default`. Named skins, per-skin bones and per-skin constraint
  lists are not on this ladder at all and need some other justification to be
  scheduled.
- **Path constraints, sliders, sequences, linked meshes, dark colour and
  `drawOrderFolder` never appear** anywhere in the corpus. The validator walks
  their timelines (A05 covers all eleven groups) but the ladder will not exercise
  them.

### What passes today

Every one of the twelve example skeletons passes `validate --profile spine`
unmodified — they are editor output, and that is the result the profile split was
supposed to produce. That is a statement about the **validator**, not about rigc's
compiler.

What exists below (B1's proof) is transcription, not authoring, and the
difference between the two is the whole of the honesty rule.

### Rung 3 — cleared (2026-08-23)

The first honest authoring run: [`bench/runs/2026-08-23-rung3-1/`](../bench/runs/2026-08-23-rung3-1/),
authored by Claude Opus 5 (1M context) on Claude Code / Agent SDK, from the brief
([`bench/briefs/3-timing-and-spacing.md`](../bench/briefs/3-timing-and-spacing.md))
and the rendered reference frames alone, under the honesty rule above — **1 build
iteration, validator green on the first compile, clean run** (`bench` run once, at
the end, nothing edited after).

`bench 3`, from [`bench.json`](../bench/runs/2026-08-23-rung3-1/bench.json):

```
bones=0.567  slots=0.476  attachments=0.870  constraints=1.000  animations=0.911  events=1.000
```

With name-agnostic figures (added 2026-08-23, after this run; `attachments` moves
with it — see *Measure changes* above):

```
ess        bones=0.567  slots=0.476  attachments=0.926  constraints=1.000  animations=0.911  events=1.000
           bones 0.567 (name-matched) · 1.000 (name-agnostic)   slots 0.476 (name-matched) · 1.000 (name-agnostic)
```

Those two 1.000s are the reading below, made mechanical: *the tree is right and
the vocabulary is different* is no longer a sentence a person has to assemble out
of the measure table.

**Reading — the commander's call, 2026-08-23.** `bones`/`slots` read low on
**naming only**: bone `count` is 3/3, and both name-agnostic measures —
`depth_histogram` 3/3, `degree_sequence` 3/3 — say the tree has the same number of
bones at each depth and the same child counts, i.e. it is structurally identical;
the tree is right and the vocabulary is different. `constraints`/`events` are
1.000 by absence — vacuous, not evidence of anything. `attachments` (0.870) is as
close as a differently-named rig can get: skin count, attachment count and type
counts are all exact. `animations` (0.911) holds on everything structural —
`count` 2/2, `names` 2/2, `duration` 2/2, `timeline_kinds` 8/8 — the agent
independently chose single-axis `translatex`/`translatey` timelines for the block,
matching the export. The one real gap is key density, `key_counts` 42/69: the
author under-keys by about a third, because 12 fps reference frames cannot show
where the editor split a curve.

Frame-based fidelity (the author's self-check against the reference frames, not
the reference export, so no part of the score above): worst-frame 2.42° of
pendulum rotation, about one frame pixel of block travel, and a re-render mean
absolute pixel error of 3.4/255. Residual risk carried forward: key density — it
is not a visible defect at this rung.

#### Attempt 2 — what the conventions guide moved (2026-08-23)

The rung stays **cleared on attempt 1**; this is not a re-judgement of it. Attempt 2
exists to answer a different question — *does writing the editor's defaults down
change what an agent authors?* — and it is the first run made with
[`docs/AUTHORING.md` §10](AUTHORING.md) (*What the editor does by default*) as a
standard input. Run [`bench/runs/2026-08-23-rung3-2/`](../bench/runs/2026-08-23-rung3-2/),
authored by Claude Opus 5 (1M context) on Claude Code / Agent SDK from the same brief
and the same rendered frames, under the same honesty rule — **clean, validator green
on the first compile**, `bench 3` run once at the end with nothing edited after.

`bench 3`, from [`bench.json`](../bench/runs/2026-08-23-rung3-2/bench.json):

```
bones=0.567  slots=0.476  attachments=0.870  constraints=1.000  animations=0.936  events=1.000
```

With name-agnostic figures (added 2026-08-23, after this run; `attachments` moves
with it — see *Measure changes* above):

```
ess        bones=0.567  slots=0.476  attachments=0.926  constraints=1.000  animations=0.936  events=1.000
           bones 0.567 (name-matched) · 1.000 (name-agnostic)   slots 0.476 (name-matched) · 1.000 (name-agnostic)
```

⚠️ **1.000 name-agnostic is not "every binding is right".** Both attempts draw the
block and the pendulum in the opposite array order to the reference's, which is
the opposite z-order — and name-agnostically those two slots are the same slot
(one region each, on a bone of the same shape), so nothing in that report can see
it. The name-matched `slots.order` is where a swap shows, and at this rung it
reads 1/2 for the naming gap rather than for the swap. Read the pair, not either
figure alone.

| | attempt 1 | attempt 2 |
| --- | ---: | ---: |
| `animations` | 0.911 | **0.936** |
| `animations.key_counts` | 42/69 | **49/69** |
| `animations.curve_kinds` | 41/69 | **49/69** |
| every other section figure | — | unchanged |

**Reading — the commander's call, 2026-08-23.** §10 lifted what §10 can lift, and
nothing else moved. The two measures that carry timing quality are the two that
rose: `curve_kinds` went from 41/69 to 49/69 and is now **bezier everywhere** — 15
named easings, 0 raw `curve` entries, and the only `linear` keys in the file are the
eight last keys, one per track, which cannot carry a curve. That is §10.4's rule
(*"Bezier is the default to adopt; linear is the exception you argue for"*) applied
literally, and it closes
the *curve kind* gap rung 6 had named. `key_counts` rose with it, 42/69 → 49/69, from
§10.3's rule of a key at every change of direction and wherever one Bezier span
cannot hold the shape. The remaining 20 keys are keys a span already explains — at
this rung's 0.118 px/unit they move nothing, so `check` cannot ask for them and only
`bench` can see them. §10.6 is right that no public page gives a density, and this is
the one line of §10 that no convention read off a public page can close. **Rung 8 is
the second run with §10 in hand, and it says both halves again on a shot carrying an
order of magnitude more keys**: `curve_kinds` 165/302 and 344/501 against rung 6's
34/539 for the same
section, and key density still open — 135/302 and 307/501, missed this time from the
*other* side, roughly twice as dense as the reference rather than half. §10.6's
silence cuts both ways.

**And §10 reaches the naming measures too, which nobody expected.** That is the ninth
run's finding. Names are the section every honest run before it read near zero —
rung 3's second attempt scored `bones.names` 1/5 and `attachments.names` 1/3 — and
spineboy's `ess` candidate scored `slots.names` **20/20**, `bones.names` 17/19 and
`attachments.names` 26/29 without ever seeing the reference. The lever is one line of
§10.1: *one image → one slot → one attachment, named after the image*. It works when
the art is named after the parts (`front-shin.png`, `rear-bracer.png`) and does
nothing when it is not (rung 3's two parts are `square` and `pendulum`, where any name
is as good as any other). The art table is a supplied input, so this is convergence
rather than leakage — but see that rung's own entry: two documents **were** leaking,
and the name-matched half of those figures is caveated because of it.

**`bones` and `slots` did not move, and could not have.** Every measure under them
that reads below 1.000 — `names`, `parent_by_name`, `order`, `slots.bone`,
`attachments.names` — is keyed on names, and the brief grants the author its own
(*"Names are yours"*). Both name-agnostic bone measures are 3/3 in both attempts. The
one genuine structural miss is `bones.length_present` and `bones.inherit_present`, 1/3
each in both runs: the reference declares a setup `length` and an `inherit` where
neither attempt declared either. §9.3 lists both as invisible in frames and §10 does
not say what the editor writes — a bone made with Spine's Create tool has a length,
and that belongs in §10. It would move two measures.

⇒ **The structural shortfall left at this rung is names (unwinnable by design, and
granted by the brief), plus what neither frames nor §10 can carry (bone `length`,
setup `inherit`), plus the vacuous 1.000s under `constraints`/`events`.** §10 moved
everything between those two.

**Fidelity.** Attempt 2 is the first rung-3 run measured by `check` itself: framing
fit `x0.999458`, `rms 0.25 px`, union residual `+0.50 × +0.01 px`; `heavy` MAE mean
9.84 / worst slot drift 0.85 px, `light` MAE mean 10.93 / worst slot drift 0.74 px,
every slot attributed in all 86 frames.

⚠️ **Those numbers are not a trend against attempt 1, and must not be read as one.**
Attempt 1 never ran `check` — its fidelity figures come from the author's own scripts
and are different quantities: 2.42° is an *angle*, not a pixel drift, and its 3.4/255
is a *whole-frame* mean where `check`'s 9.84 is over the *union alpha* (§9.2: the
whole-frame figure runs ten to twenty-five times smaller on every set measured so
far). The one pair that does compare term for term is the whole-frame mean, and it is
attempt 2's `meanMaeFrame` — **3.4/255 → 0.41/255** (`heavy`; 0.46 for `light`). The union-alpha MAE that is left
is edge coverage rather than motion: attempt 2 draws about 5 % fewer pixels than the
reference for the same bounding box, and `light`'s held frames f18–f20 sit at 10.04
with drift 0.0.

### Rung 1 — attempted, not cleared (2026-08-23)

Run [`bench/runs/2026-08-23-rung1-1/`](../bench/runs/2026-08-23-rung1-1/), clean,
9 + 2 builds, 0 validator FAILs. Authored by Claude Opus 5 (1M context) on
Claude Code / Agent SDK from the brief and the rendered reference frames alone.

Figures:

```
balls   bones=0.438  slots=0.143  attachments=0.778  constraints=1.000  animations=0.764  events=1.000
drop    bones=0.650  slots=0.557  attachments=0.856  constraints=1.000  animations=1.000  events=1.000
```

**Reading — the commander's call, 2026-08-23.** Motion fidelity is good (author's
spine-core self-check: worst 3.75 px after fixing reversed easings that the
validator cannot see); `drop` is structurally right minus one invisible layer
(`ground-cover` omitted: 4 vs 5 slots — the brief said "two layers" and a pixel
measurement overruled it); `balls` low on naming + slot strategy; two measures are
unwinnable from frames (`region_size_present` — rigc always emits width/height, the
exporter omits them; `bones.length_present`/`inherit` unobservable).

> 🔴 **Correction, 2026-08-23.** The `region_size_present` half of that reading is
> wrong, and the measure it names no longer exists. Spine's exporter does **not**
> omit the fields: all twelve reference exports state a width and a height on every
> one of their 168 regions. What made the measure read `0/8` was that it was keyed
> by name — it could not exceed this run's `attachments.names`, which was `0/16`.
> It has been replaced by the name-agnostic, numeric `attachments.region_size`
> (issue #28), on which this run reads `8/8` and `4/5`; `attachments` recomputes to
> 0.889 / 0.878. See *Measure changes* under **How a rung is scored**. The
> `bones.length_present` / `inherit` half stands. Residual: the
validity gate is blind to wrong animation — an in-loop frame-fidelity check is
being added as `rigc check` (separate issue).

### Rung 2 — attempted, not cleared (2026-08-23)

Run [`bench/runs/2026-08-23-rung2-1/`](../bench/runs/2026-08-23-rung2-1/), clean,
1 build. Same agent, same conditions.

Figures:

```
ess     bones=0.408  slots=0.288  attachments=0.805  constraints=1.000  animations=0.622  events=1.000
```

(candidate 7 bones / 8 slots vs reference 12 / 17)

**Reading — the commander's call, 2026-08-23.** One structural bet (4 ball variants
folded into 3 shared slots with attachment swaps vs one slot per image) moved the
whole slots section; animations 4/4 names.

**Brief defects found by the author**: "water level falls" (bit-identical), "rings
turn slowly" (~24°/frame, ~20½ revolutions, counter-rotating), "panel swings flat
when the ball reaches it" (periodic ~2.3 s cycle, collapses to ~40 %, bowling ball
rides it and is catapulted) — retry after the brief is fixed.

> The brief was corrected on 2026-08-23 against a second, independent pass over the
> contact sheets: [`bench/briefs/2-the-12-principles.md`](../bench/briefs/2-the-12-principles.md)
> revision 2. That pass found three further claims that were not in the pixels, and
> `bench/runs/README.md` now requires a second agent to verify a brief before it is
> run.

### Rung 4 — attempted, not cleared (2026-08-23)

Run [`bench/runs/2026-08-23-rung4-1/`](../bench/runs/2026-08-23-rung4-1/), clean
(PR #33) — 1 build, green on the first compile, then about 40 `check` cycles in
the loop. Authored by **Claude Opus 5 (1M context)**, Claude Code / Agent SDK, from
the brief and the rendered reference frames alone.

Figures:

```
ess     bones=0.499  slots=0.215  attachments=0.772  constraints=1.000  animations=0.854  events=1.000
```

`check` MAE: `ball-catch` mean 17.9 (worst 41.1 at f0082, the middle of the disc's
360° flip between two 12 fps frames); the two whip shots (`wave-by-hand`,
`wave-offset`) 14.3–14.5, flat across their frames.

**Reading — the commander's call, 2026-08-23.** No slot drift was attributable
anywhere in this run: the disc and its five-link chain are one connected component
whenever the parts touch, which in this rig is always, so every frame reported `some
slots ambiguous` and the run had an MAE and nothing else for that measure. Roughly
half of the reported error was `check`'s own framing, not the rig's motion — pinning
the viewport so both sides shared one grid took `wave-by-hand` from 49.45 to 22.96.
Both findings fed directly into #34, closed the same day by
[#39](https://github.com/firejune/rigc/pull/39) — the new framing fits drawn pixels
instead of quad corners, and the new slot matcher's own description names this
rung's drift table as one of the two cases it fixes. The author also over-keyed
against the rung's own gate line — 639 keys against the 470 the gate line
describes — because 12 fps reference frames cluster keys on the 12 fps grid; a
sparser cut of the same measurements (471 keys) is in the run's own log as the more
honest comparison. Neither the framing nor the matcher problem this run hit has
been re-run against the fixed tool; the key-density finding stands regardless of
either.

### Rung 5 — attempted, not cleared (2026-08-23)

Run [`bench/runs/2026-08-23-rung5-1/`](../bench/runs/2026-08-23-rung5-1/), clean
(PR #32) — first build green, about 30 cycles in the loop. Same agent and
conditions as rung 4.

Figures:

```
ess     bones=0.452  slots=0.313  attachments=0.801  constraints=1.000  animations=0.697  events=1.000
```

Attachments 29/29 exact, animations 3/3 by name, key density 387 against the
reference's 2,038, `drawOrder` 2 of 3. `check` MAE ≈4.3, at the rasteriser's own
floor for this course plate (the plate alone, with nothing else in the skeleton,
renders at 4.29 against these frames); the runner's own contribution, +2.06, would
not come down across four different attempts (a four-parameter hip fit, bbox-driven
scaling, limb lengthening, centroid alignment — all tried, all measured worse or no
better, all reverted). The often-quoted "48 px ball drift" was a matcher artefact,
not a rig defect: the ball has no connected component of its own on 29 of 79
frames (touching a ledge, or nearest to the floating girder instead), and on the
50 frames where it does have one, mean drift is 0.35 px — [#39](https://github.com/firejune/rigc/pull/39)'s
own description names this exact number as gone under the new matcher.

**Reading — the commander's call, 2026-08-23.** Residual: key density (387 vs
2,038 — a hand-authored original keeps far more of its own curve shape than a
greedy-insertion fit against 12 fps samples reproduces), and the framing's
fragility — a content box 0.93 % narrower than the reference's moved the same
build's MAE from 4.34 to 39.00 with no change to any key, by far the largest single
effect measured in this run.

### Rung 2, attempt 2 — attempted, not cleared (2026-08-23)

Run [`bench/runs/2026-08-23-rung2-2/`](../bench/runs/2026-08-23-rung2-2/), clean
(PR #35) — 5 builds, all green. Same agent, run against the corrected brief
(revision 2 at the time of the run; revision 3 as of this entry — see below).

Figures:

```
ess     bones=0.308  slots=0.156  attachments=0.762  constraints=1.000  animations=0.623  events=1.000
```

(candidate 10 bones / 15 slots vs reference 12 / 17.) `check` itself only saw
`f0000` and `f0310` per animation — this rung's committed reference set is contact
sheets plus two stills, and `check` reads `fNNNN.png` files only (issue #36). The
run built its own whole-shot instrument instead
([`sheetcheck.ts`](../bench/runs/2026-08-23-rung2-2/sheetcheck.ts)), sampling every
animation at 12 fps and comparing each frame against its tile on the reference's own
contact sheet: flat MAE 4.85–4.95 over all 1,244 frames of the four shots, no spikes
anywhere.

**Reading — the commander's call, 2026-08-23.** Findings from the run: the
lambertian shading disc on each ball needs its own per-ball slot tint rather than a
shared material; the lower ring's rotation is off-centre, its attachment sitting 18
units from its bone, which produces a visible wobble as it turns; the panel's drop
is not monotone — it overshoots to 0.365 of standing height for one frame at the
bottom of the drop before settling at 0.405. Brief revision 2 was still wrong on one
claim: the tennis-ball shot's upper ring and panel are not frame-for-frame identical
with the other three the way the brief said every shot was — corrected in
[`bench/briefs/2-the-12-principles.md`](../bench/briefs/2-the-12-principles.md)
revision 3.

### Rung 6 — attempted, not cleared (2026-08-23)

Run [`bench/runs/2026-08-23-rung6-1/`](../bench/runs/2026-08-23-rung6-1/), clean
(PR #51, merged [`32dda40`](https://github.com/firejune/rigc/commit/32dda40540efcda72f22f8225957a91cc1a0ea35))
— ~14 builds, one red (`A00_ROUNDTRIP_PARSE`: a mesh/atlas name mismatch — the
placeholder was named `trail`, its image `tail.png`, and R5's auto-`path` fill
turns out to be region-only, not mesh-aware). Authored by Claude Opus 5 (1M
context), Claude Code / Agent SDK, from the brief (revision 3, third-party
verified) and the rendered reference frames alone.

Figures:

```
pro     bones=0.433  slots=0.306  attachments=0.321  constraints=0.000  animations=0.810  events=1.000
```

`animations`: `count`, `names`, `duration`, `draw_order` and `deform` all 1.000;
`key_counts` 391/539; `curve_kinds` **34/539** — the author keyed linear, the
reference's keys are overwhelmingly bezier. `constraints` 0/4 — the rung's four
transform constraints leave no trace in rendered pixels, so none were guessed.
`attachments` carries one mesh where the reference carries two.

`check`: MAE **8.73** with the framing fit **not converging** (`x0.999505` after
4 passes); pinned to `frames.json`'s own box, MAE **3.50**, worst attributable
slot drift 4.1 px. (Those are the figures the run reported and they stand as its
record. The gap between them was `check`'s own, not the rig's: it is
[issue #52](https://github.com/firejune/rigc/issues/52), and since it closed the
same artifacts read **3.50 unpinned** — the frames' own box is now used whenever
the candidate is measured to land in it.)

**Reading — the commander's call, 2026-08-23.** Build choices: the ball is bone
`scaleX`/`scaleY` with the product held to 1 (area-preserving), a sibling of the
trail's root bone rather than its parent, so squashing the ball does not squash
the trail. The trail is an **authored mesh with named weights on a six-bone
chain** — the ribbon generator was ruled out rather than tried and dropped:
`buildRibbonMesh` runs its rows along the part window's *height*, and
`tail.png`'s long axis is its *width*, so the generator could not produce this
shape without a rotated copy of the art that was never supplied. On that basis
the rung's actual subject — a bend, not just a translation — was reproduced in
one piece; the trail visibly bends. What is not: curve kind (linear against the
reference's bezier), key density (391/539), the four constraints (unobservable
from frames, and correctly left unguessed), and the f45–f52 hook, where the
reference's trail curls into a ring whose interior shows the stone through it —
confirmed a model limit rather than an optimiser failure (30,000 random poses
per frame plus refinement found nothing better).

**Tool findings** — three defects the gate never caught, all found only by the
author rendering its own candidate back and diffing it frame by frame against
the reference, none of them touched by `validate` or `check`: a key time rounded
to 4 dp landed past the animation's last sample and silently dropped the
one-frame `arc-tracker` reveal (`A09` compares declared duration to loaded
duration, and both sides agreed — the loss was invisible to it; **that one is
now caught**, as a per-timeline compile refusal and a tightened `A09`, issue
\#54 — the other two are still only visible by rendering the candidate back);
greedy key
reduction sloped a line through the reference's frozen f64–f68 plateau, moving
91 px across f67→f68 where the reference moves 3; and a squash clamp meant to
hold the ball's proportion inside [0.72, 1.85] was written as "refuse a step
that leaves the range," which bounds moves and not starts — every frame whose
warm-started fit was already outside the range stayed there, a warm start that
never pulled back, undetected until the emitted keys were read back after
`bench` had already run.

### Rung 8 — attempted, not cleared: `pendulum` cleared, `ball` not (2026-08-23)

Run [`bench/runs/2026-08-23-rung8-1/`](../bench/runs/2026-08-23-rung8-1/), clean
(PR [#75](https://github.com/firejune/rigc/pull/75), merged
[`f4b01c0`](https://github.com/firejune/rigc/commit/f4b01c0); wording follow-up
[#76](https://github.com/firejune/rigc/pull/76), `aa621db`) — two skeletons, two
candidates, `bench` run once per candidate at the end with neither spec touched
after. About 40 builds for the `pendulum` and 25 for the `ball`, nearly all of them
structure and tolerance sweeps rather than fixes; one red all run, and it was a
compile error before the gate (an empty `tracks` array against a declared duration),
not an assertion. Authored by Claude Opus 5 (1M context), Claude Code / Agent SDK,
from the brief (revision 2, third-party verified) and the rendered reference frames
alone, with [AUTHORING.md §10](AUTHORING.md) in hand.

Figures. **A two-skeleton rung prints a line per skeleton whichever candidate you
hand it** ([`bench/runs/README.md`](../bench/runs/README.md)), so each block below is
the *matching* line of that candidate's own run; the other line in each run is one
candidate diffed against the other skeleton's reference and measures nothing.

From the `pendulum` candidate's run:

```
pendulum   bones=0.456  slots=0.857  attachments=1.000  constraints=1.000  animations=0.846  events=1.000
           bones 0.456 (name-matched) · 1.000 (name-agnostic)   slots 0.857 (name-matched) · 1.000 (name-agnostic)
```

From the `ball` candidate's run:

```
ball       bones=0.466  slots=0.929  attachments=0.444  constraints=0.000  animations=0.878  events=1.000
           bones 0.466 (name-matched) · 0.550 (name-agnostic)   slots 0.929 (name-matched) · 0.625 (name-agnostic)
```

`check`: both candidates report `frames.json's own box — the candidate measured into
it`, which is the case [#52](https://github.com/firejune/rigc/issues/52) added, so
**none of the MAE below is framing**. `pendulum` — fit `x1.000902`, rms 0.34 px, MAE
mean **12.52** / worst 17.62 over 45 frames at 12 fps and **12.56** / 21.22 over 88
at 24 fps, worst slot drift **3.3 px**, attributed in every frame of both sets.
`ball` — fit `x0.999441`, rms 0.90 px, MAE mean **16.17** / worst 56.36 and **16.12**
/ 56.72, worst slot drift **5.3 px**.

**Reading — the commander's call, 2026-08-23. The rung is attempted, not cleared:
the `pendulum` skeleton is cleared, the `ball` skeleton is not.** A rung with two
skeletons clears when both do — rung 1's precedent — and this is the first time the
two halves of one run have landed on opposite sides of that line.

**`pendulum` — cleared.** The skeleton is the reference's skeleton with the author's
names on it, and that is measured rather than argued: name-agnostic `bones` and
`slots` are both **1.000** (`count`, `depth_histogram`, `degree_sequence`,
`shape_histogram`, `order_shape`, all 7/7), `attachments` is **1.000 across the
board** including `names` 6/6 and `region_size` 6/6 — §10.1's *the attachment name is
the image name*, doing what it promises — and every name-matched measure that reads
short (`bones.names` 1/13, `slots.bone` 0/6) is the one naming fact counted again.
`slots.order` is **6/6, measured rather than guessed**: the brief settles one edge and
the run settled three more by rendering its own candidate both ways and reading the
same interior detail on both sides, worth 1.402 → 1.335 window MAE.
`animations.draw_order` 1.000 says something weaker — a `drawOrder` timeline is
present or absent alike, and neither side has one — and `constraints` 1.000 is
**vacuous** the same way, neither side having any. Fidelity: worst slot drift 3.3 px,
MAE 12.52 / 12.56 with the framing coincident, and the shot's own subject reproduces
frame for frame in the author's self-check — the same 8-frame horizontal lag and no
vertical lag, the same ~1.5× overshoot (1.52 against 1.53), the same last moving
frame on each part (f79, f84), the same bend peak at f53. The one real gap is key
density, below, and it is not a visible defect.

**`ball` — not cleared: valid, pixel-faithful, structurally different.** The motion
is faithful — worst slot drift **5.3 px**, MAE **16.2**, and the residual is three
poses rather than timing: f24, f60 and f61 of the 24 fps set, where a six-link chain
folds two ways for nearly the same silhouette and a 24-start rescue moved them by
less than a point. The structure is not the editor's: `attachments` **0.444**
(`type_counts` 1/2, `mesh_weighted` 1/2, `region_size` 0/1), name-agnostic `bones`
**0.550** and `slots` **0.625**, `constraints` **0/4**. The reference's four
constraints and its attachment scheme leave no trace in the frames — rung 6's finding
repeated — and the author correctly left constraints unauthored rather than guess.
The trail as one weighted mesh on a six-bone chain, and the ball as a region scaled
by its bone, are **the author's structure, not the editor's**: §9.3 says outright
that a hull moved by a bone chain and the same hull moved by deform keys render to
the same pixels, and `animations.deform` scores 1.000 on both sides, so neither rig
deforms it with keys. **Nothing in the pixels could have chosen between them.** That
is the honest answer for this skeleton, and it is not a defect in the rig.

⇒ **`constraints` splits the two shots from one decision, which is the cleanest
demonstration the ladder has produced that the honesty rule costs something real and
is still the right rule.** The same refusal to guess scored 1.000 on the `pendulum`
(vacuous — the reference has none) and 0.000 on the `ball` (the reference has four).
One won, one lost, and no reading of the pixels could have told the author which.

**Key density — the run's own-goal, and the direction is the opposite of rung 3's.**
`animations.key_counts` reads **135/302** (`pendulum`) and **307/501** (`ball`). The
denominator is the larger of the two key totals, and here it is the candidate's own:
this run **over-keyed by roughly a factor of two**, where rung 3 under-keyed by a
third. It is rung 4's finding under a different mechanism. No density was aimed at —
§10.6 is right that no public page gives one — a **sub-pixel tolerance** was, and a
sub-pixel tolerance against a *fitted* pose series asks for far more than a
hand-animated shot contains. The whole tolerance/keys/MAE curve is in the run's log
and it was measured before the finish line: at 0.6 px the `pendulum` is 238 keys and
1.597 window MAE against the shipped 302 and 1.335. A cut much closer to the
reference's density was available at a cost the author could name, and it was
deliberately **not** re-cut after `bench` had run, because `bench` is the finish
line. Measured, and chosen.

**`curve_kinds` is where §10.4 paid**: 165/302 and 344/501, bezier everywhere from a
fitted table of 12 named easings, no raw `curve` in either file — against rung 6's
34/539 for the same section. The run's own synthetic control says what the curve is
worth alone: two harmonics over 88 samples reduce to **9 keys at 0.88 units of error**
with fitted Beziers and **24.3** with linear spans.

**What the rung introduced: nothing.** Transform constraints and weighted meshes both
arrived at rung 6, and the table says so. So this entry is not about a new feature; it
is about the ladder's recurring gap, for once visible from both sides inside a single
run: **unobservable structure — constraints, mesh-versus-bone, key density — is where
AI output and editor output part ways, and observable motion is where they agree.**
Two candidates, one agent, one session, one set of rules; the only thing separating
their measures is how much of each reference's structure the frames could show.

**Tool and guide findings** — six defects in the guide, none of them visible to
`validate` or `check`, two of which cost the run a loop each. Each is filed:

1. **spine-core 4.3 keeps a bone's local transform on `bone.pose`, not on the bone**
   ([#77](https://github.com/firejune/rigc/issues/77)). `bone.rotation = …` is
   neither an error nor a rotation — every frame renders as the setup pose. §9 tells
   a run to render its candidate back; this is the first thing it hits doing so, and
   it cost a loop and a plausible MAE (17.3) that did not move for any parameter.
2. **A tolerance on a rotation is not a number of degrees**
   ([#78](https://github.com/firejune/rigc/issues/78)). A quarter degree on the last
   link moves the chain's end 0.15 px; the same quarter degree on the first moves it
   0.69 px. One tolerance, in pixels at the end of what the bone swings, divided by
   its lever arm.
3. **Fitting a curve and then writing a different one is a silent 4× loss**
   ([#79](https://github.com/firejune/rigc/issues/79)). Fitting each span's own
   handles and substituting the nearest entry of a named table took the shot from
   1.07 to 4.65 MAE with a green gate and an unmoved `diff`. §10.4 asks for a small
   named table and does not say the table has to be **in hand while the keys are
   chosen**. It does — rung 6's clamp note in another suit.
4. **§9.3's "a mesh or a bone renders the same" has a measurable cost**
   ([#80](https://github.com/firejune/rigc/issues/80)). Following it on the `ball`
   cost `attachments` 0.444 and `bones` 9/12. Not an argument for guessing — an
   argument for §9.3 saying that this invisible choice is one `bench` *does* see, so
   a run records it as a decision instead of discovering it in the measures.
5. **§8's draw-order paragraph is written entirely about reading the reference**
   ([#81](https://github.com/firejune/rigc/issues/81)). The like-for-like version —
   render your own candidate both ways and measure the same interior feature on both
   sides — settled three more edges here, and correctly declined to settle the
   `ball`'s.
6. **`bench` prints a confident line for the skeleton you did not build**
   ([#82](https://github.com/firejune/rigc/issues/82)). The protocol's warning is
   load-bearing and needs a second home where the output is read.

**Two more things the run recorded about itself, neither of them a defect in the
rig.** The own-goal is the key density above — logged with its whole cost curve and
deliberately not re-cut once the finish line was crossed. And the authoring session
was **cut mid-response by an API connection loss** after §10 and resumed from the run
directory: no input changed, the reference export was still never opened, and `bench`
had not yet been run at that point. **The run stays clean** — it is recorded because
a log that omits its own interruptions is not the record this protocol asks for.

### spineboy — attempted, not cleared: `ess` authored under a leak caveat, `pro` not built (2026-08-23)

Run [`bench/runs/2026-08-23-spineboy-1/`](../bench/runs/2026-08-23-spineboy-1/),
clean (PR [#96](https://github.com/firejune/rigc/pull/96), merged
[`5e02159`](https://github.com/firejune/rigc/commit/5e02159)) — `bench spineboy` run
once at the end, with the brief's own command line, and neither spec touched after. `pro` was not attempted: rigc's motion spec has no `ik`,
`transform` or `deform` timelines yet ([#87](https://github.com/firejune/rigc/issues/87)–[#89](https://github.com/firejune/rigc/issues/89)),
so a `pro` candidate could not be complete, and the rung does not clear on it
([#16](https://github.com/firejune/rigc/issues/16)). Authored by Claude Opus 5 (1M
context), Claude Code / Agent SDK, from the brief (revision 2, third-party verified)
and the rendered reference frames alone, with [AUTHORING.md §10](AUTHORING.md) in
hand. The gate was green on the first compile of both specs and no compile error was
hit all run; the loop was `build` + `check` + render-back, plus about 500 fitting
runs of the candidate against the frames.

The matching line, from a run that also printed a `pro` line — this `ess` candidate
diffed against the *other* skeleton, which measures nothing and is not quoted:

```
ess        bones=0.869  slots=0.929  attachments=0.976  constraints=1.000  animations=0.821  events=0.500
           bones 0.869 (name-matched) · 0.922 (name-agnostic)   slots 0.929 (name-matched) · 0.887 (name-agnostic)
```

`bench` was run without `--frames`, so it printed no `check` table; the run's
`check` numbers were taken before it, in the loop. Pinned to `frames.json`'s own box,
MAE means run **18.77** (`idle`), 24.27 (`shoot`), 26.17 (`aim`), 32.00 (`walk`),
32.26 (`death`), 38.99 (`jump`), 42.30 (`run`) and **52.09** (`hit`) at 12 fps, with
worst slot drift 2.8 px on `idle` and **18.2 px** on `hit`.

**Reading — the commander's call, 2026-08-23. The graduation exam is attempted, not
cleared.** `ess` was authored end to end and posted the best structural figures on the
ladder; `pro` was not built at all, and neither of those is why the rung stays open.
**It stays open because two of this repository's own documents were leaking parts of
the answer into the run while it was being authored** — the guide's §3.6 events
example and this document's own status row — so the name-matched half of the figures
below cannot be read as a measurement of authoring. They are recorded, they are
caveated, and **a second attempt after the seal (PR [#97](https://github.com/firejune/rigc/pull/97))
comes before clearing is discussed.** Nothing here is withdrawn; what is withheld is
the pass mark.

**What this run establishes, whatever a reader makes of the pass mark.** These are
the highest structural figures any honest run has recorded: `bones` name-agnostic
**0.922** with `count`, `depth_histogram`, `degree_sequence` and `shape_histogram`
all **18/18**, `slots.count` and `slots.names` both **20/20**, `attachments` **0.976**,
and `animations` `count` / `names` / `duration` all 8/8. The naming figures are the
surprise — every previous run reads near zero there — and the run attributes them to
one convention applied deliberately: §10.1's *one image → one slot → one attachment,
named after the image*, on art that ships as `front-shin.png` and `rear-bracer.png`.

**Three declined guesses came back right.** `constraints` **1.000 at 0/0** and every
`mesh_*` measure **1.000 at 0/0** — `ess` carries neither, so the IK and unweighted
meshes in the row above are `pro`'s, and the run's refusal to author either (frames
cannot show a constraint, and §9.3 says a mesh and a posed region render alike) cost
nothing and gained the sections outright.

**The motion is uneven, and the spread is the finding rather than the mean.** Every
figure is pinned to `frames.json`'s own box, so none of it is framing. `idle` reads
**18.8** MAE with **2.8 px** of worst slot drift and `hit` reads **52.1** with
**18.2 px** on `front-shin` — the same rig, the same fitter, the same session, a
factor of nearly three apart; `run` sits at 42.3 with 4.1 px and `jump` at 39.0 with
4.4 px, so the drift and the MAE do not move together either. The run's own account
of `hit` is that it is a fit failure and not a model one: the shot opens on a
horizontal figure 148 × 80 against a standing setup pose of 100 × 146, and letting
the parts off the hierarchy entirely recovers it only from 54.7 to 47.7. What that
says about the ladder is that a coordinate descent over a character's worth of
parameters is decided by its **starts**, not by its passes — and that a single mean
over eight shots would have hidden every word of it.

**`events` 0.500, and the honest reading is the awkward one.** The candidate declares
two events against a reference that declares one, so both halves of the section read
half — `animations.event_keys` is 5/6, meaning the firings themselves are nearly
right and it is the second *name* that costs it. The author had four frame-pinned
cues in the brief and declared what an animator would. **And the guide had leaked the
reference's one event by name into the same run**, which is why this section is the
one figure here that could have been bought for free: using the leak would have read
1.000 and measured nothing. It reads 0.500 because the run refused it, and that is
the section to look at first when the rung is re-attempted.

🚨 **The name-matched figures are tainted, and the taint is this repository's fault,
not the run's.** `bones` 0.869, `slots` 0.929, `attachments` 0.976 and every `names`
measure under them were authored by an agent that had read this document's `ess` row
(18 bones, 20 slots, 8 animations — used as a sizing check, which is contamination
even when nothing is copied) and the guide's leaked events block. The name-agnostic
figures — `bones` 0.922, `slots` 0.887 — are untouched by the counts and are the half
a reader should weigh. **A second attempt, after the seal, is required before this
rung's clearing is discussed at all.**

**What is short.** `animations.key_counts` 639/1414 and `curve_kinds` 702/1414 sit
under `timeline_kinds` 112/153 — the reference carries timelines this rig does not,
which the run's own reading puts on §10.3's Separate checkbox. `draw_order` 7/8 says
one animation in the reference reorders its slots and none of this candidate's does;
the brief's own search for a draw-order *change* came up empty over both skeletons,
so that one is invisible in the frames by both sides' account. `events` **0.500** has
its own paragraph above; it is the run's most deliberate cost.

**Three build choices worth recording, because each was made against something.**
**The gun is on the far arm, and the brief says otherwise twice** — the run overruled
it on art evidence (a fist is painted into `gun.png`, the art ships a separate fist
only for the front arm, and swapping the two arms' art costs 5 % of the objective),
and the brief's own `death` paragraph reaches the same conclusion its `idle` and
`walk` paragraphs contradict. **The joints are solved, not guessed**: each is the
point two neighbouring parts hold in common across all **132** frames, a linear
least-squares fixed point, reweighted twice to drop frames where a part was covered.
**Every pose is fitted as a composite through the reference's own rasteriser**, never
per part — on a character every frame is a frame where parts touch, and per-part
matching produced an upside-down far arm and a fist on a thigh before anything was
built. The first of those is the one to notice: **the brief is a viewer's report, and
a run that measures it and overrules it is doing the thing this protocol asks for.**

**What was left unauthored, and what that cost.** Constraints and meshes: `ess` has
none of either, so refusing to author them scored 1.000 twice at 0/0 — the same
refusal that cost rung 8's `ball` its `constraints` section outright. A `drawOrder`
timeline: 7/8, above — the reference has one and neither the brief's search nor the
run's sweeps could find it in the frames. Clipping: nothing in `ess` is masked, and
the row's *clipping* is almost certainly `pro`'s. And **`pro` itself**, which is not a
judgement call: rigc's motion spec has no `ik`, `transform` or `deform` timeline
([#87](https://github.com/firejune/rigc/issues/87)–[#89](https://github.com/firejune/rigc/issues/89)),
so a complete `pro` candidate is not expressible today. The rung does not clear on it
([#16](https://github.com/firejune/rigc/issues/16)) and it is a stretch skeleton, so
this costs the attempt nothing — but the ladder cannot say a word about IK, weighted
meshes at scale or clipping until those three land.

⚠️ **The leaks, and what was done about them** (PR [#97](https://github.com/firejune/rigc/pull/97),
merged [`0263774`](https://github.com/firejune/rigc/commit/0263774)). The run named
all three rather than using any of them, which is the only reason this entry can say
what it says. [AUTHORING.md](AUTHORING.md) §3.6 stated the reference's `events` block
outright, in the document the protocol requires an authoring agent to read **in
full** and against §10.6's own rule; §3.4's bounding-box example was a second, and an
audit of the whole guide against the corpus found two more of the same kind beside it
— a clipping polygon and a mesh's bind data, both verbatim. The guide's examples are
now synthetic, and §3 opens with the rule that they are. This table's counts are not
moved — they are the ladder's bookkeeping — and instead *The honesty rule* above now
names this document, [SPEC_COVERAGE.md](SPEC_COVERAGE.md), `src/ladder.ts`'s gate
strings and issue bodies carrying counts as **things an authoring run does not
read**, with the enumerated list in [`bench/runs/README.md`](../bench/runs/README.md)
and a requirement that the prompt quote it.

---

## B1's proof — rung 3 transcribed, not authored

⚠️ **Read the label first.** `bench/transcriptions/3-timing-and-spacing/` holds a
rig spec and a motion spec produced by a throwaway script that read the reference
export and rewrote its numbers. That is **transcription**, and it measures
expressiveness — *can rigc's input formats state this skeleton at all?* — which is
exactly the question B1 was. It measures nothing about authoring, so **rung 3 stays
⬜ and the honesty rule is untouched**: an authoring attempt gets `images/` and a
brief, and it has not happened.

Compiled with:

```bash
bun cli.ts build \
  --rig    bench/transcriptions/3-timing-and-spacing/3-timing-and-spacing-ess.rig.json \
  --motion bench/transcriptions/3-timing-and-spacing/3-timing-and-spacing-ess.motion.json \
  --images examples/3-timing-and-spacing/images \
  --out    <dir> --profile spine
bun cli.ts bench 3 --candidate <dir>
```

`bench 3`, verbatim — re-run 2026-08-23, after `bones`/`slots` gained their
name-agnostic figures (#21) and `region_size_present` became `region_size` (#28):

```
  ── summary ──
  validate   green  (profile spine)
  ess        bones=1.000  slots=1.000  attachments=1.000  constraints=1.000  animations=1.000  events=1.000
             bones 1.000 (name-matched) · 1.000 (name-agnostic)   slots 1.000 (name-matched) · 1.000 (name-agnostic)
```

```
    bones                 mean 1.000  over 8 measures
        1.000  count                        3/3         how many bones
        1.000  names                        3/3         the bone names themselves
        1.000  parent_by_name               3/3         each bone hangs off the same parent
        1.000  order                        3/3         the bones are declared in the same order
        1.000  length_present               3/3         a setup `length` is present or absent alike
        1.000  inherit_present              3/3         a setup `inherit` is present or absent alike
        1.000  depth_histogram              3/3         NAME-AGNOSTIC: as many bones at each depth
        1.000  degree_sequence              3/3         NAME-AGNOSTIC: as many bones with each child count

    bones (name-agnostic) mean 1.000  over 5 measures  — the same two skeletons compared with names thrown away
        1.000  count                        3/3         how many bones
        1.000  depth_histogram              3/3         as many bones at each depth
        1.000  degree_sequence              3/3         as many bones with each child count
        1.000  shape_histogram              3/3         as many bones of each depth-and-child-count shape (`d1c3` = one hop down, three children)
        1.000  order_shape                  3/3         the bones are declared in the same order of shapes

    slots                 mean 1.000  over 7 measures
        1.000  count                        2/2         how many slots
        1.000  names                        2/2         the slot names themselves
        1.000  order                        2/2         the slots array IS the draw order, so its order is data
        1.000  bone                         2/2         each slot is bound to the same bone
        1.000  attachment                   2/2         each slot shows the same setup attachment
        1.000  blend                        2/2         each slot uses the same blend mode
        1.000  color_present                2/2         a tint is present or absent alike

    slots (name-agnostic) mean 1.000  over 4 measures  — the same two skeletons compared with names thrown away
        1.000  count                        2/2         how many slots
        1.000  attachment_types_by_position 2/2         the same kind of attachment sits at each position in the draw order
        1.000  bone_binding_shape           2/2         as many slots hang off a bone of each shape (`?` = no such bone is declared)
        1.000  order_shape                  2/2         the draw order is the same order of `<attachment type>@<bone shape>`

    attachments           mean 1.000  over 9 measures
        1.000  skins                        1/1         the skin names
        1.000  count                        2/2         how many attachments
        1.000  names                        2/2         skin/slot/attachment keys
        1.000  type_counts                  2/2         as many of each attachment type
        1.000  mesh_vertices                0/0         each mesh has the same vertex count  — neither side has any
        1.000  mesh_triangles               0/0         each mesh has the same triangle count  — neither side has any
        1.000  mesh_weighted                0/0         each mesh is weighted, or is not, alike  — neither side has any
        1.000  mesh_hull                    0/0         each mesh declares the same hull length  — neither side has any
        1.000  region_size                  2/2         NAME-AGNOSTIC: as many regions of each stated size (`unstated` is its own size)

    constraints           mean 1.000  over 5 measures
        1.000  count                        0/0         how many constraints  — neither side has any
        1.000  names                        0/0         the constraint names  — neither side has any
        1.000  type_counts                  0/0         as many of each constraint type  — neither side has any
        1.000  type_by_name                 0/0         each constraint is the same type  — neither side has any
        1.000  refs                         0/0         each constraint names the same bones and slots  — neither side has any

    animations            mean 1.000  over 9 measures
        1.000  count                        2/2         how many animations
        1.000  names                        2/2         the animation names
        1.000  duration                     2/2         each animation runs as long (last key time, within one frame)
        1.000  timeline_kinds               8/8         the same timelines exist
        1.000  key_counts                   69/69       those timelines carry as many keys
        1.000  curve_kinds                  69/69       as many linear / stepped / bezier keys
        1.000  event_keys                   0/0         as many event firings  — neither side has any
        1.000  draw_order                   2/2         a draw-order timeline is present or absent alike
        1.000  deform                       2/2         a deform timeline is present or absent alike

    events                mean 1.000  over 2 measures
        1.000  names                        0/0         the event names  — neither side has any
        1.000  payloads                     0/0         each event carries the same typed payload  — neither side has any
```

Eleven of those measures are **vacuous** and say so (`0/0`, "neither side has
any"): the four mesh figures and every constraint and event figure. A rung with
meshes or constraints will not get them for free.

The two name-agnostic blocks are 1.000 here for the least interesting reason
available — a transcription has the reference's own names, so there is no gap for
them to be measuring. They earn their keep on an authoring run, where the names
are the author's; rung 3's two attempts are where to read them.

### What the transcription cost — two motion-spec extensions

Both were structural gaps rather than inconveniences, so both were closed in the
format rather than worked around in the transcription:

1. **Single-axis bone timelines.** `translatex`, `translatey`, `scalex`, `scaley`,
   `shear`, `shearx`, `sheary` joined `translate`/`scale`/`rotate`. Not sugar:
   Spine keys them as separate timelines, so an export that used `translatex`
   alone is not reproduced by a `translate` whose y channel is flat — the key
   counts differ, and `animations.key_counts` would have caught the difference.
   Rung 3 needed two of them; rungs 1 and 5 need the rest.
2. **A raw `curve` on a key**, holding the absolute (time, value) control points
   verbatim. A named easing can only say "this shape, wherever it is used"; an
   editor export carries a different bezier per key per channel, and rung 3's 54
   bezier keys share no handles at all. Named easings stay rule 2's recommended
   path — a key may carry `ease` or `curve`, never both — and the raw array is
   length- and finiteness-checked on the way in, because a short one multiplies
   `undefined` into the cubic and yields NaN with no error.

Nothing else had to move. In particular the emitted `skeleton.json` needed no new
attachment type, no new constraint type and no packer: rung 3's own atlas was not
required, because rigc emitted a one-part-per-page atlas from the two loose PNGs in
`images/` (which is why B3's emitter half did not block this).

---

## Licence, per rung

The examples are Esoteric Software's. Their `license.txt` grants image
redistribution **only when accompanied by that file**, and **never for commercial
use**; the project files and exports are public domain.

🚫 **Rung 7 (`7-anticipation`) has no `license.txt` upstream at all.** Its images
are covered by no explicit grant, so:

- Measure against it — reading a file is not redistribution.
- **Never vendor, commit, publish or ship its images**, and never include them in
  a released artefact of any kind.
- `scripts/fetch-examples.sh` names it in its closing warning for this reason.

`examples/` is gitignored for the whole corpus, which keeps the general case
right by construction; rung 7 is the case where a one-off "just this once" copy
would be a licence problem rather than a tidiness problem.

---

## Running a rung

```bash
bun run fetch-examples                 # once; examples/ is gitignored
bun bench/render_reference.ts --rung 3 # the frames the authoring agent may see
bun cli.ts bench 3 --candidate path/to/candidate/spine
bun cli.ts bench 3 --candidate candidate.json --atlas some.atlas --json report.json
```

A rung is *run* rather than benched: a fresh agent, the brief in
[`bench/briefs/`](../bench/briefs/), the frames in [`bench/reference/`](../bench/reference/),
and the protocol in [`bench/runs/README.md`](../bench/runs/README.md).

`bench <rung>` takes `1 … 8` or `spineboy`. Rungs 1 and 8 carry two skeletons and
both are benched and reported. `spineboy-pro` is reported as a **stretch** figure
and does not count towards the rung: it is a harder rig than the graduation exam,
and folding it in would make the exam unpassable for a reason unrelated to
passing it.

`bench` exits non-zero only when stage 1 fails. The diff has no threshold, so it
cannot fail — read it.
