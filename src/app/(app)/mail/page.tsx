import { MailPage } from "@/components/mail/MailPage";
import { MailFaces } from "@/components/needt3/mail/MailFaces";

import { isDesignV3 } from "@/lib/needt3/design-flag";

export default async function MailRoute() {
  // design_v3 on: the v3 Mailbox (read-only at the provider). Off: unchanged.
  if (await isDesignV3()) return <MailFaces />;
  return (
    <div className="h-full">
      <MailPage />
    </div>
  );
}
