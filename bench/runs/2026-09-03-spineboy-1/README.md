# spineboy — 2026-09-03, attempt 1 (`ess`): a from-zero run, to measure the tool

- date:      2026-09-03
- agent:     Claude Opus 5 (1M context), Claude Code / Agent SDK, fresh session
- rung:      **spineboy**, `ess` only. `pro` was not built; the `pro` line `bench`
             prints from an `ess` candidate is noise and is labelled as such below
- brief:     [`bench/briefs/spineboy.md`](../../briefs/spineboy.md), **revision 4**
             (2026-08-27), the third third-party pass
- reference: **not read.** `examples/spineboy/export/*.json` was never opened, and
             neither was that directory's `.atlas` as an authoring input — this rig
             needs none, because rigc emits its own one-part-per-page atlas from the
             loose PNGs. The example's `.atlas` was opened **once, after the candidate
             was final**, as the argument to `check --texture-from`, which is what
             item 4 of the reading list permits it for and what §9.2 documents it for
- inheritance: **none. This is a from-zero attempt.** No prior attempt at this rung
             was opened for any purpose — not its rig spec, not its motion spec, not
             its harness, not its `README.md` or `LOOP.md` for process
- guide:     `docs/AUTHORING.md` in full (§8, §9, §10, §11), `docs/MOTION.md`,
             `docs/GATE.md`
- profile:   `spine`
- gate:      **v2.3** (2026-09-02), read from `docs/GATE.md`
- builds:    **24 compiles.** Every turn is in [`LOOP.md`](LOOP.md) §4

## Why this run exists

The same brief, the same frames and the same rung as the graduation series, attempted
**from zero** on rigc as it stands a week later — with `rigc pose`, texture-floor
attribution via `--texture-from`, `docs/MOTION.md` and the extent-spread framing all
landed. It is a measurement of the **tool**, not of a spec lineage, which is why it
inherits nothing. What each instrument contributed, and where each one ran out, is
`LOOP.md` §3 and §4; the summary is at the foot of this file.

## What was built

`spineboy-ess.rig.json` + `spineboy-ess.motion.json` → `spine/`, at the top level of
this directory rather than under an `ess/` subdirectory: the protocol's own output
template is flat and puts each candidate in a named subdirectory for **a rung with
two skeletons**, and this run built one. The two `2026-08-28` spineboy runs used
`ess/`; nothing here is nested because nothing else is coming.

Everything the run wrote is one of four things: the two specs and `spine/` (the
candidate), `tools/` (the harness), `fit/` (its intermediate stores — the folded
`pose` table, the pose series, the setup parameters, the reference's own change
series), and `evidence/` plus the `check*` / `bench*` / `validate` files (what it
measured).

**17 bones**, `root → torso → {neck → head, both arms, both thighs}`. No `hip`: a
bone that carries no art is §10.3's gauge, and the section records what one cost a
previous run on this very figure, so **every keyed bone here carries art** and the
one remaining gauge — the torso's own pivot, which its translate absorbs exactly — is
pinned at the art-read pelvis rather than left to a solver. The trade is that a biped
conventionally has a pelvis bone and `bones.count` and `parent_by_name` are measured.

**21 slots, 29 attachments, region attachments throughout, no meshes.** One image →
one slot → one placeholder, named after the PNG, except where two images can never be
on screen together: the fist (closed/open), the five numbered flares, the two eyes,
the three mouths. The names are the art's names straight through — §10.1 calls that
the largest lever it has.

**8 animations**, all eight `ess` names, at the 30 fps grid value inside each of the
brief's duration windows. **1,450 keys** across 132 timelines, **8 easings**,
**5 event firings** of 3 declared events at the moments the brief quotes to the frame.
No `drawOrder` timeline: the brief reports a search over both skeletons that came up
empty, so the frames show no draw-order change and this candidate authors none. No
bounding box: the frames cannot show one and G5's deduction clause exists for exactly
that.

## The measures

`bun cli.ts bench spineboy --candidate … --frames bench/reference/spineboy/ess --json
bench.json`, run **once**, at the end. Full output in [`bench.txt`](bench.txt) and
[`bench.json`](bench.json); the `check` table in [`check.txt`](check.txt) /
[`check.json`](check.json), every frame in
[`check-all-frames.txt`](check-all-frames.txt), the texture attribution in
[`check-texture-from.txt`](check-texture-from.txt), `validate` in
[`validate.txt`](validate.txt).

### diff vs `spineboy/ess`

```
  ess        bones=0.702  slots=0.817  attachments=0.955  constraints=1.000  animations=0.812  events=0.333
             bones 0.702 (name-matched) · 0.800 (name-agnostic)   slots 0.817 (name-matched) · 0.643 (name-agnostic)
             reported: mesh_edges 1.000 · key_density 0.511 · keys_per_timeline 0.441
```

The measures the clauses read, out of the same block:

| measure | figure |
| --- | --- |
| `animations.count` | **1.000** (8/8) |
| `animations.names` | **1.000** (8/8) |
| `animations.duration` | 1.000 (8/8) — *reported*, not read by G4, whose length limb is a tolerance |
| name-agnostic `slots.count` | **0.952** (20/21) |
| `attachments.count` | **0.931** (27/29) |
| `events.names` | 0.333 (1/3) |
| `animations.key_counts` | 0.444 (647/1456) |
| `animations.curve_kinds` | 0.445 (648/1456) |
| `animations.timeline_kinds` | 0.706 (108/153) |
| `bones.names` | 0.842 (16/19) |
| `slots.names` | 0.864 (19/22) |

⚠️ **The `pro` line `bench` also prints is noise.** `bench spineboy` diffs whichever
candidate it is given against **both** references, so that line is an `ess` rig
measured against a skeleton it was never built from. The tool labels it *(stretch —
reported, does not count)*; it is quoted in `bench.txt` and read as nothing here.

### check, per set

| set | MAE | MAE (ref px) | worst | worst slot drift | change disagreements | `drawnRatio` | sheet mean | worst tile | worst ÷ mean |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `aim` | 24.35 | 25.07 | 24.35 | 2.83 px | 0 | 0.996 | — | — | — |
| `aim@30fps` | 24.35 | 25.07 | 24.35 | 2.83 px | 0 | 0.996 | — | — | — |
| `death` | 46.49 | 50.73 | 80.44 | **9.33 px** | 0 | 0.982 | — | — | — |
| `death@30fps` | 28.32 | 29.35 | 29.87 | 2.44 px | 0 | 0.987 | 51.15 | 113.73 | 2.22 |
| `hit` | 41.90 | 43.98 | 57.83 | **8.96 px** | 0 | 0.925 | — | — | — |
| `hit@30fps` | 39.19 | 41.42 | 42.02 | **8.96 px** | 0 | 0.955 | 66.85 | 116.90 | 1.75 |
| `idle` | 28.13 | 29.10 | 33.41 | 2.51 px | 0 | 0.978 | — | — | — |
| `idle@30fps` | 28.10 | 29.02 | 32.54 | 1.37 px | 0 | 0.958 | 27.24 | 31.66 | 1.16 |
| `jump` | 40.01 | 42.67 | 66.56 | **6.36 px** | 0 | 0.957 | — | — | — |
| `jump@30fps` | 41.42 | 43.97 | 41.48 | **6.36 px** | 0 | 0.962 | 56.59 | 104.25 | 1.84 |
| `run` | 55.75 | 59.12 | 78.21 | **7.09 px** | 0 | 0.812 | — | — | — |
| `run@30fps` | 66.79 | 70.40 | 67.06 | 0.32 px | 0 | 0.691 | 83.70 | 113.79 | 1.36 |
| `shoot` | 28.93 | 29.75 | 36.94 | 4.72 px | 0 | 0.784 | — | — | — |
| `shoot@30fps` | 24.39 | 25.16 | 27.35 | 2.00 px | 0 | 0.997 | 29.44 | 38.22 | 1.30 |
| `walk` | 39.29 | 41.09 | 74.63 | 5.86 px | 0 | 0.919 | — | — | — |
| `walk@30fps` | 28.11 | 29.03 | 28.18 | 3.84 px | 0 | 0.984 | 63.76 | 117.73 | 1.85 |

**Framing: `frames.json`'s own declared box was TAKEN on 13 of the 16 sets**, clause
`coincident`, a fit there asking 0.03–0.22 px. The rig is authored in the frames' own
world units and origin, read off the sidecar (`LOOP.md` §2), so the sets that took the
box are measured in the box the frames were drawn at rather than in a fit of it.

### the texture floor, attributed

`check --texture-from examples/spineboy/export/spineboy.atlas` — the example packs
its regions at **`scale: 0.5`**, which is the case §9.2 warns about, so the question
is worth asking and the answer is unambiguous:

| set | MAE | texture floor | above it | what the texture explained |
| --- | ---: | ---: | ---: | ---: |
| `aim` | 24.35 | 7.94 | 20.68 | 3.68 (15.1 %) |
| `idle` | 28.13 | 7.88 | 24.93 | 3.20 (11.4 %) |
| `death` | 46.49 | 6.70 | 44.11 | 2.38 (5.1 %) |
| `run` | 55.75 | 6.01 | 53.56 | 2.19 (3.9 %) |
| `run@30fps` | 66.79 | 5.16 | 65.02 | 1.78 (2.7 %) |
| `shoot@30fps` | 24.39 | 7.76 | 20.51 | 3.88 (15.9 %) |

Across all 16 sets the floor is **5.16–7.94 MAE** and it explains **2.7–15.9 %** of
each figure — the two rows above are the extremes of both columns. ⇒ **The rig is the story here, not the texture** — the opposite of rung
3, where the same instrument attributed about 70 %. It cost one flag and it is the
kind of finding §9.2 says is *"worth having before a day of key-hunting"*.

## The reading — clause by clause, as the AUTHOR reads it

🚫 **This is not a verdict.** A rung is cleared by a person reading the measures and
`docs/LADDER.md` is where that is written; this section says what this run believes it
can and cannot show, so an adjudicator can check it rather than re-derive it.

| clause | the author's reading | on what |
| --- | --- | --- |
| **G1** validity | **met** | `validate --profile spine`: **16 PASS, 0 FAIL**, 9 SKIP, 14 PROF (`validate.txt`) |
| **G2** worst attributable slot drift ≤ 6.0 px, every set | ⛔ **not met**, on **5 of 16 sets** | `death` 9.33, `hit` and `hit@30fps` 8.96, `run` 7.09, `jump` and `jump@30fps` 6.36. Eleven sets are inside the bar, five of them under 2.6 px |
| **G2** 🕳️ no-drift HOLE | **does not fire** | no set has `framesWithoutDrift` equal to its frame count; the largest is `death` at 2 of 60 |
| **G2** per-slot limb (v2.2) | ⚠️ **fires, and this run does not discharge it** — see below | several slots draw and are attributable in no frame of a set |
| **G3** per-frame motion | **met** | `changeDisagreements` = **0 in every one of the 16 sets**, and **no `⚠️ overdraw`** — the highest `drawnRatio` in the run is 0.997 against `OVERDRAW_RATIO` 1.5 |
| **G4** shot inventory | **met** | `animations.count` **1.000** (8/8) and `animations.names` **1.000** (8/8). Lengths, as the two quoted values the clause asks for: every one of the eight is authored at the single 30 fps grid multiple inside the brief's own duration window, and `A09_ANIMATION_DURATION_MATCHES_SPEC` **PASSes** against the loaded skeleton — `aim` 0 s, `death` 148/30, `hit` 10/30, `idle` 50/30, `jump` 40/30, `run` 20/30, `shoot` 12/30, `walk` 1 s, each inside 1/12 s of the reference's by construction |
| **G5** drawn inventory, name-agnostic | **met, before any deduction** | `slots.count` **0.952** and `attachments.count` **0.931**, both over 0.85. No deduction is claimed and none is needed |
| **G7** sheet flatness | **met** | every sheet's worst tile ÷ its own mean: 1.16, 1.30, 1.36, 1.75, 1.84, 1.85, 2.22 — all under 3.5 |
| **G6** the rung | ⛔ **not met**, on G2 | `ess` is the only skeleton this run built, and G2 fails on five of its sets |

### G2's per-slot limb, and the evidence this run can offer

Slots that **draw** in a set and are attributable in **no** frame of it, counted over
all 16 sets (`check.json`; the audit is one pass over its per-frame `slots` arrays):
`eye` and `rear-upper-arm` in **16 of 16**, `front-thigh` and `neck` in 15,
`rear-thigh` in 14, `front-upper-arm` and `mouth` in 13, `rear-bracer` in 10,
`rear-foot` in 7, `front-fist` in 6, `rear-shin` in 5, `gun` in 4, `front-bracer`
and `front-foot` in 2, `front-shin` and `torso` in 1.

⚠️ **This run does not claim a read-down for those, and says so plainly.** v2.3 asks
for two halves — a measured attributability ceiling calibrated on the slots the
instrument *does* attribute, **and** everything observable about the slot verified
strict without the missing attribution — and this run has the first half only. What it
has is [`evidence/slot-ceilings.txt`](evidence/slot-ceilings.txt), which measures the
share of each slot's own material that nothing drawn after it covers, on **every frame
of every set**, and reports the maximum:

| slot | visible ceiling | mean visible | `check` attributed |
| --- | ---: | ---: | ---: |
| `neck` | **1.8 %** | 0.4 % | 1 / 147 |
| `rear-upper-arm` | 42.8 % | 7.7 % | 0 / 147 |
| `front-thigh` | 48.0 % | 31.6 % | 1 / 147 |
| `head` | 53.0 % | 52.5 % | 129 / 147 |
| `rear-foot` | 68.7 % | 49.1 % | 44 / 147 |
| `front-bracer` | 79.7 % | 57.1 % | 56 / 147 |
| `front-shin` | 81.3 % | 67.4 % | 118 / 147 |
| `eye` | 82.9 % | 82.0 % | 0 / 147 |
| `rear-bracer` | 84.3 % | 23.3 % | 14 / 147 |
| `torso` | 89.7 % | 59.6 % | 129 / 147 |
| `rear-thigh` | 95.6 % | 48.1 % | 4 / 147 |
| `rear-shin` | 96.9 % | 50.9 % | 56 / 147 |
| `gun` | 100 % | 52.8 % | 54 / 147 |
| `front-upper-arm` | 100 % | 63.6 % | 6 / 147 |
| `front-foot` | 100 % | 95.3 % | 95 / 147 |
| `front-fist` | 100 % | 86.5 % | 29 / 147 |
| `mouth` | 100 % | 100 % | **1 / 147** |
| `goggles` | 100 % | 100 % | 142 / 147 |

⭐ **What it does establish is that `check`'s blanks here have two different causes,
and the clause's own ground applies to only one of them.** `neck` is unattributable
because **98 % of it is never on screen** — a geometric ceiling, on a corpus where
every slot with a ceiling over 68 % is attributed on 4–97 % of frames. `mouth` is
unattributable in 13 of the 16 sets at **100 % visibility**, because it is 21 × 13 px
inside the head's own connected component and `check`'s matcher finds no distinctive
peak. The second is not
a ceiling on visibility at all, and a verdict that read them the same way would be
wrong about one of them. The conventions are in `tools/ceiling.ts`'s header; the
ceiling is the candidate's own geometry, which is what keeps it inside the honesty
rule.

## Known-wrong, and known-undecided

1. ⛔ **The muzzle flare is not keyed on.** `muzzle01..05`, `muzzle-glow` and
   `muzzle-ring` exist in the skin and are never shown. Sweeping the muzzle bone's
   angle over the full turn at 5° and a uniform scale over 0.6–3.4, then refining, the
   best the flare does on `shoot` f2–f4 is **35.73 mean against 35.76 with nothing
   drawn** — no improvement, at a converged scale of **0.33**, which is the search
   trying to make the part invisible (`evidence/switches.txt`). So the flare's
   geometry is something this run failed to measure, and shipping a large mis-shaped
   flare on three frames to satisfy a convention would be authoring an argument as a
   measurement. The **moment** is authored — a `gunshot` event at 0.15 s, inside the
   brief's 0.133–0.167 s window — and the pixels are not.
2. ⛔ **`death`'s raised hand is a closed fist in this candidate, and the brief says
   it is an open one.** Both of this run's instruments prefer closed: a composite
   sweep over all 132 committed 12 fps frames prefers it on every shot's aggregate and
   on 131 of the 132 frames, and keying the switch at f27 cost the `front-fist` slot
   **12.2 px of drift at `death/f0035`** (measured by `check` on a build that is not
   committed) against 9.3 px for the whole shot without it. ⚠️ That is **not** a claim
   the brief is wrong about the art: `front-fist-open`'s own attachment offset was
   never fitted, so what those numbers separate is two placements rather than two
   drawings. The brief's reading is the better instrument for the question and this
   candidate does not follow it.
3. ⚠️ **The mouth is drawn 0.18 MAE worse than not drawing it.** At the best of a three-stage
   sweep of its offset across all three candidate mouths, `mouth-smile` reads 43.13 over eight
   frames against 42.95 with the slot hidden (`evidence/face.txt`). It is kept: the
   brief reports the mouth as visible at 6–8 px, and omitting a part the frames show
   is the shape of repair rung 7's third attempt was refused for. The placement of a
   6–8 px feature is simply not good enough to be worth its ink.
4. ⚠️ **`run` is the weakest shot and is not near the others.** 55.75 MAE at 12 fps
   and 66.79 at 30, against 24–41 for the rest, with `drawnRatio` 0.81 and 0.69 — the
   candidate draws a fifth to a third **less** ink than the reference there. Two
   flight frames and the widest blaster sweep in `ess` (the brief measures 121 px) are
   in that shot and this run did not land them.
5. ⚠️ **Over-keyed by about 2×, and the missing half of §10.3 is why.** 1,450 keys
   against the reference's 744; `key_density` 1.96× and `keys_per_timeline` 2.27×.
   `tools/density.ts` shows the density is largely forced — the median cost of skipping
   one sample is **1.625 frame px, 4.6× the declared 0.35 px tolerance**
   (`evidence/key-density.txt`) — but this run did **not** do the other half §10.3
   asks: measure each channel's own objective basin and floor the tolerance at it,
   capped. `rear-upper-arm.rotate` is the channel that most needed it (visible ceiling
   42.8 %, the largest median skipped-sample cost in the rig at 10.5 px) and it is
   keyed as a measurement.
6. **Undecided, and recorded as decisions rather than measurements:** the draw order
   beyond the two edges the brief measured; which mouth (`mouth-smile`, margin 0.309
   over the runner-up) and which eye (`eye-indifferent`, margin 0.028, and invisible
   either way); the three event names; region-over-mesh throughout; and the absence of
   a `hip`.

## Honesty

**No honesty-rule breach during authoring.** `examples/spineboy/export/*.json`,
`bench/transcriptions/`, `docs/LADDER.md`, `docs/SPEC_COVERAGE.md`, `src/ladder.ts`,
`bench/render_reference.ts`, git history and every other run's directory were not
opened. Nothing was inherited.

🚨 **One disclosure, at the finish line and recorded in `LOOP.md` §6.** `bench`'s own
console banner prints `src/ladder.ts`'s gate string, which names **per-skeleton bone,
slot and animation counts for both skeletons** — a fact the forbidden table seals to
an authoring run. It arrived in the output of the one command the protocol says to run
last, after the candidate was final; `bench.json` does not carry it (issue #137) but
the console does, and this run read it. **No edit followed it**, and the line is
**redacted in the committed `bench.txt`** so a later run opening this directory for
process notes does not meet it — as `2026-08-24-spineboy-3` did with the same field.

## What the guide should have said

Nine items, in [`LOOP.md`](LOOP.md) §7. The three worth naming here:

- **`src/render.ts`'s `Quad` comment names the corner order `br, bl, ul, ur`;
  reconstructing a known pose from the emitted vertices gives `bl, ul, ur, br`.** Two
  of this run's instruments took the comment on trust and read every screen angle
  about 90° out, which produced confident, plausible, wholly wrong placements. Either
  the comment should name what the reconstruction finds or it should say which index
  is which, so a reader can check it in one line.
- **§8.1's reach check is written for a chain that is too *short*; a chain that is too
  *long* fails the same way and looks different.** Instead of a limb that cannot
  reach, the figure **splays** — a leg bent sideways to reach a floor a straight one
  overshoots — at ordinary residuals on every stance frame. Same arithmetic, and this
  run would have saved four builds by doing it before the first fit.
- **§11 would benefit from one line about characters.** `pose` answered `head`,
  `goggles`, `torso` and the two shins on 107–146 of 147 frames and the far arm, the
  thighs, the feet, the fists and the gun on 0–55 — a split §11.4 predicts exactly
  (occlusion, and near-identical pairs) but which nothing prepares a reader to expect
  as *roughly half the parts, on every frame*.

## The comparison this run was launched to make

Not a verdict, and stated as figures with their scope so an adjudicator can check it.

| | this from-zero run | for reference |
| --- | --- | --- |
| builds | **24** | the graduation series ran ~23 per attempt |
| worst attributable slot drift, any set | **9.33 px** (`death`, `torso`, f0005) | the series' arc across attempts 2–5 was 19.57 → 7.86 → 5.55 px |
| sets inside G2's 6.0 px bar | **11 of 16** | — |
| `changeDisagreements` | **0 in all 16 sets** | — |
| `animations.count` / `.names` | 1.000 / 1.000 | — |
| name-agnostic `slots.count` / `attachments.count` | 0.952 / 0.931 | — |
| `bones.names` | 0.842 (16/19) | — |
| texture floor | 5.16–7.94 MAE, explaining 2.7–15.9 % | rung 3's was ~70 % of its figure |

⇒ **On the one figure the two are comparable on** — worst attributable drift, absolute
frame pixels, same rung, same skeleton, same bar — this attempt lands at **9.33 px**,
between the second attempt's 19.57 and the third's 7.86, and short of the 5.55 the
series finished at. ⚠️ The comparison is **only** legitimate on drift, which is the
gate's own reason for gating it (per slot, framing-independent); the MAE figures are
not comparable across runs or framings and no cross-run MAE claim is made here.

What the new instruments bought, measured rather than asserted, is in `LOOP.md` §3
and §4: a trunk placed to **0.50 px rms** off `rigc pose`'s own report on 147 frames,
one joint triangulated at 228° of relative angle and cross-validated to **0.45 frame
px** by an independent solve, and a texture question closed in one command. What they
did not buy is the other half of the figure: `pose` refuses the occluded and duplicated
parts on every frame, and every pixel of the arms and legs in this candidate came from
the same composite search the earlier attempts had to write for themselves.
