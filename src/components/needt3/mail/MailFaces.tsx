"use client";

import { PhoneMail } from "../phone/mail/PhoneMail";
import { usePhoneUi } from "../root/phone-ui-context";
import { MailScreen } from "./MailScreen";
import { useMailbox } from "./useMailbox";

/**
 * The Mailbox route under design_v3: the phone face below 700 px, the
 * desktop `MailScreen` (untouched) above. `useMailbox` is called once, here,
 * above the face switch, and handed to the phone face, so the selected view,
 * the open message and any task being made survive a resize across 700 px
 * (the route itself never remounts). The desktop face keeps its own tab and
 * open message; the data is shared through the query cache by key.
 */
export function MailFaces() {
  const ui = usePhoneUi();
  const box = useMailbox();
  return ui === "phone" ? <PhoneMail box={box} /> : <MailScreen />;
}
