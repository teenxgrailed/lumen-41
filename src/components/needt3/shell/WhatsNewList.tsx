"use client";

import { useEffect, useRef, useState } from "react";

import { formatShortDate, newDate } from "@/lib/date-utils";
import {
  type V3WhatsNew,
  useMarkWhatsNewSeen,
  useWhatsNew,
} from "@/lib/needt3/hooks/whats-new";

/** "24 Oct 2026" for a feed day; the undated entries are "Earlier". */
export function dayLabel(date: string | null) {
  if (!date) return "Earlier";
  // Noon UTC, so the day is the same in every zone.
  return formatShortDate(newDate(`${date}T12:00:00Z`), true);
}

/**
 * The feed for an open sheet: the ids that were new when it opened keep
 * their mark while it stays open, and opening it records them as seen.
 */
export function useWhatsNewOpening(open: boolean) {
  const query = useWhatsNew();
  const markSeen = useMarkWhatsNewSeen();
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  const marked = useRef(false);
  const data = query.data;

  useEffect(() => {
    if (!open) {
      marked.current = false;
      return;
    }
    if (marked.current || !data) return;
    marked.current = true;
    setFresh(new Set(data.unseen));
    markSeen();
  }, [open, data, markSeen]);

  return { data, loading: query.isPending, failed: query.isError, fresh };
}

/** Day by day, newest first; a new entry carries the accent mark. */
export function WhatsNewList({
  data,
  loading,
  failed,
  fresh,
}: {
  data: V3WhatsNew | undefined;
  loading: boolean;
  failed: boolean;
  fresh: ReadonlySet<string>;
}) {
  if (!data || data.groups.length === 0) {
    return (
      <p className="wn-empty" data-wn-empty="">
        {loading
          ? "Loading…"
          : failed
            ? "Could not load the list. Try again in a moment."
            : "Nothing new yet."}
      </p>
    );
  }
  return (
    <div className="wn-list" data-wn-list="">
      {data.groups.map((group) => (
        <section className="wn-group" key={group.date ?? "undated"}>
          <h3 className="base-section-label wn-day">{dayLabel(group.date)}</h3>
          <ul className="wn-items">
            {group.entries.map((entry) => (
              <li
                className="wn-item"
                key={entry.id}
                data-wn-new={fresh.has(entry.id) ? "" : undefined}
              >
                <span className="wn-mark" aria-hidden="true" />
                <span className="wn-text">{entry.text}</span>
                {fresh.has(entry.id) ? (
                  <span className="sr-only">New</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
