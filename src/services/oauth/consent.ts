import type { McpScope } from "@/lib/mcp-config";

/** The request parameters a consent form carries back, unchanged. */
export const AUTHORIZE_PARAMS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "state",
  "scope",
  "code_challenge",
  "code_challenge_method",
  "resource",
] as const;

/**
 * What the person grants from what the client asked for. Reading is the
 * floor of any grant; writing and mail are their own choices, and mail is
 * never granted unless asked for and ticked.
 *
 * Admin read is offered to an admin whether or not the client asked for it
 * (claude.ai asks only for what the challenge names, and the challenge never
 * names it), but it is granted only when the person is an admin right now
 * and ticked the box, which starts unticked. RFC 6749 §3.3 lets the server
 * issue a scope different from the one requested.
 */
export function grantedScopes(
  requested: readonly McpScope[],
  choices: { write: boolean; mail: boolean; admin?: boolean },
  person: { isAdmin: boolean } = { isAdmin: false }
): McpScope[] {
  const granted: McpScope[] = [];
  if (requested.includes("needt.read") || requested.includes("needt.write")) {
    granted.push("needt.read");
  }
  if (requested.includes("needt.write") && choices.write) {
    granted.push("needt.write");
  }
  if (requested.includes("mail.read") && choices.mail) {
    granted.push("mail.read");
    if (!granted.includes("needt.read")) granted.unshift("needt.read");
  }
  if (choices.admin && person.isAdmin && granted.length) {
    granted.push("needt.admin.read");
  }
  return granted;
}

export const SCOPE_LABELS: Record<McpScope, string> = {
  "needt.read": "See your tasks, projects, calendar, pages and habits",
  "needt.write": "Create and change them, and run the scheduler",
  "mail.read": "See your mail: senders, subjects and snippets",
  "needt.admin.read":
    "Read admin data: users, sign-ups, plans, flags, logs and bug reports",
};

/**
 * The workspaces a person can limit a connection to. The personal workspace
 * is created lazily on first access; resolving access first makes sure a
 * person who never opened the app still has one to pick.
 */
export async function consentWorkspaces(userId: string) {
  const [{ resolveWorkspaceAccess }, { listUserWorkspaces }] =
    await Promise.all([
      import("@/lib/auth/workspace-auth"),
      import("@/services/workspaces/workspace-service"),
    ]);
  await resolveWorkspaceAccess({ userId });
  return listUserWorkspaces(userId);
}
