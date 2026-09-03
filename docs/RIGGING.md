# Authoring a hierarchy — bones, pivots and chains

**Read this when the request is a skeleton rather than a movement.** It is written
for an agent that has been handed loose part PNGs and has to decide how many bones
there are, where each one sits, what hangs off what, and which of those decisions
the frames can check.

[AUTHORING.md](AUTHORING.md) is the two file formats, the emission rules and the
failure map — read it first and keep it open; this page never restates a field it
documents. [MOTION.md](MOTION.md) is what goes *between* two poses once the
skeleton exists. This page is the part before both of them, and the part neither
has: **the structure itself, and which of its numbers are measurements.**

🚨 **Nothing here grades a hierarchy, and the reason is different from MOTION's.**
MOTION cannot grade a movement because a movement is a judgement. A hierarchy is
not a judgement — it is either the structure the pictures were made with or it is
not — and it is *still* ungraded, because **the pixels are nearly blind to it.** A
rig with its head off its torso passes the gate ([README](../README.md)). A rig with
every joint in the wrong place reproduces the setup pose *exactly* and pays for the
error somewhere in the movement, where it reads as an ordinary residual. The
instruments that see structure at all are two, they are named in **§11**, and
neither of them is a pass bar.

- The two spec files, field by field: **AUTHORING §1–§4**; the bone list itself is
  **§3.2**, the constraints **§3.5**, and `invariants` — where a hierarchy claim
  that the artifact cannot carry gets written down — is **§3.7**
- Named failures, and the file each one points at: **AUTHORING §5–§6**
- Reading a pose out of a picture with no rig yet: **AUTHORING §11** (`rigc pose`)
- Reading the parts of that picture `pose` refuses, *through* a rig you already
  have: **AUTHORING §12** (`rigc chainfit`). It is the one instrument that answers
  a question about structure from a picture, and **§12.5** is what it cannot see
- Fitting a whole figure's pose to a frame, and the pivot arithmetic that decides
  whether it converges: **AUTHORING §8.1**
- Solving a pivot from two poses, and the conditioning that decides whether the
  answer means anything: **MOTION §3.9**
- Moving a pivot inside a skeleton **somebody else authored**, and what the
  instruments say about it: **[INGEST.md](INGEST.md) §4.1**
- The conventions an editor user follows without being told — one image per
  attachment, draw order keyed rather than re-parented, gauges: **AUTHORING §10**
- If the figure is a **face**, the hierarchy has a closed form and
  [FACE.md](FACE.md) §3 and §7 are it
- If you are the *person operating* an agent rather than the agent:
  [PROMPTING.md](PROMPTING.md)

📎 **Where the lessons come from.** Every section below is a stumble that happened
more than once, ranked by how often. Most of them are already codified in the
sections listed above, and where a figure exists only in the record of the run that
found it, that run is cited — as **provenance for a reader of record**, in
AUTHORING §0's sense, not as an input to be followed. The figures produced *here*
are re-derived on the fixture in the [appendix](#appendix--the-figure-this-page-measures-on)
and every command on this page was re-run from it verbatim.

🔒 **So this page is not a ladder run's reading, and AUTHORING.md deliberately does
not link it.** An allowed-reading surface has to be **closed under reading**, and
the citations below go into `bench/runs/`, which is on a run's forbidden list —
`bench/runs/README.md`, *What a run may read*, is the copy that binds. Everything
here that a run needs is in **AUTHORING §8.1**, **§10.3** and **MOTION §3.9**, which
are allowed; what this page adds is where those rules came from and what they look
like while they are being broken. If a run is handed this file anyway, that is a
prompt defect rather than a decision, and the maintainer's call to make.

---

## 0. The normal form

**A hierarchy is decided in an order, and three of the decisions invalidate work
made behind them.** That is the whole reason this page has a shape. A wrong easing
costs one edit; a wrong pivot costs every pose fitted under it.

```
the art          →  what the parts are, and where each one's joint is DRAWN
  ↓
the tree         →  how many bones, what hangs off what          §5 §6.5 §10
  ↓
the pivots       →  where each bone sits                         §1 §2
  ↓ ⚠️ moving one of these invalidates every pose fitted under it — §3
the reach check  →  can each chain get to the extremes the shot visits?   §6.1
  ↓ ⚠️ failing this invalidates every pose fitted under it — §6.1
the gauges       →  which parameters the pixels cannot see at all  §4 §11
  ↓ ⚠️ folding one of these AFTER keying re-writes every key
the keys         →  MOTION.md
```

⭐ **The three ⚠️ rows are the argument for doing this at all.** Each one is cheap
arithmetic before the first fit and a re-run of the whole shot after it. Two of the
three are stated in AUTHORING §8.1 as *"do this per chain, before its first fit,
because the surgery to fix it invalidates every pose already fitted"* — this page's
§3 and §6.1 are what that costs when it is skipped.

### 0.1 What this page will not do for you

Three fields of a bone are **not in any picture**: `parent`, `length`, and
`inherit`. Whatever you write for them is reasoning, and every honest run in the
corpus says so out loud rather than reporting them as read. §11.1 is the list.

---

## 1. Where a bone goes: on the joint, with the art pushed out

**Put the bone at the joint and give its attachment an offset. Do not centre the
bone on the art.** This is the single most repeated structural decision in the
corpus — seven independent records state it, and one of them states it as the
reason a whole instrument works at all.

⭐ **The reason is not tidiness, it is observability.** Art centred on its own
pivot *turns in place*: the drawing rotates, its centre does not move, and the
silhouette of anything roughly symmetric barely changes. A search over that bone's
one angle moves almost nothing, so **a wrong angle costs almost nothing** and the
number cannot say which way to go. The `chainfit` fixture says it in one comment,
beside the offsets it exists to make visible:

> *"Every limb attachment is OFFSET from its bone, and that is what makes the hinge
> visible: art centred on its own pivot turns in place, so a search over one angle
> would move nothing and a wrong hinge would cost nothing either."*
> — [`selftest.ts`](../selftest.ts), the chain-fit fixture

⇒ **A correctly placed pivot also collapses the spec.** A pendulum whose bone sits
on its hinge needs one `rotate` track and no translate at all; the same part with
its bone at the drawing's centre needs a rotate *and* a translate that traces the
arc, and the two have to agree on every key. AUTHORING §10.3's gauge rule and this
one are the same rule read from two ends.

### 1.1 The offset along the bone is its own parameter, and it has its own minimum

⚠️ **"On the joint" is a direction, not a number.** Where a part's own joint sits
*inside its drawing* is frequently not visible — the joint is under the part above
it — and the offset that follows is then a parameter you sweep rather than measure.
It is worth sweeping: on one shot it was **the single largest fidelity lever in the
whole run**, and the art's own rim was 48 units away from the answer.

| Record | The parameter | What the sweep read |
| --- | --- | --- |
| rung 8, second attempt | where a trail's blunt end sits relative to the ball it comes out of | 0 → 2.70, **−48 → 1.86**, −99 → 4.11 (mean window residual); frame 0 alone 4.96 → 1.35 |
| rung 8, first attempt | where a chain's first bead sits below its hang point | 0 → 2.762, **30 → 2.497**, 49 → 2.642 (window MAE), re-run at 26/28/30/32/34 |
| rung 1, second attempt | where a cast shadow's scale pivot sits below its own centre | residual at the fitted offset 0.020–0.078 against **0.648–1.519** at offset 0, on four shadows independently |

⭐ **The rung-1 row is the one to internalise, because the fitted offsets agreed
with each other.** Four shadows, four independent sweeps, and every answer landed
at **0.14–0.16 of that art's own height**. Agreement across four parts is a
measurement; one part's minimum is a fit.

### 1.2 Two ways to point a bone at its own art, and neither is checkable

A bone's local **+x** is a real direction with real consequences (§9.2), and art
is not always drawn along it. Two spellings, and the frames decide between them
never:

- **Omit `length` and let the bone point away from the art.** Nothing observable
  depends on it unless a constraint reads the axis.
- **`rotation: 180` on the bone and `rotation: 180` on the attachment to cancel
  it**, so the bone points at its own mass — at the cost of two emitted fields.

> *"Neither is checkable from the frames."* — rung 3's first attempt
> ([`2026-08-23-rung3-1`](https://github.com/firejune/rigc/blob/main/bench/runs/2026-08-23-rung3-1/LOOP.md) §11)

⇒ Pick one, and say in your log that you picked it. AUTHORING §10.1's naming
convention is the same shape of decision and is worth far more (it decides five of
`bones`'s eight measures), so spend the log line there first.

### 1.3 🚨 An attachment on a bone you scale-key must sit at that bone's origin

**An attachment offset scales with its bone.** A muzzle flare 67 units out on a
bone keyed to 4× lands **268** units out, off the edge of the figure — and the
build is green, because nothing in the format says an offset was meant to be
rigid.

> *"the muzzle placeholders carried their genrig offsets, and **an attachment offset
> scales with its bone** — at 4× the 67-unit offset became 268 … an attachment on a
> bone you scale-key must sit at that bone's origin, or the offset rides the
> scale."*
> — spineboy attempt 4
> ([`2026-08-28-spineboy-1`](https://github.com/firejune/rigc/blob/main/bench/runs/2026-08-28-spineboy-1/LOOP.md) §8)

⇒ This is the one exception to §1's rule, and it is not a contradiction: a bone
whose **scale** is the animated property is not a hinge, so there is no hinge to
make visible. Put the art at its origin and let a *different* bone carry the
placement.

---

## 2. A pivot in the wrong place does not look like a wrong pivot

**This is the most consequential failure on the page, and it recurs in five of
seven from-zero attempts at the same figure plus five of the rung runs.** It is
codified in AUTHORING §8.1 and MOTION §3.9; what those two do not say is what it
*looks like* while it is happening, which is: like a search that is not converging.

### 2.1 The four signatures

None of them is an error message. Each one is a number that reads as ordinary.

| Signature | What it actually is | Record |
| --- | --- | --- |
| **A gap that letting the parts off the hierarchy closes.** `idle` fitted to 10.3 union MAE on the frame the setup pose came from and **23.9** eight frames later; a short relax off the hierarchy recovered it to **14.6** | *"A gap that a relax closes is not a pose the rig cannot reach; it is a pivot in the wrong place."* | spineboy attempt 1 ([`2026-08-23-spineboy-1`](https://github.com/firejune/rigc/blob/main/bench/runs/2026-08-23-spineboy-1/LOOP.md) §8.2) |
| **A fitted centre that drifts monotonically with the fitted scale.** The per-frame fits wanted each shadow's centre 8–12 units lower whenever the shadow was small | a part scaling about a pivot below its own centre — *"a pivot you have not modelled, not motion you have measured"* | rung 1 second attempt ([`2026-08-26-rung1-1`](https://github.com/firejune/rigc/blob/main/bench/runs/2026-08-26-rung1-1/LOOP.md) §2.3) |
| **A knob resting exactly on its bound, on one orientation only.** `torso.x` pinned at −35.0 against a ±35 box on the lying frames and nowhere else | the optimum is outside the box, because a pivot error `e` needs a compensation `−R(θ)·e` that grows with the local angle — *"invisible upright, saturating in the lying poses"* | spineboy attempt 5 ([`2026-08-28-spineboy-2`](https://github.com/firejune/rigc/blob/main/bench/runs/2026-08-28-spineboy-2/LOOP.md) §3) |
| **An exact fit with no angular spread.** Two ankle joints solved at **rms 0.00 px** with a relative-angle spread of **0° and 2°** | a perfect fit to a system with no unique answer | spineboy, 2026-09-03 first attempt ([`2026-09-03-spineboy-1`](https://github.com/firejune/rigc/blob/main/bench/runs/2026-09-03-spineboy-1/LOOP.md) §3.3) |

🚨 **The last one is the trap in its purest form: a zero residual reads as success
in every other context on this toolchain.** Here it means the estimator was handed
a rank-deficient system and returned one of its infinitely many answers.

### 2.2 What identifies a pivot is a change in relative angle across the joint

**Not the number of frames. Not the number of shots.** AUTHORING §8.1 states the
rule and MOTION §3.9 gives it a determinant; both are worth quoting because they
are the same fact measured by two different instruments.

From the fit side (AUTHORING §8.1):

> *"a **pivot** — the point one bone turns about relative to its parent — is
> identified only by frames whose **relative rotation across that joint actually
> differs**. So a spread can draw frames from every single shot, satisfy the
> paragraph above to the letter, and still be **ill-conditioned**."*

From the two-pose side (MOTION §3.9): the 2×2 solve's determinant is
`|det| = 4·sin²(Δ/2)` in the *change* of relative angle Δ, so a reading error in
the placements is amplified by about `1 / (2·sin(Δ/2))` — **0.8× at Δ = 80°, five
times at Δ = 11°**, and nothing reports it.

⭐ **And here is the measurement that says the two agree.** Attempt 5's
triangulation of one chest joint, solved from template matches over 18 frames
across all eight shots:

> *"⭐ upright-only rows re-solve to p = (−0.4, 68.7) with residuals 0.9–3.0 — a
> 21-unit-different answer that fits the upright frames just as well. The joint is
> ill-conditioned without the lying poses, which is how the inherited triangulation
> (idle zoom-read) went wrong without any frame saying so."*
> — [`2026-08-28-spineboy-2`](https://github.com/firejune/rigc/blob/main/bench/runs/2026-08-28-spineboy-2/LOOP.md) §5

Two answers 21 art units apart, at residuals that do not separate them. That is
what *ill-conditioned* means with a picture attached.

### 2.3 The conditioning check, in three forms

**Whichever estimator you used, re-run it with the data disturbed and see how far
the answer moves.** All three of these are cheap and all three appear in the
record:

1. **Perturb the inputs.** MOTION §3.9's own prescription: re-solve from placements
   pushed by a pixel. On one figure this was the only thing separating a usable knee
   from an unusable one — **29.0 px of pivot movement for 1 px of placement noise**,
   at a closure rms of 0.91 px that looked fine.
2. **Drop the diverse rows.** AUTHORING §8.1's: *"re-solve the joint from a subset
   that excludes the diverse configurations and see how far the answer moves. If it
   moves a long way at comparable residuals, the diverse frames were carrying the
   whole identification."* ⚠️ **No run in the corpus has performed this one as a
   check** — attempt 5 performed the *unconditional* version of it by accident and
   that is §2.2's 21-unit result, which is what a deliberate subset test is designed
   to produce on purpose. It is prescribed, cheap and unexercised.
3. **Look at the spread of relative angle directly**, before believing any residual.
   The table that made this legible ranked ten joints by that spread, and the two
   rank-deficient rows were exactly the two with 0° and 2° of it.

📌 **The three are not interchangeable.** (1) tells you how noisy the answer is,
(2) tells you *which frames* the answer is made of, and (3) tells you whether the
question was well posed at all. (3) is free.

### 2.4 🚫 The repair that looks obvious is inert

**A structural descent that holds the fitted poses fixed cannot recover a
mis-triangulated pivot.** AUTHORING §8.1 states this and it is worth restating
here, because it is the first thing anybody tries:

> *"the per-frame poses were fitted against the wrong pivot, so they have already
> absorbed its error. Move the pivot with those poses held and every frame gets
> worse; hold the pivot and refit the poses and they re-absorb it. **The gradient at
> fixed poses points nowhere.**"*

⇒ And multi-start does not help either, for the reason §8.1 gives: *"the defect is
not a basin you failed to reach, it is a parameter the objective is no longer a
function of."* The repair is a **different estimator** — triangulate the joint from
part matches across configurations, then refit the poses — not more of the same
search.

### 2.5 The configurations that make a trunk joint observable

⭐ **"Different configurations" is a property of the shot list, not of the frame
count.** AUTHORING §8.1's own words: *"A figure standing, walking and running may
hold one joint at nearly the same angle throughout; a figure **lying down**, or
inverted, or reaching across itself, is what makes that joint observable."*

What the records add is the concrete list of what worked:

- **lying and inverted poses** conditioned the trunk joints on the character corpus
  — *"`death` and `hit` supply the lying and inverted configurations §8.1 asks for,
  and they are what makes any of it conditioned."*
- **a parent that turns all the way over** conditioned a chain's top joint on rung 4,
  after the same fit on the wave shots alone *"converged to 5 px below the disc with
  a residual of 0.06 px — a tidy, confident, wrong answer."* The fix was the second
  shot, where the disc turns through 360°.
- ⚠️ **and it is the parent's rotation that matters, not the child's travel.** Rung
  4's failed fit was *"a circle fit to an arc that spans 11.6 px in x and 0.95 px in
  y"* — plenty of motion, almost none of it about the joint.

### 2.6 When the frames do not decide: a prior with a measured width

**Say so, and say how wide.** On a figure whose limbs are eight or nine frame
pixels across, one run swept 21 structural knobs against a 14-frame spread and
found that **every one of them measured a basin at the sweep's own cap** — ±4.5 to
±9 units, or ±1 to ±2 frame pixels:

> *"On this figure the joint offsets are **weakly identified at the scale a frame
> can see**, and the honest reading is that they are a prior with a measured width
> rather than a measurement."*
> — [`2026-09-03-spineboy-2`](https://github.com/firejune/rigc/blob/main/bench/runs/2026-09-03-spineboy-2/LOOP.md) §3.5

⇒ That sentence is the deliverable when the pixels are silent. It is not a hedge:
a width is a number, and the next attempt can tell whether its own change is inside
it. AUTHORING §8.1 asks for the same thing in one line — *"if the shot list has
only one configuration, say in the log that the pivot is a prior."*

---

## 3. Moving a pivot, and the row that gets forgotten

[INGEST.md](INGEST.md) §4.1 is the recipe: which objects change when a bone's
origin moves, and the arithmetic invariant that says the compensation is right. It
is the recipe this section builds on, and it says which row is the dangerous one:

> *"⚠️ **The child-bone row is the one that gets forgotten**, and it fails quietly:
> the re-pivoted bone's own art lands correctly and everything hanging off it is
> displaced by exactly the vector you moved."*

⚠️ **And INGEST's worked example has no children** — *"this bone has no children"*
— so the row it warns about is the one row it does not demonstrate. This section
demonstrates it.

### 3.1 The edit, on a bone with a child

The fixture's `arm` bone sits at the top of its own plate, and the ask is INGEST
§4.1's: *swing from the middle, not the end.* The plate is 30 long, so the pivot
moves **+15 along the bone's own +y**, and `arm.rotation` is 0, so the parent-space
and bone-space vectors are the same one. Three objects change:

```diff
-  { "name": "arm",  "parent": "trunk", "x": 9, "y": 36 },
+  { "name": "arm",  "parent": "trunk", "x": 9, "y": 51 },     ← the bone: to the new pivot
-  { "name": "hand", "parent": "arm",   "x": 0, "y": -26 },
+  { "name": "hand", "parent": "arm",   "x": 0, "y": -41 },    ← the CHILD: same vector, opposite sign

-  "arm": { "arm": { "image": "arm.png", "y": -15 } },
+  "arm": { "arm": { "image": "arm.png", "y": -30 } },         ← the attachment: same vector, opposite sign
```

**Nothing in the motion spec changes.** That is the entire point of the edit:
`rotate` keys are angles about the origin, and the origin is what moved.

The arithmetic invariant first, before rendering anything — the world position of
each affected object at the setup pose, `bone(x, y) + R(bone.rotation)·att(x, y)`
composed down the chain:

```
              arm bone        arm att      arm art centre    hand bone
original    (109,  76)      (0, −15)        (109,  61)       (109,  50)
re-pivot    (109,  91)      (0, −30)        (109,  61)       (109,  50)
```

⇒ Both unmoved. If either moves at the setup pose, the compensation is wrong and
no amount of looking at frames will say which of the two numbers to blame.

### 3.2 🚨 Worked: the wrong edit wins on every aggregate

Two variants: `mid` compensates the child, `mid-nochild` forgets it. Both are
checked against frames rendered from the original — so both *should* differ, because
the movement genuinely changed. What separates them is where.

⚠️ **Pin `--viewport` from the reference's own sidecar**, INGEST §4.1's warning: a
re-pivot changes the skeleton's world extent, `frames.json`'s box is then refused on
`coordinates`, and the framing is fitted instead — which moves every figure below.

```bash
rigc render --candidate out --animation swing --fps 12 --out ref
#  ..    swing            8 frame(s), 0.583s + contact.png -> ref/swing
#  → ref/frames.json's viewport: 20.4013, 31.8317, 119.1974, 153.8671

rigc check --candidate out          --frames ref --viewport 20.4013,31.8317,119.1974,153.8671 --all-frames
rigc check --candidate mid          --frames ref --viewport 20.4013,31.8317,119.1974,153.8671 --all-frames
rigc check --candidate mid-nochild  --frames ref --viewport 20.4013,31.8317,119.1974,153.8671 --all-frames
```

The control first, because a comparison of two builds needs one:

```
── out ──                                    the original against its own frames
     MAE        mean 0.00  worst 0.00 at f0000
       f0000     0.00     f0001     0.00     f0002     0.00     f0003     0.00
       f0004     0.00     f0005     0.00     f0006     0.00     f0007     0.00
```

Then the two edits, per frame:

| frame | `mid` — child compensated | `mid-nochild` — child forgotten |
| --- | ---: | ---: |
| **f0000** | **0.00** | **3.94** |
| f0001 | 2.19 | 3.22 |
| f0002 | 3.96 | 1.21 |
| f0003 | 13.37 | 9.17 |
| f0004 | 16.70 | 12.26 |
| f0005 | 17.43 | 12.70 |
| f0006 | 17.60 | 12.89 |
| f0007 | 17.66 | 12.96 |
| **mean (union)** | 11.11 | **8.54** |
| **mean over the reference's own pixels** | 12.30 | **8.98** |
| **worst** | 17.66 | **12.96** |

🚨 **The wrong edit is better on every aggregate the report prints, and it is
distinguished by exactly one row.** `mid`'s **f0000 = 0.00** is the pivot's own
signature — INGEST §4.1's *"invisible in the pose, and everything in the
movement"*, climbing monotonically from there. `mid-nochild`'s f0000 is **3.94**,
and that non-zero at the setup pose is the entire evidence that a child was left
behind. Every mean, and the worst frame, point the other way.

⇒ **This is AUTHORING §9.2's own instruction arriving as data: read the per-frame
column before the MAE.** The aggregates are smaller for the wrong rig because it
moves the arm's art less far overall; being *closer on average* and *wrong at the
setup pose* are not two readings of one quality.

📌 **And a second instrument names the same defect differently.** `chainfit` on the
two rigs, against a render of the setup pose (§8's recipe, same anchor):

```
out            CHAIN  hand.png  residual=0.0227  visible= 32%   hinge 0.33°
mid-nochild    REFUSE hand.png  residual=0.9505  visible=  8%   hinge 0.00°
               occluded: only 8.3% of it survives the parts drawn over it
```

The hand's own bone is 15 units high, so it sits up inside the trunk and its
visible share collapses — and **the hinge search cannot undo it**, because
AUTHORING §12.5's *"the hinge is searched; the pivot is not."* One rotation about a
wrong centre is not a translation, so the fit reports 0.00° and a residual of 0.95
rather than quietly absorbing the error. That is the failure mode being loud for
once, and it is loud because the instrument reads *through the structure* instead
of around it.

### 3.3 Sequence, because the surgery invalidates work

⚠️ **Do it before the per-frame fitting budget is spent.** AUTHORING §8.1's
sequencing rule, and the two records that paid it:

- attempt 4's two arm surgeries were done at builds 5 and 7 of 8, and the run's own
  note is *"measure the chain's reach against the extremes the shot visits **before**
  fitting it"*.
- attempt 5's repair was **six numbers in three objects** — the neck bone, the head
  bone's compensation and the neck attachment's compensation — *"setup render
  invariant by construction"*, followed by refits of every channel hung off that
  joint, with the hip and both legs **frozen** so the figures that were already good
  could not move.

⭐ **Freeze what is already measured.** That is not thrift, it is correctness: *"chains
share parents, so a search free to move a converged limb's ancestors will walk it back
off the floor to buy a fraction of a point somewhere else"* (AUTHORING §8.1). One run
measured the cost of not doing it — unfreezing the trunk for *one* local polish moved
its best frame from **58.2 → 67.5** on its own objective, because the cheapest
available improvement was to drag the trunk off the place the placements had measured.

---

## 4. A bone that carries no art is a gauge

**Turn it by δ, turn every child back by δ, and not one pixel changes.** So a
coordinate descent will walk it, and the pose stays right while the numbers become
unusable. AUTHORING §10.3 names the shape; four records on one figure are the arc
of what to do about it.

The failure, watched happening:

> *"`hip` carries no attachment and everything that moves hangs under it … this run
> watched `walk/f3` reach `hip +181.3°   torso −184.3°   front-thigh −150.6°
> rear-thigh −199.8°`, whose net world rotations are −3°, +31° and −19°: the picture
> was right and the numbers were unusable. A rotate series that swings 180° between
> two keys does not interpolate, it spins the figure through a whole turn."*
> — spineboy attempt 1 ([`2026-08-23-spineboy-1`](https://github.com/firejune/rigc/blob/main/bench/runs/2026-08-23-spineboy-1/LOOP.md) §8.4)

### 4.1 ⚠️ The exact fold has a precondition, and it is easy to miss

**An exact rotation gauge needs the children to sit *at the parent's origin*.** If
they sit off it, turning the parent moves their origins and the render, so the fold
AUTHORING §10.3 prescribes is not a null operation — it costs pixels:

> *"the hip's three children sit 9–13 units off it, so turning the hip moves their
> origins and the render. Folding cost MAE on every frame it touched (`idle` mean
> 23.0 with the fold against 19.9 without, same search)."*
> — spineboy attempt 2 ([`2026-08-23-spineboy-2`](https://github.com/firejune/rigc/blob/main/bench/runs/2026-08-23-spineboy-2/LOOP.md) §5)

⇒ **Test the precondition before folding.** Children at the origin ⇒ exact gauge,
fold it (the L1 optimum is the *median* of the children's deltas, which is one line).
Children fanned out at different offsets ⇒ a **soft** degeneracy, which wants a
penalty rather than a fold — that run used 2e-5 per squared degree, invisible at
animator-sized angles and decisive against a 180°-against-180° pair.

### 4.2 Four answers, in the order they were tried

| Answer | What it costs | Record |
| --- | --- | --- |
| **fold the gauge out exactly** after every frame | MAE, if the precondition fails; the same run also paid 30.7 → 33.8 on `walk` when the exact fold landed the descent in a different minimum — *"the fit got slightly worse and the animation got usable"* | attempt 1 |
| **penalise it softly** | nothing measurable at ordinary angles | attempt 2 |
| **delete the bone**, making the trunk the body root so every keyed bone carries art | the conventional pelvis, and it is measured — `bones` fell from 0.924 on the 18-bone rigs to **0.702** | 2026-09-03 attempt 1 |
| **never key `root`**, leaving it at the world origin as the floor | nothing; the trunk carries the position | 2026-09-03 attempt 2 |

⭐ **Read that arc rather than picking a row.** *Manage → penalise → delete → never
key it* is four runs converging on removing the freedom instead of policing it —
and the last two paid for it in a name-matched measure against a reference that
does have a pelvis. Whichever you choose, choose it before you key, because folding
a gauge after keying rewrites every key hung off it.

### 4.3 The terminal link is a gauge too, and it is the quiet case

**A part that is rigid to its parent in the pixels has an unobservable rotation.**
Two records, same reading, on the last link of a chain:

- rung 4's `chain-end` is *"a rotationally near-symmetric ring centred on its own
  joint, and |ring − bead₄| holds at 18.1–18.6 px (σ 0.15) across every frame of both
  short shots — so the ring is rigid to `chain-4` in the pixels, and its bone's
  rotation is an unobservable gauge. It is **not keyed**."*
- ⚖️ And the honest half of the same paragraph: *"If the reference keys it, this
  candidate is one timeline short, and that is the honest trade."*

⇒ Note that this is the §1 rule's converse: the ring is centred on its own joint,
which is *why* its rotation is invisible. A part you cannot see turning is a part
whose bone you should not be keying.

### 4.4 ✅ The artless parent that is not a mistake

**A bone with no art whose job is the component every child shares is the
legitimate case, and it appears four times.** The difference from §4's gauge is
that it is *keyed for a reason the arithmetic states*, not left free for a solver:

| Bone | Carries | Its children then key |
| --- | --- | --- |
| `faceshift` ([`gallery/portrait`](../gallery/portrait/)) | `−R·sin t`, the shift every feature shares in a yaw | only their residual — FACE §3 |
| `comet` (rung 6, rung 8) | the whole travel of a ball and its trail | the squash, and the trail's bend |
| `body` (rung 7, second attempt) | **translation only** — *"it holds no attachment, so keying its rotation as well would be a gauge"* | their own rotations |
| `ground` ([`gallery/walk`](../gallery/walk/)) | the contact line | the foot targets — §9.1 |

⭐ **FACE §3's argument for it is an auditing one before it is a rigging one**: a
residual is 1–6 units where a total is 30–40, *"nobody can eyeball an error in the
second, and everybody can eyeball one in the first."* The hierarchy is what makes
the small number the one in the file.

---

## 5. Siblings, not a chain

**What must take only a *part* of another bone's motion cannot hang under it.** Six
records, and the failure mode is the same every time: the rig is defensible, the
gate is green, the spec looks right, and the picture is wrong in a way that is
invisible in the numbers.

### 5.1 Scale propagates, so a scaling bone must be a sibling

> *"🚨 **The breath scales the chest plate without scaling the head.** `torso` and
> `chest` are **siblings** under `bust`, not a chain: `torso` carries the plate and
> takes the `scale` key (1 → 1.005, 1.014), `chest` carries the neck-and-head chain
> and takes a `translatey` (0 → 3.4). Parent the head chain to the bone that scales
> and the whole face inflates 1.4% every breath — visible, and invisible in the
> spec."*
> — [`gallery/portrait/README.md`](../gallery/portrait/README.md)

The same decision, on a ball and its trail:

> *"`ball` is a **sibling** of `tail0` under `comet`, not its parent, so squashing
> the ball does not squash the trail."*
> — rung 6 ([`2026-08-23-rung6-1`](https://github.com/firejune/rigc/blob/main/bench/runs/2026-08-23-rung6-1/README.md))

⇒ **The construction is always the same three bones**: an artless parent that
carries what both share (§4.4), and two children — one that takes the scale and one
that takes the chain.

### 5.2 A part that takes a *fraction* of another's motion cannot be its ancestor

> *"the neck plate has to take a *fraction* of the head's shift, so it cannot be an
> ancestor of the head. `neckbase` is the shared parent; `neck` carries the plate and
> `headroll` carries the head"*
> — [`gallery/portrait/README.md`](../gallery/portrait/README.md), the part table

⭐ **And the pivot goes one link up, which is the same edit for a second reason.**
The same rig keys `headroll` and never `head`: *"a head rotates about the top of the
neck, not about the middle of its own face."* A renderer policy assertion
(`A15_IDLE_NO_MESH_BONE_KEYS`, AUTHORING §5) forced that answer independently — two
arguments, one bone.

📌 **What the extra link buys, for free:** *"a rotation about the neck pivot carries
its descendants on a circle for free."* A yaw expressed as `translatex` draws a
straight line; 1.6° of roll on a bone at the top of the neck bends every feature's
path into an arc, with no per-part curve anywhere (MOTION §3.5).

### 5.3 Inheritance splits into shape and position, and you can cancel one

**A child inherits its parent's scale on both, and sometimes you want only one of
them.** `gallery/portrait`'s iris is the worked case: it is a child of the socket,
so a socket at `scalex 0.89` makes a circular iris an ellipse — which reads as a
squashed drawing rather than a turned head.

- the **shape** is cancelled with a counter-scale of `1/scaleX` on the child;
- the **position** is left inherited, because *"a bone's scale moves its children's
  local translation, so the highlight at (−11, +11) slides inward with the surface
  it reflects off."*

⭐ And the counter-scale belongs to the **socket**, not the part: two parts at
different local `x` under one socket take the *same* number, which is why it stays a
plain shared value rather than a per-member model (AUTHORING §4.5.1's last note).
Measured effect: without it the turn stops reading at about 18°, with it about 26°.

### 5.4 The parent chain is a coordinate space, and a model across two is refused

**This is the rule stated from the compiler's side, and it is the strongest form of
it.** AUTHORING §4.5.1's `derive` reads each member's coordinate from its parent's
origin, so:

> *"members under different parents have coordinates measured from different origins
> and the model would average them. Refused by name, naming the parents. In the
> worked example that is what splits `features` (under `faceshift`) from `hair`
> (under `head`) — and that split is the shared-shift split itself, so **the refusal
> falls exactly where the geometry already wanted a seam.**"*

⇒ Read that last clause as a design test. If a construct you want is refused for
spanning two parents, the parents are usually right and the construct is one track
too wide — split it. A correct hierarchy is the thing that makes the model
expressible; the refusal is how you find out you have one.

---

## 6. The chain: how far it reaches, how many links, and what it folds to

### 6.1 🚨 The reach check is arithmetic, and it runs before the first fit

**Take the chain's total reach from your rig; take the longest excursion the frames
show its end travelling; compare.** AUTHORING §8.1 states it, and the reason it is
first in this section is that failing it is invisible:

> *"If a chain's segment lengths are short … then every frame where the chain is
> folded fits beautifully, and the fitter *silently absorbs* the deficit on every
> other frame by rotating the parts it does have. **Nothing reports a failure.**"*

The record that named it:

> *"idle's folded arm had been misread as short bones — shoulder→elbow 42,
> elbow→wrist 41 units, total reach ≈ 98 with the fist offset, while `walk`'s own
> fist pendulum spans 184 units from the shoulder and `death`'s raised hand ~220.
> Segments reset to the art's proportions (75 + 58), pivot moves compensated so the
> setup render is unchanged. walk 0.176 → 0.150, run 0.232 → 0.201, aim 0.212 →
> 0.186 after refit."*
> — spineboy attempt 4
> ([`2026-08-28-spineboy-1`](https://github.com/firejune/rigc/blob/main/bench/runs/2026-08-28-spineboy-1/LOOP.md) §6)

⭐ **The tie-break is on the frames' side.** *"the shot's own extremes are a
measurement, while segment lengths taken off a folded pose are an estimate — so when
they disagree, suspect the estimate"* (AUTHORING §8.1). The same run's second
surgery makes the point about *where* the joint is, too: in the lying pose the
shoulder joint sat at row 344, under the body, while the wave's arm base reads
~(92, 315) — triangulated through the posed torso it belongs at the **spine top, not
at the visible shoulder pad**, and *"the wave becomes reachable."*

### 6.2 ⚠️ It bites in both directions, and §8.1 is written for one of them

**A chain that is too *long* fails the same way and looks completely different: the
fits converge, every residual is ordinary, and the figure splays.**

> *"Here it was the other way up — the chain was **too long**. Read off the art's own
> ends, hip→knee→ankle measured **250 units**; the frames put the stance's pelvis
> **215 units** above the floor and the boot's ankle-to-sole at **54**, so a straight
> leg overshoots the floor by about 90 units and the fitter has to bend it sideways
> to land … Re-seeding the leg joints inset from the art's ends — thigh 86 units,
> shin 94 — put the ankle at world y **53.5** against the boot's own 54."*
> — [`2026-09-03-spineboy-1`](https://github.com/firejune/rigc/blob/main/bench/runs/2026-09-03-spineboy-1/LOOP.md) §4.4

⭐ **Why the art misled it, and this generalises:** the art's outer ends are not the
joints. A rounded cap's centroid sits at the plate's *tip*, while the joint two
plates share sits inside the overlap their two rounded ends make — so every
cap-to-cap distance over-reads by about the cap's own radius. Two separate runs
filed the same guide note about §8.1 being one-directional, which is itself the
evidence that this recurs.

📏 **And there is a cheap detector for the too-long case**: `check`'s `in units`
line, on one set, with a static candidate. One run read
`candidate 352.8 x 727.9   reference 460.7 x 648.7` and that names the excess
directly, while doubling as the confirmation that the shot was measured in the
frames' own units.

### 6.3 ⚖️ A hypothesis raised by arithmetic is worth testing, not acting on

**The same run then refused its own repair, and the refusal is the more useful
result.** Its leg chain assembled from the art's caps reached 308 units where the
frames put the standing leg at about 233 — a 79-unit excess with a plausible cause
(the cap-radius argument above) and an obvious fix.

> *"⇒ REFUSED. Shortening every link by 10% costs 0.70 on the spread mean, an 11%
> rise, and the direction is unambiguous … The cap-derived link lengths are the
> better rig, and the 79 units are a real knee bend in the reference's own stance
> rather than an error in this rig. The surgery §8.1 warns about … was therefore not
> performed, and the per-frame fitting budget was not spent twice."*
> — [`2026-09-03-spineboy-2/evidence/limb-reach.txt`](https://github.com/firejune/rigc/blob/main/bench/runs/2026-09-03-spineboy-2/evidence/limb-reach.txt)

⇒ **The reach check tells you a chain and a shot disagree. It does not tell you
which one is wrong.** A bent limb and a long limb produce the same excess. One
build settles it, and it is cheaper than the surgery.

### 6.4 Bound the chain — and bound it where the value is written

**An unbounded chain is a degeneracy sink: it will fold 180° to absorb an ambiguity
somewhere else in the rig, and the fit will report an answer nobody can key.**

Rung 4's saucer is an ellipse, so `prot` and `prot + 180` differ only in which side
a 3 px orange band sits on — and:

| the chain | mean residual | what it answered |
| --- | ---: | --- |
| unbounded | 0.318 | rotations of **−740°, −833°, +879°** on frames 3–24 |
| bounded (no fold back on itself) | 0.194 fresh, 0.137 after a geometry pass | — |
| bounded + a measured seed | **0.114** | the fast passage came in |

The same degeneracy, independently, one rung over: *"the fitter was landing in
folded configurations (a chain joint at 162°, the ball shrunk to 0.69 to cover a gap
its own fold had opened)"*, fixed by *"bound the chain: no joint past the first may
turn more than 80°."* ⚠️ Note the second half of that sentence — **the fold dragged
a sibling's scale with it**, so the symptom appeared on a part that was not in the
chain.

⚠️ **And a bound has to be enforced where the value is written.** Two records say
it in the same words: *"A bound enforced on the transition is not a bound on the
state"* and *"a constraint that is not enforced where the value is written is not a
constraint."* A limit on each search *step* lets the walk arrive anywhere, one
accepted step at a time.

### 6.5 How many links: one bone is an affine

⭐ **The sharpest method in the corpus, and it needs no build.** A Spine bone's
local transform *is* a general affine, so *"is this part one bone?"* has an exact
form: **is each frame's silhouette an affine image of the part's own drawing?**

> *"⇒ **the sack is not one bone.** The frames read nearly twice as far from affine
> as a deliberate 20 %-of-width bend, and fourteen times the floor — and the
> estimator does **not** mistake a stretch for a deformation, which is the control
> that matters, because a stretch is what one bone *can* do."*
>
> *"`tools/warp-order.ts` then sized it, by fitting polynomial warps of rising order:
> order 1 (= one bone) mean 0.1531, order 2 (= a 3×3 lattice) **0.0915**, order 3
> 0.0713 … ⇒ a second-order warp recovers about **40 %** of the gap, and that is the
> freedom the mesh was built with — a four-bone chain, weights blended by height
> only."*
> — rung 7, first attempt
> ([`2026-08-28-rung7-1`](https://github.com/firejune/rigc/blob/main/bench/runs/2026-08-28-rung7-1/LOOP.md) §5)

⇒ Two controls are what make that quotable and they are worth copying: the art
through a **known affine** read 0.0044 → 0.0007 (the floor), and the art plus a
**deliberate 26 px bend** read 0.0367 → 0.0246 (a positive control). A distance-from-
affine with no floor beside it is a number, not a measurement.

📌 **The frames cannot tell a mesh from a non-uniform scale in general — but they
can tell both from one affine**, and that is what this measures. Which is also the
honest bound on the method.

### 6.6 When the pixels refuse to choose

**Say so, and choose on something else.** Two records, opposite instruments, same
conclusion:

- rung 6 built 5, 6 and 8 segments and fitted all three: total residual **1.598 /
  1.600 / 1.588** — *"within 0.8 %, so the frames do not choose. Six was chosen on
  what a comet-tail rig has to do next rather than on pixels that are silent."*
- rung 8's second attempt read 3 bones 2.148, 4 bones 1.777, **5 bones 1.651**, 6
  bones 1.919 — and refused to over-read its own minimum: *"the 6-bone figure is not
  evidence that 6 is worse structurally, only that the fit has more places to get
  stuck."*

🚨 **That second caveat is general.** A sweep over bone count measures
*representational capacity confounded with search difficulty*, and those move in
opposite directions. A minimum in the middle is what a confound looks like.

### 6.7 Chain length is the motion budget

**A limb's excursion is bounded by its chain, not by taste**, and going past it does
not fail — it degenerates:

> *"The first candidate lifted the foot 56 units on a 130-unit leg: the chain has to
> fold to a 70-unit span, and a two-bone solve does that by throwing the knee
> sideways. 28 units — a fifth of the leg — is the version that reads as a step."*
> — [`gallery/walk/README.md`](../gallery/walk/README.md)

The same arithmetic on the other side of the chain, from
[`gallery/flex`](../gallery/flex/): rotating a rigid panel about a seam opens a wedge
of `halfHeight × tan(angle)` — about 22 px at 20° on that cloth — so *"the bend
angles in `motion.json` are chosen against that overlap, not the other way round."*

⇒ **Both are the same rule: the structure sets the range, and the keys are chosen
inside it.** Deciding the keys first and the structure after is how a solve gets
asked for a pose outside its reachable set (§6.1).

---

## 7. A local key is not a world key

**Every number in a rig spec below `root` is in its parent's space, and a parent's
motion multiplies through every descendant.** Six records, and every one of them is
a case where a spec that read correctly produced a figure somewhere else.

### 7.1 A translate key is an offset from the setup position

⚠️ **Two different quantities, and a fitter drives the other one.** Spine's
`TranslateTimeline.apply` is `pose.x = setup.x + x`, so a key is an *offset*; a
fitter working in `bone.pose.x` is driving the **absolute local position**. The two
differ by exactly the bone's own setup `x`/`y`:

> *"the first spec moved the figure by the setup offset a second time. Rotation and
> scale needed no correction: their setups are 0 and 1."*
> — rung 7, second attempt
> ([`2026-08-28-rung7-2`](https://github.com/firejune/rigc/blob/main/bench/runs/2026-08-28-rung7-2/LOOP.md) §5)

The same confusion one attempt earlier, from the other end: *"The first fitter used
0 as every knob's neutral value. `bone.pose.x` is the bone's whole local
translation, not an offset from setup, so that put every bone at its parent's
origin — the sack 16.5 units sideways and 64.5 up before the search started."*

⇒ **The rule that catches both, and it costs one command:** *"a fitted run should
diff its compiled animation against its own pose series before it reads a single
measure. The gate cannot see it, `check` sees it only as a framing catastrophe, and
the diff names it in one line."*

### 7.2 Composition is not addition

⚠️ **A bone under a rotated parent is not at the parent's position plus its own
numbers, and a leg chain is exactly that case.** That sentence is a comment in
[`gallery/stage.ts`](../gallery/stage.ts), which exists because a drawing script
needed setup-pose world positions and *"writing them a second time in the drawing
script is the defect that produces a shadow under nobody's feet, and it is
invisible in both files — each is internally consistent."*

⇒ **The rig spec is the one author of the geometry.** Anything else that needs a
world position walks the parent chain and applies each parent's rotation and scale
the way the runtime does. Two files that each state a position are two files that
will disagree, silently, on the day one of them changes.

The same fact as a whole-part misplacement: rung 7's mesh variant *"bound each
vertex against a chain whose y values were written as if the mesh's local frame were
centred on the sheet, when the frame is `panel`'s own — one segment out. It drew the
**same ink in the wrong place**: rest pose 51.73 against the region variant's
11.14"* — and until that was fixed, a comparison between two *mechanisms* was
measuring a coordinate-space error.

### 7.3 Worked: a leaf's displacement is the sum along its chain

**Three bones, each keyed to arrive from its own scatter offset, and the leaf
arrives from the sum of all three.** The fixture's `together` animation keys
`trunk (−40, 60)`, `arm (30, 40)` and `hand (25, 30)` down to zero over 0.6 s.
`bonedist` reads each bone's world origin against the same rig holding still:

```bash
cat > vs-home.json <<'EOF'
{ "spec": "rigc-bonedist/1",
  "bones": { "trunk": "trunk", "arm": "arm", "hand": "hand" },
  "animations": { "together": "home", "leaves": "home" } }
EOF

rigc bonedist --candidate out --reference out --bones vs-home.json --fps 30 --all-bones=1
```

```
  candidate  size 132.880  (root `root` -> `arm` in the setup pose)

  together vs home  19 frame(s), 0.600s vs 0.600s
      position  mean 0.269930    worst 0.984820    (bone `hand`, frame 0)
        bone                     position (mean/worst)
        hand                     0.349196/0.984820
        arm                      0.268173/0.756314
        trunk                    0.192422/0.542679
```

⚠️ `position` is in **skeleton sizes** (AUTHORING's sibling doc
[BENCHMARK.md](BENCHMARK.md) states the conventions, and the report prints them);
the header names the size, so multiply back:

| bone | its own key | the sum along its chain | `worst × 132.880` |
| --- | ---: | ---: | ---: |
| `trunk` | (−40, 60) → 72.11 | (−40, 60) → **72.11** | **72.11** |
| `arm` | (30, 40) → 50.00 | (−10, 100) → **100.50** | **100.50** |
| `hand` | (25, 30) → **39.05** | (15, 130) → **130.86** | **130.86** |

🚨 **The hand was keyed to come in from 39 units and comes in from 131 — 3.35× its
own number — and every figure agrees with the arithmetic to two decimals.** Scatter
a figure by reading world positions off a picture and writing them into local keys,
and each leaf is displaced by its whole ancestry. On a deeper rig the leaf starts
off-canvas.

⇒ **The fix is a conversion, not a smaller number.** Decide the world displacement
you want, then subtract what the ancestors already contribute at that instant. Which
is FACE §3's shared-shift split (§4.4) arriving from the other direction: `carried`
exists precisely because *"the depth whose shift a parent bone already applies"* has
to come out of the child's own key.

### 7.4 What that leaves undecided, and who decides it

**The compounding is measurable. The ordering is not.** Both animations in the
fixture start and end in the same two poses, so the *extent* is identical — worst
`0.984820` on `hand` at frame 0 for both — and they differ only in the path:

```
  together vs home     position  mean 0.269930    worst 0.984820   (bone `hand`, frame 0)
  leaves vs home       position  mean 0.489455    worst 0.984820   (bone `hand`, frame 0)
```

`leaves` moves one link at a time — hand 0→0.2 s, arm 0.2→0.4, trunk 0.4→0.6 — so
each part's world displacement equals its own key while it is playing, and the
parent then carries a finished sub-assembly. `together` moves all three at once, so
every leaf's world velocity is the sum of its ancestors'.

🚫 **Which of those reads better is not a question this toolchain answers**, and no
number above is evidence for either. It is MOTION §0's rule about movement, applying
to a movement that happens to be structural: *"the one thing that judges a movement
is a person's eye, through `rigc vote`."*

⚠️ **Provenance note, stated because the honest version is short:** the prescription
*assemble leaves first* comes from the production of this project's first demo film,
whose artifacts were deliberately kept out of the repository ([#248](https://github.com/firejune/rigc/issues/248)),
so **there is no repo-side record of it and this page does not present one.** What is
re-derived here is the mechanism it describes — the compounding in §7.3 — and the
measured fact that ordering changes the path and not the extent. The ordering claim
itself is one person's eye, once.

---

## 8. Duplicate art needs distinct pivots

**One drawing used twice is irreducibly ambiguous from pixels alone, and the
hierarchy is the thing that resolves it.** Two arms, two shins, two wings: the same
plate, two places. `rigc pose` is *right* to report both, and cannot do better.

### 8.1 Worked: `pose` reports both, `chainfit` reports one each

The fixture's two wings carry one `wing.png` at mirrored pivots (`x −14` at `+40°`,
`x +14` at `−40°`). Render the setup pose and read it back with no rig:

```bash
rigc render --candidate out --animation home --fps 2 --max 154 --out pic
rigc pose --images parts --frame pic/home@2fps/f0000.png --scale 0.85,1.2 --out pose0.json
```

```
  PLACE  trunk.png  x=   80.0  y=  122.0  rot=    0.0°  scale=0.998  residual=0.0050  unexplained=  0%
  AMBIG  wing.png   x=  102.2  y=  109.7  rot=   40.3°  scale=0.931  residual=0.0183  unexplained=  3%
                    alt 2: x=   57.2  y=  109.7  rot=  -40.3°  scale=0.931  residual=0.0186  unexplained=  4%
```

⭐ **Two placements, mirrored, 0.0003 apart in residual.** That is not a weak
reading — both are excellent, and `unexplained` is 3 % and 4 %. There is no
threshold that picks one, because there is nothing wrong with either.

Now read the same frame *through* the rig. `trunk` anchors (it is the one part
`pose` placed unambiguously inside `chainfit`'s criterion), and every wing hangs off
its own pivot one link out:

```bash
rigc chainfit --candidate out --images parts --frame pic/home@2fps/f0000.png \
              --anchor pose0.json --out cf0.json
```

```
  CHAIN  hand.png   x=   89.0  y=  141.9  rot=   -0.3°  scale=0.998  residual=0.0227  visible= 32%
                    bone hand · depth 2 from trunk · hinge 0.33° (local 0.33° Spine) · 46 px scored
  REFUSE arm.png    x=   88.9  y=  125.0  rot=    0.0°  scale=0.998  residual=0.0263  visible= 17%
                    occluded: arm.png: only 17.0% of it survives the parts drawn over it
  ANCHOR trunk.png  x=   80.0  y=  122.0  rot=    0.0°  scale=0.998  residual=0.0045  visible=100%
  CHAIN  wing.png   x=   57.6  y=  110.1  rot=  -40.6°  scale=0.998  residual=0.0483  visible=100%
                    bone wing_l · depth 1 from trunk · hinge 0.61° (local 40.61° Spine) · 240 px scored
  CHAIN  wing.png   x=  102.1  y=  109.9  rot=   38.8°  scale=0.998  residual=0.0386  visible=100%
                    bone wing_r · depth 1 from trunk · hinge 1.20° (local -38.80° Spine) · 240 px scored

  ..    4 of 5 part(s) read; 3 of them the anchor pass refused and the chain bought.
```

⭐ **Two rows for one plate, one per bone, neither ambiguous.** The ambiguity did
not get resolved by a better objective; it stopped existing, because a child whose
parent is placed has **one degree of freedom about a pivot the rig declares**
instead of four (AUTHORING §12). The selftest's own name for this control is
`CF06_TWO_IDENTICAL_LIMBS_STOP_BEING_AMBIGUOUS_ONCE_THEY_HAVE_PIVOTS`, and its
stated reason is *"two pivots, two arcs, one answer each."*

📌 **Read the hinges as the honesty check they are.** The frame *is* the setup pose,
so the truth is 0°, and the search returned 0.33°, 0.61° and 1.20°. That is the
instrument's own noise at this size, not a finding, and it is why AUTHORING §12
calls every threshold in the report a reporting threshold.

### 8.2 ⬇️ And the walk only goes outward

⚠️ **A placed parent determines its children; a placed child says nothing about its
parent.** This is the strongest single statement about assembly order in the
toolchain, and it comes from the instrument:

> *"An anchored part fixes its own bone completely — four numbers read off the
> picture for the four a similarity has — and every descendant then follows from the
> rig. A bone ABOVE an anchor does not: recovering it would need to know what the
> link between them did, which is precisely the unknown the anchor does not carry."*
> — [`src/chainfit.ts`](../src/chainfit.ts)

⇒ **So the direction of readability is a hierarchy design input**, and one run
designed around it:

> *"**`torso` is the trunk and everything hangs off it**, rather than a pelvis with
> the chest and the legs as siblings. Chosen for identifiability, not anatomy …
> Under a pelvis the legs sit above the only reliable anchor and every leg comes back
> `no-anchor` on every frame — measured, not predicted."*
> — [`2026-09-03-spineboy-2`](https://github.com/firejune/rigc/blob/main/bench/runs/2026-09-03-spineboy-2/README.md)

That is the only place in the corpus where a tree was chosen for what could be
measured through it rather than for anatomy or for the art, and it is worth knowing
the option exists.

### 8.3 In an authored rig, the same duplication is a per-side flag

**Two legs made from one drawing are *translated* copies, not mirrored ones, so one
constraint value bends both knees the same way** — which reads as a leg on
backwards:

| | `bendPositive` | thigh at x | knee at x | knee sits |
| --- | --- | --- | --- | --- |
| `leg_f_ik` | `false` | 382 | 397.8 | 15.8 outward |
| `leg_b_ik` | `true` | 322 | 306.2 | 15.8 outward |

⚠️ **And it is invisible where you would look for it.** *"Two of the four
`bendPositive` combinations were indistinguishable at 4× zoom on the frame where the
difference is largest. `shin_f.worldX` separated them immediately. Look at frames
for whether it reads; read bone positions for what it is doing."*
([`gallery/walk/README.md`](../gallery/walk/README.md))

### 8.4 ⚠️ And `pose` can be confident about the wrong twin

**The residual does not know which of two identical parts it placed.** One run's
`rear-thigh` read residual **0.0751** on a frame — *better* than `front-thigh`'s
0.0840 — while sitting on the near leg. AUTHORING §8.1's rule for it is a
calibration, not a threshold: settle the assignment on the frames where the two
parts are *unambiguous* (far apart, or only one drawn), read the separation there
where it is a real gap, and then **pin it for the run** so no per-frame search
reopens it.

---

## 9. Constraints are structure

**A constraint is part of the hierarchy, not decoration on it — and it is the part
with no pixel signature at all.** That combination is why this section is both a
list of structural rules and a list of refusals.

### 9.1 🚨 The target's parentage *is* the rig

> *"In a walk the hip **bobs** and the planted foot **does not**, so the target has
> to be somewhere the hip's own motion cannot reach it. `ground` is a child of `root`
> at the contact line; `foot_f` and `foot_b` are children of `ground`. Parent a foot
> target to `hip` and the hip carries its own feet up with it, **the solver reports
> success, and the figure hovers.**"*
> — [`gallery/walk/README.md`](../gallery/walk/README.md)

Measured on that build, over the stance where `foot_f` is planted: the hip travels
**7.9 units up and 2.9 sideways** while the foot reads `382.0, 68.0` on every
sampled time, to the decimal.

⇒ **The general rule: an IK target must not be a descendant of the chain it
drives.** The failure is silent and self-consistent — the constraint is satisfied on
every frame, and the thing it is satisfied *relative to* is moving.

### 9.2 The solver reads the chain off the hierarchy

**`IkConstraint.apply2` measures a two-bone chain as `l1 = child.x` and
`l2 = child.length`**, and solves so that the point `l2` along the child's **+x**
reaches the target. So:

- each bone's local +x has to run down the limb (`thigh` at `rotation: -90`, `shin`
  at the thigh's own `x: 56`);
- *"A chain whose bones point some other way solves correctly and draws nowhere near
  the target"*;
- and the plates then need `"rotation": 90` to cancel the bone, plus an `x` offset to
  slide their centre down it.

⭐ **This is where the art and the hierarchy stop being two decisions.** Both plates
have to be **drawn from their own joint**, and the joint's coordinates *inside each
drawing* are what every `length` and every attachment offset is measured from —
[`gallery/rigby.ts`](../gallery/rigby.ts) names all four points for one leg, and
[`gallery/walk/rig.json`](../gallery/walk/rig.json) states them.

### 9.3 A constraint carries the whole subtree, and that is the point

> *"`cart` is the constrained bone; `wheel_b`/`wheel_f` and `hip` are its children,
> so the constraint carries the wheels and the whole figure with it and the tangent
> rotation tilts all three."*
> — [`gallery/ride/README.md`](../gallery/ride/README.md)

📌 Two placement conveniences from the same paragraph, both of the form *put the
bone where the numbers become trivial*: `root` is at the world origin, *"which is why
the `track` slot hangs off it: a path attachment's vertices are in its slot bone's
space"*, so the rig's numbers are world coordinates; and a stage-sized plate's bone
sits at the stage's centre, *"because a stage-sized part centred on the stage's centre
needs no offset — one less number that can be wrong."*

### 9.4 A constraint aimed at nothing loads clean and moves nothing

**`PathConstraint.update` opens with `if (!(attachment instanceof PathAttachment)) return`**,
so a path constraint pointed at a slot that never shows a path loads perfectly,
reports every mix it was given, and does nothing. AUTHORING §3.5.1 has that and two
siblings: a physics constraint that names no component parses cleanly and is inert,
and a mode string like `"PERCENT"` resolves to `undefined` and runs *some other
mode*. rigc refuses all three, and `A36`/`A23` refuse them again on the artifact.

⇒ Read the pattern rather than the three cases: **a constraint's silence is its
default failure mode**, because it drives bones rather than drawing anything.

### 9.5 ⚠️ A motion-side default can silently revert a rig-side structure

> *"Four builds differing only in the rig's two `bendPositive` values produced **one
> pose** — `shin_f` world x = 366.2 in all four. `SkeletonJson` reads the bend
> direction per *timeline key* as well as per constraint, with the same default of
> `true`, so any IK timeline that did not restate it overwrote the constraint's value
> for the whole animation, with the field still in the file and the gate green either
> way."*
> — [`gallery/walk/README.md`](../gallery/walk/README.md), on
> [#273](https://github.com/firejune/rigc/issues/273) (fixed: rigc now stamps the
> rig's value onto every emitted ik key)

⇒ **A structural fact stated in the rig can be overwritten by a per-key default in
the motion.** It took four builds and one bone position to see it; nothing else
could have.

### 9.6 🚫 And a constraint has no pixel signature, which is why the corpus refuses to guess

**A bone driven by a constraint and the same bone keyed directly render identical
pixels.** Every from-zero run in the corpus therefore authored **no constraints at
all**, unanimously, and paid for it in a measure:

> *"authoring one would be a guess dressed as a reading, and the run has nothing to
> point at if asked why there are four rather than one … that measure is the price of
> the rule, and it is worth paying rather than winning by guessing."*
> — rung 8, first attempt
> ([`2026-08-23-rung8-1`](https://github.com/firejune/rigc/blob/main/bench/runs/2026-08-23-rung8-1/LOOP.md) §13)

⭐ **The cleanest demonstration that the rule costs something real and is still the
right rule** is in that same run, which authored two rigs against two references:
*"`pendulum` has none, `ball` has four. §13's decision not to guess scored **1.000**
on one and **0.000** on the other, from the same reasoning."*

⚠️ **And guessing one is not merely unscored, it is actively destructive**: *"a
physics constraint is simulated at load, so it would have moved the hand-fitted poses
`check` was measuring, and the run would have lost its only view of whether the
animation is right."* AUTHORING §12.5 states the same hazard for a fit — with any
constraint in the candidate, *"a fitted `localRotationDeg` is still a placement but
not necessarily a value you can key and reproduce."*

⇒ **So: author a constraint when it is doing structural work you can state**
(§9.1–§9.3 are three of those), and not to match a feature list. On the largest
reference in the corpus that trade is stark — one run's `bench` line reads
`constraints=0/24` against `bones=8/31`, which is a reference whose hierarchy is
mostly constraints and a frames-only candidate that recovers none of it.

---

## 10. Declaration order, draw order and parentage are three different things

**Three separate orderings, all expressed in the same two arrays, and runs confuse
them.** Two attempts at the same figure had to write the disclaimer out —
*"`slots.order` 12/21 and `bones.order` 9/18 are **declaration order**, not draw
order being wrong"* (attempt 2), and *"`bones.order` 9/18 and `slots.order` 14/20
are the same fact twice"* (attempt 1). If a low order measure sends you looking at
depth, you are debugging the wrong array.

### 10.1 A forward reference is a second root

`parent` resolves **by name against bones already declared**, exactly as the parser
does (AUTHORING §3.2). ⚠️ **This is not a rigc restriction and it does not fail
loudly**: *"in the loaded skeleton it would simply be a second root."* Declare
parents before children — which is also the convention an editor produces, so it is
free.

### 10.2 ⛔ Never express an overlap by re-parenting

**Depth is the slots array, and a change of depth is a `drawOrder` key.** AUTHORING
§10.2's rule, and §10.2's own reason slots exist at all — *"slots decouple bones from
the draw order"* — which is what lets one part sit in front of its own parent:

> *"**The gun's slot is lifted out of its bone's chain.** It is drawn in front of the
> torso and behind the front leg, which is §10.2's own reason slots exist and the only
> arrangement that satisfies both things the frames measure: the gun reads unoccluded
> in `idle`, and the near leg covers it in `walk`."*
> — spineboy attempt 2
> ([`2026-08-23-spineboy-2`](https://github.com/firejune/rigc/blob/main/bench/runs/2026-08-23-spineboy-2/README.md))

⚖️ **But parentage is a real question with a real answer, and the evidence for it is
smoothness.** Rung 4 modelled a chain's top as a *sibling* of the disc it hangs
under — translating with it, not rotating:

> *"That forces chain1's rotation to sweep a full −360° through the flip.
> Re-parenting chain1 *under* the platform bone turns the same measurements into a
> smooth ±40° curve — and the smoothness is the evidence, because an animator's curve
> is the smooth one."*

⇒ The two rules do not conflict. **Re-parent to fix what a part is carried by; key
draw order to fix what a part is drawn over.** Using either for the other's job is
the divergence AUTHORING §10 was written after six runs to stop.

### 10.3 🔒 The one machine guard on parentage, and why it exists

**`A25_DETACHED_BONE_PARENTAGE` is the only assertion in the suite that reads the
tree's shape against a stated intent.** Some bones are detached on purpose — an
emitter must not ride the part that released it — and:

> *"the wrong parentage still loads and still animates — it just lies. That is
> exactly the class of invariant that belongs in a machine guard rather than in
> prose."*
> — [`src/validate.ts`](../src/validate.ts)

Declare the pair in `invariants.detached` (AUTHORING §3.7) and it fires:

```bash
rigc build --rig detached.rig.json --motion stack.motion.json --images parts \
           --out det --profile spine-html
```

```
  FAIL  A25_DETACHED_BONE_PARENTAGE: "hand" is a descendant of "arm"; it must not be dragged by that bone's motion
rigc: 1 assertion(s) failed — nothing written
```

⚠️ **It is an archetype rule, so `--profile spine` reports `PROF` and not a pass**
(AUTHORING §5.2, §7 step 3), and an absent `detached` field reports **SKIP** rather
than a pass. Both of those are the honest readings and neither is a green light.

### 10.4 🚨 The renumbering landmine: mesh weights by index

**Inserting one bone can rebind every vertex of every mesh below it, with a green
gate and an unmoved `diff`.** Spine's own weight encoding stores a `boneIndex` — a
position in the *emitted* bone array, a list the rig spec never writes and cannot
see:

> *"Put one bone ahead of the meshes and every vertex rebinds: the file still loads,
> every index is still in range, every vertex's weights still sum to 1, and `A04`,
> `A20` and `diff` are all quiet, because an index has no name to be wrong.
> (Measured, on the rung 6 transcription: union MAE 3.30 → 15.09, worst mesh-slot
> drift 0.09 px → 9.8 px, with a green gate throughout. Issue
> [#45](https://github.com/firejune/rigc/issues/45).)"*
> — AUTHORING §3.4

⇒ rigc's `weights` form binds **by name**, like every other reference in a rig spec,
and the index form needs `"boneIndexing": "raw"` said out loud — *"an opt-in, because
what is being opted into is the silence."* Use the named form and bone insertion is
free.

---

## 11. What nothing measures

### 11.1 Three fields no render carries

**`parent`, `length` and `inherit` are not in any picture.** Five records say so and
each declares its choice as reasoning:

| Field | What the honest runs did |
| --- | --- |
| `parent` | stated the tree §10.1's naming convention implies, and said the internal hierarchy *"is not measurable at this scale and is not claimed to be right"* where the figure was ~90 px of ink over eleven parts |
| `length` | ⭐ *"`bones.length_present` is **a coin flip taken deliberately**: the eleven character bones state a `length` and `root`, `course` and `ball` do not, on the reading that an editor-drawn skeleton has lengths and a bone created by dragging an image in does not. Nothing in the frames can check it."* Two other runs read `length_present 1/3` and `1/5` and said the same — *"a rendered frame carries no trace of a bone's `length` or of its inheritance mode, so a run authored from pictures cannot recover them at all"* |
| `inherit` | left off everywhere, and reported as such |

⇒ Write them, and write one line saying they are reasoning. AUTHORING §9.3 is the
general form of this and it is the section to read next.

### 11.2 The instruments, and which loop each one belongs in

| Instrument | What it sees of a hierarchy | Which loop |
| --- | --- | --- |
| `build` / `validate` | that the tree parses, that every name resolves, and `A25` if you declared a forbidden pair | every build |
| `check` | the *consequences* of the structure, in pixels — and **only where the structure moves art.** A pivot is invisible at the pose and everything in the movement (§3.2) | inside the authoring loop |
| `chainfit` | ⭐ **the only reading of structure against a picture.** `pivotDisagreementPx` is *"the one direct measurement of your rig against the picture"*; `bone.carriedBones` names the links whose hinge could not be fitted and whose setup rotation was carried through | inside the loop, once a candidate exists |
| `diff` | that two files *say* the same thing. It read **1.000 on all 49 measures** across a 236.5-unit pivot move (INGEST §4.1) | finish line |
| `bonedist` | per-frame, per-bone world-transform distance against **another skeleton** — so it reads the reference and is subject to the honesty rule | finish line only |
| `bench`'s `depth_histogram` / `degree_sequence` | ⭐ the **name-agnostic** read of a tree: as many bones at each depth, as many with each child count. Nine records use this pair as the honest statement about a hierarchy, precisely because it survives two people naming the same parts differently | finish line only |

⚠️ **`pivotDisagreementPx` needs two independently read parts on one chain.** It is
reported for anchored bones only — it is the distance between the chain's own
prediction of a bone's pivot and where the anchor pass put it — so a rig with one
anchor (the fixture in §8) produces none. One run got it on exactly one joint of
sixteen bones: **median 2.00 px, max 5.17** over 126 frames on the head bone, *"the
same order as the sweep's own basin there."*

### 11.3 Below a scale there is no hierarchy to measure

**Two records draw the line explicitly**, and it is worth knowing where it is before
promising a tree:

- eleven parts over about **90 px of ink** *"cannot decide a bone tree; what was
  fitted is each part's placement and spin, and the tree is the one §10.1's naming
  rule implies."*
- at **8 × 9 frame pixels** per limb, one run declined a separate neck bone because
  *"a separate neck bone is a second rotation between the torso and the head, and at
  8 × 9 frame pixels the frames cannot separate them"* — §10.1 asks for one slot per
  image, and *"it does not ask for one bone per slot."*

⇒ ⭐ **A bone the frames cannot separate from its parent is a bone you are choosing,
not measuring.** Choose it on what the rig has to do next (§6.6), and say which it
was.

---

## 12. Non-goals — stated, so nobody proposes them as gaps

🔭 **A hierarchy grade.** There is no measure on this page and none is coming from
it. §11.2 is the complete list of what the instruments see, two of them read a
reference skeleton and are finish-line only, and the two that run inside the loop
report distances rather than verdicts.

🔭 **A pivot solver in the CLI.** Both estimators are documented arithmetic — MOTION
§3.9's 2×2 for two poses, AUTHORING §8.1's fixed point in two parts' own coordinates
for N frames — and the thing that decides whether either answer means anything is a
**conditioning check on data the tool does not have** (§2.3). A command that returned
a pivot and no conditioning would be the confident wrong answer §2.1 is a catalogue
of.

🔭 **A tree generator from parts.** Naming, depth and parentage are all decided by
things outside the PNGs: what the art is named (AUTHORING §10.1), what has to move
independently, and what can be read through the structure afterwards (§8.2). A
generated tree would have to guess all three and would report the guess as a
derivation.

🔭 **Automatic child compensation on a pivot move.** §3's edit is four rows and
INGEST §4.1 states all four; the reason it is not a command is that the *decision*
being made — which children move with the origin and which were wrong before —
belongs to whoever knows why the pivot moved. An automatic version would silently
propagate a mistake through a subtree, which is the failure mode of §10.4.

🔭 **A constraint inferred from frames.** §9.6: the pixels are identical either way.
Anything here would be a guess with machinery attached.

---

## Appendix — the figure this page measures on

**Four plates, six bones, four animations.** Everything in §3, §7.3, §8.1 and §10.3
runs on it, and it is built from the bytes below so the sections run end to end.

```bash
mkdir -p stack/parts && cd stack
bun -e '
const files = {
  "parts/trunk.png": "iVBORw0KGgoAAAANSUhEUgAAABgAAAAwCAYAAAALiLqjAAAATUlEQVR42u3SIRUAIAwA0WVBkwOxRwhikGStoNKIMMwQvBOnvznZqp6ZAIRAG+aZAQAAAAAAvAFK7Z7ZBwAXAQAAAAAAXAHTlmcGEHYAa2smZ4bNX2AAAAAASUVORK5CYII=",
  "parts/arm.png":   "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAeCAYAAAAVdY8wAAAALUlEQVR42mPQ05D7TwxmoL7CMwvs/hODRxUOWoXTChT+E4OJVzga4KMKyVYIALj674flJv6nAAAAAElFTkSuQmCC",
  "parts/hand.png":  "iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAYAAABWdVznAAAAIUlEQVR42mOQkxD7j4yfVMXgxQyDUAMhBcNBA3qgDEINAJw3WmDDMo/XAAAAAElFTkSuQmCC",
  "parts/wing.png":  "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAYCAYAAADDLGwtAAAAK0lEQVR42mP48sbtPzGYgfoKE3ZV/ScGjyqkkkKtBq//xGDiFY4G+CBVCAChAm6LWQ8FxAAAAABJRU5ErkJggg=="
};
for (const [p, b] of Object.entries(files)) await Bun.write(p, Buffer.from(b, "base64"));
'
```

`trunk` is 24×48 with a red cap band and a dark seam, `arm` 10×30, `hand` 12×12,
`wing` 10×24 with a yellow tip. ⚠️ **None of them is one flat colour, on purpose** —
a self-similar plate makes `pose`'s scale window read at its own floor (MOTION §2.2),
which is noise this page does not need.

### The rig

⭐ **Read the four §1 decisions in it before the sections use them**: every bone sits
at a joint, every attachment is offset off that joint, both wings carry one image
under two placeholder names of `wing` (AUTHORING §10.1 — the attachment name *is* the
image name), and `root` is never keyed.

```bash
cat > stack.rig.json <<'EOF'
{ "spec": "rigc-rig/1", "name": "stack", "images": "parts",
  "skeleton": { "x": 0, "y": 0, "width": 200, "height": 200 },
  "bones": [
    { "name": "root" },
    { "name": "trunk",  "parent": "root",  "x": 100, "y": 40 },
    { "name": "arm",    "parent": "trunk", "x": 9,   "y": 36 },
    { "name": "hand",   "parent": "arm",   "x": 0,   "y": -26 },
    { "name": "wing_l", "parent": "trunk", "x": -14, "y": 26, "rotation": 40 },
    { "name": "wing_r", "parent": "trunk", "x": 14,  "y": 26, "rotation": -40 }
  ],
  "slots": [
    { "name": "hand",   "bone": "hand",   "attachment": "hand" },
    { "name": "arm",    "bone": "arm",    "attachment": "arm" },
    { "name": "trunk",  "bone": "trunk",  "attachment": "trunk" },
    { "name": "wing_l", "bone": "wing_l", "attachment": "wing" },
    { "name": "wing_r", "bone": "wing_r", "attachment": "wing" }
  ],
  "skins": { "default": {
    "trunk":  { "trunk": { "image": "trunk.png", "y": 24 } },
    "arm":    { "arm":   { "image": "arm.png",   "y": -15 } },
    "hand":   { "hand":  { "image": "hand.png",  "y": -6 } },
    "wing_l": { "wing":  { "image": "wing.png",  "y": 13 } },
    "wing_r": { "wing":  { "image": "wing.png",  "y": 13 } }
  } }
}
EOF
```

📌 **The draw order is load-bearing for §8.** `trunk` is drawn after `hand` and
`arm`, so the arm straddles its edge and comes back `occluded` at 17 % visible —
which is the part `pose` refuses and the chain buys. The wings are drawn in front of
it, so their duplication is a *duplication* rather than an occlusion.

### The motion

Four animations: `home` holds the setup pose (the reference `bonedist` measures
against, and the picture §8 reads), `swing` turns the arm 60° (the movement §3
measures a pivot through), and `together` / `leaves` are §7's two orderings.

```bash
cat > stack.motion.json <<'EOF'
{ "spec": "rigc-motion/1", "archetype": "stack", "cut": "stack",
  "easings": { "land": [0.33, 0, 0.15, 1] },
  "animations": {
    "home":  { "duration": 0.6, "tracks": [
      { "bone": "arm", "property": "rotate", "keys": [ { "t": 0, "v": [0] }, { "t": 0.6, "v": [0] } ] } ] },
    "swing": { "duration": 0.6, "tracks": [
      { "bone": "arm", "property": "rotate", "keys": [ { "t": 0, "v": [0], "ease": "land" }, { "t": 0.6, "v": [-60] } ] } ] },
    "together": { "duration": 0.6, "tracks": [
      { "bone": "trunk", "property": "translate", "keys": [ { "t": 0, "v": [-40, 60], "ease": "land" }, { "t": 0.6, "v": [0, 0] } ] },
      { "bone": "arm",   "property": "translate", "keys": [ { "t": 0, "v": [30, 40],  "ease": "land" }, { "t": 0.6, "v": [0, 0] } ] },
      { "bone": "hand",  "property": "translate", "keys": [ { "t": 0, "v": [25, 30],  "ease": "land" }, { "t": 0.6, "v": [0, 0] } ] } ] },
    "leaves": { "duration": 0.6, "tracks": [
      { "bone": "hand",  "property": "translate", "keys": [ { "t": 0, "v": [25, 30], "ease": "land" }, { "t": 0.2, "v": [0, 0] }, { "t": 0.6, "v": [0, 0] } ] },
      { "bone": "arm",   "property": "translate", "keys": [ { "t": 0, "v": [30, 40] }, { "t": 0.2, "v": [30, 40], "ease": "land" }, { "t": 0.4, "v": [0, 0] }, { "t": 0.6, "v": [0, 0] } ] },
      { "bone": "trunk", "property": "translate", "keys": [ { "t": 0, "v": [-40, 60] }, { "t": 0.4, "v": [-40, 60], "ease": "land" }, { "t": 0.6, "v": [0, 0] } ] } ] }
  } }
EOF

rigc build --rig stack.rig.json --motion stack.motion.json --images parts --out out
#  ..    pages=4 regions=4 bones=6 slots=5 animations=4 version=4.3.13 …  profile=spine
```

✅ It is green under **both** profiles, so `--profile spine-html` is available for
§10.3 without any unrelated failure in the report.

### The three variants the sections build

```bash
# §3 — the pivot moved +15 along the arm's own axis, children compensated
sed -e 's/"x": 9,   "y": 36/"x": 9,   "y": 51/' \
    -e 's/"x": 0,   "y": -26/"x": 0,   "y": -41/' \
    -e 's/"arm.png",   "y": -15/"arm.png",   "y": -30/' stack.rig.json > mid.rig.json

# §3 — the same move with the CHILD row forgotten
sed -e 's/"x": 9,   "y": 36/"x": 9,   "y": 51/' \
    -e 's/"arm.png",   "y": -15/"arm.png",   "y": -30/' stack.rig.json > mid-nochild.rig.json

rigc build --rig mid.rig.json          --motion stack.motion.json --images parts --out mid
rigc build --rig mid-nochild.rig.json  --motion stack.motion.json --images parts --out mid-nochild

# §10.3 — the same rig with a forbidden parentage declared
#   add to stack.rig.json:  "invariants": { "detached": [
#     { "bone": "hand", "notUnder": "arm",
#       "why": "what the hand releases stays where it was released; parented to the
#              swinging arm it would be dragged along with every swing" } ] }
#   → detached.rig.json
```
