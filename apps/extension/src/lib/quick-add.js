// @ts-check
/**
 * Quick-add syntax, shared by the popup and the capture command:
 *   "write brief tomorrow 2h #work !high"
 * Dates: today/tomorrow, weekday names, "next week" (English and Russian).
 * Durations: 2h, 30m, 1.5h, 2ч, 30м, 1ч30м. Priority: !low !medium !high !urgent.
 * Project: #name (matched to a project by the caller). Pure: no chrome APIs.
 */

const WEEKDAYS = {
  sun: 0, sunday: 0, вс: 0, воскресенье: 0,
  mon: 1, monday: 1, пн: 1, понедельник: 1,
  tue: 2, tuesday: 2, вт: 2, вторник: 2,
  wed: 3, wednesday: 3, ср: 3, среда: 3, среду: 3,
  thu: 4, thursday: 4, чт: 4, четверг: 4,
  fri: 5, friday: 5, пт: 5, пятница: 5, пятницу: 5,
  sat: 6, saturday: 6, сб: 6, суббота: 6, субботу: 6,
};

const PRIORITIES = {
  low: "LOW", medium: "MEDIUM", med: "MEDIUM", high: "HIGH", urgent: "URGENT",
};

/** End of the given day, local time, as the task deadline. */
function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * @param {string} text
 * @param {Date} [now]
 * @returns {{ title: string, estimatedMinutes?: number, priorityLevel?: string,
 *   deadline?: string, project?: string, chips: { kind: string, label: string }[] }}
 */
export function parseQuickAdd(text, now = new Date()) {
  /** @type {{ kind: string, label: string }[]} */
  const chips = [];
  /** @type {ReturnType<typeof parseQuickAdd>} */
  const out = { title: "", chips };
  const words = [];
  const tokens = text.trim().split(/\s+/).filter(Boolean);

  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i];
    const word = raw.toLowerCase();
    const next = tokens[i + 1]?.toLowerCase();

    const duration = word.match(
      /^(\d+(?:[.,]\d+)?)(h|ч)(?:(\d+)(m|м))?$|^(\d+)(m|min|м|мин)$/
    );
    if (duration && out.estimatedMinutes === undefined) {
      const minutes = duration[1]
        ? Math.round(parseFloat(duration[1].replace(",", ".")) * 60) +
          (duration[3] ? parseInt(duration[3], 10) : 0)
        : parseInt(duration[5], 10);
      if (minutes > 0 && minutes <= 24 * 60) {
        out.estimatedMinutes = minutes;
        chips.push({ kind: "duration", label: `${minutes} min` });
        continue;
      }
    }

    if (word.startsWith("!") && PRIORITIES[word.slice(1)] && !out.priorityLevel) {
      out.priorityLevel = PRIORITIES[word.slice(1)];
      chips.push({ kind: "priority", label: out.priorityLevel.toLowerCase() });
      continue;
    }

    if (word.length > 1 && word.startsWith("#") && !out.project) {
      out.project = raw.slice(1);
      chips.push({ kind: "project", label: out.project });
      continue;
    }

    if (!out.deadline) {
      let day = null;
      let used = 1;
      if (word === "today" || word === "сегодня") day = now;
      else if (word === "tomorrow" || word === "завтра") day = addDays(now, 1);
      else if (
        (word === "next" && next === "week") ||
        (word === "через" && next === "неделю")
      ) {
        day = addDays(now, 7);
        used = 2;
      } else if (word in WEEKDAYS) {
        const ahead = (WEEKDAYS[word] - now.getDay() + 7) % 7 || 7;
        day = addDays(now, ahead);
      } else if ((word === "on" || word === "в" || word === "во") && next in WEEKDAYS) {
        continue;
      }
      if (day) {
        const deadline = endOfDay(day);
        out.deadline = deadline.toISOString();
        chips.push({
          kind: "date",
          label: deadline.toLocaleDateString(undefined, {
            weekday: "short",
            day: "numeric",
            month: "short",
          }),
        });
        i += used - 1;
        continue;
      }
    }
    words.push(raw);
  }
  out.title = words.join(" ");
  return out;
}
