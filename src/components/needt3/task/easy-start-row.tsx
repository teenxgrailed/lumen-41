"use client";

import { LuSparkles } from "react-icons/lu";

import type { EasyStartRowApi } from "@/lib/needt3/easy-start-row";
import { notify } from "@/lib/notifications";

/**
 * The text of a task row under Always easy start (see
 * lib/needt3/easy-start-row.ts). `titleClass` is the row own title class (desk
 * or touch), so the entry keeps the title type and truncation.
 * - normal / simplified: the entry, then "for: <title>" (and Undo when simplified);
 * - suggest: the title as it is, with the Упростить? button.
 */
const stop = (e: { stopPropagation(): void }) => e.stopPropagation();

async function run(job: () => Promise<void>, failure: string) {
  try {
    await job();
  } catch {
    notify.error(failure, { dedupeKey: "easy-start-row-failed" });
  }
}

export function EsrText({
  api,
  title,
  entry,
  titleClass,
}: {
  api: EasyStartRowApi;
  title: string;
  entry?: string | null;
  titleClass: string;
}) {
  if (api.state === "suggest" || !entry)
    return (
      <span className="esr esr-line esr-suggest-line">
        <span className={`${titleClass} esr-grow`} title={title}>
          {title}
        </span>
        <button
          type="button"
          className="esr-suggest"
          data-esr-suggest
          onClick={(e) => {
            stop(e);
            void run(api.apply, "Could not simplify that");
          }}
        >
          <LuSparkles size={12} aria-hidden="true" className="esr-mark" />
          Упростить?
        </button>
      </span>
    );
  return (
    <span className="esr esr-col" data-esr-state={api.state}>
      <span className={titleClass} title={entry}>
        {entry}
      </span>
      <span className="esr-sub">
        <span className="esr-sub-text" title={title}>
          for: {title}
        </span>
        {api.state === "simplified" ? (
          <button
            type="button"
            className="esr-undo"
            data-esr-undo
            onClick={(e) => {
              stop(e);
              void run(api.undo, "Could not undo that");
            }}
          >
            Undo
          </button>
        ) : null}
      </span>
    </span>
  );
}
