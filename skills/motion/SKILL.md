---
name: motion
description: Author a Spine animation with rigc from key poses — an idle, a loop, a move from one picture to another — with timing, easing, anticipation, follow-through, and candidate variants a person can choose between. Use when the request is a movement on an existing or planned rig, such as "animate this rig", "make it breathe" or "go from pose A to pose B", including reading the poses out of reference frames. Not for Live2D, separating an image into parts, or motion capture and real-time tracking.
license: MIT
compatibility: Requires Bun 1.2 or later and the npm package spine-rigc.
---

# Motion — what goes between two poses

Load this when the request is a **movement rather than a skeleton**: a sentence of
intent, between zero and N pictures of what the movement passes through, and a
Spine animation somebody would choose coming back. Every rule below is owned by
[MOTION.md](../../docs/MOTION.md); this file says when to open it and what it will
not do for you.

## Non-negotiables

- **Validation is never bypassed.** `build` writes nothing on a red gate, and there
  is no flag that changes that — AUTHORING §0.
- **The compiler never invents a value.** A key with no time, a curve with no kind, a
  bone the rig does not declare — each is refused by name before anything is
  written — AUTHORING §4 and §6.
- **The validator's messages are the instructions.** Read each named failure as the
  pointer to the file that has to change — AUTHORING §5.

## What this guide will not do

Nothing here grades a movement, and no instrument named here can. `build` says a
file is valid, `check` says how far it is from pictures you were given, and the one
thing that judges a movement is a person's eye through `rigc vote` — MOTION §0.

## Read, in this order

1. [AUTHORING.md](../../docs/AUTHORING.md) — the motion spec field by field (§4),
   the failure map (§5–§6), reading reference frames (§8) and checking against
   them (§9), what the editor does when nobody tells it otherwise (§10), and
   reading a pose out of a picture (§11–§12).
2. [MOTION.md](../../docs/MOTION.md) — the normal form every motion request
   reduces to (§0), timing, easing and the per-bone offset table (§3), and how to
   spread candidates so a ballot informs (§4–§5).
3. Then [RIGGING.md](../../docs/RIGGING.md) if the skeleton itself is what you have
   to decide; [FACE.md](../../docs/FACE.md) if the movement is a blink, a gaze or a
   head turn; [INGEST.md](../../docs/INGEST.md) if the rig arrived as a compiled
   skeleton rather than loose parts.

The install line and the build → validate → render → check loop are in the `rigc`
skill.
