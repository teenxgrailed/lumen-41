/** "2026-10-16" from an ISO timestamp, or a dash when there is none. */
export function dayOf(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "-";
}

/** "2026-10-16 12:30" (UTC) from an ISO timestamp, or a dash. */
export function minuteOf(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 16).replace("T", " ") : "-";
}

export function planLabel(plan: string): string {
  switch (plan) {
    case "PRO":
      return "Pro";
    case "LIFETIME":
      return "Lifetime";
    default:
      return "Free";
  }
}
