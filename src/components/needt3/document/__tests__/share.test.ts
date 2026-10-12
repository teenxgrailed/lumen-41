import { panelOpenFrom } from "../panel";
import {
  checkInvite,
  initials,
  isEmail,
  roleLabel,
  shareSubline,
} from "../share";

jest.mock("@/lib/needt3/hooks/settings", () => ({
  useSettings: jest.fn(),
  useSetPref: jest.fn(),
}));

const ann = { userId: "u2", name: "Ann Lee", email: "ann@x.io", image: null };
const owner = { userId: "u1", name: "Max", email: "max@x.io", image: null };

describe("checkInvite", () => {
  const members = [owner, ann];
  it("resolves a workspace member, case-insensitively", () => {
    expect(checkInvite(" ANN@x.io ", members, [], "u1")).toEqual({
      ok: true,
      person: ann,
    });
  });

  it("says why an email cannot be invited", () => {
    expect(checkInvite("", members, [], "u1")).toEqual({
      ok: false,
      reason: "empty",
    });
    expect(checkInvite("ann@", members, [], "u1")).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(checkInvite("zoe@x.io", members, [], "u1")).toEqual({
      ok: false,
      reason: "outside",
    });
    expect(checkInvite("max@x.io", members, [], "u1")).toEqual({
      ok: false,
      reason: "owner",
    });
    expect(
      checkInvite("ann@x.io", members, [{ ...ann, role: "VIEWER" }], "u1")
    ).toEqual({ ok: false, reason: "dupe" });
  });
});

describe("share sheet text", () => {
  it("the status line counts people and the link", () => {
    expect(shareSubline(0, false)).toBe("Private — only you can see this page");
    expect(shareSubline(1, false)).toBe("Shared with 1 person");
    expect(shareSubline(2, true)).toBe(
      "Anyone with the link can view · 2 people invited"
    );
    expect(shareSubline(0, true)).toBe("Anyone with the link can view");
  });

  it("roles, initials and email checks", () => {
    expect(roleLabel("EDITOR")).toBe("Can edit");
    expect(roleLabel("FULL_ACCESS")).toBe("Full access");
    expect(initials("Ann Lee")).toBe("AL");
    expect(initials("ann.lee@x.io")).toBe("AL");
    expect(isEmail("a@b.co")).toBe(true);
    expect(isEmail("a@b")).toBe(false);
  });
});

describe("doc panel pref", () => {
  it("is open only when the pref says true", () => {
    expect(panelOpenFrom(undefined)).toBe(false);
    expect(panelOpenFrom({ docPanel: "1" })).toBe(false);
    expect(panelOpenFrom({ docPanel: true })).toBe(true);
  });
});
