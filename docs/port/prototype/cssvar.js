/* cssVar — read a colour/token from CSS at runtime (canvas drawing, data: URIs,
   code that needs a literal value). Colours live only in themes.css. */
(function () {
  const cache = {};
  window.cssVar = function (name, el) {
    const root = el || document.documentElement;
    const key = (root.className || "") + "|" + name;
    if (!el && cache[key] != null) return cache[key];
    const v = getComputedStyle(root).getPropertyValue(name).trim();
    if (!el) cache[key] = v;
    return v;
  };
  new MutationObserver(() => { for (const k in cache) delete cache[k]; }).observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
})();
