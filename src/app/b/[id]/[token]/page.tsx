import type { Metadata } from "next";

import { getPublicMoodboard } from "@/services/moodboards/moodboard-service";

import { PublicScope } from "@/components/needt3/states/PublicScope";

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
      <PublicScope>
        <main className="pub-page is-narrow">
          <h1 className="pub-title">This moodboard is not shared</h1>
          <p className="pub-lead">
            The link may have been turned off, or it is mistyped.
          </p>
        </main>
      </PublicScope>
    );
  }
  return (
    <PublicScope>
      <main className="pub-page">
        <h1 className="pub-title">{board.title}</h1>
        <p className="pub-lead">
          {board.items.length}{" "}
          {board.items.length === 1 ? "reference" : "references"} · view only
        </p>
        {board.items.length ? (
          <div className="pub-wall">
            {board.items.map((it) => (
              <figure key={it.id} className="pub-tile">
                {it.kind === "image" && it.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a stored picture of unknown size
                  <img
                    src={it.url}
                    alt={it.title ?? ""}
                    referrerPolicy="no-referrer"
                    className="pub-tile-img"
                  />
                ) : it.kind === "color" && it.color && HEX.test(it.color) ? (
                  <div
                    className="pub-swatch"
                    style={{
                      background: it.color,
                      aspectRatio: String(1 / (it.ratio || 0.8)),
                    }}
                    role="img"
                    aria-label={it.colorName || it.color}
                  />
                ) : it.kind === "note" ? (
                  <p className="pub-note">{it.text}</p>
                ) : it.kind === "link" && it.url ? (
                  <a
                    href={it.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="pub-link"
                  >
                    {it.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- remote preview picture
                      <img
                        src={it.thumbnailUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                      />
                    ) : null}
                    <span className="pub-link-body">
                      <span className="pub-link-title">
                        {it.title || it.source?.domain}
                      </span>
                      <span className="pub-meta">{it.source?.domain}</span>
                    </span>
                  </a>
                ) : null}
                {it.text && it.kind !== "note" ? (
                  <figcaption className="pub-tile-cap">{it.text}</figcaption>
                ) : null}
              </figure>
            ))}
          </div>
        ) : (
          <p className="pub-empty">Nothing on this board yet.</p>
        )}
      </main>
    </PublicScope>
  );
}
