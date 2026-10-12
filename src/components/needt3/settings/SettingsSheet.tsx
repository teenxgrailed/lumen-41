"use client";

import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

import { FiArrowUpRight, FiCheck, FiX } from "react-icons/fi";

import { usePlan } from "@/lib/needt3/hooks/plan";
import { useSettings } from "@/lib/needt3/hooks/settings";
import { priceStrings } from "@/lib/needt3/pricing";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { Sheet } from "../ctx/Sheet";
import type { MenuPlaceId } from "../phone/menu/places";
import { PhoneSettings } from "../phone/settings/PhoneSettings";
import { usePhoneUi } from "../root/phone-ui-context";
import { Avatar, initialsOf } from "../shell/Avatar";
import { AboutSection } from "./AboutSection";
import { AccountSection } from "./AccountSection";
import { AlertsSection } from "./AlertsSection";
import { AppearanceSection } from "./AppearanceSection";
import { DataSection } from "./DataSection";
import { DaySection } from "./DaySection";
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
  isPro,
  planInfo,
  sectionOf,
} from "./derive";

const SAVED_MS = 1700;
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

function Body({ section }: { section: SectionId }) {
  switch (section) {
    case "account":
      return <AccountSection />;
    case "plan":
      return <PlanSection />;
    case "general":
      return <GeneralSection />;
    case "appearance":
      return (
        <AppearanceSection
          onUpgrade={() => useNeedt3Ui.getState().openSettings("plan")}
        />
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
    case "data":
      return <DataSection />;
    case "about":
      return <AboutSection />;
  }
}

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
  const navRef = useRef<HTMLElement>(null);

  // Each opening starts on the section it was asked for.
  useEffect(() => {
    if (open) {
      setSection(sectionOf(want));
      setList(!want);
      setMenu(false);
      setPill(null);
    }
  }, [open, want]);

  useEffect(() => {
    if (!saved) return undefined;
    const id = window.setTimeout(() => setSaved(0), SAVED_MS);
    return () => window.clearTimeout(id);
  }, [saved]);

  const mark = useCallback(() => setSaved(Date.now()), []);
  const pick = useCallback((id: SectionId) => {
    setSection(id);
    setList(false);
    setMenu(false);
  }, []);
  const phonePage = useCallback(
    (id: SectionId | null) => (id ? pick(id) : setList(true)),
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
          page={list ? null : section}
          onPage={phonePage}
          saved={saved}
          menu={menu}
          onMenu={setMenu}
          pill={pill}
          onPill={setPill}
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
              <Avatar
                initials={initialsOf(name)}
                name={name}
                size={80}
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
            onClick={() => pick("plan")}
          >
            <span className="settings-layer">
              <span className="base-row">
                <span className="settings-px-calm">Needt</span>
              </span>
              <span className="settings-row-2">
                <span className="base-stack settings-px-calm-2">
                  <span className="settings-srow-text">
                    {kind === "free" ? "Free plan" : info.name}
                  </span>
                  <span className="settings-text">
                    {kind === "free"
                      ? `${P.trialDays} days free · no card`
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
            key={section}
            className="settings-enter scroll-inner settings-enter-2"
          >
            <Body section={section} />
          </div>
        </div>
      </Sheet>
    </MarkProvider>
  );
}
