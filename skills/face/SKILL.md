---
name: face
description: Author a face on plain Spine data with rigc — a blink, a gaze shift, a breathing portrait and a head turn a few degrees off axis, built from deform timelines and per-part parallax. Use when the request is a talking or living portrait, a standing character, an expression or a head turn, such as "rig this face", "make the portrait blink and look around" or "turn the head". Not for Live2D file conversion, cutting a face illustration into parts, or VTuber-style real-time face tracking.
license: MIT
compatibility: Requires Bun 1.2 or later and the npm package spine-rigc.
---

# Face — a turn, a gaze and a blink

Load this when the request is a **head rather than a body**: a drawn face that
breathes, blinks, moves its eyes and turns a few degrees off axis. Every rule below
is owned by [FACE.md](../../docs/FACE.md); this file says when to open it and what
it will not do for you.

## Non-negotiables

- **Validation is never bypassed.** `build` writes nothing on a red gate, and there
  is no flag that changes that — AUTHORING §0.
- **The compiler never invents a value.** A `deform` key states every vertex it
  moves; the geometry a turn implies is evaluated by you and written into the spec,
  never inferred by the compiler — AUTHORING §4 and FACE §1.
- **The validator's messages are the instructions.** Read each named failure as the
  pointer to the file that has to change — AUTHORING §5.

## What this guide will not do

Nothing in the toolchain measures what a `deform` key does: the setup geometry is
measured and printed, the deformed geometry is not, and a key that folds a mesh
inside out gates green. FACE §9.2 demonstrates it and §9.3 is the differential
audit that works today.

## Read, in this order

1. [AUTHORING.md](../../docs/AUTHORING.md) — the `deform` timeline field by field
   and what rigc refuses in it (§4), the failure map (§5–§6), the editor's
   conventions (§10).
2. [MOTION.md](../../docs/MOTION.md) — timing, easing and the offset table (§3),
   candidates and the ballot (§4–§5). A blink and a gaze are ordinary motion work.
3. [FACE.md](../../docs/FACE.md) — the face's own geometry: the closed form every
   number in a turn comes from (§1), the hierarchy underneath (§3), what
   foreshortens (§5), and the deform audit gap (§9).
4. Then [RIGGING.md](../../docs/RIGGING.md) for the hierarchy as a general rule
   rather than this closed form, and [INGEST.md](../../docs/INGEST.md) if the head
   arrived as a compiled skeleton.

The install line and the build → validate → render → check loop are in the `rigc`
skill.
