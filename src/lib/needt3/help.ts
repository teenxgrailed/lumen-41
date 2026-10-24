/**
 * Help is the guides on the website (needt.app/learn, the landing branch's
 * learn index), not a page in the app. The website is another host, so it
 * opens in a new tab: from the installed app that is the browser, and the app
 * stays where it was.
 */
export const HELP_URL = "https://needt.app/learn/";

export function openHelp() {
  window.open(HELP_URL, "_blank", "noopener,noreferrer");
}
