/**
 * @jest-environment jsdom
 *
 * Two faces, one state: the controller is called once by the route
 * component, above the switch, so the open message survives a resize across
 * 700 px in both directions and the route does not remount.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { MailFaces } from "../../../mail/MailFaces";
import { PhoneUiProvider } from "../../../root/phone-ui-context";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mounts = { route: 0 };

jest.mock("../../../mail/useMailbox", () => {
  const react = jest.requireActual<typeof import("react")>("react");
  return {
    useMailbox: () => {
      const [openId, setOpenId] = react.useState<string | null>(null);
      react.useEffect(() => {
        mounts.route += 1;
      }, []);
      return { openId, open: (m: { id: string }) => setOpenId(m.id) };
    },
  };
});
jest.mock("../../../mail/MailScreen", () => ({
  MailScreen: () => {
    const react = jest.requireActual<typeof import("react")>("react");
    return react.createElement("div", { "data-face": "desktop" });
  },
}));
jest.mock("../PhoneMail", () => ({
  PhoneMail: ({
    box,
  }: {
    box: { openId: string | null; open: (m: { id: string }) => void };
  }) => {
    const react = jest.requireActual<typeof import("react")>("react");
    return react.createElement(
      "button",
      {
        "data-face": "phone",
        "data-open": box.openId ?? "",
        onClick: () => box.open({ id: "m7" }),
      },
      "open"
    );
  },
}));

let host: HTMLDivElement;
let root: Root;
const render = (ui: "phone" | "desktop") =>
  act(() => root.render(h(PhoneUiProvider, { value: ui }, h(MailFaces))));

beforeEach(() => {
  mounts.route = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("the open message survives phone → desktop → phone, and the route mounts once", () => {
  render("phone");
  act(() => {
    host
      .querySelector<HTMLElement>("[data-face=phone]")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(
    host.querySelector("[data-face=phone]")?.getAttribute("data-open")
  ).toBe("m7");
  render("desktop");
  expect(host.querySelector("[data-face=desktop]")).not.toBeNull();
  expect(host.querySelector("[data-face=phone]")).toBeNull();
  render("phone");
  expect(
    host.querySelector("[data-face=phone]")?.getAttribute("data-open")
  ).toBe("m7");
  expect(mounts.route).toBe(1);
});
