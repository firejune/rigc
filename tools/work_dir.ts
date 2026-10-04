/**
 * work_dir — the work directory of a tool run by hand, and the one rule for
 * what happens to it when the tool ends (issue #1140).
 *
 * `emit_hashes`, `render_hashes`, `survey_hashes`, `core_gate`,
 * `verdict_gate`, `pack_anchor` and `hull_ceiling` each build recipes into a
 * work directory. Given `--work <dir>`, that directory is the caller's: it must
 * be empty or absent, it is made if absent, and nothing here ever removes it.
 * Given no `--work`, the tool makes its own under `tmpdir()` — and until this
 * module, none of them removed it, so every hand run of a documented command
 * (`bun tools/render_hashes.ts base --check` left 19 MB) stayed behind. A
 * temporary directory nobody empties is not free: Bun's start grows with the
 * entries of every ancestor of its cwd (issue #1135 measured 0.65 µs per entry
 * at 500,703 entries).
 *
 * So a directory the tool made is removed when the tool's command returns —
 * green, red, refused after the directory was made, or a throw — unless
 * `--keep-work` was passed, which keeps it and names it on stderr. stdout is
 * the same text either way. `--keep-work` beside `--work` is refused: a named
 * directory is never removed, so the flag would have no effect.
 *
 * The removal runs from the command's own `finally` (`WorkDirectory.close`),
 * not from a `process.on('exit')` listener: the same commands are called in
 * process by the selftest, where an exit listener would hold every directory
 * until the whole run ended. Every tool's work is synchronous (`spawnSync`), so
 * no child of the tool can still be reading the directory when the `finally`
 * runs. A process killed by a signal runs no `finally` and leaves its one
 * directory, as a killed selftest leaves its one root (issue #1137).
 *
 * This module is not shipped: none of the tools that import it is in
 * `package.json`'s `files`, so the import crosses no published boundary.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** The one spelling of the switch. */
export const KEEP_WORK = '--keep-work';

/** Any argument that looks like an attempt at `--keep-work`, so a near miss is refused by name rather than read as something else. */
const KEEP_WORK_SPELLING = /^--keep[-_]?work/i;

/**
 * `--keep-work` taken out of `argv`, strictly — the `--keep-temp` reader's
 * rules (issue #1137): spelled exactly so, no value, at most once. `switches`
 * are the command's own flags that take no value; any other `--flag` directly
 * before `--keep-work` is one that needed a value, and the tool's own parser
 * would have refused `--keep-work` as that value, so this refuses it too
 * rather than letting the flag after it be read as the value.
 */
export function readKeepWork(argv: readonly string[], switches: readonly string[], refuse: (message: string) => Error): { argv: string[]; keep: boolean } {
  const rest: string[] = [];
  let keep = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!KEEP_WORK_SPELLING.test(arg)) {
      rest.push(arg);
      continue;
    }
    if (arg !== KEEP_WORK) throw refuse(`${JSON.stringify(arg)} is not ${KEEP_WORK}, which is spelled exactly so and takes no value`);
    if (keep) throw refuse(`${KEEP_WORK} given twice`);
    const before = i > 0 ? argv[i - 1] : undefined;
    if (before !== undefined && before.startsWith('--') && !switches.includes(before) && !KEEP_WORK_SPELLING.test(before)) {
      throw refuse(`${before} needs a value, and ${KEEP_WORK} after it takes none`);
    }
    keep = true;
  }
  return { argv: rest, keep };
}

/**
 * One command's work directory: opened once, closed from the command's
 * `finally`. A directory named by `--work` is the caller's and `close` leaves
 * it; one this made is removed unless `keep`, and kept ones are named.
 */
export class WorkDirectory {
  private made: string | null = null;
  private keep = false;

  /** `tool` prefixes the stderr line a kept directory is named in. */
  constructor(private readonly tool: string) {}

  /**
   * The directory to work in. `named` is `--work`'s value: it must be empty or
   * absent, and is made if absent. Without it, a fresh `<prefix>XXXXXX` under
   * `tmpdir()`. `unit` is what runs in a fresh directory, for the refusal.
   */
  open(named: string | undefined, keep: boolean, prefix: string, refuse: (message: string) => Error, unit = 'recipe'): string {
    if (this.made !== null) throw new Error(`${this.tool}: a WorkDirectory is opened once; ${this.made} is open`);
    if (named !== undefined) {
      if (keep) throw refuse(`${KEEP_WORK} beside --work: a directory named by --work is the caller's and is never removed, so ${KEEP_WORK} would have no effect`);
      const work = resolve(named);
      if (existsSync(work) && readdirSync(work).length > 0) throw refuse(`--work ${work} is not empty; every ${unit} runs in a fresh directory`);
      mkdirSync(work, { recursive: true });
      return work;
    }
    this.made = mkdtempSync(join(tmpdir(), prefix));
    this.keep = keep;
    return this.made;
  }

  /**
   * Text to append where a refusal points at logs inside the work directory:
   * empty unless that directory is about to be removed.
   */
  removalNote(): string {
    return this.made !== null && !this.keep ? `; it is removed when this command ends — pass ${KEEP_WORK} to read it` : '';
  }

  /** Remove the directory this made, or name it when kept; a named `--work` is left as it is. Safe to call twice. */
  close(warn: (line: string) => void): void {
    const made = this.made;
    if (made === null) return;
    this.made = null;
    if (this.keep) {
      warn(`${this.tool}: ${KEEP_WORK} kept the work directory ${made}`);
      return;
    }
    rmSync(made, { recursive: true, force: true });
  }
}
