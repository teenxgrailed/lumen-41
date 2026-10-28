"use client";

import { type FormEvent, useState } from "react";

import Link from "next/link";

import type { AdminUserRow } from "@/services/admin/users";

import { dayOf, planLabel } from "./format";
import { AdminNote, AdminPage, ConfirmSheet } from "./kit";
import { sendAdminJson, useAdminJson } from "./useAdminJson";

/** Search people by part of an email; the newest accounts show until you do. */
export function UsersScreen() {
  const [text, setText] = useState("");
  const [applied, setApplied] = useState("");
  const { data, error, loading, reload } = useAdminJson<{
    users: AdminUserRow[];
  }>(`/api/admin/users?q=${encodeURIComponent(applied)}`);
  const [askReset, setAskReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState<string | null>(null);
  const resetSandbox = async () => {
    setResetting(true);
    setResetError(null);
    const result = await sendAdminJson<{ message: string }>(
      "/api/admin/sandbox",
      "POST"
    );
    setResetting(false);
    if (!result.ok) {
      setResetError(result.error);
      return;
    }
    setAskReset(false);
    setResetDone(result.data.message);
    reload();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setApplied(text.trim());
  };
  return (
    <AdminPage title="Users" lead="Find an account by email.">
      <form className="admin-toolbar" onSubmit={submit} role="search">
        <input
          className="nt-input"
          type="search"
          value={text}
          placeholder="Part of an email"
          aria-label="Search by email"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="nx-btn nx-btn-secondary">
          Search
        </button>
        <button
          type="button"
          className="nx-btn nx-btn-secondary"
          data-admin-sandbox-reset=""
          onClick={() => {
            setResetDone(null);
            setResetError(null);
            setAskReset(true);
          }}
        >
          Reset sandbox now
        </button>
      </form>
      {resetDone ? <AdminNote>{resetDone}</AdminNote> : null}
      {error ? <AdminNote tone="danger">{error}</AdminNote> : null}
      {loading && !data ? <AdminNote>Loading…</AdminNote> : null}
      {data && data.users.length === 0 ? (
        <AdminNote>No account matches.</AdminNote>
      ) : null}
      {data && data.users.length > 0 ? (
        <div className="admin-table-wrap">
          <table className="admin-table" data-admin-users="">
            <thead>
              <tr>
                <th>Email</th>
                <th>Plan</th>
                <th>Role</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="admin-link"
                    >
                      {user.email ?? user.name ?? user.id}
                    </Link>
                  </td>
                  <td>
                    <span className="admin-badge">{planLabel(user.plan)}</span>
                  </td>
                  <td>
                    {user.role}
                    {user.sandboxKind ? (
                      <>
                        {" "}
                        <span className="admin-badge" data-admin-sandbox="">
                          {user.sandboxKind === "publicDemo"
                            ? "Demo sandbox"
                            : "Reviewer sandbox"}
                        </span>
                      </>
                    ) : null}
                  </td>
                  <td>{dayOf(user.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {data && data.users.length >= 25 ? (
        <AdminNote>
          Showing the first 25. Narrow the search to see others.
        </AdminNote>
      ) : null}
      <ConfirmSheet
        open={askReset}
        title="Reset sandbox now?"
        confirmLabel="Reset"
        danger
        busy={resetting}
        error={resetError}
        onConfirm={() => void resetSandbox()}
        onClose={() => {
          if (!resetting) setAskReset(false);
        }}
      >
        Everything in the sandbox accounts is deleted and the sample planner is
        written again. Their API and MCP connections older than a day are cut.
        Real accounts are never touched.
      </ConfirmSheet>
    </AdminPage>
  );
}
