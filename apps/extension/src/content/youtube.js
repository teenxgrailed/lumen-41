// YouTube, two layers. Always on and with no token: the toggles and block
// lists of youtube-rules.js (Shorts, home feed, sidebar, end cards, comments,
// autoplay, blocked channels and keywords). On top, during a Needt focus block,
// videos far from what you are focused on are dimmed and Shorts are hidden;
// "Show anyway" opens one, the banner's snooze opens all for a few minutes out
// of a daily budget.
(async () => {
  const { keepVideo } = await import(chrome.runtime.getURL("src/lib/relevance.js"));
  const rules = await import(chrome.runtime.getURL("src/lib/youtube-rules.js"));

  const TILE =
    "ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, yt-lockup-view-model, ytm-video-with-context-renderer, ytm-compact-video-renderer";
  const SHORTS =
    "ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts], ytm-reel-shelf-renderer, ytd-guide-entry-renderer a[title='Shorts']";
  const TITLE = ["#video-title", "a#video-title-link", "h3", ".yt-lockup-metadata-view-model__title"];
  const CHANNEL = ["ytd-channel-name a", "#channel-name a", ".yt-content-metadata-view-model__metadata-text"];

  let state = { goal: "", on: false, allow: [], block: [], threshold: 0.34 };

  // ---- Always-on layer: no token, no account ------------------------------
  let yt = rules.normalizeYt(undefined);
  let lists = { channels: [], keywords: [] };
  let ytVersion = 0;

  async function loadYt() {
    const stored = await chrome.storage.sync.get(rules.YT_KEY);
    yt = rules.normalizeYt(stored[rules.YT_KEY]);
    lists = { channels: rules.compileList(yt.blockChannels), keywords: rules.compileList(yt.blockKeywords) };
    ytVersion++;
  }

  function applyRoot() {
    const root = document.documentElement;
    for (const c of [...root.classList]) if (c.startsWith("needt-yt-") && c !== "needt-yt-gone") root.classList.remove(c);
    for (const c of rules.rootClasses(yt, location.pathname)) root.classList.add(c);
  }

  async function blockChannel(channel, handle) {
    const stored = await chrome.storage.sync.get(rules.YT_KEY);
    const current = rules.normalizeYt(stored[rules.YT_KEY]);
    const next = rules.addEntry(current.blockChannels, rules.channelEntry(channel, handle));
    if (next !== current.blockChannels) {
      await chrome.storage.sync.set({ [rules.YT_KEY]: { ...current, blockChannels: next } });
    }
  }

  function blockButton(channel, handle) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "needt-yt-block";
    b.textContent = "Block";
    b.title = `Block channel ${channel}`;
    b.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      b.textContent = "Blocked";
      blockChannel(channel, handle);
    });
    return b;
  }

  /**
   * One pass: hides blocked tiles (display none, so YouTube's own renderers
   * stay intact), places the "Block" button, turns autoplay off. A tile whose
   * title, channel and the list version are unchanged is skipped.
   */
  function scanYt() {
    for (const tile of document.querySelectorAll(TILE)) {
      const title = textOf(tile, TITLE);
      const channel = textOf(tile, CHANNEL);
      if (!title && !channel) continue;
      const key = `${ytVersion}|${title}|${channel}`;
      if (tile.dataset.needtYt === key) continue;
      tile.dataset.needtYt = key;
      const handle = rules.handleFromHref(tile.querySelector("a[href^='/@']")?.getAttribute("href"));
      tile.classList.toggle("needt-yt-gone", rules.isBlocked({ title, channel, handle }, lists));
      tile.querySelector(".needt-yt-block")?.remove();
      const anchor = tile.querySelector("ytd-channel-name, #channel-name, .yt-content-metadata-view-model__metadata-text");
      if (anchor && channel) anchor.after(blockButton(channel, handle));
    }
    const owner = document.querySelector("ytd-watch-metadata ytd-channel-name");
    if (owner && !owner.parentElement?.querySelector(".needt-yt-block")) {
      const channel = owner.textContent.trim();
      const handle = rules.handleFromHref(owner.querySelector("a")?.getAttribute("href"));
      if (channel) owner.after(blockButton(channel, handle));
    }
    if (yt.noAutoplay) {
      const toggle = document.querySelector(".ytp-autonav-toggle-button[aria-checked='true']");
      if (toggle instanceof HTMLElement) toggle.click();
    }
  }

  let ytTimer = 0;
  function scheduleYt(now = false) {
    if (now) {
      clearTimeout(ytTimer);
      ytTimer = 0;
      applyRoot();
      return scanYt();
    }
    if (ytTimer) return;
    ytTimer = setTimeout(() => {
      ytTimer = 0;
      scanYt();
    }, 250);
  }

  // Shorts pages are off during focus (back to the home feed) and, with the
  // always-on toggle, become the normal watch page.
  async function guardShorts() {
    if (!location.pathname.startsWith("/shorts")) return;
    await load();
    if (state.on) return location.replace("/");
    const to = yt.noShorts ? rules.shortsRedirect(location.pathname) : null;
    if (to) location.replace(to);
  }

  // ---- Focus layer: the goal filter, needs a token and a running block ----
  async function load() {
    const s = await chrome.storage.local.get([
      "active", "filterEnabled", "snoozedUntil", "allowChannels", "blockChannels", "filterThreshold",
    ]);
    const reason = s.active?.active ? s.active.profiles?.[0] : null;
    state = {
      goal: reason ? reason.reason.title || reason.name : "",
      on: Boolean(reason) && s.filterEnabled !== false && !((s.snoozedUntil ?? 0) > Date.now()),
      allow: s.allowChannels ?? [],
      block: s.blockChannels ?? [],
      threshold: s.filterThreshold ?? 0.34,
    };
  }

  function textOf(tile, selectors) {
    for (const sel of selectors) {
      const el = tile.querySelector(sel);
      const text = el?.getAttribute?.("title") || el?.textContent;
      if (text?.trim()) return text.trim();
    }
    return "";
  }

  function judge(tile) {
    if (tile.dataset.needtShown === "1") return;
    const title = textOf(tile, TITLE);
    if (!title) return;
    const channel = textOf(tile, CHANNEL);
    const keep = keepVideo({
      goal: state.goal, title, channel,
      allowChannels: state.allow, blockChannels: state.block, threshold: state.threshold,
    });
    tile.classList.toggle("needt-off-goal", !keep);
    if (!keep && !tile.querySelector(":scope > .needt-show")) {
      const button = document.createElement("button");
      button.className = "needt-show";
      button.textContent = "Show anyway";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        tile.dataset.needtShown = "1";
        tile.classList.remove("needt-off-goal");
        button.remove();
      });
      tile.prepend(button);
    }
  }

  function banner() {
    let el = document.getElementById("needt-banner");
    if (!state.on) return el?.remove();
    if (!el) {
      el = document.createElement("div");
      el.id = "needt-banner";
      el.innerHTML = '<span class="needt-goal"></span><button type="button">Snooze 5 min</button>';
      el.querySelector("button").addEventListener("click", async () => {
        const answer = await chrome.runtime.sendMessage({ type: "snooze", minutes: 5 });
        el.querySelector("button").textContent = answer?.ok
          ? `Snoozed · ${answer.left} min left today`
          : "No snooze left today";
        if (answer?.ok) run();
      });
      document.body.prepend(el);
    }
    el.querySelector(".needt-goal").textContent = `Focus: ${state.goal} · showing videos on it`;
  }

  function clear() {
    document.querySelectorAll(".needt-off-goal").forEach((t) => t.classList.remove("needt-off-goal"));
    document.querySelectorAll(".needt-show").forEach((b) => b.remove());
    document.documentElement.classList.remove("needt-focus");
  }

  let pending = false;
  async function run() {
    await load();
    banner();
    if (!state.on) return clear();
    document.documentElement.classList.add("needt-focus");
    document.querySelectorAll(TILE).forEach(judge);
    document.querySelectorAll(SHORTS).forEach((el) => el.classList.add("needt-hidden"));
  }

  new MutationObserver(() => {
    scheduleYt();
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      if (state.on) document.querySelectorAll(TILE).forEach(judge);
      if (state.on) document.querySelectorAll(SHORTS).forEach((el) => el.classList.add("needt-hidden"));
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  // YouTube is a single-page app: route changes arrive as events, not loads.
  document.addEventListener("yt-navigate-finish", () => {
    guardShorts();
    scheduleYt(true);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes[rules.YT_KEY]) {
      loadYt().then(() => {
        scheduleYt(true);
        guardShorts();
      });
    }
    if (changes.active || changes.snoozedUntil || changes.filterEnabled || changes.allowChannels || changes.blockChannels) run();
  });

  await loadYt();
  applyRoot();
  await guardShorts();
  scanYt();
  run();
  setInterval(() => {
    if (!state.on) return;
    load().then(() => { if (!state.on) run(); });
  }, 30_000);
})();
