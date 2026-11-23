import { newDate } from "@/lib/date-utils";
import type { MemorySource } from "@/lib/needt3/hooks/memories";

/** Where a memory line came from, in the words the person sees. */
export const SOURCE_LABEL: Record<MemorySource, string> = {
  chat: "You told Ask",
  inferred: "Learned",
  habit: "Your work habits",
  document: "Your documents",
  mail: "Your mail subjects",
  assistant: "Saved by an assistant",
};

/** Shown when the API sends a source this build has no label for yet. */
export const UNKNOWN_SOURCE_LABEL = "Saved";

/**
 * The label of a source. The API can send a source added after this build was
 * made (the enum grows on the server first), so an unmapped, empty or missing
 * one reads "Saved" instead of "undefined".
 */
export function memorySourceLabel(source: string | null | undefined): string {
  if (source && Object.hasOwn(SOURCE_LABEL, source)) {
    return SOURCE_LABEL[source as MemorySource];
  }
  return UNKNOWN_SOURCE_LABEL;
}

export const memoryDay = (iso: string) => {
  const date = newDate(iso);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

/** "Learned, Nov 23, 2026": the line under a memory. Never says "undefined". */
export function memoryCaption(
  source: string | null | undefined,
  updatedAt: string | null | undefined
): string {
  const day = updatedAt ? memoryDay(updatedAt) : "";
  const label = memorySourceLabel(source);
  return day ? `${label}, ${day}` : label;
}
