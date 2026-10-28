/**
 * @jest-environment jsdom
 *
 * The marbled backdrops are drawn for a Retina screen: the field is computed at
 * 1440 x 960 and the picture is 2880 x 1920, so a full-bleed backdrop is never
 * stretched (it used to be 300 x 200 stretched to 1440 x 960). WebP when the
 * browser can encode it, JPEG when it cannot (Safari).
 */
import { BIG_H, BIG_W, FIELD_H, FIELD_W, backdropOf } from "../backdrop";

interface FakeCanvas {
  width: number;
  height: number;
  getContext: () => unknown;
  toDataURL: (type: string, q?: number) => string;
}

const made: FakeCanvas[] = [];
const encoded: string[] = [];

function fakeContext() {
  const noop = () => undefined;
  return new Proxy(
    {
      createImageData: (w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
      }),
      createRadialGradient: () => ({ addColorStop: noop }),
    } as Record<string, unknown>,
    {
      get: (t, k: string) => (k in t ? t[k] : noop),
      set: () => true,
      has: () => true,
    }
  );
}

function install(webp: boolean) {
  made.length = 0;
  encoded.length = 0;
  const real = document.createElement.bind(document);
  jest.spyOn(document, "createElement").mockImplementation(((tag: string) => {
    if (tag !== "canvas") return real(tag);
    const c: FakeCanvas = {
      width: 0,
      height: 0,
      getContext: () => fakeContext(),
      toDataURL: (type: string) => {
        encoded.push(type);
        return type === "image/webp" && !webp
          ? "data:image/png;base64,AAAA"
          : `data:${type};base64,AAAA`;
      },
    };
    made.push(c);
    return c as unknown as HTMLCanvasElement;
  }) as typeof document.createElement);
}

const read = (name: string) =>
  name.endsWith("vein") || /-\d$/.test(name) ? "#445566" : "#ffffff";

afterEach(() => jest.restoreAllMocks());

describe("marble backdrop resolution", () => {
  it("keeps the picture at twice the design plane", () => {
    expect(BIG_W).toBe(FIELD_W * 2);
    expect(BIG_H).toBe(FIELD_H * 2);
  });

  it("encodes WebP where the browser can and JPEG where it cannot", () => {
    install(false);
    backdropOf("sparkle", read);
    expect(encoded).toEqual(["image/webp", "image/jpeg"]);
  });

  it("computes the field at the design plane and draws the picture at 2x", () => {
    install(true);
    backdropOf("ink", read);
    expect(made[0].width).toBe(FIELD_W);
    expect(made[0].height).toBe(FIELD_H);
    expect(made[1].width).toBe(BIG_W);
    expect(made[1].height).toBe(BIG_H);
  });
});
