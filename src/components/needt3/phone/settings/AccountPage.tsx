"use client";

import { useRef, useState } from "react";

import { signOut, useSession } from "next-auth/react";

import { LuUsers } from "react-icons/lu";

import { AccountSettings } from "@/components/settings/AccountSettings";

import { clearNeedtOfflineData } from "@/lib/pwa/offline-client";

import { initialsOf } from "../../shell/Avatar";
import { PsGlyph, PsGroup, PsRow } from "./parts";

/**
 * Sign out, the one existing flow: the offline copy is cleared first, then
 * the session ends (the same two calls as the desktop's Account section). A
 * second tap while it runs does nothing.
 */
export function useSignOut() {
  const going = useRef(false);
  return async () => {
    if (going.current) return;
    going.current = true;
    try {
      await clearNeedtOfflineData();
      await signOut({ callbackUrl: "/auth/signin" });
    } finally {
      going.current = false;
    }
  };
}

/**
 * Account. Name and email come from the session. Deleting the account keeps
 * the existing flow (re-authentication, then the queued deletion): the old
 * `AccountSettings` panel opens under the row, as it does on the desktop.
 *
 * //todo: edit name / email / avatar, password change, the Google and Apple
 * sign-in rows and the devices list have no route behind them (the desktop
 * lists the same gaps), so they are not drawn.
 */
export function AccountPage() {
  const session = useSession();
  const [deleting, setDeleting] = useState(false);
  const leave = useSignOut();
  const user = session.data?.user;
  const name = user?.name || user?.email?.split("@")[0] || "Account";
  return (
    <>
      <div className="ps-profile is-page" data-ps-account-profile="">
        <span className="ps-avatar is-lg" aria-hidden="true">
          {user?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="ps-avatar-img" src={user.image} alt="" />
          ) : (
            initialsOf(name)
          )}
        </span>
      </div>
      <PsGroup title="Profile">
        <PsRow
          title={name}
          desc="Name · visible on documents you share by link or email."
        />
        <PsRow
          title={user?.email ?? "—"}
          desc="Email · where we write to you, and one way to sign in."
        />
      </PsGroup>
      <PsGroup>
        <PsRow
          glyph={
            <PsGlyph icon={<LuUsers size={16} />} hue="var(--pk-violet)" />
          }
          title="Teams"
          desc="Share projects and documents with the people you work with, inside your Needt."
          value={<span className="ps-soon">Soon</span>}
        />
      </PsGroup>
      <PsGroup>
        <PsRow
          title="Sign out"
          tone="link"
          chevron={false}
          onOpen={() => void leave()}
          data={{ "data-ps-signout": "" }}
        />
      </PsGroup>
      <PsGroup title="Danger zone">
        <PsRow
          title="Delete account"
          tone="danger"
          // The wait is ACCOUNT_DELETION_GRACE_DAYS (services/account/account-deletion).
          desc="Deletion is scheduled for 7 days after you confirm, and you can cancel it here until then. After that your tasks, documents, habits and connections are gone for good. Export first under Data & privacy."
          chevron={false}
          expanded={deleting}
          onOpen={() => setDeleting((d) => !d)}
          data={{ "data-ps-delete": "" }}
        />
        {deleting ? (
          <div className="ps-embed pk-no-drag">
            <AccountSettings />
          </div>
        ) : null}
      </PsGroup>
    </>
  );
}
