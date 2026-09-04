---
name: rigging
description: Decide a Spine rig's hierarchy with rigc — how many bones, where each pivot sits, what hangs off what, offsets, chains and what a chain can reach, siblings versus chains, constraints as structure — and which of those decisions the reference frames can check. Use when the request is a skeleton from loose part PNGs, such as "rig these parts", "make a Spine skeleton" or "where do the joints go", before any motion is authored. Not for Live2D, cutting an illustration into parts, or VTuber-style tracking.
license: MIT
compatibility: Requires Bun 1.2 or later and the npm package spine-rigc.
---

# Rigging — the hierarchy itself

Load this when the request is a **skeleton rather than a movement**: loose part
PNGs in, a bone hierarchy out. Every rule below is owned by
[RIGGING.md](../../docs/RIGGING.md); this file says when to open it and what it
will not do for you.

## Non-negotiables

- **Validation is never bypassed.** `build` writes nothing on a red gate, and there
  is no flag that changes that — AUTHORING §0.
- **The compiler never invents a value.** A bone's `parent`, a slot's `bone`, a
  constraint's `target` resolve by name and a miss is refused by name; a missing
  number is a `CompileError` naming the field — AUTHORING §2 and §3.
- **The validator's messages are the instructions.** Read each named failure as the
  pointer to the file that has to change — AUTHORING §5.

## What this guide will not do

Nothing grades a hierarchy. A rig with its head off its torso passes the gate, the
pixels are nearly blind to structure, and the two instruments that see it at all
are named in RIGGING §11 — neither as a pass bar.

## Read, in this order

1. [AUTHORING.md](../../docs/AUTHORING.md) — the rig spec field by field (§3),
   the failure map (§5–§6), reading a pose out of a picture (§8.1, §11, §12),
   and the editor's own conventions (§10).
2. [RIGGING.md](../../docs/RIGGING.md) — the structure itself: what identifies a
   pivot and what moving one costs (§2–§3), gauges (§4), what a chain can reach
   (§6), and the instruments that see structure (§11).
3. Then [MOTION.md](../../docs/MOTION.md) once the skeleton exists;
   [FACE.md](../../docs/FACE.md) if the figure is a head;
   [INGEST.md](../../docs/INGEST.md) if the skeleton was handed to you already
   compiled.

The install line and the build → validate → render → check loop are in the `rigc`
skill.
