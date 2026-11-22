/**
 * Learn's screens as server markup from plain props: the overview with the
 * samples or the person's own topics as folders, and a topic's lessons as the
 * overlapping card stack.
 */
import { createElement as h } from "react";

import { renderToStaticMarkup } from "react-dom/server";

import { type LearnOverview, SAMPLE_TOPIC_VIEWS } from "@/lib/needt3/learn";

import { LearnOverviewView } from "../LearnOverview";
import { LearnTopicView } from "../LearnTopic";
import { cardColor } from "../LessonStack";

jest.mock("../../root/V3Root", () => ({ useDesignV3: () => false }));
jest.mock("next/navigation", () => ({
  usePathname: () => "/learn",
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const noop = () => undefined;

const overview = (o: LearnOverview | undefined, pro = true) =>
  renderToStaticMarkup(
    h(LearnOverviewView, {
      data: o,
      pro,
      onOpen: noop,
      onNew: noop,
      onMakeMine: noop,
    })
  );

describe("overview", () => {
  it("shows the samples as folders, marked, with Make it mine", () => {
    const html = overview({ topics: [], today: { completed: 0, limit: null } });
    expect(html).toContain(">Learning</h1>");
    expect(html).toContain("data-ln-samples");
    for (const t of ["Deutsch", "Design", "Finance"]) expect(html).toContain(t);
    expect(html.match(/class="nx-folder"/g)).toHaveLength(3);
    expect(html).toContain('data-ln-make-mine="deutsch"');
    expect(html).toContain("New topic");
    // At most three sheets stick out of a folder.
    const first = html.split('data-ln-topic="sample-design"')[0];
    expect((first.match(/data-folder-peek/g) ?? []).length).toBeLessThanOrEqual(
      3
    );
  });

  it("shows the person's own topics instead of the samples", () => {
    const html = overview(
      {
        topics: [
          {
            ...SAMPLE_TOPIC_VIEWS[0],
            id: "t1",
            sample: false,
            sampleKey: null,
          },
        ],
        today: { completed: 1, limit: 1 },
      },
      false
    );
    expect(html).not.toContain("data-ln-samples");
    expect(html).not.toContain("data-ln-make-mine");
    expect(html).toContain("Today&#x27;s free lesson is done");
  });

  it("draws nothing but the title while loading", () => {
    const html = overview(undefined);
    expect(html).toContain("Learning");
    expect(html).not.toContain("nx-folder");
  });
});

describe("topic", () => {
  const topic = SAMPLE_TOPIC_VIEWS[0];
  const render = (extra: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      h(LearnTopicView, {
        topic,
        missing: false,
        pro: true,
        today: { completed: 0, limit: null },
        promo: null,
        trial: false,
        generating: false,
        scheduling: null,
        onClosePromo: noop,
        onStart: noop,
        onGenerate: noop,
        ...extra,
      })
    );

  it("stacks the lessons as cards with a source line and a ringed mark", () => {
    const html = render({ onMakeMine: noop });
    expect(html.match(/data-ln-card="/g)).toHaveLength(topic.lessons.length);
    expect(html).toContain("Sample · 6 min");
    expect(html).toContain("ln-card-ring is-1");
    expect(html).toContain('data-ln-chip="all"');
    // A sample offers Make it mine instead of AI.
    expect(html).toContain("data-ln-make-mine");
    expect(html).not.toContain("data-ln-generate");
  });

  it("shows the promo above the stack when asked, not inside a lesson", () => {
    const html = render({ promo: "limit", pro: false });
    expect(html).toContain('data-ln-promo="limit"');
    expect(html.indexOf("data-ln-promo")).toBeLessThan(
      html.indexOf("data-ln-stack")
    );
  });

  it("neighbouring cards wear different washes", () => {
    const colors = [0, 1, 2, 3].map((i) => cardColor("violet", i));
    expect(new Set(colors).size).toBe(4);
    expect(cardColor("amber", 0)).toBe("amber");
  });
});
