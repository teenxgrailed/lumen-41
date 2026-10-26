"use client";

import { StGlyph } from "../states/StGlyph";
import { useSyncSource } from "./sync-source";
import { useOnline } from "./useOnline";

/**
 * The offline signal on the phone: nothing while online, a quiet pill in the
 * page flow above the title while offline (nothing is fixed at the top). It
 * needs no provider, so any screen can carry it. An open document or board
 * says "Offline — changes kept" through its own SyncStatus instead, so the two
 * never show together.
 */
export function PhoneOfflineIndicator() {
  const online = useOnline();
  const editing = useSyncSource() !== null;
  if (online || editing) return null;
  return (
    <span className="st-offline-row is-phone" role="status">
      <span className="st-offline" data-st-offline="">
        <StGlyph name="cloud-off" size={14} />
        <span>offline · changes kept</span>
      </span>
    </span>
  );
}
