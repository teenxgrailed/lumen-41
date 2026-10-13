import { access, readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";

import { checkAdminSettingsReachability } from "./ui-contracts/admin-settings-reachability.mjs";

const ROOT = process.cwd();
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const failures = [];

async function collect(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = join(path, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(target)));
    else if (SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(target);
  }
  return files;
}

async function source(path) {
  return readFile(join(ROOT, path), "utf8");
}

function requireText(path, text, contents) {
  if (!contents.includes(text)) {
    failures.push(`${path}: missing ${JSON.stringify(text)}`);
  }
}

function forbidText(path, text, contents) {
  if (contents.includes(text)) {
    failures.push(`${path}: contains retired ${JSON.stringify(text)}`);
  }
}

function forbidPattern(path, pattern, description, contents) {
  if (pattern.test(contents)) {
    failures.push(`${path}: contains retired ${description}`);
  }
}

const LEGACY_TOKEN_NAMES = [
  "app-bg",
  "raised",
  "raised-2",
  "active",
  "line",
  "line-strong",
  "text-hi",
  "text-lo",
  "accent",
  "accent-contrast",
  "accent-foreground",
  "bg-0",
  "bg-1",
  "bg-2",
  "acc-blue",
  "acc-violet",
  "acc-magenta",
  "acc-teal",
  "acc-gold",
];

for (const retired of [
  "src/components/ui/option-picker.tsx",
  "src/components/ui/combobox-picker.tsx",
]) {
  try {
    await access(join(ROOT, retired));
    failures.push(`${retired}: retired picker still exists`);
  } catch {
    // Expected: NeedtPicker is the only picker.
  }
}

const productSources = [
  ...(await collect(join(ROOT, "src/app"))),
  ...(await collect(join(ROOT, "src/components"))),
];
for (const file of productSources) {
  const contents = await readFile(file, "utf8");
  const name = relative(ROOT, file);
  for (const retired of [
    "@/components/ui/option-picker",
    "@/components/ui/combobox-picker",
    "MotionPicker",
    "OptionPicker",
  ]) {
    forbidText(name, retired, contents);
  }
  if (
    contents.includes('from "sonner"') &&
    name !== "src/components/ui/sonner.tsx"
  ) {
    failures.push(`${name}: product surface bypasses notification facade`);
  }

  for (const legacyToken of LEGACY_TOKEN_NAMES) {
    // `--accent` is a live token in both design systems (v2 `needt/`, v3
    // `needt3/`, each scoped); it is retired only in the pre-design UI.
    if (
      legacyToken === "accent" &&
      (name.startsWith("src/components/needt/") ||
        name.startsWith("src/components/needt3/"))
    ) {
      continue;
    }
    const escaped = legacyToken.replaceAll("-", "\\-");
    forbidPattern(
      name,
      new RegExp(`var\\(--${escaped}\\)`),
      `var(--${legacyToken})`,
      contents
    );
  }

  if (name !== "src/components/ui/design-system-lab.tsx") {
    forbidText(name, 'from "@/components/ui/select"', contents);
    forbidText(name, "<select", contents);
    forbidPattern(
      name,
      /(?:border|bg|text)-\[#(?:323234|262627|9aa0a6)\]|hover:bg-\[#2b2f31\]/i,
      "hard-coded legacy UI palette",
      contents
    );
  }
}

failures.push(...(await checkAdminSettingsReachability(ROOT)));

for (const integrationPath of ["src/app/globals.css", "tailwind.config.ts"]) {
  const contents = await source(integrationPath);
  for (const legacyToken of LEGACY_TOKEN_NAMES) {
    const escaped = legacyToken.replaceAll("-", "\\-");
    forbidPattern(
      integrationPath,
      new RegExp(`(?:var\\(--${escaped}\\)|--${escaped}\\s*:)`),
      `legacy token --${legacyToken}`,
      contents
    );
  }
}

const focusPath = "src/components/focus/FocusTimerPanel.tsx";
const focus = await source(focusPath);
requireText(focusPath, 'data-testid="focus-flat-canvas"', focus);
for (const retired of [
  "needt-panel-depth",
  "rounded-[22px]",
  "rounded-[18px]",
]) {
  forbidText(focusPath, retired, focus);
}

const todayPath = "src/components/needt/home/TodayRoute.tsx";
const today = await source(todayPath);
requireText(todayPath, 'className="needt-v2"', today);
requireText(todayPath, "data-theme={theme}", today);
requireText(todayPath, "sm:hidden", today);
requireText(todayPath, "sm:flex", today);

for (const retired of [
  "src/components/today/TodayView.tsx",
  "src/components/today/DayTimeline.tsx",
]) {
  try {
    await access(join(ROOT, retired));
    failures.push(`${retired}: retired Today surface still exists`);
  } catch {
    // Expected: the production route uses the ported Needt Home.
  }
}

const companionPath = "src/components/ai/AICompanion.tsx";
const companion = await source(companionPath);
for (const required of [
  "DRAG_THRESHOLD = 6",
  "setPointerCapture",
  "requestAnimationFrame",
  "toNormalized",
  "max-sm:h-14 max-sm:w-14",
  "h-11 w-11",
]) {
  requireText(companionPath, required, companion);
}

const globalsPath = "src/app/globals.css";
const globals = await source(globalsPath);
const companionStylesStart = globals.indexOf(".needt-ai-companion {");
const companionStylesEnd = globals.indexOf(
  "@keyframes liquid-shimmer",
  companionStylesStart
);
const companionStyles = globals.slice(companionStylesStart, companionStylesEnd);
if (companionStylesStart < 0 || companionStylesEnd < 0) {
  failures.push(`${globalsPath}: missing companion style boundary`);
} else {
  requireText(
    globalsPath,
    "background: var(--surface-raised)",
    companionStyles
  );
  for (const prohibited of [
    "radial-gradient",
    "blur(",
    "needt-companion-float",
    "needt-companion-color-breathe",
  ]) {
    forbidText(globalsPath, prohibited, companionStyles);
  }
}

const pageWorkspacePath = "src/components/pages/PageWorkspace.tsx";
const pageWorkspace = await source(pageWorkspacePath);
requireText(pageWorkspacePath, "data-assistant-avoid", pageWorkspace);
requireText(
  pageWorkspacePath,
  "h-12 items-center justify-around",
  pageWorkspace
);

const appNavPath = "src/components/navigation/AppNav.tsx";
const appNav = await source(appNavPath);
requireText(appNavPath, 'label: "Tasks"', appNav);
requireText(appNavPath, 'label: "Moodboards"', appNav);
requireText(appNavPath, "data-assistant-avoid", appNav);
forbidText(appNavPath, 'label: "Workspace"', appNav);
forbidText(appNavPath, 'label: "Boards"', appNav);

const stylePagePath = "src/app/style/page.tsx";
const stylePage = await source(stylePagePath);
requireText(stylePagePath, 'dynamic = "force-dynamic"', stylePage);
requireText(stylePagePath, 'process.env.NODE_ENV === "production"', stylePage);
requireText(stylePagePath, "await isAdmin()", stylePage);
requireText(stylePagePath, "notFound()", stylePage);

const rootLayoutPath = "src/app/layout.tsx";
const rootLayout = await source(rootLayoutPath);
requireText(
  rootLayoutPath,
  'process.env.NODE_ENV !== "production"',
  rootLayout
);
requireText(
  rootLayoutPath,
  'process.env.NEEDT_FIGMA_CAPTURE === "1"',
  rootLayout
);
requireText(rootLayoutPath, "figma-local-capture", rootLayout);

for (const aiUsagePath of [
  "src/components/ai/AIChatSurface.tsx",
  "src/components/settings/AIAssistantSettings.tsx",
  "src/components/settings/BillingSettings.tsx",
]) {
  const contents = await source(aiUsagePath);
  for (const retired of [
    "actions left",
    "Hosted AI actions this month",
    "AI agent and hosted AI actions",
  ]) {
    forbidText(aiUsagePath, retired, contents);
  }
  forbidPattern(
    aiUsagePath,
    /(?:settings\.usage\.(?:remaining|limit|used)|summary\.usage\.aiActions)/,
    "rendered hosted AI usage count",
    contents
  );
}

const billingSettingsPath = "src/components/settings/BillingSettings.tsx";
const billingSettings = await source(billingSettingsPath);
requireText(billingSettingsPath, "Yearly · 29% off", billingSettings);
requireText(billingSettingsPath, '"AI agent"', billingSettings);
forbidText(billingSettingsPath, "2 months free", billingSettings);

const packageJson = JSON.parse(await source("package.json"));
if (packageJson.name !== "needt") {
  failures.push(`package.json: expected name "needt", got ${packageJson.name}`);
}
requireText(
  "package.json",
  "ghcr.io/teenxgrails/needt:main",
  JSON.stringify(packageJson)
);
requireText(
  "docker-compose.yml",
  "ghcr.io/teenxgrails/needt:main",
  await source("docker-compose.yml")
);
requireText(
  "src/lib/theme-init.ts",
  'if (value === "gray" || value === "graphite") return "dim";',
  await source("src/lib/theme-init.ts")
);

if (failures.length) {
  console.error(`Needt UI contract check failed:\n${failures.join("\n")}`);
  process.exit(1);
}

console.log(
  `Needt UI contract check passed (${productSources.length} product files).`
);
