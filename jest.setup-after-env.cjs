"use strict";

// Creating a task queues an easy start job (src/services/easy-start/queue.ts).
// With REDIS_URL set (CI) the real queue opens a BullMQ connection that no
// test closes, so jest never exits. Every test file gets the no-op; a test of
// the queue wrapper itself takes the real one with
// `jest.requireActual("@/services/easy-start/queue")`.
jest.mock("@/services/easy-start/queue", () => ({
  queueEasyStart: jest.fn().mockResolvedValue(undefined),
}));
