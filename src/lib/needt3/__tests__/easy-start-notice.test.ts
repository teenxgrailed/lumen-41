import { notify } from "@/lib/notifications";

import { announceEasyStart, parseEasyStart } from "../easy-start-notice";

jest.mock("@/lib/notifications", () => ({
  notify: { info: jest.fn(), error: jest.fn() },
}));

const info = notify.info as jest.Mock;
const error = notify.error as jest.Mock;

type Action = { label: string; onClick: () => void };
const shownAction = () => info.mock.calls[0][1].action as Action | undefined;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => jest.clearAllMocks());

describe("parseEasyStart", () => {
  it("reads the event, and treats a malformed one as empty", () => {
    expect(
      parseEasyStart('{"message":"Simplified: x","actionId":"a1"}')
    ).toEqual({ message: "Simplified: x", actionId: "a1" });
    expect(parseEasyStart("not json")).toEqual({});
    expect(parseEasyStart("null")).toEqual({});
  });
});

describe("announceEasyStart", () => {
  it("shows nothing without a message", () => {
    expect(announceEasyStart({ actionId: "a1" }, { undo: jest.fn() })).toBe(
      false
    );
    expect(info).not.toHaveBeenCalled();
  });

  it("an applied change: the line with Undo", async () => {
    const undo = jest.fn().mockResolvedValue(undefined);
    expect(
      announceEasyStart(
        { message: "Simplified: Tax, first step", actionId: "a1" },
        { undo }
      )
    ).toBe(true);
    expect(info.mock.calls[0][0]).toBe("Simplified: Tax, first step");
    expect(shownAction()?.label).toBe("Undo");
    shownAction()!.onClick();
    await settle();
    expect(undo).toHaveBeenCalledWith("a1");
    expect(error).not.toHaveBeenCalled();
  });

  it("a suggestion: the line asks Simplify? and the button is Apply", async () => {
    const undo = jest.fn();
    const apply = jest.fn().mockResolvedValue(undefined);
    announceEasyStart(
      { message: "Simplify? Tax, first step", proposalId: "p1" },
      { undo, apply }
    );
    expect(shownAction()?.label).toBe("Apply");
    shownAction()!.onClick();
    await settle();
    expect(apply).toHaveBeenCalledWith("p1");
    expect(undo).not.toHaveBeenCalled();
  });

  it("a line with neither an action nor a proposal has no button (the backfill's summed line)", () => {
    announceEasyStart(
      { message: "Simplified: gave 12 tasks a first step" },
      { undo: jest.fn() }
    );
    expect(shownAction()).toBeUndefined();
  });

  it("a failed Undo says so; a 409 says the person changed it", async () => {
    const undo = jest
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("conflict"), { status: 409 })
      )
      .mockRejectedValueOnce(new Error("network"));
    announceEasyStart({ message: "Simplified: x", actionId: "a1" }, { undo });
    shownAction()!.onClick();
    await settle();
    expect(error.mock.calls[0][0]).toBe("Could not undo: you changed it since");

    shownAction()!.onClick();
    await settle();
    expect(error.mock.calls[1][0]).toBe("Could not undo that");
  });

  it("a failed Apply says so too", async () => {
    const apply = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error("stale"), { status: 409 }));
    announceEasyStart(
      { message: "Simplify? x", proposalId: "p1" },
      { undo: jest.fn(), apply }
    );
    shownAction()!.onClick();
    await settle();
    expect(error.mock.calls[0][0]).toBe(
      "Could not apply: you changed the task since"
    );
  });
});
