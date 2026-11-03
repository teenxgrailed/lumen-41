import {
  HUB_ATTACHMENT_MAX_BYTES,
  resolveAttachmentType,
  validateAttachment,
} from "../attachment-rules";
import { HubError } from "../errors";

// Built at run time so secret scanners do not flag the fixture.
const AWS_KEY = ["AK", "IA", "ABCDEFGHIJKLMNOP"].join("");
const text = (value: string) => Buffer.from(value, "utf8");
/** Real starting bytes per extension. */
const SIGNATURE: Record<string, Buffer> = {
  mp4: Buffer.concat([Buffer.from([0, 0, 0, 24]), text("ftypmp42")]),
  mov: Buffer.concat([Buffer.from([0, 0, 0, 20]), text("ftypqt  ")]),
  webm: Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2]),
  mp3: text("ID3\x04\x00"),
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
  pdf: text("%PDF-1.7\n"),
  zip: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0]),
};
const sig = (name: string) =>
  SIGNATURE[name.split(".").pop()!.toLowerCase()] ?? Buffer.from([1, 2, 3, 4]);

function reason(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(HubError);
    return (error as HubError).extra?.reason as string;
  }
  return undefined;
}

describe("hub attachment rules", () => {
  describe("limits", () => {
    it("refuses an empty file", () => {
      expect(
        reason(() =>
          validateAttachment({ name: "a.txt", bytes: Buffer.alloc(0) })
        )
      ).toBe("EMPTY");
    });

    it("accepts exactly 25 MB and refuses one byte more", () => {
      const ok = Buffer.alloc(HUB_ATTACHMENT_MAX_BYTES, 0x61);
      SIGNATURE.zip.copy(ok);
      expect(() =>
        validateAttachment({ name: "big.zip", bytes: ok })
      ).not.toThrow();
      const over = Buffer.alloc(HUB_ATTACHMENT_MAX_BYTES + 1, 0x61);
      SIGNATURE.zip.copy(over);
      expect(
        reason(() => validateAttachment({ name: "big.zip", bytes: over }))
      ).toBe("TOO_LARGE");
    });
  });

  describe("types", () => {
    it.each([
      ["clip.mp4", "video/mp4"],
      ["clip.MOV", "video/quicktime"],
      ["clip.webm", "video/webm"],
      ["song.mp3", "audio/mpeg"],
      ["pic.png", "image/png"],
      ["doc.pdf", "application/pdf"],
      ["notes.md", "text/markdown"],
      ["rows.csv", "text/csv"],
      ["data.json", "application/json"],
      ["all.zip", "application/zip"],
    ])("allows %s as %s", (name, mime) => {
      expect(validateAttachment({ name, bytes: sig(name) }).mime).toBe(mime);
    });

    it.each([
      "run.exe",
      "setup.msi",
      "go.sh",
      "x.bat",
      "app.jar",
      "a.js",
      "i.svg",
      "p.html",
      "evil.exe.txt",
    ])("refuses the executable name %s", (name) => {
      expect(
        reason(() => validateAttachment({ name, bytes: text("hi") }))
      ).toBe("EXECUTABLE");
    });

    it("refuses an unknown extension", () => {
      expect(
        reason(() => validateAttachment({ name: "a.xyz", bytes: text("hi") }))
      ).toBe("BAD_TYPE");
    });

    it("refuses a program renamed to an allowed extension", () => {
      const pe = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
      const elf = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
      expect(
        reason(() => validateAttachment({ name: "v.mp4", bytes: pe }))
      ).toBe("EXECUTABLE");
      expect(
        reason(() => validateAttachment({ name: "v.mp4", bytes: elf }))
      ).toBe("EXECUTABLE");
      expect(
        reason(() =>
          validateAttachment({ name: "n.txt", bytes: text("#!/bin/sh\nrm") })
        )
      ).toBe("EXECUTABLE");
    });

    it("refuses a declared type that contradicts the name", () => {
      expect(
        reason(() =>
          validateAttachment({
            name: "a.mp4",
            bytes: SIGNATURE.mp4,
            declaredMime: "text/html",
          })
        )
      ).toBe("BAD_TYPE");
      expect(() =>
        validateAttachment({
          name: "a.mp4",
          bytes: SIGNATURE.mp4,
          declaredMime: "video/mp4",
        })
      ).not.toThrow();
    });
  });

  describe("signature", () => {
    it.each(["a.mp4", "a.png", "a.pdf", "a.zip", "a.webm", "a.mp3"])(
      "refuses %s whose bytes are something else",
      (name) => {
        expect(
          reason(() => validateAttachment({ name, bytes: text("hello world") }))
        ).toBe("BAD_TYPE");
      }
    );

    it("refuses a png that is really a pdf", () => {
      expect(
        reason(() =>
          validateAttachment({ name: "a.png", bytes: SIGNATURE.pdf })
        )
      ).toBe("BAD_TYPE");
    });

    it("does not check the signature when only the name is known", () => {
      expect(() =>
        resolveAttachmentType("demo.mp4", new Uint8Array(0))
      ).not.toThrow();
    });
  });

  describe("secret scan", () => {
    it("refuses a credential in the file name", () => {
      expect(() =>
        validateAttachment({ name: `${AWS_KEY}.txt`, bytes: text("hi") })
      ).toThrow(/looks like it contains/);
    });

    it("refuses a credential inside a text file and names the kind, not the value", () => {
      let message = "";
      try {
        validateAttachment({
          name: "notes.md",
          bytes: text(`key ${AWS_KEY} here`),
        });
      } catch (error) {
        message = (error as HubError).message;
      }
      expect(message).toContain("AWS access key id");
      expect(message).not.toContain(AWS_KEY);
    });

    it("scans csv and json too, but not binary types", () => {
      for (const name of ["a.csv", "a.json"]) {
        expect(
          reason(() => validateAttachment({ name, bytes: text(AWS_KEY) }))
        ).toBe("SECRET");
      }
      expect(() =>
        validateAttachment({
          name: "a.mp4",
          bytes: Buffer.concat([SIGNATURE.mp4, text(AWS_KEY)]),
        })
      ).not.toThrow();
    });

    it("finds a credential past the first chunk", () => {
      const body = Buffer.concat([
        Buffer.alloc(2 * 1024 * 1024, 0x20),
        text(AWS_KEY),
      ]);
      expect(
        reason(() => validateAttachment({ name: "big.txt", bytes: body }))
      ).toBe("SECRET");
    });
  });
});
