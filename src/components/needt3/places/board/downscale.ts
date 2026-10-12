import type { BoardUploadDraft } from "@/lib/needt3/hooks/boards";

import {
  JPEG_QUALITY,
  JPEG_QUALITY_LIGHT,
  UPLOAD_MAX_BYTES,
  fitWithin,
  isImageFile,
  ratioOf,
  titleFromFile,
} from "./logic";

/**
 * Shrink a picture in the browser before it is uploaded (places.jsx
 * `mbDownscale`): the longest side at most 900 px, re-encoded as JPEG on a
 * white ground, so a phone photo is a few hundred KB, not a few MB. Resolves
 * null when the file is not a picture the browser can read.
 */
export function downscaleImage(file: File): Promise<BoardUploadDraft | null> {
  if (!isImageFile(file)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const done = (value: BoardUploadDraft | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    img.onload = () => {
      const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const g = canvas.getContext("2d");
      if (!g) return done(null);
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, width, height);
      g.drawImage(img, 0, 0, width, height);
      const finish = (blob: Blob) => {
        const title = titleFromFile(file.name);
        done({
          file: blob,
          name: `${title}.jpg`,
          title,
          ratio: ratioOf(width, height),
        });
      };
      canvas.toBlob(
        (blob) => {
          if (!blob) return done(null);
          // A rare busy picture that is still over the server's limit is
          // encoded once more, lighter, rather than refused.
          if (blob.size <= UPLOAD_MAX_BYTES) return finish(blob);
          canvas.toBlob(
            (lighter) =>
              finish(lighter && lighter.size < blob.size ? lighter : blob),
            "image/jpeg",
            JPEG_QUALITY_LIGHT
          );
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    };
    img.onerror = () => done(null);
    img.src = url;
  });
}
