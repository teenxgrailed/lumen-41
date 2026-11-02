"use client";

import { useState } from "react";

import { initialsOf as initialsOfName } from "@/lib/needt3/initials";

/** The design system's Avatar: raised square, initials, never a picture of
 *  something else. Radius md up to 28px, 2xl above. */
export function Avatar({
  initials,
  name,
  size = 36,
  src,
}: {
  initials: string;
  name: string;
  size?: number;
  src?: string | null;
}) {
  // A picture that fails to load (a dead URL, a blocked host) gives way to the
  // initials, and tries again when the address changes.
  const [broken, setBroken] = useState<string | null>(null);
  const failed = !!src && broken === src;
  return (
    <span
      className="raised"
      aria-label={name}
      style={{
        display: "grid",
        placeItems: "center",
        width: size,
        height: size,
        flex: "none",
        borderRadius: size <= 28 ? "var(--radius-md)" : "var(--radius-2xl)",
        font: "var(--type-meta-medium)",
        color: "var(--text-secondary)",
        overflow: "hidden",
      }}
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={() => setBroken(src)}
        />
      ) : (
        initials
      )}
    </span>
  );
}

export function initialsOf(name: string) {
  return initialsOfName(name);
}
