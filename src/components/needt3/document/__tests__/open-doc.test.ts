import { docIdFromPath } from "../open-doc";

describe("docIdFromPath", () => {
  it("reads the id of /pages/<id>", () => {
    expect(docIdFromPath("/pages/abc123")).toBe("abc123");
    expect(docIdFromPath("/pages/abc123/")).toBe("abc123");
    expect(docIdFromPath("/pages/a%20b")).toBe("a b");
  });

  it("is null for the grid and for every other place", () => {
    expect(docIdFromPath("/pages")).toBeNull();
    expect(docIdFromPath("/pages/")).toBeNull();
    expect(docIdFromPath("/tasks/abc")).toBeNull();
    expect(docIdFromPath("/pages/abc/versions")).toBeNull();
    expect(docIdFromPath(null)).toBeNull();
    expect(docIdFromPath(undefined)).toBeNull();
  });

  it("keeps an id that is not valid percent-encoding", () => {
    expect(docIdFromPath("/pages/100%")).toBe("100%");
  });
});
