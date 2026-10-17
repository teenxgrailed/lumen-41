/**
 * Images that arrive by paste or drop, and the one upload path every file
 * block uses (`POST /api/pages/:id/assets`, 10 MB, stored with the page).
 */

export interface UploadedAsset {
  url: string;
  assetId: string;
  name: string;
  mimeType: string;
}

/** The image files in a clipboard or drag payload, in order. */
export function imageFilesFromTransfer(
  transfer: DataTransfer | null | undefined
): File[] {
  if (!transfer) return [];
  const files: File[] = [];
  if (transfer.files && transfer.files.length > 0) {
    for (const file of Array.from(transfer.files)) {
      if (file.type.startsWith("image/")) files.push(file);
    }
    return files;
  }
  for (const item of Array.from(transfer.items ?? [])) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  return files;
}

/** A pasted screenshot has no useful name; give it one the file list can show. */
export function nameForPastedFile(file: File, index: number): File {
  if (file.name && file.name !== "image.png") return file;
  const extension = file.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
  return new File([file], `pasted-image-${index + 1}.${extension}`, {
    type: file.type,
  });
}

export async function uploadPageAsset(
  pageId: string,
  file: File
): Promise<UploadedAsset> {
  const form = new FormData();
  form.set("file", file);
  const response = await fetch(`/api/pages/${pageId}/assets`, {
    method: "POST",
    body: form,
  });
  const data = (await response.json().catch(() => ({}))) as {
    asset?: { id: string; originalName: string; mimeType: string };
    url?: string;
    error?: string;
  };
  if (!response.ok || !data.asset || !data.url) {
    throw new Error(data.error || "Upload failed");
  }
  return {
    url: data.url,
    assetId: data.asset.id,
    name: data.asset.originalName,
    mimeType: data.asset.mimeType,
  };
}
