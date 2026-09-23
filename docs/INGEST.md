# Working with a skeleton you did not author

**Read this when what you were handed is already a skeleton.** It is written for an
agent holding a `skeleton.json` — plus its `.atlas` and page images — that came out
of the Spine editor or another tool, and that has been asked to work *with* it:
understand it, answer a complaint rigc raised about it, re-express it as rigc specs,
normalise or re-pivot it, or extend it with motion it does not have.

[AUTHORING.md](AUTHORING.md) is the file formats, the failure map and the CLI — read
it first and keep it open; this page never restates a field it documents.
[MOTION.md](MOTION.md) is what goes *between* two poses. This page is the third
question neither of them answers: **what the toolchain will and will not do with
somebody else's file, and what the honest routes through it are.**

🔓 **Nothing in this repository's benchmark protocol applies to you.** No reading is
forbidden, no reference is sealed, no attempt is scored, and no rung is being
attempted. Those rules exist to keep one *measured experiment* honest; you are
working on somebody's own data. Where this page points at a stored transcription it
is pointing at **worked precedent you are meant to read**, not at a candidate you are
not allowed to see. AUTHORING's own exemption line says the same thing from the
authoring side.

🚨 **The two numbers this page produces are not grades, and they measure different
things.** `validate`'s red says *this file breaks a stated rule* — a fact about the
file, not about your work, and sometimes (§3.2) a fact about the rule. `diff`'s
ratios say *how much of a particular reference's structure your candidate
reproduces* — so deliberately extending or renaming a foreign skeleton **lowers
them**, by design (§4.2, §4.3). Neither one has a pass bar, and this page does not
invent one.

- Formats and the CLI reference: [README.md](../README.md)
- The rig spec, field by field: **AUTHORING §3**, and [`src/rig.ts`](../src/rig.ts)
- The motion spec, field by field: **AUTHORING §4**
- Named failures, and the file each one points at: **AUTHORING §5–§6**
- The coordinate contract, in one place: **AUTHORING §11.2** and
  [`src/transform.ts`](../src/transform.ts)
- What the editor does when nobody tells it otherwise: **AUTHORING §10**
- Why the re-pivot in **§4.1** is shaped the way it is, and the child-bone row it
  warns about worked on a bone that actually has one: [RIGGING.md](RIGGING.md) §3.
  Its §2 is how to tell whether the pivot you are moving *to* is identified at all
- What the format holds and what rigc covers, skeleton by skeleton:
  [SPEC_COVERAGE.md](SPEC_COVERAGE.md)
- If you are the *person operating* an agent rather than the agent:
  [PROMPTING.md](PROMPTING.md)

---

## 0. What the toolchain can do with a file you were handed

Two facts decide everything below, and they pull in opposite directions:

1. **rigc reads compiled skeleton JSON in more places than you would guess.**
   `validate`, `render`, `preview`, `vote`, `check`, `diff` and — since #569 —
   `ingest` all take a `skeleton.json` path directly, and none of them needs a rig
   spec to do it.
2. **rigc still cannot EDIT one.** There is no command that opens a skeleton and
   changes it. The only thing that produces a skeleton is `build`, and `build`'s
   input is a rig spec plus a motion spec.
   ⇒ **Every route that ends in a changed file goes through the specs** — and
   since #569 there are two ways to get them: write them (§2, transcription) or
   have `ingest` write them for you from the file itself (§2.0).

   ⚠️ This clause read *"rigc cannot write one back… no route from skeleton JSON
   to specs"* until 2026-09-17, and the half that was wrong is the second half.
   The route exists now and its contract is an equality — `build(ingest(x))` is
   `x`, byte for byte — which is a stronger statement than anything transcription
   could make. What survives is the first half: nothing **edits** a skeleton, and
   the specs remain the only thing a change is expressed in.

### 0.1 The table

Every row was executed against the fetched example corpus before it was written down.
`3-timing-and-spacing` and `spineboy` are the two skeletons this page uses; both carry
an upstream `license.txt` (Appendix, and [NOTICE.md](../NOTICE.md)).

| Command | Takes a foreign `skeleton.json`? | What it needs, and what it gives back |
| --- | --- | --- |
| **`validate <skeleton.json>`** | ✅ **yes — this is its foreign-data form** | the `.json`, plus one `.atlas` beside it or named with `--atlas`. Runs the assertions and prints `PASS`/`FAIL`/`SKIP`/`PROF` per rule, naming the profile that judged it. §1.1 |
| **`render --candidate <skeleton.json>`** | ✅ **yes** | PNG frames plus a contact sheet, per animation. ⭐ **It does not gate** — it drew all seven frames of `spineboy-pro`'s `hoverboard` while `validate` was failing that same file, which is how the rule rather than the file was found to be wrong (§3.2) |
| **`preview --candidate <skeleton.json>`** | ✅ **yes** | one self-contained `.html` that plays it in the official Spine Web Player. Needs a network the first time it is opened ([NOTICE.md](../NOTICE.md)) |
| **`vote --candidate <a> --candidate <b>`** | ✅ **yes, on either side** | a ballot page. Pairing a foreign export against your own transcription is a legitimate ballot, and the panes carry no paths |
| **`check --candidate <skeleton.json> --frames <dir>`** | ✅ **yes** | ⭐ it reads **frames and never a reference skeleton**, so a foreign export enters this one *twice over*: as the candidate, or — via `render` — as the source of the frames. §1.4 |
| **`diff <candidate.json> <reference.json>`** | ✅ **yes, both sides** | 49 structural measures over bones, slots, attachments, constraints, animations and events. ⛔ **Blind to every coordinate** — §1.3 |
| **`ingest <skeleton.json> --out <dir>`** | ✅ **yes — and it is the only reader that WRITES specs** | the `.json` alone; no atlas, no art, no project file. Out come `rig.json`, `motion.json` and a findings report, such that `build`ing them reproduces the skeleton it read **byte for byte — for a skeleton rigc emitted**. ⚠️ For an editor export the claim is weaker and measured: `diff` at 1.000 with three kinds of benign difference left, which §2.3 states in full. The seventh reader, and the one that ends §2's hand work — §2.0 and §5 |
| **`pose --images <dir> --frame <png>`** | ⛔ **not the skeleton** | loose part PNGs and one picture. A packed atlas page is not loose parts, and pointing it at one produces a confident answer about nothing — §5 |
| **`explain --rig … --motion … --out …`** | ⛔ **no** | rig spec + motion spec. It explains **what you wrote**, which makes it a transcription instrument rather than a reading one — §1.5 |
| **`build --rig … --motion … --images …`** | ⛔ **no** | specs in, skeleton out. The only writer in the toolchain, and the reason §2 exists |
| **`build … --atlas-in <file.atlas>`** | ⛔ not the skeleton — **but yes, the foreign *atlas*** | resolves your parts against the regions of a pack somebody else made, joining on region name. The one place a foreign *file* becomes an input to `build`. It applies the page's `scale:`, so an imported size is the drawing's rather than the pack's — §2.3 |
| **`build … --pack`** | ⛔ **no** | puts your own loose parts onto shared pages instead of one page per part, losslessly. Not foreign input, but it is what makes a transcription's atlas comparable in shape to an export's — §2.3 |
| **`bench <rung> --candidate …`** | ✅ mechanically | it is the *benchmark's* instrument: it knows which corpus example is which rung and measures against that one. Not an ingest instrument, and named here only so nobody reaches for it. Use `diff` and `check` directly |

### 0.2 Two path shapes, and why the directory form is not yours

`validate`, `render`, `preview`, `check`, `vote` and `bench` all accept either a
**directory** or a **`.json` file**. The directory form resolves to `skeleton.json` +
`skeleton.atlas` — **rigc's own output names**. A foreign export directory is named
after whatever the editor called the project, so the directory form finds nothing:

```bash
rigc validate examples/3-timing-and-spacing/export
```

```
rigc validate …/examples/3-timing-and-spacing/export/skeleton.json
  ..    atlas …/examples/3-timing-and-spacing/export/skeleton.atlas
…
ENOENT: no such file or directory, open '…/examples/3-timing-and-spacing/export/skeleton.json'
```

⚠️ **That one comes back as a stack trace, exit 1, rather than a named refusal.** It
is the only complaint on this page that does — everything in §3.1 is a sentence. Do
not read the trace as *rigc cannot open this export*; read the two `..` lines above
it, which name the two files it went looking for. ⇒ **Point every command at the
`.json` itself.** Every command line on this page does.

The atlas then resolves by looking beside the skeleton, and that lookup refuses
rather than guesses:

| What is beside the `.json` | What happens |
| --- | --- |
| exactly one `.atlas` | it is used, and the report names it |
| no `.atlas` | ⛔ `no .atlas beside …; name one with --atlas <path>` |
| two or more | ⛔ refuses and lists them — see below |
| any of the above, with `--atlas <path>` | `--atlas` wins outright |

```bash
rigc validate examples/spineboy/export/spineboy-pro.json
```

```
rigc: 2 atlases beside …/examples/spineboy/export/spineboy-pro.json (spineboy-run.atlas,
spineboy.atlas); name the right one with --atlas <path> — guessing by filename is how
an attachment quietly resolves against the wrong page
```

⭐ **This refusal is worth understanding rather than working around, because the
obvious heuristic is wrong on this very file.** `spineboy-ess` shares a longer
filename prefix with `spineboy-run.atlas` than with the `spineboy.atlas` it actually
uses. Pick by prefix and every attachment resolves against a page that does not
contain it — and §3.2 shows what that looks like when you get it wrong, which is a
failure two rules downstream of the choice.

---

## 1. Reading it

### 1.1 `validate` — what the file is, and what rigc objects to

```bash
rigc validate examples/3-timing-and-spacing/export/3-timing-and-spacing-ess.json
```

```
rigc validate …/examples/3-timing-and-spacing/export/3-timing-and-spacing-ess.json
  ..    atlas …/examples/3-timing-and-spacing/export/3-timing-and-spacing.atlas
  ..    profile spine — 7 renderer-policy and 8 archetype assertion(s) do not apply
  PASS  A07_ATLAS_TEXT_SHAPE
  PASS  A00_ROUNDTRIP_PARSE
  PASS  A16_SKELETON_VERSION_4_3
  …
  SKIP  A31_DRAW_ORDER_OFFSETS_RESOLVE: no animation carries a drawOrder timeline
  SKIP  A32_EVENT_KEYS_RESOLVE: no animation carries an event timeline
  SKIP  A34_CONSTRAINT_TIMELINE_TARGETS: no animation carries a constraint timeline
  SKIP  A35_DEFORM_KEYS_FIT_THE_ATTACHMENT: no animation carries a deform timeline
  SKIP  A04_MESH_TRIANGLES_AND_ENCODING: the skeleton carries no mesh attachment
  SKIP  A33_VERTEX_ATTACHMENT_GEOMETRY: the skeleton carries no bounding box, clipping attachment or path
  SKIP  A20_MESH_WEIGHTS_COHERENT: the skeleton carries no mesh attachment
  SKIP  A22_MESH_UVS_IN_UNIT_RANGE: the skeleton carries no mesh attachment
  SKIP  A23_PHYSICS_CONSTRAINT_EFFECTIVE: the skeleton declares no physics constraint
  …
  PROF  A12_NO_DARK_COLOR: renderer rule, not in profile "spine"
  PROF  A21_MESH_RIM_PINNED: archetype rule, not in profile "spine"
  …
rigc: green
```

Read it as three separate statements, because they answer three different questions:

- **`PASS` / `FAIL`** — the rule ran, and this is its verdict.
- **`SKIP`** — the rule ran and had nothing to measure, and the line says what was
  absent. A `SKIP` is never a pass, and on foreign data the `SKIP` list is also a
  **free inventory of what the skeleton does not contain**. The nine lines above tell
  you, without your having opened the JSON, that this export has no draw-order
  timeline, no event timeline, no constraint timeline, no deform timeline, no mesh
  attachment, no physics constraint, and no bounding box, clipping attachment or
  path. ⭐ Four of those lines used to read `PASS`
  ([#580](https://github.com/firejune/rigc/issues/580)): a rule that walks the
  meshes, or the physics constraints, and finds none has measured nothing, and
  reporting that as held both overstated the gate and cost you the inventory line.
  What still passes over an empty list is the other kind of rule — `A01`, `A02`,
  `A11`, `A12`, `A14` ask *how many of this does the file carry*, and **zero is the
  answer**.
- **`PROF`** — the rule was excluded by the profile before its body ran. §3.3.

⚠️ **A green here is a statement about validity and nothing else.** It does not say
the skeleton is the one you were meant to be given, that its animations are the ones
their names suggest, or that anything in it is where the art wants it. The gate cannot
see a wrong animation (AUTHORING §0), and it certainly cannot see a wrong *file*.

### 1.2 `render` and `preview` — look at it

```bash
rigc render --candidate examples/spineboy/export/spineboy-pro.json \
            --atlas examples/spineboy/export/spineboy.atlas \
            --animation walk --fps 8 --max 200 --out render/sb
```

```
rigc render
  ..    skeleton …/examples/spineboy/export/spineboy-pro.json
  ..    atlas    …/examples/spineboy/export/spineboy.atlas
  ..    200x186px at 8 fps, 1 set(s) -> …/render/sb
  ..    walk             9 frame(s), 1.000s + contact.png -> …/render/sb/walk@8fps
rigc: wrote …/render/sb/frames.json
```

Three properties of this command matter more for foreign data than for your own:

- ⭐ **It does not gate.** That same `spineboy-pro.json` fails two assertions under the
  default profile (§3.2) and renders all nine `walk` frames anyway. ⇒ **A red
  `validate` is not a reason to stop looking**, and looking is often what tells you
  whether the red matters.
- **Omitting `--animation` renders every animation**, each into its own directory with
  its own contact sheet. On a file you were handed, that is the cheapest complete
  inventory there is — one image per animation, with spacing visible across the grid.
- **The frame size is fitted to the skeleton's own extent**, so `--max` is a cap on the
  longest side and not a canvas. A skeleton whose world box is 24 units wide renders
  24 px wide however large you set it; read the size on the `..` line before concluding
  a render came out empty.

`preview` writes one HTML file that plays the same data in the official Spine Web
Player. On foreign data it is also the **interop proof**: if that page plays it, a
Spine runtime plays it, whatever rigc's own rasteriser or validator thinks.

### 1.3 `diff` — and the two things it cannot see

`diff` takes two compiled skeletons and reports 49 measures in eight groups, plus two
blocks that report and gate nothing: the `(reported)` measures beside `attachments`
and `animations`, and the `skeleton` header block at the top, which measures the stage
(issue #578). A ninth group of six joins them when something has paired the two sides'
animations — `--as <candidate>=<reference>`, or one animation each side, which pairs by
position (§1.3.1). Both sides may be foreign; the interesting pairing during ingest is
**your transcription against the export it came from**:

```bash
rigc diff work/t3/skeleton.json \
          examples/3-timing-and-spacing/export/3-timing-and-spacing-ess.json
```

```
rigc diff
  candidate  …/work/t3/skeleton.json
  reference  …/examples/3-timing-and-spacing/export/3-timing-and-spacing-ess.json
  ..         bones=3/3  slots=2/2  skins=1/1  attachments=2/2  constraints=0/0  animations=2/2  events=0/0   (candidate/reference)

  skeleton (reported)   (no mean)   over 2 measures  — the stage, which no reading of the frames could decide
      1.000  stage_present                1/1         both sides declare a setup-pose stage, or neither does  — …
      1.000  stage_box                    4/4         the stage is the same box (x, y, width, height — the extent as stated, an omitted origin as the 0 it means)  — …

  bones                 mean 1.000  over 8 measures
      1.000  count                        3/3         how many bones
      1.000  names                        3/3         the bone names themselves
      1.000  parent_by_name               3/3         each bone hangs off the same parent
      1.000  order                        3/3         the bones are declared in the same order
      1.000  length_present               3/3         a setup `length` is present or absent alike
      1.000  inherit_present              3/3         a setup `inherit` is present or absent alike
      1.000  depth_histogram              3/3         NAME-AGNOSTIC: as many bones at each depth
      1.000  degree_sequence              3/3         NAME-AGNOSTIC: as many bones with each child count

  bones (name-agnostic) mean 1.000  over 5 measures  — the same two skeletons compared with names thrown away
  …
  animations            mean 1.000  over 9 measures
      1.000  count                        2/2         how many animations
      1.000  names                        2/2         the animation names
      1.000  duration                     2/2         each animation runs as long (last key time, within one frame)
      1.000  timeline_kinds               8/8         the same timelines exist
      1.000  key_counts                   69/69       those timelines carry as many keys
      1.000  curve_kinds                  69/69       as many linear / stepped / bezier keys
      …
```

Each pair is **matched / total**, where the total is the larger of the two sides. So a
count of `2/3` means one side has three of something and only two were matched — and
it does not say *which* side has three. The `..` line above is where you read that.

⛔ **`diff` is blind to every coordinate a bone, an attachment or a key carries.** No
measure reads a bone's `x`/`y`/`rotation`, an attachment's offset, or a key's value —
only *presence*, *names*, *counts*, *order* and *kinds*. §4.1 moves a pivot 236.5
units and every one of the 49 measures still reads **1.000**. ⇒ Never take a green
`diff` as evidence that a geometric edit did not land, and never take it as evidence
that one did.

⚠️ **The corpus gate has a value-level measure and this command does not expose it**
(§2.3, and `docs/BENCHMARK.md`'s *The nine value measures*). The reason is an input
rather than a policy: comparing values means reading both files through `spine-core`,
and a skeleton whose attachments carry a `sequence` cannot be parsed without the atlas
that resolves it — so the measure takes two skeletons **and two packs**, which
`rigc diff <a.json> <b.json>` does not have. The sentence above is about this command
and stays true of it.

⚠️ **The one exception is the skeleton's own declared box**, and it is an exception to
the sentence and not to the rule: `skeleton.stage_box` compares four world numbers,
but they are numbers an exporter *declared in the header* rather than a pose anything
measured, and the block they sit in gates nothing. Moving a pivot does not move them
either.

⭐ **Declared is not the same as written down, and for the origin it is the
difference between a green round trip and a false finding**
([#620](https://github.com/firejune/rigc/issues/620)). The editor omits a header
field at its default, so a stage sitting at `0,0` exports as a `width` and a
`height` and no `x`/`y` at all — there is no other spelling for it. The measure
reads that omission as the `0` it means, which is why a rigc build whose stage is at
the origin and its own export of that build read `stage_box` **4/4**; reading the
four "exactly as stated" scored the same box **2/4**. The extent is still read
exactly as stated: it is what decides whether there is a stage at all, so a missing
`width` is an absent stage rather than a stage of width zero.

⛔ **And its ratios are not a score.** [`src/diff.ts`](../src/diff.ts) says so in the
type itself (*"Unweighted mean of the measures below. NOT a quality score"*), and the
report repeats it at the foot. It measures *agreement with a particular reference*,
which is the right question during transcription and the wrong question the moment the
task is to change something (§4.2, §4.3).

⭐ **The name-agnostic groups are the ones to reach for when names are what differs.**
`bones` and `slots` each get a second pass with names thrown away — depth histogram,
degree sequence, shape histogram, declaration order of shapes, and for slots the
attachment types and bone-binding shapes by draw-order position. That is how you tell
*"the same rig with a different vocabulary"* from *"a different rig"*, and §4.2 is the
recipe built on it.

#### 1.3.1 Animations differ by name too — `--as`

`bones` and `slots` are matched name-agnostically by their own shape. Animations have
none: the candidate's `take01` and the reference's `arcs` are the same shot only
because somebody says they are. Two things say it —

```bash
rigc diff work/t6/skeleton.json examples/6-arcs/export/6-arcs-pro.json --as take01=arcs
```

— and, with no flag, **one animation each side**, which pairs by position because there
is exactly one reading of which shot is which. `--as` is repeatable, one pair each, and
the candidate's name goes on the left, as it does in `bonedist`'s correspondence file.

With the pairing in hand the `animations` section reports two figures like the other
two sections, the second over the paired shots — `duration`, `timeline_kinds`,
`key_counts`, `curve_kinds`, `draw_order`, `deform` — and the heading says which pairing
it used:

```
  animations            mean 0.222  over 9 measures
      1.000  count                        1/1         how many animations
      0.000  names                        0/2         the animation names
      …
  animations (name-agnostic) mean 1.000  over 6 measures  — the same two skeletons compared with names thrown away, paired by position: take01=arcs, the one animation each side carries
```

Read that pair exactly as you read `bones`'s: **1.000 beside `names` 0.000** says the
shot is right and its name is yours. ⛔ `names` never moves into the second block, and
with two shots on each side and no `--as`, the block is **absent** rather than paired by
declaration order — a candidate that declares its two shots the other way round would
then read 0.000 across it and the report would be calling a guess a measurement.

⚠️ An `--as` naming an animation a side does not have is **refused** with what that side
does have, and so is one that pairs the same animation twice. Neither is dropped
quietly: a typo that measured less than you asked for is a report about a pairing you
did not state.

### 1.4 `check` — the instrument that does see coordinates

```bash
rigc check --candidate <a compiled skeleton> --frames <a rendered frame set>
```

`check` never opens a reference skeleton. It renders the candidate onto the frames'
own pixel grid, fits it there by its own drawn pixels, and compares. For ingest that
gives you a loop nothing else in the toolchain provides, in two steps:

```bash
# 1. turn the foreign export into a reference frame set
rigc render --candidate examples/3-timing-and-spacing/export/3-timing-and-spacing-ess.json \
            --fps 12 --max 256 --out ref3

# 2. measure anything at all against it
rigc check --candidate work/t3 --frames ref3 \
           --texture-from examples/3-timing-and-spacing/export/3-timing-and-spacing.atlas
```

📐 **Establish the positive control first.** Point `check` at the same export the
frames came from, and it has to read zero. It does:

```bash
rigc check --candidate examples/3-timing-and-spacing/export/3-timing-and-spacing-ess.json \
           --frames ref3/light
```

```
rigc check
  candidate  …/examples/3-timing-and-spacing/export/3-timing-and-spacing-ess.json
  framed to  256x116px  0.117628 px/unit  world x[-573.3 .. 1603.0] y[-81.2 .. 908.9]  (frames.json's own box — the candidate measured into it)
             ⤷ fit x1.000000  offset +0.00, +0.00 px   rms 0.00 px over 84 edge(s)   union residual +0.00 x +0.00 px   aspect +0.00%  (declared, 1 pass(es), settled)
  declared   frames.json's own box: TAKEN, coincident — a fit there asks for 0.00 px, under the 1 px that separates a candidate in the frames' coordinates from one in its own, over 21 frame(s).

  ── light — candidate animation "light", 12 fps ──
     MAE        mean 0.00  worst 0.00 at f00-1   (0..255 over the union alpha; over the whole frame, mean 0.00)
     slot drift worst 0.5 px  "pendulum" at f0003
     per-frame all 20 adjacent pair(s) change by as much as the reference's own frames do
```

Two things to take from the control, both of which you need before reading any real
number: the **framing** resolved to the frames' own box at 0.00 px, so the MAE is a
comparison of pictures rather than of framings; and **slot drift still reads 0.5 px at
MAE 0.00**, which is that instrument's own floor rather than a difference.

⚠️ **`--texture-from` is not optional on ingest work, and the reason is structural.**
rigc's default atlas is **one region per page at the art's own resolution**; the editor
packs many regions onto one page, often at a reduced `scale:`. Two builds of
geometrically identical data therefore sample differently-scaled texels in every frame,
and that difference is a constant no key can move. `check` says so unprompted, and
`--texture-from <the atlas the frames were rendered through>` measures it: same
geometry, swapped texels. §2.3 is what the resulting number means, and which atlas your
build should be using in the first place.

### 1.5 `explain` — for the specs you write, not the file you were given

📌 **`explain` does not read a compiled skeleton, and it is worth knowing that up
front** so you do not go looking for a reading tool that is not there:

```bash
rigc explain examples/spineboy/export/spineboy-pro.json
```

```
rigc: give either --cut <name> --cuts <cuts.json>, or --rig/--motion/--out
```

It takes `--rig`, `--motion`, `--out`, and optionally `--manifest`, `--images` and
`--atlas-in` — `build`'s spec-reading flags, and not the ones that decide what `build`
*writes* (`--pack`, `--page-size`, `--padding`, `--copy-images`) or the one that gates
(`--profile`). It prints the resolved account
of **your** two spec files, and never gates. Which makes it a §2 instrument rather
than a §1 one — the thing you run to compare what you transcribed against the export
you transcribed it from, by eye:

```bash
rigc explain --rig    bench/transcriptions/3-timing-and-spacing/3-timing-and-spacing-ess.rig.json \
             --motion bench/transcriptions/3-timing-and-spacing/3-timing-and-spacing-ess.motion.json \
             --out    work/x3
```

```
stage  945.1005 x 815.4317  (spine 4.3.13)

bones  (spine world: y up)
  root         parent=-          x=0 y=0
  square       parent=root       x=380.7311 y=78.8596
  bone         parent=root       x=204.753 y=708.0989  rotation=180

slots  (array order IS the draw order)
  pendulum     bone=bone         setup=pendulum               color=ffffffff  attachments=[pendulum]
  square       bone=square       setup=square                 color=ffffffff  attachments=[square]

animations
  heavy  declared=5.333333s loop=true
    bone.rotate  20 key(s)
      t=0       value=0                        bezier[4]
      t=0.233333 value=3.31738                  bezier[4]
      …
```

⚠️ **`--out` is required and nothing is written to it.** The flag is shared with
`build`'s parser; `explain` prints and exits. Passing a directory that does not exist
is fine — it is not created.

---

## 2. Getting specs out of a skeleton

Everything in §1 reads. To **change** anything you need specs. There are two routes
to them and you should almost always take the first.

### 2.0 `ingest` — let the tool write them

```bash
rigc ingest examples/spineboy/export/spineboy-ess.json --out specs/ --art none
rigc build --rig specs/rig.json --motion specs/motion.json --atlas-in examples/spineboy/export/spineboy.atlas --out spine
rigc diff spine/skeleton.json examples/spineboy/export/spineboy-ess.json
```

`ingest` reads the skeleton — **only** the skeleton — and writes `rig.json`,
`motion.json` and `findings.json`. The contract is an equality rather than a
rulebook: `build(ingest(x))` is `x`, byte for byte on `skeleton.json`, and the
atlas comes back with the same region blocks (as a multiset — the page order is in
no field of the file). `bun run selftest` holds every rig this repository builds to
that on every run, which is the one gate here that compares an emitted file against
a file rigc did not write.

📊 **And it holds the twelve editor exports to the weaker claim that is available for
them** ([#594](https://github.com/firejune/rigc/issues/594)). Every
`examples/*/export/*.json` is ingested with `--art none`, rebuilt through the pack
beside it, and `diff`ed against the file it was read from: **12 of 12 come back with 0
blockers and 1.000 on all 49 ratio-bearing measures and all 5 reported ones** — and,
since [#615](https://github.com/firejune/rigc/issues/615), on all **nine value
measures** too, over **193,927** compared values. Byte
identity is not the claim there and the reason is the input, not the round trip — §2.3
has the three kinds of difference, measured, and what the value measures do and do not
reach. ⚠️ Which pack is "the one beside it" is
resolved rather than guessed, for §0.2's reason: `spineboy/export` holds two, and
`spineboy-run.atlas` covers neither skeleton in it.

**What it will not do is invent.** Everything the spec format cannot hold is a
finding with a code — `BLOCK` for a construct the rebuild will be missing, `JUDGE`
for the two values a skeleton does not carry, `LOSS` wherever the source's spelling and
rigc's differ on purpose (a number rigc re-derives, a field the spec has no home for, or
a default the source left to the format and the rebuild writes out). A blocker exits
non-zero and still writes both files. **Every code it can print has a row at the end
of this section**, with its gutter, its effect on the exit code and what to do.

⛔ **And it reads one generation.** Spine data is locked to the generation that
exported it, and a mismatch is silent rather than loud: 4.3 takes constraints from the
top-level `constraints` array alone, so a 4.0–4.2 file's `ik`/`transform`/`path`/
`physics` arrays load as nothing at all — 1,302 shipped skeletons parsed on a 4.3
runtime and loaded 0 of 8,672 constraints
([#706](https://github.com/firejune/rigc/issues/706) row 1). So `ingest` reads
`skeleton.spine` before it reads a field of the file, and a file from another
generation is a blocker naming that generation and counting, **on that file**, what a
4.3 reader loses by it. Reading such a file with *that generation's own* defaults is a
different job — #706's item 2, a per-generation table extracted by machine from each
runtime's `SkeletonJson` — and it is not in this tool, which is why the finding points
at the policy rather than implying the file was read.

**Two values are not in a skeleton**, so `ingest` asks rather than guesses:

- **the stage** (`skeleton.width`/`height`) — a file that declares none is **carried as
  declaring none**: the rig spec states `"width": null, "height": null` (§2.1 step 3's
  spelling, [#578](https://github.com/firejune/rigc/issues/578)), the rebuild emits a
  header with none of `x`/`y`/`width`/`height`, and it is the file that was read, byte
  for byte. No finding is recorded, because nothing was lost and nobody decided
  anything ([#714](https://github.com/firejune/rigc/issues/714)). `--stage x,y,w,h` is how
  a caller *adds* a box to such a file, and that is a `NO_STAGE` **judgement**. Until
  #714 the absence was a blocker and the flag the only road through it — a number the
  source never stated, on the shape #714 counts in 48 of 48 production exports.
  ⚠️ **This page said an editor export carries none until
  [#594](https://github.com/firejune/rigc/issues/594) measured it: all twelve exports in
  the fetched corpus carry a stage**, `ingest` reads it straight through, and not one of
  them needed the flag. What holds without qualification is that the box cannot be
  *derived* — posing the rig gives the *animated* extent, which is a different number
  from the setup box. 🔸 **Half a stage is still a `NO_STAGE` blocker**: an origin with no
  extent, or one extent without the other, declares no stage and is not the absence
  either, and the rig spec holds a stage as four fields or none. It is also the value that costs least to get wrong: `diff`
  reports it as two measures of its own (`stage_present`, `stage_box`, since
  [#578](https://github.com/firejune/rigc/issues/578)) and they are `(reported)`, so
  nothing on the ladder reads them and an absurd box is green nearly everywhere. The
  corpus half of the selftest's `IG` suite is the one gate that does read them. ⛔ **The
  flag is refused beside a box the file states** — two sources for one value, both named,
  and the file is the record of what was measured
  ([#626](https://github.com/firejune/rigc/issues/626)). It used to be read only *after*
  the file's box, so `--stage` at any of the twelve did nothing and said nothing;
- **each animation's duration** — the format has no such field. The largest key time
  is used, stated in the motion spec's `note`, and recorded as a finding per
  animation. Edit it if you know the real number.

And two flags for what the skeleton also does not encode: `--art loose` (the default)
names an `image` per attachment resolved against loose PNGs, `--art none` states
`width`/`height` for `build --atlas-in` — and for `explain --atlas-in`, which is the
same pack read for a report rather than for an artifact: `explain` **poses** the rig
to print its `DEFORM` block, a pose resolves every attachment against an atlas, and a
size-only spec carries none of its own, so without the flag that pair is refused by
name rather than posed ([#697](https://github.com/firejune/rigc/issues/697)); and
under `loose`, `--images <dir>` writes
the rig spec's own images directory relative to `--out`, so the rebuild is a plain
`build --rig … --motion … --out …` rather than one carrying `--images` forever. It is
refused together with `--art none`, which writes no `image` for a directory to be the
base of. [AUTHORING §0.3](AUTHORING.md) is the loop in full.

📝 Both written specs carry a `note` saying they are decompiled and naming the file
they came from. Leave it there — §2.4 is why.

#### Every finding code, and what to do about it

A finding line reads `<gutter> <CODE>: <where> — <detail>`, and the code is the part
that is the same on every run. This table is the whole set: which gutter it prints
under, whether it changes the exit code, what it means, and what to do about it.
**Nothing here refuses the file** — a construct the spec format cannot hold is recorded
rather than rejected — so an exit of 1 means *a blocker was recorded*, and both specs
are on disk either way. (The one thing `ingest` does refuse outright is an option that
contradicts the file, which is not a finding: `--stage` beside a box the skeleton
declares.)

🔒 **Derived, not kept by hand.** The ingest suite of `bun run selftest` (`IG25`)
reads the codes out of [`src/ingest.ts`](../src/ingest.ts) and refuses a row this
table lacks, a row naming a code nothing emits, and a gutter cell that is not the
kind the source records — with `IG26` as its red-first, which removes a row, invents
one and flips a gutter in turn and requires each to be named. Six of these codes are
**composed** in the source rather than written out: five over a union of three or two
names, which the scan expands, and `ATTACHMENT_<TYPE>` from the file's own text, which
it cannot — so that one is a row about a family and says so. The scan counts the
`note(` calls in the file against the sites it resolved, because a code it cannot read
is the one failure a comparison of two sets cannot show you.

| code | gutter | exit | what it means | what to do |
| --- | --- | --- | --- | --- |
| `ANIMATION_GROUP` | `BLOCK` | 1 | the animation carries a group the motion spec has no home for. The detail names the ten it does carry. `drawOrderFolder` is the group to know about: the runtime reads it and builds a timeline from it, and no export in this corpus carries one | transcribe that group by hand (§2), or accept that the rebuild does not carry it |
| `ATTACHMENT_<TYPE>` | `BLOCK` | 1 | an attachment of a type rigc does not emit; the code is composed from the type, so on the one type left it reads `ATTACHMENT_POINT`. rigc emits region, mesh, linkedmesh, boundingbox, clipping and path — `linkedmesh` since [#691](https://github.com/firejune/rigc/issues/691), and `point` is the remaining deferred type | the rebuild will not have that attachment at all. `docs/SPEC_COVERAGE.md` part 1-6 says what a deferred type would carry |
| `ATTACHMENT_LINK_GEOMETRY` | `LOSS` | 0 | a **linked mesh** that also states `uvs`, `triangles`, `vertices`, `hull` or `edges`. The parser returns from the `source` branch before `readVertices` (`SkeletonJson.ts:582-586`), so those keys are read by nothing at all and the attachment draws the geometry its `source` names; the rig spec has no home for them either, because `build` refuses geometry on a link by name. The detail lists the keys and the source. Until [#710](https://github.com/firejune/rigc/issues/710) the rebuild dropped them with no line at all, so an `ingest` that normalised somebody's file said nothing about it | nothing. The rebuild is the mesh the runtime was already drawing — and if those keys were the geometry you meant, take `source` off and author it as a mesh of its own. `A44_LINKED_MESH_STATES_NO_GEOMETRY_OF_ITS_OWN` is the same fact at the gate |
| `ATTACHMENT_NAME` | `LOSS` | 0 | the rebuilt attachment answers to a different name than the source's. **Two shapes, one comparison.** Where only **one** skin fills the placeholder, any stated `name` is lost: rigc writes none — it composes `<skin>/<placeholder>` exactly where a placeholder is contested. Where the placeholder **is** contested, rigc composes that name, and the source's name — what it states, or its placeholder where it states none (`SkeletonJson.js:526`) — is compared with it: equal is rigc's own emit and prints nothing, different is a rename and the detail states **both strings**. Until [#746](https://github.com/firejune/rigc/issues/746) the contested half printed nothing at all. A contested placeholder the **default** skin fills gets no line — the compiler composes nothing there and refuses the rebuild by name. 🚨 **The name is also the ATLAS REGION KEY**, and the detail says what became of it: `readAttachment` reads `name = getValue(map, "name", placeholder)` and then `path = getValue(map, "path", name)`, so `path` defaults to the **name** and not to the placeholder. A name that differs from the placeholder is therefore **kept as `path`** on an attachment that resolves a region — region, mesh, linked mesh — and the detail names the region. The three shapes that keep nothing say which they are: the source stated its own `path` (carried unchanged), the name **is** the placeholder (same region either way), or the type resolves no region at all (`boundingbox`, `clipping`, `path`). Until [#742](https://github.com/firejune/rigc/issues/742) nothing was written, so the rebuild asked the atlas for the placeholder and `A08_REGION_NAMES_MATCH_ATTACHMENTS` refused it | nothing about the art, which is carried. The **name** is what is gone, so this matters where something downstream looks that attachment up by the name the source gave it |
| `ATTACHMENT_SEQUENCE` | `BLOCK` | 1 | a `sequence` block — a numbered image series — that the rig spec cannot say **as written**. Since [#729](https://github.com/firejune/rigc/issues/729) a well-formed block on a region, mesh or linked mesh is carried field for field, with no `image` on the loose route (the frames `<path><number>` are the art), and a `sequence` timeline with it; what is left here is a block the parser reads into a series other than the one written — no `count` (0 regions), a `setup` past the end (clamped), a fraction — or one on a `boundingbox`, `clipping` or `path`, where the parser never reads it. The detail quotes the block and says which | the rebuild draws the single region the attachment names. Fix the block in the source — a `count` is the usual one — and ingest again |
| `ATTACHMENT_TIMELINE` | `BLOCK` | 1 | an attachment timeline that is neither `deform` nor `sequence`. Both are carried since [#729](https://github.com/firejune/rigc/issues/729), and `readAnimation` tests an attachment timeline for exactly those two names and ignores anything else (`SkeletonJson.js:1147-1201`) — so what reaches this line is a name outside the format, which no player plays either | fix the timeline's name in the source, or accept that the rebuild does not carry it |
| `BONE_FIELD` | `BLOCK` | 1 | a bone field with no rig-spec field, so it is dropped. A 4.0/4.1 export spelling `transform` where 4.3 spells `inherit` lands here; so does a misspelling | check the name against AUTHORING §3 first — a typo and an unsupported field read exactly the same |
| `BONE_TIMELINE` | `BLOCK` | 1 | a bone timeline the motion spec has no track for. The detail names the eleven it has, read off the table. Since [#733](https://github.com/firejune/rigc/issues/733) carried `inherit` — the eleventh case of the runtime's own bone switch, a stepped mode per key — every bone timeline the runtime plays has a track, so this is reachable only for a name the **parser** throws on too (`Invalid timeline type for a bone`), the position `PHYSICS_TIMELINE` is in | check the spelling; there is no bone timeline left for the rebuild to be missing |
| `CONSTRAINT_FIELD` | `BLOCK` | 1 | as `BONE_FIELD`, on a constraint, with its type named beside it | as `BONE_FIELD` |
| `CONSTRAINT_KEY_RESTATED` | `LOSS` | 0 | an `ik` or `transform` track whose keys do not all state the same fields. The motion spec takes one field set per track, so a field **any** key states is written on **every** key at the value the parser would have read there | nothing. Same values, larger file — the rebuild plays what the source plays |
| `CONSTRAINT_TYPE` | `BLOCK` | 1 | a constraint whose `type` is none rigc knows, so the whole constraint is dropped rather than approximated | the rebuild has no such constraint; check the spelling before assuming the type is unsupported |
| `DURATION` | `JUDGE` | 0 | skeleton JSON has no duration field at all. The largest key time is used, which is what a runtime plays to — and wrong for an animation that holds its last pose past its last key | if you know the real number, edit `duration` in the motion spec. It costs nothing: the declared duration is checked against the compiled keys |
| `GENERATION_UNKNOWN` | `BLOCK` | 1 | `skeleton.spine` names no generation rigc knows, or the header states none at all. A version is read as its LEADING `major.minor` token — a down-export writes `4.0-from-4.1.24`, which is 4.0 data from a 4.1 editor — and it is never rounded to the nearest generation: a catalog that rounded handed 19 skeletons labelled `3.8.99` a 4.2 runtime and every one posed as NaN ([#706](https://github.com/firejune/rigc/issues/706) row 7) | check the string against the file you were handed. A real generation rigc does not list belongs on #706 item 1, with the string beside it |
| `GENERATION_UNSUPPORTED` | `BLOCK` | 1 | the file is Spine data from another generation and this reader reads 4.3. The detail names the generation, the string it was read from, and what a 4.3 reader loses on **this** file: constraints parked in the top-level `ik` / `transform` / `path` / `physics` / `slider` arrays 4.3 folded into `constraints` and this reader never opens (row 1), bones carrying 4.2's `transform` where 4.3 spells `inherit` (row 6), and physics constraints omitting `inertia` / `damping`, whose default is not the same number in 4.2 as in 4.3 (row 4) | re-export the file as 4.3 from an editor of its own generation, or transcribe it by hand (§2). Reading it with **that generation's** defaults is #706 item 2 and is not in this tool |
| `HEADER_BOOKKEEPING` | `LOSS` | 0 | a header field the editor writes and the rig spec has no home for — `hash`, `audio`. Dropped, and nothing reads it back | nothing. It is one of the three differences §2.3 measures on every editor export |
| `HEADER_ORIGIN` | `LOSS` | 0 | the source declares an extent and omits `x`/`y`. Inside a declared extent an omitted origin **is** 0, so the spec states it — and the rebuild then spells two fields the source did not | nothing. Same box, different bytes — which is why byte identity is not the claim for an export that takes this branch |
| `HEADER_REDERIVED` | `LOSS` | 0 | `skeleton.spine`: the rebuild writes the version of the runtime rigc links. The line says whether that is the same string the source states | nothing — but read the line: a 4.2 export rebuilds as 4.3 in that one field, and a source from another generation raises `GENERATION_UNSUPPORTED` beside it, which is the blocker about the DATA rather than about the string |
| `IK_KEY_FIELD` | `BLOCK` | 1 | a key field on an `ik` timeline that is not part of its shape | check the spelling; an unknown field is dropped from the rebuilt track |
| `NO_STAGE` | `BLOCK` `JUDGE` | 1 | the skeleton declares no stage, and one of two things follows. A **judgement** — exit 0 — when `--stage x,y,w,h` supplied a box, because nothing measured the box you gave it. A **blocker** when the header states **half** a stage — an origin with no extent, or one extent without the other — which the rig spec cannot hold; the detail names the fields it states. A header with **none** of the four is not a finding at all: it is carried as `"width": null, "height": null` and rebuilds byte for byte ([#714](https://github.com/firejune/rigc/issues/714)) | for the judgement, nothing if the box came from the project the file came from. For the blocker, supply the box with `--stage`, or take the stray field(s) out of the source and the absence is carried. It cannot be derived: posing the rig gives the animated extent, which is a different number |
| `PATH_LENGTHS` | `LOSS` | 0 | the source states a path attachment's `lengths` and rigc re-measures it as `PathConstraint` does | nothing. Dropping it is the correct reading: the field is the runtime's own four-sample forward difference, not an arc length |
| `PATH_TIMELINE` | `BLOCK` | 1 | a path-constraint timeline the motion spec has no track for — it carries position, spacing and mix | transcribe it, or accept that the rebuild plays nothing there |
| `PHYSICS_DRIVES_NOTHING` | `LOSS` | 0 | a physics constraint none of whose `x`, `y`, `rotate`, `scaleX`, `shearX` is above 0 — absent, or stated at 0 or below. `PhysicsConstraint.update` applies a component only above 0 (`PhysicsConstraint.js:112`), so it moves no bone, and `build` refuses exactly that shape by name at `A23_PHYSICS_CONSTRAINT_EFFECTIVE` — which, until [#731](https://github.com/firejune/rigc/issues/731), meant the whole rebuild of a file an editor exports was refused over a constraint that did nothing in it. The rig spec **omits** it, together with every timeline keyed to it (a track naming it would be an unknown constraint to the rebuild, refused at compile) and its place on any skin's `physics` list; the detail names each, and the values it did state. Measured on a generated rig through spine-core, posing the source with and without such a constraint differs by **0** on every bone world value — and by at most 9e-8 when it sits on the root, which is the runtime's `modifyWorld` recomputing a local transform it had no reason to, not a component. ⚠️ **One thing does move:** a duration is the last key an animation has left, so an omitted timeline that held the last key shortens the rebuilt animation, and the detail says which animation and both lengths | nothing, if it was meant to do nothing. If it was meant to jiggle, the file never said so: give it the component it should drive and it is carried like any other. Where the detail names a shortened animation and the length matters to whatever loops it, key something at the length it had |
| `PHYSICS_GLOBAL_REACHES_NOTHING` | `LOSS` | 0 | a physics timeline keyed under the **empty** name — the one that names no constraint, which the runtime applies to every physics constraint declaring that property global (`"strengthGlobal": true` for `strength`; `reset` resets every physics constraint and asks no flag) — in a file where no physics constraint the rebuild carries declares it. The motion spec spells that timeline `"physics": "*"` ([#726](https://github.com/firejune/rigc/issues/726)) and `build` refuses one that reaches nobody by name, so the rig spec **omits** it: in the source it walked every constraint and wrote into none. A constraint `PHYSICS_DRIVES_NOTHING` omitted counts as not carried — it was the only thing such a timeline could reach, and it moved no bone. ⚠️ As with that row, a duration is the last key an animation has left, so an omitted timeline that held the last key shortens the rebuilt animation and the detail says both lengths. An unnamed timeline that **does** reach a constraint is not a finding at all: it is carried as `"*"` and rebuilt under the empty name byte for byte | nothing, if it was meant to do nothing. If it was meant to drive the constraints, the file never said which: set `"<property>Global": true` on them in the rig spec and key it as `"physics": "*"` |
| `PHYSICS_TIMELINE` | `BLOCK` | 1 | the same for a physics constraint, whose eight the motion spec carries in full — so this is reachable only for a name the **parser** falls through too | as `PATH_TIMELINE` |
| `SLIDER_TIMELINE` | `BLOCK` | 1 | the same for a slider, which carries time and mix | as `PATH_TIMELINE` |
| `SLOT_FIELD` | `BLOCK` | 1 | as `BONE_FIELD`, on a slot | as `BONE_FIELD` |
| `SLOT_TIMELINE` | `BLOCK` | 1 | a slot timeline the motion spec has no track for. Since [#730](https://github.com/firejune/rigc/issues/730) carried `rgb`, `alpha` and `rgb2` the spec has a track for all six the format has, so what still reaches this line is a name **outside** the format — `sequence` written on a slot rather than an attachment is the likeliest — and the detail says so: the runtime's own reader throws `Invalid timeline type for a slot` on it, so no player loads that file either. The detail names the tracks the spec does have and, when the format has any it lacks, those too, **both read off the tables** rather than listed here: this cell named `rgba2` among the timelines nobody carries until [#690](https://github.com/firejune/rigc/issues/690) made that false, which is what a hand-kept list beside a derived one always comes to. `rgb` and `alpha` are carried under their own names and on their own key times, never folded into one `rgba` — that would state each channel at the other's key times, a value nobody keyed | fix the timeline's name, or accept that the rebuild plays nothing there |
| `SPEC_REFUSED` | `BLOCK` | 1 | the specs were written and **rigc's own parser refuses one of them** — the detail carries that refusal word for word, after the file and the spec it is about. It is the one finding that is not about a single construct: it is whatever `parseRigSpec` or `parseMotionSpec` names, from a shape the format holds and the spec cannot say (a constraint that is `skinRequired` under no skin) to a defect in this decompiler. Until [#692](https://github.com/firejune/rigc/issues/692) the refusal left through `ingest` itself, so the run exited 1 with no line, no code and no `findings.json` at all | read the quoted sentence against the skeleton: it names the object. Both specs are on disk for exactly that, and `build` will refuse them until the shape has a spelling — [AUTHORING §5.1](AUTHORING.md) is the list of what a parser says |
| `TIMELINE_FIELD` | `BLOCK` | 1 | a key field on a bone, path, physics or slider timeline that is not part of that timeline's shape. On an `inherit` key that includes a `curve`: the parser reads `time` and `inherit` there and nothing else, and `build` refuses a curve on that track by name | check the spelling; the field is dropped from the rebuilt key |
| `TIMELINE_KEY_RESTATED` | `LOSS` | 0 | **the commonest line in a real run.** An editor omits a channel that equals the parser's default; the motion spec's `v` is positional, so the omission is written out at that default. On an `inherit` key it is the mode: one that omits it is written as `normal` — the parser's default — and one spelled with a capital first letter (`NoScale`) as the editor's `noScale`, the same mode either way | nothing. The same values the runtime reads, spelled out — a larger file and the same animation |
| `TRANSFORM_KEY_FIELD` | `BLOCK` | 1 | as `IK_KEY_FIELD`, on a `transform` timeline | as `IK_KEY_FIELD` |

⚠️ **One thing the table cannot carry: the region key is kept where a placeholder is
CONTESTED too, whether or not a line is printed.** On a contested placeholder rigc
composes `<skin>/<placeholder>`, so `ATTACHMENT_NAME` fires there only where the
source's name differs from that composed one ([#746](https://github.com/firejune/rigc/issues/746);
`IG68`–`IG70` hold both directions) — and until
[#742](https://github.com/firejune/rigc/issues/742) the region went with the name anyway:
`compile` pins a composed name's `path` at the **placeholder**, so two skins naming two
regions rebuilt onto **one**, neither of them the art the source drew, with no line
printed. `ingest` now writes the source's region as `path` on both, and `IG53` in
`bun run selftest` is what holds it — the clause it measures is the count of *distinct*
regions, because every row can name a region the pack has and still be one region doing
the work of two.

### Transcription — the route that made a foreign skeleton yours

⚠️ **The rest of §2 is the route that existed before #569, and it is kept because
the reading it produces is still the right one** — it is what an author does *after*
`ingest`, and it is what to fall back on for the constructs `ingest` reports as
blockers. The numbers come out of the JSON into a rig spec and a motion spec by hand,
and `build` emits a new skeleton from those.

What you get for it is that the file becomes editable by declaration — a pivot move
is two numbers in a spec (§4.1) and a new animation is an added block (§4.3), where
before it was a hand-edit of emitted JSON with nothing checking it. That is now what
`ingest` hands you in one command; the sections below are how to read and change what
it hands you, and every rule in them applies to a spec `ingest` wrote.

📌 **The cost this section used to warn about is measured, and it is why §5 changed.**
The smallest skeleton of the corpus behind [#569](https://github.com/firejune/rigc/issues/569)
transcribed to a **257,422-byte** rig spec, of which 91.8 % is the six geometry
arrays — numbers, not decisions. A 558-line prototype decompiler reproduced 100 % of
it, and the only differing paths were the name and the `note`.

### 2.1 The workflow

1. **Read the skeleton first, with `validate` and `render`.** The `SKIP` list is your
   feature inventory (§1.1); the contact sheets are what the animations actually do.
   Knowing there is no deform timeline before you start is worth more than discovering
   it in the eleventh hour of transcribing one.
2. **Get the loose art, at the size the export declares.** rigc measures PNGs rather
   than trusting a size you typed (AUTHORING R5), so the art has to *be* the right
   size. Take the target from the export's own attachments —
   `3-timing-and-spacing` declares `"width": 745, "height": 212` for `pendulum`, and
   the loose `pendulum.png` beside it is exactly 745×212. ⚠️ Do **not** take it from
   the atlas region bounds: that page carries `scale: 0.5`, so `pendulum`'s bounds read
   `373, 106`. Two numbers for one part, and the attachment's is the one in world
   units. `--atlas-in` now does that division for you (§2.3), but it can only land
   within the pack's own rounding — by hand, off the attachment, it is exact.
3. **Transcribe the rig spec: header, bones, slots, skins.** Bones parents-first; the
   `slots` array *is* the draw order (AUTHORING R4), so its order is data you are
   copying and not a detail. Leave `invariants` out entirely — it describes rigc's own
   formations, and an absent field makes an archetype assertion `SKIP`, never pass
   (AUTHORING §3.7).

   📌 **Transcribe the export's empty slots too** — the ones no skin fills anywhere.
   Such a slot still holds an index in the array, and everything below it is counted
   from that index. Write it as `{ "name": …, "bone": … }` with no `attachment`, or
   with `"attachment": null` if you prefer to say it out loud; either way it comes
   back. Before issue #575 it did not: `build` dropped it in silence, so two exports
   declaring 53 and 61 slots came back at 51 and 57 with a green gate, and `diff`
   read 0.962 and 0.934 against the file they had been read from. If a
   transcription's `slots.count` is under 1.000, this is the first thing to check.

   ⚠️ **No skeleton in `examples/` has one**, which is why the corpus never showed
   this: all twelve exports fill every slot they declare from some skin. What they
   *do* carry is the neighbouring shape — a slot a skin DOES fill whose setup pose
   shows nothing (34 of `spineboy-pro`'s 52 slots). Both are written the same way in
   the file: `attachment` simply absent.

   ⚠️ **If the export's `skeleton` block carries no `x`/`y`/`width`/`height`, write
   `"width": null, "height": null` and do not invent one** (issue #578) — which is
   also what `rigc ingest` writes for such a file since #714. That shape is
   common — the twelve exports in `examples/` all carry the four, and 37 of 37 exports
   in one production corpus carry none of them — and until the `null` pair existed the
   only two moves were a made-up stage or a file that could not be transcribed. The
   made-up stage was the worse one: it is a number nothing in this toolchain could
   contradict, so it survived every gate and every `diff` in silence. Now it does not —
   `diff`'s header block reports `skeleton.stage_present` and `skeleton.stage_box`
   against the source you are copying. Copy the four numbers when they are there;
   state the absence when they are not.
4. **`explain`, then `build`.** `explain` first, because it prints what you wrote in a
   shape you can compare against the export by eye (§1.5) and it never gates. Then
   `build` under `--profile spine`.
5. **Transcribe the motion spec, one animation at a time**, and `build` after each.
6. **Close it with `diff` and `check`.** `diff` for structure; `check` against frames
   rendered from the export for geometry; `--texture-from` to attribute the floor.

### 2.2 One feature family at a time

📌 **Transcribe by *kind*, not by animation.** All the bones, then all the slots, then
all the attachments, then one timeline kind across every animation. Two reasons, and
the second is the one that costs a day:

- A whole animation touches every feature the format has, so *"animation 1 of 6 done"*
  means you have hit every unsolved problem at once and solved none of them cleanly.
- **`build` is all-or-nothing and emits only after green** (AUTHORING §0). A partial
  transcription of one kind still builds; a half-transcribed animation may not build at
  all, and then you are debugging your own incomplete work rather than the format.

⚠️ **When a kind turns out not to be expressible, stop and say so — that is a finding,
not a blocker to route around.** [SPEC_COVERAGE.md](SPEC_COVERAGE.md) is the
per-skeleton survey of exactly this, and it records both directions honestly: rung 6's
row for weighted meshes reads *"⚠️ **This was wrong.**"* over a struck-out prediction
that they were inexpressible. ⇒ Check the survey for your feature before concluding
either way, and if it is genuinely absent, the shape of the answer is *"this export
uses X, which the motion spec cannot say"* with a pointer — not a silent
approximation.

📎 **An editor export's curves usually need the raw `curve` escape hatch.** A named
easing is one curve reused; an export carries a different bezier per key per channel,
which no name can say. The motion spec's raw form takes absolute `(time, value)`
control points verbatim (AUTHORING §4.5). Named easings stay the right default for
motion you are *authoring* — this is the one case the escape hatch exists for, and the
3-timing transcription's own `note` says so.

### 2.3 What "byte-identical" can and cannot mean

State the ambition in the right units, because three different things get called
"identical" and only two are reachable.

| Ambition | Reachable? | What it costs, and what it proves |
| --- | --- | --- |
| **Structural agreement** — same bones, slots, attachments, timelines, key counts, curve kinds | ✅ yes, and `diff` measures it | the 3-timing transcription reads **1.000 on all 49 measures**. Aim here first |
| **Geometric agreement** — the same drawn pixels, allowing for the atlas | ✅ yes, and `check` measures it | see below |
| **Byte-identical JSON** | ⛔ **no, and not because of the geometry** | rigc writes defaults explicitly where the editor omits them, and the editor writes bookkeeping rigc has no field for. SPEC_COVERAGE records the count on rung 6: a field-by-field comparison against the reference export leaves **49 differences, every one benign** — 39 explicit defaults, 3 editor bookkeeping keys, 1 runtime version string, and 6 bone `icon` values, which was the only thing the rig spec could not say at all |

⚠️ **The third row holds for `ingest` too, and it is worth knowing in which direction.**
`build(ingest(x))` is byte-identical for a skeleton **rigc** emitted — that is the
contract `bun run selftest` gates on every run — and it is not, for a skeleton the
editor emitted. Measured over all twelve corpus exports, a field-by-field walk of the
rebuild against its source produces differences of exactly two kinds, in every file:

| Kind | Example, candidate vs reference | Why |
| --- | --- | --- |
| **header bookkeeping**, 3 per file | `skeleton.hash: undefined vs "VFWbaK2UoCM"`, `skeleton.audio: undefined vs null`, `skeleton.spine: "4.3.13" vs "4.3.75-beta"` | the rig spec has no field for `hash` or `audio`, and the version is the runtime rigc links. `ingest` reports all three as findings — `HEADER_BOOKKEEPING` and `HEADER_REDERIVED` |
| **an omitted default written out** | `…rotate[0].time: 0 vs undefined` | the editor omits a zero `time`; rigc writes it. AUTHORING §10.5's *do not imitate the exporter's omissions*, from the other side. The header has one of these too and it is the one `ingest` now names: a stage at the origin is written `width`/`height` with no `x`/`y`, and the rebuild spells both — `LOSS HEADER_ORIGIN`, with the box unchanged ([#622](https://github.com/firejune/rigc/issues/622)). No file in this corpus takes that branch: all twelve declare an origin away from 0 |

🔢 **A third row stood here until issue #716: the emitted precision** —
`…curve[0]: 0.066667 vs 0.06666667`, `uvs[0]: 0 vs 2.554152e-7` — because rigc wrote
six fixed decimals where the editor writes each number as the shortest decimal naming
its float32. It rewrote every number with more digits than that, by up to 7e-7, with
no `LOSS` line, and the `uvs[0]` case was that rounding taking a carried value to 0 —
`ingest` carries every number as the double it parsed, so no derivation was involved.
rigc now writes the editor's text, and `IG73` holds every number of the twelve
rebuilds to its source's spelling; `IG75` counts what still differs by kind, and none
of it is a number. The whitespace of an export is not compared at all — it is an
export setting, pretty-printed in the examples and one line from the command line.

⇒ **So the corpus gate is `diff` at 1.000 rather than a byte comparison**, and it is
worth being exact about what that does and does not cover. `diff` compares structure —
counts, names, parentage, order, timeline kinds, key counts, curve kinds — and **not
the values inside the keys**, which is why a moved value is invisible to it.
On rigc's own rigs byte identity covers both; on a foreign export it used to be
`check` (pixels) or nothing, depending on what you render.

⭐ **The values are gated now, and by a second measure rather than by `diff`**
([issue #615](https://github.com/firejune/rigc/issues/615)). Structure at 1.000 is
silent about the numbers inside it: a decompiler that halved every rotation, dropped
every bone's `length` or mirrored every vertex would read 1.000 on all 49 measures and
on every `(reported)` one. So the corpus round trip also compares **value by value**,
with the format's defaults taken from the parser rather than from a table — both files
are read through `spine-core` and the parsed forms are compared path by path, under a
tolerance that is the sum of the 1e-6 grid rigc's closed-form models are evaluated on
— the one absolute grid it still emits on — and one float32 step of the runtime's
storage. Nine measures, printed on `IG16`'s own line and gated there — here
is the `6-arcs` export's, wrapped to fit this page:

```
values: 9/9 measure(s) at 1.000 over 13865 compared value(s); skeleton 1.000 ·
bones 1.000 · slots 1.000 · attachments 1.000 · constraints 1.000 · events 1.000 ·
key_times 1.000 · key_values 1.000 · curves 1.000
```

Over the whole corpus that is **193,927 values** compared, and the twelve read 1.000
on all nine.

`docs/BENCHMARK.md`'s *The nine value measures* is the full statement. What it still
does **not** cover, in the same breath:

| Still uncovered | Why |
| --- | --- |
| `version` and `hash` | the rig spec has no field for either, and `ingest` reports both as findings — the header row above, unchanged |
| anything below one float32 step | the parser stores frames, curves and vertices in a `Float32Array`, so a difference it cannot represent is invisible to any reading of the parsed form |
| a Bezier's handles *as written* | the parser samples them into the curve, so a moved handle arrives as moved samples rather than as the handle it was |
| how the file is **spelled** | field order and an omitted default written out — the second row of the table above is values that agree, and this measure says so. A number's spelling is `IG73`'s, which reads the rebuild as text |
| how it **looks** | that is `check`, and `--texture-from` is how its figure is attributed |

The geometric row needs a real number, because a naive reading of `check` makes an
exact transcription look wrong. Here is the 3-timing transcription against frames
rendered from the export it was transcribed from:

```
  ── heavy — candidate animation "heavy", 12 fps ──
     declared   frames.json's own box: TAKEN, coincident — a fit there asks for 0.04 px, under the 1 px that separates a candidate in the frames' coordinates from one in its own, over 65 frame(s).
     MAE        mean 6.42  worst 7.13 at f0064   (0..255 over the union alpha; over the whole frame, mean 0.27)
                ⭐ texture floor 6.42  above it 0.00   (over the reference's own pixels, 6.42 and 0.00)
     slot drift worst 0.7 px  "pendulum" at f0017
     per-frame all 64 adjacent pair(s) change by as much as the reference's own frames do
```

⭐ **`above it 0.00` is the whole result.** The MAE is 6.42 and **100 % of it is
texture**: the same geometry sampled through the reference's own atlas reads zero. The
transcription is geometrically exact, and the 6.42 is one-region-per-page at full
resolution meeting a 512×128 page declared at `scale: 0.5`. ⇒ **On ingest work, read
`above it` before you read the MAE.** Without `--texture-from` there is no way to tell
6.42-that-is-all-texture from 6.42-that-is-all-rig, and the report warns you of exactly
that rather than leaving you to find out.

**Which atlas your build should use, then.** `build` has three atlas routes, and the
choice is an ingest decision rather than a detail. All three rows below are the same
specs, `--frames ref3/light`, against frames rendered from the export — one set, so
the figures compare:

| Route | What the emitted attachments say | `check --frames ref3/light` |
| --- | --- | --- |
| **default** — one region per page, pointing at the loose PNGs | `pendulum 745x212`, `square 159x159` | `in units … x1.0001`; MAE **6.36**, texture floor 6.36, **above it 0.00** |
| **`--pack`** — the same loose parts onto shared pages | `pendulum 745x212`, `square 159x159` | `in units … x1.0001`; MAE **6.36**, texture floor 6.36, **above it 0.00** |
| **`--atlas-in <the export's own atlas>`** | `pendulum 746x212`, `square 160x160` | `in units candidate 1053.5 x 808.2  reference 1053.5 x 808.7  x0.9997`; MAE **2.03**, texture floor 0.00, **above it 2.03** |

📌 **The first two are exact and indistinguishable**, and `--pack` is the one to reach
for when the deliverable is meant to look like an export: MaxRects onto shared pages,
byte-for-byte region copies, nothing resampled or rotated (AUTHORING §0.1). It does not
close the 6.36 — nothing that samples full-resolution texels can, against frames drawn
from a half-resolution pack — so the floor stays, `--texture-from` stays the way to
attribute it, and *packing does not change what the figure means.*

⭐ **The third row is the mirror image of the first two, and reading it wrong is the
easy mistake.** Its MAE is the *lowest* of the three because it draws through the
reference's own texels — floor 0.00 — so what is left is geometry, and 2.03 of geometry
is the ONE PIXEL the pack cannot give back. `--atlas-in` divides a region's size by the
page's `scale:` (nine of the ten corpus atlases declare one — eight at 0.5, one at 0.4,
every file but `spineboy-run.atlas`), and the packer wrote `round(drawing × scale)`, so
a 373-texel region at `scale: 0.5` is consistent with both a 745- and a 746-pixel
drawing. rigc states 746, the export says 745, and putting the pixel back by hand takes
the same build to `x1.0000` / MAE **0.00** — which is how the residual is known to be
the rounding and nothing else.

⇒ **The routes now differ in what their MAE is MADE OF rather than in whether they are
right.** Loose art or `--pack` gives exact geometry through coarser texels; `--atlas-in`
gives the reference's texels through geometry good to half a texel. Read `above it`
before the MAE either way, and read the `in units` line first — it is the line that
catches a whole-figure scale error, and it is the only one that does.

> 🕰️ **This row used to read `pendulum 373x106`, `square 80x80`, `x0.8092`, MAE
> 124.97 — the pack's texel counts taken as world sizes, so every attachment came out
> at half size, green, with nothing in the report saying so.** Found while writing this
> page and fixed as [issue #267](https://github.com/firejune/rigc/issues/267). The
> control that isolated it is now a selftest: import a pack with **no** `scale:` line
> (rigc's own `--pack` output writes none) and the skeleton is byte-identical to the
> loose build.

### 2.4 The worked precedent, and what to take from it

Three transcriptions of official Spine exports live in this repository under
[`bench/transcriptions/`](https://github.com/firejune/rigc/tree/main/bench/transcriptions/)
— `3-timing-and-spacing` (3 bones, 2 slots, 2 animations, 69 keys, every curve raw),
`6-arcs` (weighted meshes, mesh `edges`, four 4.3 transform constraints) and
`spineboy` in both `ess` and `pro`. They are **worked examples you are meant to read**,
and the rig spec's own `note` field is the thing to read first:

> *"Mechanical transcription of Spine's official 3-timing-and-spacing `ess` export …
> written to prove that a rig spec can express a foreign skeleton at all. It is NOT an
> authored rig: the numbers were copied out of the reference, so it says nothing about
> whether an agent could produce them."*

⭐ **Copy that habit, not just the technique.** A transcription's `note` should say what
it is, what it is not, and where its numbers came from — because the file otherwise
looks exactly like an authored rig and will be read as one by whoever opens it next.
The `images` line in those specs points out of the repository into the gitignored
`examples/` directory for the same reason: the art is fetched, not redistributed
([NOTICE.md](../NOTICE.md)).

⚠️ `bench/` does not ship in the npm package, so from an installed copy those files are
the link above rather than something on disk. Nor does `scripts/fetch-examples.sh` —
the example corpus is a repository-checkout facility, and every command line on this
page was run from one.

---

## 3. Complaints, and what each one means

Foreign data meets rigc's refusals in two waves: argument handling, before any rule
runs, and then the assertions.

### 3.1 Before the assertions

These three exit 2 with one sentence and no report. Together with §0.2's stack trace
they are the whole set an ingest task realistically meets.

| Complaint | What it means | What to do |
| --- | --- | --- |
| `N atlases beside <file> (…); name the right one with --atlas <path>` | the export directory holds more than one atlas and rigc will not guess | look at which regions each atlas declares, and name the one that covers the skeleton's attachments. §0.2 says why the filename heuristic is wrong here |
| `no .atlas beside <file>; name one with --atlas <path>` | you were handed the skeleton without its atlas, or copied one file out of a directory | get the atlas. Nothing downstream works without it — the attachments resolve through it |
| `<file> is neither a directory nor a .json skeleton` | the path is a `.skel`, a `.spine`, or anything else | §5 — rigc reads JSON only |
| *(exit 1, a stack trace ending in `ENOENT: … /skeleton.json`)* | you passed a directory and it is not a rigc output directory | point at the `.json` itself. §0.2 |

### 3.2 Assertions a real export fails

📊 **All twelve skeletons in the fetched corpus come back green** under the default
profile with the right atlas named. That is the baseline, and it is the honest headline:
**a correct editor export passes.** Getting there took one rule fixed, and the two
sections below are worth reading in full because the failures they describe mean
opposite things — the first is still reachable, and the second was the rule's fault.

**`A00_ROUNDTRIP_PARSE` — the atlas does not cover the skeleton.**

```bash
rigc validate examples/spineboy/export/spineboy-ess.json \
              --atlas examples/spineboy/export/spineboy-run.atlas
```

```
  FAIL  A00_ROUNDTRIP_PARSE: threw: Region not found in atlas: eye-indifferent (attachment: eye-indifferent)
rigc: 1 assertion(s) failed
```

**What it means:** the atlas you named is a real atlas and a valid one — it is just not
this skeleton's. `spineboy-run.atlas` packs only what the `run` animation needs. ⇒
**Read this as an atlas-choice failure, not as a broken skeleton.** It is the
downstream shape of guessing at §0.2's refusal, and it is precise about the cost: one
named attachment, so you can tell "wrong atlas" from "the export is missing a region"
by whether the missing names are a *coherent subset*. Fix by naming the right atlas —
`spineboy-ess.json` is green against `spineboy.atlas`.

**`A35_DEFORM_KEYS_FIT_THE_ATTACHMENT` — and this one was the rule's fault.**

```bash
rigc validate examples/spineboy/export/spineboy-pro.json \
              --atlas examples/spineboy/export/spineboy.atlas
```

```
  PASS  A00_ROUNDTRIP_PARSE
  PASS  A10_NO_NAN_AFTER_STEPPING
  …
  PASS  A35_DEFORM_KEYS_FIT_THE_ATTACHMENT
rigc: green
```

**Why it is worth a section anyway.** That line used to be two `FAIL`s on the same key —
one for an **odd `offset`**, on the reading that the run's x values would land on y slots
and back again, and one for an **odd-length run**, on the reading that the deform array is
x, y pairs — and nothing was wrong with the data, so neither sentence exists in the tool
any more. `hoverboard-board` is an unweighted mesh with 148
floats; the key carries `offset: 1` and 147 values, covering `1..148` — the whole array
minus a leading zero the editor trimmed. A trim can land on a y component, so an odd
offset is what a trimmed run looks like, and Spine's own parser copies the run in at the
raw index with no alignment requirement anywhere. The proof was in the same report:
**`A00` and `A10` both PASSed on that file**, and `render` drew the `hoverboard`
animation.

⭐ **The lesson survives the fix, and it is the reason to read this.** A validity rule
stricter than the runtime does not look like a bug — it looks like a finding about
somebody's file, and the honest reading of that message (*"your x values land on y
slots"*) sends an agent to change correct data. Fixed as
[issue #262](https://github.com/firejune/rigc/issues/262): the two parity clauses are
gone, and the remaining A35 clauses — the run fitting inside the deform array, finite
values, a non-empty key array, the attachment existing in the skin — are correct and
catch real breakage. The over-long run in particular is still refused, and still the
quietest defect the format has.

🚨 **The general lesson matters more than the specific bug.** A `FAIL` on foreign data
has three possible meanings and the message alone does not separate them:

1. **the data is broken** — fix the data;
2. **the input was wrong** — wrong atlas, missing page, truncated file (§3.1, and
   `A00` above);
3. **the rule is stricter than the runtime** — fix the rule, or file it.

⇒ Before changing anybody's export because rigc objected, check case 3: does the file
**parse** (`A00`), **step without NaN** (`A10`), and **render**? If all three, the
runtime is content and the burden is on the rule. Reporting that is a better answer
than a quietly edited export.

### 3.3 Profile choice, and the fifteen rules that will not fire

`--profile spine` is the default and answers *"is this valid Spine 4.3 that any
runtime plays correctly?"* — and it is the right profile for foreign data, because the
other one is this project's own renderer and archetype policy.

**Fifteen assertions do not run under `spine`, and they come back `PROF`, not
`SKIP`:**

| Excluded as | Rules |
| --- | --- |
| **renderer policy** (7) | `A11_NO_CLIPPING_ATTACHMENTS`, `A12_NO_DARK_COLOR`, `A13_MESH_BUDGET`, `A14_NO_FULL_FRAME_MESH`, `A15_IDLE_NO_MESH_BONE_KEYS`, `A19_OVERLAY_PNGS_HAVE_ALPHA`, `A27_REGION_NAME_MATCHES_PAGE_FILENAME` |
| **archetype policy** (8) | `A21_MESH_RIM_PINNED`, `A24_AXIS_SPACE_STROKE`, `A25_DETACHED_BONE_PARENTAGE`, `A26_SLOT_DRAW_ORDER`, `A28_RIBBON_ROWS_SHARE_WEIGHTS`, `A29_STROKE_WITHIN_CONTACT_DEPTH`, `A30_STROKE_WITHIN_CAP_CONTAINMENT`, `A39_DEFORM_KEEPS_TRIANGLE_WINDING` |

Two further rules — **`A06`** and **`A20`** — are *mixed*: their validity clauses run
in both profiles and their policy clauses only under `spine-html`. `A06`'s
size-vs-PNG check is validity; one-part-per-page coverage, rotation and premultiplied
alpha are policy. `A20`'s weight coherence is validity; requiring a mesh to be
weighted at all is policy.

**`A08` was the third until [#574](https://github.com/firejune/rigc/issues/574).** Its
policy clause required a skin entry's placeholder to be spelled exactly like the region
it resolves to — a rule the renderer it was gated under never performed, since
`spine-html` keys its images on the atlas region name reached through the attachment's
`path` and reads no placeholder at all. Measured before retiring it: the clause fired
on **0** attachments across the whole example corpus (no export in `examples/` carries
a `path` field), and on every rigc rig whose placeholder is not its PNG's basename —
which is what `path` exists for (AUTHORING §2, R5) and what a placeholder two named
skins share is emitted as. So it was policy that only ever refused this compiler's own
correct output.

⚠️ **`--profile spine-html` on foreign data produces a wall of failures that mean
nothing about the file.** Same `spineboy-pro.json`, same atlas, one flag changed — the
run ends `rigc: 13 assertion(s) failed`, and this is the tally with one real message
per rule (re-measured 2026-09-04; it used to read 53, with 40 `A06` rows, until A06
learned that a page is one part covering it exactly *or a tiling of regions* — #266
follow-up 2 — so a packed atlas now passes both profiles and the wall is policy only):

| Count | Rule | One of its messages |
| --- | --- | --- |
| **10** | `A15_IDLE_NO_MESH_BONE_KEYS` | `idle keys bone "front-shoulder", which drives a mesh — meshes never idle-skip` |
| **2** | `A20_MESH_WEIGHTS_COHERENT` | `mesh "front-shin" is unweighted; the ring tier drives meshes by bones` |
| **1** | `A11_NO_CLIPPING_ATTACHMENTS` | `1 clipping attachment(s); the renderer skips them silently` |

Every one of those is a correct statement about a correct file: a bone *does* key a
mesh, a mesh *is* unweighted, a clipping attachment *is* present.
(The tally was 55 before §3.2's A35 was fixed, and that is the one entry that was *not*
a correct statement — which is why it belonged in a different section from these.)
And it is not a big-skeleton problem — `3-timing-and-spacing`, with two regions on one
page, fails `A06` twice for the same reason. ⇒ **Do not run `spine-html` against
somebody's export unless they asked whether it satisfies this project's renderer
policy**, which is a different question from whether their file is valid.

⚠️ **And do not read the absence of `SKIP` lines as thoroughness.** Under `spine` a
foreign skeleton typically produces *no* archetype `SKIP` at all — the profile excludes
those rules before their bodies could notice the missing `invariants` block, so they
arrive as `PROF`. The `PROF` list is where *"was this held to that rule at all"* gets
answered (AUTHORING §7).

---

## 4. Recipes

Each of these starts from a transcription (§2), and none is an edit to emitted JSON —
an edit to emitted JSON is a change nothing in the toolchain checked. All three were
run from copies of the stored 3-timing transcription:

```bash
T=bench/transcriptions/3-timing-and-spacing
mkdir -p work/repivot
cp $T/3-timing-and-spacing-ess.rig.json    work/repivot/repivot.rig.json
cp $T/3-timing-and-spacing-ess.motion.json work/repivot/repivot.motion.json
```

⚠️ A copied spec's own `images` path is relative to where the spec was, so it breaks
on the copy. `--images` overrides it, relative to your working directory, and every
`build` below passes it.

### 4.1 Moving a pivot without moving the art

The ask: *"the arm should swing from its middle, not its end — don't change the
drawing."* This is the recipe the rest of the section is measured against, because its
correctness criterion is exact and checkable without rendering anything.

**What changes in the file:**

| Object | Change | Why |
| --- | --- | --- |
| **the bone** | its `x`/`y` move to the new pivot, expressed in its **parent's** local axes | the bone's origin *is* the pivot |
| **its attachments** | offsets move by the same vector expressed in the **bone's own** axes, with the opposite sign | an attachment offset is the art's centre relative to the bone origin; the bone origin just moved, so this cancels it |
| **its child bones** | every child's `x`/`y` needs the same opposite correction | a child's offset is in this bone's local space, so moving the origin moved every child with it |
| **the timelines** | ⛔ **nothing** | `rotate` keys are angles about the origin, and the origin is what you changed. This is the entire point of the edit |

⚠️ **The child-bone row is the one that gets forgotten**, and it fails quietly: the
re-pivoted bone's own art lands correctly and everything hanging off it is displaced by
exactly the vector you moved. If the bone has children, correct them in the same edit,
or the fix looks half-right in a way no assertion will mention.

**Worked.** 3-timing's `bone` sits at `x: 204.753, y: 708.0989` with `rotation: 180`
and `length: 473`; the `pendulum` attachment is at bone-local
`x: 316.79, y: 0.4815389`. Move the pivot half the bone's length along the bone's own
+x axis, `d = 236.5`: the bone's rotation is 180° in its parent's frame, so
`R(180)·(d, 0) = (-d, 0)`, and this bone has no children.

```diff
   { "name": "bone", "parent": "root", "length": 473,
-    "x": 204.753, "y": 708.0989, "rotation": 180 }
+    "x": -31.747, "y": 708.0989, "rotation": 180 }

   "pendulum": { "pendulum": { "image": "pendulum.png",
-    "x": 316.79, "y": 0.4815389, "rotation": -179.81934 } }
+    "x": 80.29,  "y": 0.4815389, "rotation": -179.81934 } }
```

```bash
rigc build --rig    work/repivot/repivot.rig.json \
           --motion work/repivot/repivot.motion.json \
           --images examples/3-timing-and-spacing/images \
           --out    work/t3b
```

**Verify the invariant first, arithmetically.** The art's centre in world coordinates
is `bone(x, y) + R(bone.rotation) · att(x, y)`. Computed from the two built skeletons,
before and after:

```
original  bone [204.753, 708.0989]  att [316.79, 0.4816]  -> art centre [-112.0370, 707.6174]
re-pivot  bone [-31.747, 708.0989]  att [ 80.29, 0.4816]  -> art centre [-112.0370, 707.6174]
art centre moved by 2.842e-14 units
```

⭐ **That is the criterion.** If the art's world position at the setup pose moves by
more than floating-point noise, the compensation is wrong, and no amount of looking at
frames will tell you which of the two numbers to blame.

**Then confirm the movement did change**, which is the half a pose cannot show. The
same displacement evaluated across the bone's own rotation:

| `rotate` | original art centre | re-pivot art centre | apart |
| --- | --- | --- | --- |
| 0° | `[-112.04, 707.62]` | `[-112.04, 707.62]` | **0.00 units** |
| 15° | `[-101.12, 625.64]` | `[-109.18, 686.85]` | 61.74 |
| 45° | `[ -18.91, 483.75]` | `[ -88.18, 650.98]` | 181.01 |
| 90° | `[ 205.23, 391.31]` | `[ -31.27, 627.81]` | 334.46 |
| 180° | `[ 521.54, 708.57]` | `[  48.54, 708.58]` | 473.00 |

**What the instruments say about it** — and this pair is why §1.3 carries its warning:

- **`diff` sees nothing.** `rigc diff work/t3b/skeleton.json <the export>` reads
  **1.000 on all 49 measures**: same bones, names, parents, order, slots, draw order,
  attachments, animations, timelines, key counts, curve kinds. All true, and all silent
  about a 236.5-unit move.
- **`check` sees it loudly**, with the framing pinned so the comparison is of pictures
  and not of framings:

  ```bash
  rigc check --candidate work/t3b --frames ref3/heavy \
             --viewport -573.3,-81.2,2176.3,990.1 \
             --texture-from examples/3-timing-and-spacing/export/3-timing-and-spacing.atlas \
             --all-frames
  ```

  ```
       MAE        mean 106.91  worst 116.67 at f0012   (0..255 over the union alpha; over the whole frame, mean 7.15)
                  ⭐ texture floor 3.62  above it 105.79   (over the reference's own pixels, 1.95 and 92.51)
       slot drift worst 42.4 px  "pendulum" at f0028
         chain                 slots   worst slot drift                      mean   MAE in it    share
         square                  1/1   0.4 px "square" f0000               0.3 px       10.20     3.2%
         bone                    1/1   42.4 px "pendulum" f0028           31.3 px      125.70    77.3%
         (unattributed)            —   —                                        —           —    19.5%

         frame      MAE   union px     Δpx  ref Δ   worst slot            drift   how       slots   note
         f0000     5.98       1246       —      —   square                 0.4   component  2/2
         f0001     6.18       1245      19     40   square                 0.4   component  2/2
         f0002    19.58       1280     456    520   pendulum               0.7   component  2/2
         f0003    46.11       1412     702    815   pendulum               2.1   component  2/2
         f0004    75.88       1608     808    939   pendulum               4.3   component  2/2
         f0005    93.32       1776     996   1125   pendulum               8.0   component  2/2
  ```

  ⭐ **Read the per-frame column before the mean.** `f0000` is **5.98** — the
  transcription's own texture floor, i.e. *no difference at all* — and it climbs
  monotonically from `f0002` as the bone rotates. That is the pivot's whole signature:
  **invisible in the pose, and everything in the movement**, which is what MOTION §3.9
  argues from the authoring side and what this measures from the ingest side. The
  `chains` table puts 77.3 % of the difference on the `bone` chain and 3.2 % on
  `square`, which is the edit's own blast radius.

⚠️ **Pin `--viewport` for a re-pivot check.** Drop the flag and the same run reads
`MAE mean 120.65` with `slot drift worst 30.3 px "pendulum" at f0000` — and that drift
at frame 0 is an artefact, because the re-pivot changed the skeleton's **world extent**,
so `frames.json`'s box came back `REFUSED, coordinates` and the framing was fitted
instead:

```
  framed to  256x116px  0.100498 px/unit  world x[-908.6 .. 1638.7] y[-74.6 .. 1079.7]  (fitted to the candidate's own drawn pixels)
  declared   frames.json's own box: REFUSED, coordinates — a fit there asks for 31.48 px, past the 11.74 px the extent-spread tolerance reaches — a different origin or a different unit, over 65 frame(s).
```

⇒ On any edit that changes the extent, take the viewport from the reference render's
own `world x[…] y[…]` line, or read `check`'s framing lines before its figures.

### 4.2 Renaming, and the name-agnostic mindset

The ask: *"give everything our project's names."* Mechanically a rename pass over the
rig spec; the discipline is in what you check afterwards.

**Everything in a rig spec resolves by name, and a miss is refused by name.** A bone's
`parent`, a slot's `bone`, a constraint's `bones` and `target`, a draw-order key's
`slot`, an authored mesh's vertex `weights` — and, across the two files, the motion
spec's `archetype` against the rig spec's `name`. That last one is the first refusal a
rename produces, before anything else has a chance to go wrong: a `rigc compile error`
naming the motion spec's path, the `archetype` that spec states, the path of the rig spec
it was handed, and the `name` that rig actually carries — both sides of the mismatch in
one sentence. [`src/compile.ts`](../src/compile.ts) builds it; the renamed copies this
section works on are not committed, for the reason the Appendix gives, so the figure is
described here rather than transcribed off one.

⭐ **A rename is therefore mostly safe by construction, and its failures arrive as
sentences naming both sides.** That is the reason to do it in the specs rather than in
emitted JSON, where the same mistake is a silently unresolved reference.

**Then check it with the name-agnostic groups**, because after a rename the name-keyed
measures are *supposed* to disagree. Renaming `bone`→`arm`, `square`→`block`, the two
slots to `arm-art`/`block-art` and their attachments to match:

```
  bones                 mean 0.567  over 8 measures
      1.000  count                        3/3         how many bones
      0.200  names                        1/5         the bone names themselves
      0.333  parent_by_name               1/3         each bone hangs off the same parent
      0.333  order                        1/3         the bones are declared in the same order
      0.333  length_present               1/3         a setup `length` is present or absent alike
      0.333  inherit_present              1/3         a setup `inherit` is present or absent alike
      1.000  depth_histogram              3/3         NAME-AGNOSTIC: as many bones at each depth
      1.000  degree_sequence              3/3         NAME-AGNOSTIC: as many bones with each child count

  bones (name-agnostic) mean 1.000  over 5 measures  — the same two skeletons compared with names thrown away
      1.000  count                        3/3         how many bones
      1.000  depth_histogram              3/3         as many bones at each depth
      1.000  degree_sequence              3/3         as many bones with each child count
      1.000  shape_histogram              3/3         as many bones of each depth-and-child-count shape (`d1c3` = one hop down, three children)
      1.000  order_shape                  3/3         the bones are declared in the same order of shapes

  slots                 mean 0.143  over 7 measures
      1.000  count                        2/2         how many slots
      0.000  names                        0/4         the slot names themselves
      0.000  order                        0/2         the slots array IS the draw order, so its order is data
      0.000  bone                         0/2         each slot is bound to the same bone
      0.000  attachment                   0/2         each slot shows the same setup attachment
      0.000  blend                        0/2         each slot uses the same blend mode
      0.000  color_present                0/2         a tint is present or absent alike

  slots (name-agnostic) mean 1.000  over 4 measures  — the same two skeletons compared with names thrown away
      1.000  count                        2/2         how many slots
      1.000  attachment_types_by_position 2/2         the same kind of attachment sits at each position in the draw order
      1.000  bone_binding_shape           2/2         as many slots hang off a bone of each shape (`?` = no such bone is declared)
      1.000  order_shape                  2/2         the draw order is the same order of `<attachment type>@<bone shape>`

  attachments           mean 0.889  over 9 measures
      1.000  skins                        1/1         the skin names
      1.000  count                        2/2         how many attachments
      0.000  names                        0/4         skin/slot/attachment keys
      1.000  type_counts                  2/2         as many of each attachment type
      …
  animations            mean 1.000  over 9 measures
```

Three things to read out of that, in order:

- **The name-keyed collapse is the task, not a defect.** `bones` 0.567, `slots` 0.143,
  `attachments` 0.889. Note that several *non*-name measures fall with them —
  `slots.bone`, `slots.blend`, `bones.parent_by_name` — because they are keyed **by**
  the name that changed. They are not saying the binding changed.
- 🚨 **`bones (name-agnostic)` and `slots (name-agnostic)` must stay 1.000.** They
  measure the rig with the vocabulary thrown away, so a rename that changed only names
  leaves them untouched. **A drop there is a structural mistake wearing a rename's
  clothes**, and it is the only assertion this recipe really has.
- **`animations` stays 1.000** because animation *names* were not part of the ask.
  Under the same edit `bones.names` reads `1/5` — `root` survived, and the total is the
  union of both vocabularies.

⛔ And remember §1.3: `diff` reads no coordinates either way. A rename that also moved
something is invisible to every measure in that report. Pair it with a `check` against
frames rendered from the original.

⚠️ **Do not rename toward what a rule seems to want.** `A27`'s
region-name-matches-page-filename is `spine-html` policy (§3.3): under the default
profile it does not fire, and renaming somebody's attachments to satisfy a policy they
never opted into is a change with no benefit to them. `A08` carried a name-identity
clause of the same kind until
[#574](https://github.com/firejune/rigc/issues/574) retired it, and that one is the
argument's own case study — the rename it seemed to want was one no renderer had ever
asked for.

### 4.3 Extending a foreign skeleton with a new animation

The ask: *"add a `nudge` to this."* There is no append — `build` re-emits the whole
skeleton — so the extension is an added block in the motion spec of a transcription
that already round-trips.

1. **Get the transcription to structural agreement first** (§2.3), and record the
   figure. Extending an unfinished transcription mixes two kinds of difference into
   every measurement after it.
2. **Add the animation to the motion spec.** Named easings here, not raw curves —
   §2.2's escape hatch is for reproducing an export's own beziers, and this movement
   has no export behind it. What goes *between* the poses is [MOTION.md](MOTION.md);
   this page stops at the mechanics.
3. **`build`, and read the count line.**

   ```bash
   rigc build --rig    work/extend/extend.rig.json \
              --motion work/extend/extend.motion.json \
              --images examples/3-timing-and-spacing/images \
              --out    work/t3c
   ```

   ```
     ..    pages=2 regions=2 bones=3 slots=2 animations=3 version=4.3.13 regionAttachments=2 meshAttachments=0 physicsConstraints=0 rig=3-timing-and-spacing-ess profile=spine
   ```

   `animations=3` where the export had 2. That line is the cheapest confirmation the
   block landed at all.
4. **Read `diff` knowing what it is about to say.**

   ```
     animations            mean 0.793  over 9 measures
         0.667  count                        2/3         how many animations
         0.667  names                        2/3         the animation names
         0.667  duration                     2/3         each animation runs as long (last key time, within one frame)
         0.889  timeline_kinds               8/9         the same timelines exist
         0.958  key_counts                   69/72       those timelines carry as many keys
         0.958  curve_kinds                  69/72       as many linear / stepped / bezier keys
         1.000  event_keys                   0/0         as many event firings  — neither side has any
         0.667  draw_order                   2/3         a draw-order timeline is present or absent alike
         0.667  deform                       2/3         a deform timeline is present or absent alike
   ```

   🚨 **Every one of those got worse, and that is the correct result.** The
   `animations` section went 1.000 → 0.793 because the candidate now has something the
   reference does not. `diff` measures agreement with a reference; you were asked to
   *disagree* with it, in one specific way. ⇒ **Check that the drop is confined to the
   `animations` section and is the size the addition explains** — one animation of
   three, three keys of seventy-two — and that `bones`, `slots`, `attachments` and
   `constraints` are all still 1.000. That last part is the real assertion here: *the
   extension changed nothing it was not supposed to change.*
5. **Look at it, then ask.** `render --animation nudge` and open the contact sheet;
   `vote` the foreign original against your extended build when the question is whether
   the new movement belongs beside the old ones. Nothing in this toolchain can answer
   that, and MOTION §4–§5 is how to shape the ballot so the answer informs.

---

## 5. Non-goals — stated, so nobody proposes them as gaps

🚫 **rigc does not read editor project files.** A `.spine` is the editor's own project
format, not skeleton data, and no rigc command opens one. The path form refuses it by
name:

```
rigc: …/hero.spine is neither a directory nor a .json skeleton
```

The route from a project file to rigc is the one the editor already provides: export
it, and start from the export. (The official examples' project files are public
domain — [NOTICE.md](../NOTICE.md) — and `scripts/fetch-examples.sh` does not download
them, because nothing here could use one.)

🚫 **Binary `.skel` is not read, and the honest statement has two halves.** rigc's
dependency *can* read it and rigc *does not*:

- `@esotericsoftware/spine-core@4.3.13` exports `SkeletonBinary`, whose
  `readSkeletonData` is the binary reader.
- **rigc's own source names it only in comments — no import, no call.** Every read path goes through
  `JSON.parse` and `SkeletonJson`, and the path resolver requires a `.json` extension —
  so a `.skel` is refused by the same sentence a `.spine` is, one layer before any
  format question arises.

⇒ Binary support is *reachable* rather than *present*: a plumbing job on a dependency
that already has the reader, not a parser to write. But it is not there, and nothing on
this page works on a `.skel` today. Re-export as JSON.

✅ **A skeleton-to-spec decompiler exists: `rigc ingest` (§2.0). This entry used to
refuse one, and all three of its reasons were measured and refuted** — issue
[#569](https://github.com/firejune/rigc/issues/569), 2026-09-17. The paragraph is
kept below rather than deleted, because what it got wrong is more useful than a
clean page:

> 🚫 ~~**No skeleton-to-spec decompiler.** Nothing turns skeleton JSON back into a rig
> spec and a motion spec. §2 is hand work, and that is the current state rather than a
> temporary one: a decompiler would have to invent the things the spec format exists to
> make explicit — **which pivot, which generator, which invariant** — and the compiler's
> own rule is that it never invents a value that is not in the spec.~~

| clause | what the measurement said |
| --- | --- |
| *which pivot* | ⛔ **refuted.** A bone's setup transform is in the skeleton, in full. 3,951 bones across 37 production exports and 15 rigs built from this tree were transcribed with **zero** decisions, and `diff`'s six bone measures — count, names, `parent_by_name`, order, `length_present`, `inherit_present` — read **1.000** on every file that built |
| *which generator* | ⛔ **refuted, and the premise is the error.** A decompiler must choose **no** generator. A generator is a *model* (`src/rig.ts`: *"they encode a deformation model … and a model is not a table of numbers"*); the skeleton holds geometry, and geometry is what the rig spec's authored form takes. Inferring a model would be the invention this clause feared; writing the numbers is its opposite. `gallery/look`'s four generator-built meshes came back as authored geometry and the rebuild is **byte-identical** — so a generator can always be flattened, and that is the direction the information flows |
| *which invariant* | ⛔ **refuted by omission, and this page already said how.** §2.1 step 3: *"Leave `invariants` out entirely — an absent field makes an archetype assertion SKIP, never pass."* `ingest` writes none. A decompiled spec is 91.8 % geometry, 8.2 % structure and **0 % intent**, and it says so instead of certifying something nobody measured |

⇒ **What survives is the stage, and one value is not "the things the spec format
exists to make explicit".** The clause was not wrong that a decompiler meets an
invention — it was wrong about *which*, and wrong that it is unavoidable: a refusal
naming the field is what this repository does with a missing number everywhere else,
and a stated absence is what `ingest` writes where the skeleton has none (§2.0, #714). ⚠️ Not to be confused with the *atlas*
importer below, which is a different direction and also exists.

⚠️ **What `ingest` is still not.** It reads skeleton JSON and writes two spec files.
It does not read a `.spine` project or a binary `.skel` (the two entries above stand
unchanged), it does not read the atlas or the art, it does not **edit** a skeleton,
and it makes no claim about whether an agent could have *produced* the numbers it
copied — only that the spec can carry them and `build` reproduces the file from them.

✅ **A packer and an importer both exist now, so do not report them as gaps.** This
non-goal used to read *"rigc emits one region per page and cannot do otherwise"*, and
[issue #4](https://github.com/firejune/rigc/issues/4) closed it: `build --pack` writes
shared pages losslessly and `build --atlas-in` resolves against a pack somebody else
made (AUTHORING §0.1–§0.2). One-region-per-page is now the **default**, not the only
shape. `--atlas-in` applies the page's `scale:`, so an imported pack states the
drawing's size rather than the pack's — to within the pack's own rounding, which is
§2.3's row and the whole of [issue #267](https://github.com/firejune/rigc/issues/267).

🚫 **No CLI unpacker, so `pose` needs loose art.** `pose` reads *loose part PNGs*
against one picture. A foreign export hands you a packed page instead, and pointing
`pose` at one is worse than useless — it treats the whole page as a single part and
answers confidently:

```bash
mkdir -p packed-only
cp examples/3-timing-and-spacing/export/3-timing-and-spacing.png packed-only/
rigc pose --images packed-only --frame 'ref-big/light@4fps/f0002.png'
```

```
rigc pose
  ..    frame   …/ref-big/light@4fps/f0002.png  (900x409)
  ..    ground  rgb(232, 232, 232) over 100% of the border ring
  ..    parts   …/packed-only  (1 png)
  ..    search  scale 0.5–2 in 7 step(s) · rotation -180°–180° step 15° · refuse above residual 0.25
  PLACE  3-timing-and-spacing.png  x=  324.3  y=  188.2  rot=  -91.4°  scale=0.629  residual=0.2083  unexplained= 30%
                                   found on a 7x3 anchor grid, step 4 at 32x reduction
```

📏 **Instrument re-baseline, 2026-09-03 — [#306](https://github.com/firejune/rigc/issues/306).**
Both blocks in this section were re-run and their residuals moved: the packed page
reads **0.2083** where this page used to print 0.2078, `pendulum.png` **0.0425**
where it printed 0.0410, and `square.png` **0.0331** where it printed 0.0330.
`pose`'s objective now interpolates the frame premultiplied, so a tap across a
silhouette no longer charges a part for the ground's colour — and the frames these
commands read are rendered by `rigc render`, so #306's arithmetic and
[#301](https://github.com/firejune/rigc/pull/301)'s renderer fix both moved them.
⚠️ A residual from before that date and one from after are not the same
measurement. The reading below does not depend on the digits: the point is that a
packed page is placed *without* being refused, and it still is.

⚠️ **`residual=0.2083` is *under* the default 0.25 refusal bar**, so nothing refused
it, and `PLACE` rather than `AMBIG` means nothing flagged it either. With the same frame
and the two real loose parts, the answer is what it should be:

```bash
rigc pose --images examples/3-timing-and-spacing/images \
          --frame 'ref-big/light@4fps/f0002.png' --scale 0.3,0.6
```

```
  ..    parts   …/examples/3-timing-and-spacing/images  (2 png)
  ..    search  scale 0.3–0.6 in 4 step(s) · rotation -180°–180° step 15° · refuse above residual 0.25
  PLACE  pendulum.png  x=  319.3  y=  214.5  rot=  -88.9°  scale=0.412  residual=0.0425  unexplained=  7%
                       found on a 12x5 anchor grid, step 5 at 16x reduction
  PLACE  square.png    x=  437.2  y=  343.1  rot=   -0.1°  scale=0.410  residual=0.0331  unexplained=  4%
                       found on a 57x26 anchor grid, step 4 at 4x reduction
```

⇒ **Check what is in `--images` before trusting a `pose` report on ingest work.** One
PNG where you expected several is the tell, and the `..    parts` line prints the
count. AUTHORING §11.4 is the rest of what that command cannot see.

⭐ **And on ingest work you usually have the thing `pose` is missing.** A skeleton you
are transcribing IS a compiled candidate, so the parts `pose` refuses because
something is drawn over them are readable through its own draw order and hierarchy —
`rigc chainfit --candidate <that skeleton> --images <dir> --frame <png>`, AUTHORING
§12. It is the natural second pass here: `pose` reads the trunk of a foreign figure,
`chainfit` reads the limbs it hides, and both report placements rather than grades.

📎 To be exact about what is missing: rigc *can* lift a region's drawing back off a
page — `extractRegion` does it, and the contour mesh generator uses it under
`--atlas-in` — so what is absent is a **command**, not the capability. Since issue
#570 that includes a region the pack **turned** (`rotate: 90`, `180`, `270`, or the
older `rotate: true`), which a foreign pack routinely is and rigc's own never is: the
lift transcribes `MeshAttachment.computeUVs`, the one routine in spine-core that
states where a turned region's texels are, so what a generator measures does not
depend on how the art was delivered (AUTHORING §0.2).

🚫 **No `validate --fix`, and no normalisation pass.** Every recipe in §4 is a change
you state in a spec and rebuild. A tool that rewrote somebody's export in place would
be making decisions on their behalf with nowhere to say it had — and, per §3.2, some of
those decisions would be wrong about the rule rather than about the file.

🚫 **`diff` will not be given coordinate measures to make it a geometry check.**
`check` is the geometry instrument, and it works by rendering, which is the only way to
compare two rigs that may be authored in different coordinate systems at different
scales. A coordinate diff between two skeletons would be arithmetic on numbers that do
not compare — `check`'s own report says the two world boxes *"are different coordinate
systems and do not compare; the pixel grid does."*

---

## Appendix — the corpus this page was verified against

Every command line above was run from a checkout with `bun run fetch-examples`
completed. Two skeletons carry all of it:

| Example | Files used | Licence |
| --- | --- | --- |
| **`3-timing-and-spacing`** | `export/3-timing-and-spacing-ess.json`; `export/3-timing-and-spacing.atlas` (one 512×128 page, `scale: 0.5`, 2 regions); `images/pendulum.png` (745×212); `images/square.png` (159×159) | `license.txt` present, © 2021-2025 Esoteric Software |
| **`spineboy`** | `export/spineboy-pro.json`, `export/spineboy-ess.json`, `export/spineboy.atlas`, `export/spineboy-run.atlas` | `license.txt` present, © 2013 Esoteric Software LLC |

The working directories the commands write into — `ref3/`, `ref-big/`, `render/`,
`work/`, `packed-only/` — are throwaway and none is committed.

⚠️ **`7-anticipation` ships no `license.txt` upstream**, so the redistribution grant its
siblings carry does not exist for it. No excerpt, figure or image on this page comes
from it; the only places it appears at all are the two corpus-wide tallies — §3.2's
*twelve of twelve skeletons* and §2.3's *nine of ten atlases* — both of which count
every directory the fetch produced.
`scripts/fetch-examples.sh` prints a warning naming it; [NOTICE.md](../NOTICE.md) has
the per-directory terms.

The transcription these recipes start from is
[`bench/transcriptions/3-timing-and-spacing/`](https://github.com/firejune/rigc/tree/main/bench/transcriptions/3-timing-and-spacing/),
unmodified. The re-pivoted, renamed and extended variants in §4 were built from copies
of it; none is committed, because each is an illustration of an edit rather than a
transcription of anything.
