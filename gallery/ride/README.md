# `ride` — a path constraint carries a rider along a drawn curve

Rigby coasts down a rail in a wooden trolley, rolls up the far bank and comes
back. Everything about where the trolley is and which way it is tilted comes
from **one curve and one number**: a `path` attachment holds the curve, a `path`
constraint puts the trolley on it, and a `position` timeline is the number.

**Stars:** path attachments and path constraints (`vertexCount` arithmetic,
`positionMode: "percent"`, `rotateMode: "tangent"`, the measured `lengths`),
a `position` timeline, `groups` + `stagger`, a stepped `attachment` timeline,
and a loop that joins exactly.

## Run it

From a checkout of this repository (`rigc <cmd>` if you have the package
installed — the flags are the same):

```sh
bun cli.ts build   --rig gallery/ride/rig.json --motion gallery/ride/motion.json --out gallery/ride/build
bun cli.ts explain --rig gallery/ride/rig.json --motion gallery/ride/motion.json --out gallery/ride/build
bun cli.ts render  --candidate gallery/ride/build --out gallery/ride/render --fps 12 --max 640
bun cli.ts preview --candidate gallery/ride/build --out gallery/ride/preview.html
```

`build` gates green under both profiles — `--profile spine` (the default) and
`--profile spine-html`. `render` writes a PNG per sample plus a `contact.png`
per animation; `preview` writes one HTML file that plays the artifact in the
official Spine Web Player. Nothing built is committed: the three output paths
above are in `.gitignore`.

To redraw the art (needs `rsvg-convert` from librsvg — `brew install librsvg`,
`apt install librsvg2-bin`):

```sh
bun gallery/ride/make_parts.ts
```

## The two animations

| Animation | Duration | Loops | What it is for |
| --- | --- | --- | --- |
| `ride` | 4 s | yes | The round trip. `position` walks 0 → 1 → 0, so the loop joins with no jump |
| `coast` | 2 s | no | One traversal, 0 → 1, so the `position` arithmetic below is readable off a frame |

## The curve is written down once

A path attachment **is not drawn** — no runtime renders one. So an example
where you can see the track is two things that have to agree: the invisible
curve in `rig.json`, and the rail PNG you actually look at.

[`curve.ts`](curve.ts) is where the twelve control points live.
[`make_parts.ts`](make_parts.ts) draws `rail.png` from them, and then reads
`rig.json` back and **refuses to finish** if the path attachment disagrees:

```
checked: rig.json's path attachment matches curve.ts, all 12 points
```

That check earns its place because the drift it catches is invisible to
everything else — the gate has no opinion about where a rail was painted, and a
cart riding six pixels above its own rail is a green build.

The curve is the **axle line**, not the top of the rail: the rail art is that
same curve pushed down by the wheel radius (34), which is what puts the wheels
on it rather than through it.

### `vertexCount` counts knots *and* handles

Three curves, open, so twelve points — `3(K + 1)`, and the first and last are
the end knots' outer control handles that no curve uses:

```
index  0        unused outer handle
       1        knot 0            (150, 360)   high on the left
       2, 3     handles of curve 0
       4        knot 1            (520, 150)   the bottom of the dip
       5, 6     handles of curve 1
       7        knot 2            (880, 330)   the far crest
       8, 9     handles of curve 2
       10       knot 3            (1150, 230)
       11       unused outer handle
```

The two unused points still do a job here: they are the end knots' tangent
directions, so `make_parts.ts` extends the *drawn* rail along them and the rail
runs off both edges of the frame instead of stopping at a tip the trolley
appears to balance on. The traversal is unaffected.

The handles at knots 1 and 2 are deliberately level. A knot's tangent runs from
the handle *before* it to the handle *after* it, so a level pair is a flat
bottom and a flat crest rather than a corner.

## `lengths` is measured, and `position` is a fraction of it

`lengths` is not yours to write — rigc measures the setup arc length of each
curve off the vertices and refuses an authored array. `explain` prints what it
measured:

```
path constraints  (position is a fraction of the measured length under positionMode "percent")
  ride         slot=track        bones=[cart] position=0 percent/percent/tangent
               curve: 3 curve(s), 1133.420353 long, open, constantSpeed=true
```

Three things about that number turned out to matter in practice, and all three
are checkable from a `coast` frame:

**1. `position` is arc length, not the curve parameter.** Stepping `coast` and
reading the trolley's world position back out of the posed skeleton:

| `coast` at | trolley world x, y | arc length reached | ÷ 1133.42 |
| --- | --- | --- | --- |
| 0.0 s | (150.000, 360.000) | 0.000 | 0.000000 |
| 1.0 s | (642.680, 197.574) | 566.954 | **0.500204** |
| 2.0 s | (1150.000, 230.000) | 1133.444 | 1.000000 |

The 0.0002 is the resolution of the independent polyline used to measure the
arc, not slack in the traversal: that polyline totals 1133.444048 where rigc
measured 1133.420353, a 0.002 % disagreement between two ways of integrating
the same curve. What this rules out is the plausible wrong answer — the
**composite parameter** at 0.5 lands at (700.000, 239.250), which is **71 px**
from where the constraint actually puts the trolley. On a curve whose three
segments are not the same length, those two are different places, and only one
of them is what `percent` means.

**2. `rotateMode: "tangent"` is exactly the tangent.** The trolley's world
rotation at `coast` t = 0 is **−3.814°**; the tangent at knot 0, `atan2` of
`POINTS[2] − POINTS[1]`, is **−3.814°**. At t = 2 s it is **−1.273°** against a
knot-3 tangent of **−1.273°**. No fudge factor, no offset — which is why the
`rotation` field on the constraint is 0 and the trolley art is drawn upright.

**3. The loaded `lengths` array is one longer than the number of curves, and
the extra entry is 0.** `SkeletonJson` sizes it `vertexCount / 3` = 4 and rigc
writes one length per curve, so the parse comes back
`[433.330194, 842.822858, 1133.420353, 0]`. That is not a defect: for an open
path `PathConstraint` reads `lengths[verticesLength / 6 - 2]` = `lengths[2]`,
and it never reaches index 3. Worth knowing before you read the array yourself
and take the last element for the total, which is wrong by the whole path.

## The wheels are the traversal, in degrees

The wheels are not decorated with a plausible spin — they roll. Rolling without
slip over the whole path turns a wheel of radius 34 by

```
1133.420353 / 34 radians = 1910.006 degrees   (5.31 turns)
```

and that is the number in `motion.json`, negative because rolling to the right
is clockwise. It stays in sync with the traversal for a structural reason
rather than a lucky one: both tracks are linear in `position`, share the same
key times, and carry the same named easing, so any re-timing moves them
together. Measured on the build, `wheel_f`'s local rotation goes 0 → −1910.006
over `coast`, against −1910.046 required by the independently measured arc — 
0.04° of disagreement across five and a third turns.

Both wheels are keyed by **one** track through a `groups` entry, because they
turn together:

```json
"groups": { "wheels": ["wheel_b", "wheel_f"], "ears": ["ear_l", "ear_r"] }
```

The ears use the other half of that feature: one track, `"stagger": 0.12`, and
the two ears flap a frame and a half apart. `stagger` shifts every key of the
*n*th member by `n × stagger`, so the last key sits at `3.86` rather than at
the duration — `3.86 + 0.12 = 3.98`, still inside the 4 s animation.

## The loop joins exactly

`ride` returns every track to its starting value at the duration, and the seam
was measured rather than eyeballed: stepping the animation to t = 0 and to
t = 4 s and comparing all 17 bones gives a worst-case difference of

```
0.000000 px of world position, 0.000000° of world rotation
```

Two things make that hold. Every track's first and last **values** are equal —
including the stepped `attachment` timeline, whose last key restores `eyes`. And
every key that has something to ease to carries the same symmetric easing, so
the velocity at the seam is zero on both sides and the join is smooth as well
as continuous.

`coast` does not loop and its ends are 1008.78 px apart, which is the point of
having both.

## Two spellings that cost a build if you get them wrong

**A stepped key on a round time misses its own sample.** The blink is an
`attachment` timeline, which is inherently stepped, and its keys are written
`2.399999` and `2.519999` rather than `2.4` and `2.52`. A sampler reaches
sample *i* by accumulating `1/fps` *i* times, which for many *i* lands a few
ULPs *below* `i/fps` — so a stepped key sitting exactly on a grid multiple is
above the sample that was meant to see it, and on an interpolated timeline that
costs a rounding error while on a stepped one it costs the whole frame.
One grid step early cannot reach the previous sample and is always seen by the
right one. (AUTHORING.md §4.5 has the measurement this rule came from.)

**Rotate values are offsets from the setup pose.** `arm_f` sits at
`"rotation": 148` in the rig and its wave track keys `0`, `-18`, `2`, `-18`,
`0` — those are degrees *added* to 148, not absolute headings.

## The bone table, in one paragraph

`root` is at the world origin, which is why the `track` slot hangs off it: a
path attachment's vertices are in its slot bone's space, so with that bone at
(0, 0) and unrotated, the numbers in `rig.json` are world coordinates and the
numbers in `curve.ts` are the same numbers. `cart` is the constrained bone;
`wheel_b`/`wheel_f` and `hip` are its children, so the constraint carries the
wheels and the whole figure with it and the tangent rotation tilts all three.
`stage` at the stage's centre carries the two full-stage plates, `plate` and
`rail`, because a stage-sized part centred on the stage's centre needs no
offset — one less number that can be wrong.

Draw order puts the deck *behind* the legs and the wheels *in front* of the
deck: a figure standing on a trolley has its feet on top of the planks, and a
side-view wagon's wheels are outboard of its body.

## What is drawn, and how

Every PNG is generated from SVG written by hand in
[`make_parts.ts`](make_parts.ts) and the shared [`../rigby.ts`](../rigby.ts) —
no traced reference, nothing lifted from the benchmark corpus. The character is
drawn at nominal size and rasterised at half, so the downscale is a re-render
rather than a resample. `rsvg-convert` already writes 8-bit, non-interlaced,
**straight**-alpha PNGs, which is what rigc's decoder reads and what
`A19_OVERLAY_PNGS_HAVE_ALPHA` wants; premultiplied alpha is the export setting
worth checking, because it gives every part a dark rim that no assertion can
see.

`plate.png` is the only opaque part here, and it is allowed to be: `A19` exempts
the full-stage base plate and refuses every other part that cannot be
transparent.
