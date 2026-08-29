#!/usr/bin/env node
'use strict';

/**
 * rigc's `bin` entry has one job: hand off to Bun.
 *
 * npm's `bin` field has to be something any installed Node can run, but rigc
 * itself is a Bun script (top-level await, Bun's own APIs) — its own shebang
 * says so. On a machine without Bun that used to fail as a bare
 * `env: bun: No such file or directory`, with no hint why. This file exists
 * so that failure explains itself: if `bun` is on PATH, run the real CLI
 * (cli.ts, next to this file) under it and disappear — argv, stdio, the exit
 * code and signals all pass straight through. If it isn't, say so once and
 * stop. No downloads, no network, no writes — just the hand-off or the
 * message.
 */

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const cli = path.join(__dirname, '..', 'cli.ts');
const result = spawnSync('bun', [cli, ...process.argv.slice(2)], { stdio: 'inherit' });

if (result.error) {
  if (result.error.code === 'ENOENT') {
    process.stderr.write('rigc runs on Bun, which was not found on PATH — install it from https://bun.sh\n');
  } else {
    process.stderr.write(`rigc: could not launch bun: ${result.error.message}\n`);
  }
  process.exit(1);
}

if (result.signal) {
  // A signal (e.g. Ctrl-C) killed the child — die the same way instead of
  // inventing an exit code, so the caller sees the same thing it would have
  // seen running bun directly.
  process.kill(process.pid, result.signal);
} else {
  process.exit(typeof result.status === 'number' ? result.status : 1);
}
