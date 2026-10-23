"use client";

import { RouteErrorFace } from "@/components/needt3/states/RouteErrorFace";

export default function TodayError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFace screen="today" error={error} reset={reset} />;
}
