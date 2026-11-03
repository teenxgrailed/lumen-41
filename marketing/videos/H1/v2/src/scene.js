/* Needt Agents H1 v2 — one pure draw(t) function, two layouts (9x16, 1x1). */
(function () {
  const FMT = new URLSearchParams(location.search).get('fmt') === '1x1' ? '1x1' : '9x16';
  const SQ = FMT === '1x1';
  const W = 1080, H = SQ ? 1080 : 1920;
  const DUR = 14.5;
  const cv = document.getElementById('c');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  // ---- layout ---------------------------------------------------------------
  const horiz = SQ;                       // flow axis: left->right (1x1) or top->bottom (9x16)
  const ALONG = horiz ? W : H, ACROSS = horiz ? H : W;
  const S = SQ ? 1 : 1.32;                // type scale
  const core0 = SQ ? [400, 540] : [540, 880];
  const core1 = SQ ? [200, 540] : [540, 440];
  const CORE_R = SQ ? 175 : 215;
  const CORE_S1 = SQ ? 0.56 : 0.58;
  const cards = SQ
    ? { x: 400, w: 630, h: 128, gap: 22, y: 270 }
    : { x: 100, w: 880, h: 188, gap: 30, y: 740 };

  // ---- helpers --------------------------------------------------------------
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const ramp = (t, a, b) => clamp((t - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const eo3 = k => 1 - Math.pow(1 - k, 3);
  const eio = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const eo5 = k => 1 - Math.pow(1 - k, 5);
  const back = k => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
  const pt = (u, a) => horiz ? [u, a] : [a, u];
  const bez = (P, p) => { const q = 1 - p; return [0, 1].map(i => q*q*q*P[0][i] + 3*q*q*p*P[1][i] + 3*q*p*p*P[2][i] + p*p*p*P[3][i]); };
  const mix = (A, B, k) => [lerp(A[0], B[0], k), lerp(A[1], B[1], k)];
  const FONT = 'Inter, "SF Pro Display", -apple-system, system-ui, sans-serif';
  const MONO = '"JetBrains Mono", "SF Mono", ui-monospace, "DejaVu Sans Mono", monospace';
  const PALE = '188,214,255';             // pale-blue light, used for fibres and nodes
  const AMBER = '255,176,32', GREEN = '52,211,153';

  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }


  // ---- AI brand marks (owner-cleared, CLAUDE.md "Brand marks"; paths from @lobehub/icons-static-svg 1.102.0, MIT, 24x24) ----
  const LOGO = {
    claude: { p: new Path2D('M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z'), fill: '#D97757' },
    chatgpt: { p: new Path2D('M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z'), fill: '#ffffff', even: true },
    gemini: { p: new Path2D('M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z'), fill: '#3186FF', grads: [
      [7, 15.5, 11, 12, '#08B962', 0, 1], [8, 5.5, 11.5, 11, '#F94543', 0, 1], [3.5, 13.5, 17.5, 12, '#FABC12', 0, .46]] },
    grok: { p: new Path2D('M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815'), fill: '#ffffff', even: true },
  };
  const AI_NAME = { claude: 'Claude', chatgpt: 'ChatGPT', gemini: 'Gemini', grok: 'Grok' };
  function drawLogo(key, cx, cy, size, alpha = 1) {
    const L = LOGO[key]; if (!L || alpha <= 0) return;
    ctx.save(); ctx.translate(cx - size / 2, cy - size / 2); ctx.scale(size / 24, size / 24); ctx.globalAlpha *= alpha;
    ctx.fillStyle = L.fill; ctx.fill(L.p, L.even ? 'evenodd' : 'nonzero');
    if (L.grads) for (const [x1, y1, x2, y2, col, o0, o1] of L.grads) {
      const g = ctx.createLinearGradient(x1, y1, x2, y2);
      g.addColorStop(o0, col); g.addColorStop(o1, col + '00'); ctx.fillStyle = g; ctx.fill(L.p);
    }
    ctx.restore();
  }

  // ---- fibres + chips -------------------------------------------------------
  const R1 = rng(41);
  const CHIPS = [
    ['tab', 'Q3 roadmap – Notes'], ['mail', 'Sarah  Re: invoice 8841'], ['cal', 'Standup  9:30'], ['code', 'await sync(feed.id)'],
    ['wave', ''], ['thumb', ''], ['tab', 'Inbox (214)'], ['cal', 'Investor call  14:00'], ['code', 'git push origin main'],
    ['mail', 'Mike  Quick question?'], ['tab', 'Design file – Pricing v3'], ['wave', ''], ['code', 'SELECT * FROM tasks'],
    ['cal', 'Dentist  16:15'], ['thumb', ''], ['mail', 'Booking link  New booking'], ['tab', 'Payments dashboard'], ['code', 'if (!ok) retry(3)'],
  ];
  // the four AIs ride the stream too, spread between the other chips
  [['ai', 'claude'], ['ai', 'chatgpt'], ['ai', 'gemini'], ['ai', 'grok']].forEach((c, i) => CHIPS.splice(2 + i * 5, 0, c));
  const NF = 74;
  const fibres = [];
  for (let i = 0; i < NF; i++) {
    const a = (i + 0.5 + (R1() - .5) * .8) / NF * ACROSS;
    const f = { a, wob: (R1() - .5) * ACROSS * .28, amp1: (R1() - .5) * 150, amp2: (R1() - .5) * 190, ph: R1() * 6.28,
      alpha: .10 + R1() * .12, w: .8 + R1() * .6, chip: null };
    fibres.push(f);
  }
  // spread chip carriers evenly across the width
  CHIPS.forEach((c, j) => {
    const f = fibres[Math.floor((j + .5) / CHIPS.length * NF)];
    f.chip = { kind: c[0], text: c[1], speed: .125 + R1() * .06, phase: R1(), rot: (R1() - .5) * .10, sc: .92 + R1() * .2, wavePh: R1() * 9 };
    f.alpha = .34; f.w = 1.3;
  });
  // convergence k(t): 0 = parallel fibres, 1 = all at the core
  const kOf = t => eio(ramp(t, 3.4, 6.0));
  function fibreCurve(f, t, core) {
    const k = kOf(t);
    const s = pt(-70, f.a);
    const far = pt(ALONG + 90, f.a + f.wob);
    const rel = (f.a - ACROSS / 2) * 0.10;
    const ring = [core[0] + (horiz ? -CORE_R * .62 : rel), core[1] + (horiz ? rel : -CORE_R * .62)];
    const e = mix(far, ring, k);
    const sway = Math.sin(t * .55 + f.ph);
    const perpAt = (p, amp) => horiz ? [0, amp * (1 - .5 * k) * (.7 + .3 * sway)] : [amp * (1 - .5 * k) * (.7 + .3 * sway), 0];
    let c1 = mix(s, e, .36), c2 = mix(s, e, .72);
    const o1 = perpAt(0, f.amp1), o2 = perpAt(0, f.amp2);
    c1 = [c1[0] + o1[0], c1[1] + o1[1]]; c2 = [c2[0] + o2[0], c2[1] + o2[1]];
    // pull the late control point onto the core's axis as k grows
    c2 = horiz ? [c2[0], lerp(c2[1], core[1], k * .75)] : [lerp(c2[0], core[0], k * .75), c2[1]];
    c1 = horiz ? [c1[0], lerp(c1[1], core[1], k * .35)] : [lerp(c1[0], core[0], k * .35), c1[1]];
    return [s, c1, c2, e];
  }
  function strokeCurve(P, alpha, w, steps = 40, upto = 1) {
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) { const p = bez(P, i / steps * upto); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
    ctx.lineWidth = w * 5; ctx.strokeStyle = `rgba(${PALE},${alpha * .22})`; ctx.stroke();
    ctx.lineWidth = w; ctx.strokeStyle = `rgba(${PALE},${alpha})`; ctx.stroke();
  }

  // ---- chips ----------------------------------------------------------------
  function chipBox(kind, text, sc) {
    ctx.font = `500 ${22 * S * sc}px ${kind === 'code' ? MONO : FONT}`;
    const tw = ctx.measureText(text).width;
    if (kind === 'ai') return [64 * S * sc, 64 * S * sc];
    if (kind === 'wave') return [170 * S * sc, 48 * S * sc];
    if (kind === 'thumb') return [84 * S * sc, 60 * S * sc];
    if (kind === 'tab') return [tw + 78 * S * sc, 44 * S * sc];
    if (kind === 'mail') return [tw + 78 * S * sc, 50 * S * sc];
    return [tw + 54 * S * sc, 46 * S * sc];
  }
  function drawChip(ch, x, y, alpha, sc, t) {
    const { kind, text } = ch;
    const [w, h] = chipBox(kind, text, sc);
    const u = S * sc;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ch.rot); ctx.globalAlpha = alpha;
    ctx.translate(-w / 2, -h / 2);
    rr(0, 0, w, h, kind === 'thumb' ? 10 * u : kind === 'ai' ? h / 2 : h / 2.6);
    ctx.fillStyle = kind === 'code' ? 'rgba(10,12,18,.92)' : 'rgba(14,17,26,.92)'; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.stroke();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const my = h / 2 + 1;
    if (kind === 'tab') {
      ctx.fillStyle = 'rgba(255,255,255,.34)'; ctx.beginPath(); ctx.arc(22 * u, my, 6 * u, 0, 7); ctx.fill();
      ctx.font = `500 ${22 * u}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.fillText(text, 38 * u, my);
      ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(w - 26 * u, my - 5 * u); ctx.lineTo(w - 16 * u, my + 5 * u); ctx.moveTo(w - 16 * u, my - 5 * u); ctx.lineTo(w - 26 * u, my + 5 * u); ctx.stroke();
    } else if (kind === 'mail') {
      ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.arc(26 * u, my, 11 * u, 0, 7); ctx.fill();
      const [nm, rest] = text.split('  ');
      ctx.font = `600 ${22 * u}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillText(nm, 48 * u, my);
      const nw = ctx.measureText(nm + '  ').width;
      ctx.font = `400 ${22 * u}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillText(rest, 48 * u + nw, my);
    } else if (kind === 'cal') {
      ctx.fillStyle = `rgba(${PALE},.85)`; rr(14 * u, 10 * u, 4 * u, h - 20 * u, 2); ctx.fill();
      const [nm, rest] = text.split('  ');
      ctx.font = `600 ${22 * u}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.fillText(nm, 28 * u, my);
      const nw = ctx.measureText(nm + '  ').width;
      ctx.font = `400 ${22 * u}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillText(rest, 28 * u + nw, my);
    } else if (kind === 'code') {
      ctx.font = `500 ${22 * u}px ${MONO}`; ctx.fillStyle = 'rgba(190,215,255,.85)'; ctx.fillText(text, 27 * u, my);
    } else if (kind === 'wave') {
      const n = 22;
      for (let i = 0; i < n; i++) {
        const a = Math.abs(Math.sin(i * .62 + ch.wavePh + t * 2.2)) * .75 + .25;
        const bh = (h - 18 * u) * a * (.55 + .45 * Math.sin(i * .21 + 1));
        ctx.fillStyle = `rgba(255,255,255,${.35 + a * .45})`;
        rr(16 * u + i * 6.7 * u, (h - bh) / 2, 3.4 * u, bh, 1.7); ctx.fill();
      }
    } else if (kind === 'ai') {
      drawLogo(text, w / 2, h / 2, 34 * u);
    } else if (kind === 'thumb') {
      ctx.save(); rr(6 * u, 6 * u, w - 12 * u, h - 12 * u, 6 * u); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.beginPath(); ctx.moveTo(6 * u, h - 6 * u); ctx.lineTo(w * .38, h * .38); ctx.lineTo(w * .62, h * .66); ctx.lineTo(w * .78, h * .5); ctx.lineTo(w - 6 * u, h - 6 * u); ctx.fill();
      ctx.beginPath(); ctx.arc(w * .72, h * .3, 5 * u, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // ---- network core ---------------------------------------------------------
  const R2 = rng(7);
  const nodes = [];
  for (let i = 0; i < 130; i++) {
    const ang = R2() * 6.283, rad = Math.pow(R2(), .7) * CORE_R;
    const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad * (SQ ? .92 : .95);
    const side = horiz ? -x : -y;                       // nodes toward the source side appear first
    nodes.push({ x, y, r: 2.2 + R2() * 3.6, ph: R2() * 6.28, t0: 4.2 + (side / CORE_R * .5 + .5) * 1.5 + R2() * .25 });
  }
  const edges = [];
  nodes.forEach((n, i) => {
    nodes.map((m, j) => [Math.hypot(n.x - m.x, n.y - m.y), j]).filter(d => d[1] !== i).sort((a, b) => a[0] - b[0]).slice(0, 4)
      .forEach(([d, j]) => { if (!edges.some(e => (e[0] === i && e[1] === j) || (e[0] === j && e[1] === i))) edges.push([i, j, R2()]); });
  });
  // glow sprite
  const spr = document.createElement('canvas'); spr.width = spr.height = 64;
  { const g = spr.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(255,255,255,1)`); gr.addColorStop(.18, `rgba(${PALE},.55)`); gr.addColorStop(1, `rgba(${PALE},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
  const MARK = new Path2D('M300 768 L300 296 Q300 280 316 280 L438 280 Q452 280 453 294 L455 350 C494 298 552 264 624 264 C718 264 758 345 770 428 L824 744 Q827 768 802 768 L692 768 Q674 768 672 752 L624 470 C617 420 594 398 556 398 C516 398 478 416 455 446 L455 752 Q455 768 439 768 L316 768 Q300 768 300 752 Z');
  function drawMark(cx, cy, size, alpha, col = '255,255,255') {
    ctx.save(); ctx.translate(cx, cy); const sc = size / 527; ctx.scale(sc, sc); ctx.translate(-563.5, -516);
    ctx.globalAlpha = alpha; ctx.fillStyle = `rgb(${col})`; ctx.fill(MARK); ctx.restore();
  }
  function drawCore(t, c, sc, alpha) {
    if (alpha <= 0) return;
    ctx.save(); ctx.translate(c[0], c[1]); ctx.scale(sc, sc); ctx.globalAlpha = alpha;
    // halo
    const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, CORE_R * 1.5);
    const hv = ramp(t, 4.4, 6.4);
    hg.addColorStop(0, `rgba(${PALE},${.16 * hv})`); hg.addColorStop(1, `rgba(${PALE},0)`);
    ctx.fillStyle = hg; ctx.fillRect(-CORE_R * 1.6, -CORE_R * 1.6, CORE_R * 3.2, CORE_R * 3.2);
    const P = nodes.map(n => [n.x + Math.sin(t * .7 + n.ph) * 4, n.y + Math.cos(t * .6 + n.ph) * 4]);
    edges.forEach(([i, j, r]) => {
      const a = Math.min(ramp(t, nodes[i].t0, nodes[i].t0 + .6), ramp(t, nodes[j].t0, nodes[j].t0 + .6));
      if (a <= 0) return;
      ctx.beginPath(); ctx.moveTo(P[i][0], P[i][1]); ctx.lineTo(P[j][0], P[j][1]);
      ctx.lineWidth = 1.2; ctx.strokeStyle = `rgba(${PALE},${.5 * a})`; ctx.stroke();
      if (t > 5.4) {                                    // travelling signal
        const p = (t * .55 + r * 3) % 1, a2 = Math.sin(p * Math.PI) * a * .95;
        const x = lerp(P[i][0], P[j][0], p), y = lerp(P[i][1], P[j][1], p);
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha * a2; ctx.drawImage(spr, x - 9, y - 9, 18, 18);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha;
      }
    });
    ctx.globalCompositeOperation = 'lighter';
    nodes.forEach((n, i) => {
      const a = back(ramp(t, n.t0, n.t0 + .5)); if (a <= 0) return;
      const r = n.r * (1 + .15 * Math.sin(t * 1.6 + n.ph)) * a;
      ctx.globalAlpha = alpha * clamp(a) * .85; ctx.drawImage(spr, P[i][0] - r * 2.6, P[i][1] - r * 2.6, r * 5.2, r * 5.2);
    });
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha;
    // mark
    const mk = ramp(t, 5.5, 6.6);
    if (mk > 0) {
      const m = eo5(mk), ms = (SQ ? 86 : 104) * (.82 + .18 * m);
      ctx.beginPath(); ctx.arc(0, 0, ms * .92, 0, 7); ctx.fillStyle = `rgba(5,6,10,${.92 * m})`; ctx.fill();
      ctx.lineWidth = 1.3; ctx.strokeStyle = `rgba(${PALE},${.45 * m})`; ctx.stroke();
      drawMark(0, 0, ms * .86, m);
    }
    ctx.restore();
  }

  // ---- task cards -----------------------------------------------------------
  const CARDS = [
    { title: 'Draft launch thread', meta: 'created by Claude', t0: 7.2, chips: [[7.65, 'claude']], st: [[7.65, 'claimed'], [9.0, 'done ✓']], done: 9.0 },
    { title: 'Triage 47 emails', meta: 'created by ChatGPT', t0: 7.85, chips: [[8.3, 'chatgpt']], st: [[8.3, 'claimed'], [9.55, 'done ✓']], done: 9.55 },
    { title: 'Send Acme invoice', meta: 'created by Claude', t0: 8.5, chips: [[8.95, 'gemini'], [9.8, 'chatgpt']], st: [[8.95, 'claimed'], [9.8, 'handed off'], [10.35, 'done ✓']], done: 10.35 },
    { title: 'Publish release notes', meta: 'created by Gemini', t0: 9.15, chips: [[9.5, 'grok']], st: [[9.5, 'claimed']], amber: 9.85, tap: 10.5, green: 10.6, done: 10.95 },
  ];
  CARDS.forEach((c, i) => { c.x = cards.x; c.y = cards.y + i * (cards.h + cards.gap); c.dotY = c.y + cards.h / 2; });
  const OUT_FROM = [core1[0] + (SQ ? CORE_R * CORE_S1 * .85 : 0), core1[1] + (SQ ? 0 : CORE_R * CORE_S1 * .85)];

  function outCurve(c) {
    const D = [c.x - 2, c.dotY];
    if (SQ) return [OUT_FROM, [OUT_FROM[0] + 90, OUT_FROM[1]], [D[0] - 110, D[1]], D];
    const gx = c.x - 36; return [OUT_FROM, [OUT_FROM[0] - 430, OUT_FROM[1] + 60], [gx, D[1] - 250], [gx, D[1]]];
  }
  function pill(text, x, y, fs, rgb, fillA, strokeA, textA, align = 'right', scale = 1, logo = null) {
    ctx.font = `600 ${fs}px ${FONT}`; const tw = ctx.measureText(text).width, li = logo ? fs * 1.3 : 0, pw = tw + fs * 1.1 + li, ph = fs * 1.85;
    const px = align === 'right' ? x - pw : x;
    ctx.save(); ctx.translate(px + pw / 2, y + ph / 2); ctx.scale(scale, scale); ctx.translate(-pw / 2, -ph / 2);
    rr(0, 0, pw, ph, ph / 2); ctx.fillStyle = `rgba(${rgb},${fillA})`; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = `rgba(${rgb},${strokeA})`; ctx.stroke();
    if (logo) drawLogo(logo, fs * .55 + fs * .5, ph / 2, fs * 1.0);
    ctx.fillStyle = `rgba(${rgb},${textA})`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, pw / 2 + li / 2, ph / 2 + 1); ctx.restore();
    return { cx: px + pw / 2, cy: y + ph / 2, w: pw, h: ph };
  }
  function cur(list, t) { let r = null; for (const e of list) if (t >= e[0]) r = e; return r; }

  let tapInfo = null;
  function drawCard(c, t, g) {
    const ap = ramp(t, c.t0, c.t0 + .55); if (ap <= 0 || g <= 0) return;
    const a = eo3(ap) * g;
    const w = cards.w, h = cards.h, pad = 26 * S;
    const amber = c.amber && t >= c.amber && !(c.green && t >= c.green);
    const green = c.green && t >= c.green;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(c.x, c.y + 26 * (1 - eo3(ap)));
    rr(0, 0, w, h, 20 * S);
    const tint = green ? GREEN : amber ? AMBER : '255,255,255';
    const gk = green ? ramp(t, c.green, c.green + .5) : 1;
    ctx.fillStyle = '#0c0e14'; ctx.fill(); ctx.fillStyle = (amber || green) ? `rgba(${tint},${.07 * (green ? gk : 1)})` : 'rgba(255,255,255,.045)'; ctx.fill();
    ctx.lineWidth = 1.4; ctx.strokeStyle = (amber || green) ? `rgba(${tint},${green ? lerp(.6, .45, gk) : .6})` : 'rgba(255,255,255,.13)'; ctx.stroke();
    // check circle
    const done = c.done && t >= c.done, dk = done ? back(ramp(t, c.done, c.done + .4)) : 0;
    const cr = 17 * S, cx = pad + cr, cy = h * .36;
    ctx.beginPath(); ctx.arc(cx, cy, cr, 0, 7); ctx.lineWidth = 2; ctx.strokeStyle = `rgba(${green || (done && c.green) ? GREEN : '255,255,255'},${done ? .9 : .38})`; ctx.stroke();
    if (done) {
      ctx.beginPath(); ctx.arc(cx, cy, cr * clamp(dk), 0, 7); ctx.fillStyle = `rgba(${c.green ? GREEN : '255,255,255'},.92)`; ctx.fill();
      ctx.strokeStyle = 'rgba(5,6,10,.95)'; ctx.lineWidth = 2.6 * S; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
      ctx.moveTo(cx - cr * .38, cy + cr * .02); ctx.lineTo(cx - cr * .08, cy + cr * .32); ctx.lineTo(cx + cr * .42, cy - cr * .3); ctx.stroke();
    }
    // title + meta
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.font = `600 ${30 * S}px ${FONT}`; ctx.fillStyle = `rgba(255,255,255,${done && !c.green ? .55 : .95})`; ctx.fillText(c.title, cx + cr + 20 * S, cy);
    ctx.font = `400 ${19.5 * S}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.46)'; ctx.fillText(c.meta, cx + cr + 20 * S, h * .73);
    // agent chip + status
    const ch = cur(c.chips, t);
    const rx = w - pad;
    const GAP = Math.max(12, 16 * S);                  // >= 12px between neighbours
    const chipBottom = h * .36 - 17 * S + 21 * S * 1.85;
    const actY = Math.max(h * .73 - 17 * S, chipBottom + GAP);
    if (ch) {
      const pop = back(ramp(t, ch[0], ch[0] + .35));
      const pr = pill(AI_NAME[ch[1]], rx, h * .36 - 17 * S, 21 * S, '255,255,255', .09, .28, .86, 'right', clamp(pop, 0, 1.08), ch[1]);
      const stt = cur(c.st, t);
      if (stt && !amber && !green) {
        const sa = ramp(t, stt[0] + .08, stt[0] + .4);
        const isDone = stt[1].includes('done');
        ctx.font = `500 ${19.5 * S}px ${FONT}`; ctx.textAlign = 'right';
        ctx.fillStyle = `rgba(255,255,255,${(isDone ? .82 : .5) * sa})`; ctx.fillText(stt[1], rx, h * .73);
      }
      if (amber) {
        const k = back(ramp(t, c.amber, c.amber + .4));
        // "Needs you" is a status; "Approve" is its own button, GAP apart.
        const pb = pill('Approve', rx, actY, 20 * S, AMBER, .14, .85, 1, 'right', clamp(k, 0, 1.05));
        ctx.save(); ctx.globalAlpha = a * clamp(k);
        ctx.font = `600 ${20 * S}px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(${AMBER},1)`; ctx.fillText('Needs you', pb.cx - pb.w / 2 - GAP, pb.cy + 1);
        ctx.restore();
        tapInfo = { x: c.x + pb.cx, y: c.y + pb.cy + 26 * (1 - eo3(ap)), c };
        c.approveAt = { x: c.x + pb.cx, y: c.y + pb.cy };
      }
      if (green) {
        const k = back(ramp(t, c.green, c.green + .4));
        pill('Approved ✓', rx, actY, 20 * S, GREEN, .14, .85, 1, 'right', clamp(k, 0, 1.05));
      }
    }
    ctx.restore();
  }

  // ---- end card -------------------------------------------------------------
  function fitText(text, fs, maxW, weight = 600) { ctx.font = `${weight} ${fs}px ${FONT}`; const w = ctx.measureText(text).width; return w > maxW ? fs * maxW / w : fs; }
  function drawEnd(t) {
    const E = SQ
      ? { markY: 280, mark: 78, l1: 420, l2: 510, fs: 74, sub: 630, subFs: 33, logos: 715, logo: 44, url: 800, urlFs: 29 }
      : { markY: 660, mark: 112, l1: 810, l2: 930, fs: 104, sub: 1110, subFs: 44, logos: 1225, logo: 62, url: 1340, urlFs: 38 };
    const maxW = W - 150;
    const fs = Math.min(fitText('One shared brain.', E.fs, maxW), fitText('Your AI agents.', E.fs, maxW));
    const line = (txt, y, a0, alpha, size, weight, ls = 0) => {
      const k = eo5(ramp(t, a0, a0 + .85)); if (k <= 0) return;
      ctx.save(); ctx.globalAlpha = k * alpha; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `${weight} ${size}px ${FONT}`; ctx.letterSpacing = ls + 'px'; ctx.fillStyle = '#fff';
      ctx.filter = `blur(${(1 - k) * 8}px)`;
      ctx.fillText(txt, W / 2, y + (1 - k) * 26); ctx.restore();
    };
    const mk = eo5(ramp(t, 11.3, 12.1));
    if (mk > 0) {
      const gg = ctx.createRadialGradient(W / 2, E.markY, 0, W / 2, E.markY, E.mark * 2.6);
      gg.addColorStop(0, `rgba(${PALE},${.2 * mk})`); gg.addColorStop(1, `rgba(${PALE},0)`);
      ctx.fillStyle = gg; ctx.fillRect(0, E.markY - E.mark * 3, W, E.mark * 6);
      drawMark(W / 2, E.markY, E.mark * (.9 + .1 * mk), mk);
    }
    line('Your AI agents.', E.l1, 11.5, .6, fs, 600, -fs * .02);
    line('One shared brain.', E.l2, 11.95, 1, fs, 600, -fs * .02);
    line('Needt Agents — free to start', E.sub, 12.75, .72, E.subFs, 500);
    // the four AIs that plug in, one after another
    ['claude', 'chatgpt', 'gemini', 'grok'].forEach((k, i) => {
      const a0 = 13.0 + i * .1, kk = eo5(ramp(t, a0, a0 + .6)); if (kk <= 0) return;
      const step = E.logo * 1.9, x = W / 2 + (i - 1.5) * step;
      ctx.save(); ctx.globalAlpha = kk; drawLogo(k, x, E.logos + (1 - kk) * 18, E.logo); ctx.restore();
    });
    line('use.needt.app', E.url, 13.45, .5, E.urlFs, 500, 0.5);
  }

  // ---- frame ----------------------------------------------------------------
  function draw(t) {
    tapInfo = null;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, W, H);
    // faint ambient light that follows the core
    const cm = mix(core0, core1, eio(ramp(t, 7.0, 8.3)));
    const amb = ctx.createRadialGradient(cm[0], cm[1], 0, cm[0], cm[1], Math.max(W, H) * .6);
    amb.addColorStop(0, `rgba(${PALE},${.07 * ramp(t, 3.5, 6)})`); amb.addColorStop(1, `rgba(${PALE},0)`);
    ctx.fillStyle = amb; ctx.fillRect(0, 0, W, H);

    const g = 1 - eo3(ramp(t, 10.95, 11.55));                 // working scene fades out for the end card
    const intro = ramp(t, 0, .8);
    const fibA = (1 - ramp(t, 6.3, 7.3)) * intro;
    // fibres
    if (fibA > 0) {
      ctx.globalCompositeOperation = 'lighter';
      for (const f of fibres) strokeCurve(fibreCurve(f, t, core0), f.alpha * fibA, f.w);
      ctx.globalCompositeOperation = 'source-over';
      // chips
      const chipA = intro * (1 - ramp(t, 6.0, 6.8));
      if (chipA > 0) for (const f of fibres) if (f.chip) {
        const ch = f.chip, P = fibreCurve(f, t, core0);
        let p = (t * ch.speed + ch.phase) % 1;
        const [x, y] = bez(P, p);
        const edge = Math.min(ramp(p, 0, .08), 1 - ramp(p, .84, .985));
        const absorb = kOf(t) > .15 ? 1 - ramp(p, .8, .98) * .25 : 1;
        const sc = ch.sc * (.55 + .45 * clamp(edge)) * absorb;
        if (edge > 0.02) drawChip(ch, x, y, chipA * clamp(edge) * .95, sc, t);
      }
    }
    // core
    const mv = eio(ramp(t, 7.0, 8.3));
    drawCore(t, mix(core0, core1, mv), lerp(1, CORE_S1, mv), g);
    // output lines
    ctx.globalCompositeOperation = 'lighter';
    for (const c of CARDS) {
      const k = eo3(ramp(t, c.t0 - .25, c.t0 + .55)); if (k <= 0) continue;
      const P = outCurve(c);
      strokeCurve(P, .55 * g, 1.4, 48, k);
      // a dot of light travelling along it
      const run = ((t - c.t0) * .45 + CARDS.indexOf(c) * .23) % 1;
      if (t > c.t0 + .4) { const q = bez(P, run); ctx.globalAlpha = g * Math.sin(run * Math.PI) * .9; ctx.drawImage(spr, q[0] - 11, q[1] - 11, 22, 22); ctx.globalAlpha = 1; }
      const q0 = bez(P, k); ctx.globalAlpha = g * .9; ctx.drawImage(spr, q0[0] - 9, q0[1] - 9, 18, 18); ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const c of CARDS) drawCard(c, t, g);
    // tap: finger dot glides in, presses, ripple
    const c4 = CARDS[3];
    if (c4.amber && t > 10.0 && t < 11.3 && tapInfo) {
      const approach = eio(ramp(t, 10.0, 10.5));
      const sx = tapInfo.x + 90 * S * (1 - approach), sy = tapInfo.y + 90 * S * (1 - approach);
      const press = t >= c4.tap ? Math.sin(clamp((t - c4.tap) / .35) * Math.PI) : 0;
      const fa = (1 - ramp(t, 10.95, 11.25));
      ctx.save(); ctx.globalAlpha = fa * g;
      ctx.beginPath(); ctx.arc(sx, sy, (16 - 4 * press) * S, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.stroke();
      if (t >= c4.tap) {
        for (let r = 0; r < 2; r++) {
          const k = ramp(t, c4.tap + r * .12, c4.tap + r * .12 + .7);
          if (k > 0 && k < 1) { ctx.beginPath(); ctx.arc(tapInfo.x, tapInfo.y, (14 + 70 * eo3(k)) * S, 0, 7); ctx.lineWidth = 2.2; ctx.strokeStyle = `rgba(255,255,255,${.6 * (1 - k)})`; ctx.stroke(); }
        }
      }
      ctx.restore();
    } else if (c4.tap && t > 10.5 && t < 11.3) {
      // after approve the pill is green; keep the ripple alive using stored geometry
      const cy = c4.approveAt ? c4.approveAt.y : c4.y + cards.h * .73, ppx = c4.approveAt ? c4.approveAt.x : c4.x + cards.w - 26 * S - 60 * S;
      for (let r = 0; r < 2; r++) {
        const k = ramp(t, c4.tap + r * .12, c4.tap + r * .12 + .7);
        if (k > 0 && k < 1) { ctx.beginPath(); ctx.arc(ppx, cy, (14 + 70 * eo3(k)) * S, 0, 7); ctx.lineWidth = 2.2; ctx.strokeStyle = `rgba(255,255,255,${.6 * (1 - k)})`; ctx.stroke(); }
      }
    }
    drawEnd(t);
    // intro fade from black
    if (t < .5) { ctx.fillStyle = `rgba(5,6,10,${1 - t / .5})`; ctx.fillRect(0, 0, W, H); }
  }

  window.DUR = DUR; window.W = W; window.H = H;
  window.seek = t => { draw(t); return true; };
  (document.fonts ? Promise.all([document.fonts.load('600 30px Inter'), document.fonts.load('500 22px Inter'), document.fonts.load('400 22px Inter')]) : Promise.resolve())
    .then(() => { draw(0); window.ready = true; });
})();
