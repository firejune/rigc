---
name: rigc
description: Author, build and validate Spine 4.3 skeleton data (skeleton.json plus its .atlas) from loose part PNGs with rigc, the rig compiler that verifies its own output through a spine-core round-trip before writing it. Use for any request to make a Spine rig or Spine animation from PNG parts, or where the source is a Live2D, Unity or video model whose pictures you can render, to run or read rigc build, validate, render, preview, check or vote, or to write or fix a *.rig.json or *.motion.json spec; it says which shipped guide to open for the need at hand. Not for Live2D conversion, cutting an illustration into parts, or real-time face tracking.
license: MIT
compatibility: Requires Bun 1.2 or later. The tool is the npm package spine-rigc (bunx spine-rigc, or bun add -d spine-rigc); the command it installs is rigc.
---

# rigc — a rig compiler for agents

rigc compiles a rig spec and a motion spec into Spine 4.3 skeleton data and an
atlas, round-trips the result through `@esotericsoftware/spine-core`, runs its
named assertions, and writes **only if every one is green**. You cannot see the
rig you are authoring. The validator's messages and the shipped guides are the
whole interface, and this skill only says which of them to open.

## Non-negotiables

- **Validation is never bypassed.** `build` writes nothing on a red gate; there is
  no `--no-validate`, and none may be added — AUTHORING §0 says so in as many
  words. Correctness is the whole of the reason: the round trip through the
  official parser is the only thing that makes the output trustworthy.
- **The compiler never invents a value.** A field the spec leaves out is a
  `CompileError` naming that field. Fill the spec; do not expect a default read off
  the art — AUTHORING §2 and §5.
- **The validator's messages are the instructions.** Each names the object, the
  value found and the value required, and AUTHORING §5 maps every named failure to
  the file that has to change.
- **A green gate cannot see a wrong animation.** If you were given pictures,
  `check` is the half of the loop that can; if not, `render` or `preview` and look —
  AUTHORING §0 and §9.

## Install

```shell
bunx spine-rigc --help       # run it without installing
bun add -d spine-rigc        # or pin it in the project; the command is `rigc`
bun rigc skills install      # then link these skills into .agents/skills
```

Codex, Gemini CLI and Antigravity read skills from `.agents/skills/` in the
workspace and none of them reads `node_modules`; `rigc skills install` puts every
skill the package ships there, and `rigc skills --help` says what it refuses.

## The loop

1. `rigc build --rig <spec> --motion <spec> --images <dir> --out <dir>` compiles,
   gates, and writes only on green.
2. Read the report. Every red line names the file to change; fix the spec and
   build again.
3. `rigc explain --rig <spec> --motion <spec> --out <dir>` when the red line is
   not enough — the compiled rig as a table: every bone with its resolved parent,
   the slots in draw order, every timeline key by key, and a `DEFORM` block per
   deform key. It takes no `--profile`, it never gates, and it writes nothing, so
   the figures are readable on a build the gate is refusing — AUTHORING §0 and
   §4.11.2.
4. `rigc render --candidate <out>` or `rigc preview --candidate <out>` — look at
   it. A rig with its head off its torso passes the gate; looking is what catches it.
   Open one frame at full size, not only `contact.png`: the sheet is for spacing
   across frames, and a defect is read on a frame. Ask it three things — is any
   picture drawn twice, is there a straight edge where the art has none, does a part
   cover a feature the art shows — and answer each with `render --hide <slot>` (or
   `--slot <slot,…>`), which draws the frame again without that part on the same
   grid, so the two frames say which part a pixel is. AUTHORING §0 holds the three.
5. `rigc check --candidate <out> --frames <dir>` when you have reference pictures
   (`--out <dir>` writes the picture each of its numbers came from — open the worst).
   Read its output from the top: the framing block says whether the figures under
   it are about placement or motion. A figure is where the loop starts, not where it
   ends — keep the first green build's figure, check every later build against the
   same frames, and stop when the figure stops moving, not when it exists; AUTHORING
   §9.2 says how to read the framing block and the floor to read a figure against.
   `rigc vote --candidate <a> --candidate <b>` when several candidates are green and
   only a person can choose between them.
6. `rigc validate <out>` re-gates artifacts already on disk, and
   `rigc <command> --help` is each command's own flag table.
7. Every finished unit ends with `rigc preview --candidate <out>`, and the report
   names the `.html` it wrote. The hand-off to a person is part of the work.

The loop in full, with `pose` before it and `chainfit` after the first build:
AUTHORING §0.

## When the source is not loose PNGs

A Live2D model, a Unity scene or a video is a player, not a set of parts. Make the
reference frames first: render the source at the rate you will check at, into one
directory of `f0000.png`, `f0001.png`…, and `rigc check --frames <that dir> --fps <rate>`
reads them with no `frames.json`. A port with no reference frames is unmeasured,
not finished. The parts are the source's own texture cut along its drawables, never
a screenshot: a screenshot is the composed result, and a part cut from it carries
every part under it. Where a part goes is its drawable's geometry — its vertices in
model space, its UVs, its triangles — which is a mesh attachment with those three
(AUTHORING §3.4, *Mesh attachment*); a region at the drawable's bounding-box centre
keeps only the box. rigc reads none of those formats — FACE §11, the paragraph
that opens *No Live2D file is read or written*
([FACE.md](https://github.com/firejune/rigc/blob/main/docs/FACE.md#11-non-goals--stated-so-nobody-proposes-them-as-gaps)) —
only the pictures they produce. The rule, the background those frames need and
what a wrong one costs: AUTHORING §0, *When the source is a foreign player*.

## Which guide, for which need

Read [AUTHORING.md](https://github.com/firejune/rigc/blob/main/docs/AUTHORING.md) first, whatever the need: the two
spec files field by field, the emission rules, the loop, and the failure map. Then:

| The request is… | Open | Skill |
| --- | --- | --- |
| a **skeleton** — how many bones, where each pivot sits, what hangs off what | [RIGGING.md](https://github.com/firejune/rigc/blob/main/docs/RIGGING.md) | `rigc-rigging` |
| a **movement** — an idle, a loop, from this pose to that one | [MOTION.md](https://github.com/firejune/rigc/blob/main/docs/MOTION.md) | `rigc-motion` |
| a **face** — a blink, a gaze, a head turn a few degrees off axis | [FACE.md](https://github.com/firejune/rigc/blob/main/docs/FACE.md) | `rigc-face` |
| a **skeleton.json somebody else authored** — read it, repair it, extend it | [INGEST.md](https://github.com/firejune/rigc/blob/main/docs/INGEST.md) | `rigc-ingest` |
| you are the **person operating** the agent rather than the agent | [PROMPTING.md](https://github.com/firejune/rigc/blob/main/docs/PROMPTING.md) | — |

Every guide linked here is in the installed package at `node_modules/spine-rigc/docs/`,
which is the copy that matches the rigc you run; the links go to the repository's
`main`. Inside the Claude Code plugin the same files are at `${CLAUDE_PLUGIN_ROOT}/docs/`.
Formats, the CLI reference and the licence chain:
[README.md](https://github.com/firejune/rigc/blob/main/README.md), installed at `node_modules/spine-rigc/README.md`.
