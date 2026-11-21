"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { openPaywall } from "./store";

/**
 * `/upgrade` (the trial emails' button, "See plans"): opens the Keep Pro card
 * over Today and leaves the address on Today, as `/settings#section` does for
 * the Settings sheet. `?cycle=monthly|annual|lifetime` picks the plan.
 */
export function UpgradeRedirect() {
  const router = useRouter();
  useEffect(() => {
    const cycle = new URLSearchParams(window.location.search).get("cycle");
    openPaywall(cycle ? { cycle } : undefined);
    router.replace("/today");
  }, [router]);
  return null;
}
