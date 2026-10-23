"use client";

import { RouteErrorFace } from "@/components/needt3/states/RouteErrorFace";

export default function TasksError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFace screen="tasks" error={error} reset={reset} />;
}
