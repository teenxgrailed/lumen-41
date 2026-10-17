/**
 * @jest-environment jsdom
 *
 * The Apple / iCloud connect dialog's form: compact rows on the one form-row
 * geometry, no required asterisks, sensible autocomplete so a password manager
 * does not draw over the fields, one outcome line, Test · Cancel · Connect.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { CalDavForm, normaliseServerUrl } from "../CalDavForm";
import { explainCalDavFailure } from "../caldavErrors";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const onSuccess = jest.fn();
const onCancel = jest.fn();
const fetchMock = jest.fn();
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  onSuccess.mockReset();
  onCancel.mockReset();
  fetchMock.mockReset();
  Object.assign(globalThis, { fetch: fetchMock });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(h(CalDavForm, { onSuccess, onCancel })));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const $ = <T extends HTMLElement>(sel: string) => host.querySelector(sel) as T;
const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
function type(el: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const fill = () => {
  type($("#cn-caldav-user"), " me@icloud.com ");
  type($("#cn-caldav-password"), "abcd-efgh-ijkl-mnop");
};
const reply = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce({
    ok: status < 400,
    status,
    json: async () => body,
  });
const flush = () => act(async () => void (await Promise.resolve()));

describe("the form", () => {
  it("has no title of its own and no required asterisks", () => {
    expect(host.querySelector("h1,h2,h3,legend")).toBeNull();
    expect(host.textContent).not.toContain("*");
    expect($("form").hasAttribute("novalidate")).toBe(true);
  });

  it("is four rows on the form-row geometry with short labels", () => {
    const rows = [...host.querySelectorAll(".nt-form > .nt-row")];
    expect(rows).toHaveLength(4);
    expect(
      rows.map((r) => r.querySelector(".nt-row-label")?.textContent)
    ).toEqual(["Server", "Apple ID", "App password", "Path"]);
    expect(host.querySelectorAll(".nt-input")).toHaveLength(4);
    expect($<HTMLInputElement>("#cn-caldav-server").value).toBe(
      "https://caldav.icloud.com"
    );
  });

  it("tells password managers what each field is, and to stay out", () => {
    expect($("#cn-caldav-user").getAttribute("autocomplete")).toBe("username");
    expect($("#cn-caldav-password").getAttribute("autocomplete")).toBe(
      "new-password"
    );
    expect($("#cn-caldav-server").getAttribute("autocomplete")).toBe("off");
    for (const input of host.querySelectorAll("input")) {
      expect(input.getAttribute("data-1p-ignore")).toBe("true");
      expect(input.getAttribute("data-lpignore")).toBe("true");
    }
  });
});

describe("the guide", () => {
  it("lists the five steps with Apple's labels, in order", () => {
    const steps = [...host.querySelectorAll("ol > [data-cn-guide-step]")].map(
      (li) => li.textContent ?? ""
    );
    expect(steps).toHaveLength(5);
    expect(steps[0]).toContain("account.apple.com");
    expect(steps[1]).toContain("Sign-In and Security");
    expect(steps[1]).toContain("App-Specific Passwords");
    expect(steps[2]).toContain("Generate an app-specific password");
    expect(steps[3]).toContain("xxxx-xxxx-xxxx-xxxx");
    expect($("ol").tagName).toBe("OL");
  });

  it("opens account.apple.com in a new tab, safely", () => {
    const a = $<HTMLAnchorElement>("[data-cn-guide-open]");
    expect(a.getAttribute("href")).toBe("https://account.apple.com");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toContain("noopener");
  });

  it("says it can be revoked and what Needt reads", () => {
    expect(host.textContent).toContain("revoke the password at any time");
    expect($("[data-cn-guide-reads]").textContent).toContain(
      "reads your calendars"
    );
  });

  it("has three labelled sketches, each small, with no external image", () => {
    const svgs = [...host.querySelectorAll("svg.cn-guide-art")];
    expect(svgs).toHaveLength(3);
    for (const svg of svgs) {
      expect(svg.getAttribute("role")).toBe("img");
      expect(svg.getAttribute("aria-label")).toBeTruthy();
      expect(svg.outerHTML.length).toBeLessThan(6 * 1024);
      expect(svg.querySelector("image")).toBeNull();
    }
  });
});

describe("explainCalDavFailure", () => {
  it("falls back to a generic line when nothing is known", () => {
    expect(explainCalDavFailure(500)).toBe(
      "Could not reach the CalDAV server."
    );
    expect(explainCalDavFailure(403, "Calendar limit reached.")).toBe(
      "Calendar limit reached."
    );
  });
});

describe("test connection", () => {
  it("asks for the missing fields before it calls anything", () => {
    click($("[data-cn-caldav-test]"));
    expect($("[data-cn-caldav-note]").textContent).toBe(
      "Fill in the server, Apple ID and password."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the cleaned login and reports the calendars it found", async () => {
    fill();
    reply(200, { success: true, calendars: [{}, {}] });
    click($("[data-cn-caldav-test]"));
    await flush();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/calendar/caldav/test");
    expect(JSON.parse(init.body)).toEqual({
      serverUrl: "https://caldav.icloud.com",
      username: "me@icloud.com",
      password: "abcd-efgh-ijkl-mnop",
    });
    expect($("[data-cn-caldav-note]").textContent).toBe(
      "Connection works. 2 calendars found."
    );
  });

  it("shows the server's reason when it is not one we map", async () => {
    fill();
    reply(400, { success: false, error: "Check the path." });
    click($("[data-cn-caldav-test]"));
    await flush();
    expect($("[data-cn-caldav-note]").textContent).toBe("Check the path.");
    expect($("[data-cn-caldav-note]").getAttribute("role")).toBe("alert");
  });

  it("maps 401 to the app-specific password message", async () => {
    fill();
    reply(401, {
      error:
        "Failed to authenticate with CalDAV server. Please check your credentials.",
    });
    click($("[data-cn-caldav-test]"));
    await flush();
    expect($("[data-cn-caldav-note]").textContent).toMatch(
      /^Use an app-specific password, not your Apple ID password\./
    );
  });

  it("maps a network failure, thrown or 502, to a connection message", async () => {
    fill();
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    click($("[data-cn-caldav-test]"));
    await flush();
    expect($("[data-cn-caldav-note]").textContent).toBe(
      "Could not reach iCloud. Check your connection and try again."
    );
    reply(502, {
      error: "Could not connect to the CalDAV server. Please check",
    });
    click($("[data-cn-caldav-test]"));
    await flush();
    expect($("[data-cn-caldav-note]").textContent).toContain(
      "Could not reach iCloud"
    );
  });

  it("maps 404 to no calendars found", async () => {
    fill();
    reply(404, {
      error:
        "Could not find any calendars. Please check the server URL and path.",
    });
    click($("[data-cn-caldav-test]"));
    await flush();
    expect($("[data-cn-caldav-note]").textContent).toMatch(
      /^No calendars found\./
    );
  });

  it("forgets the outcome as soon as a field changes", async () => {
    fill();
    reply(200, { success: true, calendars: [] });
    click($("[data-cn-caldav-test]"));
    await flush();
    type($("#cn-caldav-user"), "other@icloud.com");
    expect($("[data-cn-caldav-note]")).toBeNull();
  });
});

describe("connect and cancel", () => {
  it("connects through the auth route and hands over without an alert", async () => {
    const alert = jest.fn();
    Object.assign(window, { alert });
    fill();
    reply(200, { ok: true });
    click($("[data-cn-caldav-connect]"));
    await flush();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/calendar/caldav/auth");
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
  });

  it("stays open and says why when the connection is refused", async () => {
    fill();
    reply(403, { error: "Calendar limit reached." });
    click($("[data-cn-caldav-connect]"));
    await flush();
    expect(onSuccess).not.toHaveBeenCalled();
    expect($("[data-cn-caldav-note]").textContent).toBe(
      "Calendar limit reached."
    );
  });

  it("cancels", () => {
    click(host.querySelectorAll(".cn-caldav-foot .nx-btn")[1]);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("normaliseServerUrl", () => {
  it("adds https and drops trailing slashes", () => {
    expect(normaliseServerUrl("caldav.fastmail.com/")).toBe(
      "https://caldav.fastmail.com"
    );
    expect(normaliseServerUrl(" http://dav.local// ")).toBe("http://dav.local");
  });
});
