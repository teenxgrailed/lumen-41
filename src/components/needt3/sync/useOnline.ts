"use client";

import { useEffect, useState } from "react";

/** The browser's connection, with no provider needed (true until read). */
export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const read = () => setOnline(navigator.onLine);
    read();
    window.addEventListener("online", read);
    window.addEventListener("offline", read);
    return () => {
      window.removeEventListener("online", read);
      window.removeEventListener("offline", read);
    };
  }, []);
  return online;
}
