"use client";

import { RouteErrorFace } from "@/components/needt3/states/RouteErrorFace";

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFace screen="settings" error={error} reset={reset} />;
}
