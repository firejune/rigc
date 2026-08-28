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
- builds: (see LOOP.md §Result)
- bench: run once, at the end (`bench.json`)

## What was built

A 18-bone biped authored in the frames' own world coordinates (frames.json viewport;
1 art px = 1 world unit, confirmed by template matches at scale 1 landing on the
brief's own verification figures). 21 slots in one static draw order — the frames
show no draw-order change, and the three edges the brief decides (near leg in front
of the gun, near leg in front of the far leg, figure in front of the vortex — the
last being `pro`-only) hold in one ordering. Editor-convention alternatives share
slots: 2 eyes, 3 mouths, 2 fists, 5 muzzle flares. All 8 `ess` animations, durations
declared on the 30 fps grid the brief's windows single out.

The fitting method is §8.1 implemented in `fitting/` (committed): coarse-to-fine
composite fits per frame with full-range scans, pair scans on (thigh,shin) /
(upper,bracer), whole-body (hip.x,hip.y) + (hip.rot,torso.rot) pair scans, analytic
2-link IK seeds from measured colour features (gun teal with head exclusion, boot
reds with both leg assignments, goggles for the head, fist template peaks), jittered
restarts on stuck frames, and two geometry surgeries the gait shots could not reveal
(front-arm segment lengths; the front shoulder joint at the spine top rather than at
the visible pad). Setup pose re-fitted against a 27-frame spread drawn from every
shot (§8.1's multi-shot rule), pivot moves compensated so the setup render is
invariant.

## The measures (verbatim)

(to be filled from the final `check` and the single `bench` run)

## Reading

(to be filled)

## Known-wrong / limitations

(to be filled)

## What the guide should have said

(to be filled after the result)
