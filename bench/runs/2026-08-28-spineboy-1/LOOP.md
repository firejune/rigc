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
