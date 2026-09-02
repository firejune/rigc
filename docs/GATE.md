# The gate — the clause statements

**The bar a candidate is graded against, stated and nothing else.** One section per
clause: the measure it reads, the comparator, the number, and what it does when there is
nothing to read.

Current version: **gate v2.3**, released 2026-09-02.

✅ **A run may read this file.** It is on the allowed list in
[`bench/runs/README.md`](../bench/runs/README.md), *What a run may read*, and the prompt
that starts a run quotes that list outright.

🔒 **Why this file exists, and what is deliberately not in it.** The clauses used to be
stated only inside the ladder's *Operating rules*, which is sealed to an authoring run —
so an author could not legally read the bar they were being graded against, and four
recorded run launches worked around that by naming the sealed section as the pass bar or
by pasting a threshold into a dispatch prompt. The split is the one the honesty rule's own
criterion draws: **a threshold is the exam's grading policy and derives no reference-side
value, while the derivation quotes previous candidates' measured figures and does.** So
this file carries **no recorded figure, no per-rung anything and no derivation**. Where
each number came from is in the ladder's *Operating rules* — named here rather than
linked, because a run does not open it. Owner ruling 2026-08-29,
[#174](https://github.com/firejune/rigc/issues/174).

🚫 **A run does not follow references out of this file**, exactly as
[AUTHORING.md](AUTHORING.md) says about itself: an allowed-reading surface has to be closed
under reading.

---

## How the clauses are read

- **Per skeleton.** A rung with more than one skeleton is judged once per skeleton, and
  **G6** is what combines them.
- **Over every committed frame set of that candidate**, unless the clause says otherwise.
- **A clause with no observable reads SKIP — never a pass.** A SKIP is neither a pass nor a
  failure: the clause has no object, and the verdict is decided on the clauses that *can*
  be read. Each clause below says when it skips.
- **A verdict quotes what it read**, clause by clause, beside the measures that do not
  gate. There is no rung score and no aggregate.
- 📌 **The gate is the reader's instrument, not the author's exit code.** `bench` exits
  non-zero on stage-1 validity alone, `check` prints no pass mark, and the diff has no
  threshold. A rung is marked cleared by a person reading the measures.

---

## G1: validity

`validate --profile spine` on the candidate reports **0 FAIL**.

A candidate that is not valid Spine 4.3 has cleared nothing, whatever else it scores. The
`spine-html` profile is deliberately not used: the thing being reproduced is an editor
export, not this project's renderer policy.

## G2: worst attributable slot drift

`check`'s **worst attributable slot drift**, in **every** measured set: **≤ 6.0 px**.

The bar is **absolute**, in the frames' own pixels, and deliberately not a fraction of the
figure — a relative bar would license a large rig the visible error a small one is refused.

🕳️ **A set with no attributable drift at all is a HOLE, not a pass.** Where
`framesWithoutDrift` equals that set's frame count the clause has nothing to read, and the
set does **not** meet it by default: pin the viewport, split the chain table, or say
outright that the candidate cannot be gated on that set and why.

🆕 **Per slot — gate v2.2.** A slot that **draws** in a measured set and is attributable in
**no frame** of that set is **read down explicitly in the verdict**: name the slot, and name
the evidence that its placement is benign. **A blank that cannot be read down fails the
clause for that set.** The 🕳️ above fires on a *set*; this fires on a *slot*, and it exists
because a part drawn behind another over a flat backdrop can be misplaced and never appear
in the one clause that measures placement — while a blank drift row is the loudest signal
`check` prints. ⇒ **A read-down that cannot name its evidence is not a read-down.**

📌 **This is a disclosure requirement, not a fail-by-default.** `check` declines to attribute
a part the reference has merged into a larger connected component, which on a dense figure
is routine and benign; the limb says that such a part is named and accounted for rather than
passing unread. Nothing about it changes the 6.0 px bar.

🆕 **What a read-down has to satisfy — gate v2.3.** Three requirements, and the first two hold
for every read-down whatever ground it rests on.

- **A read-down states the framing each figure it cites was measured at**, and where the same
  fact is available both as a **framing-independent** quantity and as a **per-pixel** one, it
  cites the framing-independent one. *What never gates* calls a per-pixel mean incomparable
  across framings, so evidence resting on one is worth no more than the framing it was taken
  in, and a read-down that does not say which framing that was has not stated its evidence.
- **A read-down resting on another instance of the same part needs that instance attributable
  at the framing the verdict is read in** — the framing the instrument takes by itself, which
  is the frames' own declared box wherever a set can be measured in it. An instance that exists
  only under some other framing is not a control: it can appear and vanish with the artifact,
  the frames and the rig all unchanged.
- **A slot the frames cannot make attributable reads down by name, on two halves that both have
  to hold.** Where a slot draws and is attributable in no frame of any measured set:
  1. **a measured ceiling on its attributability, below the bar attribution requires.** The
     ceiling is an instrument-side geometric fact about the slot's **visible footprint** — the
     share of a covering placement of it that the frames put on screen at all — measured on
     **every frame of every set** rather than argued from one, and computed from stated
     conventions. The bar is **calibrated on the slots of the same corpus that the instrument
     does attribute**. ⇒ **Both measurements are quoted, and the verdict says which is which.**
  2. **everything observable about that slot verified strict, and verified without the
     attribution that is missing.** Its placement is pinned by a sweep that does not use the
     matcher and that carries a **known-answer control on a slot the clause does attribute**,
     and its draw order is settled by the frames.

🚫 **A ceiling without half 2 is not a read-down.** This ground excuses what is **measured**
unobservable and never what was merely not measured: an unobservable is reported and never
blocks a pass, while everything observable about the same slot stays strict. ⇒ **A verdict
reaching this ground names it**, the way every other ground is named, and a slot whose
observable half is unverified fails the clause exactly as an unexplained blank does.

## G3: per-frame motion

In **every** set: `check`'s `changeDisagreements` = **0**, and **no** set carrying
`⚠️ overdraw`.

`changeDisagreements` counts adjacent frame pairs where the candidate's own frame-to-frame
change disagrees with the reference's. The overdraw half is a hole plugged rather than a
leniency: the union denominator means drawing more buys a better mean, so `check` marks a
set whose `drawnRatio` exceeds `OVERDRAW_RATIO` ([`src/check.ts`](../src/check.ts)).

**Scope — a single-pose set is out of it.** A set of one frame is not a shot sampled too
coarsely; there is no shot in it, and G3 reads adjacent pairs. Such a set is excluded
rather than counted as an unmet clause.

**SKIP.** Where that exclusion leaves a skeleton with **no G3-readable set at all**, G3
reads **SKIP**.

🚫 **That is not a general *no adjacent pair ⇒ SKIP* rule.** A set of **non-adjacent
stills** is a shot sampled twice, not a single pose: it has frames between its samples that
no pair reading ever sees, and that hole is real. The SKIP fires only where *every* shot the
skeleton has is a single pose.

**Discharge.** Where **no** committed set of a shot has an adjacent pair, a sheet of that
shot meeting **G7** discharges the hole: no sampled frame of the shot departs from its own
baseline, which is what the missing pairs left unknown. ⚠️ **Discharges, not replaces** — a
sheet is an MAE series and not a change measure, so a deviation too small to lift a tile
above the flatness bar is invisible to it. Where a shot *does* have adjacent pairs, G3 is
read directly and G7 is read beside it.

## G4: the shot inventory

`animations.count` and `animations.names` at **1.000**; and every animation's **length**
within **one sampling interval of the coarsest rate that shot's frames were committed at**.

**The length limb is a tolerance, not a ratio, and it is not read off `bench`.**
`animations.duration` is a finer agreement than the frames can resolve, so it stays a
**reported** figure; a verdict on this limb **quotes the two lengths** — the candidate's
declared duration and the reference's — where the verdict is.

## G5: the drawn inventory, name-agnostically

Name-agnostic `slots.count` ≥ **0.85** **and** `attachments.count` ≥ **0.85**, each read
**after** the deduction below.

**The deduction.** An element the frames cannot show is deducted from the **reference's**
side of both counts, **item by item and each one named in the verdict**, before the ratio
is read. ⇒ **A deduction that cannot name its item is not a deduction**, and the clause is
then read on the printed figures.

## G7: the whole shot, on a set whose frames are a contact sheet

Every sheet's **worst tile ≤ 3.5 × that sheet's own mean**.

A **ratio inside one sheet** and not a level: numerator and denominator are the same
measurement, in the same box, at the same scale, on the same art — so the clause asks the
only question that survives *the MAE decides nothing across rungs or framings*, which is
**is this sheet flat?**

🕳️ **A set with no sheet reads SKIP, never a pass**, and what the SKIP means depends on why
there is none:

- **the set commits every sampled frame** — the whole shot is already read frame by frame
  under G2 and G3 at that rate, and a sheet would add nothing. A candidate is not failed for
  having better coverage than a sheet;
- **the set is a single pose** — there is no shot to read;
- **a sheet exists and `check` refused it by name**, because its dimensions are not a grid
  of that set's frame count. That one is a **HOLE**: the set is re-rendered, and until it is
  the clause is unmet.

🚫 **G7 is not a tile-level change measure.** The sheet line carries MAE only, on purpose:
the `Δpx` / `ref Δ` thresholds are pixel counts calibrated at frame scale and a tile has a
fraction of a frame's pixels. The change measure stays on the committed stills.

## G6: the rung

**Every skeleton of the rung meets G1–G5 and G7.**

G6 does not care which of a rung's skeletons is the one that cannot pass.

---

## What never gates

Two things are reported beside the clauses and decide nothing.

- 🚫 **The MAE, at any level.** `check`'s means are the instrument the authoring loop is run
  on and they are **not** comparable across rungs or across framings — every shot has its own
  floor, and a set that cannot take its sidecar's own box reads a different number for the
  same keys. A cross-rung threshold on a figure like that would fail rungs for the plate they
  were drawn on. Drift is gated instead, because it is per slot and framing-independent in a
  way the means are not. G7 does not breach this: it reads a **ratio inside a single sheet**,
  and no *level* of an MAE gates anything.
- 🚫 **Anything unobservable by construction.** A measure no reading of the frames could have
  decided is reported and never gates — the test is not *is this measure hard?* but *could any
  reading of the frames have decided it?* That covers every name-keyed measure (a candidate is
  granted its own names), the region-versus-mesh choice and the measures that move with it, key
  density, curve kinds, timeline kinds, constraints, and any measure reading 1.000 at `0/0`,
  which is vacuous. The enumerated table is in the ladder's *Operating rules*, rule 1.

📌 **Report the whole table anyway.** A gating clause and a reported figure are printed side
by side and labelled. A verdict quoting only the gating clauses would be a rung score by
another route, and there is no rung score.

---

## Versions

A pass is **versioned**: a candidate that met an earlier gate met that gate, and a later
version says separately whether it also meets this one. Every version is dated, no clause is
ever renumbered, and the derivations and the re-inspection each version owes live in the
ladder's *Operating rules* and *Status*.

| Version | Date | What changed |
| --- | --- | --- |
| v1 | 2026-08-25 | the first written pass definition over the existing measures |
| v2 | 2026-08-25 | G4's length limb reformulated as a tolerance; **G7** added on the contact-sheet observable |
| v2.1 | 2026-08-26 | G3's scope on a single-pose set, and the SKIP that follows from it |
| v2.2 | 2026-08-29 | **G2's per-slot limb** — a slot that draws but is attributable in no frame of a set is read down explicitly, or the clause fails for that set |
| **v2.3** | **2026-09-02** | **G2's read-down, stated in full** — it names the framing of every figure it cites and prefers a framing-independent quantity to a per-pixel one; a control instance must be attributable at the framing the verdict is read in; and a slot with a **measured** attributability ceiling below the calibrated bar reads down, provided everything observable about it is independently verified strict |
