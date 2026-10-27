/**
 * A tab opened before a deploy keeps calling server actions (and RSC chunks)
 * that the new build no longer has. Next answers "Failed to find Server
 * Action" and the client throws "An unexpected response was received from
 * the server". Both mean the same thing to a person: the page is old.
 */
const STALE_PATTERNS = [
  /failed to find server action/i,
  /unexpected response was received from the server/i,
  /server reference id did not match/i,
];

export function isStaleDeploymentMessage(message: unknown): boolean {
  if (typeof message !== "string") return false;
  return STALE_PATTERNS.some((pattern) => pattern.test(message));
}

export function staleDeploymentReason(reason: unknown): boolean {
  if (reason instanceof Error) return isStaleDeploymentMessage(reason.message);
  return isStaleDeploymentMessage(reason);
}

/**
 * A build SHA is 40 hex characters; a Next server action id is 42 (a prefix
 * byte plus a 40 hex hash). A `Next-Action` header that is exactly 40 hex is
 * never a real action of ours, so the edge refuses it without running the app.
 */
export function isBogusActionId(value: string | null): boolean {
  return value !== null && /^[0-9a-f]{40}$/i.test(value.trim());
}
