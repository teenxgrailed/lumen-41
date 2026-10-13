"use client";

import { type ReactNode, useLayoutEffect, useState } from "react";

import { createPortal } from "react-dom";

import { useDoc, usePageEditSync } from "@/lib/needt3/hooks/docs";

import { DocsScreen } from "../../docs/DocsScreen";
import { useDocsController } from "../../docs/useDocsController";
import { DocumentScreen } from "../../document/DocumentScreen";
import { usePhoneUi } from "../../root/phone-ui-context";
import { screenState } from "../../states/status";
import { DocsPhone } from "./DocsPhone";
import { ReaderPhone } from "./ReaderPhone";

/**
 * The Docs route's two faces. The route component renders one tree at every
 * width (root/ShellFrame); this picks the phone face or the desktop one by
 * `usePhoneUi()`. The grid's controller (sort, layout, Quick Open words, the
 * create guard) is called once, above the switch, and handed to both.
 */
export function DocsFace() {
  const ui = usePhoneUi();
  const ctl = useDocsController();
  return ui === "phone" ? <DocsPhone ctl={ctl} /> : <DocsScreen ctl={ctl} />;
}

/** The editor slot's classes per face (the desktop's are DocumentScreen's own). */
const DESKTOP_EDITOR =
  "min-w-0 [&>div]:!min-h-0 [&>div]:!bg-transparent [&>div>header]:!bg-[var(--dt-page)] [&>div>div.sticky]:!bg-[var(--dt-page)]";
const PHONE_EDITOR = "pd-editor min-w-0";

/**
 * The Document route's two faces around ONE editor. The editor
 * (`PageWorkspace`: collaboration socket, Yjs document, autosave queue) must
 * not unmount when the width crosses 700 px, so it is rendered once, here,
 * through a portal into a host element this component owns; neither face
 * renders it. Each face draws an empty slot (a callback ref) and the host is
 * moved into whichever slot is showing, with that face's classes. The editor
 * keeps its React state and instance; only its DOM node changes parent
 * (focus and the keyboard are lost, the text is not).
 *
 * The editor is mounted while the page loads or is readable, and not for a
 * page the person has no access to or that failed to load (a face draws the
 * state instead).
 */
export function DocumentFace({
  pageId,
  children,
}: {
  pageId: string;
  children: ReactNode;
}) {
  const ui = usePhoneUi();
  const state = screenState(useDoc(pageId));
  // What the editor writes (title, pin …) follows into the caches on either
  // face, so it is applied here, above the face switch.
  usePageEditSync(pageId);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = document.createElement("div");
    el.setAttribute("data-doc-editor", "");
    setHost(el);
    return () => el.remove();
  }, []);

  useLayoutEffect(() => {
    if (!host) return;
    host.className = ui === "phone" ? PHONE_EDITOR : DESKTOP_EDITOR;
    if (slot) {
      if (host.parentNode !== slot) slot.appendChild(host);
    } else host.remove();
  }, [host, slot, ui]);

  const mountEditor = state === "loading" || state === "content";
  return (
    <>
      {ui === "phone" ? (
        <ReaderPhone pageId={pageId} editorSlot={setSlot} />
      ) : (
        <DocumentScreen pageId={pageId} editorSlot={setSlot} />
      )}
      {host && mountEditor ? createPortal(children, host) : null}
    </>
  );
}
