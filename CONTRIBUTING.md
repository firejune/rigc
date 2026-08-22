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
fixtures. If you have not run `bun run fetch-examples`, two of its suites will
report a hole rather than a result; fetch the corpus before trusting a green.

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
  spine-core having parsed them. That is a structural invariant for two
  independent reasons, correctness and licensing; [CLAUDE.md](CLAUDE.md) sets both
  out and [NOTICE.md](NOTICE.md) has the licence chain.
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

## Commits

[Conventional Commits](https://www.conventionalcommits.org/) with a scope —
`feat(compile):`, `fix(validate):`, `test(selftest):`, `docs(authoring):`. Subject
and body in English. The subject line is what release-please reads to decide the
next version and what lands in the changelog, so write it for the person reading
`CHANGELOG.md` six months from now: `feat` bumps the minor, `fix` and `perf` bump
the patch, and everything else is invisible to the release. See
[RELEASING.md](RELEASING.md).

Keep one unit of work per commit. A body that has to explain two unrelated things
is two commits.

## Things that are decided

Not to shut down discussion, but so nobody spends an afternoon on a patch that was
already weighed:

- **rigc is complementary to the Spine editor, not a substitute for it.** A
  compiled rig is a starting point on a timeline that a human refines. Changes
  that push it toward being a way around an editor licence are out of scope.
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
