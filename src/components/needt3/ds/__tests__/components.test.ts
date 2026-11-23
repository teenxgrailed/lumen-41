/**
 * The ten shared components, rendered: roles, ARIA, the one spelling of
 * "selected", the 44px hit-area hook, and the one-raised-level markup.
 * (The CSS that makes the hook a 44px box is checked in css.test.ts.)
 */
import { createElement as h } from "react";

import { renderToStaticMarkup } from "react-dom/server";

import {
  Button,
  Chip,
  Dock,
  DockItem,
  Field,
  IconButton,
  Row,
  Segmented,
  SheetPanel,
  Surface,
  Switch,
  Tile,
  selectedAttrs,
} from "..";

const html = (node: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(node);

/** The attributes of the first element of `tag` in `markup`. */
function attrs(markup: string, tag: string): Record<string, string> {
  const open = [...markup.matchAll(/<([a-z0-9]+)\b([^>]*)>/g)].find(
    (m) => m[1] === tag
  );
  if (!open) throw new Error(`no <${tag}> in ${markup}`);
  const out: Record<string, string> = {};
  for (const m of open[2].matchAll(/([\w:-]+)(?:="([^"]*)")?/g))
    out[m[1]] = m[2] ?? "";
  return out;
}

describe("selected has one spelling", () => {
  it("maps each role to its ARIA attribute and data-state", () => {
    expect(selectedAttrs("pressed", true)).toEqual({
      "aria-pressed": true,
      "data-state": "on",
    });
    expect(selectedAttrs("selected", false)).toEqual({
      "aria-selected": false,
      "data-state": "off",
    });
    expect(selectedAttrs("checked", true)).toEqual({
      "aria-checked": true,
      "data-state": "on",
    });
    expect(selectedAttrs("current", true)).toEqual({
      "aria-current": "page",
      "data-state": "on",
    });
    expect(selectedAttrs("current", false)["aria-current"]).toBeUndefined();
  });

  it("never renders a modifier class for it", () => {
    const markup = html(
      h(
        "div",
        null,
        h(Button, { pressed: true }, "On"),
        h(Switch, { checked: true, "aria-label": "S" }),
        h(Chip, { on: true, onClick: () => undefined }, "Chip")
      )
    );
    expect(markup).not.toMatch(/is-on|is-active|is-picked|is-selected/);
    expect(markup.match(/data-state="on"/g)).toHaveLength(3);
  });
});

describe("Button", () => {
  it("is a button with the defaults: secondary, md, type=button", () => {
    const a = attrs(html(h(Button, null, "Save")), "button");
    expect(a["type"]).toBe("button");
    expect(a["data-variant"]).toBe("secondary");
    expect(a["data-size"]).toBe("md");
    expect(a["class"]).toContain("ds-i");
    expect(a["class"]).toContain("ds-press");
  });

  it("takes its variant and size as data, not as classes", () => {
    const a = attrs(
      html(h(Button, { variant: "primary", size: "lg", danger: true }, "Go")),
      "button"
    );
    expect(a["data-variant"]).toBe("primary");
    expect(a["data-size"]).toBe("lg");
    expect(a["class"]).not.toMatch(/primary|lg/);
    expect(a).toHaveProperty("data-danger");
  });

  it("is a toggle only when told: aria-pressed with the state", () => {
    expect(attrs(html(h(Button, null, "x")), "button")).not.toHaveProperty(
      "aria-pressed"
    );
    const on = attrs(html(h(Button, { pressed: true }, "x")), "button");
    expect(on["aria-pressed"]).toBe("true");
    expect(on["data-state"]).toBe("on");
  });

  it("when busy it says so and shows a spinner", () => {
    const markup = html(h(Button, { busy: true }, "Saving"));
    expect(attrs(markup, "button")["aria-busy"]).toBe("true");
    expect(markup).toContain("ds-spin");
  });

  it("passes disabled and force through", () => {
    const a = attrs(
      html(h(Button, { disabled: true, force: "hover" }, "x")),
      "button"
    );
    expect(a).toHaveProperty("disabled");
    expect(a["data-force"]).toBe("hover");
  });
});

describe("IconButton", () => {
  it("is always named: aria-label and title", () => {
    const a = attrs(
      html(h(IconButton, { label: "Close", icon: h("svg") })),
      "button"
    );
    expect(a["aria-label"]).toBe("Close");
    expect(a["title"]).toBe("Close");
    expect(a["data-variant"]).toBe("flat");
    expect(a["data-size"]).toBe("md");
    expect(a["class"]).toContain("ds-i");
  });

  it("is a toggle with pressed", () => {
    const a = attrs(
      html(h(IconButton, { label: "Pin", icon: h("svg"), pressed: false })),
      "button"
    );
    expect(a["aria-pressed"]).toBe("false");
    expect(a["data-state"]).toBe("off");
  });
});

describe("Chip", () => {
  it("is a span when it only labels (a badge, a tag): nothing to press, no hit area", () => {
    const markup = html(h(Chip, { variant: "wash", tone: "blue" }, "New"));
    expect(markup.startsWith("<span")).toBe(true);
    const a = attrs(markup, "span");
    expect(a["data-tone"]).toBe("blue");
    expect(a["class"]).not.toContain("ds-i");
  });

  it("is a button when it has a handler, and then it has the hit area", () => {
    const markup = html(
      h(Chip, { onClick: () => undefined, on: true }, "Work")
    );
    const a = attrs(markup, "button");
    expect(a["type"]).toBe("button");
    expect(a["class"]).toContain("ds-i");
    expect(a["aria-pressed"]).toBe("true");
  });

  it("a tone only means something on a wash", () => {
    const a = attrs(
      html(h(Chip, { variant: "disc", tone: "pink" }, "x")),
      "span"
    );
    expect(a).not.toHaveProperty("data-tone");
  });

  it("a removable chip keeps the body as text and the x as a labelled button", () => {
    const markup = html(
      h(Chip, { onRemove: () => undefined, removeLabel: "Remove tag" }, "Home")
    );
    expect(attrs(markup, "span")["role"]).toBe("group");
    const x = attrs(markup, "button");
    expect(x["aria-label"]).toBe("Remove tag");
    expect(x["class"]).toContain("ds-i");
    expect(markup.match(/<button/g)).toHaveLength(1);
  });
});

describe("Switch", () => {
  it("is role=switch with aria-checked and the state", () => {
    const on = attrs(
      html(h(Switch, { checked: true, "aria-label": "Sound" })),
      "button"
    );
    expect(on["role"]).toBe("switch");
    expect(on["aria-checked"]).toBe("true");
    expect(on["data-state"]).toBe("on");
    expect(on["aria-label"]).toBe("Sound");
    expect(on["class"]).toContain("ds-i");
    const off = attrs(html(h(Switch, { checked: false })), "button");
    expect(off["aria-checked"]).toBe("false");
    expect(off["data-state"]).toBe("off");
  });

  it("has two sizes", () => {
    expect(
      attrs(html(h(Switch, { checked: false })), "button")["data-size"]
    ).toBe("md");
    expect(
      attrs(html(h(Switch, { checked: false, size: "sm" })), "button")[
        "data-size"
      ]
    ).toBe("sm");
  });
});

describe("Segmented", () => {
  const items = [
    { value: "day", label: "Day" },
    { value: "week", label: "Week" },
    { value: "year", label: "Year", disabled: true },
  ];
  const render = (extra: object = {}) =>
    html(
      h(Segmented, {
        "aria-label": "Range",
        items,
        value: "week",
        onChange: () => undefined,
        ...extra,
      })
    );

  it("pill and square are a radio group: aria-checked, one tab stop", () => {
    const markup = render();
    const group = attrs(markup, "div");
    expect(group["role"]).toBe("radiogroup");
    expect(group["aria-label"]).toBe("Range");
    expect(group["data-variant"]).toBe("pill");
    expect(group["data-size"]).toBe("sm");
    expect(markup.match(/role="radio"/g)).toHaveLength(3);
    expect(markup.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(markup.match(/tabindex="0"/g)).toHaveLength(1);
    expect(markup.match(/tabindex="-1"/g)).toHaveLength(2);
    expect(markup.match(/ds-seg-item ds-i/g)).toHaveLength(3);
  });

  it("tabs are a tablist: aria-selected", () => {
    const markup = render({ variant: "tabs", size: "md" });
    expect(attrs(markup, "div")["role"]).toBe("tablist");
    expect(markup.match(/role="tab"/g)).toHaveLength(3);
    expect(markup.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(markup).not.toContain("aria-checked");
  });

  it("marks the chosen item once, and disables what is disabled", () => {
    const markup = render();
    expect(markup.match(/data-state="on"/g)).toHaveLength(1);
    expect(markup.match(/disabled/g)).toHaveLength(1);
  });

  it("fill stretches it; force holds one item in a state", () => {
    const markup = render({
      fill: true,
      force: { value: "day", state: "hover" },
    });
    expect(attrs(markup, "div")).toHaveProperty("data-fill");
    expect(markup.match(/data-force="hover"/g)).toHaveLength(1);
  });
});

describe("Dock", () => {
  it("is a named nav; the place you are in is aria-current=page", () => {
    const markup = html(
      h(Dock, {
        "aria-label": "Main",
        children: [
          h(DockItem, {
            key: "home",
            icon: h("svg"),
            label: "Home",
            active: true,
            href: "/",
          }),
          h(DockItem, {
            key: "tasks",
            icon: h("svg"),
            label: "Tasks",
            onSelect: () => undefined,
          }),
        ],
      })
    );
    expect(attrs(markup, "nav")["aria-label"]).toBe("Main");
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
    // a link when it has an href, a button when it has not
    expect(markup).toContain("<a ");
    expect(markup).toContain("<button");
    expect(markup.match(/ds-dock-item ds-i/g)).toHaveLength(2);
  });

  it("an icon-only item is still named", () => {
    const markup = html(h(DockItem, { icon: h("svg"), label: "Calendar" }));
    expect(attrs(markup, "button")["aria-label"]).toBe("Calendar");
  });
});

describe("Surface and Tile", () => {
  it("raised and glass are lifted, a well is not", () => {
    expect(attrs(html(h(Surface, null, "x")), "div")).toHaveProperty(
      "data-ds-lift"
    );
    expect(
      attrs(html(h(Surface, { variant: "glass" }, "x")), "div")
    ).toHaveProperty("data-ds-lift");
    expect(
      attrs(html(h(Surface, { variant: "well" }, "x")), "div")
    ).not.toHaveProperty("data-ds-lift");
  });

  it("variant, size and pad are data", () => {
    const a = attrs(
      html(h(Surface, { size: "lg", pad: "lg", as: "section" }, "x")),
      "section"
    );
    expect(a["data-variant"]).toBe("raised");
    expect(a["data-size"]).toBe("lg");
    expect(a["data-pad"]).toBe("lg");
  });

  it("nested lifted surfaces both carry the marker the flat rule reads", () => {
    const markup = html(h(Surface, null, h(Surface, null, "inner")));
    expect(markup.match(/data-ds-lift/g)).toHaveLength(2);
  });

  it("a tile is decoration", () => {
    expect(attrs(html(h(Tile, { tone: "green" })), "span")["aria-hidden"]).toBe(
      "true"
    );
  });
});

describe("Row", () => {
  it("is a plain block, a button or a link", () => {
    expect(html(h(Row, { title: "A" })).startsWith("<div")).toBe(true);
    const button = html(h(Row, { title: "A", onPress: () => undefined }));
    expect(button.startsWith("<button")).toBe(true);
    expect(attrs(button, "button")["class"]).toContain("ds-i");
    const link = html(h(Row, { title: "A", href: "/x" }));
    expect(link.startsWith("<a")).toBe(true);
  });

  it("a plain row has no hit area (nothing to press)", () => {
    expect(attrs(html(h(Row, { title: "A" })), "div")["class"]).not.toContain(
      "ds-i"
    );
  });

  it("a nav row shows its chevron, hidden from readers", () => {
    const markup = html(h(Row, { title: "A", variant: "nav", href: "/x" }));
    expect(markup).toContain("ds-row-chev");
    expect(attrs(markup, "svg")["aria-hidden"]).toBe("true");
  });

  it("current is aria-current=page and the state", () => {
    const a = attrs(
      html(h(Row, { title: "A", href: "/x", current: true })),
      "a"
    );
    expect(a["aria-current"]).toBe("page");
    expect(a["data-state"]).toBe("on");
  });

  it("has a title, a meta and a lead slot", () => {
    const markup = html(
      h(Row, {
        title: "Inbox",
        meta: "3 new",
        lead: h(Tile, { tone: "blue" }),
        trail: "5",
      })
    );
    expect(markup).toContain('class="ds-row-title"');
    expect(markup).toContain('class="ds-row-meta"');
    expect(markup).toContain("ds-row-lead");
    expect(markup).toContain("ds-row-trail");
  });
});

describe("Field", () => {
  it("wires the label, the hint and the input by id", () => {
    const markup = html(h(Field, { label: "Name", hint: "As on the card" }));
    const input = attrs(markup, "input");
    const label = attrs(markup, "label");
    expect(label["for"]).toBe(input["id"]);
    expect(input["aria-describedby"]).toBeTruthy();
    expect(markup).toContain(`id="${input["aria-describedby"]}"`);
    expect(input).not.toHaveProperty("aria-invalid");
    expect(input["type"]).toBe("text");
  });

  it("an error replaces the hint, is announced, and marks the input invalid", () => {
    const markup = html(
      h(Field, { label: "Email", hint: "hint", error: "Not an email" })
    );
    expect(markup).toContain("Not an email");
    expect(markup).not.toContain(">hint<");
    expect(attrs(markup, "input")["aria-invalid"]).toBe("true");
    expect(attrs(markup, "p")["role"]).toBe("alert");
    expect(attrs(markup, "div")).toHaveProperty("data-invalid");
  });

  it("is a textarea when multiline, a search pill with an icon", () => {
    const area = html(h(Field, { multiline: true, "aria-label": "Note" }));
    expect(area).toContain("<textarea");
    const search = html(
      h(Field, { variant: "search", icon: h("svg"), "aria-label": "Search" })
    );
    expect(search).toContain("ds-field-icon");
    expect(attrs(search, "div")["data-variant"]).toBe("search");
  });

  it("forceFocus draws the ring on the box without the focus", () => {
    expect(html(h(Field, { forceFocus: true, "aria-label": "x" }))).toContain(
      'data-force="focus"'
    );
  });
});

describe("SheetPanel", () => {
  it("has a title (h2), a body and a footer, and is a lifted surface", () => {
    const markup = html(
      h(
        SheetPanel,
        { title: "Sort", footer: h("span", null, "foot"), variant: "bottom" },
        "body"
      )
    );
    expect(markup).toContain('<h2 class="ds-sheet-title">Sort</h2>');
    expect(markup).toContain("ds-sheet-body");
    expect(markup).toContain("ds-sheet-foot");
    expect(markup).toContain("data-ds-lift");
  });

  it("with no title it has no header", () => {
    expect(html(h(SheetPanel, null, "body"))).not.toContain("ds-sheet-head");
  });
});
