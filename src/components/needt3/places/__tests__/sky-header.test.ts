/**
 * Templates and Shared open on the painted-sky banner (places.jsx
 * `PlSceneHeader`): the markup the vendored places.css / app.css select on.
 * Server markup only; the sky itself runs in a browser.
 */
import { createElement as h } from "react";

import { renderToStaticMarkup } from "react-dom/server";

import type { V3SharedDoc, V3Template } from "@/lib/needt3/hooks/places";
import type { V3Doc } from "@/lib/needt3/map";

import { PlCollage, tileFill } from "../PlCollage";
import { PlSceneHeader } from "../PlSceneHeader";
import { SharedScreen } from "../SharedScreen";
import { TemplatesScreen } from "../TemplatesScreen";
import type { TemplatesController } from "../useTemplatesController";

// V3Root pulls the whole stylesheet entry in; the screens only ask it a flag.
jest.mock("../../root/V3Root", () => ({ useDesignV3: () => false }));
let sharedList: V3SharedDoc[] = [];
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("@/lib/needt3/hooks/places", () => ({
  useSharedDocs: () => ({
    status: "success",
    fetchStatus: "idle",
    data: sharedList,
    error: null,
    refetch: jest.fn(),
  }),
}));

const doc = (id: string, title: string): V3Doc => ({
  id,
  title,
  icon: null,
  coverUrl: null,
  isFavorite: false,
  trashedAt: null,
  projectId: null,
  style: null,
  createdAt: null,
  updatedAt: null,
});

const query = (data: unknown) => ({
  status: "success" as const,
  fetchStatus: "idle" as const,
  data,
  error: null,
  refetch: jest.fn(),
});

const tpl = (n: number): V3Template[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    name: `Template ${i}`,
    description: `${i + 2} blocks`,
    updatedAt: null,
  }));

const controller = (list: V3Template[]) =>
  ({
    templates: query(list),
    make: { isPending: false },
    list,
    makePage: jest.fn(),
  }) as unknown as TemplatesController;

describe("PlSceneHeader", () => {
  const prints = [1, 2, 3, 4].map((i) => ({
    id: `p${i}`,
    title: `Page ${i}`,
    caption: `Cap ${i}`,
    doc: { coverUrl: null, style: null },
    onOpen: jest.fn(),
  }));
  const html = renderToStaticMarkup(
    h(PlSceneHeader, {
      variant: "b",
      kicker: "Templates",
      title: "Templates",
      meta: "6 to start from",
      prints,
    })
  );

  it("sits on the sky panel: kicker, big display title, meta line", () => {
    expect(html).toContain('class="pl-scene nx-swap pl-scene-header-header"');
    expect(html).toContain('data-pl-scene="b"');
    expect(html).toContain("px-sky");
    expect(html).toContain('data-px-sky="b"');
    expect(html).toContain('<span class="px-kicker">Templates</span>');
    expect(html).toMatch(
      /<h1 class="px-display px-on-sky pl-scene-header-text">Templates<\/h1>/
    );
    expect(html).toContain("6 to start from");
  });

  it("shows at most three prints, each a button on frosted glass with its caption", () => {
    expect(html.match(/px-glass/g)).toHaveLength(3);
    expect(html.match(/role="button"/g)).toHaveLength(3);
    expect(html).toContain("Cap 3");
    expect(html).not.toContain("Cap 4");
    expect(html).toContain('aria-label="Open Page 1"');
  });
});

describe("Templates screen", () => {
  it("opens on the sky banner (variant b) above the grid, not on a plain header", () => {
    const out = renderToStaticMarkup(
      h(TemplatesScreen, { c: controller(tpl(6)) })
    );
    expect(out).toContain('data-pl-scene="b"');
    expect(out).toContain("px-sky");
    expect(out).toContain("6 to start from");
    expect(out).not.toContain("pl-place-header-row");
    expect(out).toContain("pl-templates-grid");
    // the three first templates are the prints
    expect(out.match(/px-glass/g)).toHaveLength(3);
  });

  it("keeps the banner when empty, with no prints", () => {
    const out = renderToStaticMarkup(h(TemplatesScreen, { c: controller([]) }));
    expect(out).toContain('data-pl-scene="b"');
    expect(out).toContain("Nothing to start from yet");
    expect(out).not.toContain("px-glass");
    expect(out).toContain("No templates yet");
  });
});

describe("Shared screen", () => {
  it("opens on the sky banner (variant d) with the roles as captions", () => {
    sharedList = [
      { doc: doc("a", "Type scale"), role: "EDITOR" },
      { doc: doc("b", "Quote"), role: "VIEWER" },
    ];
    const out = renderToStaticMarkup(h(SharedScreen));
    expect(out).toContain('data-pl-scene="d"');
    expect(out).toContain('<span class="px-kicker">Shared</span>');
    expect(out).toContain("Shared with me</h1>");
    expect(out).not.toContain("pl-place-header-row");
    expect(out).toContain("Can edit");
    expect(out).toContain("pl-templates-grid");
  });
});

describe("PlCollage", () => {
  const t = (
    id: string,
    kind: "image" | "link" | "color" | "note",
    extra: object = {}
  ) => ({
    id,
    kind,
    url: null,
    color: null,
    text: null,
    thumbnailUrl: null,
    ...extra,
  });

  it("makes the first of several tiles tall and a lone tile wide", () => {
    const three = renderToStaticMarkup(
      h(PlCollage, {
        height: 150,
        items: [
          t("1", "color", { color: "#111111" }),
          t("2", "note", { text: "hello" }),
          t("3", "image", { url: "https://x.test/a.jpg" }),
        ],
      })
    );
    expect(three).toContain('data-pl-collage="3"');
    expect(three).toContain("pl-collage-el is-tall");
    expect(three).toContain("hello");
    expect(three).not.toContain("pl-collage-grid-2");
    const one = renderToStaticMarkup(
      h(PlCollage, { height: 150, items: [t("1", "color", { color: "#111" })] })
    );
    expect(one).toContain("pl-collage-el is-wide");
  });

  it("shows the grey picture glyph only for an empty board", () => {
    const out = renderToStaticMarkup(h(PlCollage, { height: 150, items: [] }));
    expect(out).toContain("pl-collage-grid-2");
    expect(out).toContain('data-pl-collage="0"');
  });

  it("paints a picture, a swatch, or a plain fill, never an unchecked colour", () => {
    expect(
      tileFill({
        id: "1",
        kind: "image",
        url: "https://x.test/a.jpg",
        color: null,
        text: null,
        thumbnailUrl: null,
      })
    ).toBe('center / cover no-repeat url("https://x.test/a.jpg")');
    expect(
      tileFill({
        id: "2",
        kind: "link",
        url: "https://x.test",
        color: null,
        text: null,
        thumbnailUrl: "/t.png",
      })
    ).toContain('url("/t.png")');
    expect(
      tileFill({
        id: "3",
        kind: "color",
        url: null,
        color: "#8a8178",
        text: null,
        thumbnailUrl: null,
      })
    ).toBe("#8a8178");
    expect(
      tileFill({
        id: "4",
        kind: "color",
        url: null,
        color: "red; x: y",
        text: null,
        thumbnailUrl: null,
      })
    ).toBe("var(--fill-2)");
    expect(
      tileFill({
        id: "5",
        kind: "note",
        url: null,
        color: null,
        text: "n",
        thumbnailUrl: null,
      })
    ).toBe("var(--fill-2)");
  });
});
