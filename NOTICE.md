# Third-party notices

## Spine Runtimes

This project depends on `@esotericsoftware/spine-core`, part of the
[Spine Runtimes](https://github.com/EsotericSoftware/spine-runtimes),
Copyright (c) 2013-2025 Esoteric Software LLC, licensed under the
[Spine Runtimes License Agreement](https://esotericsoftware.com/spine-runtimes-license).

Key obligation that propagates to users of this project: integration of the Spine
Runtimes into software (including via this compiler, which links spine-core to
validate what it emits) is permitted **provided that each user of the resulting
product obtains their own Spine Editor license**, and any redistribution includes
the Spine Runtimes license and copyright notice.

### What that means for rigc, as a chain of facts

rigc's own code is MIT (see `LICENSE`). The following is a restatement of Esoteric
Software's terms, not a licence term of this project:

1. rigc's output **is Spine skeleton data**.
2. Playing Spine skeleton data in a product requires **a Spine Runtime**.
3. The Spine Runtimes License requires **each user of such a product to own a Spine
   Editor license**.
4. rigc **links `spine-core`** itself — validation is not optional and cannot be
   switched off — so the same obligation applies to running rigc at all.

> **Using rigc, or shipping rigc's output in a product, requires a Spine Editor
> license.** rigc does not change that requirement in either direction: it neither
> creates one where none existed nor removes one that did. It is not a route around
> the editor licence.

### The Spine Web Player, and what `rigc preview` does with it

`rigc preview` writes an HTML file that plays a compiled rig in the **Spine Web
Player** (`@esotericsoftware/spine-player`), also part of the Spine Runtimes and
under the same licence as above.

⚖️ **It is referenced, never redistributed.** The generated page loads the player
from a CDN with a `<script src>` and a `<link rel="stylesheet">`; no byte of it is
committed to this repository, bundled into the published npm package, or copied
into the generated file. What the generated file *does* contain is the user's own
skeleton, atlas and page images, embedded as data URIs so the page opens without a
server — those are the user's, not Esoteric Software's.

Two consequences worth stating plainly:

- a generated preview needs a network connection the first time it is opened, and
  says so in the page when the player does not arrive;
- the obligation above is unchanged by it. Playing Spine skeleton data in the
  Spine Web Player is a Spine Runtimes integration like any other, so **each user
  of a product built this way needs their own Spine Editor license.**

## Example assets

The official Spine example projects are the yardstick this compiler is measured
against. They are owned by Esoteric Software. **The example projects themselves are
not committed to this repository**: `scripts/fetch-examples.sh` downloads them into a
gitignored `examples/` directory for local evaluation. What this repository *does*
commit is its own rendered frames of them, under the grant the examples' own licence
files carry — *Rendered reference frames*, below.

Each example directory upstream carries its own `license.txt`, so the terms are
per-directory rather than repository-wide. Verified on 2026-08-22 against
`spine-runtimes` branch `4.3`:

| Example               | `license.txt` | Copyright line                                  |
| --------------------- | ------------- | ----------------------------------------------- |
| `1-weight-and-mass`   | present       | (c) 2021-2025, Esoteric Software LLC            |
| `2-the-12-principles` | present       | (c) 2021-2025, Esoteric Software LLC            |
| `3-timing-and-spacing`| present       | (c) 2021-2025, Esoteric Software                |
| `4-wave-principle`    | present       | (c) 2021-2025, Esoteric Software LLC            |
| `5-squash-and-stretch`| present       | (c) 2021-2025, Esoteric Software                |
| `6-arcs`              | present       | (c) 2022-2025, Esoteric Software                |
| `7-anticipation`      | **absent**    | —                                               |
| `8-follow-through`    | present       | (c) 2024-2025, Esoteric Software                |
| `spineboy`            | present       | (c) 2013, Esoteric Software LLC                 |

Every `license.txt` above states the same two terms verbatim, differing only in
the copyright line:

> The images in this project may be redistributed as long as they are accompanied
> by this license file. The images may not be used for commercial use of any
> kind.
>
> The project file is released into the public domain. It may be used as the basis
> for derivative work.

So, for this repository's purposes:

- **Images** — redistributable only with the accompanying `license.txt`, and
  **non-commercial only**. That is why the example projects are fetched rather than
  committed, and why the rendered frames this repository *does* commit each carry a
  verbatim copy of that file beside them — *Rendered reference frames*, below.
- **Project files** (`.spine`, and the exports derived from them) — **public
  domain**, usable as the basis for derivative work. This is what makes the
  examples usable as a structural yardstick.
- ⚠️ **`7-anticipation` has no `license.txt` upstream**, so the redistribution
  grant its siblings carry does not exist for it — there is no licence file to
  accompany its images with. `scripts/fetch-examples.sh` prints a warning naming
  it. Treat its images as not redistributable.

### Rendered reference frames

`bench/reference/` contains **1,293 PNG frames rendered by this project** from the
examples' own exports: `bench/render_reference.ts` loads each example's `export/`
out of the gitignored `examples/`, poses it with `spine-core`, and rasterises each
posed attachment.

A rendered frame contains those images' pixels, so committing one **is**
redistribution — and each example's `license.txt` grants exactly that, *"as long as
they are accompanied by this license file"*. So **a verbatim copy of the relevant
`license.txt` sits at each example root** under `bench/reference/`, put there by
`render_reference.ts` rather than left to memory; all eight are present. The
**non-commercial** condition in that same file rides along with those images, and
`LICENSE` says so — rigc's MIT grant covers rigc's own code, documentation and art,
and does not extend to this material.

⚠️ **`7-anticipation` is excluded, and mechanically so.** With no upstream
`license.txt` there is no grant to rely on, so its frames are never committed:
`render_reference.ts` writes them only into a gitignored directory, refuses any
`--out` inside the repository that `git check-ignore` will not accept, fails closed
if git cannot answer, and drops a `LOCAL-ONLY.txt` beside them in place of the
licence file that does not exist.

`bench/reference/` is repository material — it is not in `package.json`'s `files`
list, so it is not part of the published npm package. The full reasoning, and the
per-rung framing behind it, is in
[`bench/reference/README.md`](https://github.com/firejune/rigc/blob/main/bench/reference/README.md).
