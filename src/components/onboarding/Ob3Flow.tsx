"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { signIn } from "next-auth/react";
import Link from "next/link";

import "@/styles/onboarding/ob3-desk.css";
import "@/styles/onboarding/ob3.css";
import "@/styles/v3-entry.css";

import { BrandIcon } from "@/components/needt3/brand/BrandIcon";
import { Glyph, type GlyphName } from "@/components/needt3/glyphs/Glyph";

import { V3_FONT_CLASSES } from "@/lib/needt3/fonts";
import {
  type OnboardingAnswers,
  planTasks,
  rankedAreas,
  startingAnswers,
} from "@/lib/onboarding/answers";
import {
  AREAS,
  CATALOG_TASKS,
  RITUALS,
  WEEKDAY_SHORT,
  areaById,
} from "@/lib/onboarding/catalog";
import { dur, durH, hhmm } from "@/lib/onboarding/format";
import type { WeekPlan } from "@/lib/onboarding/plan";
import type { CommitResult } from "@/lib/onboarding/server";

import { Ob3Sky } from "./Ob3Sky";
import { DayList, Week } from "./Ob3Week";
import {
  checkoutAvailable,
  commitWeek,
  emailVerified,
  fetchPlan,
  publicSignupOpen,
  registerEmail,
  resendVerification,
  saveAnswersRemote,
  signInProviders,
  startCheckout,
  startGift,
} from "./ob3-api";
import {
  COUNTED3,
  DARK_STEPS,
  PHASES,
  PRICES,
  PRO_ADDS,
  STEPS3,
  type Step3,
  clampStepForSession,
  giftEndFromNow,
  isStep,
  longDate,
} from "./ob3-steps";
import {
  Bump,
  Check3,
  Count,
  Head,
  Mark3,
  Seg,
  Spin3,
  Stepper,
  Toggle,
  Typed,
  cx3,
} from "./ob3-ui";

/* Onboarding v3, look "Sky + board" (21.10.26): 18 screens. Ported 1:1 from the
   design's ob3-flow.jsx; class names keep the ob3- prefix. What the prototype
   faked is real here: the plan is the scheduling engine's, the account is a real
   sign-in, the gift is the 14-day Pro trial, the card is Creem's checkout. */

export interface Ob3Session {
  userId: string;
  verified: boolean;
  email: string | null;
}

type Acct = "apple" | "google" | "email" | null;
type PlanSel = "pro" | "life" | "free" | "none";

const DRAFT_KEY = "ob3-draft";

interface Draft {
  a: OnboardingAnswers;
  billing: "month" | "year";
  planSel: PlanSel;
  acct: Acct;
  giftEnd: string | null;
}

const readDraft = (): Draft | null => {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
};
const writeDraft = (d: Draft) => {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* private window: the flow still works, it just cannot survive a redirect */
  }
};

function emptyPlan(a: OnboardingAnswers): WeekPlan {
  const set = new Set(a.workdays);
  const days = [0, 1, 2, 3, 4, 5, 6].filter((d) => set.has(d) || a.weekends);
  return {
    tasks: [],
    weekStart: "",
    days: days.map((d) => ({
      day: d,
      short: WEEKDAY_SHORT[d],
      long: "",
      n: 0,
      mon: "",
    })),
    events: [],
    placed: [],
    left: [],
    stats: {
      eventCount: 0,
      freeBefore: 0,
      freeAfter: 0,
      planned: 0,
      lunches: 0,
      instances: 0,
      splitTasks: 0,
      maxRepeatPerDay: 0,
      byArea: {},
    },
    steps: [],
    range: {
      lo: Math.min(a.hours.start, a.weekends ? a.daysOff.start : 24),
      hi: Math.max(a.hours.end, a.weekends ? a.daysOff.end : 0),
    },
    source: "sample",
    calendarName: null,
  };
}

export function Ob3Flow({
  session,
  startStep,
}: {
  session: Ob3Session | null;
  startStep?: string;
}) {
  /* Read inside `go`, so a sign-up that just succeeded can move on before
     the next render; the server's session prop is only the starting value. */
  const signedIn = useRef(Boolean(session));
  const [k, setK] = useState(() => {
    const i = isStep(startStep) ? STEPS3.indexOf(startStep) : 0;
    return clampStepForSession(Math.max(0, i), signedIn.current);
  });
  const [dir, setDir] = useState(1);
  const [a, setA] = useState<OnboardingAnswers>(startingAnswers);
  const set = useCallback(
    (patch: Partial<OnboardingAnswers>) => setA((x) => ({ ...x, ...patch })),
    []
  );
  const [tab, setTab] = useState("work");
  const [draft, setDraft] = useState("");
  const [seed, setSeed] = useState(0);
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [planErr, setPlanErr] = useState<string | null>(null);
  const [think, setThink] = useState(0);
  const [view, setView] = useState<"week" | "list">("list");
  const [pick, setPick] = useState<string | null>(null);
  const [planSel, setPlanSel] = useState<PlanSel>("pro");
  const [billing, setBilling] = useState<"month" | "year">("year");
  const [acct, setAcct] = useState<Acct>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const [authBusy, setAuthBusy] = useState<string | null>(null);
  const [authErr, setAuthErr] = useState<string | null>(null);
  const [providers, setProviders] = useState<string[] | null>(null);
  const [signupOpen, setSignupOpen] = useState(true);
  const [resent, setResent] = useState(false);
  const [gift, setGift] = useState(false);
  const [giftState, setGiftState] = useState<"on" | "used" | "none">("on");
  const [giftEnd, setGiftEnd] = useState<Date>(giftEndFromNow);
  const [payOpen, setPayOpen] = useState<boolean | null>(null);
  const [paying, setPaying] = useState<"busy" | null>(null);
  const [payErr, setPayErr] = useState<string | null>(null);
  const [commit, setCommit] = useState<
    | { state: "run" }
    | { state: "ok"; r: CommitResult }
    | { state: "err"; msg: string }
  >({ state: "run" });
  const [commitTry, setCommitTry] = useState(0);
  const mainRef = useRef<HTMLElement | null>(null);

  const step: Step3 = STEPS3[k];
  const GIFT_END = longDate(giftEnd);

  /* A draft survives the sign-in redirect and the checkout return. */
  useEffect(() => {
    const d = readDraft();
    if (d && (isStep(startStep) ? STEPS3.indexOf(startStep) > 9 : false)) {
      setA(d.a);
      setBilling(d.billing);
      setPlanSel(d.planSel);
      setAcct(d.acct);
      if (d.giftEnd) setGiftEnd(new Date(d.giftEnd));
    }
    const q = new URLSearchParams(window.location.search).get("acct");
    if (q === "apple" || q === "google") setAcct(q);
    if (window.innerWidth >= 680) setView("list");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    writeDraft({ a, billing, planSel, acct, giftEnd: giftEnd.toISOString() });
  }, [a, billing, planSel, acct, giftEnd]);

  const tasks = useMemo(() => planTasks(a), [a]);
  const weekly = tasks.reduce((s, t) => s + t.minutes * t.rep, 0);
  const instCount = tasks.reduce((s, t) => s + t.rep, 0);
  const rankFull = useMemo(() => rankedAreas(a), [a]);
  const nm = a.name.trim().split(" ")[0];
  const connected = plan?.source === "calendar";

  const go = useCallback(
    (n: number) => {
      setDir(n > k ? 1 : -1);
      setPick(null);
      setK(
        clampStepForSession(
          Math.max(0, Math.min(STEPS3.length - 1, n)),
          signedIn.current
        )
      );
      if (mainRef.current) mainRef.current.scrollTop = 0;
    },
    [k]
  );
  const goTo = (s: Step3) => go(STEPS3.indexOf(s));
  const next = () => go(k + 1);
  const back = () =>
    go(
      step === "gift" || step === "verify" ? STEPS3.indexOf("account") : k - 1
    );

  const canNext =
    step === "card"
      ? !paying
      : step === "cats"
        ? a.areas.length > 0
        : step === "tasks"
          ? tasks.length > 0
          : step === "days"
            ? a.workdays.length > 0 && a.hours.end - a.hours.start >= 3
            : true;

  useEffect(() => {
    if (step === "tasks" && !a.areas.includes(tab) && a.areas[0])
      setTab(a.areas[0]);
  }, [step, a.areas, tab]);

  /* ── planning: the engine runs while the lines are revealed ── */
  const runPlan = useCallback(() => {
    let alive = true;
    setPlan(null);
    setPlanErr(null);
    fetchPlan(a, seed)
      .then((p) => alive && setPlan(p))
      .catch((e: Error) => alive && setPlanErr(e.message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, step === "thinking"]);
  useEffect(() => {
    if (step !== "thinking") return;
    setThink(0);
    const stop = runPlan();
    const ts = [1, 2, 3, 4, 5, 6, 7].map((n) =>
      setTimeout(() => setThink(n), 200 + n * 820)
    );
    return () => {
      stop();
      ts.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, seed]);
  useEffect(() => {
    if (step !== "thinking" || think < 7 || !plan) return;
    const t = setTimeout(() => goTo("week"), 1100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, think, plan]);
  /* Landing straight on a later screen: plan once, quietly. */
  useEffect(() => {
    if (!["week", "notify", "account"].includes(step) || plan) return;
    let alive = true;
    fetchPlan(a, seed)
      .then((p) => alive && setPlan(p))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, plan]);

  /* ── account ── */
  useEffect(() => {
    if (step !== "account") return;
    if (session) {
      setAcct((x) => x ?? "email");
      goTo(session.verified ? "gift" : "verify");
      return;
    }
    let alive = true;
    void signInProviders().then((p) => alive && setProviders(p));
    void publicSignupOpen().then((o) => alive && setSignupOpen(o));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const oauth = (id: "apple" | "google") => {
    setAuthBusy(id);
    setAuthErr(null);
    writeDraft({
      a,
      billing,
      planSel,
      acct: id,
      giftEnd: giftEnd.toISOString(),
    });
    void signIn(id, { callbackUrl: `/start?step=verify&acct=${id}` }).catch(
      () => {
        setAuthBusy(null);
        setAuthErr("Could not open the sign-in. Try again.");
      }
    );
  };
  const okMail = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email.trim());
  const emailSignUp = async () => {
    setAuthBusy("email");
    setAuthErr(null);
    try {
      await registerEmail(email.trim(), password, nm);
      const r = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });
      if (r?.error) throw new Error("Could not sign you in.");
      signedIn.current = true;
      setAcct("email");
      goTo("verify");
    } catch (e) {
      setAuthErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setAuthBusy(null);
    }
  };

  /* verify: Apple and Google come back confirmed; an email waits for its link */
  useEffect(() => {
    if (step !== "verify") return;
    let alive = true;
    if (acct === "apple" || acct === "google") {
      const t = setTimeout(() => goTo("gift"), 1700);
      return () => clearTimeout(t);
    }
    const poll = async () => {
      if (await emailVerified()) {
        if (alive) setTimeout(() => goTo("gift"), 900);
        return true;
      }
      return false;
    };
    const id = setInterval(async () => {
      if (await poll()) clearInterval(id);
    }, 3000);
    void poll();
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, acct]);

  /* gift: save the answers, start the 14 days (once, after the email is confirmed) */
  useEffect(() => {
    if (step !== "gift") return;
    setGift(false);
    let alive = true;
    void saveAnswersRemote(a).catch(() => undefined);
    void startGift().then((g) => {
      if (!alive) return;
      if (g.started) {
        setGiftState("on");
        setGiftEnd(new Date(g.endsAt));
      } else setGiftState(g.used ? "used" : "none");
    });
    const t = setTimeout(() => setGift(true), 900);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  /* card: ask whether checkout is open before offering a card */
  useEffect(() => {
    if (step !== "card") return;
    let alive = true;
    setPayOpen(null);
    void checkoutAvailable().then((o) => alive && setPayOpen(o));
    return () => {
      alive = false;
    };
  }, [step]);
  const checkout = async () => {
    setPaying("busy");
    setPayErr(null);
    writeDraft({ a, billing, planSel, acct, giftEnd: giftEnd.toISOString() });
    try {
      const url = await startCheckout(
        planSel === "life" ? "lifetime" : "pro",
        billing
      );
      window.location.assign(url);
    } catch (e) {
      setPaying(null);
      setPayErr(e instanceof Error ? e.message : "Could not open checkout.");
    }
  };

  /* opening: write the week for real, then land in the calendar */
  useEffect(() => {
    if (step !== "opening") return;
    let alive = true;
    setCommit({ state: "run" });
    const started = Date.now();
    commitWeek(a)
      .then((r) => {
        if (!alive) return;
        setCommit({ state: "ok", r });
        const wait = Math.max(0, 3200 - (Date.now() - started));
        setTimeout(() => {
          if (alive)
            window.location.assign(
              a.calendars.length ? "/connections" : "/calendar"
            );
        }, wait);
      })
      .catch(
        (e: Error) => alive && setCommit({ state: "err", msg: e.message })
      );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, commitTry]);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT") return;
      if (
        e.key === "Enter" &&
        canNext &&
        !["thinking", "opening", "verify", "card", "account"].includes(step)
      )
        onCta();
      if (e.key === "Escape" && k > 0 && step !== "opening") back();
    };
    window.addEventListener("keydown", kd);
    return () => window.removeEventListener("keydown", kd);
  });

  /* ── answers ── */
  const toggleIn = <T,>(arr: T[], v: T) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  const toggleCat = (id: string) => {
    if (a.areas.includes(id)) {
      set({ areas: a.areas.filter((c) => c !== id) });
      return;
    }
    set({
      areas: [...a.areas, id],
      picks: [
        ...a.picks,
        ...CATALOG_TASKS.filter(
          (t) => t.area === id && t.top && !a.picks.includes(t.id)
        ).map((t) => t.id),
      ],
    });
  };
  const addOwn = () => {
    const t = draft.trim();
    if (!t) return;
    const hm = t.match(/(\d+)\s*(h|hours?)\b/i);
    const mm = t.match(/(\d+)\s*(m|min|minutes?)\b/i);
    const minutes = hm ? +hm[1] * 60 : mm ? +mm[1] : 30;
    const rx = t.match(/(\d)\s*[x×]/i);
    const rep = rx ? +rx[1] : /every ?day|daily/i.test(t) ? 7 : 1;
    const title =
      t
        .replace(/\s*\d+\s*(h|hours?|m|min|minutes?)\b/i, "")
        .replace(/\s*\d\s*[x×]\s*(a |per )?(week|wk)?/i, "")
        .replace(/\s*(every ?day|daily)/i, "")
        .trim() || t;
    set({
      own: [
        ...a.own,
        {
          id: "own" + Date.now(),
          area: tab,
          title: title.slice(0, 120),
          minutes: Math.min(240, Math.max(5, minutes)),
          rep: Math.min(7, Math.max(1, rep)),
        },
      ],
    });
    setDraft("");
  };

  const ci = (COUNTED3 as readonly Step3[]).indexOf(step);
  const pickT = plan?.placed.find((p) => p.key === pick) ?? null;
  const shown = plan ?? emptyPlan(a);

  const H: Record<Step3, [string, string | null]> = {
    welcome: ["Your week, *planned* in two minutes", null],
    name: [
      "What should we *call* you?",
      "So the plan feels like yours. You can leave it empty.",
    ],
    cats: [
      `${nm ? nm + ", what" : "What"} fills your *week*?`,
      "Pick everything that takes your time. Each one brings its own tasks next.",
    ],
    tasks: [
      "Pick your *tasks*",
      "Two in each area are already on. Tap to add or remove, or type your own.",
    ],
    repeats: [
      "How often do they *repeat*?",
      "Set it once. Needt spreads them over the week so they never pile up on one day.",
    ],
    priority: [
      "What comes *first*?",
      "Tap in order. When the week is tight, these get the early slots.",
    ],
    days: [
      "Which days do you *work*?",
      "Work tasks stay on workdays. Personal ones can use the weekend.",
    ],
    rhythm: [
      "How do you like to *work*?",
      "This shapes where long tasks go and how full a day gets.",
    ],
    calendar: [
      "Bring your *calendar*",
      "Needt plans around what’s already booked. It reads events and never sends invites.",
    ],
    thinking: [
      "Building your *week*",
      "The same planner your account will use, on your answers.",
    ],
    week: [`${nm ? nm + ", your" : "Your"} week is *ready*`, null],
    notify: [
      "A nudge before *each* task?",
      "One notification when it matters. No marketing.",
    ],
    account: [
      `Save ${nm ? nm + "’s" : "your"} *week*`,
      "Make an account so the plan is still here tomorrow, on every device.",
    ],
    verify: [
      acct === "email" ? "Check your *inbox*" : "Email *confirmed*",
      acct === "email"
        ? `We sent a link to ${email || session?.email || "your email"}. Open it and this page moves on by itself.`
        : `${acct === "apple" ? "Apple" : "Google"} already checked it for us.`,
    ],
    gift: [
      "A gift for *you*",
      `Confirmed accounts get Pro free for ${PRICES.trialDays} days. Nothing is charged unless you choose a plan.`,
    ],
    plans: [
      "Keep Pro after the *gift*?",
      `Your gift runs until ${GIFT_END}. Pick what happens after, or decide later.`,
    ],
    card: [
      planSel === "life" ? "Lifetime, *once*" : "Add a *card*",
      planSel === "life"
        ? "One payment. Pro forever, plus Needt Budget."
        : `Nothing is charged today. Your gift runs until ${GIFT_END}, then Pro starts.`,
    ],
    opening: ["Opening your *week*", null],
  };

  const thinkLines = plan?.steps ?? [];

  let body: React.ReactNode = null;
  let cta: string | null = "Continue";
  let alt: React.ReactNode = null;
  let foot: React.ReactNode = null;
  let sec: React.ReactNode = null;

  if (step === "welcome") {
    cta = "Get started";
    alt = (
      <Link
        className="ob3-link"
        href="/auth/signin?callbackUrl=/start%3Fstep%3Dgift"
      >
        I already have an account
      </Link>
    );
    body = (
      <>
        <p className="ob3-sub">
          Tell Needt what fills your week. It puts every task into the free time
          around your calendar, and you see the plan before you make an account.
        </p>
        <div className="ob3-demo" aria-hidden="true">
          <div className="ob3-demo-day">
            <span className="ob3-demo-h">
              <b>Tuesday</b>
              <small>3 placed</small>
            </span>
            {(
              [
                ["09:00", "Deep work on the main project", "work", 1],
                ["11:00", "Team sync", null, 0],
                ["11:30", "Reply to emails", "work", 1],
                ["12:00", "Lunch", null, 0],
                ["14:00", "Client call", null, 0],
                ["18:00", "Gym", "fitness", 1],
              ] as const
            ).map(([at, t, c, task], i) => (
              <span
                key={t}
                className={cx3("ob3-demo-row", task ? "is-task" : "is-ev")}
                style={
                  { "--i": i, "--cc": c ? areaById(c)?.color : null } as never
                }
              >
                <small>{at}</small>
                <i />
                <b>{t}</b>
              </span>
            ))}
          </div>
          <div className="ob3-demo-chips">
            {["Work", "Fitness", "Languages", "Side business", "Home"].map(
              (t, i) => (
                <span key={t} style={{ "--i": i } as never}>
                  {t}
                </span>
              )
            )}
          </div>
        </div>
        <ul className="ob3-promise">
          {[
            "About two minutes",
            "No account until the end",
            "Change anything later",
          ].map((t, i) => (
            <li key={t} style={{ "--i": i } as never}>
              <Check3 />
              {t}
            </li>
          ))}
        </ul>
      </>
    );
  } else if (step === "name") {
    cta = nm ? `Hi, ${nm}` : "Skip";
    body = (
      <div className="ob3-name">
        <input
          autoFocus
          value={a.name}
          onChange={(e) => set({ name: e.target.value.slice(0, 30) })}
          onKeyDown={(e) => {
            if (e.key === "Enter") next();
          }}
          placeholder="Your first name"
          aria-label="Your first name"
        />
        <p className="ob3-note">
          {nm ? (
            <>We’ll use it on your plan: “{nm}’s week”.</>
          ) : (
            "Only you see it."
          )}
        </p>
      </div>
    );
  } else if (step === "cats") {
    body = (
      <div className="ob3-cats">
        {AREAS.map((c, i) => (
          <button
            type="button"
            key={c.id}
            className={cx3("ob3-cat", a.areas.includes(c.id) && "is-on")}
            style={{ "--i": i, "--cc": c.color } as never}
            onClick={() => toggleCat(c.id)}
            aria-pressed={a.areas.includes(c.id)}
          >
            <span className="ob3-cat-ic">
              <Glyph name={c.glyph as GlyphName} size={22} />
            </span>
            <b>{c.name}</b>
            <small>{c.sub}</small>
            <span className="ob3-cat-tick">
              {a.areas.includes(c.id) ? <Check3 s={11} /> : null}
            </span>
          </button>
        ))}
      </div>
    );
    foot = (
      <Bump k={a.areas.length}>
        {a.areas.length} area{a.areas.length === 1 ? "" : "s"}
      </Bump>
    );
    sec = (
      <button
        type="button"
        className="ob3-pill"
        disabled={!a.areas.length}
        onClick={() => set({ areas: [] })}
      >
        Deselect all
      </button>
    );
  } else if (step === "tasks") {
    const list = CATALOG_TASKS.filter((t) => t.area === tab);
    const c = areaById(tab) ?? AREAS[0];
    const nextArea = a.areas[a.areas.indexOf(tab) + 1];
    const ids = list.map((t) => t.id);
    const anyOn = ids.some((i) => a.picks.includes(i));
    body = (
      <>
        <div className="ob3-tabs" role="tablist">
          {a.areas.map((id) => {
            const n =
              CATALOG_TASKS.filter(
                (t) => t.area === id && a.picks.includes(t.id)
              ).length + a.own.filter((o) => o.area === id).length;
            return (
              <button
                type="button"
                role="tab"
                aria-selected={tab === id}
                key={id}
                className={tab === id ? "is-on" : ""}
                style={{ "--cc": areaById(id)?.color } as never}
                onClick={() => setTab(id)}
              >
                <i />
                {areaById(id)?.name}
                <span key={n} className="ob3-bump">
                  {n}
                </span>
              </button>
            );
          })}
        </div>
        <div
          key={tab}
          className="ob3-tasks"
          style={{ "--cc": c.color } as never}
        >
          {list.map((t, i) => (
            <button
              type="button"
              key={t.id}
              style={{ "--i": i } as never}
              className={cx3("ob3-task", a.picks.includes(t.id) && "is-on")}
              onClick={() => set({ picks: toggleIn(a.picks, t.id) })}
              aria-pressed={a.picks.includes(t.id)}
            >
              <span className="ob3-task-box">
                {a.picks.includes(t.id) ? <Check3 s={11} /> : null}
              </span>
              <b>{t.title}</b>
              <small>
                {dur(t.minutes)}
                {t.rep > 1 ? ` · ${t.rep}× a week` : ""}
              </small>
            </button>
          ))}
          {a.own
            .filter((o) => o.area === tab)
            .map((o) => (
              <button
                type="button"
                key={o.id}
                className="ob3-task is-on is-own"
                onClick={() => set({ own: a.own.filter((x) => x.id !== o.id) })}
                title="Remove"
              >
                <span className="ob3-task-box">
                  <Check3 s={11} />
                </span>
                <b>{o.title}</b>
                <small>
                  {dur(o.minutes)}
                  {o.rep > 1 ? ` · ${o.rep}× a week` : ""} · yours
                </small>
              </button>
            ))}
        </div>
        <div className="ob3-add">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addOwn();
            }}
            placeholder={`Add to ${c.name}, e.g. “Call the landlord 15 min”`}
            aria-label={"Add a task to " + c.name}
          />
          <button type="button" onClick={addOwn} disabled={!draft.trim()}>
            Add
          </button>
        </div>
        {nextArea ? (
          <button
            type="button"
            className="ob3-link sm"
            onClick={() => setTab(nextArea)}
          >
            Next: {areaById(nextArea)?.name} →
          </button>
        ) : null}
      </>
    );
    sec = (
      <button
        type="button"
        className="ob3-pill"
        onClick={() =>
          set({
            picks: anyOn
              ? a.picks.filter((i) => !ids.includes(i))
              : [...a.picks, ...ids],
          })
        }
      >
        {anyOn ? "Deselect all" : "Select all"}
      </button>
    );
    foot = (
      <Bump k={tasks.length + "-" + weekly}>
        {tasks.length} tasks · {durH(weekly / 60)} a week
      </Bump>
    );
  } else if (step === "repeats") {
    body = (
      <>
        <div className="ob3-reps">
          {tasks
            .filter((t) => !t.ritual)
            .map((t, i) => {
              const v = a.reps[t.id] ?? t.rep;
              return (
                <div
                  key={t.id}
                  className="ob3-rep"
                  style={{ "--i": i, "--cc": areaById(t.area)?.color } as never}
                >
                  <i />
                  <span>
                    <b>{t.title}</b>
                    <small>{dur(t.minutes)}</small>
                  </span>
                  <span className="ob3-rep-ctl">
                    <button
                      type="button"
                      onClick={() =>
                        set({ reps: { ...a.reps, [t.id]: Math.max(0, v - 1) } })
                      }
                      aria-label="Less often"
                    >
                      −
                    </button>
                    <b key={v} className="ob3-flip">
                      {v === 0 ? "off" : v === 7 ? "daily" : v + "×"}
                    </b>
                    <button
                      type="button"
                      onClick={() =>
                        set({ reps: { ...a.reps, [t.id]: Math.min(7, v + 1) } })
                      }
                      aria-label="More often"
                    >
                      +
                    </button>
                  </span>
                </div>
              );
            })}
        </div>
        <span className="ob3-label">
          Small rituals that keep a week on track
        </span>
        <div className="ob3-fixed">
          {RITUALS.map((r) => (
            <Toggle
              key={r.id}
              on={a.rituals.includes(r.id)}
              onChange={() => set({ rituals: toggleIn(a.rituals, r.id) })}
              label={`${r.title} · ${dur(r.minutes)}`}
              sub={r.sub}
            />
          ))}
        </div>
      </>
    );
    foot = (
      <Bump k={instCount}>
        {instCount} slots a week · {durH(weekly / 60)}
      </Bump>
    );
  } else if (step === "priority") {
    body = (
      <>
        <div className="ob3-rank">
          {a.areas.map((id, i) => {
            const r = a.rank.indexOf(id);
            const c = areaById(id);
            return (
              <button
                type="button"
                key={id}
                className={cx3("ob3-rank-it", r >= 0 && "is-on")}
                style={{ "--i": i, "--cc": c?.color } as never}
                onClick={() =>
                  set({
                    rank:
                      r >= 0 ? a.rank.filter((x) => x !== id) : [...a.rank, id],
                  })
                }
              >
                <span className="ob3-cat-ic">
                  <Glyph name={(c?.glyph ?? "tasks") as GlyphName} size={20} />
                </span>
                <b>{c?.name}</b>
                <small>
                  {durH(
                    tasks
                      .filter((t) => t.area === id)
                      .reduce((s, t) => s + t.minutes * t.rep, 0) / 60
                  )}{" "}
                  a week
                </small>
                <span key={r} className="ob3-rank-n">
                  {r >= 0 ? r + 1 : ""}
                </span>
              </button>
            );
          })}
        </div>
        <p className="ob3-note">
          {a.rank.length
            ? `Order: ${rankFull.map((c) => areaById(c)?.name).join(" → ")}`
            : "Nothing tapped? Needt keeps the order you picked them in."}
        </p>
      </>
    );
  } else if (step === "days") {
    body = (
      <div className="ob3-form">
        <div className="ob3-dayp" role="group" aria-label="Workdays">
          {WEEKDAY_SHORT.map((s, d) => (
            <button
              type="button"
              key={s}
              className={a.workdays.includes(d) ? "is-on" : ""}
              onClick={() => set({ workdays: toggleIn(a.workdays, d).sort() })}
              aria-pressed={a.workdays.includes(d)}
            >
              <b>{s.slice(0, 2)}</b>
            </button>
          ))}
        </div>
        <div className="ob3-field">
          <span>Workday hours</span>
          <div className="ob3-inline">
            <Stepper
              label="Workday starts"
              value={a.hours.start}
              onChange={(v) => set({ hours: { ...a.hours, start: v } })}
              min={5}
              max={a.hours.end - 3}
            />
            <i>to</i>
            <Stepper
              label="Workday ends"
              value={a.hours.end}
              onChange={(v) => set({ hours: { ...a.hours, end: v } })}
              min={a.hours.start + 3}
              max={23.5}
            />
          </div>
        </div>
        <Toggle
          on={a.weekends}
          onChange={(v) => set({ weekends: v })}
          label="Plan personal tasks on days off"
          sub="Gym, errands and calls can use the free days"
        />
        {a.weekends ? (
          <div className="ob3-field ob3-reveal">
            <span>Days off</span>
            <div className="ob3-inline">
              <Stepper
                label="Day off starts"
                value={a.daysOff.start}
                onChange={(v) => set({ daysOff: { ...a.daysOff, start: v } })}
                min={6}
                max={a.daysOff.end - 2}
              />
              <i>to</i>
              <Stepper
                label="Day off ends"
                value={a.daysOff.end}
                onChange={(v) => set({ daysOff: { ...a.daysOff, end: v } })}
                min={a.daysOff.start + 2}
                max={23.5}
              />
            </div>
          </div>
        ) : null}
      </div>
    );
    foot = (
      <Bump k={a.workdays.length + "" + a.weekends}>
        {a.workdays.length} workdays
        {a.weekends && a.workdays.length < 7
          ? ` + ${7 - a.workdays.length} off`
          : ""}{" "}
        · {durH((a.hours.end - a.hours.start) * a.workdays.length)} of work time
      </Bump>
    );
  } else if (step === "rhythm") {
    body = (
      <div className="ob3-form">
        <div className="ob3-field">
          <span>When you think best</span>
          <Seg
            value={a.focus}
            onChange={(v) => set({ focus: v })}
            options={[
              ["m", "Morning", "before 12"],
              ["a", "Afternoon", "12 to 17"],
              ["e", "Evening", "after 17"],
            ]}
          />
        </div>
        <div className="ob3-field">
          <span>Longest focus block</span>
          <Seg
            small
            value={a.maxBlock}
            onChange={(v) => set({ maxBlock: v })}
            options={[
              [45, "45 min"],
              [60, "1 h"],
              [90, "1 h 30"],
              [120, "2 h"],
            ]}
          />
        </div>
        <div className="ob3-field">
          <span>Gap after a meeting</span>
          <Seg
            small
            value={a.buffer}
            onChange={(v) => set({ buffer: v })}
            options={[
              [0, "None"],
              [10, "10 min"],
              [15, "15 min"],
              [30, "30 min"],
            ]}
          />
        </div>
        <Toggle
          on={a.lunch}
          onChange={(v) => set({ lunch: v })}
          label="Keep lunch free"
          sub="12:00 to 13:00 on every day that has it"
        />
      </div>
    );
  } else if (step === "calendar") {
    const rows = [
      ["google", "Google Calendar", "gcal", "Reads and writes events"],
      ["icloud", "iCloud Calendar", "ical", "With an app-specific password"],
      ["outlook", "Outlook", "ocal", "Microsoft 365 or Outlook.com"],
    ] as const;
    cta =
      a.calendars.length || connected ? "Continue" : "Use a sample calendar";
    body = (
      <>
        <div className="ob3-list">
          {rows.map(([id, t, b, s], i) => {
            const on = a.calendars.includes(id);
            return (
              <button
                type="button"
                key={id}
                className={cx3("ob3-row", on && "is-on")}
                style={{ "--i": i } as never}
                onClick={() => set({ calendars: toggleIn(a.calendars, id) })}
                aria-pressed={on}
              >
                <span className="ob3-row-art">
                  <BrandIcon id={b} size={38} />
                </span>
                <span className="ob3-row-t">
                  <b>{t}</b>
                  <small key={on ? "on" : "x"} className="ob3-fade">
                    {on ? "Connects right after you save your week" : s}
                  </small>
                </span>
                <span className={cx3("ob3-row-tick", on && "is-on")}>
                  {on ? <Check3 /> : null}
                </span>
              </button>
            );
          })}
        </div>
        <p className="ob3-note">
          {a.calendars.length
            ? "Your week below is planned on a sample calendar. Once the account exists you connect these in one tap, and Needt re-plans around the real events."
            : "No calendar? We’ll plan around a sample one so you can see how it works."}
        </p>
      </>
    );
  } else if (step === "thinking") {
    cta = null;
    body = (
      <>
        <div className="ob3-think-wrap">
          <Week
            plan={shown}
            phase={
              think >= 7
                ? 4
                : plan && think >= 2
                  ? 2
                  : plan && think >= 1
                    ? 1
                    : 0
            }
          />
          <ol className="ob3-think">
            {Array.from({ length: 7 }).map((_, i) => {
              const line = thinkLines[i];
              return (
                <li
                  key={i}
                  className={cx3(
                    think > i + 1 && line && "is-done",
                    think === i + 1 || (think > i + 1 && !line) ? "is-now" : ""
                  )}
                >
                  <span className="ob3-think-ic">
                    {think > i + 1 && line ? (
                      <Check3 />
                    ) : think >= i + 1 ? (
                      <Spin3 />
                    ) : null}
                  </span>
                  <span>
                    <b>
                      {line
                        ? line[0]
                        : [
                            "Reading your calendar",
                            "Finding free time",
                            "Keeping lunch free",
                            "Ordering by what matters",
                            "Placing long work",
                            "Spreading the repeats",
                            "Placing your tasks",
                          ][i]}
                    </b>
                    <small>
                      {think >= i + 1 && line ? (
                        <Typed key={i + "-" + seed} text={line[1]} />
                      ) : (
                        " "
                      )}
                    </small>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        {planErr ? (
          <p className="ob3-err" role="alert">
            {planErr}
          </p>
        ) : null}
        <div className="ob3-bar">
          <i style={{ width: Math.min(100, (think / 7) * 100) + "%" }} />
        </div>
      </>
    );
  } else if (step === "week") {
    cta = "Looks good";
    const again = () => {
      setSeed(seed + 1);
      goTo("thinking");
    };
    alt = (
      <button
        type="button"
        className="ob3-link ob3-alt-reshuffle"
        onClick={again}
      >
        Plan it differently
      </button>
    );
    sec = (
      <button type="button" className="ob3-pill" onClick={again}>
        Shuffle
      </button>
    );
    const cs = Object.entries(shown.stats.byArea).sort((x, y) => y[1] - x[1]);
    body = (
      <>
        <div className="ob3-stats">
          <span style={{ "--i": 0 } as never}>
            <b>
              <Count
                to={
                  new Set(
                    shown.placed.map((p) =>
                      p.key.split("~").slice(0, 2).join("~")
                    )
                  ).size
                }
              />
            </b>
            <small>tasks placed</small>
          </span>
          <span style={{ "--i": 1 } as never}>
            <b>
              <Count to={shown.stats.planned} fmt={durH} />
            </b>
            <small>planned</small>
          </span>
          <span style={{ "--i": 2 } as never}>
            <b>
              <Count to={shown.stats.freeAfter} fmt={durH} />
            </b>
            <small>still free</small>
          </span>
        </div>
        <div className="ob3-legend">
          {cs.map(([c, mins], i) => (
            <span
              key={c}
              style={{ "--cc": areaById(c)?.color, "--i": i } as never}
            >
              <i />
              {areaById(c)?.name}
              <small>{durH(mins / 60)}</small>
            </span>
          ))}
        </div>
        <Seg
          small
          value={view}
          onChange={setView}
          options={[
            ["week", "Week"],
            ["list", "Day by day"],
          ]}
        />
        {view === "week" ? (
          <Week plan={shown} phase={5} pick={pick} onPick={setPick} />
        ) : (
          <DayList plan={shown} pick={pick} onPick={setPick} />
        )}
        <p className={cx3("ob3-why", pickT && "is-on")} aria-live="polite">
          {pickT ? (
            <>
              <i style={{ "--cc": areaById(pickT.area)?.color } as never} />
              <b>{pickT.title}</b> ·{" "}
              {shown.days.find((d) => d.day === pickT.day)?.short}{" "}
              {hhmm(pickT.start)}–{hhmm(pickT.end)}. {pickT.why}
            </>
          ) : shown.left.length ? (
            `${shown.left.length} didn’t fit and wait for the week after. Tap any task to see why it went where it did.`
          ) : (
            "Tap any task to see why it went where it did. Nothing is locked."
          )}
        </p>
      </>
    );
  } else if (step === "notify") {
    const f = shown.placed[0];
    cta = "Turn on reminders";
    alt = (
      <button type="button" className="ob3-link" onClick={next}>
        Not now
      </button>
    );
    body = (
      <>
        <div className="ob3-phone-n" aria-hidden="true">
          <span className="ob3-lock-t">
            {f
              ? hhmm(Math.max(0, f.start - (a.reminders === "5" ? 5 / 60 : 0)))
              : "08:55"}
          </span>
          <span className="ob3-lock-d">
            {f
              ? shown.days.find((d) => d.day === f.day)?.long || "Monday"
              : "Monday"}
          </span>
          <div key={a.reminders} className="ob3-notif">
            <Mark3 size={34} />
            <span>
              <b>
                {a.reminders === "brief"
                  ? `${nm ? nm + ", today" : "Today"}: ${shown.placed.filter((p) => p.day === (f ? f.day : 0)).length} tasks`
                  : f
                    ? f.title
                    : "Reply to emails"}
              </b>
              <small>
                {a.reminders === "brief"
                  ? `first at ${f ? hhmm(f.start) : "09:00"}`
                  : a.reminders === "0"
                    ? "Starting now · " + (f ? dur(f.minutes) : "30 min")
                    : "In 5 min · " + (f ? dur(f.minutes) : "30 min")}
              </small>
            </span>
            <em>now</em>
          </div>
        </div>
        <Seg
          value={a.reminders}
          onChange={(v) => set({ reminders: v })}
          options={[
            ["5", "5 min before"],
            ["0", "When it starts"],
            ["brief", "Morning plan only"],
          ]}
        />
      </>
    );
  } else if (step === "account") {
    cta = null;
    const has = (id: string) => (providers ?? []).includes(id);
    body = (
      <div className="ob3-auth">
        <div className="ob3-save" aria-hidden="true">
          <span>
            <b>{nm ? nm + "’s week" : "Your week"}</b>
            <small>
              {shown.placed.length} blocks · {a.areas.length} areas ·{" "}
              {shown.days.length} days
            </small>
          </span>
          <span className="ob3-save-dots">
            {shown.days.map((d) => (
              <i
                key={d.day}
                style={
                  {
                    "--h": Math.min(
                      1,
                      shown.placed.filter((p) => p.day === d.day).length / 6
                    ),
                  } as never
                }
              />
            ))}
          </span>
        </div>
        {has("apple") ? (
          <button
            type="button"
            className="ob3-sso apple"
            onClick={() => oauth("apple")}
            disabled={!!authBusy}
          >
            {authBusy === "apple" ? (
              <Spin3 />
            ) : (
              <svg
                viewBox="0 0 17 20"
                width="16"
                height="18"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M14.1 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.3-.9C3.7 4.8 2.1 5.8 1.2 7.3c-1.8 3.2-.5 7.9 1.3 10.4.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.8-1-2.8-4.3zM11.6 3c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.1.1 2.3-.6 3-1.5z" />
              </svg>
            )}
            Continue with Apple
          </button>
        ) : null}
        {has("google") ? (
          <button
            type="button"
            className="ob3-sso"
            onClick={() => oauth("google")}
            disabled={!!authBusy}
          >
            {authBusy === "google" ? (
              <Spin3 />
            ) : (
              <BrandIcon id="google" size={18} />
            )}
            Continue with Google
          </button>
        ) : null}
        {signupOpen ? (
          emailOpen ? (
            <div className="ob3-mailcol ob3-reveal">
              <input
                autoFocus
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="Email"
                autoComplete="email"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && okMail && password.length >= 8)
                    void emailSignUp();
                }}
                placeholder="Password, 8 characters or more"
                aria-label="Password"
                autoComplete="new-password"
              />
              <button
                type="button"
                className="ob3-sso"
                disabled={!okMail || password.length < 8 || !!authBusy}
                onClick={() => void emailSignUp()}
              >
                {authBusy === "email" ? <Spin3 /> : "Create account"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="ob3-sso"
              onClick={() => setEmailOpen(true)}
              disabled={!!authBusy}
            >
              <Glyph name="mail" size={18} />
              Continue with email
            </button>
          )
        ) : (
          <p className="ob3-note">
            New accounts are closed for now. If you already have one, sign in.
          </p>
        )}
        {authErr ? (
          <p className="ob3-err" role="alert">
            {authErr}
          </p>
        ) : null}
        <p className="ob3-note">
          By continuing you agree to the <Link href="/terms">Terms</Link> and{" "}
          <Link href="/privacy">Privacy notice</Link>.
        </p>
      </div>
    );
  } else if (step === "verify") {
    cta = null;
    body =
      acct === "email" ? (
        <div className="ob3-verify ob3-wait">
          <div className="ob3-browser is-wait">
            <span className="ob3-browser-ic">
              <Spin3 />
            </span>
            <span>
              <b>Waiting for your link</b>
              <small>
                Open the email from Needt on any device. This page moves on when
                it’s confirmed.
              </small>
            </span>
          </div>
          <p className="ob3-note" role="status">
            {resent ? "Sent again. Check spam if it doesn’t show up." : null}
          </p>
          <span className="ob3-row2">
            <button
              type="button"
              className="ob3-link sm"
              onClick={() =>
                void resendVerification()
                  .then(() => setResent(true))
                  .catch(() =>
                    setAuthErr("Could not resend. Try again in a minute.")
                  )
              }
            >
              Send it again
            </button>
            <button
              type="button"
              className="ob3-link sm"
              onClick={() => goTo("account")}
            >
              Use another email
            </button>
          </span>
          {authErr ? (
            <p className="ob3-err" role="alert">
              {authErr}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="ob3-verified">
          <span className="ob3-seal">
            <Check3 s={34} />
          </span>
          <p className="ob3-note">
            {acct === "apple"
              ? "Signed in with Apple"
              : "Signed in with Google"}
          </p>
        </div>
      );
  } else if (step === "gift") {
    cta = gift ? "See what’s in Pro" : null;
    body = (
      <div
        className={cx3("ob3-gift", gift && "is-open")}
        onClick={() => setGift(true)}
      >
        <div className="ob3-box" aria-hidden="true">
          <i className="lid" />
          <i className="body" />
          <i className="rib-v" />
          <i className="rib-h" />
          <i className="bow" />
        </div>
        <div className="ob3-ticket" aria-live="polite">
          <span className="ob3-ticket-k">On us</span>
          <b>{PRICES.trialDays} days of Pro</b>
          <small>
            {giftState === "on"
              ? `Already on · until ${GIFT_END}`
              : giftState === "used"
                ? "Already used on this email"
                : "Couldn’t start it just now"}
          </small>
          <ul>
            {[
              "Unlimited auto-planning",
              "Every calendar",
              "The Needt agent",
            ].map((t) => (
              <li key={t}>
                <Check3 />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <span className="ob3-confetti" aria-hidden="true">
          {Array.from({ length: 18 }).map((_, i) => (
            <i
              key={i}
              style={
                {
                  "--a": i * 20 + "deg",
                  "--d": (i % 6) * 40 + "ms",
                  "--c": [
                    "#5b4ee6",
                    "#e5484d",
                    "#f0a020",
                    "#1f9d8a",
                    "#0ea5e9",
                    "#d6409f",
                  ][i % 6],
                } as never
              }
            />
          ))}
        </span>
      </div>
    );
  } else if (step === "plans") {
    const yr = billing === "year";
    cta =
      planSel === "free"
        ? "Free after the gift"
        : planSel === "life"
          ? `Lifetime · ${PRICES.lifetime}`
          : "Keep Pro · add card";
    alt = (
      <button
        type="button"
        className="ob3-link xs"
        onClick={() => {
          setPlanSel("none");
          goTo("opening");
        }}
      >
        Continue without a subscription
      </button>
    );
    body = (
      <>
        <div className="ob3-giftbar">
          <span className="ob3-giftbar-ic">
            <Glyph name="gift" size={18} />
          </span>
          <span>
            <b>
              {giftState === "on"
                ? `Gift active: Pro until ${GIFT_END}`
                : "Pick a plan"}
            </b>
            <small>
              {giftState === "on"
                ? "Whatever you pick, nothing is charged before then."
                : "Pro starts when you add a card."}
            </small>
          </span>
        </div>
        <Seg
          small
          value={billing}
          onChange={setBilling}
          options={[
            ["month", "Monthly"],
            ["year", `Yearly · −${PRICES.save}%`],
          ]}
        />
        <button
          type="button"
          className={cx3("ob3-pro", planSel === "pro" && "is-on")}
          onClick={() => setPlanSel("pro")}
          aria-pressed={planSel === "pro"}
        >
          <span className="ob3-pro-top">
            <span className="ob3-radio" />
            <b>Needt</b>
            <em>PRO</em>
            <span className="ob3-pro-tag">Most picked</span>
          </span>
          <span className="ob3-pro-price">
            {yr ? <s>{PRICES.month}</s> : null}
            <strong key={billing} className="ob3-flip">
              {yr ? PRICES.yearPerMonth : PRICES.month}
            </strong>
            <small>/ month</small>
          </span>
          <small className="ob3-pro-bill">
            {yr
              ? `Billed ${PRICES.year} yearly · save ${PRICES.save}%`
              : "Billed monthly · cancel any time"}
          </small>
          <ul className="ob3-adds">
            {PRO_ADDS.map(([g, t, d], i) => (
              <li key={t} style={{ "--i": i } as never}>
                <span className="ob3-adds-ic">
                  <Glyph name={g as GlyphName} size={18} />
                </span>
                <span>
                  <b>{t}</b>
                  <small>{d}</small>
                </span>
              </li>
            ))}
          </ul>
          <span className="ob3-pro-you">
            For your week: {shown.stats.instances} tasks auto-planned every
            week. Free stops at {PRICES.freeTasks} a month.
          </span>
        </button>
        <button
          type="button"
          className={cx3("ob3-alt", planSel === "life" && "is-on")}
          onClick={() => setPlanSel("life")}
          aria-pressed={planSel === "life"}
        >
          <span className="ob3-radio" />
          <span>
            <b>Lifetime</b>
            <small>
              Pro forever + Needt Budget · first {PRICES.seats} buyers
            </small>
          </span>
          <strong>
            {PRICES.lifetime}
            <small> once</small>
          </strong>
        </button>
        <button
          type="button"
          className={cx3("ob3-alt", planSel === "free" && "is-on")}
          onClick={() => setPlanSel("free")}
          aria-pressed={planSel === "free"}
        >
          <span className="ob3-radio" />
          <span>
            <b>Free</b>
            <small>
              {PRICES.freeCalendars} calendar · {PRICES.freeTasks} auto-planned
              tasks a month
            </small>
          </span>
          <strong>$0</strong>
        </button>
        <p className="ob3-note">
          Prices in USD. VAT is added at checkout where it applies.
        </p>
      </>
    );
  } else if (step === "card") {
    const life = planSel === "life";
    const yr = billing === "year";
    cta =
      payOpen === false ? "Continue" : paying ? null : "Continue to checkout";
    alt = paying ? null : (
      <button
        type="button"
        className="ob3-link xs"
        onClick={() => {
          setPlanSel("none");
          goTo("opening");
        }}
      >
        Continue without a subscription
      </button>
    );
    body = (
      <div className="ob3-pay">
        <div className="ob3-sum">
          <span>
            <b>
              {life
                ? "Needt Lifetime"
                : `Needt Pro · ${yr ? "yearly" : "monthly"}`}
            </b>
            <small>
              {life
                ? "One payment"
                : `Then ${yr ? PRICES.year + " a year" : PRICES.month + " a month"}`}
            </small>
          </span>
          <span className="ob3-sum-r">
            <small>Today</small>
            <strong>{life ? PRICES.lifetime : "$0"}</strong>
          </span>
        </div>
        {!life ? (
          <div className="ob3-sum-tl">
            <span>
              <i className="on" />
              Today · $0
            </span>
            <span>
              <i />
              {GIFT_END} · {yr ? PRICES.year : PRICES.month}
            </span>
          </div>
        ) : null}
        <div className={cx3("ob3-browser", paying === "busy" && "is-wait")}>
          <span className="ob3-browser-ic">
            {paying === "busy" ? <Spin3 /> : <Glyph name="wallet" size={22} />}
          </span>
          <span>
            <b>
              {payOpen === false
                ? "Checkout opens soon"
                : paying === "busy"
                  ? "Taking you to checkout…"
                  : "Checkout opens in a secure window"}
            </b>
            <small>
              {payOpen === false
                ? `Your gift stays on until ${GIFT_END}. We’ll email you before it ends, and you can pick a plan any time in Settings.`
                : "Apple Pay, cards and PayPal, by Creem. Needt never sees your card."}
            </small>
          </span>
        </div>
        {payErr ? (
          <p className="ob3-err" role="alert">
            {payErr}
          </p>
        ) : null}
        <p className="ob3-note">
          {life
            ? "Charged now. Refund terms are on the checkout page."
            : `Cancel any time before ${GIFT_END} and nothing is charged.`}
        </p>
      </div>
    );
  } else if (step === "opening") {
    cta = null;
    const r = commit.state === "ok" ? commit.r : null;
    const lines = r
      ? [
          "Saving your answers",
          `Writing ${r.tasks} tasks into next week`,
          planSel === "life"
            ? "Lifetime checkout done"
            : planSel === "pro"
              ? `Pro is set, first charge ${GIFT_END}`
              : giftState === "on"
                ? `Gift on: Pro until ${GIFT_END}`
                : "Free plan on",
          "Opening Calendar on Week",
        ]
      : [];
    body = (
      <div className="ob3-open">
        <span className="ob3-open-mark">
          <Mark3 size={96} />
          <i />
          <i />
        </span>
        {commit.state === "err" ? (
          <>
            <p className="ob3-err" role="alert">
              {commit.msg}
            </p>
            <button
              type="button"
              className="ob3-link"
              onClick={() => setCommitTry((n) => n + 1)}
            >
              Try again
            </button>
          </>
        ) : (
          <ul>
            {lines.map((t, i) => (
              <li key={t} style={{ "--i": i } as never}>
                <Check3 />
                {t}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  function onCta() {
    if (step === "plans" && planSel === "free") {
      goTo("opening");
      return;
    }
    if (step === "card") {
      if (payOpen === false) {
        setPlanSel("none");
        goTo("opening");
        return;
      }
      void checkout();
      return;
    }
    next();
  }

  const dark = DARK_STEPS.includes(step);
  const sub = H[step][1];
  return (
    <div
      className={`needt-v3 ${V3_FONT_CLASSES}`}
      data-theme="light"
      style={{ display: "contents" }}
    >
      <div className="ob3-host">
        <div
          className={cx3("ob3", "look-desk", dark ? "is-dark" : "is-light")}
          data-step={step}
        >
          <Ob3Sky />
          <header className="ob3-top">
            <span className="ob3-brand">
              <Mark3 size={28} />
              <b>Needt</b>
            </span>
            <span className="ob3-prog">
              {ci >= 0 ? (
                <>
                  <span className="ob3-prog-bar">
                    <i
                      style={{
                        width: ((ci + 1) / COUNTED3.length) * 100 + "%",
                      }}
                    />
                  </span>
                  <small>
                    {ci + 1} of {COUNTED3.length}
                  </small>
                </>
              ) : null}
            </span>
            <nav className="ob3-phases" aria-label="Setup">
              {PHASES.map(([name, ids], pi) => {
                const at = ids.indexOf(step);
                const done =
                  PHASES.slice(pi + 1).some(([, l]) => l.includes(step)) ||
                  step === "opening";
                const fill = done ? 1 : at >= 0 ? (at + 1) / ids.length : 0;
                return (
                  <button
                    type="button"
                    key={name}
                    className={cx3(
                      "ob3-ph",
                      at >= 0 && "is-now",
                      done && "is-done"
                    )}
                    disabled={!done || step === "opening"}
                    onClick={() => done && goTo(ids[0])}
                  >
                    <span className="ob3-ph-t">
                      {done ? <Check3 s={11} /> : <em>{pi + 1}</em>}
                      {name}
                    </span>
                    <span className="ob3-ph-bar">
                      <i style={{ width: fill * 100 + "%" }} />
                    </span>
                  </button>
                );
              })}
            </nav>
            <span className="ob3-tools">
              {ci >= 0 && ci < 8 ? (
                <button
                  type="button"
                  className="ob3-link sm"
                  onClick={() => goTo("thinking")}
                >
                  Skip
                </button>
              ) : null}
            </span>
          </header>
          <main className="ob3-main" ref={mainRef}>
            <div
              key={step + "-" + seed}
              className={cx3("ob3-stage", dir > 0 ? "fwd" : "bwd", "s-" + step)}
            >
              {step === "welcome" ? (
                <span className="ob3-hero-mark">
                  <Mark3 size={64} />
                </span>
              ) : null}
              {step === "thinking" ? (
                <span className="ob3-halo" aria-hidden="true">
                  <Mark3 size={52} />
                  <i />
                  <i />
                  <i />
                </span>
              ) : null}
              <Head text={H[step][0]} />
              {sub ? <p className="ob3-sub">{sub}</p> : null}
              <div className="ob3-body">{body}</div>
            </div>
          </main>
          <footer className={cx3("ob3-foot", !cta && !alt && "is-empty")}>
            {foot ? <span className="ob3-foot-info">{foot}</span> : null}
            {k > 0 && !["thinking", "opening", "verify"].includes(step) ? (
              <button
                type="button"
                className="ob3-back"
                onClick={back}
                aria-label="Back"
              >
                <svg
                  viewBox="0 0 20 20"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 4l-6 6 6 6" />
                </svg>
                <span className="ob3-back-t">Back</span>
              </button>
            ) : (
              <span className="ob3-back-sp" />
            )}
            <span className="ob3-foot-c">
              <span className="ob3-foot-row">
                {sec ? <span className="ob3-sec">{sec}</span> : null}
                {cta ? (
                  <button
                    type="button"
                    className="ob3-cta"
                    onClick={onCta}
                    disabled={!canNext}
                  >
                    <span key={cta} className="ob3-fade">
                      {cta}
                    </span>
                    <svg
                      viewBox="0 0 20 20"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 10h10M11 5l5 5-5 5" />
                    </svg>
                  </button>
                ) : null}
              </span>
              {alt}
            </span>
            <span />
          </footer>
        </div>
      </div>
    </div>
  );
}
