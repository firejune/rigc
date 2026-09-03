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
   `validate`, `render`, `preview`, `vote`, `check` and `diff` all take a
   `skeleton.json` path directly, and none of them needs a rig spec to do it.
2. **rigc cannot write one back.** There is no command that edits a skeleton, no
   importer, and no route from skeleton JSON to specs. The only thing that produces a
   skeleton is `build`, and `build`'s input is a rig spec plus a motion spec.
   ⇒ **Every route that ends in a changed file goes through transcription** (§2).

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
  ..    profile spine — 7 renderer-policy and 7 archetype assertion(s) do not apply
  PASS  A07_ATLAS_TEXT_SHAPE
  PASS  A00_ROUNDTRIP_PARSE
  PASS  A16_SKELETON_VERSION_4_3
  …
  SKIP  A31_DRAW_ORDER_OFFSETS_RESOLVE: no animation carries a drawOrder timeline
  SKIP  A32_EVENT_KEYS_RESOLVE: no animation carries an event timeline
  SKIP  A34_CONSTRAINT_TIMELINE_TARGETS: no animation carries a constraint timeline
  SKIP  A35_DEFORM_KEYS_FIT_THE_ATTACHMENT: no animation carries a deform timeline
  SKIP  A33_VERTEX_ATTACHMENT_GEOMETRY: the skeleton carries no bounding box, clipping attachment or path
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
  **free inventory of what the skeleton does not contain**. The five lines above tell
  you, without your having opened the JSON, that this export has no draw-order
  timeline, no event timeline, no constraint timeline, no deform timeline, and no
  bounding box, clipping attachment or path.
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

`diff` takes two compiled skeletons and reports 49 measures in eight groups. Both
sides may be foreign; the interesting pairing during ingest is **your transcription
against the export it came from**:

```bash
rigc diff work/t3/skeleton.json \
          examples/3-timing-and-spacing/export/3-timing-and-spacing-ess.json
```

```
rigc diff
  candidate  …/work/t3/skeleton.json
  reference  …/examples/3-timing-and-spacing/export/3-timing-and-spacing-ess.json
  ..         bones=3/3  slots=2/2  skins=1/1  attachments=2/2  constraints=0/0  animations=2/2  events=0/0   (candidate/reference)

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

⛔ **`diff` is blind to every coordinate.** No measure reads a bone's
`x`/`y`/`rotation`, an attachment's offset, or a key's value — only *presence*,
*names*, *counts*, *order* and *kinds*. §4.1 moves a pivot 236.5 units and every one
of the 49 measures still reads **1.000**. ⇒ Never take a green `diff` as evidence that
a geometric edit did not land, and never take it as evidence that one did.

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

It takes the same arguments as `build` minus `--profile`, prints the resolved account
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

## 2. Transcription — the route that makes a foreign skeleton yours

Everything in §1 reads. To **change** anything you need specs, and getting specs out
of a skeleton is a job rigc does not do for you: the numbers come out of the JSON by
hand, into a rig spec and a motion spec, and `build` emits a new skeleton from those.

⚠️ **Say this to the user before starting, because it is the part that surprises.**
Transcription is not a conversion step you run; it *is* the work. What you get for it
is that the file becomes editable by declaration — after transcription a pivot move is
two numbers in a spec (§4.1) and a new animation is an added block (§4.3), where
before it was a hand-edit of emitted JSON with nothing checking it.

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

**Why it is worth a section anyway.** That line used to be two `FAIL`s:

```
  FAIL  A35_DEFORM_KEYS_FIT_THE_ATTACHMENT: … key 1: offset 1 is odd, so the run's x values land on y slots and back again
  FAIL  A35_DEFORM_KEYS_FIT_THE_ATTACHMENT: … key 1: the run holds 147 numbers and the deform array is x, y pairs
```

and nothing was wrong with the data. `hoverboard-board` is an unweighted mesh with 148
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

### 3.3 Profile choice, and the fourteen rules that will not fire

`--profile spine` is the default and answers *"is this valid Spine 4.3 that any
runtime plays correctly?"* — and it is the right profile for foreign data, because the
other one is this project's own renderer and archetype policy.

**Fourteen assertions do not run under `spine`, and they come back `PROF`, not
`SKIP`:**

| Excluded as | Rules |
| --- | --- |
| **renderer policy** (7) | `A11_NO_CLIPPING_ATTACHMENTS`, `A12_NO_DARK_COLOR`, `A13_MESH_BUDGET`, `A14_NO_FULL_FRAME_MESH`, `A15_IDLE_NO_MESH_BONE_KEYS`, `A19_OVERLAY_PNGS_HAVE_ALPHA`, `A27_REGION_NAME_MATCHES_PAGE_FILENAME` |
| **archetype policy** (7) | `A21_MESH_RIM_PINNED`, `A24_AXIS_SPACE_STROKE`, `A25_DETACHED_BONE_PARENTAGE`, `A26_SLOT_DRAW_ORDER`, `A28_RIBBON_ROWS_SHARE_WEIGHTS`, `A29_STROKE_WITHIN_CONTACT_DEPTH`, `A30_STROKE_WITHIN_CAP_CONTAINMENT` |

Three further rules — **`A06`**, **`A08`** and **`A20`** — are *mixed*: their validity
clauses run in both profiles and their policy clauses only under `spine-html`. `A06`'s
size-vs-PNG check is validity; one-part-per-page coverage, rotation and premultiplied
alpha are policy. `A08`'s attachment→region join is validity; requiring the two names
to be *identical* is policy. `A20`'s weight coherence is validity; requiring a mesh to
be weighted at all is policy.

⚠️ **`--profile spine-html` on foreign data produces a wall of failures that mean
nothing about the file.** Same `spineboy-pro.json`, same atlas, one flag changed — the
run ends `rigc: 53 assertion(s) failed`, and this is the tally with one real message
per rule:

| Count | Rule | One of its messages |
| --- | --- | --- |
| **40** | `A06_ATLAS_PAGE_SIZE_MATCHES_PNG` | `region "crosshair" has UVs (0.181640625,0.06640625)-(0.2255859375,0.2421875); one part per page must cover the page exactly` |
| **10** | `A15_IDLE_NO_MESH_BONE_KEYS` | `idle keys bone "front-shoulder", which drives a mesh — meshes never idle-skip` |
| **2** | `A20_MESH_WEIGHTS_COHERENT` | `mesh "hoverboard-board" is unweighted; the ring tier drives meshes by bones` |
| **1** | `A11_NO_CLIPPING_ATTACHMENTS` | `1 clipping attachment(s); the renderer skips them silently` |

Every one of those is a correct statement about a correct file: the atlas *is* packed,
a bone *does* key a mesh, a mesh *is* unweighted, a clipping attachment *is* present.
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
rename produces, before anything else has a chance to go wrong:

```
rigc compile error: …/work/renamed/pendulum-rig.motion.json: motion spec names
archetype "3-timing-and-spacing-ess" but the rig spec at
…/work/renamed/pendulum-rig.rig.json is called "pendulum-rig"
```

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

⚠️ **Do not rename toward what a rule seems to want.** `A08`'s name-identity clause and
`A27`'s region-name-matches-page-filename are both `spine-html` policy (§3.3): under
the default profile they do not fire, and renaming somebody's attachments to satisfy a
policy they never opted into is a change with no benefit to them.

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
- **rigc's own source references it zero times.** Every read path goes through
  `JSON.parse` and `SkeletonJson`, and the path resolver requires a `.json` extension —
  so a `.skel` is refused by the same sentence a `.spine` is, one layer before any
  format question arises.

⇒ Binary support is *reachable* rather than *present*: a plumbing job on a dependency
that already has the reader, not a parser to write. But it is not there, and nothing on
this page works on a `.skel` today. Re-export as JSON.

🚫 **No skeleton-to-spec decompiler.** Nothing turns skeleton JSON back into a rig spec
and a motion spec. §2 is hand work, and that is the current state rather than a
temporary one: a decompiler would have to invent the things the spec format exists to
make explicit — which pivot, which generator, which invariant — and the compiler's own
rule is that it never invents a value that is not in the spec. ⚠️ Not to be confused
with the *atlas* importer below, which is a different direction and does exist.

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
`--atlas-in` — so what is absent is a **command**, not the capability. It refuses by
name on a region packed `rotate: 90` (AUTHORING §0.2), which a foreign pack can be and
rigc's own never is.

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
