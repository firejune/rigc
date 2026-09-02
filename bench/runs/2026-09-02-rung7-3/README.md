# Rung 7 — `7-anticipation`, attempt 3

- date:      2026-09-02
- agent:     Claude Opus 5 (1M context), Claude Code / Agent SDK
- brief:     [`bench/briefs/7-anticipation.md`](../../briefs/7-anticipation.md) **revision 3**, 2026-08-28, third-party verified
- guide:     [AUTHORING.md](../../../docs/AUTHORING.md) §10 in hand; [GATE.md](../../../docs/GATE.md) (the clause statements) in hand
- profile:   spine
- reference: **not read.** No `examples/*/export/*.json`, no `bench/transcriptions/`, no
  `docs/LADDER.md` status table / per-rung section / *Operating rules*, no
  `docs/SPEC_COVERAGE.md`, no `src/ladder.ts` gate strings, no issue bodies, no git
  history. One disclosure, at the finish line: `bench`'s console `gates` line —
  [`LOOP.md`](LOOP.md) *Result*.
- inherited: **yes** — the rig spec and motion spec of
  [`2026-08-28-rung7-2`](../2026-08-28-rung7-2/), under item 10 of *What a run may read*.
  Its `README.md`, `LOOP.md`, `bench.json` and stored `check` output were **not** opened.
  Stage 0 (the mandatory unchanged recompile) is [`check-baseline-inherited/`](check-baseline-inherited/).
- bench:     run **once**, after the last edit. Not bench-assisted.

## The inputs

The brief; the frames, rendered here with the brief's exact commands into the gitignored
`bench/reference-local/7-anticipation/` (12 sets: 102 frames at 12 fps across four shots,
plus two-frame 24 fps and 30 fps sets with contact sheets); the art in
`examples/7-anticipation/images/`; `docs/AUTHORING.md`, `docs/MOTION.md`, `docs/GATE.md`,
`bench/runs/README.md`; this repository's `src/`; and the example's own `.atlas` — opened
only at the end as `--texture-from`, never as `--atlas`.

🚫 **No frame of this rung, and nothing rendered from one, is committed.**
`git ls-files bench/reference-local` reports **0**, checked before every commit. The two
viewers in [`tools/`](tools/) refuse a destination inside the repository by path check.

## What was built

The inherited candidate, repaired. One skeleton, 8 bones, 3 slots, 4 animations: the sack
is a weighted mesh on a four-bone chain, the cape's collar and rear panel are regions on
one bone each, and the draw order is `cape-back`, `sack`, `cape-front` — the panel behind
and the collar in front, which is what the brief's revision 3 settles by measurement and
what this run then confirmed build-side ([`evidence/draw-order-swap.txt`](evidence/draw-order-swap.txt)).

Three repairs, all of them to the motion spec; the rig spec is unchanged from the
inherited one. Full working in [`LOOP.md`](LOOP.md).

1. **`walk`'s collar was ~80 px out of place for its first three frames** — drawn across
   the sack's hem where the frames put it at the neck. §5.
2. **The rest pose was not shared.** The brief states that `fall-in`'s last frame,
   `hello`'s first and `cape-follow-example`'s first are one standing pose, to within
   9, 22 and 31 silhouette pixels of ~10,245. The inherited fit had found the collar in
   **one** of them (`fall-in`, 88 % agreement, `check` drift 0.19 px) and left the other
   two on an unescaped seed — translate ≈ `(150, -180)`, rotate ≈ `40°`, scale ≈ `0.8`,
   the same values `walk/f0000` carried. Fixed by copying the pose across with a
   body-translation compensation, then descending per frame. §6.
3. **A broad collar refit was tried and rejected** because it bought slot residual with
   composite quality on nine frames. §9, and the veto it produced.

## The measures

### `bench 7`, verbatim

`bun cli.ts bench 7 --candidate bench/runs/2026-09-02-rung7-3/spine --frames bench/reference-local/7-anticipation --json bench.json`

The full report is [`bench.json`](bench.json). The console transcript was **not** stored:
`bench` prints a `gates` line naming a reference-side count, which is a forbidden fact and
is exactly what issue #137 removed from `bench.json` — the same hand redaction
`2026-08-24-spineboy-3` made.

```
  ── validate (profile spine) ──
    15 PASS, 0 FAIL, 10 SKIP, 14 PROF (7 renderer-policy and 7 archetype assertions do not apply)

  ── diff vs 7-anticipation/sack-pro ──
    ..         bones=8/31  slots=3/3  skins=1/1  attachments=3/3  constraints=0/24  animations=4/4  events=0/0   (candidate/reference)

    bones                 mean 0.128  over 8 measures
        0.258  count                        8/31        how many bones
        0.054  names                        2/37        the bone names themselves
        0.032  parent_by_name               1/31        each bone hangs off the same parent
        0.065  order                        2/31        the bones are declared in the same order
        0.065  length_present               2/31        a setup `length` is present or absent alike
        0.032  inherit_present              1/31        a setup `inherit` is present or absent alike
        0.258  depth_histogram              8/31        NAME-AGNOSTIC: as many bones at each depth
        0.258  degree_sequence              8/31        NAME-AGNOSTIC: as many bones with each child count

    bones (name-agnostic) mean 0.213  over 5 measures
        0.258  count                        8/31
        0.258  depth_histogram              8/31
        0.258  degree_sequence              8/31
        0.161  shape_histogram              5/31
        0.129  order_shape                  4/31

    slots                 mean 0.857  over 7 measures
        1.000  count                        3/3         how many slots
        1.000  names                        3/3         the slot names themselves
        1.000  order                        3/3         the slots array IS the draw order, so its order is data
        0.000  bone                         0/3         each slot is bound to the same bone
        1.000  attachment                   3/3         each slot shows the same setup attachment
        1.000  blend                        3/3         each slot uses the same blend mode
        1.000  color_present                3/3         a tint is present or absent alike

    slots (name-agnostic) mean 0.333  over 4 measures
        1.000  count                        3/3
        0.333  attachment_types_by_position 1/3
        0.000  bone_binding_shape           0/3
        0.000  order_shape                  0/3

    attachments           mean 0.407  over 9 measures
        1.000  skins                        1/1         the skin names
        1.000  count                        3/3         how many attachments
        1.000  names                        3/3         skin/slot/attachment keys
        0.333  type_counts                  1/3         as many of each attachment type
        0.000  mesh_vertices                0/3         each mesh has the same vertex count
        0.000  mesh_triangles               0/3         each mesh has the same triangle count
        0.333  mesh_weighted                1/3         each mesh is weighted, or is not, alike
        0.000  mesh_hull                    0/3         each mesh declares the same hull length
        0.000  region_size                  0/2         NAME-AGNOSTIC: as many regions of each stated size

    constraints           mean 0.000  over 5 measures
        0.000  count                        0/24        how many constraints
        0.000  names                        0/24
        0.000  type_counts                  0/24
        0.000  type_by_name                 0/24
        0.000  refs                         0/24

    animations            mean 0.798  over 9 measures
        1.000  count                        4/4         how many animations
        1.000  names                        4/4         the animation names
        1.000  duration                     4/4         each animation runs as long (last key time, within one frame)
        0.260  timeline_kinds               47/181      the same timelines exist
        0.528  key_counts                   672/1273    those timelines carry as many keys
        0.645  curve_kinds                  821/1273    as many linear / stepped / bezier keys
        1.000  event_keys                   0/0         as many event firings  — neither side has any
        1.000  draw_order                   4/4         a draw-order timeline is present or absent alike
        0.750  deform                       3/4         a deform timeline is present or absent alike

    events                mean 1.000  over 2 measures
        1.000  names                        0/0         — neither side has any
        1.000  payloads                     0/0         — neither side has any
```

### `check` vs the frames — all 12 sets

Full output in [`check.txt`](check.txt), [`check-all-frames.txt`](check-all-frames.txt),
[`check.json`](check.json); the texture decomposition in
[`check-texture-from.txt`](check-texture-from.txt). Framing: **10 of 12 sets took
`frames.json`'s own box** (`extent-spread`); `walk@24fps` and `walk@30fps` refused it on
`coordinates` and are measured in the one shared framing (`x0.999059`, offset
−1.03, −1.03 px, rms 9.41 px over 472 edges).

| set | worst attributable drift | frames with no drift | changeDisagreements | drawnRatio | sheet worst ÷ mean | mean MAE | MAE over the reference's pixels | slots blank |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cape-follow-example` | 3.94 px `sack` f0022 | 7/37 | 0 | 0.959 | — | 22.48 | 23.46 | `cape-back` |
| `cape-follow-example@24fps` | 0.59 px `cape-front` | 0/2 | 0 | 0.993 | 2.64 | 13.87 | 14.58 | `cape-back` |
| `cape-follow-example@30fps` | 0.59 px `cape-front` | 0/2 | 0 | 0.993 | 2.56 | 13.90 | 14.61 | `cape-back` |
| `fall-in` | 2.98 px `sack` f0000 | 7/21 | 0 | 0.979 | — | 17.41 | 17.92 | `cape-back` |
| `fall-in@24fps` | 2.98 px `sack` | 0/2 | 0 | 0.952 | 3.11 | 19.62 | 20.28 | `cape-back` |
| `fall-in@30fps` | 2.98 px `sack` | 0/2 | 0 | 0.952 | **3.23** | 19.62 | 20.29 | `cape-back` |
| `hello` | 3.72 px `cape-front` f0003 | 20/35 | 0 | 0.977 | — | 23.26 | 24.40 | `cape-back` |
| `hello@24fps` | 0.20 px `cape-front` | 1/2 | 0 | 0.965 | 1.86 | 19.68 | 20.37 | `cape-back` |
| `hello@30fps` | 0.20 px `cape-front` | 1/2 | 0 | 0.967 | 1.81 | 19.21 | 19.87 | `cape-back` |
| `walk` | 1.24 px `cape-front` f0004 | 2/9 | 0 | 0.962 | — | 20.12 | 20.88 | `cape-back` |
| `walk@24fps` | 0.62 px `cape-front` | 1/2 | 0 | 0.954 | 1.29 | 18.02 | 18.46 | `cape-back`, `sack` |
| `walk@30fps` | 0.73 px `cape-front` | 1/2 | 0 | 0.955 | 1.25 | 17.64 | 18.06 | `cape-back`, `sack` |

Chains, across every set: `sack1` worst 3.94 px (`sack` in `cape-follow-example/f0022`),
`collar` worst 3.72 px (`cape-front` in `hello/f0003`), `panel` **no slot attributable in
any set**. Texture floor, from `--texture-from` against the example's own atlas:
**1.78–1.94**, accounting for **1.3–2.4 %** of each set's figure.

### Against stage 0 — what the repairs moved

| | stage 0 (inherited, unchanged) | this candidate |
| --- | --- | --- |
| worst attributable drift, any set | 3.9 px | 3.94 px |
| sets attributing **nothing at all** | **2** (`hello@24fps`, `hello@30fps`) | **0** |
| `cape-front` blank in | 2 sets | **0 sets** |
| `sack` blank in | 4 sets | **2 sets** (`walk@24fps`, `walk@30fps`) |
| `cape-back` blank in | 12 sets | 12 sets |
| `changeDisagreements` | 0 everywhere | 0 everywhere |
| worst sheet ratio | 3.23 (`fall-in@30fps`) | 3.23 (`fall-in@30fps`) |
| mean MAE, best-improved sets | `cape-follow@24fps` 20.59 · `hello@24fps` 26.51 · `hello@30fps` 26.05 · `walk@30fps` 20.79 | **13.87 · 19.68 · 19.21 · 17.64** |

⚠️ **`hello`'s worst drift rose, 2.1 px → 3.72 px, and that is not a regression.** f0003
read a *blank* at stage 0 and reads 3.72 px now; a figure appearing where there was none
moves a worst-of. Nothing that had a drift got a worse one, and the set's
`framesWithoutDrift` fell 22/35 → 20/35.

## The reading — the author's, clause by clause, and not a verdict

Tracked against [GATE.md](../../../docs/GATE.md) v2.2 to know when to stop. The verdict is
a separate adjudication.

| clause | the author's reading |
| --- | --- |
| **G1** validity | `validate --profile spine` **0 FAIL**. Met. |
| **G2** ≤ 6.0 px | worst attributable slot drift **3.94 px**, in the worst of the twelve sets. Met, with 2.06 px of margin. |
| **G2** 🕳️ set limb | no set has `framesWithoutDrift` equal to its frame count. No hole. |
| **G2** per-slot limb | **two read-downs asked for**, and the evidence for each is measured and named below: `cape-back` in all 12 sets, `sack` in `walk@24fps` and `walk@30fps`. `cape-front` is attributable in all 12. |
| **G3** per-frame motion | `changeDisagreements` **0** in every set; worst `drawnRatio` **0.993**, so no `⚠️ overdraw`. Met. |
| **G4** shot inventory | `animations.count` **1.000**, `animations.names` **1.000**. Length limb, the declared durations against `bench`'s own within-one-frame reading of `animations.duration` (**4/4**): `fall-in` 1.6667 s, `hello` 2.8667 s, `walk` 0.6667 s, `cape-follow-example` 3.0000 s — the brief's table, which pins each by frame counts at three rates. Met. |
| **G5** drawn inventory | name-agnostic `slots.count` **1.000** (3/3) and `attachments.count` **1.000** (3/3), both ≥ 0.85, with **no deduction claimed**. Met. |
| **G7** contact sheets | worst tile ÷ that sheet's own mean, over the eight sets that have one: 2.64, 2.56, 3.11, **3.23**, 1.86, 1.81, 1.29, 1.25 — all ≤ 3.5. Met, tightest at `fall-in@30fps` with 0.27 of margin. The four 12 fps sets commit every sampled frame and have no sheet, so G7 SKIPs there under the clause's first case. |
| **G6** | one skeleton, so G6 is G1–G5 and G7 on it. |

### The two read-downs, with their evidence

**`cape-back` — all 12 sets. The blank is a property of the shot, not of this rig.**

- **A ceiling, measured.** [`evidence/panel-ceiling.txt`](evidence/panel-ceiling.txt): per
  frame, the crimson the sack is **not** in front of (crimson reachable from the frame
  border through {backdrop, crimson} without crossing beige, 4-connected, raw masks,
  drawn at 8/255, cape ⇔ `g − b ≤ 8`) divided by the smallest oriented rectangle covering
  it. **5–19 %** across all 102 frames, corpus maximum 19 %. `check`'s template pass needs
  roughly **75 %** agreement on a slot's own pixels — calibrated on `cape-front`, which is
  attributable exactly where its own agreement is 77–88 % and never below. ⇒ **no
  placement, scale, rotation, pivot or region-versus-mesh choice attributes this slot at
  the declared box.** `hidden` is 0 or single digits on every frame, which is the reason:
  the visible cape is a rim around a solid body, so any filled attachment covering the rim
  covers the body too, and the matcher scores a slot over the pixels it *draws*, occluded
  ones included.
- **The placement, measured another way.** [`evidence/pin.txt`](evidence/pin.txt):
  translate the bone's whole track by whole frame pixels and read the set's mean
  `maeReference`. The minimum is at **0 px** in the four 12 fps sets and within 1 px in the
  eight two-frame sets; the figure rises **+1.13 to +4.38 at 6 px**; it passes +1 % at
  **2 px** (3 px in `walk@24/30fps`). The render is deterministic, so any rise is a real
  disagreement with the picture. ⭐ The instrument carries its own control: for
  `cape-front`, the slot `check` *does* attribute in every set, it reads minimum at 0 and
  +1 % at 1–2 px, against `check`'s 0.20–1.7 px. ⇒ the panel is pinned by the frames to
  **≤ 2–3 px**, inside G2's own 6.0 px.
- **The depth, by the brief's own method with the brief's own control.**
  [`evidence/draw-order-swap.txt`](evidence/draw-order-swap.txt): panel-behind beats
  panel-in-front by **86–94** over 9,588–184,098 deciding pixels in **all twelve sets**,
  separating **x8.4–15.3** against the collar edge's **x2.0–8.2** — and the collar edge is
  the one the frames already settle.
- **Two shapes that would clear the matcher were rejected as gaming it**, with the reason
  recorded: a U-shaped or annular mesh hull hugging the visible rim (that is precisely the
  reading the brief's revision 3 writes down as the one the frames do *not* support), and
  keying the slot empty where the panel is fully occluded (which would silence the limb
  about a part that is there — the failure the limb exists to catch).

**`sack` — `walk@24fps` and `walk@30fps`. A flat correlation peak, not a misplacement.**
Those two sets commit f0000 and f0016 / f0020 and nothing between. The same shot's 12 fps
set attributes the sack at **0.8 px** (f0001). At the two committed instants the matcher's
own numbers are residual **14.6** and **18.6** against **115** of contrast — 13–16 % — with
confidence 0.15 against a 0.17 bar and 0.12 against 0.19: a large smooth beige shape on a
large smooth beige shape has almost no peak. Two refits, one with the search narrowed to a
pure relocation, moved it **not at all**, so it is at the frames' own optimum there; and
`pin` puts it at minimum 0 px, +1 % at **1 px**, +7.25 at 6 px.

## What is known-wrong, and what was not attempted

- **`constraints` reads 0.000 on all five measures** (0/24). This candidate declares no
  constraints; the sack's shape is a weighted mesh on a bone chain, keyed. Whether that is
  the reference's mechanism is not something the frames decide, and the brief says so.
- **`bones.count` 8/31** and `timeline_kinds` 0.260. The rig is far smaller than the
  reference's. Nothing in the frames asks for more bones than the shapes need, and the
  brief leaves the count to the author.
- **`mesh_vertices`, `mesh_triangles`, `mesh_hull` read 0.000**, and `deform` 0.750 — the
  sack deforms through **weighted bones** here, not through a deform timeline. The brief
  proves a deforming attachment is required and explicitly leaves *how much, and how*
  open.
- **`hello` still reads no drift on 20 of its 35 frames**, and `cape-follow-example` on 7
  of 37. Those are frames where no slot's correlation peaks, not frames known to be
  misplaced; the `pin` instrument reads all three bones at minimum 0 px in both sets.
- **`fall-in` was not refitted.** It is the shot whose rest pose the other two were
  repaired *from*; its own figures are unchanged from stage 0.
- **The mesh is region-shaped and the panel is a plain region.** No attempt was made to
  give the cape a deforming attachment: the brief states outright that the frames cannot
  decide whether either cape part deforms, and that the sack's verdict must not be read
  across to it.

## What the guide should have said

The full list with its measurements is in [`LOOP.md`](LOOP.md) *Notes*. The two that would
have changed this run:

1. ⭐ **[AUTHORING.md](../../../docs/AUTHORING.md) §9 should state what a slot needs to be
   attributable at all** — about **75 %** agreement between its own drawn pixels and the
   frame under them — and that a part drawn behind another over a flat backdrop cannot
   reach it, because the matcher scores the pixels a slot *draws* and not the ones it
   shows. Two attempts at this rung have now spent budget rediscovering that the cape's
   rear panel has no reading here. It is a five-minute measurement once you know to make
   it.
2. ⭐ **A per-part fit needs the frame's own figure as a veto**, and §9 should name the
   three escapes: a mean over the part's current pixels shrinks it, a whole-frame objective
   cannot see it, and a windowed objective lets it leave the window. All three look like
   progress in the objective being optimised; all three are the search making the part stop
   being measured.
