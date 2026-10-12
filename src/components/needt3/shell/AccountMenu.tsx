"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { signOut, useSession } from "next-auth/react";

import { createPortal } from "react-dom";
import {
  LuChevronsUpDown,
  LuLink,
  LuLogOut,
  LuPalette,
  LuSettings,
  LuSparkles,
  LuUsers,
} from "react-icons/lu";

import { type V3PlanKind, usePlan } from "@/lib/needt3/hooks/plan";
import { THEMES, type ThemeChoice } from "@/lib/needt3/theme";
import { notify } from "@/lib/notifications";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { useV3PortalContainer } from "../ctx/PortalScope";
import { useExit } from "../ctx/useExit";
import { Avatar, initialsOf } from "./Avatar";

/** The full plan line (the pill's title). */
export function planLine(kind: V3PlanKind, daysLeft: number | null) {
  const left = daysLeft ?? 0;
  if (kind === "trial")
    return `Pro trial · ${left}${left === 1 ? " day" : " days"}`;
  if (kind === "lifetime") return "Pro · Lifetime";
  if (kind === "monthly" || kind === "yearly") return "Pro";
  return "Free";
}

/** The pill beside the name: the plan in two or three words, one line. */
export function planPill(kind: V3PlanKind, daysLeft: number | null) {
  if (kind === "trial")
    return { text: `Trial · ${daysLeft ?? 0}d`, tone: "trial" };
  if (kind === "free") return { text: "Free", tone: "free" };
  return { text: "Pro", tone: "pro" };
}

const PLAN_NAME: Record<V3PlanKind, string> = {
  free: "Free plan",
  trial: "Pro trial",
  monthly: "Pro · Monthly",
  yearly: "Pro · Yearly",
  lifetime: "Pro · Lifetime",
};

function AcctRow({
  icon,
  label,
  kbd,
  onClick,
  soon,
}: {
  icon: React.ReactNode;
  label: string;
  kbd?: string;
  onClick?: () => void;
  soon?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-acct-nav=""
      className="sb-acct-row"
      onClick={soon ? undefined : onClick}
      aria-disabled={soon ? "true" : undefined}
    >
      <span className="sb-acct-ico">{icon}</span>
      <span className="sb-acct-label">{label}</span>
      {soon ? (
        <span className="sb-acct-soon">Soon</span>
      ) : kbd ? (
        <kbd className="sb-acct-kbd">{kbd}</kbd>
      ) : null}
    </button>
  );
}

function placeAt(el: HTMLElement | null) {
  const r = el
    ? el.getBoundingClientRect()
    : ({ left: 10, bottom: 60 } as DOMRect);
  return {
    left: Math.max(8, Math.min(r.left, window.innerWidth - 344)),
    top: r.bottom + 6,
  };
}

/**
 * The person, top-left: avatar, name and a plan pill on one 32px line. Opens
 * the account menu: who you are + plan, Settings, Appearance, Invite, Teams,
 * Sign out. Help lives in the top bar's ? button, not here.
 */
export function AccountMenu() {
  const session = useSession();
  const plan = usePlan();
  const theme = useNeedt3Ui((s) => s.theme);
  const setTheme = useNeedt3Ui((s) => s.setTheme);
  const openSettings = useNeedt3Ui((s) => s.openSettings);
  const container = useV3PortalContainer();
  const [open, setOpen] = useState(false);
  const [shown, leaving] = useExit(open, 140);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const user = session.data?.user;
  const name = user?.name || user?.email?.split("@")[0] || "Account";
  const kind: V3PlanKind = plan.data?.kind ?? "free";
  const days = plan.data?.trialDaysLeft ?? null;
  const pro = kind !== "free";
  const pill = planPill(kind, days);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };
  const toggle = () => {
    if (!open) setAt(placeAt(trigger.current));
    setOpen(!open);
  };

  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!wrap.current?.contains(t) && !panel.current?.contains(t))
        setOpen(false);
    };
    document.addEventListener("mousedown", away);
    // First stop gets focus so the arrows work at once.
    const t = window.setTimeout(() => {
      panel.current
        ?.querySelector<HTMLElement>("[data-acct-nav]")
        ?.focus({ preventScroll: true });
    }, 0);
    return () => {
      document.removeEventListener("mousedown", away);
      window.clearTimeout(t);
    };
  }, [open]);

  const run = (fn?: () => void) => () => {
    close(false);
    fn?.();
  };
  const stops = () =>
    Array.from(
      panel.current?.querySelectorAll<HTMLElement>(
        "[data-acct-nav]:not([aria-disabled='true'])"
      ) ?? []
    );
  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    }
    if (e.key === "Tab") {
      close(false);
      return;
    }
    const list = stops();
    const i = list.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => list[(n + list.length) % list.length]?.focus();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      go(i + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      go(i < 0 ? list.length - 1 : i - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      go(0);
    } else if (e.key === "End") {
      e.preventDefault();
      go(list.length - 1);
    } else if (
      (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
      (document.activeElement as HTMLElement | null)?.hasAttribute(
        "data-acct-theme"
      )
    ) {
      e.preventDefault();
      const k = THEMES.findIndex(([v]) => v === theme);
      const step = e.key === "ArrowRight" ? 1 : -1;
      const n = THEMES[(k + step + THEMES.length) % THEMES.length][0];
      pickTheme(n);
      window.setTimeout(() => {
        panel.current
          ?.querySelector<HTMLElement>(`[data-acct-theme="${n}"]`)
          ?.focus();
      }, 0);
    }
  };

  function pickTheme(v: ThemeChoice) {
    //todo: persist through the Settings → Appearance write (T21) once it
    // lands; the store keeps the choice locally until then.
    setTheme(v);
  }

  const invite = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      notify.success("Invite link copied");
    } catch {
      notify.error("Could not copy the link");
    }
  };

  return (
    <div className="shell-space-menu-div" ref={wrap}>
      <button
        type="button"
        ref={trigger}
        className="sb-profile"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        data-sb-profile={kind}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <Avatar
          initials={initialsOf(name)}
          name={name}
          size={22}
          src={user?.image}
        />
        <span className="sb-profile-text">
          <span className="sb-profile-name">{name}</span>
          {plan.data ? (
            <span
              className={`sb-profile-pill is-${pill.tone}`}
              data-sb-plan-pill=""
              title={planLine(kind, days)}
            >
              {pill.text}
            </span>
          ) : null}
        </span>
        <span className="sb-profile-chev">
          <LuChevronsUpDown size={14} />
        </span>
      </button>
      {/* In the scope's portal layer: the rail clips (overflow hidden) and
          the card is wider than the rail at 768. Placed from the trigger. */}
      {shown && container && at
        ? createPortal(
            <div
              ref={panel}
              role="menu"
              aria-label="Account"
              className={`sb-acct${leaving ? " is-leaving" : ""}`}
              onKeyDown={onKey}
              style={at}
            >
              <div className="sb-acct-head">
                <Avatar
                  initials={initialsOf(name)}
                  name={name}
                  size={36}
                  src={user?.image}
                />
                <span className="sb-acct-who">
                  <span className="sb-acct-name">
                    {name}
                    {pro ? <span className="sb-acct-pro">PRO</span> : null}
                  </span>
                  {user?.email ? (
                    <span className="sb-acct-mail">{user.email}</span>
                  ) : null}
                </span>
              </div>
              <div className="sb-acct-plan">
                <span className="sb-acct-plan-line">{PLAN_NAME[kind]}</span>
                {pro ? (
                  <button
                    type="button"
                    role="menuitem"
                    data-acct-nav=""
                    className="nx-btn nx-btn-text nx-btn-sm sb-acct-plan-btn"
                    onClick={run(() => openSettings("plan"))}
                  >
                    Manage
                  </button>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    data-acct-nav=""
                    className="nx-btn nx-btn-primary nx-btn-sm sb-acct-plan-btn"
                    //todo: open the paywall sheet (S1 paywall) once it exists.
                    onClick={run(() => openSettings("plan"))}
                  >
                    <LuSparkles size={14} />
                    Upgrade
                  </button>
                )}
              </div>
              <span className="sb-acct-sep" role="separator" />
              <AcctRow
                icon={<LuSettings size={16} />}
                label="Settings"
                kbd="⌘,"
                onClick={run(() => openSettings())}
              />
              <div className="sb-acct-row sb-acct-row-static">
                <span className="sb-acct-ico">
                  <LuPalette size={16} />
                </span>
                <span className="sb-acct-label">Appearance</span>
                <span
                  className="sb-acct-seg"
                  role="radiogroup"
                  aria-label="Theme"
                >
                  {THEMES.map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={theme === v}
                      data-acct-theme={v}
                      data-acct-nav={theme === v ? "" : undefined}
                      tabIndex={-1}
                      className={`sb-acct-seg-btn${theme === v ? " is-on" : ""}`}
                      onClick={() => pickTheme(v)}
                    >
                      {l}
                    </button>
                  ))}
                </span>
              </div>
              <span className="sb-acct-sep" role="separator" />
              <AcctRow
                icon={<LuLink size={16} />}
                label="Invite to Needt"
                onClick={run(() => void invite())}
              />
              <AcctRow icon={<LuUsers size={16} />} label="Teams" soon />
              <span className="sb-acct-sep" role="separator" />
              <AcctRow
                icon={<LuLogOut size={16} />}
                label="Sign out"
                onClick={run(
                  () => void signOut({ callbackUrl: "/auth/signin" })
                )}
              />
            </div>,
            container
          )
        : null}
    </div>
  );
}
