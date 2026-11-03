/* Needt motion helper — shared by the H-series videos (H2, H3; H1 v2 predates it).
   Canvas 2D, deterministic: a scene exposes window.seek(t) and window.DUR; nothing reads a clock.
   Load before the scene: <script src="../../_shared/needt-motion.js"></script> */
(function () {
  const FMT = new URLSearchParams(location.search).get('fmt') === '1x1' ? '1x1' : '9x16';
  const SQ = FMT === '1x1';
  const W = 1080, H = SQ ? 1080 : 1920;
  const cv = document.getElementById('c');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const ramp = (t, a, b) => clamp((t - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const eo3 = k => 1 - Math.pow(1 - k, 3);
  const eo5 = k => 1 - Math.pow(1 - k, 5);
  const eio = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const back = k => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
  const mix = (A, B, k) => [lerp(A[0], B[0], k), lerp(A[1], B[1], k)];
  const bez = (P, p) => { const q = 1 - p; return [0, 1].map(i => q*q*q*P[0][i] + 3*q*q*p*P[1][i] + 3*q*p*p*P[2][i] + p*p*p*P[3][i]); };

  const FONT = 'Inter, "SF Pro Display", -apple-system, system-ui, sans-serif';
  const MONO = '"JetBrains Mono", "SF Mono", ui-monospace, monospace';
  const BG = '#05060a';
  const C = { PALE: '188,214,255', AMBER: '255,176,32', GREEN: '52,211,153', RED: '248,113,113', WHITE: '255,255,255' };

  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

  // glow sprite
  const spr = document.createElement('canvas'); spr.width = spr.height = 64;
  { const g = spr.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.18, `rgba(${C.PALE},.55)`); gr.addColorStop(1, `rgba(${C.PALE},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
  function glow(x, y, r, a) { if (a <= 0) return; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= a; ctx.drawImage(spr, x - r, y - r, r * 2, r * 2); ctx.restore(); }

  // the Needt "n"
  const MARK = new Path2D('M300 768 L300 296 Q300 280 316 280 L438 280 Q452 280 453 294 L455 350 C494 298 552 264 624 264 C718 264 758 345 770 428 L824 744 Q827 768 802 768 L692 768 Q674 768 672 752 L624 470 C617 420 594 398 556 398 C516 398 478 416 455 446 L455 752 Q455 768 439 768 L316 768 Q300 768 300 752 Z');
  function drawMark(cx, cy, size, alpha, col = '255,255,255') {
    if (alpha <= 0) return;
    ctx.save(); ctx.translate(cx, cy); const sc = size / 527; ctx.scale(sc, sc); ctx.translate(-563.5, -516);
    ctx.globalAlpha *= alpha; ctx.fillStyle = `rgb(${col})`; ctx.fill(MARK); ctx.restore();
  }
  /** The mark in its dark disc with a thin ring, plus `pulses` (times) as expanding rings. */
  function markBadge(cx, cy, size, alpha, t, pulses = []) {
    if (alpha <= 0) return;
    const hg = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 2.4);
    hg.addColorStop(0, `rgba(${C.PALE},${.18 * alpha})`); hg.addColorStop(1, `rgba(${C.PALE},0)`);
    ctx.fillStyle = hg; ctx.fillRect(cx - size * 2.5, cy - size * 2.5, size * 5, size * 5);
    for (const p of pulses) {
      const k = ramp(t, p, p + .9); if (k <= 0 || k >= 1) continue;
      ctx.beginPath(); ctx.arc(cx, cy, size * (.95 + 1.6 * eo3(k)), 0, 7);
      ctx.lineWidth = 2; ctx.strokeStyle = `rgba(${C.PALE},${.55 * (1 - k) * alpha})`; ctx.stroke();
    }
    const beat = pulses.reduce((m, p) => Math.max(m, Math.sin(clamp((t - p) / .3) * Math.PI)), 0);
    const s = size * (1 + .06 * beat);
    ctx.beginPath(); ctx.arc(cx, cy, s * .92, 0, 7); ctx.fillStyle = `rgba(5,6,10,${.95 * alpha})`; ctx.fill();
    ctx.lineWidth = 1.4; ctx.strokeStyle = `rgba(${C.PALE},${.5 * alpha})`; ctx.stroke();
    drawMark(cx, cy, s * .86, alpha);
  }

  function pill(text, x, y, fs, rgb, fillA, strokeA, textA, align = 'right', scale = 1) {
    ctx.font = `600 ${fs}px ${FONT}`; const tw = ctx.measureText(text).width, pw = tw + fs * 1.1, ph = fs * 1.85;
    const px = align === 'right' ? x - pw : align === 'center' ? x - pw / 2 : x;
    ctx.save(); ctx.translate(px + pw / 2, y + ph / 2); ctx.scale(scale, scale); ctx.translate(-pw / 2, -ph / 2);
    rr(0, 0, pw, ph, ph / 2); ctx.fillStyle = `rgba(${rgb},${fillA})`; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = `rgba(${rgb},${strokeA})`; ctx.stroke();
    ctx.fillStyle = `rgba(${rgb},${textA})`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, pw / 2, ph / 2 + 1); ctx.restore();
    return { cx: px + pw / 2, cy: y + ph / 2, w: pw, h: ph };
  }

  function text(str, x, y, size, weight, rgb, alpha, align = 'left') {
    if (alpha <= 0) return;
    ctx.save(); ctx.globalAlpha *= alpha; ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillStyle = `rgb(${rgb})`;
    ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(str, x, y); ctx.restore();
  }

  /** Map pin glyph (Lucide-style), centred on cx, cy. */
  function pinIcon(cx, cy, size, rgb, alpha) {
    ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(cx, cy); ctx.rotate(.6); const u = size / 24;
    ctx.strokeStyle = `rgb(${rgb})`; ctx.fillStyle = `rgb(${rgb})`; ctx.lineWidth = 2 * u; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(0, 4 * u); ctx.lineTo(0, 11 * u); ctx.stroke();               // needle
    ctx.beginPath(); ctx.moveTo(-7 * u, 4 * u); ctx.lineTo(7 * u, 4 * u); ctx.stroke();      // collar
    rr(-4.5 * u, -10 * u, 9 * u, 11 * u, 2 * u); ctx.fill();                                  // head
    ctx.restore();
  }

  /** A finger dot that glides to (x, y), presses at `tap`, and ripples. */
  function finger(x, y, t, t0, tap, t1, S = 1) {
    if (t < t0 || t > t1) return;
    const ap = eio(ramp(t, t0, tap - .1));
    const sx = x + 90 * S * (1 - ap), sy = y + 110 * S * (1 - ap);
    const press = t >= tap ? Math.sin(clamp((t - tap) / .35) * Math.PI) : 0;
    const fa = 1 - ramp(t, t1 - .3, t1);
    ctx.save(); ctx.globalAlpha *= fa;
    ctx.beginPath(); ctx.arc(sx, sy, (16 - 4 * press) * S, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.stroke();
    for (let r = 0; r < 2; r++) {
      const k = ramp(t, tap + r * .12, tap + r * .12 + .7);
      if (k > 0 && k < 1) { ctx.beginPath(); ctx.arc(x, y, (14 + 70 * eo3(k)) * S, 0, 7); ctx.lineWidth = 2.2; ctx.strokeStyle = `rgba(255,255,255,${.6 * (1 - k)})`; ctx.stroke(); }
    }
    ctx.restore();
  }

  /** The closing card: mark, two lines, the URL. `at` holds the start times. */
  function endCard(t, l1, l2, at) {
    const E = SQ
      ? { markY: 330, mark: 78, l1: 480, l2: 570, fs: 74, url: 720, urlFs: 29 }
      : { markY: 720, mark: 112, l1: 880, l2: 1000, fs: 104, url: 1180, urlFs: 38 };
    const fit = (s, fs) => { ctx.font = `600 ${fs}px ${FONT}`; const w = ctx.measureText(s).width; return w > W - 150 ? fs * (W - 150) / w : fs; };
    const fs = Math.min(fit(l1, E.fs), fit(l2, E.fs));
    const line = (txt, y, a0, alpha, size, weight, ls = 0) => {
      const k = eo5(ramp(t, a0, a0 + .85)); if (k <= 0) return;
      ctx.save(); ctx.globalAlpha = k * alpha; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `${weight} ${size}px ${FONT}`; ctx.letterSpacing = ls + 'px'; ctx.fillStyle = '#fff';
      ctx.filter = `blur(${(1 - k) * 8}px)`; ctx.fillText(txt, W / 2, y + (1 - k) * 26); ctx.restore();
    };
    const mk = eo5(ramp(t, at.mark, at.mark + .8));
    if (mk > 0) {
      const gg = ctx.createRadialGradient(W / 2, E.markY, 0, W / 2, E.markY, E.mark * 2.6);
      gg.addColorStop(0, `rgba(${C.PALE},${.2 * mk})`); gg.addColorStop(1, `rgba(${C.PALE},0)`);
      ctx.fillStyle = gg; ctx.fillRect(0, E.markY - E.mark * 3, W, E.mark * 6);
      drawMark(W / 2, E.markY, E.mark * (.9 + .1 * mk), mk);
    }
    line(l1, E.l1, at.l1, .6, fs, 600, -fs * .02);
    line(l2, E.l2, at.l2, 1, fs, 600, -fs * .02);
    line('use.needt.app', E.url, at.url, .5, E.urlFs, 500, .5);
  }

  function frameStart() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none'; ctx.letterSpacing = '0px';
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  }
  function frameEnd(t) { if (t < .5) { ctx.fillStyle = `rgba(5,6,10,${1 - t / .5})`; ctx.fillRect(0, 0, W, H); } }

  function boot(draw, DUR) {
    window.DUR = DUR; window.W = W; window.H = H;
    window.seek = t => { draw(t); return true; };
    (document.fonts ? Promise.all(['600 30px Inter', '500 22px Inter', '400 22px Inter'].map(f => document.fonts.load(f))) : Promise.resolve())
      .then(() => { draw(0); window.ready = true; });
  }

  window.NM = { FMT, SQ, W, H, ctx, rng, clamp, ramp, lerp, eo3, eo5, eio, back, mix, bez, FONT, MONO, BG, C,
    rr, glow, spr, drawMark, markBadge, pill, text, pinIcon, finger, endCard, frameStart, frameEnd, boot };
})();
