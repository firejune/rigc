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
| 3 | [`3-timing-and-spacing.md`](../briefs/3-timing-and-spacing.md) | **no** | 2 animations, 12 fps | 1 | — |
| 1 | [`1-weight-and-mass.md`](../briefs/1-weight-and-mass.md) | **no** | 2 skeletons, 12 + 24 fps | **2** | two shots; see the note below |
| 2 | [`2-the-12-principles.md`](../briefs/2-the-12-principles.md) | rev 2, 2026-08-23 | 4 animations, 12 fps, **contact sheets + 2 stills each** | 1 | 4 × 25.8 s; the sheets *are* the frame set |
| 4 | [`4-wave-principle.md`](../briefs/4-wave-principle.md) | rev 2, 2026-08-23 | 3 animations, 12 fps + 24 fps sheets | 1 | one shared viewport; in `ball-catch` the whole rig travels, not just the ball |
| 5 | [`5-squash-and-stretch.md`](../briefs/5-squash-and-stretch.md) | rev 2, 2026-08-23 | 3 animations, 12 fps + 24 fps sheets | 1 | subject ~4–16 px; proportions are measured, not seen |
| 6 | [`6-arcs.md`](../briefs/6-arcs.md) | **yes (third party)**, rev 3, 2026-08-23 | 1 animation, 12 fps + 24 fps sheet | 1 | the subject **deforms**; ball ~14 px; proportions are measured, not seen |
| 7, 8, spineboy | — | — | — | — | not prepared. `7-anticipation` has no upstream `license.txt` at all, so `render_reference.ts` refuses it and it must never be rendered |

**Brief verified** is the header block described in the next section. Rungs 3 and 1
were attempted before the rule existed; their briefs still need the pass, and until
they get it a run against either of them carries the risk the section names. Rung 6
is the first brief to carry the pass the protocol actually asks for — a **different**
agent, not the one that wrote it; rungs 2, 4 and 5 were re-measured by their own
author and their headers say so.

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

## The run agent

**Fresh context, and no history of this repository.** A session that has already
looked at a reference export cannot un-look at it, so a rung is attempted by an
agent started for that purpose.

### What it is given

| Input | Where |
| --- | --- |
| the brief | `bench/briefs/<rung>.md` |
| the authoring guide | [docs/AUTHORING.md](../../docs/AUTHORING.md) — **including §8**, which is about reading reference frames and exists because the first run got three measurements wrong in ways that each looked like a fact about the animation |
| the art | `examples/<example>/images/` |
| the reference renders | `bench/reference/<example>/` — frames and contact sheets |
| the CLI | this repository: `bun cli.ts build` / `explain` / `validate` / `diff` / `check` / `bench` |

Reading the repository's own source is fine — `src/rig.ts`, `src/types.ts` and the
README are documentation of the input formats, and none of them says anything about
any rung's answer.

### What it must not read

🚫 **`examples/*/export/**`** — the reference skeleton JSON, its atlas and its atlas
page. This is the answer.

🚫 **`bench/transcriptions/**`** — rig and motion specs written by a script that read
a reference export and rewrote its numbers. Same answer, one file further away.

🚫 Any derived form of either: bone names, key times, curve handles, timeline
listings, however they reach the agent — a previous session's summary, a commit
message, a paste.

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
  log.md                 the loop log — see below
  bench.json             the final `bench <N> --json` report
```

`<n>` counts attempts at that rung on that date, from 1.

### `log.md`

Open it with a header block, then one entry per turn of the loop. The point of the
log is that a reader can see **what the agent could not tell without compiling** —
that is the measurement this whole exercise exists for.

```markdown
# Rung 3 — attempt 1

- date:      2026-08-22
- agent:     <model / harness>
- inputs:    brief, docs/AUTHORING.md, examples/3-timing-and-spacing/images/,
             bench/reference/3-timing-and-spacing/
- reference: not read   ← or: read, and this run is void
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
this log is the only place that shows up.

## After a run

1. Paste the `bench` summary into [docs/LADDER.md](../../docs/LADDER.md) and move
   that rung's status if a person judges it cleared.
2. Fold anything the log says about the guide back into
   [docs/AUTHORING.md](../../docs/AUTHORING.md).
3. A run attempted with the reference in context is recorded **as such**, or not
   recorded at all.
