/**
 * @jest-environment jsdom
 */
import { readFileSync } from "fs";
import { join } from "path";

// The vendored "tick" (scale 0.4 -> 1.16 plus a ring) is for marks. A checked
// ROW is a whole line wide: ticking it made it wider than its menu and flashed
// a horizontal scrollbar on open. This loads the real vendored sheet plus the
// hand-written override, in the order v3-entry.css loads them, and reads the
// computed animation of a row versus a mark.
const vendored = readFileSync(join(__dirname, "../v3/app.css"), "utf8");
const override = readFileSync(
  join(__dirname, "../v3-overrides/motion.css"),
  "utf8"
);

beforeAll(() => {
  for (const css of [vendored, override]) {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }
});

const animationOf = (html: string): string => {
  const root = document.createElement("div");
  root.className = "needt-v3";
  root.innerHTML = html;
  document.body.appendChild(root);
  const el = root.firstElementChild as HTMLElement;
  const cs = getComputedStyle(el);
  const out = `${cs.animation} ${cs.animationName}`;
  root.remove();
  return out;
};

const TICK = /v3-needt-tick/;

describe("the check tick", () => {
  it("still plays on marks", () => {
    for (const html of [
      '<button role="checkbox" aria-checked="true" data-state="checked"></button>',
      '<button role="radio" aria-checked="true" data-state="checked"></button>',
      '<button role="switch" aria-checked="true" data-state="checked"></button>',
    ]) {
      expect(animationOf(html)).toMatch(TICK);
    }
  });

  it("does not play on a checked menu or list row", () => {
    for (const html of [
      '<div role="menuitemradio" aria-checked="true" data-state="checked"></div>',
      '<div role="menuitemcheckbox" aria-checked="true" data-state="checked"></div>',
      '<div role="option" aria-checked="true"></div>',
      '<button role="radio" aria-checked="true" class="fc-snd-row"></button>',
      '<button role="radio" aria-checked="true" class="docs-share-role"></button>',
      '<button role="radio" aria-checked="true" class="kp-seg-b"></button>',
      '<button role="radio" aria-checked="true" class="pw-apple-opt"></button>',
    ]) {
      expect(animationOf(html)).not.toMatch(TICK);
    }
  });
});
