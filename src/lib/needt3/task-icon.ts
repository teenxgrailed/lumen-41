/**
 * The icon a task gets from its title: a local keyword map, no AI and no
 * network. The first rule whose words appear in the title wins; a title that
 * matches nothing gets no icon (null), and the person can pick one by hand.
 * The pick is stored on the task (`Task.icon`, one emoji), so the API and every
 * other tool read the same icon.
 */

const RULES: readonly (readonly [RegExp, string])[] = [
  [/\b(call|phone|ring)\b/i, "📞"],
  [/\b(e-?mail|inbox|reply|newsletter)\b/i, "✉️"],
  [/\b(meeting|sync|standup|stand-up|1:1|interview)\b/i, "👥"],
  [/\b(buy|order|shop|shopping|groceries|grocery|pick up)\b/i, "🛒"],
  [/\b(pay|invoice|bill|rent|tax|taxes|budget|bank|refund)\b/i, "💳"],
  [/\b(gym|workout|run|running|train|training|yoga|stretch)\b/i, "🏃"],
  [/\b(doctor|dentist|clinic|pharmacy|medicine|appointment)\b/i, "🩺"],
  [/\b(cook|dinner|lunch|breakfast|meal|recipe)\b/i, "🍳"],
  [/\b(clean|laundry|wash|tidy|dishes|vacuum)\b/i, "🧺"],
  [/\b(fly|flight|trip|travel|hotel|train ticket|visa|passport)\b/i, "✈️"],
  [/\b(read|book|article|paper)\b/i, "📖"],
  [/\b(write|draft|post|blog|essay|caption|script)\b/i, "✍️"],
  [/\b(design|sketch|mockup|figma|logo|moodboard)\b/i, "🎨"],
  [/\b(photo|shoot|film|edit video|reel|camera)\b/i, "📷"],
  [/\b(code|bug|fix|deploy|release|commit|merge|pr)\b/i, "💻"],
  [/\b(study|learn|homework|exam|lesson|german|course|class)\b/i, "🎓"],
  [/\b(plan|roadmap|strategy|review|retro)\b/i, "🗺️"],
  [/\b(clothes|jacket|hoodie|sell|listing|ship|parcel|package)\b/i, "📦"],
  [/\b(birthday|gift|party)\b/i, "🎁"],
  [/\b(sleep|nap|rest)\b/i, "🌙"],
  [/\b(walk|hike|park)\b/i, "🚶"],
  [/\b(music|beat|record|song)\b/i, "🎧"],
  [/\b(clean up|organi[sz]e|sort|archive)\b/i, "🗂️"],
];

/** The icon the keyword map suggests for a title, or null when no word matches. */
export function taskIconFor(title: string): string | null {
  const text = title.trim();
  if (!text) return null;
  for (const [re, icon] of RULES) if (re.test(text)) return icon;
  return null;
}

/** What the icon picker offers, beyond what the keyword map would give. */
export const TASK_ICON_CHOICES: readonly string[] = [
  "📞",
  "✉️",
  "👥",
  "🛒",
  "💳",
  "🏃",
  "🩺",
  "🍳",
  "🧺",
  "✈️",
  "📖",
  "✍️",
  "🎨",
  "📷",
  "💻",
  "🎓",
  "🗺️",
  "📦",
  "🎁",
  "🌙",
  "🚶",
  "🎧",
  "🗂️",
  "⭐",
];
