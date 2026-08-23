# Releasing

The cut is one click: merge the release pull request. Everything either side of
that click is [`.github/workflows/release.yml`](.github/workflows/release.yml),
and no npm credential exists on any machine — the publish authenticates to the
registry over OIDC (npm trusted publishing), so there is no token to leak and no
2FA prompt to answer. See [Publishing](#publishing).

## The loop

Every push to `main` runs `release.yml`, which hands the new commits to
[release-please](https://github.com/googleapis/release-please-action):

- **Nothing releasable since the last tag** → the run does nothing. Commit types
  release-please hides from the changelog (`docs`, `test`, `ci`, `build`,
  `chore`, `refactor`, `style`) do not open a release pull request on their own.
- **Something releasable** → it opens, or updates, a pull request titled
  `release: vX.Y.Z` containing exactly three generated changes: the
  `package.json` version, `CHANGELOG.md`, and `.release-please-manifest.json`.
  `feat` bumps the minor, `fix` and `perf` bump the patch. A `!` or a
  `BREAKING CHANGE:` footer bumps the **minor** while the package is pre-1.0
  (`bump-minor-pre-major`) — 1.0.0 is a deliberate act, not the side effect of
  one commit. To force a version, put `Release-As: 1.0.0` in a commit footer.
- **That pull request is merged** → the merge is a push to `main`, so
  `release.yml` runs again; this time release-please tags `vX.Y.Z`, creates the
  GitHub release, and the same run publishes the package.

Squash-merge the release pull request, so the commit on `main` keeps its
`release: vX.Y.Z` subject.

## One-time setup (owner, GitHub)

**Settings → Actions → General → Workflow permissions → tick "Allow GitHub
Actions to create and approve pull requests."** It is off by default, and while
it is off release-please cannot open the release pull request at all — the run
fails with *GitHub Actions is not permitted to create or approve pull requests*.
Nothing in a workflow file can grant this; it is a repository setting.

The neighbouring "Workflow permissions" radio can stay on the read-only default:
`release.yml` declares per job the write scopes it needs.

`release-please-config.json` carries a `bootstrap-sha`. It marks where
release-please stops reading history on its very first run, so the first
changelog covers the release and not the whole repository. It is set once, to
the commit that introduces these files, and is not maintained afterwards.

## Cutting a release

0. Once, before the first automated cut: the npmjs.com form in
   [Publishing](#publishing).
1. Land the work on `main` with conventional-commit subjects. CI runs on every
   push.
2. Wait for the `release` run to open or update the `release: vX.Y.Z` pull
   request.
3. Read the diff — the version and the generated changelog are the whole review.
   Optionally run the suite against the release branch: **Actions → ci → Run
   workflow →** the branch the pull request is on (see below for why it is not
   automatic, and for why that name is not worth memorising).
4. **Merge it.** That is the cut.
5. Watch the second `release` run: it tags `vX.Y.Z`, creates the GitHub release,
   and publishes.
6. Confirm: `npm view spine-rigc version`, and the npm page shows the provenance
   attestation linking the tarball to the workflow run.

## Publishing

**Automated, on the release push.** The second `release` run — the one that tags
`vX.Y.Z` — checks out that tag and publishes it. It authenticates over OIDC (npm
trusted publishing): the runner exchanges a short-lived GitHub token for a
publish grant, so there is no `NPM_TOKEN` in this repository and no OTP to type.
That is what `id-token: write` in the job's permissions is for, and it is also
what lets the publish carry `--provenance`.

**The package name is `spine-rigc`, not `rigc`** — do not retry the short one.
The first publish of `rigc@0.2.0` was refused by the registry with
`403 Package name too similar to existing packages rc,rfdc,bigi`, which is a
registry-side rule no account setting or flag overrides. `bin` still installs
the command as `rigc`, so only the registry entry changed. `spine-rigc@0.2.1`
went up by hand, before the automation existed; every version after it is the
workflow's.

`prepublishOnly` runs `bun run typecheck && bun run lint && bun run selftest`
before npm packs anything, so a tree that fails its own gates cannot be
published — by the workflow or by hand. It is the same three commands CI runs on
every push; the selftest needs no corpus and no arguments, and reports the
example suites as HOLEs rather than passes when `examples/` is absent, which is
why the publish job does not fetch the Spine examples the way `ci.yml` does.
There is no build step to guard: the package ships its TypeScript sources and
bun runs them.

### One-time setup (owner, npmjs.com)

Do this once, before the first automated cut. It cannot be done from here — it
needs the account.

1. npmjs.com → **spine-rigc** → **Settings** → **Trusted Publisher** → *GitHub
   Actions*.
2. Fill in, exactly (the fields are case-sensitive, and npm does not validate
   them on save — a typo only surfaces as a failed publish):
   - Organization or user: `firejune`
   - Repository: `rigc`
   - Workflow filename: `release.yml`
   - Environment name: *leave blank* (the workflow declares no environment; a
     value here that the workflow does not match rejects the publish)
   - Allowed actions: `npm publish`
3. After the first successful automated publish — not before — set **Settings →
   Publishing access → Require two-factor authentication and disallow tokens**.
   Trusted publishing keeps working under that setting; it is what closes the
   door behind the classic tokens. Setting it first would leave no way back if
   the OIDC path needs a fix.

Two properties of that configuration are load-bearing in the workflow:

- The publish step must live in **`release.yml`**. Renaming the file, or moving
  the publish into another workflow, breaks the trusted publisher until the form
  is updated to match.
- It must run on a **GitHub-hosted runner**. npm does not support trusted
  publishing from self-hosted runners, so this job never moves to a private
  machine.

Confirm a cut afterwards: `npm view spine-rigc version`.

### What the tarball contains

`files` in `package.json` is an allowlist, so the published package is the
runtime and nothing else: `cli.ts`, `src/`, the two `tools/` modules `src/`
imports (`plate.ts`, `font5x7.ts`), `README.md`, `LICENSE`, `NOTICE.md`, and
`docs/AUTHORING.md` plus `docs/SPEC_COVERAGE.md` — the first because it is the
interface an authoring agent reads, the second because two `NotImplementedError`
messages cite it by part number. The benchmark corpus, the reference frames, the
selftest, the fixtures and the measuring tools stay in the repository: they are
the yardstick, not the tool. Check before a publish with `npm pack --dry-run`,
which prints the file list and the size.

`publishConfig.provenance` is deliberately **not** set. Provenance can only be
attested from a run holding an OIDC token, so setting it in `package.json` would
fail the manual fallback below; the workflow passes `--provenance` on the
command line instead, where it applies to the automated publish only.

### If the automation is unavailable

The old path still works and needs nothing from the workflow. Publish from the
tag, never from a working `main` — the tarball has to be the tree the GitHub
release names:

```sh
npm login                        # once per machine; `npm whoami` to check
git fetch --tags
git checkout vX.Y.Z              # the tagged tree
bun install --frozen-lockfile
npm publish                      # runs prepublishOnly, then asks for the OTP
```

`npm publish` takes no flags here — `publishConfig.access` in `package.json`
already says `public`. This is how `spine-rigc@0.2.1` shipped. It authenticates
with a classic token and a 2FA one-time password, which is why it stops being
available the moment "require two-factor authentication and disallow tokens" is
switched on. Fix the workflow instead.

## Why the release pull request has no CI checks

A pull request opened with the default `GITHUB_TOKEN` starts no other workflow
runs — GitHub suppresses that to prevent recursive runs — so `ci.yml` does not
fire on release-please's pull request. The usual fix is a personal access token
or a GitHub App, and this repository deliberately does not use one:

- The base of the release pull request is a commit on `main` that `ci.yml`
  already tested on push.
- The pull request adds only generated version and changelog text. There is no
  source change for a test run to have an opinion about.
- The token would be the only long-lived credential in the repository.

Two things that follow from this, both learned the hard way:

- **A push of your own to the release branch does start a run — and it stops.**
  Merging `main` into the release branch to resolve a conflict is a push by a
  user, not by `GITHUB_TOKEN`, so the suppression no longer applies and a
  `pull_request` run appears. It sits in `action_required` until someone
  approves it: `gh api -X POST repos/firejune/rigc/actions/runs/<id>/approve`,
  or **Approve and run** in the Actions tab. Until then the pull request's
  required `test` check reads as blocked, and a green `workflow_dispatch` run on
  the same commit does not satisfy it — a required check is matched by the run
  that reported it, not by the SHA.
- **The release branch is named after `package-name`, so do not hard-code it.**
  release-please derives it from `release-please-config.json`; since the package
  became `spine-rigc` it is
  `release-please--branches--main--components--spine-rigc`, and it changes again
  with the next rename. Anything scripted reads it from the pull request:
  `gh pr view <n> --json headRefName`.

If a rendered check is ever wanted anyway, it takes no edit to `release.yml`:
create a fine-grained personal access token scoped to `firejune/rigc` with
**Contents: read and write** and **Pull requests: read and write**, store it as
the repository secret `RELEASE_PLEASE_TOKEN`, and the workflow picks it up
(`secrets.RELEASE_PLEASE_TOKEN || secrets.GITHUB_TOKEN`). The cost is a
credential to rotate.
