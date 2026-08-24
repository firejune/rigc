# The fitting harness

Committed because [`../LOOP.md`](../LOOP.md) and [`../README.md`](../README.md) cite
these by name, and a citation that resolves to nothing is worse than no citation.
Rungs 6 and 8 did not commit theirs and described the method instead; rung 2's second
attempt committed `sheetcheck.ts` and AUTHORING.md §9 now cites it, which is the
precedent followed here.

⚠️ **They were run from the repository root as `work/`**, so their relative imports
(`../src/render.ts`, `../tools/plate.ts`) are written for that location and do not
resolve from this directory. Copy the directory back to `work/` at the root to run
them. Nothing else in the repository imports them.

| file | what it is |
| --- | --- |
| `harness.ts`, `fit.ts` | renderer-in-the-loop: pose through `bone.pose` (§9.1), render into a window of `frames.json`'s own box, score against the frame there |
| `fitrun.ts` | the per-frame coarse-to-fine fit of §8.1 |
| `restart.ts` | multi-start, including the cross-shot arm starts — §8's *"more than one start"*, and the largest pose gain of the run |
| `settle.ts` | still runs and loop seams as **one** partition; the reference's own frame-to-frame change decides where the series may not move |
| `plan.ts`, `curves.ts` | the key reducer: one tolerance in pixels at the end of each bone's swing (§10.3), the easing table discovered then re-planned under (§10.4), holds keyed at both ends, and the paired translate timeline |
| `genmotion.ts`, `emit.ts`, `attachments.ts`, `rigspec.ts` | the rig and motion specs, emitted from the measured setup and the fitted placements |
| `orderdiff.ts`, `mkorder.ts` | the draw-order test, scored over the pixels where two builds actually differ |
| `edgereport.ts`, `probe-extent.ts` | per-frame drawn-box deltas against the reference — what the declared-box test reads |
| `refmae.ts` | reference-denominator MAE of a build over every committed frame; the like-for-like comparator between two of my own builds |
| `panel.ts` | reference / candidate / overlay, zoomed — how the two-chain minimum was actually seen |
| `placements-*.json` | the fitted pose per frame per shot: the run's own measurement of the reference frames, and the input the key reducer runs on |
