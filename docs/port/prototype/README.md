# Needt planner — UI kit

A click-through recreation of the product this design system is for: one
sidebar, four screens, three themes, every state reachable by clicking.

Open `index.html`. It links the design-system tokens and bundle from
`../_ds/needt-design-system-main-25d3c8e5-a812-464d-881f-e887b9adef4b/`, so the
kit must sit beside that folder.

## Files

| File | What it holds |
| --- | --- |
| `Data.jsx` | Every number on every screen: tasks, the day, the month's booked minutes, projects, stages, blockers, templates, and the `analyse()` that decides what is stuck. Field names follow `uploads/today-data.prisma`. |
| `Shared.jsx` | `PageHeader`, `DayBar` (the day's shape), `Legend`, `Rail`, `ProjectTag`. |
| `Sidebar.jsx` | Workspace switcher, command bar, quick capture, nav, the day's shape, what needs attention, projects, pinned docs, theme. |
| `TodayScreen.jsx` | The day as a document, Today / Week, the grid demoted to the rail. |
| `CalendarScreen.jsx` | Month (density) and Week (working view). No Day — Today is the day. |
| `WorkspaceScreen.jsx` | List, Kanban, Gantt over one project, built around what is stuck and why. |
| `DocsScreen.jsx` | Document library and the editor. |
| `Dialogs.jsx` | Task dialog, settings, command palette. |
| `needt-icons.js` | Host icon registry over `react-icons/lu`. Host code, not system code — extend it when a screen needs a new name. |

## The rules this kit is checked against

- **One label column.** `--form-label-w` is 105px and no form overrides it. A
  label that does not fit is shortened, never the column widened.
- **The rail means movability.** Grey fixed, project colour placed by the
  scheduler, red overdue. A blocked task is not movable, so it takes the grey
  rail — and the blocked popover says so at the point of decision.
- **Every derived number comes from `Data.jsx`.** Free time, unplaced counts,
  stuck counts and the month's load are computed from the items actually drawn,
  so no two surfaces can disagree.
- **Vertical space is content, not padding.** Each screen's content reaches the
  bottom of the canvas at 1440×900, or scrolls inside a surface that does.

## Motion

Two transitions and nothing else, per the system: `0.15s ease` on background,
box-shadow and colour for hover, press and reveal-on-hover; `0.25s ease` for the
theme crossfade. The switch knob translates on the same 0.15s. The only rotation
is the spinner, shown while the scheduler re-places tasks after a blocker
clears. No entrance animations, no stagger, no shimmer.
