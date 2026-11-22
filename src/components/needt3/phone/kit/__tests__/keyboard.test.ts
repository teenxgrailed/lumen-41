import { pkKeyboardInset } from "../keyboard";

describe("pkKeyboardInset", () => {
  it("is the part of the screen the keyboard covers", () => {
    expect(
      pkKeyboardInset({ height: 500, offsetTop: 0, innerHeight: 844 })
    ).toBe(344);
  });
  it("counts a scrolled visual viewport", () => {
    expect(
      pkKeyboardInset({ height: 500, offsetTop: 100, innerHeight: 844 })
    ).toBe(244);
  });
  it("leaves out the gap under a layer that sits inside the screen", () => {
    expect(
      pkKeyboardInset({ height: 508, offsetTop: 0, innerHeight: 844, below: 8 })
    ).toBe(328);
  });
  it("ignores browser chrome and a closed keyboard", () => {
    expect(
      pkKeyboardInset({ height: 844, offsetTop: 0, innerHeight: 844 })
    ).toBe(0);
    expect(
      pkKeyboardInset({ height: 790, offsetTop: 0, innerHeight: 844 })
    ).toBe(0);
  });
});
