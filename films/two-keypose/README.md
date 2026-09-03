# Film two — the key-pose loop

The film: [`assets/rigc-keypose.gif`](../../assets/rigc-keypose.gif), 234 frames,
600x405, 5 cs per frame (= 20 fps, 11.70 s), 3.14 MiB. It is the one in the README's
*See what you built, and let someone choose* section.

**The whole authoring loop on one character.** Two key poses are the given conditions;
`rigc pose` reads back where every part sits in each picture; two candidate
in-betweenings are compiled from the same pair; and a real `rigc vote` ballot picks the
winner — because the movement *between* the poses is the one thing nothing in this
toolchain will grade.

The character is not authored here. `art/parts/`, `art/layout.ts`, `spec/skeleton.ts`
and `spec/rigby.rig.json` are film one's, unchanged; the poses and the three motion
specs are the only new authoring.

## What it shows, shot by shot

Five shots, and the command under each is the one that actually produced the frames
above it — `gif/assemble_gif.ts`'s `CMD1`…`CMD5`:

| Shot | Frames | Shows | The band's command |
| --- | --- | --- | --- |
| 1 · two pictures | 30 | `poseA.png` and `poseB.png` side by side, and a `?` where the in-between is not | `rigc pose --images parts --frame poseA.png    (and poseB.png)` |
| 2 · the instrument | 32 | `rigc pose`'s report on pose B, quoted from `pose/poseB.log` | `rigc pose --images parts --frame poseB.png --scale 0.88,1.0` |
| 3 · two interpretations | 72 | candidate A and candidate B playing the same two givens differently | `rigc build --motion cheer-a.motion.json  ·  --motion cheer-b.motion.json` |
| 4 · the choice | 32 | a photograph of the real ballot page, with the ledger's own winner line under it | `rigc vote --candidate build-cheer-a --candidate build-cheer-b` |
| 5 · the winner | 49 | candidate B full size | `rigc render --candidate build-cheer-b --fps 20` |

Its own count line, from the run recorded below:

```
shots: pictures 30 + instrument 32 + candidates 72 + choice 32 + winner 49 = 215 (10.75s)
+ 4x3 shot dissolves + 7 loop dissolve = 234 frames (11.70s)
```

## The honesty stance

- **Everything on screen is compiled output or a photograph of a real page.** The figure
  is `rigc render`'s PNGs, cropped and downsampled once. Shot 4's ballot is a Playwright
  screenshot of `vote/ballot.html` — not a mock-up of one.
- **Every number on screen was printed first by a tool.** Shot 2's report is read out of
  `pose/poseB.log`; shot 4's winner line is read out of the `rigc vote --record` run in
  `vote/record.log`. Nothing is retyped from either.
- **The vote is a real vote.** `vote/drive.mjs` clicks the page's own controls and takes
  the JSON the page hands a person afterwards; `rigc vote --record` then checks that JSON
  against the ballot's embedded manifest, so a forged result is refused by name. `V00`
  through `V06` all have to pass for step 8 to complete.
- **The pointer and the highlight in shot 4 are drawn at coordinates the page reported.**
  `drive.mjs` measures the choice buttons in the screenshot's own device pixels and writes
  `vote/ballot-winner-row.boxes.json`; the assembler reads that. And the row is
  photographed **twice**, before and after the click, so the button is unpressed while the
  pointer is still arriving.
- **What the film does not claim.** It does not grade the movement, and says so on
  screen. `spec/check_pose_reading.ts` verifies that `rigc pose` *read the picture* (FK
  from the pose spec against what `pose` measured) and `spec/check_candidates_differ.ts`
  verifies that the two candidates differ in interpretation while agreeing on both given
  poses. Neither is a score, and no instrument here produces one.
- **The crop is film one's arithmetic, and that transfer is checked.**
  `spec/check_framing.ts` verifies all three builds come out on the same viewport as each
  other and as film one's, which is what makes one crop fit every shot.

## Running it

```sh
cd films/two-keypose
./run.sh
```

Prereqs are in `run.sh`'s own header: bun, ImageMagick 7 (`magick`), node with
playwright-core reachable, a network for the ballot's Spine Web Player, and the
Andale-Mono font. Step 0b takes film one's four shared inputs from `../one-assembly`, so
that directory has to be present — it is, in this repository. Everything a run produces
is covered by the repository `.gitignore` (see its `films/two-keypose` block). The
finished GIF lands here as `rigc-keypose.gif`; the one that ships is
`assets/rigc-keypose.gif`, and this README's numbers are that file's.

**playwright-core** is not a dependency of this repository. Either
`bun add playwright-core` in this directory, or point `PLAYWRIGHT_CORE` at an existing
install (its entry file or its package directory, absolute path). Without a network, the
ballot step needs a local copy of the official Spine Web Player named by
`SPINE_PLAYER_JS`; that player is Esoteric Software's and is not in this repository — see
[NOTICE.md](../../NOTICE.md).

## Preserved verbatim, and adapted

Preserved byte for byte: `spec/make_specs.ts`, `spec/poses.ts`, `spec/tune_poseb.ts`,
`spec/check_framing.ts`, `spec/check_face_clear.ts`, `spec/check_pose_reading.ts`,
`spec/check_candidates_differ.ts`, `gif/assemble_gif.ts`, `package.json`,
`tsconfig.json`. Every one of those already addressed its files through
`new URL('…', import.meta.url)`, so **no path inside any of them needed changing.**

Two files were adapted:

| File | Adapted | Why |
| --- | --- | --- |
| `run.sh` | gained a step `0b` that copies film one's `art/layout.ts` and `art/parts/`, and its `spec/skeleton.ts` and `spec/rigby.rig.json`, from `../one-assembly` | In the scratchpad those four had simply been copied in beside this film's own files. Taking them from film one keeps the art referenced rather than duplicated into `films/`. Two of the four are film one's steps 1–2 *output*, so `0b` runs those two steps to make them; neither needs film one's `bun add`. Nothing else in `run.sh` changed — the version pin, the nine step comments and their arguments are as run. |
| `vote/drive.mjs` | its two absolute paths are now resolved | As run it imported playwright-core by absolute path out of another project's `node_modules`, and named a Spine Web Player copy by absolute path in the session scratchpad. Neither survives being moved. Both now come from an environment variable if one is set, else node's own resolution; the file's own header note about the offline fallback was updated to point at the variable instead of the old location. Everything else in it — every measurement, every screenshot, every assertion — is unchanged. |

## What re-ran, and what did not

**All nine steps re-ran end-to-end from this directory.** The result is not
byte-identical to the shipped GIF, and it is not supposed to be: shot 4 photographs a
live page. Precisely what matched and what did not, measured rather than asserted:

- **Frame count and canvas match:** 234 frames, 600x405, 5 cs — the sanity line.
- **196 of the 234 frames are pixel-identical to `assets/rigc-keypose.gif`** (both GIFs
  coalesced, compared frame by frame on ImageMagick's absolute-error metric). The 38 that
  differ are frames 140–177, which is exactly shot 4 plus its two 3-frame dissolves.
  Nothing outside the ballot shot moved. Total 75,483 differing pixels over the whole
  film, worst single frame 20,870 of 243,000 (frame 176, mid-dissolve out of shot 4).
- **Everything upstream of the ballot is reproduced exactly:** all three motion specs
  (`poses`, `cheer-a`, `cheer-b`), all three `build-*/skeleton.json`, and all four
  `rigc pose` reports and their logs — the pose JSON and logs differ only in the absolute
  paths they echo back, and are identical once those are normalised. So shot 2's quoted
  numbers reproduce.
- **Both gates and both checks came back green:** `check_framing`, `check_face_clear`,
  `check_pose_reading`, and `check_candidates_differ` (0 of 1,174,176 pixels differ at
  given pose A; 2 at pose B; candidates diverge 23.46% at peak against a 12.39% mean
  frame step).
- **The ballot ran for real:** a fresh page, a real click through its DOM, `PRESSED
  A=false B=true tie=false`, no console errors, and `rigc vote --record` passing
  `V00`–`V06` and appending line 1 to the ledger.

**The ballot digest is not reproducible, by construction.** The ballot id and the two
candidate digests differ from the shipped film's (`db86cca1f5fc6bb2` then,
`9a9534ee94df8331` on this run) because a ballot embeds the part PNGs, and those carry
the `tIME` chunk `rsvg-convert` writes — so a fresh `art/parts/` produces fresh digests
even though its pixels are identical. Shot 4's winner line therefore reads differently
between runs. That is the film's design working as intended (*the winner is a digest, not
a label*), not a defect, but it does mean this shot cannot be reproduced byte for byte.

**Not re-verified.** Nothing. Every step ran, including the optional `rigc preview` at
the end.
