"use client";

/* THE PANEL — Ask Needt open (prototype Chat.jsx `Chat`).
 *
 * Docked on the right as a full-height column on the desktop (the shell gives
 * it a 360 px slot), a sheet over a scrim when the window is narrow. Ported:
 * the glass header with the orb and the context chip (what it is looking at,
 * switchable), the empty state with a greeting by name and six suggestion
 * cards that follow the context, the hints row, the thread (yours in a
 * bubble, Needt's beside its orb), the "Thinking…" line, the streaming caret,
 * Stop, confirming an action the agent asked about, and the composer with
 * `/` commands, `@` mentions and ↑ to edit your last line.
 * Replies come from /api/ai/chat through `useAskNeedt`.
 */
import * as React from "react";

import {
  LuArrowUp,
  LuAtSign,
  LuCalendarDays,
  LuCheck,
  LuChevronDown,
  LuCircleCheck,
  LuClock,
  LuFileText,
  LuFolder,
  LuHourglass,
  LuLayoutTemplate,
  LuListChecks,
  LuListPlus,
  LuMoveRight,
  LuPaperclip,
  LuPencil,
  LuReply,
  LuSquare,
  LuSquarePen,
  LuWandSparkles,
  LuX,
} from "react-icons/lu";

import { newDate } from "@/lib/date-utils";

import { useExit } from "../ctx/useExit";
import { AiOrb } from "../orb/AiOrb";
import { AskActivity, AskText } from "./AskActivity";
import {
  type AskScope,
  type Mention,
  SLASH_COMMANDS,
  type SlashCommand,
  type Suggestion,
  type SuggestionIcon,
  greetingFor,
  helloLine,
  matchCommands,
  mentionQuery,
  sameScope,
  scopeLabel,
  suggestionsFor,
  withMentions,
} from "./scope";
import type { AskMessage, AskPhase } from "./useAskNeedt";
import { useMentionItems } from "./useAskScope";

const ICONS: Record<SuggestionIcon, React.ComponentType<{ size?: number }>> = {
  plan: LuWandSparkles,
  overdue: LuHourglass,
  summary: LuFileText,
  draft: LuReply,
  free: LuCalendarDays,
  low: LuMoveRight,
  steps: LuListChecks,
  moveit: LuMoveRight,
  todos: LuListPlus,
};

const SCOPE_ICON: Record<
  AskScope["kind"],
  React.ComponentType<{ size?: number }>
> = {
  workspace: LuLayoutTemplate,
  day: LuCalendarDays,
  doc: LuFileText,
  task: LuCircleCheck,
};

const MENTION_ICON: Record<
  Mention["kind"],
  React.ComponentType<{ size?: number }>
> = {
  task: LuCircleCheck,
  doc: LuFileText,
  project: LuFolder,
};

const COMMAND_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  "/plan": LuWandSparkles,
  "/summarize": LuFileText,
  "/find": LuClock,
  "/draft": LuReply,
};

function clock(at: number): string {
  const d = newDate(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export interface ChatPanelProps {
  messages: readonly AskMessage[];
  phase: AskPhase;
  /** What it is looking at, and every scope that could be switched to. */
  scope: AskScope;
  scopes: readonly AskScope[];
  onScope: (scope: AskScope) => void;
  /** First name, for the greeting; null says the greeting alone. */
  name: string | null;
  /**
   * `line` is what the backend gets, `shown` what the thread shows when that
   * differs (mentions are added to the first, not the second).
   */
  onSend: (line: string, confirmed?: boolean, shown?: string) => void;
  onStop: () => void;
  onNew: () => void;
  onClose: () => void;
  /** Takes your last line back off the thread; returns it. */
  onPopLast: () => string | null;
  /** Undo one thing Ask did, or everything one reply did. */
  onUndo?: (messageId: string, actionId: string) => void;
  onUndoAll?: (messageId: string, runId: string) => void;
}

/** The messages mounted while the panel is still flying in; the rest follow. */
export const OPEN_TAIL = 4;
/** The dock card's entrance (chat.css v3-chat-spring-in 460ms) plus slack. */
const OPEN_SETTLE_MS = 500;

/**
 * True once the panel's entrance is over. A long thread is not mounted
 * during it: only the latest lines are, so the first frames of the motion are
 * not spent on rows nobody can see yet. Reduced motion has no entrance.
 */
function useSettled(need: boolean): boolean {
  const [done, setDone] = React.useState(false);
  React.useEffect(() => {
    if (!need || done) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setDone(true);
      return undefined;
    }
    const t = window.setTimeout(() => setDone(true), OPEN_SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [need, done]);
  return !need || done;
}

export function ChatPanel({
  messages,
  phase,
  scope,
  scopes,
  onScope,
  name,
  onSend,
  onStop,
  onNew,
  onClose,
  onPopLast,
  onUndo,
  onUndoAll,
}: ChatPanelProps) {
  const [draft, setDraft] = React.useState("");
  const [chips, setChips] = React.useState<Mention[]>([]);
  const [scrolled, setScrolled] = React.useState(false);
  const [scopeOpen, setScopeOpen] = React.useState(false);
  const [scopeShown, scopeLeaving] = useExit(scopeOpen, 130);
  const [menuIdx, setMenuIdx] = React.useState(0);
  /* The draft a menu was dismissed for: it stays shut until the text moves. */
  const [menuOff, setMenuOff] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const field = React.useRef<HTMLTextAreaElement>(null);
  const scroller = React.useRef<HTMLDivElement>(null);
  const busy = phase !== "idle";
  const last = messages[messages.length - 1];
  const empty = messages.length === 0;
  const settled = useSettled(messages.length > OPEN_TAIL);
  const hidden = settled ? 0 : Math.max(0, messages.length - OPEN_TAIL);

  const query = mentionQuery(draft);
  const mentionItems = useMentionItems(menuOff === draft ? null : query);
  const commands = menuOff === draft ? [] : matchCommands(draft);
  const menu: "slash" | "mention" | null = commands.length
    ? "slash"
    : mentionItems.length
      ? "mention"
      : null;
  const menuLen = menu === "slash" ? commands.length : mentionItems.length;

  React.useEffect(() => {
    // preventScroll: the card is mid-flight inside a clipped slot, and
    // focus would otherwise scroll that slot to the field.
    field.current?.focus({ preventScroll: true });
  }, []);
  React.useEffect(() => setMenuIdx(0), [draft]);

  /* Keep the newest line in view while it thinks and streams. The read of
     the height waits for the next frame, so a burst of tokens measures once
     and the first mount does not force a layout inside the entrance. */
  React.useEffect(() => {
    const el = scroller.current;
    if (!el || empty) return undefined;
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [messages, phase, empty, settled]);

  const clear = () => {
    setDraft("");
    setChips([]);
    setEditing(false);
  };

  const send = (line = draft) => {
    const text = line.trim();
    if (!text || busy) return;
    if (editing) onPopLast();
    const shown = [text, ...chips.map((c) => `@${c.label}`)].join(" ");
    onSend(withMentions(text, chips), false, shown);
    clear();
  };

  const focusEnd = () => {
    const el = field.current;
    if (!el) return;
    el.focus();
    const n = el.value.length;
    el.setSelectionRange(n, n);
  };

  const pickCommand = (c: SlashCommand) => {
    setMenuOff(null);
    if (c.fill.endsWith(" ")) {
      setDraft(c.fill);
      requestAnimationFrame(focusEnd);
      return;
    }
    send(c.fill);
  };

  const pickMention = (m: Mention) => {
    setChips((l) => (l.some((x) => x.id === m.id) ? l : l.concat(m)));
    setDraft((d) => d.replace(/(^|\s)@[^\s@]*$/, "$1").trimStart());
    setMenuOff(null);
    requestAnimationFrame(focusEnd);
  };

  const suggest = (s: Suggestion) => {
    const cmd = SLASH_COMMANDS.find((c) => c.cmd === s.say);
    if (cmd) pickCommand(cmd);
    else send(s.say);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (menu && menuLen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const d = e.key === "ArrowDown" ? 1 : -1;
        setMenuIdx((i) => (i + d + menuLen) % menuLen);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (menu === "slash") pickCommand(commands[menuIdx] ?? commands[0]);
        else pickMention(mentionItems[menuIdx] ?? mentionItems[0]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setMenuOff(draft);
        return;
      }
    }
    if (e.key === "Escape" && editing) {
      e.preventDefault();
      e.stopPropagation();
      clear();
      return;
    }
    if (e.key === "ArrowUp" && !draft && !busy) {
      const lastYou = [...messages].reverse().find((m) => m.from === "you");
      if (lastYou) {
        e.preventDefault();
        setDraft(lastYou.text);
        setEditing(true);
        requestAnimationFrame(focusEnd);
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      <div className={`chat-head${scrolled ? " is-scrolled" : ""}`}>
        <span className="chat-head-orb">
          <AiOrb size={28} active={busy} />
        </span>
        <div className="chat-head-text">
          <span className="chat-head-title">Ask Needt</span>
          <button
            type="button"
            className="chat-scope"
            data-chat-scope={scope.kind}
            aria-haspopup="menu"
            aria-expanded={scopeOpen}
            title={`Applies to: ${scopeLabel(scope)}. Change`}
            onClick={() => setScopeOpen((o) => !o)}
          >
            {React.createElement(SCOPE_ICON[scope.kind], { size: 12 })}
            <span className="chat-scope-t">{scopeLabel(scope)}</span>
            <LuChevronDown size={12} />
          </button>
        </div>
        <button
          type="button"
          className="chat-tool"
          aria-label="New chat"
          title="New chat"
          onClick={() => {
            onNew();
            clear();
            field.current?.focus();
          }}
        >
          <LuSquarePen size={15} />
        </button>
        <button
          type="button"
          className="chat-tool"
          aria-label="Close"
          title="Close"
          onClick={onClose}
        >
          <LuX size={15} />
        </button>
        {scopeShown ? (
          <div
            className={`chat-scope-menu nx-pop${scopeLeaving ? " is-leaving" : ""}`}
            role="menu"
            aria-label="What this applies to"
            data-chat-scope-menu
          >
            <div className="chat-scope-menu-label">Ask about</div>
            {scopes.map((x) => {
              const on = sameScope(x, scope);
              return (
                <button
                  key={`${x.kind}${"id" in x ? x.id : ""}${"title" in x ? x.title : ""}`}
                  type="button"
                  role="menuitemradio"
                  aria-checked={on}
                  className="chat-row chat-menu-row-row chat-scope-item"
                  onClick={() => {
                    onScope(x);
                    setScopeOpen(false);
                    field.current?.focus();
                  }}
                >
                  {React.createElement(SCOPE_ICON[x.kind], { size: 14 })}
                  <span className="chat-scope-item-t">{scopeLabel(x)}</span>
                  {on ? <LuCheck size={13} /> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div
        ref={scroller}
        className="scroll-inner chat-scroll"
        data-chat-scroll
        onScroll={(e) => {
          const s = e.currentTarget.scrollTop > 4;
          if (s !== scrolled) setScrolled(s);
        }}
      >
        {empty ? (
          <div className="chat-empty" data-chat-empty>
            <span className="chat-empty-orb">
              <AiOrb size={40} />
            </span>
            <div className="chat-hello">
              {greetingFor(newDate().getHours(), name)}
            </div>
            <div className="chat-hello-sub">{helloLine(scope)}</div>
            <div className="chat-suggest-grid">
              {suggestionsFor(scope).map((s) => {
                const Icon = ICONS[s.icon];
                return (
                  <button
                    key={s.id}
                    type="button"
                    className="chat-suggest-card"
                    data-chat-suggest={s.id}
                    onClick={() => suggest(s)}
                  >
                    <i className="chat-suggest-icon">
                      <Icon size={15} />
                    </i>
                    <strong className="chat-suggest-title">{s.title}</strong>
                    <em className="chat-suggest-sub">{s.sub}</em>
                  </button>
                );
              })}
            </div>
            <div className="chat-hints">
              <kbd>/</kbd> commands <kbd>@</kbd> mention <kbd>↑</kbd> edit last
            </div>
          </div>
        ) : (
          messages.slice(hidden).map((m, at) => {
            const old = settled && at < messages.length - OPEN_TAIL;
            if (m.from === "you") {
              return (
                <div
                  key={m.id}
                  className={`chat-msg is-you chat-msg-in${old ? " is-history" : ""}`}
                  data-chat-msg="you"
                >
                  <span className="chat-bubble-row">
                    <span className="chat-time">{clock(m.at)}</span>
                    <span className="chat-bubble">{m.text}</span>
                  </span>
                </div>
              );
            }
            const live = busy && m === last;
            if (live && phase === "thinking" && !m.text) {
              return (
                <div
                  key={m.id}
                  className={`chat-msg is-ai chat-msg-in${old ? " is-history" : ""}`}
                >
                  <span className="chat-avatar">
                    <AiOrb size={22} active />
                  </span>
                  <span className="chat-think-body" role="status">
                    <span className="chat-think-now">
                      {(m.tools ?? [])
                        .filter((t) => t.status === "running")
                        .at(-1)?.label ?? "Thinking"}
                      …
                    </span>
                  </span>
                </div>
              );
            }
            return (
              <div
                key={m.id}
                className={`chat-msg is-ai chat-msg-in${old ? " is-history" : ""}`}
                data-chat-msg="needt"
              >
                <span className="chat-avatar">
                  <AiOrb size={22} active={live} />
                </span>
                <span className="chat-ai-body">
                  <span
                    className={`chat-ai-text${m.stopped || m.failed ? " is-stopped" : ""}`}
                  >
                    <AskText text={m.text} />
                    {live ? (
                      <span className="chat-caret" aria-hidden="true" />
                    ) : null}
                  </span>
                  {onUndo && onUndoAll ? (
                    <AskActivity
                      message={m}
                      busy={live}
                      onUndo={onUndo}
                      onUndoAll={onUndoAll}
                    />
                  ) : null}
                  {m.confirm && !busy ? (
                    <span className="chat-follow">
                      <button
                        type="button"
                        className="chat-follow-btn"
                        data-chat-confirm
                        onClick={() => onSend(m.confirm ?? "", true)}
                      >
                        Confirm
                      </button>
                    </span>
                  ) : null}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="chat-composer-wrap">
        {menu ? (
          <div
            className="chat-cmd-menu"
            role="listbox"
            aria-label={menu === "slash" ? "Commands" : "Mention"}
            data-chat-menu={menu}
          >
            <div className="chat-scope-menu-label">
              {menu === "slash" ? "Commands" : "Attach as context"}
            </div>
            {menu === "slash"
              ? commands.map((c, i) => {
                  const Icon = COMMAND_ICON[c.cmd] ?? LuWandSparkles;
                  return (
                    <button
                      key={c.cmd}
                      type="button"
                      role="option"
                      aria-selected={i === menuIdx}
                      className={`chat-cmd-row${i === menuIdx ? " is-active" : ""}`}
                      onMouseEnter={() => setMenuIdx(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickCommand(c)}
                    >
                      <i className="chat-cmd-icon">
                        <Icon size={14} />
                      </i>
                      <span className="chat-cmd-text">
                        <span className="chat-cmd-title">
                          <b>{c.cmd}</b> {c.title}
                        </span>
                        <span className="chat-cmd-sub">{c.sub}</span>
                      </span>
                      {i === menuIdx ? (
                        <kbd className="chat-cmd-kbd">↵</kbd>
                      ) : null}
                    </button>
                  );
                })
              : mentionItems.map((m, i) => {
                  const Icon = MENTION_ICON[m.kind];
                  return (
                    <button
                      key={`${m.kind}${m.id}`}
                      type="button"
                      role="option"
                      aria-selected={i === menuIdx}
                      className={`chat-cmd-row${i === menuIdx ? " is-active" : ""}`}
                      onMouseEnter={() => setMenuIdx(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickMention(m)}
                    >
                      <i className="chat-cmd-icon">
                        <Icon size={14} />
                      </i>
                      <span className="chat-cmd-text">
                        <span className="chat-cmd-title">{m.label}</span>
                        <span className="chat-cmd-sub">{m.kind}</span>
                      </span>
                      {i === menuIdx ? (
                        <kbd className="chat-cmd-kbd">↵</kbd>
                      ) : null}
                    </button>
                  );
                })}
          </div>
        ) : null}
        {editing ? (
          <div className="chat-editing" data-chat-editing>
            <LuPencil size={12} />
            <span>Editing your last message</span>
            <button type="button" className="chat-editing-x" onClick={clear}>
              Cancel <kbd>Esc</kbd>
            </button>
          </div>
        ) : null}
        <div className={`chat-composer${draft.trim() ? " has-text" : ""}`}>
          {chips.length ? (
            <div className="chat-row-6">
              {chips.map((c) => {
                const Icon = MENTION_ICON[c.kind];
                return (
                  <span
                    key={`${c.kind}${c.id}`}
                    className="chat-chip is-removable chat-chip-in"
                  >
                    <Icon size={12} />
                    {c.label}
                    <button
                      className="chat-grid-2"
                      type="button"
                      aria-label={`Remove ${c.label}`}
                      onClick={() => setChips((l) => l.filter((x) => x !== c))}
                    >
                      <LuX size={11} />
                    </button>
                  </span>
                );
              })}
            </div>
          ) : null}
          <textarea
            ref={field}
            className="chat-input"
            rows={1}
            value={draft}
            data-chat-input
            placeholder={
              editing ? "Edit and press Enter" : "Ask, or type / for commands"
            }
            onChange={(e) => {
              setDraft(e.target.value);
              if (menuOff !== null && e.target.value !== menuOff) {
                setMenuOff(null);
              }
            }}
            onKeyDown={onKey}
          />
          <div className="chat-tools">
            <button
              type="button"
              aria-label="Attach a file"
              title="Attachments are not available yet"
              className="chat-tool"
              disabled
            >
              <LuPaperclip size={15} />
            </button>
            <button
              type="button"
              aria-label="Mention a task, doc or project"
              title="Mention a task, doc or project (@)"
              className="chat-tool"
              data-chat-at
              onClick={() => {
                setDraft((d) => (d && !/\s$/.test(d) ? `${d} @` : `${d}@`));
                setMenuOff(null);
                field.current?.focus();
              }}
            >
              <LuAtSign size={15} />
            </button>
            <button
              type="button"
              aria-label="Commands"
              title="Commands (/)"
              className="chat-tool is-text"
              data-chat-slash
              onClick={() => {
                setDraft("/");
                setMenuOff(null);
                field.current?.focus();
              }}
            >
              /
            </button>
            <span className="chat-tools-gap" />
            {busy ? (
              <button
                type="button"
                className="chat-send is-stop"
                aria-label="Stop"
                title="Stop"
                data-chat-stop
                onClick={onStop}
              >
                <LuSquare size={12} />
              </button>
            ) : (
              <button
                type="button"
                className="chat-send"
                aria-label="Send"
                data-chat-send
                disabled={!draft.trim()}
                onClick={() => send()}
              >
                <LuArrowUp size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
