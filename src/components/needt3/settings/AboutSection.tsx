"use client";

import { FiExternalLink } from "react-icons/fi";

import { SGroup, SRow } from "./kit";

/**
 * //todo: Version (no build number is exposed to the client), What's new
 * (the sidebar's WhatsNew panel), Help centre and Terms / privacy URLs.
 */
export function AboutSection() {
  return (
    <SGroup>
      <SRow title="Terms" onClick={() => window.open("/terms", "_blank")}>
        <FiExternalLink size={14} aria-hidden />
      </SRow>
      <SRow title="Privacy" onClick={() => window.open("/privacy", "_blank")}>
        <FiExternalLink size={14} aria-hidden />
      </SRow>
    </SGroup>
  );
}
