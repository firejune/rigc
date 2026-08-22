# Rung 2 — `2-the-12-principles`, attempt 1 (2026-08-23)

One skeleton, four ~25.8 s animations, authored from contact sheets and loose art.

| | |
| --- | --- |
| Rung | 2, `bench/briefs/2-the-12-principles.md` |
| Model | Claude Opus 5 (1M context), Claude Code / Agent SDK |
| Profile | `spine` |
| Run | **clean** — `bench 2` ran once, after the final edit to either spec, and nothing was changed after reading it |
| Build iterations | **1** (green on the first compile) |

## Inputs

- `bench/briefs/2-the-12-principles.md`
- `docs/AUTHORING.md`, including §8, read before measuring
- `bench/runs/README.md`
- `examples/2-the-12-principles/images/` — 15 loose PNGs
- `bench/reference/2-the-12-principles/` — 4 contact sheets (311 tiles each) + 8 stills

Not read: `examples/*/export/`, `bench/transcriptions/`, `docs/SPEC_COVERAGE.md`,
`docs/LADDER.md`, `docs/feature_matrix.*`, `bench/count_features.ts`,
`bench/render_reference.ts`, git history. No web search. Tool sources read while
authoring: `src/diff.ts`, `src/types.ts`, and `tools/contact.ts` (opened by mistake —
it is the contact-*depth* tool, not the sheet builder, and says nothing about this rung).

## Files

| File | What |
| --- | --- |
| `the-12-principles.rig.json` | 7 bones, 8 slots, 15 region attachments, one `default` skin |
| `the-12-principles.motion.json` | 4 animations, 7 timelines each |
| `spine/` | the compiled candidate — `skeleton.json` + `skeleton.atlas` + 15 pages |
| `LOOP.md` | the loop, and every measurement mistake made on the way |
| `bench.json` | `bench 2 --json` |

## Gate

```
validate   green  (profile spine)
17 PASS · 0 FAIL · 1 SKIP (A31: no drawOrder timeline) · 14 PROF (7 renderer, 7 archetype)
pages=15 regions=15 bones=7 slots=8 animations=4 version=4.3.13
```

## Measures

```
ess  bones=0.408  slots=0.288  attachments=0.805  constraints=1.000  animations=0.622  events=1.000
     bones=7/12  slots=8/17  skins=1/1  attachments=15/17  constraints=0/0  animations=4/4  events=0/0
```

### Reading them

**What the frames gave up, and the rig got right.** Everything that is a fact about
*the shot rather than the file* landed: four animations, named right (`animations.count`
and `animations.names` both 1.000), no events, no constraints, no deform and no
draw-order timeline anywhere (1.000 each), one skin called `default` (1.000), and 15 of
17 attachments (`attachments.count` 0.882, `type_counts` 0.882 — all regions, no
meshes). `attachments` at 0.805 is the section where a rig built from pictures can
actually agree with one built from the art, and it mostly does.

**Naming was half right, in an informative way.** Exactly five slot names and five
skin/slot/attachment keys matched — almost certainly `obstacle-course`, `water`,
`platform`, `ring-big`, `ring-small`, each named after its PNG. So the convention I
guessed (slot = image basename, placeholder = image basename) is the reference's
convention; I simply stopped applying it at the balls. Note that `slots.blend`,
`slots.color_present` and `attachments.region_size_present` are all 5/17 as well: they
are name-matched measures, so they cannot exceed the five names that matched. They are
reporting the naming gap a second time, not three further disagreements.

**The one structural bet I got wrong, and it cost the most.** The reference has **17
slots and 17 attachments**; I wrote 8 slots and 15 attachments. Seventeen slots against
fifteen images means one slot per image *plus two images used twice* — which is the
brief's "three rings on screen, two ring PNGs, so at least one is used twice", a claim
I overruled after finding a third ring painted into `obstacle-course.png`. (That ring
really is painted in — it never moves and both light balls come to rest in its bowl. So
the reference apparently places ring attachments over or beside it as well.) And instead
of one slot per image I collapsed the four ball variants into three shared slots
(`ball` / `lambertian` / `specular`) with the variants as swapped attachments. That is a
defensible rig; it is not this one, and it moved `slots.count`, `names`, `order`, `bone`
and `attachment` all at once — the slots section, 0.288, is essentially this single
decision. It also explains `bones` 7/12: ten per-image ball slots want more bones than
three shared ones do.

**The animation section is two very different numbers.** Its structural half is perfect
(count, names, draw_order, deform, event_keys all 1.000). Its *density* half is not:
`timeline_kinds` 0.333 (18 timelines per animation in the reference, 7 in mine) and
`key_counts` 0.088 — about 340 keys per animation against my 30. That gap is not a
measurement error I could have closed by measuring harder. Two thirds of it is
structural (more bones keyed ⇒ more timelines), and the rest is that the reference is
keyed at something close to per-frame density on a 25.8 s shot while I keyed only at the
extrema I could actually locate on a 64 × 57 tile where the smaller balls are 2½ px
across. A tracker on those tiles cannot resolve a key that changes the ball's position
by less than about 28 world units; the reference has many such keys and the sheets do
not contain them.

**`animations.duration` 0.000 is the sharpest single finding.** All four of my
animations declare 25.8333 s — 310/12, the exact span the 311 rendered frames cover —
and all four are outside the one-frame tolerance. So the reference's *last key time* is
not the render span. The frames cannot tell you this: a renderer sampling 311 frames at
12 fps from t=0 looks identical whether the skeleton's last key is at 25.83 s or a
little past it. It is the clearest example in this run of a fact that lives only in the
file, and the brief was right not to leak it.

**What a person should take from this run.** Validity was never in question — the gate
went green on the first compile and never had a correction to offer, which means this
attempt measured *frame reading*, not *validator reading*. Read the sections in two
groups: `attachments`, `constraints`, `events` and the structural half of `animations`
say the shot was read correctly; `slots`, `bones` and the density half of `animations`
say the rig was *shaped* differently — one slot per image versus shared slots, and dense
keying versus extrema. Those are not the same kind of miss, and only the first group was
ever visible in the pictures.
