# spineboy (`ess`) — attempt 3

- **date** 2026-08-24
- **agent** Claude Opus 5 (1M context), Claude Code / Agent SDK
- **scope** `ess` only — the rung clears on `ess`. **`pro` was not attempted**, and
  the `pro` line `bench` prints from this candidate measures nothing here.
- **inputs** `bench/briefs/spineboy.md` **revision 3**; the committed reference frames
  and `frames.json` under `bench/reference/spineboy/ess/`;
  `examples/spineboy/images/`; `docs/AUTHORING.md` in full; this repository's `src/`
  and `README.md` as format documentation; the CLI.
- **atlas** `examples/spineboy/export/*.atlas` **not opened.** rigc emits its own
  one-part-per-page atlas from the loose PNGs, so this run did not need it.
- **reference export** not read. **`bench` run once, at the end.**
- **guide** AUTHORING.md §8, §8.1, §9, §9.2 and §10 in hand (this run is after
  2026-08-23, so §10 was a standard input).
- **profile** `spine`
- **inheritances** four sessions, one attempt. Sessions 1–3 were each killed
  mid-run by a **server-side API error (529 Overloaded)**; the disk state survived
  each time and was inherited in place in the same worktree. **The inputs never
  changed and no forbidden file entered any session.** What is lost is the
  *authorship of the reasoning*, not the artifacts, which is why every load-bearing
  inherited number was re-derived rather than trusted —
  [`LOOP.md`](LOOP.md) §1 and §2 record which.
- **honesty-rule incidents** none. See *Honesty* below.

## What was built

One skeleton, `spineboy-ess`: **18 bones, 21 slots, 2 declared events, one skin**,
and all **8** `ess` animations — `aim`, `death`, `hit`, `idle`, `jump`, `run`,
`shoot`, `walk`.

- [`spineboy-ess.rig.json`](ess/spineboy-ess.rig.json)
- [`spineboy-ess.motion.json`](ess/spineboy-ess.motion.json)
- [`ess/spine/`](ess/spine) — the compiled candidate

Method, in the order §10 puts it: one image → one slot → one attachment, each
named after the PNG, and the bone that moves it named the same (§10.1 — the art
here *is* named after the parts, which §10.1 calls the largest lever it has). The
slots array is the setup draw order (R4). Two slots hold alternatives because the
shot swaps between them and for no other reason (§10.1): `front-fist` holds the
open and closed hands, `muzzle` holds the five numbered flares. The poses were
fitted against the rendered composite (§8.1) and reduced to keys under one
tolerance **in pixels at the end of what each bone swings**, converted per bone by
its own lever arm (§10.3); the easing table was discovered in a first pass and
**every timeline re-planned under the table that would actually be written**
(§10.4's two passes), never fitted free and snapped afterwards.

## Reading

### What decided the run

Three defects, none of which the gate, `diff` or an aggregate MAE can see, and all
three found by **`check`'s per-frame column and its chain table**:

1. **A hold that was not held.** `death`'s nine still frames and `shoot`'s
   motionless opening pair — the brief's own headline fact — were both moving in
   the candidate. Fixing it needed two things that are easy to mistake for one:
   the *pose series* has to hold (the frames where the reference does not change
   are collapsed to a single fitted pose) **and the key planner has to key both
   ends of that hold** (§10.3), because a greedy span will otherwise run straight
   through a plateau inside its own tolerance.
2. **Loop seams.** A cycle's last pose is its first pose, and four independently
   fitted end poses were not — `shoot`'s put the near forearm **105° away** from
   frame 0's against a reference pair that differs by **0 px**. The brief's own
   sorting of the 17 first-to-last differences (four exact returns, then a factor
   of 8.6 to the next group) is what says which shots this applies to.
3. **An attachment that was fitted and never emitted.** Six of the eight shots were
   fitted against `front-fist-closed` while the built skeleton showed the setup's
   `front-fist-open` in every one of them, because no animation carried an
   attachment key. Worth **1.9 MAE on `hit`** and **1.4 on `walk`** on its own.

### What the frames decided that the brief left open

**Each boot is drawn behind its own shin** — a third draw-order edge, reached by
§8's like-for-like test (render the candidate both ways and measure the same
feature on both sides). The whole-shot version of that test **cannot** decide it:
run against a control that reverses an edge the brief settled by measurement, it
came out 0.1 % the *wrong* way, which under §8's rule is *no answer*. Restricting
the comparison to the pixels where the two builds actually differ — everywhere
else they are bit-identical — the same control reproduces its known answer at
**47.7 %** and the boot edge reads **12.5 %**, with the frame tally positive in all
eight shots and the two feet agreeing independently (12.1 % and 13.4 %).

### What was left unauthored, and why

- **No hit region.** §3's own paragraph says these frames cannot show one, and the
  brief declines to say whether the reference has any. A bounding box would be a
  claim the frames cannot support either way, so none is authored, and the
  `boundingbox` support rigc has is deliberately unused.
- **No draw-order timeline.** The brief searched both skeletons and found **no
  pair of parts on one side of each other in one frame and the other side in
  another**, so nothing in these frames asks for a re-order over time. The three
  decided edges are all expressible in the setup order (R4), which is where they
  are.
- **No constraints.** Nothing in the frames distinguishes a limb posed by keys from
  the same limb driven by an IK chain, and §9.3 says as much about what `check`
  can see. Authoring one would be a guess with machinery attached.
- **`muzzle-glow` and `muzzle-ring` are declared and never shown.** The art ships
  them; the brief says outright that the frames cannot say how the flare is divided
  between parts. The slots exist so that a shot which needs them has somewhere to
  put them (§3.6's *"a skeleton may declare the vocabulary its game listens for"*
  applied to attachments), and nothing keys them on.
- **`muzzle02` and `muzzle05` are placed but never resolvable.** The like-for-like
  test separates `muzzle01` and `muzzle03` decisively (132 % and 15 %); `muzzle04`'s
  own test came out 1.2 % apart, which is no answer, and it is taken from the art's
  numbering. At 12 fps the other two fall between committed frames.
- **Which eye and which mouth.** The brief lists this among the things it cannot
  tell you, and it is right — the goggles cover the eyes on every frame and the
  mouth is 6–8 px across. `eye-indifferent` and `mouth-grind` are in the setup pose
  and nothing swaps them.

## The measures

`bun cli.ts bench spineboy --candidate bench/runs/2026-08-24-spineboy-3/ess/spine --json bench.json`,
run **once, at the end**. ⚠️ `bench` prints a line per reference skeleton whichever
candidate it is given. This candidate is `ess`. **Only the `ess` line is quoted and
only the `ess` line was read**; the `pro` line it also printed measures a candidate
that was never built for it and is not reproduced here.

```
  validate   green  (profile spine)
  ess        bones=0.924  slots=0.844  attachments=0.955  constraints=1.000  animations=0.804  events=0.500
             bones 0.924 (name-matched) · 0.967 (name-agnostic)   slots 0.844 (name-matched) · 0.810 (name-agnostic)
```

Gate: **18 PASS, 0 FAIL**, 2 SKIP, 14 PROF under `--profile spine`. Both SKIPs are
accounted for and both are decisions rather than gaps —
`A31_DRAW_ORDER_OFFSETS_RESOLVE` (no animation carries a `drawOrder` timeline) and
`A33_VERTEX_ATTACHMENT_GEOMETRY` (no bounding box, no clipping attachment); see
*What was left unauthored*.

### `check`, final build

`bun cli.ts check --candidate ess/spine --frames bench/reference/spineboy/ess`.
Reference-denominator MAE (§9.2's denominator — the one nothing a candidate does can
grow), 12 fps sets, beside the state this attempt inherited:

| set | inherited | final | | set | inherited | final |
| --- | ---: | ---: | --- | --- | ---: | ---: |
| `idle` | 25.69 | **25.20** | | `jump` | 41.05 | 44.11 ⚠️ |
| `aim` | 31.86 | **30.65** | | `run` | 52.57 | **45.62** |
| `walk` | 32.99 | **30.39** | | `hit` | 53.91 | **43.27** |
| `shoot` | 39.59 | **35.04** | | `death` | 63.03 | **54.31** |

**No `⚠️ overdraw` on any of the 16 sets** — the candidate is not buying a mean by
inking more than the reference does. Pooled over all 132 committed frames in
`frames.json`'s own box, the run moved **35.485 → 32.067** (−9.6 %).

`check`'s per-frame column — the only thing in the toolchain that can see a hold or a
seam — went from **14 disagreeing adjacent pairs to 3**, all three in `death` and all
three at the entry to its still passage.

### The final per-chain rollup

```
    chain                worst slot drift across every set                            mean   MAE in it    share
    neck                 6.0 px "goggles" in death/f0028                            1.1 px       22.42    30.6%
    front-thigh          14.6 px "front-shin" in death/f0054                        4.8 px       52.44    20.4%
    front-upper-arm      4.2 px "front-bracer" in death/f0028                       1.3 px       60.44    14.5%
    rear-thigh           12.1 px "rear-shin" in death/f0007                         1.8 px       54.23    14.4%
    rear-upper-arm       6.0 px "gun" in walk/f0007                                 1.0 px       37.47    10.9%
    torso                4.4 px "torso" in shoot/f0000                              1.6 px       47.76     9.2%
```

Six chains, all six drawing, no `0 %` row, no blank drift row, nothing
`(unattributed)` — §8.1's loudest failure mode is absent. `neck` carries the largest
share at the **lowest** error per pixel, which §9.2 says to read as a large chain and
not a wrong one; the worst chain *per pixel* is `front-upper-arm`, the near arm, and
that is where the next iteration would go.

**Worst three shots by drift and MAE**: `death` (54.31; `front-thigh` 14.6 px at
f0054, `rear-thigh` 12.1 px at f0007 — the lying passage's legs), `run` (45.62;
`rear-upper-arm`, the gun still 21 px short of the reference's reach at f0006),
`hit` (43.27; `torso`, and the whole shot is five frames of a pose the search only
reached with multi-start).

## Known wrong

- **Four sets could not take `frames.json`'s own box** — `death`, `hit`, `run`,
  `shoot`. §9.2 puts that at 15–25 MAE against the four that could (`aim`, `idle`,
  `jump`, `walk`), so a good part of the gap between the two halves of the table is
  the measurement and not the keys. It is a real finding all the same: the test is
  *does this set's own drawn extent land on the reference's*, and on the hard frames
  it does not. `fitting/edgereport.ts` localises it per frame and per edge.
- **`death` is the worst set and its lying passage is the reason.** The reference's
  boots stop at column 175 and stay there from f27 on; the candidate's stop up to
  12 px short, and the body sits up to 5 px low. The multi-start refit was run on
  the fall (f4–f7) and the settle (f13–f17) and not on the long tail, which is where
  the `front-thigh` chain's worst drift still sits.
- **The near arm is the worst chain per pixel** and on several frames `check` reports
  `no slot attributable` for it — which §8.1 calls the loudest row in the table, not
  the quietest: the matcher refuses to name a distance past the part's own size, so
  a blank beside a high figure per pixel means the limb is further out than that.
- **`run`'s two footfall cues sit at the top of their windows.** The brief's
  intersection gives (0.167, 0.200] and (0.533, 0.567]; 0.200 and 0.567 are the only
  multiples of 1/30 inside them, which is why they were chosen, but the frames do
  not prove the grid and the windows are the honest statement.
- **`jump`'s landing cue is this run's inference, not the brief's list.** The brief
  names the walk footfalls, the run landings and the shoot discharge as *the*
  moments; it also measures `jump`'s landing to the frame in the same terms
  ("back on the floor at **f15**"), and a game holding a jump wants that instant for
  the same reason it wants a walk's. One event, at 15/12 s. If the reference has
  none there, that is a false positive this run authored deliberately.
- **The event names are an animator's**, not the reference's: the brief says
  outright it will not tell you how a moment is spelled. `footstep` and `shoot`.

## Notes for the guide

1. 🚨 **§10.3's hold needs its other half stated: the planner has to key it.**
   §10.3 says *"key the start of a hold and key its end, at the same value"*, and
   §9.2 says the per-frame column is what catches a sloped hold — but neither says
   what a *reducer* has to do about it, and the natural greedy reducer gets it
   wrong. This run's key planner forced the series ends and every change of
   direction, which is what §10.3's prose asks for, and still authored a slope
   through nine still frames because a plateau is neither of those things and the
   span stayed inside the per-bone tolerance. **A tolerance is not a hold**: the
   plateau's two ends have to be forced indices in their own right. Worth adding
   beside §10.3's paragraph, because a run that gets the *poses* right can still
   fail this and see nothing wrong anywhere else.
2. 🚨 **§8.1's near-identical-parts rule has a cousin it does not name: two whole
   chains can share a minimum.** §8.1 covers a hand under three rotations (scan the
   two links above it as a pair) and a front limb against its rear twin (one
   calibrated separator, pinned). Neither reaches the case that cost this run most:
   on `hit` f0 the near arm and the gun are lying where the reference's *legs* are,
   so every leg knob that would move the leg there finds it already inked and
   reports no improvement — correctly, on the objective it was given. A paired scan
   cannot help, because the two knobs are in different chains and pairing every
   chain with every other is the whole product. What worked is cheap and worth a
   line in §8.1: **more than one start.** Screen a handful of starts (the incumbent,
   both neighbours, poses spread across the shot, the setup pose) through the coarse
   levels only, take the best two through the full schedule, and keep the incumbent
   among the candidates so a frame can only improve. Measured on the frame that
   named the problem: **6.67 → 5.95 → 5.44 → 4.80** across repeated runs of the same
   search, which also says how far from converged a single-start fit can be while
   reporting success.
3. **§8's like-for-like draw-order test needs its denominator stated.** §8 says to
   render both ways and *"measure the same feature on both sides"*, and §8.1 adds
   that two orders inside the objective's own scatter are no answer. What neither
   says is that a **whole-shot** MAE is usually the wrong feature: two builds
   differing only in slot order are bit-identical everywhere the two slots do not
   overlap, so the evidence is divided by the whole figure and by every frame that
   carries none of it. Here that turned a settled edge 0.1 % the wrong way. The fix
   is mechanical and needs no knowledge of which parts are involved: **score both
   builds over exactly the pixels where the two builds differ.** Same test, same
   controls, and the known edge went from *no answer* to 47.7 %.
4. **A control that fails can fail because the control is wrong.** This run's second
   control moved the far leg past `front-foot` — which moves it past the torso, the
   head and the neck as well, so it reversed one edge and asserted several others.
   §8's *"a control that returns an impossible number has told you something"*
   generalises: read the per-frame rows before condemning the hypothesis, because
   they said `base` won every frame that carried the evidence while the aggregate
   said otherwise.
5. 🚨 **`bench --json` leaks `src/ladder.ts`'s gate string into `bench.json`, and
   the protocol requires `bench.json` to be committed.** The forbidden table names
   that string precisely — it carries per-skeleton bone, slot and animation counts —
   and `bench.json`'s `gates` field is a verbatim copy of it. The run protocol lists
   `bench.json` among the six files a run directory holds, so the leak is not
   avoidable by an obedient run: it is written by the finish line and committed by
   the protocol. Downstream it is worse than upstream, because the ladder tells the
   *next* agent that earlier runs' `README.md` and `LOOP.md` are readable for
   process, and a run directory is where a curious agent looks. The fix is at the
   emitter — omit `gates` from the JSON, or reduce it to the rung's name — not at
   the reading list.
6. **§9.2's per-frame column deserves to be named in §0's loop.** It is the only
   thing in the toolchain that can see a hold, a seam or a one-frame event, and it
   is printed under a heading a reader scanning for MAE and drift will skip. Two of
   this run's three decisive defects were sitting in a report that had already been
   read for its chains.

## Honesty

`examples/*/export/*.json`, `bench/transcriptions/**`, `docs/LADDER.md`'s status
table and per-rung sections, `docs/SPEC_COVERAGE.md`, `src/ladder.ts`'s gate
strings, issue bodies carrying counts, `bench/render_reference.ts`, and git
history, blame and tags were **not opened** in any of the four sessions.
`bench/runs/2026-08-23-spineboy-1/` and `-2/` were not opened at all — not their
`README.md`, not their `LOOP.md` — because they are attempts at the rung being
authored; `2026-08-23-rung8-2/` and `-rung3-2/` were the process precedents.
`examples/spineboy/export/*.atlas` was permitted and was not needed.

🚨 **One incident, and it is the repository's, not this run's discretion.**
`bench --json` writes a `gates` field into `bench.json`, and its value is
`src/ladder.ts`'s **gate string** — which the forbidden table names explicitly:
*"the same counts again, in code — `gates:` on each rung entry names the features
and the sizes"*. It carries this rung's per-skeleton bone, slot and animation
counts. It was read while looking for the `ess` measures in the report **after
`bench` had already been run**, so it cannot have reached a single authoring
decision — the rig was built, frozen and measured before the file existed. It is
recorded rather than buried, and it is **a defect to report**: the run protocol
*requires* `bench.json` in the run directory, so every run that follows the
protocol commits a forbidden fact into its own record and hands it to the next
agent that opens one. See *Notes for the guide*.

⇒ **[`bench.json`](bench.json) is committed with that one field redacted** and the
redaction says what it replaced and how to regenerate the original. Every measure in
the file is untouched. Leaving the string in a file the ladder tells the next agent
it may read would repeat, on purpose, the breach the run protocol's own ⚠️ was
written about.

⚠️ AUTHORING.md quotes `bench/runs/2026-08-23-spineboy-2/LOOP.md` three times in
§9.1, with a section number and a measure each time (`MAE 13.0 → 114.6`,
`4,500 renders`). Those are **this rung's own earlier attempt**, cited from a
document a run is told to read in full. Nothing there is a fact about the reference
— they are traps in `spine-core`'s API and the numbers are a candidate's own — so
this run treated them as guide material and read them, and records that it did.
**`bench` was run once, at the end, and only the `ess` line was read.**
