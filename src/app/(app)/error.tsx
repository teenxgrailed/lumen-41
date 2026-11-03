"use client";

import { RouteErrorFace } from "@/components/needt3/states/RouteErrorFace";

/** Every screen under (app) without its own error.tsx lands here, inside the shell. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFace screen="app" error={error} reset={reset} />;
}
