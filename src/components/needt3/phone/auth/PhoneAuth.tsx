"use client";

/* SIGN-IN / SIGN-UP / PASSWORD RECOVERY, ON A PHONE (prototype MobileAuth.jsx
   MbAuth). The desktop pairs a form with a live plate of the day; a phone has
   no room for that, so the persuasion is one line and a small mark and the
   rest of the screen is the thing you came to do.

   The host owns what a submit DOES (NextAuth, the register endpoint, the
   reset mail): `onSubmit`, `onRecover`, `onProvider` are the same callbacks
   the desktop AuthScreen takes, so one `V3SignInRoute` serves both. Nothing
   here invents a credential or a success, and the password lives only in this
   component's state: never logged, never stored.

   Not ported, and why: the prototype's mocked recovery (the "Open the link"
   stand-in and its New-password step: the real link opens the existing
   /auth/reset-password page, as on the desktop); the Apple button (no Apple
   provider is configured: only providers the host reports are drawn); the
   reset link's "30 minutes" (the server's token lives 1 hour, so the line
   says 1 hour); the password eye (no style for it in the vendored sheet). */
import * as React from "react";

import {
  LuArrowLeft,
  LuArrowRight,
  LuCircleAlert,
  LuCloudOff,
  LuLock,
  LuLockOpen,
  LuMail,
  LuRefreshCw,
  LuUser,
} from "react-icons/lu";

import { useOnline } from "@/lib/needt3/use-online";

import { AgeConfirm, useAgeState } from "../../auth/AgeConfirm";
import type { AuthScreenProps } from "../../auth/AuthScreen";
import {
  MIN_PASSWORD,
  MORE_SIGN_IN_WAYS_LABEL,
  WAITLIST,
  formReady,
  mailProblem,
  mailProblemText,
  netFailureText,
  oauthButtonLabel,
  passwordShort,
  phoneSubmitLabel,
  refusalText,
  resendClock,
  showWaitlist,
  splitSignInProviders,
} from "../../auth/auth-logic";
import { useAuthFields, useAuthSteps } from "../../auth/use-auth-fields";
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
} from "./Scene";

export type PhoneAuthProps = Omit<
  AuthScreenProps,
  "termsHref" | "privacyHref"
> & {
  /** The sign-up switch answered "closed": offer the waitlist instead. */
  signupClosed?: boolean;
  termsHref?: string;
  privacyHref?: string;
};

export function PhoneAuth({
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
  age: ageProp,
}: PhoneAuthProps) {
  const signup = mode !== "login";
  const age = useAgeState(ageProp);
  const [ageMissing, setAgeMissing] = React.useState(false);
  const online = useOnline();
  const offline = !online;
  const { mail, pass, setMail, setPass } = useAuthFields(fields, seed);
  const { touched, setTouched, refused, setRefused, recover, setRecover } =
    useAuthSteps(steps);
  const [busy, setBusy] = React.useState(false);
  /* Google, Apple and GitHub show; the rest wait behind "More ways". */
  const [moreWays, setMoreWays] = React.useState(false);
  const { main: mainProviders, more: moreProviders } =
    splitSignInProviders(providers);
  const shownProviders = moreWays
    ? [...mainProviders, ...moreProviders]
    : mainProviders;
  const [netErr, setNetErr] = React.useState(false);
  const [retrying, setRetrying] = React.useState(false);
  const [limited, setLimited] = React.useState(false);
  const [resendIn, setResendIn] = React.useState(0);
  const lastTry = React.useRef<(() => Promise<void>) | null>(null);
  /* A late answer must not set state on a screen that has gone. */
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const mProblem = mailProblem({ mail, touched });
  const mText = mailProblemText(mProblem);
  const short = touched && passwordShort(pass);
  const wrongPair = refused?.reason === "wrong";

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
    }).catch(() => ({ ok: false as const, network: true as const }));
    if (!alive.current) return;
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

  /** A new account needs the 16+ / Terms box ticked; sign-in does not. */
  function ageOk() {
    if (!signup || age.checked) return true;
    setAgeMissing(true);
    return false;
  }

  function submit() {
    if (busy || offline) return;
    setTouched(true);
    if (!formReady({ mail, pass })) return;
    if (!ageOk()) return;
    void run(send);
  }

  async function sendLink() {
    if (busy || offline || !onRecover) return;
    setTouched(true);
    if (mailProblem({ mail, touched: true })) return;
    await run(async () => {
      setBusy(true);
      setLimited(false);
      const ok = await onRecover(mail.trim()).catch(() => false);
      if (!alive.current) return;
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
    });
  }

  async function retry() {
    if (retrying || offline) return;
    setRetrying(true);
    // A short beat so the button visibly works before the same request goes again.
    await new Promise((r) => window.setTimeout(r, 600));
    if (!alive.current) return;
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
  }

  const refusal = refusalText(refused?.reason ?? null, refused?.message);
  const netRow =
    netErr && !offline ? (
      <>
        <MaNote tone="attention" icon={LuCloudOff}>
          {netFailureText({ recover: !!recover, signup })}
        </MaNote>
        <button
          type="button"
          className="mau-link"
          data-auth-retry
          disabled={retrying}
          onClick={() => void retry()}
        >
          <LuRefreshCw size={14} aria-hidden />
          {retrying ? "Retrying" : "Retry"}
        </button>
      </>
    ) : null;
  const offlineNote = offline ? (
    <MaNote icon={LuCloudOff}>
      {recover
        ? "You’re offline — resetting a password needs a connection."
        : "You’re offline — signing in needs a connection."}{" "}
      Everything here works again once you’re back.
    </MaNote>
  ) : null;
  const limitRow = limited ? (
    <MaNote tone="attention" icon={LuCircleAlert}>
      Too many requests, try again later
    </MaNote>
  ) : null;

  if (recover) {
    return (
      <MaScene variant="a">
        <div className="mau-scroll" data-auth-screen={"recover-" + recover}>
          <MaBrand />
          <MaHead
            kicker="Reset password"
            tile={
              <MaTile
                icon={recover === "sent" ? LuMail : LuLock}
                hue={recover === "sent" ? "var(--info)" : "var(--v2p-lav)"}
                size={32}
              />
            }
            a={recover === "ask" ? "Forgot your" : "Check your"}
            b={recover === "ask" ? "password" : "email"}
            line={
              recover === "ask"
                ? "Enter the email you sign in with. We’ll send a link to set a new password."
                : `If ${mail} has an account, a reset link is on its way. It works for 1 hour.`
            }
          />
          <MaPaper>
            <div key={recover} className="mau-form nx-swap">
              {offlineNote}
              {limitRow}
              {netRow}
              {recover === "ask" ? (
                <form
                  /* the fields stay the flex children of .mau-form */
                  style={{ display: "contents" }}
                  noValidate
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendLink();
                  }}
                >
                  <MaField label="Email" error={!!mProblem} hint={mText}>
                    <MaInput
                      label="Email"
                      type="email"
                      inputMode="email"
                      value={mail}
                      onChange={setMail}
                      placeholder="Email"
                      icon={LuMail}
                      autoComplete="email"
                      enterKeyHint="send"
                      invalid={!!mProblem}
                    />
                  </MaField>
                  <MaButton
                    primary
                    type="submit"
                    disabled={offline || busy}
                    data-auth-send-link
                  >
                    <LuMail size={16} aria-hidden />
                    {busy ? "Sending…" : "Send reset link"}
                  </MaButton>
                </form>
              ) : (
                <span
                  className="mau-resend"
                  data-auth-resend={resendIn > 0 ? resendIn : "ready"}
                >
                  {"Didn’t get it? Check spam, or "}
                  {resendIn > 0 ? (
                    <span className="mau-wait">
                      resend in {resendClock(resendIn)}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="mau-link"
                      disabled={offline || busy}
                      onClick={() => void sendLink()}
                    >
                      send it again
                    </button>
                  )}
                  {". "}
                  <button
                    type="button"
                    className="mau-link"
                    onClick={() => {
                      setNetErr(false);
                      setLimited(false);
                      setRecover("ask");
                    }}
                  >
                    Use a different email
                  </button>
                </span>
              )}
            </div>
          </MaPaper>
          <button
            type="button"
            onClick={closeRecover}
            className="mau-chip"
            data-px-calm
            data-auth-back-signin
          >
            <LuArrowLeft size={15} aria-hidden />
            Remembered it? <u>Back to sign in</u>
          </button>
        </div>
      </MaScene>
    );
  }

  return (
    <MaScene variant={signup ? "c" : "a"}>
      <div
        className="mau-scroll"
        data-auth-screen={signup ? "signup" : "login"}
      >
        <MaBrand date />
        <MaHead
          kicker={signup ? "New account" : "Sign in"}
          tile={<MaTile place={signup ? "tasks" : "home"} size={32} />}
          a={signup ? "Create your" : "Welcome"}
          b={signup ? "account" : "back"}
          line={
            signup
              ? "One planner for your calendar, your tasks and your projects."
              : "Sign in — your day is where you left it."
          }
        />

        <MaPaper>
          <form
            className="mau-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            {offlineNote}
            {notice ? (
              <MaNote tone="attention" icon={LuCircleAlert}>
                {notice}
              </MaNote>
            ) : null}
            {signup ? (
              <AgeConfirm
                age={age}
                missing={ageMissing}
                termsHref={termsHref}
                privacyHref={privacyHref}
                className="auth-age mau-age"
              />
            ) : null}
            {/* The ways in that need no typing come first: on a phone a
                password is the most expensive thing on the screen. */}
            {providers.length ? (
              <>
                {/* Two short labels share a row; three or more stack, as
                    "Continue with Google" does not fit half a phone. */}
                <div
                  className={
                    shownProviders.length > 2 ? "mau-pair is-stack" : "mau-pair"
                  }
                >
                  {shownProviders.map((p) => (
                    <MaButton
                      key={p.id}
                      data-provider={p.id}
                      onClick={() => {
                        if (ageOk()) onProvider?.(p.id);
                      }}
                      disabled={offline || providerBusy !== null}
                    >
                      <p.icon size={17} aria-hidden />
                      {providerBusy === p.id ? "Opening…" : oauthButtonLabel(p)}
                    </MaButton>
                  ))}
                  {moreProviders.length && !moreWays ? (
                    <button
                      type="button"
                      className="mau-link mau-more-ways"
                      aria-expanded={false}
                      onClick={() => setMoreWays(true)}
                    >
                      {MORE_SIGN_IN_WAYS_LABEL}
                    </button>
                  ) : null}
                </div>
                <span className="mau-or">
                  <span aria-hidden="true" className="mau-or-rule" />
                  <span>or with email</span>
                  <span aria-hidden="true" className="mau-or-rule" />
                </span>
              </>
            ) : null}
            <MaField
              label="Email"
              error={!!mProblem || refused?.reason === "taken"}
              hint={mText}
            >
              <MaInput
                label="Email"
                type="email"
                inputMode="email"
                value={mail}
                onChange={(v) => {
                  setRefused(null);
                  setMail(v);
                }}
                placeholder="Email"
                icon={LuMail}
                autoComplete="email"
                enterKeyHint="next"
                invalid={!!mProblem || refused?.reason === "taken"}
              />
            </MaField>
            <MaField
              label="Password"
              error={short || wrongPair}
              hint={
                short
                  ? "Use at least 8 characters."
                  : signup
                    ? `${MIN_PASSWORD} characters or more.`
                    : null
              }
            >
              <MaInput
                label="Password"
                type="password"
                value={pass}
                onChange={(v) => {
                  setRefused(null);
                  setPass(v);
                }}
                placeholder="Password"
                icon={LuLock}
                autoComplete={signup ? "new-password" : "current-password"}
                enterKeyHint="go"
                invalid={short || wrongPair}
              />
            </MaField>
            {signup || !onRecover ? null : (
              <button
                type="button"
                className="mau-link mau-forgot"
                data-auth-forgot
                onClick={openRecover}
              >
                <LuLockOpen size={14} aria-hidden />
                Forgot password?
              </button>
            )}
            {refusal ? (
              <MaNote tone="attention" icon={LuCircleAlert}>
                {refusal}
              </MaNote>
            ) : null}
            {!signup ? aside : null}
            {netRow}
            <MaButton
              primary
              type="submit"
              disabled={offline || busy}
              data-auth-submit
            >
              {signup ? (
                <LuUser size={16} aria-hidden />
              ) : (
                <LuArrowRight size={16} aria-hidden />
              )}
              {phoneSubmitLabel(mode, busy)}
            </MaButton>
          </form>
        </MaPaper>

        {allowSignup || signup ? (
          <button
            type="button"
            onClick={() => {
              setRefused(null);
              onMode(signup ? "login" : "signup");
            }}
            className="mau-chip"
            data-px-calm
            data-auth-switch
          >
            <LuUser size={15} aria-hidden />
            {signup ? (
              <>
                Already have an account? <u>Sign in</u>
              </>
            ) : (
              <>
                New to Needt? <u>Create one</u>
              </>
            )}
          </button>
        ) : null}
        {showWaitlist({ mode, signupClosed }) ? (
          <p className="mau-resend" data-px-calm data-auth-waitlist>
            {WAITLIST.lead}
            <a className="mau-link" href={WAITLIST.href}>
              {WAITLIST.host}
            </a>
            .
          </p>
        ) : null}
        {signup ? null : (
          <p className="mau-resend" data-px-calm>
            By continuing you agree to Needt&apos;s{" "}
            <a className="mau-link" href={termsHref}>
              Terms
            </a>{" "}
            and{" "}
            <a className="mau-link" href={privacyHref}>
              Privacy Policy
            </a>
            .
          </p>
        )}
      </div>
    </MaScene>
  );
}
