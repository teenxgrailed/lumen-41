"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { LuArrowUp, LuArrowUpRight, LuInfo } from "react-icons/lu";

import { logger } from "@/lib/logger";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { StGlyph } from "../../states/StGlyph";
import { PkSheet, pkCx } from "../kit";
import { ask as copy } from "./strings";

const LOG_SOURCE = "PhoneAsk";

/**
 * The prototype's three suggestions (Mobile.jsx `MB_ASK`) were questions with
 * canned answers. The questions stay as prompts; the answers are not ported:
 * a reply comes from the engine or not at all.
 */
const SUGGESTIONS = ["Plan my afternoon", "What’s overdue?"] as const;

type Turn = readonly ["you" | "needt", string];

export interface PkAskProps {
  open: boolean;
  onClose: () => void;
  /**
   * The reply engine: a question in, the answer out.
   * //todo: wire `POST /api/ai/chat` (NDJSON stream with tool confirmations,
   * `AIChatSurface.tsx`) behind a `useAskNeedt` hook in
   * `src/lib/needt3/hooks`; T23 (the desktop Ask corner) needs the same one.
   * Without it the sheet says so and nothing is sent or faked.
   */
  reply?: (question: string) => Promise<string>;
}

/** The AI orb, still (the animated `AiOrb` is not ported; nothing loops at rest). */
function OrbStill() {
  return <span className="pov-orb-still" aria-hidden="true" />;
}

/**
 * Ask Needt on the phone (phone-overlays.jsx `PkAsk`): the orb, the
 * suggestions, one field at the bottom. The sheet is complete; the reply
 * engine is the //todo on `reply`.
 */
export function PkAsk({ open, onClose, reply }: PkAskProps) {
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const blocked = !reply;

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || !reply || busy) return;
      setDraft("");
      setBusy(true);
      setTurns((m) => [...m, ["you", q]]);
      try {
        const a = await reply(q);
        setTurns((m) => [...m, ["needt", a]]);
      } catch (error) {
        void logger.error(
          "Ask Needt reply failed",
          { error: error instanceof Error ? error.message : String(error) },
          LOG_SOURCE
        );
      } finally {
        setBusy(false);
      }
    },
    [reply, busy]
  );

  useLayoutEffect(() => {
    const el = list.current?.closest(".pk-sheet-body");
    if (el && turns.length) el.scrollTop = el.scrollHeight;
  }, [turns.length]);

  const head = (
    <div className="pov-ask-head">
      <span className="pov-orb" aria-hidden="true">
        <OrbStill />
      </span>
      <span className="pov-ask-titles">
        <span className="pov-ask-title">{copy.ask_needt}</span>
        <span className="pov-ask-sub">
          {copy.plans_with_your_calendar_and_tasks}
        </span>
      </span>
    </div>
  );
  const footer = (
    <form
      className="pov-ask-field"
      onSubmit={(e) => {
        e.preventDefault();
        void send(draft);
      }}
    >
      <input
        className="pov-ask-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={copy.ask_anything_about_your_day}
        aria-label={copy.ask_needt}
        disabled={blocked}
        data-pov-ask-input=""
      />
      <button
        type="submit"
        className="pov-ask-send"
        aria-label={copy.send}
        disabled={blocked || busy || !draft.trim()}
      >
        <LuArrowUp size={18} />
      </button>
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
      <div ref={list} className="pov-ask-list" data-pov-ask="">
        {blocked ? (
          <div className="pov-ask-note" role="status">
            <StGlyph name="cloud-off" size={16} fallback={LuInfo} />
            <span className="pov-ask-note-text">
              <span>Ask Needt isn’t connected on the phone yet.</span>
            </span>
          </div>
        ) : null}
        <p className="pov-msg is-needt">
          {copy.ask_about_your_day_i_can_plan_the_aftern}
        </p>
        {turns.map(([who, text], i) => (
          <p key={i} className={pkCx("pov-msg", `is-${who}`)}>
            {text}
          </p>
        ))}
        {turns.length ? null : (
          <div className="pov-ask-sugg">
            {SUGGESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                className="pov-sugg"
                disabled={blocked || busy}
                onClick={() => void send(q)}
              >
                {q}
                <LuArrowUpRight size={14} />
              </button>
            ))}
          </div>
        )}
      </div>
    </PkSheet>
  );
}

/** Ask against the store flag (`askOpen`). */
export function StoreAsk({ reply }: Pick<PkAskProps, "reply">) {
  const open = useNeedt3Ui((s) => s.askOpen);
  const setOpen = useNeedt3Ui((s) => s.setAskOpen);
  const close = useCallback(() => setOpen(false), [setOpen]);
  return <PkAsk open={open} onClose={close} reply={reply} />;
}
