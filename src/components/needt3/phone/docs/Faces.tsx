"use client";

import type { ReactNode } from "react";

import { DocsScreen } from "../../docs/DocsScreen";
import { DocumentScreen } from "../../document/DocumentScreen";
import { usePhoneUi } from "../../root/phone-ui-context";
import { DocsPhone } from "./DocsPhone";
import { ReaderPhone } from "./ReaderPhone";
import { useDocsPhone } from "./useDocsPhone";

/**
 * The Docs route's two faces. The route component renders one tree at every
 * width (root/ShellFrame); this picks the phone face or the desktop one by
 * `usePhoneUi()`. The desktop face is `DocsScreen`, untouched.
 */
export function DocsFace() {
  const ui = usePhoneUi();
  // Called once, above the switch: the phone face's sort, Quick Open words
  // and create guard survive a resize across 700 px.
  const ctl = useDocsPhone();
  return ui === "phone" ? <DocsPhone ctl={ctl} /> : <DocsScreen />;
}

/**
 * The Document route's two faces: the phone reader or the desktop
 * `DocumentScreen`, around the same editor element (`PageWorkspace`).
 */
export function DocumentFace({
  pageId,
  children,
}: {
  pageId: string;
  children: ReactNode;
}) {
  return usePhoneUi() === "phone" ? (
    <ReaderPhone pageId={pageId}>{children}</ReaderPhone>
  ) : (
    <DocumentScreen pageId={pageId}>{children}</DocumentScreen>
  );
}
