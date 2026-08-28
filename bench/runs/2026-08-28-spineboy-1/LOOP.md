# spineboy — attempt of 2026-08-28 (the graduation exam), the loop

- date:      2026-08-28
- agent:     Claude Fable 5, Claude Code / Agent SDK
- inputs:    brief (`spineboy.md`, **revision 4**, third-party verified ×3),
             docs/AUTHORING.md in full (§8, §8.1, §9, §10 included),
             `examples/spineboy/images/` (40 PNGs, fetched via `bun run fetch-examples`),
             `bench/reference/spineboy/ess/` (frames, contact sheets, `frames.json`),
             docs/LADDER.md §*How a rung is scored* + §*The honesty rule* only
             (lines 47–443; *Operating rules* at line 445 not opened),
             this repository's `src/` and `tools/` as format and rasteriser documentation
- reference: not read (`examples/spineboy/export/` never opened; `bench/transcriptions/`
             never opened; `src/ladder.ts` never opened; git history not consulted)
- prior attempts: `2026-08-23-spineboy-1/-2` and `2026-08-24-spineboy-3` are attempts at
             this same rung, so their README, LOOP, specs and `fitting/` scripts are
             sealed for this run — nothing inside them was opened. A directory listing
             (file names only) was seen while checking the protocol's output shape and
             is recorded here rather than hidden. The only fact this run holds about
             attempt 3 is what its commander's prompt stated: worst drift 19.57 px,
             3 of 59 frame-change disagreements on `death`, tree shape 1.000, 8/8
             animations — used as "the exam is winnable" and as a warning about
             `death` f13–f17, not as measurements to build from.
- guide:     AUTHORING.md §10 in hand (run is after 2026-08-23)
- profile:   spine
- skeleton:  `ess` only — the rung clears on `ess` alone; `pro` not attempted
- builds:    (counted live; see §Result)
- bench:     to be run once, at the end

## §1 — the reading list

The forbidden list was quoted in this run's starting prompt and held to:
`examples/*/export/*.json`, `bench/transcriptions/`, LADDER.md's status table /
per-rung sections / Operating rules, SPEC_COVERAGE.md, `src/ladder.ts` gate strings,
issue bodies with counts, `bench/render_reference.ts`, git history, and derived forms.
Previous spineboy attempts are additionally sealed as "another attempt at the rung
being authored". `gh issue comment` will post the result without reading the thread.

What this run knows about the gate, all from allowed text (*How a rung is scored*'s
measure-change log): G2 reads slot drift, G3 reads the frame-change column, G4's
duration limb is one sampling interval of the coarsest committed rate, G7 is a
flatness clause on the contact sheet (worst tile against the sheet's own mean).
No thresholds are known to this run and none were authored to; the loop runs on
`check`.

## Loop

### 1 — measure the reference before authoring anything
The change series per 12fps set at 8/255 (`fitting/measure_ref.ts`), which is the band
the plan must land in. Key rows: `death` pairs f17→f18…f25→f26 read
**0 0 0 0 0 1 0 0 0** (the brief's hold, reproduced to the digit); `shoot` f0→f1 = 0;
the quietest nonzero pairs are `death` f16→f17 = 70 and f15→f16 = 211; every other
pair in every shot is ≥ ~900. Consequences: the hold must be pose-identical frames,
the f22→f23 blip must change ≥1 and ≤25 px, and my candidate must move ≥1 px on every
pair the reference moves on (a 0 where the reference is nonzero is a `holds` verdict).

### 2 — anchor matching (template matcher, rev-2/3-style, rebuilt from scratch)
`fitting/match.ts` — composite art at the sidecar's 0.222973 px/unit, search rotation
× position, MSE over solid pixels. Controls: torso (172,270), head (188,224), gun
idle (212,282) land within 1 px of the brief's own verification figures ((173,271),
(188,224), (211,283)); front-fist-open (154,285) vs the brief's (154,284);
front-fist-closed walk f0 (165,289) = the brief's (165,289). Shin one-of-each test:
front-shin takes the screen-left leg (1547 vs 1960), rear-shin the screen-right
(683 vs 3448) — same verdict as the brief's rev-3 pass. Feet are ambiguous both ways
(rear-foot wins BOTH windows) — assignment pinned from the shins, per §8.1's
calibrated-separator rule: front = screen-left in idle.

### 3 — builds 1–2: the rig
18 bones (root, hip, torso, neck, head, 2×(upper-arm, bracer), front-fist, gun,
muzzle, 2×(thigh, shin, foot)), 21 slots in one static draw order (the frames show
no draw-order change; the three decided edges hold: near leg over gun, near leg over
far leg — gun drawn after torso, before the legs). 29 region attachments: eye
(2 alternatives), mouth (3), fist (2), muzzle (5) share slots as editor alternatives.
1 art px = 1 world unit (confirmed by the matches); authored in the frames' own world
coordinates (frames.json viewport). Setup pose = idle f0000. Stage A fit of visible
attachment offsets vs idle f0: objective 0.226 → 0.080 (units: SSD/255²/refInk;
"draw nothing" ≈ 1.0).

### 4 — the fitter (fitting/fitcore.ts, fitshot.ts)
§8.1 as code: pyramid levels k=6/3/1 rendered through the repo's own rasteriser into
a crop viewport aligned to the frame grid; full-range scans; (thigh,shin) and
(upper,bracer) pair scans; whole-body (hip.x,hip.y) and (hip.rot,torso.rot) pair
scans at k=6 (the decisive move for `hit`'s lying poses — 0.42 → 0.21 errs);
multi-start (incumbent, neighbours, setup, spread) screened at k=6; jittered
restart batteries (--restarts). Objective: union-ink SSD normalised by reference ink,
+ out-of-window world-extent charge (the §9.1 cliff), + part-absence guard at the
level's own resolution, + gauge priors (hip.rot 2e-6/deg², neck.rot 1e-5/deg²).
The evaluation traps §9.1 names were avoided by writing to `bone.pose` and calling
`attachment.updateSequence()` from the start.

### 5 — analytic seeds (the multimodal escapes)
- **gun**: teal components (hair excluded around the fitted head-art centre), PCA
  axis, 2-link IK on (rear-upper-arm, rear-bracer) closing on the gun-art centre at
  4 axis hypotheses × both elbows (`fitting/armseed.ts`). Fixed `aim` (gun level:
  0.25 → 0.19), `run`'s reach frames, `walk` f6/f9 (gun behind the near leg).
- **fist**: template peaks (several distinct positions — the single best peak once
  matched the mouth's teeth instead of the hand) → same IK on the front arm.
- **legs**: red components below 55% of the box (boots), both (front,rear)
  assignments tried via leg IK; the objective picks.
- **head**: goggles template around the current head → head.rot seed + (neck,head)
  local pair.

### 6 — builds 4–7: two geometry surgeries the gaits could not reveal
- **Front-arm lengths** (build 5): idle's folded arm had been misread as short bones
  — shoulder→elbow 42, elbow→wrist 41 units, total reach ≈ 98 with the fist offset,
  while `walk`'s own fist pendulum spans 184 units from the shoulder and `death`'s
  raised hand ~220. Segments reset to the art's proportions (75 + 58), pivot moves
  compensated so the setup render is unchanged. walk 0.176 → 0.150, run 0.232 →
  0.201, aim 0.212 → 0.186 after refit.
- **Front shoulder joint** (build 7): in the lying pose the joint sat at row 344 —
  under the body — while the wave's arm base reads ~(92,315); triangulated through
  the posed torso the joint belongs at torso-local ≈ (123, 2), i.e. at the spine top,
  not at the visible shoulder pad. Moved with compensation (idle unchanged), elbow
  preserved; the wave becomes reachable.
- Canonical along-bone art offsets for the arm pieces (build 6), then stage C
  re-settles them against the whole spread.

### 7 — stage C (§8.1's multi-shot setup re-fit) — fitting/setupfit2.ts
Pivots (setup x/y, compensated) + attachment offsets refit against a 27-frame spread
drawn from every shot, poses held. Final pass after the surgeries: 0.2308 → 0.2181
(mean over the spread). Build 8.

### 8 — the flash (fitting/flashfit.ts)
Flash mask = diff vs f1 right of the gun; each muzzle art swept over scale 1.5–5.5.
f2 = muzzle01 @3.9, f3 = muzzle02 @4.0, f4 = muzzle04 @4.0 (residuals .051/.035/.067
— the reference flash is soft exactly like 4× upscaled art). Keys on the 30fps grid
(sheet tiles 5–11): ON 5/30−1e-6, swaps 7/30−1e-6 and 10/30−1e-6, OFF 12/30−1e-6 —
each stepped and one grid step early per §4.5's stepped-timeline rule.
⚠️ First landing had the flare's quad out at column 407: the muzzle placeholders
carried their genrig offsets, and **an attachment offset scales with its bone** — at
4× the 67-unit offset became 268. Zeroed the five flare placeholders onto the muzzle
bone and re-fitted; one line the guide could carry (§3.4): an attachment on a bone
you scale-key must sit at that bone's origin, or the offset rides the scale.

### 9 — emission (fitting/genmotion.ts) and the closing loop
Durations on the 30fps grid the brief's windows single out. Times as exact JS
fractions (k/12, 148/30), stepped keys 1e-6 early. Forced keys: series ends, turning
points, both ends of exact-equal runs. Declared tolerance 0.5 px at each lever's
end; per-channel basin floor 0.25° (the fitter's final step); cap 2 px; the relative
floor (span deviation ≤ smallest single-frame move inside the span). shoot's f0/f1/f5
share one pose object (the reference is bit-identical there); death f18–f26 hold
f17's pose verbatim; the f22→f23 blip is an authored 0.1° fist turn (renders as
10 changed px against the reference's 1 — inside the [1, 25] band).

First compiled candidate: **7 of 8 shots at zero change disagreements** on the first
try; death carried 19, all three families diagnosable: (a) the boot settle
had been flattened by the fitter's basin — authored a decaying 2.4/1.6/0.8° foot
settle at f14–f16 on top of the fitted values (recorded as a trade); (b) the blip at
2° read 162 px — calibrated down to 0.1°; (c) **the wave parked** — the fit found one
pose for whole stretches. Splitting the reference's wave changes by region showed
70–85 % of every pair's change lives in the head end (x<95), not the hand: the lying
body's static ink had diluted the objective. Weighting the objective by the
reference's own change mask (dilated, ×20) plus finer refine steps (to 0.06°) made
the arm and head track; a floor charge (outPenalty 3e-4 with the window walls at the
body's own box) stopped the waving fist sinking below the ground line.

### 10 — sheet-fitted in-betweens (fitting/sheetfit.ts)
The sheet series' spikes were all half-frames on fast passages (§9.3's "do not assume
it lies between its neighbours"): death's tumble tiles 4–22, jump's launch 1–8 and
drop 32–37, hit 3–9, run 4/19, walk 9/21, at 1/3 scale against the sheet's own tiles
(label corner masked). Each fitted from the interpolant and keyed at its own 30fps
instant: death tile 16 err 0.58→0.36, jump tile 36 0.60→0.28, hit tile 6 0.52→0.29.
Worst sheet tiles fell: death 85.6→69.0, jump 97.7→56.0, hit 93.2→55.0.

### 11 — §10.3's "aim inside the band" bit once, measurably
My own loop (runcheck, declared viewport) read death f13→f14 at 169+ px changed; the
report's framing (fitted, x1.000208, −0.06 px) read the same pair at **158** against
a needed 169 — a framing-sized difference crossing the threshold exactly as §10.3
warns. The settle amplitude was raised (margin, not a hair) and the pair reads
comfortably in band in the report's own framing since.

### 12 — targeted drift work off the chain table (§8.1's work queue)
death f5's rear-foot 10.1→(restarts)→8.1→(more restarts + leg pairs)→gone (5.0 set
worst); run f6 11.1→5.5; hit f0's torso 7.9 px survived three restart batteries
(errs saturate at 0.207) and ships as the run's worst attributable figure.

## Result

23 builds; `check` (in-loop, candidate-side) ×6 full passes + runcheck throughout;
`bench spineboy` run once, after the last edit — summary in README.md, raw in
`bench.json`. Final `check`: **0 frame-change disagreements over all 124 adjacent
pairs; worst attributable drift 7.9 px (hit f0 torso); all sets' inventory complete;
durations exact at both rates.**

## Notes

- What was guessable from the frames: everything the brief promised — the stance,
  the footfalls, the flight, the tumble geometry, the hold (to the measure's own
  tolerance), the gun's sweep, the flash's timing to the 30fps tile.
- What was not: the reference's sub-pixel micro-motion (the hold's 719–852 invisible
  moving pixels; the wave's head-end micro-rocking amplitude; the 1-px blip's true
  source), the eye/mouth choices under the goggles, and whether glow/ring compose
  under the flare. Each shipped on reasoning and is named in README known-wrong.
- Guide feedback is in README §What the guide should have said.
