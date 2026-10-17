"use client";

import { type FormEvent, useState } from "react";

import Link from "next/link";

import type { AdminUserRow } from "@/services/admin/users";

import { dayOf, planLabel } from "./format";
import { AdminNote, AdminPage } from "./kit";
import { useAdminJson } from "./useAdminJson";

/** Search people by part of an email; the newest accounts show until you do. */
export function UsersScreen() {
  const [text, setText] = useState("");
  const [applied, setApplied] = useState("");
  const { data, error, loading } = useAdminJson<{ users: AdminUserRow[] }>(
    `/api/admin/users?q=${encodeURIComponent(applied)}`
  );
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
      </form>
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
                  <td>{user.role}</td>
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
    </AdminPage>
  );
}
