# Design-system fonts

Inter, Instrument Serif and JetBrains Mono, self-hosted so no page load reaches
Google. The `@font-face` rules are in `src/styles/needt-fonts.css`.

These are the exact woff2 files the Google Fonts CSS API serves for
`family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500`
to Chrome on Windows — the hinted builds Google gives Windows and Linux (macOS
gets unhinted ones, which render differently under FreeType). One file per
Google subset, each with Google's own `unicode-range`, so a latin-only page
downloads no other subset:

| Family           | Subsets                                                                  |
| ---------------- | ------------------------------------------------------------------------ |
| Inter            | cyrillic-ext, cyrillic, greek-ext, greek, vietnamese, latin-ext, latin   |
| JetBrains Mono   | cyrillic-ext, cyrillic, greek, vietnamese, latin-ext, latin              |
| Instrument Serif | latin-ext, latin (normal and italic) — all Google serves for this family |

**Filenames are content-addressed.** The segment before `.woff2` is the first
8 hex characters of the file's SHA-256. `next.config.js` serves `/fonts/ds/*`
with `Cache-Control: public, max-age=31536000, immutable`, so a file must never
change under an existing name: replace a font by adding it under its new hash
and pointing the CSS at it.

```bash
shasum -a 256 <file>.woff2 | cut -c1-8
```

Licences: SIL Open Font License 1.1 — `OFL-Inter.txt`,
`OFL-InstrumentSerif.txt`, `OFL-JetBrainsMono.txt`.
