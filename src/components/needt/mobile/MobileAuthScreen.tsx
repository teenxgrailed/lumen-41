"use client";

/* SIGN IN — the persuasion at the top, the form underneath.
 *
 * Ported from `MobileAuth.jsx`'s `MbAuth`. The desktop's `AuthScreen`
 * (`../auth`) pairs the form with `LivePlate` — a running day, in the pane a
 * 1440px window can spare. A phone cannot spare it: the plate would take the
 * half of the screen the keyboard is about to take, so the persuasion moves
 * to one line under the mark and the rest of the screen is the form itself.
 * That is the one place this shell drops something the desktop always shows
 * rather than relocating it — see this port's own report.
 *
 * The two logins that need no typing come first: on a phone a password is
 * the most expensive thing on the screen.
 */
import * as React from "react";

import { LuApple, LuChrome } from "react-icons/lu";

import { ExposureWordmark as Wordmark } from "@/components/needt/wordmark";

import { BRAND_LINE } from "@/lib/brand";

import { Glyph } from "../shell/chrome";
import { AUTH_BUTTON_HEIGHT } from "./mobile-logic";

export type MobileAuthMode = "login" | "signup";

export interface MobileAuthScreenProps {
  mode: MobileAuthMode;
  onMode: (mode: MobileAuthMode) => void;
  onDone: () => void;
}

function MobileAuthField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          font: "var(--type-meta-medium)",
          color: "var(--text-secondary)",
        }}
      >
        {label}
      </span>
      {children}
      {hint ? (
        <span
          style={{ font: "var(--type-meta)", color: "var(--text-quaternary)" }}
        >
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function MobileAuthButton({
  onClick,
  accent,
  children,
}: {
  onClick: () => void;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        width: "100%",
        minHeight: AUTH_BUTTON_HEIGHT,
        padding: "0 16px",
        border: 0,
        cursor: "default",
        borderRadius: "var(--radius-xl)",
        font: "var(--type-ui-medium)",
        background: accent ? "var(--fill-accent)" : "var(--surface-raised)",
        color: accent ? "var(--accent)" : "var(--text-primary)",
        boxShadow: accent ? "none" : "var(--shadow-raised)",
      }}
    >
      {children}
    </button>
  );
}

export function MobileAuthScreen({
  mode,
  onMode,
  onDone,
}: MobileAuthScreenProps) {
  const signup = mode === "signup";
  const [mail, setMail] = React.useState("");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        padding: "8px 20px 20px",
        gap: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          flex: "none",
          paddingBottom: 4,
        }}
      >
        <Wordmark size={40} />
        <span
          style={{
            font: "var(--type-body)",
            color: "var(--text-tertiary)",
            textWrap: "pretty",
          }}
        >
          {signup ? BRAND_LINE : "Welcome back."}
        </span>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          overflow: "auto",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <MobileAuthButton onClick={onDone}>
            <Glyph of={LuChrome} size={16} />
            Continue with Google
          </MobileAuthButton>
          <MobileAuthButton onClick={onDone}>
            <Glyph of={LuApple} size={16} />
            Continue with Apple
          </MobileAuthButton>
        </div>

        <span style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span
            aria-hidden="true"
            style={{ flex: 1, borderTop: "1px solid var(--border)" }}
          />
          <span
            style={{
              font: "var(--type-meta)",
              color: "var(--text-quaternary)",
            }}
          >
            or
          </span>
          <span
            aria-hidden="true"
            style={{ flex: 1, borderTop: "1px solid var(--border)" }}
          />
        </span>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <MobileAuthField label="Email">
            <input
              className="nt-input"
              type="email"
              value={mail}
              onChange={(event) => setMail(event.target.value)}
              placeholder="you@needt.app"
              style={{ minHeight: 48 }}
            />
          </MobileAuthField>
          <MobileAuthField
            label="Password"
            hint={signup ? "Eight characters or more." : undefined}
          >
            <input
              className="nt-input"
              type="password"
              placeholder="••••••••"
              style={{ minHeight: 48 }}
            />
          </MobileAuthField>
          <MobileAuthButton accent onClick={onDone}>
            {signup ? "Create the account" : "Sign in"}
          </MobileAuthButton>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onMode(signup ? "login" : "signup")}
        style={{
          flex: "none",
          minHeight: 44,
          border: 0,
          cursor: "default",
          background: "transparent",
          font: "var(--type-ui)",
          color: "var(--text-muted)",
        }}
      >
        {signup
          ? "Already have an account? Sign in"
          : "No account yet? Create one"}
      </button>
    </div>
  );
}
