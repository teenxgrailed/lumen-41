/* WHAT ASK NEEDT IS LOOKING AT — and what it offers because of it.
 *
 * Prototype Chat.jsx `chatScopes` / `chatSuggestions` / `chatGreeting`, as pure
 * functions: the scope follows where you are (the doc you have open, the task
 * you last clicked on this screen, the day on Home and Calendar, else
 * everything) and can be switched from the header chip. The six suggestion
 * cards follow the scope; each one's `say` is the line that is actually sent,
 * with the scope named in it, because the chat backend has no other way to be
 * told what "it" is.
 */

export type AskScope =
  | { kind: "workspace" }
  | { kind: "day"; title: string }
  | { kind: "doc"; title: string }
  | { kind: "task"; id: string; title: string };

export type SuggestionIcon =
  | "plan"
  | "overdue"
  | "summary"
  | "draft"
  | "free"
  | "low"
  | "steps"
  | "moveit"
  | "todos";

export interface Suggestion {
  id: string;
  icon: SuggestionIcon;
  title: string;
  sub: string;
  say: string;
}

export function scopeLabel(sc: AskScope): string {
  switch (sc.kind) {
    case "workspace":
      return "Everything";
    case "day":
      return "This day";
    case "doc":
      return `This doc: ${sc.title}`;
    case "task":
      return `Task: ${sc.title}`;
  }
}

/** Same scope, for keeping a pick while the list is rebuilt. */
export function sameScope(a: AskScope | null, b: AskScope | null): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "workspace") return true;
  if (a.kind === "task" && b.kind === "task") return a.id === b.id;
  return (a as { title: string }).title === (b as { title: string }).title;
}

/** Screens that are about a day. */
const DAY_PLACES = new Set(["today", "calendar"]);

export interface ScopeInputs {
  /** First path segment: "today", "calendar", "pages", … */
  place: string;
  /** The task last clicked on this place, when it is still on the list. */
  task: { id: string; title: string } | null;
  /** The open document's title, when one is open. */
  docTitle: string | null;
  /** "Today" or a weekday name, for the day scope's sentence. */
  dayName: string;
}

/** Every scope that makes sense from here, the one that fits best first. */
export function scopesFor(i: ScopeInputs): AskScope[] {
  const out: AskScope[] = [];
  if (i.task) out.push({ kind: "task", id: i.task.id, title: i.task.title });
  if (i.docTitle !== null) {
    out.push({ kind: "doc", title: i.docTitle || "Untitled" });
  }
  const day: AskScope = { kind: "day", title: i.dayName };
  const dayPlace = DAY_PLACES.has(i.place);
  if (dayPlace) out.push(day);
  out.push({ kind: "workspace" });
  if (!dayPlace) out.push(day);
  return out;
}

/** The cards for a scope, six, the ones that fit it first. */
export function suggestionsFor(sc: AskScope): Suggestion[] {
  const doc = sc.kind === "doc" ? sc.title : null;
  const task = sc.kind === "task" ? sc.title : null;
  const S: Record<string, Suggestion> = {
    plan: {
      id: "plan",
      icon: "plan",
      title: "Plan my day",
      sub: "Fit overdue work into free time",
      say: "Plan my day",
    },
    overdue: {
      id: "overdue",
      icon: "overdue",
      title: "What's overdue?",
      sub: "Past its date, oldest first",
      say: "What's overdue?",
    },
    summary: {
      id: "summary",
      icon: "summary",
      title: "Summarise this doc",
      sub: doc ? `“${doc}” in three lines` : "Or one you @-mention",
      say: doc ? `Summarise the doc “${doc}” in three lines` : "/summarize",
    },
    draft: {
      id: "draft",
      icon: "draft",
      title: "Draft a reply",
      sub: "Short, in your voice, ready to copy",
      say: "Draft a reply to my latest unread email",
    },
    free: {
      id: "free",
      icon: "free",
      title: "Find free time this week",
      sub: "Stretches of an hour or more",
      say: "Find free time this week",
    },
    low: {
      id: "low",
      icon: "low",
      title: "Move low-priority to tomorrow",
      sub: "Make room for what's due",
      say: "Move low-priority tasks to tomorrow",
    },
    steps: {
      id: "steps",
      icon: "steps",
      title: "Break it into steps",
      sub: task ? `“${task}”` : "Three steps you can tick",
      say: task
        ? `Break the task “${task}” into steps`
        : "Break my next task into steps",
    },
    moveit: {
      id: "moveit",
      icon: "moveit",
      title: "Move it to tomorrow",
      sub: "Next free slot, with the reason",
      say: task
        ? `Move the task “${task}” to tomorrow`
        : "Move my next task to tomorrow",
    },
    todos: {
      id: "todos",
      icon: "todos",
      title: "Turn it into tasks",
      sub: "The open to-dos in this doc",
      say: doc
        ? `Turn the open to-dos in the doc “${doc}” into tasks`
        : "Turn this doc into tasks",
    },
  };
  if (doc) return [S.summary, S.todos, S.draft, S.plan, S.free, S.overdue];
  if (task) return [S.steps, S.moveit, S.plan, S.free, S.overdue, S.low];
  if (sc.kind === "day") {
    return [S.plan, S.overdue, S.free, S.low, S.draft, S.summary];
  }
  return [S.plan, S.overdue, S.summary, S.draft, S.free, S.low];
}

/** "Good evening, Maksym": by the hour (prototype `chatGreeting`). */
export function greetingFor(hour: number, name: string | null): string {
  const word =
    hour < 5
      ? "Good evening"
      : hour < 12
        ? "Good morning"
        : hour < 18
          ? "Good afternoon"
          : "Good evening";
  return name ? `${word}, ${name}` : word;
}

/** The line under the greeting: what it is looking at, or what it can do. */
export function helloLine(sc: AskScope): string {
  if (sc.kind === "doc") {
    return `I'm looking at “${sc.title}”. Ask about it, or about your day.`;
  }
  if (sc.kind === "task") {
    return `I'm looking at “${sc.title}”. Ask what to do with it.`;
  }
  return "Ask about your day, your tasks or a doc. I'll show what changes before anything moves.";
}

/** The first word of a person's name, for the greeting. */
export function firstName(full: string | null | undefined): string | null {
  const word = (full ?? "").trim().split(/\s+/)[0] ?? "";
  return word || null;
}

/** The slash commands (prototype CHAT_CMDS) and the line each one sends. */
export interface SlashCommand {
  cmd: string;
  title: string;
  sub: string;
  /** Prefill for the field after the command is picked. */
  fill: string;
}

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    cmd: "/plan",
    title: "Plan my day",
    sub: "Fit overdue work into today's free time",
    fill: "Plan my day",
  },
  {
    cmd: "/summarize",
    title: "Summarise a doc",
    sub: "This doc, or one you @-mention",
    fill: "Summarise ",
  },
  {
    cmd: "/find",
    title: "Find",
    sub: "Tasks and docs — or “free time”",
    fill: "Find ",
  },
  {
    cmd: "/draft",
    title: "Draft a reply",
    sub: "Short, in your voice, ready to copy",
    fill: "Draft a reply to ",
  },
];

/** The commands whose name starts with what was typed after the slash. */
export function matchCommands(draft: string): SlashCommand[] {
  const m = /^\/(\w*)$/.exec(draft);
  if (!m) return [];
  const q = m[1].toLowerCase();
  return SLASH_COMMANDS.filter((c) => c.cmd.slice(1).startsWith(q));
}

/** A thing the person pointed at with @. */
export interface Mention {
  kind: "task" | "doc" | "project";
  id: string;
  label: string;
}

/** The text being @-completed at the end of the draft, or null. */
export function mentionQuery(draft: string): string | null {
  const m = /(?:^|\s)@([^\s@]*)$/.exec(draft);
  return m ? m[1] : null;
}

/** The sentence the chosen mentions add to the line that is sent. */
export function withMentions(line: string, mentions: readonly Mention[]) {
  if (!mentions.length) return line;
  const noun = { task: "task", doc: "doc", project: "project" } as const;
  const about = mentions.map((m) => `${noun[m.kind]} “${m.label}”`).join(", ");
  return `${line}\n\n(About: ${about})`;
}
