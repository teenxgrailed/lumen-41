"use client";

import { RouteErrorFace } from "@/components/needt3/states/RouteErrorFace";

export default function HabitsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFace screen="habits" error={error} reset={reset} />;
}
