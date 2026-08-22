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
bun bench/render_reference.ts --rung 3 [--fps 12] [--max 256]
```

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

## What is here

| Rung | Example | Frames | Rate | Frame size |
| --- | --- | --- | --- | --- |
| 3 | `3-timing-and-spacing` | `heavy` 65, `light` 21 | 12 fps | 256×116 |

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
