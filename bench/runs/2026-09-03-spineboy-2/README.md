# spineboy — 2026-09-03, attempt 2, from zero, with `rigc chainfit` in the toolbox

- date:      2026-09-03
- agent:     Claude Opus 5 (1M context), Claude Code / Agent SDK, fresh session
- brief:     [`bench/briefs/spineboy.md`](../../briefs/spineboy.md) **revision 4**, 2026-08-27, third-party verified ×3
- guide:     [AUTHORING.md](../../../docs/AUTHORING.md) in full — §8, §8.1, §9, §10, §11 and **§12** in hand;
             [MOTION.md](../../../docs/MOTION.md); [GATE.md](../../../docs/GATE.md) (the clause statements)
- profile:   spine
- reference: **not read.** No `examples/*/export/*.json`, no `bench/transcriptions/`, no
             `docs/LADDER.md`, no `docs/SPEC_COVERAGE.md`, no `src/ladder.ts` gate strings,
             no `bench/render_reference.ts`, no git history. One collision with the launch
             prompt is recorded in [`LOOP.md`](LOOP.md) §1
- inherited: **nothing.** From-zero: no prior attempt's rig spec, motion spec, harness or
             intermediate store was opened, and protocol item 10 does not apply
- skeleton:  **`ess` only.** The rung clears on `ess` alone and `pro` is the stretch
             figure; this run built one candidate and reads only the `ess` line
- bench:     run **once**, after the last edit. Not bench-assisted

## Why this run exists

Issue [#291](https://github.com/firejune/rigc/issues/291): a second from-zero attempt at
the same brief, under the same protocol, with **exactly one change in the toolbox** —
`rigc chainfit` now exists. The run prices the instrument.

⚠️ **The claim shape is "where a fresh attempt lands with `chainfit` in the toolbox",
not "`chainfit` = X px".** A fresh attempt carries attempt-to-attempt variance — a
different rig, a different fitter, a different set of authoring decisions — so nothing
here is a controlled subtraction against the recorded series. What *is* a measurement is
the per-part trail: on which parts, on how many frames, the instrument produced a
reading, and whether the shipped value came out of it.

## The inputs

The brief; `bench/reference/spineboy/ess/` (8 animations, **132 frames at 12 fps** plus
8 sheet sets carrying **15 committed stills** at 30 fps) and its `frames.json`; the art
in `examples/spineboy/images/` (40 PNGs, fetched, not redistributed here); this
repository's `src/`; and the CLI.

🚫 **`examples/spineboy/spineboy.atlas` was declined** — allowed-list item 4 offers it
and says a run that does not need it should say so. rigc emits a 29-page
one-part-per-page atlas from the loose PNGs. It was opened once at the very end, as
`--texture-from`, which is a named diagnostic and not the record.

## What was built

One skeleton, **16 bones, 21 slots, 29 attachments**, no constraints, no meshes, no
events, no draw-order timeline. `spineboy-ess.rig.json` and
`spineboy-ess.motion.json` are the run's two authored files; `tools/` is the harness
that produced them and `tools/rebuild.sh` rebuilds the artifact from a clone.

```
root
└─ torso                  slot: torso                     translate + rotate
   ├─ head                slots: neck, head, eye, goggles, mouth
   ├─ rear-upper-arm ─ rear-bracer ─ gun ─ muzzle          slots: …, gun, muzzle-ring, muzzle, muzzle-glow
   ├─ front-upper-arm ─ front-bracer ─ front-fist
   ├─ rear-thigh ─ rear-shin ─ rear-foot
   └─ front-thigh ─ front-shin ─ front-foot
```

**Draw order** (index 0 furthest back, and the slots array *is* the setup order — R4):
`rear-foot`, `rear-shin`, `rear-thigh`, `rear-upper-arm`, `rear-bracer`, `gun`,
`muzzle-ring`, `muzzle`, `muzzle-glow`, `neck`, `torso`, `front-thigh`, `front-shin`,
`front-foot`, `head`, `eye`, `goggles`, `mouth`, `front-upper-arm`, `front-bracer`,
`front-fist`.

Three of those edges are the frames' own, from the brief's *What this brief cannot tell
you*: the near leg in front of the gun, and the near leg in front of the far leg. Every
other pair is one the frames never catch overlapping, and it is ordered far-side-first
off the art's own naming. **No `drawOrder` timeline** — the brief's search for a
draw-order *change* came up empty, and §10.2 says a change has exactly one expression,
so authoring one would be asserting something the frames do not show.

### The five decisions worth naming

1. **`torso` is the trunk and everything hangs off it**, rather than a pelvis with the
   chest and the legs as siblings. Chosen for identifiability, not anatomy:
   `chainfit` recovers a bone from an anchor by walking **outward only** (§12.2, "a bone
   above an anchor does not [follow]"), and `torso` is the one part `pose` places
   confidently on nearly every frame of this corpus. Under a pelvis the legs sit above
   the only reliable anchor and every leg comes back `no-anchor` on every frame.
2. **The neck plate rides the `head` bone.** §10.1 asks for one slot per image, which
   this rig gives it; it does not ask for one bone per slot. A separate neck bone is a
   second rotation between the torso and the head, and at 8 × 9 frame pixels the frames
   cannot separate the two.
3. **Three slots hold alternatives, and each is earned by the shot** — §10.1's "a
   shared slot is for alternatives, not for economy". `muzzle` holds the five numbered
   flare plates (the shot swaps between them over three frames), `front-fist` holds
   closed and open (the brief settles that `death`'s wave raises an open fist), and
   `eye` and `mouth` hold their alternatives because only one of each can be on screen.
   Every other image gets a slot of its own.
4. **`root` is never keyed.** It sits at the world origin — which is the floor, the one
   line the brief measures — and the trunk carries the figure's position. That removes
   the exact rotation gauge §10.3 warns about outright, rather than folding or
   regularising it.
5. **The candidate is authored in the frames' own world units.** One art pixel is one
   world unit, *measured*: with `pose`'s `--scale` window opened to 0.10–0.40 the four
   biggest unoccluded parts return 0.216–0.221 against the sidecar's 0.222973 px/unit.
   The trunk's world position is the torso plate's own pelvis cap carried through
   `pose`'s placement on `idle/f0000` into the sidecar's box.

## The measures

See [`evidence/check-summary.md`](evidence/check-summary.md), generated from
[`check.json`](check.json) by `tools/summary.ts` so every figure below reproduces from a
stored file rather than from a transcription.

### `bench spineboy`, verbatim

<!-- BENCH -->

### `check` against the frames

<!-- CHECK -->

## The chainfit price tag

<!-- TRAIL -->

## The reading — the author's, and not a verdict

<!-- READING -->

## What is known-wrong, and what was not attempted

<!-- KNOWN -->

## What the guide should have said

<!-- GUIDE -->

## Files

<!-- FILES -->
