import { type ApiTask, taskFromApi, taskPatchToApi } from "@/lib/needt3/map";

const TZ = "Europe/Zurich";
const ROW: ApiTask = { id: "t1", title: "Print run", status: "todo" };

describe("V3Task parts and waits", () => {
  it("are empty when the API sends none", () => {
    expect(taskFromApi(ROW, TZ)).toMatchObject({ parts: [], waits: [] });
  });

  it("orders parts by position and keeps id, title, done", () => {
    const t = taskFromApi(
      {
        ...ROW,
        parts: [
          { id: "b", title: "Second", done: false, position: 2048 },
          { id: "a", title: "First", done: true, position: 1024 },
        ],
      },
      TZ
    );
    expect(t.parts).toEqual([
      { id: "a", title: "First", done: true },
      { id: "b", title: "Second", done: false },
    ]);
  });

  it("maps open waits to on / onName / for and drops resolved ones", () => {
    const t = taskFromApi(
      {
        ...ROW,
        waits: [
          {
            id: "w1",
            reason: "the legal sign-off",
            resolvedAt: null,
            waitingOnUserId: "anna",
            waitingOnUser: { id: "anna", name: "Anna", image: null },
          },
          {
            id: "w0",
            reason: "old",
            resolvedAt: "2026-09-01T08:00:00.000Z",
            waitingOnUserId: "tom",
          },
        ],
      },
      TZ
    );
    expect(t.waits).toEqual([
      { id: "w1", on: "anna", onName: "Anna", for: "the legal sign-off" },
    ]);
  });

  it("a person without a name maps to onName null", () => {
    const t = taskFromApi(
      {
        ...ROW,
        waits: [
          { id: "w", reason: "x", waitingOnUserId: "u", waitingOnUser: null },
        ],
      },
      TZ
    );
    expect(t.waits[0].onName).toBeNull();
  });

  it("never writes parts or waits through the task body", () => {
    const body = taskPatchToApi({ title: "Renamed" }, TZ);
    expect(body).toEqual({ title: "Renamed" });
    expect(body).not.toHaveProperty("parts");
    expect(body).not.toHaveProperty("waits");
  });
});
