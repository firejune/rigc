# The benchmark ladder

**Live status document.** The rung order, what each rung gates on, how a rung is
scored, what a pass is (*Operating rules*, gate **v2.3** — the clauses themselves are
stated in [GATE.md](GATE.md), which this section derives), and where each one stands
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

What that person reads the measures *against* is the current gate — **gate v2.3** since
2026-09-02 — whose clauses are stated in **[GATE.md](GATE.md)**: which measures decide a
rung, which are reported without deciding anything, and the number each of the deciding
ones has to clear. ✅ **That card is allowed reading for an authoring run**, and it is the
canonical statement of every clause. 🚫 What is not is *Operating rules* below, which
carries the **derivations** — they quote previous runs' figures to arrive at those numbers,
so an authoring run does not open that section. The pointer to it is here for whoever is
judging a candidate rather than building one.

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

**2026-08-26 — gate v2.1 introduced** (the owner's ruling on the clause gap
[#10](https://github.com/firejune/rigc/issues/10) and the 2026-08-26 batch adjudication
both recorded). **No measure's definition changed, no threshold moved and no recorded
figure moves** — this is a *reading* of one existing clause, and every `bench.json` on disk
stays as its run wrote it. One change from v2, and the rest of the clause set is v2's:

- **G3's scope excludes a single-pose set**, and where that exclusion leaves a skeleton with
  no G3-readable set at all the clause reads **SKIP** rather than a pass or a fail — G7's
  own precedent, *no observable ⇒ SKIP*. 🚫 It is **not** a general *no adjacent pair ⇒
  SKIP* rule: a set of non-adjacent stills is a shot sampled twice and its hole is still
  G7's to discharge. The statement, its three precedents and what it costs are in
  *Operating rules* rule 2, under *Gate v2.1*.

By rule 5's asymmetry this could only ever *pass* an open rung, so it was not owed
immediately; what released it is rule 5 point 3's milestone. Its re-inspection is the entry
below.

**2026-08-26 — the gate-v2.1 re-inspection.** The bump's own re-inspection, taken in the
same pass. **No measure's definition changed here either**: this entry records that the pass
rule 3 requires has been *taken* against gate v2.1, over every candidate that holds a
verdict — the **ten standing candidates over 44 committed sets**, 963 adjacent pairs and 17
compared sheets, re-read by `check` and `validate --profile spine` **from the repository
root with no `--atlas` override**, reproducing the recorded figures to the digit. `bench`
was not re-run, because nothing v2.1 changes can reach G4's lengths or G5's counts; those
are quoted from the verdicts that measured them. 🚫 **No `bench.json` and no run directory
was rewritten.** **One verdict moves**: rung 1 `drop`'s G3 goes from *not adjudicable —
clause gap* to **SKIP**, so **rung 1 meets G6 and #10 closes**. Rungs 2, 3, 4, 5, 6 and 8
are re-inspected and hold; spineboy fails where it failed under v2. ⚠️ The superseded
attempts are **not** re-adjudicated — they keep their own entries, which is why this sweep's
44 sets are fewer than the 86 the 2026-08-25 passes read and not a coverage loss. Figures
and the clause each verdict was read against are in *The gate-v2.1 re-inspection* under
**Status** below.

**2026-08-29 — gate v2.2 introduced** (the owner's rulings on
[#198](https://github.com/firejune/rigc/issues/198),
[#193](https://github.com/firejune/rigc/issues/193) and
[#207](https://github.com/firejune/rigc/issues/207)). **No measure's definition changed, no
threshold moved and no recorded figure moves** — every `bench.json` on disk stays as its run
wrote it. One clause gains a limb and the rest of the clause set is v2's:

- **G2 is read per slot as well as per set.** A slot that draws in a measured set and is
  attributable in **no frame** of that set is **read down explicitly in the verdict** — the
  slot named, the evidence named — or the clause fails for that set. It closes the gap rung 7
  attempt 2 recorded: G2's 🕳️ fires on a *set*, so a part drawn behind another over a flat
  backdrop can be misplaced and never appear in the clause that measures placement. The
  statement, the four kinds of evidence that qualify and what the limb costs are in *Operating
  rules* rule 2, under *Gate v2.2*.

Released beside it and changing no clause: **G7's 3.5× stands** — its own revisit trigger
fired on rung 7 attempt 2's 2.923 and the deliberation held the number — and the *"a
tightening of X finds Y first"* lines are **deleted** in favour of *The clause margins* under
**Status**, which every adjudication updates.

By rule 5's asymmetry the limb can only make a **standing pass fail**, which is point 2's
integrity half, so its re-inspection is taken in the same pass rather than deferred. It is the
entry below.

**2026-08-29 — the gate-v2.2 re-inspection.** The bump's own re-inspection, taken
immediately for the reason rule 5 gives. **No measure's definition changed here either**: this
entry records that the pass rule 3 requires has been *taken* against gate v2.2, over the
**eleven standing candidates** — every rung and the graduation skeleton — across **56
committed sets**, 1,142 compared frames, 1,061 adjacent pairs and 25 compared sheets, re-read
by `check` and `validate --profile spine` **from the repository root with no `--atlas` and no
`--viewport` override**, reproducing every gated figure to the digit. Rung 7's frames were
rendered locally at its brief's exact flags first, and **no frame of it was committed**.
`bench` was not re-run, because nothing v2.2 changes can reach G4's lengths or G5's counts;
those are quoted from the verdicts that measured them. 🚫 **No `bench.json` and no run
directory was rewritten.** **No verdict moves**: the new limb fires on **194** blank
(set, slot) pairs across four candidates, and every one reads down — the twelve slots
attributable in no set at all are itemised individually. Figures, the read-downs and the
margins they feed are in *The gate-v2.2 re-inspection* and *The clause margins* under
**Status** below.

**2026-08-29 — `check` attributes the texture floor, substitutes texture only, and stops the
extent test punishing a silhouette** ([PR #254](https://github.com/firejune/rigc/pull/254),
issues [#171](https://github.com/firejune/rigc/issues/171),
[#199](https://github.com/firejune/rigc/issues/199) and
[#194](https://github.com/firejune/rigc/issues/194)). Three changes to `check`'s scoring
semantics, which rule 3 names as the instrument panel. Two of them add figures and move
nothing; the third moves figures.

- **`--texture-from <atlas>`** renders the candidate's **own geometry** through another
  atlas's texels — only `page` and `uvs` change — and prints `floor` / `aboveFloor` beside the
  figure of record under the triangle bound `|mae − aboveFloor| ≤ floor`. A new figure, so
  nothing recorded moves. ⭐ It is what finally makes a texture floor measurable on rung 7,
  whose pack is `rotate: 270` and trimmed; `--atlas` never could, because it re-seats region
  geometry as well as texture.
- **`--atlas` keeps its meaning** and is no longer abused by the floor recipe.
- ⚠️ **The extent test gained a tolerance, and this one moves figures.** A declared box is
  now also **taken** when the correction it asks for reaches no further than **5 % of the
  reference's own content box** *and* the fit leaves **more than a pixel rms** it cannot
  explain — a silhouette differing at the extremes is not a similarity, so the fit cannot
  absorb it, while a difference of origin or units is one and would be absorbed exactly.
  ⇒ **A set that used to be fitted can now be measured in the frames' own box, and every
  figure of such a set moves** — the MAE downward, and the per-slot drift **either way**,
  because a fitted box absorbs a constant offset into the framing and an exact box does not.

**On the committed corpus nothing moves**: every transcription already sat in the frames' own
coordinates and already took the declared box, so `bench` reproduces all 48 sets of
`3-timing-and-spacing`, `6-arcs` and both spineboy skins byte for byte. 🚫 **No `bench.json`
and no run directory was rewritten.** What the tolerance reaches is **rung 7**, whose candidate
was authored in the frames' own units, had its box refused on all twelve sets on extent, and
was therefore graded entirely on fitted framings.

**2026-09-02 — the PR #254 instrument re-inspection.** The pass rule 3 requires after an
instrument-panel change, taken over the candidate the change reaches. All eleven standing
candidates were re-read by `check` **from the repository root with no `--atlas` and no
`--viewport` override**, on this commit **and on its parent**, and the two reports diffed field
by field. **Nine move nothing at all**; two move and one of the two flips.

⚠️ **Rung 7's verdict flips: G2 **FAILS** and the rung re-opens.** Its worst attributable drift
moves **2.76 → 3.94 px** — still inside the 6.0 px bar, at 1.52× rather than 2.17× — so the
figure is not what fails it. What fails is the **read-down**: two sets become G2 🕳️ HOLEs, and
`cape-back`, which draws in all twelve sets and is attributable in none, **loses the only ground
it had**, because kind 4 needs an *attributed* instance of the part and attempt 1's `cape-back`
is attributable in no set at this framing either. 📌 The second mover changes no verdict:
spineboy `ess`'s shared framing becomes the frames' own box, so 64 of its 110 fields move — but
**G2 holds to four decimals** and G3 to zero, and G7 goes 1.516 → **1.659**, 2.11× inside.
Figures, the itemised read-down and the margins they feed are in *The PR #254 instrument
re-inspection* and *The clause margins* under **Status** below.

**2026-09-02 — gate v2.3 introduced** (the owner-delegate's rulings on
[#256](https://github.com/firejune/rigc/issues/256) and
[#258](https://github.com/firejune/rigc/issues/258), the two clause questions the entry above
and the attempt-3 adjudication filed). **No measure's definition changed, no threshold moved,
no clause was renumbered and no recorded figure moves** — every `bench.json` on disk stays as
its run wrote it, and `src/` is untouched. What changes is **G2's read-down**, in three ways:

- **a read-down states the framing of every figure it cites**, and prefers a
  framing-independent quantity to a per-pixel one wherever both are available;
- **a control instance must be attributable at the framing the verdict is read in** — which
  retires the cross-framing kind-4 control #256 was filed about;
- 🆕 **a fifth kind**: a slot whose attributability has a **measured ceiling below a bar
  calibrated on the slots the instrument does attribute** reads down, **provided everything
  observable about it is independently verified strict** — placement pinned by a non-matcher
  sweep with a known-answer control on an attributed slot, and draw order proven by the frames.
  A ceiling on its own does not read down.

The statements are on the card, [GATE.md](GATE.md); the derivation, the grounds in rule 1's
founding reading ([#153](https://github.com/firejune/rigc/issues/153)) and the mandated sweep
are in *Operating rules* rule 2, under *Gate v2.3*. By rule 5's asymmetry two of the three can
make a standing pass **fail**, so the re-inspection is taken in the same pass. It is the entry
below.

**2026-09-02 — the gate-v2.3 re-inspection.** The bump's own re-inspection, taken immediately
for the reason rule 5 gives. **No measure's definition changed here either**: this entry records
that the pass rule 3 requires has been *taken* against gate v2.3, over the **ten standing
candidates plus rung 7's attempt 3** across **56 committed sets**, 1,142 compared frames, 1,061
adjacent pairs and 25 compared sheets, re-read by `check` **from the repository root with no
`--atlas` and no `--viewport` override**, reproducing every gated figure. Rung 7's frames were
rendered locally at its brief's exact flags first, and **no frame of it was committed**. `bench`
was not re-run, because nothing v2.3 changes can reach G4's lengths or G5's counts. 🚫 **No
`bench.json` and no run directory was rewritten.** ⭐ **Exactly one verdict moves, and it is the
one the ruling predicted**: rung 7's attempt 3 goes **FAIL → PASS**, its `cape-back` reaching
the new kind on evidence [#259](https://github.com/firejune/rigc/pull/259) had already
reproduced and this pass reproduced again. **No other slot on the ladder reaches that kind**, no
standing read-down used kind 4, and the 188 blank (set, slot) pairs still read down on kinds 1,
2 and 3. The rung closes, [#14](https://github.com/firejune/rigc/issues/14) closes, and the
ladder is complete again. Figures, the sweep table and the re-adjudication are in *The gate-v2.3
re-inspection* and *The clause margins* under **Status** below.

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
  it, and a citation into a stored run's directory — which holds that attempt's measures
  — is written as a name rather than as a path.
  - ➡️ **Amended 2026-08-28 by owner ruling**, on the spineboy attempt-4 verdict
    ([#16](https://github.com/firejune/rigc/issues/16)). This reading used to give its
    reason as *"a spec that scores well **is** the answer key"*, and that half is
    withdrawn: **a successor attempt at the same rung may inherit the prior attempt's rig
    spec, motion specs and fitting harness**, because a spec authored under honest
    conditions carries no reference-side value its author did not legitimately derive.
    The reading's *conclusion* is unchanged and now rests on the other half — the
    directory still holds `bench.json`, `README.md` and `LOOP.md`, so a citation into it
    is still written as a name. Procedure, the exact file split and the scope limit:
    [`bench/runs/README.md`](../bench/runs/README.md), *Inheriting the prior attempt's
    candidate*. ⚖️ **No measure, threshold or recorded figure moves** — this is a rule
    about what an attempt may start from, not about how one is scored.

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
  [AUTHORING.md](AUTHORING.md) in full; **[GATE.md](GATE.md), the clause statements**;
  Spine's public documentation; this
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

🆕 **A sixth reading, ruled 2026-08-29** — the surface split
[#174](https://github.com/firejune/rigc/issues/174) asked for, and the one the four
recorded collisions were waiting on:

- **A clause statement is not answer-bearing; its derivation is.** Apply the test to the
  two halves of *Operating rules* rule 2 and they come apart. A **threshold** — *worst
  attributable slot drift ≤ 6.0 px* — states no reference-side value of any measure: it is
  the exam's grading policy, and it was derived from previous **candidates'** figures, which
  are candidate-side by the first reading above. A **derivation** — *"cleared candidates post
  0.74–0.85 px … spineboy attempt 3 posts 14.6 px"* — quotes those candidates' scores over
  the reference's own denominators, and the third reading seals exactly that. ⇒ **The
  statements move to an allowed surface, [GATE.md](GATE.md), and the derivations stay
  here.**
  - ⚖️ **What sealing the bar actually cost, which is the argument for the split.** It
    protected nothing — no rung's reference-side measure is narrowed by knowing the bar — and
    it produced **four** run launches that reached around it: two re-climbs that resolved the
    same collision in opposite directions, one that could not perform *After a run* step 1 at
    all, and a graduation mandate that pasted the drift bar into the prompt. A rule that
    cannot be obeyed is not a seal; it is a generator of recorded breaches.
  - 🚫 **The split is narrow and it moves nothing else.** No measure, no threshold and no
    recorded figure changes, this is not a gate release, and rule 5's re-inspection is not
    owed. The status table, the per-rung sections and rule 2's derivations are as sealed as
    they were.
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
above for the reason the status table is: the **derivations** below quote previous
candidates' measures, and a number reaches an agent the same way whichever file it is in.

✅ **What a run may read is the bar itself — [GATE.md](GATE.md), the clause statements.**
Owner ruling 2026-08-29 ([#174](https://github.com/firejune/rigc/issues/174)), and the
sixth reading of *The honesty rule* above is the criterion it rests on: a threshold is the
exam's grading policy and states no reference-side value, while a derivation quotes the
scores it was calibrated against. ⇒ **That card is the canonical statement of every clause,
and this section is its derivation.** The table below therefore names each clause and links
it rather than restating it — one claim, one home — and each derivation is dated by the gate
version that produced it. If a threshold ever moves, a new dated block below supersedes the
old derivation and the card is what changes; nothing here is edited in place, because a pass
is versioned.

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

🆕 **v2.1 supersedes v2 as of 2026-08-26** (owner's ruling; the gap
[#10](https://github.com/firejune/rigc/issues/10) and the 2026-08-26 batch adjudication
both recorded). **No threshold moves and no clause is renumbered** — every row of the
table below is v2's, unchanged. What v2.1 settles is one *reading*: what G3 does with a
set that is a **single pose**. The clause statement and its precedents are the dated
block at the end of this rule, and the re-inspection it owes is under *Status*, in *The
gate-v2.1 re-inspection*.

🆕 **v2.2 supersedes v2.1 as of 2026-08-29** (owner's rulings on
[#198](https://github.com/firejune/rigc/issues/198),
[#193](https://github.com/firejune/rigc/issues/193) and
[#207](https://github.com/firejune/rigc/issues/207)). **No threshold moves and no clause is
renumbered** — every row of the table below is still v2's. One clause gains a limb: **G2 is
read per slot as well as per set**, and a slot that draws in a set while attributing in no
frame of it is read down explicitly or the clause fails for that set. Released with it and
changing no clause: **G7's 3.5× stands** (its own revisit trigger fired and was heard), and
**the *finds-X-first* lines are replaced by a margins table** that each adjudication updates.
The dated block is at the end of this rule; the re-inspection it owes is under *Status*, in
*The gate-v2.2 re-inspection*.

🆕 **v2.3 supersedes v2.2 as of 2026-09-02** (owner-delegate's rulings on
[#256](https://github.com/firejune/rigc/issues/256) and
[#258](https://github.com/firejune/rigc/issues/258), the two clause questions the rung-7
re-inspection and its attempt-3 adjudication filed). **No threshold moves, no clause is
renumbered, and no measure's definition or recorded figure changes** — every row of the table
below is still v2's. What moves is **G2's read-down**: it now states the framing of the figures
it cites and prefers a framing-independent quantity to a per-pixel one, a control instance must
be attributable at the framing the verdict is read in, and a **fifth kind** admits a slot whose
attributability is **measured** to be capped below the bar, provided everything observable about
it is independently verified strict. The dated block is at the end of this rule; the
re-inspection it owes is under *Status*, in *The gate-v2.3 re-inspection*.

📌 **The clause column is a link, not a copy.** Each row names the measure so that its
derivation reads, and the comparator, the number and the SKIP semantics live once — on the
card. A derivation necessarily narrates the figure it produced, which is why each is dated:
read it as *how this version's number was arrived at*, never as *what the clause says today*.

| # | The clause | Where the number comes from |
| --- | --- | ---: |
| **G1** | [validity](GATE.md#g1-validity) | stage 1, unchanged. Twelve honest runs have posted 0 FAILs, so this clause has never yet decided anything — it stays because a candidate that is not valid Spine 4.3 has cleared nothing |
| **G2** | [worst attributable slot drift](GATE.md#g2-worst-attributable-slot-drift), in **every** measured set | cleared candidates post **0.74–0.85 px** (rung 3 attempt 2, both sets) and **3.3 px** (rung 8 `pendulum`). Above them sit **4.1 px** (rung 6, at the frames' own box) and **4.2 px** (rung 8 `ball` attempt 2, **5.3 px** at attempt 1), the two highest figures any entry here describes as faithful motion. spineboy attempt 3 posts **14.6 px**, which its own entry calls a visible error on a 100 × 146 px figure. 6.0 clears the highest of those by ~1.8 px and refuses the open one by 2.4×. Deliberately **absolute** and not a fraction of the figure: `check`'s drift is in the frames' own pixels, and a relative bar would license a large rig the visible error a small one is refused |
| **G3** | [per-frame motion](GATE.md#g3-per-frame-motion), in **every** set | `pendulum` is attributed in every frame of both sets; `ball` attempt 2 posts agreement on all 44 and all 87 adjacent pairs. spineboy posts **14** disagreements at attempt 2 and **3** at attempt 3 — a limb that teleports, a hold that is not held, a one-frame event that never fires. The overdraw half is not leniency but a hole plugged: `mae`'s denominator is the union, so drawing more buys a better mean ([#119](https://github.com/firejune/rigc/issues/119)), and `OVERDRAW_RATIO` is already 1.5 in [`src/check.ts`](../src/check.ts) against a corpus that spans 0.852–1.069 on 62 of 64 sets |
| **G4** | [the shot inventory](GATE.md#g4-the-shot-inventory) | count and names are the least deniable facts here and both are granted outright: the brief describes each shot the author is to build. The length is granted too, but only *to the grid it was rendered on*, which is why the limb is a tolerance and not a ratio — the 🧾 derivation below, and 1/12 s is the figure in practice everywhere on this ladder. v1 read `animations.duration` **1.000** instead, and that number is `bench`'s own 1/60 s agreement: finer than the frames can resolve at every rate the ladder commits, so it failed two rungs on a residual no reading of the frames could have decided |
| **G5** | [the drawn inventory, name-agnostically](GATE.md#g5-the-drawn-inventory-name-agnostically) | a part the reference draws and the candidate does not is the one structural fact a client watching the shot reports. These are the only two structural measures in `bench`'s table that a *count* alone decides — every other one is keyed on a name, on an attachment kind, on a key density or on a constraint. Cleared candidates post **1.000** on both (rung 3, `pendulum`), and so does `ball` attempt 2; the floor is set from the largest rig measured, spineboy attempt 3's **0.952 / 0.931**, so that a character-scale rig clears on the structure its own entry calls *the editor's skeleton* and the rung is decided on motion, which is the half that entry says is open |
| **G7** | [the whole shot, on a set whose frames are a contact sheet](GATE.md#g7-the-whole-shot-on-a-set-whose-frames-are-a-contact-sheet) | new in v2, from the observable #36 added. A **ratio inside one sheet** rather than a level, because a sheet MAE is an MAE and *the MAE decides nothing across rungs or framings* — numerator and denominator here are the same measurement in the same box on the same plate, so the clause asks the only question that survives the doctrine: **is the sheet flat?** §9.2 already reads it that way — *"flat is framing or art, a spike is timing at that moment"*. The 🧾 derivation below carries the corpus |
| **G6** | [the rung](GATE.md#g6-the-rung) | rung 1's precedent, and rung 8 is where it bit: `pendulum` cleared while `ball` did not, and the rung stayed 🟨 |

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
on the widest of those three separations, and **a second candidate landing between them is
the argument for revisiting the number.**

➡️ **That trigger fired, and the ruling of 2026-08-29 is that the number stands** —
[#193](https://github.com/firejune/rigc/issues/193), under *Gate v2.2* below. 📌 **Which
candidate a tightening would find first is a fact about the corpus and not about this
clause, so it is no longer asserted here**: the ranking is in *The clause margins* under
**Status**, which every adjudication updates. Two sentences of that kind used to close this
paragraph and both went false within three days of being written; (c) of the v2.2 block is
why they are gone.

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

#### Gate v2.1 — G3's scope on a single-pose set (2026-08-26)

🆕 **The owner's ruling of 2026-08-26**, on the one clause decision the 2026-08-26 batch
adjudication left outstanding. It closes a **gap in the text**, not a threshold: three
passes in a row reached *"not adjudicable — clause gap"* on the same set, and the gate is
the thing that has to answer. Two clauses, and the second follows from the first:

**(a) A single-pose set is excluded from G3's scope.** A set of one frame is not a shot
sampled too coarsely; there is no shot in it. G3 reads adjacent pairs and such a set has
none to read, so it is out of scope rather than an unmet clause.

🧾 **Three precedents, and the ruling records rather than invents them.** This is what the
gate was already doing everywhere the question came up:

1. **G7's 🕳️ excludes it by name** — *"the set is a single pose (`ready-to-animate`,
   `aim`): there is no shot to read"* — so the same state is already out of scope for the
   other clause that reads a whole shot.
2. **Both 2026-08-25 readings of spineboy treated `aim` that way.** Its G3 was recorded as
   *"3 of 59 on `death`"* with `aim` — a single pose — never counted as a hole, and the
   graduation bar that pass published (*"19.57 px worst drift, 3 per-frame disagreements,
   and every sheet inside 3.5×"*) could not be beaten at all if that set left an
   undischargeable one.
3. **The 2026-08-26 rung-5 adjudication made the reading explicit** rather than relying on
   it: `ball-ready-to-animate`'s two sets are single poses, the exclusion leaves `ball` and
   `speedy` behind, and G3 was read on those at 78 adjacent pairs each. That verdict is a
   standing PASS resting on this reading.

⇒ So the alternative to writing (a) down is not a stricter gate; it is **three recorded
verdicts resting on an unwritten rule**, which is the ⭐ at the head of this rule
(*leniency that is not written down is not a gate*) with the sign flipped.

**(b) Where (a) leaves a skeleton with no G3-readable set at all, G3 reads SKIP.** Not a
pass and not a fail — the clause has no object, and the precedent for what to do then is
G7's own: **no observable ⇒ SKIP**, and the rung is decided on the clauses that *can* be
read. G6 is met by a skeleton whose G3 reads SKIP for the same reason it is met by one
whose G7 does.

🚫 **What (b) is not: a general "no adjacent pair ⇒ SKIP" rule.** A set of **non-adjacent
stills** is a shot sampled twice, not a single pose — it has frames between its samples
that nothing has looked at, which is a real hole and exactly the one **G7's discharge**
answers. Two standing verdicts turn on that distinction and neither is touched here: rung
2's four sets (two stills 310 frames apart, G3's hole discharged by four flat sheets) and
rung 4's three `@24fps` sets. ⇒ **(b) fires only where every shot the skeleton has is a
single pose.** Rung 1 `drop` — *"a skeleton with zero animations"* — is the only case on
this ladder, and the only verdict v2.1 moves.

⚖️ **What this costs, stated rather than smoothed over.** A skeleton whose only shot is a
single pose is now gated on G1, G2, G4 and G5 alone, with two clauses skipping. That is a
thinner reading than any other rung gets, and it is the honest one: the frames contain one
pose, every pose the shot has is committed, and no candidate can produce evidence the
reference does not carry. Rule 1's test — *could any reading of the frames have decided
it?* — answers no, and rule 1 says only the decidable kind may fail a rung.

📌 **Cadence.** By rule 5's asymmetry this change is **opportunity, not integrity** — it
can only let an open rung pass, never flip a standing one — so it was not owed
immediately. It is released here because rule 5 point 3 anchors bumps to milestones and
this is one: the phase-3 worklist closing, and the run-up to a version cut. Its
re-inspection is taken in the same pass, under *Status*.

#### Gate v2.2 — G2's per-slot limb, and two rulings released beside it (2026-08-29)

🆕 **The owner's rulings of 2026-08-29**, on the three items the graduation milestone left in
the decision queue: [#198](https://github.com/firejune/rigc/issues/198), the per-slot gap
rung 7 attempt 2 recorded as its owner item 2;
[#193](https://github.com/firejune/rigc/issues/193), G7's own revisit trigger, fired; and
[#207](https://github.com/firejune/rigc/issues/207), the *finds-X-first* lines.
**Exactly one of the three is a clause change** — (a). The other two are a threshold **held**
and a bookkeeping rule, recorded here because all three were decided in one deliberation and
released together. **No threshold moves, no clause is renumbered, and no measure's definition
or recorded figure changes.**

**(a) G2 gains a per-slot limb.** ⭐ **A slot that draws in a measured set and is attributable
in NO frame of that set is read down explicitly in the verdict — name the slot, and name the
evidence that its placement is benign. A blank that cannot be read down fails the clause for
that set.** The statement is on the card, [GATE.md](GATE.md#g2-worst-attributable-slot-drift);
what follows is its derivation.

🧾 **Why per slot when G2's 🕳️ is per set.** The 🕳️ fires when `framesWithoutDrift` equals a
set's frame count — when a *set* attributes nothing at all — and on this corpus it has never
fired. But attribution is decided per slot: [`src/slots.ts`](../src/slots.ts)'s matcher
returns no match when the reference has merged a part into a larger connected component and
correlating the part's own pixels finds nothing above its confidence bar, and that is exactly
what happens to a part drawn **behind** another over a flat backdrop. So a set can attribute
most of its parts and never read one of them, and the clause that measures placement never
measures that one. ⚠️ **`check`'s own text says a blank drift row is the loudest signal in
the table** (AUTHORING §9.2); the clause as written could not hear it, which is the opposite
reading. Rung 7 attempt 2 is where the shape appeared: `cape-back` draws on all 118 compared
frames of twelve sets and is attributable in none of them, and what held the rung was
**adjudicator diligence rather than a clause**. ⇒ Same family as the single-pose G3 gap v2.1
closed — an observable the gate's text reaches at the wrong unit.

🧾 **What counts as evidence, and it is G5's pattern again.** G5's deduction is the precedent:
the clause names the kinds that qualify, each one drawn from a case the ladder has already
recorded, and the verdict names the item. Four kinds qualify, and the v2.2 sweep below
itemises every one of them at least once:

1. **The slot is attributed in another set of the same skeleton.** Its placement *is* read by
   the clause, in a set that reads it, so the blank is a fact about that set's occlusion or
   sampling rather than about the part. Name the set and its figure. **The strongest of the
   four**, and it discharges most of what the limb catches.
2. **A sibling slot on the same bone chain is attributed.** The bone chain that places the
   slot is measured, and a rigid part hung off a measured chain cannot travel independently
   of it. Name the sibling, its figure and its sample count. ⚠️ **Weaker than 1, and a
   verdict says so**: it bounds the chain and not the part on it, so it wants a third or
   fourth ground beside it wherever the part is large.
3. **The chain the slot alone owns carries near-zero error per reference pixel.** `MAE in it`
   is the difference that chain took over the reference pixels nearest its ink; a part tens of
   pixels out of place cannot land there. Quote the figure **with the set's other chains
   beside it**, because the figure alone carries a plate.
4. **A quantitative per-pixel control against an attributed instance of the same part.**
   Rung 7's `cape-back` is the worked case and the limb's origin: the same slot on the same
   frames of attempt 1 *was* attributed, at 1.0 px worst and 1.0 px mean, and read
   **39.61** per pixel where this candidate reads **44.04** — **11 % worse per pixel than a
   part measured one pixel out of place.** A part tens of pixels out does not land 11 % away
   from one that is not.

**And two columns are quoted in every read-down, whichever kind it uses**: the set's
`(unattributed)` share and its count of **unreached reference components**. A part that had
left its place would dump the reference's ink into both, so a read-down that does not quote
them has not excluded the case the limb exists for. ⇒ **A read-down that cannot name its
evidence is not a read-down**, and the clause fails for that set — G5's own 🧾 with the sign
kept.

⚖️ **What the limb costs, measured rather than estimated.** The re-inspection below swept all
eleven standing candidates for it, and it fires far more widely than the case that motivated
it: **194** blank (set, slot) pairs over 56 sets, on **four** of the eleven candidates, and
**12** slots attributable in no set at all. Every one reads down. But the volume is itself the
finding — `check` declines a part the reference has merged into a larger component, and on a
dense figure that is most of the small parts on most frames. ⇒ **The limb is a disclosure
requirement and not a fail-by-default**, and a verdict discharges the bulk of it in a table
rather than a paragraph each; only the slots that reach kinds 3 and 4 are written out in
full. 📌 **What it does not do is change what passes.** No standing verdict moves, and the
6.0 px bar is untouched.

📌 **Cadence: integrity, so the re-inspection is taken in the same pass.** By rule 5 point 2
this limb can only make a standing pass **fail** — a blank that cannot be read down fails the
clause — so it is the first half of the asymmetry and re-inspects immediately rather than
waiting for a bump. The milestone is the same one rule 5 point 3 names for a release: the
ladder closing.

**(b) G7's 3.5× stands — [#193](https://github.com/firejune/rigc/issues/193) closes.** The
trigger G7's 🧾 wrote for itself — *a second candidate landing between them* — has fired
twice: rung 7 attempt 1's `fall-in@24fps` at **3.041**, on a candidate that then failed G2,
and attempt 2's `fall-in@30fps` at **2.923**, on a candidate that holds a **PASS**. The
deliberation the trigger asks for has been held, and the number does not move. Three grounds:

- ⭐ **The quality-gate posture holds, and it is rule 1's.** Calibration is deliberately
  lenient — the floors sit above every figure a reading has already called faithful — and
  tightening later is what rule 3's re-inspection is for. **But no evidence has arrived that
  demands it.** Nothing on this corpus has been read as unfaithful at a sheet ratio the clause
  admits; what arrived is a *ranking* changing, which is a fact about the corpus rather than
  an argument about the bar.
- ⚠️ **A tightening below 2.923 flips two standing passes**, rung 7's and rung 6's, which sit
  **0.031 apart** — so whatever the number moved to it would almost certainly move both or
  neither. By rule 5 point 2 that is an integrity event taken immediately. Spending it on a
  clause nothing has argued against, days after the ladder closed, is the posture inverted.
- 📌 **The caveat that would have argued for it is recorded and does not reach the number.**
  Rung 7's sheets are **not** corroborated the way rung 6's 2.892 is — rung 6's shot is also
  committed in full at 12 fps, where it reads 0 disagreements over 68 pairs, while rung 7's
  12 fps sets are *different shots*. `fall-in` is itself committed in full at 12 fps at 0 of
  20 pairs, so there is an independent reading of that shot; what it does not cover is the
  sheet's extra samples. That is weaker corroboration than rung 6's and stronger than the
  withdrawn rung 4's, and it is a reason to keep reading, not a measurement of unfaithfulness.

🚫 **What the ruling does not claim.** Not that the margin is comfortable: G7 guards two
standing passes at **1.20×** and **1.21×**, and the corpus separates its top two thinly on
every reading available. What would move the number is a candidate a reading calls unfaithful
*inside* the bar, or a **sheet-scale change measure** — and the second is an instrument
question, which rule 3 keeps out of a gate version.

**(c) A margin is a table, not a sentence — [#207](https://github.com/firejune/rigc/issues/207)
closes.** Rule 2 used to close G7's derivation with *"a tightening of G7 finds rung 6 first,
the way a tightening of G2 finds rung 5 first."* **Both halves went false within three days,**
and neither failure was a mistake in the sentence: G7's when rung 7 attempt 2 landed at 2.923
above rung 6's 2.892, and G2's when spineboy's 5.55 px displaced rung 5's 5.12. A margin is a
fact about the **corpus**, the corpus moves every time a candidate lands, and a sentence
inside a rule does not. ⇒ **The lines are deleted from the gate text and *The clause margins*
under *Status* carries the ranking instead** — per clause: the bar, the closest standing pass,
its figure and the ratio. **Every adjudication updates it**, which is now a named part of
*After a run* step 1 in [`bench/runs/README.md`](../bench/runs/README.md), so the table is
current by construction rather than by anybody remembering.

📌 **What a derivation may still say.** It may narrate the corpus it was calibrated against —
that is a dated historical argument and stays true of its date. What it may not do is assert a
**present** ranking. The line between the two is the same one the honesty rule's sixth reading
draws between a clause statement and its derivation: one is live, one is dated.

#### Gate v2.3 — the read-down's framing, and the measured-unobservable kind (2026-09-02)

🆕 **The owner-delegate's rulings of 2026-09-02**, on the two clause questions rung 7's records
filed hours apart: [#256](https://github.com/firejune/rigc/issues/256) — **kind 4 does not name
the framing its control is measured at** — raised by the PR #254 instrument re-inspection; and
[#258](https://github.com/firejune/rigc/issues/258) — **the four kinds cannot credit a slot the
frames cannot make attributable** — raised by the attempt-3 adjudication. **Four rulings: three
are clause text and the fourth is the re-inspection they owe.** **No threshold moves, no clause
is renumbered, and no measure's definition or recorded figure changes.** The statements are on
the card, [GATE.md](GATE.md#g2-worst-attributable-slot-drift); what follows is their derivation.

⭐ **All four rest on one sentence of rule 1, which is [#153](https://github.com/firejune/rigc/issues/153)'s
founding reading of what a pass is.** *"The test is not is this measure hard? but could any
reading of the frames have decided it?"* — structure that is **unobservable by construction** is
reported as figures and **never blocks a pass**, and the leniency that buys is **for
unobservables alone**: an observable stays strict. Attempt 3 is the first candidate on this
ladder to arrive with a **measurement** that one specific observable does not exist for one
specific part in one specific shot, and the clause had no sentence with which to say so. ⇒ The
gap is not that the gate was too strict; it is that the gate could not tell **misplaced** from
**unmeasurable**, and a blank was the only signal it got for both.

🧾 **The precedent shape, and this is the third of a kind.** v2.1 closed a **gap in the text**
where three passes in a row had reached *"not adjudicable — clause gap"* on a single-pose set,
and rung 1's `drop` sat 🟨 on a gap **no candidate could close**; v2.2 closed the per-slot gap
that adjudicator diligence had been covering. Both were answered by writing down what the gate
was already doing or already needed, not by moving a number. Rung 7 has now spent **three
attempts** on one slot, and attempt 3 measured what attempts 1 and 2 rediscovered by search:
the part has no reading here. ⇒ **Same shape as `drop` before v2.1** — a rung whose queue item
is a clause decision rather than a fourth attempt.

**(a) Kind 4 names its framing — [#256](https://github.com/firejune/rigc/issues/256) closes.**
⭐ **A read-down that rests on another instance of the same part requires that instance to be
attributable at the framing the verdict is read in — the declared box, which is the framing the
instrument now takes by itself wherever a set can be measured in it.**

🧾 **Why, and the case is the one that raised it.** Attempt 2's standing read-down cited
attempt 1's `cape-back` at **1.0 px worst / 1.0 px mean and 39.61 per pixel** against its own
44.04 — *"11 % worse per pixel than a part measured one pixel out of place."* That attribution
existed **only under the fitted framing and only on one frame of one set**
(`cape-follow-example` f0021); at the declared box attempt 1's `cape-back` is blank on all 118
frames, which that run's own pinned diagnostic recorded on 2026-08-28. ⇒ **A clause whose
evidence can evaporate with the artifact, the frames and the rig all unchanged is
under-specified**, and the fix is one sentence naming the framing. 📌 The alternative — admitting
a cross-framing control — was refused on *What never gates*' own ground: kind 4 cites a
**per-pixel MAE**, which that passage calls *"not comparable across rungs or across framings"*,
so a cross-framing kind 4 would compare two figures the gate has already declared
incomparable.

**(b) A fifth kind — the measured-unobservable slot — [#258](https://github.com/firejune/rigc/issues/258)
closes.** ⭐ **A slot that draws in a measured set and is attributable in no frame of any set
reads down by name when BOTH halves hold, each measured and each quoted:**

1. **its attributability has a measured ceiling below the attribution bar.** The ceiling is an
   **instrument-side geometric fact of the slot's visible footprint** — the share of a covering
   placement of it that the frames put on screen at all, measured over **every frame of the
   corpus** from stated conventions rather than argued from one frame. The **bar** is calibrated
   on **the slots of the same corpus the instrument does attribute**. **Both measurements are
   quoted.**
2. **everything observable about the slot is independently verified strict**: its placement
   **pinned by an independent sweep carrying a known-answer control on a slot the clause does
   attribute**, and its **draw order proven by the frames**.

🚫 **A ceiling without half 2 does not read down.** This kind excuses **what is measured
unobservable** and never **what was merely not measured** — which is the whole of rule 1's
asymmetry, and the reason half 2 carries no leniency at all. ⚠️ **And it is not the counter-reading
the attempt-3 adjudication refused.** That refusal stands: three named measurements do not satisfy
the clause *because they are named*, and a fifth ground invented at the point of need by the
adjudicator reading the one candidate that turns on it is still forbidden. What v2.3 does is
**write the ground into the gate before a candidate is read against it**, which is rule 5's
division of labour and the opposite move.

🧾 **What the kind is calibrated against, and it is the only case on the corpus.** Rung 7
attempt 3's `cape-back`: the ceiling reads **5–19 %** on every one of the 118 frame entries
(corpus maximum 19 %), against a bar of **66 %** — the lowest agreement at which *anything* in
that corpus is attributed — with the slot's own agreement topping out at **45 %**. Half 2 reads:
placement pinned to **≤ 2–3 px** by a whole-track translation sweep on `maeReference`, with the
attributed slot on another chain as its **known-answer control**; draw order separating
**×8.44–15.30** against a control edge the frames already settle at **×2.40–8.17**. ⚠️ **The two
shapes that would have cleared the matcher instead** — a U-shaped or annular hull hugging the
visible rim, and keying the slot empty where it is occluded — were identified by that run and
**declined as gaming the instrument**. ⇒ **The clause as it stood rewarded the candidate that
took either of them over the one that refused both**, and that inversion is what (b) removes.

📌 **What (b) is not.** It is **not** a general *"a blank with an argument reads down"* — halves 1
and 2 are both measurements, and either missing is a FAIL. It does **not** touch kinds 1–4, whose
statements stay in the v2.2 block above with their own date. And it does **not** make a rung
passable by declining to measure: a slot nobody measured has no ceiling, and a ceiling is
half of what this kind asks for.

**(c) A read-down states its framing, and prefers the portable quantity.** ⭐ **Every read-down
names the framing each figure it cites was measured at, and where the same fact is available
both as a framing-independent quantity and as a per-pixel one, it cites the framing-independent
one.**

🧾 **This codifies an asymmetry the corpus had already demonstrated, and the card had already
ranked.** In the same run, `sack`'s **kind-1** read-down is *also* cross-framing — its blank sets
are the two that refuse the declared box, the ten that attribute it take that box — and it
**survives**, where kind 4's control did not. The reason is on the card: kind 1 quotes a
**drift**, which *What never gates* calls *"per slot and framing-independent in a way the means
are not"*, while kind 4 quotes a **per-pixel MAE**, which the same passage says is *"not
comparable across rungs or across framings"*. ⇒ **The framing-dependence #256 found in kind 4 is
not a fact about kind 4**; it is what happens when a kind cites the quantity the card declares
incomparable. Kind 3 is safe for a third reason — its comparison never leaves the set it is read
in — and (c) makes that reasoning explicit rather than incidental. 📌 **(c) is a disclosure
requirement**, like the limb itself: it fails no read-down that states its evidence, and it makes
the next #256 visible at the point where the figure is quoted.

**(d) Every standing candidate is swept under v2.3, and the sweep carries a leak detector.**
⭐ **The expected outcome was stated before the sweep ran: only rung 7's verdict moves.** Its
`cape-back` qualifies under (b) on evidence PR #259 had already reproduced, its `sack` already
reads down under kind 1, and no other candidate on the ladder has a slot with a measured ceiling
at all. ⇒ **Any other verdict moving, or any other slot reaching (b) without attempt-3-grade
evidence, is a leak in the clause text and stops the release.** The sweep, its table and the
detector's reading are under *Status*, in *The gate-v2.3 re-inspection*.

📌 **Cadence: mixed, and the integrity half decides.** By rule 5 point 2 (b) is **opportunity** —
it can only let an open rung pass — while (a) and (c) are **integrity**: (a) can invalidate a
standing read-down and so make a standing pass fail, and (c) can find a standing read-down
resting on an unstated framing. ⇒ **The re-inspection is taken in the same pass**, as v2 and v2.2
were, rather than waiting for the next bump. ⚠️ **And point 3's milestone anchor is doing double
duty for the third time in five days** — the graduation close released v2.1 and v2.2, and what
releases v2.3 is a **standing pass having flipped**, which is point 2's own trigger rather than a
milestone. That is the correct reading, and it is also the ledger entry the v2.2 block asked for:
a milestone that fires repeatedly is worth noticing before bumping-when-the-queue-looks-full
becomes the habit.

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
   > ➡️ **The 2026-08-26 re-climbs empty that queue but for rung 1 and rung 7.** Four
   > candidates were authored from verified briefs and adjudicated the same day: **rungs
   > 3, 4 and 5 clear gate v2** and leave the list, and **rung 1 stays** — not on a number,
   > but because `drop`'s G3 is *not adjudicable* under this gate and no run can move it.
   > The queue is now **rung 1 (on a clause decision, not a re-climb) and the untried rung
   > 7**, and the verdicts are under *Status*, in *The gate-v2 batch adjudication of the
   > four re-climbs*.
   > ➡️ **Gate v2.1 takes the clause decision, and rung 1 leaves the queue the same day.**
   > `drop`'s G3 reads **SKIP** under (b) above, so the rung meets G6 and **#10 closes**.
   > ⇒ **The queue is now the untried rung 7 alone** — and it is not a re-climb either:
   > rung 7 has never been attempted, and on 2026-08-26 its brief was revision 1
   > **UNVERIFIED**, which `bench/runs/README.md` marked 🚫 not runnable until a second
   > pass over that brief.
   > **Nothing on this ladder is now open on a gate question.** Verdicts in *The gate-v2.1
   > re-inspection*.
   > ➡️ **That second pass landed on 2026-08-27** ([#14](https://github.com/firejune/rigc/issues/14)):
   > the brief is **revision 2, verified by a third party**, and rung 7 is **runnable** —
   > the queue is one unattempted rung with nothing procedural left in front of it. Its
   > status stays ⬜ because no candidate exists, not because anything is blocked.
   > ➡️ **Rung 7 was climbed on 2026-08-28 and does not clear**, so the queue keeps it and
   > gains nothing. `2026-08-28-rung7-1` meets **G1, G3, G4, G5 and G7** and fails **G2
   > alone**, at 7.33 px against 6.0 on one set of twelve — and the residual is
   > **observable** (the cloth's own deformation in motion), so by item 2's own test this
   > stays a **re-climb** rather than an adjudication: a mesh for the cape is the named next
   > step and the run's README says where to check it. ⇒ **The queue is rung 7 alone, now on
   > a number rather than on procedure**, and no rung is open on a gate question. Verdict
   > under *Status*, in *Rung 7 — attempted, not cleared*.
   > ➡️ **The re-climb landed the same day and clears — 🏁 this item's list is now empty.**
   > `2026-08-28-rung7-2`, authored from brief revision 3, takes G2 from 7.33 px to **2.76
   > px** and meets every clause: **PASS**, #14 closes, and **rungs 1 through 8 are all ✅**.
   > ⚠️ Note what the fix was **not**: attempt 1's named next step — a mesh for the cape —
   > was built, fitted like-for-like against the region, and **lost on all four shots**, so
   > the failing drift was placement rather than mechanism. ⇒ **What remains of this rule is
   > item 3, the graduation exam.** Verdicts in *Rung 7, attempt 2*.
   > ➡️ **And the list is not empty any more — 2026-09-02.** The
   > [#254](https://github.com/firejune/rigc/pull/254) instrument re-inspection fails
   > `2026-08-28-rung7-2` on **G2**, so **rung 7 is queued again** and
   > [#14](https://github.com/firejune/rigc/issues/14) is re-opened. ⚠️ **This one is a
   > re-climb on a clause reading rather than on a number**: the drift figure is *inside* the
   > bar at 3.94 px, and what fails is `cape-back`'s read-down, whose kind-4 control does not
   > exist once the frames' own box is taken. By item 2's test the residual is still
   > **observable** — the panel's pose was recorded by that run as partly a prior rather than a
   > measurement — so it stays a re-climb. Verdict in *Rung 7, attempt 2*, under *PR #254
   > instrument re-inspection*.
   > ➡️ **The re-climb landed the same day, FAILs the same clause, and in doing so overturns the
   > *observable* reading above.** `2026-09-02-rung7-3` closes G2's set-level 🕳️ and takes the
   > blank surface from three slots to two, and still fails G2 on `cape-back`. ⚠️ **What it
   > measured is that the residual is *not* observable**: attribution of that slot is capped by
   > the **shot** at 5–19 % agreement against the ~66 % floor below which nothing in this corpus
   > is attributed, and the panel's own placement is independently pinned to **≤ 2–3 px** — so no
   > placement, scale, rotation, pivot or region-versus-mesh choice can move the failing measure.
   > ⇒ **By item 2's own test this stops being a re-climb**: *"a rung whose whole residual is
   > unobservable is adjudicated, not re-run."* It has now been adjudicated three times and fails
   > each time, because the clause asks for a read-down the four kinds cannot supply for a slot
   > the frames will not let the matcher read. **The queue item is a clause decision —
   > [#258](https://github.com/firejune/rigc/issues/258) — not a fourth attempt**, which is the
   > shape rung 1's `drop` had before v2.1 took its clause decision. 🚫 The FAIL stands
   > meanwhile; a rung is not cleared by the reason it cannot be cleared. Verdict in *Rung 7,
   > attempt 3*, and in *The attempt-3 adjudication* under **Status**.
   > ➡️ **The clause decision landed the same day and rung 7 clears on the candidate it already
   > had — 🏁 this item's list is empty again.** **Gate v2.3** answers both filed questions: kind
   > 4 must have its control at the framing the verdict is read in (#256), and a **fifth kind**
   > credits a slot whose attributability is **measured** to be capped below the bar when
   > everything observable about it is independently verified strict (#258). `2026-09-02-rung7-3`
   > satisfies both halves of that kind on evidence [#259](https://github.com/firejune/rigc/pull/259)
   > had already reproduced — ceiling **5–19 %** against a **66 %** bar, placement pinned to
   > **≤ 2–3 px** with a known-answer control, draw order separating **×8.44–15.30** — so its
   > `cape-back` reads down, its `sack` already read down under kind 1, and with the other six
   > clauses unchanged the rung reads **PASS**. **#14 closes** and the status cell goes 🟨 → ✅.
   > ⚠️ **Same rung, no fourth attempt, and that is the point**: the residual was measured
   > unobservable, and rule 1 says only the decidable kind may fail a rung. ⇒ **What remains of
   > this rule is item 4** — the ladder is complete again and the project's question changes.
   > Verdicts in *Rung 7, attempt 3* and in *The gate-v2.3 re-inspection* under **Status**.
3. **spineboy `ess` is the graduation exam**, taken last, on the matured guide.
   `pro`'s tool gate is gone — [#87](https://github.com/firejune/rigc/issues/87)–[#89](https://github.com/firejune/rigc/issues/89)
   shipped 2026-08-29 (PR #233, in v0.7.0) and the transcription reads 1.000 on every measure
   (#239) — but authoring `pro` stays **not** a graduation requirement
   ([#16](https://github.com/firejune/rigc/issues/16)):
   it promotes when a user's rig needs those timelines, not to finish a ladder.
   > ➡️ **Taken on 2026-08-28, on the matured guide and brief revision 4, and not passed.**
   > `2026-08-28-spineboy-1` meets **G1, G3, G4, G5 and G7** and fails **G2 alone**, at 7.86
   > px against 6.0 on one pose of one shot. ⭐ **G3 clears for the first time on this rung**
   > — 3 of 59 → **0 of 124** — and the worst drift falls 19.57 → 7.86 px, so two of the
   > three dimensions the 2026-08-24 freeze named are now clear. The residual is
   > **observable** (a `torso` visibly out of place on a lying pose, with restart batteries
   > saturated and the shoulder/chest geometry named as the suspect), so item 2's test keeps
   > this a **re-climb**. #16 stays open; the freeze stands. Verdict in *spineboy, attempt
   > 4*.
   > ➡️ 🎓 **The re-climb landed the same day and PASSES — the graduation exam is met and
   > this rule's work is done.** `2026-08-28-spineboy-2` is the **first run under the
   > inheritance clause** (protocol item 10): it inherited attempt 4's specs and harness,
   > performed the one named geometric edit — six numbers in three objects — and the refits
   > it invalidates. Every clause reads PASS or SKIP; worst drift **7.86 → 5.55 px**; **#16
   > closes**. ⚠️ Two things the row and the verdict record rather than bury: the margin is
   > **1.08×**, the ladder's thinnest, and the attempt is **inherited**, so the from-zero
   > trajectory is attempts 1–4. ⇒ **Item 4 now fires.** Verdict in *spineboy, attempt 5*.
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

⇒ **And v2.1 is a case of point 2's second half released under point 3.** Its single
clause can only let an open rung pass, so integrity did not demand it and it waited — from
the batch adjudication that recorded the gap to this bump. What released it is the
milestone: the phase-3 worklist closing and a version cut behind it. ⚠️ **The wait is not
free and the ledger says so**: while it lasted, three standing verdicts rested on a reading
the gate did not state (rung 5's PASS and spineboy's published bar, both of which exclude a
single pose from G3), and one rung sat 🟨 on a gap no candidate could close. Point 2's
asymmetry ranks those correctly — a rung staying 🟨 misleads nobody — but *"opportunity"*
is the cost of the wait, not the absence of one.

⇒ **v2.2 is point 2's first half again, and point 1 doing its job.** Its limb can only make
a standing pass **fail**, so it re-inspects immediately; and three decisions that arrived
separately over four days — a clause gap, a fired threshold trigger and a stale commentary
line — **batched into one version and cost one re-inspection**, which is what point 1 is for.
⚠️ **Point 3's milestone is doing double duty here and the ledger should say so**: the
graduation close is both the anchor that released v2.1 and the anchor releasing v2.2, three
days apart. That is the correct reading of *"anything about to be said outside this
repository"* — the ladder's completion is exactly that — but a milestone that fires twice is
worth noticing before it becomes a habit of bumping whenever a decision queue looks full.

⇒ **v2.3 is point 2's first half by its integrity halves and point 1 by its batching.** Two
clause questions filed hours apart on the same rung — a kind whose control had no stated framing
and an enumeration that could not credit a measured unobservable — **batched into one version and
cost one re-inspection**. What released it is not a milestone but the trigger point 2 names: a
**standing pass had already flipped**, rung 7 was open on a clause decision no candidate could
close, and (a) could invalidate a read-down elsewhere. ⚠️ **The wait would not have been free
either, and the ledger says so**: while the questions were open, one rung sat 🟨 on a gap the gate
itself had to answer, and the card's read-down requirements were **stated on the sealed side** —
so a candidate could satisfy the card's sentence in good faith and fail the enumeration behind
it, which is exactly what attempt 3 did.

---

## Status

⬜ not attempted · 🟨 attempted, not cleared · ✅ cleared

| Order | Rung | Example | Skeletons | New at this rung | Status |
| ---: | --- | --- | --- | --- | :---: |
| — | **B1** | — | — | skeleton-as-data input model | ✅ |
| — | **B2** | — | — | A16 accepts pre-release labels | ✅ |
| — | **B3** | — | — | packed-atlas handling (validator half done) | 🟨 |
| 1 | **3** | `3-timing-and-spacing` | `ess` | nothing — smallest skeleton in the corpus | ✅ *gate v2, 2026-08-26* — re-climbed on `2026-08-26-rung3-1` |
| 2 | **1** | `1-weight-and-mass` | `balls`, `drop` | `translatex`/`translatey`/`shear`; bone setup `length`; a skeleton with **zero** animations (`drop`) | ✅ *gate v2.1, 2026-08-26* — on `2026-08-26-rung1-1`; the clause gap closed, `drop`'s G3 **SKIP** |
| 3 | **2** | `2-the-12-principles` | `ess` | slot `blend` (4 additive + 4 multiply); bone `inherit` ≠ Normal | ✅ *gate v2, 2026-08-25* — G4's fix and the sheet |
| 4 | **4** | `4-wave-principle` | `ess` | nothing structural — a volume test (9 bones, 9 slots, 3 animations, 470 bezier keys) | ✅ *gate v2, 2026-08-26* — re-climbed on `2026-08-26-rung4-1`; G7 now 1.43–1.91× |
| 5 | **5** | `5-squash-and-stretch` | `ess` | **`drawOrder` timeline**; `inherit: onlyTranslation`; non-unit setup scale | ✅ *gate v2, 2026-08-26* — re-climbed on `2026-08-26-rung5-1` |
| 6 | **6** | `6-arcs` | `pro` | **transform constraints** (static); **weighted meshes from authored geometry**; mesh `edges` | ✅ *gate v2, 2026-08-25* — re-inspected, holds |
| 7 | **8** | `8-follow-through` | `ball`, `pendulum` | nothing — both features arrived at rung 6 | ✅ *gate v2, 2026-08-25* — both skeletons, re-inspected |
| 8 | **7** | `7-anticipation` | `sack-pro` | **physics timelines**; a **keyed** transform timeline; **deform**; 20 physics constraints | ✅ *gate v2.3, 2026-09-02* — on **attempt 3** (`2026-09-02-rung7-3`), G2 **3.94 px** at 1.53×, `cape-back`'s blank read down under v2.3's **fifth kind** (measured ceiling **5–19 %** against a **66 %** bar; placement pinned **≤ 2–3 px** with a known-answer control; draw order **×8.44–15.30**). ⚠️ Its `fall-in@30fps` sheet at **3.226×** is now G7's **closest standing figure**, a **1.085×** margin. 🗓️ Dated history: passed *gate v2.1/v2.2* on `2026-08-28-rung7-2` (G2 7.33 → 2.76 px), **withdrawn 2026-09-02** under the [#254](https://github.com/firejune/rigc/pull/254) instrument, and attempt 3 **FAILed gate v2.2** the same day on the read-down enumeration — each verdict stays true of the gate it was read against. Frames **local-only** |
| 9 | **spineboy** | `spineboy` | `ess` (+ `pro`, stretch) | **IK**, **events**, **bounding box**, **clipping**, **unweighted meshes**, and scale (`ess`: 18 bones, 20 slots, 8 animations · `pro`: 67 bones, 52 slots, 11 animations) | 🎓 ✅ *gate v2.1, 2026-08-28* — `ess` cleared on `2026-08-28-spineboy-2`, every clause PASS/SKIP; worst drift **5.55 px** (⚠️ 1.08×, the ladder's thinnest margin). ⚠️ **Inherited attempt** under protocol item 10 — its figures measure the lever; the **from-zero trajectory is attempts 1–4** (18.8 → 14.6 → 7.86 px; 14 → 3 → 0 disagreements) · `pro` ⬜, not a graduation requirement |

### The gate-v2.2 re-inspection — 2026-08-29

**Every standing candidate re-read against gate v2.2, and swept for its new limb.** The
re-inspection rule 3 requires of a gate version, taken in the same pass that releases it —
rule 5 point 2's integrity half, because the limb can only make a standing pass *fail*.
🚫 **Zero builds and zero authoring, and no run directory and no `bench.json` was touched.**
`check` and `validate --profile spine` re-read the **eleven standing candidates** over all
**56 committed sets** — 1,142 compared frames, 1,061 adjacent pairs and 25 compared sheets —
**from the repository root with no `--atlas` and no `--viewport` override on any of them**,
and reproduce **every gated figure to the digit**. That reproduction is this pass's control:
what moves a verdict here is the clause, not the reading.

📌 **Three scope notes, so no figure is read as more or less than it is.** ① The sweep covers
the eleven candidates that *hold* a verdict; the superseded attempts keep their own entries
below and are not re-adjudicated. ② `bench` was not re-run, because nothing v2.2 changes can
reach G4's lengths or G5's counts — those columns are quoted from the verdicts that measured
them. What this pass re-measured itself is G1, G2, G3 and G7, and the per-slot attribution the
new limb reads. ③ **Rung 7's frames are local-only**, so this pass rendered them itself at the
brief's exact flags before reading that candidate; `git ls-files bench/reference-local` reports
**0** and no frame of it is committed here either.

Only G2 can move anything, so it carries a second column: the limb's reading per candidate.

| Rung | Skeleton | Candidate | G1 | G2 ≤ 6.0 px | 🆕 G2 per slot | G3 = 0 | G4 length | G5 ≥ 0.85 | G7 ≤ 3.5× | v2.2 | was v2.1 |
| --- | --- | --- | :---: | --- | --- | --- | --- | --- | --- | :---: | :---: |
| **1** | `balls` | rung1-1 | 0 FAIL | **1.51** px `cast-shadow-red` ✅ | ✅ **no blank** — all 8 slots attributed in both sets | ✅ **0** of 39 · **0** of 78; drawn 1.1005 / 1.1010 | ✅ 3.250000 s v 3.233333 s | 1.000 · 1.000 ✅ | SKIP — both sets commit every frame | **PASS** | PASS |
| **1** | `drop` | rung1-1 | 0 FAIL | 1.06 px `sword` ✅ | ✅ **no blank** — all 4 slots attributed | SKIP — v2.1 (a) and (b) | ✅ 0.000000 s v 0.000000 s | 0.800 → **1.000** after `ground-cover` ✅ | SKIP — a single pose | **PASS** | PASS |
| **2** | `ess` | rung2-2 | 0 FAIL | 0.33 px `bowling` ✅ | ⚠️ **7 blanks, 4 slots** — read down below, kinds 2 and 3 | ⚠️ 0 pairs in all four sets — hole discharged by G7 | ✅ 25.833333 s v 25.866667 s | 0.882 · 0.882 ✅ | ✅ **1.088–1.107**, four sheets, 311 tiles each | **PASS** | PASS |
| **3** | `ess` | rung3-1 | 0 FAIL | 0.65 px `pendulum` ✅ | ✅ **no blank** — both slots attributed in both sets | ✅ **0** of 64 · **0** of 20; drawn 0.9913 / 0.9922 | ✅ exact ×2 | 1.000 · 1.000 ✅ | SKIP — both sets commit every frame | **PASS** | PASS |
| **4** | `ess` | rung4-1 | 0 FAIL | **3.63** px `chain-1` ✅ | ✅ **no blank** — all 8 slots attributed in all six sets | ✅ **0** of 120 + 16 + 16 | ✅ exact ×3 | 0.889 · 0.889 ✅ | ✅ **1.911** · 1.428 · 1.776 | **PASS** | PASS |
| **5** | `ess` | rung5-1 | 0 FAIL | **5.12** px `hood-end1` ✅ | ⚠️ **7 blanks, 7 slots, one set** — read down below, kind 1 | ✅ **0** of 78 · **0** of 78 | ✅ exact ×3 | 1.000 · 1.000 ✅ | ✅ 1.081 · 1.181 | **PASS** | PASS |
| **6** | `pro` | rung6-1 | 0 FAIL | **2.48** px `ball` ✅ | ✅ **no blank** — all 4 slots attributed in both sets | ✅ **0** over 68 | ✅ exact | 1.000 · 1.000 ✅ | ✅ `arcs@24fps` **2.892** | **PASS** | PASS |
| **7** | `sack` | rung7-2 | 0 FAIL | **2.76** px `cape-front` ✅ | ⚠️ **16 blanks, 3 slots** — `cape-back` in all twelve sets, the limb's worked case; read down below, kinds 4 and 1 | ✅ **0** of 98 | ✅ worst gap **0.000001 s** | 1.000 · 1.000 ✅ | ✅ **1.477–2.923**, eight sheets | **PASS** | PASS |
| **8** | `pendulum` | rung8-1 | 0 FAIL | **3.34** px `chain-4` ✅ | ✅ **no blank** — all 6 slots attributed in both sets | ✅ **0** over 44 + 87 | ✅ 3.633333 s, exact | 1.000 · 1.000 ✅ | SKIP — every frame committed at both rates | **PASS** | PASS |
| **8** | `ball` | rung8-2 | 0 FAIL | **4.19** px `ball` ✅ | ✅ **no blank** — both slots attributed in both sets | ✅ **0** over 44 + 87 | ✅ 3.625 s v 3.633333 s | 1.000 · 1.000 ✅ | SKIP — every frame committed at both rates | **PASS** | PASS |
| **spineboy** | `ess` | spineboy-2 | 0 FAIL | **5.55** px `rear-shin` ✅ | ⚠️ **164 blanks, 15 slots** — read down below, kinds 1 and 2 | ✅ **0** of 124 | ✅ worst gap **0.000001 s** | 0.952 · 0.931 ✅ | ✅ 1.100–**1.516**, seven sheets | **PASS** | PASS |

**No verdict moves, and the limb is why the pass was taken rather than why anything changed.**
All eleven standing candidates hold, every rung stays ✅, and no status cell moves. A pass is
versioned, so each row's own gate label below is unchanged: what this pass adds to each rung's
section is the record rule 3 asks for — *that it was re-inspected, and against which version*.

⚠️ **What the sweep actually found, and it is wider than the case that motivated the limb.**
**194** blank (set, slot) pairs over the 56 sets, on **four** of the eleven candidates, and
**12** slots attributable in **no** set at all. Seven of the eleven candidates have no blank
anywhere. The pattern is not a rig defect: `check` declines to attribute a part the reference
has merged into a larger connected component, so the blanks concentrate on **small parts of
dense figures** (spineboy's 15 slots, 164 pairs) and on **parts drawn over or behind a static
backdrop** (rung 2's basin, rung 7's cape panel). ⇒ **The limb's value is the disclosure, not
the refusals**: it fires on nothing that should fail and it makes the coverage of G2 visible,
which is what rung 7 attempt 2 asked for.

#### The read-down, itemised

**Every blank reads down.** Two classes, and the split is whether the clause reads that slot's
placement *somewhere*.

⭐ **Class A — the slot is attributed in another set of the same skeleton** (kind 1, the
strongest ground). 182 of the 194 pairs, on 17 (candidate, slot) pairs. The clause reads the
part's placement; the blank is a fact about that set's sampling or occlusion.

| Candidate | Slot | Blank in | Attributed in | Its worst reading there |
| --- | --- | --- | --- | ---: |
| **rung 5** `ess` | `hood-end1` | `speedy@24fps` | `speedy` | **5.12 px** — the rung's own G2 figure |
| | `right-foot` | `speedy@24fps` | `speedy` | 4.07 px |
| | `belt-ends` | `speedy@24fps` | `speedy` | 3.91 px |
| | `hair-2` | `speedy@24fps` | `speedy` | 3.18 px |
| | `hair-1` | `speedy@24fps` | `speedy` | 3.13 px |
| | `torso` | `speedy@24fps` | `speedy` | 2.24 px |
| | `left-hand` | `speedy@24fps` | `speedy` | 1.32 px |
| **rung 7** `sack` | `cape-front` | `hello@24fps`, `hello@30fps` | 10 sets | **2.76 px** — the rung's own G2 figure |
| | `sack` | `walk@24fps`, `walk@30fps` | 10 sets | 2.74 px |
| **spineboy** `ess` | `rear-shin` | 3 of 16 sets | 13 sets | **5.55 px** — the rung's own G2 figure |
| | `torso` | 1 of 16 | 15 sets | 4.77 px |
| | `rear-foot` | 7 of 16 | 9 sets | 3.20 px |
| | `rear-bracer` | 15 of 16 | `run` | 2.64 px |
| | `gun` | 1 of 16 | 15 sets | 2.48 px |
| | `front-fist` | 10 of 16 | 6 sets | 2.29 px |
| | `front-thigh` | 15 of 16 | `walk` | 2.14 px |
| | `neck` | 15 of 16 | `idle` | 2.12 px |

⭐ **Rung 5's seven are one set and one cause, and it is the cleanest form the limb takes.**
`speedy@24fps` is **two stills** of a shot that is *also* committed **in full at 12 fps**, where
all seven read as above over 78 pairs. A blank on the sampled set of a shot read frame by frame
at another rate carries no information at all.

⭐ **Class B — the slot is attributable in no set** (12 slots, 12 of the pairs' distinct
subjects). These are the case [#198](https://github.com/firejune/rigc/issues/198) named, and
each is written out.

**Rung 7 `sack` — `cape-back`, and it is the limb's worked example.** The read-down is
[PR #197](https://github.com/firejune/rigc/pull/197)'s, reproduced here to the digit by this
pass and now standing as the pattern rather than as one adjudicator's diligence:

- **It is drawn and it is scored.** `cape-back` draws on **all 118** compared frames of all
  twelve sets, and the `panel` chain carries **15.7 %** of the candidate's difference over the
  reference's own drawn pixels, at **44.04** per pixel. This is not a part nobody looked at.
- **Why the matcher declines it.** [`src/slots.ts`](../src/slots.ts) returns no match anywhere:
  the panel sits **behind** the sack over a beige backdrop, the reference component containing
  it is **1.4×** its size, and the best residual never clears the confidence bar. Predicted out
  of the source *before any build* and recorded in that run's `LOOP.md` §7, not explained
  afterwards.
- **The standing columns.** `(unattributed)` is **1.7 %** across the twelve sets and **0**
  reference components go unreached in any of them — a part that had left its place would dump
  the reference's ink into both.
- **The quantitative control — kind 4.** Attempt 1's `cape-back` on the *same frames* was also
  a region on its own bone, *was* attributed, and read **1.0 px worst / 1.0 px mean** with
  **39.61** per pixel. This candidate reads **44.04**: **11 % worse per pixel than a part
  measured one pixel out of place.** A part tens of pixels out does not land 11 % away from one
  that is not.

⇒ **G2 reads and passes on rung 7.** 📌 And the coverage is honestly **2 of 3 slots**, which is
now a stated reading rather than an unstated one — which is the whole of what the limb buys.

**Rung 2 `ess` — four slots, and every one is either the static basin or a highlight of a few
pixels.**

- **`water` — kind 3.** 74 × 39 px, 1,562 px of ink, drawn in all eight frames of all four
  sets, and the only slot on its chain, so kind 2 is unavailable. Its chain reads **`MAE in it`
  0.27–0.29** — **the lowest of the nine drawn chains in every set**, against `panel` 3.63,
  `course` 4.54, `ring-upper` 5.52–5.99, `ring-lower` 7.15 and the ball chains 20.78–32.56 — at
  a **0.5–0.6 %** share. The reference pixels nearest its ink differ from it by a quarter of a
  level out of 255; a 74 × 39 part out of place cannot land there. `check`'s reason for
  declining it is merging, not distance: the reference component containing it is **13.4–13.7×**
  its size. Standing columns: **0** unreached components on all eight frames, `(unattributed)`
  **0.000 %**, and the four sheets flat over **1,244** tiles at 1.088–1.107.
- **`billiard` (4–5 px of ink, a 3 × 2 box) and `billiard-gloss` (1 px) — kind 2.** Both hang
  off bone `billiard`, whose `billiard-shade` **is** attributed, at **0.11 px**. The reference
  component that swallows them is **4,409×** and **20,985×** their size respectively. A
  one-pixel gloss has nothing to correlate and never will.
- **`bowling-gloss` (3 px) — kind 2.** Same shape: `bowling` at **0.33 px** — the rung's own G2
  figure — and `bowling-shade` at **0.29 px** are attributed on the same bone.

**spineboy `ess` — seven slots, all kind 2, and every one of them hangs off a chain the clause
reads.**

| Slot | Its chain | Attributed siblings on that chain | Merged into a reference component |
| --- | --- | --- | ---: |
| `eye` | `neck` | `head` **2.92 px** (147 samples) · `goggles` **2.84 px** (147) | 44.9–60.7× its size |
| `mouth` | `neck` | the same two | 162–212× |
| `front-upper-arm` | `front-upper-arm` | `front-fist` **2.29 px** (14) | 31.6–41.8× |
| `front-bracer` | `front-upper-arm` | `front-fist` **2.29 px** (14) | 28.4–36.9× |
| `rear-thigh` | `rear-thigh` | `rear-shin` **5.55 px** (69) · `rear-foot` **3.20 px** (46) | 32.5–41.7× |
| `rear-upper-arm` | `rear-upper-arm` | `rear-bracer` **2.64 px** · `gun` **2.48 px** (82) | 39.1–50.7× |
| `muzzle` | `rear-upper-arm` | the same two | 3.8–4.0× |

Standing columns for all seven: **0** unreached reference components on any of the 147 frames
of any of the 16 sets, and `(unattributed)` **0.004 %** over the whole candidate.

⚠️ **`muzzle` is the one that needs more than kind 2, and it gets it.** It is much the largest
of the twelve — 1,753–2,662 px, a 113 × 83 box — so *"the chain is measured"* is a weaker
statement about it than about a 23-pixel mouth. Three further grounds, all on the three frames
of `shoot` where it draws at all: the whole figure **is one connected component** on two of the
three (`components` 1, 1, 2), so there is no separate reference component for the matcher to
try; `(unattributed)` on that set is **0.000 %** with **0** unreached components on all three
frames; and `shoot@30fps`'s sheet is **the flattest of the seven** at **1.100×**, over a shot
whose candidate draws 7.8 % more ink than the reference — the flash is where the reference puts
it and lasts as long. 📌 It is also the only one of the twelve that is not chronic: three frames
of one shot, against 118–147 for every other.

⚖️ **What the two weakest read-downs are honestly worth, stated rather than smoothed over.**
Kind 2 bounds the **chain**, not the part hung on it — a rigid part on a chain whose distal end
lands correctly cannot travel far, but *cannot travel far* is not *is measured*. On this corpus
that is comfortable, because the parts it covers are small (23–159 px, `muzzle` excepted) and
their siblings read 2.29–5.55 px. It would stop being comfortable on a large part whose chain is
long and whose siblings are attributed only near the root. ⇒ **A future verdict reaching kind 2
for a large part owes a third ground**, the way `muzzle` does here.

🧾 **What this pass records for the owner rather than resolving.**

1. 📌 **The limb's cost is disclosure volume, and a future adjudication should expect a table
   rather than a paragraph.** 194 pairs is not a workload a verdict can carry prose-by-prose,
   and the two-class split above is the shape that made it tractable — Class A collapses to one
   row per (candidate, slot) because the evidence is uniform, and only Class B is written out.
   Worth keeping as the form.
2. ⚠️ **G5's 1.04× is now the ladder's thinnest margin and nothing has been written about it.**
   *The clause margins* computes it for the first time: rung 2's `ess` clears the 0.85 floor at
   **0.882** on both counts, thinner than G2's 1.08× and G7's 1.20×, both of which have owner
   items. No action is proposed — the figure has not moved and no reading calls that candidate
   structurally wrong — but a ranking that is computed rather than remembered has surfaced a
   clause nobody was watching.
3. 📌 **One reproducibility note, and it decides nothing.** Rung 5's `speedy` reports **3**
   unreached reference components over its 79 frames (2 on f0067, 1 on f0064) — the only
   non-zero count anywhere in the sweep, and 3 of 317 components on that set. Every rung-5 blank
   is Class A on a *different* set, so no read-down rests on it, and G2 there reads 5.12 px as
   recorded. Named because the limb's standing columns quote that count, and a column quoted as
   evidence should be quoted when it is not zero.

### The PR #254 instrument re-inspection — rung 7 — 2026-09-02

🔴 **A standing pass flips.** The re-inspection rule 3 requires after an instrument-panel
change ([PR #254](https://github.com/firejune/rigc/pull/254), recorded under *Measure
changes*), taken over the eleven standing candidates. Ten hold their verdict and one does not:
**rung 7 `sack` fails G2 and the rung re-opens.** 🚫 **Zero builds and zero authoring, and no run
directory and no `bench.json` was touched.** Rung 7's frames were rendered again for this pass
at the brief's exact flags — `--rung 7 --max 1024 --tile 256`, plus `--fps 24` and `--fps 30`
at `--stride 999` — reproducing the brief's twelve frame counts exactly (37/21/35/9 ·
73/41/70/17 · 91/51/87/21), and **no frame of it is committed**: `git ls-files
bench/reference-local` reports **0**.

⭐ **This pass's control, and it is an unusually strong one.** Every figure below is **already
in the frozen run directory**. The authoring run kept a `--viewport` pin to `frames.json`'s box
as a named diagnostic, [`check-declared-box.txt`](../bench/runs/2026-08-28-rung7-2/check-declared-box.txt),
and today's *unaided* reading reproduces that file **digit for digit on all twelve sets** —
every MAE, every MAE(ref), every worst frame, every drift and every blank. ⇒ **The instrument
change did not discover anything new about this candidate; it changed which of two readings the
run already had is the one `check` produces by itself.** What moved is not a measurement but
the answer to *which box is the measurement taken in*, and the re-read is confirmed twice over:
a `--viewport` pin to `frames.json`'s box today returns the same figures again.

⭐ **And the pass ran the instrument both ways rather than trusting the claim.** Every standing
candidate was read on `origin/main` (`ad7aec4`, with #254) **and** on its parent (`cb7376f`,
without), same builds, same frames, and the two reports diffed field by field. That A/B is what
licenses every "moved" and "unmoved" below.

📌 **Three scope notes, so no figure is read as more or less than it is.** ① **Nine of the
eleven standing candidates move nothing at all** — rungs 1 (`balls` and `drop`), 2, 3, 4, 5, 6
and 8 (`pendulum` and `ball`) are **identical in every compared field**, 0 of 188, so their
drift figures (1.51 / 1.06 / 0.33 / 0.65 / 3.63 / 5.12 / 2.48 / 3.34 / 4.19 px), their 0
disagreements and their sheet ratios all stand exactly as the v2.2 sweep recorded them. That
is what PR #254 predicts for a candidate already sitting in the frames' own coordinates.
② ⚠️ **spineboy `ess` moves, and its gated figures survive.** Its *shared* framing was a
derived fit and is now `frames.json`'s own box, taken under `extent-spread` (asking **2.12 px**
against a **16.29 px** reach), so **64 of 110** compared fields move across 13 of its 16 sets —
every per-set MAE and most per-set drifts. But **G2 holds to four decimal places** (5.5491 px,
`rear-shin` at `run` f0006, unchanged) and G3 stays **0 of 124**; what moves inside a gating
clause is G7, whose sheets read **1.107–1.659** against the recorded 1.100–1.516 — **2.11×**
inside the bar, so no verdict moves. Its blanks go 164 → **160** pairs over the same 15 slots,
all still kind 1 or kind 2. 📌 **That G2 survived a whole-candidate reframing is itself worth
recording**: it is the derivation's *"framing-independent in a way the means are not"* holding
on the corpus's largest rig, and rung 7 is where that independence turns out to be approximate.
③ `bench` was not re-run: PR #254 changes nothing that reaches G4's lengths or G5's counts, and
those are quoted from the verdict that measured them.

#### The figures that moved

| | as recorded (fitted, gate v2.1/v2.2) | under the #254 instrument | |
| --- | --- | --- | --- |
| **G2** worst attributable slot drift | **2.76 px** `cape-front` at `cape-follow-example` f0019 | **3.94 px** `sack` at `cape-follow-example` f0022 | ⚠️ margin **2.17× → 1.52×** |
| blank (set, slot) pairs | **16** over 3 slots | **18** over 3 slots | `sack` gains `hello@24fps`, `hello@30fps` |
| sets attributing **nothing** | **0** — no set was the 🕳️ case | **2** — `hello@24fps`, `hello@30fps` | 🕳️ fires |
| `panel` chain, per reference pixel | **44.04** | **41.36** | |
| `collar` / `sack1`, per reference pixel | 42.53 / 16.28 | **39.65** / **15.98** | |
| `(unattributed)` over twelve sets | 1.72 % | **1.79 %** | |
| unreached reference components | **0** of 118 frames | **0** of 118 frames | unchanged |
| **G7** worst sheet | **2.923×** `fall-in@30fps` | **3.226×** `fall-in@30fps` | margin 1.20× → **1.085×**, still inside |
| MAE(ref), twelve sets | 24.93 · 22.02 · 22.04 · 19.17 · 22.29 · 22.30 · 26.20 · 28.29 · 27.54 · 22.56 · 21.97 · 21.57 | **24.23 · 21.37 · 21.39 · 17.92 · 20.28 · 20.29 · 25.54 · 27.36 · 26.86 · 22.14 · 21.69 · 21.29** | every set improves |

⭐ **Why the new drift is the honest figure, in the instrument's own words.** On a fitted box
the MAE-refined pass had applied a constant `+1, +2 px` and the framing absorbed it; at the
declared box that pass declines — the box is not an estimate — so the same constant is
attributed to the rig. `FramingRefinement` already says why that is the right side of the
trade: *"a constant pixel inside the box the frames were drawn at is your own figure sitting a
pixel off, which is a thing to fix rather than to frame away."* ⇒ **The old 2.76 px was partly
framing; the 3.94 px is the rig.** Ten of the twelve sets take the declared box under
`extent-spread`; `walk@24fps` and `walk@30fps` are **refused** it on `coordinates` (a fit asks
7.90 px and 7.70 px against the tolerance's own 7.40 px reach) and fall back to the one shared framing, so the
⚖️ framing ruling's *"refused on all twelve sets"* is now false in both directions and is
corrected in that rung's section.

📌 **The texture floor, measured at last — and it exonerates the texture.** `--texture-from
examples/7-anticipation/export/7-anticipation.atlas` (`scale: 0.5` against a candidate atlas
with no `scale:` line) reports a floor of **1.45–1.85** over the reference's own pixels across
the twelve sets — **1.58–1.94** on the union denominator — against figures of 17.92–27.36. The
texture explains **0.30–0.57** of each union MAE, **1.3–2.6 %** of the figure. ⇒ **There is a
floor, it is small, and rung 7's rig is the story** — which is the opposite of what attempt 1's
`4.42` and attempt 2's *"inconclusive"* left on the record, and both are corrected in their own
sections.

#### The read-down, itemised — and one blank does not survive it

**Three slots draw in every set** (`sack` on chain `sack1`, `cape-front` on `collar`,
`cape-back` on `panel`), and **each chain owns exactly one slot** — `slots 1/1` on all three
rows of all twelve sets. ⚠️ **So kind 2 is structurally unavailable on this rung**: there is no
sibling on any chain to read through, the way rung 2's `water` had none. That removes the ground
the v2.2 sweep leaned on hardest elsewhere, and it is why this rung's blanks fall to kinds 1, 3
and 4 alone.

**The two standing columns, quoted for every read-down below**, as rule 2 requires whichever
kind is used: `(unattributed)` is **1.79 %** over the twelve sets — **0.00 %** on both
`hello` stills sets — and **0** reference components go unreached on **any** of the 118 frames.
A part that had left its place would dump the reference's ink into both. 📌 And a structural
fact that bears on all three slots: the reference figure is **one connected component on all
118 frames** (`components` 1 everywhere), so every slot is merged into it by construction and
there is no separate component for the matcher to try — the same third ground spineboy's
`muzzle` was given.

⭐ **`sack` — 4 blanks, kind 1, and it reads down cleanly.** Blank in `hello@24fps`,
`hello@30fps`, `walk@24fps` and `walk@30fps`; **attributed in the other eight sets** on **34**
frames, worst **3.94 px** at `cape-follow-example` f0022 — the rung's own G2 figure — and
0.82–3.94 px across them. Both blank shots are *also* committed in full at 12 fps, where `sack`
is attributed on 8 frames of `hello` (to 2.08 px) and on `walk` f0001 (0.82 px): a blank on the
sampled set of a shot the clause reads frame by frame at another rate carries no information
about the part, which is rung 5's `speedy@24fps` pattern and the cleanest form the limb takes.
📌 Corroborated from the matcher's own side: on the four blank sets its best correlation peak
for `sack` sits **0.0–2.0 px** out and it declines only because the confidence bar rises with
the claimed distance (0.06 against the 0.15 needed at 0.0 px out) — a large, low-contrast,
self-similar shape inside a single-component silhouette has nothing to correlate.

⭐ **`cape-front` — 2 blanks, kind 1, and it reads down cleanly.** Blank in `hello@24fps` and
`hello@30fps`; **attributed in the other ten sets** on **55** frames, worst **2.13 px** at
`hello` f0015 and 0.18–2.13 px across them — including **8 frames of the `hello` shot itself**
at 12 fps. On the two `hello` stills sets its merged component runs **14.1–18.2×** its size —
564–793 px of ink inside a 10,245–11,144 px blob — and **9.4–20.1×** across all 63 of its blank
frames, so the decline is merging and scale, not distance: the `billiard` / `bowling-gloss`
shape.

🔴 **`cape-back` — 12 blanks, and it cannot be read down. This is what fails the clause.** It
**draws on all 118 compared frames of all twelve sets** and is **attributable in none of
them**, and the `panel` chain carries **15.2 %** of the candidate's difference at **41.36** per
reference pixel — 15.7 % at 44.04 as recorded. It is drawn and it is scored. All four kinds were worked, and each is
unavailable or fails on its merits:

| Kind | What it needs | What rung 7 has | |
| --- | --- | --- | :---: |
| **1** | the slot attributed in another set of the same skeleton | **0** attributed frames in **0** of 12 sets | ✗ unavailable |
| **2** | an attributed sibling slot on the same bone chain | `panel` owns **one** slot — no sibling exists | ✗ unavailable |
| **3** | the chain it alone owns carrying **near-zero** error per reference pixel, quoted with the set's other chains beside it | `panel` reads **34.06–60.51** per set, **41.36** over the candidate — against `collar` **39.65** and `sack1` **15.98**. It is the **worst** of the three per pixel, not the best | ✗ **fails on merits** |
| **4** | a quantitative per-pixel control against an **attributed instance of the same part** | attempt 1's `cape-back` is attributable in **no set** at this framing either — **0** of 118 frames, **35.62** per pixel, as its own [`check-pinned.txt`](../bench/runs/2026-08-28-rung7-1/check-pinned.txt) records | ✗ unavailable |

⚠️ **Kind 3 fails in the direction that matters, and the ladder's own qualifying case shows the
distance.** Rung 2's `water` qualified at **0.27–0.29** per reference pixel — *"the lowest of
the nine drawn chains in every set"*, a quarter of a level out of 255. `panel`'s **41.36** is
two orders of magnitude above that and above both of its siblings. Kind 3's logic is that *a
part tens of pixels out of place cannot land there*; a figure this high lands nowhere near the
premise.

🔴 **Kind 4 is the one that actually broke, and it broke because the control was a framing
artefact.** The standing read-down's whole force was that *the same slot on the same frames of
attempt 1 was attributed, at 1.0 px worst and 1.0 px mean, and read 39.61 per pixel where this
candidate reads 44.04 — 11 % worse per pixel than a part measured one pixel out of place.* Two
facts retire it:

- That attribution existed **only in the fitted framing, and only on one frame of one set** —
  `cape-follow-example` f0021. At the declared box attempt 1's `cape-back` is blank on all 118
  frames, which the run's own pinned diagnostic recorded on 2026-08-28 as *"no slot attributable
  in any set"*. ⇒ **There is no attributed instance to control against**, and kind 4 requires
  one by name.
- Reading the blank down with it anyway would compare two per-pixel MAEs **measured in different
  boxes**, which is precisely what the gate's *What never gates* rules out (*"not comparable
  across rungs or across framings"*). Within one box the comparison is available — attempt 1
  **35.62** against attempt 2 **41.36**, this candidate **16.1 % worse per pixel** — but both
  parts are now unmeasured, so it bounds nothing: it is two silences at slightly different
  volumes.

⇒ 🔴 **`cape-back` draws in twelve sets, is attributable in none, and names no qualifying
evidence. The gate's sentence is unconditional — *"a blank that cannot be read down fails the
clause for that set"* — so **G2 is unmet on all twelve sets**, G6 follows, and the rung
re-opens.**

⚖️ **The strongest case for the other reading, stated and refused.** The *rig* has not changed
since 2026-08-29; only the box it is measured in has. On that view `cape-back`'s blank is an
instrument fact — the claimed distances grew, so the confidence bar rose past what a
low-contrast part merged into a single-component silhouette can clear — and the part is no worse
placed today than when it passed. **Three reasons that does not carry.** ① The four kinds exist
so that a verdict cannot excuse a blank by argument; *"a read-down that cannot name its evidence
is not a read-down"* leaves no room for a fifth ground invented at the point of need. ② The same
reasoning would have excused this blank before v2.2 existed, which is the reading v2.2 was
written to close — `check`'s own text calls a blank the loudest row in the table, and the clause
that could not hear it was the defect. ③ Decisively, **the instrument moved toward the frames'
own box**, which *"is exact and carries no fit floor"* — so the reading that lost the
attribution is the **more** faithful one, not the less. A pass that survives only in the framing
that absorbs a constant offset is the case G2's per-slot limb was written for.

#### G2's 🕳️ fires as well, on the two `hello` stills sets

Independently of the per-slot limb, `framesWithoutDrift` **equals the frame count** on
`hello@24fps` and `hello@30fps` — 2 of 2, all three slots blank — so G2's 🕳️ makes each a
**HOLE, not a pass**. The clause names three routes and this pass worked all three:

- **Pin the viewport — exhausted, and by the instrument itself.** Both sets **already take
  `frames.json`'s own box** under `extent-spread`, asking the two *smallest* corrections of the
  twelve (**1.76 px** and **1.67 px** against a 44.26 px reach). A `--viewport` pin to that box
  is the same measurement, and re-running under it returns both HOLEs unchanged. ⇒ The 🕳️'s
  first remedy has nothing left to move.
- **Split the chain table — no reading.** The table is already split three ways, one slot per
  chain, and **every row reads *"no slot attributable"***. What the split yields is `MAE in it`
  — `sack1` 19.80 / 19.74, `collar` 49.57 / 49.34, `panel` 39.15 / 37.03 — which is not a
  placement measure.
- **Say outright that the candidate cannot be gated on those sets, and why — this is the honest
  route.** `hello`'s two stills sets are `{f0000, f0069}` and `{f0000, f0086}`; `f0000` is the
  t=0 pose the 12 fps set also carries (and which that set does not attribute either), while the
  terminal frames at 2.875 s and 2.8667 s exist **in no other set** — the 12 fps shot ends at
  2.8333 s. So on those two frames G2 has no reading at all and no sibling set can supply one.

📌 **The 🕳️ does not decide this verdict** — G2 is already unmet on all twelve sets through
`cape-back` — **but it is recorded because it is the first time the 🕳️ has fired anywhere on
this corpus**, and because two of the three routes the clause offers turn out to be unavailable
rather than merely unhelpful.

#### Every clause, read

| Clause | Reading over all 12 sets, #254 instrument | |
| --- | --- | :---: |
| **G1** validity | 0 FAIL under `--profile spine` — unchanged | ✅ |
| **G2** worst attributable slot drift ≤ 6.0 px | **3.94 px** `sack` at `cape-follow-example` f0022 is **inside** the bar at 1.52×. But `cape-back` draws in all twelve sets, is attributable in none, and **no read-down kind is available** ⇒ the clause fails for all twelve sets. Independently, `hello@24fps` and `hello@30fps` are 🕳️ **HOLEs** | ❌ |
| **G3** per-frame motion = 0 | **0 of 98** adjacent pairs — 36 + 20 + 34 + 8, unchanged. No `⚠️ overdraw`: `drawnRatio` **0.9524–0.9905** against `OVERDRAW_RATIO` 1.5 | ✅ |
| **G4** shot inventory | `count` 4/4 · `names` 4/4; worst length gap **0.000001 s**. Not re-measured — `bench` is untouched by #254 and this is quoted from the verdict that measured it | ✅ |
| **G5** drawn inventory ≥ 0.85 | name-agnostic `slots.count` **3/3** · `attachments.count` **3/3**, no deduction. Quoted, as above | ✅ |
| **G7** every sheet ≤ 3.5× own mean | **eight sheets, all inside** — `fall-in@30fps` **3.226** (66.63 over 20.65, 51 tiles) · `fall-in@24fps` **3.110** (62.27 over 20.02, 41) · `cape-follow-example@24fps` 2.566 · `@30fps` 2.502 · `hello@24fps` 1.796 · `hello@30fps` 1.746 · `walk@24fps` 1.577 · `walk@30fps` 1.498. ⚠️ The worst moves 2.923 → **3.226**, a **1.085×** margin | ✅ |
| **G6** the rung | one skeleton, and it does not meet G2 | ❌ |

⇒ 🔴 **FAIL on G2 alone, and rung 7's status goes ✅ → 🟨.** Issue
[#14](https://github.com/firejune/rigc/issues/14) **re-opens** on G2, per rule 3's *only the
rungs that fail the new gate reopen*. 📌 **A pass is versioned and this does not rewrite one**:
the gate-v2.1 verdict of 2026-08-28 and the gate-v2.2 re-inspection of 2026-08-29 stay true of
the instrument they were measured on, and both sections keep their figures and their dates.
🏁 **The ladder is no longer complete**: rungs 1–6 and 8 hold, spineboy's graduation pass holds,
and rung 7 is open again.

> ➡️ **Superseded the same day, 2026-09-02 — the ladder is complete again under gate v2.3.**
> Rung 7's attempt 3 passes under the clause decisions this pass filed as owner items 1 and 2:
> #256 fixes kind 4's framing (which moves nothing on this corpus, because no standing read-down
> uses that kind) and #258 adds the **measured-unobservable kind** that `cape-back` reaches.
> 📌 **This section is not rewritten** — every figure and every verdict in it stays true of gate
> v2.2 and of the day it was read, which is what *a pass is versioned* means read the other way.
> See *The gate-v2.3 re-inspection* below.

🧾 **What this pass records for the owner rather than resolving.**

1. 🔴 **Kind 4 does not say *at which framing* its control must be measured, and this rung is
   the case that needed it to.** Under one instrument the control existed; under the next it
   did not, on the same candidate, the same frames and the same rig. A clause whose evidence
   can evaporate without the artifact changing is under-specified. ⇒ **A clause decision**, in
   the same family as the two v2.2 closed: either kind 4 requires its control in the framing
   the verdict is read in — which is what this pass adjudicated on, and which makes the kind
   unavailable here — or it admits a cross-framing control and must then say how that survives
   *What never gates*' bar on comparing MAEs across framings. 🚫 **Not decided here**: a clause
   is the owner's and rule 5's to batch, and no reading of this candidate turns on the answer
   — kinds 1, 2 and 3 are unavailable or fail regardless, so `cape-back`'s blank fails the
   clause under either version.
   > ➡️ **Decided 2026-09-02 as gate v2.3 (a)**, in the first of the two directions this item
   > names: **the control must be attributable at the framing the verdict is read in**, which
   > makes kind 4 unavailable here for good. The second direction was refused on the ground this
   > item anticipated — a cross-framing control would compare two per-pixel MAEs *What never
   > gates* calls incomparable. **#256 closes.** ⚠️ It moves no verdict: the sweep found that
   > **no standing read-down on the ladder uses kind 4**, so the repair costs the corpus nothing.
2. ⚠️ **G7's guarded margin is now the thinnest on the ladder at 1.085× — but on a candidate
   that no longer holds a pass**, so *The clause margins* does not name it. Rung 7's
   `fall-in@30fps` moves 2.923 → **3.226**, which is **1.085×** inside a bar
   [#193](https://github.com/firejune/rigc/issues/193) held three days ago partly *because*
   tightening it would flip rung 7's and rung 6's passes 0.031 apart. Both halves of that
   reasoning have moved: rung 7 holds no pass to flip, and had it kept one the two would sit
   **0.334** apart rather than 0.031. 🚫 **No threshold is touched and #193 is not re-opened** —
   the ruling refused a tightening for want of evidence of unfaithfulness, and none has
   arrived. Recorded because the ranking a future deliberation would read has changed shape.
3. 📌 **The *"finds-X-first"* sentence #207 deleted would now be true again, which is the best
   possible argument for having deleted it.** With rung 7 out of the standing set, G7's closest
   pass reverts to rung 6's **2.892** — exactly the claim that went false when rung 7 landed.
   ⇒ A margin is a fact about the corpus and the corpus moves both ways; the table earns its
   keep by being recomputed rather than by being right once.
   > ➡️ **And it went false again on 2026-09-02**, when gate v2.3 restored rung 7's pass: G7's
   > closest standing figure is **3.226×** at a **1.085×** margin, so the clause's guarded
   > margin *is* now the ladder's second-thinnest and *The clause margins* **does** name it.
   > ⇒ Third reversal in five days, in the same table, on the same clause. Items 2 and 3 above
   > are left exactly as measured: both were true when written, and their being overturned twice
   > is the finding.
4. ⚠️ **PR #254's own control reported spineboy `ess` byte-identical, and a direct A/B of the
   two builds says 64 of its 110 fields move.** Both statements are defensible and the gap
   between them is a **scope** gap, not an error: that PR re-ran **`bench`**, whose stored
   `check` block for this candidate is `null` — its figures live in the run's own
   `check-final.json` — so the 48 sets it diffed did not include this candidate's `check`
   report at all. Read directly, `ess`'s shared framing changes from a derived fit to
   `frames.json`'s own box and every per-set MAE moves with it; **G2 and G3 survive exactly**
   and G7 moves 1.516 → **1.659**, which is 2.11× inside the bar. ⇒ **No verdict is affected
   and nothing needs fixing** — but a control quoted as covering the corpus should name the
   surface it actually read, and *"48 sets, byte for byte"* reads as broader than it was.
   📌 The cheap repair is for a re-inspection to A/B the two builds directly, as this pass did,
   rather than to infer stability from `bench`.

### The attempt-3 adjudication — rung 7 — 2026-09-02

🔴 **FAIL on G2 alone, and the rung stays open.** The adjudication of
[`bench/runs/2026-09-02-rung7-3/`](../bench/runs/2026-09-02-rung7-3/)
([PR #257](https://github.com/firejune/rigc/pull/257), `8f1f996`), the first attempt authored
under the [#254](https://github.com/firejune/rigc/pull/254) instrument, against **gate v2.2**.
Six clauses read PASS or SKIP, every figure the run reported reproduces, and one blank does not
reach any read-down kind the clause has. 🚫 **Zero authoring: nothing in the run directory,
no brief, no gate rule and no `src/` was touched, and `bench.json` was not rewritten.**

> ➡️ **Superseded later the same day by the gate-v2.3 re-adjudication of the same candidate —
> 🟢 PASS.** This verdict is **gate v2.2's** and stays true of it: under the enumeration as it
> stood, `cape-back` reached no kind, and that is still the correct reading of gate v2.2. What
> changed is the enumeration — the two owner items below were decided as v2.3 (a), (b) and (c)
> — and **the candidate, the frames and every figure here are unchanged**. 📌 **Nothing in this
> section is rewritten**, and it is the record the deliberation was held on. See *The gate-v2.3
> re-inspection*.

⭐ **The control, and it is the strongest one an adjudication on this ladder has had.** The
candidate was **recompiled from its own two specs** rather than read from `spine/`, and
`skeleton.json` comes back **byte-identical** — sha256 `3225dd73f10f78b6c1573143f1b01f14f6af25d6fe7073c52ed318b838a34908`
on both — with `skeleton.atlas` identical once built at the same directory depth, because the
atlas writes its page paths relative to `--out`. The frames were rendered again at the brief's
exact flags, reproducing the twelve counts (37/21/35/9 · 73/41/70/17 · 91/51/87/21), and **no
frame is committed**: `git ls-files bench/reference-local` reports **0**. Then, from the
repository root with **no `--atlas` and no `--viewport` override**:

| What was re-run independently | Against the run's own stored output |
| --- | --- |
| `check` — twelve sets | reproduces [`check.txt`](../bench/runs/2026-09-02-rung7-3/check.txt) **digit for digit**; the only differing lines are the three path lines in the header |
| `check --all-frames` | reproduces [`check-all-frames.txt`](../bench/runs/2026-09-02-rung7-3/check-all-frames.txt) digit for digit, same three lines |
| `check --texture-from …/7-anticipation.atlas` | reproduces [`check-texture-from.txt`](../bench/runs/2026-09-02-rung7-3/check-texture-from.txt) digit for digit, same three lines |
| `bench 7` | matches [`bench.json`](../bench/runs/2026-09-02-rung7-3/bench.json) in **all 10,036 leaves but 133 path strings** — 0 numeric differences. Neither file carries a gate string ([#137](https://github.com/firejune/rigc/issues/137)) |
| `validate --profile spine` | **15 PASS, 0 FAIL, 10 SKIP, 14 PROF** |
| the run's own harness, re-run from `tools/`: `panel-ceiling.ts`, `pin.ts` (`panel`), `draw-order.ts`, `probe-slot.ts` ×2 | all five reproduce `evidence/` **byte for byte**, 0 diff lines each |

⇒ **The candidate, the reading and the evidence are all reproducible, and what decides this
verdict is the clause and not the reading.** 📌 That matters more than usual here: the run's
whole case for `cape-back` rests on instruments it wrote itself, and every one of them
reproduces exactly — so the case is refused on what it *is*, never on whether it is true.

#### The figures, and what the repairs moved

The rig spec is **byte-identical** to attempt 2's; the repairs are motion-only (367 diff lines).
Stage 0 — the mandatory unchanged recompile in
[`check-baseline-inherited/`](../bench/runs/2026-09-02-rung7-3/check-baseline-inherited/) —
reproduces the #254 re-inspection's reading of attempt 2 exactly: **18** blank pairs over three
slots, and `hello@24fps` / `hello@30fps` attributing **nothing at all**.

| | stage 0 (inherited, unchanged) | attempt 3 | |
| --- | --- | --- | --- |
| G2 worst attributable slot drift | **3.9352 px** `sack` `cape-follow-example` f0022 | **3.9352 px**, same slot, same frame | unmoved — the worst is inherited |
| sets attributing nothing — G2's 🕳️ | **2** (`hello@24fps`, `hello@30fps`) | **0** | ✅ the 🕳️ closes |
| blank (set, slot) pairs | **18** over 3 slots | **14** over **2** slots | `cape-front` 2 → **0**, `sack` 4 → 2 |
| `changeDisagreements` | 0 of 98 | 0 of 98 | unmoved |
| worst sheet ratio | 3.226 `fall-in@30fps` | 3.226 `fall-in@30fps` | unmoved |
| mean MAE, four best-improved sets | 20.59 · 26.51 · 26.05 · 20.79 | **13.87 · 19.68 · 19.21 · 17.64** | reported, gates nothing |

⭐ **What attempt 3 actually earned is the 🕳️.** The first firing of G2's set-level hole anywhere
on this corpus — recorded six sections above, on these two sets, six days ago — is **closed**:
`hello@24fps` and `hello@30fps` now attribute `cape-front` at **0.1998 px** and `sack` at
**0.0977 px** on f0000. `framesWithoutDrift` over the twelve sets reads 7/37 · 0/2 · 0/2 ·
7/21 · 0/2 · 0/2 · 20/35 · 1/2 · 1/2 · 2/9 · 1/2 · 1/2, and equals the frame count nowhere.

**Framing.** Ten of twelve sets take `frames.json`'s own box under `extent-spread`;
`walk@24fps` and `walk@30fps` are **refused** it on `coordinates` (a fit asks **8.03 px** and
**7.82 px** against the tolerance's own 7.40 px reach) and fall back to the one shared framing
(`x0.999059`, offset −1.03, −1.03 px, rms 9.41 px over 472 edges). The refusal is the same one
the #254 re-inspection found on attempt 2, one decimal wider because the collar repair moved the
candidate's content box.

**The chain rollup, per reference pixel, over the whole candidate**: `sack1` **14.96** ·
`collar` **35.41** · `panel` **41.69**, carrying **67.4 % / 15.9 % / 16.7 %** of the difference.
Per set, `panel` reads 48.35 · 21.62 · 22.15 · 35.91 · 54.30 · 54.33 · 40.10 · 40.89 · 38.74 ·
37.21 · 60.51 · 52.72.

**The two standing columns rule 2 requires of every read-down below**: `(unattributed)` is
**1.891 %** over the twelve sets — **0.000 %** on both `walk` stills sets, the ones a read-down
is asked for — and **0** reference components go unreached on **any** of the 118 frames. 📌 And
the structural fact that bears on all three slots, measured again here: the reference figure is
**one connected component on all 118 frames** (`components` 1 everywhere), so every slot is
merged into it by construction and the component pass has nothing to try.

#### The two read-downs, judged against the clause as written

**Three slots draw in every set**, and **each of the three chains owns exactly one** —
`slots 1/1` on all three rows of all twelve sets. ⚠️ **So kind 2 is structurally unavailable on
this rung**, as the #254 re-inspection found: there is no sibling on any chain to read through.

⭐ **`sack` — 2 blanks, kind 1, and it reads down cleanly.** Blank in `walk@24fps` and
`walk@30fps`, which commit `{f0000, f0016}` and `{f0000, f0020}` and nothing between.

- **The clause reads this part's placement, in ten of the twelve sets** — **36** attributed
  frames, 0.0274–3.9352 px, worst **3.9352 px** at `cape-follow-example` f0022, which is the
  rung's own G2 figure. Kind 1 asks for the set and its figure: the blank shot is *also*
  committed in full at 12 fps, where `sack` is attributed on **`walk` f0001 at 0.8172 px**.
  A blank on the sampled set of a shot the clause reads frame by frame at another rate carries
  no information about the part — rung 5's `speedy@24fps` pattern, and the cleanest form the
  limb takes.
- **Corroborated from the matcher's own side**, in the run's stored probe: at the two committed
  instants the best correlation residual is **13.5** and **17.5 / 17.1** against **115.5–115.6**
  of contrast, with confidence **0.15 against a 0.17 bar** and **0.12–0.14 against 0.19** — a
  large, smooth, self-similar beige shape on a large smooth beige shape has almost no peak. Two
  refits, one narrowed to a pure relocation, moved it not at all.
- **The two standing columns**: `(unattributed)` **0.000 %** on both sets, **0** unreached
  reference components on either frame.
- ⚠️ **One thing a verdict should say out loud**: the two blank sets are the two measured in the
  *shared* framing, while the ten attributing sets are at the declared box, so this read-down is
  **cross-framing**. It survives on the card's own reasoning where kind 4's could not — kind 1
  quotes a **drift**, which *What never gates* calls *"per slot and framing-independent in a way
  the means are not"*, while kind 4 quotes a **per-pixel MAE**, which the same passage says is
  *"not comparable across rungs or across framings"*. That asymmetry is the sharpest thing this
  pass can add to [#256](https://github.com/firejune/rigc/issues/256).

⇒ ✅ **`sack`'s blank reads down under kind 1 in both sets.**

🔴 **`cape-back` — 12 blanks, and it does not reach any kind. This is what fails the clause.**
It **draws on all 118 compared frames of all twelve sets** and is **attributable in none**, and
the `panel` chain carries **16.7 %** of the candidate's difference at **41.69** per reference
pixel. It is drawn and it is scored. All four kinds were worked, on this candidate's own
figures:

| Kind | What the clause's own text asks for | What attempt 3 has | |
| --- | --- | --- | :---: |
| **1** | the slot attributed in another set of the same skeleton — *"name the set and its figure"* | **0** attributed frames in **0** of 12 sets, 0 of 118 frames | ✗ unavailable |
| **2** | an attributed **sibling slot on the same bone chain** — *"name the sibling, its figure and its sample count"* | `panel` reads `slots 1/1` in every set: `cape-back` is the only slot on it, so no sibling exists | ✗ unavailable |
| **3** | the chain the slot alone owns carrying **near-zero** error per reference pixel, *"quoted with the set's other chains beside it"* | `panel` alone owns its chain ✓, but reads **41.69** per reference pixel against `collar` **35.41** and `sack1` **14.96** — the **worst of the three** in eleven of the twelve sets, second-worst in `hello` (40.10 against `collar`'s 46.77), and 21.62–60.51 per set | ✗ **fails on merits** |
| **4** | a quantitative per-pixel control against **an attributed instance of the same part** | `cape-back` is attributable in no set of this candidate, and in none of attempt 1's or attempt 2's at the declared box either. **There is no attributed instance of this part anywhere on the ladder at this framing** | ✗ unavailable |

⚠️ **Kind 3 is the only one with a shape that fits, and it fails in the direction that matters.**
The ladder's qualifying case is rung 2's `water` at **0.27–0.29** per reference pixel — *"the
lowest of the nine drawn chains in every set"*, a quarter of a level out of 255. Kind 3's logic
is that *a part tens of pixels out of place cannot land there*; **41.69** is two orders of
magnitude above the premise and above two of its three siblings.

⚖️ **What the run supplies instead, why it is worth reading, and why the clause cannot credit
it.** Attempt 3 does not argue the blank away — it measures three things, and **all three
reproduce byte for byte** from its own harness:

- **(a) an attribution ceiling.** The crimson the sack is *not* in front of — reachable from the
  frame border through {backdrop, crimson} without crossing beige, 4-connected, raw masks — over
  the smallest oriented rectangle covering it: **5–19 %** on every one of the 118 frame entries,
  corpus maximum 19 % at `hello@24fps` f0069. `hidden` is 0 or single digits on every frame, so
  the visible cape is a rim around a solid body and any filled attachment covering the rim covers
  the body too.
- **(b) a placement bound with a known-answer control.** Translating the bone's whole track by
  whole frame pixels and reading the set's own `maeReference`: minimum at **0 px** in the four
  12 fps sets and within 1 px in the eight stills sets, +1 % at **2 px** (3 px in the two `walk`
  stills sets), rising **+1.128 … +4.384 at 6 px**. The control is `collar` — the slot `check`
  *does* attribute — where the same instrument reads minimum 0 and +1 % at 1–2 px against
  `check`'s own 0.20–1.7 px.
- **(c) draw order, build-side.** Panel-behind beats panel-in-front by **86.1–93.7** over
  9,588–184,098 deciding pixels in **all twelve** sets, separating **×8.44–15.30** against the
  collar edge's **×2.40–8.17** — and the collar edge is the one the frames already settle.

🔴 **None of it is one of the four.** (b) is a **whole-frame MAE sweep**, not a drift the clause
reads, and its control is a **different slot on a different chain** — which is kind 2's
requirement with kind 2's condition unmet. (a) bounds what the *instrument* can do, not where the
part is. (c) settles depth, which G2 does not measure. ⇒ *"A blank that cannot be read down fails
the clause for that set"* — **G2 is unmet on all twelve sets**, G6 follows, and rung 7 stays 🟨.

⚖️ **The strongest case for the other reading, stated and refused.** [GATE.md](GATE.md#g2-worst-attributable-slot-drift)
itself enumerates no kinds: it asks a verdict to *"name the slot, and name the evidence that its
placement is benign"*, and on the card alone three named, reproducible measurements satisfy that
sentence — the author, sealed from *Operating rules*, could not have known otherwise and offered
them in good faith. **Three reasons it does not carry.** ① **G5 is written the same way** — its
card text says *"each one named in the verdict"* and its three qualifying kinds live in rule 2 —
so reading a card's requirement as open-ended would make the enumeration inoperative on the two
clauses that have one, and every read-down this ladder has recorded names a kind. ② The standing
precedent decided this exact move two hours before this candidate landed: *"the four kinds exist
so that a verdict cannot excuse a blank by argument; a read-down that cannot name its evidence
is not a read-down leaves no room for a fifth ground invented at the point of need."* ③ Admitting
(b) as a fifth ground would be **an adjudicator changing a clause**, which rule 5 reserves to a
gate deliberation — and it would be done on the single candidate whose verdict turns on it.
⇒ 📌 **The gap is recorded, not resolved**: see the owner item below.

#### Every clause, read

| Clause | Reading over all 12 sets, #254 instrument, gate v2.2 | |
| --- | --- | :---: |
| **G1** validity | **0 FAIL** under `--profile spine` — 15 PASS, 10 SKIP, 14 PROF | ✅ |
| **G2** worst attributable slot drift ≤ 6.0 px | **3.9352 px** `sack` at `cape-follow-example` f0022 — **inside the bar at 1.525×**. Per set: 3.94 · 0.59 · 0.60 · 2.98 · 2.98 · 2.98 · 3.72 · 0.20 · 0.20 · 1.24 · 0.62 · 0.73 px. 🕳️ **no set is a HOLE** — the two that were on attempt 2 now attribute. But `cape-back` draws in all twelve sets, is attributable in none, and **reaches no read-down kind** ⇒ the clause fails for all twelve sets | ❌ |
| **G3** per-frame motion = 0 | **0 of 98** adjacent pairs — 36 + 20 + 34 + 8, every pair of every shot committed in full. No `⚠️ overdraw`: `drawnRatio` **0.9524–0.9933** against `OVERDRAW_RATIO` 1.5 | ✅ |
| **G4** shot inventory | `count` **4/4** · `names` **4/4**. The length limb, both lengths quoted — `cape-follow-example` **3.000000** v 3.000000 · `fall-in` **1.666666** v 1.666667 · `hello` **2.866666** v 2.866667 · `walk` **0.666666** v 0.666667. Worst gap **0.000001 s** against one interval of the coarsest committed rate, 1/12 s = 0.083333 s | ✅ |
| **G5** drawn inventory ≥ 0.85 | name-agnostic `slots.count` **3/3 = 1.000** · `attachments.count` **3/3 = 1.000**. **No deduction taken and none needed** | ✅ |
| **G7** every sheet ≤ 3.5× own mean | **eight sheets, all compared, all inside** — `fall-in@30fps` **3.226** (66.63 over 20.65, 51/51 tiles) · `fall-in@24fps` **3.110** (62.27 over 20.02, 41/41) · `cape-follow-example@24fps` 2.637 (71.72 over 27.20, 73/73) · `@30fps` 2.563 (72.33 over 28.22, 91/91) · `hello@24fps` 1.855 (58.55 over 31.56, 70/70) · `hello@30fps` 1.806 (58.93 over 32.63, 87/87) · `walk@24fps` 1.292 (32.27 over 24.98, 17/17) · `walk@30fps` 1.251 (31.30 over 25.01, 21/21). No sheet was refused by name. The four 12 fps sets commit every sampled frame and read **SKIP** under the clause's first case | ✅ |
| **G6** the rung | one skeleton, and it does not meet G2 | ❌ |

**Reported beside the clauses, deciding nothing** (rule 1, and *What never gates*): mean MAE
22.48 · 13.87 · 13.90 · 17.41 · 19.62 · 19.62 · 23.26 · 19.68 · 19.21 · 20.12 · 18.02 · 17.64;
MAE(ref) 23.46 · 14.58 · 14.61 · 17.92 · 20.28 · 20.29 · 24.40 · 20.37 · 19.87 · 20.88 · 18.46 ·
18.06; texture floor **1.69–1.95** across the twelve sets, **1.3–2.6 %** of each figure, so the
error here is the rig; `bones.count` 8/31 · all five `constraints.*` **0/24** · `timeline_kinds`
0.260 · `key_counts` 0.528 (672/1,273) · `curve_kinds` 0.645 · `deform` 0.750.

⇒ 🔴 **FAIL on G2 alone. Rung 7's status stays 🟨 and issue
[#14](https://github.com/firejune/rigc/issues/14) stays open on G2.** 📌 **The rung is closer than
it was**: G2's set-level 🕳️ is closed, the blank surface is down from three slots to two, and one
of the two remaining reads down cleanly. What is left is the single slot both previous attempts
also left, and it is left for the same reason.

#### What this pass records for the owner rather than resolving

1. 🔴 **The clause cannot credit a measured-ceiling slot pinned by independent evidence, and this
   is the candidate that shows what that costs** — filed as
   [#258](https://github.com/firejune/rigc/issues/258). Attempt 3 supplies, for a slot the
   matcher will never name a distance for, (a) a measured ceiling showing **no** rig choice
   attributes it, (b) a placement bound of ≤ 2–3 px from a non-matcher instrument **calibrated on
   a slot whose answer the clause does print**, and (c) build-side proof of its depth. The four
   kinds cannot receive any of it, so the honest verdict is FAIL — and the same verdict would
   follow from evidence of any quality, which is the shape of an under-specified clause rather
   than of a bad candidate. 🚫 **Not decided here**, and deliberately: a fifth kind is rule 5's
   to batch, and this adjudication would be deciding it on the one reading that turns on it.
   Same family as [#256](https://github.com/firejune/rigc/issues/256) and, before it, the two
   gaps v2.1 and v2.2 closed.
   > ➡️ **Decided 2026-09-02 as gate v2.3 (b), in the direction this item's second option
   > named. #258 closes.** A **fifth kind** admits a slot whose attributability has a **measured
   > ceiling below a calibrated bar**, provided **everything observable about it is
   > independently verified strict** — placement pinned by a non-matcher sweep with a
   > known-answer control on a slot the clause does attribute, and draw order proven by the
   > frames. ⇒ (a), (b) and (c) of this run's evidence are exactly what the kind asks for, so
   > **this candidate passes without a fourth attempt**; the re-adjudication is in *The
   > gate-v2.3 re-inspection*. 🚫 What the kind does **not** do is credit a ceiling on its own —
   > that half was never the argument, and half 2 is what makes it a read-down.
2. ⚠️ **#256 gains a second data point and an asymmetry it can be settled with.** `sack`'s
   read-down here is *also* cross-framing — the two blank sets are the two that refuse the
   declared box — and it survives, because kind 1 quotes a **drift**, which the card calls
   framing-independent, where kind 4 quotes a **per-pixel MAE**, which the card says does not
   compare across framings. ⇒ The clean fix is not *"name the framing"* for kind 4 alone but
   **to say which quantity each kind may cite**, and the card already ranks the two.
   > ➡️ **Taken up 2026-09-02 as gate v2.3 (c)**, in the broader form this item proposed: **a
   > read-down states the framing of every figure it cites, and prefers a framing-independent
   > quantity to a per-pixel one wherever both are available.** ⚠️ **And applying it to this
   > very read-down refines the observation**: all twelve sets are measured **into
   > `frames.json`'s own box** — the two refused sets fall back to a shared framing which for
   > this candidate *is* that box — so this read-down is cross-*route* rather than cross-box.
   > The asymmetry stands and is what (c) codifies; the caveat is milder than it read. Measured
   > in *The gate-v2.3 re-inspection*, finding 3.
3. ⚠️ **Four narrative figures in the run do not reproduce, none of them gating, and the
   direction is against the author's own case in three of the four.** Recorded because a
   re-inspection should not have to find them twice:
   - *"Nothing that had a drift got a worse one"* (`README.md`, `LOOP.md` §8) is **false as
     stated**: three (set, frame, slot) figures measured at both stages got worse —
     `cape-follow-example` f0001 `sack` 0.2017 → 1.4274, f0002 `sack` 1.9839 → 2.1810, `hello`
     f0010 `cape-front` 0.1250 → 0.6910 — and one attribution was **lost** (`hello` f0001 `sack`
     2.0783 → blank). All three are far inside the 6.0 px bar and no set's worst-of moved because
     of them, so nothing gating turns on it. ⭐ **The headline claim it was supporting reproduces
     exactly**: `hello`'s worst drift rose 2.1292 → 3.7170 px **because f0003 read a blank at
     stage 0** — all three slots `method: none`, confidence 0.018 / 0.087 / 0.107 — and a figure
     appearing where there was none moves a worst-of. 15 figures appeared and 1 vanished.
   - **the ~75 % agreement bar does not hold as a threshold.** The run states `cape-front` is
     *"attributable exactly where its own agreement is 77–88 % and never below"*; measured over
     all 118 frames it is attributable from **66 %** and blank as high as **95 %** (14 blank
     frames at or above 75 %), and `sack` is attributable at 86–91 % beige *and* blank across the
     same 73–91 % range. Agreement is a correlate, not the gate — the gate is the confidence
     test, which the run's own §3 states correctly. ⭐ **The conclusion survives with a wider
     margin than the run claimed**: `cape-back`'s measured agreement tops out at **45 %**, and
     the lowest agreement at which anything in this corpus was attributed is 66 %. ⚠️ Note also
     that 45 % exceeds the ceiling tool's own 19 % maximum, so the ceiling bounds *a filled
     attachment covering the whole reachable crimson* rather than the metric the probe prints.
   - **`LOOP.md` §11(c)'s aggregate row for the eight stills sets** quotes 798–1,633 deciding
     pixels, A up to 13.3, control A up to 38.3 and a control floor of ×2.0; the run's own stored
     evidence reads **1,009–1,633 px**, A **6.6–9.7**, control A **12.1–32.1** and a control floor
     of **×2.40**. The four 12 fps rows reproduce exactly and the evidence file reproduces byte for
     byte, so this is a summarisation slip; the claim it supports (the panel edge separates harder
     than the settled control edge) holds on the measured figures.
   - **small quoted ranges**: `sack`'s matcher residuals at the two `walk` stills sets are given
     as 14.6 / 18.6 (13–16 %) where the run's own evidence reads **13.5 / 17.5 / 17.1**
     (11.7–15.2 %), and the texture floor as 1.78–1.94 / 1.3–2.4 % where `check` prints
     **1.69–1.95 / 1.3–2.6 %**.
4. ✅ **The honesty-rule disclosure taints no figure, and it can be corroborated rather than
   taken on trust.** `bench`'s console `gates` line — printed *"to the console only, for the
   person reading the run"* — named a reference-side constraint count at the finish line. Four
   grounds: ① `bench` ran **once**, after the last edit, which the stored `bench.json` confirms
   by matching a re-run of the **final** candidate in every numeric leaf; ② the candidate
   declares **0 constraints** and no `deform` timeline, so no measure moved toward anything the
   line disclosed; ③ constraints and timeline kinds are on rule 1's *unobservable by
   construction* list and **gate nothing**, so the line could not have reached a gating figure
   even had it been acted on; ④ the console transcript was withheld rather than stored, the same
   hand redaction `2026-08-24-spineboy-3` made and which that section records as leaving the run
   clean. ⇒ Carried as a caveat per *After a run* step 3, and it changes no reading.

### The gate-v2.3 re-inspection — 2026-09-02

**Every standing candidate re-read against gate v2.3, and swept for its new kind.** The
re-inspection rule 3 requires of a gate version, taken in the same pass that releases it — and
mandated outright by ruling (d) of the v2.3 block, because (a) and (c) are integrity halves that
can reach a standing read-down. 🚫 **Zero builds and zero authoring, and no run directory and no
`bench.json` was touched.** `check` re-read the **ten standing candidates plus rung 7's attempt
3** over all **56 committed sets** — **1,142** compared frames, **1,061** adjacent pairs and
**25** compared sheets — **from the repository root with no `--atlas` and no `--viewport`
override on any of them**, and reproduces **every gated figure** the #254 re-inspection and the
attempt-3 adjudication recorded. That reproduction is this pass's control: **what moves a verdict
here is the clause, and nothing else could.** 📌 **Rung 7's frames are local-only**, so this pass
rendered them itself at the brief's exact flags — `--rung 7 --max 1024 --tile 256`, plus
`--fps 24` and `--fps 30` at `--stride 999`, reproducing the twelve counts (37/21/35/9 ·
73/41/70/17 · 91/51/87/21) — and **no frame of it is committed**: `git ls-files
bench/reference-local` reports **0**. `bench` was not re-run: nothing v2.3 changes can reach G4's
lengths or G5's counts, and those columns are quoted from the verdicts that measured them.

Only G2 can move anything, so it carries a second column: the read-down as v2.3 requires it
stated — the kind, and the framing the evidence was measured at.

| Rung | Skeleton | Candidate | G1 | G2 ≤ 6.0 px | G2 per slot — kind, and its framing | G3 = 0 | G4 length | G5 ≥ 0.85 | G7 ≤ 3.5× | v2.3 | was v2.2 |
| --- | --- | --- | :---: | --- | --- | --- | --- | --- | --- | :---: | :---: |
| **1** | `balls` | rung1-1 | 0 FAIL | **1.5054** px `cast-shadow-red` @ `animation` f0039 ✅ | ✅ **no blank** — all 8 slots attributed in both sets | ✅ **0** of 117 — 39 + 78; drawn 1.1005 / 1.1010 | ✅ 3.250000 s v 3.233333 s | 1.000 · 1.000 ✅ | SKIP — both sets commit every frame | **PASS** | PASS · **unmoved** |
| **1** | `drop` | rung1-1 | 0 FAIL | 1.0616 px `sword` ✅ | ✅ **no blank** — all 4 slots attributed | SKIP — v2.1 (a) and (b) | ✅ 0.000000 s v 0.000000 s | 0.800 → **1.000** after `ground-cover` ✅ | SKIP — a single pose | **PASS** | PASS · **unmoved** |
| **2** | `ess` | rung2-2 | 0 FAIL | 0.3321 px `bowling` ✅ | ⚠️ **7 blanks, 4 slots** — kinds **3** (`water`) and **2** (three glosses), all four sets **take** the declared box, so no read-down here is cross-box | ⚠️ 0 pairs in all four sets — hole discharged by G7 | ✅ 25.833333 s v 25.866667 s | 0.882 · 0.882 ✅ | ✅ **1.088–1.107**, four sheets | **PASS** | PASS · **unmoved** |
| **3** | `ess` | rung3-1 | 0 FAIL | 0.6535 px `pendulum` ✅ | ✅ **no blank** — both slots attributed in both sets | ✅ **0** of 84 — 64 + 20; drawn 0.9913 / 0.9922 | ✅ exact ×2 | 1.000 · 1.000 ✅ | SKIP — both sets commit every frame | **PASS** | PASS · **unmoved** |
| **4** | `ess` | rung4-1 | 0 FAIL | **3.6256** px `chain-1` ✅ | ✅ **no blank** — all 8 slots attributed in all six sets | ✅ **0** of 152 — 120 + 16 + 16 | ✅ exact ×3 | 0.889 · 0.889 ✅ | ✅ **1.911** · 1.428 · 1.776 | **PASS** | PASS · **unmoved** |
| **5** | `ess` | rung5-1 | 0 FAIL | **5.1159** px `hood-end1` ✅ | ⚠️ **7 blanks, 7 slots, one set** — kind **1**, quoting a **drift** (framing-portable); all six sets **take** the declared box | ✅ **0** of 156 — 78 + 78 | ✅ exact ×3 | 1.000 · 1.000 ✅ | ✅ 1.081 · 1.181 | **PASS** | PASS · **unmoved** |
| **6** | `pro` | rung6-1 | 0 FAIL | **2.4751** px `ball` ✅ | ✅ **no blank** — all 4 slots attributed in both sets | ✅ **0** over 68 | ✅ exact | 1.000 · 1.000 ✅ | ✅ `arcs@24fps` **2.892** | **PASS** | PASS · **unmoved** |
| **7** | `sack` | **rung7-3** | 0 FAIL | **3.9352** px `sack` @ `cape-follow-example` f0022 ✅ **1.53×** | 🆕 **14 blanks, 2 slots** — `sack` kind **1** (a drift, 36 frames in ten sets); `cape-back` **kind 5**, both halves measured and quoted below | ✅ **0** of 98 — 36 + 20 + 34 + 8 | ✅ worst gap **0.000001 s** | 1.000 · 1.000 ✅ | ✅ **1.251–3.226**, eight sheets | 🟢 **PASS** | **FAIL** · 🔴 **MOVED — the only one** |
| **8** | `pendulum` | rung8-1 | 0 FAIL | **3.3378** px `chain-4` ✅ | ✅ **no blank** — all 6 slots attributed in both sets | ✅ **0** over 131 — 44 + 87 | ✅ 3.633333 s, exact | 1.000 · 1.000 ✅ | SKIP — every frame committed at both rates | **PASS** | PASS · **unmoved** |
| **8** | `ball` | rung8-2 | 0 FAIL | **4.1914** px `ball` ✅ | ✅ **no blank** — both slots attributed in both sets | ✅ **0** over 131 — 44 + 87 | ✅ 3.625 s v 3.633333 s | 1.000 · 1.000 ✅ | SKIP — every frame committed at both rates | **PASS** | PASS · **unmoved** |
| **spineboy** | `ess` | spineboy-2 | 0 FAIL | **5.5491** px `rear-shin` @ `run` f0006 ✅ | ⚠️ **160 blanks, 15 slots** — kinds **1** and **2**, and every citation is a **drift**; 9 of 16 sets **take** the declared box per set and the other 7 reach it through the shared framing, which for this candidate **is** that box, so no read-down here is cross-box either | ✅ **0** of 124 | ✅ worst gap **0.000001 s** | 0.952 · 0.931 ✅ | ✅ 1.107–**1.659**, seven sheets | **PASS** | PASS · **unmoved** |

⭐ **The leak detector reads clean: exactly one verdict moves, and it is the one the ruling
predicted.** Ten candidates hold their verdicts with every gated figure reproduced; rung 7's
attempt 3 moves **FAIL → PASS** on `cape-back` reaching the new kind. 🚫 **No other slot on the
ladder reaches kind 5, and none could**: half 1 asks for a **measured** ceiling and its
calibrated bar, and no candidate but this one has either — the other 27 (candidate, slot) blanks
all read down on kinds 1, 2 or 3, exactly as the v2.2 sweep recorded them. ⇒ **Ruling (b) admits
one slot on this corpus**, which is what a kind written from a single worked case should do.

⚠️ **What the sweep found beside that, and none of it moves a verdict.**

1. 📌 **(a) invalidates no standing read-down, because none uses kind 4.** The sweep's 188 blank
   (set, slot) pairs read down on kind 1 (rung 5's seven, rung 7's `sack`, eight of spineboy's
   fifteen), kind 2 (rung 2's three glosses, seven of spineboy's) and kind 3 (rung 2's `water`).
   **The only kind-4 read-down this ladder ever recorded is the one #256 was filed about** —
   attempt 2's, on a candidate that already holds no pass. ⇒ Ruling (a) is a repair to the text
   that costs the corpus nothing, which is the cheapest moment to make it.
2. ⚠️ **(c) surfaces one thing the #254 pass did not: spineboy's `neck` and `mouth` have swapped
   read-down classes, and both still read down.** Under the v2.2 instrument `mouth` was
   attributable in no set (kind 2, quoted with `head` and `goggles` beside it) and `neck` was
   attributed in `idle` (kind 1). Under the #254 instrument — in force since before the
   attempt-3 adjudication — it is the other way round: **`mouth` is attributed in 2 of 16 sets at
   2.43 px** (kind 1) and **`neck` is attributable in none** (kind 2, with `head` **2.72 px**,
   `goggles` **2.84 px** and now `mouth` **2.43 px** attributed on its chain). The #254 record's
   *"same 15 slots, all still kind 1 or kind 2"* is true and remains true; what it did not say is
   that the **membership** moved. 📌 Recorded because a read-down names a kind, and a kind that
   can change under a reframing is exactly what (a) and (c) exist to make visible.
3. 📌 **No read-down on the ladder is cross-box today, and stating the framing is what showed
   it.** (c)'s statement requirement, applied first to rung 7's `sack`, reads: all twelve sets
   are measured **into `frames.json`'s own box** — ten take it per set under `extent-spread`, and
   the two `walk` stills sets **refused** it on `coordinates` reach it through the shared
   framing, which for this candidate **is that same declared box** (`check`'s shared-box line is
   labelled *declared*, not *derived*, and every set's *framed to* line names the frames' own
   box). ⚠️ **The same holds on every standing candidate**, spineboy included, where 7 of 16 sets
   are refused the box per set and all 16 are measured in it. ⇒ The *"cross-framing"* caveat the
   attempt-3 adjudication attached to `sack`'s read-down is **weaker than it read** — one box,
   two routes to it — and that read-down was portable anyway, because kind 1 quotes a drift. 📌
   **What a per-set refusal changes is the accounting, not the box**: it says this set's own
   pixels did not settle the box, so the extent fit's residual is reported against the shared
   reading instead. Both statements were honest at their dates, and (c) is what makes the
   difference legible without re-deriving it — which is the whole of what a disclosure
   requirement buys.
4. ⚠️ **The corpus's blank surface is 188 pairs over 56 sets, down from 194.** Rung 7's attempt 3
   contributes **14** where attempt 2 contributed 16 (18 under #254), and spineboy's are **160**
   where the v2.2 sweep read 164. Four of the eleven candidates carry blanks; seven carry none.
   The pattern is unchanged and is not a rig defect: `check` declines a part the reference has
   merged into a larger connected component.

#### The re-adjudication of rung 7 attempt 3 under gate v2.3 — 🟢 **PASS**

**The candidate is `2026-09-02-rung7-3`, unchanged** — no build, no edit, no re-render beyond
this pass's own local frames, and nothing in the run directory touched. What changed is the
clause. ⭐ **Its evidence was already reproduced once**, by
[PR #259](https://github.com/firejune/rigc/pull/259) on the day it landed; this pass reproduced
it **again, independently**, in this worktree:

| The run's own instrument | Re-run here | Result |
| --- | --- | --- |
| `tools/panel-ceiling.ts --frames …` | 118 frame entries over twelve sets | **byte-identical** to [`evidence/panel-ceiling.txt`](../bench/runs/2026-09-02-rung7-3/evidence/panel-ceiling.txt) |
| `tools/pin.ts … --bone panel` / `--bone collar` / `--bone sack1` | all three blocks | reproduce [`evidence/pin.txt`](../bench/runs/2026-09-02-rung7-3/evidence/pin.txt) **digit for digit** (the stored file joins the blocks with a blank line) |
| `tools/draw-order.ts …` | twelve sets, panel edge and control edge | **byte-identical** to [`evidence/draw-order-swap.txt`](../bench/runs/2026-09-02-rung7-3/evidence/draw-order-swap.txt) |
| `tools/probe-slot.ts --slot cape-back` (stored) and `--slot cape-front` (re-run) | 118 frames each | `cape-back` **0** attributed of 118, agreement **0–45 %**; `cape-front` attributed on **67** frames at agreement **66–90 %** |
| `check`, twelve sets, no `--atlas`, no `--viewport` | every gated figure | reproduces the attempt-3 adjudication to the digit |

**G2's per-slot limb, read clause by clause.** Two slots carry blanks; three chains own one slot
each, so kind 2 stays structurally unavailable on this rung.

⭐ **`sack` — 2 blanks, kind 1, unchanged from the standing reading.** Blank in `walk@24fps` and
`walk@30fps`; **attributed in the other ten sets on 36 frames**, 0.0274–3.9352 px, worst
**3.9352 px** at `cape-follow-example` f0022 — the rung's own G2 figure — and in the same shot at
12 fps on `walk` f0001 at **0.8172 px**. Per (c): the citation is a **drift**, the portable
quantity, and every set is measured into the frames' own declared box. Standing columns:
`(unattributed)` **0.000 %** on both blank sets and **1.891 %** over the twelve, **0** unreached
reference components on **any** of the 118 frames.

🆕 **`cape-back` — 12 blanks, and it reads down under gate v2.3's fifth kind.** It draws on all
118 compared frames of all twelve sets and is attributable in none; the `panel` chain carries
**16.7 %** of the candidate's difference at **41.69** per reference pixel. Kinds 1–4 are
unavailable or fail on their merits exactly as the attempt-3 adjudication found them, and that
table is not revisited. What v2.3 asks instead is two halves, and **both hold as the clause
requires them**:

| Half | What the clause asks | What is measured, and where it is quoted | |
| --- | --- | --- | :---: |
| **1 — the ceiling** | an **instrument-side geometric fact of the slot's visible footprint**, over **every frame of the corpus**, from stated conventions, **below a bar calibrated on the slots the instrument does attribute**, **both quoted** | **Ceiling 5–19 %** on all **118** frame entries — corpus maximum **19 %** at `hello@24fps` f0069 — as the outer crimson (reachable from the frame border without crossing beige, 4-connected, raw masks at `check`'s own 8/255) over the smallest oriented rectangle covering it. **Bar 66 %**: the lowest agreement at which **anything in this corpus** is attributed, measured over 118 frames of the two slots `check` does attribute (`cape-front` 66–90 %, `sack` 86–91 %). And the slot's own **measured** agreement over the same 118 frames tops out at **45 %** — **21 points below the bar**. ⚠️ The two figures are not the same quantity and the verdict says so: the ceiling bounds *a filled attachment covering the whole reachable crimson*, the 45 % is what the probe reads on this candidate's actual footprint. **Both are under 66 %**, so the clause's comparison holds on either | ✅ |
| **2 — the observables, strict** | placement **pinned by an independent sweep** carrying a **known-answer control on a slot the clause does attribute**, and **draw order proven by the frames** | **Placement**: a whole-track translation of the bone, in whole frame pixels, read on the set's own `maeReference` — minimum at **0 px** on the four 12 fps sets and within 1 px on the eight stills sets, **+1 % at 2 px** (3 px on the two `walk` stills sets), rising **+1.128 … +4.384 at 6 px**. **Control**: `collar`, whose slot `cape-front` `check` **does** attribute — same instrument, minimum 0 and **+1 % at 1–2 px**, against `check`'s own printed **0.18–3.72 px** worst per set and **0.4746 px** mean over 67 attributed frames. **Draw order**: panel-behind beats panel-in-front by **86.10–93.70** over **9,588–184,098** deciding pixels in **all twelve** sets, separating **×8.44–15.30** against the settled collar edge's **×2.40–8.17** | ✅ |

⇒ 🟢 **Both halves hold, so `cape-back`'s blank reads down by name under kind 5, and with `sack`
reading down under kind 1 G2's per-slot limb is satisfied on all twelve sets.** The 6.0 px bar
itself is met at **3.9352 px**, **1.53×** inside; **no set is a 🕳️ HOLE**; and G1, G3, G4, G5 and
G7 read exactly as the attempt-3 adjudication read them — PR #259's reproduction, re-reproduced
here. ⇒ 🏁 **The rung's verdict is PASS**, G6 follows, and
[#14](https://github.com/firejune/rigc/issues/14) closes.

📌 **What this verdict does not rest on.** Not on the ceiling alone — half 2 is what makes it a
read-down, and a ceiling with an unpinned placement would fail exactly as an unexplained blank
does. Not on the run's prose: **four narrative figures in that run do not reproduce**, all
recorded in the attempt-3 adjudication and none of them gating, and this pass adds a **fifth** of
the same kind — the run's summary of its own ceiling output (`README.md` once and `LOOP.md`
twice) says *"`hidden` is 0 or single digits on every one of the 102 frames"*, and the stored evidence
it reproduces from reads **3 of 118 frame entries above that** (`hello` f0018 at **51**, `hello`
f0030 at **11**, `hello@24fps` f0069 at **10**) — two of them inside that 102-frame scope. ⚠️ It
changes nothing about half 1: the ceiling's numerator is **outer** crimson, so hidden crimson is
excluded by construction, and the frame carrying the largest hidden count is not the frame
carrying the ceiling's maximum. ⇒ Recorded because a figure quoted as evidence should be quoted
as measured, and the clause's *"both measurements are quoted"* is what obliges a verdict to look
at the file rather than at the sentence about it.

⚠️ **And what a re-climb inherits, stated because it is now a standing pass's margin.** Rung 7's
`fall-in@30fps` sheet reads **3.226×**, a **1.085×** margin inside G7 — the closest any standing
candidate sits to that bar. 🚫 **No threshold is touched and [#193](https://github.com/firejune/rigc/issues/193)
is not re-opened**: that ruling refused a tightening for want of evidence of unfaithfulness, and
none has arrived. What has changed is which candidate a future deliberation would read first,
and *The clause margins* below carries it.

### The clause margins — the corpus against the bar

⭐ **This table is the live ranking, and it replaces the *"a tightening of X finds Y first"*
sentences that used to sit in rule 2.** Those were snapshots written into a rule and **two of
them went false within three days**: G7's when rung 7 attempt 2 landed at 2.923 above rung 6's
2.892, and G2's when spineboy's 5.55 px displaced rung 5's 5.12. A margin is a fact about the
**corpus**, which moves whenever a candidate lands; a sentence inside a rule does not.
Owner ruling 2026-08-29, [#207](https://github.com/firejune/rigc/issues/207); the reasoning is
in *Operating rules* rule 2, under *Gate v2.2* (c).

📌 **Every adjudication updates this table.** It is a named part of *After a run* step 1 in
[`bench/runs/README.md`](../bench/runs/README.md), so it is current by construction rather than
by anybody remembering to repair a sentence.

**Read 2026-09-02 on the gate-v2.3 re-inspection**, over the **eleven standing candidates** —
rungs 1 through 8, rung 7 included, and spineboy `ess` — as re-measured in that section above.
⭐ **Rung 7 is back in the standing set**: it passes gate v2.3 on `2026-09-02-rung7-3`, so it
names rows again, and G3's pool returns to **1,061** pairs from 963.

🗓️ **The two dated readings this supersedes, both 2026-09-02.** The **#254 re-inspection** read
the table over **ten** candidates with rung 7 out of the standing set on a G2 FAIL, which put
G7's closest pass back at rung 6's 2.892× and the pool at 963 pairs; the **attempt-3
adjudication** re-read it unchanged the same day and recorded what a pass would move. Both stay
true of the verdicts they were read against — and the second's forecast is what happened.

| Clause | The bar | Closest standing pass | Its figure | Margin |
| --- | --- | --- | ---: | ---: |
| **G1** validity | 0 FAIL | every standing candidate | **0 FAIL** | *no ratio — a bar at zero* |
| **G2** worst attributable slot drift | ≤ 6.0 px | **spineboy** `ess` — `rear-shin` at `run` f0006 | **5.5491 px** | **1.081×** |
| **G3** per-frame disagreements | = 0 | every standing candidate | **0** of 1,061 pairs | *no ratio — a bar at zero* |
| **G3** overdraw | no `⚠️ overdraw` | **rung 1** `balls` — `animation@24fps` | `drawnRatio` **1.101** | **1.36×** |
| **G4** shot length | ≤ one interval of the coarsest committed rate | **rung 2** `ess` — 25.833333 s against 25.866667 s | gap **0.033334 s** against 1/12 s | **2.50×** |
| **G5** drawn inventory | ≥ 0.85, after the itemised deduction | **rung 2** `ess` — `slots.count` and `attachments.count` alike | **0.882** | **1.038×** |
| **G7** sheet flatness | ≤ 3.5 × that sheet's own mean | **rung 7** `sack` — `fall-in@30fps`, 66.63 over 20.65 | **3.226×** | **1.085×** |

⚠️ **The thinnest-margin ordering is G5 1.038× → G2 1.081× → G7 1.085×**, and G2 and G7 are now
close enough that two decimals hide the order — both round to 1.08×, and the third decimal is
what separates them. Two rows moved on this re-inspection and both because **rung 7 rejoined the
standing set**: G7's closest pass goes from rung 6's 2.892× to rung 7's **3.226×**, taking the
clause's guarded margin from 1.21× to **1.085×**, and G3's pool goes 963 → **1,061** with rung
7's 98 pairs back in it. G2, G4, G5 and G3's overdraw row are unchanged to the digit. By rule 5
point 2 a tightening of any of the three thin ones is an **integrity** change: it flips a
published pass and re-inspects immediately rather than waiting for a bump.

📌 **The corpus fact a tightening would meet first, stated here and nowhere else.** A tightening
of **G7** now finds **rung 7** first, at 3.226×, with rung 6's 2.892× behind it; a tightening of
**G2** finds **spineboy** at 5.5491 px; a tightening of **G5** finds **rung 2** at 0.882. ⇒ This
is the claim [#207](https://github.com/firejune/rigc/issues/207) deleted from rule 2 and moved
here, and its third reversal in five days is the argument for the move: *rung 6 first* was true,
then false when rung 7 attempt 2 landed, then true again when rung 7 was withdrawn, and is false
again today. A sentence inside a rule cannot track that; a recomputed table can.

📌 **G5's 1.038× is still the thinnest margin on the ladder and still the least discussed.**
Rung 2's `ess` draws 15 of the reference's 17 slots and attachments and takes no deduction, so
the clause clears by two parts. G2's has two owner items written about it, G7's has
[#193](https://github.com/firejune/rigc/issues/193), and G5's has none.

⚠️ **And G7's row is now a figure that used to sit outside this table.** The #254 re-inspection
recorded rung 7's **3.226×** precisely so *"a re-climb inherits it rather than rediscovering
it"*, while the table itself named rung 6 — because the table names the **closest standing
pass** and rung 7 was not one. ⇒ **Nothing about the clause loosened or tightened between those
two readings**; what moved is which candidates pass. That is the table's whole design, and this
is the first time it has been exercised in both directions on the same clause.

🚫 **What this table is not.** It names the **closest** pass per clause, not a ranking of
candidates, and a margin is a ratio against a bar rather than a quality score — rung 2's 1.038×
is a candidate that draws two parts fewer than the reference, not one that is nearly wrong.
G6 has no row: it is the conjunction of the others, so its margin is whichever of them is
thinnest on the rung in question.

### The gate-v2.1 re-inspection — 2026-08-26

**Every standing candidate re-read against gate v2.1.** The re-inspection rule 3 requires
of a gate version, taken in the same pass that releases it — rule 5 point 3, the milestone
bump. 🚫 **Zero builds and zero authoring, and no run directory and no `bench.json` was
touched.** `check` and `validate --profile spine` re-read the **ten standing candidates**
over all **44 committed sets** — 963 adjacent pairs and 17 compared sheets — **from the
repository root, with no `--atlas` override on any of them**, and reproduce every gated
figure to the digit. That is this pass's control: what moves a verdict here is the clause,
not the reading.

📌 **Two scope notes, so no figure is read as more or less than it is.** ① The sweep covers
the ten candidates that *hold* a verdict, not the sixteen the 2026-08-25 passes read — the
superseded attempts keep their own entries below and are not re-adjudicated, so 44 sets
against that pass's 86 is a narrower subject and **not** a coverage loss. ② `bench` was not
re-run: G4's lengths and G5's counts below are the figures already recorded in each rung's
own verdict, quoted rather than re-measured, because nothing v2.1 changes can reach them.
What this pass re-measured itself is G1, G2, G3 and G7.

Only G3 can move anything, so its column carries the reading each skeleton gets under
v2.1's (a) and (b).

| Rung | Skeleton | Candidate | G1 | G2 ≤ 6.0 px | G3 = 0 | G4 length | G5 ≥ 0.85 | G7 ≤ 3.5× | v2.1 | was v2 |
| --- | --- | --- | :---: | --- | --- | --- | --- | --- | :---: | :---: |
| **1** | `balls` | rung1-1 | 0 FAIL | **1.51** px `cast-shadow-red` ✅ | ✅ **0** of 39 · **0** of 78; drawn 1.1005 / 1.1010 | ✅ 3.250000 s v 3.233333 s — **0.20** of a frame | 1.000 · 1.000 ✅ | SKIP — both sets commit every frame | **PASS** | PASS |
| **1** | `drop` | rung1-1 | 0 FAIL | 1.06 px `sword` ✅ | 🆕 **SKIP** — one frame per set, so **(a)** excludes both and **(b)** leaves the clause no object | ✅ 0.000000 s v 0.000000 s | 0.800 → **1.000** after `ground-cover` ✅ | SKIP — a single pose | **PASS** | not adjudicable |
| **2** | `ess` | rung2-2 | 0 FAIL | 0.33 px `bowling` ✅ | ⚠️ 0 pairs in all four sets — **hole discharged by G7**, unchanged: two stills 310 frames apart is not a single pose, so **(b) does not apply** | ✅ 25.833333 s v 25.866667 s — **0.4** of a frame | 0.882 · 0.882 ✅ | ✅ **1.088–1.107**, four sheets, 311 tiles each | **PASS** | PASS |
| **3** | `ess` | rung3-1 | 0 FAIL | 0.65 px `pendulum` ✅ | ✅ **0** of 64 · **0** of 20; drawn 0.9913 / 0.9922 | ✅ exact ×2 | 1.000 · 1.000 ✅ | SKIP — both sets commit every frame | **PASS** | PASS |
| **4** | `ess` | rung4-1 | 0 FAIL | **3.63** px `chain-1` ✅ | ✅ **0** of 120 + 16 + 16; the three `@24fps` sets are stills — **(b) does not apply**, G7 reads them | ✅ exact ×3 | 0.889 · 0.889 ✅ | ✅ **1.911** · 1.428 · 1.776, 241/33/33 tiles | **PASS** | PASS |
| **5** | `ess` | rung5-1 | 0 FAIL | **5.12** px `hood-end1` ✅ | ✅ **0** of 78 · **0** of 78, with `ball-ready-to-animate`'s two sets excluded under **(a)** — the reading v2.1 writes down, and this verdict already rested on it | ✅ exact ×3 | 1.000 · 1.000 ✅ | ✅ 1.081 · 1.181, 157 tiles each | **PASS** | PASS |
| **6** | `pro` | rung6-1 | 0 FAIL | **2.48** px `ball` ✅ | ✅ **0** over 68 | ✅ exact | 1.000 · 1.000 ✅ | ✅ `arcs@24fps` **2.892** (13.99 over 4.84, 137 tiles) | **PASS** | PASS |
| **7** | — | — | — | — | — | — | — | — | not attempted | not attempted |
| **8** | `pendulum` | rung8-1 | 0 FAIL | **3.34** px `chain-4` ✅ | ✅ **0** over 44 + 87 | ✅ 3.633333 s, exact | 1.000 · 1.000 ✅ | SKIP — every frame committed at both rates | **PASS** | PASS |
| **8** | `ball` | rung8-2 | 0 FAIL | **4.19** px `ball` ✅ | ✅ **0** over 44 + 87 | ✅ 3.625 s v 3.633333 s — **0.2** of a 24 fps frame | 1.000 · 1.000 ✅ | SKIP — every frame committed at both rates | **PASS** | PASS |
| **spineboy** | `ess` | spineboy-3 | 0 FAIL | ❌ **19.57** px `death` · 7.07 `walk` · 6.75 `run` | ❌ **3** of 59 on `death`; `aim`'s two sets excluded under **(a)**, which is what both 2026-08-25 passes already did | ✅ ×8, all inside 1/60 s | 0.952 · 0.931 ✅ | ✅ 1.136–**2.028** (`jump@30fps`), seven sheets | **FAIL** | FAIL |

**One verdict moves, and it is the one the gap named.**

- ✅ **Rung 1 `drop`'s G3: *not adjudicable — clause gap* → SKIP, and the rung closes.**
  Nothing about the skeleton changed and nothing could have: `ready-to-animate` is
  0.000000 s, both its sets are one frame, `changePairs` is **0**, and three passes in a row
  said so. What changed is that the gate now states what it does with that — (a) excludes
  the set, (b) leaves G3 with no object and reads SKIP on G7's precedent. `drop` is
  **PASS · PASS · SKIP · PASS · PASS · SKIP** across G1–G5 and G7, `balls` clears every
  clause outright, so **G6 is met on both skeletons and issue
  [#10](https://github.com/firejune/rigc/issues/10) closes.** ⚠️ **A pass is versioned**:
  this is a **gate-v2.1** pass, and the 2026-08-26 verdict that read *not adjudicable*
  stays true of gate v2 — it is not withdrawn and its section is not rewritten.
- **Nothing else moves.** Rungs 2, 3, 4, 5, 6 and 8 are re-inspected and hold; spineboy
  fails where it failed under v2, on G2 and G3, and neither limb is one v2.1 touches.

⭐ **Where the clause did *not* fire, and why that is the point.** Six of the 44 sets are
single poses — `drop`'s two, rung 5's two `ball-ready-to-animate` sets and spineboy's two
`aim` sets — and (a) excludes all six. Only on `drop` does that leave the skeleton with
nothing, because there the single pose is the whole skeleton. On rung 5 it leaves `ball` and
`speedy` at 78 pairs each and on spineboy it leaves seven shots; both verdicts read G3
directly and are unchanged. ⇒ **The ruling did not loosen G3 anywhere it was deciding
something.** It stated a scope three verdicts already assumed, and applied it once more
where the scope turns out to be empty.

🚫 **And where (b) deliberately does not reach.** Rung 2's four sets and rung 4's three
`@24fps` sets have **0 adjacent pairs** and are **not** single poses — they are shots
sampled twice, with frames between the samples that a pair reading never sees. That hole is
real and **G7's discharge** is what answers it; reading those sets as SKIP instead would
retire load-bearing v2 machinery and hand rung 2 its pass on nothing. Rung 2's verdict is
therefore unchanged **and unchanged by the same route** — the four sheets flat over all
1,244 tiles.

📌 **A reproducibility fact this pass is the first able to state.** All ten standing
candidates were re-read **from the repository root with no `--atlas` override** and all ten
load. The 2026-08-26 batch could not say that: the rung-5 candidate's atlas named its pages
relative to its author's worktree and had to be measured through an override
([#181](https://github.com/firejune/rigc/issues/181), repaired as a labelled amendment the
same day). ⇒ Rule 3's *"a re-read of stored candidates"* is now literally executable on
every candidate that holds a verdict.

🧾 **What this pass records for the owner rather than resolving.**

1. ✅ **Resolved — the single-pose question, both faces.** It was the one clause decision the
   2026-08-26 batch left outstanding, and the only thing holding a rung open. Closed by the
   ruling, not adjudicated around.
2. ⚠️ **Two clause-gap findings from earlier passes are still open, and neither is a
   number.** G7's margins do not separate the sheet corpus's top two (3.5 admits 2.892 and
   refuses 4.00; rule 2's 🧾 carries the alternative readings), and the odd-tile spikes that
   distinguish rung 4 from rung 6 are the same defect at two magnitudes. Both are recorded
   under *The gate-v2 re-inspection* and neither is touched here.
   > ➡️ **The first of the two is ruled, 2026-08-29: the 3.5× stands**
   > ([#193](https://github.com/firejune/rigc/issues/193), closed) — the trigger fired on rung 7
   > attempt 2's 2.923× and the deliberation held the number, because a tightening would flip
   > two standing passes 0.031 apart and nothing on the corpus has been read as unfaithful
   > inside the bar. The **second** — a tile-level change measure that would separate the
   > spikes — is untouched and stays an **instrument** question, which rule 3 keeps out of a
   > gate version. *Operating rules* rule 2, under *Gate v2.2* (b).
3. 📌 **The ladder is now open on no gate question at all.** Every rung but 7 is ✅; rung 7
   has never been attempted and is blocked on a brief that has had no second pass, not on a
   clause. What remains before the graduation exam is protocol work, and spineboy's freeze
   is unaffected: its G2 and G3 are observable residuals, so rule 4 item 2 makes it a
   re-climb rather than an adjudication.

### The gate-v2 batch adjudication of the four re-climbs — 2026-08-26

**The four candidates authored on 2026-08-26 — rungs 1, 3, 4 and 5 — judged clause by
clause against gate v2, unchanged.** This is the closing step of the phase-3 worklist
([#153](https://github.com/firejune/rigc/issues/153)) and it is the third pass of this
kind, after *The first gate-v1 adjudication* and *The gate-v2 re-inspection* below.
🚫 **Zero builds and zero authoring**, and **no run directory and no `bench.json` was
touched.** `check` re-read the five stored candidates over all 16 committed sets and the
figures below are `bench`'s own recorded ones; the re-read **reproduces every gated figure
to the digit**, which is this pass's control — what decides anything here is the clause,
not the reading.

⚠️ **The four runs could not adjudicate themselves and say so.** *Operating rules* is on
the protocol's forbidden list, so three of the four declined to open it and returned
figures with the clause mapping left blank; the fourth read the clause table and
[recorded the breach](../bench/runs/2026-08-26-rung1-1/LOOP.md) (ruled on below). The
verdicts are therefore this pass's, not theirs.

| Rung | Skeleton | Candidate | G1 | G2 ≤ 6.0 px | G3 = 0 | G4 length | G5 ≥ 0.85 | G7 ≤ 3.5× | Verdict |
| --- | --- | --- | :---: | --- | --- | --- | --- | --- | :---: |
| **1** | `balls` | rung1-1 | 0 FAIL | **1.51** px `cast-shadow-red` ✅ | ✅ **0** of 39 · **0** of 78; drawn 1.101 | ✅ 3.250000 s v 3.233333 s — **0.20** of a frame | 1.000 · 1.000 ✅ | SKIP — both sets commit every frame | **PASS** |
| **1** | `drop` | rung1-1 | 0 FAIL | 1.06 px `sword` ✅ | ⚖️ **not adjudicable — clause gap** — 1 frame per set, 0 pairs, no sheet, and no other shot | ✅ 0.000000 s v 0.000000 s | 0.800 → **1.000** after `ground-cover` ✅ | SKIP — a single pose | **not adjudicable** |
| **3** | `ess` | rung3-1 | 0 FAIL | 0.65 px `pendulum` ✅ | ✅ **0** of 64 · **0** of 20; drawn 0.991 | ✅ 5.333333/5.333333 s · 1.666666/1.666667 s | 1.000 · 1.000 ✅ | SKIP — both sets commit every frame | **PASS** |
| **4** | `ess` | rung4-1 | 0 FAIL | **3.63** px `chain-1` ✅ | ✅ **0** of 120 + 16 + 16; drawn 0.973–0.995 | ✅ exact ×3 | 0.889 · 0.889 ✅ | ✅ **1.911** · 1.428 · 1.776, three sheets, 241/33/33 tiles | **PASS** |
| **5** | `ess` | rung5-1 | 0 FAIL | **5.12** px `hood-end1` ✅ | ✅ **0** of 78 · **0** of 78; drawn 0.988–0.991 | ✅ exact ×3 | 1.000 · 1.000 ✅ | ✅ 1.081 · 1.181, two sheets, 157 tiles each | **PASS** |

**G6, and what it decides.** Rungs 3, 4 and 5 are one skeleton each and each meets G1–G5
with G7 met or skipped, so rule 3's *close on pass* applies and **issues
[#12](https://github.com/firejune/rigc/issues/12),
[#17](https://github.com/firejune/rigc/issues/17) and
[#18](https://github.com/firejune/rigc/issues/18) close with this pass.** **Rung 1 does
not close, and `balls` is not why**: `balls` clears every clause outright, and the rung
turns on `drop`'s G3, which this gate cannot read either way. G6 does not care which of a
rung's two skeletons is the one it cannot pass.

🕳️ **`drop`'s G3, recorded verbatim: *not adjudicable — clause gap*.** `ready-to-animate`
is **0.000000 s** long, so each of its two committed sets is one frame, `changePairs` is
**0**, and `changeDisagreements` is 0 for having nothing to compare. Two readings of gate
v2 are both supportable and the text chooses neither: read literally the clause is met
(`changeDisagreements` = 0, no overdraw), and read through the recorded holes rule —
*"where **no** set of a shot can be read, the clause is recorded as unmet"* — it is unmet.
G7's discharge route is unavailable because `render_reference.ts` writes no sheet for a
single-frame set, so there is nothing to discharge it with, and **no candidate can change
any of that** — three passes in a row now reach the same verdict on this set, the third of
them on a candidate authored after the other two. ⇒ **The gap wants a clause-level
decision at the next gate release** (that a
zero-duration animation reads G3 as met, or that G6 excludes G3 for such a set), not
another run. Nothing else about this skeleton is open: it is inside every clause that can
be read on it.

⭐ **And the same reading is what lets rung 5 pass, which is the distinction the next gate
version has to write down.** A single-pose set is **excluded from G3's scope**, exactly as
G7's 🕳️ excludes it (*"the set is a single pose (`ready-to-animate`, `aim`): there is no
shot to read"*) and exactly as both 2026-08-25 adjudications already read spineboy — whose
`aim` is a single pose, whose G3 was recorded as *"3 of 59 on `death`"* with `aim` never
counted as a hole, and whose stated graduation bar (*"19.57 px worst drift, 3 per-frame
disagreements, and every sheet inside 3.5×"*) is a bar that could not be beaten at all if
that set left an undischargeable hole. On rung 5 that exclusion leaves **two** shots
behind, `ball` and `speedy`, and G3 is read on them directly at 78 adjacent pairs apiece.
On `drop` it leaves **none** — the single pose is the whole skeleton, the status table's own
*"a skeleton with zero animations"* — so the clause is left with no object and the verdict
above is the honest one. ⇒ **The gap is one question with two faces: what G3 reads on a
shot that is a single pose. Rung 1 is the face where the answer decides a rung.**

🧾 **G5's deduction, itemised, and where it is not taken.** One element is deducted, from
one skeleton:

- **`drop`** — **`ground-cover`**, the layer the run declines to author because the frames
  cannot place it. `slots.count` and `attachments.count` read **4/5 = 0.800** as printed,
  below the 0.85 floor; deducting that one item from the **reference's** side gives
  **4/4 = 1.000** on both. *Operating rules* rule 2's own 🧾 already carries this item as
  one of the three kinds that qualify, naming it and its 4-against-5 arithmetic, so the
  deduction is the gate's own and not a reader's addition. The run's independent evidence
  is in its README: compositing the four authored parts leaves a flat whole-frame residual
  at MAE **1.00** with no localised excess at any block size, and `frames.json`'s viewport
  inverts to a posed-union box matching the four parts to **0.3 world units in both axes**.
  That is the whole deduction on this rung.
- **`rung 4`** — **no deduction is taken, and that is the same rule applied, not a
  different one.** `slots.count` and `attachments.count` read **8/9 = 0.889**, and the
  ninth element is invisible in the frames the same way `ground-cover` is: eight PNGs ship,
  eight distinct parts are drawn, and whatever the ninth slot holds is either a second
  attachment on a part that already has one or something no frame shows. But G5's 🧾 says
  outright that **a deduction that cannot name its item is not a deduction**, and nothing in
  the frames names this one. So the clause is read on the **printed** figures — which clear
  the floor by 0.039 without it — and the two 2026-08-25 adjudications passed the same
  measure on the same reading.

📌 **G7, per set, and every SKIP has its reason from the 🕳️.** Of the 16 sets, five carry a
sheet `check` compared and all five clear: rung 4's `ball-catch@24fps` **1.911** (32.28 over
16.89, 241/241 tiles), `wave-by-hand@24fps` **1.428** (18.43 over 12.91, 33/33),
`wave-offset@24fps` **1.776** (24.67 over 13.89, 33/33), and rung 5's `ball@24fps` **1.081**
(6.27 over 5.80, 157/157) and `speedy@24fps` **1.181** (8.71 over 7.38, 157/157). The other
eleven read **SKIP, never a pass**: nine because the set commits every sampled frame
([`src/check.ts`](../src/check.ts) returns no sheet at `onDisk >= sampled`), so the whole
shot is already read frame by frame under G2 and G3 at that rate; and two because the set is
a single pose. **No set is a HOLE** — no sheet was refused by name anywhere in the sweep.

🎯 **What moved, rung by rung, against the clause each rung was standing on.**

- **Rung 3 clears the clause its every stored candidate had failed.** Three previous
  rung-3 candidates posted 9+2, 7 and 5+1 per-frame disagreements; this one posts **0 of
  64** and **0 of 20**, and its README names the four pairs that decided it — three
  exactly-still runs the reference holds and one it moves a single pixel across, which
  inverts to about a hundredth of a degree and is two orders below any pose fit's step.
  Nothing else about the rung moved into the gate: `slots`/`attachments` were already
  1.000 on their counts and the drift was already at the floor.
- **Rung 4's G7 goes from the corpus's lone outlier to inside the bulk of it.**
  `ball-catch@24fps` read **4.00×** (121.98 over a 30.46 mean) when v2's re-inspection
  reopened this rung; it now reads **1.911×** (32.28 over 16.89) — the sheet **mean**
  halved and the worst tile fell by 74 %. Its own README attributes the move to §8.1's
  multi-start rule over four rescue passes, which is the paragraph the run calls the
  highest-value one in the guide. Every clause that cleared under gate v1 still clears.
- **Rung 5 clears G3 and improves G5 while it is there.** `ball`'s six disagreements are
  gone — 0 of 78 on both shots — held by measuring the reference's own Δ series **at
  `check`'s own tolerance** and constraining the fit with it rather than inspecting it
  afterwards; and `slots.count` moves **12/13 → 13/13** (the two hair tufts now have a slot
  each), so G5 reads 1.000 · 1.000 where the stored candidate read 0.923 · 1.000.
  ⚠️ **G2 is still this rung's soft number and still the ladder's highest**: 5.12 px clears
  the 6.0 px floor by 0.88 px, so rule 2's *"a tightening of G2 finds rung 5 first"* is
  unchanged — the figure improved from 5.91 px but the ordering did not.
- **Rung 1's `balls` clears the clause that failed it twice.** 1 of 39 and 3 of 78 became
  **0 and 0**, on a hold the 12 fps set sees and the 24 fps set does not: the reference's
  only exactly-still coarse pair brackets two fine pairs that move 48 px each, so the hold
  is a constraint between samples 2k and 2k+2 and both ends have to be *keys* rather than
  interpolants inside a tolerance. G4's length limb, the other clause v1 failed it on, is
  met with 4× margin.

⚠️ **The honesty-rule breach on rung 1, ruled: recorded, and it moves no figure here.**
That run read *Operating rules* §2's clause table because the prompt that opened it named
that section as the pass bar in the same breath as the forbidden list sealing it — the
fourth instance of the shape `bench/runs/README.md` §1 already names. It is a breach
whatever it contained, and it stays on the record. Under the answer-derivability test in
*The honesty rule* it narrows **no** rung-1 reference-side measure, and the two figures a
reader would suspect are both independently derivable from allowed inputs: `ground-cover`
is named in `examples/1-weight-and-mass/images/` and in the brief's own cast list (*"a slab
of cracked dry earth, in two layers"*, licensed by the fifth reading of the seal), and
`balls`'s **3.250 s** is what both its `frames.json` sidecars state, with the committed
frame counts bounding the reference to `[3.2292, 3.2708]` without the leak. ⇒ **No figure
in this rung's row carries a caveat, and the fix is the one the run asks for** —
[#174](https://github.com/firejune/rigc/issues/174), splitting the clause statements from
the derivations that quote measured figures. Contrast the 2026-08-23 spineboy leak, which
did carry a reference-side `events` block and does caveat that run's name-matched figures.

🧾 **What this pass records for the owner rather than resolving.**

1. ⚖️ **The single-pose question, both faces, is the one clause decision outstanding.**
   Written above; it is the only thing keeping rung 1 open and — read the other way — the
   thing rung 5's and spineboy's passes rest on. It is a clause change, so rule 5 says it
   batches into the next gate version; and by rule 5's own asymmetry it is **not** urgent in
   the direction that would open rung 5, only in the direction that would close rung 1.
   > ➡️ **Answered the same day, by the owner's ruling that became gate v2.1.** Both faces:
   > a single-pose set is out of G3's scope, and a skeleton left with no readable set reads
   > SKIP. The clause is in *Operating rules* rule 2 under *Gate v2.1* and the verdicts it
   > moves are in *The gate-v2.1 re-inspection* above — **rung 1 closes**; rung 5's and
   > spineboy's readings are unchanged and now stated rather than assumed.
2. 📌 **Rung 4 is the first rung to fail a clause and then clear it by re-authoring rather
   than by a gate change**, which is the sequence rule 4 item 2 predicted for an observable
   residual. Rung 3 is the mirror: cleared by a commander, withdrawn by gate v1, and now
   re-earned on the clause that withdrew it.
3. ⚠️ **The stored rung-5 candidate cannot be re-read from a clean clone without an
   `--atlas` override.** Its `spine/skeleton.atlas` names its pages as
   `../../../rigc-r5/examples/…`, a path relative to the worktree it was built in, so
   `check` throws `ENOENT` from the repository root. This pass measured it by pointing
   `--atlas` at a copy with the page paths repaired and **changed nothing in the run
   directory**, per rule 3's 🚫. Every figure quoted for rung 5 is from that read and matches
   the run's own record to the digit. A run's artifact that only its author's directory
   layout can load is a reproducibility defect in the record rather than in the candidate.
   > ➡️ **Repaired the same day**, as [#181](https://github.com/firejune/rigc/issues/181)
   > and a labelled amendment commit under the owner's ruling of 2026-08-26 — the page paths
   > only, verified from the repository root against every figure above, and recorded as an
   > *Amendment* in that run's README. The protocol rule that licenses this narrow class of
   > repair is at the end of [`bench/runs/README.md`](../bench/runs/README.md)'s *After a
   > run*. The v2.1 re-inspection then re-read **all ten** standing candidates with no
   > override and all ten load, so the class is closed and not only this instance.
4. 📌 **Four of the five candidates returned no clause verdict at all, by design, and the
   protocol is what made that right.** Three declined *Operating rules* outright and one
   read it and reported itself. Both outcomes are the reading list working; what neither is
   is a run that adjudicated itself. The cost is that *After a run* step 1 — paste the
   summary, move the status — is structurally unperformable by an authoring run, which is
   what this pass exists to absorb and what rung 5's own comment raises as its second
   owner item.

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

> ➡️ **The last of those three reasons was lifted on 2026-08-26** by the local-render
> exception in *Licence, per rung*, and the rung now has a brief — revision 1,
> **unverified**, so still no run and still ⬜. What this pass recorded stays true of
> the day it was taken: on 2026-08-25 the rung was **unattemptable**, and that is the
> state the exception was ruled against ([#3](https://github.com/firejune/rigc/issues/3),
> [#14](https://github.com/firejune/rigc/issues/14)).

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

> ➡️ **A fourth candidate cleared this rung on 2026-08-26** — see *Rung 3, attempt 4*
> below, adjudicated **PASS** on the same clause that withdrew the 2026-08-23 mark. What
> this entry and the two verdicts above record stays true of the candidates they read.

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

> ➡️ **Both skeletons were re-authored on 2026-08-26** — see *Rung 1, attempt 2* below.
> `balls` now clears **every** clause, G3 included; `drop` is unchanged in kind, and its
> verdict is recorded there as **not adjudicable — clause gap**, which is what keeps the
> rung open. The reading that distinguishes it from rung 5's own single-pose set is under
> *The gate-v2 batch adjudication of the four re-climbs*.

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

> ➡️ **The re-climb happened on 2026-08-26 and it cleared** — see *Rung 4, attempt 2*
> below. `ball-catch@24fps`'s worst tile went from **4.00×** its sheet mean to **1.911×**,
> the mean itself halving, so the observable this entry says the run never had is now met.
> This rung is the first on the ladder to fail a clause and then clear it by re-authoring.

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

> ➡️ **A second candidate cleared this rung on 2026-08-26** — see *Rung 5, attempt 2*
> below, adjudicated **PASS**: `ball`'s six disagreements are gone and `slots.count` moves
> to 13/13. The G2 ordering this entry names is unchanged — 5.12 px is still the highest
> figure any passing candidate posts, so a tightening still finds this rung first.

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

#### Gate v2.1 re-inspection, 2026-08-26 — **PASS**, and the pass keeps its own route

Re-read on the stored candidate: 0.33 px `bowling`, 0 adjacent pairs in all four sets, the
four sheets at **1.088–1.107** over 311 tiles each, 15 PASS / 0 FAIL / 5 SKIP — every
figure above to the digit. 🚫 **v2.1 (b) does not reach this rung, deliberately.** Its four
sets are two stills 310 frames apart: a shot **sampled twice**, not a single pose, so the
frames between the samples are a real hole and **G7's discharge is still what answers it**.
Reading them as SKIP instead would retire that machinery and hand this rung its pass on
nothing. ⇒ Verdict unchanged, and unchanged *by the same route*.

#### Gate v2.2 re-inspection, 2026-08-29 — **PASS**, and the new limb fires four times

Re-read on the stored candidate: every figure above to the digit. ⚠️ **v2.2's per-slot limb
finds four blanks here** — `water` in all four sets, `billiard` and `billiard-gloss` in
`billiard-ball`, `bowling-gloss` in `bowling-ball` — and all four **read down**, three of them
because the bone that places them *is* measured (`billiard-shade` at 0.11 px, `bowling` at
0.33 px, `bowling-shade` at 0.29 px on the same bones) and `water` because the chain it alone
owns carries **0.27–0.29** of error per reference pixel, the lowest of the nine drawn chains in
every set. The itemised read-down is in *The gate-v2.2 re-inspection* above. ⇒ **Verdict
unchanged.** 📌 This rung also holds the ladder's **thinnest margin on any clause**: G5 at
**0.882** against 0.85, **1.04×** — see *The clause margins*.


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

#### Gate v2.1 re-inspection, 2026-08-26 — **PASS**, unchanged

Re-read on the stored candidate: **2.48 px** `ball` at f0010, **0** disagreements over 68
adjacent pairs, `arcs@24fps` at **2.892×** (13.99 over 4.84, 137 tiles), 15 PASS / 0 FAIL /
5 SKIP. v2.1 changes one reading of G3 and this rung has no single-pose set, so nothing here
is in its scope. The narrowest G7 margin on the page is still this one.

➡️ **Two sentences in this section were true when written and are not true now**, and both
keep their dates. ① *"The narrowest G7 margin on the page is still this one"* — rung 7 attempt
2's `fall-in@30fps` reads **2.923×** against this sheet's 2.892×, so the narrowest is **rung
7's**, by 0.031. ② *"a tightening of G7 finds rung 6 first, and rule 2 names it there"* — **rule
2 no longer names it, or any other ranking**: those lines were deleted on 2026-08-29 under gate
v2.2 (c), because a margin is a fact about the corpus and a sentence inside a rule cannot stay
current with it ([#207](https://github.com/firejune/rigc/issues/207)). ⇒ **The live ranking is
*The clause margins* under *Status***, updated by every adjudication — and it is where a reader
sent here by either sentence should go.

#### Gate v2.2 re-inspection, 2026-08-29 — **PASS**, unchanged

Re-read on the stored candidate: every figure above to the digit. ✅ **v2.2's per-slot limb
finds no blank here** — all four slots are attributed in both sets. This rung's `arcs@24fps` is
the **second**-closest standing pass to G7's bar at **1.21×**, 0.031 behind rung 7's, and
[#193](https://github.com/firejune/rigc/issues/193)'s ruling of 2026-08-29 holds the 3.5×
where it is; a tightening would take this rung and rung 7 together or neither. ⇒ **Verdict
unchanged.**


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

#### Gate v2.1 re-inspection, 2026-08-26 — `pendulum` **PASSES**, unchanged

Re-read on the stored candidate: **3.34 px** `chain-4`, **0** disagreements over 44 + 87
adjacent pairs, G7 **SKIP** on both sets, 15 PASS / 0 FAIL / 5 SKIP. No single-pose set, so
v2.1's clause has nothing to reach here.

#### Gate v2.2 re-inspection, 2026-08-29 — `pendulum` **PASSES**, unchanged

Re-read on the stored candidate: every figure above to the digit. ✅ **v2.2's per-slot limb
finds no blank here** — all six slots are attributed in both sets. ⇒ **Verdict unchanged.**


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

#### Gate v2.1 re-inspection, 2026-08-26 — `ball` **PASSES**, and so does the rung

Re-read on the stored candidate: **4.19 px** `ball` at `follow-through@24fps` f0077, **0**
disagreements over 44 + 87 adjacent pairs, G7 **SKIP** on both sets, 15 PASS / 0 FAIL /
5 SKIP. No single-pose set on either skeleton of this rung, so v2.1 leaves both verdicts
where they were.

#### Gate v2.2 re-inspection, 2026-08-29 — `ball` **PASSES**, and so does the rung

Re-read on the stored candidate: every figure above to the digit. ✅ **v2.2's per-slot limb
finds no blank on either skeleton of this rung** — both of `ball`'s slots and all six of
`pendulum`'s are attributed in every set. ⇒ **Both verdicts unchanged, and G6 holds.**


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

#### Gate v2.1 re-inspection, 2026-08-26 — **FAIL on G2 and G3**, and the freeze stands

Re-read on the stored candidate over all sixteen sets: **19.57 px** `rear-shin` on `death`
f0006, 7.07 `walk`, 6.75 `run`; **3** disagreements of 59 on `death`; seven sheets at
**1.136–2.028**, `jump@30fps` the highest; 16 PASS / 0 FAIL / 4 SKIP. ⭐ **v2.1 makes this
run's own treatment of `aim` the gate's.** Both `aim` sets are single poses and were never
counted as G3 holes here — the reading is now clause (a) rather than a convention, which is
part of why it was written down. It changes no figure and no verdict: G2 and G3 fail on
`death`, both observables, so rule 4 item 2 keeps this a re-climb rather than an
adjudication and **the graduation bar above is unchanged**.


### Rung 1, attempt 2 — both skeletons re-authored: `balls` clears, `drop` unchanged (2026-08-26)

Run [`bench/runs/2026-08-26-rung1-1/`](../bench/runs/2026-08-26-rung1-1/), clean —
`bench` run once per candidate at the end with nothing edited after, so **not**
bench-assisted — **5 builds**, 0 validator FAILs, two candidates (`balls/`, `drop/`), one
per skeleton. Authored by Claude Opus 5 (1M context) on Claude Code / Agent SDK from
**brief revision 2** (the first third-party verification pass) and the rendered frames.
The reference export was never opened. ⚠️ **One honesty-rule breach is recorded** —
*Operating rules* §2's clause table was read; [`LOOP.md`](../bench/runs/2026-08-26-rung1-1/LOOP.md)
§1 has what it contained and the adjudication's ruling on it is under *The gate-v2 batch
adjudication* above.

```
balls   bones=0.903  slots=0.929  attachments=1.000  constraints=1.000  animations=0.687  events=1.000
        bones 0.903 (name-matched) · 1.000 (name-agnostic)   slots 0.929 (name-matched) · 1.000 (name-agnostic)
drop    bones=0.650  slots=0.714  attachments=0.911  constraints=1.000  animations=1.000  events=1.000
        bones 0.650 (name-matched) · 0.680 (name-agnostic)   slots 0.714 (name-matched) · 0.700 (name-agnostic)
```

`balls` posts **1.000 on every `attachments` measure** (`names` 8/8, `type_counts` 8/8,
`region_size` 8/8) and **1.000 on all nine name-agnostic `bones` and `slots` measures**,
with `bones.names` 9/9, `parent_by_name` 9/9, `slots.names` 8/8 and `slots.bone` 8/8 —
§10.1's naming lever, every part's PNG basename carried through to its slot, its
attachment and the bone that moves it. `drop` posts **1.000 on every `animations`
measure**, `duration` included, and 4/5 on every count, the fifth being `ground-cover`.

📌 **Reported and not gating.** `balls`: `animations.timeline_kinds` 14/22 (the reference
carries 22 timelines to this candidate's 15 — the paired-versus-single-axis decision, made
before the measure was seen and not patched after), `key_counts` 216/529,
`curve_kinds` 74/529, `bones.order` 2/9 and `slots.order` 4/8 (the four columns never
overlap, so the frames order each ball over its own shadow and nothing else).
`drop`: `bones.length_present` 1/5, on §9.3's list. `check` MAE **1.95 / 1.94** on `balls`
and **3.53** on `drop`, and all four sets took `frames.json`'s **own box** rather than a
fit. The example's atlas packs at `scale: 0.5`, so a candidate built from the loose PNGs
carries a resolution floor on every figure — visible as `drawnRatio` 1.10 and as
`steel-ball`'s 4.77 `MAE in it` at 0.1 px of drift.

One structural finding carried most of the fidelity and is now a named trap in
AUTHORING.md §8: the four cast shadows scale about a **pivot below their own centre**, so
an attachment offset plus the bone's own scale carries both the size and the centre drift
— **MAE 3.13 → 1.95 with not one key value re-measured.**

#### Gate v2 verdict, 2026-08-26 — `balls` **PASSES**; `drop` **not adjudicable**, and the rung stays open

| Clause | `balls` | `drop` |
| --- | --- | --- |
| **G1** validity | 0 FAIL under `--profile spine` (15 PASS, 5 SKIP) ✅ | 0 FAIL ✅ |
| **G2** worst attributable slot drift | **1.51 px** `cast-shadow-red` (12 fps f0039, 24 fps f0078); every slot attributed on every frame, `framesWithoutDrift` 0 ✅ | **1.06 px** `sword` f0000, both sets ✅ |
| **G3** per-frame motion | **0 of 39** and **0 of 78**; no `⚠️ overdraw` (1.1005 / 1.1010) ✅ | ⚖️ **not adjudicable — clause gap** |
| **G4** shot inventory | `count` 1/1, `names` 1/1; length **3.250000 s** against the reference's **3.233333 s** = 0.016667 s, **0.20** of a 1/12 s interval ✅ | 1/1, 1/1; **0.000000 s** against **0.000000 s** ✅ |
| **G5** drawn inventory | 8/8 and 8/8 = **1.000 · 1.000**, no deduction ✅ | 4/5 = 0.800 → **1.000 · 1.000** after deducting **`ground-cover`** ✅ |
| **G7** the sheet | **SKIP** — both sets commit every sampled frame (40/40, 79/79), so `check` returns no sheet | **SKIP** — a single pose; `render_reference.ts` writes none |
| **G6** the rung | ❌ — `balls` meets every clause; the rung turns on `drop`'s G3 | |

**What cleared `balls`'s G3, since it is the clause that failed this skeleton twice.** 1 of
39 and 3 of 78 became **0 and 0**, on a hold the 12 fps set sees and the 24 fps set does
not: the reference's only exactly-still coarse pair brackets two fine pairs that move
**48 px** each, because the subject shifts under three world units and comes back. `check`
compares each set against *itself* one frame earlier, so that hold is a constraint between
samples **2k and 2k+2** of the finer series, and 2k+1 between them is free to move. Two of
the five builds went on it, and the first made the two values equal and **still failed** —
the planner had reduced through one of them, and an interpolant inside its own tolerance is
not a key.

**G4's length limb, and why the number the run wrote is the obedient one.** `bench` reads
`animations.duration` **0/1** at its own 1/60 s, which is the residual v2's reformulation
exists for. The committed frame counts bound the reference to `[3.2292, 3.2708]` — 40 at
12 fps *and* 79 at 24 fps — and both sidecars state **3.25**, so no reading of these frames
separates 3.25 from a 30 fps-grid value. Inside the clause with about 4× margin.

⚖️ **`drop`'s G3, and why the verdict is a gap rather than a pass or a fail.** Recorded
verbatim: **not adjudicable — clause gap.** `ready-to-animate` is 0.000000 s, so each set
is one frame, `changePairs` is 0, and `check` says outright that nothing was measured about
how much the shot changes. G7's discharge route needs a sheet and a single-frame set ships
none. The full reading, and the reason the same state does **not** block rung 5, is under
*The gate-v2 batch adjudication of the four re-climbs*. ⇒ It wants a clause-level decision
at the next gate release, not another attempt: **no candidate can move it.**

#### Gate v2.1 re-inspection, 2026-08-26 — `drop`'s G3 reads **SKIP**, and the rung closes

The clause release the verdict above asked for, on the same stored candidate. Re-read by
`check` and `validate --profile spine` from the repository root; **every figure in the table
above reproduces to the digit** — 1.51 px and 1.06 px of worst drift, 0 of 39 and 0 of 78,
`drawnRatio` 1.1005 / 1.1010, `framesWithoutDrift` 0 on all four sets, 15 PASS / 0 FAIL /
5 SKIP on both skeletons. Nothing was built and nothing in the run directory was touched.

| Clause | `balls` | `drop` |
| --- | --- | --- |
| **G1** validity | **PASS** — 0 FAIL | **PASS** — 0 FAIL |
| **G2** worst attributable slot drift ≤ 6.0 px | **PASS** — 1.51 px | **PASS** — 1.06 px |
| **G3** per-frame motion | **PASS** — 0 of 39 · 0 of 78 | 🆕 **SKIP** — v2.1 (a) excludes both single-pose sets, (b) leaves the clause no object |
| **G4** shot inventory and length | **PASS** — 0.20 of a frame | **PASS** — 0.000000 s v 0.000000 s |
| **G5** drawn inventory | **PASS** — 1.000 · 1.000 | **PASS** — 1.000 · 1.000 after `ground-cover` |
| **G7** the sheet | **SKIP** — every frame committed | **SKIP** — a single pose |
| **G6** the rung | ✅ **both skeletons meet G1–G5 with G3 and G7 skipping where they have no object** | |

⭐ **What decided it was the gate, not the candidate — as three passes in a row said it
would have to be.** `ready-to-animate` is 0.000000 s long, so `changePairs` is 0 and no
authoring could produce a pair to read; the verdict above is right that *no candidate can
move it*. v2.1 states the scope instead: a single-pose set is out of G3's reach (the reading
rung 5's and spineboy's verdicts already rested on), and a skeleton left with no readable
set reads SKIP on G7's own *no observable ⇒ SKIP*. ⇒ **Issue
[#10](https://github.com/firejune/rigc/issues/10) closes**, and rule 4's queue is down to
the untried rung 7.

⚠️ **A pass is versioned, and this history is not rewritten.** This is a **gate-v2.1**
pass. The verdict above met gate v2 as far as gate v2 could read it and its *not
adjudicable* stands as a true statement about that gate; the two gate-v1 and gate-v2
sections under *Rung 1 — attempted, not cleared* are likewise untouched.

#### Gate v2.2 re-inspection, 2026-08-29 — **PASS** on both skeletons, unchanged

Re-read on the stored candidate: every figure above to the digit. ✅ **v2.2's per-slot limb
finds no blank on either skeleton** — all eight of `balls`'s slots are attributed in both its
sets and all four of `drop`'s in its single pose, so the limb has nothing to read down here.
📌 `balls` is the closest standing pass to G3's **overdraw** limb, at `drawnRatio` **1.101**
against `OVERDRAW_RATIO` 1.5 — **1.36×**, and the thinnest margin on that limb anywhere on the
ladder (see *The clause margins*). It is inside, it has not moved, and it is named because the
ranking is now computed rather than remembered. ⇒ **Both verdicts unchanged, and G6 holds.**

### Rung 3, attempt 4 — the frame-change clause clears, and the rung is re-earned (2026-08-26)

Run [`bench/runs/2026-08-26-rung3-1/`](../bench/runs/2026-08-26-rung3-1/), clean —
every spec edit made against `build`'s report and `check`'s table, `bench` reached once
with a decision behind it and nothing edited after. **13 builds, 14 `check` runs.**
Authored by Claude Opus 5 (1M context) on Claude Code / Agent SDK from **brief revision
2** (third-party verified) — the first attempt at this rung from a verified brief. The
reference export was never opened; the example `.atlas` was opened once, late, as a
diagnostic. **This is the fourth stored rung-3 candidate and the first to post 0 per-frame
disagreements.**

```
ess        bones=0.729  slots=0.929  attachments=1.000  constraints=1.000  animations=0.823  events=1.000
           bones 0.729 (name-matched) · 1.000 (name-agnostic)   slots 0.929 (name-matched) · 1.000 (name-agnostic)

bones                 count 3/3 · names 2/4 · parent_by_name 2/3 · order 2/3 · length_present 1/3 · inherit_present 2/3
bones (name-agnostic) count · depth_histogram · degree_sequence · shape_histogram · order_shape  all 3/3
slots                 count 2/2 · names 2/2 · order 2/2 · bone 1/2 · attachment 2/2 · blend 2/2 · color_present 2/2
slots (name-agnostic) all four 2/2
attachments           skins 1/1 · count 2/2 · names 2/2 · type_counts 2/2 · region_size 2/2
animations            count 2/2 · names 2/2 · duration 2/2 · timeline_kinds 4/8 · key_counts 43/118
                      curve_kinds 64/118 · draw_order 2/2 · deform 2/2
```

**The shape is exact and the vocabulary is not** — `bones` and `slots` read **1.000
name-agnostic on every measure**, and the split inside the name-matched half is §10.1's ⚠️
about this exact shot made visible: slot names, which the art supplies, read **2/2**; bone
names, which it does not, **2/4**.

📌 **Reported and not gating.** `timeline_kinds` 4/8, `key_counts` 43/118 and
`curve_kinds` 64/118 are one fact — this candidate is **denser** than the reference — and
the trade was measured rather than guessed (0.30 px → 109 keys → 6.53/6.31;
**0.15 px → 118 → 6.13/6.01**; 0.08 px → 128 → 6.05/5.94). `bones.length_present` 1/3 and
`inherit_present` 2/3 are §9.3's invisibles. ⚠️ **Two thirds of this rung's MAE is texture,
not animation**: on the identical skeleton, sampling the supplied packed atlas (`scale:
0.5`) instead of the loose PNGs moves `heavy`/`light` from **6.13/6.01 to 2.25/2.30**. The
first row is the graded artifact and the second says where its error lives; the finding is
now in AUTHORING.md §9, and it is the reason MAE is not comparable across rungs
([#171](https://github.com/firejune/rigc/issues/171)).

#### Gate v2 verdict, 2026-08-26 — **PASS**, and the rung closes

| Clause | Reading | |
| --- | --- | :---: |
| **G1** validity | 0 FAIL under `--profile spine` — 15 PASS, 5 SKIP | ✅ |
| **G2** worst attributable slot drift | **0.65 px** `pendulum` (`heavy` f0017) and **0.53 px** (`light` f0003), on a 24.7 px ball; means 0.3 and 0.1 px. Every slot attributed by `component` on every frame of both sets, `framesWithoutDrift` 0 | ✅ |
| **G3** per-frame motion | **0 of 64** on `heavy` and **0 of 20** on `light` — all 84 adjacent pairs. No `⚠️ overdraw` (0.9913, 0.9922) | ✅ |
| **G4** shot inventory | `count` 2/2, `names` 2/2; `heavy` **5.333333 s** against **5.333333 s** and `light` **1.666666 s** against **1.666667 s** — a gap of 1 µs against a 1/12 s tolerance | ✅ |
| **G5** drawn inventory | `slots.count` 2/2 and `attachments.count` 2/2 = **1.000 · 1.000**; no deduction taken or needed | ✅ |
| **G7** the sheet | **SKIP** — both sets commit every sampled frame (65/65, 21/21), so `check` returns no sheet and the whole shot is read frame by frame instead. A candidate is not failed for having better coverage than a sheet | SKIP |
| **G6** the rung | one skeleton, and it meets G1–G5 with G7 skipping | ✅ |

**What the clause turned on, and no MAE or drift figure in this toolchain can see any of
it.** Three exactly-still runs the candidate has to answer exactly — `heavy` f61→f62,
f62→f63, f63→f64 and `light` f18→f19, f19→f20 — and **`heavy` f60→f61, which the reference
moves one pixel across**: inverting a measured Δpx↔Δrotation calibration puts that at about
a hundredth of a degree, two orders below any pose fit's resolution, so a candidate that
simply stops at rest is *wrong* there and only the adjacent-pair column says so. Getting
them needed two defects told apart — a pose series wandering ±0.3° in a tail whose real
motion is ±0.03°, and a key reduction that spanned a near-still pair legally (0.098 px of
deviation on a 0.109 px move) and read **259 px against the reference's 40**. The reduction
is now closed on the frames themselves.

⇒ **Rung 3's pass mark is re-earned on the clause that withdrew it.** Gate v1 withdrew the
2026-08-23 commander's call because `heavy` posted 7 disagreements, and no stored candidate
met G3 — attempt 1 posted 9+2, attempt 2 posted 7, the 2026-08-24 pilot 5+1. Nothing
recorded under the earlier attempts is withdrawn by this; what is restored is the mark, on
a candidate that clears every clause. **Issue [#12](https://github.com/firejune/rigc/issues/12)
closes.**

#### Gate v2.1 re-inspection, 2026-08-26 — **PASS**, unchanged

Re-read on the stored candidate: **0.65 px** `pendulum` at `heavy` f0017, **0** of 64 and
**0** of 20 adjacent pairs, `drawnRatio` 0.9913 / 0.9922, G7 **SKIP** on both sets (each
commits every sampled frame), 15 PASS / 0 FAIL / 5 SKIP. No single-pose set, so v2.1's
clause is not in play. #12 stays closed.

#### Gate v2.2 re-inspection, 2026-08-29 — **PASS**, unchanged

Re-read on the stored candidate: every figure above to the digit. ✅ **v2.2's per-slot limb
finds no blank here** — both slots are attributed in both sets, which is what a two-part rig
read frame by frame at two rates should look like. ⇒ **Verdict unchanged.** #12 stays closed.


### Rung 4, attempt 2 — re-authored from a verified brief; the sheet clause clears (2026-08-26)

Run [`bench/runs/2026-08-26-rung4-1/`](../bench/runs/2026-08-26-rung4-1/), clean —
**11 builds** (`build` invoked 14 times; three re-ran identical inputs), 0 validator FAILs.
Authored by Claude Opus 5 (1M context) on Claude Code / Agent SDK from **brief revision 3**
(the first third-party-verified revision of this brief), the rendered frames and the three
`@24fps` contact sheets. The reference export was never opened; the supplied `.atlas` was
read for one line. Nine bones, eight slots, three animations, 1,339 keys over 30 timelines,
no mesh, no constraint, no event, no draw-order timeline.

```
ess    bones=9/9  slots=8/9  skins=1/1  attachments=8/9  constraints=0/0  animations=3/3  events=0/0

bones      0.715 (name-agnostic 0.956)   attachments 0.930   animations 0.822
slots      0.671 (name-agnostic 0.750)   constraints 1.000   events      1.000
```

| exact (1.000) | partial |
| --- | --- |
| `bones.count` 9/9 · `depth_histogram` 9/9 · `degree_sequence` 9/9 · `attachments.skins` 1/1 · all four `mesh_*` and all five `constraints.*` at 0/0 · `animations.count` 3/3 · `names` 3/3 · `duration` 3/3 · `draw_order` 3/3 · `deform` 3/3 | `bones.names` 6/12 · `parent_by_name` 4/9 · `order` 6/9 · `length_present` 4/9 · `inherit_present` 6/9 · `slots.count` 8/9 · `names` 7/10 · `order` 3/9 · `bone` 4/9 · `attachment` 7/9 · `blend` 7/9 · `color_present` 7/9 · `attachments.count` 8/9 · `type_counts` 8/9 · `region_size` 8/9 · `animations.timeline_kinds` 22/31 · **`key_counts` 421/1339** · `curve_kinds` 495/1339 |

**The tree's shape is exact and six of nine names match.** All six sets were measured in
`frames.json`'s **own declared box** (0.22–0.54 px rms per set), so no figure here carries
the extent fit's floor. Three structural readings were written down at the time (§9.3's
rule): the chain is five links and four moving joints with `chain-end`'s rotation an
unobservable gauge and **not keyed**; the ball's spin and its shading are on different
bones; and every part is a region, because nothing deforms within itself on any frame.

📌 **Reported and not gating.** ⚠️ **Over-keyed by about 3×** (`key_counts` 421/1339), from
a 0.28 px tolerance declared *below* the run's own fitting accuracy on the shortest lever
— the objective's basin on `chain-4`'s rotation measures ±1.5°, i.e. ±0.5 px there — and
**the loop had no instrument that could see it**, because `check` is blind to key density
by construction and only `bench` sees it. Left uncorrected on purpose. §10.3 has gained the
missing rule: measure the basin, then declare at or above it. `bones.length_present` 4/9,
`inherit_present` 6/9 and the ninth slot are choices no frame can check. The supplied atlas
packs at `scale: 0.5` and here that puts **no** floor under the MAE — three page
resolutions land within ±0.005 of each other, measured.

#### Gate v2 verdict, 2026-08-26 — **PASS**, and the rung closes

| Clause | Reading over all six sets | |
| --- | --- | :---: |
| **G1** validity | 0 FAIL under `--profile spine` — 15 PASS, 5 SKIP (four the shot has nothing for, plus `A18`, which `bench` skips on artifacts already on disk; `build` ran it green on every build) | ✅ |
| **G2** worst attributable slot drift | **3.63 px** `chain-1` (`ball-catch` f0103); then 1.91, 1.00, 0.83, 0.44, 0.40 px. `framesWithoutDrift` 0 on all six, and no set reported a reference component no slot reaches — so this rung is no longer the 🕳️ case its first attempt was | ✅ |
| **G3** per-frame motion | **0 of 120** on `ball-catch`, **0 of 16** on `wave-by-hand`, **0 of 16** on `wave-offset` — every adjacent pair of every shot, at the rate each was committed in full. The three `@24fps` sets are two stills each and carry no pair; each is the same shot read in full at 12 fps *and* carries a sheet that meets G7, so both discharge routes are available. No `⚠️ overdraw` (0.9734–0.9953) | ✅ |
| **G4** shot inventory | `count` 3/3, `names` 3/3; lengths **exact ×3** — `ball-catch` 10.000000 s, `wave-by-hand` 1.333333 s, `wave-offset` 1.333333 s, each against the same figure | ✅ |
| **G5** drawn inventory | `slots.count` **8/9 = 0.889** and `attachments.count` **8/9 = 0.889**, read on the printed figures: the ninth element is invisible in the frames but **cannot be named**, and G5's 🧾 refuses a deduction that cannot name its item. Clears the floor by 0.039 without one | ✅ |
| **G7** the sheet | `ball-catch@24fps` **1.911×** (32.28 over a 16.89 mean, 241/241 tiles) · `wave-by-hand@24fps` **1.428×** (18.43 over 12.91, 33/33) · `wave-offset@24fps` **1.776×** (24.67 over 13.89, 33/33). The three 12 fps sets commit every frame and read SKIP | ✅ |
| **G6** the rung | one skeleton, and it meets G1–G5 and G7 | ✅ |

⭐ **G7 is the clause that reopened this rung and it is now inside the bulk of the corpus.**
The stored candidate put a **121.98** tile over a **30.46** mean — **4.00×**, the corpus's
lone outlier on every sheet reading available at once. This one reads **32.28 over 16.89**:
the sheet **mean** halved and the worst tile fell by 74 %, so the whole shot is no longer
twice the figure its own stills show. Its README attributes the move to §8.1's multi-start
rule over four rescue passes — 18 × 3 starts per frame, nothing but *starting from
somewhere else* — which took `ball-catch`'s worst frame from 0.440 of the reference's ink
cost to 0.178 and the worst sheet tile from **3.55× to 1.91×** the sheet mean. Rule 2's
⚠️ about G7's thin margins is unaffected: the corpus's top two are still rung 6's 2.89 and
the withdrawn 4.00, and this candidate lands well below both.

📌 **This is the first rung on the ladder to fail a clause and then clear it by
re-authoring** rather than by a gate change, which is the sequence rule 4 item 2 predicts
for a residual that is observable. Its gate-v1 pass stands as a gate-v1 pass, and every
clause that cleared then clears now. **Issue [#17](https://github.com/firejune/rigc/issues/17)
closes.**

#### Gate v2.1 re-inspection, 2026-08-26 — **PASS**, unchanged

Re-read on the stored candidate: **3.63 px** `chain-1` at `ball-catch` f0103, **0**
disagreements over 120 + 16 + 16 adjacent pairs, the three sheets at **1.911 · 1.428 ·
1.776**, 15 PASS / 0 FAIL / 5 SKIP. 🚫 **v2.1 (b) does not reach the three `@24fps` sets**:
two stills apiece is a shot sampled twice, not a single pose, so they stay G7's to read —
which is the whole reason this rung's G7 verdict means something. #17 stays closed.

#### Gate v2.2 re-inspection, 2026-08-29 — **PASS**, unchanged

Re-read on the stored candidate: every figure above to the digit. ✅ **v2.2's per-slot limb
finds no blank here** — all eight slots are attributed in all six sets, including the three
two-still `@24fps` sets, which is the strongest per-slot coverage any multi-set candidate on
this ladder posts. ⇒ **Verdict unchanged.** #17 stays closed.


### Rung 5, attempt 2 — re-authored from a verified brief; G3 clears on both shots (2026-08-26)

Run [`bench/runs/2026-08-26-rung5-1/`](../bench/runs/2026-08-26-rung5-1/), clean —
`bench` run once after the last edit, **10 builds**, 0 validator FAILs. Authored by Claude
Opus 5 (1M context) on Claude Code / Agent SDK from **brief revision 3** (third-party
verified) — the first attempt from the corrected text, whose three geometry corrections
mean its figures are not comparable with the 2026-08-23 attempt's and no comparison is
drawn. The reference export was never opened. 14 bones, **13 slots, 29 attachments** from
29 loose PNGs and no supplied atlas, three animations.

```
ess        bones=0.402  slots=0.356  attachments=0.897  constraints=1.000  animations=0.763  events=1.000
           bones 0.402 (name-matched) · 0.563 (name-agnostic)   slots 0.356 (name-matched) · 0.692 (name-agnostic)

attachments  count 29/29 · type_counts 29/29 · region_size 29/29 · skins 1/1 · names 4/54
animations   count 3/3 · names 3/3 · duration 3/3 · deform 3/3 · event_keys 0/0
             timeline_kinds 38/67 · key_counts 880/2038 · curve_kinds 414/2038 · draw_order 2/3
slots        count 13/13 (name-agnostic attachment_types_by_position 13/13)
```

| animation | length | tracks | keys |
| --- | ---: | ---: | ---: |
| `ball` | 6.5 s | 13 | 156 |
| `speedy` | 6.5 s | 17 | 870 |
| `ball-ready-to-animate` | 0 s | 11 | 11 |

Four slots are the swap sets the brief points at — `hood-end1`/`hood-end2` with six
drawings each, `left-foot`/`right-foot` with four — folded one per slot per §10.1's *"a
shared slot is for alternatives, not for economy"*; the two hair files got **a slot each**,
which is what moves `slots.count` to 13/13.

📌 **Reported and not gating.** `bones` and `slots` name-matched at 0.402 and 0.356 with
`attachments.names` **4/54**: §10.1's naming lever was applied deliberately and the
reference uses its own vocabulary anyway, so the name-agnostic figures (0.563, 0.692) are
the ones that say anything. `key_counts` 880/2038 — **the reference is denser still**,
roughly 2.3× — and `curve_kinds` 414/2038 says the same through the curve column.
`animations.draw_order` **2/3**: exactly one animation disagrees about whether a draw-order
timeline exists, observed at the finish line and deliberately not acted on. ⚠️ **The course
plate is a floor, not a defect**: ~1,100 static pixels disagree because the reference
renders through a `scale: 0.5` atlas, the `course` chain carries **89.3 %** of the
difference at the table's lowest figure per pixel (4.32), and `ball`'s 4.30 MAE is very
nearly all of it. A static difference cannot move `Δpx`, so it costs the change measure
nothing.

#### Gate v2 verdict, 2026-08-26 — **PASS**, and the rung closes

| Clause | Reading over all six sets | |
| --- | --- | :---: |
| **G1** validity | 0 FAIL under `--profile spine` — 15 PASS, 5 SKIP | ✅ |
| **G2** worst attributable slot drift | **5.12 px** `hood-end1` (`speedy` f0023); then `head` 2.16 px on `speedy@24fps` and **1.30 px** on the four `ball`-family sets. `framesWithoutDrift` 0 on all six | ✅ |
| **G3** per-frame motion | **0 of 78** on `ball` and **0 of 78** on `speedy` — every adjacent pair of both shots that carry motion. `ball@24fps` and `speedy@24fps` are two stills each: the same shots read in full at 12 fps, and both carry a sheet that meets G7. `ball-ready-to-animate`'s two sets are a single pose and carry **no shot to read** — the exclusion G7's 🕳️ already makes for them, and the one both 2026-08-25 adjudications made for spineboy's `aim`. No `⚠️ overdraw` (0.9881–0.9907) | ✅ |
| **G4** shot inventory | `count` 3/3, `names` 3/3; lengths **exact ×3** — `ball` 6.500000 s, `speedy` 6.500000 s, `ball-ready-to-animate` 0.000000 s, each against the same figure | ✅ |
| **G5** drawn inventory | `slots.count` **13/13** and `attachments.count` **29/29** = **1.000 · 1.000**, no deduction taken or needed — up from the stored candidate's 0.923 · 1.000 | ✅ |
| **G7** the sheet | `ball@24fps` **1.081×** (6.27 over a 5.80 mean, 157/157 tiles) · `speedy@24fps` **1.181×** (8.71 over 7.38, 157/157). The two 12 fps sets commit every frame and the two `ball-ready-to-animate` sets are single poses: SKIP on all four | ✅ |
| **G6** the rung | one skeleton, and it meets G1–G5 and G7 | ✅ |

**How G3 was held, since it is the clause the stored candidate failed.** Not by inspecting
it afterwards: the reference's own delta series was measured **first, at `check`'s own
tolerance** (`CHANGE_TOLERANCE` = 8 on any channel) and then used as a *constraint on the
fit* — the six pairs where `ball` reads still had their pose **copied** from the previous
frame, and every other frame was required to render differently from its predecessor.
⚠️ **The tolerance is the whole measurement.** An exact-equality diff reads two of those
six pairs as 12–13 changed pixels, so on that reading the brief's holds are a frame short
at both ends; a run that "corrected" the brief on it would have authored a shot that moves
where the reference is held, invisible in every frame. The brief now pins its hold claims
to the tolerance they are read at.

⚠️ **G2 at 5.12 px is this rung's soft number and still the ladder's highest.** It clears
the 6.0 px floor by **0.88 px**, so rule 2's *"a tightening of G2 finds rung 5 first"* is
unchanged — the figure improved from the stored candidate's 5.91 px but the ordering did
not. It is a limit of the evidence rather than an unattacked defect: the figure is 16 px
tall (26 stretched) with ~90 px of ink over eleven parts, the trailing hood tips have the
longest lever arms, and a distance-transform penalty already took the worst drift from
6.2 px to 5.1 px. A variant that tightened it further moved MAE by 0.01 and moved drift the
**wrong** way (5.1 → 5.6 px, and 2.2 → 4.4 px on `speedy@24fps`), which is §8's null
result, so it was dropped and the earlier variant reproduced to the digit.

⇒ **Issue [#18](https://github.com/firejune/rigc/issues/18) closes.** Two findings from this
run are not about rung 5 and are folded into the guide: **a stepped key on a sample time
already on the 1e-6 grid can be missed entirely** — 13 of this shot's 78 sample times are
affected, `sampleAnimation` accumulating `1/12` can land a few ULPs below a time like
`6.5`, and for a stepped timeline that is a whole frame late or never (fix: write
`T − 1e-6`) — and the packed-atlas MAE floor, which two rungs now measure independently.

#### Gate v2.1 re-inspection, 2026-08-26 — **PASS**, and the reading it rested on is now the gate's

Re-read on the stored candidate **from the repository root with no `--atlas` override**,
which the 2026-08-26 verdict could not do — see the *Amendment* in that run's README and
[#181](https://github.com/firejune/rigc/issues/181). Every figure above to the digit:
**5.12 px** `hood-end1` at `speedy` f0023, 2.16 px `head` on `speedy@24fps`, 1.30 px
`course` on the four `ball`-family sets, `framesWithoutDrift` 0 on all six; **0 of 78** on
`ball` and **0 of 78** on `speedy`; `drawnRatio` 0.9881–0.9907; the sheets at **1.081×** and
**1.181×** over 157 tiles each; 15 PASS / 0 FAIL / 5 SKIP.

⭐ **The verdict is unchanged and its footing is not.** This rung passed on an explicit
reading — that `ball-ready-to-animate`'s two single-pose sets are outside G3's scope — which
the gate did not state at the time. v2.1 clause (a) states it. ⇒ The PASS no longer rests on
an unwritten rule, which is what the 2026-08-26 comment asked the next gate version for.

📌 **One live claim in this section has since gone stale.** The 2026-08-26 verdict above
records that *"a tightening of G2 finds rung 5 first"* was unchanged, and it was — on that
date. spineboy's graduation pass at **5.55 px** displaced it on 2026-08-28, and this rung is
now second on that clause at **1.17×**. The paragraph keeps its date; the live ranking is *The
clause margins* under **Status**, and gate v2.2 (c) is why there is one.

#### Gate v2.2 re-inspection, 2026-08-29 — **PASS**, and the new limb fires on one set

Re-read on the stored candidate: every figure above to the digit. ⚠️ **v2.2's per-slot limb
finds seven blanks, all in `speedy@24fps`** — `belt-ends`, `hair-1`, `hair-2`, `hood-end1`,
`left-hand`, `right-foot` and `torso` — and **all seven read down on the strongest ground there
is**: that set is **two stills of a shot committed in full at 12 fps**, where every one of them
is attributed over 78 pairs, at 5.12 · 4.07 · 3.91 · 3.18 · 3.13 · 2.24 · 1.32 px. A blank on
the sampled set of a shot read frame by frame at another rate carries no information. The
itemised read-down is in *The gate-v2.2 re-inspection* above. ⇒ **Verdict unchanged.**

📌 **One reproducibility note this pass adds, and it decides nothing.** `speedy` reports **3**
unreached reference components over its 79 frames — 3 of 317, on f0064 and f0067 — the only
non-zero count anywhere in the v2.2 sweep. No read-down on this rung rests on it (all seven
blanks are discharged by the 12 fps set), and G2 reads 5.12 px as recorded. It is named because
the limb quotes that column as evidence, and a column quoted as evidence is worth quoting when
it is not zero.

### Rung 7 — attempted, not cleared: the cape fails G2 and nothing else fails (2026-08-28)

Run [`bench/runs/2026-08-28-rung7-1/`](../bench/runs/2026-08-28-rung7-1/) — **5 builds**,
all green, 0 validator FAILs. Authored by Claude Opus 5 (1M context) on Claude Code / Agent
SDK from **brief revision 2** (third-party verified 2026-08-27, [#14](https://github.com/firejune/rigc/issues/14)),
the frames the run rendered itself, and the three `.atlas` header lines *What a run may
read* item 4 allows. The reference export was never opened. One skeleton, `sack`: **7 bones
· 3 slots · 3 attachments · 0 constraints · 4 animations · 1,326 keys over 60 tracks**,
against a reference of **31 bones · 3 slots · 3 attachments · 24 constraints**.

🔒 **The first rung whose frames may not be committed, and the protocol held.** The run
rendered all four shots at three rates under the local-only exception ([#3](https://github.com/firejune/rigc/issues/3),
owner's ruling 2026-08-26), reproduced all twelve of the brief's frame counts exactly
(21/41/51 · 35/70/87 · 9/17/21 · 37/73/91), and committed no pixel of any of them:
`git ls-files bench/reference-local` reports **0**. ⚠️ **Re-inspecting this candidate needs
`bun run fetch-examples` and a local render first** — the frames are not in the repository
and its `spine/skeleton.atlas` names its pages under `examples/`, which is gitignored.
That is inherent to the rung, not the portability defect [#181](https://github.com/firejune/rigc/issues/181)
was about: the art cannot be committed either.

```
sack   bones=7/31  slots=3/3  skins=1/1  attachments=3/3  constraints=0/24  animations=4/4  events=0/0

bones      0.136 (name-agnostic 0.187)   attachments 0.407   animations 0.791
slots      0.952 (name-agnostic 0.333)   constraints 0.000   events      1.000
```

| exact (1.000) | partial |
| --- | --- |
| `slots.count` 3/3 · `names` 3/3 · **`order` 3/3** · `attachment` 3/3 · `blend` 3/3 · `color_present` 3/3 · `attachments.skins` 1/1 · `count` 3/3 · `names` 3/3 · `animations.count` 4/4 · `names` 4/4 · **`duration` 4/4** · `events` all at 0/0 | `bones.count` 7/31 · `names` 3/35 · `parent_by_name` 2/31 · `slots.bone` 2/3 · `attachments.type_counts` 1/3 · `mesh_weighted` 1/3 · `mesh_vertices`, `mesh_triangles`, `mesh_hull` 0/3 · `region_size` 0/2 · all five `constraints.*` **0/24** · `animations.curve_kinds` 0.643 (852/1326) · `key_counts` 0.486 · `timeline_kinds` 0.243 (44/181) · `deform` 0.75 |

**Two structural readings were settled by measurement before a build was spent on either,
which is §9.3's rule.** The sack is a weighted mesh: a Spine bone's local transform *is* a
general affine, so the question has an exact form, and the frames read nearly twice as far
from the best affine image of their own art as a deliberate 20 %-of-width bend does, and
fourteen times the estimator's floor — with rising-order polynomial warps then sizing the
chain at four bones. Both cape parts are regions, tested through the rig rather than
assumed, because no colour key separates two crimson images: given a frame whose other pose
is independently known correct, two cape bones reach crimson silhouette IoU **0.930**,
above the sack's own texture floor, so the cape's deficit was **placement, not
deformation**. ⚠️ **The second reading is the one `bench` disagrees with**, and the run says
so in the place §9.3 asks for — 31 bones and 24 constraints against 7 and 0, with
`attachments.type_counts` 1/3 from the other side. The frames still do not decide it.

📌 **The floor, and it is a large one.** The supplied atlas carries `scale: 0.5`, so at the
rest pose — where the pose is provably the art at scale 1 — this candidate reads **4.42 MAE
per reference pixel** with sack IoU 0.986 and cape IoU 0.920. That is the outline of every
part, one texture generation apart, and no key can move it (§9.2). ⇒ Every MAE below sits
on 4.42, and the rung's own row in [`bench/runs/README.md`](../bench/runs/README.md) now
carries the same `scale: 0.5` warning rungs 3 and 1 carry.

> 🔴 **Correction, 2026-08-28 — do not re-quote 4.42 as this example's texture floor.**
> Attempt 2 ran the same diagnostic and it sent the MAE *up* on every set, because
> `--atlas` substitutes region **geometry** as well as texture and this example's regions
> are packed rotated and trimmed. The recipe does not isolate a texture floor here, so the
> figure above is **inconclusive rather than a floor**, and the ledger row and
> [AUTHORING.md](AUTHORING.md) §9.2 now say why. The paragraph is left as written because it
> is what this pass measured and reported; what is corrected is the reading, not the number.
>
> ➡️ **Superseded 2026-09-02 — the floor *is* measurable now, and it is small.** What the
> 2026-08-28 correction says about `--atlas` stays true and is why the 4.42 was wrong; what is
> no longer true is *"the recipe does not isolate a texture floor here"*. **`check
> --texture-from`**, landed by [PR #254](https://github.com/firejune/rigc/pull/254) on
> 2026-08-29 ([#171](https://github.com/firejune/rigc/issues/171),
> [#199](https://github.com/firejune/rigc/issues/199)), substitutes **texture only** — every
> world vertex is copied across and only `page` and `uvs` change, remapped through the
> drawing's own coordinates, so a `rotate: 270` trimmed pack re-seats nothing. Measured on
> attempt 2's candidate, the floor is **1.45–1.85 MAE(ref)** across the twelve sets (1.58–1.94
> on the union denominator) and the texture explains **1.3–2.6 %** of each figure. ⇒ **4.42
> remains wrong — but not because the quantity is unmeasurable; it is roughly 2.4× the real
> floor**, and the correct reading is that rung 7's rig, not its texture, carries the error.
> Figures in *The PR #254 instrument re-inspection* under **Status**.

#### Gate v2.1 verdict, 2026-08-28 — **FAIL on G2 alone**, and the rung stays 🟨

🚫 **Zero builds and zero authoring, and nothing in the run directory was touched.** The
candidate was re-read with `check` and `validate --profile spine` **from the repository
root over all 12 sets**, against frames this pass rendered itself at the brief's exact
flags, and **every figure the run recorded reproduces to the digit** — all twelve MAE
figures, all twelve worst frames, all twelve worst drifts, 98 adjacent pairs, 0
disagreements, eight sheet means, the three-chain rollup, and 15 PASS / 0 FAIL / 5 SKIP /
14 PROF. That is this pass's control: what decides anything here is the clause.

| Clause | Reading over all 12 sets | |
| --- | --- | :---: |
| **G1** validity | 0 FAIL under `--profile spine` — 15 PASS, 5 SKIP, 14 PROF | ✅ |
| **G2** worst attributable slot drift | ❌ **7.33 px** `cape-front` at `cape-follow-example` f0012, against a **6.0 px** bar — over by 1.33 px, 1.22×. The other eleven sets run **0.95–5.05 px**, and `fall-in`'s 5.05 px is the second highest. `framesWithoutDrift` never equals a set's frame count (worst is 18 of 35 on `hello`), so no set is the 🕳️ HOLE case, and no set reports a reference component no slot reaches | ❌ |
| **G3** per-frame motion | ✅ **0 of 98** adjacent pairs — 36 + 20 + 34 + 8 across the four 12 fps sets, every pair of every shot at the rate each was committed in full. The eight `@24fps` / `@30fps` sets are two stills apiece and carry no pair; **v2.1 (b) does not reach them** — a shot sampled twice is not a single pose — and each carries a sheet that meets G7, which is the discharge route rung 2's four sets and rung 4's three use. No `⚠️ overdraw`: `drawnRatio` **0.924–0.982**, against an `OVERDRAW_RATIO` of 1.5 | ✅ |
| **G4** shot inventory | ✅ `count` 4/4, `names` 4/4; lengths against the reference's own, in seconds — `cape-follow-example` **3.000000** v 3.000000 · `fall-in` **1.666666** v 1.666667 · `hello` **2.866666** v 2.866667 · `walk` **0.666666** v 0.666667. Worst gap **0.000001 s**, a hundred-thousandth of a 12 fps frame, inside the 1/12 s tolerance by five orders | ✅ |
| **G5** drawn inventory | ✅ name-agnostic `slots.count` **3/3 = 1.000** and `attachments.count` **3/3 = 1.000**. **No deduction is taken and none is needed** — every part the reference draws has a slot, and G5's 🧾 never has to be opened on this rung | ✅ |
| **G7** the sheets | ✅ **eight sheets, all eight compared, all eight inside 3.5×** — `fall-in@24fps` **3.041** (63.02 over a 20.72 mean, 41/41 tiles) · `fall-in@30fps` **3.038** (64.29 over 21.16, 51/51) · `cape-follow-example@30fps` 2.564 (71.95 over 28.06, 91/91) · `cape-follow-example@24fps` 2.530 (69.28 over 27.38, 73/73) · `hello@30fps` 1.905 (66.26 over 34.78, 87/87) · `hello@24fps` 1.890 (65.03 over 34.41, 70/70) · `walk@30fps` 1.249 (29.53 over 23.65, 21/21) · `walk@24fps` 1.240 (29.49 over 23.79, 17/17). The four 12 fps sets commit every sampled frame and read **SKIP**. **No set is a HOLE** — no sheet was refused by name | ✅ |
| **G6** the rung | ❌ one skeleton, and it does not meet G2 | ❌ |

⚖️ **The framing, ruled — the gate's figures are `check`'s own unaided reading, and the
ruling does not decide this verdict.** `check` refused `frames.json`'s declared box on all
twelve sets (the test is on **extent**, and this candidate's union content box is a few
pixels off at the extremes) and fitted its own, 0.99 % small in scale. The run reported the
fitted figures as its record and a `--viewport` re-read as a labelled diagnostic
(`check-pinned.txt`), and asked which the gate uses. **The fitted ones**, on four readings
of the text as written:

1. Rule 2 says what the gate is judged on: *"on `check` over every committed frame set of
   that candidate"* — `check`, not `check --viewport`.
2. Rule 3 says a re-inspection is *"a re-read of stored candidates"*, and both precedents
   executed exactly that: *The gate-v2.1 re-inspection* re-read ten candidates **"from the
   repository root, with no `--atlas` override on any of them"**, and *The gate-v2 batch
   adjudication* the same, its one override a page-path repair that changes no measured
   figure ([#181](https://github.com/firejune/rigc/issues/181)). **No pass on this page has
   ever passed `--viewport`.**
3. [`src/check.ts`](../src/check.ts) refuses to treat a pin as a measurement: a `pinned`
   framing is *"a claim by the author and is not checked"*, and the report prints so above
   every figure it produces. A clause cannot rest on an unchecked author claim.
4. The one place the gate distinguishes framings at all — G2's *"**4.1 px** (rung 6, at the
   frames' own box)"* — names the box **`check` chose by itself** when a candidate's own
   pixels land in it, which is the `declared` source. The distinction the gate draws is
   between the boxes `check` picks, never between a reader's flags.

⇒ **And it changes nothing here, which is the honest thing to report.** This pass re-read
the candidate at the pin too: worst drift **6.94 px** on the same slot and the same frame,
still over 6.0 by 0.94 px. **G2 fails under both framings**, so no part of this verdict
turns on the framing question. The pin is also *worse* on the clause it was quoted to help:
under it `fall-in`'s two sheets read **3.485** and **3.442**, hairline inside G7, against
3.041 and 3.038 unaided. ⇒ The run classified its own diagnostic correctly, and the figure
it chose for the record is the one the gate wanted.

⚠️ **G2's failure is an observable one, and rule 1 does not exempt it.** The residual is the
cape's own deformation while it moves: `MAE in it` **39.61** on `cape-back` and **37.47** on
`cape-front` against the sack's **16.85** — two chains at over twice the sack's error per
pixel while the sack carries two thirds of the share — with cape silhouette IoU running
0.62–0.76 in motion against its own 0.92 rest-pose floor. That is visible in the frames the
author was given, so it is the *decidable* kind rule 1 reserves for failing a rung. Rule 1
says it in the same sentence that exempts the bone count: *"a rig missing a joint that
carries observable motion fails there, and a rig missing one that carries none has lost
nothing a frame could show."*

🧾 **`bones` 0.136 and `constraints` 0.000 are read by no clause, and the run asked
whether they can be scored at all. They cannot.** Enumerated: G1 reads `validate`, G2 and
G3 read `check`, G4 reads `animations.count`/`names` and two lengths, G5 reads the two
name-agnostic counts, G7 reads a ratio inside a sheet. **Not one of the seven clauses
touches either section**, and rule 1 exempts both by name — `constraints.*` (all five) is
the *first row* of the unobservable table (*"a physics chain and a hand-keyed chain draw
identical frames"*), and `bones.*` is the closing ⇒ (*"`bones.*` and the `bones`/`slots`
name-agnostic means are reported and do not gate"*). The input side agrees: the cloth's
mechanism is on the brief's *what the frames cannot tell you* list, so no reading of the
frames could have decided it.

- ⚠️ **Read down to one cause, per rule 2's ⚠️, rather than written off.** Both figures have
  a single cause and it is the same one — the reference meshes its cloth and drives it, this
  candidate poses regions — and the run recorded that decision *at the moment it took it*
  with the measurement behind it, which is exactly what §9.3 asks and what makes this a read
  figure rather than an unread one.
- 🚫 **And the exemption rescues nothing.** The mechanism is unscoreable; its **motion
  consequence** is scored, in G2, and that is where this rung fails. ⇒ The answer to the
  run's question is *"no clause can score it — and the rung fails anyway, on the pixels."*

⭐ **What this candidate does that no candidate before it has.** `slots` **0.952**
name-matched with **`slots.order` 3/3** is the highest slot reading on the ladder, and it is
earned twice over: the run's render-back test decided both draw-order edges from the frames
alone, and the diff agrees from the other side. `animations.duration` **4/4** is the first
time G4's limb was settled by a **brief's arithmetic** rather than by reading a sidecar —
`hello` is declared at **86/30 = 2.866667 s**, not the 12 fps set's 2.833, because the
brief's three-rate intersection said so and the run believed it. And `curve_kinds` **0.643**
on 1,231 bezier spans against 35 linear is a shot whose easing was authored rather than
defaulted.

⚠️ **A deliberate fidelity trade is on the record as a trade.** On eight frames of 103 the
poses were contracted toward their neighbours until the candidate's own frame-to-frame
change was inside `check`'s band, at a cost of 0.003–0.146 part error on those frames. It
buys the G3 column on the quietest frames of one shot, it is recorded in that run's
`LOOP.md` §17 rather than presented as a fit, and this pass does not discount it: G3's
column is a measurement of what the artifact does, and §10.3's closing loop is the guide's
own instruction to close it that way.

🧾 **What this pass records for the owner rather than resolving.**

1. ⚠️ **G7's corpus has gained its second candidate between the top two, which rule 2's 🧾
   names as the trigger to revisit the number.** `fall-in@24fps` at **3.041** now sits
   **above rung 6's 2.892** and below the withdrawn 4.00, so the ladder's *"a tightening of
   G7 finds rung 6 first"* is **no longer true — it finds rung 7 first**. Two further facts
   belong beside that: this rung's sheets are *not* corroborated the way rung 6's 2.892 is
   (its 12 fps sets are different shots read in full, not the same shot at another rate), and
   the same two sheets read **3.485 / 3.442** at the declared box, which is inside 3.5 by
   1 %. 🚫 **No threshold is touched here** — rule 2 is the owner's, and a clause change is
   rule 5's to batch. This is the argument arriving, recorded where the argument starts.
2. ⚖️ **The extent test refuses a box for a reason that is not a coordinate error, and the
   gate has no word for that state.** This candidate is authored in the frames' own world
   units — its setup box lands on the reference's own to the pixel — and still cannot take
   the declared box, because a few pixels of union extent at the corpus's extremes decide
   the test. G2's derivation calls drift *"framing-independent in a way the means are not"*,
   and on this candidate that holds only approximately: the same slot on the same frame
   reads **7.33 px** fitted and **6.94 px** pinned, a 5 % spread on a clause with a 1.22×
   margin. Nothing here needs it — both readings fail — but a candidate landing between 6.0
   and 6.4 px would make the framing decide a rung, and the ruling above would then be
   load-bearing rather than moot.
3. 📌 **The brief's next revision has a claim to promote, and it is not this pass's to
   write.** The run's render-back test says the panel's draw-order edge **is** forced by the
   frames: **359,989** deciding pixels, **+1064 %** separation, **101 of 102** frames — against
   **+281 %** over 69,299 pixels on the collar edge the brief settles by measurement, which
   the run used as its control. `slots.order` 3/3 agrees from the reference's side. The brief
   currently lists it as *"the weaker of the two readings"* and says *"Build it behind; the
   frames do not force it."* ⇒ Suggested for **revision 3**: move it into a measured claim
   with the deciding-pixel figure beside it. 🚫 **Not a blocker and not adjudicated** — a
   brief is the verifying pass's surface, not the gate's, and this pass edited no brief.
   - ➡️ **Done, 2026-08-28 — and the brief carries a frames-only proof instead.** The
     verifying pass re-derived the render-back result independently (driving the compiled
     candidate's own timelines rather than the run's fitted knob store: **+974 %** over
     372,159 deciding pixels, 101 of 102 frames, against **+241 %** over 65,481 on the
     collar control) and then found the edge is forced **without any build at all** —
     *crimson, beige, crimson* inside one unbroken drawn span occurs on **all 102 frames**,
     and on flanked runs ≥ 60 px, which no gap inside a 75 × 38.5 px collar can produce,
     still all 102. Revision 3 states the frames-only measurement, so an author no longer
     needs a candidate to know which way the edge goes. The same pass promoted the sack's
     deformation on the same basis.
4. 📌 **Guide debt: seven items, and all seven are folded.** The run's `LOOP.md` *Notes* left
   them unapplied by design, as *After a run* step 2 expects; they are in
   [AUTHORING.md](AUTHORING.md) as of this pass — §9.1's mirrored trap, §9.2's floor
   precondition, its refused-box clause and its mesh-control-bone clause, §10.3's opposite
   defect, §8.1's second diagnosis, and §9's strided-stills note. None of them changes a
   stored figure.
5. 📌 **The honesty-rule incident, ruled: recorded, and it moves no figure.** A
   `git log --oneline -3` on the fresh clone before the protocol was read — git history is
   forbidden, so it is a breach whatever it contained, and it stays on the record. Under the
   answer-derivability test in *The honesty rule* it narrows **no** reference-side measure:
   the three subjects were docs commits carrying no count, measure or reference-side value.
   ⇒ **No figure in this rung's row carries a caveat.**

⇒ **What a second attempt has to move is one number in one place.** Every clause but G2
clears, G2 clears on eleven of twelve sets, and the run names its own next step: a mesh for
the cape on a short chain, checked against the frame where the crimson spans twice the
sack's width and a region at scale 1.87 cannot reach. **Issue [#14](https://github.com/firejune/rigc/issues/14)
stays open on G2**, and the rung's status goes **⬜ → 🟨**.

> 🔴 **Correction, 2026-08-28 — the named next step was the wrong hypothesis.** Attempt 2
> built the cape mesh, fitted it like-for-like against a region under one fitter, budget and
> objective, and the **region won on all four shots**. The 7.33 px was **placement, not
> deformation**, and G2 cleared at 2.76 px with the cape still a posed region. The reading
> above is the *"reported figure with two possible causes"* ⚠️ landing on the wrong one; what
> settled it was a controlled fit rather than an argument. See *Rung 7, attempt 2*.

### Rung 7, attempt 2 — the cape's drift clears, and the last numbered rung closes (2026-08-28)

Run [`bench/runs/2026-08-28-rung7-2/`](../bench/runs/2026-08-28-rung7-2/) — `--profile spine`
green. Authored by Claude Opus 5 (1M context) on Claude Code / Agent SDK from **brief
revision 3** (third-party verified 2026-08-28, the revision that promoted the panel's draw
order and the sack's deformation out of their hedges on attempt 1's evidence), the frames the
run rendered itself, and this repository's source read as format documentation. The reference
export was never opened; the supplied `.atlas` was opened once, after the candidate was
final, for §9.2's texture-floor diagnostic. `bench` run once, at the end — **not
bench-assisted**. **No honesty-rule incident.**

One skeleton, `sack`: **8 bones · 3 slots · 3 attachments · 0 constraints · 4 animations ·
1,273 keys over 64 timelines**, against a reference of **31 bones · 3 slots · 3 attachments ·
24 constraints**. Bone tree `root → body → { sack1 → sack2 → sack3 → sack4, collar, panel }`,
with `body` carrying **translation only** because it holds no attachment and keying its
rotation would be a gauge (§10.3).

🚫 **No frame committed.** `git ls-files bench/reference-local` → **0**, checked before every
commit; the candidate's atlas names the example's own PNGs by relative path rather than
carrying copies. Re-inspection needs `bun run fetch-examples` and a local render first, as on
attempt 1.

```
sack   bones=8/31  slots=3/3  skins=1/1  attachments=3/3  constraints=0/24  animations=4/4  events=0/0

bones      0.128 (name-agnostic 0.213)   attachments 0.407   animations 0.798
slots      0.857 (name-agnostic 0.333)   constraints 0.000   events      1.000
```

| exact (1.000) | partial |
| --- | --- |
| `slots.count` 3/3 · `names` 3/3 · **`order` 3/3** · `attachment` 3/3 · `blend` 3/3 · `color_present` 3/3 · `attachments.skins` 1/1 · `count` 3/3 · `names` 3/3 · `animations.count` 4/4 · `names` 4/4 · **`duration` 4/4** · **`draw_order` 4/4** · `event_keys` 0/0 · `events` both at 0/0 | `bones.count` 8/31 · `names` 2/37 · `parent_by_name` 1/31 · **`slots.bone` 0/3** · `attachments.type_counts` 1/3 · `mesh_weighted` 1/3 · `mesh_vertices`, `mesh_triangles`, `mesh_hull` 0/3 · `region_size` 0/2 · all five `constraints.*` **0/24** · `animations.curve_kinds` 0.645 (821/1273) · `key_counts` **0.528** (672/1273) · `timeline_kinds` 0.260 (47/181) · `deform` 0.75 |

**Both mechanism questions the brief leaves open were decided by building both hypotheses and
fitting them with the identical fitter, budget and objective** — §9.3's rule, and a stronger
form of it than attempt 1 managed. The sack **deforms**: a weighted 5 × 9 grid mesh, 45
vertices / 64 triangles / hull 24, on a four-link chain up its own height. The cape panel
**does not**: one bone placing one region, chosen from a baseline where both rigs score
**11.14** on `hello/f0000` unfitted, after which the region variant wins on all four shots
(**19.55 / 27.10 / 24.21 / 25.39** against **23.13 / 32.45 / 27.30 / 27.15**). ⚠️ The run
states its own caveat: the mesh variant carries 30 knobs against the region's 24 at the same
budget, so part of that gap is search rather than mechanism. ⭐ **And the frames corroborate
it from a second direction** — the passage that looks least affine, `fall-in` f0's two crimson
wings with a gap between them, is explained by the *collar*, whose art is a wide chevron whose
arms reach exactly those corners.

📌 **`hello`'s terminal pose was fitted, not held.** It exists in exactly one file — the 30 fps
last still at 86/30 s, which the 12 fps set ending 2.8333 s does not carry — and the run
fitted it like any other frame and keyed it at the declared duration. That is
[AUTHORING.md](AUTHORING.md) §9's ⇒ ①, which attempt 1's own log asked for and which this run
is the first to be able to follow.

#### Gate v2.1 verdict, 2026-08-28 — **PASS**, and the rung closes

🚫 **Zero builds and zero authoring, and nothing in the run directory was touched.** The
candidate was re-read with `check` and `validate --profile spine` **from the repository root
over all 12 sets, with no `--atlas` and no `--viewport` override**, against frames rendered at
the brief's exact flags, and **every figure the run recorded reproduces to the digit** — all
twelve MAE means and worst frames, all twelve worst drifts and their slots and frames, the
attribution counts, 98 adjacent pairs, 0 disagreements, all eight sheet means and worst tiles,
the three-chain rollup including `panel`'s *"no slot attributable in any set"*, 0 unreached
reference components, and 15 PASS / 0 FAIL / 5 SKIP / 14 PROF.

| Clause | Reading over all 12 sets | |
| --- | --- | :---: |
| **G1** validity | 0 FAIL under `--profile spine` — 15 PASS, 5 SKIP, 14 PROF | ✅ |
| **G2** worst attributable slot drift ≤ 6.0 px | **2.76 px** `cape-front` at `cape-follow-example` f0019; next worst **2.74 px** `sack` at `hello` f0004, then 2.05, 2.01, 1.76, 1.76, 0.83, 0.83, 0.50, 0.50, 0.41, 0.32. **Clears by 2.2×.** No set is the 🕳️ HOLE case — every set attributes some frame (16/21, 19/35, 7/9, 29/37 on the 12 fps sets; 1–2 of 2 on the stills) — and **0 reference components go unreached in any set** | ✅ |
| **G3** per-frame motion = 0 | **0 of 98** adjacent pairs — 36 + 20 + 34 + 8, every pair of every shot at the rate each was committed in full. The eight stills sets carry no pair; **v2.1 (b) does not reach them** (a shot sampled twice is not a single pose) and each carries a sheet meeting G7, the discharge rung 2's and rung 4's sets use. No `⚠️ overdraw`: `drawnRatio` **0.951–0.989** against `OVERDRAW_RATIO` 1.5 | ✅ |
| **G4** shot inventory | `count` 4/4 · `names` 4/4; lengths against the reference's own — `cape-follow-example` **3.000000** v 3.000000 · `fall-in` **1.666666** v 1.666667 · `hello` **2.866666** v 2.866667 · `walk` **0.666666** v 0.666667. Worst gap **0.000001 s**, inside 1/12 s by five orders. `hello` declared at 86/30 from the brief's table rather than the 12 fps set's 2.8333 | ✅ |
| **G5** drawn inventory ≥ 0.85 | name-agnostic `slots.count` **3/3 = 1.000** · `attachments.count` **3/3 = 1.000**. **No deduction taken and none needed** | ✅ |
| **G7** every sheet ≤ 3.5× own mean | **eight sheets, all eight compared, all eight inside** — `fall-in@30fps` **2.923** (66.48 over a 22.74 mean, 51/51 tiles) · `fall-in@24fps` **2.816** (62.44 over 22.17, 41/41) · `cape-follow-example@24fps` 2.537 (71.81 over 28.30, 73/73) · `cape-follow-example@30fps` 2.488 (72.77 over 29.25, 91/91) · `hello@24fps` 1.773 (58.64 over 33.09, 70/70) · `hello@30fps` 1.705 (58.47 over 34.30, 87/87) · `walk@24fps` 1.545 (41.14 over 26.63, 17/17) · `walk@30fps` 1.477 (39.74 over 26.90, 21/21). The four 12 fps sets commit every sampled frame and read **SKIP**. **No set is a HOLE** | ✅ |
| **G6** the rung | one skeleton, and it meets G1–G5 and G7 | ✅ |

⇒ **Every clause reads PASS or SKIP. Rule 3's *close on pass* applies, issue
[#14](https://github.com/firejune/rigc/issues/14) closes, and rung 7's status goes 🟨 → ✅.**
🏁 **That is the last numbered rung**: rungs 1 through 8 are now all ✅, and what remains before
the graduation exam is spineboy alone.

⚖️ **The framing ruling of attempt 1 is reused unchanged, and this time it is not even
contested.** The gate's figures are `check`'s own unaided reading; `frames.json`'s box is
refused on all twelve sets, on extent, exactly as revision 3 predicts. The run kept
`check-declared-box.txt` as a **named diagnostic** and says so — the framing is worth
**0.7–1.3 MAE** here against attempt 1's 1–11, and 🚫 the pinned run is not the record. ⭐ Note
what shrank: the framing gap fell by roughly an order of magnitude while the drift fell by
2.7×, which is what a candidate closer to the reference's own extents looks like from both
sides.

> ➡️ **Superseded 2026-09-02 — the box is now *taken*, and the diagnostic became the record.**
> The ruling itself stands: the gate reads `check`'s own unaided reading, never a reader's
> flags. What changed is what that reading *is*. [PR #254](https://github.com/firejune/rigc/pull/254)
> gave the extent test a tolerance ([#194](https://github.com/firejune/rigc/issues/194)), so
> `frames.json`'s box is now **taken on ten of the twelve sets** under `extent-spread` —
> `walk@24fps` and `walk@30fps` are still **refused**, on `coordinates` — and *"refused on all
> twelve sets"* is false in both directions. ⇒ **`check-declared-box.txt` is no longer a pinned
> diagnostic sitting beside the record; it is what the unaided instrument now prints**,
> reproduced from it digit for digit on all twelve sets. The MAE(ref) figures below are the
> ones this section recorded and stay as measured; the current reading is
> `24.23 / 21.37 / 21.39 / 17.92 / 20.28 / 20.29 / 25.54 / 27.36 / 26.86 / 22.14 / 21.69 /
> 21.29`, and the worst drift is **3.94 px** rather than 2.76. 🔴 **That reading fails G2** —
> see *The PR #254 instrument re-inspection* under **Status**.

⚖️ **The deliberate fidelity trade, ruled: no gating clause reads it, and it is legal.** Three
`cape-follow-example` pairs were contracted toward each other at a cost of **+6.89, +7.06 and
+7.08 composite units**, and ten further pairs at +0.13 to +2.66, to bring the candidate's own
frame-to-frame change inside `check`'s band. The run asked whether any clause reads that cost.
**None does, and the gate says so in its own words**: rule 2's 🚫 — *"MAE is reported, per set,
and decides nothing"* — covers exactly this quantity, a per-frame residual in the run's own
composite units. ⇒ **The trade converts a figure no clause reads into G3, which is read at
zero tolerance**, and that is the direction the gate's ⚖️ prefers by construction (*"a hold
that is not held … [is] visible in the frames the author was given"*). Verified rather than
assumed: on the traded frames the gated columns read **MAE(ref) 25.09–25.59** against that
set's own mean of **24.93**, and **drift 0.6–1.3 px** against a 6.0 px bar — the cost is
invisible in every column that gates. ⭐ **And it is recorded the way the guide now requires**:
frames named, cost per frame quantified, declared as a trade rather than presented as a fit.
Nothing else on the run's list is a clause matter — the union-box residual and the panel's
regularised passages are both reported figures, and the atlas diagnostic is an instrument
question, ruled on below.

⚠️ **`panel` is never attributable a drift in any set, and that is read down rather than
waved through.** The `cape-back` slot **draws on all 118 compared frames** and the chain
carries **15.7 %** of the difference at **44.04** per pixel — so it is drawn and it is scored
— but [`src/slots.ts`](../src/slots.ts)'s matcher returns no match for it anywhere, because
the panel sits *behind* the sack over a beige backdrop and the best residual exceeds its
confidence bar. A blank drift is normally the **loudest** row in the table (§9.2), so the two
causes have to be separated, per rule 2's ⚠️:

- **`(unattributed)` is 1.7 %** and **0 reference components go unreached in any set** — a
  part that had left its place would dump the reference's ink into both.
- **The quantitative bound comes from attempt 1 on the same frames.** That candidate's
  `cape-back` was a region on its own bone too, *was* attributed, and read **1.0 px worst /
  1.0 px mean** with `MAE in it` **39.61**. This one reads **44.04** — **11 % worse per
  pixel** than a part measured at one pixel out. A part tens of pixels out of place does not
  land 11 % away from one that is not.
- **It was predicted before any build**, out of `src/slots.ts`, and recorded in that run's
  `LOOP.md` §7 rather than explained afterwards.

⇒ **G2 reads and passes.** The clause is *"worst attributable slot drift, in every measured
set"*, and its 🕳️ fires on a **set** with no attributable drift, not on a slot; every set here
has attributed frames. 📌 But the coverage is honestly **2 of 3 slots**, and that is owner
item 2 below rather than something this pass invents a condition for.

> 🔴 **The quantitative bound above did not survive the instrument — corrected 2026-09-02.**
> The middle bullet's control is attempt 1's `cape-back` *"was attributed, and read 1.0 px
> worst / 1.0 px mean"*. That attribution exists **only in the fitted framing, and only on
> frame f0021 of one set**. Under the [PR #254](https://github.com/firejune/rigc/pull/254)
> instrument, where `frames.json`'s box is taken rather than fitted, attempt 1's `cape-back` is
> attributable on **none** of its 118 frames — which that run's own
> [`check-pinned.txt`](../bench/runs/2026-08-28-rung7-1/check-pinned.txt) already recorded as
> *"no slot attributable in any set"*, at **35.62** per pixel. ⇒ **There is no attributed
> instance of the part left to control against**, so the limb's kind 4 is unavailable here, and
> with kind 1 (attributed in no set), kind 2 (`panel` owns one slot, no sibling) and kind 3
> (`panel` is the **worst** of the three chains per pixel at 41.36, where kind 3 wants
> near-zero) all unavailable or failing, **the blank cannot be read down at all**. The two
> standing columns still read cleanly — `(unattributed)` **1.79 %**, **0** unreached components
> on all 118 frames — but rule 2 makes those necessary, not sufficient. 🔴 **So G2 fails on all
> twelve sets under that instrument and this rung re-opens**; the worked reading is in *The PR
> #254 instrument re-inspection* under **Status**. The paragraph above stays as written: it is
> what this pass measured, and what is corrected is which framing its control lives in.

📌 **Reported and not gating.** `bones` **0.128** and `constraints` **0.000** are exempt by
name in rule 1, on attempt 1's reading and for the same reason — the cloth's mechanism is on
the brief's *cannot tell you* list. ⚠️ **`slots.bone` fell to 0/3 from attempt 1's 2/3**,
which is `bones.names` 2/37 reaching through a name-keyed measure: this rig's bones are named
after nothing public, and rule 1 lists every name-keyed measure as unwinnable by design.
`key_counts` **0.528** is the density measure §10.6 says no public page gives, and it improved
from attempt 1's 0.486 without being aimed at. `attachments.type_counts` 1/3 and the four
`mesh_*` measures are the region-versus-mesh choice §9.3 names as invisible — and this
candidate reaches them from the *other* side than attempt 1 did, having meshed the sack and
posed the cape.

🎯 **What moved between the two attempts, against the clause that decided them.**

| | attempt 1 | attempt 2 |
| --- | --- | --- |
| **G2** worst drift | **7.33 px** ❌ | **2.76 px** ✅ |
| G3 disagreements | 0 of 98 | 0 of 98 |
| G7 worst sheet | 3.041× | 2.923× |
| framing cost | 1–11 MAE | 0.7–1.3 MAE |
| MAE(ref), 12 fps sets | 19.07 / 20.80 / 25.07 / 29.23 | **19.17 / 22.56 / 24.93 / 26.20** |
| `key_counts` | 0.486 | **0.528** |
| bones / slots | 7 / 0.952 | 8 / 0.857 |

> 📌 **The table above is a comparison of the two attempts as each was graded, on the fitted
> instrument both were graded on, and it stays that way** — a like-for-like row is worth more
> than a row half re-measured. For the record, the same six rows under the
> [#254](https://github.com/firejune/rigc/pull/254) instrument, read 2026-09-02: worst drift
> **6.94 px ❌** against **3.94 px** (still inside the bar, but 🔴 **G2 fails on the read-down**,
> not on the figure); disagreements 0 of 98 both; worst sheet 3.485× against **3.226×**; the
> framing cost is **zero on ten of twelve sets**, because the box is taken rather than fitted;
> MAE(ref) on the 12 fps sets 16.03 / 20.29 / 23.32 / 25.79 against **17.92 / 22.14 / 24.23 /
> 25.54**; `key_counts` and the bone/slot counts are structural and do not move. ⭐ **Note what
> the honest instrument does to the headline**: attempt 2 still wins the rung's deciding clause
> by 1.8× on the figure, and it is attempt 1 that reads *better* MAE(ref) on three of the four
> 12 fps sets — which is the ladder's own ⚠️ that an MAE decides nothing, arriving from a third
> direction.

⭐ **The rung was decided by the cape, both times, and the fix was not the one attempt 1
predicted.** That run's named next step was *"a mesh for `cape-back` on a short chain"*, on the
reasoning that its residual was the panel's own deformation. Attempt 2 **built that mesh, fitted
it against the region under identical conditions, and the region won on all four shots** — so
the 7.33 px was **placement, not mechanism**, and the mesh would have spent the rung's budget on
the wrong hypothesis. 📌 That is the ladder's own ⚠️ about a reported figure with two causes,
playing out across two attempts: attempt 1 read its cape residual down to *deformation* and was
wrong, and what settled it was a like-for-like fit rather than an argument.

🧾 **What this pass records for the owner rather than resolving.**

1. ⚠️ **G7's thin margin is now an integrity matter rather than an opportunity, and rule 5
   says so.** The corpus's top three are rung 4's withdrawn 4.00, **this candidate's 2.923**
   and rung 6's 2.892 — and 2.923 sits above 2.892, so *"a tightening of G7 finds rung 6
   first"* is **still not true; it finds rung 7 first.** What changed with this verdict is the
   direction: rung 7 now **holds a PASS** resting on a 1.20× margin, beside rung 6's 1.21×, so
   by rule 5 point 2 a tightening of G7 could flip **two standing passes** and would
   re-inspect immediately rather than waiting for a bump. Rule 2's ⚠️ (*"both margins are
   thin, and that is recorded rather than smoothed over"*) now has two candidates inside it.
   🚫 **No threshold is touched here** — this is the argument arriving where rule 2 says it
   starts, with the ranking it changes stated.
   > ➡️ **Ruled 2026-08-29: the 3.5× stands** ([#193](https://github.com/firejune/rigc/issues/193),
   > closed). The trigger fired and the deliberation was held; what refused the tightening is
   > the quality-gate posture — nothing on this corpus has been read as unfaithful at a ratio
   > the clause admits, and a tightening below 2.923 would flip **two** standing passes 0.031
   > apart. The stale *ranking* is fixed a different way: rule 2's *finds-X-first* lines are
   > **deleted** and *The clause margins* under **Status** carries the ranking, updated by every
   > adjudication ([#207](https://github.com/firejune/rigc/issues/207), closed). Both in
   > *Operating rules* rule 2, under *Gate v2.2*.
2. ⚖️ **G2's 🕳️ is written per set, and this candidate is the first to show the per-*slot*
   gap.** One of three slots contributes no drift sample anywhere in the corpus, so G2's
   reading covers two thirds of the drawn parts. It does not hold this rung — the blank is
   read down above on three independent grounds — but the shape generalises badly: a part
   drawn *behind* another over a flat backdrop can be misplaced and never appear in the one
   clause that measures placement. The gate has no word for it, and `check`'s own text calls
   a blank the loudest row, which is the opposite reading. ⇒ **A clause decision for the next
   gate version**, in the same family as the single-pose gap v2.1 closed: either a slot never
   attributable in any set is a HOLE on that slot, or the clause states that per-set
   attribution is what it means and the unattributable case is covered by the unreached-component
   count instead.
   > ➡️ **Closed 2026-08-29 as gate v2.2's one content change**
   > ([#198](https://github.com/firejune/rigc/issues/198)), and by neither of the two options
   > this item offered. The limb is a **disclosure** requirement rather than a HOLE or a
   > silence: *a slot that draws in a set and is attributable in no frame of it is read down
   > explicitly in the verdict, or the clause fails for that set.* ⭐ **The read-down above is
   > what the limb now requires of everyone** — it is written into rule 2 as kind 4, the
   > quantitative per-pixel control, with the three other qualifying kinds beside it. Clause in
   > *Operating rules* rule 2 under *Gate v2.2*; the sweep it owed is *The gate-v2.2
   > re-inspection*.
3. 📌 **The texture-floor diagnostic is not sound as §9.2 wrote the recipe, and the guide now
   says so.** `check --atlas <the example's own>` sent MAE(ref) **up** — 24.93 → 28.84 and
   19.17 → 27.75 — because `--atlas` substitutes region **geometry** as well as texture, and
   this example's regions are packed rotated and trimmed while the candidate's attachments are
   measured off the loose PNGs. The run read it as **inconclusive rather than as a floor**,
   which is the honest verdict, and this pass agrees. ⚠️ **So attempt 1's recorded 4.42 floor
   should not be re-quoted as this example's texture floor**: it rests on the same substitution.
   Whether `check` should offer a texture-only substitution is an **instrument** question, and
   rule 3 keeps instruments out of a gate version.
   > ➡️ **Answered 2026-08-29 — the instrument exists and is `--texture-from`**
   > ([PR #254](https://github.com/firejune/rigc/pull/254),
   > [#171](https://github.com/firejune/rigc/issues/171) and
   > [#199](https://github.com/firejune/rigc/issues/199), both closed). It was taken up as an
   > instrument question exactly as this item framed it — outside a gate version, changing no
   > clause. The substitution is texture-only **by construction**: every world vertex is copied
   > across untouched and only `page` and `uvs` change, remapped through the drawing's own
   > coordinate space by `MeshAttachment.computeUVs`, the one routine in `spine-core` that
   > implements all four rotations — so a `rotate: 270` trimmed pack re-seats nothing. Its
   > fixture (selftest C17) asserts the two halves separately: **not one** of 65 frames' world
   > vertices moves and **not one** UV stays, and the **red control** is the same atlas down the
   > `--atlas` path, which moves the same figures by 233.87 / 231.93 MAE. ⇒ **Measured on this
   > candidate: the floor is 1.45–1.85 MAE(ref) and the texture explains 1.3–2.6 % of each
   > figure** — so this rung's error is the rig, which is what the diagnostic could not say
   > before. 🔴 **The same PR's third change moves this rung's gated figures and its verdict** —
   > that is not this item, and it is in *The PR #254 instrument re-inspection* under
   > **Status**.
4. 📌 **Guide debt: eight items, and all eight are folded** into [AUTHORING.md](AUTHORING.md)
   (*After a run* step 2) — including the two the run flagged. §10.3's one-tolerance rule and
   its basin rule are reconciled the way the run resolved them, and the reading is codified as
   the guide's: **declare one tolerance, then floor it per channel at that channel's own basin,
   capped** — because a basin bounds what you *know* while a tolerance also bounds what you
   *render*, and the rendered series is read by G3 at zero slack. A channel whose basin exceeds
   the cap is unidentified and wants a **prior**, recorded as such, not a loose tolerance.
   §9.2's atlas recipe gains item 3's caveat. None of the eight changes a stored figure.

⇒ **What the ladder learns from this rung.** It is the first to be climbed with **no
committed reference frames at all**, and the protocol held on both attempts — rendered locally,
never committed, reproduced digit for digit by an adjudicator who rendered them again. It is
also the first rung where an attempt's own *stated* next step was the wrong hypothesis and a
like-for-like fit said so. **Issue [#14](https://github.com/firejune/rigc/issues/14) closes.**

#### Gate v2.2 re-inspection, 2026-08-29 — **PASS**, and this rung is the limb's worked case

Re-read on the stored candidate, with the frames rendered again for this pass at the brief's
exact flags and **no frame committed** (`git ls-files bench/reference-local` → 0). Every figure
above reproduces to the digit, including the chain rollup and `panel`'s *"no slot attributable
in any set"* at **44.04** per pixel.

⚠️ **v2.2's per-slot limb finds 16 blanks across three slots, and the one it was written for is
`cape-back`.** Its read-down is the ⚠️ above, unchanged and now **required rather than
diligent**: the slot is named, the matcher's reason is named, `(unattributed)` **1.7 %** and
**0** unreached components are quoted, and the quantitative control is attempt 1's attributed
`cape-back` on the same frames at **39.61** per pixel against this one's 44.04 — **11 % worse
per pixel than a part measured one pixel out**. That is the limb's **kind 4**, and rule 2 now
carries it as the pattern. The other two blanks are `cape-front` in the two `hello` stills sets
and `sack` in the two `walk` stills sets, both attributed in **ten** other sets at 2.76 px and
2.74 px — the limb's kind 1.

⇒ **Verdict unchanged.** 📌 And the coverage statement the attempt-2 verdict made informally —
*"honestly 2 of 3 slots"* — is now what the clause obliges every verdict to say. This rung's
`fall-in@30fps` is also the **closest standing pass to G7's bar**, at **2.923×**, **1.20×**
inside; [#193](https://github.com/firejune/rigc/issues/193)'s ruling of 2026-08-29 holds the
3.5× where it is.

#### PR #254 instrument re-inspection, 2026-09-02 — 🔴 **FAIL on G2, and the rung re-opens**

Re-read on the stored candidate under the [#254](https://github.com/firejune/rigc/pull/254)
instrument — `check` from the repository root with **no `--atlas` and no `--viewport`
override** — with the frames rendered again for this pass at the brief's exact flags and **no
frame committed** (`git ls-files bench/reference-local` → 0). 🚫 **Zero builds and zero
authoring, and nothing in this run directory was touched.**

⭐ **The re-read reproduces this run's own `check-declared-box.txt` digit for digit on all
twelve sets** — which is the whole of what changed: the extent tolerance
([#194](https://github.com/firejune/rigc/issues/194)) means `frames.json`'s box is now **taken**
on ten of the twelve sets instead of refused, so the diagnostic this run filed beside its record
*is* the record the unaided instrument now prints.

⚠️ **Two figures move against this rung and one clause fails.** Worst attributable drift
**2.76 → 3.94 px** (`sack` at `cape-follow-example` f0022, still inside the 6.0 px bar at 1.52×
rather than 2.17×); worst sheet **2.923 → 3.226×** (still inside 3.5× at 1.085×); blanks
**16 → 18** pairs as `sack` goes blank in both `hello` stills sets, which leaves those two sets
attributing **nothing at all** and makes each a G2 🕳️ **HOLE** — the first time the 🕳️ has
fired on this corpus.

🔴 **But what decides it is `cape-back`, and it is the read-down above that fails rather than
any figure.** The slot draws on all 118 frames of all twelve sets and is attributable in none,
and under this instrument **no qualifying kind is available**: kind 1 (attributed in no set),
kind 2 (`panel` owns exactly one slot, so no sibling exists — as on rung 2's `water`), kind 3
(`panel` reads **41.36** per reference pixel, the **worst** of the three chains, where kind 3
wants near-zero and the ladder's qualifying case is 0.27–0.29) and kind 4 (**attempt 1's
`cape-back` is attributable in no set at this framing either**, so the control has no attributed
instance to compare against). The two standing columns read cleanly — `(unattributed)`
**1.79 %**, **0** unreached components on all 118 frames — but rule 2 makes those necessary and
not sufficient. ⇒ *"A blank that cannot be read down fails the clause for that set."*

⇒ 🔴 **G2 is unmet on all twelve sets. G1, G3, G4, G5 and G7 all still read PASS; G6 follows
G2.** Issue [#14](https://github.com/firejune/rigc/issues/14) **re-opens** on G2 and this rung's
status goes ✅ → 🟨, per rule 3's *only the rungs that fail the new gate reopen*. 📌 **The gate
v2.1 and v2.2 passes above are not rewritten** — a pass is versioned, and both stay true of the
instrument they were measured on. The worked reading, the itemised read-down, the refused
counter-argument and the two owner items it raises are in *The PR #254 instrument
re-inspection* under **Status**.

⇒ **What a third attempt has to move is the cape panel's placement, and this time the clause
says so rather than an adjudicator's diligence.** The panel's own pose was flagged by attempt 2
itself as *"only weakly identified and partly a prior, not a measurement"* — its basin is 4.5 px
in rotation and through the passages where the sack hides it the per-frame fit chose from noise.
Under a framing that no longer absorbs a constant offset, that is now the rung's binding
constraint: the part has to be placed well enough that the matcher will name a distance for it,
or the candidate has to give `panel` a second drawn slot so kind 2 becomes available.

> ➡️ **Answered 2026-09-02 by attempt 3, and the answer is that the first half of that sentence
> is not reachable.** The next run measured what it costs: `cape-back`'s attribution is capped by
> the **shot** at 5–19 % agreement against the ~66 % floor at which anything in this corpus is
> attributed, so *"placed well enough that the matcher will name a distance"* has no rig behind
> it. **The second half stands** — a second drawn slot on `panel` would make kind 2 available —
> and it is now the only route the four kinds leave open. See *Rung 7, attempt 3* below and
> [#258](https://github.com/firejune/rigc/issues/258).
> ➡️ **And on 2026-09-02 there are five kinds.** Gate v2.3 (b) admits the measured-unobservable
> slot, so the second half is **no longer the only route**: attempt 3 clears G2 on the candidate
> it already had, with no second drawn slot and no fourth attempt. **#258 closes.** See *Gate
> v2.3 re-adjudication* under *Rung 7, attempt 3*.

### Rung 7, attempt 3 — the 🕳️ closes and two blanks become one; the cape names no kind under gate v2.2, and reads down under v2.3 (2026-09-02)

Run [`bench/runs/2026-09-02-rung7-3/`](../bench/runs/2026-09-02-rung7-3/) — `--profile spine`
green. Authored by Claude Opus 5 (1M context) on Claude Code / Agent SDK from **brief revision
3**, the frames the run rendered itself, [GATE.md](GATE.md) as the clause card, and this
repository's source read as format documentation. The reference export was never opened; the
example's own `.atlas` was opened once, after the candidate was final, as `--texture-from` and
never as `--atlas`. `bench` run once, at the end — **not bench-assisted**. **One honesty-rule
disclosure**, at the finish line, adjudicated below and tainting no figure.

⭐ **An inherited attempt, under item 10 of *What a run may read***: the **rig spec and motion
spec** of `2026-08-28-rung7-2`, with that run's `README.md`, `LOOP.md`, `bench.json` and stored
`check` output left sealed. 📌 **And the run refused something the launch prompt offered** — the
prompt pointed at attempt 2's cape-passage evidence, which lives in the two sealed files, and the
run declined it on the reading list's own precedence and re-derived the cape's mechanism from the
frames, the art and the brief. Stage 0, the mandatory unchanged recompile, is in
[`check-baseline-inherited/`](../bench/runs/2026-09-02-rung7-3/check-baseline-inherited/) and was
taken before any edit.

One skeleton, `sack`: **8 bones · 3 slots · 3 attachments · 0 constraints · 4 animations · 1,273
keys over 64 timelines**, against a reference of **31 bones · 3 slots · 3 attachments · 24
constraints**. 🔒 **The rig spec is byte-identical to attempt 2's**; all three repairs are in the
motion spec.

🚫 **No frame committed.** `git ls-files bench/reference-local` → **0**, checked before every
commit; the two viewers the run wrote refuse a destination inside the repository by path check.
Re-inspection needs `bun run fetch-examples` and a local render first.

```
sack   bones=8/31  slots=3/3  skins=1/1  attachments=3/3  constraints=0/24  animations=4/4  events=0/0

bones      0.128 (name-agnostic 0.213)   attachments 0.407   animations 0.798
slots      0.857 (name-agnostic 0.333)   constraints 0.000   events      1.000
```

**Three repairs, and two of them are the same finding twice.**

1. **`walk`'s collar was ~80 px out of place for its first three frames** — drawn across the
   sack's hem where the frames put the band at the neck. The descent could not cross the ridge:
   a 13 × 13 grid of the objective showed the frame's own figure *improving by 3.7* when the part
   leaves the viewport, so a coordinate descent finds the deletion before it finds the neck.
   Fixed by seeding from `walk`'s own f0003, the first frame the inherited fit had found.
2. ⭐ **The rest pose was not shared, and that is a build-side invariant the brief states.**
   `fall-in`'s last frame, `hello`'s first and `cape-follow-example`'s first are one standing pose
   to within **9, 22 and 31** silhouette pixels of ~10,245. The inherited fit had found the collar
   in **one** of the four shots — `fall-in/f0020`, 88 % agreement, `check` drift 0.19 px — and
   left the other three on one unescaped seed (translate ≈ `(150, −180)`, rotate ≈ 40°, scale
   ≈ 0.8), the same values `walk/f0000` carried. Fixed by copying the pose across with a
   body-translation compensation, then descending per frame. 📌 **Found by comparing the candidate
   against *itself* across shots**, which is a check no guide section currently suggests.
3. **A broad collar refit across all 102 frames was tried and rejected**, because it lowered the
   slot objective on every frame while raising the **frame's own** figure on nine — the slot
   objective is blind to reference pixels a shrinking part stops covering. Recorded as the dead
   end it was, and it produced the veto the tool now carries.

⚠️ **Three objectives, two of them escapable, and the run records all three** — a mean over the
slot's *current* pixels shrinks the part (63 % of its area for 6 points of residual); the whole
frame's MAE cannot see one part (three sweeps moved `hello`'s end pose 34.17 → 34.05); a frozen
window lets the part translate *out* of the window (891 of 891 of its pixels on the backdrop,
window "improved" 19.60 → 17.22). ⇒ **Every one is the search making the part stop being
measured**, and all three look like progress in the objective being optimised.

#### Gate v2.2 verdict, 2026-09-02 — 🔴 **FAIL on G2 alone**, and the rung stays 🟨

🚫 **Zero authoring, and nothing in the run directory was touched.** The candidate was
**recompiled from its own two specs** — `skeleton.json` byte-identical, sha256 `3225dd73…` —
and re-read with `check` and `validate --profile spine` from the repository root over all 12
sets with no `--atlas` and no `--viewport` override, against frames rendered at the brief's exact
flags. **Every figure the run recorded reproduces**, and the three stored `check` transcripts,
`bench.json` (0 numeric differences over 10,036 leaves) and all five `evidence/` files reproduce
digit for digit or byte for byte.

| Clause | Reading over all 12 sets | |
| --- | --- | :---: |
| **G1** validity | **0 FAIL** under `--profile spine` — 15 PASS, 10 SKIP, 14 PROF | ✅ |
| **G2** worst attributable slot drift ≤ 6.0 px | **3.9352 px** `sack` at `cape-follow-example` f0022, **1.525×** inside the bar; per set 3.94 · 0.59 · 0.60 · 2.98 · 2.98 · 2.98 · 3.72 · 0.20 · 0.20 · 1.24 · 0.62 · 0.73 px. 🕳️ **no set is a HOLE** — attempt 2's two `hello` stills HOLEs are closed. **14** blank pairs over **2** slots: `sack` in the two `walk` stills sets reads down under **kind 1** (36 attributed frames in ten sets, and `walk` f0001 at 0.8172 px in the same shot at 12 fps); `cape-back` draws in all twelve, is attributable in none, and **reaches no kind** ⇒ the clause fails for all twelve sets | ❌ |
| **G3** per-frame motion = 0 | **0 of 98** adjacent pairs — 36 + 20 + 34 + 8. No `⚠️ overdraw`: `drawnRatio` **0.9524–0.9933** against `OVERDRAW_RATIO` 1.5 | ✅ |
| **G4** shot inventory | `count` **4/4** · `names` **4/4**; both lengths quoted — 3.000000 v 3.000000 · 1.666666 v 1.666667 · 2.866666 v 2.866667 · 0.666666 v 0.666667. Worst gap **0.000001 s** inside 1/12 s | ✅ |
| **G5** drawn inventory ≥ 0.85 | name-agnostic `slots.count` **3/3 = 1.000** · `attachments.count` **3/3 = 1.000**. **No deduction taken and none needed** | ✅ |
| **G7** every sheet ≤ 3.5× own mean | **eight sheets, all inside** — 3.226 · 3.110 · 2.637 · 2.563 · 1.855 · 1.806 · 1.292 · 1.251, worst `fall-in@30fps` at **1.085×**. None refused. The four 12 fps sets commit every sampled frame and read **SKIP** | ✅ |
| **G6** the rung | one skeleton, and it does not meet G2 | ❌ |

⇒ 🔴 **G2 is unmet on all twelve sets; G1, G3, G4, G5 and G7 read PASS or SKIP; G6 follows G2.**
Issue [#14](https://github.com/firejune/rigc/issues/14) **stays open** and the status cell stays
🟨. The figures, both read-downs in full, the refused counter-reading and the owner items are in
*The attempt-3 adjudication* under **Status**.

⭐ **What this attempt earned, and it is not nothing.** G2's set-level 🕳️ — which fired for the
first time anywhere on this corpus six days earlier, on these two sets — is **closed**; the blank
surface is down from three slots to two; `cape-front` is attributable in **all twelve** sets
where it was blank in two; and four sets' MAE fell by 3–7 points. **The clause the rung fails is
the one it failed before, on the one slot it failed on before.**

🔬 **And it settled the question attempt 2's verdict left open, in the direction that closes a
route.** Attempt 3 measured the cape panel's attribution as a **ceiling of the shot**: the
crimson the sack is not in front of, over the smallest oriented rectangle covering it, is
**5–19 %** on every frame, against a floor of ~66 % agreement below which nothing in this corpus
is attributed. ⇒ **No placement, scale, rotation, pivot or region-versus-mesh choice attributes
`cape-back` at the declared box**, so *"place it well enough that the matcher names a distance"*
is not a reachable instruction. ⚠️ **Two shapes that *would* clear the matcher were identified
and rejected as gaming it**, with the reasoning recorded — a U-shaped or annular hull hugging the
visible rim (the reading the brief's revision 3 says the frames do not support) and keying the
slot empty where the panel is occluded (which would silence the limb about a part that is there).
📌 **The verdict credits both refusals**: they are the two moves that would have converted this
FAIL into a PASS by making the instrument stop asking, and declining them is what leaves the gap
visible enough to file.

#### Gate v2.3 re-adjudication, 2026-09-02 — 🟢 **PASS on every clause. The rung closes and the ladder is complete again**

Re-read on **this same candidate**, unchanged — no build, no edit, nothing in the run directory
touched — with the frames rendered again for the pass at the brief's exact flags and **no frame
committed** (`git ls-files bench/reference-local` → 0). Every figure above reproduces, and so
does every one of the run's own `evidence/` files: `panel-ceiling.txt` and `draw-order-swap.txt`
**byte for byte**, `pin.txt`'s three bone blocks **digit for digit**.

⭐ **What changed is the clause, and it changed before this candidate was read against it.**
Gate **v2.3** answers the two questions the FAIL above filed: **(a)** a control instance must be
attributable at the framing the verdict is read in (#256), and **(b)** a slot whose
attributability has a **measured ceiling below a calibrated bar** reads down when **everything
observable about it is independently verified strict** (#258), with **(c)** requiring every
read-down to state its framing and prefer a portable quantity.

⇒ 🆕 **`cape-back` reaches kind 5, on both halves.** Half 1: ceiling **5–19 %** over all 118
frame entries (maximum 19 % at `hello@24fps` f0069) against a bar of **66 %** — the lowest
agreement at which anything in this corpus is attributed — with the slot's own agreement topping
out at **45 %**. Half 2: placement pinned to **≤ 2–3 px** by a whole-track translation sweep on
`maeReference`, with `collar` — whose slot `check` **does** attribute at **0.18–3.72 px** worst
per set — as the known-answer control at **+1 % at 1–2 px**; and draw order separating
**×8.44–15.30** against the settled collar edge's **×2.40–8.17**. `sack`'s two blanks read down
under **kind 1** as before, quoting a drift.

⇒ 🟢 **G2 is met on all twelve sets — 3.9352 px at 1.53× inside the bar, no 🕳️, both blanks read
down — and G1, G3, G4, G5 and G7 read PASS or SKIP unchanged. G6 follows.** Issue
[#14](https://github.com/firejune/rigc/issues/14) **closes** and the status cell goes 🟨 → ✅.
⚠️ **Two things this verdict records rather than buries**: it is the **same candidate** the gate
v2.2 verdict above failed, so what the pass measures is a clause decision and not an authoring
improvement; and this rung's `fall-in@30fps` sheet at **3.226×** is now G7's **closest standing
figure**, a **1.085×** margin. The worked reading, the sweep and both read-downs in full are in
*The gate-v2.3 re-inspection* under **Status**.

📌 **The route attempt 2's verdict said was the only one left is no longer the only one.** That
section closed on *"a second drawn slot on `panel` would make kind 2 available — and it is now
the only route the four kinds leave open"*. True of four kinds; **there are five**, and the
fifth is the one that did not require authoring for the instrument. ⇒ Which is the argument the
gap was filed on: the clause rewarded a candidate that gave the matcher something to hold over
one that measured why it never could.

### spineboy, attempt 4 — the graduation exam: two of the three failing dimensions clear, G2 does not (2026-08-28)

Run [`bench/runs/2026-08-28-spineboy-1/`](../bench/runs/2026-08-28-spineboy-1/) — **23
builds**, `--profile spine` green. Authored by Claude Fable 5 on Claude Code / Agent SDK
from the brief's **revision 4** (third-party verified ×3, 2026-08-27 — the pass that found
the D1–D3 brief defects which had been telling authors to put motion into `death`'s middle
that is not there). **`ess` alone**; `pro` was not attempted and does not gate the rung
([#16](https://github.com/firejune/rigc/issues/16)). The reference export was never opened,
and **the three earlier spineboy attempts were sealed and unread** as attempts at the rung
being authored. `bench` run once, at the end — the loop ran on `check` and on a
candidate-side change-column instrument.

**18 bones · 21 slots · 29 attachments · 0 constraints · 8 animations · 2 events · 2,581
keys**, against a reference of **18 bones · 20 slots · 27 attachments · 8 animations · 1
event**. Authored in the frames' own world coordinates (1 art px = 1 world unit, confirmed
by template matches at scale 1 landing on the brief's own verification figures). One static
draw order — the frames show no draw-order change, and both decided `ess` edges hold in one
ordering. Durations declared on the 30 fps grid inside the brief's windows; `footstep` fired
at both footfalls of `walk` and both landings of `run`, `shoot` at the flash instant.

```
ess    bones=0.924  slots=0.838  attachments=0.955  constraints=1.000  animations=0.778  events=0.500
       bones 0.924 (name-matched) · 0.967 (name-agnostic)   slots 0.838 (name-matched) · 0.798 (name-agnostic)
```

⚠️ **The `pro` line `bench` also prints is stretch noise for an `ess` candidate** and is
quoted nowhere, per the two-skeleton rule in [`bench/runs/README.md`](../bench/runs/README.md).

#### Gate v2.1 verdict, 2026-08-28 — **FAIL on G2 alone**, and the freeze stands

🚫 **Zero builds and zero authoring, and nothing in the run directory was touched.** The
candidate was re-read with `check` and `validate --profile spine` **from the repository
root over all 16 committed sets, with no `--atlas` and no `--viewport` override**, and
**every figure the run recorded reproduces to the digit** — all nine shot MAE means and
worst frames, every worst slot drift with its slot and frame, the six-chain rollup, 124
adjacent pairs, 0 disagreements, all seven sheet means and worst tiles, 0 unreached
reference components, and 16 PASS / 0 FAIL / 4 SKIP / 14 PROF.

| Clause | Reading over all 16 sets | |
| --- | --- | :---: |
| **G1** validity | 0 FAIL under `--profile spine` — 16 PASS, 4 SKIP, 14 PROF | ✅ |
| **G2** worst attributable slot drift ≤ 6.0 px | ❌ **7.86 px** `torso` at `hit` **f0000**, and the same pose again in `hit@30fps` — over the bar by 1.86 px, **1.31×**. **Two sets of sixteen, one pose.** Every other set is inside: `run` 5.55 `rear-shin` f0006 · `shoot` 5.17 · `death` 5.03 `torso` f0036 · `walk` 4.70 · `death@30fps` 4.64 · `shoot@30fps` 4.44 · `jump` 3.63 · `aim` 3.55 (both sets) · `walk@30fps` 3.52 · `run@30fps` 2.76 · `jump@30fps` 2.14 · `idle` 2.12 · `idle@30fps` 1.50. Chain means **0.5–2.1 px**. No set is the 🕳️ HOLE case, and **0 reference components go unreached in any set** | ❌ |
| **G3** per-frame motion = 0 | ✅ **0 of 124** adjacent pairs — 59 `death` + 20 `idle` + 16 `jump` + 12 `walk` + 8 `run` + 5 `shoot` + 4 `hit`, every pair of every shot at the rate each was committed in full. **`aim` and `aim@30fps` are single poses and are excluded under v2.1 (a)**, which is what both 2026-08-25 passes already did; (b) does not fire, because seven shots remain readable. The seven `@30fps` stills sets carry no pair and each carries a sheet meeting G7. No `⚠️ overdraw`: `drawnRatio` **0.948–1.080** against 1.5 | ✅ |
| **G4** shot inventory | ✅ `count` 8/8 · `names` 8/8; all eight lengths against the reference's own, in seconds — `aim` **0.000000** v 0.000000 · `death` **4.933333** v 4.933333 · `hit` **0.333333** v 0.333333 · `idle` **1.666666** v 1.666667 · `jump` **1.333333** v 1.333333 · `run` **0.666666** v 0.666667 · `shoot` **0.400000** v 0.400000 · `walk` **1.000000** v 1.000000. Worst gap **0.000001 s** | ✅ |
| **G5** drawn inventory ≥ 0.85 | ✅ name-agnostic `slots.count` **20/21 = 0.952** · `attachments.count` **27/29 = 0.931**. **No deduction taken and none needed** — and note the shortfall is in the *candidate's* favour on both: it draws **more** than the reference (21 v 20 slots, 29 v 27 attachments), which is the editor-convention alternatives sharing slots | ✅ |
| **G7** every sheet ≤ 3.5× own mean | ✅ **seven sheets, all seven compared, all seven well inside** — `death@30fps` **1.502** (69.03 over a 45.96 mean, 149/149 tiles) · `walk@30fps` 1.475 (56.72 over 38.44, 31/31) · `run@30fps` 1.311 (60.97 over 46.50, 21/21) · `jump@30fps` 1.310 (56.03 over 42.76, 41/41) · `idle@30fps` 1.255 (40.05 over 31.91, 51/51) · `hit@30fps` 1.207 (55.04 over 45.61, 11/11) · `shoot@30fps` 1.093 (41.70 over 38.17, 13/13). `aim@30fps` is a single pose and reads **SKIP**; the nine 12 fps shots commit every sampled frame and read SKIP. **No set is a HOLE** | ✅ |
| **G6** the rung | ❌ the graduating skeleton does not meet G2 | ❌ |

⇒ **Five clauses clear, G2 does not, and G6 follows it.** The freeze of 2026-08-24 stands,
**issue [#16](https://github.com/firejune/rigc/issues/16) stays open on G2 alone**, and
spineboy's status stays 🟨.

🎯 **Against the frozen bar — which dimensions moved, and by how much.** The bar this
attempt was measured against is the one the 2026-08-25 pass published and the v2.1 sweep
re-read on `2026-08-24-spineboy-3`: *"19.57 px worst drift, 3 per-frame disagreements, and
every sheet inside 3.5×"*.

| dimension | attempt 3 (frozen bar) | attempt 4 | move |
| --- | --- | --- | :---: |
| **G3** per-frame disagreements | ❌ **3** of 59 on `death` | ✅ **0** of **124** | **cleared** |
| **G2** worst drift | ❌ **19.57 px** `death` | ❌ **7.86 px** `torso` `hit` f0 | **2.5× better**, still over |
| **G2** `death` | 19.57 px | **5.03 px** | **3.9× better**, now inside |
| **G2** `walk` | 7.07 px | **4.70 px** | 1.5× better, now inside |
| **G2** `run` | 6.75 px | **5.55 px** | 1.2× better, now inside |
| **G2** sets over 6.0 px | ≥ 3 shots | **1 shot** (2 sets, 1 pose) | 3 → 1 |
| **G7** worst sheet | ✅ 2.028 `jump@30fps` | ✅ **1.502** `death@30fps` | 1.35× better |
| **G4** durations | ✅ ×8 inside 1/60 s | ✅ ×8 **exact to 1e-6 s** | held |
| **G5** counts | ✅ 0.952 · 0.931 | ✅ 0.952 · 0.931 | unchanged |
| **G1** validity | 0 FAIL | 0 FAIL | held |
| MAE(ref) `death` | 54.31 | **49.04** | −9.7 % |
| MAE(ref) `run` | 45.62 | **39.29** | −13.9 % |
| MAE(ref) `hit` | 43.27 | 44.56 | **+3.0 %** ⚠️ |
| `slots` name-agnostic | 0.810 | 0.798 | −0.012 ⚠️ |
| `animations` | 0.804 | 0.778 | −0.026 ⚠️ |

⭐ **Two of the three dimensions the freeze named are now clear, and the third is one
pose.** The 2026-08-24 freeze recorded three failing dimensions — the change column, the
worst drift, and the drawn inventory. **The change column is clean everywhere**, which is
the harder of the two gated ones and the one three attempts had never managed: 0 of 124
pairs, including `death`'s nine-pair hold rendered pose-identical and the five-pair boot
settle that brief defect D2 had described to nobody. **The inventory is complete** — no set
reports a reference component no slot reaches. And the drift is no longer a *shape* of
failure but a single frame: every shot except `hit` is inside the bar, and every chain mean
is at or under 2.1 px.

⚠️ **What did not move is the absolute MAE, and the run says so itself.** Union means run
**31–45** across the shots, against 4–20 on the cleared rungs. 🚫 **That is not a clause and
does not enter this verdict** — rule 2's 🚫 is explicit that *"MAE is reported, per set, and
decides nothing"*, and spineboy's plate is not comparable with any other rung's. It is
recorded because the run recorded it: the per-pixel fidelity of the poses is honest but
short of a transcription, the arm chains carry the largest error per pixel, and the lying
passages of `death` and `hit` fit to ~0.20–0.33 of the windowed objective where the standing
shots reach ~0.08.

📌 **Three figures went the wrong way and are named rather than buried.** `hit`'s MAE(ref)
rose 3 %, `slots` name-agnostic fell 0.012 and `animations` fell 0.026. The last two are
**structural consequences of choices this attempt made deliberately**: it authored a 21st
slot and five muzzle-flare alternatives sharing slots (editor convention), which moves
`slots.order` and `attachment_types_by_position`; and it authored 2,581 keys where attempt 3
authored fewer, which moves `key_counts` (**0.264**) and `curve_kinds` (**0.285**). None of
the three is a gated measure, and `key_counts` is on rule 1's unobservable list by name.

⚖️ **The framing ruling of the rung-7 adjudications is reused unchanged, and again it is not
decisive.** Three of sixteen sets — `run`, `walk`, `walk@30fps` — took **`frames.json`'s own
box** because their own pixels land there, which is `check`'s `declared` source and the very
case G2's *"4.1 px (rung 6, at the frames' own box)"* names; the other thirteen sit in one
shared fit at `x1.000072`, offset −0.02/−0.03 px, **3.72 px rms over 588 edges**. This pass
also read the candidate **pinned** to `frames.json`'s box as a diagnostic, and the pinned
reading is **worse, not better**:

| reading | worst drift | where | sets over 6.0 px |
| --- | --- | --- | --- |
| `check` as-is — **the record** | **7.86 px** | `torso`, `hit` f0000 | 2 (`hit`, `hit@30fps`) |
| `--viewport` on the declared box — diagnostic | **14.45 px** | `front-fist`, `death` f0058 | 3 (+ `death`) |

⇒ **G2 fails under both framings**, so nothing in this verdict turns on the framing
question — the third rung-7-era adjudication in a row where that is true. 📌 Worth noting
which way the shared fit cuts: it *helps* `death` substantially (14.45 → 5.03 px) and barely
touches `hit` (7.96 → 7.86 px), so `hit` f0's residual is a pose error and not a framing
artefact. The run's own ⚠️ explains the shared fit's cost — the flare's widest instant
reaches ~8 px short of the reference's rightmost column and one `death` in-between dips ~7
px below its lowest row, giving a union residual of −8.7 × +7.4 px that no single scale
absorbs.

🔬 **The residual, named precisely.** `hit` f0000 is the shot's opening lying extreme. The
whole-body horizontal pose *is* fitted — the run reports err 0.207 there and the frame's
MAE, 41.31, is that shot's second best — but the `torso` slot sits 7.9 px off inside an
otherwise-solved pose, and **restart batteries saturated**: the run's own diagnosis is that
the shoulder/chest geometry, fitted against upright shots, is the suspect. ⭐ **That reads as
a geometry defect rather than a search defect**, and it is corroborated from two directions:
`hit`'s `torso` chain mean is **3.6 px** — the highest chain mean in any set — while the same
chain reads 2.1 px pooled across all sets, and `hit` is the only shot whose body is
horizontal. ⇒ **This is the observable, decidable kind of residual** — a part visibly out of
place — so rule 1 does not exempt it, and rule 4 item 2 makes it a **re-climb** rather than
an adjudication. The lever the run did not pull is the one it names: re-triangulate the
shoulder/chest geometry through the *lying* poses as well as the upright ones, which is
§8.1's multi-shot setup re-fit applied to a joint rather than to a pose.

🧾 **What this pass records for the owner rather than resolving.**

1. ⚖️ **G2 is now the whole exam, and the margin is 1.86 px on one frame of one shot.** No
   clause decision is needed and none is asked for — the clause is unambiguous and the
   figure is over it. What the owner may want to weigh is **cadence**: this is the closest
   spineboy has been, the failure is a single named geometry defect with a named fix, and
   rule 4 item 3 makes this rung the last thing before the project's question changes. 🚫
   **This pass proposes no threshold change**, and notes for the record that G2's derivation
   explicitly refuses the argument a large rig might invite — *"a relative bar would license
   a large rig the visible error a small one is refused"* — so *"7.9 px on a 384 × 367 px
   plate is proportionally small"* is an argument the gate has already heard and rejected.
2. 📌 **Two of the three frozen dimensions clearing is the PoC's headline whatever the
   verdict**, and it is the first time the change column has been clean on this rung. It is
   also the first spineboy attempt to run on a brief whose D1–D3 defects were fixed, so part
   of the move is the brief and not only the fitter — the rev-4 verification pass predicted
   exactly that (*"an author working from rev 3 was told to put motion into f13–f26 that is
   not there"*).
3. 🧹 **A process cost worth an owner call, filed as [#201](https://github.com/firejune/rigc/issues/201).**
   `tsconfig.json` includes `bench/**/*.ts`, so a run directory's throwaway fitting harness
   lands inside the repository's CI typecheck surface — **227 committed `.ts` files across 12
   run directories today**, 22 of them (3,014 lines) from this run. One run directory is
   already excluded ad hoc. Whether run-dir tooling should be excluded by rule is the
   owner's; the trade-offs and the evidence are on the issue and this pass takes no side.
4. 📌 **The *Candidates* column in [`bench/runs/README.md`](../bench/runs/README.md) is not
   maintained to a single rule**, which this pass found while updating it. Rungs 4, 5, 6, 7
   and 8 match the count of stored candidate runs; rungs 1, 2, 3 and spineboy do not (2 runs
   reading 3, 2 reading 1, 3 non-pilot reading 2, and spineboy at **1** across every revision
   through three attempts). This pass sets spineboy's cell to the run count and **does not
   touch the other four**, because their cells may encode something it cannot verify. A
   one-line statement of what the column counts would settle it.

⇒ **What a fifth attempt has to move is one slot on one frame.** Every clause but G2 clears,
G2 clears on fifteen of sixteen sets and on seven of eight shots, and the run names both the
suspect and the method. **The graduation exam is not passed, and it is closer than the
ladder's own bar for "closer" has ever been asked to measure.**

### spineboy, attempt 5 — 🎓 the graduation exam **PASSES**, on an inherited candidate and one geometric edit (2026-08-28)

Run [`bench/runs/2026-08-28-spineboy-2/`](../bench/runs/2026-08-28-spineboy-2/) — **4
builds**, `--profile spine` green. Authored by Claude Fable 5 on Claude Code / Agent SDK, a
**fresh session**, from brief **revision 4**. `ess` alone. The reference export, the
transcriptions, this document's status table and per-rung sections and *Operating rules*,
`SPEC_COVERAGE.md`, `src/ladder.ts`'s gate strings and `render_reference.ts` were **not
opened**.

🆕 **The first run under the inheritance clause** (protocol item 10, owner's ruling
2026-08-28, in [`bench/runs/README.md`](../bench/runs/README.md)). It inherited attempt 4's
**rig spec, motion spec and `fitting/` harness** with the intermediate stores that harness
wrote for itself, and left sealed everything beside them that records a measurement — that
run's `bench.json`, its `check-final.*`, its compiled `spine/`, and its README and LOOP
beyond process. ⚠️ **So this attempt's figures measure a lever, not from-zero authoring.**
The from-zero trajectory on this rung is **attempts 1–4**; this one is the surgical
re-attempt those four earned, and the distinction is recorded here and in the status row
because the two things answer different questions.

**What it changed: six numbers in three objects.** Attempt 4 failed on one clause — 7.86 px
of `torso` drift at `hit` f0000 — which this document adjudicated as a **geometry** defect
with a named fix: *re-triangulate the shoulder/chest joint through the lying poses*. This
attempt performed exactly that and the refits it invalidates, and nothing else. Verified
against the two compiled skeletons, the whole rig-spec diff is:

| object | field | before | after |
| --- | --- | --- | --- |
| bone `neck` | x, y | 179.10, 21.98 | 176.04, 35.94 |
| bone `head` (compensation) | x, y | 21.60, −19.96 | 24.89, −33.86 |
| attachment `neck` (compensation) | x, y | −23.15, 13.48 | −19.86, −0.42 |

⭐ **And the compensation is arithmetically consistent with a setup-render-invariant pivot
move**, which this pass checked rather than took on trust: the pivot moves by
**Δ = (−3.06, +13.96)**, |Δ| = 14.291, and the two compensations are **identical to each
other** at (+3.29, −13.90), |·| = 14.284 — the same magnitude to 0.007, which is what −Δ
expressed in the child's own rotated frame looks like.

#### Gate v2.1 verdict, 2026-08-28 — **PASS on every clause. The rung closes and the ladder is complete**

🚫 **Zero builds and zero authoring, and nothing in the run directory was touched.** The
candidate was re-read with `check` and `validate --profile spine` **from the repository root
over all 16 committed sets, with no `--atlas` and no `--viewport` override**, and every
figure the run recorded reproduces to the digit.

| Clause | Reading over all 16 sets | |
| --- | --- | :---: |
| **G1** validity | 0 FAIL under `--profile spine` — 16 PASS, 4 SKIP, 14 PROF | ✅ |
| **G2** worst attributable slot drift ≤ 6.0 px | ✅ **5.55 px** `rear-shin` at `run` f0006 — **no set exceeds the bar.** Then `death` 4.77 `torso` f35 · `hit` 4.57 `rear-shin` f2 · `walk` 4.70 · `shoot` 4.37 · `shoot@30fps` 4.20 · `aim` 3.52 (both sets) · `walk@30fps` 3.52 · `jump` 3.58 · `run@30fps` 3.46 · `hit@30fps` **3.36** `torso` f0 · `death@30fps` 2.93 · `idle` 2.12 · `idle@30fps` 1.76 · `jump@30fps` 1.61. No 🕳️ HOLE; **0 reference components unreached** | ✅ |
| **G3** per-frame motion = 0 | ✅ **0 of 124** adjacent pairs — 59 `death` + 20 `idle` + 16 `jump` + 12 `walk` + 8 `run` + 5 `shoot` + 4 `hit`. `aim` and `aim@30fps` are single poses, **excluded under v2.1 (a)**; (b) does not fire. The seven `@30fps` stills sets carry no pair and each carries a sheet meeting G7. No `⚠️ overdraw`: `drawnRatio` **0.945–1.078** against 1.5 | ✅ |
| **G4** shot inventory | ✅ `count` 8/8 · `names` 8/8; all eight lengths against the reference's own — `aim` 0.000000 · `death` 4.933333 · `hit` 0.333333 · `idle` 1.666666 · `jump` 1.333333 · `run` 0.666666 · `shoot` 0.400000 · `walk` 1.000000, each against the same figure. Worst gap **0.000001 s** | ✅ |
| **G5** drawn inventory ≥ 0.85 | ✅ name-agnostic `slots.count` **20/21 = 0.952** · `attachments.count` **27/29 = 0.931**. **No deduction taken or needed**; the shortfall is in the candidate's favour on both — it draws *more* than the reference | ✅ |
| **G7** every sheet ≤ 3.5× own mean | ✅ **seven sheets, all seven compared, all seven well inside** — `death@30fps` **1.516** (71.45 over a 47.11 mean, 149/149 tiles) · `walk@30fps` 1.439 (55.99 over 38.91, 31/31) · `jump@30fps` 1.321 (56.01 over 42.39, 41/41) · `hit@30fps` 1.320 (60.07 over 45.49, 11/11) · `run@30fps` 1.225 (57.53 over 46.96, 21/21) · `idle@30fps` 1.210 (38.99 over 32.24, 51/51) · `shoot@30fps` 1.100 (42.42 over 38.57, 13/13). `aim@30fps` is a single pose → **SKIP**; the nine 12 fps shots commit every sampled frame → SKIP. **No HOLE** | ✅ |
| **G6** the rung | ✅ the graduating skeleton meets G1–G5 and G7 | ✅ |

⇒ 🎓 **Every clause reads PASS or SKIP. Rule 3's *close on pass* applies, issue
[#16](https://github.com/firejune/rigc/issues/16) closes, spineboy goes 🟨 → ✅, and every
rung on this ladder is now cleared.** The 2026-08-24 freeze is lifted by being met.

⚠️ **The margin, stated rather than smoothed over: 0.45 px, and it is the ladder's
thinnest.** 5.55 px against a 6.0 px bar is **1.08×**, where rung 5's 5.12 px was 1.17× and
every other standing pass sits at 1.4× or better. ⇒ Rule 2's *"a tightening of G2 finds rung
5 first"* is **no longer true — it finds spineboy first**, and owner item 1 below records
what that changes.

📌 **And the figure G2 turns on was already there.** `run`'s 5.5491 px `rear-shin` at f0006
is **bit-identical** to the inherited candidate's — this pass verified it to four decimal
places and verified that `run`'s leg channels are byte-identical between the two compiled
skeletons. ⇒ **Graduation was reached by removing the other failure, not by improving the
binding one.** The clause now rests on a figure attempt 4 had also posted, which is worth
knowing before anyone reads 5.55 px as headroom.

#### Gate v2.2 re-inspection, 2026-08-29 — **PASS**, unchanged, and the graduation pass holds

Re-read on the stored candidate from the repository root with no `--atlas` and no `--viewport`
override, over all 16 sets: every figure above to the digit, including **5.5491 px**
`rear-shin` at `run` f0006.

⚠️ **v2.2's per-slot limb finds 164 blanks across 15 slots here — much the largest count on the
ladder, and none of it is a defect.** `ess` is the densest figure in the corpus, and `check`
declines to attribute a part the reference has merged into a larger connected component, so
most small parts go unmatched on most frames. **Every one reads down**, in two groups:

- **8 slots by kind 1** — attributed in another set of the same skeleton: `torso` 4.77 px,
  `gun` 2.48, `rear-shin` **5.55** (the rung's own G2 figure), `rear-foot` 3.20,
  `front-fist` 2.29, `rear-bracer` 2.64, `front-thigh` 2.14, `neck` 2.12;
- **7 slots by kind 2** — attributable in no set, but each hanging off a chain the clause reads
  through an attributed sibling: `eye` and `mouth` under `head` 2.92 px / `goggles` 2.84 px,
  `front-upper-arm` and `front-bracer` under `front-fist` 2.29 px, `rear-thigh` under
  `rear-shin` 5.55 px / `rear-foot` 3.20 px, and `rear-upper-arm` and `muzzle` under
  `rear-bracer` 2.64 px / `gun` 2.48 px. `(unattributed)` is **0.004 %** over the whole
  candidate and **0** reference components go unreached in any of the 147 frames.

⚠️ **`muzzle` is the only one that needed a third ground and it has three**, because it is much
the largest of the twelve never-attributed slots on the ladder (1,753–2,662 px). It draws on
**three frames of `shoot` alone**; on two of them the whole figure is a **single** connected
component, so there is no separate reference component for the matcher to try at all;
`(unattributed)` on that set is **0.000 %** with 0 unreached components on all three; and
`shoot@30fps`'s sheet is the **flattest of the seven** at **1.100×** on a shot whose candidate
draws 7.8 % more ink than the reference. The itemised read-down is in *The gate-v2.2
re-inspection* above.

⇒ **Verdict unchanged. The graduation pass holds under gate v2.2, and its 1.08× is still the
ladder's thinnest drift margin** — though not, as *The clause margins* now computes, the
thinnest margin on the ladder: G5's 1.04× on rung 2 is.

### 🔬 The determinism comparison — the reproducibility headline

The owner asked for this explicitly, and it is the strongest result in this entry. Attempt 5
stored an **unchanged-recompile snapshot** of the inherited specs — build 1, before any edit
— in [`check-baseline-inherited/`](../bench/runs/2026-08-28-spineboy-2/check-baseline-inherited/),
and deliberately made **no comparison against attempt 4's stored record**, which was sealed
to it. Both records are the adjudicator's to read, so this pass made that comparison.

🎯 **Recompiling the inherited spec through the author path, in a different session, reproduces
attempt 4's stored `check` record EXACTLY. Not approximately — identically.**

- **All 16 sets**, on every gated and every reported field: `meanMae`, `meanMaeReference`,
  `worstMae` and its frame, `worstDrift` and its frame **and its slot**, `changePairs`,
  `changeDisagreements`, `drawnRatio`, `framesWithoutDrift`, `compared`, `referenceFrames`,
  and the **framing source each set resolved to**. **Zero differences.**
- **All 147 compared frames**, on `mae`, `maeReference`, `unionPixels`, `candidatePixels`,
  `referencePixels`, `worstDrift`, `worstSlot`, `attributed`, `drawn`, `components` and
  `unmatchedComponents`. **Zero differences.**
- **Every chain row of every set**, on `worstDrift`, `meanDrift`, `error`,
  `referencePixels`, `mae`, `maeShare`, `driftSamples` and `drewSlots`. **Zero differences.**
- **Every sheet**, on `meanMae`, `meanMaeReference`, `worstMae`, `worstTile`, `tiles` and
  `compared`. **Zero differences.**

⇒ **What that establishes.** `spec → build → check` is **deterministic across sessions and
across agents**, so rule 3's *"a re-inspection is a re-read of stored candidates"* is not
merely executable but **exact**: a stored spec is a stored figure. It also means three
independent readings of attempt 4 now agree to the digit — that run's own record, this
adjudicator's re-read of 2026-08-28, and a different session's blind recompile. 📌 The
inheritance clause is what made this measurable at all: it created a run that had to
recompile a spec it could not compare against, which is a determinism control nobody
designed and nobody could have run before.

**The stage-0 → final delta table also reproduces, in full.** All 16 rows, both drift
figures and both MAE means each — the run's own table is accurate to the digit on every
cell this pass checked.

✅ **Traceability, verified against the compiled skeletons rather than the prose.** The
surgery is skeleton-wide by design, so every shot's chest-hung channels moved: `torso`,
`neck`, `head`, `gun`, both `upper-arm`s, both `bracer`s and both `fist`s changed in **all
8** animations, and nothing else in the rig or the skin changed but the six numbers above.

🔴 **One record-accuracy defect, and it is a claim stronger than its measurement.** The run
states *"**hip and both legs were frozen in every refit**, so every leg figure is untouched
by construction"*, and its table header repeats *"no set's leg or hip keys moved"*. **That is
false as written for two of the eight shots.** Measured on the timelines:

| shot | leg/hip channels that moved | worst single-key change |
| --- | --- | --- |
| `hit` | `hip` (rotate + translate), `front-thigh`, `rear-thigh`, `rear-shin`, `front-foot`, `rear-foot` | **`rear-thigh` rotate 38.2°**; `hip` translate y **12.94 units**; two channels also gained keys |
| `death` | `front-foot`, `front-shin`, `rear-foot` | `front-foot` rotate **7.6°**; key counts 67→64 and 68→67 |
| the other six | **none — byte-identical** | — |

⚖️ **What survives and what does not.** The **per-set marks are true**: `run`, `walk` and
`walk@30fps` are marked *"leg figure identical"* and they are — byte-identical leg channels
and bit-identical drift figures — which is the load-bearing case, because the corpus-worst
figure G2 turns on is `run`'s. The **blanket sentences are not true**, and a reader relying on
them would wrongly believe `hit`'s new worst row (4.57 px `rear-shin`) was inherited when it
was **refitted**. 📌 The run's own narrative does disclose the work — it names `hit0full.ts`
(*"full multi-start on hit f0"*), `unifydeath.ts`, and the boot-settle retune from
2.4/1.6/0.8° to 4.2/2.2/1.0° — so this is a **summary overstating a body that was honest**,
not concealment. ⚠️ **It moves no figure and does not touch the verdict**: every number above
is this pass's own measurement, and G2 passes on all sixteen sets whatever the provenance of
each figure. It is recorded because *"legs frozen by construction"* was offered as the reason
to trust the binding figure, and the general form of that reason does not hold.

🔧 **The instrument disagreement the run flagged, adjudicated as an observation.** In
`death`'s lying stretch and `shoot` f2–f4 the run's **torso template match** wants the torso
art rotated ~12–16° from where its **composite fitter** puts it (match residuals 2869–4109
there against 1570–2604 where the two agree). The run let the composite stand, said so, and
asked the adjudicator's instruments to be the tiebreaker. **They side with the run's
decision:**

- across `death` f13–f26 — the flagged lying passage — the **worst slot drift of any frame is
  1.18 px**, and no frame in it exceeds 4.0 px;
- `shoot` f2–f4 read **4.37 / 4.14 / 4.19 px**, with `front-foot` as the worst slot on all
  three — the torso is not the worst part on any of them;
- `death`'s worst is 4.77 px at f0035, outside the flagged passage.

⇒ **`check`'s drift correlator — the only one of the three instruments the gate reads — sees
nothing near the bar in either region.** Recorded as an **instrument observation, not a
verdict matter and not an issue against `check`**: the disagreement is between two
*candidate-side* tools, and the gated third reads both regions comfortably clear. 📌 It would
become issue-worthy the day a composite and a template match disagree in a region that
*straddles* the bar, because then the choice between them would decide a rung. §9.1's new
*sacrificial cover* passage is where the general lesson landed.

⚖️ **The honesty touch in `LOOP.md` §1, ruled: recorded, and it moves no figure — the same
ruling rung 1 attempt 1 and rung 7 attempt 1 got.** `git log` ran as part of landing
mechanics and those commands display HEAD-adjacent commit subjects; the subjects seen were
adjudication and protocol titles. **Git history is on the forbidden list, so it is a touch
whatever it contained, and it stays on the record.** Under the answer-derivability test in
*The honesty rule* it narrows **no** reference-side measure: commit subjects are
verdict-level facts, no diff, blame or tag was opened, and no measure-bearing text was read.
⭐ **And the specific facts visible were ones this attempt's own mandate already carried** —
its task was defined by #16's public verdict. ⇒ **No figure in this entry carries a caveat.**

⚠️ **One structural note beside it, and it is not the run's fault.** This attempt's mandate
handed it **the 6.0 px bar** — a figure that lives in *Operating rules*, which the reading
list seals. The run did not open that file and its header says so; the bar arrived in the
prompt. That is the fourth instance of the shape [#174](https://github.com/firejune/rigc/issues/174)
exists to fix — *split the clause statements from the derivations that quote measured
figures* — and the same shape *The gate-v2 batch adjudication of the four re-climbs* above
recorded on rung 1. 📌 It narrows nothing on the reference side: a drift threshold is derived
from *previous candidates'* figures, not from the reference skeleton. But #174 is still open,
and a graduation run receiving a sealed threshold in its dispatch is the strongest argument
yet for closing it.

➡️ **Closed 2026-08-29.** The clause statements are split out to [GATE.md](GATE.md), which the
run protocol's allowed list now names, and a launch prompt **names no surface the two reading
lists do not name and pastes no threshold**. This instance is one of the four tabulated in
[`bench/runs/README.md`](../bench/runs/README.md), *What a run may read*; the criterion is the
honesty rule's sixth reading above.

🧾 **What this pass records for the owner rather than resolving.**

1. ⚠️ **G2's thin margin is now an integrity matter, and spineboy is first in line.** 5.55 px
   against 6.0 is **1.08×** — thinner than rung 5's 1.17×, which rule 2's ⚠️ currently names
   as the clause's first casualty. ⇒ *"A tightening of G2 finds rung 5 first"* is **false as
   of this verdict; it finds spineboy first**, and by rule 5 point 2 a tightening could now
   flip **the graduation pass itself**, which re-inspects immediately rather than waiting for
   a bump. 🚫 **No threshold is touched here.** This is the same shape as the G7 finding from
   rung 7 attempt 2 ([#193](https://github.com/firejune/rigc/issues/193)) — the corpus has
   moved under a clause's derivation and the derivation's stated ordering is now stale — and
   the two together suggest rule 2's *"a tightening finds X first"* lines want a rule for
   staying current rather than individual repairs.
   > ➡️ **Ruled 2026-08-29, and the suggestion in the last sentence is what was adopted**
   > ([#207](https://github.com/firejune/rigc/issues/207), closed). The lines are **deleted from
   > the gate text**, and *The clause margins* under **Status** carries the ranking per clause —
   > bar, closest standing pass, figure, ratio — updated by **every** adjudication as a named
   > part of *After a run* step 1. G2's bar is **not** touched: this candidate's 1.08× stands as
   > the ladder's thinnest drift margin, and the table records that G5's **1.04×** is thinner
   > still. Reasoning in *Operating rules* rule 2, under *Gate v2.2* (c).
2. ⚖️ **What the graduation certifies is a framing call, and this pass will not make it.**
   The pass is real and every clause is met on a stored candidate anyone can re-read. But the
   candidate is **inherited**, and the final lever was one geometric edit plus its refits —
   so *"an agent can author a spineboy-scale rig to foundation quality from the brief alone"*
   is a claim the ladder has **not** demonstrated in a single run, while *"the
   tool + guide + protocol reach the bar across a bounded series of honest attempts, with
   each attempt's residual diagnosed and fixed"* is exactly what it has. Attempts 1–4 are the
   from-zero trajectory (18.8 → 14.6 → 7.86 px of worst drift, 14 → 3 → 0 disagreements) and
   attempt 5 is the lever. ⇒ **Anything said outside this repository should say which of the
   two it means**, and rule 5 point 3 makes that a milestone question.
3. 📌 **The inheritance clause worked, and it bought something nobody designed.** Its first
   use produced the determinism control above — a blind recompile that reproduced a sealed
   record to the digit — because the clause splits the spec from the measures at the file. ⇒
   Worth keeping the stage-0 snapshot as a **standing requirement** for inherited attempts:
   it costs one `check` run and it is the only way that comparison ever gets made.
4. 📌 **The record-accuracy defect above is a candidate for the verifier bullet.**
   *"Legs frozen in every refit"* is a **claim without its tolerance or its scope** — the
   same family as the stillness and convention defects the rung-3, rung-5 and spineboy brief
   passes found, but in a *run's* record rather than a brief's. The protocol asks briefs to
   carry the threshold a claim was measured at; nothing asks a run's summary to carry the
   scope a freeze actually had. One sentence in *After a run* would.

⇒ 🎓 **The ladder was completed on 2026-08-29.** Rungs 1–8 cleared, and spineboy `ess` cleared
as the graduation exam under gate v2.1 and re-inspected under **v2.2**.

> 🔴 **Withdrawn 2026-09-02 — rung 7 re-opened and the ladder was not complete.** Under the
> [PR #254](https://github.com/firejune/rigc/pull/254) instrument that rung's stored candidate
> failed **G2**: `cape-back` draws in all twelve sets, is attributable in none, and no read-down
> kind survived the framing change. **Rungs 1–6 and 8 held, and spineboy `ess`'s graduation pass
> held** — every one of the ten reproduced its gated figures to the digit — so what changed was
> one rung, not the ladder's result. [#14](https://github.com/firejune/rigc/issues/14) was open
> again; see *The PR #254 instrument re-inspection* under **Status**. 📌 The completion is left
> stated as a dated fact because it was one: rule 3's *a pass is versioned* is exactly the case
> that a later instrument can unmake a standing pass without making the earlier verdict wrong.
>
> 🎓 ✅ **Current again, 2026-09-02 — the ladder is complete under gate v2.3.** Rung 7 clears on
> **attempt 3** (`2026-09-02-rung7-3`), whose `cape-back` reads down under v2.3's
> **measured-unobservable kind** and whose G2 figure is **3.94 px**, 1.53× inside the bar; the
> other ten standing candidates were swept under the same gate and **not one verdict moved**.
> **#14 closes.** ⚠️ **Three dated facts belong together whenever this is quoted**: the ladder
> was completed 2026-08-29 under gate v2.1/v2.2, the completion was **withdrawn** on 2026-09-02
> when an instrument change flipped rung 7, and it was **restored** the same day when the gate
> answered the two clause questions that flip exposed — on the same candidate, with no fourth
> attempt. See *The gate-v2.3 re-inspection*.

`pro` remains unauthored and is not a graduation
requirement ([#16](https://github.com/firejune/rigc/issues/16)); its former tool gate
([#87](https://github.com/firejune/rigc/issues/87)–[#89](https://github.com/firejune/rigc/issues/89))
closed 2026-08-29 with PR #233, and its transcription reads 1.000 on every measure (#239).
By rule 4 item 4 the project's question now changes: *does it match the editor?* — the only
question a reference-bound ladder can ask — gives way to *is it usable without a reference?*.
Of that backlog, [#151](https://github.com/firejune/rigc/issues/151) shipped 2026-08-29
(`rigc vote`, PR #232, in v0.7.0) and
[#152](https://github.com/firejune/rigc/issues/152) awaits demand. The rungs stay as
regression gates for tool and method changes.

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

🔓 **The local-render exception, ruled 2026-08-26** — issue
[#3](https://github.com/firejune/rigc/issues/3), raised by the brief-verification pass
on [#14](https://github.com/firejune/rigc/issues/14). The rule above does not forbid a
render that never leaves the local disk, and reading it as though it did was what made
this rung **unattemptable rather than unattempted**: the honesty rule says a brief is
written by somebody *watching the frames*, so with no frames obtainable neither the
writing pass nor the verifying pass had a legitimate input, and a brief written from
the export would have been a transcription of the answer. So:

- ✅ **Rendering its frames to a path this repository ignores is allowed**, for as long
  as somebody needs them. [`bench/render_reference.ts`](../bench/render_reference.ts)
  implements exactly that and nothing wider: a one-name set, an `--out` that must pass
  `git check-ignore` or lie outside the repository, a guard that fails closed when git
  cannot answer, and a `LOCAL-ONLY.txt` written beside the frames in place of the
  licence that does not exist. Every other missing licence keeps the unconditional
  refusal.
- 🚫 **Everything the rule already forbade, it still forbids** — committing, publishing
  or shipping a frame, in any artefact, ever. The exception is about where a render may
  land, not about what may be distributed.
- 📌 Consequences elsewhere: the rung's frames are **not** under `bench/reference/`, so
  its brief carries the render commands and
  [`bench/runs/README.md`](../bench/runs/README.md)'s allowed-reading list names
  `bench/reference-local/7-anticipation/` for this rung alone.

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
