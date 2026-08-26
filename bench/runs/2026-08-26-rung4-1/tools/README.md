# The instruments this run built

Every file here reads **only** the rendered reference frames, the contact sheets,
`frames.json` and the art. None of them opens a reference skeleton.

Kept because the numbers in [`../LOOP.md`](../LOOP.md) came out of them, and because
the next attempt at a serial figure should not have to rebuild the same three
things. The order below is the order the loop runs them in.

| file | what it does |
| --- | --- |
| `fitlib.ts` | the shared machinery: `frames.json`'s declared box, reference frames and contact-sheet tiles as comparable buffers, a scratch canvas that scores a candidate render against one of them in time proportional to what it drew, and `pose()` — the knob vector applied to a real `Skeleton` |
| `seed.ts` | partial observations off a frame's own pixels: the saucer's under-band (centroid + axis, both signs), the chain's beads, the ball, and the whole rig's ink centroid as the fallback that always exists |
| `fitrun.ts` | the pose search per frame — coarse to fine, full-range scans, multi-start, forward/backward passes, and the bounds that keep a chain from folding back on itself |
| `globals.ts` | the eleven setup numbers, swept against a spread of frames drawn from every shot at once |
| `bake.ts` | writes the swept setup geometry back into the rig spec, so what ships always comes out of `build` |
| `rescue.ts` | exhaustive restart for a 12 fps frame the tracked search cannot leave: the product of the saucer's rotation and the chain's first joint |
| `half.ts` | the 24 fps series — a Catmull-Rom prior through the 12 fps neighbours, then fitted against that sample's own sheet tile |
| `rescue-half.ts` | `rescue.ts` for a sheet tile, at the tile's own scale |
| `plan.ts` | keys and easings: forced indices, greedy spans, and the linear least-squares that fits a span's two handle Y values |
| `emit.ts` | the tolerance, converted per bone by its lever arm, and the series tidying that precedes planning |
| `motion.ts` | §10.4's two passes over the easing table, then the rig and motion specs |
| `crop.ts`, `show.ts`, `tile.ts` | looking: a zoomed crop, a frame as reference \| candidate \| overlay, and the same for one sheet tile |
| `art.ts`, `bbox.ts`, `beads.ts`, `measure.ts` | the first measurements, before there was anything to render: art sizes, bead centroids, content boxes |
| `report.ts` | the stored fit's per-frame residual, as a fraction of each frame's own ink cost |
