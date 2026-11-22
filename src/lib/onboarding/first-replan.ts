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

/** "Demo: sync with Alex" -> "Sync with Alex": the name without the demo tag. */
export function plainDemoTitle(title: string): string {
  const bare = title.replace(/^Demo:\s*/i, "");
  return bare ? bare[0].toUpperCase() + bare.slice(1) : title;
}

/**
 * A move the card may offer: the task lands after the meeting ends and after
 * `now`. The scheduler picks the slot; this is the check that the demo never
 * reads as a move into the past or to before the meeting.
 */
export function isLaterMove(
  to: { start: string },
  demo: Pick<FirstReplanState, "meeting">,
  now: Date
): boolean {
  const at = Date.parse(to.start);
  return (
    Number.isFinite(at) &&
    at > now.getTime() &&
    at >= Date.parse(demo.meeting.end)
  );
}
