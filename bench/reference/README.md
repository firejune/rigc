# Reference renders

PNG frames of the official Spine example exports — what a rung's animation
**looks like**, and the only view of the reference an authoring agent is allowed.

## Why these exist

[docs/LADDER.md](../../docs/LADDER.md)'s honesty rule keeps the reference
`skeleton.json` away from the agent authoring a rung: an agent that has seen the
answer is being measured on transcription, and the resulting number would be
worthless in exactly the way that is hardest to notice afterwards.

Withholding *the shot itself* measures something else again — whether the agent can
guess. A human animator would be shown the animation. Frames are the honest middle:
they are what a client watching the finished shot could see, and they carry no bone
name, no key time, no curve handle and no timeline listing.

## How they are made

```bash
bun bench/render_reference.ts --rung 3 [--fps 12] [--max 256] [--tile 128] [--stride 1]
```

`--tile` sets the contact sheet's tile size and `--stride` writes only every Nth
frame — the sheet still shows all of them. The exact command each rung here was
rendered with is in the table below, and re-running it reproduces the directory
byte for byte.

[`bench/render_reference.ts`](../render_reference.ts) loads the example's own
`export/` — the skeleton JSON, its atlas and its atlas page — poses it with
`@esotericsoftware/spine-core`, and blits each posed region attachment with an
affine map. No browser and no GPU: for a region attachment a bone transform is a
plain affine map, and `tools/plate.ts` already reads and writes PNGs. Region
attachments only; a rung that ships meshes is refused by name rather than rendered
with something missing.

Per rung: `<example>/<animation>/f0000.png…` at a fixed frame rate, plus a
`contact.png` contact sheet of every frame in that animation, row major, each tile
labelled with its frame index. Every animation of one skeleton shares one viewport
— framing each to its own extent would rescale the motion between them, and the
relationship between two animations is the whole subject of some rungs.

Beside them sits one **`frames.json`** per skeleton: the world box the frames show,
the scale in pixels per unit, the background colour, and one entry per frame
directory with its rate, its frame count and its stride. Three things need it.

- An author measuring a distance in pixels can turn it into units without first
  finding something of a known size in the shot.
- `rigc check` reads the rate and the pixel grid from it, so a candidate is drawn
  onto the same grid as the reference rather than onto one it invented.
- A second render at another rate lands beside the first, and the sidecar records
  both. If a run's framing differs from the one already on disk — a different
  `--max`, say — the file is replaced outright and names the sets it dropped,
  because those frames are at a scale it can no longer describe.

⚠️ It deliberately does **not** list which frame indices are on disk. The directory
is the only author of that fact, and a second copy of it could only ever be the
stale one.

A **static rig** — a skeleton with no animation at all, which rung 1's second
export is — writes its setup pose as one frame in a directory called `setup/`.
Anything that renders to a single frame gets no contact sheet: a sheet of one tile
is that frame again, with a border and a `0` on it.

## What is here

12 fps is the protocol every brief is written against. A second rate lands beside
the first under `<animation>@<fps>fps/`, and where the whole second set was not
worth its weight only its contact sheet is kept — the sheets are far cheaper per
frame than separate files, because one file lets deflate find the static set again
in the next tile.

| Rung | Example | Animations | Rendered with | Frame size | On disk |
| --- | --- | --- | --- | --- | --- |
| 3 | `3-timing-and-spacing` | `heavy` 65, `light` 21 | `--fps 12` | 256×116 | 465 KB |
| 1 | `1-weight-and-mass` | `balls/animation` 40, `drop/ready-to-animate` 1 | `--fps 12`, then `--fps 24` | 256×239 / 256×191 | 1.6 MB |
| 2 | `2-the-12-principles` | 4 × 311 | `--fps 12 --stride 999 --tile 64` | 256×228 | 1.4 MB |
| 4 | `4-wave-principle` | `ball-catch` 121, `wave-by-hand` 17, `wave-offset` 17 | `--fps 12 --max 768 --tile 256`, then the same at `--fps 24 --stride 999` | 768×634 | 1.4 MB |
| 5 | `5-squash-and-stretch` | `ball` 79, `speedy` 79, `ball-ready-to-animate` 1 | `--fps 12 --max 192`, then `--fps 24 --stride 999 --tile 96` | 192×124 | 2.8 MB |

Three of those settings are not defaults, and each is a trade worth knowing:

- **rung 2 keeps only the sheets.** 1,244 frames of a static obstacle course is
  over sixty megabytes as separate files and about a seventeenth of that as four
  contact sheets. The sheets hold every frame; `--stride 999` keeps the first and
  last of each animation at full size for detail.
- **rung 4 is rendered large.** Its three animations share one viewport (they must
  — see above) and one of them throws a ball right across it, so the subject sits
  in an eighth of the frame. 768 px is what makes that eighth legible; the sheet
  tile is raised to match.
- **rung 5 is rendered small.** Its set is wide and its subject is a 23-unit ball,
  so at any size that fits a byte budget the ball is a few pixels. 192 px keeps the
  whole rung under three megabytes and still resolves the ball's proportions, which
  is what that rung is about.

A rung with more than one skeleton nests them: `1-weight-and-mass/balls/…` and
`1-weight-and-mass/drop/…`. They are two shots that share an atlas, they are framed
independently, and pooling their frames in one directory would suggest otherwise.

## Licence — read before adding a rung

The examples are Esoteric Software's. Their `license.txt` releases the **project
file and its exports into the public domain**, but the **images** are granted only
under two conditions: redistribution "as long as they are accompanied by this
license file", and **no commercial use of any kind**.

A rendered frame contains those images' pixels, so committing one *is*
redistribution. That is why each rung directory here carries a verbatim copy of its
example's own `license.txt`, and why `render_reference.ts` copies it rather than
leaving it to somebody's memory.

🚫 **`7-anticipation` ships no `license.txt` upstream at all**, so the grant its
siblings carry does not exist for it. Its frames must never be rendered here,
committed, published or shipped. `render_reference.ts` refuses that rung by name.

See [NOTICE.md](../../NOTICE.md) for the per-example table and
[docs/LADDER.md](../../docs/LADDER.md) §*Licence, per rung*.
