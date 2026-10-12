"use client";

import { useRouter } from "next/navigation";

import { useSharedDocs } from "@/lib/needt3/hooks/places";

import strings from "../../../../docs/port/prototype/port/strings/en.json";
import { Art } from "../menu/Art";
import { PlEmpty, StScreen } from "../states/StScreen";
import { PlDocCard } from "./PlDocCard";
import { PlaceHeader } from "./PlaceHeader";
import { roleLabel, sharedMeta } from "./derive";

const sh = strings["places.jsx"].SharedScreen;

/**
 * Shared (places.jsx `SharedScreen`): it only lists what others shared, so
 * there is no "+" (owner, 07.10.26). A card opens the page with its role.
 *
 * //todo: "From <name>" and the person's avatar under each card, and the
 * "updated 2 h ago" line: `GET /api/pages` sends no owner. Moodboards shared
 * with the person are not listed either (no route).
 */
export function SharedScreen() {
  const router = useRouter();
  const shared = useSharedDocs();
  const list = shared.data ?? [];

  return (
    <div className="scroll-inner pl-page" data-v3-screen="shared">
      <PlaceHeader
        art="stack"
        title={sh.shared_with_me}
        meta={sharedMeta(list.length)}
      />
      <StScreen query={shared} kind="grid" screen="shared">
        {!list.length ? (
          <PlEmpty
            art={<Art name="stack" size={56} />}
            title={sh.nothing_shared_with_you_yet}
            line={sh.when_someone_shares_a_page_with_you_it_s}
            action={
              <button
                type="button"
                className="nx-btn nx-btn-secondary"
                onClick={() => router.push("/pages")}
              >
                {sh.go_to_documents}
              </button>
            }
          />
        ) : (
          <div className="pl-templates-grid">
            {list.map(({ doc, role }, i) => (
              <div
                key={doc.id}
                className="nx-swap pl-shared-col"
                style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
              >
                <PlDocCard
                  title={doc.title || "Untitled"}
                  label={roleLabel(role)}
                  onOpen={() => router.push(`/pages/${doc.id}`)}
                />
              </div>
            ))}
          </div>
        )}
      </StScreen>
    </div>
  );
}
