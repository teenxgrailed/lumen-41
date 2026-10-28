"use client";

import { type ReactNode, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import type { AdminUserAction } from "@/services/admin/user-actions";
import type { AdminUserDetail } from "@/services/admin/users";

import { SSelect } from "../needt3/settings/kit";
import { dayOf, minuteOf, planLabel } from "./format";
import { AdminNote, AdminPage, ConfirmSheet } from "./kit";
import { sendAdminJson, useAdminJson } from "./useAdminJson";

interface AuditRow {
  id: string;
  actorId: string | null;
  action: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

interface DetailResponse {
  user: AdminUserDetail;
  audit: AuditRow[];
  viewerId: string | null;
}

const AUDIT_LABEL: Record<string, string> = {
  "user.make_admin": "Made admin",
  "user.remove_admin": "Removed admin",
  "user.extend_trial": "Extended trial",
  "user.grant_plan": "Granted a plan",
  "user.revoke_plan": "Revoked a plan",
  "user.sign_out_everywhere": "Signed out of every device",
  "user.delete": "Deleted the account",
  "user.reset_sandbox": "Reset the sandbox",
};

/** What a person is about to confirm: the words in the dialog and the request. */
interface Pending {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  requireText?: string;
  action: AdminUserAction;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="admin-fact">
      <dt className="admin-meta">{label}</dt>
      <dd className="admin-fact-value">{children}</dd>
    </div>
  );
}

function ActionRow({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="admin-row">
      <div className="admin-row-text">
        <span className="admin-row-title">{title}</span>
        {hint ? <span className="admin-meta">{hint}</span> : null}
      </div>
      <div className="admin-row-control">{children}</div>
    </div>
  );
}

function providerLine(names: string[]) {
  return names.length > 0 ? names.join(", ") : "none";
}

export function UserDetailScreen({ userId }: { userId: string }) {
  const router = useRouter();
  const { data, error, loading, reload } = useAdminJson<DetailResponse>(
    `/api/admin/users/${encodeURIComponent(userId)}`
  );
  const [trialDays, setTrialDays] = useState("7");
  const [compKind, setCompKind] = useState<"pro_days" | "lifetime">("pro_days");
  const [compDays, setCompDays] = useState("30");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const user = data?.user;
  const isSelf = Boolean(user && data?.viewerId === user.id);
  const email = user?.email ?? "";
  const isAdmin = user?.role === "admin";
  const trialN = Number(trialDays);
  const compN = Number(compDays);
  const trialOk = Number.isInteger(trialN) && trialN >= 1 && trialN <= 365;
  const compOk =
    compKind === "lifetime" ||
    (Number.isInteger(compN) && compN >= 1 && compN <= 3650);

  const ask = (next: Pending) => {
    setActionError(null);
    setDone(null);
    setPending(next);
  };

  const confirm = async () => {
    if (!pending || !user) return;
    setBusy(true);
    setActionError(null);
    const result = await sendAdminJson<{ message: string }>(
      `/api/admin/users/${encodeURIComponent(user.id)}/actions`,
      "POST",
      pending.action
    );
    setBusy(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    const deleted = pending.action.action === "delete_account";
    setPending(null);
    if (deleted) {
      router.push("/admin/users");
      return;
    }
    setDone(result.data.message);
    reload();
  };

  return (
    <AdminPage
      title={user?.email ?? "Account"}
      lead={
        <Link href="/admin/users" className="admin-link">
          All users
        </Link>
      }
    >
      {error ? <AdminNote tone="danger">{error}</AdminNote> : null}
      {loading && !data ? <AdminNote>Loading…</AdminNote> : null}
      {done ? <AdminNote>{done}</AdminNote> : null}
      {user ? (
        <>
          <section className="admin-card" data-admin-facts="">
            <dl className="admin-facts">
              <Fact label="Plan">
                {planLabel(user.plan)}
                {user.subscription?.manual && user.subscription.plan !== "FREE"
                  ? " (comp)"
                  : ""}
                {user.subscription?.currentPeriodEnd
                  ? `, until ${dayOf(user.subscription.currentPeriodEnd)}`
                  : ""}
              </Fact>
              <Fact label="Trial ends">{dayOf(user.trialEndsAt)}</Fact>
              <Fact label="Created">{dayOf(user.createdAt)}</Fact>
              <Fact label="Last sign-in">{minuteOf(user.lastSignInAt)}</Fact>
              <Fact label="Role">{user.role}</Fact>
              <Fact label="Sign-in providers">
                {providerLine(user.providers.signIn)}
              </Fact>
              <Fact label="Calendars">
                {providerLine(user.providers.calendar)}
              </Fact>
              <Fact label="Mail">{providerLine(user.providers.mail)}</Fact>
            </dl>
            {user.deletionScheduledFor ? (
              <AdminNote>
                The person asked to delete this account; it goes on{" "}
                {dayOf(user.deletionScheduledFor)}.
              </AdminNote>
            ) : null}
          </section>

          <section className="admin-card admin-rows" data-admin-actions="">
            <ActionRow
              title={isAdmin ? "Admin" : "Make admin"}
              hint={
                isSelf
                  ? "You cannot change your own role."
                  : "Admins can open this panel."
              }
            >
              <button
                type="button"
                className="nx-btn nx-btn-secondary"
                disabled={isSelf}
                data-admin-act="set-admin"
                onClick={() =>
                  ask({
                    title: isAdmin ? "Remove admin role" : "Make admin",
                    body: isAdmin
                      ? `${email} will lose access to this panel.`
                      : `${email} will be able to change any account.`,
                    confirmLabel: isAdmin ? "Remove admin" : "Make admin",
                    action: { action: "set_admin", admin: !isAdmin },
                  })
                }
              >
                {isAdmin ? "Remove admin" : "Make admin"}
              </button>
            </ActionRow>

            <ActionRow
              title="Extend trial"
              hint="Adds days to the end of the trial, or starts one."
            >
              <input
                className="nt-input admin-days"
                inputMode="numeric"
                value={trialDays}
                aria-label="Trial days"
                onChange={(e) => setTrialDays(e.target.value)}
              />
              <button
                type="button"
                className="nx-btn nx-btn-secondary"
                disabled={!trialOk}
                data-admin-act="extend-trial"
                onClick={() =>
                  ask({
                    title: "Extend trial",
                    body: `Add ${trialN} days to the trial of ${email}.`,
                    confirmLabel: "Extend",
                    action: { action: "extend_trial", days: trialN },
                  })
                }
              >
                Extend
              </button>
            </ActionRow>

            <ActionRow
              title="Grant a plan"
              hint="A free comp. Nothing is charged. Lifetime takes one of the 300 seats."
            >
              <SSelect
                value={compKind}
                label="Plan to grant"
                width={150}
                options={[
                  ["pro_days", "Pro for days"],
                  ["lifetime", "Lifetime"],
                ]}
                onChange={(v) => setCompKind(v as "pro_days" | "lifetime")}
              />
              {compKind === "pro_days" ? (
                <input
                  className="nt-input admin-days"
                  inputMode="numeric"
                  value={compDays}
                  aria-label="Comp days"
                  onChange={(e) => setCompDays(e.target.value)}
                />
              ) : null}
              <button
                type="button"
                className="nx-btn nx-btn-secondary"
                disabled={!compOk}
                data-admin-act="grant-plan"
                onClick={() =>
                  ask({
                    title: "Grant a plan",
                    body:
                      compKind === "lifetime"
                        ? `Give ${email} Lifetime, free of charge.`
                        : `Give ${email} Pro for ${compN} days, free of charge.`,
                    confirmLabel: "Grant",
                    action:
                      compKind === "lifetime"
                        ? { action: "grant_plan", kind: "lifetime" }
                        : {
                            action: "grant_plan",
                            kind: "pro_days",
                            days: compN,
                          },
                  })
                }
              >
                Grant
              </button>
            </ActionRow>

            <ActionRow
              title="Revoke a granted plan"
              hint="Only a comp. A plan the person bought is changed in Creem."
            >
              <button
                type="button"
                className="nx-btn nx-btn-secondary"
                data-admin-act="revoke-plan"
                onClick={() =>
                  ask({
                    title: "Revoke the plan",
                    body: `${email} goes back to Free.`,
                    confirmLabel: "Revoke",
                    action: { action: "revoke_plan" },
                  })
                }
              >
                Revoke
              </button>
            </ActionRow>

            <ActionRow
              title="Sign out of all devices"
              hint="Ends every session and the connector token."
            >
              <button
                type="button"
                className="nx-btn nx-btn-secondary"
                data-admin-act="sign-out"
                onClick={() =>
                  ask({
                    title: "Sign out of all devices",
                    body: `${email} will have to sign in again everywhere.`,
                    confirmLabel: "Sign out",
                    action: { action: "sign_out_everywhere" },
                  })
                }
              >
                Sign out
              </button>
            </ActionRow>

            <ActionRow
              title="Delete the account"
              hint={
                isSelf
                  ? "You cannot delete your own account here."
                  : "Removes the account and its data now. This cannot be undone."
              }
            >
              <button
                type="button"
                className="nx-btn nx-btn-danger"
                disabled={isSelf}
                data-admin-act="delete"
                onClick={() =>
                  ask({
                    title: "Delete the account",
                    body: `This deletes ${email} and everything in it, now.`,
                    confirmLabel: "Delete account",
                    danger: true,
                    requireText: email,
                    action: { action: "delete_account", confirmEmail: email },
                  })
                }
              >
                Delete
              </button>
            </ActionRow>
          </section>

          <section className="admin-card" data-admin-audit="">
            <h2 className="admin-section-title">History</h2>
            {data.audit.length === 0 ? (
              <AdminNote>Nothing has been changed by an admin.</AdminNote>
            ) : (
              <ul className="admin-history">
                {data.audit.map((row) => (
                  <li key={row.id}>
                    <span>{AUDIT_LABEL[row.action] ?? row.action}</span>
                    <span className="admin-meta">
                      {minuteOf(row.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}

      <ConfirmSheet
        open={pending !== null}
        title={pending?.title ?? ""}
        confirmLabel={pending?.confirmLabel ?? "Confirm"}
        danger={pending?.danger}
        requireText={pending?.requireText}
        busy={busy}
        error={actionError}
        onConfirm={confirm}
        onClose={() => {
          if (!busy) setPending(null);
        }}
      >
        {pending?.body}
      </ConfirmSheet>
    </AdminPage>
  );
}
