# Legal documents

The published texts live in code, so the pages and their tests read one source:

| Page             | Source                                     |
| ---------------- | ------------------------------------------ |
| `/privacy`       | `src/lib/legal/documents/privacy.ts`       |
| `/terms`         | `src/lib/legal/documents/terms.ts`         |
| `/subprocessors` | `src/lib/legal/documents/subprocessors.ts` |
| Shared facts     | `src/lib/legal/operator.ts`                |

Each document is Markdown in a template string, rendered by
`src/components/legal/LegalDocument.tsx` through the small parser in
`src/lib/legal/markdown.ts`. Edit the text there; do not reintroduce copies
here.

`src/lib/legal/operator.ts` holds the effective date and the two values the
owner still has to supply: `OPERATOR_FULL_NAME` and `DATAREP_CONTACT`. Until
they are filled, the pages print interim wording ("Maksym A."; DataRep being
appointed, write to privacy@needt.app). The skipped block at the end of
`src/lib/legal/__tests__/documents.test.ts` fails while either is a
placeholder; un-skip it once both are filled.

## When something changes

- A new provider that receives personal data: add it to the subprocessor
  list and to the Privacy Notice §7.1 before it goes live.
- A new cookie or local-storage key: Privacy Notice §11.
- A new connected service or import source: Privacy Notice §3.3 and §5 if it
  is Google.
- Any material change: bump `LEGAL_EFFECTIVE_DATE`, and tell users 14 days
  (privacy) or 30 days (terms) in advance.

## Facts the text relies on

| Claim                                                           | Where it is true                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| OAuth tokens, CalDAV/IMAP credentials encrypted (AES-GCM)       | `src/lib/security/secret-encryption.ts` (#107, #115)                                  |
| Trial records hold a keyed hash; purged 2 years after end       | `src/lib/trials/trial-service.ts` (#106), `pruneOrphanTrialGrants`                    |
| AI only through US/EU OpenRouter hosts, `data_collection: deny` | `hostedAiRoutingBody` in `src/services/ai/usage.ts`; prod sets no `NEEDT_AI_BASE_URL` |
| Deletion revokes Google, stops webhooks, removes Composio       | `src/services/account/account-external-access.ts` (#106)                              |
| Sign-out clears storage and offline cache                       | `src/lib/auth/client-sign-out.ts`, used by every sign-out control                     |
| Sessions 30 days, sliding                                       | `SESSION_MAX_AGE_SECONDS` in `src/lib/auth/auth-options.ts` (#118)                    |
| Sign out everywhere / password reset revoke API tokens          | `revokeAllAccess` in `src/lib/auth/session-version.ts`                                |
| Sentry reports reduced to type, frames, release                 | `src/lib/sentry/privacy.ts`; DSN host `ingest.us.sentry.io`                           |
| Resend sends from eu-west-1                                     | `send.needt.app` MX → `feedback-smtp.eu-west-1.amazonses.com`                         |
| R2 backup bucket in Eastern Europe                              | `needt-prod-backups`: location `EEUR`, jurisdiction `default`                         |
| No Google Fonts, no analytics                                   | fonts self-hosted (#114); no third-party hosts in app or landing HTML                 |
