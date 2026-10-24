"use client";

import { WhatsNewList, useWhatsNewOpening } from "../../shell/WhatsNewList";
import { PkSheet } from "../kit";

/**
 * What's new on the phone: the desktop's list in its own sheet over Settings
 * (as the pickers are), opened from About. Opening it records it as seen.
 */
export function PhoneWhatsNew({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const feed = useWhatsNewOpening(open);
  return (
    <PkSheet
      open={open}
      onClose={onClose}
      title="What's new"
      label="What's new"
      detents={[0.92]}
      className="wn-phone-sheet"
    >
      <div className="wn-phone" data-ps-news="">
        <WhatsNewList {...feed} />
      </div>
    </PkSheet>
  );
}
