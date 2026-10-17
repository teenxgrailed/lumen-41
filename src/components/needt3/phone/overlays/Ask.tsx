"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

import {
  LuArrowUp,
  LuArrowUpRight,
  LuPaperclip,
  LuSquare,
  LuSquarePen,
} from "react-icons/lu";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { AskActivity, AskText } from "../../corner/AskActivity";
import { useAsk } from "../../corner/AskProvider";
import {
  type AskScope,
  SLASH_COMMANDS,
  type Suggestion,
  helloLine,
  suggestionsFor,
} from "../../corner/scope";
import type { AskMessage, AskPhase } from "../../corner/useAskNeedt";
import { AiOrb } from "../../orb/AiOrb";
import { PkSheet, pkCx } from "../kit";
import { usePhoneOverlays } from "./store";
import { ask as copy } from "./strings";

export interface PkAskProps {
  open: boolean;
  onClose: () => void;
  /** The thread, newest last (`useAskNeedt`, shared with the desktop panel). */
  messages: readonly AskMessage[];
  phase: AskPhase;
  /** What it is looking at; the six suggestions follow it. */
  scope: AskScope;
  /** `line` goes to the backend, `shown` is what the thread shows when it differs. */
  onSend: (line: string, confirmed?: boolean, shown?: string) => void;
  onStop: () => void;
  onNew: () => void;
  /** The plan does not include the agent: open the plans. */
  onUpgrade?: () => void;
  /** Undo one thing Ask did, or everything one reply did. */
  onUndo?: (messageId: string, actionId: string) => void;
  onUndoAll?: (messageId: string, runId: string) => void;
}

/**
 * Ask Needt on the phone (phone-overlays.jsx `PkAsk`): the orb, the six
 * suggestions, one field at the bottom. The conversation is the desktop
 * panel's (`useAskNeedt` via `AskProvider`, POST /api/ai/chat): the same
 * thread, the same confirmations, the same limit messages. Attach is drawn
 * and off: the chat endpoint takes text only.
 */
export function PkAsk({
  open,
  onClose,
  messages,
  phase,
  scope,
  onSend,
  onStop,
  onNew,
  onUpgrade,
  onUndo,
  onUndoAll,
}: PkAskProps) {
  const [draft, setDraft] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const busy = phase !== "idle";
  const last = messages[messages.length - 1];

  const send = useCallback(
    (text: string) => {
      const q = text.trim();
      if (!q || busy) return;
      setDraft("");
      onSend(q);
    },
    [busy, onSend]
  );

  const suggest = (s: Suggestion) => {
    // A card whose line is a slash command asks for the rest of the sentence
    // ("Summarise …") instead of sending the bare command.
    const cmd = SLASH_COMMANDS.find((c) => c.cmd === s.say);
    if (cmd?.fill.endsWith(" ")) {
      setDraft(cmd.fill);
      field.current?.focus();
      return;
    }
    send(cmd ? cmd.fill : s.say);
  };

  // The newest line stays in view while it thinks and streams.
  useLayoutEffect(() => {
    const el = list.current?.closest(".pk-sheet-body");
    if (el && messages.length) el.scrollTop = el.scrollHeight;
  }, [messages, phase]);

  const head = (
    <div className="pov-ask-head">
      <span className="pov-orb" aria-hidden="true">
        <AiOrb size={44} active={busy} />
      </span>
      <span className="pov-ask-titles">
        <span className="pov-ask-title">{copy.ask_needt}</span>
        <span className="pov-ask-sub">
          {copy.plans_with_your_calendar_and_tasks}
        </span>
      </span>
      {messages.length ? (
        <button
          type="button"
          className="pov-ask-new"
          aria-label="New chat"
          data-pov-ask-new=""
          onClick={() => {
            onNew();
            setDraft("");
          }}
        >
          <LuSquarePen size={18} />
        </button>
      ) : null}
    </div>
  );
  const footer = (
    <form
      className="pov-ask-field"
      onSubmit={(e) => {
        e.preventDefault();
        send(draft);
      }}
    >
      <button
        type="button"
        className="pov-ask-attach"
        aria-label="Attach (not available yet)"
        disabled
        data-pov-ask-attach=""
      >
        <LuPaperclip size={18} />
      </button>
      <input
        ref={field}
        className="pov-ask-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={copy.ask_anything_about_your_day}
        aria-label={copy.ask_needt}
        enterKeyHint="send"
        data-pov-ask-input=""
      />
      {busy ? (
        <button
          type="button"
          className="pov-ask-send is-stop"
          aria-label="Stop"
          data-pov-ask-stop=""
          onClick={onStop}
        >
          <LuSquare size={14} />
        </button>
      ) : (
        <button
          type="submit"
          className="pov-ask-send"
          aria-label={copy.send}
          disabled={!draft.trim()}
        >
          <LuArrowUp size={18} />
        </button>
      )}
    </form>
  );

  return (
    <PkSheet
      open={open}
      onClose={onClose}
      head={head}
      footer={footer}
      detents={[0.86]}
      label={copy.ask_needt}
      className="pov-ask"
      bodyClass="pov-ask-body"
    >
      <div
        ref={list}
        className="pov-ask-list"
        data-pov-ask=""
        aria-live="polite"
      >
        <p className="pov-msg is-needt">
          {scope.kind === "doc" || scope.kind === "task"
            ? helloLine(scope)
            : copy.ask_about_your_day_i_can_plan_the_aftern}
        </p>
        {messages.map((m) => {
          if (m.from === "you") {
            return (
              <p key={m.id} className="pov-msg is-you">
                {m.text}
              </p>
            );
          }
          const live = busy && m === last;
          if (live && phase === "thinking" && !m.text) {
            return (
              <p
                key={m.id}
                className="pov-msg is-needt pov-ask-think"
                role="status"
              >
                Thinking…
              </p>
            );
          }
          return (
            <div key={m.id} className="pov-ask-turn">
              <p
                className={pkCx(
                  "pov-msg",
                  "is-needt",
                  (m.failed || m.stopped) && "is-failed"
                )}
              >
                <AskText text={m.text} />
                {live ? (
                  <span className="chat-caret" aria-hidden="true" />
                ) : null}
              </p>
              {onUndo && onUndoAll ? (
                <AskActivity
                  message={m}
                  busy={live}
                  onUndo={onUndo}
                  onUndoAll={onUndoAll}
                />
              ) : null}
              {m.confirm && !busy ? (
                <button
                  type="button"
                  className="pov-ask-action"
                  data-pov-ask-confirm=""
                  onClick={() => onSend(m.confirm ?? "", true)}
                >
                  Confirm
                </button>
              ) : null}
              {m.upgrade && onUpgrade ? (
                <button
                  type="button"
                  className="pov-ask-action"
                  data-pov-ask-plans=""
                  onClick={onUpgrade}
                >
                  See plans
                </button>
              ) : null}
            </div>
          );
        })}
        {messages.length ? null : (
          <div className="pov-ask-sugg">
            {suggestionsFor(scope).map((s) => (
              <button
                key={s.id}
                type="button"
                className="pov-sugg"
                data-pov-sugg={s.id}
                disabled={busy}
                onClick={() => suggest(s)}
              >
                {s.title}
                <LuArrowUpRight size={14} />
              </button>
            ))}
          </div>
        )}
      </div>
    </PkSheet>
  );
}

/** Ask against the store flag (`askOpen`) and the shared controller. */
export function StoreAsk() {
  const open = useNeedt3Ui((s) => s.askOpen);
  const setOpen = useNeedt3Ui((s) => s.setAskOpen);
  const close = useCallback(() => setOpen(false), [setOpen]);
  const { ask, asking } = useAsk();
  const upgrade = useCallback(() => {
    setOpen(false);
    usePhoneOverlays.getState().openPaywall("Ask Needt");
  }, [setOpen]);
  return (
    <PkAsk
      open={open}
      onClose={close}
      messages={ask.messages}
      phase={ask.phase}
      scope={asking.scope}
      onSend={(line, confirmed, shown) => void ask.send(line, confirmed, shown)}
      onStop={ask.stop}
      onNew={ask.reset}
      onUpgrade={upgrade}
      onUndo={(id, actionId) => void ask.undo(id, actionId)}
      onUndoAll={(id, runId) => void ask.undoAll(id, runId)}
    />
  );
}
