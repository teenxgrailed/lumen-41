import { MailFaces } from "@/components/needt3/mail/MailFaces";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("mail");

export default function MailRoute() {
  return <MailFaces />;
}
