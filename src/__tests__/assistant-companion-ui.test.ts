import fs from "node:fs";
import path from "node:path";

const companionSource = fs.readFileSync(
  path.join(process.cwd(), "src/components/ai/AICompanion.tsx"),
  "utf8"
);

describe("AI companion interaction contract", () => {
  it("uses pointer capture, a drag threshold, and RAF position updates", () => {
    expect(companionSource).toContain("DRAG_THRESHOLD = 6");
    expect(companionSource).toContain("setPointerCapture");
    expect(companionSource).toContain("requestAnimationFrame");
    expect(companionSource).toContain("toNormalized");
  });

  it("supports keyboard movement and the requested responsive sizes", () => {
    expect(companionSource).toContain("ArrowLeft");
    expect(companionSource).toContain("event.shiftKey ? 24 : 8");
    expect(companionSource).toContain("h-[72px] w-[72px]");
    expect(companionSource).toContain("max-sm:h-14 max-sm:w-14");
    expect(companionSource).not.toContain("h-[116px]");
    expect(companionSource).not.toContain("max-sm:h-[76px]");
  });
});
