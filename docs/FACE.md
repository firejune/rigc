# Authoring a face — a turn, a gaze and a blink on plain Spine data

**Read this when the request is a head rather than a body.** It is written for an
agent that has been handed a drawn face — or has to draw one — and asked for the
moves a portrait makes: it breathes, it blinks, its eyes move, and it **turns a
few degrees off axis**. The last one is the reason this page exists. It is the
move a second format is usually bought for, and it is authorable here, out of an
ordinary `deform` timeline plus per-part parallax, at a cost this page prices
before you spend it.

[AUTHORING.md](AUTHORING.md) is the format — read it first and keep it open; this
page never restates a field it documents, and
[AUTHORING §4.11](AUTHORING.md) is the `deform` timeline field by field.
[MOTION.md](MOTION.md) is the recipe for
*movement* — timing, easing, anticipation, follow-through, the offset table — and
everything in it applies to a face unchanged. This page is the part neither has:
**a face's own geometry**, and what a projection costs when the spec can only
hold its results.

- The `deform` timeline, field by field, and the six things rigc refuses in it:
  **AUTHORING §4.11**
- Timing, easing, arcs, anticipation, follow-through, the per-bone offset table:
  **MOTION §3** — a blink and a gaze are ordinary MOTION.md work
- Candidate spreading and the ballot: **MOTION §4–§5**. Nothing on this page
  replaces a person's eye
- A skeleton somebody else authored, and moving a pivot inside it:
  [INGEST.md](INGEST.md)
- The hierarchy underneath a face, as a general rule rather than this closed form:
  [RIGGING.md](RIGGING.md) — §5 is why §3's `faceshift` is a bone at all and why a
  breath's `chest` is a **sibling** of the plate it must not scale, and §4.4 is the
  artless-parent pattern the shared-shift split is one instance of
- The worked example every number below comes from:
  [`gallery/portrait`](https://github.com/firejune/rigc/tree/main/gallery/portrait),
  and its measurement half,
  [`FINDINGS.md`](https://github.com/firejune/rigc/tree/main/gallery/portrait/FINDINGS.md)

🚨 **Nothing in this toolchain measures what a `deform` key does, and that is the
one gap you have to author around.** The setup geometry is measured and printed —
coverage, overshoot, hole. The *deformed* geometry is not. A key that turns a
mesh inside out gates green — **26 PASS on `--profile spine-html`, the same as
the good build, and the same coverage line reporting the setup pose at
100.00%.** §9.2 demonstrates that with three builds and §9.3 gives you the
differential audit that works today;
[issue #296](https://github.com/firejune/rigc/issues/296) is the instrument that
would close it. Reference it, do not wait for it.

📐 **Where the numbers on this page come from.** Every figure marked **derived**
is re-computed from the closed form in §1 and reproduces to the digits printed.
Every figure marked **measured** was read off the shipped artifact by the
`gallery/portrait` record and carries its scope in the line. Nothing here is a
prediction, and nothing here is a pass bar.

---

## 0. The normal form

**A face request normalises to a depth list plus MOTION.md.** That is the whole
internal shape:

| What arrived | What it becomes |
| --- | --- |
| a face that **blinks**, **breathes**, **looks around** | ordinary MOTION.md tracks. A lid, a chest, an iris. Nothing on this page is needed |
| a face that **turns** | a list of `(x, z)` — every part's position across the screen and its **depth** — plus one line of arithmetic evaluated at each of them |
| a face that turns **far** (a three-quarter view) | ⛔ a different rig, and §8 says where the line is. Not a format problem: a parts-and-labour problem |

⭐ **The turn is the only part of a face that is not already MOTION.md's job**,
and it is 90% of this page. A blink is a translating plate (§6); a gaze is
MOTION §3.7's offset table applied to an eye (§7). If the request does not
contain a turn, read §6 and §7 and stop.

The one thing that is genuinely new: a turn is **not a pose you can key**. It is
a projection, so its values are not chosen, they are *evaluated* — and the
authoring is transcription rather than judgement. Which means the failure mode is
not "it reads badly", it is **"one number is wrong and nothing can see it"**.
That is what §3 and §9 are for.

---

## 1. The one line, and that it **is** one line

Treat the face as painted on a cylinder standing on the skull's vertical axis. A
yaw of `t` about that axis carries a point at `(x, z)` — `x` across the screen,
`z` toward the viewer — to `x·cos t − z·sin t`, so the shift a part takes is

```
dx = x·(cos t − 1)  −  z·sin t
     \____________/    \______/
      the head           depth times sin t:
      narrowing to       the WHOLE of the move
      cos t of its
      width (2.2% at 12°)
```

**That is the entire model.** Everything else on this page is that expression
evaluated somewhere, and the two terms are worth reading separately:

- **`−z·sin t` is proportional to depth.** A part further forward travels
  further. That *is* parallax, and it is why a fringe moves more than a face and
  why hair behind the axis moves the **other way** (§2).
- **`x·(cos t − 1)` pulls both edges inward by the same amount** — the head
  narrowing. It is second order and it is small: at 12° it is 2.2%, which is 3.5
  units at the silhouette against a 35-unit centre shift.

At the 12° the worked example ships (**derived**):

```
t = 0.209440 rad      cos t − 1 = −0.021852      sin t = 0.207912
```

⇒ **A reader who has this line derives every number in a turn and never reaches
for a hand-tuned table.** That matters more than it sounds: a hand-tuned face
table has no property you can check, and a derived one has exactly one — it
agrees with the line, or it does not.

### 1.1 ⭐ And now the spec holds the line, not its results

**A `deform` key states this expression** (AUTHORING §4.11.1). The worked
example's held 12° yaw used to be **160 hand-transcribed floats across 8 keys**,
and it is now four lines of which two are the angle:

```json
{ "t": 0.62, "transform": { "kind": "yaw", "radius": 170, "degrees": 12 }, "ease": "swell" },
{ "t": 1.5,  "transform": { "kind": "yaw", "radius": 170, "degrees": 12 }, "ease": "settle" }
```

⇒ **`radius` is `R` off the depth table (§2) and `degrees` is the angle.** The
compiler evaluates `dx = x·(cos t − 1) − z·sin t` at every vertex with
`z = √(R² − x²)`, writes the millimetre-level results into the artifact, and
`explain` prints both the model and the offsets it produced. What was
transcription is a measurement of the shape the drawing implies, and nothing
else.

Three things that changes on this page, and they are the reasons the construct
exists rather than side effects:

- **A second angle is a second number.** §8's cliff sweep — 8, 12, 16, 20, 24,
  28 and 32 degrees — was seven tables of 160 floats, produced by a throwaway
  script that never made it into the repository: *the measurement existed and the
  reproduction did not*. It is now `"degrees": 20` and a rebuild.
- **The anticipation and the head-follow §3.6 and §7 priced out** were priced out
  by the transcription, not by the format. 80 numbers for a tenth of a second is
  now one key with a smaller `degrees`.
- **The audit changed shape.** A transcription can only be checked against the
  line by hand, which is §9.3's gap; a stated model is checked by reading two
  parameters. What is still unmeasured is the *consequence* — whether that angle
  folds the mesh — and §4.2 and A39 are that half.

⚠️ **What it does not do.** It evaluates; it never chooses. The radius, the
angle, the depth table and whether 12° reads are all yours, and a wrong `radius`
now produces 160 consistent wrong numbers as fast as it used to produce one — see
§4's warning, which the construct makes cheaper to get wrong rather than harder.

📌 **Author `t` in degrees, in the spec.** Radians appear nowhere: the key holds
the angle and the compiler holds the conversion. That is the sentence this
section replaced — the angle used to live only in a comment beside the part list,
because the spec could not hold it, and §9 was what happened when a later reader
could not find it.

---

## 2. Depth is the parameter you are actually authoring

🚨 **A part list for a face is not a list of drawings. It is a list of
`(x, z)`.** And here is the sharp edge this section was written about:

> **`x` was in the file and `z` was not.** Neither spec had a depth field at all,
> and on the worked example as it first shipped
>
> ```bash
> grep -c '"z"' gallery/portrait/rig.json gallery/portrait/motion.json   # 0 and 0
> ```
>
> The bones carried `x` (`eye_l` at `−62`, `nose` at `0`), the rig carried the mesh
> columns' `x`, and every `z` that produced every number lived **only in the
> README beside them**.

⚠️ **Read that as the reason the constructs below exist, not as the state of the
tool.** The `z` above never had a home because a track carries a value and not a
model — so a depth was consumed, arithmetic was done by hand, and the input
vanished. Both halves have since been given one (next paragraph), and `"z"` is
still `0` in both files because the field is spelled `radius` on a mesh key and
`depth` on a bone track.

⇒ **The instruction survives anyway: write the depth table down somewhere a
reader will find it.** The specs now hold the depths the turn *uses*; a project's
own reasoning about them — why the fringe stands off 26 and not 15 — still belongs
beside the rig, and in the worked example that is a table in its README.

⭐ **Every depth is now in the file, and both halves of that arrived as their own
construct.** Since [#294](https://github.com/firejune/rigc/issues/294) a `yaw`
deform key states its `radius` (§1.1), which is the `R` of the cylinder that plate
is painted on — so the head's 170 and the fringe's 196 are in `motion.json`. Since
[#295](https://github.com/firejune/rigc/issues/295) a **bone** track's key can
state a `derive` model over a group, whose `depth` is one number **per member** —
so the feature depths, the hair depths and the sign flip below are in the file too
(§3, AUTHORING §4.5.1).

⚠️ **What has not changed is that a depth is a decision.** The table below is
still the thing to argue about before authoring anything; all that moved is where
it is written, and the point of moving it is that a reader of the numbers can now
see the table that produced them:

```bash
grep -c '"depth"' gallery/portrait/motion.json    # 8, one per derive key
```

**The depths in the worked example**, and what each one is doing (**derived**
column: `dx` at 12°):

| Part | `x` | `z` | `dx` | What the depth is |
| --- | --- | --- | --- | --- |
| face centre (skull surface) | 0 | **170** | −35.345 | `R`, the cylinder radius. Every other number is relative to this |
| fringe centre | 0 | **196** | −40.751 | 26 **in front** of the skull. The one number in the rig that exists only to make parallax |
| `nose` | 0 | **192** | −39.919 | protrudes 22. The only feature in front of the surface |
| `eye_l` / `eye_r` | ∓62 | 150 | −29.832 / −32.542 | 20 **below** the surface — a socket is a hollow |
| `brow_l` / `brow_r` | ∓62 | 158 | −31.495 / −34.205 | 12 below. A brow sits proud of its socket |
| `mouth` | 0 | 166 | −34.513 | 4 below. Almost on the surface |
| `hairmass` (back hair) | 0 | **−55** | **+11.435** | its centroid is 55 **behind** the axis |
| `lock_l` / `lock_r` | ∓150 | 100 | −17.513 / −24.069 | off-axis and shallow, so they travel about half as far as the centre |
| `ahoge` (cowlick) | −23 | 20 | −3.656 | almost on the axis, so it barely moves |

⭐ **The sign flip is the strongest single depth cue you can buy.** `hairmass` at
`z = −55` makes `−z·sin t` positive: as the face swings left, the back of the
head swings **right**. It is one track, one number, and it is what separates a
turn from a slide more than any mesh work does.

⚠️ **Get the depths right and the parallax is free; get one wrong and nothing
complains.** A depth is not measurable from the art — it is a decision about a
shape the drawing only implies. Two readings that help:

1. **Depth is what the drawing overlaps for.** A part drawn *over* another is
   usually in front of it, and the slot order already records that (AUTHORING R4).
   Depth is the same ordering with a magnitude attached, so **derive the sign from
   the draw order and argue only about the size.**
2. **The stand-off is the number to state out loud.** The fringe's 26 is not a
   measurement of anything; it is how much parallax the shot wanted. At 12° it
   buys `26·sin 12° = 5.406` units of extra travel — **derived**, and the record
   measured 5.406 on the artifact. If the fringe does not read as separate,
   this is the one number to move, and moving it moves nothing else.

---

## 3. One shared shift, then residuals

⛔ **Do not key each feature's whole `dx`.** Put a bone at the face plate's own
origin, key the part every feature shares onto that one bone, and let each
feature key only what is left:

```
faceshift.translatex = −R·sin t                    ← −35.345 at 12°, R = 170

residual(x, z) = dx(x, z) − (−R·sin t)
               = x·(cos t − 1) + (R − z)·sin t
                                 \_______/
                                  the part's depth BELOW
                                  the skull surface
```

⭐ **So a feature's own track is nothing but its depth below the surface, times
`sin t`.** That is the sentence this page exists to produce.

**The features of the worked example** (**derived**, and every value matches the
shipped `motion.json` to the last digit printed there):

| Bone | `x` | `z` | `dx` | residual | `scalex` |
| --- | --- | --- | --- | --- | --- |
| `eye_l` (far) | −62 | 150 | −29.832 | **5.513** | 0.8922 |
| `eye_r` (near) | 62 | 150 | −32.542 | **2.803** | 1.0641 |
| `brow_l` | −62 | 158 | −31.495 | 3.850 | 0.8966 |
| `brow_r` | 62 | 158 | −34.205 | 1.140 | 1.0597 |
| `nose` | 0 | 192 | −39.919 | **−4.574** | 0.9781 |
| `mouth` | 0 | 166 | −34.513 | 0.832 | 0.9781 |

🚨 **The reason to do it this way is that it makes a wrong number visible.** A
residual is **1–6 units**; a total is **30–40**. Nobody can eyeball an error in
the second, and everybody can eyeball one in the first — a residual with the
wrong sign, or one an order of magnitude off its neighbours, is obvious in a
column of six. ⇒ **The shared-shift split is an auditing decision before it is a
rigging one**, and given §9 that is the whole argument for it.

### 3.1 ⭐ And now the spec holds this split, not its results

Since [#295](https://github.com/firejune/rigc/issues/295) the pattern above is a
named construct rather than a page of advice: **one group track whose key states
the model, with a depth per member** (AUTHORING §4.5.1). The worked example's six
residuals and six scale factors are two tracks:

```json
{ "group": "features", "property": "translatex", "keys": [
    { "t": 0,    "v": [0], "ease": "rise" },
    { "t": 0.62, "derive": { "kind": "yaw", "degrees": 12, "carried": 170,
                             "depth": { "eye_l": 150, "eye_r": 150, "brow_l": 158,
                                        "brow_r": 158, "nose": 192, "mouth": 166 } },
      "ease": "swell" },
    { "t": 2.2,  "v": [0] } ] }
```

`carried` **is** the shared shift, stated: it is the depth whose `−R·sin t` the
`faceshift` bone already applies, so what each member keys is exactly the residual
this section derives. Drop it — write `carried: 0` or leave it out — and the same
kind emits the **full** `dx` instead, which is what the parts hanging off `head`
rather than off `faceshift` need. ⇒ **The split the toolchain used to know nothing
about is now the one parameter, and the seam falls where the parent chain already
put it** (AUTHORING §4.5.1 refuses a model over members under different parents,
for exactly that reason).

⭐ **`explain` then prints the column of six, which is what the argument above
asked for.** The `MEMBER` block (AUTHORING §4.5.2) is a row per member — the
emitted value, the `x` it read off the rig, and the depth the spec stated — so the
nose diagnostic below is now a line you read rather than arithmetic you redo:

```
  MEMBER  turn  group "features".translatex  t=0.620000  6 member(s)  derive yaw  degrees=12 carried=170  -> the displacement
            eye_l       5.513083  <- -62 at depth 150
            eye_r       2.803385  <-  62 at depth 150
            brow_l      3.849789  <- -62 at depth 158
            brow_r      1.140092  <-  62 at depth 158
            nose       -4.574057  <-  0 at depth 192
            mouth       0.831647  <-  0 at depth 166
```

⭐ **The nose is the diagnostic.** It is the only **negative** residual on the
face, because it is the only feature in front of the surface: it protrudes 22, and
`22·sin 12° = 4.57` is exactly how much further left it goes than the cheek it
sits on (**derived**: −4.574). ⇒ **If the nose's residual is not negative, the
depths are wrong.** It is the cheapest check on this page and it is arithmetic,
not a render.

📌 **`faceshift` has to be its own bone, and not the head bone.** The head bone
is the head mesh's own slot bone, and the mesh deform already carries that
plate's motion; a translate there would move the plate **twice**. Make
`faceshift` a child of `head` that carries only the features — the worked
example's chain is `headroll → head → faceshift → {eyes, brows, nose, mouth}`,
which `rigc explain` prints as a parent column (§9.2).

⭐ **The same reasoning puts the head's pivot one link above the mesh.** A head
rotates about the top of the neck, not about the middle of its own face, so the
roll belongs on a `headroll` bone above `head`. There is a rule that enforces it
under `--profile spine-html`: `A15_IDLE_NO_MESH_BONE_KEYS` refuses an `idle` that
keys a bone driving a mesh — its own slot bone or its control bone — because that
renderer must never idle-skip a mesh. Keying the pivot one link up satisfies it,
and **the rig that satisfies the assertion is the better rig anyway.**

---

## 4. The mesh — where the columns go is the whole decision

Two meshes and **40 vertices** carried a head turn in the worked example, which
cuts against the expectation that a face mesh needs hundreds. The reason is
structural: **a yaw moves nothing vertically**, so the rows are along for the
ride and only the column count buys anything.

```
head       340 × 380 plate, R = 170        hair_bang   372 × 168 plate, R = 196
  5 columns × 5 rows = 25 vertices           5 columns × 3 rows = 15 vertices
  32 triangles                                16 triangles
  columns  x = −162, −120, 0, 120, 162      columns  x = −170, −120, 0, 120, 170
  rows     y = 180, 90, 0, −90, −180        rows     y = 80, 0, −80
  z = √(R² − x²)                            z = √(R² − x²)
```

Each column's offset is `dx` at its own `(x, z)`, and **every row gets the same
value**, so the run the compiler writes is one row of five repeated down the grid
with a `0` for every `y`:

```
-7.175, 0, -22.414, 0, -35.345, 0, -27.658, 0, -14.255, 0,   <- ×5 rows
```

⭐ **The spec states the model and the compiler writes that** (§1.1): the key is
`{ "kind": "yaw", "radius": 170, "degrees": 12 }`, and the 50 numbers above are
what `explain` prints and what lands in the artifact. The offsets are still worth
reading, because the *shape* of that row is §4.1's whole argument.

⚠️ **`R` is the radius of the cylinder a part is painted on, and it is not always
the plate's half-width.** For the head plate the two coincide (`340/2 = 170`). For
the fringe they do **not**: its plate is 372 wide (half-width 186) but its `R` is
**196**, because 196 is where the fringe *sits* — 26 in front of the skull. ⇒
Read `R` off the depth table, never off the PNG.

### 4.1 Uneven columns, and it costs nothing

🚨 **The columns are not evenly spaced, and that is the trick.** `−162, −120, 0,
120, 162` puts them **dense near the silhouette and sparse in the middle**, which
is the sampling a cosine needs: the centre of the face travels `R·sin t` and the
edges barely travel at all, so all the *variation* is at the edges. Five evenly
spaced columns spend their resolution where nothing happens.

What the grid then does to the drawing is a **non-uniform horizontal
redistribution** (**derived** at 12°, widest row):

| Band, from the far edge | Rest width | At 12° | Ratio |
| --- | --- | --- | --- |
| −162 → −120 | 42.0 | 26.76 | **0.637** |
| −120 → 0 | 120.0 | 107.07 | 0.892 |
| 0 → 120 | 120.0 | 127.69 | 1.064 |
| 120 → 162 | 42.0 | 55.40 | **1.319** |

The far side compresses to 64%, the near side stretches to 132%, and the ink
inside each band compresses and stretches with it. **That gradient is what makes
it read as a turn instead of a slide.** The whole-head narrowing, by contrast, is
the cheap part: ink edge to ink edge, `309 · cos 12° = 302.2` (**derived**; the
record measured 309.0 → 302.2 on the artifact).

⭐ **It is one decision, made once, in the setup geometry, and every deform key
after it is better for free.** There is no cost side to this trade.

### 4.2 The silhouette is a tangent, not a mark — and refining makes it worse

This is the most misleading thing about a face plate, and the counter-intuitive
result of the whole experiment.

A column at `x` sits at depth `z = √(R² − x²)`. Project two adjacent columns and
ask when they **swap order** — when the mesh turns inside out:

```
x₁·cos t − z₁·sin t  =  x₂·cos t − z₂·sin t

                      Δx      x₁ − x₂
  ⇒    tan θ_fold  =  ──  =  ─────────        over ADJACENT columns
                      Δz      z₁ − z₂
```

and a grid folds at the **minimum** of that over its pairs. As the gap closes,
`Δx/Δz → z/|x|`, so the limit for a column is `atan(z / |x|)` — a property of the
**continuous surface**, not of the mesh.

**Re-derived from that formula** (and each agrees with a bisection search on the
shipped column table to 0.01°):

| Columns | Folds at | The pair that folds |
| --- | --- | --- |
| 5 — `±162, ±120, 0` (shipped) | **31.37°** | `−162, −120` |
| 7 — `±145` added | **24.56°** | `−162, −145` |
| 7 — `±155` added | **20.95°** | `−162, −155` |
| 9 — `±155, ±145` added | **20.95°** | `−162, −155` |
| 13 — uniform, every 27 units | 27.54° | `−162, −135` |
| continuous limit at `x = −162` | **17.65°** | — |

🚨 **A denser face mesh is not a safer face mesh.** Refining near the silhouette
drives `Δx/Δz` toward the tangent limit *from above*, so every column you add out
there **lowers** the angle at which the mesh inverts. A coarse grid survives past
17.65° only because it does not *sample* there — it crushes instead of folding.

⚠️ **And the fold angle is set by the outermost gap, not by the column count.**
The 5-, 7- and 9-column rows above make that concrete: the 9-column grid folds at
**exactly** the same 20.95° as the 7-column one, because both contain the pair
`(−162, −155)` and the `±145` column changes nothing. ⇒ Counting vertices tells
you nothing about this failure; **look at the outermost two columns.**

⭐ **The rule, and it is an identity rather than a rule of thumb.** Put the
outermost column at

```
|x|outer = R · cos θmax        ⇒  its tangent limit is EXACTLY θmax
```

because `z = R·sin θ` there and `atan(z/|x|) = θ`. So you do not tune this: you
**pick the ceiling first and the column position falls out.** For `R = 170`
(**derived**):

| θmax you want | Outermost column at |
| --- | --- |
| 12° | 166.3 |
| 16° | 163.4 |
| 20° | 159.7 |
| 26° | 152.8 |

The shipped grid's 162 gives 17.65°, comfortably above the 12° it ships and just
above the 16° §8 calls the instrument's ceiling. ⇒ **Then let the last band be a
single wide one** — that is the direction that buys safety, and it is the
opposite of refining.

### 4.3 `hull` is `0`, and the vertex order is why

⚠️ **A grid's perimeter is 16 of its 25 vertices and they are not a prefix of any
row-major order.** Declaring a hull would mean re-ordering the vertex list
perimeter-first — and then **a reader could not count the emitted deform run
against the grid**, which is what makes `explain`'s printed offsets (§1.1)
checkable against the columns at all. `0` is the honest declaration. AUTHORING §3.4 has what a hull
buys and the worked example's FINDINGS.md prices what omitting it costs in an
editor round trip.

⚠️ **A large `MESH` overshoot on a face is not a defect.** A rectangular grid
over an oval face has transparent corners, and the line says so:

```
MESH  head  authored 25 vertices / 32 triangles  (budget 32)  bones=[head]
            attachments=[head]  covers 100.00% of the art, reaching 95.90px past it
```

**`covers 100.00%` is what matters** — nothing of the drawing is outside the
triangles. The 95.90px is the corner. A mesh that hugged the silhouette instead
would have to be a `contour`, which cannot be a grid and has **no interior
vertices to redistribute** — so it cannot carry a turn at all.

---

## 5. What foreshortens, and what does not

A feature is a rigid drawing sitting on a curved surface, so it also has to
**narrow** as its patch of surface turns away. That is a bone `scalex`:

```
scaleX = cos(α − t) / cos α          where α = atan2(x, z)
```

The far eye narrows to 89%, the near eye widens to 106% (**derived**: 0.8922 and
1.0641). Parts on the axis get `cos t = 0.9781` and could therefore share one
track — the nose and mouth did, through a `groups` entry, and it was the only
place in the worked example's turn where two parts could (§7).

📌 **That entry is gone, and the reason is worth a line.** `scalex` is the
foreshortening projection of the same `derive` kind §3.1 uses (AUTHORING §4.5.1),
so all six features are one track and the on-axis pair's shared value **falls out
of the arithmetic** — `α = atan2(0, z)` is 0, so `cos(α − t)/cos α` is `cos t`.
A coincidence between two members has stopped being something an author has to
notice and spend a group on.

### 🚨 The iris does not foreshorten, and this is the finding

`iris` and `spark` are children of `eye`, so they inherit the socket's `scalex` —
and **a circular iris under `scalex 0.89` is an ellipse.** That reads as *a
drawing squashed sideways*, not as a head turned, and it is the first thing to
break as the angle grows.

It is also wrong on the physics. If the character keeps looking at the camera
through the turn, her eyeball counter-rotates by the same angle the head yawed,
so the iris stays square-on and stays **circular**. ⇒ **The socket foreshortens;
the pupil does not.**

The fix is one reciprocal per side, on two groups (**derived**):

```
look_l: [iris_l, spark_l]     scalex = 1 / 0.8922 = 1.1208
look_r: [iris_r, spark_r]     scalex = 1 / 1.0641 = 0.9398
```

⭐ **These two stay a shared value on a group, and they are the case where the
per-member construct is the wrong tool** — stated here because "we have a model
now" is exactly the reasoning that would spoil them. A counter-scale belongs to
the **socket**, not to the part: `spark_l` sits at local `x = −11` and takes the
same `1.1208` as `iris_l` at `0`, because what is being cancelled is the socket's
foreshortening and not the highlight's own. ⇒ **The value is precisely NOT a
function of the member's position**, so a `groups` entry with one number is the
true statement and a `derive` over `iris_l`/`spark_l` would be a fiction that
happened to use the new field.

⭐ **Their positions still ride the socket, and that is the part that makes it
correct rather than a hack.** A bone's scale moves its children's local
translation, so the highlight at local `(−11, +11)` under the far socket's 0.8922
lands at `−9.81` — it slides 1.19 units inward, toward the surface it reflects
off (**derived**). Only the *shape* is held.

📊 **Measured effect on the cliff, by the worked example's own sweep — a
looked-at judgement over seven renders, not a computed figure:** without the
counter-scale the turn stops reading at about **18°**; with it, about **26°**.
Eight degrees of usable range for two tracks, and the record reports nothing else
in the experiment came close to that ratio.

⚠️ **A `clipping` attachment would lift the iris's travel ceiling and you cannot
have one.** Spine has them (AUTHORING §3.4) but `A11_NO_CLIPPING_ATTACHMENTS`
refuses one under `--profile spine-html`, so a rig carrying one builds on only one
of the two profiles. The ceiling is then geometric: in the worked example the
iris's ink ring has radius 28.5 against a socket opening 36 half-wide, so
`36 − 28.5 = 7.5` units is as far as it can travel before it crosses its own lash.
⇒ **Compute that ceiling from the art before keying a gaze**; the first draft of
the worked example keyed 9 and had to come back to 7.

---

## 6. A blink is a continuous channel, not a swap

**Two ways to blink, and both are right somewhere:**

| | An `attachment` swap | A translating lid plate |
| --- | --- | --- |
| what it is | two drawings, `eyes` and `eyes_shut`, stepped | one plate, one `translatey`, 65 units down its own bone |
| costs | 1 extra PNG | 2 PNGs, 2 bones, 2 slots |
| where it is right | a mascot, a stylised blink, anything whose shut eye is a **different drawing** rather than a covered one | a portrait |

⭐ **Choose the swap for a mascot and the channel for a face**, and the reasons
are all timing:

- **A swap has no shape.** A real blink is fast shut and slow open. The worked
  example is `0.07 s` down and `0.16 s` open — a **1 : 2.3** asymmetry, easing
  into the close and out of the open. A stepped timeline has one frame of
  transition and no curve to put an asymmetry in.
- **A swap has no partial.** A half-blink, a sleepy lid, a lid that rides the
  gaze — every one of them is a *fraction of the same channel*, and none of them
  is a third drawing.
- **A swap has to dodge the frame grid.** A stepped key exactly on a sample time
  can be missed by a player accumulating `1/fps`, which is why
  [`gallery/squash`](https://github.com/firejune/rigc/tree/main/gallery/squash)'s
  blink key sits at `0.399999` (AUTHORING §4.5). **A continuous channel does not
  care where the samples land.**

⚠️ **Two constraints on the lid's own drawing, and both are art decisions the rig
cannot express.**

1. **Fade its top edge out, and size the fade in pixels.** A flat plate of skin
   translating down a forehead has a visible edge; fading its top 30 pixels
   removes it. ⛔ **Do not write that fade proportionally.** In the worked example
   it was first authored as `offset 0.34` in `objectBoundingBox` units — 34% of
   *whatever height the plate happened to be* — and when the plate grew from 88 to
   112 to cover the eye, the faded band grew with it and stopped covering the top
   of the shut eye. In `userSpaceOnUse` with `y2="30"` the height becomes a free
   variable and the coverage becomes a stated one: `106 − 30 = 76` opaque pixels
   above the lash, against a 70-unit eye.
2. ~~**Run its sides flush to the window edge.**~~ ✅ **No longer needed.** This
   was a workaround for [#292](https://github.com/firejune/rigc/issues/292):
   `rigc render`'s bilinear filter sampled straight alpha, so **every
   atlas-region edge drew a one-pixel dark rim** over what was behind it, and
   running the art flush to its window gave the sampler nothing dark to reach
   into. The sampler now interpolates premultiplied and a transparent texel gets
   no vote in the colour, so **a lid plate may have whatever margin its drawing
   wants.** §9.1 keeps the record of how the rim was found, because the lesson
   there — that scene work exercises a renderer where game-part work does not —
   outlives this particular defect.

📌 **Blink both lids on one `groups` track.** An L/R offset of one frame was
tried in the worked example and rejected: at 25 fps it does not read as a soft
blink, it reads as a **wink**. ⇒ MOTION §3.7's offset table is about a chain
hanging off a driver, and two lids are not that — they are one event.

---

## 7. Channel allocation, before the first key

🚨 **Scene direction wants to layer — an idle that keeps running under a
triggered gaze, under a turn — and two animations keying the same bone property
are BLENDED, not summed.** So the animations have to divide the rig up front. The
worked example's table, which is the shape of thing to write before authoring
anything:

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

Three collisions survive there: `headroll` rotate in all three, `brows`
translatey in two, and the locks' rotate in two. ⚠️ **On plain Spine the fixes
are ordinary — `MixBlend.add` on the layered track, or splitting a bone into a
stack (`headroll_idle` under `headroll_scene`) — but both are runtime or rig
decisions the motion spec cannot express, so nothing warns an author that two of
their animations will fight.**

⛔ **And the cost is real, so name it rather than discovering it by shipping.** In
the worked example `idle` keys **nothing** on the iris, on purpose, even though a
completely still eye reads as a mannequin. The iris is `gaze`'s channel; an
`idle` drift plus a `gaze` on a second track would be two animations holding two
opinions about where she is looking. **That is a loss, it was chosen, and it is
written down.**

⇒ **The gaze itself is then pure MOTION §3.7** — a chain of offsets, and the only
face-specific part is which bone leads. The worked example's ordering
(**measured** off its own key times):

| Track | Extreme at | What it is |
| --- | --- | --- |
| `irises` translate | **0.22 s** | the eyes lead. `(7, −3)` |
| `sparks` translate | 0.22 s | `(2.8, −1.2)` — **40% of the iris distance**, arriving at the *same time*. A specular highlight is fixed to the light, not to the eyeball, so it lags in **distance** and not in time |
| `brows` translatey | 0.34 s | +1.8, which turns a flick of the eyes into interest |
| `headroll` translatex + rotate | **0.40 s** | the head follows **+12% of the duration after the eyes**. A rigid 3.4-unit slide and a −1.2° roll |
| `lock_l` / `lock_r` / `ahoge` rotate | 0.72 / 0.76 / 0.82 s | **+21% / +24% / +28% after the head**, each with one overshoot crossing of opposite sign |

🩹 **The head's follow there is a rigid slide plus a roll, not a small yaw, and
that is the transcription cost showing through.** A head following a gaze really
does yaw a few degrees; three degrees of yaw would be a third pair of `deform`
keys — 80 more hand-written numbers — for a motion a viewer reads as *"her head
moved a little"*. It is the right call at a draft budget and the wrong one at a
scene-direction budget. Same trade in the turn's anticipation: MOTION §3.6 asks
for a counter-move, and the worked example's is a **−0.9° counter-roll on the
neck bone rather than a counter-yaw**, because a yaw anticipation is another
50-float head key plus 30 on the fringe for a tenth of a second.

⭐ **A roll channel is worth having for a second reason: it is where a turn's arc
comes from.** A yaw shift is a straight horizontal line and `translatex` draws
exactly that (MOTION §3.5). A 1.6° roll on a bone at the top of the neck bends
every feature's path into an arc, because a rotation carries its descendants on a
circle for free.

---

## 8. The three cliffs, and picking a construction from the turn you need

Three separate failures at three different angles. ⇒ **Read this before the art
is drawn**, because two of the three are answered by *parts*, and parts are the
expensive thing to change.

**The sweep** — the worked example's `turn` re-derived at seven angles, built,
rendered and looked at. The geometry columns are **derived**; the last column is
the record's looked-at judgement:

| yaw | centre shift | far band 42 → | ratio | 9-unit ink → | reads as a turn? |
| --- | --- | --- | --- | --- | --- |
| 8° | 23.7 | 32.0 | 0.762 | 6.9 | yes, gently |
| **12° (shipped)** | **35.3** | **26.8** | **0.637** | **5.7** | **yes** |
| 16° | 46.9 | 21.4 | 0.509 | 4.6 | yes |
| 20° | 58.1 | 15.9 | 0.379 | 3.4 | marginal |
| 24° | 69.1 | 10.4 | 0.247 | 2.2 | no — the eyes have stopped being eyes |
| 28° | 79.8 | 4.7 | 0.113 | 1.0 | no — the far outline is gone |
| 32° | 90.1 | −0.9 | −0.021 | — | **the mesh has folded** |

**Failure 1 — the iris goes elliptical, at ~18°, and it is fixable.** §5. Two
reciprocal `scalex` tracks buy 8° of range. Do this one always; it is the best
ratio in the experiment.

**Failure 2 — a `scalex` cannot rotate an almond, at ~26°, and it is not
fixable.** The eye *socket* goes next. A real eye at 26° does not narrow
uniformly: its far corner disappears behind the nose bridge, its lash line
rotates, its lid wraps. `scalex` does exactly one of those things, so the far eye
becomes *a thin version of a front-facing eye* and the near eye's lash stretches
into a wide flat slab (**derived** socket scales: 0.892/1.064 at 12°, 0.745/1.082
at 24°, 0.629/1.067 at 32° — note the near side barely moves past 20°, which is
why the stretch stops looking like foreshortening). ⇒ **Past roughly 26° the eyes
need their own deform meshes** — socket, lash and lid as a 3–4 column grid each —
and that is where the vertex count stops being 40. The fringe tips (a rigid plate
that should be splaying) and the neck go in the same band for the same reason.

**Failure 3 — the mesh folds, and refining it makes this worse.** §4.2, and it is
the one to design around rather than discover.

🩹 **The neck is the honest fudge, and label yours the same way.** A neck twists:
its top follows the head almost entirely and its base hardly at all. A single
rigid plate can only take an average — the worked example takes **28%** of the
head's shift (`−10` against `−35.345`), which is **the one number in its turn that
is not derived**, chosen as the value at which the chin stopped hanging off the
throat at 12°. A turn that had to read at 20° would need the neck to be its own
mesh with its own column table.

### The verdict on angle

⭐ **A 5-column grid with bone-scaled features is a 0–16° instrument, comfortable
at 12°.** For a standing portrait that is enough: an idle turn, a glance away, a
lean into frame. **A 30–45° three-quarter turn is a different rig** — per-eye
meshes, a meshed neck, probably a second art layer for the far cheek — and it is
not a format problem, it is a parts-and-labour problem.

📊 **What one held yaw actually costs**, from the shipped `motion.json`
(**derived** by counting it):

| Animation | Duration | Tracks | Track keys | Deform entries | Deform keys | Hand-written deform floats |
| --- | --- | --- | --- | --- | --- | --- |
| `idle` | 3.2 s | 9 | 37 | 0 | 0 | 0 |
| `gaze` | 1.5 s | 8 | 32 | 0 | 0 | 0 |
| **`turn`** | 2.2 s | **8** | **33** | 2 | 8 | **0** |

⇒ **`idle` and `gaze` cost what an ordinary MOTION.md shot costs, and the turn's
transcription is gone — both halves of it.** That last cell was **160** until
[#294](https://github.com/firejune/rigc/issues/294) shipped, and what those 160
floats were is worth keeping: **five distinct values** (one per column, repeated
down five rows), with **25 of the 50 slots in a head key structurally `0`**
because a yaw has no vertical component. They are now four `transform` keys
(§1.1) and the compiler writes the run.

⇒ The **tracks** column was **20** until
[#295](https://github.com/firejune/rigc/issues/295) shipped, with 19 of the 20
carrying one value each. It is 8, because the sixteen sibling tracks became two
group tracks whose keys state a model (§3, AUTHORING §4.5.1) and the four hair
tracks became one.

🚨 **And here is the number that matters more than either count: the hand-written
figures barely moved. What they ARE changed completely.** The 20-track turn stated
**32 residuals and scale factors** across its held keys; the 8-track one states
**34 depths** — of which **11 are distinct**, the rest being the same table
repeated on the second held key and on the `scalex` track. ⇒ The saving is not
arithmetic, it is **auditability**: a residual of `1.14` is a number a reader can
only take on trust, and `brow_r at depth 158` is a claim they can argue with. §3
is why that is the whole point, and §2 is why the depths had nowhere else to live.

⚠️ **A plain `groups` entry still buys almost nothing on a face, and that is
structural rather than an oversight.** Keying several bones **identically** is
right for a wheel pair, and **every part needing a different number is what
parallax means.** Of the 20 turn tracks exactly one was a group for that reason
(`axis`, the nose and mouth, both on the axis and therefore both `cos t`), plus
the two reciprocal groups §5 needs. ⭐ **That coincidence has stopped being an
authoring concept**: the on-axis pair's shared `cos t` now falls out of the same
closed form as everybody else's value, so `axis` is gone from the spec while
`look_l`/`look_r` stay — because those two really are one shared number (§5).

---

## 9. Looking at it, and the audit gap

### 9.1 The looking protocol is three scales, not one

| Scale | What it is for |
| --- | --- |
| **the contact sheet** (~0.45×) | whether the **motion** reads. Spacing is a comparison *across* frames, so the grid is the only place to see it |
| **1:1** | whether the **drawing arrived** |
| **3–4× on the eyes** | because that is where a reader will look, and a face has no other equivalent |

📊 **Four of the five art defects in the worked example were invisible at contact
sheet scale** and all four were found at 1:1 or better: the dark seam
([#292](https://github.com/firejune/rigc/issues/292)), the lid's fade letting a
shut eye's lash show through as a grey smudge, the iris crossing its own lash at
the gaze extreme, and a forehead highlight turning the lid's soft edge into a
tonal step.

⚠️ **A portrait is the first rig whose plates are *supposed* to overlap
invisibly**, which is why #292 stayed latent through four gallery examples: every
part in them carries an ink outline at its edge, and a dark rim on a dark line
cannot be seen. ⇒ **Scene work exercises a renderer where game-part work does
not.** Expect to find renderer defects on your first face, and check a suspicious
edge against a **region build** before reading a single vertex — which is the
next item.

⭐ **When a mesh is the new thing in a shot, build the region version and diff it
before suspecting the mesh.** The worked example's first seam suspect was the
grid: faint vertical lines down the forehead, at what looked like column
positions. Building the same rig with both meshes replaced by plain regions and
diffing the rest frame settled it in one command — worst channel difference 1,
zero pixels differing — so the mesh was innocent and the lines were art
compositing. **Two minutes, and it halves the search space.**

📌 **Draw the face before you rig it.** The worked example took **seven art
passes before a `rig.json` existed** — brows twice, hair silhouette, fringe
depth, neck length, garment mass, choker, proportions. That order is not
fastidiousness: **the head plate's half-width *is* `R`, and `R` is in every one of
the thirty derived numbers.** Rigging first means re-deriving all of them every
time the plate changes width.

⚠️ **And expression lives in ink weight before it lives in shape.** The worked
example's brows read as a scowl for two iterations and the brows were not the
problem — two eyes whose upper lash is heaviest at the **inner** corner read as
angry whatever the brow above them does. Worth knowing before spending a pass on
the wrong part.

### 9.2 🚨 What nothing measures — three builds, all green

**The setup geometry is measured; the deformed geometry was not, and one half of
it still is not.** Here is that
claim as three builds of the same rig, each command runnable verbatim from a
clean checkout. Start from the good one:

```bash
bun install                                     # once

bun cli.ts build --rig gallery/portrait/rig.json \
                 --motion gallery/portrait/motion.json \
                 --out gallery/portrait/build --profile spine-html
bun cli.ts render --candidate gallery/portrait/build --fps 25 --max 640 \
                 --out gallery/portrait/render
```

```
  MESH  head  authored 25 vertices / 32 triangles  (budget 32)  bones=[head]
              attachments=[head]  covers 100.00% of the art, reaching 95.90px past it
  …  26 PASS, 13 SKIP
```

Now break the projection two ways. Both scripts write a variant motion spec
beside the originals and touch nothing in the repository:

```bash
# (a) INVERT ONE BAND: give the two far columns each other's shift.
#     The far side now STRETCHES 1.363 where it should compress to 0.637 —
#     the head reads as turning the other way at its own edge. This one has to
#     REPLACE the transform with a table: an inverted band is not the closed
#     form at any angle, and §1.1 refuses a `transform` beside a `vertices` run.
bun -e '
const m = await Bun.file("gallery/portrait/motion.json").json();
const d = m.animations.turn.deform.find(x => x.slot === "head");
const row = [-22.414, 0, -7.175, 0, -35.345, 0, -27.658, 0, -14.255, 0];
for (const k of d.keys) if (k.transform) {
  delete k.transform;
  k.fromVertex = 0;
  k.vertices = [...row, ...row, ...row, ...row, ...row];
}
await Bun.write("/tmp/swapped.motion.json", JSON.stringify(m, null, 2));
'
bun cli.ts build --rig gallery/portrait/rig.json --motion /tmp/swapped.motion.json \
                 --out /tmp/swapped --profile spine-html

# (b) FOLD IT: evaluate the same closed form at 40°, past the 31.37° of §4.2,
#     so the two far columns swap order and the mesh turns inside out. Since
#     §1.1 the whole of it is one number.
bun -e '
const m = await Bun.file("gallery/portrait/motion.json").json();
const d = m.animations.turn.deform.find(x => x.slot === "head");
for (const k of d.keys) if (k.transform) k.transform.degrees = 40;
await Bun.write("/tmp/folded.motion.json", JSON.stringify(m, null, 2));
'
bun cli.ts build --rig gallery/portrait/rig.json --motion /tmp/folded.motion.json \
                 --out /tmp/folded --profile spine-html
```

⚠️ **Both scripts were rewritten on 2026-09-03 and the old ones did nothing.**
They keyed off `if (k.vertices)`, which was true of every key until §1.1 put the
model on it — after that re-authoring the guard matched nothing, both scripts
wrote an unchanged motion spec, and builds (a) and (b) were the good build. That
is a doc command silently passing rather than silently failing, which is the
worse of the two: build (b) reported `A39 PASS` and the table below said `FAIL`.
Both are re-run above.

**What comes back from both:**

| | good | (a) one band inverted | (b) mesh folded |
| --- | --- | --- | --- |
| `--profile spine-html`, **before `A39`** | 26 PASS / 13 SKIP | **26 PASS / 13 SKIP** | **26 PASS / 13 SKIP** |
| `A35_DEFORM_KEYS_FIT_THE_ATTACHMENT` | PASS | **PASS** | **PASS** |
| the `MESH` coverage line | 100.00%, 95.90px past | **byte-identical** | **byte-identical** |
| 🆕 `A39_DEFORM_KEEPS_TRIANGLE_WINDING` | PASS | PASS | **FAIL, both keys, 8 of 32 triangles** |
| `--profile spine-html`, **today** | 27 PASS / 13 SKIP | 27 PASS / 13 SKIP | **26 PASS / 13 SKIP / 2 FAIL** |
| 🆕 the `DEFORM` block, `head` key 1 `area` | x0.637174 … x1.319122 | **x0.765250 … x1.362834** | **x−0.288121 … x1.820211** |
| 🆕 … and its `winding` | 32 of 32 kept | 32 of 32 kept | **24 of 32 kept** |

🚨 **All three were green, and the coverage line is the same string in all three,
because it reports the SETUP pose.** The `--profile spine-html` row is what
`A39` changed and the two rows above it are unchanged: both still measure only
the setup geometry, and `A35` is still silent about build (b). `A35` checks that a deform run *fits* its
attachment — an honest and useful check, and orthogonal to whether the numbers in
it mean anything.

⭐ **The two `DEFORM` rows are the ones that separate (a) from the good build**,
and nothing else in the toolchain does that without a reference render. `A39` is
right to pass (a) — no triangle reverses — and the block prints **x1.362834**
where the model's own table says x1.319121, and **x0.765250** where it says
x0.637174. That is this section's own prose, *"stretches 1.363 where it should
compress to 0.637"*, as a figure the tool produces.

`rigc explain` is the instrument that prints every other timeline's actual values,
and on a deform it used to print the shape of the run rather than the run:

```
    default/head/head.deform  4 key(s)
      t=0       back to the setup pose                         bezier[4]
      t=0.62    deform[0..50]  25 pair(s)                      bezier[4]
      t=1.5     deform[0..50]  25 pair(s)                      bezier[4]
      t=2.2     back to the setup pose                         linear
```

⇒ **`25 pair(s)` was the whole of what `explain` would tell you about a face
turn**, against a scalar track two lines up in the same report printing
`value=-35.345`. That asymmetry is
[#296](https://github.com/firejune/rigc/issues/296), and both of its halves have
now closed: §1.1's construct put the model and every offset it produced into the
same report (AUTHORING §4.11.1), and the `DEFORM` block put the geometry there
(AUTHORING §4.11.2) —

```bash
bun cli.ts explain --rig gallery/portrait/rig.json \
                   --motion gallery/portrait/motion.json --out /tmp/explain
```

```
  DEFORM  turn  default/head/head  key 1  t=0.620000  transform yaw  radius=170 degrees=12
          moved      25 of 25 vertices, worst 35.3450px at v2
          area       min x0.637174 tri 17   max x1.319122 tri 31   (32 triangles, 0 with no area at the cleared pose, band 0.146694px²)
          stretch    max x1.319121 tri 22   min x0.637175 tri 8
          winding    32 of 32 kept, 0 collapsed
```

⇒ **`0.637` is now a figure the tool prints.** It is a *report* and not a bar —
`explain` takes no `--profile` and gates nothing, for #277's reason: a deliberate
3× stretch is a real thing to author, and the one deformed-geometry fault with no
legitimate counter-example is the fold, which is `A39`'s.

🆕 **`A39_DEFORM_KEEPS_TRIANGLE_WINDING` now closes the half of that gap the
fold lives in** — `--profile spine-html`, 2026-09-03. Build (b) above is refused
by name, on both its keys, with the triangles listed:

```
FAIL  A39_DEFORM_KEEPS_TRIANGLE_WINDING: animation "turn" deform head/head key 1
      (t=0.6200000047683716s): 8 of 32 triangle(s) reverse winding — triangle 0
      [0,5,6] 1890.000 -> -544.548px²; …
```

and builds (a) and the good one both still PASS it, because **an inverted band is
not a fold**: its winding survives. The angle A39 first fires at agrees with
§4.2's `tan θ = Δx/Δz` to **0.0001°**, so the formula above is now checkable by
running the gate instead of by rendering seven variants.

⚠️ **One thing it deliberately does not do.** It is an **archetype** rule, so a
`--profile spine` build reads `PROF` — the premise "a fold has no legitimate
counter-example" turned out to be false when it was measured, an official
`spineboy-pro` export reverses one of `hoverboard-board`'s 101 triangles, and a
`validity` rule would have told its author to change correct data. ⇒ `explain`'s
`DEFORM` block is the surface with **no profile at all**, so the winding count is
readable on a `--profile spine` build the gate will not mention it to.

`check` against a trusted render, below, stays the deeper instrument for the
reasons §9.3 gives, and these two are the cheap always-on layer above it.

### 9.3 The audit that works today, and exactly what it cannot do

`rigc check` renders a candidate onto reference frames' own pixel grid and
compares (INGEST §1.4). Point it at a render of a build you already trust and it
**does** see a wrong deform:

```bash
bun cli.ts check --candidate gallery/portrait/build --frames gallery/portrait/render/turn@25fps
bun cli.ts check --candidate /tmp/swapped           --frames gallery/portrait/render/turn@25fps
bun cli.ts check --candidate /tmp/folded            --frames gallery/portrait/render/turn@25fps
```

| Candidate | MAE mean | worst | at |
| --- | --- | --- | --- |
| the build the frames came from | **0.00** | 0.00 | — |
| (a) one band inverted | **0.20** | 0.38 | **f0016** |
| (b) mesh folded | **2.07** | 3.67 | **f0016** |

⭐ **Both defects land on `f0016`, which is the frame the turn arrives on** — the
`worst at` column points straight at the moment, which is what makes this worth
running at all.

🚨 **And now the three limits, because this is the instrument you will be tempted
to call an audit:**

1. **It is differential.** It measures a candidate against **a render of another
   build**, so it catches a *regression* and cannot validate a *first authoring*.
   There is no reference for a face nobody has drawn yet.
2. **A wrong projection is a whisper in the aggregate.** Inverting a whole band —
   the far edge stretching to **1.363** where it should compress to **0.637**, so
   the head's own edge turns the wrong way — moves the mean MAE by **0.20 of
   255**. Nothing about that number says *"the winding"*; you have to already
   suspect it.
3. **The `slot drift` column cannot see it at all.** It was `1.2 px "lid_r"` in
   **all three** runs above, unchanged, because drift is attributed per **slot**
   and a folded head mesh is entirely inside one slot.

📌 **`explain`'s `DEFORM` block (§9.2, AUTHORING §4.11.2) takes half of limits 1
and 2 away, and none of limit 3.** It is reference-free, so it says something
about a first authoring; and it is *per key*, so the band inversion above reads
as `x1.362834` beside a model stating x1.319121 rather than as 0.20 of 255 in an
aggregate. What it still cannot say is whether **12° was the angle the shot
wanted** — that needs the picture, which is why the procedure below survives the
block as it survived `A39`.

📌 **`explain`'s `MEMBER` block (§3.1, AUTHORING §4.5.2) does the same for the
bone half, and it takes the **nose test** off the procedure below.** §3 makes the
nose the diagnostic — *if the nose's residual is not negative, the depths are
wrong* — and that used to be arithmetic a reader had to redo from a README's
depth table. The block prints the six residuals in a column with the depth that
produced each one, so the check is reading one sign. ⚠️ It still cannot say
whether the **depth** was right: `nose at depth 192` evaluates as consistently
wrong as it does right, and no reference frame separates a plausible depth table
from the intended one.

⇒ **So the honest procedure — thinner now that `A39` and the two report blocks
exist, and still a procedure, because none of the three limits above is one they
lift:** state the model on the key rather than deriving a table (§1.1 for the
mesh, §3.1 for the bones), so what a reviewer reads is a radius, an angle and a
depth per part; read the **nose's sign** off the `MEMBER` block and check the
**fold angle** (§4.2's formula) arithmetically before you build — the second is
still yours, and a stated model evaluates a wrong radius as consistently as a
right one — then render, **look at three scales**, and keep a render of the last
build you trusted so `check` has something to be differential against.

📌 **What §1.1 moved, what §9.2's block moved, and what neither did.** The
transcription is gone and `explain` prints the model beside the offsets it
produced, so *what a key claims* is readable; the `DEFORM` block prints what the
key **did** — the area and stretch extremes, the displacement and the winding —
so *what the claim came to* is readable too, per key and with no reference
([#316](https://github.com/firejune/rigc/issues/316), landed 2026-09-03; `A39`
catches the fold inside it). *Whether the claim is right* is unchanged: **nothing
measures whether 12° was the angle the shot wanted**, and nothing above is a
substitute for looking at three scales.

---

## 10. The worked example

[`gallery/portrait`](https://github.com/firejune/rigc/tree/main/gallery/portrait)
is this page on real art — **22 parts, 27 bones, 22 slots, 2 meshes, 40
vertices**, three animations, and a README that derives every number rather than
listing it. Its
[`FINDINGS.md`](https://github.com/firejune/rigc/tree/main/gallery/portrait/FINDINGS.md)
is the measurement half: what it cost, the seven-angle sweep, the five tool gaps
it filed.

```bash
bun install                                     # once

bun cli.ts build   --rig gallery/portrait/rig.json \
                   --motion gallery/portrait/motion.json \
                   --out gallery/portrait/build
bun cli.ts render  --candidate gallery/portrait/build --fps 25 --max 640 \
                   --out gallery/portrait/render
bun cli.ts preview --candidate gallery/portrait/build \
                   --out gallery/portrait/preview.html

# do the cycles close on the poses they opened with?
bun gallery/loop_seam.ts gallery/portrait/render/idle@25fps
bun gallery/loop_seam.ts gallery/portrait/render/gaze@25fps
bun gallery/loop_seam.ts gallery/portrait/render/turn@25fps
```

`build`, `render` and `preview` are not committed; the specs and the 22 part PNGs
are, and those commands regenerate the rest. **The frames to look at:**

| Frame | What it is |
| --- | --- |
| `render/turn@25fps/f0016.png` | the yaw arrives. **Look at this one at 1:1** — a contact sheet cannot show you whether the face turned or merely slid |
| `render/turn@25fps/f0000.png` | rest, for the comparison. The pair is the whole example |
| `render/idle@25fps/f0028.png` | the blink, shut |
| `render/gaze@25fps/f0015.png` | the gaze, held |

**What those commands print** — re-run verbatim for this page, from a checkout
with no `build/`, `render/` or `preview.html` in that directory:

| Command | What came back |
| --- | --- |
| `build --profile spine` | green — **18 PASS, 7 SKIP**, 14 excluded by profile |
| `build --profile spine-html` | green — **26 PASS, 13 SKIP**, including `A13_MESH_BUDGET` and `A15_IDLE_NO_MESH_BONE_KEYS` |
| both `MESH` lines | `head` **100.00%** covered, reaching 95.90px past the art; `hair_bang` 100.00%, 55.22px |
| `render --fps 25 --max 640` | **81 + 39 + 56 frames**, 478×640, three contact sheets |
| `loop_seam.ts` ×3 | **0 / 255**, **0 of 305 920 pixels** differing, for all three |
| `preview` | one 415 KiB HTML file, 22 pages embedded as data URIs |

📊 **Figures this page took from the record rather than re-deriving**, because
they need the artifact's own pixels: the blink's occlusion (hiding the whole eye
assembly at the shut hold changes **0 of 305 920** pixels; positive control at
rest moves **8 183**), the per-edge narrowing displacements, the `spine-core`
agreement of every posed column and scale with §1's line to **under 0.001 px**,
and the Web Player interop pass (**0 console errors, 0 page exceptions**). Note
what the first of those cost: hiding one slot at a time needs a throwaway script,
because `setup: { "slot": null }` crashes with a raw `TypeError`
([#293](https://github.com/firejune/rigc/issues/293)).

⭐ **Vela is a second cast member and that was deliberate**, against the gallery's
own rule that its examples share one drawing. A 2.5D turn reads off four things: a
brow that frames an eye, an **iris and a highlight as separate parts**, hair in
**layers** that can lag the skull, and a cheek-to-jaw silhouette with a landmark
in it to foreshorten. The gallery's mascot has a muzzle, and a muzzle points
wherever the head points — so a mascot's turn is a bone rotation and nothing
else, which is precisely the move this page is not about. ⇒ **If the art you were
handed has no landmark to foreshorten, a turn will not read no matter how the
mesh is built**, and that is worth saying to the user before you build it.

---

## 11. Non-goals — stated, so nobody proposes them as gaps

🚫 **No command generates a turn, and neither construct that shipped is one.**
§1 is one line of arithmetic; a `rigc yaw --degrees 12` would be guessing at
every depth in §2 on the user's behalf, and depth is the parameter the *author*
is choosing. [#294](https://github.com/firejune/rigc/issues/294) and
[#295](https://github.com/firejune/rigc/issues/295) both shipped as the other
thing — **a way to say the model in the spec** (§1.1 for the mesh, §3.1 for the
bones) — so the radius, the angle and **every depth** still arrive from the
author and the compiler only evaluates. Neither one generates an in-between
either: a model is evaluated at one key, and sweeping an angle is editing one
number per key. What the toolchain owes is unchanged: that the file is checkable,
that you can look, and that a person can choose.

🚫 **No pass bar for a face, and nothing here to hang one on.** MOTION.md's
banner applies unchanged: `build` says a file is valid, `render` and `preview`
let you look, `vote` lets a person choose. The angles in §8 are where a
construction **stopped reading for one viewer looking at one drawing**, not
thresholds.

🚫 **No claim that 12° is the right angle for any request.** It is the angle the
worked example ships, chosen to sit comfortably inside a 5-column grid's
17.65° tangent limit. §4.2 is how to pick your own, and picking it **first** is
the entire point of that section.

⚠️ **Not a Live2D comparison, and not a recommendation between formats.** What
the worked example measured is that a portrait turn is authorable on plain Spine
4.3 at draft quality — nothing outside the format, no plugin, no runtime patch —
and that the **split is authoring cost rather than runtime capability**. Both
halves of the transcription cost are now paid — the deform table via
[#294](https://github.com/firejune/rigc/issues/294) and the track table via
[#295](https://github.com/firejune/rigc/issues/295) — which moves the remaining
cost off the keyboard and onto the **parts**: per-eye meshes, a meshed neck, a
second art layer for the far cheek (§8). Whether to pay *that* is a project's
decision and this page does not make it.

🚫 **No per-eye mesh recipe.** §8 says the eyes need their own deform meshes past
about 26°, and nobody has built that here. The column-placement arithmetic in
§4.2 applies to any grid over any curved patch, so the tangent limit is the part
that carries over; **what a lash line and a wrapping lid need is unmeasured, and
this page does not guess.**

🚫 **No expression system, no visemes, no phoneme mapping.** A face that *acts* is
a different document and a different measurement. Everything here is one head
turning, blinking and looking — and the one general lesson that might carry into
that work is §7's: **allocate the channels before the first key, because Spine
blends and does not add.**
