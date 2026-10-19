"use client";

import { Fragment, useEffect, useRef, useState } from "react";

import type { StarterAnswers, StarterScreen } from "@/lib/starter-game";

import { SgIcon } from "./SgIcon";
import { SgOrb } from "./SgOrb";
import { useDictation } from "./dictation";
import { SG_ENTRY, SG_Q } from "./model";
import { scrollBehavior } from "./motion";

/** Between one answer and the next question. */
const NEXT_MS = 700;

/**
 * THE CHAT (sg-game.jsx `SgChat`): three questions, one at a time, in the
 * manner of Ask. Chips and free text, a mic where the browser can listen, and
 * "Use an example". After the third answer `onDone` hands the answers over
 * and the agent "thinks" until the board takes over; `failed` swaps that for
 * a line and Try again.
 */
export function SgChat({
  entry,
  failed,
  onDone,
  onRetry,
}: {
  entry: StarterScreen;
  /** The one agent request did not come back with tiles. */
  failed: boolean;
  onDone: (answers: StarterAnswers) => void;
  onRetry: () => void;
}) {
  const [step, setStep] = useState(0);
  const [ans, setAns] = useState<Record<string, string>>({});
  const [pick, setPick] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const dictation = useDictation((words) =>
    setText((t) => (t ? `${t.trimEnd()} ${words}` : words))
  );

  useEffect(() => {
    const sc = end.current?.closest(".sg-body");
    if (sc && typeof sc.scrollTo === "function") {
      sc.scrollTo({ top: sc.scrollHeight, behavior: scrollBehavior() });
    }
  }, [step, typing, failed]);

  const q = SG_Q[step];
  const say = () => {
    const a = [...pick, text.trim()].filter(Boolean).join(", ");
    const next = { ...ans, [q.id]: a };
    setAns(next);
    setPick([]);
    setText("");
    setTyping(true);
    if (step < 2) {
      timer.current = window.setTimeout(() => {
        setTyping(false);
        setStep(step + 1);
      }, NEXT_MS);
    } else {
      onDone({
        do: next.do ?? "",
        burn: next.burn ?? "",
        reg: next.reg ?? "",
      });
    }
  };
  const can = pick.length > 0 || text.trim().length > 0;
  const thinking = typing && !failed;

  return (
    <div className="sg-chat" data-sg-chat="">
      <div className="sg-msg">
        <SgOrb />
        <div className="sg-msg-b">
          {SG_ENTRY[entry].intro} Three questions, then you sort.
        </div>
      </div>
      {SG_Q.slice(0, step + (typing && step === 2 ? 1 : 0)).map((qq) => (
        <Fragment key={qq.id}>
          <div className="sg-msg">
            <SgOrb />
            <div className="sg-msg-b">
              <b>{qq.ask}</b>
            </div>
          </div>
          {ans[qq.id] ? (
            <div className="sg-msg is-me">
              <div className="sg-msg-b">{ans[qq.id]}</div>
            </div>
          ) : null}
        </Fragment>
      ))}
      {thinking ? (
        <div className="sg-msg">
          <SgOrb />
          <div
            className="sg-msg-b sg-typing"
            role="status"
            aria-label="Needt is thinking"
          >
            <i />
            <i />
            <i />
          </div>
        </div>
      ) : failed ? (
        <div className="sg-msg" data-sg-failed="">
          <SgOrb />
          <div className="sg-msg-b">
            I couldn’t make your tiles just now.{" "}
            <span className="sg-hintline">
              Nothing was changed. Try again in a moment.
            </span>
            <div className="sg-ask-foot" style={{ marginTop: 10 }}>
              <button
                type="button"
                className="sg-btn is-primary"
                data-sg="retry"
                onClick={onRetry}
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      ) : q && !ans[q.id] ? (
        <>
          <div className="sg-msg">
            <SgOrb />
            <div className="sg-msg-b">
              <b>{q.ask}</b>
              <br />
              <span className="sg-hintline">{q.hint}</span>
            </div>
          </div>
          <div className="sg-ask">
            {q.chips ? (
              <div className="sg-chips" role="group" aria-label={q.ask}>
                {q.chips.map(([e, n]) => (
                  <button
                    key={n}
                    type="button"
                    className="sg-chip"
                    aria-pressed={pick.includes(n)}
                    onClick={() =>
                      setPick(
                        pick.includes(n)
                          ? pick.filter((x) => x !== n)
                          : [...pick, n]
                      )
                    }
                  >
                    <span className="e" aria-hidden="true">
                      {e}
                    </span>
                    {n}
                  </button>
                ))}
              </div>
            ) : null}
            {q.text ? (
              <div className="sg-field">
                <textarea
                  rows={q.chips ? 1 : 3}
                  value={text}
                  placeholder={
                    q.chips
                      ? "Or type your own…"
                      : "e.g. the drop on Friday, German homework…"
                  }
                  onChange={(e) => setText(e.target.value)}
                  aria-label={q.ask}
                />
                {dictation.supported ? (
                  <button
                    type="button"
                    className="sg-mic"
                    data-sg="dictate"
                    aria-label={
                      dictation.listening ? "Stop dictating" : "Dictate"
                    }
                    aria-pressed={dictation.listening}
                    onClick={dictation.toggle}
                  >
                    <SgIcon n="mic" />
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="sg-ask-foot">
              {q.example ? (
                <button
                  type="button"
                  className="sg-btn is-text"
                  data-sg="example"
                  onClick={() => setText(q.example ?? "")}
                >
                  Use an example
                </button>
              ) : null}
              <button
                type="button"
                className="sg-btn is-primary"
                data-sg="continue"
                disabled={!can}
                onClick={say}
              >
                {step < 2 ? "Continue" : "Make my tiles"} <SgIcon n="arrow" />
              </button>
            </div>
          </div>
        </>
      ) : null}
      <div ref={end} />
    </div>
  );
}
