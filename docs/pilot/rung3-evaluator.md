# Rung 3 — evaluator sheet

🚫 **For the pilot judge only. Do not show this file to the agent being piloted,
and do not paste any part of it into a prompt.**

Everything below is answer-side. The two baselines are quoted from
[`docs/LADDER.md`](../LADDER.md)'s rung-3 sections, and LADDER's **per-rung
sections are on the runner's forbidden list** — see
[`bench/runs/README.md`](../../bench/runs/README.md), *What a run may read*: they
publish every previous run's measures, so a runner that reads them is aiming at a
number instead of at the shot. **This file inherits that**: it is named on the
forbidden list in [`rung3-runner-prompt.md`](rung3-runner-prompt.md) for the same
reason. Keep it out of the runner's context, its repository checkout if it is
reading `docs/` broadly, and its scrollback.

The protocol this scores is [`../PILOT.md`](../PILOT.md). How the measures are
read is [`docs/LADDER.md`](../LADDER.md), *How a rung is scored* — that part is
allowed to the runner; these figures are not.

---

## ⚠️ The caveat that applies to every comparison on this page

**Rung 3's brief has never been verified by a second agent.** The protocol table
in [`bench/runs/README.md`](../../bench/runs/README.md) lists rung 3's *Brief
verified* as **no**, and
[`bench/briefs/3-timing-and-spacing.md`](../../bench/briefs/3-timing-and-spacing.md)
carries no verification header block. A brief is a viewer's report and can assert
things the frames do not support — rung 2's revision 1 asserted three, and its run
lost two detours to them before measuring each and overruling the brief.

What that means for a pilot score:

- The comparison **is** like for like — all three runs authored from the same
  unverified text — so a lower figure is not explained away by this.
- A specific defect **may** be the brief's rather than the agent's. If the pilot's
  `LOOP.md` shows time lost to a brief claim it then had to overrule, record that
  beside the score rather than inside it.
- Do not present any figure here as a measurement of the brief's accuracy. It is
  not one.

---

## The two baselines

Both were authored by **Claude Opus 5 (1M context)**, running as a Claude Code /
Agent SDK agent, on 2026-08-23, under `--profile spine`, both **clean** (`bench 3`
run exactly once at the end, nothing edited after) and both **validator green on
the first compile**.

The rung is recorded as **cleared on attempt 1**. Attempt 2 is not a
re-judgement of it: it exists to measure what
[`docs/AUTHORING.md`](../AUTHORING.md) §10 — the editor's default conventions —
changes, and it is the first run made with §10 as a standard input.

⚠️ **The two attempts are therefore on opposite sides of the §10 boundary.** A
pilot run today has §10 in hand, so **attempt 2 is the like-for-like baseline**;
attempt 1 is the one to quote when asking what the guide is worth.

### `bench 3` — section means

Verbatim from LADDER's rung-3 entries. The first row of each pair is the figure as
recorded on the day; the second is the same run with the name-agnostic figures
(added 2026-08-23, after both runs) and with `attachments` recomputed under the
`region_size` measure change — LADDER's *Measure changes* ledger has the arithmetic.
**Quote the recomputed row when comparing against a pilot run today**, because that
is what today's `bench` prints.

| | attempt 1 | attempt 2 | **pilot run** |
| --- | ---: | ---: | ---: |
| `bones` | 0.567 | 0.567 | |
| `bones` name-agnostic | 1.000 | 1.000 | |
| `slots` | 0.476 | 0.476 | |
| `slots` name-agnostic | 1.000 | 1.000 | |
| `attachments` **as recorded** | 0.870 | 0.870 | — |
| `attachments` **recomputed** | **0.926** | **0.926** | |
| `constraints` | 1.000 | 1.000 | |
| `animations` | 0.911 | **0.936** | |
| `events` | 1.000 | 1.000 | |

The summary block each run printed, verbatim, in today's form:

```
attempt 1
ess        bones=0.567  slots=0.476  attachments=0.926  constraints=1.000  animations=0.911  events=1.000
           bones 0.567 (name-matched) · 1.000 (name-agnostic)   slots 0.476 (name-matched) · 1.000 (name-agnostic)

attempt 2
ess        bones=0.567  slots=0.476  attachments=0.926  constraints=1.000  animations=0.936  events=1.000
           bones 0.567 (name-matched) · 1.000 (name-agnostic)   slots 0.476 (name-matched) · 1.000 (name-agnostic)
```

### The measures that actually move

Everything else at this rung is pinned by design — names are the author's, and
`constraints`/`events` are 1.000 **by absence**, which is vacuous. These four are
where a pilot separates itself:

| measure | attempt 1 | attempt 2 | **pilot run** |
| --- | ---: | ---: | ---: |
| `animations.key_counts` | 42/69 | **49/69** | |
| `animations.curve_kinds` | 41/69 | **49/69** | |
| `bones.length_present` | 1/3 | 1/3 | |
| `bones.inherit_present` | 1/3 | 1/3 | |

Held at ceiling by both, so a pilot falling below any of them is the finding:

| measure | both attempts | **pilot run** |
| --- | ---: | ---: |
| `bones.count` | 3/3 | |
| `bones.depth_histogram` (name-agnostic) | 3/3 | |
| `bones.degree_sequence` (name-agnostic) | 3/3 | |
| `animations.count` | 2/2 | |
| `animations.names` | 2/2 | |
| `animations.duration` | 2/2 | |
| `animations.timeline_kinds` | 8/8 | |

Naming figures, for context rather than for scoring — the brief grants the author
its own names, so these are unwinnable by design. Attempt 2 scored `bones.names`
**1/5** and `attachments.names` **1/3**.

⚠️ **1.000 name-agnostic is not "every binding is right."** Both attempts draw the
block and the pendulum in the opposite array order to the reference's — the
opposite z-order — and name-agnostically those two slots are the same slot, so
nothing in that report can see it. The name-matched `slots.order` is where a swap
shows, and at this rung it reads **1/2** for the naming gap rather than for the
swap. If the pilot gets the order right, no figure on this page will say so; read
the specs.

### `check` — fidelity

⚠️ **Attempt 1 never ran `check`.** Its fidelity numbers come from the author's own
scripts and are **different quantities** — 2.42° is an *angle*, not a pixel drift,
and its 3.4/255 is a **whole-frame** mean where `check`'s figure is over the
**union alpha** (AUTHORING §9.2: the whole-frame figure runs ten to twenty-five
times smaller on every set measured so far). Do not put them in one column and read
a trend.

| | attempt 1 (own scripts) | attempt 2 (`check`) |
| --- | --- | --- |
| framing | — | fit `x0.999458`, `rms 0.25 px`, union residual `+0.50 × +0.01 px` |
| `heavy` MAE mean (union alpha) | — | **9.84** |
| `heavy` worst slot drift | — | **0.85 px** |
| `light` MAE mean (union alpha) | — | **10.93** |
| `light` worst slot drift | — | **0.74 px** |
| slots attributed | — | every slot, in all 86 frames |
| whole-frame mean | **3.4/255** | **0.41/255** (`heavy`), 0.46 (`light`) |
| worst-frame pendulum rotation | 2.42° | — |
| block travel error | about one frame pixel | — |

The one pair that compares term for term is the whole-frame mean: **3.4/255 →
0.41/255**.

🚨 **Do not compare a pilot's `check` figures against the numbers in this table.**
LADDER keeps a *Measure changes* ledger and recomputes every recorded `bench`
figure when a measure moves — `check` has no such ledger, and its framing and
rasteriser have changed since these were recorded. Re-running `check` on the
2026-08-23 candidates today does **not** reproduce the numbers above.

⇒ **Re-measure both baselines with the same rigc build the pilot used**, on the
day, and record all three together. Both candidates are on disk:

```bash
bun cli.ts check --candidate bench/runs/2026-08-23-rung3-1/spine \
                 --frames    bench/reference/3-timing-and-spacing
bun cli.ts check --candidate bench/runs/2026-08-23-rung3-2/spine \
                 --frames    bench/reference/3-timing-and-spacing
```

| re-measured on `<date>`, rigc `<version>` | attempt 1 | attempt 2 | **pilot run** |
| --- | ---: | ---: | ---: |
| `heavy` MAE mean (union alpha) | | | |
| `heavy` MAE mean (reference denominator) | | | |
| `heavy` worst slot drift | | | |
| `light` MAE mean (union alpha) | | | |
| `light` MAE mean (reference denominator) | | | |
| `light` worst slot drift | | | |
| worst chain, by `MAE in it` | | | |

⭐ **The reference-denominator line is the one to compare between agents.** Half of
the union denominator belongs to the candidate — a large, mostly transparent sprite
adds cheap pixels and *lowers* the mean on a rig that got worse. The line beneath
the MAE divides by the pixels the **reference** drew, which nothing the agent does
can grow.

---

## The tier checklist

Tick as you go. A tier reached is a result; the run stops where it stops.

| | tier | pass condition | outcome |
| --- | --- | --- | --- |
| ☐ | **T0** | rigc installs, and README's *First rig in ten minutes* builds green from a scratch directory — `rigc build` writes `skeleton.json` + `skeleton.atlas`, `rigc validate spine` ends `rigc: green` | |
| ☐ | **T1** | from a one-line ask, the agent authors **its own** small doll — new specs, not the quickstart renamed — and `build` + `validate` are green | |
| ☐ | **T2** | rung 3 completed under the run protocol: brief + frames + AUTHORING only, `--profile spine`, `bench 3` run **once at the end**, and a run directory holding both specs, `spine/`, `LOOP.md`, `README.md`, `bench.json` | |
| ☐ | **T3** | the tables above filled in from tool output, and the run recorded at `bench/runs/<YYYY-MM-DD>-rung3-<n>/` with the model named | |

Also record, because they are the cheapest signals on the page and neither is in
`bench.json`:

| | attempt 1 | attempt 2 | **pilot run** |
| --- | --- | --- | --- |
| build iterations to first green | 1 | 1 (green on first compile) | |
| clean or bench-assisted | clean | clean | |
| model, as written in the run record | Claude Opus 5 (1M context), Claude Code / Agent SDK | Claude Opus 5 (1M context), Claude Code / Agent SDK | |

---

## Checking that the run was honest

**The judge trusts tool output, never the runner's self-report.** A run's prose is
the agent's account of itself and may be sincerely wrong — which is the whole
reason the gate exists.

**What to check, in order:**

1. **Read `LOOP.md` and `README.md` in full.** Not the summary — the turns. Look
   for: any path under `examples/*/export/` other than a `.atlas`; any mention of
   `bench/transcriptions/`, `docs/LADDER.md`, `docs/SPEC_COVERAGE.md`,
   `src/ladder.ts`, `bench/render_reference.ts`, or either of the earlier rung-3
   run directories (`bench/runs/2026-08-23-rung3-1/`,
   `bench/runs/2026-08-23-rung3-2/`); any `git log`; and any number that arrived
   without a measurement behind it.
2. **Check that `bench` appears exactly once**, at the end, and that no spec edit
   follows it. If it appears earlier, or an edit follows it, the run is
   **bench-assisted** — that is a label, not a failure, and its measures are not
   comparable with a clean run.
3. **Grep the agent's tool transcript, if the harness kept one**, for the same
   paths. A transcript of the tool calls is the only positive evidence available;
   a harness that does not keep one cannot supply it.
4. **Re-derive every figure yourself.** Read the section means out of
   `bench.json`, not out of the run's prose, and re-run `check` on the committed
   candidate rather than quoting the run's table.

🚫 **`ls -lu` on `examples/3-timing-and-spacing/export/` is not a check.** Access
times are unreliable here in both directions and neither direction is safe to
lean on: `relatime`-style mount options and macOS defaults mean a read may not
update the atime at all, so an old atime is not evidence of no read; and the fetch
script, an editor's indexer, a backup pass, a virus scanner or `bench` itself all
touch those files, so a fresh atime is not evidence of a read either. It produces
a confident-looking answer that is uncorrelated with the question.

⭐ **Absence of proof is recorded as "unverified", not "clean".** If the harness
kept no transcript and the log says nothing either way, the run's honesty is
**unverified** — write that word in the run record and in any comparison that
quotes its figures. The ladder already carries one run whose figures are caveated
for a leak the run itself disclosed; the failure mode to avoid is the opposite one,
where a run nobody could check gets written up as if somebody had.
