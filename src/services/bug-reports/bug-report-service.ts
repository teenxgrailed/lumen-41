import { BugReportSeverity } from "@prisma/client";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { enqueueBugReportSync } from "@/lib/queue/enqueue";

const LOG_SOURCE = "BugReportService";

interface BugAttachmentInput {
  fileName: string;
  mimeType: string;
  data: Uint8Array;
}

export interface BugReportInput {
  title: string;
  description: string;
  reproductionSteps?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  severity?: BugReportSeverity;
  route?: string;
  appVersion?: string;
  viewport?: string;
  theme?: string;
  browser?: string;
  attachment?: BugAttachmentInput;
}

function clean(value: string | undefined, limit: number) {
  return value?.trim().slice(0, limit) || undefined;
}

function githubConfig() {
  const token = process.env.GITHUB_BUG_REPORT_TOKEN?.trim();
  const repository = process.env.GITHUB_BUG_REPORT_REPO?.trim();
  // No default repository: a token without an explicit (private) repo must not
  // send reports to a public one.
  return token && repository ? { token, repository } : null;
}

function issueBody(report: {
  id: string;
  description: string;
  reproductionSteps: string | null;
  expectedBehavior: string | null;
  actualBehavior: string | null;
  severity: BugReportSeverity;
  route: string | null;
  appVersion: string | null;
  viewport: string | null;
  theme: string | null;
  browser: string | null;
}) {
  return [
    `Internal report ID: \`${report.id}\``,
    `Severity: **${report.severity.toLowerCase()}**`,
    "",
    "## Description",
    report.description,
    "",
    "## Steps to reproduce",
    report.reproductionSteps || "Not provided.",
    "",
    "## Expected",
    report.expectedBehavior || "Not provided.",
    "",
    "## Actual",
    report.actualBehavior || "Not provided.",
    "",
    "## Safe diagnostics",
    `- Route: ${report.route || "unknown"}`,
    `- Version: ${report.appVersion || "unknown"}`,
    `- Viewport: ${report.viewport || "unknown"}`,
    `- Theme: ${report.theme || "unknown"}`,
    `- Browser: ${report.browser || "unknown"}`,
    "",
    "Attachments stay in the private Needt admin report and are not uploaded to GitHub.",
  ].join("\n");
}

export async function syncBugReportToGithub(reportId?: string) {
  const config = githubConfig();
  if (!config) return;
  const reports = reportId
    ? [await prisma.bugReport.findUnique({ where: { id: reportId } })]
    : await prisma.bugReport.findMany({ where: { githubIssueUrl: null }, orderBy: { createdAt: "asc" }, take: 20 });
  for (const report of reports) {
    if (!report || report.githubIssueUrl) continue;

    try {
      const response = await fetch(`https://api.github.com/repos/${config.repository}/issues`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        title: `[User report] ${report.title}`,
        body: issueBody(report),
        labels: ["user-report"],
      }),
    });
      if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
      const issue = (await response.json()) as { html_url?: string };
      await prisma.bugReport.update({ where: { id: report.id }, data: { githubIssueUrl: issue.html_url ?? null, githubSyncError: null } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown GitHub error";
      await prisma.bugReport.update({ where: { id: report.id }, data: { githubSyncError: message.slice(0, 500) } });
      await logger.warn("Bug report saved but GitHub sync failed", { reportId: report.id, error: message }, LOG_SOURCE);
      throw error;
    }
  }
}

export async function createBugReport(userId: string, input: BugReportInput) {
  const report = await prisma.bugReport.create({
    data: {
      userId,
      title: input.title.trim().slice(0, 160),
      description: input.description.trim().slice(0, 10_000),
      reproductionSteps: clean(input.reproductionSteps, 10_000),
      expectedBehavior: clean(input.expectedBehavior, 5_000),
      actualBehavior: clean(input.actualBehavior, 5_000),
      severity: input.severity ?? BugReportSeverity.MEDIUM,
      route: clean(input.route, 500),
      appVersion: clean(input.appVersion, 120),
      viewport: clean(input.viewport, 120),
      theme: clean(input.theme, 64),
      browser: clean(input.browser, 500),
      ...(input.attachment
        ? {
            attachments: {
              create: {
                fileName: input.attachment.fileName.slice(0, 240),
                mimeType: input.attachment.mimeType.slice(0, 120),
                size: input.attachment.data.byteLength,
                data: Buffer.from(input.attachment.data),
              },
            },
          }
        : {}),
    },
    include: { attachments: { select: { id: true, fileName: true, mimeType: true, size: true } } },
  });
  await enqueueBugReportSync(report.id);
  return prisma.bugReport.findUnique({
    where: { id: report.id },
    include: { attachments: { select: { id: true, fileName: true, mimeType: true, size: true } } },
  });
}

export async function listBugReports() {
  return prisma.bugReport.findMany({
    include: {
      user: { select: { id: true, name: true, email: true } },
      attachments: { select: { id: true, fileName: true, mimeType: true, size: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}
