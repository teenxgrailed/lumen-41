/**
 * @jest-environment jsdom
 *
 * The row slide after Keep: positions are measured from the first-replan card
 * (so a card or banner changing height is not a move), the animation uses
 * transform and opacity for at most 250 ms, and reduced motion gets none.
 */
import { ROW_FLIP_MS, flipRow, measureRow } from "../row-flip";

let reduced = false;
const animate = jest.fn();

function rect(top: number, bottom = top): DOMRect {
  return { top, bottom } as DOMRect;
}

function mount(cardBottom: number, rowTop: number) {
  document.body.innerHTML = `<section data-hd-first-replan></section><div data-task="t1"></div>`;
  const card = document.querySelector("[data-hd-first-replan]")!;
  const row = document.querySelector<HTMLElement>('[data-task="t1"]')!;
  card.getBoundingClientRect = () => rect(0, cardBottom);
  row.getBoundingClientRect = () => rect(rowTop);
  row.animate = animate;
}

beforeEach(() => {
  reduced = false;
  animate.mockReset();
  window.matchMedia = ((q: string) => ({
    matches: reduced && q.includes("reduce"),
  })) as unknown as typeof window.matchMedia;
});

it("measures the row from the bottom of the card", () => {
  mount(100, 340);
  expect(measureRow("t1")).toBe(240);
  document.body.innerHTML = "";
  expect(measureRow("t1")).toBeNull();
});

it("finds a phone row by data-pk-row", () => {
  document.body.innerHTML = `<section data-hd-first-replan></section><div data-pk-row="t1"></div>`;
  document.querySelector("[data-hd-first-replan]")!.getBoundingClientRect =
    () => rect(0, 50);
  document.querySelector("[data-pk-row]")!.getBoundingClientRect = () =>
    rect(200);
  expect(measureRow("t1")).toBe(150);
});

it("slides the row with transform and opacity in at most 250 ms", () => {
  mount(100, 400); // now 300 below the card
  expect(flipRow("t1", 120)).toBe(true); // was 120 below the card
  const [frames, options] = animate.mock.calls[0];
  expect(ROW_FLIP_MS).toBeLessThanOrEqual(250);
  expect(options.duration).toBeLessThanOrEqual(250);
  expect(Object.keys(frames[0]).sort()).toEqual(["opacity", "transform"]);
  expect(frames[0].transform).toBe("translateY(-180px)");
  expect(frames[1].transform).toBe("translateY(0)");
});

it("ignores a card that changed height: only the offset to it counts", () => {
  // The card grew by 40 and the row followed it: same offset, no move.
  mount(140, 380);
  expect(flipRow("t1", 240)).toBe(false);
  expect(animate).not.toHaveBeenCalled();
});

it("does nothing with reduced motion, without a measurement, or without the row", () => {
  mount(100, 400);
  reduced = true;
  expect(flipRow("t1", 120)).toBe(false);
  reduced = false;
  expect(flipRow("t1", null)).toBe(false);
  document.body.innerHTML = "";
  expect(flipRow("t1", 120)).toBe(false);
  expect(animate).not.toHaveBeenCalled();
});
