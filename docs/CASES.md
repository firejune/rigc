# Case study — converting a Live2D model to Spine, and verifying the conversion

**A method for converting a foreign player's model into Spine data with rigc,
run once end to end on two Live2D sample models and verified against the
source's own renderer and against Spine's own runtime.** The conversion was
made on 2026-09-26 by an agent holding this repository and nothing that reads
Live2D, and we verified it: against the source's frames the converted
skeletons read MAE 0.12 and 0.30 out of 255 in spine-webgl, and their posed
vertices sit within a twentieth of a model pixel of the source's on average.
What this page records is the method and that verification — what was done at
each step, what measured it, what the measuring found wrong in rigc, and where
the method stops.

There is no converter behind any of this, and there will not be one. rigc reads
no Live2D file ([FACE.md](FACE.md#11-non-goals--stated-so-nobody-proposes-them-as-gaps)
§11, the paragraph that opens *No Live2D file is read or written*). The
conversion is the method applied by an agent with only the tree, and the
figures below are what make it more than a claim.

---

## 1. What was asked

The prompt, in one sentence: a public web page (a pen) plays two Live2D sample
models — convert them to Spine with rigc.

**What the agent had:** this repository — its guides, its skills and the CLI —
network access, and a headless browser.

**What it did not have:** the Spine editor, any Live2D-to-Spine converter, and
any rigc code that reads Live2D, because there is none.

## 2. The method

Stated for any foreign player — a Live2D model, a Unity scene — wherever a step
is generic; the one run's numbers are kept only where they show the step
happened. AUTHORING §0, *When the source is a foreign player*, owns the rules
these steps follow.

1. **Run the source's own player, headless, on a clock you control.** The
   player is the only thing that knows what the model draws, so it is the
   source of both the geometry and the reference pictures. Seed its randomness
   and step its clock by hand at the rate you will check at. In the run, the
   player was stepped at 30 fps on a virtual clock; without it two captures of
   the older model differed, and with it two runs gave **byte-identical vertex
   data** for both models.
2. **Dump every drawable's state per frame:** its vertices, UVs, triangles,
   opacity, draw order and masks. That is everything the conversion is made
   from; nothing is guessed from a picture.
3. **Cut the parts from the source's texture along the drawables' UVs, and make
   each one a mesh with the drawable's own geometry.** Never from a screenshot:
   a screenshot is the composed result, and a part cut from it carries every part
   under it. In the run, one authored mesh per drawable, outline first — **215 of
   215 single pieces with no holes**.
4. **Bake the motion as deform keys, and opacity and order as their own
   timelines.** Vertex positions become deform keys, linear between kept keys;
   opacity becomes alpha keys, draw order becomes draw-order keys, masks become
   clipping attachments. In the run, a key was dropped only where interpolation
   stays within **0.1 model px**, and the first model's **3 masks** became
   clipping attachments. One root bone carries everything.
5. **Render the reference frames from the same player, before building
   anything to compare with them,** onto the opaque background `check`'s
   no-`frames.json` note names, at the rate you will check at. In the run,
   **300 and 270 frames at 30 fps**, plus a second capture of both with texture
   mipmaps off as a control (section 3 says why it was needed).
6. **Build, and fix every red by its message.** In the run, three named reds on
   the first model, each naming what to change:
   - a compile error, *`easings` is absent … (write {} …)*;
   - a compile error, *hull vertices must come first* — fixed by the outline-first
     renumbering;
   - `FAIL A22_MESH_UVS_IN_UNIT_RANGE: mesh "D_PSD_13" uv[31] is -0.00199`, nothing
     written — the source's UV ran past its page edge, and the crop was extended
     with the edge texel.

   Then green on both: `validate` reads **16 measured, 16 passed, 0 failed**.
7. **Check against the reference frames, and read the figure against a floor**
   ([AUTHORING §9](AUTHORING.md#9-checking-against-the-frames--rigc-check)).
   Section 3 is this step.

## 3. How it was verified

Three instruments and four comparisons, each answering a different question,
none of them the gate:

| instrument | what it compares | first model | second model |
| --- | --- | --- | --- |
| `rigc check` against the no-mipmap reference | rigc's rasteriser vs the source's frames, MAE over the union alpha, 0..255 | **0.55** (worst 1.07) | **0.46** (worst 0.53), with `--viewport` |
| spine-webgl 4.3.13 against the same reference, exact framing | Spine's own runtime vs the source's frames, MAE 0..255 | **0.123** (worst 0.225) | **0.299** (worst 0.431) |
| vertex error | spine-core posed at every frame vs the source's own vertices | mean **0.039**, worst 0.138 model px | mean **0.038**, worst 0.136 model px |
| `check` against the source's own mipmapped frames | as the first row, over the frames the pen actually shows | 7.41 | 5.16, with `--viewport` |

What each one is and is not:

- **`check`** is the loop's instrument. It sees a wrong animation and grades
  nothing; a figure is read against a floor. On the first model its per-frame
  line read *all 299 adjacent pair(s) change by as much as the reference's own
  frames do*, so no hold or seam is hiding under the mean. It draws through
  rigc's own rasteriser, which is why section 4's first finding could hide in it.
- **spine-webgl** is the oracle: the runtime a consumer ships, reading the built
  files. It is the figure that says the conversion is right where it will be
  played — and it is outside rigc's selftest, so it was run for this
  verification and is recorded here, not gated.
- **Vertex error** measures geometry alone. It says the baked keys reproduce the
  source's vertices to about a twentieth of a model pixel on average; it says
  nothing about texture, order or masks.

**Why the mipmapped figures are about 7 and 5, and why that is not the
conversion.** The pen's player samples its textures with mipmaps; the
converted atlas does not. Three controls separated the two:

- re-capturing with mipmaps off gave the **same vertex data**, and spine-webgl's
  figure fell from 7.09 and 5.12 to 0.12 and 0.30;
- a throwaway copy of the atlas set to mipmapped filtering brought the first
  model from 7.09 to **2.03** (a probe only — the emitted atlas was not changed);
- re-capturing without anti-aliasing changed nothing (7.42), so anti-aliasing,
  the first explanation tried, was rejected.

## 4. What verifying it found in rigc

**rigc's rasteriser skipped clipping attachments** — [#844](https://github.com/firejune/rigc/issues/844).
On the first model's blink frame f0115, `check` read MAE **1.07** against **0.53**
at an open-eye frame, and its `--out` picture showed both irises drawn over
closed lids; spine-webgl read 0.16 against 0.06 and clipped them. The code said
why in a comment and nothing said it to the reader: a clipping attachment draws
no pixel, so it was skipped — but it removes pixels, and skipping it drew what
the runtime removes. Fixed in v1.2.1 by
[#847](https://github.com/firejune/rigc/pull/847), which runs spine-core's own
`SkeletonClipping` beside the draw-order walk: f0115 now reads **0.60**, the
blink's excess over an open frame went from 0.54 to 0.07, and every unclipped
figure is byte-identical.

**A sidecar-less reference that is not opaque was measured whole-frame** —
[#842](https://github.com/firejune/rigc/issues/842), found while writing the
guide's paragraph for foreign sources rather than by the run itself. A foreign
player's frames carry no `frames.json`, so `check` finds the content box
against a background colour and did not read alpha: the same drawn pixels read
MAE 2.25 on grey and 20.37 on a transparent background, both at exit 0. Fixed in
v1.2.1 by [#845](https://github.com/firejune/rigc/pull/845): such a set is now
**refused** by name, because with the box pinned the transparent set reads 32.90
where the grey one reads 0.00 — a figure about the background that no flag
repairs.

**The framing fit does not survive a cropped reference, and the tool said so.**
The second model's canvas cuts off part of the figure, so its content box is not
the candidate's. The fitted framing read MAE 31.03 on the pen's frames and
32.70 on the no-mipmap ones, with the framing block marked `unsettled` after 8
passes. That flag was read as the tool's own signal: the fitted figure was
rejected, and `--viewport` pinned to the source's canvas gave 0.46 on the
no-mipmap frames, with the framing line still measured under the pin — rms
0.02 px — so the pin was checked rather than assumed.

**Rejected: the slot-drift readings.** `check` reported slot drifts of 21–43 px.
Vertex error at most 0.14 model px and frame MAE at most 1.1 contradict them,
and they were rejected as artefacts of drift's template correlation on 84 and
131 overlapping slots hung from one bone. They were not carded.

## 5. What the result is not

- **Not a rig.** The method produces a baked vertex cache: one bone and a mesh
  per drawable, playing one fixed performance. There are no bones to pose, no
  physics and no Live2D parameter axes — no angle, no eye-open, no mouth. A
  bone-rig approximation was rejected because it would need values the source
  never states, and a compiler here never invents one.
- **One motion.** The idle motion only, about 10 s and 9 s; other motions,
  expressions and pose alternatives were not converted.
- **Not a loop.** The source itself does not return to its first frame (first
  against last frame MAE 32.9 and 14.5), so the animation is not declared as
  one.
- **Not captured:** the older model's culling state. The reordering of left- and
  right-eye parts inside each clipped eye group was checked only through the
  figures above.
- **Not publishable.** Both models are Live2D sample models, redistributed by the
  pen's library under Live2D's
  [Free Material License](https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html)
  (version 1.6, revised 2025-02-03), which does not let a licensee redistribute
  all or part of the material (§4.1.1), nor — in §4.1.2's own words — "modify
  …, port, adapt, or translate the Material", except as the agreement expressly
  permits. So the conversion stayed on the machine that made it, and this page
  carries figures, never pictures. It names the models only as the two sample
  models the pen loads.

## 6. The other two sittings, for contrast

Not a comparison of models: the three ran on different trees at different times.
What changed between them is the text the package ships.

**Before this one**, a third-party agent was given the same prompt and the same
access to the repository, on the tree before v1.2.0, and took 17 minutes. Its
parts were rectangles cut from a **screenshot** of the composed model — four of
them flat swatches, the eye slots holding crops of hair — its motion was
invented while the source's motion files sat unread, it made no reference
frames, and it never ran `check`. The gate was green, 13 measured and 0 failed,
and that green was genuine: every one of those defects is a value the spec asked
for, which is exactly what a gate cannot see. That sitting is why v1.2.0 exists
— [#834](https://github.com/firejune/rigc/issues/834) (`check --out` writes the
picture the number came from), [#835](https://github.com/firejune/rigc/issues/835)
(`render --slot`/`--hide`), [#836](https://github.com/firejune/rigc/issues/836)
(the skill's loop says what to look for and where a foreign source's reference
frames come from) and [#837](https://github.com/firejune/rigc/issues/837)
(`preview` carries the gate's line).

**After it**, an agent of the first sitting's family was given the same prompt
with only the installed package, `spine-rigc@1.2.1`, and took 15 minutes. It did
what the package's text says: reference frames first, on an opaque grey; parts
from the texture rather than a screenshot; `preview` last. It did not open
`check --out`'s pictures or answer the look questions with `--hide`, which the
text also says. On the first model its parts went in as regions at each
drawable's bounding-box centre, though the drawables' vertices were in hand, and
it ran `check` once per rig and reported MAE **85.75** and **65.17** as results.
Those figures are not attributed to the regions alone — that conversion differs
from this one in more than mesh against region — but two sentences were missing
from the text, and [#849](https://github.com/firejune/rigc/issues/849) added them
([#850](https://github.com/firejune/rigc/pull/850)): a figure is where the loop
starts, not where it ends, and a drawable's geometry is a mesh attachment with
its vertices, UVs and triangles, where a region at its box keeps only the box.

The delta between the first sitting and the third is the package's text. What
the text still did not carry after v1.2.1 is one sentence each in #849.
