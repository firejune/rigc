# Rung 7 — attempt 3, the loop

- date:      2026-09-02
- agent:     Claude Opus 5 (1M context), Claude Code / Agent SDK
- brief:     `bench/briefs/7-anticipation.md` **revision 3**, 2026-08-28 (third-party verified)
- inputs:    brief; `bench/reference-local/7-anticipation/` (rendered here, see §1);
             `examples/7-anticipation/images/`; `docs/AUTHORING.md`; `docs/MOTION.md`;
             `docs/GATE.md`; `bench/runs/README.md`; this repository's `src/`
- inherited: **yes** — the rig spec and motion spec of `bench/runs/2026-08-28-rung7-2/`,
             under item 10 of *What a run may read* (owner ruling 2026-08-28). See §1.
- reference: **not read** — no `examples/*/export/*.json`, no transcription, no
             `docs/LADDER.md` status table / per-rung section / *Operating rules*, no
             `docs/SPEC_COVERAGE.md`, no `src/ladder.ts` gate strings, no issue bodies,
             no git history. `bench` will be run once, at the end.
- guide:     AUTHORING.md §10 in hand; GATE.md (clause statements) in hand
- profile:   spine
- atlas:     not used as an input — rigc emits its own one-part-per-page atlas from the
             loose PNGs (`--images`). The example's own `.atlas` is opened only as
             `--texture-from` at the end, to decompose the MAE into texture floor and
             above-floor as the runs README's rung-7 row directs.

## 1 — the ground rules this run worked under

**The frames.** Rendered locally with the brief's exact commands, flag for flag:

```
bun run fetch-examples
bun bench/render_reference.ts --rung 7 --max 1024 --tile 256
bun bench/render_reference.ts --rung 7 --max 1024 --tile 256 --fps 24 --stride 999
bun bench/render_reference.ts --rung 7 --max 1024 --tile 256 --fps 30 --stride 999
```

102 frames at 12 fps across four shots, plus two-frame 24 fps and 30 fps sets with
contact sheets: **12 frame sets.** `git ls-files bench/reference-local` reports **0**
and was checked before every commit. No frame, crop, sheet or derived picture of the
reference is committed; the two viewers this run wrote (`tools/crop.ts`,
`tools/compare.ts`) refuse a destination inside the repository, by path check, and
wrote to a scratch directory outside it.

**What was inherited, and what was not.** Under item 10 of *What a run may read*:
inherited `sack.rig.json` and `sack.motion.json` from `2026-08-28-rung7-2`. That run
also stores `README.md`, `LOOP.md`, `bench.json`, `check-atlas.txt` and
`check-declared-box.txt`; **none of those was opened.** They are the sealed half —
they record what the prior attempt *scored*, and item 10 draws its line at the file.
That run has no `tools/`, so no harness was inherited; the harness in `tools/` here is
this run's own.

⚠️ **One deliberate refusal of something the launch prompt offered.** The prompt
pointed at "attempt 2's cape passage evidence" as part of the map. That evidence lives
in `2026-08-28-rung7-2/LOOP.md` and `README.md`, which item 9 of the reading list
excludes for *the rung being authored* and item 10 lists among the files that stay
sealed. `bench/runs/README.md` says to obey it over the prompt, so those two files were
not opened, and the cape's mechanism was re-derived here from the frames, the art and
the brief. Everything in §3 below is measured in this run.

**Stage 0 is mandatory for an inherited attempt** and is in
`check-baseline-inherited/`: the inherited specs recompiled **unchanged**, `check`ed
against the frames, full output stored (`check.txt`, `check-all-frames.txt`,
`check.json`). Nothing was edited before it was taken.

## Loop

### 1 — build (stage 0, inherited specs unchanged)

```
bun cli.ts build --rig bench/runs/2026-09-02-rung7-3/sack.rig.json \
  --motion bench/runs/2026-09-02-rung7-3/sack.motion.json \
  --images examples/7-anticipation/images \
  --out bench/runs/2026-09-02-rung7-3/spine --profile spine
```

Green first time: `pages=3 regions=3 bones=8 slots=3 animations=4 version=4.3.13
regionAttachments=2 meshAttachments=1 physicsConstraints=0`. `validate --profile spine`
reports **0 FAIL**. So the inherited spec compiles and validates as received — no
repair needed to get a candidate on the table.

### 2 — check (stage 0 baseline, stored)

```
bun cli.ts check --candidate .../spine --frames bench/reference-local/7-anticipation
```

The author's reading of the baseline, clause by clause (mine, not a verdict):

| clause | baseline reading |
| --- | --- |
| G1 | 0 FAIL |
| G2, 6.0 px limb | worst attributable slot drift **3.9 px** (`sack`, `cape-follow-example/f0022`), over 12 sets |
| G2, 🕳️ set limb | **`hello@24fps` and `hello@30fps` attribute no slot in any frame** — `framesWithoutDrift` = the frame count on both |
| G2, per-slot limb | **`cape-back` blank in all 12 sets**; **`sack` blank in 4** (`hello@24fps`, `hello@30fps`, `walk@24fps`, `walk@30fps`); **`cape-front` blank in 2** (`hello@24fps`, `hello@30fps`) |
| G3 | 0 `changeDisagreements` in all four multi-frame sets; no `⚠️ overdraw` (worst `drawnRatio` 0.990) |
| G7 | worst tile ÷ sheet mean: 2.57, 2.50, 3.11, **3.23**, 1.80, 1.75, 1.58, 1.50 — the 3.23 is `fall-in@30fps` |

So the failing surface is wider than one slot: three of the three drawn slots are blank
somewhere, and two whole sets read nothing at all. §3 is why `cape-back`'s is different
in kind from the other two.

### 3 — measure, before editing: what a template match on this shot can and cannot do

`check` attributes a slot two ways (`src/slots.ts`). The component pass is dead on this
rung by construction — the subject is **one** connected component on every one of the
102 frames (the brief states it; the baseline's frame table confirms it set by set), so
every slot falls through to the **template** pass, which correlates the slot's own
rendered pixels against the frame inside a search radius and reports an offset only if

- `best residual <= contrast x 0.5`, and
- `confidence = 1 - best/rival >= 0.15 + 0.45 x (offset / radius)`.

`tools/probe-slot.ts` (this run's own; it calls the same `matchSlots`) adds the one
quantity `check` does not print: **what the frame shows underneath exactly the pixels
the slot draws**, split by the brief's own classes (drawn at 8/255, cape ⇔ `g - b <= 8`,
raw masks). That turns the pass/fail into a curve. Calibrating it on the slot that
*does* pass — `cape-front` in `walk`:

| `walk` frame | `cape-front` agreement (frame is crimson under its own pixels) | verdict |
| --- | --- | --- |
| f0000–f0002 | 0–1 % | no match (confidence 0.02–0.04) |
| f0003–f0008 | 77–84 % | **attributable**, drift 0.16–1.24 px |

⇒ on this shot the matcher needs roughly **75 % agreement** on a slot's own pixels.
`sack` sits at 83–91 % and passes only intermittently (its residual is small, 12.7–23
against 115 of contrast, but a large smooth beige blob on a large smooth beige blob has
almost no correlation peak: confidence 0.04–0.16 against a 0.15–0.19 bar).

`cape-back`'s baseline agreement is **8–45 %**, worst-to-best over the 102 frames, so
it fails everywhere. The question that decides this whole run is whether that is a
fitting error or a ceiling.

⚠️ **The first instrument aimed at that question was the wrong one and is kept in
`tools/exposed-crimson.ts` as the record.** It counted crimson within N pixels of the
figure's outline, on the theory that a part drawn behind shows only at the edges. That is
false where the exposed cape is a solid lobe rather than a rim — `hello/f0034` reads 19 %
by that measure and is the most exposed frame in the corpus — so it under-counts exactly
the frames that matter. Superseded by the reachability test below, which asks the actual
question: is this crimson pixel one the sack is in front of?

**It is a ceiling, and here is the measurement.** `tools/panel-ceiling.ts` computes, per
frame, the crimson that is reachable from the frame border through
{backdrop, crimson} without crossing beige — i.e. the crimson the sack is **not** in
front of, which is the only crimson a part drawn *behind* the sack can put on screen —
and divides it by the area of the smallest oriented rectangle that covers it, since one
region attachment draws a filled parallelogram and can be rotated and scaled per axis
but not bent. Conventions as above; reachability 4-connected, which under-counts the
numerator; raw masks, because denoising only shrinks thin features and would lower the
ceiling further.

| shot | outer crimson, over its frames | ceiling on any filled attachment's agreement |
| --- | --- | --- |
| `cape-follow-example` | 782 – 3,022 px | **5 – 17 %** |
| `fall-in` | 1,811 – 2,907 px | **9 – 17 %** |
| `hello` | 951 – 3,193 px | **7 – 16 %** |
| `walk` | 788 – 1,781 px | **5 – 15 %** |
| the two-frame sets | — | 6 – **19 %** (`hello@24fps/f0069`, the corpus maximum) |

The reason is visible in one picture and is a fact about the shot rather than about any
rig: **`hidden` is 0 or single digits on every one of the 102 frames** — essentially all
the crimson in the corpus is on the *outside* of the figure. At the rest pose the cape's
rear panel shows as two thin vertical strips down the sack's flanks with 90 px of beige
between them, so the smallest quad covering the visible crimson is 98 x 154 px — the
whole figure — of which 1,846 px are crimson. A cape whose visible part is a rim around
a solid body is ~88 % occluded by construction, and the template matcher scores a slot
over the pixels it *draws*, occluded ones included (`src/render.ts`, `frameGeometry`:
"a slot hidden behind another still has a position").

⇒ **No placement, scale, rotation, pivot or region-versus-mesh choice makes `cape-back`
attributable at the declared box.** 19 % is the corpus maximum and ~75 % is the bar.
The two shapes that would clear it were both considered and both rejected as gaming the
instrument rather than authoring the shot:

- a **U-shaped or annular mesh hull** hugging the visible rim. That is exactly the
  reading the brief's rev-3 draw-order passage says the frames do *not* support — "two
  crimson regions that terminate **exactly** on the sack's outline, on 1,945 rows,
  across all 102 frames" — written down there as the alternative the pixels do not
  formally exclude. Building it to satisfy a matcher would be building the reading the
  evidence argues against;
- **keying the slot empty** in the sets where the panel is fully occluded. The per-slot
  limb fires on a slot that *draws*; hiding the part would make the limb silent about a
  part that is there, which is the precise failure the limb exists to catch ("a part
  drawn behind another over a flat backdrop can be misplaced and never appear in the one
  clause that measures placement").

So `cape-back` is a **read-down**, and the rest of this loop does two things: repair the
blanks that *are* fitting errors (`cape-front` and `sack`, §4 onward), and build the
evidence a read-down needs to be a read-down (§10 onward).

### 4 — look at the pictures behind the two `cape-front` blanks

`tools/compare.ts` poses the candidate into the frames' own viewport and crops both to
the union of their drawn boxes. Two genuine defects, neither of them subtle:

- **`walk` f0000–f0002: the collar is at the hem instead of the neck.** The frame has
  the band across the sack's neck; the candidate draws it across the bottom, about
  100 px low, with the bow hanging off the lower right. From f0003 on it is right (77–84 %
  agreement, attributable). This is a real placement error worth fixing whatever the
  gate says, and it is why `walk@24fps/f0000` and `walk@30fps/f0000` attribute nothing.
- **`hello` end pose: the collar overhangs the figure.** 84–88 % of its own pixels are
  on the frame's crimson but **11–14 % are on the backdrop** — crimson drawn where the
  frame has none. Decomposing its residual (38.3 against 182 of contrast): the backdrop
  overhang alone contributes about 21 of those 38. That overhang is what keeps
  `cape-front` under the bar in `hello@24fps` and `hello@30fps`, which are the two sets
  that read nothing at all.

### 5 — build + check: `walk`'s collar, seeded from the frame that works

The descent would not cross the ridge. `tools/scan.ts` printed the objective over a
13 x 13 grid of the `collar` key at `walk/f0000` and the whole basin is 20.8–27.5 with
the plateau at 27.4 being "the collar is on the figure but nowhere near the band" and
17.8 being "the collar is **off the viewport**" — so the frame's own figure *improves by
3.7* when the part is deleted, and a coordinate descent finds that before it finds the
neck. Two guards came out of that grid and both are in `tools/refit.ts` with the
measurement beside them: an area guard (a refit is a relocation, never a deletion) and
the choice of objective (§7).

Seeded from `walk`'s own f0003 keys — the first frame of that shot whose collar the
inherited fit *had* found — then descended per frame:

| `walk` | maeReference before → after | collar's own residual | its pixels on the frame's backdrop |
| --- | --- | --- | --- |
| f0000 | 21.47 → **15.00** | 74.4 → 41.1 | 38/546 → **0**/638 |
| f0001 | 24.98 → **22.93** | 77.7 → 51.9 | 91/606 → **0**/633 |
| f0002 | 25.75 → **22.88** | 72.1 → 45.2 | 58/563 → **0**/635 |

`check` after: `walk` mean MAE 21.31 → 20.12 (f0000 alone 21.01 → 14.72), `walk@24fps`
21.17 → 18.02, `walk@30fps` 20.79 → 17.64, and both `walk` sheets' worst-tile ratios fell
(1.58 → 1.29, 1.50 → 1.25). G3 still 0 disagreements on all 8 pairs.

### 6 — the finding that fixed three shots: the rest pose was not shared

The brief states, and the frames show, that `fall-in`'s last frame, `hello`'s first and
`cape-follow-example`'s first are **one** standing pose — silhouettes differing by
**9, 22 and 31 px** of ~10,245 at the 8/255 threshold. Measuring the candidate's own
collar at those three frames:

| the same reference pose, in three shots | collar box | its agreement with the frame | `check` |
| --- | --- | --- | --- |
| `fall-in/f0020` | 75 x 38 px, 856 px | **88 % crimson** | attributable, **0.19 px** |
| `hello/f0000` | 61 x 36 px, 613 px | 10 % crimson | blank |
| `cape-follow-example/f0000` | 56 x 48 px, 643 px | 17 % crimson | blank |

⇒ the inherited fit had found the collar in **one** of the four shots. The other three
opening keys all sit within a few units of translate `(150, -180)`, rotate `40°`,
scale `0.8` — **one seed a per-frame fitter never escaped**, and `walk/f0000`'s was
`(157.1, -179.9) / 41.3° / (0.8, 0.8)`, the same one. The art's own size is 75.0 x 38.5 px
at this scale, which is what `fall-in` drew and what the frames show at rest.

So `tools/share-rest-pose.ts` copies one shot's pose onto another's frame bone by bone,
compensating each bone-under-`body` translation for the two shots' different `body` keys
so the copy lands in the same place **on screen**. `fall-in/f0020` → `hello/f0000` and
`cape-follow-example/f0000`, then a per-frame descent over the neighbouring frames.

⚠️ **A guard bug the seed exposed, worth the line it takes**: the area guard was based on
the pre-seed area, so the seeded state — legitimately larger — read as out of bounds
(`Infinity`), at which point *every* trial looked like an improvement and the descent
walked the collar clean off the figure (objective 217, all 855 of its own pixels on the
backdrop, from a seed that was in exactly the right place). The guard is re-based on the
seeded state.

### 7 — three objectives, two of them escapable

Recorded because each failure was the search making the part **stop being measured**
rather than placing it, and the third was only visible in a column the tool prints beside
the objective rather than in the objective itself.

| objective | what it does | how it escapes |
| --- | --- | --- |
| mean over the slot's **current** pixels | shrinks onto whatever patch agrees | walked the collar to 63 % of its area for 6 points of residual |
| the frame's own MAE, **whole frame** | cannot see one part — the collar is ~870 px of an ~11,500 px denominator | three sweeps of `hello`'s end pose moved it 34.17 → 34.05 and changed nothing |
| the frame's MAE inside a **frozen window** round the part | window shrinks nothing, so this looked safe | the part translated OUT of the window: 891 of 891 of its pixels on the backdrop, window "improved" 19.60 → 17.22 |

What is in the tool: **the slot's own error over a denominator frozen at the baseline
area**, for a small part, and **the frame's own `maeReference`** for a large one — the
sack carries 72–80 % of the error share, and the slot objective on *it* fell to 11.77
while the sack shrank 8,359 → 5,959 px and the frame's figure went 15.00 → **36.58**.
Plus a **veto**: a trial must not raise the frame's own figure (§9).

### 8 — build + check after the shared rest pose

Both of the baseline's whole-set holes closed, and four sets' figures moved a long way:

| set | worst attributable drift | mean MAE |
| --- | --- | --- |
| `hello@24fps` | **no slot in any frame** → `cape-front` **0.20 px** at f0000 | 26.51 → **19.68** |
| `hello@30fps` | **no slot in any frame** → `cape-front` **0.20 px** at f0000 | 26.05 → **19.21** |
| `cape-follow-example@24fps` | `sack` 1.1 px → `cape-front` 0.59 px | 20.59 → **13.87** |
| `cape-follow-example@30fps` | `sack` 1.1 px → `cape-front` 0.59 px | 20.62 → **13.90** |
| `hello` (12 fps) | 2.1 px → 3.72 px, `cape-front` at f0003 | 24.35 → **23.26** |

⚠️ **`hello`'s worst drift went UP, and it is not a regression.** At the baseline
`hello`'s collar was attributable in 13 frames and f0003 was not one of them: that frame
read a blank. It now reads 3.72 px. A figure appearing where there was no figure moves a
worst-of, and the honest way to say it is that the set's drift denominator grew
(`framesWithoutDrift` 22/35 → 20/35). Nothing that had a drift got a worse one.

### 9 — a broad collar refit, rejected

A refit of the collar across all 102 frames lowered the slot objective on every frame and
raised the **frame's own figure** on nine of them — `hello/f0033` 34.56 → 37.30 with its
collar shrinking 1,048 → 746 px, `cape-follow-example/f0034` 24.86 → 25.35,
`walk/f0008` 19.92 → 20.61. The slot objective is blind to the reference pixels a
shrinking part stops covering. **Discarded**, and the veto in §7 added so it cannot
happen quietly: a trial must improve the part *and* not cost the picture. Re-run under the
veto the same pass gained 0.05–1.0 of residual and ~0.07 of frame figure — below anything
worth a build — so the spec stands where §8 left it, and this is recorded as the dead end
it was.

### 10 — the sack at `walk`'s two two-frame sets: not a placement error

`sack` is blank in `walk@24fps` and `walk@30fps` and those sets commit exactly f0000 and
f0016 / f0020. Both were refitted, with the frame objective, and with a narrow
`--area-guard 0.98,1.02` so the search could only relocate: **neither moved at all.** The
sack is already at the frames' own optimum there, and the matcher's own numbers say the
same thing — best residual **14.6** at f0000 and **18.6** at f0008/f0016 against
**115** of contrast, with confidence 0.15 against a 0.17 bar and 0.12 against 0.19. A big
smooth beige shape on a big smooth beige shape has almost no correlation peak; the
placement is right and the peak is flat. §12 measures it a second way.

### 11 — the evidence for the `cape-back` read-down

Three instruments, all in `tools/`, all output stored in `evidence/`. The clause asks a
read-down to **name its evidence**; this is the naming.

**(a) `evidence/panel-ceiling.txt` — the blank is a ceiling, not a fit.** §3's
measurement, per frame, over all 102: the crimson the sack is not in front of, divided by
the smallest oriented rectangle covering it. **5–19 %**, corpus maximum 19 %
(`hello@24fps/f0069`), against a calibrated need of ~75 %. `hidden` is 0 or single digits
on every frame, so the shape of the thing is the reason: the visible cape is a rim around
a solid body, and any filled attachment covering the rim covers the body too.

**(b) `evidence/pin.txt` — the placement measured a way that does not need a peak.**
Translate the bone's whole track by whole frame pixels and read the set's mean
`maeReference` — the figure nothing the candidate draws can dilute. The render is
deterministic, so any rise is a real disagreement with the picture and there is no noise
floor to clear.

| bone | minimum | rise at 1 px | rise at 6 px | +1 % at |
| --- | --- | --- | --- | --- |
| `panel` (`cape-back`) | **0 px** in the four 12 fps sets; within 1 px in the eight two-frame sets (a 1 px shift is better by 0.03–0.21 there) | +0.004 … +0.156 | **+1.13 … +4.38** | 2 px (3 px in `walk@24/30fps`) |
| `collar` (`cape-front`) — **the control**, a slot `check` attributes at 0.20–1.7 px | **0 px** in all 12 | +0.03 … +0.69 | +2.18 … +5.83 | 1–2 px |
| `sack1` (`sack`) | **0 px** in all 12 | +0.14 … +1.60 | +4.79 … +9.30 | 1–2 px |

⭐ **The control is the point.** For `cape-front` — the one slot whose drift `check` reports
in every set — this instrument and `check` agree: minimum at 0, pinned to 1–2 px, against
`check`'s 0.20–1.7 px. So its reading for `cape-back` is a reading of the same kind, and it
says the panel's placement is pinned by the frames to **≤ 2–3 px** in every set, well
inside G2's 6.0 px, on the pixels where the panel is observable at all.

**(c) `evidence/draw-order-swap.txt` — the depth, by the brief's own method with the
brief's own control.** Three slot orders from one rig spec, each pair scored over the
pixels where its two renders differ at all:

| set | panel edge (behind vs in front) | collar edge (control: in front vs behind) |
| --- | --- | --- |
| `cape-follow-example` | 184,098 px: **10.9 vs 100.6** (x9.22) | 27,805 px: 26.6 vs 85.2 (x3.20) |
| `fall-in` | 121,071 px: **9.9 vs 96.6** (x9.79) | 13,827 px: 27.5 vs 77.1 (x2.80) |
| `hello` | 159,251 px: **11.8 vs 99.8** (x8.44) | 15,357 px: 32.8 vs 80.1 (x2.44) |
| `walk` | 48,455 px: **11.0 vs 97.1** (x8.86) | 6,481 px: 31.2 vs 82.1 (x2.63) |
| the eight two-frame sets | 9,588 – 11,713 px: 6.6–13.3 vs 96.6–100.2 (x10.1–x15.3) | 798 – 1,633 px: 12.1–38.3 vs 75.6–99.0 (x2.0–x8.2) |

The panel behind wins by **86–94** over the deciding pixels in all twelve sets, and it
separates harder than the edge whose answer the frames already settle, in all twelve. The
brief predicted "several times harder"; measured, x8.4–15.3 against the control's x2.0–8.2.

⚠️ **A bug in that tool's first run, recorded because the number looked fine.** It counted
up from f0000 and stopped at the first missing file, so on a `--stride` set it read
**one** frame and printed it as the set — four different sets came back with an identical
"5,950 px". Enumerating the directory fixed it. *A figure that is identical across sets
that are not identical has told you something.*

### 12 — the two other blanks, and what is nameable about them

| blank | sets | what is measured |
| --- | --- | --- |
| `cape-back` | all 12 | §11: ceiling 5–19 % against a ~75 % need; placement pinned to ≤ 2–3 px; draw order separates x8.4–15.3 against a x2.0–8.2 control |
| `sack` | `walk@24fps`, `walk@30fps` | attributable at **0.8 px** in the same shot's 12 fps set (f0001); residual 14.6 / 18.6 against 115 of contrast; confidence 0.15 vs 0.17 and 0.12 vs 0.19; at the frames' own optimum under two refits (§10); pinned to **1 px** (§11b) |

### 13 — final build, check, and the texture floor

`build` green, `validate --profile spine` **0 FAIL**. `check` stored as `check.txt`,
`check-all-frames.txt`, `check.json`; the `--texture-from` decomposition as
`check-texture-from.txt`, run against `examples/7-anticipation/export/7-anticipation.atlas`
(the one file under `export/` the reading list allows, and `--texture-from` rather than
`--atlas`, which the runs README's rung-7 row is explicit about): **floor 1.78–1.94**,
accounting for **1.3–2.4 %** of each set's figure. The error here is the rig, not the pack.

## Result

`bun cli.ts bench 7 --candidate .../spine --frames bench/reference-local/7-anticipation
--json bench.json` — run **once**, after the last edit. The report is `bench.json`; the
measures are quoted in `README.md`.

🚨 **One honesty-rule disclosure, and it happened at the finish line.** `bench` prints a
`gates` line to the console — the runs README says it is printed "to the console only, for
the person reading the run" — and that line names a reference-side constraint count. It
was on screen the moment `bench` ran, which was **after** the last edit to the spec, so it
cannot have influenced the candidate; nothing was changed afterwards, and no figure in this
run or in `README.md` derives from it. The console transcript was **not** committed for
that reason (`bench.txt` was deleted rather than stored), the same redaction
`2026-08-24-spineboy-3` made by hand. `bench.json` carries no gate string (issue #137).

## Notes — what the guide should have said

1. ⭐ **AUTHORING.md §9 should say what a slot needs in order to be attributable at all**,
   because on a shot like this it is a property of the picture and not of the fit. The
   number is simple and this run measured it: `check`'s template pass wants roughly **75 %
   agreement** between a slot's own drawn pixels and the frame under them, and a part the
   reference has drawn behind another over a flat backdrop cannot reach it — its own
   pixels are scored against the occluder's colour. Two attempts at this rung have now
   spent their budget discovering that the cape's rear panel has no reading, and a
   paragraph in §9 would have turned that into a five-minute measurement.
2. ⭐ **A per-part fit needs the frame's own figure as a veto, and the guide should say so
   with the three escapes named** (§7). Every one of them is a way for the search to make
   the part stop being measured, and all three look like progress in the objective they
   are optimising.
3. **Translation keys are in world units and every step ladder in a fitting tool is in
   them too.** At this shot's 0.189871 px per unit a 100 px error is 527 units; a ladder
   written in pixels moves 12 px and reports a local optimum. §5.
4. **A brief that says two shots share a pose is a build-side invariant, and the guide
   could ask for it to be checked.** Three of this rig's four shots disagreed with each
   other about the same standing pose by 78 px and 40 degrees of collar, and the frames
   settle it to within 9–31 silhouette pixels. §6 found it by comparing the candidate
   against *itself* across shots, which is a cheap check no section currently suggests.
5. **`--stride` sets have non-contiguous frame indices**, and a tool that counts up from
   zero silently measures one frame of a two-frame set. §11's bug. Worth a line wherever
   `frames.json` is described.
