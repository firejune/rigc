# What the portrait measured

The measurement half of [`gallery/portrait`](README.md), and stage 1 of
[issue #285](https://github.com/firejune/rigc/issues/285): *can rigc author
scene direction — a standing portrait that breathes, blinks, shifts gaze and
turns its head in 2.5D — on plain Spine data?*

The short answer is **yes at draft quality, and the labour is entirely in one
place.** Everything below is a number off the artifact or a named case; nothing
here is a prediction.

⏳ **This is a record of one experiment, so it stays in the tense it was
measured in.** Where a gap it filed has since been closed the entry says so and
keeps the figure — the cost of the thing is the finding, and a record silently
rewritten to the present is a record of nothing. The example's own
[README](README.md) is the current account of the shipped files.

---

## 1. What it cost

### The rig

| | |
| --- | --- |
| part PNGs | **22** (21 character + 1 stage plate) |
| bones | **27** |
| slots | **22** |
| mesh slots | **2** — `head` 25 vertices / 32 triangles, `hair_bang` 15 / 16 |
| mesh vertices, total | **40**, of which 10 are the columns that carry the turn |
| non-mesh attachments | 20 regions |

⭐ **Two meshes and 40 vertices was enough for a head turn.** That cuts the
other way from the expectation: a Live2D face mesh routinely runs to hundreds of
vertices, and the assumption going in was that a plausible turn would need at
least a 9×9 grid. It does not, because the turn's whole content is a
**horizontal** redistribution — a yaw moves nothing vertically — so the rows are
along for the ride and only the column count buys anything. Five columns, placed
at `±162, ±120, 0` rather than evenly, sample the projection where it changes.

### The motion

| Animation | Duration | Loop | Tracks | Track keys | Deform entries | Deform keys | Hand-written vertex offsets |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `idle` | 3.2 s | yes | 9 | 37 | 0 | 0 | 0 |
| `gaze` | 1.5 s | no | 8 | 32 | 0 | 0 | 0 |
| **`turn`** | 2.2 s | no | **20** | **81** | 2 | 8 | **160** |

✅ **That last cell is now 0**, and the row is kept because the 160 is the
finding: [#294](https://github.com/firejune/rigc/issues/294) shipped, the keys
state `{ "kind": "yaw", "radius": 170, "degrees": 12 }`, and the compiler writes
the run (README, *The mesh*). Everything else in the table is unchanged — the
track half is [#295](https://github.com/firejune/rigc/issues/295) and still open.

**One held yaw was 20 tracks and 160 floats.** The shape of that matters more
than the size: of those 160 offsets there are **five distinct values** (one per
column, repeated down five rows), and 25 of the 50 numbers in a head key are
structurally `0` — every `y` of a 25-vertex grid — because a yaw has no
vertical component. Of the 20 tracks,
**19 are one value each**, all derived from the same expression.

So the labour is not *complexity*. It is **transcription**. Every number in
`turn` is

```
dx = x·(cos t − 1) − z·sin t
```

evaluated at some `(x, z)`, and the spec had no way to say so — it could only
hold the results. That was
[#294](https://github.com/firejune/rigc/issues/294), and it is fixed: a deform
key states its transform and the compiler evaluates it
([AUTHORING §4.11.1](../../docs/AUTHORING.md)).

### The authoring iterations

| Phase | Passes | What each pass was |
| --- | --- | --- |
| **Art, before any rig existed** | **7** | the face composited at its intended placements and looked at: brows (twice — see below), hair silhouette, fringe depth, neck length, garment mass, choker, proportions |
| Rig and motion, first build | 1 | green on both profiles first try, which was not expected |
| **Art fixes found by looking at renders** | **4** | the dark seam, the lid's fade, the iris crossing its lash, the forehead highlight |
| Construction fix found by the cliff sweep | 1 | the iris counter-scale (§2) |
| Cliff sweep | 7 renders | 8, 12, 16, 20, 24, 28, 32 degrees |

⭐ **Drawing before rigging was the right order and it is not obvious.** The head
plate's half-width *is* the cylinder radius `R`, and `R` is in every one of the
30 derived numbers. Building the rig first would have meant re-deriving all of
them seven times.

⚠️ **Four of the five art defects were invisible at contact-sheet scale.** All
four were found at 1:1 or at 3–4× on the eyes. For a face the looking pass is
three scales, not one.

⚠️ **The brows read as a scowl for two iterations, and the brows were not the
problem.** Two eyes whose upper lash is heaviest at the *inner* corner read as
angry whatever shape the brow above them is. Expression lives in ink weight
before it lives in shape — worth knowing before spending a pass on the wrong
part.

---

## 2. Where the cliff is

Three separate failures at three different angles, and the interesting one is not
where intuition puts it.

### The measured sweep

`turn` re-derived at seven angles, built, rendered and looked at. Band widths and
ordering are measured on the shipped 5-column grid.

| yaw | centre shift | far band 42px → | ratio | ink 9px → | reads as a turn? |
| --- | --- | --- | --- | --- | --- |
| 8° | 23.7px | 32.0 | 0.762 | 6.9px | yes, gently |
| **12° (shipped)** | **35.3px** | **26.8** | **0.637** | **5.7px** | **yes** |
| 16° | 46.9px | 21.4 | 0.509 | 4.6px | yes |
| 20° | 58.1px | 15.9 | 0.379 | 3.4px | marginal |
| 24° | 69.1px | 10.4 | 0.247 | 2.2px | no — the eyes have stopped being eyes |
| 28° | 79.8px | 4.7 | 0.113 | 1.0px | no — the far outline is gone |
| 32° | 90.1px | −0.9 | −0.021 | — | **the mesh folds** |

### Failure 1 — the iris goes elliptical, at ~18°

**And this one is fixable, which is why it is the most useful finding here.**

`iris` and `spark` are children of `eye`, so they inherit the socket's
foreshortening `scalex`. A circle under `scalex 0.89` is an ellipse, and an
elliptical pupil reads as *a drawing squashed sideways* — not as a head turned.
It is also wrong on the physics: if the character keeps looking at the camera
through the turn, her eyeball counter-rotates by the yaw angle, so the iris stays
square-on and stays circular. **The socket foreshortens; the pupil does not.**

Two reciprocal `scalex` tracks fix it (`1 / 0.8922` and `1 / 1.0641`), and the
positions still ride the socket because a bone's scale moves its children's local
translation. Measured effect:

| | Reads to |
| --- | --- |
| without the counter-scale | **~18°** |
| with it | **~26°** |

Eight degrees of range for two tracks. Nothing else in the experiment had that
ratio.

### Failure 2 — a `scalex` cannot rotate an almond, at ~26°

The next thing to go is the eye *socket*, and it cannot be fixed the same way.

| yaw | far socket `scalex` | near socket `scalex` |
| --- | --- | --- |
| 12° | 0.892 | 1.064 |
| 20° | 0.798 | 1.081 |
| 24° | 0.745 | 1.082 |
| 32° | 0.629 | 1.067 |

A real eye at 26° does not narrow uniformly: its far corner disappears behind the
nose bridge, its lash line rotates, and its lid wraps. `scalex` does one of those
things. So the far eye becomes a *thin version of a front-facing eye* and the
near eye's lash stretches into a wide flat slab, which is what the 24° render
shows.

⇒ **Past roughly 26°, the eyes need their own deform meshes** — the socket, lash
and lid as a 3–4 column grid each — rather than a bone scale. That is where the
vertex count in this construction stops being 40.

Two smaller things fail in the same band and for the same reason: the **fringe**
tips (a rigid plate that should be splaying) and the **neck** (a rigid plate
whose 28% of the head's shift is an average of a twist — see the README).

### Failure 3 — the mesh folds, and refining it makes this **worse**

The far band's width crosses zero and two columns swap order: the mesh turns
inside out and the outline inverts. On the shipped grid that is **31.38°**.

🚨 **The fold angle is a property of the continuous surface, not of the mesh, and
it moves the wrong way when you refine the grid:**

| Columns | Folds at |
| --- | --- |
| 5 — `±162, ±120, 0` (shipped) | **31.38°** |
| 7 — `±145` added | **24.56°** |
| 9 — `±155, ±145` added | **20.95°** |
| 13 — uniform, every 27px | 27.54° |

The continuous limit is `theta = atan(z / |x|)`, which at the shipped grid's
outermost column (`x = −162`, `z = 51.5`) is **17.65°**. Everything past that
angle is a surface that has genuinely rotated behind its own tangent; a coarse
grid does not fold there only because it does not *sample* there — it crushes
instead. Add a column at `x = −155` and the fold arrives at 20.95°.

⇒ **A denser face mesh is not a safer face mesh.** The safe move is the
opposite: keep the outermost column comfortably inside the silhouette
(`|x| ≤ R·cos θ_max`) and let the last band be a single wide one. This is the
most counter-intuitive result of the experiment, and it is the reason
[#296](https://github.com/firejune/rigc/issues/296) asks for a measurement
rather than a rule of thumb.

### The verdict on angle

**A 5-column grid with bone-scaled features is a 0–16° instrument, comfortable
at 12°.** For a standing-CG portrait that is enough: an idle turn, a
glance-away, a lean into the frame. A 30–45° three-quarter turn is a different
rig — per-eye meshes, a meshed neck, and probably a second art layer for the far
cheek — and it is not a format problem, it is a parts-and-labour problem.

---

## 3. Which tool and doc gaps this hit

Five, all filed with reproductions. Two are defects; three are the instrument
gaps stage 3 of #285 left unbooked.

### Defects

**[#292](https://github.com/firejune/rigc/issues/292) — `rigc render`'s
`bilinear` samples straight alpha, so every atlas-region edge draws a dark rim
over what is behind it.** Measured at **−31/255** down the forehead here, and
**−60/255** in a minimal case of two parts that share one colour and should be
invisible against each other. It has been latent through four gallery examples
because every part in them carries an ink outline at its edge, and a dark rim on
a dark line cannot be seen. **A portrait is the first rig whose plates are
*supposed* to overlap invisibly**, which is the general lesson: *scene work
exercises a renderer where game-part work does not.* It also reaches `rigc
check` — `src/render.ts`'s own header says both paths are bilinear so a filter
difference stays out of the residual, and a systematic rim at every region edge
is in the residual instead.

**[#293](https://github.com/firejune/rigc/issues/293) — `setup: { "slot": null }`
crashes with a raw `TypeError`.** §5.1's contract is that a spec mistake arrives
as a named refusal. Found by the probe that isolated #292.

### Instrument gaps

**[#294](https://github.com/firejune/rigc/issues/294) — a `deform` key has no
generator.** ✅ **Fixed.** The big one. 160 floats of one closed-form expression,
and two of this example's three animations contained a *stated approximation*
whose only cause was how many floats the honest version would take (`turn`'s
anticipation lives in the roll channel; `gaze`'s head-follow is a rigid slide).
rigc already had `generator` for mesh **geometry** precisely because a table is
the wrong way to say a deformation model; the animation half now has the
equivalent — a `transform` on the key, five closed forms, evaluated at compile
time and printed by `explain`
([AUTHORING §4.11.1](../../docs/AUTHORING.md)). ⚠️ **The two approximations
still ship.** Undoing them is an art decision about what `turn` and `gaze` look
like, and this record's claim was only ever that the *transcription* was what
priced them out.

**[#295](https://github.com/firejune/rigc/issues/295) — a `groups` track can
only key one shared value.** The gallery's usual lever for cutting track count
buys nothing on a face, because *every part needing a different number is what
parallax means*. Of `turn`'s 20 tracks exactly one is a group. Sixteen of them
are two properties on six sibling bones with identical times, identical easings
and six different values.

**[#296](https://github.com/firejune/rigc/issues/296) — nothing measures what a
`deform` key does.** The setup geometry is measured and printed (coverage,
overshoot, hole); the deformed geometry is not. A key that folds a mesh inside
out is green, `A35` passes, and the coverage line still reports the setup pose at
100%. The proposed `A39_DEFORM_KEEPS_TRIANGLE_WINDING` would have handed me §2's
fold angles without seven renders.

> 🆕 **Landed 2026-09-03, and one sentence of the above was wrong.** `A39` ships
> as an **archetype** rule and its angle agrees with §2's formula to 0.0001°. But
> this entry claimed the fold "has no legitimate counter-example", and running the
> check over the corpus falsified that in two places: the official `spineboy-pro`
> export reverses one of `hoverboard-board`'s 101 triangles, and `gallery/flex`'s
> leaf reverses up to 7 of 75 — the second a real defect
> ([#313](https://github.com/firejune/rigc/issues/313)), the first correct editor
> output. Hence `archetype` plus an `invariants.deformMayFold` opt-out rather than
> the unconditional rule this entry asked for.
>
> 🆕 **And the other half landed the same day**
> ([#316](https://github.com/firejune/rigc/issues/316)): `rigc explain` now
> prints a `DEFORM` block per key — the area and stretch extremes, the vertices
> moved and the winding, with a worst-key rollup per animation
> ([AUTHORING §4.11.2](../../docs/AUTHORING.md)). On this example's own `turn` it
> reads `area min x0.637174 max x1.319122`, which is §2's compression figure
> without §2's seven renders. It is a **report** and gates nothing, and the one
> quantity this entry asked for that it does not carry is *deformed coverage* —
> that figure is rasterised from the uvs, which no deform moves, so it is the
> same at every key by construction and the `MESH` line above already is it.

### Doc gaps, small

- **`gallery/loop_seam.ts`'s usage string named `gallery/_lib/loop_seam.ts`**, a
  path that does not exist. Fixed in this change, since it is in the gallery.
- **[AUTHORING §4.11](../../docs/AUTHORING.md) documents `deform` thoroughly and
  says nothing about grids.** Everything in it is true and none of it is about
  using a deform as a *projection*. The `hull: 0` question, the uneven column
  spacing, and the fold condition are all things §4.11's reader has to invent.
  That is FACE.md's job rather than §4.11's, and it is what §5 below is for.

### What did **not** go wrong, which is the headline

- **The format needed nothing.** Not one thing in this example is outside Spine
  4.3: authored meshes, a deform timeline, bone translate/scale, groups, parent
  chains. No plugin, no extension, no runtime patch.
- **It gated green on both profiles at the first build** — 18 assertions on
  `spine`, 26 on `spine-html`, including `A15_IDLE_NO_MESH_BONE_KEYS` and
  `A13_MESH_BUDGET`.
- **The interop proof holds.** It boots and draws all three animations in the
  official Spine Web Player 4.3 with zero console errors and zero page
  exceptions.
- **The model is exact.** Every mesh column, feature bone and scale value posed
  by `spine-core` agrees with `dx = x(cos t − 1) − z sin t` (composed with the
  1.6° roll) to **under 0.001 px**.

---

## 4. The one thing that will bite a scene, and it is not authoring

**Channel allocation.** Scene direction wants to *layer* — an idle that keeps
running under a triggered gaze, under a turn. Spine can do that with tracks, but
two animations keying the same bone property are **blended, not summed**, so the
three animations here had to divide the rig up front:

| Channel | `idle` | `gaze` | `turn` |
| --- | --- | --- | --- |
| `torso` scale, `chest` translatey | ✔ | | |
| `lids` translatey | ✔ | | |
| `brows` translatey | ✔ | ✔ | |
| `irises` / `sparks` translate | | ✔ | |
| `head` + `hair_bang` mesh deform | | | ✔ |
| `faceshift`, feature translatex / scalex | | | ✔ |
| `hairmass` translatex | | | ✔ |
| `lock_l` / `lock_r` / `ahoge` | rotate | rotate | translatex |
| `headroll` rotate | ✔ | ✔ | ✔ |
| `neck` | rotate | | translatex |

Three collisions survive: `headroll` rotate in all three, `brows` translatey in
two, and the locks' rotate in two. On plain Spine the fixes are ordinary —
`MixBlend.add` on the layered track, or splitting the bone into a stack
(`headroll_idle` under `headroll_scene`) — but both are **runtime or rig
decisions that the motion spec cannot express**, so an author gets no warning
that two of their animations will fight.

⛔ This is why `idle` deliberately keys **nothing** on the iris even though a
completely still eye reads as a mannequin: the iris is `gaze`'s channel. The
loss is real, and it is the shape of thing FACE.md has to name before someone
discovers it by shipping.

---

## 5. The honest verdict, and what FACE.md should teach first

### Is scene direction authorable at draft quality today?

**Yes.** A breathing, blinking, gaze-shifting, head-turning portrait exists,
gates green on both profiles, opens in the Spine editor's own player, and every
number in it is checkable. The premise of #285 survives contact: **the split
between Spine and Live2D is authoring cost, not runtime capability.**

**And the cost is concentrated, not spread.** `idle` and `gaze` cost about what
`walk` and `flex` cost — 9 and 8 tracks of ordinary MOTION.md recipe. The entire
difficulty is `turn`, and within `turn` it is one thing: **the spec can hold the
results of a projection but cannot state the projection.** Fix #294 and #295 and
`turn` is a dozen lines. That is a good place for a difficulty to be.

**What is *not* yet true** is that an author can tell a correct deform from a
plausible one. Everything I checked, I checked with a throwaway script that is
not in this repository. That is #296, and it is the gap that matters most,
because the draft-plus-editor-handwork premise of rigc depends on the draft
being *auditable* — a draft nobody can check is not a saving.

> 🆕 **Closed 2026-09-03, both halves.** `A39` refuses the fold
> ([#314](https://github.com/firejune/rigc/pull/314)) and `explain`'s `DEFORM`
> block prints the extremes ([#316](https://github.com/firejune/rigc/issues/316)),
> so the throwaway script's job is now two commands that ship. ⚠️ The narrower
> claim survives: those measure what a key **did**, not whether it was the key
> the shot wanted — [FACE §9.3](../../docs/FACE.md) keeps that limit and the
> looking protocol it implies.

### What FACE.md should teach first, in this order

1. **The one line, and that it is one line.**
   `dx = x·(cos t − 1) − z·sin t`. Then the two readings: the second term is
   depth times `sin t` and is the whole of the move; the first is the head
   narrowing to `cos t`. A reader who has this can derive every number in a turn
   and will never again reach for a hand-tuned table.
2. **Depth is the parameter you are actually authoring.** A part list for a face
   is not a list of drawings, it is a list of `(x, z)`. The fringe is 26 in
   front of the skull; the back hair is 55 behind it and therefore moves the
   *other way*; the nose protrudes 22 and is the only negative residual on the
   face. Get the depths right and the parallax is free.
3. **One shared shift, then residuals.** A `faceshift` bone carrying `−R·sin t`
   and per-feature tracks carrying only `x(cos t − 1) + (R − z)·sin t`. This is
   what makes the numbers small enough to read and wrong ones visible: a
   residual is 1–6px, a total is 30–40px, and nobody can eyeball an error in the
   second.
4. **The silhouette is a tangent, not a mark.** The single most misleading thing
   about a face plate. Then the practical rule: keep the outermost mesh column
   inside the silhouette at `|x| ≤ R·cos θ_max`, because that is where the fold
   lives — and refining the grid there makes it **worse**, not better (§2).
5. **Uneven columns.** Dense at the edges, sparse in the middle. One decision in
   the setup geometry that every deform key afterwards benefits from.
6. **What foreshortens and what does not.** The socket does, the pupil does not.
   The reciprocal `scalex`, and *why* — because the eyeball counter-rotates to
   keep looking at the camera. Eight degrees of usable range for two tracks.
7. **A blink is a continuous channel, not a swap** — with the timing asymmetry
   (1 : 2.3), the partial-blink argument, and the frame-grid argument, and the
   honest note that Rigby's swap is right for Rigby.
8. **Channel allocation before the first key** (§4). Which animation owns which
   bone property, written down, because Spine blends and does not add.
9. **The three cliffs and their angles** (§2), so a reader picks a construction
   from the turn they need rather than discovering the ceiling after the art is
   drawn.
10. **The looking protocol.** Contact sheet for whether the motion reads, 1:1 for
    whether the drawing arrived, 3–4× on the eyes because that is where the
    reader looks. Four of five defects here were invisible at sheet scale.

⇒ And the one thing FACE.md should teach that this experiment could not
demonstrate: **how to check a deform without writing a script.** That is #296,
and until it exists FACE.md has to teach the arithmetic *and* the auditing,
which is twice the document it should be.

> 🆕 **It exists as of 2026-09-03**, and [FACE §9.2](../../docs/FACE.md) is where
> it is taught: `A39` for the fold, `explain`'s `DEFORM` block for the ratios,
> and `check` for the picture. The arithmetic stays in FACE — a stated model
> evaluates a wrong radius as consistently as a right one — but the auditing is
> now three commands rather than a script the reader has to write.
