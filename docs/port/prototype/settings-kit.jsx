/* SETTINGS KIT — the theme and accent lists the shell needs before Settings
   is ever opened (App.jsx checks a stored accent against NEEDT_ACCENT_IDS at
   start). Split from SettingsScreen.jsx (08.10.26), which loads on demand. */

/* THE FOUR THEMES. A theme is chosen by looking at it: each card is the real
   screen at small scale, in the theme's own class, so it cannot drift from the
   product. System is a pair, so its card is cut down the middle. Time is the
   day itself, so its card is the same screen read at dawn, day, golden hour,
   dusk and night, feathered into one another left to right. */
const THEMES = [
  ["system", "System"],
  ["light", "Light"],
  ["dark", "Dark"],
  ["time", "Time"]
];
const THEME_CLASS = { light: "paper", dark: "dark" };

/* Solid accents first, then the gradients. `id` is the data-accent value
   themes.css keys on. */
const ACCENTS = [
  ["blue", "Blue"], ["pink", "Pink"], ["mint", "Mint"], ["violet", "Violet"], ["amber", "Amber"], ["graphite", "Graphite"],
  ["aurora", "Aurora", true], ["sunset", "Sunset", true], ["lagoon", "Lagoon", true]
];
window.NEEDT_ACCENT_IDS = ACCENTS.map((a) => a[0]);

Object.assign(window, { THEMES, NEEDT_ACCENTS: ACCENTS });
