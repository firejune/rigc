# spineboy brief — the graduation exam

> **Revision 1 → 2. Brief verified: yes (third party), 2026-08-23.** Every
> quantitative and behavioural claim below was re-measured off
> `bench/reference/spineboy/` and `examples/spineboy/images/` by a **different
> agent** from the one that wrote revision 1 (Claude Opus 5 (1M context), Claude
> Code / Agent SDK, fresh session), under the protocol in
> [`bench/runs/README.md`](../runs/README.md). `examples/spineboy/export/` and
> `bench/transcriptions/` were **not** opened. Estimators were written from scratch
> and **each was scored against a control with a known answer before any number it
> produced was believed** — including compositing the art at the sidecar's own
> scale to predict what an estimator should read on an unoccluded part. See
> *Verification notes* at the end for claim-by-claim results.
>
> **What held, much of it to the digit**: both duration tables entire — all 19
> animations' frame counts at both rates, all 19 windows and all 19 values on a
> 30 fps grid; every one of the 17 first-to-last differences at 2/255; the whole
> `idle`, `hit`, `shoot` and `aim` routes; `death`'s four passages, including the
> 9,658 px throw, the 24–45 px stillness over nine frames and the f26 → f27 restart
> at 1,590 px; `jump`'s rise series 335 → 169 and its 167 px apex over tiles 20–25;
> `walk`'s footfall counting frame by frame; all 40 image dimensions and every margin
> figure bar `muzzle03`'s; the connectivity census (28 of 322 frames, and it
> holds under 4-connectivity too); every figure in `pro/aim`, `pro/shoot`,
> `pro/hoverboard`, `pro/run-to-idle` and most of `pro/portal`.
>
> **What changed**: the gun estimator is **not gun-only** — the figure's teal hair
> satisfies it too, and it is nearly half the reading, so every digit in the `walk`
> draw-order paragraph was measured off a mixed mask (the conclusion survives and
> gets *stronger* on a clean one); the second footfall in `walk` is a 30 fps tile
> later than revision 1 said, which moves its window and makes the two footfalls
> exactly half a second apart; `ess/death` is **not** the longest shot on the ladder;
> `pro/shoot`'s floor control is wrong in the header and in the body; the muzzle-flash
> detector is **not** silent outside the two `shoot` shots; `ess/run`'s two landings
> are not the same width; the frames decide **two** draw-order edges, not one; and
> `pro/idle-turn` does not have two ground-contact groups on all four frames.
> Smaller corrections are listed at the end.
>
> **How every number below was obtained**, so that a later pass can attack the
> method and not only the digits:
>
> - **Subject mask** — a pixel counts as drawn when it differs from the backdrop
>   (232, 232, 232) by more than **8/255 on some channel**. Every area, box,
>   extent and connectivity figure uses that threshold.
> - **Frame-to-frame difference counts** use a different threshold, **2/255**, which
>   is rung 8's convention and is said here rather than assumed.
> - **The floor.** `frames.json` puts world y = 0 at image row **335.96** in `ess`
>   and **280.90** in `pro` — recomputed from the sidecar's own viewport, not taken
>   on trust. Control: the lowest drawn row is **336** on all 21 frames of
>   `ess/idle` and on `ess/aim`, and **281** on all 21 frames of `pro/idle`, all 4
>   of `pro/idle-turn` and on **six of the nine** frames of `pro/shoot` (f1 and f2
>   read 296 and 305, because the flare hangs below the feet — see *`pro/shoot`*).
>   The standing feet sit on world y = 0 to within a pixel, so "off the ground"
>   below means "the lowest drawn row is above that number".
> - **Ground contact** — the columns carrying a drawn pixel in the band
>   [floor − 8, floor + 4], grouped into runs that tolerate a 2-column gap. Control:
>   `ess/idle` and `pro/idle` each return **exactly two** groups on **all 21**
>   frames — two feet, never merging, never splitting — and `ess/run` returns
>   **zero** on precisely the two frames whose lowest drawn row is 13 px above the
>   floor.
> - **The muzzle flash** — drawn pixels with r > 200, b > 140 and g < min(r, b) − 30.
>   Control: **zero** such pixels across every frame of `ess/idle`, `ess/walk`,
>   `ess/jump`, `ess/death` and `pro/hoverboard`. ⚠️ It is **not** silent everywhere
>   else: `pro/portal/f0015` returns **9 px** of pale pink where the vortex's flare
>   crosses the figure, and tiles 36–37 of that shot's 30 fps sheet return 1 px each.
>   Two orders of magnitude under a flash, but not zero — read the detector as
>   "a flash is hundreds to thousands of pixels", not as a yes/no.
> - **The gun** — drawn pixels with g > 100, g > r + 30, b > r + 15 and b < g + 40.
>   ⚠️ **This predicate is not gun-only.** The figure's hair is the same teal:
>   `head.png` satisfies it on **5,388** of its opaque pixels against `gun.png`'s
>   **6,459**, so a whole-frame reading is gun *plus* head. Control by compositing
>   the art at the sidecar's scale: 6,459 × 0.222973² ≈ **321 px** of gun and
>   5,388 × 0.222973² ≈ **268 px** of head, **589 px** together — and `ess/idle`
>   reads 599–631 across all 21 frames and `ess/aim` reads 608, so in both the gun
>   is **unoccluded** and the estimator is calibrated to within 5 %. To measure the
>   gun alone, split the teal at 45 % of the subject's box height: in `ess/idle` the
>   lower (gun) share is **322–338 px** on all 21 frames and the upper (head) share
>   is **272–293 px**, each stable to a few per cent. That split is what makes the
>   occlusion figures below mean something.
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
one.** 25 of the 40 are flush on all four edges — a **non-transparent** pixel touches
every border (no file in the set carries a fully opaque, alpha-255 pixel on a
border, so do not implement that test strictly). The **seven `portal-*` files** carry a true 1 px fully transparent border all
round, so `portal-bg`'s drawn part is 264 × 264 in a 266 × 266 image. The remaining
eight are lopsided: `front-shin` 1 px on the left only, `neck` 1 px on the right only,
`rear-bracer` 1 right and 2 bottom, `rear-shin` 1 left / 2 top / 4 bottom, `muzzle02`
3 at the bottom, `muzzle04` 2 at the bottom, `muzzle05` 2 right / 1 top / 1 bottom,
and `muzzle03` 4 left / 3 top / 2 right / 5 bottom. Anything that assumes a symmetric
border puts those out by half a pixel in one axis.

| Group | Files (size) | What they are |
| --- | --- | --- |
| Body, near side | `torso` 98×180, `head` 271×298, `neck` 36×41, `front-thigh` 45×112, `front-shin` 82×184, `front-foot` 126×69, `front-upper-arm` 46×97, `front-bracer` 58×80, `front-fist-closed` 75×82, `front-fist-open` 86×87 | the limbs nearer the viewer, in a dark charcoal kit with red boots, red knuckle plates and pale grey trim |
| Body, far side | `rear-thigh` 55×94, `rear-shin` 75×178, `rear-foot` 113×60, `rear-upper-arm` 40×87, `rear-bracer` 56×72 | the same limbs a size smaller and a shade darker — the far arm has no separate fist |
| Face | `goggles` 261×166, `eye-indifferent` 93×89, `eye-surprised` 93×89, `mouth-grind` 93×59, `mouth-oooo` 93×59, `mouth-smile` 93×59 | one pair of goggles and **two** eyes and **three** mouths to choose between |
| Gun and firing | `gun` 210×203, `muzzle01` 133×79, `muzzle02` 135×84, `muzzle03` 166×106, `muzzle04` 149×90, `muzzle05` 135×75, `muzzle-glow` 50×50, `muzzle-ring` 49×209 | a teal blaster, plus **five** numbered flash frames and two extra pieces of flare |
| Hoverboard | `hoverboard-board` 492×152, `hoverboard-thruster` 60×64, `hoverglow-small` 274×75 | a board, a thruster and a glow |
| Portal | `portal-bg` 266×266, `portal-shade` 266×266, `portal-streaks1` 252×256, `portal-streaks2` 250×249, `portal-flare1` 111×60, `portal-flare2` 114×61, `portal-flare3` 115×59 | the layers of a swirling blue vortex |
| Target | `crosshair` 89×89 | a small red ringed cross |

The Hoverboard and Portal groups only appear in shots `pro` has and `ess` does not.
The Target does not: the crosshair is drawn in `pro/aim`, and `aim` is a shot **both**
skeletons have — `ess`'s is simply without it. The crosshair stands detached from the
figure in exactly one frame of the whole reference, `pro/aim`; if it were ever drawn
*over* the figure elsewhere these frames could not tell you.

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
slide) (`death/f0029` reaches it too) or right of column **354** (`shoot/f0004`, the
muzzle flash), while a standing
figure occupies about 100 × 146 px in the middle. **Nothing is ever clipped** — over
all 132 committed `ess` frames the drawn extremes are x 23–354, y 18–340 inside
384 × 367, and over all 190 `pro` frames they are x 16–335, y 15–305 inside 384 × 358.

⚠️ **The second rate here is 30 fps, not the 24 fps the rungs below use**, and it is
deliberate. `Math.round(d × f)` at 30 puts every duration inside a window that
contains exactly **one** multiple of 1/30, which 24 does not: on the only assumption
these frames allow — that the values below are the true ones — a 24 fps set would
leave `ess/death` and `ess/shoot` with **two** candidates each, not one. It also
caught two durations the
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
2/255. The values sort into **0, 0, 0, 0, 1, 55, 77, 104, 302** — four exact
returns, not three — and then
**2,595, 3,551, 5,767, 5,898, 6,702, 8,338, 9,761, 10,781** — a factor of 8.6 across
the break, with nothing in between. The first group is 0.22 % of the frame or less.
The five loops are the gaits, the stance, the shot and the hoverboard, which is what
you would expect a game to hold on; the transitions and the one-shots are the others.

⚠️ **`ess/idle` and `ess/walk` do not return bit-exactly** (302 and 104 px). Only
one of their `pro` counterparts does — `pro/idle` at 0 px; `pro/walk` is 77 px, which
is small but not exact either. All four are still cycles; do not read the difference
as a structural fact.

📌 **Nothing is ever completely still except one frame pair in the whole reference.**
The quietest consecutive pair anywhere is `ess/shoot` f0 → f1, which is **identical**
— the shot holds for its first twelfth of a second. Everything else moves: the next
quietest are `pro/portal` f0 → f1 at **4 px** (the vortex's first speck, while the
figure itself has not moved at all), `pro/portal` f1 → f2 at **18 px**, and then
`ess/death` f25 → f26 at **24 px**.

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
oscillates about x ≈ 182 (178.8–184.9, first and last frame both 184.6) with no net
drift, and the last frame is the first again to within 104 px. ⚠️ **Nothing is drawn
under him** — there is no ground in any frame of either skeleton, so how the world is
meant to move past a walker on the spot is not something these frames say.

**The footfalls — the moment this rung is asking you to place.** Counting
ground-contact groups per frame: two on f0–f1, one on f2–f4, two on f5–f8, one on
f9–f10, two on f11–f12. A second group **appearing** is a foot landing.

- At 12 fps a foot lands between **f4 and f5** and again between **f10 and f11**.
- On the 30 fps sheet the same transitions fall between tiles **12 and 13** and
  between tiles **27 and 28**.
- Intersecting the two: **the first footfall is between 0.400 s and 0.417 s, the
  second between 0.900 s and 0.917 s** — the two are **half a second apart** to
  within the windows' own width, two steps per second on a 1 s cycle.

The swing foot leaves the floor between 30 fps tiles 4 and 5 (0.133–0.167 s) and
between tiles 20 and 21 — that departure is exactly what the group count dropping to
one measures, so a foot *is* off the ground for part of every step. What never
happens is the **figure** leaving the floor: the lowest drawn row stays in
**334–337** on all 13 frames, against a floor of 336.

📐 **A draw order the frames do decide.** The gun rides in the near hand and swings
with the arm. On the frames where it swings down and back it goes **behind the near
leg**. Measure the gun's own teal — the lower share of the split described in the
header, since the hair is the same colour — and it drops from **322–338 px**, the
unoccluded reading on all 21 frames of `idle` and on every `walk` frame where the gun
is clear, to **36 px at f6** and **47 px at f9**: about **one eighth** of it is left.
Over the same frames the head's share of the teal holds at **277–291 px**, so nothing
global is happening to the colour — one part is being covered and the other is not.
What survives at f6 and f9 is a sliver at rows 280–306, below and left of the near
knee, with the red-booted near leg drawn across it. It is being covered, not
foreshortened away. The leg is in front of the gun.

## `run` — the same idea with both feet off the ground

**0.6667 s, loops — and it returns to its first frame within 1 pixel.** Four shots
return exactly (`ess/shoot`, `pro/idle`, `pro/run`, `pro/shoot`), so this is the
fifth-tightest loop and the tightest in `ess` after `shoot`. Two strides, again
**on the spot** (centroid x 183.8–193.6, first and last frame both 191.1, no drift).

**There is a flight phase, twice.** The lowest drawn row is **323 on f2 and f6** and
**334–336 on every other frame** — the whole figure is **13 px ≈ 58 units** clear of
the floor, and the ground-contact estimator returns **zero groups** on exactly those
two frames and one or two on all the others. On the 30 fps sheet the estimator
returns zero on tiles **5**, **15** and **16** and nowhere else; tiles 4, 6, 14 and 17
still hold a 1–3 column toe inside the contact band, so read the flight as *about a
tile and a half*, twice, and not as the wider stretch a lowest-row reading alone
suggests.

**The footfalls**: a foot is back on the floor at **f3** and **f7** (12 fps) — one
flat contact each time, **21 columns at f3 and 14 at f7**, so the two landings are
not the same width — which the 30 fps sheet corroborates: contact returns at tiles
**6** and **17**, and the wide flat contact runs tiles 7–9 and 18–20. Four twelfths
of a second apart, one landing per stride.

## `jump` — no wind-up, a long hang

**1.3333 s, does not return** (3,551 px), though it ends very near where it began:
the last frame's box is (146, 200)–(249, 335) against the first's (146, 201)–(248, 335).

- **f0 is the crouch and it is the only frame of it.** The figure is **135 px tall
  against the 143–146 px he stands at in `idle`**, and one twelfth of a second later
  his lowest drawn row is already **302** — 34 px clear of the floor. There is **no
  anticipation to build; the shot opens on the launch**. (The 30 fps sheet says the
  same and says it by four tile pixels, not one: tile 0 is 45 px tall against tile
  1's 49. It is the crouch's *height* that is decisive, not the rise — the largest
  single-frame rise is **f1 → f2, 42 px**, and the largest single-frame change of any
  kind is the **89 px drop from f13 to f14**.)
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

**4.9333 s, does not return** (9,761 px). The longest shot in this rung — though not
on the ladder: rung 2's `tennis-ball` runs 25.8 s and rungs 3, 4, 5 and 6 all carry a
shot longer than this one. It is four distinct passages:

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
   x 23–131, which is the head-and-chest end, while nothing at all changes right of
   x 140 after f27 — the boots at x 145–175 never move again. The arm that lifts off
   the chest and waves is the **near** one, and the frames say so: the raised hand is
   an open fist, and the art ships a fist only for the near arm. The subject's top edge
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
row 269–270, **11–12 px ≈ 59–64 units** of clearance) and lands on f3 and f7;
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
**≈ 91 units across**, and `crosshair.png` is 89 px — so it is drawn at very close to
life size *if* one art pixel is one world unit, which is the Spine editor's default
for a region but is not something these pixels establish. The 91 units is measured;
the "life size" is the inference.

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

⚠️ The flare here reaches **below** the standing floor on **both** its frames — the
lowest drawn row is **296 on f1 and 305 on f2**, against 281 on the other seven.

## `hoverboard` — a 1 s loop with the feet off the ground

**1.0000 s, loops** (55 px). The figure rides a board; the board's underside, not his
boots, is what is near the floor, and the lowest drawn row cycles **263 → 280**, so
the whole rig rises and falls about **17 px ≈ 91 units** on the cycle while the box
height breathes between 124 and 140 px.

## `idle-turn` — the pivot

**0.2667 s, does not return** (5,898 px). Four frames at 12 fps, nine at 30. The
figure begins facing **left** — the gun's teal extends to the left of the body — and
finishes facing **right**, and the box shifts right as he turns: (167, 154)–(249, 281)
to (191, 160)–(272, 281). The lowest row is 281 on all four frames — he never leaves
the floor — but the feet do not simply stay put: f0 returns **one** ground-contact
group, 25 columns wide at x 205–229 (the feet are together), and f1–f3 return **two**,
spreading to x 191–248. The band's midpoint moves 217 → 220 over the whole turn, so
**he turns on the spot** even though the stance opens out.

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
2. **f3 → f9 — the vortex opens.** Its blue area climbs 262 → 378 → 1,000 → 2,806 →
   5,573 → 8,460 → **9,195 at f9** against a floor of ~200 (f2 is still only 218). It
   reaches full size by about **0.75 s** and then breathes between **6,496 and
   10,136** for the rest of the shot, with a second, larger maximum of 10,136 at f31
   just before it closes — not a settled plateau.
3. **f11 → f16 — he is taken through it.** He starts moving at f11; between f12 and
   f13 his centroid jumps from (54.1, 242.0) to **(103.5, 191.2)**, and f13–f15 have
   him tumbling head-down across the vortex's face.
4. **f16 → f21 — he comes out the far side and lands on his feet**, centroid
   settling at x ≈ 223 by f21. Total travel from start to rest is
   **≈ 170 px ≈ 913 units to the right.**
5. **f21 → f38 — he stands, the vortex closes.** He holds station (centroid x
   221.5–225.6) but is never still — `f37 → f38` still differs by 3,236 px. The vortex
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
- **Draw order, except two edges.** The frames decide that the near leg is drawn in
  front of the gun (`walk`, measured above) and that the figure is drawn in front of
  the vortex on every frame of `pro/portal` where they overlap — at f14 nearly all of
  his red kit falls inside the vortex's disc and every pixel of it is visible.
  Nothing else was found: over both skeletons **no pair of parts was caught visibly
  on one side of each other in one frame and the other side in another**, so these
  frames show no draw-order *change*. That is a search that came up empty, not a
  proof that none exists. ⚠️ Note where it bites — the obvious place a rig would need
  a change is `pro/idle-turn`, where the figure pivots from facing left to facing
  right, and that is exactly the place where a re-order and a mirror look identical
  in pixels.
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
  independently. Their frame counts agree at both rates on `aim`, `death`, `idle`,
  `jump`, `run` and `walk` — six of the seven shared names — and disagree on `shoot`
  (0.4000 s against 0.6333 s), but agreeing frame counts are not evidence of a shared
  timeline.
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
- **What the ground does.** `walk` and `run` are cycles on the spot, and no ground is
  drawn in any frame of either skeleton. Whether the world is meant to scroll past
  the figure, or the figure to be moved by something outside the animation, is not a
  fact these pixels carry.

## Verification notes — revision 1 → 2

Third-party pass, 2026-08-23, by an agent that did not write revision 1, working from
`bench/reference/spineboy/` and `examples/spineboy/images/` only. `examples/spineboy/export/`
and `bench/transcriptions/` were **not** opened; the repository's own source was read
(`src/render.ts` for the sampling rule, `bench/render_reference.ts` for the sheet
layout, `src/ladder.ts` and `cli.ts` for the stretch label), and none of it carries a
rung's answer.

**Method and controls.** Estimators were written from scratch, and every one was
scored against a control with a known answer before its output was used:

| Estimator | Control | Result |
| --- | --- | --- |
| floor row | recomputed from `frames.json`'s viewport, then against the lowest drawn row of every standing frame | 335.96 / 280.90 reproduce; standing frames read 336 / 281 |
| ground-contact groups | `ess/idle` and `pro/idle` (two feet, 21 frames each) and `ess/run` (two known airborne frames) | exactly 2 groups on all 42 stance frames; exactly 0 on `run` f2 and f6 |
| the same estimator **on a contact-sheet tile** | run against the 12 fps sheets of `ess/walk`, `ess/run`, `pro/walk`, `pro/run`, whose answers the full-size frames already gave | band [floor−3, floor+1] tile rows, 1-column gap: exact on 3 of 4 sets; **misses a contact narrower than ~5 frame columns** (`pro/walk` f11), which is the tile method's error bar |
| tile lowest row | every 12 fps sheet against its own frames, 320 pairs | within **1.33 tile px (4 frame px)** of the frame reading — enough for a 13 px flight, not for a 2 px one |
| muzzle flash | every one of the 322 committed frames | fires on `ess/shoot` f2–f4 and `pro/shoot` f1–f2 as revision 1 said — **and on `pro/portal/f0015`, 9 px** |
| the same detector on tiles | 12 fps sheets, where the answer is known | fires on exactly the same frames, at ~1/9 the pixel count |
| gun teal | `gun.png` and `head.png` composited at 0.222973 px/unit | **the predicate is not gun-only** — 6,459 art px of gun and 5,388 of hair, predicting 321 + 268 = 589 px against `ess/idle`'s 599–631 and `ess/aim`'s 608 |
| vortex blue | `pro/portal/f0000`, before anything opens | 202 px, the figure's own hair — the floor revision 1 quoted |
| red-kit centroid | `pro/portal` f0–f10, where the figure is known not to move | identical to **0.01 px** on all eleven frames |
| duration bracketing | `src/render.ts`'s `Math.round(duration × fps)` and the sidecar's own `sampled` counts | every sidecar `duration` equals `(sampled − 1) / fps` exactly, so the sidecar leaks nothing the frame count does not |

One defect in this pass's **own** machinery was caught by a control before anything
was believed: the tile ground-contact estimator was first run with the band taken
straight from the frame figure divided by three, which lost a foot on `ess/walk`'s
own 12 fps sheet — a set whose answer was already in hand. The band was widened until
it reproduced three of the four known sets, and the fourth is quoted above as its
error bar rather than hidden. No scripts are committed — rungs 6 and 8 did not commit
theirs either, and the methods are described here instead.

**Tally: 179 claims taken in turn — 146 verified, 31 corrected, 2 moved to
undecidable.** Where this pass and revision 1 disagree by less than the calibrated
error, revision 1's number was kept.

**Verified, and worth naming because they reproduce to the digit** — both duration
tables entire (all 19 frame counts at 12 fps, all 19 at 30 fps, all 19 windows, all
19 values on a 30 fps grid, and the two corrections 30 fps was chosen for,
`pro/idle-turn` 0.2667 and `pro/shoot` 0.6333); all 17 first-to-last differences at
2/255, none of which reproduce at 8/255; `ess/idle`'s 100–101 × 143–146 box, its
191 → 194 → 191 top edge, its 183.5 → 185.5 → 183.6 sway, its immobile feet (both
contact spans identical to within one column on all 21 frames) and its 3,157 px
quietest pair; `ess/walk`'s footfall counting frame by frame (2,2,1,1,1,2,2,2,2,1,1,2,2)
and its first footfall window; `ess/run`'s 323 px flight rows and 13 px ≈ 58 units;
`ess/jump`'s whole rise series 335 → 302 → 260 → 232 → 212 → 196 → 184 → 176 → 171 →
169, its apex across tiles 20–25, its 167 px ≈ 749 units of clearance, its
f13 → f14 at 10,811 px and its 192.8 → 179.5 → 190.6 drift; the whole of `ess/shoot`
(the identical f0/f1 pair, 166 / 1,659 / 717 px of flare, tiles 5–11 brightest at 9,
the 108 → 189 → 202 → 218 box out to column 354); the whole of `ess/hit`; `ess/death`'s
(177.8, 256.1) start, its 61 × 153 → 151 × 65 turn, its 9,658 px throw, its
5,942 / 5,120 / 5,337 / 4,567 / 3,220 settle, the 24–45 px stillness over nine frames
and the 1,590 px restart, the 276 → 265 → 273 top edge and the 620 / 667 / 859 px
tail; `ess/aim`'s 106 × 152 against 100 × 146 and 8,813 px; the connectivity census
(28 of 322 frames hold more than one component of ≥ 20 px — 26 `pro/portal`,
`ess/shoot/f0004`, `pro/aim` — and it holds under 4-connectivity as well as 8); both
skeletons' drawn extremes (x 23–354, y 18–340 and x 16–335, y 15–305); all 40 image
dimensions and every margin figure bar `muzzle03`'s; every figure in `pro/aim`
(4,223 px, the 17 × 17 mark at (274.1, 174.2) = world (299.0, 572.8), the muzzle at
world (202.0, 525.5), 97 units beyond and 47 above); `pro/shoot`'s
644 / 558 / 480 / 389 / 333 decay and its tiles 1–5; `pro/hoverboard`'s 263 → 280 and
124–140; `pro/run-to-idle`'s boxes; `pro/idle-turn`'s box shift and its left-to-right
turn (the gun's teal sits 11 px left of the subject centroid on f0 and 13 px right of
it on f3); and in `pro/portal` the motionless red-kit centroid, the four-pixel first
speck all in column 135, the 262 → 9,195 opening, the (54.1, 242.0) → (103.5, 191.2)
jump, the ≈ 170 px ≈ 913 units of travel, the 6,544 → 213 close and the 3,236 px last
pair.

**Corrected** (old → new):

1. **The gun estimator is not gun-only, and the `walk` draw-order figures are off a
   mixed mask.** `head.png` satisfies the teal predicate on 5,388 opaque pixels
   against `gun.png`'s 6,459, so `ess/idle`'s "599–631 px, the gun's unoccluded
   reading" is gun **plus** hair. Composited at the sidecar's scale the two predict
   321 + 268 = 589 px, which is what `ess/idle` and `ess/aim` read — both unoccluded.
   Split at 45 % of the box height, **the gun's own share is 322–338 px and falls to
   36 px at f6 and 47 px at f9**, not to 327 and 336, while the head's share holds at
   277–291. The conclusion survives and gets stronger: about **one eighth** of the
   gun is left, not half. The "bounding box gets taller" argument is also off the
   mixed mask and has been replaced by the head-share control.
2. **`ess/walk`'s second footfall is a tile later.** "Between tiles 26 and 27" →
   **between 27 and 28**; the group count is 2 on tiles 0–4, 1 on 5–12, 2 on 13–20,
   1 on 21–27, 2 on 28–30. The window follows: "0.867 s–0.900 s" → **0.900 s–0.917 s**,
   which puts the two footfalls exactly **half a second** apart on a 1 s cycle
   instead of 0.47 s apart.
3. **`ess/death` is not "by far the longest shot on the ladder".** It is 4.9333 s;
   rung 2's `tennis-ball` is 25.8 s, rung 4's `ball-catch` 10 s, rung 5's `speedy`
   6.5 s, rung 6's `arcs` 5.67 s and rung 3's `heavy` 5.33 s. It is the longest shot
   **in this rung**.
4. **`pro/shoot`'s floor control is wrong in two places.** The header's "281 on …
   all 9 of `pro/shoot`" and the body's "305 on f2 against 281 everywhere else" both
   miss f1: the lowest drawn row is **296 on f1 and 305 on f2**, 281 on the other
   seven.
5. **The muzzle-flash detector is not silent outside the two `shoot` shots.**
   `pro/portal/f0015` returns **9 px**, and tiles 36–37 of that shot's 30 fps sheet
   return 1 px each. The zero-control on `ess/idle`, `ess/walk`, `ess/jump`,
   `ess/death` and `pro/hoverboard` does hold.
6. **`ess/run`'s two landings are not the same width.** "A single flat contact of
   20–21 columns each time" → **21 columns at f3 and 14 at f7**.
7. **`ess/run`'s airborne stretch is narrower than the sheet was read to say.**
   "Tiles 4–6 and 14–17" → the contact estimator returns zero on tiles **5, 15 and
   16** only; tiles 4, 6, 14 and 17 still carry a 1–3 column toe in the band. The
   landing corroboration "tiles 7–8 and 17–19" → contact returns at tiles **6 and
   17**, with the wide flat contact on 7–9 and 18–20.
8. **`ess/jump`'s opening is not the largest rise.** "34 px clear of the floor, the
   largest single-frame rise in the shot" → 34 px clear is right, but the largest
   rise is **f1 → f2 at 42 px** and the largest change of any kind is the **89 px
   drop from f13 to f14**. The 30 fps sheet's agreement is worth four tile pixels
   (45 against 49), not one, so it can be quoted after all.
9. **`pro/idle-turn` does not have two ground-contact groups on all four frames.**
   f0 returns **one**, 25 columns wide at x 205–229 — the feet are together at the
   start — and f1–f3 return two, spreading to x 191–248. "The feet stay put" is
   therefore too strong; what holds is the lowest row (281 throughout) and the band's
   midpoint (217 → 220).
10. **The frames decide two draw-order edges, not one.** Revision 1's silence list
    says "except one edge" while its own `portal` section asserts the figure is in
    front of the vortex. The second edge is real and measurable: at f14, 157 of the
    figure's 185 red-kit pixels fall inside the vortex's filled disc and all of them
    are visible.
11. **`pro/portal`'s vortex does not settle at 7,000–8,800.** After it opens it
    breathes between **6,496 and 10,136**, with a second and larger maximum of
    **10,136 at f31** immediately before it closes. The opening series
    262 → … → 9,195 is **f3–f9**, not f2–f9 (f2 reads 218). The standing centroid
    band "222–226" → **221.5–225.6**.
12. **The Target art group is not `pro`-only.** "The last three groups only ever
    appear in shots `pro` has and `ess` does not" → the last **two**; the crosshair
    is drawn in `pro/aim`, and `aim` is a shot both skeletons have. Added: the frames
    can only say the mark stands **detached** in one frame — a crosshair drawn over
    the figure would not show.
13. **The 24 fps counterfactual overstates.** "At 24 fps `ess/death` still has three
    candidates and `ess/shoot` three" → **two each**, and only on the assumption the
    brief elsewhere refuses to make (that the grid is 30 fps). 30 fps is still the
    better second rate; the reason is now stated conditionally.
14. **Small numeric and wording corrections**: the sorted first-to-last values are
    **0, 0, 0, 0, 1, 55, 77, 104, 302** — four zeros, not three; "0.2 % of the frame
    or less" → **0.22 %** (302 / 140,928 = 0.214 %); "their `pro` counterparts do
    (0 and 77)" → only `pro/idle` returns bit-exactly, `pro/walk`'s 77 px does not;
    the third-quietest consecutive pair is **`pro/portal` f1 → f2 at 18 px**, ahead
    of `ess/death` f25 → f26 at 24; `ess/death`'s passage-4 difference boxes run
    **x 23–131**, not 24–131 (and nothing at all changes right of x 140 after f27);
    `ess/run`'s "tightest loop in either skeleton after `shoot`" → four shots return
    at 0 px, so it is the **fifth** tightest; `pro/run`'s clearance "≈ 60–64 units" →
    **59–64**; `muzzle03`'s margins "4 / 2 / 3 / 5" → **4 left, 3 top, 2 right,
    5 bottom** (unlabelled, the list reads wrong in the order its neighbours use);
    "an opaque pixel touches every border" → a **non-transparent** one, since no file
    in the set has an alpha-255 pixel on a border; column 23 is reached by
    `death/f0029` as well as `death/f0007`; the `ess`/`pro` frame counts agree on
    **six** shared names, `aim` included, not five. `ess/death`'s waving limb is now
    identified as the **near** arm on evidence rather than assertion — the raised
    hand is an open fist and the art ships a fist only for the near arm.

**Moved to undecidable** — "the ground is what moves under him" (`ess/walk`): nothing
is drawn under him in any frame of either skeleton, so how the world is meant to move
past a walker on the spot is not in the pixels, and it now sits in the silence list.
And `pro/aim`'s crosshair "drawn at very close to life size": the 17 px ≈ 91 units is
measured, but reading that as life size against `crosshair.png`'s 89 px assumes one
art pixel is one world unit — a Spine editor default, not something these frames
establish. The measurement stays; the inference is now labelled.

**Honesty-rule check.** Nothing was removed. The brief carries no bone names or
counts, no hierarchy, no key times or values, no curve handles, no timeline kinds, no
slot names, no setup pose and no stage size; the animation names, frame counts,
scales, background and durations all come from the committed `frames.json` sidecars
and the frames themselves, and every sidecar `duration` was checked to be exactly
`(sampled − 1) / fps`, so it states nothing the frame count does not. The art table
is measured off `examples/spineboy/images/`, which the authoring agent gets. One
passage was examined and left: §3's discussion of hit regions names attachment kinds,
but it takes them from `src/render.ts`'s own comment about what its rasteriser skips
and it explicitly declines to say whether the reference has any — it is a statement
about the renderer, not about the answer.

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
