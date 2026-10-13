"use client";

import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { LuImport } from "react-icons/lu";

import { fetchJson, sendJson } from "@/lib/needt3/hooks/core";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { RichMenu } from "../menu/RichMenu";
import {
  type ImportsState,
  type SourceId,
  importItems,
} from "./import-sources";

/**
 * Icon-only at rest; the label slides out on hover and focus (shell.css
 * `.sb-reveal`). Absent while Import is off for this person or no source is
 * set up, rather than a button that opens an empty menu.
 */
export function ImportMenu() {
  const [busy, setBusy] = useState(false);
  const state = useQuery({
    queryKey: qk.imports(),
    queryFn: () => fetchJson<ImportsState>("/api/imports"),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const start = async (source: SourceId) => {
    if (busy) return;
    setBusy(true);
    try {
      const { authorizeUrl } = await sendJson<{ authorizeUrl: string }>(
        "/api/imports",
        "POST",
        { source }
      );
      window.location.assign(authorizeUrl);
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Could not start the import."
      );
      setBusy(false);
    }
  };

  const items = importItems(state.data, (s) => void start(s));
  if (!items.length) return null;
  return (
    <RichMenu
      up
      small
      prompt="Where would you like to import from?"
      width={264}
      trigger={(open) => (
        <button
          type="button"
          aria-expanded={open}
          data-sb-import=""
          className={`nx-press sb-reveal sb-import${open ? " is-open" : ""}`}
        >
          <LuImport size={16} />
          <span className="sb-reveal-label">Import</span>
        </button>
      )}
      items={items}
    />
  );
}
