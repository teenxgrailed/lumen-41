"use client";

/* THE PRODUCT'S NOTIFICATIONS. Two surfaces: the stack in the corner the
 * design speaks from carries what the product says on its own (`island`
 * notices); the action toasts, a compact pill at the bottom centre, carry
 * everything you did and its Undo (`toast`, the default).
 *
 * `NeedtCorner` composes the stack with `ChatCorner`, the design's chat pill.
 * The application already has a companion and a chat overlay of its own in
 * that corner, so only the stack is mounted here — two pills would be two
 * products.
 *
 * `.needt-v2` with a `data-theme` is the scope the design's tokens resolve
 * in, and `.nf-stack` is positioned against the nearest positioned ancestor,
 * so this supplies both. The frame takes no pointer events; the cards inside
 * it take their own.
 */
import * as React from "react";

import { useResolvedTheme } from "../use-resolved-theme";
import { ActionToasts } from "./ActionToasts";
import { NotificationStack } from "./NotificationStack";
import { setNoticeSink } from "./bridge";
import { NeedtNoticeProvider, useNotify } from "./notices";

/** Hands the mounted stack to the plain-function facade, and takes it back. */
function Sink() {
  const api = useNotify();
  React.useEffect(() => {
    setNoticeSink(api, "island");
    return () => setNoticeSink(null, "island");
  }, [api]);
  return null;
}

export function NeedtNotices() {
  const theme = useResolvedTheme();

  return (
    <NeedtNoticeProvider>
      <Sink />
      <div
        /* `needt-v2` for the tokens, `needt-notices` so a selector can
           say "the application's own scope" and not catch this one: it is
           chrome the app mounts beside every screen, not a screen. */
        className="needt-v2 needt-notices"
        data-theme={theme}
        /* `.nf-stack` is 348px wide and positions itself against the nearest
           positioned ancestor, so this anchor is the right-hand strip and
           nothing more. It covered the viewport in the first cut, which put
           a transparent layer over every pixel of every screen and marked
           the whole window as somewhere the companion must keep clear of.
           `.needt-v2` is also the page scope and paints the canvas, so the
           anchor says it is transparent: without that the strip is an
           opaque slab over the right of every screen, the whole window on a
           phone. */
        style={{
          background: "transparent",
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 388,
          zIndex: 480,
          pointerEvents: "none",
        }}
      >
        <NotificationStack />
        {/* Fixed to the viewport, not to the strip: the toasts are centred. */}
        <ActionToasts />
      </div>
    </NeedtNoticeProvider>
  );
}
