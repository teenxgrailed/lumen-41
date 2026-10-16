/**
 * @jest-environment jsdom
 *
 * The panel's empty state is the mockup's: context chip, greeting by name,
 * the six cards for the thing it is looking at, the hints row and the
 * composer's tools. A card sends the line that names the context.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { ChatPanel, type ChatPanelProps, OPEN_TAIL } from "../ChatPanel";

const G = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
G.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../orb/AiOrb", () => ({ AiOrb: () => null }));
jest.mock("../useAskScope", () => ({ useMentionItems: () => [] }));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(extra: Partial<ChatPanelProps> = {}) {
  const props: ChatPanelProps = {
    messages: [],
    phase: "idle",
    scope: { kind: "task", id: "t1", title: "Tank graphic" },
    scopes: [{ kind: "task", id: "t1", title: "Tank graphic" }],
    onScope: jest.fn(),
    name: "Maksym",
    onSend: jest.fn(),
    onStop: jest.fn(),
    onNew: jest.fn(),
    onClose: jest.fn(),
    onPopLast: jest.fn(() => null),
    ...extra,
  };
  act(() => root.render(h(ChatPanel, props)));
  return props;
}

describe("Ask Needt panel", () => {
  it("shows the context chip, greeting, six cards, hints and composer tools", () => {
    render();
    expect(host.querySelector("[data-chat-scope]")?.textContent).toContain(
      "Task: Tank graphic"
    );
    expect(host.querySelector(".chat-hello")?.textContent).toMatch(
      /^Good (morning|afternoon|evening), Maksym$/
    );
    expect(host.querySelector(".chat-hello-sub")?.textContent).toBe(
      "I'm looking at “Tank graphic”. Ask what to do with it."
    );
    expect(host.querySelectorAll("[data-chat-suggest]")).toHaveLength(6);
    expect(host.querySelector(".chat-hints")?.textContent).toBe(
      "/ commands @ mention ↑ edit last"
    );
    expect(
      host.querySelector<HTMLTextAreaElement>("[data-chat-input]")?.placeholder
    ).toBe("Ask, or type / for commands");
    expect(host.querySelector("[data-chat-at]")).not.toBeNull();
    expect(host.querySelector("[data-chat-slash]")).not.toBeNull();
    expect(host.querySelector("[data-chat-send]")).not.toBeNull();
    expect(
      host.querySelector<HTMLButtonElement>("[aria-label='Attach a file']")
        ?.disabled
    ).toBe(true);
  });

  it("a card sends the line that names the task", () => {
    const props = render();
    const card = host.querySelector<HTMLButtonElement>(
      "[data-chat-suggest='steps']"
    );
    act(() => card?.click());
    expect(props.onSend).toHaveBeenCalledWith(
      "Break the task “Tank graphic” into steps",
      false,
      "Break the task “Tank graphic” into steps"
    );
  });

  describe("opening", () => {
    const thread = (n: number): ChatPanelProps["messages"] =>
      Array.from({ length: n }, (_, i) => ({
        id: `m${i}`,
        from: i % 2 ? "needt" : "you",
        text: `line ${i}`,
        at: 0,
      })) as ChatPanelProps["messages"];
    const ids = () =>
      [...host.querySelectorAll(".chat-msg")].map((n) => n.textContent);

    beforeEach(() => {
      jest.useFakeTimers();
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: (q: string) => ({
          matches: false,
          media: q,
          addEventListener() {},
          removeEventListener() {},
        }),
      });
    });
    afterEach(() => jest.useRealTimers());

    it("mounts only the latest lines while the panel flies in, the rest after", () => {
      render({ messages: thread(12) });
      expect(ids()).toHaveLength(OPEN_TAIL);
      expect(ids()[OPEN_TAIL - 1]).toContain("line 11");
      act(() => void jest.advanceTimersByTime(520));
      expect(ids()).toHaveLength(12);
      // the older ones arrive as history: they do not play the entrance
      expect(host.querySelectorAll(".chat-msg.is-history")).toHaveLength(8);
    });

    it("a short thread mounts whole at once, with no later re-render", () => {
      render({ messages: thread(OPEN_TAIL) });
      expect(ids()).toHaveLength(OPEN_TAIL);
      expect(host.querySelectorAll(".is-history")).toHaveLength(0);
    });

    it("reduced motion has no entrance to wait for", () => {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: (q: string) => ({
          matches: true,
          media: q,
          addEventListener() {},
          removeEventListener() {},
        }),
      });
      render({ messages: thread(12) });
      expect(ids()).toHaveLength(12);
    });

    it("scrolls to the newest line in the next frame, not during the render", () => {
      const raf = jest
        .spyOn(window, "requestAnimationFrame")
        .mockImplementation((cb) => window.setTimeout(() => cb(0), 16));
      render({ messages: thread(3) });
      const box = host.querySelector<HTMLElement>("[data-chat-scroll]")!;
      let top = 0;
      Object.defineProperty(box, "scrollHeight", { value: 900 });
      Object.defineProperty(box, "scrollTop", {
        get: () => top,
        set: (v: number) => {
          top = v;
        },
      });
      expect(top).toBe(0);
      act(() => void jest.advanceTimersByTime(20));
      expect(top).toBe(900);
      raf.mockRestore();
    });
  });
});
