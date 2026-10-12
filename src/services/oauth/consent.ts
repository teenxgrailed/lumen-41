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
 */
export function grantedScopes(
  requested: readonly McpScope[],
  choices: { write: boolean; mail: boolean }
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
  return granted;
}

export const SCOPE_LABELS: Record<McpScope, string> = {
  "needt.read": "See your tasks, projects, calendar, pages and habits",
  "needt.write": "Create and change them, and run the scheduler",
  "mail.read": "See your mail: senders, subjects and snippets",
};
