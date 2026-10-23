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

At release time run `npm run changelog:collect`. It moves every fragment into
`CHANGELOG.md` under `## [Unreleased]` and deletes the fragment files.

CI fails a PR that edits `CHANGELOG.md` directly (`quality-gates`, step
"Fail when a PR edits CHANGELOG.md directly"). A PR may change it only when:

- its title or a commit subject starts with `release:` (or `release(`);
- every changed line is a `## [x.y.z]` release heading; or
- it is a fragment compile: every added line comes from a `changelog.d`
  fragment the same PR deletes, which is exactly what
  `npm run changelog:collect` produces.

Run the same check locally with `npm run check:changelog`.
