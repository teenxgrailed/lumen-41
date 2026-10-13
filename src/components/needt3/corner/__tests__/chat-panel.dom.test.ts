/**
 * @jest-environment jsdom
 *
 * The panel's empty state is the mockup's: context chip, greeting by name,
 * the six cards for the thing it is looking at, the hints row and the
 * composer's tools. A card sends the line that names the context.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { ChatPanel, type ChatPanelProps } from "../ChatPanel";

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
});
