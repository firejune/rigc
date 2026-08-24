# spineboy (`ess`) — attempt 3, the loop

- date:      2026-08-24
- agent:     Claude Opus 5 (1M context), Claude Code / Agent SDK
- inputs:    `bench/briefs/spineboy.md` (**revision 3**), `bench/reference/spineboy/ess/`
             + `frames.json`, `examples/spineboy/images/`, `docs/AUTHORING.md` in full,
             this repo's `src/` as format docs, the CLI
- atlas:     `examples/spineboy/export/*.atlas` **not opened** — rigc emits its own
             one-part-per-page atlas from the loose PNGs, so the run does not need it
- reference: not read
- guide:     AUTHORING.md §8, §9, §10 in hand (run is after 2026-08-23)
- profile:   spine
- scope:     `ess` only. `pro` not attempted.

## §1 — Inheritance and honesty

### Two interruptions, no transcripts

This is the **third** honest attempt at this rung and the **third session** inside
this one attempt. Two predecessor agents were killed mid-run by **server-side API
errors (529 Overloaded)**. Neither left a transcript and neither wrote a `LOOP.md`,
so their *reasoning* is gone; their **disk state survived** and this session
inherited it in place, in the worktree they were working in
(`../rigc-wt-spineboy3`, branch `bench/spineboy-run3`).

**The run stays clean.** The interruptions were infrastructure, not a reading
breach: the inputs did not change, no forbidden file entered any of the three
sessions, and no `bench` had been run. The only thing lost is authorship of the
reasoning behind the inherited artifacts — which is why this session treats them as
**drafts to validate, not conclusions** (below).

Known from the harness about the predecessors, and recorded because it is all that
is known: the first one's last reported activity was *"Testing draw-order edges
like-for-like — the boot evidence points at one."* That is a claim without working,
so this session re-derived the draw order from the frames rather than trusting it.

### Honesty-rule incidents

**None.** Nothing on the forbidden list was opened in this session:
`examples/*/export/*.json`, `bench/transcriptions/**`, `docs/LADDER.md`'s status
table or per-rung sections, `docs/SPEC_COVERAGE.md`, `src/ladder.ts`'s gate strings,
issue bodies carrying counts, `bench/render_reference.ts`, git history/blame/tags.
`bench/runs/2026-08-23-spineboy-1/` and `-2/` were **not** opened at all — not their
`README.md`, not their `LOOP.md` — since they are attempts at the rung being
authored. `2026-08-23-rung8-2/` and `-rung3-2/` were the process precedents.

⚠️ One thing to note about inheritance and the honesty rule: the inherited
artifacts are **this run's own earlier work**, not another run's, so reading them is
not a breach. But they are also **unverified** — an inherited number carries no
control behind it. Every load-bearing one is re-derived below and labelled
`re-verified` or `re-derived`.

### What was inherited

- `ess/spineboy-ess.rig.json` — 18 bones, 21 slots, 2 event declarations, one skin.
- `ess/spineboy-ess.motion.json` — all 8 `ess` animations, durations already matching
  the brief's 30 fps-grid column; `events` blocks on `run`, `shoot`, `walk`.
- `ess/spine/skeleton.json` + `skeleton.atlas` — a **built** candidate.
- `fitting/` — ~40 fitting/probe scripts and their JSON outputs, uncommitted.
- No `LOOP.md`, no `README.md`.

## Loop

### 1 — `check` on the inherited build, before touching anything

```
bun cli.ts check --candidate bench/runs/2026-08-24-spineboy-3/ess/spine \
                 --frames bench/reference/spineboy/ess
```

Ran clean over all 16 sets (8 animations × 2 rates). Reference-denominator MAE,
12 fps sets:

| set | ref MAE | | set | ref MAE |
| --- | ---: | --- | --- | ---: |
| `idle` | **25.69** | | `jump` | 41.05 |
| `aim` | 31.86 | | `run` | 52.57 |
| `walk` | 32.99 | | `hit` | 53.91 |
| `shoot` | 39.59 | | `death` | **63.03** |

Final per-chain rollup on the inherited build:

```
chain                worst slot drift across every set                            mean   MAE in it    share
neck                 4.8 px "mouth" in hit/f0002                                1.2 px       28.16    34.8%
front-thigh          14.4 px "front-shin" in death/f0054                        4.5 px       51.28    17.4%
front-upper-arm      7.2 px "front-bracer" in death/f0014                       2.0 px       63.88    14.1%
rear-thigh           21.3 px "rear-shin" in death/f0007                         1.8 px       55.70    13.4%
rear-upper-arm       6.0 px "gun" in walk/f0007                                 0.9 px       41.59    11.5%
torso                4.9 px "torso" in shoot/f0004                              1.5 px       48.10     8.8%
```

**What the dashboard says about the inheritance** — and this is the reason to keep
it rather than restart:

- **No chain is lost.** Six chains, all six drawing, no `0 %` row, no blank drift
  row, nothing `(unattributed)`. §8.1's loudest failure mode is absent.
- **No overdraw warning** on any of the 16 sets, so the candidate is not buying MAE
  by inking more than the reference does.
- **7 of 16 sets took `frames.json`'s own box** rather than a fit — `aim`, `idle`,
  `jump`, `shoot`, `walk` among them — meaning the rig is authored in the frames'
  own coordinates to within 0.17–1.63 px rms. The setup pose and the scale are
  therefore approximately right, which is the expensive part.
- The chain shares are **flat** (8.8 %–34.8 %) rather than dominated by one broken
  limb, and `neck`'s 34.8 % comes with the *lowest* `MAE in it` of all six (28.16) —
  a head and its five slots cover a lot of figure and pull a lot of the reference's
  ink into that chain at a below-average error per pixel. Per §9.2 that is a large
  chain, not a wrong one.

⇒ The inheritance is a **working draft at the floor in `idle` and loose in `death`**,
not a dead end. Continue from it, re-verifying rather than restarting.

**Worst three sets** by reference-denominator MAE, which is where the iterations go:
`death` 63.03, `hit` 53.91, `run` 52.57.

---

## §2 — Session 3 continues: what was re-verified, and what it found

The inheritance audit above is session 3's. Everything from here is session **4**,
which inherited the same worktree after the same failure mode (a server-side 529)
and continues the same attempt. **No input changed, no forbidden file was opened,
`bench` has still not been run.** The re-verification rule from §1 still applies:
an inherited number carries no control behind it, so §1's `check` was re-run before
anything was touched and reproduced to the digit (`fitting/logs/check-base.txt`).

### 2 — `check` on the inherited build, reproduced

`death` 63.03, `hit` 53.91, `run` 52.57, `shoot` 39.59, `jump` 41.05, `walk` 32.99,
`aim` 31.86, `idle` 25.69 — identical to §1's table. The chain rollup reproduced too.
**The inheritance is confirmed as recorded.**

⚠️ But §1 read the report for its chains and its MAE and **did not read two lines that
were already in it**, and both turn out to be the largest things wrong with the build:

```
death  per-frame 13 of 59 adjacent pair(s) change by a different amount than the
       reference does; worst f0016, yours moved 3165 px where the reference moved 211
shoot  per-frame 1 of 5 adjacent pair(s) ...; worst f0001, yours moved 1078 px
       where the reference moved 0
```

§9.2 says exactly why nothing else could see them: they are cheap in every single
frame and wrong only in the relation between two. `shoot` f0 → f1 is the **brief's
own** headline fact — *"the only motionless frame pair in the entire reference"* —
and the candidate was moving 1,078 px across it.

### 3 — the draw-order edge the previous session left in probe

Two probe directories were in flight (`fitting/order/gun-front`, `fitting/order/rear-front`,
written 15:05, one minute before the session died) with no result recorded. They were
**rebuilt from the current rig** rather than trusted, together with the foot/shin
hypotheses, so that every hypothesis differs from `base` in the slots array and in
nothing else (`fitting/mkorder.ts`). Whole-shot reference-denominator MAE, 132 frames:

| build | ALL | vs base |
| --- | ---: | ---: |
| base | 35.485 | — |
| foot-under-shin | 35.451 | −0.034 |
| front-foot-under | 35.463 | −0.022 |
| **ctl-gun-over-leg** (reverses a settled edge) | 37.450 | **+1.965** |
| **ctl-rear-leg-over-front** (reverses a settled edge) | 35.449 | **−0.036** |

🚨 **The second control failed, and that is the finding.** The brief settles *near leg
in front of far leg* by measurement (2.8–3.1× on `walk` f3/f4/f10); reversing it came
out 0.1 % **better**. §8's rule — two orders inside the objective's own scatter are
*no answer* — therefore condemns the statistic, not the edge: a whole-shot MAE divides
the evidence by the whole figure and by 130 frames that carry none of it, and both foot
hypotheses sat inside that same scatter.

⇒ **`fitting/orderdiff.ts`**: two builds differing only in slot order are bit-identical
everywhere the two slots do not overlap, so find the pixels where the two builds
actually differ and score both against the reference over **exactly those**. Nothing
else can contribute, and the dilution is gone by construction:

| variant | deciding px | base | variant | verdict |
| --- | ---: | ---: | ---: | --- |
| **ctl-gun-over-leg** | 39,967 | 40.56 | 77.55 | **base better by 47.7 %** ✅ reproduces |
| ctl-rear-leg-over-front | 33,952 | 50.98 | 49.67 | variant by 2.6 % — but base wins **every** one of the six frames carrying most of it (`death/f2` 32.6 v 72.2, `idle/f2..f5` 5–9 v 36–43, `walk/f4` 24.5 v 55.1). ⚠️ my control is **mis-constructed**: moving the rear leg past `front-foot` moves it past the torso, head and neck too, so it is not one edge but many. Read the per-frame rows, not the aggregate |
| **foot-under-shin** | 4,789 | 41.44 | **36.25** | variant by **12.5 %**, frame tally positive in **all 8 shots** |
| front-foot-under | 3,197 | 40.73 | 35.82 | variant by 12.1 % |
| rear-foot-under | 1,592 | 42.85 | 37.13 | variant by 13.4 %, positive in all 8 |

**Adopted: each boot is drawn behind its own shin.** 12–13 % on the deciding pixels,
against a working control that registers a known edge at 47.7 % and against §8's
"no answer" band of 0.8 %; and the two halves were reached independently and agree.
This is §8's second draw-order test doing what §8 says it reaches — an edge the frames
show no interior detail on. The brief's two `ess` edges are unchanged and both hold in
the slots array.

### 4 — what `check`'s per-frame column was actually saying: three defects

**`fitting/settle.ts`** — the reference's own frame-to-frame change decides where my pose
series may not move. Three findings, in the order they were found:

1. **A hold has to be authored at the pose level.** Collapsing the runs where the
   reference does not change fixed `death` f17–f26 and `shoot` f0–f1.
2. 🚨 **The loop seams were wildly out, and nothing in the loop was looking at them.**
   The brief sorts the 17 first-to-last differences into two groups with a factor of
   8.6 and nothing between: 0, 0, 0, 0, 1, 55, 77, 104, 302 px are the cycles. A cycle's
   last pose **is** its first pose. The independently fitted end poses were not:

   | shot | reference first-to-last | worst channel disagreement |
   | --- | ---: | --- |
   | `shoot` | **0 px** | `front-fist` −83.2° against **+22.2°** — 105° apart |
   | `run` | **1 px** | `front-fist` +32.6° against −13.3° — 46° apart |
   | `walk` | 104 px | `gun` +1.9° against −29.3° |
   | `idle` | 302 px | `front-upper-arm` −96.4° against −93.1° |

   So `shoot`'s last thirtieth of a second swung the near forearm through 105°, in a
   shot the reference returns from bit-identically.
3. 🚨 **Sequencing the two undid the first.** Run as two passes, the seam step
   overwrote frame 0 after the still-run collapse had just tied it to frame 1, and
   `shoot`'s 1,078 px disagreement came back as 962. They **overlap** — on `shoot`,
   f0–f1 is a still run *and* f0/f5 is the seam — so they are one partition
   (union-find), fitted once per class: `{f0,f1,f5} held as ONE pose`.

### 5 — the key planner never keyed a hold

After §4 the *poses* of `death` f17–f26 were identical to machine precision and the
rendered pairs **still** moved 123–154 px each. The planner was the culprit, and §10.3
names it exactly: *"two keys of equal value... are the only way to say nothing moves
here on an interpolated timeline"*. `turningPoints` forced the ends and the direction
changes; a greedy span was free to run **straight through a plateau** as long as it
stayed inside the per-bone tolerance, authoring a slope where the shot holds. Fixed:
both ends of every run of exactly equal values are forced. Exact equality, so slow
motion inside the tolerance is deliberately not caught — that is a tolerance question,
not a hold.

### 6 — result of §4–§5, and the third defect

| | inherited | after §4–§5 |
| --- | ---: | ---: |
| `death` per-frame disagreements | 13 of 59 | **4 of 59** |
| `shoot` per-frame disagreements | 1 of 5 | **0 of 5** |
| ref-denominator MAE, all 8 shots pooled | 35.485 | **34.618** |

Every shot improved: `death` 63.03 → 60.24, `hit` 53.91 → 50.19, `run` 52.57 → 49.62,
`shoot` 39.59 → 38.67, `idle` 25.69 → 24.83, `walk` 32.99 → 32.33, `jump` 41.05 → 40.95.

**The third defect: four sets cannot take `frames.json`'s own box** — `death`, `hit`,
`run`, `shoot` — and §9.2 puts that at 15–25 MAE. `fitting/probe-extent.ts` and
`fitting/edgereport.ts` say where, per frame and per edge (candidate minus reference):

```
hit    edge rms 4.81 px   f0000  L+0 T+0 R-21 B+1
run    edge rms 3.93 px   f0006  L-2 T+0 R-21 B-3     f0000/f0003/f0008 B+4..+5
death  edge rms 3.26 px   f0005  L+0 T+11 R-10 B+17   f0004..f0007 R-8..-10
aim 0.71 ✅   idle 0.65 ✅   walk 1.43   shoot 1.59   jump 1.93
```

⇒ **`fitting/panel.ts`** renders reference / candidate / overlay for `hit/0`, `run/6`,
`death/5`, and the picture is unambiguous: on those frames **my limbs are in a
different configuration**, not a slightly wrong one. On `hit` f0 the reference's legs
are flung out to the right with the boots up and mine are tucked under with the gun
occupying that space; on `run` f6 the reference holds the gun out level and mine has it
down at the hip.

That is a minimum **two chains share**, and §8.1's paired scan cannot reach it — it
fixes the version inside one chain. A scan that tries moving a leg into the reference's
leg region finds it already inked by my gun and reports no improvement, correctly, on
the objective it was given.

⇒ **`fitting/restart.ts`**: multi-start. Starts are the incumbent, both neighbours, four
poses spread across the same shot, and the setup pose; all are screened through the
coarse levels only, the best two go through the full schedule, and the incumbent is
always among the candidates so a frame can only improve. The frame's own drawn box
joins the objective at a small weight (`EDGEW=0.04`) — the reference's per-frame box
is a measurement of the committed frames, and it is what the declared-box test reads.

First measurement, `hit` f0: **6.670 → 5.948 → 5.443** over two runs of the same
search, which is how far from converged the inherited fit was on that frame.

### 7 — a fourth defect, found by reading the built file rather than a report

While the refits ran, the emitted skeleton was read back for §10 conformance. Three
things came out of it, and the first is the largest single-line gain of the run:

🚨 **The near hand's fist was fitted and never emitted.** `fitting/fist.json` decides
which of `front-fist-closed` / `front-fist-open` each shot shows and the pose fit
honours it — and the *rig's* setup attachment is `front-fist-open` with **no
animation carrying an attachment key**, so six of the eight shots were fitted
against the closed fist and built showing the open one. Nothing in the loop looks
at this: `validate` has no opinion about which attachment a slot ought to show, and
the difference is a few dozen pixels at the end of an arm. Fixed with one
`attachment` key at t=0 on the six shots that differ from setup — §10.3's Clean Up
is why the other two carry none.

**`hip` was writing the Separate form on every shot.** §10.3: *"each translate,
scale, and shear key for a bone sets both X and Y... For animations that need it,
X and Y can be keyed separately"* — the paired key is the editor's default and
Separate is the exception. A planner that reduces each axis under its own tolerance
produces Separate **by construction**: of the eight shots only `aim`, with one key,
came out with the two axes on the same times. Replaced with a paired planner —
union of both channels' forced indices, one curve shape per key, a span accepted
only when **both** channels are inside tolerance.

**`jump` gained a landing cue.** The brief names walk's footfalls, run's landings and
shoot's discharge as the moments; it also measures `jump`'s landing to the frame in
the same terms — *"back on the floor at **f15**"* — and it is the shot's only ground
contact. One `footstep` at 15/12 s. Recorded in the README as this run's inference
rather than the brief's list.

| | before | after |
| --- | ---: | ---: |
| pooled ref-denominator MAE | 34.618 | **34.123** |
| `hit` | 35.64 | **33.72** |
| `walk` | 28.26 | **26.84** |
| `run` | 36.23 | **35.30** |
| `jump` | 35.95 | **35.13** |
| `aim` | 27.24 | **26.45** |

### 8 — multi-start, and what it was worth

`fitting/restart.ts` on the frames the tables named: `hit` all 5, `shoot` all 6,
`run` f0/f3/f6/f8, `death` f4–f17. Throughput is ~4–5 min a frame, so this is a
budget spent deliberately rather than a sweep.

```
hit    f0 6.670 -> 5.948 -> 5.443 -> 4.795     death  f5 5.970 -> 3.318   (-44%)
       (three runs of the SAME search, each                f4 6.225 -> 5.177
       finding a better basin than the last)               f13 5.289 -> 4.380
                                                           f8 5.677 -> 4.304
```

⚠️ **A single-start fit reports success a long way from converged.** `hit` f0
improved on every repetition of the identical search — that is not a tolerance
being tightened, it is a different basin each time.

Merged, re-settled (the refit breaks the held classes, so §4's partition has to be
re-applied) and rebuilt:

| | inherited | now |
| --- | ---: | ---: |
| pooled ref-denominator MAE | 35.485 | **32.761** |
| `death` | 43.59 | **39.08** |
| `hit` | 37.81 | **32.42** |
| `run` | 37.03 | **35.09** |
| `shoot` | 26.42 | **24.73** |
| `walk` | 28.88 | **26.84** |

`check`, same build: `death` 63.03 → **56.24**, `hit` 53.91 → **43.74**, `run`
52.57 → **46.36**, `shoot` 39.59 → **35.61**, `walk` 32.99 → **30.43**, `aim`
31.86 → **30.65**, `idle` 25.69 → **24.79**.

⚠️ **`jump` lost `frames.json`'s own box** (40.95 declared → 43.35 fitted) at the
same time, and the fist swap is what did it: its edge rms is unmoved (1.93 → 1.89)
but the closed fist changes the silhouette enough to push the declared-box
correction over one pixel. The two measurements disagree — the reference-denominator
MAE in a fixed frame says the closed fist is **better** by 0.82 — and the fixed
frame is the one §9.2 says to author against, so the fist stands and this is
recorded as known-wrong rather than reverted.

### 9 — the one place multi-start did not reach, and what did

`run` f6: 8.286 → 8.236, essentially nothing, with the right edge still **21 px**
short. `fitting/panel.ts` says why — the reference holds the gun **out level to the
right** and every pose in `run` has it down at the hip, so every start drawn from
`run`'s own frames is on the wrong side of the same two-chain minimum.

⇒ **Cross-shot starts.** These shots are states of one character, so a
configuration this shot cannot reach from its own frames may be sitting in another:
`aim` is the gun held out level, standing still. Only the six arm-chain bones are
borrowed — a whole foreign pose puts the legs somewhere this shot never goes and
the placement step then fights it.

### 10 — merge, re-settle, rebuild, and where it landed

`run` f6: **8.236 → 7.950** on the borrowed `aim` arm — small, but it moved where
nothing drawn from the shot itself had. `death` f8–f12 fell **5.677 → 4.304**,
**5.535 → 4.260**, **5.885 → 3.936**, **5.286 → 3.874**, **5.049 → 3.337**.

Merged, re-settled (a per-frame refit breaks the held classes, so §4's partition is
re-applied every time), rebuilt:

```
build                                      aim   death     hit    idle    jump     run   shoot    walk      ALL
inherited                                27.40   43.59   37.81   23.65   36.04   37.03   26.42   28.88   35.485
final                                    26.45   37.20   32.34   23.20   35.07   35.03   24.73   26.82   32.067
delta                                    -0.96   -6.39   -5.48   -0.45   -0.97   -2.01   -1.69   -2.06   -3.418
```

⚠️ `idle` gave back 0.36 between the last two builds with nothing in `idle` touched.
That is §10.4's shared table doing what a shared table does: `discoverTable` draws
pass A from **every** series pooled, so re-fitting `death` changed which eight shapes
the table holds and every other shot was re-planned under the new one. Worth knowing
before reading a small per-shot regression as a defect.

### 11 — the gate, and `bench`

`build --profile spine`: **18 PASS, 0 FAIL**, 2 SKIP, 14 PROF. Both SKIPs were read
per §7 step 2 and both are decisions, not gaps — no `drawOrder` timeline and no
bounding box or clipping attachment, each argued in the README.

`bench spineboy` run **once**, at the end. Only the `ess` line was read; the `pro`
line it also printed measures a candidate never built for it.

🚨 **Honesty incident, and it is the repository's rather than a reading choice.**
`bench --json` writes a `gates` field into `bench.json` whose value is
`src/ladder.ts`'s **gate string** — named in the forbidden table, and carrying this
rung's per-skeleton bone, slot and animation counts. It was seen while looking for
the `ess` measures in the report, **after `bench` had already run**, so it reached no
authoring decision: the rig was built, frozen and measured before the file existed.
It is recorded here and in the README rather than buried. The protocol *requires*
`bench.json` in the run directory, so this is not something an obedient run can
avoid — the fix belongs at the emitter. Filed as a guide defect in the README.

## Notes

What was guessable from the frames and what was not is in the README's *Reading*
and *What was left unauthored*. The four things this loop would tell a successor:

1. **Read `check`'s per-frame column before its MAE.** Two of the three decisive
   defects were sitting in a report that had already been read for its chains.
2. **A single-start pose fit reports success a long way from converged.** The same
   search, repeated on the same frame, found a better basin three times running.
3. **Read the built file, not only the reports.** The largest single-line gain of
   the run — the near hand's fist, fitted and never emitted — was invisible to the
   gate, to `diff` and to every aggregate, and was found by dumping the emitted
   `animations.*.slots` and noticing an empty object where six shots needed a key.
4. **A control that fails may be a wrong control.** Read the per-frame rows before
   condemning the hypothesis.
