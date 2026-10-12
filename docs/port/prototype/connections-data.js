/* connections-data.js — the Connections catalogue and its pure helpers
 * (09.10.26), one copy for the desktop (connections.jsx) and the phone
 * (phone-places.jsx). Plain script, no JSX: data + functions on window.cnData.
 * Loaded by index-dev.html and mobile-dev.html before the screens.
 *
 *   CN_APPS / CN_AI / CN_CHIPS / CN_TABS   what each tab lists, chip order
 *   CN_META[id]   { label, cat, kind, alias, account, lost, gives, scopes,
 *                   reads, never, beta, ai, tile }
 *   cnHay(id)     search haystack (name, kind, one-liner, aliases, chip)
 *   cnLabel(id)   the name of any account id
 *   cnByeText(id) what Disconnect ends (the confirm's body)
 *   cnReadSync / cnWriteSync   "needt.connections.sync" (last synced labels)
 *   cnKey.get / cnKey.make     the API key for MCP clients ("needt.mcp.key")
 *   cnStepData(id, apiKey)     the setup guide per AI tool: [{ t, x }]
 *       t: text with **bold** and `path` marks (cnRich draws them)
 *       x: null | "url" | { code, copy } | "key"
 *   CN_SCOPES / CN_PERMS / CN_ACCESS / CN_LINK_KINDS   MCP / API connections
 *       (stores: window.mcpLinks / window.apiLinks in stores.jsx)
 *   cnOpt, cnProjects, cnScopeText, cnAutoName, cnUrlShort, cnMade,
 *   cnBundle, cnDownload
 *   CN_FREE_MAIL, cnIsMail, cnProFeature   the Free plan's limits
 *   CN_CHECK_MS, cnCheckFails()   "Check connection" (needtStates mcp)
 *   cnClip(text)  copy to the clipboard (no toast — the caller says it)
 */
(function () {
  var CN_MCP_URL = "https://mcp.needt.app/u/maksym";
  var CN_TABS = [["apps", "Apps & services"], ["ai", "AI tools"]];
  var CN_APPS = ["gmail", "outlook", "icloudmail", "protonmail", "fastmail", "slack", "telegram", "discord",
    "gcal", "ical", "ocal", "zoom", "calendly",
    "notion", "linear", "jira", "asana", "trello", "clickup", "todoist", "obsidian", "evernote",
    "gdrive", "dropbox", "iclouddrive", "onedrive", "box", "github",
    "figma", "pinterest", "canva", "miro", "spotify"];
  var CN_AI = ["claude", "chatgpt", "cursor", "gemini", "perplexity", "othermcp"];
  var CN_CHIPS = [["all", "All categories"], ["mail", "Mail & chat"], ["cal", "Calendars"], ["work", "Work"], ["files", "Files"], ["creative", "Creative"]];

  var MAIL = ["Read your mail", "Turn messages into tasks"];
  var CAL = ["Read your calendar", "Place tasks into free time"];
  var FILES = ["See your files", "Attach files to tasks and docs"];
  var CN_META = {
    /* Mail & chat */
    gmail: { label: "Gmail", cat: "mail", kind: "Mail", alias: "google", account: "maksym.a@gmail.com",
      gives: "Turn emails into tasks and see who’s waiting on you", scopes: MAIL },
    outlook: { label: "Outlook", cat: "mail", kind: "Mail", alias: "microsoft hotmail", account: "maksym@outlook.com",
      lost: "Token expired · last sync 06:12", gives: "Turn emails into tasks and see who’s waiting on you", scopes: MAIL },
    icloudmail: { label: "iCloud Mail", cat: "mail", kind: "Mail", alias: "apple", account: "maksym@icloud.com",
      gives: "Your iCloud inbox, one tap from a task", scopes: MAIL },
    protonmail: { label: "Proton Mail", cat: "mail", kind: "Mail", alias: "proton", account: "maksym@proton.me",
      gives: "Turn emails into tasks — read through Proton Bridge", scopes: MAIL },
    fastmail: { label: "Fastmail", cat: "mail", kind: "Mail", account: "maksym@fastmail.com",
      gives: "Turn emails into tasks and see who’s waiting on you", scopes: MAIL },
    slack: { label: "Slack", cat: "mail", kind: "Messages", alias: "chat", account: "demesures.slack.com", reads: "messages you save",
      gives: "Save a message as a task and see who’s waiting on you", scopes: ["Read messages you save", "Turn them into tasks"] },
    telegram: { label: "Telegram", cat: "mail", kind: "Messages", alias: "chat", account: "@teenx", reads: "messages you forward",
      gives: "Forward a message to Needt and it becomes a task", scopes: ["Read messages you forward to Needt", "Turn them into tasks"] },
    discord: { label: "Discord", cat: "mail", kind: "Messages", alias: "chat", account: "teenx", reads: "messages you save",
      gives: "Turn messages from your servers into tasks", scopes: ["Read messages you save", "Turn them into tasks"] },
    /* Calendars & meetings */
    gcal: { label: "Google Calendar", cat: "cal", kind: "Calendar", alias: "google", account: "maksym.a@gmail.com",
      gives: "Events and free time for planning your day", scopes: CAL },
    ical: { label: "Apple Calendar", cat: "cal", kind: "Calendar", alias: "icloud", account: "iCloud · Personal, Family",
      gives: "Events and free time for planning your day", scopes: CAL },
    ocal: { label: "Outlook Calendar", cat: "cal", kind: "Calendar", alias: "microsoft", account: "maksym@outlook.com",
      gives: "Events and free time for planning your day", scopes: CAL },
    zoom: { label: "Zoom", cat: "cal", kind: "Meetings", alias: "video call", account: "maksym.a@gmail.com", reads: "your meetings",
      gives: "Join links and meeting notes on your events", scopes: ["See your meetings", "Add join links to events"] },
    calendly: { label: "Calendly", cat: "cal", kind: "Scheduling", alias: "booking", account: "calendly.com/maksym", reads: "your bookings",
      gives: "Booked meetings land in your day — no double booking", scopes: ["See your booked events", "Block time you’ve planned"] },
    /* Work */
    notion: { label: "Notion", cat: "work", kind: "Docs & wiki", alias: "notes", account: "Maksym’s workspace", reads: "your pages",
      gives: "Link pages to tasks and pull to-dos into Needt", scopes: ["See pages you share with Needt", "Turn to-dos into tasks"] },
    linear: { label: "Linear", cat: "work", kind: "Issues", account: "Demesures", reads: "your issues",
      gives: "Issues assigned to you show up as tasks", scopes: ["See issues assigned to you", "Keep their status in sync"] },
    jira: { label: "Jira", cat: "work", kind: "Issues", alias: "atlassian", account: "demesures.atlassian.net", reads: "your issues",
      gives: "Your issues as tasks, with due dates and sprints", scopes: ["See issues assigned to you", "Keep their status in sync"] },
    asana: { label: "Asana", cat: "work", kind: "Projects", account: "Maksym · My workspace", reads: "your tasks",
      gives: "Tasks assigned to you, planned into your day", scopes: ["See tasks assigned to you", "Keep them in sync"] },
    trello: { label: "Trello", cat: "work", kind: "Boards", alias: "atlassian", account: "Maksym’s boards", reads: "your cards",
      gives: "Cards from your boards become tasks with due dates", scopes: ["See your boards and cards", "Turn cards into tasks"] },
    clickup: { label: "ClickUp", cat: "work", kind: "Projects", account: "Demesures workspace", reads: "your tasks",
      gives: "Bring your ClickUp tasks into one plan", scopes: ["See tasks assigned to you", "Keep them in sync"] },
    todoist: { label: "Todoist", cat: "work", kind: "Tasks", alias: "import", account: "maksym.a@gmail.com", reads: "your tasks",
      gives: "Import your projects and keep tasks in sync", scopes: ["See your projects and tasks", "Keep tasks in sync"] },
    obsidian: { label: "Obsidian", cat: "work", kind: "Notes", alias: "vault markdown", account: "Vault · Needt notes", reads: "your vault",
      gives: "Link notes from your vault to tasks and docs", scopes: ["See the vault you choose", "Link notes to tasks"] },
    evernote: { label: "Evernote", cat: "work", kind: "Notes", account: "maksym.a@gmail.com", reads: "your notes",
      gives: "Bring notes and checklists into Needt", scopes: ["See your notes", "Turn checklists into tasks"] },
    /* Files */
    gdrive: { label: "Google Drive", cat: "files", kind: "Files", alias: "google docs", account: "maksym.a@gmail.com",
      gives: "Attach files to tasks and docs without downloading", scopes: FILES },
    dropbox: { label: "Dropbox", cat: "files", kind: "Files", account: "maksym.a@gmail.com",
      gives: "Attach files to tasks and docs without downloading", scopes: FILES },
    iclouddrive: { label: "iCloud Drive", cat: "files", kind: "Files", alias: "apple", account: "maksym@icloud.com",
      gives: "Attach files from iCloud to tasks and docs", scopes: FILES },
    onedrive: { label: "OneDrive", cat: "files", kind: "Files", alias: "microsoft office", account: "maksym@outlook.com",
      gives: "Attach Office files to tasks and docs", scopes: FILES },
    box: { label: "Box", cat: "files", kind: "Files", account: "maksym.a@gmail.com",
      gives: "Attach shared team files to tasks and docs", scopes: FILES },
    github: { label: "GitHub", cat: "files", kind: "Code", alias: "git pull requests", account: "teenx", reads: "your issues and pull requests",
      gives: "Issues and pull requests that need you, as tasks", scopes: ["See issues and pull requests assigned to you", "Turn them into tasks"] },
    /* Creative */
    figma: { label: "Figma", cat: "creative", kind: "Design", account: "Maksym · Demesures team",
      gives: "Link frames into docs and moodboards", scopes: ["See your files", "Show frames inside docs"] },
    pinterest: { label: "Pinterest", cat: "creative", kind: "Inspiration", beta: true, account: "teenx · Pinterest",
      gives: "Bring your boards into Moodboards", scopes: ["See your public and secret boards", "See your Pins and their images"],
      never: "Needt can’t create, edit or delete anything on Pinterest. Pins stay there — Needt shows them live." },
    canva: { label: "Canva", cat: "creative", kind: "Design", account: "Maksym · Demesures", reads: "your designs",
      gives: "Link designs into docs and moodboards", scopes: ["See your designs", "Show them inside docs"] },
    miro: { label: "Miro", cat: "creative", kind: "Whiteboard", account: "Demesures team", reads: "your boards",
      gives: "Show boards inside docs and moodboards", scopes: ["See your boards", "Show them inside docs"] },
    spotify: { label: "Spotify", cat: "creative", kind: "Music", alias: "focus playlist", account: "teenx", reads: "your playlists",
      gives: "Focus playlists that start with your focus blocks", scopes: ["See your playlists", "Play music on your devices"],
      never: "Needt can’t change your playlists or library." },
    /* AI tools (Needt MCP) */
    claude: { label: "Claude", ai: true, kind: "Anthropic", gives: "Ask Claude about your day, and let it add tasks for you" },
    chatgpt: { label: "ChatGPT", ai: true, kind: "OpenAI", gives: "Plan with ChatGPT using your real tasks and calendar" },
    cursor: { label: "Cursor", ai: true, kind: "Code editor", gives: "Turn TODOs into Needt tasks without leaving your code" },
    gemini: { label: "Gemini", ai: true, kind: "Google · Gemini CLI", gives: "Bring your notes and schedule into Gemini" },
    perplexity: { label: "Perplexity", ai: true, kind: "Mac app", gives: "Research with your tasks and notes as context" },
    othermcp: { label: "Other MCP client", ai: true, kind: "Any MCP app", tile: { bg: "var(--fill-3)", fg: "var(--text-secondary)", icon: "plug" },
      gives: "Any app that speaks MCP — URL, config and an API key" }
  };

  var CN_SYNC_KEY = "needt.connections.sync";
  var CN_SYNC_SEED = { gmail: "2 min ago", outlook: "Today, 06:12", gcal: "5 min ago", ical: "12 min ago", notion: "8 min ago", github: "20 min ago" };
  function cnReadSync() { var v = {}; try { v = JSON.parse(localStorage.getItem(CN_SYNC_KEY)) || {}; } catch (e) {} return Object.assign({}, CN_SYNC_SEED, v); }
  function cnWriteSync(v) { if (window.needtSync) window.needtSync.set(CN_SYNC_KEY, v); }

  function cnHay(id) {
    var m = CN_META[id], c = CN_CHIPS.filter(function (x) { return x[0] === m.cat; })[0];
    return [m.label, m.kind, m.gives, m.alias || "", c ? c[1] : "", m.ai ? "ai mcp" : ""].join(" ").toLowerCase();
  }
  function cnLabel(id) {
    return (CN_META[id] && CN_META[id].label) || (window.connections && window.connections.meta && window.connections.meta[id] && window.connections.meta[id].label) || id;
  }
  /* What Disconnect ends — one sentence for the confirm. */
  function cnByeText(id) {
    var m = CN_META[id];
    if (!m) return "Needt stops reading it. Tasks you made from it stay.";
    if (m.ai) return m.label + " loses access to your Needt tasks, calendar and notes. Nothing in Needt changes.";
    if (id === "pinterest") return "Moodboards stop showing your Pins. Boards stay linked — Reconnect brings them back.";
    return "Needt stops reading " + (m.reads || (m.cat === "mail" ? "new mail" : m.cat === "cal" ? "your events" : "your files")) + " from " + m.account + ". Tasks you already made from it stay.";
  }

  /* The API key MCP clients use when they can't sign in. */
  function cnKeyMake() { var s = "", a = "abcdefghijkmnpqrstuvwxyz23456789"; for (var i = 0; i < 28; i++) s += a[Math.floor(Math.random() * a.length)]; return "ndt_live_" + s; }
  function cnKeyMask(k) { return k.slice(0, 9) + "••••••••" + k.slice(-4); }
  var cnKey = {
    get: function () { try { return localStorage.getItem("needt.mcp.key") || ""; } catch (e) { return ""; } },
    make: function () { var k = cnKeyMake(); if (window.needtSync) window.needtSync.set("needt.mcp.key", k); return k; }
  };
  function cnClip(text) { if (window.needtPlatform) window.needtPlatform.copy(text); }

  /* The setup guide per AI tool. */
  function cnJson(o) { return JSON.stringify(o, null, 2); }
  function cnStepData(id, apiKey) {
    var approve = { t: "Sign in to Needt when it asks, and approve", x: null };
    var url = { t: "Paste this URL", x: "url" };
    if (id === "claude") return [
      { t: "Open Claude → **Settings** → **Connectors**", x: null },
      { t: "Click **Add custom connector** and name it Needt", x: null }, url, approve];
    if (id === "chatgpt") return [
      { t: "Open ChatGPT → **Settings** → **Apps & Connectors** → **Advanced**, turn on **Developer mode**", x: null },
      { t: "Back in **Connectors**, click **Create** and choose MCP server", x: null }, url, approve];
    if (id === "cursor") {
      var c1 = cnJson({ mcpServers: { needt: { url: CN_MCP_URL } } });
      return [
        { t: "Open `~/.cursor/mcp.json` — or Cursor → **Settings** → **MCP** → **Add new global MCP server**", x: null },
        { t: "Add Needt to it", x: { code: c1, copy: c1 } },
        { t: "Save — Needt shows up in Cursor’s MCP list with a green dot", x: null }, approve];
    }
    if (id === "gemini") {
      var c2 = cnJson({ mcpServers: { needt: { httpUrl: CN_MCP_URL } } });
      return [
        { t: "Open `~/.gemini/settings.json`", x: null },
        { t: "Add Needt to it", x: { code: c2, copy: c2 } },
        { t: "Restart Gemini CLI and run `/mcp`", x: null }, approve];
    }
    if (id === "perplexity") return [
      { t: "Open the Perplexity Mac app → **Settings** → **Connectors**", x: null },
      { t: "Click **Add connector** → **Remote**", x: null }, url, approve];
    var cfg = function (k) { return cnJson({ mcpServers: { needt: { url: CN_MCP_URL, headers: { Authorization: "Bearer " + k } } } }); };
    return [
      { t: "Point your client at this server URL", x: "url" },
      { t: "Or add this to its MCP config", x: { code: cfg(apiKey ? cnKeyMask(apiKey) : "<your API key>"), copy: cfg(apiKey || "<your API key>") } },
      { t: "Clients that can’t sign in use an API key", x: "key" }];
  }
  /* **bold** and `path` marks → React nodes (pathClass on the path span). */
  function cnRich(text, pathClass) {
    var h = window.React.createElement;
    return String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/).filter(Boolean).map(function (s, i) {
      if (s.indexOf("**") === 0) return h("b", { key: i }, s.slice(2, -2));
      if (s.charAt(0) === "`") return h("span", { key: i, className: pathClass }, s.slice(1, -1));
      return s;
    });
  }

  /* MCP / API connections (the user's own access points into Needt). */
  var CN_SCOPES = [["all", "All docs & tasks", "Every doc, note and task in Needt"], ["daily", "Daily notes & tasks", "Today’s notes and your task list"], ["projects", "Selected projects…", "Only the projects you pick"]];
  var CN_PERMS = [["read", "Read only", "Can look things up, never changes anything"], ["write", "Read and write", "Can also add and edit tasks, notes and docs"]];
  var CN_ACCESS = [["private", "Private", "Requires a sign-in token"], ["public", "Public link", "Anyone with the URL can use it"]];
  var CN_LINK_KINDS = {
    mcp: { store: function () { return window.mcpLinks; }, title: "Your MCP connections", sub: "For AI tools to access your docs", noun: "MCP", icon: "mcp",
      guides: [["chatgpt", "ChatGPT"], ["claude", "Claude"], ["cursor", "Cursor"], ["windsurf", "Windsurf"], ["raycast", "Raycast"], ["gemini", "Gemini"], ["perplexity", "Perplexity"]] },
    api: { store: function () { return window.apiLinks; }, title: "Your API connections", sub: "For building workflows and shortcuts", noun: "API", icon: "code",
      guides: [["zapier", "Zapier"], ["make", "Make"], ["n8n", "n8n"], ["raycast", "Raycast"], ["shortcuts", "Shortcuts"], ["curl", "cURL"], ["restapi", "REST"]] }
  };
  function cnOpt(list, k) { return list.filter(function (o) { return o[0] === k; })[0] || list[0]; }
  function cnProjects() {
    var own = window.projectStore ? (window.projectStore.get().list || []) : [];
    var base = (window.NEEDT && window.NEEDT.projects) || [];
    var seen = {};
    return own.concat(base).filter(function (p) { if (!p || !p.id || seen[p.id]) return false; seen[p.id] = 1; return true; });
  }
  function cnScopeText(l) {
    if (l.scope !== "projects") return cnOpt(CN_SCOPES, l.scope)[1];
    var ps = cnProjects().filter(function (p) { return (l.projectIds || []).indexOf(p.id) >= 0; });
    return !ps.length ? "No projects yet" : ps.length <= 2 ? ps.map(function (p) { return p.name; }).join(", ") : ps.length + " projects";
  }
  function cnAutoName(kind, scope) { return CN_LINK_KINDS[kind].noun + " for " + (scope === "projects" ? "Selected projects" : cnOpt(CN_SCOPES, scope)[1]); }
  function cnUrlShort(u) { var i = u.lastIndexOf("/"); return u.slice(0, i + 1) + u.slice(i + 1, i + 7) + "…"; }
  function cnMade(iso) { var d = new Date(iso); return isNaN(d) ? "" : "Created " + d.getDate() + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]; }
  function cnBundle(l) {
    var scope = cnScopeText(l), perm = cnOpt(CN_PERMS, l.permission)[1];
    var spec = { name: l.name, baseUrl: l.url, auth: l.access === "private" ? "Authorization: Bearer <your Needt sign-in token>" : "none (public link)",
      scope: l.scope, projects: l.projectIds || [], permission: l.permission,
      endpoints: ["GET /tasks", "GET /tasks/:id", "GET /notes/daily/:date", "GET /docs", "GET /docs/:id"].concat(l.permission === "write" ? ["POST /tasks", "PATCH /tasks/:id", "POST /notes/daily/:date"] : []) };
    return "# Needt API — AI bundle\n\nGive this file to an AI assistant so it can build a workflow or shortcut against your Needt API connection.\n\n" +
      "- Connection: " + l.name + "\n- Base URL: " + l.url + "\n- Documents: " + scope + "\n- Permission: " + perm + "\n- Access: " + cnOpt(CN_ACCESS, l.access)[1] + "\n\n" +
      "## Example\n\n```sh\ncurl " + (l.access === "private" ? "-H \"Authorization: Bearer $NEEDT_TOKEN\" " : "") + l.url + "/tasks?due=today\n```\n\n" +
      "## Spec\n\n```json\n" + JSON.stringify(spec, null, 2) + "\n```\n\nFull reference: https://needt.app/docs/api (coming soon)\n";
  }
  function cnDownload(name, text) {
    try {
      var url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
      var a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (e) {}
  }

  /* Pro (paywall.jsx): Free keeps one mail account; AI tools, MCP and API
     connections and Pinterest are Pro. */
  var CN_FREE_MAIL = 1;
  function cnIsMail(id) { return !!(CN_META[id] && CN_META[id].kind === "Mail"); }
  function cnProFeature(id) { return CN_META[id] && CN_META[id].ai ? "AI tools & MCP" : id === "pinterest" ? "Pinterest boards" : cnIsMail(id) ? "More mail accounts" : null; }
  var CN_PROMO_LINES = ["Plan with your real tasks in Claude and ChatGPT", "Your own MCP and API links", "Works with Cursor, Raycast, Zapier…"];

  /* "Check connection": offline, or load: error on "mcp" / "connections". */
  var CN_CHECK_MS = 1600;
  function cnCheckFails() {
    var S = window.needtStates;
    if (!S || !S.get) return null;
    if (S.get("mcp").offline) return "offline";
    if (S.get("mcp").load === "error" || S.get("connections").load === "error") return "error";
    return null;
  }

  window.cnData = {
    CN_MCP_URL: CN_MCP_URL, CN_TABS: CN_TABS, CN_APPS: CN_APPS, CN_AI: CN_AI, CN_CHIPS: CN_CHIPS, CN_META: CN_META,
    CN_SYNC_KEY: CN_SYNC_KEY, CN_SYNC_SEED: CN_SYNC_SEED, cnReadSync: cnReadSync, cnWriteSync: cnWriteSync,
    cnHay: cnHay, cnLabel: cnLabel, cnByeText: cnByeText, cnKeyMake: cnKeyMake, cnKeyMask: cnKeyMask, cnKey: cnKey, cnClip: cnClip,
    cnStepData: cnStepData, cnRich: cnRich,
    CN_SCOPES: CN_SCOPES, CN_PERMS: CN_PERMS, CN_ACCESS: CN_ACCESS, CN_LINK_KINDS: CN_LINK_KINDS,
    cnOpt: cnOpt, cnProjects: cnProjects, cnScopeText: cnScopeText, cnAutoName: cnAutoName, cnUrlShort: cnUrlShort, cnMade: cnMade,
    cnBundle: cnBundle, cnDownload: cnDownload,
    CN_FREE_MAIL: CN_FREE_MAIL, cnIsMail: cnIsMail, cnProFeature: cnProFeature, CN_PROMO_LINES: CN_PROMO_LINES,
    CN_CHECK_MS: CN_CHECK_MS, cnCheckFails: cnCheckFails
  };
})();
