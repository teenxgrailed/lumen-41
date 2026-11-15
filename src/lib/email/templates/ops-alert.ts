import { APP_NAME } from "@/lib/app-config";

import { type RenderedEmail, renderEmail } from "./layout";

export type OpsAlertLevel = "warning" | "critical";

/**
 * The owner-only operations alert. Owner-only mail, but it wears the same
 * layout so it renders the same in every client; renderEmail escapes the
 * message.
 */
export function getOpsAlertTemplate(
  level: OpsAlertLevel,
  message: string
): RenderedEmail {
  const subject = `${APP_NAME} ${level === "critical" ? "critical" : "warning"}: ${message.slice(0, 80)}`;
  return renderEmail({
    subject,
    preheader: message.slice(0, 120),
    heading: level === "critical" ? "Critical alert" : "Warning",
    paragraphs: [message],
    kind: "security",
    footerNote: "Needt operations alert.",
  });
}
