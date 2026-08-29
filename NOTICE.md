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
against. They are owned by Esoteric Software and are **not redistributed** in this
repository: `scripts/fetch-examples.sh` downloads them into a gitignored
`examples/` directory for local evaluation.

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
  **non-commercial only**. That is why they are fetched rather than committed.
- **Project files** (`.spine`, and the exports derived from them) — **public
  domain**, usable as the basis for derivative work. This is what makes the
  examples usable as a structural yardstick.
- ⚠️ **`7-anticipation` has no `license.txt` upstream**, so the redistribution
  grant its siblings carry does not exist for it — there is no licence file to
  accompany its images with. `scripts/fetch-examples.sh` prints a warning naming
  it. Treat its images as not redistributable.
