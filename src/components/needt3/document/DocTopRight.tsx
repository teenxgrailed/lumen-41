"use client";

import { LuPanelRight, LuPlus, LuUsers } from "react-icons/lu";

import { setDocHeadSlot } from "@/components/pages/doc-head-slot";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { docsCopy } from "../docs/DocParts";
import { Tooltip } from "../menu/Tooltip";
import { useDocPanel } from "./panel";

const copy = docsCopy;

// Stable callbacks: an inline ref would be called with null and then the
// element again on every render, which empties the slots (and closes the
// editor's Page options menu) each time this re-renders.
const setStatusSlot = (el: HTMLElement | null) => setDocHeadSlot("status", el);
const setMoreSlot = (el: HTMLElement | null) => setDocHeadSlot("more", el);

/**
 * The top bar's right side while a document is open (prototype `DocTopRight`):
 * who else is here (never you), Insert (opens the inspector on its Insert tab,
 * or closes it when that tab is already up) and Share. Save state is the
 * shared SyncStatus in the bar; the editor draws the other people into the
 * first slot and its "Page options" menu into the last (see
 * `pages/doc-head-slot`).
 */
export function DocTopRight({ isDatabase = false }: { isDatabase?: boolean }) {
  const [panelOpen, setPanelOpen] = useDocPanel();
  const tab = useNeedt3Ui((s) => s.docTab);
  const setTab = useNeedt3Ui((s) => s.setDocTab);
  const shareOpen = useNeedt3Ui((s) => s.docShareOpen);
  const setShare = useNeedt3Ui((s) => s.setDocShareOpen);
  const insertOn = panelOpen && tab === "insert";
  return (
    <>
      <span ref={setStatusSlot} className="base-row doc-head-slot" />
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
