import { notify } from "@/lib/notifications";

import {
  announceIdeaCards,
  parseIdeaCards,
  useIdeaMoved,
} from "../idea-notice";

jest.mock("@/lib/notifications", () => ({
  notify: { info: jest.fn(), error: jest.fn() },
}));

const info = notify.info as jest.Mock;
const error = notify.error as jest.Mock;

type Action = { label: string; onClick: () => void };
const shownAction = () => info.mock.calls[0][1].action as Action | undefined;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => jest.clearAllMocks());

describe("parseIdeaCards", () => {
  it("reads the event, and treats a malformed one as empty", () => {
    expect(
      parseIdeaCards('{"message":"Moved 3 to Ideas: a, b, ...","runId":"r1"}')
    ).toEqual({ message: "Moved 3 to Ideas: a, b, ...", runId: "r1" });
    expect(parseIdeaCards("not json")).toEqual({});
    expect(parseIdeaCards("null")).toEqual({});
  });
});

describe("announceIdeaCards", () => {
  it("shows nothing without a message", () => {
    expect(announceIdeaCards({ runId: "r1" }, { undo: jest.fn() })).toBe(false);
    expect(info).not.toHaveBeenCalled();
  });

  it("shows one line with Undo, which reverses the whole run", async () => {
    const undo = jest.fn().mockResolvedValue(undefined);
    expect(
      announceIdeaCards(
        {
          message: "Moved 3 to Ideas: Read news, Watch a talk, ...",
          runId: "r1",
        },
        { undo }
      )
    ).toBe(true);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][0]).toBe(
      "Moved 3 to Ideas: Read news, Watch a talk, ..."
    );
    expect(shownAction()?.label).toBe("Undo");
    shownAction()!.onClick();
    await settle();
    expect(undo).toHaveBeenCalledWith("r1");
    expect(error).not.toHaveBeenCalled();
  });

  it("no Undo when the event names no run", () => {
    announceIdeaCards({ message: "Moved to Ideas: x" }, { undo: jest.fn() });
    expect(shownAction()).toBeUndefined();
  });

  it("a failed Undo says so", async () => {
    announceIdeaCards(
      { message: "Moved to Ideas: x", runId: "r1" },
      { undo: jest.fn().mockRejectedValue(new Error("Could not undo")) }
    );
    shownAction()!.onClick();
    await settle();
    expect(error.mock.calls[0][0]).toBe("Could not undo that");
  });

  it("a conflict says the person changed a task since", async () => {
    announceIdeaCards(
      { message: "Moved to Ideas: x", runId: "r1" },
      {
        undo: jest
          .fn()
          .mockRejectedValue(
            Object.assign(new Error("conflict"), { status: 409 })
          ),
      }
    );
    shownAction()!.onClick();
    await settle();
    expect(error.mock.calls[0][0]).toMatch(/you changed a task since/);
  });

  it("on Today the line goes to the screen's own note, not the pill, and Undo reaches the run", async () => {
    const undo = jest.fn().mockResolvedValue(undefined);
    const stop = useIdeaMoved.getState().mount();
    expect(
      announceIdeaCards(
        { message: "Moved 3 to Ideas: a, b, ...", runId: "r1" },
        { undo }
      )
    ).toBe(true);
    expect(info).not.toHaveBeenCalled();
    const held = useIdeaMoved.getState().notice;
    expect(held?.message).toBe("Moved 3 to Ideas: a, b, ...");
    await held?.undo?.();
    expect(undo).toHaveBeenCalledWith("r1");
    // Today closing without an answer drops the line; the next one is a pill
    stop();
    expect(useIdeaMoved.getState().notice).toBeNull();
    announceIdeaCards({ message: "Moved to Ideas: x" }, { undo });
    expect(info).toHaveBeenCalledTimes(1);
  });
});
