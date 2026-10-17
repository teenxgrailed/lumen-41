- Document export: Page options gets **Export as Markdown** (a `.md` download
  of the page as it is on screen) and **Export as PDF** (the browser's print
  with the page alone on the paper, in its own style). The same Markdown is
  served by `GET /api/pages/:id/export?format=md` (same access as the page
  itself; documented in `docs/connector-api.md`).
