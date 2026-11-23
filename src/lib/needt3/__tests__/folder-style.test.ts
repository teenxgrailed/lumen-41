import { projectV3FieldsSchema } from "../api-fields";
import {
  FOLDER_STYLES,
  agoToken,
  autoFolderStyle,
  folderHash,
  folderStyleOf,
  isFolderStyle,
} from "../folder-style";
import { projectFromApi, projectPatchToApi } from "../map";

/** cuid-shaped ids: a long shared prefix, then base-36 noise. */
function ids(n: number) {
  let seed = 12345;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  return Array.from(
    { length: n },
    () =>
      "cm" +
      rnd().toString(36).padStart(7, "0") +
      rnd().toString(36).padStart(7, "0") +
      rnd().toString(36).padStart(7, "0")
  );
}

describe("autoFolderStyle", () => {
  it("is the same for the same id, always 1..6", () => {
    for (const id of ids(200)) {
      const a = autoFolderStyle(id);
      expect(autoFolderStyle(id)).toBe(a);
      expect(isFolderStyle(a)).toBe(true);
    }
    expect(folderHash("p1")).toBe(folderHash("p1"));
  });

  it("spreads ids over all six looks, near-uniformly", () => {
    const n = 6000;
    const count = new Map<number, number>();
    for (const id of ids(n)) {
      const s = autoFolderStyle(id);
      count.set(s, (count.get(s) ?? 0) + 1);
    }
    expect([...count.keys()].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    for (const c of count.values()) {
      expect(c / n).toBeGreaterThan(0.14);
      expect(c / n).toBeLessThan(0.19);
    }
  });

  it("repeats on neighbours about one time in six, not more", () => {
    const list = ids(6000);
    let same = 0;
    for (let i = 1; i < list.length; i++)
      if (autoFolderStyle(list[i]) === autoFolderStyle(list[i - 1])) same++;
    expect(same / (list.length - 1)).toBeLessThan(0.2);
  });

  it("small sets of folders rarely wear one look", () => {
    const sets = ids(1200);
    let oneLook = 0;
    for (let i = 0; i + 4 <= sets.length; i += 4)
      if (new Set(sets.slice(i, i + 4).map(autoFolderStyle)).size === 1)
        oneLook++;
    expect(oneLook).toBeLessThan(10);
  });
});

describe("folderStyleOf", () => {
  it("takes the stored choice, else Auto", () => {
    expect(folderStyleOf("x", 4)).toBe(4);
    expect(folderStyleOf("x", null)).toBe(autoFolderStyle("x"));
    expect(folderStyleOf("x", undefined)).toBe(autoFolderStyle("x"));
    expect(folderStyleOf("x", 9)).toBe(autoFolderStyle("x"));
    expect(folderStyleOf("x", 2.5)).toBe(autoFolderStyle("x"));
  });
  it("knows exactly six looks", () => {
    expect(FOLDER_STYLES).toEqual([1, 2, 3, 4, 5, 6]);
    expect(isFolderStyle(0)).toBe(false);
    expect(isFolderStyle(7)).toBe(false);
    expect(isFolderStyle("3")).toBe(false);
    expect(isFolderStyle(null)).toBe(false);
  });
});

describe("agoToken", () => {
  const now = 10 * 24 * 3_600_000;
  it("is one short token, empty when unknown", () => {
    expect(agoToken(now - 12 * 60_000, now)).toBe("12m");
    expect(agoToken(now - 2 * 3_600_000, now)).toBe("2h");
    expect(agoToken(now - 3 * 24 * 3_600_000, now)).toBe("3d");
    expect(agoToken(now, now)).toBe("1m");
    expect(agoToken(null, now)).toBe("");
    expect(agoToken(undefined, now)).toBe("");
  });
});

describe("folderStyle over the API", () => {
  const parse = (v: unknown) =>
    projectV3FieldsSchema.safeParse({ folderStyle: v });
  it("accepts 1..6 and null (Auto)", () => {
    for (const v of [1, 2, 3, 4, 5, 6, null])
      expect(parse(v).success).toBe(true);
    expect(projectV3FieldsSchema.safeParse({}).success).toBe(true);
  });
  it("refuses anything else", () => {
    for (const v of [0, 7, -1, 2.5, "3", true, [], {}])
      expect(parse(v).success).toBe(false);
  });
  it("is read and written by the client mapping", () => {
    expect(
      projectFromApi({ id: "a", name: "A", folderStyle: 3 }).folderStyle
    ).toBe(3);
    expect(
      projectFromApi({ id: "a", name: "A", folderStyle: 9 }).folderStyle
    ).toBeNull();
    expect(projectFromApi({ id: "a", name: "A" }).folderStyle).toBeNull();
    expect(projectPatchToApi({ folderStyle: 5 })).toEqual({ folderStyle: 5 });
    expect(projectPatchToApi({ folderStyle: null })).toEqual({
      folderStyle: null,
    });
    expect(projectPatchToApi({ name: "x" })).toEqual({ name: "x" });
  });
  it("carries what the folder shows, as the API gave it", () => {
    const p = projectFromApi({
      id: "a",
      name: "A",
      updatedAt: "2026-11-22T10:00:00.000Z",
      connectedApps: ["google", "outlook"],
    });
    expect(p.updatedAt).toBe("2026-11-22T10:00:00.000Z");
    expect(p.connectedApps).toEqual(["google", "outlook"]);
    expect(projectFromApi({ id: "a", name: "A" }).connectedApps).toEqual([]);
  });
});
