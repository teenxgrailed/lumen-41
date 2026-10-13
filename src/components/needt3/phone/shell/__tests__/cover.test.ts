import { phoneCover } from "../cover";

describe("phoneCover", () => {
  it("a full-screen layer takes the menu away and gives it back", () => {
    expect(phoneCover.active()).toBe(false);
    const release = phoneCover.acquire();
    expect(phoneCover.active()).toBe(true);
    release();
    expect(phoneCover.active()).toBe(false);
  });

  it("several layers count: the menu returns when the last one is gone", () => {
    const a = phoneCover.acquire();
    const b = phoneCover.acquire();
    a();
    expect(phoneCover.active()).toBe(true);
    b();
    expect(phoneCover.active()).toBe(false);
  });

  it("letting go twice does not unbalance the count", () => {
    const a = phoneCover.acquire();
    const b = phoneCover.acquire();
    a();
    a();
    expect(phoneCover.active()).toBe(true);
    b();
    expect(phoneCover.active()).toBe(false);
  });

  it("tells subscribers on every change, and stops when they leave", () => {
    const seen: boolean[] = [];
    const off = phoneCover.subscribe(() => seen.push(phoneCover.active()));
    const release = phoneCover.acquire();
    release();
    off();
    phoneCover.acquire()();
    expect(seen).toEqual([true, false]);
  });
});
