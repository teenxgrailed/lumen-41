/**
 * @jest-environment jsdom
 *
 * The route's two faces: the phone face on a phone, the desktop screen
 * otherwise, around the same editor element.
 */
import { act, createElement as h, createElement as mockH } from "react";

import { type Root, createRoot } from "react-dom/client";

import { PhoneUiProvider } from "../../../root/phone-ui-context";
import { DocsFace, DocumentFace } from "../Faces";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../../docs/DocsScreen", () => ({
  DocsScreen: () => mockH("i", { "data-face": "docs-desktop" }),
}));
jest.mock("../../../document/DocumentScreen", () => ({
  DocumentScreen: (p: {
    pageId: string;
    children: import("react").ReactNode;
  }) =>
    mockH("i", { "data-face": "doc-desktop", "data-id": p.pageId }, p.children),
}));
jest.mock("../DocsPhone", () => ({
  DocsPhone: () => mockH("i", { "data-face": "docs-phone" }),
}));
jest.mock("../ReaderPhone", () => ({
  ReaderPhone: (p: { pageId: string; children: import("react").ReactNode }) =>
    mockH("i", { "data-face": "doc-phone", "data-id": p.pageId }, p.children),
}));

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
const faces = () =>
  Array.from(host.querySelectorAll("[data-face]")).map((e) =>
    e.getAttribute("data-face")
  );

describe("faces", () => {
  it("Docs: phone on a phone, the desktop screen otherwise", () => {
    act(() => root.render(h(PhoneUiProvider, { value: "phone" }, h(DocsFace))));
    expect(faces()).toEqual(["docs-phone"]);
    act(() =>
      root.render(h(PhoneUiProvider, { value: "desktop" }, h(DocsFace)))
    );
    expect(faces()).toEqual(["docs-desktop"]);
  });

  it("Document: the same editor element in either face", () => {
    const editor = h("b", { "data-editor": "" });
    const doc = () => h(DocumentFace, { pageId: "p9", children: editor });
    act(() => root.render(h(PhoneUiProvider, { value: "phone" }, doc())));
    expect(faces()).toEqual(["doc-phone"]);
    expect(host.querySelector("[data-face] [data-editor]")).not.toBeNull();
    expect(host.querySelector("[data-face]")!.getAttribute("data-id")).toBe(
      "p9"
    );
    act(() => root.render(h(PhoneUiProvider, { value: "desktop" }, doc())));
    expect(faces()).toEqual(["doc-desktop"]);
    expect(host.querySelector("[data-face] [data-editor]")).not.toBeNull();
  });
});
