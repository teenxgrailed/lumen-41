"use client";

import strings from "../../../../../docs/port/prototype/port/strings/en.json";
import { templatesMeta } from "../../places/derive";
import type { TemplatesController } from "../../places/useTemplatesController";
import { PkButton, PkEmpty, PkScreen } from "../kit";
import { PhoneState } from "./Parts";
import { templateHits } from "./logic";

const tp = strings["places.jsx"].TemplatesScreen;

/**
 * The cover: a small page with a title bar and three lines. A saved template
 * is a name and a description to the list route (its blocks are not sent), so
 * the cover is the same page for every card; it is a picture of "a page", not
 * of this template's blocks.
 */
function PplCover() {
  return (
    <span className="ppl-cover" aria-hidden="true">
      <span className="ppl-cover-page">
        <span className="ppl-cover-title" />
        {[0, 1, 2].map((i) => (
          <span key={i} className="ppl-cover-b is-p">
            <span className="ppl-cover-line" />
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * Templates on the phone (phone-places.jsx `PplTemplates`): a grid of the
 * person's own templates, "Use" on each. Use is the desktop's flow, owned by
 * the controller: a page titled "<template> — <day>", a notice with Undo
 * (the page goes to Trash), and the page opens.
 *
 * The person's own templates come first, then the set that comes with Needt
 * (`list` is both; a built-in card says "Built in · N blocks").
 * //todo: a preview sheet (the list route sends no blocks for saved
 * templates), "Yours" vs built-in sections.
 */
export function TemplatesPhone({ c }: { c: TemplatesController }) {
  const { templates, make, list, makePage } = c;
  return (
    <PkScreen
      screen="templates"
      title="Templates"
      glyph="templates"
      sub={templatesMeta(list.length)}
      onPull={{
        search: (q) => templateHits(list, q),
        onPick: (h) => {
          const t = list.find((x) => x.id === h.id);
          if (t) void makePage(t.id, t.name);
        },
        placeholder: "Search templates",
        hint: "Templates by name. Pick one to start a page from it.",
      }}
    >
      <PhoneState query={templates} screen="templates">
        {!list.length ? (
          <PkEmpty
            title={tp.no_templates_yet}
            line={tp.templates_you_save_from_a_page_show_up_h}
          />
        ) : (
          <div className="ppl-grid" data-ppl-grid="">
            {list.map((t) => (
              <div key={t.id} className="ppl-card" data-ppl-template={t.name}>
                <div className="ppl-card-open">
                  <PplCover />
                  <span className="ppl-card-text">
                    <span className="ppl-card-title">
                      {t.name || "Untitled"}
                    </span>
                    <span className="ppl-card-meta">
                      {t.description || "Page template"}
                    </span>
                  </span>
                </div>
                <PkButton
                  kind="primary"
                  small
                  className="ppl-card-use"
                  disabled={make.isPending}
                  aria-busy={make.isPending || undefined}
                  aria-label={`Use ${t.name || "Untitled"}`}
                  onClick={() => void makePage(t.id, t.name)}
                  data-ppl-use={t.name}
                >
                  Use
                </PkButton>
              </div>
            ))}
          </div>
        )}
      </PhoneState>
    </PkScreen>
  );
}
