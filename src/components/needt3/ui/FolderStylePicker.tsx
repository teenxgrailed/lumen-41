"use client";

import { LuShuffle } from "react-icons/lu";

import {
  FOLDER_STYLES,
  FOLDER_STYLE_NAMES,
  type FolderStyleId,
  autoFolderStyle,
} from "@/lib/needt3/folder-style";

import { Folder } from "./Folder";

/**
 * "Folder style": the six looks as small thumbnails plus Auto (a look chosen
 * from the folder's id; `value` null). A radio group: arrow keys move, space
 * or enter picks. The thumbnails are the real folder at half size with sample
 * sheets in the folder's own colour, not its data.
 */
export function FolderStylePicker({
  value,
  onChange,
  hue,
  id,
  label = "Folder style",
}: {
  value: number | null | undefined;
  onChange: (next: FolderStyleId | null) => void;
  hue?: string;
  /** The folder's id: Auto resolves to a look from it. */
  id: string;
  label?: string;
}) {
  const current = value ?? null;
  const auto = autoFolderStyle(id);
  const options: (FolderStyleId | null)[] = [null, ...FOLDER_STYLES];
  const move = (from: number, step: number) => {
    const next = options[(from + step + options.length) % options.length];
    onChange(next);
    const group = document.querySelector<HTMLElement>(
      "[data-folder-style-picker]"
    );
    window.setTimeout(
      () =>
        group
          ?.querySelector<HTMLElement>('[tabindex="0"]')
          ?.focus({ preventScroll: true }),
      0
    );
  };
  return (
    <div className="fp" data-folder-style-picker="">
      <span className="fp-label">{label}</span>
      <div className="fp-grid" role="radiogroup" aria-label={label}>
        {options.map((opt, i) => {
          const on = current === opt;
          return (
            <button
              key={opt ?? "auto"}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={
                opt === null
                  ? `Auto (random), now ${FOLDER_STYLE_NAMES[auto]}`
                  : FOLDER_STYLE_NAMES[opt]
              }
              tabIndex={on || (current === null && i === 0) ? 0 : -1}
              data-folder-style-option={opt ?? "auto"}
              className={`fp-opt${on ? " is-on" : ""}`}
              onClick={() => onChange(opt)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                  e.preventDefault();
                  move(i, 1);
                } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                  e.preventDefault();
                  move(i, -1);
                }
              }}
            >
              <span className="fp-thumb" aria-hidden="true">
                {opt === null ? (
                  <span className="fp-auto">
                    <LuShuffle size={20} />
                  </span>
                ) : (
                  <Folder
                    label=""
                    hue={hue}
                    folderStyle={opt}
                    count={3}
                    unit="open"
                    ariaLabel=""
                    glyph="A"
                    statusLabel="Synced"
                    apps={["gcal", "slack", "notion"]}
                    updatedAt={0}
                    now={2 * 3_600_000}
                    peeks={[
                      { key: "a", title: "Next task", meta: "Today" },
                      { key: "b", title: "Then this" },
                      { key: "c", title: "Later" },
                    ]}
                  />
                )}
              </span>
              <span className="fp-name">
                {opt === null ? "Auto" : FOLDER_STYLE_NAMES[opt]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
