"use client";

import { FiChevronRight, FiExternalLink } from "react-icons/fi";

import { currentBuildLabel } from "@/lib/build-info";
import { openHelp } from "@/lib/needt3/help";
import { useStoreDistribution } from "@/lib/use-store-distribution";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { useShellApi } from "../shell/ShellContext";
import { SGroup, SRow } from "./kit";

/**
 * What's new opens the sidebar's WhatsNew panel (Settings leaves first, as
 * the sheet sinks); Help opens the guides on the website in a new tab; Terms
 * and Privacy open the pages.
 * Version is the build SHA baked in at release (`lib/build-info`).
 */
export function AboutSection() {
  const shell = useShellApi();
  const store = useStoreDistribution();
  const close = useNeedt3Ui((s) => s.closeSettings);
  return (
    <SGroup>
      <SRow title="Version" desc={`Needt · ${currentBuildLabel()}`} />
      <SRow
        title="What's new"
        onClick={() => {
          close();
          shell.openWhatsNew();
        }}
      >
        <FiChevronRight size={14} aria-hidden />
      </SRow>
      {store ? null : (
        <SRow title="Help" onClick={openHelp}>
          <FiExternalLink size={14} aria-hidden />
        </SRow>
      )}
      <SRow title="Terms" onClick={() => window.open("/terms", "_blank")}>
        <FiExternalLink size={14} aria-hidden />
      </SRow>
      <SRow title="Privacy" onClick={() => window.open("/privacy", "_blank")}>
        <FiExternalLink size={14} aria-hidden />
      </SRow>
      <SRow title="Support" onClick={() => window.open("/support", "_blank")}>
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
