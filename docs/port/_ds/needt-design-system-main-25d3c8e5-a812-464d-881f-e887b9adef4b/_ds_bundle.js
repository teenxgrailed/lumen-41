/* @ds-bundle: {"format":4,"namespace":"NeedtDesignSystem_25d3c8","components":[{"name":"CalendarBlock","sourcePath":"components/calendar/CalendarBlock.jsx"},{"name":"CalendarDay","sourcePath":"components/calendar/CalendarDay.jsx"},{"name":"CalendarStrip","sourcePath":"components/calendar/CalendarStrip.jsx"},{"name":"FreeTime","sourcePath":"components/calendar/DayTimeline.jsx"},{"name":"DayTimeline","sourcePath":"components/calendar/DayTimeline.jsx"},{"name":"FreeSlot","sourcePath":"components/calendar/FreeSlot.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Chip","sourcePath":"components/core/Chip.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"SegmentedControl","sourcePath":"components/core/SegmentedControl.jsx"},{"name":"Spinner","sourcePath":"components/core/Spinner.jsx"},{"name":"StatusDot","sourcePath":"components/core/StatusDot.jsx"},{"name":"ToggleGroup","sourcePath":"components/core/ToggleGroup.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"DatePicker","sourcePath":"components/forms/DatePicker.jsx"},{"name":"FormRow","sourcePath":"components/forms/FormRow.jsx"},{"name":"FormGroup","sourcePath":"components/forms/FormRow.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Radio","sourcePath":"components/forms/Radio.jsx"},{"name":"RadioGroup","sourcePath":"components/forms/Radio.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Textarea","sourcePath":"components/forms/Textarea.jsx"},{"name":"CommandBar","sourcePath":"components/navigation/CommandBar.jsx"},{"name":"NavRow","sourcePath":"components/navigation/NavRow.jsx"},{"name":"NavSection","sourcePath":"components/navigation/NavRow.jsx"},{"name":"ContextMenu","sourcePath":"components/overlays/ContextMenu.jsx"},{"name":"Dialog","sourcePath":"components/overlays/Dialog.jsx"},{"name":"Menu","sourcePath":"components/overlays/Menu.jsx"},{"name":"MenuItem","sourcePath":"components/overlays/Menu.jsx"},{"name":"MenuLabel","sourcePath":"components/overlays/Menu.jsx"},{"name":"MenuSeparator","sourcePath":"components/overlays/Menu.jsx"},{"name":"DropdownMenu","sourcePath":"components/overlays/Menu.jsx"},{"name":"Popover","sourcePath":"components/overlays/Popover.jsx"},{"name":"Tooltip","sourcePath":"components/overlays/Tooltip.jsx"},{"name":"Avatar","sourcePath":"components/surfaces/Avatar.jsx"},{"name":"Card","sourcePath":"components/surfaces/Card.jsx"},{"name":"DocumentSheet","sourcePath":"components/surfaces/DocumentSheet.jsx"},{"name":"EmptyState","sourcePath":"components/surfaces/EmptyState.jsx"},{"name":"SidebarHint","sourcePath":"components/surfaces/EmptyState.jsx"},{"name":"FloatingAction","sourcePath":"components/surfaces/FloatingAction.jsx"},{"name":"Skeleton","sourcePath":"components/surfaces/Skeleton.jsx"},{"name":"SkeletonRows","sourcePath":"components/surfaces/Skeleton.jsx"}],"sourceHashes":{"assets/icons/needt-icons.js":"e25e7aeda6da","components/calendar/CalendarBlock.jsx":"a7b876994380","components/calendar/CalendarDay.jsx":"c6861f8a4741","components/calendar/CalendarStrip.jsx":"3aa8e7d72197","components/calendar/DayTimeline.jsx":"c499604b93d2","components/calendar/FreeSlot.jsx":"78d86ce69631","components/core/Button.jsx":"14ec4cf29356","components/core/Chip.jsx":"2f7e3fe7045e","components/core/Icon.jsx":"c7af51f91bf3","components/core/IconButton.jsx":"625cdba3a1cc","components/core/SegmentedControl.jsx":"8a8b87c3b70c","components/core/Spinner.jsx":"43ea12e18f31","components/core/StatusDot.jsx":"d5ccf2166e67","components/core/ToggleGroup.jsx":"b7628c1c6de5","components/forms/Checkbox.jsx":"4414f6d89bbc","components/forms/DatePicker.jsx":"cf80437cf245","components/forms/FormRow.jsx":"390a0dc5c258","components/forms/Input.jsx":"8614b1bf6b0e","components/forms/Radio.jsx":"37b1ed8e5292","components/forms/Select.jsx":"e7878809c856","components/forms/Switch.jsx":"ebc188c8b499","components/forms/Textarea.jsx":"89cd12c41e2a","components/navigation/CommandBar.jsx":"2ca76183f61e","components/navigation/NavRow.jsx":"55fca57aacb8","components/overlays/ContextMenu.jsx":"8c8971d40e29","components/overlays/Dialog.jsx":"15f441395aa4","components/overlays/Menu.jsx":"06e865b4af56","components/overlays/Popover.jsx":"3734d870ac2c","components/overlays/Tooltip.jsx":"cf6905dc0925","components/surfaces/Avatar.jsx":"8e28e3bdffe4","components/surfaces/Card.jsx":"6d2ff086b870","components/surfaces/DocumentSheet.jsx":"609b1256e222","components/surfaces/EmptyState.jsx":"cf5c9d166768","components/surfaces/FloatingAction.jsx":"580d99230b23","components/surfaces/Skeleton.jsx":"5fc29da84adb","ui_kits/needt-app/App.jsx":"23617d49a8b2","ui_kits/needt-app/CalendarScreen.jsx":"1bff28e44cfd","ui_kits/needt-app/Dialogs.jsx":"02fbeb8102c3","ui_kits/needt-app/DocsScreen.jsx":"acb9054007a6","ui_kits/needt-app/Sidebar.jsx":"8217bfd1ca9d","ui_kits/needt-app/TaskRow.jsx":"6416de983d70","ui_kits/needt-app/TasksScreen.jsx":"7714b5e10309","ui_kits/needt-app/TodayScreen.jsx":"31e6b042a299"},"inlinedExternals":[],"unexposedExports":[{"name":"formatSpan","sourcePath":"components/calendar/FreeSlot.jsx"}]} */

(() => {

const __ds_ns = (window.NeedtDesignSystem_25d3c8 = window.NeedtDesignSystem_25d3c8 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// assets/icons/needt-icons.js
try { (() => {
/* Needt icon registry — react-icons, the library the product already depends on.
 *
 * This file is HOST code, not system code: it satisfies the contract that
 * components/core/Icon.jsx declares. Load it as a module in any static page
 * that renders Needt components:
 *
 *   <script type="module" src="assets/icons/needt-icons.js"></script>
 *
 * In the application, do not load this file — import the icons from
 * `react-icons` directly and either register them the same way at boot or pass
 * them to <Icon glyph={...} />.
 *
 * Collection: react-icons/lu. Swapping to another react-icons collection is a
 * one-line change to the import below plus the name prefixes; every name used
 * across this design system is resolved here, with fallbacks, so a renamed
 * upstream glyph degrades to an empty box instead of a crash.
 */
/* Resolved at runtime, not statically imported: this file is host code for
   static pages, and must stay invisible to any bundler that scans the design
   system's sources. In the application, import from "react-icons/lu" normally. */
const REACT_ICONS = "react-icons@5.5.0";
const COLLECTION = "lu";

/* Wrapped in an async IIFE rather than using top-level await: this file gets
   scanned alongside the system's sources, and a top-level await is a syntax
   error outside a module context. */
(async function () {
  const Lu = await import("https://esm.sh/" + REACT_ICONS + "/" + COLLECTION + "?deps=react@18.3.1");
  const pick = (...names) => names.map(n => Lu[n]).find(Boolean) || null;
  window.NeedtIcons = {
    "plus": pick("LuPlus"),
    "minus": pick("LuMinus"),
    "check": pick("LuCheck"),
    "x": pick("LuX"),
    "search": pick("LuSearch"),
    "ellipsis": pick("LuEllipsis", "LuMoreHorizontal"),
    "chevron-down": pick("LuChevronDown"),
    "chevron-left": pick("LuChevronLeft"),
    "chevron-right": pick("LuChevronRight"),
    "arrow-right": pick("LuArrowRight"),
    "arrow-left": pick("LuArrowLeft"),
    "arrow-up-down": pick("LuArrowUpDown", "LuArrowDownUp"),
    "calendar": pick("LuCalendar"),
    "calendar-days": pick("LuCalendarDays"),
    "calendar-off": pick("LuCalendarOff", "LuCalendarX"),
    "clock": pick("LuClock", "LuClock3"),
    "inbox": pick("LuInbox"),
    "file-text": pick("LuFileText"),
    "folder": pick("LuFolder"),
    "archive": pick("LuArchive"),
    "star": pick("LuStar"),
    "settings": pick("LuSettings"),
    "circle": pick("LuCircle"),
    "target": pick("LuTarget"),
    "trash-2": pick("LuTrash2", "LuTrash"),
    "copy": pick("LuCopy"),
    "pencil": pick("LuPencil", "LuPen"),
    "external-link": pick("LuExternalLink", "LuSquareArrowOutUpRight"),
    "upload": pick("LuUpload"),
    "eye": pick("LuEye"),
    "unlock": pick("LuLockOpen", "LuUnlock"),
    "sliders-horizontal": pick("LuSlidersHorizontal", "LuSliders"),
    "sparkles": pick("LuSparkles"),
    "wand-sparkles": pick("LuWandSparkles", "LuWand2", "LuWand"),
    "bold": pick("LuBold"),
    "italic": pick("LuItalic"),
    "link": pick("LuLink"),
    "list": pick("LuList"),
    "code": pick("LuCode"),
    "highlighter": pick("LuHighlighter")
  };
  window.dispatchEvent(new Event("needt-icons"));
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "assets/icons/needt-icons.js", error: String((e && e.message) || e) }); }

// components/calendar/CalendarBlock.jsx
try { (() => {
/* A task or event placed on the grid.
   The rail means MOVABILITY, not source: grey rail = fixed, project-colour
   rail = the scheduler placed it and can move it again. Priority is rail
   thickness (6px high, 4px normal). Overdue overrides in red. Nothing else
   rides the rail — the legend line under the canvas explains it once. */
function CalendarBlock(props) {
  return /*#__PURE__*/React.createElement("div", {
    className: "nt-block",
    "data-movable": props.movable ? "true" : undefined,
    "data-priority": props.priority,
    "data-overdue": props.overdue ? "true" : undefined,
    "data-done": props.done ? "true" : undefined,
    "data-selected": props.selected ? "true" : undefined,
    "data-compact": props.compact ? "true" : undefined,
    onClick: props.onClick,
    style: Object.assign({
      "--block-color": props.color || "var(--accent)"
    }, props.style)
  }, /*#__PURE__*/React.createElement("span", {
    className: "nt-block-title"
  }, props.title), props.time ? /*#__PURE__*/React.createElement("span", {
    className: "nt-block-time"
  }, props.time) : null, props.children);
}
Object.assign(__ds_scope, { CalendarBlock });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/calendar/CalendarBlock.jsx", error: String((e && e.message) || e) }); }

// components/calendar/CalendarDay.jsx
try { (() => {
/* Radius 16, padding 16, fill --fill-5. Today, and only today, takes
   --fill-accent-strong. */
function CalendarDay(props) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "cal-day" + (props.today ? " is-today" : ""),
    onClick: props.onClick,
    style: Object.assign({
      border: 0,
      textAlign: "left",
      display: "flex",
      flexDirection: "column",
      gap: 8,
      minWidth: 120,
      cursor: "default",
      boxShadow: props.selected ? "var(--shadow-focus)" : undefined,
      transition: "background-color var(--transition-hover)"
    }, props.style)
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-meta-medium)",
      color: props.today ? "var(--accent)" : "var(--text-muted)"
    }
  }, props.weekday), /*#__PURE__*/React.createElement("span", {
    style: {
      font: props.today ? "var(--weight-semibold) 22px / 1 var(--font-sans)" : "var(--weight-medium) 22px / 1 var(--font-sans)",
      color: props.today ? "var(--accent)" : "var(--text-secondary)",
      fontVariantNumeric: "tabular-nums"
    }
  }, props.date)), props.children);
}
Object.assign(__ds_scope, { CalendarDay });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/calendar/CalendarDay.jsx", error: String((e && e.message) || e) }); }

// components/calendar/CalendarStrip.jsx
try { (() => {
/* The week strip container: radius 20, canvas fill, inset ring at 4% plus a
   six-layer soft shadow. It sits on the canvas, so it is a container, not a
   card — do not give it the white surface. */
function CalendarStrip(props) {
  return /*#__PURE__*/React.createElement("div", {
    className: "cal-strip",
    style: Object.assign({
      display: "flex",
      gap: 8,
      overflowX: "auto"
    }, props.style)
  }, props.children);
}
Object.assign(__ds_scope, { CalendarStrip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/calendar/CalendarStrip.jsx", error: String((e && e.message) || e) }); }

// components/calendar/FreeSlot.jsx
try { (() => {
/* Free time, drawn as space rather than as an object.
 *
 * The point of the timeline is that a gap's HEIGHT is its quantity — a
 * quarter-hour is 11px and an hour and a half is 69px, so the answer to "how
 * much is left" arrives before any label is read. The slot therefore carries no
 * fill and no ring at rest: occupied blocks are raised surfaces, free time is
 * the canvas showing through. The duration is written in it only when the gap
 * is tall enough to hold the text (30 min and up), and the place-a-task
 * affordance appears on hover, never at rest.
 *
 * `past` marks a gap that has already elapsed: it is still drawn as space, but
 * carries no label and cannot take work — free time behind you is not free.
 * The timeline splits a gap at the now-line so the line always falls on a
 * boundary between two slots rather than through a label.
 */
function FreeSlot(props) {
  const minutes = props.minutes || 0;
  const label = props.label || formatSpan(minutes);
  const roomForLabel = minutes >= 30 && !props.past;
  return /*#__PURE__*/React.createElement("div", {
    className: "nt-free group" + (props.className ? " " + props.className : ""),
    "data-actionable": props.onPlace ? "true" : undefined,
    "data-past": props.past ? "true" : undefined,
    onClick: props.onPlace,
    title: props.past ? label + " gone" : props.onPlace ? label + " free — place a task here" : label + " free",
    style: props.style
  }, roomForLabel ? /*#__PURE__*/React.createElement("span", {
    className: "nt-free-label"
  }, /*#__PURE__*/React.createElement("span", {
    className: "nt-free-quantity"
  }, label), /*#__PURE__*/React.createElement("span", {
    className: "nt-free-word"
  }, " free"), props.onPlace ? /*#__PURE__*/React.createElement("span", {
    className: "nt-free-action reveal-on-hover"
  }, "Place task") : null) : null);
}

/* 90 → "1 h 30 min". Kept here so the timeline, the slot and the summary all
   phrase a duration identically. */
function formatSpan(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h && m) return h + " h " + m + " min";
  if (h) return h + " h";
  return m + " min";
}
Object.assign(__ds_scope, { FreeSlot, formatSpan });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/calendar/FreeSlot.jsx", error: String((e && e.message) || e) }); }

// components/calendar/DayTimeline.jsx
try { (() => {
/* The day, at scale. Hours down the left, placed work in its real position,
 * free time visible as the space between — the screen the list view was
 * standing in for.
 *
 * Geometry: one hour is --hour-h (46px) and every position is derived from it,
 * so a block's height IS its duration. Nothing is rounded to a row.
 *
 * The rail on a block carries MOVABILITY and nothing else: grey means fixed,
 * project colour means the scheduler placed it and can move it again, red
 * overrides for overdue. That is CalendarBlock's contract and the timeline does
 * not add a second meaning on top of it.
 */
const HOUR_H = 46;
function gapsBetween(items, dayStart, dayEnd) {
  const sorted = items.slice().sort(function (a, b) {
    return a.start - b.start;
  });
  const out = [];
  let cursor = dayStart;
  sorted.forEach(function (it) {
    if (it.start > cursor) out.push({
      start: cursor,
      end: it.start
    });
    cursor = Math.max(cursor, it.end);
  });
  if (cursor < dayEnd) out.push({
    start: cursor,
    end: dayEnd
  });
  return out.map(function (g) {
    return Object.assign({}, g, {
      minutes: Math.round((g.end - g.start) * 60)
    });
  });
}

/* Total free time in the day, and the part of it still ahead of `now`. */
function FreeTime(items, dayStart, dayEnd, now) {
  const gaps = gapsBetween(items || [], dayStart, dayEnd);
  let total = 0;
  let left = 0;
  gaps.forEach(function (g) {
    total += g.minutes;
    if (now == null) return;
    const from = Math.max(g.start, now);
    if (g.end > from) left += Math.round((g.end - from) * 60);
  });
  return {
    gaps: gaps,
    totalMinutes: total,
    leftMinutes: now == null ? total : left,
    total: __ds_scope.formatSpan(total),
    left: __ds_scope.formatSpan(now == null ? total : left)
  };
}
function DayTimeline(props) {
  const dayStart = props.dayStart != null ? props.dayStart : 8;
  const dayEnd = props.dayEnd != null ? props.dayEnd : 19;
  const items = props.items || [];
  const hourH = props.hourHeight || HOUR_H;
  const now = props.now;
  const hours = [];
  for (let h = dayStart; h <= dayEnd; h++) hours.push(h);
  const gaps = gapsBetween(items, dayStart, dayEnd);
  const top = function (t) {
    return (t - dayStart) * hourH;
  };

  /* A gap the now-line runs through is split at the line rather than drawn
     under it. Two reasons, and the second is the real one: a 30-minute gap is
     23px tall, so no amount of nudging keeps a 14px label clear of a line
     inside it — and the elapsed half is not free time any more. Only the
     remaining half is labelled and can accept work, which is also what
     FreeTime() counts. */
  const nowInsideItem = now != null && items.some(function (b) {
    return now > b.start && now < b.end;
  });
  const drawnGaps = [];
  gaps.forEach(function (g) {
    if (now != null && now > g.start && now < g.end) {
      drawnGaps.push({
        start: g.start,
        end: now,
        minutes: Math.round((now - g.start) * 60),
        past: true
      });
      drawnGaps.push({
        start: now,
        end: g.end,
        minutes: Math.round((g.end - now) * 60)
      });
    } else {
      drawnGaps.push(Object.assign({}, g, {
        past: now != null && g.end <= now
      }));
    }
  });
  return /*#__PURE__*/React.createElement("div", {
    className: "nt-timeline",
    style: Object.assign({
      "--hour-h": hourH + "px"
    }, props.style)
  }, /*#__PURE__*/React.createElement("div", {
    className: "nt-timeline-gutter"
  }, hours.map(function (h) {
    if (now != null && props.nowLabel && Math.abs(h - now) < 0.34) return null;
    return /*#__PURE__*/React.createElement("span", {
      key: h,
      className: "nt-timeline-hour",
      style: {
        top: top(h)
      }
    }, String(h).padStart(2, "0") + ":00");
  })), /*#__PURE__*/React.createElement("div", {
    className: "nt-timeline-track",
    style: {
      height: (dayEnd - dayStart) * hourH
    }
  }, hours.map(function (h) {
    return /*#__PURE__*/React.createElement("div", {
      key: h,
      className: "nt-timeline-rule",
      style: {
        top: top(h)
      }
    });
  }), drawnGaps.map(function (g) {
    return /*#__PURE__*/React.createElement(__ds_scope.FreeSlot, {
      key: "gap-" + g.start,
      minutes: g.minutes,
      past: g.past,
      onPlace: !g.past && props.onPlace ? function () {
        props.onPlace(g);
      } : undefined,
      style: {
        position: "absolute",
        left: 0,
        right: 0,
        top: top(g.start),
        height: (g.end - g.start) * hourH
      }
    });
  }), items.map(function (b) {
    const h = Math.max((b.end - b.start) * hourH - 4, 26);
    return /*#__PURE__*/React.createElement("div", {
      key: b.title + b.start,
      className: "nt-timeline-slot",
      style: {
        top: top(b.start) + 2,
        height: h
      }
    }, /*#__PURE__*/React.createElement(__ds_scope.CalendarBlock, {
      title: b.title,
      time: b.time,
      compact: h < 44,
      movable: b.movable,
      color: b.color,
      priority: b.priority,
      overdue: b.overdue,
      done: b.done,
      selected: b.selected,
      onClick: props.onSelect ? function () {
        props.onSelect(b);
      } : undefined,
      style: {
        height: "100%",
        background: "var(--surface-raised)",
        boxShadow: "var(--shadow-ring)"
      }
    }));
  }), now != null && now >= dayStart && now <= dayEnd ?
  /*#__PURE__*/
  /* When the moment falls inside a placed block the rule is not drawn
     across it — a horizontal line through a title is how this system
     marks a task done, and paint order alone still leaves the two
     overlapping. The gutter label and a short tick carry it instead. */
  React.createElement("div", {
    className: "nt-timeline-now",
    "data-clipped": nowInsideItem ? "true" : undefined,
    style: {
      top: top(now)
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "nt-timeline-now-label"
  }, props.nowLabel || "")) : null));
}
Object.assign(__ds_scope, { FreeTime, DayTimeline });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/calendar/DayTimeline.jsx", error: String((e && e.message) || e) }); }

// components/core/Chip.jsx
try { (() => {
/* 28px, radius 8, padding 3px 8px 3px 5px. Neutral at rest; the accent and
   state variants are translucent fills with the colour used as the text. */
const TONES = {
  neutral: {},
  accent: {
    background: "var(--fill-accent)",
    color: "var(--accent)"
  },
  success: {
    background: "var(--fill-success)",
    color: "var(--success)"
  },
  info: {
    background: "var(--fill-info)",
    color: "var(--info)"
  },
  destructive: {
    background: "var(--fill-destructive)",
    color: "var(--destructive)"
  }
};
function Chip(props) {
  const tone = props.tone || "neutral";
  const El = props.onClick ? "button" : "span";
  return /*#__PURE__*/React.createElement(El, {
    type: props.onClick ? "button" : undefined,
    className: "chip" + (props.className ? " " + props.className : ""),
    style: Object.assign({}, TONES[tone], props.disabled ? {
      color: "var(--text-disabled)",
      background: "var(--fill-2)"
    } : {}, props.style),
    disabled: props.onClick ? props.disabled : undefined,
    onClick: props.onClick
  }, props.iconLeft, props.children, props.onRemove ? /*#__PURE__*/React.createElement("span", {
    role: "button",
    "aria-label": "Remove",
    onClick: props.onRemove,
    style: {
      display: "inline-flex",
      marginLeft: 2,
      color: "var(--text-muted)"
    }
  }, "\xD7") : null);
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Chip.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
/* Icon is a CONTRACT, not a dependency.
 *
 * The design system ships no icon artwork — the source material contained none
 * — and it does not load an icon library of its own. The product uses
 * `react-icons`; this component renders whatever component the HOST registers,
 * so the system never pins a second icon dependency against the app's.
 *
 * The host satisfies the contract in one of two ways:
 *
 *   1. Registry (static HTML, prototypes):
 *        window.NeedtIcons = { "calendar-days": LuCalendarDays, ... };
 *        window.dispatchEvent(new Event("needt-icons"));
 *      assets/icons/needt-icons.js does exactly this from react-icons.
 *
 *   2. Direct (application code):
 *        <Icon glyph={LuCalendarDays} size={20} />
 *      or skip Icon entirely and render the react-icons component inline.
 *
 * Rules that hold either way: colour is always currentColor, stroke 1.75,
 * 13 in a chip / 16 in a control / 20 in a nav row / 24 in an empty state.
 * The glyph is wrapped in a span carrying data-needt-icon, and the fill is set
 * from that wrapper in CSS (tokens/base.css). It cannot be set on the svg:
 * icon libraries build the element from their own attribute set and drop
 * arbitrary props, so neither fill="none" nor a data-* attribute survives —
 * every outline glyph would inherit fill="currentColor" and render as a solid
 * blob. The wrapper is ours, so the rule holds whatever the library does.
 * With no glyph registered the component renders a reserved empty box of the
 * right size — layout never shifts, and a missing icon is visibly missing.
 */
function Icon(props) {
  const [, bump] = React.useState(0);
  /* Did the FIRST render see a registry? If not, this component rendered its
     placeholder and needs a re-render once one exists. */
  const registryAtFirstRender = typeof window !== "undefined" ? window.NeedtIcons : null;
  const sawRegistry = React.useRef(!!registryAtFirstRender);
  React.useEffect(function () {
    if (typeof window === "undefined") return undefined;
    /* The registry may land between the first render and this effect — a
       dynamic import resolving one tick early. Returning early here without a
       re-render is what leaves every glyph blank for the life of the page. */
    if (window.NeedtIcons) {
      if (!sawRegistry.current) {
        sawRegistry.current = true;
        bump(function (n) {
          return n + 1;
        });
      }
      return undefined;
    }
    function ready() {
      sawRegistry.current = true;
      bump(function (n) {
        return n + 1;
      });
    }
    window.addEventListener("needt-icons", ready);
    /* Poll as a backstop: the event may also have fired before we subscribed. */
    var tries = 0;
    var timer = window.setInterval(function () {
      if (window.NeedtIcons) {
        window.clearInterval(timer);
        ready();
      } else if (++tries > 60) window.clearInterval(timer);
    }, 100);
    return function () {
      window.clearInterval(timer);
      window.removeEventListener("needt-icons", ready);
    };
  }, []);
  const size = props.size || 16;
  const registry = typeof window !== "undefined" ? window.NeedtIcons : null;
  const Glyph = props.glyph || (registry ? registry[props.name] : null);
  const wrap = Object.assign({
    display: "block",
    flex: "none",
    width: size,
    height: size,
    lineHeight: 0
  }, props.style);
  if (!Glyph) {
    if (registry && props.name && typeof console !== "undefined") {
      console.warn('Icon: "' + props.name + '" is not in the registry. Add it to assets/icons/needt-icons.js or pass glyph={…}.');
    }
    return React.createElement("span", {
      style: wrap,
      "aria-hidden": "true"
    });
  }
  return React.createElement("span", {
    "data-needt-icon": props.filled ? "filled" : "outline",
    className: props.className,
    style: wrap,
    "aria-hidden": "true"
  }, React.createElement(Glyph, {
    size: size,
    strokeWidth: props.strokeWidth || 1.75,
    /* Belt and braces: some builds of the library DO forward these, in which
       case the glyph is already correct before CSS applies; some drop them,
       and then the wrapper rule in tokens/base.css carries it. */
    fill: props.filled ? "currentColor" : "none",
    stroke: "currentColor",
    focusable: "false"
  }));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
/* 34×28, radius 8, fill-3. Not square — the measured control is wider than
   it is tall. Always give it a label; icon-only controls need a tooltip.
   Variants are CLASSES, not inline styles: an inline background outranks every
   :hover / :active / :disabled rule, which silently costs the control its
   states. */
function IconButton(props) {
  const variant = props.variant || "neutral";
  const cls = "btn-icon" + (variant === "ghost" ? " btn-ghost" : "") + (variant === "flat" ? " btn-flat" : "") + (variant === "accent" ? " btn-accent" : "") + (props.className ? " " + props.className : "");
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: cls,
    style: props.style,
    disabled: props.disabled,
    "aria-label": props.label,
    "aria-pressed": props.pressed,
    onClick: props.onClick
  }, props.children);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/SegmentedControl.jsx
try { (() => {
/* Selected segment takes --fill-accent with the solid accent as its text;
   unselected sits on --fill-3 with muted text. 32px, radius 10. */
function SegmentedControl(props) {
  const items = props.items || [];
  return /*#__PURE__*/React.createElement("div", {
    role: "tablist",
    "aria-label": props.label,
    style: Object.assign({
      display: "inline-flex",
      gap: "var(--space-2)"
    }, props.style)
  }, items.map(function (it) {
    const selected = it.value === props.value;
    return /*#__PURE__*/React.createElement("button", {
      key: it.value,
      role: "tab",
      type: "button",
      className: "segment",
      "aria-selected": selected ? "true" : "false",
      disabled: it.disabled,
      style: it.disabled ? {
        color: "var(--text-disabled)",
        background: "var(--fill-2)"
      } : undefined,
      onClick: function () {
        if (props.onChange) props.onChange(it.value);
      }
    }, it.icon, it.label, it.count != null ? /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 5,
        font: "var(--type-meta)",
        opacity: 0.7,
        fontVariantNumeric: "tabular-nums"
      }
    }, it.count) : null);
  }));
}
Object.assign(__ds_scope, { SegmentedControl });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/SegmentedControl.jsx", error: String((e && e.message) || e) }); }

// components/core/Spinner.jsx
try { (() => {
/* The only rotating thing in the product. 12px inside a control, 16px alone. */
function Spinner(props) {
  const size = props.size || 12;
  return /*#__PURE__*/React.createElement("span", {
    className: "nt-spinner",
    role: "status",
    "aria-label": props.label || "Loading",
    style: {
      width: size,
      height: size,
      borderWidth: size >= 16 ? 2 : 1.5
    }
  });
}
Object.assign(__ds_scope, { Spinner });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Spinner.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
/* 32px, radius 10, fill-3, text at 85%, 13/500. Hover fill-4, active fill-5.
   There is no solid-accent button in this system: the accent variant is a
   translucent fill with the accent as the text colour. */
const VARIANTS = {
  neutral: "",
  raised: "",
  flat: " btn-flat",
  outline: " btn-outline",
  ghost: " btn-ghost",
  accent: " btn-accent",
  destructive: " btn-destructive"
};
function Button(props) {
  const variant = props.variant || "neutral";
  const size = props.size || "md";
  const cls = "btn" + (VARIANTS[variant] || "") + (props.className ? " " + props.className : "");
  const style = Object.assign(size === "sm" ? {
    height: "var(--control-h-sm)",
    padding: "3px 10px 3px 6px",
    borderRadius: "var(--radius-md)"
  } : {}, props.fullWidth ? {
    width: "100%"
  } : {}, props.style);
  return /*#__PURE__*/React.createElement("button", {
    type: props.type || "button",
    className: cls,
    style: style,
    disabled: props.disabled || props.loading,
    "aria-busy": props.loading ? "true" : undefined,
    onClick: props.onClick
  }, props.loading ? /*#__PURE__*/React.createElement(__ds_scope.Spinner, {
    size: 12
  }) : props.iconLeft, props.children, props.iconRight);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/StatusDot.jsx
try { (() => {
/* 6px dot. The only decoration allowed to carry a state colour outside the
   calendar: connected, done, overdue, warning. */
function StatusDot(props) {
  return /*#__PURE__*/React.createElement("span", {
    className: "nt-dot",
    "data-tone": props.tone || "neutral",
    "aria-hidden": "true",
    style: props.style
  });
}
Object.assign(__ds_scope, { StatusDot });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/StatusDot.jsx", error: String((e && e.message) || e) }); }

// components/core/ToggleGroup.jsx
try { (() => {
/* The pill variant: full round track, 3px inner padding, one selected item.
   Used for view switches (Day / Week / Month), never for navigation. */
function ToggleGroup(props) {
  const items = props.items || [];
  return /*#__PURE__*/React.createElement("div", {
    className: "toggle-group",
    role: "group",
    "aria-label": props.label,
    style: props.style
  }, items.map(function (it) {
    const on = it.value === props.value;
    return /*#__PURE__*/React.createElement("button", {
      key: it.value,
      type: "button",
      "aria-pressed": on ? "true" : "false",
      disabled: it.disabled,
      onClick: function () {
        if (props.onChange) props.onChange(it.value);
      },
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: 26,
        padding: "0 10px",
        border: 0,
        borderRadius: "var(--radius-pill)",
        font: "var(--type-ui-medium)",
        cursor: "default",
        background: on ? "var(--fill-accent)" : "transparent",
        color: it.disabled ? "var(--text-disabled)" : on ? "var(--accent)" : "var(--text-muted)",
        transition: "background-color var(--transition-hover), color var(--transition-hover)"
      }
    }, it.icon, it.label);
  }));
}
Object.assign(__ds_scope, { ToggleGroup });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/ToggleGroup.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
/* 16px box, radius 4, inset ring at rest. Checked is accent at 24% with the
   accent glyph — no solid accent fill anywhere. */
function Checkbox(props) {
  const checked = !!props.checked;
  return /*#__PURE__*/React.createElement("label", {
    className: "nt-check",
    "data-checked": checked ? "true" : undefined,
    "data-indeterminate": props.indeterminate ? "true" : undefined,
    "data-disabled": props.disabled ? "true" : undefined,
    style: Object.assign({
      position: "relative"
    }, props.style)
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: checked,
    disabled: props.disabled,
    onChange: function (e) {
      if (props.onChange) props.onChange(e.target.checked);
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "nt-check-box"
  }, props.indeterminate ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "minus",
    size: 12,
    strokeWidth: 2.25
  }) : checked ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: 12,
    strokeWidth: 2.25
  }) : null), props.label ? /*#__PURE__*/React.createElement("span", null, props.label) : null, props.meta ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-meta)",
      color: "var(--text-muted)"
    }
  }, props.meta) : null);
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/DatePicker.jsx
try { (() => {
/* 28px cells, radius 8. Today takes --fill-accent-strong (the same fill the
   calendar gives today, and nothing else); the selected day takes
   --fill-accent plus the 2px inset accent ring. */
const DOW = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function startOffset(y, m) {
  const d = new Date(y, m, 1).getDay();
  return (d + 6) % 7;
}
function DatePicker(props) {
  const today = props.today ? new Date(props.today) : new Date();
  const selected = props.value ? new Date(props.value) : null;
  const init = selected || today;
  const [cursor, setCursor] = React.useState({
    y: init.getFullYear(),
    m: init.getMonth()
  });
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const off = startOffset(cursor.y, cursor.m);
  const prevDays = new Date(cursor.y, cursor.m, 0).getDate();
  const cells = [];
  for (let i = 0; i < off; i++) cells.push({
    n: prevDays - off + 1 + i,
    outside: true
  });
  for (let i = 1; i <= days; i++) cells.push({
    n: i,
    outside: false
  });
  while (cells.length % 7 !== 0) cells.push({
    n: cells.length - days - off + 1,
    outside: true
  });
  function same(a, y, m, n) {
    return a && a.getFullYear() === y && a.getMonth() === m && a.getDate() === n;
  }
  function step(delta) {
    const m = cursor.m + delta;
    setCursor({
      y: cursor.y + Math.floor(m / 12),
      m: (m % 12 + 12) % 12
    });
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "nt-datepicker",
    style: props.style
  }, /*#__PURE__*/React.createElement("div", {
    className: "nt-dp-head"
  }, /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    label: "Previous month",
    variant: "ghost",
    onClick: function () {
      step(-1);
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-left",
    size: 14
  })), /*#__PURE__*/React.createElement("span", {
    className: "nt-dp-month"
  }, MONTHS[cursor.m] + " " + cursor.y), /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    label: "Next month",
    variant: "ghost",
    onClick: function () {
      step(1);
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-right",
    size: 14
  }))), /*#__PURE__*/React.createElement("div", {
    className: "nt-dp-grid"
  }, DOW.map(function (d, i) {
    return /*#__PURE__*/React.createElement("span", {
      key: i,
      className: "nt-dp-dow"
    }, d);
  }), cells.map(function (c, i) {
    const isToday = !c.outside && same(today, cursor.y, cursor.m, c.n);
    const isSel = !c.outside && same(selected, cursor.y, cursor.m, c.n);
    return /*#__PURE__*/React.createElement("button", {
      key: i,
      type: "button",
      className: "nt-dp-cell",
      "data-outside": c.outside ? "true" : undefined,
      "data-today": isToday ? "true" : undefined,
      "data-selected": isSel ? "true" : undefined,
      disabled: props.disabledOutside && c.outside,
      onClick: function () {
        if (props.onChange) props.onChange(new Date(cursor.y, cursor.m + (c.outside ? i < 7 ? -1 : 1 : 0), c.n));
      }
    }, c.n);
  })), props.footer !== false ? /*#__PURE__*/React.createElement("div", {
    className: "nt-dp-foot"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "nt-menu-item",
    style: {
      height: 28,
      width: "auto",
      padding: "0 8px"
    },
    onClick: function () {
      if (props.onChange) props.onChange(today);
    }
  }, "Today"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "nt-menu-item",
    style: {
      height: 28,
      width: "auto",
      padding: "0 8px",
      color: "var(--text-muted)"
    },
    onClick: function () {
      if (props.onChange) props.onChange(null);
    }
  }, "Clear")) : null);
}
Object.assign(__ds_scope, { DatePicker });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/DatePicker.jsx", error: String((e && e.message) || e) }); }

// components/forms/FormRow.jsx
try { (() => {
/* The row every form is built from. One label-column width (--form-label-w,
   105px — measured from the longest real label, see tokens/spacing.css) and one
   row height (--form-row-h, 32px) for the whole system — never override them
   per form. Labels truncate on one line and carry their full text in the title
   attribute; a label that wraps to two lines is the defect this system removes. */
function FormRow(props) {
  return /*#__PURE__*/React.createElement("div", {
    className: "nt-row" + (props.align === "start" ? " nt-row-stacked" : "") + (props.className ? " " + props.className : ""),
    "data-disabled": props.disabled ? "true" : undefined,
    style: props.style
  }, /*#__PURE__*/React.createElement("label", {
    className: "nt-row-label",
    htmlFor: props.htmlFor,
    title: props.label
  }, props.label, props.optional ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-disabled)"
    }
  }, "  optional") : null), /*#__PURE__*/React.createElement("div", {
    className: "nt-row-control"
  }, props.children), props.error ? /*#__PURE__*/React.createElement("div", {
    className: "nt-row-error"
  }, props.error) : props.hint ? /*#__PURE__*/React.createElement("div", {
    className: "nt-row-hint"
  }, props.hint) : null);
}

/* A titled group of rows. 21px between groups, 11px between rows. */
function FormGroup(props) {
  return /*#__PURE__*/React.createElement("div", {
    className: "nt-form-group",
    style: props.style
  }, props.title ? /*#__PURE__*/React.createElement("div", {
    className: "nt-form-group-title"
  }, props.title) : null, props.children);
}
Object.assign(__ds_scope, { FormRow, FormGroup });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/FormRow.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
/* 32px, radius 12, transparent fill with an inset ring — controls are
   recessed. Focus replaces the ring with the 2px accent ring, inset. */
function Input(props) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      display: "flex",
      alignItems: "center",
      width: "100%"
    }
  }, props.iconLeft ? /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      left: 8,
      display: "flex",
      color: "var(--text-muted)",
      pointerEvents: "none"
    }
  }, props.iconLeft) : null, /*#__PURE__*/React.createElement("input", {
    id: props.id,
    className: "nt-input" + (props.plain ? " nt-input-plain" : "") + (props.size === "sm" ? " nt-input-sm" : ""),
    type: props.type || "text",
    value: props.value,
    defaultValue: props.defaultValue,
    placeholder: props.placeholder,
    disabled: props.disabled,
    readOnly: props.readOnly,
    "aria-invalid": props.invalid ? "true" : undefined,
    onChange: props.onChange,
    style: Object.assign(props.iconLeft ? {
      paddingLeft: 28
    } : {}, props.mono ? {
      fontFamily: "var(--font-mono)"
    } : {}, props.style)
  }), props.suffix ? /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      right: 8,
      font: "var(--type-meta)",
      color: "var(--text-muted)"
    }
  }, props.suffix) : null);
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Radio.jsx
try { (() => {
/* Same box as Checkbox, full-round, with an accent centre when selected. */
function Radio(props) {
  const checked = !!props.checked;
  return /*#__PURE__*/React.createElement("label", {
    className: "nt-check",
    "data-checked": checked ? "true" : undefined,
    "data-disabled": props.disabled ? "true" : undefined,
    style: Object.assign({
      position: "relative"
    }, props.style)
  }, /*#__PURE__*/React.createElement("input", {
    type: "radio",
    name: props.name,
    checked: checked,
    disabled: props.disabled,
    onChange: function () {
      if (props.onChange) props.onChange(props.value);
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "nt-check-box nt-radio-box"
  }, checked ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: 9999,
      background: "var(--accent)"
    }
  }) : null), props.label ? /*#__PURE__*/React.createElement("span", null, props.label) : null);
}

/* A vertical set of Radios sharing one name. */
function RadioGroup(props) {
  const items = props.items || [];
  return /*#__PURE__*/React.createElement("div", {
    role: "radiogroup",
    style: Object.assign({
      display: "flex",
      flexDirection: props.horizontal ? "row" : "column",
      gap: props.horizontal ? 16 : 6
    }, props.style)
  }, items.map(function (it) {
    return /*#__PURE__*/React.createElement(Radio, {
      key: it.value,
      name: props.name,
      value: it.value,
      label: it.label,
      disabled: it.disabled,
      checked: it.value === props.value,
      onChange: props.onChange
    });
  }));
}
Object.assign(__ds_scope, { Radio, RadioGroup });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Radio.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
/* One select for the whole product. Trigger is an Input-shaped recessed
   control; the list is the same popover surface as Menu, 32px rows, radius 8,
   selected row on --fill-accent with accent text.

   States match Input, because the two sit in the same form: rest, hover, focus,
   open, disabled, invalid (destructive ring inset; the message goes in the slot
   FormRow already provides), and loading — the trigger keeps its size, shows
   the spinner in place of the chevron, and leaves the tab order while it
   loads. */
function Select(props) {
  const [open, setOpen] = React.useState(false);
  const options = props.options || [];
  const current = options.filter(function (o) {
    return o.value === props.value;
  })[0];
  const wrap = React.useRef(null);
  const loading = !!props.loading;
  React.useEffect(function () {
    if (!open) return undefined;
    function away(e) {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    }
    function esc(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return function () {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  React.useEffect(function () {
    if (loading && open) setOpen(false);
  }, [loading, open]);
  return /*#__PURE__*/React.createElement("div", {
    className: "nt-select",
    ref: wrap,
    style: props.style
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    id: props.id,
    className: "nt-select-trigger",
    "aria-haspopup": "listbox",
    "aria-expanded": open ? "true" : "false",
    "aria-invalid": props.invalid ? "true" : undefined,
    "aria-busy": loading ? "true" : undefined,
    "data-placeholder": current || loading ? undefined : "true",
    "data-loading": loading ? "true" : undefined,
    tabIndex: loading ? -1 : undefined,
    disabled: props.disabled,
    onClick: function () {
      if (!loading) setOpen(!open);
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, !loading && current && current.icon ? current.icon : null, loading ? props.loadingLabel || "Loading" : current ? current.label : props.placeholder || "Select"), /*#__PURE__*/React.createElement("span", {
    className: "nt-select-caret"
  }, loading ? /*#__PURE__*/React.createElement(__ds_scope.Spinner, {
    size: 12,
    label: props.loadingLabel || "Loading options"
  }) : /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-down",
    size: 14
  }))), open ? /*#__PURE__*/React.createElement("div", {
    className: "nt-menu",
    role: "listbox",
    style: {
      position: "absolute",
      top: "calc(100% + 4px)",
      left: 0,
      right: 0,
      minWidth: 0
    }
  }, options.length === 0 ? /*#__PURE__*/React.createElement("p", {
    className: "nt-empty-text",
    style: {
      margin: 0,
      padding: "8px 8px 11px"
    }
  }, props.emptyText || "Nothing to choose from yet.") : options.map(function (o) {
    const isSel = o.value === props.value;
    return /*#__PURE__*/React.createElement("button", {
      key: o.value,
      type: "button",
      role: "option",
      "aria-selected": isSel ? "true" : "false",
      className: "nt-menu-item",
      "data-selected": isSel ? "true" : undefined,
      "data-disabled": o.disabled ? "true" : undefined,
      disabled: o.disabled,
      onClick: function () {
        setOpen(false);
        if (props.onChange) props.onChange(o.value);
      }
    }, o.icon, o.label, isSel ? /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: "auto"
      }
    }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: "check",
      size: 14
    })) : null);
  })) : null);
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
/* 28×16 track, 12px knob. Off is --fill-5; on is accent at 24% with an accent
   knob. Use it for settings, never for a filter — filters are segments. */
function Switch(props) {
  const checked = !!props.checked;
  return /*#__PURE__*/React.createElement("label", {
    className: "nt-switch",
    "data-checked": checked ? "true" : undefined,
    "data-disabled": props.disabled ? "true" : undefined,
    style: Object.assign({
      position: "relative"
    }, props.style)
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    role: "switch",
    checked: checked,
    disabled: props.disabled,
    onChange: function (e) {
      if (props.onChange) props.onChange(e.target.checked);
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "nt-switch-track"
  }, /*#__PURE__*/React.createElement("span", {
    className: "nt-switch-knob"
  })), props.label ? /*#__PURE__*/React.createElement("span", null, props.label) : null);
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/forms/Textarea.jsx
try { (() => {
/* Same ring as Input, min-height 72px, vertical resize only. */
function Textarea(props) {
  return /*#__PURE__*/React.createElement("textarea", {
    id: props.id,
    className: "nt-input",
    rows: props.rows || 3,
    value: props.value,
    defaultValue: props.defaultValue,
    placeholder: props.placeholder,
    disabled: props.disabled,
    "aria-invalid": props.invalid ? "true" : undefined,
    onChange: props.onChange,
    style: props.style
  });
}
Object.assign(__ds_scope, { Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Textarea.jsx", error: String((e && e.message) || e) }); }

// components/navigation/CommandBar.jsx
try { (() => {
/* Labelled with a verb — "Open", not a magnifier. 32px, radius 12,
   transparent fill, INSET ring. The ring goes inside: controls are recessed,
   objects are raised. */
function CommandBar(props) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "command-bar",
    onClick: props.onClick,
    style: Object.assign({
      width: props.width || 480,
      border: 0,
      cursor: "default",
      justifyContent: "space-between"
    }, props.style)
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "arrow-right",
    size: 16
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-ui)"
    }
  }, props.label || "Open")), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-meta)",
      color: "var(--text-muted)",
      fontVariantNumeric: "tabular-nums"
    }
  }, props.keys || "⌘K"));
}
Object.assign(__ds_scope, { CommandBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/CommandBar.jsx", error: String((e && e.message) || e) }); }

// components/navigation/NavRow.jsx
try { (() => {
/* 32px, radius 8, transparent at rest with text at 85%. Hover fills fill-3;
   active fills fill-4 and promotes text to 100% with a weight bump.
   Never an underline, never a left accent bar. */
function NavRow(props) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "nav-row" + (props.active ? " is-active" : ""),
    "aria-current": props.active ? "page" : undefined,
    disabled: props.disabled,
    onClick: props.onClick,
    style: Object.assign(props.disabled ? {
      color: "var(--text-disabled)"
    } : {}, props.style)
  }, props.icon ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      flex: "none"
    }
  }, props.icon) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, props.label), props.count != null ? /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      font: "var(--type-meta)",
      color: "var(--text-muted)",
      fontVariantNumeric: "tabular-nums"
    }
  }, props.count) : null, props.trailing ? /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      display: "flex"
    }
  }, props.trailing) : null);
}

/* Section heading above a group of nav rows: 12/500 at 40%. */
function NavSection(props) {
  return /*#__PURE__*/React.createElement("div", {
    style: Object.assign({
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      height: 28,
      padding: "0 6px"
    }, props.style)
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-meta-medium)",
      color: "var(--text-muted)"
    }
  }, props.title), props.action);
}
Object.assign(__ds_scope, { NavRow, NavSection });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/NavRow.jsx", error: String((e && e.message) || e) }); }

// components/overlays/Dialog.jsx
try { (() => {
/* 840×620, header 84, footer 54, aside minmax(320px, 356px). Radius 20,
   raised surface, floating shadow, plain scrim — no backdrop blur. */
function Dialog(props) {
  if (props.open === false) return null;
  const size = props.size || "lg";
  return /*#__PURE__*/React.createElement("div", {
    className: "nt-scrim",
    style: props.scrimStyle,
    onMouseDown: function (e) {
      if (e.target === e.currentTarget && props.onClose) props.onClose();
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "nt-dialog" + (size === "sm" ? " nt-dialog-sm" : ""),
    role: "dialog",
    "aria-modal": "true",
    "aria-label": props.title,
    style: props.style
  }, /*#__PURE__*/React.createElement("header", {
    className: "nt-dialog-header"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    className: "nt-dialog-title"
  }, props.title), props.subtitle ? /*#__PURE__*/React.createElement("p", {
    className: "nt-dialog-sub"
  }, props.subtitle) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, props.headerActions, props.onClose ? /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    label: "Close",
    variant: "ghost",
    onClick: props.onClose
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 16
  })) : null)), /*#__PURE__*/React.createElement("div", {
    className: "nt-dialog-body" + (props.aside ? " nt-dialog-body-split" : "")
  }, /*#__PURE__*/React.createElement("div", {
    className: "nt-dialog-main scroll-inner"
  }, props.children), props.aside ? /*#__PURE__*/React.createElement("aside", {
    className: "nt-dialog-aside scroll-inner"
  }, props.aside) : null), props.footer ? /*#__PURE__*/React.createElement("footer", {
    className: "nt-dialog-footer"
  }, props.footer) : null));
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlays/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/overlays/Menu.jsx
try { (() => {
/* One implementation for dropdowns and context menus. Rows 32px, radius 8,
   transparent at rest; the surface is radius 12 with the floating shadow. */
function Menu(props) {
  return /*#__PURE__*/React.createElement("div", {
    className: "nt-menu",
    role: "menu",
    style: Object.assign({
      width: props.width
    }, props.style)
  }, props.children);
}
function MenuItem(props) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    role: "menuitem",
    className: "nt-menu-item",
    "data-selected": props.selected ? "true" : undefined,
    "data-variant": props.variant,
    "data-disabled": props.disabled ? "true" : undefined,
    disabled: props.disabled,
    onClick: props.onClick
  }, props.icon ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      color: "var(--text-muted)"
    }
  }, props.icon) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, props.children), props.selected ? /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      display: "flex"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: 14
  })) : null, props.shortcut ? /*#__PURE__*/React.createElement("span", {
    className: "nt-menu-shortcut"
  }, props.shortcut) : null, props.submenu ? /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      display: "flex",
      color: "var(--text-muted)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-right",
    size: 14
  })) : null);
}
function MenuLabel(props) {
  return /*#__PURE__*/React.createElement("div", {
    className: "nt-menu-label"
  }, props.children);
}
function MenuSeparator() {
  return /*#__PURE__*/React.createElement("div", {
    className: "nt-menu-sep",
    role: "separator"
  });
}

/* A menu attached to a trigger: click to open, outside click and Escape close. */
function DropdownMenu(props) {
  const [open, setOpen] = React.useState(false);
  const wrap = React.useRef(null);
  React.useEffect(function () {
    if (!open) return undefined;
    function away(e) {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    }
    function esc(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return function () {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const align = props.align === "right" ? {
    right: 0
  } : {
    left: 0
  };
  return /*#__PURE__*/React.createElement("div", {
    ref: wrap,
    style: Object.assign({
      position: "relative",
      display: "inline-flex"
    }, props.style)
  }, /*#__PURE__*/React.createElement("span", {
    onClick: function () {
      setOpen(!open);
    },
    style: {
      display: "inline-flex"
    }
  }, props.trigger), open ? /*#__PURE__*/React.createElement("div", {
    style: Object.assign({
      position: "absolute",
      top: "calc(100% + 4px)"
    }, align, {
      zIndex: "var(--z-dropdown)"
    }),
    onClick: function () {
      setOpen(false);
    }
  }, /*#__PURE__*/React.createElement(Menu, {
    width: props.width
  }, props.children)) : null);
}
Object.assign(__ds_scope, { Menu, MenuItem, MenuLabel, MenuSeparator, DropdownMenu });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlays/Menu.jsx", error: String((e && e.message) || e) }); }

// components/overlays/ContextMenu.jsx
try { (() => {
/* Right-click menu. Identical surface and rows to the dropdown — the system
   has one menu, positioned two ways. */
function ContextMenu(props) {
  const [at, setAt] = React.useState(null);
  React.useEffect(function () {
    if (!at) return undefined;
    function close() {
      setAt(null);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("scroll", close, true);
    return function () {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [at]);
  return /*#__PURE__*/React.createElement("div", {
    style: Object.assign({
      position: "relative"
    }, props.style),
    onContextMenu: function (e) {
      e.preventDefault();
      const box = e.currentTarget.getBoundingClientRect();
      setAt({
        x: e.clientX - box.left,
        y: e.clientY - box.top
      });
    }
  }, props.children, at ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: at.x,
      top: at.y,
      zIndex: "var(--z-dropdown)"
    },
    onClick: function () {
      setAt(null);
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Menu, {
    width: props.width
  }, props.items)) : null);
}
Object.assign(__ds_scope, { ContextMenu });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlays/ContextMenu.jsx", error: String((e && e.message) || e) }); }

// components/overlays/Popover.jsx
try { (() => {
/* The generic anchored surface: date picker, project picker, quick edit.
   Same shadow as Menu, 16px padding, radius 12. */
function Popover(props) {
  const wrap = React.useRef(null);
  React.useEffect(function () {
    if (!props.open) return undefined;
    function away(e) {
      if (wrap.current && !wrap.current.contains(e.target) && props.onClose) props.onClose();
    }
    function esc(e) {
      if (e.key === "Escape" && props.onClose) props.onClose();
    }
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return function () {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [props.open, props.onClose]);
  const align = props.align === "right" ? {
    right: 0
  } : {
    left: 0
  };
  return /*#__PURE__*/React.createElement("span", {
    ref: wrap,
    style: Object.assign({
      position: "relative",
      display: "inline-flex"
    }, props.style)
  }, /*#__PURE__*/React.createElement("span", {
    onClick: props.onToggle,
    style: {
      display: "inline-flex"
    }
  }, props.anchor), props.open ? /*#__PURE__*/React.createElement("div", {
    className: props.bare ? "" : "nt-popover",
    style: Object.assign({
      position: "absolute",
      top: "calc(100% + 6px)"
    }, align, {
      zIndex: "var(--z-dropdown)"
    })
  }, props.children) : null);
}
Object.assign(__ds_scope, { Popover });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlays/Popover.jsx", error: String((e && e.message) || e) }); }

// components/overlays/Tooltip.jsx
try { (() => {
/* 12px, one line, raised surface, no arrow and no blur. Opens on hover and on
   keyboard focus of the trigger; a shortcut may ride at the end in muted text. */
function Tooltip(props) {
  return /*#__PURE__*/React.createElement("span", {
    className: "nt-tooltip-wrap",
    style: props.style
  }, props.children, /*#__PURE__*/React.createElement("span", {
    className: "nt-tooltip",
    role: "tooltip",
    "data-side": props.side || "top"
  }, props.label, props.keys ? /*#__PURE__*/React.createElement("span", {
    className: "nt-tooltip-key"
  }, props.keys) : null));
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlays/Tooltip.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Avatar.jsx
try { (() => {
/* 36×36, radius 14, raised: five thin shadow layers and a ring. Used for the
   account and the space switcher. Initials, never an illustration. */
function Avatar(props) {
  const size = props.size || 36;
  return /*#__PURE__*/React.createElement("span", {
    className: "raised",
    style: Object.assign({
      display: "grid",
      placeItems: "center",
      width: size,
      height: size,
      borderRadius: size <= 28 ? "var(--radius-md)" : "var(--radius-2xl)",
      font: "var(--type-meta-medium)",
      color: "var(--text-secondary)",
      overflow: "hidden"
    }, props.style),
    "aria-label": props.name
  }, props.src ? /*#__PURE__*/React.createElement("img", {
    src: props.src,
    alt: "",
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    }
  }) : props.initials);
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Card.jsx
try { (() => {
/* Radius 16, raised surface, 1px ring, no resting blur. The card reads because
   the ground behind it is a step darker — never add a shadow to make it pop.
   States live in CSS (tokens/components.css) so :hover and :focus-visible are
   real: interactive cards promote the ring one fill step on hover; a selected
   card takes --fill-accent with the accent ring, matching SegmentedControl and
   the date cell. The shadow never grows — the system rings, it does not lift. */
function Card(props) {
  const interactive = !!(props.onClick || props.interactive);
  return /*#__PURE__*/React.createElement("section", {
    className: "card" + (props.className ? " " + props.className : ""),
    "data-interactive": interactive ? "true" : undefined,
    "data-selected": props.selected ? "true" : undefined,
    "aria-selected": props.selected ? "true" : undefined,
    tabIndex: interactive ? 0 : undefined,
    onClick: props.onClick,
    style: Object.assign({
      padding: props.padding != null ? props.padding : 16,
      display: "flex",
      flexDirection: "column",
      gap: 11
    }, props.style)
  }, props.title || props.action ? /*#__PURE__*/React.createElement("header", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("h3", {
    className: "card-title",
    style: {
      margin: 0,
      font: "var(--type-card-title)"
    }
  }, props.title), props.count != null ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-meta)",
      color: "var(--text-muted)",
      fontVariantNumeric: "tabular-nums"
    }
  }, props.count) : null), props.action) : null, props.children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Card.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/DocumentSheet.jsx
try { (() => {
/* Max width 844px, radius 26 — the largest in the product — white, ring only.
   A page of writing behaves like a sheet of paper; the calendar canvas and the
   day timeline never do. Body text is 16/400/19.2. */
function DocumentSheet(props) {
  return /*#__PURE__*/React.createElement("article", {
    className: "doc-sheet-page",
    style: Object.assign({
      width: "100%",
      padding: props.padding != null ? props.padding : "48px 56px"
    }, props.style)
  }, props.title ? /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: "0 0 16px",
      font: "var(--weight-bold) var(--text-h1) / var(--lh-h1) var(--font-sans)",
      color: "var(--text-primary)"
    }
  }, props.title) : null, props.meta ? /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-meta)",
      color: "var(--text-muted)",
      marginBottom: 20
    }
  }, props.meta) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-body)",
      color: "var(--text-primary)"
    }
  }, props.children));
}
Object.assign(__ds_scope, { DocumentSheet });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/DocumentSheet.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/EmptyState.jsx
try { (() => {
/* An outline icon, one sentence at --text-disabled, one action. In a sidebar
   section use SidebarHint instead — never leave blank space. */
function EmptyState(props) {
  return /*#__PURE__*/React.createElement("div", {
    className: "nt-empty",
    style: props.style
  }, props.icon ? /*#__PURE__*/React.createElement("span", {
    className: "nt-empty-icon"
  }, props.icon) : null, /*#__PURE__*/React.createElement("p", {
    className: "nt-empty-text",
    style: {
      margin: 0
    }
  }, props.text), props.action);
}

/* The sidebar variant: a grey italic hint at 12px, in place of blank space. */
function SidebarHint(props) {
  return /*#__PURE__*/React.createElement("p", {
    className: "empty-hint",
    style: Object.assign({
      margin: 0,
      padding: "4px 6px"
    }, props.style)
  }, props.children);
}
Object.assign(__ds_scope, { EmptyState, SidebarHint });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/FloatingAction.jsx
try { (() => {
/* Bottom-right. Radius 18, deep two-blur shadow plus ring, and the ONLY
   element in the product permitted a backdrop blur. */
function FloatingAction(props) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "floating glass",
    onClick: props.onClick,
    style: Object.assign({
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "0 14px",
      border: 0,
      font: "var(--type-ui-medium)",
      color: "var(--text-secondary)",
      background: "var(--floating-fill)",
      cursor: "default"
    }, props.fixed !== false ? {
      position: "absolute",
      right: 20,
      bottom: 20,
      zIndex: "var(--z-island)"
    } : {}, props.style)
  }, props.icon, props.children);
}
Object.assign(__ds_scope, { FloatingAction });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/FloatingAction.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Skeleton.jsx
try { (() => {
/* Loading placeholder. fill-3, radius 4, no shimmer — the system has no
   entrance animation and no pulse. */
function Skeleton(props) {
  return /*#__PURE__*/React.createElement("span", {
    className: "nt-skeleton",
    "aria-hidden": "true",
    style: Object.assign({
      display: "block",
      width: props.width || "100%",
      height: props.height || 13,
      borderRadius: props.radius || "var(--radius-xs)"
    }, props.style)
  });
}

/* n skeleton rows at the row height, for a list that has not loaded. */
function SkeletonRows(props) {
  const n = props.count || 3;
  const widths = ["72%", "54%", "88%", "63%", "45%"];
  return /*#__PURE__*/React.createElement("div", {
    style: Object.assign({
      display: "flex",
      flexDirection: "column",
      gap: 11
    }, props.style)
  }, Array.from({
    length: n
  }).map(function (_, i) {
    return /*#__PURE__*/React.createElement("span", {
      key: i,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 32
      }
    }, /*#__PURE__*/React.createElement(Skeleton, {
      width: 16,
      height: 16,
      radius: "var(--radius-xs)"
    }), /*#__PURE__*/React.createElement(Skeleton, {
      width: widths[i % widths.length]
    }));
  }));
}
Object.assign(__ds_scope, { Skeleton, SkeletonRows });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Skeleton.jsx", error: String((e && e.message) || e) }); }

// ui_kits/needt-app/App.jsx
try { (() => {
const TASKS = [{
  id: 1,
  title: "Draft the launch brief",
  project: "Operations",
  tone: "info",
  time: "09:00",
  done: false
}, {
  id: 2,
  title: "Send invoices for August",
  project: "Operations",
  tone: "info",
  overdue: true,
  done: false
}, {
  id: 3,
  title: "Review the form-row spec",
  project: "Design system",
  tone: "accent",
  time: "11:00",
  done: false
}, {
  id: 4,
  title: "German — B2 unit 4",
  project: "German",
  tone: "success",
  time: "18:00",
  done: false
}, {
  id: 5,
  title: "Call the accountant back",
  project: null,
  done: false
}, {
  id: 6,
  title: "Collect last quarter's numbers",
  project: "Operations",
  tone: "info",
  done: false
}, {
  id: 7,
  title: "Pick a courier for the September batch",
  project: null,
  done: false
}, {
  id: 8,
  title: "Write the weekly review",
  project: "Design system",
  tone: "accent",
  time: "Fri",
  done: false
}, {
  id: 9,
  title: "Reconcile the card statement",
  project: "Operations",
  tone: "info",
  done: true
}, {
  id: 10,
  title: "Book the dentist",
  project: null,
  done: true
}];
function App() {
  const [screen, setScreen] = React.useState("today");
  const [theme, setTheme] = React.useState("light");
  const [tasks, setTasks] = React.useState(TASKS);
  const [taskOpen, setTaskOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  React.useEffect(() => {
    function key(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (e.key === "Escape") {
        setPaletteOpen(false);
      }
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  function toggle(id) {
    setTasks(list => list.map(t => t.id === id ? Object.assign({}, t, {
      done: !t.done
    }) : t));
  }
  const body = screen === "today" ? /*#__PURE__*/React.createElement(TodayScreen, {
    tasks: tasks,
    onToggle: toggle,
    onOpen: () => setTaskOpen(true),
    overlay: taskOpen || settingsOpen || paletteOpen
  }) : screen === "tasks" ? /*#__PURE__*/React.createElement(TasksScreen, {
    tasks: tasks,
    onToggle: toggle,
    onOpen: () => setTaskOpen(true)
  }) : screen === "calendar" ? /*#__PURE__*/React.createElement(CalendarScreen, {
    onOpen: () => setTaskOpen(true)
  }) : screen === "doc" ? /*#__PURE__*/React.createElement(DocumentScreen, {
    onBack: () => setScreen("docs")
  }) : /*#__PURE__*/React.createElement(DocsScreen, {
    onOpenDoc: () => setScreen("doc")
  });
  return /*#__PURE__*/React.createElement("div", {
    className: "app theme-surface " + (theme === "light" ? "" : theme),
    style: {
      display: "flex",
      height: "100%",
      background: "var(--background)"
    }
  }, /*#__PURE__*/React.createElement(Sidebar, {
    screen: screen,
    onScreen: setScreen,
    theme: theme,
    onTheme: setTheme,
    onOpenPalette: () => setPaletteOpen(true),
    onSettings: () => setSettingsOpen(true)
  }), /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1,
      minWidth: 0,
      position: "relative",
      display: "flex",
      flexDirection: "column",
      padding: "0 20px 20px",
      backgroundColor: "var(--surface-raised)",
      backgroundImage: "var(--canvas-veil)",
      boxShadow: "var(--border) 1px 0 0 0 inset",
      overflow: "hidden"
    }
  }, body, /*#__PURE__*/React.createElement(TaskDialog, {
    open: taskOpen,
    onClose: () => setTaskOpen(false)
  }), /*#__PURE__*/React.createElement(SettingsDialog, {
    open: settingsOpen,
    onClose: () => setSettingsOpen(false),
    theme: theme,
    onTheme: setTheme
  }), /*#__PURE__*/React.createElement(CommandPalette, {
    open: paletteOpen,
    onClose: () => setPaletteOpen(false),
    onScreen: setScreen
  })));
}

/* The design-system compiler bundles this file and evaluates it once at
   bundle-load time, when #root does not exist yet. Mount only when it does. */
const __root = document.getElementById("root");
if (__root) ReactDOM.createRoot(__root).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/needt-app/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/needt-app/CalendarScreen.jsx
try { (() => {
const {
  ToggleGroup,
  Button,
  IconButton,
  Icon,
  DayTimeline,
  FreeTime,
  Chip,
  ContextMenu,
  MenuItem,
  MenuSeparator
} = window.NeedtDesignSystem_25d3c8;
function CalendarScreen({
  onOpen
}) {
  const [view, setView] = React.useState("day");
  const [selected, setSelected] = React.useState(1);
  const free = FreeTime(PLACED, DAY.start, DAY.end, DAY.now);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHeader, {
    title: "September",
    meta: "Week 36",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        gap: 2
      }
    }, /*#__PURE__*/React.createElement(IconButton, {
      label: "Previous week"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "chevron-left",
      size: 16
    })), /*#__PURE__*/React.createElement(IconButton, {
      label: "Next week"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "chevron-right",
      size: 16
    }))), /*#__PURE__*/React.createElement(Button, {
      variant: "outline"
    }, "Today"), /*#__PURE__*/React.createElement(ToggleGroup, {
      value: view,
      onChange: setView,
      label: "Calendar view",
      items: [{
        value: "day",
        label: "Day"
      }, {
        value: "week",
        label: "Week"
      }, {
        value: "month",
        label: "Month"
      }]
    }))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 16,
      minHeight: 0,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      flex: "none"
    }
  }, /*#__PURE__*/React.createElement(WeekStrip, {
    selected: selected,
    onSelect: setSelected
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Legend, null), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      display: "flex",
      gap: 5
    }
  }, /*#__PURE__*/React.createElement(Chip, {
    tone: "accent"
  }, "2 unplaced"), /*#__PURE__*/React.createElement(Chip, null, free.left, " free")))), /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: 0,
      overflow: "auto",
      paddingBottom: 20,
      paddingRight: 4
    },
    className: "scroll-inner"
  }, /*#__PURE__*/React.createElement(DayTimeline, {
    items: PLACED,
    dayStart: DAY.start,
    dayEnd: DAY.end,
    now: DAY.now,
    nowLabel: DAY.nowLabel,
    onSelect: onOpen
  }))));
}
Object.assign(window, {
  CalendarScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/needt-app/CalendarScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/needt-app/Dialogs.jsx
try { (() => {
const {
  Dialog,
  FormRow,
  FormGroup,
  Input,
  Textarea,
  Select,
  Checkbox,
  Switch,
  RadioGroup,
  Button,
  Chip,
  Icon,
  Popover,
  DatePicker,
  StatusDot,
  Menu,
  MenuItem,
  MenuLabel
} = window.NeedtDesignSystem_25d3c8;

/* Every row here comes from FormRow, so the label column is 160px and the row
   height 32px in both columns of the dialog. */
function TaskDialog({
  open,
  onClose
}) {
  const [project, setProject] = React.useState("ops");
  const [repeat, setRepeat] = React.useState("none");
  const [due, setDue] = React.useState(new Date(2026, 8, 4));
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [auto, setAuto] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [priority, setPriority] = React.useState("normal");
  return /*#__PURE__*/React.createElement(Dialog, {
    open: open,
    onClose: onClose,
    title: "Draft the launch brief",
    subtitle: "Operations \xB7 created 28 Aug",
    aside: /*#__PURE__*/React.createElement("div", {
      style: {
        paddingTop: 16
      }
    }, /*#__PURE__*/React.createElement(FormGroup, {
      title: "Scheduling"
    }, /*#__PURE__*/React.createElement(FormRow, {
      label: "Auto-schedule"
    }, /*#__PURE__*/React.createElement(Switch, {
      checked: auto,
      onChange: setAuto
    })), /*#__PURE__*/React.createElement(FormRow, {
      label: "Duration"
    }, /*#__PURE__*/React.createElement(Input, {
      suffix: "min",
      defaultValue: "90",
      style: {
        width: 120
      }
    })), /*#__PURE__*/React.createElement(FormRow, {
      label: "Earliest"
    }, /*#__PURE__*/React.createElement(Input, {
      defaultValue: "09:00",
      type: "time",
      style: {
        width: 120
      }
    })), /*#__PURE__*/React.createElement(FormRow, {
      label: "Priority"
    }, /*#__PURE__*/React.createElement(RadioGroup, {
      horizontal: true,
      name: "priority",
      value: priority,
      onChange: setPriority,
      items: [{
        value: "normal",
        label: "Normal"
      }, {
        value: "high",
        label: "High"
      }]
    }))), /*#__PURE__*/React.createElement(FormGroup, {
      title: "Placed at",
      style: {
        marginTop: 21
      }
    }, /*#__PURE__*/React.createElement(FormRow, {
      label: "Tuesday"
    }, /*#__PURE__*/React.createElement(Chip, {
      tone: "accent",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "clock",
        size: 13
      })
    }, "09:00\u201310:30")), /*#__PURE__*/React.createElement(FormRow, {
      label: "Movable"
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        font: "var(--type-ui)",
        color: "var(--text-tertiary)"
      }
    }, "Yes \u2014 the rail is coloured")))),
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      onClick: onClose
    }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
      variant: "destructive",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "trash-2",
        size: 16
      })
    }, "Delete"), /*#__PURE__*/React.createElement(Button, {
      variant: "accent",
      loading: saving,
      onClick: () => {
        setSaving(true);
        window.setTimeout(() => {
          setSaving(false);
          onClose();
        }, 700);
      }
    }, "Save task"))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      paddingTop: 16
    }
  }, /*#__PURE__*/React.createElement(FormGroup, {
    title: "Task"
  }, /*#__PURE__*/React.createElement(FormRow, {
    label: "Title",
    htmlFor: "td-title"
  }, /*#__PURE__*/React.createElement(Input, {
    id: "td-title",
    defaultValue: "Draft the launch brief"
  })), /*#__PURE__*/React.createElement(FormRow, {
    label: "Project"
  }, /*#__PURE__*/React.createElement(Select, {
    value: project,
    onChange: setProject,
    options: [{
      value: "ops",
      label: "Operations",
      icon: /*#__PURE__*/React.createElement(StatusDot, {
        tone: "info"
      })
    }, {
      value: "ds",
      label: "Design system",
      icon: /*#__PURE__*/React.createElement(StatusDot, {
        tone: "accent"
      })
    }, {
      value: "de",
      label: "German",
      icon: /*#__PURE__*/React.createElement(StatusDot, {
        tone: "success"
      })
    }, {
      value: "arch",
      label: "Archived",
      disabled: true
    }]
  })), /*#__PURE__*/React.createElement(FormRow, {
    label: "Due",
    hint: "Overdue tasks take the red rail on the calendar."
  }, /*#__PURE__*/React.createElement(Popover, {
    bare: true,
    open: pickerOpen,
    onToggle: () => setPickerOpen(!pickerOpen),
    onClose: () => setPickerOpen(false),
    anchor: /*#__PURE__*/React.createElement(Chip, {
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "calendar",
        size: 13
      })
    }, due ? "4 September" : "No date")
  }, /*#__PURE__*/React.createElement(DatePicker, {
    value: due,
    today: new Date(2026, 8, 1),
    onChange: d => {
      setDue(d);
      setPickerOpen(false);
    }
  }))), /*#__PURE__*/React.createElement(FormRow, {
    label: "Repeat"
  }, /*#__PURE__*/React.createElement(Select, {
    value: repeat,
    onChange: setRepeat,
    options: [{
      value: "none",
      label: "Does not repeat"
    }, {
      value: "weekly",
      label: "Every week"
    }, {
      value: "monthly",
      label: "Every month"
    }]
  })), /*#__PURE__*/React.createElement(FormRow, {
    label: "Notes",
    align: "start"
  }, /*#__PURE__*/React.createElement(Textarea, {
    rows: 4,
    placeholder: "What does done look like?"
  }))), /*#__PURE__*/React.createElement(FormGroup, {
    title: "Checklist",
    style: {
      marginTop: 21
    }
  }, /*#__PURE__*/React.createElement(FormRow, {
    label: "Steps",
    align: "start"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(Checkbox, {
    checked: true,
    label: "Collect last quarter's numbers"
  }), /*#__PURE__*/React.createElement(Checkbox, {
    label: "Draft the summary"
  }), /*#__PURE__*/React.createElement(Checkbox, {
    label: "Send to Anna for review"
  }))))));
}
function SettingsDialog({
  open,
  onClose,
  theme,
  onTheme
}) {
  const [font, setFont] = React.useState("inter");
  return /*#__PURE__*/React.createElement(Dialog, {
    open: open,
    onClose: onClose,
    title: "Settings",
    subtitle: "Appearance and scheduling",
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      onClick: onClose
    }, "Close"), /*#__PURE__*/React.createElement(Button, {
      variant: "accent",
      onClick: onClose
    }, "Save"))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      paddingTop: 16,
      maxWidth: 560
    }
  }, /*#__PURE__*/React.createElement(FormGroup, {
    title: "Appearance"
  }, /*#__PURE__*/React.createElement(FormRow, {
    label: "Theme"
  }, /*#__PURE__*/React.createElement(RadioGroup, {
    horizontal: true,
    name: "theme-setting",
    value: theme,
    onChange: onTheme,
    items: [{
      value: "light",
      label: "Light"
    }, {
      value: "dim",
      label: "Dim"
    }, {
      value: "dark",
      label: "Dark"
    }]
  })), /*#__PURE__*/React.createElement(FormRow, {
    label: "Interface font"
  }, /*#__PURE__*/React.createElement(Select, {
    value: font,
    onChange: setFont,
    options: [{
      value: "inter",
      label: "Inter"
    }, {
      value: "system",
      label: "System"
    }]
  })), /*#__PURE__*/React.createElement(FormRow, {
    label: "Document width"
  }, /*#__PURE__*/React.createElement(Input, {
    suffix: "px",
    defaultValue: "844",
    style: {
      width: 120
    }
  }))), /*#__PURE__*/React.createElement(FormGroup, {
    title: "Scheduling",
    style: {
      marginTop: 21
    }
  }, /*#__PURE__*/React.createElement(FormRow, {
    label: "Working hours"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Input, {
    type: "time",
    defaultValue: "09:00",
    style: {
      width: 108
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-muted)",
      font: "var(--type-ui)"
    }
  }, "to"), /*#__PURE__*/React.createElement(Input, {
    type: "time",
    defaultValue: "18:00",
    style: {
      width: 108
    }
  }))), /*#__PURE__*/React.createElement(FormRow, {
    label: "Auto-schedule"
  }, /*#__PURE__*/React.createElement(Switch, {
    checked: true,
    onChange: () => {}
  })), /*#__PURE__*/React.createElement(FormRow, {
    label: "Protect focus time",
    hint: "The scheduler will not place meetings inside a focus block."
  }, /*#__PURE__*/React.createElement(Switch, {
    checked: true,
    onChange: () => {}
  })), /*#__PURE__*/React.createElement(FormRow, {
    label: "Week starts on"
  }, /*#__PURE__*/React.createElement(Select, {
    value: "mon",
    options: [{
      value: "mon",
      label: "Monday"
    }, {
      value: "sun",
      label: "Sunday"
    }]
  })))));
}
function CommandPalette({
  open,
  onClose,
  onScreen
}) {
  const [q, setQ] = React.useState("");
  if (!open) return null;
  const items = [["Open Today", "today", "calendar-days", "⌘1"], ["Open Inbox", "tasks", "inbox", "⌘2"], ["Open Calendar", "calendar", "calendar", "⌘3"], ["Open Documents", "docs", "file-text", "⌘4"], ["Plan my day", "today", "wand-sparkles", "⌘⇧P"]].filter(i => i[0].toLowerCase().indexOf(q.toLowerCase()) > -1);
  return /*#__PURE__*/React.createElement("div", {
    className: "nt-scrim",
    style: {
      position: "absolute",
      alignItems: "flex-start",
      paddingTop: 96
    },
    onMouseDown: e => {
      if (e.target === e.currentTarget) onClose();
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 560,
      borderRadius: "var(--radius-xl)",
      background: "var(--surface-raised)",
      boxShadow: "var(--shadow-floating)",
      padding: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      height: 32,
      padding: "0 6px"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-right",
    size: 16
  }), /*#__PURE__*/React.createElement("input", {
    autoFocus: true,
    className: "nt-input nt-input-plain",
    placeholder: "Open, schedule or capture",
    value: q,
    onChange: e => setQ(e.target.value),
    style: {
      boxShadow: "none"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-meta)",
      color: "var(--text-muted)"
    }
  }, "esc")), /*#__PURE__*/React.createElement("div", {
    className: "nt-menu-sep"
  }), /*#__PURE__*/React.createElement(MenuLabel, null, "Jump to"), items.map(([label, screen, icon, keys]) => /*#__PURE__*/React.createElement(MenuItem, {
    key: label,
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: icon,
      size: 14
    }),
    shortcut: keys,
    onClick: () => {
      onScreen(screen);
      onClose();
    }
  }, label)), items.length === 0 ? /*#__PURE__*/React.createElement("p", {
    className: "nt-empty-text",
    style: {
      padding: "11px 8px",
      margin: 0
    }
  }, "Nothing matches. Press Enter to capture it as a task.") : null));
}
Object.assign(window, {
  TaskDialog,
  SettingsDialog,
  CommandPalette
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/needt-app/Dialogs.jsx", error: String((e && e.message) || e) }); }

// ui_kits/needt-app/DocsScreen.jsx
try { (() => {
const {
  Button,
  IconButton,
  Icon,
  Chip,
  SegmentedControl,
  ContextMenu,
  MenuItem,
  MenuSeparator,
  Tooltip,
  DocumentSheet,
  EmptyState
} = window.NeedtDesignSystem_25d3c8;
const DOCS = [{
  title: "Launch brief — September",
  meta: "Edited 20 min ago",
  project: "Operations",
  tone: "info",
  lines: 7
}, {
  title: "Needt design rules",
  meta: "Edited yesterday",
  project: "Design system",
  tone: "accent",
  lines: 9
}, {
  title: "Scheduler — placement notes",
  meta: "Edited 3 days ago",
  project: "Design system",
  tone: "accent",
  lines: 5
}, {
  title: "Weekly review, week 35",
  meta: "Edited 5 days ago",
  project: null,
  lines: 6
}, {
  title: "German B2 — verbs to drill",
  meta: "Edited 1 week ago",
  project: "German",
  tone: "success",
  lines: 8
}, {
  title: "Invoices and receipts",
  meta: "Edited 2 weeks ago",
  project: "Operations",
  tone: "info",
  lines: 4
}];

/* 208×260 white card, radius 16; the inner sheet is radius 10 at the top with a
   ring — a page peeking out of the card. */
function DocCard({
  doc,
  onOpen
}) {
  return /*#__PURE__*/React.createElement(ContextMenu, {
    items: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(MenuItem, {
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "external-link",
        size: 14
      }),
      onClick: onOpen
    }, "Open"), /*#__PURE__*/React.createElement(MenuItem, {
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "star",
        size: 14
      })
    }, "Star"), /*#__PURE__*/React.createElement(MenuSeparator, null), /*#__PURE__*/React.createElement(MenuItem, {
      variant: "destructive",
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "trash-2",
        size: 14
      })
    }, "Move to trash"))
  }, /*#__PURE__*/React.createElement("div", {
    className: "doc-card group",
    onClick: onOpen,
    style: {
      width: 208,
      height: 260,
      background: "var(--surface-raised)",
      borderRadius: "var(--radius-3xl)",
      boxShadow: "var(--shadow-ring)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "doc-sheet",
    style: {
      margin: "10px 10px 0",
      flex: 1,
      minHeight: 0,
      padding: "10px 12px 0",
      background: "var(--surface-raised)",
      borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
      boxShadow: "var(--shadow-ring)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-meta-medium)",
      color: "var(--text-secondary)",
      marginBottom: 6
    }
  }, doc.title), Array.from({
    length: doc.lines
  }).map((_, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      height: 3,
      borderRadius: 2,
      background: "var(--fill-4)",
      marginBottom: 5,
      width: i % 3 === 2 ? "62%" : "100%"
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 11,
      display: "flex",
      flexDirection: "column",
      gap: 5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-ui-medium)",
      color: "var(--text-primary)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, doc.title), /*#__PURE__*/React.createElement("span", {
    className: "reveal-on-hover",
    style: {
      marginLeft: "auto"
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    label: "Star",
    variant: "ghost"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "star",
    size: 14
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: "1 1 auto",
      minWidth: 0,
      font: "var(--type-meta)",
      color: "var(--text-quaternary)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, doc.meta), doc.project ? /*#__PURE__*/React.createElement(Chip, {
    style: {
      height: 20,
      flex: "none",
      maxWidth: 96
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, doc.project)) : null))));
}
function DocsScreen({
  onOpenDoc
}) {
  const [tab, setTab] = React.useState("all");
  const shown = tab === "starred" ? [] : DOCS;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHeader, {
    title: "Documents",
    meta: "6 documents",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "outline",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "upload",
        size: 16
      })
    }, "Import"), /*#__PURE__*/React.createElement(Button, {
      variant: "accent",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "plus",
        size: 16
      }),
      onClick: onOpenDoc
    }, "New document"))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      paddingBottom: 16,
      flex: "none"
    }
  }, /*#__PURE__*/React.createElement(SegmentedControl, {
    value: tab,
    onChange: setTab,
    label: "Document filter",
    items: [{
      value: "all",
      label: "All",
      count: 6
    }, {
      value: "starred",
      label: "Starred"
    }, {
      value: "shared",
      label: "Recent"
    }]
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: 0,
      overflow: "auto"
    },
    className: "scroll-inner"
  }, shown.length === 0 ? /*#__PURE__*/React.createElement(EmptyState, {
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "star",
      size: 24
    }),
    text: "No starred documents. Star a document to keep it in reach.",
    action: /*#__PURE__*/React.createElement(Button, {
      size: "sm",
      onClick: () => setTab("all")
    }, "Browse all")
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, 208px)",
      gap: 16
    }
  }, shown.map(d => /*#__PURE__*/React.createElement(DocCard, {
    key: d.title,
    doc: d,
    onOpen: onOpenDoc
  })))));
}
function DocumentScreen({
  onBack
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHeader, {
    title: "Launch brief \u2014 September",
    meta: "Edited 20 min ago \xB7 640 words",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "arrow-left",
        size: 16
      }),
      onClick: onBack
    }, "Documents"), /*#__PURE__*/React.createElement(Button, {
      variant: "outline"
    }, "Share"), /*#__PURE__*/React.createElement(IconButton, {
      label: "More"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "ellipsis",
      size: 16
    })))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: 0,
      overflowY: "auto",
      overflowX: "hidden",
      display: "flex",
      justifyContent: "center",
      position: "relative"
    },
    className: "scroll-inner"
  }, /*#__PURE__*/React.createElement(DocumentSheet, {
    title: "Launch brief \u2014 September",
    meta: "Operations \xB7 draft"
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "0 0 16px"
    }
  }, "The scheduler places work into real free hours, so the calendar is the plan rather than a record of it. This document sets the scope for the September release and the three screens it touches."), /*#__PURE__*/React.createElement("h2", {
    style: {
      font: "var(--weight-semibold) 18px / 22px var(--font-sans)",
      margin: "0 0 8px"
    }
  }, "Scope"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "0 0 16px"
    }
  }, "One person opens the same four screens forty times a day. Every change has to survive that repetition: density over comfort, one hairline instead of a shadow, and no motion beyond a hover."), /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: "0 0 16px",
      paddingLeft: 20
    }
  }, /*#__PURE__*/React.createElement("li", null, "Tasks and events share one grid."), /*#__PURE__*/React.createElement("li", null, "The rail on a block means movability, and nothing else."), /*#__PURE__*/React.createElement("li", null, "Three themes ship together; light carries the identity.")), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      color: "var(--text-tertiary)"
    }
  }, "Open questions are collected at the end of the week and closed in the Friday review.")), /*#__PURE__*/React.createElement("div", {
    className: "toolbar-floating",
    style: {
      position: "absolute",
      bottom: 20,
      left: "50%",
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 2,
      height: 45,
      padding: 4.5
    }
  }, ["bold", "italic", "link", "list", "code", "highlighter"].map(n => /*#__PURE__*/React.createElement(IconButton, {
    key: n,
    label: n,
    variant: "ghost",
    style: {
      height: 36,
      width: 36,
      borderRadius: 9999
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: n,
    size: 16
  }))))));
}
Object.assign(window, {
  DocsScreen,
  DocumentScreen,
  DocCard,
  DOCS
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/needt-app/DocsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/needt-app/Sidebar.jsx
try { (() => {
const NS = window.NeedtDesignSystem_25d3c8;
const {
  NavRow,
  NavSection,
  CommandBar,
  Avatar,
  SidebarHint,
  IconButton,
  Icon,
  ToggleGroup,
  Tooltip
} = NS;
function Sidebar({
  screen,
  onScreen,
  theme,
  onTheme,
  onOpenPalette,
  onSettings
}) {
  const nav = [["today", "Today", "calendar-days", 6], ["tasks", "Inbox", "inbox", 12], ["calendar", "Calendar", "calendar", null], ["docs", "Documents", "file-text", null]];
  const projects = [["Operations", "var(--info)", 4], ["Design system", "var(--accent)", 7], ["German", "var(--success)", null]];
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      width: "var(--sidebar-w)",
      flex: "none",
      display: "flex",
      flexDirection: "column",
      gap: 2,
      padding: "11px 8px",
      background: "var(--background)",
      height: "100%",
      boxSizing: "border-box"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      height: 40,
      padding: "0 6px 0 2px"
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    initials: "MK",
    name: "Maks",
    size: 28
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--weight-semibold) 15px / 18px var(--font-sans)",
      letterSpacing: "-0.01em",
      color: "var(--text-primary)"
    }
  }, "Needt"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      display: "flex",
      gap: 2
    }
  }, /*#__PURE__*/React.createElement(Tooltip, {
    label: "New task",
    keys: "N",
    side: "bottom"
  }, /*#__PURE__*/React.createElement(IconButton, {
    label: "New task",
    variant: "ghost"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 16
  }))))), /*#__PURE__*/React.createElement(CommandBar, {
    label: "Open",
    keys: "\u2318K",
    width: "100%",
    onClick: onOpenPalette,
    style: {
      marginBottom: 8
    }
  }), nav.map(([id, label, icon, count]) => /*#__PURE__*/React.createElement(NavRow, {
    key: id,
    label: label,
    count: count,
    active: screen === id,
    onClick: () => onScreen(id),
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: icon,
      size: 20
    })
  })), /*#__PURE__*/React.createElement(NavSection, {
    title: "Projects",
    style: {
      marginTop: 8
    },
    action: /*#__PURE__*/React.createElement(IconButton, {
      label: "New project",
      variant: "ghost"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "plus",
      size: 14
    }))
  }), projects.map(([name, color, count]) => /*#__PURE__*/React.createElement(NavRow, {
    key: name,
    label: name,
    count: count,
    icon: /*#__PURE__*/React.createElement("span", {
      style: {
        width: 8,
        height: 8,
        borderRadius: 9999,
        background: color,
        margin: "0 6px"
      }
    })
  })), /*#__PURE__*/React.createElement(NavSection, {
    title: "Starred",
    style: {
      marginTop: 8
    }
  }), /*#__PURE__*/React.createElement(SidebarHint, null, "Star docs to keep them close."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "auto",
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(ToggleGroup, {
    value: theme,
    onChange: onTheme,
    label: "Theme",
    items: [{
      value: "light",
      label: "Light"
    }, {
      value: "dim",
      label: "Dim"
    }, {
      value: "dark",
      label: "Dark"
    }]
  }), /*#__PURE__*/React.createElement(NavRow, {
    label: "Settings",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "settings",
      size: 20
    }),
    onClick: onSettings
  })));
}
Object.assign(window, {
  Sidebar
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/needt-app/Sidebar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/needt-app/TaskRow.jsx
try { (() => {
const {
  Checkbox,
  Chip,
  Icon,
  IconButton,
  ContextMenu,
  MenuItem,
  MenuSeparator,
  Tooltip,
  StatusDot
} = window.NeedtDesignSystem_25d3c8;

/* A task row. 32px, radius 8, transparent at rest — the same geometry as a nav
   row. Row actions are revealed on hover, never shown at rest. */
function TaskRow({
  task,
  onToggle,
  onOpen
}) {
  return /*#__PURE__*/React.createElement(ContextMenu, {
    items: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(MenuItem, {
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "pencil",
        size: 14
      }),
      onClick: onOpen
    }, "Edit"), /*#__PURE__*/React.createElement(MenuItem, {
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "clock",
        size: 14
      }),
      shortcut: "\u2318\u21E7S"
    }, "Reschedule"), /*#__PURE__*/React.createElement(MenuItem, {
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "folder",
        size: 14
      }),
      submenu: true
    }, "Move to project"), /*#__PURE__*/React.createElement(MenuSeparator, null), /*#__PURE__*/React.createElement(MenuItem, {
      variant: "destructive",
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "trash-2",
        size: 14
      }),
      shortcut: "\u232B"
    }, "Delete"))
  }, /*#__PURE__*/React.createElement("div", {
    className: "group",
    style: {
      position: "relative",
      display: "flex",
      alignItems: "center",
      gap: 8,
      height: 32,
      padding: "0 6px",
      borderRadius: "var(--radius-md)",
      transition: "background-color var(--transition-hover)"
    },
    onMouseEnter: e => {
      e.currentTarget.style.background = "var(--fill-3)";
    },
    onMouseLeave: e => {
      e.currentTarget.style.background = "transparent";
    }
  }, /*#__PURE__*/React.createElement(Checkbox, {
    checked: task.done,
    onChange: () => onToggle(task.id),
    style: {
      minHeight: 0
    }
  }), /*#__PURE__*/React.createElement("span", {
    onClick: onOpen,
    style: {
      flex: "1 1 auto",
      minWidth: 0,
      font: "var(--type-ui)",
      color: task.done ? "var(--text-muted)" : "var(--text-primary)",
      textDecoration: task.done ? "line-through" : "none",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, task.title), task.project ? /*#__PURE__*/React.createElement(Chip, {
    style: {
      height: 22,
      flex: "none"
    },
    iconLeft: /*#__PURE__*/React.createElement(StatusDot, {
      tone: task.tone || "neutral"
    })
  }, task.project) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      display: "flex",
      alignItems: "center",
      gap: 8,
      flex: "none"
    }
  }, task.overdue ? /*#__PURE__*/React.createElement(Chip, {
    tone: "destructive",
    style: {
      height: 22
    }
  }, "Overdue") : null, task.time ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-meta)",
      color: "var(--text-quaternary)",
      fontVariantNumeric: "tabular-nums"
    }
  }, task.time) : null, /*#__PURE__*/React.createElement("span", {
    className: "reveal-on-hover",
    style: {
      position: "absolute",
      right: 6,
      top: 2,
      display: "flex",
      gap: 2,
      background: "var(--fill-3)",
      borderRadius: "var(--radius-md)"
    }
  }, /*#__PURE__*/React.createElement(Tooltip, {
    label: "Reschedule",
    side: "left"
  }, /*#__PURE__*/React.createElement(IconButton, {
    label: "Reschedule",
    variant: "ghost"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "clock",
    size: 14
  }))), /*#__PURE__*/React.createElement(IconButton, {
    label: "More",
    variant: "ghost"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "ellipsis",
    size: 14
  }))))));
}
Object.assign(window, {
  TaskRow
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/needt-app/TaskRow.jsx", error: String((e && e.message) || e) }); }

// ui_kits/needt-app/TasksScreen.jsx
try { (() => {
const {
  Card,
  SegmentedControl,
  Button,
  Icon,
  IconButton,
  EmptyState,
  SkeletonRows,
  DropdownMenu,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  Checkbox
} = window.NeedtDesignSystem_25d3c8;
function TasksScreen({
  tasks,
  onToggle,
  onOpen
}) {
  const [tab, setTab] = React.useState("inbox");
  const [loading, setLoading] = React.useState(false);
  function switchTab(v) {
    setTab(v);
    if (v === "done") {
      setLoading(true);
      window.setTimeout(() => setLoading(false), 600);
    }
  }
  const shown = tab === "done" ? tasks.filter(t => t.done) : tab === "later" ? [] : tasks.filter(t => !t.done);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHeader, {
    title: "Tasks",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(DropdownMenu, {
      align: "right",
      trigger: /*#__PURE__*/React.createElement(Button, {
        variant: "outline",
        iconLeft: /*#__PURE__*/React.createElement(Icon, {
          name: "sliders-horizontal",
          size: 16
        })
      }, "View")
    }, /*#__PURE__*/React.createElement(MenuLabel, null, "Group by"), /*#__PURE__*/React.createElement(MenuItem, {
      selected: true
    }, "Project"), /*#__PURE__*/React.createElement(MenuItem, null, "Due date"), /*#__PURE__*/React.createElement(MenuItem, null, "Priority"), /*#__PURE__*/React.createElement(MenuSeparator, null), /*#__PURE__*/React.createElement(MenuItem, {
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "eye",
        size: 14
      })
    }, "Show done")), /*#__PURE__*/React.createElement(Button, {
      variant: "accent",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "plus",
        size: 16
      }),
      onClick: onOpen
    }, "New task"))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 16,
      paddingBottom: 16,
      flex: "none"
    }
  }, /*#__PURE__*/React.createElement(SegmentedControl, {
    value: tab,
    onChange: switchTab,
    label: "Task filter",
    items: [{
      value: "inbox",
      label: "Inbox",
      count: 12
    }, {
      value: "today",
      label: "Today",
      count: 6
    }, {
      value: "later",
      label: "Later"
    }, {
      value: "done",
      label: "Done"
    }]
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Checkbox, {
    indeterminate: true,
    label: "Select all"
  }), /*#__PURE__*/React.createElement(IconButton, {
    label: "Sort"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-up-down",
    size: 16
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: 0,
      overflow: "auto"
    },
    className: "scroll-inner"
  }, /*#__PURE__*/React.createElement(Card, {
    padding: 11
  }, loading ? /*#__PURE__*/React.createElement(SkeletonRows, {
    count: 5
  }) : shown.length === 0 ? /*#__PURE__*/React.createElement(EmptyState, {
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "calendar-off",
      size: 24
    }),
    text: "Nothing scheduled for later. Tasks you defer land here with their date.",
    action: /*#__PURE__*/React.createElement(Button, {
      size: "sm",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "plus",
        size: 13
      }),
      onClick: onOpen
    }, "New task")
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 2
    }
  }, shown.map(t => /*#__PURE__*/React.createElement(TaskRow, {
    key: t.id,
    task: t,
    onToggle: onToggle,
    onOpen: onOpen
  }))))));
}
Object.assign(window, {
  TasksScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/needt-app/TasksScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/needt-app/TodayScreen.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  Card,
  CalendarStrip,
  CalendarDay,
  CalendarBlock,
  DayTimeline,
  FreeTime,
  Button,
  IconButton,
  Icon,
  FloatingAction,
  Chip,
  EmptyState,
  Tooltip
} = window.NeedtDesignSystem_25d3c8;
function PageHeader({
  title,
  meta,
  actions
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 16,
      height: 52,
      flex: "none"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: 11
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      font: "var(--type-page-title)",
      color: "var(--text-primary)"
    }
  }, title), meta ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-meta)",
      color: "var(--text-muted)"
    }
  }, meta) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: "auto",
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, actions));
}
const WEEK = [{
  weekday: "MON",
  date: 31,
  blocks: [{
    title: "Standup",
    time: "10:30"
  }]
}, {
  weekday: "TUE",
  date: 1,
  today: true,
  blocks: [{
    title: "Draft the launch brief",
    time: "09:00–10:30",
    movable: true,
    color: "var(--info)",
    priority: "high"
  }, {
    title: "Invoices",
    time: "yesterday",
    overdue: true
  }]
}, {
  weekday: "WED",
  date: 2,
  blocks: [{
    title: "Deep work",
    time: "09:00–11:00",
    movable: true,
    color: "var(--accent)"
  }, {
    title: "Review",
    time: "15:00",
    done: true
  }]
}, {
  weekday: "THU",
  date: 3,
  blocks: [{
    title: "1:1 Anna",
    time: "11:00"
  }]
}, {
  weekday: "FRI",
  date: 4,
  blocks: [{
    title: "German",
    time: "18:00",
    movable: true,
    color: "var(--success)"
  }]
}, {
  weekday: "SAT",
  date: 5,
  blocks: []
}, {
  weekday: "SUN",
  date: 6,
  blocks: []
}];

/* The day. Decimal hours; the timeline derives every position from them.
   `movable` colours the rail — the scheduler placed it and can move it again. */
const DAY = {
  start: 8,
  end: 19,
  now: 14.33,
  nowLabel: "14:20"
};
const PLACED = [{
  title: "Draft the launch brief",
  time: "09:00–10:30",
  start: 9,
  end: 10.5,
  movable: true,
  color: "var(--info)",
  priority: "high"
}, {
  title: "Standup",
  time: "10:30–10:45",
  start: 10.5,
  end: 10.75
}, {
  title: "Deep work — design system",
  time: "11:00–13:00",
  start: 11,
  end: 13,
  movable: true,
  color: "var(--accent)"
}, {
  title: "Lunch",
  time: "13:00–13:45",
  start: 13,
  end: 13.75
}, {
  title: "Send invoices for August",
  time: "14:00–14:30 · overdue",
  start: 14,
  end: 14.5,
  movable: true,
  overdue: true
}, {
  title: "1:1 Anna",
  time: "16:00–16:30",
  start: 16,
  end: 16.5
}, {
  title: "German — B2 unit 4",
  time: "18:00–19:00",
  start: 18,
  end: 19,
  movable: true,
  color: "var(--success)"
}];
function WeekStrip({
  selected,
  onSelect
}) {
  return /*#__PURE__*/React.createElement(CalendarStrip, null, WEEK.map(d => /*#__PURE__*/React.createElement(CalendarDay, {
    key: d.date,
    weekday: d.weekday,
    date: d.date,
    today: d.today,
    selected: selected === d.date,
    onClick: () => onSelect && onSelect(d.date),
    style: {
      flex: "1 1 0",
      minWidth: 96
    }
  }, d.blocks.map(b => /*#__PURE__*/React.createElement(CalendarBlock, _extends({
    key: b.title
  }, b))))));
}
function Legend() {
  return /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: "var(--type-meta)",
      color: "var(--text-muted)"
    }
  }, "Grey rail: fixed. Coloured rail: the scheduler placed it and can move it again.");
}

/* The one number the screen exists to answer, in the display serif rather than
   another 13px caption — and derived from the same items the timeline draws, so
   the headline and the visible gaps cannot disagree. */
function FreeTimeHeadline({
  free
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "nt-freetime"
  }, /*#__PURE__*/React.createElement("span", {
    className: "nt-freetime-value"
  }, free.left), /*#__PURE__*/React.createElement("span", {
    className: "nt-freetime-caption"
  }, "free left today \xB7 ", free.total, " in working hours"));
}
function TodayScreen({
  tasks,
  onToggle,
  onOpen,
  overlay
}) {
  const [selected, setSelected] = React.useState(1);
  const [placed, setPlaced] = React.useState(PLACED);
  /* Unplaced = not done, no time, and not already on the day. Without the last
     clause the overdue invoice sits in the timeline AND in the queue, and
     placing it draws the same task twice. */
  const [queue, setQueue] = React.useState(function () {
    const onDay = PLACED.map(b => b.title);
    return tasks.filter(t => !t.done && !t.time && onDay.indexOf(t.title) === -1).map(t => t.title);
  });
  const free = FreeTime(placed, DAY.start, DAY.end, DAY.now);

  /* Clicking a gap places the next unplaced task into it — 45 min, or the whole
     gap if it is shorter. The rail comes out coloured because the scheduler,
     not the user, chose the time. */
  function place(gap) {
    if (!queue.length) return;
    const title = queue[0];
    const len = Math.min(0.75, gap.end - gap.start);
    const hhmm = t => String(Math.floor(t)).padStart(2, "0") + ":" + String(Math.round(t % 1 * 60)).padStart(2, "0");
    setPlaced(list => list.concat([{
      title,
      time: hhmm(gap.start) + "–" + hhmm(gap.start + len),
      start: gap.start,
      end: gap.start + len,
      movable: true,
      color: "var(--accent)"
    }]));
    setQueue(q => q.slice(1));
  }
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHeader, {
    title: "Today",
    meta: "Tuesday, 1 September",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "outline",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "wand-sparkles",
        size: 16
      }),
      disabled: !queue.length,
      onClick: () => free.gaps.forEach(() => place(free.gaps[0]))
    }, "Plan my day"), /*#__PURE__*/React.createElement(Button, {
      variant: "accent",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "plus",
        size: 16
      }),
      onClick: onOpen
    }, "New task"))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 20,
      alignItems: "stretch",
      flex: "none",
      paddingBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: "none",
      width: 96,
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-start"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "display",
    style: {
      fontSize: 72,
      lineHeight: 0.9,
      color: "var(--text-primary)"
    }
  }, "01")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(WeekStrip, {
    selected: selected,
    onSelect: setSelected
  }), /*#__PURE__*/React.createElement(Legend, null))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "minmax(0,1fr) 300px",
      gap: 20,
      minHeight: 0,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: 0,
      overflow: "auto",
      paddingBottom: 20,
      paddingRight: 4
    },
    className: "scroll-inner"
  }, /*#__PURE__*/React.createElement(DayTimeline, {
    items: placed,
    dayStart: DAY.start,
    dayEnd: DAY.end,
    now: DAY.now,
    nowLabel: DAY.nowLabel,
    onPlace: queue.length ? place : undefined,
    onSelect: onOpen
  })), /*#__PURE__*/React.createElement("aside", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 16,
      minHeight: 0,
      paddingBottom: 60
    }
  }, /*#__PURE__*/React.createElement(FreeTimeHeadline, {
    free: free
  }), /*#__PURE__*/React.createElement(Card, {
    title: "Unplaced",
    count: queue.length,
    action: queue.length ? /*#__PURE__*/React.createElement(Chip, {
      tone: "accent"
    }, "Needs a slot") : null,
    style: {
      minHeight: 120,
      overflow: "hidden"
    }
  }, queue.length ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: "1 1 auto",
      minHeight: 0,
      display: "flex",
      flexDirection: "column",
      gap: 2,
      overflow: "auto"
    },
    className: "scroll-inner"
  }, queue.map(title => /*#__PURE__*/React.createElement("div", {
    key: title,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      minHeight: 32,
      padding: "0 6px",
      font: "var(--type-ui)",
      color: "var(--text-primary)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "nt-dot"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, title)))), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: "var(--type-meta)",
      color: "var(--text-muted)"
    }
  }, "Click a gap in the day to place the next one.")) : /*#__PURE__*/React.createElement(EmptyState, {
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "check",
      size: 24
    }),
    text: "Everything has a time. Nothing is waiting for a slot."
  })))), overlay ? null : /*#__PURE__*/React.createElement(FloatingAction, {
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "target",
      size: 16
    })
  }, "Focus"));
}
Object.assign(window, {
  TodayScreen,
  PageHeader,
  WeekStrip,
  Legend,
  FreeTimeHeadline,
  WEEK,
  DAY,
  PLACED
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/needt-app/TodayScreen.jsx", error: String((e && e.message) || e) }); }

__ds_ns.CalendarBlock = __ds_scope.CalendarBlock;

__ds_ns.CalendarDay = __ds_scope.CalendarDay;

__ds_ns.CalendarStrip = __ds_scope.CalendarStrip;

__ds_ns.FreeTime = __ds_scope.FreeTime;

__ds_ns.DayTimeline = __ds_scope.DayTimeline;

__ds_ns.FreeSlot = __ds_scope.FreeSlot;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.SegmentedControl = __ds_scope.SegmentedControl;

__ds_ns.Spinner = __ds_scope.Spinner;

__ds_ns.StatusDot = __ds_scope.StatusDot;

__ds_ns.ToggleGroup = __ds_scope.ToggleGroup;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.DatePicker = __ds_scope.DatePicker;

__ds_ns.FormRow = __ds_scope.FormRow;

__ds_ns.FormGroup = __ds_scope.FormGroup;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.RadioGroup = __ds_scope.RadioGroup;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.CommandBar = __ds_scope.CommandBar;

__ds_ns.NavRow = __ds_scope.NavRow;

__ds_ns.NavSection = __ds_scope.NavSection;

__ds_ns.ContextMenu = __ds_scope.ContextMenu;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.Menu = __ds_scope.Menu;

__ds_ns.MenuItem = __ds_scope.MenuItem;

__ds_ns.MenuLabel = __ds_scope.MenuLabel;

__ds_ns.MenuSeparator = __ds_scope.MenuSeparator;

__ds_ns.DropdownMenu = __ds_scope.DropdownMenu;

__ds_ns.Popover = __ds_scope.Popover;

__ds_ns.Tooltip = __ds_scope.Tooltip;

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.DocumentSheet = __ds_scope.DocumentSheet;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.SidebarHint = __ds_scope.SidebarHint;

__ds_ns.FloatingAction = __ds_scope.FloatingAction;

__ds_ns.Skeleton = __ds_scope.Skeleton;

__ds_ns.SkeletonRows = __ds_scope.SkeletonRows;

})();
