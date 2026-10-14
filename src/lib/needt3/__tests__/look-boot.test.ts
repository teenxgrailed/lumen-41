import {
  LOOK_BOOT_SCRIPT,
  type Look,
  SIDE_BG,
  barColorOf,
  encodeLook,
  firstPaint,
  mergeLook,
  parseLook,
  viewportLook,
} from "@/lib/needt3/look-boot";

const look = (over: Partial<Look> = {}): Look => ({
  choice: "light",
  accent: "blue",
  side: "light",
  palette: null,
  ...over,
});

const PALETTE = { bg: "#25222b", raised: "#312d38", ink: "#eeebf2" };

describe("the look cookie", () => {
  it("round-trips every choice", () => {
    for (const l of [
      look(),
      look({ choice: "dark", side: "dark", accent: "pink" }),
      look({ choice: "system", side: null }),
      look({ choice: "time", side: "dark", palette: PALETTE }),
    ]) {
      expect(parseLook(encodeLook(l))).toEqual(l);
      expect(parseLook(encodeURIComponent(encodeLook(l)))).toEqual(l);
    }
  });

  it("keeps a palette for Time only, and only when it is hex", () => {
    expect(
      parseLook("light.light.blue.25222b.312d38.eeebf2")?.palette
    ).toBeNull();
    expect(parseLook("time.dark.blue.zzzzzz.312d38.eeebf2")?.palette).toBeNull();
  });

  it("drops junk instead of throwing", () => {
    expect(parseLook(undefined)).toBeNull();
    expect(parseLook("")).toBeNull();
    expect(parseLook("sepia.light.blue")).toBeNull();
    expect(parseLook("%E0%A4%A")).toBeNull();
    expect(parseLook("dark.sideways.nope")).toEqual({
      choice: "dark",
      accent: "blue",
      side: null,
      palette: null,
    });
  });
});

describe("mergeLook", () => {
  it("lets the saved choice win over the cookie", () => {
    const cookie = look({ choice: "dark", side: "dark", accent: "pink" });
    expect(
      mergeLook({ choice: "light", accent: "mint" }, cookie)
    ).toEqual({ choice: "light", accent: "mint", side: null, palette: null });
  });

  it("keeps what the cookie knows when it is about the same choice", () => {
    const cookie = look({ choice: "time", side: "dark", palette: PALETTE });
    expect(mergeLook({ choice: "time", accent: "blue" }, cookie)).toEqual(
      cookie
    );
  });

  it("falls back to the cookie, then the defaults", () => {
    const cookie = look({ choice: "dark", side: "dark" });
    expect(mergeLook(null, cookie)).toBe(cookie);
    expect(mergeLook(null, null)).toEqual({
      choice: "system",
      accent: "blue",
      side: null,
      palette: null,
    });
  });
});

describe("firstPaint", () => {
  it("is exact for Light and Dark, whatever the cookie said", () => {
    expect(firstPaint(look({ choice: "light", side: "dark" })).side).toBe(
      "light"
    );
    expect(firstPaint(look({ choice: "dark", side: null })).side).toBe("dark");
  });

  it("guesses System from the last side and leaves the rest to the script", () => {
    const p = firstPaint(look({ choice: "system", side: "dark" }));
    expect(p).toMatchObject({ side: "dark", drift: false, known: false });
  });

  it("wears Time's last palette, with the engine's own variables", () => {
    const p = firstPaint(
      look({ choice: "time", side: "dark", palette: PALETTE })
    );
    expect(p.drift).toBe(true);
    expect(p.known).toBe(true);
    expect(p.vars["--background"]).toBe(PALETTE.bg);
    expect(p.vars["--time-bg"]).toBe(PALETTE.bg);
    expect(p.vars["--foreground"]).toBe(PALETTE.ink);
  });

  it("does not claim to know Time with no past visit", () => {
    expect(firstPaint(look({ choice: "time", side: null })).known).toBe(false);
  });
});

describe("browser chrome", () => {
  it("states the colour scheme and bar colour of a fixed theme", () => {
    expect(viewportLook(look({ choice: "dark" }))).toEqual({
      colorScheme: "dark",
      themeColor: SIDE_BG.dark,
    });
    expect(viewportLook(look({ choice: "light" }))).toEqual({
      colorScheme: "light",
      themeColor: SIDE_BG.light,
    });
  });

  it("lets the OS pick for System", () => {
    const v = viewportLook(look({ choice: "system", side: null }));
    expect(v.colorScheme).toBe("light dark");
    expect(v.themeColor).toEqual([
      { media: "(prefers-color-scheme: light)", color: SIDE_BG.light },
      { media: "(prefers-color-scheme: dark)", color: SIDE_BG.dark },
    ]);
  });

  it("uses Time's background for the bar", () => {
    const l = look({ choice: "time", side: "dark", palette: PALETTE });
    expect(viewportLook(l).themeColor).toBe(PALETTE.bg);
    expect(barColorOf(firstPaint(l))).toBe(PALETTE.bg);
  });
});

/** Runs the boot script against a stand-in scope element and document. */
function boot(opts: {
  choice: string;
  side: string;
  known?: boolean;
  background?: string;
  osDark?: boolean;
  hour?: number;
}) {
  const attrs: Record<string, string> = {
    "data-theme-choice": opts.choice,
    "data-theme": opts.side,
  };
  if (opts.known) attrs["data-time-known"] = "1";
  const el = {
    getAttribute: (k: string) => attrs[k] ?? null,
    setAttribute: (k: string, v: string) => {
      attrs[k] = v;
    },
    style: { getPropertyValue: () => opts.background ?? "" },
  };
  const html = { style: {} as Record<string, string> };
  const body = { style: {} as Record<string, string> };
  const RealDate = Date;
  const fakeDate = class extends RealDate {
    constructor() {
      super(2026, 9, 14, opts.hour ?? 12, 0, 0);
    }
  };
  new Function("document", "window", "Date", LOOK_BOOT_SCRIPT)(
    {
      currentScript: { parentElement: el },
      documentElement: html,
      body,
    },
    { matchMedia: () => ({ matches: !!opts.osDark }) },
    fakeDate
  );
  return { attrs, html: html.style, body: body.style };
}

describe("LOOK_BOOT_SCRIPT", () => {
  it("follows the OS for System", () => {
    expect(boot({ choice: "system", side: "light", osDark: true }).attrs[
      "data-theme"
    ]).toBe("dark");
    expect(boot({ choice: "system", side: "dark", osDark: false }).attrs[
      "data-theme"
    ]).toBe("light");
  });

  it("leaves Light and Dark where the server put them", () => {
    expect(boot({ choice: "light", side: "light", osDark: true }).attrs[
      "data-theme"
    ]).toBe("light");
    expect(boot({ choice: "dark", side: "dark", osDark: false }).attrs[
      "data-theme"
    ]).toBe("dark");
  });

  it("uses the clock for Time only when no past visit is known", () => {
    expect(
      boot({ choice: "time", side: "light", hour: 23 }).attrs["data-theme"]
    ).toBe("dark");
    expect(
      boot({ choice: "time", side: "light", hour: 13 }).attrs["data-theme"]
    ).toBe("light");
    expect(
      boot({ choice: "time", side: "dark", known: true, hour: 13 }).attrs[
        "data-theme"
      ]
    ).toBe("dark");
  });

  it("paints the page behind the scope in the resolved colour", () => {
    const dark = boot({ choice: "system", side: "light", osDark: true });
    expect(dark.html.backgroundColor).toBe(SIDE_BG.dark);
    expect(dark.html.colorScheme).toBe("dark");
    expect(dark.body.backgroundColor).toBe(SIDE_BG.dark);
    const time = boot({
      choice: "time",
      side: "dark",
      known: true,
      background: PALETTE.bg,
    });
    expect(time.html.backgroundColor).toBe(PALETTE.bg);
  });

  it("does nothing, quietly, with no element", () => {
    expect(() =>
      new Function("document", "window", LOOK_BOOT_SCRIPT)({}, {})
    ).not.toThrow();
  });
});
