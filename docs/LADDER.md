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
| 7 | **8** | `8-follow-through` | `ball`, `pendulum` | nothing — both features arrived at rung 6 | 🟨 `pendulum` ✅ · `ball` ⬜ ×2, remainder unobservable |
| 8 | **7** | `7-anticipation` | `sack-pro` | **physics timelines**; a **keyed** transform timeline; **deform**; 20 physics constraints | ⬜ |
| 9 | **spineboy** | `spineboy` | `ess` (+ `pro`, stretch) | **IK**, **events**, **bounding box**, **clipping**, **unweighted meshes**, and scale (`ess`: 18 bones, 20 slots, 8 animations · `pro`: 67 bones, 52 slots, 11 animations) | 🟨 `ess` ⬜ ×3 — structure ✅, motion improving (18.8→14.6 px) · `pro` ⬜ |

⬜ **but attempted.** Eleven runs across rungs 1, 2, 4/5, 6, 8 and spineboy have been
made — eight on 2026-08-23 and three finished 2026-08-24 — and none of them cleared a
rung: [`bench/runs/2026-08-23-rung1-1/`](../bench/runs/2026-08-23-rung1-1/),
[`bench/runs/2026-08-23-rung2-1/`](../bench/runs/2026-08-23-rung2-1/),
[`bench/runs/2026-08-23-rung4-1/`](../bench/runs/2026-08-23-rung4-1/),
[`bench/runs/2026-08-23-rung5-1/`](../bench/runs/2026-08-23-rung5-1/), on the
corrected brief, [`bench/runs/2026-08-23-rung2-2/`](../bench/runs/2026-08-23-rung2-2/),
[`bench/runs/2026-08-23-rung6-1/`](../bench/runs/2026-08-23-rung6-1/),
[`bench/runs/2026-08-23-rung8-1/`](../bench/runs/2026-08-23-rung8-1/),
[`bench/runs/2026-08-23-spineboy-1/`](../bench/runs/2026-08-23-spineboy-1/), and then
the two second attempts and a third,
[`bench/runs/2026-08-23-rung8-2/`](../bench/runs/2026-08-23-rung8-2/),
[`bench/runs/2026-08-23-spineboy-2/`](../bench/runs/2026-08-23-spineboy-2/) and
[`bench/runs/2026-08-24-spineboy-3/`](../bench/runs/2026-08-24-spineboy-3/). **Two
rows are 🟨 rather than ⬜, and the re-attempts make both of them mean
something sharper than they did.** Rung 8 came nearest and still does: **its
`pendulum` candidate is cleared and its `ball` candidate is not**, and a rung with two
skeletons clears when both do — rung 1's precedent. `ball` has now been authored
twice; the second attempt matches the editor on everything the frames can show and
stops at the same four constraints and the four bones they drive, which no pixel can
carry — so **further `ball` attempts are not warranted without a new observable
input**. spineboy was 🟨 because two of this repository's own documents were leaking
parts of the answer into its first attempt; the seal held for the second, which posted
the ladder's first character-scale skeleton — the reference's bone count, tree shape
and naming, arrived at from the art alone — while leaving 11–19 px of slot drift on
three shots of a 100 × 146 px figure. **The third attempt is the first evidence that
the remaining half is workable at all**: it took the second's own per-chain dashboard
as a work order and moved every failure that dashboard named — worst slot drift
18.8 → 14.6 px, and the per-frame disagreements that say a limb teleports from 14 to 3
— without reaching the 0.7–3.3 px every cleared candidate posts. It stays 🟨 because
the graduation question has two halves and only one of them is answered. The figures
and the commander's reading of each are below, under *Rung 1* through
*spineboy, attempt 3*.

**What the twelve runs say so far.** Twelve, not eleven: the eleven above plus rung 3's
second attempt ([`bench/runs/2026-08-23-rung3-2/`](../bench/runs/2026-08-23-rung3-2/)),
which did not change a rung's status but was the first run authored with
[AUTHORING.md §10](AUTHORING.md) in hand. (Rung 3's first attempt is read in its own
section and is not counted here.) `validate` caught **0 FAILs** across all twelve —
roughly 165 builds and `check` cycles combined for the first eight, a ninth whose
gate was green on the first compile of both specs and never went red, two second
attempts that added about 30 builds each with the gate green throughout, and a third
spineboy attempt whose gate was green on every compile and finished 18 PASS, 0 FAIL; rung 8's
single red, on its first attempt, was a compile error before the gate, not an
assertion — and that is the guide
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
and the fix each time was to re-measure the pixels, not to trust the prose. The
second attempts add a fourth and a worse kind — spineboy's revision 2, which
*carries* a third-party pass, contradicted itself on which hand holds the gun
([#111](https://github.com/firejune/rigc/issues/111)) — so a verification pass
catches wrong claims and does not yet catch inconsistent ones. That one took a
*second* third-party pass to close: revision 3 (2026-08-24) re-derived the arm from
the frames rather than choosing a side, and the gun is in the **far** hand, as both
attempts had found.

**The interim reading, after twelve honest runs on eight rungs.** An agent authoring
through rigc, from a brief and rendered frames alone, **reliably produces valid
Spine** — 0 FAILs in twelve runs, and the reds that did happen were compile errors
before the gate — **with pixel-faithful motion on a small rig**: every cleared
candidate sits at **0.7–3.3 px** of worst slot drift, and the rig reproduces the
editor's own *structure* wherever the pixels constrain it, which rung 3, rung 8's
`pendulum` and spineboy's skeleton now demonstrate three different ways and at three
different scales. It parts from editor output in exactly two places. **(a)
Unobservable structure** — constraints, mesh-versus-bone, key density: facts a frame
cannot show, that `bench` measures all the same, and that no authoring convention can
reach, because there is nothing in the input to read them off. **(b) Motion fidelity
on a many-joint character** — spineboy's `ess` carried 11–19 px of drift on three of
its eight shots at attempt 2 and 14.6 px at worst on attempt 3, and its own defect list
says why: the bottleneck is **pose fitting**,
not the format, not the validator, and after the seal no longer the documents. Those
are two different kinds of gap and they want two different answers — (a) is a question
about what the protocol hands a run, and (b) is a question about method. **Attempt 3 is
the first sign that (b) has answers rather than only a name**: reading `check`'s
per-frame column before its MAE, and starting a pose fit from more than one pose, moved
every figure attempt 2's dashboard named. They did not move it far enough.

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

> ➡️ **`ball` was re-authored on 2026-08-24**
> ([`bench/runs/2026-08-23-rung8-2/`](../bench/runs/2026-08-23-rung8-2/), read
> below). It closed the observable half of the gap below — `attachments` 0.444 →
> **0.667**, with `type_counts` and `mesh_weighted` both 1.000 — and stopped at the
> same `constraints` 0.000. `pendulum` was not re-authored; its clearing below stands.

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

> ➡️ **The second attempt has since happened**
> ([`bench/runs/2026-08-23-spineboy-2/`](../bench/runs/2026-08-23-spineboy-2/),
> read below, 2026-08-24). It was authored after the seal and read nothing this
> document or the guide leaked, so **it, not this entry, is the measurement of
> authoring.** The deltas: `bones` 0.869 → **0.904** name-matched and 0.922 →
> **0.956** name-agnostic, `slots` 0.929 → **0.831** and 0.887 → **0.798**,
> `attachments` 0.976 → **0.955**, `animations` 0.821 → **0.806**, `events` 0.500
> unchanged. Everything below stands as recorded; nothing below is withdrawn.

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

**What this run establishes, whatever a reader makes of the pass mark.** These were
the highest structural figures any honest run had recorded, and the post-seal attempt
went past them on `bones` without the leak: `bones` name-agnostic
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

### Rung 8, attempt 2 — `ball` re-authored: attempted, not cleared (2026-08-24)

Run [`bench/runs/2026-08-23-rung8-2/`](../bench/runs/2026-08-23-rung8-2/), clean
(PR [#109](https://github.com/firejune/rigc/pull/109), merged
[`792c5b3`](https://github.com/firejune/rigc/commit/792c5b3)) — **the `ball`
skeleton only**. `pendulum` cleared on attempt 1 and was not re-authored, so the
`pendulum` line this run's `bench` prints is a comet rig measured against a pendulum
export; it is noise and it is quoted nowhere. Eleven loop turns, nine of them builds,
with about forty `check`-equivalent render comparisons between them; `bench` run
once at the end and nothing edited after. Authored by Claude Opus 5 (1M context),
Claude Code / Agent SDK, from the brief (revision 2, third-party verified) and the
rendered reference frames, with [AUTHORING.md §10](AUTHORING.md) in hand.

The `ball` line, verbatim:

```
ball       bones=0.448  slots=0.929  attachments=0.667  constraints=0.000  animations=0.876  events=1.000
           bones 0.448 (name-matched) · 0.517 (name-agnostic)   slots 0.929 (name-matched) · 0.750 (name-agnostic)
```

`check`, on both frame sets, in `frames.json`'s **own** box rather than a fit — the
rig is authored in the coordinates `frames.json` records, so **none of these figures
carries the fit's own floor**: MAE mean **17.26** over 45 frames at 12 fps and
**18.00** over 88 at 24 fps, worst slot drift **4.2 px**, and all 44 and all 87
adjacent pairs changing by as much as the reference's own frames do.

**Reading — the commander's call, 2026-08-24. Attempted, not cleared — and the rung
stays 🟨 for the reason it did before, not a new one.**

**On everything the frames can show, the candidate now matches the editor.** Slot
`names`, `order`, `attachment` and `blend` are **1.000** each;
`attachments.type_counts` and `attachments.mesh_weighted` are **1.000** where attempt
1's `attachments` section read 0.444 on those two reading 1/2 apiece;
`animations.duration` is 1.000; and the per-frame column reports agreement on **every**
adjacent pair in both sets — no held pose that is not held, no one-frame event that
never fires. Motion fidelity holds at 4.2 px of worst slot drift with the framing
coincident. This is a better rig than attempt 1's on every axis the pixels reach.

**What remains is the same unobservable remainder as rung 6, and it is the whole of
the gap.** Eight bones against twelve, and **0 of 4** constraints. The reference's
four constraints leave no trace in the pixels — a physics chain and a hand-keyed
chain draw identical frames — and the four bones they drive go with them. The run
authored none rather than guess a family, a target and five tuning numbers, which is
the same refusal that scored 1.000 on the `pendulum` and 0.000 here. ⇒ **Further
`ball` attempts are not warranted without a new observable input.** A second honest
run has now converged on everything the frames constrain and stopped at exactly the
same wall; a third would spend a session to re-measure that wall.

⚠️ **The open question, recorded and not decided: a constraint hint in the brief
would be a protocol change, not an authoring improvement.** It would put in the
brief a fact the frames cannot carry, which is a different bargain from the one
every rung on this ladder has been run under, and it belongs to whoever revises the
protocol rather than to a run. [#20](https://github.com/firejune/rigc/issues/20) is
the same shape of question for key density.

⚠️ **One leak, and the run recorded it rather than burying it.** The mesh-versus-region
choice for the ball came from [AUTHORING.md](AUTHORING.md) §9.3, which stated this
rung's reference structure outright, in a document the protocol requires an
authoring agent to read **in full**. `attachments.mesh_weighted` reads 1.000 because
of that sentence and not because the frames said so — the run says as much in its
own §1 and again beside the build choice. §9.3's example is now synthetic
(PR [#120](https://github.com/firejune/rigc/pull/120), merged
[`9ad2dff`](https://github.com/firejune/rigc/commit/9ad2dff)), the way §3.6's was
after the first spineboy run. The `attachments` figure above carries the caveat; the
rest of the section does not depend on it.

**Key density: `key_counts` **0.589**, and the direction is over-keying again.** The
run authored **521** keys where the measure's numerator is 307 — the same numerator
attempt 1 posted against its own 501, so the figure is *under* attempt 1's 0.613
because this rig keys denser still, not because it moved toward the reference. No
density was aimed at; a tolerance was — 0.3 px measured at each bone's own lever arm,
converted per bone — and the whole trade was measured before the finish line was
crossed (0.6 px → 439 keys → 17.26 becomes 18.22; 0.45 px → 482 → 17.54). The run's
own arithmetic says the knob was pinned: the ball's median frame-to-frame
acceleration is 6.4 px, so a linear span across one skipped 24 fps sample already
deviates about 1.6 px, and **any** tolerance under roughly 1.5 px keys nearly every
frame. That is a fact about the shot, not a choice by the author, and it is
[#112](https://github.com/firejune/rigc/issues/112).

**Where §10 paid, and what it still cannot reach.** `curve_kinds` **0.691** from an
eight-shape `easings` table planned in §10.4's two passes, with the table in hand
while the keys were chosen — no fitted-then-snapped handles anywhere
([#79](https://github.com/firejune/rigc/issues/79) applied). The one gap §10.4 left
was the single-frame span, where no shape is constrained by the samples at all: the
run took Spine's own automatic handles from the neighbouring keys rather than the
linear a "no information" default writes, which moved nothing at the samples
(17.34 → 17.26) and everything in `curve_kinds`
([#113](https://github.com/firejune/rigc/issues/113)).

**And the run read three null results as null**, which is the finding worth carrying
off this attempt. Trail length scale, trail width scale and draw order each produced
a spread inside the objective's own scatter; reading any of them as a winner would
have shipped a wrong number with a measurement's authority. Two were re-decided by a
direct measurement of the art, and the third shipped on stated reasoning. §8 already
has the sentence that saved it and it is buried in the draw-order paragraph
([#114](https://github.com/firejune/rigc/issues/114)).

**Known-wrong, in the run's own words:** mesh topology is invented and the frames
cannot see any of it; MAE 17–18 is this rig's structural floor rather than the fit's
noise, concentrated on a trail cross-section the reference reads about 12 px wide
where `tail.png` at its own scale renders 9; and two poses (`f0023`, `f0030`) come
from the pixel fit alone, on frames the brief says carry no measurable ball.

### spineboy, attempt 2 — the first after the seal: attempted, not cleared (2026-08-24)

Run [`bench/runs/2026-08-23-spineboy-2/`](../bench/runs/2026-08-23-spineboy-2/),
clean (PR [#110](https://github.com/firejune/rigc/pull/110), merged
[`ee5ea9c`](https://github.com/firejune/rigc/commit/ee5ea9c)) — **`ess` only**, in a
fresh session and its own worktree. **This is the attempt after the seal, and this
one counts**: the reading list in its [`LOOP.md`](../bench/runs/2026-08-23-spineboy-2/LOOP.md)
§1 records both sides of what was and was not opened, and neither this document nor
the guide's events block was among them. About 30 builds; the gate was green on the
first compile of the real rig spec and on every compile after it, and no
`CompileError` was hit all run. Authored by Claude Opus 5 (1M context), Claude Code /
Agent SDK, from the brief (revision 2, third-party verified), the frames, the art
and [AUTHORING.md §10](AUTHORING.md). `pro` was not attempted and does not gate the
rung ([#16](https://github.com/firejune/rigc/issues/16)); the `pro` line `bench`
prints from an `ess` candidate is noise and is quoted nowhere.

**No breach, and two things declared rather than tidied away.** `bench` was invoked
**twice**, back to back with nothing changed between them, because the first call
omitted `--frames` and so printed no `check` table the protocol asks the run to
record; and a `gates` string arrived inside `bench`'s own output. Both are in
`LOOP.md` §14. The run stays clean.

The `ess` line, verbatim:

```
ess        bones=0.904  slots=0.831  attachments=0.955  constraints=1.000  animations=0.806  events=0.500
           bones 0.904 (name-matched) · 0.956 (name-agnostic)   slots 0.831 (name-matched) · 0.798 (name-agnostic)
```

`check`, framing **one per set (16)**, of which only **3** took the declared box —
so some of every figure below is framing, and `--viewport` was not used to hide it.
Worst by shot: `hit` **58.51**, `run` **57.28**, `jump` **52.39**; worst slot drift
`death` **18.8 px**, `shoot` **16.3 px**, `run` **11.5 px**. Pinning the box by hand,
for the same skeleton with no key changed, gives `death` 38.87, `jump` 38.83, `run`
44.53, `shoot` 37.03, `walk` 32.18, `hit` 49.42, `aim` 41.22 and `idle` unchanged at
23.53 — [`ess/check-pinned.txt`](../bench/runs/2026-08-23-spineboy-2/ess/check-pinned.txt).
Those pinned figures are the run's own control, **not** the headline; the unpinned
ones are what `bench` prints and they are what is quoted here.

**Reading — the commander's call, 2026-08-24. The graduation exam is attempted, not
cleared, and the graduation question is answered in two halves: skeleton yes, motion
not yet.**

**Structurally, the candidate is the editor's skeleton.** `bones.count` **18/18**,
`depth_histogram` and `degree_sequence` both **1.000** — the same tree, of the same
size, with the same shape, arrived at from the art alone. Bone names **17/19** and
`parent_by_name` 17/18, which is §10.1 doing exactly what it promises on art that
ships one PNG per body part. `attachments` **0.955**. `constraints` **1.000**, by
absence: `ess` carries none and neither does this rig, and the run records that as a
decision not to guess rather than a lucky one. And the animation inventory is
complete — `animations.count`, `names` and `duration` all **8/8**, the durations
authored as exact thirtieths from the brief's two rates and every one of them inside
`diff`'s one-frame window. Nothing there was tuned. This is the ladder's first
character-scale rig and its structure is the reference's.

**In motion it is not at editor quality.** On a figure 100 × 146 px, three of the
eight shots carry 11–19 px of slot drift — `death` 18.8, `shoot` 16.3, `run` 11.5.
That is a **visible** error on a figure that size, and it stands against the
**0.7–3.3 px** every cleared candidate on this ladder posts (rung 3's two shots at
0.85 and 0.74 px, rung 8's `pendulum` at 3.3). The run's own calibration is worth having beside
the MAE means — two *reference* frames of `run` one twelfth of a second apart differ
by 88.2 in the same units — and it does not rescue the drift figures, which are
per-slot and framing-independent in a way the means are not.

⇒ **The limit is no longer the format, and it is no longer the documents.** The gate
was green from the first compile of the real spec and never went red; the leak seal
held and this run read nothing it should not have. **The limit is pose-fitting
method** — and the evidence is that every guide defect this run filed is about
obtaining a pose: the `bone.data.setupPose` twin of §9.1's trap
([#115](https://github.com/firejune/rigc/issues/115)), region attachment offsets
cached until `updateSequence()` ([#116](https://github.com/firejune/rigc/issues/116)),
§10.3's gauge fold and the precondition that makes it exact
([#117](https://github.com/firejune/rigc/issues/117)), and the missing section on
how to *get* a pose for a many-joint figure at all — reduced-resolution compare
before full, and a full-range scan per knob rather than a line search
([#118](https://github.com/firejune/rigc/issues/118)). That last pair alone took
`run` from a mean of 50.2 to 45.8 and stopped the fitter producing figures with
their legs folded under them. **That is where the next lever is.**

**`events` 0.500 is the honesty rule's price, paid again and worth it.** `events.names`
**1/2** and `event_keys` 4/5 — the firings are nearly the right count in the right
animations and it is the second *name* that costs it, on a spelling the brief
deliberately declines to give. Attempt 1 paid the same price for the same reason and
the figure means the same thing.

**`draw_order` 7/8: one reference animation re-orders its slots and none of this
candidate's does.** The brief's own search came up empty over both skeletons and
§11's like-for-like test found no frame where a different order pays by more than the
objective's own scatter. **73 like-for-like frames could not see it.** That is the
rung 8 finding again in a third suit: a structural fact with no pixel consequence.

**Key density, and the same own-goal from different machinery.** `key_counts`
**654/1368** — the reference carries roughly half the keys this rig does. No density
was aimed at; 0.8 px at each bone's lever arm was, against a pose series fitted *per
frame*, and a sub-pixel tolerance against a fitted series asks for far more than a
hand-animated shot contains. The trade was measured (0.4 px → 872 keys → 41.71; 0.8 →
779 → 41.85; 1.6 → 694 → 42.44; 3.0 → 609 → 44.58) and 0.8 px shipped because MAE is
flat below it and rises above. `curve_kinds` **507/1368** has the same shape with one
extra cause — every span that a straight line could not describe took a Bezier from
the ten-entry table, so the *kinds* are right in character and there are twice as many
keys carrying them. `slots.order` 12/21 and `bones.order` 9/18 are **declaration
order**, not draw order: `slots.count` 20/21 and `slots.bone` 18/21 say the same slots
hang off the same bones.

**Build choices worth recording, because each was made against something.**
**Render-into-viewport fitting for every number** — no estimator on a character
survives §8's first trap, so the objective is the picture, through the same
rasteriser that drew the reference; the setup pose is fitted against ten frames drawn
from every shot at once, because a wrong offset hides inside one frame's rotations
and cannot hide across frames. **The gun hangs off the rear arm, against the brief,
on art evidence** — the brief says *near hand* twice while its own `death` paragraph
establishes that a fist means the near arm, and the art draws a second fist free of
the gun in `idle`, `aim` and `death`. The run reported the defect rather than using
it; it became [#111](https://github.com/firejune/rigc/issues/111), and the brief's
**revision 3** (2026-08-24) settled it by measurement in the run's favour — the gun is
in the far hand, `idle` and `walk` now say so, and the attemptability row in
[`bench/runs/README.md`](../bench/runs/README.md) no longer carries a caveat. **A ten-entry `easings` table planned in
§10.4's two passes**, at one tolerance of 0.8 px per lever arm, with no raw `curve`
anywhere.

**Left unauthored by rule, and each of them cost or gained nothing by luck.**
Constraints and meshes — `ess` has neither, so the refusal scored 1.000 twice at 0/0,
which is the same refusal that costs rung 8's `ball` its whole `constraints` section.
A `drawOrder` timeline — 7/8, above. A bounding box — the run calls this its most
arguable omission, since the brief devotes a numbered item to hit regions and is
equally clear the frames cannot show one. And `eye`/`mouth` keys — the goggles cover
the eyes on every frame and the mouth is 6–8 px across, so which shot uses which is
a coin flip the brief says outright is unreadable.

⚠️ **One tool finding that is not a guide defect, filed separately.** `mae` divides
by the pixels either side drew, so a large mostly-transparent sprite adds cheap
pixels and the *mean* falls. The muzzle flare found that hole, an unclamped fit
walked its scale to **13×**, and it pushed this candidate's union 32 px wider than
the reference's — costing **every** set in `check` its framing (shared-fit rms
13.98 px → 7.08 px once fixed). That denominator is the right one for comparing two
builds and the wrong one to optimise against, and `check` publishes it without
saying so: [#119](https://github.com/firejune/rigc/issues/119).

⇒ **spineboy stays 🟨.** The skeleton half of the graduation question is answered and
answered well; the motion half is not, and no amount of further authoring convention
closes it. It closes with a better fitter.

### spineboy, attempt 3 — the measure-first loop works: attempted, not cleared (2026-08-24)

Run [`bench/runs/2026-08-24-spineboy-3/`](../bench/runs/2026-08-24-spineboy-3/), clean
(PR [#136](https://github.com/firejune/rigc/pull/136), merged
[`53acfe7`](https://github.com/firejune/rigc/commit/53acfe7)) — **`ess` only**, in its
own worktree, from the brief's **revision 3**, the one the second third-party pass
settled the gun hand on. About the same shape of loop as attempt 2: the gate was green
on every compile and finished **18 PASS, 0 FAIL**, 2 SKIP, 14 PROF under
`--profile spine`, both SKIPs argued in the run's README as decisions rather than gaps.
Authored by Claude Opus 5 (1M context), Claude Code / Agent SDK, with
[AUTHORING.md §10](AUTHORING.md) in hand. `pro` was not attempted and does not gate the
rung ([#16](https://github.com/firejune/rigc/issues/16)); the `pro` line `bench` prints
from an `ess` candidate is noise and is quoted nowhere.

**One attempt, four sessions, and the chain is recorded because the artifacts survived
and the reasoning did not.** Sessions 1–3 were each killed mid-run by a **server-side
529**, and each time the disk state was inherited in place in the same worktree. **The
inputs never changed, no forbidden file entered any session, and `bench` had not been
run** — the interruptions are infrastructure, not a reading breach, and the run stays
clean. What is lost is the *authorship of the reasoning*, which is why every inherited
artifact was treated as a draft to validate rather than a conclusion:
[`LOOP.md`](../bench/runs/2026-08-24-spineboy-3/LOOP.md) §1 re-ran `check` on the
inherited build before touching anything, §2 reproduced it to the digit, and the one
claim a predecessor left behind — a draw-order edge the "boot evidence points at" —
was re-derived from the frames rather than trusted, because a claim without working is
not an inheritance.

The `ess` line, verbatim:

```
ess        bones=0.924  slots=0.844  attachments=0.955  constraints=1.000  animations=0.804  events=0.500
           bones 0.924 (name-matched) · 0.967 (name-agnostic)   slots 0.844 (name-matched) · 0.810 (name-agnostic)
```

**Reading — the commander's call, 2026-08-24. The measure-first loop works; the rung is
still not cleared.**

**What the per-chain dashboard prescribed after attempt 2, this attempt delivered.**
Every named failure shrank. Reference-denominator MAE: `death` **63.03 → 54.31**, `hit`
**53.91 → 43.27**, `run` **52.57 → 45.62**. Worst slot drift **18.8 → 14.6 px**.
Per-frame adjacency disagreements **14 → 3** — the limbs no longer teleport — and
**0 of 16 sets** carry an `⚠️ overdraw` warning, so none of it was bought by inking more
than the reference does. Structure inched up beside it: name-agnostic bones
**0.956 → 0.967**, slots **0.798 → 0.810**. Pooled over all 132 committed frames the run
moved **35.485 → 32.067**, −9.6 %. That is the first time on this ladder that one run's
diagnosis has been read by the next as a work order and moved every figure it named.

**The residual now has a name, and it is one shape twice.** Both are whole-body
re-orientations the fitter reaches only by multi-start. **The lying passage of `death`**
— both thighs, 12–14 px: `front-thigh` 14.6 px at f0054 and `rear-thigh` 12.1 px at
f0007, the long tail the multi-start refit was not spent on. And **the gun's reach in
`run`** — 21 px short at f0006, where the reference holds the gun out level and every
pose in the shot has it at the hip, so every start drawn from `run`'s own frames sits on
the wrong side of the same two-chain minimum; only a cross-shot start, borrowing `aim`'s
arm chain, moved it at all.

**Against the cleared-rung bar, motion is closer and not there.** Every cleared candidate
on this ladder posts **0.7–3.3 px** of worst slot drift. 14.6 px on a 100 × 146 px figure
is still a visible error.

**Three defects decided the run, and the gate, `diff` and an aggregate MAE were blind to
all three.** A hold that was not held — `death`'s nine still frames and `shoot`'s
motionless opening pair, the brief's own headline fact, both moving. Loop seams — four
independently fitted end poses that were not their own first pose, `shoot`'s near forearm
**105° away** against a reference pair that differs by **0 px**. And an attachment fitted
and never emitted — six of eight shots fitted against the closed fist and built showing
the open one, worth **1.9 MAE on `hit`** and **1.4 on `walk`** on its own. All three were
found by **`check`'s per-frame column and its chain table**, and two of them were sitting
in a report that had already been read for its chains.

**`animations` did not move with the motion — 0.806 → 0.804 — and that is not a
contradiction.** That section counts keys and curve kinds against the reference's, and
nothing about the key-density trade attempt 2 measured changed here. `bench`'s structural
sections and `check`'s pixels are answering different questions, which is the whole reason
`diff` refuses to combine them into a score. `events` **0.500** and `attachments` **0.955**
are unmoved for the reasons attempt 2 gave.

**A third draw-order edge, and it took fixing the test to get it.** Each boot is drawn
behind its own shin — reached by §8's like-for-like test only after the run replaced the
whole-shot denominator with the pixels where the two builds actually differ. Run
whole-shot, a control reversing an edge the brief settles by measurement came out **0.1 %
the wrong way**, which under §8's rule is *no answer*; scored over the deciding pixels the
same control reproduces at **47.7 %** and the boot edge reads **12.5 %**, positive in all
eight shots, with the two feet agreeing independently at 12.1 % and 13.4 %.

**Known wrong, stated rather than tidied.** `jump` went the other way, 41.05 → **44.11**,
and the run says which change did it and why it stands. Four sets could not take
`frames.json`'s own box — `death`, `hit`, `run`, `shoot` — which §9.2 puts at 15–25 MAE,
so part of the gap between the two halves of the table is the measurement rather than the
keys. The near arm is the worst chain *per pixel* and carries `no slot attributable` rows,
which §8.1 calls the loudest row in the table rather than the quietest. `run`'s two
footfall cues sit at the top of their windows; `jump`'s landing cue is this run's
inference rather than the brief's list, and it says so; the event names are an animator's,
because the brief declines to spell them.

⚠️ **One honesty incident, and it is the repository's rather than the run's discretion.**
`bench --json` writes `src/ladder.ts`'s **gate string** into `bench.json` — a fact the
forbidden table names explicitly — and the run protocol *requires* `bench.json` in the run
directory. A forbidden reference fact therefore reaches the run directory **through the
tool itself**, and no obedient run can avoid handing it to the next agent that opens one.
It was seen only **after `bench` had run**, so it reached no authoring decision: the rig
was built, frozen and measured before the file existed. The run committed `bench.json`
**with that one field redacted by hand**, the redaction saying what it replaced and how to
regenerate the original, every measure untouched. Hand-redaction is a run doing the
emitter's job; the fix belongs at the emitter and is filed as
[#137](https://github.com/firejune/rigc/issues/137).

**Five guide defects, and unlike attempt 2's they are no longer all about obtaining a
pose.** Two are: §8.1's two-chains-share-a-minimum case and multi-start, including
cross-shot starts, as the cheap fix
([#139](https://github.com/firejune/rigc/issues/139)), and §10.3's hold rule needing its
other half — the key reducer has to key the plateau, because a tolerance is not a hold
([#138](https://github.com/firejune/rigc/issues/138)). **Three are about reading a
measurement**: §8's like-for-like test must state its denominator
([#140](https://github.com/firejune/rigc/issues/140)), a control that fails may be a
wrong control ([#141](https://github.com/firejune/rigc/issues/141)), and §9.2's per-frame
column deserves naming in §0's loop
([#142](https://github.com/firejune/rigc/issues/142)). That shift is itself a finding:
attempt 2's limit was getting a pose at all, and this one's was believing the wrong number
about a pose it already had.

⇒ **spineboy stays 🟨.** The skeleton half of the graduation question stays answered, the
motion half stays open, and the gap between them is now measured rather than described.
The lever is the same one attempt 2 named — a better fitter — and attempt 3 says it is a
lever that moves.
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

Putting **somebody else's** agent through that — a different model, a different
harness — is [PILOT.md](PILOT.md): the tier rubric, a runner prompt that quotes the
reading lists rather than linking them, and an evaluator sheet holding the
baselines this file records. The baselines stay out of the runner's prompt for the
reason the honesty rule gives above.

`bench <rung>` takes `1 … 8` or `spineboy`. Rungs 1 and 8 carry two skeletons and
both are benched and reported. `spineboy-pro` is reported as a **stretch** figure
and does not count towards the rung: it is a harder rig than the graduation exam,
and folding it in would make the exam unpassable for a reason unrelated to
passing it.

⚠️ **On a two-skeleton rung, half of what `bench` prints is noise, and it does not
look like noise.** `bench <N> --candidate <dir>` takes one candidate and diffs it
against *every* reference skeleton of the rung, so it prints a line per skeleton
whichever candidate it was given. Only the line for the skeleton that candidate was
built from is a measurement of anything; the other is a confident, plausible figure
for a rig nobody wrote. Rung 8 is the first two-skeleton rung run since that trap
was written down, and **both of its runs printed one** — see
[`2026-08-23-rung8-1/README.md`](../bench/runs/2026-08-23-rung8-1/README.md), which
marks each ⚠️ and quotes only the matching line. Nothing in `bench`'s own output
says which line is which, so a report that does not name it has not told you.
⇒ Build both, run `bench` once per candidate, and read one line from each run; when
you are reading somebody else's report instead of producing one, check that it says
which run each quoted line came from before you use a number out of it. The rule for
the run agent is in the protocol
([`bench/runs/README.md`](../bench/runs/README.md), *Which rungs can be attempted*);
this is the same rule for whoever reads the result.

`bench` exits non-zero only when stage 1 fails. The diff has no threshold, so it
cannot fail — read it.
