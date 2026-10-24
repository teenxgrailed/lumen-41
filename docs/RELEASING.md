# Releasing Needt

A release is one pull request titled `release: <version>`. Merging it to
`main` deploys the web app, worker and collaboration server like any other
merge; the Mac app is released separately by a tag. The release PR is the
only PR that edits `CHANGELOG.md` (CI's CHANGELOG check accepts `release:` PRs);
every other PR adds a `changelog.d/<slug>.md` fragment.

## What `npm run release:prepare` does

```bash
npm run release:prepare -- <version> [YYYY-MM-DD]   # date defaults to today
```

From a clean checkout it:

1. creates the branch `release/<version>` (fails if it, the tag or the
   `[<version>]` section already exists);
2. runs `npm run changelog:collect`: every fragment moves into `CHANGELOG.md`
   after its `<!-- changelog.d/<name> -->` marker and is deleted;
3. renames `## [Unreleased]` to `## [<version>] — <date>` and puts a new
   empty `## [Unreleased]` above it;
4. sets the version in `package.json`, `package-lock.json`, the Mac app's
   `MARKETING_VERSION` (`apps/macos/project.yml`) and the iOS app's
   (`apps/ios/ios/App/App.xcodeproj/project.pbxproj`). Build numbers are left
   alone: CI sets the Mac build number from the run number;
5. runs `npm run whats-new` and fails unless the feed lists entries dated
   `<date>`. `public/whats-new.json` is gitignored and is not committed; the
   production build compiles it again;
6. writes `docs/releases/<version>.md`, a short summary grouped by area,
   built from the released fragments (`chore-*` left out);
7. commits `release: <version>` (the pre-commit hook runs lint and
   type-check) and prints the `git push` and `gh pr create` commands. It
   pushes nothing and opens no PR.

The pure parts (heading rewrite, version bumps, notes) are in
`scripts/lib/release.cjs`, tested by `scripts/lib/__tests__/release.test.ts`.

## Launch day: 1.0.0

The release is cut on 2026-10-25 in the evening; the launch is 2026-10-26.

1. **Prepare**, from fresh `main`, in a worktree with no other changes:

   ```bash
   git fetch origin
   git switch --detach origin/main
   npm run release:prepare -- 1.0.0 2026-10-25
   ```

   A warning that HEAD is not `origin/main` means you are not on fresh main:
   delete the branch (`git switch --detach origin/main && git branch -D release/1.0.0`)
   and start again.

2. **Review** the commit: `git show --stat HEAD`, the top of `CHANGELOG.md`
   and `docs/releases/1.0.0.md`. The notes are a draft grouped by keyword;
   edit them freely, then `git commit --amend --no-edit -a` (the title must
   stay `release: 1.0.0`).

3. **PR**: run the two printed commands:

   ```bash
   git push -u origin release/1.0.0
   gh pr create --base main --head release/1.0.0 --title "release: 1.0.0" --body-file docs/releases/1.0.0.md
   ```

   Keep the PR title `release: 1.0.0`: the squash commit takes it, and the
   changelog guard reads it.

4. **Merge** once CI is green: `gh pr merge --squash`. Fragments merged by
   other PRs while the release PR was open stay in `changelog.d/`; they are
   simply the first entries after 1.0.0, nothing to fix.

5. **Verify production** is running the merge commit. Green CI on `main` does
   not mean production moved (publish runs can cancel each other), so read the
   health endpoint:

   ```bash
   SHA=$(git rev-parse origin/main)   # after `git fetch origin`, the release merge
   curl -s https://use.needt.app/api/health | jq '{ok, buildSha, workerBuildSha}'
   ```

   Done when `ok` is `true` and `buildSha` and `workerBuildSha` are `$SHA` or a
   newer `main` commit (`git merge-base --is-ancestor $SHA <buildSha>`).
   While they show an older SHA, watch the "Build and publish Needt" run for the merge
   (`gh run list --workflow docker-publish.yml --limit 3`).

6. **Mac app**: tag the release merge and push the tag. `macos-release.yml`
   builds the direct-download app, publishes the GitHub Release and refreshes
   the Sparkle appcast; its version comes from the tag:

   ```bash
   git tag mac-v1.0.0 "$SHA"
   git push origin mac-v1.0.0
   gh run watch "$(gh run list --workflow macos-release.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
   ```

7. **What's new**: signed in at https://use.needt.app, open the account menu,
   What's new. The first group is dated 25 October 2026 and lists the released
   entries (entries already read before the release are not marked new
   again: the collector's markers keep their ids). `/whats-new.json` itself
   is behind sign-in; the app reads it through `/api/whats-new`.

## After the release

- Changelog entries go in `changelog.d/<slug>.md` fragments only, never in
  `CHANGELOG.md`. What's new shows 1.0.0 plus every fragment added since.
- The next release is the same command with the next version, e.g.
  `npm run release:prepare -- 1.0.1`.
- To undo a prepared release before it is merged, close the PR and delete
  the branch; after the merge, revert the release PR like any other.
