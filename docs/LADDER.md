# The benchmark ladder

**Live status document.** The rung order, what each rung gates on, how a rung is
scored, and where each one stands today. The survey behind it is
[SPEC_COVERAGE.md](SPEC_COVERAGE.md) — that document is a dated research note and
does not move; this one does.

The corpus is Spine's own official example projects, fetched by
`bun run fetch-examples` into a gitignored `examples/`. They are not
redistributed here; see [NOTICE.md](../NOTICE.md) and §*Licence, per rung* below.

---

## The order

The rungs are **not** attempted in the order their directories are numbered. The
order below is the one the owner fixed:

> **B1 – B3 → rung 3 → 1 · 2 · 4 · 5 → 6 → 8 → 7 → spineboy**

Three things follow from that ordering and each is a reason, not a preference:

- **Rung 3 first.** `3-timing-and-spacing` is the smallest skeleton in the whole
  corpus — 3 bones, 2 slots, 2 animations, no constraints, no meshes — and it
  needs nothing that rungs 1 and 2 do not also need. It is the rung on which
  "can rigc express a foreign skeleton at all" is answered with the least noise
  around the answer.
- **8 before 7.** Rung 8 introduces nothing that rung 6 did not (transform
  constraints, weighted meshes). Rung 7 introduces physics timelines, a keyed
  transform timeline and deform all at once — it is the hardest rung below
  spineboy, and it is also the one with the licence problem below.
- **spineboy last, as the graduation exam.** It is the only rung with IK, events,
  bounding boxes, clipping and unweighted meshes, and it is an order of magnitude
  larger than anything under it.

### Blockers, before rung 1

| # | Blocker | State |
| --- | --- | --- |
| **B1** | **The bone tree is code.** `src/archetype.ts` hard-codes three archetypes; a slot outside the archetype's table is a compile error, and no example fits any of them. rigc needs skeleton-as-data — bones with explicit names, parents and transforms — before any rung is reachable. | 🟥 **open** — the next unit of work |
| **B2** | **A16 rejected every example.** `/^4\.3(\.\d+)?$/` failed on the `"4.3.75-beta"` that all twelve example exports declare. | ✅ fixed — A16 accepts `4.3`, `4.3.N` and `4.3.N-<suffix>`; 4.2.x and 5.x still rejected, with a control for each direction |
| **B3** | **The atlas model is one-part-per-page.** rigc emits `bounds: 0,0,w,h` per page and A06 demanded every region cover its page exactly; every example ships a packed atlas (13–50 regions on one page, some rotated). | 🟨 **half done** — the validator half is fixed: A06's full-page/rotation/pma clauses, A08's name-identity clause and A27 now live behind `--profile`, so a packed atlas passes `--profile spine`. The emitter half is untouched: rigc still has **no packer and no importer** for a pre-packed atlas, so reproducing a rung means supplying the example's own atlas alongside the candidate |

---

## How a rung is scored

**Stage 1 — validity.** `bench` runs `validate --profile spine` on the candidate.
This is the only part with a pass/fail: a candidate that is not valid Spine 4.3
has not cleared anything. The `spine-html` profile is deliberately *not* used —
the thing being reproduced is an editor export, and this project's renderer
policy would fail rungs for reasons the rung is not about.

**Stage 2 — structural diff.** `bench` then runs `rigc diff` against the rung's
reference export and prints a ratio per measure across six sections: bones,
slots, attachments, constraints, animations, events.

There is **no rung score.** Section figures are unweighted means of the measures
printed beneath them and are labelled as such; nothing combines the sections. A
single number cannot distinguish a rig with the right skeleton and the wrong
timing from a rig with the right timing and the wrong skeleton, and those call
for opposite fixes. **A rung is marked cleared by a person reading the measures,
and this file is where that judgement is written down.**

**Stage 3 — per-frame pose distance. Named, not built.** The structural diff
compares what the file *says*; it cannot see that two structurally identical rigs
pose differently. The measure for that is **per-frame bone world-transform
distance**: step both skeletons through the same animation at a fixed rate and
compare each bone's world position, rotation and scale frame by frame. It needs a
bone correspondence (a candidate is free to use its own names, so the mapping is
an input, not a derivation) and a distance normalised by skeleton size. **None of
it exists.** Do not report a per-frame figure until it does.

### The honesty rule

⭐ **The authoring agent gets `images/` and a text brief. It does not get the
reference JSON.**

The reference export is read by `bench`, and by nothing else. An agent that has
seen the answer is not being measured on authoring a rig; it is being measured on
transcription, and the resulting number would be worthless in exactly the way
that is hardest to notice afterwards. This applies to the reference's derived
facts too — bone names, key times, curve handles — however they reach the agent.

Practically:

- The brief may describe the shot in the terms a human animator would be given:
  what moves, roughly when, what the principle being demonstrated is.
- The brief may state the atlas, because rigc has no packer (B3) and the atlas is
  a supplied input rather than something the agent authors.
- The brief may **not** carry bone counts, hierarchy, timeline listings, key
  counts, durations or curve data taken from the reference.
- A rung attempted with the reference in context is recorded as such, or not
  recorded at all.

---

## Status

⬜ not attempted · 🟨 attempted, not cleared · ✅ cleared

| Order | Rung | Example | Skeletons | New at this rung | Status |
| ---: | --- | --- | --- | --- | :---: |
| — | **B1** | — | — | skeleton-as-data input model | 🟥 open |
| — | **B2** | — | — | A16 accepts pre-release labels | ✅ |
| — | **B3** | — | — | packed-atlas handling (validator half done) | 🟨 |
| 1 | **3** | `3-timing-and-spacing` | `ess` | nothing — smallest skeleton in the corpus | ⬜ |
| 2 | **1** | `1-weight-and-mass` | `balls`, `drop` | `translatex`/`translatey`/`shear`; bone setup `length`; a skeleton with **zero** animations (`drop`) | ⬜ |
| 3 | **2** | `2-the-12-principles` | `ess` | slot `blend` (4 additive + 4 multiply); bone `inherit` ≠ Normal | ⬜ |
| 4 | **4** | `4-wave-principle` | `ess` | nothing structural — a volume test (9 bones, 9 slots, 3 animations, 470 bezier keys) | ⬜ |
| 5 | **5** | `5-squash-and-stretch` | `ess` | **`drawOrder` timeline**; `inherit: onlyTranslation`; non-unit setup scale | ⬜ |
| 6 | **6** | `6-arcs` | `pro` | **transform constraints** (static); **weighted meshes from authored geometry**; mesh `edges` | ⬜ |
| 7 | **8** | `8-follow-through` | `ball`, `pendulum` | nothing — both features arrived at rung 6 | ⬜ |
| 8 | **7** | `7-anticipation` | `sack-pro` | **physics timelines**; a **keyed** transform timeline; **deform**; 20 physics constraints | ⬜ |
| 9 | **spineboy** | `spineboy` | `ess` (+ `pro`, stretch) | **IK**, **events**, **bounding box**, **clipping**, **unweighted meshes**, and scale (67 bones, 52 slots, 11 animations) | ⬜ |

Two facts the table does not repeat, both from SPEC_COVERAGE part 3:

- **No rung uses a named skin.** All twelve example skeletons have exactly one
  skin, called `default`. Named skins, per-skin bones and per-skin constraint
  lists are not on this ladder at all and need some other justification to be
  scheduled.
- **Path constraints, sliders, sequences, linked meshes, dark colour and
  `drawOrderFolder` never appear** anywhere in the corpus. The validator walks
  their timelines (A05 covers all eleven groups) but the ladder will not exercise
  them.

### What passes today

Every one of the twelve example skeletons passes `validate --profile spine`
unmodified — they are editor output, and that is the result the profile split was
supposed to produce. That is a statement about the **validator**, not about rigc's
compiler: nothing on this ladder has been *authored* yet, because B1 is open.

---

## Licence, per rung

The examples are Esoteric Software's. Their `license.txt` grants image
redistribution **only when accompanied by that file**, and **never for commercial
use**; the project files and exports are public domain.

🚫 **Rung 7 (`7-anticipation`) has no `license.txt` upstream at all.** Its images
are covered by no explicit grant, so:

- Measure against it — reading a file is not redistribution.
- **Never vendor, commit, publish or ship its images**, and never include them in
  a released artefact of any kind.
- `scripts/fetch-examples.sh` names it in its closing warning for this reason.

`examples/` is gitignored for the whole corpus, which keeps the general case
right by construction; rung 7 is the case where a one-off "just this once" copy
would be a licence problem rather than a tidiness problem.

---

## Running a rung

```bash
bun run fetch-examples                 # once; examples/ is gitignored
bun cli.ts bench 3 --candidate path/to/candidate/spine
bun cli.ts bench 3 --candidate candidate.json --atlas some.atlas --json report.json
```

`bench <rung>` takes `1 … 8` or `spineboy`. Rungs 1 and 8 carry two skeletons and
both are benched and reported. `spineboy-pro` is reported as a **stretch** figure
and does not count towards the rung: it is a harder rig than the graduation exam,
and folding it in would make the exam unpassable for a reason unrelated to
passing it.

`bench` exits non-zero only when stage 1 fails. The diff has no threshold, so it
cannot fail — read it.
