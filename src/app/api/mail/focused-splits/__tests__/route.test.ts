import { NextRequest } from "next/server";

import { DELETE } from "@/app/api/mail/focused-splits/[id]/route";
import { GET, POST } from "@/app/api/mail/focused-splits/route";

import { authenticateRequest } from "@/lib/auth/api-auth";
import {
  createMailFocusedSplit,
  deleteMailFocusedSplit,
  listMailFocusedSplits,
} from "@/lib/mail-db";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/mail-db", () => ({
  createMailFocusedSplit: jest.fn(),
  deleteMailFocusedSplit: jest.fn(),
  listMailFocusedSplits: jest.fn(),
}));

const mockAuthenticateRequest = jest.mocked(authenticateRequest);
const mockCreateMailFocusedSplit = jest.mocked(createMailFocusedSplit);
const mockDeleteMailFocusedSplit = jest.mocked(deleteMailFocusedSplit);
const mockListMailFocusedSplits = jest.mocked(listMailFocusedSplits);

function assertResponse(response: Response | undefined): Response {
  if (!response) throw new Error("Expected a route response.");
  return response;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthenticateRequest.mockResolvedValue({ userId: "user-1" } as never);
});

describe("focused Mail split routes", () => {
  it("lists only the authenticated user's personal splits", async () => {
    mockListMailFocusedSplits.mockResolvedValue([]);

    const response = assertResponse(
      await GET(new NextRequest("http://localhost/api/mail/focused-splits"))
    );

    expect(response.status).toBe(200);
    expect(mockListMailFocusedSplits).toHaveBeenCalledWith("user-1");
  });

  it("creates a focused split with the authenticated user scope", async () => {
    mockCreateMailFocusedSplit.mockResolvedValue({
      id: "split-1",
      userId: "user-1",
      name: "Invoices",
      senderAddress: "billing@example.com",
      position: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = assertResponse(
      await POST(
        new NextRequest("http://localhost/api/mail/focused-splits", {
          method: "POST",
          body: JSON.stringify({
            name: "Invoices",
            senderAddress: "billing@example.com",
          }),
        })
      )
    );

    expect(response.status).toBe(201);
    expect(mockCreateMailFocusedSplit).toHaveBeenCalledWith({
      userId: "user-1",
      name: "Invoices",
      senderAddress: "billing@example.com",
    });
  });

  it("rejects a malformed sender address", async () => {
    const response = assertResponse(
      await POST(
        new NextRequest("http://localhost/api/mail/focused-splits", {
          method: "POST",
          body: JSON.stringify({ name: "Invoices", senderAddress: "billing" }),
        })
      )
    );

    expect(response.status).toBe(400);
    expect(mockCreateMailFocusedSplit).not.toHaveBeenCalled();
  });

  it("does not delete another user's split", async () => {
    mockDeleteMailFocusedSplit.mockResolvedValue({ count: 0 });

    const response = assertResponse(
      await DELETE(
        new NextRequest(
          "http://localhost/api/mail/focused-splits/split-other",
          {
            method: "DELETE",
          }
        ),
        { params: Promise.resolve({ id: "split-other" }) }
      )
    );

    expect(response.status).toBe(404);
    expect(mockDeleteMailFocusedSplit).toHaveBeenCalledWith(
      "user-1",
      "split-other"
    );
  });
});
