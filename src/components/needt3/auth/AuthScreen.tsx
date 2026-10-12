"use client";

/* SIGN IN / SIGN UP / PASSWORD RECOVERY (prototype AuthScreen.jsx).
 *
 * The form is a frosted glass card on the printed sky, with a few glass cards
 * of the product around it. This component is the design and the form logic;
 * what a submit DOES (NextAuth, the register endpoint, the reset mail) is the
 * host's: `onSubmit`, `onRecover`, `onProvider` are callbacks. Nothing here
 * invents a credential or a success.
 *
 * Recovery: the address is asked for, the server always answers the same (no
 * account enumeration), and the link in the mail opens the existing
 * /auth/reset-password page. The prototype's in-app "Open the link" stand-in
 * and its New-password step are not ported: the real link does that part.
 */
import * as React from "react";

import type { IconType } from "react-icons";
import {
  LuCircleAlert,
  LuCloudOff,
  LuEye,
  LuEyeOff,
  LuRefreshCw,
} from "react-icons/lu";

import { useOnline } from "@/lib/needt3/use-online";

import {
  GlassCard,
  PwDateCard,
  PwMiniEvent,
  PwMiniHabit,
  PwMiniTask,
  PwMoodPrint,
  PxSky,
} from "../scenes";
import { NeedtLockup } from "../wordmark";
import {
  type AuthMode,
  WAITLIST,
  mailProblem,
  mailProblemText,
  passwordShort,
  refusalText,
  resendClock,
  showWaitlist,
  submitLabel,
  submitStep,
} from "./auth-logic";
import {
  type AuthFields,
  type AuthSteps,
  useAuthFields,
  useAuthSteps,
} from "./use-auth-fields";

export type { AuthMode } from "./auth-logic";

export type AuthRefusalReason = "taken" | "wrong";

export interface AuthResult {
  readonly ok: boolean;
  readonly reason?: AuthRefusalReason;
  /** The server's own words, when they say it better than the canned lines. */
  readonly message?: string;
  /** The server did not answer: show "Couldn't sign in" with a Retry. */
  readonly network?: boolean;
}

export interface AuthProvider {
  readonly id: string;
  readonly label: string;
  readonly icon: IconType;
}

export interface AuthScreenProps {
  mode: AuthMode;
  onMode: (mode: AuthMode) => void;
  /** Called once the pair is accepted. */
  onDone: () => void;
  onSubmit: (input: {
    mode: AuthMode;
    email: string;
    password: string;
  }) => Promise<AuthResult>;
  /** Third-party logins the host actually has configured. */
  providers?: readonly AuthProvider[];
  providerBusy?: string | null;
  onProvider?: (id: string) => void;
  /** "Send me a reset link". Resolves true when the request went through,
      "limited" when the server refused it for too many tries (429). */
  onRecover?: (email: string) => Promise<boolean | "limited">;
  /** A message the page was opened with (an OAuth error). */
  notice?: string | null;
  /** Whether "Create one" is offered at all. */
  allowSignup?: boolean;
  /** Sign-up answered "closed" (not: still unknown): show the waitlist line. */
  signupClosed?: boolean;
  /** One quiet line under the password (resend confirmation). */
  aside?: React.ReactNode;
  /** Where Terms and Privacy go. */
  termsHref?: string;
  privacyHref?: string;
  seed?: { mail?: string };
  /** The host owns the two fields (so a face swap keeps what was typed). */
  fields?: AuthFields;
  /** The host owns the flow's steps too (recovery, refusal, ...). */
  steps?: AuthSteps;
}

function Eye({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="auth-eye"
      aria-label={shown ? "Hide password" : "Show password"}
      aria-pressed={shown}
      onClick={onToggle}
    >
      {shown ? <LuEyeOff size={14} /> : <LuEye size={14} />}
    </button>
  );
}

function Field({
  value,
  onChange,
  placeholder,
  type,
  invalid,
  autoFocus,
  onEnter,
  trailing,
  label,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  invalid?: boolean;
  autoFocus?: boolean;
  onEnter?: () => void;
  trailing?: React.ReactNode;
  label?: string;
  autoComplete?: string;
}) {
  const [focus, setFocus] = React.useState(false);
  return (
    <span className="auth-field-row">
      <input
        value={value}
        type={type || "text"}
        placeholder={placeholder}
        aria-label={label || placeholder}
        aria-invalid={invalid || undefined}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) onEnter();
        }}
        className="auth-field-input"
        style={{
          padding: trailing ? "0 40px 0 14px" : "0 14px",
          boxShadow: invalid
            ? "var(--shadow-focus-destructive), var(--shadow-ring)"
            : focus
              ? "var(--shadow-focus)"
              : "var(--shadow-ring)",
        }}
      />
      {trailing ? <span className="auth-field-abs">{trailing}</span> : null}
    </span>
  );
}

function Print({
  at,
  caption,
  width,
  delay,
  children,
}: React.PropsWithChildren<{
  at: React.CSSProperties;
  caption: string;
  width: number;
  delay?: number;
}>) {
  return (
    <span
      className="nx-swap"
      style={{
        position: "absolute",
        animationDelay: (delay || 0) + "ms",
        ...at,
      }}
    >
      <GlassCard caption={caption} width={width} pad={10} radius={20}>
        <span className="auth-stack-6">{children}</span>
      </GlassCard>
    </span>
  );
}

/** A few glass cards of the product, placed around the form. */
function Collage() {
  return (
    <div className="axs-collage" aria-hidden="true">
      <Print
        at={{ left: "calc(50% - 560px)", top: "15%" }}
        caption="Today · 3 left"
        width={250}
        delay={80}
      >
        <PwMiniTask title="Reply to Tom" chip="Mailbox" />
        <PwMiniTask title="Charge the flash" done />
        <PwMiniTask title="List the boots on Ricardo" chip="Resale" />
      </Print>
      <Print
        at={{ left: "calc(50% - 520px)", top: "58%" }}
        caption="Habit · day 6"
        width={262}
        delay={160}
      >
        <PwMiniHabit title="Shoot one roll" streak="6 days" />
      </Print>
      <span
        className="nx-swap auth-ax-collage-abs"
        style={{ animationDelay: "120ms" }}
      >
        <PwDateCard width={118} />
      </span>
      <Print
        at={{ left: "calc(50% + 296px)", top: "45%" }}
        caption="Calendar · Tue"
        width={236}
        delay={200}
      >
        <PwMiniEvent time="09:30" title="Standup" hue="var(--hue-blue)" />
        <PwMiniEvent time="14:00" title="Shoot · Kreis 4" />
      </Print>
      <span
        className="nx-swap auth-ax-collage-abs-2"
        style={{ animationDelay: "260ms" }}
      >
        <PwMoodPrint width={140} height={88} />
      </span>
    </div>
  );
}

export function AuthScreen({
  mode,
  onMode,
  onDone,
  onSubmit,
  providers = [],
  providerBusy = null,
  onProvider,
  onRecover,
  notice,
  allowSignup = true,
  signupClosed = false,
  aside,
  termsHref = "/terms",
  privacyHref = "/privacy",
  seed,
  fields,
  steps,
}: AuthScreenProps) {
  const signup = mode !== "login";
  const online = useOnline();
  const { mail, pass, setMail, setPass } = useAuthFields(fields, seed);
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  /* Craft asks for the address first; the password arrives under it once the
     address is in. These steps may live in the host (see `steps`). */
  const {
    refused,
    setRefused,
    touched,
    setTouched,
    withPass: passAsked,
    setWithPass,
    recover,
    setRecover,
  } = useAuthSteps(steps);
  /* A password typed on the other face is already there. */
  const withPass = passAsked || pass.length > 0;
  const [netErr, setNetErr] = React.useState(false);
  const [retrying, setRetrying] = React.useState(false);
  const [limited, setLimited] = React.useState(false);
  const [resendIn, setResendIn] = React.useState(0);
  const lastTry = React.useRef<(() => Promise<void>) | null>(null);

  const short = passwordShort(pass);
  const mProblem = mailProblem({ mail, touched });
  const mText = mailProblemText(mProblem);
  const offline = !online;

  React.useEffect(() => {
    if (recover !== "sent" || resendIn <= 0) return undefined;
    const id = window.setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => window.clearTimeout(id);
  }, [recover, resendIn]);

  async function run(fn: () => Promise<void>) {
    lastTry.current = fn;
    setNetErr(false);
    await fn();
  }

  async function send() {
    setBusy(true);
    const result = await onSubmit({
      mode,
      email: mail.trim(),
      password: pass,
    }).catch((): AuthResult => ({ ok: false, network: true }));
    setBusy(false);
    if (result.network) {
      setNetErr(true);
      return;
    }
    if (result.ok) {
      onDone();
      return;
    }
    setRefused({
      reason: result.reason ?? null,
      message: result.message ?? null,
    });
  }

  function submit() {
    if (busy || offline) return;
    setTouched(true);
    const step = submitStep({ mail, pass, withPass });
    if (step === "ask-mail") return;
    if (!withPass) {
      setWithPass(true);
      return;
    }
    if (step === "ask-password") return;
    void run(send);
  }

  async function sendLink() {
    if (busy || offline || !onRecover) return;
    setTouched(true);
    if (mailProblem({ mail, touched: true })) return;
    const go = async () => {
      setBusy(true);
      setLimited(false);
      const ok = await onRecover(mail.trim()).catch(() => false);
      setBusy(false);
      if (ok === "limited") {
        setLimited(true);
        return;
      }
      if (!ok) {
        setNetErr(true);
        return;
      }
      setResendIn(30);
      setRecover("sent");
    };
    await run(go);
  }

  async function retry() {
    if (retrying || offline) return;
    setRetrying(true);
    // A short beat so the button visibly works before the same request goes again.
    await new Promise((r) => window.setTimeout(r, 600));
    setRetrying(false);
    setNetErr(false);
    if (lastTry.current) await lastTry.current();
  }

  function openRecover() {
    setLimited(false);
    setRefused(null);
    setNetErr(false);
    setPass("");
    setTouched(false);
    setRecover("ask");
  }
  function closeRecover() {
    setLimited(false);
    setNetErr(false);
    setRecover(null);
    setWithPass(false);
  }

  const refusal = refusalText(refused?.reason ?? null, refused?.message);
  const netLine = recover
    ? "Couldn’t send the link — check your connection"
    : signup
      ? "Couldn’t create your account — check your connection"
      : "Couldn’t sign in — check your connection";
  const netRow =
    netErr && !offline ? (
      <div className="st-error auth-net" role="alert" data-auth-error>
        <span className="st-error-icon">
          <LuCloudOff size={16} />
        </span>
        <span className="st-error-text">{netLine}</span>
        <button
          type="button"
          className="nx-btn nx-btn-secondary nx-btn-sm"
          data-auth-retry
          disabled={retrying}
          onClick={() => void retry()}
        >
          {retrying ? (
            <span className="st-spin" aria-hidden="true" />
          ) : (
            <LuRefreshCw size={13} />
          )}
          {retrying ? "Retrying" : "Retry"}
        </button>
      </div>
    ) : null;
  const limitRow = limited ? (
    <span className="auth-error-text" role="alert" data-auth-limited>
      Too many requests, try again later
    </span>
  ) : null;
  const offlineNote = offline ? (
    <p
      className="axs-note auth-offline"
      data-px-calm
      role="status"
      data-auth-offline
    >
      <LuCloudOff size={13} />
      <span>
        {recover
          ? "You’re offline — resetting a password needs a connection."
          : "You’re offline — signing in needs a connection."}{" "}
        Everything here works again once you’re back.
      </span>
    </p>
  ) : null;

  const frame = (
    variant: "a" | "c",
    screen: string,
    body: React.ReactNode,
    foot: React.ReactNode
  ) => (
    <div
      className="auth-enter"
      data-auth-screen={screen}
      style={{ position: "fixed", inset: 0, zIndex: 950 }}
    >
      <PxSky variant={variant}>
        <Collage />
        <div className="scroll-inner auth-signin-abs">
          <div className="auth-signin-col">
            <NeedtLockup />
            <GlassCard
              className="axs-card"
              pad={0}
              radius={24}
              width="100%"
              strong
            >
              {body}
            </GlassCard>
            {offlineNote}
            {foot}
          </div>
        </div>
      </PxSky>
    </div>
  );

  if (recover) {
    return frame(
      "a",
      "recover-" + recover,
      <div key={recover} className="auth-signin-col-2 nx-swap">
        <span className="px-kicker auth-signin-el">Reset password</span>
        {recover === "ask" ? (
          <>
            <h1 className="px-display">
              Forgot your <em>password</em>?
            </h1>
            <p className="auth-signin-text">
              Enter the email you sign in with. We’ll send a link to set a new
              password.
            </p>
            <div className="auth-signin-col-4">
              <Field
                value={mail}
                label="Email"
                placeholder="Enter your email address"
                autoComplete="email"
                autoFocus
                invalid={!!mProblem}
                onChange={setMail}
                onEnter={() => void sendLink()}
              />
              {mText ? <span className="auth-error-text">{mText}</span> : null}
              {limitRow}
              {netRow}
              <button
                type="button"
                onClick={() => void sendLink()}
                disabled={offline || busy}
                className="nx-btn nx-btn-primary axs-go auth-signin-btn"
                data-auth-send-link
              >
                {busy ? "Sending…" : "Send reset link"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="px-display">
              Check your <em>email</em>
            </h1>
            <p className="auth-signin-text">
              If <b className="auth-recover-mail">{mail}</b> has an account, a
              reset link is on its way. It works for 1 hour.
            </p>
            <div className="auth-signin-col-4">
              {limitRow}
              {netRow}
              <p
                className="auth-recover-resend"
                data-auth-resend={resendIn > 0 ? resendIn : "ready"}
              >
                {"Didn’t get it? Check spam, or "}
                {resendIn > 0 ? (
                  <span className="auth-recover-wait">
                    resend in {resendClock(resendIn)}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="ax-link"
                    disabled={offline || busy}
                    onClick={() => void sendLink()}
                  >
                    send it again
                  </button>
                )}
                {". "}
                <button
                  type="button"
                  className="ax-link"
                  onClick={() => {
                    setNetErr(false);
                    setLimited(false);
                    setRecover("ask");
                  }}
                >
                  Use a different email
                </button>
              </p>
            </div>
          </>
        )}
      </div>,
      <p className="axs-switch" data-px-calm>
        {"Remembered it? "}
        <button
          type="button"
          className="ax-link auth-signin-text-4"
          data-auth-back-signin
          onClick={closeRecover}
        >
          Back to sign in
        </button>
      </p>
    );
  }

  return frame(
    signup ? "c" : "a",
    signup ? "signup" : "login",
    <div className="auth-signin-col-2">
      <span className="px-kicker auth-signin-el">
        {signup ? "New account" : "Sign in"}
      </span>
      <h1 className="px-display">
        {signup ? (
          <>
            Create your <em>account</em>
          </>
        ) : (
          <>
            Welcome <em>back</em>
          </>
        )}
      </h1>
      <p className="auth-signin-text">
        {signup
          ? "One planner for your calendar, your tasks and your projects."
          : "Sign in — your day is where you left it."}
      </p>
      {notice ? (
        <p className="auth-error-text" role="alert">
          {notice}
        </p>
      ) : null}

      {providers.length ? (
        <>
          <div className="auth-stack-8">
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={offline || providerBusy !== null}
                onClick={() => onProvider?.(p.id)}
                className="ax-btn ax-raised auth-oauth"
              >
                <span className="auth-raised-row">
                  <p.icon size={16} aria-hidden="true" />
                </span>
                {providerBusy === p.id
                  ? "Opening…"
                  : `Continue with ${p.label}`}
              </button>
            ))}
          </div>
          <div className="auth-signin-row-2">
            <span className="auth-signin-el-2" />
            <span className="auth-signin-text-2">or</span>
            <span className="auth-signin-el-2" />
          </div>
        </>
      ) : null}

      <div className="auth-signin-col-4">
        <Field
          value={mail}
          label="Email"
          placeholder="you@example.com"
          autoComplete="email"
          invalid={!!mProblem || refused?.reason === "taken"}
          onChange={(v) => {
            setRefused(null);
            setMail(v);
          }}
          onEnter={submit}
        />
        {mText ? <span className="auth-error-text">{mText}</span> : null}
        {withPass ? (
          <div key="pw" className="nx-swap auth-stack-6">
            <Field
              value={pass}
              type={show ? "text" : "password"}
              label="Password"
              placeholder={signup ? "At least 8 characters" : "Password"}
              autoComplete={signup ? "new-password" : "current-password"}
              autoFocus
              invalid={short || refused?.reason === "wrong"}
              onEnter={submit}
              onChange={(v) => {
                setRefused(null);
                setPass(v);
              }}
              trailing={<Eye shown={show} onToggle={() => setShow(!show)} />}
            />
            <span className="auth-pass-row">
              <span
                className="auth-signin-text-3"
                style={{
                  color: short ? "var(--destructive)" : "var(--text-tertiary)",
                }}
              >
                {short
                  ? "Use at least 8 characters."
                  : "At least 8 characters."}
              </span>
              {signup ? null : onRecover ? (
                <button
                  type="button"
                  className="ax-link auth-forgot"
                  data-auth-forgot
                  onClick={openRecover}
                >
                  Forgot password?
                </button>
              ) : null}
            </span>
          </div>
        ) : null}
        {refusal ? (
          <span className="refusal auth-signin-row-3" role="alert">
            <LuCircleAlert size={13} />
            {refusal}
          </span>
        ) : null}
        {!signup && withPass ? aside : null}
        {netRow}
        <button
          type="button"
          onClick={submit}
          disabled={offline || busy}
          className="nx-btn nx-btn-primary axs-go auth-signin-btn"
          data-auth-submit
        >
          {submitLabel(mode, withPass, busy)}
        </button>
      </div>
    </div>,
    <>
      {allowSignup || signup ? (
        <p className="axs-switch" data-px-calm>
          {signup ? "Already have an account? " : "New to Needt? "}
          <button
            type="button"
            className="ax-link auth-signin-text-4"
            data-auth-switch
            onClick={() => {
              setRefused(null);
              onMode(signup ? "login" : "signup");
            }}
          >
            {signup ? "Sign in" : "Create one"}
          </button>
        </p>
      ) : null}
      {showWaitlist({ mode, signupClosed }) ? (
        <p className="axs-switch" data-px-calm data-auth-waitlist>
          {WAITLIST.lead}
          <a className="ax-link auth-signin-text-4" href={WAITLIST.href}>
            {WAITLIST.host}
          </a>
          .
        </p>
      ) : null}
      <p className="axs-note" data-px-calm>
        By continuing you agree to Needt&apos;s{" "}
        <a className="ax-link" href={termsHref}>
          Terms
        </a>{" "}
        and{" "}
        <a className="ax-link" href={privacyHref}>
          Privacy Policy
        </a>
        .
      </p>
    </>
  );
}
