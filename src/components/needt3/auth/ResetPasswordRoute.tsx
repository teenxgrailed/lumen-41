"use client";

/* SET A NEW PASSWORD, the page the reset mail's link opens
   (/auth/reset-password?token=…), on the v3 screens (prototype AuthScreen.jsx
   recover === "reset"). The request, its validation and its rate limits are
   the existing POST /api/auth/reset-password/reset; only the face is new.

   Differs from the prototype, and why: the link carries a token, not the
   address, so the page cannot sign the person in afterwards ("Save and sign
   in" becomes "Save password", then Sign in); and the server also asks for an
   uppercase letter, a lowercase letter and a number, so the hint says so. */
import * as React from "react";

import {
  LuArrowLeft,
  LuCircleCheck,
  LuLock,
  LuRefreshCw,
} from "react-icons/lu";

import { logger } from "@/lib/logger";
import type { PhoneUi } from "@/lib/needt3/phone-ui";
import { useOnline } from "@/lib/needt3/use-online";

import { useResolvedPhoneUi } from "../root/phone-ui-context";
import { AuthScope } from "./AuthScope";
import {
  LinkButton,
  LinkFoot,
  LinkNote,
  LinkShell,
  NewPasswordField,
} from "./LinkFaces";
import {
  type ResetStep,
  newPasswordProblem,
  newPasswordText,
  resetOutcome,
} from "./link-logic";

const LOG_SOURCE = "needt3-reset-password";

export function V3ResetPasswordRoute({
  token,
  initialUi = "desktop",
  uiForced = false,
}: {
  token: string;
  initialUi?: PhoneUi;
  uiForced?: boolean;
}) {
  const face = useResolvedPhoneUi(initialUi, uiForced);
  const online = useOnline();
  const offline = !online;
  /* Owned here, above the face switch: crossing 700px keeps what was typed.
     Never logged, never stored. */
  const [pass, setPass] = React.useState("");
  const [tried, setTried] = React.useState(false);
  const [step, setStep] = React.useState<ResetStep>("set");
  const [busy, setBusy] = React.useState(false);
  const [trouble, setTrouble] = React.useState<null | "limited" | "error">(
    null
  );

  const problem = newPasswordProblem(pass);
  const shown = tried && problem !== null;

  async function save() {
    if (busy || offline) return;
    setTried(true);
    if (problem) return;
    setBusy(true);
    setTrouble(null);
    try {
      const response = await fetch("/api/auth/reset-password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: pass }),
      });
      const outcome = resetOutcome(response.status);
      if (outcome === "saved") {
        setPass("");
        setStep("saved");
      } else if (outcome === "invalid") {
        setPass("");
        setStep("invalid");
      } else {
        setTrouble(outcome);
      }
    } catch (e) {
      void logger.error(
        "Password reset failed",
        { error: e instanceof Error ? e.message : String(e) },
        LOG_SOURCE
      );
      setTrouble("error");
    } finally {
      setBusy(false);
    }
  }

  const back = (
    <LinkFoot
      face={face}
      lead="Remembered it?"
      href="/auth/signin"
      icon={LuArrowLeft}
      data-auth-back-signin
    >
      Back to sign in
    </LinkFoot>
  );

  let body: React.ReactNode;
  if (step === "saved") {
    body = (
      <LinkShell
        face={face}
        screen="reset-saved"
        kicker="Reset password"
        icon={LuCircleCheck}
        hue="var(--success)"
        a="Password"
        b="saved"
        line="Sign in with your new password. Devices signed in with the old one have been signed out."
      >
        <LinkButton
          face={face}
          primary
          onClick={() => window.location.assign("/auth/signin")}
          data-auth-go-signin
        >
          Sign in
        </LinkButton>
      </LinkShell>
    );
  } else if (step === "invalid") {
    body = (
      <LinkShell
        face={face}
        screen="reset-invalid"
        kicker="Reset password"
        icon={LuLock}
        hue="var(--v2p-lav)"
        a="This link doesn’t"
        b="work"
        line="It has expired or has already been used. Ask for a new one; it works for 1 hour."
        foot={back}
      >
        <LinkButton
          face={face}
          primary
          icon={LuRefreshCw}
          onClick={() => window.location.assign("/auth/reset-password")}
          data-auth-new-link
        >
          Send a new link
        </LinkButton>
      </LinkShell>
    );
  } else {
    body = (
      <LinkShell
        face={face}
        screen="reset-set"
        kicker="Reset password"
        icon={LuLock}
        hue="var(--v2p-lav)"
        a="Set a new"
        b="password"
        line="Choose the password you’ll sign in with. Devices signed in with the old one are signed out."
        foot={back}
        offline={offline}
        offlineText="You’re offline — resetting a password needs a connection."
      >
        <NewPasswordField
          face={face}
          value={pass}
          onChange={(v) => {
            setTrouble(null);
            setPass(v);
          }}
          invalid={shown}
          hint={newPasswordText(shown ? problem : null)}
          onEnter={() => void save()}
        />
        {trouble === "limited" ? (
          <LinkNote face={face} tone="attention">
            Too many requests, try again later
          </LinkNote>
        ) : trouble === "error" ? (
          <LinkNote face={face} tone="attention">
            Couldn’t save the password — check your connection and try again
          </LinkNote>
        ) : null}
        <LinkButton
          face={face}
          primary
          icon={LuLock}
          onClick={() => void save()}
          disabled={offline || busy}
          data-auth-save-password
        >
          {busy ? "Saving…" : "Save password"}
        </LinkButton>
      </LinkShell>
    );
  }

  return <AuthScope>{body}</AuthScope>;
}
