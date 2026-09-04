---
name: ingest
description: Work with a Spine skeleton.json somebody else authored — exported from the Spine editor or another tool — using rigc. Read and validate it, understand a complaint rigc raised about it, transcribe it into rigc specs, normalise, re-pivot or rename it, and extend it with an animation it does not have. Use when the input is an existing skeleton.json with its .atlas and page images rather than loose part PNGs. Not for Live2D file conversion or runtime tracking.
license: MIT
compatibility: Requires Bun 1.2 or later and the npm package spine-rigc.
---

# Ingest — a skeleton you did not author

Load this when what you were handed is **already a skeleton**: a `skeleton.json`
with its `.atlas` and page images, and a request to understand it, answer a
complaint about it, re-express it, or extend it. Every rule below is owned by
[INGEST.md](../../docs/INGEST.md); this file says when to open it and what it will
not do for you.

## Non-negotiables

- **Validation is never bypassed.** `validate` reads a foreign file as it is, and
  `build` writes nothing on a red gate — AUTHORING §0.
- **The compiler never invents a value.** A transcription states every bone, slot
  and key the specs need; what the export left implicit has to be written down
  before it compiles — INGEST §2.
- **The validator's messages are the instructions.** A red line on an export is a
  fact about the file, and sometimes about the rule — INGEST §3 says which, and
  AUTHORING §5 names the file to change.

## What this guide will not do

rigc cannot write a skeleton back. There is no command that edits a `skeleton.json`
and no route from it to specs, so every change goes through transcription — INGEST
§0 and §2. `diff`'s ratios say how much of a reference's structure a candidate
reproduces, so extending or renaming a foreign skeleton lowers them by design, and
neither `validate` nor `diff` has a pass bar — INGEST §0 and §4.

## Read, in this order

1. [INGEST.md](../../docs/INGEST.md) — what every command will and will not do with
   a foreign file (§0), transcription (§2), what each validator complaint means on
   an export (§3), and the re-pivot, rename and extend recipes (§4).
2. [AUTHORING.md](../../docs/AUTHORING.md) — the two spec files the transcription
   targets (§3–§4), the failure map (§5–§6), and the coordinate contract (§11).
3. Then [RIGGING.md](../../docs/RIGGING.md) for why the re-pivot edit has the shape
   it has, and [MOTION.md](../../docs/MOTION.md) for the animation you are adding.

The install line and the build → validate → render → check loop are in the `rigc`
skill.
