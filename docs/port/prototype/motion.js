/* MOTION — Craft's rule, adopted 06.10.26: nothing appears or leaves without
   moving. useExit keeps a closing thing mounted for its exit animation, so a
   menu, popover or sheet never just vanishes.
   const [mounted, leaving] = useExit(open, 130);
   render while `mounted`, add `is-leaving` while `leaving`.
   Under prefers-reduced-motion the surface unmounts at once (no wait). */
(function () {
  window.useExit = function useExit(open, ms) {
    const [mounted, setMounted] = React.useState(!!open);
    const [leaving, setLeaving] = React.useState(false);
    React.useEffect(function () {
      if (open) { setMounted(true); setLeaving(false); return undefined; }
      if (!mounted) return undefined;
      /* Reduced motion: the exit keyframe is 1 ms, so nothing waits for it. */
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setMounted(false); setLeaving(false); return undefined;
      }
      setLeaving(true);
      const t = window.setTimeout(function () { setMounted(false); setLeaving(false); }, ms || 130);
      return function () { window.clearTimeout(t); };
    }, [open]);
    return [mounted, leaving];
  };
})();
