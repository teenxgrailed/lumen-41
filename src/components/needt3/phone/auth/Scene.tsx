"use client";

/* The pieces sign-in and setup share on a phone (prototype MobileAuth.jsx:
   MaField, MaInput, MaButton, MaNote, MaTile, PwMaScene, PwMaPaper, MaBrand,
   MaHead). They are the only phone screens that keep the pixel sky: it fills
   the screen, the content scrolls under a progressive blur band at the status
   bar, and the form sits on a glass plate whose blur grows toward its edges.
   The styles are vendored (styles/mobile-onboarding.css, `mau-*`). */
import * as React from "react";

import type { IconType } from "react-icons";

import { PwDateCard, PxSky } from "../../scenes";
import { NeedtLockup } from "../../wordmark";
import { PkGlyph, PkHueTile, pkCx } from "../kit";

/** A glyph tile: a place or a type from the kit, else an icon on a hue. */
export function MaTile({
  place,
  kind,
  icon: Icon,
  hue,
  size = 40,
}: {
  place?: string;
  kind?: string;
  icon?: IconType;
  hue?: string;
  size?: number;
}) {
  if (place || kind) return <PkGlyph place={place} kind={kind} size={size} />;
  return (
    <PkHueTile
      size={size}
      hue={hue}
      icon={Icon ? <Icon size={Math.round(size * 0.45)} /> : null}
    />
  );
}

/** The id of the hint under a field, so its input can name it. */
const HintId = React.createContext<string | undefined>(undefined);

export function MaField({
  label,
  hint,
  error,
  children,
}: React.PropsWithChildren<{
  label: string;
  hint?: string | null;
  error?: boolean;
}>) {
  const hintId = React.useId();
  return (
    <label className={pkCx("mau-field", error && "is-error")}>
      <span className="mau-field-label">{label}</span>
      <HintId.Provider value={hint ? hintId : undefined}>
        {children}
      </HintId.Provider>
      {hint ? (
        <span
          id={hintId}
          className="mau-field-hint"
          role={error ? "alert" : undefined}
        >
          {hint}
        </span>
      ) : null}
    </label>
  );
}

/** A field on the glass: a soft raised fill, a lavender ring on focus. */
export const MaInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
    onChange: (value: string) => void;
    invalid?: boolean;
    icon?: IconType;
    label: string;
  }
>(function MaInput(
  { onChange, invalid, icon: Icon, label, className, ...rest },
  ref
) {
  const hintId = React.useContext(HintId);
  const input = (
    <input
      {...rest}
      ref={ref}
      aria-describedby={rest["aria-describedby"] ?? hintId}
      aria-label={label}
      aria-invalid={invalid || undefined}
      className={pkCx("mau-input", Icon && "has-icon", className)}
      onChange={(e) => onChange(e.target.value)}
    />
  );
  if (!Icon) return input;
  return (
    <span className="mau-input-wrap">
      {input}
      {Icon ? (
        <span className="mau-input-icon" aria-hidden="true">
          <Icon size={17} />
        </span>
      ) : null}
    </span>
  );
});

/** Plates buttons, 52px: the step's one primary is ink on the glass. */
export function MaButton({
  children,
  primary,
  onClick,
  disabled,
  auto,
  ...rest
}: React.PropsWithChildren<{
  primary?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  auto?: boolean;
}> &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "disabled">) {
  return (
    <button
      type="button"
      {...rest}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={pkCx(
        "mau-btn",
        primary ? "is-primary" : "is-quiet",
        auto && "is-auto"
      )}
    >
      {children}
    </button>
  );
}

export function MaNote({
  tone,
  icon: Icon,
  children,
}: React.PropsWithChildren<{ tone?: "attention"; icon: IconType }>) {
  return (
    <span
      className={pkCx(
        "ma-note",
        "mau-note",
        tone === "attention" && "is-attention"
      )}
      role={tone === "attention" ? "alert" : "status"}
    >
      <Icon size={15} aria-hidden />
      <span>{children}</span>
    </span>
  );
}

/** The sky, the status-bar band and the column on top of them. */
export function MaScene({
  variant,
  parked,
  children,
}: React.PropsWithChildren<{
  variant: "a" | "b" | "c" | "d";
  /** No sky frames while something is being dragged. */
  parked?: boolean;
}>) {
  return (
    <div
      className="mau-scene"
      data-mau-scene={variant}
      style={{ position: "fixed", inset: 0, zIndex: 950 }}
    >
      <PxSky variant={variant} fps={15} parked={parked}>
        <div className="mau-stage">
          {children}
          <div className="mau-band" aria-hidden="true">
            <span className="mau-band-blur is-1" />
            <span className="mau-band-blur is-2" />
            <span className="mau-band-blur is-3" />
          </div>
        </div>
      </PxSky>
    </div>
  );
}

/** The glass plate: a wash over three backdrop blurs, each masked further out. */
export function MaPaper({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div className={pkCx("mau-glass", className)}>
      <span className="mau-glass-blur is-1" aria-hidden="true" />
      <span className="mau-glass-blur is-2" aria-hidden="true" />
      <span className="mau-glass-blur is-3" aria-hidden="true" />
      <span className="mau-glass-wash" aria-hidden="true" />
      <div className="mau-glass-in">{children}</div>
    </div>
  );
}

/** The mark, small; the date print on the right when asked. */
export function MaBrand({ date }: { date?: boolean }) {
  return (
    <div className="mau-brand">
      <NeedtLockup small mode="still" />
      {date ? (
        <span aria-hidden="true" className="mau-date">
          <PwDateCard width={60} event={false} />
        </span>
      ) : null}
    </div>
  );
}

/** The big tight title, its second half quiet. */
export function MaHead({
  kicker,
  a,
  b,
  line,
  className,
  tile,
}: {
  kicker?: string;
  a: string;
  b?: string;
  line?: string;
  className?: string;
  tile?: React.ReactNode;
}) {
  return (
    <header className={pkCx("mau-head", className)} data-px-calm>
      {kicker ? (
        <span className="mau-kicker">
          {tile}
          {kicker}
        </span>
      ) : null}
      <h1 className="mau-title">
        {a}
        {b ? (
          <>
            {" "}
            <span className="mau-title-2">{b}</span>
          </>
        ) : null}
      </h1>
      {line ? <p className="mau-line">{line}</p> : null}
    </header>
  );
}
