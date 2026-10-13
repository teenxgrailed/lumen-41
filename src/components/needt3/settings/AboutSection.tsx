"use client";

import { FiChevronRight, FiExternalLink } from "react-icons/fi";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { useShellApi } from "../shell/ShellContext";
import { SGroup, SRow } from "./kit";

/**
 * What's new opens the sidebar's WhatsNew panel (Settings leaves first, as
 * the sheet sinks); Terms and Privacy open the pages.
 * //todo: Version (no build number is exposed to the client) and the Help
 * centre (no URL yet).
 */
export function AboutSection() {
  const shell = useShellApi();
  const close = useNeedt3Ui((s) => s.closeSettings);
  return (
    <SGroup>
      <SRow
        title="What's new"
        onClick={() => {
          close();
          shell.openWhatsNew();
        }}
      >
        <FiChevronRight size={14} aria-hidden />
      </SRow>
      <SRow title="Terms" onClick={() => window.open("/terms", "_blank")}>
        <FiExternalLink size={14} aria-hidden />
      </SRow>
      <SRow title="Privacy" onClick={() => window.open("/privacy", "_blank")}>
        <FiExternalLink size={14} aria-hidden />
      </SRow>
      <SRow
        title="Subprocessors"
        onClick={() => window.open("/subprocessors", "_blank")}
      >
        <FiExternalLink size={14} aria-hidden />
      </SRow>
    </SGroup>
  );
}
