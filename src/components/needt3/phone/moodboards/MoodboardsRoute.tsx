"use client";

import type { ReactNode } from "react";

import {
  MoodboardsScreen,
  notifyBoardsBlocked,
} from "../../places/MoodboardsScreen";
import { useBoardsController } from "../../places/useBoardsController";
import { usePhoneUi } from "../../root/phone-ui-context";
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
 * `/moodboards/[id]`: the phone board page under 700 px (the references come
 * from the items API), the existing board workspace (`workspace`, passed in
 * by the server page) at every other width. The controller (rename draft, the
 * add sheet's draft, the in-flight writes) is called here, above the switch,
 * so crossing 700 px keeps a half-typed reference and writes once.
 */
export function MoodboardRoute({
  id,
  workspace,
}: {
  id: string;
  workspace: ReactNode;
}) {
  const ui = usePhoneUi();
  const onBlocked = useBlocked();
  const ctl = useBoardsController({ onBlocked });
  return ui === "phone" ? <PhoneBoardPage ctl={ctl} id={id} /> : workspace;
}
