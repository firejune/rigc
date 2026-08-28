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

(entries follow, one per turn — written live)
