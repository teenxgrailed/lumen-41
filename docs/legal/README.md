# Legal documents

- [privacy.md](privacy.md): Privacy Notice, including the Google Limited Use disclosure and the list of service providers.
- [terms.md](terms.md): Terms of Service.

Both are derived from the code on `main`. Neither is published yet: `src/app/privacy/page.tsx` and `src/app/terms/page.tsx` still render placeholders. Every `[[CHECK: ...]]` marker below must be resolved, and its marker removed, before publication.

## Blocked on code that is not on `main` yet

These sentences describe behaviour from open pull requests. Merge them, or rewrite the sentences, before publishing.

| Document                   | Claim                                                                    | Depends on                                                                           |
| -------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| privacy §10                | Google/Microsoft OAuth tokens and CalDAV passwords are encrypted at rest | PR #107                                                                              |
| privacy §3.7               | Trial records hold a keyed hash, not the email                           | PR #106                                                                              |
| privacy §6.2               | OpenRouter routes only to US/EU hosts                                    | PR #106                                                                              |
| privacy §8                 | Account deletion revokes Google access and removes Composio connections  | PR #106                                                                              |
| privacy §10                | Sign-out clears local storage and the offline cache                      | PR #106                                                                              |
| privacy §10, §11; terms §4 | Sessions last 30 days, sliding                                           | Session PR in progress; `src/lib/auth/auth-options.ts` sets `maxAge` to 1 year today |

## Owner

- Publication and effective dates (both documents).
- Full legal name, and FOP status and registration number if any (privacy §1, terms §1).
- DataRep: entity name, address and contact once the agreement is signed (privacy §1).
- Production `NEEDT_AI_BASE_URL` is OpenRouter. `.env.example` points to `api.deepseek.com`, which bypasses the routing (privacy §6.2).
- Production `GITHUB_BUG_REPORT_REPO` points to a private repository. The code default `teenxgrails/needt` is public (privacy §3.10).
- Hosting provider and location: Hetzner, Helsinki, from DNS; not recorded in `docs/` (privacy §7.1).
- R2 backup bucket location; disk and backup encryption (privacy §7.1, §10).
- Sentry: region, and "Prevent Storing of IP Addresses" on (privacy §3.11, §7.1).
- Resend sending region; Creem legal entity, country and links to its terms and refund policy (privacy §7.1, terms §5.3).
- Proxy and container log retention on the Coolify host (privacy §3.11).
- Retention periods: trial records, waitlist, bug reports and their GitHub copies, support email (privacy §3.7, §8).
- What disconnecting one calendar account removes (privacy §3.3).
- Google OAuth verification and CASA assessment status for the Gmail restricted scopes (privacy §5).
- Liability cap amount (terms §14).

## Lawyer

- Whether an address on request satisfies GDPR Art. 13 (privacy §1).
- How to describe the controller's own access from Ukraine (privacy §9).
- DPF or SCCs for each US provider (privacy §9).
- Current Ukrainian data-protection law and authority (privacy §12).
- Billing-record retention under Ukrainian tax law (privacy §8).
- Sanctions wording (terms §3).
- Creem's handling of the EU/UK withdrawal right and the express-request acknowledgment (terms §5.5).
- Unpublished AI fair-use allowance under EU consumer law (terms §6).
- Liability clause for EU consumers; whether to keep the business indemnity (terms §14).
- Choice of law, competent court, and any ODR notice (terms §16).

## Not stated in the documents, on purpose

- The Free plan's limit of 3 habits (owner decision 2026-10-10) is not enforced in `src/lib/entitlements.ts`, so terms §5.1 does not name habits.
- AI allowances are not published (owner decision 2026-09-15). `src/services/ai/usage.ts` defaults Pro and Lifetime to 300 actions a month, but `.env.example` sets the Lifetime cap to 3000, so the terms do not claim the two plans are equal.
