"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

import {
  LuBell,
  LuCheck,
  LuChevronLeft,
  LuClock,
  LuCommand,
  LuCreditCard,
  LuDatabase,
  LuInfo,
  LuLayoutGrid,
  LuListChecks,
  LuPalette,
  LuSlidersHorizontal,
  LuTarget,
  LuUser,
} from "react-icons/lu";

import { useAlerts, useSchedule } from "@/lib/needt3/hooks/account";
import { useConnections } from "@/lib/needt3/hooks/connections";
import { usePlan } from "@/lib/needt3/hooks/plan";
import { useSettings } from "@/lib/needt3/hooks/settings";
import { priceStrings } from "@/lib/needt3/pricing";
import { ACCENTS } from "@/lib/needt3/theme";

import { useNeedt3Ui } from "@/store/needt3-ui";

import {
  type SectionId,
  isPro,
  planInfo,
  readPref,
} from "../../settings/derive";
import { initialsOf } from "../../shell/Avatar";
import { PkButton, PkGlyph, PkSheet, PkSkyPlate, pkCx } from "../kit";
import { type MenuPlaceId, menuTilesFrom, menuWord } from "../menu/places";
import { usePhoneOverlays } from "../overlays/store";
import { AccountPage, useSignOut } from "./AccountPage";
import { AppearancePage } from "./AppearancePage";
import { DayPage } from "./DayPage";
import { MenuPage } from "./MenuPage";
import { PlanPage } from "./PlanPage";
import {
  PS_LIST,
  PS_TITLES,
  type PsPageId,
  type PsRowId,
  alertsSummary,
  connectionsLine,
  daySummary,
  escAction,
  themeWord,
} from "./model";
import {
  AboutPage,
  AlertsPage,
  DataPage,
  FocusPage,
  GeneralPage,
  KeysPage,
  TasksPage,
} from "./pages";
import {
  PsGlyph,
  PsGroup,
  type PsPickSpec,
  PsPicker,
  PsProvider,
  PsRow,
  usePs,
} from "./parts";

const P = priceStrings();

const HUE = {
  blue: "var(--info)",
  accent: "var(--accent)",
  green: "var(--success)",
  red: "var(--destructive)",
  violet: "var(--pk-violet)",
  lav: "var(--v2p-lav)",
  ink: "var(--v2p-ink-2)",
} as const;

/** A page's icon and hue on the main list (phone-settings.jsx PS_PAGES). */
const PAGE_LOOK: Record<PsPageId, { icon: ReactNode; hue: string }> = {
  account: { icon: <LuUser size={16} />, hue: HUE.blue },
  plan: { icon: <LuCreditCard size={16} />, hue: HUE.lav },
  general: { icon: <LuSlidersHorizontal size={16} />, hue: HUE.ink },
  appearance: { icon: <LuPalette size={16} />, hue: HUE.violet },
  day: { icon: <LuClock size={16} />, hue: HUE.red },
  tasks: { icon: <LuListChecks size={16} />, hue: HUE.accent },
  focus: { icon: <LuTarget size={16} />, hue: HUE.green },
  alerts: { icon: <LuBell size={16} />, hue: HUE.red },
  menu: { icon: <LuLayoutGrid size={16} />, hue: HUE.lav },
  data: { icon: <LuDatabase size={16} />, hue: HUE.green },
  keys: { icon: <LuCommand size={16} />, hue: HUE.ink },
  about: { icon: <LuInfo size={16} />, hue: HUE.ink },
};

function PageBody({ id }: { id: PsPageId }) {
  switch (id) {
    case "account":
      return <AccountPage />;
    case "plan":
      return <PlanPage />;
    case "general":
      return <GeneralPage />;
    case "appearance":
      return <AppearancePage />;
    case "day":
      return <DayPage />;
    case "tasks":
      return <TasksPage />;
    case "focus":
      return <FocusPage />;
    case "alerts":
      return <AlertsPage />;
    case "menu":
      return <MenuPage />;
    case "keys":
      return <KeysPage />;
    case "data":
      return <DataPage />;
    case "about":
      return <AboutPage />;
  }
}

/**
 * The list: you (avatar, name, plan), the Pro plate on Free, then the pages.
 * It mounts only while the sheet is up, so the queries behind the summaries
 * (schedule, alerts, connections) and the sky wait for the first opening.
 */
function MainList({ go }: { go: (id: PsPageId) => void }) {
  const { upgrade, leave } = usePs();
  const session = useSession();
  const plan = usePlan();
  const settings = useSettings();
  const schedule = useSchedule();
  const alerts = useAlerts();
  const connections = useConnections();
  const theme = useNeedt3Ui((s) => s.theme);
  const accent = useNeedt3Ui((s) => s.accent);
  const signOut = useSignOut();

  const user = session.data?.user;
  const name = user?.name || user?.email?.split("@")[0] || "Account";
  const kind = plan.data?.kind ?? "free";
  const info = planInfo(kind);
  const pro = isPro(kind);
  const prefs = settings.data?.prefs;
  const conn = connectionsLine(connections.data);

  const sub = (id: PsPageId): string => {
    switch (id) {
      case "account":
        return user?.email ?? "Profile, sign out";
      case "plan":
        return info.name;
      case "general":
        return "Links, offline";
      case "appearance":
        return `${themeWord(theme)} · ${ACCENTS.find((a) => a.id === accent)?.label ?? "Blue"}`;
      case "day":
        return daySummary(schedule.data, settings.data?.weekStartDay);
      case "tasks":
        return `${readPref(prefs, "est")}-min estimate`;
      case "focus":
        return `${readPref(prefs, "len")}-min sessions`;
      case "alerts":
        return alertsSummary(alerts.data);
      case "menu":
        return menuTilesFrom(prefs).map(menuWord).join(" · ");
      case "data":
        return "Export, privacy";
      case "keys":
        return "With a keyboard";
      case "about":
        return "Terms, privacy";
    }
  };

  const row = (id: PsRowId) => {
    if (id === "connections")
      return (
        <PsRow
          key={id}
          glyph={<PkGlyph place="connections" size="s" />}
          title="Connections"
          out
          desc={
            conn.attention ? (
              <span className="ps-alert">
                <span className="pk-alert-dot" />
                {conn.attention} needs reconnecting
              </span>
            ) : conn.connected ? (
              `${conn.connected} connected`
            ) : (
              "Calendars, mail and tools"
            )
          }
          onOpen={() => leave("/connections")}
          data={{ "data-ps-connections": "" }}
        />
      );
    const look = PAGE_LOOK[id];
    return (
      <PsRow
        key={id}
        glyph={<PsGlyph icon={look.icon} hue={look.hue} />}
        title={PS_TITLES[id]}
        desc={sub(id)}
        onOpen={() => go(id)}
        data={{ "data-ps-open": id }}
      />
    );
  };

  return (
    <>
      <button
        type="button"
        className="ps-profile"
        onClick={() => go("account")}
        data-ps-profile=""
      >
        <span className="ps-avatar" aria-hidden="true">
          {user?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="ps-avatar-img" src={user.image} alt="" />
          ) : (
            initialsOf(name)
          )}
        </span>
        <span className="ps-profile-text">
          <span className="ps-profile-name">{name}</span>
          <span className="ps-profile-mail">{user?.email}</span>
        </span>
        <span className={pkCx("ps-badge", pro && "is-pro")} data-ps-tier={kind}>
          {info.badge}
        </span>
      </button>

      {pro ? null : (
        <PkSkyPlate
          as="section"
          className="ps-pro-plate"
          radius={26}
          data-ps-pro=""
        >
          <span className="ps-pro-head">
            <span className="ps-pro-word">Needt</span>
            <span className="ps-pro-mark">Pro</span>
          </span>
          <span className="ps-pro-line">
            {`Plan my day, the Time theme, every accent and connection. ${P.trialShort}.`}
          </span>
          <PkButton
            kind="primary"
            small
            onClick={() => upgrade()}
            data-ps-upgrade=""
          >
            Try Pro free
          </PkButton>
        </PkSkyPlate>
      )}

      {PS_LIST.map((g, i) => (
        <PsGroup key={i} title={g.title} hint={g.hint}>
          {g.rows.map(row)}
        </PsGroup>
      ))}
      <PsGroup>
        <PsRow
          title="Sign out"
          tone="link"
          chevron={false}
          onOpen={() => void signOut()}
          data={{ "data-ps-signout": "" }}
        />
      </PsGroup>
    </>
  );
}

/** The sheet body that scrolls the stage (PkSheet's `.pk-sheet-body`). */
const scrollerOf = (el: Element | null) =>
  el?.closest<HTMLElement>(".pk-sheet-body") ?? null;

export interface PhoneSettingsProps {
  open: boolean;
  onClose: () => void;
  /** The page on show; `null` is the list. Owned by the sheet above the face switch. */
  page: SectionId | null;
  onPage: (page: SectionId | null) => void;
  /** Changes each time a write lands; the header says "Saved" for a moment. */
  saved: number;
  /** The Menu page is on show (it has no desktop section). Owned above the face switch. */
  menu: boolean;
  onMenu: (on: boolean) => void;
  /** The Menu page's half-filled pill; null = what is saved. Owned above the face switch. */
  pill: MenuPlaceId[] | null;
  onPill: (pill: MenuPlaceId[] | null) => void;
}

/**
 * Settings on the phone (phone-settings.jsx `PsSettings`): the same sheet as
 * the desktop's, drawn as a PkSheet of pages. The list opens a page (a glass
 * back chip and the page's name replace "Settings"); Esc goes back before it
 * closes; a drag down closes from anywhere. Pickers are sheets of their own
 * over this one.
 *
 * Two faces, one state: which page is on show (`page`) and the "Saved" mark
 * live in `SettingsSheet`, which `PermanentHosts` mounts outside the
 * UI-dependent slot, so crossing 700 px keeps the page, the Menu page and
 * its half-filled pill. What stays here is the face's own and holds no data:
 * the open picker and the fold. Every control writes the moment it changes, so
 * a swap never loses or repeats a write.
 */
export function PhoneSettings({
  open,
  onClose,
  page,
  onPage,
  saved,
  menu,
  onMenu,
  pill,
  onPill,
}: PhoneSettingsProps) {
  const router = useRouter();
  const [live, setLive] = useState(open);
  if (open && !live) setLive(true);
  const [dir, setDir] = useState<"in" | "out" | null>(null);
  const [spec, setSpec] = useState<PsPickSpec | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const listY = useRef(0);
  const current: PsPageId | null = menu ? "menu" : page;

  const go = useCallback(
    (id: PsPageId) => {
      listY.current = scrollerOf(stage.current)?.scrollTop ?? 0;
      setDir("in");
      if (id === "menu") onMenu(true);
      else {
        onMenu(false);
        onPage(id);
      }
    },
    [onPage, onMenu]
  );
  const back = useCallback(() => {
    setDir("out");
    onMenu(false);
    onPill(null);
    onPage(null);
  }, [onPage, onMenu, onPill]);

  /* The page opens at its top; the list comes back where it was left. */
  useLayoutEffect(() => {
    const el = scrollerOf(stage.current);
    if (el) el.scrollTop = current ? 0 : listY.current;
  }, [current]);

  /* Esc on a page goes back first (the sheet's own Esc closes). Window
     capture, so it runs before the sheet's listener and stops it. */
  useEffect(() => {
    if (!open || !current) return undefined;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const act = escAction({
        open,
        onPage: true,
        pickerOpen: !!spec,
        otherSheetOpen: usePhoneOverlays.getState().paywall !== false,
      });
      if (act !== "back") return;
      e.stopPropagation();
      e.preventDefault();
      back();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [open, current, spec, back]);

  const ctx = useMemo(
    () => ({
      pick: setSpec,
      upgrade: (feature?: string) =>
        usePhoneOverlays.getState().openPaywall(feature),
      leave: (href: string) => {
        onClose();
        router.push(href);
      },
      pill,
      setPill: onPill,
    }),
    [onClose, router, pill, onPill]
  );

  const title = current ? (
    <span className="ps11-head">
      <button
        type="button"
        className="ps11-back"
        onClick={back}
        aria-label="Back to Settings"
        data-ps-back=""
      >
        <LuChevronLeft size={16} aria-hidden />
        <span>Settings</span>
      </button>
      <span className="ps11-title" data-ps-title={current}>
        {PS_TITLES[current]}
      </span>
    </span>
  ) : (
    "Settings"
  );

  return (
    <PsProvider value={ctx}>
      <PkSheet
        open={open}
        onClose={onClose}
        onShut={() => {
          setLive(false);
          setDir(null);
          setSpec(null);
        }}
        detents={[0.92]}
        label="Settings"
        className="ps11-sheet"
        bodyClass="ps11-body"
        title={title}
        meta={
          saved ? (
            <span key={saved} className="ps11-saved" role="status">
              <LuCheck size={13} aria-hidden />
              Saved
            </span>
          ) : null
        }
      >
        {live ? (
          <div
            ref={stage}
            key={current ?? "list"}
            className={pkCx(
              "ps11-stage",
              dir === "in" && current && "is-coming",
              dir === "out" && !current && "is-back"
            )}
            data-ps-root={current ?? "main"}
          >
            {current ? <PageBody id={current} /> : <MainList go={go} />}
          </div>
        ) : null}
      </PkSheet>
      <PsPicker spec={spec} onClose={() => setSpec(null)} />
    </PsProvider>
  );
}
