import { QueryClient } from "@tanstack/react-query";

import {
  pickWritableCalendar,
  writableCalendar,
} from "@/lib/needt3/hooks/events";

describe("where a new event is written", () => {
  it("uses an enabled Needt (LOCAL) calendar", () => {
    expect(
      pickWritableCalendar([
        { id: "g", type: "GOOGLE", name: "Work" },
        { id: "l", type: "LOCAL", name: "Needt" },
      ])?.id
    ).toBe("l");
  });

  it("never writes into a synced provider calendar or a disabled one", () => {
    expect(
      pickWritableCalendar([
        { id: "g", type: "GOOGLE", name: "Work" },
        { id: "l", type: "LOCAL", name: "Old", enabled: false },
      ])
    ).toBeNull();
  });
});

describe("making the Needt calendar", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("creates it once when two events are made at the same time", async () => {
    const calls: string[] = [];
    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      calls.push(init?.method ?? "GET");
      const body = init?.method === "POST" ? { id: "n", type: "LOCAL" } : [];
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
    const qc = new QueryClient();
    const [a, b] = await Promise.all([
      writableCalendar(qc),
      writableCalendar(qc),
    ]);
    expect(a.id).toBe("n");
    expect(b.id).toBe("n");
    expect(calls.filter((m) => m === "POST")).toHaveLength(1);
    expect((await writableCalendar(qc)).id).toBe("n");
    expect(calls.filter((m) => m === "POST")).toHaveLength(1);
  });
});
