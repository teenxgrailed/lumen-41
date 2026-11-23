/**
 * The words of the idea cards. The app's screens are English only today (the
 * rows, the plan and the sheets are written in place), so these are too; the
 * design lab's Russian pair (Взять / Пропустить) waits for a locale layer to
 * exist, and is dropped in here when it does.
 */
export const IDEA_COPY = {
  idea: "Idea",
  take: "Take it",
  skip: "Skip",
  hidden: "Hidden for 7 days",
  undo: "Undo",
  min: "min",
  addedToday: "Added to Today",
  addedLater: (day: string) => `Added for ${day}`,
  added: "Added to your tasks",
} as const;
