# Ladder runs — the protocol

One directory per **attempt at a rung**. A run is the record of an agent authoring
a rig from a brief: what it was given, what it wrote, what the gate said at each
turn of the loop, and where the measures landed.

Nothing in here is a rung's verdict. A rung is marked cleared by a person reading
the measures, and [docs/LADDER.md](../../docs/LADDER.md) is where that judgement is
written down.

## Which rungs can be attempted

A rung is attemptable when it has a brief and reference frames. This table says
what is prepared and what is peculiar about attempting it; the ladder's own order,
status and gating features live in [docs/LADDER.md](../../docs/LADDER.md).

| Rung | Brief | Reference frames | Candidates | Watch out for |
| --- | --- | --- | --- | --- |
| 3 | [`3-timing-and-spacing.md`](../briefs/3-timing-and-spacing.md) | 2 animations, 12 fps | 1 | — |
| 1 | [`1-weight-and-mass.md`](../briefs/1-weight-and-mass.md) | 2 skeletons, 12 + 24 fps | **2** | two shots; see the note below |
| 2 | [`2-the-12-principles.md`](../briefs/2-the-12-principles.md) | 4 animations, 12 fps, **contact sheets + 2 stills each** | 1 | 4 × 25.8 s; the sheets *are* the frame set |
| 4 | [`4-wave-principle.md`](../briefs/4-wave-principle.md) | 3 animations, 12 fps + 24 fps sheets | 1 | the subject occupies an eighth of the frame — one shared viewport, one far-flying ball |
| 5 | [`5-squash-and-stretch.md`](../briefs/5-squash-and-stretch.md) | 3 animations, 12 fps + 24 fps sheets | 1 | subject ~4–14 px; proportions are measured, not seen |
| 6, 7, 8, spineboy | — | — | — | not prepared. 6 and 7 ship meshes, which `render_reference.ts` refuses by name; 7 has no upstream `license.txt` at all and must never be rendered |

⚠️ **A rung with two skeletons needs two candidates, and `bench` does not know
that.** `bench <N> --candidate <dir>` takes one candidate and diffs it against every
reference skeleton of the rung, so it prints a line per skeleton whichever candidate
you give it. Build both, run `bench` once per candidate, and read only the matching
line from each — then say in the log which line came from which run. Quoting the
other line as though it were a measurement of anything is the failure mode here.

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
| the CLI | this repository: `bun cli.ts build` / `explain` / `validate` / `diff` / `bench` |

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
