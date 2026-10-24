"use client";

import { RouteErrorFace } from "@/components/needt3/states/RouteErrorFace";

export default function MoodboardsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFace screen="moodboards" error={error} reset={reset} />;
}
