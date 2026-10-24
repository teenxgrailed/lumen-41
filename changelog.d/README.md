# Changelog fragments

Do not edit `CHANGELOG.md` in a pull request. Every PR appending to the same
place conflicts with every other PR. Add one file per PR here instead:

```
changelog.d/<short-slug>.md
```

The file holds one or more bullet lines in the same style as `CHANGELOG.md`
(a wrapped bullet continues on lines indented by two spaces):

```
- Pages can be exported as Markdown and PDF.
```

Rules:

- Only user-facing changes need a fragment.
- Pick a slug that is unlikely to collide (feature name, not `fix`).
- `README.md` is ignored by the collector.
- The app's What's new lists every fragment, dated by the commit that added
  it (`scripts/whats-new.ts`, run before `dev` and `build`). Write it for
  the person using Needt. Name internal housekeeping `chore-<slug>.md`: it
  still goes into `CHANGELOG.md` but is not shown in the app.

At release time run `npm run release:prepare -- <version>` (see
`docs/RELEASING.md`): it does the two steps below and the version bumps.

`npm run changelog:collect` moves every fragment into
`CHANGELOG.md` under `## [Unreleased]`, each after a
`<!-- changelog.d/<name> -->` marker, and deletes the fragment files. Then
rename that heading to the release, in this exact form:

```
## [1.0.0] — 2026-10-25
```

What's new also reads every such dated release section from 2026-10-01 on
(older ones are the upstream project's), dated by the heading, so the feed shows the
last release plus the fragments added since. Keep the markers: they keep each
entry's id (so it is not shown as new twice) and keep `chore-*` fragments out
of the app. Hand-written bullets in a release section are shown too; a bullet
whose text matches a fragment's is listed once.

CI fails a PR that edits `CHANGELOG.md` directly (`quality-gates`, step
"Fail when a PR edits CHANGELOG.md directly"). A PR may change it only when:

- its title or a commit subject starts with `release:` (or `release(`);
- every changed line is a `## [x.y.z]` release heading; or
- it is a fragment compile: every added line comes from a `changelog.d`
  fragment the same PR deletes (or is its `<!-- changelog.d/<name> -->`
  marker), which is exactly what `npm run changelog:collect` produces.

Run the same check locally with `npm run check:changelog`.
