import { create } from "zustand";
import { persist } from "zustand/middleware";

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

export interface Needt3UiState {
  sidebarOpen: boolean;
  settingsOpen: boolean;
  settingsSection: SettingsSection;
  paletteOpen: boolean;
  composerOpen: boolean;
  askOpen: boolean;
  focusOpen: boolean;
  theme: ThemeChoice;
  accent: AccentId;

  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  openSettings: (section?: SettingsSection) => void;
  closeSettings: () => void;
  setPaletteOpen: (open: boolean) => void;
  setComposerOpen: (open: boolean) => void;
  setAskOpen: (open: boolean) => void;
  setFocusOpen: (open: boolean) => void;
  setTheme: (theme: ThemeChoice) => void;
  setAccent: (accent: AccentId) => void;
  setLook: (look: { theme?: unknown; accent?: unknown }) => void;
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
      focusOpen: false,
      theme: DEFAULT_THEME,
      accent: DEFAULT_ACCENT,

      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      openSettings: (section = null) =>
        set({ settingsOpen: true, settingsSection: section }),
      closeSettings: () => set({ settingsOpen: false }),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      setComposerOpen: (composerOpen) => set({ composerOpen }),
      setAskOpen: (askOpen) => set({ askOpen }),
      setFocusOpen: (focusOpen) => set({ focusOpen }),
      setTheme: (theme) => set({ theme: normalizeTheme(theme) }),
      setAccent: (accent) => set({ accent: normalizeAccent(accent) }),
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
          theme: normalizeTheme(p.theme ?? current.theme),
          accent: normalizeAccent(p.accent ?? current.accent),
        };
      },
    }
  )
);
