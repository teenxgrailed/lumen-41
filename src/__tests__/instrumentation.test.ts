import * as Sentry from "@sentry/nextjs";

import { onRequestError, register } from "../instrumentation";

const serverConfig = jest.fn();
const edgeConfig = jest.fn();
const installDrainHandlers = jest.fn();

jest.mock("../../sentry.server.config", () => serverConfig(), {
  virtual: true,
});
jest.mock("../../sentry.edge.config", () => edgeConfig(), { virtual: true });
jest.mock("@/lib/drain", () => ({
  installDrainHandlers: () => installDrainHandlers(),
}));
jest.mock("@sentry/nextjs", () => ({ captureRequestError: jest.fn() }));

const originalRuntime = process.env.NEXT_RUNTIME;

describe("instrumentation register()", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  afterAll(() => {
    if (originalRuntime === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = originalRuntime;
  });

  it("loads the server Sentry config and the drain on nodejs", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    await register();

    expect(serverConfig).toHaveBeenCalledTimes(1);
    expect(edgeConfig).not.toHaveBeenCalled();
    expect(installDrainHandlers).toHaveBeenCalledTimes(1);
  });

  it("loads only the edge Sentry config on edge", async () => {
    process.env.NEXT_RUNTIME = "edge";
    await register();

    expect(edgeConfig).toHaveBeenCalledTimes(1);
    expect(serverConfig).not.toHaveBeenCalled();
    expect(installDrainHandlers).not.toHaveBeenCalled();
  });

  it("loads nothing when the runtime is unknown", async () => {
    delete process.env.NEXT_RUNTIME;
    await register();

    expect(serverConfig).not.toHaveBeenCalled();
    expect(edgeConfig).not.toHaveBeenCalled();
  });

  it("exports Sentry's request error hook", () => {
    expect(onRequestError).toBe(Sentry.captureRequestError);
  });
});
