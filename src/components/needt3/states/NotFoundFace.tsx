"use client";

import Link from "next/link";

import { Art } from "../menu/Art";
import { PkEmpty } from "../phone/kit/Material";
import { PkScreen } from "../phone/kit/Screen";
import { usePhoneUi } from "../root/phone-ui-context";
import { PlEmpty } from "./StScreen";

export const NOT_FOUND_COPY = {
  title: "Nothing here",
  line: "The link may be old, or what it pointed to has moved.",
  home: "Go to Home",
};

/**
 * design_v3's unknown address: inside the v3 shell (sidebar / phone menu
 * stay), one quiet empty state and a way Home — instead of the old dark
 * full-screen 404. Flag off never reaches it (`[...missing]` sends that case
 * to the root `not-found`).
 */
export function NotFoundFace() {
  const action = (
    <Link href="/today" className="nx-btn nx-btn-secondary" data-v3-404-home>
      {NOT_FOUND_COPY.home}
    </Link>
  );
  if (usePhoneUi() === "phone") {
    return (
      <PkScreen title={NOT_FOUND_COPY.title} screen="not-found">
        <PkEmpty
          title={NOT_FOUND_COPY.title}
          line={NOT_FOUND_COPY.line}
          action={action}
        />
      </PkScreen>
    );
  }
  return (
    <div className="scroll-inner pl-page" data-v3-screen="not-found">
      <PlEmpty
        art={<Art name="page" size={56} />}
        title={NOT_FOUND_COPY.title}
        line={NOT_FOUND_COPY.line}
        action={action}
      />
    </div>
  );
}
