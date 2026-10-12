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
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        initials
      )}
    </span>
  );
}

export function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}
