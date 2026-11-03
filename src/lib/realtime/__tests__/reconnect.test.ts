import {
  INITIAL_REALTIME_RECONNECT_DELAY_MS,
  MAX_REALTIME_RECONNECT_DELAY_MS,
  nextRealtimeReconnectDelay,
} from "../reconnect";

describe("realtime reconnect backoff", () => {
  it("doubles from the initial delay and stops at the cap", () => {
    let delay = INITIAL_REALTIME_RECONNECT_DELAY_MS;
    const seen = [delay];
    for (let i = 0; i < 8; i += 1) {
      delay = nextRealtimeReconnectDelay(delay);
      seen.push(delay);
    }
    expect(seen.slice(0, 4)).toEqual([2_000, 4_000, 8_000, 16_000]);
    expect(Math.max(...seen)).toBe(MAX_REALTIME_RECONNECT_DELAY_MS);
    expect(nextRealtimeReconnectDelay(MAX_REALTIME_RECONNECT_DELAY_MS)).toBe(
      MAX_REALTIME_RECONNECT_DELAY_MS
    );
  });
});
