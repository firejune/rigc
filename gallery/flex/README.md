# `flex` — the mesh is the art's own silhouette

A swallow-tailed banner waves on a mast and a serrated leaf bends on its stalk,
while Rigby watches. Four attachments here are `contour` meshes: rigc traced
each one off its own PNG's alpha, so there is no number in the geometry that can
disagree with the pixels.

**Stars:** the `contour` mesh generator (what its parameters really do, what it
refuses, and what a hole costs), a `deform` timeline pushing real silhouette
vertices — from a stated model rather than a table — and the rigging pattern a
pinned mesh forces on you. Also **what a fan triangulation does to a deform**:
this example's leaf folded, and the measurement that fixed it is the one figure
here nobody would guess.

## Run it

From a checkout of this repository (`rigc <cmd>` if you have the package
installed — the flags are the same):

```sh
bun cli.ts build   --rig gallery/flex/rig.json --motion gallery/flex/motion.json --out gallery/flex/build
bun cli.ts explain --rig gallery/flex/rig.json --motion gallery/flex/motion.json --out gallery/flex/build
bun cli.ts render  --candidate gallery/flex/build --out gallery/flex/render --fps 12 --max 640
bun cli.ts preview --candidate gallery/flex/build --out gallery/flex/preview.html
```

`build` gates green under both profiles — `--profile spine` (the default) and
`--profile spine-html` — with **no declared exemption**: this example carried the
repository's only `invariants.deformMayFold` until
[#313](https://github.com/firejune/rigc/issues/313), and *The deform* below is
what removing it took. Nothing built is committed; the three output paths above
are in `.gitignore`.

To redraw the art (needs `rsvg-convert` from librsvg — `brew install librsvg`,
`apt install librsvg2-bin`):

```sh
bun gallery/flex/make_parts.ts
```

## The two animations

| Animation | Duration | Loops | What it is for |
| --- | --- | --- | --- |
| `wave` | 2.4 s | yes | A travelling wave down the banner, each hinge a quarter-cycle behind the last, plus the leaf swaying either side of rest |
| `gust` | 1.1 s | no | One hard snap, so the panels and the leaf are seen at a deflection the loop never reaches — and the leaf's blade curves rather than leaning |

## What the generator measured

`build` and `explain` print what each contour actually fits, and this is the
line to read rather than the parameters you asked for:

```
MESH  flag_a       contour  52 vertices / 50 triangles  (budget 96)  bones=[flag_a]  attachments=[flag_a]  covers 100.00% of the art, reaching 2.00px past it
MESH  flag_b       contour  48 vertices / 46 triangles  (budget 96)  bones=[flag_b]  attachments=[flag_b]  covers 100.00% of the art, reaching 2.00px past it, enclosing 848px of hole
MESH  flag_c       contour  81 vertices / 79 triangles  (budget 96)  bones=[flag_c]  attachments=[flag_c]  covers 99.96% of the art, reaching 2.00px past it
MESH  leaf         contour  77 vertices / 75 triangles  (budget 96)  bones=[leaf]  attachments=[leaf]  covers 100.00% of the art, reaching 2.00px past it
```

The budget is this rig's declared `invariants.meshTriangles`, and `flag_c` at 79
triangles against 96 is the reading that matters — it is 82 % of the way to the
wall, which is a thing to know before raising the tolerance. `flag_b`'s hole is
the star punched through it, below.

All four ship at `tolerance: 0.9, margin: 1.2, maxVertices: 96, alpha: 60`.
Those were not guessed — here is the sweep that picked them, on this art:

| tolerance / margin | `flag_a` | `flag_c` (swallow-tail) | `leaf` (serrated) |
| --- | --- | --- | --- |
| 0.4 / 0.6 | 94 v, 100.000 % | refused: 308 vertices | refused: 350 vertices |
| 0.6 / 0.8 | 78 v, 100.000 % | refused: 218 vertices | refused: 232 vertices |
| **0.9 / 1.2** | **52 v, 100.000 %** | **81 v, 99.963 %** | **77 v, 100.000 %** |
| 1.2 / 1.6 | 10 v, 100.000 % | 24 v, 99.690 % | 46 v, 100.000 % |
| 2.0 / 2.5 | 9 v, 100.000 % | 11 v, 99.511 % | 41 v, 100.000 % |

Three things that sweep taught, none of them obvious from the field table:

**Vertex count falls off a cliff, it does not taper.** `flag_a` goes from 52
vertices at tolerance 0.9 to **10** at 1.2. Douglas-Peucker keeps a point only
while some point on the run is further than `tolerance` from the chord — so once
the tolerance passes the *sagitta of the hem's own wave*, the whole undulation
collapses to a straight line in one step. A 33 % change in a parameter took 80 %
of the fidelity, and coverage stayed at 100.00 % throughout, because a chord
across a gentle wave still contains the art. ⇒ **Coverage does not measure
fidelity.** Look at the vertex count, and look at a frame.

**Detail has a floor.** `flag_c` and `leaf` trace to 722 and 582 lattice
vertices, and below tolerance 0.9 the simplifier still keeps 218–350 of them —
past any budget worth calling one. There is no setting that gives you a
finely-traced serrated leaf *and* a small mesh; the art decides.

**`margin >= tolerance` is what pays for the simplification.** Simplification
can bite `tolerance` pixels into the art and the margin is what puts it back.
Dropping the margin to 0 on `flag_c` while leaving a real tolerance is refused,
and the refusal names both numbers:

```
the mesh covers 99.41% of the art (10570 of 10633 px), under the 99.5% a contour
mesh guarantees — raise the margin (now 0px) above the tolerance (2.5px), which
is how far simplification is allowed to cut inward, or lower the tolerance
```

`alpha: 60` rather than the default `1`: `rsvg-convert` leaves a soft
antialiased edge, and at threshold 1 the outline hugs the last almost-invisible
pixel of feather. 60 puts it on the solid core.

## The caveat: a hole is enclosed, not cut out

`flag_b` has a star punched through it, and you can see the sky through it in
any frame. In plain terms:

> **A hole in your art stays a hole on screen, but the mesh covers it.** rigc
> traces the art's *outer* boundary — ear clipping has no bridging step — so the
> triangles run straight across the star. Those pixels still draw nothing,
> because their alpha is still 0. What the hole costs is fill: the renderer
> blends 848 transparent pixels that a mesh cut around the star would have
> skipped, about 6 % of this panel's art area.

That is fine here and it is what you want to know before it is not. Two ways it
stops being fine: a hole large enough that the wasted fill matters, and a hole
you did not know you had — a gap in the art, a soft interior you expected the
threshold to close. So:

✅ **The hole size is on the `MESH` line** — `enclosing 848px of hole`, above.
[Issue #275](https://github.com/firejune/rigc/issues/275), **fixed**. It was
measured all along (`holePixels` is a field of the report the generator builds)
and printed nowhere, while coverage and overshoot are both *unaffected* by a hole
(the overshoot is measured against the **filled** silhouette) — so an unintended
hole was invisible in the loop, and the 848 in this README originally needed a
direct call into `buildContourMesh` to get. The same fix retired the second thing
that line got wrong: `(budget N)` was a hardcoded `80` rather than the rig's
declared `invariants.meshTriangles`, which for this example is 96.

### The other two refusals, on this example's own art

```
every pixel of the 120x150 part reaches alpha 60, so its silhouette IS the part
window and a contour mesh of it is a region attachment with extra vertices —
give the art a transparent margin, raise the alpha threshold, or use a region
```

That one is why the banner's hems undulate with transparent air above and
below. A plain rectangle of cloth cannot be a contour mesh, and it should not
want to be. It is also why the **mast** in this example is a plain `region`
attachment: a rectangle *is* the right shape for a pole, and reaching for a mesh
there would buy vertices and spend them on nothing.

```
the art is 2 separate islands and one outline can only enclose the largest
(11350 of 11546 px, 98.30%) — raise the alpha threshold if the strays are
feathering, or give each island its own slot
```

Reproduced by pasting a 14×14 blob into a corner of `leaf.png`. This is the one
that changes how you *draw*: on a region attachment a fold line that overshoots
a hem by three pixels is invisible, and on a contour it either bulges the
outline or — detached — becomes a second island and fails the build. So every
decoration in `make_parts.ts` is clipped to the silhouette path it belongs to.
What the drawing says the shape is, the mesh will be.

## A pinned mesh decides the rigging

🚨 **Every vertex of a contour mesh is pinned to its slot bone at weight 1, and
no bone can bend it.** What you gain over a region is a real outline, real
triangles and a `hull`; what you do not gain is bone-driven deformation.

So a waving banner cannot be one contour mesh. It is **three rigid panels with a
hinge bone at each seam**:

```
mast
└── hinge_a ── flag_a   (the slot bone, at the panel's centre)
    └── hinge_b ── flag_b
        └── hinge_c ── flag_c
```

Two consequences worth having in advance, because both cost a redraw:

**The slot bone must be the panel's centre, so it cannot be the hinge.** A
generated mesh's window is centred on its slot bone and takes no `x`/`y` offset
— there is no crop to flip against, so the centre is the only placement. Hinging
the chain therefore needs the extra bone per seam: `hinge_b` at the seam,
`flag_b` at the panel's middle.

**Rotating a rigid panel about a point opens a wedge.** At `halfHeight ×
tan(angle)` it is about 22 px at 20° on this cloth, and it shows as a gap of sky
at every seam. The fix is in the *art*: each panel is drawn 24 px wider than the
slice it owns, reaching back under its left-hand neighbour, and each is drawn on
top of the one behind it, so the wedge opens inside the overlap and is never
seen. The hinge spacing in `rig.json` is still the exact slice width — only the
window is wider, which is why each panel's slot bone sits at
`width / 2 − 24` from its hinge rather than at the slice's midpoint.

⇒ **The bend angles in `motion.json` are chosen against that overlap**, not the
other way round: `wave` peaks at 5° / 7° / 9° and `gust` at 14° / 17° / 20°,
and 20° is where the wedge reaches the overlap.

**The hems have to agree across a seam.** Three panels drawn independently join
at two visible steps. So both hems are one function of a *global* x, and each
panel is a slice of it — the panels line up because they were cut out of one
curve rather than drawn to match.

## The deform: bending a mesh the bones cannot

The leaf is where the mesh's own vertices move. A `deform` timeline keys the
attachment's vertex array directly, which is the documented alternative to
bone-driven motion on a contour, and the whole reason to have real vertices
where the silhouette actually is.

⭐ **Both keys state a model rather than a table**
([AUTHORING §4.11.1](../../docs/AUTHORING.md),
[#294](https://github.com/firejune/rigc/issues/294)) — a `bend`, which
displaces one coordinate as a power of how far along the leaf a vertex is:

```json
{ "t": 0.6, "transform": { "kind": "bend", "along": "y", "axis": "x",
                           "amount": 8, "from": -81, "to": 77, "power": 1 }, "ease": "swing" }
```

`from: -81` is the stalk end of the mesh and `to: 77` is just past the tip, both
in the attachment's own units, so `u` runs 0 at the stalk to 0.996 at the
tip and `amount` is the displacement there. The stalk barely moves — 0.4 px at
`gust`'s amplitude — which is what holds the leaf onto the sprig.

⇒ **`wave` sways and `gust` snaps, and they use different powers on purpose.**
That is the finding this example now carries, and the next section is why:

| | `power` | `amount` | What the shape is |
| --- | --- | --- | --- |
| `wave` t = 0.6 / 1.8 | **1** | +8 / −8 | an affine shear: the blade leans, the stalk stays. `det = 1`, so **no triangle can reverse at any amplitude** |
| `gust` t = 0.26 | **2** | +15 | a cantilever: flat at the stalk, curving toward the tip. Not affine — no bone transform can make this shape |

Read back off the posed skeleton, the timeline arrives:

| | deform array | non-zero | largest offset |
| --- | --- | --- | --- |
| `wave` t = 0 | 154 numbers (77 pairs) | 0 | 0.000 px |
| `wave` t = 0.6 s | 154 | 77 | **7.968 px** at vertex 0 |
| `gust` t = 0.26 s | 154 | 77 | **14.882 px** at vertex 0 |

Two notes on that array. It is **154** numbers for 77 vertices — one pair each —
because a contour pins every vertex to one bone, and that is also what makes the
model's own coordinates the attachment's own: one bone means **one coordinate
space**, and the offsets below are in it. Had any vertex carried two bones it
would occupy two pairs, and since
[#389](https://github.com/firejune/rigc/issues/389) the model would still be
evaluated — at each vertex's setup **world** position, pushed into every
influence through that bone's inverse — so the numbers here would be world ones
rather than these ([AUTHORING §4.11.1](../../docs/AUTHORING.md)). And every pair
is non-zero because a stated model covers the whole
attachment — a model applied to part of a run leaves a step at the run's edge,
which is exactly how the defect below got in.

`explain` prints the model and every offset it produced, so the table above and
the artifact are the same numbers:

<!-- transcript: abridged — the last line stands in for nineteen more the run prints -->
```
      t=0.26    deform[0..154]  77 pair(s)                     bezier[4]
               transform bend  amount=15 from=-81 to=77 power=2 along=y axis=x
               dx = amount · u^2,   u = (y − from) / (to − from)
                 span = to − from = 158
                 power 2 is not affine — the gradient at u is 2·amount·u^1/span, so it is 0 at "from"
               77 vertices, largest offset 14.881872px at vertex 0
                 v  0 (14.881872, 0)  v  1 (12.795097, 0)  v  2 (11.586316, 0)  v  3 (10.778408, 0)
                 …nineteen more lines
```

### 🚨 This mesh folded, and the amplitude was never the reason

`A39_DEFORM_KEEPS_TRIANGLE_WINDING`
([#296](https://github.com/firejune/rigc/issues/296)) found, on its first run
over this gallery, that three of the leaf's eight keys swept boundary vertices
**past the fan's apex vertex 76**, reversing the winding of the triangle there:

| animation | key | t | triangles reversed of 75 | worst |
| --- | --- | --- | --- | --- |
| `wave` | 1 | 0.600s | 2 | tri 12 `[76,12,13]` −47.739 → +91.998 px² |
| `wave` | 3 | 1.800s | 7 | tri 61 `[76,60,62]` −4.383 → +167.671 px² |
| `gust` | 1 | 0.260s | 4 | tri 12 `[76,12,13]` −47.739 → +200.220 px² |

At the gust peak it was visible at 1:1: two hard step discontinuities on the
upper-right edge, the ink outline vanishing across one of them and reappearing
displaced, and the vein pattern torn into offset blocks. The rig carried this
repository's only `invariants.deformMayFold` entry, whose `why` said outright
that it was a defect being tracked
([#313](https://github.com/firejune/rigc/issues/313)) rather than art that folds
on purpose. **That entry is gone**, A39 gates this example green, and the
measurement that got there is the part worth keeping:

⭐ **The mesh's problem is its triangulation, not the 15 px.** Ear clipping fans
77 boundary vertices from one apex at the **tip**, so a fan triangle spans the
whole length of the blade and some of them are hairs: five have a setup area
under 5 px² against a largest of 792, and the thinnest three are **0.368,
0.878 and 2.385 px²**. Adjacent boundary vertices sit within **0.27 px** of the
same ray from the apex, so what flips such a triangle is not how far the
silhouette moves but how differently two neighbours move.

**Measured, by sweeping the amplitude until A39 fires** (`amount` on the `gust`
key, and A39's own verdict at each step, not a model of it):

| the deformation | fold-free up to | first amount A39 refuses |
| --- | --- | --- |
| the shipped 1.5-period ripple along the edge | **0.5 px** | 1 px |
| `bend` `power: 2`, toward +x | **42 px** | 43 px |
| `bend` `power: 2`, toward −x | **1.5 px** | 2 px |
| `bend` `power: 1` (the affine shear) | **no bound found at 400 px** | — |

Four things fall out of that table, and they are the reason this repair is a
change of *model* rather than of amplitude:

- **The ripple was never viable.** 0.5 px is below anything that reads, so
  "lower the amplitude" was not a fix available at any number. The 15 px the
  exemption blamed is fine — `gust` still ships it.
- **A fan is not symmetric.** 42 px one way and 1.5 px the other, on the same
  mesh with the same model, because the tight slivers are on one edge. So
  `wave`'s symmetric ±8 sway **cannot** be a quadratic bend.
- **Affine is the one family with a proof rather than a margin.** A positive
  determinant preserves every triangle's winding, hair-thin ones included, so
  the sway is safe by construction and 400 px of shear still gates green. That
  is why `wave` is `power: 1` and why rigc refuses an `affine` determinant at or
  below zero.
- ⚠️ **`wave`'s key is therefore bone-reproducible** — a `shear` plus a
  `translate` on the leaf bone would make the same shape. `gust`'s is not: a
  quadratic bend curves the blade, and no bone transform curves a rigid plate.
  This section's title is earned by the second key, and the first one is here
  because a loop that runs forever wants a proof.

🔭 **What would raise the ceiling** is the triangulation: interior vertices, or a
flip pass over the ear-clipped fan, would remove the hairs without changing the
outline, the coverage or the vertex count. That is a change to the `contour`
generator and every mesh it builds, so it is not this repair; the sweep above is
what it would be measured against. Coarsening the trace does **not** help — at
tolerance 1.2 (46 vertices) and 2.0 (41) the ripple's ceiling falls to 0.25 px,
because coarser vertices are further apart and a wave gives them *more*
different offsets, not less.

## The loop joins exactly, mesh vertices included

`wave` returns every track *and* every deform to its setup value at the
duration. Applying the animation at t = 0 and at its own stored duration and
comparing gives a worst case of

```
0.000000 px over all 24 bones
0.000000 px over all 258 world vertices of the four contour meshes
```

The mesh half of that is the half worth measuring: a deform that almost returns
is a loop that almost joins, and a bone comparison cannot see it.

📌 **"Its own stored duration" is load-bearing, and it is 2.4000000953674316.**
Key times are `float32` in the file, so stepping to the authored `2.4` lands a
hair *before* the last key and leaves 6.1e-5 px of the previous one on every
vertex. That is a property of the arithmetic rather than of this timeline —
the same figure comes back on the build this example shipped before the leaf was
repaired — but a loop-join claim has to say which of the two it measured.

## What is drawn, and how

Every PNG is generated from SVG written by hand in
[`make_parts.ts`](make_parts.ts) and the shared [`../rigby.ts`](../rigby.ts) —
no traced reference, nothing lifted from the benchmark corpus. `plate.png` is
the only opaque part, and `A19_OVERLAY_PNGS_HAVE_ALPHA` exempts exactly that one
role.

The rig declares `"invariants": { "meshSlots": 4, "meshTriangles": 96 }`, and
that is **not optional for a generator**: a rig that declares no
`invariants.meshSlots` has an implicit budget of 0 generated meshes, so a
contour build without it is refused before the gate with
`4 mesh slot(s) emitted but the rig "flex" allows 0`. That requirement is
deliberate — geometry rigc built is geometry it will not ship unmeasured — and
[issue #274](https://github.com/firejune/rigc/issues/274) was that nothing said
so: AUTHORING.md's own contour example did not carry one and did not compile as
written. **Fixed**: the example carries it, §3.7 states the exception, §5.1 lists
the refusal, and the refusal itself now names the field.
