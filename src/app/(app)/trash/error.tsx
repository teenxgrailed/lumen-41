"use client";

import { RouteErrorFace } from "@/components/needt3/states/RouteErrorFace";

export default function TrashError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFace screen="trash" error={error} reset={reset} />;
}
