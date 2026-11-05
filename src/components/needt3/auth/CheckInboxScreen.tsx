"use client";

/* CHECK YOUR INBOX, the screen a signed-up person sees until they open the
   confirmation link. It wears the sign-in's sky and card (`LinkShell`), like
   the confirm-email page the link opens, instead of the old dark card with an
   accent-filled button. Nothing here decides anything: the gate polls the
   status and sends the mail; this only draws it. */
import * as React from "react";

import {
  LuArrowLeft,
  LuExternalLink,
  LuMail,
  LuRefreshCw,
} from "react-icons/lu";

import type { PhoneUi } from "@/lib/needt3/phone-ui";
import { useOnline } from "@/lib/needt3/use-online";

import { useResolvedPhoneUi } from "../root/phone-ui-context";
import { AuthScope } from "./AuthScope";
import { type Face, LinkButton, LinkShell } from "./LinkFaces";

export function CheckInboxScreen({
  email,
  links,
  sending,
  cooldown,
  onResend,
  onUseAnother,
  initialUi = "desktop",
  uiForced = false,
}: {
  email: string | null;
  links: { label: string; href: string }[];
  sending: boolean;
  cooldown: number;
  onResend: () => void;
  onUseAnother: () => void;
  initialUi?: PhoneUi;
  uiForced?: boolean;
}) {
  const face = useResolvedPhoneUi(initialUi, uiForced);
  const offline = !useOnline();
  const shown = email ?? "your email";

  return (
    <AuthScope>
      <LinkShell
        face={face}
        screen="check-inbox"
        kicker="Confirm email"
        icon={LuMail}
        hue="var(--info)"
        a="Check your"
        b="inbox"
        line={`We sent a link to ${shown}. Open it to start 14 days of Pro. This page moves on by itself.`}
        foot={<UseAnother face={face} onClick={onUseAnother} />}
        offline={offline}
        offlineText="You’re offline — the link still works once you’re back."
      >
        {links.map((link) => (
          <LinkButton
            key={link.href}
            face={face}
            primary
            icon={LuExternalLink}
            onClick={() =>
              window.open(link.href, "_blank", "noopener,noreferrer")
            }
            data-auth-open-inbox={link.label}
          >
            {link.label}
          </LinkButton>
        ))}
        <LinkButton
          face={face}
          primary={links.length === 0}
          icon={LuRefreshCw}
          onClick={onResend}
          disabled={offline || sending || cooldown > 0}
          data-auth-resend-confirm
        >
          {sending
            ? "Sending…"
            : cooldown > 0
              ? `Send again in ${cooldown}s`
              : "Send again"}
        </LinkButton>
      </LinkShell>
    </AuthScope>
  );
}

/** `LinkFoot`'s look, as a button: leaving signs out first. */
function UseAnother({ face, onClick }: { face: Face; onClick: () => void }) {
  if (face === "phone") {
    return (
      <button
        type="button"
        className="mau-chip"
        onClick={onClick}
        data-px-calm
        data-auth-use-another
      >
        <LuArrowLeft size={15} aria-hidden />
        Wrong address? <u>Use another email</u>
      </button>
    );
  }
  return (
    <p className="axs-switch" data-px-calm>
      Wrong address?{" "}
      <button
        type="button"
        className="ax-link auth-signin-text-4"
        onClick={onClick}
        data-auth-use-another
      >
        Use another email
      </button>
    </p>
  );
}
