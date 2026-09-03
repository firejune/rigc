# Instrument studies — what a number of ours is worth

One directory per **study of a quantity this repository prints**. A study is not a
ladder run: nothing is authored, no rung is attempted, and no gate clause is
claimed. It answers one question — *is this figure stable enough to be quoted the
way it is being quoted?* — on a fixed corpus, with its own harness committed beside
its own evidence.

Studies live here rather than in [`runs/`](../runs/README.md) because a run is *"the
record of an agent authoring a rig from a brief"* and its tooling is frozen once it
lands ([`runs/README.md`](runs/README.md), *After a run*). A study is the opposite
on both counts: its subject is the instrument rather than a candidate, and its
claim stays **live** — it is quoted in the skill docs, so if `src/` drifts away
from it, that should be loud.

⇒ **A study's tooling is inside the repo-wide gate**, unlike a run's. `bench/**` is
in `tsconfig.json`'s `include` and `bench/runs/**` is the exclusion; a study is not
excluded, so `bun run typecheck` and `bun run lint` cover it and a change to `src/`
that breaks a study's harness reds CI. That is the intended trade: a study that no
longer compiles against the code it measured is a study whose figures need
re-reading.

## The output

```
bench/studies/<YYYY-MM-DD>-<subject>/
  README.md          the question, the method, the reading, and what it changed
  tools/             the harness — committed, typechecked, and the only way the figures were produced
  evidence/          the folded tables every quoted figure reproduces from
```

Raw stores stay **out** of the repository. A study's harness takes a work directory
and a `--seed`, and `evidence/` holds what is folded out of the store rather than
the store itself — the same standing rule as a run's, for the same reason: the
figures have to be checkable, and a 60 MB JSON is not checkable by being committed.
Every study's `evidence/controls.txt` carries the command line that regenerates its
store.

## What a study may and may not do

- **May** read `src/`, the committed corpora under [`reference/`](reference), a
  landed run's committed inputs, and the docs it is about.
- **May not** edit a landed run's files, a frozen record, or a closed issue's
  comments. Where a study's finding bears on one, it says so from its own
  directory and leaves the record alone — a record names its own toolchain and is
  read as of its own date.
- **Must** state the basis of every figure: the corpus, the candidate, the flags,
  and which of the repository's own thresholds it took rather than invented.

## The studies

| Study | Question | Verdict |
| --- | --- | --- |
| [`2026-09-03-visibleshare`](2026-09-03-visibleshare/README.md) | Is `chainfit`'s `visibleShare` stable enough for its medians to be quoted? ([#323](https://github.com/firejune/rigc/issues/323)) | **Not as a mean or median** — p99 swing 0.56 and a worst corpus-median move of 22 points inside `pose`'s own convergence band, with 0.5 % of it attributable to the mask definition. Demoted in `AUTHORING.md` §12 to a per-frame diagnostic; the kind-5 ceiling's **maximum** survives, on its margin |
