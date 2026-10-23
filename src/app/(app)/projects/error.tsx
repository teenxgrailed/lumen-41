"use client";

import { RouteErrorFace } from "@/components/needt3/states/RouteErrorFace";

export default function ProjectsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFace screen="projects" error={error} reset={reset} />;
}
