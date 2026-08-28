# spineboy — attempt of 2026-08-28 (`ess` only)

- date: 2026-08-28
- agent: Claude Fable 5, Claude Code / Agent SDK
- brief: `bench/briefs/spineboy.md` **revision 4** (third-party verified ×3, 2026-08-27)
- guide: docs/AUTHORING.md in full, §10 in hand
- profile: spine
- reference export: **not read**; previous spineboy attempts (2026-08-23-spineboy-1/2,
  2026-08-24-spineboy-3): **not read** (sealed as attempts at the rung being authored)
- skeleton: `ess` alone — the rung clears on `ess`; `pro` was not attempted
- candidate: `ess/spineboy-ess.rig.json` + `ess/spineboy-ess.motion.json` → `ess/spine/`
- builds: 23 (LOOP.md counts them)
- bench: run once, at the end (`bench.json`); the loop ran on `check` and on
  `fitting/runcheck.ts` (the same renderer and the same change rule, candidate-side)

## What was built

An 18-bone biped authored in the frames' own world coordinates (frames.json
viewport; 1 art px = 1 world unit, confirmed by template matches at scale 1 landing
on the brief's own verification figures). 21 slots in one static draw order — the
frames show no draw-order change, and the two decided `ess` edges (near leg in front
of the gun; near leg in front of the far leg) hold in one ordering with the gun drawn
between the torso and the legs. Editor-convention alternatives share slots: 2 eyes,
3 mouths, 2 fists, 5 muzzle flares (+ glow and ring slots, unused — see known-wrong).
All 8 animations; durations declared on the 30 fps grid inside the brief's windows
(`death` 148/30, `walk` 1, `run` 20/30, `idle` 50/30, `jump` 40/30, `shoot` 12/30,
`hit` 10/30, `aim` 0). Events: `footstep` fired at walk's two footfalls (5/12, 11/12)
and run's two landings (3/12, 7/12); `shoot` fired at the flash instant (5/30−1e-6).
2,581 keys.

Method (fitting/, committed): §8.1 as code — coarse-to-fine composite fits per frame
through the repository's own rasteriser; full-range scans; (thigh,shin)/(upper,bracer)
pair scans; whole-body (hip.x,hip.y) and (hip.rot,torso.rot) pair scans at the coarse
level; analytic 2-link-IK seeds from measured colour features (gun teal with the head
excluded, boot reds under both leg assignments, goggles for the head, fist template
peaks); jittered restart batteries on stuck frames; two geometry surgeries the gait
shots could not reveal (front-arm segments to the art's own proportions; the front
shoulder joint at the spine top, triangulated through the lying pose); a multi-shot
setup re-fit (27-frame spread, pivots compensated so the setup render is invariant);
sheet-tile fits for in-between poses on the fast passages (death's tumble, jump's
launch and drop, hit, walk/run mid-strides), keyed at their own 30 fps instants.

Key planning (§10.3): declared tolerance **0.5 px at each bone's lever end**
(converted per bone), per-channel basin floor **0.25°** (the fitter's own final
step), cap **2 px**; forced keys at series ends, turning points, and both ends of
every run of exact equality; span deviation also capped at the smallest single-frame
move inside the span; a 5-entry easing table fitted per span *during* planning
(pass A/B as one pass — a span is only valid if a table entry carries it), automatic
handles snapped to the table on no-interior spans.

## The measures

`bench spineboy` (run once, after the last edit; raw report in `bench.json`):

```
validate   green  (profile spine)
ess        bones=0.924  slots=0.838  attachments=0.955  constraints=1.000  animations=0.778  events=0.500
           bones 0.924 (name-matched) · 0.967 (name-agnostic)   slots 0.838 (name-matched) · 0.798 (name-agnostic)
```

The `pro` line `bench` also prints is labelled *(stretch — reported, does not
count)* and is noise for this candidate (built from `ess`); it is not quoted as a
measurement of anything, per the two-skeleton rule in `bench/runs/README.md`.

Final `check` (verbatim source: `check-final.txt`, `check-final.json`):

Framing: 3 of 16 sets (run, walk, walk@30fps) measured in **frames.json's own box**;
the other 13 in the shared fit `x1.000072 offset −0.02, −0.03 px` (rms 3.72 px,
union residual −8.66 x +7.41 px — the flare's widest instant reaches 8 px short of
the reference's column 354, and one death in-between pose dips ~7 px below the
reference's lowest row).

| set | MAE mean / worst (union) | worst slot drift | per-frame changes | sheet mean / worst |
| --- | --- | --- | --- | --- |
| aim | 35.90 / 35.90 | 3.6 px front-foot f0 | single frame | — |
| death | 44.85 / 50.94 f30 | 5.0 px torso f36 | **all 59 pairs in band** | 45.96 / 69.03 (t1) |
| death@30 last still | 40.44 / 45.90 f148 | 4.6 px torso f148 | — | (149 tiles) |
| hit | 41.95 / 47.63 f2 | 7.9 px torso f0 | **all 4 pairs in band** | 45.61 / 55.04 (t1) |
| idle | 31.54 / 33.94 f1 | 2.1 px neck f18 | **all 20 pairs in band** | 31.91 / 40.05 (t13) |
| jump | 37.69 / 51.22 f14 | 3.6 px torso f14 | **all 16 pairs in band** | 42.76 / 56.03 (t29) |
| run | 37.20 / 52.07 f5 | 5.5 px rear-shin f6 | **all 8 pairs in band** | 46.50 / 60.97 (t13) |
| shoot | 37.42 / 40.27 f0 | 5.2 px torso f3 | **all 5 pairs in band** | 38.17 / 41.70 (t11) |
| walk | 32.13 / 38.69 f2 | 4.7 px front-foot f7 | **all 12 pairs in band** | 38.44 / 56.72 (t21) |

Chains rollup (every set):

```
neck             2.7 px "goggles" run/f0005      mean 0.5 px
front-thigh      4.7 px "front-foot" walk/f0007  mean 1.7 px
front-upper-arm  4.2 px "front-fist" walk/f0001  mean 0.8 px
rear-thigh       5.5 px "rear-shin" run/f0006    mean 1.2 px
rear-upper-arm   2.6 px "gun" shoot/f0000        mean 0.6 px
torso            7.9 px "torso" hit/f0000        mean 2.1 px
```

- **Frame-change agreement: 0 disagreements** on all 124 adjacent pairs across the
  eight shots — `death`'s nine-pair hold lands 0,0,0,0,0,·,0,0,0 with the f22→f23
  blip at ~10 px changed (the reference's own reading is 1 px at 8/255), and the
  f13→f17 boot settle stays inside the band on all five pairs.
- **Worst attributable slot drift anywhere: 7.9 px** (torso, hit f0000 — the shot's
  opening extreme, a lying pose no restart battery improved past err 0.207).
- **Inventory: complete.** No set reports a reference component no slot reaches.
- **Durations: exact.** All 8 declared on the 30 fps grid; A09 green; frame counts
  match the reference sets at both rates (60/149 for death included).

## Reading

The three dimensions previous attempts fell on all landed: the change column is
clean everywhere (the standing attempt's record was 3 of 59 on `death`), the worst
drift is a single frame of `hit` at 7.9 px with every other set at ≤ 5.5 px and every
chain mean at ≤ 2.1 px, and the drawn inventory is complete. What did NOT land at the
level of the cleared rungs is the absolute MAE (union means 31–45): the per-pixel
fidelity of the poses is honest but visibly short of a transcription — the arm chains
carry the largest error per pixel (`front-upper-arm` 73.7 MAE-in-it), and the lying
passages of `death`/`hit` are fitted to ~0.20–0.33 of the windowed objective rather
than the ~0.08 the standing shots reach.

## Known-wrong / limitations

- `hit` f0's torso: 7.9 px drift, the run's worst figure; the whole-body horizontal
  pose is fitted (err 0.207) but its torso sits a few px off. Restart batteries
  saturated; the shoulder/chest geometry (fit against upright shots) is the suspect.
- The muzzle flash under-reaches: the reference's f4 flare touches column 354, mine
  stops at ~346, so the union box is 8.7 px narrower than the reference's. muzzle04
  at 4.0× was the best fit of the five flares swept to 5.5×; the residual shape
  difference is in the flare's own sparse debris.
- `muzzle-glow` and `muzzle-ring` slots exist and are never keyed on — the flash fits
  never preferred adding them. If the reference composes them under the flare, the
  frames did not separate that (the flare covers them); logged as shipped-on-reasoning.
- The mouth choices are inside the objective's noise on every shot (separations
  < 0.4 %); `mouth-smile` ships everywhere but `death`, which ships `mouth-grind` on
  the visible teeth in the f45 zoom. The eye under the goggles is not decidable
  (`eye-indifferent` ships) — both logged as reasoning, not measurement.
- The wave passage (`death` f27–f59) tracks the reference's per-pair change (all in
  band) but at the low end — the head-end micro-rocking that carries 70–85 % of the
  reference's change there is reproduced at roughly a quarter to a half of its pixel
  count, which the band accepts.
- The f22→f23 blip is authored (a 0.1° fist turn between samples 22 and 23), not
  fitted: the reference's one changed pixel is beneath the fitter's resolution. Same
  for the last step of the boot settle (a decaying 2.4/1.6/0.8° authored on the foot
  channels at f14–f16 on top of fitted values, recorded as a trade per §10.3).

## What the guide should have said

- §9.2's `disagrees` rule is two-sided, and the second side is the binding one on a
  shot like the wave: *mine ≥ a quarter of theirs* on every pair the reference moves.
  §10.3 discusses the "hold that is not held" and the "excess change" directions;
  the under-change direction (a candidate that moves too little against a
  busy reference) is what death's wave kept failing, and nothing in §10.3 names it.
- The §8.1 dilution trap has a temporal cousin worth a sentence: on a shot where a
  small part moves against a large still body, the whole-figure objective
  under-weights the mover — weighting the objective by the reference's own
  frame-to-frame change mask is what made the wave trackable at all.
- §8.1's "borrow only the chain in question" would have benefited from: *measure the
  chain's reach against the extremes the shot visits before fitting it* — both front-arm
  surgeries were reach deficits that every per-frame fit silently absorbed until a
  passage needed the full extension (walk's own fist pendulum already implied 184
  units against the folded chain's 98).
