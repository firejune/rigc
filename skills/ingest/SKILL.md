---
name: ingest
description: Work with a Spine skeleton.json somebody else authored — exported from the Spine editor or another tool — using rigc. Read and validate it, understand a complaint rigc raised about it, decompile it into rigc specs with `rigc ingest`, normalise, re-pivot or rename it, and extend it with an animation it does not have. Use when the input is an existing skeleton.json with its .atlas and page images rather than loose part PNGs. Not for Live2D file conversion or runtime tracking.
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
- **The compiler never invents a value, and neither does the decompiler.** The
  specs state every bone, slot and key; what the export left implicit is written
  down before it compiles. `rigc ingest` obeys the same rule from the other side —
  what it cannot read out of the skeleton is a named **finding**, never a guess —
  INGEST §2.0 and §2.
- **The validator's messages are the instructions.** A red line on an export is a
  fact about the file, and sometimes about the rule — INGEST §3 says which, and
  AUTHORING §5 names the file to change.

## Start here: `rigc ingest`

```bash
rigc ingest hero.json --out specs/
rigc build --rig specs/rig.json --motion specs/motion.json --images parts/ --out build/
```

It reads the skeleton — **only** the skeleton — and writes the rig spec and motion
spec that rebuild it: **byte for byte for a skeleton rigc emitted**, and for an editor
export the weaker claim `diff` measures, with three kinds of benign difference left —
INGEST §2.3. Two values it refuses rather than guessing: the
**stage** (`--stage`, for a skeleton that declares none — an editor export *may* be
one, though every one in the example corpus carries a box, and passing the flag at a
file that declares a box is refused rather than ignored) and each animation's
**duration** (the largest key time, recorded as a finding).
Read `findings.json`: a `BLOCK` line means the rebuild will be missing something and
the command exits non-zero. Every code it can print — gutter, exit, meaning, what to
do — is the finding-code table in INGEST §2.0. Keep the `note` both specs carry.

## What this guide will not do

rigc still cannot **edit** a skeleton: there is no command that opens one and
changes it, so every change is expressed in the specs — INGEST §0. `diff`'s ratios
say how much of a reference's structure a candidate reproduces, so extending or
renaming a foreign skeleton lowers them by design, and neither `validate` nor `diff`
has a pass bar — INGEST §0 and §4.

⚠️ This section said *"there is no route from it to specs, so every change goes
through transcription"* until 2026-09-17. That route exists now and it is the first
thing to reach for; transcription by hand is what you fall back on for a construct
`ingest` reports as a blocker.

## Read, in this order

1. [INGEST.md](../../docs/INGEST.md) — what every command will and will not do with
   a foreign file (§0), `ingest` and transcription (§2), what each validator
   complaint means on an export (§3), and the re-pivot, rename and extend
   recipes (§4).
2. [AUTHORING.md](../../docs/AUTHORING.md) — the two spec files the transcription
   targets (§3–§4), the failure map (§5–§6), and the coordinate contract (§11).
3. Then [RIGGING.md](../../docs/RIGGING.md) for why the re-pivot edit has the shape
   it has, and [MOTION.md](../../docs/MOTION.md) for the animation you are adding.

The install line and the build → validate → render → check loop are in the `rigc`
skill.
