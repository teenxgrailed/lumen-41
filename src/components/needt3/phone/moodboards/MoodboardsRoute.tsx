"use client";

import type { ReactNode } from "react";

import { MoodboardsScreen } from "../../places/MoodboardsScreen";
import { usePhoneUi } from "../../root/phone-ui-context";
import { PhoneBoardPage } from "./PhoneBoardPage";
import { PhoneBoards } from "./PhoneBoards";
import { usePhoneBoards } from "./usePhoneBoards";

/**
 * `/moodboards`: the phone grid under 700 px, the desktop screen above. The
 * controller (naming sheet, its draft, the in-flight create) is called here,
 * above the face switch, so crossing 700 px neither loses the draft nor
 * repeats a create. The desktop screen is not touched.
 */
export function MoodboardsRoute() {
  const ui = usePhoneUi();
  const ctl = usePhoneBoards();
  return ui === "phone" ? <PhoneBoards ctl={ctl} /> : <MoodboardsScreen />;
}

/**
 * `/moodboards/[id]`: the phone board page under 700 px; above it, `desktop`
 * (the existing board workspace, passed in by the server page so it renders
 * exactly as before). The controller owns no query, so on a wide screen this
 * costs nothing but its own (empty) state.
 */
export function MoodboardRoute({
  id,
  desktop,
}: {
  id: string;
  desktop: ReactNode;
}) {
  const ui = usePhoneUi();
  const ctl = usePhoneBoards();
  return ui === "phone" ? <PhoneBoardPage ctl={ctl} id={id} /> : desktop;
}
