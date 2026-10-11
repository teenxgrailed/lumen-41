"use client";

import { ConnectionsScreen } from "../../connections/ConnectionsScreen";
import { useConnectionsController } from "../../connections/useConnectionsController";
import { SharedScreen } from "../../places/SharedScreen";
import { TemplatesScreen } from "../../places/TemplatesScreen";
import { TrashScreen } from "../../places/TrashScreen";
import { useTemplatesController } from "../../places/useTemplatesController";
import { useTrashController } from "../../places/useTrashController";
import { usePhoneUi } from "../../root/phone-ui-context";
import { ConnectionsPhone } from "./ConnectionsPhone";
import { SharedPhone } from "./SharedPhone";
import { TemplatesPhone } from "./TemplatesPhone";
import { TrashPhone } from "./TrashPhone";

/*
 * The four Places routes' faces. A route renders one tree at every width
 * (root/ShellFrame); each of these picks the phone face or the desktop one
 * with `usePhoneUi()`. What a place keeps or writes (Connections' tab, search,
 * pending connect and open confirm; Templates' press in flight; Trash's
 * restore guard) is called once here, above the switch, and handed to either
 * face, so crossing 700 px loses none of it and repeats no write. The desktop
 * faces draw what they always drew.
 */

export function ConnectionsFace() {
  const c = useConnectionsController();
  return usePhoneUi() === "phone" ? (
    <ConnectionsPhone c={c} />
  ) : (
    <ConnectionsScreen c={c} />
  );
}

export function TemplatesFace() {
  const c = useTemplatesController();
  return usePhoneUi() === "phone" ? (
    <TemplatesPhone c={c} />
  ) : (
    <TemplatesScreen c={c} />
  );
}

/**
 * Shared holds no state of its own: the list is the query cache both faces
 * read, and the phone's open access sheet is not data. Nothing is lost on a
 * swap, so there is no controller.
 */
export function SharedFace() {
  return usePhoneUi() === "phone" ? <SharedPhone /> : <SharedScreen />;
}

export function TrashFace() {
  const c = useTrashController();
  return usePhoneUi() === "phone" ? (
    <TrashPhone c={c} />
  ) : (
    <TrashScreen c={c} />
  );
}
