/**
 * The profiles a gate judges under, the one the CLI uses when `--profile` is
 * absent, and the printer of a gate's report — moved here unchanged from
 * `src/validate.ts` (issue #1060), which re-exports all three: the entry that
 * links none of spine-core gates a build on the model side
 * (`./model/index.ts`) and prints its report with the same printer, and
 * `src/validate.ts` links the runtime. Nothing here links it.
 */
import type { AssertionProfile } from './kinds.ts';
import type { VerdictLists } from './harness.ts';

export const VALIDATE_PROFILES: readonly AssertionProfile[] = ['spine', 'spine-html'];

/**
 * What the CLI uses when `--profile` is absent — and ONLY the CLI. This is not
 * `validate()`'s default; that function has none (`ValidateProfile` in
 * `src/validate.ts` says why).
 *
 * `spine` since issue #221. The published package's pitch is "the output imports
 * into the Spine editor", which is exactly the question `spine` asks, and a
 * stranger's first build was being judged instead against one renderer's policy
 * and one project's canvas budget — 14 rules they have no stake in, with the
 * escape hatch documented only in prose. Defaults beat prose. `spine-html` is
 * still one flag away, and every report names the profile that judged it.
 */
export const CLI_DEFAULT_PROFILE: AssertionProfile = 'spine';

export function reportLines(report: VerdictLists & { profile: AssertionProfile }): string[] {
  const lines: string[] = [];
  // The profile goes FIRST and names what it left out. A report that says
  // "green" without saying which rulebook produced it is the one thing this
  // switch could make worse than no switch: `--profile spine` green means
  // "valid Spine", never "passes the renderer policy".
  const renderer = report.profileSkipped.filter((p) => p.kind === 'renderer').length;
  const archetype = report.profileSkipped.filter((p) => p.kind === 'archetype').length;
  lines.push(
    report.profileSkipped.length === 0
      ? `  ..    profile ${report.profile} — every assertion applies`
      : `  ..    profile ${report.profile} — ${renderer} renderer-policy and ${archetype} archetype assertion(s) do not apply`,
  );
  for (const name of report.passed) lines.push(`  PASS  ${name}`);
  for (const s of report.skipped) lines.push(`  SKIP  ${s.assertion}: ${s.reason}`);
  for (const p of report.profileSkipped) lines.push(`  PROF  ${p.assertion}: ${p.kind} rule, not in profile "${report.profile}"`);
  for (const f of report.failures) lines.push(`  FAIL  ${f.assertion}: ${f.detail}`);
  // How many of them MEASURED anything, which is the figure the rows above do
  // not hand a reader (issue #568). Counting `PASS` lines answers a different
  // question — before the sweep that closed #568 a run could print seven of
  // them over a candidate on which five rules had not executed at all.
  //
  // ⚠️ Every figure here is a count of ASSERTIONS and not of rows, which is why
  // the failed side is a Set: `fail()` is called once per finding, so one
  // assertion can print six `FAIL` lines, and a line-count would report 47 of
  // 42. The four buckets partition `ASSERTION_NAMES`, so the total is derived
  // by adding them rather than stated — a `42` written here would be the one
  // number in the report that no run could contradict.
  const failed = new Set(report.failures.map((f) => f.assertion));
  const measured = report.passed.length + failed.size;
  const total = measured + report.skipped.length + report.profileSkipped.length;
  lines.push(
    `  ..    ${total} assertions: ${measured} measured (${report.passed.length} passed, ${failed.size} failed), ` +
      `${report.skipped.length} skipped, ${report.profileSkipped.length} not in profile "${report.profile}"`,
  );
  return lines;
}
