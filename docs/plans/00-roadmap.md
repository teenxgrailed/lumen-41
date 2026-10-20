# 00 — Roadmap

The one map: what is true today, what blocks launch, what comes after.

**Rewritten 2026-10-13.** Launch target: **2026-10-26**. It replaces the
2026-09-15 version. "Checked" means checked on 2026-10-13 by the method in the
table; "not checked" means no evidence was gathered and the line must not be
read as true.

---

## 1. Where things stand (2026-10-13)

### Production

| Fact | State | How checked |
| --- | --- | --- |
| `use.needt.app` web | `ok`, database `ok`, build `c17ce32` (= `origin/main` head) | `curl /api/health` |
| Worker | same SHA `c17ce32` | `/api/health` → `workerBuildSha` |
| Coolify apps | `need-worker`, `needt`, `needt-collaboration`, `needt-landing`: all `running:healthy` | Coolify MCP `list_applications` |
| Postgres, Redis | `running:healthy` | Coolify MCP `list_databases` |
| `needt.app` landing | HTTP 200, static v19 (#157, #161). `www` redirect and prices on the page: not checked | curl |
| `/terms`, `/privacy` | published on `use.needt.app` (HTTP 200) via #146; `needt.app/terms` and `/privacy` return 301 to `/terms/` | curl |
| New accounts | **closed**: `signups_open` is off, `/api/auth/public-signup` returns `{"enabled":false}`. Existing people sign in; everyone else goes to the waitlist (#105) | curl |
| Checkout | `billing_checkout` has no readable state from outside (`/api/billing` needs a login). Code default: closed unless a `FeatureFlag` row turns it on (#102) | code, `src/lib/feature-flags-keys.ts` |
| `design_v3` | on for everyone, new accounts start in setup (#143) | merged PR |
| Remote MCP, personal-token path | `https://use.needt.app/api/mcp` answers (405 to a bare GET, as expected) | curl |
| OAuth metadata | `https://use.needt.app/.well-known/oauth-authorization-server` returns 200 | curl |
| Remote MCP, canonical host | **`mcp.needt.app` has no DNS record** (`dig` empty, curl fails). The OAuth resource is hard-coded to `https://mcp.needt.app/mcp` (`src/lib/mcp-config.ts`), so claude.ai cannot complete OAuth until DNS and a Coolify domain exist | `dig`, curl, code |
| Backups | daily backup enabled (last update 2026-10-13 00:00 UTC), 14 kept locally, copied to S3; the weekly one is **disabled**. **No restore has ever been done** | Coolify MCP `list_database_backups` |
| Sign-in providers | code merged (#152). Coolify has **no** env vars for Apple, GitHub, Discord, X, LinkedIn or ChatGPT. Values may instead sit in `/admin/system` (encrypted, shown masked); not checked | Coolify `list_env_keys` (names only); `docs/operations/sign-in-providers.md` |
| Creem | the 2026-10-01 review was rejected because `/terms` and `/privacy` were placeholders. They are now published (#146). **Whether Creem has re-reviewed or approved is unknown.** Env keys `CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET` and the three `CREEM_PRODUCT_*` exist in Coolify (names only; test or live mode unknown) | memory, Coolify key names |
| Bug reports to GitHub | `GITHUB_BUG_REPORT_REPO` and `GITHUB_BUG_REPORT_TOKEN` not set. The code default repo is public, so a token must never be set without a private repo | Coolify key names, `docs/strategy/2026-10-13-legal-facts-verified.md` |
| AI | `NEEDT_AI_API_KEY` set on web, **absent on the worker**; `NEEDT_AI_BASE_URL` absent (default OpenRouter) | Coolify key names |

### Code

| Line | State |
| --- | --- |
| `origin/main` | `c17ce32`. Since 2026-09-15: design v3 port complete and shipped (phone and desktop), ops registry and undoable action log (#135), imports framework + Todoist + Notion (#136, #141), OAuth 2.1 server for remote MCP (#138), sign-in providers (#152), legal pages (#146), waitlist and closed registration (#104, #105), privacy and security hardening (#106, #107, #108, #114–#116), static landing v19 (#157), PWA (#159), admin scripts `set-flag`, `wipe-database`, `reset-user-data`, `set-role` (#144, #147) |
| Open PRs | #162 Time theme background · #160 new app icon · #117 draft, superseded by #146 (close) · #71 admin services status · #68 token motion layer · #67 design bundle import. #67 and #68 predate the port; decide per PR, none blocks launch |

### Decisions on record

| Source | Decision |
| --- | --- |
| Memory, 2026-09-15 | Free $0, Pro $7/month or $59/year, Lifetime $149 (first 300), AI limits hidden and equal for Pro and Lifetime, 14-day no-card trial, "demo" = Free |
| Memory, 2026-10-01 | Paid Lifetime is always granted (the 300 cap moves to checkout); AI metered in actions, cap 3000 |
| Memory, 2026-10-10 | Free must be visibly limited; Free = at most 3 habits (#125, #126) |
| Owner interview 2026-10-12 | Solo, bootstrapped, 10–20 h/week; $3–10k MRR within 12 months of launch; agent-centred AI; English only; design frozen; closed source; support answered by AI. Claude merges and deploys without asking, except money, public actions and legal |

---

## 2. Launch checklist (target 2026-10-26)

Order inside each list is priority order.

### Agents can do (no owner input)

| # | Task | Done when |
| --- | --- | --- |
| A1 | **Restore drill plan** (`docs/operations-runbook.md`, "Backups and restore drill"). Download the newest daily backup from the S3 bucket, restore into a scratch database on a laptop or throw-away container, never on the prod host: `createdb needt_restore_drill`, `pg_restore --clean --if-exists --no-owner`, `prisma migrate status`, `select count(*)` on `User` and `Task`, `dropdb`. Record backup object, timestamp and counts in the runbook | counts match prod, entry added. Needs an S3 read key from the owner, see O8 |
| A2 | Re-enable or consciously drop the disabled weekly backup (Coolify shows it `enabled:false`) | owner told which |
| A3 | Give the worker `NEEDT_AI_API_KEY` if it runs AI jobs (it lacks the key today) | **Closed 2026-10-20: not needed.** `src/worker/` and the services it imports (nudges, imports, bug reports, pinterest, operations health) make no AI completion calls; the only `services/ai` modules it reaches are `encryption` (legacy token secrets) and `memory` (learned duration ratios and memory export, read from the DB, via `TaskSchedulingService` and `account-export`); neither calls a model or needs the key. Revisit if a worker job starts calling a model |
| A4 | Add `mcp.needt.app` to the app in Coolify and to the middleware host allow-list after the owner creates DNS (O2), then run the claude.ai connector flow end to end | `curl https://mcp.needt.app/.well-known/oauth-protected-resource` returns 200 and a claude.ai connector authorises |
| A5 | Rehearse the launch switch on staging or locally with `scripts/admin/set-flag.cjs` (dry run first) | steps in section 3 verified |
| A6 | Test purchase in Creem test mode against `/api/billing` with `billing_checkout` on (local), covering the withdrawal-consent checkbox flagged in legal item T6 | purchase, webhook and plan change observed |
| A7 | Make legal-flag text fixes that need no lawyer: add the Composio disconnect to the deletion paragraph (P9), fill `DATAREP_CONTACT` once O5 returns | PR merged |
| A8 | Close stale PRs: #117; decide #67, #68, #71 | list is short |
| A9 | Merge #160 and #162 after review (cosmetic) | optional for launch |
| A10 | Keep the browser E2E and visual baselines green on `main` (visual is sharded 4 ways, #158) | CI green on the launch SHA |

### Owner must do

| # | Step (exact) | Why it blocks | Who unblocks next |
| --- | --- | --- | --- |
| O1 | **Creem**: open the Creem dashboard, check the status of the rejected review, and if needed resubmit with `https://use.needt.app/terms` and `/privacy` (now real pages). Confirm products Pro $7/month, Pro $59/year, Lifetime $149 exist in live mode and that the `CREEM_PRODUCT_*` ids in Coolify point to them | no payments without approval | O9, A6 |
| O2 | **DNS for MCP**: at the DNS host for `needt.app` (Cloudflare) add `mcp` pointing to the same server as `use` (`A 95.216.213.174` or the CNAME the others use), then add `mcp.needt.app` as a domain on the `needt` app in Coolify | claude.ai OAuth cannot work without it. The personal-token path still works | A4 |
| O3 | **Sign-in providers**: register apps with Apple, GitHub, Discord, X, LinkedIn, ChatGPT as in `docs/operations/sign-in-providers.md`, callback `https://use.needt.app/api/auth/callback/<id>`, and paste the values in `https://use.needt.app/admin/system`, section Sign-in providers. Only providers with all values show. Minimum for launch: Google (already works) plus GitHub; the rest can follow | a provider with no values is simply not drawn, so this is not a hard blocker | — |
| O4 | **Gmail restricted-scope verification** (Google Cloud, OAuth consent screen, publishing status). Not checked. Until verified, mail connections for Gmail are limited to test users | mail connection for outsiders | — |
| O5 | **DataRep**: the quote of 150 EUR is in; sign the contract, pay, and send the assigned contact to the agent for `DATAREP_CONTACT` in `src/lib/legal/operator.ts` | the privacy pages print interim wording until then | A7 |
| O6 | **Console checks** from `docs/strategy/2026-10-13-legal-facts-verified.md` (that file is in the owner's checkout, not yet on `main`): R2 bucket location (P12), Resend region (P14), Sentry "Prevent Storing of IP Addresses" and region (P15), Docker and proxy log rotation at or below 30 days (P16), Hetzner location `hel1` (P11) | the published privacy text states these as facts | — |
| O7 | **SQL checks on prod** (no DB access for agents): `select count(*) from "TrialGrant" where "emailKey" like '%@%'` must be 0; `select count(*) from "ConnectedAccount" where "accessToken" not like 'enc:v1:%'` must be 0 | the privacy text claims hashed trial emails and encrypted tokens | — |
| O8 | Create a read-only key for the backup bucket and hand it to the agent for the restore drill, or run the drill commands in A1 yourself | backups have never been restored | A1 |
| O9 | **Switch on launch day** (section 3) | — | — |
| O10 | Decide GitHub bug reports: keep off (default; text must not promise GitHub copies) or create a private repo and set both `GITHUB_BUG_REPORT_REPO` and `GITHUB_BUG_REPORT_TOKEN` | public default repo would leak reports | — |
| O11 | Approve the legal text with a lawyer, or accept the residual risk in writing: legal flags T2 (private person or sole proprietor), P6 (tax record retention), P17 (DPF or SCC per US vendor), P18, P19 | money and legal actions are owner-only | — |

---

## 3. Launch-day switch

Flags are rows in `FeatureFlag`, read on every check; no restart is needed. Run
inside the production `needt` container (`/app`), dry run first:

```bash
node scripts/admin/set-flag.cjs --key billing_checkout --enabled true
node scripts/admin/set-flag.cjs --key billing_checkout --enabled true --confirm
node scripts/admin/set-flag.cjs --key signups_open --enabled true
node scripts/admin/set-flag.cjs --key signups_open --enabled true --confirm
```

Order: `billing_checkout` first (only after O1 is approved), then
`signups_open`. `--enabled true` also sets rollout to 100, which
`signups_open` requires. Rollback is the same command with `--enabled false`.
Verify: `curl https://use.needt.app/api/auth/public-signup` returns
`{"enabled":true}`. Then switch the landing waitlist form to a sign-up link (agent PR, task for the day before).

---

## 4. After launch, in this order

From the owner interview (`docs/strategy/2026-10-12-owner-interview.md`,
12 Oct; that file is in the owner's checkout, not yet on `main`).

1. **Remote MCP with the API**, finished (canonical host, directory listings).
2. **Import from other tools**: Todoist and Notion exist (#136, #141); next GitHub and Linear, then Slack and Telegram.
3. **Growth channels**, which matter more than features for the stated fear ("nobody comes"): build in public (brand and personal accounts on X, Threads, Instagram), MCP and integration directories, Product Hunt and communities, SEO. Public posts need an owner "yes".
4. **Agent at the centre**: acts on its own with Undo; irreversible actions (mail, deletion) need confirmation. Metered in actions.
5. **Native mobile app**, immediately after launch per the owner; the interview notes this is the costliest item at 10–20 h/week and should be decided on first-month numbers.
6. **Design is frozen**: spot fixes only.
7. **Review at launch + 3 months**, by number of payers, day-30 retention, and share of users who connect a second data source.

Support is answered by AI; the owner sees the hard cases. Early users keep $7;
newcomers will cost more after a year.

---

## 5. Not authorized

No seat billing, no cross-workspace views, no third-party document storage, no
physical deletion of user content outside account deletion, no read receipts,
no audio transcription, no new AI scheduler.

---

## 6. Where things live

| Need | File |
| --- | --- |
| Operations, backups, restore drill | `docs/operations-runbook.md` |
| Sign-in provider setup | `docs/operations/sign-in-providers.md` |
| Legal sources and DataRep value | `docs/legal/README.md`, `src/lib/legal/operator.ts` |
| Remote MCP and connector API | `docs/connector-api.md`, `src/lib/mcp-config.ts` |
| Prices, trial, AI limits | `docs/plans/13-pricing.md` |
| Design rules | `docs/handoff/PORT.md` |
| Flags | `src/lib/feature-flags-keys.ts`, `scripts/admin/set-flag.cjs` |
