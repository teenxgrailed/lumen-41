// @ts-check
import { reasonLine } from "../lib/blocking.js";

const { active } = await chrome.storage.local.get("active");
const line = reasonLine(active);
if (line) document.getElementById("reason").textContent = line;
if (active?.profiles?.length) {
  document.getElementById("detail").textContent = `Profile: ${active.profiles.map((p) => p.name).join(", ")}`;
}
// When the block ends, send the person back where they were going.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.active && !changes.active.newValue?.active) history.back();
});
