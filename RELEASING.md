# Releasing

The cut is one click: merge the release pull request. Everything either side of
that click is [`.github/workflows/release.yml`](.github/workflows/release.yml).

**Publishing is not part of it.** rigc is not on npm, so the workflow tags the
release and stops there — see [Publishing](#publishing).

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
  `release.yml` runs again; this time release-please tags `vX.Y.Z` and creates
  the GitHub release.

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
   Optionally run the suite against the release branch: **Actions → ci → Run
   workflow → `release-please--branches--main`** (see below for why it is not
   automatic).
4. **Merge it.** That is the cut.
5. Watch the second `release` run: it tags `vX.Y.Z` and creates the GitHub
   release.
6. Publish by hand — next section.

## Publishing

**Manual, every time, until the package exists on npm.** The name has never been
published, and npm's trusted publishing (OIDC) cannot be configured for a
package that is not there yet — so an automated publish today could only
authenticate with a long-lived token, which would be the one persistent secret
in this repository. Publish from the tag instead:

```sh
git fetch --tags
git checkout vX.Y.Z
bun install --frozen-lockfile
bun run typecheck && bun run lint
npm publish --access public
```

From the tag, never from a working `main`: the tarball has to be the tree the
GitHub release names.

Once the package is on npm, the automation is one form and one edit:

1. npmjs.com → **rigc** → **Settings** → **Trusted Publisher** → *GitHub
   Actions*. Organization or user `firejune`, repository `rigc`, workflow
   filename `release.yml`, environment name blank, allowed action
   `npm publish`. The fields are case-sensitive and npm does not validate them
   on save — a typo only surfaces as a failed publish.
2. In `release.yml`, give the release-please step an `id`, add `id-token: write`
   to the job's permissions, and append checkout/setup/publish steps gated on
   that step's `release_created` output. They must stay in **`release.yml`** —
   the trusted publisher is pinned to that filename — and on a GitHub-hosted
   runner, because npm does not support OIDC from self-hosted ones.

After the first successful automated publish, and not before, set **Settings →
Publishing access → Require two-factor authentication and disallow tokens**.

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

If a rendered check is ever wanted anyway, it takes no edit to `release.yml`:
create a fine-grained personal access token scoped to `firejune/rigc` with
**Contents: read and write** and **Pull requests: read and write**, store it as
the repository secret `RELEASE_PLEASE_TOKEN`, and the workflow picks it up
(`secrets.RELEASE_PLEASE_TOKEN || secrets.GITHUB_TOKEN`). The cost is a
credential to rotate.
