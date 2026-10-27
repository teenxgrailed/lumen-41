/**
 * The new Home pieces (additions/home/ha-home.jsx), one set for the phone and
 * the desktop: the density is the wrapper's class (`HaScope`), the markup is
 * the same. Every piece draws nothing when it has nothing to say.
 */
export { HaAllDone, type HaPull } from "./HaAllDone";
export { HaBrief } from "./HaBrief";
export { HaEndDay } from "./HaEndDay";
export { HaLeftList, type HaLeft, type HaTarget } from "./HaLeftList";
export { HaEndDaySheet, HaReviewSheet } from "./HaSheets";
export { HaHabits, type HaHabit } from "./HaHabits";
export { HaHighlight, type HaCard, type HaHighlightState } from "./HaHighlight";
export {
  HA_REVIEW_PICKS,
  HaReview,
  type HaFocusOption,
  type HaWin,
} from "./HaReview";
export { HaSchedule } from "./HaSchedule";
export { HaTimeLeft, type HaTime } from "./HaTimeLeft";
export {
  HaBand,
  HaTimeline,
  type HaBandData,
  type HaTimelineRow,
} from "./HaTimeline";
export { HaWeather, type HaWx, type HaWxDetail } from "./HaWeather";
export {
  HaStats,
  HaWeek,
  type HaKpi,
  type HaProject,
  type HaRange,
  type HaWeekData,
} from "./HaWeek";
export { HaScope } from "./ui";
export {
  briefLines,
  haAllDoneOf,
  haBandOf,
  haHabitsOf,
  haScheduleRows,
  haTaskCard,
  haTimeOf,
  haWeekOf,
  haWeatherOf,
  habitEmoji,
  weatherEmoji,
} from "./model";
