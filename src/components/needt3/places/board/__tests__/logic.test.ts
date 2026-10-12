import {
  checkInvite,
  classifyPaste,
  fitWithin,
  hueOf,
  isEmail,
  isFieldTarget,
  isPrivateBoard,
  isWebUrl,
  linkFromUrl,
  luminance,
  normHex,
  normUrl,
  publicBoardUrl,
  ratioOf,
  shareSubline,
  sourceLabel,
  titleFromFile,
} from "../logic";

const person = (userId: string, email: string) => ({
  userId,
  name: null,
  email,
  image: null,
});

describe("links", () => {
  it.each([
    ["https://www.are.na/block/1987", "https://www.are.na/block/1987"],
    ["are.na/block/1987", "https://are.na/block/1987"],
    ["  www.ssense.com/en/x ", "https://www.ssense.com/en/x"],
  ])("reads %s as a link", (raw, href) => {
    expect(normUrl(raw)?.href).toBe(href);
  });

  it.each([
    "",
    "localhost",
    "two words.com",
    "hello",
    "javascript:alert(1)",
    "https://nodots",
  ])("does not read %p as a link", (raw) => {
    expect(normUrl(raw)).toBeNull();
    expect(linkFromUrl(raw)).toBeNull();
  });

  it("names the site and takes a title from the last readable segment", () => {
    expect(
      linkFromUrl("https://www.figma.com/design/k3Xq9/SS27-Lookbook-Grid")
    ).toMatchObject({
      name: "Figma",
      domain: "figma.com",
      title: "SS27 Lookbook Grid",
      ratio: 0.66,
    });
    expect(
      linkFromUrl("https://www.are.na/block/underground-flash-photography")
    ).toMatchObject({
      name: "Are.na",
      title: "Underground flash photography",
      ratio: 0.72,
    });
    // an id-like segment is skipped, so the title is the site's name
    expect(linkFromUrl("https://example.com/p/48291")?.title).toBe("Example");
    expect(linkFromUrl("https://youtube.com/watch?v=abc123")?.title).toBe(
      "Video"
    );
  });

  it("opens only http(s) addresses", () => {
    expect(isWebUrl("https://a.example.com")).toBe(true);
    expect(isWebUrl("http://a.example.com")).toBe(true);
    expect(isWebUrl("/api/moodboards/b/assets/a")).toBe(false);
    expect(isWebUrl("javascript:alert(1)")).toBe(false);
    expect(isWebUrl(null)).toBe(false);
  });
});

describe("colours", () => {
  it("normalises a hex to lower-case six digits, and refuses the rest", () => {
    expect(normHex("C2410C")).toBe("#c2410c");
    expect(normHex(" #C41 ")).toBe("#cc4411");
    expect(normHex("#12345")).toBeNull();
    expect(normHex("blue")).toBeNull();
    expect(normHex("")).toBeNull();
  });

  it("picks dark ink on a light swatch and light ink on a dark one", () => {
    expect(luminance("#ffffff")).toBeGreaterThan(0.18);
    expect(luminance("#1c1c1c")).toBeLessThan(0.18);
  });

  it("gives the same hue for the same name, always inside 0–359", () => {
    expect(hueOf("figma.com")).toBe(hueOf("figma.com"));
    expect(hueOf("figma.com")).not.toBe(hueOf("are.na"));
    expect(hueOf("a long enough string to wrap around")).toBeLessThan(360);
  });
});

describe("pictures", () => {
  it("shrinks the longest side to 900 and never enlarges", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 900, height: 675 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 675, height: 900 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(0, 0)).toEqual({ width: 1, height: 1 });
  });

  it("stores height over width to three places", () => {
    expect(ratioOf(900, 675)).toBe(0.75);
    expect(ratioOf(3, 2)).toBe(0.667);
    expect(ratioOf(0, 10)).toBe(1);
  });

  it("titles a picture by its file name without the extension", () => {
    expect(titleFromFile("IMG_0042.final.JPG")).toBe("IMG_0042.final");
    expect(titleFromFile("")).toBe("Image");
    expect(titleFromFile(undefined)).toBe("Image");
  });
});

describe("what a paste means", () => {
  const png = new File(["x"], "a.png", { type: "image/png" });
  const txt = new File(["x"], "a.txt", { type: "text/plain" });

  it("a picture wins over any text", () => {
    expect(
      classifyPaste({ files: [txt, png], text: "https://a.example.com" })
    ).toEqual({
      kind: "images",
      files: [png],
    });
  });

  it("a six-digit hex is a colour, with or without the hash", () => {
    expect(classifyPaste({ files: [], text: "C2410C" })).toEqual({
      kind: "colour",
      hex: "#c2410c",
    });
    expect(classifyPaste({ files: [], text: "#c2410c" })).toMatchObject({
      kind: "colour",
    });
  });

  it("the first thing that is a link is a link", () => {
    const r = classifyPaste({
      files: [],
      text: "https://are.na/block/1 and more words",
    });
    expect(r).toMatchObject({ kind: "link", link: { domain: "are.na" } });
  });

  it("anything else, or nothing, is not added", () => {
    expect(classifyPaste({ files: [txt], text: "" })).toEqual({ kind: "none" });
    expect(classifyPaste({ files: [], text: "just some words" })).toEqual({
      kind: "none",
    });
    expect(classifyPaste({ files: [], text: "   " })).toEqual({ kind: "none" });
  });

  it("typing in a field is not a board paste", () => {
    expect(isFieldTarget({ tagName: "INPUT" })).toBe(true);
    expect(isFieldTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isFieldTarget({ tagName: "DIV", isContentEditable: true })).toBe(
      true
    );
    expect(isFieldTarget({ tagName: "DIV" })).toBe(false);
    expect(isFieldTarget(null)).toBe(false);
  });
});

describe("share: who an email can reach", () => {
  const candidates = [
    person("m1", "Lena@Studio.ch"),
    person("owner", "me@x.io"),
  ];
  const grants = [{ ...person("m2", "tom@x.io"), role: "VIEWER" as const }];

  it("accepts a workspace member, ignoring case", () => {
    expect(
      checkInvite(" lena@studio.CH ", candidates, grants, "owner")
    ).toEqual({
      ok: true,
      person: candidates[0],
    });
  });

  it.each([
    ["", "empty"],
    ["lena", "invalid"],
    ["me@x.io", "owner"],
    ["stranger@elsewhere.io", "outside"],
  ])("refuses %p (%s)", (raw, reason) => {
    expect(checkInvite(raw, candidates, grants, "owner")).toEqual({
      ok: false,
      reason,
    });
  });

  it("refuses someone already on the board", () => {
    expect(
      checkInvite("tom@x.io", [person("m2", "tom@x.io")], grants, "owner")
    ).toEqual({ ok: false, reason: "dupe" });
  });

  it("reads an email", () => {
    expect(isEmail("a@b.co")).toBe(true);
    expect(isEmail("a@b")).toBe(false);
  });

  it("says who it is shared with", () => {
    expect(shareSubline(0, false)).toBe(
      "Private — only you can see this board"
    );
    expect(shareSubline(0, true)).toBe("Anyone with the link can view");
    expect(shareSubline(1, false)).toBe("Shared with 1 person");
    expect(shareSubline(3, true)).toBe(
      "Shared with 3 people and anyone with the link"
    );
  });

  it("calls a board private only with nobody else and no link", () => {
    expect(isPrivateBoard({ memberCount: 0, linkShare: false })).toBe(true);
    expect(isPrivateBoard({ memberCount: null, linkShare: false })).toBe(true);
    expect(isPrivateBoard({ memberCount: 1, linkShare: false })).toBe(false);
    expect(isPrivateBoard({ memberCount: 0, linkShare: true })).toBe(false);
  });

  it("builds the public address only once the server has sent the token", () => {
    expect(publicBoardUrl("https://needt.app", "b 1", "tok")).toBe(
      "https://needt.app/b/b%201/tok"
    );
    expect(publicBoardUrl("https://needt.app", "b1", null)).toBeNull();
  });
});

describe("labels", () => {
  const it0 = {
    id: "i",
    kind: "image" as const,
    url: null,
    color: null,
    text: null,
    title: null,
    ratio: null,
    colorName: null,
    source: null,
    thumbnailUrl: null,
    position: 0,
    createdAt: null,
  };
  it("names where a tile came from", () => {
    expect(sourceLabel(it0)).toBe("Uploaded");
    expect(
      sourceLabel({ ...it0, kind: "link", source: { domain: "are.na" } })
    ).toBe("are.na");
    expect(
      sourceLabel({ ...it0, kind: "color", color: "#abc", colorName: "Sage" })
    ).toBe("Sage");
    expect(sourceLabel({ ...it0, kind: "color", color: "#aabbcc" })).toBe(
      "#AABBCC"
    );
    expect(sourceLabel({ ...it0, kind: "note" })).toBe("Note");
  });
});
