"use client";

import { useEffect, useRef, useState } from "react";

import { failureLine, useIdeaMoved } from "@/lib/needt3/idea-notice";
import { notify } from "@/lib/notifications";

import { IdeaFold, IdeaMovedNote } from "./IdeaCard";

/** How long the line stays on Today if nobody answers it. */
const HOLD_MS = 20_000;

/**
 * The sweep's one line on the phone's Today: "Moved 3 to Ideas: ...", with
 * Undo, above the day. While this is on screen the shared pill stays quiet
 * (`useIdeaMoved().mounted`), so the line is said once. It folds away after a
 * while, on Undo, or when Today closes.
 */
export function IdeaMovedToday() {
  const notice = useIdeaMoved((s) => s.notice);
  const clear = useIdeaMoved((s) => s.clear);
  // keep the text while the fold closes
  const [last, setLast] = useState(notice);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => useIdeaMoved.getState().mount(), []);
  useEffect(() => {
    if (notice) setLast(notice);
    window.clearTimeout(timer.current);
    if (notice) timer.current = window.setTimeout(clear, HOLD_MS);
    return () => window.clearTimeout(timer.current);
  }, [notice, clear]);

  if (!last) return null;
  const undo = last.undo;
  return (
    <IdeaFold open={!!notice}>
      <IdeaMovedNote
        message={last.message}
        onUndo={
          undo
            ? () => {
                clear();
                Promise.resolve()
                  .then(undo)
                  .catch((error: unknown) => {
                    notify.error(failureLine(error), {
                      dedupeKey: `idea-cards-failed-${last.runId ?? "run"}`,
                    });
                  });
              }
            : undefined
        }
      />
    </IdeaFold>
  );
}
