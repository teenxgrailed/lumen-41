"use client";

import { useEffect, useRef, useState } from "react";

import { LuFolder } from "react-icons/lu";

import type { V3Doc } from "@/lib/needt3/map";

import { renameValue } from "../../docs/menu-model";
import { PkActions, type PkActs } from "../kit/Hold";
import { PkButton } from "../kit/Material";
import { PkSheet } from "../kit/Sheet";

/**
 * Rename, from the long-press sheet: one field with the page's name in it, the
 * keyboard up, Save on the return key or the button. An empty or unchanged name
 * saves nothing.
 */
export function RenameSheet({
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
  const shown = doc ?? last.current;
  useEffect(() => {
    if (!doc) return undefined;
    setText(doc.title);
    // After the sheet is up: focusing in the same frame scrolls the page.
    const t = window.setTimeout(() => {
      input.current?.focus();
      input.current?.select();
    }, 260);
    return () => window.clearTimeout(t);
  }, [doc]);
  const next = shown ? renameValue(shown.title, text) : null;
  const save = () => {
    if (doc && next) onSave(doc, next);
    onClose();
  };
  return (
    <PkSheet
      open={!!doc}
      onClose={onClose}
      title="Rename"
      label="Rename document"
      className="pd-rename-sheet"
    >
      <form
        className="pd-rename"
        data-pd-rename=""
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          ref={input}
          className="pd-url-input"
          name="doc-title"
          value={text}
          maxLength={240}
          placeholder="Untitled"
          aria-label="Document name"
          enterKeyHint="done"
          autoComplete="off"
          autoCorrect="off"
          onChange={(e) => setText(e.target.value)}
        />
        <PkButton kind="primary" disabled={!next} type="submit">
          Save
        </PkButton>
      </form>
    </PkSheet>
  );
}

/**
 * Move to project: the workspace's projects as rows, the current one ticked,
 * and "No project" to take the page out. Choosing a row closes the sheet and
 * writes (PkActions closes, then runs).
 */
export function MoveSheet({
  doc,
  projects,
  onPick,
  onClose,
}: {
  doc: V3Doc | null;
  projects: readonly { id: string; name: string; color: string | null }[];
  onPick: (doc: V3Doc, projectId: string | null, name?: string) => void;
  onClose: () => void;
}) {
  const acts: PkActs | null = doc
    ? {
        title: "Move to project",
        meta: doc.title || "Untitled",
        actions: [
          {
            label: "No project",
            icon: <LuFolder size={18} aria-hidden />,
            hue: "var(--v2p-ink-3)",
            check: !doc.projectId,
            onClick: () => onPick(doc, null),
          },
          ...projects.map((p) => ({
            label: p.name,
            icon: <LuFolder size={18} aria-hidden />,
            hue: p.color ?? "var(--v2p-ink-3)",
            check: doc.projectId === p.id,
            onClick: () => onPick(doc, p.id, p.name),
          })),
        ],
      }
    : null;
  return <PkActions acts={acts} onClose={onClose} />;
}
