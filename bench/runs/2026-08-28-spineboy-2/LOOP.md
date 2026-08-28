# spineboy — attempt 5, the loop

- date:      2026-08-28
- agent:     Claude Fable 5 (claude-fable-5), Claude Code / Agent SDK
- inputs:    brief rev 4 (`bench/briefs/spineboy.md`), docs/AUTHORING.md in full
             (§8, §8.1, §9, §10 included), LADDER.md's *How a rung is scored* and
             *The honesty rule* only, `bench/runs/README.md` (protocol, item 10
             included), `examples/spineboy/images/`, `bench/reference/spineboy/ess/`
- reference: not read — `examples/spineboy/export/*.json`, `bench/transcriptions/`,
             LADDER.md's status table / per-rung sections / Operating rules,
             SPEC_COVERAGE.md, `src/ladder.ts` gate strings, issue bodies with
             measures, `bench/render_reference.ts`, git history: none opened
- inherited: **from `2026-08-28-spineboy-1` (attempt 4), under protocol item 10
             (owner ruling 2026-08-28):** its rig spec (`ess/spineboy-ess.rig.json`),
             its motion spec (`ess/spineboy-ess.motion.json`), and its fitting
             harness (`fitting/` — scripts plus the intermediate stores it wrote for
             itself: `poses/*.json`, `skeleton-fit.json`, `setup-fit.json`,
             `bones-world.json`, `flash.json`). **Sealed and not opened:** that
             run's `README.md` and `LOOP.md` beyond process (item 9), its
             `bench.json`, `check-final.json`, `check-final.txt`, and its compiled
             `ess/spine/` artifacts (recompiled here instead).
- guide:     AUTHORING.md §10 in hand
- profile:   spine
- task:      surgical re-attempt after attempt 4's adjudicated single-clause FAIL
             (public record, issue #16): worst attributable slot drift 7.86 px on
             `torso` at `hit` f0000 against a 6.0 px bar; adjudicated as a GEOMETRY
             defect — the named fix is re-triangulating the shoulder/chest joint
             through the lying poses. Stage 0 = untouched determinism baseline of
             the inherited candidate; stage 1 = the one geometric edit plus the
             refits it invalidates; stage 2 = per-set delta record with
             UNTOUCHED/REFIT marks.

## Loop

### 1 — build (stage 0, the inherited candidate, unchanged)
`bun cli.ts build --rig ess/spineboy-ess.rig.json --motion ess/spineboy-ess.motion.json --images examples/spineboy/images --out ess/spine --profile spine`
Green. 15 PASS, 0 FAIL, 2 SKIP (no drawOrder timeline, no boundingbox/clipping),
11 PROF. pages=29 regions=29 bones=18 slots=21 animations=8. Not a byte of either
spec was edited before this build.

### 2 — check (stage 0, the determinism baseline — stored untouched)
`bun cli.ts check --candidate ess/spine --frames bench/reference/spineboy/ess --json check-baseline-inherited/check.json > check-baseline-inherited/check.txt`
Full output stored in `check-baseline-inherited/` (txt + json), unedited. This is
the snapshot the adjudicator compares against attempt 4's stored record (sealed to
this run); no comparison is made here. Headlines, worst attributable slot drift per
set:

| set | MAE mean | worst slot drift |
| --- | ---: | --- |
| aim | 35.90 | 3.6 px front-foot f0000 |
| aim@30fps | 35.90 | 3.6 px front-foot f0000 |
| death | 44.85 | 5.0 px torso f0036 |
| death@30fps | 40.44 | 4.6 px torso f0148 |
| hit | 41.95 | **7.9 px torso f0000** |
| hit@30fps | 39.89 | **7.9 px torso f0000** |
| idle | 31.54 | 2.1 px neck f0018 |
| idle@30fps | 32.91 | 1.5 px front-foot f0000 |
| jump | 37.69 | 3.6 px torso f0014 |
| jump@30fps | 42.16 | 2.1 px goggles f0040 |
| run | 37.20 | 5.5 px rear-shin f0006 |
| run@30fps | 35.38 | 2.8 px torso f0020 |
| shoot | 37.42 | 5.2 px torso f0003 |
| shoot@30fps | 40.27 | 4.4 px front-foot f0000 |
| walk | 32.13 | 4.7 px front-foot f0007 |
| walk@30fps | 29.78 | 3.5 px front-shin f0030 |

per-frame: every set with adjacent pairs reads "all N adjacent pairs change by as
much as the reference's own frames do" (death 59/59, hit 4/4, idle 20/20, jump
16/16, run 8/8, shoot 5/5, walk 12/12) — 0 disagreements of 124 pairs, matching the
attempt-4 public record. hit's chain table: torso chain mean 3.6 px (the
corpus-highest named in the diagnosis), worst 7.9 px at f0000. Cross-set rollup:
torso chain worst 7.9 px (hit/f0000), mean 2.1 px; every other chain worst ≤ 5.5 px.
