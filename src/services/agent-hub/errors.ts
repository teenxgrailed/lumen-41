export type HubErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID"
  | "ALREADY_CLAIMED"
  | "LEASE_LOST"
  | "STALE"
  | "TERMINAL"
  | "NOT_HELD"
  | "NEEDS_OWNER"
  | "APPROVAL_REQUIRED"
  | "NOT_ELIGIBLE"
  | "BLOCKED_BY"
  | "CYCLE"
  | "RATE_LIMITED"
  | "CONFLICT"
  | "TOKEN_IN_USE"
  | "PLAN_LIMIT";

const STATUS: Record<HubErrorCode, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  INVALID: 400,
  ALREADY_CLAIMED: 409,
  LEASE_LOST: 409,
  STALE: 409,
  TERMINAL: 409,
  NOT_HELD: 409,
  NEEDS_OWNER: 409,
  APPROVAL_REQUIRED: 409,
  NOT_ELIGIBLE: 403,
  BLOCKED_BY: 409,
  CYCLE: 409,
  RATE_LIMITED: 429,
  CONFLICT: 409,
  TOKEN_IN_USE: 409,
  PLAN_LIMIT: 402,
};

/** A refusal a caller can act on: a code, a status and what to do next. */
export class HubError extends Error {
  readonly status: number;
  constructor(
    readonly code: HubErrorCode,
    message: string,
    readonly extra?: Record<string, unknown>,
    status?: number
  ) {
    super(message);
    this.name = "HubError";
    this.status = status ?? STATUS[code];
  }

  body() {
    return {
      status: this.status,
      error: this.code,
      message: this.message,
      ...(this.extra ?? {}),
    };
  }
}
