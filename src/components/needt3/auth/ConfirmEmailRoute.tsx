"use client";

/* CONFIRM YOUR EMAIL, the page the confirmation mail's link opens
   (/auth/confirm-email?email=…&token=…), on the v3 screens. No prototype
   exists; it is the sign-in's card and copy tone. The calls are the existing
   ones: POST /api/auth/email-verification/confirm, and for a dead link
   POST /api/auth/email-verification/request (rate limited, same answer
   whether or not the address has an account).

   The token is spent on a press, never on load: a mail scanner opening the
   link must not confirm the address for the person. */
import * as React from "react";

import {
  LuArrowLeft,
  LuArrowRight,
  LuCircleCheck,
  LuMail,
  LuRefreshCw,
} from "react-icons/lu";

import { logger } from "@/lib/logger";
import type { PhoneUi } from "@/lib/needt3/phone-ui";
import { useOnline } from "@/lib/needt3/use-online";

import { useResolvedPhoneUi } from "../root/phone-ui-context";
import { AuthScope } from "./AuthScope";
import { LinkButton, LinkFoot, LinkNote, LinkShell } from "./LinkFaces";
import {
  CONFIRMED_NEXT,
  CONFIRM_COPY,
  type ConfirmStep,
  type ResendOutcome,
  confirmOutcome,
  resendOutcome,
} from "./link-logic";

const LOG_SOURCE = "needt3-confirm-email";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function V3ConfirmEmailRoute({
  email,
  token,
  initialUi = "desktop",
  uiForced = false,
}: {
  email: string;
  token: string;
  initialUi?: PhoneUi;
  uiForced?: boolean;
}) {
  const face = useResolvedPhoneUi(initialUi, uiForced);
  const online = useOnline();
  const offline = !online;
  /* A link without both halves cannot be confirmed: say so at once. */
  const [step, setStep] = React.useState<ConfirmStep>(
    email && token ? "ready" : "invalid"
  );
  const [resend, setResend] = React.useState<null | "sending" | ResendOutcome>(
    null
  );

  async function confirm() {
    if (offline || step === "confirming") return;
    setStep("confirming");
    try {
      const response = await fetch("/api/auth/email-verification/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        status?: unknown;
      };
      setStep(confirmOutcome(response.ok, body.status));
    } catch (e) {
      void logger.error(
        "Email confirmation failed",
        { error: message(e) },
        LOG_SOURCE
      );
      setStep("error");
    }
  }

  async function sendNew() {
    if (offline || resend === "sending" || !email) return;
    setResend("sending");
    try {
      const response = await fetch("/api/auth/email-verification/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setResend(resendOutcome(response.status));
    } catch (e) {
      void logger.error(
        "Email confirmation resend failed",
        { error: message(e) },
        LOG_SOURCE
      );
      setResend("error");
    }
  }

  const copy = CONFIRM_COPY[step];
  const dead = step === "expired" || step === "invalid";
  const shown = email || "your address";

  const back = (
    <LinkFoot
      face={face}
      lead="Not now?"
      href="/auth/signin"
      icon={LuArrowLeft}
      data-auth-back-signin
    >
      Back to sign in
    </LinkFoot>
  );

  let actions: React.ReactNode;
  if (step === "confirmed") {
    actions = (
      <LinkButton
        face={face}
        primary
        icon={LuArrowRight}
        onClick={() => window.location.assign(CONFIRMED_NEXT)}
        data-auth-continue
      >
        Continue to Needt
      </LinkButton>
    );
  } else if (dead) {
    actions = email ? (
      <>
        {resend === "sent" ? (
          <LinkNote face={face} icon={LuMail}>
            {`If ${email} still needs confirming, a new link is on its way.`}
          </LinkNote>
        ) : resend === "limited" ? (
          <LinkNote face={face} tone="attention">
            Too many requests, try again later
          </LinkNote>
        ) : resend === "error" ? (
          <LinkNote face={face} tone="attention">
            Couldn’t send a new link — try again
          </LinkNote>
        ) : null}
        <LinkButton
          face={face}
          primary={resend !== "sent"}
          icon={LuRefreshCw}
          onClick={() => void sendNew()}
          disabled={offline || resend === "sending" || resend === "sent"}
          data-auth-resend-confirm
        >
          {resend === "sending" ? "Sending…" : "Send a new link"}
        </LinkButton>
      </>
    ) : null;
  } else {
    actions = (
      <>
        {step === "error" ? (
          <LinkNote face={face} tone="attention">
            Couldn’t confirm your email
          </LinkNote>
        ) : null}
        <LinkButton
          face={face}
          primary
          icon={LuCircleCheck}
          onClick={() => void confirm()}
          disabled={offline || step === "confirming"}
          data-auth-confirm
        >
          {step === "confirming" ? "Confirming…" : "Confirm email"}
        </LinkButton>
      </>
    );
  }

  return (
    <AuthScope>
      <LinkShell
        face={face}
        screen={"confirm-" + step}
        kicker="Confirm email"
        icon={step === "confirmed" ? LuCircleCheck : LuMail}
        hue={step === "confirmed" ? "var(--success)" : "var(--info)"}
        a={copy.a}
        b={copy.b}
        line={copy.line(shown)}
        foot={step === "confirmed" ? null : back}
        offline={offline && step !== "confirmed"}
        offlineText="You’re offline — confirming needs a connection."
      >
        {actions}
      </LinkShell>
    </AuthScope>
  );
}
