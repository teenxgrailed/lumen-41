"use client";

import { useEffect, useState } from "react";

import { newDate } from "@/lib/date-utils";

/**
 * The current time, re-read every minute and whenever the page may have been
 * asleep: an installed PWA is frozen in the background, its timers do not run,
 * and on return only some of `visibilitychange` / `pageshow` / `focus` /
 * `online` fire (iOS standalone fires different ones than Safari). Any of them
 * reads the clock again, so the day never stays on yesterday.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => newDate());
  useEffect(() => {
    const read = () => setNow(newDate());
    const seen = () => {
      if (!document.hidden) read();
    };
    // the first read after mount: the server-rendered or restored state may
    // already be old
    read();
    const id = window.setInterval(read, intervalMs);
    document.addEventListener("visibilitychange", seen);
    window.addEventListener("pageshow", read);
    window.addEventListener("focus", read);
    window.addEventListener("online", read);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", seen);
      window.removeEventListener("pageshow", read);
      window.removeEventListener("focus", read);
      window.removeEventListener("online", read);
    };
  }, [intervalMs]);
  return now;
}
