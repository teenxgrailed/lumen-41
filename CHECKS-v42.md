# Landing v42 iPhone check (automated, 2026-11-03)

Branch checked: `landing-v42` (served from landing-site/ on :8811). 101 HTML pages, 4 viewports (375x812, 390x844, 430x932 iPhone-emulated; 1440x900 desktop).
Caveat: WebKit could not be downloaded in the sandbox, so all viewports ran in Chromium (iPhone UA, DPR 3, touch). Real Safari rendering not covered.

| Check | Result |
|---|---|
| Horizontal overflow (scrollWidth > innerWidth+1) | 0 of 404 page×viewport runs |
| Console errors / failed requests / broken images | 0 |
| Same-site links | all HTTP 200 |
| External links (236 unique links total) | not verifiable: sandbox has no DNS for external hosts (incl. use.needt.app) |
| Fixed/sticky vs top 44px on phone | `header#nav.nav` fixed at top:14px, no `env(safe-area-inset-top)` → fixed in this PR |
| safe-area use | `.m-cta` uses inset-bottom (OK); nav lacked inset-top |

Lighthouse mobile (perf preset, localhost, python http.server — no compression/CDN, so pessimistic):
Performance 40, LCP 8.5 s, CLS 0.019, TBT 1,170 ms, total 2,465 KiB.
Re-run against the real deployment before drawing conclusions.
