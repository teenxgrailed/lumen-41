// Needt widget for Scriptable (iOS). Personal use.
// Needs a Needt personal API token (Keychain key: needt_token).
// Reads ONE endpoint: GET /api/connect/today. If it is not deployed yet
// (404), falls back to GET /api/connect/tasks + POST /api/mcp (needt_list)
// and hides the highlight and the exact habit state.
// Sizes: small, medium, large, lock screen (accessoryRectangular/Circular/Inline).
// Tap opens https://use.needt.app/today; in medium and large a task row opens
// that task (/tasks?task=ID).

const BASE = "https://use.needt.app";
const TODAY_URL = BASE + "/today";
const TOKEN_KEY = "needt_token";
const CACHE_FILE = "needt-widget-cache-v2.json";
const REFRESH_MINUTES = 15;

// theme: Needt ink on dark, paper on light. Every grey is the ink at a
// ladder alpha. Lavender marks now, progress and selection only; green marks
// done only.
const DARK = Device.isUsingDarkAppearance();
const BG = DARK ? "#141416" : "#F6F4EF";
const INK = DARK ? "#F2F2F4" : "#18181B";
const ACCENT = DARK ? "#B7A9F7" : "#7A68D8";
const DONE = DARK ? "#7ED6A0" : "#2F9E64";

function ink(alpha) {
  return new Color(INK, alpha);
}
function accent(alpha) {
  return new Color(ACCENT, alpha === undefined ? 1 : alpha);
}
const A1 = 1; // primary
const A2 = 0.62; // secondary
const A3 = 0.42; // captions
const A4 = 0.14; // tracks, unlit dots
const CARD = 0.07; // soft card fill

// Chrome type is 13/12; the sentences are display type.
function f13(b) {
  return b ? Font.semiboldSystemFont(13) : Font.systemFont(13);
}
function f12(b) {
  return b ? Font.semiboldSystemFont(12) : Font.systemFont(12);
}

// helpers
function pad(n) {
  return n < 10 ? "0" + n : "" + n;
}
function hhmm(d) {
  return pad(d.getHours()) + ":" + pad(d.getMinutes());
}
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d, n) {
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + n,
    d.getHours(),
    d.getMinutes()
  );
}
function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function minutesLabel(m) {
  if (!m || m <= 0) return "";
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  const r = m - h * 60;
  return r ? h + "h " + r + "m" : h + "h";
}
function shorten(s, n) {
  s = s || "";
  return s.length > n ? s.slice(0, Math.max(1, n - 1)).trim() + "…" : s;
}
function isEmoji(s) {
  return !!s && s.length <= 8 && !/^[A-Za-z0-9_\- ]+$/.test(s);
}

// token
function readToken() {
  try {
    return Keychain.contains(TOKEN_KEY) ? Keychain.get(TOKEN_KEY) : null;
  } catch {
    return null;
  }
}

async function askToken(message) {
  const alert = new Alert();
  alert.title = "Needt token";
  alert.message = message;
  alert.addSecureTextField("needt_...", "");
  alert.addAction("Save");
  alert.addCancelAction("Cancel");
  const choice = await alert.present();
  if (choice === -1) return null;
  const value = alert.textFieldValue(0).trim();
  if (!value) return null;
  Keychain.set(TOKEN_KEY, value);
  return value;
}

// network
async function api(path, token, body) {
  const request = new Request(BASE + path);
  request.method = body ? "POST" : "GET";
  request.headers = {
    Authorization: "Bearer " + token,
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
  };
  request.timeoutInterval = 15;
  if (body) request.body = JSON.stringify(body);
  let json = null;
  try {
    json = await request.loadJSON();
  } catch (e) {
    // A non-JSON body (an HTML 404) still has a status worth reading.
    if (!request.response) throw e;
  }
  const status = request.response ? request.response.statusCode : 0;
  if (status === 401 || status === 403) {
    const error = new Error("auth");
    error.auth = true;
    throw error;
  }
  if (status >= 400 || status === 0 || json === null)
    throw new Error("HTTP " + status);
  return json;
}

async function mcp(token, name, args) {
  const json = await api("/api/mcp", token, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: name, arguments: args },
  });
  if (json.error) throw new Error(json.error.message || "mcp");
  const result = json.result;
  const text =
    result && result.content && result.content[0] && result.content[0].text;
  if (!text || result.isError) throw new Error("tool");
  return JSON.parse(text);
}

// data: the old endpoints, folded into the shape /api/connect/today answers.
// Highlight, exact habit state, free time, personal time and weather are
// unknown here (null), and the layouts leave them out.
async function fetchLegacy(token, now) {
  const [tasksRes, eventsRes, habitsRes] = await Promise.all([
    api("/api/connect/tasks", token),
    mcp(token, "needt_list", {
      type: "event",
      from: now.toISOString(),
      to: addDays(now, 3).toISOString(),
      limit: 30,
    }).catch(function () {
      return null;
    }),
    mcp(token, "needt_list", { type: "habit", limit: 50 }).catch(function () {
      return null;
    }),
  ]);
  const sod = startOfDay(now);
  const eod = addDays(sod, 1);
  function inToday(d) {
    return d && d >= sod && d < eod;
  }
  const open = [];
  let done = 0;
  (tasksRes.tasks || []).forEach(function (t) {
    if (t.habitId) return;
    if (t.status === "completed") {
      if (inToday(parseDate(t.completedAt))) done++;
      return;
    }
    const blocks = (t.scheduledBlocks || [])
      .map(function (b) {
        return { start: parseDate(b.start), end: parseDate(b.end) };
      })
      .filter(function (b) {
        return inToday(b.start);
      });
    let start = blocks.length ? blocks[0].start : null;
    let end = blocks.length ? blocks[blocks.length - 1].end : null;
    if (!start && inToday(parseDate(t.scheduledStart))) {
      start = parseDate(t.scheduledStart);
      end = parseDate(t.scheduledEnd);
    }
    const due = parseDate(t.dueDate || t.deadline);
    if (!start && !(due && due < eod)) return;
    open.push({
      id: t.id,
      title: t.title,
      start: start ? start.toISOString() : null,
      end: end ? end.toISOString() : null,
      durationMinutes: t.estimatedMinutes || t.duration || null,
      due: due ? due.toISOString() : null,
      overdue: !!(due && due < sod),
      href: "/tasks?task=" + encodeURIComponent(t.id),
    });
  });
  open.sort(function (a, b) {
    const ta = parseDate(a.start || a.due);
    const tb = parseDate(b.start || b.due);
    return (ta ? ta.getTime() : 0) - (tb ? tb.getTime() : 0);
  });
  const events = eventsRes
    ? (eventsRes.items || []).filter(function (e) {
        return (
          e.status !== "cancelled" && parseDate(e.end) && parseDate(e.end) > now
        );
      })
    : [];
  events.sort(function (a, b) {
    return parseDate(a.start) - parseDate(b.start);
  });
  const ev =
    events.filter(function (e) {
      return !e.allDay;
    })[0] || events[0];
  const weekday = now.getDay();
  const habits = habitsRes
    ? (habitsRes.items || [])
        .filter(function (h) {
          return h.isActive !== false;
        })
        .map(function (h) {
          const days = h.daysOfWeek || [];
          return {
            id: h.id,
            title: h.title,
            icon: h.icon || null,
            doneToday: null,
            week: null,
            scheduledToday: !days.length || days.indexOf(weekday) !== -1,
          };
        })
    : [];
  return {
    legacy: true,
    generatedAt: now.toISOString(),
    counts: { open: open.length, done: done, total: open.length + done },
    next: open[0] || null,
    tasks: open.slice(0, 6),
    highlight: null,
    habits: habits,
    event: ev
      ? {
          title: ev.title,
          start: ev.start,
          end: ev.end,
          location: ev.location || null,
          allDay: !!ev.allDay,
        }
      : null,
    personalBlock: null,
    freeMinutes: null,
    workLeftMinutes: null,
    weather: null,
  };
}

async function fetchFresh(token) {
  const now = new Date();
  try {
    const data = await api("/api/connect/today", token);
    data.legacy = false;
    data.fetchedAt = now.toISOString();
    return data;
  } catch (error) {
    // Not deployed yet (404/405): use the old endpoints. Anything else
    // (auth, network, 5xx) is not a reason to switch.
    if (error && !error.auth && /HTTP (404|405)/.test(error.message || "")) {
      const data = await fetchLegacy(token, now);
      data.fetchedAt = now.toISOString();
      return data;
    }
    throw error;
  }
}

function cachePath() {
  const fm = FileManager.local();
  return { fm: fm, path: fm.joinPath(fm.documentsDirectory(), CACHE_FILE) };
}
function readCache() {
  try {
    const c = cachePath();
    if (!c.fm.fileExists(c.path)) return null;
    return JSON.parse(c.fm.readString(c.path));
  } catch {
    return null;
  }
}
function writeCache(data) {
  try {
    const c = cachePath();
    c.fm.writeString(c.path, JSON.stringify(data));
  } catch {
    // The cache is a convenience.
  }
}

// Fresh data when the network answers, else the last cache (stale = true).
async function load(token) {
  const cached = readCache();
  try {
    const data = await fetchFresh(token);
    writeCache(data);
    return { data: data, stale: false };
  } catch (error) {
    if (error && error.auth)
      return { error: "auth", data: cached, stale: true };
    if (cached) return { data: cached, stale: true };
    return { error: "network", data: null, stale: true };
  }
}

// view: what the widgets draw, derived at render time so a cached payload
// still moves "next" forward as the day passes.
function buildView(data, now) {
  const tasks = (data.tasks || []).map(function (t) {
    return {
      id: t.id,
      title: t.title,
      start: parseDate(t.start),
      end: parseDate(t.end),
      minutes: t.durationMinutes || null,
      overdue: !!t.overdue,
      href: t.href || "/tasks?task=" + encodeURIComponent(t.id),
    };
  });
  // Running or upcoming slots, then untimed, then slots already past.
  function rank(t) {
    if (t.start && (t.end || t.start) >= now) return 0;
    return t.start ? 2 : 1;
  }
  const ordered = tasks.slice().sort(function (a, b) {
    const d = rank(a) - rank(b);
    if (d) return d;
    return (
      (a.start ? a.start.getTime() : 0) - (b.start ? b.start.getTime() : 0)
    );
  });
  const counts = data.counts || {
    open: ordered.length,
    done: 0,
    total: ordered.length,
  };
  const h = data.highlight;
  const highlight = h
    ? {
        id: h.taskId,
        title: h.title,
        done: !!h.done,
        start: parseDate(h.start),
        end: parseDate(h.end),
        minutes: h.durationMinutes || null,
        href: h.href || "/tasks?task=" + encodeURIComponent(h.taskId),
      }
    : null;
  const habits = (data.habits || [])
    .slice()
    .sort(function (a, b) {
      return (b.scheduledToday ? 1 : 0) - (a.scheduledToday ? 1 : 0);
    })
    .map(function (x) {
      return {
        title: x.title,
        icon: isEmoji(x.icon)
          ? x.icon
          : (x.title || "•").slice(0, 1).toUpperCase(),
        done:
          x.doneToday === null || x.doneToday === undefined
            ? null
            : !!x.doneToday,
        week: x.week ? x.week.done + "/" + x.week.target : null,
      };
    });
  const e = data.event;
  const event =
    e && parseDate(e.end) && parseDate(e.end) > now
      ? {
          title: e.title,
          start: parseDate(e.start),
          allDay: !!e.allDay,
          location: e.location,
        }
      : null;
  const b = data.personalBlock;
  const band =
    b && parseDate(b.end) && parseDate(b.end) > now
      ? { title: b.title, emoji: b.emoji || "•", start: parseDate(b.start) }
      : null;
  const w = data.weather;
  return {
    open: counts.open,
    done: counts.done,
    total: counts.total,
    next: ordered[0] || null,
    tasks: ordered,
    highlight: highlight,
    habits: habits,
    event: event,
    band: band,
    freeMinutes: typeof data.freeMinutes === "number" ? data.freeMinutes : null,
    workLeft:
      typeof data.workLeftMinutes === "number" ? data.workLeftMinutes : null,
    weather: w && w.line ? w.line : null,
  };
}

function nextTime(view) {
  return view.next && view.next.start ? hhmm(view.next.start) : null;
}
function slotLabel(t) {
  if (!t) return "";
  if (t.start) return hhmm(t.start);
  return t.overdue ? "late" : "";
}

// drawing
function newContext(w, h) {
  const dc = new DrawContext();
  dc.size = new Size(w, h);
  dc.opaque = false;
  dc.respectScreenScale = true;
  return dc;
}

// A thin bar with a soft glow under the fill.
function barImage(fraction, width, color) {
  const h = 6;
  const dc = newContext(width, h + 6);
  const y = 3;
  const track = new Path();
  track.addRoundedRect(new Rect(0, y, width, h), h / 2, h / 2);
  dc.addPath(track);
  dc.setFillColor(ink(A4));
  dc.fillPath();
  if (fraction > 0) {
    const len = Math.max(h, width * Math.min(1, fraction));
    const glow = new Path();
    glow.addRoundedRect(
      new Rect(0, y - 2, len, h + 4),
      (h + 4) / 2,
      (h + 4) / 2
    );
    dc.addPath(glow);
    dc.setFillColor(new Color(color || ACCENT, 0.25));
    dc.fillPath();
    const fill = new Path();
    fill.addRoundedRect(new Rect(0, y, len, h), h / 2, h / 2);
    dc.addPath(fill);
    dc.setFillColor(new Color(color || ACCENT));
    dc.fillPath();
  }
  return dc.getImage();
}
function addBar(parent, fraction, width, color) {
  const img = parent.addImage(barImage(fraction, width, color));
  img.imageSize = new Size(width, 12);
  return img;
}

// 5x7 dot-matrix glyphs: "1" is a lit dot.
const GLYPHS = {
  0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  5: ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  6: ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  ":": ["0", "0", "1", "0", "1", "0", "0"],
  "-": ["000", "000", "000", "111", "000", "000", "000"],
};

function dotMatrixSize(text, pitch) {
  let cols = 0;
  for (let i = 0; i < text.length; i++)
    cols += GLYPHS[text[i]][0].length + (i ? 1 : 0);
  return new Size(cols * pitch, 7 * pitch);
}

// The time as an LED display, drawn with DrawContext: lit dots in lavender
// with a soft glow, unlit dots as faint ink.
function dotMatrixImage(text, pitch, lit) {
  const size = dotMatrixSize(text, pitch);
  const dc = newContext(size.width, size.height);
  const r = pitch * 0.36;
  let col = 0;
  for (let i = 0; i < text.length; i++) {
    const g = GLYPHS[text[i]];
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < g[y].length; x++) {
        const cx = (col + x) * pitch + pitch / 2;
        const cy = y * pitch + pitch / 2;
        const on = g[y][x] === "1";
        if (on && lit) {
          dc.setFillColor(accent(0.22));
          dc.fillEllipse(
            new Rect(cx - r * 1.9, cy - r * 1.9, r * 3.8, r * 3.8)
          );
          dc.setFillColor(accent(1));
        } else {
          dc.setFillColor(ink(on ? A3 : 0.1));
        }
        dc.fillEllipse(new Rect(cx - r, cy - r, r * 2, r * 2));
      }
    }
    col += g[0].length + 1;
  }
  return dc.getImage();
}
function addDots(parent, hhmmText, pitch) {
  const text = hhmmText || "--:--";
  const img = parent.addImage(dotMatrixImage(text, pitch, !!hhmmText));
  img.imageSize = dotMatrixSize(text, pitch);
  return img;
}

// done/total as a ring with a centre label, for the lock screen.
function ringImage(done, total) {
  const s = 64;
  const dc = newContext(s, s);
  const c = s / 2;
  const r = 24;
  function arc(from, to, color, width) {
    const path = new Path();
    const steps = Math.max(2, Math.ceil(Math.abs(to - from) / (Math.PI / 30)));
    for (let i = 0; i <= steps; i++) {
      const a = from + ((to - from) * i) / steps;
      const p = new Point(c + r * Math.cos(a), c + r * Math.sin(a));
      if (i === 0) path.move(p);
      else path.addLine(p);
    }
    dc.addPath(path);
    dc.setStrokeColor(color);
    dc.setLineWidth(width);
    dc.strokePath();
  }
  const top = -Math.PI / 2;
  arc(top, top + Math.PI * 2 - 0.001, new Color("#FFFFFF", 0.3), 6);
  if (total > 0 && done > 0)
    arc(
      top,
      top + Math.PI * 2 * Math.min(1, done / total) - 0.001,
      new Color("#FFFFFF", 1),
      6
    );
  dc.setFont(Font.semiboldSystemFont(15));
  dc.setTextColor(new Color("#FFFFFF"));
  dc.setTextAlignedCenter();
  dc.drawTextInRect(done + "/" + total, new Rect(0, c - 9, s, 20));
  return dc.getImage();
}

// text: a sentence is lines of [text, kind]: "k" key word (full ink, bold),
// "m" quiet (secondary, medium), "a" lavender mark, "g" done green.
function sentence(parent, lines, size, trailing) {
  lines.forEach(function (line, index) {
    const row = parent.addStack();
    row.layoutHorizontally();
    row.bottomAlignContent();
    line.forEach(function (seg) {
      const t = row.addText(seg[0]);
      const kind = seg[1];
      t.font =
        kind === "m" ? Font.mediumSystemFont(size) : Font.boldSystemFont(size);
      t.textColor =
        kind === "k"
          ? ink(A1)
          : kind === "a"
            ? accent()
            : kind === "g"
              ? new Color(DONE)
              : ink(0.5);
      t.lineLimit = 1;
      t.minimumScaleFactor = 0.7;
    });
    if (index === 0 && trailing) {
      row.addSpacer();
      trailing(row);
    }
  });
}

function addText(parent, text, size, bold, alpha, lines) {
  const t = parent.addText(text);
  t.font = size === 13 ? f13(bold) : f12(bold);
  t.textColor = ink(alpha);
  if (lines) t.lineLimit = lines;
  return t;
}

function offlineMark(stale, fetchedAt) {
  if (!stale) return null;
  const at = parseDate(fetchedAt);
  return function (row) {
    addText(row, "offline" + (at ? " " + hhmm(at) : ""), 12, false, A3);
  };
}

function countLines(view) {
  if (view.total === 0) return [[["Nothing", "k"]], [["planned.", "m"]]];
  if (view.open === 0) return [[["All", "k"]], [["done.", "g"]]];
  return [
    [
      [String(view.open), "k"],
      [" left", "m"],
    ],
    [["today.", "m"]],
  ];
}

function pill(parent, parts, tone) {
  const s = parent.addStack();
  s.layoutHorizontally();
  s.centerAlignContent();
  s.setPadding(4, 8, 4, 8);
  s.cornerRadius = 10;
  s.backgroundColor = tone === "accent" ? accent(0.18) : ink(CARD + 0.03);
  parts.forEach(function (p, i) {
    if (i) s.addSpacer(4);
    const t = s.addText(p[0]);
    t.font = f12(false);
    t.textColor =
      p[1] === "done"
        ? new Color(DONE)
        : p[1] === "accent"
          ? accent()
          : ink(p[2] === undefined ? A1 : p[2]);
    t.lineLimit = 1;
  });
  return s;
}

function habitPill(parent, h) {
  const parts = [[h.icon, null, A1]];
  if (h.done === true) parts.push(["✓", "done"]);
  if (h.week) parts.push([h.week, null, h.done ? A1 : A2]);
  return pill(parent, parts);
}

// widgets
function baseWidget(padding) {
  const w = new ListWidget();
  w.backgroundColor = new Color(BG);
  w.url = TODAY_URL;
  w.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60 * 1000);
  const p = padding === undefined ? 16 : padding;
  w.setPadding(p, p, p, p);
  return w;
}

function messageWidget(family, text) {
  const w = baseWidget();
  if (family && family.indexOf("accessory") === 0) {
    w.addText("Needt").font = f12(true);
    addText(w, text, 12, false, A1, 3);
    return w;
  }
  addText(w, "Needt", 13, true, A1);
  w.addSpacer(4);
  addText(w, text, 12, false, A2, 6);
  return w;
}

function buildSmall(view, stale, fetchedAt) {
  const w = baseWidget();
  sentence(w, countLines(view), 26, offlineMark(stale, fetchedAt));
  w.addSpacer();
  if (view.next) {
    const cap = w.addStack();
    cap.layoutHorizontally();
    addText(cap, "Next · ", 12, false, A3);
    const t = addText(cap, shorten(view.next.title, 16), 12, true, A1, 1);
    t.minimumScaleFactor = 0.8;
    cap.addSpacer();
  } else {
    addText(
      w,
      view.total && !view.open ? "Day closed" : "Nothing next",
      12,
      false,
      A3
    );
  }
  w.addSpacer(6);
  addDots(w, nextTime(view), 4.4);
  return w;
}

function leftColumn(parent, view) {
  const hl = view.highlight && !view.highlight.done ? view.highlight : null;
  const item = hl || view.next;
  const col = parent.addStack();
  col.layoutVertically();
  if (!item) {
    sentence(col, countLines(view), 22);
    return col;
  }
  addText(col, hl ? "★ Highlight" : "Next up", 12, false, A3);
  col.addSpacer(4);
  const t = col.addText(item.title);
  t.font = Font.boldSystemFont(19);
  t.textColor = ink(A1);
  t.lineLimit = 3;
  t.minimumScaleFactor = 0.8;
  col.addSpacer(8);
  const parts = [
    [
      item.start ? hhmm(item.start) : item.overdue ? "late" : "any time",
      "accent",
      A1,
    ],
  ];
  if (item.minutes) parts.push([minutesLabel(item.minutes), null, A2]);
  pill(col, parts, "accent");
  return col;
}

function buildMedium(view, stale, fetchedAt) {
  const w = baseWidget();
  const row = w.addStack();
  row.layoutHorizontally();
  const left = leftColumn(row, view);
  left.size = new Size(160, 0);
  row.addSpacer(12);

  const card = row.addStack();
  card.layoutVertically();
  card.setPadding(10, 10, 10, 10);
  card.cornerRadius = 18;
  card.backgroundColor = ink(CARD);
  const habits = view.habits.slice(0, 6);
  if (habits.length) {
    for (let i = 0; i < habits.length; i += 2) {
      const line = card.addStack();
      line.layoutHorizontally();
      habitPill(line, habits[i]);
      if (habits[i + 1]) {
        line.addSpacer(4);
        habitPill(line, habits[i + 1]);
      }
      card.addSpacer(4);
    }
  } else if (view.event) {
    addText(card, "Next event", 12, false, A3);
    addText(
      card,
      hhmm(view.event.start) + " " + shorten(view.event.title, 14),
      12,
      true,
      A1,
      2
    );
  } else {
    addText(card, view.weather || "No habits", 12, false, A3, 3);
  }
  card.addSpacer();
  if (view.freeMinutes !== null && view.workLeft) {
    addBar(card, view.freeMinutes / view.workLeft, 100);
    addText(
      card,
      view.freeMinutes
        ? minutesLabel(view.freeMinutes) + " free"
        : "no free time",
      12,
      false,
      A2,
      1
    );
  } else {
    addText(card, view.done + "/" + view.total + " done", 12, false, A2, 1);
  }
  if (stale) {
    const at = parseDate(fetchedAt);
    addText(card, "offline" + (at ? " " + hhmm(at) : ""), 12, false, A3, 1);
  }
  return w;
}

function taskRow(parent, t, view, size) {
  const row = parent.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  row.url = BASE + t.href;
  const mark = row.addText(
    view.highlight && view.highlight.id === t.id ? "●" : " "
  );
  mark.font = f12(false);
  mark.textColor = accent();
  row.addSpacer(4);
  const time = row.addText(slotLabel(t) || "—");
  time.font = f12(false);
  time.textColor = ink(A3);
  row.addSpacer(8);
  const title = row.addText(t.title);
  title.font = size;
  title.textColor = ink(A1);
  title.lineLimit = 1;
  row.addSpacer();
  if (t.minutes) {
    const m = row.addText(minutesLabel(t.minutes));
    m.font = f12(false);
    m.textColor = ink(A3);
  }
  return row;
}

function buildLarge(view, stale, fetchedAt) {
  const w = baseWidget();

  // Header: the sentence on the left, the next time as dots on the right.
  const head = w.addStack();
  head.layoutHorizontally();
  head.topAlignContent();
  const sentenceBox = head.addStack();
  sentenceBox.layoutVertically();
  sentence(sentenceBox, countLines(view), 28);
  head.addSpacer();
  const right = head.addStack();
  right.layoutVertically();
  addDots(right, nextTime(view), 5);
  right.addSpacer(4);
  const cap = view.next ? shorten(view.next.title, 20) : "nothing next";
  addText(right, cap, 12, false, A2, 1);

  w.addSpacer(8);
  const meta = w.addStack();
  meta.layoutHorizontally();
  meta.centerAlignContent();
  addText(meta, view.done + " of " + view.total + " done", 12, false, A2);
  meta.addSpacer();
  if (stale) {
    const at = parseDate(fetchedAt);
    addText(meta, "offline" + (at ? " " + hhmm(at) : ""), 12, false, A3);
  } else if (view.weather) {
    addText(meta, shorten(view.weather, 30), 12, false, A2, 1);
  }
  w.addSpacer(2);
  addBar(w, view.total ? view.done / view.total : 0, 297);
  w.addSpacer(6);

  // Tasks in a soft card.
  const crowded =
    view.habits.length && (view.event || view.band) && view.weather;
  const rows = view.tasks.slice(0, crowded ? 4 : 5);
  const card = w.addStack();
  card.layoutVertically();
  card.setPadding(10, 12, 10, 12);
  card.cornerRadius = 18;
  card.backgroundColor = ink(CARD);
  if (!rows.length)
    addText(
      card,
      view.total ? "Everything for today is done" : "Nothing planned for today",
      12,
      false,
      A3
    );
  rows.forEach(function (t, i) {
    if (i) card.addSpacer(5);
    taskRow(card, t, view, f13(false));
  });

  w.addSpacer();
  if (view.habits.length) {
    const hrow = w.addStack();
    hrow.layoutHorizontally();
    view.habits.slice(0, 5).forEach(function (h, i) {
      if (i) hrow.addSpacer(4);
      habitPill(hrow, h);
    });
    hrow.addSpacer();
    w.addSpacer(6);
  }
  const chips = w.addStack();
  chips.layoutHorizontally();
  let any = false;
  if (view.event) {
    pill(chips, [
      ["📅", null, A1],
      [hhmm(view.event.start), "accent"],
      [shorten(view.event.title, 14), null, A1],
    ]);
    any = true;
  }
  if (view.band) {
    if (any) chips.addSpacer(4);
    pill(chips, [
      [view.band.emoji, null, A1],
      [shorten(view.band.title, 10), null, A1],
      [hhmm(view.band.start), null, A2],
    ]);
    any = true;
  }
  if (view.freeMinutes !== null && view.freeMinutes > 0) {
    if (any) chips.addSpacer(4);
    pill(chips, [[minutesLabel(view.freeMinutes) + " free", null, A2]]);
    any = true;
  }
  chips.addSpacer();
  if (stale && view.weather) {
    // The offline mark took the weather's slot in the header; keep it here.
    w.addSpacer(4);
    addText(w, shorten(view.weather, 40), 12, false, A3, 1);
  }
  return w;
}

function buildAccessory(family, view) {
  const w = new ListWidget();
  w.url = TODAY_URL;
  w.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60 * 1000);
  if (family === "accessoryInline") {
    const time = nextTime(view);
    w.addText(
      view.next
        ? "Next · " + (time ? time + " " : "") + view.next.title
        : view.done + "/" + view.total + " done"
    );
    return w;
  }
  if (family === "accessoryCircular") {
    const img = w.addImage(ringImage(view.done, view.total));
    img.imageSize = new Size(48, 48);
    return w;
  }
  // accessoryRectangular: the next task and its time.
  if (view.next) {
    const title = w.addText(view.next.title);
    title.font = Font.semiboldSystemFont(13);
    title.lineLimit = 2;
    w.addSpacer(2);
    const label =
      (nextTime(view) || "any time") +
      (view.next.minutes ? " · " + minutesLabel(view.next.minutes) : "");
    const when = w.addText(label);
    when.font = Font.systemFont(12);
    when.textOpacity = 0.7;
    when.lineLimit = 1;
  } else {
    const t = w.addText(view.total ? "All done" : "Nothing planned");
    t.font = Font.semiboldSystemFont(13);
    const d = w.addText(view.done + "/" + view.total + " done");
    d.font = Font.systemFont(12);
    d.textOpacity = 0.7;
  }
  return w;
}

function render(family, result) {
  if (!result.data) {
    return messageWidget(
      family,
      result.error === "auth"
        ? "Token rejected. Open Scriptable and run this script to enter a new one."
        : "No data yet. Check the connection."
    );
  }
  const view = buildView(result.data, new Date());
  const at = result.data.fetchedAt;
  if (family && family.indexOf("accessory") === 0)
    return buildAccessory(family, view);
  if (family === "large" || family === "extraLarge")
    return buildLarge(view, result.stale, at);
  if (family === "medium") return buildMedium(view, result.stale, at);
  return buildSmall(view, result.stale, at);
}

// main
async function main() {
  let token = readToken();

  if (!token) {
    if (config.runsInWidget) {
      Script.setWidget(
        messageWidget(
          config.widgetFamily,
          "Open Scriptable, run this script once and enter your Needt token."
        )
      );
      Script.complete();
      return;
    }
    token = await askToken(
      "Paste your Needt personal API token (Needt > Connections > AI tools > Needt API)."
    );
    if (!token) {
      Script.complete();
      return;
    }
  }

  const result = await load(token);

  if (config.runsInWidget) {
    Script.setWidget(render(config.widgetFamily || "medium", result));
    Script.complete();
    return;
  }

  // Run inside the Scriptable app: preview, or change the token.
  if (result.error === "auth") {
    const fresh = await askToken(
      "Needt rejected the saved token. Paste a new one."
    );
    if (fresh) {
      const again = await load(fresh);
      await render("medium", again).presentMedium();
    }
    Script.complete();
    return;
  }
  const menu = new Alert();
  menu.title = "Needt widget";
  menu.addAction("Preview small");
  menu.addAction("Preview medium");
  menu.addAction("Preview large");
  menu.addAction("Change token");
  menu.addCancelAction("Close");
  const choice = await menu.present();
  if (choice === 0) await render("small", result).presentSmall();
  else if (choice === 1) await render("medium", result).presentMedium();
  else if (choice === 2) await render("large", result).presentLarge();
  else if (choice === 3)
    await askToken("Paste the new Needt personal API token.");
  Script.complete();
}

await main();
