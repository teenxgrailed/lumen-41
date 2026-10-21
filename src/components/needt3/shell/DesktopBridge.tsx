"use client";

import { useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { useQueryClient } from "@tanstack/react-query";

import { formatInTimeZone } from "@/lib/date-utils";
import {
  type DesktopCommand,
  desktopPlatform,
  desktopVibrancy,
  emitDesktopEvent,
  isDesktopApp,
  onDesktopCommand,
} from "@/lib/desktop";
import { hourOf } from "@/lib/needt3/derive";
import { MAX_LENGTH, MIN_LENGTH } from "@/lib/needt3/focus";
import { useNow } from "@/lib/needt3/hooks/clock";
import { useCreateDoc } from "@/lib/needt3/hooks/docs";
import { useFocusActions, useFocusSession } from "@/lib/needt3/hooks/focus";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import { useTasks } from "@/lib/needt3/hooks/tasks";
import { qk } from "@/lib/needt3/query-keys";
import { dayAt } from "@/lib/needt3/today";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { nextTasks, trayState } from "../root/desktopTray";
import { useShellApi } from "./ShellContext";

/** The desktop app refreshes what its menu-bar menu shows this often. */
const REFRESH_MS = 60_000;

/** "Start focus on next task" plans the task's own estimate, else this. */
const DEFAULT_FOCUS_MINUTES = 25;

/**
 * Elements the desktop window can be dragged by (the title bar is the app's
 * own top bar; Tauri reads `data-tauri-drag-region` on the element under the
 * pointer). Only empty chrome is marked, never a control.
 */
const DRAG_SELECTORS = [".tab-bar", ".tab-bar > span"];

function markDragRegions() {
  document
    .querySelectorAll<HTMLElement>(DRAG_SELECTORS.join(","))
    .forEach((el) => {
      if (!el.hasAttribute("data-tauri-drag-region")) {
        el.setAttribute("data-tauri-drag-region", "");
      }
    });
}

/**
 * The page's half of the desktop app (`apps/desktop`). It renders nothing and
 * does nothing in a browser tab: `isDesktopApp()` is false there and every
 * effect returns at once. Inside the app it
 *  - marks the platform on <html> (`data-desktop`) for the CSS in
 *    desktop-app.css, and the top bar as the window's drag handle,
 *  - answers the native menu and tray (New task, Today, Open a task...) by
 *    calling the same things the keyboard shortcuts and the sidebar call,
 *  - keeps the menu-bar menu's "next tasks", the focus line and the Dock
 *    badge in step with the same queries the screens use.
 */
export function DesktopBridge() {
  // Decided after mount, so a browser tab never runs the inner hooks (no
  // extra queries, nothing to hydrate) and the server render matches.
  const [inApp, setInApp] = useState(false);
  useEffect(() => setInApp(isDesktopApp()), []);
  return inApp ? <DesktopBridgeInApp /> : null;
}

function DesktopBridgeInApp() {
  const router = useRouter();
  const shell = useShellApi();
  const createDoc = useCreateDoc();
  const queryClient = useQueryClient();
  const tz = useTimeZone();
  const now = useNow();
  const tasks = useTasks().data;
  const focus = useFocusSession().data;
  const focusActions = useFocusActions();
  const sidebarOpen = useNeedt3Ui((s) => s.sidebarOpen);
  const today = dayAt(now, tz);
  const nowHour = hourOf(`T${formatInTimeZone(now, tz, "HH:mm")}`) ?? 0;

  const run = (command: DesktopCommand) => {
    const ui = useNeedt3Ui.getState();
    switch (command.type) {
      case "navigate":
        router.push(command.path);
        return;
      case "open-task":
        router.push(`/tasks?task=${encodeURIComponent(command.id)}`);
        return;
      case "new-task":
        ui.setComposerOpen(true);
        return;
      case "new-doc":
        void createDoc
          .mutateAsync({ draft: { title: "" } })
          .then(({ result }) => {
            if (result) router.push(`/pages/${encodeURIComponent(result.id)}`);
          })
          .catch(() => undefined);
        return;
      case "toggle-sidebar":
        shell.toggleSidebar();
        return;
      case "palette":
        ui.setPaletteOpen(true);
        return;
      case "settings":
        ui.openSettings();
        return;
      case "focus-toggle":
        if (focus) {
          void (focus.pausedAt
            ? focusActions.resume(focus)
            : focusActions.pause(focus));
        }
        return;
      case "focus-end":
        if (focus) void focusActions.stop(focus, false);
        return;
      case "focus-start-next": {
        const next = nextTasks(tasks ?? [], today, nowHour)[0];
        if (!next) {
          // Nothing queued for today: the focus window picks the task.
          ui.setFocusOpen(true);
          return;
        }
        const task = tasks?.find((t) => t.id === next.id);
        const minutes = Math.round(
          task?.estimatedMinutes ?? DEFAULT_FOCUS_MINUTES
        );
        void focusActions.start({
          taskId: next.id,
          intention: task?.title ?? next.title,
          plannedMinutes: Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, minutes)),
        });
        return;
      }
    }
  };
  // The listener is installed once; it always calls the latest closure.
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (!isDesktopApp()) return undefined;
    const html = document.documentElement;
    html.dataset.desktop = desktopPlatform() ?? "other";
    // The shell gave this window a see-through sidebar material (macOS only):
    // desktop-app.css makes the sidebar translucent only then.
    if (desktopVibrancy()) html.dataset.vibrancy = "on";
    // Reaching this component means a session exists: the shell may remember it.
    emitDesktopEvent("needt-signed-in");
    const stop = onDesktopCommand((command) => runRef.current(command));
    return () => {
      stop();
      delete html.dataset.desktop;
      delete html.dataset.vibrancy;
    };
  }, []);

  // The top bar's left end is translucent only while the sidebar is open.
  useEffect(() => {
    if (!isDesktopApp()) return undefined;
    const html = document.documentElement;
    html.dataset.sidebar = sidebarOpen ? "open" : "closed";
    return () => {
      delete html.dataset.sidebar;
    };
  }, [sidebarOpen]);

  // macOS: the window's own appearance follows the app's theme, so the
  // material behind the translucent sidebar is the same light or dark.
  // "system" hands it back to the operating system.
  useEffect(() => {
    if (!desktopVibrancy()) return undefined;
    const scope = document.querySelector<HTMLElement>(".needt-v3");
    if (!scope) return undefined;
    let sent = "";
    const send = () => {
      const side = scope.dataset.theme === "dark" ? "dark" : "light";
      const next = scope.dataset.themeChoice === "system" ? "system" : side;
      if (next === sent) return;
      sent = next;
      emitDesktopEvent("needt-theme", next);
    };
    send();
    const observer = new MutationObserver(send);
    observer.observe(scope, {
      attributes: true,
      attributeFilter: ["data-theme", "data-theme-choice"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isDesktopApp()) return undefined;
    markDragRegions();
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        markDragRegions();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  // Today's tasks and the focus session, again every minute and on return.
  useEffect(() => {
    if (!isDesktopApp()) return undefined;
    const refresh = () => {
      if (document.hidden || !navigator.onLine) return;
      void queryClient.invalidateQueries({ queryKey: qk.tasks() });
      void queryClient.invalidateQueries({ queryKey: qk.focusSession() });
    };
    const id = window.setInterval(refresh, REFRESH_MS);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [queryClient]);

  const state = trayState({
    tasks,
    today,
    nowHour,
    focus,
    nowMs: now.getTime(),
  });
  const serialized = state ? JSON.stringify(state) : null;
  useEffect(() => {
    if (!serialized || !isDesktopApp()) return;
    emitDesktopEvent("needt-tray-state", JSON.parse(serialized));
  }, [serialized]);

  return null;
}
