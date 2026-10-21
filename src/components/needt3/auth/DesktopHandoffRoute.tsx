"use client";

/* OPEN NEEDT, the page the desktop app's "Sign in" opens in the system browser
   (/auth/desktop?challenge=…). Reached signed in (the middleware sends a
   stranger through sign-in first, Google and all). Nothing is handed over on
   load: a press asks the server for a one-time code bound to this account and
   the app's challenge, and the code goes to the app as needt://auth?code=…
   The code never appears in a page address. */
import * as React from "react";

import { LuArrowRight, LuCircleAlert, LuRotateCw } from "react-icons/lu";

import { DESKTOP_HANDOFF_HEADER } from "@/lib/auth/desktop-handoff-shape";
import { logger } from "@/lib/logger";
import type { PhoneUi } from "@/lib/needt3/phone-ui";
import { useOnline } from "@/lib/needt3/use-online";

import { useResolvedPhoneUi } from "../root/phone-ui-context";
import { AuthScope } from "./AuthScope";
import { LinkButton, LinkNote, LinkShell } from "./LinkFaces";
import {
  HANDOFF_COPY,
  type HandoffStep,
  desktopDeepLink,
  validChallenge,
} from "./desktop-logic";

const LOG_SOURCE = "needt3-desktop-handoff";

export function V3DesktopHandoffRoute({
  email,
  challenge,
  initialUi = "desktop",
  uiForced = false,
}: {
  email: string;
  challenge: string;
  initialUi?: PhoneUi;
  uiForced?: boolean;
}) {
  const face = useResolvedPhoneUi(initialUi, uiForced);
  const online = useOnline();
  const offline = !online;
  const [step, setStep] = React.useState<HandoffStep>(
    validChallenge(challenge) ? "ready" : "invalid"
  );

  async function open() {
    if (offline || step === "working") return;
    setStep("working");
    try {
      const response = await fetch("/api/auth/desktop/code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [DESKTOP_HANDOFF_HEADER]: "1",
        },
        cache: "no-store",
        body: JSON.stringify({ challenge }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        code?: unknown;
      };
      const link =
        response.ok && typeof body.code === "string"
          ? desktopDeepLink(body.code)
          : null;
      if (!link) {
        setStep("error");
        return;
      }
      setStep("sent");
      window.location.assign(link);
    } catch (error) {
      void logger.error(
        "Desktop sign-in handoff failed",
        { error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
      setStep("error");
    }
  }

  const copy = HANDOFF_COPY[step];

  let actions: React.ReactNode = null;
  if (step === "ready" || step === "working") {
    actions = (
      <LinkButton
        face={face}
        primary
        icon={LuArrowRight}
        onClick={() => void open()}
        disabled={offline || step === "working"}
        data-auth-desktop-open
      >
        {step === "working" ? "Opening…" : "Open Needt"}
      </LinkButton>
    );
  } else if (step === "sent" || step === "error") {
    actions = (
      <>
        {step === "error" ? (
          <LinkNote face={face} tone="attention" icon={LuCircleAlert}>
            Couldn’t hand sign-in to the app
          </LinkNote>
        ) : null}
        <LinkButton
          face={face}
          primary={step === "error"}
          icon={LuRotateCw}
          onClick={() => void open()}
          disabled={offline}
          data-auth-desktop-retry
        >
          {step === "error" ? "Try again" : "Open again"}
        </LinkButton>
      </>
    );
  }

  return (
    <AuthScope>
      <LinkShell
        face={face}
        screen={"desktop-" + step}
        kicker="Desktop app"
        icon={LuArrowRight}
        hue="var(--info)"
        a={copy.a}
        b={copy.b}
        line={copy.line(email || "your account")}
        offline={offline}
        offlineText="You’re offline — opening the app needs a connection."
      >
        {actions}
      </LinkShell>
    </AuthScope>
  );
}
