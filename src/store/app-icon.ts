import { create } from "zustand";

import { DEFAULT_APP_ICON } from "@/lib/needt3/app-icon";

/**
 * The icon the person chose, for the marks that draw it (`NeedtAppIcon`, the
 * favicon), and whether the picker is open. `UserSettings.prefs.appIcon` is the
 * source of truth; `useHydrateLook` carries it in once settings load.
 */
interface AppIconState {
  id: string;
  setId: (id: string) => void;
  /** "intro" is the one-time popup, "settings" the Appearance picker. */
  picker: null | "intro" | "settings";
  openPicker: (kind?: "intro" | "settings") => void;
  closePicker: () => void;
}

export const useAppIcon = create<AppIconState>((set) => ({
  id: DEFAULT_APP_ICON,
  setId: (id) => set({ id }),
  picker: null,
  openPicker: (kind = "settings") => set({ picker: kind }),
  closePicker: () => set({ picker: null }),
}));

export const openAppIconPicker = (kind: "intro" | "settings" = "settings") =>
  useAppIcon.getState().openPicker(kind);
