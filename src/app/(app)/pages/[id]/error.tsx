"use client";

import { RouteErrorFace } from "@/components/needt3/states/RouteErrorFace";

export default function PageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFace screen="page" error={error} reset={reset} />;
}
