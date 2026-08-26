# The benchmark ladder

**Live status document.** The rung order, what each rung gates on, how a rung is
scored, what a pass is (*Operating rules*, gate v2), and where each one stands
today. The survey behind it is
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

What that person reads the measures *against* is the current gate — **gate v2** since
2026-08-25 — in *Operating rules*
below: which measures decide a rung, which are reported without deciding anything,
and the number each of the deciding ones has to clear. 🚫 That section quotes
previous runs' figures to derive those numbers, so an authoring run does not open it
— the pointer is here for whoever is judging a candidate rather than building one.

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

**2026-08-25 — gate v1 introduced** (issue
[#153](https://github.com/firejune/rigc/issues/153)). **No measure's definition
changed and no recorded figure moves**: what arrived is a *pass definition* over the
measures already listed above — which of them decide a rung and which are reported
without deciding anything — and the version label `gate v1` for that set. It is
recorded here because the instrument panel is what this subsection tracks, and
because a change to it is the event that reopens previously passed rungs; its clauses
and their derivation are in *Operating rules* below, which is not read by an
authoring run. Every `bench.json` on disk stays exactly as its run wrote it, and a
run made before #28 is read through the recompute table above rather than through its
own file.

**2026-08-25 — `check` gained an MAE-refined final framing pass** (issue
[#146](https://github.com/firejune/rigc/issues/146)). A **fitted** framing now takes
one further pass that searches whole-pixel offsets within ±2 px for the lowest MAE
over the reference's own drawn pixels and moves the box to the best one when the
gain clears 1 % of the figure; a box that is not an estimate — `frames.json`'s own,
or a `--viewport` pin — is searched and reported but never moved. The reason is
measured: the extent fit's documented floor arrives as a **constant** one or two
pixels, worth 10–30 % of a fitted set's headline figure on the spineboy candidates
while the per-frame remainder is an order of magnitude smaller.

⚠️ **So a recorded MAE for a set framed `candidate-pixels` re-reads LOWER, and the
per-slot drift in such a set can move either way** — the box it is measured in has
moved. Over the 86 compared sets of the runs on this page, 52 refine to the exact
identity and are unchanged (every set framed by `frames.json`'s own box is one of
them); 33 move. `bench.json` files are **not** rewritten, and the re-read figures
belong to the adjudication pass rule 3 requires after an instrument change, not
here. Nothing about `bench`'s own measures changed.

**2026-08-25 — `check` compares contact sheets, and stopped calling a merged blob a
part** (issues [#36](https://github.com/firejune/rigc/issues/36) and
[#37](https://github.com/firejune/rigc/issues/37)). Two additions in the same pass
as #146 above, and only one of them moves a recorded figure.

- **The sheet.** A set that commits a couple of stills and folds every sampled frame
  into `contact.png` was compared on the stills alone. It now also gets a **`sheet`
  line**: the candidate sampled at the set's own rate, rendered in the set's own box
  at the sheet's scale, compared tile by tile. Nothing already recorded changes —
  this is a figure that did not exist. It exists on **35** of the sets on this page,
  rung 2's four and every `@30fps`/`@24fps` stills set among them, and it is the
  first whole-shot reading any of them has had.
- **Slot drift.** A reference component holding another slot's ink is no longer
  called one slot's own, however much of it that slot draws. ⚠️ **Recorded worst
  drifts re-read lower where that was happening**: rung 2 attempt 2 **11.2 px →
  0.2 px** on all four sets, rung 1 `balls` **8.9 → 3.5**, rung 6 `arcs` **4.2 →
  2.5**. No MAE moves, and no set loses its drift table (4 attributed samples out of
  ~7,000 across the page).

Both are gating-relevant — G2 reads the drift, and the sheet is a new observable —
which is why they land before the adjudication pass and not during it.

**2026-08-25 — the first gate-v1 adjudication, on the post-#159 instruments** (issue
[#153](https://github.com/firejune/rigc/issues/153), phase 2). **No measure's
definition changed here either**: this entry records that the pass rule 3 requires
after an instrument change has been *taken*, once, over every stored candidate — and
against which instruments, because that is the fact a later reader needs. The panel it
used is the one the three entries above describe: `check` with the MAE-refined framing
pass (#146), the contact-sheet comparison (#36) and the component matcher that no
longer calls a merged blob one slot's own (#37), at
[`d850a4e`](https://github.com/firejune/rigc/commit/d850a4e).

Sixteen candidates, 86 compared sets, **zero builds and zero authoring**. 🚫 **No
`bench.json` and no run directory was rewritten** — every figure the pass measured
lives in *The first gate-v1 adjudication* under **Status** below, in each rung's own
section, and in the pull request that landed them. So a figure quoted from a run's
`bench.json` or from a per-run entry above is that run's own record, a figure quoted
from a verdict is the re-read, and the two are compared only through this subsection.
Three things moved a verdict rather than a number, and each is written where the
verdict is: the drifts #37 corrected (rung 1 `balls` 8.9 → 3.5 px, rung 6 4.2 → 2.5 px,
rung 2 attempt 2's whole table), the boxes #146 moved (spineboy `death` 14.6 →
19.6 px — a drift that re-reads **higher**), and the 35 sets that gained a whole-shot
figure they had never had. The sheet figure **gates nothing**, because gate v1 was
written before it existed; the rungs whose verdict would turn on it are listed with the
verdicts, as input to a gate v2 decision rather than as a finding of this pass.

**2026-08-25 — gate v2 introduced** (issue
[#160](https://github.com/firejune/rigc/issues/160), with the duration clause's
reformulation answering the first ambiguity the pass above recorded). **No measure's
definition changed and no recorded figure moves** — like gate v1 this is a *pass
definition* over the measures already listed here, and every `bench.json` on disk stays
as its run wrote it. Two clauses differ from v1 and the rest are v1's:

- **G4's duration limb** is now a tolerance of one sampling interval of the coarsest rate
  a shot's frames were committed at, in place of `animations.duration` **1.000**. The
  measure is unchanged and still reported at its own 1/60 s agreement; what changed is
  what the gate reads off it, because the frames are a grid and an author reading them
  cannot resolve a length finer than one. The derivation is in *Operating rules* rule 2.
- **G7** joins, on the contact-sheet observable [#36](https://github.com/firejune/rigc/issues/36)
  added — a flatness clause (worst tile against that sheet's own mean), not a level, so
  that the 🚫 against MAE thresholds still holds.

Rule 5, the cadence rule, arrives with it: gate-affecting changes batch into versions and
one bump takes one re-inspection. The sheet clause can flip a **standing pass**, which is
the case rule 5 calls integrity rather than opportunity, so v2's re-inspection is taken in
the same pass rather than deferred to the next bump — it is the entry below.

**2026-08-25 — the gate-v2 re-inspection** (issue
[#160](https://github.com/firejune/rigc/issues/160)). The bump's own re-inspection, taken
immediately for the reason rule 5 gives. **No measure's definition changed here either**:
this entry records that the pass rule 3 requires has been *taken* against gate v2, over
every stored candidate, and that it reused the sweep the first adjudication ran — the same
sixteen candidates over the same 86 compared sets, at
[`1c6740d`](https://github.com/firejune/rigc/commit/1c6740d), reproducing that pass's
figures to the digit. 🚫 **No `bench.json` and no run directory was rewritten.** Two
verdicts moved and both moved on a clause rather than a number: **rung 2 passes** (G4's
reformulation, plus four flat sheets discharging G3's hole) and **rung 4 fails G7** on an
observable that did not exist when it was cleared. Rungs 6 and 8 were re-inspected and
hold; rungs 1, 3, 5 and spineboy fail where they failed before. The figures, the clause
each verdict was read against and five recorded ambiguities are in *The gate-v2
re-inspection* under **Status** below.

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

⭐ **What seals a text: answer-derivability, not provenance.** Decided 2026-08-25, issue
[#158](https://github.com/firejune/rigc/issues/158). The question a sweep of an
allowed-reading surface asks is not *where did this fact come from?* but **can the
answer be produced from this text?** Provenance alone does not seal — a figure an author
could have measured off an allowed input is not an answer however it was arrived at, and
sealing on provenance chases citation chains while censoring material that teaches.

**The test.** Text is forbidden in an allowed-reading surface **iff it states or
constrains a reference-side value of a scored measure.** `bench`'s measure table and
`check`'s gated figures are the answer sheet; anything that reveals or narrows one of
its rows is answer-bearing, and nothing else is. Four readings follow it, and they are
the ones the sweep of [AUTHORING.md](AUTHORING.md) turned on; a fifth, dated and
raised by a later pass, follows them:

- **A candidate-side `check` figure stays.** `check` measures against the rendered
  frames, which are the exam question rather than the answer key, so a figure derived
  from an allowed input cannot be the answer to it.
- **A score written over a reference denominator is sealed.** A ratio whose denominator
  is *the reference's* own count states that count, and that is a measure value.
- **A skeleton or animation name is not sealed.** A name derives no answer, and the
  brief names the shot being rigged anyway.
- **An allowed surface has to be closed under reading.** A citation leading out of an
  allowed document into a sealed one hands over exactly what the document withheld. So
  the guide says outright that an authoring run does not follow its references out of
  it, and a citation into a stored run's directory — where a spec that scores well *is*
  the answer key — is written as a name rather than as a path.

🆕 **A fifth reading, ruled 2026-08-26** — raised by the brief-verification pass over
rungs 1, 3, 4 and 5 ([#10](https://github.com/firejune/rigc/issues/10),
[#12](https://github.com/firejune/rigc/issues/12),
[#17](https://github.com/firejune/rigc/issues/17),
[#18](https://github.com/firejune/rigc/issues/18)) and settled against the criterion
[#158](https://github.com/firejune/rigc/issues/158) fixed above:

- **An observable-by-construction structural fact is the exam question, not a leak.**
  What a client watching the shot would report — how many things are drawn, and what
  they are — may be stated in a brief, and stating it does not breach
  answer-derivability. ⚠️ **Read literally, the test says otherwise**, and that is the
  ambiguity this reading closes: a brief's cast list — *"four balls hang in the air in
  a row, each with its own soft shadow on the ground below it"* — fixes
  `slots.count` and `attachments.count`, which are exactly the two measures **G5**
  gates on. But G5 was *chosen* because it is the client-observable structural
  measure: its derivation in *Operating rules* rule 2 says outright that **"a part the
  reference draws and the candidate does not is the one structural fact a client
  watching the shot reports"**, and rule 1's own test is *could any reading of the
  frames have decided it?* So the fact is in the frames the author is handed whether
  the brief says it or not; sealing it would withhold the shot rather than the answer,
  and **no brief on this ladder could be written** — every one of the eight names its
  cast.
  - 🚫 **The reading is narrow and it does not travel.** It licenses only what a viewer
    of the committed frames could count for themselves. A reference-side value of a
    scored measure that the frames do **not** carry stays sealed exactly as before —
    key counts, curve data, timeline kinds, constraint counts, the setup pose, and any
    count of parts the frames never distinguish. The other four readings are unchanged.
  - 📌 **It is a clarification, not a gate change.** No measure's definition moves, no
    threshold in *Operating rules* rule 2 moves, and no recorded figure moves — so this
    is not a gate release, and rule 5's re-inspection is not owed. It flips no standing
    pass; what it settles is which sentences a brief may carry.

⇒ It is rule 1's principle applied to the other side of the exam: **the exam must be
answerable from the allowed inputs, and the allowed inputs must not contain the
answers.** And unlike provenance it is mechanically checkable — an allowed surface can
be scanned for reference-side measure values, where *"who wrote this number down
first"* cannot be.

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
  document's status table, its per-rung sections and its *Operating rules***; [SPEC_COVERAGE.md](SPEC_COVERAGE.md);
  [`src/ladder.ts`](../src/ladder.ts)'s `gates:` strings; issue bodies carrying counts
  or measures; `bench/render_reference.ts`; git history; and any derived form of any
  of them.

⚠️ **Three of those forbidden entries are this document.** The status table's *New at
this rung* column publishes bone, slot and animation counts per skeleton — the
briefs withhold exactly those, on purpose — the per-rung sections below publish
every run's measures, and *Operating rules* derives its thresholds by quoting those
measures back. **They stay.** They are the ladder's bookkeeping and a reader
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

## Operating rules

**Decided 2026-08-25**, issues [#153](https://github.com/firejune/rigc/issues/153) and
— for gate v2 and the cadence rule — [#160](https://github.com/firejune/rigc/issues/160).
*How a rung is scored* above says what is measured; this section says what a
measurement is allowed to decide. Five rules: what a pass is, the numbers it is
made of, what closes a rung and what reopens one, the order the rungs are
climbed in, and the cadence a gate changes at.

🚫 **An authoring run does not read this section**, and it is on the forbidden list
above for the reason the status table is: the thresholds below are derived by quoting
previous candidates' measures, and a number reaches an agent the same way whichever
file it is in. A run does not need it — `bench` is the finish line, and the gate is
the reader's instrument rather than the author's. Whether a *brief* may carry the
gate's clauses stripped of their derivation is a protocol question, and it belongs to
whoever revises the protocol rather than to a run.

### 1. A pass is a quality gate, not a replica test

The product posture is **"AI lays the foundation; finish in the editor."** A rung
passes when the draft is foundation-quality: the structure and the motion the frames
can constrain are inside the thresholds in rule 2. Structure that is **unobservable
by construction** is reported as figures and **never gates** — it is what the editor
session is for, and the ladder has now demonstrated three times over that no
authoring convention reaches it, because there is nothing in the input to read it
off.

⭐ **The test is not "is this measure hard?" but "could any reading of the frames have
decided it?"** Key density is hard *and* undecidable; a wrong region size is easy
*and* decidable; and a shot's duration is handed to the author outright. Only the
middle kind is allowed to fail a rung. This is the honesty rule's own line — *what a
client watching the finished animation could tell you* — applied to the verdict
instead of to the inputs, and it resolves the question left open around
[#20](https://github.com/firejune/rigc/issues/20) and the `ball` residual under
*Rung 8, attempt 2*.

**What is unobservable by construction — reported, never gating.** Each row is a
finding this ladder already recorded, not a new claim:

| Measure | Why no reading of the frames decides it |
| --- | --- |
| `constraints.*` (all five) | a physics chain and a hand-keyed chain draw identical frames — rung 6's four transform constraints and rung 8 `ball`'s four, both correctly left unauthored |
| `bones.length_present`, `bones.inherit_present` | AUTHORING §9.3 lists both as invisible in frames, and §10 has no public page to read a default off. 1/3 in both rung 3 attempts |
| `attachments.mesh_vertices`, `mesh_triangles`, `mesh_hull`, `mesh_weighted`, `attachments.type_counts`, `attachments.region_size` | §9.3: a hull moved by a bone chain and the same hull moved by deform keys render to the same pixels, and it names these four measures **and the bone count** as the ones that move on that invisible decision. A mesh states no region size, so `region_size` moves with it — rung 6 reads 2/3 there for having one mesh where the reference has two. Rung 8 `ball`'s mesh topology is invented and the frames cannot see any of it |
| `slots.agnostic.attachment_types_by_position` | positional, but the *type* at each position is the region-versus-mesh choice above |
| `animations.key_counts` | §10.6 says outright that no public page gives a density, and [#112](https://github.com/firejune/rigc/issues/112) shows the shot's own acceleration pins the knob. Missed from **both** sides on this ladder — a third short at rung 3, twice as dense at rung 8 |
| `animations.curve_kinds` | §10.4 moved it and cannot finish it: a curve split *between* two reference frames leaves no trace at the rate the frames were rendered, so the residual is a split below the sampling rate |
| `animations.timeline_kinds` | Separate-versus-combined is a checkbox, not a picture: `translate` with a flat y channel and `translatex` alone render identically. The cleared `pendulum` posts **0.625** here |
| `animations.event_keys`, `events.names`, `events.payloads` | a firing is not a pixel, and the briefs decline to spell the names. spineboy has paid `events` 0.500 for that refusal twice, deliberately |
| every name-keyed measure — `bones.names`, `parent_by_name`, `order`, `slots.names`, `slots.bone`, `attachments.names` | unwinnable by design: the brief grants the author its own names. This is what the name-agnostic pair exists for, and it is why no *section mean* is gated |
| any measure reading 1.000 at `0/0` | vacuous, and the document has said so since B1's proof. A gate that counted these would pass a rung for having nothing |

⚠️ **`attachments.region_size_present` must not be cited as the unwinnable measure it
was once called, and notes drafted before 2026-08-23 that do are wrong twice over.**
The measure does not exist — it is `attachments.region_size` now — and the
unwinnability claim it was retired *under* did not hold: Spine's exporter omits
nothing, and all twelve reference exports state a width and a height on every one of
their 168 regions. What made the old measure read `0/8` was that it was keyed by
name. See the 🔴 correction under *Rung 1* and the 2026-08-23 entry under *Measure
changes*. Its replacement is on the table above for a **different** reason, and only
the new reason may be quoted: a size disagreement is observable, but the same
histogram also moves when a part is meshed rather than posed, and no frame decides
that.

⚠️ **The unobservable set reaches through measures that look observable, and the
gate has to let it.** Rung 8 `ball` posts `bones.count` **8/12** and name-agnostic
`bones` **0.517** — figures that name no names and look like a plain structural
miss. They are the four constraints again: the four bones the reference's constraints
drive draw nothing of their own, so the frames cannot ask for them, and
`slots.agnostic.bone_binding_shape` and `order_shape` inherit the same hole at 0.500
apiece. ⇒ **`bones.*` and the `bones`/`slots` name-agnostic means are reported and do
not gate.** A bone is reachable only through the motion it produces, and the motion
is gated directly in G2 and G3: a rig missing a joint that carries observable motion
fails there, and a rig missing one that carries none has lost nothing a frame could
show.

### 2. Gate v2 — the thresholds

⭐ **Leniency that is not written down is not a gate.** Every clause below is a
number, the number has a derivation beside it, and the set is versioned so that
changing one is an event rule 3 can act on. Calibration is deliberately **lenient**:
the floors sit above every figure a commander's reading has already called faithful,
and tightening them later is what rule 3's re-inspection is for.

Gate v2 is judged **per skeleton**, on `validate --profile spine`, on `bench`'s
measure table, and on `check` over every committed frame set of that candidate.

🆕 **v2 supersedes gate v1 as of 2026-08-25** (issue
[#160](https://github.com/firejune/rigc/issues/160)). Two clauses move and the rest are
v1's, unchanged and unrenumbered:

- **G4's duration limb is reformulated.** v1 asked for `animations.duration` **1.000**,
  which the first adjudication showed to be unanswerable from the allowed inputs: it
  failed two rungs on a residual finer than the grid the author was given. The
  derivation is under the table.
- **G7 is new** — the whole-shot contact sheet (#36), the observable v1 was written
  before. It joins as a **spike** clause rather than a level one, because *the MAE
  decides nothing* still holds. ⚠️ **Its threshold is the one place the ⭐ above does not
  apply as written**: the candidates holding a pass mark were cleared *without* this
  observable ever being read, so *"above every figure a reading has already called
  faithful"* would license every sheet figure on the page, the outlier included. What it
  is derived from instead is in the 🧾 under the table.

v1's own wording for both is quoted where the change is, because the verdicts under
*Status* dated 2026-08-25 were read against it and stay true of it. **A pass is
versioned**: a rung that met gate v1 met gate v1, and the v2 re-inspection says
separately whether it also meets this.

| # | Clause | Threshold | Where the number comes from |
| --- | --- | --- | ---: |
| **G1** | validity | **0 FAIL** under `--profile spine` | stage 1, unchanged. Twelve honest runs have posted 0 FAILs, so this clause has never yet decided anything — it stays because a candidate that is not valid Spine 4.3 has cleared nothing |
| **G2** | worst attributable slot drift, in **every** measured set | **≤ 6.0 px** | cleared candidates post **0.74–0.85 px** (rung 3 attempt 2, both sets) and **3.3 px** (rung 8 `pendulum`). Above them sit **4.1 px** (rung 6, at the frames' own box) and **4.2 px** (rung 8 `ball` attempt 2, **5.3 px** at attempt 1), the two highest figures any entry here describes as faithful motion. spineboy attempt 3 posts **14.6 px**, which its own entry calls a visible error on a 100 × 146 px figure. 6.0 clears the highest of those by ~1.8 px and refuses the open one by 2.4×. Deliberately **absolute** and not a fraction of the figure: `check`'s drift is in the frames' own pixels, and a relative bar would license a large rig the visible error a small one is refused |
| **G3** | per-frame motion, in **every** set | `changeDisagreements` = **0**, and **no** set carrying `⚠️ overdraw` | `pendulum` is attributed in every frame of both sets; `ball` attempt 2 posts agreement on all 44 and all 87 adjacent pairs. spineboy posts **14** disagreements at attempt 2 and **3** at attempt 3 — a limb that teleports, a hold that is not held, a one-frame event that never fires. The overdraw half is not leniency but a hole plugged: `mae`'s denominator is the union, so drawing more buys a better mean ([#119](https://github.com/firejune/rigc/issues/119)), and `OVERDRAW_RATIO` is already 1.5 in [`src/check.ts`](../src/check.ts) against a corpus that spans 0.852–1.069 on 62 of 64 sets |
| **G4** | the shot inventory | `animations.count` and `animations.names` **1.000**; and every animation's **length** within **one sampling interval of the coarsest rate that shot's frames were committed at** — 1/12 s everywhere on this ladder | count and names are the least deniable facts here and both are granted outright: the brief describes each shot the author is to build. The length is granted too, but only *to the grid it was rendered on*, which is why the limb is a tolerance and not a ratio — the 🧾 derivation below. v1 read `animations.duration` **1.000** instead, and that number is `bench`'s own 1/60 s agreement: finer than the frames can resolve at every rate the ladder commits, so it failed two rungs on a residual no reading of the frames could have decided |
| **G5** | the drawn inventory, name-agnostically | `slots.count` ≥ **0.85** and `attachments.count` ≥ **0.85**, each read **after** the itemised deduction below | a part the reference draws and the candidate does not is the one structural fact a client watching the shot reports. These are the only two structural measures in `bench`'s table that a *count* alone decides — every other one is keyed on a name, on an attachment kind, on a key density or on a constraint. Cleared candidates post **1.000** on both (rung 3, `pendulum`), and so does `ball` attempt 2; the floor is set from the largest rig measured, spineboy attempt 3's **0.952 / 0.931**, so that a character-scale rig clears on the structure its own entry calls *the editor's skeleton* and the rung is decided on motion, which is the half that entry says is open |
| **G7** | the whole shot, on a set whose frames are a contact sheet | every sheet's **worst tile ≤ 3.5 × that sheet's own mean**. A set with **no** sheet reads **SKIP**, never a pass — see the 🧾 below for what a SKIP means | new in v2, from the observable #36 added. A **ratio inside one sheet** rather than a level, because a sheet MAE is an MAE and *the MAE decides nothing across rungs or framings* — numerator and denominator here are the same measurement in the same box on the same plate, so the clause asks the only question that survives the doctrine: **is the sheet flat?** §9.2 already reads it that way — *"flat is framing or art, a spike is timing at that moment"*. The 🧾 derivation below carries the corpus |
| **G6** | the rung | every skeleton of the rung meets G1–G5 and G7 | rung 1's precedent, and rung 8 is where it bit: `pendulum` cleared while `ball` did not, and the rung stayed 🟨 |

🧾 **G4's duration limb, derived from the answerability principle.** Rule 1's test is
*could any reading of the frames have decided it?* — so the arithmetic of how the frames
were made decides this clause.

**The frames are a grid, and the sidecar states the grid point.**
[`sampleAnimation`](../src/render.ts) steps an animation at a fixed rate and takes
`count = round(duration × fps)` samples, the last of them at `count / fps`. So
`frames.json`'s `duration` field — and the last committed frame's time, which is the same
number — is **the animation's own length rounded to the sampling interval**, never the
length itself. ⇒ An author reading only allowed inputs knows a shot's length **to within
half a sampling interval and no better**, and writing exactly what the sidecar states is
the obedient answer to the exam as set.

**v1's clause was finer than that.** `animations.duration` agrees within `FRAME = 1/60 s`
([`src/diff.ts`](../src/diff.ts)). Half a sampling interval is **1/24 s** at 12 fps and
**1/48 s** at 24 fps — both coarser than 1/60 — and exactly 1/60 s at 30 fps. So at the
ladder's own protocol rate the measure asks for a precision the inputs do not carry, and
the first adjudication is what that looks like from the outside: rung 2 wrote its
sidecar's **25.833333 s** against a reference length of **25.866667 s** and read
`duration` 0/4 on four tenths of a 12 fps frame, and rung 1 `balls` wrote **3.250 s** —
what both its sidecars state — against **3.233333 s**, missing a 1/60 s tolerance by
about a third of a microsecond, which is the export's own six-decimal rounding sitting on
the boundary. Rung 8 `ball` wrote its 24 fps sidecar's **3.625 s** against 3.633333 s and
**passed**, on 1/120 s: the same obedience, the lucky side of the same grid.

**So the tolerance is one interval, not half of one.** The floor is half a sampling
interval — and of the **coarsest** rate a shot's frames were committed at, because the
sidecar an obedient author reads may be that one. Doubling it to a full interval is this
gate's standard leniency (G3's overdraw ratio is 1.5 against a corpus spanning
0.852–1.069 for the same reason) and it buys the thing that actually failed rung 1: **a
clause must not sit on the boundary its own worst honest case lands on.** At 12 fps that
is **1/12 s ≈ 0.0833 s**, and every shot on this ladder commits a 12 fps set, so 1/12 s
is the figure in practice.

⚠️ **Two things to know when reading this limb.** It **decides nothing on the stored
corpus** — the largest gap any candidate posts is rung 2's 0.033334 s, inside by 2.5× —
and that is the point: it refuses a shot wrong by a frame or more of the grid it was
drawn on, and every such shot is watchable in the frames the author was given. And it
**cannot be read off `bench`'s ratio**, because the ratio is the tighter 1/60 s
agreement: `animations.duration` stays a **reported** figure, and a verdict on this limb
**quotes the two lengths** — the candidate's last key time and the reference's — where the
verdict is.

🧾 **G5's deduction, and why a bare count is not enough.** An element the frames
cannot show is deducted from the **reference's** side of G5's counts, **item by item
and each one named in the rung's section**, before the ratio is read. Three kinds qualify, and the ladder has
already itemised one of each: an attachment kind no pixel carries (spineboy `ess`
declined a **bounding box**, which its own entry calls its most arguable omission);
a part the reference draws that nothing in the frames distinguishes (rung 1 `drop`'s
**`ground-cover`** layer, 4 slots against 5, recorded as *one invisible layer*); and
a part folded into another slot as an attachment swap where the frames never show
both at once. ⇒ **A deduction that cannot name its item is not a deduction.** This is
the clause that keeps G5 a gate rather than a way of failing a rung for the invisible
after rule 1 said the invisible does not fail rungs; it is also the only clause in
gate v1 that takes a reader's judgement, which is why it has to be written down
element by element where the verdict is.

🧾 **G7's threshold, and where the number comes from.** **35** of the sets on this page
carry a sheet — rung 2's four and every `@24fps` / `@30fps` stills set — and a sheet is
one MAE per sampled frame, measured in the same box that set's frame table used, at the
sheet's own scale.

**Why the worst tile over the sheet's own mean, and not a mean.** The first adjudication
put the two candidate clauses side by side and they disagree: rung 2's four sheets read
**4.30–4.41** mean, **flat over all 1,244 tiles**, on motion its frame table could not
see at all and that the pass called faithful — while rung 4's `ball-catch@24fps` reads
**30.46** mean with a worst tile of **121.98**. A level clause ranks those by the plate
they were drawn on, which is the 🚫 above. A ratio inside one sheet cannot: numerator and
denominator are the same measurement, in the same box, on the same art.

**The corpus, sorted.** Worst tile ÷ own mean over all 35 sheets: **25** of them at or
below **1.5**, **33** at or below **2.17**, and then two — rung 6's `arcs@24fps` at
**2.89** and rung 4's `ball-catch@24fps` at **4.00**.

**3.5 is set between the top two, and each side of it is argued.** Below it: rung 6's
2.89 is the highest figure a **corroborated** sheet posts — that shot is *also* committed
in full at 12 fps, where it reads **0** disagreements over 68 adjacent pairs and 2.48 px
of worst drift, so the spikes sit on motion an independent gated reading has already
accepted. Above it: rung 4's 4.00 is the corpus's lone outlier on every sheet reading
available at once — the only sheet whose worst tile is 4× its own mean, whose mean is
**twice** the figure its own committed stills show (15.33), and whose worst tile is 3.5×
the worst frame that shot posts at any rate it was read in full.

⚠️ **Both margins are thin, and that is recorded rather than smoothed over.** 3.5 clears
2.89 by 1.2× and refuses 4.00 by 1.14× — nothing like G2's 1.4× either side. The corpus
does not separate its top two by much on *any* reading: worst-tile-over-own-mean puts
them at 2.89 and 4.00, worst tile over the same shot's worst frame at 3.13 and 3.49, and
sheet mean over the shot's fullest committed set at 1.38 and 1.42. The clause is written
on the widest of those three separations, and ⇒ **a tightening of G7 finds rung 6 first**,
the way a tightening of G2 finds rung 5 first. A second candidate landing between them is
the argument for revisiting the number, and the number is where that argument starts.

🚫 **What G7 is not: a tile-level change measure.** The sheet line carries MAE only, on
purpose — the `Δpx` / `ref Δ` thresholds are pixel counts calibrated at frame scale and a
tile has a fraction of a frame's pixels (AUTHORING §9.2), so the change measure stays on
the committed stills. Building one is an **instrument** change, and rule 3 says the
instruments are finished before the adjudicating starts; it is booked for a later bump
rather than invented inside a gate version.

🕳️ **A set with no sheet reads SKIP, never a pass** — and what the SKIP means depends on
why there is none:

- **it commits every sampled frame** — rung 8's two sets, rung 3's, rung 1 `balls`' — so
  the whole shot is *already* read frame by frame under G2 and G3 at that rate and a
  sheet would add nothing. G7 records SKIP and the rung is decided on the frame reading.
  A candidate is not failed for having better coverage than a sheet;
- **the set is a single pose** (`ready-to-animate`, `aim`): there is no shot to read;
- **a sheet exists and `check` refused it by name**, because its dimensions are not a
  grid of that set's frame count. That one is a **HOLE**: the set is re-rendered, and
  until it is the clause is unmet. No set on this ladder is in that state.

⇒ **And what G7 does for G3's own hole.** The first adjudication recorded that G3 is
unreadable on a set of two non-adjacent stills — `changePairs` is 0, so
`changeDisagreements` is 0 for having nothing to compare, and rung 2, whose four sets are
*all* two stills 310 frames apart, had no per-frame reading at all. A sheet is a reading
of **every** sampled frame of that shot. So where **no** committed set of a shot has an
adjacent pair, a sheet that meets G7 **discharges** that hole: no sampled frame of the
shot departs from its own baseline, which is the thing the missing pairs left unknown.
⚠️ **Discharges, not replaces.** The sheet is an MAE series and not a change measure, so a
deviation too small to lift a tile above the flatness bar is invisible to it; and where a
shot *does* have adjacent pairs, G3 is read directly and G7 is read beside it.

⚖️ **Where the leniency is, and where it is not.** G2, G3's overdraw half, G4's duration
limb, G5 and G7 are loose on purpose — they sit above the recorded honest range rather
than at it, because a first calibration that fails a candidate a reader would have passed
teaches the ladder nothing. G3's disagreement count and G4's count and names are at zero
and 1.000 because nothing on this ladder has ever argued for slack there: a hold that is
not held and a shot that is missing are both visible in the frames the author was given.

🚫 **What cannot gate even though it is observable: the MAE.** `check`'s means are
the instrument the loop is run on and they are **not** comparable across rungs or
across framings. Rung 5's course plate renders at **4.29** against its own frames
with nothing else in the skeleton — every shot has its own floor — the same build
moved **4.34 → 39.00** on a content box 0.93 % narrower, and §9.2 puts a set that
cannot take `frames.json`'s own box at 15–25 MAE before any key is wrong. A
cross-rung threshold on a figure like that would fail rungs for the plate they were
drawn on. ⇒ **MAE is reported, per set, and decides nothing.** Drift is gated instead
because it is per-slot and framing-independent in a way the means are not.

📌 **G7 does not breach that, and the distinction is the whole of its design.** A sheet
MAE is an MAE and no *level* of one gates anything in v2 either. What G7 reads is a
**ratio inside a single sheet** — one tile against that sheet's own mean — and a ratio of
two figures measured in the same box, at the same scale, over the same art carries none
of the plate the level carries. Rung 2's 4.3 and rung 4's 30.5 are still two different
plates and are still never compared.

🕳️ **A set with no attributable drift is a HOLE, not a pass.** `framesWithoutDrift`
equal to the frame count means G2 has nothing to read, and rung 4 is the case: the
disc and its five-link chain are one connected component in every frame, so that run
had an MAE and nothing else. A set in that state does not meet G2 by default — the
run pins the viewport, splits the chain table, or says outright that this candidate
cannot be gated and why. This is the repository's own rule about vacuous assertions,
applied to the gate that judges them.

📌 **Report the whole table anyway.** A gating clause and a reported figure are
printed side by side and labelled, exactly as `bench` already prints the name-matched
and name-agnostic pair. The reported half is where the editor-finishing work lands,
and a verdict that quoted only the seven gating clauses would be a rung score by
another route — which this document has refused since *How a rung is scored*.

⚠️ **And a reported figure with two possible causes is read down to one before it is
written off.** `attachments.region_size` is the case: short *because* a part was
meshed rather than posed is the invisible choice rule 1 exempts, and short *because
two rigs disagree about how big a part is* is a defect a client would report and a
reason to look at G2's drift on that slot. The measure does not gate either way, and
a verdict that says only *"unobservable"* about it has not read it. `bones.count` is
the same shape: rung 8 `ball`'s **8/12** is four constraint-driven bones and says so
with its own `constraints` 0/4 beside it, and a shortfall on a rung whose reference
declares no constraints is a different finding that has to be named differently.

### 3. Close on pass; a gate change re-inspects everything

A rung that meets the gate **closes its ladder issue**. The verdict, the figures and
the clause each one was read against are written into that rung's section here, the
status cell goes ✅, and the rung stops taking attempts for their own sake — the way
spineboy already stopped as a frozen gate.

⚠️ **Any instrument-panel change makes every previously passed rung subject to
re-inspection against the new gate.** The panel is: `check`'s or `bench`'s scoring
semantics, a measure's definition, a threshold in rule 2, and the pass definition in
rule 1 itself. Re-inspection is a re-read of stored candidates, not a re-authoring —
`check` re-scores a stored skeleton and stored frames, and no run is owed to it. Only
the rungs that **fail** the new gate reopen; a rung that still passes is left closed
and its section records that it was re-inspected and against which gate version. **When
that re-inspection happens is rule 5's**, and a reopened rung's own history is not
rewritten by it: a pass is versioned, so the close comment that said a rung met gate v1
stays true of gate v1.

⇒ **So the instruments are finished before the adjudicating starts, not after.**
Fixing a measure after a verdict reopens the verdict, which is why gate v1 is written
down before the pass over the existing runs rather than during it, and why
[#146](https://github.com/firejune/rigc/issues/146), [#36](https://github.com/firejune/rigc/issues/36)
and [#37](https://github.com/firejune/rigc/issues/37) are landed before it. Each gate
version is recorded under *Measure changes*, and 🚫 **no `bench.json` is ever
rewritten** — a run's file is that run's own record, and a re-inspection that
disagrees with it says so in prose beside the recomputation.

### 4. Climb order under this gate

The order in *The order* above is unchanged; what follows is the sequence the
remaining work is taken in.

1. **Guide debt first** — [#138](https://github.com/firejune/rigc/issues/138)–[#142](https://github.com/firejune/rigc/issues/142),
   the five defects spineboy attempt 3 filed. They change no stored score, so they can
   run alongside the instrument fixes: different files, no interaction.
2. **The cheap rungs, bottom-up, on the matured guide and the finished instruments** —
   rung 2 (brief revision 3 first), then 1, 4, 5, 6, and rung 7, which has never been
   attempted and is local-only under *Licence, per rung*. Only the rungs that fail the
   gate on **observable** measures are re-attempted; a rung whose whole residual is
   unobservable is adjudicated, not re-run. Rung 8's `ball` is the first candidate for
   that reading — its recorded block was *"no further attempts without a new
   observable input"*, and rule 1 is the protocol change that block was waiting on.
   > ➡️ **The adjudication happened on 2026-08-25 and it moves this queue.** Rungs 4, 6
   > and 8 cleared off their stored candidates — rung 8's `ball` on exactly the reading
   > this item predicted — so they leave the list; rung 3 joins it, its pass mark
   > withdrawn on an observable clause. What was left to re-climb after that pass was
   > **rung 2, rung 1, rung 5, rung 3 and the untried rung 7**, and its verdicts, failing
   > clauses and the two clause readings it left open are under *Status*, in *The first
   > gate-v1 adjudication*.
   > ➡️ **Gate v2's re-inspection, the same day, moves it again.** **Rung 2 clears** on
   > stored candidates — the first rung cleared on shots with no per-frame reading at all —
   > so it leaves the list, and **rung 4 joins it** on G7, the sheet clause: that rung's
   > residual is observable and its own author never had the observable, which makes it a
   > re-climb rather than an adjudication. The queue is now **rung 4, rung 1, rung 5,
   > rung 3 and the untried rung 7**, and the current verdicts are in *The gate-v2
   > re-inspection*.
3. **spineboy `ess` is the graduation exam**, taken last, on the matured guide.
   `pro` stays gated on [#87](https://github.com/firejune/rigc/issues/87)–[#89](https://github.com/firejune/rigc/issues/89)
   and is **not** a graduation requirement ([#16](https://github.com/firejune/rigc/issues/16)):
   it promotes when a user's rig needs those timelines, not to finish a ladder.
4. **Then the project's question changes.** Once the graduation gate passes, *does it
   match the editor?* — a reference-bound question, and the only kind this ladder can
   ask — gives way to *is it usable without a reference?* The usability track
   ([#151](https://github.com/firejune/rigc/issues/151), [#152](https://github.com/firejune/rigc/issues/152))
   is that phase's backlog, and the ladder's rungs stay as regression gates for tool
   and method changes.

⭐ **A user's demand signal jumps this queue at any point.** The order above is what
the project does in the absence of one; it is not a commitment to spend a session on
a rung when somebody's actual rig needs something else. The ladder measures the tool
— it is not the roadmap.

### 5. Cadence — a gate is released, not drifted

Decided 2026-08-25, issue [#160](https://github.com/firejune/rigc/issues/160). Rule 3
says a gate change re-inspects; this rule says **when**, and it exists because
re-inspection is cheap while *verdict flapping* is not. Re-scoring the stored candidates
costs about a minute and never a re-authoring; what a drifting gate actually spends is
issue open/close noise, status-row churn, and the owner's attention on a verdict that
moves again next week.

1. **Gate-affecting changes batch into versions.** A new observable, a threshold moved, an
   instrument fix that shifts a reading — none of them lands as its own event. They
   accumulate into the next version, and **one version bump = one re-inspection**, whose
   result is recorded once under *Measure changes* and in the rungs it moves.
2. **Urgency is asymmetric, and the asymmetry is integrity against opportunity.** A
   change that could flip a **standing PASS** re-inspects **immediately** — a published
   pass that no longer holds is a standing falsehood, and this document is the thing
   asserting it. A change that could only let a currently-open rung pass **waits for the
   next bump**: nobody is misled by a rung staying 🟨 a while longer, and that is
   opportunity rather than integrity.
3. **Bumps anchor to milestones, not to commits** — a phase completing, the run-up to a
   graduation attempt, anything about to be said outside this repository. Between bumps
   the gate is frozen on purpose, so a candidate and a verdict are read against the same
   numbers.

⇒ **v2 is itself a case of point 2's first half**: the sheet clause could flip rungs that
hold a pass mark, so its re-inspection is taken in the same pass that introduces it rather
than deferred. The G4 fix alone would have waited — it can only *pass* open rungs.

---

## Status

⬜ not attempted · 🟨 attempted, not cleared · ✅ cleared

| Order | Rung | Example | Skeletons | New at this rung | Status |
| ---: | --- | --- | --- | --- | :---: |
| — | **B1** | — | — | skeleton-as-data input model | ✅ |
| — | **B2** | — | — | A16 accepts pre-release labels | ✅ |
| — | **B3** | — | — | packed-atlas handling (validator half done) | 🟨 |
| 1 | **3** | `3-timing-and-spacing` | `ess` | nothing — smallest skeleton in the corpus | 🟨 gate v2: G3 *(re-opened by gate v1, 2026-08-25)* |
| 2 | **1** | `1-weight-and-mass` | `balls`, `drop` | `translatex`/`translatey`/`shear`; bone setup `length`; a skeleton with **zero** animations (`drop`) | 🟨 gate v2: `balls` G3 *(G4 met under v2)* |
| 3 | **2** | `2-the-12-principles` | `ess` | slot `blend` (4 additive + 4 multiply); bone `inherit` ≠ Normal | ✅ *gate v2, 2026-08-25* — G4's fix and the sheet |
| 4 | **4** | `4-wave-principle` | `ess` | nothing structural — a volume test (9 bones, 9 slots, 3 animations, 470 bezier keys) | 🟨 gate v2: G7 *(✅ under gate v1, 2026-08-25)* |
| 5 | **5** | `5-squash-and-stretch` | `ess` | **`drawOrder` timeline**; `inherit: onlyTranslation`; non-unit setup scale | 🟨 gate v2: G3 |
| 6 | **6** | `6-arcs` | `pro` | **transform constraints** (static); **weighted meshes from authored geometry**; mesh `edges` | ✅ *gate v2, 2026-08-25* — re-inspected, holds |
| 7 | **8** | `8-follow-through` | `ball`, `pendulum` | nothing — both features arrived at rung 6 | ✅ *gate v2, 2026-08-25* — both skeletons, re-inspected |
| 8 | **7** | `7-anticipation` | `sack-pro` | **physics timelines**; a **keyed** transform timeline; **deform**; 20 physics constraints | ⬜ |
| 9 | **spineboy** | `spineboy` | `ess` (+ `pro`, stretch) | **IK**, **events**, **bounding box**, **clipping**, **unweighted meshes**, and scale (`ess`: 18 bones, 20 slots, 8 animations · `pro`: 67 bones, 52 slots, 11 animations) | 🟨 `ess` ⬜ ×3 — structure ✅, motion improving (18.8→14.6 px) · gate v2: G2 · G3 · `pro` ⬜ · frozen as gate 2026-08-24 |

### The gate-v2 re-inspection — 2026-08-25

**Every rung re-judged against gate v2, on the same sweep the first adjudication read.**
This is the immediate re-inspection rule 5 requires of a change that can flip a standing
pass. Zero builds and zero authoring; 🚫 **no `bench.json` and no run directory was
touched.** `check` re-read the sixteen committed candidates over all 86 compared sets and
`bench` re-ran `validate --profile spine` and the measure table on each. **The sweep
reproduces the first pass's figures to the digit** — every drift, every disagreement
count and every sheet mean below is the same number that pass recorded — which is the
control on this one: what moves a verdict here is the clause, not the reading.

Only the two clauses v2 changed can move anything, so both have their own column. G4's
column is the **length** limb (`count` and `names` are 1.000 on every candidate that has
ever been adjudicated); G7's is the worst tile over that sheet's own mean, per sheet.

| Rung | Skeleton | Candidate | G1 | G2 ≤ 6.0 px | G3 = 0 | G4 length | G5 ≥ 0.85 | G7 ≤ 3.5× | v2 | was v1 |
| --- | --- | --- | :---: | --- | --- | --- | --- | --- | :---: | :---: |
| **1** | `balls` | rung1-1 | 0 FAIL | **3.49** px `beach` ✅ | ❌ **1** of 39 · **3** of 78 | ✅ 3.250 s v 3.233333 s — **0.2** of a frame | 1.000 · 1.000 ✅ | SKIP — both sets commit every frame | **FAIL** | FAIL |
| **1** | `drop` | rung1-1 | 0 FAIL | 0.81 px `stick` ✅ | ⚠️ no reading — 1 frame per set, and no sheet to discharge it | ✅ 0 s both | 1.000 · 1.000 *after `ground-cover`* ✅ | SKIP — a single pose | not adjudicable | not adjudicable |
| **2** | `ess` | rung2-2 | 0 FAIL | 0.33 px `bowling` ✅ | ⚠️ 0 pairs in all four sets — **hole discharged by G7** | ✅ 25.833333 s v 25.866667 s — **0.4** of a frame | 0.882 · 0.882 ✅ | ✅ **1.09–1.11**, four sheets, 311 tiles each | **PASS** | FAIL |
| **3** | `ess` | rung3-2 | 0 FAIL | 0.84 px `pendulum` ✅ | ❌ **7** of 64 on `heavy` | ✅ exact ×2 | 1.000 · 1.000 ✅ | SKIP — both sets commit every frame | **FAIL** | FAIL |
| **4** | `ess` | rung4-1 | 0 FAIL | **3.08** px `platform` ✅ | ✅ 0 over 120 + 16 + 16 | ✅ exact ×3 | 0.889 · 0.889 ✅ | ❌ `ball-catch@24fps` **4.00** (121.98 over 30.46, 241 tiles); `wave-by-hand@24fps` 2.07 · `wave-offset@24fps` 2.03 | **FAIL** | PASS |
| **5** | `ess` | rung5-1 | 0 FAIL | **5.91** px `hood-end2` ✅ | ❌ **6** of 78 on `ball` | ✅ exact ×3 | 0.923 · 1.000 ✅ | ✅ 1.05 · 1.17 | **FAIL** | FAIL |
| **6** | `pro` | rung6-1 | 0 FAIL | **2.48** px `ball` ✅ | ✅ 0 over 68 | ✅ exact | 1.000 · 1.000 ✅ | ✅ `arcs@24fps` **2.89** (13.99 over 4.84, 137 tiles) — the highest the clause admits | **PASS** | PASS |
| **7** | — | — | — | — | — | — | — | — | not attempted | not attempted |
| **8** | `pendulum` | rung8-1 | 0 FAIL | **3.34** px `chain-4` ✅ | ✅ 0 over 44 + 87 | ✅ 3.633333 s, exact | 1.000 · 1.000 ✅ | SKIP — every frame committed at both rates | **PASS** | PASS |
| **8** | `ball` | rung8-2 | 0 FAIL | **4.19** px `ball` ✅ | ✅ 0 over 44 + 87 | ✅ 3.625 s v 3.633333 s — **0.2** of a 24 fps frame | 1.000 · 1.000 ✅ | SKIP — every frame committed at both rates | **PASS** | PASS |
| **spineboy** | `ess` | spineboy-3 | 0 FAIL | ❌ **19.57** px `death` · 7.07 `walk` · 6.75 `run` | ❌ **3** of 59 on `death` | ✅ ×8, all inside 1/60 s | 0.952 · 0.931 ✅ | ✅ 1.14–**2.03** (`jump@30fps`), seven sheets | **FAIL** | FAIL |

**Two verdicts move, and one clause stops deciding.**

- ✅ **Rung 2 passes, and it is the first rung this ladder clears on shots no frame table
  could read frame by frame.** Its four sets are two stills 310 frames apart, so it has never had a
  per-frame reading; what it has is four sheets that are **flat over all 1,244 tiles**
  (worst tile 1.09–1.11× the sheet's own mean), and G7's discharge of G3's hole is what
  lets that count. The clause that failed it under v1 was `animations.duration`: it wrote
  **25.833333 s**, exactly what its sidecar states, against a reference length of
  25.866667 s — four tenths of a 12 fps frame, and inside v2's tolerance by 2.5×. Nothing
  else in the rung moved: 0.33 px of worst drift, `slots.count` and `attachments.count`
  both 0.882, `validate` green. One skeleton, so G6 follows. **Issue #11 closes.**
- ❌ **Rung 4 fails G7 alone, and its gate-v1 pass stands as a gate-v1 pass.** Every other
  clause is met on the same numbers that cleared it: 3.08 px, 0 disagreements over all 152
  adjacent pairs, exact lengths, 0.889 / 0.889. What it does not meet is the observable
  that did not exist when it was cleared — `ball-catch@24fps` puts a **121.98** tile over a
  **30.46** mean, 4.00×, where the sheet corpus's next figure is 2.89 and 33 of 35 sheets
  sit at or below 2.17. Its own committed stills read 15.33, so the whole shot is twice the
  figure its frame table shows and one tile of it is eight times. **Issue #17 reopens,
  citing gate v2**; the v1 close comment is not withdrawn, because a pass is versioned and
  that one was true of v1.
- **G4's length limb now decides nothing on the stored corpus.** Rung 1 `balls` clears it
  at 0.2 of a frame and rung 2 at 0.4; every other candidate is exact or inside 1/60 s.
  That is the fix working: the clause it replaced was failing two rungs on a residual
  finer than the grid their frames were drawn on.

**And three verdicts are re-inspected and hold.** Rung 6 clears G7 at 2.89 — the highest
figure the clause admits, deliberately (rule 2's 🧾 says a tightening finds this rung
first). Rung 8 clears on both skeletons with G7 **SKIP** on all four sets, because they
commit every sampled frame at both rates: the whole shot is read frame by frame already,
and a candidate is not failed for having better coverage than a sheet. Rungs 3, 5 and
spineboy fail exactly where they failed under v1 — G3, G3, and G2 with G3 — and neither
changed clause reaches any of them. Rung 7 has still never been attempted.

🧾 **What this pass records for the owner rather than resolving.** The first adjudication
left two clause readings open; v2 answers one and a half, and adds two of its own.

1. ✅ **Resolved — `animations.duration` was failing rungs on an unanswerable residual.**
   That is G4's reformulation, derivation in rule 2. The ambiguity is closed, not
   adjudicated around.
2. 🟨 **Half resolved — G3 on a set of non-adjacent stills.** Where the shot has a sheet
   and the sheet meets G7, the hole is **discharged**: every sampled frame has been read,
   which is what the missing pairs left unknown. Where there is neither an adjacent pair
   nor a sheet it is still a hole, and rung 1 `drop` is still the case. ⚠️ **Rung 2's pass
   depends on the discharge**, which is new machinery in v2 rather than a reading of v1 —
   if the owner declines it, rung 2 returns to unmet on G3 and nothing else about the rung
   changes, because G4 and G7 are met either way.
3. ⚠️ **G7's margins are thin, and the corpus does not separate its top two.** 3.5 admits
   2.89 and refuses 4.00. Rule 2 carries the alternative readings (3.13 against 3.49 on
   worst tile over the shot's own worst frame; 1.38 against 1.42 on sheet mean over the
   shot's fullest set) and the conclusion that this ratio is the widest of them. A third
   sheet landing between them is the argument for moving the number.
4. ⚠️ **The spikes are on the odd tiles, and that is the same defect at two magnitudes.**
   In both `ball-catch@24fps` and `arcs@24fps` **every one** of the eight worst tiles is an
   **odd** index — a frame halfway between two 12 fps samples, which is exactly the
   residual §10.4 calls a curve split below the sampling rate. The sheet is an allowed
   input, so the defect is observable and gating it is legitimate; what the gate currently
   separates rung 4 from rung 6 by is magnitude alone. Adjudicated conservatively — the
   4.00 fails, the 2.89 passes — and recorded here rather than settled.
5. 📌 **"Read the sibling set in full" is not a substitute for the sheet, and rung 4 is the
   proof.** Its three `@24fps` sets have no adjacent pair; v1's pass discharged their G3
   holes by reading the same shots at 12 fps, where they post 0 disagreements. The sheets
   of two of those same shots then read 4.00 and 2.03. Both readings are honest and they
   are of different frames: agreement at every frame the author was given says nothing
   about the frames between them.

### The first gate-v1 adjudication — 2026-08-25

**Every stored candidate re-scored on the instruments finished in
[#159](https://github.com/firejune/rigc/pull/159), and every rung judged against gate
v1 clause by clause.** Zero builds: `check` re-read the sixteen committed candidates
over all 86 compared sets, `bench` re-ran `validate --profile spine` and the measure
table on each, and **no `bench.json` and no run directory was touched**. Where a
figure below disagrees with the one a run recorded, the run's file stays as its run
wrote it and the disagreement is prose — *Measure changes* says why.

One line per rung, on its **best stored candidate per skeleton**; the failing clauses
carry their numbers, and the whole measure table each verdict was read against is in
that rung's own section below.

| Rung | Skeleton | Candidate | G1 | G2 worst drift | G3 | G4 | G5 | Verdict |
| --- | --- | --- | :---: | --- | --- | --- | --- | :---: |
| 1 | `balls` | rung1-1 | 0 FAIL | **3.49** px `beach` | ✗ **1** + **3** disagreements | ✗ `duration` **0/1** | 1.000 / 1.000 | **FAIL** |
| 1 | `drop` | rung1-1 | 0 FAIL | 0.81 px `stick` | — no adjacent pair in either set | 1.000 ×3 | 1.000 / 1.000 *after `ground-cover`* | **not adjudicable** |
| 2 | `ess` | rung2-2 | 0 FAIL | 0.33 px `bowling` | — no adjacent pair in any set | ✗ `duration` **0/4** | 0.882 / 0.882 | **FAIL** |
| 3 | `ess` | rung3-2 | 0 FAIL | 0.84 px `pendulum` | ✗ **7** of 64 on `heavy` | 1.000 ×3 | 1.000 / 1.000 | **FAIL** |
| 4 | `ess` | rung4-1 | 0 FAIL | 3.08 px `platform` | 0 over 120 + 16 + 16 | 1.000 ×3 | 0.889 / 0.889 | **PASS** |
| 5 | `ess` | rung5-1 | 0 FAIL | 5.91 px `hood-end2` | ✗ **6** of 78 on `ball` | 1.000 ×3 | 0.923 / 1.000 | **FAIL** |
| 6 | `pro` | rung6-1 | 0 FAIL | 2.48 px `ball` | 0 over 68 | 1.000 ×3 | 1.000 / 1.000 | **PASS** |
| 7 | — | — | — | — | — | — | — | **not attempted** |
| 8 | `pendulum` | rung8-1 | 0 FAIL | 3.34 px `chain-4` | 0 over 44 + 87 | 1.000 ×3 | 1.000 / 1.000 | **PASS** |
| 8 | `ball` | rung8-2 | 0 FAIL | 4.19 px `ball` | 0 over 44 + 87 | 1.000 ×3 | 1.000 / 1.000 | **PASS** |
| spineboy | `ess` | spineboy-3 | 0 FAIL | ✗ **19.57** px `death` · 7.07 `walk` · 6.75 `run` | ✗ **3** of 59 on `death` | 1.000 ×3 | 0.952 / 0.931 | **FAIL** |

**G6, and what it decides.** Rung 4, rung 6 and rung 8 meet G1–G5 on every skeleton of
the rung — rung 8 on both, which is the clause `pendulum` and `ball` split on when it
was written — so rule 3's *close on pass* applies to all three and their ladder issues
close with this pass. No set in any of the three carries `⚠️ overdraw`; the highest
drawn ratio among them is 1.01. **Rung 1 fails as a rung on `balls` alone**: `drop` is
inside every clause that can be read on it, and G6 does not care which of the two
skeletons fails.

**Rung 7 is not adjudicable and stays ⬜.** It has never been attempted — no brief, no
reference frames, and `render_reference.ts` refuses to render it because
`7-anticipation` ships no upstream `license.txt` (*Licence, per rung*). There is no
stored candidate to re-score, and an unattempted rung is not a failing one.

⚠️ **Rung 3's ✅ does not survive gate v1, and that is the pass's largest finding.**
The rung was cleared on 2026-08-23 by a commander's reading, two days before a pass
definition existed; G3 asks for **0** per-frame disagreements in every set and
`heavy` posts **7** — two of them spacing (f0001 moves 338 px where the reference
moves 40; f0047, 282 against 63), two a move the candidate does not make (f0059,
f0060), three a hold it does not hold (f0062–f0064, 11/4/2 px against a reference
that is pixel-still). **This is not an artefact of the new instruments**: the same
candidate reads the same 7 at the commit before #159, and so do attempt 1 (**9** +
**2**) and the 2026-08-24 pilot (**5** + **1**) — **no stored rung-3 candidate meets
G3**. Nothing recorded under *Rung 3* is withdrawn; what is withdrawn is the pass
mark, and rule 3 is the rule that does it.

🧾 **Two clause readings the owner has to settle, and both are recorded rather than
resolved here.** They are listed because gate v1 does not answer them and this pass
adjudicated them the conservative way — *do not pass* — rather than choosing:

1. **`animations.duration` fails two rungs on a residual no frame carries.** G4's own
   derivation calls duration *"effectively granted … the frames are rendered over each
   animation's own length, so their count states the duration exactly"*. It does not:
   the count states it to within one sampling interval, and `frames.json`'s own
   `duration` field is the **last sampled frame's time**, not the animation's length.
   Rung 2 wrote **25.833333 s** — exactly what its `frames.json` states — against a
   reference whose last key is 25.866667 s, and `animations.duration`'s tolerance is
   one **1/60 s** frame, so it reads 0/4 on a gap of 2/60 s, four tenths of a 12 fps
   frame. Rung 1 `balls` is worse: 3.250 s against 3.233333 s is a gap of 0.016667 s
   where the tolerance is 0.0166667 s, so it fails by a third of a microsecond — the
   reference's own 6-decimal export rounding, at the exact boundary. **Rung 2's verdict
   turns on this clause alone**; rung 1's does not (it also fails G3).
2. **G3 is unreadable on a set that commits two non-adjacent stills.** `changePairs` is
   0 there, so `changeDisagreements` is 0 for having nothing to compare — the vacuous
   pass this repository refuses everywhere else, and the 🕳️ paragraph in *Operating
   rules* writes the rule for G2's drift without writing it for G3. It bites hardest on
   rung 2, whose four sets are **all** two stills 310 frames apart: that rung has no
   per-frame reading at all. Where a rung's shot is read in full at 12 fps and its
   `@24fps`/`@30fps` sibling is the same shot at another rate, this pass read the full
   set and recorded the sibling's hole — rungs 4 and 6 clear that way. Where **no** set
   of a shot can be read, the clause is recorded as unmet.

📊 **The sheet is reported and gates nothing, by construction: gate v1 was written
before the observable existed.** Two rungs' verdicts *would* differ if a sheet MAE
clause were added, and they are the input to that decision and not a verdict:

- **Rung 4** would fail on either a mean or a worst-tile clause. `ball-catch@24fps`
  reads **30.46** mean / **121.98** worst over 241 tiles against **15.33** on the two
  committed stills — the whole shot is twice the figure its frame table shows, and the
  worst tile eight times it. `wave-by-hand@24fps` 17.79 / 36.90 and `wave-offset@24fps`
  20.33 / 41.33 sit beside their sets' own 17.9.
- **Rung 6** would fail a worst-tile clause and not a mean one: `arcs@24fps` reads
  **4.84** mean — inside the corpus's honest band — with a worst tile of **13.99**,
  4.5× its own mean.
- **Rung 8** cannot move either way: both its sets commit every frame, so neither has a
  sheet. Its whole shot is already read frame by frame.
- And the sheet argues the *other* way on **rung 2**, which fails above: 4.30–4.41 mean,
  worst 4.69–4.80, **flat over all 1,244 tiles** of the four shots. The motion that
  rung's frame table could not see is faithful; what fails it is `duration`.

⚠️ Any such clause has to be reconciled with *Operating rules*' own 🚫 — **the MAE
decides nothing**, because it is not comparable across rungs or framings. A sheet MAE
is an MAE: rung 2's 4.3 and rung 4's 30.5 are partly two different plates.

📌 **Three notes for whoever reads a figure out of this pass.**

- **Rung 4's 🕳️ hole is closed.** *Operating rules* names this rung as the case where
  `framesWithoutDrift` equalled the frame count and G2 had nothing to read. Under the
  current matcher it has drift attributed in **every frame of every one of its six
  sets**, and its G2 is a measurement rather than a hole. The paragraph's reasoning
  stands; its example is dated.
- **spineboy's frozen bar is instrument-dependent.** `death`'s worst slot drift
  re-reads **14.6 → 19.57 px** on the same stored candidate, because #146 moved the box
  it is measured in. The freeze is unchanged and so is the claim it asks for; a claim
  beating attempt 3 has to beat it *on one instrument*, and the instrument is now this
  one.
- **Rung 5 clears G2 by 0.09 px** (`speedy`, 5.91 against 6.0). It fails on G3, so
  nothing rests on that margin — but a tightening of G2 would find it first.
- **The "cleared candidate" band G2 was derived from has widened, because the set of
  cleared candidates has.** It was 0.7–3.3 px, from rung 3 and the `pendulum`; the
  candidates that hold a pass mark after this pass post **0.78–4.19 px** — rung 6 at
  2.48, rung 4 at 3.08, the `pendulum` at 3.34 and the `ball` at 4.19, with rung 3 no
  longer in it. G2's 6.0 is unchanged and this is not an argument to move it; it is the
  number a later argument would start from.
- **All sixteen candidates were re-scored, not only the eleven a verdict rests on.** The
  ones a rung has a better candidate for — rung 2 attempt 1, rung 3 attempt 1 and the
  pilot, rung 8 `ball` attempt 1, spineboy attempts 1 and 2 — were read the same way and
  carry no verdict; their figures are in the pull request that landed this pass, and
  each is quoted here only where it decides something (rung 3, where all three fail the
  same clause).

⬜ **but attempted — as this read before the adjudication above.** Eleven runs across
rungs 1, 2, 4/5, 6, 8 and spineboy have been
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

> ➡️ **Read the paragraph above as the state on 2026-08-24.** *None of them cleared a
> rung* was true of the commanders' readings; the gate-v1 adjudication of 2026-08-25
> then cleared **rungs 4, 6 and 8** off these same stored candidates and withdrew rung
> 3's pass mark, and **gate v2's re-inspection the same day cleared rung 2 and reopened
> rung 4**. Nothing above is withdrawn — the runs' figures and readings stand as
> recorded — and the status cells and per-rung sections carry the current verdicts.

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
every figure attempt 2's dashboard named. They did not move it far enough. **The
ladder's active phase closes here** — spineboy is frozen as a gate (below), and the
rungs now stand as regression gates for tool and method changes rather than as
attempts waiting to be made.

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

### Rung 3 — cleared 2026-08-23, pass mark withdrawn by gate v1 (2026-08-25)

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

**Pilot run, 2026-08-24 — not a re-judgement of this rung.** A third agent —
Gemini 3.7 Flash on Antigravity — ran the rung under the pilot protocol
([`docs/PILOT.md`](PILOT.md)): [`bench/runs/2026-08-24-rung3-1/`](../bench/runs/2026-08-24-rung3-1/),
clean, honesty unverified (the harness kept no transcript). Verdict, with all
three runs re-measured on one build:
[`docs/pilot/verdicts/2026-08-24-rung3-1.md`](pilot/verdicts/2026-08-24-rung3-1.md)
— name-agnostic structure identical to both attempts above, motion at roughly
half (2× MAE, `animations` 0.768, per-frame keys instead of sparse keys with
curves).

#### Gate v1 verdict, 2026-08-25 — **FAIL on G3**, and the rung re-opens

Adjudicated on **attempt 2**, the best stored candidate of the three (lowest drift and
lowest MAE); the other two are read beside it because the clause that fails is the one
where all three fail.

| Clause | Reading | |
| --- | --- | :---: |
| **G1** validity | 0 FAIL under `--profile spine` | ✅ |
| **G2** worst attributable slot drift | `heavy` **0.84 px** (`pendulum`, f0002), `light` **0.78 px** (`pendulum`, f0012); attributed in all 86 frames | ✅ |
| **G3** per-frame motion | `heavy` **7 disagreements of 64 pairs**; `light` 0 of 20. No `⚠️ overdraw` (0.99 both) | ❌ |
| **G4** shot inventory | `count` 2/2, `names` 2/2, `duration` 2/2 | ✅ |
| **G5** drawn inventory | `slots.count` 2/2 = 1.000, `attachments.count` 2/2 = 1.000, no deduction taken | ✅ |
| **G6** the rung | one skeleton, and it fails G3 | ❌ |

The seven, verbatim from the per-frame column: **f0001** the candidate moves 338 px
where the reference moves 40 and **f0047** 282 against 63 — spacing, on the rung whose
subject is spacing; **f0059** and **f0060** the reference moves 150 px and 62 and the
candidate 0 and 3 — a move it does not make; **f0062–f0064** the reference is
pixel-still and the candidate moves 11, 4 and 2 px — a hold it does not hold.

**The other two candidates fail the same clause.** Attempt 1 posts **9** disagreements
on `heavy` (including f0058 and f0059, 0 px against 229 and 150) and **2** on `light`;
the 2026-08-24 pilot posts **5** and **1**. So the rung has no stored candidate that
meets gate v1, and a re-climb — not a re-reading — is what would clear it.

⚠️ **None of this is an artefact of the instrument change.** Re-run at
[`53a57e9`](https://github.com/firejune/rigc/commit/53a57e9), the commit before #159,
attempt 2 reads the same **7** and the same 0.84 px, attempt 1 the same **9** and
**2**. What changed on 2026-08-25 is that a pass definition exists and this column is
inside it; the figures were on disk all along, and *Operating rules* derived G3's floor
from the `pendulum`, the `ball` and spineboy without reading them.

⭐ **What is *not* said here.** Nothing under *Rung 3* above is withdrawn: attempt 1's
reading, attempt 2's §10 findings and the pilot verdict all stand as recorded. The
withdrawn thing is the pass mark, by rule 3, which is the rule that says a gate change
re-inspects everything and only the failures reopen.

#### Gate v2 re-inspection, 2026-08-25 — **FAIL on G3**, unchanged

Neither clause v2 moved reaches this rung. **G4**: both lengths are exact against the
reference, so the limb is met under either version. **G7**: both sets commit every one of
their sampled frames, so there is no sheet and the clause reads **SKIP** — the whole shot
is already read frame by frame, which is where the seven disagreements come from. The
verdict, the failing clause and the frames are the table above.

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

#### Gate v1 verdict, 2026-08-25 — **FAIL**: `balls` on G3 and G4; `drop` not adjudicable on G3

Two skeletons, so G6 needs both. `drop` is read first because its reading is the
shorter one.

| Clause | `balls` | `drop` |
| --- | --- | --- |
| **G1** validity | 0 FAIL ✅ | 0 FAIL ✅ |
| **G2** worst drift | **3.49 px** (`beach`, f0006 and f0012) ✅ — 8.9 px before #37 | **0.81 px** (`stick`) ✅ |
| **G3** per-frame | **1 of 39** and **3 of 78** ❌; no overdraw (1.08) | **no reading** — one frame per set, 0 adjacent pairs |
| **G4** shot inventory | `count` 1/1, `names` 1/1, **`duration` 0/1** ❌ | 1/1, 1/1, 1/1 ✅ |
| **G5** drawn inventory | 8/8 and 8/8 = 1.000 ✅ | 4/5 → **1.000 after deducting `ground-cover`** ✅ |

**`balls`'s G3, in the frames' own terms.** `animation` f0039: the reference's last
pair is still and the candidate moves 63 px — the shot's final hold is not held.
`animation@24fps` f0067, f0074 and f0078: the reference moves 112, 430 and 48 px and
the candidate 14, 13 and 7 — it has stopped while the reference is still travelling.
Both are the tail of the shot, and both are watchable at the rate they were rendered.

🧾 **G5's deduction, itemised.** One element is deducted from `drop`'s reference side:
**`ground-cover`**, the layer the run omitted on a pixel measurement (4 slots against
5), which *Operating rules* already carries as one of the three kinds that qualify.
That is the whole deduction — 4/4 on both counts after it, and nothing else on this
rung is deducted.

⚠️ **`balls`'s `duration` 0/1 is at the measure's boundary, and the pass records it
rather than reading past it.** The candidate declares **3.250 s** and the reference's
last key is at **3.233333 s**; `animations.duration` allows one 1/60 s frame, so the
gap of 0.016667 s misses by about a third of a microsecond — the reference export's own
six-decimal rounding. `frames.json` states this set's duration as **3.25**, so the
candidate wrote the number the protocol handed it. The verdict does not turn on the
clause (G3 fails independently), and the clause reading is on the list of two the
adjudication left for the owner under **Status**.

#### Gate v2 re-inspection, 2026-08-25 — **FAIL**: `balls` on G3 alone; `drop` still not adjudicable

The rung's verdict does not move and one of its two failing clauses does.

- ✅ **`balls`'s G4 is met under v2.** 3.250 s against 3.233333 s is **0.2 of a 12 fps
  frame** and 0.4 of a 24 fps one, inside a tolerance of one whole interval either way.
  The ⚠️ above is the case v2's G4 was reformulated on: the candidate wrote the number the
  protocol handed it and the old clause failed it by a third of a microsecond. **G3 still
  fails** — 1 of 39 and 3 of 78, the tail of the shot, watchable at the rate it was
  rendered — so the skeleton fails and G6 with it.
- **G7 reads SKIP on all four sets.** `balls` commits every sampled frame at both rates,
  so its whole shot is read frame by frame already; `drop`'s two sets are a single pose
  each. Neither has a sheet, and neither is a hole for want of one.
- ⚠️ **`drop` stays not adjudicable, and v2 is why that is now a narrower statement.**
  Elsewhere on this ladder a shot with no adjacent pair can have its G3 hole discharged by
  a sheet; `drop` has one frame per set and no sheet, so there is nothing to discharge it
  with. It is inside every clause that *can* be read on it, and G6 does not care which of
  the rung's two skeletons fails.

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

> ⚠️ **Those are the run's own figures at the instruments of 2026-08-23, and they are
> not comparable with the re-read below** — the run measured with a hand-pinned
> viewport against a framing that had not yet learnt the frames' own box (#52, #100)
> and a slot matcher that attributed nothing here (#39). The gate-v1 verdict quotes the
> current instruments and says so.

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

> ➡️ **Both have now been re-run against the fixed tool** — that is the gate-v1
> verdict below, and the matcher problem is gone: this candidate has a slot attributed
> in **every frame of every one of its six sets**.

#### Gate v1 verdict, 2026-08-25 — **PASS**, and the rung closes

One skeleton, so G6 is G1–G5. All six sets, on the current instruments:

| Clause | Reading | |
| --- | --- | :---: |
| **G1** validity | 0 FAIL under `--profile spine` | ✅ |
| **G2** worst attributable slot drift | worst of six sets **3.08 px** (`platform`, `ball-catch` f0012); then `wave-offset` 1.99, `wave-by-hand` 1.10, `ball-catch@24fps` 0.89, the two other `@24fps` sets 0.59. **`framesWithoutDrift` is 0 in all six** — no set is a 🕳️ hole | ✅ |
| **G3** per-frame motion | **0 disagreements** over 120 pairs (`ball-catch`), 16 (`wave-by-hand`) and 16 (`wave-offset`) — all three shots read in full at 12 fps. No `⚠️ overdraw`: 0.98–0.99 on every set | ✅ |
| **G4** shot inventory | `count` 3/3, `names` 3/3, `duration` 3/3 | ✅ |
| **G5** drawn inventory | `slots.count` **8/9 = 0.889**, `attachments.count` **8/9 = 0.889**, both over the 0.85 floor **with no deduction taken** | ✅ |
| **G6** the rung | the one skeleton meets G1–G5 | ✅ |

🧾 **G5 without a deduction, and the element it is short by, named anyway.** The
reference splits the basketball's lambertian disc into **two** slots — a multiply and
an additive pass — where this candidate carries one `ball-shade`. It clears the floor
on the bare count, so nothing is deducted; the element is named because a verdict that
did not say which part it is would be asking the reader to take 8/9 on trust.

📌 **The whole table, and where the editor-finishing work lands.** Reported and not
gating: `bones` 0.499 / `slots` 0.215 (naming and slot strategy — the brief grants the
author its own names), `attachments` 0.859, `animations` **0.854** with `key_counts`
short at the density this rung's own entry measures, `constraints` 1.000 **at 0/0**,
which is vacuous and says nothing. MAE, per set and deciding nothing: `ball-catch`
21.50 union / 22.23 over the reference's own pixels, the two whip shots 17.99–18.00,
the three `@24fps` stills sets 15.33–17.92.

📊 **The sheet, reported: this rung is the one whose verdict a sheet clause would
change.** `ball-catch@24fps` reads **30.46** mean and **121.98** worst over 241 tiles
where its two committed stills read 15.33; `wave-by-hand@24fps` 17.79 / 36.90 and
`wave-offset@24fps` 20.33 / 41.33. Gate v1 was written before the sheet existed and
does not gate it, so this pass does not either — it is listed under **Status** as input
to a gate v2 decision, together with the 🚫 that says an MAE decides nothing.

#### Gate v2 re-inspection, 2026-08-25 — **FAIL on G7**, and the rung re-opens

The decision the paragraph above handed to gate v2 came back as a clause, and this is the
rung it fails. G1–G5 are met on the same numbers as above, unchanged and re-read on the
same sweep; G7 is the one that is new.

| Clause | Reading | |
| --- | --- | :---: |
| **G7** the whole shot | `ball-catch@24fps` **121.98** worst tile over a **30.46** mean = **4.00×**, 241 tiles — the corpus's highest, where the next figure is 2.89 and 33 of 35 sheets sit at or below 2.17. `wave-by-hand@24fps` 2.07 and `wave-offset@24fps` 2.03 clear | ❌ |
| **G4** length limb | `count` 3/3, `names` 3/3, all three lengths exact against the reference | ✅ |
| **G1 · G2 · G3 · G5** | as the table above: 0 FAIL, 3.08 px, 0 over 152 adjacent pairs, 0.889 / 0.889 | ✅ |
| **G6** the rung | the one skeleton fails G7 | ❌ |

⚠️ **The finding is not the mean, it is the spike, and it is on the half-frames.** All
eight of `ball-catch@24fps`'s worst tiles are **odd** indices — frames between two 12 fps
samples — so what the sheet reads is the shape of this candidate's curves between the
frames its author was given. The 12 fps reading of the same shot is clean, and both
readings are honest: *agreement at every frame you were shown says nothing about the
frames between them.* ⇒ **The residual is observable and this run never had the
observable**, which makes rung 4 a re-climb rather than an adjudication — it rejoins the
queue in rule 4. **Nothing recorded above is withdrawn, and the gate-v1 pass is not
withdrawn either**: a pass is versioned, and that one was true of gate v1.

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

#### Gate v1 verdict, 2026-08-25 — **FAIL on G3**, and the failure is hairline

| Clause | Reading | |
| --- | --- | :---: |
| **G1** validity | 0 FAIL under `--profile spine` | ✅ |
| **G2** worst attributable slot drift | **5.91 px** (`hood-end2`, `speedy` f0002) — clears the 6.0 px floor by **0.09 px**; the four `ball`-family sets read 1.30, `speedy@24fps` 2.88. Attributed in every frame of every set | ✅ |
| **G3** per-frame motion | `ball` **6 disagreements of 78**; `speedy` 0 of 78; the four stills sets carry no adjacent pair. No `⚠️ overdraw` (0.99 throughout) | ❌ |
| **G4** shot inventory | `count` 3/3, `names` 3/3, `duration` 3/3 | ✅ |
| **G5** drawn inventory | `slots.count` **12/13 = 0.923** (the reference's two hair slots against this candidate's one), `attachments.count` **29/29 = 1.000**; no deduction taken | ✅ |
| **G6** the rung | one skeleton, and it fails G3 | ❌ |

**The six, and what they are.** `ball` f0017, f0018, f0047, f0076, f0077, f0078: the
reference is **pixel-still** and the candidate moves **1, 2, 8, 4, 2 and 1** px. Every
one is the categorical half of the per-frame rule — *against a still side, moving at
all is the finding* — and `check`'s own comment says why that half gets no floor: the
smallest thing it has to keep is rung 6's three-pixel one-frame reveal. So the clause
is applied as written and the rung fails, and the character of the failure is recorded
with it: **this is not a limb that teleports**, it is a shot whose two held passages
the candidate does not quite freeze. A re-climb has a small, named target.

📌 **Reported and not gating.** `bones` 0.452 / `slots` 0.313 (naming), `attachments`
0.897, `animations` **0.697** — `key_counts` 387 against 2,038, the residual this rung's
own reading calls its main one — `constraints` 1.000 **at 0/0**, vacuous. MAE: `ball`
4.35 union / 4.36 reference-denominator, at the course plate's own floor (4.29 for the
plate alone), `speedy` 6.35 / 6.39. Sheet, report-only: `ball@24fps` **5.78** mean /
6.08 worst over 157 tiles, `speedy@24fps` **7.60** / 8.87 — flat, and no whole-shot
surprise behind either stills set.

#### Gate v2 re-inspection, 2026-08-25 — **FAIL on G3**, unchanged

**G4**: all three lengths exact, met under either version. **G7**: the two sheets the
paragraph above reports are now read as clauses and both clear comfortably — `ball@24fps`
**1.05×** its own mean and `speedy@24fps` **1.17×**, against a bar of 3.5, which says in
the gate's own terms what that paragraph said in prose. The rung still fails on `ball`'s
six disagreements, and 5.91 px still clears G2 by 0.09 px, so a tightening of G2 would
find this rung first.

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

#### Gate v1 verdict, 2026-08-25 — **FAIL on G4 alone**, with G3 unreadable

Adjudicated on **attempt 2**, the better of the rung's two candidates: attempt 1 fails
G5 outright (`slots.count` **8/17 = 0.471**, the four-balls-into-three-slots bet) as
well as G4, so nothing below depends on it.

| Clause | Reading | |
| --- | --- | :---: |
| **G1** validity | 0 FAIL under `--profile spine` | ✅ |
| **G2** worst attributable slot drift | **0.33 px** worst of four sets (`bowling`, f0310); `basketball` and `billiard-ball` 0.23 (`ring-lower`), `tennis-ball` 0.25. This is the rung's **first readable drift table** — #37 took the same figures from 11.0–11.2 px, where the reference merges the course, the water, the panel and both rings into one component the course is 81 % of | ✅ |
| **G3** per-frame motion | **0 disagreements — of 0 adjacent pairs.** All four sets commit two stills, `f0000` and `f0310`, so there is no pair to compare and the clause has nothing to read in any set of this rung. No `⚠️ overdraw` (0.98) | ⚠️ **no reading** |
| **G4** shot inventory | `count` 4/4, `names` 4/4, **`duration` 0/4** | ❌ |
| **G5** drawn inventory | `slots.count` **15/17 = 0.882**, `attachments.count` **15/17 = 0.882**, both over the floor with no deduction taken | ✅ |
| **G6** the rung | one skeleton, and it fails G4 | ❌ |

⚠️ **The failing clause is a 1/30 s duration, and the candidate wrote the number the
protocol handed it.** All four shots declare **25.833333 s**, which is exactly what
`bench/reference/2-the-12-principles/frames.json` states for all four sets; the
reference's last key is at **25.866667 s**. `animations.duration` allows one **1/60 s**
frame, the gap is two of them, and **four tenths of a 12 fps frame is not a thing any
reading of these frames could have decided** — which is the test *Operating rules* rule
1 sets for whether a measure may fail a rung. G4 names the measure all the same and
asks for 1.000, so the verdict is FAIL and the clause reading goes to the owner as
item 1 of the two under **Status**. ⇒ **This rung is the one whose verdict turns on a
clause reading rather than on a defect.**

📊 **And the sheet says the motion is faithful.** The whole-shot figure this rung never
had reads **4.30 / 4.32 / 4.41 / 4.34** mean and 4.69–4.80 worst, flat over **all 1,244
tiles** of the four shots — corroborating the in-run prototype's 4.85–4.95 at its own
framing, and leaving no whole-shot hole behind the two-still table. It is reported and
gates nothing.

📌 **Reported and not gating.** `bones` 0.308 / `slots` 0.156 (naming, and 10 bones /
15 slots against 12 / 17), `attachments` 0.853, `animations` 0.623 (`key_counts` sparse
against the reference, this rung's recorded residual), `constraints` 1.000 **at 0/0**,
vacuous. MAE 4.19–4.26 union on the stills.

#### Gate v2 re-inspection, 2026-08-25 — **PASS**, and the rung closes

Both of the things this rung's v1 verdict was waiting on were clause questions, and gate
v2 answers both. No figure moved: the readings below are the ones in the table above,
re-read on the same sweep.

| Clause | Reading under v2 | |
| --- | --- | :---: |
| **G4** length limb | `count` 4/4, `names` 4/4; each shot declares **25.833333 s** against a reference length of **25.866667 s** — a gap of 0.033334 s, **four tenths of a 12 fps frame**, where the tolerance is one whole one (0.083333 s). Inside by 2.5× | ✅ |
| **G7** the whole shot | four sheets, **311 of 311 tiles** compared each: worst tile **1.11 · 1.09 · 1.09 · 1.10 ×** the sheet's own mean (4.76 / 4.69 / 4.80 / 4.77 over 4.30 / 4.32 / 4.41 / 4.34). The flattest sheets in the corpus, against a bar of 3.5 | ✅ |
| **G3** per-frame motion | still **0 pairs in all four sets** — and the hole is now **discharged**: G7 is a reading of every one of the 311 sampled frames of every shot, which is what the missing pairs left unknown. No `⚠️ overdraw` (0.98) | ✅ *discharged* |
| **G1 · G2 · G5** | 0 FAIL; **0.33 px** worst drift of four sets; `slots.count` and `attachments.count` **0.882** | ✅ |
| **G6** the rung | one skeleton, and it meets G1–G5 and G7 | ✅ |

⭐ **This is the first rung the ladder clears on shots no frame table could read frame by
frame.** Four
sets of two stills 310 frames apart gave it no per-frame reading at all, and the whole of
what says its trajectories, its ring rates and its attachment swaps land where and when
they should is the sheet — flat across 1,244 tiles. The prose above stands as written:
the motion was faithful and the clause that failed the rung was a duration the protocol
had handed the author. ⚠️ **The pass depends on G7's discharge of G3's hole**, which is
new machinery in v2 rather than a re-reading of v1; that dependency is recorded as item 2
of the ambiguities under *The gate-v2 re-inspection*.

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

#### Gate v1 verdict, 2026-08-25 — **PASS**, and the rung closes

| Clause | Reading | |
| --- | --- | :---: |
| **G1** validity | 0 FAIL under `--profile spine` | ✅ |
| **G2** worst attributable slot drift | `arcs` **2.48 px** (`ball`, f0010), `arcs@24fps` **1.55 px** (`tracker`). The run recorded 4.1 px at the frames' own box; #37 took it to 2.5 by no longer calling the blob the stone shares with the ball one slot's own. Attributed in every frame of both sets | ✅ |
| **G3** per-frame motion | **0 disagreements** over 68 pairs on `arcs` — the shot read in full at 12 fps, including the f64–f68 plateau this run's own tool findings named. `arcs@24fps` is two stills and carries no pair. No `⚠️ overdraw` (1.00 / 1.01) | ✅ |
| **G4** shot inventory | `count` 1/1, `names` 1/1, `duration` 1/1 | ✅ |
| **G5** drawn inventory | `slots.count` **4/4 = 1.000**, `attachments.count` **4/4 = 1.000**; no deduction taken | ✅ |
| **G6** the rung | the one skeleton meets G1–G5 | ✅ |

⭐ **What this rung's pass demonstrates, and it is the point of rule 1.** `constraints`
reads **0.000** — 0 of 4 — and the rung passes anyway, because a physics chain and a
hand-keyed chain draw identical frames and *no reading of the frames could have decided
it*. Same for `attachments` **0.396**: one mesh where the reference has two, with
`region_size` 2/3 moving with that choice. Both are on rule 1's unobservable table by
name, both are reported here, and neither gates. The observable half — the bend the rung
is actually about — is inside every clause that does.

📌 **Reported and not gating.** `bones` 0.433 / `slots` 0.306 (naming), `animations`
**0.810**: `count`, `names`, `duration`, `draw_order` and `deform` all 1.000,
`key_counts` 391/539, `curve_kinds` **34/539** — the linear-against-bezier gap this
rung named and rung 3's second attempt closed with §10.4. MAE 3.50 union / 3.53 over the
reference's own pixels on `arcs`, 3.09 / 3.11 on `arcs@24fps`.

📊 **The sheet, reported.** `arcs@24fps` **4.84** mean over 137 tiles with a worst tile
of **13.99** — the mean sits inside the corpus's honest band and the worst is 4.5× the
figure this set's own two committed stills read (3.09).
A *worst-tile* sheet clause would change this verdict and a *mean* one would not, which
is why the rung is on the gate v2 list under **Status** with its numbers rather than
adjudicated on a clause that does not exist.

#### Gate v2 re-inspection, 2026-08-25 — **PASS**, and the rung stays closed

The clause the paragraph above expected to change this verdict does not, because of which
denominator it is written on.

| Clause | Reading under v2 | |
| --- | --- | :---: |
| **G7** the whole shot | `arcs@24fps` worst tile **13.99** over the **sheet's own mean of 4.84** = **2.89×**, 137 tiles, against a bar of 3.5. **The highest figure the clause admits in the whole corpus** | ✅ |
| **G4** length limb | `count` 1/1, `names` 1/1, length exact | ✅ |
| **G1 · G2 · G3 · G5** | as the table above: 0 FAIL, 2.48 px, 0 over 68 pairs, 1.000 / 1.000 | ✅ |
| **G6** the rung | the one skeleton meets G1–G5 and G7 | ✅ |

📎 **Two ratios, and the clause is written on the second.** The *"4.5×"* above divides the
worst tile by this set's **committed stills'** MAE (3.09); G7 divides it by the **sheet's
own** mean (4.84), which is 2.89. Both are honest and they are not the same question —
*"is this tile worse than the frames I was shown?"* against *"is this sheet flat?"* — and
rule 2 says why the gate asks the second: a sheet's own mean is the only denominator that
carries the same plate, the same box and the same scale as the tile it is compared with.
Two committed stills are a sample of two.

⚠️ **This rung is the one a tightening of G7 finds first, and rule 2 names it there.** Its
worst tiles are all **odd** indices — the half-frames between two 12 fps samples — so what
the 2.89 measures is this candidate's curve shape between the frames its author had, at a
magnitude the first calibration deliberately admits. The pass is a pass; it is also the
narrowest one on the page.

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

#### Gate v1 verdict, 2026-08-25 — `pendulum` **PASSES**

The `pendulum` candidate was never re-authored, so this run's is the rung's only one
for that skeleton. The `ball` verdict is under *Rung 8, attempt 2* below, and the rung's
own verdict is there with it.

| Clause | `pendulum` reading | |
| --- | --- | :---: |
| **G1** validity | 0 FAIL under `--profile spine` | ✅ |
| **G2** worst attributable slot drift | **3.34 px** (`chain-4`) in both sets — f0012 at 12 fps, f0024 at 24 fps. Attributed in every frame of both, and both are measured in `frames.json`'s **own** box, so none of it is framing | ✅ |
| **G3** per-frame motion | **0 disagreements** over **44** and **87** adjacent pairs — every frame of both sets, at both rates. No `⚠️ overdraw` (0.98) | ✅ |
| **G4** shot inventory | `count` 1/1, `names` 1/1, `duration` 1/1 | ✅ |
| **G5** drawn inventory | `slots.count` **6/6 = 1.000**, `attachments.count` **6/6 = 1.000**; no deduction taken | ✅ |

📌 **Reported and not gating**, and this candidate is where the reported half is most
worth reading: `attachments` **1.000 across the board** including `names` 6/6,
name-agnostic `bones` and `slots` both **1.000**, `slots.order` 6/6 measured rather than
guessed — and against that, `animations` 0.846 with `key_counts` 135/302 (the run's own
over-keying, logged with its whole cost curve), `timeline_kinds` **0.625** on the
separate-versus-combined checkbox rule 1 exempts by name, and `constraints` 1.000 **at
0/0**, vacuous on both sides. MAE 12.52 / 12.56 union, 12.72 / 12.77 over the
reference's own pixels. Neither set ships a contact sheet — every frame is on disk — so
there is no sheet figure to report and none to withhold.

#### Gate v2 re-inspection, 2026-08-25 — `pendulum` **PASSES**, unchanged

**G4**: the candidate's length is **3.633333 s** against the reference's 3.633333 s —
exact, and the only candidate on the ladder that wrote a length neither of its two
sidecars states (they say 3.666667 at 12 fps and 3.625 at 24). **G7** reads **SKIP** on
both sets: every sampled frame is committed at both rates, so the whole shot is read frame
by frame under G2 and G3 and a sheet would add nothing to it. A SKIP is not a pass and it
is not a hole either — the coverage a sheet stands in for is already here.

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

> ➡️ **That question was decided on 2026-08-25, and the answer was the other one.**
> The protocol change is not a hint in the brief but a pass definition that stops
> asking: *Operating rules* rule 1 reports unobservable structure and never gates on
> it, so neither the four constraints nor the key density above can fail a rung
> ([#153](https://github.com/firejune/rigc/issues/153)). **Whether this candidate
> meets gate v1 is the adjudication pass's verdict and not this entry's** — nothing
> recorded above is withdrawn or restated, and the figures stay as the run measured
> them.

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
direct measurement of the art, and the third shipped on stated reasoning. The
sentence that saved it was buried in §8's draw-order paragraph; it is now a
paragraph of its own governing every render-back sweep
([#114](https://github.com/firejune/rigc/issues/114)).

**Known-wrong, in the run's own words:** mesh topology is invented and the frames
cannot see any of it; MAE 17–18 is this rig's structural floor rather than the fit's
noise, concentrated on a trail cross-section the reference reads about 12 px wide
where `tail.png` at its own scale renders 9; and two poses (`f0023`, `f0030`) come
from the pixel fit alone, on frames the brief says carry no measurable ball.

#### Gate v1 verdict, 2026-08-25 — `ball` **PASSES**, and so does the rung

Adjudicated on this attempt, the better `ball` candidate on every axis the pixels reach.

| Clause | `ball` reading (attempt 2) | |
| --- | --- | :---: |
| **G1** validity | 0 FAIL under `--profile spine` | ✅ |
| **G2** worst attributable slot drift | **4.16 px** at 12 fps (`ball`, f0042) and **4.19 px** at 24 fps (`ball`, f0077), both in `frames.json`'s own box — attempt 1 read 5.33 px | ✅ |
| **G3** per-frame motion | **0 disagreements** over **44** and **87** adjacent pairs. No `⚠️ overdraw` (1.01) | ✅ |
| **G4** shot inventory | `count` 1/1, `names` 1/1, `duration` 1/1 | ✅ |
| **G5** drawn inventory | `slots.count` **2/2 = 1.000**, `attachments.count` **2/2 = 1.000**; no deduction taken | ✅ |
| **G6** the rung | `pendulum` ✅ (attempt 1, above) **and** `ball` ✅ — a two-skeleton rung clears when both do | ✅ |

⭐ **This is the candidate rule 1 was written for, and the arithmetic is worth stating
once.** The whole of this rig's recorded gap is on rule 1's unobservable table:
`constraints` **0.000** (0 of 4), `bones.count` **8/12** — the four bones those
constraints drive, which draw nothing of their own — name-agnostic `bones` 0.517 and
`slots` 0.750, which inherit the same hole, `attachments` 0.667 with the mesh topology
the run itself calls invented, and `key_counts` 0.589, a density [#112](https://github.com/firejune/rigc/issues/112)
shows the shot's own acceleration pins. **Not one of them is a clause of gate v1**, and
the block this entry recorded — *"further `ball` attempts are not warranted without a
new observable input"* — is answered by a pass rather than by a run.

📌 **Reported and not gating**, in full: `bones` 0.448 name-matched, `slots` 0.929 with
`names`, `order`, `attachment` and `blend` all 1.000, `attachments` 0.667
(`type_counts` and `mesh_weighted` 1.000, `region_size` 0/1), `animations` 0.876
(`curve_kinds` 0.691), `events` 1.000 at 0/0 — vacuous. MAE 17.26 / 18.00 union and
18.64 / 19.46 over the reference's own pixels, which is this rig's structural floor by
the run's own account and decides nothing either way. No contact sheet on either set.

#### Gate v2 re-inspection, 2026-08-25 — `ball` **PASSES**, and so does the rung

**G4**: the candidate declares **3.625 s** against a reference length of 3.633333 s — the
24 fps sidecar's own value, off by a fifth of a 24 fps frame. It cleared v1's 1/60 s
tolerance too, by half of it; under v2 it clears by 5× and for a stated reason rather than
by luck of which side of the grid it fell on. **G7** reads **SKIP** on both sets: every
sampled frame is committed at both rates, so neither set has a sheet and the shot is read
frame by frame instead. **G6** unchanged — `pendulum` and `ball` both pass, so the rung
does.

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

🧊 **Frozen as a gate, 2026-08-24 — the rung stops taking attempts for their own
sake.** A rigid pre-alignment probe refuted the hypothesis this section left standing,
that `death`'s lying passage wants a whole-body pre-alignment: the candidate **already
lies at the right angle**, and **81 % of what any rigid transform could still win there
is one constant pixel** — `check`'s own framing floor rather than an authoring defect,
filed as [#146](https://github.com/firejune/rigc/issues/146) with the measurement
recorded on [#139](https://github.com/firejune/rigc/issues/139). The residual is
intra-chain, and the move that reaches it — the multi-start refit over `death`'s long
tail, which attempt 3's *Known wrong* already names — is incremental. Incremental does
not earn a full run.

**So the rung's figures become the bar. It reopens when a change of approach, spec or
solution claims an improvement, and that claim is judged against attempt 3's recorded
figures** — `bones` **0.924** name-matched / **0.967** name-agnostic, `slots` **0.844** /
**0.810**, `animations` **0.804**; per chain, `front-thigh` **14.6 px** worst and `death`
**54.31** reference-denominator MAE — **together with the floors the cleared candidates
post**, `pendulum` and rung 3 at **0.7–3.3 px** of worst slot drift. A claim that does not
beat them is not an improvement, and a run is not owed to it.
[#16](https://github.com/firejune/rigc/issues/16) stays open: a gate is not a clearing.

> ➡️ **Those same floors became gate v1's G2 on 2026-08-25** — *Operating rules* rule
> 2 turns the 0.7–3.3 px band this paragraph names into a written threshold, and rule
> 4 makes this rung the graduation exam taken last, on the matured guide. The freeze
> above is unchanged: an attempt is still owed only to a claim that beats these
> figures. What is new is that a **gate** change now reopens a passed rung on its own
> (rule 3), which is why the instruments are finished before the adjudicating starts.

#### Gate v1 verdict, 2026-08-25 — **FAIL on G2 and G3**, and the freeze stands

Adjudicated on **attempt 3**, the rung's best stored candidate; `pro` was never built
and does not gate the rung ([#16](https://github.com/firejune/rigc/issues/16)).

| Clause | Reading over all 16 sets | |
| --- | --- | :---: |
| **G1** validity | 0 FAIL under `--profile spine` (18 PASS, 2 SKIP argued in the run) | ✅ |
| **G2** worst attributable slot drift | **three sets over the 6.0 px floor**: `death` **19.57 px** (`rear-shin`, f0006), `walk` **7.07 px** (`rear-shin`), `run` **6.75 px** (`front-shin`). The other thirteen sit at 2.0–4.8 px | ❌ |
| **G3** per-frame motion | `death` **3 disagreements of 59** — f0016 the candidate moves **2,693 px** where the reference moves 211, f0017 **2,996** against 70, f0023 0 against 1. The other five readable sets are clean, and the nine `@30fps`/`aim` sets are stills with no adjacent pair. **No `⚠️ overdraw` on any of the 16** (highest 1.14) | ❌ |
| **G4** shot inventory | `count` 8/8, `names` 8/8, `duration` 8/8 | ✅ |
| **G5** drawn inventory | `slots.count` **20/21 = 0.952**, `attachments.count` **27/29 = 0.931**, both over the floor — the figures the floor was set from — with **no** deduction taken. The bounding box this run calls its most arguable omission was **not** needed as one | ✅ |
| **G6** the rung | `ess` fails G2 and G3 | ❌ |

⚠️ **`death`'s worst drift re-reads 14.6 → 19.57 px, and the cause is the instrument,
not the rig.** #146's refined pass moves this set's box by (−1, +1) — worth 54.31 → 48.47
on the reference-denominator MAE, exactly the 5.83 the issue's own probe measured — and a
constant offset taken out of the whole picture exposes a single part's own displacement.
⇒ **The figures the freeze names are instrument-dated.** The freeze itself is unchanged
and so is what it asks for; a claim that beats attempt 3 has to beat it on one
instrument, and that instrument is now the post-#159 panel: **19.57 px** worst drift,
**48.47** on `death`, 3 per-frame disagreements, against the **0.7–4.2 px** the cleared
candidates post.

⇒ **Nothing about this verdict is news to this section** — *skeleton yes, motion not
yet* is what attempt 3's own reading says, and G5 passing at 0.952 / 0.931 while G2
fails on three shots is that sentence in clause form. The gate adds one thing: the
motion half now has a **written** bar to clear rather than a band to be compared with.

#### Gate v2 re-inspection, 2026-08-25 — **FAIL on G2 and G3**, and the freeze stands

Neither changed clause reaches this rung, and the freeze's bar is unmoved.

- **G4**: all eight lengths are inside 1/60 s of the reference's, so the limb is met under
  either version — this candidate never needed the leniency the reformulation adds.
- **G7**: seven of the eight `@30fps` sets carry a sheet — `aim@30fps` is a single pose —
  and **all seven clear**, at 1.14× to **2.03×** their own means, the highest being
  `jump@30fps` (92.23 over 45.47). So the whole-shot observable finds nothing here the
  frame table had not: the *levels* are high because this is a hard plate at a small
  scale, and the levels are exactly what G7 declines to read. The eight 12 fps sets commit
  every frame and read SKIP.
- ⇒ **The graduation bar now reads: 19.57 px worst drift, 3 per-frame disagreements, and
  every sheet inside 3.5×.** A claim that beats attempt 3 beats it on those, on this
  instrument panel.

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
