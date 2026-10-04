# Contributing

Thanks for looking. rigc is small and opinionated, and most of the opinions are
written down — [CLAUDE.md](CLAUDE.md) is the doctrine, and it is worth ten minutes
before a first patch.

## Issues are the ledger

Open an issue before a substantial change. Not for ceremony: this project keeps
its open questions in issues rather than in a backlog file, so an issue is where a
decision gets its reasons attached and where the next reader finds them.

A good issue for a defect names three things:

1. what you gave rigc — the rig spec, the motion spec, the manifest if there was
   one, or the smallest edit to a fixture in [`fixtures/`](fixtures/public.ts) that
   reproduces it;
2. what it printed, verbatim, including the assertion name;
3. what you expected instead.

⚠️ **A wrong artifact that validates green is the most valuable report there is.**
The whole tool exists because Spine's parser accepts a great deal of wrongness in
silence, so "rigc said green and the result is broken" is a bug in rigc even when
every assertion behaved as written.

## Before you open a pull request

Three commands, all of them fast, and CI runs the same three:

```bash
bun run typecheck    # bunx tsc --noEmit
bun run lint         # one rule: @typescript-eslint/no-explicit-any, as an error
bun run selftest     # the validator's own negative controls
```

`bun run selftest` needs no arguments and no assets — it generates its own
fixtures. A build of a generated fixture or probe lands inside that fixture's
own directory, never in a temp directory beside it: a page name is the art's
path seen from the atlas, so a build from beside it would write a temp
directory's random name into the pair and its document, and the same inputs
would count as a different build in every process that built them (`TY36`
reads every recorded build for that name). If you have not run `bun run fetch-examples`, the suites that read the
corpus will report a hole rather than a result — `TY20` prints them by name, so
the run says which — and a run where nothing substantive executed exits 2 rather
than printing green. That includes the core suite's corpus half: a control there
whose only unmet probe needs a corpus row prints a hole when the corpus is
absent and a FAIL when it is on disk and reaches nothing, and `TY22` holds the
two apart. Fetch the corpus before trusting a green. While iterating
on one suite, `bun selftest.ts --only <suite>[,<suite>…]` runs just those and
exits 2 naming every suite it skipped — it is never a verdict, so run the whole
`bun run selftest` before you open a pull request.

The whole run can also be cut into shards and merged, which is how CI runs it:
`bun selftest.ts --shard <i>/<n> --tally-out <file>` runs the suites dealt to
shard `i` and writes what it ran, exiting 2 when green like `--only`. The deal
is longest-first over the per-suite seconds in `tools/selftest_shards.base.json`
— each suite, heaviest first, to the shard holding the least so far — and a
suite the base has no entry for is dealt round-robin by its registration index.
`bun selftest.ts --merge <file>…` over every shard's document refuses by name a
set that is not one run's shards each once (including shards that were dealt
two different ways), runs the three suites that read the whole run, and prints
the full run's summary and verdict; add `--shards-base [<file>]` and a green
merge writes the base again from its own seconds (to `<file>`, or over the
tracked base when none is named). CI's merge writes it and uploads it as the
`selftest-shards-base` artifact, which is where the tracked base comes from.
Never edit the base by hand.
`RIGC_SHARD` and `RIGC_TALLY_OUT` name the same two values through the
environment. CI's `shard` jobs are the six shards side by side and its `test`
job is the merge. On a machine you share, run the shards one after another, not
together: each is a whole process with its own memory high-water.

Inside a suite, independent units run concurrently: `render-hashes`' eight
`render_hashes.ts` runs and two batches of its CLI runs, `packer`'s packs by
set, and `core`'s posing-heavy controls, which `--jobs` workers share. `--jobs
<n>` (or `RIGC_JOBS`) is how many run at once; the default is the machine's
cores, and `--jobs 1` runs them one after another as the run did before the
flag. The printed log is the same text at any `--jobs`. On a machine you share,
pass `--jobs 2`.

The run's memory is read in two places. Each suite's line ends with the
process's RSS, its change across the suite, and the heap and external buffers
after a forced collection; a suite that ran units adds `children high-water
<MB> MB (<unit>)` — the largest peak of any child process it started, as the
driver read it, and which unit that was (a `core` worker is named for the unit
it was running when its peak was reached). The `--jobs 1` path reads no child's
peak, so there the line says nothing about children. The unit of a child's
`maxRSS` is read through the call that reads it: each driver first runs one
`bun -e` child that holds 64 MiB and decides bytes or KiB from what
`Bun.spawn`'s `resourceUsage()` reports for it (`TY42` holds a known 256 MiB
child to that reading), and a calibration that reads neither leaves every
peak unread, with the reason in `RIGC_UNIT_PEAKS`. Both figures are held
under `tools/selftest_memory.base.json`, one entry per platform: the parent's
high-water (`TY26`, and the full run after its tables) and the children's
high-water with the `--jobs` it was read at (`TY40`), each times the same
margin. A platform with no entry, or no children's figure, is a `SKIP` naming
the command that writes one: `bun selftest.ts --memory-base` on a green full
run at `--jobs 2` or more writes both numbers. Never type them. A shard holds
its own figures and the merge holds every shard's. The children's figure has a
second writer, because a child's peak is its own process's whichever shard
started it: `bun selftest.ts --merge <file>… --memory-base-children [<file>]`
writes only the children's half of its platform's entry — the largest over the
shard documents, at the `--jobs` they ran at, which every shard that measured a
child must agree on — and leaves the parent's high-water, which only a
one-process run can read (`--memory-base` under `--merge` stays refused). The
darwin entry is written by `--memory-base` on a laptop; the linux entry's
children's figure by CI's merge, which uploads it as the `selftest-memory-base`
artifact, and the tracked linux figure is committed from that artifact, as the
durations base is from `selftest-shards-base`. Neither writer takes the run's
children's figure as measured: one run's largest child is not the figure (which
units a `core` worker claims is decided by timing, and CI read 506 to 720 MB on
the same code), so both write the larger of the tracked figure and the run's,
and their line says which — `kept 547 MB (this run 506 MB) at --jobs 4`,
`raised 547 → 720 MB at --jobs 4`, or `wrote … (the base held no children's
figure)`. The figure ratcheted against is always the tracked file's entry, the
one the ceiling reads, never the file named after `--memory-base-children`,
which is overwritten unread. A run that measured no child keeps the tracked
figure. Lowering it is a deliberate act with its own spelling: add
`--reset-children-base` to either writer, and the line says `lowered 547 →
506 MB … (--reset-children-base)`. The same spelling is the only way to
replace a figure read at another `--jobs`, which is otherwise refused by name
rather than compared, because a figure is a reading at one `--jobs`. Without
either writer the spelling is refused, since it would write nothing. The
parent's high-water is still written as the one-process run measured it. The
ceiling holds the
largest child, not the sum alive at once, because the sum is a reading of
one schedule; the sum is at most `--jobs` times the largest. To read every
unit's figure, set `RIGC_UNIT_PEAKS=<file>`: one line per unit with its peak,
its seconds and when in its batch it started and ended, which is where the
overlap of a batch's children is read from.

A run leaves `tmpdir()` as it found it. Every directory a selftest process makes
lives under one `rigc-selftest-XXXXXX` root of its own, which the process
removes when it exits, green or red; a shard and a `--jobs` unit are processes
and remove their own (`TY39` counts what a run leaves). `--keep-temp` (or
`RIGC_KEEP_TEMP=1`) keeps the root to read and names it on stderr; any other
spelling is refused by name. A run killed by a signal leaves its root behind.

There is a fourth. It is fast — the whole battery was 9.4s on the machine it was
written on — but it is out of the list above because it is not offline: it
installs packages, so it needs a network:

```bash
bun run smoke        # pack, install into an empty directory, build a rig from the install
```

CI runs it too, in its own job. Reach for it before pushing anything that touches
`files` in `package.json`, `bin/`, a runtime `import` that crosses a directory,
or the dependency — those are the changes a green checkout cannot see, because
everything the tree runs is on disk and only what `files` names reaches the
registry. It needs `npm`, `bun` and `tar` on PATH and the network for exactly one
package, and its own three planted failures run beside the green case, so a run
that passes has watched the check fail three times first. RELEASING.md's *Whether
the tarball runs* is the argument.

## What a change has to clear

- **No `any`, no `as any`, in `src/` or `cli.ts`.** `selftest.ts` is the one
  exception and it is scoped: its mutants forge malformed skeleton JSON on
  purpose, so the rule is switched off around the mutant tables and back on after.
  The `eslint-disable` comments have to actually bracket every `any` in the file.
- **A new assertion needs a mutant.** A gate nobody has seen fail is not a gate,
  so every assertion needs a case in `selftest.ts` that makes it fire, and every
  suite needs a positive control. An assertion whose data is absent must report
  **SKIP** — never a pass. Folding vacuous checks into the pass count is how a
  gate comes to look kept while checking nothing.
- **No bypass of the round trip.** There must never be a `--no-validate` flag, an
  environment escape, or an exported API that hands back emitted artifacts without
  spine-core having parsed them. That is a structural invariant for one reason,
  correctness, and that reason is sufficient by itself; the licensing one was
  retired on 2026-09-05 (issue #398 — the bullet below records it).
  [CLAUDE.md](CLAUDE.md) sets the invariant out, and [NOTICE.md](NOTICE.md) has
  the licence chain, which is a fact about what the code links and stands
  whether or not the clause does.
- **The compiler never invents a value.** No defaults guessed from the art, no
  re-measuring of plates, no reasonable fallbacks. A missing number is a
  `CompileError` naming the field.
- **Nothing project-specific goes in.** If a comment, a default or an assertion
  can only be understood by someone who has seen one particular set of art, it
  belongs with that art and not here. Budgets and structural invariants come from
  the rig spec's `invariants` block; design notes live with the consumer.
- **Determinism is a contract.** `A18_DETERMINISTIC_EMIT` compares a second,
  independent compile byte for byte. Iteration over an unordered set, a timestamp,
  a locale-sensitive format or floating noise all break it, and that is the point.
- **An input format, an error message or an assertion changed?** Then
  [docs/AUTHORING.md](docs/AUTHORING.md) changed too. That guide and the
  validator's messages are the only interface an agent that cannot see the rig
  actually has.
- **A change that moves a gallery build's bytes on purpose regenerates the base
  in the same pull request.** `tools/emit_hashes.base.json` records, hash by
  hash, the Spine files every `gallery/<name>/` build writes (the skeleton and
  the atlas, which are the same bytes on every machine), and five selftest gates hold
  the tree to it on every run, CI included — so a moved build is red on your
  branch until the file moves with it, and `EH06` names the row, the file and the
  command. That command is `bun tools/emit_hashes.ts base`; run it, commit the
  file, and say in the pull request which rows changed and why
  (`bun tools/emit_hashes.ts base --check` prints them before you regenerate).
  The file is written by that command and never by hand: a copy whose hashes all
  agree but whose bytes do not is refused as stale too
  ([#930](https://github.com/firejune/rigc/issues/930)).

## Commits

[Conventional Commits](https://www.conventionalcommits.org/) with a scope —
`feat(compile):`, `fix(validate):`, `test(selftest):`, `docs(authoring):`. Subject
and body in English. The subject line is what release-please reads to decide the
next version and what lands in the changelog, so write it for the person reading
`CHANGELOG.md` six months from now: `feat` bumps the minor, `fix`, `perf` and
`check` bump the patch, and everything else is invisible to the release. See
[RELEASING.md](RELEASING.md).

⚠️ **A landing that changes a file inside the published package has to be
visible to the release.** The package is the `files` allowlist plus what npm
always adds — `npm pack --dry-run` prints it — and it contains seven guides under
`docs/`, so *a correction to a shipped guide changes what `npm install` hands
somebody*. The `ships` job in CI compares what your branch changed against that
list and refuses a landing the release cannot see. Its verdict is **not** that
your type is wrong: a doc correction really is a `docs` change, and what is
missing is that it also ships. Either remedy clears it — a type the changelog
shows, or a `Release-As:` footer in a **commit message on the branch**, since the
squash body is made of the commits and not of the pull request body. A change
that touches nothing in the package is unaffected whatever its type
([#516](https://github.com/firejune/rigc/issues/516)).

⚠️ **A control that leaves has to be named by the change that removes it.** The
`removals` job in CI reads the control names on your branch against the ones its
merge base carried, and every name that went has to be declared. What counts as
a declaration is derived per run rather than listed: the code's **first
segment** where that segment names one control in the base, and the **whole
name** where it names several — the job prints which, and prints the name it
wants. The remedy is that line: write the code it names **in a commit message on
this branch, or in the pull request title or body**. A rename takes the old name
out of the tree, so it is declared exactly like any other removal.

Keep one unit of work per commit. A body that has to explain two unrelated things
is two commits.

## Things that are decided

Not to shut down discussion, but so nobody spends an afternoon on a patch that was
already weighed:

- **Nothing rigc writes to disk goes unread by a parser rigc did not write.** No
  `--no-validate`, no `--emit-anyway`, no environment escape, no exported API that
  hands back artifacts with the round trip skipped — not for testing either. A
  patch that adds one will be declined whatever it is for; `CLAUDE.md` states the
  invariant and the reason.

  🗓️ This bullet used to read *"rigc is complementary to the Spine editor, not a
  substitute for it … Changes that push it toward being a way around an editor
  licence are out of scope."* Retired 2026-09-05 (issue #398): declaring a
  format-agnostic core with its own format and player (issue #380) makes that a
  promise the roadmap already contradicts, and a decided-questions list is the
  worst place to keep one. What is unchanged is the sentence above it and the
  fact under it — rigc links `spine-core`, so the Spine Runtimes License covers
  running it, which `NOTICE.md` states and this retirement does not touch.
- **`strict: false` with `strictNullChecks: true`** in `tsconfig.json`. Turning on
  the rest is a refactor, not a gate; `tsconfig.json` says so in place. Raise it
  when somebody is prepared to do that work.
- **One lint rule.** The recommended set would arrive with a few hundred findings
  across code nobody is refactoring today, and a lint run that is red on arrival
  teaches everyone to run it with their eyes closed. Add rules when somebody is
  prepared to fix what they find.

## Licence

Contributions are accepted under the MIT licence in [LICENSE](LICENSE). Note that
rigc links `spine-core`, so working on it — like shipping its output — falls under
the Spine Runtimes License and requires a Spine editor licence; [NOTICE.md](NOTICE.md)
sets out that chain in full.
