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
import { BOARDS_PAYWALL_FEATURE, type PhoneBoardItem } from "./model";

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
 * `/moodboards/[id]`: the existing board workspace (`workspace`, passed in by
 * the server page) at every width, until a board's references can be read.
 * The phone board page replaces it on the phone ONLY when `items` is non-null.
 *
 * //todo: the board items API (PR #127) lands the read; then the page passes
 * `useBoardItems(id).data` as `items` and phones get PhoneBoardPage. Until
 * then `items` is always null and nothing changes for phones.
 */
export function MoodboardRoute({
  id,
  workspace,
  items = null,
}: {
  id: string;
  workspace: ReactNode;
  items?: readonly PhoneBoardItem[] | null;
}) {
  const ui = usePhoneUi();
  const onBlocked = useBlocked();
  const ctl = useBoardsController({ onBlocked });
  return ui === "phone" && items !== null ? (
    <PhoneBoardPage ctl={ctl} id={id} items={items} />
  ) : (
    workspace
  );
}
