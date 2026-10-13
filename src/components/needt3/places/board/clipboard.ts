import { notify } from "@/lib/notifications";

/** Copy text and say so; says it could not when the browser refuses (insecure page, no permission). */
export async function copyText(text: string, message = "Link copied") {
  try {
    await navigator.clipboard.writeText(text);
    notify.success(message);
    return true;
  } catch {
    notify.error("Could not copy. Select it and copy by hand.");
    return false;
  }
}

/** Open an address in a new tab, without handing the page our window. */
export function openUrl(url: string) {
  try {
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    /* a blocked pop-up: nothing to do */
  }
}
