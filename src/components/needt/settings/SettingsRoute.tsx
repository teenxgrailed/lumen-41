"use client";

import * as React from "react";

import Link from "next/link";

import { LuSettings, LuX } from "react-icons/lu";

import { useTheme } from "@/components/providers/ThemeProvider";
import { useAppSession } from "@/components/providers/app-session-context";
import { AIAssistantSettings } from "@/components/settings/AIAssistantSettings";
import { AccountManager } from "@/components/settings/AccountManager";
import { AccountSettings } from "@/components/settings/AccountSettings";
import { AutoScheduleSettings } from "@/components/settings/AutoScheduleSettings";
import { BillingSettings } from "@/components/settings/BillingSettings";
import { BookingSettings } from "@/components/settings/BookingSettings";
import { CalendarSettings } from "@/components/settings/CalendarSettings";
import { ConnectorSettings } from "@/components/settings/ConnectorSettings";
import { CustomizationSettings } from "@/components/settings/CustomizationSettings";
import { DataSettings } from "@/components/settings/DataSettings";
import { DesktopSettings } from "@/components/settings/DesktopSettings";
import { ImportExportSettings } from "@/components/settings/ImportExportSettings";
import { IntegrationSettings } from "@/components/settings/IntegrationSettings";
import { NotificationSettings } from "@/components/settings/NotificationSettings";
import { OnboardingChecklist } from "@/components/settings/OnboardingChecklist";
import { ReportBugDialog } from "@/components/settings/ReportBugDialog";
import { ScheduleSettings } from "@/components/settings/ScheduleSettings";
import { SettingsPanelBoundary } from "@/components/settings/SettingsPanelBoundary";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { TaskDefaultsSettings } from "@/components/settings/TaskDefaultsSettings";
import { UserSettings } from "@/components/settings/UserSettings";
import { WorkspaceSettings } from "@/components/settings/WorkspaceSettings";

import { signOutOfNeedt } from "@/lib/auth/client-sign-out";
import {
  type CalendarConnectionNotice,
  calendarConnectionNotice,
} from "@/lib/calendar-connection-status";
import { resolveThemeMode } from "@/lib/theme";

import { useSettingsStore } from "@/store/settings";

import type { ResolvedThemeMode } from "@/types/settings";

import { ScreenFrame } from "../shell/ScreenFrame";
import { Glyph } from "../shell/chrome";
import { SettingsScreen } from "./SettingsScreen";
import type { SettingsSectionId } from "./sections";

const HASH_TO_SECTION: Readonly<Record<string, SettingsSectionId>> = {
  appearance: "appearance",
  theme: "appearance",
  customization: "appearance",
  day: "day",
  timezone: "day",
  "auto-scheduling": "day",
  "auto-schedule": "day",
  "smart-scheduling": "day",
  scheduling: "day",
  schedules: "day",
  calendars: "calendars",
  calendar: "calendars",
  accounts: "calendars",
  bookings: "calendars",
  integrations: "calendars",
  tasks: "tasks",
  "task-defaults": "tasks",
  "task-urgency": "tasks",
  "task-sync": "calendars",
  focus: "focus",
  alerts: "alerts",
  notifications: "alerts",
  keys: "keys",
  desktop: "keys",
  account: "account",
  workspace: "account",
  billing: "account",
  subscription: "account",
  data: "data",
  privacy: "data",
  "import-export": "data",
  api: "data",
  connectors: "data",
  ai: "data",
  "ai-assistant": "data",
  user: "appearance",
};

function useResolvedTheme(): ResolvedThemeMode {
  const { theme, systemTheme } = useTheme();
  const [resolved, setResolved] = React.useState<ResolvedThemeMode>(() =>
    resolveThemeMode(theme, false, systemTheme)
  );

  React.useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () =>
      setResolved(resolveThemeMode(theme, media.matches, systemTheme));
    sync();
    if (theme !== "system") return undefined;
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [systemTheme, theme]);

  return resolved;
}

function SettingsStack({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[896px] space-y-9">{children}</div>;
}

function BoundSection({
  id,
  children,
}: {
  id: SettingsSectionId;
  children: React.ReactNode;
}) {
  return (
    <SettingsPanelBoundary resetKey={id}>
      <SettingsStack>{children}</SettingsStack>
    </SettingsPanelBoundary>
  );
}

/**
 * A calendar OAuth round trip comes back to /settings with its outcome in the
 * query string. Without this the user is returned to a silent screen and has
 * no way to tell a connected calendar from a refused one.
 */
function CalendarConnectionBanner({
  notice,
  onDismiss,
}: {
  notice: CalendarConnectionNotice;
  onDismiss: () => void;
}) {
  const error = notice.tone === "error";
  return (
    <div
      className="flex items-start gap-3 rounded-[var(--radius-lg)] p-4 text-sm shadow-[var(--shadow-ring)]"
      style={{
        background: `color-mix(in oklab, ${
          error ? "var(--color-danger)" : "var(--color-success)"
        } 8%, var(--surface-raised))`,
      }}
      role={error ? "alert" : "status"}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium">{notice.title}</p>
        <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
          {notice.description}
        </p>
        {error && notice.provider ? (
          <button
            type="button"
            className="mt-3 min-h-11 text-[13px] font-medium text-[var(--accent)] underline-offset-4 hover:underline"
            onClick={() => {
              window.location.href = `/api/calendar/${notice.provider}/auth`;
            }}
          >
            Reconnect {notice.provider === "google" ? "Google" : "Outlook"}{" "}
            Calendar
          </button>
        ) : null}
      </div>
      <button
        type="button"
        className="btn-icon nt-icon-button"
        aria-label="Dismiss calendar connection message"
        onClick={onDismiss}
      >
        <Glyph of={LuX} size={16} />
      </button>
    </div>
  );
}

export function SettingsRoute() {
  const theme = useResolvedTheme();
  const { data: session } = useAppSession();
  const initializeSettings = useSettingsStore(
    (state) => state.initializeSettings
  );
  const [section, setSection] = React.useState<SettingsSectionId>("appearance");
  const [connectionNotice, setConnectionNotice] =
    React.useState<CalendarConnectionNotice | null>(null);

  React.useEffect(() => {
    initializeSettings();
  }, [initializeSettings]);

  React.useLayoutEffect(() => {
    const readHash = () => {
      const hash = window.location.hash.slice(1);
      setSection(HASH_TO_SECTION[hash] ?? "appearance");
    };
    readHash();
    const query = new URLSearchParams(window.location.search);
    const notice = calendarConnectionNotice(
      query.get("calendarError"),
      query.get("calendarSuccess"),
      query.get("provider")
    );
    if (notice) {
      setConnectionNotice(notice);
      setSection("calendars");
    }
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  const dismissConnectionNotice = React.useCallback(() => {
    setConnectionNotice(null);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}#calendars`
    );
  }, []);

  const selectSection = React.useCallback((next: SettingsSectionId) => {
    setSection(next);
    window.history.replaceState(null, "", `#${next}`);
  }, []);

  const handleSignOut = React.useCallback(async () => {
    await signOutOfNeedt();
  }, []);

  const sectionContent = React.useMemo(
    () => ({
      appearance: (
        <BoundSection id="appearance">
          <UserSettings page="theme" />
          <CustomizationSettings />
        </BoundSection>
      ),
      day: (
        <BoundSection id="day">
          <UserSettings page="timezone" />
          <AutoScheduleSettings />
          <ScheduleSettings />
        </BoundSection>
      ),
      calendars: (
        <BoundSection id="calendars">
          {connectionNotice ? (
            <CalendarConnectionBanner
              notice={connectionNotice}
              onDismiss={dismissConnectionNotice}
            />
          ) : null}
          <AccountManager />
          <CalendarSettings />
          <IntegrationSettings />
          <BookingSettings />
        </BoundSection>
      ),
      tasks: (
        <BoundSection id="tasks">
          <TaskDefaultsSettings />
        </BoundSection>
      ),
      focus: (
        <BoundSection id="focus">
          <SettingsSection
            title="Focus"
            description="Choose the task and session length when you start a Focus session."
            showDescription
          >
            <Link className="btn btn-flat" href="/focus">
              Open Focus
            </Link>
          </SettingsSection>
        </BoundSection>
      ),
      alerts: (
        <BoundSection id="alerts">
          <NotificationSettings />
        </BoundSection>
      ),
      keys: (
        <BoundSection id="keys">
          <DesktopSettings />
        </BoundSection>
      ),
      account: (
        <BoundSection id="account">
          <OnboardingChecklist />
          <AccountSettings />
          <WorkspaceSettings />
          <BillingSettings />
        </BoundSection>
      ),
      data: (
        <BoundSection id="data">
          <ConnectorSettings />
          <AIAssistantSettings />
          <ImportExportSettings />
          <DataSettings />
        </BoundSection>
      ),
    }),
    [connectionNotice, dismissConnectionNotice]
  );

  const name = session?.user?.name ?? "You";
  const email = session?.user?.email ?? "";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  const shellStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
    background: "var(--background)",
    color: "var(--text-primary)",
    font: "var(--type-ui)",
  };

  return (
    <div className="needt-v2" data-theme={theme} style={shellStyle}>
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
        <ScreenFrame id="settings" glyph={LuSettings}>
          <SettingsScreen
            accountName={name}
            accountEmail={email}
            accountInitials={initials || "YO"}
            section={section}
            onSectionChange={selectSection}
            sectionContent={sectionContent}
            actions={<ReportBugDialog />}
            onSignOut={() => void handleSignOut()}
          />
        </ScreenFrame>
      </div>
    </div>
  );
}
