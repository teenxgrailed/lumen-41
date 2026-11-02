import { FILE_METADATA_SELECT } from "@/services/account/account-export";

describe("account export file metadata", () => {
  it("never selects raw file bytes", () => {
    for (const select of Object.values(FILE_METADATA_SELECT)) {
      expect(select).not.toHaveProperty("bytes");
      expect(select).not.toHaveProperty("data");
    }
  });

  it("lists each file by id, name, size and type", () => {
    expect(FILE_METADATA_SELECT.pageAsset).toMatchObject({
      id: true,
      originalName: true,
      size: true,
      mimeType: true,
    });
    expect(FILE_METADATA_SELECT.taskAttachment).toMatchObject({
      id: true,
      name: true,
      size: true,
      mimeType: true,
    });
    expect(FILE_METADATA_SELECT.moodboardAsset).toMatchObject({
      id: true,
      originalName: true,
      size: true,
      mimeType: true,
    });
  });
});
