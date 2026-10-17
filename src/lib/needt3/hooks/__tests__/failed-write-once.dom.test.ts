/**
 * @jest-environment jsdom
 *
 * The app's QueryClient retries a failed mutation once. An undoable mutation
 * already reverts and tells the person when it fails, so a retry would send
 * the write a second time and stack a second "Could not ..." notice. A
 * refused task write must go out once and be said once.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { useUpdateTask } from "../tasks";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockError = jest.fn();
jest.mock("@/lib/notifications", () => ({
  notify: {
    error: (...a: unknown[]) => mockError(...a),
    success: jest.fn(),
    info: jest.fn(),
  },
}));

let host: HTMLDivElement;
let root: Root;
let fetchMock: jest.Mock;
const api: { update?: ReturnType<typeof useUpdateTask> } = {};

function Probe() {
  api.update = useUpdateTask();
  return null;
}

beforeEach(() => {
  mockError.mockReset();
  fetchMock = jest.fn(async () => ({
    ok: false,
    status: 500,
    statusText: "",
    text: async () => JSON.stringify({ error: "nope" }),
  }));
  global.fetch = fetchMock as unknown as typeof fetch;
  // The same defaults the product's TanstackQueryProvider sets.
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: 1, retryDelay: 0 } },
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(h(QueryClientProvider, { client }, h(Probe))));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("sends a refused task write once and says so once", async () => {
  await act(async () => {
    await api
      .update!.mutateAsync({ id: "task-1", patch: { done: true } })
      .catch(() => undefined);
  });
  // (the client logger posts to /api/logs too; only the task write counts)
  const writes = fetchMock.mock.calls.filter(([url]) =>
    String(url).startsWith("/api/tasks/")
  );
  expect(writes).toHaveLength(1);
  expect(mockError).toHaveBeenCalledTimes(1);
  expect(mockError).toHaveBeenCalledWith(
    "Could not update the task. Your change was reverted."
  );
});
