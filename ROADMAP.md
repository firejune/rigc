# Roadmap to 1.0

Rough, and deliberately so. No dates, no feature list.

## What this is for

**Rigging and animation produced by an AI, with no human hands.** That is the
end state. Everything below is either a step toward it or a way of knowing
whether a step worked.

Spine is **one tool this supports, not what this is.** rigc links `spine-core`
today for a narrower reason than allegiance to a format: everything written to
disk has to have been read back by a parser rigc did not write, and that is
the only thing making the output trustworthy. That is an **oracle, not a
dependency**, and the distinction is the whole difference between a backend and
a commitment. Another backend does not need permission — it needs its own
oracle, and shipping one without that is the thing the doctrine refuses.

### Where the machine is better, which is the whole bet

Three places, and they are not chosen for being hard — they are chosen for
being **the places a hand is the wrong instrument**:

- **Vertex work.** Geometry dense enough that posing it by hand is not slow, it
  is impossible.
- **Jiggle tension.** How a soft region answers an impulse, as a property of
  the region rather than a curve somebody drew.
- **2.5D look and feel.** Turning a flat drawing through an angle it was never
  drawn at, from a depth the art carries.

⭐ **The line that makes this checkable is posing.** Writing the brief is not a
hand. Choosing the art is not a hand. *Making a pose* is. Every neighbouring
tool has a person making poses somewhere — key forms, key poses — and this one
is trying not to, at any layer. That is a claim a run can be measured against
rather than a slogan.

⚠️ None of the three is proven end-to-end yet, and the honest statement of
where each stands belongs with the first goal below rather than here. Two of
them are additionally blocked by something outside the compiler: at the density
that makes vertex work worth doing, a deform key is megabytes, which the
current backend cannot carry. **The differentiator and the oracle question are
the same question**, which is the strongest argument for the sequencing there
is.

⚠️ One consequence worth stating, because an earlier framing said the opposite:
the goal is not an AI draft that a person then finishes by hand. A round trip
through the editor is how a result gets **checked**, not where it gets
finished. Where a face angle became a value rather than a moment on a
timeline, that was the direction — nobody keys it.

## What changes the frame

Today `spine-core` is the oracle, and that is **a fact about the code, not a
preference**: nothing rigc writes is trusted until a parser rigc did not write
has read it back. So a sentence that treats Spine as already optional is ahead
of the code rather than describing it, and the benchmark ladder — Spine's own
example projects, art this project did not author and answers it cannot tune
to — is an oracle in exactly the same sense. Neither is deference. Both are
the only independent check there is right now.

The frame changes at one moment: **when this project's own core can be its own
oracle.** Not when a second backend can emit — emitting is the easy half, and
output nobody can check is worth nothing. When there is an independent check on
the core's own format, Spine becomes one backend among several *as a fact*
rather than as an intent.

⇒ **The milestone is not the second backend. It is the second oracle.** That is
the long-term feature's real content, and it is why the sequencing puts it
after the rest rather than beside it.

⭐ And *after*, not *beside*, for a second reason: **the three bets are the
input to the format question, not a detour around it.** Proving 2.5D on real
art is exactly the experiment that asks whether a deform should be stored as
offsets or evaluated from a depth and an angle, and jiggle asks the same thing
of an impulse response. Starting a format before those answers arrive would be
designing a container for contents nobody has measured — and running both
tracks at once would only mean guessing in two places instead of one.

## The road so far

Rough too, and in order rather than by date. [LADDER.md](docs/LADDER.md) and
the [CHANGELOG](CHANGELOG.md) hold what actually happened.

- **Split out of a game project's sandbox.** The first commit is a rig compiler
  v0 carved off a working project. The split moved the cut-specific *files* out
  and left the *code* still knowing about one set of art; closing that took its
  own pass, and the rule it left behind is that anything only a person who has
  seen that art could understand belongs with the consumer.
- **The ladder.** Spine's own numbered example projects, taken as a difficulty
  ladder with spineboy as the graduation exam. All of it cleared, and the rungs
  stay in place as regression gates rather than being retired.
- **The gate was put under the gate.** A rung's pass was withdrawn when a
  tolerance change moved the box a set is measured in, then restored after the
  gate answered the two questions that exposed. The instrument being measurable
  by something other than itself is the part worth keeping.
- **Published, and packaged for an agent.** A registry package with an
  allowlist rather than the whole tree, and the authoring guide shipped inside
  it, because the tool's user is something that reads documentation at runtime.
- **A gallery, and films of it.** Worked examples built to be read, and short
  films assembled from them. Making them was the best defect-finder the project
  has had — most of the examples found a real bug on their first build.
- **The face.** Depth input, the fold angle a depth map can support, and Spine's
  own `slider`, which turns a face angle into a **value** instead of a moment on
  a timeline. The object offers a dial; the consumer decides when to turn it.
- **Currency.** Gates pointed at the repository's own claims — its counts, its
  quoted output, the transcripts in its documentation — after several of them
  were found stale in a row. That work is the third goal below, still open.

## What 1.0 means here

**The input spec stops moving.**

Everything else about a version number is bookkeeping; that one thing is a
promise to whoever writes a rig spec — and it is the promise that survives the
goal above, because the rig and motion specs are the part that does not belong
to any one backend. A format can be swapped under a spec that holds still. It
cannot be swapped under one that does not. Today it costs nothing to break — the
package is pre-1.0, so a spec change is a minor bump and nobody pays. After
1.0 the author pays, so the number should not be claimed until the surface has
earned it.

⛔ **This file does not set direction.** Direction comes from what users hit,
not from what this repository predicts, and the standing rule against a
prediction-driven roadmap is not suspended by writing one down. What follows
is a list of **conditions that have to become true** before the promise above
can honestly be made — not work booked in advance.

## The goals

### Real art has used the new surface

Every construct added recently — depth input, the turn ceiling, sliders,
parameter-driven faces — is measured only against generated fixtures. A
registered cuts run comes back green and touches none of them, because the
cuts predate them. A spec frozen at 1.0 that real art has never exercised is a
prediction, not a measurement.

**Done when** each construct has at least one cut of real art compiling
through it, and each of the three bets above has a run behind it with **no
hand-made pose at any layer**.

Where they stand, stated rather than implied:

- **Vertex work** — the gate holds at densities far past what a hand reaches,
  and the artifact does not: at that density a deform key is megabytes. The
  compiler is not the limit; the backend is.
- **Jiggle tension** — emitted and gated for *structure*. Nothing yet measures
  whether a jiggle is **right**, and a gate that cannot fail on a wrong one is
  not a gate.
- **2.5D** — the angle a depth map supports is derived in closed form and
  reported before anything is animated. On measured depth, though, **noise is
  also a slope**, so the reported angle could be set by sampling rather than by
  shape. Unverified.

⭐ **"Real art" has a specific meaning, and it is not this repository's own
fixtures or anyone's back catalogue.** A project is waiting on rigc to become
usable before it starts, and its art is what this goal is about. That is also
what makes the first goal gate the second: a spec cannot be declared finished
against art chosen after the fact to fit it.

This gates the next goal and is the reason the order is what it is.

### The spec has stopped growing on its own initiative

The input surface still grows most weeks, and it grows because this repository
is exploring, not because an author asked for something and could not express
it.

**Done when** changes to the rig and motion specs come from a need somebody
reported, over enough consecutive releases to be a pattern rather than a lull.

### Every claim the repository makes about itself is derived

A version that says *this documentation is true* cannot keep any claim a human
maintains by hand. Counts, quoted transcripts, coverage figures, invisible
markers: each is a place the tool and the page can part in silence.

**Done when** nothing load-bearing is hand-maintained, and the derivations
themselves are asserted — a scanner that stops matching goes quiet, not red.

### The published package works on a machine that has never seen this repo

The tree can be green while the installed package throws, because the package
is an allowlist and the repository is not. Nothing in the tree fails when a
module is added and not listed.

**Done when** installing from the registry and running a build is checked
mechanically, every release.

## Not in 1.0

- **A second oracle, and the backend behind it.** Not because Spine is the
  point — it is not — but because the sequencing was ruled: the feature work
  first, the core split after. See *What changes the frame*: the emitting is
  the easy half.
- **Full coverage of the Spine 4.3 format.** 1.0 is not *everything works*, it
  is **the boundary is honest and stable**: what rigc emits, it emits
  correctly, and what it does not, it refuses by name. Coverage follows from
  what authors need to express — it is not a direction of its own, and a
  construct nobody has asked for is not a gap.
- **Rewriting the dated research notes.** A note stamped with the day it was
  measured is doing its job; making it current would make it a live claim, and
  live claims have to be derived.
