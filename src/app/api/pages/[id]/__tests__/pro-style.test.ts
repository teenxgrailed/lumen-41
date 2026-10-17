import { NextRequest } from "next/server";

import { PATCH } from "@/app/api/pages/[id]/route";
import { POST } from "@/app/api/pages/route";
import { createPage, getPage, updatePage } from "@/services/pages/page-service";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { resolvePageAccess } from "@/lib/auth/page-auth";
import { getPlan } from "@/lib/entitlements";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/auth/page-auth", () => ({ resolvePageAccess: jest.fn() }));
jest.mock("@/lib/entitlements", () => ({ getPlan: jest.fn() }));
jest.mock("@/services/pages/page-service", () => ({
  createPage: jest.fn(),
  getPage: jest.fn(),
  listPages: jest.fn(),
  updatePage: jest.fn(),
}));

const authenticate = authenticateRequest as jest.Mock;
const resolveAccess = resolvePageAccess as jest.Mock;
const plan = getPlan as jest.Mock;
const readPage = getPage as jest.Mock;
const writePage = updatePage as jest.Mock;
const addPage = createPage as jest.Mock;

const style = (backdrop: string, extra: Record<string, unknown> = {}) => ({
  backdrop,
  page: "white",
  text: "auto",
  separator: "line",
  font: "sans",
  wide: false,
  ...extra,
});

async function answered(res: Promise<Response | undefined>) {
  const out = await res;
  if (!out) throw new Error("The route returned no response");
  return out;
}

const patch = (body: unknown) =>
  answered(
    PATCH(
      new NextRequest("http://localhost/api/pages/page-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: "page-1" }) }
    )
  );

const post = (body: unknown) =>
  answered(
    POST(
      new NextRequest("http://localhost/api/pages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    )
  );

function stored(value: Record<string, unknown> | null) {
  readPage.mockResolvedValue({ id: "page-1", style: value });
}

beforeEach(() => {
  jest.clearAllMocks();
  authenticate.mockResolvedValue({ userId: "user-1" });
  resolveAccess.mockResolvedValue({ role: "FULL_ACCESS" });
  writePage.mockImplementation(async (_a, id, input) => ({ id, ...input }));
  addPage.mockImplementation(async (_a, input) => ({ id: "new", ...input }));
  stored(style("none"));
});

describe("Pro-only document style", () => {
  it("refuses a free plan setting a backdrop", async () => {
    plan.mockResolvedValue("FREE");
    const res = await patch({ style: style("ink") });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "UPGRADE_REQUIRED",
      plan: "FREE",
      keys: ["backdrop"],
    });
    expect(writePage).not.toHaveBeenCalled();
  });

  it("refuses a legacy theme that resolves to a backdrop", async () => {
    plan.mockResolvedValue("FREE");
    stored(null);
    const res = await patch({ style: { theme: "ocean" } });
    expect(res.status).toBe(403);
    expect(writePage).not.toHaveBeenCalled();
  });

  it("refuses creating a page with a backdrop on a free plan", async () => {
    plan.mockResolvedValue("FREE");
    const res = await post({ title: "A", style: style("dunes") });
    expect(res.status).toBe(403);
    expect(addPage).not.toHaveBeenCalled();
  });

  it.each(["PRO", "LIFETIME"])("lets %s set a backdrop", async (p) => {
    plan.mockResolvedValue(p);
    const res = await patch({ style: style("ink") });
    expect(res.status).toBe(200);
    expect(writePage).toHaveBeenCalledWith(
      expect.anything(),
      "page-1",
      expect.objectContaining({ style: style("ink") })
    );
  });

  it("keeps a stored backdrop after a downgrade while other edits pass", async () => {
    plan.mockResolvedValue("FREE");
    stored(style("ink"));
    const res = await patch({ style: style("ink", { page: "paper" }) });
    expect(res.status).toBe(200);
    expect(writePage).toHaveBeenCalledWith(
      expect.anything(),
      "page-1",
      expect.objectContaining({ style: style("ink", { page: "paper" }) })
    );
    // An unchanged Pro value is not a Pro change: the plan is not even read.
    expect(plan).not.toHaveBeenCalled();
  });

  it("refuses swapping one stored backdrop for another on a free plan", async () => {
    plan.mockResolvedValue("FREE");
    stored(style("ink"));
    const res = await patch({ style: style("ocean") });
    expect(res.status).toBe(403);
  });

  it.each([
    ["the free value", style("none")],
    ["a cleared style", null],
  ])("lets a free plan reset to %s", async (_label, next) => {
    plan.mockResolvedValue("FREE");
    stored(style("ink"));
    const res = await patch({ style: next });
    expect(res.status).toBe(200);
    expect(writePage).toHaveBeenCalled();
  });

  describe("page colours", () => {
    it.each(["rose", "lilac", "sage", "sky", "sand", "black"])(
      "refuses a free plan setting %s",
      async (page) => {
        plan.mockResolvedValue("FREE");
        const res = await patch({ style: style("none", { page }) });
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({ keys: ["page"] });
        expect(writePage).not.toHaveBeenCalled();
      }
    );

    it.each(["white", "paper", "graphite"])(
      "lets a free plan use %s",
      async (page) => {
        plan.mockResolvedValue("FREE");
        const res = await patch({ style: style("none", { page }) });
        expect(res.status).toBe(200);
        expect(plan).not.toHaveBeenCalled();
      }
    );

    it("lets a free plan keep a colour it already has and move back to a free one", async () => {
      plan.mockResolvedValue("FREE");
      stored(style("none", { page: "rose" }));
      const kept = await patch({
        style: style("none", { page: "rose", font: "serif" }),
      });
      expect(kept.status).toBe(200);
      const back = await patch({ style: style("none", { page: "white" }) });
      expect(back.status).toBe(200);
      expect(plan).not.toHaveBeenCalled();
    });

    it("lets Pro use every colour", async () => {
      plan.mockResolvedValue("PRO");
      const res = await patch({ style: style("none", { page: "rose" }) });
      expect(res.status).toBe(200);
    });
  });

  describe("covers", () => {
    it.each(["art:rose", "/api/pages/page-1/assets/a1"])(
      "refuses a free plan setting the cover %s",
      async (coverUrl) => {
        plan.mockResolvedValue("FREE");
        const res = await patch({ coverUrl });
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({
          error: "UPGRADE_REQUIRED",
          plan: "FREE",
          keys: ["cover"],
        });
        expect(writePage).not.toHaveBeenCalled();
      }
    );

    it("refuses a cover sent together with a style", async () => {
      plan.mockResolvedValue("FREE");
      const res = await patch({ style: style("none"), coverUrl: "art:sage" });
      expect(res.status).toBe(403);
    });

    it("lets a free plan remove a cover, and keep the one it has", async () => {
      plan.mockResolvedValue("FREE");
      readPage.mockResolvedValue({
        id: "page-1",
        style: style("none"),
        coverUrl: "art:rose",
      });
      const removed = await patch({ coverUrl: null });
      expect(removed.status).toBe(200);
      const kept = await patch({
        style: style("none", { font: "mono" }),
        coverUrl: "art:rose",
      });
      expect(kept.status).toBe(200);
      expect(plan).not.toHaveBeenCalled();
    });

    it("refuses swapping a stored cover for another on a free plan", async () => {
      plan.mockResolvedValue("FREE");
      readPage.mockResolvedValue({
        id: "page-1",
        style: style("none"),
        coverUrl: "art:rose",
      });
      const res = await patch({ coverUrl: "art:sand" });
      expect(res.status).toBe(403);
    });

    it.each(["PRO", "LIFETIME"])("lets %s set a cover", async (p) => {
      plan.mockResolvedValue(p);
      const res = await patch({ coverUrl: "art:rose" });
      expect(res.status).toBe(200);
    });
  });

  it("does not read the stored page or plan for a write without style", async () => {
    const res = await patch({ title: "Renamed" });
    expect(res.status).toBe(200);
    expect(readPage).not.toHaveBeenCalled();
    expect(plan).not.toHaveBeenCalled();
  });
});
