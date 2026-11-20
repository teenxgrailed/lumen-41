/**
 * A task's icon from its title, by keyword: a local map, no AI. Pure; the
 * screen turns the key into a glyph. Anything that matches nothing gets the
 * generic key. A keyword matches at the start of a word ("mail" does not
 * match "airmail", "run" does not match "prune").
 */
export type TaskIconKey =
  | "mail"
  | "call"
  | "meeting"
  | "write"
  | "code"
  | "design"
  | "shop"
  | "money"
  | "health"
  | "workout"
  | "clean"
  | "travel"
  | "read"
  | "study"
  | "cook"
  | "camera"
  | "music"
  | "plan"
  | "generic";

/** Order matters: the first rule that matches wins. */
const RULES: readonly (readonly [TaskIconKey, readonly string[]])[] = [
  ["meeting", ["meeting", "standup", "sync", "interview", "1:1", "встреч"]],
  ["call", ["call", "phone", "звон"]],
  ["mail", ["email", "e-mail", "mail", "inbox", "reply", "письм", "почт"]],
  [
    "money",
    [
      "pay",
      "invoice",
      "tax",
      "bill",
      "budget",
      "bank",
      "rent",
      "счет",
      "счёт",
      "налог",
    ],
  ],
  ["shop", ["buy", "order", "shop", "grocer", "ship", "купи", "заказ"]],
  [
    "workout",
    [
      "gym",
      "workout",
      "run",
      "yoga",
      "stretch",
      "swim",
      "trainin",
      "бег",
      "трен",
    ],
  ],
  [
    "health",
    ["doctor", "dentist", "pharmacy", "medic", "therap", "vet", "врач"],
  ],
  ["code", ["code", "bug", "deploy", "refactor", "commit", "merge", "api"]],
  [
    "design",
    ["design", "mockup", "logo", "figma", "sketch", "layout", "дизайн"],
  ],
  ["camera", ["photo", "shoot", "film", "reel", "фото", "съем", "съём"]],
  ["music", ["music", "beat", "guitar", "piano", "музык"]],
  [
    "write",
    [
      "write",
      "draft",
      "blog",
      "essay",
      "caption",
      "newsletter",
      "текст",
      "напис",
    ],
  ],
  [
    "study",
    ["study", "learn", "lesson", "course", "german", "homework", "учи", "урок"],
  ],
  ["read", ["read", "book", "article", "paper", "чита", "книг"]],
  ["cook", ["cook", "dinner", "lunch", "meal", "bake", "recipe", "готов"]],
  ["clean", ["clean", "laundry", "wash", "tidy", "vacuum", "убор", "стир"]],
  [
    "travel",
    ["flight", "trip", "hotel", "train", "visa", "pack", "travel", "поезд"],
  ],
  ["plan", ["plan", "review", "agenda", "roadmap", "schedule", "план"]],
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const PATTERNS = RULES.map(
  ([key, words]) =>
    [
      key,
      new RegExp(`(^|[^\\p{L}\\p{N}])(${words.map(escape).join("|")})`, "iu"),
    ] as const
);

export function taskIconKey(title: string): TaskIconKey {
  const t = ` ${title.trim()}`;
  for (const [key, re] of PATTERNS) if (re.test(t)) return key;
  return "generic";
}
