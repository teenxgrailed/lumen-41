/**
 * One table drives both the shortcut handler and the Keyboard sheet
 * (prototype App.jsx NEEDT_KEYS + GO). The prototype labelled G W
 * "Workspace" while GO sent it to Projects; the port has G T → Tasks and
 * G P → Projects. Rows marked `passive` are listed here but handled by the
 * screen that has the focus (a task row, the task dialog).
 */
import type { ThemeChoice } from "@/lib/needt3/theme";

export type ShellAction =
  | "palette"
  | "composer"
  | "focus"
  | "plan"
  | "sidebar"
  | "focusMode"
  | "settings"
  | "ask"
  | "keyboard"
  | "theme"
  | "close";

export type KeyGroup = "Everywhere" | "Go to" | "On a task" | "Theme";

export type KeyEvent = Pick<
  KeyboardEvent,
  "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
>;

export interface ShellShortcut {
  group: KeyGroup;
  keys: readonly string[];
  label: string;
  action?: ShellAction;
  href?: string;
  /** Two-key sequence, lower case ("gt"). */
  seq?: string;
  match?: (e: KeyEvent) => boolean;
  /** Handled by a screen, listed for reference. */
  passive?: boolean;
  /** Drawn in muted ink in the sheet. */
  quiet?: boolean;
}

const mod = (e: KeyEvent) => e.metaKey || e.ctrlKey;
const plain = (e: KeyEvent) => !e.metaKey && !e.ctrlKey && !e.altKey;
const cmd =
  (key: string, shift = false) =>
  (e: KeyEvent) =>
    mod(e) && e.shiftKey === shift && !e.altKey && e.key.toLowerCase() === key;

export const SHELL_SHORTCUTS: readonly ShellShortcut[] = [
  {
    group: "Everywhere",
    keys: ["⌘", "K"],
    label: "Open anything",
    action: "palette",
    match: cmd("k"),
  },
  {
    group: "Everywhere",
    keys: ["N"],
    label: "New task",
    action: "composer",
    match: (e) => plain(e) && !e.shiftKey && e.key.toLowerCase() === "n",
  },
  {
    group: "Everywhere",
    keys: ["⌘", "⇧", "F"],
    label: "Focus session",
    action: "focus",
    match: cmd("f", true),
  },
  {
    group: "Everywhere",
    keys: ["⌘", "⇧", "P"],
    label: "Plan my day",
    action: "plan",
    match: cmd("p", true),
  },
  {
    group: "Everywhere",
    keys: ["⌘", "J"],
    label: "Ask Needt",
    action: "ask",
    // ⌘/ stays as an alias (route map: Ask Needt is ⌘J, ⌘/ kept).
    match: (e) =>
      mod(e) && !e.altKey && (e.key.toLowerCase() === "j" || e.key === "/"),
  },
  {
    group: "Everywhere",
    keys: ["⌘", "\\"],
    label: "Toggle sidebar",
    action: "sidebar",
    match: (e) =>
      mod(e) && !e.altKey && (e.code === "Backslash" || e.key === "\\"),
  },
  {
    group: "Everywhere",
    keys: ["⌘", "."],
    label: "Focus Mode",
    action: "focusMode",
    match: cmd("."),
  },
  {
    group: "Everywhere",
    keys: ["⌘", ","],
    label: "Settings",
    action: "settings",
    match: cmd(","),
  },
  {
    group: "Everywhere",
    keys: ["?"],
    label: "This list",
    action: "keyboard",
    match: (e) => e.key === "?" && !e.metaKey && !e.ctrlKey,
  },
  {
    group: "Everywhere",
    keys: ["esc"],
    label: "Close what is open",
    action: "close",
    quiet: true,
    match: (e) => e.key === "Escape",
  },
  {
    group: "Go to",
    keys: ["G", "H"],
    seq: "gh",
    label: "Home",
    href: "/today",
  },
  {
    group: "Go to",
    keys: ["G", "C"],
    seq: "gc",
    label: "Calendar",
    href: "/calendar",
  },
  {
    group: "Go to",
    keys: ["G", "T"],
    seq: "gt",
    label: "Tasks",
    href: "/tasks",
  },
  {
    group: "Go to",
    keys: ["G", "P"],
    seq: "gp",
    label: "Projects",
    href: "/projects",
  },
  {
    group: "Go to",
    keys: ["G", "D"],
    seq: "gd",
    label: "Documents",
    href: "/pages",
  },
  {
    group: "Go to",
    keys: ["G", "S"],
    seq: "gs",
    label: "Settings",
    action: "settings",
  },
  { group: "On a task", keys: ["⏎"], label: "Open it", passive: true },
  { group: "On a task", keys: ["⌘", "⏎"], label: "Close it", passive: true },
  {
    group: "On a task",
    keys: ["⌘", "⇧", "S"],
    label: "Reschedule",
    passive: true,
  },
  { group: "On a task", keys: ["⌫"], label: "Delete it", passive: true },
  {
    group: "Theme",
    keys: ["⌘", "⇧", "L"],
    label: "Cycle the theme",
    action: "theme",
    match: cmd("l", true),
  },
];

export const KEY_GROUPS: readonly KeyGroup[] = [
  "Everywhere",
  "Go to",
  "On a task",
  "Theme",
];

export function shortcutForSequence(seq: string) {
  return SHELL_SHORTCUTS.find((s) => s.seq === seq.toLowerCase());
}

/** A field where the same letters are text: sequences and N stand down. */
export function isTypingTarget(target: EventTarget | null) {
  if (!target || typeof (target as Element).closest !== "function")
    return false;
  const el = target as HTMLElement;
  return (
    el.isContentEditable ||
    !!el.closest(
      "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']"
    )
  );
}

/** The `G` lead stays armed this long. */
export const LEAD_MS = 1000;

export interface KeyState {
  lead: string;
  leadAt: number;
}

export type KeyResult =
  | { kind: "none"; state: KeyState }
  | { kind: "lead"; state: KeyState }
  | { kind: "run"; shortcut: ShellShortcut; state: KeyState };

/**
 * Decide what one keydown does. Sequences and plain letters only fire
 * outside fields; ⌘ chords fire everywhere; Escape is always the shell's
 * last resort (open layers take it first).
 */
export function resolveKey(
  e: KeyEvent,
  typing: boolean,
  state: KeyState,
  now: number
): KeyResult {
  const idle: KeyState = { lead: "", leadAt: 0 };
  if (!typing && plain(e)) {
    const key = e.key.toLowerCase();
    if (state.lead === "g" && now - state.leadAt < LEAD_MS) {
      const go = shortcutForSequence(`g${key}`);
      if (go) return { kind: "run", shortcut: go, state: idle };
    }
    if (key === "g" && !e.shiftKey)
      return { kind: "lead", state: { lead: "g", leadAt: now } };
  }
  for (const s of SHELL_SHORTCUTS) {
    if (s.passive || !s.match || !s.match(e)) continue;
    if (typing && !mod(e) && e.key !== "Escape") continue;
    return { kind: "run", shortcut: s, state: idle };
  }
  return { kind: "none", state: idle };
}

const THEME_CYCLE: Record<ThemeChoice, ThemeChoice> = {
  system: "light",
  light: "dark",
  dark: "time",
  time: "system",
};

export function nextTheme(theme: ThemeChoice): ThemeChoice {
  return THEME_CYCLE[theme] ?? "light";
}
