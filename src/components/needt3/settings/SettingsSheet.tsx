"use client";

import {
  type KeyboardEvent,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

import { FiArrowUpRight, FiCheck, FiX } from "react-icons/fi";

import { usePlan } from "@/lib/needt3/hooks/plan";
import { useSettings } from "@/lib/needt3/hooks/settings";
import { offersTrial } from "@/lib/needt3/paywall";
import { priceStrings } from "@/lib/needt3/pricing";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { Sheet } from "../ctx/Sheet";
import { Glyph, type GlyphName } from "../glyphs/Glyph";
import { openPaywall } from "../paywall";
import type { MenuPlaceId } from "../phone/menu/places";
import { PhoneSettings } from "../phone/settings/PhoneSettings";
import { usePhoneUi } from "../root/phone-ui-context";
import { PxBadge, PxSky } from "../scenes";
import { initialsOf } from "../shell/Avatar";
import { AboutSection } from "./AboutSection";
import { AccountSection } from "./AccountSection";
import { AlertsSection } from "./AlertsSection";
import { AppearanceSection } from "./AppearanceSection";
import { DataSection } from "./DataSection";
import { DaySection } from "./DaySection";
import {
  AppSection,
  IslandSection,
  MacFocusSection,
  SiriSection,
  WidgetsSection,
} from "./DesktopSections";
import { KeysSection } from "./KeysSection";
import { PlanSection } from "./PlanSection";
import { FocusSection, GeneralSection, TasksSection } from "./PrefSections";
import { MarkProvider } from "./SettingsContext";
import {
  NAV_FLAT,
  SECTION_TITLES,
  SETTINGS_NAV,
  type SectionId,
  accentFromPrefs,
  isDesktopSection,
  isPro,
  planInfo,
  sectionOf,
} from "./derive";
import { MeDisc } from "./kit";

const SAVED_MS = 1700;

/** The rail's row marks: the landing glyphs (SettingsScreen.jsx `NAV`). */
const NAV_GLYPHS: Record<string, GlyphName> = {
  account: "people",
  plan: "wallet",
  general: "settings",
  appearance: "tune",
  day: "planday",
  tasks: "tasks",
  focus: "focus",
  alerts: "bell",
  keys: "api",
  app: "devices",
  island: "island",
  mfocus: "focus-moon",
  widgets: "boards",
  siri: "spark",
  connections: "connect",
  data: "import",
  about: "help",
};
const P = priceStrings();

/**
 * Carries the saved look into the store once settings load, so the frame
 * paints the person's theme and accent on every page, not only after the
 * sheet has been opened. `UserSettings` is the source of truth.
 */
export function useHydrateLook() {
  const settings = useSettings();
  const setLook = useNeedt3Ui((s) => s.setLook);
  const data = settings.data;
  useEffect(() => {
    if (!data) return;
    setLook({ theme: data.theme, accent: accentFromPrefs(data.prefs) });
  }, [data, setLook]);
}

/** The sheet's entrance (`nx-sheet` 280ms) plus a little: the sky waits for it. */
const ENTRANCE_MS = 320;

/**
 * False on the opening render, true after `frames` animation frames (or `ms`
 * milliseconds when given) of the sheet being open; false again once it
 * closes. Opening Settings used to mount the section and start the plan
 * card's sky in the same frame the sheet began to slide in, which a WKWebView
 * paints as a stall. The frame the sheet draws first is now the cheap one.
 */
function useAfterOpen(open: boolean, { frames = 2, ms = 0 } = {}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!open) {
      setReady(false);
      return undefined;
    }
    if (ms > 0) {
      const id = window.setTimeout(() => setReady(true), ms);
      return () => window.clearTimeout(id);
    }
    let left = frames;
    let raf = 0;
    const tick = () => {
      left -= 1;
      if (left <= 0) setReady(true);
      else raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [open, frames, ms]);
  return ready;
}

/** One section. Memoised: the sheet re-renders for "Saved" and the pick, not for this. */
const Body = memo(function Body({ section }: { section: SectionId }) {
  switch (section) {
    case "account":
      return <AccountSection />;
    case "plan":
      return <PlanSection />;
    case "general":
      return <GeneralSection />;
    case "appearance":
      return (
        <AppearanceSection onUpgrade={(feature) => openPaywall(feature)} />
      );
    case "day":
      return <DaySection />;
    case "tasks":
      return <TasksSection />;
    case "focus":
      return <FocusSection />;
    case "alerts":
      return <AlertsSection />;
    case "keys":
      return <KeysSection />;
    case "app":
      return <AppSection />;
    case "island":
      return <IslandSection />;
    case "mfocus":
      return <MacFocusSection />;
    case "widgets":
      return <WidgetsSection />;
    case "siri":
      return <SiriSection />;
    case "data":
      return <DataSection />;
    case "about":
      return <AboutSection />;
  }
});

/**
 * Settings (SettingsScreen.jsx): a sheet over whatever page is open, opened
 * from the store (`openSettings(section)`, ⌘,, the account menu) or by a
 * `/settings#section` link. The rail is the table of contents; the right
 * column is one section at a time. Nothing is saved with a button.
 */
export function SettingsSheet() {
  useHydrateLook();
  const router = useRouter();
  const open = useNeedt3Ui((s) => s.settingsOpen);
  const want = useNeedt3Ui((s) => s.settingsSection);
  const close = useNeedt3Ui((s) => s.closeSettings);
  const session = useSession();
  const plan = usePlan();
  const ui = usePhoneUi();
  const [section, setSection] = useState<SectionId>("account");
  // The phone shows a list of sections before any one of them. `list` is that
  // state; it lives here, above the face switch, with `section`, so crossing
  // 700 px keeps where the person is (the desktop never shows the list).
  const [list, setList] = useState(true);
  // The phone's Menu page has no desktop section; its flag and the half-filled
  // pill sit here with the page, so a crossing keeps a pill being edited.
  const [menu, setMenu] = useState(false);
  const [pill, setPill] = useState<MenuPlaceId[] | null>(null);
  const [saved, setSaved] = useState(0);
  // The section body mounts two frames after the sheet, the sky after its
  // entrance (it is parked until then: no frames drawn while the sheet moves).
  const bodyReady = useAfterOpen(open, { frames: 2 });
  const skyReady = useAfterOpen(open, { ms: ENTRANCE_MS });
  const navRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // How far the open section is scrolled, kept here so the other face opens
  // the section where this one left it. Reset when the section changes.
  const sectionY = useRef(0);
  // The face the sheet was opened on, read once per opening (not a reason to
  // re-run the opening effect when the window crosses 700 px).
  const uiRef = useRef(ui);
  uiRef.current = ui;

  // Each opening starts on the section it was asked for. Opened on the
  // desktop, a section is on show from the start (the desktop has no list),
  // so the phone continues on that section, not on the list.
  useEffect(() => {
    if (open) {
      setSection(sectionOf(want));
      setList(!want && uiRef.current === "phone");
      sectionY.current = 0;
      setMenu(false);
      setPill(null);
    }
  }, [open, want]);

  // The desktop face opens the section at the height the phone left it.
  useLayoutEffect(() => {
    if (ui === "desktop" && open && panelRef.current) {
      panelRef.current.scrollTop = sectionY.current;
    }
  }, [ui, open, section, bodyReady]);

  useEffect(() => {
    if (!saved) return undefined;
    const id = window.setTimeout(() => setSaved(0), SAVED_MS);
    return () => window.clearTimeout(id);
  }, [saved]);

  const mark = useCallback(() => setSaved(Date.now()), []);
  const pick = useCallback((id: SectionId) => {
    setSection((was) => {
      if (was !== id) sectionY.current = 0;
      return id;
    });
    setList(false);
    setMenu(false);
    setPill(null);
  }, []);
  // On the phone, opening a page from the list is a fresh visit: it starts
  // at its top even when it is the section shown last. Only a 700 px
  // crossing carries the section's scroll over.
  const phonePage = useCallback(
    (id: SectionId | null) => {
      if (!id) {
        setList(true);
        return;
      }
      sectionY.current = 0;
      pick(id);
    },
    [pick]
  );

  const user = session.data?.user;
  const name = user?.name || user?.email?.split("@")[0] || "Account";
  const kind = plan.data?.kind ?? "free";
  const info = planInfo(kind);
  const pro = isPro(kind);

  const navKeys = (e: KeyboardEvent) => {
    const at = NAV_FLAT.indexOf(section);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      pick(NAV_FLAT[Math.min(at + 1, NAV_FLAT.length - 1)]);
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      pick(NAV_FLAT[Math.max(at - 1, 0)]);
    }
  };

  if (ui === "phone")
    return (
      <MarkProvider value={mark}>
        <PhoneSettings
          open={open}
          onClose={close}
          page={list || isDesktopSection(section) ? null : section}
          onPage={phonePage}
          saved={saved}
          menu={menu}
          onMenu={setMenu}
          pill={pill}
          onPill={setPill}
          pageY={sectionY}
        />
      </MarkProvider>
    );

  return (
    <MarkProvider value={mark}>
      <Sheet
        open={open}
        onClose={close}
        title="Settings"
        scrimClassName="settings-presentation nx-scrim"
        className="settings-settings settings-sheet nx-sheet"
        exitMs={170}
      >
        <nav
          ref={navRef}
          tabIndex={0}
          onKeyDown={navKeys}
          aria-label="Settings sections"
          className="scroll-inner settings-sections"
        >
          <button
            className="settings-stack settings-me"
            type="button"
            data-settings-me
            onClick={() => pick("account")}
            title="Open Account"
          >
            <span className="settings-span">
              <MeDisc
                initials={initialsOf(name)}
                name={name}
                size="lg"
                src={user?.image}
              />
              <span className="settings-tier" data-settings-tier>
                {info.badge}
              </span>
            </span>
            <span className="settings-me-text">
              <span className="settings-me-name">{name}</span>
              <span className="base-meta settings-account-row-span">
                {user?.email}
              </span>
            </span>
          </button>
          <button
            className="settings-plan"
            type="button"
            data-settings-plan={kind}
            data-px-scope
            onClick={() => pick("plan")}
          >
            <PxSky
              variant="d"
              scene="promo"
              intensity={0.9}
              horizon="none"
              parked={!skyReady}
            />
            <span className="settings-layer">
              <span className="base-row">
                <span className="px-display px-on-sky settings-px-calm">
                  Needt
                </span>
                <PxBadge>{kind === "lifetime" ? "Lifetime" : "Pro"}</PxBadge>
              </span>
              <span className="settings-row-2">
                <span className="px-on-sky base-stack settings-px-calm-2">
                  <span className="settings-srow-text">
                    {kind === "free" ? "Free plan" : info.name}
                  </span>
                  <span className="settings-text">
                    {kind === "free"
                      ? offersTrial(plan.data)
                        ? `${P.trialDays} days free · no card`
                        : P.plansShort
                      : kind === "lifetime"
                        ? "Pro for good."
                        : kind === "yearly"
                          ? `${P.yearly} / year`
                          : kind === "monthly"
                            ? `${P.monthly} / month`
                            : `From ${P.yearlyPerMonth}/mo`}
                  </span>
                </span>
                {pro ? null : (
                  <span className="nx-btn nx-btn-primary nx-btn-sm settings-btn">
                    See plans
                  </span>
                )}
              </span>
            </span>
          </button>
          {SETTINGS_NAV.map((g) => (
            <div className="base-stack settings-stack-2" key={g.items[0].id}>
              {g.group ? (
                <span className="settings-text-3">{g.group}</span>
              ) : null}
              {g.items.map((item) => {
                const on = !item.jump && section === item.id;
                const glyph = NAV_GLYPHS[item.id];
                return (
                  <button
                    className="settings-row-4 settings-nav-row"
                    key={item.id}
                    type="button"
                    data-settings-nav={item.id}
                    data-settings-jump={item.jump || undefined}
                    aria-current={on ? "true" : undefined}
                    title={
                      item.jump
                        ? `Opens ${item.name} — leaves Settings`
                        : undefined
                    }
                    onClick={() => {
                      if (item.jump) {
                        close();
                        router.push(item.jump);
                      } else pick(item.id as SectionId);
                    }}
                  >
                    <span className="settings-row-5">
                      {glyph ? <Glyph name={glyph} size={20} /> : null}
                    </span>
                    {item.name}
                    {item.jump ? (
                      <span
                        className="settings-nav-out"
                        aria-label="opens elsewhere"
                      >
                        <FiArrowUpRight size={13} aria-hidden />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="settings-stack-3">
          <header className="settings-row-6">
            <h2 className="settings-text-4">{SECTION_TITLES[section]}</h2>
            {saved ? (
              <span key={saved} className="saved-pop settings-saved-pop">
                <FiCheck size={12} aria-hidden />
                Saved
              </span>
            ) : null}
            <button
              className="settings-close-settings"
              type="button"
              aria-label="Close settings"
              onClick={close}
            >
              <FiX size={12} aria-hidden />
            </button>
          </header>
          <div
            id="settings-panel"
            ref={panelRef}
            key={section}
            onScroll={(e) => {
              sectionY.current = e.currentTarget.scrollTop;
            }}
            className="settings-enter scroll-inner settings-enter-2"
          >
            {bodyReady ? <Body section={section} /> : null}
          </div>
        </div>
      </Sheet>
    </MarkProvider>
  );
}
