import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SetupStore {
  // Whether setup has been checked at least once
  hasChecked: boolean;
  // Whether setup is needed (no users exist)
  needsSetup: boolean | null;
  // Last time the setup status was checked
  lastChecked: number | null;
  // Set the setup status
  setSetupStatus: (needsSetup: boolean) => void;
  // Mark that setup has been checked
  markAsChecked: () => void;
  // Reset the setup status (force a new check)
  resetSetupStatus: () => void;
}

export const useSetupStore = create<SetupStore>()(
  persist(
    (set) => ({
      hasChecked: false,
      needsSetup: null,
      lastChecked: null,
      setSetupStatus: (needsSetup) =>
        set({
          needsSetup,
          hasChecked: true,
          lastChecked: Date.now(),
        }),
      markAsChecked: () =>
        set({
          hasChecked: true,
          lastChecked: Date.now(),
        }),
      resetSetupStatus: () =>
        set({
          hasChecked: false,
          needsSetup: null,
          lastChecked: null,
        }),
    }),
    {
      name: "needt-setup-storage",
    }
  )
);
