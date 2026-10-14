"use client";

/* The pieces the two link screens (set a new password, confirm your email)
   draw on each face. Desktop: the sign-in's sky, collage and frosted card
   (`AuthFrame`, `Field`). Phone: the sign-in's pixel sky and glass plate
   (`MaScene`, `MaPaper`, `MaField`). Same copy tone as sign-in; nothing here
   decides anything, the routes do. */
import * as React from "react";

import type { IconType } from "react-icons";
import { LuCircleAlert, LuCloudOff, LuLock } from "react-icons/lu";

import type { PhoneUi } from "@/lib/needt3/phone-ui";

import {
  MaBrand,
  MaButton,
  MaField,
  MaHead,
  MaInput,
  MaNote,
  MaPaper,
  MaScene,
  MaTile,
} from "../phone/auth/Scene";
import { AuthFrame, Eye, Field } from "./AuthScreen";

export type Face = PhoneUi;

export function LinkShell({
  face,
  screen,
  kicker,
  icon,
  hue,
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
  kicker: string;
  icon: IconType;
  hue: string;
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

  if (face === "phone") {
    return (
      <MaScene variant="a">
        <div className="mau-scroll" data-auth-screen={screen}>
          <MaBrand />
          <MaHead
            kicker={kicker}
            tile={<MaTile icon={icon} hue={hue} size={32} />}
            a={a}
            b={b}
            line={line}
          />
          <MaPaper>
            <div key={screen} className="mau-form nx-swap">
              {offlineNote}
              {children}
            </div>
          </MaPaper>
          {foot}
        </div>
      </MaScene>
    );
  }

  return (
    <AuthFrame variant="a" screen={screen} below={offlineNote} foot={foot}>
      <div key={screen} className="auth-signin-col-2 nx-swap">
        <span className="px-kicker auth-signin-el">{kicker}</span>
        <h1 className="px-display">
          {a} <em>{b}</em>
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
  if (face === "phone") {
    return (
      <MaButton
        primary={primary}
        onClick={onClick}
        disabled={disabled}
        {...data}
      >
        {Icon ? <Icon size={16} aria-hidden /> : null}
        {children}
      </MaButton>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        primary
          ? "nx-btn nx-btn-primary axs-go auth-signin-btn"
          : "nx-btn nx-btn-secondary axs-go auth-signin-btn"
      }
      {...data}
    >
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
  if (face === "phone") {
    return (
      <MaNote tone={tone} icon={icon}>
        {children}
      </MaNote>
    );
  }
  const Icon = icon;
  return tone === "attention" ? (
    <span className="refusal auth-signin-row-3" role="alert">
      <Icon size={13} />
      {children}
    </span>
  ) : (
    <p className="axs-note auth-offline" data-px-calm role="status">
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
  icon: Icon,
  children,
  ...data
}: React.PropsWithChildren<{
  face: Face;
  lead: string;
  href: string;
  icon: IconType;
}> &
  Record<`data-${string}`, string | boolean | undefined>) {
  if (face === "phone") {
    return (
      <a
        href={href}
        className="mau-chip"
        style={{ textDecoration: "none" }}
        data-px-calm
        {...data}
      >
        <Icon size={15} aria-hidden />
        {lead} <u>{children}</u>
      </a>
    );
  }
  return (
    <p className="axs-switch" data-px-calm>
      {lead}{" "}
      <a className="ax-link auth-signin-text-4" href={href} {...data}>
        {children}
      </a>
    </p>
  );
}

export function NewPasswordField({
  face,
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
  if (face === "phone") {
    return (
      <form
        style={{ display: "contents" }}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onEnter();
        }}
      >
        <MaField label="New password" error={invalid} hint={hint}>
          <MaInput
            label="New password"
            type="password"
            value={value}
            onChange={onChange}
            placeholder="New password"
            icon={LuLock}
            autoComplete="new-password"
            enterKeyHint="done"
            invalid={invalid}
          />
        </MaField>
      </form>
    );
  }
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
