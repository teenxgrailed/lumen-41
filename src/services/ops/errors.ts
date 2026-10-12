export type OpErrorCode =
  | "OP_NOT_FOUND"
  | "INVALID_INPUT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNSUPPORTED"
  | "PROJECT_ARCHIVED"
  | "APPLIED_NOT_UNDOABLE";

const STATUS: Record<OpErrorCode, number> = {
  OP_NOT_FOUND: 404,
  INVALID_INPUT: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNSUPPORTED: 422,
  PROJECT_ARCHIVED: 409,
  APPLIED_NOT_UNDOABLE: 500,
};

export class OpError extends Error {
  readonly status: number;

  constructor(
    readonly code: OpErrorCode,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "OpError";
    this.status = STATUS[code];
  }
}
