/**
 * The owner's "New task" on the Agents screen: what the sheet collects, the
 * checks that mirror the hub's brief rules (so a bad brief is caught before
 * the request), and the body for `POST /api/agent-hub/items`, the same create
 * the MCP tool `needt_agent_task_create` runs. Pure functions, no React.
 */

/** The risks a brief can declare, as the hub names them. */
export const NEW_TASK_RISKS = [
  ["money", "Money"],
  ["send_message", "Sends a message"],
  ["publish", "Publishes"],
  ["delete", "Deletes"],
] as const;
export type NewTaskRisk = (typeof NEW_TASK_RISKS)[number][0];

/** The hub's own minimums (`assertBrief` in services/agent-hub/items). */
export const GOAL_MIN = 20;
export const CONTEXT_MIN = 40;

export interface NewTaskForm {
  title: string;
  goal: string;
  done: string;
  context: string;
  /** An agent id, or "any" for the first capable agent. */
  agent: string;
  /** Comma separated skill tags; needed only for "any". */
  skills: string;
  risks: NewTaskRisk[];
}

export const EMPTY_NEW_TASK: NewTaskForm = {
  title: "",
  goal: "",
  done: "",
  context: "",
  agent: "any",
  skills: "",
  risks: [],
};

/** Skill tags as the hub stores them: lowercase, trimmed, no empties, once each. */
export function parseSkills(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[,\n]/)) {
    const tag = raw.trim().toLowerCase();
    if (tag && tag.length <= 40 && !out.includes(tag)) out.push(tag);
  }
  return out.slice(0, 10);
}

/**
 * The owner rarely has more to say than the goal. The hub wants 40 characters
 * of context, so a blank field is filled with the goal and one honest line
 * saying where the brief came from.
 */
export function contextOf(form: NewTaskForm): string {
  const own = form.context.trim();
  if (own.length >= CONTEXT_MIN) return own;
  const base = own || form.goal.trim();
  return `${base}\n\nCreated by the owner from the Agents screen.`;
}

/** The first thing wrong with the brief, in the hub's words; null when it can go. */
export function newTaskProblem(form: NewTaskForm): string | null {
  if (!form.title.trim()) return "Add a short title.";
  if (form.goal.trim().length < GOAL_MIN)
    return `Describe the goal in at least ${GOAL_MIN} characters.`;
  if (!form.done.trim()) return "Say how the agent knows it is done.";
  if (form.agent === "any" && parseSkills(form.skills).length === 0)
    return "Pick an agent, or name a skill so only capable agents see it.";
  return null;
}

/** The request body for the owner create route. */
export function newTaskPayload(form: NewTaskForm) {
  const any = form.agent === "any";
  return {
    title: form.title.trim(),
    goal: form.goal.trim(),
    doneCriteria: form.done.trim(),
    context: contextOf(form),
    risks: [...new Set(form.risks)],
    assignee: form.agent,
    ...(any ? { requiredSkills: parseSkills(form.skills) } : {}),
  };
}

/**
 * What a risk is called on an Approve button. The hub's names are enums
 * (`send_message`); a button says what the owner is letting through, in one
 * short word. An unknown risk is cut at a word boundary so the button never
 * outgrows its row (PORT.md: a label that does not fit is shortened).
 */
const APPROVE_WORD: Record<string, string> = {
  money: "payment",
  send_message: "message",
  publish: "post",
  delete: "delete",
};
export const APPROVE_MAX = 12;

export function approveLabel(risk: string): string {
  const known = APPROVE_WORD[risk];
  if (known) return `Approve ${known}`;
  const text = risk.replace(/[_-]+/g, " ").trim();
  if (text.length <= APPROVE_MAX) return `Approve ${text}`;
  const cut = text.slice(0, APPROVE_MAX + 1);
  const space = cut.lastIndexOf(" ");
  const word = (
    space > 3 ? cut.slice(0, space) : cut.slice(0, APPROVE_MAX)
  ).trim();
  return `Approve ${word}…`;
}
