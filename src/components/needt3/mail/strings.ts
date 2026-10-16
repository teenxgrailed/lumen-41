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
  connectedGmail: "Gmail connected. Importing your mail…",
  connectedOutlook: "Outlook connected. Importing your mail…",
  connectFailed: "Could not connect the mailbox.",
  mailboxLimit: "Your plan has no room for another mailbox.",
  nothingToSync: "There is no connected account to sync.",
  syncFailed: "Could not start the sync. Try again in a moment.",
} as const;

/**
 * The header's words that the prototype never had to say, because it could
 * send: why Sent and Drafts are held, where New message goes, and what a chip
 * that is not connected says.
 */
export const headerCopy = {
  sentHeld: "Sent folder isn't synced yet",
  draftsHeld: "Drafts folder isn't synced yet",
  newMessage: screen.MailScreen.new_message,
  writeIn: "Write in…",
  newMessageOpens: (provider: string) => `Opens ${provider} in a new tab`,
  noAccountToWrite: "Connect a mail account to write",
  accountsLoading: "Loading your mail accounts",
  accountsFailed: "Couldn't load your mail accounts",
  notConnected: (provider: string) =>
    `${provider} isn't connected — connect it in Connections`,
  // the prototype's words for it ("No mail account connected", the composer's
  // From line); the line is the phone Mailbox's, so both faces say the same
  noAccountTitle:
    strings["MailScreen.jsx"].MlComposer.no_mail_account_connected,
  noAccountLine: "Connect Gmail or Outlook and your mail shows up here.",
  openConnections: "Open Connections",
  down: (since: string | null) =>
    since
      ? `Disconnected since ${since} — reconnect below`
      : "Disconnected — reconnect below",
} as const;
