/**
 * What a sandbox account may not do (docs/sandbox-accounts.md). Pure and
 * edge-safe: no Prisma, so the middleware can read the route table. The
 * database-backed checks that use it live in `./guard`.
 *
 * A sandbox account is one the app provisions itself (`User.sandboxKind`): a
 * directory reviewer now, a public demo later. It works on its own data like
 * any account, including through MCP, and is wiped every night. Anything that
 * reaches outside that data, costs money, or would outlive the reset is
 * refused here.
 */

export type SandboxCapability =
  /** Email, password or name of the account owner. */
  | "account_identity"
  | "account_delete"
  /** Account export: mailed and downloadable outside the reset. */
  | "account_export"
  /** Checkout, the billing portal, trials, any plan change. */
  | "billing"
  /** Google / Outlook / CalDAV / IMAP / imports / task sync / integrations. */
  | "providers"
  | "webhooks"
  /** The personal `needt_…` token. MCP OAuth is the way in instead. */
  | "api_tokens"
  | "invites"
  /** Public page links, page and moodboard sharing, public booking pages. */
  | "public_share"
  | "admin"
  /** Page and moodboard uploads. Task files are capped instead. */
  | "uploads"
  /** Mail we would send on the account's behalf. */
  | "outbound_email";

export const SANDBOX_LOCKED_CODE = "SANDBOX_LOCKED";

/** Task attachments a sandbox account may add, per file. */
export const SANDBOX_UPLOAD_MAX_BYTES = 1024 * 1024;

/** Hosted AI actions a sandbox account gets per day (the reset clears usage). */
export const SANDBOX_AI_DAILY_ACTION_CAP = Math.max(
  0,
  Number(process.env.SANDBOX_AI_DAILY_ACTION_CAP || 15)
);

const WHAT: Record<SandboxCapability, string> = {
  account_identity: "change the account's email, password or name",
  account_delete: "delete the account",
  account_export: "export the account",
  billing: "start a checkout or change the plan",
  providers: "connect calendars, mail or other services",
  webhooks: "set up webhooks",
  api_tokens: "create personal API tokens (connect through MCP OAuth instead)",
  invites: "invite members",
  public_share: "share publicly",
  admin: "use admin tools",
  uploads: "upload files here",
  outbound_email: "send email",
};

/** The 403 message for a refused capability. */
export function sandboxLockedMessage(capability: SandboxCapability): string {
  return `This is a sandbox account that resets nightly: it cannot ${WHAT[capability]}.`;
}

export function sandboxLockedBody(capability: SandboxCapability) {
  return {
    error: sandboxLockedMessage(capability),
    code: SANDBOX_LOCKED_CODE,
    capability,
  };
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
const WRITES: readonly Method[] = ["POST", "PUT", "PATCH", "DELETE"];
const ALL: readonly Method[] = ["GET", ...WRITES];

interface Rule {
  pattern: RegExp;
  methods: readonly Method[];
  capability: SandboxCapability;
}

const SEG = "[^/]+";

/**
 * Cookie-session API routes a sandbox account is refused, checked by the
 * middleware before the route runs. Bearer routes (`/api/connect/*`, MCP)
 * cannot be read there and check in the route through `./guard`.
 */
export const SANDBOX_API_RULES: readonly Rule[] = [
  // Account
  {
    pattern: /^\/api\/account\/deletion$/,
    methods: WRITES,
    capability: "account_delete",
  },
  {
    pattern: /^\/api\/account\/export$/,
    methods: WRITES,
    capability: "account_export",
  },
  {
    pattern: /^\/api\/auth\/reset-password\//,
    methods: WRITES,
    capability: "account_identity",
  },
  {
    pattern: /^\/api\/auth\/email-verification\/request$/,
    methods: WRITES,
    capability: "outbound_email",
  },
  // Billing
  {
    pattern: /^\/api\/billing\/(checkout|portal|trial)$/,
    methods: WRITES,
    capability: "billing",
  },
  // Providers: every write, and the GET that starts an OAuth hop.
  {
    pattern: /^\/api\/calendar\/(google|outlook|caldav)(\/|$)/,
    methods: WRITES,
    capability: "providers",
  },
  {
    pattern: /^\/api\/calendar\/(google|outlook|caldav)\/auth$/,
    methods: ALL,
    capability: "providers",
  },
  {
    pattern: /^\/api\/mail\/accounts(\/|$)/,
    methods: WRITES,
    capability: "providers",
  },
  {
    pattern: /^\/api\/mail\/(oauth|sync)(\/|$)/,
    methods: ALL,
    capability: "providers",
  },
  {
    pattern: /^\/api\/imports(\/|$)/,
    methods: WRITES,
    capability: "providers",
  },
  {
    pattern: /^\/api\/imports\/(notion|todoist)\//,
    methods: ALL,
    capability: "providers",
  },
  {
    pattern: /^\/api\/import\/tasks$/,
    methods: WRITES,
    capability: "providers",
  },
  { pattern: /^\/api\/task-sync\//, methods: WRITES, capability: "providers" },
  {
    pattern: /^\/api\/integrations\/(connect|callback|actions|disconnect)$/,
    methods: ALL,
    capability: "providers",
  },
  { pattern: /^\/api\/pinterest\//, methods: ALL, capability: "providers" },
  {
    pattern: new RegExp(`^/api/moodboards/${SEG}/pinterest$`),
    methods: WRITES,
    capability: "providers",
  },
  { pattern: /^\/api\/ai\/oauth\//, methods: ALL, capability: "providers" },
  // Own AI keys and custom endpoints: the hosted AI (capped) is the sandbox's.
  { pattern: /^\/api\/ai-settings$/, methods: WRITES, capability: "providers" },
  // Tokens and webhooks (connector settings: POST mints a token, PATCH sets the webhook)
  {
    pattern: /^\/api\/connector-settings$/,
    methods: ["POST"],
    capability: "api_tokens",
  },
  {
    pattern: /^\/api\/connector-settings$/,
    methods: ["PATCH", "PUT"],
    capability: "webhooks",
  },
  // Members
  {
    pattern: new RegExp(`^/api/workspaces/${SEG}/invites(/|$)`),
    methods: ["POST", "PUT", "PATCH"],
    capability: "invites",
  },
  // Public sharing
  {
    pattern: new RegExp(`^/api/pages/${SEG}/publication$`),
    methods: ["POST", "PUT", "PATCH"],
    capability: "public_share",
  },
  {
    pattern: new RegExp(`^/api/pages/${SEG}/permissions$`),
    methods: ["POST", "PUT", "PATCH"],
    capability: "public_share",
  },
  {
    pattern: new RegExp(`^/api/moodboards/${SEG}/permissions$`),
    methods: ["POST", "PUT", "PATCH"],
    capability: "public_share",
  },
  {
    pattern: /^\/api\/booking-pages(\/|$)/,
    methods: ["POST", "PUT", "PATCH"],
    capability: "public_share",
  },
  // Uploads
  {
    pattern: new RegExp(`^/api/pages/${SEG}/assets$`),
    methods: ["POST", "PUT"],
    capability: "uploads",
  },
  {
    pattern: new RegExp(`^/api/moodboards/${SEG}/items/upload$`),
    methods: ["POST", "PUT"],
    capability: "uploads",
  },
  // Admin (requireAdmin refuses too)
  { pattern: /^\/api\/admin(\/|$)/, methods: ALL, capability: "admin" },
];

/** The capability a sandbox account would need for this API request, or null. */
export function sandboxApiCapability(
  pathname: string,
  method: string
): SandboxCapability | null {
  const verb = method.toUpperCase() as Method;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  for (const rule of SANDBOX_API_RULES) {
    if (rule.methods.includes(verb) && rule.pattern.test(path)) {
      return rule.capability;
    }
  }
  return null;
}

/** App pages a sandbox session is sent away from. */
export function isSandboxBlockedPage(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}
