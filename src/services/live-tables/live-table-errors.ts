/**
 * Known live-table failures as an HTTP status and a message the caller can
 * act on. Shared by the REST routes and the MCP tools so both answer alike.
 * Anything else returns null and is treated as an unexpected error.
 */
import {
  LiveTableNotFoundError,
  LiveTablePageNotEditableError,
} from "@/services/live-tables/live-table-service";
import {
  PageCollaborationActiveError,
  PageRevisionConflictError,
} from "@/services/pages/page-write-path";
import { ZodError } from "zod";

import { LiveTableInputError } from "@/lib/live-tables/schema";

export function liveTableErrorStatus(
  error: unknown
): { status: number; error: string } | null {
  if (error instanceof LiveTableInputError) {
    return { status: 400, error: error.message };
  }
  if (error instanceof ZodError) {
    return {
      status: 400,
      error: error.issues.map((issue) => issue.message).join("; "),
    };
  }
  if (error instanceof LiveTableNotFoundError) {
    return { status: 404, error: error.message };
  }
  if (error instanceof LiveTablePageNotEditableError) {
    return { status: 403, error: error.message };
  }
  if (error instanceof PageCollaborationActiveError) {
    return {
      status: 409,
      error:
        "This page is open for live editing in Needt, so a table cannot be placed on it now. Create the table on a new page (leave pageId out), or try again once the page is closed.",
    };
  }
  if (error instanceof PageRevisionConflictError) {
    return { status: 409, error: "The page changed while writing. Try again." };
  }
  if (error instanceof Error && error.message === "Parent page not found") {
    return { status: 404, error: error.message };
  }
  if (error instanceof Error && error.message === "Page has too many blocks") {
    return { status: 413, error: error.message };
  }
  return null;
}
