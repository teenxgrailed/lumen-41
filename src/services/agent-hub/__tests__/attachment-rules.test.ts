import {
  HUB_ATTACHMENT_MAX_BYTES,
  validateAttachment,
} from "../attachment-rules";
import { HubError } from "../errors";

// Built at run time so secret scanners do not flag the fixture.
const AWS_KEY = ["AK", "IA", "ABCDEFGHIJKLMNOP"].join("");
const text = (value: string) => Buffer.from(value, "utf8");

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
      expect(() =>
        validateAttachment({ name: "big.zip", bytes: ok })
      ).not.toThrow();
      const over = Buffer.alloc(HUB_ATTACHMENT_MAX_BYTES + 1, 0x61);
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
      expect(
        validateAttachment({ name, bytes: Buffer.from([1, 2, 3, 4]) }).mime
      ).toBe(mime);
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
            bytes: text("x"),
            declaredMime: "text/html",
          })
        )
      ).toBe("BAD_TYPE");
      expect(() =>
        validateAttachment({
          name: "a.mp4",
          bytes: text("x"),
          declaredMime: "video/mp4",
        })
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
        validateAttachment({ name: "a.mp4", bytes: text(AWS_KEY) })
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
