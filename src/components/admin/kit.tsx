"use client";

import { type ReactNode, useEffect, useState } from "react";

import { Sheet } from "../needt3/ctx/Sheet";

/** A page's title row. Every admin page starts with one. */
export function AdminPage({
  title,
  lead,
  actions,
  children,
}: {
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="admin-page">
      <header className="admin-page-head">
        <div className="admin-page-titles">
          <h1 className="admin-title">{title}</h1>
          {lead ? <p className="admin-lead">{lead}</p> : null}
        </div>
        {actions ? <div className="admin-page-actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** A quiet message line: an error, an empty list, a loading note. */
export function AdminNote({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: "danger";
}) {
  return (
    <p
      className={"admin-note" + (tone === "danger" ? " is-danger" : "")}
      role={tone === "danger" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}

/**
 * Confirms one action in a dialog. `requireText` makes the person type it
 * (the account's email, for a deletion) before the button enables.
 */
export function ConfirmSheet({
  open,
  title,
  children,
  confirmLabel,
  danger,
  requireText,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  requireText?: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);
  const matches =
    !requireText || typed.trim().toLowerCase() === requireText.toLowerCase();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      scrimClassName="base-scrim nx-scrim"
      className="base-sheet nx-sheet admin-confirm"
    >
      <h2 className="admin-confirm-title">{title}</h2>
      {children ? <div className="admin-confirm-body">{children}</div> : null}
      {requireText ? (
        <label className="admin-confirm-type">
          <span className="admin-meta">
            Type <b>{requireText}</b> to confirm
          </span>
          <input
            className="nt-input"
            value={typed}
            autoComplete="off"
            spellCheck={false}
            aria-label="Confirmation text"
            onChange={(e) => setTyped(e.target.value)}
          />
        </label>
      ) : null}
      {error ? <AdminNote tone="danger">{error}</AdminNote> : null}
      <div className="admin-confirm-actions">
        <button
          type="button"
          className="nx-btn nx-btn-secondary"
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          className={
            "nx-btn " + (danger ? "nx-btn-danger" : "nx-btn-secondary")
          }
          data-admin-confirm=""
          disabled={busy || !matches}
          onClick={onConfirm}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
