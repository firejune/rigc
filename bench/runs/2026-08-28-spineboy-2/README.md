# spineboy — attempt 5 (2026-08-28), the surgical re-attempt

- date:      2026-08-28
- agent:     Claude Fable 5 (claude-fable-5), Claude Code / Agent SDK, fresh session
- brief:     revision 4 (third-party verified ×3)
- guide:     AUTHORING.md §10 in hand
- profile:   spine
- reference: **not read** (export, transcriptions, LADDER status/per-rung/Operating
  rules, SPEC_COVERAGE, ladder.ts gates, issue measures, render_reference, git
  history — none opened)
- inherited: **from attempt 4 (`2026-08-28-spineboy-1`), under protocol item 10**
  — its rig spec, motion spec and `fitting/` harness with the intermediate stores
  it wrote for itself. Its README/LOOP (beyond process), `bench.json`,
  `check-final.*` and compiled `spine/` stayed sealed. This is the **first run
  under the inheritance clause**; `LOOP.md` §1 carries the itemised list.

## What this attempt is

Attempt 4 failed on a single clause: worst attributable slot drift **7.86 px on
`torso` at `hit` f0000** (and the same pose at 30 fps), adjudicated as a
**geometry** defect — restarts saturated on the old skeleton, and the named fix
was *re-triangulating the shoulder/chest joint through the lying poses*. This
attempt performs exactly that surgery and the refits it invalidates, and nothing
else.

## Stage 0 — the determinism baseline

The inherited specs were recompiled **byte-identical** (build 1) and `check` was
run over every set before any edit; the full output is stored untouched in
[`check-baseline-inherited/`](check-baseline-inherited/) (txt + json). No
comparison against attempt 4's stored record was made here — that record is
sealed to this run; the snapshot exists so the adjudicator can make the
determinism comparison to the digit.

Headlines of the baseline: worst attributable drift 7.9 px `torso` at hit f0000
(both rates); next-worst 5.5 px `rear-shin` at run f0006; per-frame change
column clean on all 124 adjacent pairs; hit's torso chain mean 3.6 px.

## The surgery — one geometric edit

**Diagnosis** (tools written this attempt, in `fitting/`):

- `waistprobe.ts` — widening the per-frame torso translate bounds from ±35 to
  ±110 moves nothing: the old geometry's optimum is genuinely at the compromise,
  so no search (and no restart) could have fixed it. Reproduces the adjudicated
  "restarts saturated" from the inside.
- `chestlock.ts` — template-matched `torso.png` and `head.png` (the brief's own
  matcher conventions) on 18 frames across all 8 shots and triangulated the one
  point fixed in both art frames. Through the lying poses the joint solves to
  **p = (5.0, 89.9)** in torso-art coordinates (per-frame residuals 0.5–4.5 px);
  the inherited rig has it at **(18.8, 93.7)**. Upright-only rows re-solve 21
  units away at equal residuals — the joint is **ill-conditioned without the
  lying poses**, which is how the original triangulation went wrong silently.
- `placedelta.ts` — the head sits within 1.4 px of its own match on every frame
  measured; the torso is off by 8.1 px at hit f0, ~5 px through death's lying
  stretch, with a correlated 12–16° angle bias: a rotation about a mis-placed
  pivot, with the head anchored.

**The edit** (`surgery5.ts`): one `movePivot('neck', Δ)` with Δ = (−3.06,
+13.96) in torso-bone space — the setup-render-invariant pivot move the
inherited harness itself uses. Rig-spec diff, in full:

| object | field | before | after |
| --- | --- | --- | --- |
| bone `neck` | x, y | 179.10, 21.98 | 176.04, 35.94 |
| bone `head` (compensation) | x, y | 21.60, −19.96 | 24.89, −33.86 |
| attachment `neck` (compensation) | x, y | −23.15, 13.48 | −19.86, −0.42 |

Six numbers, three objects; the setup pose renders identically before and after.

**The refits it invalidates** (`refit5.ts`, plus `torsopolish.ts` /
`hit0full.ts` / `unifydeath.ts` / `deathpolish.ts` for the frames stuck in the
old-geometry basin): every shot's chest-hung channels — torso translate/rotate,
neck, head, both arm chains — were re-settled per frame. **hip and both legs
were frozen in every refit**, so every leg figure is untouched by construction
(run's 5.5 px rear-shin margin included). death's f13–f26 dead hold was
re-unified pose-identical, and the authored boot-settle degrees in genmotion.ts
were retuned (2.4/1.6/0.8° → 4.2/2.2/1.0°) because the unify changed what they
sit on. One accepted trade is logged in LOOP.md §9: hit f0's pose is 3.8% worse
on the fitter's own composite and decisively better on both frame-derived
placement instruments (the composite there was using the torso as sacrificial
cover for a mis-seated gun; the gun now sits on its measured teal, the brief's
own figures).

## Stage 2 — the delta record, per set

Worst attributable slot drift and MAE mean (union), stage-0 baseline → final.
Every set is marked REFIT(chest): the surgery is skeleton-wide, so every
animation's chest channels were re-settled; **no set's leg or hip keys moved**.

| set | worst drift, stage 0 | worst drift, final | MAE 0 → final | mark |
| --- | --- | --- | --- | --- |
| aim | 3.6 front-foot f0 | 3.5 front-foot f0 | 35.90 → 37.00 | REFIT(chest) |
| aim@30fps | 3.6 front-foot f0 | 3.5 front-foot f0 | 35.90 → 37.00 | REFIT(chest) |
| death | 5.0 torso f36 | 4.8 torso f35 | 44.85 → 44.05 | REFIT(chest) |
| death@30fps | 4.6 torso f148 | **2.9 front-foot f0** | 40.44 → 40.11 | REFIT(chest) |
| hit | **7.9 torso f0** | **4.6 rear-shin f2** | 41.95 → 39.22 | REFIT(chest) |
| hit@30fps | **7.9 torso f0** | **3.4 torso f0** | 39.89 → 40.04 | REFIT(chest) |
| idle | 2.1 neck f18 | 2.1 neck f18 | 31.54 → 32.23 | REFIT(chest) |
| idle@30fps | 1.5 front-foot f0 | 1.8 front-foot f0 | 32.91 → 32.02 | REFIT(chest) ¹ |
| jump | 3.6 torso f14 | 3.6 torso f14 | 37.69 → 37.83 | REFIT(chest) |
| jump@30fps | 2.1 goggles f40 | 1.6 front-shin f40 | 42.16 → 42.67 | REFIT(chest) |
| run | **5.5 rear-shin f6** | **5.5 rear-shin f6** | 37.20 → 37.41 | REFIT(chest) — leg figure identical |
| run@30fps | 2.8 torso f20 | 3.5 torso f20 | 35.38 → 36.25 | REFIT(chest) ² |
| shoot | 5.2 torso f3 | 4.4 front-foot f2 | 37.42 → 37.38 | REFIT(chest) |
| shoot@30fps | 4.4 front-foot f0 | 4.2 front-foot f0 | 40.27 → 40.25 | REFIT(chest) |
| walk | 4.7 front-foot f7 | 4.7 front-foot f7 | 32.13 → 31.93 | REFIT(chest) — leg figure identical |
| walk@30fps | 3.5 front-shin f30 | 3.5 front-shin f30 | 29.78 → 29.54 | REFIT(chest) — leg figure identical |

¹ idle@30's +0.3 px is on a **frozen** channel: the per-set fitted framing moved
with the chest's ink, and the foot is re-measured in the shifted box. Traceable,
not a finding.
² run@30 f20 samples run f8's pose, whose chest refit improved the composite
(0.182 → 0.161); the torso correlator reads +0.7 px there. Traceable.

No figure moved without a traceable cause. The two MAE upticks above +0.5
(aim +1.1, jump@30 +0.5) are chest refits accepted on the fitter's own objective;
their sets' drifts improved or held.

per-frame change column, final: **0 disagreements of 124 adjacent pairs**
(death 59/59, hit 4/4, idle 20/20, jump 16/16, run 8/8, shoot 5/5, walk 12/12).
Durations, inventory, sheets: unchanged from the inherited candidate's structure
(build census identical: 29 regions, 18 bones, 21 slots, 8 animations).

## The measures (bench, run once at the end)

```
validate   green  (profile spine)
ess        bones=0.924  slots=0.838  attachments=0.955  constraints=1.000  animations=0.777  events=0.500
           bones 0.924 (name-matched) · 0.967 (name-agnostic)   slots 0.838 (name-matched) · 0.798 (name-agnostic)
pro        bones=0.243  slots=0.360  attachments=0.262  constraints=0.000  animations=0.545  events=0.500   [stretch]
```

The `pro` line is `bench` diffing this ess candidate against the skeleton it was
never built for — noise per the two-skeleton warning, quoted only to say which
line came from which run. Full per-measure table in `bench.json`; the final
`check` output over every set is `check-final.txt` / `check-final.json`.

## The reading

The graduation clause this attempt existed for: **hit f0000's torso reads 3.4 px
(30 fps set) and is no longer the 12 fps set's worst row** (4.6 px rear-shin at
f2 is), against the 7.86 px that failed attempt 4. The corpus-wide worst
attributable drift is now 5.5 px — run's rear-shin, **bit-identical to the
baseline figure** because no leg channel was touched. The torso chain's cross-set
worst fell 7.9 → 4.8 px and its mean 2.1 → 1.8 px.

## Known-wrong, recorded rather than smoothed

- In death's lying stretch and shoot f2–f4 the torso template match and the
  composite fitter disagree by ~12–16° of torso art angle (match residuals are
  mediocre there, 2869–4109). The composite stood — pinning the torso at the
  match costs +30% composite on death's hold — and the final check reads those
  figures at 4.8 px and 4.4 px, under every margin. If the adjudicator's
  instruments read death's torso differently, this is where to look.
- `events` 0.500 and the `animations.key_counts` / `curve_kinds` ratios are
  inherited structure this attempt deliberately did not touch: the mandate was
  the one geometric edit and its refits.
