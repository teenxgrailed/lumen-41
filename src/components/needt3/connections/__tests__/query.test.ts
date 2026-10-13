import type { ScreenQuery } from "../../states/status";
import { mergeQueries } from "../query";

const q = (over: Partial<ScreenQuery> = {}): ScreenQuery => ({
  status: "success",
  fetchStatus: "idle",
  data: [],
  error: null,
  refetch: jest.fn(),
  ...over,
});

describe("mergeQueries", () => {
  it("is content once every query has data", () => {
    const m = mergeQueries([q(), q()]);
    expect(m.status).toBe("success");
    expect(m.data).toBeDefined();
  });
  it("has no data while one is still loading", () => {
    const m = mergeQueries([q(), q({ status: "pending", data: undefined })]);
    expect(m.status).toBe("pending");
    expect(m.data).toBeUndefined();
  });
  it("is an error when one failed, and keeps its 403", () => {
    const err = { status: 403 };
    const m = mergeQueries([
      q(),
      q({ status: "error", data: undefined, error: err }),
    ]);
    expect(m.status).toBe("error");
    expect(m.error).toBe(err);
  });
  it("reports offline and fetching", () => {
    expect(mergeQueries([q(), q({ fetchStatus: "paused" })]).fetchStatus).toBe(
      "paused"
    );
    expect(mergeQueries([q({ fetchStatus: "fetching" })]).fetchStatus).toBe(
      "fetching"
    );
  });
  it("retries only what did not succeed", async () => {
    const ok = q();
    const bad = q({ status: "error", data: undefined, error: new Error("x") });
    await mergeQueries([ok, bad]).refetch();
    expect(ok.refetch).not.toHaveBeenCalled();
    expect(bad.refetch).toHaveBeenCalledTimes(1);
  });
});
