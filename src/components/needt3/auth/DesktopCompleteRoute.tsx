"use client";

/* SIGNING YOU IN, the page only the desktop app opens, after a browser
   sign-in handed it a one-time code (needt://auth?code=…). The app loads it as
   /auth/desktop-complete#code=…&verifier=… : a fragment, so neither the
   server, a log nor a Referer ever has it. The page trades the pair for the
   session cookie at the same origin and moves on to Today. */
import * as React from "react";

import { LuArrowRight, LuLoaderCircle, LuRotateCw } from "react-icons/lu";

import { DESKTOP_HANDOFF_HEADER } from "@/lib/auth/desktop-handoff-shape";
import { logger } from "@/lib/logger";
import type { PhoneUi } from "@/lib/needt3/phone-ui";

import { useResolvedPhoneUi } from "../root/phone-ui-context";
import { AuthScope } from "./AuthScope";
import { LinkButton, LinkShell } from "./LinkFaces";
import {
  COMPLETE_COPY,
  type CompleteStep,
  DESKTOP_RESTART_LINK,
  parseCompleteFragment,
} from "./desktop-logic";

const LOG_SOURCE = "needt3-desktop-complete";

export function V3DesktopCompleteRoute({
  initialUi = "desktop",
  uiForced = false,
}: {
  initialUi?: PhoneUi;
  uiForced?: boolean;
}) {
  const face = useResolvedPhoneUi(initialUi, uiForced);
  const [step, setStep] = React.useState<CompleteStep>("working");
  // The fragment is read and wiped once; a second effect pass (StrictMode)
  // finds the same pair here instead of an empty address.
  const started = React.useRef<null | { code: string; verifier: string }>(null);

  React.useEffect(() => {
    if (started.current) return;
    const pair = parseCompleteFragment(window.location.hash);
    if (!pair) {
      setStep("invalid");
      return;
    }
    started.current = pair;
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname
    );
    void (async () => {
      try {
        const response = await fetch("/api/auth/desktop/exchange", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [DESKTOP_HANDOFF_HEADER]: "1",
          },
          cache: "no-store",
          credentials: "same-origin",
          body: JSON.stringify(pair),
        });
        if (!response.ok) {
          setStep("failed");
          return;
        }
        // Always Today: no destination from outside is ever followed here.
        window.location.replace("/today");
      } catch (error) {
        void logger.error(
          "Desktop sign-in exchange failed",
          { error: error instanceof Error ? error.message : String(error) },
          LOG_SOURCE
        );
        setStep("failed");
      }
    })();
  }, []);

  const copy = COMPLETE_COPY[step];
  const actions =
    step === "failed" ? (
      <LinkButton
        face={face}
        primary
        icon={LuRotateCw}
        onClick={() => window.location.assign(DESKTOP_RESTART_LINK)}
        data-auth-desktop-restart
      >
        Start again
      </LinkButton>
    ) : null;

  return (
    <AuthScope>
      <LinkShell
        face={face}
        screen={"desktop-complete-" + step}
        kicker="Desktop app"
        icon={step === "working" ? LuLoaderCircle : LuArrowRight}
        hue="var(--info)"
        a={copy.a}
        b={copy.b}
        line={copy.line}
      >
        {actions}
      </LinkShell>
    </AuthScope>
  );
}
