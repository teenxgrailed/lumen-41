import { create } from "zustand";
import { persist } from "zustand/middleware";

import { CHAT_DOCK_W, clampDockW } from "@/lib/assistant-position";
import {
  type AccentId,
  DEFAULT_ACCENT,
  DEFAULT_THEME,
  type ThemeChoice,
  normalizeAccent,
  normalizeTheme,
} from "@/lib/needt3/theme";

/**
 * Client UI state for the v3 frame: what is open, and the look. Domain data
 * never goes here; it lives in TanStack Query under `["v3", …]` keys.
 *
 * Theme and accent are mirrored to localStorage only so the frame paints in
 * the right theme before settings load. `UserSettings` stays the source of
 * truth (T21 writes it and calls `setLook`).
 */
export type SettingsSection = string | null;

/** The open document's right inspector tab (prototype DocumentScreen `tab`). */
export type DocTab = "insert" | "style" | "info";
/** What the left rail shows while a document is open (prototype `sbMode`). */
export type DocRailMode = "doc" | "app";
/** The document rail's tab (prototype `DocPanel`: Contents, Tasks, Files, Find). */
export type DocRailTab = "outline" | "tasks" | "files" | "find";
/** One line of the document rail's Contents: the title, then the headings. */
export interface DocOutlineRow {
  text: string;
  /** 0 for the title, then 1.. by heading depth on the page. */
  level: number;
}

export interface Needt3UiState {
  sidebarOpen: boolean;
  settingsOpen: boolean;
  settingsSection: SettingsSection;
  paletteOpen: boolean;
  composerOpen: boolean;
  askOpen: boolean;
  /** Ask was left docked open on the desktop (restored on the next visit). */
  askRemembered: boolean;
  /** The docked Ask panel's width, dragged from its left edge. */
  askWidth: number;
  focusOpen: boolean;
  theme: ThemeChoice;
  accent: AccentId;
  /** Document chrome shared by the top bar, the rail and the page. Not persisted. */
  docTab: DocTab;
  docShareOpen: boolean;
  docRail: DocRailMode;
  docRailTab: DocRailTab;
  docOutline: DocOutlineRow[];

  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  openSettings: (section?: SettingsSection) => void;
  closeSettings: () => void;
  setPaletteOpen: (open: boolean) => void;
  setComposerOpen: (open: boolean) => void;
  setAskOpen: (open: boolean) => void;
  setAskRemembered: (remembered: boolean) => void;
  setAskWidth: (width: number) => void;
  setFocusOpen: (open: boolean) => void;
  setTheme: (theme: ThemeChoice) => void;
  setAccent: (accent: AccentId) => void;
  setLook: (look: { theme?: unknown; accent?: unknown }) => void;
  setDocTab: (tab: DocTab) => void;
  setDocShareOpen: (open: boolean) => void;
  setDocRail: (mode: DocRailMode) => void;
  setDocRailTab: (tab: DocRailTab) => void;
  setDocOutline: (rows: DocOutlineRow[]) => void;
}

export const useNeedt3Ui = create<Needt3UiState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      settingsOpen: false,
      settingsSection: null,
      paletteOpen: false,
      composerOpen: false,
      askOpen: false,
      askRemembered: false,
      askWidth: CHAT_DOCK_W,
      focusOpen: false,
      theme: DEFAULT_THEME,
      accent: DEFAULT_ACCENT,
      docTab: "insert",
      docShareOpen: false,
      docRail: "doc",
      docRailTab: "outline",
      docOutline: [],

      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      openSettings: (section = null) =>
        set({ settingsOpen: true, settingsSection: section }),
      closeSettings: () => set({ settingsOpen: false }),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      setComposerOpen: (composerOpen) => set({ composerOpen }),
      setAskOpen: (askOpen) => set({ askOpen }),
      setAskRemembered: (askRemembered) => set({ askRemembered }),
      setAskWidth: (askWidth) => set({ askWidth: clampDockW(askWidth) }),
      setFocusOpen: (focusOpen) => set({ focusOpen }),
      setTheme: (theme) => set({ theme: normalizeTheme(theme) }),
      setAccent: (accent) => set({ accent: normalizeAccent(accent) }),
      setDocTab: (docTab) => set({ docTab }),
      setDocShareOpen: (docShareOpen) => set({ docShareOpen }),
      setDocRail: (docRail) => set({ docRail }),
      setDocRailTab: (docRailTab) => set({ docRailTab }),
      setDocOutline: (docOutline) => set({ docOutline }),
      setLook: ({ theme, accent }) =>
        set((s) => ({
          theme: theme === undefined ? s.theme : normalizeTheme(theme),
          accent: accent === undefined ? s.accent : normalizeAccent(accent),
        })),
    }),
    {
      name: "needt3-ui",
      version: 1,
      partialize: (s) => ({
        sidebarOpen: s.sidebarOpen,
        askRemembered: s.askRemembered,
        askWidth: s.askWidth,
        theme: s.theme,
        accent: s.accent,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Needt3UiState>;
        return {
          ...current,
          sidebarOpen:
            typeof p.sidebarOpen === "boolean"
              ? p.sidebarOpen
              : current.sidebarOpen,
          askRemembered:
            typeof p.askRemembered === "boolean"
              ? p.askRemembered
              : current.askRemembered,
          askWidth: clampDockW(p.askWidth ?? current.askWidth),
          theme: normalizeTheme(p.theme ?? current.theme),
          accent: normalizeAccent(p.accent ?? current.accent),
        };
      },
    }
  )
);
