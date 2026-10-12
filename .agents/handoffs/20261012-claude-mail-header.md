---
id: 20261012-claude-mail-header
owner: claude-worker-mail-header
branch: fix/mail-header
status: active
updated: 2026-10-12T00:00:00Z
objective: The desktop Mailbox header matches the prototype MailScreen (account chips, tabs incl. Sent and Drafts, New message, the no-account state) without inventing mail behaviour the product lacks
---

## Scope

- Governing plan/spec: docs/port/01-data-map.md section 5 (mail stays read-only, owner 2026-10-09); docs/port/prototype/MailScreen.jsx (`ACCTS`, `ML_TABS`, `ml-new`, `ML_EMPTY`); SCREENS.md Mailbox rows "New message" and "Sent / Drafts".
- In scope: src/components/needt3/mail/{MailScreen.tsx,derive.ts,strings.ts} + tests, src/styles/v3-overrides/mail-header.css (imported last in v3-entry.css), CHANGELOG.
- Out of scope: the phone face, `useMailbox` / `MailFaces` (the shared controller is untouched and still handed to both faces), any mail server logic, the composer, Connections, Settings, Docs, places.

## Root cause of the empty header

The header drew only `accounts.data` as chips and a fixed three-tab strip. With no connected account `GET /api/mail/accounts` answers `[]`, so the chips row was empty; the port had no New message button and no Sent / Drafts tabs at all (the vendored `mail.css` already ships `.ml-tabs-sep`, `.ml-new`, `.ml-new-label`), and the list under it said "Inbox zero" on the default tab. Below 1180 px the vendored CSS also hides the chips on purpose. It was a data condition plus missing controls, not a flag or a CSS bug.

## Per-control decision

- Account chips: BrandIcon + label (provider; the address when two accounts share a provider or for IMAP) + red dot only when the account is in ERROR (the prototype draws no "ok" dot: identity is neutral, red is "disconnected"); title = the address, or "Disconnected since HH:mm - reconnect below". No account at all: Gmail and Outlook drawn as not connected (red dot, link to /connections). Accounts still loading or failed: no chips (no flash of the no-account state).
- Tabs Needs you / All / Made into tasks with counts: unchanged (option a). Sent and Drafts: option (b), drawn disabled (`aria-disabled`, held look = the `.nx-btn[disabled]` 0.4 opacity, `title` "Sent folder isn't synced yet" / "Drafts folder isn't synced yet"), no count. Why: `listMailMessages` drops everything that left the inbox (`isArchived: false`), Gmail marks Sent/Drafts as not-INBOX so they are stored but hidden, and Outlook / IMAP sync only the inbox. A real view would need a read-only server query (`folder`/`label` param + the Outlook/IMAP sync of those folders): flagged, not written.
- New message: option (a). One account: an `<a target=_blank rel=noopener>` to the provider's compose (Gmail `https://mail.google.com/mail/u/<address>/?view=cm&fs=1`; Outlook `https://outlook.office.com/mail/deeplink/compose`, the host the read link already uses and the form that still works for personal and work accounts; IMAP `mailto:`). Two or more accounts: the same button opens a small menu "Write in..." with one row per account. No account (or loading / error): the button is drawn with `aria-disabled` and a title saying why. Needt never sends or drafts.
- No-account state: art 56 (`<Art name="mail">`, replacing the FiInbox stand-in and its todo), "No mail account connected" (prototype string), "Connect Gmail or Outlook and your mail shows up here." (the phone face's line), Open Connections -> /connections; shown on every tab. The empty-inbox state with accounts keeps the prototype's per-tab copy.

## Could not match

- The prototype draws neutral dots for the chips; the port keeps BrandIcon (existing choice, asked for in the brief).
- The prototype shows a count on Sent; here none (nothing is synced).
- The prototype always draws both Gmail and Outlook chips; here only real accounts (and both providers only when none is connected).

## Working state

- Temporary harness src/app/style/mail/page.tsx is never committed.

## Verification

See the PR body for gate outputs. Evidence PNGs: .agents/handoffs/evidence/mail-header/.
