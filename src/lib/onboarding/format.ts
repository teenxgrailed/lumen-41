/** Small formatters the onboarding screens and the planner's own lines share. */

/** 9.5 -> "09:30" */
export const hhmm = (h: number): string => {
  const m = Math.round(h * 60);
  return (
    String(Math.floor(m / 60)).padStart(2, "0") +
    ":" +
    String(m % 60).padStart(2, "0")
  );
};

/** 90 -> "1 h 30", 45 -> "45 min" */
export const dur = (min: number): string =>
  min >= 60
    ? Math.floor(min / 60) + " h" + (min % 60 ? " " + (min % 60) : "")
    : min + " min";

/** 1.5 -> "1 h 30 min" */
export const durH = (h: number): string => {
  const m = Math.round(h * 60);
  return (
    (m >= 60 ? Math.floor(m / 60) + " h" : "") +
    (m % 60 ? (m >= 60 ? " " : "") + (m % 60) + " min" : "")
  );
};

export const partName = (p: "m" | "a" | "e" | ""): string =>
  p === "m" ? "morning" : p === "a" ? "afternoon" : p === "e" ? "evening" : "";
