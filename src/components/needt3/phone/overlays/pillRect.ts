import type { MorphRect } from "@/lib/needt3/gesture";

/**
 * Where menu A's closed pill sits, in the px of a sheet layer: what the
 * composer's `PkSheet from=` grows out of and goes back into.
 *
 * The menu marks the element whose box is the closed pill with
 * `data-nva-pill`. It is looked up inside the layer's own phone frame
 * (`[data-v2p-frame]`), so a second frame on the page (the design preview, a
 * test) never lends its pill. Returns null when the pill is not there or not
 * drawn: the sheet then slides up instead, which is the right fallback.
 *
 * Called once when the sheet opens and once when it closes by a tap, never
 * per frame, so the two rect reads are the only layout reads of the morph.
 */
export function pillRectFromDom(layer: HTMLElement | null): MorphRect | null {
  if (!layer) return null;
  const root: ParentNode =
    layer.closest("[data-v2p-frame]") ?? layer.ownerDocument;
  const pill = root.querySelector<HTMLElement>("[data-nva-pill]");
  if (!pill) return null;
  const from = layer.getBoundingClientRect();
  const box = pill.getBoundingClientRect();
  if (!box.width || !box.height) return null;
  // A scaled frame (a preview) reports scaled rects; the sheet works in its own px.
  const k =
    layer.offsetWidth && from.width ? from.width / layer.offsetWidth : 1;
  const half = box.height / k / 2;
  const css =
    layer.ownerDocument.defaultView?.getComputedStyle(pill).borderTopLeftRadius;
  const parsed = css && !css.includes("%") ? parseFloat(css) : NaN;
  const r = Number.isFinite(parsed) ? parsed : half;
  return {
    x: (box.left - from.left) / k,
    y: (box.top - from.top) / k,
    w: box.width / k,
    h: box.height / k,
    r: Math.min(r, half),
  };
}
