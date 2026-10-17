"use client";

import { useState } from "react";

import { signOut, useSession } from "next-auth/react";

import { FiKey, FiMonitor, FiUsers } from "react-icons/fi";

import { AccountSettings } from "@/components/settings/AccountSettings";

import { notify } from "@/lib/notifications";
import { clearNeedtOfflineData } from "@/lib/pwa/offline-client";

import { BrandIcon, brandIdFor } from "../brand";
import { initialsOf } from "../shell/Avatar";
import {
  deviceLine,
  sendPasswordLink,
  signInMethods,
  useLinkedProviders,
} from "./account-info";
import { MeDisc, SBtn, SGroup, SRow } from "./kit";
import { EVERYWHERE_COPY, useSignOutEverywhere } from "./sign-out-everywhere";

/**
 * Account. Name and email come from the session; sign-out clears the offline
 * copy first, as the old Settings does. Deleting the account keeps the
 * existing flow (re-authentication, then the queued deletion): the old
 * `AccountSettings` panel opens under the row instead of being rewritten.
 *
 * Sign-in methods lists what is linked (`/api/account/lifecycle`); the
 * password row mails the existing reset link. Devices shows this device and
 * the one real device action, signing out everywhere (PR #118).
 *
 * //todo: edit name / email / avatar (no profile route; an email change needs
 * a confirmation flow), connecting or disconnecting a provider (no safe route:
 * it needs a re-authentication and a last-method guard), and a list of other
 * devices (sessions are stateless JWTs; the server keeps no list).
 */
export function AccountSection() {
  const session = useSession();
  const [deleting, setDeleting] = useState(false);
  const everywhere = useSignOutEverywhere();
  const linked = useLinkedProviders();
  const [mailing, setMailing] = useState(false);
  const user = session.data?.user;
  const methods = signInMethods(linked ?? []);
  const name = user?.name || user?.email?.split("@")[0] || "Account";

  const leave = async () => {
    await clearNeedtOfflineData();
    await signOut({ callbackUrl: "/auth/signin" });
  };

  const mailLink = async () => {
    if (!user?.email || mailing) return;
    setMailing(true);
    const ok = await sendPasswordLink(user.email);
    setMailing(false);
    if (ok) notify.success(`We sent a link to ${user.email}.`);
    else notify.error("Could not send the link. Try again in a moment.");
  };

  return (
    <>
      <SGroup title="Profile">
        <div className="settings-row-10">
          <span className="settings-span-6">
            <MeDisc
              initials={initialsOf(name)}
              name={name}
              size="xl"
              src={user?.image}
            />
          </span>
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
      {methods.length ? (
        <SGroup title="Sign-in methods">
          {methods.map((m) => (
            <SRow
              key={m.id}
              title={m.label}
              desc={
                m.id === "credentials"
                  ? "Your email and a password."
                  : user?.email
                    ? `Signed in with ${m.label} as ${user.email}`
                    : `Signed in with ${m.label}`
              }
              lead={
                m.id === "credentials" ? (
                  <span className="settings-signin-ico">
                    <FiKey size={14} aria-hidden />
                  </span>
                ) : (
                  <BrandIcon id={brandIdFor(m.id)} size={26} />
                )
              }
            >
              {m.id === "credentials" && user?.email ? (
                <SBtn disabled={mailing} onClick={() => void mailLink()}>
                  Change by email
                </SBtn>
              ) : (
                <span className="base-meta">Connected</span>
              )}
            </SRow>
          ))}
        </SGroup>
      ) : null}
      <SGroup title="Devices">
        <SRow
          title="This device"
          desc={deviceLine(
            typeof navigator === "undefined" ? null : navigator.userAgent,
            session.data?.expires
          )}
          lead={
            <span className="settings-signin-ico">
              <FiMonitor size={14} aria-hidden />
            </span>
          }
        />
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
