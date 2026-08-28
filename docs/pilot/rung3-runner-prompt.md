# Runner prompt — rung 3

> **How to use this file.** Everything below the line is the prompt. Copy it from
> `--- BEGIN PROMPT ---` to `--- END PROMPT ---` and paste it to the agent as its
> task. Do not add context, do not summarise it, and do not paste anything from
> [`rung3-evaluator.md`](rung3-evaluator.md) — that file is the answer side and is
> on the forbidden list below.
>
> Fill in `<REPO>` with the absolute path of the rigc clone or worktree the agent
> is to work in before you hand the prompt over.

---

--- BEGIN PROMPT ---

You are going to author a Spine rig with a tool called **rigc**, and then attempt
one rung of its benchmark. There are three parts: **T0** (get the tool working),
**T1** (author something small of your own), **T2** (the benchmark rung). Do them
in order. Do not skip ahead. If a step fails, fix it and repeat that step before
moving on.

The repository you are working in is at `<REPO>`. Every path in this prompt that
starts with `bench/`, `docs/`, `examples/` or `src/` is relative to `<REPO>`.

Two things before you start, and they matter more than anything else here:

- **You are being measured on authoring a rig you cannot see.** There is a list
  below of what you may read and what you may not. The forbidden files contain the
  answer. If you read one, the run is not scored — so if it happens by accident,
  **write it down in your log rather than hiding it.** A leak that is named costs
  the run some measures; a leak that is buried costs the benchmark every figure it
  ever printed.
- **Record your own model name honestly** when you write the run record — the
  `agent:` line in step 24 and the header block in step 34. Write the model you
  actually are, and the harness you are running in. If you are not certain of the
  exact version string, write what you do know and say it is uncertain. Do not
  write the name of a different model, and do not leave it blank.

---

## Part T0 — get rigc working (steps 1–7)

**Step 1.** Check that Bun is installed. Run:

```bash
bun --version
```

If this fails, stop and report that Bun is not installed. rigc runs on Bun.

**Step 2.** Install rigc. Run:

```bash
bun add -g spine-rigc
```

The npm package is called `spine-rigc`; the command it installs is called `rigc`.
If the install fails, you can instead run `bunx spine-rigc` everywhere this prompt
says `rigc` — for example `bunx spine-rigc build …` instead of `rigc build …`.

**Step 3.** Make a scratch directory somewhere outside `<REPO>` and change into
it. For example:

```bash
mkdir -p /tmp/rigc-t0/buoy && cd /tmp/rigc-t0/buoy
```

**Step 4.** Open `<REPO>/README.md` and find the section called **"First rig in
ten minutes"**. Follow it exactly, in your scratch directory: create the three
PNG plates with the `bun -e` command it gives, then write the two JSON files it
shows — `buoy.rig.json` and `buoy.motion.json` — copying them exactly as printed.

**Step 5.** Build it. Run, in the scratch directory:

```bash
rigc build --rig buoy.rig.json --motion buoy.motion.json --images images --out spine
```

**Step 6.** Confirm the last two lines say `rigc: wrote …/spine/skeleton.json` and
`rigc: wrote …/spine/skeleton.atlas`. If any assertion says `FAIL`, read the
message — it names the object, the value found and the value required — fix the
file it points at, and run step 5 again.

**Step 7.** Re-gate what was written. Run:

```bash
rigc validate spine
```

Confirm the last line is `rigc: green`. **T0 is done.** Report that T0 passed
before continuing.

---

## Part T1 — author a small rig of your own (steps 8–13)

**Step 8.** Read `<REPO>/docs/AUTHORING.md`. Read all of it. Sections 1 through 5
are the two file formats field by field, the rules that decide what is emitted,
and the map from every named failure to the file you have to change.

**Step 9.** Make a second scratch directory outside `<REPO>` and change into it,
for example `/tmp/rigc-t1/flag`.

**Step 10.** Author, from scratch, a rig spec and a motion spec for **a two-part
signal flag: a pole, and a pennant on it that flaps.** Use your own bone names,
your own slot names, your own numbers. Do not copy the buoy from T0 and rename
its parts — write a new pair of files.

**Step 11.** Make the PNG plates your rig spec's `image` fields refer to. They can
be plain solid-colour rectangles; the T0 section of `<REPO>/README.md` shows one
way to write a PNG from Bun. rigc measures the PNG to get the attachment's width
and height, so the files have to exist and be the size you intend.

**Step 12.** Build it:

```bash
rigc build --rig <your-rig>.rig.json --motion <your-motion>.motion.json --images images --out spine
```

Read every `FAIL` line, fix the spec, and repeat until the build writes both
files.

**Step 13.** Run `rigc validate spine` and confirm `rigc: green`. **T1 is done.**
Report that T1 passed, and paste both of your spec files into the report.

---

## Part T2 — the benchmark rung (steps 14–35)

This is the scored part. Work in `<REPO>`.

**Step 14.** Make sure you are in a git worktree of your own and **not** in a
shared checkout that somebody else is editing. If `<REPO>` is already a worktree
made for you, continue. Otherwise create one:

```bash
cd <REPO> && git worktree add ../rigc-wt-pilot-run
```

and work in `../rigc-wt-pilot-run` from here on. A previous run lost time because
another agent's edits landed in the tree underneath it mid-loop.

**Step 15.** Install the repository's dependencies. In the worktree, run:

```bash
bun install
```

**Step 16.** Fetch the example art. Run:

```bash
bun run fetch-examples
```

This downloads Spine's official example projects into `examples/`. It needs
network access. If it reports a GitHub rate limit, export a `GITHUB_TOKEN` and run
it again.

🚫 **That download also puts the reference skeleton files on your disk, under
`examples/*/export/`. Those are the answer. Do not open them.** The full rule is
in step 18.

**Step 17.** Confirm the art you are allowed to use is present:

```bash
ls examples/3-timing-and-spacing/images/
```

**Step 18. Read this list and obey it for the rest of the task.** It is quoted
here in full from `<REPO>/bench/runs/README.md`, section *What a run may read*.
Do not go and read that file to check — it is quoted correctly, and the copy below
is the one that binds you.

> **✅ Allowed — the complete list.**
>
> 1. the rung's brief, `bench/briefs/<rung>.md`;
> 2. the rendered reference frames and contact sheets under
>    `bench/reference/<example>/`, and their `frames.json` sidecars;
> 3. the art, `examples/<example>/images/`;
> 4. that example's **`.atlas`** — the atlas is a supplied input rather than
>    something the agent authors (rigc has no packer, B3), and it is packed *from*
>    the loose PNGs in (3). It is the one file under `examples/*/export/` a run may
>    open, and the skeleton JSON beside it stays the answer. A run that does not
>    need it — rigc emits its own atlas from the PNGs — should say so and skip it;
> 5. `docs/AUTHORING.md` in full, §8, §9 and §10 included;
> 6. Spine's public documentation at esotericsoftware.com;
> 7. this repository's own source and README as documentation of the input
>    formats — `src/rig.ts`, `src/types.ts`, `src/render.ts`, `src/check.ts` and
>    the rest;
> 8. the CLI: `bun cli.ts build` / `explain` / `validate` / `diff` / `check`, and
>    `bench` **once, at the end**;
> 9. earlier runs' `README.md` and `LOOP.md` **for process only** — how a loop is
>    run and what a log looks like — and **not** another attempt at the rung being
>    authored, whose **measures** are the answer one step away.
>
> **🚫 Forbidden — and each of these has a reason beside it.**
>
> | Not this | Why |
> | --- | --- |
> | `examples/*/export/*.json` | the reference skeleton. This is the answer |
> | `bench/transcriptions/**` | the same answer rewritten by a script that read it |
> | `docs/LADDER.md`'s **status table** and its **per-rung sections** | the table's *New at this rung* column publishes bone, slot and animation counts per skeleton, which the briefs withhold on purpose; the per-rung sections publish every previous run's measures. Both are the ladder's bookkeeping and stay where they are — a run simply does not read them. The two parts of that document a run *should* read are *How a rung is scored* and *The honesty rule* |
> | `docs/SPEC_COVERAGE.md` | all of it. Part 3 inventories what the corpus actually uses and part 4 lists, rung by rung, the bones, slots, constraints, attachment kinds and timelines each example skeleton carries. It is a reference export in prose |
> | `src/ladder.ts`'s **gate strings** | the same counts again, in code — `gates:` on each rung entry names the features and the sizes |
> | **issue bodies carrying counts or measures** | the per-rung issues (#10–#18) and any issue quoting a `bench` line. A number reaches an agent the same way whichever file it is in |
> | any **derived form** of the above | bone names, key times, curve handles, timeline listings, however they arrive — a previous session's summary, a commit message, a paste, a chat quote |
> | `bench/render_reference.ts` | it reads the export to produce the frames |
> | git history, `git log`, blame, tags | the transcription commits are in it |

**Three additions to the forbidden table, for this run specifically:**

| Not this | Why |
| --- | --- |
| `bench/runs/2026-08-23-rung3-1/` | a previous attempt at **the rung you are authoring** — its measures, and for this exercise its specs too. ⚠️ The ladder's own protocol lets a *successor attempt* inherit a prior attempt's rig and motion specs (owner ruling 2026-08-28, `bench/runs/README.md`, *Inheriting the prior attempt's candidate*). **A pilot run is not a successor attempt**: the whole point here is to measure an agent authoring from zero, so the specs are excluded on top of item 9 rather than by it |
| `bench/runs/2026-08-23-rung3-2/` | the same, the second attempt |
| `docs/pilot/rung3-evaluator.md` **and everything under `docs/pilot/verdicts/`** | the pilot judge's sheet and the filled-in verdicts of previous pilots. Both quote `docs/LADDER.md`'s rung-3 sections and previous runs' measures, which are forbidden above |

If you want to see what a run's log and report look like, read a run for a
**different** rung — for example `bench/runs/2026-08-23-rung6-1/LOOP.md` — and
read it for its shape only, never for its numbers.

**Step 19.** Two more rules that decide how you work rather than what you read:

- ⚠️ **`bench` is the finish line, not a step of the loop.** Its measures are
  derived from the reference export, so editing your spec after reading them is
  tuning against the answer. Run it **once, at the very end**, and do not edit
  anything afterwards. If you do read `bench` and then keep editing, say so in
  your log and label the run **bench-assisted**.
- ✅ **`check` is not `bench`, and it stays in the loop.** It reads only the
  rendered frames, never the reference skeleton, so you may run it as often as you
  like. Every clean run recorded so far used it dozens of times.

**Step 20.** Read the brief. It is at:

```
bench/briefs/3-timing-and-spacing.md
```

It is the only description of the shot you get. Note that this brief has **not**
been verified by a second agent — it is a viewer's report, so check its claims
against the frames the same way you check your own.

**Step 21.** Read `<REPO>/docs/AUTHORING.md` **§8** (reading reference frames),
**§9** (`rigc check` — what it measures and how to read the table) and **§10**
(what the Spine editor does by default). Read them before you start measuring, not
after. §8 exists because an earlier run got three measurements wrong in ways that
each looked like a fact about the animation.

**Step 22.** Look at the reference frames:

```
bench/reference/3-timing-and-spacing/
```

There are two animations' worth of stills plus contact sheets, and a
`frames.json` sidecar that gives the viewport and the render scale. **Measure, do
not eyeball.** These frames are small, and defects that are plausible at a glance
have been false under a pixel test every time.

**Step 23.** Create your run directory now, so that your log has somewhere to live
from the first turn. Use today's date:

```bash
mkdir -p bench/runs/<YYYY-MM-DD>-rung3-1
```

If a directory with that exact name already exists, use `-2`, then `-3`, and so
on. **Every path below that says `<YYYY-MM-DD>-rung3-1` means the directory you
actually created** — substitute the real name each time.

**Step 24.** Create `bench/runs/<YYYY-MM-DD>-rung3-1/LOOP.md` and write its header
block **now, before you author anything**. Use exactly this shape, filling in your
own values:

```markdown
# Rung 3 — attempt <n>, the loop

- date:      <YYYY-MM-DD>
- agent:     <your model name and version> / <your harness>
- inputs:    bench/briefs/3-timing-and-spacing.md, docs/AUTHORING.md,
             examples/3-timing-and-spacing/images/,
             bench/reference/3-timing-and-spacing/
- reference: not read
- guide:     AUTHORING.md §10 in hand
- profile:   spine
- clean:     yes

## Loop
```

The `agent:` line is your own model name. Write the truth (see the second bullet
at the top of this prompt). If at any point you do read something from the
forbidden list, change the `reference:` line to say so and describe what you read.

**Step 25.** Author your rig spec, `bench/runs/<YYYY-MM-DD>-rung3-1/<name>.rig.json`.
Names are yours — the benchmark reports name-matched and name-agnostic figures side
by side precisely so a correctly built rig under its own names is not called a
failure. rigc needs a `skeleton.width` / `skeleton.height`; nothing in the scoring
reads them, so pick something that comfortably contains the shot.

**Step 26.** Author your motion spec,
`bench/runs/<YYYY-MM-DD>-rung3-1/<name>.motion.json`. Its `archetype` must be
exactly equal to the rig spec's `name`.

**Step 27.** Build. From the worktree root:

```bash
bun cli.ts build \
  --rig     bench/runs/<YYYY-MM-DD>-rung3-1/<name>.rig.json \
  --motion  bench/runs/<YYYY-MM-DD>-rung3-1/<name>.motion.json \
  --images  examples/3-timing-and-spacing/images \
  --out     bench/runs/<YYYY-MM-DD>-rung3-1/spine \
  --profile spine
```

Use `--profile spine`. You are reproducing an editor export, and the default
`spine-html` profile would fail you for renderer policy this rung is not about.

**Step 28.** Append one entry to `LOOP.md` for the build you just ran, in this
shape:

```markdown
### <n> — build
`bun cli.ts build --rig … --motion … --images … --out … --profile spine`
<green, with the counts — or the FAIL line verbatim>
→ changed: <what you changed in response>
```

Record **every** turn, including ones that failed for a silly reason. A guide that
leaves you to discover something by failing is a defect in the guide, and this log
is the only place that shows up.

**Step 29.** If the build was not green, fix the spec and go back to step 27.

**Step 30.** Once the build is green, run `check` against the frames:

```bash
bun cli.ts check \
  --candidate bench/runs/<YYYY-MM-DD>-rung3-1/spine \
  --frames    bench/reference/3-timing-and-spacing
```

🚨 **A green build does not mean the animation is right, and no assertion could
tell you.** `build` says the file is valid. `check` renders your candidate onto the
frames' own pixel grid and compares pixels — it is the only thing in the loop that
can see a wrong animation. A run that skips it has verified nothing about the
motion.

**Step 31.** Read the `check` table (AUTHORING.md §9.2 explains every column), fix
the worst thing it names, and go back to step 27. Append a `check` entry to
`LOOP.md` each time. Keep looping until `check` stops improving or you run out of
things it can tell you.

**Step 32.** When you are finished authoring — and **only** then — run the
benchmark, exactly once:

```bash
bun cli.ts bench 3 \
  --candidate bench/runs/<YYYY-MM-DD>-rung3-1/spine \
  --json      bench/runs/<YYYY-MM-DD>-rung3-1/bench.json
```

Do not edit any spec file after this command. If you do, you must label the run
**bench-assisted** in both `LOOP.md` and `README.md`.

**Step 33.** Append the result to `LOOP.md`:

```markdown
## Result
`bun cli.ts bench 3 --candidate … --json bench.json`
<the summary block, verbatim>

## Notes
<what you could guess from the frames and what you could not; anything
docs/AUTHORING.md should have said and did not>
```

**Step 34.** Write `bench/runs/<YYYY-MM-DD>-rung3-1/README.md`. It is the run's own
account of itself, and it must contain, in this order:

1. A header block with: **date**, **model** (your own model name and harness —
   honestly), **profile** (`spine`), and **clean or bench-assisted**.
2. **Inputs** — a list of every file and directory you read.
3. A statement of what you did **not** read, naming `examples/*/export/`,
   `bench/transcriptions/`, `docs/LADDER.md`, `docs/SPEC_COVERAGE.md`, the two
   earlier rung-3 run directories, and git history. If you read any of them, say
   so here instead.
4. **Files** — what is in the directory.
5. **The measures** — the `bench` summary block **verbatim**, and the `check`
   figures: the framing fit line, the MAE means (both the union figure and the
   line beneath it over the reference's own drawn pixels), the worst slot drift
   with the slot name and frame, and the per-chain table.
6. **The reading** — what you think the measures say, and what is known-wrong.

**Step 35.** Confirm the run directory contains all six of these, and list them:

```
<name>.rig.json
<name>.motion.json
spine/skeleton.json
spine/skeleton.atlas
LOOP.md
README.md
bench.json
```

**Do not commit, push, or open a pull request.** Leave the files in the worktree
and report.

---

## What to report back

Report these, and nothing you cannot show output for:

1. **T0** — passed or failed, and the last line of `rigc validate spine`.
2. **T1** — passed or failed, plus both of your spec files.
3. **T2** — passed or failed, plus:
   - the absolute path of your run directory;
   - the `bench 3` summary block, verbatim;
   - the `check` figures listed in step 34 item 5;
   - how many build iterations it took before the first green build;
   - **clean or bench-assisted**;
   - **your model name**, as you wrote it in the run record;
   - anything you read that is on the forbidden list, or an explicit statement
     that you read none of it.

--- END PROMPT ---
