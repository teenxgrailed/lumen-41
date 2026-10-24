"use client";

import { RouteErrorFace } from "@/components/needt3/states/RouteErrorFace";

export default function CalendarError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFace screen="calendar" error={error} reset={reset} />;
}
