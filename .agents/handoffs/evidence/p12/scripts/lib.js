const { chromium } = require("playwright-core");
const BASE = process.env.BASE || "http://localhost:3413";
const iso = (d) => d.toISOString();
const now = new Date();
const day = (off, h = 9, m = 0) => {
  const d = new Date(now);
  d.setDate(d.getDate() + off);
  d.setHours(h, m, 0, 0);
  return d;
};
const unmatched = new Set();
let CUR_THEME = "light";

function seed(url, method) {
  const u = new URL(url, BASE);
  const p = u.pathname;
  if (method !== "GET") return { status: 200, body: { ok: true } };
  if (p === "/api/auth/session")
    return { body: { user: { id: "u1", name: "Maya Chen", email: "maya@needt.app", role: "user" }, expires: iso(day(30)) } };
  if (p === "/api/auth/csrf") return { body: { csrfToken: "x" } };
  if (p === "/api/auth/providers") return { body: { google: { id: "google", name: "Google", type: "oauth" }, "azure-ad": { id: "azure-ad", name: "Microsoft", type: "oauth" } } };
  if (p === "/api/auth/public-signup") return { body: { enabled: true } };
  if (p === "/api/tasks") {
    const t = (id, title, o = {}) => ({ id, title, status: "todo", priorityLevel: "MEDIUM", createdAt: iso(day(-3)), updatedAt: iso(day(-1)), estimatedMinutes: 30, ...o });
    return { body: [
      t("t1", "Review Q4 roadmap draft", { dueDate: iso(day(0, 17)), projectId: "p-ops", priorityLevel: "HIGH", scheduledStart: iso(day(0, 10)), scheduledEnd: iso(day(0, 10, 45)), isAutoScheduled: true, estimatedMinutes: 45 }),
      t("t2", "Reply to Dana about the offsite budget", { dueDate: iso(day(0, 12)), originKind: "mail", originId: "m1", priorityLevel: "URGENT" }),
      t("t3", "Book dentist", { dueDate: iso(day(2)), projectId: "p-home" }),
      t("t4", "Write launch announcement", { dueDate: iso(day(1)), projectId: "p-ops", scheduledStart: iso(day(1, 14)), scheduledEnd: iso(day(1, 15)), isAutoScheduled: true, parts: [{ id: "pt1", title: "Outline", done: true }, { id: "pt2", title: "Draft", done: false }] }),
      t("t5", "Pay invoice #4821", { status: "completed", dueDate: iso(day(-1)) }),
      t("t6", "Plan Lisbon trip", { projectId: "p-home", priorityLevel: "LOW" }),
      t("t7", "Prepare board slides", { dueDate: iso(day(4)), projectId: "p-ops", globalStage: "DOING" }),
      t("t8", "Old draft", { trashedAt: iso(day(-1)) }),
      ...Array.from({ length: 40 }, (_, i) => t("x" + i, "Follow up item " + (i + 1) + " with a longer title to wrap", { dueDate: iso(day(2 + (i % 20))), projectId: i % 2 ? "p-ops" : "p-home", priorityLevel: ["LOW", "MEDIUM", "HIGH"][i % 3] })),
    ] };
  }
  if (/^\/api\/tasks\/[^/]+$/.test(p)) return { body: { id: p.split("/").pop(), title: "Review Q4 roadmap draft", status: "todo", priorityLevel: "HIGH", dueDate: iso(day(0, 17)), estimatedMinutes: 45, projectId: "p-ops", description: "Check the milestones.", updatedAt: iso(day(-1)), createdAt: iso(day(-3)), parts: [], waits: [] } };
  if (p === "/api/projects") return { body: [
    { id: "p-ops", name: "Operations", color: "#5B8DEF", icon: "briefcase", position: 0, status: "active", description: "Launch + roadmap" },
    { id: "p-home", name: "Home", color: "#E5875B", icon: "home", position: 1, status: "active" },
  ] };
  if (/^\/api\/projects\/[^/]+$/.test(p)) return { body: { id: "p-ops", name: "Operations", color: "#5B8DEF", icon: "briefcase", status: "active", description: "Launch + roadmap" } };
  if (p === "/api/feeds") return { body: [{ id: "f1", name: "Needt", type: "LOCAL", color: "#5B8DEF" }, { id: "f2", name: "Work", type: "GOOGLE", color: "#E5875B" }] };
  if (p === "/api/events") {
    const e = (id, title, off, h, dur, feedId = "f1", o = {}) => ({ id, title, start: iso(day(off, h)), end: iso(day(off, h + dur)), feedId, allDay: false, ...o });
    const evs = [e("e1", "Standup", 0, 9, 0.5), e("e2", "Design review", 0, 14, 1, "f2", { externalEventId: "x" }), e("e3", "1:1 with Dana", 1, 11, 1), e("e4", "Offsite", 2, 0, 24, "f2", { allDay: true }), e("e5", "Focus block", 3, 9, 2)];
    for (let i = -10; i < 25; i += 3) evs.push(e("g" + i, "Sync " + i, i, 15, 1));
    return { body: evs };
  }
  if (p === "/api/pages") {
    const pg = (id, title, o = {}) => ({ id, title, icon: null, isFavorite: false, trashedAt: null, projectId: null, createdAt: iso(day(-20)), updatedAt: iso(day(-1)), ...o });
    return { body: { pages: [pg("pg1", "Q4 roadmap", { isFavorite: true, icon: "📍" }), pg("pg2", "Meeting notes", { projectId: "p-ops" }), pg("pg3", "Shared plan", { sharedWithMe: true, accessRole: "EDITOR" }), pg("pg4", "Old notes", { trashedAt: iso(day(-2)) }), pg("pg5", "Reading list", { coverUrl: null })] } };
  }
  if (/^\/api\/pages\/[^/]+$/.test(p)) return { body: { page: { id: p.split("/").pop(), title: "Q4 roadmap", icon: "📍", isFavorite: true, trashedAt: null, projectId: "p-ops", createdAt: iso(day(-20)), updatedAt: iso(day(-1)), accessRole: "OWNER" } } };
  if (/^\/api\/pages\/[^/]+\/(permissions|publication|assets)/.test(p)) return { body: { permissions: [], members: [], published: false, assets: [], enabled: false } };
  if (p === "/api/page-templates") return { body: { templates: [{ id: "tp1", name: "Weekly review", description: "Look back, plan ahead", updatedAt: iso(day(-4)) }, { id: "tp2", name: "Meeting notes", description: null, updatedAt: iso(day(-9)) }] } };
  if (p === "/api/habits") return { body: { habits: [
    { id: "h1", title: "Run", color: "#5B8DEF", icon: "run", at: "07:00", quota: 3, projectId: null, archivedAt: null },
    { id: "h2", title: "Read 20 pages", color: "#E5875B", icon: "book", at: null, quota: 7, projectId: null, archivedAt: null },
    { id: "h3", title: "Stretch", color: "#7DB98A", icon: "heart", at: "21:30", quota: 5, archivedAt: null },
  ] } };
  if (p === "/api/needt/today") return { body: { now: iso(now), habits: [{ id: "h1", done: [1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0] }, { id: "h2", done: [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1] }, { id: "h3", done: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0] }] } };
  if (p === "/api/needt/shell") return { body: {} };
  if (p === "/api/moodboards") return { body: { moodboards: [
    { id: "mb1", title: "Lisbon trip", createdAt: iso(day(-9)), updatedAt: iso(day(-2)), projectId: null, linkShare: false },
    { id: "mb2", title: "Brand refresh", createdAt: iso(day(-30)), updatedAt: iso(day(-5)), projectId: "p-ops", linkShare: true },
    { id: "mb3", title: "Kitchen", createdAt: iso(day(-60)), updatedAt: iso(day(-40)), projectId: "p-home" },
  ] } };
  if (/^\/api\/moodboards\/[^/]+$/.test(p)) return { body: { moodboard: { id: "mb1", title: "Lisbon trip", createdAt: iso(day(-9)), projectId: null, linkShare: false }, items: [] } };
  if (/^\/api\/moodboards\/[^/]+\/items/.test(p)) return { body: { items: [] } };
  if (p === "/api/mail/accounts") return { body: [{ id: "a1", provider: "GOOGLE", address: "maya@gmail.com", status: "ACTIVE", lastSyncAt: iso(day(0, 8)), _count: { messages: 4 } }] };
  if (p === "/api/mail/messages") {
    const m = (id, subject, fromName, off, isRead, o = {}) => ({ id, accountId: "a1", threadId: "th" + id, subject, fromName, fromAddress: fromName.toLowerCase().replace(/ /g, ".") + "@example.com", snippet: "Hi Maya, quick one about the plan for next week and what we need before Friday...", date: iso(day(off, 8, 30)), isRead, isArchived: false, trashedAt: null, needsReply: false, ...o });
    return { body: { messages: [m("m1", "Offsite budget", "Dana Kim", 0, false, { needsReply: true, suggestedTask: "Reply to Dana about the offsite budget" }), m("m2", "Invoice #4821", "Billing Team", -1, true, { attachments: [{ name: "invoice.pdf", size: 120000, type: "application/pdf" }] }), m("m3", "Weekly digest", "Needt", -2, true), m("m4", "Lunch Friday?", "Sam Ortiz", -3, false)], nextCursor: null } };
  }
  if (/^\/api\/mail\/messages\/[^/]+$/.test(p)) return { body: { id: p.split("/").pop(), accountId: "a1", threadId: "thm1", subject: "Offsite budget", fromName: "Dana Kim", fromAddress: "dana.kim@example.com", snippet: "Hi Maya", date: iso(day(0, 8, 30)), isRead: true, isArchived: false, trashedAt: null, needsReply: true, toAddresses: ["maya@gmail.com"], bodyHtml: "<p>Hi Maya,</p><p>Can you confirm the offsite budget before Friday? We need the final number for the venue.</p><p>Thanks,<br>Dana</p>" } };
  if (p === "/api/accounts") return { body: [{ id: "c1", provider: "GOOGLE", email: "maya@gmail.com", calendars: [{ id: "f2", name: "Work" }] }] };
  if (p === "/api/integrations/catalog") return { body: { catalog: [{ slug: "notion", name: "Notion", description: "Docs and wikis", category: "notes", native: false, configured: true }, { slug: "todoist", name: "Todoist", description: "Tasks", category: "tasks", native: false, configured: true }], connections: [{ id: "i1", provider: "composio", toolkit: "notion", status: "ACTIVE" }] } };
  if (p === "/api/user-settings") return { body: { theme: CUR_THEME, accent: "violet", timeZone: "UTC", workStart: "09:00", workEnd: "17:00", prefs: {} } };
  if (p === "/api/auto-schedule-settings") return { body: { workDays: [1, 2, 3, 4, 5], workHourStart: 9, workHourEnd: 17, bufferMinutes: 10, selectedCalendars: [] } };
  if (p === "/api/notification-settings") return { body: { emailEnabled: true } };
  if (p === "/api/billing") return { body: { plan: "FREE", status: "ACTIVE", isTrial: false, interval: null, trialEndsAt: null, lifetimeLeft: 120 } };
  if (p === "/api/daily-agenda") return { body: { items: [] } };
  if (p === "/api/notifications") return { body: { notifications: [], unread: 0 } };
  if (p === "/api/search") return { body: { results: [] } };
  if (p.startsWith("/api/workspaces")) return { body: [{ id: "w1", name: "Maya", role: "OWNER" }] };
  unmatched.add(method + " " + p);
  return { body: {} };
}

async function open({ theme = "light", width = 390, height = 844, dsf = 3, cpu = 1, reduced = false } = {}) {
  CUR_THEME = theme;
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dsf, isMobile: true, hasTouch: true, colorScheme: theme, reducedMotion: reduced ? "reduce" : "no-preference", serviceWorkers: "block" });
  await ctx.addInitScript((t) => {
    try { localStorage.setItem("needt3-ui", JSON.stringify({ state: { sidebarOpen: true, theme: t, accent: "violet" }, version: 1 })); } catch {}
  }, theme);
  await ctx.route((u) => new URL(u).pathname.startsWith("/api/"), async (route) => {
    const req = route.request();
    const r = seed(req.url(), req.method());
    await route.fulfill({ status: r.status || 200, contentType: "application/json", body: JSON.stringify(r.body) });
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });
  return { browser, ctx, page, cdp, errors };
}
module.exports = { open, BASE, unmatched };
