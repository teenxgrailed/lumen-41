"use client";

import { useState } from "react";

import { signOut, useSession } from "next-auth/react";

import { FiUsers } from "react-icons/fi";

import { AccountSettings } from "@/components/settings/AccountSettings";

import { clearNeedtOfflineData } from "@/lib/pwa/offline-client";

import { Avatar, initialsOf } from "../shell/Avatar";
import { SGroup, SRow } from "./kit";
import { EVERYWHERE_COPY, useSignOutEverywhere } from "./sign-out-everywhere";

/**
 * Account. Name and email come from the session; sign-out clears the offline
 * copy first, as the old Settings does. Deleting the account keeps the
 * existing flow (re-authentication, then the queued deletion): the old
 * `AccountSettings` panel opens under the row instead of being rewritten.
 *
 * //todo: edit name / email / avatar, password change, the Google and Apple
 * sign-in rows, and the devices list have no route behind them.
 */
export function AccountSection() {
  const session = useSession();
  const [deleting, setDeleting] = useState(false);
  const everywhere = useSignOutEverywhere();
  const user = session.data?.user;
  const name = user?.name || user?.email?.split("@")[0] || "Account";

  const leave = async () => {
    await clearNeedtOfflineData();
    await signOut({ callbackUrl: "/auth/signin" });
  };

  return (
    <>
      <SGroup title="Profile">
        <div className="settings-row-10">
          <Avatar
            initials={initialsOf(name)}
            name={name}
            size={56}
            src={user?.image}
          />
          <div className="settings-stack-4">
            {(
              [
                [
                  "Name",
                  name,
                  "Visible on documents you share by link or email.",
                ],
                [
                  "Email",
                  user?.email ?? "—",
                  "Where we write to you, and one way to sign in.",
                ],
              ] as const
            ).map(([label, value, hint]) => (
              <div className="settings-row-11" key={label}>
                <span className="settings-stack-5">
                  <span className="settings-text-5">{label}</span>
                  <span className="settings-text-6">{value}</span>
                  <span className="base-meta">{hint}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </SGroup>
      <SGroup>
        <SRow
          title="Teams"
          desc="Share projects and documents with the people you work with, inside your Needt."
          lead={
            <span className="settings-signin-ico">
              <FiUsers size={14} aria-hidden />
            </span>
          }
        >
          <span className="settings-soon" data-settings-teams-soon>
            Coming soon
          </span>
        </SRow>
      </SGroup>
      <SGroup>
        <SRow title="Sign out" tone="link" onClick={() => void leave()} />
        <SRow
          title={EVERYWHERE_COPY.title}
          desc={everywhere.armed ? EVERYWHERE_COPY.ask : EVERYWHERE_COPY.desc}
          expanded={everywhere.armed}
        >
          {everywhere.armed ? (
            <>
              <button
                type="button"
                className="nx-btn nx-btn-text"
                autoFocus
                disabled={everywhere.busy}
                onClick={everywhere.cancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="nx-btn nx-btn-danger"
                data-settings-signout-all-confirm=""
                disabled={everywhere.busy}
                onClick={() => void everywhere.confirm()}
              >
                {everywhere.busy ? EVERYWHERE_COPY.busy : EVERYWHERE_COPY.cta}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="nx-btn nx-btn-text"
              data-settings-signout-all=""
              onClick={everywhere.arm}
            >
              {EVERYWHERE_COPY.cta}
            </button>
          )}
        </SRow>
      </SGroup>
      <SGroup title="Danger zone">
        <SRow
          title="Delete account"
          tone="danger"
          // The wait is ACCOUNT_DELETION_GRACE_DAYS (services/account/account-deletion).
          desc="Deletion is scheduled for 7 days after you confirm, and you can cancel it here until then. After that your tasks, documents, habits and connections are gone for good. Export first under Data & privacy."
          expanded={deleting}
          onClick={() => setDeleting((d) => !d)}
        />
        {deleting ? <AccountSettings /> : null}
      </SGroup>
    </>
  );
}
