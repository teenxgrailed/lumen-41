"use client";

import { previewOf } from "@/lib/needt3/builtin-templates";

import strings from "../../../../docs/port/prototype/port/strings/en.json";
import { Art } from "../menu/Art";
import { PlEmpty, StScreen } from "../states/StScreen";
import { PlDocCard } from "./PlDocCard";
import { PlSceneHeader } from "./PlSceneHeader";
import { templatesMeta } from "./derive";
import type { TemplatesController } from "./useTemplatesController";

const tp = strings["places.jsx"].TemplatesScreen;

/**
 * Templates (places.jsx `TemplatesScreen`): a template is picked, not made,
 * on this screen (owner, 07.10.26), so there is no "+". The person's own
 * templates come first, then the set that comes with Needt. A card makes a
 * page titled "<template> — <day>" and opens it; Undo sends the page to Trash.
 */
export function TemplatesScreen({ c }: { c: TemplatesController }) {
  const { templates, make, list, makePage } = c;

  return (
    <div className="scroll-inner pl-page" data-v3-screen="templates">
      <PlSceneHeader
        variant="b"
        kicker={tp.templates}
        title={tp.templates}
        meta={templatesMeta(list.length)}
        // A saved template carries no look of its own yet, so its print is the
        // plain page; a built-in one brings its page colour. The prototype
        // shows the styled ones first.
        prints={[...list]
          .sort((a, b) => Number(!!b.builtin) - Number(!!a.builtin))
          .slice(0, 3)
          .map((t) => ({
            id: t.id,
            title: t.name,
            caption: t.name,
            doc: { coverUrl: null, style: t.builtin?.style ?? null },
            onOpen: () => void makePage(t.id, t.name),
          }))}
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
                  rows={t.builtin ? previewOf(t.builtin.body) : undefined}
                  style={t.builtin?.style}
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
