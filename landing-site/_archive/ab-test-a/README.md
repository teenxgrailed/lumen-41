# Home page variant A (22.11.2026)

A/B test of the home hero ran 03.11.2026 - 22.11.2026: `/` was split 50/50 between this page (A, calm sky hero) and B (garden video hero, `hero-b.css`).
The owner ended the test on 22.11.2026 and kept B as the only home page (`landing-site/index.html`).

`index.html` here is the last A markup, as of the split with the Agents flow section. It is a note, not a page: `_archive` is removed in the Dockerfile and not served. It needs `styles.css`, `app.js` and the sky assets from the parent folder to render, and lacks later fixes to B.
