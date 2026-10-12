/* PHONE MENU — what the live phone's menu A reads (08.10.26).
 *
 * The live phone is mobile-v2-plates.jsx's V2pLivePhone (mobile-dev.html →
 * mobile.html); it draws menu A (nav-a.jsx, window.NeedtNavA) over the
 * Plates screens and takes mnTiles / mnCounts from here. The old playground
 * (mobile-nav.html with the legacy MobileApp under the menu) is in
 * _archive/mobile-nav.legacy.*; mobile-nav.html now redirects to the phone.
 *
 * Menu contract — window.NeedtNavA:
 *   { theme: "light"|"dark", screen, onScreen(id), tiles: [3 ids], counts,
 *     onCompose(), frameEl, onTheme(v), onUpgrade(), onSignOut(), away }
 * drawn absolutely over the phone's screen box (inset: 0). Screen ids are the
 * phone's: home, calendar, tasks, docs, mail, habits, moodboards, projects,
 * templates, shared, trash, connections, plus "ask" (opens the Ask sheet over
 * the current screen; settings stays inside the menu). away = a full-screen
 * layer is up (Ask, the paywall, a place's cover), the menu gets out of the
 * way.
 */
/* needtSettings speaks the desktop's place ids (sidebar-kit SK_PLACES), plus
   "ask" from the phone setup's menu step. */
const MN_FROM_PLACE = { today: "home", home: "home", calendar: "calendar", tasks: "tasks", docs: "docs", mail: "mail", habits: "habits", moodboards: "moodboards", boards: "moodboards",
  projects: "projects", templates: "templates", shared: "shared", trash: "trash", connections: "connections", ask: "ask" };

/* Top three: needtSettings.mobileTiles (the phone onboarding / Settings →
   Menu; the phone's mbPrefStore keeps a copy), else Home · Docs · Ask Needt
   (owner, 09.10.26 — the phone's own default, not the desktop rail's). */
const MN_DEFAULT_TILES = ["home", "docs", "ask"];
function mnTiles() {
  const S = window.needtSettings;
  const read = (k) => (S && S.has && S.has(k) && Array.isArray(S.get(k)) ? S.get(k) : null);
  const pick = (l) => {
    const out = [];
    (l || []).forEach((id) => { const m = MN_FROM_PLACE[id]; if (m && out.indexOf(m) < 0) out.push(m); });
    return out.length >= 3 ? out.slice(0, 3) : null;
  };
  const pref = window.mbPrefStore ? (window.mbPrefStore.get() || {}).mobileTiles : null;
  return pick(read("mobileTiles")) || pick(pref) || MN_DEFAULT_TILES.slice();
}

/* Live where the stores have it, mock where a prototype has nothing to read. */
function mnCounts(info) {
  const all = window.mbTaskStore ? window.mbTaskStore.get() : window.NEEDT.tasks || [];
  const tasks = all.filter((t) => !t.trashedAt);
  const open = tasks.filter((t) => !t.done);
  const today = open.filter((t) => !t.overdue && !t.noSlot && window.NEEDT.dueDay && window.NEEDT.dueDay(t) === 1);
  let habitsDone = 2, habitsN = 4;
  try {
    const hl = window.NEEDT.liveHabits((window.habitStore && window.habitStore.get()) || []);
    if (hl.length) habitsN = hl.length;
  } catch (e) { /* no habits store */ }
  let boards = 5;
  try { const l = JSON.parse(localStorage.getItem("needt.boards")); if (Array.isArray(l)) boards = l.filter((b) => !b.trashedAt).length; } catch (e) { /* none */ }
  const projects = (window.NEEDT.projects || []).length || 6;
  return {
    mail: info.unread != null ? info.unread : 2,
    overdue: info.overdue != null ? info.overdue : 3,
    unplaced: info.unplaced || 0,
    open: open.length,
    today: today.length,
    nextEvent: { title: "Design review", at: "14:00", inMin: 42 },
    docsEdited: "5 min ago",
    docs: 9,
    habitsDone: Math.min(habitsDone, habitsN),
    habits: habitsN,
    boards: boards,
    projects: projects,
    synced: "5 min ago",
    trash: all.length - tasks.length,
    outlookDown: !!info.outlookDown
  };
}

Object.assign(window, { mnTiles, mnCounts, MN_DEFAULT_TILES });
