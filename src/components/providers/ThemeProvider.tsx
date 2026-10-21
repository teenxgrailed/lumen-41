"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
} from "react";

import { animateThemeTransition } from "@/components/ui/animated-theme-toggler";

import { setStatusBarForTheme } from "@/lib/native";
import { DEFAULT_SYSTEM_THEME_PAIR } from "@/lib/theme";
import { applyThemeToRoot } from "@/lib/theme-init";

import { useSettingsStore } from "@/store/settings";

import { SystemThemePair, ThemeMode } from "@/types/settings";

type ThemeContextType = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  /** Which theme fills each half of the OS preference when theme is "system". */
  systemTheme: SystemThemePair;
  setSystemTheme: (pair: SystemThemePair) => void;
};

type ThemeProviderProps = {
  children: React.ReactNode;
  forcedTheme?: ThemeMode;
  enableSystem?: boolean;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

export function ThemeProvider({
  children,
  forcedTheme,
  enableSystem = true,
}: ThemeProviderProps) {
  const { user, updateUserSettings } = useSettingsStore();

  // Use forcedTheme if provided, otherwise use user theme
  const currentTheme = forcedTheme || user.theme;
  const systemTheme = user.systemTheme ?? DEFAULT_SYSTEM_THEME_PAIR;

  // Applying a theme is `applyThemeToRoot` and nothing else: the same function
  // the pre-paint script in layout.tsx is serialised from, so the two cannot
  // resolve a theme differently.
  const applyTheme = useCallback(
    (theme: ThemeMode, pair: SystemThemePair) => {
      const resolved = applyThemeToRoot(window.document.documentElement, {
        theme,
        systemTheme: pair,
        systemPrefersDark: enableSystem
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
          : false,
      });
      // no-op outside the iOS shell
      void setStatusBarForTheme(resolved);
    },
    [enableSystem]
  );

  // Apply theme when it changes
  useEffect(() => {
    applyTheme(forcedTheme ?? user.theme, systemTheme);
  }, [user.theme, systemTheme, forcedTheme, applyTheme]);

  // Listen for system theme changes if system preference is enabled
  useEffect(() => {
    if (forcedTheme || !enableSystem || currentTheme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = () => {
      applyTheme("system", systemTheme);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [currentTheme, systemTheme, forcedTheme, enableSystem, applyTheme]);

  const setTheme = (theme: ThemeMode) => {
    if (theme === currentTheme) return;
    animateThemeTransition(() => {
      updateUserSettings({ theme });
      if (!forcedTheme) applyTheme(theme, systemTheme);
    });
  };

  const setSystemTheme = (pair: SystemThemePair) => {
    animateThemeTransition(() => {
      updateUserSettings({ systemTheme: pair });
      if (!forcedTheme) applyTheme(currentTheme, pair);
    });
  };

  return (
    <ThemeContext.Provider
      value={{ theme: currentTheme, setTheme, systemTheme, setSystemTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
