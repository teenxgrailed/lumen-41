/**
 * @jest-environment jsdom
 *
 * Two faces, one state: the controller is called once by the route
 * component, above the switch, and handed to BOTH faces, so what is open and
 * the selected view survive a resize across 700 px in both directions and the
 * route does not remount.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { MailFaces } from "../../../mail/MailFaces";
import { PhoneUiProvider } from "../../../root/phone-ui-context";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mounts = { route: 0 };

type FakeBox = {
  tab: string;
  setTab: (t: string) => void;
  openId: string | null;
  open: (m: { id: string }) => void;
};

jest.mock("../../../mail/useMailbox", () => {
  const react = jest.requireActual<typeof import("react")>("react");
  return {
    useMailbox: () => {
      const [openId, setOpenId] = react.useState<string | null>(null);
      const [tab, setTab] = react.useState("needs");
      react.useEffect(() => {
        mounts.route += 1;
      }, []);
      return {
        openId,
        tab,
        setTab,
        open: (m: { id: string }) => setOpenId(m.id),
      };
    },
  };
});

// both faces are stateless drawings of the one box, as the real ones are
const face =
  (name: string) =>
  ({ box }: { box: FakeBox }) => {
    const react = jest.requireActual<typeof import("react")>("react");
    return react.createElement(
      "div",
      { "data-face": name, "data-open": box.openId ?? "", "data-tab": box.tab },
      react.createElement("button", {
        "data-act": "open",
        onClick: () => box.open({ id: name === "phone" ? "m7" : "m9" }),
      }),
      react.createElement("button", {
        "data-act": "tab",
        onClick: () => box.setTab("all"),
      })
    );
  };
jest.mock("../../../mail/MailScreen", () => ({
  MailScreen: (p: { box: FakeBox }) => face("desktop")(p),
}));
jest.mock("../PhoneMail", () => ({
  PhoneMail: (p: { box: FakeBox }) => face("phone")(p),
}));

let host: HTMLDivElement;
let root: Root;
const render = (ui: "phone" | "desktop") =>
  act(() => root.render(h(PhoneUiProvider, { value: ui }, h(MailFaces))));
const click = (sel: string) =>
  act(() => {
    host
      .querySelector<HTMLElement>(sel)!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
const attr = (f: string, name: string) =>
  host.querySelector(`[data-face=${f}]`)?.getAttribute(name);

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

it("the open message and the tab survive phone → desktop → phone, and the route mounts once", () => {
  render("phone");
  click("[data-face=phone] [data-act=open]");
  click("[data-face=phone] [data-act=tab]");
  expect(attr("phone", "data-open")).toBe("m7");
  render("desktop");
  expect(host.querySelector("[data-face=phone]")).toBeNull();
  expect(attr("desktop", "data-open")).toBe("m7");
  expect(attr("desktop", "data-tab")).toBe("all");
  render("phone");
  expect(attr("phone", "data-open")).toBe("m7");
  expect(attr("phone", "data-tab")).toBe("all");
  expect(mounts.route).toBe(1);
});

it("what is opened on the desktop is still open on the phone, and back", () => {
  render("desktop");
  click("[data-face=desktop] [data-act=open]");
  click("[data-face=desktop] [data-act=tab]");
  render("phone");
  expect(attr("phone", "data-open")).toBe("m9");
  expect(attr("phone", "data-tab")).toBe("all");
  render("desktop");
  expect(attr("desktop", "data-open")).toBe("m9");
  expect(mounts.route).toBe(1);
});
