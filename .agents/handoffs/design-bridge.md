# Design bridge — artifacts → code

As of 2026-11-03. Source: `Artifact list scope "all"` (32 artifacts, all owned
by the owner). Design authority order stays as in CLAUDE.md: PORT.md first,
vendored CSS wins over any canvas. A canvas here is reference, never a value
source.

Status values: **ported** (a shipped screen exists; edit in code, never
re-export) · **reference** (input for a port, not shipped as-is) ·
**design system** · **empty** · **other product** (not the Needt app).

## Needt app

| Artifact | URL | Screen / route in `src/` | Status |
|---|---|---|---|
| Needt Design System Main | https://claude.ai/artifact/DMXDE2TnEbaLypig214zEg | tokens → `src/styles` | design system (the one to reconcile, see task 9) |
| Needt Design System | https://claude.ai/artifact/16ProQTeYg6xyxy4gFwFx7 | — | design system (older copy) |
| Needt Design System | https://claude.ai/artifact/7ZGHKogBzSmUiiN5pcemo9 | — | design system (older copy) |
| Settings · Desktop | https://claude.ai/artifact/Qcmpvo9dYkdur5D3kUw6gS | `src/app/(app)/settings` | reference |
| Needt Sidebar | https://claude.ai/artifact/AHDNTdoMgzx6fFsD9qA7XA | app shell navigation | reference |
| Needt Onboarding | https://claude.ai/artifact/5Vp4ZTNf2kYjCQiXdR42sG | `src/app/(app)/setup`, `src/app/start` | reference |
| Needt Onboarding Board | https://claude.ai/artifact/Hfu3ucCQMKAK9c5bT4frGh | `src/app/(app)/setup` | reference |
| Needt Mac Onboarding | https://claude.ai/artifact/Xc1H9iPcqnt83uF2bpnC4Y | Mac app first run | reference |
| Needt Widgets Lab | https://claude.ai/artifact/2a4eqgF8YtVpdBP4wcirwH | widgets (`docs/widgets/`) | reference |
| Needt Widget Pack | https://claude.ai/artifact/1ye18yHgfydUM3Q5E3KA7b | widgets | reference |
| Needt Practice | https://claude.ai/artifact/WVrNqEfUejn74fz1AZfHJD | `src/app/(app)/habits` (unverified) | reference |
| Needt Product Map | https://claude.ai/artifact/2uHLGsaqUMdrXZSpqebVXp | whole product | reference |
| needt.app home v42 (titled "Untitled" in the list) | https://claude.ai/artifact/Kw1Ap3mahrQucWycARgDiV | landing, not `src/` — code in `Needt - Landing/` | reference (screenshots of v42, desktop 1440 + iPhone 390) |
| Design | https://claude.ai/artifact/5m6cJohP4xGZFh8q24i2RV | — | empty (no `project/canvas.json`) |
| Design | https://claude.ai/artifact/EAqpkifD9MPjMVXMHAN75t | — | empty (no `project/canvas.json`) |
| Slides | https://claude.ai/artifact/VrxWDKcxQHzqRk1jkU3dHf | — | deck, not a screen |
| Untitled | https://claude.ai/artifact/1tVTE7raCnrUTP35xFGp3c | — | unchecked |
| Untitled | https://claude.ai/artifact/Vg4dLGvbjKpUrasJh5xV9X | — | unchecked |
| Untitled | https://claude.ai/artifact/NusVdMdgzzkXNLkgGfLVdR | — | unchecked |

The canvas "Untitled" of 03.11 was empty in the morning and was filled the
same day with the v42 home; it is no longer empty.

## Other products (not mapped to `src/`)

| Artifact | URL | Product |
|---|---|---|
| Needt Budget | https://claude.ai/artifact/R9pt8VG5UkW2znR1C5DjbM | Needt Budget (design system) |
| Needt Budget Quest | https://claude.ai/artifact/2ubttMNgvAFqsqm4mnJp1Y | Needt Budget |
| Needt Budget Blog Mockups | https://claude.ai/artifact/FGao91FfNfoaXkNaWnikQa | Needt Budget |
| Needt Budget Onboarding | https://claude.ai/artifact/WmJTqrFbtqzNqE1srYXx2u | Needt Budget |
| Needt Budget Features | https://claude.ai/artifact/8dqD5W43aKjW7QiFfrLSyU | Needt Budget |
| Needt Budget Landing | https://claude.ai/artifact/NKY5vbs54ixUpcWSFcYvAV | Needt Budget |
| Needt Budget Screens | https://claude.ai/artifact/LQ1gspshdGfs5yoAppvPwh | Needt Budget |
| Demesures | https://claude.ai/artifact/QYZ4L3VHSVxXkphbyUc3n5 | Demesures |
| Demesures Store | https://claude.ai/artifact/RKdYxo2tSxxa2C2kpBpK4y | Demesures |
| Demesures ERD Prototype | https://claude.ai/artifact/YRJ5x679RjSowQUUF6TLnV | Demesures |
| Demesures Merged Prototype | https://claude.ai/artifact/ViUWy6gDMHDWMQX4NRvmJb | Demesures |
| gamingbar.ch — Grundriss & Moodboard | https://claude.ai/artifact/2aFjUcZ6fpJagYYmcrk71o | personal |
| Осветление корней | https://claude.ai/artifact/5yW2HpTBmA2eyJEkRMfmQ9 | personal |

## Access

- Artifacts: readable from any Claude Code session on the owner's account
  through the Artifact tool (`read` with `path`), no login.
- Standalone Claude Design projects (design systems only): `DesignSync`, after
  `/design-login` in an interactive session. Authorized 2026-11-03. Standalone
  closes by 2026-12-14.
- Another chat's conversation is not readable; ask that chat for the artifact
  link instead.
