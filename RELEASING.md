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
  **Visibility is what makes a type releasable**, which is why
  `release-please-config.json` carries a `changelog-sections` array: it is the
  default node list plus `check` → *Instrument*, so instrument work on shipped
  sources counts and gets its own changelog line instead of riding along
  silently ([#163](https://github.com/firejune/rigc/issues/163)). Overriding the
  array replaces the default rather than extending it, so the whole list is
  written out — dropping a row from it hides that type.
- **Something releasable** → it opens, or updates, a pull request titled
  `release: vX.Y.Z` containing exactly three generated changes: the
  `package.json` version, `CHANGELOG.md`, and `.release-please-manifest.json`.
  `feat` bumps the minor, `fix`, `perf` and `check` bump the patch. A `!` or a
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

1. Land the work on `main` with conventional-commit subjects. CI runs on every
   push.
2. Wait for the `release` run to open or update the `release: vX.Y.Z` pull
   request.
3. Read the diff — the version and the generated changelog are the whole review.
4. **Approve the `ci` run.** It is already there and sitting in
   `action_required`, so the required `test` check is blocked until you do:
   `gh api -X POST repos/firejune/rigc/actions/runs/<id>/approve`, or **Approve
   and run** in the Actions tab. Every cut needs this — see below for why, and
   for why the branch name is not worth memorising.
5. **Merge it.** That is the cut.
6. Watch the second `release` run: it tags `vX.Y.Z`, creates the GitHub release,
   and publishes.
7. Confirm: `npm view spine-rigc version`, and the npm page shows the provenance
   attestation linking the tarball to the workflow run.

## Publishing

**Automated, on the release push.** The second `release` run — the one that tags
`vX.Y.Z` — checks out that tag and publishes it. It authenticates over OIDC (npm
trusted publishing): the runner exchanges a short-lived GitHub token for a
publish grant, so there is no `NPM_TOKEN` in this repository and no OTP to type.
That is what `id-token: write` in the job's permissions is for, and it is also
what lets the publish carry `--provenance`. The registry side of it is
configured — the fields are recorded below, and nothing there is outstanding.

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

### The registry side (owner, npmjs.com)

Already configured — nothing to do here, and it cannot be done from here anyway,
since it needs the account. Recorded so the settings can be checked or rebuilt:
npmjs.com → **spine-rigc** → **Settings** → **Trusted Publisher** → *GitHub
Actions*, filled in as

- Organization or user: `firejune`
- Repository: `rigc`
- Workflow filename: `release.yml`
- Environment name: *blank* (the workflow declares no environment; a value here
  that the workflow does not match rejects the publish)
- Allowed actions: `npm publish`

The fields are case-sensitive and npm does not validate them on save, so a typo
would only surface as a failed publish.

**Settings → Publishing access → Require two-factor authentication and disallow
tokens** is on. It costs the automation nothing: trusted publishing presents no
token at all, so there is none for that setting to disallow. What it closes is
the unattended path — a token sitting on a machine, publishing without a human.
The interactive fallback below still works, because an OTP is exactly what the
setting asks for.

Two properties of that configuration are load-bearing in the workflow:

- The publish step must live in **`release.yml`**. Renaming the file, or moving
  the publish into another workflow, breaks the trusted publisher until the form
  is updated to match.
- It must run on a **GitHub-hosted runner**. npm does not support trusted
  publishing from self-hosted runners, so this job never moves to a private
  machine.

Confirm a cut afterwards: `npm view spine-rigc version`.

**The exchange is proven.** **v0.4.0** and **v0.5.0** both published automatically
over OIDC, with provenance attestations, from release runs `32944316689` and
`33155874461` — everything up to the registry was always testable here, the
token swap itself was not, and those two cuts are what settled it. Still watch a
cut: **Actions → release →** the run for the release commit,
step *Publish to npm*. A rejection there names its own cause; a mismatch against
the trusted publisher above is the first thing to re-read, since npm matches the
`workflow_ref` claim — repository and workflow filename — and accepts no
approximation of it. If it ever fails on authentication rather than on a mismatch,
try dropping `registry-url` from the `setup-node` step: it exists only to write
an `.npmrc`, and the `.npmrc` it writes carries a `NODE_AUTH_TOKEN` placeholder
that nothing sets. The fallback below is a contingency for that case, not a
parallel path.

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
as a logged-in human with a one-time password, which "require two-factor
authentication and disallow tokens" permits; what that setting rules out is
doing this from a script, unattended. Reach for it when the automation is broken
and a release cannot wait — then fix the workflow.

## Why the release pull request's check has to be approved by hand

⚠️ **The `ci` run does fire, and it waits for you.** A `pull_request` run is
created on release-please's pull request like any other; what GitHub withholds
to prevent recursive runs is not the run but its *permission to start*, so the
run lands in **`action_required`** and the pull request's required `test` check
reads as **blocked rather than absent**. ⇒ **Approving it is a standing step of
every cut**, not a special case.

Observed on every `pull_request` run `ci.yml` has ever had on a release branch:
each one was started by `github-actions[bot]`, every first attempt concluded
`action_required`, and the only ones that went green are second attempts, after
a human approved them. The v0.4.0 cut is the worked example — pull request #169,
one bot-authored commit and no push of anyone's own, run `32943138182` sitting
in `action_required`, approved, green, merged a minute later.

The usual way to make the run start on its own is a personal access token or a
GitHub App, and this repository deliberately does not use one:

- The base of the release pull request is a commit on `main` that `ci.yml`
  already tested on push.
- The pull request adds only generated version and changelog text. There is no
  source change for a test run to have an opinion about.
- The token would be the only long-lived credential in the repository.

Two things that follow from this, both learned the hard way:

- **How to approve, and why nothing else clears the check.** Every cut:
  `gh api -X POST repos/firejune/rigc/actions/runs/<id>/approve`, or **Approve
  and run** in the Actions tab. A push of your own to the release branch —
  merging `main` in to resolve a conflict — changes nothing about this; it
  produces another run needing the same approval. Until one is approved and
  green the required `test` check reads as blocked, and a green
  `workflow_dispatch` run on the same commit does **not** satisfy it: a required
  check is matched by the run that reported it, not by the SHA.
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
