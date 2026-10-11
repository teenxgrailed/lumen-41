"use client";

import strings from "../../../../docs/port/prototype/port/strings/en.json";
import { Art } from "../menu/Art";
import { PlEmpty, StScreen } from "../states/StScreen";
import { PlDocCard } from "./PlDocCard";
import { PlaceHeader } from "./PlaceHeader";
import { templatesMeta } from "./derive";
import type { TemplatesController } from "./useTemplatesController";

const tp = strings["places.jsx"].TemplatesScreen;

/**
 * Templates (places.jsx `TemplatesScreen`): a template is picked, not made,
 * on this screen (owner, 07.10.26), so there is no "+". A card makes a page
 * titled "<template> — <day>" and opens it; Undo sends the page to Trash.
 */
export function TemplatesScreen({ c }: { c: TemplatesController }) {
  const { templates, make, list, makePage } = c;

  return (
    <div className="scroll-inner pl-page" data-v3-screen="templates">
      <PlaceHeader
        art="template"
        title={tp.templates}
        meta={templatesMeta(list.length)}
      />
      <StScreen query={templates} kind="grid" screen="templates">
        {!list.length ? (
          <PlEmpty
            art={<Art name="template" size={56} />}
            title={tp.no_templates_yet}
            line={tp.templates_you_save_from_a_page_show_up_h}
          />
        ) : (
          <div className="pl-templates-grid">
            {list.map((t, i) => (
              <div
                key={t.id}
                className="nx-swap"
                style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
              >
                <PlDocCard
                  title={t.name}
                  meta={t.description}
                  busy={make.isPending}
                  onOpen={() => void makePage(t.id, t.name)}
                />
              </div>
            ))}
          </div>
        )}
      </StScreen>
    </div>
  );
}
