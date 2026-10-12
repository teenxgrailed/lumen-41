/**
 * Phone Tasks / Projects copy. Single words and the fragments the prototype
 * built from pieces come from the extracted strings
 * (docs/port/prototype/port/strings/en.json); the empty lines of PTK_EMPTY
 * were not extracted and are kept here as the prototype wrote them.
 */
import strings from "../../../../../docs/port/prototype/port/strings/en.json";

export const copy = strings["phone-tasks.jsx"];

/** `PTK_EMPTY` (phone-tasks.jsx 173). */
export const EMPTY = {
  inbox: "Inbox is clear. Anything you jot down without a day lands here.",
  today: "All clear for today ✓",
  upcoming: "Nothing coming up this week.",
  all: "No tasks yet — pull down to add one.",
} as const;

/** Snacks that are not in the extracted strings. */
export const SAY = {
  tomorrow: copy.X.moved_to_tomorrow,
  saved: copy.PtkProjectPage.saved,
} as const;
