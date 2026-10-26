"use client";

import {
  MoodboardsScreen,
  notifyBoardsBlocked,
} from "../../places/MoodboardsScreen";
import { BoardPage } from "../../places/board/BoardPage";
import { useBoardsController } from "../../places/useBoardsController";
import { usePhoneUi } from "../../root/phone-ui-context";
import { useEditingSurface } from "../../sync/sync-source";
import { usePhoneOverlays } from "../overlays/store";
import { PhoneBoardPage } from "./PhoneBoardPage";
import { PhoneBoards } from "./PhoneBoards";
import { BOARDS_PAYWALL_FEATURE } from "./model";

function useBlocked() {
  const phone = usePhoneUi() === "phone";
  const openPaywall = usePhoneOverlays((s) => s.openPaywall);
  return () =>
    phone ? openPaywall(BOARDS_PAYWALL_FEATURE) : notifyBoardsBlocked();
}

/**
 * `/moodboards`: the phone grid under 700 px, the desktop screen above. The
 * controller (naming sheet, its draft, the in-flight create) is called here,
 * above the face switch, and handed to BOTH faces, so crossing 700 px
 * neither loses the draft nor repeats a create.
 */
export function MoodboardsRoute() {
  const ui = usePhoneUi();
  const onBlocked = useBlocked();
  const ctl = useBoardsController({ onBlocked });
  return ui === "phone" ? (
    <PhoneBoards ctl={ctl} />
  ) : (
    <MoodboardsScreen ctl={ctl} />
  );
}

/**
 * `/moodboards/[id]`: the board's grid. The phone page under 700 px, the
 * desktop page above it, both reading the items API. The controller (rename
 * draft, the add sheet's draft, the open reference and dialog, the in-flight
 * writes) is called here, above the switch, and handed to BOTH faces, so
 * crossing 700 px keeps a half-typed reference and writes once. (The old
 * canvas is only the flag-off face of this route; see the server page.)
 */
export function MoodboardRoute({ id }: { id: string }) {
  const ui = usePhoneUi();
  useEditingSurface(`board:${id}`);
  const onBlocked = useBlocked();
  const ctl = useBoardsController({ onBlocked });
  return ui === "phone" ? (
    <PhoneBoardPage ctl={ctl} id={id} />
  ) : (
    <BoardPage ctl={ctl} id={id} />
  );
}
