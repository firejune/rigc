<p align="center">
  <img src="https://raw.githubusercontent.com/firejune/rigc/main/assets/banner.svg" alt="rigc - Rig compiler for Spine" width="100%" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/spine-rigc"><img src="https://img.shields.io/npm/v/spine-rigc.svg?style=flat-square&color=FF6B4A" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/spine-rigc"><img src="https://img.shields.io/npm/dm/spine-rigc.svg?style=flat-square&color=A855F7" alt="npm downloads" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-38BDF8.svg?style=flat-square" alt="license" /></a>
</p>

**Rig compiler for Spine.** Declarative rig specs in, Spine 4.3 skeleton data out,
verified by a `spine-core` round-trip. Built so AI agents can author rigs and check
their own work.

## What you get

<p align="center">
  <img src="https://raw.githubusercontent.com/firejune/rigc/main/assets/rigc-demo.gif" alt="Loose part PNGs assembling themselves into a character that breathes, blinks and waves" width="600" />
</p>

<p align="center"><em>Fourteen hand-drawn part PNGs, one rig spec, one motion spec — the assembly,
the breathing and the wave are all rigc-compiled Spine animations, rendered with
<code>rigc render</code>.</em></p>

Loose part PNGs and two small JSON files in; **Spine 4.3 skeleton data out** — a
`skeleton.json` and a `skeleton.atlas` that load in any Spine runtime and **import
into the Spine editor**. Nothing is written unless a round-trip through Spine's own
parser and a list of named assertions all come back green.

| You have | You run | You get |
| --- | --- | --- |
| part PNGs, a rig spec and a motion spec | `rigc build` | `skeleton.json` + `skeleton.atlas` — or a failure named by rule, and **nothing on disk** |
| the same, and one texture instead of many | `rigc build --pack` | the parts arranged onto shared atlas pages, written beside the skeleton — losslessly, so the picture is the picture |
| a pack somebody already made | `rigc build --atlas-in` | the same skeleton, with every part resolved to a region of that atlas — or a named refusal, never a part that silently does not draw |
| a compiled rig | `rigc render` | every animation as PNG frames, plus one labelled contact sheet of the whole shot |
| a compiled rig | `rigc preview` | one self-contained `.html` that plays it in Spine's own web player |
| two to four compiled rigs | `rigc vote` | one ballot page a human picks from, and the answer checked into a ledger |
| a picture of a key pose | `rigc pose` | where each loose part PNG sits in it, in spec coordinates — the movement between two poses is then yours to key ([docs/MOTION.md](docs/MOTION.md)) |

Everything in that table needs Bun and this package: no clone, no reference art, no
art pipeline, no server.

## What rigc is, and what it is not

rigc emits **Spine's own skeleton data format**. That is the whole positioning, and
it cuts both ways:

- The output loads in any Spine runtime, and it **imports into the Spine editor**.
  A compiled rig is a starting point on a timeline, not a finished shot — **an AI
  drafts, a human refines in the editor**. rigc is complementary to the editor. It
  is not a replacement for it, and it is not a way around one.
- rigc **links `@esotericsoftware/spine-core`** to validate what it emits — the
  round-trip through the official parser is the only reason its output can be
  trusted at all. So the [Spine Runtimes License Agreement](https://esotericsoftware.com/spine-runtimes-license)
  applies to rigc exactly as it applies to any other runtime integration.

### Licensing, stated plainly

rigc's own code is MIT (see [LICENSE](LICENSE)). That says nothing about Spine, and
the following is a restatement of Esoteric Software's terms, not a term of ours:

1. rigc's output **is Spine skeleton data**.
2. Playing Spine skeleton data in a product requires **a Spine Runtime**.
3. The Spine Runtimes License requires **each user of such a product to own a Spine
   editor licence**.
4. rigc **links `spine-core`** itself, so the same obligation covers running rigc.

> **Using rigc, or shipping rigc's output in a product, requires a Spine editor
> licence.** rigc does not change that requirement in either direction — it neither
> adds one nor removes one. If you were going to need an editor licence to ship a
> Spine animation, you still do; rigc is not a route around it.

See [NOTICE.md](NOTICE.md) for the full notice.

The problem rigc is aimed at is narrow. An agent asked to author a rig has no way
to tell whether it succeeded: Spine's JSON parser accepts a great deal of nonsense
without a murmur — a constraint in the 4.2 shape simply vanishes, a `size:` that
disagrees with the PNG collapses every UV, a four-number curve array yields NaN,
a mesh whose vertex count happens to equal its UV count silently loses its bone
weights. Every one of those loads clean, plays, and is wrong. rigc's answer is to
make the failure legible: compile from a spec, round-trip through the real parser,
run a list of named assertions, and **write nothing unless all of them are green.**

## Install

📦 **rigc measures loose PNGs directly, and emits one atlas page per image unless
you ask otherwise.** `rigc build --pack` arranges every part onto shared pages and
writes them into `--out`; `--atlas-in` builds against a pack somebody else made.
Both are opt-in and both are narrow — no trimming, no rotation, no scaling — and
[AUTHORING §0.1–§0.2](docs/AUTHORING.md) states the limits before you hit them.

rigc runs on [Bun](https://bun.sh). The package ships its TypeScript sources and
Bun runs them, so there is no build step and no `dist/` that can drift from the
repository it was cut from.

**The npm package is `spine-rigc`; the command it installs is `rigc`.** npm
refuses the name `rigc` as too similar to packages that already exist, so the
project, this repository and the executable keep their name and only the
registry entry is spelled out.

```bash
bunx spine-rigc --help    # run it without installing
bun add -g spine-rigc     # or install the command
bun add -d spine-rigc     # or pin it in a project
```

`npx spine-rigc` works too, as long as Bun is on `PATH` — the executable is a
Bun script, and npm only writes the shim that calls it.

Installed, the command is `rigc`. The examples below spell it `bun cli.ts`
because they are written from a clone of this repository (`bun install`, then run
the CLI in place); the two are interchangeable — `rigc build …` is
`bun cli.ts build …`.

Two commands are repository workflows rather than package ones: `bench` and
`check` measure against Spine's official example projects and the reference
frames rendered from them, which are fetched rather than redistributed (see
[NOTICE.md](NOTICE.md)). They need a clone and `bun run fetch-examples`, and say
so by name when the corpus is absent.

## First rig in ten minutes

A whole rig, end to end, in a scratch directory: three tiny plates, two JSON
files, one `build`, one `validate`. No clone, no art pipeline, nothing fetched.

🚫 **Every value below is invented for this section** — a doll that exists
nowhere else in this repository. That is [AUTHORING.md](docs/AUTHORING.md) §3's
rule applied here: no example value in these documents is copied out of a
reference export, so nothing you read in a quickstart is an answer to anything
[the ladder](https://github.com/firejune/rigc/blob/main/docs/LADDER.md) measures.

**1. Install the command.**

```bash
bun add -g spine-rigc     # installs `rigc`
```

Or skip the install and prefix every command below with `bunx `, e.g.
`bunx spine-rigc build …`.

**2. Make a directory and three plates.** rigc measures PNGs rather than trusting
a number you typed (R5), so the art has to exist. These three are solid colours a
few dozen pixels across — a hull, a mast and a lamp:

```bash
mkdir -p buoy/images && cd buoy
bun -e '
const parts = {
  "images/hull.png": "iVBORw0KGgoAAAANSUhEUgAAADgAAAAMCAYAAAA3bX6lAAAAKElEQVR42mOI8bL6P5wxw6gHRz046sFRD456cNSDox4c9eCoBwcrBgDSZ+mdl2OiDgAAAABJRU5ErkJggg==",
  "images/mast.png": "iVBORw0KGgoAAAANSUhEUgAAAAgAAAA0CAYAAAC3t3ldAAAAH0lEQVR42mO4dunIf3yYYVTBqIJRBaMKRhWMKhgcCgBGJo4s9YnopgAAAABJRU5ErkJggg==",
  "images/lamp.png": "iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAAAHElEQVR42mP4v8HhPzUww6hBowaNGjRq0HAzCADvdrVmFPbc+QAAAABJRU5ErkJggg=="
};
for (const [p, b] of Object.entries(parts)) await Bun.write(p, Buffer.from(b, "base64"));
'
```

**3. The rig spec — `buoy.rig.json`.** Structure only: bones, the slots array in
draw order, and one skin mapping each slot to a plate.

```json
{
  "spec": "rigc-rig/1",
  "name": "buoy",
  "images": "images",
  "skeleton": { "width": 200, "height": 200 },
  "bones": [
    { "name": "root" },
    { "name": "hull", "parent": "root", "x": 0, "y": 0 },
    { "name": "mast", "parent": "hull", "x": 0, "y": 4 },
    { "name": "lamp", "parent": "mast", "x": 0, "y": 52 }
  ],
  "slots": [
    { "name": "mast", "bone": "mast", "attachment": "mast" },
    { "name": "hull", "bone": "hull", "attachment": "hull" },
    { "name": "lamp", "bone": "lamp", "attachment": "lamp" }
  ],
  "skins": {
    "default": {
      "mast": { "mast": { "image": "mast.png", "y": 26 } },
      "hull": { "hull": { "image": "hull.png" } },
      "lamp": { "lamp": { "image": "lamp.png" } }
    }
  }
}
```

Three things in there are worth naming, because each is a rule rather than a
style: the **slots array is the setup draw order** (R4) — index 0 is furthest
back, so the mast is behind the hull; the attachment carries an **`image`
instead of a `width`/`height`** (R5), which is what makes the size in the
skeleton and the size in the atlas incapable of drifting apart; and the mast's
`"y": 26` offsets the plate *within* its slot so the bone sits at the mast's foot
rather than its middle.

**4. The motion spec — `buoy.motion.json`.** Time only, aimed at the rig by name:

```json
{
  "spec": "rigc-motion/1",
  "archetype": "buoy",
  "cut": "buoy",
  "easings": { "swing": [0.42, 0, 0.58, 1] },
  "animations": {
    "bob": {
      "duration": 2,
      "loop": true,
      "tracks": [
        {
          "bone": "hull",
          "property": "translatey",
          "keys": [
            { "t": 0,   "v": [0],  "ease": "swing" },
            { "t": 0.5, "v": [5],  "ease": "swing" },
            { "t": 1.5, "v": [-5], "ease": "swing" },
            { "t": 2,   "v": [0] }
          ]
        },
        {
          "bone": "mast",
          "property": "rotate",
          "keys": [
            { "t": 0, "v": [-6], "ease": "swing" },
            { "t": 1, "v": [6],  "ease": "swing" },
            { "t": 2, "v": [-6] }
          ]
        }
      ]
    }
  }
}
```

`archetype` must equal the rig's `name`. `duration` is declared and then checked
against what actually compiled (R7). The **last key of each track carries no
easing** — there is nothing after it to ease towards, and saying otherwise is a
compile error.

**5. Build, then re-gate what it wrote.**

```bash
rigc build --rig buoy.rig.json --motion buoy.motion.json --images images --out spine
rigc validate spine
```

`build` prints every assertion by name, then the shape of what it emitted, then
the two files:

```
  ..    pages=3 regions=3 bones=4 slots=3 animations=1 version=4.3.13 regionAttachments=3 meshAttachments=0 physicsConstraints=0 rig=buoy profile=spine
rigc: wrote …/buoy/spine/skeleton.json
rigc: wrote …/buoy/spine/skeleton.atlas
```

`profile=spine` is the rulebook that judged it: *is this valid Spine 4.3 that any
runtime plays correctly?* That is the default, and the [Profiles](https://github.com/firejune/rigc/blob/main/docs/BENCHMARK.md#profiles--wrong-versus-not-how-we-do-it-here)
section of the benchmark dossier is where the other one lives. `validate` then re-reads those
artifacts from disk and ends `rigc: green`. That is a rig. `spine/skeleton.json`
is Spine 4.3 skeleton data — it loads in a Spine runtime and it imports into the
Spine editor.

**Try breaking it**, because the validator's messages are the interface here and
they are worth meeting once on purpose. With `spine/` built, rename
`images/hull.png` to `images/raft.png` and re-run `rigc validate spine`:

```
FAIL  A17_ATLAS_PAGE_FILES_EXIST: page "../images/hull.png" is not on disk at …/images/hull.png
rigc: 1 assertion(s) failed
```

Put the name back and it is green again. The same gate runs inside `build`, and
a FAIL there stops it **before it writes** — a red build leaves no half-built
artifact on disk to mistake for a result, and there is no flag that changes that.

**6. See what you built.**

🚨 **Green is a claim about validity and about nothing else.** A rig whose head
sits visibly off its torso passes every assertion, loads in `spine-core` and steps
numerically clean — the offsets are the ones your spec asked for, and no
assertion can know you did not mean them. The only remedy is looking, and both
commands below need nothing you do not already have: no reference frames, no
second package, no server.

```bash
rigc render  --candidate spine          # PNG frames + a contact sheet, in render/
rigc preview --candidate spine          # one .html file that plays it: preview.html
```

**`render`** samples every animation at 12 fps and writes `render/<animation>/f0000.png…`
with a `contact.png` beside them — every frame of the shot as one labelled grid,
which is the picture to open first, because spacing is a comparison *across*
frames. It draws with rigc's own rasteriser (the one `check` measures with), so
it needs no browser and no network, and the `frames.json` it leaves beside the
directories makes the result a frame set like any other — the world box every
frame is a picture of. `--animation <name>` narrows it to one, `--fps` and
`--max` change the rate and the frame size.

**`preview`** writes a single self-contained `.html`: your skeleton, your atlas
and every page's PNG bytes are embedded in it as data URIs, and it plays them in
the **official [Spine Web Player](https://esotericsoftware.com/spine-player)**.
Double-click it, or attach it to a message — the file carries the whole artifact.
It is also the strongest interop statement in this repository: a rig that plays
there has been played by Esoteric Software's own runtime rather than by ours.

> ⚖️ The player itself is **referenced, not embedded** — the page loads it from
> unpkg, so the first open needs a network, and rigc redistributes nothing
> Esoteric Software owns (see [NOTICE.md](NOTICE.md)). Everything the player
> draws is inside your file.

**7. Let someone choose.** Sooner or later you will have two builds that both pass
the gate and no instrument that can separate them. `vote` puts them in one page
side by side, labelled `A` and `B` with no paths on screen, and takes an answer
back:

```bash
rigc vote --candidate spine-a --candidate spine-b   # -> ballot.html, open it and pick one
rigc vote --record vote-<id>.json                   # -> checks the answer into votes.jsonl
```

The voter picks a winner or says "tie / no preference"; the page hands them a
small JSON file to save; `--record` checks that file against the ballot's own
hashes and appends one line to an append-only ledger, refusing by name anything
that does not belong to it. See
[Letting someone choose](https://github.com/firejune/rigc/blob/main/docs/BENCHMARK.md#letting-someone-choose--rigc-vote).

**Where to go next.**

- 📘 **[docs/AUTHORING.md](docs/AUTHORING.md)** is the real guide — both files
  field by field, the emission rules, every named failure mapped to the file that
  has to change, and §8–§9 for reproducing a shot you were given as pictures. It
  ships inside the npm package too, at
  `node_modules/spine-rigc/docs/AUTHORING.md`.
- `rigc explain --rig buoy.rig.json --motion buoy.motion.json --out spine` prints
  the compiled rig as a table — every bone with its resolved parent, the slots in
  draw order, every timeline key by key — and writes nothing. It is what to reach
  for when a rig compiles and still looks wrong.
- 🚨 **A green gate does not mean the animation is right**, and no assertion
  could. If you have reference pictures of the shot,
  `rigc check --candidate spine --frames <dir>` is the half of the loop that can
  see a wrong animation — AUTHORING.md §9.
- [docs/LADDER.md](https://github.com/firejune/rigc/blob/main/docs/LADDER.md) is the benchmark: the same job, from a brief
  and rendered frames, scored. [docs/PILOT.md](https://github.com/firejune/rigc/blob/main/docs/PILOT.md) is how to run an
  agent through it and score what comes back.
- 🤖 **Handing the authoring to an AI agent?**
  [docs/PROMPTING.md](docs/PROMPTING.md) is the operator's page — the six prompt
  clauses a measured pilot run paid for, and what you can leave unsaid.

## See what you built, and let someone choose

Steps 6 and 7 above are the three commands that need nothing but a compiled rig — no
reference frames, no second package, no server. **`render`** writes every frame as a
PNG plus one contact-sheet grid of the whole shot; **`preview`** writes one
self-contained `.html` that plays it in Spine's own web player; **`vote`** puts two to
four candidates in one page and takes a human's answer back. Reach for them the moment
a rig compiles green, because green says nothing at all about the picture.

Three properties of `vote` are worth stating, because they are what make its ledger
usable by the next agent rather than by a reader: **a tie is a recorded outcome, not a
missing one** — `both-unacceptable` is the tie that means *propose again*, and it is
unreachable if ties are not recordable; **the winner is a digest, not a label**, since
`B` means nothing outside one ballot while a digest identifies the same pixels
anywhere; and **every line carries a reason code** from a closed enumeration that is
enforced, so *"tie, because this one is better"* is refused.

🎞️ **Authoring the movement those pages show you** — key poses, in-betweening, and how
to spread candidates so a ballot informs — is [docs/MOTION.md](docs/MOTION.md).

📐 **`rigc pose --images parts/ --frame poseA.png` runs the other way.** Every command
above takes something you authored and tells you about it; this one takes a **picture
the user already has** — one key pose — and reports where each loose part PNG sits in
it, so those coordinates go into the rig and the motion **by construction** and the
effort goes into the part no instrument can measure: the movement between two poses.
A part that matches nowhere is refused by name, two near-equal placements are reported
as both, and nothing it prints is a score. Fields, the coordinate contract and the
limits: [AUTHORING.md §11](docs/AUTHORING.md).

## Commands

Every command takes its paths explicitly. `rigc <command> --help` prints its flags, and
[AUTHORING.md §0](docs/AUTHORING.md) is the same list with what each flag means, which
commands take it and what its default is.

| Command | Does |
| --- | --- |
| `build --rig … --motion … --out …` | compiles, gates, and **writes only if the gate is green**. `--images <dir>` says where the rig spec's `image` names resolve, `--manifest` adds measured art, and `--copy-images` copies every page PNG into `--out` so the directory is self-contained |
| `build … --pack` | the same build with every part arranged onto **shared** atlas pages, written into `--out` — losslessly, and gated a second time as the pair that ships. `--page-size` and `--padding` tune it |
| `build … --atlas-in <file.atlas>` | the same build with every part resolved to a **region of an existing pack** instead of a loose PNG; a name the atlas lacks, a size the spec disagrees with or a rectangle off its page is refused by name |
| `validate <dir>` | re-gates artifacts already on disk |
| `explain --rig … --motion …` | the compiled rig as a table — every bone with its resolved parent, the slots in draw order, every timeline key by key. Writes nothing. What to reach for when a rig compiles and still looks wrong |
| `render --candidate <dir>` | PNG frames plus a contact sheet, in `render/` |
| `preview --candidate <dir>` | one self-contained `.html` that plays it |
| `vote --candidate a --candidate b` | one `.html` that asks a human which; `vote --record <file>` checks the answer into `votes.jsonl` |
| `pose --images <dir> --frame <png>` | reads part placements **out of** a picture |
| `diff <candidate.json> <reference.json>` | structural comparison of two skeletons, one ratio per measure and deliberately no combined score |
| `check --candidate <dir> --frames <dir>` | the candidate against reference pictures — the only instrument here that can see a *wrong animation* |
| `bench <rung> --candidate <dir>` | one rung of the benchmark ladder |

`diff`, `check` and `bench` measure against something you were given; the first two
work on any frames you have, and `bench` is a repository workflow that needs a clone
and `bun run fetch-examples`. The reasoning behind all three is in
[the benchmark dossier](https://github.com/firejune/rigc/blob/main/docs/BENCHMARK.md).

`build` and `validate` both default to `--profile spine` — the 25 validity rules, which
ask *is this valid Spine 4.3 that any runtime plays correctly?* `--profile spine-html`
adds all 39: the other 14 are one renderer's policy and one canvas budget's, and they
fire on perfectly correct editor-produced Spine data, so reach for that profile when
you are shipping into *that* project rather than to be thorough. A report always names
the profile it ran and lists what that profile left out.

Several cuts can also be registered in a `cuts.json` and built by name
(`build --cut my_cut --cuts path/to/cuts.json`); every path in that table resolves
relative to the `cuts.json` file itself, so the table lives with the project that owns
the art. Its shape is under
[Usage](https://github.com/firejune/rigc/blob/main/docs/BENCHMARK.md#usage).

## Documentation

| Document | For |
| --- | --- |
| 📘 **[docs/AUTHORING.md](docs/AUTHORING.md)** | **the format guide, and the one to read before writing a spec.** Both input files field by field with a complete minimal example each, every field with its Spine meaning, the rules that decide what is emitted, the build → read the report → fix → repeat loop, the map from every named failure to the file that has to change, and the features rigc refuses by name so you do not spend a loop discovering them. It travels **inside the npm package**, at `node_modules/spine-rigc/docs/AUTHORING.md` |
| 🎞️ **[docs/MOTION.md](docs/MOTION.md)** | **the key-pose recipe.** How to get two poses, what a pair of poses does and does not fix, the in-betweening rules and where each comes from, and how to spread candidates so a ballot informs. Ships in the package too |
| 📥 **[docs/INGEST.md](docs/INGEST.md)** | **working with a skeleton you did not author.** What every command can and cannot do with a foreign `skeleton.json`, reading it with the toolchain, transcription as the route that makes it yours, what each validator complaint means on an export, and the re-pivot/rename/extend recipes. Ships in the package too |
| 🤖 **[docs/PROMPTING.md](docs/PROMPTING.md)** | **handing the authoring to an AI agent** — the prompt clauses a measured pilot run paid for, and what you can leave unsaid. Ships in the package too |
| 🔬 **[docs/SPEC_COVERAGE.md](docs/SPEC_COVERAGE.md)** | Spine 4.3's full export surface against what rigc emits and what the official examples measurably use, with the ordered gap list |
| 🎓 **[the benchmark dossier](https://github.com/firejune/rigc/blob/main/docs/BENCHMARK.md)** | **why you can trust the output.** The yardstick, `diff` and `check` and what neither can see, the eight-rung ladder and the spineboy graduation exam, the run viewer, the 36 named assertions with their profiles, and the selftest that has watched every one of them fire. Repository material — it is not in the npm package |
| 📋 [LADDER.md](https://github.com/firejune/rigc/blob/main/docs/LADDER.md) · [GATE.md](https://github.com/firejune/rigc/blob/main/docs/GATE.md) · [PILOT.md](https://github.com/firejune/rigc/blob/main/docs/PILOT.md) | the live rung ledger, the clause statements a candidate is graded against, and how to run an agent through the ladder and score what comes back |

## Why you can trust the output

rigc is measured against **Spine's own official example projects** — the
`1-weight-and-mass` … `8-follow-through` series as a difficulty ladder, with spineboy
as the graduation exam.

🎓 **The ladder is complete, 2026-08-28.** All eight numbered rungs and the
spineboy graduation exam are cleared and hold under the current gate, **v2.3**, every clause PASS or SKIP:
worst attributable slot drift **5.55 px** against a 6.0 px bar, and **0 of 124**
frame-change disagreements. Recompiling the same spec in a different session
reproduced every field of the measurement record **to the digit**. The rungs stay
in place as regression gates.

🗓️ **One rung's pass was withdrawn and restored on 2026-09-02, and both are dated
facts.** `check`'s extent tolerance ([PR #254](https://github.com/firejune/rigc/pull/254))
changed which box a set is measured in, and rung 7's stored candidate failed **G2**
under it — one of its three slots draws in every set and is attributable in none,
and no read-down ground survived the framing change. The gate then answered the two
clause questions that exposed, as **v2.3**: a read-down names the framing of its
evidence, and a slot whose attributability is **measured** to be capped below the bar
reads down when everything observable about it is independently verified strict. That
rung's third attempt clears on those grounds, on the candidate it already had.
**Rungs 1–6 and 8 and the graduation exam were unaffected throughout**: each reproduces
its gated figures to the digit, and the 5.55 px and 0-of-124 figures above are among
them. Both verdicts, and the sweep of every candidate under the new gate, are in
[docs/LADDER.md](https://github.com/firejune/rigc/blob/main/docs/LADDER.md)'s *PR #254 instrument re-inspection* and *gate-v2.3
re-inspection*.

⚠️ **What that certifies, stated exactly.** That **the tool, the guide and the
protocol reach the bar across a bounded series of honest attempts, each residual
diagnosed and fixed** — spineboy took five, and the last inherited its
predecessor's specs under the run protocol's inheritance clause. It is **not**
that an agent authors a spineboy-scale rig from the brief alone in one run: the
ladder has not demonstrated that, and each row records which of the two it is.

The whole dossier — the yardstick, `diff` and `check` and what neither of them can
see, every rung, the run viewer, the 39 assertions and the selftest behind them — is
[docs/BENCHMARK.md](https://github.com/firejune/rigc/blob/main/docs/BENCHMARK.md).
Live rung status is
[docs/LADDER.md](https://github.com/firejune/rigc/blob/main/docs/LADDER.md).

## Contributing

Issues are the ledger; see [CONTRIBUTING.md](https://github.com/firejune/rigc/blob/main/CONTRIBUTING.md) for what a change
has to clear before it lands. Releases are cut by release-please —
[RELEASING.md](https://github.com/firejune/rigc/blob/main/RELEASING.md).

## Licence

MIT — see [LICENSE](LICENSE). Third-party terms, including the Spine editor licence
requirement that this project inherits, are in [NOTICE.md](NOTICE.md).
