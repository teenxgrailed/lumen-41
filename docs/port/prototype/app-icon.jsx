/* app-icon.jsx — the Needt app icon in the UI (08.10.26).

   window.NeedtAppIcon({ size, className, label }) renders the master icon
   (app-icon/needt-icon.svg: the "Swing" n on the lavender→pearl squircle with
   the soft glow from the bottom). The tile carries its own continuous-corner
   shape and transparent corners, so it needs no radius or clip here. Size is
   the box in px (40–56 next to a wordmark). Decorative by default — the
   wordmark beside it already names the app; pass label to make it an image.
   Not for the sidebar profile slot: that one is the user's avatar. */
function NeedtAppIcon({ size, className, label }) {
  const s = size || 48;
  return (
    <img src="app-icon/needt-icon.svg" width={s} height={s} draggable={false}
      alt={label || ""} aria-hidden={label ? undefined : "true"}
      className={"needt-app-icon" + (className ? " " + className : "")} />
  );
}
window.NeedtAppIcon = NeedtAppIcon;
