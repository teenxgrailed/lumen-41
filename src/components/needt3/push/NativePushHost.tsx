"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { onNativePushTap } from "@/lib/native";
import { syncNativePushToken } from "@/lib/needt3/hooks/push";

/**
 * The iOS app's push plumbing for the signed-in shell: a tapped notification
 * opens the path it carries, and at start the device token is saved again
 * (Apple can change it). Renders nothing; a no-op in a browser.
 */
export function NativePushHost() {
  const router = useRouter();

  useEffect(() => onNativePushTap((path) => router.push(path)), [router]);

  useEffect(() => {
    void syncNativePushToken().catch(() => undefined);
  }, []);

  return null;
}
