/**
 * Feature flag keys. Client-safe: no Prisma, no `crypto`. The evaluation
 * itself (`isFeatureEnabled`) is server-only and lives in `feature-flags.ts`.
 */

/**
 * The v3 paywall's checkout button. Off unless a FeatureFlag row turns it on:
 * payments stay closed until the legal pages are published and the payment
 * provider's review passes. `GET /api/billing` reports it as `checkoutEnabled`.
 */
export const BILLING_CHECKOUT = "billing_checkout";

/**
 * New accounts. Closed unless a FeatureFlag row says `enabled` with
 * `rolloutPercentage` 100: until launch, existing people keep signing in and
 * everybody else is sent to the waitlist at needt.app. Read anonymously by
 * `areSignupsOpen` in `@/lib/auth/signups`, so per-user rollout and overrides
 * do not apply to it.
 */
export const SIGNUPS_OPEN = "signups_open";

/**
 * Chronotype energy curve in auto-scheduling (`/api/energy/profile`). Off
 * unless a FeatureFlag row turns it on; Pro only on top of that. A person's
 * own energy hours always win over the curve.
 */
export const ENERGY_CURVE = "energy_curve";

/**
 * Focus blocking profiles (`/api/blocking/*`, the `needt_blocking` MCP tools).
 * Off unless a FeatureFlag row turns it on; Pro only on top of that.
 */
export const FOCUS_BLOCKING = "focus_blocking";

/**
 * Where a new account starts: the 18-screen `/start` onboarding when on,
 * first-run `/setup` when off. Off unless a FeatureFlag row turns it on;
 * per-user rollout and overrides apply (`isFeatureEnabled`), so one account
 * can be moved onto it before everybody else. Read for new accounts and by the
 * Today resume guard; people who already finished onboarding are never sent
 * anywhere.
 */
export const ONBOARDING_V3 = "onboarding_v3";

/**
 * Every flag the code reads, with what it does. The admin API lists these and
 * creates the row on the first write, so a flag with no row yet (default off)
 * can still be turned on from `/api/admin/feature-flags/[key]`.
 */
/**
 * App-provisioned sandbox accounts (docs/sandbox-accounts.md): the reviewer
 * account from `SANDBOX_REVIEWER_EMAIL` / `SANDBOX_REVIEWER_PASSWORD` and its
 * nightly reset. Off unless a FeatureFlag row turns it on for everybody (read
 * with `isFeatureEnabledForEveryone`). The lockdown of an account that is
 * already a sandbox never depends on this flag.
 */
export const SANDBOX_ACCOUNTS = "sandbox_accounts";

/**
 * The agent hub: handoffs and notes between agents (`needt_agent_*` and
 * `needt_memory_*` MCP tools, `/api/connect/agent-hub/*`, the Agents screen).
 * On for everybody since migration 20261103200000_agent_hub_for_everyone. A
 * per-user override (`scripts/admin/set-flag-override.cjs` or the admin
 * feature-flags API) can still switch it off for one account; never
 * hard-code an account.
 */
export const AGENT_HUB = "agent_hub";

/**
 * Apple In-App Purchase (StoreKit 2) for the iOS and Mac App Store apps:
 * `/api/billing/apple/*` (docs/billing/apple-iap.md). Off unless a FeatureFlag
 * row turns it on; per-user rollout and overrides apply to the account-token
 * and transactions routes. App Store Server Notifications are always verified
 * and recorded, so a purchase made while the flag was on is never lost.
 */
export const APPLE_IAP = "apple_iap";

/**
 * QUIT habits and habit presence: `Habit.kind = QUIT`, `HabitEvent`, the events
 * and quit-summary routes, the MCP tools and the habit reminders. Off for
 * everybody; Pro only on top of the flag (`quitHabitsEnabled`).
 */
export const HABITS_QUIT = "habits_quit";

/**
 * Needt AI on the person's own ChatGPT plan (Sign in with ChatGPT plan usage,
 * `/api/ai/chatgpt-plan`, the `provider=chatgpt_plan` param of `/api/ai/chat`).
 * Off for everybody. Even with the flag on, the feature stays invisible until
 * the deployment has `OPENAI_SIWC_CLIENT_ID`: OpenAI approves hosted paid apps
 * one by one, so no client id means no feature.
 */
export const AI_CHATGPT_PLAN = "ai_chatgpt_plan";

/**
 * The first replan, in the first two minutes: a new account's sample day gets
 * one demo meeting on top of one demo task, and Today offers to replan it
 * (preview, then Keep). On at 100% for new accounts from the
 * `20261115120000_first_replan_onboarding_for_new_accounts` migration (owner
 * decision 15.11.2026); per-user rollout and overrides still apply
 * (`isFeatureEnabled`). Reads and seeds only for accounts the flag is on for,
 * so turning it off hides the card and stops new demos.
 *
 * //todo: the rollout ends 30.11.2026, but a flag has no end date (a row is
 * on, off or a percentage). Until the flag system can expire a flag, turn it
 * off by hand from the admin feature-flag API on 01.12.2026.
 */
export const FIRST_REPLAN_ONBOARDING = "first_replan_onboarding";

/**
 * Needt Budget as a place in the sidebar and the phone menu (`/budget`, a
 * frame on budget.needt.app; openspec `add-budget-module`). Off for everybody;
 * Free sees a locked row and a promo, Pro sees Budget.
 */
export const BUDGET_MODULE = "budget_module";

/**
 * Needt Pro opens Needt Budget: the `needt_plan` claim ("pro" | "free") in the
 * id_token and userinfo Needt gives Budget, which Budget maps to its own
 * access. Off for everybody until the owner decides the tariff; without it
 * the claim is not sent and Budget keeps its own billing.
 */
export const BUDGET_PRO_ACCESS = "budget_pro_access";

/**
 * The Habits and Goals card screens: today's habits as a stack of cards you
 * swipe done, a month grid under it, and goals as cards with their next step
 * and a risk hint. Read on the server (the Habits and Goals pages); off or
 * unreadable means the existing screens, unchanged.
 */
export const HABITS_CARDS_V1 = "habits_cards_v1";

/**
 * The 20:00 habit push ("3 habits left today"), sent in the person's own time
 * zone only when habits are still open. Off for everybody until a FeatureFlag
 * row turns it on; with it off the worker does no work for it.
 */
export const HABIT_EVENING_PUSH = "habit_evening_push";

/**
 * Home ("Today") in three blocks: one Now card, the day list, overdue as one
 * row, and the right rail in the project-card frame. Off for everybody; with
 * it off the current Home renders unchanged, so rollback is one switch.
 */
export const HOME_V2 = "home_v2";

export const KNOWN_FEATURE_FLAGS: Readonly<Record<string, string>> = {
  [BILLING_CHECKOUT]: "The paywall's checkout button.",
  [SIGNUPS_OPEN]: "New accounts (needs 100% rollout; no per-user overrides).",
  [ENERGY_CURVE]: "Chronotype energy curve in auto-scheduling (Pro).",
  [FOCUS_BLOCKING]: "Focus blocking profiles (Pro).",
  [ONBOARDING_V3]: "New accounts start in /start instead of /setup.",
  [SANDBOX_ACCOUNTS]:
    "Reviewer sandbox account from env, reset nightly (needs 100% rollout).",
  [APPLE_IAP]: "Apple In-App Purchase in the iOS / Mac App Store apps.",
  [AGENT_HUB]:
    "Agent hub: handoffs and notes between agents (per-user override).",
  [HABITS_QUIT]: "QUIT habits and habit presence (Pro).",
  [AI_CHATGPT_PLAN]:
    "Needt AI on the person's own ChatGPT plan (needs OPENAI_SIWC_CLIENT_ID).",
  [FIRST_REPLAN_ONBOARDING]:
    "Demo meeting on a new account's Today, with a first replan and Keep.",
  [BUDGET_MODULE]: "Needt Budget as a place in the sidebar (frame).",
  [HABITS_CARDS_V1]: "Habit card stack, month grid and goal cards.",
  [HABIT_EVENING_PUSH]: "20:00 push with the habits still open today.",
  [HOME_V2]:
    "Home in three blocks: Now card, day list, overdue row, framed rail.",
  [BUDGET_PRO_ACCESS]:
    "Send needt_plan to Needt Budget, so Needt Pro opens Budget (owner's yes).",
};

export const isKnownFeatureFlag = (key: string): boolean =>
  Object.prototype.hasOwnProperty.call(KNOWN_FEATURE_FLAGS, key);
