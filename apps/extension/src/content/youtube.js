// Goal filter for YouTube. During a Needt focus block, videos far from what
// you are focused on are dimmed and Shorts are hidden; "Show anyway" opens one,
// the banner's snooze opens all for a few minutes out of a daily budget.
(async () => {
  const { keepVideo } = await import(chrome.runtime.getURL("src/lib/relevance.js"));

  const TILE =
    "ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, yt-lockup-view-model, ytm-video-with-context-renderer, ytm-compact-video-renderer";
  const SHORTS =
    "ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts], ytm-reel-shelf-renderer, ytd-guide-entry-renderer a[title='Shorts']";

  let state = { goal: "", on: false, allow: [], block: [], threshold: 0.34 };

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
    const title = textOf(tile, ["#video-title", "a#video-title-link", "h3", ".yt-lockup-metadata-view-model__title"]);
    if (!title) return;
    const channel = textOf(tile, ["ytd-channel-name a", "#channel-name a", ".yt-content-metadata-view-model__metadata-text"]);
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
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      if (state.on) document.querySelectorAll(TILE).forEach(judge);
      if (state.on) document.querySelectorAll(SHORTS).forEach((el) => el.classList.add("needt-hidden"));
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.active || changes.snoozedUntil || changes.filterEnabled || changes.allowChannels || changes.blockChannels) run();
  });

  // Shorts pages themselves are off during focus: back to the home feed.
  if (location.pathname.startsWith("/shorts")) {
    await load();
    if (state.on) location.replace("/");
  }
  run();
  setInterval(() => {
    if (!state.on) return;
    load().then(() => { if (!state.on) run(); });
  }, 30_000);
})();
