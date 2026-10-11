import {
  LuArchive,
  LuCalendarClock,
  LuCircleCheck,
  LuForward,
  LuInbox,
  LuMail,
  LuMailOpen,
  LuRotateCcw,
} from "react-icons/lu";

import type { V3MailThread } from "@/lib/needt3/map";

import type { Mailbox } from "../../mail/useMailbox";
import type { PkAction } from "../kit";

/** Open a message at its provider (Reply and Forward; mail is read-only here). */
export function openAtProvider(link: string | null) {
  if (link) window.open(link, "_blank", "noopener,noreferrer");
}

/** The three ways to turn a message into something (the sheet's "Make task"). */
export function makeActions(m: V3MailThread, box: Mailbox): PkAction[] {
  return [
    {
      label: "Task for today",
      hint: `“${m.suggestedTask || m.subject}”`,
      icon: <LuCircleCheck size={18} />,
      hue: "var(--accent)",
      onClick: () => void box.makeTask(m, "today"),
      data: { "data-pml-act": "today" },
    },
    {
      label: "Task for later",
      hint: "No date — in Inbox",
      icon: <LuInbox size={18} />,
      hue: "var(--v2p-lav)",
      onClick: () => void box.makeTask(m, "later"),
      data: { "data-pml-act": "later" },
    },
    calendarAction(m, box),
  ];
}

export function calendarAction(m: V3MailThread, box: Mailbox): PkAction {
  return {
    label: "Add to Calendar",
    hint: "Tomorrow 10:00 · 30 min",
    icon: <LuCalendarClock size={18} />,
    glyph: "calendar",
    onClick: () => void box.toCalendar(m),
    data: { "data-pml-act": "calendar" },
  };
}

export function unreadAction(m: V3MailThread, box: Mailbox): PkAction {
  return {
    label: m.isRead ? "Mark as unread" : "Mark as read",
    icon: m.isRead ? <LuMail size={18} /> : <LuMailOpen size={18} />,
    hue: "var(--v2p-lav)",
    onClick: () => void box.toggleRead(m),
    data: { "data-pml-act": "unread" },
  };
}

export function archiveAction(m: V3MailThread, box: Mailbox): PkAction {
  return {
    label: "Archive",
    icon: <LuArchive size={18} />,
    hue: "var(--success)",
    onClick: () => void box.archive(m),
    data: { "data-pml-act": "archive" },
  };
}

/**
 * What holding a row offers (the prototype's list, minus what needs sending
 * or Trash): open, a task (or take it back), the calendar, unread, archive.
 */
export function holdActions(m: V3MailThread, box: Mailbox): PkAction[] {
  const made = box.made.has(m.id);
  return [
    {
      label: "Open",
      icon: <LuMail size={18} />,
      glyph: "mail",
      onClick: () => box.open(m),
      data: { "data-pml-act": "open" },
    },
    ...(made
      ? [
          {
            label: "Take the task back",
            hint: "The thread stays; the task goes",
            icon: <LuRotateCcw size={18} />,
            hue: "var(--accent)",
            // the id of a task still being made is not known yet
            disabled: !box.madeServer.has(m.id),
            onClick: () => void box.takeBack(m),
            data: { "data-pml-act": "untask" },
          } satisfies PkAction,
        ]
      : makeActions(m, box).slice(0, 2)),
    calendarAction(m, box),
    unreadAction(m, box),
    archiveAction(m, box),
  ];
}

/** The sheet's "⋯": the provider's Forward, then the rest. */
export function moreActions(
  m: V3MailThread,
  box: Mailbox,
  link: string | null
): PkAction[] {
  return [
    {
      label: "Forward",
      hint: "Opens the message at your mail provider",
      icon: <LuForward size={18} />,
      hue: "var(--info)",
      disabled: !link,
      onClick: () => openAtProvider(link),
      data: { "data-pml-act": "forward" },
    },
    calendarAction(m, box),
    unreadAction(m, box),
    archiveAction(m, box),
  ];
}
