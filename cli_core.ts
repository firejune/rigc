#!/usr/bin/env bun
/**
 * rigc's second entry: the commands that reach nothing of spine-core (issue
 * #1052, step 4e of #380).
 *
 *   bun cli_core.ts render --candidate <dir> [flags]
 *   bun cli_core.ts check --candidate <dir> --frames <dir> [flags]
 *   bun cli_core.ts --help                 the commands this entry runs
 *
 * Which commands those are is not listed here: it is every command whose
 * `runtime` is `false` in the one command table (`src/cli/shared.ts`), and
 * `--help` prints exactly that set. This file imports nothing that links the
 * runtime — no module it reaches, statically, imports
 * `@esotericsoftware/spine-core` — so it runs with the package absent
 * (`RC24`/`RC25` in `selftest.ts` build that state and hold it). Each command
 * prints and writes what `cli.ts` prints and writes for it.
 *
 * ⚠️ What it cannot do, and refuses by name rather than reaching for: an input
 * only the runtime reads — a Spine export, `--poser spine`, a fallback the
 * poser line names, the deform survey of a build the core refuses — and a
 * command whose body is the runtime's (`build`, `validate`, `bench`,
 * `bonedist`, `preview`, `vote`). Both say what they needed spine-core for and
 * that this entry links none of it; `cli.ts` runs them.
 */
import { CORE_COMMAND_RUNS } from './src/cli/core_commands.ts';
import { runCli } from './src/cli/shared.ts';

runCli({ checkout: 'cli_core.ts', linksRuntime: false, runs: CORE_COMMAND_RUNS }, process.argv.slice(2));
