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
CI warns (does not fail) when a PR edits `CHANGELOG.md` directly.
