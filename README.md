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

<p align="center"><em>Fourteen part PNGs drawn from scratch for this repo, one rig spec, one motion spec — the assembly,
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
| the same picture, and a rig | `rigc chainfit` | the parts `pose` refuses because something is drawn over them — read through the candidate's own draw order and hierarchy, with the share of each part the answer was measured on |

Everything in that table needs Bun and this package: no clone, no reference art, no
art pipeline, no server.

## What rigc is, and what it is not

rigc emits **Spine's own skeleton data format**. That is the whole positioning, and
it cuts both ways:

- The output loads in any Spine runtime, and it **imports into the Spine editor**.
  A compiled rig is a starting point on a timeline, not a finished shot — **an AI
  drafts, a human refines in the editor**. That hand-off is what emitting somebody
  else's format buys, and `tools/editor_roundtrip.ts` measures that it survives
  the trip in both directions.
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

📐 **What of Esoteric Software's is in this repository, and under what grant.** No
example asset is committed: `bun run fetch-examples` downloads the example projects
into a gitignored `examples/`. What *is* committed is `bench/reference/` — 1,293 PNG
frames **this project renders** from those examples' own exports, so a frame carries
those images' pixels and committing one **is** redistribution. Each example's own
`license.txt` permits exactly that, *"as long as they are accompanied by this license
file"*, and a verbatim copy of it sits at each example root here — all eight, written
there by the render script rather than left to memory. The same file's
**non-commercial** condition rides along with those images, and
[LICENSE](LICENSE) says so: rigc's MIT grant covers rigc's own code, documentation
and art, not this material. `7-anticipation` publishes no `license.txt` upstream, so
no such grant exists for it and its frames are never committed — they render only
into a gitignored directory, enforced by `git check-ignore`. Full reasoning:
[`bench/reference/README.md`](https://github.com/firejune/rigc/blob/main/bench/reference/README.md)
(repository material, not in the npm package).

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

One command is a repository workflow rather than a package one: `bench` measures
against Spine's official example projects — fetched, never committed — and against
reference frames this project renders from them, which **are** committed, each
example's own `license.txt` beside them under the redistribution grant those files
carry; the images stay **non-commercial only**. The reasoning is in
[`bench/reference/README.md`](https://github.com/firejune/rigc/blob/main/bench/reference/README.md)
and the terms in [NOTICE.md](NOTICE.md). It needs a clone and `bun run
fetch-examples`, and says so by name when the corpus is absent. `check` is not one
of them: it reads whatever frames you point it at, so it runs from the installed
package on pictures of your own — which is what *Where to go next* below tells you
to do with it, and it is the one instrument here that can see a wrong animation.

### Install it into your agent

The guides under [Documentation](#documentation) also ship as
[Agent Skills](https://agentskills.io) — `skills/<name>/SKILL.md`, in this
repository and in the npm package — which a host reads once they are where it
looks: Claude Code through the plugin below, Codex, Gemini CLI and Antigravity
through `rigc skills install`. Each skill is a router and nothing more: when to load it, the
non-negotiables in a line apiece, and a link to the guide that owns every rule, so
a rule keeps living in exactly one place. The repository is also a Claude Code
plugin marketplace:

```shell
/plugin marketplace add firejune/rigc
/plugin install rigc@rigc
```

With the package already installed, `claude --plugin-dir node_modules/spine-rigc`
loads the same skills without a marketplace. The plugin carries no version of its
own — `/plugin update` follows `main` commit by commit, and the only version on
disk stays the one in `package.json`.

Codex, Gemini CLI and Antigravity read skills from one directory in the workspace,
`.agents/skills/` ([Codex](https://learn.chatgpt.com/docs/build-skills),
[Gemini CLI](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/skills.md),
[Antigravity](https://antigravity.google/docs/skills/)), and none of them reads
`node_modules`. With the package installed, one command puts every skill there:

```shell
bun add -d spine-rigc
bun rigc skills install          # relative links: .agents/skills/rigc -> ../../node_modules/spine-rigc/skills/rigc
bun rigc skills install --copy   # the folders themselves, for a host that does not follow a link
```

Run it through the project's own install, as above: `bunx spine-rigc skills install`
in a project that has the package was measured running the registry's copy instead
of the project's. A link reaches every upgrade of the package with no second run,
and a second run has nothing to do; an entry already there that this command did not
make is refused by name and nothing is written. Gemini CLI 0.41.1 was measured
listing a linked skill from both its workspace and its user directory — the
workspace one only in a folder it trusts. Codex's documentation says it follows a
symlinked skill folder, which is not measured here, and Antigravity CLI 1.1.9 has no
way to list skills without starting a session, so what it does with a link is not
measured either; `--copy` is the shape that asks nothing of a host. Gemini CLI can
also fetch a skill itself, one folder at a time:
`gemini skills install https://github.com/firejune/rigc.git --path skills/rigc --scope workspace`.
The routers are named `rigc-rigging`, `rigc-motion`, `rigc-face` and `rigc-ingest`
because that directory is flat — beside another tool's `motion`, a bare name is
whichever one the host picked — and under the Claude Code plugin they read
`rigc:rigc-motion` and so on.

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

> 🚨 **`--skin <name>` if your rig has more than one.** With no `--skin` no skin
> is set at all, so every slot resolves through the **default** skin alone — and
> a slot whose art lives only in a named skin draws *nothing*. That is not a
> quirk of `render`: `check` compares `render`'s frames, so a multi-skin rig
> checked with no skin compares blank against blank and reports a perfect
> `0.0000` about art nobody drew. `render --skin` records the name in
> `frames.json`, `check --skin` poses the candidate under it, and a candidate
> scored against frames rendered under a *different* skin is refused by name
> rather than measured.

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
- 🧭 **No reference pictures, because the rig is your own?** Then make them:
  `rigc render` the first build you are happy with and keep those frames. Every
  later build is checked against them, and the first such check — the same build
  against frames of itself — is the floor the rest are read against, because
  `check` grades nothing and has no pass mark. It is the same instrument and the
  same commands; what changes is that the reference is a build of yours you have
  already looked at, so what it measures is **what your edit did**. Every drift
  the report prints carries the bound its own match gives it on the line under
  it, so a figure is read against that rather than against a number from a page;
  AUTHORING.md §9.2 says what the two halves of that bound are and why the floor
  is not zero.
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

<p align="center">
  <img src="https://raw.githubusercontent.com/firejune/rigc/main/assets/rigc-keypose.gif" alt="Two key poses read back by rigc pose, two candidate in-between motions compiled from them, and a rigc vote ballot picking one" width="600" />
</p>

<p align="center"><em>The whole loop on one character: two key poses are the given
conditions, <code>rigc pose</code> reads where every part sits in each picture, two
candidate in-betweenings are compiled from the same pair — and a real
<code>rigc vote</code> ballot picks the winner, because the movement between the poses
is the one thing no instrument here will grade.</em></p>

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
limits: [AUTHORING.md §11](docs/AUTHORING.md). The parts it refuses because
something is drawn over them are `rigc chainfit`'s, once a candidate exists —
[§12](docs/AUTHORING.md).

## The gallery — seven complete rigs over art that ships with them

Each directory in [`gallery/`](https://github.com/firejune/rigc/tree/main/gallery) is
one rig spec, one motion spec and the PNGs they name, small enough to read in one
sitting. Each stars a single feature, so *how do I do X* has a working answer rather
than a field table, and each README carries the frame rate it was authored at, what
was verified, and what writing it cost. Repository material: a clone and
`bun install` runs them.

| Example | Stars | What it is |
| --- | --- | --- |
| [`gallery/walk`](https://github.com/firejune/rigc/tree/main/gallery/walk) | `ik` constraints + **`ik` timelines** | Two two-bone leg chains solved to foot targets — the planted leg nailed down, the swinging one let go at the top of its lift |
| [`gallery/squash`](https://github.com/firejune/rigc/tree/main/gallery/squash) | **`deform` timelines** | A ball squashed about its contact point and stretched along its travel, from two affine transforms the keys state rather than tabulate |
| [`gallery/flex`](https://github.com/firejune/rigc/tree/main/gallery/flex) | **`contour` meshes** | A swallow-tailed banner and a serrated leaf: four meshes traced off their own alpha, waved by bone timelines and rippled by a `deform` |
| [`gallery/ride`](https://github.com/firejune/rigc/tree/main/gallery/ride) | `path` attachments + **path constraints** | A trolley coasting down a drawn rail and rolling back, driven by a `position` timeline, with `groups` + `stagger` keying the wheels and the ears |
| [`gallery/portrait`](https://github.com/firejune/rigc/tree/main/gallery/portrait) | **deform `transform`** + `derive` group tracks | A 2.5D head turn: two meshes and six feature bones all keyed from one stated expression, `dx = x(cos t − 1) − z·sin t`, with the depths in the spec rather than a README |
| [`gallery/nod`](https://github.com/firejune/rigc/tree/main/gallery/nod) | the **`pitch`** and **`wave`** transform kinds | A head bowing and two lop ears rippling, on three meshes each laid out for the closed form that moves it — a fold angle solved for before authoring, and a shear whose winding no amplitude can reverse |
| [`gallery/look`](https://github.com/firejune/rigc/tree/main/gallery/look) | **`slider` constraints** | A head that turns because a **value** says so: two dials drive two sliders, and the rendered animation moves the needles rather than the face — with a depth map under the face mesh, a soft mask on the cowlick, and a slider range derived from the turn ceiling `build` reports rather than picked by eye |

<p align="center">
  <img src="https://raw.githubusercontent.com/firejune/rigc/main/assets/rigc-scene.gif" alt="A portrait rig breathing, glancing aside, then turning its head in 2.5D — hair and features sliding at different depths" width="600" />
</p>

<p align="center"><em>The portrait rig playing its three animations in one take — the turn is
the shot: both silhouette edges move apart, which a flat slide cannot do, because every
feature carries its own depth. The rig guarantees the seams — <code>idle</code> loops
while <code>gaze</code> and <code>turn</code> return to rest, so the hand-offs meet at 0
differing pixels — and the composing is the consumer's. Authorable on plain Spine 4.3, no
plugin, no runtime patch; what the turn costs is authoring rather than runtime capability,
and that cost is one stated expression per key. Compiled and rendered entirely by the
published package.</em></p>

🎞️ **How the three films on this page were made** is kept with them, one directory per
film in [`films/`](https://github.com/firejune/rigc/tree/main/films) — a `run.sh` that
names every step, the assembler that cuts the shots and draws the type, and a README
saying what the film claims and which tool printed each figure on screen. Repository
material, like the gallery: a clone runs them.

## Commands

Every command takes its paths explicitly. `rigc <command> --help` prints its flags, and
[AUTHORING.md §0](docs/AUTHORING.md) is the same list with what each flag means, which
commands take it and what its default is.

| Command | Does |
| --- | --- |
| `build --rig … --motion … --out …` | compiles, gates, and **writes only if the gate is green**. `--images <dir>` says where the rig spec's `image` names resolve, `--manifest` adds measured art, and `--copy-images` copies every page PNG into `--out` so the directory is self-contained, with `skeleton.images` pointing at it so the editor's import finds the parts |
| `build … --pack` | the same build with every part arranged onto **shared** atlas pages, written into `--out` — losslessly, and gated a second time as the pair that ships. `--page-size` and `--padding` tune it |
| `build … --atlas-in <file.atlas>` | the same build with every part resolved to a **region of an existing pack** instead of a loose PNG; a name the atlas lacks, a size the spec disagrees with or a rectangle off its page is refused by name |
| `validate <dir>` | re-gates artifacts already on disk |
| `ingest <skeleton.json> --out <dir>` | `build` run backwards: reads a Spine 4.3 skeleton and writes the rig spec and motion spec that **rebuild it**, plus a findings report naming everything it could not carry. a skeleton that declares no stage is carried as declaring none, `--stage x,y,w,h` adds a box to one — and is refused, rather than ignored, beside one that declares a box — and `--images <dir>` writes the spec's own images directory — the opposite direction from `build --images`, which overrides it — so the rebuild carries no flag at all |
| `explain --rig … --motion …` | the compiled rig as a table — every bone with its resolved parent, the slots in draw order, every timeline key by key. Writes nothing. What to reach for when a rig compiles and still looks wrong |
| `render --candidate <dir>` | PNG frames plus a contact sheet, in `render/`. `--hide <slot,…>` or `--slot <slot,…>` draws part of the rig on the **same grid** as the whole, so the two frames overlay and the difference is the part; `frames.json` records the subset and `check` refuses such a set as a reference |
| `preview --candidate <dir>` | one self-contained `.html` that plays it |
| `vote --candidate a --candidate b` | one `.html` that asks a human which; `vote --record <file>` checks the answer into `votes.jsonl` |
| `pose --images <dir> --frame <png>` | reads part placements **out of** a picture |
| `chainfit --candidate <dir> --images <dir> --frame <png>` | reads the parts `pose` refuses, through the candidate's own draw order and hierarchy: masked residuals over **visible** pixels, one hinge per child instead of four degrees of freedom, and the `rotate` key value each answer implies. A bone with two or more anchored descendants is **determined** rather than searched, and the residual that over-determination leaves is reported |
| `diff <candidate.json> <reference.json>` | structural comparison of two skeletons, one ratio per measure and deliberately no combined score |
| `bonedist --candidate … --reference … --bones …` | per-frame, per-bone world-transform distance against another skeleton — the ladder's stage 3, run on its own. `--bones <correspondence.json \| identity>` is required rather than defaulted: a candidate is entitled to its own bone names, so the pairing is stated |
| `check --candidate <dir> --frames <dir> [--out <dir>]` | the candidate against reference pictures — the only instrument here that can see a *wrong animation*. `--out` also writes, for every frame the table lists, the picture its figures came from: reference, candidate, difference and overlay at native size |
| `bench <rung> --candidate <dir>` | one rung of the benchmark ladder |
| `skills install [--dir …] [--copy]` | links every agent skill the package ships into `.agents/skills` (or `--dir`) as relative symlinks, or copies them with `--copy` — where Codex, Gemini CLI and Antigravity look. A second run has nothing to do; an entry already there that is not this command's is refused by name and nothing is written |

`diff`, `bonedist`, `check` and `bench` measure against something you were given; the
first three work on any reference you have, and `bench` is a repository workflow that needs a clone
and `bun run fetch-examples`. The reasoning behind them is in
[the benchmark dossier](https://github.com/firejune/rigc/blob/main/docs/BENCHMARK.md).

`build` and `validate` both default to `--profile spine` — the 34 validity rules, which
ask *is this valid Spine 4.3 that any runtime plays correctly?* `--profile spine-html`
adds all 49: the other 15 are one renderer's policy and one canvas budget's, and they
fire on perfectly correct editor-produced Spine data, which is why they are opt-in.
⇒ **That reason is about foreign data and does not carry to a rig you are authoring
yourself: author under `--profile spine-html` and read the extra 15 as findings, and
gate the release under `--profile spine`.** A `deform` key that folds a mesh inside
out is written out under the default and refused by name under `spine-html`, which
is the shape of what that split buys you. A report always names
the profile it ran and lists what that profile left out.

Several cuts can also be registered in a `cuts.json` and built by name
(`build --cut my_cut --cuts path/to/cuts.json`); every path in that table resolves
relative to the `cuts.json` file itself, so the table lives with the project that owns
the art. Its shape is under
[Usage](https://github.com/firejune/rigc/blob/main/docs/BENCHMARK.md#usage).

### Starting from a skeleton you already have

`rigc ingest` reads a Spine 4.3 `skeleton.json` and writes the two spec files that
rebuild it. It is the only command that runs against `build`'s direction, and the
only one whose contract is an equality rather than a rulebook:

```bash
rigc ingest hero.json --out specs/ --images parts/
rigc build --rig specs/rig.json --motion specs/motion.json --out build/
rigc diff build/skeleton.json hero.json
```

`--images parts/` is what makes the second line carry no flag: it writes the spec's
own `images` directory, spelled from `--out`, so the specs are self-contained from
there on. Leave it off and the `image` names resolve against `specs/` itself, which
holds no art — every rebuild then has to repeat `build --images parts/`.

**`build(ingest(x))` is `x`.** Over the eleven rigs this repository builds — the seven
gallery examples, the three generated probes and a coverage probe written for the
purpose — the rebuilt `skeleton.json` is byte for byte the file the decompiler read.
The atlas is held to a weaker
claim on purpose, and the weakening is measured rather than assumed: it comes back
equal as a **multiset of region blocks**, because the order the pages are collected in
is in no field of the skeleton.

**And over twelve skeletons nobody here wrote.** Every editor export in the fetched
example corpus, ingested, rebuilt through the pack beside it and `diff`ed against the
source, comes back **12 of 12, no blockers, 1.000 on every measure the report
carries** — and each rebuild is its export's own text in canonical form, apart from
the header's `hash` and `spine`: the editor's project hash and the runtime version
rigc stamps, the two keys the rig spec has no field for by design (12 of 12).
[INGEST.md §2.3](docs/INGEST.md) states that pass line and why those two are the
exceptions.

**What it reads is skeleton JSON and nothing else** — no `.spine` project, no binary
`.skel`, no atlas, no art. So it never invents, and the things it cannot get out of
the file are **findings** with codes rather than plausible values: a construct the
spec format cannot hold (`point`, a `sequence` block, an unknown field
on a bone, slot or constraint) is a blocker, the command exits non-zero, and both
specs are still written — a spec plus a list of what is missing from it beats no spec.

⚠️ **Two values are not in a skeleton at all.**

- **The stage.** `skeleton.width`/`height`. A skeleton that declares none is carried as
  declaring none — the rig spec states `"width": null, "height": null` and the rebuild
  carries no box either, byte for byte — and `--stage x,y,w,h` is how a
  caller *adds* one, recorded as a judgement. It is not derivable — posing the rig gives
  the *animated* extent, which is a different number from the setup box. ⛔ **And `--stage` beside a box the file already states is refused
  too**, for the opposite reason: two sources for one value, where the file is the record
  of what was measured. **All twelve exports in the example corpus carry a stage** and
  none of them needs the flag. It is the value that costs least to get wrong, because
  `diff` reports the box and gates nothing on it.
- **An animation's duration.** The format has no such field. The largest key time is
  the only derivable answer and it is what a runtime plays to; it is wrong for an
  animation that holds its last pose past its last key, so it is recorded as a finding
  on every animation rather than chosen quietly.

Both specs carry a `note` that `ingest` writes itself, saying the file is decompiled
and naming the skeleton it came from — because a decompiled spec is indistinguishable
from an authored one by inspection, every gate here calls it green (it *is* green),
and no gate can catch a missing note.

[docs/INGEST.md](docs/INGEST.md) is the whole page on working from a file you were
handed; [docs/AUTHORING.md](docs/AUTHORING.md) §0.3 is the loop.

### The editor round trip — for a licence holder, never in CI

`tools/editor_roundtrip.ts` drives the loop the output's whole premise rests on:
build → **import into the Spine editor** → export back to JSON → gate, `diff`,
`render` and `check` the export against the build it came from.

```
bun cli.ts build --rig … --motion … --out build/ --copy-images
bun tools/editor_roundtrip.ts --build build/ --editor /Applications/Spine.app/Contents/MacOS/Spine
```

It prints the import and export exit codes, the validator's verdict on the
export, every `diff` measure that moved, `check`'s mean MAE and worst drift per
animation **for each skin the build and the export both declare** — one
render-and-check block per skin, with a per-skin roll-up under them, because a
rig's contested art lives in its named skins and a single un-skinned check draws
none of it; a skin only one side declares is a FAIL naming it as **lost** (or
**added**) **by the export**, with `diff`'s `attachments.skins` beside it, and is
rendered on neither side — and a
field-by-field list of what the editor rewrote. Every step quotes what its child
said when that child did not do what it was for, the renderers included; a skin
**neither** side can draw — a hit-box rig, say — is a **SKIP** naming that, not a
red, because `check` had nothing to compare and `diff` and `validate` have
already measured the rig. One side drawing where the other does not is the
divergence the trip exists to find and stays a failure. A human edit made in the
editor survives the trip back.

🔒 **It requires a licensed Spine editor on the machine, by construction**, and
drives only the [documented command line](https://esotericsoftware.com/spine-command-line-interface)
— never the UI, and it produces nothing the editor did not produce. With no
editor present it refuses by name and exits non-zero, and so does the **trial**:
the trial cannot save projects or export animation data, so the refusal names
what it found — the executable, the bundle, the `CFBundleName` that bundle
declares, or the banner the binary prints about itself — rather than starting it
and failing downstream. Both refusals point at `--exported <file>`, which
measures an export the editor already made and is the half of this tool that
needs no editor at all.

⛔ **Run the round trip by hand, on a machine that has the editor.** CI has no
editor, so no automated check runs it.

⚠️ Build with `--copy-images`. An ordinary build's atlas names its pages by a
relative path back to the art directory, and the round trip copies that atlas to
a directory at another depth — the tool refuses such a build by name rather than
letting `A17` blame the editor for the harness's own doing.

## Documentation

| Document | For |
| --- | --- |
| 📘 **[docs/AUTHORING.md](docs/AUTHORING.md)** | **the format guide, and the one to read before writing a spec.** Both input files field by field with a complete minimal example each, every field with its Spine meaning, the rules that decide what is emitted, the build → read the report → fix → repeat loop, the map from every named failure to the file that has to change, and the features rigc refuses by name so you do not spend a loop discovering them. It travels **inside the npm package**, at `node_modules/spine-rigc/docs/AUTHORING.md` |
| 🦴 **[docs/RIGGING.md](docs/RIGGING.md)** | **authoring the hierarchy.** Where a bone goes and why the art is pushed out on an offset, why a pivot in the wrong place looks like a search failure and what identifies one, moving a pivot and the child row that gets forgotten, gauges, siblings-not-a-chain, what a chain can reach and how many links it needs, why a local key is not a world key, duplicate art at mirrored pivots, and constraints as structure. Every section is a stumble the run records hold more than once, ranked by how often. Ships in the package too |
| 🎞️ **[docs/MOTION.md](docs/MOTION.md)** | **the key-pose recipe.** How to get two poses, what a pair of poses does and does not fix, the in-betweening rules and where each comes from, and how to spread candidates so a ballot informs. Ships in the package too |
| 🙂 **[docs/FACE.md](docs/FACE.md)** | **authoring a face.** A blink, a gaze and a 2.5D head turn on plain Spine data: the one line of yaw arithmetic every number in a turn comes from, depth as the parameter you are actually authoring, where to put a grid's columns and the angle at which any grid folds, what foreshortens and what does not, channel allocation before the first key, and the three cliffs with their angles. Also the deform audit gap, demonstrated — a folded mesh gates green — and the differential check that works today |
| 📥 **[docs/INGEST.md](docs/INGEST.md)** | **working with a skeleton you did not author.** What every command can and cannot do with a foreign `skeleton.json`, reading it with the toolchain, transcription as the route that makes it yours, what each validator complaint means on an export, and the re-pivot/rename/extend recipes. Ships in the package too |
| 🤖 **[docs/PROMPTING.md](docs/PROMPTING.md)** | **handing the authoring to an AI agent** — the prompt clauses a measured pilot run paid for, and what you can leave unsaid. Ships in the package too |
| 🔬 **[docs/SPEC_COVERAGE.md](docs/SPEC_COVERAGE.md)** | **the Spine 4.3 format, field by field.** Every key the 4.3 JSON parser and atlas reader take, what each defaults to, and the parser line it comes from — the rows rigc's refusals cite by part number. Ships in the package too |
| 🎓 **[the benchmark dossier](https://github.com/firejune/rigc/blob/main/docs/BENCHMARK.md)** | **why you can trust the output.** The yardstick, `diff` and `check` and what neither can see, the eight-rung ladder and the spineboy graduation exam, the run viewer, the 49 named assertions with their profiles, and the selftest that has watched every one of them fire. Repository material — it is not in the npm package |
| 📋 [LADDER.md](https://github.com/firejune/rigc/blob/main/docs/LADDER.md) · [GATE.md](https://github.com/firejune/rigc/blob/main/docs/GATE.md) · [PILOT.md](https://github.com/firejune/rigc/blob/main/docs/PILOT.md) | the live rung ledger, the clause statements a candidate is graded against, and how to run an agent through the ladder and score what comes back |
| 🔬 [SURVEY_2026-08-22.md](https://github.com/firejune/rigc/blob/main/docs/SURVEY_2026-08-22.md) | the survey the ladder was climbed by: rigc and the official examples as measured on 2026-08-22, and the gap list ordered by rung. A dated record, not kept current. Repository material |
| 🧬 [GENERATIONS.md](https://github.com/firejune/rigc/blob/main/docs/GENERATIONS.md) | **Spine data from another generation.** Why a 3.8–4.2 file read as 4.3 fails in silence, the policy that follows (detect from `skeleton.spine`, never guess, play on the matching runtime), what `A16` and `ingest` do with such a file, and the editor as the migration path. Repository material |
| 🗺️ [ROADMAP.md](https://github.com/firejune/rigc/blob/main/ROADMAP.md) | where this is going, and where it has been. What 1.0 had to mean before the number was claimed, and what it was claimed on — conditions rather than a feature list, because direction here comes from what users hit |
| 📐 [CLAUDE.md](https://github.com/firejune/rigc/blob/main/CLAUDE.md) | **the doctrine** — why the validator's messages are the product, why nothing reaches disk before green, why no number is ever invented, and what a change has to keep. [CONTRIBUTING.md](https://github.com/firejune/rigc/blob/main/CONTRIBUTING.md) calls it worth ten minutes before a first patch. Repository material |

## Why you can trust the output

rigc is measured against **Spine's own official example projects** — the
`1-weight-and-mass` … `8-follow-through` series as a difficulty ladder, with spineboy
as the graduation exam.

🎓 **The ladder is complete.** All eight numbered rungs and the
spineboy graduation exam are cleared and hold under the current gate, **v2.4**, every clause PASS or SKIP:
worst attributable slot drift **5.5550 px** against a 6.0 px bar — a **1.0801×**
margin, the thinnest of the ladder's **G2** figures, and **G5**'s 1.0376× is thinner
still — and **0 of 124** frame-change disagreements. Recompiling the same spec in a
different session reproduced every field of the measurement record **to the digit**.
The rungs stay in place as regression gates.

**Rung 7 clears on a read-down.** One of its three slots draws in every set and is
attributable in none; a read-down names the framing of its evidence, and a slot whose
attributability is **measured** to be capped below the bar reads down when everything
observable about it is independently verified strict. Every other rung and the
graduation exam pass on the clause itself. Recompiling a stored candidate reproduces its
record **to the digit within one gate**; across an instrument change the digits move,
and [docs/LADDER.md](https://github.com/firejune/rigc/blob/main/docs/LADDER.md) records
where. The standing figures quoted above are from its *gate-v2.4 re-inspection*, which
is the current sweep.

⚠️ **What that certifies, stated exactly.** That **the tool, the guide and the
protocol reach the bar across a bounded series of honest attempts, each residual
diagnosed and fixed** — spineboy took five, and the last inherited its
predecessor's specs under the run protocol's inheritance clause. It is **not**
that an agent authors a spineboy-scale rig from the brief alone in one run: the
ladder has not demonstrated that, and each row records which of the two it is.

🧪 **A separate series measures that harder question, and it has not been kind.**
From-zero attempts at spineboy — no inherited specs — have landed at **18.2, 18.8,
19.57, 7.86, 9.33 and 18.98 px** worst drift against the 6.0 px bar, a spread with no
monotone trend and every figure above the bar. They move no rung and reopen nothing —
a from-zero run is a tooling-progress measurement rather than a re-climb, which is
why the certification above is scoped to tool + guide + protocol. One of those
attempts states the residual in its own words: *"in motion it is not at editor
quality."* All six, with their verdicts, are in
[docs/LADDER.md](https://github.com/firejune/rigc/blob/main/docs/LADDER.md).

The whole dossier — the yardstick, `diff` and `check` and what neither of them can
see, every rung, the run viewer, the 49 assertions and the selftest behind them — is
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
