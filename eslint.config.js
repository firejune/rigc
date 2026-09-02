/**
 * One rule, on purpose.
 *
 * CLAUDE.md has said "no `any`, no `as any`, in `src/` or `cli.ts`" since this
 * repository was split out, and until now nothing checked it. A rule that only
 * a reader enforces is a convention; this makes it a gate.
 *
 * It is deliberately not `typescript-eslint`'s recommended set. That set would
 * arrive with a few hundred findings across code nobody is refactoring today,
 * and a lint run that is red on arrival teaches everyone to run it with their
 * eyes closed. Add rules when somebody is prepared to fix what they find.
 *
 * `selftest.ts` is the one file that is *supposed* to write `any`: its mutants
 * forge malformed skeleton JSON on purpose, so it turns the rule off around the
 * mutant tables and back on after. Those `eslint-disable` comments have been in
 * the file since before there was an eslint to read them — this is what makes
 * them mean something, and what makes the scope of the exemption checkable
 * rather than a claim in a comment.
 */
import tseslint from 'typescript-eslint';

export default [
  {
    // `bench/runs/**` mirrors tsconfig.json's exclude (issue #201) — a run's
    // committed tooling is a frozen record, checked when written and archived
    // thereafter, not part of the repo-wide gate. See that comment for the rule.
    ignores: ['node_modules/**', 'examples/**', 'bench/reference/**', 'bench/runs/**'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];
