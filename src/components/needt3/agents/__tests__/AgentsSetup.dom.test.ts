/**
 * @jest-environment jsdom
 *
 * The first-visit setup: pick agents on the arc, see the connect steps with
 * the real connector address, "Connected" only once a new agent actually
 * appears in the hub, then finish and land on the Map.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { AgentsSetup, onboardingSeen } from "../AgentsSetup";
import { CONNECTOR_URL } from "../connect-guide";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/notifications", () => ({
  notify: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

let host: HTMLElement;
let root: Root;
const onDone = jest.fn();
const onFinish = jest.fn();

function render(agentCount: number) {
  act(() => {
    root.render(h(AgentsSetup, { agentCount, onDone, onFinish }));
  });
}
const $ = (s: string) => host.querySelector<HTMLElement>(s);
const click = (el: HTMLElement | null) =>
  act(() => {
    el!.click();
  });

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return 1200;
    },
  });
});
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  window.localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
});

describe("Agents setup", () => {
  it("walks pick, connect and finish, with real connection detection", () => {
    render(1);
    expect($(".ag-cnt")?.textContent).toBe("1 / 3");
    // Eight agents on the arc; two picked by default.
    expect(host.querySelectorAll("[data-ag-setup-agent]")).toHaveLength(8);
    expect(
      $('[data-ag-setup-agent="claude"]')?.getAttribute("aria-pressed")
    ).toBe("true");
    click($('[data-ag-setup-agent="claude"]'));
    click($('[data-ag-setup-agent="chatgpt"]'));
    expect(($("[data-ag-setup-continue]") as HTMLButtonElement).disabled).toBe(
      true
    );
    click($('[data-ag-setup-agent="cursor"]'));
    click($("[data-ag-setup-continue]"));

    expect($(".ag-cnt")?.textContent).toBe("2 / 3");
    expect($(".ag-card2-hd h2")?.textContent).toBe("Connect Cursor");
    expect($("[data-ag-setup-url]")?.textContent).toBe(CONNECTOR_URL);
    expect(
      $("[data-ag-setup-status]")?.getAttribute("data-ag-setup-status")
    ).toBe("wait");
    expect(($("[data-ag-setup-finish]") as HTMLButtonElement).disabled).toBe(
      true
    );

    // A new agent shows up in the hub: connected.
    render(2);
    expect(
      $("[data-ag-setup-status]")?.getAttribute("data-ag-setup-status")
    ).toBe("ok");
    click($("[data-ag-setup-finish]"));
    expect(onFinish).toHaveBeenCalled();
    expect(onboardingSeen()).toBe(true);
    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(onDone).toHaveBeenCalled();
  });

  it("leaves with Not now, and remembers it", () => {
    render(0);
    click($("[data-ag-onboard-skip]"));
    expect(onDone).toHaveBeenCalled();
    expect(onboardingSeen()).toBe(true);
  });
});
