"use client";

/* The pieces the link screens (set a new password, confirm your email, the
   desktop hand-off) draw: the sign-in's sky and its one frosted card
   (`AuthFrame`, `Field`), at every width. The routes still pass `face` (they
   resolve it for the host); the card is the same on both, so it is only
   written to `data-face`. Same copy tone as sign-in; nothing here decides
   anything, the routes do. */
import * as React from "react";

import type { IconType } from "react-icons";
import { LuCircleAlert, LuCloudOff } from "react-icons/lu";

import type { PhoneUi } from "@/lib/needt3/phone-ui";

import { AuthFrame, Eye, Field } from "./AuthScreen";

export type Face = PhoneUi;

export function LinkShell({
  face,
  screen,
  a,
  b,
  line,
  foot,
  offline,
  offlineText,
  children,
}: React.PropsWithChildren<{
  face: Face;
  /** `data-auth-screen`, e.g. "reset-set". */
  screen: string;
  /** The routes still pass these; the card has no kicker or tile any more. */
  kicker?: string;
  icon?: IconType;
  hue?: string;
  a: string;
  b: string;
  line: string;
  foot?: React.ReactNode;
  offline?: boolean;
  offlineText?: string;
}>) {
  const offlineNote = offline ? (
    <LinkNote face={face} icon={LuCloudOff}>
      {offlineText} Everything here works again once you’re back.
    </LinkNote>
  ) : null;

  return (
    <AuthFrame variant="a" screen={screen} below={offlineNote} foot={foot}>
      <div key={screen} data-face={face} className="auth-signin-col-2 nx-swap">
        <h1 className="ac-title">
          {a} {b}
        </h1>
        <p className="auth-signin-text">{line}</p>
        <div className="auth-signin-col-4">{children}</div>
      </div>
    </AuthFrame>
  );
}

export function LinkButton({
  face,
  primary,
  onClick,
  disabled,
  icon: Icon,
  children,
  ...data
}: React.PropsWithChildren<{
  face: Face;
  primary?: boolean;
  onClick: () => void;
  disabled?: boolean;
  icon?: IconType;
}> &
  Record<`data-${string}`, string | boolean | undefined>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-face={face}
      className={
        primary
          ? "nx-btn nx-btn-primary axs-go auth-signin-btn"
          : "nx-btn nx-btn-secondary axs-go auth-signin-btn"
      }
      {...data}
    >
      {Icon ? <Icon size={14} aria-hidden /> : null}
      {children}
    </button>
  );
}

/** One line on the card: `attention` is announced (role=alert). */
export function LinkNote({
  face,
  tone,
  icon = LuCircleAlert,
  children,
}: React.PropsWithChildren<{
  face: Face;
  tone?: "attention";
  icon?: IconType;
}>) {
  const Icon = icon;
  return tone === "attention" ? (
    <span className="refusal auth-signin-row-3" role="alert" data-face={face}>
      <Icon size={13} />
      {children}
    </span>
  ) : (
    <p
      className="axs-note auth-offline"
      data-px-calm
      role="status"
      data-face={face}
    >
      <Icon size={13} />
      <span>{children}</span>
    </p>
  );
}

/** The line under the card: a lead and one way out. */
export function LinkFoot({
  face,
  lead,
  href,
  children,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  icon: _icon,
  ...data
}: React.PropsWithChildren<{
  face: Face;
  lead: string;
  href: string;
  icon: IconType;
}> &
  Record<`data-${string}`, string | boolean | undefined>) {
  return (
    <p className="axs-switch" data-px-calm data-face={face}>
      {lead}{" "}
      <a className="ax-link auth-signin-text-4" href={href} {...data}>
        {children}
      </a>
    </p>
  );
}

export function NewPasswordField({
  value,
  onChange,
  invalid,
  hint,
  onEnter,
}: {
  face: Face;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  hint: string;
  onEnter: () => void;
}) {
  const [show, setShow] = React.useState(false);
  return (
    <span className="auth-stack-6">
      <Field
        value={value}
        type={show ? "text" : "password"}
        label="New password"
        placeholder="New password"
        autoComplete="new-password"
        autoFocus
        invalid={invalid}
        onEnter={onEnter}
        onChange={onChange}
        trailing={<Eye shown={show} onToggle={() => setShow(!show)} />}
      />
      <span
        className="auth-signin-text-3"
        role={invalid ? "alert" : undefined}
        style={{
          color: invalid ? "var(--destructive)" : "var(--text-tertiary)",
        }}
      >
        {hint}
      </span>
    </span>
  );
}
