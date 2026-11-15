"use client";

import {
  PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { MotionConfig } from "motion/react";

import {
  fastFadeTransition,
  instantTransition,
  resolveMotionPolicy,
} from "@/lib/motion";
import { subscribePageActivity } from "@/lib/needt3/page-activity";

export const MOTION_PREFERENCE_EVENT = "needt:motion-preference";
const MotionPreferenceContext = createContext(false);

export function useNeedtReducedMotion() {
  return useContext(MotionPreferenceContext);
}

export function MotionRuntime({ children }: PropsWithChildren) {
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const preferenceChanged = useRef(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncEnvironment = () => {
      setDocumentVisible(!document.hidden);
      setPrefersReducedMotion(reduced.matches);
    };
    const syncPreference = (event: Event) => {
      const enabled = (event as CustomEvent<{ enabled?: boolean }>).detail
        ?.enabled;
      if (typeof enabled === "boolean") {
        preferenceChanged.current = true;
        setAnimationsEnabled(enabled);
      }
    };
    const controller = new AbortController();

    syncEnvironment();
    document.addEventListener("visibilitychange", syncEnvironment);
    reduced.addEventListener("change", syncEnvironment);
    window.addEventListener(MOTION_PREFERENCE_EVENT, syncPreference);
    fetch("/api/customization", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((customization) => {
        if (
          !preferenceChanged.current &&
          typeof customization?.animationsEnabled === "boolean"
        ) {
          setAnimationsEnabled(customization.animationsEnabled);
        }
      })
      .catch(() => undefined);

    return () => {
      controller.abort();
      document.removeEventListener("visibilitychange", syncEnvironment);
      reduced.removeEventListener("change", syncEnvironment);
      window.removeEventListener(MOTION_PREFERENCE_EVENT, syncPreference);
    };
  }, []);

  // The shared idle/visibility state keeps `data-needt-idle` on <html> current
  // for the whole app (CSS animations pause on it); see page-activity.ts.
  useEffect(() => subscribePageActivity(() => undefined), []);

  const policy = resolveMotionPolicy({
    animationsEnabled,
    documentVisible,
    prefersReducedMotion,
  });

  useLayoutEffect(() => {
    const root = document.documentElement;
    const applyPolicy = () => {
      root.dataset.animations = policy.datasetValue;
      root.dataset.needtMotion = policy.datasetValue;
    };

    applyPolicy();
    // The root layout has an SSR default for this attribute. Hydration may
    // reconcile that static value after this client component commits, so keep
    // the runtime policy authoritative without touching unrelated attributes.
    const observer = new MutationObserver(() => {
      if (root.dataset.needtMotion !== policy.datasetValue) applyPolicy();
    });
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-needt-motion"],
    });
    return () => observer.disconnect();
  }, [policy.datasetValue]);

  return (
    <MotionPreferenceContext.Provider value={!policy.enabled}>
      <MotionConfig
        reducedMotion={policy.reducedMotion}
        transition={policy.enabled ? fastFadeTransition : instantTransition}
      >
        {children}
      </MotionConfig>
    </MotionPreferenceContext.Provider>
  );
}
