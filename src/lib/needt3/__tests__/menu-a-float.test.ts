import { nvaFloatPill, nvaFloatSlot, nvaGeom, nvaPillSlot } from "../menu-a";

describe("menu A over the floating bar", () => {
  it("sizes the capsule like bottom-bar-float.css: 44 px slots, 8 apart, 8 px padding, 1.7 slots for the ink pill", () => {
    expect(nvaFloatSlot(390)).toBe(44);
    const p = nvaFloatPill(390);
    expect(p.PW).toBeCloseTo(5 * 44 + 4 * 8 + 16 + 1.7 * 44);
    expect(p.PH).toBe(60);
    expect(p.S0).toBe(30);
    expect(p.SP).toBeCloseTo((p.PW - 16 - 44) / 4);
  });

  it("shrinks the slots on a narrow phone, never under 36 px", () => {
    expect(nvaFloatSlot(300)).toBe(36);
    expect(nvaFloatSlot(360)).toBeCloseTo((360 - 80) / 6.7);
    expect(nvaFloatSlot(200)).toBe(36);
    expect(nvaFloatPill(320).PW).toBeLessThanOrEqual(320 - 24);
    expect(nvaFloatPill(375).PW).toBeLessThanOrEqual(375 - 24);
  });

  it("grows the card out of the floating pill, centred, at the classic pill's bottom", () => {
    const classic = nvaGeom(390, 844);
    const float = nvaGeom(390, 844, false, true);
    expect(float.float).toBe(true);
    expect(float.PW).toBeCloseTo(nvaFloatPill(390).PW);
    expect(float.PH).toBe(60);
    expect(float.PX).toBe(0);
    const bottom = (g: typeof classic) => nvaPillSlot(g, 0).y + g.PH / 2;
    expect(bottom(float)).toBe(bottom(classic));
    const left = (float.W - float.PW) / 2;
    expect(nvaPillSlot(float, 0).x).toBeCloseTo(left + 30);
    expect(nvaPillSlot(float, 2).x).toBeCloseTo(left + 30 + 2 * float.SP);
  });

  it("leaves the classic geometry as it was", () => {
    const g = nvaGeom(390, 844);
    expect(g.float).toBe(false);
    expect([g.PW, g.PH, g.S0, g.SP, g.BE]).toEqual([236, 64, 34, 54, 60]);
    expect(nvaGeom(390, 844, true).SP).toBe(54);
  });
});
