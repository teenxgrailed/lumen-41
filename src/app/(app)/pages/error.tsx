"use client";

import { RouteErrorFace } from "@/components/needt3/states/RouteErrorFace";

export default function PagesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFace screen="pages" error={error} reset={reset} />;
}
