"use client";

import { useSession } from "next-auth/react";

import { LuPanelRight, LuPlus, LuUsers } from "react-icons/lu";

import { setDocHeadSlot } from "@/components/pages/doc-head-slot";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { docsCopy } from "../docs/DocParts";
import { Tooltip } from "../menu/Tooltip";
import { Avatar, initialsOf } from "../shell/Avatar";
import { useDocPanel } from "./panel";

const copy = docsCopy;

// Stable callbacks: an inline ref would be called with null and then the
// element again on every render, which empties the slots (and closes the
// editor's Page options menu) each time this re-renders.
const setStatusSlot = (el: HTMLElement | null) => setDocHeadSlot("status", el);
const setMoreSlot = (el: HTMLElement | null) => setDocHeadSlot("more", el);

/**
 * The top bar's right side while a document is open (prototype `DocTopRight`):
 * who you are, Insert (opens the inspector on its Insert tab, or closes it
 * when that tab is already up) and Share. The editor's own save state and
 * "Page options" menu are drawn into the two slots at either end (see
 * `pages/doc-head-slot`).
 */
export function DocTopRight({ isDatabase = false }: { isDatabase?: boolean }) {
  const session = useSession();
  const [panelOpen, setPanelOpen] = useDocPanel();
  const tab = useNeedt3Ui((s) => s.docTab);
  const setTab = useNeedt3Ui((s) => s.setDocTab);
  const shareOpen = useNeedt3Ui((s) => s.docShareOpen);
  const setShare = useNeedt3Ui((s) => s.setDocShareOpen);
  const user = session.data?.user;
  const name = user?.name || user?.email?.split("@")[0] || "Account";
  const insertOn = panelOpen && tab === "insert";
  return (
    <>
      <span ref={setStatusSlot} className="base-row doc-head-slot" />
      <Avatar
        initials={initialsOf(name)}
        name={name}
        size={28}
        src={user?.image}
      />
      {isDatabase ? null : (
        <button
          type="button"
          className="nx-btn nx-btn-secondary nx-btn-sm"
          data-doc-insert-btn=""
          aria-expanded={insertOn}
          title={copy.DocTopRight.insert_a_block_or_type_on_the_page}
          onClick={() => {
            if (insertOn) {
              setPanelOpen(false);
              return;
            }
            setTab("insert");
            setPanelOpen(true);
          }}
        >
          <LuPlus size={14} aria-hidden />
          {copy.DocTopRight.insert}
        </button>
      )}
      <button
        type="button"
        className="nx-btn nx-btn-secondary nx-btn-sm"
        data-doc-share-btn=""
        aria-expanded={shareOpen}
        aria-haspopup="dialog"
        onClick={() => setShare(true)}
      >
        <LuUsers size={14} aria-hidden />
        {copy.DocTopRight.share}
      </button>
      <span ref={setMoreSlot} className="base-row doc-head-slot" />
    </>
  );
}

/** The far right of the top bar: the inspector's own toggle (⌘⌥\). */
export function DocPanelToggle() {
  const [open, setOpen] = useDocPanel();
  const label = (open ? "Hide" : "Show") + " the side panel";
  return (
    <Tooltip label={label} keys="⌘⌥\\" side="bottom">
      <button
        type="button"
        className="nx-press sk-rtoggle"
        aria-label={label}
        aria-pressed={open}
        data-docpanel-toggle=""
        onClick={() => setOpen(!open)}
      >
        <LuPanelRight size={18} />
      </button>
    </Tooltip>
  );
}
