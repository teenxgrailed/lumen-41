import { nvaFloatPill, nvaFloatSlot, nvaGeom, nvaPillSlot } from "../menu-a";

describe("menu A over the floating bar", () => {
  it("sizes the pill like bottom-bar-float.css: 48 px slots, 4 apart, 6 px padding", () => {
    expect(nvaFloatSlot(390)).toBe(48);
    const p = nvaFloatPill(390);
    expect(p.PW).toBe(5 * 48 + 4 * 4 + 12);
    expect(p.PH).toBe(60);
    expect(p.S0).toBe(30);
    expect(p.SP).toBe(52);
  });

  it("shrinks the slots on a narrow phone, never under 36 px", () => {
    expect(nvaFloatSlot(300)).toBeCloseTo((300 - 40) / 5.6);
    expect(nvaFloatSlot(200)).toBe(36);
    expect(nvaFloatPill(320).PW).toBeLessThanOrEqual(320 - 32);
  });

  it("grows the card out of the floating pill, centred, at the classic pill's bottom", () => {
    const classic = nvaGeom(390, 844);
    const float = nvaGeom(390, 844, false, true);
    expect(float.float).toBe(true);
    expect(float.PW).toBe(268);
    expect(float.PH).toBe(60);
    expect(float.PX).toBe(0);
    const bottom = (g: typeof classic) => nvaPillSlot(g, 0).y + g.PH / 2;
    expect(bottom(float)).toBe(bottom(classic));
    const left = (float.W - float.PW) / 2;
    expect(nvaPillSlot(float, 0).x).toBe(left + 30);
    expect(nvaPillSlot(float, 2).x).toBe(left + 30 + 2 * 52);
  });

  it("leaves the classic geometry as it was", () => {
    const g = nvaGeom(390, 844);
    expect(g.float).toBe(false);
    expect([g.PW, g.PH, g.S0, g.SP, g.BE]).toEqual([236, 64, 34, 54, 60]);
    expect(nvaGeom(390, 844, true).SP).toBe(54);
  });
});
