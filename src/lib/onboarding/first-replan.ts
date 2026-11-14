/**
 * The first-replan demo, client-safe: the marker and the two titles. The rows
 * themselves live in `@/services/onboarding/first-replan-demo`.
 */

/** `Task.source` of the two demo rows; the one way to tell them from real tasks. */
export const FIRST_REPLAN_DEMO_SOURCE = "needt-first-replan-demo";
export const DEMO_TASK_TITLE = "Demo: write the weekly plan";
export const DEMO_MEETING_TITLE = "Demo: sync with Alex";

/** What `GET /api/onboarding/first-replan` returns for the demo. */
export interface FirstReplanItem {
  id: string;
  title: string;
  start: string;
  end: string;
}

export interface FirstReplanState {
  meeting: FirstReplanItem;
  task: FirstReplanItem;
  /** The meeting still sits on the task: replanning has something to move. */
  conflict: boolean;
}
