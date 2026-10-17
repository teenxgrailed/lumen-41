"use client";

/* ONBOARDING (owner-approved flow, 2026-10-17): three short steps and an
   optional fourth, then Today with a sample day.
     use       -> settings prefs.uses (in the order picked; the first drives
                  the sample day)
     calendar  -> leaves for the provider's own consent screen, or skip
     hours     -> Settings' per-day editor (saved as it is edited) + time zone
     import    -> Todoist / Notion, only when this server can run them
     finish    -> POST /api/onboarding/sample, prefs.onboarded = true, Today
   Skip saves nothing further, creates no sample, and goes to Today.
   Nothing here creates an account or enters a credential. */
import * as React from "react";

import { LuArrowLeft, LuCheck } from "react-icons/lu";

import { useUpdateSettings } from "@/lib/needt3/hooks/settings";
import { THEMES, type ThemeChoice } from "@/lib/needt3/theme";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { BrandIcon, type BrandId, brandIdForConnection } from "../brand";
import { ICloudGuide } from "../connections/ICloudGuide";
import { Art, type ArtName } from "../menu/Art";
import { PhoneSetup } from "../phone/auth";
import { usePhoneUi } from "../root/phone-ui-context";
import {
  GlassCard,
  PwDateCard,
  PwMiniEvent,
  PwMiniHabit,
  PwMiniTask,
  PxDots,
  PxSky,
} from "../scenes";
import { NeedtLockup } from "../wordmark";
import { HoursStep } from "./HoursStep";
import { USES } from "./onboarding-data";
import { STEP_SKY } from "./onboarding-steps";
import { type Onboarding, useOnboarding } from "./useOnboarding";

const HEAD: Record<string, React.ReactNode> = {
  use: (
    <>
      What will you use Needt <em>for</em>?
    </>
  ),
  calendar: (
    <>
      Connect your <em>calendar</em>
    </>
  ),
  hours: (
    <>
      Your working <em>hours</em>
    </>
  ),
  import: (
    <>
      Bring your <em>work</em> along
    </>
  ),
};

function Row({
  art,
  brand,
  title,
  sub,
  on,
  onClick,
  delay,
  multi,
  compact,
  disabled,
}: {
  art?: ArtName;
  /** A brand's mark in place of the illustration. */
  brand?: BrandId | null;
  title: string;
  sub: string;
  on: boolean;
  onClick: () => void;
  delay?: number;
  multi?: boolean;
  compact?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={
        "ax-row nx-swap" +
        (on ? " is-on" : "") +
        (compact ? " is-compact" : "") +
        " auth-row-row"
      }
      style={{
        animationDelay: (delay || 0) + "ms",
        background: on ? "var(--fill-accent)" : "var(--surface-raised)",
        boxShadow: on
          ? "inset 0 0 0 1.5px var(--accent)"
          : "var(--shadow-ring)",
      }}
    >
      <span className="auth-row-row-2">
        {brand ? (
          <BrandIcon id={brand} size={compact ? 32 : 38} />
        ) : art ? (
          <Art name={art} size={compact ? 30 : 38} />
        ) : null}
      </span>
      <span className="auth-row-col">
        <span className="auth-row-text">{title}</span>
        <span className="auth-row-text-2">{sub}</span>
      </span>
      <span
        aria-hidden="true"
        className="auth-row-grid"
        style={{
          borderRadius: multi ? 6 : 10,
          background: on ? "var(--accent)" : "transparent",
          boxShadow: on ? "none" : "inset 0 0 0 1.5px var(--text-muted)",
        }}
      >
        {on ? <LuCheck size={12} /> : null}
      </span>
    </button>
  );
}

function ThemeSwitch() {
  const theme = useNeedt3Ui((s) => s.theme);
  const setTheme = useNeedt3Ui((s) => s.setTheme);
  const update = useUpdateSettings();
  return (
    <div
      className="auth-theme"
      role="radiogroup"
      aria-label="Theme"
      data-px-calm
    >
      {THEMES.map(([id, l]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={theme === id}
          className={"auth-theme-b" + (theme === id ? " is-on" : "")}
          data-ob-theme={id}
          onClick={() => {
            setTheme(id as ThemeChoice);
            void update.mutateAsync({ theme: id }).catch(() => undefined);
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/** Glass cards of the product beside the headline, per step. */
function StepArt({ id }: { id: string }) {
  const pin = (
    at: React.CSSProperties,
    delay: number,
    child: React.ReactNode
  ) => (
    <span
      className="nx-swap"
      style={{ position: "absolute", animationDelay: delay + "ms", ...at }}
    >
      {child}
    </span>
  );
  if (id === "use") {
    return (
      <div className="axs-art" aria-hidden="true">
        {pin(
          { left: 0, top: 10 },
          60,
          <GlassCard width={262} caption="Today" pad={10} radius={20}>
            <span className="auth-stack-6">
              <PwMiniTask title="Write the one-page brief" chip="90 min" />
              <PwMiniTask title="Pick up the dry cleaning" chip="25 min" />
            </span>
          </GlassCard>
        )}
        {pin(
          { left: 190, top: 196 },
          140,
          <GlassCard width={238} caption="Habit" pad={10} radius={20}>
            <PwMiniHabit title="Walk for twenty minutes" streak="5 a week" />
          </GlassCard>
        )}
      </div>
    );
  }
  if (id === "calendar") {
    return (
      <div className="axs-art" aria-hidden="true">
        {pin({ left: 0, top: 10 }, 60, <PwDateCard width={118} />)}
        {pin(
          { left: 134, top: 40 },
          120,
          <GlassCard width={250} pad={10} radius={20} caption="Tuesday">
            <span className="auth-stack-6">
              <PwMiniEvent time="09:30" title="Standup" hue="var(--hue-blue)" />
              <PwMiniEvent
                time="12:00"
                title="Lunch"
                hue="var(--demo-hue-gray)"
              />
            </span>
          </GlassCard>
        )}
      </div>
    );
  }
  return (
    <div className="axs-art" aria-hidden="true">
      {pin({ left: 0, top: 10 }, 60, <PwDateCard width={118} event={false} />)}
    </div>
  );
}

export function OnboardingScreen({ startAt }: { startAt?: string | null }) {
  const ui = usePhoneUi();
  /* One controller above the face switch: a resize across 700px swaps the face
     and keeps the step and the picks. */
  const ob = useOnboarding({ startAt, ui });
  if (ui === "phone") return <PhoneSetup ob={ob} />;
  return <DesktopOnboarding ob={ob} />;
}

function DesktopOnboarding({ ob }: { ob: Onboarding }) {
  const {
    i,
    dir,
    id,
    ids,
    count,
    step,
    online,
    ready,
    uses,
    toggleUse,
    skipCal,
    setSkipCal,
    guide,
    setGuide,
    calendars,
    importSources,
    canContinue,
    planning,
    connected,
    go,
    finish,
    connect,
    startImport,
  } = ob;
  const last = i === count - 1;

  return (
    <div
      className="auth-enter"
      data-onboarding-step={id}
      style={{ position: "fixed", inset: 0, zIndex: 950 }}
    >
      <PxSky variant={STEP_SKY[id]}>
        <div className="auth-onboarding-abs">
          <div className="auth-onboarding-row">
            <NeedtLockup small />
            <PxDots
              count={count}
              index={i}
              onPick={ready ? (n) => void go(n) : undefined}
              label="Setup"
              names={ids.map((k) => k)}
              className="auth-onboarding-text"
            />
            <ThemeSwitch />
            <button
              type="button"
              className="axs-skip px-chip-btn"
              data-ob-skip
              disabled={!ready}
              onClick={() => void finish(true)}
            >
              Skip setup
            </button>
          </div>

          <div className="auth-onboarding-row-2">
            <div
              key={"h" + id}
              className={
                "axs-left ax-step nx-swap " +
                (dir > 0 ? "is-fwd" : "is-back") +
                " auth-onboarding-col"
              }
            >
              <span className="px-kicker auth-onboarding-el" data-px-calm>
                Step {i + 1} of {count}
              </span>
              <h1
                className="px-display px-on-sky axs-h auth-onboarding-text-2"
                data-px-calm
              >
                {HEAD[id]}
              </h1>
              <p className="px-on-sky auth-onboarding-text-3" data-px-calm>
                {step[2]}
              </p>
              <StepArt id={id} />
            </div>

            <GlassCard
              pad={0}
              radius={24}
              strong
              width={520}
              className="axs-card auth-onboarding-card"
            >
              <div className="auth-onboarding-col-2">
                <div
                  key={id}
                  className={
                    "ax-step nx-swap scroll-inner " +
                    (dir > 0 ? "is-fwd" : "is-back") +
                    " auth-onboarding-col-3"
                  }
                >
                  {id === "use" ? (
                    <>
                      <span className="px-kicker auth-onboarding-el-2">
                        Pick one, or more · the first sets your sample day
                      </span>
                      <div
                        className="auth-stack-8"
                        role="group"
                        aria-label="What you use Needt for"
                      >
                        {USES.map(([uid, t, s, a], n) => (
                          <Row
                            key={uid}
                            art={a}
                            title={t}
                            sub={s}
                            multi
                            on={uses.includes(uid)}
                            delay={60 + n * 40}
                            onClick={() => toggleUse(uid)}
                          />
                        ))}
                      </div>
                      {!uses.length ? (
                        <span className="auth-ob-hint">
                          Pick at least one to continue.
                        </span>
                      ) : null}
                    </>
                  ) : null}

                  {id === "calendar" ? (
                    <>
                      <span className="px-kicker auth-onboarding-el-2">
                        Connect one, or skip
                      </span>
                      <div className="auth-stack-6">
                        {calendars.map((c, n) => {
                          const on = connected.has(c.provider);
                          return (
                            <Row
                              key={c.id}
                              compact
                              multi
                              art={c.art}
                              brand={brandIdForConnection({
                                kind: "calendar",
                                provider: c.provider,
                              })}
                              title={c.title}
                              sub={on ? "Connected" : c.sub}
                              on={on || (c.id === "apple" && guide)}
                              disabled={on || !online}
                              delay={60 + n * 40}
                              onClick={() =>
                                c.id === "apple"
                                  ? setGuide((v) => !v)
                                  : c.href && connect(c.href)
                              }
                            />
                          );
                        })}
                        {guide ? (
                          <div data-ob-icloud-guide="">
                            <ICloudGuide />
                            <button
                              type="button"
                              className="nx-btn nx-btn-secondary"
                              data-ob-icloud-open=""
                              onClick={() => connect("/connections")}
                            >
                              I have the password, open the form
                            </button>
                          </div>
                        ) : null}
                        <Row
                          compact
                          art="later"
                          title="Skip for now"
                          sub="Connect one later from Settings"
                          on={skipCal}
                          delay={180}
                          onClick={() => setSkipCal((v) => !v)}
                        />
                        {!online ? (
                          <p
                            className="auth-cal-offline"
                            role="status"
                            data-auth-offline
                          >
                            <span>
                              You’re offline — connecting a calendar needs a
                              connection. The rest of setup still works.
                            </span>
                          </p>
                        ) : null}
                      </div>
                    </>
                  ) : null}

                  {id === "hours" ? <HoursStep ob={ob} /> : null}

                  {id === "import" ? (
                    <>
                      <span className="px-kicker auth-onboarding-el-2">
                        Optional · you leave for their sign-in and come back
                      </span>
                      <div className="auth-stack-6">
                        {importSources.map((s, n) => (
                          <Row
                            key={s.id}
                            compact
                            brand={s.id}
                            title={s.label}
                            sub={s.sub}
                            on={false}
                            disabled={!online}
                            delay={60 + n * 40}
                            onClick={() => startImport(s.id)}
                          />
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>

                <div className="auth-onboarding-row-6">
                  {i > 0 ? (
                    <button
                      type="button"
                      className="axs-back"
                      data-axs-back
                      onClick={() => void go(i - 1)}
                    >
                      <LuArrowLeft size={15} />
                      Back
                    </button>
                  ) : null}
                  <span className="auth-onboarding-text-10" />
                  <button
                    type="button"
                    className="nx-btn nx-btn-primary axs-go"
                    data-axs-next
                    disabled={!canContinue || planning}
                    onClick={() => (last ? void finish() : void go(i + 1))}
                  >
                    {last
                      ? planning
                        ? "Opening…"
                        : "Open my day"
                      : "Continue"}
                  </button>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      </PxSky>
    </div>
  );
}
