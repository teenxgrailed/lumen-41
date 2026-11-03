import { HubError } from "./errors";
import { assertNoSecrets, secretKind } from "./secret-scan";

/**
 * What may be attached to a hub item, decided from the bytes and the name,
 * never from what the uploader claimed alone. No database here.
 */

/** Per file, per item, and per account (all files an account's items hold). */
export const HUB_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
export const HUB_ATTACHMENT_MAX_PER_ITEM = 10;
export const HUB_ATTACHMENT_ACCOUNT_QUOTA_BYTES = 500 * 1024 * 1024;
/** A signed download link lives this long; an upload link is shorter. */
/** Writes that carry a file, per account a minute: each can be 25 MB. */
export const HUB_ATTACHMENT_WRITES_PER_MINUTE = 6;
export const HUB_ATTACHMENT_URL_TTL_MS = 24 * 60 * 60 * 1000;
export const HUB_ATTACHMENT_UPLOAD_TTL_MS = 15 * 60 * 1000;

/** Extension (lowercase, no dot) -> the type we store and serve. */
const ALLOWED: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  heic: "image/heic",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  aac: "audio/aac",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  zip: "application/zip",
};

/** Extensions that run or install, refused even inside a name like `a.exe.txt`. */
const EXECUTABLE_EXTENSIONS = new Set([
  "exe",
  "dll",
  "msi",
  "com",
  "scr",
  "bat",
  "cmd",
  "ps1",
  "vbs",
  "sh",
  "bash",
  "zsh",
  "app",
  "apk",
  "ipa",
  "jar",
  "dmg",
  "pkg",
  "deb",
  "rpm",
  "bin",
  "elf",
  "so",
  "dylib",
  "js",
  "mjs",
  "cjs",
  "py",
  "pl",
  "rb",
  "php",
  "svg",
  "html",
  "htm",
  "xhtml",
  "lnk",
  "reg",
  "wasm",
]); // svg and html run script in a browser, so they are refused too.

/** Types whose content is text and is scanned for credentials. */
const TEXT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

export type AttachmentRefusal =
  | "EMPTY"
  | "TOO_LARGE"
  | "TOO_MANY"
  | "QUOTA"
  | "BAD_TYPE"
  | "EXECUTABLE"
  | "SECRET";

export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/** A safe display name: no path, no control characters, at most 200 characters. */
export function safeAttachmentName(raw: string): string {
  return (raw.split(/[\\/]/).pop() ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 200);
}

/** True when the bytes start like a program: PE, ELF, Mach-O, or a #! script. */
export function looksExecutable(bytes: Uint8Array): boolean {
  const b = bytes;
  if (b.length >= 2 && b[0] === 0x4d && b[1] === 0x5a) return true; // MZ
  if (
    b.length >= 4 &&
    b[0] === 0x7f &&
    b[1] === 0x45 &&
    b[2] === 0x4c &&
    b[3] === 0x46
  )
    return true; // ELF
  if (b.length >= 4) {
    const m = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
    if (
      [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(m)
    )
      return true; // Mach-O and fat binaries
  }
  if (b.length >= 2 && b[0] === 0x23 && b[1] === 0x21) return true; // #!
  return false;
}

/**
 * The type to store for this file, or a HubError. `declared` is what the
 * uploader said; if present it must not contradict the extension's type.
 */
export function resolveAttachmentType(
  name: string,
  bytes: Uint8Array,
  declared?: string
): string {
  const parts = name.toLowerCase().split(".").slice(1);
  if (parts.some((part) => EXECUTABLE_EXTENSIONS.has(part))) {
    throw refusal(
      "EXECUTABLE",
      "Executable and script files cannot be attached."
    );
  }
  const mime = ALLOWED[extensionOf(name)];
  if (!mime) {
    throw refusal(
      "BAD_TYPE",
      "Allowed: images, video (mp4, mov, webm), audio, pdf, text/markdown, csv, json and zip."
    );
  }
  if (looksExecutable(bytes)) {
    throw refusal("EXECUTABLE", "The file content is a program or script.");
  }
  // A name and a type that the bytes contradict is a file in disguise. The
  // name-only check at upload-link time passes no bytes.
  if (bytes.length > 0 && !matchesSignature(mime, bytes)) {
    throw refusal(
      "BAD_TYPE",
      `The file content does not look like ${mime}; the name and the bytes must agree.`
    );
  }
  const claimed = declared?.split(";")[0].trim().toLowerCase();
  if (
    claimed &&
    claimed !== "application/octet-stream" &&
    claimed !== mime &&
    !(mime === "text/markdown" && claimed === "text/plain") &&
    !(mime === "audio/ogg" && claimed === "audio/opus")
  ) {
    throw refusal(
      "BAD_TYPE",
      `The declared type ${claimed} does not match the file name (${mime}).`
    );
  }
  return mime;
}

const ascii = (b: Uint8Array, at: number, text: string) =>
  b.length >= at + text.length &&
  [...text].every((ch, i) => b[at + i] === ch.charCodeAt(0));
const starts = (b: Uint8Array, ...bytes: number[]) =>
  b.length >= bytes.length && bytes.every((v, i) => b[i] === v);

/** Whether the bytes start the way a file of this type does. Text types have no signature. */
export function matchesSignature(mime: string, b: Uint8Array): boolean {
  switch (mime) {
    case "image/png":
      return starts(b, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "image/jpeg":
      return starts(b, 0xff, 0xd8, 0xff);
    case "image/gif":
      return ascii(b, 0, "GIF8");
    case "image/webp":
      return ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP");
    case "audio/wav":
      return ascii(b, 0, "RIFF") && ascii(b, 8, "WAVE");
    case "image/avif":
    case "image/heic":
    case "audio/mp4":
      return ascii(b, 4, "ftyp");
    case "video/mp4":
    case "video/quicktime":
      // ISO base media: usually ftyp first; older QuickTime and some mp4 begin
      // with another top-level box.
      return ["ftyp", "moov", "mdat", "wide", "free", "skip"].some((box) =>
        ascii(b, 4, box)
      );
    case "video/webm":
      return starts(b, 0x1a, 0x45, 0xdf, 0xa3);
    case "audio/ogg":
      return ascii(b, 0, "OggS");
    case "audio/flac":
      return ascii(b, 0, "fLaC");
    case "audio/mpeg":
      return (
        ascii(b, 0, "ID3") ||
        (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0)
      );
    case "audio/aac":
      return b.length >= 2 && b[0] === 0xff && (b[1] & 0xf0) === 0xf0;
    case "application/pdf":
      return ascii(b, 0, "%PDF-");
    case "application/zip":
      return (
        starts(b, 0x50, 0x4b, 0x03, 0x04) || starts(b, 0x50, 0x4b, 0x05, 0x06)
      );
    default:
      return true;
  }
}

const SCAN_CHUNK = 1024 * 1024;
const SCAN_OVERLAP = 512;

/** Throws SECRET-style INVALID when the text content looks like a credential. */
export function scanTextContent(mime: string, bytes: Uint8Array): void {
  if (!TEXT_TYPES.has(mime)) return;
  const text = Buffer.from(bytes).toString("utf8");
  for (let at = 0; at < text.length; at += SCAN_CHUNK) {
    const kind = secretKind(
      text.slice(Math.max(0, at - SCAN_OVERLAP), at + SCAN_CHUNK)
    );
    if (kind) {
      throw refusal(
        "SECRET",
        `The file content looks like it contains a ${kind}. Remove it: credentials stay in the agent's own environment and never go into Needt.`
      );
    }
  }
}

export function refusal(code: AttachmentRefusal, message: string) {
  const status = code === "TOO_LARGE" ? 413 : code === "QUOTA" ? 413 : 400;
  return new HubError("INVALID", message, { reason: code }, status);
}

/** Everything that depends only on the file: size, name, type, content. */
export function validateAttachment(input: {
  name: string;
  bytes: Uint8Array;
  declaredMime?: string;
}): { name: string; mime: string } {
  const name = safeAttachmentName(input.name);
  if (!name) throw refusal("BAD_TYPE", "The file needs a name.");
  assertNoSecrets({ name });
  if (input.bytes.length === 0) throw refusal("EMPTY", "That file is empty.");
  if (input.bytes.length > HUB_ATTACHMENT_MAX_BYTES) {
    throw refusal("TOO_LARGE", "Attachments must be 25 MB or smaller.");
  }
  const mime = resolveAttachmentType(name, input.bytes, input.declaredMime);
  scanTextContent(mime, input.bytes);
  return { name, mime };
}
