# The benchmark ladder

**Live status document.** The rung order, what each rung gates on, how a rung is
scored, and where each one stands today. The survey behind it is
[SPEC_COVERAGE.md](SPEC_COVERAGE.md) — that document is a dated research note and
does not move; this one does.

The corpus is Spine's own official example projects, fetched by
`bun run fetch-examples` into a gitignored `examples/`. They are not
redistributed here; see [NOTICE.md](../NOTICE.md) and §*Licence, per rung* below.

---

## The order

The rungs are **not** attempted in the order their directories are numbered. The
order below is the one the owner fixed:

> **B1 – B3 → rung 3 → 1 · 2 · 4 · 5 → 6 → 8 → 7 → spineboy**

Three things follow from that ordering and each is a reason, not a preference:

- **Rung 3 first.** `3-timing-and-spacing` is the smallest skeleton in the whole
  corpus — 3 bones, 2 slots, 2 animations, no constraints, no meshes — and it
  needs nothing that rungs 1 and 2 do not also need. It is the rung on which
  "can rigc express a foreign skeleton at all" is answered with the least noise
  around the answer.
- **8 before 7.** Rung 8 introduces nothing that rung 6 did not (transform
  constraints, weighted meshes). Rung 7 introduces physics timelines, a keyed
  transform timeline and deform all at once — it is the hardest rung below
  spineboy, and it is also the one with the licence problem below.
- **spineboy last, as the graduation exam.** It is the only rung with IK, events,
  bounding boxes, clipping and unweighted meshes, and it is an order of magnitude
  larger than anything under it.

### Blockers, before rung 1

| # | Blocker | State |
| --- | --- | --- |
| **B1** | **The bone tree is code.** `src/archetype.ts` hard-coded three archetypes; a slot outside the archetype's table was a compile error, and no example fitted any of them. | ✅ **closed 2026-08-22** — the skeleton is a **rig spec** (`spec: "rigc-rig/1"`, [`src/rig.ts`](../src/rig.ts)): bones, slots, skins, attachments, constraints and invariants as data. `src/archetype.ts` is gone. Proof below |
| **B2** | **A16 rejected every example.** `/^4\.3(\.\d+)?$/` failed on the `"4.3.75-beta"` that all twelve example exports declare. | ✅ fixed — A16 accepts `4.3`, `4.3.N` and `4.3.N-<suffix>`; 4.2.x and 5.x still rejected, with a control for each direction |
| **B3** | **The atlas model is one-part-per-page.** rigc emits `bounds: 0,0,w,h` per page and A06 demanded every region cover its page exactly; every example ships a packed atlas (13–50 regions on one page, some rotated). | 🟨 **half done** — the validator half is fixed: A06's full-page/rotation/pma clauses, A08's name-identity clause and A27 now live behind `--profile`, so a packed atlas passes `--profile spine`. The emitter half is untouched: rigc still has **no packer and no importer** for a pre-packed atlas, so reproducing a rung means supplying the example's own atlas alongside the candidate |

---

## How a rung is scored

**Stage 1 — validity.** `bench` runs `validate --profile spine` on the candidate.
This is the only part with a pass/fail: a candidate that is not valid Spine 4.3
has not cleared anything. The `spine-html` profile is deliberately *not* used —
the thing being reproduced is an editor export, and this project's renderer
policy would fail rungs for reasons the rung is not about.

**Stage 2 — structural diff.** `bench` then runs `rigc diff` against the rung's
reference export and prints a ratio per measure across six sections: bones,
slots, attachments, constraints, animations, events.

There is **no rung score.** Section figures are unweighted means of the measures
printed beneath them and are labelled as such; nothing combines the sections. A
single number cannot distinguish a rig with the right skeleton and the wrong
timing from a rig with the right timing and the wrong skeleton, and those call
for opposite fixes. **A rung is marked cleared by a person reading the measures,
and this file is where that judgement is written down.**

**Stage 3 — per-frame pose distance. Named, not built.** The structural diff
compares what the file *says*; it cannot see that two structurally identical rigs
pose differently. The measure for that is **per-frame bone world-transform
distance**: step both skeletons through the same animation at a fixed rate and
compare each bone's world position, rotation and scale frame by frame. It needs a
bone correspondence (a candidate is free to use its own names, so the mapping is
an input, not a derivation) and a distance normalised by skeleton size. **None of
it exists.** Do not report a per-frame figure until it does.

### The honesty rule

⭐ **The authoring agent gets `images/`, a text brief and rendered reference
frames. It does not get the reference JSON.**

The reference export is read by `bench` and by
[`bench/render_reference.ts`](../bench/render_reference.ts), and by nothing else.
An agent that has seen the answer is not being measured on authoring a rig; it is
being measured on transcription, and the resulting number would be worthless in
exactly the way that is hardest to notice afterwards. This applies to the
reference's derived facts too — bone names, key times, curve handles — however
they reach the agent.

The line the rule draws is **what a client watching the finished animation could
tell you**. A human animator is shown the shot; withholding it does not measure
authoring, it measures guessing.

Practically:

- The brief may describe the shot in the terms a human animator would be given:
  what moves, roughly when, what the principle being demonstrated is.
- The agent may look at **rendered frames of the reference**
  ([`bench/reference/`](../bench/reference/), see its README): pixels of the shot
  carry no bone name, key time or curve handle.
- The brief may state each animation's **duration**, and whether the last frame
  returns to the first. Both used to be listed as off limits, and durations
  cannot be: the frames are rendered at a fixed rate over each animation's own
  length, so the frame count states the duration exactly, and rigc requires a
  declared duration anyway. Withholding the number while shipping the frames
  would be theatre.
- The brief may state the atlas, because rigc has no packer (B3) and the atlas is
  a supplied input rather than something the agent authors.
- The brief may **not** carry bone counts, hierarchy, timeline listings, key
  counts, key values, curve data, slot names or the setup pose taken from the
  reference.
- **`bench` is the finish line, not a rung of the authoring loop.** Its measures
  are derived from the reference, so editing a spec in response to them is tuning
  against the answer; a run that does it is labelled *bench-assisted*.
- A rung attempted with the reference in context is recorded as such, or not
  recorded at all.

The written form of all this, per rung and per run:
[`bench/briefs/`](../bench/briefs/) and [`bench/runs/README.md`](../bench/runs/README.md).

---

## Status

⬜ not attempted · 🟨 attempted, not cleared · ✅ cleared

| Order | Rung | Example | Skeletons | New at this rung | Status |
| ---: | --- | --- | --- | --- | :---: |
| — | **B1** | — | — | skeleton-as-data input model | ✅ |
| — | **B2** | — | — | A16 accepts pre-release labels | ✅ |
| — | **B3** | — | — | packed-atlas handling (validator half done) | 🟨 |
| 1 | **3** | `3-timing-and-spacing` | `ess` | nothing — smallest skeleton in the corpus | ✅ |
| 2 | **1** | `1-weight-and-mass` | `balls`, `drop` | `translatex`/`translatey`/`shear`; bone setup `length`; a skeleton with **zero** animations (`drop`) | ⬜ |
| 3 | **2** | `2-the-12-principles` | `ess` | slot `blend` (4 additive + 4 multiply); bone `inherit` ≠ Normal | ⬜ |
| 4 | **4** | `4-wave-principle` | `ess` | nothing structural — a volume test (9 bones, 9 slots, 3 animations, 470 bezier keys) | ⬜ |
| 5 | **5** | `5-squash-and-stretch` | `ess` | **`drawOrder` timeline**; `inherit: onlyTranslation`; non-unit setup scale | ⬜ |
| 6 | **6** | `6-arcs` | `pro` | **transform constraints** (static); **weighted meshes from authored geometry**; mesh `edges` | ⬜ |
| 7 | **8** | `8-follow-through` | `ball`, `pendulum` | nothing — both features arrived at rung 6 | ⬜ |
| 8 | **7** | `7-anticipation` | `sack-pro` | **physics timelines**; a **keyed** transform timeline; **deform**; 20 physics constraints | ⬜ |
| 9 | **spineboy** | `spineboy` | `ess` (+ `pro`, stretch) | **IK**, **events**, **bounding box**, **clipping**, **unweighted meshes**, and scale (67 bones, 52 slots, 11 animations) | ⬜ |

Two facts the table does not repeat, both from SPEC_COVERAGE part 3:

- **No rung uses a named skin.** All twelve example skeletons have exactly one
  skin, called `default`. Named skins, per-skin bones and per-skin constraint
  lists are not on this ladder at all and need some other justification to be
  scheduled.
- **Path constraints, sliders, sequences, linked meshes, dark colour and
  `drawOrderFolder` never appear** anywhere in the corpus. The validator walks
  their timelines (A05 covers all eleven groups) but the ladder will not exercise
  them.

### What passes today

Every one of the twelve example skeletons passes `validate --profile spine`
unmodified — they are editor output, and that is the result the profile split was
supposed to produce. That is a statement about the **validator**, not about rigc's
compiler.

What exists below (B1's proof) is transcription, not authoring, and the
difference between the two is the whole of the honesty rule.

### Rung 3 — cleared (2026-08-23)

The first honest authoring run: [`bench/runs/2026-08-23-rung3-1/`](../bench/runs/2026-08-23-rung3-1/),
authored by Claude Opus 5 (1M context) on Claude Code / Agent SDK, from the brief
([`bench/briefs/3-timing-and-spacing.md`](../bench/briefs/3-timing-and-spacing.md))
and the rendered reference frames alone, under the honesty rule above — **1 build
iteration, validator green on the first compile, clean run** (`bench` run once, at
the end, nothing edited after).

`bench 3`, from [`bench.json`](../bench/runs/2026-08-23-rung3-1/bench.json):

```
bones=0.567  slots=0.476  attachments=0.870  constraints=1.000  animations=0.911  events=1.000
```

**Reading — the commander's call, 2026-08-23.** `bones`/`slots` read low on
**naming only**: bone `count` is 3/3, and both name-agnostic measures —
`depth_histogram` 3/3, `degree_sequence` 3/3 — say the tree has the same number of
bones at each depth and the same child counts, i.e. it is structurally identical;
the tree is right and the vocabulary is different. `constraints`/`events` are
1.000 by absence — vacuous, not evidence of anything. `attachments` (0.870) is as
close as a differently-named rig can get: skin count, attachment count and type
counts are all exact. `animations` (0.911) holds on everything structural —
`count` 2/2, `names` 2/2, `duration` 2/2, `timeline_kinds` 8/8 — the agent
independently chose single-axis `translatex`/`translatey` timelines for the block,
matching the export. The one real gap is key density, `key_counts` 42/69: the
author under-keys by about a third, because 12 fps reference frames cannot show
where the editor split a curve.

Frame-based fidelity (the author's self-check against the reference frames, not
the reference export, so no part of the score above): worst-frame 2.42° of
pendulum rotation, about one frame pixel of block travel, and a re-render mean
absolute pixel error of 3.4/255. Residual risk carried forward: key density — it
is not a visible defect at this rung.

---

## B1's proof — rung 3 transcribed, not authored

⚠️ **Read the label first.** `bench/transcriptions/3-timing-and-spacing/` holds a
rig spec and a motion spec produced by a throwaway script that read the reference
export and rewrote its numbers. That is **transcription**, and it measures
expressiveness — *can rigc's input formats state this skeleton at all?* — which is
exactly the question B1 was. It measures nothing about authoring, so **rung 3 stays
⬜ and the honesty rule is untouched**: an authoring attempt gets `images/` and a
brief, and it has not happened.

Compiled with:

```bash
bun cli.ts build \
  --rig    bench/transcriptions/3-timing-and-spacing/3-timing-and-spacing-ess.rig.json \
  --motion bench/transcriptions/3-timing-and-spacing/3-timing-and-spacing-ess.motion.json \
  --images examples/3-timing-and-spacing/images \
  --out    <dir> --profile spine
bun cli.ts bench 3 --candidate <dir>
```

`bench 3`, verbatim (2026-08-22):

```
  ── summary ──
  validate   green  (profile spine)
  ess        bones=1.000  slots=1.000  attachments=1.000  constraints=1.000  animations=1.000  events=1.000
```

```
    bones         mean 1.000  over 8 measures
        1.000  count                  3/3         how many bones
        1.000  names                  3/3         the bone names themselves
        1.000  parent_by_name         3/3         each bone hangs off the same parent
        1.000  order                  3/3         the bones are declared in the same order
        1.000  length_present         3/3         a setup `length` is present or absent alike
        1.000  inherit_present        3/3         a setup `inherit` is present or absent alike
        1.000  depth_histogram        3/3         NAME-AGNOSTIC: as many bones at each depth
        1.000  degree_sequence        3/3         NAME-AGNOSTIC: as many bones with each child count

    slots         mean 1.000  over 7 measures
        1.000  count                  2/2         how many slots
        1.000  names                  2/2         the slot names themselves
        1.000  order                  2/2         the slots array IS the draw order, so its order is data
        1.000  bone                   2/2         each slot is bound to the same bone
        1.000  attachment             2/2         each slot shows the same setup attachment
        1.000  blend                  2/2         each slot uses the same blend mode
        1.000  color_present          2/2         a tint is present or absent alike

    attachments   mean 1.000  over 9 measures
        1.000  skins                  1/1         the skin names
        1.000  count                  2/2         how many attachments
        1.000  names                  2/2         skin/slot/attachment keys
        1.000  type_counts            2/2         as many of each attachment type
        1.000  mesh_vertices          0/0         each mesh has the same vertex count  — neither side has any
        1.000  mesh_triangles         0/0         each mesh has the same triangle count  — neither side has any
        1.000  mesh_weighted          0/0         each mesh is weighted, or is not, alike  — neither side has any
        1.000  mesh_hull              0/0         each mesh declares the same hull length  — neither side has any
        1.000  region_size_present    2/2         each region states width and height, or does not, alike

    constraints   mean 1.000  over 5 measures
        1.000  count                  0/0         how many constraints  — neither side has any
        1.000  names                  0/0         the constraint names  — neither side has any
        1.000  type_counts            0/0         as many of each constraint type  — neither side has any
        1.000  type_by_name           0/0         each constraint is the same type  — neither side has any
        1.000  refs                   0/0         each constraint names the same bones and slots  — neither side has any

    animations    mean 1.000  over 9 measures
        1.000  count                  2/2         how many animations
        1.000  names                  2/2         the animation names
        1.000  duration               2/2         each animation runs as long (last key time, within one frame)
        1.000  timeline_kinds         8/8         the same timelines exist
        1.000  key_counts             69/69       those timelines carry as many keys
        1.000  curve_kinds            69/69       as many linear / stepped / bezier keys
        1.000  event_keys             0/0         as many event firings  — neither side has any
        1.000  draw_order             2/2         a draw-order timeline is present or absent alike
        1.000  deform                 2/2         a deform timeline is present or absent alike

    events        mean 1.000  over 2 measures
        1.000  names                  0/0         the event names  — neither side has any
        1.000  payloads               0/0         each event carries the same typed payload  — neither side has any
```

Four of those measures are **vacuous** and say so (`0/0`, "neither side has any"):
the mesh figures and every constraint and event figure. A rung with meshes or
constraints will not get them for free.

### What the transcription cost — two motion-spec extensions

Both were structural gaps rather than inconveniences, so both were closed in the
format rather than worked around in the transcription:

1. **Single-axis bone timelines.** `translatex`, `translatey`, `scalex`, `scaley`,
   `shear`, `shearx`, `sheary` joined `translate`/`scale`/`rotate`. Not sugar:
   Spine keys them as separate timelines, so an export that used `translatex`
   alone is not reproduced by a `translate` whose y channel is flat — the key
   counts differ, and `animations.key_counts` would have caught the difference.
   Rung 3 needed two of them; rungs 1 and 5 need the rest.
2. **A raw `curve` on a key**, holding the absolute (time, value) control points
   verbatim. A named easing can only say "this shape, wherever it is used"; an
   editor export carries a different bezier per key per channel, and rung 3's 54
   bezier keys share no handles at all. Named easings stay rule 2's recommended
   path — a key may carry `ease` or `curve`, never both — and the raw array is
   length- and finiteness-checked on the way in, because a short one multiplies
   `undefined` into the cubic and yields NaN with no error.

Nothing else had to move. In particular the emitted `skeleton.json` needed no new
attachment type, no new constraint type and no packer: rung 3's own atlas was not
required, because rigc emitted a one-part-per-page atlas from the two loose PNGs in
`images/` (which is why B3's emitter half did not block this).

---

## Licence, per rung

The examples are Esoteric Software's. Their `license.txt` grants image
redistribution **only when accompanied by that file**, and **never for commercial
use**; the project files and exports are public domain.

🚫 **Rung 7 (`7-anticipation`) has no `license.txt` upstream at all.** Its images
are covered by no explicit grant, so:

- Measure against it — reading a file is not redistribution.
- **Never vendor, commit, publish or ship its images**, and never include them in
  a released artefact of any kind.
- `scripts/fetch-examples.sh` names it in its closing warning for this reason.

`examples/` is gitignored for the whole corpus, which keeps the general case
right by construction; rung 7 is the case where a one-off "just this once" copy
would be a licence problem rather than a tidiness problem.

---

## Running a rung

```bash
bun run fetch-examples                 # once; examples/ is gitignored
bun bench/render_reference.ts --rung 3 # the frames the authoring agent may see
bun cli.ts bench 3 --candidate path/to/candidate/spine
bun cli.ts bench 3 --candidate candidate.json --atlas some.atlas --json report.json
```

A rung is *run* rather than benched: a fresh agent, the brief in
[`bench/briefs/`](../bench/briefs/), the frames in [`bench/reference/`](../bench/reference/),
and the protocol in [`bench/runs/README.md`](../bench/runs/README.md).

`bench <rung>` takes `1 … 8` or `spineboy`. Rungs 1 and 8 carry two skeletons and
both are benched and reported. `spineboy-pro` is reported as a **stretch** figure
and does not count towards the rung: it is a harder rig than the graduation exam,
and folding it in would make the exam unpassable for a reason unrelated to
passing it.

`bench` exits non-zero only when stage 1 fails. The diff has no threshold, so it
cannot fail — read it.
