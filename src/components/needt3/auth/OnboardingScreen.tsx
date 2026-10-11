"use client";

/* ONBOARDING (prototype OnboardingScreen, owner-approved 08.10.26): five steps
   that end in the product doing its one trick. Everything a step decides is
   written when you leave it, through the same APIs the rest of the app uses:
     use      -> settings prefs.uses
     setup    -> auto-schedule settings (working hours), settings.timeZone
     sidebar  -> settings prefs.sidebarTiles (every place id, in order)
     first    -> a real task (POST /api/tasks), left for the scheduler
     finish   -> prefs.onboarded = true, then Home
   Skip saves nothing further and goes Home. Nothing here creates an account
   or enters a credential.

   Not ported, and why: the real Composer inside step 4 (it belongs to the
   composer lane; a plain field with the same Enter-to-add stands in), the
   prototype's parser and first-slot planner (the server's scheduler owns
   placement; step 5 shows what it returned), half-hour working hours (the
   schema stores whole hours), and the in-flow calendar OAuth mock (connecting
   leaves for the provider's own consent screen). */
import * as React from "react";

import { LuArrowLeft, LuCheck, LuSparkles } from "react-icons/lu";

import { NeedtPicker } from "@/components/ui/needt-picker";

import { useUpdateSettings } from "@/lib/needt3/hooks/settings";
import { THEMES, type ThemeChoice } from "@/lib/needt3/theme";

import { useNeedt3Ui } from "@/store/needt3-ui";

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
import { PLACES } from "../shell/places";
import { NeedtLockup } from "../wordmark";
import { SidebarGame } from "./SidebarGame";
import { CALS, USES } from "./onboarding-data";
import { STEPS, STEP_IDS, STEP_SKY } from "./onboarding-steps";
import { type Onboarding, useOnboarding } from "./useOnboarding";

const HEAD: Record<(typeof STEP_IDS)[number], React.ReactNode> = {
  use: (
    <>
      What will you use Needt <em>for</em>?
    </>
  ),
  setup: (
    <>
      Your calendar and <em>hours</em>
    </>
  ),
  sidebar: (
    <>
      Make your <em>sidebar</em>
    </>
  ),
  first: (
    <>
      Your first <em>task</em>
    </>
  ),
  placed: (
    <>
      Here’s where Needt <em>put</em> it
    </>
  ),
};

const USE_ROWS: Record<
  string,
  ReadonlyArray<readonly [string, string | null]>
> = {
  work: [
    ["Draft the launch brief", "Work"],
    ["Reply to Tom", "Mailbox"],
  ],
  personal: [
    ["Pick up the prints", "Errand"],
    ["Call mum", null],
  ],
  side: [
    ["List the boots on Ricardo", "Side"],
    ["Ship order #2041", "Side"],
  ],
};

function Row({
  art,
  title,
  sub,
  on,
  onClick,
  delay,
  multi,
  compact,
  disabled,
}: {
  art: ArtName;
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
        <Art name={art} size={compact ? 30 : 38} />
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

function Select({
  value,
  options,
  onChange,
  label,
  invalid,
  wide,
}: {
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  onChange: (v: string) => void;
  label: string;
  invalid?: boolean;
  wide?: boolean;
}) {
  /* The one product picker (check:ui-contracts retires a bare select). */
  return (
    <span
      className={
        "auth-select" +
        (wide ? " is-wide" : "") +
        (invalid ? " is-invalid" : "")
      }
    >
      <NeedtPicker
        value={value}
        options={options.map(([v, l]) => ({ value: v, label: l }))}
        onValueChange={onChange}
        ariaLabel={label}
        triggerVariant="field"
      />
    </span>
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
function StepArt({
  id,
  uses,
  hours,
}: {
  id: string;
  uses: string[];
  hours: string;
}) {
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
  if (id === "sidebar") return null;
  if (id === "use") {
    const picked = uses.length ? uses : ["work"];
    const rows = picked.flatMap((u) => USE_ROWS[u] ?? []).slice(0, 4);
    return (
      <div className="axs-art" aria-hidden="true">
        {pin(
          { left: 0, top: 10 },
          60,
          <GlassCard
            width={262}
            caption={`Inbox · ${rows.length}`}
            pad={10}
            radius={20}
          >
            <span className="auth-stack-6">
              {rows.map(([t, c]) => (
                <PwMiniTask key={t} title={t} chip={c} />
              ))}
            </span>
          </GlassCard>
        )}
        {pin(
          { left: 190, top: 196 },
          140,
          <GlassCard width={238} caption="Habit · day 6" pad={10} radius={20}>
            <PwMiniHabit title="Shoot one roll" streak="6 days" />
          </GlassCard>
        )}
      </div>
    );
  }
  if (id === "setup") {
    return (
      <div className="axs-art" aria-hidden="true">
        {pin({ left: 0, top: 10 }, 60, <PwDateCard width={118} />)}
        {pin(
          { left: 134, top: 40 },
          120,
          <GlassCard
            width={250}
            pad={10}
            radius={20}
            caption={`Tue · your hours ${hours}`}
          >
            <span className="auth-stack-6">
              <PwMiniEvent
                time="08:00"
                title="Coffee · Kreis 5"
                hue="var(--demo-hue-green)"
              />
              <PwMiniEvent time="09:30" title="Standup" hue="var(--hue-blue)" />
              <PwMiniEvent
                time="12:00"
                title="Lunch with Ana"
                hue="var(--demo-hue-gray)"
              />
              <PwMiniEvent
                time="14:00"
                title="Shoot · Kreis 4"
                hue="var(--demo-hue-orange)"
              />
            </span>
          </GlassCard>
        )}
      </div>
    );
  }
  if (id === "first") {
    return (
      <div className="axs-art" aria-hidden="true">
        {pin(
          { left: 0, top: 16 },
          60,
          <GlassCard
            width={292}
            caption="Needt reads the words"
            pad={10}
            radius={20}
          >
            <span className="auth-stack-6">
              <PwMiniTask title="Plan the week" chip="30 min" />
              <PwMiniTask title="Pay the rent" chip="by Friday" />
              <PwMiniTask title="Draft the brief" chip="Work" />
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
     and keeps the step, the typed values and the first task (no second
     create), and the third step saves the list of the face on screen. */
  const ob = useOnboarding({ startAt, ui });
  if (ui === "phone") return <PhoneSetup ob={ob} />;
  return <DesktopOnboarding ob={ob} />;
}

function DesktopOnboarding({ ob }: { ob: Onboarding }) {
  const {
    i,
    dir,
    id,
    step,
    online,
    ready,
    uses,
    setUses,
    start,
    setStart,
    end,
    setEnd,
    bad,
    tz,
    setTz,
    zoneOptions,
    skipCal,
    setSkipCal,
    tiles,
    setTiles,
    title,
    setTitle,
    first,
    adding,
    planning,
    connected,
    hours,
    hourOpts,
    go,
    skipTiles,
    addTask,
    finish,
    connect,
  } = ob;

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
              count={STEPS.length}
              index={i}
              onPick={ready ? (n) => void go(n) : undefined}
              label="Setup"
              names={STEPS.map((s) => s[1])}
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
                Step {i + 1} of {STEPS.length}
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
              <StepArt id={id} uses={uses} hours={hours} />
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
                        Pick any · one or more
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
                            onClick={() =>
                              setUses((l) =>
                                l.includes(uid)
                                  ? l.filter((x) => x !== uid)
                                  : [...l, uid]
                              )
                            }
                          />
                        ))}
                      </div>
                      {!uses.length ? (
                        <span className="auth-ob-hint">
                          Nothing picked is fine too — Needt starts neutral.
                        </span>
                      ) : null}
                    </>
                  ) : null}

                  {id === "setup" ? (
                    <>
                      <span className="px-kicker auth-onboarding-el-2">
                        Calendar · connect one, or skip
                      </span>
                      <div className="auth-stack-6">
                        {CALS.map((c, n) => {
                          const on = connected.has(c.provider);
                          return (
                            <Row
                              key={c.id}
                              compact
                              multi
                              art={c.art}
                              title={c.title}
                              sub={on ? "Connected" : c.sub}
                              on={on}
                              disabled={on || !c.href || !online}
                              delay={60 + n * 40}
                              onClick={() => c.href && connect(c.href)}
                            />
                          );
                        })}
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
                      <span className="px-kicker auth-onboarding-el-2 auth-ob-gap">
                        Working hours
                      </span>
                      <div
                        className="auth-ob-hours nx-swap"
                        style={{ animationDelay: "220ms" }}
                      >
                        <div className="auth-ob-line">
                          <span className="auth-ob-label">Day</span>
                          <Select
                            label="Day starts"
                            value={String(start)}
                            options={hourOpts}
                            onChange={(v) => setStart(Number(v))}
                          />
                          <span className="auth-ob-to">to</span>
                          <Select
                            label="Day ends"
                            value={String(end)}
                            invalid={bad}
                            options={hourOpts}
                            onChange={(v) => setEnd(Number(v))}
                          />
                        </div>
                        {bad ? (
                          <span className="auth-error-text">
                            The day has to end at least an hour after it starts.
                          </span>
                        ) : null}
                        <div className="auth-ob-line">
                          <span className="auth-ob-label">Time zone</span>
                          <Select
                            wide
                            label="Time zone"
                            value={tz || zoneOptions[0][0]}
                            options={zoneOptions}
                            onChange={setTz}
                          />
                        </div>
                        <span className="auth-ob-hint">
                          Needt only places work inside these hours.
                        </span>
                      </div>
                    </>
                  ) : null}

                  {id === "sidebar" ? (
                    <SidebarGame order={tiles} onOrder={setTiles} />
                  ) : null}

                  {id === "first" ? (
                    <>
                      <span className="px-kicker auth-onboarding-el-2">
                        New task
                      </span>
                      <input
                        className="auth-field-input"
                        style={{
                          boxShadow: "var(--shadow-ring)",
                          padding: "0 14px",
                        }}
                        value={title}
                        autoFocus
                        placeholder="Plan the week"
                        aria-label="Task title"
                        data-ob-composer
                        onChange={(e) => setTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void addTask();
                        }}
                      />
                      <span className="auth-ob-hint">
                        Press Enter to add it — Needt finds it a free slot in
                        your hours.
                      </span>
                    </>
                  ) : null}

                  {id === "placed" && first ? (
                    <>
                      <span className="px-kicker auth-onboarding-el-2">
                        Your first task · your hours {hours}
                      </span>
                      <PwMiniTask
                        title={first.title}
                        chip={
                          first.estimatedMinutes
                            ? `${first.estimatedMinutes} min`
                            : null
                        }
                      />
                      <p className="auth-ob-why" data-ob-reason>
                        <LuSparkles size={14} />
                        <span>
                          {first.scheduledStart
                            ? `Needt placed it for ${first.scheduledStart.replace("T", " ")}, inside your hours.`
                            : "Needt places it in your first free slot inside these hours as soon as it has your calendar. You will see it on Home."}
                        </span>
                      </p>
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
                  {id === "sidebar" ? (
                    <>
                      <button
                        type="button"
                        className="nx-btn nx-btn-text"
                        data-ob-sb-reset
                        disabled={
                          tiles.join() === PLACES.map((p) => p.id).join()
                        }
                        onClick={() => setTiles(PLACES.map((p) => p.id))}
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        className="nx-btn nx-btn-text"
                        data-ob-sb-skip
                        onClick={skipTiles}
                      >
                        Skip
                      </button>
                    </>
                  ) : null}
                  {id === "first" ? (
                    <>
                      <button
                        type="button"
                        className="nx-btn nx-btn-text"
                        data-ob-skip-task
                        disabled={!ready}
                        onClick={() => void finish()}
                      >
                        Skip — open Needt
                      </button>
                      <button
                        type="button"
                        className="nx-btn nx-btn-primary axs-go"
                        data-axs-next
                        disabled={!title.trim() || adding || !online}
                        onClick={() => void addTask()}
                      >
                        {adding ? "Adding…" : "Add task"}
                      </button>
                    </>
                  ) : id === "placed" ? (
                    <button
                      type="button"
                      className="nx-btn nx-btn-primary axs-go"
                      data-axs-next
                      disabled={!ready}
                      onClick={() => void finish()}
                    >
                      {planning ? "Opening…" : "Open my day"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="nx-btn nx-btn-primary axs-go"
                      data-axs-next
                      disabled={!ready || (id === "setup" && bad)}
                      onClick={() => void go(i + 1)}
                    >
                      Continue
                    </button>
                  )}
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      </PxSky>
    </div>
  );
}
