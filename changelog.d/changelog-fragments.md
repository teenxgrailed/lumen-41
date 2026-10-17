- Changelog entries now go into one file per pull request under
  `changelog.d/`, collected into `CHANGELOG.md` at release time with
  `npm run changelog:collect`. This ends the merge conflicts every PR had on
  `CHANGELOG.md`.
