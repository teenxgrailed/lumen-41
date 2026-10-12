import type { Metadata } from "next";

import { getPublicMoodboard } from "@/services/moodboards/moodboard-service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Moodboard",
  robots: { index: false, follow: false },
  // A shared board's address carries its secret: never send it on to a link's site.
  referrer: "no-referrer",
};

type Params = { params: Promise<{ id: string; token: string }> };

const HEX = /^#[0-9a-f]{3,8}$/i;

/**
 * "Anyone with the link": a read-only view of one moodboard, no sign-in.
 * It reads the same rows as the board page and shows pictures, colours,
 * notes and links in wall order; nothing here can write.
 */
export default async function PublicMoodboardPage({ params }: Params) {
  const { id, token } = await params;
  const board = await getPublicMoodboard(id, token);
  if (!board) {
    return (
      <main style={{ maxWidth: 520, margin: "20vh auto", padding: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>
          This moodboard is not shared
        </h1>
        <p style={{ opacity: 0.7, marginTop: 8 }}>
          The link may have been turned off, or it is mistyped.
        </p>
      </main>
    );
  }
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, marginBottom: 4 }}>
        {board.title}
      </h1>
      <p style={{ opacity: 0.6, marginBottom: 24 }}>
        {board.items.length}{" "}
        {board.items.length === 1 ? "reference" : "references"} · view only
      </p>
      {board.items.length ? (
        <div style={{ columnWidth: 240, columnGap: 14 }}>
          {board.items.map((it) => (
            <figure
              key={it.id}
              style={{ margin: "0 0 14px", breakInside: "avoid" }}
            >
              {it.kind === "image" && it.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- a stored picture of unknown size
                <img
                  src={it.url}
                  alt={it.title ?? ""}
                  referrerPolicy="no-referrer"
                  style={{ width: "100%", borderRadius: 14, display: "block" }}
                />
              ) : it.kind === "color" && it.color && HEX.test(it.color) ? (
                <div
                  style={{
                    background: it.color,
                    aspectRatio: String(1 / (it.ratio || 0.8)),
                    borderRadius: 14,
                  }}
                  role="img"
                  aria-label={it.colorName || it.color}
                />
              ) : it.kind === "note" ? (
                <p
                  style={{
                    padding: 16,
                    borderRadius: 14,
                    background: "rgba(127,127,127,0.12)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {it.text}
                </p>
              ) : it.kind === "link" && it.url ? (
                <a
                  href={it.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  style={{
                    display: "block",
                    borderRadius: 14,
                    overflow: "hidden",
                    background: "rgba(127,127,127,0.12)",
                    color: "inherit",
                    textDecoration: "none",
                  }}
                >
                  {it.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote preview picture
                    <img
                      src={it.thumbnailUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      style={{ width: "100%", display: "block" }}
                    />
                  ) : null}
                  <span style={{ display: "block", padding: 12 }}>
                    <strong style={{ display: "block" }}>
                      {it.title || it.source?.domain}
                    </strong>
                    <span style={{ opacity: 0.6, fontSize: 13 }}>
                      {it.source?.domain}
                    </span>
                  </span>
                </a>
              ) : null}
              {it.text && it.kind !== "note" ? (
                <figcaption
                  style={{ opacity: 0.7, marginTop: 6, fontSize: 13 }}
                >
                  {it.text}
                </figcaption>
              ) : null}
            </figure>
          ))}
        </div>
      ) : (
        <p style={{ opacity: 0.7 }}>Nothing on this board yet.</p>
      )}
    </main>
  );
}
