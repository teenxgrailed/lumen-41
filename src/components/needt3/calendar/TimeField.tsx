"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { formatClock, nearestStep, parseClock } from "@/lib/needt3/clock-input";

/** Whether times read on a 12-hour clock (the person's Time format setting). */
const ClockFormat = createContext(false);
export const ClockFormatScope = ClockFormat.Provider;
export const useClock12 = () => useContext(ClockFormat);

/** Rows this tall (px) fit under the field before the list opens upward. */
const LIST_H = 216;

/**
 * A time of day you can type or pick: a text field with a list of times under
 * it (the caller chooses the steps). Typing reads "9", "930", "14:30", "2pm"
 * (`parseClock`) and commits on Enter or when the field loses focus; ↓/↑ walk
 * the list, Enter takes the highlighted row, Esc closes it (and only it).
 * Values are minutes from midnight.
 */
export function TimeField({
  value,
  options,
  onCommit,
  label,
  use12h,
  hint,
  align = "start",
  data,
}: {
  value: number;
  /** The rows, ascending, in minutes. */
  options: readonly number[];
  onCommit: (minutes: number) => void;
  label: string;
  use12h: boolean;
  /** Small text at a row's right edge (an end time's length). */
  hint?: (minutes: number) => string;
  align?: "start" | "end";
  /** Data attributes for the input (`{ "data-c2-create-from": "" }`). */
  data?: Record<string, string>;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [text, setText] = useState(() => formatClock(value, use12h));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [up, setUp] = useState(false);
  const walked = useRef(false);

  useEffect(() => {
    setText(formatClock(value, use12h));
  }, [value, use12h]);

  useEffect(() => {
    if (!open) return;
    list.current
      ?.querySelector("[data-active]")
      ?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);

  function show() {
    if (open) return;
    const r = input.current?.getBoundingClientRect();
    setUp(!!r && r.bottom + 4 + LIST_H > window.innerHeight - 8);
    setActive(nearestStep(options, value));
    walked.current = false;
    setOpen(true);
  }

  function close() {
    setOpen(false);
    walked.current = false;
  }

  /** The typed words, if they read as a time; otherwise the old value comes back. */
  function commitText() {
    const m = parseClock(text);
    if (m == null) setText(formatClock(value, use12h));
    else onCommit(m);
    close();
  }

  function pick(m: number) {
    setText(formatClock(m, use12h));
    onCommit(m);
    close();
  }

  const activeId = open && active >= 0 ? `${id}-${active}` : undefined;

  return (
    <span className="c2-tf" data-align={align}>
      <input
        ref={input}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="none"
        aria-activedescendant={activeId}
        className="nt-input c2-tf-input"
        value={text}
        {...data}
        onFocus={(e) => {
          e.currentTarget.select();
          show();
        }}
        onClick={show}
        onChange={(e) => {
          setText(e.target.value);
          const m = parseClock(e.target.value);
          if (m != null) setActive(nearestStep(options, m));
          walked.current = false;
          if (!open) setOpen(true);
        }}
        onBlur={() => commitText()}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            e.stopPropagation();
            if (!open) {
              show();
              return;
            }
            walked.current = true;
            const step = e.key === "ArrowDown" ? 1 : -1;
            setActive((i) =>
              Math.min(options.length - 1, Math.max(0, (i < 0 ? 0 : i) + step))
            );
            return;
          }
          if (e.key === "Enter") {
            if (open && walked.current && active >= 0) {
              e.preventDefault();
              e.stopPropagation();
              pick(options[active]);
              return;
            }
            // commit what was typed, then let the card's Enter create
            commitText();
            return;
          }
          if (e.key === "Escape" && open) {
            e.preventDefault();
            e.stopPropagation();
            setText(formatClock(value, use12h));
            close();
          }
        }}
      />
      {open ? (
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          className="c2-tf-list"
          data-up={up ? "" : undefined}
          // keep focus in the field: a press on a row is not a blur
          onMouseDown={(e) => e.preventDefault()}
        >
          {options.map((m, i) => (
            <li
              key={m}
              id={`${id}-${i}`}
              role="option"
              aria-selected={m === value}
              data-active={i === active ? "" : undefined}
              className="c2-tf-row"
              onMouseMove={() => i !== active && setActive(i)}
              onClick={() => pick(m)}
            >
              <span>{formatClock(m, use12h)}</span>
              {hint ? <span className="c2-tf-hint">{hint(m)}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </span>
  );
}
