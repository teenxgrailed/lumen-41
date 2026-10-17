"use client";

import { useEffect, useRef, useState } from "react";

import { LuX } from "react-icons/lu";

import type { V3Doc } from "@/lib/needt3/map";

import { Sheet } from "../ctx/Sheet";
import { renameValue } from "./menu-model";

/**
 * Rename a document from its card or row menu: one field with the name in it,
 * selected; Return or Save writes, Escape or the scrim leaves it. An empty or
 * unchanged name writes nothing.
 */
export function RenameDocSheet({
  doc,
  onSave,
  onClose,
}: {
  doc: V3Doc | null;
  onSave: (doc: V3Doc, title: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const last = useRef<V3Doc | null>(null);
  if (doc) last.current = doc;
  useEffect(() => {
    if (!doc) return undefined;
    setText(doc.title);
    const t = window.setTimeout(() => {
      input.current?.focus();
      input.current?.select();
    }, 40);
    return () => window.clearTimeout(t);
  }, [doc]);
  const next = renameValue((doc ?? last.current)?.title, text);
  const save = () => {
    if (doc && next) onSave(doc, next);
    onClose();
  };
  return (
    <Sheet
      open={!!doc}
      onClose={onClose}
      title="Rename"
      scrimClassName="base-scrim nx-scrim"
      className="base-sheet nx-sheet docs-rename-sheet"
    >
      <header className="base-row docs-rename-head">
        <span className="docs-rename-title">Rename</span>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="nx-press base-close"
        >
          <LuX size={16} />
        </button>
      </header>
      <form
        className="docs-rename-body"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          ref={input}
          className="docs-rename-input"
          name="doc-title"
          value={text}
          maxLength={240}
          placeholder="Untitled"
          aria-label="Document name"
          autoComplete="off"
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="submit"
          className="nx-btn nx-btn-primary"
          disabled={!next}
        >
          Save
        </button>
      </form>
    </Sheet>
  );
}
