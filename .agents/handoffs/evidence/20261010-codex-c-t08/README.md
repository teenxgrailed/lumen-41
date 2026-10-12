# T08 component comparison evidence

All PNGs are 1440×900 at device scale 1, light and dark, Chromium with reduced motion. Each `prototype-*` file is paired with `app-harness-*` of the same kind/state/theme.

Provisional set: 36 PNGs, including denied-access pairs. Calendar geometry matches. Dark reference captures need regeneration: a duplicate DS stylesheet injection in the harness overrode prototype themes. That injection was removed from the capture script; S4 did not alter vendor CSS. Do not treat existing dark reference PNGs as final until recaptured.

Coverage: list, grid, document (`doc`), calendar, connection cards and chat skeletons; initial error and offline/no-cache state. Prototype components are the frozen `StSkeleton`, `StError`, and `StOfflineIndicator` mounted on an isolated canvas. App screenshots mount the actual new TSX components with test-only provider adapters. These are component comparisons, **not authenticated application-route evidence**. T05/T09 and later screens must consume T08 before full route comparison is possible.

Reference source: `docs/port/prototype/index-dev.html`. Its missing DS bundle is served through a read-only local alias from `/Users/lol/Needt/Needt - Design : App, Landing/_ds/needt-design-system-main-25d3c8e5-a812-464d-881f-e887b9adef4b/_ds_bundle.js`, SHA-256 `ead6969adbf0c6100794e3cd25a9451d25b78bc7cc546544a736518a1c3eab2a`. The original sibling stylesheet matches the frozen `docs/port/_ds/styles.css`. No prototype file was edited. S1 should vendor the missing bundle for reproducible reference serving.

Harness URLs during this session: reference `http://127.0.0.1:4408/prototype/index-dev.html`; component harness `http://127.0.0.1:4308/?kind=calendar&state=loading&theme=dark`. Session scripts are `/private/tmp/needt-port-reference-server.mjs`, `/private/tmp/needt-c-t08-harness.mjs`, and `/private/tmp/needt-c-t08-capture.mjs`.

Browser assertions: skeleton animations stop under reduced motion; Retry calls the supplied query refetch callback. Unit integration asserts that unscoped/foreign offline count broadcasts are ignored and identity changes reset any verified count.

Intentional differences: icons use `react-icons/fi`; unavailable account owner details and unimplemented request-access actions are absent; offline-without-cache offers a real refetch instead of pretending cached data exists. Queued count is unknown until S1 adds authenticated scope metadata to the worker broadcast. No fake expiry/reset/sync times appear.
