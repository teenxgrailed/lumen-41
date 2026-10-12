/**
 * The Mailbox's notices. Words the prototype has come from its extracted
 * strings (docs/port/prototype/port/strings/en.json); the few it never had
 * (taking a task back, the sync notices) live here, once, so a notice is not
 * retyped in a controller.
 */
import strings from "../../../../docs/port/prototype/port/strings/en.json";

const screen = strings["MailScreen.jsx"];
const phone = strings["phone-mail.jsx"];

export const notices = {
  archived: screen.MailScreen.archived,
  movedToTrash: screen.MailScreen.moved_to_trash,
  markedUnread: screen._module.marked_as_unread,
  markedRead: phone.pmlActions.marked_as_read,
  taskForLater: screen.mlMakeTask.task_made_for_later,
  taskInInbox: screen.mlMakeTask.task_made_its_in_inbox,
  addedToCalendar: screen.mlToCalendar.added_to_calendar_tomorrow_10_00,
  noSubject: screen.MailScreen.no_subject,
  // not in the prototype
  taskTakenBack: "Task moved to Trash",
  syncing: "Syncing your mail…",
  nothingToSync: "There is no connected account to sync.",
  syncFailed: "Could not start the sync. Try again in a moment.",
} as const;
