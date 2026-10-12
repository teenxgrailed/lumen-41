import Image from "next/image";

import { ExposureWordmark } from "./ExposureWordmark";

/**
 * The Needt app icon ("Swing": the n on the lavender-to-pearl squircle). The
 * tile carries its own continuous-corner shape and transparent corners, so it
 * needs no radius or clip. Decorative by default: the wordmark beside it
 * already names the app; pass `label` to make it an image. Not for the sidebar
 * profile slot: that one is the person's avatar.
 */
export function NeedtAppIcon({
  size = 48,
  className,
  label,
}: {
  size?: number;
  className?: string;
  label?: string;
}) {
  return (
    <Image
      src="/brand/needt-icon.svg"
      width={size}
      height={size}
      unoptimized
      draggable={false}
      alt={label || ""}
      aria-hidden={label ? undefined : true}
      className={"needt-app-icon" + (className ? " " + className : "")}
    />
  );
}

/** Icon and wordmark side by side, on the sky (sign-in, onboarding, paywall). */
export function NeedtLockup({
  small,
  mode = "breathe",
}: {
  small?: boolean;
  mode?: "still" | "breathe" | "breathe+pulse";
}) {
  return (
    <span
      data-px-calm
      className={"auth-flex needt-lockup" + (small ? " needt-lockup-sm" : "")}
    >
      <NeedtAppIcon size={small ? 40 : 52} />
      <ExposureWordmark
        size={small ? 30 : 44}
        mode={mode}
        style={{
          color: "var(--px-ink)",
          textShadow: "0 0 18px var(--px-halo), 0 0 6px var(--px-halo)",
        }}
      />
    </span>
  );
}
