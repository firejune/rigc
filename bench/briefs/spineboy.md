# spineboy brief — the graduation exam

> **Revision 1. Brief verified: no.** Written from
> `bench/reference/spineboy/` and `examples/spineboy/images/` on 2026-08-23 by an
> agent that did not open `examples/spineboy/export/`. Under the protocol in
> [`bench/runs/README.md`](../runs/README.md) **this brief is not ready to be run
> against until a different agent has re-measured every claim in it** — not the
> agent that wrote it, and not the agent that will author the rung. Precedent says
> that pass finds things: rung 8's found 13 wrong digits and 5 claims that were not
> in the pixels at all, and two of the three it caught in rung 6 had survived *two*
> passes by the same author.
>
> **How every number below was obtained**, so that the verifying pass can attack the
> method and not only the digits:
>
> - **Subject mask** — a pixel counts as drawn when it differs from the backdrop
>   (232, 232, 232) by more than **8/255 on some channel**. Every area, box,
>   extent and connectivity figure uses that threshold.
> - **Frame-to-frame difference counts** use a different threshold, **2/255**, which
>   is rung 8's convention and is said here rather than assumed.
> - **The floor.** `frames.json` puts world y = 0 at image row **335.96** in `ess`
>   and **280.90** in `pro`. Control: the lowest drawn row is **336** on all 21
>   frames of `ess/idle` and on `ess/aim`, and **281** on all 21 frames of
>   `pro/idle`, all 4 of `pro/idle-turn` and all 9 of `pro/shoot`. The standing feet
>   sit on world y = 0 to within a pixel, so "off the ground" below means "the
>   lowest drawn row is above that number".
> - **Ground contact** — the columns carrying a drawn pixel in the band
>   [floor − 8, floor + 4], grouped into runs that tolerate a 2-column gap. Control:
>   `ess/idle` and `pro/idle` each return **exactly two** groups on **all 21**
>   frames — two feet, never merging, never splitting — and `ess/run` returns
>   **zero** on precisely the two frames whose lowest drawn row is 13 px above the
>   floor.
> - **The muzzle flash** — drawn pixels with r > 200, b > 140 and g < min(r, b) − 30.
>   Control: **zero** such pixels across every frame of `ess/idle`, `ess/walk`,
>   `ess/jump`, `ess/death` and `pro/hoverboard`. Only the two `shoot` shots have any.
> - **The gun** — drawn pixels with g > 100, g > r + 30, b > r + 15 and b < g + 40.
>   Control: `ess/idle`, where the gun is never covered, reads **599–631 px** across
>   all 21 frames — a 5 % band — and `ess/aim` reads 608. That band is what makes the
>   occlusion figure below (327) mean something.
> - **The vortex** in `pro/portal` — drawn pixels with b > r + 25 and b > g + 25.
>   Control: `portal/f0000`, before anything opens, reads **202 px**, which is the
>   figure's own dark blue hair. That is the estimator's floor; everything quoted
>   about the vortex is many times it.
> - **The figure's position in `pro/portal`** — the centroid of his red kit
>   (r > 150, g < 95, b < 95), which no part of the vortex satisfies.
> - ⚠️ **Timing read off a 30 fps contact sheet.** The 30 fps sets ship as **sheets
>   plus two stills** (see *The reference frames*), and a tile is the frame at
>   **1/3** scale with a label burnt into its corner. Tiles are cut out with
>   `render_reference.ts`'s own layout — 128 px long side, 1 px rules, 8 columns, row
>   major — and are used **only to say which tile an event falls on**, never for a
>   distance or a proportion. Rung 6 lost a revision to sub-pixel figures measured on
>   tiles; every distance below comes from the committed 12 fps frames at full size.
> - **Durations** are bracketed, not read. `src/render.ts` samples
>   `Math.round(duration × fps) + 1` frames, so a frame count *N + 1* at rate *f*
>   puts the duration in **[(N − ½)/f, (N + ½)/f)**. Two rates give two windows and
>   the answer is their intersection. See *How long, and where it ends*.
>
> **What the frames could not decide** is collected under *What this brief cannot
> tell you*, near the end. Read it before you treat any silence here as a fact.

> ## The leakage rule this brief was written under
>
> ⭐ **Everything below is something a client watching the finished animation
> could tell you.** Nothing below was copied out of the reference `skeleton.json`.
>
> This brief is allowed to name the image files, name the animations, state each
> animation's length and whether it ends where it began, describe in plain words
> what a viewer sees, and point at the rendered reference frames.
>
> It deliberately does **not** carry bone names, bone counts, the hierarchy, key
> times, key values, curve handles, timeline kinds, constraint lists, slot names,
> the setup pose, the stage size, or any other fact that only reading the reference
> JSON could supply. Those omissions are the measurement, not an oversight: an agent
> that has seen the answer is being scored on transcription. **If you have the
> reference export in context, stop — this run cannot be recorded.**

## The job

This rung is **two skeletons and they are not equal**. `spineboy-ess` is the
graduation exam: **the rung clears on `ess` alone.** `spineboy-pro` is a **stretch**
figure — `bench` prints its line labelled *(stretch — reported, does not count)* and
a person reads it as extra credit. It is a harder rig than the exam, and folding it
into the pass mark would make the exam unpassable for a reason that has nothing to
do with passing it.

- **`ess` has 8 animations**: `aim`, `death`, `hit`, `idle`, `jump`, `run`, `shoot`,
  `walk`.
- **`pro` has 11.** Seven names are common to both — `aim`, `death`, `idle`, `jump`,
  `run`, `shoot`, `walk`. `hit` is **`ess`-only**; `hoverboard`, `idle-turn`,
  `portal` and `run-to-idle` are **`pro`-only**. The two `shoot`s are different
  lengths.

⚠️ [docs/LADDER.md](../../docs/LADDER.md)'s spineboy row says "11 animations". That
is `pro`'s count. **Do not size the exam from it.**

```bash
bun cli.ts build \
  --rig    <your>.rig.json \
  --motion <your>.motion.json \
  --images examples/spineboy/images \
  --out    <your-out-dir> \
  --profile spine

bun cli.ts bench spineboy --candidate <your-out-dir> --json report.json
```

⚠️ **`bench spineboy` takes one candidate and diffs it against both references**, so
it prints an `ess` line and a `pro` line whichever candidate you hand it. If you
build both, run it twice and read the matching line from each; say in the log which
line came from which run. Quoting the other line as though it measured anything is
the failure mode at a two-skeleton rung, and here it is worse than usual, because
one of the two lines does not count.

Notes on the shape of the deliverable:

- **You do not need an atlas.** The art is 40 loose PNGs and rigc emits its own
  one-part-per-page atlas from them. Point `--images` at the images directory. Only
  the parts a shot actually shows need to be in that shot's rig.
- rigc requires a `skeleton.width`/`skeleton.height` when there is no cut manifest.
  Nothing in the scoring reads the skeleton header — pick something that comfortably
  contains the shot and move on.
- Names are yours. `diff` reports name-matched and name-agnostic figures side by
  side, precisely so that a rig built correctly under its own names is not called a
  total failure.

## What this rung asks that no rung below it did

Every rung under this one is **one moving object** — a ball, a discus on a chain, a
sack. This is a **character**: a figure with a head, a torso, two arms, two legs, a
gun, and a set of shots a game switches between at runtime. Four things follow, and
none of them is a fact from the export — they are what the shots are for.

1. ⭐ **The shots have to agree with each other.** They are states, not one film.
   `idle`, `walk`, `run`, `shoot` and `aim` all put the feet on the same line —
   world y = 0, and the measurement is in the header block — and every one of them
   that a game would hold on loops back to where it started (below). A build in
   which `walk` stands 4 px lower than `idle` is wrong in a way no single shot shows.

2. ⭐ **Moments, not just poses.** A game wants to know *when* a foot lands and
   *when* the gun fires, so it can put a sound or a puff of dust there. Those
   instants are visible in these frames and are quoted below to the frame. Build the
   motion so they fall where they fall. **This brief does not tell you how such a
   moment is spelled** — that is in the export and it is out of bounds — only where
   the moments are.

3. ⚠️ **Hit regions, and why the frames are silent about them.** A character that
   can be shot needs an answer to *"was that a hit"*, and that answer is a shape with
   no pixels. **These frames cannot show you one.** `src/render.ts`, which drew
   them, draws region and mesh attachments and **skips anything that is neither** —
   its own comment names a bounding box, a point and a clipping shape as things "a
   rig legitimately carries and none of them draws a pixel". So the frames neither
   confirm nor deny that the reference has any, and neither does this brief. What
   they *do* give you is where the body is, on every frame, to the pixel; if you
   build a hit region, that is the only guide you have and it is a good one.

4. **The aiming pose is a pose, not a shot.** `aim` renders **one frame at 12 fps
   and one frame at 30 fps** in both skeletons, which puts its length under 1/60 s —
   treat it as having no time extent. A pose with no duration is not something a
   viewer watches; it is something a game holds and steers. In `pro` there is a
   visible clue about what steers it: a small red target mark floats free of the
   figure, out past the muzzle (measured under *`pro/aim`* below). `ess/aim` has no
   such mark.

## The art

`examples/spineboy/images/` — fetched by `bun run fetch-examples`, not redistributed
in this repository. **40 PNGs.**

⚠️ **The transparent margins are not uniform, and only seven files have a symmetric
one.** 25 of the 40 are flush on all four edges — an opaque pixel touches every
border. The **seven `portal-*` files** carry a true 1 px fully transparent border all
round, so `portal-bg`'s drawn part is 264 × 264 in a 266 × 266 image. The remaining
eight are lopsided: `front-shin` 1 px on the left only, `neck` 1 px on the right only,
`rear-bracer` 1 right and 2 bottom, `rear-shin` 1 left / 2 top / 4 bottom, `muzzle02`
3 at the bottom, `muzzle04` 2 at the bottom, `muzzle05` 2 right / 1 top / 1 bottom,
and `muzzle03` 4 / 2 / 3 / 5. Anything that assumes a symmetric border puts those out
by half a pixel in one axis.

| Group | Files (size) | What they are |
| --- | --- | --- |
| Body, near side | `torso` 98×180, `head` 271×298, `neck` 36×41, `front-thigh` 45×112, `front-shin` 82×184, `front-foot` 126×69, `front-upper-arm` 46×97, `front-bracer` 58×80, `front-fist-closed` 75×82, `front-fist-open` 86×87 | the limbs nearer the viewer, in a dark charcoal kit with red boots, red knuckle plates and pale grey trim |
| Body, far side | `rear-thigh` 55×94, `rear-shin` 75×178, `rear-foot` 113×60, `rear-upper-arm` 40×87, `rear-bracer` 56×72 | the same limbs a size smaller and a shade darker — the far arm has no separate fist |
| Face | `goggles` 261×166, `eye-indifferent` 93×89, `eye-surprised` 93×89, `mouth-grind` 93×59, `mouth-oooo` 93×59, `mouth-smile` 93×59 | one pair of goggles and **two** eyes and **three** mouths to choose between |
| Gun and firing | `gun` 210×203, `muzzle01` 133×79, `muzzle02` 135×84, `muzzle03` 166×106, `muzzle04` 149×90, `muzzle05` 135×75, `muzzle-glow` 50×50, `muzzle-ring` 49×209 | a teal blaster, plus **five** numbered flash frames and two extra pieces of flare |
| Hoverboard | `hoverboard-board` 492×152, `hoverboard-thruster` 60×64, `hoverglow-small` 274×75 | a board, a thruster and a glow |
| Portal | `portal-bg` 266×266, `portal-shade` 266×266, `portal-streaks1` 252×256, `portal-streaks2` 250×249, `portal-flare1` 111×60, `portal-flare2` 114×61, `portal-flare3` 115×59 | the layers of a swirling blue vortex |
| Target | `crosshair` 89×89 | a small red ringed cross |

The last three groups only ever appear in shots `pro` has and `ess` does not, and
the crosshair appears in exactly one frame of the whole reference — `pro/aim`.

## The reference frames

[`bench/reference/spineboy/`](../reference/spineboy/), rendered from the official
export. **One directory per skeleton**, because the two are different shots and are
framed independently:

- `ess/<animation>/f0000.png…` — **8 sets, 132 frames at 12 fps**, 384 × 367
- `ess/<animation>@30fps/` — the same 8 animations at **30 fps**, as a
  **`contact.png` plus the first and last frame at full size**
- `pro/<animation>/f0000.png…` — **11 sets, 190 frames at 12 fps**, 384 × 358
- `pro/<animation>@30fps/` — the same 11, sheets plus two stills
- `contact.png` in every set with more than one frame — every sampled frame as one
  labelled grid, row major. **Look at the sheets first.**

`frames.json` beside each skeleton carries that shot's world box and its scale:
**0.222973 px/unit** for `ess`, **0.186285 px/unit** for `pro`. ⚠️ **The two are at
different scales. Do not carry a pixel figure from one to the other** — a 13 px
clearance means 58 units in `ess` and 70 in `pro`.

**Why the frame is mostly empty.** Every animation of one skeleton shares one
viewport, because framing each to its own extent would rescale the motion between
them and the relation between two shots is the whole subject here. That viewport is
the union of everything the skeleton does, and two shots own the extremes: in `ess`
nothing is ever drawn left of column **23** (that is `death/f0007`, at the end of the
slide) or right of column **354** (`shoot/f0004`, the muzzle flash), while a standing
figure occupies about 100 × 146 px in the middle. **Nothing is ever clipped** — over
all 132 committed `ess` frames the drawn extremes are x 23–354, y 18–340 inside
384 × 367, and over all 190 `pro` frames they are x 16–335, y 15–305 inside 384 × 358.

⚠️ **The second rate here is 30 fps, not the 24 fps the rungs below use**, and it is
deliberate. `Math.round(d × f)` at 30 puts every duration inside a window that
contains exactly **one** multiple of 1/30, which 24 does not: at 24 fps `ess/death`
still has three candidates and `ess/shoot` three. It also caught two durations the
12 fps set reads wrong on its own — `pro/idle-turn`, which looks like 0.25 s and is
not, and `pro/shoot`, which looks like 0.667 s and is not. See the next section.

## How long, and where it ends

Read the windows, not the single value: the value is what you get **if** the shot was
authored on a 30 fps grid, which is the Spine editor's default project rate but is
not something these pixels prove.

### `ess`

| Animation | 12 fps | 30 fps | duration window | on a 30 fps grid | returns to frame 0? |
| --- | ---: | ---: | --- | ---: | --- |
| `aim` | 1 | 1 | d < 1/60 s | **0** | — one pose |
| `death` | 60 | 149 | 4.9167 ≤ d < 4.9500 | **4.9333 s** | no — 9,761 px |
| `hit` | 5 | 11 | 0.3167 ≤ d < 0.3500 | **0.3333 s** | no — 10,781 px |
| `idle` | 21 | 51 | 1.6500 ≤ d < 1.6833 | **1.6667 s** | **yes** — 302 px |
| `jump` | 17 | 41 | 1.3167 ≤ d < 1.3500 | **1.3333 s** | no — 3,551 px |
| `run` | 9 | 21 | 0.6500 ≤ d < 0.6833 | **0.6667 s** | **yes** — 1 px |
| `shoot` | 6 | 13 | 0.3833 ≤ d < 0.4167 | **0.4000 s** | **yes** — 0 px |
| `walk` | 13 | 31 | 0.9833 ≤ d < 1.0167 | **1.0000 s** | **yes** — 104 px |

### `pro`

| Animation | 12 fps | 30 fps | duration window | on a 30 fps grid | returns to frame 0? |
| --- | ---: | ---: | --- | ---: | --- |
| `aim` | 1 | 1 | d < 1/60 s | **0** | — one pose |
| `death` | 60 | 149 | 4.9167 ≤ d < 4.9500 | **4.9333 s** | no — 6,702 px |
| `hoverboard` | 13 | 31 | 0.9833 ≤ d < 1.0167 | **1.0000 s** | **yes** — 55 px |
| `idle` | 21 | 51 | 1.6500 ≤ d < 1.6833 | **1.6667 s** | **yes** — 0 px |
| `idle-turn` | 4 | 9 | 0.2500 ≤ d < 0.2833 | **0.2667 s** | no — 5,898 px |
| `jump` | 17 | 41 | 1.3167 ≤ d < 1.3500 | **1.3333 s** | no — 2,595 px |
| `portal` | 39 | 96 | 3.1500 ≤ d < 3.1833 | **3.1667 s** | no — 8,338 px |
| `run` | 9 | 21 | 0.6500 ≤ d < 0.6833 | **0.6667 s** | **yes** — 0 px |
| `run-to-idle` | 4 | 9 | 0.2500 ≤ d < 0.2833 | **0.2667 s** | no — 5,767 px |
| `shoot` | 9 | 20 | 0.6250 ≤ d < 0.6500 | **0.6333 s** | **yes** — 0 px |
| `walk` | 13 | 31 | 0.9833 ≤ d < 1.0167 | **1.0000 s** | **yes** — 77 px |

⚠️ **"Returns" is a judgement about a gap, and the gap is wide.** The last column is
the count of frame pixels differing between the first and last 12 fps frame at
2/255. The values sort into **0, 0, 0, 1, 55, 77, 104, 302** and then
**2,595, 3,551, 5,767, 5,898, 6,702, 8,338, 9,761, 10,781** — a factor of 8.6 across
the break, with nothing in between. The first group is 0.2 % of the frame or less.
The five loops are the gaits, the stance, the shot and the hoverboard, which is what
you would expect a game to hold on; the transitions and the one-shots are the others.

⚠️ **`ess/idle` and `ess/walk` do not return bit-exactly** (302 and 104 px) where
their `pro` counterparts do (0 and 77). Both are still cycles; do not read the
difference as a structural fact.

📌 **Nothing is ever completely still except one frame pair in the whole reference.**
The quietest consecutive pair anywhere is `ess/shoot` f0 → f1, which is **identical**
— the shot holds for its first twelfth of a second. Everything else moves: the next
quietest are `pro/portal` f0 → f1 at 4 px (the vortex's first speck, while the figure
itself has not moved at all) and `ess/death` f25 → f26 at 24 px.

---

# `ess` — the exam

## `idle` — a stance that breathes

**1.6667 s, loops.** The figure stands facing right, gun held across him in the near
hand, and breathes. It is small: over the 21 frames the subject's bounding box is
**100–101 px wide and 143–146 px tall**, its top edge rises and falls through
**3 px** (row 191 → 194 → 191), and its centroid sways **2.0 px** horizontally
(183.5 → 185.5 → 183.6) on the same cycle. The feet never move — exactly two
ground-contact groups on all 21 frames, and the lowest drawn row is **336** on every
one of them.

No consecutive pair differs by less than 3,157 px. The breathing is continuous, not
a hold with a bob in it.

## `walk` — a 2-step cycle on the spot

**1.0000 s, loops.** Two steps, and **the figure does not travel**: its centroid
oscillates about x ≈ 182 with no net drift, and the last frame is the first again to
within 104 px. The ground is what moves under him.

**The footfalls — the moment this rung is asking you to place.** Counting
ground-contact groups per frame: two on f0–f1, one on f2–f4, two on f5–f8, one on
f9–f10, two on f11–f12. A second group **appearing** is a foot landing.

- At 12 fps a foot lands between **f4 and f5** and again between **f10 and f11**.
- On the 30 fps sheet the same transitions fall between tiles **12 and 13** and
  between tiles **26 and 27**.
- Intersecting the two: **the first footfall is between 0.400 s and 0.417 s, the
  second between 0.867 s and 0.900 s** — about half a second apart, two steps per
  second.

The swing foot leaves the floor between 30 fps tiles 4 and 5 (0.133–0.167 s) and
between tiles 20 and 21. **Neither foot is ever fully off the ground**: the lowest
drawn row stays in **334–337** on all 13 frames, against a floor of 336.

📐 **A draw order the frames do decide.** The gun rides in the near hand and swings
with the arm. On the frames where it swings down and back it goes **behind the near
leg**: the visible gun area drops from **599–631 px** — the figure's unoccluded
reading, measured on all 21 frames of `idle` — to **327 px at f6** and **336 px at
f9**, while over the same frames the gun's own bounding box gets *taller*, not
smaller (106 px at f0 against 126 at f6 and 134 at f9). It is being covered, not
foreshortened away. The leg is in front of the gun.

## `run` — the same idea with both feet off the ground

**0.6667 s, loops — and it returns to its first frame within 1 pixel**, the tightest
loop in either skeleton after `shoot`. Two strides, again **on the spot** (centroid
x 183.8–193.6, no drift).

**There is a flight phase, twice.** The lowest drawn row is **323 on f2 and f6** and
**334–336 on every other frame** — the whole figure is **13 px ≈ 58 units** clear of
the floor, and the ground-contact estimator returns **zero groups** on exactly those
two frames and one or two on all the others. The 30 fps sheet puts the airborne
stretches at tiles **4–6** and **14–17**.

**The footfalls**: a foot is back on the floor at **f3** and **f7** (12 fps) — a
single flat contact of 20–21 columns each time — which the 30 fps sheet corroborates
at tiles 7–8 and 17–19. Four twelfths of a second apart, one landing per stride.

## `jump` — no wind-up, a long hang

**1.3333 s, does not return** (3,551 px), though it ends very near where it began:
the last frame's box is (146, 200)–(249, 335) against the first's (146, 201)–(248, 335).

- **f0 is the crouch and it is the only frame of it.** The figure is **135 px tall
  against the 143–146 px he stands at in `idle`**, and one twelfth of a second later
  his lowest drawn row is already **302** — 34 px clear of the floor, the largest
  single-frame rise in the shot. There is **no anticipation to build; the shot opens
  on the launch**. (The 30 fps sheet agrees, but only by one tile pixel, which at a
  third of the frame's resolution is not worth quoting against the 12 fps figure.)
- **Rise**: the lowest drawn row runs 335 → 302 → 260 → 232 → 212 → 196 → 184 → 176
  → 171 → **169 at f9**.
- **The apex is a hang, not a point.** On the 30 fps sheet the lowest row sits at its
  minimum across tiles **20–25** — a fifth of a second at the top — and the peak
  clearance is **167 px ≈ 749 units** above the floor.
- **Fall and land**: down through f10–f14 and back on the floor at **f15**
  (lowest row 336). The single largest frame-to-frame change in the shot is
  **f13 → f14 at 10,811 px**, the last frame of the drop.
- Horizontally it is nearly a vertical jump: the centroid drifts **13 px left**
  around the apex (192.8 at f0 → 179.5 at f10) and comes back to 190.6 at f16.

## `shoot` — a hold, a flash, and back exactly

**0.4000 s, and the last frame is bit-identical to the first** — 0 px differ, the
only exact return in `ess`.

- **f0 → f1 is identical.** The shot holds for its first twelfth of a second before
  anything happens. This is the only motionless frame pair in the entire reference.
- **The flash.** Pink flare pixels are absent on f0, f1 and f5, and present on
  **f2 (166 px), f3 (1,659 px) and f4 (717 px)** — it blooms and disperses rather
  than popping for one frame. On the 30 fps sheet it is on tiles **5 through 11**,
  brightest at tile 9, so **the gun fires between 0.133 s and 0.167 s and the flare
  is gone by 0.400 s** — about **0.23 s** on screen.
- It reaches a long way. The subject's bounding box widens from **108 px to 189, 202
  and 218 px** on those three frames, out to column 354, which is the rightmost
  anything is ever drawn in the whole `ess` set.
- **Nothing else moves much.** The lowest drawn row is 336 on all six frames and the
  box height is 152 px on all six: the feet stay planted and the figure does not
  recoil off the floor.

## `hit` — it starts at the impact

**0.3333 s, does not return** (10,781 px — the largest first-to-last difference in
either skeleton, over a shot lasting five frames).

⭐ **The first frame is the extreme.** The figure is already **horizontal**, head to
the left, laid out **148 px wide and 80 px tall** — against 100 × 146 standing. There
is no run-up to it in these frames; the shot opens on the pose and spends its whole
length recovering. Over five frames the box goes 148 × 80 → 149 × 104 → 138 × 133 →
116 × 147 → **103 × 150**, and the centroid climbs from (132.0, 300.3) to
(165.6, 252.0) — up and to the right, back onto his feet.

⚠️ He passes **below** the standing floor: the lowest drawn row is **338, 340, 339,
336, 336** — up to 4 px under world y = 0 on the middle frames.

`pro` has no `hit`.

## `death` — fall, land, lie still, then a hand comes up

**4.9333 s, does not return** (9,761 px). By far the longest shot on the ladder, and
it is four distinct passages:

1. **f0 → f7, the fall.** Standing at (177.8, 256.1), the figure is thrown up and to
   the left, tumbling: the box turns from 61 × 153 upright to **151 × 65** flat, the
   lowest row goes 336 → 259 (he leaves the ground) → 338, and the largest change in
   the shot is **f5 → f6 at 9,658 px**. He ends on his back, head to the left.
2. **f8 → f12, the settle.** He slides and stops. The centroid travels from x 177.8
   at f0 to **x ≈ 83**, about **95 px ≈ 426 units to the left**. Consecutive
   differences fall away — 5,942, 5,120, 5,337, 4,567, 3,220.
3. **f18 → f26, dead still.** Consecutive differences drop under 50 px at f17 → f18
   and stay there — **24 to 45 px**, a two-hundredth of what a moving pair costs in
   this shot — for **nine frames, 0.75 s**. The bounding box is (24–25, 275–276)–(175,
   338) and moves by at most one pixel in that whole passage.
4. **f27 → f56, a hand comes up.** Motion restarts at f27 — the f26 → f27 pair
   differs by **1,590 px**, sixty times the pair before it — and it is confined to the
   left-hand end of the body: every difference box in this passage lies inside
   x 24–131, which is the head-and-chest end, while the boots at x 145–175 never
   move again. The near arm lifts off the chest and waves — the subject's top edge
   rises from row 276 to **265** by f48–f51 and back to 273 — and the arm is down
   again by f57, after which the frames go quiet (620, 667, 859 px).

The whole thing is a fall, a stillness long enough to read as death, and then a last
movement.

## `aim` — one frame

**No time extent** — one frame at 12 fps, one at 30. The figure stands with the gun
held out level to the right, feet on the floor (lowest row 336). Against `idle/f0000`
it is a genuinely different pose: 106 × 152 against 100 × 146, and 8,813 frame pixels
differ. **Nothing but the figure is drawn**: under 8-connectivity the frame holds
exactly one connected component of 20 px or more — and so does every one of the other
131 committed `ess` frames bar `shoot/f0004`, where the dispersing flare breaks off.
`pro/aim` is not like this; see below.

---

# `pro` — the stretch figure

**This does not count towards the rung.** It is here because `bench` reports it and
because two of its shots are the only place some of the art appears.

Its `death`, `idle`, `jump`, `run` and `walk` read the same way `ess`'s do, at this
skeleton's own scale and floor (row **281**): `run` is airborne on f2 and f6 (lowest
row 269–270, **11–12 px ≈ 60–64 units** of clearance) and lands on f3 and f7;
`walk`'s second ground-contact group appears at **f5** and **f11**, the same frames
as `ess`'s; `jump` peaks at a lowest row of **151**, i.e. **130 px ≈ 698 units** above
its floor. Do not compare those unit figures with `ess`'s — different rig, different
scale, and this brief has not established that the two are the same motion.

## `aim` — and the target

**One frame, no time extent** — and unlike `ess`'s, it draws **two** things. The
figure (4,223 px, box (174, 159)–(260, 281)) and, detached from him, a
**17 × 17 px red ringed cross** centred at image (274.1, 174.2), i.e. **world
(299.0, 572.8)**. The gun's foremost teal pixel is at world (202.0, 525.5), so the
mark sits about **97 units beyond the muzzle and 47 above it**. At 17 px it is
**≈ 91 units across**, and `crosshair.png` is 89 px — it is drawn at very close to
life size.

Counting 8-connected components of 20 px or more, **28 of the 322 committed frames
hold more than one** and they are all accounted for: 26 frames of `pro/portal`, where
the vortex stands clear of the figure, `ess/shoot/f0004`, where the dispersing flare
breaks off — and this one. **It is the only detached thing in the whole reference that
is not a muzzle flash or the vortex, and it appears in this single frame.**

## `shoot` — a longer shot with a shorter flash

**0.6333 s, returns to frame 0 exactly** (0 px). The flare is on **f1 (1,187 px) and
f2 (358 px)** only — on the 30 fps sheet, tiles **1 through 5**, so **the gun fires
within the first thirtieth of a second** and the flare is gone by 0.2 s. The rest of
the shot, f3 through f8, is the figure settling: consecutive differences decay
**644, 558, 480, 389, 333** and never reach zero.

⚠️ The flare here reaches **below** the standing floor — the lowest drawn row is 305
on f2 against 281 everywhere else.

## `hoverboard` — a 1 s loop with the feet off the ground

**1.0000 s, loops** (55 px). The figure rides a board; the board's underside, not his
boots, is what is near the floor, and the lowest drawn row cycles **263 → 280**, so
the whole rig rises and falls about **17 px ≈ 91 units** on the cycle while the box
height breathes between 124 and 140 px.

## `idle-turn` — the pivot

**0.2667 s, does not return** (5,898 px). Four frames at 12 fps, nine at 30. The
figure begins facing **left** — the gun's teal extends to the left of the body — and
finishes facing **right**, and the box shifts right as he turns: (167, 154)–(249, 281)
to (191, 160)–(272, 281). The feet stay put: two ground-contact groups and a lowest
row of 281 on all four frames. **He turns on the spot.**

## `run-to-idle` — a four-frame stop

**0.2667 s, does not return** (5,767 px). The box grows 76 × 110 → 85 × 122 and the
centroid moves right and settles; the lowest row is 280–281 throughout. It ends in a
pose close to `idle-turn`'s last frame — the box is (189, 160)–(273, 281) against
(191, 160)–(272, 281) — which is the sort of agreement between two shots this rung is
about.

## `portal` — a vortex, and a passage through it

**3.1667 s, does not return** (8,338 px). Read it in five passages:

1. **f0 → f10 — he does not move at all.** The figure's red-kit centroid is
   **(53.3, 245.7) on all eleven frames, to a tenth of a pixel**, and its bounding box
   is identical throughout. `f0 → f1` differs by **4 pixels in the whole frame**, and
   all four are the vortex's first speck at column 135.
2. **f2 → f9 — the vortex opens.** Its blue area climbs 262 → 378 → 1,000 → 2,806 →
   5,573 → 8,460 → **9,195 at f9** against a floor of ~200. It reaches full size by
   about **0.75 s** and settles at 7,000–8,800.
3. **f11 → f16 — he is taken through it.** He starts moving at f11; between f12 and
   f13 his centroid jumps from (54.1, 242.0) to **(103.5, 191.2)**, and f13–f15 have
   him tumbling head-down across the vortex's face.
4. **f16 → f21 — he comes out the far side and lands on his feet**, centroid
   settling at x ≈ 223 by f21. Total travel from start to rest is
   **≈ 170 px ≈ 913 units to the right.**
5. **f21 → f38 — he stands, the vortex closes.** He holds station (centroid x
   222–226) but is never still — `f37 → f38` still differs by 3,236 px. The vortex
   shrinks from f33: blue area 6,544 → 3,777 → 1,575 → **213 at f36**, back to its
   floor, so it is **gone by 3.0 s** and the last three frames have no vortex in them.

He is drawn **in front of** the vortex on every frame where they overlap.

---

## What this brief cannot tell you

Stated so that its silence is not mistaken for a measurement.

- **The exact durations, unless the project is on a 30 fps grid.** Two rates give
  the windows in the tables above and no more. Every window contains exactly one
  multiple of 1/30 and that is the value quoted, but the frames do not prove the grid.
- **Anything that does not draw.** Hit regions, markers and masks leave no trace in
  these frames, because the renderer that made them skips every attachment that is
  not a region or a mesh. If the reference has any, the frames neither show them nor
  rule them out — and the same goes for a candidate's.
- **Draw order, except one edge.** The frames decide that the near leg is drawn in
  front of the gun (`walk`, measured above). Nothing else: **no pair of parts is
  visibly on one side of each other in one frame and the other side in another**, so
  the frames show no draw-order *change* at all. ⚠️ Note where this bites — the
  obvious place a rig would need one is `pro/idle-turn`, where the figure pivots from
  facing left to facing right, and that is exactly the place where a re-order and a
  mirror look identical in pixels.
- **Whether the face art changes between shots.** The goggles cover the eyes on every
  frame of both skeletons, and the mouth is 6–8 px across at this frame size. The art
  ships two eyes and three mouths; which shot uses which is not readable here, and a
  glance that thinks it can read it is the trap rung 2's brief fell into.
- **How many pieces anything is.** The gun reads as one object, the vortex as one
  swirl, the hoverboard as one board; the art ships five numbered muzzle flares, seven
  portal layers and three hoverboard pieces, and the frames cannot tell you how they
  are divided between parts or which flare is on which frame.
- **Whether `ess` and `pro` share a rig, or whether their same-named shots are the
  same animation.** The two are framed at different scales and were measured
  independently. Their durations agree to the frame on `death`, `idle`, `jump`, `run`
  and `walk` and disagree on `shoot` (0.4000 s against 0.6333 s), but agreeing frame
  counts are not evidence of a shared timeline.
- **What drives `aim`.** One frame is one frame. The red mark in `pro/aim` says
  something is being pointed at; it does not say what moves the arm, or whether the
  mark is meant to move at all.
- **Anything about `hit` beyond its own five frames.** It opens on a horizontal
  figure and rights him. Whether it is meant to be played after something, mixed over
  something, or on its own is not in the pixels.
- **Where the ground is other than y = 0.** `jump`'s landing and `death`'s slide both
  finish on the same line the stance uses, and no floor is drawn anywhere. There is no
  surface to reproduce.
- **Whether anything leaves the frame.** Nothing does — the margins are in *The
  reference frames* — but that is a statement about these viewports, not about a
  stage.

## How the result is read

`bench spineboy` does two things and does not merge them:

1. **Validity** — `validate --profile spine` on your candidate. This is the only
   pass/fail. A candidate that is not valid Spine 4.3 has not cleared anything.
2. **Structural diff** — a ratio per measure against the reference export, in six
   sections, **once per skeleton**. The `pro` line is printed as
   *(stretch — reported, does not count)*. **There is no rung score**, on purpose: a
   rig with the right skeleton and the wrong timing and a rig with the right timing
   and the wrong skeleton call for opposite fixes. A person reads the measures and
   records the judgement in [docs/LADDER.md](../../docs/LADDER.md).

So do not tune toward a number. Author the shots, get the gate green, and let the
measures say where it landed.

`check` stays in the loop — it never opens the reference skeleton, only the frames.
Point `--frames` at `bench/reference/spineboy/ess/` or `.../pro/`, the skeleton root
with `frames.json` in it, and it will check every set of that shot at both rates.
⚠️ At 30 fps only two frames per animation are on disk; the sheets are not frames.

## Deliverables

See [`bench/runs/README.md`](../runs/README.md) for the run protocol — where the
output goes, what has to be recorded, and what you must not read. Read
[docs/AUTHORING.md](../../docs/AUTHORING.md) first, **including §8**, which is about
measuring reference frames and was written from the mistakes the first ladder run made
doing exactly that, and **§10**, the editor's own default conventions.

⚠️ **The rung clears on `ess`.** Build that one first and completely. `pro` is worth
attempting only once `ess` is green, and its line in the report is extra credit, not
part of the mark.
