"use client";

import { type FormEvent, useState } from "react";

import type { AdminAnnouncement } from "@/services/popups/announcements";

import { notify } from "@/lib/notifications";
import {
  ANNOUNCEMENT_KINDS,
  type AnnouncementKindName,
  POPUP_PLANS,
  type PopupPlan,
} from "@/lib/popups/types";

import { SSelect } from "../needt3/settings/kit";
import { minuteOf } from "./format";
import { AdminNote, AdminPage, ConfirmSheet } from "./kit";
import { sendAdminJson, useAdminJson } from "./useAdminJson";

/** An announcement as the list route sends it (dates as strings). */
type Row = Omit<
  AdminAnnouncement,
  "createdAt" | "updatedAt" | "publishedAt" | "startsAt" | "endsAt"
> & {
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
};

interface Draft {
  slug: string;
  title: string;
  kind: AnnouncementKindName;
  badge: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  priority: string;
  plans: PopupPlan[];
}

const EMPTY: Draft = {
  slug: "",
  title: "",
  kind: "update",
  badge: "",
  body: "",
  ctaLabel: "",
  ctaHref: "",
  priority: "0",
  plans: [],
};

function draftOf(row: Row): Draft {
  const cta = row.primaryCta as { label?: string; href?: string } | null;
  return {
    slug: row.slug,
    title: row.title,
    kind: row.kind,
    badge: row.badge ?? "",
    body: row.body,
    ctaLabel: cta?.label ?? "",
    ctaHref: cta?.href ?? "",
    priority: String(row.priority),
    plans: row.plans.filter((p): p is PopupPlan =>
      (POPUP_PLANS as readonly string[]).includes(p)
    ),
  };
}

/** The request body for create and edit. Bullets, image, dates and the finer audience stay API-only for now. */
export function bodyOf(draft: Draft): Record<string, unknown> {
  const label = draft.ctaLabel.trim();
  const href = draft.ctaHref.trim();
  return {
    slug: draft.slug.trim(),
    title: draft.title.trim(),
    kind: draft.kind,
    badge: draft.badge.trim() || null,
    body: draft.body.trim(),
    primaryCta: label && href ? { label, href } : null,
    priority: Number.parseInt(draft.priority, 10) || 0,
    plans: draft.plans,
  };
}

function AnnouncementForm({
  initial,
  editingId,
  onDone,
  onCancel,
}: {
  initial: Draft;
  editingId: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = editingId
      ? await sendAdminJson(
          `/api/admin/announcements/${encodeURIComponent(editingId)}`,
          "PATCH",
          bodyOf(draft)
        )
      : await sendAdminJson("/api/admin/announcements", "POST", bodyOf(draft));
    setBusy(false);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    notify.success(editingId ? "Saved." : "Draft created.");
    onDone();
  };

  const togglePlan = (plan: PopupPlan) =>
    set(
      "plans",
      draft.plans.includes(plan)
        ? draft.plans.filter((p) => p !== plan)
        : [...draft.plans, plan]
    );

  return (
    <form
      className="admin-popup-form"
      onSubmit={submit}
      data-admin-popup-form=""
    >
      <h3 className="admin-section-title">
        {editingId ? "Edit announcement" : "New draft"}
      </h3>
      <input
        className="nt-input"
        value={draft.slug}
        placeholder="slug (whats-new-december)"
        aria-label="Slug"
        spellCheck={false}
        onChange={(e) => set("slug", e.target.value)}
      />
      <input
        className="nt-input"
        value={draft.title}
        placeholder="Title"
        aria-label="Title"
        onChange={(e) => set("title", e.target.value)}
      />
      <SSelect
        label="Kind"
        value={draft.kind}
        width={120}
        options={ANNOUNCEMENT_KINDS.map((k) => [k, k] as [string, string])}
        onChange={(value) => set("kind", value as AnnouncementKindName)}
      />
      <input
        className="nt-input"
        value={draft.badge}
        placeholder="Badge (New)"
        aria-label="Badge"
        onChange={(e) => set("badge", e.target.value)}
      />
      <textarea
        className="nt-input"
        value={draft.body}
        rows={4}
        placeholder="Body"
        aria-label="Body"
        onChange={(e) => set("body", e.target.value)}
      />
      <input
        className="nt-input"
        value={draft.ctaLabel}
        placeholder="Button label (optional)"
        aria-label="Button label"
        onChange={(e) => set("ctaLabel", e.target.value)}
      />
      <input
        className="nt-input"
        value={draft.ctaHref}
        placeholder="Button path (/calendar)"
        aria-label="Button path"
        spellCheck={false}
        onChange={(e) => set("ctaHref", e.target.value)}
      />
      <input
        className="nt-input"
        value={draft.priority}
        inputMode="numeric"
        placeholder="Priority"
        aria-label="Priority"
        onChange={(e) => set("priority", e.target.value)}
      />
      <fieldset className="admin-popup-plans">
        <legend className="admin-meta">Plans (none = everybody)</legend>
        {POPUP_PLANS.map((plan) => (
          <label key={plan} className="admin-meta">
            <input
              type="checkbox"
              checked={draft.plans.includes(plan)}
              onChange={() => togglePlan(plan)}
            />{" "}
            {plan}
          </label>
        ))}
      </fieldset>
      <div className="admin-flag-actions">
        <button
          type="submit"
          className="nx-btn nx-btn-primary"
          disabled={busy || !draft.slug.trim() || !draft.title.trim()}
        >
          {editingId ? "Save" : "Create draft"}
        </button>
        <button
          type="button"
          className="nx-btn nx-btn-secondary"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * Popups: announcements as data. Create drafts, edit, publish, unpublish,
 * delete, and read shown / clicked / dismissed counts. Plan moments (limit
 * hits, trial ending) are code, not rows, so they are not listed here.
 */
export function PopupsScreen() {
  const { data, error, loading, reload } = useAdminJson<{
    announcements: Row[];
  }>("/api/admin/announcements");
  const [editing, setEditing] = useState<{
    id: string | null;
    draft: Draft;
  } | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const publish = async (row: Row, published: boolean) => {
    setBusy(true);
    const result = await sendAdminJson(
      `/api/admin/announcements/${encodeURIComponent(row.id)}/publish`,
      "POST",
      { published }
    );
    setBusy(false);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    notify.success(published ? "Published." : "Back to draft.");
    reload();
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    const result = await sendAdminJson(
      `/api/admin/announcements/${encodeURIComponent(deleting.id)}`,
      "DELETE"
    );
    setBusy(false);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    setDeleting(null);
    notify.success("Deleted.");
    reload();
  };

  const rows = data?.announcements ?? [];
  return (
    <AdminPage
      title="Popups"
      lead="Announcements people see once. Each person gets at most one popup every 3 days."
      actions={
        <button
          type="button"
          className="nx-btn nx-btn-secondary"
          onClick={() => setEditing({ id: null, draft: EMPTY })}
          data-admin-popup-new=""
        >
          New draft
        </button>
      }
    >
      {error ? <AdminNote tone="danger">{error}</AdminNote> : null}
      {loading && !data ? <AdminNote>Loading…</AdminNote> : null}
      {editing ? (
        <AnnouncementForm
          key={editing.id ?? "new"}
          initial={editing.draft}
          editingId={editing.id}
          onCancel={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            reload();
          }}
        />
      ) : null}
      {data && rows.length === 0 ? (
        <AdminNote>No announcements yet.</AdminNote>
      ) : null}
      <ul className="admin-history" data-admin-popups="">
        {rows.map((row) => (
          <li key={row.id} data-admin-popup={row.slug}>
            <div>
              <div className="admin-flag-key">{row.title}</div>
              <div className="admin-meta">
                {row.slug} · {row.kind} · priority {row.priority}
                {row.plans.length ? ` · ${row.plans.join(", ")}` : ""} · updated{" "}
                {minuteOf(row.updatedAt)}
              </div>
              <div className="admin-meta">
                Shown {row.stats.shown} · clicked {row.stats.clicked} ·
                dismissed {row.stats.dismissed}
              </div>
            </div>
            <span className="admin-flag-actions">
              <span className="admin-badge">
                {row.status === "published" ? "Published" : "Draft"}
              </span>
              <button
                type="button"
                className="nx-btn nx-btn-secondary"
                disabled={busy}
                onClick={() => setEditing({ id: row.id, draft: draftOf(row) })}
              >
                Edit
              </button>
              <button
                type="button"
                className="nx-btn nx-btn-secondary"
                disabled={busy}
                onClick={() => void publish(row, row.status !== "published")}
              >
                {row.status === "published" ? "Unpublish" : "Publish"}
              </button>
              <button
                type="button"
                className="nx-btn nx-btn-secondary"
                disabled={busy}
                onClick={() => setDeleting(row)}
              >
                Delete
              </button>
            </span>
          </li>
        ))}
      </ul>
      <ConfirmSheet
        open={deleting !== null}
        title="Delete this announcement?"
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={() => void remove()}
        onClose={() => setDeleting(null)}
      >
        {deleting
          ? `“${deleting.title}” and its view history go away for good.`
          : null}
      </ConfirmSheet>
    </AdminPage>
  );
}
