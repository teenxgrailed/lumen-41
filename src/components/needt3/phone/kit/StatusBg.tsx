/**
 * The ground under the phone's status bar, in the installed app only.
 *
 * One empty, fully transparent fixed host; the blur is its `::before` and the
 * colour its `::after`. Everything is in
 * `styles/v3-overrides/phone-status-bg.css`, which also says why it exists,
 * why it is invisible in a Safari tab and why it is built like the bottom fog
 * (a zero-height fixed host with no paint of its own). It renders at every
 * width and in both UIs so the frame's children never change with `ui`; CSS
 * shows it only on the phone, in the installed app.
 */
export function PkStatusBg() {
  return <div className="pk-statusbg" aria-hidden="true" />;
}
