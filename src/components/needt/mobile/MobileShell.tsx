"use client";

/* THE PHONE SHELL — the whole product at 402×874.
 *
 * Ported from `Mobile.jsx`'s `MobileApp`. The desktop is two panes; a phone
 * has room for one, so the rail's four jobs go four different directions:
 * navigation to `MobileTabBar`, capture to `MobileComposer`'s sheet, the
 * queue into Home by way of `MobileQueueSheet`, and focus into the header
 * (`MobileHeader`) where it stays visible while the screen underneath
 * changes. Every task drawn here is the same `RichBlock` + `rbShape` pair
 * every other surface in this app calls — nothing in this directory forks
 * the task object.
 *
 * Takes no route of its own: nothing here reaches into a route — a caller drops
 * this in as a screen, the same convention every other `*Screen` follows.
 * That is a property of this file, not a licence to stop: a surface is
 * not ported until the thing that reaches it lands with it — see
 * `docs/handoff/design-workflow.md`.
 */
import * as React from "react";

import { LuPlus } from "react-icons/lu";

import { newDate } from "@/lib/date-utils";
import { isOverdue } from "@/lib/needt/derive";
import {
  projects as fixtureProjects,
  tasks as fixtureTasks,
  today as fixtureToday,
} from "@/lib/needt/fixture";
import type { NeedtProject, NeedtTask } from "@/lib/needt/types";

import type { ResolvedThemeMode } from "@/types/settings";

import type { RbInput } from "../rb-shape";
import { Glyph } from "../shell/chrome";
import { type MobileAuthMode, MobileAuthScreen } from "./MobileAuthScreen";
import { MobileCalendarDay } from "./MobileCalendarDay";
import { MobileComposer, type MobileComposerDraft } from "./MobileComposer";
import { MobileDocs } from "./MobileDocs";
import { MobileHabitStrip } from "./MobileHabitStrip";
import { MobileHeader } from "./MobileHeader";
import { MobileHome } from "./MobileHome";
import { MobileOnboarding } from "./MobileOnboarding";
import { MobileQueueSheet } from "./MobileQueueSheet";
import { type MobileRailLanguage, MobileSettings } from "./MobileSettings";
import { MobileTabBar } from "./MobileTabBar";
import { MobileTaskSheet } from "./MobileTaskSheet";
import { MobileWorkspace } from "./MobileWorkspace";
import {
  FAB_SIZE,
  type MobileTabId,
  mobileDueTodayCount,
  mobileQueue,
} from "./mobile-logic";

export type MobileStage = "auth" | "setup" | "app";
type MobileScreen = MobileTabId | "settings";

export interface MobileShellProps {
  /** Defaults to the fixture's tasks and "today" — never a bare `new Date()`,
   * per repository convention. */
  tasks?: readonly NeedtTask[];
  /** Defaults to the fixture's projects, for the same reason `tasks` does. */
  projects?: readonly NeedtProject[];
  now?: Date;
  /** Which stage to open on — the palette's own "jump to sign-in / setup". */
  initialStage?: MobileStage;
  initialTab?: MobileTabId;
  theme?: ResolvedThemeMode;
}

export function MobileShell({
  tasks: initialTasks = fixtureTasks,
  projects = fixtureProjects,
  now = fixtureToday,
  initialStage = "app",
  initialTab = "home",
  theme: initialTheme = "paper",
}: MobileShellProps) {
  const [stage, setStage] = React.useState<MobileStage>(initialStage);
  const [authMode, setAuthMode] = React.useState<MobileAuthMode>("login");
  const [tab, setTab] = React.useState<MobileScreen>(initialTab);
  const [selectedDay, setSelectedDay] = React.useState(now.getDate());
  const [focusOn, setFocusOn] = React.useState(false);
  const [queueOpen, setQueueOpen] = React.useState(false);
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [openTaskId, setOpenTaskId] = React.useState<string | null>(null);
  const [tasks, setTasks] = React.useState<readonly NeedtTask[]>(initialTasks);
  const [theme, setTheme] = React.useState<ResolvedThemeMode>(initialTheme);
  const [drift, setDrift] = React.useState(false);
  const [rail, setRail] = React.useState<MobileRailLanguage>("movability");
  /* A session-local string id sequence. There is no store behind this shell
   * (PORT.md §9: `Data.js` is in-memory), so the prefix only has to keep a
   * newly captured task distinct from the tasks already on screen. */
  const nextIdRef = React.useRef(1);

  const toggleTask = React.useCallback((id: string) => {
    setTasks((list) =>
      list.map((task) =>
        task.id === id ? { ...task, done: !task.done } : task
      )
    );
  }, []);

  const togglePart = React.useCallback((id: string, index: number) => {
    setTasks((list) =>
      list.map((task) =>
        task.id === id && task.parts
          ? {
              ...task,
              parts: task.parts.map((part, i) =>
                i === index ? { ...part, done: !part.done } : part
              ),
            }
          : task
      )
    );
  }, []);

  const createTask = React.useCallback((draft: MobileComposerDraft) => {
    const { parse } = draft;
    const project = parse.found.project?.project.name ?? null;
    const due = parse.found.date?.label ?? null;
    const id = `mobile-${nextIdRef.current}`;
    nextIdRef.current += 1;
    const created: NeedtTask = {
      id,
      title: parse.title,
      project,
      est: parse.found.duration?.minutes ?? 30,
      due: due ?? undefined,
      time: parse.found.time?.label,
      done: false,
      parts: parse.parts.length
        ? parse.parts.map((title) => ({ title, done: false }))
        : undefined,
    };
    setTasks((list) => [created, ...list]);
  }, []);

  const dayOfMonth = React.useMemo(() => {
    const date = newDate(now);
    date.setDate(selectedDay);
    return date;
  }, [now, selectedDay]);

  const queueCount = mobileQueue(tasks).length;
  const dueTodayCount = mobileDueTodayCount(tasks, now);
  const openTask = tasks.find((task) => task.id === openTaskId) ?? null;

  if (stage === "auth") {
    return (
      <div className="needt-v2" data-theme={theme} style={mobileShellStyle}>
        <div style={{ flex: "none", height: 52 }} />
        <MobileAuthScreen
          mode={authMode}
          onMode={setAuthMode}
          onDone={() => setStage("setup")}
        />
      </div>
    );
  }

  if (stage === "setup") {
    return (
      <div className="needt-v2" data-theme={theme} style={mobileShellStyle}>
        <div style={{ flex: "none", height: 52 }} />
        <MobileOnboarding onDone={() => setStage("app")} />
      </div>
    );
  }

  const body =
    tab === "home" ? (
      <MobileHome
        projects={projects}
        tasks={tasks}
        now={now}
        onOpenTask={(task) => setOpenTaskId(task.id)}
        onToggleTask={toggleTask}
      />
    ) : tab === "calendar" ? (
      <MobileCalendarDay
        tasks={tasks}
        day={dayOfMonth}
        today={now}
        onOpen={(entry) => setOpenTaskId(entry.id)}
        onToggle={(entry) => toggleTask(entry.id)}
      />
    ) : tab === "workspace" ? (
      <MobileWorkspace
        tasks={tasks}
        onOpenTask={(task) => setOpenTaskId(task.id)}
        onToggleTask={toggleTask}
      />
    ) : tab === "settings" ? (
      <MobileSettings
        theme={theme}
        onTheme={setTheme}
        drift={drift}
        onDrift={setDrift}
        rail={rail}
        onRail={setRail}
      />
    ) : (
      <MobileDocs />
    );

  return (
    <div className="needt-v2" data-theme={theme} style={mobileShellStyle}>
      <div style={{ flex: "none", height: 52 }} />
      <MobileHeader
        today={now}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
        focusOn={focusOn}
        onToggleFocus={() => setFocusOn((v) => !v)}
        queueCount={queueCount}
        onOpenQueue={() => setQueueOpen(true)}
        settingsOn={tab === "settings"}
        onToggleSettings={() =>
          setTab(tab === "settings" ? "home" : "settings")
        }
      />
      {tab === "home" ? <MobileHabitStrip /> : null}
      <div
        className="scroll-inner"
        style={{ flex: 1, minHeight: 0, overflow: "auto" }}
      >
        {body}
      </div>

      <button
        type="button"
        onClick={() => setComposerOpen(true)}
        aria-label="Capture"
        style={{
          position: "absolute",
          right: 16,
          bottom: 96,
          zIndex: 40,
          display: "grid",
          placeItems: "center",
          opacity: composerOpen ? 0 : 1,
          pointerEvents: composerOpen ? "none" : "auto",
          transition: "opacity 0.2s ease",
          width: FAB_SIZE,
          height: FAB_SIZE,
          border: 0,
          cursor: "default",
          borderRadius: "var(--radius-floating)",
          background: "var(--fill-accent-strong)",
          color: "var(--accent)",
          boxShadow: "var(--shadow-floating)",
        }}
      >
        <Glyph of={LuPlus} size={22} />
      </button>

      <MobileComposer
        open={composerOpen}
        now={now}
        onClose={() => setComposerOpen(false)}
        onCreate={(draft) => {
          createTask(draft);
          setComposerOpen(false);
        }}
      />

      <MobileQueueSheet
        tasks={tasks}
        open={queueOpen}
        onClose={() => setQueueOpen(false)}
        onOpenTask={(task) => {
          setQueueOpen(false);
          setOpenTaskId(task.id);
        }}
        onToggleTask={toggleTask}
      />

      <MobileTaskSheet
        task={openTask ? taskToInput(openTask, now) : null}
        open={openTaskId != null}
        onClose={() => setOpenTaskId(null)}
        onToggle={toggleTask}
        onTogglePart={togglePart}
      />

      <MobileTabBar
        active={tab === "settings" ? null : tab}
        onSelect={setTab}
        hidden={composerOpen}
        homeDueToday={dueTodayCount}
      />
    </div>
  );
}

const mobileShellStyle: React.CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  height: "100%",
  overflow: "hidden",
  color: "var(--text-primary)",
  background: "var(--background)",
};

/** The extra a grid or a sheet can know that a plain `NeedtTask` does not:
 * here only `priority`, read off whether the task is currently overdue, per
 * `rbShape`'s own three-state contract. */
function taskToInput(task: NeedtTask, now: Date): RbInput {
  return isOverdue(task, now) ? { ...task, priority: "now" } : task;
}
