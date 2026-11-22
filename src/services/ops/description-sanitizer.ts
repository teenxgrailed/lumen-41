import { RICH_TEXT_DESCRIPTION_PREFIX } from "@/lib/task-description-prefix";

import { OpError } from "./errors";

/**
 * The op registry is also loaded by the worker (easy start runs ops there),
 * and the worker bundle must not contain the HTML sanitizer (its jsdom cannot
 * run inside the esbuild bundle). So the ops reach the sanitizer through this
 * slot: `services/ops/index.ts`, which only the app loads, registers the real
 * one. Plain text needs no sanitizer. A rich (HTML) description in a runtime
 * that never registered one is refused rather than stored unsanitized.
 */
type Sanitizer = (value: unknown) => string | undefined;

let sanitizer: Sanitizer | null = null;

export function setDescriptionSanitizer(next: Sanitizer) {
  sanitizer = next;
}

export function sanitizeDescriptionForStorage(
  value: unknown
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!trimmed.startsWith(RICH_TEXT_DESCRIPTION_PREFIX)) return trimmed;
  if (!sanitizer) {
    throw new OpError(
      "INVALID_INPUT",
      "Rich text descriptions cannot be written from this runtime"
    );
  }
  return sanitizer(trimmed);
}
