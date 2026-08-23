# spineboy — attempt 1, the loop

- **date** — 2026-08-23
- **agent** — Claude Opus 5 (1M context), Claude Code / Agent SDK, fresh session, own
  `git worktree` (`bench/spineboy-run1`)
- **inputs** — [`bench/briefs/spineboy.md`](../../briefs/spineboy.md) **revision 2,
  third-party verified**; [`docs/AUTHORING.md`](../../../docs/AUTHORING.md) in full
  (§8, §9, §10 included); [`bench/runs/README.md`](../README.md);
  [`docs/LADDER.md`](../../../docs/LADDER.md) *How a rung is scored*, *The honesty
  rule*, the status table and the spineboy row; `examples/spineboy/images/` (40
  PNGs); `bench/reference/spineboy/ess/` (8 sets, 132 frames at 12 fps, sheets and
  two stills at 30 fps, `frames.json`); the repository's own source
  (`src/render.ts`, `src/rig.ts`, `src/types.ts`, `src/diff.ts`, `src/framing.ts`,
  `tools/plate.ts`, `tools/font5x7.ts`); the two runs this one was told to read for
  process, [`2026-08-23-rung8-1/`](../2026-08-23-rung8-1/) (README + LOOP) and
  [`2026-08-23-rung3-2/README.md`](../2026-08-23-rung3-2/README.md).
- **reference** — **not read.** Nothing under `examples/*/export/` was opened, and
  nothing under `bench/transcriptions/`. The `.atlas` files were not needed either:
  rigc emits its own atlas from the loose PNGs (brief, *Notes on the shape of the
  deliverable*). No other run's rig or motion spec was opened, no
  `bench/render_reference.ts`, no git history, no web search.
- **guide** — AUTHORING.md §10 in hand; this run is after the 2026-08-23 boundary.
- **profile** — `spine`
- **⚠️ two leaks inside standard inputs** — see §1. They are named there rather than
  buried, because a reader has to know which measures they touch.

---

## 1 — two standard inputs carry facts about the reference export

Recorded first because everything below was authored with them in context.

**§3.6 of `docs/AUTHORING.md` states the reference's `events` block outright**:
*"The editor's own spineboy export declares exactly `{"footstep": {}}` — an empty
object is the normal case, not a stub."* That is the answer to one of this rung's
six diff sections, in the guide the protocol requires the authoring agent to read in
full. It cannot be un-read.

What this run did about it: **authored the events from the brief anyway.** The brief
names three kinds of cue and pins each to a frame — footfalls in `walk` and `run`,
the gun firing in `shoot`, the landing in `jump` — and an animator given that brief
declares what those cues need. This rig declares **two** events, `footstep` and
`gunshot`. So `events.names` and `events.payloads` below still measure authoring
rather than transcription, and they are lower than they would be if the leak had
been used. `footstep` is a name any author would land on independently, which is why
the leak is small; it is still a leak, and §10.6's own rule — *conventions visible in
reference exports that no public page states are deliberately absent* — is the rule
§3.6 breaks.

**§3.4's bounding-box example is a plausible second one.** Its illustration is
`"head-bb": { "head": { "type": "boundingbox", "vertexCount": 6, "vertices": [-19.14,
-70.3, …] } }` — six vertices spanning roughly 300 × 280 units, which is head-sized
for a figure of this scale, under a placeholder named for a part this example ships.
Those numbers were **not** used: the polygon this run emits is measured off
`head.png`'s own alpha (§7). The *name* `head-bb` was adopted, and this run cannot
claim it arrived at it independently.

**A third, milder one, and it is in this run's instructions rather than in a
document**: `docs/LADDER.md`'s status table gives the spineboy row as *"`ess`: 18
bones, 20 slots, 8 animations"*. The brief withholds bone and slot counts on purpose
("It deliberately does **not** carry bone names, bone counts, the hierarchy…"), and
the ladder's own feature table publishes them. This run was told to read that row.
It was used as a **sizing check**, not as a design: the tree in §3 was built from the
art and the frames and then found to come to 18 and 20, which is the order in which
those two numbers appear in this log. A run that had built 15 bones would have gone
looking for the missing three, and that is the contamination.

---

## 2 — reading the frames: what the pixels decided before anything was built

Every number in this section is measured off `bench/reference/spineboy/ess/`, with
`frames.json`'s own viewport (`tools/lib.ts`), and the brief's controls reproduce
exactly: world y = 0 lands on image row **335.96**; `idle/f0000`'s subject box is
**100 × 146** with centroid **183.5, 262.0**; `aim/f0000` is **106 × 152**;
`hit/f0000` is **148 × 80** with centroid **132.0, 300.3**. Those four are the
brief's, to the digit, from an independent estimator, so the coordinate frame below
is the brief's coordinate frame.

**One art pixel is one world unit.** The setup fit (§4) carried a shared art scale as
a free parameter alongside every part's placement and it settled at **1.0004** — 0.04 %
off unity, on a fit whose own residual is worth several times that. The Spine
editor's default for a region is one art pixel to one unit; these frames now say so
too. Every unit figure below rests on it.

**The brief's own art table names the parts; the frames name three more things.**

---

## 3 — the assignment the brief gets wrong, and how the pixels settle it

The brief says twice that the gun is in the **near** hand — *"gun held across him in
the near hand"* (`idle`) and *"The gun rides in the near hand and swings with the
arm"* (`walk`). The frames say the opposite, and the brief's own `death` paragraph
says the opposite too.

1. **`gun.png` has a fist painted into it.** Its upper-left quarter is four dark
   knuckles over four pale fingers, and that is what is drawn at the grip in every
   frame that shows the gun. Held against the brief's own line that *"the far arm
   has no separate fist"*, the arm that holds the gun is the far one.
2. **The near arm's hand is a separate part and it is visible.** The hand hanging at
   the figure's own left in `idle` has red knuckles and splayed pale fingers, which
   is `front-fist-open`, and the art ships a fist only for the front arm.
3. **The brief's `death` paragraph reaches the same conclusion from the same
   evidence**: *"the raised hand is an open fist, and the art ships a fist only for
   the near arm"*.
4. **Measured.** Swapping which arm's art the two arms use, and refitting both,
   costs the composite objective **217 267 → 228 220** on `idle/f0000` — 5 % worse.
   The assignment this rig ships is the better one.

The brief's one *measured* draw-order claim survives either way and is what this rig
does: the near leg is drawn in front of the gun. On the far arm that is automatic.

---

## 4 — the setup pose, and why it is a composite fit rather than 18 template matches

Per-part template matching (`tools/match.ts`) located the confident parts of
`idle/f0000` — `rear-shin` at a trimmed score of 0.6, `front-shin` 1.7, `goggles`
2.0, `gun` 4.4 — and produced nonsense for every part the figure covers up:
`front-upper-arm` landed in the middle of a thigh, `rear-upper-arm` came back
upside down at −176°, `front-fist-closed` scored 18.8 on a leg. That is §8's first
trap in its character-rig form, and on a figure **every** frame is a frame where
parts touch.

So the setup pose is fitted as a **composite**: all 18 parts drawn together through
`src/render.ts`'s own rasteriser, scored against the reference PNG as a sum of
absolute RGB difference over the whole frame, and descended coordinate by
coordinate. Union MAE against `idle/f0000`:

| step | union MAE |
| --- | ---: |
| hand-placed first guess, from the confident matches and anatomy | 30.45 |
| composite descent | 11.87 |
| `mouth-smile` instead of `mouth-grind` (§5) | 11.53 |
| boots behind shins (§6) | **10.36** |

## 5 — three choices the brief calls unreadable, and the composite reads two of them

The brief's silence list says *"Whether the face art changes between shots … which
shot uses which is not readable here, and a glance that thinks it can read it is the
trap rung 2's brief fell into."* A glance cannot. A like-for-like composite can,
because it is not reading the reference — it is asking which of **its own** builds
lands closer. Refit per candidate, `idle/f0000`:

| slot | candidate | objective | union MAE |
| --- | --- | ---: | ---: |
| `mouth` | `mouth-grind` | 223 762 | 11.879 |
| | **`mouth-smile`** | **217 332** | **11.536** |
| | `mouth-oooo` | 224 368 | 11.912 |
| `eye` | **`eye-indifferent`** | **223 762** | **11.879** |
| | `eye-surprised` | 227 373 | 12.062 |
| `front-fist` | **`front-fist-open`** | **223 762** | **11.879** |
| | `front-fist-closed` | 264 156 | 13.981 |

The mouth is a 3 % separation on a part 6–8 px across and the fist is 18 %. The eye
is 1.5 % and sits under a translucent lens on every frame; it is recorded as a
preference, not a decision.

## 6 — a draw-order edge the brief does not have: the boot is behind the shin

Same method, on five frames of `idle` spread across the cycle, refitting the whole
hierarchy each time (`tools/orderfit.ts`):

| order | total objective over `idle` f0, f4, f8, f12, f16 |
| --- | ---: |
| as first authored | 1 733 634 |
| **`front-foot` before `front-shin`** | **1 701 560** |
| **`rear-foot` before `rear-shin`** | **1 704 555** |
| `front-thigh` after `torso` → before it | 1 899 609 |
| `rear-thigh` moved after `torso` | 1 793 464 |
| `front-shin` before `front-thigh` | 1 850 447 |

Both boots go **behind** their shins — 1.8 % and 1.7 %, and visible in the picture
once you know: the reference's boot is cut off at the top by the shin and this run's
first build drew the whole boot. The three losing rows are the edges confirmed the
other way: the near leg is in front of the torso, the far leg behind it, and a shin
in front of its thigh. Applying both foot swaps and re-testing settled the head, the
face and the hand: `goggles` after `eye` (worse the other way by 5 %), `mouth` after
`goggles`, `front-fist` after `front-bracer` (worse by 3 %).

## 7 — the flare, and the one place this rig carries a scale

`shoot`'s flash reaches 118 frame px where `muzzle01` is 133 art px ≈ 30 frame px at
one unit per pixel, so something scales it. Sweeping the scale under the template
matcher on the three frames the brief says carry a flare:

| frame | best art | best scale | trimmed score |
| --- | --- | ---: | ---: |
| `shoot/f0002` | `muzzle01` | **4.0** | 3.3 |
| `shoot/f0003` | `muzzle02` | **4.0** | 10.0 |
| `shoot/f0004` | `muzzle04` | **4.0** | 19.4 |

Four times, on all three, with three different plates. Combined with the brief's
30 fps reading — *"on tiles 5 through 11, brightest at tile 9"* — and the fact that
`muzzle03` is the largest of the five plates (166 × 106), the attachment timeline
this rig ships is `muzzle01` at 0.1667 s, `02` at 0.2333, `03` at 0.3 (tile 9, the
brightest), `04` at 0.3333, `05` at 0.3667 and **null at 0.4**. It reproduces all
three 12 fps observations and leaves no tile of 5–11 without a flare.

## 8 — the loop proper: four things had to change before a character would fit

The authoring loop here is not `build`-and-read-the-report — the gate was green on
the first compile of both specs and stayed green. It is **fit, render back, look**,
which is §9's loop run by hand because the poses have to exist before there is
anything for `check` to read. Four defects were found that way, in this order, and
each is a thing the gate cannot see.

### 8.1 — a free per-part fit comes apart on a character

The first attempt fitted every part's own centre and rotation per frame, warm-started
from the frame before. On `walk` it produced, by frame 11, a gun pointing at the
floor, a bracer floating clear of the body, and legs crossed through each other — a
picture whose objective was *better* than the pose that is actually there, because
19 parts × 3 handles can pay for a wrong limb with a right silhouette somewhere else.

⇒ **fit the hierarchy, not the parts.** The free parameters became exactly what the
motion spec can hold: one translate on `hip` and one local rotation per bone,
19 numbers. A limb then has nowhere to go that is not on the end of its parent.

### 8.2 — the hierarchy could not reach the pose, and the joints were why

With the joints taken from the parts' overlap, `idle` fitted to 10.3 union MAE on the
frame the setup pose was fitted to and **23.9** eight frames later, on a shot whose
whole motion is breathing. Letting the *fitted* parts off the hierarchy by a few
units — a short relax, starting from a connected pose — recovered it to **14.6**. A
gap that a relax closes is not a pose the rig cannot reach; it is a pivot in the
wrong place.

⇒ **solve the joints.** For a parent and a child, the joint is a point `a` fixed in
the parent's frame and `b` fixed in the child's with `R(θpᶠ)a + tpᶠ = R(θcᶠ)b + tcᶠ`
on every frame — linear in `(a, b)`, two rows per frame, four unknowns, one
least-squares solve over all 132 frames with two reweighting rounds to drop the
frames where a part was covered up. The residuals say which joints the frames
actually pin:

| joint | solved | rms |
| --- | --- | ---: |
| `front-shin` → `front-foot` (ankle) | −98.8, 27.0 | **4.65** |
| `front-upper-arm` → shoulder | −31.0, 324.7 | 5.49 |
| `rear-bracer` → `gun` (the grip) | 69.9, 255.6 | 5.82 |
| `front-bracer` → `front-fist` (wrist) | −103.9, 275.1 | 6.10 |
| `rear-shin` → `rear-foot` | 67.5, 40.5 | 6.77 |
| `front-upper-arm` → `front-bracer` (elbow) | −72.9, 301.0 | 7.76 |
| `front-thigh` → `front-shin` (knee) | −41.8, 143.4 | 9.33 |
| `torso` → `head` | −10.5, 406.3 | 9.63 |
| `rear-upper-arm` → `rear-bracer` | 30.6, 289.1 | 10.32 |
| `rear-thigh` → `rear-shin` | 60.2, 174.6 | 11.20 |
| `torso` → `rear-thigh` | −24.8, 219.4 | 11.81 |
| `torso` → `front-thigh` | −43.0, 225.5 | 12.29 |
| `torso` → `rear-upper-arm` | −4.1, 327.1 | **13.15** |

The near limbs solve to a pixel (4.65 units ≈ 1.0 frame px); the far arm, which is
behind the torso on every frame of every shot, solves to three. `hip` is the midpoint
of the two hip joints and `neck` is placed by hand under the collar, because neither
has a part of its own to be measured against.

### 8.3 — the free relax is not a diagnostic, it is the initialiser

The same free placements answer a second question for nothing. An attachment sits on
its bone at a **constant** local rotation, so a part's world rotation *names* its
bone's world rotation: no search. Projecting the free placements back onto the
hierarchy and refining from there, instead of carrying the previous frame forward,
moved every shot at once — `aim` 42.9 → 26.6, `shoot` 41.8 → 26.8, `walk` 39.2 → 30.9,
`jump` 44.2 → 39.2 union MAE. Both starts are tried per frame and the better kept,
because they fail in different places: the projection is right wherever the relax
found the part, and carrying the previous pose is right wherever it did not.

### 8.4 — the descent found a gauge and walked 180° down it

`hip` carries no attachment and everything that moves hangs under it, so turning the
hip by δ and turning each of its children back by δ **changes no pixel**. A
coordinate descent walks that for free — it zig-zags up a curved valley one
coordinate at a time — and this run watched `walk/f3` reach

```
hip +181.3°   torso −184.3°   front-thigh −150.6°   rear-thigh −199.8°
```

whose *net* world rotations are −3°, +31° and −19°: the picture was right and the
numbers were unusable. A rotate series that swings 180° between two keys does not
interpolate, it spins the figure through a whole turn.

An L1 penalty on every delta (45 objective units per degree) did **not** fix it —
the walk carried on, one accepted step at a time, each buying more in pixels than it
cost. What fixed it is exact: minimising `|hip+δ| + Σ|childᶜ−δ|` is a
one-dimensional L1 problem whose optimum is the **median** of the four values, so the
gauge is removed outright at every level of the descent with the pose unchanged.
After it, `walk`'s hip sits inside ±5° on every frame and the torso inside ±9°.

⚠️ It cost a point of MAE (`walk` 30.7 → 33.8): collapsing the gauge lands the
descent in a different local minimum. That is the right trade and it is worth saying
which way it goes — **the fit got slightly worse and the animation got usable.**

## 9 — three attachment choices, measured over whole shots

`tools/alts.ts` holds the fitted pose still, swaps one attachment, and sums the
objective over every frame of a shot. Nothing about the reference skeleton is opened;
it compares two of **my** builds against the same frames.

| shot | `front-fist` | margin | `mouth` | `eye` |
| --- | --- | ---: | --- | --- |
| `idle` | **open** | 8.4 % | smile | indifferent |
| `walk` | **closed** | 1.6 % | smile | indifferent |
| `aim` | **closed** | 1.3 % | smile | indifferent |
| `run` | **closed** | 0.7 % | grind by 0.3 % — read as a tie | indifferent |
| `jump` | open | 0.2 % | smile | indifferent |
| `shoot` | open | 0.05 % | smile | indifferent |
| `hit` | closed by 0.04 % — a tie | | grind by 0.04 % — a tie | indifferent |

So the setup pose shows the open fist (`idle` decides it, and by an order more than
anything else here), and `walk`, `run` and `aim` carry a one-key attachment timeline
that closes it. The mouth is `mouth-smile` throughout and the eye `eye-indifferent`
throughout; every eye margin is under 1 %, and the eye is under a translucent lens on
every frame of the reference, so it is recorded as a preference rather than a
finding.

## 10 — two defects `check` found that the fit could not

Run against `bench/reference/spineboy/ess` on the first complete build:

- **`shoot` f0 → f1 is a hold and mine was not.** `check`'s per-frame column:
  *"1 of 5 adjacent pair(s) change by a different amount than the reference does;
  worst f0001, yours moved 862 px where the reference moved 0."* The brief says this
  pair is the only motionless one in the entire reference, and a per-frame fit has no
  way to know that — it lands two slightly different poses and both look right. The
  hold is authored now: `shoot`'s second sample takes the first's pose, which the key
  reducer writes as two keys of equal value. That is §10.3's *"does not repeat a
  value"* deliberately overridden, because without the second key there is no hold.
- **the flare reached 8 px past anything in the reference.** `check`'s framing block:
  *"after the fit your shot still covers 9.5 px wider and 6.4 px taller"*. The
  candidate's own drawn extent in `shoot` ran to column **362** against the whole
  reference set's rightmost **354**. The muzzle attachments had been placed at "half
  the plate's scaled width" out along the barrel — a guess. Measured instead (LOOP §7
  gives the plate and the scale; the offsets come back through the fitted pose's own
  muzzle transform) they are 171, 220 and 243 units out, not 266, 270 and 298.

## 11 — the tolerance dial, turned and read

Rung 8's clearest own-goal was aiming at a sub-pixel tolerance and paying for it in
keys. `tools/keysweep.ts` turns the dial and reads it — emit, compile, render the
compiled animation back at the frames' own rate, over all 132 frames:

| tolerance | timelines | keys | mean MAE | worst |
| ---: | ---: | ---: | ---: | ---: |
| 0.4 px | 140 | 1386 | **32.18** | 63.2 |
| 0.8 px | 140 | 1198 | 34.87 | 71.2 |
| 1.5 px | 140 | 1036 | 37.30 | 72.8 |
| 2.5 px | 140 | 908 | 39.34 | 72.8 |

The fitted poses themselves average **31.4** over the same frames, so at 0.4 px the
key reduction costs 0.8 MAE and at 2.5 px it costs 8. **0.4 px shipped.** Unlike rung
8, the density is not the own-goal here — `bench` came back `key_counts` 639/1414,
which is the same order as the reference rather than twice it.

## 12 — the finish line

```
bun cli.ts bench spineboy --candidate bench/runs/2026-08-23-spineboy-1/ess/spine \
  --json bench/runs/2026-08-23-spineboy-1/ess/bench.json
```

Run **once**, at the end, with the brief's own command line. Neither spec was edited
afterwards. One thing *was* touched after `bench`: `tools/model.ts` carried a type
assertion `tsc` refused, and the fix is recorded here rather than quietly made —
re-running both emitters produced files **byte-identical** to the ones `bench` read,
which is the only claim that matters. The summary is quoted verbatim in [`README.md`](README.md), together with
the ⚠️ about the `pro` line, which is this `ess` candidate diffed against the other
skeleton and measures nothing.

## 13 — what a next attempt should do differently

1. **Spend the compute on starts, not on descent.** Every plateau this run hit was a
   local minimum a better start walked straight past: the projection (§8.3) bought
   more than any number of extra passes did. Basin hopping — a handful of jittered
   restarts per frame, keeping the best — is the obvious next thing, and it is the
   only change likely to move `hit`.
2. **Anchor the feet.** The boots are the most distinctive thing in the frame (a
   bright red blob against a light backdrop), the brief gives their contact frames to
   the frame, and a per-frame foot position would constrain each leg chain from the
   far end. This run used the boots only as pixels inside a whole-figure objective.
3. **Fit the setup pose against more than one frame.** Everything here is measured
   relative to `idle/f0000`, and the two shots that fit worst (`hit`, `run`) are the
   two furthest from it.
4. **Look for the draw-order timeline in `death`.** `bench` says one animation has one
   and the brief's search came up empty; a like-for-like sweep (§6's method) over
   `death`'s roll, rather than over `idle`, is where to look.
