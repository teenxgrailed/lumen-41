import { docLinkInverse } from "../hooks/doc-share";

describe("docLinkInverse", () => {
  const pageId = "p1";

  it("offers to turn a link that was just turned on back off", () => {
    expect(
      docLinkInverse({ published: false, url: null }, { pageId, on: true })
    ).toEqual({ pageId, on: false });
  });

  it("offers no undo for turning the link off: the token is revoked", () => {
    expect(
      docLinkInverse(
        { published: true, url: "https://x/p/t" },
        {
          pageId,
          on: false,
        }
      )
    ).toBeNull();
  });

  it("offers no undo when nothing changed", () => {
    expect(
      docLinkInverse(
        { published: true, url: "https://x/p/t" },
        {
          pageId,
          on: true,
        }
      )
    ).toBeNull();
    expect(
      docLinkInverse({ published: false, url: null }, { pageId, on: false })
    ).toBeNull();
  });

  it("treats an uncached link as unpublished", () => {
    expect(docLinkInverse(undefined, { pageId, on: true })).toEqual({
      pageId,
      on: false,
    });
    expect(docLinkInverse(undefined, { pageId, on: false })).toBeNull();
  });
});
