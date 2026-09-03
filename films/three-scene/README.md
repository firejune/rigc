# Film three — scene direction

The film: [`assets/rigc-scene.gif`](../../assets/rigc-scene.gif), 198 frames, 600x405,
4 cs per frame (= 25 fps, 7.92 s), 3.11 MiB. It is the one in the README's gallery
section.

**One continuous take.** Vela at rest and breathing, then her gaze aside, then the 2.5D
head turn — nothing cut between them, and no dissolve anywhere in the figure. That is a
property of the rig rather than of the assembler: `idle` loops, `gaze` and `turn` are
one-shots that return to rest, so `idle`'s last frame, `gaze`'s first, `gaze`'s last and
`turn`'s first are the same pose. Step 7 measures exactly that and gets 0 differing
pixels at the hand-offs. Only the type cross-fades.

## What it shows, beat by beat

The beat table is `gif/assemble_gif.ts`'s own output, not a restatement — this is the
block it printed on the run recorded below:

```
    0..  9   10 frames  0.40s  rest + build
   10.. 88   79 frames  3.16s  idle
   89..126   38 frames  1.52s  gaze
  127..131    5 frames  0.20s  turn 25fps
  132..162   31 frames  1.24s  turn 50fps (half speed)
  163..197   35 frames  1.40s  turn 25fps (hold + release)
  total       198 frames  7.92s at 25 fps
```

The type column names, under each beat, the command that produced the frames beside it.

## The honesty stance

- **Everything on screen is compiled output.** No frame is drawn, retouched or posed by
  hand; the figure is `rigc render`'s PNGs, cropped and downsampled once.
- **Every caption figure is quoted from tool output, not typed.** The column's
  "22 parts · 27 bones · 22 slots" is lifted from `build`'s summary line in `build.log`;
  the shot list's durations are `explain`'s `declared=` values; the turn's five parallax
  rows are the bytes of `explain`'s own MEMBER rows in `explain.log`. Both logs are
  written by the run and read back by the assembler — which is why step 6 cannot be run
  without steps 1 and 2 having run first.
- **The film's claims are measured off the encoded file, not off the plan.** Step 7
  (`gif/verify_gif.ts`) coalesces the delivered GIF and measures the hand-offs, the half
  speed, the silhouette's two edges and the loop seam in final pixels.
- **Nothing here authors movement and nothing here draws Vela.** `portrait-src/` is
  `gallery/portrait` — rig, motion and the 22 part PNGs, unchanged. The film's only
  authoring is its own layout and type.
- **The compiler is the published package, not this repository.** `run.sh` step 0 is
  `bun add spine-rigc@…`, so the film advertises what a user gets from npm. `bunx rigc`
  therefore resolves to `films/three-scene/node_modules/`, never to `../../cli.ts`.

## Running it

```sh
cd films/three-scene
./run.sh
```

Prereqs are in `run.sh`'s own header: bun, ImageMagick 7 (`magick`), and the Andale-Mono
font. It writes into this directory and leaves the tree clean — everything a run produces
is covered by the repository `.gitignore` (see its `films/three-scene` block for the
list). The finished GIF lands here as `rigc-scene.gif`; the one that ships is
`assets/rigc-scene.gif`, and this README's numbers are that file's.

## Preserved verbatim, and adapted

Preserved from the session that made the film, byte for byte: `run.sh` (except the two
blocks noted below), `gif/assemble_gif.ts`, `gif/layout.ts`, `gif/measure_ink.ts`,
`gif/verify_gif.ts`, `package.json`, `tsconfig.json`. Every script already addressed its
files through `new URL('../', import.meta.url)`, so **no path inside any script needed
changing.**

Three adaptations, all in `run.sh`, all in the step `0b` block it now carries:

| Adapted | Why |
| --- | --- |
| `portrait-src/` is copied from `../../gallery/portrait` at the start of every run | In the scratchpad it was a copy somebody had already made. Copying it from the example it is a copy *of* keeps the art referenced rather than duplicated into `films/`, and makes the header's "unchanged, byte for byte" a fact each run re-establishes. The two were verified byte-identical when this landed. |
| `mkdir -p probe` | Step 5's `tee probe/inkbbox.log` opens its log at pipeline start, before `measure_ink.ts` can create the directory. In the scratchpad `probe/` already existed from earlier work, so the ordering never showed. |
| nothing else | the version pin in step 0 is left at what the run used — see below |

## What re-ran, and what did not

**Step 0 through step 8 re-ran end-to-end from this directory, and reproduced the
shipped GIF byte for byte.** `sha256` of `films/three-scene/rigc-scene.gif` after the
run equals `sha256` of `assets/rigc-scene.gif`
(`67b40fd9bf786346aed332987aa89cdc8a528df0b31daee128e234b01f35542c`), `build/skeleton.json`
is identical to the one the film was cut from, and `verify.log` came back with the same
figures line for line. That is a stronger result than frame-count-and-dimensions, which
was the bar.

**Version.** `run.sh` still pins `spine-rigc@0.14.0`, which is what made the shipped
GIF; the pin is left alone because it is the record. The film was also re-run at
`0.14.1` — the version published since — from the same directory, with only that pin
changed, and **the output does not differ at all**: same `skeleton.json`, same
`skeleton.atlas`, the same GIF sha256 as above, and a `verify.log` identical line for
line. So either published version cuts this film.

**Not re-verified.** The trailer at the bottom of `run.sh` lists nine probe logs kept
beside the film as evidence for claims in issue [#324](https://github.com/firejune/rigc/issues/324)'s
landing comment. Only one of them, `probe/inkbbox.log`, is produced by a step in
`run.sh`; the other eight came from ad-hoc commands during the film's making and there
is no script here that regenerates them. Their conclusions are in the issues the trailer
names — [#336](https://github.com/firejune/rigc/issues/336) (the loop seam against
`--max`) and [#337](https://github.com/firejune/rigc/issues/337) (the last frame's time
against the declared duration) — which is where they are durable. The trailer is kept as
written so the list of what was measured is not lost.
