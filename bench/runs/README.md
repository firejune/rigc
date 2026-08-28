# Ladder runs — the protocol

One directory per **attempt at a rung**. A run is the record of an agent authoring
a rig from a brief: what it was given, what it wrote, what the gate said at each
turn of the loop, and where the measures landed.

Nothing in here is a rung's verdict. A rung is marked cleared by a person reading
the measures, and [docs/LADDER.md](../../docs/LADDER.md) is where that judgement is
written down.

⚠️ **Concurrent agents use `git worktree`, never the shared checkout.** A run in
progress is a working tree with in-flight edits — its own, and sometimes the
repository's: rung 2's second attempt hit a `SyntaxError` mid-loop from a
`src/check.ts` refactor landing in the same tree it was checking against, and lost
~100 s waiting it out. A rung attempted from a separate worktree cannot collide with
another agent's uncommitted work or with a tool mid-edit underneath it.

## Which rungs can be attempted

A rung is attemptable when it has a brief and reference frames. This table says
what is prepared and what is peculiar about attempting it; the ladder's own order,
status and gating features live in [docs/LADDER.md](../../docs/LADDER.md).

| Rung | Brief | Brief verified | Reference frames | Candidates | Watch out for |
| --- | --- | --- | --- | --- | --- |
| 3 | [`3-timing-and-spacing.md`](../briefs/3-timing-and-spacing.md) | **yes (third party)**, rev 2, 2026-08-26 | 2 animations, 12 fps | **2** | the two parts never overlap on any frame, so the frames decide **no** draw-order edge here — the deciding-pixel set is empty rather than narrow; and this example's supplied atlas is packed at `scale: 0.5`, which puts a floor under the MAE that no key can move (§9.2 of [AUTHORING.md](../../docs/AUTHORING.md), measured in [`2026-08-26-rung3-1`](2026-08-26-rung3-1/README.md)) |
| 1 | [`1-weight-and-mass.md`](../briefs/1-weight-and-mass.md) | **yes (third party)**, rev 2, 2026-08-26 | 2 skeletons, 12 + 24 fps | **3** | two shots; see the note below. Both rates are committed **in full**, so a hold can exist in one set and not the other — the reference holds across 12 fps f38→f39 while both 24 fps pairs inside that span change, and `check` reads each set against itself (measured in [`2026-08-26-rung1-1`](2026-08-26-rung1-1/README.md)). This example's supplied atlas is packed at `scale: 0.5` too, so the same MAE floor rung 3's row names applies here. Neither `drop` set ships a sheet — a one-frame set gets none — so G7 can only SKIP on that skeleton |
| 2 | [`2-the-12-principles.md`](../briefs/2-the-12-principles.md) | rev 2, 2026-08-23 | 4 animations, 12 fps, **contact sheets + 2 stills each** | 1 | 4 × 25.8 s; the sheets *are* the frame set |
| 4 | [`4-wave-principle.md`](../briefs/4-wave-principle.md) | **yes (third party)**, rev 3, 2026-08-26 | 3 animations, 12 fps + 24 fps sheets | **2** | one shared viewport; in `ball-catch` the whole rig travels, not just the ball. The saucer is an **ellipse**, so `prot` and `prot + 180` differ only in which side a 3 px band sits on and a chain free to bend 180° absorbs the swap — bound the chain or the fit answers in −740° ([`2026-08-26-rung4-1`](2026-08-26-rung4-1/LOOP.md) §2.1). And the ball's contact happens **entirely between** 12 fps frames 84 and 85, so it is in the `@24fps` sheet and nowhere else |
| 5 | [`5-squash-and-stretch.md`](../briefs/5-squash-and-stretch.md) | **yes (third party)**, rev 3, 2026-08-26 | 3 animations, 12 fps + 24 fps sheets | **2** | subject ~4–16 px; proportions are measured, not seen; the second candidate is the first authored from rev 3, so its figures do not compare with the first's |
| 6 | [`6-arcs.md`](../briefs/6-arcs.md) | **yes (third party)**, rev 3, 2026-08-23 | 1 animation, 12 fps + 24 fps sheet | 1 | the subject **deforms**; ball ~14 px; proportions are measured, not seen |
| 8 | [`8-follow-through.md`](../briefs/8-follow-through.md) | **yes (third party)**, rev 2, 2026-08-23 | 2 skeletons, 1 animation each, 12 **and** 24 fps in full | **2** | two shots that want opposite machinery — `pendulum` deforms nothing, `ball` deforms on most frames; the `ball` shot moves over 130 px between two 12 fps frames, so read it at 24 fps; the chain's lag is **horizontal only** |
| spineboy | [`spineboy.md`](../briefs/spineboy.md) | **yes (third party) ×3**, rev 4, 2026-08-27 — the revision-2 gun-hand contradiction ([#111](https://github.com/firejune/rigc/issues/111)) is **settled by measurement** (rev 3): the gun is in the **far** hand, `idle` and `walk` say so, and nothing about the gun's arm is left for a run to rediscover. Rev 4 is the first pass under the tolerance-in-claim rule and the fifth reading, and it found the brief counting differences at **2/255**, finer than the measure — so `ess/death`'s nine-frame hold read "24–45 px" where the per-frame comparison reads **eight exact holds and one 1 px pair**, and the shot's f13–f17 tail (the feet coming to rest after the body has) was described by no passage at all. Both are fixed, `run` gained the blaster's 121 px sweep, and the pointer at this repository's ladder row is gone | 2 skeletons, 19 animations, 12 fps in full **+ 30 fps sheets** | **5** (`ess`; `pro` is optional) | the rung clears on **`ess` alone**, and `ess` has **8** animations — the ladder row's "11" is `pro`'s count; `pro`'s line is printed *(stretch — does not count)*; the two skeletons are at different scales, so no pixel figure crosses between them; the second rate is **30 fps** and only two frames per animation are on disk at it, so the sheets are for timing and never for a distance. ⚠️ **This brief's difference counts are at 2/255 throughout** — read every "still" at `check`'s 8, which the brief now does for you |
| 7 | [`7-anticipation.md`](../briefs/7-anticipation.md) | **yes (third party)**, rev 3, 2026-08-28 — rev 3 promotes two claims out of their hedges after the first climb: the panel's draw-order edge is **frames-forced** (flanked-beige measurement on all 102 frames), and the sack **needs a deforming attachment** (no affine image of the art fits any frame). Both re-derived from local frames, neither taken from the run's record. The cape's mechanism is still undecidable and the brief now says the sack's verdict must not be read across to it | **local-only, never committed**: 4 animations, 102 frames at 12 fps, plus 24 and 30 fps sheets | **2** | the frames are not in this repository: render them yourself with the exact commands in the brief, into the gitignored `bench/reference-local/`, and pass `--frames` to `check` and `bench`. The brief's figures depend on conventions it states and none of which is the obvious choice — opaque means **alpha ≥ 128** on the art, velocity is a **central difference**, "differ in colour" counts are at **exact equality** while silhouettes are at 8/255, the flanked-beige test runs on **raw** masks, and the affine residual is quoted across **three grid resolutions** because a control at the art's own density measures point count rather than shape. 🚫 **The `scale: 0.5` texture floor rung 3's row names is NOT measurable on this example, and the two attempts settled that between them** — this atlas packs its regions `rotate: 270` and trimmed, so `check --atlas` substitutes region **geometry** as well as texture and the figure goes the *wrong* way (up, on every set). Read it as inconclusive, not as a floor, and do not re-quote attempt 1's floor figure — it rests on the same substitution (§9.2's 🚨). And the declared box is **refused on every set** for a reason that is not a coordinate error (the test is on extent), so expect a fitted framing and report both figures |

**Brief verified** is the header block described in the next section. Rungs 3 and 1
were attempted before the rule existed, and their recorded runs are labelled against
the unverified revision they were authored from; both briefs took the pass on
**2026-08-26** (revision 2 each). **Rung 7 took its first pass on 2026-08-27**
(revision 2), which was also **the first verification pass that had to render its own
frames** — the rung-7 paragraph below is what that costs. **14 items were corrected**
and nothing else moved: nothing went into the brief's "cannot tell you" section and
nothing came out of it, and both of its draw-order readings survived as written.
⚠️ **The pattern worth carrying forward from it is not a wrong digit
either: three of the fourteen were unstated *conventions*, not values** — what "opaque"
means on the art, whether velocity is a forward or a central difference, and whether a
"differ in colour" count is at exact equality or at the mask threshold. Each one was
reproducible only by guessing the author's choice, and the obvious guess was wrong in
all three cases; a forward difference flips one correlation's **sign** (−0.03 to +0.24).
**A method disclosure that names its estimators still hides the answer if it leaves out
the arithmetic underneath them.**
⭐ **Its revision 3 (2026-08-28) is the first pass to run *after* a rung's first climb,
and it shows what that vantage is for: both of its changes moved claims OUT of hedges
rather than correcting digits.** The panel's draw-order edge and the sack's need for a
deforming attachment were both being carried as open when the frames already forced
them — and in both cases what had kept them open was a **discarded estimator**, not
missing pixels. One had failed its control over an axis-order bug one line deep; the
other had never been tried. ⇒ **A brief's hedges are worth re-attacking with better
instruments, not just its numbers** — and a claim parked in *cannot tell you* is a claim
nobody re-measures unless a later pass goes looking. That pass also had to resist the
symmetric error: it promoted the sack's deformation and left the **cape's** mechanism
undecidable, because the estimator that settles one part needs a silhouette belonging to
one part, and both cape images are the same colour.
**spineboy is the third brief to carry a third-party pass** (2026-08-23, revision 2):
of 179 claims, 146 verified — both duration tables entire, and most of `death`,
`jump`, `shoot` and `hit` to the digit — 31 were corrected and 2 moved into the
brief's "cannot tell you" section, and one claim went the other way (the figure is
decidably in front of the vortex, so the frames settle **two** draw-order edges, not
one; revision 3 has since made it three). **It is also the first brief to carry a
second third-party pass** (2026-08-24, revision 3, a different agent again), which
took a single question — which hand holds the gun — and settled it against the frames
instead of choosing between the two answers revision 2 gave: the gun is in the **far**
hand, and the working is in the brief's *Verification notes — revision 2 → 3* — **and
the first to carry a third** (2026-08-27, revision 4, a third agent), which is the
first spineboy pass held to the tolerance rule in *What the verifying agent does*
below and to the honesty rule's fifth reading. It corrected six claims, put three
stillness clauses on the tolerance they are read at, added the two passages the brief
had left out — `ess/death`'s f13–f17 and `ess/run`'s blaster — and dropped a live path
into `docs/LADDER.md`'s status table.
⚠️ **Its finding generalises and is worth carrying to any brief written at a
self-chosen threshold**: spineboy counts frame-to-frame differences at **2/255**, which
is *finer* than `CHANGE_TOLERANCE`, and the failure mode is the mirror image of rungs 3
and 5's. Theirs said "still" and a later reader tightened it to exact equality; this one
said "24 to 45 pixels" for a passage the measure reads as **eight exact holds and one
one-pixel pair**, so an author who believed the brief would build a crawl into a hold.
**A tolerance finer than the measure's is as misleading as one coarser, and neither
shows up unless the claim carries its threshold.** Rung 6
is the first brief to carry the pass the protocol actually asks for — a **different**
agent, not the one that wrote it. Rungs 2, 4 and 5 were re-measured by their own
author, and their revision-2 headers say so; **rungs 4 and 5 then took the
third-party pass on 2026-08-26** (revision 3 each), which leaves **rung 2 as the one
brief whose latest pass is still its own author's**. **Rung 8 is the second to carry
a third-party pass** (2026-08-23): its revision 1 stated its estimators and their
controls in its own header, which is what let the verifying pass attack the method
rather than only the digits — and that is where most of what it found came from. Of
79 claims, 61 verified (many to the digit), 13 were corrected and 5 moved into the
brief's "cannot tell you" section. Two claims went the other way: draw order in
`pendulum` and area conservation in `ball` were listed as things the frames could not
decide, and the frames decide them.

⚠️ **Two of those findings are worth carrying forward as patterns, because neither
was a wrong digit.** The first: a lag fitted to a 2-D velocity is meaningless when
the axes lag differently — rung 8's chain is a third of a second late *horizontally*
and not late at all *vertically*, and a combined correlation returns a third number
that is true of neither. The second: rung 8 rev 1 quoted a `chord ÷ arc` floor of
"0.924–1.027" for a **straight** shape, and a ratio of a chord to the arc it subtends
cannot exceed 1 — the impossible value was itself the evidence that the two halves
were measured off different curves. **A control that returns an impossible number
has told you something; read the number, not just the pass/fail.**

⚠️ **"Re-measured twice" is not the same as "verified".** Rung 6's revision 2 was a
second pass by the writing agent, with different machinery throughout, and it still
left the brief asserting a one-piece stone that is two pieces, a ball flattened in
free flight that is round, and a set of 24 fps figures measured on frames that were
never committed — so nothing downstream could check them. Two of those survived
*because* both passes shared the same working set. That is the whole reason this
section names a different agent.

⚠️ **A rung with two skeletons needs two candidates, and `bench` does not know
that.** `bench <N> --candidate <dir>` takes one candidate and diffs it against every
reference skeleton of the rung, so it prints a line per skeleton whichever candidate
you give it. Build both, run `bench` once per candidate, and read only the matching
line from each — then say in the log which line came from which run. Quoting the
other line as though it were a measurement of anything is the failure mode here.
**Rung 8 is the first two-skeleton rung run since this was written, and it confirms
the warning is load-bearing**: both of its runs printed a confident, plausible line
for the skeleton the candidate was not built from
([`2026-08-23-rung8-1/README.md`](2026-08-23-rung8-1/README.md), *The measures*,
marks each ⚠️ and quotes only the matching one). This is the rule for the agent
producing a report; [docs/LADDER.md](../../docs/LADDER.md)'s *Running a rung*
carries it for whoever reads one.

⚠️ **spineboy is a two-skeleton rung where only one of them counts.** `ess` is the
rung; `pro` is a **stretch** skeleton — `bench` labels its line *(stretch — reported,
does not count)* — because it is a harder rig than the graduation exam and folding it
in would make the exam unpassable for a reason unrelated to passing it. A run that
builds only `ess` is a complete attempt at the rung. The `pro` line that `bench`
prints from an `ess` candidate is still noise, and the same rule applies to it.

⚠️ **A colour predicate can be satisfied by two different parts, and a control the
whole shot passes will not notice.** spineboy's verification found the brief's "gun"
estimator counting the figure's teal hair as well as the gun — nearly half the
reading — and revision 1's control (a stable 5 % band over 21 stance frames) passed
precisely *because* the hair is stable in those frames. What caught it was
compositing the two art files at the sidecar's own scale and predicting the
estimator's output: 321 px of gun and 268 px of hair against a measured 599–631.
**Predict what a part should read before believing what a frame does read.**

## Before a rung is attempted — the brief needs a second pair of eyes

🚫 **A brief is not run until a second agent has verified every claim in it against
the frames.** Not the agent that wrote it, and not the agent that will author the
rung.

The brief is the only description of the shot an authoring agent gets, and it is
written by somebody watching the frames rather than reading the export — so it
carries the ordinary risks of a viewer's report, and the honesty rule cannot catch
any of them. Nothing downstream can either: the gate checks validity, `bench` is the
finish line, and a wrong sentence in the brief spends the run's time before either
of them sees it.

Precedent, 2026-08-23: revision 1 of
[`2-the-12-principles.md`](../briefs/2-the-12-principles.md) asserted that the water
level in the basin falls, that the rings turn *slowly*, and that the panel swings
flat *because the ball reaches it*. None of the three is in the pixels — the basin is
bit-identical across all 311 frames of two of the shots, the rings turn once every
15 frames in opposite directions, and the panel runs on a fixed ~2.3 s cycle in every
animation including the two whose ball never gets near it. The run
([`2026-08-23-rung2-1/`](2026-08-23-rung2-1/)) lost two detours to them before
measuring each and overruling the brief, and its log asks for exactly this rule:
*"the brief is a viewer's report, not a measurement — check its claims the same way
you check your own."* A second pass over the same sheets then found three more.

What the verifying agent does:

- Take every quantitative and behavioural claim in the brief in turn — counts,
  rates, durations, "always"/"never", causal statements ("X happens *because* Y"),
  and anything that says one shot differs from another — and measure it off
  `bench/reference/<example>/`.
- **Measure, do not eyeball.** These frames are small; the rung 2 defects were all
  plausible on a glance and all false under a pixel test. The same traps §8 of
  [docs/AUTHORING.md](../../docs/AUTHORING.md) names for the authoring agent apply
  here.
- ⭐ **State the tolerance — and the measurement convention — a claim was measured at,
  whenever a later reader might re-measure it differently.** Stillness is the case that
  bites: `check` calls a pixel
  changed only when a channel moves by more than `CHANGE_TOLERANCE`
  ([`src/check.ts`](../../src/check.ts), 8 levels), so pairs that read *still* to the
  measure are routinely **not** identical to the bit — and a later verifier measuring
  exact equality "corrects" the hold to start a frame later, or away entirely, which is
  a regression no frame shows. Rungs 5 and 3 both shipped that defect and both now
  carry the tolerance in the claim.
  - ⚠️ **It bites in both directions, and the other one is worse** (spineboy, revision
    4, 2026-08-27). A brief that measures at a threshold *finer* than
    `CHANGE_TOLERANCE` reports motion where the measure reads a dead hold: spineboy
    counts at 2/255 and so described `ess/death`'s nine-frame stillness as "24 to
    45 px", where at 8/255 eight of those nine pairs are **exactly 0** and the ninth is
    **one pixel**. An author who believed the brief would build a crawl into a hold —
    and stillness is the one thing the per-frame comparison treats categorically, so
    moving at all against a still reference is a disagreement however small it is. ⇒
    **State the threshold, and if it is not the measure's, quote the measure's reading
    too.**
  - ⚠️ **A convention fails the same way and can fail worse than either direction of a
    threshold** (rung 7, revision 2, 2026-08-27,
    [#14](https://github.com/firejune/rigc/issues/14)). Three of that pass's fourteen
    findings were arithmetic choices the brief never named — what *opaque* means on the
    art, whether a velocity is a forward or a central difference, and whether a "differ
    in colour" count is at exact equality or at the mask threshold — and the obvious
    guess was wrong in all three, so each made a **correct** figure unreproducible. A
    threshold read the wrong way moves a boundary a frame; the velocity convention
    **flips a correlation's sign** (−0.03 becomes +0.24), which turns a true per-axis
    finding into its opposite. ⇒ **If a figure would change under a defensible
    alternative reading of *how* it was computed, the reading is part of the claim.**
- Correct what is wrong *in the brief*, in the terms a client watching the shot
  could give — never by opening the reference export. The verifier is under the same
  honesty rule as the run agent, and a brief repaired from the answer is worse than
  a brief with a mistake in it.
- Bump the brief to the next revision and open it with a header block saying **who
  verified it, on what date, and what was corrected**. That block is the record; a
  brief with no verification line has not been verified.

A brief that is corrected after a rung has been attempted invalidates nothing that
was already recorded — the run's measures stand, labelled against the revision they
were authored from — but the rung is worth re-attempting from the corrected text.

⚠️ **Rung 7 is the one rung whose frames the verifying agent has to render first, and
the render is part of the pass.** `7-anticipation` ships no upstream `license.txt`, so
its frames may exist **locally only** — the owner's ruling of 2026-08-26 on
[#3](https://github.com/firejune/rigc/issues/3), which is what made the rung
attemptable at all ([#14](https://github.com/firejune/rigc/issues/14) has the
reasoning: with no frames obtainable there was no honest input for either the writing
pass or the verifying pass). Three consequences for a verification pass over that
brief:

- **Render the frames with the commands the brief states, flag for flag.** They land
  in `bench/reference-local/7-anticipation/`, which `.gitignore` covers and
  `render_reference.ts` refuses to write outside of. The render **is** deterministic —
  two independent renders of the 12 fps set produced identical digests on 2026-08-27 —
  so those commands are what makes the brief's figures checkable at all: a pass at
  another `--max` is measuring a different picture and its disagreements mean nothing.
- 🚫 **Never commit a frame of it**, or include one in any artefact. `git status`
  before every commit of a rung-7 pass, and `git ls-files bench/reference-local`
  should report 0.
- The brief's header names its estimators, its controls, **two estimators that failed
  their controls**, and — since revision 2 — the arithmetic conventions underneath them.
  Attack those first: one failed estimator had already put a wrong figure into a draft
  of the brief and its control is what caught it, and the 2026-08-27 pass found that
  three of its own disagreements with the brief were unstated conventions rather than
  wrong measurements.

## The run agent

**Fresh context, and no history of this repository.** A session that has already
looked at a reference export cannot un-look at it, so a rung is attempted by an
agent started for that purpose.

### What a run may read

⭐ **The two lists below are the honesty rule in operational form, and the prompt
handed to an authoring agent must quote them both.** Not link them — quote them. An
agent cannot avoid a document it was never told to avoid, and every leak recorded on
this ladder so far arrived through a document the run was *told* to read.

⭐ **What decides whether a text belongs on them is the answer-derivability test**, in
[docs/LADDER.md](../../docs/LADDER.md)'s *The honesty rule*: a text is sealed **iff it
states or constrains a reference-side value of a scored measure**, and provenance alone
does not seal. That criterion lives there and only there, because it is a rule for
whoever maintains these lists rather than something a run reads — the lists are the copy
that goes into a prompt. Two consequences the test carries for this file: an allowed
surface must be **closed under reading**, so a citation out of one into a sealed
document is a leak by another route; and a candidate-side figure measured against the
frames is not answer-bearing, so it is not swept out.

**✅ Allowed — the complete list.**

1. the rung's brief, `bench/briefs/<rung>.md`;
2. the rendered reference frames and contact sheets under
   `bench/reference/<example>/`, and their `frames.json` sidecars — **and, for rung 7
   alone, `bench/reference-local/7-anticipation/`**, where that rung's frames have to
   be rendered because they may not be committed (the brief carries the commands; the
   path is gitignored and `render_reference.ts` will not write outside it);
3. the art, `examples/<example>/images/`;
4. that example's **`.atlas`** — the atlas is a supplied input rather than something
   the agent authors (rigc has no packer, B3), and it is packed *from* the loose PNGs
   in (3). It is the one file under `examples/*/export/` a run may open, and the
   skeleton JSON beside it stays the answer. A run that does not need it — rigc emits
   its own atlas from the PNGs — should say so and skip it;
5. [docs/AUTHORING.md](../../docs/AUTHORING.md) in full, §8, §9 and §10 included;
6. Spine's public documentation at esotericsoftware.com;
7. this repository's own source and README as documentation of the input formats —
   `src/rig.ts`, `src/types.ts`, `src/render.ts`, `src/check.ts` and the rest;
8. the CLI: `bun cli.ts build` / `explain` / `validate` / `diff` / `check`, and
   `bench` **once, at the end**;
9. earlier runs' `README.md` and `LOOP.md` **for process only** — how a loop is run
   and what a log looks like — and **not** another attempt at the rung being
   authored, whose **measures** are the answer one step away;
10. ⭐ **and, for a successor attempt at the same rung only, the prior attempt's own rig
    spec, motion spec(s) and fitting harness** — its author-authored inputs and tools,
    and none of the files beside them that record a measurement. Owner ruling,
    2026-08-28. The exact file split and the reasoning are in *Inheriting the prior
    attempt's candidate* below, and a run that inherits **must** read that section
    before it opens the directory.

**🚫 Forbidden — and each of these has a reason beside it.**

| Not this | Why |
| --- | --- |
| `examples/*/export/*.json` | the reference skeleton. This is the answer |
| `bench/transcriptions/**` | the same answer rewritten by a script that read it |
| [docs/LADDER.md](../../docs/LADDER.md)'s **status table**, its **per-rung sections** and its **Operating rules** | the table's *New at this rung* column publishes bone, slot and animation counts per skeleton, which the briefs withhold on purpose; the per-rung sections publish every previous run's measures; and *Operating rules* — the pass definition and the current gate — derives its thresholds by quoting those measures back, so it carries them too. All three are the ladder's bookkeeping and stay where they are — a run simply does not read them. The two parts of that document a run *should* read are *How a rung is scored* and *The honesty rule* |
| [docs/SPEC_COVERAGE.md](../../docs/SPEC_COVERAGE.md) | all of it. Part 3 inventories what the corpus actually uses and part 4 lists, rung by rung, the bones, slots, constraints, attachment kinds and timelines each example skeleton carries. It is a reference export in prose |
| [`src/ladder.ts`](../../src/ladder.ts)'s **gate strings** | the same counts again, in code — `gates:` on each rung entry names the features and the sizes |
| **issue bodies carrying counts or measures** | the per-rung issues (#10–#18) and any issue quoting a `bench` line. A number reaches an agent the same way whichever file it is in |
| any **derived form** of the above | bone names, key times, curve handles, timeline listings, however they arrive — a previous session's summary, a commit message, a paste, a chat quote |
| `bench/render_reference.ts` | it reads the export to produce the frames |
| git history, `git log`, blame, tags | the transcription commits are in it |

⚠️ **This list is written down because it was breached, and by this repository's own
documents.** The spineboy run of 2026-08-23
([`2026-08-23-spineboy-1/`](2026-08-23-spineboy-1/)) read `docs/LADDER.md`'s status
row for `ess` as a **sizing check** — it had been told to read the row — and read a
§3.6 example in AUTHORING.md that stated the reference's `events` block outright.
Both are recorded rather than hidden, in that run's README and `LOOP.md` §1, and both
are sealed as of this revision. **Its name-matched figures carry that caveat**, and
the rung is not discussed as cleared until an attempt after the seal.

### Inheriting the prior attempt's candidate

⭐ **Owner ruling, 2026-08-28, decided on the spineboy attempt-4 verdict
([#16](https://github.com/firejune/rigc/issues/16)): a successor attempt may inherit the
prior attempt's candidate — the author's own work-product — instead of rebuilding it
from zero.**

**✅ What may be inherited — the author-authored inputs and tools:**

- the **rig spec**, `<name>.rig.json`;
- the **motion spec(s)**, `<name>.motion.json`;
- the author's own **fitting and tooling harness** — that run's `tools/`, and the
  intermediate stores it wrote for itself (placement fits, key plans, pose caches,
  setup dumps).

**🚫 What stays sealed, exactly as before — everything beside them that records a
measurement:**

- `README.md` and `LOOP.md`, which a successor still reads **for process only**, as
  item 9 has always said;
- `bench.json`, and any stored `bench` output;
- stored `check` output, and any other file in that directory that records what the
  prior attempt **scored**.

⚠️ **So "inherit the candidate" is not "read the run directory."** The two halves sit
side by side on one disk and only one of them crosses. A successor that opens
`bench.json` for a starting point has read the answer key, and the fact that the spec
next to it was fair game does not launder that.

**Why the spec crosses and the measures do not.** A candidate spec authored under honest
conditions **contains no reference-side value its author did not legitimately derive** —
that is precisely what the honesty rule bought when the spec was written, and it does not
expire because a second attempt begins. The measures are the other thing entirely: they
are scored *against* the reference, they carry its denominators, and reading them is
reading the answer however they are phrased. ⇒ **Inheriting a spec changes the attempt's
economics, not its honesty.**

📌 **The sealed line is drawn at the file, deliberately more conservatively than the
answer-derivability test alone would require.** A candidate-side `check` figure is not
answer-bearing — [docs/LADDER.md](../../docs/LADDER.md)'s *The honesty rule*, first
reading — and a successor runs `check` itself as often as it likes, exactly as item 8
allows. What it does not get is the prior attempt's **record**: `README.md` and
`bench.json` quote reference-side denominators, `LOOP.md` narrates them, and picking the
answer-bearing lines out of a stored log is not a judgement worth asking a run to make
mid-flight.

🎯 **Scope: successor attempts at the same rung, and the same skeleton.** A candidate
built for one skeleton is not an input to another skeleton's attempt, and a spec from a
different rung was fitted to a different reference. Nothing here widens item 9 for any
other run, and nothing here changes the gate, the clauses or the bar.

🧾 **Say so in the log.** A run that inherits records **what** it inherited and **from
which attempt**, in `LOOP.md` §1 beside the reference-not-read line. An inherited attempt
and a from-zero attempt are not measuring the same thing about the model, and a reader
comparing them needs to know which one they have.

### Three of those entries carry a reason

The list above is the whole of what a run is given; these three are the ones a
prompt keeps getting wrong.

**AUTHORING.md is read in full, §8 and §10 included.** §8 is about reading reference
frames, and it exists because the first run got three measurements wrong in ways
that each looked like a fact about the animation. §10 is the editor's own default
conventions, a standard input from 2026-08-23 (below).

**Reading this repository's own source is fine** — `src/rig.ts`, `src/types.ts` and
the README are documentation of the input formats. `src/ladder.ts` is the exception
and it is in the forbidden table: its `gates:` strings carry per-skeleton counts.

✅ **Spine's public documentation is allowed input, and always was.** The honesty
rule forbids facts read out of *this repository's* reference exports. It does not
forbid esotericsoftware.com. What the Spine editor does by default, what its user
guide recommends, and what its JSON format page says a field means are public
knowledge that any author sitting down to rig a shot already has — withholding them
does not measure honesty, it measures whether the agent happened to know Spine.

📌 **From 2026-08-23, [docs/AUTHORING.md](../../docs/AUTHORING.md) §10 is a standard
input.** It collects those conventions with a citation on every line, marked 📗 for
what a page states and 🧩 for what the guide infers, and it names in §10.6 the
conventions it deliberately leaves out because no public page states them. It was
written after six honest runs showed the same divergences — one slot per attachment
image, key density, curve kind, draw order keyed rather than re-parented — none of
which the gate can see and all of which `bench` measures.

⚠️ **So runs are not all comparable.** A run dated **before 2026-08-23** was authored
without §10; a run **on or after** it had those conventions in hand. Say which in the
run's header block, and do not read a change in the convention measures across that
boundary as a change in the model.

🚫 The allowance is for **documentation about Spine**, not for anything about a
rung. A forum post, blog comment or third-party article that describes one of the
example projects — its bones, its timing, its key times — is the answer arriving by
another route, and the rule against derived forms below covers it.

### What it must not read

**The forbidden list is the table in *What a run may read* above** — one copy, and
that is the copy. It names `examples/*/export/*.json`, `bench/transcriptions/`,
`docs/LADDER.md`'s status table, per-rung sections and *Operating rules*, `docs/SPEC_COVERAGE.md`,
`src/ladder.ts`'s gate strings, issue bodies carrying counts, `render_reference.ts`,
git history, and any derived form of any of them.

The two rules that decide the loop rather than the reading list are here:

⚠️ **`bench` is the finish line, not a rung of the loop.** Its diff measures are
derived from the reference, so editing the spec in response to them is tuning
against the answer. Run the authoring loop against `build`'s own validator report;
run `bench` once, at the end. If a run does read `bench` and then keeps editing, say
so in the log and label the run **bench-assisted** — its measures are still worth
recording, and they are not comparable to a clean run.

✅ **`check` is not `bench` — it stays in the loop.** It never opens the reference
skeleton, only the frames, so running it as often as you like does not make a run
bench-assisted. See [docs/AUTHORING.md](../../docs/AUTHORING.md) §0 (where it sits
in the loop, after `build`) and §9 (why it exists and how to read it) — every clean
run recorded here used it this way, some of them dozens of times.

## The output

```
bench/runs/<YYYY-MM-DD>-rung<N>-<n>/     e.g. 2026-08-22-rung3-1/
  <name>.rig.json        the rig spec the agent wrote
  <name>.motion.json     the motion spec the agent wrote
  spine/                 the compiled candidate: skeleton.json + skeleton.atlas
  README.md              the figures and the reading — see below
  LOOP.md                the loop log, one entry per turn — see below
  bench.json             the final `bench <N> --json` report
```

`<n>` counts attempts at that rung on that date, from 1. A rung with two skeletons
puts each candidate's specs and `spine/` in a subdirectory named for it.

`bench.json` carries no gate string. It used to copy `src/ladder.ts`'s `gates:`
verbatim — a forbidden fact (see the table above) written by the finish line into a
file this protocol requires committing, and so left within reach of every later run
that opens an earlier run's directory for process notes. The report now identifies
the rung by `rung` alone; the gate string is printed to the console only, for the
person reading the run (issue #137). Runs before that fix may still carry it —
`2026-08-24-spineboy-3` redacted the field by hand.

### `README.md` and `LOOP.md`

Two files, because they are read by different people at different times.
**`README.md`** is the run's own account of itself — its header block, its inputs,
what was built, the measures verbatim, the reading, what is known-wrong, and what the
guide should have said. **`LOOP.md`** is the turns: every `build`, every `check`,
every dead end, in order. A reader who wants the verdict stops at the first; a reader
who wants to know **what the agent could not tell without compiling** — the
measurement this whole exercise exists for — reads the second.

Every run from rung 3's second attempt onwards ships both. The single `log.md` this
template used to show was the shape of the first two runs only.

Open `LOOP.md` with a header block, then one entry per turn:

```markdown
# Rung 3 — attempt 1, the loop

- date:      2026-08-22
- agent:     <model / harness>
- inputs:    brief, docs/AUTHORING.md, examples/3-timing-and-spacing/images/,
             bench/reference/3-timing-and-spacing/
- reference: not read   ← or: read, and this run is void
- guide:     AUTHORING.md §10 in hand   ← or: not yet written (runs before 2026-08-23)
- profile:   spine

## Loop

### 1 — build
`bun cli.ts build --rig … --motion … --images … --out … --profile spine`
FAIL A09_ANIMATION_DURATION_MATCHES_SPEC: animation "heavy" loaded duration …
→ changed: the declared duration in the motion spec.

### 2 — build
… green. 17 PASS, 0 FAIL, 7 PROF (renderer), 7 PROF (archetype).

## Result
`bun cli.ts bench 3 --candidate … --json bench.json`
<the summary block, verbatim>

## Notes
What was guessable from the frames and what was not; anything the guide should
have said and did not.
```

Record **every** turn, including the ones that failed for a silly reason. A guide
that leaves an agent to discover something by failing is a defect in the guide, and
this log is the only place that shows up. Record an honesty-rule incident here too,
in §1 — a leak that is named costs the run some measures; a leak that is buried
costs the ladder every figure it ever printed.

## After a run

1. Paste the `bench` summary into [docs/LADDER.md](../../docs/LADDER.md) and move
   that rung's status if a person judges it cleared.
2. Fold anything the log says about the guide back into
   [docs/AUTHORING.md](../../docs/AUTHORING.md).
3. A run attempted with the reference in context is recorded **as such**, or not
   recorded at all.

🩹 **The one exception to a run's record being final** (owner's ruling, 2026-08-26,
[#181](https://github.com/firejune/rigc/issues/181)): a **mechanical portability repair
that changes no measured figure** — an `.atlas` page path that resolves only inside the
worktree the run was built in is the case — may be applied to a stored run as a
**labelled amendment commit**, recorded as an *Amendment* note in that run's
`README.md`. ⚠️ The test is reproducibility, not tidiness: rule 3's re-inspection is *"a
re-read of stored candidates"*, so a candidate only its author's directory layout can
load is one no re-inspection can read. Everything else about a run stays final —
`bench.json` is never rewritten and no measure or reading is ever edited — and the
repair is **verified before it is committed**, by `check` from the repository root with
no `--atlas` override, reproducing the run's own figures to the digit.
