import { dayPlanToolHidden } from "../server";
import { MCP_TOOLS, isDayPlanTool, listMcpTools } from "../tools";

const mockState = { enabled: true };

jest.mock("@/lib/feature-flags", () => ({
  agentHubEnabled: async () => false,
  dayPlanEnabled: async () => mockState.enabled,
  isFeatureEnabled: async () => false,
}));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));

const DAY_PLAN_TOOLS = [
  "needt_day_plan",
  "needt_day_plan_edit",
  "needt_day_plan_draft",
  "needt_day_plan_close",
  "needt_day_plan_settings",
  "needt_someday",
  "needt_someday_restore",
  "needt_someday_cleanup",
];

describe("day plan kill switch in MCP", () => {
  it("covers exactly the eight day plan and Someday tools", () => {
    expect(MCP_TOOLS.filter(isDayPlanTool).map((t) => t.name)).toEqual(
      DAY_PLAN_TOOLS
    );
  });

  it("test_kill_switch_hides_day_plan_tools", async () => {
    const off = listMcpTools(["needt.read", "needt.write"], {
      dayPlan: false,
    }).map((tool) => tool.name);
    for (const name of DAY_PLAN_TOOLS) expect(off).not.toContain(name);
    // Everything else is still listed.
    expect(off).toContain("needt_search");

    const on = listMcpTools(["needt.read", "needt.write"], {
      dayPlan: true,
    }).map((tool) => tool.name);
    for (const name of DAY_PLAN_TOOLS) expect(on).toContain(name);

    mockState.enabled = false;
    expect(await dayPlanToolHidden({ name: "needt_day_plan_edit" }, "u")).toBe(
      true
    );
    expect(await dayPlanToolHidden({ name: "needt_search" }, "u")).toBe(false);
    mockState.enabled = true;
    expect(await dayPlanToolHidden({ name: "needt_day_plan_edit" }, "u")).toBe(
      false
    );
  });
});
